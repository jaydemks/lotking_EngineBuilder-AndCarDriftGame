/* =========================================================
   LOT KING - Penalty shootout flow

   The referee AND the director of the standalone penalty game mode: the
   alternating series (regulation five plus sudden death), the kick sequence a
   single penalty is made of (aim -> run-up -> feint -> strike), the goalkeeper's
   read of the kicker, the pressure that builds as a shootout becomes decisive,
   and the presentation camera between one kick and the next.

   It stays deliberately independent from js/runtime/soccer-match-flow.js: a
   drawn match delegates its tie-break to the same rules, but neither module
   imports the other's state.

   Pure state: no Three.js, no DOM, no ball physics. Ball outcomes arrive on the
   shared lk-pawn-event bus; the Soccer Pawn reads state() to know whether it is
   allowed to aim, and keeperCommitment() to know when to dive. That is what
   makes the whole shootout testable headless.

   Reading order: tables -> helpers -> event bus -> series maths -> pressure ->
   kick sequence -> keeper read -> presentation -> state machine -> API.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 2;

/* ---------------------------------------------------------
   01 Tables
   Every repeated literal in this module is named here, in the
   order the sections below consume them.
   --------------------------------------------------------- */

// Phase machine. 'ready' and 'aim' keep their v1 meaning because
// js/runtime/soccer-pawns.js gates its setup-aim on exactly those two.
const PHASES = Object.freeze(['idle', 'ready', 'aim', 'runUp', 'shot', 'resolved', 'finished']);
const RESULTS = Object.freeze(['goal', 'saved', 'miss', 'post']);
const TEAMS = Object.freeze(['A', 'B']);

// The run-up is a timing bar, not a cutscene. Striking inside the sweet window
// keeps the authored power and aim; striking outside it bleeds accuracy. This
// folds the two-bar arcade penalty convention (a direction bar and a power bar,
// each locked by a tap) into one timeline the player already understands.
const RUN_UP = Object.freeze({
  minSeconds:.45, maxSeconds:1.6, defaultSeconds:.95,
  sweetStart:.62, sweetEnd:.88,          // fraction of the run-up
  sweetBonus:1, earlyPenalty:.55, latePenalty:.72,
  // Each feint shortens the sweet window: selling a stutter costs control.
  feintWindowShrink:.12, maxFeints:2,
  // A feint only reads as a feint if the keeper still has time to buy it.
  feintDeadline:.80,
});

// Goalkeeper skill presets. `guessBias` is how often the keeper simply picks a
// side before the ball is struck (the real-world dominant strategy studied in
// the penalty-policy literature); the rest is how well it reads the kicker once
// the strike starts.
const KEEPER_SKILL = Object.freeze({
  rookie    :Object.freeze({id:'rookie'    , label:'Rookie'      , reaction:.34, prediction:.55, guessBias:.20, readAccuracy:.35, reach:.92, feintResistance:.20}),
  amateur   :Object.freeze({id:'amateur'   , label:'Amateur'     , reaction:.26, prediction:.80, guessBias:.35, readAccuracy:.52, reach:1.00, feintResistance:.35}),
  pro       :Object.freeze({id:'pro'       , label:'Professional', reaction:.18, prediction:1.10, guessBias:.50, readAccuracy:.70, reach:1.08, feintResistance:.55}),
  worldClass:Object.freeze({id:'worldClass', label:'World Class' , reaction:.12, prediction:1.35, guessBias:.62, readAccuracy:.86, reach:1.16, feintResistance:.75}),
});
const KEEPER_SKILL_IDS = Object.freeze(Object.keys(KEEPER_SKILL));
const DEFAULT_KEEPER_SKILL = 'pro';

