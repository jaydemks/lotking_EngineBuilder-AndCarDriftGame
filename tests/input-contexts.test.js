'use strict';

const assert = require('node:assert/strict');

global.window = global;
const listeners = new Map();
global.addEventListener = (type, handler) => {
  if(!listeners.has(type)) listeners.set(type, []);
  listeners.get(type).push(handler);
};
global.removeEventListener = () => {};
global.matchMedia = () => ({matches:false});
global.innerWidth = 1440;
global.innerHeight = 900;
global.localStorage = {
  data:new Map(),
  getItem(key){ return this.data.has(key) ? this.data.get(key) : null; },
  setItem(key, value){ this.data.set(key, String(value)); },
  removeItem(key){ this.data.delete(key); },
};

let visiblePads = [];
Object.defineProperty(global, 'navigator', {
  configurable:true,
  value:{
    userAgent:'Node input test',
    maxTouchPoints:0,
    getGamepads:() => visiblePads,
  },
});

require('../js/runtime/input/input-actions.js');
require('../js/runtime/input/player-action-router.js');
require('../js/runtime/input/input-devices.js');
require('../js/runtime/input/input-manager.js');

const ACT = global.LK_RUNTIME_INPUT_ACTIONS;
const ROUTER = global.LK_RUNTIME_PLAYER_ACTION_ROUTER;
assert.equal(ACT.CONFIG_VERSION, 15);
const defaults = ACT.defaultConfig();
assert.ok(defaults.contexts.vehicle, 'Vehicle context must remain available');
assert.ok(defaults.contexts.character, 'Character context must be available by default');
assert.deepEqual(defaults.contexts.character.schemes.keyboard.reset, [], 'Character Reset must be unbound');
assert.deepEqual(defaults.contexts.character.schemes.keyboard.jump, ['Space'], 'Character Jump must own Space');
assert.equal(defaults.contexts.character.schemes.gamepad.reset, null, 'Character Reset must be unbound on gamepad');
assert.equal(defaults.contexts.character.schemes.gamepad.jump.index, 0, 'Character Jump must own A/Cross');
assert.equal(defaults.contexts.character.schemes.gamepad.handbrake, null, 'Character must not inherit Vehicle Handbrake');
assert.deepEqual(defaults.contexts.character.schemes.keyboard.wheelBrake, [], 'Character must not inherit aircraft Wheel Brake');
assert.equal(defaults.contexts.character.schemes.gamepad.wheelBrake, null, 'Character must not inherit aircraft Wheel Brake on gamepad');
assert.deepEqual(defaults.contexts.vehicle.schemes.keyboard.wheelBrake, ['KeyK'], 'Vehicle Wheel Brake needs one remappable non-conflicting default');
assert.deepEqual(defaults.contexts.vehicle.schemes.keyboard.interact, ['KeyF'], 'the same Use key must exit a possessed Vehicle');
assert.deepEqual(defaults.contexts.vehicle.schemes.keyboard.highBeams, ['KeyL'], 'High Beams move away from Use instead of double-firing');
assert.equal(defaults.contexts.vehicle.schemes.gamepad.interact.index, 2, 'X/Square exits a possessed Vehicle');
assert.equal(defaults.contexts.vehicle.schemes.gamepad.highBeams.index, 14, 'Vehicle High Beams keep an independent pad binding');
assert.equal(defaults.contexts.vehicle.schemes.gamepad.legend, null, 'Legend yields its optional pad shortcut to High Beams');
assert.deepEqual(ACT.schemeConflicts(defaults.contexts.vehicle.schemes.keyboard, 'keyboard'), {}, 'Vehicle keyboard defaults remain conflict-free');
assert.deepEqual(ACT.schemeConflicts(defaults.contexts.vehicle.schemes.gamepad, 'gamepad'), {}, 'Vehicle gamepad defaults remain conflict-free');
const staleVehicle=ACT.defaultConfig();
staleVehicle.contexts.vehicle.schemes.keyboard.interact=[];
staleVehicle.contexts.vehicle.schemes.keyboard.highBeams=['KeyF'];
staleVehicle.contexts.vehicle.schemes.gamepad.interact=null;
staleVehicle.contexts.vehicle.schemes.gamepad.highBeams={type:'button',index:2};
staleVehicle.contexts.vehicle.schemes.gamepad.legend={type:'button',index:14};
const migratedVehicle=ACT.normalizeConfig(staleVehicle).contexts.vehicle.schemes;
assert.deepEqual(migratedVehicle.keyboard.interact,['KeyF'],'the former Vehicle default gains Exit without overwriting custom maps');
assert.deepEqual(migratedVehicle.keyboard.highBeams,['KeyL']);
assert.equal(migratedVehicle.gamepad.interact.index,2);
assert.equal(migratedVehicle.gamepad.highBeams.index,14);
assert.equal(migratedVehicle.gamepad.legend,null);
assert.equal(defaults.contexts.character.schemes.gamepad.highBeams, null, 'Character must not inherit Vehicle High Beams');
assert.equal(defaults.contexts.character.schemes.gamepad.interact.index, 2, 'X/Square must remain the Character Interact action');
assert.equal(defaults.contexts.character.schemes.gamepad.pickup, null, 'Pick Up stays on the Interact hold gesture');
assert.equal(defaults.contexts.character.schemes.gamepad.dodge, null, 'Dodge must not double-fire with Lean Right');
assert.equal(defaults.contexts.character.schemes.gamepad.swapShoulder.index, 12, 'D-pad Up must own Swap Shoulder');
assert.equal(defaults.contexts.character.schemes.gamepad.cameraMode.index, 11, 'R3 must remain exclusively Camera Mode');
assert.equal(defaults.contexts.character.schemes.gamepad.mute, null, 'Mute must not double-fire with Lean Left');
assert.equal(defaults.contexts.character.schemes.gamepad.legend, null, 'Legend must not double-fire with Drop Item');
assert.deepEqual(ACT.schemeConflicts(defaults.contexts.character.schemes.keyboard, 'keyboard'), {},
  'safe Soccer aliases must not appear as Character keyboard conflicts');
