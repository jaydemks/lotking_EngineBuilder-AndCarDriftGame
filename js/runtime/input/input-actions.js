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

const CONFIG_VERSION = 15;
const DEVICE_TYPES = ['keyboard', 'gamepad', 'touch'];
const SINGLE_INSTANCE = {touch: true};   // types that cannot be split

// Combat actions are shared schema, not a separate context: only on-foot
// Pawns read them, and every non-character scheme leaves them unbound so
// vehicle input resolves exactly as before.
const COMBAT_ACTIONS = ['fire', 'aim', 'reload'];
// Football verbs. A Soccer Pawn is not a shooter and must not borrow vehicle
// actions: shooting used to read the vehicle's `highBeams`, which the character
// context deliberately leaves unbound, so the shot key simply never fired.
const SOCCER_ACTIONS = ['shoot', 'pass', 'tackle', 'diveLeft', 'diveRight'];
// Species abilities live in the same persisted on-foot context, then the
// possessed-Pawn profile makes them mutually exclusive with human/football
// verbs that intentionally share the convenient F/Q/E defaults.
const ANIMAL_ACTIONS = ['primaryAbility', 'secondaryAbility', 'voice'];

// On-foot traversal and world verbs. Same rule as combat: shared schema, left
// unbound for every non-character context, so vehicle input is untouched.
const ONFOOT_ACTIONS = ['jump', 'crouch', 'slowWalk', 'interact', 'pickup', 'dropItem', 'nextWeapon', 'useItem', 'dodge', 'swapShoulder', 'leanLeft', 'leanRight',
  'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'inventory'].concat(SOCCER_ACTIONS).concat(ANIMAL_ACTIONS);
const KEYBOARD_ACTIONS = [
  'throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake', 'wheelBrake', 'sprint', 'reset',
  'pauseMenu', 'highBeams', 'towToggle', 'radioToggle', 'radioPlay', 'radioNext', 'radioPrev',
  'cameraMode', 'lookBack', 'tuningMenu', 'mute', 'legend',
].concat(COMBAT_ACTIONS).concat(ONFOOT_ACTIONS);
const GAMEPAD_ACTIONS = [
  'steer', 'throttle', 'brake', 'handbrake', 'wheelBrake', 'sprint', 'reset',
  'pauseMenu', 'highBeams', 'towToggle', 'radioToggle', 'radioPlay', 'radioNext', 'radioPrev',
  'cameraMode', 'lookBack', 'tuningMenu', 'mute', 'legend',
  'cameraLookX', 'cameraLookY',
].concat(COMBAT_ACTIONS).concat(ONFOOT_ACTIONS);

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
    // Aircraft landing-gear brakes are independent from Handbrake and from
    // global radio/camera commands. K is deliberately free in Vehicle defaults.
    wheelBrake: ['KeyK'],
    sprint:     ['ShiftLeft', 'ShiftRight'],
    reset:      ['KeyR'],
    pauseMenu:  ['Escape'],
    highBeams:  ['KeyL'],
    towToggle:  ['KeyT'],
    radioToggle:['Tab'],
    radioPlay:  ['KeyP'],
    radioNext:  ['KeyN'],
    radioPrev:  ['KeyB'],
    cameraMode: ['KeyC'],
    lookBack:   ['KeyV'],
    tuningMenu: ['KeyU'],
    mute:       ['KeyM'],
    legend:     ['KeyH'],
    fire:       [],
    aim:        [],
    reload:     [],
    shoot:      [],
    pass:       [],
    tackle:     [],
    diveLeft:   [],
    diveRight:  [],
    primaryAbility: [],
    secondaryAbility: [],
    voice:      [],
    jump:       [],
    crouch:     [],
    slowWalk:   [],
    interact:   ['KeyF'],
    pickup:     [],
    dropItem:   [],
    nextWeapon: [],
    useItem:    [],
    dodge:      [],
    swapShoulder: [],
    leanLeft:   [],
    leanRight:  [],
    slot1:[], slot2:[], slot3:[], slot4:[], slot5:[], slot6:[], slot7:[],
    inventory:  [],
  };
}
function defaultGamepadScheme(){
  return {
    steer:     {type: 'axis',   index: 0, scale: -1, deadzone: 0.18},
    throttle:  {type: 'button', index: 7},
    brake:     {type: 'button', index: 6},
    handbrake: {type: 'button', index: 0},
    // No standard pad button is free without colliding with an existing
    // Vehicle command. Authors/players can bind this explicitly when needed.
    wheelBrake:null,
    sprint:    {type: 'button', index: 5},
    reset:     {type: 'button', index: 10},
    pauseMenu: {type: 'button', index: 9},
    highBeams: {type: 'button', index: 14},
    // Deliberately unbound: standard pads have no unused button. It remains
    // independently rebindable in the Vehicle context.
    towToggle: null,
    radioToggle:{type: 'button', index: 8},
    radioPlay: {type: 'button', index: 3},
    radioNext: {type: 'button', index: 15},
    radioPrev: {type: 'button', index: 13},
    cameraMode:{type: 'button', index: 11},
    lookBack:  {type: 'button', index: 1},
    tuningMenu:{type: 'button', index: 12},
    mute:      {type: 'button', index: 4},
    legend:    null,
    cameraLookX:{type: 'axis', index: 2, scale: -1, deadzone: 0.16},
    cameraLookY:{type: 'axis', index: 3, scale: 1, deadzone: 0.16},
    fire:      null,
    aim:       null,
    reload:    null,
    shoot:     null,
    pass:      null,
    tackle:    null,
    diveLeft:  null,
    diveRight: null,
    primaryAbility:null,
    secondaryAbility:null,
    voice:      null,
    jump:      null,
    crouch:    null,
    slowWalk:  null,
    interact:  {type: 'button', index: 2},
    pickup:    null,
    dropItem:  null,
    nextWeapon:null,
    useItem:   null,
    dodge:     null,
    swapShoulder: null,
    leanLeft:  null,
    leanRight: null,
    slot1:null, slot2:null, slot3:null, slot4:null, slot5:null, slot6:null, slot7:null,
    inventory: null,
  };
}
function defaultCharacterKeyboardScheme(){
  const scheme = defaultKeyboardScheme();
  scheme.handbrake = [];
  scheme.wheelBrake = [];
  // Reset belongs exclusively to vehicle Pawns. Jump is an independent action,
  // so R can reload a weapon without a global vehicle handler teleporting the
  // possessed Character back to spawn.
  scheme.reset = [];
  scheme.jump = ['Space'];
  // E / F / G are the world verbs on foot, so the vehicle's headlight flash
  // gives its keys up rather than fighting them.
  scheme.highBeams = [];
  scheme.towToggle = [];
  scheme.radioToggle = [];
  scheme.radioPlay = [];
  scheme.radioNext = [];
  scheme.radioPrev = [];
  scheme.tuningMenu = [];
  // On-foot combat. Mouse buttons are tracked as synthetic codes by the
  // keyboard source, so they rebind through the same UI as physical keys.
  scheme.fire = ['Mouse0'];
  scheme.aim = ['Mouse2'];
  scheme.reload = ['KeyR'];
  // C is crouch now, so the first/third person toggle moves to B. Neither is a
  // browser shortcut and both stay on the movement hand.
  scheme.cameraMode = ['KeyB'];
  // Traversal and world verbs.
  //
  // NO MODIFIERS. Ctrl and Alt are the natural FPS choices on a desktop game,
  // but this runs in a browser: Ctrl+W closes the tab, Ctrl+T opens one and
  // Alt focuses the menu bar — and none of them can be cancelled from script,
  // because the browser handles them above the page. Crouch on Ctrl therefore
  // means "crouch and walk forward" closes the game. Z and X sit under the same
  // fingers as WASD and are safe.
  scheme.crouch = ['KeyC'];
  scheme.slowWalk = ['KeyX'];
  // ONE key for the world. A tap uses whatever is in front — a door, a ladder,
  // a crate — and a HOLD picks an item up. Two verbs on one key, told apart by
  // how long it is held, so the player never has to remember which is which.
  scheme.interact = ['KeyF'];
  // Football. Hold to charge, release to strike. Deliberately NOT on Mouse0:
  // that is Fire, and a shared binding is a real conflict in the mapping UI.
  // The Soccer Pawn accepts Fire as an alias at the Pawn level instead, so
  // left-click still shoots without either action losing its own key.
  scheme.shoot = ['KeyF'];
  scheme.pass = ['KeyG'];
  scheme.tackle = ['KeyC'];
  scheme.diveLeft = ['KeyJ'];
  scheme.diveRight = ['KeyL'];
  scheme.primaryAbility = ['KeyF'];
  scheme.secondaryAbility = ['KeyE'];
  scheme.voice = ['KeyQ'];
  // Unbound on purpose: picking up is the hold on Interact. The action still
  // exists so a project that wants a separate instant-pickup key can bind one.
  scheme.pickup = [];
  scheme.dropItem = ['KeyG'];
  // Q and E are the lean, which every cover shooter binds there, so the weapon
  // swap moves to Z and the mouse wheel.
  scheme.nextWeapon = ['KeyZ'];
  scheme.leanLeft = ['KeyQ'];
  scheme.leanRight = ['KeyE'];
  // The seven roles on the number row, in the order the loadout is laid out:
  // fists, sidearm, primary, melee, bonus, flashbang, grenade.
  for(let i = 1; i <= 7; i++) scheme['slot' + i] = ['Digit' + i];
  // Tap for the weapon wheel, hold for the backpack. One key, two views, told
  // apart by how long it is held — the same rule Use already follows.
  scheme.inventory = ['KeyI'];
  // Only a backpack inventory has anything to use; the other modes leave it inert.
  scheme.useItem = ['KeyT'];
  // Double-tapped, not held: at speed it slides, at a walk it rolls. Alt on its
  // own is safe (it is the browser's menu key only in combination), and the
  // keyboard source cancels the menu focus while the game holds pointer lock.
  scheme.dodge = ['AltLeft', 'AltRight'];
  // On foot there is nothing behind you worth a dedicated Look Back, so V is
  // free for the shoulder swap every third-person shooter binds.
  scheme.lookBack = [];
  scheme.swapShoulder = ['KeyV'];
  return scheme;
}
function defaultCharacterGamepadScheme(){
  const scheme = defaultGamepadScheme();
  // Left stick owns planar movement. Positive/negative halves of Axis 1 are
  // resolved independently into forward/backward, while the right stick
  // remains camera look. This is intentionally different from a vehicle's
  // trigger throttle/brake layout.
  scheme.steer = {type:'axis', index:0, scale:-1, deadzone:.18};
  scheme.throttle = {type:'axis', index:1, scale:-1, deadzone:.18};
  scheme.brake = {type:'axis', index:1, scale:1, deadzone:.18};
  // Vehicle-only verbs stay physically unbound in an on-foot context. Leaving
  // them on inherited buttons makes the Mapping UI report false conflicts
  // (B/Circle was both Handbrake and Crouch, X/Square both High Beams and Use).
  scheme.handbrake = null;
  scheme.wheelBrake = null;
  scheme.sprint = {type:'button', index:10};
  scheme.reset = null;
  scheme.jump = {type:'button', index:0};
  scheme.highBeams = null;
  scheme.towToggle = null;
  scheme.radioToggle = null;
  scheme.radioPlay = null;
  scheme.radioNext = null;
  scheme.radioPrev = null;
  scheme.tuningMenu = null;
  scheme.fire = {type:'button', index:7};    // right trigger (standard mapping)
  scheme.aim = {type:'button', index:6};     // left trigger (standard mapping)
  scheme.reload = {type:'button', index:3};  // Y/Triangle
  scheme.crouch = {type:'button', index:1};  // B/Circle
  scheme.slowWalk = null;                    // analog stick already walks
  scheme.interact = {type:'button', index:2};// X/Square
  scheme.shoot = {type:'button', index:2};   // X/Square: hold to charge a shot
  scheme.pass = {type:'button', index:0};    // A/Cross
  scheme.tackle = {type:'button', index:1};  // B/Circle
  scheme.diveLeft = {type:'button', index:14};  // D-pad Left
  scheme.diveRight = {type:'button', index:15}; // D-pad Right
  scheme.primaryAbility = {type:'button', index:2};   // X/Square
  scheme.secondaryAbility = {type:'button', index:5}; // RB
  scheme.voice = {type:'button', index:4};            // LB
  // Pick Up is the Interact hold gesture. Keeping a second X binding makes a
  // single press execute both the tap and the dedicated action before the hold
  // resolver has had a chance to decide which one the player meant.
  scheme.pickup = null;
  scheme.dropItem = {type:'button', index:14};
  scheme.nextWeapon = {type:'button', index:15};
  scheme.useItem = {type:'button', index:13};
  // RB belongs to Lean Right. There is no remaining standard face/shoulder
  // button that does not already own a simultaneous Character action, so Dodge
  // is intentionally available for rebinding instead of double-firing.
  scheme.dodge = null;
  scheme.lookBack = null;
  scheme.swapShoulder = {type:'button', index:12}; // D-pad Up; R3 stays Camera
  scheme.leanLeft = {type:'button', index:4};    // LB
  scheme.leanRight = {type:'button', index:5};   // RB
  // These inherited UI shortcuts collided with Lean Left and Drop Item. They
  // remain keyboard actions and can be explicitly rebound on a custom pad.
  scheme.mute = null;
  scheme.legend = null;
  scheme.inventory = {type:'button', index:8};   // View / Back
  return scheme;
}
function defaultContext(id){
  const labels = {
    vehicle: {en: 'Vehicle', it: 'Veicolo'},
    character: {en: 'Character', it: 'Personaggio'},
  };
  const character = id === 'character';
  return {
    label: labels[id] || {en: id, it: id},
    schemes: {
      keyboard: character ? defaultCharacterKeyboardScheme() : defaultKeyboardScheme(),
      gamepad: character ? defaultCharacterGamepadScheme() : defaultGamepadScheme(),
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
    contexts: {
      vehicle: defaultContext('vehicle'),
      character: defaultContext('character'),
    },
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
// Ctrl cannot be used by a browser game, and no amount of care changes that:
// Ctrl+W closes the tab, Ctrl+T opens one, Ctrl+N opens a window, and the page
// never sees any of them — the browser handles them above it. A binding on Ctrl
// is therefore not a control, it is a way to lose the session mid-fight. It is
// stripped from every scheme, including one restored from a project saved
// before this rule existed.
//
// Alt survives because it CAN be cancelled: it only steals focus on its own,
// and the keyboard source suppresses that while the game holds pointer lock.
const UNSAFE_CODES = {ControlLeft:true, ControlRight:true, MetaLeft:true, MetaRight:true};
function stripUnsafe(codes){
  return (codes || []).filter(code => !UNSAFE_CODES[code]);
}

function normalizeScheme(type, raw, base){
  const out = clone(base);
  if(!raw || typeof raw !== 'object') return out;
  if(type === 'keyboard'){
    for(const a of KEYBOARD_ACTIONS){
      if(Array.isArray(raw[a])) out[a] = stripUnsafe(raw[a].filter(k => typeof k === 'string' && k)).slice(0, 4);
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
          keyboard: normalizeScheme('keyboard', rc.schemes && rc.schemes.keyboard, dc.schemes.keyboard),
          gamepad: normalizeScheme('gamepad', rc.schemes && rc.schemes.gamepad, dc.schemes.gamepad),
          touch: {},
        },
      };
    }
  }
  if(!cfg.contexts.vehicle) cfg.contexts.vehicle = defaultContext('vehicle');
  if(!cfg.contexts.character) cfg.contexts.character = defaultContext('character');
  if(!cfg.contexts[cfg.activeContext]) cfg.activeContext = Object.keys(cfg.contexts)[0] || 'vehicle';

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
  migrateV4OnFoot(cfg, rawVersion);
  migrateV13Soccer(cfg, rawVersion);
  migrateV14Jump(cfg, rawVersion, raw);
  migrateV5Modifiers(cfg, rawVersion);
  migrateV10Controls(cfg, rawVersion);
  hardenVehicleExitBindings(cfg);
  hardenCharacterGamepadBindings(cfg);
  return cfg;
}

// v11 reshuffles the on-foot layout: C becomes crouch (so the view toggle moves
// to B), Q and E become the lean (so the weapon swap moves to Z), and picking up
// becomes a hold on Interact rather than its own key. A binding still sitting on
// the old default is moved; anything the player chose themselves is left alone.
function migrateV10Controls(cfg, rawVersion){
  if(rawVersion >= 11) return;
  const keyboard = cfg.contexts && cfg.contexts.character && cfg.contexts.character.schemes
    && cfg.contexts.character.schemes.keyboard;
  if(!keyboard) return;
  const defaults = defaultCharacterKeyboardScheme();
  const was = (action, previous) => Array.isArray(keyboard[action]) && keyboard[action].join(',') === previous;
  if(was('crouch', 'KeyZ')) keyboard.crouch = defaults.crouch.slice();
  if(was('cameraMode', 'KeyC')) keyboard.cameraMode = defaults.cameraMode.slice();
  if(was('nextWeapon', 'KeyQ')) keyboard.nextWeapon = defaults.nextWeapon.slice();
  if(was('pickup', 'KeyE')) keyboard.pickup = [];
  ['leanLeft', 'leanRight'].forEach(action => {
    if(!Array.isArray(keyboard[action]) || !keyboard[action].length) keyboard[action] = defaults[action].slice();
  });
}

// v5 shipped Crouch on Ctrl and Slow Walk on Alt, which are browser shortcuts
// the page cannot intercept. Any config still holding them is moved onto the
// safe keys; a player who deliberately rebound them to something else keeps it.
function migrateV5Modifiers(cfg, rawVersion){
  if(rawVersion >= 6) return;
  const keyboard = cfg.contexts && cfg.contexts.character && cfg.contexts.character.schemes
    && cfg.contexts.character.schemes.keyboard;
  if(!keyboard) return;
  const defaults = defaultCharacterKeyboardScheme();
  const wasDefault = (action, previous) => Array.isArray(keyboard[action]) && keyboard[action].join(',') === previous;
  if(wasDefault('crouch', 'ControlLeft,ControlRight')) keyboard.crouch = defaults.crouch.slice();
  if(wasDefault('slowWalk', 'AltLeft,AltRight')) keyboard.slowWalk = defaults.slowWalk.slice();
}

// v4 bound E and F to the vehicle headlight flash in the character context.
// v5 gives those keys to the world verbs, so a config saved before the change
// must release them or Interact and Pick Up would arrive already taken.
function migrateV4OnFoot(cfg, rawVersion){
  if(rawVersion >= 5) return;
  const scheme = cfg.contexts && cfg.contexts.character && cfg.contexts.character.schemes;
  const keyboard = scheme && scheme.keyboard;
  if(!keyboard) return;
  const stale = Array.isArray(keyboard.highBeams) && keyboard.highBeams.join(',') === 'KeyE,KeyF';
  if(stale) keyboard.highBeams = [];
  const defaults = defaultCharacterKeyboardScheme();
  ONFOOT_ACTIONS.forEach(action => {
    if(!Array.isArray(keyboard[action]) || !keyboard[action].length) keyboard[action] = defaults[action].slice();
  });
}

// v13 had no football verbs: a Soccer Pawn read the vehicle's `highBeams`,
// which the character context unbinds, so the shot key did nothing. A config
// saved before v14 gains the new bindings rather than inheriting empty ones.
function migrateV13Soccer(cfg, rawVersion){
  if(rawVersion >= 14) return;
  const schemes = cfg.contexts && cfg.contexts.character && cfg.contexts.character.schemes;
  if(!schemes) return;
  const keyboardDefaults = defaultCharacterKeyboardScheme();
  const gamepadDefaults = defaultCharacterGamepadScheme();
  SOCCER_ACTIONS.forEach(action => {
    if(schemes.keyboard && (!Array.isArray(schemes.keyboard[action]) || !schemes.keyboard[action].length)){
      schemes.keyboard[action] = keyboardDefaults[action].slice();
    }
    if(schemes.gamepad && !schemes.gamepad[action]) schemes.gamepad[action] = gamepadDefaults[action];
  });
}

// v14 represented Character Jump through the vehicle-only `reset` action.
// Move the actual authored binding, rather than restoring a default, so a
// project that moved Jump to another key/button keeps that decision. Per-device
// overrides need the same migration or a split keyboard/gamepad would silently
// retain the old overlap after the project-level scheme had been repaired.
function migrateV14Jump(cfg, rawVersion, raw){
  if(rawVersion >= 15) return;
  const schemes = cfg.contexts && cfg.contexts.character && cfg.contexts.character.schemes;
  const rawSchemes = raw && raw.contexts && raw.contexts.character && raw.contexts.character.schemes;
  if(schemes && schemes.keyboard){
    // A partial v14 config may omit the Character context or this binding and
    // rely on its schema default. In that case normalizeScheme has already
    // supplied the v15 Jump default; only overwrite it when v14 really stored
    // an authored Reset-as-Jump value.
    if(rawSchemes && rawSchemes.keyboard && Object.prototype.hasOwnProperty.call(rawSchemes.keyboard, 'reset')){
      schemes.keyboard.jump = clone(schemes.keyboard.reset);
    }
    schemes.keyboard.reset = [];
  }
  if(schemes && schemes.gamepad){
    if(rawSchemes && rawSchemes.gamepad && Object.prototype.hasOwnProperty.call(rawSchemes.gamepad, 'reset')){
      schemes.gamepad.jump = clone(schemes.gamepad.reset);
    }
    schemes.gamepad.reset = null;
  }
  Object.keys(cfg.overrides || {}).forEach(deviceId => {
    const byContext = cfg.overrides[deviceId];
    const override = byContext && byContext.character;
    if(!override || !Object.prototype.hasOwnProperty.call(override, 'reset')) return;
    const device = (cfg.devices || []).find(item => item && item.id === deviceId);
    override.jump = clone(override.reset);
    override.reset = device && device.type === 'gamepad' ? null : [];
  });
}

function sameButtonBinding(bind, index){
  return !!(bind && bind.type === 'button' && bind.index === index);
}

// Targeted repair for the former Vehicle defaults: F/X flashed high beams and
// Vehicle Interact was empty, making a Character able to enter but unable to
// leave. Only exact old defaults move; every authored remap stays authored.
function hardenVehicleExitBindings(cfg){
  const schemes=cfg&&cfg.contexts&&cfg.contexts.vehicle&&cfg.contexts.vehicle.schemes;
  if(!schemes)return;
  const keyboard=schemes.keyboard;
  if(keyboard&&Array.isArray(keyboard.interact)&&!keyboard.interact.length&&Array.isArray(keyboard.highBeams)&&keyboard.highBeams.join(',')==='KeyF'){
    keyboard.interact=['KeyF'];keyboard.highBeams=['KeyL'];
  }
  const gamepad=schemes.gamepad;
  if(gamepad&&sameButtonBinding(gamepad.highBeams,2)&&(!gamepad.interact||sameButtonBinding(gamepad.interact,2))&&sameButtonBinding(gamepad.legend,14)){
    gamepad.interact={type:'button',index:2};gamepad.highBeams={type:'button',index:14};
    if(sameButtonBinding(gamepad.legend,14))gamepad.legend=null;
  }
}

// Schema v15 stays v15: this is a targeted repair for the short-lived v15
// defaults that assigned two simultaneous Character verbs to one button. The
// football overlaps are deliberately untouched because the possessed-Pawn
// semantic filter makes Soccer and non-Soccer outputs mutually exclusive.
function hardenCharacterGamepadBindings(cfg){
  const scheme=cfg&&cfg.contexts&&cfg.contexts.character&&cfg.contexts.character.schemes
    &&cfg.contexts.character.schemes.gamepad;
  if(!scheme)return;
  if(sameButtonBinding(scheme.pickup,2)&&sameButtonBinding(scheme.interact,2))scheme.pickup=null;
  if(sameButtonBinding(scheme.dodge,5)&&sameButtonBinding(scheme.leanRight,5))scheme.dodge=null;
  if(sameButtonBinding(scheme.mute,4)&&sameButtonBinding(scheme.leanLeft,4))scheme.mute=null;
  if(sameButtonBinding(scheme.legend,14)&&sameButtonBinding(scheme.dropItem,14))scheme.legend=null;
  if(sameButtonBinding(scheme.swapShoulder,11)&&sameButtonBinding(scheme.cameraMode,11)){
    const dpadUpUsed=Object.keys(scheme).some(action=>action!=='swapShoulder'&&sameButtonBinding(scheme[action],12));
    scheme.swapShoulder=dpadUpUsed?null:{type:'button',index:12};
  }
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
  const layer = clone(override);
  // Overrides saved before v15 did not carry a version. In every such file the
  // Character `reset` slot meant Jump, so treating an absent version as v14 is
  // both lossless and deterministic.
  if(Number(layer.version || 14) < 15){
    const schemes = layer.contexts && layer.contexts.character && layer.contexts.character.schemes;
    if(schemes && schemes.keyboard && Object.prototype.hasOwnProperty.call(schemes.keyboard, 'reset')){
      schemes.keyboard.jump = clone(schemes.keyboard.reset);
      schemes.keyboard.reset = [];
    }
    if(schemes && schemes.gamepad && Object.prototype.hasOwnProperty.call(schemes.gamepad, 'reset')){
      schemes.gamepad.jump = clone(schemes.gamepad.reset);
      schemes.gamepad.reset = null;
    }
    Object.keys(layer.overrides || {}).forEach(deviceId => {
      const byContext = layer.overrides[deviceId];
      const item = byContext && byContext.character;
      if(!item || !Object.prototype.hasOwnProperty.call(item, 'reset')) return;
      const device = (layer.devices || cfg.devices || []).find(entry => entry && entry.id === deviceId);
      item.jump = clone(item.reset);
      item.reset = device && device.type === 'gamepad' ? null : [];
    });
    layer.version = CONFIG_VERSION;
  }
  if(['auto', 'on', 'off'].indexOf(layer.touchMode) >= 0) cfg.touchMode = layer.touchMode;
  if(typeof layer.autoAssign === 'boolean') cfg.autoAssign = layer.autoAssign;
  if(typeof layer.activeContext === 'string' && cfg.contexts[layer.activeContext]) cfg.activeContext = layer.activeContext;
  if(Array.isArray(layer.devices)){
    layer.devices.forEach(d => {
      if(d && d.id && DEVICE_TYPES.indexOf(d.type) >= 0 && !cfg.devices.some(x => x.id === d.id)) cfg.devices.push({id: d.id, type: d.type, slot: d.slot || 1});
    });
  }
  if(layer.contexts){
    for(const ctxId in layer.contexts){
      const oc = layer.contexts[ctxId];
      if(!oc || !oc.schemes || !cfg.contexts[ctxId]) continue;
      ['keyboard', 'gamepad'].forEach(type => {
        const os = oc.schemes[type];
        if(!os) return;
        for(const a in os) cfg.contexts[ctxId].schemes[type][a] = clone(os[a]);
      });
    }
  }
  if(layer.overrides){
    for(const devId in layer.overrides){
      cfg.overrides[devId] = cfg.overrides[devId] || {};
      for(const ctxId in layer.overrides[devId]){
        cfg.overrides[devId][ctxId] = Object.assign(cfg.overrides[devId][ctxId] || {}, clone(layer.overrides[devId][ctxId]));
      }
    }
  }
  if(Array.isArray(layer.players) && layer.players.length){
    cfg.players = layer.players.map((p, i) => ({id: (p && p.id) || ('player-' + (i + 1)), device: (p && p.device) || 'keyboard-1'}));
  }
  hardenCharacterGamepadBindings(cfg);
  hardenVehicleExitBindings(cfg);
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
  // Rebinding cannot reintroduce what normalization strips, or the rule would
  // only hold until the next visit to the input settings.
  if(Array.isArray(binding)) binding = stripUnsafe(binding);
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

// Soccer and the other on-foot Pawn kinds intentionally share one persisted
// Character scheme. A/Cross can therefore mean Pass to Soccer and Jump to a
// Character, for example, without ever producing both commands for one Pawn.
// Keep that domain rule here beside conflict detection so the Mapping UI does
// not warn about safe, possession-exclusive aliases. Fire/Shoot is the sole
// cross-domain alias: the Soccer filter converts Fire into Shoot and clears the
// firearm output. Fire combined with Pass/Tackle remains a real conflict.
const NON_SOCCER_ACTIONS = new Set(COMBAT_ACTIONS.filter(action=>action!=='fire').concat(
  ONFOOT_ACTIONS.filter(action=>SOCCER_ACTIONS.indexOf(action)<0&&ANIMAL_ACTIONS.indexOf(action)<0&&action!=='leanLeft'&&action!=='leanRight')
));
const NON_ANIMAL_ACTIONS = new Set(COMBAT_ACTIONS.concat(ONFOOT_ACTIONS.filter(action=>ANIMAL_ACTIONS.indexOf(action)<0)));
function actionsAreMutuallyExclusive(first,second){
  if((first==='fire'&&second==='shoot')||(second==='fire'&&first==='shoot'))return true;
  const firstSoccer=SOCCER_ACTIONS.indexOf(first)>=0,secondSoccer=SOCCER_ACTIONS.indexOf(second)>=0;
  if((firstSoccer&&NON_SOCCER_ACTIONS.has(second))||(secondSoccer&&NON_SOCCER_ACTIONS.has(first)))return true;
  const firstAnimal=ANIMAL_ACTIONS.indexOf(first)>=0,secondAnimal=ANIMAL_ACTIONS.indexOf(second)>=0;
  return (firstAnimal&&NON_ANIMAL_ACTIONS.has(second))||(secondAnimal&&NON_ANIMAL_ACTIONS.has(first));
}

// duplicate-binding detection within a scheme (for conflict warnings)
function schemeConflicts(scheme, type){
  const used = {};
  const conflicts = {};
  const add = (key, action) => {
    const previous=used[key]||(used[key]=[]);
    previous.forEach(other=>{
      if(actionsAreMutuallyExclusive(action,other))return;
      conflicts[action]=true;
      conflicts[other]=true;
    });
    previous.push(action);
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
    steer: 0, throttle: 0, brake: 0, handbrake: false, wheelBrake:false, sprint: false, sprintAmount:0, reset: false, jump: false,
    pauseMenu: false, highBeams: false, towToggle:false, radioToggle: false, radioPlay: false,
    radioNext: false, radioPrev: false, cameraMode: false, lookBack: false,
    tuningMenu: false, mute: false, legend: false, cameraLookX: 0, cameraLookY: 0,
    fire: false, aim: false, reload: false, shoot:false, pass:false, tackle:false, diveLeft:false, diveRight:false,
    primaryAbility:false, secondaryAbility:false, voice:false,
    crouch: false, crouchAmount:0, slowWalk: false, interact: false, pickup: false,
    dropItem: false, nextWeapon: false, useItem: false, dodge: false, swapShoulder: false, leanLeft: false, leanRight: false,
    slot1:false, slot2:false, slot3:false, slot4:false, slot5:false, slot6:false, slot7:false,
    inventory:false,
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
    wheelBrake: a.wheelBrake || b.wheelBrake,
    sprint: a.sprint || b.sprint,
    sprintAmount: Math.max(Number(a.sprintAmount)||0, Number(b.sprintAmount)||0),
    reset: a.reset || b.reset,
    jump: a.jump || b.jump,
    pauseMenu: a.pauseMenu || b.pauseMenu,
    highBeams: a.highBeams || b.highBeams,
    towToggle: a.towToggle || b.towToggle,
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
    fire: a.fire || b.fire,
    aim: a.aim || b.aim,
    reload: a.reload || b.reload,
    shoot: a.shoot || b.shoot,
    pass: a.pass || b.pass,
    tackle: a.tackle || b.tackle,
    diveLeft:a.diveLeft||b.diveLeft,
    diveRight:a.diveRight||b.diveRight,
    primaryAbility:a.primaryAbility||b.primaryAbility,
    secondaryAbility:a.secondaryAbility||b.secondaryAbility,
    voice:a.voice||b.voice,
    crouch: a.crouch || b.crouch,
    crouchAmount: Math.max(Number(a.crouchAmount)||0, Number(b.crouchAmount)||0),
    slowWalk: a.slowWalk || b.slowWalk,
    interact: a.interact || b.interact,
    pickup: a.pickup || b.pickup,
    dropItem: a.dropItem || b.dropItem,
    nextWeapon: a.nextWeapon || b.nextWeapon,
    useItem: a.useItem || b.useItem,
    dodge: a.dodge || b.dodge,
    swapShoulder: a.swapShoulder || b.swapShoulder,
    leanLeft: a.leanLeft || b.leanLeft,
    leanRight: a.leanRight || b.leanRight,
    slot1:a.slot1||b.slot1, slot2:a.slot2||b.slot2, slot3:a.slot3||b.slot3, slot4:a.slot4||b.slot4,
    slot5:a.slot5||b.slot5, slot6:a.slot6||b.slot6, slot7:a.slot7||b.slot7,
    inventory:a.inventory||b.inventory,
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
    wheelBrake: anyDown(scheme.wheelBrake),
    sprint: anyDown(scheme.sprint),
    sprintAmount: anyDown(scheme.sprint) ? 1 : 0,
    reset: anyDown(scheme.reset),
    jump: anyDown(scheme.jump),
    pauseMenu: anyDown(scheme.pauseMenu),
    highBeams: anyDown(scheme.highBeams),
    towToggle: anyDown(scheme.towToggle),
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
    fire: anyDown(scheme.fire),
    aim: anyDown(scheme.aim),
    reload: anyDown(scheme.reload),
    shoot: anyDown(scheme.shoot),
    pass: anyDown(scheme.pass),
    tackle: anyDown(scheme.tackle),
    diveLeft:anyDown(scheme.diveLeft),
    diveRight:anyDown(scheme.diveRight),
    primaryAbility:anyDown(scheme.primaryAbility),
    secondaryAbility:anyDown(scheme.secondaryAbility),
    voice:anyDown(scheme.voice),
    crouch: anyDown(scheme.crouch),
    crouchAmount: anyDown(scheme.crouch) ? 1 : 0,
    slowWalk: anyDown(scheme.slowWalk),
    interact: anyDown(scheme.interact),
    pickup: anyDown(scheme.pickup),
    dropItem: anyDown(scheme.dropItem),
    nextWeapon: anyDown(scheme.nextWeapon),
    useItem: anyDown(scheme.useItem),
    dodge: anyDown(scheme.dodge),
    swapShoulder: anyDown(scheme.swapShoulder),
    leanLeft: anyDown(scheme.leanLeft),
    leanRight: anyDown(scheme.leanRight),
    slot1:anyDown(scheme.slot1), slot2:anyDown(scheme.slot2), slot3:anyDown(scheme.slot3),
    slot4:anyDown(scheme.slot4), slot5:anyDown(scheme.slot5), slot6:anyDown(scheme.slot6),
    slot7:anyDown(scheme.slot7),
    inventory:anyDown(scheme.inventory),
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
    wheelBrake: readGamepadPressed(scheme.wheelBrake, gp),
    sprint: readGamepadPressed(scheme.sprint, gp),
    sprintAmount: clamp01(Math.abs(readGamepadValue(scheme.sprint, gp))),
    reset: readGamepadPressed(scheme.reset, gp),
    jump: readGamepadPressed(scheme.jump, gp),
    pauseMenu: readGamepadPressed(scheme.pauseMenu, gp),
    highBeams: readGamepadPressed(scheme.highBeams, gp),
    towToggle: readGamepadPressed(scheme.towToggle, gp),
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
    fire: readGamepadPressed(scheme.fire, gp),
    aim: readGamepadPressed(scheme.aim, gp),
    reload: readGamepadPressed(scheme.reload, gp),
    shoot: readGamepadPressed(scheme.shoot, gp),
    pass: readGamepadPressed(scheme.pass, gp),
    tackle: readGamepadPressed(scheme.tackle, gp),
    diveLeft:readGamepadPressed(scheme.diveLeft,gp),
    diveRight:readGamepadPressed(scheme.diveRight,gp),
    primaryAbility:readGamepadPressed(scheme.primaryAbility,gp),
    secondaryAbility:readGamepadPressed(scheme.secondaryAbility,gp),
    voice:readGamepadPressed(scheme.voice,gp),
    crouch: readGamepadPressed(scheme.crouch, gp),
    crouchAmount: clamp01(Math.abs(readGamepadValue(scheme.crouch, gp))),
    slowWalk: readGamepadPressed(scheme.slowWalk, gp),
    interact: readGamepadPressed(scheme.interact, gp),
    pickup: readGamepadPressed(scheme.pickup, gp),
    dropItem: readGamepadPressed(scheme.dropItem, gp),
    nextWeapon: readGamepadPressed(scheme.nextWeapon, gp),
    useItem: readGamepadPressed(scheme.useItem, gp),
    dodge: readGamepadPressed(scheme.dodge, gp),
    swapShoulder: readGamepadPressed(scheme.swapShoulder, gp),
    leanLeft: readGamepadPressed(scheme.leanLeft, gp),
    leanRight: readGamepadPressed(scheme.leanRight, gp),
    slot1:readGamepadPressed(scheme.slot1, gp), slot2:readGamepadPressed(scheme.slot2, gp),
    slot3:readGamepadPressed(scheme.slot3, gp), slot4:readGamepadPressed(scheme.slot4, gp),
    slot5:readGamepadPressed(scheme.slot5, gp), slot6:readGamepadPressed(scheme.slot6, gp),
    slot7:readGamepadPressed(scheme.slot7, gp),
    inventory:readGamepadPressed(scheme.inventory, gp),
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
    wheelBrake: !!a.wheelBrake,
    // No dedicated touch button yet: the handbrake tap doubles as Sprint for
    // on-foot Pawns, which never read handbrake themselves.
    sprint: !!a.sprint || !!a.handbrake,
    sprintAmount: clamp01(Number(a.sprint != null ? a.sprint : a.handbrake) || 0),
    reset: !!a.reset,
    jump: !!a.jump,
    pauseMenu: !!a.pauseMenu,
    highBeams: !!a.highBeams,
    towToggle: !!a.towToggle,
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
    fire: !!a.fire,
    aim: !!a.aim,
    reload: !!a.reload,
    shoot: !!a.shoot,
    pass: !!a.pass,
    tackle: !!a.tackle,
    diveLeft:!!a.diveLeft,
    diveRight:!!a.diveRight,
    primaryAbility:!!a.primaryAbility,
    secondaryAbility:!!a.secondaryAbility,
    voice:!!a.voice,
    crouch: !!a.crouch,
    crouchAmount: clamp01(Number(a.crouch) || 0),
    slowWalk: !!a.slowWalk,
    interact: !!a.interact,
    pickup: !!a.pickup,
    dropItem: !!a.dropItem,
    nextWeapon: !!a.nextWeapon,
    useItem: !!a.useItem,
    dodge: !!a.dodge,
    swapShoulder: !!a.swapShoulder,
    leanLeft: !!a.leanLeft,
    leanRight: !!a.leanRight,
    slot1:!!a.slot1, slot2:!!a.slot2, slot3:!!a.slot3, slot4:!!a.slot4,
    slot5:!!a.slot5, slot6:!!a.slot6, slot7:!!a.slot7,
    inventory:!!a.inventory,
  };
}

// ------------------------------------------------ labels
// Mouse buttons travel through the keyboard scheme as synthetic codes so they
// share the existing rebinding UI instead of needing a parallel device type.
const MOUSE_CODE_LABELS = {Mouse0: 'Mouse L', Mouse1: 'Mouse M', Mouse2: 'Mouse R', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5'};
function keyLabel(code){
  if(!code) return '—';
  if(code.indexOf('Key') === 0) return code.slice(3);
  if(code.indexOf('Digit') === 0) return code.slice(5);
  if(code.indexOf('Mouse') === 0) return MOUSE_CODE_LABELS[code] || ('Mouse ' + code.slice(5));
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
  wheelBrake: {en: 'Aircraft wheel brake', it: 'Freno ruote aeromobile'},
  sprint: {en: 'Sprint / Run', it: 'Scatto / Corsa'},
  reset: {en: 'Reset car', it: 'Reset auto'},
  jump: {en: 'Jump', it: 'Salta'},
  pauseMenu: {en: 'Pause menu', it: 'Menu pausa'},
  highBeams: {en: 'Flash headlights', it: 'Lampeggia fari'},
  towToggle: {en: 'Attach / detach tow', it: 'Aggancia / sgancia traino'},
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
  fire: {en: 'Fire weapon', it: 'Spara'},
  aim: {en: 'Aim down sights', it: 'Mira'},
  reload: {en: 'Reload', it: 'Ricarica'},
  shoot: {en: 'Shoot ball', it: 'Tira'},
  pass: {en: 'Pass ball', it: 'Passa'},
  tackle: {en: 'Tackle', it: 'Contrasto'},
  diveLeft: {en: 'Goalkeeper dive left', it: 'Tuffo portiere a sinistra'},
  diveRight: {en: 'Goalkeeper dive right', it: 'Tuffo portiere a destra'},
  primaryAbility: {en: 'Animal primary ability', it: 'Abilita animale primaria'},
  secondaryAbility: {en: 'Animal secondary ability', it: 'Abilita animale secondaria'},
  voice: {en: 'Animal voice', it: 'Verso animale'},
  crouch: {en: 'Crouch / slide', it: 'Abbassati / scivolata'},
  slowWalk: {en: 'Walk slowly', it: 'Cammina piano'},
  interact: {en: 'Interact (doors, ladders, objects)', it: 'Interagisci (porte, scale, oggetti)'},
  pickup: {en: 'Pick up item', it: 'Raccogli oggetto'},
  dropItem: {en: 'Drop / throw weapon', it: 'Lascia / lancia arma'},
  nextWeapon: {en: 'Next weapon', it: 'Arma successiva'},
  useItem: {en: 'Use item from backpack', it: 'Usa oggetto dallo zaino'},
  dodge: {en: 'Slide / roll (double tap)', it: 'Scivolata / capriola (doppio tap)'},
  swapShoulder: {en: 'Swap weapon shoulder', it: 'Cambia spalla arma'},
  leanLeft: {en: 'Lean left', it: 'Sporgiti a sinistra'},
  leanRight: {en: 'Lean right', it: 'Sporgiti a destra'},
  slot1: {en: 'Slot 1 - Fists', it: 'Slot 1 - Mani nude'},
  slot2: {en: 'Slot 2 - Sidearm', it: 'Slot 2 - Arma leggera'},
  slot3: {en: 'Slot 3 - Primary', it: 'Slot 3 - Arma pesante'},
  slot4: {en: 'Slot 4 - Melee', it: 'Slot 4 - Arma bianca'},
  slot5: {en: 'Slot 5 - Bonus', it: 'Slot 5 - Bonus'},
  slot6: {en: 'Slot 6 - Flashbang', it: 'Slot 6 - Flashbang'},
  slot7: {en: 'Slot 7 - Grenade', it: 'Slot 7 - Granata'},
  inventory: {en: 'Weapon wheel (tap) / backpack (hold)', it: 'Ruota armi (tap) / zaino (tieni premuto)'},
  interact: {en: 'Use (tap) / pick up (hold)', it: 'Usa (tap) / raccogli (tieni premuto)'},
};

window.LK_RUNTIME_INPUT_ACTIONS = Object.freeze({
  CONFIG_VERSION,
  DEVICE_TYPES,
  SINGLE_INSTANCE,
  KEYBOARD_ACTIONS,
  GAMEPAD_ACTIONS,
  COMBAT_ACTIONS,
  ONFOOT_ACTIONS,
  ACTION_LABELS,
  GAMEPAD_BUTTON_LABELS,
  clone,
  UNSAFE_CODES,
  stripUnsafe,
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
