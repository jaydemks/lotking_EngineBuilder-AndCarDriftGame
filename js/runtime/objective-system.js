/* =========================================================
   LOT KING - Objective / Mission director

   The shared goal layer behind every buildable game mode: snowboarding runs,
   the cat neighbourhood, the jungle escape and the FPS arena all describe what
   the player has to do with the same descriptor instead of each shipping a
   private scoring script.

   The director owns no gameplay. It observes Pawn positions for proximity
   objectives and otherwise waits to be told what happened through notify() /
   progress(), so a Logic graph, a runtime module or a collision trigger can all
   feed the same mission.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;

const KINDS = Object.freeze([
  'reach',      // enter a radius around a point or scene object
  'collect',    // gather N tagged pickups
  'eliminate',  // defeat N tagged targets
  'survive',    // stay alive / un-failed for N seconds
  'timeTrial',  // finish the mission under N seconds
  'gates',      // pass N ordered checkpoints
  'score',      // reach a score threshold
  'escort',     // keep a tagged actor alive until the mission ends
  'avoid',      // never trigger a tagged event
  'custom',     // driven entirely by Logic nodes
]);
const MODES = Object.freeze(['sequence', 'parallel', 'any']);
const STATES = Object.freeze(['locked', 'active', 'complete', 'failed']);

function finite(value, fallback){
  value = Number(value);
  return Number.isFinite(value) ? value : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function text(value, fallback){
  value = value == null ? '' : String(value);
  return value || (fallback == null ? '' : String(fallback));
}
function clone(value){
  try { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  catch(err){ return value; }
}

let autoId = 0;

function normalizeTarget(source){
  const src = source && typeof source === 'object' ? source : {};
  const position = src.position && typeof src.position === 'object' ? src.position : {};
  return {
    objectId:text(src.objectId),
    tag:text(src.tag),
    position:{x:finite(position.x), y:finite(position.y), z:finite(position.z)},
    radius:clamp(src.radius == null ? 2.5 : src.radius, .1, 5000),
    // A reach objective normally wants the possessed Pawn; an escort wants the
    // escorted actor. Explicit ids win over the player fallback either way.
    playerId:src.playerId == null ? null : clamp(src.playerId, 1, 4),
  };
}

function normalizeObjective(source, index){
  const src = source && typeof source === 'object' ? source : {};
  const kind = KINDS.indexOf(text(src.kind)) >= 0 ? text(src.kind) : 'custom';
  const count = Math.max(1, Math.round(finite(src.count, 1)));
  return {
    id:text(src.id, 'objective_' + (++autoId)),
    title:text(src.title, 'Objective ' + (finite(index, 0) + 1)),
    description:text(src.description),
    kind,
    order:finite(src.order, finite(index, 0)),
    optional:src.optional === true,
    hidden:src.hidden === true,
    // `avoid` is a constraint: tripping it fails the mission by default, while
    // an optional bonus objective never should.
    failsMission:src.failsMission == null ? (kind === 'avoid' || kind === 'escort') && src.optional !== true : src.failsMission === true,
    count,
    duration:clamp(src.duration, 0, 86400),
    points:finite(src.points, 100),
    target:normalizeTarget(src.target),
    completeEvent:text(src.completeEvent),
    failEvent:text(src.failEvent),
  };
}

function normalizeMission(source){
  const src = source && typeof source === 'object' ? source : {};
  const hud = src.hud && typeof src.hud === 'object' ? src.hud : {};
  const objectives = (Array.isArray(src.objectives) ? src.objectives : [])
    .map(normalizeObjective)
    .sort((a, b) => a.order - b.order);
  return {
    schemaVersion:SCHEMA_VERSION,
    enabled:src.enabled !== false,
    id:text(src.id, 'mission'),
    title:text(src.title, 'Mission'),
    subtitle:text(src.subtitle),
    mode:MODES.indexOf(text(src.mode)) >= 0 ? text(src.mode) : 'sequence',
    timeLimit:clamp(src.timeLimit, 0, 86400),
    failOnTimeout:src.failOnTimeout !== false,
    scoreTarget:finite(src.scoreTarget, 0),
    startDelay:clamp(src.startDelay, 0, 60),
    restartOnFail:src.restartOnFail === true,
    hud:{
      enabled:hud.enabled !== false,
      position:['top-left','top-right','bottom-left','bottom-right'].indexOf(text(hud.position)) >= 0 ? text(hud.position) : 'top-right',
      showTimer:hud.showTimer !== false,
      showScore:hud.showScore !== false,
      showProgress:hud.showProgress !== false,
      showOptional:hud.showOptional !== false,
    },
    completeEvent:text(src.completeEvent),
    failEvent:text(src.failEvent),
    objectives,
  };
}

function emit(GAME, type, detail){
  const payload = Object.assign({type}, detail || {});
  const runner = GAME && GAME.systems && GAME.systems.logic;
  if(runner && runner.triggerRuntimeEvent) runner.triggerRuntimeEvent(type, payload);
  if(typeof root.dispatchEvent === 'function' && typeof root.CustomEvent === 'function'){
    root.dispatchEvent(new root.CustomEvent('lk-mission-event', {detail:payload}));
  }
}

/** World position of whatever an objective is watching: an explicit scene
 *  object, otherwise the Pawn possessed by the relevant player. */
