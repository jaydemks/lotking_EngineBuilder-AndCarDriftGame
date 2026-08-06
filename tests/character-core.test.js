'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/runtime/character-animation-blend.js');
require('../js/runtime/character-placeholder-locomotion.js');
require('../js/runtime/mixamo-placeholder-clips.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-nodes-soccer.js');
require('../js/logic/logic-nodes-character.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-soccer.js');
require('../js/runtime/character-bodies.js');
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
  assert.equal(template.graph.characterPawn.firstPerson.view,'third');
  assert.equal(template.graph.characterPawn.firstPerson.unifiedBodyCamera,true);
  assert.equal(template.graph.variables.find(item=>item.binding==='firstPerson.view').value,'third');
  assert.equal(template.graph.variables.some(item=>/^camera\./.test(String(item.binding||''))),false,'the shared view rig replaces dead generic follow-camera controls');
  assert.equal(template.graph.characterPawn.vitals.respawnMode,'spawn');
  assert.equal(template.graph.characterPawn.vitals.respawnOnDeath,true);
  assert.equal(template.graph.characterPawn.playerRespawnDefaultVersion,1);
  assert.equal(template.graph.characterPawn.vitals.deathPhysics.profile,'humanoid');
  assert.ok(template.graph.variables.find(item=>item.binding==='vitals.deathPhysics.mode').options.some(option=>option.value==='rigid'));
  assert.equal(template.graph.logicScene.elements.some(element=>element.id==='camera_anchor'),false,'camera behavior must not enlarge the Character spatial dummy');
  const cameraRigs=template.graph.logicScene.elements.filter(element=>element.cameraRigRole);
  assert.deepEqual(cameraRigs.map(element=>element.cameraRigRole).sort(),['character-first','character-third']);
  cameraRigs.forEach(element=>{
    assert.equal(element.type,'camera');
    assert.equal(element.editorOnly,true);
    assert.equal(element.contributesToBounds,false);
    assert.equal(element.dummyVisible,true);
  });
  assert.equal(template.graph.logicScene.elements.some(element=>/ball|goal|penalty/i.test(element.id+' '+element.name)),false,'generic Character must not own soccer interactions');
  const result = global.LK_LOGIC_VALIDATOR.validateGraph(template.graph, registry);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(template.graph.nodes.some(node=>node.type==='event.onKeyDown'),false,'shipped Character gameplay must not listen to raw keys');
  const npc = global.LK_LOGIC_TEMPLATES.get('logic-template-talkable-civil-npc');
  assert.ok(npc && npc.graph.characterPawn);
  const npcInput=npc.graph.nodes.find(node=>node.id==='on_interact');
  assert.equal(npcInput.type,'event.onPlayerInputActionDown');
  assert.deepEqual(npcInput.data,{playerId:1,action:'interact'},'unpossessed NPC dialogue must explicitly subscribe to Player 1 Interact');
  const npcResult = global.LK_LOGIC_VALIDATOR.validateGraph(npc.graph, registry);
  assert.equal(npcResult.ok, true, JSON.stringify(npcResult.errors));
  const ai=global.LK_LOGIC_TEMPLATES.get('logic-template-ai-character');assert.ok(ai&&ai.graph.characterPawn.behavior.enabled);
  assert.equal(ai.graph.characterPawn.playerId,null);assert.equal(ai.graph.characterPawn.firstPerson.view,'third');assert.equal(ai.graph.characterPawn.inventory.autoEquip,false);assert.equal(ai.graph.characterPawn.vitals.deathPhysics.profile,'humanoid');
  assert.equal(ai.graph.characterPawn.vitals.respawnMode,'none','Enemy defaults remain non-respawning');
  assert.equal(global.LK_LOGIC_VALIDATOR.validateGraph(ai.graph,registry).ok,true);
  ['logic-template-player-character-third-person','logic-template-ai-character'].forEach(id=>{const graph=global.LK_LOGIC_TEMPLATES.get(id).graph,bindings=graph.variables.filter(item=>item.exposed&&item.binding).map(item=>item.binding);assert.equal(new Set(bindings).size,bindings.length,id+' must not expose duplicate bindings');});
});

