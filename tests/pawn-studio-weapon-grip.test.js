'use strict';

/* =========================================================
   Placing the HANDS on the weapon has to be authorable, and what the author
   drags has to be what the game reads.

   The request was concrete: a clip that holds a weapon needs dummies for the
   hands, a choice between one and two hands, and those values must persist on
   the Pawn. Every part of that can fail silently — a dummy that authors nothing,
   a support hand that stays live on a one-handed grip, an additive layer that
   overwrites the hold instead of adding to it, or dummies that leak GPU memory
   every time a motion is selected.

   So this file drives the real authoring functions over real THREE objects and
   the real runtime pose layer (`character-weapon-pose`), rather than searching
   the source for the feature. Only the DOM wiring, which needs a browser, is
   checked as source — and then against CODE with comments stripped first,
   because a regex in this repository once matched a comment and reported a
   failure that did not exist.

   HOW THIS FILE IS ORGANISED
     01 harness    real THREE, a Mixamo-named arm chain, a character definition
     02 contract   the authored shape is exactly weapon.grip
     03 dummies    build, drag, read back — including the additive layers
     04 hands      single vs double decides the support dummy AND the pose target
     05 frame      the dummies stand in the eye frame the game resolves against
     06 arms       the preview runs the shipped pose layer and undoes it cleanly
     07 disposal   leaving the mode disposes every geometry and material
     08 wiring     container, toolbar and panel are actually connected
   ========================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');

global.window = global;
global.THREE = THREE;
global.localStorage = {getItem(){ return null; }, setItem(){}};
require('../js/runtime/character-animation-set.js');
require('../js/runtime/character-weapon-pose.js');   // the layer the dummies feed
require('../js/runtime/first-person-controller.js'); // canonical weapon descriptors / loadout presets
require('../js/runtime/fps-view-model.js');           // the weapon Play actually draws
require('../js/editor/pawn-studio.js');

const STUDIO = global.LK_EDITOR_PAWN_STUDIO;
const GRIP = STUDIO.gripAuthoring;
const SEATING = STUDIO.seatingAuthoring;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// ================================================================= 01 harness

// A shoulder-to-hand chain per side, named the way the runtime classifier reads
// them, so `pose()` below is doing real work on a real skeleton.
function armRig(){
  const root = new THREE.Group();
  const chest = new THREE.Bone();
  chest.name = 'mixamorigSpine2';
  chest.position.set(0, 1.4, 0);
  root.add(chest);
  ['Left', 'Right'].forEach(side => {
    const sign = side === 'Left' ? 1 : -1;
    const upper = new THREE.Bone();
    upper.name = 'mixamorig' + side + 'Arm';
    upper.position.set(.18 * sign, .1, 0);
    const lower = new THREE.Bone();
    lower.name = 'mixamorig' + side + 'ForeArm';
    lower.position.set(.28 * sign, 0, 0);
    const hand = new THREE.Bone();
    hand.name = 'mixamorig' + side + 'Hand';
    hand.position.set(.26 * sign, 0, 0);
    lower.add(hand);
    upper.add(lower);
    chest.add(upper);
  });
  root.updateMatrixWorld(true);
  return root;
}

function boneNamed(root, name){
  let found = null;
  root.traverse(node => { if(node.name === name) found = node; });
  return found;
}

/** A studio state shaped like the live one, minus the DOM and the renderer. */
function studioState(definition, options){
  const scene = new THREE.Scene();
  const model = armRig();
  scene.add(model);
  return Object.assign({
    scene, model, definition,
    graph:{characterPawn:definition},
    gripHand:'trigger', gripLayer:'hold',
  }, options || {});
}

function characterDefinition(weapon){
  return {schemaVersion:2, movement:{}, camera:{}, appearance:{}, animations:{},
    animationSet:[{id:'aim', name:'Rifle Aim Idle', state:'action', clip:'aimRifleIdle'}],
    firstPerson:weapon ? {weapon} : undefined};
}

// ================================================================ 02 contract

test('an unauthored grip normalizes to the full contract shape', () => {
  const grip = STUDIO.weaponGrip(null);
  assert.deepEqual(Object.keys(grip), ['hands', 'supportHand', 'trigger', 'support', 'aim', 'fire']);
  assert.ok(STUDIO.gripHands().includes(grip.hands));
  assert.equal(grip.supportHand, 'auto');
  ['trigger', 'support'].forEach(hand => {
    assert.equal(grip[hand].position.length, 3);
    assert.equal(grip[hand].rotation.length, 3);
    grip[hand].position.concat(grip[hand].rotation).forEach(value => assert.equal(typeof value, 'number'));
  });
  ['aim', 'fire'].forEach(layer => {
    // Additive layers are plain vectors, and untouched means zero: anything else
    // would move the hands the moment the weapon is aimed or fired.
    assert.deepEqual(grip[layer].trigger, [0, 0, 0]);
    assert.deepEqual(grip[layer].support, [0, 0, 0]);
  });
});

