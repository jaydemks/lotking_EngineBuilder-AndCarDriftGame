'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/runtime/character-placeholder-locomotion.js');
require('../js/runtime/mixamo-placeholder-clips.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-nodes-soccer.js');
require('../js/logic/logic-nodes-character.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-soccer.js');
require('../js/logic/logic-templates-character.js');
require('../js/logic/logic-validator.js');
require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/input/input-actions.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-animation-set.js');
require('../js/runtime/soccer-locomotion.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/character-pawns.js');
require('../js/runtime/soccer-pawns.js');
require('../js/runtime/character-level-template.js');

const registry = global.LK_LOGIC_NODES_MVP.createRegistry();
function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

test('generic character node pack and template validate cleanly', () => {
  ['character.getMoveInput','character.setMoveInput','character.jump','character.playAction','character.setPreset','character.getState']
    .forEach(type => assert.ok(registry.get(type), 'missing node ' + type));
  const template = global.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal');
  assert.ok(template && template.graph.characterPawn);
  assert.equal(template.graph.characterPawn.camera.mode,'free');
  assert.equal(template.graph.variables.find(item=>item.name==='CameraMode').value,'free');
  assert.equal(template.graph.logicScene.elements.some(element=>element.id==='camera_anchor'),false,'camera behavior must not enlarge the Character spatial dummy');
  assert.equal(template.graph.logicScene.elements.some(element=>/ball|goal|penalty/i.test(element.id+' '+element.name)),false,'generic Character must not own soccer interactions');
  const result = global.LK_LOGIC_VALIDATOR.validateGraph(template.graph, registry);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const npc = global.LK_LOGIC_TEMPLATES.get('logic-template-talkable-civil-npc');
  assert.ok(npc && npc.graph.characterPawn);
  const npcResult = global.LK_LOGIC_VALIDATOR.validateGraph(npc.graph, registry);
  assert.equal(npcResult.ok, true, JSON.stringify(npcResult.errors));
});

test('character template documents in-place animation requirements', () => {
  const graph = global.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal').graph;
  const variables = new Map(graph.variables.map(variable => [variable.binding, variable]));
  ['animations.idle','animations.walk','animations.run','animations.jump','animations.interact'].forEach(binding => {
    const variable = variables.get(binding);
    assert.ok(variable, 'missing ' + binding);
    assert.match(variable.description, /in-place/i);
    assert.match(variable.description, /root motion|root translation/i);
  });
  assert.equal(variables.get('preset').options.length, 3);
});

test('Character Logic Elements are placed on the selected surface without a hidden Y offset', () => {
  const addActions = fs.readFileSync(path.join(__dirname, '../js/editor/add-actions.js'), 'utf8');
  const sceneStore = fs.readFileSync(path.join(__dirname, '../js/engine/scene-store.js'), 'utf8');
  assert.match(addActions, /const groundY = Number\.isFinite\(Number\(at && at\.y\)\) \? Number\(at\.y\) : 0;/);
  assert.ok(addActions.includes('t:{p:[at.x, groundY, at.z]'), 'Logic Element root must use the picked surface Y');
  assert.ok(!addActions.includes('t:{p:[at.x, .15, at.z]'), 'the legacy floating root offset must not return');
  assert.ok(sceneStore.includes('migrateLegacyCharacterGroundPlacement'), 'saved Character instances need the targeted ground migration');
  assert.ok(sceneStore.includes("source === 'Logic Element template'"), 'migration must remain limited to editor-placed Logic Elements');
  assert.ok(sceneStore.includes("Math.abs((Number(position[1]) || 0) - .15) < 1e-6"), 'intentional elevations must not be flattened');
});

