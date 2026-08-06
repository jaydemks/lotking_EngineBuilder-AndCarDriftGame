/* =========================================================
   LOT KING - Soccer match flow

   The rules spine for a full 11 v 11 match: lineups, formations, the match
   clock, kickoff, goals, restarts, half time, full time, optional extra time
   and a penalty shootout when the scores are level.

   It is deliberately separate from js/runtime/penalty-flow.js. That module owns
   the standalone shootout mode and stays usable on its own for a quick
   penalties game; this module owns a match and *delegates* to it when a draw
   has to be settled. Neither one imports the other's state.

   Pure state: no Three.js, no DOM, no ball physics. The level template feeds it
   goals and out-of-play events, and reads a snapshot for the HUD. That is what
   makes the whole match testable without a browser.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;

const PHASES = Object.freeze([
  'idle', 'kickoff', 'play', 'goal', 'throwIn', 'goalKick', 'corner',
  'halfTime', 'fullTime', 'shootout', 'finished',
]);
const SIDES = Object.freeze(['home', 'away']);

// Positions are pitch-relative: x is -1 (west touchline) .. 1 (east), depth is
// 0 (own goal line) .. 1 (opponent goal line). Storing them normalised is what
// lets one formation serve any pitch size and mirror for the away team.
const FORMATIONS = Object.freeze({
  '4-4-2':Object.freeze({label:'4-4-2', lines:[4,4,2]}),
  '4-3-3':Object.freeze({label:'4-3-3', lines:[4,3,3]}),
  '4-2-3-1':Object.freeze({label:'4-2-3-1', lines:[4,2,3,1]}),
  '3-5-2':Object.freeze({label:'3-5-2', lines:[3,5,2]}),
  '5-3-2':Object.freeze({label:'5-3-2', lines:[5,3,2]}),
  '3-4-3':Object.freeze({label:'3-4-3', lines:[3,4,3]}),
});
const FORMATION_IDS = Object.freeze(Object.keys(FORMATIONS));

// Outfield lines sit between the keeper and the halfway line at kickoff; the
// depth ramp keeps a back four deep and a front three high whatever the shape.
const LINE_DEPTH = Object.freeze([.18, .34, .44, .48]);

function finite(value, fallback){
  value = Number(value);
  return Number.isFinite(value) ? value : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function text(value, fallback){
  value = value == null ? '' : String(value).trim();
  return value || (fallback == null ? '' : String(fallback));
}
function side(value){ return SIDES.indexOf(text(value)) >= 0 ? text(value) : 'home'; }
function other(team){ return team === 'home' ? 'away' : 'home'; }

/** 11 normalised slots for a formation: one keeper plus the outfield lines. */
function formationPositions(formationId){
  const formation = FORMATIONS[text(formationId)] || FORMATIONS['4-4-2'];
  const slots = [{role:'keeper', line:0, index:0, x:0, depth:.04}];
  formation.lines.forEach((count, lineIndex) => {
    const depth = LINE_DEPTH[Math.min(lineIndex, LINE_DEPTH.length - 1)];
    for(let index = 0; index < count; index++){
      // Spread evenly across the width; a single-player line sits central.
      const spread = count === 1 ? 0 : (index / (count - 1) - .5) * 2;
      slots.push({
        role:lineIndex === 0 ? 'defender' : lineIndex === formation.lines.length - 1 ? 'striker' : 'midfielder',
        line:lineIndex + 1,
        index,
        x:spread * (count <= 2 ? .34 : .78),
        depth,
      });
    }
  });
  return slots;
}

/** Normalised slot -> world position for one side of the pitch. */
function slotToWorld(slot, options){
  const opts = options || {};
  const length = finite(opts.fieldLength, 105), width = finite(opts.fieldWidth, 68);
  const originX = finite(opts.originX), originZ = finite(opts.originZ);
  // `home` defends the south goal and attacks north; `away` is mirrored.
  const facing = side(opts.team) === 'home' ? 1 : -1;
  const depth = clamp(slot && slot.depth, 0, 1);
  return {
    x:originX + finite(slot && slot.x) * (width / 2) * .92 * facing,
    y:0,
    z:originZ + facing * (depth - .5) * length,
    heading:facing === 1 ? 0 : Math.PI,
  };
}

