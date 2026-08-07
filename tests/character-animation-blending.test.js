'use strict';

const assert=require('node:assert/strict');
const THREE=require('three');
global.window=global;
global.THREE=THREE;
require('../js/runtime/character-animation-blend.js');
require('../js/runtime/character-animation-set.js');
require('../js/runtime/mixamo-placeholder-clips.js');
require('../js/runtime/character-placeholder-locomotion.js');
require('../js/runtime/soccer-locomotion.js');

function test(name,run){
  try{run();console.log('ok - '+name);}
  catch(error){console.error('not ok - '+name);throw error;}
}

test('skeletal blend profiles preserve normalized weights and movement semantics',()=>{
  const blend=global.LK_RUNTIME_CHARACTER_ANIMATION_BLEND;
  const early=blend.profile({slot:'landMoving',progress:.15,desired:{speed:6,grounded:true}});
  const late=blend.profile({slot:'landMoving',progress:.72,desired:{speed:6,grounded:true}});
  const stopped=blend.profile({slot:'landMoving',progress:.5,desired:{speed:0,grounded:true}});
  const roll=blend.profile({slot:'roll',progress:.6,desired:{speed:6,grounded:true}});
  const fire=blend.profile({slot:'fire',progress:.1,desired:{speed:6,grounded:true}});
  [early,late,stopped,roll,fire].forEach(profile=>assert.ok(Math.abs(profile.actionWeight+profile.locomotionWeight-1)<1e-9));
  assert.ok(early.actionWeight>.35,'landing impact should remain readable');
  assert.ok(early.locomotionWeight>.5,'Run must regain the legs as soon as fast moving feet touch down');
  assert.equal(late.locomotionWeight,1,'a continuing Run owns the skeleton well before the landing clip ends');
  assert.ok(stopped.actionWeight>late.actionWeight,'a stopped landing should not be released as early as a running landing');
  assert.ok(roll.actionWeight>.9,'root-motion-style traversal stays body dominant');
  assert.ok(fire.locomotionWeight>=.2,'upper-body actions must not freeze moving legs');
  assert.equal(blend.categoryOf('climbUp'),'body-locked');
  assert.equal(blend.categoryOf('fireAutoRun'),'upper-body');
  const automatic=blend.profile({slot:'fireAutoRun',progress:.4,desired:{speed:6},loop:true,locomotionFloor:.72});
  assert.equal(automatic.locomotionWeight,.72,'a looping automatic recoil preserves the requested gait');
  assert.ok(Math.abs(automatic.actionWeight+automatic.locomotionWeight-1)<1e-9);
});

test('fire placeholders are gait-aware upper-body clips',()=>{
  const runtime=global.LK_RUNTIME_MIXAMO_PLACEHOLDER_CLIPS;
  const idle=runtime.samplePose('fireSingleIdle',.5,'character');
  const run=runtime.samplePose('fireAutoRun',.25,'character');
  assert.ok(idle.spine2&&run.spine2,'single and automatic fire both provide visible recoil');
  assert.equal(idle.thighL,undefined,'the fallback never replaces authored locomotion legs');
  assert.equal(run.thighR,undefined,'running fire leaves the gait cycle intact');
});

test('procedural placeholder uses the same phased blend and cancels stale landing on jump',()=>{
  const runtime=global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
  const visual=runtime.createVisual(THREE);
  const controller=runtime.createController({runSpeed:6,responsiveness:12});
  assert.equal(controller.bind(visual),true);
  for(let frame=0;frame<12;frame++)controller.update({x:0,z:6,speed:6,grounded:true},1/60);
  assert.equal(controller.playAction('Falling To Landing',{slot:'landMoving',duration:1}),true);
  controller.update({x:0,z:6,speed:6,grounded:true},.1);
  const early=controller.debugState().gestureBlend;
  for(let frame=0;frame<5;frame++)controller.update({x:0,z:6,speed:6,grounded:true},.1);
  const late=controller.debugState().gestureBlend;
  assert.equal(controller.debugState().gesture,'land');
  assert.ok(late.locomotionWeight>early.locomotionWeight);
  controller.update({x:0,z:6,speed:6,grounded:false,velocityY:4},1/60);
  assert.equal(controller.debugState().gesture,null,'new airborne phase must remove the previous landing gesture');
  controller.dispose();
});

