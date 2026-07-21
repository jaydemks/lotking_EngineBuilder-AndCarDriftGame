'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../js/logic/logic-graph.js');
require('../js/logic/logic-exporter.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-validator.js');
require('../js/logic/logic-runtime.js');
require('../js/logic/logic-services.js');
require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/logic-elements-runner.js');

const registry = global.LK_LOGIC_NODES_MVP.createRegistry();

function test(name, run){
  try {
    run();
    console.log('ok - ' + name);
  } catch(error){
    console.error('not ok - ' + name);
    throw error;
  }
}

function context(logs){
  return {
    graphName:'Logic Core Test',
    scope:'element',
    debug:{
      log(message){ logs.push(String(message)); },
      warn(){},
      error(message){ throw new Error(String(message)); },
    },
    services:{input:{isKeyPressed(){ return false; }}},
  };
}

test('starter graph validates without diagnostics', () => {
  const graph = global.LK_LOGIC_GRAPH.createStarterGraph('Starter Test', 'element');
  const result = global.LK_LOGIC_VALIDATOR.validateGraph(graph, registry);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test('Pawn Core lifecycle and component registry are reusable beyond vehicles', () => {
  const calls = [];
  const human = global.LK_RUNTIME_PAWN_CORE.createRecord({
    id:'human-1', kind:'human', config:{enabled:true, playerId:2}, state:{health:100},
    onStart:pawn => calls.push('start:' + pawn.id),
    onReset:pawn => { pawn.state.health = 100; calls.push('reset'); return true; },
    onPossess:(pawn, playerId) => { pawn.playerId = playerId; pawn.possessed = playerId != null; return true; },
    onUnpossess:pawn => { pawn.playerId = null; pawn.possessed = false; return true; },
  });
  human.start();
  human.state.health = 20;
  human.reset();
  human.possess(3);
  assert.equal(human.kind, 'human');
  assert.equal(human.state.health, 100);
  assert.equal(human.playerId, 3);
  assert.deepEqual(calls, ['start:human-1', 'reset']);

  const components = global.LK_RUNTIME_PAWN_CORE.createComponentRegistry();
  components.register('human', opts => ({kind:'human', name:opts.name}));
  components.register('animal', opts => ({kind:'animal', species:opts.species}));
  assert.deepEqual(components.list(), ['animal', 'human']);
  assert.deepEqual(components.create('animal', {species:'wolf'}), {kind:'animal', species:'wolf'});
});

test('Vehicle Pawn registry keeps possession and motion isolated per instance', () => {
  const game = {player:null, systems:{}};
  const registry = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);
  const position = (x, y, z) => ({x,y,z,set(nx,ny,nz){ this.x=nx; this.y=ny; this.z=nz; }});
  const ownerA = {position:position(0,0,0), rotation:{y:0}, visible:true, userData:{}};
  const ownerB = {position:position(10,0,0), rotation:{y:0}, visible:true, userData:{}};
  const input = {playerDrive(id){ return id === 1 ? {throttle:1, brake:0, steer:.25, handbrake:false} : {throttle:0, brake:0, steer:0, handbrake:false}; }};
  const a = registry.createLogic(ownerA, {id:'pawn-a', playerId:1, tuning:{maxSpeed:30}}, {input});
  const b = registry.createLogic(ownerB, {id:'pawn-b', playerId:2, tuning:{maxSpeed:30}}, {input});
  a.start(); b.start();
  registry.stepAll(.1);

  assert.equal(a.state.speed > 0, true);
  assert.equal(ownerA.position.z > 0, true);
  assert.equal(b.state.speed, 0);
  assert.equal(ownerB.position.x, 10);
  assert.equal(registry.getByPlayerId(1), a);
  assert.equal(registry.getByPlayerId(2), b);
  a.setCamera({activeAnchorId:'camera_anchor_2'});
  assert.equal(a.config.camera.activeAnchorId, 'camera_anchor_2');
  assert.equal(b.possess(1, false), false);
  assert.equal(b.possess(1, true), true);
  assert.equal(a.playerId, null);
  const bBeforeDisabledStep = ownerB.position.z;
  b.setEnabled(false);
  b.setControl({throttle:1});
  registry.stepAll(.1);
  assert.equal(ownerB.position.z, bBeforeDisabledStep);
  a.reset();
  assert.equal(ownerA.position.x, 0);
  assert.equal(ownerA.position.z, 0);
  a.dispose(); b.dispose();
  assert.equal(registry.list().length, 0);
});

test('Vehicle Pawn configuration preserves manual wheel pivots and mesh assignments', () => {
  const wheels = [0,1,2,3,4].map(index => ({x:index,y:.17,z:index<2?1.3:-1.3,front:index<2,driven:index>=2,visualId:'mesh-wheel-' + index}));
  const skids = {enabled:false,smokeModelVersion:3,smokeEnabled:true,smokeAmount:1.25,smokeThreshold:.4,smokeMinHeat:.5,smokeHeatRate:1.1,smokeCoolRate:.6,smokeOnDrift:true,smokeOnBrake:false,smokeOnAcceleration:true};
  const config = global.LK_RUNTIME_VEHICLE_PAWNS.normalizeConfig({physicsBackend:'arcade-fallback', wheels, skids});
  assert.equal(config.wheels.length, 5);
  assert.equal(config.wheels[4].visualId, 'mesh-wheel-4');
  assert.equal(config.wheels[0].front, true);
  assert.equal(config.wheels[2].driven, true);
  assert.equal(config.skids.enabled, false);
  assert.equal(config.skids.smokeAmount, 1.25);
  assert.equal(config.skids.smokeThreshold, .4);
  assert.equal(config.skids.smokeOnBrake, false);
  assert.equal(config.skids.smokeModelVersion, 3);
  assert.equal(config.skids.smokeMinHeat, .5);
  assert.equal(config.skids.smokeHeatRate, 1.1);
  assert.equal(config.skids.smokeCoolRate, .6);
});

test('Vehicle Pawn migrates legacy always-on tire smoke to the slip and heat model', () => {
  const config = global.LK_RUNTIME_VEHICLE_PAWNS.normalizeConfig({skids:{smokeThreshold:.08}});
  assert.equal(config.skids.smokeModelVersion, 3);
  assert.equal(config.skids.smokeAmount, .28);
  assert.equal(config.skids.smokeThreshold, .35);
  assert.equal(config.skids.smokeMinHeat, .3);
});

test('Vehicle Pawn arcade parity covers acceleration braking reverse handbrake drift and reset', () => {
  const game = {player:null, systems:{}};
  const registry = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);
  const owner = {position:{x:3,y:0,z:7,set(x,y,z){this.x=x;this.y=y;this.z=z;}}, rotation:{y:.25}, visible:true, userData:{}};
  const pawn = registry.createLogic(owner, {
    id:'parity-drive', playerId:1, physicsBackend:'arcade-fallback', spawn:{x:3,y:0,z:7,heading:.25},
    tuning:{maxSpeed:30,reverseSpeed:10,acceleration:16,brake:24,steer:2.2,grip:.84,drag:1.2},
  }, {});
  pawn.start();
  pawn.setControl({throttle:1,brake:0,steer:0,handbrake:false});
  for(let i=0;i<20;i++) pawn.step(.05);
  const accelerated = pawn.state.speed;
  assert.equal(accelerated > 5, true);
  assert.equal(pawn.state.rpm > 900, true);
  pawn.setControl({throttle:0,brake:1,steer:0,handbrake:false});
  for(let i=0;i<8;i++) pawn.step(.05);
  assert.equal(pawn.state.speed < accelerated, true);
  for(let i=0;i<20;i++) pawn.step(.05);
  assert.equal(pawn.state.reverse, true);
  assert.equal(pawn.state.gear, -1);
  pawn.setControl({throttle:1,brake:0,steer:.8,handbrake:true});
  pawn.state.speed = 8;
  pawn.step(.05);
  assert.equal(pawn.state.handbrake, true);
  assert.equal(pawn.state.drift, true);
  assert.equal(pawn.state.oversteer, true);
  pawn.state.speed = 0;
  pawn.setControl({throttle:1,brake:1,steer:.2,handbrake:false});
  pawn.step(.01);
  assert.equal(pawn.state.burnout, true);
  pawn.state.speed = pawn.config.tuning.maxSpeed;
  pawn.setControl({throttle:1,brake:0,steer:0,handbrake:false});
  pawn.step(.001);
  assert.equal(pawn.state.limiter, true);
  pawn.reset();
  assert.deepEqual([owner.position.x,owner.position.y,owner.position.z], [3,0,7]);
  assert.equal(owner.rotation.y, .25);
  assert.equal(pawn.state.speed, 0);
  pawn.dispose();
});