function normalizeTeam(source, fallbackName){
  const src = source && typeof source === 'object' ? source : {};
  return {
    name:text(src.name, fallbackName),
    shortName:text(src.shortName, text(src.name, fallbackName).slice(0, 3).toUpperCase()),
    color:text(src.color, '#2563eb'),
    keeperColor:text(src.keeperColor, '#f59e0b'),
    formation:FORMATIONS[text(src.formation)] ? text(src.formation) : '4-4-2',
    aiDifficulty:clamp(src.aiDifficulty == null ? .5 : src.aiDifficulty, 0, 1),
    // -1 means "no local player on this team": every slot is AI.
    playerSlot:src.playerSlot == null ? -1 : Math.round(clamp(src.playerSlot, -1, 10)),
    controllerPlayerId:src.controllerPlayerId == null ? -1 : Math.round(clamp(src.controllerPlayerId, -1, 4)),
  };
}

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  const rules = src.rules && typeof src.rules === 'object' ? src.rules : {};
  return {
    schemaVersion:SCHEMA_VERSION,
    enabled:src.enabled !== false,
    teams:{
      home:normalizeTeam(src.teams && src.teams.home, 'Home'),
      away:normalizeTeam(src.teams && src.teams.away, 'Away'),
    },
    halves:Math.max(1, Math.round(clamp(src.halves == null ? 2 : src.halves, 1, 4))),
    // Match minutes per half, and how many real seconds one match minute takes.
    halfMinutes:clamp(src.halfMinutes == null ? 45 : src.halfMinutes, 1, 60),
    secondsPerMinute:clamp(src.secondsPerMinute == null ? 2 : src.secondsPerMinute, .05, 60),
    stoppageMinutes:clamp(src.stoppageMinutes == null ? 0 : src.stoppageMinutes, 0, 15),
    kickoffTeam:['home','away','random'].indexOf(text(src.kickoffTeam)) >= 0 ? text(src.kickoffTeam) : 'home',
    extraTime:src.extraTime === true,
    penaltiesOnDraw:src.penaltiesOnDraw !== false,
    restartDelay:clamp(src.restartDelay == null ? 2.5 : src.restartDelay, 0, 30),
    rules:{
      throwIns:rules.throwIns !== false,
      corners:rules.corners !== false,
      goalKicks:rules.goalKicks !== false,
      offside:rules.offside === true,
      fouls:rules.fouls === true,
    },
    pitch:{
      fieldLength:clamp(src.pitch && src.pitch.fieldLength, 40, 140) || 105,
      fieldWidth:clamp(src.pitch && src.pitch.fieldWidth, 30, 100) || 68,
      originX:finite(src.pitch && src.pitch.originX),
      originZ:finite(src.pitch && src.pitch.originZ),
    },
  };
}

/** The 22 spawn slots a level template places, as plain data. */
function buildLineups(config){
  const cfg = config && config.schemaVersion === SCHEMA_VERSION ? config : normalizeConfig(config);
  const lineups = {};
  SIDES.forEach(team => {
    lineups[team] = formationPositions(cfg.teams[team].formation).map((slot, index) => {
      const world = slotToWorld(slot, Object.assign({team}, cfg.pitch));
      return {
        team, slot:index, role:slot.role, line:slot.line,
        name:cfg.teams[team].shortName + ' ' + (index + 1) + ' (' + slot.role + ')',
        spawn:world,
        keeper:slot.role === 'keeper',
        controlled:index === cfg.teams[team].playerSlot,
      };
    });
  });
  return lineups;
}

function emit(GAME, type, detail){
  const payload = Object.assign({type}, detail || {});
  const runner = GAME && GAME.systems && GAME.systems.logic;
  if(runner && runner.triggerRuntimeEvent) runner.triggerRuntimeEvent(type, payload);
  if(typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function'){
    root.dispatchEvent(new root.CustomEvent('lk-match-event', {detail:payload}));
  }
}

