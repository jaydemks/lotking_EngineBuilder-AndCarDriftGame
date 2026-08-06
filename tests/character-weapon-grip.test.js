'use strict';

/* =========================================================
   The grip descriptor has to RUN, and the three states have to differ.

   Where a character's hands went used to be four numbers hardcoded inside a
   branch of `weaponPose()`: an author could not move a single one of them, and
   the two states the player actually complains about - sights up, and the
   instant of the shot - moved the WEAPON while leaving the ARMS where they were.

   This file refuses to check that from source text. The previous round of defects
   in this area were a missing `scratch.local` that threw every frame behind a
   passing grep, and three assertions that matched a code COMMENT. So everything
   below builds a real Pawn with the real view rig and the real bone chain, calls
   `pawn.weaponPose()` in each state, and compares the hand positions it gets.

   HOW THIS FILE IS ORGANISED
     01 harness     a live Character Pawn with a first-person rig, real THREE
     02 defaults    the descriptor reproduces the old hardcoded numbers exactly
     03 states      idle, aiming and firing put the hands in three places
     04 authoring   overrides reach the pose, through a binding and through data
     05 pose layer  the authored hand rotation moves a real bone, and settles
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
require('../js/runtime/soccer-locomotion.js');
require('../js/runtime/first-person-controller.js');
require('../js/runtime/character-weapon-pose.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/character-pawns.js');
require('../js/runtime/character-bodies.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-character.js');

const POSE = global.LK_RUNTIME_CHARACTER_WEAPON_POSE;
const PAWNS = global.LK_RUNTIME_CHARACTER_PAWNS;
const TEMPLATES = global.LK_LOGIC_TEMPLATES;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// ================================================================= 01 harness

function makeGame(){
  const game = {systems:{}, state:{}, world:{colliders:{box:[], circle:[]}}, core:{}};
  game.pawns = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);
  return game;
}

/** A live Character Pawn with the shared view rig, over the shoulder.
 *
 *  Not a stub: `weaponPose()` reads the rig's eye transform, weapon side, ADS
 *  blend and cooldown, so the only way to know it composes them correctly is to
 *  let the real controller produce them. */
let pawnSerial = 0;
function armedPawn(weapon, grip){
  const game = makeGame();
  const owner = new THREE.Object3D();
  owner.userData.logicInstanceId = 'grip-pawn-' + (++pawnSerial);
  owner.position.set(3, 0, -2);
  owner.rotation.y = .7;
  const pawn = PAWNS.createLogic(game, owner, {
    id:owner.userData.logicInstanceId,
    playerId:null, possessed:false,
    spawn:{x:3, y:0, z:-2, heading:.7},
    weaponGrip:grip || null,
    firstPerson:{enabled:true, view:'third', presentation:'body', hideOwnBody:false,
      eyeHeight:1.62, weapon:weapon || {preset:'rifle'}},
  }, {});
  pawn.start();
  assert.ok(pawn.firstPerson && pawn.firstPerson.armed(), 'the harness Pawn is holding something');
  return pawn;
}

/** The eye frame, snapshotted. `eyeTransform()` hands back the rig's own working
 *  vectors, so anything kept across a second call would silently be the newer
 *  frame - which is exactly how a "the numbers match" test lies. */
function eyeFrame(pawn){
  const eye = pawn.firstPerson.eyeTransform();
  assert.ok(eye, 'the rig produces an eye transform');
  return {
    position:{x:eye.position.x, y:eye.position.y, z:eye.position.z},
    forward:{x:eye.forward.x, y:eye.forward.y, z:eye.forward.z},
    right:{x:eye.right.x, y:eye.right.y, z:eye.right.z},
  };
}
/** The pre-descriptor formula, kept verbatim as the yardstick: this is the
 *  `worldTarget(forward, right, up)` that character-pawn-base.js used to inline. */
function legacyTarget(eye, side, forward, right, up){
  return {
    x:eye.position.x + eye.forward.x * forward + eye.right.x * right * side,
    y:eye.position.y + eye.forward.y * forward + eye.right.y * right * side + up,
    z:eye.position.z + eye.forward.z * forward + eye.right.z * right * side,
  };
}
function near(actual, expected, message){
  assert.ok(actual && expected, message + ' (a target is missing)');
  ['x', 'y', 'z'].forEach(axis => assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-9,
    message + ': ' + axis + ' ' + actual[axis] + ' != ' + expected[axis]));
}
function distance(a, b){
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));
}

