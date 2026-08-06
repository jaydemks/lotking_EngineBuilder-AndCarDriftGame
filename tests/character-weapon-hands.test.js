'use strict';

/* =========================================================
   Where the hands END UP, and what the body plays while they get there.

   The grip descriptor already said where a hand should go. Nothing checked whether
   a hand ARRIVED, and it did not: the pose layer aimed both arm bones at the grip
   point, and aiming is not arriving. An arm pointed at a grip .40 m away still
   straightens to its full .54 m, so the hand overshot by the remainder - and once
   the arm was straight it had nowhere left to travel. Measured on the chain below,
   before the elbow solve:

     rifle trigger hand    .134 m past the grip point
     unarmed punch         .011 m of forward travel, for a full-arm punch
     knife stab            .005 m
     support hand          .442 m short, arm locked straight at the horizon

   A punch of eleven millimetres is invisible, which is exactly the report: the
   base worked and the arms were wrong. So this file asserts on WORLD POSITIONS of
   real bones after the real functions have run. No source text: the last two
   defects in this area were a missing `scratch.local` that threw every frame
   behind a passing grep, and three regexes that matched a code COMMENT.

   HOW THIS FILE IS ORGANISED
     01 harness    a Mixamo-named chain, and a live Pawn standing at the origin
     02 reach      the trigger hand lands ON the grip, and both hands converge
     03 strikes    the punch and the stab travel, forward, outside the ribs
     04 states     idle, aiming and firing put the hands in three places
     05 safety     no NaN, no drift, no hand inside the chest
     06 stance     the aim and fire clips are actually asked for, and held
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');

global.window = global;
global.THREE = THREE;
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
require('../js/runtime/character-movement.js');
require('../js/runtime/character-animation-set.js');
require('../js/runtime/character-animation-blend.js');
require('../js/runtime/soccer-locomotion.js');
require('../js/runtime/first-person-view-pawn.js');
require('../js/runtime/first-person-controller.js');
require('../js/runtime/character-weapon-pose.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/character-pawns.js');

const POSE = global.LK_RUNTIME_CHARACTER_WEAPON_POSE;
const PAWNS = global.LK_RUNTIME_CHARACTER_PAWNS;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// ================================================================= 01 harness

/* The same chain tests/character-weapon-pose.test.js uses, and deliberately the
   same proportions: shoulders .18 either side of the spine at y 1.50, an upper arm
   of .28 and a forearm of .26, so the whole arm reaches .54 m. Those numbers are
   what make the assertions below readable - a grip .40 m from the eye is INSIDE
   the reach and must be landed on exactly, while the rifle foregrip at .90 m is
   outside it and can only be extended toward. */
const UPPER_ARM = .28, FOREARM = .26, ARM = UPPER_ARM + FOREARM;
const SHOULDER_HALF_SPAN = .18, SHOULDER_HEIGHT = 1.5, CHEST_HEIGHT = 1.4;

function rig(){
  const root = new THREE.Object3D();
  const chest = new THREE.Bone();
  chest.name = 'mixamorigSpine2';
  chest.position.set(0, CHEST_HEIGHT, 0);
  root.add(chest);
  // Mixamo puts the character's own right on -X while it faces +Z, which is the
  // same handedness the eye frame reports (see `eyeFrame` below). A mirrored
  // harness would quietly turn every cross-body reach into a straight one.
  ['Left', 'Right'].forEach(side => {
    const sign = side === 'Left' ? 1 : -1;
    const upper = new THREE.Bone();
    upper.name = 'mixamorig' + side + 'Arm';
    upper.position.set(SHOULDER_HALF_SPAN * sign, SHOULDER_HEIGHT - CHEST_HEIGHT, 0);
    const lower = new THREE.Bone();
    lower.name = 'mixamorig' + side + 'ForeArm';
    lower.position.set(UPPER_ARM * sign, 0, 0);
    const hand = new THREE.Bone();
    hand.name = 'mixamorig' + side + 'Hand';
    hand.position.set(FOREARM * sign, 0, 0);
    lower.add(hand);
    upper.add(lower);
    chest.add(upper);
  });
  root.updateMatrixWorld(true);
  return root;
}
function bone(root, name){
  let found = null;
  root.traverse(item => { if(item.name === name) found = item; });
  assert.ok(found, 'the harness carries a ' + name);
  return found;
}
function world(object){ return object.getWorldPosition(new THREE.Vector3()); }
function vector(point){ return new THREE.Vector3(point.x, point.y, point.z); }

