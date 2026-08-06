'use strict';

/* =========================================================
   The first-person view model only reacts to ITS OWN weapon.

   The muzzle flash was driven straight off the `OnWeaponFired` event with no
   check on which Pawn fired. Every shot in the level therefore flashed the
   player's own barrel and kicked the view model, so with a garrison of AI
   trading fire the player's weapon appeared to shoot by itself - in time with
   everybody else's shots, which is exactly how it was reported.

   The listener also outlived the view model, so a reloaded level left the old one
   still reacting.

   HOW THIS FILE IS ORGANISED
     01 harness    a window stub that records listeners, and a fake camera Pawn
     02 ownership  own shots flash, other Pawns' shots do not
     03 lifecycle  dispose stops listening
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');

// ================================================================= 01 harness

const listeners = [];
global.window = {
  THREE,
  addEventListener(type, fn){ listeners.push({type, fn}); },
  removeEventListener(type, fn){
    const at = listeners.findIndex(entry => entry.type === type && entry.fn === fn);
    if(at >= 0) listeners.splice(at, 1);
  },
};
global.THREE = THREE;

require('../js/runtime/first-person-view-pawn.js');
require('../js/runtime/fps-view-model.js');
const VIEW = global.window.LK_RUNTIME_FPS_VIEW_MODEL;
const VIEW_PAWN = global.window.LK_RUNTIME_FIRST_PERSON_VIEW_PAWN;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

/** The camera Pawn the view model draws for, plus the rig contract it reads. */
function harness(pawnId){
  const scene = new THREE.Scene();
  const owner = new THREE.Group();
  const pawn = {id:pawnId, owner, possessed:true, enabled:true, state:{}};
  pawn.firstPersonViewPawn = VIEW_PAWN.create(pawn,{kind:'first-person-arms',enabled:true});
  const rig = {
    firstPersonView:() => true,
    viewMode:() => 'first',
    weapon:() => ({name:'Assault Rifle', preset:'rifle', kind:'rifle'}),
    ammo:() => ({ammo:30, reserve:90, magazine:30, reloading:false, armed:true, name:'Assault Rifle'}),
    viewAngles:() => ({yaw:0, pitch:0}),
    aimAngles:() => ({yaw:0, pitch:0}),
    // The camera transform the view model rides: it needs a full basis and a
    // quaternion, not just a position.
    cameraTransform:() => ({
      position:new THREE.Vector3(0, 1.62, 0),
      forward:new THREE.Vector3(0, 0, 1),
      right:new THREE.Vector3(1, 0, 0),
      up:new THREE.Vector3(0, 1, 0),
      quaternion:new THREE.Quaternion(),
      fov:78,
    }),
    state:{ads:0, cooldown:0, reloading:false, sprintBlend:0, lean:0},
    // This file is about the ARMS view model, which is now opt-in: first person
    // presents the character's own body unless a Pawn asks for arms, so the rig has
    // to say so or there is no model here to own a muzzle flash at all.
    config:() => ({presentation:'arms', weapon:{name:'Assault Rifle', preset:'rifle'}}),
    leanAmount:() => 0,
    weaponSide:() => 1,
    // The rest of the rig contract the view model reads each frame.
    armed:() => true,
    armsPresentation:() => pawn.firstPersonViewPawn.active(),
    isAiming:() => false,
    isScoped:() => false,
    scopeBlend:() => 0,
  };
  global.window.LK_RUNTIME_FIRST_PERSON = {
    activeController:() => rig,
    activePawn:() => pawn,
    activeFirstPersonView:() => rig,
  };
  const view = VIEW.create({core:{scene, camera:new THREE.PerspectiveCamera()}, state:{}, systems:{}});
  return {view, pawn, scene};
}
function fire(pawnId){
  const detail = {type:'OnWeaponFired', pawnId, weapon:'primary'};
  listeners.filter(entry => entry.type === 'lk-pawn-event').forEach(entry => entry.fn({detail}));
}
/** The flash is the observable: it is only visible while its timer runs. The
 *  view model points at it directly, so the test asks it rather than guessing a
 *  node name. */
