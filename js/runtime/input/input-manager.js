/* =========================================================
   LOT KING — INPUT MANAGER
   Resolves the active input config (context-aware, instance-aware)
   plus connected hardware into a per-player drive command.
     · physical sources: keyboard (1), gamepads (by pad index), touch (1)
     · device instances: keyboard-1/2, gamepad-1/2, touch-1 (from config)
     · players: each mapped to a device instance
   Project config comes from meta.input; the in-game override (remaps,
   assignments) layers on top and persists to localStorage. In the editor
   the override is ignored so authoring reflects the pure project.
   Exposed to the game as GAME.input.
   ========================================================= */
(function(){
'use strict';

const OVERRIDE_KEY = 'lotking.inputOverride.v2';

function create(deps){
  deps = deps || {};
  const ACT = window.LK_RUNTIME_INPUT_ACTIONS;
  const DEV = window.LK_RUNTIME_INPUT_DEVICES;
  if(!ACT || !DEV) return null;

  const keyboard = DEV.createKeyboardSource();
  const touch = DEV.createTouchSource();
  const gamepads = new Map();            // pad index -> gamepad source
  const listeners = new Set();

  let projectConfig = ACT.defaultConfig();
  let userOverride = loadOverride();
  let overrideEnabled = true;
  let config = ACT.mergeConfig(projectConfig, userOverride);
  let enabled = true;
  let touchOn = false;                    // is the on-screen touch UI currently shown
  let portrait = false;                   // is the rendered game frame portrait
  const PHONE = detectPhone();
  let assignments = [];                  // player index -> device instance id
  const manualAssign = {};               // player index -> forced instance id
  let activeDeviceId = null;             // last device Player 1 actually used (auto-assign)

  // ------------------------------------------------ persistence
  function loadOverride(){
    try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || 'null'); } catch(err){ return null; }
  }
  function saveOverride(){
    try { localStorage.setItem(OVERRIDE_KEY, JSON.stringify(userOverride || {})); } catch(err){}
  }
  function snapshotOverride(){
    // capture the parts the player can change (allowedDevices stays project-owned)
    userOverride = {
      touchMode: config.touchMode,
      autoAssign: config.autoAssign,
      activeContext: config.activeContext,
      devices: ACT.clone(config.devices),
      players: ACT.clone(config.players),
      contexts: ACT.clone(config.contexts),
      overrides: ACT.clone(config.overrides),
    };
    saveOverride();
  }
  function recompute(){
    config = overrideEnabled ? ACT.mergeConfig(projectConfig, userOverride) : ACT.normalizeConfig(projectConfig);
    return config;
  }

  // ------------------------------------------------ touch visibility
  function detectPhone(){
    const ua = (navigator.userAgent || '');
    if(/Mobi|Android|iPhone|iPod|Windows Phone|IEMobile/i.test(ua)) return true;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return !!(coarse && (navigator.maxTouchPoints || 0) > 0 && Math.min(window.innerWidth, window.innerHeight) < 820);
  }
  function computeTouchOn(){
    if(!allowed('touch')) return false;
    const mode = config.touchMode || 'auto';
    if(mode === 'on') return true;
    if(mode === 'off') return false;
    return PHONE || portrait;          // auto: phones always, others when portrait
  }
  function recomputeTouch(){
    const next = computeTouchOn();
    if(next === touchOn) return false;
    touchOn = next;
    if(!touchOn) touch.clear();
    return true;
  }

  // ------------------------------------------------ physical sources / instances
  function allowed(type){ return !!(config.allowedDevices && config.allowedDevices[type]); }

  // physically-connected pads in a stable order (by pad index). Gamepad
  // instances map to these in order, so "Gamepad 1" is the first connected
  // controller whatever raw index the browser assigned it.
  function connectedPads(){
    const list = [];
    gamepads.forEach(gp => { if(gp.connected()) list.push(gp); });
    list.sort((a, b) => a.index - b.index);
    return list;
  }
  function sourceForInstance(inst){
    if(!inst) return null;
    if(inst.type === 'keyboard') return keyboard;
    if(inst.type === 'touch') return touch;
    if(inst.type === 'gamepad') return connectedPads()[(inst.slot || 1) - 1] || null;
    return null;
  }
  function instanceConnected(inst){
    if(!inst || !allowed(inst.type)) return false;
    if(inst.type === 'keyboard') return true;
    if(inst.type === 'touch') return touchOn;
    const src = sourceForInstance(inst);
    return !!(src && src.connected());
  }
  // instances usable right now (allowed + physically present)
  function availableInstances(){
    return config.devices.filter(instanceConnected);
  }

  function syncGamepads(){
    let changed = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for(let i = 0; i < pads.length; i++){
      if(pads[i]){
        if(!gamepads.has(i)){ gamepads.set(i, DEV.createGamepadSource(i)); changed = true; }
        gamepads.get(i).poll();
      } else if(gamepads.has(i)){
        gamepads.delete(i);
        changed = true;
      }
    }
    return changed;
  }

  // ------------------------------------------------ assignment
  function playerCount(){ return Math.max(1, (config.players && config.players.length) || 1); }

  function resolveAssignments(){
    const avail = availableInstances();
    const taken = new Set();
    const next = [];
    for(let i = 0; i < playerCount(); i++){
      // Player 1 follows the last-used device when auto-assign is on; otherwise
      // (and for other players) the manual pin, then the configured default.
      const wantId = (i === 0 && config.autoAssign && activeDeviceId)
        ? activeDeviceId
        : (manualAssign[i] || (config.players[i] && config.players[i].device) || 'keyboard-1');
      let chosen = avail.find(d => d.id === wantId && !taken.has(d.id)) || null;
      if(!chosen){
        const wantType = (ACT.deviceInstance(config, wantId) || {}).type;
        chosen = avail.find(d => d.type === wantType && !taken.has(d.id)) || avail.find(d => !taken.has(d.id)) || null;
      }
      if(chosen) taken.add(chosen.id);
      next[i] = chosen ? chosen.id : null;
    }
    const changed = next.length !== assignments.length || next.some((id, i) => id !== assignments[i]);
    assignments = next;
    return changed;
  }

  // is this device currently producing meaningful driving input?
  function deviceActive(inst){
    const src = sourceForInstance(inst);
    if(!inst || !src) return false;
    const scheme = ACT.effectiveScheme(config, config.activeContext, inst.type, inst.id);
    let d;
    if(inst.type === 'keyboard') d = ACT.resolveKeyboard(scheme, src);
    else if(inst.type === 'gamepad') d = ACT.resolveGamepad(scheme, src);
    else if(inst.type === 'touch') d = ACT.resolveTouch(src);
    else return false;
    return Math.abs(d.steer) > 0.4 || d.throttle > 0.4 || d.brake > 0.4 || d.handbrake || d.reset;
  }
  function pinnedToOtherPlayer(deviceId){
    for(const k in manualAssign) if(Number(k) !== 0 && manualAssign[k] === deviceId) return true;
    return false;
  }

  function emitChange(){
    const snap = describe();
    listeners.forEach(fn => { try { fn(snap); } catch(err){} });
  }
  function update(){
    const padsChanged = syncGamepads();
    let autoChanged = false;
    if(config.autoAssign){
      // switch Player 1 to whatever device is actively being used right now
      for(const inst of availableInstances()){
        if(inst.id !== activeDeviceId && !pinnedToOtherPlayer(inst.id) && deviceActive(inst)){
          activeDeviceId = inst.id;
          autoChanged = true;
          break;
        }
      }
    }
    const assignChanged = resolveAssignments();
    if(padsChanged || assignChanged || autoChanged) emitChange();
  }

  // ------------------------------------------------ drive read
  function driveFor(playerIndex){
    if(!enabled) return ACT.neutralDrive();
    let out = ACT.neutralDrive();
    const inst = ACT.deviceInstance(config, assignments[playerIndex]);
    const src = sourceForInstance(inst);
    if(inst && src){
      const scheme = ACT.effectiveScheme(config, config.activeContext, inst.type, inst.id);
      if(inst.type === 'keyboard') out = ACT.resolveKeyboard(scheme, src);
      else if(inst.type === 'gamepad') out = ACT.resolveGamepad(scheme, src);
      else if(inst.type === 'touch') out = ACT.resolveTouch(src);
    }
    // the on-screen touch UI always drives Player 1 while enabled, on top of its
    // assigned device (so mobile / the desktop toggle just work without reassigning)
    if(playerIndex === 0 && touchOn && allowed('touch') && (!inst || inst.type !== 'touch')){
      out = ACT.mergeDrive(out, ACT.resolveTouch(touch));
    }
    return out;
  }

  const playerViews = [];
  function player(i){
    i = i | 0;
    if(!playerViews[i]) playerViews[i] = Object.freeze({
      index: i,
      drive: () => driveFor(i),
      device: () => assignments[i] || null,
      deviceType: () => { const inst = ACT.deviceInstance(config, assignments[i]); return inst ? inst.type : null; },
    });
    return playerViews[i];
  }

  // ------------------------------------------------ config / control
  function setConfig(raw){
    projectConfig = ACT.normalizeConfig(raw);
    recompute();
    recomputeTouch();
    update();
    emitChange();
  }
  function setOverrideEnabled(v){ overrideEnabled = !!v; recompute(); recomputeTouch(); update(); emitChange(); }
  function setEnabled(v){ enabled = !!v; if(!enabled){ keyboard.clear(); touch.clear(); } }

  // called by the renderer when the game-frame orientation changes
  function setPortrait(p){
    p = !!p;
    if(p === portrait) return;
    portrait = p;
    if(recomputeTouch()){ resolveAssignments(); emitChange(); }
  }
  function setTouchMode(mode){
    if(['auto', 'on', 'off'].indexOf(mode) < 0) return;
    config.touchMode = mode;
    if(overrideEnabled) snapshotOverride();
    recomputeTouch();
    resolveAssignments();
    emitChange();
  }
  function setTouchEnabled(v){ setTouchMode(v ? 'on' : 'off'); return touchOn; }   // back-compat toggle
  function isTouchEnabled(){ return touchOn; }
  function isTouchAllowed(){ return allowed('touch'); }
  function isPhone(){ return PHONE; }

  function setActiveContext(id){
    if(!config.contexts[id]) return;
    config.activeContext = id;
    if(overrideEnabled) snapshotOverride();
    emitChange();
  }

  function assignPlayerDevice(playerIndex, deviceId){
    if(deviceId) manualAssign[playerIndex] = deviceId;
    else delete manualAssign[playerIndex];
    if(config.players[playerIndex] && deviceId) config.players[playerIndex].device = deviceId;
    if(playerIndex === 0) activeDeviceId = deviceId || null;   // manual pick also updates the auto pointer
    if(overrideEnabled) snapshotOverride();
    resolveAssignments();
    emitChange();
  }
  function setAutoAssign(v){
    config.autoAssign = !!v;
    if(overrideEnabled) snapshotOverride();
    resolveAssignments();
    emitChange();
  }

  // remap a single action for a device instance in the active context
  function remap(deviceId, action, binding){
    ACT.setBinding(config, config.activeContext, deviceId, action, binding);
    if(overrideEnabled) snapshotOverride();
    emitChange();
  }
  function addInstance(type){
    const inst = ACT.addDeviceInstance(config, type);
    if(inst && overrideEnabled) snapshotOverride();
    resolveAssignments();
    emitChange();
    return inst;
  }
  function removeInstance(deviceId){
    const ok = ACT.removeDeviceInstance(config, deviceId);
    if(ok){ delete manualAssign_forDevice(deviceId); if(overrideEnabled) snapshotOverride(); resolveAssignments(); emitChange(); }
    return ok;
  }
  function manualAssign_forDevice(deviceId){
    for(const k in manualAssign) if(manualAssign[k] === deviceId) delete manualAssign[k];
  }
  function resetOverride(){
    userOverride = null;
    try { localStorage.removeItem(OVERRIDE_KEY); } catch(err){}
    recompute();
    recomputeTouch();
    resolveAssignments();
    emitChange();
  }

  // ------------------------------------------------ introspection (for menus / mapping overlay)
  function describe(){
    const instLabel = id => ACT.deviceLabel(ACT.deviceInstance(config, id));
    return {
      config: ACT.clone(config),
      activeContext: config.activeContext,
      contexts: Object.keys(config.contexts).map(id => ({id, label: config.contexts[id].label})),
      allowedDevices: Object.assign({}, config.allowedDevices),
      autoAssign: config.autoAssign,
      touchEnabled: touchOn,
      touchMode: config.touchMode,
      isPhone: PHONE,
      portrait,
      players: assignments.map((id, i) => ({
        index: i,
        playerId: (config.players[i] && config.players[i].id) || ('player-' + (i + 1)),
        deviceId: id,
        deviceLabel: id ? instLabel(id) : null,
        deviceType: (ACT.deviceInstance(config, id) || {}).type || null,
      })),
      devices: config.devices.map(d => {
        const src = sourceForInstance(d);
        return {
          id: d.id, type: d.type, slot: d.slot,
          label: ACT.deviceLabel(d),
          connected: instanceConnected(d),
          hwLabel: src && src.label ? src.label() : null,
        };
      }),
    };
  }
  function onChange(fn){ if(typeof fn !== 'function') return () => {}; listeners.add(fn); return () => listeners.delete(fn); }

  // live raw read for the mapping overlay's "press to bind" + input highlight
  function liveKeyboardDown(code){ return keyboard.isCodeDown(code); }
  function liveGamepad(slotIndex){ return connectedPads()[slotIndex || 0] || null; }

  window.addEventListener('gamepadconnected', update);
  window.addEventListener('gamepaddisconnected', update);
  update();

  return {
    // driving
    player, update, setEnabled,
    // config
    setConfig, getConfig: () => ACT.clone(config), setOverrideEnabled,
    setActiveContext,
    // devices / assignment
    describe, onChange, assignPlayerDevice, setAutoAssign, addInstance, removeInstance,
    // touch
    setTouchEnabled, setTouchMode, isTouchEnabled, isTouchAllowed, isPhone, setPortrait, touchSource: touch,
    // mapping
    remap, resetOverride, liveKeyboardDown, liveGamepad,
  };
}

window.LK_RUNTIME_INPUT_MANAGER = Object.freeze({create});
})();