assert.deepEqual(ACT.schemeConflicts(defaults.contexts.character.schemes.gamepad, 'gamepad'), {},
  'the default Character gamepad scheme must have no simultaneous conflicts');
const intentionallyConflicting = JSON.parse(JSON.stringify(defaults.contexts.character.schemes.keyboard));
intentionallyConflicting.reload = intentionallyConflicting.interact.slice();
const realConflicts = ACT.schemeConflicts(intentionallyConflicting, 'keyboard');
assert.equal(realConflicts.reload, true, 'two simultaneous Character actions on F must be reported');
assert.equal(realConflicts.interact, true, 'the original owner of a collided binding must be reported too');

function resolvedButton(index){
  const pressed=Array.from({length:16},()=>({value:0,pressed:false}));
  pressed[index]={value:1,pressed:true};
  const source={
    axis:axis=>[0,0,0,0][axis]||0,
    button:button=>pressed[button]&&pressed[button].value||0,
    pressed:button=>!!(pressed[button]&&pressed[button].pressed),
  };
  return ACT.resolveGamepad(defaults.contexts.character.schemes.gamepad,source);
}

const analogueButtons=Array.from({length:16},()=>({value:0,pressed:false}));
analogueButtons[10]={value:.35,pressed:false};
analogueButtons[1]={value:.4,pressed:false};
const analogueDrive=ACT.resolveGamepad(defaults.contexts.character.schemes.gamepad,{
  axis:()=>0,button:index=>analogueButtons[index].value,pressed:index=>analogueButtons[index].pressed,
});
assert.equal(analogueDrive.sprintAmount,.35,'trigger/button pressure survives as a Sprint scalar');
assert.equal(analogueDrive.crouchAmount,.4,'trigger/button pressure survives as a Crouch scalar');

