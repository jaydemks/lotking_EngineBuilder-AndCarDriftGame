'use strict';

// The lightweight occupancy fixtures are useful, but this regression must use
// the records the real Vehicle Pawn registry creates. In particular the native
// Player Car is identified by `id`/`kind`; its shared input adapter deliberately
// publishes `pawnType: "vehicle"`, not `pawnType: "native-player-car"`.

const assert = require('node:assert/strict');
const THREE = require('three');
const CANNON = require('cannon');

global.window = global;
global.THREE = THREE;
global.CANNON = CANNON;
global.CustomEvent = class CustomEvent {
  constructor(type, init){ this.type=type; this.detail=init&&init.detail||{}; }
};
global.dispatchEvent = () => true;
require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-towing.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/vehicle-occupancy.js');
require('../js/runtime/character-vehicle-dismount.js');
require('../js/runtime/input/input-actions.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-weapon-pose.js');
require('../js/runtime/character-abilities.js');
require('../js/runtime/physics/pawn-death-physics.js');
require('../js/runtime/character-vitals.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/character-pawns.js');
require('../js/runtime/sketchbook-pawns.js');

const OCC = global.LK_RUNTIME_VEHICLE_OCCUPANCY;
const INPUT = global.LK_RUNTIME_INPUT_ACTIONS;

function owner(){
  return {
    userData:{},
    position:{x:0, y:0, z:0},
    rotation:{y:0},
    add(){},
  };
}

const nativeOwner = owner();
const GAME = {
  player:{
    enabled:true,
    hidden:false,
    controllerIndex:null,
    car:nativeOwner,
    spawn:{x:0, z:0, heading:0},
  },
  systems:{},
};
const registry = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(GAME);

const native = registry.ensureNative();
assert.equal(native.id, 'native-player-car');
assert.equal(native.kind, 'native-adapter');
assert.equal(native.pawnType, 'vehicle', 'the real native adapter uses the shared Vehicle input type');
assert.equal(OCC.isEnterable(native), true, 'the real native Player Car must expose a driver seat');
assert.equal(typeof native.toggleTow,'function','the native Player Car receives the same tow-hitch contract as Logic vehicles');
assert.equal(native.config.towing.enabled,true,'the dynamic native hitch is enabled until the author disables it');

const logic = registry.createLogic(owner(), {
  playerId:null,
  tuning:{maxSpeed:30},
  wheels:[{}],
}, {});
assert.equal(logic.kind, 'logic-element');
assert.equal(logic.pawnType, 'vehicle');
assert.equal(OCC.isEnterable(logic), true, 'a real Logic Vehicle Pawn must expose a driver seat');
assert.equal(typeof logic.toggleTow,'function','a Logic Vehicle Pawn receives the tow-hitch contract');

assert.equal(OCC.isEnterable({
  id:'sketchbook-car-a',
  kind:'logic-element',
  pawnType:'sketchbook-car',
  enabled:true,
  owner:owner(),
  config:{},
  parts:{seats:[]},
}), true, 'a Sketchbook vehicle keeps the same shared driver-seat capability');

const inputDefaults=INPUT.defaultConfig(),vehicleSchemes=inputDefaults.contexts.vehicle.schemes;
assert.deepEqual(vehicleSchemes.keyboard.interact,['KeyF'],'Vehicle Use must exit by default on keyboard');
assert.deepEqual(vehicleSchemes.keyboard.highBeams,['KeyL'],'headlights move instead of sharing Vehicle Use');
assert.equal(vehicleSchemes.gamepad.interact.index,2,'X/Square is Vehicle Use');
assert.equal(vehicleSchemes.gamepad.highBeams.index,14,'D-pad Left remains a distinct headlight action');
assert.deepEqual(INPUT.schemeConflicts(vehicleSchemes.keyboard,'keyboard'),{},'Vehicle keyboard defaults have no action conflicts');
assert.deepEqual(INPUT.schemeConflicts(vehicleSchemes.gamepad,'gamepad'),{},'Vehicle gamepad defaults have no action conflicts');

console.log('vehicle-occupancy-runtime-shapes.test.js: all assertions passed');