test('Vehicle Pawn camera modes and automatic light conditions remain instance scoped', () => {
  let clockHour = 12;
  const game = {player:null, systems:{sky:{getTime(){ return .25; }, getClockHour(){ return clockHour; }}}};
  const registry = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);
  const owner = {position:{x:0,y:0,z:0},rotation:{y:0},visible:true,userData:{}};
  const pawn = registry.createLogic(owner, {id:'visual-parity',playerId:1,camera:{mode:'free'},lights:{enabled:true,front:{enabled:true,auto:true,autoOnHour:18,autoOffHour:7},rear:{enabled:true},aux:[{enabled:true,condition:'left',intensity:2}]}}, {});
  for(const mode of ['free','arcade','cinematic']){ pawn.setCamera({mode}); assert.equal(pawn.config.camera.mode, mode); }
  const light = () => ({visible:false,intensity:0,distance:10,angle:.5});
  const headlight = light(), brake = light(), reverse = light(), left = light();
  pawn.backend = {lightVisuals:[
    {light:headlight,condition:'night',auxIndex:null,baseIntensity:1,baseDistance:10,baseAngle:.5},
    {light:brake,condition:'brake',auxIndex:null,baseIntensity:1,baseDistance:10,baseAngle:.5},
    {light:reverse,condition:'reverse',auxIndex:null,baseIntensity:1,baseDistance:10,baseAngle:.5},
    {light:left,condition:'always',auxIndex:0,baseIntensity:1,baseDistance:10,baseAngle:.5},
  ]};
  pawn.updateLights({highBeams:false,brake:0,steer:0}, false);
  assert.equal(headlight.visible, false, 'automatic headlights stay off at 12:00');
  clockHour = 18;
  pawn.updateLights({highBeams:false,brake:0,steer:0}, false);
  assert.equal(headlight.visible, true, 'automatic headlights switch on at the authored 18:00 sunset');
  pawn.updateLights({highBeams:true,brake:1,steer:-.8}, false);
  assert.equal(headlight.intensity > 2, true);
  assert.equal(brake.visible, true);
  assert.equal(reverse.visible, false);
  assert.equal(left.intensity, 2);
  pawn.config.lights.front.enabled = false;
  pawn.updateLights({highBeams:false,brake:0,steer:0}, true);
  assert.equal(headlight.visible, false);
  assert.equal(reverse.visible, true);
  pawn.backend = null;
  pawn.dispose();
});