function create(GAME){
  const state = {
    config:normalizeConfig(null),
    phase:'idle',
    half:1,
    clock:0,              // elapsed match seconds within the current half
    restart:0,            // countdown before play resumes
    score:{home:0, away:0},
    shots:{home:0, away:0},
    possession:{home:0, away:0},
    kickoffTeam:'home',
    restartTeam:'home',
    restartSpot:null,
    lastTouch:null,
    shootout:null,
    extraPlayed:false,
    period:'regulation',
    finished:false,
    outcome:null,
  };

  function halfSeconds(){
    return (state.config.halfMinutes + state.config.stoppageMinutes) * 60;
  }
  /** Match clock in match-seconds, which is what a scoreboard shows. */
  function displaySeconds(){
    return (state.half - 1) * state.config.halfMinutes * 60 + state.clock;
  }

  function setPhase(phase, detail){
    if(PHASES.indexOf(phase) < 0 || state.phase === phase) return false;
    const previous = state.phase;
    state.phase = phase;
    emit(GAME, 'OnMatchPhaseChanged', Object.assign({phase, previous, half:state.half, score:Object.assign({}, state.score)}, detail || {}));
    return true;
  }

  function beginKickoff(team){
    state.restartTeam = side(team);
    state.restartSpot = {x:state.config.pitch.originX, y:0, z:state.config.pitch.originZ};
    state.restart = state.config.restartDelay;
    setPhase('kickoff', {team:state.restartTeam});
  }

  function configure(patch){
    state.config = normalizeConfig(Object.assign({}, state.config, patch || {}));
    return get();
  }
  function get(){ return JSON.parse(JSON.stringify(state.config)); }

  function start(){
    if(!state.config.enabled) return false;
    state.phase = 'idle';
    state.half = 1;
    state.clock = 0;
    state.score = {home:0, away:0};
    state.shots = {home:0, away:0};
    state.possession = {home:0, away:0};
    state.finished = false;
    state.outcome = null;
    state.shootout = null;
    state.lastTouch = null;
    state.extraPlayed = false;
    state.period = 'regulation';
    state.kickoffTeam = state.config.kickoffTeam === 'random'
      ? (Math.random() < .5 ? 'home' : 'away')
      : side(state.config.kickoffTeam);
    emit(GAME, 'OnMatchStarted', {teams:get().teams, kickoffTeam:state.kickoffTeam});
    beginKickoff(state.kickoffTeam);
    return true;
  }

  /** A goal for `team`. The conceding side restarts. */
  function goal(team, detail){
    if(state.finished) return false;
    if(state.phase === 'shootout') return shootoutKick(team, true);
    if(state.phase !== 'play' && state.phase !== 'kickoff') return false;
    const scorer = side(team);
    state.score[scorer]++;
    emit(GAME, 'OnMatchGoal', Object.assign({team:scorer, score:Object.assign({}, state.score), clock:displaySeconds()}, detail || {}));
    setPhase('goal', {team:scorer});
    state.restart = state.config.restartDelay;
    state.restartTeam = other(scorer);
    return true;
  }

  function shot(team){
    if(state.phase !== 'play') return false;
    state.shots[side(team)]++;
    return true;
  }
  function touch(team){
    state.lastTouch = side(team);
    return state.lastTouch;
  }

  /** The ball left the pitch. `edge` is 'touchline' | 'goalLineOwn' | 'goalLineOpponent'. */
  function ballOut(info){
    if(state.phase !== 'play') return false;
    const detail = info && typeof info === 'object' ? info : {};
    const edge = text(detail.edge, 'touchline');
    const lastTouch = side(detail.team || state.lastTouch || 'home');
    const rules = state.config.rules;
    const awardedTo = other(lastTouch);
    state.restartSpot = detail.spot && typeof detail.spot === 'object'
      ? {x:finite(detail.spot.x), y:0, z:finite(detail.spot.z)}
      : null;
    if(edge === 'touchline'){
      if(!rules.throwIns) return false;
      state.restartTeam = awardedTo;
      state.restart = Math.min(state.config.restartDelay, 1.5);
      return setPhase('throwIn', {team:awardedTo});
    }
    // Behind the goal line: the attacking side concedes a goal kick, the
    // defending side concedes a corner.
    const attackingOut = edge === 'goalLineOpponent';
    if(attackingOut){
      if(!rules.goalKicks) return false;
      state.restartTeam = awardedTo;
      state.restart = Math.min(state.config.restartDelay, 2);
      return setPhase('goalKick', {team:awardedTo});
    }
    if(!rules.corners) return false;
    state.restartTeam = awardedTo;
    state.restart = Math.min(state.config.restartDelay, 2);
    return setPhase('corner', {team:awardedTo});
  }

  function endHalf(){
    if(state.half < state.config.halves){
      setPhase('halfTime', {half:state.half});
      state.restart = state.config.restartDelay;
      return true;
    }
    return endRegulation();
  }

  function endRegulation(){
    const drawn = state.score.home === state.score.away;
    if(!drawn){
      state.outcome = state.score.home > state.score.away ? 'home' : 'away';
      state.finished = true;
      setPhase('fullTime', {outcome:state.outcome, score:Object.assign({}, state.score)});
      emit(GAME, 'OnMatchEnded', {outcome:state.outcome, score:Object.assign({}, state.score), decidedBy:'regulation'});
      return true;
    }
    if(state.config.extraTime && !state.extraPlayed){
      // Extra time is a PERIOD, not a phase: play still cycles through
      // kickoff/play/goal exactly as in regulation, so the phase machine must
      // not try to sit in an `extraTime` state it would leave on the same tick.
      state.extraPlayed = true;
      state.period = 'extra';
      state.half = 1;
      state.clock = 0;
      emit(GAME, 'OnMatchExtraTime', {score:Object.assign({}, state.score)});
      beginKickoff(state.kickoffTeam === 'home' ? 'away' : 'home');
      return true;
    }
    if(state.config.penaltiesOnDraw){
      // Hand the tie-break to the standalone shootout module rather than
      // reimplementing it; a drawn match and a quick penalties game then behave
      // identically, which is the whole point of keeping them separate.
      state.shootout = {home:0, away:0, round:1, kicksTaken:{home:0, away:0}, team:state.kickoffTeam};
      setPhase('shootout', {});
      emit(GAME, 'OnMatchShootoutStarted', {score:Object.assign({}, state.score)});
      return true;
    }
    state.outcome = 'draw';
    state.finished = true;
    setPhase('fullTime', {outcome:'draw', score:Object.assign({}, state.score)});
    emit(GAME, 'OnMatchEnded', {outcome:'draw', score:Object.assign({}, state.score), decidedBy:'regulation'});
    return true;
  }

  /** Best-of-five then sudden death, evaluated after each pair of kicks. */
  function shootoutKick(team, scored){
    if(state.phase !== 'shootout' || !state.shootout) return false;
    const kicker = side(team);
    const book = state.shootout;
    book.kicksTaken[kicker]++;
    if(scored) book[kicker]++;
    emit(GAME, 'OnMatchShootoutKick', {team:kicker, scored:!!scored, shootout:Object.assign({}, book)});
    const bothTaken = book.kicksTaken.home === book.kicksTaken.away;
    const taken = Math.min(book.kicksTaken.home, book.kicksTaken.away);
    const remainingHome = Math.max(0, 5 - book.kicksTaken.home);
    const remainingAway = Math.max(0, 5 - book.kicksTaken.away);
    // Decided early when the deficit cannot be recovered with the kicks left.
    if(taken < 5){
      if(book.home > book.away + remainingAway) return finishShootout('home');
      if(book.away > book.home + remainingHome) return finishShootout('away');
    }
    if(bothTaken && book.kicksTaken.home >= 5 && book.home !== book.away){
      return finishShootout(book.home > book.away ? 'home' : 'away');
    }
    if(bothTaken) book.round++;
    book.team = other(kicker);
    return true;
  }
  function finishShootout(winner){
    state.outcome = winner;
    state.finished = true;
    setPhase('finished', {outcome:winner});
    emit(GAME, 'OnMatchEnded', {outcome:winner, score:Object.assign({}, state.score),
      shootout:Object.assign({}, state.shootout), decidedBy:'shootout'});
    return true;
  }

  function update(dt){
    if(!state.config.enabled || state.finished) return;
    const step = clamp(dt, 0, .25);
    if(state.restart > 0){
      state.restart = Math.max(0, state.restart - step);
      if(state.restart > 0) return;
      if(state.phase === 'halfTime'){
        state.half++;
        state.clock = 0;
        // Sides swap the kickoff at the start of each new half.
        beginKickoff(state.half % 2 === 1 ? state.kickoffTeam : other(state.kickoffTeam));
        return;
      }
      if(state.phase === 'goal'){ beginKickoff(state.restartTeam); return; }
      if(state.phase === 'kickoff' || state.phase === 'throwIn' || state.phase === 'goalKick' || state.phase === 'corner'){
        setPhase('play', {team:state.restartTeam});
        return;
      }
    }
    if(state.phase !== 'play') return;
    // The clock only advances during live play, scaled so a 45-minute half can
    // be played in a couple of minutes of real time: `secondsPerMinute` real
    // seconds buy one match minute.
    state.clock += step / state.config.secondsPerMinute * 60;
    if(state.lastTouch) state.possession[state.lastTouch] += step;
    if(state.clock >= halfSeconds()) endHalf();
  }

  function snapshot(){
    const total = state.possession.home + state.possession.away;
    return {
      phase:state.phase,
      period:state.period,
      half:state.half,
      halves:state.config.halves,
      clock:displaySeconds(),
      clockText:formatClock(displaySeconds()),
      restart:state.restart,
      score:Object.assign({}, state.score),
      shots:Object.assign({}, state.shots),
      possession:{
        home:total > 0 ? state.possession.home / total : .5,
        away:total > 0 ? state.possession.away / total : .5,
      },
      teams:{
        home:{name:state.config.teams.home.name, shortName:state.config.teams.home.shortName, color:state.config.teams.home.color},
        away:{name:state.config.teams.away.name, shortName:state.config.teams.away.shortName, color:state.config.teams.away.color},
      },
      restartTeam:state.restartTeam,
      shootout:state.shootout ? Object.assign({}, state.shootout) : null,
      finished:state.finished,
      outcome:state.outcome,
    };
  }
  function formatClock(seconds){
    const total = Math.max(0, Math.floor(seconds));
    return Math.floor(total / 60) + "'" + String(total % 60).padStart(2, '0');
  }

  function reset(){ return start(); }

  return Object.freeze({
    SCHEMA_VERSION,
    configure, get, start, reset, update, snapshot,
    goal, shot, touch, ballOut, shootoutKick, setPhase,
    lineups:() => buildLineups(state.config),
    phase:() => state.phase,
    finished:() => state.finished,
    outcome:() => state.outcome,
  });
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.soccerMatch && GAME.systems.soccerMatch.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.soccerMatch;
  const match = create(GAME);
  GAME.systems.soccerMatch = match;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkSoccerMatchFrame){
    GAME.hooks.__lkSoccerMatchFrame = true;
    GAME.hooks.frame.push(dt => match.update(dt));
  }
  return match;
}

function boot(){
  const GAME = root.LOT_KING;
  if(GAME) install(GAME);
}

root.LK_RUNTIME_SOCCER_MATCH = Object.freeze({
  SCHEMA_VERSION, PHASES, SIDES, FORMATIONS, FORMATION_IDS,
  normalizeConfig, formationPositions, slotToWorld, buildLineups, create, install, boot,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_SOCCER_MATCH;
if(root.LOT_KING) boot();
else if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
})();