// ================================================================ 02 defaults

test('an unauthored grip resolves to the hand count the weapon implies', () => {
  const hands = weapon => POSE.resolveGrip(weapon, []).hands;
  assert.equal(hands({kind:'firearm', preset:'rifle'}), 'double');
  assert.equal(hands({kind:'firearm', preset:'smg'}), 'double');
  assert.equal(hands({kind:'firearm', preset:'pistol'}), 'single');
  assert.equal(hands({kind:'unarmed', preset:'fists'}), 'unarmed');
  assert.equal(hands({kind:'thrown', preset:'grenade'}), 'thrown');
  // Melee kept `twoHanded === true` in the old derivation, so it still does.
  assert.equal(hands({kind:'melee', preset:'knife'}), 'double');
  assert.equal(hands({}), 'double', 'an unknown weapon is shouldered');
});

test('twoHanded is a mirror of the hand count and never a second derivation', () => {
  [['rifle', 'firearm', true], ['pistol', 'firearm', false], ['fists', 'unarmed', false],
    ['grenade', 'thrown', false], ['knife', 'melee', true]].forEach(([preset, kind, expected]) => {
    const grip = POSE.resolveGrip({kind, preset}, []);
    assert.equal(grip.twoHanded, expected, preset + ' two-handedness');
    assert.equal(grip.twoHanded, grip.hands === 'double', preset + ' must mirror hands, not re-derive');
  });
  // Overriding the hand count moves the mirror with it. If `twoHanded` were still
  // computed from the preset this would keep saying "two hands on a pistol: no".
  const forced = POSE.resolveGrip({kind:'firearm', preset:'pistol'}, [{hands:'double'}]);
  assert.equal(forced.hands, 'double');
  assert.equal(forced.twoHanded, true);
});

test('the default offsets are the numbers the old branch hardcoded', () => {
  const side = 1;
  // -- a shouldered firearm: worldTarget(.40, .15, -.18) -------------------
  const rifle = armedPawn({preset:'rifle'});
  const rifleEye = eyeFrame(rifle);
  near(rifle.weaponPose().triggerTarget, legacyTarget(rifleEye, side, .40, .15, -.18),
    'the firearm trigger hand has not moved');
  // -- fists: worldTarget(.36, .20, -.20) and worldTarget(.30, -.20, -.18) --
  const fists = armedPawn({preset:'fists'});
  const fistsEye = eyeFrame(fists);
  const fistsPose = fists.weaponPose();
  near(fistsPose.triggerTarget, legacyTarget(fistsEye, side, .36, .20, -.20), 'the striking fist');
  near(fistsPose.supportTarget, legacyTarget(fistsEye, side, .30, -.20, -.18), 'the guarding fist');
  // -- a throwable: worldTarget(-.08, .30, .18) and worldTarget(.14, -.18, -.22)
  const grenade = armedPawn({preset:'grenade'});
  const grenadeEye = eyeFrame(grenade);
  const grenadePose = grenade.weaponPose();
  near(grenadePose.triggerTarget, legacyTarget(grenadeEye, side, -.08, .30, .18), 'the cocked hand');
  near(grenadePose.supportTarget, legacyTarget(grenadeEye, side, .14, -.18, -.22), 'the bracing hand');
  // -- a blade: worldTarget(.34, .22, -.16), and no second hand ------------
  const knife = armedPawn({preset:'knife'});
  const knifeEye = eyeFrame(knife);
  const knifePose = knife.weaponPose();
  near(knifePose.triggerTarget, legacyTarget(knifeEye, side, .34, .22, -.16), 'the blade hand');
  assert.equal(knifePose.supportTarget, null, 'a blade is held in one hand, as it was');
  // -- a sidearm: the same carry, and the support arm left alone -----------
  const pistol = armedPawn({preset:'pistol'});
  const pistolEye = eyeFrame(pistol);
  const pistolPose = pistol.weaponPose();
  near(pistolPose.triggerTarget, legacyTarget(pistolEye, side, .40, .15, -.18), 'the sidearm hand');
  assert.equal(pistolPose.supportTarget, null, 'the free arm keeps swinging with the run');
  [rifle, fists, grenade, knife, pistol].forEach(pawn => pawn.dispose());
});

