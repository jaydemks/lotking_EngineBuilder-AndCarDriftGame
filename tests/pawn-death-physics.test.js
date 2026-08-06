'use strict';

const assert = require('node:assert/strict');
const THREE = require('three');

global.window = global;
global.THREE = THREE;
require('../js/runtime/combat/damage-contract.js');
require('../js/runtime/physics/pawn-death-physics.js');
require('../js/runtime/character-vitals.js');
require('../js/runtime/first-person-controller.js');
require('../js/runtime/pawn-core.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-animation-set.js');
require('../js/runtime/soccer-locomotion.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/animal-placeholder-locomotion.js');
require('../js/runtime/animal-pawns.js');

const DAMAGE = global.LK_RUNTIME_DAMAGE_CONTRACT;
const DEATH = global.LK_RUNTIME_PAWN_DEATH_PHYSICS;
const VITALS = global.LK_RUNTIME_CHARACTER_VITALS;
const FP = global.LK_RUNTIME_FIRST_PERSON;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

function game(){
  return {
    systems:{}, state:{},
    world:{registry:[], colliders:{box:[], circle:[]}, characterGroundHeight(){ return 0; }},
  };
}

function bone(name, position){
  const node = new THREE.Bone();
  node.name = name;
  node.position.fromArray(position || [0, 0, 0]);
  return node;
}

function humanoidOwner(){
  const owner = new THREE.Group();
  owner.name = 'ImportedCharacter';
  const hips = bone('Hips', [0, 1.05, 0]);
  const spine = bone('Spine', [0, .48, 0]);
  const head = bone('Head', [0, .72, 0]);
  const upperArmL = bone('LeftUpperArm', [-.34, .3, 0]);
  const lowerArmL = bone('LeftForeArm', [-.42, 0, 0]);
  const handL = bone('LeftHand', [-.35, 0, 0]);
  const upperArmR = bone('RightUpperArm', [.34, .3, 0]);
  const lowerArmR = bone('RightForeArm', [.42, 0, 0]);
  const handR = bone('RightHand', [.35, 0, 0]);
  const upperLegL = bone('LeftUpLeg', [-.18, -.08, 0]);
  const lowerLegL = bone('LeftLeg', [0, -.62, 0]);
  const footL = bone('LeftFoot', [0, -.55, .12]);
  const upperLegR = bone('RightUpLeg', [.18, -.08, 0]);
  const lowerLegR = bone('RightLeg', [0, -.62, 0]);
  const footR = bone('RightFoot', [0, -.55, .12]);
  owner.add(hips); hips.add(spine, upperLegL, upperLegR);
  spine.add(head, upperArmL, upperArmR);
  upperArmL.add(lowerArmL); lowerArmL.add(handL);
  upperArmR.add(lowerArmR); lowerArmR.add(handR);
  upperLegL.add(lowerLegL); lowerLegL.add(footL);
  upperLegR.add(lowerLegR); lowerLegR.add(footR);
  owner.updateMatrixWorld(true);
  return owner;
}

function placeholderOwner(){
  const owner = new THREE.Group();
  const parts = {
    hips_shorts:[0, 1, 0], torso_shirt:[0, 1.5, 0], head_skin:[0, 2.05, 0],
    arm_skin_left:[-.38, 1.65, 0], elbow_skin_left:[-.8, 1.62, 0], hand_skin_left:[-1.1, 1.58, 0],
    arm_skin_right:[.38, 1.65, 0], elbow_skin_right:[.8, 1.62, 0], hand_skin_right:[1.1, 1.58, 0],
    leg_sock_left:[-.2, .82, 0], leg_sock_right:[.2, .82, 0],
  };
  Object.keys(parts).forEach(id => {
    const joint = new THREE.Group(); joint.name = id; joint.userData.logicElementSceneId = id;
    joint.position.fromArray(parts[id]); owner.add(joint);
  });
  owner.updateMatrixWorld(true);
  return owner;
}

function transforms(owner){
  const result = new Map();
  owner.traverse(node => result.set(node, {
    position:node.position.toArray(), quaternion:node.quaternion.toArray(), scale:node.scale.toArray(),
  }));
  return result;
}

function assertTransforms(owner, expected){
  owner.traverse(node => {
    const value = expected.get(node);
    assert.deepEqual(node.position.toArray(), value.position, node.name + ' position was not restored');
    assert.deepEqual(node.quaternion.toArray(), value.quaternion, node.name + ' rotation was not restored');
    assert.deepEqual(node.scale.toArray(), value.scale, node.name + ' scale was not restored');
  });
}