test('authored values survive normalization and junk does not', () => {
  const grip = STUDIO.weaponGrip({hands:'triple', trigger:{position:['0.2', null, 3]}, aim:{trigger:[.01, .02, .03]}});
  assert.ok(STUDIO.gripHands().includes(grip.hands), 'an unknown grip falls back to a real one');
  assert.equal(grip.trigger.position[0], .2, 'a numeric string is still a number');
  assert.equal(grip.trigger.position[2], 3);
  assert.equal(typeof grip.trigger.position[1], 'number', 'a hole is filled, never left null');
  assert.deepEqual(grip.aim.trigger, [.01, .02, .03]);
  assert.deepEqual(STUDIO.weaponGrip(grip), grip, 'normalizing twice changes nothing');
});

test('legacy nested support.enabled remains readable', () => {
  assert.equal(STUDIO.weaponGrip({hands:'single', support:{enabled:true}}).supportHand, 'on');
  assert.equal(STUDIO.weaponGrip({hands:'double', support:{enabled:false}}).supportHand, 'off');
});

test('the former same-side two-hand fallback migrates to an anatomical support target', () => {
  const grip=STUDIO.weaponGrip({hands:'double',trigger:{position:[.15,-.18,.40]},support:{position:[.18,-.26,.90]}});
  assert.ok(grip.trigger.position[0]>0&&grip.support.position[0]<0,'trigger and support dummies start on their respective arm sides');
});

test('the default grip follows the weapon instead of guessing', () => {
  assert.equal(STUDIO.defaultGripHands({preset:'pistol'}), 'single');
  assert.equal(STUDIO.defaultGripHands({kind:'thrown'}), 'thrown');
  assert.equal(STUDIO.defaultGripHands({kind:'unarmed'}), 'unarmed');
  assert.equal(STUDIO.defaultGripHands({preset:'rifle'}), 'double');
});

test('authoring stores the grip on the weapon config, reading never invents one', () => {
  const armed = characterDefinition({id:'primary', preset:'pistol'});
  const stored = STUDIO.weaponGripConfig(armed, true);
  assert.equal(armed.firstPerson.weapon.grip, stored, 'the panel mutates the object that is saved');
  assert.equal(stored.hands, 'single');
  const bare = characterDefinition(null);
  assert.equal(STUDIO.weaponGripConfig(bare, false).hands, 'double', 'a readable default for the tree badge');
  assert.equal(bare.firstPerson, undefined, 'browsing an unarmed Pawn must not write a weapon onto it');
});

test('new grips inherit the same hold positions as the runtime', () => {
  ['rifle', 'pistol', 'grenade', 'knife', 'fists'].forEach(preset => {
    const weapon = global.LK_RUNTIME_FIRST_PERSON.normalizeWeapon({preset});
    const definition = characterDefinition({preset});
    const authored = STUDIO.weaponGripConfig(definition, true);
    const runtime = global.LK_RUNTIME_CHARACTER_WEAPON_POSE.resolveGrip(weapon, []);
    assert.deepEqual(authored.trigger.position, runtime.trigger.position, preset + ' trigger');
    assert.deepEqual(authored.support.position, runtime.support.position, preset + ' support');
  });
});

test('an additive layer is drawn on top of the hold, not instead of it', () => {
  const grip = STUDIO.weaponGrip({hands:'double', trigger:{position:[.1, -.2, .3]}, aim:{trigger:[0, .05, .1]}, fire:{trigger:[0, 0, -.2]}});
  assert.deepEqual(STUDIO.gripHandOffset(grip, 'trigger', 'hold'), [.1, -.2, .3]);
  assert.deepEqual(STUDIO.gripHandOffset(grip, 'trigger', 'aim').map(value => Number(value.toFixed(3))), [.1, -.15, .4]);
  assert.deepEqual(STUDIO.gripHandOffset(grip, 'trigger', 'fire').map(value => Number(value.toFixed(3))), [.1, -.2, .1]);
  assert.deepEqual(STUDIO.gripHandOffset(grip, 'trigger', 'nonsense'), [.1, -.2, .3], 'an unknown layer is the hold');
});

// ================================================================= 03 dummies

test('building the dummies puts two draggable hands in the scene', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  const group = GRIP.build(state);
  assert.ok(group, 'the group is created');
  assert.equal(group.parent, state.scene);
  assert.ok(state.gripTriggerDummy && state.gripSupportDummy, 'one dummy per hand');
  const grip = definition.firstPerson.weapon.grip;
  assert.deepEqual([state.gripTriggerDummy.position.x, state.gripTriggerDummy.position.y, state.gripTriggerDummy.position.z],
    grip.trigger.position, 'the dummy stands exactly on the authored value');
  assert.deepEqual([state.gripSupportDummy.position.x, state.gripSupportDummy.position.y, state.gripSupportDummy.position.z],
    grip.support.position);
  GRIP.clear(state);
});

test('dragging a dummy writes the hold: position in metres, rotation in degrees', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  GRIP.build(state);
  state.gripTriggerDummy.position.set(.2, -.31, .45);
  state.gripTriggerDummy.rotation.set(0, THREE.MathUtils.degToRad(30), 0);
  const grip = GRIP.read(state);
  assert.deepEqual(grip.trigger.position, [.2, -.31, .45]);
  assert.ok(Math.abs(grip.trigger.rotation[1] - 30) < .01, 'degrees, not radians');
  assert.equal(definition.firstPerson.weapon.grip.trigger.position[2], .45, 'and it is on the weapon config');
  GRIP.clear(state);
});