test('Vehicle Pawn disposes exhaust skid widget and audio resources together', () => {
  const game = {player:null, systems:{}};
  const registry = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);
  const owner = {position:{x:0,y:0,z:0},rotation:{y:0},visible:true,userData:{}};
  const pawn = registry.createLogic(owner, {id:'cleanup-parity',playerId:null}, {});
  let removed=0, geometry=0, material=0, widgets=0, stopped=0, cleared=0;
  const effect = {object:{parent:{remove(){removed++;}},geometry:{dispose(){geometry++;}},material:{dispose(){material++;}}}};
  pawn.effectsRuntime.exhaust.push(effect); pawn.effectsRuntime.skids.push(effect);
  pawn.widgetRuntime = {dispose(){widgets++;}};
  pawn.audioRuntime = {kind:'samples',manager:{stop(){stopped++;},setConfig(value){if(value===null) cleared++;}}};
  pawn.dispose();
  assert.deepEqual({removed,geometry,material,widgets,stopped,cleared},{removed:2,geometry:2,material:2,widgets:1,stopped:1,cleared:1});
});

test('Vehicle Pawn registry assigns P1-P4 deterministically and preserves None', () => {
  const game = {player:null, systems:{}};
  const registry = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);
  const owner = id => ({position:{x:0,y:0,z:0}, rotation:{y:0}, visible:true, userData:{logicInstanceId:id}});
  const pawns = [1,2,3,4,5].map(index => registry.createLogic(owner('multi-' + index), {id:'multi-' + index, playerId:null}, {}));
  assert.deepEqual(pawns.slice(0,4).map(pawn => registry.possessFirstAvailable(pawn)), [1,2,3,4]);
  assert.equal(registry.firstAvailablePlayerId(), null);
  assert.equal(registry.possessFirstAvailable(pawns[4]), null);
  assert.equal(pawns[4].playerId, null);
  pawns[1].unpossess();
  assert.equal(registry.possessFirstAvailable(pawns[4]), 2);
  assert.deepEqual([1,2,3,4].map(id => registry.getByPlayerId(id).id), ['multi-1','multi-5','multi-3','multi-4']);
  pawns.forEach(pawn => pawn.dispose());
});

test('Vehicle Pawn node catalog exposes control, tuning and telemetry contracts', () => {
  for(const type of [
    'pawn.getSelf', 'pawn.getPlayerPawn', 'pawn.getInput', 'pawn.possess', 'pawn.possessFirstAvailable', 'pawn.unpossess',
    'pawn.setDriveInput', 'pawn.reset', 'pawn.setEnabled', 'pawn.setTuning', 'pawn.setSuspension', 'pawn.setLights', 'pawn.setEffects', 'pawn.setCamera', 'pawn.setEngineAudio', 'pawn.setDataWidgets', 'pawn.getState',
  ]) assert.equal(!!registry.get(type), true, 'missing Vehicle Pawn node ' + type);
  assert.equal(registry.get('pawn.getState').outputs.some(pin => pin.name === 'physicsMode'), true);
  for(const type of ['event.onPawnDriftStart','event.onPawnDriftEnd','event.onPawnGearChanged','event.onPawnReset','event.onPawnPossessed','event.onPawnUnpossessed','event.onPawnDeviceChanged']){
    assert.equal(!!registry.get(type), true, 'missing Pawn event ' + type);
  }
});

