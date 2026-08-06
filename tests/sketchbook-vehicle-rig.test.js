'use strict';

/* =========================================================
   DollBody vehicle rig: doors, propellers, control surfaces, scale.

   Every moving part of a bundled vehicle is driven from the SHAPE of its own
   mesh rather than from a fixed axis or from its position in the scan order.
   This file drives the real runtime against rigs built to the same shape as the
   bundled GLBs and asserts the four things that were wrong:

     - a door swung into the cabin instead of out of it;
     - the propeller/rotor mount was spun as if it were the blade, so the whole
       assembly tumbled on the mount's axis;
     - the wing and tail mounts were deflected as if they were the flaps, and
       the left/right pair came from array parity rather than from the wing;
     - the vehicles rendered at their small source scale next to a 1.8 m
       character, and the raycast wheel radius could not follow a scaled model.

   HOW THIS FILE IS ORGANISED
     01 harness         window/THREE/CANNON stubs and rig builders
     02 doors           swing direction, placement, author override
     03 rotors          which node spins, and about which axis
     04 control surfaces which node deflects, about which axis, and which way
     05 scale           metre-scale fit and a wheel radius that follows it
     06 world sweep     the metadata refresh must be a no-op when nothing changed
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');
const CANNON = require('cannon');

// ================================================================= 01 harness

global.window = global;
global.THREE = THREE;
global.CANNON = CANNON;
global.CustomEvent = class CustomEvent {
  constructor(type, init){ this.type = type; this.detail = (init || {}).detail || {}; }
};
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.dispatchEvent = () => true;

require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/input/input-actions.js');
require('../js/runtime/sketchbook-pawns.js');
require('../js/logic/logic-templates-sketchbook.js');

const RUNTIME = global.LK_RUNTIME_SKETCHBOOK_PAWNS;
const PACK = global.LK_LOGIC_TEMPLATES_SKETCHBOOK;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

function fakeGame(){
  const records = [];
  const world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  return {
    pawns:{
      register(pawn){ records.push(pawn); return pawn; }, unregister(){}, get(){ return null; },
      list(){ return records; }, getByPlayerId(){ return null; }, firstAvailablePlayerId(){ return 1; },
      claimPlayerSlot(pawn, id){ pawn.playerId = id; pawn.possessed = true; return true; },
      releasePlayerSlot(pawn){ pawn.playerId = null; pawn.possessed = false; return true; },
    },
    systems:{physics:{raw:{world}}}, state:{}, world:{registry:[]},
  };
}
/** A box mesh whose geometry is centred on `centre` in the node's own frame, so
 *  the node origin is the hinge and the panel hangs off it exactly like the
 *  bundled door meshes do. */