test('the selected hand is the one being authored', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  GRIP.build(state);
  const untouched = definition.firstPerson.weapon.grip.trigger.position.slice();
  state.gripHand = 'support';
  assert.equal(GRIP.activeDummy(state), state.gripSupportDummy);
  state.gripSupportDummy.position.set(-.05, -.1, .6);
  GRIP.read(state);
  assert.deepEqual(definition.firstPerson.weapon.grip.support.position, [-.05, -.1, .6]);
  assert.deepEqual(definition.firstPerson.weapon.grip.trigger.position, untouched,
    'authoring one hand must not disturb the other');
  GRIP.clear(state);
});

test('clicking either viewport dummy independently selects that hand', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition, {gripMode:true});
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 20);
  camera.position.set(0, 1.55, 3);
  camera.lookAt(0, 1.45, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  state.camera = camera;
  state.renderer = {domElement:{getBoundingClientRect(){ return {left:0, top:0, width:200, height:200}; }}};
  GRIP.build(state);
  GRIP.syncFrame(state);
  state.gripTriggerDummy.position.set(-.4, -.1, .35);
  state.gripSupportDummy.position.set(.4, -.1, .35);
  state.gripGroup.updateMatrixWorld(true);

  const pointerFor = dummy => {
    const ndc = dummy.getWorldPosition(new THREE.Vector3()).project(camera);
    return {button:0, clientX:(ndc.x + 1) * 100, clientY:(1 - ndc.y) * 100};
  };
  assert.equal(GRIP.handFromPointer(state, pointerFor(state.gripSupportDummy)), 'support');
  assert.equal(GRIP.handFromPointer(state, pointerFor(state.gripTriggerDummy)), 'trigger');
  GRIP.clear(state);
});

test('clicking a visible vehicle-seat IK dummy resolves that exact skeleton target', () => {
  const camera = new THREE.PerspectiveCamera(45, 1, .01, 20);
  camera.position.set(0, 1.4, 3);camera.lookAt(0, 1.1, 0);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  const group=new THREE.Group(),rootDummy=new THREE.Mesh(new THREE.OctahedronGeometry(.1),new THREE.MeshBasicMaterial()),leftHand=new THREE.Mesh(new THREE.SphereGeometry(.08),new THREE.MeshBasicMaterial()),rightFoot=new THREE.Mesh(new THREE.SphereGeometry(.08),new THREE.MeshBasicMaterial());
  rootDummy.position.set(0,.72,0);rootDummy.userData.lkSeatingTarget='seatRoot';leftHand.position.set(-.45,1.25,0);leftHand.userData.lkSeatingTarget='leftHand';rightFoot.position.set(.35,.35,0);rightFoot.userData.lkSeatingTarget='rightFoot';group.add(rootDummy,leftHand,rightFoot);group.updateMatrixWorld(true);
  const state={seatingMode:true,seatingTargetGroup:group,seatingRootDummy:rootDummy,seatingTargets:{leftHand,rightFoot},camera,renderer:{domElement:{getBoundingClientRect(){return{left:0,top:0,width:200,height:200};}}}};
  const pointerFor=dummy=>{const ndc=dummy.getWorldPosition(new THREE.Vector3()).project(camera);return{button:0,clientX:(ndc.x+1)*100,clientY:(1-ndc.y)*100};};
  assert.equal(SEATING.targetFromPointer(state,pointerFor(leftHand)),'leftHand');
  assert.equal(SEATING.targetFromPointer(state,pointerFor(rightFoot)),'rightFoot');
  assert.equal(SEATING.targetFromPointer(state,pointerFor(rootDummy)),'seatRoot','the visible general dummy selects the whole Character root');
  rightFoot.visible=false;
  assert.equal(SEATING.targetFromPointer(state,pointerFor(rightFoot)),null,'a deliberately hidden helper cannot steal viewport selection');
});

test('dragging in an additive layer stores the difference from the hold', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  GRIP.build(state);
  const hold = definition.firstPerson.weapon.grip.trigger.position.slice();
  state.gripLayer = 'aim';
  GRIP.syncDummies(state);
  assert.deepEqual([state.gripTriggerDummy.position.x, state.gripTriggerDummy.position.y, state.gripTriggerDummy.position.z], hold,
    'an untouched aim layer starts on the hold');
  state.gripTriggerDummy.position.z += .12;
  const grip = GRIP.read(state);
  assert.deepEqual(grip.trigger.position, hold, 'the hold is not overwritten by aim authoring');
  assert.equal(Number(grip.aim.trigger[2].toFixed(3)), .12);
  assert.deepEqual(grip.aim.trigger.slice(0, 2), [0, 0]);
  // And the round trip is stable: rebuilding puts the dummy back where it was left.
  GRIP.syncDummies(state);
  assert.equal(Number(state.gripTriggerDummy.position.z.toFixed(3)), Number((hold[2] + .12).toFixed(3)));
  GRIP.clear(state);
});