test('legacy Player Car snapshots migrate to stable Vehicle Pawn v2 authoring data', () => {
  const legacy = global.LK_LOGIC_GRAPH.createEmptyGraph('Legacy Player Car', 'element');
  legacy.playerPawnBlueprint = {
    version:1, enabled:true, hidden:false, controllerIndex:2,
    spawn:{x:4, z:-7, heading:1.25},
    tuning:{horsepower:520, torque:6},
    collision:{hx:1.1, hy:.5, hz:2},
    cam:{mode:'cinematic', fov:74},
    modelShading:'smooth',
  };
  const migrated = global.LK_LOGIC_GRAPH.normalizeGraph(legacy);
  assert.equal(migrated.vehiclePawn.schemaVersion, 2);
  assert.equal(migrated.vehiclePawn.playerId, 3);
  assert.equal(migrated.vehiclePawn.possessed, true);
  assert.deepEqual(migrated.vehiclePawn.spawn, {x:4, y:0, z:-7, heading:1.25});
  assert.equal(migrated.vehiclePawn.tuning.horsepower, 520);
  assert.equal(migrated.vehiclePawn.collision.hx, 1.1);
  assert.equal(migrated.vehiclePawn.camera.mode, 'cinematic');
  assert.equal(migrated.vehiclePawn.modelShading, 'smooth');
  assert.equal(migrated.vehiclePawn.migration.legacyBlueprint, true);
  assert.deepEqual(migrated.playerPawnBlueprint, legacy.playerPawnBlueprint);

  const roundTrip = global.LK_LOGIC_GRAPH.normalizeGraph(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(roundTrip.vehiclePawn.spawn, migrated.vehiclePawn.spawn);
  assert.deepEqual(roundTrip.vehiclePawn.tuning, migrated.vehiclePawn.tuning);
  assert.equal(roundTrip.vehiclePawn.playerId, 3);
  assert.deepEqual(roundTrip.playerPawnBlueprint, legacy.playerPawnBlueprint);
});

test('validator reports contextual warnings and blocking pin errors', () => {
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Diagnostics Test', 'element');
  graph.nodes.push(
    global.LK_LOGIC_GRAPH.node('event', 'event.custom', 0, 0, {eventName:''}),
    global.LK_LOGIC_GRAPH.node('print', 'debug.print', 0, 0, {duration:0}),
    global.LK_LOGIC_GRAPH.node('divide', 'math.divide', 0, 0, {b:0}),
    global.LK_LOGIC_GRAPH.node('variable', 'variable.get', 0, 0, {name:'missing'})
  );

  let result = global.LK_LOGIC_VALIDATOR.validateGraph(graph, registry);
  const warningCodes = new Set(result.warnings.map(item => item.code));
  [
    'missing-event-name',
    'event-unconnected',
    'unreachable-exec-node',
    'non-positive-duration',
    'division-by-zero-default',
    'unknown-variable',
  ].forEach(code => assert.equal(warningCodes.has(code), true, 'missing warning ' + code));
  assert.equal(global.LK_LOGIC_VALIDATOR.nodeDiagnostics(result, 'print').length >= 2, true);

  graph.edges.push(global.LK_LOGIC_GRAPH.edge('bad', 'divide', 'value', 'print', 'exec'));
  result = global.LK_LOGIC_VALIDATOR.validateGraph(graph, registry);
  assert.equal(result.ok, false);
  assert.equal(result.errors.some(item => item.code === 'pin-type-mismatch'), true);
});

test('validator rejects invalid Vehicle Pawn and Player references', () => {
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Pawn Reference Diagnostics', 'element');
  graph.vehiclePawn = {schemaVersion:2, id:'', playerId:7};
  graph.nodes.push(global.LK_LOGIC_GRAPH.node('drive', 'input.playerDrive', 0, 0, {playerId:0}));
  const result = global.LK_LOGIC_VALIDATOR.validateGraph(graph, registry);
  assert.equal(result.errors.some(item => item.code === 'invalid-pawn-id'), true);
  assert.equal(result.errors.some(item => item.code === 'invalid-player-id'), true);
  assert.equal(result.warnings.some(item => item.code === 'invalid-node-player-id'), true);
});

test('runtime executes start/update flow and keeps variable state', () => {
  const logs = [];
  const graph = global.LK_LOGIC_GRAPH.createStarterGraph('Runtime Test', 'element');
  graph.nodes.find(node => node.id === 'print_start').data.breakpoint = true;
  const runtime = global.LK_LOGIC_RUNTIME.create(graph, registry, context(logs));

  runtime.start();
  runtime.update(0.25);
  runtime.update(0.5);

  assert.deepEqual(logs, ['Runtime Test started']);
  assert.equal(runtime.variables.get('counter'), 0.75);
  const stats = runtime.stats();
  assert.equal(stats.graphName, 'Runtime Test');
  assert.equal(stats.scope, 'element');
  assert.equal(stats.events, 3);
  assert.equal(stats.nodeRuns >= 3, true);
  assert.equal(stats.evaluations >= 2, true);
  assert.equal(stats.maxStepsUsed >= 2, true);
  assert.equal(stats.lastEvent, 'OnUpdate');
  assert.equal(Array.isArray(stats.timeline), true);
  assert.equal(stats.timeline.some(item => item.type === 'event' && item.event === 'OnStart'), true);
  assert.equal(stats.timeline.some(item => item.type === 'node' && item.node === 'print_start'), true);
  assert.equal(stats.breakpoints, 1);
  assert.equal(stats.lastBreakpoint, 'print_start');
  assert.equal(stats.timeline.some(item => item.type === 'breakpoint' && item.node === 'print_start'), true);
  runtime.stop();
  assert.equal(runtime.stats().active, false);
});

test('runtime can pause and resume on breakpoints', () => {
  const logs = [];
  const graph = global.LK_LOGIC_GRAPH.createStarterGraph('Breakpoint Pause Test', 'element');
  graph.nodes.find(node => node.id === 'print_start').data.breakpoint = true;
  const runtime = global.LK_LOGIC_RUNTIME.create(graph, registry, context(logs), {pauseOnBreakpoint:true});

  runtime.start();
  assert.deepEqual(logs, []);
  assert.equal(runtime.stats().paused, true);
  assert.equal(runtime.stats().pausedNode, 'print_start');
  assert.equal(runtime.stats().timeline.some(item => item.type === 'paused' && item.node === 'print_start'), true);

  assert.equal(runtime.resume(), true);
  assert.deepEqual(logs, ['Breakpoint Pause Test started']);
  assert.equal(runtime.stats().paused, false);
  assert.equal(runtime.stats().timeline.some(item => item.type === 'resumed' && item.node === 'print_start'), true);
});

test('runtime can step from a paused breakpoint to the next node', () => {
  const logs = [];
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Breakpoint Step Test', 'element');
  graph.nodes.push(
    global.LK_LOGIC_GRAPH.node('start', 'event.onStart', 0, 0),
    global.LK_LOGIC_GRAPH.node('print_a', 'debug.print', 220, 0, {message:'A', duration:1, breakpoint:true}),
    global.LK_LOGIC_GRAPH.node('print_b', 'debug.print', 440, 0, {message:'B', duration:1})
  );
  graph.edges.push(
    global.LK_LOGIC_GRAPH.edge('e_start_a', 'start', 'then', 'print_a', 'exec'),
    global.LK_LOGIC_GRAPH.edge('e_a_b', 'print_a', 'completed', 'print_b', 'exec')
  );
  const runtime = global.LK_LOGIC_RUNTIME.create(graph, registry, context(logs), {pauseOnBreakpoint:true});

  runtime.start();
  assert.deepEqual(logs, []);
  assert.equal(runtime.stats().pausedNode, 'print_a');

  assert.equal(runtime.step(), true);
  assert.deepEqual(logs, ['A']);
  assert.equal(runtime.stats().paused, true);
  assert.equal(runtime.stats().pausedNode, 'print_b');
  assert.equal(runtime.stats().timeline.some(item => item.type === 'stepped' && item.node === 'print_a'), true);
  assert.equal(runtime.stats().timeline.some(item => item.type === 'step-paused' && item.node === 'print_b'), true);

  assert.equal(runtime.resume(), true);
  assert.deepEqual(logs, ['A', 'B']);
  assert.equal(runtime.stats().paused, false);
});

test('Tick Every respects its configured interval', () => {
  const logs = [];
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Tick Test', 'element');
  graph.nodes.push(
    global.LK_LOGIC_GRAPH.node('tick', 'event.tickEvery', 0, 0, {seconds:0.5}),
    global.LK_LOGIC_GRAPH.node('print', 'debug.print', 260, 0, {message:'tick', duration:1})
  );
  graph.edges.push(global.LK_LOGIC_GRAPH.edge('tick-print', 'tick', 'then', 'print', 'exec'));
  const runtime = global.LK_LOGIC_RUNTIME.create(graph, registry, context(logs));

  runtime.update(0.2);
  runtime.update(0.2);
  assert.equal(logs.length, 0);
  runtime.update(0.1);
  assert.deepEqual(logs, ['tick']);
  runtime.update(1.1);
  assert.deepEqual(logs, ['tick', 'tick']);
  runtime.stop();
});

test('Call Subgraph runs reusable Entry graph and syncs shared variables', () => {
  const logs = [];
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Subgraph Runtime Test', 'element');
  graph.variables.push({name:'counter', type:'number', value:0});
  graph.variables.push({name:'result', type:'number', value:0});
  graph.nodes.push(
    global.LK_LOGIC_GRAPH.node('start', 'event.onStart', 0, 0),
    global.LK_LOGIC_GRAPH.node('call', 'flow.callSubgraph', 240, 0, {subgraph:'Increment And Print', amount:2}),
    global.LK_LOGIC_GRAPH.node('set-result', 'variable.set', 520, 0, {name:'result'}),
    global.LK_LOGIC_GRAPH.node('print-done', 'debug.print', 760, 0, {message:'parent completed', duration:1})
  );
  graph.edges.push(
    global.LK_LOGIC_GRAPH.edge('start-call', 'start', 'then', 'call', 'exec'),
    global.LK_LOGIC_GRAPH.edge('call-set-result', 'call', 'completed', 'set-result', 'exec'),
    global.LK_LOGIC_GRAPH.edge('call-result', 'call', 'sum', 'set-result', 'value'),
    global.LK_LOGIC_GRAPH.edge('set-result-print', 'set-result', 'completed', 'print-done', 'exec')
  );
  graph.subgraphs.push(global.LK_LOGIC_GRAPH.subgraph('increment', 'Increment And Print', [
    global.LK_LOGIC_GRAPH.node('entry', 'event.custom', 0, 0, {eventName:'Entry'}),
    global.LK_LOGIC_GRAPH.node('amount', 'function.input', 220, 0, {name:'amount'}),
    global.LK_LOGIC_GRAPH.node('get', 'variable.get', 220, 110, {name:'counter'}),
    global.LK_LOGIC_GRAPH.node('add', 'math.add', 430, 90),
    global.LK_LOGIC_GRAPH.node('set', 'variable.set', 660, 0, {name:'counter'}),
    global.LK_LOGIC_GRAPH.node('return-sum', 'function.return', 660, 120, {name:'sum'}),
    global.LK_LOGIC_GRAPH.node('return-echo', 'function.return', 900, 120, {name:'echo'}),
    global.LK_LOGIC_GRAPH.node('print', 'debug.print', 900, 0, {message:'subgraph ran', duration:1})
  ], [
    global.LK_LOGIC_GRAPH.edge('entry-set', 'entry', 'then', 'set', 'exec'),
    global.LK_LOGIC_GRAPH.edge('set-return-sum', 'set', 'completed', 'return-sum', 'exec'),
    global.LK_LOGIC_GRAPH.edge('return-sum-return-echo', 'return-sum', 'completed', 'return-echo', 'exec'),
    global.LK_LOGIC_GRAPH.edge('return-echo-print', 'return-echo', 'completed', 'print', 'exec'),
    global.LK_LOGIC_GRAPH.edge('get-add', 'get', 'value', 'add', 'a'),
    global.LK_LOGIC_GRAPH.edge('amount-add', 'amount', 'value', 'add', 'b'),
    global.LK_LOGIC_GRAPH.edge('add-set', 'add', 'value', 'set', 'value'),
    global.LK_LOGIC_GRAPH.edge('add-return-sum', 'add', 'value', 'return-sum', 'value'),
    global.LK_LOGIC_GRAPH.edge('amount-return-echo', 'amount', 'value', 'return-echo', 'value')
  ]));
  graph.subgraphs[0].inputs = [{id:'amount', name:'amount', type:'number'}];
  graph.subgraphs[0].outputs = [
    {id:'sum', name:'sum', type:'number'},
    {id:'echo', name:'echo', type:'number'}
  ];

  const result = global.LK_LOGIC_VALIDATOR.validateGraph(graph, registry);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.some(item => item.code === 'unknown-subgraph'), false);

  const runtime = global.LK_LOGIC_RUNTIME.create(graph, registry, context(logs));
  runtime.start();

  assert.deepEqual(logs, ['subgraph ran', 'parent completed']);
  assert.equal(runtime.variables.get('counter'), 2);
  assert.equal(runtime.variables.get('result'), 2);
  assert.deepEqual(runtime.graph.nodes.find(node => node.id === 'call').data.__result, {sum:2, echo:2});
  runtime.stop();
});