// Pressure: what a kick is worth to the series. The weights are summed then
// clamped, so `pressure` stays a readable 0..1 for the HUD.
const PRESSURE = Object.freeze({
  base:.18,
  weightDecisive:.34,      // scoring wins it, or missing loses it
  weightDeficit:.22,       // kicking from behind
  weightLateRound:.16,     // the last rounds of the regulation series
  weightSuddenDeath:.30,
  // How much pressure degrades a kick: the AI aims worse and the human's sweet
  // window shrinks. Never enough to make a penalty unfair.
  aimErrorAtFullPressure:.22,
  sweetShrinkAtFullPressure:.35,
});

// Presentation cameras. Data only: a level template or a Cinema Studio consumes
// `state().camera`; this module never touches a Three.js camera itself.
const CAMERAS = Object.freeze({
  ready   :Object.freeze({id:'ready'   , label:'Kicker walk-up' , hold:2.2}),
  aim     :Object.freeze({id:'aim'     , label:'Behind the ball', hold:0}),
  runUp   :Object.freeze({id:'runUp'   , label:'Low tracking'   , hold:0}),
  shot    :Object.freeze({id:'shot'    , label:'Goal line'      , hold:0}),
  resolved:Object.freeze({id:'resolved', label:'Reaction'       , hold:2.2}),
  finished:Object.freeze({id:'finished', label:'Celebration'    , hold:6}),
});

const LIMITS = Object.freeze({
  kicksPerTeam:Object.freeze({min:1, max:20, fallback:5}),
  autoAdvanceDelay:Object.freeze({min:.2, max:10, fallback:2.2}),
});