// =================================================================== 04 hands

test('a single-handed grip keeps its support hand authorable but does not pose it', () => {
  const definition = characterDefinition({id:'primary', preset:'pistol'});
  const state = studioState(definition);
  GRIP.build(state);
  assert.equal(definition.firstPerson.weapon.grip.hands, 'single');
  assert.equal(state.gripTriggerDummy.visible, true);
  assert.equal(state.gripSupportDummy.visible, true, 'the second hand can be prepared before it is enabled');
  assert.equal(state.gripSupportLine.visible, true);
  assert.equal(GRIP.targets(state).supportTarget, null, 'and the pose layer is given no second arm');
  // It remains independently selectable and editable.
  state.gripHand = 'support';
  GRIP.syncDummies(state);
  assert.equal(state.gripHand, 'support');
  assert.equal(GRIP.activeDummy(state), state.gripSupportDummy);
  GRIP.clear(state);
});

test('switching to a double grip brings the support hand and its target back', () => {
  const definition = characterDefinition({id:'primary', preset:'pistol'});
  const state = studioState(definition);
  GRIP.build(state);
  definition.firstPerson.weapon.grip.hands = 'double';
  GRIP.syncDummies(state);
  assert.equal(state.gripSupportDummy.visible, true);
  assert.equal(state.gripSupportLine.visible, true);
  assert.ok(GRIP.targets(state).supportTarget, 'a two-handed weapon aims both arms');
  GRIP.clear(state);
});

test('supportHand explicitly enables a second arm on a sidearm', () => {
  const definition = characterDefinition({id:'primary', preset:'pistol'});
  const state = studioState(definition);
  GRIP.build(state);
  definition.firstPerson.weapon.grip.supportHand = 'on';
  GRIP.syncDummies(state);
  assert.ok(GRIP.targets(state).supportTarget, 'the authored support override reaches the pose layer');
  definition.firstPerson.weapon.grip.supportHand = 'off';
  GRIP.syncDummies(state);
  assert.equal(GRIP.targets(state).supportTarget, null);
  GRIP.clear(state);
});

// The target is active exactly when the GAME poses it. Both authoring dummies
// remain available so a hand can be prepared before that policy is enabled.
test('the off hand is authorable exactly when the game poses it', () => {
  const cases = [
    {weapon:{id:'w', kind:'unarmed'}, support:true, why:'fists hold a guard with the free hand'},
    {weapon:{id:'w', kind:'thrown'}, support:true, why:'a throw braces with the free hand'},
    {weapon:{id:'w', kind:'melee'}, support:false, why:'one hand on the handle and no second hand'},
    {weapon:{id:'w', kind:'firearm', preset:'pistol'}, support:false, why:'a sidearm is one hand'},
    {weapon:{id:'w', kind:'firearm', preset:'rifle'}, support:true, why:'a rifle has a foregrip'},
  ];
  cases.forEach(item => {
    const definition = characterDefinition(item.weapon);
    const state = studioState(definition);
    const grip = STUDIO.weaponGripConfig(definition, true);
    // Whatever the editor decides, it has to be the same answer the pose layer
    // reaches, or the author places a hand the game ignores (or misses one it uses).
    const resolved = global.LK_RUNTIME_CHARACTER_WEAPON_POSE.resolveGrip(item.weapon, [grip]);
    assert.equal(resolved.support.enabled, item.support, item.why + ' (runtime)');
    assert.equal(STUDIO.gripSupportActive(definition, grip), item.support, item.why + ' (editor)');
    GRIP.build(state);
    assert.equal(state.gripSupportDummy.visible, true, item.why + ' (authoring dummy)');
    assert.equal(state.gripSupportLine.visible, true);
    assert.equal(!!GRIP.targets(state).supportTarget, item.support, item.why + ' (pose target)');
    assert.ok(GRIP.targets(state).triggerTarget, 'the active hand is always placeable');
    GRIP.clear(state);
  });
});

test('without the runtime loaded the editor falls back to the hands field', () => {
  const definition = characterDefinition({id:'w', kind:'unarmed'});
  const grip = STUDIO.weaponGripConfig(definition, true);
  const runtime = global.LK_RUNTIME_CHARACTER_WEAPON_POSE;
  delete global.LK_RUNTIME_CHARACTER_WEAPON_POSE;
  try {
    assert.equal(STUDIO.gripSupportActive(definition, grip), false, 'an unarmed grip is not double');
    grip.hands = 'double';
    assert.equal(STUDIO.gripSupportActive(definition, grip), true);
    assert.equal(STUDIO.inheritedGripLayer(definition, grip, 'aim', 'trigger'), null,
      'and nothing is claimed about a default that cannot be read');
  } finally { global.LK_RUNTIME_CHARACTER_WEAPON_POSE = runtime; }
});

// ================================================= 04b the aim/fire round trip

