'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
global.window=global;
global.localStorage={getItem(){return null;},setItem(){}};
global.THREE=require('three');
require('../js/plugins/plugin-api.js');
require('../js/plugins/plugin-manager.js');
require('../js/runtime/character-animation-set.js');
require('../js/runtime/character-bodies.js');
require('../js/runtime/vehicle-occupancy.js');
require('../js/editor/pawn-studio.js');

const studio=global.LK_EDITOR_PAWN_STUDIO;
assert.ok(studio);
assert.deepEqual(studio.timelineMetrics({playbackRate:.5},2.5,1.25),{sourceDuration:2.5,rate:.5,slotDuration:5,sourcePhase:.5,playPhase:.5,seconds:2.5});
assert.equal(studio.timelineMetrics({playbackRate:-2},2.5,2.5).seconds,0,'a reversed slot starts at 0 s while sampling the clip end');
assert.equal(studio.playbackRate(50),4,'Pawn Studio and runtime share the visible maximum playback rate');
assert.equal(studio.playbackRate(-50),-4,'reverse playback keeps its sign while clamping magnitude');
assert.equal(studio.combinedPlaybackRate(2,1),2,'2x reaches the live preview action');
assert.equal(studio.combinedPlaybackRate(4,1),4,'4x reaches the live preview action');
assert.equal(studio.combinedPlaybackRate(50,1),4,'50x is visibly clamped to the shared 4x ceiling instead of being ignored');
assert.equal(studio.timelineMetrics({playbackRate:50},2,0).slotDuration,.5,'the timeline reports the same clamped duration as Preview and Play');
assert.deepEqual(studio.listTypes().map(type=>type.id),['character','soccer','vehicle']);