// Exercise the consumer too: one ordinary Character, the three real runtime
// record shapes, and the same ownership transaction for each backend.
function runtimeGame(){
  const car = new THREE.Group();
  const physicsWorld = new CANNON.World();
  let controllerIndex = null;
  const player = {
    enabled:true, hidden:false, controllerIndex:null, car,
    spawn:{x:0, z:0, heading:0},
    collision:{hx:1.07,hy:.61,hz:2.31,radius:2.31},
    setControllerIndex(value){ controllerIndex=value; this.controllerIndex=value; },
  };
  const game = {
    player, systems:{physics:{raw:{world:physicsWorld}}}, state:{}, input:null,
    core:{camera:new THREE.PerspectiveCamera()},
    world:{colliders:{box:[], circle:[]}, characterGroundHeight:() => 0},
  };
  const pawns = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);
  return {game, pawns, player, controller:() => controllerIndex};
}
function runtimeOwner(id, x){
  const object = new THREE.Group();
  object.position.x = x || 0;
  object.userData.logicInstanceId = id;
  return object;
}
function ordinaryCharacter(fixture){
  const object=runtimeOwner('ordinary-character',1.4);
  const pawn=global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(fixture.game,object,{
    id:'ordinary-character', playerId:null,
    spawn:{x:1.4,y:0,z:0,heading:0},
  },{});
  assert.equal(pawn.possess(1,true),true);
  return pawn;
}
function assertDriverRoundTrip(fixture, character, vehicle, label,options){
  options=options||{};
  const scaleBefore=character.owner.scale.toArray();
  const characterHeadingBefore=OCC.worldHeading(character.owner);
  const viewBefore=character.firstPerson&&character.firstPerson.viewAngles?character.firstPerson.viewAngles():null;
  character.entryCooldown=0;
  character.possessCamera(true);
  assert.equal(character.enterVehicle(vehicle,'driver'),true,label+' accepts the ordinary Character');
  assert.equal(fixture.pawns.getByPlayerId(1),vehicle,label+' owns Player 1 while driven');
  assert.notEqual(fixture.game.state.runtimeVehicleCameraPawnIds&&fixture.game.state.runtimeVehicleCameraPawnIds[1],character.id,
    label+' releases the on-foot camera owner');
  assert.equal(character.inVehicle,vehicle,label+' records the seated Character');
  assert.equal(character.owner.visible,true,label+' keeps the real Character visible in the authored seat');
  assert.equal(character.state.seated,true,label+' marks the persistent seated pose');
  assert.equal(vehicle.driverPawn,character,label+' records one driver');
  const requestedExitHeading=.63;
  vehicle.owner.rotation.y=requestedExitHeading;
  vehicle.owner.updateMatrixWorld&&vehicle.owner.updateMatrixWorld(true);
  character.entryCooldown=0;
  assert.equal(character.exitVehicle(false),true,label+' exits through the same contract');
  assert.equal(fixture.pawns.getByPlayerId(1),character,label+' returns Player 1 atomically');
  assert.equal(fixture.game.state.runtimeVehicleCameraPawnIds[1],character.id,label+' restores the Character camera owner');
  assert.equal(character.inVehicle,null,label+' clears the seat relationship');
  assert.equal(character.owner.visible,true,label+' restores the on-foot presentation');
  assert.equal(character.state.seated,false,label+' releases the persistent seated pose');
  assert.equal(vehicle.driverPawn,null,label+' clears its driver');
  assert.ok(Math.abs(character.state.heading-characterHeadingBefore)<1e-6,label+' restores the last valid on-foot body heading');
  assert.ok(Math.abs(OCC.worldHeading(character.owner)-characterHeadingBefore)<1e-6,label+' cannot inherit an imported vehicle forward axis');
  assert.ok(Math.abs(character.owner.rotation.x)<1e-6&&Math.abs(character.owner.rotation.z)<1e-6,label+' removes vehicle pitch/roll from the on-foot root');
  assert.deepEqual(character.owner.scale.toArray(),scaleBefore,label+' preserves the Character root scale/pivot contract');
  if(options.airborne){
    assert.ok(character.owner.position.y>0,label+' keeps the live seat altitude instead of teleporting to terrain');
    assert.equal(character.state.airborne,true,label+' returns ownership in free fall');
  }else assert.ok(Math.abs(character.owner.position.y)<1e-6,label+' places Character feet on world ground instead of the vehicle body centre');
  if(viewBefore&&character.firstPerson&&character.firstPerson.viewAngles)assert.ok(Math.abs(character.firstPerson.viewAngles().yaw-viewBefore.yaw)<1e-6,label+' restores the independent on-foot view heading');
  const beforeWalk=character.owner.position.clone();
  const walk=character.movementController.step(character.owner,{x:0,z:1,sprint:false},.05,0);
  if(options.airborne)assert.ok(character.owner.position.y<beforeWalk.y,label+' gravity owns the first on-foot frame after an air exit');
  else assert.ok(walk.moving&&character.owner.position.distanceTo(beforeWalk)>.0001,label+' resumes ordinary on-foot movement on the very first step');
  assert.ok(Math.abs(character.owner.rotation.x)<1e-6&&Math.abs(character.owner.rotation.z)<1e-6,label+' first on-foot movement cannot restore vehicle pitch/roll');
  assert.deepEqual(character.owner.scale.toArray(),scaleBefore,label+' first on-foot movement cannot mutate the Character scale');
}