function trackedPosition(GAME, target){
  if(target.objectId && GAME && GAME.world && Array.isArray(GAME.world.registry)){
    const object = GAME.world.registry.find(item => item && item.userData && item.userData.editorId === target.objectId);
    if(object && object.getWorldPosition && root.THREE) return object.getWorldPosition(new root.THREE.Vector3());
    if(object && object.position) return object.position;
  }
  const playerId = target.playerId == null ? 1 : target.playerId;
  const pawn = GAME && GAME.pawns && GAME.pawns.getByPlayerId ? GAME.pawns.getByPlayerId(playerId) : null;
  if(!pawn) return null;
  if(pawn.body && pawn.body.position) return pawn.body.position;
  if(pawn.owner && pawn.owner.getWorldPosition && root.THREE) return pawn.owner.getWorldPosition(new root.THREE.Vector3());
  return pawn.owner && pawn.owner.position || null;
}

function distanceSquared(a, b){
  const dx = finite(a.x) - finite(b.x), dy = finite(a.y) - finite(b.y), dz = finite(a.z) - finite(b.z);
  return dx * dx + dy * dy + dz * dz;
}

function create(GAME){
  const state = {
    mission:normalizeMission(null),
    records:new Map(),
    running:false,
    finished:false,
    outcome:null,
    elapsed:0,
    startDelay:0,
    score:0,
  };

  function record(objective){
    return {
      id:objective.id,
      objective,
      status:'locked',
      progress:0,
      timer:0,
      revealed:!objective.hidden,
    };
  }

  function records(){ return Array.from(state.records.values()); }
  function required(){ return records().filter(item => !item.objective.optional && item.objective.kind !== 'avoid'); }

  function activate(item){
    if(item.status !== 'locked') return false;
    item.status = 'active';
    item.revealed = true;
    emit(GAME, 'OnObjectiveActivated', {missionId:state.mission.id, objectiveId:item.id, objective:clone(item.objective)});
    return true;
  }

  /** Sequence missions reveal one required objective at a time; parallel/any
   *  arm everything at once. `avoid` constraints are always armed. */
  function refreshActivation(){
    if(state.mission.mode === 'sequence'){
      const pending = records().filter(item => item.status === 'locked' && (item.objective.optional || item.objective.kind === 'avoid'));
      pending.forEach(activate);
      const next = required().find(item => item.status === 'locked' || item.status === 'active');
      if(next) activate(next);
      return;
    }
    records().forEach(activate);
  }

  function finish(outcome, reason){
    if(state.finished) return false;
    state.finished = true;
    state.running = false;
    state.outcome = outcome;
    const payload = {
      missionId:state.mission.id, outcome, reason:text(reason),
      elapsed:state.elapsed, score:state.score, snapshot:snapshot(),
    };
    emit(GAME, outcome === 'complete' ? 'OnMissionCompleted' : 'OnMissionFailed', payload);
    const named = outcome === 'complete' ? state.mission.completeEvent : state.mission.failEvent;
    if(named && GAME && GAME.systems && GAME.systems.logic && GAME.systems.logic.trigger){
      GAME.systems.logic.trigger(named, payload);
    }
    return true;
  }

  function evaluateMission(){
    if(state.finished) return;
    const needed = required();
    if(needed.length && needed.every(item => item.status === 'complete')){
      if(state.mission.scoreTarget > 0 && state.score < state.mission.scoreTarget) return;
      finish('complete', 'objectives');
      return;
    }
    if(state.mission.mode === 'any' && needed.some(item => item.status === 'complete')){ finish('complete', 'any'); return; }
    if(needed.length && needed.every(item => item.status === 'failed')) finish('fail', 'objectives');
  }

  function complete(objectiveId, options){
    const item = state.records.get(text(objectiveId));
    if(!item || item.status === 'complete' || item.status === 'failed') return false;
    item.status = 'complete';
    item.progress = 1;
    if(!(options && options.silent)) state.score += item.objective.points;
    emit(GAME, 'OnObjectiveCompleted', {missionId:state.mission.id, objectiveId:item.id, points:item.objective.points, score:state.score});
    if(item.objective.completeEvent && GAME && GAME.systems && GAME.systems.logic && GAME.systems.logic.trigger){
      GAME.systems.logic.trigger(item.objective.completeEvent, {objectiveId:item.id});
    }
    refreshActivation();
    evaluateMission();
    return true;
  }

  function fail(objectiveId, reason){
    const item = state.records.get(text(objectiveId));
    if(!item || item.status === 'complete' || item.status === 'failed') return false;
    item.status = 'failed';
    emit(GAME, 'OnObjectiveFailed', {missionId:state.mission.id, objectiveId:item.id, reason:text(reason)});
    if(item.objective.failEvent && GAME && GAME.systems && GAME.systems.logic && GAME.systems.logic.trigger){
      GAME.systems.logic.trigger(item.objective.failEvent, {objectiveId:item.id});
    }
    if(item.objective.failsMission){ finish('fail', 'objective:' + item.id); return true; }
    refreshActivation();
    evaluateMission();
    return true;
  }

  /** Advance a counted objective. Returns the new 0..1 progress, or -1 when the
   *  objective is not currently accepting progress. */
  function progress(objectiveId, delta){
    const item = state.records.get(text(objectiveId));
    if(!item || item.status !== 'active') return -1;
    const step = finite(delta, 1);
    const count = item.objective.count;
    item.progress = clamp(item.progress + step / count, 0, 1);
    emit(GAME, 'OnObjectiveProgress', {missionId:state.mission.id, objectiveId:item.id, progress:item.progress});
    if(item.progress >= 1) complete(item.id);
    return item.progress;
  }

  /** Route a gameplay event to every active objective that is listening for it.
   *  `collect`, `eliminate` and `gates` count occurrences of their tag;
   *  `avoid` fails on one. Returns how many objectives reacted. */
  function notify(kind, payload){
    kind = text(kind);
    const detail = payload && typeof payload === 'object' ? payload : {};
    const tag = text(detail.tag);
    // Resolve the eligible set up front: completing one objective can arm the
    // next in sequence mode, and a single gameplay event must not cascade into
    // an objective that was still locked when it happened.
    const eligible = records().filter(item => {
      if(item.status !== 'active') return false;
      const objective = item.objective;
      if(objective.kind !== kind) return false;
      if(objective.target.tag) return tag ? objective.target.tag === tag : false;
      return true;
    });
    let handled = eligible.length;
    eligible.forEach(item => {
      if(item.status !== 'active') return;
      if(kind === 'avoid'){ fail(item.id, 'avoid:' + tag); return; }
      progress(item.id, finite(detail.amount, 1));
    });
    if(kind === 'score'){
      addScore(finite(detail.amount, 0));
      handled++;
    }
    return handled;
  }

  function addScore(amount){
    state.score += finite(amount, 0);
    const scored = records().filter(item => item.status === 'active' && item.objective.kind === 'score');
    scored.forEach(item => {
      if(item.status !== 'active') return;
      const threshold = item.objective.count;
      item.progress = clamp(state.score / Math.max(1, threshold), 0, 1);
      if(item.progress >= 1) complete(item.id);
    });
    evaluateMission();
    return state.score;
  }

  function load(mission){
    state.mission = normalizeMission(mission);
    state.records = new Map(state.mission.objectives.map(objective => [objective.id, record(objective)]));
    state.running = false;
    state.finished = false;
    state.outcome = null;
    state.elapsed = 0;
    state.score = 0;
    state.startDelay = state.mission.startDelay;
    return state.mission;
  }

  function start(){
    if(!state.mission.enabled) return false;
    state.running = true;
    state.finished = false;
    state.outcome = null;
    state.elapsed = 0;
    state.score = 0;
    state.startDelay = state.mission.startDelay;
    state.records = new Map(state.mission.objectives.map(objective => [objective.id, record(objective)]));
    refreshActivation();
    emit(GAME, 'OnMissionStarted', {missionId:state.mission.id, title:state.mission.title, snapshot:snapshot()});
    return true;
  }

  function stop(){
    state.running = false;
    return true;
  }
  function reset(){
    return load(state.mission) && start();
  }

  function updateProximity(item, dt){
    const objective = item.objective;
    if(objective.kind !== 'reach' && objective.kind !== 'escort') return;
    const position = trackedPosition(GAME, objective.target);
    if(!position) return;
    const inside = distanceSquared(position, objective.target.position) <= objective.target.radius * objective.target.radius;
    if(objective.kind === 'reach'){
      if(inside) complete(item.id);
      return;
    }
    // Escort: the actor must still exist. Leaving the radius is not a failure,
    // losing the actor entirely is — handled through notify('escort').
    if(!inside && objective.duration > 0){
      item.timer += dt;
      if(item.timer >= objective.duration) fail(item.id, 'escort-drift');
    } else item.timer = 0;
  }

  function updateTimed(item, dt){
    const objective = item.objective;
    if(objective.kind === 'survive'){
      item.timer += dt;
      item.progress = objective.duration > 0 ? clamp(item.timer / objective.duration, 0, 1) : 0;
      if(objective.duration > 0 && item.timer >= objective.duration) complete(item.id);
      return;
    }
    if(objective.kind === 'timeTrial' && objective.duration > 0){
      item.progress = clamp(state.elapsed / objective.duration, 0, 1);
      if(state.elapsed >= objective.duration) fail(item.id, 'timeout');
    }
  }

  function update(dt){
    if(!state.running || state.finished) return;
    const step = clamp(dt, 0, .25);
    if(state.startDelay > 0){
      state.startDelay = Math.max(0, state.startDelay - step);
      return;
    }
    state.elapsed += step;
    records().forEach(item => {
      if(item.status !== 'active') return;
      updateProximity(item, step);
      updateTimed(item, step);
    });
    if(state.mission.timeLimit > 0 && state.elapsed >= state.mission.timeLimit && state.mission.failOnTimeout){
      finish('fail', 'time-limit');
    }
  }

  function snapshot(){
    return {
      missionId:state.mission.id,
      title:state.mission.title,
      subtitle:state.mission.subtitle,
      mode:state.mission.mode,
      running:state.running,
      finished:state.finished,
      outcome:state.outcome,
      elapsed:state.elapsed,
      timeLimit:state.mission.timeLimit,
      timeRemaining:state.mission.timeLimit > 0 ? Math.max(0, state.mission.timeLimit - state.elapsed) : 0,
      score:state.score,
      scoreTarget:state.mission.scoreTarget,
      hud:Object.assign({}, state.mission.hud),
      objectives:records()
        .filter(item => item.revealed)
        .map(item => ({
          id:item.id,
          title:item.objective.title,
          description:item.objective.description,
          kind:item.objective.kind,
          optional:item.objective.optional,
          status:item.status,
          progress:item.progress,
          count:item.objective.count,
          current:Math.round(item.progress * item.objective.count),
          points:item.objective.points,
        })),
    };
  }

  function get(objectiveId){
    const item = state.records.get(text(objectiveId));
    return item ? {id:item.id, status:item.status, progress:item.progress, objective:clone(item.objective)} : null;
  }

  return Object.freeze({
    SCHEMA_VERSION,
    load, start, stop, reset, update,
    notify, progress, complete, fail, addScore, get, snapshot,
    mission:() => clone(state.mission),
    score:() => state.score,
    running:() => state.running,
    outcome:() => state.outcome,
  });
}

/** The director drives itself from the shared frame hook rather than from the
 *  Logic runner, so a mission keeps ticking even in a level whose only Logic
 *  Element is the Mission Director itself. */
function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.objectives && GAME.systems.objectives.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.objectives;
  const director = create(GAME);
  GAME.systems.objectives = director;

  const hud = root.LK_RUNTIME_OBJECTIVE_HUD && root.LK_RUNTIME_OBJECTIVE_HUD.create
    ? root.LK_RUNTIME_OBJECTIVE_HUD.create(GAME)
    : null;
  if(hud && hud.install) hud.install();
  GAME.systems.objectiveHud = hud;

  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkObjectiveFrame){
    GAME.hooks.__lkObjectiveFrame = true;
    GAME.hooks.frame.push(dt => {
      director.update(dt);
      if(hud) hud.update(dt);
    });
  }
  return director;
}

function boot(){
  const GAME = root.LOT_KING;
  if(GAME) install(GAME);
}

root.LK_RUNTIME_OBJECTIVES = Object.freeze({SCHEMA_VERSION, KINDS, MODES, STATES, normalizeMission, normalizeObjective, create, install, boot});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_OBJECTIVES;
if(root.LOT_KING) boot();
else if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
})();