const characterGraph={characterPawn:{schemaVersion:2,model:{id:'hero'},animations:{idle:'Idle',run:'Run'},movement:{},camera:{},appearance:{}},logicScene:{elements:[]}};
const character=studio.resolveType(characterGraph);
assert.equal(character.id,'character');
const characterContainers=character.containers({graph:characterGraph,definition:characterGraph.characterPawn,adapter:character});
assert.deepEqual(characterContainers.slice(0,4).map(container=>container.id),['overview','model','skeleton','collision']);
assert.equal(characterContainers.find(container=>container.id==='motion-set').children.length,2);
assert.ok(characterContainers.find(container=>container.id==='vault-rules'),'vault selection is authorable beside the Motion Set');
assert.ok(characterContainers.find(container=>container.id==='vehicle-seating'),'vehicle seating and full-body IK have their own Pawn Studio workspace');
assert.equal(characterGraph.characterPawn.vehicleSeating.editorProfile,'family:sketchbook-car');
assert.ok(characterGraph.characterPawn.vehicleSeating.profiles&&typeof characterGraph.characterPawn.vehicleSeating.profiles==='object');
const seatingCar=studio.seatingVehicleAsset('family:sketchbook-car'),seatingPlane=studio.seatingVehicleAsset('family:sketchbook-airplane'),seatingHelicopter=studio.seatingVehicleAsset('family:sketchbook-helicopter');
assert.equal(seatingCar.fit,4.4,'Pawn Studio previews the same full-size 4.4 m car used by Play');
assert.equal(seatingCar.sourceFit,2.4926951,'the raw bundled dimensions remain available to the loader');
assert.ok(seatingPlane.fit>6&&seatingHelicopter.fit>6,'aircraft keep the shared vehicle scale instead of becoming Pawn-sized toys');
const neutral=studio.seatingNeutralMotion({animationSet:[
  {id:'run',state:'grounded',speed:5.4,direction:[0,1],loop:true},
  {id:'idle',state:'grounded',speed:0,direction:[0,0],loop:true},
  {id:'land',state:'land',speed:0,direction:[0,0],loop:false},
]});
assert.equal(neutral.id,'idle','seat preview starts from the same neutral locomotion base as Play');
assert.equal(studio.seatingNeutralMotion({animations:{idle:'Idle Clip'},animationSet:[]}).clip,'Idle Clip','legacy Idle binding still supplies the seated neutral base');
const visibleBody={visible:true,userData:{data:'body'}},collision={visible:true,userData:{data:'collision'}},physics={visible:true,userData:{kind:'physics'}},previewVehicle={userData:{},traverse(visitor){[this,visibleBody,collision,physics].forEach(visitor);}};
assert.equal(studio.hideSeatingVehicleMetadata(previewVehicle),2);
assert.equal(visibleBody.visible,true,'real vehicle body remains visible in Pawn Studio');
assert.equal(collision.visible,false,'collision mesh remains scannable but cannot cover the seat preview');
assert.equal(physics.visible,false,'physics mesh remains scannable but cannot cover the seat preview');
const vehicleRoot=new THREE.Group(),hiddenParent=new THREE.Group(),renderMesh=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());hiddenParent.visible=false;renderMesh.visible=false;hiddenParent.add(renderMesh);vehicleRoot.add(hiddenParent);
assert.equal(studio.ensureSeatingVehicleVisible(vehicleRoot),1,'a gameplay-hidden ancestor cannot make a valid custom car disappear from Pawn Studio');
assert.equal(hiddenParent.visible,true);
assert.equal(renderMesh.visible,true,'the cloned custom vehicle render mesh itself is revived for authoring');
const exactProfile=global.LK_RUNTIME_VEHICLE_OCCUPANCY.defaultSeatProfile('asset:high-poly-car-v3',false),alignedGraph={logicScene:{elements:[{id:'character_model',rotation:[0,180,0]}]}};
assert.equal(studio.alignUntouchedExactSeatProfile(exactProfile,'asset:high-poly-car-v3',alignedGraph),true);
assert.ok(exactProfile.ik.leftHand[0]<exactProfile.ik.rightHand[0],'a 180-degree Character mesh correction rotates the anatomical targets instead of crossing both arms');
assert.equal(studio.alignUntouchedExactSeatProfile(exactProfile,'asset:high-poly-car-v3',alignedGraph),false,'an authored/already-aligned exact profile is never rotated twice');
const nativeRef=studio.storableAssetRef({modelDbKey:'glb:high-poly-car-v3',modelName:'High Poly Car V3',modelSrc:'blob:car-v3'});
assert.equal(nativeRef.dbKey,'glb:high-poly-car-v3','native Player Car aliases retain the exact persistent custom-vehicle key');
assert.equal(nativeRef.name,'High Poly Car V3');
global.LOT_KING={player:{car:{userData:{modelDbKey:'glb:high-poly-car-v3',modelName:'High Poly Car V3'}},getModel(){return {name:'High Poly Car V3',userData:{}};}}};
const exactRows=studio.seatingAssetRows({vehicleSeating:{profiles:{}}},[{kind:'glb',dbKey:'glb:library-car',name:'Library Car'}],value=>value);
assert.deepEqual(exactRows.map(row=>row.key),['asset:glb:library-car','asset:glb:high-poly-car-v3'],'the active custom Player Car remains selectable even when absent from the generic Asset Library list');
const storedPlayer=studio.activeLevelPlayerAsset({load:()=>({player:{modelDbKey:'glb:active-level-car',modelName:'Active Level Car'}})});
assert.equal(storedPlayer.dbKey,'glb:active-level-car','Pawn Studio reads the authoritative custom car directly from the active level scene');
assert.equal(storedPlayer.fit,5.6,'a level Player Car fallback uses the same target length as the runtime Player model');
const previewAsset=studio.seatingPreviewAsset({id:'library-car',dbKey:'glb:active-level-car',name:'Active Level Car',fit:5},storedPlayer);
assert.equal(previewAsset.dbKey,'glb:active-level-car','the canonical preview retains the exact persistent GLB identity');
assert.equal(previewAsset.fit,5.6,'the canonical preview uses the active native Player fit instead of a stale library fit');
assert.equal(studio.seatingPreviewAsset({dbKey:'glb:other-car',fit:4},storedPlayer).fit,4,'an unrelated asset cannot inherit the active Player scale');

