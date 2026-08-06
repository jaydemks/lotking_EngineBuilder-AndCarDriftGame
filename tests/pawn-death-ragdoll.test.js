'use strict';

/* =========================================================
   Death physics on a mesh-part rig: the body must stay a body.

   The articulated solver drives the nodes it mapped to a role. On a skinned GLB
   that is enough - everything else hangs off a bone and follows it. On a rig made
   of separate meshes, which is what the procedural placeholder is and what an
   imported model with props beside its joints looks like, the parts it did not map
   are SIBLINGS of the ones it did, so they stayed exactly where the character was
   standing. Measured before the fix: the head dropped to y = 0.075 while the hair
   stayed at y = 1.79, hanging in the air at head height. That is what "they come
   apart and some limbs stay up in the air" is.

   Those leftovers now ride the nearest driven part for the duration of the fall,
   and the hierarchy is put back on restore.

   HOW THIS FILE IS ORGANISED
     01 harness    the real placeholder rig under a Pawn, on a floor at y = 0
     02 assembled  nothing floats, nothing separates
     03 physical   the body lies down, and it falls the way it was hit
     04 restore    the hierarchy and the pose come back
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');

// ================================================================= 01 harness

global.window = global;
global.THREE = THREE;
global.CustomEvent = class { constructor(t, i){ this.type = t; this.detail = (i || {}).detail || {}; } };
const listeners = {};
global.addEventListener = (t, f) => { (listeners[t] = listeners[t] || []).push(f); };
global.removeEventListener = () => {};
global.dispatchEvent = e => { (listeners[e.type] || []).forEach(f => f(e)); return true; };

require('../js/runtime/character-placeholder-locomotion.js');
require('../js/runtime/combat/damage-contract.js');
require('../js/runtime/physics/pawn-death-physics.js');
require('../js/runtime/character-vitals.js');

const PLACEHOLDER = global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
const DEATH = global.LK_RUNTIME_PAWN_DEATH_PHYSICS;
const VITALS = global.LK_RUNTIME_CHARACTER_VITALS;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

function harness(options){
  const opts = options || {};
  const owner = new THREE.Group();
  owner.name = 'Enemy';
  owner.position.set(3, 0, -12);
  const visual = PLACEHOLDER.createVisual(THREE, {});
  owner.add(visual);
  owner.updateMatrixWorld(true);
  const GAME = {world:{colliders:{box:[]}, characterGroundHeight:() => 0}, systems:{}, state:{}};
  const pawn = {
    id:'enemy', pawnType:'character', possessed:false, enabled:true, started:true, owner,
    state:{}, config:{spawn:{x:3, y:0, z:-12, heading:0}},
    playAction(){ return true; },
    reset(){ const s = this.config.spawn; owner.position.set(s.x, s.y, s.z); owner.rotation.set(0, s.heading, 0); return true; },
    syncRuntimeColliders(){ return true; }, step(){},
  };
  pawn.vitals = VITALS.attach(GAME, pawn, Object.assign({
    enabled:true, maxHealth:100, respawnMode:'none',
    deathPhysics:{enabled:true, mode:'auto', profile:'humanoid'},
  }, opts.vitals || {}));
  return {owner, visual, pawn};
}
function parts(visual){
  const out = [];
  visual.updateMatrixWorld(true);
  visual.traverse(node => { if(node.isMesh) out.push({name:node.name, at:node.getWorldPosition(new THREE.Vector3())}); });
  return out;
}
/** Distances between every visible part and the pelvis, which is what "the body
 *  came apart" means: a part that stops keeping company with the body. */
function spreadFrom(visual, hostName){
  const list = parts(visual);
  const host = list.find(item => item.name === hostName);
  return list.map(item => ({name:item.name, distance:item.at.distanceTo(host.at)}));
}
function kill(pawn, direction){
  pawn.vitals.applyDamage(999, {source:'test', direction:direction || {x:0, y:0, z:1}, force:34, point:{x:3, y:1.4, z:-12}});
  for(let i = 0; i < 240; i++) pawn.vitals.step(1 / 60);
}

// =============================================================== 02 assembled

test('the placeholder rig is recognised as an articulated humanoid', () => {
  const {owner} = harness();
  const rig = DEATH.resolveRig(owner, {profile:'auto', boneMap:{}}, {pawnType:'character'});
  assert.equal(rig.profile, 'humanoid');
  assert.equal(rig.sufficient, true, 'it has enough joints to articulate');
  assert.ok(Object.keys(rig.mapped).length >= 12, 'trunk, both arms and both legs are mapped');
  assert.ok(rig.edges.length >= 10);
  // No bones: this is the mesh-part path, which is the one that used to shed parts.
  assert.ok(Object.keys(rig.mapped).every(role => !rig.mapped[role].isBone), 'no skeleton, so nothing follows a bone');
});

