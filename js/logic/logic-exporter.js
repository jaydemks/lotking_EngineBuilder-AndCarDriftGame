/* =========================================================
   LOT KING - Logic Element module exporter
   Exports graph JSON as portable JS/TS modules without eval.
   ========================================================= */
(function(){
'use strict';

function moduleName(value){
  const base = String(value || 'logicGraph').replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^([^A-Za-z_$])/, '_$1');
  return base || 'logicGraph';
}

function stableStringify(value){
  return JSON.stringify(value, null, 2).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function oneLine(value){
  if(value === undefined) return 'undefined';
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function safeComment(value){
  return String(value || '').replace(/\*\//g, '* /');
}

function numberExpression(expr){
  return '(Number(' + expr + ') || 0)';
}

function exportGraphModule(graph, opts){
  const options = opts || {};
  const format = String(options.format || 'js').toLowerCase() === 'ts' ? 'ts' : 'js';
  const g = window.LK_LOGIC_GRAPH && window.LK_LOGIC_GRAPH.normalizeGraph
    ? window.LK_LOGIC_GRAPH.normalizeGraph(graph, options.name, options.scope)
    : graph;
  const dependencies = window.LK_LOGIC_GRAPH && window.LK_LOGIC_GRAPH.collectGraphDependencies
    ? window.LK_LOGIC_GRAPH.collectGraphDependencies(g)
    : [];
  const name = moduleName(options.exportName || g && g.name || 'logicGraph');
  const header = [
    '/* Auto-generated Logic Element graph module.',
    '   Runtime execution still uses LK_LOGIC_RUNTIME; this module carries portable graph data and optional runtime helpers. */',
  ].join('\n');
  const metadata = {
    exporter:'lot-king-logic-exporter',
    graphVersion:g && g.version || 1,
    definitionVersion:window.LK_LOGIC_GRAPH && window.LK_LOGIC_GRAPH.DEFINITION_VERSION || 1,
    name:g && g.name || options.name || 'Logic Graph',
    scope:g && g.scope || options.scope || 'element',
    dependencies,
  };
  const graphJson = stableStringify(g);
  const metaJson = stableStringify(metadata);
  if(format === 'ts'){
    return [
      header,
      'export type LogicGraph = Record<string, unknown>;',
      'export const metadata = ' + metaJson + ' as const;',
      'export const ' + name + ': LogicGraph = ' + graphJson + ';',
      'export default ' + name + ';',
      '',
    ].join('\n');
  }
  return [
    header,
    'export const metadata = Object.freeze(' + metaJson + ');',
    'export const ' + name + ' = Object.freeze(' + graphJson + ');',
    'export default ' + name + ';',
    '',
  ].join('\n');
}

function exportGraphImperativeModule(graph, opts){
  const options = opts || {};
  const format = String(options.format || 'js').toLowerCase() === 'ts' ? 'ts' : 'js';
  const g = window.LK_LOGIC_GRAPH && window.LK_LOGIC_GRAPH.normalizeGraph
    ? window.LK_LOGIC_GRAPH.normalizeGraph(graph, options.name, options.scope)
    : graph;
  const name = moduleName(options.exportName || g && g.name || 'logicGraph');
  const runnerName = moduleName(options.runnerExportName || ('create' + name + 'ImperativeRunner'));
  const runStartName = moduleName(options.onStartExportName || ('run' + name + 'OnStart'));
  const nodes = new Map(((g && g.nodes) || []).map(node => [node.id, node]));
  const edges = ((g && g.edges) || []).slice().sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  const unsupported = new Map();
  const defaults = {
    'debug.print':{message:'Hello Logic', duration:3},
    'variable.get':{name:''},
    'variable.set':{name:'', value:null},
    'math.add':{a:0, b:0},
    'math.subtract':{a:0, b:0},
    'math.multiply':{a:0, b:0},
    'math.divide':{a:0, b:1},
  };

  function addUnsupported(node, reason){
    if(!node) return;
    unsupported.set(node.id, {
      id:node.id,
      type:node.type,
      reason:reason || 'unsupported node type',
    });
  }

  function inputDefault(node, pin){
    if(node && node.data && Object.prototype.hasOwnProperty.call(node.data, pin)) return node.data[pin];
    const typeDefaults = defaults[node && node.type] || {};
    return Object.prototype.hasOwnProperty.call(typeDefaults, pin) ? typeDefaults[pin] : null;
  }

  function incomingDataEdge(nodeId, pin){
    return edges.find(edge => edge.to.node === nodeId && edge.to.pin === pin);
  }

  function outputExecEdges(nodeId, pin){
    return edges.filter(edge => edge.from.node === nodeId && edge.from.pin === pin);
  }

  function dataInput(node, pin, stack){
    const edge = incomingDataEdge(node.id, pin);
    if(edge) return nodeOutput(edge.from.node, edge.from.pin, stack.concat(node.id));
    return oneLine(inputDefault(node, pin));
  }

  function variableName(node){
    return oneLine(String(inputDefault(node, 'name') || ''));
  }

  function nodeOutput(nodeId, pin, stack){
    if(stack.indexOf(nodeId) !== -1) return 'undefined';
    const node = nodes.get(nodeId);
    if(!node){
      return 'undefined';
    }
    if(node.type === 'variable.get' && pin === 'value'){
      return 'readVariable(' + variableName(node) + ')';
    }
    if(node.type === 'variable.set' && pin === 'value'){
      return 'readVariable(' + variableName(node) + ')';
    }
    if((node.type === 'math.add' || node.type === 'math.subtract' || node.type === 'math.multiply' || node.type === 'math.divide') && pin === 'value'){
      const a = numberExpression(dataInput(node, 'a', stack));
      const b = numberExpression(dataInput(node, 'b', stack));
      if(node.type === 'math.add') return '(' + a + ' + ' + b + ')';
      if(node.type === 'math.subtract') return '(' + a + ' - ' + b + ')';
      if(node.type === 'math.multiply') return '(' + a + ' * ' + b + ')';
      return '((' + b + ') === 0 ? 0 : ' + a + ' / ' + b + ')';
    }
    addUnsupported(node, 'unsupported data output "' + pin + '"');
    return 'undefined';
  }

  function emitNode(nodeId, lines, stack){
    if(stack.indexOf(nodeId) !== -1){
      lines.push('    markUnsupported(' + oneLine(nodeId) + ', "cycle detected");');
      return;
    }
    const node = nodes.get(nodeId);
    if(!node){
      lines.push('    markUnsupported(' + oneLine(nodeId) + ', "missing node");');
      return;
    }
    const nextStack = stack.concat(nodeId);
    if(node.type === 'event.onStart'){
      outputExecEdges(node.id, 'then').forEach(edge => emitNode(edge.to.node, lines, nextStack));
      return;
    }
    lines.push('    /* node ' + safeComment(node.id) + ' (' + safeComment(node.type) + ') */');
    if(node.type === 'debug.print'){
      lines.push('    state.debugLog.push(String(' + dataInput(node, 'message', nextStack) + '));');
      outputExecEdges(node.id, 'completed').forEach(edge => emitNode(edge.to.node, lines, nextStack));
      return;
    }
    if(node.type === 'variable.set'){
      lines.push('    writeVariable(' + variableName(node) + ', ' + dataInput(node, 'value', nextStack) + ');');
      outputExecEdges(node.id, 'completed').forEach(edge => emitNode(edge.to.node, lines, nextStack));
      return;
    }
    addUnsupported(node, 'unsupported exec node');
    lines.push('    markUnsupported(' + oneLine(node.id) + ', ' + oneLine('unsupported exec node: ' + node.type) + ');');
  }

  const variableDefaults = {};
  ((g && g.variables) || []).forEach(item => {
    if(item && item.name) variableDefaults[item.name] = item.value;
  });
  const body = [];
  const startNodes = ((g && g.nodes) || []).filter(node => node.type === 'event.onStart').sort((a, b) => String(a.id).localeCompare(String(b.id)));
  if(startNodes.length){
    startNodes.forEach(node => emitNode(node.id, body, []));
  } else {
    body.push('    /* No event.onStart node was found; runner is intentionally idle. */');
  }
  const unsupportedList = Array.from(unsupported.values()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const metadata = {
    exporter:'lot-king-logic-imperative-exporter',
    graphVersion:g && g.version || 1,
    name:g && g.name || options.name || 'Logic Graph',
    scope:g && g.scope || options.scope || 'element',
    supportedNodes:['event.onStart', 'debug.print', 'math.add', 'math.subtract', 'math.multiply', 'math.divide', 'variable.get', 'variable.set'],
    unsupportedNodes:unsupportedList,
  };
  const header = [
    '/* Auto-generated Logic Element imperative module.',
    '   Bounded safe subset: no eval, no dynamic execution, unsupported nodes are guarded. */',
  ].join('\n');
  const initialType = format === 'ts' ? ': Record<string, unknown>' : '';
  const readType = format === 'ts' ? ': unknown' : '';
  const valueType = format === 'ts' ? ': unknown' : '';
  const runnerReturn = format === 'ts' ? ': { state: LogicImperativeState; runOnStart(payload?: Record<string, unknown>): LogicImperativeState; readVariable(name: string): unknown; writeVariable(name: string, value: unknown): unknown }' : '';
  const tsTypes = format === 'ts'
    ? [
      'export type LogicImperativeState = { variables: Record<string, unknown>; debugLog: string[]; unsupportedNodes: Array<{id: string; reason: string}>; payload: Record<string, unknown> };',
      'export type LogicImperativeMetadata = typeof imperativeMetadata;',
    ]
    : [];
  return [
    header,
    'export const imperativeMetadata = ' + (format === 'ts' ? stableStringify(metadata) + ' as const;' : 'Object.freeze(' + stableStringify(metadata) + ');'),
    tsTypes.join('\n'),
    'const variableDefaults = ' + (format === 'ts' ? stableStringify(variableDefaults) + ' as Record<string, unknown>;' : 'Object.freeze(' + stableStringify(variableDefaults) + ');'),
    'export function ' + runnerName + '(initialVariables' + initialType + ' = {})' + runnerReturn + ' {',
    '  const state' + (format === 'ts' ? ': LogicImperativeState' : '') + ' = { variables:Object.assign({}, variableDefaults, initialVariables), debugLog:[], unsupportedNodes:[], payload:{} };',
    '  function readVariable(name' + (format === 'ts' ? ': string' : '') + ')' + readType + ' { return state.variables[String(name || "")]; }',
    '  function writeVariable(name' + (format === 'ts' ? ': string' : '') + ', value' + valueType + ')' + readType + ' { state.variables[String(name || "")] = value; return value; }',
    '  function markUnsupported(id' + (format === 'ts' ? ': string' : '') + ', reason' + (format === 'ts' ? ': string' : '') + ')' + (format === 'ts' ? ': void' : '') + ' { state.unsupportedNodes.push({id:String(id || ""), reason:String(reason || "unsupported")}); }',
    '  function runOnStart(payload' + (format === 'ts' ? ': Record<string, unknown>' : '') + ' = {})' + (format === 'ts' ? ': LogicImperativeState' : '') + ' {',
    '    state.payload = Object.assign({}, payload);',
    body.length ? body.join('\n') : '    /* OnStart has no supported imperative work. */',
    '    return state;',
    '  }',
    '  return { state, runOnStart, readVariable, writeVariable };',
    '}',
    'export function ' + runStartName + '(initialVariables' + initialType + ' = {})' + (format === 'ts' ? ': LogicImperativeState' : '') + ' {',
    '  const runner = ' + runnerName + '(initialVariables);',
    '  return runner.runOnStart();',
    '}',
    '',
  ].filter(Boolean).join('\n');
}

function exportGraphRuntimeModule(graph, opts){
  const options = Object.assign({}, opts || {}, {format:(opts && opts.format) || 'js'});
  const format = String(options.format || 'js').toLowerCase() === 'ts' ? 'ts' : 'js';
  const dataModule = exportGraphModule(graph, options);
  const g = window.LK_LOGIC_GRAPH && window.LK_LOGIC_GRAPH.normalizeGraph
    ? window.LK_LOGIC_GRAPH.normalizeGraph(graph, options.name, options.scope)
    : graph;
  const name = moduleName(options.exportName || g && g.name || 'logicGraph');
  const runtimeName = moduleName((options.runtimeExportName || name + 'Runtime'));
  if(format === 'ts'){
    return [
      dataModule.trimEnd(),
      '',
      'export type LogicRuntimeFactory = { create(graph: LogicGraph, registry: unknown, context: unknown, options?: Record<string, unknown>): unknown };',
      'export function create' + runtimeName + '(registry: unknown, context: unknown, options: Record<string, unknown> = {}, runtimeFactory?: LogicRuntimeFactory): unknown {',
      '  const factory = runtimeFactory || (globalThis as typeof globalThis & { LK_LOGIC_RUNTIME?: LogicRuntimeFactory }).LK_LOGIC_RUNTIME;',
      '  if (!factory || typeof factory.create !== "function") throw new Error("LK_LOGIC_RUNTIME.create is required to run exported Logic Element graphs");',
      '  return factory.create(' + name + ', registry, context, options);',
      '}',
      '',
    ].join('\n');
  }
  return [
    dataModule.trimEnd(),
    '',
    'export function create' + runtimeName + '(registry, context, options = {}, runtimeFactory) {',
    '  const factory = runtimeFactory || globalThis.LK_LOGIC_RUNTIME;',
    '  if (!factory || typeof factory.create !== "function") throw new Error("LK_LOGIC_RUNTIME.create is required to run exported Logic Element graphs");',
    '  return factory.create(' + name + ', registry, context, options);',
    '}',
    '',
  ].join('\n');
}

window.LK_LOGIC_EXPORTER = Object.freeze({exportGraphModule, exportGraphRuntimeModule, exportGraphImperativeModule});
})();
