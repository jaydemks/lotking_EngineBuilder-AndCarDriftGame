const assert = require('node:assert/strict');
const fs = require('node:fs');
const THREE = require('three');

const modelAssets = fs.readFileSync('js/runtime/model-assets.js', 'utf8');
const playerSetup = fs.readFileSync('js/editor/player-setup-inspector.js', 'utf8');
const vehiclePawns = fs.readFileSync('js/runtime/vehicle-pawns.js', 'utf8');
const lotKing = fs.readFileSync('js/lot-king.js', 'utf8');
const store = fs.readFileSync('js/engine/scene-store.js', 'utf8');
const playerBlueprints = fs.readFileSync('js/editor/player-blueprints.js', 'utf8');
const addon = fs.readFileSync('tools/blender 5.0+/car_wheel_glb_rigger-0.2.2/__init__.py', 'utf8');
const manifest = fs.readFileSync('tools/blender 5.0+/car_wheel_glb_rigger-0.2.2/blender_manifest.toml', 'utf8');

assert.match(manifest, /version = "0\.2\.2"/);
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