test('Character camera dummy transforms persist into the exact Play config', () => {
  const template=global.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal');
  const graph=global.LK_LOGIC_GRAPH.clone(template.graph);
  const first=graph.logicScene.elements.find(element=>element.cameraRigRole==='character-first');
  const third=graph.logicScene.elements.find(element=>element.cameraRigRole==='character-third');
  first.position=[.07,1.71,.34];first.rotation=[-3,187,1];
  third.position=[.74,1.63,-3.42];third.rotation=[-6,176,0];
  global.LK_LOGIC_GRAPH.syncPawnCameraConfigFromElement(graph,first.id);
  global.LK_LOGIC_GRAPH.syncPawnCameraConfigFromElement(graph,third.id);
  assert.equal(graph.characterPawn.firstPerson.autoEyeHeight,false);
  assert.deepEqual([
    graph.characterPawn.firstPerson.bodyEyeSide,
    graph.characterPawn.firstPerson.eyeHeight,
    graph.characterPawn.firstPerson.bodyEyeForward,
  ],[.07,1.71,.34]);
  assert.deepEqual([
    graph.characterPawn.firstPerson.thirdPerson.shoulder,
    graph.characterPawn.firstPerson.thirdPerson.height,
  ],[.74,1.63]);
  assert.ok(Math.abs(graph.characterPawn.firstPerson.thirdPerson.distance-3.6)<1e-9);
  assert.equal(graph.variables.find(variable=>variable.binding==='firstPerson.eyeHeight').value,1.71);
  assert.equal(graph.variables.find(variable=>variable.binding==='firstPerson.thirdPerson.shoulder').value,.74);
  const normalized=global.LK_LOGIC_GRAPH.normalizeGraph(graph);
  assert.equal(normalized.logicScene.elements.filter(element=>element.cameraRigRole).length,2,'normalization is idempotent');
  assert.deepEqual(normalized.logicScene.elements.find(element=>element.id===first.id).position,first.position,'saved camera mount survives reload');
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
  assert.ok(source.includes("kind:'camera-rig'") && source.includes('new THREE.CameraHelper(camera)'), 'Pawn Studio exposes separate selectable First and Third Person camera dummies');
  assert.ok(source.includes("bodyEyeForward") && source.includes("minimumBodyDistance"), 'camera dummy edits persist the face-clearance and body-safety contract used by Play');
  assert.ok(source.includes("Manual focus distance (m)") && source.includes("Near clipping plane (m)"), 'each camera exposes its optical focus and clipping controls');
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

test('active Character locomotion owns and advances imported scene mixers', () => {
  const THREE=require('three'),holder=new THREE.Group(),modelRoot=new THREE.Group(),hips=new THREE.Bone();hips.name='Hips';modelRoot.userData.logicElementAssetVisual=true;modelRoot.add(hips);holder.add(modelRoot);
  const clip=new THREE.AnimationClip('Idle',1,[new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,1],[0,0,0,1,.258819,0,0,.965926])]),mixer=new THREE.AnimationMixer(modelRoot);holder.userData.logicAnimationClips=[clip];holder.userData.logicAnimationMixer=mixer;
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE});
  assert.equal(controller.bind(holder,{idle:'Idle'},[],[]),true);
  assert.ok(holder.userData.logicCharacterLocomotionMixerOwner,'a bound runtime Character must claim its imported mixer');
  const before=mixer.time;controller.update({x:0,z:0,speed:0,grounded:true},.2);
  assert.ok(mixer.time>before+.19,'the Character update must advance the imported mixer without depending on scene-store hooks');
  controller.dispose();
  assert.equal(holder.userData.logicCharacterLocomotionMixerOwner,undefined,'leaving Play must return mixer ownership to scene-store');
});

