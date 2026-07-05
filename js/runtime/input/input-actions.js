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
   into a normalized drive command {steer, throttle, brake, handbrake, reset}.
   ========================================================= */
(function(){
'use strict';

const CONFIG_VERSION = 2;
const DEVICE_TYPES = ['keyboard', 'gamepad', 'touch'];
const SINGLE_INSTANCE = {touch: true};   // types that cannot be split

const KEYBOARD_ACTIONS = ['throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake', 'reset'];
const GAMEPAD_ACTIONS = ['steer', 'throttle', 'brake', 'handbrake', 'reset'];

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
  };
}
function defaultGamepadScheme(){
  return {
    steer:     {type: 'axis',   index: 0, scale: -1, deadzone: 0.18},
    throttle:  {type: 'button', index: 7},
    brake:     {type: 'button', index: 6},
    handbrake: {type: 'button', index: 0},
    reset:     {type: 'button', index: 8},
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
  return cfg;
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
function neutralDrive(){ return {steer: 0, throttle: 0, brake: 0, handbrake: false, reset: false}; }
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
const GAMEPAD_BUTTON_LABELS = {0:'A',1:'B',2:'X',3:'Y',4:'LB',5:'RB',6:'LT',7:'RT',8:'Back',9:'Start',10:'L3',11:'R3',12:'▲',13:'▼',14:'◀',15:'▶'};
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