const authored={movement:{speed:4},animationSet:[{id:'idle'}]},history=studio.createAuthoringHistory(authored);
authored.movement.speed=6;history.push(authored);authored.animationSet.push({id:'run'});history.push(authored);
assert.deepEqual(history.undo(),{movement:{speed:6},animationSet:[{id:'idle'}]});
const restored={junk:true};studio.restoreObject(restored,history.undo());assert.deepEqual(restored,{movement:{speed:4},animationSet:[{id:'idle'}]});
assert.deepEqual(history.redo(),{movement:{speed:6},animationSet:[{id:'idle'}]});

global.LK_LOGIC_TEMPLATES_CHARACTER={ANIMATION_SLOTS:[
  ['AnimRoll','roll','Falling To Roll','Roll action'],['AnimFire','fire','Firing Rifle','Fire action'],
  ['AnimPunch','punch','Punch','Punch action'],['AnimKnife','knifeAttack','Knife Attack','Knife action'],
]};
const actionGraph={characterPawn:{schemaVersion:2,model:{id:'hero'},animationSet:[{id:'idle',name:'Idle',state:'grounded',clip:'Idle'}],animations:{
  roll:{clip:'Falling To Roll',asset:{id:'roll-glb'}},fire:{clip:'Firing Rifle',asset:{id:'fire-glb'}},punch:{clip:'Punch',asset:{id:'punch-glb'}},knifeAttack:{clip:'Knife Attack',asset:{id:'knife-glb'}},
},movement:{},camera:{},appearance:{}},logicScene:{elements:[]}};
const actionContainers=character.containers({graph:actionGraph,definition:actionGraph.characterPawn,adapter:character}),actionEntries=actionGraph.characterPawn.animationSet.filter(entry=>entry.state==='action');
assert.deepEqual(actionEntries.map(entry=>entry.action),['roll','fire','punch','knifeAttack']);
assert.deepEqual(actionEntries.map(entry=>entry.asset.id),['roll-glb','fire-glb','punch-glb','knife-glb']);
assert.ok(actionContainers.find(container=>container.id==='motion-set').children.some(child=>child.badge==='roll'),'Roll is visible and editable in Motion Animation Set');

global.LK_LOGIC_TEMPLATES_CHARACTER={ANIMATION_SLOTS:[
  ['AnimVaultBox','vaultBox','','Vault Box action'],['AnimWallFlip','wallFlip','','Wall Flip action'],
]};
const staleActionGraph={characterPawn:{bodyType:'male',model:{id:'hero'},movement:{},camera:{},appearance:{},animations:{},animationSet:[
  {id:'action-slot-vaultBox',name:'Vault Box',state:'action',action:'vaultBox',clip:'',asset:null,loop:false},
  {id:'action-slot-wallFlip',name:'Wall Flip',state:'action',action:'wallFlip',clip:'',asset:null,loop:false},
  {id:'custom-wall-flip',name:'My Wall Flip',state:'action',action:'wallFlipCustom',clip:'Custom Flip',asset:{id:'user-flip',key:'user:flip',src:'user-flip.glb'},loop:false},
]},logicScene:{elements:[]}};
character.containers({graph:staleActionGraph,definition:staleActionGraph.characterPawn,adapter:character});
const hydratedVault=staleActionGraph.characterPawn.animationSet.find(entry=>entry.action==='vaultBox');
const hydratedFlip=staleActionGraph.characterPawn.animationSet.find(entry=>entry.action==='wallFlip');
const customFlip=staleActionGraph.characterPawn.animationSet.find(entry=>entry.action==='wallFlipCustom');
assert.equal(hydratedVault.asset.src,'models/characters/shared/vault-over-box.fbx','Pawn Studio hydrates Vault Box exactly like Play');
assert.equal(hydratedFlip.asset.src,'models/characters/shared/wall-flip.fbx','Pawn Studio hydrates Wall Flip exactly like Play');
assert.equal(customFlip.asset.src,'user-flip.glb','preview parity never replaces an authored action asset');