// One shared Character scheme, two possession-owned semantic profiles. The raw
// resolver sees both aliases; the router lets only the active Pawn verb out.
let rawButton=resolvedButton(0),soccerButton=ROUTER.filterDriveForPawn({pawnType:'soccer'},rawButton),characterButton=ROUTER.filterDriveForPawn({pawnType:'character'},rawButton);
assert.equal(rawButton.jump,true);assert.equal(rawButton.pass,true);
assert.equal(soccerButton.pass,true,'A/Cross must Pass for Soccer');
assert.equal(soccerButton.jump,false,'A/Cross must not Jump for Soccer');
assert.equal(characterButton.jump,true,'A/Cross must Jump for Character');
assert.equal(characterButton.pass,false,'A/Cross must not Pass for Character');

rawButton=resolvedButton(1);soccerButton=ROUTER.filterDriveForPawn({pawnType:'soccer'},rawButton);characterButton=ROUTER.filterDriveForPawn({pawnType:'animal'},rawButton);
assert.equal(soccerButton.tackle,true,'B/Circle must Tackle for Soccer');
assert.equal(soccerButton.crouch,false,'B/Circle must not Crouch for Soccer');
assert.equal(characterButton.crouch,true,'B/Circle must retain the on-foot Crouch verb');
assert.equal(characterButton.tackle,false,'Animals/Characters must never receive Soccer Tackle');

rawButton=resolvedButton(2);soccerButton=ROUTER.filterDriveForPawn({pawnType:'soccer'},rawButton);characterButton=ROUTER.filterDriveForPawn({pawnType:'character'},rawButton);
assert.equal(soccerButton.shoot,true,'X/Square must Shoot for Soccer');
assert.equal(soccerButton.interact,false,'X/Square must not Interact for Soccer');
assert.equal(soccerButton.pickup,false,'X/Square must not Pick Up for Soccer');
assert.equal(soccerButton.fire,false,'Soccer Shoot must never escape as firearm Fire');
assert.equal(characterButton.interact,true,'X/Square must Interact for Character');
assert.equal(characterButton.shoot,false,'X/Square must not Shoot a ball for Character');
assert.equal(characterButton.pickup,false,'Character Pick Up remains the Interact hold gesture');

rawButton=resolvedButton(7);soccerButton=ROUTER.filterDriveForPawn({pawnType:'soccer'},rawButton);characterButton=ROUTER.filterDriveForPawn({pawnType:'character'},rawButton);
assert.equal(soccerButton.shoot,true,'Fire may be consumed as a Soccer Shoot alias');
assert.equal(soccerButton.fire,false,'the Soccer Fire alias must be consumed at the Pawn boundary');
assert.equal(characterButton.fire,true);assert.equal(characterButton.shoot,false);

assert.equal(resolvedButton(11).cameraMode,true);assert.equal(resolvedButton(11).swapShoulder,false);
assert.equal(resolvedButton(12).swapShoulder,true);assert.equal(resolvedButton(12).cameraMode,false);
assert.equal(resolvedButton(4).leanLeft,true);assert.equal(resolvedButton(4).mute,false);
assert.equal(resolvedButton(5).leanRight,true);assert.equal(resolvedButton(5).dodge,false);
assert.equal(resolvedButton(14).dropItem,true);assert.equal(resolvedButton(14).legend,false);

const shortLivedV15=ACT.defaultConfig(),stalePad=shortLivedV15.contexts.character.schemes.gamepad;
stalePad.pickup={type:'button',index:2};
stalePad.dodge={type:'button',index:5};
stalePad.swapShoulder={type:'button',index:11};
stalePad.mute={type:'button',index:4};
stalePad.legend={type:'button',index:14};
const hardenedV15=ACT.normalizeConfig(shortLivedV15).contexts.character.schemes.gamepad;
assert.equal(hardenedV15.pickup,null,'persisted v15 defaults must release the duplicate Pick Up button');
assert.equal(hardenedV15.dodge,null,'persisted v15 defaults must release the duplicate Dodge button');
assert.equal(hardenedV15.swapShoulder.index,12,'persisted v15 defaults must move Swap Shoulder away from Camera');
assert.equal(hardenedV15.mute,null);assert.equal(hardenedV15.legend,null);
assert.deepEqual(ACT.schemeConflicts(hardenedV15,'gamepad'),{});

