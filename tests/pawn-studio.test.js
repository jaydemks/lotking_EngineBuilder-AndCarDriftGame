'use strict';
const assert=require('node:assert/strict');
global.window=global;
global.localStorage={getItem(){return null;},setItem(){}};
require('../js/plugins/plugin-api.js');
require('../js/plugins/plugin-manager.js');
require('../js/runtime/character-animation-set.js');
require('../js/editor/pawn-studio.js');

const studio=global.LK_EDITOR_PAWN_STUDIO;
assert.ok(studio);
assert.deepEqual(studio.listTypes().map(type=>type.id),['character','soccer','vehicle']);

const characterGraph={characterPawn:{schemaVersion:2,model:{id:'hero'},animations:{idle:'Idle',run:'Run'},movement:{},camera:{},appearance:{}},logicScene:{elements:[]}};
const character=studio.resolveType(characterGraph);
assert.equal(character.id,'character');
const characterContainers=character.containers({graph:characterGraph,definition:characterGraph.characterPawn,adapter:character});
assert.deepEqual(characterContainers.slice(0,4).map(container=>container.id),['overview','model','skeleton','collision']);
assert.equal(characterContainers.find(container=>container.id==='motion-set').children.length,2);

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

console.log('pawn-studio.test.js: all assertions passed');