function flashVisible(view){
  const model = view.model();
  const flash = model && model.userData && model.userData.flash;
  return !!(flash && flash.visible);
}

// =============================================================== 02 ownership

test('a shot from another Pawn does not flash the player weapon', () => {
  const {view} = harness('player-1');
  view.update(1 / 60);
  fire('outpost-depot-6');
  view.update(1 / 60);
  assert.equal(flashVisible(view), false, 'an enemy shot must not fire the player muzzle');
});

test('the player own shot does flash', () => {
  const {view} = harness('player-1');
  view.update(1 / 60);
  fire('player-1');
  view.update(1 / 60);
  assert.equal(flashVisible(view), true, 'the weapon this view draws still flashes');
});

test('a whole garrison firing never flashes the player weapon', () => {
  const {view} = harness('player-1');
  view.update(1 / 60);
  for(let i = 1; i <= 12; i++){
    fire('outpost-enemy-' + i);
    view.update(1 / 60);
    assert.equal(flashVisible(view), false, 'enemy ' + i + ' must not flash the player weapon');
  }
});

test('an unattributed shot is treated as the local player', () => {
  const {view} = harness('player-1');
  view.update(1 / 60);
  fire(null);
  view.update(1 / 60);
  assert.equal(flashVisible(view), true, 'nothing in the engine fires anonymously except the local shot path');
});

// ================================================================ 03 lifecycle

test('dispose stops the view model listening', () => {
  const before = listeners.filter(entry => entry.type === 'lk-pawn-event').length;
  const {view} = harness('player-1');
  assert.equal(listeners.filter(entry => entry.type === 'lk-pawn-event').length, before + 1);
  view.dispose();
  assert.equal(listeners.filter(entry => entry.type === 'lk-pawn-event').length, before,
    'a reloaded level must not leave the previous view model reacting to shots');
});

test('body mode tears down the arms visual instead of retaining a second rig', () => {
  const {view,pawn}=harness('player-body');
  view.update(1/60);
  assert.ok(view.model(),'arms mode creates its autonomous visual');
  pawn.firstPersonViewPawn.configure({kind:'none',enabled:false});
  view.update(1/60);
  assert.equal(view.model(),null,'the extra rig and weapon are disposed in body mode');
  view.dispose();
});

test('the carried weapon follows the animated trigger hand world pose without inheriting rig scale', () => {
  const root=new THREE.Group(),hand=new THREE.Bone(),weapon=new THREE.Group();
  root.position.set(2,.4,-3);root.scale.setScalar(.01);hand.position.set(30,120,8);root.add(hand);root.updateMatrixWorld(true);
  weapon.scale.setScalar(1.35);
  const desired=new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,.8,-.2,'YXZ'));
  const follower=VIEW.createTriggerHandFollower(THREE);
  assert.equal(follower.apply(weapon,hand,desired,true),true);
  const firstPosition=hand.getWorldPosition(new THREE.Vector3());
  assert.ok(weapon.position.distanceTo(firstPosition)<1e-9,'the socket is on the real hand, not the torso');
  assert.ok(weapon.quaternion.angleTo(desired)<1e-9,'calibration keeps the initially correct barrel orientation');
  assert.ok(Math.abs(weapon.scale.x-1.35)<1e-9,'skeleton import scale never leaks into the weapon');
  hand.rotation.set(.35,-.2,.5);root.updateMatrixWorld(true);
  const before=weapon.quaternion.clone();
  follower.apply(weapon,hand,desired,true);
  assert.ok(before.angleTo(weapon.quaternion)>.1,'a Fire/Reload hand rotation moves the weapon on the next frame');
  assert.ok(weapon.position.distanceTo(hand.getWorldPosition(new THREE.Vector3()))<1e-9);
});