/** The hands after the real pose layer has settled on a fresh chain.
 *
 *  Settled, not applied once: a bound rig is re-posed by the AnimationMixer every
 *  frame and the layer slerps toward its solution, so the honest question is where
 *  the arms come to rest while a pose is held. */
function settle(pose, weight, iterations){
  const root = rig();
  for(let index = 0; index < (iterations || 24); index++) POSE.apply(THREE, root, pose, weight == null ? 1 : weight);
  return {
    root,
    trigger:world(bone(root, 'mixamorigRightHand')),
    support:world(bone(root, 'mixamorigLeftHand')),
    triggerShoulder:world(bone(root, 'mixamorigRightArm')),
    supportShoulder:world(bone(root, 'mixamorigLeftArm')),
    chest:world(bone(root, 'mixamorigSpine2')),
  };
}

function makeGame(){
  const game = {systems:{}, state:{}, world:{colliders:{box:[], circle:[]}}, core:{}};
  game.pawns = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);
  return game;
}
/** A live Pawn standing at the world origin, facing +Z, eyes at 1.62.
 *
 *  The origin and the zero heading are the point: the eye frame the rig produces
 *  then lands in the same space as the bone chain above, so a target the real
 *  `weaponPose()` computes can be handed to the real pose layer and the result is
 *  one coherent body rather than two unrelated coordinate systems. */
let pawnSerial = 0;
function armedPawn(weapon, extra){
  const game = makeGame();
  const owner = new THREE.Object3D();
  owner.userData.logicInstanceId = 'hands-pawn-' + (++pawnSerial);
  const pawn = PAWNS.createLogic(game, owner, Object.assign({
    id:owner.userData.logicInstanceId,
    playerId:null, possessed:false,
    spawn:{x:0, y:0, z:0, heading:0},
    firstPerson:{enabled:true, view:'third', presentation:'body', hideOwnBody:false,
      eyeHeight:SHOULDER_HEIGHT + .12, weapon:weapon || {preset:'rifle'}},
  }, extra || {}), {});
  pawn.start();
  assert.ok(pawn.firstPerson && pawn.firstPerson.armed(), 'the harness Pawn is holding something');
  assert.equal(pawn.firstPersonViewPawn,null,'a TPS/body camera does not instantiate the optional arms Pawn');
  return pawn;
}
function eyeFrame(pawn){
  const eye = pawn.firstPerson.eyeTransform();
  assert.ok(eye, 'the rig produces an eye transform');
  assert.ok(Math.abs(eye.forward.z - 1) < 1e-6 && Math.abs(eye.right.x + 1) < 1e-6,
    'the harness Pawn faces +Z with its own right on -X, matching the bone chain');
  return {position:vector(eye.position), forward:vector(eye.forward), right:vector(eye.right)};
}
/** How far along the sight line a point sits, and how far off it. Reported
 *  separately because "the fist went forward" and "the fist went sideways" are
 *  different answers and a plain distance cannot tell them apart. */
function alongSight(eye, point){
  const offset = vector(point).sub(eye.position);
  const forward = offset.dot(eye.forward);
  return {forward, lateral:Math.sqrt(Math.max(0, offset.lengthSq() - forward * forward))};
}
function finiteVector(point, message){
  ['x', 'y', 'z'].forEach(axis => assert.ok(Number.isFinite(point[axis]),
    message + ': ' + axis + ' is ' + point[axis] + ', which would destroy the whole skeleton'));
}

