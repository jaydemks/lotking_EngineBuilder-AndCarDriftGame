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
    assert.equal(template.graph.logicScene.elements.some(element => element && element.name === 'Default Mesh'), true);

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
    },
    elements:[],
  };
  graph.nodes.push(
    global.LK_LOGIC_GRAPH.node('load_texture', 'material.loadTexture', 0, 0, {textureRef:'textures/panel.png'}),
    global.LK_LOGIC_GRAPH.node('load_texture_asset', 'material.loadTexture', 0, 0, {textureRef:{id:'tex-1', dbKey:'tex-db-1', name:'Panel Texture', kind:'texture'}}),
    global.LK_LOGIC_GRAPH.node('play_sound', 'audio.playSound', 0, 0, {soundRef:'sounds/open.wav'})
  );
  const deps = global.LK_LOGIC_GRAPH.collectGraphDependencies(graph);
  assert.equal(deps.length, 4);
  assert.equal(deps.some(dep => dep.type === 'mesh' && dep.id === 'mesh-1'), true);
  assert.equal(deps.some(dep => dep.type === 'texture' && dep.value === 'textures/panel.png'), true);
  assert.equal(deps.some(dep => dep.type === 'texture' && dep.id === 'tex-1' && dep.dbKey === 'tex-db-1'), true);
  assert.equal(deps.some(dep => dep.type === 'audio' && dep.value === 'sounds/open.wav'), true);
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
  assert.equal(frameHooks.length, 1);
  frameHooks[0](0.016);
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