function panel(name, size, centre){
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
  geometry.translate(centre[0], centre[1], centre[2]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
}
/** The bundled car rig: +X is the vehicle's left, +Z is forward, and each door
 *  is front-hinged with its panel extending backwards from the hinge. */
function carRig(){
  const owner = new THREE.Group();
  owner.userData.logicInstanceId = 'rig-car';
  const leftDoor = panel('door_1', [.14, .42, .55], [-.04, 0, -.28]);
  leftDoor.position.set(.61, .1, .38);
  const rightDoor = panel('door_2', [.14, .42, .55], [.04, 0, -.28]);
  rightDoor.position.set(-.61, .1, .38);
  const seatFor = (name, x, doorName, type) => {
    const seat = new THREE.Group();
    seat.name = name; seat.position.set(x, .05, .09);
    seat.userData = {data:'seat', seat_type:type, door_object:doorName};
    return seat;
  };
  const wheel = (name, x, z, steering) => {
    const geometry = new THREE.CylinderGeometry(.235, .235, .15, 12);
    geometry.rotateZ(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = name; mesh.position.set(x, -.12, z);
    mesh.userData = {data:'wheel', steering:steering ? 'true' : undefined, drive:z > 0 ? 'fwd' : 'rwd'};
    return mesh;
  };
  owner.add(leftDoor, rightDoor, seatFor('seat_1', .25, 'door_1', 'driver'), seatFor('seat_2', -.25, 'door_2', 'passenger'),
    wheel('wheel_fl', .48, .86, true), wheel('wheel_fr', -.48, .86, true), wheel('wheel_rl', .48, -.79, false), wheel('wheel_rr', -.48, -.79, false));
  owner.updateMatrixWorld(true);
  return owner;
}
/** The bundled airplane rig: propeller and every control surface sits on a
 *  same-named `*_parent` mount whose local axes differ from the part's. */
function airplaneRig(){
  const owner = new THREE.Group();
  owner.userData.logicInstanceId = 'rig-airplane';
  const disc = () => {
    const geometry = new THREE.BoxGeometry(.1, .14, .9);
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  };
  const rotorParent = new THREE.Group();
  rotorParent.name = 'rotor_parent';
  rotorParent.position.set(0, .19, .77);
  const rotor = disc();
  rotor.name = 'rotor';
  rotor.userData = {data:'rotor'};
  rotor.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  rotorParent.add(rotor);
  // The bundled rig gives the plate a 120-degree rest rotation and cancels it on
  // the mount, so the surface ends up axis aligned in the aircraft while its own
  // local axes are nothing like the mount's. That combination is exactly what a
  // parent-frame rotation gets wrong, so it is reproduced here rather than
  // simplified away: span is local X (0.77), thickness local Y, chord local Z.
  const PLATE_REST = new THREE.Quaternion(.5, -.5, .5, .5);
  const surface = (name, tag, x, side) => {
    const mount = new THREE.Group();
    mount.name = name + '_parent';
    mount.position.set(x, .17, -.18);
    mount.quaternion.copy(PLATE_REST).invert();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(.77, .06, .11), new THREE.MeshBasicMaterial());
    plate.name = name;
    plate.quaternion.copy(PLATE_REST);
    plate.userData = side ? {data:tag, side} : {data:tag};
    mount.add(plate);
    return {mount, plate};
  };
  const aileronL = surface('aileron.L', 'aileron', 1.25, 'left');
  const aileronR = surface('aileron.R', 'aileron', -1.25, 'right');
  const elevator = surface('elevator.L', 'elevator', .44, null);
  const rudder = surface('rudder', 'rudder', 0, null);
  owner.add(rotorParent, aileronL.mount, aileronR.mount, elevator.mount, rudder.mount);
  owner.updateMatrixWorld(true);
  return {owner, rotorParent, rotor, aileronL, aileronR, elevator, rudder};
}
function makeVehicle(GAME, owner, config){
  const pawn = RUNTIME.createLogic(GAME, owner, Object.assign({playerId:null, possessed:false, spawn:{x:0, y:0, z:0}}, config), {});
  pawn.start();
  return pawn;
}
/** The world-space direction a part's own `axis` points in. A part turns about
 *  one of its OWN axes, so this is what decides whether a propeller spins on its
 *  shaft or tumbles across the fuselage. */
function worldAxis(node, axis){
  node.updateMatrixWorld(true);
  return new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0)
    .applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()));
}
/** How far, and about which world axis, a part actually turned away from rest. */
function turnFromRest(node){
  const base = node.userData.sketchbookBaseQuaternion;
  const rest = new THREE.Quaternion(base.x, base.y, base.z, base.w);
  node.updateMatrixWorld(true);
  const now = node.getWorldQuaternion(new THREE.Quaternion());
  const parent = node.parent ? node.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  const restWorld = parent.clone().multiply(rest);
  const delta = now.clone().multiply(restWorld.invert());
  const angle = 2 * Math.acos(Math.min(1, Math.abs(delta.w)));
  const axis = new THREE.Vector3(delta.x, delta.y, delta.z);
  if(axis.lengthSq() > 1e-12) axis.normalize();
  if(delta.w < 0) axis.negate();
  return {angle, axis};
}
/** Vertical travel of a plate's trailing edge in world space: the honest test of
 *  whether a flap went up or down. */