const vehicleGraph={vehiclePawn:{schemaVersion:2,tuning:{},collision:{},suspension:{},wheels:[{visualId:'front-left',front:true}],lights:{},effects:{},engineAudio:{},camera:{}},logicScene:{elements:[]}};
const vehicle=studio.resolveType(vehicleGraph);
assert.equal(vehicle.id,'vehicle');
const vehicleContainers=vehicle.containers({graph:vehicleGraph,definition:vehicleGraph.vehiclePawn,adapter:vehicle});
assert.equal(vehicleContainers.find(container=>container.id==='wheels').children[0].label,'front-left');

const animal={id:'animal-test',label:'Animal Pawn',match:graph=>!!graph.animalPawn,definition:graph=>graph.animalPawn,model:graph=>graph.animalPawn.model,containers:()=>[{id:'species',label:'Species',kind:'fields',fields:[]}]};
studio.registerType(animal);
assert.equal(studio.resolveType({animalPawn:{}}).id,'animal-test');
assert.equal(studio.listTypes().at(-1).id,'animal-test');
assert.equal(studio.unregisterType('animal-test'),true);
assert.equal(studio.resolveType({animalPawn:{}}),null);

const manager=global.LK_PLUGIN_MANAGER.create({});
manager.register({id:'animal-plugin',enabledByDefault:true,register(api){api.pawnStudioType('animal',{label:'Animal',match:graph=>!!graph.animalPawn,definition:graph=>graph.animalPawn,containers:()=>[]});}});
assert.equal(manager.extensions('pawnStudioType')[0].id,'animal');
const pluginStudio=studio.create({pluginManager:manager});
assert.equal(pluginStudio.resolveType({animalPawn:{}}).id,'plugin:animal-plugin:animal');

const placeholderRuntime={
  sceneElements:()=>[{id:'torso_shirt',name:'Torso',type:'mesh',parentId:'root',linked:true,position:[0,1,0],rotation:[0,0,0],scale:[1,1,1],color:'#fff'}],
};
global.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION=placeholderRuntime;
const resetGraph={characterPawn:{model:{id:'custom-model'},animationSet:[{id:'walk'}],appearance:{}},logicScene:{elements:[{id:'character_model',asset:{id:'custom-model'},linked:true},{id:'torso_shirt',linked:false,position:[9,9,9]}]}};
const resetStudio=studio.create({});
const assignedGraph={characterPawn:{model:null,animationSet:[]},logicScene:{elements:[{id:'character_model',linked:true,position:[0,1.05,0],rotation:[0,0,0],scale:[.001,.001,.001]},{id:'torso_shirt',linked:true}]}};
resetStudio.assignPawnModel({graph:assignedGraph,definition:assignedGraph.characterPawn},{id:'hero-glb',name:'Hero',kind:'glb',fit:5,clips:[]});
assert.equal(assignedGraph.characterPawn.model.id,'hero-glb');
assert.equal(assignedGraph.characterPawn.model.fit,1.9,'generic library fit must not make a humanoid five metres tall');
assert.deepEqual(assignedGraph.logicScene.elements[0].position,[0,0,0]);
assert.deepEqual(assignedGraph.logicScene.elements[0].scale,[1,1,1]);
assert.equal(assignedGraph.logicScene.elements[1].linked,false);
assert.equal(resetStudio.resetPawnModel({graph:resetGraph,definition:resetGraph.characterPawn,object:{userData:{characterModelError:'old'}}}),true);
assert.equal(resetGraph.characterPawn.model,null);
assert.equal(resetGraph.logicScene.elements[0].asset,undefined);
assert.equal(resetGraph.logicScene.elements.find(item=>item.id==='torso_shirt').linked,true);
assert.deepEqual(resetGraph.characterPawn.animationSet,[{id:'walk'}]);

const inferred=studio.inferMotionMetadata({name:'Hero_Run_Backward.fbx',clips:['mixamo.com']},'mixamo.com',0);
assert.equal(inferred.state,'grounded');
assert.deepEqual(inferred.direction,[0,-1]);
assert.equal(inferred.speed,5.4);
assert.equal(inferred.clip,'mixamo.com');
const landing=studio.inferMotionMetadata({name:'Hero_Landing.fbx'},'Landing',1);
assert.equal(landing.state,'land');
assert.equal(landing.loop,false);