test('legacy Flying Curve data is preserved but no longer shifts the runtime Main Mesh', () => {
  const THREE=require('three'),holder=new THREE.Group(),modelRoot=new THREE.Group(),hips=new THREE.Bone();hips.name='Hips';modelRoot.userData.logicElementAssetVisual=true;modelRoot.add(hips);holder.add(modelRoot);
  const clip=new THREE.AnimationClip('Idle',1,[new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,1],[0,0,0,1,0,0,0,1])]),mixer=new THREE.AnimationMixer(modelRoot);holder.userData.logicAnimationClips=[clip];holder.userData.logicAnimationMixer=mixer;
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE});
  assert.equal(controller.bind(holder,{},[],[{id:'idle-curve',name:'Idle',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true,curveCorrection:{offset:[0,1,0],influence:1}}]),true);
  controller.update({x:0,z:0,speed:0,grounded:true},.1);
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
  const tick=desired=>controller.update(desired,1/60);
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
  for(let i=0;i<20;i++)controller.update({x:0,z:1,speed:2,grounded:false,velocityY:3},1/60);
  assert.equal(controller.debugState().selection[0].id,'jump-entry');
  assert.equal(controller.isActionPlaying(),false,'Motion Set Jump must not be replaced by a legacy one-shot');
  controller.dispose();
});

test('action asset playback metadata can run a shared climb clip in reverse', () => {
  const THREE=require('three'),holder=new THREE.Group(),modelRoot=new THREE.Group(),hips=new THREE.Bone();
  hips.name='Hips';modelRoot.userData.logicElementAssetVisual=true;modelRoot.add(hips);holder.add(modelRoot);
  const track=(name,duration)=>new THREE.AnimationClip(name,duration,[new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,duration],[0,0,0,1,0,0,0,1])]);
  const idle=track('Idle',1),climb=track('Climbing To Top',4),mixer=new THREE.AnimationMixer(modelRoot);
  holder.userData.logicAnimationClips=[idle,climb];holder.userData.logicAnimationMixer=mixer;
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE});
  assert.equal(controller.bind(holder,{idle:'Idle'},[],[]),true);
  assert.equal(controller.playAction({clip:'Climbing To Top',asset:{playbackRate:-1}},{slot:'climbDown',loop:true}),true);
  const action=mixer.clipAction(climb);
  assert.equal(action.timeScale,-1);
  assert.ok(action.time>3.9,'negative playback must begin at the clip end rather than immediately finishing at zero');
  controller.update({x:0,z:0,speed:0,grounded:true},.25);
  assert.ok(action.time<3.9&&controller.isActionPlaying(),'the reverse held action must advance backward and remain active');
  controller.dispose();
});

test('action playback composes authored rate with gameplay tempo and duration fitting', () => {
  const THREE=require('three'),holder=new THREE.Group(),modelRoot=new THREE.Group(),hips=new THREE.Bone();
  hips.name='Hips';modelRoot.userData.logicElementAssetVisual=true;modelRoot.add(hips);holder.add(modelRoot);
  const clip=new THREE.AnimationClip('Wall Flip',2,[new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,2],[0,0,0,1,0,0,0,1])]),idle=new THREE.AnimationClip('Idle',1,[new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,1],[0,0,0,1,0,0,0,1])]),mixer=new THREE.AnimationMixer(modelRoot);
  holder.userData.logicAnimationClips=[idle,clip];holder.userData.logicAnimationMixer=mixer;
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE});
  assert.equal(controller.bind(holder,{idle:'Idle',wallFlip:'Wall Flip'},[],[{id:'idle',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true},{id:'action-slot-wallFlip',state:'action',action:'wallFlip',clip:'Wall Flip',playbackRate:2,loop:false}]),true);
  assert.equal(controller.playAction('Wall Flip',{slot:'wallFlip',speedScale:1.5,fitDuration:.8}),true);
  assert.ok(Math.abs(mixer.clipAction(clip).timeScale-3)<1e-9,'2x authored rate multiplied by 1.5x gameplay tempo');
  assert.ok(Math.abs(controller.actionDuration()-2/3)<1e-6,'reported gameplay duration uses the effective rate');
  controller.stopAction();
  assert.equal(controller.playAction('Wall Flip',{slot:'wallFlip',speedScale:.25,fitDuration:.4}),true);
  assert.ok(Math.abs(mixer.clipAction(clip).timeScale-5)<1e-9,'duration fitting accelerates a slow take enough to meet the cap');
  assert.ok(controller.actionDuration()<=.400001);
  controller.dispose();
});