// The rifle's default support point is the foregrip of a weapon carried .90 m
// ahead of the eye; from a shoulder .18 m across and .12 m below that eye it is
// .98 m away, which no .54 m arm reaches. The reach limit is the pose layer's
// answer and this is the same number, so the assertions can say which of the two
// cases they are in.
const MAX_REACH = ARM * .995;

// =================================================================== 02 reach

test('the trigger hand lands ON the grip point instead of overshooting it', () => {
  const pawn = armedPawn({preset:'rifle'});
  const pose = pawn.weaponPose();
  const hands = settle(pose);
  const target = vector(pose.triggerTarget);
  assert.ok(hands.triggerShoulder.distanceTo(target) < ARM,
    'the harness grip point is inside the arm, or this test is measuring the reach clamp instead');
  assert.ok(hands.trigger.distanceTo(target) < .02,
    'the trigger hand is ' + hands.trigger.distanceTo(target).toFixed(3) + ' m from the grip; aiming the arm at it left .134');
});

test('a two-handed weapon brings both hands onto the same weapon', () => {
  const pawn = armedPawn({preset:'rifle'});
  const pose = pawn.weaponPose();
  assert.equal(pose.grip.hands, 'double');
  assert.ok(pose.supportTarget, 'a shouldered weapon asks for the second hand');
  const eye = eyeFrame(pawn);
  const hands = settle(pose);
  const separation = hands.trigger.distanceTo(hands.support);
  assert.ok(separation < .35,
    'the hands are ' + separation.toFixed(3) + ' m apart, which is no longer one weapon');
  const trigger = alongSight(eye, hands.trigger), support = alongSight(eye, hands.support);
  assert.ok(support.forward > trigger.forward + .04,
    'the support hand sits ahead of the trigger hand, along the weapon, not behind it');
  // The foregrip is past the arm, so the honest result is a fully extended arm
  // reaching for it - and the hand must be AT the limit rather than short of it,
  // which is the difference between extending and giving up.
  const reach = hands.supportShoulder.distanceTo(hands.support);
  assert.ok(Math.abs(reach - MAX_REACH) < .01,
    'the support arm extends to its limit (' + reach.toFixed(3) + ' of ' + MAX_REACH.toFixed(3) + ')');
});

test('a one-handed weapon leaves the other arm out of it', () => {
  const pawn = armedPawn({preset:'pistol'});
  const pose = pawn.weaponPose();
  assert.equal(pose.grip.hands, 'single');
  assert.equal(pose.supportTarget, null, 'nothing sends the off hand at a weapon that needs one hand');
  const rest = settle({side:pose.side, triggerTarget:null}, 1, 1);
  const hands = settle(pose);
  assert.ok(hands.support.distanceTo(rest.support) < 1e-9,
    'the off arm is exactly where the animation left it');
  assert.ok(hands.trigger.distanceTo(hands.support) > .5,
    'and it is nowhere near the grip, so it does not read as reaching for the weapon');
});

// ================================================================= 03 strikes

test('the unarmed punch travels forward, past the chest, and never into it', () => {
  const pawn = armedPawn({kind:'unarmed', preset:'fists'});
  const eye = eyeFrame(pawn);
  const guard = settle(pawn.weaponPose());
  pawn.firstPerson.state.sinceShot = 0;
  const punchPose = pawn.weaponPose();
  assert.equal(punchPose.firing, true, 'the recoil layer is what a punch is made of');
  const punch = settle(punchPose);
  const from = alongSight(eye, guard.trigger), to = alongSight(eye, punch.trigger);
  assert.ok(to.forward - from.forward > .12,
    'the fist travels ' + (to.forward - from.forward).toFixed(3) + ' m forward; aiming the arm gave .011');
  assert.ok(to.forward > guard.chest.z + .25,
    'the fist finishes well ahead of the sternum at z ' + guard.chest.z.toFixed(3));
  // Both ends of the strike, and every blend between them, stay outside the ribs.
  // The torso radius is half the shoulder span, which is what the pose layer
  // measures off the rig itself.
  const ribs = SHOULDER_HALF_SPAN;
  [guard.trigger, punch.trigger].forEach(hand => assert.ok(
    Math.sqrt(Math.pow(hand.x - guard.chest.x, 2) + Math.pow(hand.y - guard.chest.y, 2) + Math.pow(hand.z - guard.chest.z, 2)) > ribs,
    'a fist inside the chest is not a pose'));
  assert.ok(punch.support.distanceTo(guard.support) < 1e-9,
    'the guarding fist holds its place while the other one strikes');
});

