'use strict';

/* =========================================================
   The bundled clips actually MOVE the character, correctly.

   They loaded (that was the previous fix) and then animated wrongly: "2 or 3 are
   visible but completely broken". Two defects in the assets, both present in the
   ORIGINAL source files:

     1. A DOUBLED bone chain. Every bone nested inside a same-named copy, and the two
        skinned meshes bound to DIFFERENT copies. A mixer resolves a track name to
        the first match - the outer bone - so one mesh animates and the other stays
        in its T-pose. Which mesh loses is not even consistent: on the male the SKIN
        freezes, on the female the JOINTS do.
     2. ROOT MOTION. `walking.fbx` travels 1.74 m per 1.03 s cycle while the
        controller is also moving the character, so it slides and snaps back.

   This drives the real files through the real loader, because both defects are
   invisible to any test that only reads descriptors.

   HOW THIS FILE IS ORGANISED
     01 harness    the real FBXLoader over the real bundled files
     02 defect     the defect is real and is asserted, not assumed
     03 collapse   one skeleton, and the bind pose does not move
     04 animate    both meshes deform when a clip plays
     05 in-place   horizontal travel is removed, vertical is kept
     06 safety     a legitimate nested bone is left alone
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');
const fs = require('node:fs');
const path = require('node:path');

// ================================================================= 01 harness

global.window = global;
require('../js/engine/skinned-rig-repair.js');
const REPAIR = global.LK_SKINNED_RIG_REPAIR;
const root = file => path.join(__dirname, '..', file);

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

let loader = null;
function loadFbx(rel){
  if(!loader){
    // FBXLoader is ESM-only in three's examples; require it through the bundled
    // compat entry the engine already ships, or skip when unavailable.
    const {FBXLoader} = require('three/examples/jsm/loaders/FBXLoader.js');
    loader = new FBXLoader();
  }
  const buffer = fs.readFileSync(root(rel));
  return loader.parse(new Uint8Array(buffer).buffer, '');
}

const MALE = 'models/characters/mannequin-male/y-bot.fbx';
const FEMALE = 'models/characters/mannequin-female/x-bot.fbx';
const WALK = 'models/characters/mannequin-male/walking.fbx';
const IDLE = 'models/characters/mannequin-male/idle.fbx';

function skins(node){
  const found = [];
  node.traverse(child => { if(child.isSkinnedMesh) found.push(child); });
  return found;
}

// ================================================================== 02 defect

test('the bundled bodies really do carry a doubled bone chain', () => {
  // Asserted rather than assumed: if a future asset drop fixes the files, this test
  // says so instead of quietly protecting against nothing.
  [[MALE, 52], [FEMALE, 64]].forEach(([file, expected]) => {
    const pairs = REPAIR.duplicatePairs(loadFbx(file));
    assert.equal(pairs.length, expected, file + ' has ' + expected + ' doubled bones');
    pairs.forEach(([, inner]) => assert.ok(REPAIR.isPassThrough(inner),
      inner.name + ' inner copy must be an exact pass-through, or collapsing it would move the bind pose'));
  });
});

test('the two skinned meshes are bound to different copies, and inconsistently', () => {
  const male = loadFbx(MALE), female = loadFbx(FEMALE);
  [male, female].forEach(body => {
    const meshes = skins(body);
    assert.equal(meshes.length, 2);
    assert.notEqual(meshes[0].skeleton, meshes[1].skeleton, 'two skeletons is the defect');
  });
  // The mixer always drives the outer bone; the mesh on the inner chain is the one
  // that freezes, and it is the SKIN on the male and the JOINTS on the female.
  const outerOf = body => {
    const pairs = REPAIR.duplicatePairs(body);
    const outer = new Set(pairs.map(pair => pair[0]));
    return skins(body).filter(mesh => mesh.skeleton.bones.some(bone => outer.has(bone))).map(mesh => mesh.name);
  };
  assert.deepEqual(outerOf(male), ['Alpha_Joints'], 'on the male the joints are on the driven chain');
  assert.deepEqual(outerOf(female), ['Beta_Surface'], 'on the female it is the skin instead');
});

// ================================================================ 03 collapse

test('collapsing leaves one chain, every skeleton pointing at it', () => {
  const body = loadFbx(MALE);
  const before = skins(body).map(mesh => mesh.skeleton.bones.length);
  const outcome = REPAIR.collapseDuplicateBones(body);
  assert.equal(outcome.collapsed, 52);
  assert.equal(outcome.skipped, 0);
  assert.equal(outcome.meshes, 2);
  assert.equal(REPAIR.duplicatePairs(body).length, 0, 'no duplicate names are left');

  const meshes = skins(body);
  assert.deepEqual(meshes.map(mesh => mesh.skeleton.bones.length), before,
    'a skeleton keeps its bone COUNT - the slots are repointed, not removed');
  // Both meshes now reference the same bone objects, which is the whole point.
  const a = new Set(meshes[0].skeleton.bones), shared = meshes[1].skeleton.bones.filter(bone => a.has(bone));
  assert.equal(shared.length, meshes[1].skeleton.bones.length,
    'every bone of the second mesh is now a bone of the first');
});

test('the bind pose does not move, which is why the repair is safe', () => {
  const before = loadFbx(MALE), after = loadFbx(MALE);
  before.updateMatrixWorld(true);
  const sample = ['mixamorigHead', 'mixamorigLeftHand', 'mixamorigRightFoot'];
  const world = name => {
    const bone = before.getObjectByName(name);
    return bone.matrixWorld.elements.slice(12, 15).map(value => value.toFixed(4)).join(',');
  };
  const originals = sample.map(world);
  REPAIR.collapseDuplicateBones(after);
  after.updateMatrixWorld(true);
  sample.forEach((name, index) => {
    const bone = after.getObjectByName(name);
    const now = bone.matrixWorld.elements.slice(12, 15).map(value => value.toFixed(4)).join(',');
    assert.equal(now, originals[index], name + ' must not move when the chain collapses');
  });
});

// ================================================================= 04 animate

test('both meshes deform when a clip plays - the actual bug, end to end', () => {
  const body = loadFbx(MALE);
  const clip = loadFbx(WALK).animations[0];
  assert.ok(clip, 'the walk clip loaded');
  REPAIR.collapseDuplicateBones(body);

  const mixer = new THREE.AnimationMixer(body);
  mixer.clipAction(clip).play();
  const meshes = skins(body);
  // A bone from EACH mesh's skeleton, sampled before and after time advances.
  const probes = meshes.map(mesh => {
    const bone = mesh.skeleton.bones.find(item => /LeftArm|LeftForeArm/.test(item.name)) || mesh.skeleton.bones[3];
    return {mesh:mesh.name, bone, before:bone.quaternion.clone()};
  });
  mixer.update(0.4);
  probes.forEach(probe => {
    const moved = probe.bone.quaternion.angleTo(probe.before);
    assert.ok(moved > 0.01,
      probe.mesh + ' must be driven by the clip; its bone ' + probe.bone.name +
      ' rotated ' + moved.toFixed(4) + ' rad. Before the repair one mesh stayed in its T-pose.');
  });
});

test('without the repair one mesh stays frozen, proving the test can fail', () => {
  const body = loadFbx(MALE);
  const clip = loadFbx(WALK).animations[0];
  const mixer = new THREE.AnimationMixer(body);
  mixer.clipAction(clip).play();
  const meshes = skins(body);
  const probes = meshes.map(mesh => {
    const bone = mesh.skeleton.bones.find(item => /LeftArm|LeftForeArm/.test(item.name)) || mesh.skeleton.bones[3];
    return {mesh:mesh.name, bone, before:bone.quaternion.clone()};
  });
  mixer.update(0.4);
  const frozen = probes.filter(probe => probe.bone.quaternion.angleTo(probe.before) < 1e-6);
  assert.equal(frozen.length, 1, 'exactly one mesh is unreachable by the mixer before the repair');
  assert.equal(frozen[0].mesh, 'Alpha_Surface', 'and on the male body it is the visible SKIN');
});

// ================================================================= 05 in-place

test('a travelling clip is flattened horizontally and keeps its vertical', () => {
  const clip = loadFbx(WALK).animations[0].clone();
  const track = REPAIR.rootPositionTrack(clip);
  assert.ok(track, 'the root track was found');
  const verticalBefore = [];
  for(let i = 1; i < track.values.length; i += 3) verticalBefore.push(track.values[i]);

  // Mixamo positions are in CENTIMETRES - the hips sit at y ~103 - and the model is
  // scaled to metres by `fit` on an ancestor, so the tolerances here are cm too.
  const outcome = REPAIR.makeClipInPlace(clip);
  assert.ok(outcome.changed, 'the walk really does travel');
  assert.ok(outcome.drift > 100, 'it covers more than a metre per cycle, got ' + outcome.drift.toFixed(1) + ' cm');

  const xs = new Set(), zs = new Set(), verticalAfter = [];
  for(let i = 0; i + 2 < track.values.length; i += 3){
    xs.add(track.values[i]); zs.add(track.values[i + 2]); verticalAfter.push(track.values[i + 1]);
  }
  assert.equal(xs.size, 1, 'X is constant afterwards');
  assert.equal(zs.size, 1, 'Z is constant afterwards');
  assert.deepEqual(verticalAfter, verticalBefore, 'the vertical is untouched - that is weight shift and jump lift');
  assert.deepEqual(Array.from(xs),[0],'in-place Walk is centred on the Pawn instead of frozen at its first lateral sample');
  assert.deepEqual(Array.from(zs),[0],'in-place Walk cannot retain a forward/back source baseline');
});

test('different Walk and Run start offsets converge to the same Pawn centre', () => {
  const clip=(name,x,z)=>({name,tracks:[{name:'mixamorigHips.position',values:new Float32Array([x,100,z,x+.4,101,z+3])}]});
  const walk=clip('Walk',-.7,.15),run=clip('Run',2.4,-.3);
  REPAIR.makeClipInPlace(walk);REPAIR.makeClipInPlace(run);
  assert.deepEqual(Array.from(walk.tracks[0].values).filter((_,i)=>i%3!==1),[0,0,0,0]);
  assert.deepEqual(Array.from(run.tracks[0].values).filter((_,i)=>i%3!==1),[0,0,0,0]);
});

test('an idle is left essentially where it was', () => {
  // Also centimetres: an idle sways about a centimetre, which is the body settling,
  // not travel. The point of the comparison is the ORDER of magnitude against the
  // walk's 170 cm - flattening either is harmless, but only one was a bug.
  const clip = loadFbx(IDLE).animations[0].clone();
  const outcome = REPAIR.makeClipInPlace(clip);
  assert.ok(outcome.drift < 5, 'an idle barely moves, got ' + outcome.drift.toFixed(2) + ' cm');
});

// =================================================================== 06 safety

test('a nested bone that carries a real transform is left alone', () => {
  // Not every same-named child is the defect. A control or twist bone with an actual
  // offset must survive, or the repair would silently deform someone else's rig.
  const parent = new THREE.Bone(); parent.name = 'Spine';
  const child = new THREE.Bone(); child.name = 'Spine';
  child.position.set(0, 0.25, 0);
  parent.add(child);
  const holder = new THREE.Group(); holder.add(parent);

  const outcome = REPAIR.collapseDuplicateBones(holder);
  assert.equal(outcome.pairs, 1, 'the pair is seen');
  assert.equal(outcome.collapsed, 0, 'but not collapsed');
  assert.equal(outcome.skipped, 1, 'it is reported as skipped instead');
  assert.equal(parent.children.length, 1, 'the rig is unchanged');
});

test('a clean rig is a no-op', () => {
  const clean = loadFbx(WALK);
  const outcome = REPAIR.collapseDuplicateBones(clean);
  assert.equal(outcome.pairs, 0);
  assert.equal(outcome.collapsed, 0);
});

console.log('\nskinned rig repair tests passed');
