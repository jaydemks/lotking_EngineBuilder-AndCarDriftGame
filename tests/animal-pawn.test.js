'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const THREE=require('three');

global.window=global;global.THREE=THREE;
require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/input/input-actions.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-animation-set.js');
require('../js/runtime/soccer-locomotion.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/character-pawns.js');
require('../js/runtime/animal-placeholder-locomotion.js');
require('../js/runtime/animal-pawns.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-animal.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-animal.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-validator.js');
require('../js/logic/logic-services.js');

const logicRegistry=global.LK_LOGIC_NODES_MVP.createRegistry();
function test(name,run){try{run();console.log('ok - '+name);}catch(error){console.error('not ok - '+name);throw error;}}
function makeGame(){
  const game={systems:{},state:{},world:{colliders:{box:[],circle:[]}},core:{camera:{getWorldDirection(out){return out.set(0,0,1);}}}};
  game.pawns=global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);return game;
}
function makePawn(game,species,id,position,playerId){
  const owner=global.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION.createVisual(THREE,species,{},{});owner.userData.logicInstanceId=id;owner.position.copy(position||new THREE.Vector3());
  const pawn=global.LK_RUNTIME_ANIMAL_PAWNS.createLogic(game,owner,{id,species,playerId:playerId==null?null:playerId,possessed:playerId!=null,spawn:{x:owner.position.x,y:owner.position.y,z:owner.position.z,heading:0}},{});pawn.start();return pawn;
}

test('cat dog horse and generic templates expose validated Animal Pawns',()=>{
  ['cat','dog','horse','generic'].forEach(species=>{
    const template=global.LK_LOGIC_TEMPLATES.get('logic-template-player-animal-'+species);assert.ok(template&&template.graph.animalPawn,'missing '+species);
    assert.equal(template.graph.nodes.some(node=>node.type==='event.onKeyDown'),false,'shipped Animal gameplay must not listen to raw keys');
    ['primaryAbility','voice'].forEach(action=>assert.ok(template.graph.nodes.some(node=>node.type==='event.onInputActionDown'&&node.data.action===action),'missing semantic '+action));
    assert.equal(template.graph.animalPawn.species,species);assert.ok(template.graph.logicScene.elements.some(item=>item.id==='animal_spine'));assert.equal(template.graph.animalPawn.vitals.respawnMode,'none');assert.equal(template.graph.animalPawn.vitals.respawnOnDeath,false);assert.equal(template.graph.animalPawn.vitals.deathPhysics.profile,'quadruped');assert.ok(template.graph.variables.find(item=>item.binding==='vitals.deathPhysics.mode').options.some(option=>option.value==='rigid'));
    const result=global.LK_LOGIC_VALIDATOR.validateGraph(template.graph,logicRegistry);assert.equal(result.ok,true,JSON.stringify(result.errors));
    const ai=global.LK_LOGIC_TEMPLATES.get('logic-template-ai-animal-'+species);assert.ok(ai&&ai.graph.animalPawn.behavior.enabled,'missing AI '+species);assert.equal(ai.graph.animalPawn.playerId,null);assert.equal(ai.graph.animalPawn.vitals.respawnOnDeath,false);assert.equal(ai.graph.animalPawn.vitals.deathPhysics.profile,'quadruped');const bindings=ai.graph.variables.filter(item=>item.exposed&&item.binding).map(item=>item.binding);assert.equal(new Set(bindings).size,bindings.length,'duplicate AI Animal bindings '+species);['enabled','damage','range','cooldown','force','action'].forEach(field=>assert.ok(bindings.includes('behavior.animalAttack.'+field),'missing authorable natural attack '+field+' for '+species));assert.equal(global.LK_LOGIC_VALIDATOR.validateGraph(ai.graph,logicRegistry).ok,true);
  });
  ['animal.pounce','animal.catClimb','animal.catBalance','animal.setStealth','animal.dogBarkAlert','animal.dogDig','animal.dogChase','animal.stopChase','animal.horseMount','animal.horseDismount','animal.setGait']
    .forEach(type=>assert.ok(logicRegistry.get(type),'missing '+type));
});

test('procedural quadrupeds have species proportions and animated joint controllers',()=>{
  const runtime=global.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION,cat=runtime.profile('cat'),horse=runtime.profile('horse');assert.ok(horse.standHeight>cat.standHeight*3);assert.ok(horse.bodyLength>cat.bodyLength*2);
  const visual=runtime.createVisual(THREE,'dog',{},{}),controller=runtime.createController({species:'dog'});assert.equal(controller.bind(visual),true);
  const hip=visual.getObjectByProperty('name','Front Left Hip Joint'),before=hip.rotation.x;for(let index=0;index<20;index++)controller.update({x:0,z:5,speed:5,grounded:true},1/60);assert.notEqual(hip.rotation.x,before);assert.match(controller.debugState().gait,/trot|run/);controller.dispose();
});