const buttons = Array.from({length:16}, () => ({value:0, pressed:false}));
buttons[0] = {value:1, pressed:true};   // Character Jump
buttons[7] = {value:.72, pressed:true}; // Vehicle throttle
const pad = {
  index:0,
  id:'Regression Gamepad',
  mapping:'standard',
  axes:[.55, -.82, .2, -.1],
  buttons,
};

const manager = global.LK_RUNTIME_INPUT_MANAGER.create({});
const config = ACT.defaultConfig();
config.autoAssign = true;
config.players = [
  {id:'player-1', device:'keyboard-1'},
  {id:'player-2', device:'gamepad-1'},
];
manager.setConfig(config);

// Chrome/WebKit may dispatch the connection event before getGamepads() returns
// the controller. The event snapshot must still make Player 2 usable.
const connect = (listeners.get('gamepadconnected') || [])[0];
assert.ok(connect, 'gamepadconnected listener must be installed');
connect({gamepad:pad});

let state = manager.describe();
assert.equal(state.players[0].deviceId, 'keyboard-1', 'Player 1 must not steal Player 2 configured gamepad');
assert.equal(state.players[1].deviceId, 'gamepad-1', 'Player 2 must receive the connected gamepad');
assert.equal(state.devices.find(device => device.id === 'gamepad-1').connected, true, 'event-connected gamepad must be visible immediately');

const character = manager.player(1).drive('character');
assert.ok(character.throttle > .7, 'Character forward movement must use left-stick Y');
assert.equal(character.brake, 0, 'forward stick must not also move the Character backward');
assert.equal(character.jump, true, 'Character Jump must use the A button');
assert.equal(character.reset, false, 'Character Jump must never alias vehicle Reset');

const vehicle = manager.player(1).drive('vehicle');
assert.equal(vehicle.throttle, .72, 'Vehicle throttle must remain on the right trigger');
assert.equal(vehicle.reset, false, 'Vehicle Reset must remain independent from Character Jump');

// Explicit reads are queries, not ownership changes. The possessed Pawn/router
// owns this context and unrelated HUD/camera reads cannot steal it.
const playerOne = manager.player(0);
playerOne.setContext('character');
assert.equal(playerOne.context(), 'character');
playerOne.drive('vehicle');
assert.equal(playerOne.context(), 'character', 'drive(context) must be read-only');

function dispatchKey(type, code){
  (listeners.get(type) || []).forEach(handler => handler({code, target:null, preventDefault(){}}));
}

dispatchKey('keydown', 'KeyR');
let keyboardCharacter = playerOne.drive('character');
assert.equal(keyboardCharacter.reload, true, 'R must reload in the Character context');
assert.equal(keyboardCharacter.reset, false, 'R must not reset a Character');
assert.equal(keyboardCharacter.jump, false, 'R must not jump');
assert.equal(playerOne.drive('vehicle').reset, true, 'the same physical R remains vehicle Reset in the vehicle context');
assert.equal(playerOne.context(), 'character', 'a vehicle query must not change possession ownership');
dispatchKey('keyup', 'KeyR');

dispatchKey('keydown', 'Space');
keyboardCharacter = playerOne.drive('character');
assert.equal(keyboardCharacter.jump, true, 'Space must resolve the dedicated Character Jump action');
assert.equal(keyboardCharacter.reset, false, 'Space must not resolve Character Reset');
dispatchKey('keyup', 'Space');

dispatchKey('keydown', 'KeyB');
let keyboardVehicle = playerOne.drive('vehicle');
assert.equal(keyboardVehicle.radioPrev, true, 'B remains Radio Previous in Vehicle context');
assert.equal(keyboardVehicle.wheelBrake, false, 'B must never double as aircraft Wheel Brake');
dispatchKey('keyup', 'KeyB');
dispatchKey('keydown', 'KeyK');
keyboardVehicle = playerOne.drive('vehicle');
assert.equal(keyboardVehicle.wheelBrake, true, 'the mapped K action applies aircraft Wheel Brake');
assert.equal(keyboardVehicle.radioPrev, false, 'Wheel Brake must not also change radio station');
dispatchKey('keyup', 'KeyK');