test('an untouched additive layer is disclosed as the weapon default, not as zero', () => {
  // The runtime reads an all-zero vector as "inherit the default for this weapon
  // kind", so a panel that showed only the stored zeros would promise the author
  // that nothing moves while aiming while the game shifts the hands ~9 cm.
  const definition = characterDefinition({id:'primary', preset:'rifle', kind:'firearm'});
  const grip = STUDIO.weaponGripConfig(definition, true);
  assert.deepEqual(grip.aim.trigger, [0, 0, 0], 'nothing is authored yet');
  const disclosed = STUDIO.inheritedGripLayer(definition, grip, 'aim', 'trigger');
  const resolved = global.LK_RUNTIME_CHARACTER_WEAPON_POSE.resolveGrip(definition.firstPerson.weapon, [grip]);
  assert.deepEqual(disclosed, resolved.aim.trigger, 'the editor discloses exactly what the game will apply');
  assert.ok(disclosed.some(value => value !== 0), 'and it is not zero');
  assert.equal(STUDIO.inheritedGripLayer(definition, grip, 'hold', 'trigger'), null, 'the hold inherits nothing');
  grip.aim.trigger = [0, 0, .2];
  assert.equal(STUDIO.inheritedGripLayer(definition, grip, 'aim', 'trigger'), null,
    'once authored there is no default left to disclose');
});

test('authoring "nothing changes while aiming" survives the trip to the game', () => {
  // Dragging the aiming hand back onto the hold is a deliberate answer. Stored as
  // a true zero the runtime would read it as "inherit" and silently reinstate the
  // weapon's aim shift — the arms moving when the player aims is the complaint
  // this whole mode exists to fix.
  const definition = characterDefinition({id:'primary', preset:'rifle', kind:'firearm'});
  const state = studioState(definition);
  GRIP.build(state);
  const hold = definition.firstPerson.weapon.grip.trigger.position.slice();
  state.gripLayer = 'aim';
  GRIP.syncDummies(state);
  state.gripTriggerDummy.position.set(hold[0], hold[1], hold[2]);
  const grip = GRIP.read(state);
  assert.deepEqual(grip.trigger.position, hold, 'the hold is untouched');
  const runtime = global.LK_RUNTIME_CHARACTER_WEAPON_POSE.resolveGrip(definition.firstPerson.weapon, [grip]);
  runtime.aim.trigger.forEach(value => assert.ok(Math.abs(value) < .001,
    'the game must not move the hands while aiming: ' + JSON.stringify(runtime.aim.trigger)));
  assert.ok(grip.aim.trigger.some(value => value !== 0), 'so the stored answer cannot be a bare zero');
  grip.aim.trigger.forEach(value => assert.ok(Math.abs(value) < .001, 'and is still effectively no movement'));
  // The dummy comes back exactly where it was left, not a tenth of a millimetre adrift on screen.
  GRIP.syncDummies(state);
  assert.ok(state.gripTriggerDummy.getWorldPosition(new THREE.Vector3())
    .distanceTo(new THREE.Vector3(hold[0], hold[1] + 1.62, hold[2])) < .001);
  GRIP.clear(state);
});

// =================================================================== 05 frame

test('the dummies live in the eye frame the game resolves against', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  definition.firstPerson.eyeHeight = 1.7;
  const state = studioState(definition);
  state.model.position.set(3, 0, -2);
  const anchor = GRIP.eyeAnchor(state);
  assert.ok(Math.abs(anchor.position.x - 3) < 1e-6);
  assert.ok(Math.abs(anchor.position.y - 1.7) < 1e-6, 'the eye is the Pawn root plus the authored eye height');
  assert.ok(Math.abs(anchor.position.z + 2) < 1e-6);
  GRIP.build(state);
  const world = state.gripTriggerDummy.getWorldPosition(new THREE.Vector3());
  const grip = definition.firstPerson.weapon.grip;
  assert.ok(Math.abs(world.z - (-2 + grip.trigger.position[2])) < 1e-6, '+Z is straight ahead of the character');
  assert.ok(Math.abs(world.y - (1.7 + grip.trigger.position[1])) < 1e-6, '+Y is world up from the eye');
  GRIP.clear(state);
});

test('the frame turns with the character but never tilts with the mesh', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  // An authored mesh alignment often carries a pitch/roll correction. Inheriting
  // it would tilt the whole frame and make the same metres mean something else.
  state.model.rotation.set(.4, Math.PI / 2, .2);
  const anchor = GRIP.eyeAnchor(state);
  const euler = new THREE.Euler().setFromQuaternion(anchor.quaternion, 'YXZ');
  assert.ok(Math.abs(euler.x) < 1e-6 && Math.abs(euler.z) < 1e-6, 'yaw only');
  assert.ok(Math.abs(euler.y - Math.PI / 2) < 1e-6);
  GRIP.build(state);
  const forward = STUDIO.weaponGrip(definition.firstPerson.weapon.grip).trigger.position[2];
  const world = state.gripTriggerDummy.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(world.x - forward) < 1e-3, 'a yawed character carries its forward offset with it');
  GRIP.clear(state);
});

// ==================================================================== 06 arms

