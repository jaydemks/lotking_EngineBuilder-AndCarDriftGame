'use strict';

const assert=require('node:assert/strict');
const THREE=require('three');

global.window=global;global.THREE=THREE;
require('../js/runtime/first-person-controller.js');
require('../js/runtime/combat/actor-combat.js');
require('../js/runtime/ai/actor-cover-planner.js');
require('../js/runtime/ai/actor-behavior.js');
require('../js/engine/level-template-registry.js');
global.LK_LEVEL_TEMPLATES.list().forEach(template=>global.LK_LEVEL_TEMPLATES.unregister(template.id));

const characterGraph={
  version:1,name:'Character stub',variables:[
    'ControllerPlayerId','SpawnX','SpawnY','SpawnZ','SpawnHeading','WalkSpeed','RunSpeed','SprintMultiplier','CameraDistance','CameraHeight','CameraFov',
  ].map(name=>({name,value:0,exposed:true})),nodes:[],edges:[],comments:[],logicScene:{root:{id:'root'},elements:[],components:[]},
  characterPawn:{id:'character',playerId:1,possessed:true,spawn:{x:0,y:0,z:0,heading:0},movement:{},camera:{},appearance:{}},
};
const catGraph={
  version:1,name:'Cat stub',variables:[
    'ControllerPlayerId','SpawnX','SpawnY','SpawnZ','SpawnHeading','WalkSpeed','RunSpeed','JumpHeight','CameraDistance','CameraHeight','CameraFov','FurColor','BellyColor','AccentColor','EyeColor',
  ].map(name=>({name,value:0,exposed:true})),nodes:[],edges:[],comments:[],logicScene:{root:{id:'root'},elements:[],components:[]},
  animalPawn:{id:'cat',playerId:1,possessed:true,spawn:{x:0,y:0,z:0,heading:0},movement:{},camera:{},appearance:{}},
};
const clone=value=>JSON.parse(JSON.stringify(value));
// The real FPS arena obtains this graph from logic-template-player-first-person.
// Keep the harness on that same contract: a graph-less placeholder could never be
// upgraded by Enemy Outpost and made the engine assertion fail for test-only reasons.
const fpsGraph=clone(characterGraph);
fpsGraph.name='First Person Character stub';
fpsGraph.variables.push({name:'FirstPersonPresentation',value:'arms',exposed:true,binding:'firstPerson.presentation'});
fpsGraph.characterPawn.firstPerson={
  enabled:true,view:'first',presentation:'arms',hideOwnBody:true,showLegs:false,
  thirdPerson:{autoDistance:true,collisionMode:'adaptive'},
};
global.LK_LOGIC_TEMPLATES={get(id){
  if(id==='logic-template-player-character-normal')return {graph:clone(characterGraph)};
  if(id==='logic-template-player-animal-cat')return {graph:clone(catGraph)};
  if(id==='logic-template-player-first-person')return {graph:clone(fpsGraph)};
  return null;
}};
global.LK_LOGIC_TEMPLATES_MISSION={makeMissionGraph(spec){return {version:1,name:'Mission stub',variables:[],nodes:[],edges:[],logicScene:{root:{id:'root'},elements:[],components:[]},missionSpec:clone(spec)};}};
global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE={
  GROUND_Y:0, ARENA_HALF_X:26, ARENA_MIN_Z:-74, ARENA_MAX_Z:16,
  buildScene(scene){
    const target=scene||blank(),template=global.LK_LOGIC_TEMPLATES.get('logic-template-player-first-person');
    target.added=target.added||[];
    target.added.push({id:'base_fps_player',kind:'logicElement',name:'FPS Player',graph:template&&template.graph});
    return target;
  },
  // The prop builder a level uses to extend the facility in its material
  // language. The stub records what was asked for, so the sectors the outpost
  // appends are visible to the assertions below.
  createBuilder(scene,options){
    let seq=0;
    const prefix=(options&&options.prefix)||'stub';
    const push=(prim,name,position,scale,spec,collide,opts)=>{
      scene.added.push({id:prefix+'_'+String(++seq).padStart(3,'0'),kind:'primitive',prim,name,
        collide:collide===true,props:{material:spec},t:{p:position.slice(),r:((opts&&opts.rotation)||[0,0,0]).slice(),s:scale.slice(),v:true},
        asset:{key:'primitive:'+prim,name,source:(options&&options.source)||'stub'},
        templateGroup:(opts&&opts.group)||'01 Terrain and Markings'});
    };
    return {
      scene,
      box(name,position,size,spec,collide,opts){push('box',name,position,[size[0]/2,size[1]/2,size[2]/2],spec,collide,opts);},
      plane(name,position,width,depth,spec,opts){push('plane',name,position,[width/4,1,depth/4],spec,false,opts);},
      cylinder(name,position,radius,height,spec,collide,opts){push('cylinder',name,position,[radius,height/2,radius],spec,collide,opts);},
      ring(name,position,outerRadius,spec,opts){const k=outerRadius/1.8;push('torus',name,position,[k,k,k],spec,false,opts);},
    };
  },
};