test('a foregrip the view model solved for still wins over any offset', () => {
  // This is what the old code did with `rig.state.supportGrip`, and it has to keep
  // doing it: a solved point puts the hand ON the weapon, an offset only near it.
  const rifle = armedPawn({preset:'rifle'});
  const solved = {x:1.5, y:1.25, z:-.75};
  rifle.firstPerson.state.supportGrip = solved;
  near(rifle.weaponPose().supportTarget, solved, 'the support hand goes to the published foregrip');
  // And with no view model running at all the hand is no longer abandoned: the
  // descriptor's own fallback answers instead of leaving the arm hanging.
  rifle.firstPerson.state.supportGrip = null;
  const fallback = rifle.weaponPose().supportTarget;
  assert.ok(fallback, 'a two-handed weapon with no view model still gets a support target');
  assert.ok(distance(fallback, solved) > .01, 'and it is the offset, not a stale solved point');
  rifle.dispose();
});

// ================================================================== 03 states

test('idle, aiming and firing put the trigger hand in three different places', () => {
  const rifle = armedPawn({preset:'rifle'});
  const rig = rifle.firstPerson;
  const idle = rifle.weaponPose().triggerTarget;
  rig.state.ads = 1;
  const aiming = rifle.weaponPose().triggerTarget;
  rig.state.ads = 0;
  rig.state.sinceShot = 0;
  const firing = rifle.weaponPose().triggerTarget;
  assert.ok(distance(idle, aiming) > .02, 'raising the sights must move the hands, not only the weapon');
  assert.ok(distance(idle, firing) > .02, 'the shot must move the hands');
  assert.ok(distance(aiming, firing) > .02, 'and firing from the hip must not look like aiming');
  // Both at once is both layers, so an aimed shot is not the same pose as either.
  rig.state.ads = 1;
  const aimedShot = rifle.weaponPose().triggerTarget;
  assert.ok(distance(aimedShot, aiming) > .02 && distance(aimedShot, firing) > .02,
    'an aimed shot is the aim layer plus the fire layer');
  rifle.dispose();
});

test('the aim layer is HELD and eased in, while the fire layer is an instant', () => {
  const rifle = armedPawn({preset:'rifle'});
  const rig = rifle.firstPerson;
  const idle = rifle.weaponPose().triggerTarget;
  rig.state.ads = 1;
  const full = rifle.weaponPose().triggerTarget;
  rig.state.ads = .5;
  const half = rifle.weaponPose().triggerTarget;
  const travel = distance(idle, full);
  assert.ok(Math.abs(distance(idle, half) - travel / 2) < 1e-9,
    'half-raised sights are half the travel, so the hands follow the blend instead of snapping');
  // The fire layer is a short recoil impulse. It follows time since the last
  // round rather than the weapon cooldown, so slow weapons never freeze their
  // arms backwards until the next allowed shot.
  rig.state.ads = 0;
  rig.state.sinceShot = .139;
  const barely = rifle.weaponPose().triggerTarget;
  rig.state.sinceShot = 0;
  const deep = rifle.weaponPose().triggerTarget;
  assert.ok(distance(idle,barely)<.002,'recoil has nearly settled by the end of its short pulse');
  assert.ok(distance(idle,deep)>.02,'the instant of the shot still produces a readable hand kick');
  rifle.dispose();
});