test('the knife stabs along the blade, not out to a rifle length', () => {
  const pawn = armedPawn({kind:'melee', preset:'knife'});
  const eye = eyeFrame(pawn);
  const pose = pawn.weaponPose();
  assert.equal(pose.supportTarget, null, 'a blade is held in one hand');
  const held = settle(pose);
  pawn.firstPerson.state.sinceShot = 0;
  const stab = settle(pawn.weaponPose());
  const from = alongSight(eye, held.trigger), to = alongSight(eye, stab.trigger);
  assert.ok(to.forward - from.forward > .12,
    'the blade travels ' + (to.forward - from.forward).toFixed(3) + ' m along its own axis; it used to travel .005');
  const travel = vector(stab.trigger).sub(held.trigger);
  const forward = travel.dot(eye.forward);
  const sideways = Math.sqrt(Math.max(0, travel.lengthSq() - forward * forward));
  assert.ok(sideways < forward * .35,
    'the stab is a thrust: ' + sideways.toFixed(3) + ' m sideways for ' + forward.toFixed(3) + ' m forward');
  assert.ok(from.forward < .45,
    'and it is held close, at ' + from.forward.toFixed(3) + ' m, rather than presented at arm\'s length');
});

// ================================================================== 04 states

test('idle, aiming and firing put the trigger hand in three measurably different places', () => {
  const pawn = armedPawn({preset:'rifle'});
  const idle = settle(pawn.weaponPose()).trigger;
  pawn.firstPerson.state.ads = 1;
  const aiming = settle(pawn.weaponPose()).trigger;
  pawn.firstPerson.state.ads = 0;
  pawn.firstPerson.state.sinceShot = 0;
  const firing = settle(pawn.weaponPose()).trigger;
  assert.ok(idle.distanceTo(aiming) > .05,
    'raising the sights moves the hands ' + idle.distanceTo(aiming).toFixed(3) + ' m');
  assert.ok(idle.distanceTo(firing) > .05,
    'the shot moves the hands ' + idle.distanceTo(firing).toFixed(3) + ' m');
  assert.ok(aiming.distanceTo(firing) > .05,
    'and aiming does not look like firing, which is the whole complaint');
});

test('the aim layer eases in with the sights rather than snapping', () => {
  const pawn = armedPawn({preset:'rifle'});
  const idle = settle(pawn.weaponPose()).trigger;
  pawn.firstPerson.state.ads = .5;
  const half = settle(pawn.weaponPose()).trigger;
  pawn.firstPerson.state.ads = 1;
  const full = settle(pawn.weaponPose()).trigger;
  assert.ok(idle.distanceTo(half) > .01, 'half-raised sights already moved the hands');
  assert.ok(idle.distanceTo(half) < idle.distanceTo(full) - .01, 'and they keep travelling as the sights come up');
});