test('procedural automatic fire loops without restarting locomotion',()=>{
  const runtime=global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
  const visual=runtime.createVisual(THREE);
  const controller=runtime.createController({runSpeed:6,responsiveness:12});
  assert.equal(controller.bind(visual),true);
  assert.equal(controller.playAction('fireAutoRun',{slot:'fireAutoRun',duration:.3,loop:true,locomotionFloor:.72}),true);
  for(let frame=0;frame<20;frame++)controller.update({x:0,z:6,speed:6,grounded:true},.1);
  const state=controller.debugState();
  assert.equal(state.gesture,'fire','the automatic recoil remains one continuous gesture');
  assert.equal(state.gestureBlend.locomotionWeight,.72,'the procedural Run remains underneath it');
  controller.stopAction();
  assert.equal(controller.debugState().gesture,null,'trigger release stops the cycle explicitly');
  controller.dispose();
});

function quaternionClip(name,bone,seconds,angle){
  const q0=new THREE.Quaternion(),q1=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),angle||0);
  return new THREE.AnimationClip(name,seconds,[new THREE.QuaternionKeyframeTrack(bone+'.quaternion',[0,seconds],[...q0.toArray(),...q1.toArray()])]);
}

test('imported Motion Set keeps a real locomotion pose under moving landing one-shots',()=>{
  const node=new THREE.Group(),model=new THREE.Group(),hips=new THREE.Bone();
  model.userData.logicElementAssetVisual=true;hips.name='Hips';model.add(hips);node.add(model);
  const clips=[
    quaternionClip('Idle','Hips',1,0),
    quaternionClip('Run','Hips',.8,.24),
    quaternionClip('Jump','Hips',.65,.42),
    quaternionClip('Falling To Landing','Hips',1,-.35),
  ];
  node.userData.logicAnimationClips=clips;
  const set=[
    {id:'idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true},
    {id:'run',name:'Run',state:'grounded',direction:[0,1],speed:6,clip:'Run',loop:true},
    {id:'jump',name:'Jump',state:'jump',direction:[0,1],speed:6,clip:'Jump',loop:false},
    {id:'landing-moving',name:'Moving Land',state:'land',direction:[0,1],speed:6,clip:'Falling To Landing',loop:false},
  ];
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE,runSpeed:6,responsiveness:12});
  assert.equal(controller.bind(node,{},[],set),true);
  for(let frame=0;frame<8;frame++)controller.update({x:0,z:6,speed:6,grounded:true},1/60);
  assert.equal(controller.playAction('Falling To Landing',{slot:'landMoving',fadeIn:0}),true);

  // This is the runtime shape that used to fail: the Pawn reports its active
  // one-shot as `action`, while feet are grounded and Run is still requested.
  // Every sampled frame must keep a normalized, covered skeleton and Run must
  // take over before the authored landing clip has ended.
  let regainedRun=false;
  for(let frame=0;frame<45;frame++){
    controller.update({x:0,z:6,speed:6,grounded:true,action:'landMoving'},1/60);
    const debug=controller.debugState(),landing=debug.oneShotBlend;
    const base=Object.entries(debug.motionWeights).filter(([id])=>id!=='landing-moving').reduce((sum,[,weight])=>sum+weight,0);
    const action=landing?landing.actionWeight:0;
    assert.ok(Math.abs(base+action-1)<.001,'no frame may expose or amplify the skeleton pose: '+JSON.stringify({frame,base,action,weights:debug.motionWeights,blend:landing}));
    if(landing&&landing.progress<.9&&base>.95)regainedRun=true;
  }
  assert.equal(regainedRun,true,'Run should own the skeleton before landing ends');

  // A new jump interrupts the stale landing on its first airborne frame. The
  // selector must immediately provide the authored Jump/Fall base, not retain
  // the landing action for another update.
  controller.update({x:0,z:6,speed:6,grounded:false,velocityY:4,action:'landMoving'},1/60);
  const airborne=controller.debugState();
  assert.equal(airborne.oneShot,null);
  assert.ok(airborne.selection.some(item=>item.id==='jump'),'stale landing action must not block Jump selection');
  assert.ok(Object.values(airborne.motionWeights).reduce((sum,weight)=>sum+weight,0)>.999,'jump interruption keeps the skeleton covered');
  controller.dispose();
});