test('Pawn Studio exposes persistent global mesh alignment outside animation clips', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/editor/pawn-studio.js'), 'utf8');
  assert.ok(source.includes("translate('Ground offset Y','Offset da terra Y')"));
  assert.ok(source.includes("translate('Forward/back tilt (Pitch X)','Inclinazione avanti/indietro (Pitch X)')"));
  assert.ok(source.includes("translate('Facing direction (Yaw Y)','Direzione frontale (Yaw Y)')"));
  assert.ok(source.includes("translate('Side tilt (Roll Z)','Inclinazione laterale (Roll Z)')"));
  assert.ok(source.includes('model.userData.lkPawnStudioAlignmentRoot'), 'alignment must be applied to an outer preview root');
  assert.ok(source.includes("'canonical-glb-store-fallback':'canonical-glb'"), 'Pawn Studio must preview the same canonical GLB hierarchy used by Play');
  assert.ok(source.includes("lkPreviewSource:'canonical-glb-raw'"), 'external motion preview must use the same unfitted canonical GLB source as runtime retargeting');
  assert.ok(source.includes("loadPreviewAsset(entry.asset,{animationSource:true})"), 'motion assets need the runtime-equivalent raw animation loading path');
  assert.ok(source.includes('runtime.applyMotionTransform(window.THREE,state.model,state.previewRootLock'), 'Pawn Studio and Play must share one slot-transform composition function');
  assert.ok(source.indexOf('STORE.loadLogicElementAsset(asset)')<source.indexOf('loader.load(asset'), 'canonical runtime GLB must be attempted before the original FBX source loader');
  assert.ok(source.includes('modelElement.rotation=[0,0,0]'), 'global alignment needs an explicit reset');
  assert.ok(source.includes('new THREE.TransformControls(camera,renderer.domElement)'), 'Pawn Studio viewport needs the same axis gizmo family as the main editor');
  assert.ok(source.includes("data-action=\"rig\""), 'animation slots need the Edit Rig viewport toggle');
  assert.ok(source.includes('new window.THREE.SkeletonHelper(state.model)'), 'Edit Rig must expose the real Main Mesh skeleton');
  assert.ok(source.includes('entry.rigCorrections[key]'), 'per-bone pose corrections must persist on the motion entry');
  assert.ok(source.includes('scheduleStudioAuthoringCommit(state)'), 'gizmo edits need a fallback commit after dragging stops');
  assert.ok(source.includes("Saved · editor synced"), 'Pawn Studio must report parity with the actual world holder');
  const inspector=fs.readFileSync(path.join(__dirname, '../js/editor/logic-elements-inspector.js'), 'utf8'),worldSync=inspector.indexOf('STORE.syncLogicElementSceneObject(object, normalized)'),assetSave=inspector.indexOf('api.saveAsset(');
  assert.ok(worldSync>=0&&assetSave>=0&&worldSync<assetSave,'the selected world instance must update before linked-asset propagation');
});

test('Flying Curve correction is broad at mid-clip and seamless at loop boundaries', () => {
  const curve=global.LK_RUNTIME_CHARACTER_LOCOMOTION.motionCurveCorrection;
  const entry={curveCorrection:{offset:[2,1,-3],influence:.5}};
  assert.deepEqual(curve(entry,0),{x:0,y:0,z:0,weight:0});
  assert.deepEqual(curve(entry,1),{x:0,y:0,z:0,weight:0});
  assert.deepEqual(curve(entry,.5),{x:1,y:.5,z:-1.5,weight:.5});
  const normalized=global.LK_RUNTIME_CHARACTER_ANIMATION_SET.normalizeEntry({id:'curve',clip:'Idle',curveCorrection:{offset:[.2,-.1,.3],influence:.75}},0);
  assert.deepEqual(normalized.curveCorrection,{offset:[.2,-.1,.3],influence:.75,falloff:'smooth-midpoint'});
});

test('legacy Flying Curve data is preserved but no longer shifts the runtime Main Mesh', () => {
  const THREE=require('three'),holder=new THREE.Group(),modelRoot=new THREE.Group(),hips=new THREE.Bone();hips.name='Hips';modelRoot.userData.logicElementAssetVisual=true;modelRoot.add(hips);holder.add(modelRoot);
  const clip=new THREE.AnimationClip('Idle',1,[new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,1],[0,0,0,1,0,0,0,1])]),mixer=new THREE.AnimationMixer(modelRoot);holder.userData.logicAnimationClips=[clip];holder.userData.logicAnimationMixer=mixer;
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE});
  assert.equal(controller.bind(holder,{},[],[{id:'idle-curve',name:'Idle',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true,curveCorrection:{offset:[0,1,0],influence:1}}]),true);
  mixer.update(.5);controller.update({x:0,z:0,speed:0,grounded:true},.1);holder.userData.logicCharacterRigPostUpdate();
  assert.deepEqual(modelRoot.position.toArray(),[0,0,0],'legacy spatial correction must not move the whole character');
  assert.deepEqual(hips.scale.toArray(),[1,1,1]);
  controller.dispose();
});