test('a support hand within reach answers the aim and the shot as well', () => {
  // A grip the arm can actually close on: the offsets then arrive on the hand
  // one-for-one, which is the point of authoring them. Without this the shooting
  // arm works against a hand nailed to the air.
  const pawn = armedPawn({preset:'rifle'},
    {weaponGrip:{support:[.10, -.14, .42], aimSupport:[-.09, .04, -.05], fireSupport:[0, 0, -.08]}});
  const idle = settle(pawn.weaponPose());
  assert.ok(idle.supportShoulder.distanceTo(idle.support) < MAX_REACH - .01,
    'the authored grip is inside the arm, so this measures the offsets and not the clamp');
  pawn.firstPerson.state.ads = 1;
  const aiming = settle(pawn.weaponPose()).support;
  pawn.firstPerson.state.ads = 0;
  pawn.firstPerson.state.sinceShot = 0;
  const firing = settle(pawn.weaponPose()).support;
  assert.ok(idle.support.distanceTo(aiming) > .09, 'the support hand comes with the sights');
  assert.ok(idle.support.distanceTo(firing) > .06, 'and it absorbs the recoil too');
});

test('a foregrip beyond the arm is extended toward, and stays extended', () => {
  // The default support point is the foregrip of a weapon carried .90 m ahead of
  // the eye, and no human arm reaches that from the shoulder - not this .54 m one
  // and not a real Mixamo .58 m one. An arm already at full extension cannot
  // absorb a recoil layer by extending further, so the honest requirement is that
  // it holds its line instead of collapsing or snapping somewhere else.
  const pawn = armedPawn({preset:'rifle'});
  const idle = settle(pawn.weaponPose());
  assert.ok(idle.supportShoulder.distanceTo(vector(pawn.weaponPose().supportTarget)) > ARM,
    'the default foregrip really is out of reach');
  pawn.firstPerson.state.sinceShot = 0;
  const firing = settle(pawn.weaponPose());
  assert.ok(Math.abs(firing.supportShoulder.distanceTo(firing.support) - MAX_REACH) < .01,
    'the arm is still at its limit rather than folding');
  assert.ok(firing.support.distanceTo(idle.support) < .05,
    'and it holds its line through the shot');
});

// ================================================================== 05 safety

test('a hand target authored inside the chest is put back outside it', () => {
  // .05 m ahead of the eye and .20 m below it is the middle of the sternum. The
  // solver would reach it happily, which is a hand inside the body.
  const pawn = armedPawn({preset:'rifle'}, {weaponGrip:{trigger:[0, -.20, .05], supportHand:'off'}});
  const pose = pawn.weaponPose();
  const hands = settle(pose);
  const inside = vector(pose.triggerTarget).distanceTo(hands.chest);
  assert.ok(inside < SHOULDER_HALF_SPAN, 'the authored target really is inside the ribs (' + inside.toFixed(3) + ' m)');
  assert.ok(hands.trigger.distanceTo(hands.chest) > SHOULDER_HALF_SPAN - .01,
    'the hand ends on the surface of the torso, not in it (' + hands.trigger.distanceTo(hands.chest).toFixed(3) + ' m)');
  finiteVector(hands.trigger, 'the ejected hand');
});

test('nothing the solver produces is ever NaN', () => {
  const pawn = armedPawn({preset:'rifle'});
  // Every awkward case in one sweep: at the shoulder, behind the back, straight
  // up, far away, and exactly on the shoulder joint itself.
  const shoulder = world(bone(rig(), 'mixamorigRightArm'));
  const targets = [
    {x:shoulder.x, y:shoulder.y, z:shoulder.z},
    {x:0, y:1.5, z:-4}, {x:0, y:9, z:0}, {x:0, y:1.5, z:40},
    {x:0, y:CHEST_HEIGHT, z:0},
  ];
  targets.forEach(target => {
    const hands = settle({side:1, triggerTarget:target, supportTarget:target}, 1, 6);
    finiteVector(hands.trigger, 'the trigger hand at ' + JSON.stringify(target));
    finiteVector(hands.support, 'the support hand at ' + JSON.stringify(target));
    assert.ok(hands.triggerShoulder.distanceTo(hands.trigger) <= ARM + 1e-6,
      'and the arm is never stretched past its bones');
  });
  assert.ok(pawn.weaponPose(), 'the Pawn survived the sweep');
});

