/* =========================================================
   LOT KING - Logic Element runtime runner
   Bridges saved scene graphs to the explicit gameplay/editor update stage.
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
    pawnDevices:new Map(),
    bindingValues:new Map(),
    objectSignature:'',
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
  function logicObjectSignature(){
    return logicObjects().map(owner => {
      const graph = owner.userData.logicGraph || {};
      return [owner.userData.editorId || owner.uuid, owner.userData.logicEnabled !== false ? 1 : 0, (graph.nodes || []).length, (graph.edges || []).length].join(':');
    }).sort().join('|');
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
      graph: normalized,
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
    state.runtimes.forEach(runtime => {
      const pawn = runtime.context && runtime.context.services && runtime.context.services.pawns && runtime.context.services.pawns.self();
      if(pawn && pawn.start) pawn.start();
      runtime.start();
    });
    state.objectSignature = logicObjectSignature();
    state.active = true;
  }

  function dispose(){
    state.runtimes.forEach(runtime => {
      runtime.triggerEvent('OnDestroy', {});
      runtime.stop();
      const pawn = runtime.context && runtime.context.services && runtime.context.services.pawns && runtime.context.services.pawns.self();
      if(pawn && pawn.kind === 'logic-element' && pawn.dispose) pawn.dispose();
      if(runtime.context && runtime.context.owner && STORE && STORE.stopLogicElementAnimations) STORE.stopLogicElementAnimations(runtime.context.owner);
    });
    state.runtimes = [];
    state.active = false;
    state.accumulator = 0;
    state.gamepadButtons.clear();
    state.pawnDevices.clear();
    state.bindingValues.clear();
    state.objectSignature = '';
  }

  function applyPawnBindings(runtime){
    const pawn = runtime && runtime.context && runtime.context.services && runtime.context.services.pawns && runtime.context.services.pawns.self();
    if(!pawn || pawn.kind !== 'logic-element') return;
    const variables = runtime.graph && runtime.graph.variables || [];
    let previous = state.bindingValues.get(runtime);
    if(!previous){ previous = new Map(); state.bindingValues.set(runtime, previous); }
    let tuningBindingChanged = false;
    variables.forEach(variable => {
      const path = variable && variable.exposed && String(variable.binding || '').trim();
      if(!path) return;
      const value = runtime.variables.get(variable.name);
      let signature; try { signature = JSON.stringify(value); } catch(err){ signature = String(value); }
      if(previous.get(path) === signature) return;
      previous.set(path, signature);
      if(path === 'enabled') pawn.setEnabled(value !== false);
      else if(path === 'hidden') pawn.setHidden(value === true);
      else if(path === 'playerId') value == null || Number(value) < 1 ? pawn.unpossess() : pawn.possess(Number(value), false);
      // Non-vehicle Pawn kinds (soccer, human...) own their binding dispatch.
      else if(typeof pawn.applyBinding === 'function' && pawn.applyBinding(path, value)) return;
      else if(path.indexOf('tuning.') === 0){ pawn.setTuning({[path.slice(7)]:value}); tuningBindingChanged = true; }
      else if(path.indexOf('suspension.') === 0) pawn.setSuspension({[path.slice(11)]:value});
      else if(path.indexOf('collision.') === 0 && pawn.setCollision) pawn.setCollision({[path.slice(10)]:value});
      else if(path.indexOf('camera.') === 0) pawn.setCamera({[path.slice(7)]:value});
      else if(path.indexOf('effects.') === 0) pawn.setEffects({[path.slice(8)]:value});
      else if(path.indexOf('lights.') === 0){
        const keys = path.slice(7).split('.');
        const patch = {}; let cursor = patch;
        keys.forEach((key, index) => { if(index === keys.length - 1) cursor[key] = value; else cursor = cursor[key] = {}; });
        pawn.setLights(patch);
      }
      else if(path.indexOf('engineAudio.') === 0) pawn.setEngineAudio({[path.slice(12)]:value});
      else if(path === 'dataWidgets.enabled') pawn.setDataWidgets({enabled:value !== false});
    });
    // driveSetup is the authoritative per-instance handling profile. Older graphs
    // may still expose low-level tuning bindings; reapply the owned setup after
    // those migration bindings so native/copied values cannot take control back.
    if(tuningBindingChanged && pawn.config.driveSetup && pawn.setDriveSetup) pawn.setDriveSetup(pawn.config.driveSetup);
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

  function pollPawnDevices(){
    if(!GAME || !GAME.input || !GAME.input.describe) return;
    const snapshot = GAME.input.describe();
    const players = snapshot && snapshot.players || [];
    for(let index = 0; index < 4; index++){
      const info = players[index] || {};
      const signature = String(info.deviceId || info.deviceKey || info.deviceLabel || info.device || 'none');
      const previous = state.pawnDevices.get(index);
      state.pawnDevices.set(index, signature);
      if(previous == null || previous === signature) continue;
      const pawn = GAME.pawns && GAME.pawns.getByPlayerId ? GAME.pawns.getByPlayerId(index + 1) : null;
      triggerRuntimeEvent('OnPawnDeviceChanged', {pawn, playerId:index + 1, device:signature, previousDevice:previous});
    }
  }

  function update(dt){
    const running = !!(GAME && GAME.state && GAME.state.started && GAME.state.sceneReady !== false);
    if(!running){
      if(state.active) dispose();
      return;
    }
    if(!state.active) rebuild();
    else if(state.objectSignature !== logicObjectSignature()) rebuild();
    pollGamepads();
    pollPawnDevices();
    state.runtimes.forEach(applyPawnBindings);
    if(GAME && GAME.pawns && GAME.pawns.stepAll) GAME.pawns.stepAll(dt);
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
      if(/^OnPawn/.test(String(type || '')) && runtime.context && runtime.context.services && runtime.context.services.pawns){
        const self = runtime.context.services.pawns.self();
        if(self && payload && payload.pawn && payload.pawn !== self) return;
      }
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
    window.addEventListener('lk-pawn-event', e => {
      const detail = e && e.detail || {};
      if(detail.type) triggerRuntimeEvent(detail.type, detail);
    });
  }

  function install(){
    if(!GAME || !GAME.hooks || !Array.isArray(GAME.hooks.frame)) return false;
    if(GAME.systems) GAME.systems.logic = api;
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