// v14 stored Jump in Character Reset. Preserve authored keys/buttons and
// split-device overrides instead of silently replacing them with v15 defaults.
const legacy = ACT.defaultConfig();
legacy.version = 14;
legacy.contexts.character.schemes.keyboard.reset = ['KeyJ'];
delete legacy.contexts.character.schemes.keyboard.jump;
legacy.contexts.character.schemes.gamepad.reset = {type:'button', index:8};
delete legacy.contexts.character.schemes.gamepad.jump;
legacy.devices.push({id:'keyboard-2', type:'keyboard', slot:2});
legacy.devices.push({id:'gamepad-2', type:'gamepad', slot:2});
legacy.overrides = {
  'keyboard-2':{character:{reset:['KeyK']}},
  'gamepad-2':{character:{reset:{type:'button', index:9}}},
};
const migrated = ACT.normalizeConfig(legacy);
assert.deepEqual(migrated.contexts.character.schemes.keyboard.jump, ['KeyJ']);
assert.deepEqual(migrated.contexts.character.schemes.keyboard.reset, []);
assert.equal(migrated.contexts.character.schemes.gamepad.jump.index, 8);
assert.equal(migrated.contexts.character.schemes.gamepad.reset, null);
assert.deepEqual(migrated.overrides['keyboard-2'].character.jump, ['KeyK']);
assert.deepEqual(migrated.overrides['keyboard-2'].character.reset, []);
assert.equal(migrated.overrides['gamepad-2'].character.jump.index, 9);
assert.equal(migrated.overrides['gamepad-2'].character.reset, null);

const partialLegacy = ACT.normalizeConfig({
  version:14,
  contexts:{vehicle:legacy.contexts.vehicle},
});
assert.deepEqual(partialLegacy.contexts.character.schemes.keyboard.jump, ['Space'],
  'a partial v14 project must inherit the new Character Jump default');
assert.equal(partialLegacy.contexts.character.schemes.gamepad.jump.index, 0);
assert.deepEqual(partialLegacy.contexts.character.schemes.keyboard.reset, []);

// Old local overrides had no version field. They need the same migration as a
// project config, while the caller-owned snapshot must remain untouched.
const localOverride = {
  contexts:{character:{schemes:{
    keyboard:{reset:['KeyL']},
    gamepad:{reset:{type:'button', index:4}},
  }}},
};
const merged = ACT.mergeConfig(ACT.defaultConfig(), localOverride);
assert.deepEqual(merged.contexts.character.schemes.keyboard.jump, ['KeyL']);
assert.deepEqual(merged.contexts.character.schemes.keyboard.reset, []);
assert.equal(merged.contexts.character.schemes.gamepad.jump.index, 4);
assert.equal(merged.contexts.character.schemes.gamepad.reset, null);
assert.deepEqual(localOverride.contexts.character.schemes.keyboard.reset, ['KeyL'], 'migration must not mutate persisted input');

visiblePads = [pad];
manager.update();
state = manager.describe();
assert.equal(state.players[0].deviceId, 'keyboard-1');
assert.equal(state.players[1].deviceId, 'gamepad-1');

const jumpButtons = Array.from({length:16}, () => ({value:0, pressed:false}));
jumpButtons[0] = {value:1, pressed:true};
visiblePads = [{index:0, id:'Jump-only Gamepad', mapping:'standard', axes:[0,0,0,0], buttons:jumpButtons}];
const jumpManager = global.LK_RUNTIME_INPUT_MANAGER.create({});
jumpManager.setConfig(ACT.defaultConfig());
jumpManager.update();
assert.equal(jumpManager.describe().players[0].deviceId, 'gamepad-1',
  'a context action such as Jump must participate in last-device auto-assignment');

console.log('input-contexts.test.js: all assertions passed');
