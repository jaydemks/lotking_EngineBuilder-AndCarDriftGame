'use strict';

/* =========================================================
   The weapon pose has to RUN, not merely be present.

   `aimBone()` used `scratch.local` and the scratch object never created it. Every
   frame that applied a weapon pose therefore threw `Cannot read properties of
   undefined`, and because the pose runs inside the frame's update chain, everything
   after it was abandoned: camera, HUD and animations. The game still read input and
   still fired, so it looked alive while being mostly dead - and from outside it read
   as "the character has no animations".

   One missing property, and nothing in the repository could see it. The pose was
   covered by assertions that searched the SOURCE TEXT for the four weapon cases, and
   source text cannot tell you whether a line can execute. So this file drives the
   real function over a real bone chain and lets it throw.

   HOW THIS FILE IS ORGANISED
     01 harness    a Mixamo-named arm chain built from real THREE bones
     02 executes   apply() completes and actually moves a bone
     03 scratch    every vector and quaternion the maths reaches for exists
     04 shapes     one arm, two arms, and a rig it cannot use
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');

global.window = global;
global.THREE = THREE;
require('../js/runtime/character-weapon-pose.js');
const POSE = global.LK_RUNTIME_CHARACTER_WEAPON_POSE;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// ================================================================= 01 harness

// Real bones, Mixamo names, a shoulder-to-hand chain per side. The rig classifier
// strips the `mixamorig` prefix, so these are the names it is written for.
function rig(){
  const root = new THREE.Object3D();
  const chest = new THREE.Bone();
  chest.name = 'mixamorigSpine2';
  chest.position.set(0, 1.4, 0);
  root.add(chest);
  const neck=new THREE.Bone();neck.name='mixamorigNeck';neck.position.set(0,.22,0);const head=new THREE.Bone();head.name='mixamorigHead';head.position.set(0,.18,0);neck.add(head);chest.add(neck);
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
    const thigh=new THREE.Bone();thigh.name='mixamorig'+side+'UpLeg';thigh.position.set(.12*sign,.92,0);const shin=new THREE.Bone();shin.name='mixamorig'+side+'Leg';shin.position.set(0,-.43,0);const foot=new THREE.Bone();foot.name='mixamorig'+side+'Foot';foot.position.set(0,-.42,.08);shin.add(foot);thigh.add(shin);root.add(thigh);
  });
  root.updateMatrixWorld(true);
  return root;
}

const forwardTarget = {x:0, y:1.5, z:2};
const supportTarget = {x:.1, y:1.45, z:1.8};

// ================================================================ 02 executes

test('applying a pose completes instead of throwing', () => {
  // This is the whole point of the file. The missing `scratch.local` made this call
  // throw on the very first bone, every frame, and took the rest of the frame with it.
  const root = rig();
  const changed = POSE.apply(THREE, root, {side:1, triggerTarget:forwardTarget, supportTarget}, .85);
  assert.equal(changed, true, 'the pose reports that it moved the arms');
});

test('the aimed arm actually rotates, so a completed call is not a silent no-op', () => {
  const root = rig();
  const upper = [];
  root.traverse(bone => { if(bone.name === 'mixamorigRightArm') upper.push(bone); });
  assert.equal(upper.length, 1);
  const before = upper[0].quaternion.clone();
  POSE.apply(THREE, root, {side:1, triggerTarget:forwardTarget}, 1);
  assert.ok(before.angleTo(upper[0].quaternion) > .01,
    'a pose that changes nothing would satisfy a not-throwing test while doing nothing');
});

test('a repeated call stays stable rather than drifting away', () => {
  // The scratch object is shared across bones and calls; a stale entry would show up
  // as the arm creeping further every frame.
  const root = rig();
  const hand = [];
  root.traverse(bone => { if(bone.name === 'mixamorigRightHand') hand.push(bone); });
  for(let i = 0; i < 40; i++) POSE.apply(THREE, root, {side:1, triggerTarget:forwardTarget}, .85);
  const settled = hand[0].getWorldPosition(new THREE.Vector3());
  for(let i = 0; i < 10; i++) POSE.apply(THREE, root, {side:1, triggerTarget:forwardTarget}, .85);
  const again = hand[0].getWorldPosition(new THREE.Vector3());
  assert.ok(settled.distanceTo(again) < .02, 'the pose converges instead of accumulating');
  assert.ok(Number.isFinite(again.x) && Number.isFinite(again.y) && Number.isFinite(again.z),
    'and never produces NaN, which would silently destroy the whole skeleton');
});

// ================================================================= 03 scratch

test('every scratch slot the maths reaches for is created', () => {
  // Read the names the code USES and require each to be allocated. A property added
  // to the maths without being added to the scratch object is exactly the defect that
  // emptied a level, and it is invisible to any test that only greps for features.
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../js/runtime/character-weapon-pose.js'), 'utf8');
  const used = new Set();
  const pattern = /scratch\.([a-zA-Z0-9_]+)/g;
  let match;
  while((match = pattern.exec(source)) !== null) used.add(match[1]);
  assert.ok(used.size >= 8, 'the scratch object is the shared working set and should be substantial');
  const scratchStart = source.indexOf('const scratch={');
  const scratchEnd = source.indexOf('let changed=false', scratchStart);
  const allocated = source.slice(scratchStart, scratchEnd);
  used.forEach(name => {
    assert.match(allocated, new RegExp('\\b' + name + ':new THREE\\.'),
      'scratch.' + name + ' is used by the maths but never allocated - this is the crash');
  });
});

// ================================================================== 04 shapes

test('a single-handed pose leaves the support arm alone', () => {
  const root = rig();
  const left = [];
  root.traverse(bone => { if(bone.name === 'mixamorigLeftArm') left.push(bone); });
  const before = left[0].quaternion.clone();
  POSE.apply(THREE, root, {side:1, triggerTarget:forwardTarget}, 1);
  assert.ok(before.angleTo(left[0].quaternion) < 1e-6,
    'with no support target the other arm must not be touched - that is what a pistol looks like');
});

test('a rig with no arms is declined instead of crashing', () => {
  const bare = new THREE.Object3D();
  assert.equal(POSE.apply(THREE, bare, {side:1, triggerTarget:forwardTarget}, 1), false);
  assert.equal(POSE.apply(THREE, rig(), null, 1), false, 'and so is a missing pose');
  assert.equal(POSE.apply(null, rig(), {triggerTarget:forwardTarget}, 1), false);
});

test('a seated profile solves head, both arms and both legs as one safe layer', () => {
  const root=rig(),before={};['mixamorigNeck','mixamorigLeftArm','mixamorigRightArm','mixamorigLeftUpLeg','mixamorigRightUpLeg'].forEach(name=>root.traverse(bone=>{if(bone.name===name)before[name]=bone.quaternion.clone();}));
  const changed=POSE.applySeated(THREE,root,{head:{x:0,y:2,z:1},leftHand:{x:-.28,y:1.25,z:.5},rightHand:{x:.28,y:1.25,z:.5},leftFoot:{x:-.2,y:.15,z:.55},rightFoot:{x:.2,y:.15,z:.55},leftElbowPole:{x:-.7,y:1.2,z:.1},rightElbowPole:{x:.7,y:1.2,z:.1},leftKneePole:{x:-.25,y:.55,z:.8},rightKneePole:{x:.25,y:.55,z:.8},handWeight:1,footWeight:1,headWeight:.7,fingers:{left:{},right:{}}},1);
  assert.equal(changed,true);
  const moved=Object.keys(before).filter(name=>{let result=false;root.traverse(bone=>{if(bone.name===name&&before[name].angleTo(bone.quaternion)>.001)result=true;});return result;});
  assert.ok(moved.length>=4,'the seat layer must affect the body, not only one hand');
  assert.equal(POSE.release(root),true,'vehicle exit reports that it released the full-body seat layer');
  Object.keys(before).forEach(name=>root.traverse(bone=>{if(bone.name===name)assert.ok(before[name].angleTo(bone.quaternion)<1e-6,name+' returns to its exact pre-seat quaternion');}));
});

test('async locomotion binding may change the pose root without changing the skeleton baseline', () => {
  const owner=new THREE.Object3D(),holder=rig(),before={};owner.add(holder);owner.updateMatrixWorld(true);
  holder.traverse(bone=>{if(bone.isBone)before[bone.uuid]=bone.quaternion.clone();});
  const goals={head:{x:0,y:2,z:1},leftHand:{x:-.28,y:1.25,z:.5},rightHand:{x:.28,y:1.25,z:.5},leftFoot:{x:-.2,y:.15,z:.55},rightFoot:{x:.2,y:.15,z:.55},leftElbowPole:{x:-.7,y:1.2,z:.1},rightElbowPole:{x:.7,y:1.2,z:.1},leftKneePole:{x:-.25,y:.55,z:.8},rightKneePole:{x:.25,y:.55,z:.8},handWeight:1,footWeight:1,headWeight:.7,fingers:{left:{},right:{}}};
  assert.equal(POSE.applySeated(THREE,owner,goals,1),true,'the pre-bind frame reaches the skeleton through the Character owner');
  assert.equal(POSE.applySeated(THREE,holder,goals,1),true,'the post-bind frame reaches the same skeleton through locomotionNode');
  assert.equal(POSE.release(holder),true,'exit releases the pose through the post-bind root');
  holder.traverse(bone=>{if(bone.isBone)assert.ok(before[bone.uuid].angleTo(bone.quaternion)<1e-6,bone.name+' returns to the true pre-entry pose across the root switch');});
});

test('vehicle exit force-restores the clean pose even when another layer touched a seated bone', () => {
  const root=rig(),arm=[];root.traverse(bone=>{if(bone.name==='mixamorigRightArm')arm.push(bone);});
  const before=arm[0].quaternion.clone(),goals={head:{x:0,y:2,z:1},leftHand:{x:-.28,y:1.25,z:.5},rightHand:{x:.28,y:1.25,z:.5},leftFoot:{x:-.2,y:.15,z:.55},rightFoot:{x:.2,y:.15,z:.55},leftElbowPole:{x:-.7,y:1.2,z:.1},rightElbowPole:{x:.7,y:1.2,z:.1},leftKneePole:{x:-.25,y:.55,z:.8},rightKneePole:{x:.25,y:.55,z:.8},handWeight:1,footWeight:1,headWeight:.7,fingers:{left:{},right:{}}};
  POSE.applySeated(THREE,root,goals,1);
  arm[0].quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.02));
  assert.equal(POSE.release(root),true);
  assert.ok(before.angleTo(arm[0].quaternion)<1e-6,'exit is an ownership boundary and restores the baseline unconditionally');
});

console.log('\ncharacter weapon pose tests passed');