function trailingEdgeLift(node){
  const box = RUNTIME.localGeometryBox(node);
  const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const chord = size.x < size.z ? 'x' : 'z';          // the chord, never the span
  const tip = centre.clone(); tip[chord] += size[chord];
  node.updateMatrixWorld(true);
  const deflected = node.localToWorld(tip.clone());
  const base = node.userData.sketchbookBaseQuaternion, held = node.quaternion.clone();
  node.quaternion.set(base.x, base.y, base.z, base.w);
  node.updateMatrixWorld(true);
  const rest = node.localToWorld(tip.clone());
  node.quaternion.copy(held);
  node.updateMatrixWorld(true);
  return deflected.y - rest.y;
}

test('Normal Blender rig aliases resolve through the shared vehicle runtime', () => {
  const owner = new THREE.Group();
  const wheel = new THREE.Group();
  wheel.name = 'normal-front-wheel';
  wheel.userData = {lkRigRole:'wheel', lkSteering:true, lkDrive:'fwd', lkAxis:'z'};
  const rotor = new THREE.Group();
  rotor.name = 'normal-propeller-pivot';
  rotor.userData = {lkRigRole:'rotor', lkAxis:'y'};
  const leftAileron = new THREE.Group();
  leftAileron.name = 'normal-left-flap';
  leftAileron.position.x = 2;
  leftAileron.userData = {lkRigRole:'aileron', lkSide:'left', lkAxis:'z'};
  const door = new THREE.Group(); door.name = 'normal-driver-door';
  const entry = new THREE.Group(); entry.name = 'normal-driver-entry';
  const seat = new THREE.Group();
  seat.name = 'normal-driver-seat';
  seat.userData = {lkRigRole:'seat', lkSeatType:'driver', lkDoorObject:door.name, lkEntryPoints:entry.name};
  const collision = new THREE.Group();
  collision.name = 'normal-collision'; collision.userData = {lkRigRole:'collision', shape:'box'};
  owner.add(wheel, rotor, leftAileron, door, entry, seat, collision);
  owner.updateMatrixWorld(true);

  const parts = RUNTIME.scanSourceParts({owner});
  assert.equal(parts.wheels[0], wheel);
  assert.equal(parts.rotors[0], rotor);
  assert.equal(parts.ailerons[0], leftAileron);
  assert.equal(parts.colliders[0], collision);
  assert.equal(parts.seats[0].type, 'driver');
  assert.equal(parts.seats[0].door.node, door);
  assert.equal(parts.seats[0].entryPoints[0], entry);
  assert.equal(RUNTIME.spinAxis(wheel), 'z');
  assert.equal(RUNTIME.hingeAxis(leftAileron), 'z');
  assert.equal(RUNTIME.surfaceSideSign(owner, leftAileron), 1);
});

// =================================================================== 02 doors

test('a front-hinged door swings out of the cabin, not into it', () => {
  const GAME = fakeGame();
  const owner = carRig();
  const car = makeVehicle(GAME, owner, {type:'car'});
  const seats = car.parts.seats;
  assert.equal(seats.length, 2, 'both seats are found');
  const doors = new Map(seats.map(seat => [seat.door.node.name, seat.door]));
  // Turning by `swing * angle` about Y has to move the panel's free end AWAY
  // from the centreline. Measure it rather than restating the sign rule.
  doors.forEach((door, name) => {
    const node = door.node;
    const freeEnd = new THREE.Vector3(0, 0, -.55);
    node.updateMatrixWorld(true);
    const closed = node.localToWorld(freeEnd.clone());
    // Open it the way the runtime does, so the test exercises the real path.
    door.rotation = .9; door.target = .9; door.hold = 1;
    car.afterPhysics(1 / 60);
    node.updateMatrixWorld(true);
    const open = node.localToWorld(freeEnd.clone());
    const outward = Math.sign(node.position.x);
    assert.ok((open.x - closed.x) * outward > .1,
      name + ' must swing outward: moved ' + (open.x - closed.x).toFixed(3) + ' on the ' + (outward > 0 ? 'left' : 'right') + ' side');
    assert.ok(Math.abs(open.x) > Math.abs(closed.x), name + ' must end further from the centreline than it started');
  });
  car.dispose();
});