function blank(){return {version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}};}
function mission(scene){const entry=scene.added.find(item=>item&&item.graph&&item.graph.missionSpec);return entry&&entry.graph.missionSpec;}
function assertEditable(scene,id){
  assert.equal(scene.template.id,id);assert.equal(scene.template.nativeEditable,true);
  assert.ok(scene.added.length>2,id+' must create ordinary editable entries');
  assert.equal(new Set(scene.added.map(item=>item.id)).size,scene.added.length,id+' must create stable unique ids');
  assert.ok(mission(scene),id+' must include a shared Mission Director');
  assert.ok(scene.env&&scene.env.rain&&scene.env.volClouds,id+' must author runtime weather keys, not metadata only');
}

const snow=require('../js/runtime/snowboarding-level-template.js');
const jungle=require('../js/runtime/jungle-car-escape-level-template.js');
const fps=require('../js/runtime/fps-enemy-outpost-level-template.js');
const cat=require('../js/runtime/cat-neighborhood-level-template.js');

assert.deepEqual(global.LK_LEVEL_TEMPLATES.list().map(template=>template.id),[
  'fps-enemy-outpost','snowboarding-objective-run','jungle-car-escape','cat-neighborhood-adventure',
], 'all four modes self-register in deterministic order');

const snowScene=snow.buildScene(blank());
assertEditable(snowScene,'snowboarding-objective-run');
assert.equal(snowScene.player.enabled,false);
const snowboardPlayer=snowScene.added.find(item=>item.id==='snowboard_player');
assert.ok(snowboardPlayer&&snowboardPlayer.graph.characterPawn.snowboardPhysics);
assert.equal(snowScene.added.filter(item=>item.prim==='ramp').length,3);
assert.equal(mission(snowScene).objectives.filter(objective=>objective.kind==='reach').length,5);

let trickScore=0,rideCommand=null;
const rider={id:'rider-test',config:{snowboardPhysics:clone(snowboardPlayer.graph.characterPawn.snowboardPhysics)},owner:{position:{x:0,y:0,z:0},rotation:{y:0},userData:{}},state:{airborne:true},readPlayerDrive:()=>({x:1,z:0,jump:false}),setMovement(){},setMoveInput(value){rideCommand=value;}};
const rideGame={systems:{objectives:{addScore(value){trickScore+=value;}}}};
const rideSystem=snow.createSnowboardSystem(rideGame);
rideSystem.stepRider(rider,.5);rider.state.airborne=false;rideSystem.stepRider(rider,.1);
assert.ok(rideCommand&&rideCommand.z===1,'snowboard runtime must drive the downhill Character Pawn');
assert.ok(trickScore>0,'landing a trick must feed the shared score objective');