test('Function metadata diagnostics catch broken input and output contracts', () => {
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Function Metadata Diagnostics Test', 'element');
  graph.subgraphs.push(global.LK_LOGIC_GRAPH.subgraph('broken', 'Broken Function', [
    global.LK_LOGIC_GRAPH.node('entry', 'event.custom', 0, 0, {eventName:'Entry'}),
    global.LK_LOGIC_GRAPH.node('input', 'function.input', 220, 0, {name:'ghostInput'}),
    global.LK_LOGIC_GRAPH.node('return', 'function.return', 440, 0, {name:'ghostOutput'})
  ], [
    global.LK_LOGIC_GRAPH.edge('entry-return', 'entry', 'then', 'return', 'exec')
  ]));
  graph.subgraphs[0].inputs = [
    {id:'input-a', name:'amount', type:'number'},
    {id:'input-b', name:'amount', type:'number'}
  ];
  graph.subgraphs[0].outputs = [
    {id:'output-a', name:'sum', type:'number'},
    {id:'output-b', name:'sum', type:'number'},
    {id:'output-c', name:'missingOut', type:'number'}
  ];

  const result = global.LK_LOGIC_VALIDATOR.validateGraph(graph, registry);
  const errorCodes = new Set(result.errors.map(item => item.code));
  const warningCodes = new Set(result.warnings.map(item => item.code));
  assert.equal(errorCodes.has('duplicate-function-input'), true);
  assert.equal(errorCodes.has('duplicate-function-output'), true);
  assert.equal(warningCodes.has('unknown-function-input'), true);
  assert.equal(warningCodes.has('unknown-function-output'), true);
  assert.equal(warningCodes.has('unreturned-function-output'), true);
});