test('a held pose settles and then stays settled, at the default weight too', () => {
  const pawn = armedPawn({preset:'rifle'});
  const pose = pawn.weaponPose();
  const root = rig();
  const hand = bone(root, 'mixamorigRightHand');
  for(let index = 0; index < 40; index++) POSE.apply(THREE, root, pose, null);
  const settled = world(hand);
  for(let index = 0; index < 10; index++) POSE.apply(THREE, root, pose, null);
  const again = world(hand);
  assert.ok(settled.distanceTo(again) < .002,
    'the solve converges instead of creeping: ' + settled.distanceTo(again).toFixed(4) + ' m over ten frames');
  assert.ok(again.distanceTo(vector(pose.triggerTarget)) < .03,
    'and the default weight still arrives at the grip (' + again.distanceTo(vector(pose.triggerTarget)).toFixed(3) + ' m)');
});

// ================================================================== 06 stance

/** A locomotion controller that records what it is asked to play.
 *
 *  It answers exactly as the model-driven controller does at this boundary: a
 *  slot with no clip behind it is DECLINED (soccer-locomotion.js returns false
 *  when `findClip` finds nothing), a looping action stays playing until something
 *  replaces or stops it, and a one-shot finishes and hands the slot back. Those
 *  three behaviours are the whole contract the stance driver depends on. */
function recorder(clips){
  const log = [];
  let playing = null;
  const controller = {
    bind:() => true,
    isBound:() => true,
    availableClips:() => clips.slice(),
    update:() => {},
    playAction:(clip, options) => {
      const opts = options || {};
      const slot = String(opts.slot || clip || '');
      log.push({slot, clip:String(clip || ''), loop:opts.loop === true});
      if(clips.indexOf(slot) < 0) return false;
      playing = {slot, loop:opts.loop === true, onDone:typeof opts.onDone === 'function' ? opts.onDone : null};
      return true;
    },
    stopAction:() => { const done = playing && playing.onDone; playing = null; if(done) done(); },
    isActionPlaying:() => !!playing,
    actionDuration:() => .3,
    configure:() => {},
    dispose:() => { playing = null; },
  };
  controller.log = log;
  controller.playingSlot = () => (playing ? playing.slot : null);
  controller.finish = () => controller.stopAction();
  return controller;
}
let bound = null;
global.LK_RUNTIME_CHARACTER_LOCOMOTION = {createController:() => bound};
// A Pawn with no model falls back to the procedural placeholder, which poses the
// arms itself. It is registered here only so that path can be told apart from
// "no locomotion at all".
global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION = {createController:() => {
  const controller = recorder([]);
  controller.placeholder = true;
  return controller;
}};

/** A Pawn whose locomotion is the recorder above, i.e. a rigged model. */
function riggedPawn(clips, weapon, extra){
  bound = recorder(clips);
  const pawn = armedPawn(weapon, extra);
  const holder = new THREE.Object3D();
  holder.userData = {logicElementSceneId:'character_model', logicElementAssetKey:'body.glb'};
  const visual = new THREE.Object3D();
  visual.userData = {logicElementAssetVisual:true};
  holder.add(visual);
  pawn.owner.add(holder);
  assert.ok(pawn.ensureLocomotion(), 'the harness Pawn binds a model controller');
  assert.equal(pawn.locomotionKind, 'model');
  return {pawn, clips:bound};
}
function frame(pawn, seconds){ pawn.updateLocomotionFrame(seconds || 1 / 60, {}, null); }
function stanceCalls(controller){ return controller.log.filter(entry => entry.loop === true); }