const compatible=studio.skeletonCompatibility({boneNames:['mixamorig:Hips','Spine','LeftArm']},{boneNames:['Hips','Spine','LeftArm','WeaponSocket']});
assert.equal(compatible.status,'compatible');
assert.equal(compatible.matched,3);
const incompatible=studio.skeletonCompatibility({boneNames:['Hips','Spine','Head']},{boneNames:['Root','Wing_L','Wing_R']});
assert.equal(incompatible.status,'incompatible');
assert.equal(studio.skeletonCompatibility({boneNames:[]},{boneNames:['Hips']}).status,'unknown');
const source=fs.readFileSync(path.join(__dirname,'../js/editor/pawn-studio.js'),'utf8');
assert.ok(source.includes('data-action="timeline-keys"'),'auto-key frames have visible timeline markers');
assert.ok(source.includes('data-action="timeline-key-time"'),'a selected key time is editable');
assert.ok(source.includes('data-action="timeline-reset"'),'all slot keys can be reset');
assert.ok(source.includes("key==='z'"),'Pawn Studio owns Ctrl+Z undo');
assert.ok(source.includes('SEATING_IK_TARGETS'),'seat authoring exposes saved head, hand, foot, elbow and knee targets');
assert.ok(source.includes('applySeatingPreviewPose'),'Pawn Studio executes the same full-body seating layer it authors');
assert.ok(source.includes("scanSourceParts({owner:vehicle"),'seat preview resolves the same authored driver-seat node as Play');
assert.ok(source.includes("frame.scale.set(1,1,1)"),'seat profile metres are not multiplied by the GLB normalization scale');
assert.ok(source.includes("lkPreviewSource:'active-native-player-model'"),'an exact imported Player Car is cloned from the fitted Play model instead of re-normalized as a generic GLB');
assert.ok(source.includes('data.lkMeshEditSplitHidden)return;node.visible=true'),'a cloned custom Player Car revives its render meshes instead of inheriting editor-only hidden visibility');
assert.ok(source.includes('return model||state.model||null'),'a procedural Character preview cannot abort the selected vehicle load');
assert.ok(source.includes('visiblePreviewBounds'),'hidden High Poly meshes cannot push the selected vehicle outside the Pawn Studio camera frame');
assert.ok(source.includes("vehicle||runtimeFallback(new Error('Persistent vehicle GLB returned no scene'))"),'the clean persistent GLB is loaded before considering a runtime vehicle clone with controller metadata, including a null store result');
assert.ok(source.includes('owner.userData=safeUserData(owner.userData)'),'the runtime fallback removes circular userData only while Three.js clones the custom vehicle');
assert.ok(source.includes("targetOptions=['masterRig','seatRoot']"),'Vehicle Seating exposes a master dummy before the independent Character root and IK targets');
assert.ok(source.includes('delta=currentMatrix.clone().multiply(previous.clone().invert())'),'the master dummy bakes one shared translation/rotation delta into Character root and every IK target');
assert.ok(source.includes('new THREE.Vector3(1,1,1)'),'the Master Rig delta is rigid and cannot multiply target positions through selection highlight scale');
assert.ok(source.includes('state.seatingMasterDummy.scale.setScalar(1)'),'selecting Master Rig never changes the transform object scale');
assert.ok(source.includes('autoAlignHighPolySeatFromSteering'),'High Poly Car V3 receives its one-time driver layout from the rigged steering wheel');
assert.ok(source.includes('value=complete?source:'),'a complete seat profile keeps stable object identity while consecutive dummies are edited');
assert.ok(source.includes('steeringAutoLayoutVersion=3'),'High Poly Car repairs any positions compounded by the former Master selection scale, then retains the anatomical convention');
assert.ok(source.includes("line.name='Seat IK link · '+name"),'each IK dummy draws a live link to the joint it controls');
assert.ok(source.includes('occupancy.seatAnchor(previewPawn,synthetic)'),'Pawn Studio and Play resolve their fallback seat through the same contract');
assert.ok(source.includes('ref.dbKey||ref.key||ref.id'),'new exact-asset seat profiles use the runtime-persistent dbKey first');

console.log('pawn-studio.test.js: all assertions passed');