test('the door placement that names the animation is separate from the swing', () => {
  const GAME = fakeGame();
  const car = makeVehicle(GAME, carRig(), {type:'car'});
  const left = car.parts.seats.find(seat => seat.door.node.name === 'door_1');
  const right = car.parts.seats.find(seat => seat.door.node.name === 'door_2');
  // `side` reports which half of the vehicle the door is on and is unchanged;
  // `swing` is the opening direction and is the opposite sign for these rigs.
  assert.equal(left.door.side, 1);
  assert.equal(right.door.side, -1);
  assert.equal(left.door.swing, -left.door.side);
  assert.equal(right.door.swing, -right.door.side);
  car.dispose();
});

test('a model rigged the other way round is flipped by one authored field', () => {
  const GAME = fakeGame();
  const car = makeVehicle(GAME, carRig(), {type:'car', interaction:{doorSwingDirection:-1}});
  car.parts.seats.forEach(seat => assert.equal(seat.door.swing, seat.door.side, 'the override inverts every door together'));
  car.dispose();
});

test('a rear-hinged door on the same side swings the other way', () => {
  const GAME = fakeGame();
  const owner = carRig();
  // Same side, same node origin, panel extending FORWARD from the hinge.
  const rear = owner.getObjectByName('door_1');
  rear.geometry.translate(0, 0, .56);
  rear.geometry.computeBoundingBox();
  const car = makeVehicle(GAME, owner, {type:'car'});
  const door = car.parts.seats.find(seat => seat.door.node.name === 'door_1').door;
  assert.equal(door.side, 1, 'it is still the left door');
  assert.equal(door.swing, 1, 'but it opens the other way, because the panel is ahead of the hinge');
  car.dispose();
});

// ================================================================== 03 rotors

test('the propeller spins, and its mount is not mistaken for a blade', () => {
  const GAME = fakeGame();
  const rig = airplaneRig();
  const plane = makeVehicle(GAME, rig.owner, {type:'airplane'});
  assert.deepEqual(plane.parts.rotors.map(node => node.name), ['rotor'],
    'rotor_parent is a mount: spinning it tumbles the whole propeller assembly');
  plane.dispose();
});

test('a rotor spins about the axis it is flat along, whatever that axis is', () => {
  const GAME = fakeGame();
  const rig = airplaneRig();
  const plane = makeVehicle(GAME, rig.owner, {type:'airplane'});
  // Flat along local X, so local X is the shaft. The mount turns that shaft to
  // point along the fuselage, which is where a propeller shaft points - and the
  // spin has to follow it there, whatever the rest rotation of the node is.
  assert.equal(RUNTIME.spinAxis(rig.rotor), 'x');
  const shaft = worldAxis(rig.rotor, 'x').normalize();
  assert.ok(Math.abs(shaft.z) > .9, 'a propeller shaft points along the fuselage, not across it: ' + shaft.toArray());
  RUNTIME.spinParts(plane.parts.rotors, 1 / 60, 12);
  const turn = turnFromRest(rig.rotor);
  assert.ok(turn.angle > 1e-4, 'the propeller turned');
  assert.ok(Math.abs(turn.axis.dot(shaft)) > .999,
    'and it turned about the shaft, not about the parent axis an Euler component would have used: ' + turn.axis.toArray());
  plane.dispose();
});

test('a vertical rotor disc spins about the vertical, and a tail rotor across it', () => {
  const owner = new THREE.Group();
  // Main rotor: a wide flat disc lying in the horizontal plane, thin in Y.
  const main = new THREE.Mesh(new THREE.BoxGeometry(3.9, .07, 3.9), new THREE.MeshBasicMaterial());
  main.name = 'main_rotor'; main.userData = {data:'rotor'};
  // Tail rotor: a small disc standing on edge, thin in X.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(.06, .77, .77), new THREE.MeshBasicMaterial());
  tail.name = 'tail_rotor'; tail.userData = {data:'rotor'}; tail.position.set(.25, .5, -1.6);
  owner.add(main, tail);
  owner.updateMatrixWorld(true);
  const GAME = fakeGame();
  const heli = makeVehicle(GAME, owner, {type:'helicopter'});
  RUNTIME.spinParts(heli.parts.rotors, 1 / 60, 12);
  const mainTurn = turnFromRest(main), tailTurn = turnFromRest(tail);
  assert.ok(mainTurn.angle > 1e-4 && tailTurn.angle > 1e-4, 'both rotors turned');
  assert.ok(Math.abs(mainTurn.axis.y) > .999, 'a main rotor turns about the vertical: ' + mainTurn.axis.toArray());
  assert.ok(Math.abs(tailTurn.axis.x) > .999, 'a tail rotor turns about the lateral axis: ' + tailTurn.axis.toArray());
  heli.dispose();
});