test('Edit Rig corrections are normalized and blend between locomotion states', () => {
  const THREE=require('three'),holder=new THREE.Group(),modelRoot=new THREE.Group(),hips=new THREE.Bone();hips.name='mixamorigHips';holder.position.set(.3,.2,-.1);holder.rotation.set(THREE.MathUtils.degToRad(3),THREE.MathUtils.degToRad(2),THREE.MathUtils.degToRad(-1));const authoredPosition=holder.position.clone(),authoredQuaternion=holder.quaternion.clone();modelRoot.userData.logicElementAssetVisual=true;modelRoot.add(hips);holder.add(modelRoot);
  const idle=new THREE.AnimationClip('Idle',1,[new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion',[0,1],[0,0,0,1,0,0,0,1])]),run=new THREE.AnimationClip('Running',1,[new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion',[0,1],[0,0,0,1,0,0,0,1])]),mixer=new THREE.AnimationMixer(modelRoot);holder.userData.logicAnimationClips=[idle,run];holder.userData.logicAnimationMixer=mixer;
  const set=[{id:'idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true,motionTransform:{position:[0,.12,0],rotation:[0,7,0]},rigCorrections:{'mixamorig:Hips':[24,0,0]}},{id:'run',name:'Run',state:'grounded',direction:[0,1],speed:5.4,clip:'Running',loop:true,motionTransform:{position:[0,0,0],rotation:[0,0,0]},rigCorrections:{hips:[0,0,0]}}],normalized=global.LK_RUNTIME_CHARACTER_ANIMATION_SET.normalize(set,{});
  assert.deepEqual(normalized[0].rigCorrections.hips,[24,0,0]);
  assert.deepEqual(normalized[0].motionTransform,{position:[0,.12,0],rotation:[0,7,0]});
  assert.notEqual(normalized[0].motionTransform,normalized[1].motionTransform,'every motion entry must own an independent whole-slot transform');
  assert.notEqual(normalized[0].rigCorrections,normalized[1].rigCorrections,'every motion entry must own an independent correction map');
  assert.deepEqual(normalized[1].rigCorrections.hips,[0,0,0]);
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE,responsiveness:12});
  assert.equal(controller.bind(holder,{idle:'Idle',run:'Running'},[],set),true);
  assert.deepEqual(controller.debugState().weights,{},'legacy fixed actions must not run beside a bound Motion Set');
  const tick=desired=>{controller.update(desired,1/60);mixer.update(1/60);holder.userData.logicCharacterRigPostUpdate();};
  tick({x:0,z:0,speed:0,grounded:true});
  const firstIdleDelta=new THREE.Euler().setFromQuaternion(authoredQuaternion.clone().invert().multiply(holder.quaternion),'XYZ');
  assert.ok(Math.abs((holder.position.y-authoredPosition.y)-.12)<1e-8,'Play must start at the exact Pawn Studio Idle position without an import-pose fade');
  assert.ok(Math.abs(THREE.MathUtils.radToDeg(firstIdleDelta.y)-7)<1e-6,'Play must start at the exact Pawn Studio Idle rotation');
  assert.ok(Math.abs(new THREE.Euler().setFromQuaternion(hips.quaternion,'XYZ').x)>.2,'Idle Edit Rig correction must also start at full weight; state '+JSON.stringify(controller.debugState()));
  for(let i=1;i<30;i++){tick({x:0,z:0,speed:0,grounded:true});const angle=Math.abs(new THREE.Euler().setFromQuaternion(hips.quaternion,'XYZ').x);assert.ok(angle>.2,'Idle correction lost at frame '+i+' mixer '+mixer.time+' angle '+angle+' '+JSON.stringify(controller.debugState()));}
  const crouched=Math.abs(new THREE.Euler().setFromQuaternion(hips.quaternion,'XYZ').x);
  const idleHeight=holder.position.y-authoredPosition.y,idleYaw=Math.abs(new THREE.Euler().setFromQuaternion(authoredQuaternion.clone().invert().multiply(holder.quaternion),'XYZ').y);
  for(let i=0;i<90;i++)tick({x:0,z:5.4,speed:5.4,grounded:true});
  const running=Math.abs(new THREE.Euler().setFromQuaternion(hips.quaternion,'XYZ').x);
  const runYaw=Math.abs(new THREE.Euler().setFromQuaternion(authoredQuaternion.clone().invert().multiply(holder.quaternion),'XYZ').y);
  assert.ok(crouched>.2,'Idle correction should affect the selected bone, got '+crouched);
  assert.ok(idleHeight>.08&&idleYaw>.07,'Idle whole-slot transform should be applied by runtime');
  assert.ok(running<crouched*.35,'Idle correction should fade while Run rises, not move the whole model as one block');
  assert.ok(Math.abs(holder.position.y-authoredPosition.y)<idleHeight*.35&&runYaw<idleYaw*.35,'Idle whole-slot transform should fade out independently when Run rises');
  assert.deepEqual(modelRoot.position.toArray(),[0,0,0],'the imported GLB root must stay owned by its mixer and retargeting path');
  controller.dispose();
  assert.deepEqual(holder.position.toArray(),authoredPosition.toArray(),'leaving Play must restore the authored Main Mesh holder position');
  assert.ok(holder.quaternion.angleTo(authoredQuaternion)<1e-8,'leaving Play must restore the authored Main Mesh holder rotation');
  assert.ok(hips.quaternion.angleTo(new THREE.Quaternion())<1e-6,'leaving Play must not bake the last Edit Rig delta into the Main Mesh skeleton');
});