test('raising the sights holds the two-handed aim clip on the body', () => {
  const {pawn, clips} = riggedPawn(['idle', 'aimIdle', 'aimRifleIdle', 'fire'], {preset:'rifle'});
  frame(pawn);
  assert.equal(stanceCalls(clips).length, 0, 'a weapon merely carried holds no aim pose');
  pawn.firstPerson.state.ads = 1;
  frame(pawn);
  assert.deepEqual(stanceCalls(clips).map(entry => entry.slot), ['aimRifleIdle'],
    'both hands on the weapon means the rifle aim clip, chosen from the authored hand count');
  assert.equal(clips.playingSlot(), 'aimRifleIdle');
  assert.equal(pawn.state.weaponStance, 'aimRifleIdle');
  // The one that matters: a stance is a POSE, and latching `state.action` on it
  // would tell traversal, cover and the stance driver itself that the body is
  // busy for as long as the player holds the sights.
  assert.equal(pawn.state.action, null, 'holding the sights is not an action in flight');
});

test('a sidearm holds the one-handed aim clip', () => {
  const {pawn, clips} = riggedPawn(['idle', 'aimIdle', 'aimRifleIdle'], {preset:'pistol'});
  pawn.firstPerson.state.ads = 1;
  frame(pawn);
  assert.deepEqual(stanceCalls(clips).map(entry => entry.slot), ['aimIdle']);
});

test('crouching and moving have their own aimed clips', () => {
  const {pawn, clips} = riggedPawn(['aimIdle', 'aimRifleIdle', 'runAiming', 'crouchAimIdle'], {preset:'rifle'});
  pawn.firstPerson.state.ads = 1;
  pawn.state.crouch = .9;
  frame(pawn);
  assert.equal(pawn.state.weaponStanceClip, 'crouchAimIdle');
  pawn.state.crouch = 0;
  pawn.state.moving = true;
  pawn.state.speed = 4;
  frame(pawn);
  assert.equal(pawn.state.weaponStanceClip, 'runAiming');
});

test('a body without the exact clip falls back to the aim it does have', () => {
  const {pawn} = riggedPawn(['aimIdle'], {preset:'rifle'});
  pawn.firstPerson.state.ads = 1;
  pawn.state.crouch = .9;
  frame(pawn);
  assert.equal(pawn.state.weaponStance, 'crouchAimIdle', 'the wanted stance is remembered');
  assert.equal(pawn.state.weaponStanceClip, 'aimIdle', 'and the clip that exists is the one that plays');
});

test('a body with no aim clip at all is asked once, not once a frame', () => {
  const {pawn, clips} = riggedPawn(['idle'], {preset:'rifle'});
  pawn.firstPerson.state.ads = 1;
  for(let index = 0; index < 30; index++) frame(pawn);
  assert.equal(pawn.state.weaponStanceClip, null);
  assert.equal(stanceCalls(clips).length, 2,
    'the aimRifleIdle -> aimIdle chain is tried once and then left alone');
});

test('the stance is asked for once and then held', () => {
  const {pawn, clips} = riggedPawn(['aimRifleIdle'], {preset:'rifle'});
  pawn.firstPerson.state.ads = 1;
  for(let index = 0; index < 60; index++) frame(pawn);
  assert.equal(stanceCalls(clips).length, 1, 'a held pose is not restarted sixty times');
});

test('lowering the sights releases the stance', () => {
  const {pawn, clips} = riggedPawn(['aimRifleIdle'], {preset:'rifle'});
  pawn.firstPerson.state.ads = 1;
  frame(pawn);
  assert.equal(clips.playingSlot(), 'aimRifleIdle');
  pawn.firstPerson.state.ads = 0;
  frame(pawn);
  assert.equal(clips.playingSlot(), null, 'the aim pose is let go of');
  assert.equal(pawn.state.weaponStance, null);
});