function worldY(node){ const value = new THREE.Vector3(); node.getWorldPosition(value); return value.y; }

test('semantic mapping resolves imported humanoids and authored placeholder joints', () => {
  assert.equal(DEATH.normalizeConfig({enabled:false}).enabled, false);
  const imported = DEATH.resolveRig(humanoidOwner(), {mode:'ragdoll'}, {pawnType:'character'});
  assert.equal(imported.profile, 'humanoid');
  assert.equal(imported.sufficient, true);
  assert.equal(imported.mapped.pelvis.name, 'Hips');
  assert.equal(imported.mapped.head.name, 'Head');
  assert.ok(imported.edges.length >= 10);

  const disabled = DEATH.create(game(), {owner:humanoidOwner()}, {enabled:false, mode:'ragdoll'});
  assert.equal(disabled.enter({direction:{x:1,y:0,z:0}}), false, 'the Inspector enabled toggle disables death physics');
  assert.equal(disabled.applyBinding('vitals.deathPhysics.enabled', true), true);
  assert.equal(disabled.enter({direction:{x:1,y:0,z:0}}), true, 'runtime binding can re-enable the same controller');
  disabled.dispose();

  const placeholder = DEATH.resolveRig(placeholderOwner(), {mode:'ragdoll'}, {pawnType:'character'});
  assert.equal(placeholder.sufficient, true);
  assert.equal(placeholder.mapped.pelvis.userData.logicElementSceneId, 'hips_shorts');
  assert.equal(placeholder.mapped.lowerArmL.userData.logicElementSceneId, 'elbow_skin_left');
});

test('articulated bodies fall without Cannon, settle, and restore GLB and placeholder poses', () => {
  const GAME = game(), owner = humanoidOwner(), pawn = {owner, pawnType:'character'};
  const before = transforms(owner), head = owner.getObjectByName('Head'), headBefore = worldY(head);
  const boneOffsets=new Map();owner.traverse(node=>{if(node.isBone)boneOffsets.set(node,node.position.toArray());});
  const body = DEATH.create(GAME, pawn, {mode:'ragdoll', blendTime:0, settleSeconds:.3, impulseScale:.05});
  assert.equal(body.enter({source:'weapon', point:{x:0,y:2,z:0}, direction:{x:1,y:0,z:0}, force:30}), true);
  assert.equal(body.status().kind, 'ragdoll');
  for(let frame = 0; frame < 24; frame++) body.step(1 / 60);
  assert.ok(worldY(head) < headBefore - .02, 'gravity must advance the articulated pose');
  boneOffsets.forEach((position,node)=>assert.deepEqual(node.position.toArray(),position,node.name+' rest joint offset must stay connected'));
  assert.equal(body.status().settled, true, 'the simulated pose is baked after the settle window');
  body.restore();
  assertTransforms(owner, before);
  assert.equal(body.status().active, false);

  const authored = placeholderOwner(), authoredBefore = transforms(authored);
  const authoredBody = DEATH.create(GAME, {owner:authored, pawnType:'character'}, {mode:'auto', blendTime:0, settleSeconds:.2});
  assert.equal(authoredBody.enter({direction:{x:0,y:0,z:1}}), true);
  for(let frame = 0; frame < 8; frame++) authoredBody.step(1 / 60);
  authoredBody.dispose();
  assertTransforms(authored, authoredBefore);
});

test('respawn policy defaults to never and supports death, spawn and playable random positions',()=>{
  assert.equal(VITALS.normalizeConfig({}).respawnMode,'none');
  const run=(mode,start,random)=>{
    const GAME=game();GAME.world.characterGround={minX:-5,maxX:5,minZ:-8,maxZ:2};
    const owner=new THREE.Group();owner.position.fromArray(start);let resets=0;
    const pawn={id:'respawn-'+mode,owner,config:{spawn:{x:1,y:0,z:-2,heading:0}},reset(){resets++;owner.position.set(1,0,-2);return true;}};
    const vitals=VITALS.create(GAME,pawn,{maxHealth:10,health:10,respawnMode:mode,respawnDelay:.01,deathPhysics:{mode:'none'}});
    const previous=Math.random;if(random!=null)Math.random=()=>random;
    try{vitals.die({source:'test'});vitals.step(.02,{});}finally{Math.random=previous;}
    return {vitals,owner,resets};
  };
  const never=run('none',[3,0,-4]);assert.equal(never.vitals.state.dead,true);assert.equal(never.resets,0);
  const death=run('death',[3,0,-4]);assert.equal(death.vitals.state.dead,false);assert.deepEqual(death.owner.position.toArray(),[3,0,-4]);
  const spawn=run('spawn',[3,0,-4]);assert.deepEqual(spawn.owner.position.toArray(),[1,0,-2]);
  const random=run('random',[3,0,-4],.5);assert.deepEqual(random.owner.position.toArray(),[0,0,-3]);
});