/* ---------------------------------------------------------
   02 Helpers
   --------------------------------------------------------- */

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function clamp01(value){ return clamp(finite(value, 0), 0, 1); }
function unit(value){ return clamp(finite(value, 0), -1, 1); }
function text(value, fallback){
  const string = value == null ? '' : String(value).trim();
  return string || fallback;
}
function keeperSkill(id){
  const key = text(id, DEFAULT_KEEPER_SKILL);
  const found = KEEPER_SKILL[key];
  if(!found) throw new Error('penalty-flow: unknown goalkeeper skill "' + id + '" (known: ' + KEEPER_SKILL_IDS.join(', ') + ')');
  return found;
}
function cameraFor(phase){
  const key = text(phase, 'idle');
  if(key === 'idle') return null;      // the only phase with no presentation
  const found = CAMERAS[key];
  if(!found) throw new Error('penalty-flow: no presentation camera for phase "' + phase + '"');
  return found;
}
/** Deterministic 0..1 hash: replays and tests must reproduce the same keeper. */
function hash01(seed){
  const value = Math.sin(finite(seed, 0) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

/* ---------------------------------------------------------
   03 Event bus
   --------------------------------------------------------- */

function emitEvent(type, payload){
  if(typeof root.dispatchEvent !== 'function' || typeof root.CustomEvent !== 'function') return;
  root.dispatchEvent(new root.CustomEvent('lk-pawn-event', {detail:Object.assign({type}, payload || {})}));
}

function newKick(runUpSeconds){
  return {
    aimX:0, aimY:0, power:.75, curve:0,
    runUpActive:false, runUpElapsed:0, runUpDuration:finite(runUpSeconds, RUN_UP.defaultSeconds),
    feints:0, timing:0, timingQuality:0, struck:false,
  };
}

function create(GAME){
  const state = {
    schemaVersion:SCHEMA_VERSION,
    phase:'idle',
    kicksPerTeam:LIMITS.kicksPerTeam.fallback,
    round:1,
    kickingTeam:'A',
    teams:{A:{name:'Home', kicks:[]}, B:{name:'Away', kicks:[]}},
    suddenDeath:false,
    winner:null,
    ballId:null,
    autoAdvanceDelay:LIMITS.autoAdvanceDelay.fallback,
    listening:false,
    pendingAdvance:null,
    advanceTimer:0,
    lastResult:null,
    resultSequence:0,
    // --- v2 ---
    keeperSkillId:DEFAULT_KEEPER_SKILL,
    runUpSeconds:RUN_UP.defaultSeconds,
    presentationCameras:true,
    pressureEnabled:true,
    kick:newKick(RUN_UP.defaultSeconds),
    keeperPlan:null,
    cameraHold:0,
  };

  /* -------------------------------------------------------
     04 Series maths (v1 rules, unchanged)
     ------------------------------------------------------- */

  function score(team){ return state.teams[team].kicks.filter(result => result === 'goal').length; }
  function taken(team){ return state.teams[team].kicks.length; }
  function remaining(team){ return Math.max(0, state.kicksPerTeam - taken(team)); }
  function other(team){ return team === 'A' ? 'B' : 'A'; }

  function decided(){
    if(state.suddenDeath){
      // Sudden death resolves when both teams took the same number of extra
      // kicks with different scores.
      if(taken('A') === taken('B') && taken('A') > state.kicksPerTeam) return score('A') !== score('B');
      return false;
    }
    const aCanReach = score('A') + remaining('A');
    const bCanReach = score('B') + remaining('B');
    return score('A') > bCanReach || score('B') > aCanReach
      || (remaining('A') === 0 && remaining('B') === 0 && score('A') !== score('B'));
  }

  /* -------------------------------------------------------
     05 Pressure
     Computed fresh for the kick about to be taken, so the HUD
     can show it while the kicker is still walking up.
     ------------------------------------------------------- */

  function pressureFor(team){
    if(!state.pressureEnabled) return 0;
    const mine = score(team), theirs = score(other(team));
    const myRemaining = remaining(team), theirRemaining = remaining(other(team));
    let value = PRESSURE.base;
    const winsIt = mine + 1 > theirs + theirRemaining;
    const losesIt = mine + myRemaining - 1 < theirs;
    if(winsIt || losesIt) value += PRESSURE.weightDecisive;
    if(mine < theirs) value += PRESSURE.weightDeficit * clamp01((theirs - mine) / 2);
    if(!state.suddenDeath && state.round >= Math.max(1, state.kicksPerTeam - 1)) value += PRESSURE.weightLateRound;
    if(state.suddenDeath) value += PRESSURE.weightSuddenDeath;
    return clamp01(value);
  }

  /* -------------------------------------------------------
     06 Kick sequence
     aim() -> beginRunUp() -> feint()* -> strike().
     Every step is optional: a graph that only calls strike()
     still gets a legal, if unremarkable, penalty.
     ------------------------------------------------------- */

  function canAim(){ return state.phase === 'ready' || state.phase === 'aim' || state.phase === 'runUp'; }

  function aim(patch){
    if(!canAim()) return null;
    const source = patch || {};
    if(source.aimX != null) state.kick.aimX = unit(source.aimX);
    if(source.aimY != null) state.kick.aimY = unit(source.aimY);
    if(source.power != null) state.kick.power = clamp01(source.power);
    if(source.curve != null) state.kick.curve = unit(source.curve);
    if(state.phase === 'ready') setPhase('aim');
    return kickSnapshot();
  }

  function beginRunUp(seconds){
    if(state.phase !== 'ready' && state.phase !== 'aim') return null;
    state.kick.runUpActive = true;
    state.kick.runUpElapsed = 0;
    state.kick.runUpDuration = clamp(finite(seconds, state.runUpSeconds), RUN_UP.minSeconds, RUN_UP.maxSeconds);
    setPhase('runUp');
    emitEvent('OnPenaltyRunUp', {round:state.round, team:state.kickingTeam, duration:state.kick.runUpDuration});
    return kickSnapshot();
  }

  /** A stutter step: it buys a keeper commitment, and costs control. */
  function feint(){
    if(state.phase !== 'runUp' || !state.kick.runUpActive) return false;
    if(state.kick.feints >= RUN_UP.maxFeints) return false;
    const progress = state.kick.runUpElapsed / Math.max(.001, state.kick.runUpDuration);
    if(progress > RUN_UP.feintDeadline) return false;
    state.kick.feints++;
    const skill = keeperSkill(state.keeperSkillId);
    const bought = hash01(state.resultSequence * 7.31 + state.kick.feints * 3.17) > skill.feintResistance;
    if(bought && state.keeperPlan) state.keeperPlan.commitProgress = Math.min(state.keeperPlan.commitProgress, progress + .05);
    emitEvent('OnPenaltyFeint', {round:state.round, team:state.kickingTeam, feints:state.kick.feints, bought});
    return true;
  }

  /** Timing quality of the moment the ball was struck, 0..1. */
  function timingQuality(progress, pressure){
    const shrink = PRESSURE.sweetShrinkAtFullPressure * clamp01(pressure) + RUN_UP.feintWindowShrink * state.kick.feints;
    const start = RUN_UP.sweetStart + shrink * .5;
    const end = RUN_UP.sweetEnd - shrink * .5;
    if(progress >= start && progress <= end) return RUN_UP.sweetBonus;
    if(progress < start) return RUN_UP.earlyPenalty * clamp01(progress / Math.max(.001, start));
    return RUN_UP.latePenalty * clamp01(1 - (progress - end) / Math.max(.001, 1 - end));
  }

  /**
   * Commits the kick and returns the resolved shot plan the caller feeds to the
   * ball: aim after timing and pressure error, normalised power and curve.
   */
  function strike(){
    if(state.phase !== 'ready' && state.phase !== 'aim' && state.phase !== 'runUp') return null;
    const pressure = pressureFor(state.kickingTeam);
    const progress = state.kick.runUpActive
      ? clamp01(state.kick.runUpElapsed / Math.max(.001, state.kick.runUpDuration))
      : RUN_UP.sweetStart;
    const quality = timingQuality(progress, pressure);
    const error = (1 - quality) * .5 + pressure * PRESSURE.aimErrorAtFullPressure;
    const scatter = (hash01(state.resultSequence * 11.13 + state.round * 5.77) - .5) * 2 * error;
    state.kick.timing = progress;
    state.kick.timingQuality = quality;
    state.kick.struck = true;
    state.kick.runUpActive = false;
    const plan = {
      aimX:unit(state.kick.aimX + scatter),
      // A rushed penalty rises: that is the classic missed-penalty signature.
      aimY:unit(state.kick.aimY + (1 - quality) * .28),
      power:clamp01(state.kick.power * (.72 + quality * .28)),
      curve:unit(state.kick.curve),
      timing:progress, timingQuality:quality, pressure, feints:state.kick.feints,
    };
    setPhase('shot');
    emitEvent('OnPenaltyStrike', Object.assign({round:state.round, team:state.kickingTeam}, plan));
    return plan;
  }

  function kickSnapshot(){
    return {
      aimX:state.kick.aimX, aimY:state.kick.aimY, power:state.kick.power, curve:state.kick.curve,
      runUpActive:state.kick.runUpActive,
      runUpProgress:state.kick.runUpActive ? clamp01(state.kick.runUpElapsed / Math.max(.001, state.kick.runUpDuration)) : 0,
      runUpDuration:state.kick.runUpDuration,
      feints:state.kick.feints, timing:state.kick.timing, timingQuality:state.kick.timingQuality,
      struck:state.kick.struck,
    };
  }

  /* -------------------------------------------------------
     07 Goalkeeper read
     Built when a kick becomes ready, so the keeper has already
     "chosen" before the run-up, exactly like a real penalty.
     js/runtime/soccer-pawns.js asks through keeperCommitment().
     ------------------------------------------------------- */

  function buildKeeperPlan(){
    const skill = keeperSkill(state.keeperSkillId);
    const seed = state.round * 3.11 + (state.kickingTeam === 'A' ? 0 : 1.7) + state.resultSequence * 1.37;
    const guessing = hash01(seed) < skill.guessBias;
    const guessedSide = hash01(seed + 4.2) < .5 ? -1 : 1;
    state.keeperPlan = {
      skill:skill.id,
      guessing,
      side:guessing ? guessedSide : 0,
      readAccuracy:skill.readAccuracy,
      reaction:skill.reaction,
      prediction:skill.prediction,
      reach:skill.reach,
      // Fraction of the run-up at which the keeper commits. A guesser goes early.
      commitProgress:guessing ? .55 + hash01(seed + 8.4) * .2 : .92,
      committed:false,
    };
    return state.keeperPlan;
  }

  /**
   * What the goalkeeper should do right now, or null if it should keep waiting.
   * A penalty keeper that commits BEFORE the ball is readable is what makes a
   * saved penalty look intentional instead of lucky.
   */
  function keeperCommitment(){
    const plan = state.keeperPlan;
    if(!plan || plan.committed) return null;
    if(state.phase === 'shot'){
      plan.committed = true;
      // A reading keeper finally sees the ball: blend the true aim with noise.
      const noise = (hash01(state.resultSequence * 2.71 + state.round) - .5) * 2 * (1 - plan.readAccuracy);
      const lateral = plan.guessing ? plan.side * .8 : unit(state.kick.aimX + noise);
      return {side:lateral >= 0 ? 1 : -1, lateral:unit(lateral), height:state.kick.aimY, reason:plan.guessing ? 'guess' : 'read'};
    }
    if(state.phase !== 'runUp' || !state.kick.runUpActive) return null;
    const progress = state.kick.runUpElapsed / Math.max(.001, state.kick.runUpDuration);
    if(progress < plan.commitProgress) return null;
    plan.committed = true;
    const side = plan.side || (hash01(state.round * 9.1) < .5 ? -1 : 1);
    return {side, lateral:unit(side * .8), height:0, reason:'early'};
  }

  /* -------------------------------------------------------
     08 Presentation
     ------------------------------------------------------- */

  function cameraState(){
    if(!state.presentationCameras) return null;
    const preset = cameraFor(state.phase);
    if(!preset) return null;
    return {preset:preset.id, label:preset.label, hold:preset.hold, remaining:state.cameraHold};
  }

  /* -------------------------------------------------------
     09 State machine
     ------------------------------------------------------- */

  function setPhase(phase){
    if(PHASES.indexOf(phase) < 0) throw new Error('penalty-flow: unknown phase "' + phase + '"');
    if(state.phase === phase) return;
    state.phase = phase;
    const preset = cameraFor(phase);
    state.cameraHold = preset ? preset.hold : 0;
    emitEvent('OnPenaltyPhaseChanged', {
      phase, round:state.round, team:state.kickingTeam, teamName:state.teams[state.kickingTeam].name,
      camera:preset ? preset.id : null,
    });
  }

  function finish(){
    state.winner = score('A') === score('B') ? null : (score('A') > score('B') ? 'A' : 'B');
    setPhase('finished');
    emitEvent('OnShootoutFinished', {
      winner:state.winner,
      winnerName:state.winner ? state.teams[state.winner].name : null,
      scoreA:score('A'), scoreB:score('B'),
    });
  }

  function prepareKick(){
    state.kick = newKick(state.runUpSeconds);
    buildKeeperPlan();
    setPhase('ready');
    emitEvent('OnPenaltyKickReady', {
      round:state.round, team:state.kickingTeam, teamName:state.teams[state.kickingTeam].name,
      suddenDeath:state.suddenDeath, pressure:pressureFor(state.kickingTeam),
    });
  }

  function advance(){
    if(state.pendingAdvance){ clearTimeout(state.pendingAdvance); state.pendingAdvance = null; }
    state.advanceTimer = 0;
    if(state.phase === 'finished' || state.phase === 'idle') return;
    if(decided()){ finish(); return; }
    if(remaining('A') === 0 && remaining('B') === 0 && score('A') === score('B')) state.suddenDeath = true;
    state.lastResult = null;
    state.kickingTeam = other(state.kickingTeam);
    if(state.kickingTeam === 'A') state.round++;
    const soccerBall = GAME && GAME.systems && GAME.systems.soccerBall;
    if(soccerBall && state.ballId){ soccerBall.reset(state.ballId); if(soccerBall.setMode) soccerBall.setMode(state.ballId, 'penalty', true); }
    prepareKick();
  }

  function recordResult(result){
    if(state.phase !== 'shot' && state.phase !== 'runUp' && state.phase !== 'aim' && state.phase !== 'ready') return;
    const value = RESULTS.indexOf(text(result, '')) >= 0 ? text(result, '') : 'miss';
    const team = state.kickingTeam;
    state.teams[team].kicks.push(value);
    state.lastResult = value;
    state.resultSequence++;
    setPhase('resolved');
    emitEvent('OnPenaltyResult', {
      result:value, team, teamName:state.teams[team].name, round:state.round,
      scoreA:score('A'), scoreB:score('B'), suddenDeath:state.suddenDeath,
      timingQuality:state.kick.timingQuality, feints:state.kick.feints,
    });
    // Both a wall clock and a tick clock drive the next kick: a level that never
    // calls update() still advances, one that does gets frame-accurate timing.
    state.advanceTimer = Math.max(LIMITS.autoAdvanceDelay.min, state.autoAdvanceDelay);
    state.pendingAdvance = setTimeout(advance, Math.max(200, state.autoAdvanceDelay * 1000));
  }

  function onPawnEvent(event){
    const detail = event && event.detail || {};
    if(state.phase === 'idle' || state.phase === 'finished') return;
    if(state.ballId && detail.ballId && String(detail.ballId) !== String(state.ballId)) return;
    if(detail.type === 'OnBallKicked') setPhase('shot');
    else if(detail.type === 'OnGoalScored') recordResult('goal');
    else if(detail.type === 'OnBallSaved') recordResult('saved');
    else if(detail.type === 'OnBallOut') recordResult('miss');
  }

  function listen(){
    if(state.listening || typeof root.addEventListener !== 'function') return;
    root.addEventListener('lk-pawn-event', onPawnEvent);
    state.listening = true;
  }

  /** Frame driver: run-up timeline, camera holds and the tick-based advance. */
  function update(dt){
    const step = clamp(finite(dt, 0), 0, .25);
    if(state.cameraHold > 0) state.cameraHold = Math.max(0, state.cameraHold - step);
    if(state.kick.runUpActive){
      state.kick.runUpElapsed += step;
      // Overrunning the run-up strikes automatically rather than stalling.
      if(state.kick.runUpElapsed >= state.kick.runUpDuration) return strike();
    }
    if(state.advanceTimer > 0){
      state.advanceTimer = Math.max(0, state.advanceTimer - step);
      if(state.advanceTimer === 0 && state.phase === 'resolved') advance();
    }
    return null;
  }

  /* -------------------------------------------------------
     10 Configuration and public API
     ------------------------------------------------------- */

  function configure(options){
    const opts = options || {};
    const kicks = LIMITS.kicksPerTeam, delay = LIMITS.autoAdvanceDelay;
    state.kicksPerTeam = clamp(finite(opts.kicksPerTeam, kicks.fallback) | 0, kicks.min, kicks.max);
    if(opts.teamA != null) state.teams.A.name = text(opts.teamA, 'Home');
    if(opts.teamB != null) state.teams.B.name = text(opts.teamB, 'Away');
    if(opts.ballId != null) state.ballId = String(opts.ballId);
    if(opts.autoAdvanceDelay != null) state.autoAdvanceDelay = clamp(finite(opts.autoAdvanceDelay, delay.fallback), delay.min, delay.max);
    if(opts.keeperSkill != null) state.keeperSkillId = keeperSkill(opts.keeperSkill).id;
    if(opts.runUpSeconds != null) state.runUpSeconds = clamp(finite(opts.runUpSeconds, RUN_UP.defaultSeconds), RUN_UP.minSeconds, RUN_UP.maxSeconds);
    if(opts.presentationCameras != null) state.presentationCameras = opts.presentationCameras !== false;
    if(opts.pressureEnabled != null) state.pressureEnabled = opts.pressureEnabled !== false;
    const soccerBall = GAME && GAME.systems && GAME.systems.soccerBall;
    if(soccerBall && state.ballId && soccerBall.setMode) soccerBall.setMode(state.ballId, 'penalty', true);
    return snapshot();
  }

  function start(){
    reset(true);
    listen();
    prepareKick();
    return snapshot();
  }

  function beginKick(){
    if(state.phase === 'ready') setPhase('aim');
    return snapshot();
  }

  function reset(keepConfig){
    if(state.pendingAdvance){ clearTimeout(state.pendingAdvance); state.pendingAdvance = null; }
    state.advanceTimer = 0;
    state.round = 1;
    state.kickingTeam = 'A';
    state.teams.A.kicks = [];
    state.teams.B.kicks = [];
    state.suddenDeath = false;
    state.winner = null;
    state.lastResult = null;
    state.phase = 'idle';
    state.keeperPlan = null;
    state.cameraHold = 0;
    if(keepConfig !== true){
      state.kicksPerTeam = LIMITS.kicksPerTeam.fallback;
      state.teams.A.name = 'Home';
      state.teams.B.name = 'Away';
      state.ballId = null;
      state.keeperSkillId = DEFAULT_KEEPER_SKILL;
      state.runUpSeconds = RUN_UP.defaultSeconds;
      state.presentationCameras = true;
      state.pressureEnabled = true;
    }
    state.kick = newKick(state.runUpSeconds);
    return snapshot();
  }

  function snapshot(){
    return {
      schemaVersion:SCHEMA_VERSION,
      phase:state.phase,
      round:state.round,
      kickingTeam:state.kickingTeam,
      kickingTeamName:state.teams[state.kickingTeam].name,
      kicksPerTeam:state.kicksPerTeam,
      suddenDeath:state.suddenDeath,
      scoreA:score('A'), scoreB:score('B'),
      kicksA:state.teams.A.kicks.slice(), kicksB:state.teams.B.kicks.slice(),
      teamA:state.teams.A.name, teamB:state.teams.B.name,
      finished:state.phase === 'finished',
      winner:state.winner,
      winnerName:state.winner ? state.teams[state.winner].name : null,
      lastResult:state.lastResult,
      resultSequence:state.resultSequence,
      // --- v2 ---
      pressure:pressureFor(state.kickingTeam),
      keeperSkill:state.keeperSkillId,
      kick:kickSnapshot(),
      camera:cameraState(),
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    configure, start, beginKick, recordResult, advance, reset, update,
    aim, beginRunUp, feint, strike,
    keeperPlan:() => state.keeperPlan,
    keeperCommitment,
    pressure:() => pressureFor(state.kickingTeam),
    state:snapshot,
  });
}

function install(GAME){
  if(!GAME) return null;
  if(GAME.systems && GAME.systems.penaltyFlow && GAME.systems.penaltyFlow.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.penaltyFlow;
  const api = create(GAME);
  if(GAME.systems) GAME.systems.penaltyFlow = api;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkPenaltyFlowFrame){
    GAME.hooks.__lkPenaltyFlowFrame = true;
    GAME.hooks.frame.push(dt => api.update(dt));
  }
  return api;
}

root.LK_RUNTIME_PENALTY_FLOW = Object.freeze({
  SCHEMA_VERSION, PHASES, RESULTS, TEAMS, RUN_UP, KEEPER_SKILL, KEEPER_SKILL_IDS, PRESSURE, CAMERAS, LIMITS,
  create, install,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_PENALTY_FLOW;
if(root.LOT_KING) install(root.LOT_KING);
})();
