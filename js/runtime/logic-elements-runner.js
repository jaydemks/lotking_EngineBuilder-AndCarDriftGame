/* =========================================================
   LOT KING - Logic Element runtime runner
   Bridges saved scene graphs to GAME.hooks.frame.
   ========================================================= */
(function(){
'use strict';

function create(GAME, STORE){
  const state = {
    active:false,
    runtimes:[],
    registry:null,
    accumulator:0,
    inputInstalled:false,
    gamepadButtons:new Map(),
    pauseOnBreakpoints:false,
  };

  function registry(){
    if(!state.registry && window.LK_LOGIC_NODES_MVP) state.registry = window.LK_LOGIC_NODES_MVP.createRegistry();
    return state.registry;
  }

  function logicObjects(){
    return GAME && GAME.world && Array.isArray(GAME.world.registry)
      ? GAME.world.registry.filter(o => o && o.userData && o.userData.editorType === 'logicElement')
      : [];
  }

  function validate(graph){
    const reg = registry();
    if(!reg || !window.LK_LOGIC_VALIDATOR) return {ok:false, errors:[{message:'Logic validator unavailable'}]};
    return window.LK_LOGIC_VALIDATOR.validateGraph(graph, reg);
  }

  function createRuntime(graph, owner, scope, name){
    const reg = registry();
    const normalized = window.LK_LOGIC_GRAPH.normalizeGraph(graph, name, scope);
    const checked = validate(normalized);
    if(!checked.ok){
      console.warn('LotKing Logic: graph skipped', name, checked.errors);
      return null;
    }
    const context = window.LK_LOGIC_SERVICES.createContext({
      GAME,
      STORE,
      THREE: window.THREE,
      owner,
      scope,
      graphName: normalized.name || name,
    });
    return window.LK_LOGIC_RUNTIME.create(normalized, reg, context, {pauseOnBreakpoint:state.pauseOnBreakpoints});
  }

  function rebuild(){
    dispose();
    const sceneData = STORE && STORE.load ? STORE.load() : null;
    const levelGraph = sceneData && sceneData.logic && sceneData.logic.levelGraph;
    if(levelGraph && levelGraph.enabled !== false){
      const runtime = createRuntime(levelGraph, null, 'level', 'Level Logic');
      if(runtime) state.runtimes.push(runtime);
    }
    logicObjects().forEach(owner => {
      if(owner.userData.logicEnabled === false) return;
      if(GAME.state && GAME.state.editorPreview && owner.userData.logicRunInEditorPreview === false) return;
      const runtime = createRuntime(owner.userData.logicGraph, owner, 'element', owner.userData.editorName || 'Logic Element');
      if(runtime){
        state.runtimes.push(runtime);
        if(STORE && STORE.startLogicElementAnimations) STORE.startLogicElementAnimations(owner, true);
      }
    });
    state.runtimes.forEach(runtime => runtime.start());
    state.active = true;
  }

  function dispose(){
    state.runtimes.forEach(runtime => {
      runtime.triggerEvent('OnDestroy', {});
      runtime.stop();
      if(runtime.context && runtime.context.owner && STORE && STORE.stopLogicElementAnimations) STORE.stopLogicElementAnimations(runtime.context.owner);
    });
    state.runtimes = [];
    state.active = false;
    state.accumulator = 0;
    state.gamepadButtons.clear();
  }

  function pollGamepads(){
    if(typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads() || [];
    const live = new Set();
    Array.from(pads).forEach((pad, padIndex) => {
      if(!pad) return;
      (pad.buttons || []).forEach((button, buttonIndex) => {
        const key = padIndex + ':' + buttonIndex;
        live.add(key);
        const pressed = !!(button && button.pressed);
        const previous = state.gamepadButtons.get(key) === true;
        state.gamepadButtons.set(key, pressed);
        if(pressed && !previous) triggerRuntimeEvent('OnGamepadButton', {gamepadIndex:padIndex, button:buttonIndex, value:Number(button.value) || 0});
      });
    });
    Array.from(state.gamepadButtons.keys()).forEach(key => {
      if(!live.has(key)) state.gamepadButtons.delete(key);
    });
  }

  function update(dt){
    const running = !!(GAME && GAME.state && GAME.state.started && GAME.state.sceneReady !== false);
    if(!running){
      if(state.active) dispose();
      return;
    }
    if(!state.active) rebuild();
    pollGamepads();
    state.runtimes.forEach(runtime => runtime.update(dt));
    state.accumulator += dt;
    const fixed = 1 / 60;
    while(state.accumulator >= fixed){
      state.runtimes.forEach(runtime => runtime.fixedUpdate(fixed));
      state.accumulator -= fixed;
    }
  }

  function trigger(eventName, payload){
    state.runtimes.forEach(runtime => runtime.triggerEvent('Custom', {eventName, payload}));
  }

  function triggerRuntimeEvent(type, payload){
    state.runtimes.forEach(runtime => {
      if(type === 'OnCollisionBegin' && runtime.context && runtime.context.owner){
        const owner = runtime.context.owner;
        let object = payload && payload.object;
        let belongsToOwner = object === owner;
        while(object && !belongsToOwner){
          object = object.parent;
          belongsToOwner = object === owner;
        }
        if(!belongsToOwner) return;
      }
      runtime.triggerEvent(type, payload || {});
    });
  }

  function stats(){
    return {
      active:state.active,
      runtimeCount:state.runtimes.length,
      accumulator:state.accumulator,
      pauseOnBreakpoints:state.pauseOnBreakpoints,
      runtimes:state.runtimes.map((runtime, index) => {
        const item = runtime && runtime.stats ? runtime.stats() : {};
        return Object.assign({index}, item);
      }),
    };
  }
  function setPauseOnBreakpoints(value){
    state.pauseOnBreakpoints = value === true;
    state.runtimes.forEach(runtime => {
      if(runtime && runtime.setPauseOnBreakpoint) runtime.setPauseOnBreakpoint(state.pauseOnBreakpoints);
    });
    return state.pauseOnBreakpoints;
  }
  function resumeBreakpoints(){
    let count = 0;
    state.runtimes.forEach(runtime => {
      if(runtime && runtime.resume && runtime.resume()) count++;
    });
    return count;
  }
  function stepBreakpoints(){
    let count = 0;
    state.runtimes.forEach(runtime => {
      if(runtime && runtime.step && runtime.step()) count++;
    });
    return count;
  }
  function clearProfilerTimeline(){
    let count = 0;
    state.runtimes.forEach(runtime => {
      if(runtime && runtime.clearTimeline){
        runtime.clearTimeline();
        count++;
      }
    });
    return count;
  }

  function installInputEvents(){
    if(state.inputInstalled || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    state.inputInstalled = true;
    window.addEventListener('keydown', e => triggerRuntimeEvent('OnKeyDown', {key:e.key}));
    window.addEventListener('keyup', e => triggerRuntimeEvent('OnKeyUp', {key:e.key}));
    window.addEventListener('pointerdown', e => triggerRuntimeEvent('OnPointerDown', {x:e.clientX, y:e.clientY, button:e.button}));
    window.addEventListener('pointermove', e => triggerRuntimeEvent('OnPointerMove', {x:e.clientX, y:e.clientY, deltaX:e.movementX || 0, deltaY:e.movementY || 0}));
    window.addEventListener('pointerup', e => triggerRuntimeEvent('OnPointerUp', {x:e.clientX, y:e.clientY, button:e.button}));
    window.addEventListener('resize', () => triggerRuntimeEvent('OnWindowResize', {width:window.innerWidth, height:window.innerHeight}));
    window.addEventListener('lk-logic-collision-begin', e => triggerRuntimeEvent('OnCollisionBegin', e && e.detail || {}));
  }

  function install(){
    if(!GAME || !GAME.hooks || !Array.isArray(GAME.hooks.frame)) return false;
    if(GAME.systems) GAME.systems.logic = api;
    GAME.hooks.frame.push(update);
    installInputEvents();
    return true;
  }

  const api = Object.freeze({install, rebuild, dispose, update, trigger, triggerRuntimeEvent, validate, registry, stats, setPauseOnBreakpoints, resumeBreakpoints, stepBreakpoints, clearProfilerTimeline});
  return api;
}

function boot(){
  const GAME = window.LOT_KING;
  const STORE = window.LK_STORE;
  if(!GAME || !STORE || !window.LK_LOGIC_RUNTIME || !window.LK_LOGIC_NODES_MVP) return;
  const runner = create(GAME, STORE);
  window.LK_LOGIC_ELEMENTS_RUNNER_INSTANCE = runner;
  runner.install();
}

window.LK_LOGIC_ELEMENTS_RUNNER = Object.freeze({create, boot});
if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
})();