test('a Logic Element collider is not an obstacle for its own ragdoll', () => {
  const GAME=game(),owner=humanoidOwner(),pawn={id:'self-collider',owner,pawnType:'character'};
  const aggregate={enabled:true,compoundRoot:true,x:0,y:10,z:0,hx:80,hy:10,hz:80,parts:[]};
  const asphalt={enabled:true,compoundPart:true,parentRef:aggregate,x:0,y:.05,z:0,hx:8,hy:.05,hz:8};
  aggregate.parts.push(asphalt);
  const collider={
    enabled:true,logicElementOwner:owner,owner:owner.getObjectByName('Hips'),
    x:0,y:2.5,z:0,hx:.65,hy:2.5,hz:.65,
  };
  owner.userData.logicElementColliderRefs=[collider];
  GAME.world.colliders.box.push(aggregate,asphalt,collider);
  const body=DEATH.create(GAME,pawn,{mode:'ragdoll',blendTime:0,settleSeconds:.25,impulseScale:0});
  assert.equal(body.enter({source:'test',direction:{x:0,y:0,z:1}}),true);
  assert.equal(collider.enabled,false,'the standing collider must retire while the corpse is articulated');
  for(let frame=0;frame<8;frame++)body.step(1/60);
  assert.ok(worldY(owner.getObjectByName('Head'))<4,
    'the retired standing collider must not launch/pin the articulated pose');
  assert.ok(worldY(owner.getObjectByName('Head'))>-.5,
    'the ragdoll resolves on the thin asphalt child instead of falling through to a compound root boundary');
  body.restore();
  assert.equal(collider.enabled,true,'revive restores the authored collider state');
  body.dispose();
});

test('mesh-only Pawns use deterministic rigid fallback and revive exactly', () => {
  const GAME = game(), owner = new THREE.Group(); owner.position.set(2, 2, -3);
  owner.add(new THREE.Mesh(new THREE.BoxGeometry(.5, 1, .5), new THREE.MeshBasicMaterial()));
  const before = transforms(owner), body = DEATH.create(GAME, {owner}, {mode:'auto', settleSeconds:.5});
  assert.equal(body.enter({direction:{x:1,y:0,z:0}, force:24}), true);
  assert.equal(body.status().kind, 'rigid');
  for(let frame = 0; frame < 8; frame++) body.step(1 / 60);
  assert.ok(owner.position.y < 2, 'rigid fallback must still fall in FPS-only levels');
  body.restore();
  assertTransforms(owner, before);
  body.dispose();
});