const runtime=runtimeGame();
const character=ordinaryCharacter(runtime);
const nativeRuntime=runtime.pawns.ensureNative();
assert.deepEqual(nativeRuntime.config.collision,runtime.player.collision,'the native adapter uses the exact authored Player Car collider');
assert.deepEqual(OCC.collisionFootprint(nativeRuntime),{
  center:nativeRuntime.owner.position.clone(),heading:0,hx:1.07,hy:.61,hz:2.31,
},'Character avoidance, Cannon and Pawn Studio agree on one native-car footprint');
runtime.player.collision={hx:.98,hy:.63,hz:2.4,radius:2.4};
runtime.pawns.syncNativeFromPlayer();
assert.deepEqual(nativeRuntime.config.collision,runtime.player.collision,'a project restored after adapter creation updates the live native collision');
assert.equal(OCC.collisionFootprint(nativeRuntime).hz,2.4,'the late-restored custom length reaches Character collision immediately');
assert.equal(character.enterVehicle(nativeRuntime,'passenger'),false,'ordinary Character exposes only its complete driver workflow');
assert.equal(character.inVehicle,null);
assertDriverRoundTrip(runtime,character,nativeRuntime,'native Player Car');
assertDriverRoundTrip(runtime,character,nativeRuntime,'native Player Car second consecutive cycle');

// Camera/asset presentation may transiently cull the root before entry. Exit
// must use the authored hidden flag, not replay that stale render-only value.
const visibilityRuntime=runtimeGame(),visibilityCharacter=ordinaryCharacter(visibilityRuntime),visibilityVehicle=visibilityRuntime.pawns.ensureNative();
visibilityCharacter.hidden=false;visibilityCharacter.owner.visible=false;visibilityCharacter.entryCooldown=0;
assert.equal(visibilityCharacter.enterVehicle(visibilityVehicle,'driver'),true,'transiently culled Character can still enter');
visibilityCharacter.entryCooldown=0;visibilityVehicle.entryCooldown=0;
assert.equal(visibilityCharacter.exitVehicle(false),true,'transiently culled Character exits normally');
assert.equal(visibilityCharacter.owner.visible,true,'vehicle exit restores authored Character visibility, not the stale camera cull');

// A moved vehicle must dismount in WORLD space. Complex imported scenery keeps
// a large aggregate bookkeeping box; only the shallow asphalt child is valid
// ground, otherwise the same exit is projected to the top of the whole map.
const movedRuntime=runtimeGame(),movedCharacter=ordinaryCharacter(movedRuntime),movedVehicle=movedRuntime.pawns.ensureNative();
const aggregate={x:45,y:10,z:-30,hx:80,hy:10,hz:80,enabled:true,compoundRoot:true,parts:[]};
const asphalt={x:45,y:.05,z:-30,hx:18,hy:.05,hz:18,enabled:true,compoundPart:true,parentRef:aggregate};
aggregate.parts.push(asphalt);movedRuntime.game.world.colliders.box.push(aggregate,asphalt);
movedCharacter.entryCooldown=0;
assert.equal(movedCharacter.enterVehicle(movedVehicle,'driver'),true,'moved-world fixture enters before the car travels');
movedVehicle.owner.position.set(45,0,-30);movedVehicle.owner.rotation.y=.35;movedVehicle.owner.updateMatrixWorld(true);
movedCharacter.entryCooldown=0;movedVehicle.entryCooldown=0;
assert.equal(movedCharacter.exitVehicle(false),true,'moved-world fixture exits after the car travels');
const movedFootprint=OCC.collisionFootprint(movedVehicle);
assert.ok(Math.hypot(movedCharacter.owner.position.x-movedFootprint.center.x,movedCharacter.owner.position.z-movedFootprint.center.z)<4,
  'exit is adjacent to the vehicle live world position, not its original/local position');