test('Motion Set Jump owns airborne animation instead of the legacy one-shot', () => {
  const THREE=require('three'),holder=new THREE.Group(),modelRoot=new THREE.Group(),hips=new THREE.Bone();hips.name='Hips';modelRoot.userData.logicElementAssetVisual=true;modelRoot.add(hips);holder.add(modelRoot);
  const idle=new THREE.AnimationClip('Idle',1,[new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,1],[0,0,0,1,0,0,0,1])]),jump=new THREE.AnimationClip('Hero Jump',1,[new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,.5,1],[0,0,0,1,.258819,0,0,.965926,0,0,0,1])]),mixer=new THREE.AnimationMixer(modelRoot);holder.userData.logicAnimationClips=[idle,jump];holder.userData.logicAnimationMixer=mixer;
  const set=[{id:'idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true},{id:'jump-entry',name:'Jump',state:'jump',direction:[0,1],speed:2,clip:'Hero Jump',loop:false}],controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE});
  assert.equal(controller.bind(holder,{idle:'Idle'},[],set),true);
  for(let i=0;i<20;i++){mixer.update(1/60);controller.update({x:0,z:1,speed:2,grounded:false,velocityY:3},1/60);}
  assert.equal(controller.debugState().selection[0].id,'jump-entry');
  assert.equal(controller.isActionPlaying(),false,'Motion Set Jump must not be replaced by a legacy one-shot');
  controller.dispose();
});

test('character placeholder is a symmetric jointed T-pose', () => {
  const pose=global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION.sceneElements({});
  const byId=new Map(pose.map(part=>[part.id,part]));
  assert.equal(byId.get('arm_skin_left').type,'empty');
  assert.equal(byId.get('arm_skin_mesh_left').parentId,'arm_skin_left');
  assert.equal(byId.get('arm_skin_mesh_left').rotation[2],90);
  assert.equal(byId.get('arm_skin_mesh_right').rotation[2],90);
  assert.equal(byId.get('arm_skin_left').position[0],-byId.get('arm_skin_right').position[0]);
  assert.equal(byId.get('hand_skin_left').position[0],-byId.get('hand_skin_right').position[0]);
  assert.equal(byId.get('leg_sock_mesh_left').parentId,'leg_sock_left');
  assert.equal(byId.get('leg_sock_mesh_right').parentId,'leg_sock_right');
  const THREE=require('three'),rig=global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION.createVisual(THREE,{}),bounds=new THREE.Box3().setFromObject(rig);
  assert.ok(Math.abs(bounds.min.x+bounds.max.x)<1e-6,'T-pose must be horizontally symmetric');
  assert.ok(bounds.max.x-bounds.min.x>2,'arms must be extended horizontally');
  assert.ok(bounds.max.y>1.8&&bounds.min.y>=0,'placeholder must have coherent humanoid height');
});

test('FPS third-person support-hand IK accepts serialized rest-pose positions', () => {
  const THREE=require('three');
  const runtime=global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
  const rig=runtime.createVisual(THREE,{});
  const controller=runtime.createController({});
  const previousThree=global.THREE;
  global.THREE=THREE;
  try{
    assert.equal(controller.bind(rig),true);
    const frame={
      x:0,z:0,speed:0,grounded:true,
      weapon:{
        carry:1,aim:1,pitch:0,side:1,twoHanded:true,
        // The third-person weapon view model publishes this as plain world-space
        // coordinates on the frame after the camera changes view.
        supportTarget:{x:-.18,y:1.28,z:.34},
      },
    };
    assert.doesNotThrow(() => {
      for(let i=0;i<3;i++) controller.update(frame,1/60);
    },'switching an armed procedural character to third person must not break the frame loop');
  }finally{
    controller.dispose();
    if(previousThree===undefined)delete global.THREE;
    else global.THREE=previousThree;
  }
});

