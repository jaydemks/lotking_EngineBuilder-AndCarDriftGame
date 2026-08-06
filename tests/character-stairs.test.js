'use strict';

const assert=require('node:assert/strict');
global.window=global;
global.THREE=require('three');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-placeholder-locomotion.js');
require('../js/runtime/animal-placeholder-locomotion.js');
require('../js/runtime/soccer-locomotion.js');

function test(name,run){try{run();console.log('ok - '+name);}catch(error){console.error('not ok - '+name);throw error;}}

test('a walkable tread climbs grounded and never synthesizes a jump',()=>{
  const GAME={world:{colliders:{box:[{x:0,y:.125,z:.15,hx:1,hy:.125,hz:1,walkable:true}],circle:[]}}};
  const owner={position:{x:0,y:0,z:0},rotation:{y:0}};
  const movement=global.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME,{walkSpeed:2,runSpeed:5,acceleration:40,stepHeight:.3,inputMode:'heading',facingMode:'heading'});
  const snapshot=movement.step(owner,{x:0,z:1,sprint:false},1/60,0);
  assert.equal(owner.position.y,.25);
  assert.equal(snapshot.grounded,true);
  assert.equal(snapshot.airborne,false);
  assert.equal(snapshot.velocityY,0);
  assert.equal(snapshot.justLanded,false);
  assert.ok(Math.abs(snapshot.stepRise-.25)<1e-8);
  assert.equal(snapshot.stepHeight,.3);
});

function horizontalMeshCollider(vertices,centerY,halfX){
  const geometry=new global.THREE.BufferGeometry();
  geometry.setAttribute('position',new global.THREE.Float32BufferAttribute(vertices,3));
  const mesh=new global.THREE.Mesh(geometry,new global.THREE.MeshBasicMaterial({side:global.THREE.DoubleSide}));
  const root=new global.THREE.Group();root.add(mesh);root.updateMatrixWorld(true);
  return {x:0,y:centerY,z:0,hx:halfX,hy:.05,hz:2,horizontalSurface:true,partMeshUuid:mesh.uuid,owner:root};
}

test('a disconnected complex road does not create an invisible AABB platform',()=>{
  // Two distant road islands share one mesh. Its aggregate bounds cover x=0,
  // but there are no triangles below the Character there.
  const vertices=[
    -6,2,-2,-4,2,-2,-4,2,2, -6,2,-2,-4,2,2,-6,2,2,
     4,2,-2, 6,2,-2, 6,2,2,  4,2,-2, 6,2,2, 4,2,2,
  ];
  const collider=horizontalMeshCollider(vertices,2,6);
  const GAME={world:{colliders:{box:[collider],circle:[]}}};
  const owner=new global.THREE.Group();owner.position.set(0,3,0);
  const movement=global.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME,{gravity:22,stepHeight:.55,inputMode:'heading'});
  movement.launch({x:0,y:0,z:0});
  for(let i=0;i<90;i++)movement.step(owner,{},1/60,0);
  assert.equal(owner.position.y,0,'the broad mesh bounds must not be treated as a solid floor');
});

test('a real complex-mesh floor remains standable at the sampled point',()=>{
  const vertices=[-2,1,-2,2,1,-2,2,1,2, -2,1,-2,2,1,2,-2,1,2];
  const collider=horizontalMeshCollider(vertices,1,2);
  const GAME={world:{colliders:{box:[collider],circle:[]}}};
  const owner=new global.THREE.Group();owner.position.set(0,3,0);
  const movement=global.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME,{gravity:22,stepHeight:.55,inputMode:'heading'});
  movement.launch({x:0,y:0,z:0});
  for(let i=0;i<90;i++)movement.step(owner,{},1/60,0);
  assert.ok(Math.abs(owner.position.y-1)<1e-6,'the exact road triangle must remain a valid floor');
});