test('walking toward the camera keeps carry on the body until aim or fire owns it', () => {
  const rifle = armedPawn({preset:'rifle'});
  const rig = rifle.firstPerson;
  const eye = eyeFrame(rifle);
  // Camera keeps looking along its original heading while locomotion has turned
  // the Character toward it — the exact reported case.
  rifle.owner.rotation.y = rig.state.yaw + Math.PI;
  rifle.state.moving = true;
  rifle.state.speed = 3;
  const bodyForward = {
    x:Math.sin(rifle.owner.rotation.y), y:0, z:Math.cos(rifle.owner.rotation.y),
  };
  const along=(target,axis)=>(target.x-eye.position.x)*axis.x+(target.y-eye.position.y)*axis.y+(target.z-eye.position.z)*axis.z;
  const carried = rifle.weaponPose().triggerTarget;
  assert.ok(along(carried,bodyForward)>0,
    'ordinary carry must follow the travelling body, not the crosshair behind it');
  assert.ok(along(carried,eye.forward)<0,
    'the arm must not remain pointed at the camera crosshair while walking toward it');

  rig.state.ads = 1;
  const aimed = rifle.weaponPose().triggerTarget;
  assert.ok(along(aimed,eye.forward)>along(carried,eye.forward),
    'ADS may pull the carry partially toward the crosshair');

  rig.state.ads = 0;
  rig.state.sinceShot = 0;
  const fired = rifle.weaponPose().triggerTarget;
  assert.ok(along(fired,eye.forward)>0,
    'the shot itself commits the arm to the crosshair');
  rifle.dispose();
});

test('the punch and the swing keep the exact forward reach they always had', () => {
  const side = 1;
  const fists = armedPawn({preset:'fists'});
  const fistsEye = eyeFrame(fists);
  fists.firstPerson.state.sinceShot = 0;
  const punch = fists.weaponPose();
  near(punch.triggerTarget, legacyTarget(fistsEye, side, .76, .20, -.20),
    'the striking fist reached .76 forward on a punch and still does');
  near(punch.supportTarget, legacyTarget(fistsEye, side, .30, -.20, -.18),
    'while the guarding fist stays put');
  assert.equal(punch.firing, true);
  const knife = armedPawn({preset:'knife'});
  const knifeEye = eyeFrame(knife);
  knife.firstPerson.state.sinceShot = 0;
  near(knife.weaponPose().triggerTarget, legacyTarget(knifeEye, side, .72, .22, -.16),
    'and the swing reached .72');
  fists.dispose();
  knife.dispose();
});

test('a solved foregrip is not double-shifted when the sights come up', () => {
  // The view model already moves the weapon while aiming, so the DEFAULT aim layer
  // must not be added to a point it already moved. An AUTHORED one still is,
  // because it is the only way to move a hand the view model placed.
  const rifle = armedPawn({preset:'rifle'});
  const solved = {x:1.5, y:1.25, z:-.75};
  rifle.firstPerson.state.supportGrip = solved;
  rifle.firstPerson.state.ads = 1;
  near(rifle.weaponPose().supportTarget, solved, 'aiming leaves a solved grip exactly where it was solved');
  rifle.setWeaponGrip({aimSupport:[0, .3, 0]});
  const authored = rifle.weaponPose().supportTarget;
  assert.ok(Math.abs(authored.y - (solved.y + .3)) < 1e-9, 'an authored aim layer does reach it');
  rifle.dispose();
});

// =============================================================== 04 authoring

test('an authored hand count changes what the second arm does', () => {
  // A sidearm held in two hands is a real authoring choice, and it was impossible.
  const pistol = armedPawn({preset:'pistol'}, {hands:'double'});
  const pose = pistol.weaponPose();
  assert.equal(pose.twoHanded, true);
  assert.ok(pose.supportTarget, 'the support hand comes onto the weapon');
  pistol.dispose();
  // And the reverse: a rifle carried one-handed frees the other arm.
  const rifle = armedPawn({preset:'rifle'}, {hands:'single'});
  const single = rifle.weaponPose();
  assert.equal(single.twoHanded, false);
  assert.equal(single.supportTarget, null, 'the off hand is released');
  rifle.dispose();
});