assert.ok(Math.abs(movedCharacter.owner.position.y-.1)<1e-6,
  'exit lands on thin asphalt and never on the compound scene root');

// Exit is driven by the possessed Vehicle mapping, not by the now-unpossessed
// seated Character. This executes the real native adapter frame and proves the
// F/X semantic edge returns ownership rather than being swallowed as lights.
let vehicleUse=false;
runtime.game.input={
  ensurePlayerSlot(){},
  player(){return {drive(){return {interact:vehicleUse};},device(){return 'keyboard-1';}};},
};
character.entryCooldown=0;
assert.equal(character.enterVehicle(nativeRuntime,'driver'),true);
character.entryCooldown=0;nativeRuntime.entryCooldown=0;nativeRuntime.start();
vehicleUse=true;nativeRuntime.step(1/60);
assert.equal(character.inVehicle,nativeRuntime,'the held entry press cannot eject the Character after cooldown');
vehicleUse=false;nativeRuntime.step(1/60);
vehicleUse=true;nativeRuntime.step(1/60);
assert.equal(character.inVehicle,null,'a released then freshly pressed Vehicle Interact exits through the native runtime frame');
assert.equal(runtime.pawns.getByPlayerId(1),character,'native exit returns the Player slot to the Character');
vehicleUse=false;nativeRuntime.step(1/60);

const logicOwner=runtimeOwner('logic-vehicle-runtime',5);
const logicRuntime=runtime.pawns.createLogic(logicOwner,{
  id:'logic-vehicle-runtime', playerId:null,
  collision:{hx:1,hy:.5,hz:2}, tuning:{maxSpeed:30}, wheels:[{}],
},{});
assertDriverRoundTrip(runtime,character,logicRuntime,'Logic Vehicle Pawn');

const sketchOwner=runtimeOwner('sketchbook-car-runtime',9);
const sketchRuntime=global.LK_RUNTIME_SKETCHBOOK_PAWNS.createLogic(runtime.game,sketchOwner,{
  type:'car', playerId:null, spawn:{x:9,y:0,z:0,heading:0},
},{});
assertDriverRoundTrip(runtime,character,sketchRuntime,'Sketchbook car');

const helicopterOwner=runtimeOwner('sketchbook-helicopter-runtime',13);helicopterOwner.position.y=4.5;helicopterOwner.rotation.set(.28,.4,-.16);helicopterOwner.updateMatrixWorld(true);
const helicopterRuntime=global.LK_RUNTIME_SKETCHBOOK_PAWNS.createLogic(runtime.game,helicopterOwner,{type:'helicopter',playerId:null,spawn:{x:13,y:4.5,z:0,heading:.4}},{});
assertDriverRoundTrip(runtime,character,helicopterRuntime,'Sketchbook helicopter with pitched body origin',{airborne:true});
character.entryCooldown=0;helicopterRuntime.entryCooldown=0;
assert.equal(character.enterVehicle(helicopterRuntime,'driver'),true,'ordinary Character re-enters a flying helicopter');
character.entryCooldown=0;helicopterRuntime.entryCooldown=0;
if(helicopterRuntime.body&&helicopterRuntime.body.velocity)helicopterRuntime.body.velocity.set(10,0,0);
assert.equal(helicopterRuntime.requestExit(),true,'physical dismount bypasses the legacy high-speed exit queue');
assert.equal(character.inVehicle,null,'the vehicle input path actually returns the Character to free fall');