const jungleScene=jungle.buildScene(blank());
assertEditable(jungleScene,'jungle-car-escape');
assert.equal(jungleScene.player.enabled,true,'jungle keeps the native race/drift car');
assert.ok(jungleScene.added.some(item=>item.driveSurface===true));
assert.ok(jungleScene.added.every(item=>item.prim!=='dodecahedron'),'templates must only request supported primitives');

const fpsScene=fps.buildScene(blank());
assertEditable(fpsScene,'fps-enemy-outpost');
const outpostPlayer=fpsScene.added.find(item=>item.graph&&item.graph.characterPawn&&item.graph.characterPawn.playerId!==null);
assert.ok(outpostPlayer,'Enemy Outpost keeps an ordinary editable player Character');
assert.equal(outpostPlayer.graph.characterPawn.firstPerson.view,'third','Enemy Outpost starts in third person');
assert.equal(outpostPlayer.graph.characterPawn.firstPerson.presentation,'body','the eye toggle reuses the full TPS body');
assert.equal(outpostPlayer.graph.characterPawn.firstPerson.thirdPerson.collisionMode,'fixed','walls and animations cannot change its distance');
const enemies=fpsScene.added.filter(item=>item.graph&&item.graph.characterPawn&&item.graph.characterPawn.enemyAi);
// The outpost is garrisoned by three squads with different postures, not by one
// line of identical guards: a scouting perimeter watch, a defensive depot guard
// holding the tanks, and a flanking command detail with a marksman on the roof.
const squads=fps.SQUADS;
assert.equal(enemies.length,fps.squadMemberCount(),'every authored squad member is placed');
assert.equal(enemies.length,12);
assert.ok(enemies.every(item=>item.graph.characterPawn.playerId===null&&item.graph.characterPawn.vitals.team==='enemy'));
assert.ok(enemies.every(item=>item.graph.characterPawn.behavior&&item.graph.characterPawn.firstPerson.view==='third'&&item.graph.characterPawn.firstPerson.hideOwnBody===false));
const bySquad=new Map();
enemies.forEach(item=>{
  const id=item.graph.characterPawn.behavior.squadId;
  bySquad.set(id,(bySquad.get(id)||[]).concat(item));
});
assert.equal(bySquad.size,squads.length,'one squad id per authored squad');
squads.forEach(squad=>{
  const members=bySquad.get(squad.id)||[];
  assert.equal(members.length,squad.members.length,squad.id+' places all of its members');
  assert.ok(members.every(item=>item.graph.characterPawn.behavior.profile===squad.profile),squad.id+' shares one posture');
  // Roles are per SQUAD: four members, four different weapons and four palettes,
  // so a squad is readable at a glance without being a clone of its neighbour.
  assert.equal(new Set(members.map(item=>item.graph.characterPawn.firstPerson.weapon.preset)).size,members.length,squad.id+' authors independent weapon presets');
  assert.equal(new Set(members.map(item=>item.graph.characterPawn.appearance.shirtColor)).size,members.length,squad.id+' must be visually distinguishable at a glance');
  // The action area is centred on the SECTOR the squad garrisons, expressed as an
  // offset from each member's own spawn.
  members.forEach(item=>{
    const pawn=item.graph.characterPawn,offset=pawn.behavior.actionArea.offset;
    assert.ok(Math.abs((item.t.p[0]+offset.x)-squad.area.x)<.01,squad.id+' area is centred on its sector in X');
    assert.ok(Math.abs((item.t.p[2]+offset.z)-squad.area.z)<.01,squad.id+' area is centred on its sector in Z');
  });
});
const marksmen=enemies.filter(item=>item.graph.characterPawn.firstPerson.weapon.preset==='marksman');
assert.ok(marksmen.length>=1,'the garrison fields at least one marksman');
assert.ok(marksmen.every(item=>item.graph.characterPawn.behavior.tactics.attackRange>=50),'a marksman reaches further than a rifleman');
assert.ok(enemies.some(item=>item.t.p[1]>3),'someone holds the command post roof deck');
enemies.forEach(item=>{
  const pawn=item.graph.characterPawn,preset=pawn.firstPerson.weapon.preset,expected=global.LK_RUNTIME_FIRST_PERSON.weaponPreset(preset).values,effective=global.LK_RUNTIME_FIRST_PERSON.normalizeConfig(pawn.firstPerson).weapon;
  ['damage','fireRate','magazine','range','spreadHip','spreadAds','pellets'].forEach(field=>assert.equal(effective[field],expected[field],preset+' runtime '+field+' must come atomically from its preset'));
  const weaponBindings=item.graph.variables.filter(variable=>String(variable&&variable.binding||'').indexOf('firstPerson.weapon.')===0).map(variable=>variable.binding);
  assert.deepEqual(weaponBindings,['firstPerson.weapon.preset'],preset+' enemy must not replay rifle stat overrides after its preset');
  assert.equal(pawn.vitals.respawnMode,'none');assert.equal(pawn.inventory.mode,'backpack');assert.ok(pawn.loadout.some(entry=>entry.preset==='grenade'));
  assert.ok(pawn.behavior.equipment.medkits>0,preset+' carries a medkit');
  // A marksman holding a position deliberately carries no grenades; everyone else
  // does, and the flag and the count must agree either way.
  assert.equal(pawn.behavior.equipment.useGrenades,pawn.behavior.equipment.grenades>0,preset+' grenade flag and count agree');
  if(preset!=='marksman') assert.ok(pawn.behavior.equipment.grenades>0,preset+' carries grenades');
});