test('armor is applied once, lethal truth is synchronous, and dead Pawns gate the complete frame', () => {
  const GAME = game(), owner = humanoidOwner();
  let movementFrames = 0, resets = 0, disposed = 0;
  const standingCollider={enabled:true,x:0,y:.9,z:0,hx:.35,hy:.9,hz:.35,logicElementOwner:owner};
  owner.userData.logicElementColliderRefs=[standingCollider];
  GAME.world.colliders.box.push(standingCollider);
  const pawn = {
    id:'armored-enemy', owner, pawnType:'character', state:{}, started:true, sleeping:false, disposed:false,
    enabled:true, possessed:true, hidden:false,
    step(dt){
      movementFrames++; this.owner.position.z += .1;
      const move = {fire:false};
      if(this.beforeMovementStep && this.beforeMovementStep(dt, move) === true) return;
      if(this.afterMovementStep) this.afterMovementStep(dt, move, {speed:1, grounded:true});
    },
    syncRuntimeColliders(){standingCollider.x=this.owner.position.x;standingCollider.z=this.owner.position.z;return true;},
    reset(){ resets++; this.owner.position.set(0, 0, 0); this.syncRuntimeColliders(); return true; },
    dispose(){ disposed++; this.disposed=true; return true; },
    playAction(){ return true; },
  };
  const vitals = VITALS.attach(GAME, pawn, {
    maxHealth:30, health:30, maxArmor:100, armor:100, armorAbsorb:1,
    regen:0, respawnOnDeath:true, respawnDelay:.3,
    deathPhysics:{mode:'ragdoll', blendTime:0, settleSeconds:.5},
  });
  pawn.firstPerson = FP.attach(GAME, pawn, {weapon:{magazine:5, ammoReserve:0, fireRate:10}});

  const protectedHit = DAMAGE.apply(owner, 50, {source:'weapon', headshot:true, direction:{x:1,y:0,z:0}});
  assert.equal(protectedHit.health, 30);
  assert.equal(protectedHit.armor, 50);
  assert.equal(protectedHit.damage, 0);
  assert.equal(protectedHit.killed, false, 'armour must prevent the false pre-armour kill');

  const head = owner.getObjectByName('Head'), headBefore = worldY(head);
  owner.position.z=3;pawn.syncRuntimeColliders();
  assert.equal(standingCollider.z,3,'the standing collider begins at the moved Pawn pose');
  const lethal = DAMAGE.apply(owner, 80, {source:'weapon', headshot:true, direction:{x:1,y:0,z:0}, point:{x:0,y:2,z:0}, force:40});
  assert.equal(lethal.health, 0);
  assert.equal(lethal.armor, 0);
  assert.equal(lethal.damage, 30, 'only post-armour health loss is reported');
  assert.equal(lethal.killed, true);
  assert.equal(lethal.info.headshot, true);
  assert.equal(lethal.deathHandled, true);
  assert.equal(vitals.state.dead, true);
  assert.equal(standingCollider.enabled,false,'other Pawns must not hit an upright ghost while this Pawn is dead');
  assert.equal(typeof owner.userData.damageable.applyDamage, 'undefined', 'runtime delegates must not leak into serialized scene data');
  assert.doesNotThrow(() => JSON.stringify(owner.userData.damageable));

  const ammo = pawn.firstPerson.ammo().ammo;
  assert.equal(pawn.firstPerson.fire(), null, 'a dead Pawn cannot fire through a direct graph/API call');
  assert.equal(pawn.firstPerson.reload(), false);
  assert.equal(pawn.firstPerson.ammo().ammo, ammo);
  const timer = vitals.state.respawnTimer;
  pawn.step(.05); pawn.step(.05);
  assert.equal(movementFrames, 0, 'movement, verbs and weapon hooks are skipped together');
  assert.ok(vitals.state.respawnTimer < timer, 'the respawn timer keeps advancing');
  assert.ok(worldY(head) < headBefore || head.position.x !== 0, 'death physics keeps advancing behind the frame gate');

  for(let frame = 0; frame < 8 && vitals.state.dead; frame++) pawn.step(.05);
  assert.equal(vitals.state.dead, false);
  assert.equal(resets, 1);
  assert.equal(vitals.deathPhysics.status().active, false);
  assert.equal(standingCollider.enabled,true);
  assert.equal(standingCollider.z,0,'respawn realigns the collider with the restored spawn');
  pawn.step(.05);
  assert.equal(movementFrames, 1, 'the original Pawn frame resumes after revive');

  const deathController = vitals.deathPhysics;
  DAMAGE.apply(owner, 999, {direction:{x:0,y:0,z:1}});
  assert.equal(deathController.status().active, true);
  pawn.dispose();
  assert.equal(disposed, 1);
  assert.equal(deathController.status().active, false, 'dispose restores and releases the body');
  assert.equal(pawn.vitals, null);
});

test('Animal Pawn composes its after-step hook with vitals instead of replacing it', () => {
  const GAME = game(), records = new Map();
  GAME.pawns = {
    register(pawn){ records.set(pawn.id, pawn); return pawn; },
    unregister(pawn){ records.delete(typeof pawn === 'string' ? pawn : pawn.id); return true; },
    get(id){ return records.get(id) || null; }, list(){ return Array.from(records.values()); },
  };
  global.LK_RUNTIME_PAWN_CORE.install(GAME);
  const owner = global.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION.createVisual(THREE, 'cat', {}, {});
  owner.userData.logicInstanceId = 'vitals-cat';
  const pawn = global.LK_RUNTIME_ANIMAL_PAWNS.createLogic(GAME, owner, {
    id:'vitals-cat', species:'cat', playerId:null,
    vitals:{maxHealth:100, health:80, regen:10, regenDelay:0, respawnOnDeath:false,
      deathPhysics:{mode:'ragdoll', profile:'quadruped'}},
  }, {});
  assert.ok(pawn && pawn.vitals);
  pawn.start();
  const before = pawn.vitals.state.health;
  pawn.setMoveInput({x:0,z:0});
  pawn.step(.1);
  assert.ok(pawn.vitals.state.health > before, 'the inherited vitals after-step must still tick on animals');
  const rig = DEATH.resolveRig(owner, {profile:'quadruped'}, pawn);
  assert.equal(rig.profile, 'quadruped');
  assert.equal(rig.sufficient, true);
  pawn.dispose();
});

console.log('Pawn death physics tests passed.');