test('cat abilities use physical movement, collider climbing, balance and stealth state',()=>{
  const game=makeGame(),cat=makePawn(game,'cat','cat-ability',new THREE.Vector3(0,0,0),null);cat.setMoveInput({x:0,z:1,sprint:false});for(let index=0;index<30;index++)cat.step(1/60);assert.ok(cat.owner.position.z>.05);cat.reset();
  assert.equal(cat.setStealth(true,.35),true);assert.equal(cat.state.stealth,true);cat.setMoveInput({x:0,z:1});cat.step(1/60);assert.equal(cat.state.crouching,true);
  cat.setStealth(false);assert.equal(cat.pounce({speed:6,duration:.2}),true);for(let index=0;index<120;index++)cat.step(1/60);assert.ok(cat.owner.position.z>.15,'physical pounce must translate through the movement controller');assert.equal(cat.state.ability,'');
  cat.reset();game.world.colliders.box.push({enabled:true,walkable:true,x:0,y:.5,z:.5,hx:.5,hy:.5,hz:.35});assert.equal(cat.climb({maxHeight:2,reach:.5,duration:.2}),true);for(let index=0;index<20;index++)cat.step(1/60);assert.ok(cat.owner.position.y>=.99);assert.equal(cat.state.ability,'ledge-balance');for(let index=0;index<80;index++)cat.step(1/60);assert.equal(cat.state.ability,'');cat.dispose();
});

test('dog alert dig and chase are gameplay state, not clip-only labels',()=>{
  const game=makeGame(),dog=makePawn(game,'dog','dog-ability',new THREE.Vector3(0,0,0),null),target=makePawn(game,'generic','dog-target',new THREE.Vector3(4,0,0),null);
  assert.deepEqual(dog.barkAlert(6),['dog-target']);assert.equal(dog.dig(.2),true);dog.setMoveInput({x:0,z:1});for(let index=0;index<5;index++)dog.step(1/60);assert.equal(dog.state.ability,'dig');for(let index=0;index<30;index++)dog.step(1/60);assert.equal(dog.state.ability,'');
  const before=dog.owner.position.distanceTo(target.owner.position),behaviorOwner={id:'behavior-owner'};assert.equal(dog.chase(target,{stopDistance:.5,speedMultiplier:1,ownerToken:behaviorOwner,source:'actor-behavior'}),true);for(let index=0;index<30;index++)dog.step(1/60);assert.ok(dog.owner.position.distanceTo(target.owner.position)<before);assert.equal(dog.state.chaseTargetId,'dog-target');assert.equal(dog.state.chaseSource,'actor-behavior');
  assert.equal(dog.stopChase('wrong-owner',{ownerToken:{}}),false);assert.equal(dog.chaseTarget,target,'a foreign owner cannot stop the active chase');dog.chase(target,{source:'author'});assert.equal(dog.stopChase('AI-suspended',{ownerToken:behaviorOwner}),false);assert.equal(dog.chaseTarget,target,'an author command replacing AI chase remains active');assert.equal(dog.stopChase('test-cleanup'),true);dog.dispose();target.dispose();
});

test('horse seat transfers and restores a rider while gait remains authorable',()=>{
  const game=makeGame(),rider=makePawn(game,'generic','animal-rider',new THREE.Vector3(0,0,-1),1),horse=makePawn(game,'horse','rideable-horse',new THREE.Vector3(0,0,0),null);
  assert.equal(horse.setGait('trot'),'trot');assert.equal(horse.mountRider(rider),true);assert.equal(rider.sleeping,true);assert.equal(horse.playerId,1);assert.equal(horse.state.riderPawnId,'animal-rider');horse.setMoveInput({x:0,z:1});for(let index=0;index<10;index++)horse.step(1/60);assert.ok(rider.owner.position.y>horse.owner.position.y+1);
  assert.equal(horse.dismountRider(),true);assert.equal(rider.sleeping,false);assert.equal(rider.playerId,1);assert.equal(horse.state.riderPawnId,null);horse.dispose();rider.dispose();
});