test('firing plays the fire clip on the body, and the stance comes back after it', () => {
  const {pawn, clips} = riggedPawn(['aimRifleIdle', 'fire'], {preset:'rifle'},
    {animations:{fire:'fire', aimRifleIdle:'aimRifleIdle'}});
  pawn.firstPerson.state.ads = 1;
  frame(pawn);
  assert.equal(clips.playingSlot(), 'aimRifleIdle');
  // The real rig, firing a real shot. This is the path first-person-controller.js
  // takes for every kind that shoots, and it goes through pawn.playAction.
  assert.ok(pawn.firstPerson.fire(), 'the shot is taken');
  const shot = clips.log.filter(entry => entry.slot === 'fire');
  assert.equal(shot.length, 1, 'the body plays the shot');
  assert.equal(shot[0].loop, false, 'as a one-shot, not a hold');
  assert.equal(pawn.state.action, 'fire', 'and this one IS an action in flight');
  frame(pawn);
  assert.equal(stanceCalls(clips).length, 1, 'the shot is not cut short by the stance');
  clips.finish();
  assert.equal(pawn.state.action, null, 'the shot reports itself finished');
  pawn.firstPerson.state.cooldown = 0;
  pawn.firstPerson.state.sinceShot = 9;
  frame(pawn);
  assert.equal(clips.playingSlot(), 'aimRifleIdle', 'and the body returns to the shoulder');
  assert.equal(stanceCalls(clips).length, 2);
});

test('a traversal that owns the body is left alone', () => {
  const {pawn, clips} = riggedPawn(['aimRifleIdle', 'roll'], {preset:'rifle'});
  pawn.firstPerson.state.ads = 1;
  pawn.playAction('roll', {duration:.5});
  assert.equal(pawn.state.action, 'roll');
  frame(pawn);
  assert.equal(clips.playingSlot(), 'roll', 'the roll keeps the body');
  assert.equal(stanceCalls(clips).length, 0);
});

test('full-body actions release weapon IK and holster only unrelated weapons', () => {
  const {pawn}=riggedPawn(['idle','roll','shoot'],{preset:'rifle'});
  pawn.state.action='roll';
  assert.equal(pawn.weaponPose(),null,'a roll cannot receive the post-mixer arm solve');
  assert.equal(pawn.firstPerson.state.weaponHolstered,true,'an unrelated rifle disappears for the full-body roll');
  pawn.state.action='shoot';
  assert.equal(pawn.weaponPose(),null,'the authored full-body shot also owns its arm chains');
  assert.equal(pawn.firstPerson.state.weaponHolstered,false,'but the shot keeps the rifle on its animated hand');
  pawn.state.action=null;
  assert.ok(pawn.weaponPose(),'ordinary locomotion restores the weapon pose');
  assert.equal(pawn.firstPerson.state.weaponHolstered,false,'and restores the visual without changing equipment');
  assert.equal(pawn.firstPerson.config().weapon.preset,'rifle','the equipped inventory descriptor never changes');
});

test('a held climb owns both arms and cannot be replaced by the aim stance', () => {
  const {pawn, clips}=riggedPawn(['aimRifleIdle','climbUp'],{preset:'rifle'});
  pawn.firstPerson.state.ads=1;
  assert.equal(pawn.playAction('climbUp',{hold:true,loop:true}),true);
  pawn.state.abilityPose='climbUp';
  frame(pawn);
  assert.equal(clips.playingSlot(),'climbUp');
  assert.equal(clips.log.filter(entry=>entry.slot==='aimRifleIdle'||entry.slot==='aimIdle').length,0,
    'weapon stance must not overwrite traversal arm tracks');
  assert.equal(pawn.state.weaponStance,null);
});

test('the procedural placeholder is left to pose the arms itself', () => {
  bound = recorder([]);
  const pawn = armedPawn({preset:'rifle'});
  pawn.firstPerson.state.ads = 1;
  assert.ok(pawn.ensureLocomotion(), 'with no model the placeholder takes over');
  assert.equal(pawn.locomotionKind, 'placeholder');
  frame(pawn);
  assert.equal(pawn.state.weaponStance, null, 'no clip is held where there are no clips');
  assert.equal(pawn.locomotion.log.length, 0);
});

console.log('\ncharacter weapon hand tests passed');
