const assert = require('node:assert/strict');
const fs = require('node:fs');
const THREE = require('three');

const modelAssets = fs.readFileSync('js/runtime/model-assets.js', 'utf8');
const playerSetup = fs.readFileSync('js/editor/player-setup-inspector.js', 'utf8');
const vehiclePawns = fs.readFileSync('js/runtime/vehicle-pawns.js', 'utf8');
const lotKing = fs.readFileSync('js/lot-king.js', 'utf8');
const store = fs.readFileSync('js/engine/scene-store.js', 'utf8');
const playerBlueprints = fs.readFileSync('js/editor/player-blueprints.js', 'utf8');
const addon = fs.readFileSync('tools/blender 5.0+/car_wheel_glb_rigger-0.3.0/__init__.py', 'utf8');
const manifest = fs.readFileSync('tools/blender 5.0+/car_wheel_glb_rigger-0.3.0/blender_manifest.toml', 'utf8');

assert.match(manifest, /version = "0\.3\.0"/);
assert.match(manifest, /SPDX:GPL-3\.0-or-later/);
assert.match(addon, /STEERING_PIVOT_NAME = "steering_wheel_pivot"/);
assert.match(addon, /lkSteeringLockDegrees/);
assert.match(addon, /lkSteeringVisualDegrees/);
assert.match(addon, /export_extras=True/);
assert.match(addon, /obj\.matrix_parent_inverse\.identity\(\)/);
assert.match(addon, /obj\.matrix_basis = local_matrix/);
assert.match(addon, /remove_existing_generated_rig/);
assert.match(addon, /steering_pivot_source/);
assert.match(addon, /rotation=world_rotation/);
assert.match(addon, /workflow: EnumProperty/);
assert.match(addon, /vehicle_type: EnumProperty/);
assert.match(addon, /build_aircraft_rig/);
assert.match(addon, /obj\["data"\] = role/);
assert.match(addon, /obj\["seat_type"\] = seat_type/);

assert.match(modelAssets, /visualLockDegrees:0/);
assert.match(modelAssets, /lkSteeringVisualDegrees/);
assert.match(modelAssets, /normalizedSteer/);
assert.match(modelAssets, /steeringStatus/);
assert.match(modelAssets, /rotationSpace/);
assert.match(lotKing, /RIG\.drive\(vF, dt, visSteer, P\.steer\)/);
assert.match(vehiclePawns, /modelRig\.drive\(forwardSpeed,h,steeringAngle\*1\.25,steer\)/);
assert.match(playerSetup, /Controller lock-to-lock/);
assert.match(playerSetup, /Visible lock-to-lock/);
assert.match(store, /steeringWheel: cloneData/);
assert.match(playerBlueprints, /setSteeringWheelConfig\(bp\.steeringWheel\)/);

global.window = global;
global.THREE = THREE;
delete require.cache[require.resolve('../js/runtime/model-assets.js')];
require('../js/runtime/model-assets.js');

{
  const car = new THREE.Group();
  const modelRoot = new THREE.Group();
  const floorPivot = new THREE.Group();
  const visibleWheel = new THREE.Mesh(
    new THREE.BoxGeometry(.42, .42, .08),
    new THREE.MeshBasicMaterial()
  );
  floorPivot.name = 'steering_wheel_pivot';
  visibleWheel.name = 'steering_wheel_mesh';
  floorPivot.position.set(0, 0, 0);
  visibleWheel.position.set(-.42, 1.12, .36);
  visibleWheel.rotation.set(.18, -.24, .12);
  floorPivot.userData.lkSteeringAxis = 'z';
  floorPivot.userData.lkSteeringDirection = -1;
  floorPivot.userData.lkSteeringVisualDegrees = 540;
  floorPivot.add(visibleWheel);
  modelRoot.add(floorPivot);
  car.add(modelRoot);
  car.updateMatrixWorld(true);

  const runtime = global.LK_RUNTIME_MODEL_ASSETS.create({
    THREERef:THREE,
    car,
    isFileMode:false,
  });
  runtime.rig.build(modelRoot);
  const beforePosition = visibleWheel.getWorldPosition(new THREE.Vector3());
  const beforeMeshQ = visibleWheel.quaternion.clone();
  const beforePivotQ = floorPivot.quaternion.clone();

  runtime.rig.drive(0, 1, 0, 1);
  car.updateMatrixWorld(true);

  const afterPosition = visibleWheel.getWorldPosition(new THREE.Vector3());
  const status = runtime.rig.steeringStatus();
  assert.ok(beforePosition.distanceTo(afterPosition) < 1e-9, 'steering must not orbit around the displaced root pivot');
  assert.ok(beforePivotQ.angleTo(floorPivot.quaternion) < 1e-9, 'the metadata/root pivot must remain unchanged');
  assert.ok(beforeMeshQ.angleTo(visibleWheel.quaternion) > .1, 'the visible steering mesh must rotate locally');
  assert.equal(status.rotationTarget, 'steering_wheel_mesh');
  assert.equal(status.rotationSpace, 'mesh-local');
}