// The mission is phased: fight in, cripple the depot, take the intel, leave.
const spec=mission(fpsScene);
assert.ok(spec,'the outpost ships a mission director');
const objectives=spec.objectives||[];
assert.equal(spec.mode,'sequence','the objectives are a briefing, not four loose counters');
assert.deepEqual(objectives.map(item=>item.kind),['eliminate','eliminate','collect','reach','avoid']);
assert.equal(objectives[1].count,fps.FUEL_TANKS.length,'the sabotage objective counts the tanks that exist');
const tanks=fpsScene.added.filter(item=>item.damageable&&item.damageable.tag==='fuel-tank');
assert.equal(tanks.length,fps.FUEL_TANKS.length,'every fuel tank is a damageable mission target');
const intel=fpsScene.added.find(item=>item.item&&item.item.tag==='intel');
assert.ok(intel,'the intel is an ordinary tagged pickup');
const extract=objectives.find(item=>item.kind==='reach');
assert.ok(Math.abs(extract.target.position.z-fps.EXTRACT.z)<.01,'the reach objective points at the extraction pad that was built');

// The level is bigger than the arena it extends, and the playable area reaches
// the far sector or the mission would be unfinishable.
assert.ok(fpsScene.characterGround.minZ<=fps.POST_Z-30,'movement bounds reach the command post');
assert.ok(fpsScene.characterGround.maxX>=fps.OUTPOST_HALF_X-2,'movement bounds cover the wider facility');
assert.ok(fpsScene.template.extent.z>200&&fpsScene.template.extent.x>100,'three sectors, not one yard');
['14 Fuel Depot','15 Command Post'].forEach(group=>{
  assert.ok(fpsScene.added.some(item=>item.templateGroup===group),group+' is authored as its own editable group');
});
assert.ok(enemies.every(item=>item.graph.characterPawn.inventory&&item.graph.characterPawn.loadout.length&&item.graph.characterPawn.vitals.deathPhysics.profile==='humanoid'));
assert.equal(mission(fpsScene).objectives.find(objective=>objective.kind==='eliminate').count,4);