test('a zero vector inherits, so one grip block survives a mixed loadout', () => {
  // The seeded template block is all zeros. If zero meant "put the hand at the
  // eye", every Pawn shipping that block would hold its fists like a rifle.
  const zeroed = {hands:'auto', supportHand:'auto', trigger:[0, 0, 0], support:[0, 0, 0],
    aimTrigger:[0, 0, 0], aimSupport:[0, 0, 0], fireTrigger:[0, 0, 0], fireSupport:[0, 0, 0]};
  const fists = armedPawn({preset:'fists'}, zeroed);
  const eye = eyeFrame(fists);
  near(fists.weaponPose().triggerTarget, legacyTarget(eye, 1, .36, .20, -.20),
    'an all-zero block is the built-in pose for the weapon in hand');
  const grip = POSE.resolveGrip({kind:'unarmed', preset:'fists'}, [zeroed]);
  assert.deepEqual(grip.trigger.position, [.20, -.20, .36]);
  assert.deepEqual(grip.authored, {trigger:false, support:false, aimTrigger:false, aimSupport:false,
    fireTrigger:false, fireSupport:false}, 'and nothing about it counts as authored');
  fists.dispose();
});

test('an authored offset moves the hand it names, and only that one', () => {
  const rifle = armedPawn({preset:'rifle'});
  const eye = eyeFrame(rifle);
  const before = rifle.weaponPose().supportTarget;
  rifle.setWeaponGrip({trigger:[.4, .1, .7]});
  const after = rifle.weaponPose();
  near(after.triggerTarget, legacyTarget(eye, 1, .7, .4, .1), 'the authored trigger offset is used verbatim');
  near(after.supportTarget, before, 'the support hand is untouched by it');
  rifle.dispose();
});

test('the Inspector bindings reach the pose one field at a time', () => {
  // `weaponGrip.` is a Pawn-level binding on purpose: the view rig's weapon
  // normalizer keeps only the fields it knows, so a `firstPerson.weapon.grip.*`
  // path is reported handled and then dropped. This is the assertion that the
  // path an author actually edits arrives.
  const rifle = armedPawn({preset:'rifle'});
  assert.equal(rifle.applyBinding('weaponGrip.hands', 'single'), true);
  assert.equal(rifle.weaponPose().twoHanded, false);
  assert.equal(rifle.applyBinding('weaponGrip.supportHand', 'on'), true);
  assert.ok(rifle.weaponPose().supportTarget, 'the support hand can be forced back on');
  assert.equal(rifle.applyBinding('weaponGrip.triggerRotation', [90, 0, 0]), true);
  const pose = rifle.weaponPose();
  assert.ok(Math.abs(pose.triggerRotation[0] - Math.PI / 2) < 1e-9,
    'degrees are converted once, into the radians every consumer uses');
  assert.equal(rifle.applyBinding('weaponGrip.fireTrigger', [0, 0, -.5]), true);
  const idle = pose.triggerTarget;
  rifle.firstPerson.state.sinceShot = 0;
  assert.ok(distance(rifle.weaponPose().triggerTarget, idle) > .4, 'an authored recoil layer is applied');
  rifle.dispose();
});

test('a weapon that carries its own grip outranks the character-level block', () => {
  // A pickup describing how it is held has to beat the Pawn's own default, or two
  // weapons could never be held differently by the same character.
  const grip = POSE.resolveGrip({kind:'firearm', preset:'rifle'},
    [{hands:'single', trigger:[.1, .1, .1]}, {hands:'double', trigger:[.2, .2, .2]}]);
  assert.equal(grip.hands, 'double', 'the more specific source wins');
  assert.deepEqual(grip.trigger.position, [.2, .2, .2]);
  // The nested descriptor shape and the flat inspector rows mean the same thing.
  const nested = POSE.resolveGrip({kind:'firearm', preset:'rifle'},
    [{trigger:{position:[.3, 0, .5], rotation:[0, 45, 0]}, support:{enabled:false}}]);
  assert.deepEqual(nested.trigger.position, [.3, 0, .5]);
  assert.deepEqual(nested.trigger.rotation, [0, 45, 0]);
  assert.equal(nested.support.enabled, false);
});

