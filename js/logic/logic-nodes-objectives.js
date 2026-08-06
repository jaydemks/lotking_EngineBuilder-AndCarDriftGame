/* =========================================================
   LOT KING - Objective / Mission node pack

   Graph surface for js/runtime/objective-system.js. Every buildable game mode
   describes its goals through these nodes, so snowboarding gates, cat tasks,
   jungle checkpoints and FPS mission flow all share one scoring model instead
   of each shipping a private script.
   ========================================================= */
(function(){
'use strict';

const execIn = {name:'exec', kind:'exec', direction:'input'};
const completedOut = {name:'completed', kind:'exec', direction:'output'};
const thenOut = {name:'then', kind:'exec', direction:'output'};
const dataIn = (name, type, value) => ({name, kind:'data', direction:'input', type:type || 'any', defaultValue:value});
const dataOut = (name, type) => ({name, kind:'data', direction:'output', type:type || 'any'});
const number = value => Number(value) || 0;
const text = value => value == null ? '' : String(value);

function director(api){
  const GAME = api && api.context && api.context.GAME;
  if(GAME && GAME.systems && GAME.systems.objectives) return GAME.systems.objectives;
  const factory = typeof window !== 'undefined' && window.LK_RUNTIME_OBJECTIVES;
  return factory && GAME && factory.install ? factory.install(GAME) : null;
}

/** Mission data comes from the owning graph's `missionDirector` descriptor
 *  unless the node is given an explicit object, so the editor stays the
 *  authoring surface and the node stays a trigger. */
function missionSource(api){
  const explicit = api.getInput('mission');
  if(explicit && typeof explicit === 'object') return explicit;
  const graph = api.context && api.context.graph;
  return graph && graph.missionDirector || null;
}

function registerObjectiveNodes(registry){
  // ------------------------------------------------------------- lifecycle
  registry.register({
    type:'objectives.startMission', title:'Start Mission', category:'Objectives',
    description:"Loads this Logic Element's Mission Director data (or an explicit mission object) and starts tracking it.",
    inputs:[execIn, dataIn('mission', 'any', null)],
    outputs:[completedOut, dataOut('started', 'boolean')],
    run(api){
      const api2 = director(api);
      const mission = missionSource(api);
      let started = false;
      if(api2 && mission){
        api2.load(mission);
        started = api2.start();
      }
      api.node.data.__mission = started;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__mission === true; },
  });
  registry.register({
    type:'objectives.stopMission', title:'Stop Mission', category:'Objectives',
    description:'Stops mission tracking without marking it complete or failed.',
    inputs:[execIn], outputs:[completedOut],
    run(api){ const d = director(api); if(d) d.stop(); return {exec:'completed'}; },
  });
  registry.register({
    type:'objectives.resetMission', title:'Restart Mission', category:'Objectives',
    description:'Restores every objective to its initial state and starts again from zero score.',
    inputs:[execIn], outputs:[completedOut],
    run(api){ const d = director(api); if(d) d.reset(); return {exec:'completed'}; },
  });

  // -------------------------------------------------------------- progress
  registry.register({
    type:'objectives.notify', title:'Report Gameplay Event', category:'Objectives',
    description:'Tells the mission something happened. Every active objective of the matching kind and tag advances by amount.',
    inputs:[
      execIn,
      dataIn('kind', 'string', 'collect'),
      dataIn('tag', 'string', ''),
      dataIn('amount', 'number', 1),
    ],
    outputs:[completedOut, dataOut('handled', 'number')],
    run(api){
      const d = director(api);
      api.node.data.__handled = d ? d.notify(text(api.getInput('kind')), {tag:text(api.getInput('tag')), amount:number(api.getInput('amount'))}) : 0;
      return {exec:'completed'};
    },
    evaluate(api){ return number(api.node.data.__handled); },
  });
  registry.register({
    type:'objectives.progress', title:'Advance Objective', category:'Objectives',
    description:'Advances one objective by delta counts. Completing it is automatic when it reaches its required count.',
    inputs:[execIn, dataIn('objectiveId', 'string', ''), dataIn('delta', 'number', 1)],
    outputs:[completedOut, dataOut('progress', 'number')],
    run(api){
      const d = director(api);
      api.node.data.__progress = d ? d.progress(text(api.getInput('objectiveId')), number(api.getInput('delta'))) : -1;
      return {exec:'completed'};
    },
    evaluate(api){ return number(api.node.data.__progress); },
  });
  registry.register({
    type:'objectives.complete', title:'Complete Objective', category:'Objectives',
    description:'Marks one objective complete immediately and awards its points.',
    inputs:[execIn, dataIn('objectiveId', 'string', '')],
    outputs:[completedOut, dataOut('changed', 'boolean')],
    run(api){
      const d = director(api);
      api.node.data.__done = !!(d && d.complete(text(api.getInput('objectiveId'))));
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__done === true; },
  });
  registry.register({
    type:'objectives.fail', title:'Fail Objective', category:'Objectives',
    description:'Marks one objective failed. If that objective is flagged as mission-critical the whole mission fails.',
    inputs:[execIn, dataIn('objectiveId', 'string', ''), dataIn('reason', 'string', '')],
    outputs:[completedOut, dataOut('changed', 'boolean')],
    run(api){
      const d = director(api);
      api.node.data.__failed = !!(d && d.fail(text(api.getInput('objectiveId')), text(api.getInput('reason'))));
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__failed === true; },
  });
  registry.register({
    type:'objectives.addScore', title:'Add Mission Score', category:'Objectives',
    description:'Adds points to the mission total and advances any active score objective.',
    inputs:[execIn, dataIn('amount', 'number', 0)],
    outputs:[completedOut, dataOut('score', 'number')],
    run(api){
      const d = director(api);
      api.node.data.__score = d ? d.addScore(number(api.getInput('amount'))) : 0;
      return {exec:'completed'};
    },
    evaluate(api){ return number(api.node.data.__score); },
  });

  // ----------------------------------------------------------------- reads
  registry.register({
    type:'objectives.getMissionState', title:'Get Mission State', category:'Objectives',
    description:'Reads live mission tracking: running/finished flags, outcome, score, elapsed time and remaining time.',
    outputs:[
      dataOut('running', 'boolean'), dataOut('finished', 'boolean'), dataOut('outcome', 'string'),
      dataOut('score', 'number'), dataOut('elapsed', 'number'), dataOut('timeRemaining', 'number'),
      dataOut('completedCount', 'number'), dataOut('totalCount', 'number'),
    ],
    evaluate(api, pin){
      const d = director(api);
      if(!d) return pin === 'running' || pin === 'finished' ? false : (pin === 'outcome' ? '' : 0);
      const snapshot = d.snapshot();
      if(pin === 'running') return snapshot.running === true;
      if(pin === 'finished') return snapshot.finished === true;
      if(pin === 'outcome') return text(snapshot.outcome);
      if(pin === 'completedCount') return snapshot.objectives.filter(item => item.status === 'complete').length;
      if(pin === 'totalCount') return snapshot.objectives.length;
      return number(snapshot[pin]);
    },
  });
  registry.register({
    type:'objectives.getObjective', title:'Get Objective', category:'Objectives',
    description:'Reads the status and progress of one objective by id.',
    inputs:[dataIn('objectiveId', 'string', '')],
    outputs:[dataOut('status', 'string'), dataOut('progress', 'number'), dataOut('complete', 'boolean'), dataOut('active', 'boolean')],
    evaluate(api, pin){
      const d = director(api);
      const item = d ? d.get(text(api.getInput('objectiveId'))) : null;
      if(!item) return pin === 'status' ? '' : (pin === 'progress' ? 0 : false);
      if(pin === 'status') return item.status;
      if(pin === 'progress') return number(item.progress);
      if(pin === 'complete') return item.status === 'complete';
      return item.status === 'active';
    },
  });

  // ---------------------------------------------------------------- events
  registry.register({type:'event.onMissionStarted', title:'On Mission Started', category:'Objective Events',
    description:'Runs when a mission begins tracking.', event:'OnMissionStarted',
    outputs:[thenOut, dataOut('missionId', 'string'), dataOut('title', 'string')]});
  registry.register({type:'event.onMissionCompleted', title:'On Mission Completed', category:'Objective Events',
    description:'Runs when every required objective is complete.', event:'OnMissionCompleted',
    outputs:[thenOut, dataOut('missionId', 'string'), dataOut('score', 'number'), dataOut('elapsed', 'number')]});
  registry.register({type:'event.onMissionFailed', title:'On Mission Failed', category:'Objective Events',
    description:'Runs when the mission fails, including the time limit expiring.', event:'OnMissionFailed',
    outputs:[thenOut, dataOut('missionId', 'string'), dataOut('reason', 'string'), dataOut('score', 'number')]});
  registry.register({type:'event.onObjectiveActivated', title:'On Objective Activated', category:'Objective Events',
    description:'Runs when an objective becomes the current goal.', event:'OnObjectiveActivated',
    outputs:[thenOut, dataOut('objectiveId', 'string')]});
  registry.register({type:'event.onObjectiveCompleted', title:'On Objective Completed', category:'Objective Events',
    description:'Runs when one objective is completed.', event:'OnObjectiveCompleted',
    outputs:[thenOut, dataOut('objectiveId', 'string'), dataOut('points', 'number'), dataOut('score', 'number')]});
  registry.register({type:'event.onObjectiveFailed', title:'On Objective Failed', category:'Objective Events',
    description:'Runs when one objective fails.', event:'OnObjectiveFailed',
    outputs:[thenOut, dataOut('objectiveId', 'string'), dataOut('reason', 'string')]});
  registry.register({type:'event.onObjectiveProgress', title:'On Objective Progress', category:'Objective Events',
    description:'Runs each time an objective advances without completing.', event:'OnObjectiveProgress',
    outputs:[thenOut, dataOut('objectiveId', 'string'), dataOut('progress', 'number')]});

  return registry;
}

const packs = window.LK_LOGIC_NODE_PACKS || (window.LK_LOGIC_NODE_PACKS = []);
packs.push(registerObjectiveNodes);
window.LK_LOGIC_NODES_OBJECTIVES = Object.freeze({register:registerObjectiveNodes});
})();