test('the preview drives the shipped pose layer, so the arms reach the dummy', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  GRIP.build(state);
  const upper = boneNamed(state.model, 'mixamorigRightArm');
  const hand = boneNamed(state.model, 'mixamorigRightHand');
  const target = state.gripTriggerDummy.getWorldPosition(new THREE.Vector3());
  const before = hand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
  const rotation = upper.quaternion.clone();
  for(let frame = 0; frame < 30; frame++){
    GRIP.restore(state);
    GRIP.syncFrame(state);
    assert.equal(GRIP.pose(state), true, 'the layer reports that it moved the arms');
  }
  assert.ok(rotation.angleTo(upper.quaternion) > .01, 'the trigger arm actually rotated');
  const after = hand.getWorldPosition(new THREE.Vector3()).distanceTo(target);
  assert.ok(after < before, 'and it rotated TOWARDS the dummy (' + after.toFixed(3) + ' < ' + before.toFixed(3) + ')');
  GRIP.clear(state);
});

test('the preview sends each authored hand rotation through the shipped pose layer', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  GRIP.build(state);
  const hand = boneNamed(state.model, 'mixamorigRightHand');
  GRIP.pose(state);
  const untwisted = hand.quaternion.clone();
  GRIP.restore(state);
  definition.firstPerson.weapon.grip.trigger.rotation = [0, 0, 70];
  GRIP.syncDummies(state);
  GRIP.pose(state);
  assert.ok(untwisted.angleTo(hand.quaternion) > .1,
    'rotating the dummy must rotate the rig hand, not merely save a number');
  GRIP.clear(state);
});

test('leaving the layer restores the clip pose exactly', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  GRIP.build(state);
  const upper = boneNamed(state.model, 'mixamorigRightArm');
  const support = boneNamed(state.model, 'mixamorigLeftArm');
  const poses = [upper.quaternion.clone(), support.quaternion.clone()];
  GRIP.pose(state);
  assert.ok(poses[0].angleTo(upper.quaternion) > .01);
  assert.equal(GRIP.restore(state), true);
  assert.ok(poses[0].angleTo(upper.quaternion) < 1e-9, 'the mixer pose comes back untouched');
  assert.ok(poses[1].angleTo(support.quaternion) < 1e-9);
  assert.equal(GRIP.restore(state), false, 'restoring twice is not a second correction');
  GRIP.clear(state);
});

test('a repeated frame converges instead of bending the arm further every tick', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  GRIP.build(state);
  const hand = boneNamed(state.model, 'mixamorigRightHand');
  const frame = () => { GRIP.restore(state); GRIP.pose(state); };
  for(let i = 0; i < 40; i++) frame();
  const settled = hand.getWorldPosition(new THREE.Vector3());
  for(let i = 0; i < 20; i++) frame();
  const again = hand.getWorldPosition(new THREE.Vector3());
  assert.ok(settled.distanceTo(again) < .002, 'the arm settles rather than creeping');
  assert.ok(Number.isFinite(again.x) && Number.isFinite(again.y) && Number.isFinite(again.z));
  GRIP.clear(state);
});

test('a mesh with no arm bones is declined instead of crashing', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  state.scene.remove(state.model);
  state.model = new THREE.Group();
  state.scene.add(state.model);
  GRIP.build(state);
  assert.equal(GRIP.pose(state), false, 'nothing to bend, and nothing thrown');
  assert.ok(GRIP.targets(state).triggerTarget, 'the dummy is still placeable and still authored');
  GRIP.clear(state);
});

// ================================================================ 07 disposal

test('clearing the dummies disposes every geometry and material it created', () => {
  // This editor leaked GPU memory before, and the dummies are rebuilt on every
  // motion selection, so a missed dispose here is a leak per click.
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  const group = GRIP.build(state);
  const pending = [];
  group.traverse(node => {
    if(node.geometry) pending.push(node.geometry);
    const materials = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
    materials.forEach(material => pending.push(material));
  });
  assert.ok(pending.length >= 8, 'the dummies own several GPU resources: ' + pending.length);
  const disposed = new Set();
  pending.forEach(resource => {
    const original = resource.dispose && resource.dispose.bind(resource);
    resource.dispose = () => { disposed.add(resource); if(original) original(); };
  });
  const upper = boneNamed(state.model, 'mixamorigRightArm');
  const pose = upper.quaternion.clone();
  GRIP.pose(state);
  GRIP.clear(state);
  pending.forEach(resource => assert.ok(disposed.has(resource), 'an undisposed ' + resource.type + ' is a leak'));
  assert.equal(group.parent, null, 'and the group leaves the scene');
  assert.equal(state.gripGroup, null);
  assert.equal(state.gripTriggerDummy, null);
  assert.equal(state.gripSupportDummy, null);
  assert.equal(state.previewGripPose, null);
  assert.ok(pose.angleTo(upper.quaternion) < 1e-9, 'and the arms are handed back unbent');
});

test('clearing detaches the gizmo so it cannot hold a disposed dummy', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  let detached = 0;
  state.transformControls = {object:null, detach(){ detached++; this.object = null; }};
  GRIP.build(state);
  state.transformControls.object = state.gripTriggerDummy;
  GRIP.clear(state);
  assert.equal(detached, 1);
  assert.equal(state.transformControls.object, null);
});