test('context profiles isolate gait, aim and weapon side and blend ADS continuously', () => {
  const grip={profiles:{
    'hip.idle.right':{trigger:{position:[.1,-.2,.3]}},
    'aim.idle.right':{trigger:{position:[.3,-.1,.5]}},
    'hip.run.right':{trigger:{position:[.5,-.4,.2]}},
    'hip.idle.left':{trigger:{position:[.7,-.3,.4]}},
  }};
  const weapon={kind:'firearm',preset:'rifle'};
  assert.deepEqual(POSE.resolveContextGrip(weapon,[grip],{gait:'idle',side:'right',aim:0}).trigger.position,[.1,-.2,.3]);
  assert.deepEqual(POSE.resolveContextGrip(weapon,[grip],{gait:'run',side:'right',aim:0}).trigger.position,[.5,-.4,.2]);
  assert.deepEqual(POSE.resolveContextGrip(weapon,[grip],{gait:'idle',side:'left',aim:0}).trigger.position,[.7,-.3,.4]);
  const halfway=POSE.resolveContextGrip(weapon,[grip],{gait:'idle',side:'right',aim:.5});
  near({x:halfway.trigger.position[0],y:halfway.trigger.position[1],z:halfway.trigger.position[2]},{x:.2,y:-.15,z:.4},'half ADS blends the two authored states');
  assert.equal(halfway.contextual.hipProfile,true);assert.equal(halfway.contextual.aimProfile,true);
});

test('the shared Character pose selects contextual gait for player and AI controllers alike', () => {
  const pawn=armedPawn({preset:'rifle'},{profiles:{'hip.run.right':{trigger:{position:[.44,-.2,.61]}}}});
  pawn.state.speed=pawn.config.movement.runSpeed;pawn.state.sprinting=true;
  const pose=pawn.weaponPose();
  assert.equal(pose.gripContext.gait,'run');
  assert.equal(pose.gripContext.side,'right');
  assert.deepEqual(pose.grip.trigger.position,[.44,-.2,.61]);
  assert.equal(pawn.possessed,false,'the same path is active on an unpossessed AI-ready Pawn');
});

test('an authored Pawn Studio target has exact IK influence in Play', () => {
  const contextual=armedPawn({preset:'rifle'},{profiles:{'hip.run.right':{
    trigger:{position:[.37,-.11,.53],rotation:[12,-7,19]},
    support:{position:[-.18,-.2,.67],rotation:[-4,8,-11]},supportHand:'on',
  }}});
  contextual.state.speed=contextual.config.movement.runSpeed;contextual.state.sprinting=true;
  const pose=contextual.weaponPose();
  assert.equal(pose.triggerWeight,1,'Play cannot dilute the trigger dummy edited in Pawn Studio');
  assert.equal(pose.supportWeight,1,'Play cannot dilute the support dummy edited in Pawn Studio');
  assert.deepEqual(contextual.firstPerson.state.weaponGripRotation,pose.triggerRotation,
    'the world weapon receives the same authored wrist frame as the body IK');
  contextual.dispose();

  const automatic=armedPawn({preset:'rifle'});automatic.state.speed=automatic.config.movement.runSpeed;
  assert.ok(automatic.weaponPose().triggerWeight<1,'unauthored fallback carry still preserves locomotion softness');
  automatic.dispose();
});

test('the third person combat template exposes the grip and inherits by default', () => {
  const graph = TEMPLATES.get('logic-template-player-character-third-person').graph;
  const variables = new Map(graph.variables.map(variable => [variable.binding, variable]));
  ['weaponGrip.hands', 'weaponGrip.supportHand', 'weaponGrip.trigger', 'weaponGrip.triggerRotation',
    'weaponGrip.support', 'weaponGrip.supportRotation', 'weaponGrip.aimTrigger', 'weaponGrip.aimSupport',
    'weaponGrip.fireTrigger', 'weaponGrip.fireSupport'].forEach(binding => {
    const variable = variables.get(binding);
    assert.ok(variable, 'missing exposed grip control ' + binding);
    assert.equal(variable.exposed, true);
    assert.equal(variable.category, 'Combat / Weapon Grip');
  });
  assert.equal(variables.get('weaponGrip.hands').ui, 'select');
  assert.ok(variables.get('weaponGrip.hands').options.some(option => option.value === 'double'));
  // Every exposed control is applied on the first frame, so a seeded number would
  // be an authored one. They all have to read as "inherit" or the loadout below -
  // fists, sidearm, blade, throwable - would be held identically.
  assert.equal(variables.get('weaponGrip.hands').value, 'auto');
  assert.deepEqual(variables.get('weaponGrip.trigger').value, [0, 0, 0]);
  const pawn = graph.characterPawn;
  assert.ok(pawn.weaponGrip, 'the Pawn carries the block so it saves and loads');
  assert.equal(pawn.weaponGrip.hands, 'auto');
  // The same assertion the other way round: run the authored block through the
  // resolver against each weapon of the shipped loadout and require four poses.
  const shapes = pawn.loadout.map(item => {
    const weapon = global.LK_RUNTIME_FIRST_PERSON.normalizeWeapon(item);
    return POSE.resolveGrip(weapon, [pawn.weaponGrip]).trigger.position.join(',');
  });
  assert.equal(new Set(shapes).size, 4, 'the shipped loadout keeps four distinct grips, got ' + shapes.join(' | '));
});