test('subgraph macro metadata survives normalization', () => {
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Macro Metadata Test', 'element');
  const macro = global.LK_LOGIC_GRAPH.subgraph('macro_spin', 'Spin Macro', [
    global.LK_LOGIC_GRAPH.node('entry', 'event.custom', 0, 0, {eventName:'Entry'}),
    global.LK_LOGIC_GRAPH.node('print', 'debug.print', 220, 0, {message:'macro', duration:1})
  ], [
    global.LK_LOGIC_GRAPH.edge('entry_print', 'entry', 'then', 'print', 'exec')
  ], []);
  macro.macro = true;
  graph.subgraphs.push(macro);

  const normalized = global.LK_LOGIC_GRAPH.normalizeGraph(graph);
  assert.equal(normalized.subgraphs.length, 1);
  assert.equal(normalized.subgraphs[0].macro, true);
});

test('built-in Logic Element templates are valid editable graph copies', () => {
  const templates = global.LK_LOGIC_TEMPLATES.list();
  assert.equal(templates.length >= 6, true);

  for(const template of templates){
    assert.equal(template.template, true, template.id + ' should be marked as template');
    assert.equal(typeof template.id, 'string');
    assert.equal(template.id.startsWith('logic-template-'), true);
    assert.equal(typeof template.name, 'string');
    assert.equal(template.name.startsWith('Template -'), true);
    assert.equal(template.graph.scope, 'element');
    assert.equal(Array.isArray(template.graph.nodes), true);
    assert.equal(template.graph.nodes.length > 0, true);
    assert.equal(Array.isArray(template.graph.edges), true);
    assert.equal(Array.isArray(template.graph.comments), true);
    assert.equal(template.graph.comments.length > 0, true);
    assert.equal(Array.isArray(template.graph.logicScene && template.graph.logicScene.elements), true);
    const sceneElements = [template.graph.logicScene.root].concat(template.graph.logicScene.elements || []).filter(Boolean);
    assert.equal(sceneElements.length > 0, true);
    if(!template.graph.vehiclePawn) assert.equal(sceneElements.some(element => element.name === 'Default Mesh'), true);

    const result = global.LK_LOGIC_VALIDATOR.validateGraph(template.graph, registry);
    assert.equal(result.ok, true, template.name + ' should not have blocking errors');
    assert.deepEqual(result.errors, [], template.name + ' should not have validation errors');
  }

  const first = global.LK_LOGIC_TEMPLATES.get(templates[0].id);
  first.graph.nodes[0].data.__mutatedByTest = true;
  const second = global.LK_LOGIC_TEMPLATES.get(templates[0].id);
  assert.equal(second.graph.nodes[0].data.__mutatedByTest, undefined);
});