// The former round-trip proved only root position, heading and movement. It had
// no skeleton, so it could stay green while cockpit IK leaked into every clip
// and made the Character look rigid after exit. Exercise that exact boundary:
// a full bone hierarchy receives the real helicopter seat solve, another layer
// touches the already-seated body, and the first on-foot animation update must
// start from the exact clean pre-entry skeleton.
const animatedModel=new THREE.Group();
animatedModel.userData.logicElementAssetKey='test-animated-character';
animatedModel.userData.logicElementAssetVisual=true;
const hips=new THREE.Bone();hips.name='mixamorigHips';hips.position.set(0,.9,0);animatedModel.add(hips);
const spine=new THREE.Bone();spine.name='mixamorigSpine2';spine.position.set(0,.45,0);hips.add(spine);
const neck=new THREE.Bone();neck.name='mixamorigNeck';neck.position.set(0,.25,0);spine.add(neck);
const head=new THREE.Bone();head.name='mixamorigHead';head.position.set(0,.2,0);neck.add(head);
['Left','Right'].forEach(side=>{
  const sign=side==='Left'?1:-1;
  const arm=new THREE.Bone();arm.name='mixamorig'+side+'Arm';arm.position.set(.18*sign,.12,0);
  const forearm=new THREE.Bone();forearm.name='mixamorig'+side+'ForeArm';forearm.position.set(.28*sign,0,0);
  const hand=new THREE.Bone();hand.name='mixamorig'+side+'Hand';hand.position.set(.24*sign,0,0);
  arm.add(forearm);forearm.add(hand);spine.add(arm);
  const thigh=new THREE.Bone();thigh.name='mixamorig'+side+'UpLeg';thigh.position.set(.12*sign,-.05,0);
  const shin=new THREE.Bone();shin.name='mixamorig'+side+'Leg';shin.position.set(0,-.43,0);
  const foot=new THREE.Bone();foot.name='mixamorig'+side+'Foot';foot.position.set(0,-.42,.08);
  thigh.add(shin);shin.add(foot);hips.add(thigh);
});
character.owner.add(animatedModel);character.owner.updateMatrixWorld(true);
const boneBaseline=new Map(),bones=[];
animatedModel.traverse(bone=>{if(!bone.isBone)return;bones.push(bone);boneBaseline.set(bone,{position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()});});
const animatedExitPose=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),.24);
const animatedArm=bones.find(bone=>bone.name==='mixamorigRightArm');
let releasedExternalPose=0,cleanSkeletonReachedMixer=false,oldControllerDisposed=0,replacementBinds=0;
const fakeLocomotion={
  isBound:()=>true,
  update(){
    if(character.inVehicle)return;
    cleanSkeletonReachedMixer=bones.every(bone=>{
      const before=boneBaseline.get(bone);
      return bone.position.distanceTo(before.position)<1e-9&&bone.quaternion.angleTo(before.quaternion)<1e-9&&bone.scale.distanceTo(before.scale)<1e-9;
    });
    animatedArm.quaternion.copy(animatedExitPose);
  },
  releaseExternalPose(){releasedExternalPose++;return true;},
  stopAction(){return true;},
  isActionPlaying(){return false;},
  dispose(){oldControllerDisposed++;},
};
character.locomotion=fakeLocomotion;character.locomotionNode=animatedModel;character.locomotionKind='model';
const previousStore=global.LK_STORE;let foreignSketchbookAnimationCalls=0;
global.LK_STORE={playLogicElementAnimation(){foreignSketchbookAnimationCalls++;return {};}};
character.entryCooldown=0;
assert.equal(character.enterVehicle(helicopterRuntime,'driver'),true,'rigged Character enters the helicopter');
helicopterRuntime.start();helicopterRuntime.step(1/60);
assert.equal(foreignSketchbookAnimationCalls,0,'Sketchbook never starts its driving/sitting mixer on an ordinary Character');
global.LK_STORE=previousStore;
assert.equal(OCC.applySeatPose(character,helicopterRuntime,character.occupyingSeat),true,'the real full-body helicopter pose reaches the test skeleton');
const seatedArm=animatedArm.quaternion.clone();
animatedArm.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.03));
assert.ok(boneBaseline.get(animatedArm).quaternion.angleTo(seatedArm)>.001,'the cockpit pose actually changes the skeleton before exit');
const previousLocomotionRuntime=global.LK_RUNTIME_CHARACTER_LOCOMOTION;
const replacementLocomotion={
  bind(node){replacementBinds++;return node===animatedModel;},
  isBound:()=>true,
  availableClips:()=>['Idle','Walk','Run'],
  update(){
    cleanSkeletonReachedMixer=bones.every(bone=>{
      const before=boneBaseline.get(bone);
      return bone.position.distanceTo(before.position)<1e-9&&bone.quaternion.angleTo(before.quaternion)<1e-9&&bone.scale.distanceTo(before.scale)<1e-9;
    });
    animatedArm.quaternion.copy(animatedExitPose);
  },
  stopAction(){return true;},isActionPlaying(){return false;},dispose(){},configure(){},
};
global.LK_RUNTIME_CHARACTER_LOCOMOTION={createController:()=>replacementLocomotion};
character.entryCooldown=0;
assert.equal(character.exitVehicle(false),true,'rigged Character exits the helicopter');
global.LK_RUNTIME_CHARACTER_LOCOMOTION=previousLocomotionRuntime;
assert.equal(releasedExternalPose,1,'locomotion post-pose caches are released exactly once at the ownership boundary');
assert.equal(replacementBinds,1,'vehicle exit rebuilds the presentation controller from the already loaded model');
assert.equal(oldControllerDisposed,1,'the contaminated controller is retired after its replacement binds');
assert.equal(character.locomotion,replacementLocomotion,'the first on-foot frame belongs to the fresh Play-equivalent controller');
assert.equal(cleanSkeletonReachedMixer,true,'the first on-foot mixer frame receives the exact pre-entry skeleton');
assert.ok(animatedArm.quaternion.angleTo(animatedExitPose)<1e-9,'the first normal animation pose replaces the cockpit pose immediately');
assert.equal(character.owner.userData.vehicleExitPoseRestore.bones,bones.length,'the full skeleton, not only the hands, was restored');