test('hand rotation following can be disabled without detaching weapon position', () => {
  const root=new THREE.Group(),hand=new THREE.Bone(),weapon=new THREE.Group(),desired=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,.4,0));
  root.add(hand);hand.position.set(.2,1.4,.3);hand.rotation.set(.7,.2,-.4);root.updateMatrixWorld(true);
  const follower=VIEW.createTriggerHandFollower(THREE);
  follower.apply(weapon,hand,desired,false);
  assert.ok(weapon.quaternion.angleTo(desired)<1e-9);
  assert.ok(weapon.position.distanceTo(hand.getWorldPosition(new THREE.Vector3()))<1e-9);
});

test('a Main Mesh hand loaded after Play replaces the temporary body fallback', () => {
  const scene=new THREE.Scene(),owner=new THREE.Group(),pawn={id:'late-rig',owner,possessed:true,enabled:true,state:{}};
  scene.add(owner);
  const config={presentation:'body',weapon:{name:'Sidearm',preset:'pistol'},weaponSocket:{bone:'',offset:[0,0,0],rotation:[0,0,0],scale:1,followHandRotation:true,showHelper:false}};
  const rig={armed:()=>true,firstPersonView:()=>false,armsPresentation:()=>false,config:()=>config,weaponSide:()=>1,
    aimAngles:()=>({yaw:0,pitch:0}),viewAngles:()=>({yaw:0,pitch:0}),state:{ads:0,sinceShot:9}};
  global.window.LK_RUNTIME_FIRST_PERSON={activeController:()=>rig,activePawn:()=>pawn};
  const view=VIEW.create({core:{scene},state:{},systems:{}});view.update(1/60);
  const carried=scene.getObjectByName('Carried Weapon');assert.ok(carried);
  const fallback=carried.position.clone(),hand=new THREE.Bone();hand.name='mixamorigRightHand';hand.position.set(-.34,1.32,.18);owner.add(hand);owner.updateMatrixWorld(true);
  view.update(1/60);
  assert.ok(carried.position.distanceTo(hand.getWorldPosition(new THREE.Vector3()))<1e-9,'late canonical GLB hand becomes authoritative');
  assert.ok(carried.position.distanceTo(fallback)>.1,'the weapon no longer remains on the body fallback');
  const before=carried.quaternion.clone();hand.rotation.z=.5;owner.updateMatrixWorld(true);view.update(1/60);
  assert.ok(before.angleTo(carried.quaternion)>.1,'the carried mesh follows the live firing-hand animation');
  view.dispose();
});

test('the carried world weapon includes the authored Pawn Studio wrist rotation', () => {
  const scene=new THREE.Scene(),owner=new THREE.Group(),hand=new THREE.Bone();hand.name='mixamorigRightHand';hand.position.set(-.2,1.3,.25);owner.add(hand);scene.add(owner);owner.updateMatrixWorld(true);
  const pawn={id:'authored-grip',owner,possessed:true,enabled:true,state:{}},rotation=[.23,-.17,.31];
  const config={presentation:'body',weapon:{name:'Rifle',preset:'rifle'},weaponSocket:{bone:'',offset:[0,0,0],rotation:[0,0,0],scale:1,followHandRotation:true,showHelper:false}};
  const rig={armed:()=>true,firstPersonView:()=>false,armsPresentation:()=>false,config:()=>config,weaponSide:()=>1,
    aimAngles:()=>({yaw:0,pitch:0}),viewAngles:()=>({yaw:0,pitch:0}),state:{ads:0,sinceShot:9,weaponGripRotation:rotation}};
  global.window.LK_RUNTIME_FIRST_PERSON={activeController:()=>rig,activePawn:()=>pawn};
  const view=VIEW.create({core:{scene},state:{},systems:{}});view.update(1/60);
  const carried=scene.getObjectByName('Carried Weapon'),expected=new THREE.Quaternion()
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0],rotation[1],rotation[2],'XYZ')))
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI));
  assert.ok(carried.quaternion.angleTo(expected)<1e-8,'Play uses body frame × authored wrist × weapon forward, like Pawn Studio');
  assert.ok(carried.position.distanceTo(hand.getWorldPosition(new THREE.Vector3()))<1e-9,'rotation authoring never detaches the hand-owned weapon');
  view.dispose();
});

console.log('\nFPS view model ownership tests passed');