test('Logic Element graph dependency manifest collects assets and node refs', () => {
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Dependency Manifest Test', 'element');
  graph.logicScene = {
    root:{
      id:'root',
      name:'Default Mesh',
      type:'mesh',
      asset:{id:'mesh-1', key:'glb:mesh-1', dbKey:'asset-db-1', name:'Hero Mesh', source:'Imported GLB'},
      matProps:{normalMapSrc:'textures/vehicle-normal.png'},
    },
    elements:[],
  };
  graph.nodes.push(
    global.LK_LOGIC_GRAPH.node('load_texture', 'material.loadTexture', 0, 0, {textureRef:'textures/panel.png'}),
    global.LK_LOGIC_GRAPH.node('load_texture_asset', 'material.loadTexture', 0, 0, {textureRef:{id:'tex-1', dbKey:'tex-db-1', name:'Panel Texture', kind:'texture'}}),
    global.LK_LOGIC_GRAPH.node('play_sound', 'audio.playSound', 0, 0, {soundRef:'sounds/open.wav'})
  );
  graph.vehiclePawn = {schemaVersion:2, id:'portable-car', playerId:1, physicsBackend:'arcade-fallback', engineAudio:{setId:'engine-v8'}};
  const deps = global.LK_LOGIC_GRAPH.collectGraphDependencies(graph);
  assert.equal(deps.length, 7);
  assert.equal(deps.some(dep => dep.type === 'mesh' && dep.id === 'mesh-1'), true);
  assert.equal(deps.some(dep => dep.type === 'texture' && dep.value === 'textures/panel.png'), true);
  assert.equal(deps.some(dep => dep.type === 'texture' && dep.id === 'tex-1' && dep.dbKey === 'tex-db-1'), true);
  assert.equal(deps.some(dep => dep.type === 'audio' && dep.value === 'sounds/open.wav'), true);
  assert.equal(deps.some(dep => dep.type === 'texture' && dep.value === 'textures/vehicle-normal.png'), true);
  assert.equal(deps.some(dep => dep.type === 'audio-set' && dep.value === 'engine-v8'), true);
  assert.equal(deps.some(dep => dep.type === 'plugin' && dep.id === 'arcade-fallback' && dep.version === '0.6.7-core'), true);
});

test('Vehicle physics backend API resolves plugins and safe fallback metadata', () => {
  const api = global.LK_RUNTIME_VEHICLE_PHYSICS_BACKENDS;
  api.register({id:'test-vehicle-backend', version:'1.2.3', apiVersion:api.API_VERSION, license:'MIT', create(){ return {}; }});
  assert.equal(api.resolve('test-vehicle-backend').backend.id, 'test-vehicle-backend');
  const missing = api.resolve('missing-vehicle-backend');
  assert.equal(missing.backend.id, 'arcade-fallback');
  assert.equal(missing.fallback, true);
  assert.equal(missing.reason.includes('not installed'), true);
});

test('Player Car template exposes variables bound to Vehicle Pawn components', () => {
  const template = global.LK_LOGIC_TEMPLATES.get('logic-template-player-car');
  assert.ok(template && template.graph.vehiclePawn);
  const bindings = new Map(template.graph.variables.filter(item => item.exposed && item.binding).map(item => [item.name, item.binding]));
  assert.equal(bindings.get('PawnEnabled'), 'enabled');
  assert.equal(bindings.get('ControllerPlayerId'), 'playerId');
  assert.equal(bindings.get('MaxSpeed'), 'tuning.maxSpeed');
  assert.equal(bindings.get('HeadlightsEnabled'), 'lights.front.enabled');
  assert.equal(template.graph.vehiclePawn.proceduralFallback, 'native-player-visual-v1');
  assert.equal(template.graph.vehiclePawn.modelShading, 'original');
});

test('Logic Element definition assets migrate to current version', () => {
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Old Definition', 'element');
  graph.nodes.push(
    global.LK_LOGIC_GRAPH.node('load_texture', 'material.loadTexture', 0, 0, {textureRef:'textures/old-panel.png'})
  );
  const migrated = global.LK_LOGIC_GRAPH.normalizeDefinitionAsset({
    id:'legacy-asset',
    name:'Old Definition',
    definitionVersion:0,
    graph,
  });
  assert.equal(migrated.id, 'legacy-asset');
  assert.equal(migrated.definitionVersion, global.LK_LOGIC_GRAPH.DEFINITION_VERSION);
  assert.equal(migrated.migration.fromDefinitionVersion, 0);
  assert.equal(migrated.migration.toDefinitionVersion, global.LK_LOGIC_GRAPH.DEFINITION_VERSION);
  assert.equal(migrated.dependencies.some(dep => dep.type === 'texture' && dep.value === 'textures/old-panel.png'), true);
});