test('motion database selects by phase direction and speed', () => {
  const motion=global.LK_RUNTIME_CHARACTER_ANIMATION_SET;
  const set=motion.normalize([
    {id:'idle',state:'grounded',direction:'idle',speed:0,clip:'Idle'},
    {id:'walk-forward',state:'grounded',direction:'forward',speed:2,clip:'Walk'},
    {id:'run-forward',state:'grounded',direction:'forward',speed:6,clip:'Run'},
    {id:'strafe-left',state:'grounded',direction:'left',speed:2,clip:'Strafe Left'},
    {id:'strafe-left-fast',state:'grounded',direction:'left',speed:6,clip:'Strafe Left Fast'},
    {id:'strafe-right-fast',state:'grounded',direction:'right',speed:6,clip:'Strafe Right Fast'},
    {id:'fall',state:'fall',direction:'forward',speed:2,clip:'Fall'},
  ]);
  const idleSelection=motion.select(set,{x:0,z:0,speed:0,grounded:true},3);
  assert.equal(idleSelection[0].entry.id,'idle');
  assert.equal(idleSelection.length,1);
  assert.equal(idleSelection[0].weight,1,'stationary Idle must match the isolated Pawn Studio slot exactly');
  assert.equal(motion.select(set,{x:0,z:5.8,speed:5.8,grounded:true},1)[0].entry.id,'run-forward');
  const forwardBlend=motion.select(set,{x:0,z:5.8,speed:5.8,grounded:true},3);
  assert.equal(forwardBlend.some(item=>/^strafe-/.test(item.entry.id)),false,'straight Run must not inherit a one-sided Strafe pose');
  const diagonalBlend=motion.select(set,{x:-4,z:4,speed:5.8,grounded:true},3);
  assert.ok(diagonalBlend.some(item=>item.entry.id==='run-forward')&&diagonalBlend.some(item=>item.entry.id==='strafe-left-fast'),'diagonal movement should still blend adjacent directional samples');
  assert.equal(motion.select(set,{x:-2,z:0,speed:2,grounded:true},1)[0].entry.id,'strafe-left');
  assert.equal(motion.select(set,{x:0,z:2,speed:2,grounded:false,velocityY:-3},1)[0].entry.id,'fall');
  assert.equal(motion.lockRootYaw(set.find(entry=>entry.id==='run-forward')),true,'forward locomotion should remove accidental root-yaw drift by default');
  assert.equal(motion.lockRootYaw(Object.assign({},set.find(entry=>entry.id==='run-forward'),{rootYawMode:'authored'})),false,'authored root yaw must remain available as an explicit override');
});

test('forward locomotion root yaw is made in-place without removing pitch', () => {
  const THREE=require('three'),track=new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,1],[
    0,0,0,1,
    ...new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(12),THREE.MathUtils.degToRad(-9),0,'XYZ')).toArray(),
  ]);
  global.LK_RUNTIME_CHARACTER_LOCOMOTION.lockQuaternionYawDrift(track,THREE);
  const first=new THREE.Quaternion().fromArray(track.values,0),last=new THREE.Quaternion().fromArray(track.values,4),relative=first.clone().invert().multiply(last),twist=new THREE.Quaternion(0,relative.y,0,relative.w).normalize();
  assert.ok(twist.angleTo(new THREE.Quaternion())<1e-5,'Run root must not progressively steer left or right');
  assert.ok(Math.abs(new THREE.Euler().setFromQuaternion(relative,'XYZ').x)>.1,'forward lean/pitch from the authored Run should be preserved');
});

test('Shift sprint input cannot generate keyboard steering', () => {
  const actions=global.LK_RUNTIME_INPUT_ACTIONS,scheme=actions.defaultConfig().contexts.vehicle.schemes.keyboard,down=new Set(['KeyW','ShiftLeft']),drive=actions.resolveKeyboard(scheme,{isCodeDown:code=>down.has(code)});
  assert.equal(drive.sprint,true);
  assert.equal(drive.throttle,1);
  assert.equal(drive.steer,0);
});

test('motion database model and clip assets are portable graph dependencies', () => {
  const graph=global.LK_LOGIC_GRAPH.createEmptyGraph('Motion dependencies','element');
  graph.characterPawn={model:{id:'hero-model',dbKey:'db:hero'},animationSet:[{id:'run',clip:'Run',asset:{id:'run-motion',dbKey:'db:run'}}]};
  const deps=global.LK_LOGIC_GRAPH.collectGraphDependencies(graph);
  assert.equal(deps.some(dep=>dep.id==='hero-model'&&dep.owners.includes('character:model')),true);
  assert.equal(deps.some(dep=>dep.id==='run-motion'&&dep.owners.includes('character:motion:run')),true);
});