// ========================================================= 04 control surfaces

test('the wing and tail mounts are not deflected as if they were the flaps', () => {
  const GAME = fakeGame();
  const rig = airplaneRig();
  const plane = makeVehicle(GAME, rig.owner, {type:'airplane'});
  assert.deepEqual(plane.parts.ailerons.map(node => node.name).sort(), ['aileron.L', 'aileron.R']);
  assert.deepEqual(plane.parts.elevators.map(node => node.name), ['elevator.L']);
  assert.deepEqual(plane.parts.rudders.map(node => node.name), ['rudder']);
  plane.dispose();
});

test('a control surface hinges about its span, so the flap moves and the wing does not', () => {
  const GAME = fakeGame();
  const rig = airplaneRig();
  const plane = makeVehicle(GAME, rig.owner, {type:'airplane'});
  const mountRotation = rig.aileronL.mount.quaternion.clone();
  const span = worldAxis(rig.aileronL.plate, RUNTIME.hingeAxis(rig.aileronL.plate)).normalize();
  plane.controlSurfaces = {aileron:.7, elevator:.5, rudder:.3};
  plane.afterPhysics(1 / 60);
  const aileron = turnFromRest(rig.aileronL.plate);
  assert.ok(aileron.angle > 1e-4, 'the aileron deflected');
  assert.ok(Math.abs(aileron.axis.dot(span)) > .999,
    'about its span, not about an axis that would sweep it along the wing: ' + aileron.axis.toArray());
  assert.ok(rig.aileronL.mount.quaternion.equals(mountRotation), 'the wing mount never moves');
  assert.ok(turnFromRest(rig.elevator.plate).angle > 1e-4, 'the elevator deflected');
  assert.ok(turnFromRest(rig.rudder.plate).angle > 1e-4, 'the rudder deflected');
  plane.dispose();
});

test('the aileron pair deflects in opposite directions, taken from the wing not the scan order', () => {
  const GAME = fakeGame();
  const rig = airplaneRig();
  const plane = makeVehicle(GAME, rig.owner, {type:'airplane'});
  plane.controlSurfaces = {aileron:.7, elevator:0, rudder:0};
  plane.afterPhysics(1 / 60);
  const left = trailingEdgeLift(rig.aileronL.plate);
  const right = trailingEdgeLift(rig.aileronR.plate);
  assert.ok(Math.abs(left) > 1e-4 && Math.abs(right) > 1e-4, 'both ailerons move');
  assert.ok(left * right < 0, 'roll needs one trailing edge up and the other down: ' + left + ' / ' + right);
  assert.ok(Math.abs(Math.abs(left) - Math.abs(right)) < 1e-9, 'by the same amount');
  plane.dispose();
});

test('an untagged rig falls back to the wing side of the centreline', () => {
  const owner = new THREE.Group();
  const plate = (name, x) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.8, .06, .12), new THREE.MeshBasicMaterial());
    mesh.name = name; mesh.position.set(x, .2, -.2);
    return mesh;
  };
  // Deliberately added right-first, which is what made array parity wrong.
  owner.add(plate('aileron_right', -1.2), plate('aileron_left', 1.2));
  owner.updateMatrixWorld(true);
  const GAME = fakeGame();
  const plane = makeVehicle(GAME, owner, {type:'airplane'});
  plane.controlSurfaces = {aileron:.7, elevator:0, rudder:0};
  plane.afterPhysics(1 / 60);
  assert.ok(trailingEdgeLift(owner.getObjectByName('aileron_left')) * trailingEdgeLift(owner.getObjectByName('aileron_right')) < 0,
    'the side comes from where the surface is, so the order it was found in cannot matter');
  plane.dispose();
});

// =================================================================== 05 scale

