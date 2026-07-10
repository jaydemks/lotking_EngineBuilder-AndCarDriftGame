/* =========================================================
   LOT KING - Logic Element graph validator
   ========================================================= */
(function(){
'use strict';

function dynamicPins(def, direction, graph, node){
  const pins = ((direction === 'output' ? def.outputs : def.inputs) || []).slice();
  if(!graph || !node || node.type !== 'flow.callSubgraph') return pins;
  const ref = String(node.data && node.data.subgraph || '').toLowerCase();
  if(!ref) return pins;
  const sg = (graph.subgraphs || []).find(item => item && (String(item.id).toLowerCase() === ref || String(item.name).toLowerCase() === ref));
  if(!sg) return pins;
  const ports = direction === 'output' ? sg.outputs : sg.inputs;
  (ports || []).forEach(port => {
    if(!port || !port.name || pins.some(item => item && item.name === port.name)) return;
    pins.push({name:String(port.name), kind:'data', direction, type:String(port.type || 'any'), defaultValue:null});
  });
  return pins;
}

function pin(def, name, direction, graph, node){
  const pins = dynamicPins(def, direction, graph, node);
  return pins.find(p => p && p.name === name) || null;
}

function compatible(a, b){
  if(!a || !b) return false;
  if(a.kind !== b.kind) return false;
  if(a.kind === 'exec') return true;
  if(a.type === 'any' || b.type === 'any') return true;
  const at = String(a.type || '').toLowerCase();
  const bt = String(b.type || '').toLowerCase();
  if((at === 'string' && bt === 'assetref') || (at === 'assetref' && bt === 'string')) return true;
  return a.type === b.type;
}

function addDiagnostic(target, severity, code, message, details){
  const item = Object.assign({severity, code, message}, details || {});
  target.push(item);
  return item;
}

function inputValue(node, input){
  if(!input) return undefined;
  if(node && node.data && Object.prototype.hasOwnProperty.call(node.data, input.name)) return node.data[input.name];
  return input.defaultValue;
}

function nodeDiagnostics(result, nodeId){
  return ((result && result.diagnostics) || []).filter(item => item && item.node === nodeId);
}

function validateGraph(graph, registry){
  const errors = [];
  const warnings = [];
  const diagnostics = [];
  const g = window.LK_LOGIC_GRAPH.normalizeGraph(graph);
  const nodes = new Map();
  const edgeKeys = new Set();
  const execAdj = new Map();
  const connectedInputs = new Map();
  const outgoingExec = new Map();
  const variableNames = new Set();
  const subgraphRefs = new Set();

  const error = (code, message, details) => {
    const item = addDiagnostic(diagnostics, 'error', code, message, details);
    errors.push(item);
  };
  const warn = (code, message, details) => {
    const item = addDiagnostic(diagnostics, 'warning', code, message, details);
    warnings.push(item);
  };

  g.variables.forEach(variable => {
    if(variableNames.has(variable.name)) error('duplicate-variable', 'Duplicate variable name: ' + variable.name, {variable:variable.name});
    variableNames.add(variable.name);
    if(variable.exposed === true && variable.type === 'any') warn('exposed-any-variable', 'Exposed variable "' + variable.name + '" uses type any.', {variable:variable.name});
  });

  g.subgraphs.forEach(sg => {
    const key = String(sg.id || sg.name || '').toLowerCase();
    const nameKey = String(sg.name || sg.id || '').toLowerCase();
    if(!key) error('missing-subgraph-id', 'Subgraph has no id.', {subgraph:sg.name});
    if(subgraphRefs.has(key) || subgraphRefs.has(nameKey)) error('duplicate-subgraph', 'Duplicate subgraph id/name: ' + (sg.name || sg.id), {subgraph:sg.id});
    subgraphRefs.add(key);
    subgraphRefs.add(nameKey);
    const localNodes = new Map();
    sg.nodes.forEach(n => {
      if(localNodes.has(n.id)) error('duplicate-subgraph-node', 'Duplicate node id in subgraph "' + sg.name + '": ' + n.id, {subgraph:sg.id, node:n.id});
      localNodes.set(n.id, n);
      if(!registry.get(n.type)) error('unknown-subgraph-node', 'Unknown node type in subgraph "' + sg.name + '": ' + n.type, {subgraph:sg.id, node:n.id});
    });
    sg.edges.forEach(e => {
      const fromNode = localNodes.get(e.from.node);
      const toNode = localNodes.get(e.to.node);
      if(!fromNode){ error('missing-subgraph-from-node', 'Subgraph edge source node missing: ' + e.from.node, {subgraph:sg.id, edge:e.id}); return; }
      if(!toNode){ error('missing-subgraph-to-node', 'Subgraph edge target node missing: ' + e.to.node, {subgraph:sg.id, edge:e.id}); return; }
      const fromDef = registry.get(fromNode.type);
      const toDef = registry.get(toNode.type);
      if(!fromDef || !toDef) return;
      const fromPin = pin(fromDef, e.from.pin, 'output', g, fromNode);
      const toPin = pin(toDef, e.to.pin, 'input', g, toNode);
      if(!fromPin) error('missing-subgraph-from-pin', 'Subgraph output pin missing: ' + fromNode.type + '.' + e.from.pin, {subgraph:sg.id, edge:e.id, node:fromNode.id, pin:e.from.pin});
      if(!toPin) error('missing-subgraph-to-pin', 'Subgraph input pin missing: ' + toNode.type + '.' + e.to.pin, {subgraph:sg.id, edge:e.id, node:toNode.id, pin:e.to.pin});
      if(fromPin && toPin && !compatible(fromPin, toPin)){
        error('subgraph-pin-type-mismatch', 'Subgraph pin mismatch: ' + fromPin.kind + '/' + (fromPin.type || '') + ' -> ' + toPin.kind + '/' + (toPin.type || ''), {subgraph:sg.id, edge:e.id, node:toNode.id, pin:e.to.pin, relatedNode:fromNode.id});
      }
    });
    const hasEntry = sg.nodes.some(n => n.type === 'event.custom' && String(n.data && n.data.eventName || '') === 'Entry');
    if(sg.nodes.length && !hasEntry) warn('missing-subgraph-entry', 'Subgraph "' + sg.name + '" has no Custom Event named Entry.', {subgraph:sg.id});

    const declaredInputs = new Set();
    const declaredOutputs = new Set();
    (sg.inputs || []).forEach(port => {
      const name = String(port && port.name || '').trim();
      if(!name) warn('missing-function-input-name', 'Function "' + sg.name + '" has an input without a name.', {subgraph:sg.id});
      else if(declaredInputs.has(name)) error('duplicate-function-input', 'Duplicate Function input "' + name + '" in "' + sg.name + '".', {subgraph:sg.id});
      declaredInputs.add(name);
    });
    (sg.outputs || []).forEach(port => {
      const name = String(port && port.name || '').trim();
      if(!name) warn('missing-function-output-name', 'Function "' + sg.name + '" has an output without a name.', {subgraph:sg.id});
      else if(declaredOutputs.has(name)) error('duplicate-function-output', 'Duplicate Function output "' + name + '" in "' + sg.name + '".', {subgraph:sg.id});
      declaredOutputs.add(name);
    });
    const returnedOutputs = new Set();
    sg.nodes.forEach(n => {
      if(n.type === 'function.input'){
        const def = registry.get(n.type);
        const name = String(inputValue(n, (def && def.inputs || []).find(item => item.name === 'name')) || '').trim();
        if(name && declaredInputs.size && !declaredInputs.has(name)) warn('unknown-function-input', 'Function Input "' + name + '" is not declared in "' + sg.name + '".', {subgraph:sg.id, node:n.id, pin:'name'});
      }
      if(n.type === 'function.return'){
        const def = registry.get(n.type);
        const name = String(inputValue(n, (def && def.inputs || []).find(item => item.name === 'name')) || '').trim();
        if(name){
          returnedOutputs.add(name);
          if(declaredOutputs.size && !declaredOutputs.has(name)) warn('unknown-function-output', 'Function Return "' + name + '" is not declared in "' + sg.name + '".', {subgraph:sg.id, node:n.id, pin:'name'});
        }
      }
    });
    declaredOutputs.forEach(name => {
      if(name && !returnedOutputs.has(name)) warn('unreturned-function-output', 'Function output "' + name + '" is declared but no Function Return writes it.', {subgraph:sg.id, pin:name});
    });
  });

  g.nodes.forEach(n => {
    if(nodes.has(n.id)) error('duplicate-node', 'Duplicate node id: ' + n.id, {node:n.id});
    nodes.set(n.id, n);
    if(!registry.get(n.type)) error('unknown-node', 'Unknown node type: ' + n.type, {node:n.id});
  });

  g.edges.forEach(e => {
    const key = e.from.node + ':' + e.from.pin + '>' + e.to.node + ':' + e.to.pin;
    if(edgeKeys.has(key)) error('duplicate-edge', 'Duplicate edge: ' + key, {edge:e.id, node:e.to.node});
    edgeKeys.add(key);
    const fromNode = nodes.get(e.from.node);
    const toNode = nodes.get(e.to.node);
    if(!fromNode){ error('missing-from-node', 'Edge source node missing: ' + e.from.node, {edge:e.id}); return; }
    if(!toNode){ error('missing-to-node', 'Edge target node missing: ' + e.to.node, {edge:e.id}); return; }
    const fromDef = registry.get(fromNode.type);
    const toDef = registry.get(toNode.type);
    if(!fromDef || !toDef) return;
    const fromPin = pin(fromDef, e.from.pin, 'output', g, fromNode);
    const toPin = pin(toDef, e.to.pin, 'input', g, toNode);
    if(!fromPin) error('missing-from-pin', 'Output pin missing: ' + fromNode.type + '.' + e.from.pin, {edge:e.id, node:fromNode.id, pin:e.from.pin});
    if(!toPin) error('missing-to-pin', 'Input pin missing: ' + toNode.type + '.' + e.to.pin, {edge:e.id, node:toNode.id, pin:e.to.pin});
    if(fromPin && toPin && !compatible(fromPin, toPin)){
      error('pin-type-mismatch', 'Pin mismatch: ' + fromPin.kind + '/' + (fromPin.type || '') + ' -> ' + toPin.kind + '/' + (toPin.type || ''), {edge:e.id, node:toNode.id, pin:e.to.pin, relatedNode:fromNode.id});
    }
    if(toPin && toPin.kind === 'data'){
      const inputKey = toNode.id + ':' + toPin.name;
      const count = (connectedInputs.get(inputKey) || 0) + 1;
      connectedInputs.set(inputKey, count);
      if(count > 1) warn('multiple-input-links', 'Input "' + toPin.name + '" has multiple data wires; only one value can be read.', {node:toNode.id, pin:toPin.name, edge:e.id});
    }
    if(fromPin && toPin && fromPin.kind === 'exec' && toPin.kind === 'exec'){
      if(!execAdj.has(fromNode.id)) execAdj.set(fromNode.id, []);
      execAdj.get(fromNode.id).push(toNode.id);
      outgoingExec.set(fromNode.id, (outgoingExec.get(fromNode.id) || 0) + 1);
    }
  });

  const visiting = new Set();
  const visited = new Set();
  function visit(id, path){
    if(visiting.has(id)){
      error('exec-cycle', 'Exec cycle detected: ' + path.concat(id).join(' -> '), {node:id});
      return;
    }
    if(visited.has(id)) return;
    visiting.add(id);
    (execAdj.get(id) || []).forEach(next => visit(next, path.concat(id)));
    visiting.delete(id);
    visited.add(id);
  }
  Array.from(execAdj.keys()).forEach(id => visit(id, []));

  const eventNodes = g.nodes.filter(node => {
    const def = registry.get(node.type);
    return !!(def && def.event);
  });
  if(g.nodes.length && !eventNodes.length) warn('missing-event-entry', 'Graph has nodes but no event entry point. Runtime execution will never start.');

  const reachable = new Set();
  const queue = eventNodes.map(node => node.id);
  while(queue.length){
    const id = queue.shift();
    if(reachable.has(id)) continue;
    reachable.add(id);
    (execAdj.get(id) || []).forEach(next => queue.push(next));
  }

  const scene = g.logicScene || {};
  const sceneElements = [scene.root].concat(Array.isArray(scene.elements) ? scene.elements : []).filter(Boolean);
  const sceneRefs = new Set();
  sceneElements.forEach(element => {
    sceneRefs.add(String(element.id || '').toLowerCase());
    sceneRefs.add(String(element.name || '').toLowerCase());
  });
  const referenceTypes = new Set(['object3d', 'physicsBody', 'material', 'texture', 'ray', 'soundHandle']);
  const variableNodeTypes = new Set(['variable.get', 'variable.set', 'variable.toggleBoolean', 'variable.incrementNumber']);

  g.nodes.forEach(node => {
    const def = registry.get(node.type);
    if(!def) return;
    const execInputs = (def.inputs || []).filter(item => item.kind === 'exec');
    const execOutputs = (def.outputs || []).filter(item => item.kind === 'exec');
    if(def.event && execOutputs.length && !outgoingExec.get(node.id)){
      warn('event-unconnected', def.title + ' is not connected to an execution node.', {node:node.id});
    } else if(!def.event && execInputs.length && !reachable.has(node.id)){
      warn('unreachable-exec-node', def.title + ' cannot be reached from an event.', {node:node.id});
    }

    (def.inputs || []).forEach(input => {
      if(input.kind !== 'data' || connectedInputs.has(node.id + ':' + input.name)) return;
      const value = inputValue(node, input);
      if(referenceTypes.has(input.type) && value == null){
        warn('missing-reference-input', 'Input "' + input.name + '" needs a connected reference.', {node:node.id, pin:input.name});
      }
    });

    if(variableNodeTypes.has(node.type)){
      const nameInput = (def.inputs || []).find(item => item.name === 'name');
      const name = String(nameInput ? inputValue(node, nameInput) : '').trim();
      if(!name) warn('missing-variable-name', def.title + ' has no variable selected.', {node:node.id, pin:'name'});
      else if(!variableNames.has(name)) warn('unknown-variable', 'Variable "' + name + '" does not exist in this graph.', {node:node.id, pin:'name'});
    }
    if(node.type === 'scene.getElement'){
      const input = (def.inputs || []).find(item => item.name === 'name');
      const name = String(inputValue(node, input) || '').trim();
      if(!name) warn('missing-element-name', 'Get Element has no element selected.', {node:node.id, pin:'name'});
      else if(sceneRefs.size && !sceneRefs.has(name.toLowerCase())) warn('unknown-element', 'Logic Element child "' + name + '" does not exist.', {node:node.id, pin:'name'});
    }
    if(node.type === 'event.custom' && !String(inputValue(node, (def.inputs || []).find(item => item.name === 'eventName')) || '').trim()){
      warn('missing-event-name', 'Custom Event has no event name.', {node:node.id, pin:'eventName'});
    }
    if(node.type === 'flow.callSubgraph'){
      const input = (def.inputs || []).find(item => item.name === 'subgraph');
      const name = String(inputValue(node, input) || '').trim();
      if(!name) warn('missing-subgraph-reference', 'Call Subgraph has no subgraph selected.', {node:node.id, pin:'subgraph'});
      else if(!subgraphRefs.has(name.toLowerCase())) warn('unknown-subgraph', 'Subgraph "' + name + '" does not exist.', {node:node.id, pin:'subgraph'});
    }
    if(node.type === 'audio.playSound' && !String(inputValue(node, (def.inputs || []).find(item => item.name === 'soundRef')) || '').trim()){
      warn('missing-sound-reference', 'Play Sound has no sound reference.', {node:node.id, pin:'soundRef'});
    }
    if(node.type === 'material.loadTexture' && !String(inputValue(node, (def.inputs || []).find(item => item.name === 'textureRef')) || '').trim()){
      warn('missing-texture-reference', 'Load Texture has no texture reference.', {node:node.id, pin:'textureRef'});
    }
    if(node.type === 'flow.forLoop'){
      const stepInput = (def.inputs || []).find(item => item.name === 'step');
      if(!connectedInputs.has(node.id + ':step') && Number(inputValue(node, stepInput)) === 0) warn('zero-loop-step', 'For Loop step cannot be zero.', {node:node.id, pin:'step'});
    }
    if(node.type === 'math.divide'){
      const divisor = (def.inputs || []).find(item => item.name === 'b');
      if(!connectedInputs.has(node.id + ':b') && Number(inputValue(node, divisor)) === 0) warn('division-by-zero-default', 'Divide uses zero as its default divisor.', {node:node.id, pin:'b'});
    }
    if(node.type === 'debug.print' || node.type === 'flow.delay' || node.type === 'flow.debounce' || node.type === 'event.tickEvery'){
      const durationName = node.type === 'debug.print' ? 'duration' : 'seconds';
      const durationInput = (def.inputs || []).find(item => item.name === durationName);
      if(durationInput && !connectedInputs.has(node.id + ':' + durationName) && Number(inputValue(node, durationInput)) <= 0){
        warn('non-positive-duration', def.title + ' should use a value greater than zero for "' + durationName + '".', {node:node.id, pin:durationName});
      }
    }
  });

  return {ok:errors.length === 0, errors, warnings, diagnostics};
}

window.LK_LOGIC_VALIDATOR = Object.freeze({validateGraph, nodeDiagnostics});
})();