test('locomotion controller blends motion-set candidates instead of fixed slots', () => {
  const actions=new Map();
  const fakeAction=()=>({weight:0,stop(){return this;},setLoop(){return this;},setEffectiveWeight(value){this.weight=value;return this;},getEffectiveWeight(){return this.weight;},setEffectiveTimeScale(){return this;},play(){return this;},reset(){return this;},fadeOut(){return this;},fadeIn(){return this;}});
  const mixer={stopAllAction(){},clipAction(clip){if(!actions.has(clip))actions.set(clip,fakeAction());return actions.get(clip);},addEventListener(){},removeEventListener(){}};
  const clips=[{name:'Idle',userData:{}},{name:'Run',userData:{}}];
  const node={parent:{},userData:{logicAnimationMixer:mixer,logicAnimationClips:clips,logicAnimationAction:null}};
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:{LoopRepeat:'repeat',LoopOnce:'once'},walkSpeed:2,runSpeed:6,responsiveness:20});
  assert.equal(controller.bind(node,{},[],[
    {id:'idle',state:'grounded',direction:'idle',speed:0,clip:'Idle'},
    {id:'run',state:'grounded',direction:'forward',speed:6,clip:'Run'},
  ]),true);
  assert.deepEqual(controller.debugState().weights,{},'the legacy slot layer must stay absent when Motion Set actions bind');
  controller.update({x:0,z:6,speed:6,grounded:true},.2);
  assert.equal(controller.debugState().selection[0].id,'run');
  assert.ok(actions.get(clips[1]).weight>actions.get(clips[0]).weight);
});

test('animation slots can target separate GLB assets even when clip names collide', () => {
  const base = global.LK_RUNTIME_CHARACTER_PAWN_BASE;
  const binding = JSON.stringify({clip:'mixamo.com', asset:{key:'animation:run'}});
  assert.deepEqual(base.animationBindingSpec(binding), {clip:'mixamo.com', asset:{key:'animation:run'}});
  assert.equal(base.animationClipName(binding), 'mixamo.com');
  assert.deepEqual(base.animationAssetRef(binding), {key:'animation:run'});
  const idle = {name:'mixamo.com', userData:{lkAnimationAssetKey:'animation:idle'}};
  const run = {name:'mixamo.com', userData:{lkAnimationAssetKey:'animation:run'}};
  assert.equal(global.LK_RUNTIME_CHARACTER_LOCOMOTION.findClip([idle, run], binding, 'run'), run);
  assert.equal(global.LK_RUNTIME_CHARACTER_LOCOMOTION.findClip([idle, run], 'mixamo.com', 'idle'), idle);
  const genericOnly={name:'mixamo.com',userData:{lkAnimationAssetKey:'animation:idle'}};
  assert.equal(global.LK_RUNTIME_CHARACTER_LOCOMOTION.findClip([genericOnly],{clip:'Idle',asset:{key:'animation:idle'}},'idle'),genericOnly);
  const clip={name:'Idle',userData:{lkAnimationAssetKey:'animation:idle'},tracks:[{name:'Armature|mixamorig:Hips.quaternion'},{name:'mixamorigSpine.quaternion'},{name:'Armature/mixamorigLeftArm.quaternion'}],clone(){return {name:this.name,userData:Object.assign({},this.userData),tracks:this.tracks.map(track=>Object.assign({},track))};}};
  const target={traverse(visitor){[{name:'Hips'},{name:'Spine'},{name:'LeftArm'}].forEach(visitor);}};
  const retargeted=global.LK_RUNTIME_CHARACTER_LOCOMOTION.retargetClipNames(clip,target);
  assert.deepEqual(retargeted.tracks.map(track=>track.name),['Hips.quaternion','Spine.quaternion','LeftArm.quaternion']);
  assert.equal(retargeted.userData.lkAnimationAssetKey,'animation:idle');
  assert.equal(retargeted.userData.lkBoneNamesRetargeted,true);
  assert.deepEqual(retargeted.userData.lkBinding,{total:3,matched:3,unmatched:[],compatible:true,complete:true});
});

test('runtime retargets external clips against the normalized Main Mesh root', () => {
  const THREE=require('three');
  let mixerRoot=null,recordedClip=null;
  const action={stop(){return this;},setLoop(){return this;},setEffectiveWeight(){return this;},play(){return this;},reset(){return this;},fadeOut(){return this;},fadeIn(){return this;},setEffectiveTimeScale(){return this;},getEffectiveWeight(){return 1;}};
  class RecordingMixer{
    constructor(root){mixerRoot=root;}
    stopAllAction(){}
    clipAction(clip){recordedClip=clip;return action;}
    addEventListener(){}
    removeEventListener(){}
    update(){}
  }
  const THREERef=Object.assign({},THREE,{AnimationMixer:RecordingMixer});
  const holder=new THREE.Group(),modelRoot=new THREE.Group();
  holder.userData.logicAnimationClips=[];
  modelRoot.userData.logicElementAssetVisual=true;
  modelRoot.name='Normalized Main Mesh';
  holder.add(modelRoot);
  const clip=new THREE.AnimationClip('Idle',1,[
    new THREE.VectorKeyframeTrack('Hips.position',[0,1],[0,100,0,0,100,0]),
    new THREE.VectorKeyframeTrack('Armature.scale',[0,1],[1,1,1,100,100,100]),
    new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,1],[0,0,0,1,0,.1,0,.995]),
  ]);
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef});
  assert.equal(controller.bind(holder,{idle:'Idle'},[clip],[]),true);
  assert.equal(mixerRoot,modelRoot,'AnimationMixer must use the same Main Mesh root used by Pawn Studio');
  assert.deepEqual(recordedClip.tracks.map(track=>track.name),['Hips.quaternion'],'runtime clips must not overwrite Main Mesh position or scale');
  assert.equal(recordedClip.userData.lkRuntimeMainMeshProtected,true);
  controller.dispose();
});