test('Logic exporter emits portable JS and TS graph modules', () => {
  const graph = global.LK_LOGIC_GRAPH.createStarterGraph('Export Me', 'element');
  const jsModule = global.LK_LOGIC_EXPORTER.exportGraphModule(graph, {format:'js', exportName:'ExportMe'});
  const tsModule = global.LK_LOGIC_EXPORTER.exportGraphModule(graph, {format:'ts', exportName:'ExportMe'});
  const jsRuntimeModule = global.LK_LOGIC_EXPORTER.exportGraphRuntimeModule(graph, {format:'js', exportName:'ExportMe', runtimeExportName:'ExportMeRuntime'});
  const tsRuntimeModule = global.LK_LOGIC_EXPORTER.exportGraphRuntimeModule(graph, {format:'ts', exportName:'ExportMe', runtimeExportName:'ExportMeRuntime'});
  assert.equal(jsModule.includes('export const metadata'), true);
  assert.equal(jsModule.includes('export const ExportMe'), true);
  assert.equal(jsModule.includes('export default ExportMe'), true);
  assert.equal(tsModule.includes('export type LogicGraph'), true);
  assert.equal(tsModule.includes('export const ExportMe: LogicGraph'), true);
  assert.equal(tsModule.includes('definitionVersion'), true);
  assert.equal(jsRuntimeModule.includes('export function createExportMeRuntime'), true);
  assert.equal(jsRuntimeModule.includes('LK_LOGIC_RUNTIME.create is required'), true);
  assert.equal(tsRuntimeModule.includes('export type LogicRuntimeFactory'), true);
  assert.equal(tsRuntimeModule.includes('factory.create(ExportMe, registry, context, options)'), true);
});

test('Logic exporter emits bounded imperative runner foundation with guarded fallbacks', () => {
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Safe Export', 'element');
  graph.variables.push({name:'score', type:'number', value:1});
  graph.nodes.push(
    global.LK_LOGIC_GRAPH.node('start', 'event.onStart', 0, 0),
    global.LK_LOGIC_GRAPH.node('get_score', 'variable.get', 220, 80, {name:'score'}),
    global.LK_LOGIC_GRAPH.node('add_score', 'math.add', 440, 80, {b:2}),
    global.LK_LOGIC_GRAPH.node('set_score', 'variable.set', 660, 0, {name:'score'}),
    global.LK_LOGIC_GRAPH.node('print_score', 'debug.print', 900, 0, {message:'fallback message'}),
    global.LK_LOGIC_GRAPH.node('wait', 'flow.delay', 1120, 0, {seconds:1})
  );
  graph.edges.push(
    global.LK_LOGIC_GRAPH.edge('e_start_set', 'start', 'then', 'set_score', 'exec'),
    global.LK_LOGIC_GRAPH.edge('e_get_add_a', 'get_score', 'value', 'add_score', 'a'),
    global.LK_LOGIC_GRAPH.edge('e_add_set_value', 'add_score', 'value', 'set_score', 'value'),
    global.LK_LOGIC_GRAPH.edge('e_set_print', 'set_score', 'completed', 'print_score', 'exec'),
    global.LK_LOGIC_GRAPH.edge('e_add_print_message', 'add_score', 'value', 'print_score', 'message'),
    global.LK_LOGIC_GRAPH.edge('e_print_wait', 'print_score', 'completed', 'wait', 'exec')
  );

  assert.equal(typeof global.LK_LOGIC_EXPORTER.exportGraphImperativeModule, 'function');
  const jsModule = global.LK_LOGIC_EXPORTER.exportGraphImperativeModule(graph, {format:'js', exportName:'SafeExport'});
  const tsModule = global.LK_LOGIC_EXPORTER.exportGraphImperativeModule(graph, {format:'ts', exportName:'SafeExport'});

  assert.equal(jsModule.includes('export function createSafeExportImperativeRunner'), true);
  assert.equal(jsModule.includes('export function runSafeExportOnStart'), true);
  assert.equal(jsModule.includes('function runOnStart'), true);
  assert.equal(jsModule.includes('writeVariable("score"'), true);
  assert.equal(jsModule.includes('state.debugLog.push'), true);
  assert.equal(jsModule.includes('markUnsupported("wait", "unsupported exec node: flow.delay")'), true);
  assert.equal(jsModule.includes('unsupportedNodes'), true);
  assert.equal(jsModule.includes('eval('), false);
  assert.equal(tsModule.includes('export type LogicImperativeState'), true);
  assert.equal(tsModule.includes('as const'), true);
});

test('Logic runner aggregates runtime profiling stats', () => {
  const logs = [];
  const frameHooks = [];
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Runner Stats Test', 'level');
  graph.nodes.push(
    global.LK_LOGIC_GRAPH.node('start', 'event.onStart', 0, 0),
    global.LK_LOGIC_GRAPH.node('print', 'debug.print', 240, 0, {message:'runner started', duration:1})
  );
  graph.edges.push(global.LK_LOGIC_GRAPH.edge('start-print', 'start', 'then', 'print', 'exec'));
  const fakeStore = {
    load(){ return {logic:{levelGraph:graph}}; },
  };
  const fakeGame = {
    state:{started:true, sceneReady:true},
    hooks:{frame:frameHooks},
    world:{registry:[]},
    systems:{},
    ui:{popup(){}},
    core:{scene:null},
  };
  const runner = global.LK_LOGIC_ELEMENTS_RUNNER.create(fakeGame, fakeStore);
  assert.equal(runner.install(), true);
  assert.equal(frameHooks.length, 0);
  runner.update(0.016);
  const stats = runner.stats();
  assert.equal(stats.active, true);
  assert.equal(stats.runtimeCount, 1);
  assert.equal(stats.runtimes[0].graphName, 'Runner Stats Test');
  assert.equal(stats.runtimes[0].events >= 2, true);
  assert.equal(stats.runtimes[0].nodeRuns >= 1, true);
  assert.equal(Array.isArray(stats.runtimes[0].timeline), true);
  runner.dispose();
  assert.equal(runner.stats().active, false);
  assert.equal(logs.length, 0);
});

console.log('Logic core tests completed.');