test('humanoid placeholder animates bilateral knees and feet per Pawn with scalar strength',()=>{
  const runtime=global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
  const strong=runtime.createVisual(global.THREE),soft=runtime.createVisual(global.THREE);
  const a=runtime.createController({walkSpeed:2,stepPoseStrength:1}),b=runtime.createController({walkSpeed:2,stepPoseStrength:.5});
  assert.equal(a.bind(strong),true);assert.equal(b.bind(soft),true);
  const desired={x:0,z:1,speed:2,grounded:true,groundContact:true,stepRise:.25,stepHeight:.3,stepSide:-1};
  a.update(desired,1/60);b.update(desired,1/60);
  const part=(root,id)=>{let hit=null;root.traverse(node=>{if(node.userData&&node.userData.logicElementSceneId===id)hit=node;});return hit;};
  const strongLeft=part(strong,'knee_sock_left'),strongRight=part(strong,'knee_sock_right'),strongFoot=part(strong,'foot_shoe_left');
  const softLeft=part(soft,'knee_sock_left');
  assert.ok(strongLeft&&strongRight&&strongFoot,'new bilateral joints must exist in the fallback rig');
  assert.ok(strongLeft.rotation.x>strongRight.rotation.x,'the measured leading side must fold more');
  assert.ok(strongFoot.rotation.x<0,'the lead foot must counter-rotate onto the tread');
  assert.ok(softLeft.rotation.x>0&&softLeft.rotation.x<strongLeft.rotation.x,'author strength must scale the pose');
  const before=softLeft.rotation.x;a.update(Object.assign({},desired,{stepRise:.1,stepSide:1}),1/60);
  assert.equal(softLeft.rotation.x,before,'updating one Pawn must not mutate another Pawn rig');
});

test('quadruped stair pose folds its existing knee/ankle/toe chains and degrades on partial rigs',()=>{
  const runtime=global.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION,visual=runtime.createVisual(global.THREE,'cat');
  const controller=runtime.createController({species:'cat',walkSpeed:1.25,stepPoseStrength:1});
  assert.equal(controller.bind(visual),true);
  let knee=null,ankle=null,toe=null;visual.traverse(node=>{const id=node.userData&&node.userData.logicElementSceneId;if(id==='animal_knee_fl')knee=node;if(id==='animal_ankle_fl')ankle=node;if(id==='animal_toe_fl')toe=node;});
  const rest=[knee.rotation.x,ankle.rotation.x,toe.rotation.x];
  controller.update({x:0,z:1,speed:1.25,grounded:true,groundContact:true,stepRise:.2,stepHeight:.28,stepSide:1},1/60);
  assert.notDeepEqual([knee.rotation.x,ankle.rotation.x,toe.rotation.x],rest);
  const partial=new global.THREE.Group(),joint=new global.THREE.Group();joint.userData.logicElementSceneId='animal_leg_fl';partial.add(joint);
  const degraded=runtime.createController({species:'cat'});assert.equal(degraded.bind(partial),true);
  assert.doesNotThrow(()=>degraded.update({speed:1,grounded:true,stepRise:.2,stepHeight:.28},1/60));
});

test('GLB locomotion maps common bilateral knee/foot bones and skips absent bones cleanly',()=>{
  const makeNode=withBones=>{
    const node=new global.THREE.Group(),model=new global.THREE.Group();model.userData.logicElementAssetVisual=true;node.add(model);
    if(withBones){['LeftLeg','RightLeg','LeftFoot','RightFoot'].forEach(name=>model.add(Object.assign(new global.THREE.Bone(),{name})));}
    node.userData.logicAnimationClips=[new global.THREE.AnimationClip('Idle',1,[])];return node;
  };
  const runtime=global.LK_RUNTIME_CHARACTER_LOCOMOTION,rigged=makeNode(true),controller=runtime.createController({THREERef:global.THREE,stepPoseStrength:1});
  assert.equal(controller.bind(rigged,{idle:'Idle'}),true);
  assert.deepEqual(controller.debugState().stairBones.sort(),['footLeft','footRight','kneeLeft','kneeRight']);
  let leftKnee=null;rigged.traverse(node=>{if(node.name==='LeftLeg')leftKnee=node;});
  let peak=0;for(let frame=0;frame<30;frame++){controller.update({speed:1.9,z:1.9,grounded:true,groundContact:true,stepRise:frame===0?.25:0,stepHeight:.3,stepSide:-1},1/60);peak=Math.max(peak,Math.abs(leftKnee.quaternion.x));}
  assert.ok(peak>.01,'stair delta must reach the mapped GLB knee');
  assert.ok(Math.abs(leftKnee.quaternion.x)<.5,'the additive pose must not accumulate on unanimated GLB bones');
  const incomplete=runtime.createController({THREERef:global.THREE}),node=makeNode(false);
  assert.equal(incomplete.bind(node,{idle:'Idle'}),true);
  assert.doesNotThrow(()=>incomplete.update({speed:1,grounded:true,stepRise:.2,stepHeight:.3},1/60));
  assert.deepEqual(incomplete.debugState().stairBones,[]);
});
