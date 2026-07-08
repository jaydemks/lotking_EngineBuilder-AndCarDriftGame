/* =========================================================
   LOT KING — INPUT ACTIONS (schema + resolution)
   Pure, DOM-free layer. Context-aware, instance-aware input model
   inspired by Unreal's Input Mapping Contexts:

     · CONTEXT   a named action set for a pawn kind ("vehicle" now,
                 "aircraft"/… later). Holds the base binding scheme
                 per device type.
     · DEVICE    a numbered instance (keyboard-1/2, gamepad-1/2, touch-1).
                 keyboard & gamepad can be split into several instances
                 with their own bindings; touch is single-instance.
     · OVERRIDE  a per-instance scheme override (how "split" works):
                 instance #2 can rebind actions away from the base scheme.
     · PLAYER    a slot mapped to a device instance.

   Binding resolution turns the *effective* scheme for a player's device
   into a normalized command {steer, throttle, brake, handbrake, reset, ...}.
   ========================================================= */
(function(){
'use strict';

const CONFIG_VERSION = 3;
const DEVICE_TYPES = ['keyboard', 'gamepad', 'touch'];
const SINGLE_INSTANCE = {touch: true};   // types that cannot be split

const KEYBOARD_ACTIONS = [
  'throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake', 'reset',
  'pauseMenu', 'highBeams', 'radioToggle', 'radioPlay', 'radioNext', 'radioPrev',
  'cameraMode', 'lookBack', 'tuningMenu', 'mute', 'legend',
];
const GAMEPAD_ACTIONS = [
  'steer', 'throttle', 'brake', 'handbrake', 'reset',
  'pauseMenu', 'highBeams', 'radioToggle', 'radioPlay', 'radioNext', 'radioPrev',
  'cameraMode', 'lookBack', 'tuningMenu', 'mute', 'legend',
  'cameraLookX', 'cameraLookY',
];

function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function clampAxis(v){ return clamp(v, -1, 1); }
function clamp01(v){ return clamp(v, 0, 1); }

// ------------------------------------------------ defaults
function defaultKeyboardScheme(){
  return {
    throttle:   ['KeyW', 'ArrowUp'],
    brake:      ['KeyS', 'ArrowDown'],
    steerLeft:  ['KeyA', 'ArrowLeft'],
    steerRight: ['KeyD', 'ArrowRight'],
    handbrake:  ['Space'],
    reset:      ['KeyR'],
    pauseMenu:  ['Escape'],
    highBeams:  ['KeyF'],
    radioToggle:['Tab'],
    radioPlay:  ['KeyP'],
    radioNext:  ['KeyN'],
    radioPrev:  ['KeyB'],
    cameraMode: ['KeyC'],
    lookBack:   ['KeyV'],
    tuningMenu: ['KeyU'],
    mute:       ['KeyM'],
    legend:     ['KeyH'],
  };
}
function defaultGamepadScheme(){
  return {
    steer:     {type: 'axis',   index: 0, scale: -1, deadzone: 0.18},
    throttle:  {type: 'button', index: 7},
    brake:     {type: 'button', index: 6},
    handbrake: {type: 'button', index: 0},
    reset:     {type: 'button', index: 10},
    pauseMenu: {type: 'button', index: 9},
    highBeams: {type: 'button', index: 2},
    radioToggle:{type: 'button', index: 8},
    radioPlay: {type: 'button', index: 3},
    radioNext: {type: 'button', index: 15},
    radioPrev: {type: 'button', index: 13},
    cameraMode:{type: 'button', index: 11},
    lookBack:  {type: 'button', index: 1},
    tuningMenu:{type: 'button', index: 12},
    mute:      {type: 'button', index: 4},
    legend:    {type: 'button', index: 14},
    cameraLookX:{type: 'axis', index: 2, scale: -1, deadzone: 0.16},
    cameraLookY:{type: 'axis', index: 3, scale: 1, deadzone: 0.16},
  };
}
function defaultContext(id){
  const labels = {
    vehicle: {en: 'Vehicle', it: 'Veicolo'},
  };
  return {
    label: labels[id] || {en: id, it: id},
    schemes: {
      keyboard: defaultKeyboardScheme(),
      gamepad: defaultGamepadScheme(),
      touch: {},   // touch layout is fixed in the on-screen UI
    },
  };
}
function defaultConfig(){
  return {
    version: CONFIG_VERSION,
    allowedDevices: {keyboard: true, gamepad: true, touch: true},
    touchMode: 'auto',    // 'auto' (show on phone / portrait) · 'on' (always) · 'off' (never)
    autoAssign: true,     // Player 1 auto-follows the last device actually used
    activeContext: 'vehicle',
    contexts: {vehicle: defaultContext('vehicle')},
    // numbered device instances; keyboard is the base for everyone
    devices: [
      {id: 'keyboard-1', type: 'keyboard', slot: 1},
      {id: 'gamepad-1', type: 'gamepad', slot: 1},
      {id: 'touch-1', type: 'touch', slot: 1},
    ],
    overrides: {},                 // overrides[deviceId][contextId] = { action: binding }
    players: [{id: 'player-1', device: 'keyboard-1'}],
  };
}

// ------------------------------------------------ normalize / migrate
function normalizeScheme(type, raw, base){
  const out = clone(base);
  if(!raw || typeof raw !== 'object') return out;
  if(type === 'keyboard'){
    for(const a of KEYBOARD_ACTIONS){
      if(Array.isArray(raw[a])) out[a] = raw[a].filter(k => typeof k === 'string' && k).slice(0, 4);
    }
  } else if(type === 'gamepad'){
    for(const a of GAMEPAD_ACTIONS){
      const v = raw[a];
      if(v && typeof v === 'object' && typeof v.index === 'number') out[a] = Object.assign({}, out[a], v);
    }
  }
  return out;
}

function migrateV1(raw){
  // v1: flat {allowedDevices, autoTouch, players:[{device:type}], bindings:{keyboard,gamepad}}
  const cfg = defaultConfig();
  if(raw.allowedDevices) for(const d of DEVICE_TYPES) if(typeof raw.allowedDevices[d] === 'boolean') cfg.allowedDevices[d] = raw.allowedDevices[d];
  cfg.touchMode = raw.autoTouch === false ? 'off' : 'auto';
  if(typeof raw.autoAssign === 'boolean') cfg.autoAssign = raw.autoAssign;
  if(raw.bindings){
    cfg.contexts.vehicle.schemes.keyboard = normalizeScheme('keyboard', raw.bindings.keyboard, defaultKeyboardScheme());
    cfg.contexts.vehicle.schemes.gamepad = normalizeScheme('gamepad', raw.bindings.gamepad, defaultGamepadScheme());
  }
  if(Array.isArray(raw.players) && raw.players.length){
    cfg.players = raw.players.slice(0, 4).map((p, i) => {
      const type = DEVICE_TYPES.indexOf(p && p.device) >= 0 ? p.device : 'keyboard';
      return {id: 'player-' + (i + 1), device: type + '-1'};
    });
  }
  return cfg;
}

function normalizeConfig(raw){
  if(!raw || typeof raw !== 'object') return defaultConfig();
  if(raw.version !== CONFIG_VERSION && !raw.contexts) return migrateV1(raw);
  const rawVersion = Number(raw.version || 2);

  const cfg = defaultConfig();
  if(raw.allowedDevices) for(const d of DEVICE_TYPES) if(typeof raw.allowedDevices[d] === 'boolean') cfg.allowedDevices[d] = raw.allowedDevices[d];
  cfg.touchMode = ['auto', 'on', 'off'].indexOf(raw.touchMode) >= 0 ? raw.touchMode : (raw.autoTouch === false ? 'off' : 'auto');
  if(typeof raw.autoAssign === 'boolean') cfg.autoAssign = raw.autoAssign;
  if(typeof raw.activeContext === 'string') cfg.activeContext = raw.activeContext;

  // contexts
  if(raw.contexts && typeof raw.contexts === 'object'){
    cfg.contexts = {};
    for(const id in raw.contexts){
      const rc = raw.contexts[id] || {};
      const dc = defaultContext(id);
      cfg.contexts[id] = {
        label: rc.label && rc.label.en ? rc.label : dc.label,
        schemes: {
          keyboard: normalizeScheme('keyboard', rc.schemes && rc.schemes.keyboard, defaultKeyboardScheme()),
          gamepad: normalizeScheme('gamepad', rc.schemes && rc.schemes.gamepad, defaultGamepadScheme()),
          touch: {},
        },
      };
    }
  }
  if(!cfg.contexts[cfg.activeContext]) cfg.activeContext = Object.keys(cfg.contexts)[0] || 'vehicle';
  if(!cfg.contexts.vehicle && !Object.keys(cfg.contexts).length) cfg.contexts.vehicle = defaultContext('vehicle');

  // device instances
  if(Array.isArray(raw.devices) && raw.devices.length){
    cfg.devices = raw.devices
      .filter(d => d && DEVICE_TYPES.indexOf(d.type) >= 0 && typeof d.id === 'string')
      .map(d => ({id: d.id, type: d.type, slot: d.slot || 1}));
    // touch is single-instance
    seedDefaultDevices(cfg);
  }

  // per-instance overrides
  if(raw.overrides && typeof raw.overrides === 'object'){
    cfg.overrides = {};
    for(const devId in raw.overrides){
      const byCtx = raw.overrides[devId];
      if(!byCtx || typeof byCtx !== 'object') continue;
      cfg.overrides[devId] = {};
      for(const ctxId in byCtx){
        const ov = byCtx[ctxId];
        if(ov && typeof ov === 'object') cfg.overrides[devId][ctxId] = clone(ov);
      }
    }
  }

  // players
  if(Array.isArray(raw.players) && raw.players.length){
    cfg.players = raw.players.slice(0, 4).map((p, i) => ({
      id: (p && p.id) || ('player-' + (i + 1)),
      device: (p && typeof p.device === 'string') ? p.device : 'keyboard-1',
    }));
  }
  migrateV2GamepadDefaults(cfg, rawVersion);
  return cfg;
}

function sameButtonBinding(bind, index){
  return !!(bind && bind.type === 'button' && bind.index === index);
}

function migrateV2GamepadScheme(scheme){
  if(!scheme || typeof scheme !== 'object') return;
  if(sameButtonBinding(scheme.radioNext, 5)) scheme.radioNext = {type: 'button', index: 15};
  if(sameButtonBinding(scheme.radioPrev, 4)) scheme.radioPrev = {type: 'button', index: 13};
  if(sameButtonBinding(scheme.mute, 13)) scheme.mute = {type: 'button', index: 4};
}

function migrateV2GamepadDefaults(cfg, rawVersion){
  if(rawVersion >= 3) return;
  Object.keys(cfg.contexts || {}).forEach(ctxId => {
    const ctx = cfg.contexts[ctxId];
    if(ctx && ctx.schemes) migrateV2GamepadScheme(ctx.schemes.gamepad);
  });
  Object.keys(cfg.overrides || {}).forEach(devId => {
    const byCtx = cfg.overrides[devId];
    Object.keys(byCtx || {}).forEach(ctxId => migrateV2GamepadScheme(byCtx[ctxId]));
  });
}

// make sure at least one instance of each allowed type exists
function seedDefaultDevices(cfg){
  const has = type => cfg.devices.some(d => d.type === type);
  if(!has('keyboard')) cfg.devices.push({id: 'keyboard-1', type: 'keyboard', slot: 1});
  if(!has('gamepad')) cfg.devices.push({id: 'gamepad-1', type: 'gamepad', slot: 1});
  if(!has('touch')) cfg.devices.push({id: 'touch-1', type: 'touch', slot: 1});
}

// merge a user override (in-game remaps, persisted) over a base project config.
// The project owns allowedDevices (the hard limit): the override never widens it.
function mergeConfig(base, override){
  const cfg = normalizeConfig(base);
  if(!override || typeof override !== 'object') return cfg;
  if(['auto', 'on', 'off'].indexOf(override.touchMode) >= 0) cfg.touchMode = override.touchMode;
  if(typeof override.autoAssign === 'boolean') cfg.autoAssign = override.autoAssign;
  if(typeof override.activeContext === 'string' && cfg.contexts[override.activeContext]) cfg.activeContext = override.activeContext;
  if(Array.isArray(override.devices)){
    override.devices.forEach(d => {
      if(d && d.id && DEVICE_TYPES.indexOf(d.type) >= 0 && !cfg.devices.some(x => x.id === d.id)) cfg.devices.push({id: d.id, type: d.type, slot: d.slot || 1});
    });
  }
  if(override.contexts){
    for(const ctxId in override.contexts){
      const oc = override.contexts[ctxId];
      if(!oc || !oc.schemes || !cfg.contexts[ctxId]) continue;
      ['keyboard', 'gamepad'].forEach(type => {
        const os = oc.schemes[type];
        if(!os) return;
        for(const a in os) cfg.contexts[ctxId].schemes[type][a] = clone(os[a]);
      });
    }
  }
  if(override.overrides){
    for(const devId in override.overrides){
      cfg.overrides[devId] = cfg.overrides[devId] || {};
      for(const ctxId in override.overrides[devId]){
        cfg.overrides[devId][ctxId] = Object.assign(cfg.overrides[devId][ctxId] || {}, clone(override.overrides[devId][ctxId]));
      }
    }
  }
  if(Array.isArray(override.players) && override.players.length){
    cfg.players = override.players.map((p, i) => ({id: (p && p.id) || ('player-' + (i + 1)), device: (p && p.device) || 'keyboard-1'}));
  }
  return cfg;
}

// ------------------------------------------------ instances / overrides
function nextSlot(config, type){
  let max = 0;
  config.devices.forEach(d => { if(d.type === type) max = Math.max(max, d.slot || 1); });
  return max + 1;
}
function addDeviceInstance(config, type){
  if(SINGLE_INSTANCE[type]) return null;               // touch can't be split
  const slot = nextSlot(config, type);
  const inst = {id: type + '-' + slot, type, slot};
  config.devices.push(inst);
  return inst;
}
function removeDeviceInstance(config, deviceId){
  const inst = config.devices.find(d => d.id === deviceId);
  if(!inst || inst.slot === 1) return false;            // never remove the base instance
  config.devices = config.devices.filter(d => d.id !== deviceId);
  delete config.overrides[deviceId];
  config.players.forEach(p => { if(p.device === deviceId) p.device = inst.type + '-1'; });
  return true;
}
function deviceLabel(inst){
  if(!inst) return '—';
  const name = inst.type.charAt(0).toUpperCase() + inst.type.slice(1);
  return name + ' ' + (inst.slot || 1);
}
function deviceInstance(config, deviceId){
  return config.devices.find(d => d.id === deviceId) || null;
}

// effective scheme for a device instance in a context = base + instance override
function effectiveScheme(config, contextId, type, deviceId){
  const ctx = config.contexts[contextId] || config.contexts[config.activeContext];
  const base = (ctx && ctx.schemes && ctx.schemes[type]) || {};
  const ov = deviceId && config.overrides[deviceId] && config.overrides[deviceId][contextId];
  return ov ? Object.assign(clone(base), ov) : clone(base);
}

// write a binding for an action, targeting the base scheme (instance #1) or an
// instance override (instance #2+) so splitting is transparent to callers.
function setBinding(config, contextId, deviceId, action, binding){
  const inst = deviceInstance(config, deviceId);
  const type = inst ? inst.type : 'keyboard';
  const ctx = config.contexts[contextId];
  if(!ctx) return;
  if(!inst || inst.slot === 1){
    ctx.schemes[type][action] = binding;
  } else {
    config.overrides[deviceId] = config.overrides[deviceId] || {};
    config.overrides[deviceId][contextId] = config.overrides[deviceId][contextId] || {};
    config.overrides[deviceId][contextId][action] = binding;
  }
}

// duplicate-binding detection within a scheme (for conflict warnings)
function schemeConflicts(scheme, type){
  const used = {};
  const conflicts = {};
  const add = (key, action) => {
    if(used[key]){ conflicts[action] = true; conflicts[used[key]] = true; }
    else used[key] = action;
  };
  if(type === 'keyboard'){
    for(const a in scheme) (scheme[a] || []).forEach(code => add('k:' + code, a));
  } else if(type === 'gamepad'){
    for(const a in scheme){ const b = scheme[a]; if(b && b.type === 'button') add('b:' + b.index, a); }
  }
  return conflicts;
}

// ------------------------------------------------ resolution (raw -> drive)
function applyDeadzone(v, dz){
  const d = dz || 0;
  if(Math.abs(v) <= d) return 0;
  return clampAxis((v - Math.sign(v) * d) / (1 - d));
}
function neutralDrive(){
  return {
    steer: 0, throttle: 0, brake: 0, handbrake: false, reset: false,
    pauseMenu: false, highBeams: false, radioToggle: false, radioPlay: false,
    radioNext: false, radioPrev: false, cameraMode: false, lookBack: false,
    tuningMenu: false, mute: false, legend: false, cameraLookX: 0, cameraLookY: 0,
  };
}
// combine two drive commands (keep the stronger analog signal, OR the buttons)
function mergeDrive(a, b){
  if(!a) return b || neutralDrive();
  if(!b) return a;
  return {
    steer: Math.abs(b.steer) > Math.abs(a.steer) ? b.steer : a.steer,
    throttle: Math.max(a.throttle, b.throttle),
    brake: Math.max(a.brake, b.brake),
    handbrake: a.handbrake || b.handbrake,
    reset: a.reset || b.reset,
    pauseMenu: a.pauseMenu || b.pauseMenu,
    highBeams: a.highBeams || b.highBeams,
    radioToggle: a.radioToggle || b.radioToggle,
    radioPlay: a.radioPlay || b.radioPlay,
    radioNext: a.radioNext || b.radioNext,
    radioPrev: a.radioPrev || b.radioPrev,
    cameraMode: a.cameraMode || b.cameraMode,
    lookBack: a.lookBack || b.lookBack,
    tuningMenu: a.tuningMenu || b.tuningMenu,
    mute: a.mute || b.mute,
    legend: a.legend || b.legend,
    cameraLookX: Math.abs(b.cameraLookX || 0) > Math.abs(a.cameraLookX || 0) ? b.cameraLookX : a.cameraLookX,
    cameraLookY: Math.abs(b.cameraLookY || 0) > Math.abs(a.cameraLookY || 0) ? b.cameraLookY : a.cameraLookY,
  };
}

function resolveKeyboard(scheme, kb){
  if(!kb || !scheme) return neutralDrive();
  const anyDown = list => Array.isArray(list) && list.some(code => kb.isCodeDown(code));
  return {
    steer: (anyDown(scheme.steerLeft) ? 1 : 0) - (anyDown(scheme.steerRight) ? 1 : 0),
    throttle: anyDown(scheme.throttle) ? 1 : 0,
    brake: anyDown(scheme.brake) ? 1 : 0,
    handbrake: anyDown(scheme.handbrake),
    reset: anyDown(scheme.reset),
    pauseMenu: anyDown(scheme.pauseMenu),
    highBeams: anyDown(scheme.highBeams),
    radioToggle: anyDown(scheme.radioToggle),
    radioPlay: anyDown(scheme.radioPlay),
    radioNext: anyDown(scheme.radioNext),
    radioPrev: anyDown(scheme.radioPrev),
    cameraMode: anyDown(scheme.cameraMode),
    lookBack: anyDown(scheme.lookBack),
    tuningMenu: anyDown(scheme.tuningMenu),
    mute: anyDown(scheme.mute),
    legend: anyDown(scheme.legend),
    cameraLookX: 0,
    cameraLookY: 0,
  };
}
function readGamepadValue(bind, gp){
  if(!bind || !gp) return 0;
  if(bind.type === 'axis') return applyDeadzone(gp.axis(bind.index) * (bind.scale || 1), bind.deadzone);
  return gp.button(bind.index);
}
function readGamepadPressed(bind, gp){
  if(!bind || !gp) return false;
  if(bind.type === 'axis') return Math.abs(gp.axis(bind.index)) > (bind.deadzone || 0.3);
  return gp.pressed(bind.index);
}
function resolveGamepad(scheme, gp){
  if(!gp || !scheme) return neutralDrive();
  return {
    steer: clampAxis(readGamepadValue(scheme.steer, gp)),
    throttle: clamp01(readGamepadValue(scheme.throttle, gp)),
    brake: clamp01(readGamepadValue(scheme.brake, gp)),
    handbrake: readGamepadPressed(scheme.handbrake, gp),
    reset: readGamepadPressed(scheme.reset, gp),
    pauseMenu: readGamepadPressed(scheme.pauseMenu, gp),
    highBeams: readGamepadPressed(scheme.highBeams, gp),
    radioToggle: readGamepadPressed(scheme.radioToggle, gp),
    radioPlay: readGamepadPressed(scheme.radioPlay, gp),
    radioNext: readGamepadPressed(scheme.radioNext, gp),
    radioPrev: readGamepadPressed(scheme.radioPrev, gp),
    cameraMode: readGamepadPressed(scheme.cameraMode, gp),
    lookBack: readGamepadPressed(scheme.lookBack, gp),
    tuningMenu: readGamepadPressed(scheme.tuningMenu, gp),
    mute: readGamepadPressed(scheme.mute, gp),
    legend: readGamepadPressed(scheme.legend, gp),
    cameraLookX: clampAxis(readGamepadValue(scheme.cameraLookX, gp)),
    cameraLookY: clampAxis(readGamepadValue(scheme.cameraLookY, gp)),
  };
}
function resolveTouch(touch){
  if(!touch) return neutralDrive();
  const a = touch.axes || {};
  return {
    steer: clampAxis(a.steer || 0),
    throttle: clamp01(a.throttle || 0),
    brake: clamp01(a.brake || 0),
    handbrake: !!a.handbrake,
    reset: !!a.reset,
    pauseMenu: !!a.pauseMenu,
    highBeams: !!a.highBeams,
    radioToggle: !!a.radioToggle,
    radioPlay: !!a.radioPlay,
    radioNext: !!a.radioNext,
    radioPrev: !!a.radioPrev,
    cameraMode: !!a.cameraMode,
    lookBack: !!a.lookBack,
    tuningMenu: !!a.tuningMenu,
    mute: !!a.mute,
    legend: !!a.legend,
    cameraLookX: clampAxis(a.cameraLookX || 0),
    cameraLookY: clampAxis(a.cameraLookY || 0),
  };
}

// ------------------------------------------------ labels
function keyLabel(code){
  if(!code) return '—';
  if(code.indexOf('Key') === 0) return code.slice(3);
  if(code.indexOf('Digit') === 0) return code.slice(5);
  const map = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    Space: 'Space', ShiftLeft: '⇧L', ShiftRight: '⇧R',
    ControlLeft: 'CtrlL', ControlRight: 'CtrlR', Enter: '⏎', Escape: 'Esc', Tab: 'Tab',
  };
  return map[code] || code;
}
const GAMEPAD_BUTTON_LABELS = {0:'A',1:'B',2:'X',3:'Y',4:'LB',5:'RB',6:'LT',7:'RT',8:'View',9:'Menu',10:'L3',11:'R3',12:'▲',13:'▼',14:'◀',15:'▶'};
function gamepadBindLabel(b){
  if(!b) return '—';
  if(b.type === 'axis') return 'Axis ' + b.index + (b.scale < 0 ? ' −' : '');
  return GAMEPAD_BUTTON_LABELS[b.index] || ('B' + b.index);
}

const ACTION_LABELS = {
  throttle: {en: 'Accelerate', it: 'Accelera'},
  brake: {en: 'Brake / reverse', it: 'Frena / retro'},
  steerLeft: {en: 'Steer left', it: 'Sterza sinistra'},
  steerRight: {en: 'Steer right', it: 'Sterza destra'},
  steer: {en: 'Steering', it: 'Sterzo'},
  handbrake: {en: 'Handbrake (drift)', it: 'Freno a mano (drift)'},
  reset: {en: 'Reset car', it: 'Reset auto'},
  pauseMenu: {en: 'Pause menu', it: 'Menu pausa'},
  highBeams: {en: 'Flash headlights', it: 'Lampeggia fari'},
  radioToggle: {en: 'Radio open/close', it: 'Apri/chiudi radio'},
  radioPlay: {en: 'Radio play/pause', it: 'Radio play/pausa'},
  radioNext: {en: 'Radio next', it: 'Radio avanti'},
  radioPrev: {en: 'Radio previous', it: 'Radio indietro'},
  cameraMode: {en: 'Camera mode', it: 'Modalita camera'},
  lookBack: {en: 'Look back', it: 'Guarda dietro'},
  tuningMenu: {en: 'Driving setup', it: 'Setup guida'},
  mute: {en: 'Mute audio', it: 'Muto audio'},
  legend: {en: 'Help panel', it: 'Pannello aiuto'},
  cameraLookX: {en: 'Camera look X', it: 'Camera look X'},
  cameraLookY: {en: 'Camera look Y', it: 'Camera look Y'},
};

window.LK_RUNTIME_INPUT_ACTIONS = Object.freeze({
  CONFIG_VERSION,
  DEVICE_TYPES,
  SINGLE_INSTANCE,
  KEYBOARD_ACTIONS,
  GAMEPAD_ACTIONS,
  ACTION_LABELS,
  GAMEPAD_BUTTON_LABELS,
  clone,
  defaultConfig,
  normalizeConfig,
  mergeConfig,
  // instances / overrides
  addDeviceInstance,
  removeDeviceInstance,
  deviceLabel,
  deviceInstance,
  effectiveScheme,
  setBinding,
  schemeConflicts,
  // resolution
  neutralDrive,
  mergeDrive,
  resolveKeyboard,
  resolveGamepad,
  resolveTouch,
  // labels
  keyLabel,
  gamepadBindLabel,
});
})();
