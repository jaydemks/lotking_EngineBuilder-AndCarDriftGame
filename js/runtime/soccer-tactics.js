/* =========================================================
   LOT KING - Soccer tactics model

   The single source of truth for WHERE a football player should be. Pure data
   and pure math: no Three.js, no DOM, no timers, no allocation-per-frame paths.
   js/runtime/soccer-team-ai.js turns the positions computed here into movement
   commands; js/runtime/soccer-match-flow.js turns them into kickoff lineups;
   js/runtime/soccer-match-level-template.js turns them into editable scene
   entries. None of them owns a formation number of its own.

   Reference material this model is derived from (see docs/SOCCER_MATCH_TEMPLATE.md):
   - EA SPORTS FC 27 gameplay deep dive: AI defenders support through positioning
     rather than auto-tackling, teammates contain from a greater distance, and
     attacking runs curve away from crowded areas. -> SHAPE tuning: marking is a
     goal-side offset, not a magnet, and the support-spot score punishes crowding.
   - FIFA/FC custom tactics: a defensive line around 60/100 is the practical
     sweet spot between suffocating midfield and dying to a failed offside trap.
     -> LINE.height default .58 with an explicit offsideTrap switch.
   - Football Manager 26 "In Possession / Out of Possession": one shape per phase
     rather than one static formation. -> PHASES table.
   - Mat Buckland, Programming Game AI by Example ch.4 "Simple Soccer": tiered AI
     (team state + player state) and a scored grid of supporting spots.
     -> supportSpotScore() and the team/player split in soccer-team-ai.js.

   Reading order: measurements -> pitch frame -> roles -> formations -> tactics
   -> phases -> shape solver -> defensive line/offside -> support spots -> API.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;

/* ---------------------------------------------------------
   01 Measurements and numeric helpers
   Every literal that appears more than once lives in a named
   table. Nothing below re-derives a magic number inline.
   --------------------------------------------------------- */

const PITCH = Object.freeze({
  length:105, width:68,
  // Fractions of the pitch used by the solvers, named so a tuning pass reads
  // as football rather than as arithmetic.
  penaltyAreaDepth:16.5, goalAreaDepth:5.5, centerCircleRadius:9.15,
});

const LIMITS = Object.freeze({
  minLength:40, maxLength:140,
  minWidth:30, maxWidth:100,
  minDepth:0, maxDepth:1,
  minSpread:-1, maxSpread:1,
});

