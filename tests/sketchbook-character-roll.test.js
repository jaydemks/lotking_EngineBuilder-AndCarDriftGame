'use strict';

/* =========================================================
   DollBody advanced character: the roll.

   The source state machine already rolled out of a hard landing. It had no
   deliberate roll at all - a double tap of Dodge did nothing - and stepping out
   of a moving vehicle left the character sliding upright at driving speed.

   All three are now the SAME move, entered through one function, so they carry
   the body the same way, use the clip the animation dropdown already offers
   (`drop_running_roll`) and raise the same events. This file asserts each
   trigger, that the roll owns the body while it lasts, and that it ends.

   HOW THIS FILE IS ORGANISED
     01 harness    THREE, CANNON, a ground plane and a real Pawn
     02 dodge      two taps roll, one tap does not
     03 vehicle    leaving something moving rolls out of it
     04 landing    a hard landing still rolls, through the same path
     05 contract   the roll carries the body, then gives it back
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');
const CANNON = require('cannon');

// ================================================================= 01 harness

global.window = global;
global.THREE = THREE;
global.CANNON = CANNON;
global.CustomEvent = class { constructor(t, i){ this.type = t; this.detail = (i || {}).detail || {}; } };
const listeners = {};
global.addEventListener = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
global.removeEventListener = () => {};
const events = [];
global.dispatchEvent = e => { events.push(e.detail); (listeners[e.type] || []).forEach(f => f(e)); return true; };

require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/input/input-actions.js');
require('../js/runtime/sketchbook-pawns.js');

const RUNTIME = global.LK_RUNTIME_SKETCHBOOK_PAWNS;

function test(name, run){
  events.length = 0;
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
function saw(type){ return events.filter(detail => detail && detail.type === type); }

function world(){
  const w = new CANNON.World();
  w.gravity.set(0, -9.82, 0);
  const ground = new CANNON.Body({mass:0});
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  w.addBody(ground);
  return w;
}
function game(){
  const records = [];
  return {
    pawns:{
      register(p){ records.push(p); return p; }, unregister(){}, get(){ return null; },
      list(){ return records; }, getByPlayerId(){ return null; }, firstAvailablePlayerId(){ return 1; },
      claimPlayerSlot(p, id){ p.playerId = id; p.possessed = true; return true; },
      releasePlayerSlot(p){ p.playerId = null; p.possessed = false; return true; },
    },
    systems:{physics:{raw:{world:world()}}}, state:{}, world:{registry:[]},
  };
}
function character(GAME, at){
  const owner = new THREE.Group();
  owner.userData.logicInstanceId = 'roll-character';
  const pawn = RUNTIME.createLogic(GAME, owner, {
    // Possessed: entering a vehicle is a possessed-player verb.
    type:'advanced-character', playerId:1, possessed:true,
    spawn:{x:(at && at.x) || 0, y:(at && at.y) || 0, z:(at && at.z) || 0},
    entry:{cooldown:0, choreography:{enabled:false}},
  }, {});
  pawn.start();
  return pawn;
}
/** Drives frames with an explicit command, the way a Logic graph does. */
function drive(pawn, command, frames){
  for(let i = 0; i < (frames || 1); i++){
    pawn.control = Object.assign({}, command || {});
    pawn.beforePhysics(1 / 60);
    pawn.afterPhysics(1 / 60);
  }
}

// =================================================================== 02 dodge

test('two taps of Dodge roll, and the roll uses the clip the dropdown offers', () => {
  const GAME = game();
  const pawn = character(GAME);
  pawn.state.grounded = true;
  drive(pawn, {dodge:true}, 1);
  drive(pawn, {dodge:false}, 1);
  drive(pawn, {dodge:true}, 1);
  assert.equal(pawn.state.locomotion, 'drop_running_roll', 'the roll plays the source running drop roll');
  const rolls = saw('OnCharacterRoll');
  assert.equal(rolls.length, 1);
  assert.equal(rolls[0].reason, 'dodge');
  assert.ok(RUNTIME.rollActive(pawn), 'the roll owns the body');
});

test('a single Dodge tap does nothing', () => {
  const GAME = game();
  const pawn = character(GAME);
  pawn.state.grounded = true;
  drive(pawn, {dodge:true}, 1);
  drive(pawn, {dodge:false}, 40);
  assert.equal(saw('OnCharacterRoll').length, 0, 'one tap is not a gesture');
  assert.equal(RUNTIME.rollActive(pawn), false);
});

test('two taps too far apart do not roll', () => {
  const GAME = game();
  const pawn = character(GAME);
  pawn.state.grounded = true;
  drive(pawn, {dodge:true}, 1);
  drive(pawn, {dodge:false}, 40);       // well past the window
  drive(pawn, {dodge:true}, 1);
  assert.equal(saw('OnCharacterRoll').length, 0);
});

// ================================================================= 03 vehicle