test('rigged user GLB is authoritative while physics remains on the Animal Pawn',()=>{
  const game=makeGame(),owner=new THREE.Group();owner.userData.logicInstanceId='glb-animal';const holder=new THREE.Group();holder.userData.logicElementSceneId='animal_model';holder.userData.logicElementAssetKey='animal-glb';const visual=new THREE.Group();visual.userData.logicElementAssetVisual=true;const bone=new THREE.Bone();bone.name='AnimalRoot';visual.add(bone);holder.add(visual);owner.add(holder);
  const idle=new THREE.AnimationClip('Idle',1,[new THREE.QuaternionKeyframeTrack('AnimalRoot.quaternion',[0,1],[0,0,0,1,0,0,0,1])]);holder.userData.logicAnimationClips=[idle];holder.userData.logicAnimationMixer=new THREE.AnimationMixer(visual);
  const pawn=global.LK_RUNTIME_ANIMAL_PAWNS.createLogic(game,owner,{id:'glb-animal',species:'generic',playerId:null,model:{id:'animal-glb'},animationSet:[{id:'idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,clip:'Idle',loop:true}]},{});pawn.start();assert.ok(pawn.ensureLocomotion());assert.equal(pawn.locomotionKind,'model');pawn.setMoveInput({x:0,z:1});pawn.step(1/60);assert.ok(owner.position.z>0);pawn.dispose();
});

test('Animal Pawn service, asset dependencies and Pawn Studio assignment persist',()=>{
  const graph=JSON.parse(JSON.stringify(global.LK_LOGIC_TEMPLATES.get('logic-template-player-animal-dog').graph)),game=makeGame(),owner=global.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION.createVisual(THREE,'dog',{},{});owner.userData.logicInstanceId='service-dog';const service=global.LK_LOGIC_SERVICES.createPawnService(game,null,owner,graph,null);assert.equal(service.self().pawnType,'animal');service.self().dispose();
  graph.animalPawn.model={id:'dog-model',name:'Dog.glb'};graph.animalPawn.animationSet[0].asset={id:'dog-idle'};const dependencies=global.LK_LOGIC_GRAPH.collectGraphDependencies(graph);assert.ok(dependencies.some(dep=>dep.id==='dog-model'&&dep.owners.includes('animal:model')));assert.ok(dependencies.some(dep=>dep.id==='dog-idle'&&dep.owners.some(ownerName=>ownerName.startsWith('animal:motion:'))));
  let adapter=null;global.LK_EDITOR_PAWN_STUDIO={registerType(value){adapter=value;}};require('../js/editor/animal-pawn-studio.js');assert.ok(adapter&&adapter.match(graph));const fresh=JSON.parse(JSON.stringify(global.LK_LOGIC_TEMPLATES.get('logic-template-player-animal-cat').graph)),asset={id:'cat-rig',dbKey:'blob-cat',name:'Cat Rig',kind:'glb',clips:['Idle'],boneNames:['Root','Spine']};assert.equal(global.LK_EDITOR_ANIMAL_PAWN_STUDIO.assignModel(fresh,asset),true);assert.equal(fresh.animalPawn.model.dbKey,'blob-cat');assert.equal(fresh.logicScene.elements.find(item=>item.id==='animal_model').asset.id,'cat-rig');assert.ok(fresh.logicScene.elements.filter(item=>/^animal_(?!model)/.test(item.id)).every(item=>item.linked===false));assert.equal(global.LK_EDITOR_ANIMAL_PAWN_STUDIO.resetModel(fresh),true);assert.equal(fresh.animalPawn.model,null);assert.ok(fresh.logicScene.elements.some(item=>item.id==='animal_spine'&&item.linked===true));
});

test('HTML, cached editor loader and portable export keep Animal wiring in dependency order',()=>{
  const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8'),required=['js/runtime/animal-placeholder-locomotion.js','js/runtime/animal-pawns.js','js/logic/logic-templates-animal.js','js/logic/logic-nodes-animal.js'];
  ['engine_editor.html','gameplay.html','js/editor/loader.js'].forEach(file=>{const source=read(file);required.forEach(ref=>assert.ok(source.includes(ref),file+' missing '+ref));const positions=required.map(ref=>source.indexOf(ref));assert.deepEqual(positions,positions.slice().sort((a,b)=>a-b),file+' Animal dependencies out of order');assert.ok(source.indexOf('js/logic/logic-services.js')>positions[3]);assert.ok(source.indexOf('js/runtime/logic-elements-runner.js')>source.indexOf('js/logic/logic-services.js'));});
  const editor=read('engine_editor.html'),loader=read('js/editor/loader.js');assert.ok(editor.indexOf('js/editor/animal-pawn-studio.js')>editor.indexOf('js/editor/pawn-studio.js'));assert.ok(editor.indexOf('js/editor/animal-pawn-studio.js')<editor.indexOf('js/editor/logic-elements-inspector.js'));assert.ok(loader.indexOf('js/editor/animal-pawn-studio.js')>loader.indexOf('js/editor/pawn-studio.js'));
  const exporter=read('js/editor/playable-export-zip.js');assert.match(exporter,/RUNTIME_TEMPLATE\s*=\s*'gameplay\.html'/);assert.ok(exporter.includes('extractLocalRuntimeRefs(runtimeHtml)'),'portable export must package the Animal files discovered in gameplay.html');
});

console.log('Animal Pawn tests passed.');
