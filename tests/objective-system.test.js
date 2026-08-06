'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/runtime/objective-system.js');
const OBJECTIVES = global.LK_RUNTIME_OBJECTIVES;

function makeGame(){
  const events = [];
  const custom = [];
  return {
    events, custom,
    state:{started:true},
    hooks:{frame:[]},
    world:{registry:[]},
    pawns:{
      positions:new Map(),
      getByPlayerId(id){
        const position = this.positions.get(id);
        return position ? {body:{position}} : null;
      },
    },
    systems:{
      logic:{
        triggerRuntimeEvent(type, payload){ events.push({type, payload}); },
        trigger(name, payload){ custom.push({name, payload}); },
      },
    },
  };
}
function types(game){ return game.events.map(item => item.type); }

function run(){
  // --- normalization -------------------------------------------------------
  const normalized = OBJECTIVES.normalizeMission({
    title:'Run', mode:'nonsense', timeLimit:-40, scoreTarget:'250',
    objectives:[
      {id:'b', title:'Second', kind:'collect', count:3.6, order:2},
      {id:'a', title:'First', kind:'reach', order:1, target:{radius:-5, position:{x:1,y:2,z:3}}},
      {id:'c', kind:'not-a-kind', order:3},
    ],
  });
  assert.equal(normalized.mode, 'sequence', 'an unknown flow mode falls back to sequence');
  assert.equal(normalized.timeLimit, 0, 'a negative time limit clamps to no limit');
  assert.equal(normalized.scoreTarget, 250, 'numeric strings are coerced');
  assert.deepEqual(normalized.objectives.map(o => o.id), ['a','b','c'], 'objectives are sorted by order');
  assert.equal(normalized.objectives[1].count, 4, 'counts round to whole units');
  assert.equal(normalized.objectives[0].target.radius, 0.1, 'a non-positive radius clamps to the minimum');
  assert.equal(normalized.objectives[2].kind, 'custom', 'an unknown kind falls back to custom');
  assert.equal(normalized.objectives[2].title, 'Objective 3', 'a missing title falls back to its position');
  assert.equal(normalized.hud.enabled, true, 'the HUD is on by default');

  const avoid = OBJECTIVES.normalizeObjective({id:'x', kind:'avoid'}, 0);
  assert.equal(avoid.failsMission, true, 'an avoid constraint fails the mission by default');
  const optionalAvoid = OBJECTIVES.normalizeObjective({id:'y', kind:'avoid', optional:true}, 0);
  assert.equal(optionalAvoid.failsMission, false, 'an optional avoid never fails the mission');

  // --- sequence flow -------------------------------------------------------
  {
    const game = makeGame();
    const director = OBJECTIVES.create(game);
    director.load({
      id:'seq', mode:'sequence',
      objectives:[
        {id:'one', kind:'collect', count:2, points:50},
        {id:'two', kind:'collect', count:1, points:50},
      ],
    });
    director.start();
    assert.equal(director.get('one').status, 'active');
    assert.equal(director.get('two').status, 'locked', 'sequence mode arms one required objective at a time');

    assert.equal(director.notify('collect', {}), 1, 'an untagged objective accepts an untagged event');
    assert.equal(director.get('one').progress, .5);
    assert.deepEqual(types(game).filter(t => t === 'OnObjectiveProgress').length, 1);

    director.notify('collect', {});
    assert.equal(director.get('one').status, 'complete');
    assert.equal(director.get('two').status, 'active', 'completing one objective arms the next');
    assert.equal(director.score(), 50);

    director.notify('collect', {});
    assert.equal(director.outcome(), 'complete');
    assert.equal(director.score(), 100);
    assert.ok(types(game).includes('OnMissionCompleted'));
    assert.equal(director.running(), false, 'a finished mission stops running');

    const before = game.events.length;
    director.notify('collect', {});
    assert.equal(game.events.length, before, 'a finished mission ignores further events');
  }

  // --- tags ----------------------------------------------------------------
  {
    const director = OBJECTIVES.create(makeGame());
    director.load({mode:'parallel', objectives:[
      {id:'mice', kind:'collect', count:2, target:{tag:'mouse'}},
      {id:'fish', kind:'collect', count:1, target:{tag:'fish'}},
    ]});
    director.start();
    director.notify('collect', {tag:'fish'});
    assert.equal(director.get('fish').status, 'complete');
    assert.equal(director.get('mice').progress, 0, 'a tagged event only advances its own objective');
    director.notify('collect', {tag:'mouse', amount:2});
    assert.equal(director.get('mice').status, 'complete', 'amount advances a counted objective in one step');
  }

  // --- score objectives ----------------------------------------------------
  {
    const director = OBJECTIVES.create(makeGame());
    director.load({mode:'parallel', scoreTarget:0, objectives:[{id:'points', kind:'score', count:300, points:0}]});
    director.start();
    director.addScore(120);
    assert.ok(Math.abs(director.get('points').progress - .4) < 1e-9);
    director.addScore(200);
    assert.equal(director.get('points').status, 'complete');
    assert.equal(director.outcome(), 'complete');
  }

  // --- score gate on mission completion ------------------------------------
  {
    const director = OBJECTIVES.create(makeGame());
    director.load({mode:'parallel', scoreTarget:500, objectives:[{id:'only', kind:'collect', count:1, points:100}]});
    director.start();
    director.notify('collect', {});
    assert.equal(director.outcome(), null, 'the mission waits for its score target even with every objective done');
    director.addScore(400);
    assert.equal(director.outcome(), 'complete');
  }

  // --- avoid constraint ----------------------------------------------------
  {
    const game = makeGame();
    const director = OBJECTIVES.create(game);
    director.load({mode:'sequence', objectives:[
      {id:'goal', kind:'collect', count:1},
      {id:'nohit', kind:'avoid', target:{tag:'car'}},
    ]});
    director.start();
    assert.equal(director.get('nohit').status, 'active', 'constraints are armed immediately in sequence mode');
    director.notify('avoid', {tag:'car'});
    assert.equal(director.outcome(), 'fail');
    assert.ok(types(game).includes('OnMissionFailed'));
  }

  // --- timers --------------------------------------------------------------
  {
    const director = OBJECTIVES.create(makeGame());
    director.load({objectives:[{id:'hold', kind:'survive', duration:2}]});
    director.start();
    for(let i = 0; i < 119; i++) director.update(1/60);
    assert.equal(director.get('hold').status, 'active', 'a survive objective does not complete early');
    for(let i = 0; i < 5; i++) director.update(1/60);
    assert.equal(director.get('hold').status, 'complete', 'a survive objective completes on its own clock');
  }
  {
    const game = makeGame();
    const director = OBJECTIVES.create(game);
    director.load({timeLimit:1, failOnTimeout:true, objectives:[{id:'slow', kind:'collect', count:5}]});
    director.start();
    for(let i = 0; i < 100; i++) director.update(1/60);
    assert.equal(director.outcome(), 'fail');
    assert.equal(game.events.find(e => e.type === 'OnMissionFailed').payload.reason, 'time-limit');
  }
  {
    const director = OBJECTIVES.create(makeGame());
    director.load({startDelay:1, objectives:[{id:'hold', kind:'survive', duration:1}]});
    director.start();
    for(let i = 0; i < 30; i++) director.update(1/60);
    assert.equal(director.get('hold').progress, 0, 'the start delay holds objective timers');
  }
  {
    // A huge frame delta must not skip a whole objective clock.
    const director = OBJECTIVES.create(makeGame());
    director.load({objectives:[{id:'hold', kind:'survive', duration:2}]});
    director.start();
    director.update(30);
    assert.equal(director.get('hold').status, 'active', 'a stalled frame is clamped instead of instantly completing');
  }

  // --- proximity -----------------------------------------------------------
  {
    const game = makeGame();
    game.pawns.positions.set(1, {x:0, y:0, z:0});
    const director = OBJECTIVES.create(game);
    director.load({objectives:[{id:'marker', kind:'reach', target:{radius:3, position:{x:10, y:0, z:0}}}]});
    director.start();
    director.update(1/60);
    assert.equal(director.get('marker').status, 'active');
    game.pawns.positions.set(1, {x:8.5, y:0, z:0});
    director.update(1/60);
    assert.equal(director.get('marker').status, 'complete', 'entering the radius completes a reach objective');
  }
  {
    // A reach objective with no reachable Pawn must simply not resolve.
    const director = OBJECTIVES.create(makeGame());
    director.load({objectives:[{id:'marker', kind:'reach', target:{radius:3, position:{x:0, y:0, z:0}}}]});
    director.start();
    director.update(1/60);
    assert.equal(director.get('marker').status, 'active');
  }

  // --- optional objectives -------------------------------------------------
  {
    const director = OBJECTIVES.create(makeGame());
    director.load({mode:'parallel', objectives:[
      {id:'main', kind:'collect', count:1},
      {id:'bonus', kind:'collect', count:1, optional:true, target:{tag:'bonus'}, points:500},
    ]});
    director.start();
    director.notify('collect', {});
    assert.equal(director.outcome(), 'complete', 'an incomplete optional objective does not block the mission');
    assert.equal(director.get('bonus').status, 'active');
  }

  // --- named custom events -------------------------------------------------
  {
    const game = makeGame();
    const director = OBJECTIVES.create(game);
    director.load({completeEvent:'RunFinished', objectives:[{id:'a', kind:'collect', count:1, completeEvent:'GotIt'}]});
    director.start();
    director.notify('collect', {});
    assert.deepEqual(game.custom.map(item => item.name), ['GotIt', 'RunFinished'],
      'objective and mission completion both fire their authored custom events, in that order');
  }

  // --- restart -------------------------------------------------------------
  {
    const director = OBJECTIVES.create(makeGame());
    director.load({objectives:[{id:'a', kind:'collect', count:1, points:70}]});
    director.start();
    director.notify('collect', {});
    assert.equal(director.outcome(), 'complete');
    director.reset();
    assert.equal(director.outcome(), null);
    assert.equal(director.score(), 0, 'restarting clears the score');
    assert.equal(director.get('a').status, 'active');
  }

  // --- snapshot ------------------------------------------------------------
  {
    const director = OBJECTIVES.create(makeGame());
    director.load({title:'Cat Day', objectives:[
      {id:'a', title:'Catch mice', kind:'collect', count:4},
      {id:'hidden', title:'Secret', kind:'collect', count:1, hidden:true},
    ]});
    director.start();
    director.notify('collect', {});
    const snapshot = director.snapshot();
    assert.equal(snapshot.title, 'Cat Day');
    assert.deepEqual(snapshot.objectives.map(o => o.id), ['a'], 'hidden objectives stay out of the HUD until revealed');
    assert.equal(snapshot.objectives[0].current, 1);
    assert.equal(snapshot.objectives[0].count, 4);
  }

  // --- install -------------------------------------------------------------
  {
    const game = makeGame();
    const director = OBJECTIVES.install(game);
    assert.equal(game.systems.objectives, director);
    assert.equal(game.hooks.frame.length, 1, 'install registers exactly one frame hook');
    assert.equal(OBJECTIVES.install(game), director, 'install is idempotent');
    assert.equal(game.hooks.frame.length, 1, 'a second install does not add a second frame hook');
  }

  // --- wiring --------------------------------------------------------------
  const repoRoot = path.join(__dirname, '..');
  const nodes = fs.readFileSync(path.join(repoRoot, 'js/logic/logic-nodes-objectives.js'), 'utf8');
  ['objectives.startMission','objectives.notify','objectives.complete','objectives.fail','objectives.addScore',
   'objectives.getMissionState','event.onMissionCompleted','event.onMissionFailed','event.onObjectiveCompleted']
    .forEach(type => assert.ok(nodes.includes("type:'" + type + "'"), 'node pack must register ' + type));
  assert.ok(nodes.includes('LK_LOGIC_NODE_PACKS'), 'the node pack must self-register with the shared pack list');

  const template = fs.readFileSync(path.join(repoRoot, 'js/logic/logic-templates-mission.js'), 'utf8');
  assert.ok(template.includes("ui:'objective-list'"), 'the template must expose the objective list editor');
  assert.ok(template.includes('missionDirector'), 'the template must carry a missionDirector descriptor');

  const inspector = fs.readFileSync(path.join(repoRoot, 'js/editor/logic-elements-inspector.js'), 'utf8');
  assert.ok(inspector.includes("variable.ui === 'objective-list'"), 'the inspector must render the objective list control');
  assert.ok(inspector.includes("variable.type === 'objectiveList'"),
    'objective arrays must bypass the JSON string parser so the editor can write them back');

  const hud = fs.readFileSync(path.join(repoRoot, 'js/runtime/objective-hud.js'), 'utf8');
  assert.ok(hud.includes("getElementById('hud')"), 'the mission HUD must mount inside #hud like the other HUDs');
  const css = fs.readFileSync(path.join(repoRoot, 'css/lot-king.css'), 'utf8');
  ['.lk-objectives','.lk-objRow','.lk-objBanner'].forEach(rule => {
    assert.ok(css.includes(rule), 'runtime CSS must define ' + rule);
  });

  console.log('objective-system.test.js: all assertions passed');
}

try { run(); }
catch(error){ console.error(error); process.exitCode = 1; }