test('Falling To Landing crossfades into Run and a repeated jump interrupts it', () => {
  const THREE=require('three'),holder=new THREE.Group(),modelRoot=new THREE.Group(),hips=new THREE.Bone();
  hips.name='Hips';modelRoot.userData.logicElementAssetVisual=true;modelRoot.add(hips);holder.add(modelRoot);
  const track=(name,angle)=>new THREE.AnimationClip(name,1,[new THREE.QuaternionKeyframeTrack('Hips.quaternion',[0,.5,1],[0,0,0,1,Math.sin(angle/2),0,0,Math.cos(angle/2),0,0,0,1])]);
  const idle=track('Idle',.05),run=track('Run',.2),jump=track('Jump',.45),landing=track('Falling To Landing',.7),mixer=new THREE.AnimationMixer(modelRoot);
  holder.userData.logicAnimationClips=[idle,run,jump,landing];holder.userData.logicAnimationMixer=mixer;
  const set=[
    {id:'idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true},
    {id:'run',name:'Run',state:'grounded',direction:[0,1],speed:6,clip:'Run',loop:true},
    {id:'jump-entry',name:'Jump',state:'jump',direction:[0,1],speed:6,clip:'Jump',loop:false},
    {id:'landing-moving',name:'Moving Land',state:'land',direction:[0,1],speed:6,clip:'Falling To Landing',loop:false},
  ];
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:THREE,responsiveness:12});
  assert.equal(controller.bind(holder,{},[],set),true);
  controller.update({x:0,z:6,speed:6,grounded:true,justLanded:true},1/60);
  assert.equal(controller.playAction('Falling To Landing',{slot:'landMoving'}),true);
  const landingAction=mixer.clipAction(landing);
  controller.update({x:0,z:6,speed:6,grounded:true,justLanded:false},1/60);
  // Evaluate the weights exactly as the renderer will. A second Three.js
  // fade interpolant used to multiply the explicit skeletal crossfade, leaving
  // the missing remainder in bind/T-pose for the first landing frames.
  mixer.update(0);
  assert.ok(landingAction.getEffectiveWeight()+mixer.clipAction(run).getEffectiveWeight()>.99,
    'moving landing plus Run must cover the skeleton instead of exposing bind pose');
  for(let frame=0;frame<12;frame++)controller.update({x:0,z:6,speed:6,grounded:true,justLanded:false},1/60);
  assert.equal(controller.debugState().oneShot,'Falling To Landing');
  const early=controller.debugState().oneShotBlend;
  assert.ok(early.locomotionWeight>.65,'at foot contact Run must already own most of the moving skeleton');
  for(let frame=0;frame<24;frame++)controller.update({x:0,z:6,speed:6,grounded:true,justLanded:false},1/60);
  const late=controller.debugState().oneShotBlend,runAction=mixer.clipAction(run);
  assert.ok(late.locomotionWeight>early.locomotionWeight,'Run must progressively re-enter before Landing finishes');
  assert.ok(landingAction.getEffectiveWeight()<early.actionWeight,'Landing skeleton weight must release progressively');
  assert.ok(runAction.getEffectiveWeight()>.65,'Run must react immediately while Landing is still active');
  controller.update({x:0,z:6,speed:6,grounded:false,velocityY:4,justLanded:false},1/60);
  assert.equal(controller.debugState().oneShot,null,'a repeated jump must cancel the previous landing immediately');
  assert.equal(controller.debugState().selection[0].id,'jump-entry');
  controller.dispose();
});