const catScene=cat.buildScene(blank());
assertEditable(catScene,'cat-neighborhood-adventure');
const catPlayer=catScene.added.find(item=>item.id==='cat_neighborhood_player');
assert.ok(catPlayer&&catPlayer.graph.animalPawn&&catPlayer.asset.key==='logic:template:logic-template-player-animal-cat');
assert.equal(catScene.template.replaceablePlayerGlb,true);
assert.equal(mission(catScene).objectives.find(objective=>objective.kind==='collect').count,2);
assert.equal(mission(catScene).objectives.filter(objective=>objective.kind==='custom').length,2);
assert.equal(catScene.added.filter(item=>item.graph&&item.graph.catAdventureTrigger&&item.graph.catAdventureTrigger.kind==='mouse').length,2);
assert.ok(catScene.added.some(item=>item.graph&&item.graph.catAdventureTrigger&&item.graph.catAdventureTrigger.kind==='dog'));
assert.ok(catScene.added.some(item=>item.graph&&item.graph.catAdventureTrigger&&item.graph.catAdventureTrigger.kind==='traffic'));

const catEvents=[];
const catGame={systems:{objectives:{notify(kind,payload){catEvents.push({kind,payload});return 1;}}}};
const catSystem=cat.createCatAdventureSystem(catGame),mouseOwner={uuid:'mouse-test',position:{x:0,y:0,z:0},rotation:{y:0},visible:true,userData:{logicGraph:{variables:[]}}};
catSystem.step(mouseOwner,{kind:'mouse',tag:'mouse',collectRadius:.75,chaseRadius:6,speed:2},{x:0,y:0,z:.2},.1);
assert.equal(mouseOwner.visible,false,'caught mouse placeholder must leave the scene');
assert.ok(catEvents.some(event=>event.kind==='collect'&&event.payload.tag==='mouse'),'mouse catch must feed the collect objective');

let command=null,directDamage=0;
const enemyOwner=new THREE.Group();enemyOwner.position.set(0,0,0);enemyOwner.userData={};
const playerOwner=new THREE.Group();playerOwner.position.set(0,0,6);playerOwner.userData={damageable:{health:100,maxHealth:100,team:'player',pawnId:'player-test'}};
const targetBody=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());targetBody.position.y=1;playerOwner.add(targetBody);
const enemy={id:'enemy-test',config:{enemyAi:{enabled:true,sightRange:30,attackRange:12,preferredRange:8,damage:7,memorySeconds:2,flankStrength:.5,patrol:[]},firstPerson:{weapon:{preset:'rifle'}},movement:{height:1.8},vitals:{team:'enemy'}},owner:enemyOwner,vitals:{state:{dead:false}},enabled:true,hidden:false,possessed:false,setMoveInput(value){command=value;}};
const player={id:'player-test',playerId:1,config:{movement:{height:1.8},vitals:{team:'player'}},owner:playerOwner,enabled:true,hidden:false,possessed:true,vitals:{state:{dead:false},applyDamage(){directDamage++;}}};
const actors=[enemy,player],scene=new THREE.Scene();scene.add(enemyOwner,playerOwner);scene.updateMatrixWorld(true);
const GAME={state:{started:true},systems:{},world:{registry:[playerOwner],colliders:{box:[]}},core:{scene},pawns:{list:()=>actors,get:id=>actors.find(item=>item.id===id)||null}};
enemy.firstPerson=global.LK_RUNTIME_FIRST_PERSON.create(GAME,enemy,{enabled:true,view:'third',hideOwnBody:false,weapon:{preset:'rifle',damage:7,spreadHip:0,spreadAds:0,fireRate:20}});
const ai=fps.createEnemyAi(GAME);ai.update(.1);
assert.ok(command&&command.z!==undefined,'enemy AI must author Character Pawn movement');
assert.ok(playerOwner.userData.damageable.health<100,'enemy AI must damage through its real independent weapon controller');
assert.equal(directDamage,0,'the compatibility AI facade must not call target vitals directly');
ai.dispose();targetBody.geometry.dispose();targetBody.material.dispose();

console.log('game-mode-level-templates.test.js: all assertions passed');