// =============================================================== 05 pose layer

// A Mixamo-named arm chain, the same shape character-weapon-pose.test.js builds.
function boneRig(){
  const root = new THREE.Object3D();
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
    const thigh = new THREE.Bone();
    thigh.name = 'mixamorig' + side + 'UpLeg';
    thigh.position.set(.12 * sign, -1.28, 0);
    const shin = new THREE.Bone();
    shin.name = 'mixamorig' + side + 'Leg';
    shin.position.set(0, -.48, 0);
    const foot = new THREE.Bone();
    foot.name = 'mixamorig' + side + 'Foot';
    foot.position.set(0, -.45, .08);
    shin.add(foot);thigh.add(shin);chest.add(thigh);
  });
  root.updateMatrixWorld(true);
  return root;
}
function boneNamed(root, name){
  let found = null;
  root.traverse(bone => { if(bone.name === name) found = bone; });
  return found;
}

test('finger curl reaches named bones, settles and clears without accumulating', () => {
  const root=boneRig(),hand=boneNamed(root,'mixamorigRightHand'),finger=new THREE.Bone();finger.name='mixamorigRightHandIndex1';finger.position.set(-.06,0,0);hand.add(finger);root.updateMatrixWorld(true);
  const clean=finger.quaternion.clone(),pose={side:1,triggerTarget:{x:0,y:1.5,z:2},triggerFingers:{index:.8}};
  POSE.apply(THREE,root,pose,1);assert.ok(clean.angleTo(finger.quaternion)>.2,'the simple Index slider curls the real index chain');
  const settled=finger.quaternion.clone();for(let frame=0;frame<20;frame++)POSE.apply(THREE,root,pose,1);assert.ok(settled.angleTo(finger.quaternion)<.01,'curl is a stable post-animation layer');
  POSE.apply(THREE,root,{side:1,triggerTarget:pose.triggerTarget,triggerFingers:{index:0}},1);assert.ok(clean.angleTo(finger.quaternion)<.01,'zero opens the finger again');
});

test('an authored hand rotation actually rotates the hand bone', () => {
  const root = boneRig();
  const hand = boneNamed(root, 'mixamorigRightHand');
  const target = {x:0, y:1.5, z:2};
  POSE.apply(THREE, root, {side:1, triggerTarget:target}, 1);
  const straight = hand.quaternion.clone();
  const rolled = boneRig();
  POSE.apply(THREE, rolled, {side:1, triggerTarget:target, triggerRotation:[0, 0, Math.PI / 3]}, 1);
  const twisted = boneNamed(rolled, 'mixamorigRightHand').quaternion;
  assert.ok(straight.angleTo(twisted) > .1,
    'aiming a chain at a point leaves the twist about that point free, so the roll must be applied on top');
});