test('numbered Mixamo FBX namespaces retarget Falling To Landing onto the mannequin', () => {
  const locomotion=global.LK_RUNTIME_CHARACTER_LOCOMOTION;
  assert.equal(locomotion.normalizedTrackNode('mixamorig5Hips'),'hips');
  assert.equal(locomotion.normalizedTrackNode('mixamorig_005_Hips'),'hips');
  assert.equal(locomotion.normalizedTrackNode('mixamorig5:Hips'),'hips');
  const clip={
    name:'Falling To Landing',userData:{},
    tracks:[{name:'mixamorig5Hips.quaternion'}],
    clone(){return {name:this.name,userData:{},tracks:this.tracks.map(track=>Object.assign({},track))};},
  };
  const target={traverse(visitor){visitor({name:'mixamorigHips'});}};
  const retargeted=locomotion.retargetClipNames(clip,target);
  assert.equal(retargeted.tracks[0].name,'mixamorigHips.quaternion');
  assert.equal(retargeted.userData.lkBoneNamesRetargeted,true);
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
    {id:'run-forward-left',state:'grounded',direction:[Math.SQRT1_2,Math.SQRT1_2],speed:6,clip:'Run Forward Left'},
    {id:'run-forward-right',state:'grounded',direction:[-Math.SQRT1_2,Math.SQRT1_2],speed:6,clip:'Run Forward Right'},
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
  assert.equal(forwardBlend.some(item=>/left|right/.test(item.entry.id)),false,
    'perfectly straight input must not mix diagonal/side clips that can bias the body toward the crosshair');
  // x is the lateral input in the character's own frame, where +X is its LEFT:
  // pressing A/Left produces steer = +1 and the movement controller's world/local
  // pair cancels to the identity, and the bundled `left strafe` clip displaces the
  // hips by dx = +179 cm. So a positive x must select the LEFT sample, and this
  // used to assert the mirror image of that.
  const diagonalBlend=motion.select(set,{x:4,z:4,speed:5.8,grounded:true},3);
  assert.ok(diagonalBlend.some(item=>item.entry.id==='run-forward')&&diagonalBlend.some(item=>item.entry.id==='strafe-left-fast'),'diagonal movement should still blend adjacent directional samples');
  assert.equal(motion.select(set,{x:2,z:0,speed:2,grounded:true},1)[0].entry.id,'strafe-left');
  assert.equal(motion.select(set,{x:-6,z:0,speed:6,grounded:true},1)[0].entry.id,'strafe-right-fast','and a negative x is the right side');
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

test('locomotion controller blends motion-set candidates and scales playback', () => {
  const actions=new Map();
  const fakeAction=()=>({weight:0,timeScale:1,stop(){return this;},setLoop(){return this;},setEffectiveWeight(value){this.weight=value;return this;},getEffectiveWeight(){return this.weight;},setEffectiveTimeScale(value){this.timeScale=value;return this;},play(){return this;},reset(){return this;},fadeOut(){return this;},fadeIn(){return this;}});
  const mixer={time:0,stopAllAction(){},clipAction(clip){if(!actions.has(clip))actions.set(clip,fakeAction());return actions.get(clip);},addEventListener(){},removeEventListener(){},update(dt){this.time+=dt;}};
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
  controller.update({x:0,z:3,speed:3,grounded:true,inputMagnitude:.5},.2);
  assert.ok(Math.abs(actions.get(clips[1]).timeScale-.5)<.001,
    'half physical speed must play Run at half authored rate, got '+actions.get(clips[1]).timeScale);
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

test('a possessed Character keeps the complete live device command over graph pins', () => {
  // Every character template drives its Pawn from its own graph each frame, and
  // the movement node has no pins for firing or aiming. Replacing the whole
  // command with a movement-only object silently disabled the weapon.
  const drive = {steer:.65, throttle:1, brake:0, sprint:false, reset:false, highBeams:false,
    cameraLookX:.4, cameraLookY:0, fire:true, aim:true, reload:false};
  const GAME = {systems:{}, input:{player:() => ({drive:() => drive, device:() => 'keyboard-1'})}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner = {position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,userData:{},traverse(){}};
  const pawn = global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME, owner, {preset:'normal',playerId:1}, {});
  pawn.start();

  const authored = pawn.setMoveInput({x:0, z:1, sprint:false});
  assert.equal(authored.x, .65, 'a missing/stale graph X edge cannot remove live lateral movement');
  assert.equal(authored.z, 1, 'the live forward axis reaches the possessed Pawn');
  assert.equal(authored.fire, true, 'the trigger survives a graph-authored move');
  assert.equal(authored.aim, true, 'aim down sights survives a graph-authored move');
  assert.equal(authored.lookX, .4, 'stick look survives a graph-authored move');
  assert.equal(pawn.setMoveInput({z:1, fire:false}).fire, true, 'a possessed Pawn ignores graph-authored fire suppression too');
  drive.steer=-.4;drive.throttle=0;drive.brake=.75;drive.sprint=true;drive.fire=false;
  pawn.setMoveInput({z:1,fire:true});
  let frameCommand=null;pawn.beforeMovementStep=(dt,move)=>{frameCommand=Object.assign({},move);return true;};pawn.step(1/60);
  assert.equal(frameCommand.x,-.4,'left/right input refreshes on the simulation frame, not only the Logic tick');
  assert.equal(frameCommand.z,-.75,'forward/back input refreshes on the simulation frame, not only the Logic tick');
  assert.equal(frameCommand.sprint,true,'the gait button has the same device authority as movement');
  const frameFire=frameCommand.fire;
  assert.equal(frameFire,false,'releasing the real trigger clears a cached fire command on the very next Pawn frame');
  pawn.dispose();
});

test('a traversal takeover keeps the Character AnimationMixer advancing', () => {
  const GAME={systems:{},state:{}};global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner={position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,userData:{},traverse(){}};
  const pawn=global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME,owner,{preset:'normal',playerId:null},{});
  let updates=0;
  const locomotion={update(){updates++;},dispose(){},configure(){}};
  pawn.locomotion=locomotion;pawn.ensureLocomotion=()=>locomotion;
  pawn.beforeMovementStep=()=>true;
  pawn.start();pawn.step(1/60);
  assert.equal(updates,1,'roll/slide/vault ownership must not freeze its own one-shot animation');
  pawn.dispose();
});

test('generic Character Pawn moves, jumps and changes preset', () => {
  const GAME = {systems:{},state:{}};
  const pawns = global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner = {position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,userData:{},traverse(){}};
  const pawn = global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME, owner, {preset:'normal',playerId:1}, {});
  assert.ok(pawn);
  assert.equal(pawn.pawnType, 'character');
  assert.equal(pawns.getByPlayerId(1), pawn);
  pawn.start();
  assert.equal(GAME.state.runtimeVehicleCameraPawnIds[1],pawn.id,'a possessed Character must claim Player 1 camera when it starts');
  pawn.setMoveInput({z:1,sprint:true});
  for(let i=0;i<30;i++) pawn.step(1/60);
  assert.ok(owner.position.z > .2);
  assert.equal(pawn.jump(), true);
  pawn.step(1/60);
  assert.ok(owner.position.y > 0);
  assert.equal(pawn.setPreset('civil'), 'civil');
  assert.equal(pawn.characterPreset, 'civil');
  pawn.dispose();
  assert.equal(GAME.state.runtimeVehicleCameraPawnIds[1],undefined,'disposing the Character must release its camera output');
});

test('Character Pawn disposal releases AI behavior and combat ownership synchronously', () => {
  const released={behavior:[],combat:[]},GAME={systems:{actorBehavior:{releasePawn(pawn,reason){released.behavior.push([pawn,reason]);return true;}},actorCombat:{releasePawn(pawn){released.combat.push(pawn);return true;}}}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner={position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,userData:{},traverse(){}};
  const pawn=global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME,owner,{id:'release-character',preset:'normal',playerId:null},{});assert.equal(pawn.dispose(),true);assert.deepEqual(released.behavior,[[pawn,'pawn-dispose']]);assert.deepEqual(released.combat,[pawn]);assert.equal(pawn.dispose(),false);assert.equal(released.behavior.length,1);assert.equal(released.combat.length,1);
});

test('Character possession clears every stale authored or AI command channel', () => {
  const GAME={systems:{}};global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner={position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,userData:{},traverse(){}};
  const pawn=global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME,owner,{id:'possession-boundary',preset:'normal',playerId:null,possessed:false},{});
  pawn.setMoveInput({z:1,aim:true,fire:true});assert.equal(pawn.control.fire,true);
  assert.equal(pawn.possess(1,true),true);assert.equal(pawn.possessed,true);assert.equal(pawn.playerId,1);assert.equal(pawn.control,null,'the first player frame must be device-owned, never an old AI command');pawn.dispose();
});

test('runtime locomotion and reset keep Logic Element colliders on the Pawn', () => {
  const previousStore=global.LK_STORE,calls=[];
  global.LK_STORE={updateLogicElementColliderRefs(owner){calls.push(owner.position.z);}};
  try{
    const GAME={systems:{}};global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
    const owner={position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,
      userData:{logicElementColliderRefs:[{enabled:true}]},traverse(){}};
    const pawn=global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME,owner,{preset:'normal',playerId:null,spawn:{x:0,y:0,z:0,heading:0}},{});
    pawn.start();pawn.setMoveInput({x:0,z:1});pawn.step(.1);
    assert.ok(calls.length>=2&&calls.at(-1)>0,'the moving Pawn must publish its new collider transform');
    pawn.reset();assert.equal(calls.at(-1),0,'reset must publish the restored spawn transform');
    pawn.dispose();
  }finally{global.LK_STORE=previousStore;}
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

test('procedural firearm fire is recoil, while Soccer Shoot remains a kick', () => {
  const runtime=global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
  const owner=fakeOwnerWithPlaceholderRig(),controller=runtime.createController();
  assert.equal(controller.bind(owner),true);
  assert.equal(runtime.resolveGesture('Shoot'),'kick','Soccer Shoot must keep its kick semantics');
  assert.equal(runtime.resolveGesture('Firing Rifle'),'fire');
  assert.equal(controller.playAction('mixamo.com',{slot:'fire',duration:.22}),true,
    'the authored slot must disambiguate a generic imported take name');
  assert.equal(controller.debugState().gesture,'fire');
  controller.update({weapon:{carry:1,kind:'firearm',firing:true,twoHanded:false}},.05);
  const torso=owner.children.find(child=>child.userData.logicElementSceneId==='torso_shirt');
  assert.ok(torso.rotation.x<0,'the placeholder applies recoil instead of the generic one-arm interaction');
  controller.dispose();
});

test('character movement keeps walk, sprint and partial trigger pace scalar', () => {
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
  const partialMovement = global.LK_RUNTIME_CHARACTER_MOVEMENT.create({}, options);
  const partial = {position:{x:0,y:0,z:0}, rotation:{y:0}};
  let partialSnapshot;
  for(let i=0;i<120;i++) partialSnapshot = partialMovement.step(partial, {x:0,z:1,sprintAmount:.5}, 1/60, 0);
  assert.ok(partialSnapshot.speed > walkSnapshot.speed && partialSnapshot.speed < runSnapshot.speed,
    'half trigger must settle between walk and full sprint, got ' + partialSnapshot.speed);
  assert.equal(partialSnapshot.sprintAmount,.5);
  assert.ok(Math.abs(runner.position.x)<1e-8,'Shift may change gait speed but must never create a lateral trajectory');
});

test('football-facing movement keeps heading while A/D produces a real strafe', () => {
  const movement=global.LK_RUNTIME_CHARACTER_MOVEMENT.create({}, {inputMode:'heading',facingMode:'heading',walkSpeed:2,runSpeed:6}),owner={position:{x:0,y:0,z:0},rotation:{y:0}};
  for(let i=0;i<60;i++)movement.step(owner,{x:1,z:0,sprint:false},1/60,0);
  assert.ok(owner.position.x>1,'lateral input should move across the pitch');
  assert.ok(Math.abs(owner.position.z)<.001);
  assert.equal(owner.rotation.y,0,'football strafe must preserve the player facing');
});

test('combat can override facing for one frame without rewriting authored movement', () => {
  const movement=global.LK_RUNTIME_CHARACTER_MOVEMENT.create({}, {inputMode:'heading',facingMode:'heading',walkSpeed:3,turnRate:20});
  const owner={position:{x:0,y:0,z:0},rotation:{y:0}};
  let snapshot;
  for(let frame=0;frame<30;frame++)snapshot=movement.step(owner,{x:1,z:0,inputMode:'heading',facingMode:'movement'},1/60,0);
  assert.ok(owner.rotation.y>1,'hip locomotion can turn toward travel instead of the crosshair');
  assert.equal(snapshot.facingMode,'movement');
  assert.equal(movement.options().facingMode,'heading','the per-frame policy does not mutate saved author settings');
});

test('character movement ignores the Pawn own Logic Element collider', () => {
  const owner = {position:{x:0,y:0,z:0},rotation:{y:0}};
  const GAME = {world:{colliders:{box:[{x:0,y:.95,z:0,hx:.35,hy:.95,hz:.35,enabled:true,logicElementOwner:owner}],circle:[]}}};
  const movement = global.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME, {inputMode:'heading'});
  movement.step(owner, {x:0,z:0,sprint:false}, 1/60, 0);
  assert.equal(owner.position.x, 0);
  assert.equal(owner.position.z, 0);
});

test('character movement ignores a complex aggregate and fails closed on unsampleable horizontal parts', () => {
  const root={x:0,y:5,z:0,hx:80,hy:5,hz:80,enabled:true,compoundRoot:true,parts:[]};
  const part={x:20,y:1,z:20,hx:1,hy:1,hz:1,enabled:true,compoundPart:true,parentRef:root};
  const asphalt={x:0,y:.05,z:0,hx:80,hy:.05,hz:80,enabled:true,compoundPart:true,horizontalSurface:true,parentRef:root};
  root.parts.push(part,asphalt);
  const GAME={world:{colliders:{box:[root,part,asphalt],circle:[]},characterGroundHeight:()=>0}};
  const movement=global.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME,{inputMode:'heading',walkSpeed:3,acceleration:40});
  const owner={position:{x:0,y:0,z:0},rotation:{y:0}};
  for(let frame=0;frame<60;frame++)movement.step(owner,{x:1,z:1,sprint:false},1/60,0);
  assert.ok(owner.position.x>1&&owner.position.z>1,
    'the aggregate bounds of imported scenery must not confine either movement axis');
  assert.ok(owner.position.x<5&&owner.position.z<5,
    'ignoring the root must not teleport the Character to the aggregate edge');
  assert.ok(Math.abs(owner.position.y)<1e-6,
    'a horizontal complex part without an exact mesh identity must not become an AABB floor');
  const blocked=global.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME,{inputMode:'heading',walkSpeed:3,acceleration:40});
  const second={position:{x:20,y:0,z:17},rotation:{y:0}};
  for(let frame=0;frame<120;frame++)blocked.step(second,{x:0,z:1,sprint:false},1/60,0);
  assert.ok(second.position.z<19,'the real compound child remains a solid obstacle');
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