console.log('steering-wheel-rig tests passed');

// ---------------------------------------------------------------- steer pivot
// An imported wheel rarely has its origin on the kingpin axis, so steering
// swings it through an arc instead of turning it in place. The pivot offset
// moves the rotation centre only — the wheel itself must not move.
(function steerPivotContract(){
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  const readFile = f => fs2.readFileSync(path2.join(__dirname, '..', f), 'utf8');

  const controller = readFile('js/runtime/vehicle-visual-controller.js');
  assert.ok(controller.includes('function applySteerPivot'), 'the shared visual controller must own the pivot offset');
  assert.ok(controller.includes('child.position.x -= dx;'), 'children must be counter-translated so the wheel does not move');
  assert.ok(controller.includes('if(!dx && !dy && !dz) return applied;'), 'an unchanged offset must cost nothing per frame');

  // Behaviour, not just presence: build a fake pivot and check the wheel stays put.
  global.window = global.window || global;
  delete require.cache[require.resolve('../js/runtime/vehicle-visual-controller.js')];
  require('../js/runtime/vehicle-visual-controller.js');
  const api = global.window.LK_RUNTIME_VEHICLE_VISUAL_CONTROLLER.create();
  const child = {position:{x:0, y:0, z:0}, rotation:{x:0}};
  const pivot = {position:{x:.92, y:0, z:1.35}, rotation:{y:0}, children:[child]};
  const visual = {pivot, spinTargets:[], suspensionVisual:0};
  const worldX = () => pivot.position.x + child.position.x;
  const worldZ = () => pivot.position.z + child.position.z;

  api.updateWheel({visual, front:true, steerAngle:0, dt:1/60, baseY:.38});
  const beforeX = worldX(), beforeZ = worldZ();
  api.updateWheel({visual, front:true, steerAngle:0, dt:1/60, baseY:.38, steerPivot:{x:.06, y:0, z:-.12}});
  assert.ok(Math.abs(worldX() - beforeX) < 1e-9, 'applying a pivot offset must not move the wheel laterally');
  assert.ok(Math.abs(worldZ() - beforeZ) < 1e-9, 'applying a pivot offset must not move the wheel fore/aft');
  assert.equal(pivot.position.x, .92 + .06, 'the rotation centre itself moves');
  assert.equal(pivot.position.z, 1.35 - .12);

  // Idempotent: re-applying the same offset must not drift the wheel.
  api.updateWheel({visual, front:true, steerAngle:0, dt:1/60, baseY:.38, steerPivot:{x:.06, y:0, z:-.12}});
  assert.ok(Math.abs(worldX() - beforeX) < 1e-9, 're-applying the same offset must not accumulate');

  // Rear wheels never steer, so they must not be given a pivot by the caller.
  const game = readFile('js/lot-king.js');
  assert.ok(game.includes('steerPivot:w.front ?'), 'only the front axle receives a steer pivot');
  ['steerPivotX', 'steerPivotY', 'steerPivotZ'].forEach(key => {
    assert.ok(game.includes(key + ': 0,'), 'DRIVE must default ' + key);
  });
  const inspector = readFile('js/editor/player-setup-inspector.js');
  ['steerPivotX', 'steerPivotY', 'steerPivotZ'].forEach(key => {
    assert.ok(inspector.includes("tFloatRow('" + key + "'"), key + ' must be editable, and tuning rows are what persist');
  });
  console.log('ok - steer pivot relocates the steering axis without moving the wheel');
})();