test('a repeated pose with a roll settles instead of winding the wrist up', () => {
  // There is no AnimationMixer behind a procedural Pawn to rewrite the bone, so an
  // applied delta that is never undone accumulates - forty frames of a 60 degree
  // roll is ten full turns of the wrist.
  const root = boneRig();
  const hand = boneNamed(root, 'mixamorigRightHand');
  const pose = {side:1, triggerTarget:{x:0, y:1.5, z:2}, triggerRotation:[0, 0, Math.PI / 3]};
  for(let i = 0; i < 40; i++) POSE.apply(THREE, root, pose, 1);
  const settled = hand.quaternion.clone();
  for(let i = 0; i < 10; i++) POSE.apply(THREE, root, pose, 1);
  assert.ok(settled.angleTo(hand.quaternion) < .01, 'the roll converges instead of accumulating');
  // Clearing it puts the wrist back rather than leaving the last delta welded on.
  POSE.apply(THREE, root, {side:1, triggerTarget:pose.triggerTarget, triggerRotation:[0, 0, 0]}, 1);
  const cleared = hand.quaternion.clone();
  assert.ok(cleared.angleTo(settled) > .1, 'and removing the authored roll removes it from the bone');
});

test('a mixer-restored wrist receives the authored rotation on every frame', () => {
  const root = boneRig();
  const hand = boneNamed(root, 'mixamorigRightHand');
  const clean = hand.quaternion.clone();
  const pose = {side:1, triggerTarget:{x:0, y:1.5, z:1.4}, triggerRotation:[0, 0, Math.PI / 3]};
  POSE.apply(THREE, root, pose, 1);
  assert.ok(clean.angleTo(hand.quaternion) > .1, 'the first frame applies the wrist rotation');

  // AnimationMixer/Pawn Studio writes the clip pose before the post-animation
  // weapon layer runs. The old cache blindly undid its previous delta here,
  // although that delta was no longer on the bone, and cancelled this frame.
  hand.quaternion.copy(clean);
  root.updateMatrixWorld(true);
  POSE.apply(THREE, root, pose, 1);
  assert.ok(clean.angleTo(hand.quaternion) > .1,
    'restoring the clip does not make the authored wrist rotation alternate off');
});

test('a pose with no rotation is byte-for-byte the pose that never had one', () => {
  const withField = boneRig();
  const without = boneRig();
  const target = {x:.4, y:1.4, z:1.8};
  POSE.apply(THREE, withField, {side:1, triggerTarget:target, triggerRotation:[0, 0, 0], supportRotation:null}, .85);
  POSE.apply(THREE, without, {side:1, triggerTarget:target}, .85);
  const a = boneNamed(withField, 'mixamorigRightHand').getWorldPosition(new THREE.Vector3());
  const b = boneNamed(without, 'mixamorigRightHand').getWorldPosition(new THREE.Vector3());
  assert.ok(a.distanceTo(b) < 1e-12, 'the new field is inert until it is authored');
});

test('named traversal effectors and pole targets solve all four limbs after the clip', () => {
  const root=boneRig(),before={
    leftHand:boneNamed(root,'mixamorigLeftHand').getWorldPosition(new THREE.Vector3()),
    rightHand:boneNamed(root,'mixamorigRightHand').getWorldPosition(new THREE.Vector3()),
    leftFoot:boneNamed(root,'mixamorigLeftFoot').getWorldPosition(new THREE.Vector3()),
    rightFoot:boneNamed(root,'mixamorigRightFoot').getWorldPosition(new THREE.Vector3()),
  };
  const goals={handWeight:.9,footWeight:.85,
    leftHand:{x:.28,y:1.85,z:.45},rightHand:{x:-.28,y:1.85,z:.45},
    leftFoot:{x:.18,y:.45,z:.3},rightFoot:{x:-.18,y:.45,z:.3},
    leftElbowPole:{x:.55,y:1.25,z:.2},rightElbowPole:{x:-.55,y:1.25,z:.2},
    leftKneePole:{x:.25,y:.45,z:.45},rightKneePole:{x:-.25,y:.45,z:.45}};
  assert.equal(POSE.applyTraversal(THREE,root,goals,1),true);
  [['leftHand','mixamorigLeftHand'],['rightHand','mixamorigRightHand'],['leftFoot','mixamorigLeftFoot'],['rightFoot','mixamorigRightFoot']].forEach(([key,name])=>{
    const after=boneNamed(root,name).getWorldPosition(new THREE.Vector3());
    assert.ok(after.distanceTo(before[key])>.01,key+' must move toward its measured surface goal');
  });
});

console.log('\ncharacter weapon grip tests passed');