test('rebuilding is idempotent: the previous dummies are gone, not stacked', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  const first = GRIP.build(state);
  const second = GRIP.build(state);
  assert.notEqual(first, second);
  assert.equal(first.parent, null);
  assert.equal(state.scene.children.filter(child => child.userData.lkPawnStudioGrip).length, 1);
  GRIP.clear(state);
});

test('the grip viewport draws the same weapon model as Play and disposes it', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  const state = studioState(definition);
  GRIP.build(state);
  const visual = state.gripWeaponPreview;
  assert.ok(visual && visual.userData.lkPawnStudioWeaponPreview, 'a real runtime weapon is visible between the hands');
  assert.ok(visual.children.length > 0, 'the preview is not a label or an empty editor placeholder');
  GRIP.clear(state);
  assert.equal(visual.parent, null);
});

test('an untouched preview weapon follows the trigger-hand forward axis', () => {
  const definition=characterDefinition({id:'primary',preset:'rifle'}),state=studioState(definition);GRIP.build(state);
  state.gripTriggerDummy.rotation.set(.3,.7,-.4);GRIP.syncWeapon(state);
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(state.gripWeaponPreview.quaternion),handForward=new THREE.Vector3(0,0,1).applyQuaternion(state.gripTriggerDummy.quaternion);
  assert.ok(forward.distanceTo(handForward)<1e-9,'the barrel points along the owning hand, including its authored rotation');GRIP.clear(state);
});

test('the support hand cannot move or rotate the preview weapon', () => {
  const definition=characterDefinition({id:'primary',preset:'rifle'}),state=studioState(definition);GRIP.build(state);
  state.gripTriggerDummy.position.set(.24,-.12,.48);state.gripTriggerDummy.rotation.set(.2,-.35,.1);GRIP.syncWeapon(state);
  const position=state.gripWeaponPreview.position.clone(),rotation=state.gripWeaponPreview.quaternion.clone();
  state.gripSupportDummy.position.set(-8,12,4);state.gripSupportDummy.rotation.set(-1.1,2.2,.7);GRIP.syncWeapon(state);
  assert.ok(state.gripWeaponPreview.position.distanceTo(position)<1e-9,'support IK does not translate the weapon');
  assert.ok(state.gripWeaponPreview.quaternion.angleTo(rotation)<1e-9,'support IK does not rotate the weapon');GRIP.clear(state);
});

test('moving and rotating the weapon preview writes the saved socket', () => {
  const definition=characterDefinition({id:'primary',preset:'rifle'}),state=studioState(definition);GRIP.build(state);
  const visual=state.gripWeaponPreview,hand=state.gripTriggerDummy;visual.position.copy(hand.position).add(new THREE.Vector3(.08,.03,.02));visual.rotateZ(.25);visual.scale.setScalar(1.4);
  assert.equal(GRIP.readWeaponSocket(state),true);const socket=STUDIO.weaponSocketConfig(definition,false);
  assert.ok(socket.offset.some(value=>Math.abs(value)>.01));assert.ok(Math.abs(socket.rotation[2]-.25)<1e-4);assert.equal(socket.scale,1.4);GRIP.clear(state);
});

test('Pawn Studio persists the trigger-hand socket and previews it on the trigger dummy', () => {
  const definition=characterDefinition({id:'primary',preset:'rifle'}),state=studioState(definition);
  const socket=STUDIO.weaponSocketConfig(definition,true);
  socket.offset=[.04,.02,-.03];socket.rotation=[0,.2,0];socket.scale=1.25;socket.followHandRotation=true;
  GRIP.build(state);
  state.gripTriggerDummy.position.set(.31,-.16,.54);state.gripTriggerDummy.rotation.set(.2,-.1,.3);GRIP.syncWeapon(state);
  const visual=state.gripWeaponPreview,expected=state.gripTriggerDummy.position.clone(),nudge=new THREE.Vector3().fromArray(socket.offset).applyQuaternion(visual.quaternion);
  expected.add(nudge);
  assert.ok(visual.position.distanceTo(expected)<1e-9,'the visible weapon rides the authored trigger-hand socket');
  assert.ok(Math.abs(visual.scale.x-1.25)<1e-9);
  assert.equal(STUDIO.weaponSocketConfig(definition,false).followHandRotation,true);
  assert.deepEqual(definition.firstPerson.weaponSocket.offset,[.04,.02,-.03],'socket data lives in the saved Pawn definition');
  GRIP.clear(state);
});

test('configured loadout weapons are independent grip authoring targets', () => {
  const definition = characterDefinition({id:'primary', preset:'rifle'});
  definition.loadout = [{id:'sidearm', preset:'pistol'}, {id:'utility', preset:'grenade'}];
  const entries = STUDIO.gripWeaponEntries(definition);
  assert.deepEqual(entries.map(entry => entry.key), ['primary', 'loadout:0', 'loadout:1']);
  const state = studioState(definition, {gripWeaponKey:'loadout:0'});
  GRIP.build(state);
  assert.equal(definition.loadout[0].grip.hands, 'single');
  state.gripTriggerDummy.position.set(.27, -.11, .44);
  GRIP.read(state);
  assert.deepEqual(definition.loadout[0].grip.trigger.position, [.27, -.11, .44]);
  assert.equal(definition.firstPerson.weapon.grip, undefined, 'testing a loadout weapon does not rewrite the starting weapon');
  GRIP.clear(state);
});

