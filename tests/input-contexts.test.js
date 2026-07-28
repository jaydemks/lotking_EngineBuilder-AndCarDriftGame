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
require('../js/runtime/input/input-devices.js');
require('../js/runtime/input/input-manager.js');

const ACT = global.LK_RUNTIME_INPUT_ACTIONS;
assert.equal(ACT.CONFIG_VERSION, 13);
const defaults = ACT.defaultConfig();
assert.ok(defaults.contexts.vehicle, 'Vehicle context must remain available');
assert.ok(defaults.contexts.character, 'Character context must be available by default');

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
assert.equal(character.reset, true, 'Character Jump must use the A button');

const vehicle = manager.player(1).drive('vehicle');
assert.equal(vehicle.throttle, .72, 'Vehicle throttle must remain on the right trigger');
assert.equal(vehicle.reset, false, 'Vehicle Reset must remain independent from Character Jump');

visiblePads = [pad];
manager.update();
state = manager.describe();
assert.equal(state.players[0].deviceId, 'keyboard-1');
assert.equal(state.players[1].deviceId, 'gamepad-1');

console.log('input-contexts.test.js: all assertions passed');
