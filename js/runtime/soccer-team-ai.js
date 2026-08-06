/* =========================================================
   LOT KING - Soccer team AI

   Tiered AI in the sense of Mat Buckland's "Simple Soccer" (Programming Game AI
   by Example, ch. 4): a TEAM layer decides the phase of play, the defensive line
   and who does what, and a PLAYER layer turns one duty into one movement
   command. The positional model itself lives in js/runtime/soccer-tactics.js —
   this module never invents a formation number or a tactical constant.

   Performance contract (22 pawns + ball at 60 FPS on an integrated GPU):
   - decisions run on a FIXED tick (default 12 Hz), never per frame;
   - each tick re-decides only a SLICE of the squad (round-robin budget), with
     the duty-critical players (keeper, ball carrier, first presser) always in;
   - players far from the ball drop to a cheaper behaviour LOD and are decided
     one tick in N;
   - the per-frame pass only steers headings and writes into the movement
     command object the Pawn already owns: no allocation in the frame loop.

   Reading order: dependencies -> tuning tables -> duty table -> roster ->
   world sampling -> team state -> duty assignment -> duty solvers -> command
   emission -> player switching -> driver.
   ========================================================= */
(function(){
'use strict';

/* ---------------------------------------------------------
   01 Dependencies and shared helpers
   --------------------------------------------------------- */

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;

function tactics(){
  const module = root.LK_RUNTIME_SOCCER_TACTICS;
  if(!module) throw new Error('soccer-team-ai requires js/runtime/soccer-tactics.js to be loaded first');
  return module;
}
function finite(value, fallback){
  const number = Number(value);
  return Number.isFinite(number) ? number : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function clamp01(value){ return clamp(value, 0, 1); }
function text(value, fallback){
  const string = value == null ? '' : String(value).trim();
  return string || (fallback == null ? '' : String(fallback));
}
function wrapAngle(value){
  let angle = value;
  while(angle > Math.PI) angle -= Math.PI * 2;
  while(angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

/* ---------------------------------------------------------
   02 Tuning tables
   Every repeated literal in this module is named here.
   --------------------------------------------------------- */

const BUDGET = Object.freeze({
  tickHz:12,              // team decisions per second
  maxCatchUpTicks:2,      // a stalled frame never replays the whole backlog
  playersPerTick:6,       // round-robin slice of the 22-player squad
  farLodEveryNTicks:3,    // players far from the ball think one tick in three
  rosterRescanSeconds:1.5,
});

const RANGE = Object.freeze({
  // All distances in metres unless the name says "depth"/"spread".
  controlRadius:1.6,      // a carrier owns the ball inside this radius
  contestRadius:3.2,      // close enough to fight for a loose ball
  pressRadius:26,         // first presser only leaves shape inside this
  markRadius:18,          // a marker only picks up opponents inside this
  shootRadius:24,         // AI considers a shot inside this
  passRadiusMin:6, passRadiusMax:34,
  tackleRadius:1.9,
  keeperSweepRadius:14,   // keeper leaves the line for a ball this close
  lodNearRadius:22,       // full behaviour inside this
  lodFarRadius:44,        // beyond this, shape-holding only
  arriveRadius:1.1,       // stop jostling once this close to the target
});

const EFFORT = Object.freeze({
  // The Character Movement controller reads (magnitude, sprint): walk gait tops
  // out at walkSpeed, so anything above a stroll must ask for sprint.
  walkBand:.25,           // effort <= walkBand stays in the walk gait
  idle:0, hold:.18, jog:.55, run:.78, sprint:1,
  // Stamina: draining is proportional to effort above a jog, recovery is flat.
  drainPerSecond:.028, recoverPerSecond:.016, minEffortScale:.68,
});

const DECISION = Object.freeze({
  // On-ball choice weights, evaluated in the order of DUTIES below.
  shootConfidence:.42,    // minimum shot score before an AI pulls the trigger
  passConfidence:.34,     // minimum support score before an AI passes
  passCooldown:.55,       // seconds between two AI passes from the same player
  tackleCooldown:1.1,
  dribbleLookahead:.08,   // normalised depth the carrier aims ahead of itself
  offsideMargin:.012,     // attackers hold this much behind the offside line
  keeperLineDepth:.035,   // resting keeper depth
  keeperSweepDepth:.16,   // maximum sweeper depth
});

const DIFFICULTY_SCALE = Object.freeze({
  // Multiplies reaction sharpness and effort. Mirrors gameplay-difficulty.js
  // but stays local so this module has no hard dependency on it.
  effort:Object.freeze({min:.72, max:1}),
  decisionNoise:Object.freeze({min:.22, max:.02}),
});

/* ---------------------------------------------------------
   03 Duty table
   The jobs a player can hold, listed in ASSIGNMENT order: the
   first duty that claims a player wins, so the table doubles as
   the priority list. `onBall` duties are the only ones allowed
   to touch the ball.
   --------------------------------------------------------- */

const DUTIES = Object.freeze({
  keeper      :Object.freeze({id:'keeper'      , order:0, onBall:false, effort:EFFORT.jog}),
  carrier     :Object.freeze({id:'carrier'     , order:1, onBall:true , effort:EFFORT.run}),
  firstPress  :Object.freeze({id:'firstPress'  , order:2, onBall:true , effort:EFFORT.sprint}),
  cover       :Object.freeze({id:'cover'       , order:3, onBall:false, effort:EFFORT.run}),
  marker      :Object.freeze({id:'marker'      , order:4, onBall:false, effort:EFFORT.jog}),
  support     :Object.freeze({id:'support'     , order:5, onBall:false, effort:EFFORT.run}),
  shape       :Object.freeze({id:'shape'       , order:6, onBall:false, effort:EFFORT.jog}),
});
const DUTY_IDS = Object.freeze(Object.keys(DUTIES).sort((a, b) => DUTIES[a].order - DUTIES[b].order));

function duty(id){
  const found = DUTIES[text(id)];
  if(!found) throw new Error('soccer-team-ai: unknown duty "' + id + '" (known: ' + DUTY_IDS.join(', ') + ')');
  return found;
}

/* ---------------------------------------------------------
   04 Roster
   One record per AI player, discovered from the Pawn registry.
   Records are stable across rescans so per-player state (stamina,
   cooldowns, cached targets) survives; the scratch vectors inside
   them are what keeps the frame loop allocation-free.
   --------------------------------------------------------- */

function createRecord(pawn, descriptor){
  const model = tactics();
  const roleId = text(descriptor.role, 'CM').toUpperCase();
  const roleDef = model.role(roleId);
  return {
    id:pawn.id,
    pawn,
    team:model.side(descriptor.team),
    slot:Math.max(0, Math.round(finite(descriptor.slot, 0))),
    role:roleDef.id,
    line:roleDef.line,
    attributes:readAttributes(descriptor, roleDef),
    // live state
    duty:'shape',
    stamina:1,
    effort:EFFORT.hold,
    dirX:0, dirZ:1,
    faceHeading:0,
    sprint:false,
    passCooldown:0,
    tackleCooldown:0,
    lastTickDecided:-1,
    lod:'near',
    // scratch (never reallocated)
    world:{x:0, y:0, z:0, heading:0},
    normalized:{spread:0, depth:0},
    target:{spread:0, depth:0},
    targetWorld:{x:0, y:0, z:0, heading:0},
  };
}

function readAttributes(descriptor, roleDef){
  const model = tactics(), source = descriptor && descriptor.attributes || {};
  const out = {};
  model.ATTRIBUTE_KEYS.forEach(key => { out[key] = clamp01(source[key] == null ? roleDef[key] : source[key]); });
  return out;
}

/** The authored descriptor a level template writes onto the Logic Element. */
function descriptorOf(pawn){
  const owner = pawn && pawn.owner;
  const graph = owner && owner.userData && owner.userData.logicGraph;
  return graph && graph.soccerTeamPlayer || null;
}

/* ---------------------------------------------------------
   05 World sampling
   One pass over the roster per tick fills the normalised
   positions everything else reads. No Three.js types are used so
   the module runs headless in tests.
   --------------------------------------------------------- */

function samplePositions(state){
  const model = tactics(), pitch = state.config.pitch;
  for(let index = 0; index < state.roster.length; index++){
    const record = state.roster[index], owner = record.pawn.owner;
    if(!owner || !owner.position) continue;
    record.world.x = finite(owner.position.x);
    record.world.z = finite(owner.position.z);
    record.world.heading = owner.rotation ? finite(owner.rotation.y) : 0;
    model.toNormalized(record.world.x, record.world.z, record.team, pitch, record.normalized);
  }
}

function sampleBall(state){
  const model = tactics(), ball = state.ball, system = state.GAME && state.GAME.systems && state.GAME.systems.soccerBall;
  ball.present = false;
  if(!system || !system.list || !system.state) return;
  const ids = system.list();
  for(let index = 0; index < ids.length; index++){
    const snapshot = system.state(ids[index]);
    if(!snapshot || !snapshot.position) continue;
    ball.present = true;
    ball.id = snapshot.id;
    ball.x = finite(snapshot.position.x);
    ball.y = finite(snapshot.position.y);
    ball.z = finite(snapshot.position.z);
    ball.inFlight = snapshot.inFlight === true;
    ball.speed = Math.hypot(finite(snapshot.velocity && snapshot.velocity.x), finite(snapshot.velocity && snapshot.velocity.z));
    break;
  }
  if(!ball.present) return;
  model.toNormalized(ball.x, ball.z, 'home', state.config.pitch, ball.homeFrame);
  model.toNormalized(ball.x, ball.z, 'away', state.config.pitch, ball.awayFrame);
}

function ballFrame(state, team){ return team === 'home' ? state.ball.homeFrame : state.ball.awayFrame; }

function distanceToBall(state, record){
  if(!state.ball.present) return Infinity;
  const dx = record.world.x - state.ball.x, dz = record.world.z - state.ball.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/* ---------------------------------------------------------
   06 Team state
   Phase of play, ball ownership, defensive line and offside line.
   Computed once per team per tick, never per player.
   --------------------------------------------------------- */

function createTeamState(team){
  return {
    team,
    phase:'outOfPossession',
    previousOwner:null,
    lineDepth:.5,
    offsideLine:1,
    nearestId:null, nearestDistance:Infinity,
    secondId:null, secondDistance:Infinity,
    carrierId:null,
    controlledId:null,
    // Reused buffers. `opponentNormals` is the normalised view the tactics
    // solvers want; building it once per tick is what keeps the support-spot
    // and passing-lane scans free of per-candidate array allocation.
    defenderDepths:[],
    opponents:[],
    opponentNormals:[],
    tactics:null,
  };
}

function updateTeamState(state, team){
  const model = tactics(), squad = state.teams[team], other = team === 'home' ? 'away' : 'home';
  squad.tactics = state.config.teams[team].tactics;
  squad.nearestId = null; squad.nearestDistance = Infinity;
  squad.secondId = null; squad.secondDistance = Infinity;
  squad.defenderDepths.length = 0;
  squad.opponents.length = 0;
  squad.opponentNormals.length = 0;

  for(let index = 0; index < state.roster.length; index++){
    const record = state.roster[index];
    if(record.team !== team){ squad.opponents.push(record); squad.opponentNormals.push(record.normalized); continue; }
    if(record.line === 'defence') squad.defenderDepths.push(record.normalized.depth);
    const distance = distanceToBall(state, record);
    record.ballDistance = distance;
    if(record.role === 'GK') continue;
    if(distance < squad.nearestDistance){
      squad.secondId = squad.nearestId; squad.secondDistance = squad.nearestDistance;
      squad.nearestId = record.id; squad.nearestDistance = distance;
    } else if(distance < squad.secondDistance){
      squad.secondId = record.id; squad.secondDistance = distance;
    }
  }

  // Ball ownership: the closest player of either team inside the control radius.
  const owner = state.ballOwnerTeam;
  squad.phase = model.phaseFor(team, owner, state.previousBallOwnerTeam);
  const shape = model.phase(squad.phase);
  squad.lineDepth = model.defensiveLineDepth({
    lineHeight:squad.tactics.lineHeight,
    ballDepth:ballFrame(state, team).depth,
    trap:squad.tactics.offsideTrap === true && squad.phase === 'outOfPossession',
    urgency:shape.urgency,
  });
  squad.carrierId = owner === team ? squad.nearestId : null;
  // Offside line for THIS team's attackers, read off the opponent's defenders.
  const rival = state.teams[other];
  squad.offsideLine = model.offsideDepth(rival.defenderDepths, ballFrame(state, team).depth);
}

/** Which team, if any, currently owns the ball. */
function resolveBallOwner(state){
  if(!state.ball.present) return null;
  let bestId = null, bestTeam = null, best = RANGE.controlRadius;
  for(let index = 0; index < state.roster.length; index++){
    const record = state.roster[index];
    const distance = distanceToBall(state, record);
    if(distance < best){ best = distance; bestTeam = record.team; bestId = record.id; }
  }
  state.ballCarrierId = bestId;
  return bestTeam;
}

/* ---------------------------------------------------------
   07 Duty assignment
   One pass per team per tick over eleven players. Cheap enough
   to run every tick, which is what keeps duties from flickering
   when the round-robin budget skips a player.
   --------------------------------------------------------- */

function assignDuties(state, team){
  const squad = state.teams[team], inPossession = state.ballOwnerTeam === team;
  for(let index = 0; index < state.roster.length; index++){
    const record = state.roster[index];
    if(record.team !== team) continue;
    record.duty = chooseDuty(state, squad, record, inPossession);
  }
}

function chooseDuty(state, squad, record, inPossession){
  if(record.role === 'GK') return 'keeper';
  if(inPossession){
    if(record.id === squad.carrierId) return 'carrier';
    // Everyone ahead of the ball or wide of it offers; the rest holds shape.
    const ball = ballFrame(state, record.team);
    if(record.line === 'attack' || record.line === 'midfield' || record.normalized.depth > ball.depth - .06) return 'support';
    return 'shape';
  }
  if(record.id === squad.nearestId && squad.nearestDistance <= RANGE.pressRadius) return 'firstPress';
  if(record.id === squad.secondId && squad.secondDistance <= RANGE.pressRadius) return 'cover';
  if(record.line === 'defence' || record.line === 'midfield') return 'marker';
  return 'shape';
}

/* ---------------------------------------------------------
   08 Duty solvers
   Each solver writes `record.target` in the player's own team
   frame. They never move a Pawn: emission is section 09.
   --------------------------------------------------------- */

const SOLVERS = Object.freeze({
  keeper:solveKeeper,
  carrier:solveCarrier,
  firstPress:solvePress,
  cover:solveCover,
  marker:solveMarker,
  support:solveSupport,
  shape:solveShape,
});

function shapeSlot(state, record){
  const config = state.config.teams[record.team];
  return config.slots[Math.min(record.slot, config.slots.length - 1)];
}

function solveShape(state, record){
  const model = tactics(), squad = state.teams[record.team];
  model.shapeTarget(shapeSlot(state, record), {
    tactics:squad.tactics, phase:squad.phase, ball:ballFrame(state, record.team), team:record.team,
  }, record.target);
  applyLineDiscipline(state, record);
  record.effort = duty(record.duty).effort;
}

function applyLineDiscipline(state, record){
  const squad = state.teams[record.team];
  // Defenders share one line depth so the block moves as a unit.
  if(record.line === 'defence') record.target.depth = Math.min(record.target.depth, squad.lineDepth);
  // Attackers stay behind the offside line except on a transition break.
  if(record.line === 'attack' && squad.phase !== 'transitionAttack'){
    record.target.depth = Math.min(record.target.depth, squad.offsideLine - DECISION.offsideMargin);
  }
}

function solveKeeper(state, record){
  const squad = state.teams[record.team], ball = ballFrame(state, record.team);
  const sweeping = state.ball.present && record.ballDistance <= RANGE.keeperSweepRadius && state.ballOwnerTeam !== record.team;
  record.target.spread = clamp(ball.spread * .26, -.28, .28);
  record.target.depth = sweeping
    ? Math.min(DECISION.keeperSweepDepth, Math.max(DECISION.keeperLineDepth, ball.depth * .45))
    : DECISION.keeperLineDepth;
  // A high line asks the keeper to sweep higher; the shot-stopping dive itself
  // stays with the Soccer Pawn keeper AI in js/runtime/soccer-pawns.js.
  record.target.depth += squad.tactics.lineHeight * .04;
  record.effort = sweeping ? EFFORT.sprint : DUTIES.keeper.effort;
}

function solveCarrier(state, record){
  const model = tactics(), squad = state.teams[record.team];
  const ball = ballFrame(state, record.team);
  record.target.spread = clamp(record.normalized.spread * .82, -.9, .9);
  record.target.depth = Math.min(model.SHAPE.outfieldMaxDepth, record.normalized.depth + DECISION.dribbleLookahead);
  record.effort = mixEffort(EFFORT.run, EFFORT.sprint, record.attributes.pace);
  decideOnBall(state, record, squad, ball);
}

function solvePress(state, record){
  const ballNorm = ballFrame(state, record.team);
  record.target.spread = ballNorm.spread;
  record.target.depth = ballNorm.depth;
  record.effort = mixEffort(EFFORT.run, EFFORT.sprint, state.teams[record.team].tactics.pressing);
  if(record.ballDistance <= RANGE.tackleRadius && record.tackleCooldown <= 0) tryTackle(state, record);
}

function solveCover(state, record){
  const squad = state.teams[record.team], ballNorm = ballFrame(state, record.team);
  // Cover sits goal-side of the presser, offset toward the middle: FC 27's
  // "AI teammates contain from further away" rather than double-tackling.
  record.target.spread = ballNorm.spread * .55;
  record.target.depth = Math.max(0, ballNorm.depth - .07);
  record.target.depth = Math.min(record.target.depth, squad.lineDepth + .06);
  record.effort = mixEffort(EFFORT.jog, EFFORT.run, squad.tactics.pressing);
}

function solveMarker(state, record){
  const model = tactics(), squad = state.teams[record.team];
  const opponent = nearestOpponentToMark(state, squad, record);
  if(!opponent){ solveShape(state, record); return; }
  // Mirror the opponent into our own frame: depth flips, spread flips.
  const mirrored = state.scratchOpponent;
  mirrored.spread = -opponent.normalized.spread;
  mirrored.depth = 1 - opponent.normalized.depth;
  model.shapeTarget(shapeSlot(state, record), {
    tactics:squad.tactics, phase:squad.phase, ball:ballFrame(state, record.team), team:record.team,
  }, record.target);
  model.markingTarget(record.target, mirrored, squad.tactics.pressing, record.target);
  applyLineDiscipline(state, record);
  record.effort = mixEffort(EFFORT.jog, EFFORT.run, squad.tactics.pressing * record.attributes.positioning);
}

function nearestOpponentToMark(state, squad, record){
  let best = null, bestScore = Infinity;
  for(let index = 0; index < squad.opponents.length; index++){
    const opponent = squad.opponents[index];
    if(opponent.role === 'GK') continue;
    const dx = opponent.world.x - record.world.x, dz = opponent.world.z - record.world.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if(distance > RANGE.markRadius) continue;
    // Prefer the opponent this player is already responsible for positionally.
    const score = distance + Math.abs(opponent.normalized.spread + record.normalized.spread) * 6;
    if(score < bestScore){ bestScore = score; best = opponent; }
  }
  return best;
}

function solveSupport(state, record){
  const model = tactics(), squad = state.teams[record.team];
  const carrier = state.byId[squad.carrierId];
  if(!carrier){ solveShape(state, record); return; }
  model.shapeTarget(shapeSlot(state, record), {
    tactics:squad.tactics, phase:squad.phase, ball:ballFrame(state, record.team), team:record.team,
  }, record.target);
  // Nudge the shape position toward the best of a small fixed candidate fan.
  // A fan beats a grid sweep at 22 players: same intent, bounded cost.
  const candidate = state.scratchSpot;
  let bestScore = -1, bestSpread = record.target.spread, bestDepth = record.target.depth;
  for(let index = 0; index < SUPPORT_FAN.length; index++){
    candidate.spread = clamp(record.target.spread + SUPPORT_FAN[index][0], -model.SHAPE.maxSpread, model.SHAPE.maxSpread);
    candidate.depth = clamp(record.target.depth + SUPPORT_FAN[index][1], model.SHAPE.outfieldMinDepth, model.SHAPE.outfieldMaxDepth);
    if(record.line === 'attack') candidate.depth = Math.min(candidate.depth, squad.offsideLine - DECISION.offsideMargin);
    const score = model.supportSpotScore(candidate, carrier.normalized, squad.opponentNormals, squad.tactics);
    if(score > bestScore){ bestScore = score; bestSpread = candidate.spread; bestDepth = candidate.depth; }
  }
  record.target.spread = bestSpread;
  record.target.depth = bestDepth;
  record.supportScore = bestScore;
  applyLineDiscipline(state, record);
  record.effort = mixEffort(EFFORT.jog, EFFORT.run, squad.tactics.support);
}

// Fixed candidate offsets around the shape position, in (spread, depth).
const SUPPORT_FAN = Object.freeze([
  [0, 0], [.16, .06], [-.16, .06], [.10, -.06], [-.10, -.06], [0, .12],
]);

function mixEffort(low, high, weight){ return low + (high - low) * clamp01(weight); }

/* ---------------------------------------------------------
   08b On-ball decisions
   Shoot -> pass -> dribble, evaluated in that order because a
   scoring chance always outranks keeping the ball.
   --------------------------------------------------------- */

function decideOnBall(state, record, squad, ball){
  const model = tactics(), pawn = record.pawn;
  if(!pawn || !pawn.buildShotPlan || !pawn.playAction) return;
  if(pawn.state && (pawn.state.pendingBallContact || pawn.state.shotCharge)) return;
  if(record.passCooldown > 0) return;
  const noise = decisionNoise(state, record.team);

  // 1. Shot.
  const goalDistance = (1 - record.normalized.depth) * state.config.pitch.length;
  if(goalDistance <= RANGE.shootRadius){
    const confidence = clamp01((1 - goalDistance / RANGE.shootRadius) * record.attributes.shooting * (1 - Math.abs(record.normalized.spread) * .55)) - noise;
    if(confidence >= DECISION.shootConfidence){
      const plan = pawn.buildShotPlan({normalized:clamp01(.55 + confidence * .4), aimX:clamp(record.normalized.spread * -.5 + noise, -1, 1), aimY:-.12, curve:0}, true);
      if(plan){
        if(pawn.faceShotTarget) pawn.faceShotTarget(plan, 1 / BUDGET.tickHz);
        pawn.playAction('shoot', {ball:{target:plan.target, power:plan.power, lift:plan.lift, curve:plan.curve}});
        record.passCooldown = DECISION.passCooldown;
        return;
      }
    }
  }

  // 2. Pass to the best open supporter.
  let bestMate = null, bestScore = DECISION.passConfidence + noise;
  for(let index = 0; index < state.roster.length; index++){
    const mate = state.roster[index];
    if(mate.team !== record.team || mate.id === record.id || mate.role === 'GK') continue;
    const dx = mate.world.x - record.world.x, dz = mate.world.z - record.world.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if(distance < RANGE.passRadiusMin || distance > RANGE.passRadiusMax) continue;
    if(mate.line === 'attack' && model.isOffside(mate.normalized.depth, squad.offsideLine)) continue;
    if(!model.passingLaneOpen(record.normalized, mate.normalized, squad.opponentNormals)) continue;
    const score = model.supportSpotScore(mate.normalized, record.normalized, squad.opponentNormals, squad.tactics) * record.attributes.passing;
    if(score > bestScore){ bestScore = score; bestMate = mate; }
  }
  if(bestMate){
    pawn.playAction('pass', {ball:{target:{x:bestMate.world.x, y:.25, z:bestMate.world.z}}});
    record.passCooldown = DECISION.passCooldown;
    return;
  }

  // 3. Dribble: the target set by solveCarrier already points at goal.
  record.target.depth = Math.min(model.SHAPE.outfieldMaxDepth, record.normalized.depth + DECISION.dribbleLookahead);
  record.target.spread = clamp(record.normalized.spread * .8 + (ball.spread - record.normalized.spread) * .2, -.9, .9);
}

function tryTackle(state, record){
  const pawn = record.pawn;
  if(!pawn || !pawn.playAction) return false;
  if(pawn.state && pawn.state.pendingBallContact) return false;
  record.tackleCooldown = DECISION.tackleCooldown;
  return pawn.playAction('tackle', {}) === true;
}

function decisionNoise(state, team){
  const level = clamp01(state.config.teams[team].difficulty);
  const range = DIFFICULTY_SCALE.decisionNoise;
  return range.min + (range.max - range.min) * level;
}

/* ---------------------------------------------------------
   09 Command emission
   Runs EVERY frame for every AI player, but only steers the
   heading and rewrites the existing command object in place.
   --------------------------------------------------------- */

/* ---------------------------------------------------------
   CONTROL FRAME. writeCommand() hands the Pawn a direction
   already rotated into the Pawn's own heading frame, and
   character-movement only reads it back that way in 'heading'
   input mode. A possessed Pawn has to answer the player's
   camera instead, or it cannot be turned at all. So the frame
   follows possession, not the role — otherwise every automatic
   player switch would hand the human a Pawn that will not turn.
   --------------------------------------------------------- */
const AI_CONTROL_FRAME = Object.freeze({inputMode:'heading', facingMode:'heading'});
const PLAYER_CONTROL_FRAME = Object.freeze({inputMode:'camera', facingMode:'movement'});
function applyControlFrame(pawn, possessed){
  const wanted = possessed ? PLAYER_CONTROL_FRAME : AI_CONTROL_FRAME;
  const movement = pawn.config && pawn.config.movement;
  // Cheap identity check first: this runs for 22 Pawns every frame and must not
  // reconfigure locomotion when nothing changed.
  if(!movement || movement.inputMode === wanted.inputMode) return;
  if(typeof pawn.setMovement === 'function') pawn.setMovement(wanted);
}

function emitCommands(state, dt){
  const model = tactics(), pitch = state.config.pitch;
  for(let index = 0; index < state.roster.length; index++){
    const record = state.roster[index], pawn = record.pawn;
    if(!pawn || pawn.disposed) continue;
    applyControlFrame(pawn, pawn.possessed === true);
    if(pawn.possessed) continue;
    const owner = pawn.owner;
    if(!owner || !owner.position) continue;

    model.toWorld(record.target.spread, record.target.depth, record.team, pitch, record.targetWorld);
    const dx = record.targetWorld.x - owner.position.x, dz = record.targetWorld.z - owner.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    let effort = record.effort * staminaScale(record);
    if(distance <= RANGE.arriveRadius) effort *= distance / RANGE.arriveRadius;

    if(distance > 1e-4){
      record.dirX = dx / distance; record.dirZ = dz / distance;
      record.faceHeading = Math.atan2(record.dirX, record.dirZ);
    }
    // The keeper and the carrier look at the ball, not at their footing target.
    if(state.ball.present && (record.duty === 'keeper' || record.duty === 'firstPress')){
      const bx = state.ball.x - owner.position.x, bz = state.ball.z - owner.position.z;
      if(bx * bx + bz * bz > 1e-4) record.faceHeading = Math.atan2(bx, bz);
    }

    if(owner.rotation){
      const turnRate = finite(pawn.config && pawn.config.movement && pawn.config.movement.turnRate, 10);
      owner.rotation.y += clamp(wrapAngle(record.faceHeading - owner.rotation.y), -turnRate * dt, turnRate * dt);
    }
    writeCommand(pawn, record, owner.rotation ? owner.rotation.y : 0, effort);
    updateStamina(record, effort, dt);
  }
}

function writeCommand(pawn, record, heading, effort){
  const sprint = effort > EFFORT.walkBand;
  const magnitude = sprint ? clamp01(effort) : clamp01(effort / EFFORT.walkBand);
  const cos = Math.cos(heading), sin = Math.sin(heading);
  const localX = (cos * record.dirX - sin * record.dirZ) * magnitude;
  const localZ = (sin * record.dirX + cos * record.dirZ) * magnitude;
  // Reuse the command object the Pawn already holds: setMoveInput allocates,
  // and 22 allocations every frame is exactly what this system must not do.
  const control = pawn.control;
  if(control && typeof control === 'object'){
    control.x = localX; control.z = localZ; control.sprint = sprint;
    control.jump = false; control.action = false;
    return control;
  }
  return pawn.setMoveInput({x:localX, z:localZ, sprint, jump:false, action:false});
}

function staminaScale(record){
  return EFFORT.minEffortScale + (1 - EFFORT.minEffortScale) * clamp01(record.stamina);
}
function updateStamina(record, effort, dt){
  const spent = Math.max(0, effort - EFFORT.jog) * EFFORT.drainPerSecond / Math.max(.2, record.attributes.stamina);
  const gained = effort <= EFFORT.hold ? EFFORT.recoverPerSecond * record.attributes.stamina : 0;
  record.stamina = clamp01(record.stamina - spent * dt + gained * dt);
}

/* ---------------------------------------------------------
   10 Player switching
   The human team keeps one possessed Pawn. Automatic switching
   hands control to the player best placed to act, manual
   switching cycles by proximity to the ball.
   --------------------------------------------------------- */

function switchTarget(state, team){
  const squad = state.teams[team];
  if(state.ballOwnerTeam === team && squad.carrierId) return squad.carrierId;
  return squad.nearestId;
}

function possess(state, team, recordId){
  const record = state.byId[recordId];
  const config = state.config.teams[team];
  if(!record || record.team !== team || config.controllerPlayerId == null) return false;
  const current = state.teams[team].controlledId;
  if(current === recordId) return true;
  const previous = state.byId[current];
  if(previous && previous.pawn && previous.pawn.unpossess) previous.pawn.unpossess();
  if(!record.pawn || !record.pawn.possess) return false;
  const claimed = record.pawn.possess(config.controllerPlayerId, true);
  if(claimed === false) return false;
  if(record.pawn.possessCamera) record.pawn.possessCamera(true);
  state.teams[team].controlledId = recordId;
  emit(state, 'OnSoccerPlayerSwitched', {team, pawnId:recordId, role:record.role, slot:record.slot});
  return true;
}

function autoSwitch(state, team){
  const config = state.config.teams[team];
  if(config.controllerPlayerId == null || config.autoSwitch === false) return false;
  const wanted = switchTarget(state, team);
  if(!wanted || wanted === state.teams[team].controlledId) return false;
  // Never yank control away from a player who is on the ball.
  const current = state.byId[state.teams[team].controlledId];
  if(current && state.ballOwnerTeam === team && current.id === state.teams[team].carrierId) return false;
  return possess(state, team, wanted);
}

function cycleSwitch(state, team){
  const squad = state.teams[team], candidates = [];
  for(let index = 0; index < state.roster.length; index++){
    const record = state.roster[index];
    if(record.team === team && record.role !== 'GK') candidates.push(record);
  }
  if(!candidates.length) return false;
  candidates.sort((a, b) => a.ballDistance - b.ballDistance);
  const currentIndex = candidates.findIndex(record => record.id === squad.controlledId);
  const next = candidates[(currentIndex + 1) % candidates.length];
  return possess(state, team, next.id);
}

/* ---------------------------------------------------------
   11 Configuration, driver and installation
   --------------------------------------------------------- */

function normalizeTeamConfig(source, team){
  const model = tactics(), src = source && typeof source === 'object' ? source : {};
  const formationId = model.hasFormation(src.formation) ? text(src.formation) : model.DEFAULT_FORMATION_ID;
  return {
    team,
    formation:formationId,
    slots:model.formationSlots(formationId),
    tactics:model.normalizeTactics(src.tactics),
    difficulty:clamp01(src.difficulty == null ? .5 : src.difficulty),
    controllerPlayerId:src.controllerPlayerId == null || Number(src.controllerPlayerId) < 1 ? null : Math.round(clamp(src.controllerPlayerId, 1, 4)),
    autoSwitch:src.autoSwitch !== false,
  };
}

function normalizeConfig(source){
  const model = tactics(), src = source && typeof source === 'object' ? source : {};
  return {
    schemaVersion:SCHEMA_VERSION,
    enabled:src.enabled !== false,
    tickHz:clamp(src.tickHz == null ? BUDGET.tickHz : src.tickHz, 2, 60),
    playersPerTick:Math.round(clamp(src.playersPerTick == null ? BUDGET.playersPerTick : src.playersPerTick, 1, 22)),
    lod:src.lod !== false,
    pitch:model.normalizePitch(src.pitch),
    teams:{
      home:normalizeTeamConfig(src.teams && src.teams.home, 'home'),
      away:normalizeTeamConfig(src.teams && src.teams.away, 'away'),
    },
  };
}

function emit(state, type, detail){
  const payload = Object.assign({type}, detail || {});
  const runner = state.GAME && state.GAME.systems && state.GAME.systems.logic;
  if(runner && runner.triggerRuntimeEvent) runner.triggerRuntimeEvent(type, payload);
  if(typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function'){
    root.dispatchEvent(new root.CustomEvent('lk-soccer-team-event', {detail:payload}));
  }
}

function create(GAME){
  const state = {
    GAME,
    config:normalizeConfig(null),
    roster:[],
    byId:Object.create(null),
    teams:{home:createTeamState('home'), away:createTeamState('away')},
    ball:{present:false, id:null, x:0, y:0, z:0, speed:0, inFlight:false, homeFrame:{spread:0, depth:.5}, awayFrame:{spread:0, depth:.5}},
    ballOwnerTeam:null,
    previousBallOwnerTeam:null,
    ballCarrierId:null,
    accumulator:0,
    rosterTimer:0,
    tickIndex:0,
    cursor:0,
    scratchOpponent:{spread:0, depth:0},
    scratchSpot:{spread:0, depth:0},
    snapshotBuffer:{players:[], teams:{}, ball:null, pitch:null},
    snapshotPool:[],
  };

  function configure(patch){
    state.config = normalizeConfig(Object.assign({}, state.config, patch || {}));
    rescan();
    return get();
  }
  function get(){ return JSON.parse(JSON.stringify(state.config)); }

  function rescan(){
    const registry = GAME && GAME.pawns;
    if(!registry || !registry.list) return 0;
    const seen = Object.create(null);
    const pawns = registry.list();
    for(let index = 0; index < pawns.length; index++){
      const pawn = pawns[index];
      if(!pawn || pawn.pawnType !== 'soccer' || pawn.disposed) continue;
      const descriptor = descriptorOf(pawn);
      if(!descriptor || descriptor.enabled === false) continue;
      seen[pawn.id] = true;
      const existing = state.byId[pawn.id];
      if(existing){ existing.pawn = pawn; continue; }
      const record = createRecord(pawn, descriptor);
      state.byId[pawn.id] = record;
      state.roster.push(record);
    }
    for(let index = state.roster.length - 1; index >= 0; index--){
      const record = state.roster[index];
      if(seen[record.id] && !record.pawn.disposed) continue;
      delete state.byId[record.id];
      state.roster.splice(index, 1);
    }
    state.roster.sort((a, b) => a.team === b.team ? a.slot - b.slot : (a.team === 'home' ? -1 : 1));
    return state.roster.length;
  }

  /** One team-AI tick: sample, decide the team layer, decide a slice of players. */
  function tick(step){
    state.tickIndex++;
    samplePositions(state);
    sampleBall(state);
    const owner = resolveBallOwner(state);
    if(owner !== state.ballOwnerTeam){
      state.previousBallOwnerTeam = state.ballOwnerTeam;
      state.ballOwnerTeam = owner;
    }
    updateTeamState(state, 'home');
    updateTeamState(state, 'away');
    assignDuties(state, 'home');
    assignDuties(state, 'away');

    const budget = Math.min(state.config.playersPerTick, state.roster.length);
    let decided = 0;
    // Duty-critical players are decided every tick regardless of the budget.
    for(let index = 0; index < state.roster.length; index++){
      const record = state.roster[index];
      record.passCooldown = Math.max(0, record.passCooldown - step);
      record.tackleCooldown = Math.max(0, record.tackleCooldown - step);
      record.lod = lodOf(state, record);
      if(!isCritical(state, record)) continue;
      decide(state, record);
      decided++;
    }
    // Round-robin slice for everybody else.
    for(let scanned = 0; scanned < state.roster.length && decided < budget; scanned++){
      const record = state.roster[state.cursor % state.roster.length];
      state.cursor++;
      if(isCritical(state, record)) continue;
      if(record.lod === 'far' && state.tickIndex % BUDGET.farLodEveryNTicks !== 0) continue;
      decide(state, record);
      decided++;
    }
    autoSwitch(state, 'home');
    autoSwitch(state, 'away');
    return decided;
  }

  function decide(state_, record){
    const solver = SOLVERS[duty(record.duty).id];
    solver(state_, record);
    record.lastTickDecided = state_.tickIndex;
  }

  function isCritical(state_, record){
    const squad = state_.teams[record.team];
    return record.duty === 'keeper' || record.id === squad.carrierId || record.id === squad.nearestId;
  }

  function lodOf(state_, record){
    if(!state_.config.lod || !state_.ball.present) return 'near';
    const distance = record.ballDistance == null ? distanceToBall(state_, record) : record.ballDistance;
    if(distance <= RANGE.lodNearRadius) return 'active';
    return distance <= RANGE.lodFarRadius ? 'near' : 'far';
  }

  function update(dt){
    if(!state.config.enabled) return false;
    const step = clamp(dt, 0, .25);
    state.rosterTimer += step;
    if(state.rosterTimer >= BUDGET.rosterRescanSeconds || !state.roster.length){ state.rosterTimer = 0; rescan(); }
    if(!state.roster.length) return false;
    const period = 1 / state.config.tickHz;
    state.accumulator += step;
    let ticks = 0;
    while(state.accumulator >= period && ticks < BUDGET.maxCatchUpTicks){
      state.accumulator -= period;
      tick(period);
      ticks++;
    }
    if(state.accumulator > period) state.accumulator = period;
    emitCommands(state, step);
    return true;
  }

  /** HUD/radar view. Reuses one pooled buffer: the HUD polls it, never owns it. */
  function snapshot(){
    const buffer = state.snapshotBuffer, pool = state.snapshotPool;
    buffer.players.length = 0;
    for(let index = 0; index < state.roster.length; index++){
      const record = state.roster[index];
      const entry = pool[index] || (pool[index] = {});
      entry.id = record.id; entry.team = record.team; entry.slot = record.slot;
      entry.role = record.role; entry.duty = record.duty;
      entry.x = record.world.x; entry.z = record.world.z; entry.stamina = record.stamina;
      entry.controlled = state.teams[record.team].controlledId === record.id;
      entry.carrier = state.teams[record.team].carrierId === record.id;
      buffer.players.push(entry);
    }
    buffer.teams.home = teamSnapshot(state, 'home', buffer.teams.home);
    buffer.teams.away = teamSnapshot(state, 'away', buffer.teams.away);
    if(state.ball.present){
      const ball = buffer.ball || (buffer.ball = {});
      ball.x = state.ball.x; ball.y = state.ball.y; ball.z = state.ball.z; ball.owner = state.ballOwnerTeam;
    } else buffer.ball = null;
    buffer.pitch = state.config.pitch;
    return buffer;
  }
  function teamSnapshot(state_, team, out){
    const squad = state_.teams[team], entry = out || {};
    entry.phase = squad.phase; entry.lineDepth = squad.lineDepth; entry.offsideLine = squad.offsideLine;
    entry.controlledId = squad.controlledId; entry.carrierId = squad.carrierId;
    return entry;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    configure, get, update, snapshot, rescan,
    tick:step => tick(clamp(step, 0, .25)),
    roster:() => state.roster,
    record:id => state.byId[id] || null,
    ballOwner:() => state.ballOwnerTeam,
    phase:team => state.teams[tactics().side(team)].phase,
    offsideLine:team => state.teams[tactics().side(team)].offsideLine,
    defensiveLine:team => state.teams[tactics().side(team)].lineDepth,
    duties:() => DUTY_IDS.slice(),
    possess:(team, id) => possess(state, tactics().side(team), id),
    switchPlayer:team => cycleSwitch(state, tactics().side(team)),
    controlled:team => state.teams[tactics().side(team)].controlledId,
  });
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.soccerTeamAI && GAME.systems.soccerTeamAI.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.soccerTeamAI;
  const system = create(GAME);
  GAME.systems.soccerTeamAI = system;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkSoccerTeamAiFrame){
    GAME.hooks.__lkSoccerTeamAiFrame = true;
    GAME.hooks.frame.push(dt => system.update(dt));
  }
  return system;
}

function boot(){
  if(!root.LK_RUNTIME_SOCCER_TACTICS) return null;
  return root.LOT_KING ? install(root.LOT_KING) : null;
}

root.LK_RUNTIME_SOCCER_TEAM_AI = Object.freeze({
  SCHEMA_VERSION, BUDGET, RANGE, EFFORT, DECISION, DUTIES, DUTY_IDS,
  normalizeConfig, normalizeTeamConfig, create, install, boot,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_SOCCER_TEAM_AI;
if(root.LOT_KING) boot();
else if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
})();