test('leaving a moving vehicle rolls out of it', () => {
  const GAME = game();
  const owner = new THREE.Group();
  owner.userData.logicInstanceId = 'roll-car';
  const seat = new THREE.Group();
  seat.name = 'driver_seat'; seat.position.set(0, .5, 0);
  seat.userData = {data:'seat', seat_type:'driver'};
  owner.add(seat);
  owner.updateMatrixWorld(true);
  const car = RUNTIME.createLogic(GAME, owner, {type:'car', playerId:null, possessed:false, spawn:{x:0, y:0, z:0},
    entry:{radius:6, cooldown:0, maxExitSpeed:60, choreography:{enabled:false}}}, {});
  car.start();
  const pawn = character(GAME, {x:1, y:0, z:0});
  pawn.entryCooldown = car.entryCooldown = 0;
  assert.equal(pawn.tryEnterNearestVehicle('driver'), true, 'the character gets in');
  assert.equal(pawn.inVehicle, car);
  // Driving speed, then step out.
  car.body.velocity.set(0, 0, 9);
  pawn.entryCooldown = car.entryCooldown = 0;
  events.length = 0;
  assert.equal(pawn.exitSeat(true), true);
  const rolls = saw('OnCharacterRoll');
  assert.equal(rolls.length, 1, 'the exit at speed rolls');
  assert.equal(rolls[0].reason, 'vehicle-exit');
  assert.ok(rolls[0].speed >= RUNTIME.EXIT_ROLL_SPEED);
});

test('stepping out of a parked vehicle does not roll', () => {
  const GAME = game();
  const owner = new THREE.Group();
  owner.userData.logicInstanceId = 'parked-car';
  const seat = new THREE.Group();
  seat.name = 'driver_seat'; seat.position.set(0, .5, 0);
  seat.userData = {data:'seat', seat_type:'driver'};
  owner.add(seat);
  owner.updateMatrixWorld(true);
  const car = RUNTIME.createLogic(GAME, owner, {type:'car', playerId:null, possessed:false, spawn:{x:0, y:0, z:0},
    entry:{radius:6, cooldown:0, choreography:{enabled:false}}}, {});
  car.start();
  const pawn = character(GAME, {x:1, y:0, z:0});
  pawn.entryCooldown = car.entryCooldown = 0;
  pawn.tryEnterNearestVehicle('driver');
  car.body.velocity.set(0, 0, 0);
  pawn.entryCooldown = car.entryCooldown = 0;
  events.length = 0;
  pawn.exitSeat(true);
  assert.equal(saw('OnCharacterRoll').length, 0, 'a parked exit is an ordinary stand');
});

// ================================================================= 04 landing

test('a hard landing still rolls, through the same entry point', () => {
  const GAME = game();
  const pawn = character(GAME, {x:0, y:8, z:0});
  // Falling fast with ground speed: the source condition for a running drop roll.
  pawn.state.grounded = false;
  pawn.state.airTime = 1.2;
  pawn.state.fallSpeed = -11;
  pawn.state.speed = 5;
  pawn.body.velocity.set(0, -11, 5);
  pawn.groundGrace = .1;                       // report ground contact this frame
  pawn.beforePhysics(1 / 60);
  const rolls = saw('OnCharacterRoll');
  assert.equal(rolls.length, 1, 'the landing rolls');
  assert.equal(rolls[0].reason, 'landing');
  assert.equal(pawn.state.locomotion, 'drop_running_roll');
});

// ================================================================ 05 contract

test('the roll carries the body and then gives it back', () => {
  const GAME = game();
  const pawn = character(GAME);
  pawn.state.grounded = true;
  pawn.state.heading = 0;                      // facing +Z
  drive(pawn, {dodge:true}, 1);
  drive(pawn, {dodge:false}, 1);
  drive(pawn, {dodge:true}, 1);
  assert.ok(RUNTIME.rollActive(pawn));
  const carried = pawn.body.velocity.z;
  assert.ok(carried > 3, 'the roll moves the character, it is not just a clip: ' + carried.toFixed(2));
  // Steering the other way must NOT cancel the roll mid-move.
  drive(pawn, {throttle:0, brake:1}, 4);
  assert.ok(pawn.body.velocity.z > 1, 'the roll owns the body while it lasts');
  let guard = 0;
  while(RUNTIME.rollActive(pawn) && guard++ < 200) drive(pawn, {}, 1);
  assert.ok(guard < 200, 'the roll ends');
  assert.equal(saw('OnCharacterRollFinished').length, 1);
});

test('a character in a vehicle or mid-transition cannot be made to roll', () => {
  const GAME = game();
  const pawn = character(GAME);
  pawn.inVehicle = {};
  assert.equal(RUNTIME.beginCharacterRoll(pawn, {reason:'dodge'}), false);
  pawn.inVehicle = null;
  pawn.entryTransition = {phase:'enter'};
  assert.equal(RUNTIME.beginCharacterRoll(pawn, {reason:'dodge'}), false);
  pawn.entryTransition = null;
  assert.equal(RUNTIME.beginCharacterRoll(pawn, {reason:'dodge'}), true);
  assert.equal(RUNTIME.beginCharacterRoll(pawn, {reason:'dodge'}), false, 'a roll does not restart itself');
});

console.log('\nDollBody character roll tests passed');