test('no part is left hanging in the air after death', () => {
  const {visual, pawn} = harness();
  const before = parts(visual);
  assert.ok(before.some(item => item.at.y > 1.5), 'the head and hair start up at head height');
  kill(pawn);
  const after = parts(visual);
  const floating = after.filter(item => item.at.y > 0.9);
  assert.deepEqual(floating.map(item => item.name), [],
    'every visible part came down with the body; floating: ' + floating.map(i => i.name + '@' + i.at.y.toFixed(2)).join(', '));
});

test('the hair follows the head instead of staying where it was', () => {
  const {visual, pawn} = harness();
  const restGap = spreadFrom(visual, 'Head Skin').find(item => item.name === 'Hair Top').distance;
  kill(pawn);
  const gap = spreadFrom(visual, 'Head Skin').find(item => item.name === 'Hair Top').distance;
  assert.ok(Math.abs(gap - restGap) < .05,
    'the hair keeps its place on the head: rest ' + restGap.toFixed(3) + ' -> ' + gap.toFixed(3));
});

// "Coming apart" is not the same as flexing. A T-pose arm SHOULD travel most of a
// metre as it drops to the character's side, so the distance to the pelvis is the
// wrong thing to hold fixed. What must hold is that each part keeps the joint it
// hangs from, and that nothing ends up outside a body's reach.
function jointGaps(visual){
  const gaps = [];
  visual.updateMatrixWorld(true);
  visual.traverse(node => {
    const parent = node.parent;
    if(!parent || parent === visual || !parent.isObject3D || !node.getWorldPosition) return;
    gaps.push({name:node.name,
      gap:node.getWorldPosition(new THREE.Vector3()).distanceTo(parent.getWorldPosition(new THREE.Vector3()))});
  });
  return gaps;
}

test('every part keeps the joint it hangs from', () => {
  const {visual, pawn} = harness();
  const rest = new Map(jointGaps(visual).map(item => [item.name, item.gap]));
  assert.ok(rest.size >= 6, 'the rig has joints to check');
  kill(pawn);
  // Keyed by name, not by index: the ride-along deliberately RE-PARENTS the
  // leftovers while the body is down, so the pair list itself changes shape.
  jointGaps(visual).forEach(item => {
    if(!rest.has(item.name)) return;          // newly parented, checked elsewhere
    assert.ok(Math.abs(item.gap - rest.get(item.name)) < .02,
      item.name + ' separated from its joint: ' + rest.get(item.name).toFixed(3) + ' -> ' + item.gap.toFixed(3));
  });
});

test('no part ends up outside the reach of the body', () => {
  const {visual, pawn} = harness();
  kill(pawn);
  spreadFrom(visual, 'Hips Shorts').forEach(item => {
    // A standing character's furthest part is a hand at full stretch, ~1 m. Any
    // part beyond 1.3 m of the hips has been left behind or thrown off.
    assert.ok(item.distance < 1.3,
      item.name + ' is ' + item.distance.toFixed(2) + ' m from the hips, which is off the body');
  });
});

// ================================================================ 03 physical

test('the body lies down instead of collapsing into a pile or staying upright', () => {
  const {visual, pawn} = harness();
  kill(pawn);
  const box = new THREE.Box3().setFromObject(visual);
  const size = box.getSize(new THREE.Vector3());
  assert.ok(size.y < .8, 'it is no longer standing, height ' + size.y.toFixed(2));
  const longest = Math.max(size.x, size.z);
  assert.ok(longest > .9, 'it is laid out, not piled up: longest axis ' + longest.toFixed(2));
});

test('it falls the way it was hit', () => {
  const forward = harness();
  kill(forward.pawn, {x:0, y:0, z:1});
  const forwardCentre = new THREE.Box3().setFromObject(forward.visual).getCenter(new THREE.Vector3());

  const backward = harness();
  kill(backward.pawn, {x:0, y:0, z:-1});
  const backwardCentre = new THREE.Box3().setFromObject(backward.visual).getCenter(new THREE.Vector3());

  assert.ok(forwardCentre.z > -12, 'a shot from behind pushes the body forward, got z ' + forwardCentre.z.toFixed(2));
  assert.ok(backwardCentre.z < forwardCentre.z,
    'the opposite shot puts it on the other side: ' + backwardCentre.z.toFixed(2) + ' vs ' + forwardCentre.z.toFixed(2));
});

// ================================================================= 04 restore

test('a revive puts the hierarchy and the pose back', () => {
  const {visual, pawn} = harness();
  const parentOf = name => { let found = null; visual.traverse(n => { if(n.name === name) found = n; }); return found && found.parent && found.parent.name; };
  const hairParent = parentOf('Hair Top');
  const rest = parts(visual).map(item => ({name:item.name, at:item.at.clone()}));
  kill(pawn);
  assert.notEqual(parentOf('Hair Top'), hairParent, 'while dead the hair rides the head');
  pawn.vitals.revive(true);
  assert.equal(parentOf('Hair Top'), hairParent, 'a revive returns it to its own parent');
  const now = parts(visual);
  now.forEach((item, index) => {
    assert.ok(item.at.distanceTo(rest[index].at) < .01,
      item.name + ' is back where it started');
  });
});

console.log('\npawn death ragdoll tests passed');
