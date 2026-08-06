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
    actionStates:new Map(),
    preparedPawns:new Map(),
    prewarmEpoch:0,
    inputHandlers:[],
    objectSignature:'',
    objectSignatureAccumulator:0,
    objectSignatureChecks:0,
    ownerCache:[],
    ownerCacheSource:null,
    ownerCacheLength:-1,
    revisionSum:null,
    previewMode:null,
    pawnDeviceAccumulator:0,
    inputChangeUnsubscribe:null,
    inputChangeSource:null,
    pauseOnBreakpoints:false,
    preparedSignature:'',
  };

  function registry(){
    if(!state.registry && window.LK_LOGIC_NODES_MVP) state.registry = window.LK_LOGIC_NODES_MVP.createRegistry();
    return state.registry;
  }

  function invalidateOwnerCache(){ state.ownerCacheSource = null; state.ownerCacheLength = -1; }
  function logicObjects(){
    const registry = GAME && GAME.world && Array.isArray(GAME.world.registry) ? GAME.world.registry : null;
    if(!registry) return [];
    // Filtering the whole Open World registry is the expensive part, so the
    // matched owners are cached and only re-derived when the registry array
    // itself changes identity or length.
    if(state.ownerCacheSource === registry && state.ownerCacheLength === registry.length) return state.ownerCache;
    state.ownerCache = registry.filter(o => o && o.userData && o.userData.editorType === 'logicElement');
    state.ownerCacheSource = registry;
    state.ownerCacheLength = registry.length;
    return state.ownerCache;
  }
  /** O(number of Logic Elements) authoring check, safe to run every frame.
   *  It reads only the numbers the editor stamps when authoring data changes,
   *  with no string building, sorting or allocation, so a Pawn Studio save is
   *  consumed on the next frame while the full signature scan stays throttled. */
  function authoringRevisionSum(){
    const owners = logicObjects();
    let sum = owners.length;
    for(let index = 0; index < owners.length; index++){
      const data = owners[index].userData;
      const graph = data.logicGraph;
      sum += (graph && Number(graph.runtimeRevision) || Number(data.logicRevision) || 0)
        + (data.logicEnabled === false ? .5 : 0);
    }
    return sum;
  }
  function logicObjectSignature(){
    const mode=GAME&&GAME.state&&GAME.state.editorPreview?'editor-preview':'play';
    return mode+'|'+logicObjects().map(owner => {
      const graph = owner.userData.logicGraph || {};
      return [owner.userData.editorId || owner.uuid, owner.userData.logicEnabled !== false ? 1 : 0, graph.runtimeRevision||owner.userData.logicRevision||0, (graph.nodes || []).length, (graph.edges || []).length].join(':');
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
    const runtime = window.LK_LOGIC_RUNTIME.create(normalized, reg, context, {pauseOnBreakpoint:state.pauseOnBreakpoints});
    // createPawnService has already copied every exposed binding into the Pawn
    // descriptor. Seed the change detector with those values so frame one does
    // not replay spawn/collider bindings and rebuild/reset a freshly prewarmed
    // body several times. Values changed by OnStart still differ on update one.
    const initialBindings = new Map();
    (normalized.variables || []).forEach(variable => {
      const path = variable && variable.exposed && String(variable.binding || '').trim();
      if(!path) return;
      const value = runtime.variables.get(variable.name);
      initialBindings.set(path, bindingSignature(value));
    });
    state.bindingValues.set(runtime, initialBindings);
    return runtime;
  }

  function runtimePawn(runtime){
    return runtime && runtime.context && runtime.context.services && runtime.context.services.pawns
      ? runtime.context.services.pawns.self()
      : null;
  }
  function disposeLogicPawn(pawn){
    if(!pawn || pawn.kind !== 'logic-element' || pawn.disposed || typeof pawn.dispose !== 'function') return false;
    return pawn.dispose() !== false;
  }
  function disposePreparedPawns(keep){
    const retained = keep || new Set();
    state.preparedPawns.forEach(pawn => { if(!retained.has(pawn)) disposeLogicPawn(pawn); });
    state.preparedPawns.clear();
  }

  function rebuild(){
    dispose({preservePrepared:true});
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
      const pawn = runtimePawn(runtime);
      if(pawn && pawn.start) pawn.start();
      runtime.start();
    });
    // A prepared Pawn is adopted only when the rebuilt runtime resolves that
    // exact record. Invalid/removed graphs must not leave a Cannon body behind.
    const adoptedPawns = new Set(state.runtimes.map(runtimePawn).filter(Boolean));
    disposePreparedPawns(adoptedPawns);
    state.objectSignature = logicObjectSignature();
    state.revisionSum = authoringRevisionSum();
    state.previewMode = !!(GAME && GAME.state && GAME.state.editorPreview);
    state.objectSignatureAccumulator = 0;
    state.objectSignatureChecks++;
    if(state.inputChangeUnsubscribe) pollPawnDevices();
    state.active = true;
  }

  async function prewarm(context){
    const epoch = ++state.prewarmEpoch;
    const results = [];
    const owners = logicObjects();
    const liveOwners = new Set(owners);
    state.preparedPawns.forEach((pawn, owner) => {
      if(liveOwners.has(owner)) return;
      disposeLogicPawn(pawn);
      state.preparedPawns.delete(owner);
    });
    for(const owner of owners){
      if(owner.userData.logicEnabled === false) continue;
      if(GAME.state && GAME.state.editorPreview && owner.userData.logicRunInEditorPreview === false) continue;
      const graph = window.LK_LOGIC_GRAPH.normalizeGraph(
        owner.userData.logicGraph,
        owner.userData.editorName || 'Logic Element',
        'element'
      );
      const checked = validate(graph);
      if(!checked.ok) continue;
      // Creating a service context materialises the Pawn but does not start the
      // graph or dispatch OnStart, so authored logic remains strictly play-only.
      const runtimeContext = window.LK_LOGIC_SERVICES.createContext({
        GAME,
        STORE,
        THREE:window.THREE,
        owner,
        scope:'element',
        graphName:graph.name || owner.userData.editorName || 'Logic Element',
        graph,
      });
      const pawn = runtimeContext && runtimeContext.services && runtimeContext.services.pawns
        ? runtimeContext.services.pawns.self()
        : null;
      if(!pawn || typeof pawn.prepareRuntime !== 'function') continue;
      state.preparedPawns.set(owner, pawn);
      if(context && context.progress){
        context.progress(.61, 'Preparing Logic Pawn resources',
          (owner.userData.editorName || owner.name || 'Logic Element') + ' · physics, vehicle rig and widgets');
      }
      results.push(await Promise.resolve(pawn.prepareRuntime(context || {})));
      // The global Pawn inventory runs immediately after this pass. Publish
      // which adopted records are already ready so it can cover native/plugin
      // Pawns without doing the same expensive GLB/physics work twice.
      if(context){const prepared=context.preparedPawns||(context.preparedPawns=new Set());prepared.add(pawn);}
      if(context && context.render) context.render();
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    if(epoch === state.prewarmEpoch) state.preparedSignature = logicObjectSignature();
    return results;
  }

  function dispose(options){
    options = options || {};
    state.prewarmEpoch++;
    state.runtimes.forEach(runtime => {
      runtime.triggerEvent('OnDestroy', {});
      runtime.stop();
      if(runtime.context && runtime.context.services && runtime.context.services.ui) runtime.context.services.ui.dispose();
      const pawn = runtimePawn(runtime);
      disposeLogicPawn(pawn);
      if(runtime.context && runtime.context.owner && STORE && STORE.stopLogicElementAnimations) STORE.stopLogicElementAnimations(runtime.context.owner);
    });
    state.runtimes = [];
    state.active = false;
    state.accumulator = 0;
    state.gamepadButtons.clear();
    state.pawnDevices.clear();
    state.bindingValues.clear();
    state.actionStates.clear();
    if(options.preservePrepared !== true) disposePreparedPawns();
    state.objectSignature = '';
    state.objectSignatureAccumulator = 0;
    state.revisionSum = null;
    state.previewMode = null;
    invalidateOwnerCache();
    state.preparedSignature = '';
  }

  function bindingSignature(value){
    // Most exposed bindings are primitives. Preserve them directly instead of
    // allocating an equivalent JSON string for every variable on every frame.
    if(value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'undefined') return value;
    try { return JSON.stringify(value); }
    catch(err){ return String(value); }
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
      const signature = bindingSignature(value);
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
      else if(path.indexOf('radio.') === 0 && pawn.setRadio) pawn.setRadio({[path.slice(6)]:value});
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

  function syncPawnDevices(snapshot){
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
  function pollPawnDevices(){
    if(!GAME || !GAME.input || !GAME.input.describe) return false;
    syncPawnDevices(GAME.input.describe());
    return true;
  }
  function uninstallPawnDeviceEvents(){
    if(typeof state.inputChangeUnsubscribe === 'function') state.inputChangeUnsubscribe();
    state.inputChangeUnsubscribe=null;
    state.inputChangeSource=null;
    state.pawnDeviceAccumulator=0;
  }
  function installPawnDeviceEvents(){
    const input=GAME&&GAME.input;
    if(!input||typeof input.onChange!=='function')return false;
    if(state.inputChangeSource===input&&state.inputChangeUnsubscribe)return true;
    uninstallPawnDeviceEvents();
    pollPawnDevices();
    const unsubscribe=input.onChange(syncPawnDevices);
    state.inputChangeUnsubscribe=typeof unsubscribe==='function'?unsubscribe:function(){};
    state.inputChangeSource=input;
    return true;
  }

  function actionHeld(value){
    return value===true||(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)>.5);
  }
  function actionValues(drive){
    const values={};
    Object.keys(drive||{}).forEach(action=>{
      const value=drive[action];
      if(typeof value==='boolean'||typeof value==='number')values[action]=value;
    });
    return values;
  }
  function dispatchActionEdges(runtime,sourceKey,snapshot,downEvent,upEvent,legacy){
    let sources=state.actionStates.get(runtime);
    if(!sources){sources=new Map();state.actionStates.set(runtime,sources);}
    const current={pawn:snapshot.pawn,playerId:snapshot.playerId,contextId:snapshot.contextId||null,values:actionValues(snapshot.drive)};
    const previous=sources.get(sourceKey);
    sources.set(sourceKey,current);
    // Starting a runtime or transferring ownership while a button is held must
    // not manufacture a fresh press in the new graph/Pawn.
    if(!previous||previous.pawn!==current.pawn||previous.playerId!==current.playerId||previous.contextId!==current.contextId)return;
    const actions=new Set(Object.keys(previous.values).concat(Object.keys(current.values)));
    actions.forEach(action=>{
      const wasHeld=actionHeld(previous.values[action]),isHeld=actionHeld(current.values[action]);
      if(wasHeld===isHeld)return;
      const payload={action,value:current.values[action],playerId:current.playerId,pawn:current.pawn,contextId:current.contextId,semantic:true};
      runtime.triggerEvent(isHeld?downEvent:upEvent,payload);
      // Saved Pawn graphs authored before semantic actions retain their intent,
      // but their physical key label is adapted inside Logic Runtime. They no
      // longer receive the DOM event or bypass remapping/possession.
      if(legacy)runtime.triggerEvent(isHeld?'OnKeyDown':'OnKeyUp',Object.assign({key:action},payload));
    });
  }
  function hasExplicitPlayerActions(runtime){
    const nodes=runtime&&runtime.graph&&runtime.graph.nodes||[];
    return nodes.some(node=>node&&/^event\.onPlayerInputAction(?:Down|Up)$/.test(String(node.type||'')));
  }
  function pollSemanticActions(){
    const router=GAME&&GAME.systems&&GAME.systems.playerActionRouter;
    state.runtimes.forEach(runtime=>{
      const activeSources=new Set();
      const input=runtime&&runtime.context&&runtime.context.services&&runtime.context.services.input;
      const selfSnapshot=input&&typeof input.actionSnapshot==='function'?input.actionSnapshot():null;
      if(selfSnapshot){
        activeSources.add('self');
        dispatchActionEdges(runtime,'self',selfSnapshot,'OnInputActionDown','OnInputActionUp',true);
      }
      if(router&&typeof router.read==='function'&&hasExplicitPlayerActions(runtime)){
        // Polling four bounded local slots preserves Player ID pins connected
        // through variables/edges; Logic Runtime performs the dynamic pin
        // comparison when each semantic edge arrives.
        for(let id=1;id<=4;id++){
          const snapshot=router.read(id);
          if(!snapshot||!snapshot.pawn||!snapshot.drive)continue;
          const key='player:'+id;
          activeSources.add(key);
          dispatchActionEdges(runtime,key,snapshot,'OnPlayerInputActionDown','OnPlayerInputActionUp',false);
        }
      }
      const sources=state.actionStates.get(runtime);
      if(sources){
        Array.from(sources.keys()).forEach(key=>{if(!activeSources.has(key))sources.delete(key);});
        if(!sources.size)state.actionStates.delete(runtime);
      }
    });
  }

  function update(dt){
    const running = !!(GAME && GAME.state && GAME.state.started && GAME.state.sceneReady !== false);
    if(!running){
      if(state.active) dispose();
      return;
    }
    if(!state.active) rebuild();
    else {
      // Authoring changes must reach Play on the next frame, but the full
      // signature (filter + join + sort over the Open World registry) is far
      // too expensive at render frequency. The cheap revision sum runs every
      // frame and the full scan is a 4 Hz fallback for changes that alter the
      // element set without touching a revision number.
      const revisions = authoringRevisionSum();
      // Entering or leaving editor Play Preview is a mode transition, not an
      // authoring edit, and must also be picked up on the very next frame.
      const previewMode = !!(GAME.state && GAME.state.editorPreview);
      state.objectSignatureAccumulator += Math.max(0, Number(dt) || 0);
      const due = state.objectSignatureAccumulator >= .25;
      if(state.revisionSum !== revisions || state.previewMode !== previewMode || due){
        state.previewMode = previewMode;
        if(due){
          state.objectSignatureAccumulator %= .25;
          // One element swapped for another leaves the registry length intact,
          // so the fallback tick re-derives the owner list from scratch.
          invalidateOwnerCache();
        }
        state.revisionSum = revisions;
        const signature = logicObjectSignature();
        state.objectSignatureChecks++;
        if(state.objectSignature !== signature) rebuild();
      }
    }
    pollGamepads();
    if(state.inputChangeSource!==GAME.input){
      uninstallPawnDeviceEvents();
      installPawnDeviceEvents();
    }
    if(!state.inputChangeUnsubscribe){
      state.pawnDeviceAccumulator += Math.max(0, Number(dt) || 0);
      if(state.pawnDeviceAccumulator >= .5){state.pawnDeviceAccumulator=0;pollPawnDevices();installPawnDeviceEvents();}
    }
    state.runtimes.forEach(applyPawnBindings);
    pollSemanticActions();
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
      if((type==='OnKeyDown'||type==='OnKeyUp')&&runtimePawn(runtime))return;
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

  function triggerLegacyKeyEvent(type,payload){
    state.runtimes.forEach(runtime=>{
      // Literal DOM input is retained only for explicitly legacy non-Pawn
      // graphs. Every Pawn graph is fed by pollSemanticActions above.
      if(runtimePawn(runtime))return;
      runtime.triggerEvent(type,payload||{});
    });
  }

  function stats(){
    return {
      active:state.active,
      runtimeCount:state.runtimes.length,
      preparedPawnCount:state.preparedPawns.size,
      accumulator:state.accumulator,
      pauseOnBreakpoints:state.pauseOnBreakpoints,
      objectSignatureChecks:state.objectSignatureChecks,
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
    const listen = (type, handler) => { window.addEventListener(type, handler); state.inputHandlers.push([type, handler]); };
    listen('keydown', e => triggerLegacyKeyEvent('OnKeyDown', {key:e.key,legacy:true}));
    listen('keyup', e => triggerLegacyKeyEvent('OnKeyUp', {key:e.key,legacy:true}));
    listen('pointerdown', e => triggerRuntimeEvent('OnPointerDown', {x:e.clientX, y:e.clientY, button:e.button}));
    listen('pointermove', e => triggerRuntimeEvent('OnPointerMove', {x:e.clientX, y:e.clientY, deltaX:e.movementX || 0, deltaY:e.movementY || 0}));
    listen('pointerup', e => triggerRuntimeEvent('OnPointerUp', {x:e.clientX, y:e.clientY, button:e.button}));
    listen('resize', () => triggerRuntimeEvent('OnWindowResize', {width:window.innerWidth, height:window.innerHeight}));
    listen('lk-logic-collision-begin', e => triggerRuntimeEvent('OnCollisionBegin', e && e.detail || {}));
    listen('lk-pawn-event', e => {
      const detail = e && e.detail || {};
      if(detail.type) triggerRuntimeEvent(detail.type, detail);
    });
    listen('lotking:p2p-message',e=>{
      const detail=e&&e.detail||{};
      if(detail.type!=='logic.event')return;
      const message=detail.payload||{};
      triggerRuntimeEvent('OnNetworkMessage',{channel:String(message.channel||''),payload:message.payload,peerId:detail.peerId||'',peerName:detail.peerName||''});
    });
    listen('lotking:ui-action',e=>{
      const detail=e&&e.detail||{};
      state.runtimes.forEach(runtime=>{
        const ui=runtime&&runtime.context&&runtime.context.services&&runtime.context.services.ui;
        if(!ui||String(ui.ownerId)!==String(detail.ownerId||''))return;
        runtime.triggerEvent('OnUiAction',detail);
      });
    });
  }
  function uninstallInputEvents(){
    if(typeof window !== 'undefined' && typeof window.removeEventListener === 'function'){
      state.inputHandlers.forEach(entry => window.removeEventListener(entry[0], entry[1]));
    }
    state.inputHandlers=[];
    state.inputInstalled=false;
  }

  function install(){
    if(!GAME || !GAME.hooks || !Array.isArray(GAME.hooks.frame)) return false;
    if(GAME.systems) GAME.systems.logic = api;
    installInputEvents();
    installPawnDeviceEvents();
    return true;
  }
  function destroy(){
    dispose();
    uninstallInputEvents();
    uninstallPawnDeviceEvents();
    if(GAME && GAME.systems && GAME.systems.logic === api) GAME.systems.logic = null;
    return true;
  }

  const api = Object.freeze({install, rebuild, prewarm, dispose, destroy, update, trigger, triggerRuntimeEvent, validate, registry, stats, setPauseOnBreakpoints, resumeBreakpoints, stepBreakpoints, clearProfilerTimeline});
  return api;
}

function boot(){
  const GAME = window.LOT_KING;
  const STORE = window.LK_STORE;
  if(!GAME || !STORE || !window.LK_LOGIC_RUNTIME || !window.LK_LOGIC_NODES_MVP) return;
  const previous = window.LK_LOGIC_ELEMENTS_RUNNER_INSTANCE;
  if(previous && typeof previous.destroy === 'function') previous.destroy();
  else if(previous && typeof previous.dispose === 'function') previous.dispose();
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
