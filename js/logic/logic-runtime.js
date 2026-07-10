/* =========================================================
   LOT KING - Logic Element runtime interpreter
   Executes graph JSON through registered node definitions.
   ========================================================= */
(function(){
'use strict';

function create(graph, registry, context, options){
  const g = window.LK_LOGIC_GRAPH.normalizeGraph(graph, context && context.graphName, context && context.scope);
  const opts = Object.assign({maxExecutionSteps:500, maxSubgraphDepth:8, subgraphDepth:0, pauseOnBreakpoint:false}, options || {});
  const nodes = new Map(g.nodes.map(n => [n.id, n]));
  const variables = new Map();
  const timers = new Set();
  const eventState = new Map();
  const statsState = {
    startedAt:0,
    stoppedAt:0,
    events:0,
    nodeRuns:0,
    evaluations:0,
    maxStepsUsed:0,
    lastEvent:'',
    lastNode:'',
    lastError:'',
    lastBreakpoint:'',
    breakpoints:0,
    paused:false,
    pausedNode:'',
    pausedNodeTitle:'',
    pausedInputPin:'',
    timeline:[],
  };
  let stopped = false;
  let paused = false;
  let pausedFrame = null;
  let eventPayload = null;

  g.variables.forEach(v => variables.set(v.name, window.LK_LOGIC_GRAPH.clone(v.value)));

  function now(){
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function trace(type, details){
    const item = Object.assign({time:now(), type:String(type || '')}, details || {});
    statsState.timeline.push(item);
    if(statsState.timeline.length > 80) statsState.timeline.splice(0, statsState.timeline.length - 80);
  }

  function setPausedFrame(node, def, state){
    paused = true;
    pausedFrame = {
      nodeId:node.id,
      inputPin:state.inputPin || 'exec',
      steps:state.steps,
      stack:(state.stack || []).slice(),
    };
    statsState.paused = true;
    statsState.pausedNode = node.id;
    statsState.pausedNodeTitle = def.title || node.type;
    statsState.pausedInputPin = state.inputPin || 'exec';
  }

  function clearPausedFrame(){
    paused = false;
    pausedFrame = null;
    statsState.paused = false;
    statsState.pausedNode = '';
    statsState.pausedNodeTitle = '';
    statsState.pausedInputPin = '';
  }

  function incomingDataEdge(nodeId, pinName){
    return g.edges.find(e => e.to.node === nodeId && e.to.pin === pinName);
  }

  function outputExecEdges(nodeId, pinName){
    return g.edges.filter(e => e.from.node === nodeId && e.from.pin === pinName);
  }

  function inputDefault(def, pinName){
    const p = ((def && def.inputs) || []).find(item => item.name === pinName);
    return p && p.defaultValue;
  }

  function evaluateNodeOutput(nodeId, pinName, stack){
    statsState.evaluations += 1;
    const n = nodes.get(nodeId);
    const def = n && registry.get(n.type);
    if(!n || !def) return undefined;
    if(n.type === 'event.onUpdate' && pinName === 'deltaTime') return eventPayload && Number(eventPayload.deltaTime) || 0;
    if(n.type === 'event.onFixedUpdate' && pinName === 'fixedDeltaTime') return eventPayload && Number(eventPayload.fixedDeltaTime) || 0;
    if(n.type === 'event.custom' && pinName === 'payload') return eventPayload && eventPayload.payload;
    if(def.event && eventPayload && Object.prototype.hasOwnProperty.call(eventPayload, pinName)) return eventPayload[pinName];
    if(def.evaluate) return def.evaluate(makeApi(n, def, stack || []), pinName);
    return n.data && n.data[pinName];
  }

  function readInput(node, def, pinName, stack){
    const edge = incomingDataEdge(node.id, pinName);
    if(edge) return evaluateNodeOutput(edge.from.node, edge.from.pin, stack.concat(node.id));
    if(node.data && Object.prototype.hasOwnProperty.call(node.data, pinName)) return node.data[pinName];
    return inputDefault(def, pinName);
  }

  function continueFrom(node, outPin, state){
    const next = outputExecEdges(node.id, outPin || 'then');
    next.forEach(e => {
      const previousInput = state && state.inputPin;
      if(state) state.inputPin = e.to.pin || 'exec';
      runFromNode(e.to.node, state);
      if(state) state.inputPin = previousInput;
    });
  }

  function makeApi(node, def, state){
    return {
      graph:g,
      node,
      context,
      payload:eventPayload,
      inputPin: state && state.inputPin || 'exec',
      getInput: name => readInput(node, def, name, state && state.stack || []),
      getVariable: name => variables.get(String(name || '')),
      setVariable: (name, value) => variables.set(String(name || ''), window.LK_LOGIC_GRAPH.clone(value)),
      continue: pin => continueFrom(node, pin, state),
      delay: (seconds, pin) => {
        const ms = Math.max(0, Number(seconds) || 0) * 1000;
        const timer = setTimeout(() => {
          timers.delete(timer);
          if(!stopped) continueFrom(node, pin || 'completed', {steps:0, stack:[]});
        }, ms);
        timers.add(timer);
      },
      callSubgraph,
      debug: context.debug,
      services: context.services,
    };
  }

  function callSubgraph(ref, payload){
    const wanted = String(ref || '').trim();
    if(!wanted){
      context.debug.warn('Call Subgraph skipped: no subgraph selected in ' + g.name);
      return undefined;
    }
    if(opts.subgraphDepth >= opts.maxSubgraphDepth){
      statsState.lastError = 'max subgraph depth exceeded';
      trace('error', {message:statsState.lastError, graph:g.name});
      context.debug.error('Call Subgraph stopped: max subgraph depth exceeded in ' + g.name);
      return undefined;
    }
    const wantedLower = wanted.toLowerCase();
    const sg = (g.subgraphs || []).find(item => item && item.enabled !== false && (String(item.id).toLowerCase() === wantedLower || String(item.name).toLowerCase() === wantedLower));
    if(!sg){
      context.debug.warn('Call Subgraph skipped: "' + wanted + '" does not exist in ' + g.name);
      return undefined;
    }
    const childGraph = {
      version:g.version,
      name:g.name + ' / ' + sg.name,
      scope:g.scope,
      enabled:true,
      variables:g.variables.concat(sg.variables || []),
      nodes:sg.nodes || [],
      edges:sg.edges || [],
      comments:sg.comments || [],
      subgraphs:g.subgraphs || [],
    };
    const child = create(childGraph, registry, Object.assign({}, context, {
      graphName:childGraph.name,
      scope:g.scope,
    }), Object.assign({}, opts, {subgraphDepth:opts.subgraphDepth + 1}));
    child.variables.forEach((value, name) => {
      if(variables.has(name)) child.variables.set(name, window.LK_LOGIC_GRAPH.clone(variables.get(name)));
    });
    child.triggerEvent('Custom', {eventName:'Entry', payload});
    child.variables.forEach((value, name) => {
      if(variables.has(name)) variables.set(name, window.LK_LOGIC_GRAPH.clone(value));
    });
    return child.variables.has('returnValue') ? window.LK_LOGIC_GRAPH.clone(child.variables.get('returnValue')) : payload;
  }

  function runFromNode(nodeId, state){
    if(stopped || paused) return;
    state = state || {steps:0, stack:[]};
    if(++state.steps > opts.maxExecutionSteps){
      statsState.lastError = 'max steps exceeded';
      trace('error', {message:statsState.lastError, graph:g.name});
      context.debug.error('Logic execution stopped: max steps exceeded in ' + g.name);
      return;
    }
    statsState.maxStepsUsed = Math.max(statsState.maxStepsUsed, state.steps);
    const n = nodes.get(nodeId);
    const def = n && registry.get(n.type);
    if(!n || !def) return;
    statsState.lastNode = n.id;
    if(state.stepMode && !state.resumingStep){
      setPausedFrame(n, def, state);
      trace('step-paused', {node:n.id, nodeType:n.type, title:def.title || n.type});
      return;
    }
    if(state.resumingStep) state.resumingStep = false;
    if(n.data && n.data.breakpoint === true && !state.resumingBreakpoint){
      statsState.breakpoints += 1;
      statsState.lastBreakpoint = n.id;
      trace('breakpoint', {node:n.id, nodeType:n.type, title:def.title || n.type});
      if(opts.pauseOnBreakpoint){
        setPausedFrame(n, def, state);
        trace('paused', {node:n.id, nodeType:n.type, title:def.title || n.type});
        return;
      }
    }
    trace(def.event ? 'event-node' : 'node', {node:n.id, nodeType:n.type, title:def.title || n.type, inputPin:state.inputPin || 'exec'});
    if(def.event) return continueFrom(n, 'then', state);
    if(!def.run) return;
    statsState.nodeRuns += 1;
    try {
      const result = def.run(makeApi(n, def, state)) || {};
      const outs = result.exec == null ? [] : (Array.isArray(result.exec) ? result.exec : [result.exec]);
      outs.forEach(out => continueFrom(n, out || 'then', state));
    } catch(err){
      statsState.lastError = (def.title || n.type) + ': ' + (err && err.message || err);
      trace('error', {node:n.id, nodeType:n.type, message:statsState.lastError});
      context.debug.error((def.title || n.type) + ': ' + (err && err.message || err));
    }
  }

  function triggerEvent(eventType, payload){
    if(stopped || paused || g.enabled === false) return;
    statsState.events += 1;
    statsState.lastEvent = String(eventType || '');
    trace('event', {event:statsState.lastEvent, payloadKeys:Object.keys(payload || {}).slice(0, 8)});
    eventPayload = payload || {};
    g.nodes.forEach(n => {
      const def = registry.get(n.type);
      if(!def || def.event !== eventType) return;
      if(eventType === 'Custom'){
        const wanted = String(n.data && n.data.eventName || '');
        const got = String(eventPayload.eventName || '');
        if(wanted && wanted !== got) return;
      }
      if((eventType === 'OnKeyDown' || eventType === 'OnKeyUp') && n.data && n.data.key){
        const wanted = String(n.data.key || '').toLowerCase();
        const got = String(eventPayload.key || '').toLowerCase();
        if(wanted && wanted !== got) return;
      }
      if((eventType === 'OnPointerDown' || eventType === 'OnPointerUp') && n.data && n.data.button !== 'any' && n.data.button != null){
        if(String(n.data.button) !== String(eventPayload.button)) return;
      }
      if(eventType === 'OnGamepadButton'){
        const wantedPad = Number(readInput(n, def, 'gamepadIndex', [])) || 0;
        const wantedButton = Number(readInput(n, def, 'button', [])) || 0;
        if(wantedPad !== Number(eventPayload.gamepadIndex) || wantedButton !== Number(eventPayload.button)) return;
      }
      if(n.type === 'event.tickEvery' && eventType === 'OnUpdate'){
        const interval = Math.max(.01, Number(readInput(n, def, 'seconds', [])) || .5);
        const elapsed = (eventState.get(n.id) || 0) + (Number(eventPayload.deltaTime) || 0);
        if(elapsed + 1e-9 < interval){
          eventState.set(n.id, elapsed);
          return;
        }
        eventState.set(n.id, elapsed % interval);
      }
      runFromNode(n.id, {steps:0, stack:[]});
    });
    eventPayload = null;
  }

  function update(dt){ triggerEvent('OnUpdate', {deltaTime:dt}); }
  function fixedUpdate(dt){ triggerEvent('OnFixedUpdate', {fixedDeltaTime:dt}); }
  function start(){
    statsState.startedAt = Date.now();
    statsState.stoppedAt = 0;
    stopped = false;
    clearPausedFrame();
    triggerEvent('OnStart', {});
  }
  function stop(){
    stopped = true;
    clearPausedFrame();
    statsState.stoppedAt = Date.now();
    timers.forEach(timer => clearTimeout(timer));
    timers.clear();
    eventState.clear();
  }
  function setPauseOnBreakpoint(value){
    opts.pauseOnBreakpoint = value === true;
  }
  function resume(){
    if(stopped || !paused || !pausedFrame) return false;
    const frame = pausedFrame;
    clearPausedFrame();
    trace('resumed', {node:frame.nodeId});
    runFromNode(frame.nodeId, {
      steps:Math.max(0, Number(frame.steps) || 0) - 1,
      stack:frame.stack || [],
      inputPin:frame.inputPin || 'exec',
      resumingBreakpoint:true,
    });
    return true;
  }
  function step(){
    if(stopped || !paused || !pausedFrame) return false;
    const frame = pausedFrame;
    clearPausedFrame();
    trace('stepped', {node:frame.nodeId});
    runFromNode(frame.nodeId, {
      steps:Math.max(0, Number(frame.steps) || 0) - 1,
      stack:frame.stack || [],
      inputPin:frame.inputPin || 'exec',
      resumingBreakpoint:true,
      resumingStep:true,
      stepMode:true,
    });
    return true;
  }
  function clearTimeline(){
    statsState.timeline = [];
  }
  function stats(){
    return Object.assign({}, statsState, {
      active:!stopped,
      paused,
      pauseOnBreakpoint:opts.pauseOnBreakpoint === true,
      timers:timers.size,
      variables:variables.size,
      graphName:g.name,
      scope:g.scope,
      timeline:statsState.timeline.slice(-40).map(item => Object.assign({}, item)),
    });
  }

  return Object.freeze({graph:g, context, start, update, fixedUpdate, triggerEvent, stop, resume, step, setPauseOnBreakpoint, clearTimeline, variables, stats});
}

window.LK_LOGIC_RUNTIME = Object.freeze({create});
})();