// A backend refusal is transactional: no occupied synthetic seat, displaced body,
// lost camera owner or unclaimed Player slot may leak out of the failed enter.
character.entryCooldown=0;
character.possessCamera(true);
const nativePossess=nativeRuntime.possess;
nativeRuntime.possess=()=>false;
assert.equal(character.enterVehicle(nativeRuntime,'driver'),false);
assert.equal(runtime.pawns.getByPlayerId(1),character);
assert.equal(character.inVehicle,null);
assert.equal(character.owner.visible,true);
assert.equal(runtime.game.state.runtimeVehicleCameraPawnIds[1],character.id,'failed entry restores the Character camera owner');
assert.equal(OCC.seatsOf(nativeRuntime)[0].occupiedBy,null);
nativeRuntime.possess=nativePossess;

// Ordinary world interactions keep priority over boarding. The same edge can
// open one nearby door OR enter one vehicle, never both.
let worldUses=0;
runtime.game.systems.interactions={trigger(){worldUses++;return {type:'door'};}};
character.entryCooldown=0;
character.verbs.interact=false;
character.stepWorldVerbs(.016,{interact:true});
assert.equal(worldUses,1);
assert.equal(character.inVehicle,null,'a consumed world interaction cannot also board a car');

// Dynamic vehicle collision is independent of static scene colliders and skips
// only the vehicle that currently owns this Character's seat.
const movement=character.movementController;
character.owner.position.set(nativeRuntime.owner.position.x+.1,0,nativeRuntime.owner.position.z);
movement.reset(0);
movement.step(character.owner,{x:0,z:0},.016,0);
const outsideDistance=character.owner.position.distanceTo(nativeRuntime.owner.position);
const nativeFootprint=OCC.collisionFootprint(nativeRuntime);
assert.ok(outsideDistance>=nativeFootprint.hx+movement.options().radius-.001,
  'an on-foot Character is pushed outside a live native vehicle');
character.inVehicle=nativeRuntime;
character.owner.position.copy(nativeRuntime.owner.position);
movement.step(character.owner,{x:0,z:0},.016,0);
assert.equal(character.owner.position.x,nativeRuntime.owner.position.x,
  'the currently occupied vehicle is not treated as an obstacle for its own driver');
assert.equal(character.owner.position.z,nativeRuntime.owner.position.z);
character.inVehicle=null;