test('normal, civil and police presets normalize independently', () => {
  const characters = global.LK_RUNTIME_CHARACTER_PAWNS;
  const normal = characters.normalizeConfig({preset:'normal'});
  const civil = characters.normalizeConfig({preset:'civil'});
  const police = characters.normalizeConfig({preset:'POLICE'});
  assert.ok(civil.movement.runSpeed < normal.movement.runSpeed);
  assert.ok(police.movement.runSpeed > normal.movement.runSpeed);
  assert.equal(police.preset, 'police');
  assert.equal(characters.normalizePreset('unknown'), 'normal');
});

test('graph-driven movement keeps the device look and combat channels', () => {
  // Every character template drives its Pawn from its own graph each frame, and
  // the movement node has no pins for firing or aiming. Replacing the whole
  // command with a movement-only object silently disabled the weapon.
  const drive = {steer:0, throttle:1, brake:0, sprint:false, reset:false, highBeams:false,
    cameraLookX:.4, cameraLookY:0, fire:true, aim:true, reload:false};
  const GAME = {systems:{}, input:{player:() => ({drive:() => drive, device:() => 'keyboard-1'})}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner = {position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,userData:{},traverse(){}};
  const pawn = global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME, owner, {preset:'normal',playerId:1}, {});
  pawn.start();

  const authored = pawn.setMoveInput({x:0, z:1, sprint:false});
  assert.equal(authored.z, 1, 'the authored movement is used');
  assert.equal(authored.fire, true, 'the trigger survives a graph-authored move');
  assert.equal(authored.aim, true, 'aim down sights survives a graph-authored move');
  assert.equal(authored.lookX, .4, 'stick look survives a graph-authored move');
  // An explicit value still wins, so a graph can hold fire on purpose.
  assert.equal(pawn.setMoveInput({z:1, fire:false}).fire, false, 'an explicit channel is honoured');
  pawn.dispose();
});

test('generic Character Pawn moves, jumps and changes preset', () => {
  const GAME = {systems:{}};
  const pawns = global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner = {position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,userData:{},traverse(){}};
  const pawn = global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME, owner, {preset:'normal',playerId:1}, {});
  assert.ok(pawn);
  assert.equal(pawn.pawnType, 'character');
  assert.equal(pawns.getByPlayerId(1), pawn);
  pawn.start();
  pawn.setMoveInput({z:1,sprint:true});
  for(let i=0;i<30;i++) pawn.step(1/60);
  assert.ok(owner.position.z > .2);
  assert.equal(pawn.jump(), true);
  pawn.step(1/60);
  assert.ok(owner.position.y > 0);
  assert.equal(pawn.setPreset('civil'), 'civil');
  assert.equal(pawn.characterPreset, 'civil');
  pawn.dispose();
});

function fakePlaceholderPart(id){
  return {
    userData:{logicElementSceneId:id},
    position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},
    rotation:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},
  };
}
function fakeOwnerWithPlaceholderRig(){
  const parts = ['torso_shirt','hips_shorts','leg_sock_left','leg_sock_right','arm_skin_left','arm_skin_right','head_skin'].map(fakePlaceholderPart);
  return {
    position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},
    rotation:{x:0,y:0,z:0},
    visible:true, userData:{}, children:parts,
    traverse(fn){ parts.forEach(fn); },
  };
}

test('procedural placeholder locomotion animates the built-in rig without a GLB', () => {
  const GAME = {systems:{}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner = fakeOwnerWithPlaceholderRig();
  const pawn = global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME, owner, {preset:'normal', playerId:1}, {});
  pawn.start();
  pawn.setMoveInput({z:1, sprint:true});
  for(let i=0;i<40;i++) pawn.step(1/60);
  assert.equal(pawn.locomotionKind, 'placeholder', 'no GLB is assigned, so locomotion should fall back to the placeholder animator');
  const legLeft = owner.children.find(c => c.userData.logicElementSceneId === 'leg_sock_left');
  assert.notEqual(legLeft.rotation.x, 0, 'placeholder leg should swing away from rest while moving');
  assert.equal(pawn.jump(), true);
  pawn.step(1/60);
  pawn.dispose();
});