test('a bundled vehicle is authored at metre scale beside a 1.8 m character', () => {
  const character = PACK.ASSETS.character;
  assert.equal(character.fit, 1.8, 'the mannequin is the reference height');
  assert.equal(PACK.ASSETS.car.fit, 4.4, 'a car is a car, not a 2.5 m toy');
  assert.equal(PACK.ASSETS.car.sourceFit, PACK.SOURCE_SIZE.car, 'the source dimension stays recorded');
  // One factor for the whole family, so the set keeps its internal proportions.
  ['airplane', 'helicopter'].forEach(kind => {
    const asset = PACK.ASSETS[kind];
    assert.equal(asset.fit, Number((PACK.SOURCE_SIZE[kind] * PACK.VEHICLE_SCALE).toFixed(6)), kind + ' shares the vehicle scale');
    assert.ok(asset.fit / PACK.ASSETS.car.fit > 1, kind + ' stays larger than the car, as authored');
  });
  // The world is the frame the rest is measured in and must not move.
  assert.equal(PACK.ASSETS.world.fit, PACK.SOURCE_SIZE.world);
});

test('the raycast wheel radius follows the model instead of a fixed metre value', () => {
  const GAME = fakeGame();
  const car = makeVehicle(GAME, carRig(), {type:'car'});
  const radii = car.vehicle.wheelInfos.map(wheel => wheel.radius);
  radii.forEach(radius => assert.ok(Math.abs(radius - .235) < .02, 'measured from the wheel mesh, got ' + radius));
  car.dispose();

  // The same rig with the model scaled up: the wheels have to grow with it, or
  // a vehicle scaled to read correctly drives on wheels of the original size.
  const bigGame = fakeGame();
  const owner = carRig();
  const inner = new THREE.Group();
  while(owner.children.length) inner.add(owner.children[0]);
  inner.scale.setScalar(2);
  owner.add(inner);
  owner.updateMatrixWorld(true);
  const big = makeVehicle(bigGame, owner, {type:'car'});
  big.vehicle.wheelInfos.forEach((wheel, index) => {
    assert.ok(Math.abs(wheel.radius - radii[index] * 2) < .04, 'wheel ' + index + ' must double with the model, got ' + wheel.radius);
  });
  const mounts = big.vehicle.wheelInfos.map(wheel => Math.abs(wheel.chassisConnectionPointLocal.x));
  mounts.forEach(x => assert.ok(Math.abs(x - .96) < .02, 'the wheel mounts move out with the model too, got ' + x));
  big.dispose();
});

test('an author scaling the whole vehicle scales its collider with it', () => {
  const collider = () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.name = 'hull'; mesh.userData = {data:'collision', shape:'box'};
    mesh.scale.set(.9, .4, 1.8);
    return mesh;
  };
  const plain = new THREE.Group();
  plain.add(collider());
  plain.updateMatrixWorld(true);
  const first = makeVehicle(fakeGame(), plain, {type:'helicopter'});
  const base = first.body.shapes[0].halfExtents.clone();
  first.dispose();

  const scaled = new THREE.Group();
  scaled.add(collider());
  scaled.scale.setScalar(1.75);
  scaled.updateMatrixWorld(true);
  const second = makeVehicle(fakeGame(), scaled, {type:'helicopter'});
  const grown = second.body.shapes[0].halfExtents;
  ['x', 'y', 'z'].forEach(axis => {
    assert.ok(Math.abs(grown[axis] - base[axis] * 1.75) < 1e-6,
      'the body must grow with the mesh on ' + axis + ': ' + grown[axis] + ' vs ' + base[axis] * 1.75);
  });
  second.dispose();
});

// ============================================================== 06 world sweep