test('twelve contextual states remain isolated from the base grip and each other', () => {
  assert.equal(STUDIO.gripContexts().length,13,'base plus 3 gaits × 2 aim modes × 2 weapon sides');
  const definition=characterDefinition({id:'primary',preset:'rifle'}),state=studioState(definition,{gripContextKey:'hip.walk.right'});
  const profile=STUDIO.stateWeaponGripConfig(state,true),base=definition.firstPerson.weapon.grip;
  profile.trigger.position=[.31,-.22,.47];profile.fingers.trigger.index=.82;
  assert.deepEqual(base.profiles['hip.walk.right'].trigger.position,[.31,-.22,.47]);
  assert.deepEqual(base.trigger.position,global.LK_RUNTIME_CHARACTER_WEAPON_POSE.resolveGrip({preset:'rifle'},[]).trigger.position,'the fallback is untouched');
  state.gripContextKey='aim.walk.right';const aimed=STUDIO.stateWeaponGripConfig(state,true);
  assert.notDeepEqual(aimed.trigger.position,profile.trigger.position,'aiming owns an independent state snapshot');
  assert.equal(aimed.fingers.trigger.index,0,'finger authoring does not leak to another state');
});

test('a left-side context mirrors the viewport while saving character-relative values', () => {
  const definition=characterDefinition({id:'primary',preset:'pistol'}),state=studioState(definition,{gripContextKey:'hip.idle.left'}),profile=STUDIO.stateWeaponGripConfig(state,true);
  profile.trigger.position=[.24,-.18,.42];GRIP.build(state);
  assert.equal(Number(state.gripTriggerDummy.position.x.toFixed(3)),-.24,'left shoulder preview mirrors the authored right-axis value');
  state.gripTriggerDummy.position.x=-.36;GRIP.read(state);
  assert.equal(definition.firstPerson.weapon.grip.profiles['hip.idle.left'].trigger.position[0],.36,'storage stays in the portable character frame');
  GRIP.clear(state);
});

// ================================================================== 08 wiring

test('the Pawn tree offers Weapon Grip and shows the grip on its badge', () => {
  const graph = {characterPawn:characterDefinition({id:'primary', preset:'pistol'}), logicScene:{elements:[]}};
  const adapter = STUDIO.resolveType(graph);
  const containers = adapter.containers({graph, definition:graph.characterPawn, adapter});
  const container = containers.find(item => item.id === 'weapon-grip');
  assert.ok(container, 'the container exists');
  assert.equal(container.kind, 'weapon-grip');
  assert.equal(container.badge, 'single', 'one hand or two is visible without opening it');
  const bare = {characterPawn:characterDefinition(null), logicScene:{elements:[]}};
  const bareContainers = adapter.containers({graph:bare, definition:bare.characterPawn, adapter});
  assert.equal(bareContainers.find(item => item.id === 'weapon-grip').badge, 'double');
  assert.equal(bare.characterPawn.firstPerson, undefined, 'drawing the tree writes nothing');
});

test('the viewport and the panel are wired to the grip mode', () => {
  // A browser is needed to click these, so what is checked is that the code
  // exists and is connected. Comments are stripped first: an assertion that can
  // pass on prose is worse than no assertion.
  const raw = fs.readFileSync(path.join(__dirname, '../js/editor/pawn-studio.js'), 'utf8');
  const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
  assert.match(code, /data-action="grip"/, 'the toolbar has the Hands button');
  assert.match(code, /data-action="grip-hand"/, 'and a trigger/support selector');
  assert.match(code, /data-action="grip-layer"/, 'and a hold/aim/fire selector');
  assert.match(code, /data-action="grip-weapon"/, 'and a direct weapon socket gizmo selector');
  assert.match(code, /Grip state to author/, 'and the full locomotion, aim and side context selector');
  assert.match(code, /Trigger-hand fingers/, 'and simple per-finger authoring for both hands');
  assert.match(code, /gripButton\.addEventListener\('click'/, 'the button toggles the mode');
  assert.match(code, /gripHandSelect\.addEventListener\('change'/);
  assert.match(code, /addEventListener\('pointerdown',state\.gripPointerHandler,true\)/,
    'the visible dummies themselves select the hand before TransformControls starts dragging');
  assert.match(code, /gripResetButton\.addEventListener\('click'/);
  assert.match(code, /container\.kind==='weapon-grip'/, 'the container renders a panel');
  assert.equal((code.match(/renderGripEditor\(/g) || []).length, 3,
    'the grip panel is defined once and rendered from both the container and a Motion slot');
  assert.match(code, /if\(state\.gripMode\)\{syncGripFrame\(state\);applyGripPose\(state\);\}/,
    'the preview loop runs the pose layer every frame while the mode is on');
  assert.match(code, /if\(state\.gripMode\)restoreGripPose\(state\)/,
    'and restores the clip pose before the next one');
  assert.match(code, /clearGripDummies\(active\)/, 'closing the studio disposes the dummies');
});

console.log('\npawn studio weapon grip tests passed');