test('character movement: Sprint selects a distinct run pace instead of analog magnitude', () => {
  // Regression test: digital keyboard input is always full magnitude, so the
  // walk/run split must come from the Sprint flag, not from input length.
  const options = {walkSpeed:1.8, runSpeed:5.4, sprintMultiplier:1.3, acceleration:40};
  const walkMovement = global.LK_RUNTIME_CHARACTER_MOVEMENT.create({}, options);
  const walker = {position:{x:0,y:0,z:0}, rotation:{y:0}};
  let walkSnapshot;
  for(let i=0;i<120;i++) walkSnapshot = walkMovement.step(walker, {x:0, z:1, sprint:false}, 1/60, 0);
  const runMovement = global.LK_RUNTIME_CHARACTER_MOVEMENT.create({}, options);
  const runner = {position:{x:0,y:0,z:0}, rotation:{y:0}};
  let runSnapshot;
  for(let i=0;i<120;i++) runSnapshot = runMovement.step(runner, {x:0, z:1, sprint:true}, 1/60, 0);
  assert.ok(walkSnapshot.speed < 2.2, 'walk pace should settle near walkSpeed, got ' + walkSnapshot.speed);
  assert.ok(runSnapshot.speed > 6, 'sprint pace should settle near runSpeed*sprintMultiplier, got ' + runSnapshot.speed);
  assert.ok(runSnapshot.speed > walkSnapshot.speed * 2.5, 'sprint should be clearly faster than walk');
  assert.ok(Math.abs(runner.position.x)<1e-8,'Shift may change gait speed but must never create a lateral trajectory');
});

test('football-facing movement keeps heading while A/D produces a real strafe', () => {
  const movement=global.LK_RUNTIME_CHARACTER_MOVEMENT.create({}, {inputMode:'heading',facingMode:'heading',walkSpeed:2,runSpeed:6}),owner={position:{x:0,y:0,z:0},rotation:{y:0}};
  for(let i=0;i<60;i++)movement.step(owner,{x:1,z:0,sprint:false},1/60,0);
  assert.ok(owner.position.x>1,'lateral input should move across the pitch');
  assert.ok(Math.abs(owner.position.z)<.001);
  assert.equal(owner.rotation.y,0,'football strafe must preserve the player facing');
});

test('character movement ignores the Pawn own Logic Element collider', () => {
  const owner = {position:{x:0,y:0,z:0},rotation:{y:0}};
  const GAME = {world:{colliders:{box:[{x:0,y:.95,z:0,hx:.35,hy:.95,hz:.35,enabled:true,logicElementOwner:owner}],circle:[]}}};
  const movement = global.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME, {inputMode:'heading'});
  movement.step(owner, {x:0,z:0,sprint:false}, 1/60, 0);
  assert.equal(owner.position.x, 0);
  assert.equal(owner.position.z, 0);
});

test('Sketch Street template preserves the concept as editable native objects', () => {
  const scene = global.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE.buildScene({version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}});
  const logic = scene.added.filter(entry => entry.kind === 'logicElement');
  const names = scene.added.map(entry => entry.name);
  assert.equal(logic.length, 2);
  assert.ok(logic.some(entry => entry.graph.characterPawn && entry.graph.characterPawn.possessed));
  assert.ok(logic.some(entry => entry.graph.characterPawn && entry.graph.characterPawn.id === 'talkable-civil-npc'));
  assert.equal(names.filter(name => /^House \d Body$/.test(name)).length, 8);
  assert.ok(names.includes('Green Scooter Body'));
  assert.ok(names.includes('Vending Machine Body'));
  assert.ok(names.includes('Sea Backdrop'));
  assert.ok(scene.added.filter(entry => entry.kind === 'primitive').length >= 200);
  assert.deepEqual(scene.characterGround, {type:'slope-z',slopeStart:-2,crestZ:-30,slope:.26,baseY:0,minX:-3.45,maxX:3.45,minZ:-28.4,maxZ:16.5});
  assert.ok(global.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE.groundH(-20) > global.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE.groundH(0));
  assert.equal(scene.template.id, 'character-movement-playground');
  assert.equal(scene.template.sourceConcept, 'sketch-street_v2.html');
  assert.equal(scene.template.nativeEditable, true);
});

console.log('All character core tests passed.');