// A quarter-turn swaps the OBB's long and short world axes. Approaching the
// rotated car from its side must stop at the side face, not at the former
// conservative max-radius circle (which made parking spaces unusably wide).
nativeRuntime.owner.rotation.y=Math.PI/2;
nativeRuntime.owner.updateMatrixWorld(true);
movement.reset(0);
character.owner.position.set(nativeRuntime.owner.position.x,0,nativeRuntime.owner.position.z+.1);
movement.step(character.owner,{x:0,z:0},.016,0);
const rotatedFootprint=OCC.collisionFootprint(nativeRuntime);
const sideDistance=Math.abs(character.owner.position.z-nativeRuntime.owner.position.z);
assert.ok(Math.abs(sideDistance-(rotatedFootprint.hx+movement.options().radius))<.01,
  '90-degree vehicle rotation swaps the OBB extents onto the correct world axis');
assert.ok(sideDistance<rotatedFootprint.hz+movement.options().radius-.2,
  'the narrow side is not inflated to the old max-radius footprint');

// Destruction blocks entry but does not turn the chassis into a ghost. The
// arcade Character collision must keep using the wreck's oriented footprint.
const originalDamageRuntime=nativeRuntime.damageRuntime;
nativeRuntime.damageRuntime={destroyed:()=>true};
assert.equal(OCC.isEnterable(nativeRuntime),false);
assert.equal(OCC.isCollidable(nativeRuntime),true);
nativeRuntime.owner.rotation.y=0;nativeRuntime.owner.updateMatrixWorld(true);
movement.reset(0);character.owner.position.copy(nativeRuntime.owner.position);
movement.step(character.owner,{x:0,z:0},.016,0);
assert.ok(character.owner.position.distanceTo(nativeRuntime.owner.position)>.5,'a Character is pushed outside an exploded vehicle wreck');
nativeRuntime.damageRuntime=originalDamageRuntime;

// The shared policy must reach the real Character controllers, not merely
// classify a velocity correctly in isolation. Drive a full abilities + vitals
// Pawn through survived and lethal road exits.
function impactCharacter(id){
  const object=runtimeOwner(id,26);
  const pawn=global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(runtime.game,object,{
    id,playerId:null,spawn:{x:26,y:0,z:0,heading:0},
    abilities:{enabled:true,slide:{enabled:true,rollSpeed:4.6,rollDistance:2.85,rollDuration:.62},land:{}},
    vitals:{enabled:true,maxHealth:100,maxArmor:0,armor:0,respawnMode:'none',deathPhysics:{enabled:true,mode:'auto',profile:'humanoid'}},
    entry:{dismount:{rollStartKmh:12,damageStartKmh:25,lethalKmh:80,damageAtLethal:100}},
  },{});
  assert.equal(pawn.possess(1,true),true);return pawn;
}
const impactOwner=runtimeOwner('impact-road-car',28),impactVehicle=runtime.pawns.createLogic(impactOwner,{id:'impact-road-car',playerId:null,tuning:{maxSpeed:40},wheels:[{}]},{}) ;
impactVehicle.state.speed=52.5/3.6;impactVehicle.owner.rotation.y=Math.PI/2;impactVehicle.owner.updateMatrixWorld(true);
const survivor=impactCharacter('impact-survivor');survivor.entryCooldown=0;
assert.equal(survivor.enterVehicle(impactVehicle,'driver'),true);survivor.entryCooldown=0;
assert.equal(survivor.exitVehicle(false),true);
assert.ok(Math.abs(survivor.vitals.state.health-50)<1e-6,'52.5 km/h applies the configured midpoint road damage');
assert.equal(survivor.abilities.mode(),'roll','a road-impact survivor immediately enters the authored roll');

impactVehicle.entryCooldown=0;impactVehicle.state.speed=80/3.6;
const fatal=impactCharacter('impact-fatal');fatal.entryCooldown=0;
assert.equal(fatal.enterVehicle(impactVehicle,'driver'),true);fatal.entryCooldown=0;
assert.equal(fatal.exitVehicle(false),true);
assert.equal(fatal.vitals.state.dead,true,'80 km/h is immediately lethal');
assert.equal(fatal.abilities.mode(),'none','a lethal exit never competes with death physics using a live roll');

console.log('vehicle/ordinary-character interoperability assertions passed');