function finite(value, fallback){
  const number = Number(value);
  return Number.isFinite(number) ? number : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function clamp01(value){ return clamp(value, 0, 1); }
function unit(value){ return clamp(value, LIMITS.minSpread, LIMITS.maxSpread); }
function mix(a, b, t){ return a + (b - a) * clamp01(t); }
function text(value, fallback){
  const string = value == null ? '' : String(value).trim();
  return string || (fallback == null ? '' : String(fallback));
}

/* ---------------------------------------------------------
   02 Pitch reference frame
   Normalised space is (spread, depth):
     spread -1 = west touchline, +1 = east touchline
     depth   0 = own goal line,   1 = opponent goal line
   `home` defends south (-z) and attacks north (+z); `away` is
   the exact mirror, so one table serves both teams.
   --------------------------------------------------------- */

const SIDES = Object.freeze(['home', 'away']);
const SIDE_FACING = Object.freeze({home:1, away:-1});

function side(value){
  const name = text(value, 'home');
  if(SIDE_FACING[name] == null) throw new Error('soccer-tactics: unknown side "' + name + '"');
  return name;
}
function facingOf(team){ return SIDE_FACING[side(team)]; }

function normalizePitch(source){
  const src = source && typeof source === 'object' ? source : {};
  return {
    length:clamp(src.length != null ? src.length : src.fieldLength, LIMITS.minLength, LIMITS.maxLength) || PITCH.length,
    width:clamp(src.width != null ? src.width : src.fieldWidth, LIMITS.minWidth, LIMITS.maxWidth) || PITCH.width,
    originX:finite(src.originX), originZ:finite(src.originZ),
  };
}

/** Normalised (spread, depth) -> world (x, z) for one team's attacking sense. */
function toWorld(spread, depth, team, pitch, out){
  const field = normalizePitch(pitch), facing = facingOf(team);
  const target = out || {x:0, y:0, z:0, heading:0};
  target.x = field.originX + unit(spread) * (field.width / 2) * facing;
  target.y = 0;
  target.z = field.originZ + facing * (clamp(depth, LIMITS.minDepth, LIMITS.maxDepth) - .5) * field.length;
  target.heading = facing === 1 ? 0 : Math.PI;
  return target;
}

/** World (x, z) -> normalised (spread, depth) from one team's point of view. */
function toNormalized(x, z, team, pitch, out){
  const field = normalizePitch(pitch), facing = facingOf(team);
  const target = out || {spread:0, depth:0};
  target.spread = unit((finite(x) - field.originX) / (field.width / 2) * facing);
  target.depth = clamp((finite(z) - field.originZ) / field.length * facing + .5, LIMITS.minDepth, LIMITS.maxDepth);
  return target;
}

/* ---------------------------------------------------------
   03 Role table
   One row per football role. Attributes are 0..1 multipliers
   consumed by soccer-team-ai (decisions) and by the level
   template (per-player Pawn tuning). `line` groups roles into
   the four units the shape solver moves as blocks.
   --------------------------------------------------------- */

const ROLE_LINES = Object.freeze(['keeper', 'defence', 'midfield', 'attack']);

// pace/stamina/shooting/passing/tackling/positioning/keeping, plus the pawn
// role the Soccer Pawn component understands (js/runtime/soccer-pawns.js only
// knows striker|winger|midfielder|defender|goalkeeper).
const ROLES = Object.freeze({
  GK :Object.freeze({id:'GK' , label:'Goalkeeper'        , line:'keeper'  , pawnRole:'goalkeeper', pace:.52, stamina:.60, shooting:.20, passing:.62, tackling:.30, positioning:.86, keeping:.92}),
  CB :Object.freeze({id:'CB' , label:'Centre Back'       , line:'defence' , pawnRole:'defender'  , pace:.62, stamina:.74, shooting:.34, passing:.58, tackling:.90, positioning:.84, keeping:.10}),
  LB :Object.freeze({id:'LB' , label:'Left Back'         , line:'defence' , pawnRole:'defender'  , pace:.78, stamina:.86, shooting:.38, passing:.66, tackling:.76, positioning:.72, keeping:.08}),
  RB :Object.freeze({id:'RB' , label:'Right Back'        , line:'defence' , pawnRole:'defender'  , pace:.78, stamina:.86, shooting:.38, passing:.66, tackling:.76, positioning:.72, keeping:.08}),
  LWB:Object.freeze({id:'LWB', label:'Left Wing Back'    , line:'defence' , pawnRole:'defender'  , pace:.84, stamina:.92, shooting:.44, passing:.70, tackling:.70, positioning:.68, keeping:.08}),
  RWB:Object.freeze({id:'RWB', label:'Right Wing Back'   , line:'defence' , pawnRole:'defender'  , pace:.84, stamina:.92, shooting:.44, passing:.70, tackling:.70, positioning:.68, keeping:.08}),
  DM :Object.freeze({id:'DM' , label:'Defensive Midfield', line:'midfield', pawnRole:'midfielder', pace:.66, stamina:.86, shooting:.52, passing:.80, tackling:.82, positioning:.82, keeping:.08}),
  CM :Object.freeze({id:'CM' , label:'Central Midfield'  , line:'midfield', pawnRole:'midfielder', pace:.72, stamina:.90, shooting:.62, passing:.86, tackling:.68, positioning:.78, keeping:.08}),
  AM :Object.freeze({id:'AM' , label:'Attacking Midfield', line:'midfield', pawnRole:'midfielder', pace:.76, stamina:.80, shooting:.76, passing:.88, tackling:.46, positioning:.74, keeping:.08}),
  LM :Object.freeze({id:'LM' , label:'Left Midfield'     , line:'midfield', pawnRole:'winger'    , pace:.84, stamina:.88, shooting:.62, passing:.76, tackling:.56, positioning:.70, keeping:.08}),
  RM :Object.freeze({id:'RM' , label:'Right Midfield'    , line:'midfield', pawnRole:'winger'    , pace:.84, stamina:.88, shooting:.62, passing:.76, tackling:.56, positioning:.70, keeping:.08}),
  LW :Object.freeze({id:'LW' , label:'Left Winger'       , line:'attack'  , pawnRole:'winger'    , pace:.92, stamina:.78, shooting:.74, passing:.74, tackling:.34, positioning:.68, keeping:.06}),
  RW :Object.freeze({id:'RW' , label:'Right Winger'      , line:'attack'  , pawnRole:'winger'    , pace:.92, stamina:.78, shooting:.74, passing:.74, tackling:.34, positioning:.68, keeping:.06}),
  CF :Object.freeze({id:'CF' , label:'Centre Forward'    , line:'attack'  , pawnRole:'striker'   , pace:.82, stamina:.76, shooting:.86, passing:.74, tackling:.32, positioning:.80, keeping:.06}),
  ST :Object.freeze({id:'ST' , label:'Striker'           , line:'attack'  , pawnRole:'striker'   , pace:.88, stamina:.74, shooting:.92, passing:.64, tackling:.30, positioning:.84, keeping:.06}),
});
const ROLE_IDS = Object.freeze(Object.keys(ROLES));
const ATTRIBUTE_KEYS = Object.freeze(['pace', 'stamina', 'shooting', 'passing', 'tackling', 'positioning', 'keeping']);

function role(id){
  const key = text(id).toUpperCase();
  const found = ROLES[key];
  if(!found) throw new Error('soccer-tactics: unknown role "' + id + '" (known: ' + ROLE_IDS.join(', ') + ')');
  return found;
}
function roleLine(id){ return role(id).line; }
function pawnRoleOf(id){ return role(id).pawnRole; }

/* ---------------------------------------------------------
   04 Formation table
   Eleven slots per shape, ordered keeper -> defence -> midfield
   -> attack so slot index 0 is always the goalkeeper and the
   reading order matches how a lineup is announced.
   `depth` is the IN-PLAY base depth; kickoffSlots() compresses
   it into the team's own half for the restart.
   --------------------------------------------------------- */

function slot(roleId, spread, depth){
  return Object.freeze({role:roleId, line:roleLine(roleId), spread:unit(spread), depth:clamp(depth, LIMITS.minDepth, LIMITS.maxDepth)});
}

const FORMATIONS = Object.freeze({
  '4-4-2':Object.freeze({id:'4-4-2', label:'4-4-2 Flat', lines:[4,4,2], slots:Object.freeze([
    slot('GK' ,  .00, .04), slot('LB' , -.74, .24), slot('CB' , -.26, .20), slot('CB' ,  .26, .20), slot('RB' ,  .74, .24),
    slot('LM' , -.80, .50), slot('CM' , -.24, .46), slot('CM' ,  .24, .46), slot('RM' ,  .80, .50),
    slot('ST' , -.16, .74), slot('ST' ,  .16, .74),
  ])}),
  '4-3-3':Object.freeze({id:'4-3-3', label:'4-3-3 Attack', lines:[4,3,3], slots:Object.freeze([
    slot('GK' ,  .00, .04), slot('LB' , -.76, .26), slot('CB' , -.26, .20), slot('CB' ,  .26, .20), slot('RB' ,  .76, .26),
    slot('DM' ,  .00, .40), slot('CM' , -.32, .50), slot('CM' ,  .32, .50),
    slot('LW' , -.80, .72), slot('ST' ,  .00, .78), slot('RW' ,  .80, .72),
  ])}),
  '4-2-3-1':Object.freeze({id:'4-2-3-1', label:'4-2-3-1 Balanced', lines:[4,2,3,1], slots:Object.freeze([
    slot('GK' ,  .00, .04), slot('LB' , -.76, .26), slot('CB' , -.26, .20), slot('CB' ,  .26, .20), slot('RB' ,  .76, .26),
    slot('DM' , -.22, .40), slot('DM' ,  .22, .40),
    slot('LM' , -.78, .60), slot('AM' ,  .00, .60), slot('RM' ,  .78, .60),
    slot('ST' ,  .00, .78),
  ])}),
  '3-5-2':Object.freeze({id:'3-5-2', label:'3-5-2 Wing Backs', lines:[3,5,2], slots:Object.freeze([
    slot('GK' ,  .00, .04), slot('CB' , -.40, .20), slot('CB' ,  .00, .18), slot('CB' ,  .40, .20),
    slot('LWB', -.86, .48), slot('CM' , -.28, .46), slot('DM' ,  .00, .40), slot('CM' ,  .28, .46), slot('RWB',  .86, .48),
    slot('ST' , -.18, .74), slot('ST' ,  .18, .74),
  ])}),
  '5-3-2':Object.freeze({id:'5-3-2', label:'5-3-2 Low Block', lines:[5,3,2], slots:Object.freeze([
    slot('GK' ,  .00, .04), slot('LWB', -.82, .26), slot('CB' , -.40, .18), slot('CB' ,  .00, .16), slot('CB' ,  .40, .18), slot('RWB',  .82, .26),
    slot('CM' , -.34, .44), slot('DM' ,  .00, .40), slot('CM' ,  .34, .44),
    slot('ST' , -.18, .70), slot('ST' ,  .18, .70),
  ])}),
  '3-4-3':Object.freeze({id:'3-4-3', label:'3-4-3 High Press', lines:[3,4,3], slots:Object.freeze([
    slot('GK' ,  .00, .04), slot('CB' , -.40, .22), slot('CB' ,  .00, .20), slot('CB' ,  .40, .22),
    slot('LWB', -.86, .50), slot('CM' , -.26, .48), slot('CM' ,  .26, .48), slot('RWB',  .86, .50),
    slot('LW' , -.72, .76), slot('CF' ,  .00, .80), slot('RW' ,  .72, .76),
  ])}),
  '4-1-4-1':Object.freeze({id:'4-1-4-1', label:'4-1-4-1 Control', lines:[4,1,4,1], slots:Object.freeze([
    slot('GK' ,  .00, .04), slot('LB' , -.76, .26), slot('CB' , -.26, .20), slot('CB' ,  .26, .20), slot('RB' ,  .76, .26),
    slot('DM' ,  .00, .38),
    slot('LM' , -.80, .58), slot('CM' , -.26, .54), slot('CM' ,  .26, .54), slot('RM' ,  .80, .58),
    slot('ST' ,  .00, .78),
  ])}),
});
const FORMATION_IDS = Object.freeze(Object.keys(FORMATIONS));
const DEFAULT_FORMATION_ID = '4-4-2';

function formation(id){
  const key = text(id, DEFAULT_FORMATION_ID);
  const found = FORMATIONS[key];
  if(!found) throw new Error('soccer-tactics: unknown formation "' + id + '" (known: ' + FORMATION_IDS.join(', ') + ')');
  return found;
}
/** True when `id` names a shipped formation; callers that accept author input
 *  use this instead of catching the throw from formation(). */
function hasFormation(id){ return Object.prototype.hasOwnProperty.call(FORMATIONS, text(id)); }

/** The eleven in-play base slots, as a fresh mutable array. */
function formationSlots(id){
  return formation(id).slots.map(entry => ({role:entry.role, line:entry.line, spread:entry.spread, depth:entry.depth}));
}

// Restart compression: a kickoff shape has to live inside the team's own half,
// and the halfway line itself belongs to the side kicking off.
const KICKOFF = Object.freeze({maxDepth:.48, keeperDepth:.04, kickoffPairDepth:.47});

function kickoffSlots(id){
  return formationSlots(id).map(entry => {
    entry.depth = entry.role === 'GK' ? KICKOFF.keeperDepth : Math.min(entry.depth * KICKOFF.maxDepth / .8, KICKOFF.maxDepth);
    return entry;
  });
}

/* ---------------------------------------------------------
   05 Tactical preset table
   The authorable dials. Every value is 0..1 so the editor can
   expose them as sliders and the AI can blend them linearly.
   --------------------------------------------------------- */

const TACTIC_KEYS = Object.freeze(['mentality', 'lineHeight', 'width', 'compactness', 'pressing', 'tempo', 'support', 'offsideTrap']);

const TACTICS = Object.freeze({
  parkTheBus  :Object.freeze({id:'parkTheBus'  , label:'Park the Bus'   , mentality:.10, lineHeight:.22, width:.34, compactness:.90, pressing:.20, tempo:.30, support:.25, offsideTrap:false}),
  counter     :Object.freeze({id:'counter'     , label:'Counter Attack' , mentality:.34, lineHeight:.38, width:.46, compactness:.74, pressing:.38, tempo:.78, support:.45, offsideTrap:false}),
  balanced    :Object.freeze({id:'balanced'    , label:'Balanced'       , mentality:.50, lineHeight:.58, width:.55, compactness:.55, pressing:.52, tempo:.55, support:.55, offsideTrap:false}),
  possession  :Object.freeze({id:'possession'  , label:'Possession'     , mentality:.62, lineHeight:.64, width:.78, compactness:.40, pressing:.58, tempo:.42, support:.78, offsideTrap:true}),
  gegenpress  :Object.freeze({id:'gegenpress'  , label:'Gegenpress'     , mentality:.82, lineHeight:.78, width:.62, compactness:.72, pressing:.92, tempo:.86, support:.70, offsideTrap:true}),
  allOutAttack:Object.freeze({id:'allOutAttack', label:'All Out Attack' , mentality:.96, lineHeight:.84, width:.72, compactness:.45, pressing:.80, tempo:.94, support:.88, offsideTrap:true}),
});
const TACTIC_IDS = Object.freeze(Object.keys(TACTICS));
const DEFAULT_TACTIC_ID = 'balanced';

function tactic(id){
  const key = text(id, DEFAULT_TACTIC_ID);
  const found = TACTICS[key];
  if(!found) throw new Error('soccer-tactics: unknown tactic "' + id + '" (known: ' + TACTIC_IDS.join(', ') + ')');
  return found;
}
function hasTactic(id){ return Object.prototype.hasOwnProperty.call(TACTICS, text(id)); }

/** A preset plus per-team overrides, clamped into the 0..1 authoring range. */
function normalizeTactics(source){
  const src = source && typeof source === 'object' ? source : {};
  const preset = tactic(hasTactic(src.preset) ? src.preset : DEFAULT_TACTIC_ID);
  const out = {preset:preset.id};
  TACTIC_KEYS.forEach(key => {
    if(key === 'offsideTrap'){
      out.offsideTrap = src.offsideTrap == null ? preset.offsideTrap === true : src.offsideTrap === true;
      return;
    }
    out[key] = clamp01(src[key] == null ? preset[key] : src[key]);
  });
  return out;
}

/* ---------------------------------------------------------
   06 Phase of play table
   The three states a team can be in, with the shape deltas each
   one applies. Derived from FM26's In/Out of Possession split:
   one formation, three shapes.
   --------------------------------------------------------- */

const PHASES = Object.freeze(['possession', 'transitionAttack', 'transitionDefence', 'outOfPossession']);

const PHASE_SHAPE = Object.freeze({
  // depthPush     : how far the whole block slides toward the opponent goal
  // widthScale    : how far the block stretches across the pitch
  // ballAttraction: how strongly each unit leans toward the ball's lateral side
  // lineCompaction: how tightly the four units squeeze together front-to-back
  possession       :Object.freeze({depthPush: .10, widthScale:1.16, ballAttraction:.22, lineCompaction:.86, urgency:.55}),
  transitionAttack :Object.freeze({depthPush: .18, widthScale:1.08, ballAttraction:.14, lineCompaction:.94, urgency:.95}),
  transitionDefence:Object.freeze({depthPush:-.14, widthScale: .82, ballAttraction:.42, lineCompaction:.70, urgency:1.00}),
  outOfPossession  :Object.freeze({depthPush:-.10, widthScale: .86, ballAttraction:.46, lineCompaction:.64, urgency:.80}),
});

function phase(id){
  const key = text(id, 'outOfPossession');
  const found = PHASE_SHAPE[key];
  if(!found) throw new Error('soccer-tactics: unknown phase "' + id + '" (known: ' + PHASES.join(', ') + ')');
  return found;
}

/** Classifies possession into one of the four phases. `previousOwner` is what
 *  makes a transition a transition: the frame the ball changed hands. */
function phaseFor(team, ballOwner, previousOwner){
  const mine = side(team);
  const now = ballOwner == null ? null : side(ballOwner);
  const before = previousOwner == null ? null : side(previousOwner);
  if(now === mine) return before === mine || before == null ? 'possession' : 'transitionAttack';
  if(now == null) return 'outOfPossession';
  return before === mine ? 'transitionDefence' : 'outOfPossession';
}

/* ---------------------------------------------------------
   07 Team shape solver
   Turns (slot, ball, tactics, phase) into one normalised target.
   Deliberately allocation-free: the caller passes `out`, which
   soccer-team-ai reuses across all 22 players every tick.
   --------------------------------------------------------- */

// Named tuning constants for the solver. Changing football feel happens here,
// never inside the arithmetic below.
const SHAPE = Object.freeze({
  // How much of the pitch the mentality dial can move the whole block.
  mentalitySwing:.22,
  // How much the defensive-line dial moves the back unit specifically.
  lineHeightSwing:.30,
  // Per-unit share of the block push. The attack rides the ball, the defence
  // holds the line: giving every unit the same push is what makes a team look
  // like a rigid grid instead of a football side.
  unitPush:Object.freeze({keeper:.10, defence:.55, midfield:.85, attack:1}),
  // Per-unit lateral pull toward the ball's side of the pitch.
  unitBallPull:Object.freeze({keeper:.16, defence:.62, midfield:.90, attack:.55}),
  // Longitudinal pull toward the ball for the unit that must actually contest.
  unitBallDepthPull:Object.freeze({keeper:.05, defence:.30, midfield:.46, attack:.34}),
  // The keeper is a sweeper only up to this depth, whatever the line height.
  keeperMaxDepth:.22,
  // Outfield players never take up a position outside these bounds.
  outfieldMinDepth:.06, outfieldMaxDepth:.97,
  maxSpread:.94,
  // Compactness squeezes the block toward its own centre of gravity.
  compactionRange:.34,
});

/**
 * @param {object} slotDef   one entry from formationSlots()
 * @param {object} context   {ball:{spread,depth}, tactics, phase, team}
 * @param {object} [out]     reused {spread, depth} target
 */
function shapeTarget(slotDef, context, out){
  const target = out || {spread:0, depth:0};
  const ctx = context || {};
  const tactics = ctx.tactics && ctx.tactics.preset ? ctx.tactics : normalizeTactics(ctx.tactics);
  const shape = phase(ctx.phase);
  const line = slotDef && slotDef.line ? slotDef.line : roleLine(slotDef && slotDef.role);
  const ball = ctx.ball || {spread:0, depth:.5};
  const ballSpread = unit(ball.spread), ballDepth = clamp(ball.depth, 0, 1);

  // 1. Block push: mentality + phase, weighted by how far up the unit lives.
  const push = ((tactics.mentality - .5) * SHAPE.mentalitySwing + shape.depthPush) * SHAPE.unitPush[line];
  // 2. Defensive line height only moves the two rear units.
  const lineLift = line === 'defence' || line === 'keeper'
    ? (tactics.lineHeight - .5) * SHAPE.lineHeightSwing * (line === 'defence' ? 1 : .45)
    : 0;
  // 3. Ball tracking, longitudinal and lateral.
  const depthPull = (ballDepth - slotDef.depth) * shape.ballAttraction * SHAPE.unitBallDepthPull[line];
  const spreadPull = (ballSpread - slotDef.spread) * shape.ballAttraction * SHAPE.unitBallPull[line];
  // 4. Width and compactness reshape the block around its own centre.
  const widthScale = mix(.62, 1.24, tactics.width) * shape.widthScale;
  const compaction = 1 - tactics.compactness * SHAPE.compactionRange * (2 - shape.lineCompaction);

  let depth = slotDef.depth + push + lineLift + depthPull;
  depth = .5 + (depth - .5) * compaction * mix(.9, 1.12, tactics.mentality);
  let spread = slotDef.spread * widthScale + spreadPull;

  if(line === 'keeper'){
    target.depth = clamp(Math.max(KICKOFF.keeperDepth, depth), 0, SHAPE.keeperMaxDepth);
    // A keeper shuffles across the goal, it does not take the touchline.
    target.spread = unit(spread * .22);
    return target;
  }
  target.depth = clamp(depth, SHAPE.outfieldMinDepth, SHAPE.outfieldMaxDepth);
  target.spread = clamp(spread, -SHAPE.maxSpread, SHAPE.maxSpread);
  return target;
}

/* ---------------------------------------------------------
   08 Defensive line and offside
   The line is a single normalised depth shared by the back unit.
   `offsideDepth` is expressed in the ATTACKING team's frame, so
   an attacker is offside when its own depth exceeds it.
   --------------------------------------------------------- */

const LINE = Object.freeze({
  // Practical bounds for a defensive line: never inside the six-yard box,
  // never past the halfway line + a yard, whatever the dial says.
  minDepth:.10, maxDepth:.62,
  // FC/FIFA custom tactics sweet spot: ~60/100 suffocates midfield without
  // dying to every ball over the top.
  defaultHeight:.58,
  // How far the line drops when the ball is deep in its own half.
  ballRetreat:.34,
  // The trap pushes this much further up than the resting line.
  trapPush:.10,
  // Two defenders must stay behind the line for it to be a real trap.
  trapMinDefenders:2,
});

/**
 * The defending team's line depth, in the DEFENDING team's frame.
 * @param {object} options {lineHeight, ballDepth (defender frame), trap, urgency}
 */
function defensiveLineDepth(options){
  const opts = options || {};
  const height = clamp01(opts.lineHeight == null ? LINE.defaultHeight : opts.lineHeight);
  const ballDepth = clamp01(opts.ballDepth == null ? .5 : opts.ballDepth);
  const resting = mix(LINE.minDepth, LINE.maxDepth, height);
  // Ball deep in our half drags the line back; ball in theirs lets it step up.
  const retreat = (.5 - ballDepth) * LINE.ballRetreat;
  const trap = opts.trap === true ? LINE.trapPush * clamp01(opts.urgency == null ? 1 : opts.urgency) : 0;
  return clamp(resting - retreat + trap, LINE.minDepth, LINE.maxDepth);
}

/**
 * The offside depth an attacker must not exceed, in the ATTACKING team's frame.
 * `defenderDepths` are the defending team's outfield depths in the DEFENDING
 * frame; the second-last one is the offside line, and the ball itself can never
 * play a player onside behind it.
 */
function offsideDepth(defenderDepths, ballDepth){
  const depths = Array.isArray(defenderDepths) ? defenderDepths.filter(Number.isFinite).slice().sort((a, b) => a - b) : [];
  if(depths.length < LINE.trapMinDefenders) return LIMITS.maxDepth;
  // Defending frame: small depth = close to own goal. The second-last defender
  // is therefore the second smallest depth.
  const secondLast = depths[1];
  const attackerFrame = 1 - secondLast;
  return Math.max(attackerFrame, clamp01(ballDepth == null ? 0 : ballDepth));
}

/** True when an attacker at `depth` (attacking frame) is beyond the line. */
function isOffside(depth, line){
  return clamp01(depth) > clamp01(line) + 1e-6;
}

/* ---------------------------------------------------------
   09 Support spots and passing lanes
   Buckland's scored-grid idea, reduced to a closed-form score so
   22 players can be evaluated inside one frame budget without a
   per-player grid sweep.
   --------------------------------------------------------- */

const SUPPORT = Object.freeze({
  // Ideal distance from the ball carrier, normalised on pitch length.
  idealPassDepth:.14,
  // Score weights; they sum to 1 so the result stays comparable across calls.
  weightPassDistance:.30, weightGoalThreat:.30, weightSpace:.26, weightWidth:.14,
  // A marker inside this normalised radius fully cancels the space term.
  crowdRadius:.09,
  // Below this cosine a lane is considered blocked by an opponent.
  laneBlockCos:.94,
  laneBlockRadius:.055,
});

function distance2(ax, az, bx, bz){
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * Scores a candidate supporting position, 0..1, in the supporting team's frame.
 * @param {object} spot     {spread, depth}
 * @param {object} carrier  {spread, depth} the current ball carrier
 * @param {Array}  markers  opponent positions [{spread, depth}, ...]
 * @param {object} tactics  normalised tactics (uses `support` and `width`)
 */
function supportSpotScore(spot, carrier, markers, tactics){
  if(!spot || !carrier) return 0;
  const dials = tactics && tactics.preset ? tactics : normalizeTactics(tactics);
  const gap = Math.sqrt(distance2(spot.spread * .5, spot.depth, carrier.spread * .5, carrier.depth));
  // Too close is as useless as too far: peak at the ideal pass length.
  const passScore = Math.max(0, 1 - Math.abs(gap - SUPPORT.idealPassDepth) / SUPPORT.idealPassDepth);
  const goalThreat = clamp01((spot.depth - carrier.depth) * 2 + .5) * clamp01(1 - Math.abs(spot.spread) * .5);
  let space = 1;
  if(Array.isArray(markers)){
    for(let index = 0; index < markers.length; index++){
      const marker = markers[index];
      if(!marker) continue;
      const near = Math.sqrt(distance2(spot.spread * .5, spot.depth, marker.spread * .5, marker.depth));
      if(near < SUPPORT.crowdRadius) space = Math.min(space, near / SUPPORT.crowdRadius);
    }
  }
  const widthScore = clamp01(1 - Math.abs(Math.abs(spot.spread) - dials.width));
  return clamp01(
    passScore * SUPPORT.weightPassDistance +
    goalThreat * SUPPORT.weightGoalThreat +
    space * SUPPORT.weightSpace +
    widthScore * SUPPORT.weightWidth
  ) * mix(.55, 1, dials.support);
}

/** True when no opponent sits inside the cone between carrier and receiver. */
function passingLaneOpen(carrier, receiver, markers){
  if(!carrier || !receiver) return false;
  const dx = (receiver.spread - carrier.spread) * .5, dz = receiver.depth - carrier.depth;
  const length = Math.sqrt(dx * dx + dz * dz);
  if(length < 1e-4) return false;
  const ux = dx / length, uz = dz / length;
  if(!Array.isArray(markers)) return true;
  for(let index = 0; index < markers.length; index++){
    const marker = markers[index];
    if(!marker) continue;
    const mx = (marker.spread - carrier.spread) * .5, mz = marker.depth - carrier.depth;
    const along = mx * ux + mz * uz;
    if(along <= 0 || along >= length) continue;
    const lateral = Math.abs(mx * uz - mz * ux);
    if(lateral < SUPPORT.laneBlockRadius) return false;
    const cos = along / Math.max(1e-4, Math.sqrt(mx * mx + mz * mz));
    if(cos > SUPPORT.laneBlockCos && lateral < SUPPORT.laneBlockRadius * 1.6) return false;
  }
  return true;
}

/**
 * Goal-side marking position: stand between the opponent and our own goal,
 * `tightness` of the way there. FC 27 moved AI teammates to a looser contain,
 * so the default sits well short of body contact.
 */
function markingTarget(marker, opponent, tightness, out){
  const target = out || {spread:0, depth:0};
  if(!opponent) return target;
  const grip = clamp01(tightness == null ? .5 : tightness);
  // In the marking team's frame, "goal side" means a smaller depth.
  const goalSideDepth = opponent.depth - mix(.055, .018, grip);
  target.spread = unit(mix(marker && marker.spread != null ? marker.spread : opponent.spread, opponent.spread, mix(.55, .96, grip)));
  target.depth = clamp(goalSideDepth, LIMITS.minDepth, LIMITS.maxDepth);
  return target;
}

/* ---------------------------------------------------------
   10 Public API
   --------------------------------------------------------- */

const API = Object.freeze({
  SCHEMA_VERSION,
  PITCH, LIMITS, SIDES, KICKOFF, SHAPE, LINE, SUPPORT,
  ROLES, ROLE_IDS, ROLE_LINES, ATTRIBUTE_KEYS,
  FORMATIONS, FORMATION_IDS, DEFAULT_FORMATION_ID,
  TACTICS, TACTIC_IDS, TACTIC_KEYS, DEFAULT_TACTIC_ID,
  PHASES, PHASE_SHAPE,
  // frame
  side, facingOf, normalizePitch, toWorld, toNormalized,
  // tables
  role, roleLine, pawnRoleOf, formation, hasFormation, formationSlots, kickoffSlots,
  tactic, hasTactic, normalizeTactics, phase, phaseFor,
  // solvers
  shapeTarget, defensiveLineDepth, offsideDepth, isOffside,
  supportSpotScore, passingLaneOpen, markingTarget,
});

root.LK_RUNTIME_SOCCER_TACTICS = API;
if(typeof module !== 'undefined' && module.exports) module.exports = API;
})();