test('vehicle exit removes a foreign Scene Store action without stopping locomotion',()=>{
  const node=new THREE.Group(),model=new THREE.Group(),hips=new THREE.Bone();
  model.userData.logicElementAssetVisual=true;hips.name='Hips';model.add(hips);node.add(model);
  const idle=quaternionClip('Idle','Hips',1,0),run=quaternionClip('Run','Hips',.8,.25),driving=quaternionClip('Driving','Hips',1,-.6);
  node.userData.logicAnimationClips=[idle,run,driving];
  const mixer=node.userData.logicAnimationMixer=new THREE.AnimationMixer(model);
  const set=[
    {id:'idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true},
    {id:'run',name:'Run',state:'grounded',direction:[0,1],speed:6,clip:'Run',loop:true},
  ];
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE,runSpeed:6,responsiveness:12});
  assert.equal(controller.bind(node,{},[],set),true);
  controller.update({x:0,z:6,speed:6,grounded:true},1/60);

  // This is precisely what the old Sketchbook occupant bridge did to an
  // ordinary Character: one unmanaged weight-1 action on its existing mixer.
  const foreign=mixer.clipAction(driving);foreign.reset().setEffectiveWeight(1).play();
  node.userData.logicAnimationAction=foreign;node.userData.logicAnimationClipName='Driving';
  assert.equal(foreign.isRunning(),true);
  controller.releaseExternalPose();
  assert.equal(node.userData.logicAnimationAction,null,'the foreign action ownership marker is cleared');
  assert.equal(foreign.isRunning(),false,'the driving pose cannot survive vehicle exit');

  controller.update({x:0,z:6,speed:6,grounded:true},1/60);
  const debug=controller.debugState();
  assert.ok(debug.selection.some(item=>item.id==='run'),'normal Run is selected immediately after cleanup');
  const runningRun=mixer._actions.some(action=>action.getClip&&action.getClip().name==='Run'&&action.isRunning());
  assert.ok(runningRun,'the managed locomotion action remains armed');
  assert.ok(Object.values(debug.motionWeights).reduce((sum,weight)=>sum+weight,0)>.99,'locomotion still covers the skeleton');
  controller.dispose();
});

test('presentation reset never promotes Motion Set offsets into a new Character rest pose',()=>{
  const node=new THREE.Group(),model=new THREE.Group(),hips=new THREE.Bone();
  node.position.set(.12,.08,-.04);node.rotation.set(.03,-.08,.02);node.scale.set(.94,.94,.94);
  model.userData.logicElementAssetVisual=true;hips.name='Hips';model.add(hips);node.add(model);
  node.userData.logicAnimationClips=[quaternionClip('Idle','Hips',1,.2)];
  const set=[{id:'idle-offset',name:'Idle Offset',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true,
    motionTransform:{position:[.25,-.63,.18],rotation:[180,0,0]}}];
  const rest={position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()};
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE,responsiveness:12});
  assert.equal(controller.bind(node,{},[],set),true);
  let authored=null;
  for(let cycle=0;cycle<3;cycle++){
    controller.update({x:0,z:0,speed:0,grounded:true},1/60);
    const sample={position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()};
    if(!authored)authored=sample;
    else {
      assert.ok(sample.position.distanceTo(authored.position)<1e-9,'cycle '+cycle+' cannot compound the authored root position');
      assert.ok(sample.quaternion.angleTo(authored.quaternion)<1e-9,'cycle '+cycle+' cannot compound the authored 180° root rotation');
      assert.ok(sample.scale.distanceTo(authored.scale)<1e-9,'cycle '+cycle+' cannot compound Character scale');
    }
    assert.equal(controller.resetPresentation(),true);
    assert.ok(node.position.distanceTo(rest.position)<1e-9,'reset '+cycle+' restores the structural holder position');
    assert.ok(node.quaternion.angleTo(rest.quaternion)<1e-7,'reset '+cycle+' restores the structural holder orientation · angle='+node.quaternion.angleTo(rest.quaternion));
    assert.ok(node.scale.distanceTo(rest.scale)<1e-9,'reset '+cycle+' restores the structural holder scale');
    assert.ok([hips.position.x,hips.position.y,hips.position.z,hips.quaternion.x,hips.quaternion.y,hips.quaternion.z,hips.quaternion.w].every(Number.isFinite),'skeleton remains finite after reset '+cycle);
  }
  const aligned=new THREE.Quaternion().setFromEuler(new THREE.Euler(.03,.42,.02));
  node.quaternion.copy(aligned);
  assert.equal(controller.setPresentationRootRest(node),true,'a restored Character holder becomes the new structural presentation baseline');
  assert.equal(controller.resetPresentation(),true);
  assert.ok(node.quaternion.angleTo(aligned)<1e-7,'vehicle-exit reset cannot replay an obsolete visual-forward quaternion');
  controller.dispose();
});

console.log('Character animation blending tests passed.');