// `refreshWorldPhysicsExtras` runs on every world register/unregister, and
// re-parsing a world source walks its whole graph. The editor has no Cannon
// world, which made `physics.supported` permanently false, which made the
// "retry a failed parse" branch permanently true: every registration re-read the
// entire world model. With district streaming registering objects continuously
// the tab filled with garbage and stopped responding, so this asserts the sweep
// is idle when nothing it depends on has changed.
function worldSource(name){
  const owner = new THREE.Group();
  owner.name = name;
  owner.userData.addedEntry = {id:name, src:'models/sketchbook/world.glb', physicsBackend:'sketchbook-metadata'};
  const marker = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshBasicMaterial());
  marker.name = 'World Physics';
  marker.userData = {data:'physics', type:'box'};
  owner.add(marker);
  const spawn = new THREE.Group();
  spawn.name = 'Spawn.001';
  spawn.userData = {data:'spawn', type:'car'};
  owner.add(spawn);
  owner.updateMatrixWorld(true);
  return owner;
}
function sweepHarness(){
  const world = new CANNON.World();
  const GAME = {state:{}, systems:{}, world:{registry:[]}};
  window.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const source = worldSource('sketchbook_world_model');
  GAME.world.registry.push(source);
  const coordinator = RUNTIME.createCoordinator(GAME);
  // Count how often the source is actually re-read.
  let reads = 0;
  const traverse = source.traverse.bind(source);
  source.traverse = function(fn){ reads++; return traverse(fn); };
  return {GAME, coordinator, source, world, reads:() => reads};
}

test('the world sweep does not re-read an unchanged source, with or without physics', () => {
  const harness = sweepHarness();
  harness.coordinator.refreshWorldPhysicsExtras(true);
  const afterFirst = harness.reads();
  assert.ok(afterFirst > 0, 'the first sweep has to read the source');
  // Thirty registrations, the way streaming a district in and out produces them.
  for(let i = 0; i < 30; i++) harness.coordinator.refreshWorldPhysicsExtras(false);
  assert.equal(harness.reads(), afterFirst,
    'an unchanged source must not be re-read once per registration (' + harness.reads() + ' reads)');
  assert.equal(harness.GAME.systems.sketchbookPawns ? 0 : 0, 0);
});

test('a physics world appearing materializes the bodies exactly once', () => {
  const harness = sweepHarness();
  harness.coordinator.refreshWorldPhysicsExtras(false);
  const sources = harness.coordinator.worldExtraSources;
  const record = sources.get('sketchbook_world_model');
  assert.ok(record, 'the world source must be tracked even with no physics world');
  assert.equal(record.physics.supported, false, 'no Cannon world yet, so no bodies yet');
  assert.equal(record.metadata.supported, true, 'the metadata is readable without physics');

  // Play starts: a physics world exists, so the bodies are built.
  harness.GAME.systems.physics = {raw:{world:harness.world}};
  harness.coordinator.refreshWorldPhysicsExtras(false);
  const live = sources.get('sketchbook_world_model');
  assert.equal(live.physics.supported, true);
  assert.equal(live.physics.bodies.length, 1, 'the box collider became one body');
  const bodies = harness.world.bodies.length;
  // And repeated sweeps neither duplicate the bodies nor re-read the source.
  const reads = harness.reads();
  for(let i = 0; i < 30; i++) harness.coordinator.refreshWorldPhysicsExtras(false);
  assert.equal(harness.world.bodies.length, bodies, 'a repeated sweep must not add bodies');
  assert.equal(harness.reads(), reads, 'a repeated sweep must not re-read the world');
});

test('the sweep still notices a replaced source and a removed one', () => {
  const harness = sweepHarness();
  harness.GAME.systems.physics = {raw:{world:harness.world}};
  harness.coordinator.refreshWorldPhysicsExtras(false);
  assert.equal(harness.world.bodies.length, 1);
  // A reloaded model is a different object under the same entry id.
  const replacement = worldSource('sketchbook_world_model');
  harness.GAME.world.registry[0] = replacement;
  harness.coordinator.refreshWorldPhysicsExtras(false);
  assert.equal(harness.coordinator.worldExtraSources.get('sketchbook_world_model').source, replacement,
    'a replaced source must be picked up');
  assert.equal(harness.world.bodies.length, 1, 'and must not leave the old bodies behind');
  // Removing it releases everything.
  harness.GAME.world.registry.length = 0;
  harness.coordinator.refreshWorldPhysicsExtras(false);
  assert.equal(harness.coordinator.worldExtraSources.size, 0);
  assert.equal(harness.world.bodies.length, 0, 'a removed world must not leak its bodies');
});

console.log('\nDollBody vehicle rig tests passed');
