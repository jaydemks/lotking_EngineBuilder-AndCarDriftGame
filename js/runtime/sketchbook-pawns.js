/* =========================================================
   LOT KING - Sketchbook Pawn runtime family

   Adapted from swift502/Sketchbook (MIT License):
   https://github.com/swift502/Sketchbook
   Source commit: 62f4b7986fd1ce1e4f91daba89ef032c20a6ce55

   Copyright (c) 2020 swift502.
   This adapter preserves the source project's capsule/raycast character,
   RaycastVehicle car, airplane and helicopter control concepts while keeping
   LOT KING's native player car and existing Vehicle Pawn implementation
   completely separate.
   ========================================================= */
(function(root){
'use strict';

const SCHEMA_VERSION = 1;
const PHYSICS_FRAME_TIME = 1 / 60;
const MAX_FRAME_TIME = 1 / 30;
const MAX_PHYSICS_SUBSTEPS = 3;
const TYPES = Object.freeze(['advanced-character', 'car', 'airplane', 'helicopter']);
const SOURCE = Object.freeze({
  name:'Sketchbook',
  repository:'https://github.com/swift502/Sketchbook',
  commit:'62f4b7986fd1ce1e4f91daba89ef032c20a6ce55',
  license:'MIT',
  attribution:'Copyright (c) 2020 swift502',
});
const MANIFEST = Object.freeze({
  type:'pawn-runtime-family',
  id:'sketchbook-pawns',
  version:'1.0.0',
  schemaVersion:SCHEMA_VERSION,
  source:SOURCE,
  pawnTypes:TYPES.slice(),
});

let nextPawnId = 1;
const coordinators = typeof WeakMap !== 'undefined' ? new WeakMap() : new Map();
const extrasByWorld = typeof WeakMap !== 'undefined' ? new WeakMap() : new Map();
const metadataRegistries = typeof WeakMap !== 'undefined' ? new WeakMap() : new Map();

function finite(value, fallback){ value=Number(value); return Number.isFinite(value)?value:(fallback==null?0:fallback); }
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value,min))); }
function lerp(a,b,t){ return a+(b-a)*t; }
function damp(rate,dt){ return 1-Math.exp(-Math.max(0,finite(rate,0))*Math.max(0,finite(dt,0))); }
function clone(value){
  if(value==null) return value;
  try { return JSON.parse(JSON.stringify(value)); }
  catch(err){ return value; }
}
function isObject(value){ return !!value && typeof value === 'object' && !Array.isArray(value); }
function merge(base, patch){
  const output=clone(base)||{};
  Object.keys(patch||{}).forEach(key=>{
    const value=patch[key];
    if(isObject(value)&&isObject(output[key])) output[key]=merge(output[key],value);
    else output[key]=clone(value);
  });
  return output;
}
function normalizePlayerId(value){
  if(value==null||value===''||value==='none'||finite(value,0)<1) return null;
  return Math.max(1,Math.min(4,finite(value,1)|0));
}
function normalizeType(value){ value=String(value||'').toLowerCase(); return TYPES.includes(value)?value:'advanced-character'; }
function vec(source, fallback){
  const src=Array.isArray(source)?{x:source[0],y:source[1],z:source[2]}:(source||{}),fb=fallback||{};
  return {x:finite(src.x,finite(fb.x,0)),y:finite(src.y,finite(fb.y,0)),z:finite(src.z,finite(fb.z,0))};
}
function quaternion(source){
  const src=Array.isArray(source)?{x:source[0],y:source[1],z:source[2],w:source[3]}:(source||{});
  return {x:finite(src.x,0),y:finite(src.y,0),z:finite(src.z,0),w:finite(src.w,1)};
}
function syncBodyInterpolation(body){
  if(!body)return body;
  if(body.previousPosition&&body.position)body.previousPosition.copy(body.position);
  if(body.interpolatedPosition&&body.position)body.interpolatedPosition.copy(body.position);
  if(body.previousQuaternion&&body.quaternion)body.previousQuaternion.copy(body.quaternion);
  if(body.interpolatedQuaternion&&body.quaternion)body.interpolatedQuaternion.copy(body.quaternion);
  return body;
}
// cannon 0.6.2 does not interpolate between previous/current poses here: it
// extrapolates beyond the live body (`position + delta * alpha`) and never
// updates dynamic interpolatedQuaternion at all. Under a long editor frame the
// extrapolated pose can get far ahead, then snap back on the next physics step.
// That looked exactly like a second character pulling the camera to the level
// origin. The authoritative live pose is stable for both Pawns and wheels.
function renderBodyPosition(body){return body&&body.position||{x:0,y:0,z:0};}
function renderBodyQuaternion(body){return body&&body.quaternion||{x:0,y:0,z:0,w:1};}
function setDrivenBodyAwake(pawn, active){
  const body=pawn&&pawn.body;if(!body||pawn.type==='advanced-character')return false;
  if(active){
    body.allowSleep=false;
    if(body.sleepState!==0&&body.wakeUp)body.wakeUp();
  } else body.allowSleep=true;
  return true;
}
function neutralInput(){
  return {steer:0,throttle:0,brake:0,handbrake:false,wheelBrake:false,sprint:false,reset:false,highBeams:false,
    cameraLookX:0,cameraLookY:0,interact:false,gearToggle:false,device:null};
}
function emit(pawn,type,detail){
  if(!root.dispatchEvent||!root.CustomEvent) return;
  try { root.dispatchEvent(new root.CustomEvent('lk-pawn-event',{detail:Object.assign({type,pawn,pawnId:pawn&&pawn.id},detail||{})})); }
  catch(err){}
}
function setPath(rootObject,path,value){
  const keys=String(path||'').split('.').filter(Boolean); if(!keys.length) return false;
  let cursor=rootObject;
  for(let i=0;i<keys.length-1;i++){ const key=keys[i]; if(!isObject(cursor[key])) cursor[key]={}; cursor=cursor[key]; }
  cursor[keys[keys.length-1]]=clone(value); return true;
}
function rawPhysics(GAME){ return GAME&&GAME.systems&&GAME.systems.physics&&GAME.systems.physics.raw||null; }
function nativePlayerActive(GAME){
  const player=GAME&&GAME.player;
  if(!player||player.enabled===false||player.hidden===true||(player.car&&player.car.visible===false)) return false;
  const owner=GAME.pawns&&GAME.pawns.getByPlayerId?GAME.pawns.getByPlayerId(1):null;
  return !(owner&&owner.id!=='native-player-car'&&owner.possessed!==false&&owner.enabled!==false&&owner.hidden!==true);
}
function worldVector(CANNON, body, x,y,z, out){
  const target=out||new CANNON.Vec3(),local=new CANNON.Vec3(x,y,z);
  if(body&&body.quaternion&&body.quaternion.vmult) body.quaternion.vmult(local,target); else target.copy(local);
  return target;
}
function addForce(body,x,y,z){ if(!body||!body.force)return; body.force.x+=x;body.force.y+=y;body.force.z+=z; }
function addTorque(body,x,y,z){ if(!body||!body.torque)return; body.torque.x+=x;body.torque.y+=y;body.torque.z+=z; }
function ownerWorldPosition(owner){
  if(!owner) return {x:0,y:0,z:0};
  const THREE=root.THREE;
  if(THREE&&owner.getWorldPosition){ const out=new THREE.Vector3(); owner.getWorldPosition(out); return out; }
  return owner.position||{x:0,y:0,z:0};
}
function ownerWorldHeading(owner,fallback){
  const THREE=root.THREE;if(!THREE||!owner||!owner.getWorldQuaternion)return finite(fallback,0);
  const rotation=owner.getWorldQuaternion(new THREE.Quaternion()),forward=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
  return Math.atan2(forward.x,forward.z);
}
function spawnMatchesOwnerLocal(spawn,owner){
  const local=owner&&owner.position;if(!spawn||!local)return false;
  return Math.abs(finite(spawn.x)-finite(local.x))<1e-5&&Math.abs(finite(spawn.y)-finite(local.y))<1e-5&&Math.abs(finite(spawn.z)-finite(local.z))<1e-5;
}
function setOwnerWorldTransform(owner,position,rotation){
  if(!owner||!position)return false;const THREE=root.THREE;
  if(!THREE||!owner.position){if(owner.position&&owner.position.set)owner.position.set(position.x,position.y,position.z);if(rotation&&owner.quaternion&&owner.quaternion.set)owner.quaternion.set(rotation.x,rotation.y,rotation.z,rotation.w);return true;}
  const worldPosition=new THREE.Vector3(position.x,position.y,position.z),parent=owner.parent;
  if(parent){parent.updateMatrixWorld&&parent.updateMatrixWorld(true);owner.position.copy(parent.worldToLocal(worldPosition));}
  else owner.position.copy(worldPosition);
  if(rotation&&owner.quaternion){const worldRotation=new THREE.Quaternion(rotation.x,rotation.y,rotation.z,rotation.w);if(parent&&parent.getWorldQuaternion){const parentRotation=parent.getWorldQuaternion(new THREE.Quaternion()).invert();owner.quaternion.copy(parentRotation.multiply(worldRotation));}else owner.quaternion.copy(worldRotation);}
  owner.updateMatrixWorld&&owner.updateMatrixWorld(true);return true;
}

const COMMON_DEFAULTS=Object.freeze({
  schemaVersion:SCHEMA_VERSION,type:'advanced-character',id:null,enabled:true,hidden:false,possessed:true,playerId:1,
  spawn:{x:0,y:0,z:0,heading:0},
  camera:{mode:'free',distance:7.5,height:2.6,lag:7,fov:65,lookHeight:1.2,minDist:2,maxDist:18},
  collision:{mass:72,hx:.42,hy:.8,hz:.42,bodyY:0,linearDamping:.05,angularDamping:.65},
  entry:{enabled:true,radius:3,maxExitSpeed:3.5,cooldown:.65,exitOffset:1.65,allowAirExit:false,
    choreography:{enabled:true,approachSpeed:2.4,stopDistance:.18,approachTimeout:3,enterDuration:.85,exitDuration:.8},
    animations:{driverEnterLeft:'sit_down_left',driverEnterRight:'sit_down_right',passengerEnterLeft:'sit_down_left',passengerEnterRight:'sit_down_right',airplaneEnterLeft:'enter_airplane_left',airplaneEnterRight:'enter_airplane_right',driverExitLeft:'stand_up_left',driverExitRight:'stand_up_right',passengerExitLeft:'stand_up_left',passengerExitRight:'stand_up_right',driving:'driving',passenger:'sitting'}},
  worldPhysics:null,
  engineAudio:{enabled:true,volume:.28,pitch:1,setId:null},
});
const TYPE_DEFAULTS=Object.freeze({
  'advanced-character':{
    collision:{mass:1,radius:.25,height:.5,bodyY:.5,friction:0,linearDamping:.04,angularDamping:1},
    movement:{walkSpeed:3.2,runSpeed:4,sprintMultiplier:1.4,acceleration:18,airControl:.28,turnRate:12,jumpHeight:1.15,
      groundProbe:.24,groundClearance:.07,maxSlope:.72},
    animations:{idle:'idle',walk:'run',sprint:'sprint',jump:'jump_running',fall:'falling'},
    camera:{distance:7.2,height:2.45,lag:8,fov:62,lookHeight:1.25},
  },
  car:{
    collision:{mass:50,hx:.92,hy:.42,hz:1.85,bodyY:.62,friction:.01,linearDamping:.012,angularDamping:.38},
    suspension:{radius:.25,stiffness:20,restLength:.35,travel:1,frictionSlip:.8,compression:2,relaxation:2,rollInfluence:.8,maxForce:220000},
    tuning:{engineForce:500,brakeForce:14500,handbrakeForce:1000000,maxSteer:.8,steeringResponse:9.5,driftCorrection:.44,
      drive:'awd',shiftTime:.2,gears:[0,5,9,13,17,22],reverseSpeed:4,airControl:.18,maxAirSpin:2},
    wheels:[
      {x:-.92,y:-.15,z:1.34,front:true,driven:true,visualId:'wheel_front_left'},
      {x:.92,y:-.15,z:1.34,front:true,driven:true,visualId:'wheel_front_right'},
      {x:-.92,y:-.15,z:-1.34,front:false,driven:true,visualId:'wheel_rear_left'},
      {x:.92,y:-.15,z:-1.34,front:false,driven:true,visualId:'wheel_rear_right'},
    ],
    camera:{distance:9,height:3.1,lag:6,fov:70,lookHeight:1.05},
  },
  airplane:{
    collision:{mass:50,hx:1.25,hy:.48,hz:2.65,bodyY:.62,friction:.01,linearDamping:.01,angularDamping:.08},
    flight:{engineForce:9200,spoolUp:.4,spoolDown:.12,liftCoefficient:1.05,wingArea:18,dragCoefficient:.032,
      pitchTorque:3600,yawTorque:1900,rollTorque:4300,stability:.28,angularDamping:.18,maxSpeed:92,gearDown:true},
    suspension:{radius:.12,stiffness:150,restLength:.25,travel:.22,frictionSlip:1.6,compression:5,relaxation:5,rollInfluence:.12,maxForce:130000},
    wheels:[{x:-.82,y:-.34,z:-.35,front:false},{x:.82,y:-.34,z:-.35,front:false},{x:0,y:-.32,z:1.75,front:true}],
    camera:{distance:13,height:4.2,lag:4.8,fov:72,lookHeight:1},
  },
  helicopter:{
    collision:{mass:50,hx:.85,hy:.72,hz:2.15,bodyY:.9,friction:.01,linearDamping:.06,angularDamping:.18},
    flight:{spoolUp:.2,spoolDown:.06,collectiveForce:5200,hoverBias:.985,pitchTorque:3900,yawTorque:2600,rollTorque:3900,
      autoLevel:5.2,verticalDamping:1.1,horizontalDamping:.32,maxSpeed:58},
    camera:{distance:12,height:4,lag:5,fov:70,lookHeight:1.15},
  },
});

function normalizeConfig(source){
  const src=isObject(source)?source:{},type=normalizeType(src.type||src.kind);
  const cfg=merge(merge(COMMON_DEFAULTS,TYPE_DEFAULTS[type]),src);
  cfg.schemaVersion=SCHEMA_VERSION;cfg.type=type;cfg.kind=type;cfg.playerId=normalizePlayerId(cfg.playerId);
  cfg.possessed=cfg.possessed!==false&&cfg.playerId!=null;cfg.enabled=cfg.enabled!==false;cfg.hidden=cfg.hidden===true;
  cfg.spawn=Object.assign(vec(cfg.spawn),{heading:finite(cfg.spawn&&cfg.spawn.heading,0)});
  cfg.camera=merge(COMMON_DEFAULTS.camera,cfg.camera||{});cfg.collision=merge(TYPE_DEFAULTS[type].collision||{},cfg.collision||{});
  const sourceCamera=src.camera||{};
  // Adapter v1 authored the bundled character with the vehicle chase camera.
  // Camera-relative facing then fed that chase yaw back into movement, which
  // could oscillate violently during the first lateral input. Migrate only the
  // old built-in template contract; v2 still lets an author choose Arcade.
  if(type==='advanced-character'&&src.template===true&&finite(src.cameraDefaultVersion,0)<1&&String(sourceCamera.mode||'').toLowerCase()==='arcade')cfg.camera.mode='free';
  // A character's first person is the EYE. The shared camera runtime implements
  // that geometry once, as the vehicle's `interior` seat camera, so first person
  // resolves to it with the offsets a body needs instead of a driver's: no forward
  // or lateral shift, and the eye height above the Pawn origin. Offering `first`
  // without this mapping would leave a dead control that silently behaved as Free -
  // and `interior` itself is never offered on a character, because a character has
  // no driver's seat.
  if(type==='advanced-character'&&String(cfg.camera.mode||'').toLowerCase()==='first'){
    const eyeHeight=Math.max(.2,finite(sourceCamera.eyeHeight,finite(cfg.camera.lookHeight,1.6)));
    cfg.camera.mode='interior';
    cfg.camera.interiorHeight=eyeHeight;
    cfg.camera.interiorForward=0;
    cfg.camera.interiorLateral=0;
    cfg.camera.interiorLookHeight=0;
    cfg.camera.interiorFov=finite(sourceCamera.fov,cfg.camera.fov);
    // The eye must not lag behind the head, or the view swims when the body turns.
    cfg.camera.interiorLag=Math.max(14,finite(sourceCamera.lag,18));
    cfg.camera.firstPersonEye=true;
  }
  cfg.camera.arcadeDistance=finite(sourceCamera.distance,finite(sourceCamera.arcadeDistance,finite(cfg.camera.arcadeDistance,cfg.camera.distance)));
  cfg.camera.arcadeHeight=finite(sourceCamera.height,finite(sourceCamera.arcadeHeight,finite(cfg.camera.arcadeHeight,cfg.camera.height)));
  cfg.camera.arcadeLag=finite(sourceCamera.lag,finite(sourceCamera.arcadeLag,finite(cfg.camera.arcadeLag,cfg.camera.lag)));
  cfg.entry=merge(COMMON_DEFAULTS.entry,cfg.entry||{});
  cfg.engineAudio=merge(COMMON_DEFAULTS.engineAudio,cfg.engineAudio||{});
  const interaction=cfg.interaction||{};
  if(interaction.enterExitEnabled!=null)cfg.entry.enabled=interaction.enterExitEnabled!==false;
  if(interaction.radius!=null)cfg.entry.radius=Math.max(.5,finite(interaction.radius,cfg.entry.radius));
  const authored=cfg.tuning||{};
  if(type==='advanced-character'){
    const collider=authored.collider||{},movement=authored.movement||{},probe=authored.groundProbe||{},spring=authored.spring||{};
    if(Object.keys(collider).length){cfg.collision=merge(cfg.collision,collider);cfg.collision.bodyY=finite(collider.height,cfg.collision.height)*.5+finite(collider.radius,cfg.collision.radius);}
    cfg.movement=merge(cfg.movement||{},movement);
    if(movement.moveSpeed!=null){cfg.movement.walkSpeed=finite(movement.moveSpeed,4)*.8;cfg.movement.runSpeed=finite(movement.moveSpeed,4);}
    if(movement.jumpVelocity!=null)cfg.movement.jumpHeight=Math.max(.05,Math.pow(finite(movement.jumpVelocity,4),2)/(2*9.82));
    if(probe.rayLength!=null){const feet=finite(cfg.collision.height,1.08)*.5+finite(cfg.collision.radius,.32),rayLength=finite(probe.rayLength,.57);cfg.movement.groundClearance=Math.max(0,rayLength-feet);cfg.movement.groundProbe=Math.max(.02,rayLength+finite(probe.safeOffset,.03)-feet);}
    if(spring.move!=null)cfg.movement.acceleration=Math.max(1,finite(spring.move,30));
    if(spring.rotation!=null)cfg.movement.turnRate=Math.max(.5,finite(spring.rotation,30)*.4);
  } else if(type==='car'){
    const chassis=authored.chassis||{},wheels=authored.wheels||{},drive=authored.drive||{},steering=authored.steering||{},brakes=authored.brakes||{};
    if(chassis.mass!=null)cfg.collision.mass=Math.max(.01,finite(chassis.mass,cfg.collision.mass));
    cfg.suspension=merge(cfg.suspension||{},wheels);
    if(wheels.radius!=null)cfg.suspension.radius=finite(wheels.radius,cfg.suspension.radius);
    if(wheels.suspensionStiffness!=null)cfg.suspension.stiffness=finite(wheels.suspensionStiffness,cfg.suspension.stiffness);
    if(wheels.suspensionRestLength!=null)cfg.suspension.restLength=finite(wheels.suspensionRestLength,cfg.suspension.restLength);
    if(wheels.maxSuspensionTravel!=null)cfg.suspension.travel=finite(wheels.maxSuspensionTravel,cfg.suspension.travel);
    if(wheels.damping!=null){cfg.suspension.compression=finite(wheels.damping,cfg.suspension.compression);cfg.suspension.relaxation=finite(wheels.damping,cfg.suspension.relaxation);}
    if(drive.engineForce!=null)cfg.tuning.engineForce=finite(drive.engineForce,cfg.tuning.engineForce);
    if(drive.reverseSpeed!=null)cfg.tuning.reverseSpeed=finite(drive.reverseSpeed,cfg.tuning.reverseSpeed);
    if(drive.shiftTime!=null)cfg.tuning.shiftTime=Math.max(0,finite(drive.shiftTime,cfg.tuning.shiftTime));
    if(drive.drivenWheels)cfg.tuning.drive=String(drive.drivenWheels).toLowerCase();
    const gearLimits=Array.isArray(drive.gearSpeedLimits)?drive.gearSpeedLimits:(typeof drive.gearSpeedLimits==='string'?drive.gearSpeedLimits.split(','):[]);
    if(gearLimits.length)cfg.tuning.gears=[0].concat(gearLimits.map(value=>Math.max(.1,finite(value,1))));
    if(steering.maxAngle!=null)cfg.tuning.maxSteer=Math.max(.05,finite(steering.maxAngle,cfg.tuning.maxSteer));
    if(brakes.brakeForce!=null)cfg.tuning.brakeForce=Math.max(0,finite(brakes.brakeForce,cfg.tuning.brakeForce));
    if(brakes.handbrakeForce!=null)cfg.tuning.handbrakeForce=Math.max(0,finite(brakes.handbrakeForce,cfg.tuning.handbrakeForce));
  } else if(type==='airplane'){
    const body=authored.body||{},wheels=authored.wheels||{},controls=authored.controls||{},aero=authored.aero||{},engine=authored.engine||{};
    if(body.mass!=null)cfg.collision.mass=Math.max(.01,finite(body.mass,cfg.collision.mass));cfg.suspension=merge(cfg.suspension||{},wheels);
    if(wheels.radius!=null)cfg.suspension.radius=finite(wheels.radius,cfg.suspension.radius);
    if(wheels.suspensionStiffness!=null)cfg.suspension.stiffness=finite(wheels.suspensionStiffness,cfg.suspension.stiffness);
    if(wheels.suspensionRestLength!=null)cfg.suspension.restLength=finite(wheels.suspensionRestLength,cfg.suspension.restLength);
    if(wheels.damping!=null){cfg.suspension.compression=finite(wheels.damping,cfg.suspension.compression);cfg.suspension.relaxation=finite(wheels.damping,cfg.suspension.relaxation);}
    if(controls.pitchGain!=null)cfg.flight.pitchTorque=Math.max(.01,finite(controls.pitchGain,.04)*cfg.collision.mass*50);
    if(controls.yawGain!=null)cfg.flight.yawTorque=Math.max(.01,finite(controls.yawGain,.02)*cfg.collision.mass*50);
    if(controls.rollGain!=null)cfg.flight.rollTorque=Math.max(.01,finite(controls.rollGain,.055)*cfg.collision.mass*50);
    if(aero.dragCoefficient!=null)cfg.flight.dragCoefficient=Math.max(0,finite(aero.dragCoefficient,cfg.flight.dragCoefficient));
    if(aero.liftCoefficient!=null)cfg.flight.liftCoefficient=Math.max(0,finite(aero.liftCoefficient,cfg.flight.liftCoefficient));
    if(aero.maximumLift!=null)cfg.flight.maximumLift=Math.max(0,finite(aero.maximumLift,.05));
    if(engine.spoolUp!=null)cfg.flight.spoolUp=Math.max(0,finite(engine.spoolUp,cfg.flight.spoolUp));
    if(engine.spoolDown!=null)cfg.flight.spoolDown=Math.max(0,finite(engine.spoolDown,cfg.flight.spoolDown));
    if(engine.force!=null)cfg.flight.engineForce=Math.max(0,finite(engine.force,cfg.flight.engineForce));
  } else if(type==='helicopter'){
    const body=authored.body||{},flight=authored.flight||{},rotor=authored.rotor||{};
    if(body.mass!=null)cfg.collision.mass=Math.max(.01,finite(body.mass,cfg.collision.mass));
    if(flight.thrust!=null)cfg.flight.collectiveForce=Math.max(.01,finite(flight.thrust,.15)*cfg.collision.mass*62.5);
    if(flight.gravityCompensation!=null)cfg.flight.hoverBias=clamp(flight.gravityCompensation,0,1.2);
    if(flight.verticalDamping!=null)cfg.flight.verticalDamping=Math.max(0,finite(flight.verticalDamping,.01)*60);
    if(flight.horizontalDamping!=null)cfg.flight.horizontalDamping=Math.max(0,(1-clamp(flight.horizontalDamping,0,1))*60);
    if(flight.autoLevel!=null)cfg.flight.autoLevel=Math.max(0,finite(flight.autoLevel,.3)*cfg.collision.mass*10);
    if(flight.rotationGain!=null){cfg.flight.pitchTorque=cfg.flight.rollTorque=Math.max(.01,finite(flight.rotationGain,.07)*cfg.collision.mass*50);cfg.flight.yawTorque=cfg.flight.pitchTorque;}
    if(flight.angularDamping!=null)cfg.collision.angularDamping=clamp(1-finite(flight.angularDamping,.97),0,1);
    if(rotor.spoolUp!=null)cfg.flight.spoolUp=Math.max(0,finite(rotor.spoolUp,cfg.flight.spoolUp));
    if(rotor.spoolDown!=null)cfg.flight.spoolDown=Math.max(0,finite(rotor.spoolDown,cfg.flight.spoolDown));
  }
  if(type!=='advanced-character')cfg.damage=root.LK_RUNTIME_VEHICLE_DAMAGE
    ?root.LK_RUNTIME_VEHICLE_DAMAGE.normalizeConfig(cfg.damage,type)
    :merge({},cfg.damage||{});
  if(Array.isArray(cfg.wheels)) cfg.wheels=cfg.wheels.map(wheel=>merge({x:0,y:-.2,z:0,front:false,driven:false,radius:null,visualRadius:null,visualId:null},wheel||{}));
  return cfg;
}

function readInput(GAME,pawn,context){
  const out=neutralInput();
  if(context==='vehicle'&&pawn&&pawn.damageRuntime&&pawn.damageRuntime.destroyed())return out;
  if(!pawn||!pawn.possessed||pawn.playerId==null) return pawn&&pawn.control?Object.assign(out,pawn.control):out;
  let live=null;
  if(GAME&&GAME.input&&GAME.input.player){
    if(GAME.input.ensurePlayerSlot) GAME.input.ensurePlayerSlot(pawn.playerId-1);
    const view=GAME.input.player(pawn.playerId-1);live=view&&view.drive?view.drive(context):null;
    if(view&&view.device) out.device=view.device();
  } else if(pawn.services&&pawn.services.input&&pawn.services.input.playerDrive){ live=pawn.services.input.playerDrive(pawn.playerId,context); }
  Object.assign(out,live||{});if(pawn.control)Object.assign(out,pawn.control);
  return out;
}
function readInteract(GAME,pawn,primary){
  if(primary&&primary.interact===true) return true;
  if(pawn&&pawn.control&&pawn.control.interact!=null) return pawn.control.interact===true;
  if(!pawn||!pawn.possessed||pawn.playerId==null||!GAME||!GAME.input||!GAME.input.player) return false;
  const view=GAME.input.player(pawn.playerId-1),drive=view&&view.drive?view.drive('character'):null;
  return !!(drive&&drive.interact===true);
}
function keyCodes(binding,fallback){
  const aliases={shift:['ShiftLeft','ShiftRight'],space:['Space'],w:['KeyW'],a:['KeyA'],s:['KeyS'],d:['KeyD'],q:['KeyQ'],e:['KeyE'],b:['KeyB'],f:['KeyF'],g:['KeyG'],x:['KeyX'],v:['KeyV'],c:['KeyC']};
  const values=Array.isArray(binding)?binding:String(binding||fallback||'').split(/[,+|\/\s]+/).filter(Boolean),codes=[];
  values.forEach(value=>{const key=String(value).trim(),mapped=aliases[key.toLowerCase()]||[/^(?:Key|Digit|Shift|Control|Alt|Arrow|Space)/.test(key)?key:null].filter(Boolean);mapped.forEach(code=>{if(!codes.includes(code))codes.push(code);});});
  return codes;
}
function rawKeyboardDown(GAME,pawn,binding,fallback){
  const input=GAME&&GAME.input;if(!input||typeof input.liveKeyboardDown!=='function'||!pawn||pawn.possessed!==true||pawn.playerId==null)return null;
  const view=input.player&&input.player(pawn.playerId-1);if(!view||typeof view.deviceType!=='function'||view.deviceType()!=='keyboard')return null;
  const codes=keyCodes(binding,fallback);if(!codes.length)return false;return codes.some(code=>{try{return input.liveKeyboardDown(code)===true;}catch(err){return false;}});
}
function auxiliaryCharacterInput(GAME,pawn){
  if(!GAME||!GAME.input||!GAME.input.player||!pawn||pawn.possessed!==true||pawn.playerId==null)return neutralInput();
  const view=GAME.input.player(pawn.playerId-1),drive=view&&view.drive?view.drive('character'):null;return Object.assign(neutralInput(),drive||{});
}
function rawPair(GAME,pawn,binding,fallbackNegative,fallbackPositive){
  const text=String(binding||'').toLowerCase().replace(/[^a-z0-9]/g,''),negative=text.length>=2?text.charAt(0):fallbackNegative,positive=text.length>=2?text.charAt(1):fallbackPositive;
  const downNegative=rawKeyboardDown(GAME,pawn,negative,fallbackNegative),downPositive=rawKeyboardDown(GAME,pawn,positive,fallbackPositive);
  return downNegative==null||downPositive==null?null:(downPositive?1:0)-(downNegative?1:0);
}
function descriptorKey(desc,index){
  if(desc.id||desc.uuid||desc.name) return String(desc.id||desc.uuid||desc.name);
  const p=desc.position||{},s=desc.size||desc.halfExtents||{};
  return [desc.type,index,finite(p.x),finite(p.y),finite(p.z),finite(s.x),finite(s.y),finite(s.z),desc.vertices&&desc.vertices.length||0].join(':');
}
function descriptorsFromSource(source){
  const list=[];
  if(!source) return list;
  if(Array.isArray(source)) source.forEach(item=>{if(item)list.push(item);});
  else if(source.traverse){
    source.updateMatrixWorld&&source.updateMatrixWorld(true);
    source.traverse(node=>{
      const ud=node&&node.userData||{},tag=String(ud.data||ud.kind||'').toLowerCase();
      if(tag!=='physics'&&!ud.sketchbookPhysics) return;
      const options=isObject(ud.sketchbookPhysics)?ud.sketchbookPhysics:ud;
      const type=String(options.type||options.shape||'box').toLowerCase();
      const position=ownerWorldPosition(node),q=root.THREE?new root.THREE.Quaternion():{x:0,y:0,z:0,w:1},scale=root.THREE?new root.THREE.Vector3(1,1,1):{x:1,y:1,z:1};
      if(node.getWorldQuaternion&&root.THREE)node.getWorldQuaternion(q);else Object.assign(q,node.quaternion||{});
      if(node.getWorldScale&&root.THREE)node.getWorldScale(scale);else Object.assign(scale,node.scale||{});
      const desc={id:options.id||node.uuid||node.name,type,position:vec(position),quaternion:quaternion(q),friction:finite(options.friction,.3),sourceNode:node};
      if(type==='trimesh'&&node.geometry){
        const attr=node.geometry.attributes&&node.geometry.attributes.position,index=node.geometry.index;
        if(attr&&attr.array){desc.vertices=Array.from(attr.array);desc.indices=index&&index.array?Array.from(index.array):Array.from({length:attr.count},(_,i)=>i);desc.scale=vec(scale,{x:1,y:1,z:1});}
      } else desc.halfExtents=vec(options.halfExtents||options.size||scale,{x:.5,y:.5,z:.5});
      list.push(desc);
    });
  } else if(isObject(source)){
    if(source.type) list.push(source);
    ['extras','physics','boxes','trimeshes'].forEach(key=>{
      const values=source[key];if(Array.isArray(values))values.forEach(item=>{if(item)list.push(Object.assign({},item,key==='boxes'?{type:'box'}:(key==='trimeshes'?{type:'trimesh'}:{})));});
    });
  }
  return list;
}
function readOnly(value){
  if(value==null||typeof value!=='object')return value;const copy=clone(value);
  (function freezeDeep(item){if(!item||typeof item!=='object'||Object.isFrozen(item))return item;Object.keys(item).forEach(key=>freezeDeep(item[key]));return Object.freeze(item);})(copy);return copy;
}
function metadataTransform(node){
  const position=ownerWorldPosition(node),q=root.THREE&&node&&node.getWorldQuaternion?node.getWorldQuaternion(new root.THREE.Quaternion()):(node&&node.quaternion||{});
  return {position:[finite(position.x),finite(position.y),finite(position.z)],quaternion:[finite(q.x),finite(q.y),finite(q.z),finite(q.w,1)]};
}
function worldMetadataFromSource(source){
  const paths=[],scenarios=[],spawns=[];if(!source||!source.traverse)return {paths,scenarios,spawns};source.updateMatrixWorld&&source.updateMatrixWorld(true);
  const spawnByNode=new Map();
  source.traverse(node=>{
    const ud=node&&node.userData||{},tag=String(ud.data||'').toLowerCase();if(tag!=='spawn')return;
    const id=String(ud.id||node.name||node.uuid||('spawn-'+spawns.length)),record={id,name:node.name||id,type:String(ud.type||'').toLowerCase(),driver:ud.driver||null,firstNode:ud.first_node||ud.firstNode||null,metadata:clone(ud),transform:metadataTransform(node)};
    spawns.push(record);spawnByNode.set(node,id);
  });
  source.traverse(node=>{
    const ud=node&&node.userData||{},tag=String(ud.data||'').toLowerCase();
    if(tag==='path'){
      const id=String(ud.id||node.name||node.uuid||('path-'+paths.length)),nodes=[];
      node.traverse(child=>{const data=child&&child.userData||{};if(String(data.data||'').toLowerCase()!=='pathnode')return;nodes.push({id:String(data.id||child.name||child.uuid||('node-'+nodes.length)),name:child.name||'',nextNode:data.nextNode||data.next_node||null,previousNode:data.previousNode||data.previous_node||null,metadata:clone(data),transform:metadataTransform(child)});});
      paths.push({id,name:ud.name||node.name||id,metadata:clone(ud),nodes});
    } else if(tag==='scenario'){
      const id=String(ud.id||node.name||node.uuid||('scenario-'+scenarios.length)),spawnIds=[];
      node.traverse(child=>{if(spawnByNode.has(child))spawnIds.push(spawnByNode.get(child));});
      scenarios.push({id,name:ud.name||node.name||id,default:ud.default===true||ud.default==='true',spawnAlways:ud.spawn_always===true||ud.spawn_always==='true',invisible:ud.invisible===true||ud.invisible==='true',descriptionTitle:ud.desc_title||'',descriptionContent:ud.desc_content||'',cameraAngle:finite(ud.camera_angle,0),metadata:clone(ud),spawnIds});
    }
  });
  return {paths,scenarios,spawns};
}
function metadataRegistry(GAME){
  if(!GAME)return null;if(metadataRegistries.has(GAME))return metadataRegistries.get(GAME);
  const sources=new Map(),paths=new Map(),scenarios=new Map(),spawns=new Map();let nextToken=1;
  function rebuild(){paths.clear();scenarios.clear();spawns.clear();sources.forEach(record=>{record.data.paths.forEach(item=>paths.set(record.key+':'+item.id,readOnly(Object.assign({sourceKey:record.key},item))));record.data.scenarios.forEach(item=>scenarios.set(record.key+':'+item.id,readOnly(Object.assign({sourceKey:record.key},item))));record.data.spawns.forEach(item=>spawns.set(record.key+':'+item.id,readOnly(Object.assign({sourceKey:record.key},item))));});}
  function acquire(source,sourceKey){
    if(!source||!source.traverse)return Object.freeze({supported:false,sourceKey:null,paths:[],scenarios:[],spawns:[],dispose:function(){}});
    const key=String(sourceKey||source.uuid||source.name||('metadata-'+nextToken)),existing=sources.get(key);if(existing&&existing.source===source){existing.refs++;return makeHandle(existing);}
    if(existing)sources.delete(key);const record={key,source,refs:1,token:nextToken++,data:worldMetadataFromSource(source)};sources.set(key,record);rebuild();return makeHandle(record);
  }
  function makeHandle(record){let disposed=false;return Object.freeze({supported:true,sourceKey:record.key,paths:readOnly(record.data.paths),scenarios:readOnly(record.data.scenarios),spawns:readOnly(record.data.spawns),dispose:function(){if(disposed)return;disposed=true;const current=sources.get(record.key);if(!current||current.token!==record.token)return;current.refs--;if(current.refs<=0){sources.delete(record.key);rebuild();}}});}
  function byId(map,id){id=String(id||'');return map.get(id)||Array.from(map.values()).find(item=>item.id===id)||null;}
  const api=Object.freeze({
    acquire,
    getPath:id=>byId(paths,id),getScenario:id=>byId(scenarios,id),getSpawn:id=>byId(spawns,id),
    listPaths:()=>Array.from(paths.values()),listScenarios:()=>Array.from(scenarios.values()),listSpawns:()=>Array.from(spawns.values()),
    snapshot:()=>readOnly({paths:Array.from(paths.values()),scenarios:Array.from(scenarios.values()),spawns:Array.from(spawns.values())}),
    stats:()=>Object.freeze({sources:sources.size,paths:paths.size,scenarios:scenarios.size,spawns:spawns.size}),
    clear:()=>{sources.clear();rebuild();},
  });
  metadataRegistries.set(GAME,api);return api;
}
function parseWorldMetadata(GAME,source,sourceKey){const registry=metadataRegistry(GAME);return registry?registry.acquire(source,sourceKey):Object.freeze({supported:false,sourceKey:null,paths:[],scenarios:[],spawns:[],dispose:function(){}});}
function parseWorldPhysicsExtras(GAME,source){
  const raw=rawPhysics(GAME),world=raw&&raw.world,CANNON=root.CANNON;
  if(!world||!CANNON) return Object.freeze({bodies:[],dispose:function(){},supported:false});
  let records=extrasByWorld.get(world);if(!records){records=new Map();extrasByWorld.set(world,records);}
  const acquired=[];
  descriptorsFromSource(source).forEach((desc,index)=>{
    const type=String(desc.type||desc.shape||'box').toLowerCase();if(type!=='box'&&type!=='trimesh')return;
    const key=descriptorKey(desc,index);let record=records.get(key);
    if(record){record.refs++;acquired.push(record);return;}
    let shape=null;
    if(type==='box'&&CANNON.Box){
      const half=vec(desc.halfExtents||desc.size,{x:.5,y:.5,z:.5});shape=new CANNON.Box(new CANNON.Vec3(Math.max(.01,Math.abs(half.x)),Math.max(.01,Math.abs(half.y)),Math.max(.01,Math.abs(half.z))));
    } else if(type==='trimesh'&&CANNON.Trimesh){
      // `descriptorsFromSource` already produced plain number arrays. Copying
      // them again here doubled the peak memory of building a world with 124
      // trimesh colliders, for no change in value.
      const vertices=Array.isArray(desc.vertices)?desc.vertices:Array.from(desc.vertices||[]).map(Number);
      const indices=Array.isArray(desc.indices)?desc.indices:Array.from(desc.indices||[]).map(value=>Number(value)|0);
      if(vertices.length<9)return;if(!indices.length)for(let i=0;i<vertices.length/3;i++)indices.push(i);
      shape=new CANNON.Trimesh(vertices,indices);const scale=vec(desc.scale,{x:1,y:1,z:1});if(shape.setScale)shape.setScale(new CANNON.Vec3(scale.x,scale.y,scale.z));
    }
    if(!shape)return;
    const material=new CANNON.Material('sketchbook-world-'+key);material.friction=finite(desc.friction,.3);material.restitution=finite(desc.restitution,0);
    const body=new CANNON.Body({mass:Math.max(0,finite(desc.mass,0)),material});const p=vec(desc.position),q=quaternion(desc.quaternion||desc.rotation);
    body.position.set(p.x,p.y,p.z);body.quaternion.set(q.x,q.y,q.z,q.w);body.addShape(shape);body.userData={sketchbookWorldExtra:true,key,type};
    world.addBody(body);record={key,body,refs:1};records.set(key,record);acquired.push(record);
    if(desc.sourceNode&&desc.hide!==false)desc.sourceNode.visible=false;
  });
  let disposed=false;
  return Object.freeze({supported:true,bodies:acquired.map(item=>item.body),dispose:function(){
    if(disposed)return;disposed=true;acquired.forEach(record=>{record.refs--;if(record.refs<=0){try{world.removeBody(record.body);}catch(err){}records.delete(record.key);}});
  }});
}

function createCoordinator(GAME){
  if(!GAME) return null;if(coordinators.has(GAME))return coordinators.get(GAME);
  const records=[],worldExtraSources=new Map();let worldExtraScanClock=0;
  const coordinator={
    GAME,records,worldExtraSources,
    register(pawn){if(pawn&&!records.includes(pawn))records.push(pawn);return pawn;},
    unregister(pawn){const index=records.indexOf(pawn);if(index>=0)records.splice(index,1);},
    active(){return records.filter(pawn=>pawn&&!pawn.disposed&&pawn.started&&pawn.enabled!==false&&!pawn.sleeping&&pawn.physicsReady);},
    // Called on every world register/unregister and on a timer while driving, so
    // it has to be cheap when nothing has changed.
    //
    // It was not. `physics.supported` is false whenever there is NO Cannon world,
    // which is the whole time the editor is open, so the "retry a failed parse"
    // condition below was permanently true: every registration disposed the
    // world's metadata handle and re-parsed it, and re-parsing walks the entire
    // 26 MB world graph to rebuild its paths, scenarios and spawns. Streaming a
    // district in or out registers objects continuously, so the editor spent all
    // its time re-reading a model that had not changed - which is what made the
    // tab accumulate garbage and stop responding.
    //
    // A parse is now redone only when something it depends on actually changed:
    // the source object, the physics world, or an explicit `force`. A failed
    // physics parse is still retried, but only once a physics world exists for
    // it to fail against, and it no longer drags the source metadata with it.
    refreshWorldPhysicsExtras(force){
      const registry=GAME.world&&Array.isArray(GAME.world.registry)?GAME.world.registry:[],live=new Set(),physicsWorld=rawPhysics(GAME)&&rawPhysics(GAME).world||null;
      registry.forEach(object=>{
        const entry=object&&object.userData&&object.userData.addedEntry;
        if(!object||!entry||!(entry.physicsBackend==='sketchbook-metadata'||entry.metadataMode==='gltf-extras'))return;
        const key=String(entry.id||object.uuid||entry.src||'sketchbook-world'),previous=worldExtraSources.get(key);live.add(key);
        const sourceChanged=!previous||previous.source!==object;
        const worldChanged=!!previous&&previous.world!==physicsWorld;
        // Only a genuine failure: no physics world at all is "not yet", not "failed".
        const physicsFailed=!!previous&&!!physicsWorld&&previous.physics.supported!==true;
        if(!(sourceChanged||worldChanged||physicsFailed||force===true))return;
        // The metadata depends on the source alone. Keeping it across a physics
        // retry is what turns a repeated sweep into a no-op instead of a full
        // re-read of the world.
        const reuseMetadata=!!previous&&!sourceChanged&&force!==true&&previous.metadata.supported===true;
        if(previous){
          previous.physics.dispose();
          if(!reuseMetadata)previous.metadata.dispose();
        }
        worldExtraSources.set(key,{source:object,world:physicsWorld,
          physics:parseWorldPhysicsExtras(GAME,object),
          metadata:reuseMetadata?previous.metadata:parseWorldMetadata(GAME,object,key)});
      });
      Array.from(worldExtraSources.keys()).forEach(key=>{if(!live.has(key)){const handles=worldExtraSources.get(key);handles.physics.dispose();handles.metadata.dispose();worldExtraSources.delete(key);}});return worldExtraSources;
    },
    drive(pawn,dt){
      const active=this.active();if(!active.length||active[active.length-1]!==pawn)return false;
      const raw=rawPhysics(GAME),world=raw&&raw.world,h=clamp(dt,0,MAX_FRAME_TIME);
      worldExtraScanClock-=h;if(worldExtraScanClock<=0){this.refreshWorldPhysicsExtras(false);worldExtraScanClock=.75;}
      if(world&&root.CANNON&&!nativePlayerActive(GAME)){
        // Match Sketchbook's stable 60 Hz contract. The old 120 Hz adapter did
        // twice the collision work, then rendered non-interpolated poses.
        world.allowSleep=true;
        try{world.step(PHYSICS_FRAME_TIME,h,MAX_PHYSICS_SUBSTEPS);}catch(err){pawn.physicsError=String(err&&err.message||err);}
      }
      active.forEach(record=>{try{record.afterPhysics(h);}catch(err){record.physicsError=String(err&&err.message||err);}});
      return true;
    },
  };
  coordinators.set(GAME,coordinator);return coordinator;
}
function installWorldMetadataLifecycle(GAME,coordinator){
  const world=GAME&&GAME.world;if(!world||typeof world.register!=='function'||typeof world.unregister!=='function'||world.__lkSketchbookMetadataLifecycle)return false;
  const originalRegister=world.register,originalUnregister=world.unregister;let queued=false,retries=0;
  // The retry exists for a world GLB that is registered before its physics
  // backend is ready. It must NOT fire while the editor simply has no physics
  // world: that is the normal state with no game running, and treating it as a
  // failure scheduled a 100 ms sweep chain behind every single registration.
  const physicsWorldReady=()=>{const raw=GAME&&GAME.systems&&GAME.systems.physics&&GAME.systems.physics.raw;return !!(raw&&raw.world);};
  const schedule=()=>{if(queued)return;queued=true;const run=()=>{queued=false;const sources=coordinator.refreshWorldPhysicsExtras(false),unsupported=physicsWorldReady()&&Array.from(sources.values()).some(record=>record&&record.physics&&record.physics.supported!==true);if(unsupported&&retries<40){retries++;setTimeout(schedule,100);}else if(!unsupported)retries=0;};if(typeof queueMicrotask==='function')queueMicrotask(run);else Promise.resolve().then(run);};
  world.register=function(){const result=originalRegister.apply(this,arguments);schedule();return result;};
  world.unregister=function(){const result=originalUnregister.apply(this,arguments);schedule();return result;};
  try{Object.defineProperty(world,'__lkSketchbookMetadataLifecycle',{value:{originalRegister,originalUnregister,schedule},enumerable:false,configurable:false});}catch(err){world.__lkSketchbookMetadataLifecycle=true;}
  schedule();return true;
}

function findPartByName(owner,name){
  if(!owner||!name)return null;if(owner.getObjectByName){const found=owner.getObjectByName(String(name));if(found)return found;}
  let result=null;owner.traverse&&owner.traverse(node=>{if(!result&&node&&node.name===String(name))result=node;});return result;
}
function doorSwingSign(pawn){
  const value=Number(pawn&&pawn.config&&pawn.config.interaction&&pawn.config.interaction.doorSwingDirection);
  return value<0?-1:1;
}

// ------------------------------------------------ part geometry
// Every moving part below is driven from the SHAPE of its own mesh rather than
// from a fixed axis. A rotor is a thin disc, a control surface is a long plate
// and a wheel is a cylinder, so each one carries its own correct axis, and an
// imported model rigged on different axes animates correctly without a bespoke
// mapping. `userData.axis` / `userData.hingeAxis` still override everything.
const PART_AXES=Object.freeze(['x','y','z']);
/** A node's own geometry bounds, including children, in the node's LOCAL frame.
 *  THREE's Box3.setFromObject returns a WORLD box, which cannot tell one local
 *  axis from another once the node is rotated - and every part in the bundled
 *  rigs is. */
function localGeometryBox(node){
  const THREE=root.THREE;
  if(!THREE||!node||typeof node.traverse!=='function')return null;
  node.userData=node.userData||{};
  if(node.userData.sketchbookLocalBox!==undefined)return node.userData.sketchbookLocalBox;
  if(node.updateMatrixWorld)node.updateMatrixWorld(true);
  const inverse=new THREE.Matrix4().copy(node.matrixWorld).invert(),box=new THREE.Box3(),point=new THREE.Vector3(),toNode=new THREE.Matrix4();
  let found=false;
  node.traverse(child=>{
    const geometry=child&&child.geometry;
    if(!geometry)return;
    if(!geometry.boundingBox&&geometry.computeBoundingBox)geometry.computeBoundingBox();
    const source=geometry.boundingBox;
    if(!source)return;
    toNode.multiplyMatrices(inverse,child.matrixWorld);
    for(let corner=0;corner<8;corner++){
      point.set(corner&1?source.max.x:source.min.x,corner&2?source.max.y:source.min.y,corner&4?source.max.z:source.min.z).applyMatrix4(toNode);
      box.expandByPoint(point);
      found=true;
    }
  });
  node.userData.sketchbookLocalBox=found?box:null;
  return node.userData.sketchbookLocalBox;
}
/** Local extents, longest first, as [size, axisName] pairs. */
function sortedLocalExtents(node){
  const box=localGeometryBox(node);
  if(!box||!root.THREE)return null;
  const size=box.getSize(new root.THREE.Vector3());
  const pairs=[[Math.abs(finite(size.x,0)),'x'],[Math.abs(finite(size.y,0)),'y'],[Math.abs(finite(size.z,0)),'z']];
  pairs.sort((a,b)=>b[0]-a[0]);
  return pairs[0][0]>1e-6?pairs:null;
}
/** The axis a disc spins about: the one it is FLAT along. Requires a clear
 *  winner, so a roughly cubic mesh falls back to the caller's default. */
function measuredSpinAxis(node){
  const pairs=sortedLocalExtents(node);
  if(!pairs)return null;
  return pairs[2][0]<pairs[1][0]*.7?pairs[2][1]:null;
}
/** The axis a flap hinges about: its span, the LONGEST one. */
function measuredHingeAxis(node){
  const pairs=sortedLocalExtents(node);
  if(!pairs)return null;
  return pairs[0][0]>pairs[1][0]*1.25?pairs[0][1]:null;
}
function cachedAxis(node,key,measure,fallback){
  const ud=node&&node.userData;
  if(!ud)return fallback;
  const declared=String(ud.axis||ud.lkAxis||'').toLowerCase();
  if(PART_AXES.includes(declared))return declared;
  if(PART_AXES.includes(ud[key]))return ud[key];
  if(ud[key]===null)return fallback;
  const measured=measure(node);
  ud[key]=measured;
  return measured||fallback;
}
function spinAxis(node){ return cachedAxis(node,'sketchbookSpinAxis',measuredSpinAxis,'x'); }
function hingeAxis(node){ return cachedAxis(node,'sketchbookHingeAxis',measuredHingeAxis,'x'); }
/** Which wing half a control surface belongs to, so a pair deflects in opposite
 *  directions. The rig's own `side` extra is authoritative; otherwise the side
 *  of the centreline the surface sits on decides, and a centred surface keeps a
 *  single direction. */
function surfaceSideSign(owner,node){
  const ud=node&&node.userData||{};
  const declared=String(ud.side||ud.lkSide||ud.wing||'').toLowerCase();
  if(declared==='left'||declared==='l')return 1;
  if(declared==='right'||declared==='r')return -1;
  if(ud.sketchbookSideSign!=null)return ud.sketchbookSideSign;
  const x=finite(localPartTransform(owner,node).position.x,0);
  const sign=Math.abs(x)<1e-4?1:(x<0?-1:1);
  if(node&&node.userData)node.userData.sketchbookSideSign=sign;
  return sign;
}
/** A wheel is a cylinder: its two large extents are the tread diameter. Returned
 *  in the owner's local frame, the same frame the chassis mount points use. */
function wheelVisualRadius(owner,node){
  const pairs=sortedLocalExtents(node);
  if(!pairs||!root.THREE)return null;
  const scale=physicsPartTransform(owner,node).scale;
  const uniform=(Math.abs(finite(scale.x,1))+Math.abs(finite(scale.y,1))+Math.abs(finite(scale.z,1)))/3;
  const radius=pairs[1][0]*.5*(uniform>1e-6?uniform:1);
  return radius>.01?radius:null;
}
/** Which way `rotation.y` has to turn to swing a door OUT of the body.
 *
 *  A door hinges at one end and its panel extends from that hinge along local
 *  Z. Turning by `a` about Y moves a panel point at (0,0,pz) to (pz*sin a, ..).
 *  It leaves the body when that x has the sign of the door's own side of the
 *  centreline, so the sign is sign(side * panelZ) - which also gets a
 *  rear-hinged door right, because it swings the other way on the same side.
 *  The previous version used the side alone and so opened every front-hinged
 *  door inward. `doorSwingDirection` still flips the whole convention. */
function doorSwingSide(pawn,doorNode,doorPosition){
  const side=finite(doorPosition&&doorPosition.x,0)<0?-1:1;
  const box=localGeometryBox(doorNode);
  const panelZ=box&&root.THREE?finite(box.getCenter(new root.THREE.Vector3()).z,-1):-1;
  // No measurable panel: assume the usual front hinge rather than guessing.
  const hinge=panelZ<0?-1:1;
  return side*hinge*doorSwingSign(pawn);
}

// ------------------------------------------------ part discovery
// A bundled rig mounts each moving part on a helper empty that carries the SAME
// word in its name (`rotor_parent`, `aileron_parent.L`, `elevator_parent.R`).
// Those are pivots, not parts: spinning `rotor_parent` tumbles the whole
// propeller assembly on the mount's axis, and turning `aileron_parent.L` swings
// the entire wing instead of its flap. Both were happening, because the name
// match caught the mount as well as the surface.
function isPartMountName(name){
  return /(?:^|[^a-z])(?:parent|pivot|mount|anchor|holder|socket)(?:[^a-z]|$)/i.test(String(name||''));
}
function isAncestorOf(node,other){
  let cursor=other&&other.parent;
  while(cursor){ if(cursor===node)return true; cursor=cursor.parent; }
  return false;
}
/** Reduce one group of candidates to the actual parts:
 *   1. an explicit `data` tag beats a name guess, so a tagged rig keeps only
 *      its tagged nodes;
 *   2. a node that CONTAINS another candidate of the same kind is its mount;
 *   3. failing both, a name that reads as a mount is dropped. */
function resolvePartGroup(candidates){
  const tagged=candidates.filter(entry=>entry.tagged);
  let chosen=tagged.length?tagged:candidates;
  chosen=chosen.filter(entry=>!chosen.some(other=>other!==entry&&isAncestorOf(entry.node,other.node)));
  if(!tagged.length)chosen=chosen.filter(entry=>!isPartMountName(entry.name));
  return chosen.map(entry=>entry.node);
}
function scanSourceParts(pawn){
  const parts={wheels:[],rotors:[],steering:null,ailerons:[],elevators:[],rudders:[],seats:[],colliders:[]};
  if(!pawn.owner||!pawn.owner.traverse)return parts;
  const groups={wheels:[],rotors:[],ailerons:[],elevators:[],rudders:[],seats:[]};
  const add=(group,node,name,tagged)=>groups[group].push({node,name,tagged});
  pawn.owner.traverse(node=>{
    const ud=node.userData||{},tag=String(ud.data||ud.lkRigRole||ud.sketchbookPart||ud.vehiclePart||'').toLowerCase(),name=String(node.name||ud.editorName||'').toLowerCase();
    if(tag==='wheel')add('wheels',node,name,true); else if(/\bwheel\b|wheel_|ruota/.test(name))add('wheels',node,name,false);
    if(tag==='rotor'||tag==='propeller')add('rotors',node,name,true); else if(/rotor|propeller|elica/.test(name))add('rotors',node,name,false);
    if(tag==='steering_wheel'||/steering.*wheel|volante/.test(name))parts.steering=node;
    if(tag==='aileron')add('ailerons',node,name,true); else if(/aileron/.test(name))add('ailerons',node,name,false);
    if(tag==='elevator')add('elevators',node,name,true); else if(/elevator/.test(name))add('elevators',node,name,false);
    if(tag==='rudder')add('rudders',node,name,true); else if(/rudder/.test(name))add('rudders',node,name,false);
    if(tag==='seat')add('seats',node,name,true); else if(/driver.*seat/.test(name))add('seats',node,name,false);
    if(tag==='collision')parts.colliders.push(node);
  });
  Object.keys(groups).forEach(group=>{ parts[group]=resolvePartGroup(groups[group]); });
  ['wheels','rotors','ailerons','elevators','rudders'].forEach(group=>parts[group].forEach(node=>{
    node.userData=node.userData||{};if(!node.userData.sketchbookBaseRotation&&node.rotation)node.userData.sketchbookBaseRotation={x:node.rotation.x,y:node.rotation.y,z:node.rotation.z};
    partBaseQuaternion(node);
  }));
  parts.seats=parts.seats.map((node,index)=>{
    const ud=node.userData||{},name=String(node.name||('seat_'+(index+1))),connectedNames=String(ud.connected_seats||ud.connectedSeats||ud.lkConnectedSeats||'').split(';').map(value=>value.trim()).filter(Boolean),entryNames=String(ud.entry_points||ud.entryPoints||ud.lkEntryPoints||'').split(';').map(value=>value.trim()).filter(Boolean);
    const doorNode=findPartByName(pawn.owner,ud.door_object||ud.doorObject||ud.lkDoorObject),seatPosition=localPartTransform(pawn.owner,node).position,doorPosition=doorNode?localPartTransform(pawn.owner,doorNode).position:null;
    if(doorNode&&doorNode.rotation){doorNode.userData=doorNode.userData||{};if(!doorNode.userData.sketchbookBaseRotation)doorNode.userData.sketchbookBaseRotation={x:doorNode.rotation.x,y:doorNode.rotation.y,z:doorNode.rotation.z};partBaseQuaternion(doorNode);}
    return {id:name,name,type:String(ud.seat_type||ud.seatType||ud.lkSeatType||(index===0?'driver':'passenger')).toLowerCase(),node,connectedNames,connected:[],entryPoints:entryNames.map(entry=>findPartByName(pawn.owner,entry)).filter(Boolean),occupiedBy:null,reservedBy:null,
      // `side` is WHERE the door is, which names the enter/exit animation.
      // `swing` is which way it OPENS, which is a different question: a
      // front-hinged door on one side turns the opposite way to a
      // rear-hinged one on the same side. Using the placement for both is
      // what opened every door into the cabin.
      door:doorNode?{node:doorNode,side:(doorPosition&&finite(doorPosition.x,0)<0?-1:1),
        swing:doorSwingSide(pawn,doorNode,doorPosition),rotation:0,target:0,hold:0}:null};
  });
  const seatsByName=new Map(parts.seats.map(seat=>[seat.name,seat]));parts.seats.forEach(seat=>{seat.connected=seat.connectedNames.map(name=>seatsByName.get(name)).filter(Boolean);});
  return parts;
}
// ------------------------------------------------ turning a part
// A part turns about one of ITS OWN axes, which is a post-multiplication onto
// its rest pose. Writing `rotation[axis]` instead turns it about the PARENT's
// axis - `Euler` order XYZ composes as Rx*Ry*Rz, so the component written is
// applied outermost. For a part whose rest pose is not axis aligned, and every
// propeller and control surface in these rigs is rotated by 90 degrees, those
// are completely different directions: the propeller tumbled across the
// fuselage instead of spinning on its shaft, and an aileron swung around the
// fuselage instead of hinging on the wing.
const PART_ROTATION_ORDER=Object.freeze({x:0, y:1, z:2});
function partBaseQuaternion(node){
  if(!node)return {x:0,y:0,z:0,w:1};
  node.userData=node.userData||{};
  if(!node.userData.sketchbookBaseQuaternion&&node.quaternion)
    node.userData.sketchbookBaseQuaternion={x:node.quaternion.x,y:node.quaternion.y,z:node.quaternion.z,w:node.quaternion.w};
  return node.userData.sketchbookBaseQuaternion||{x:0,y:0,z:0,w:1};
}
let partAxisVector=null,partTurnQuaternion=null;
function rotatePart(node,axis,amount){
  if(!node)return;
  const THREE=root.THREE,base=partBaseQuaternion(node),turn=finite(amount,0);
  if(!THREE||!node.quaternion){
    if(node.rotation){const euler=node.userData&&node.userData.sketchbookBaseRotation||{x:0,y:0,z:0};node.rotation[axis]=finite(euler[axis],0)+turn;}
    return;
  }
  if(!partAxisVector){partAxisVector=new THREE.Vector3();partTurnQuaternion=new THREE.Quaternion();}
  const index=PART_ROTATION_ORDER[axis]==null?0:PART_ROTATION_ORDER[axis];
  partAxisVector.set(index===0?1:0,index===1?1:0,index===2?1:0);
  node.quaternion.set(base.x,base.y,base.z,base.w).multiply(partTurnQuaternion.setFromAxisAngle(partAxisVector,turn));
}
const PART_TAU=Math.PI*2;
function spinParts(parts,dt,speed){
  (parts||[]).forEach(node=>{
    if(!node||!node.quaternion&&!node.rotation)return;
    const ud=node.userData=node.userData||{};
    // The angle accumulates, so it is wrapped: a rotor left running loses float
    // precision on an ever-growing number, and the visible pose is identical.
    let spin=finite(ud.sketchbookSpin,0)+finite(speed,0)*finite(dt,0)*(ud.reverse===true?-1:1);
    if(spin>PART_TAU||spin<-PART_TAU)spin%=PART_TAU;
    ud.sketchbookSpin=spin;
    rotatePart(node,spinAxis(node),spin);
  });
}
function localPartTransform(owner,node){
  const THREE=root.THREE;
  if(!THREE||!owner||!node||!node.getWorldPosition)return {position:vec(node&&node.position),quaternion:quaternion(node&&node.quaternion),scale:vec(node&&node.scale,{x:1,y:1,z:1})};
  owner.updateMatrixWorld&&owner.updateMatrixWorld(true);node.updateMatrixWorld&&node.updateMatrixWorld(true);
  const position=node.getWorldPosition(new THREE.Vector3());owner.worldToLocal&&owner.worldToLocal(position);
  const nodeQ=node.getWorldQuaternion(new THREE.Quaternion()),ownerQ=owner.getWorldQuaternion?owner.getWorldQuaternion(new THREE.Quaternion()):new THREE.Quaternion();nodeQ.premultiply(ownerQ.invert());
  const scale=node.getWorldScale(new THREE.Vector3()),ownerScale=owner.getWorldScale?owner.getWorldScale(new THREE.Vector3(1,1,1)):new THREE.Vector3(1,1,1);scale.set(scale.x/Math.max(1e-6,ownerScale.x),scale.y/Math.max(1e-6,ownerScale.y),scale.z/Math.max(1e-6,ownerScale.z));
  return {position:vec(position),quaternion:quaternion(nodeQ),scale:vec(scale,{x:1,y:1,z:1})};
}
/** The same transform in WORLD metres, which is the only frame a Cannon body
 *  understands: bodies have no scale of their own. `localPartTransform` reports
 *  the owner's local frame, so a vehicle the author scaled in the editor grew
 *  its mesh while its collider, wheel mounts and wheel radius stayed at the
 *  authored size. Uniform scale is assumed, which is what a scaled vehicle is. */
function physicsPartTransform(owner,node){
  const transform=localPartTransform(owner,node);
  const THREE=root.THREE;
  const ownerScale=THREE&&owner&&owner.getWorldScale?owner.getWorldScale(new THREE.Vector3(1,1,1)):{x:1,y:1,z:1};
  const sx=Math.abs(finite(ownerScale.x,1))||1,sy=Math.abs(finite(ownerScale.y,1))||1,sz=Math.abs(finite(ownerScale.z,1))||1;
  if(sx===1&&sy===1&&sz===1)return transform;
  return {
    quaternion:transform.quaternion,
    position:{x:transform.position.x*sx,y:transform.position.y*sy,z:transform.position.z*sz},
    scale:{x:transform.scale.x*sx,y:transform.scale.y*sy,z:transform.scale.z*sz},
  };
}
function addCollisionShapes(CANNON,body,owner,parts,cfg){
  let count=0;(parts.colliders||[]).forEach(node=>{
    const ud=node.userData||{},shapeType=String(ud.shape||'box').toLowerCase(),transform=physicsPartTransform(owner,node),scale=transform.scale,position=transform.position,q=transform.quaternion;let shape=null;
    if(shapeType==='sphere'&&CANNON.Sphere)shape=new CANNON.Sphere(Math.max(.05,Math.abs(finite(scale.x,.5))));
    else if(CANNON.Box)shape=new CANNON.Box(new CANNON.Vec3(Math.max(.05,Math.abs(finite(scale.x,.5))),Math.max(.05,Math.abs(finite(scale.y,.5))),Math.max(.05,Math.abs(finite(scale.z,.5)))));
    if(shape){body.addShape(shape,new CANNON.Vec3(finite(position.x),finite(position.y),finite(position.z)),new CANNON.Quaternion(q.x,q.y,q.z,q.w));node.visible=false;count++;}
  });
  if(!count&&CANNON.Box)body.addShape(new CANNON.Box(new CANNON.Vec3(Math.max(.1,finite(cfg.hx,.5)),Math.max(.1,finite(cfg.hy,.5)),Math.max(.1,finite(cfg.hz,.5)))));
  return count;
}

function vehiclePhysicsOriginY(pawn,collision){
  // Logic Element GLBs are normalized and bottom-aligned by scene-store before
  // their source collision helpers are scanned. Those helper offsets therefore
  // already share the editor owner's origin. Applying the fallback bodyY again
  // lowers the rendered chassis while RaycastVehicle keeps the wheels in world
  // space, which visually separates the two and buries the chassis in terrain.
  // Primitive/fallback pawns have no metadata shapes and still need bodyY.
  const metadata=(pawn.parts&&pawn.parts.colliders||[]).length>0;
  return metadata?0:finite(collision&&collision.bodyY,0);
}

function makeBody(pawn){
  const CANNON=root.CANNON,raw=rawPhysics(pawn.GAME),world=raw&&raw.world;if(!CANNON||!world)return false;
  const cfg=pawn.config,collision=cfg.collision||{},material=new CANNON.Material('sketchbook-'+pawn.type+'-'+pawn.id);material.friction=finite(collision.friction,.18);
  const body=new CANNON.Body({mass:Math.max(.01,finite(collision.mass,50)),material,linearDamping:clamp(collision.linearDamping,0,1),angularDamping:clamp(collision.angularDamping,0,1)});
  const spawn=cfg.spawn,originY=vehiclePhysicsOriginY(pawn,collision);pawn.physicsOriginY=originY;
  body.position.set(spawn.x,spawn.y+originY,spawn.z);body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),spawn.heading);syncBodyInterpolation(body);
  // Sketchbook keeps the character capsule permanently awake: locomotion is
  // driven by velocity/spring updates and a sleeping Cannon body would still
  // animate from input while remaining frozen in world space. Parked vehicles
  // may sleep, which preserves the performance win in open-world scenes.
  body.allowSleep=pawn.type!=='advanced-character';body.logicObject=pawn.owner;body.userData={sketchbookPawn:true,pawnId:pawn.id,type:pawn.type};
  pawn.body=body;pawn.world=world;
  if(pawn.type==='helicopter'&&body.addEventListener)body.addEventListener('collide',event=>{
    if(!isStaticHelicopterSupport(body,event&&event.contact))return;
    // Keep the most recent skid/support contact for the next flight-controller
    // tick. Cannon reports the collision after beforePhysics(), so relying only
    // on world.contacts made the landing controller alternate between one frame
    // grounded and one frame airborne on thin/imported asphalt.
    pawn.helicopterSupportContact=true;
    if(!pawn.possessed&&!pawn.driverPawn&&!pawn.control&&pawn.enginePower<=.001)pawn.parkedSupportContact=true;
  });
  if(pawn.type==='advanced-character'){
    const radius=Math.max(.08,finite(collision.radius,.32)),height=Math.max(0,finite(collision.height,1.08)),sphere=new CANNON.Sphere(radius);
    body.addShape(sphere,new CANNON.Vec3(0,0,0));body.addShape(sphere,new CANNON.Vec3(0,height*.5,0));body.addShape(sphere,new CANNON.Vec3(0,-height*.5,0));
    body.fixedRotation=true;body.postStep=function(){characterGroundPostStep(pawn);};if(body.updateMassProperties)body.updateMassProperties();world.addBody(body);pawn.bodyInWorld=true;
    pawn.rayResult=CANNON.RaycastResult?new CANNON.RaycastResult():null;
  } else {
    addCollisionShapes(CANNON,body,pawn.owner,pawn.parts,collision);
    if(pawn.type==='car'||pawn.type==='airplane'){
      const suspension=cfg.suspension||{},vehicle=new CANNON.RaycastVehicle({chassisBody:body,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
      if(pawn.parts.wheels.length){
        cfg.wheels=pawn.parts.wheels.map((node,index)=>{
          const p=physicsPartTransform(pawn.owner,node).position,authored=cfg.wheels&&cfg.wheels[index]||{},ud=node.userData||{},steering=ud.steering!=null?ud.steering:ud.lkSteering,hasSteering=steering!=null,front=hasSteering?(steering===true||steering==='true'):p.z>0;
          // `visualRadius` is measured, never authored, so it tracks the model
          // scale. `suspension.radius` is in metres and cannot: a vehicle scaled
          // to read correctly beside a character would otherwise keep raycast
          // wheels of the original size and sit sunk into or floating over the
          // road. An explicit `radius` on the wheel still wins over both.
          return merge(authored,{x:p.x,y:p.y+.2,z:p.z,front,driveAxle:String(ud.drive||ud.lkDrive||'').toLowerCase()||null,driven:authored.driven===true,
            visualRadius:wheelVisualRadius(pawn.owner,node),visualId:authored.visualId||node.name||null});
        });
      }
      (cfg.wheels||[]).forEach((wheel,index)=>{
        // `radius:null` means "inherit the measured or source radius". finite()
        // intentionally accepts numeric zero, so it cannot distinguish null
        // here and previously collapsed every bundled wheel to the .05 clamp.
        const inherited=wheel.visualRadius==null?suspension.radius:wheel.visualRadius;
        const radiusSource=wheel.radius==null?inherited:wheel.radius,radius=Math.max(.05,finite(radiusSource,.3));
        vehicle.addWheel({radius,isFrontWheel:wheel.front===true,directionLocal:new CANNON.Vec3(0,-1,0),axleLocal:new CANNON.Vec3(-1,0,0),
          suspensionStiffness:finite(suspension.stiffness,30),suspensionRestLength:finite(suspension.restLength,.3),maxSuspensionTravel:finite(suspension.travel,.3),
          maxSuspensionForce:finite(suspension.maxForce,180000),dampingCompression:finite(suspension.compression,4),dampingRelaxation:finite(suspension.relaxation,3),
          frictionSlip:finite(suspension.frictionSlip,2),rollInfluence:finite(suspension.rollInfluence,.2),
          chassisConnectionPointLocal:new CANNON.Vec3(finite(wheel.x),finite(wheel.y,-.2),finite(wheel.z)),customSlidingRotationalSpeed:-30,useCustomSlidingRotationalSpeed:true});
      });
      vehicle.addToWorld(world);pawn.vehicle=vehicle;pawn.bodyInWorld=true;
    } else {world.addBody(body);pawn.bodyInWorld=true;}
  }
  pawn.physicsReady=true;return true;
}
function removeBody(pawn){
  if(!pawn||!pawn.bodyInWorld)return;
  try{if(pawn.vehicle&&pawn.vehicle.removeFromWorld)pawn.vehicle.removeFromWorld(pawn.world);else if(pawn.world&&pawn.body)pawn.world.removeBody(pawn.body);}catch(err){}
  pawn.bodyInWorld=false;
}
function restoreBody(pawn){
  if(!pawn||pawn.bodyInWorld||!pawn.world||!pawn.body)return;
  try{if(pawn.vehicle&&pawn.vehicle.addToWorld)pawn.vehicle.addToWorld(pawn.world);else pawn.world.addBody(pawn.body);pawn.bodyInWorld=true;}catch(err){}
}

function groundRay(pawn){
  const body=pawn.body,world=pawn.world,CANNON=root.CANNON,movement=pawn.config.movement||{},collision=pawn.config.collision||{};
  if(!body||!world||!CANNON||!world.raycastClosest||!pawn.rayResult)return null;
  pawn.rayResult.reset&&pawn.rayResult.reset();const radius=finite(collision.radius,.32),height=finite(collision.height,1.08),length=height*.5+radius+finite(movement.groundProbe,.24);
  const from=new CANNON.Vec3(body.position.x,body.position.y,body.position.z),to=new CANNON.Vec3(body.position.x,body.position.y-length,body.position.z);
  // Cannon bodies default both filter fields to group 1, not to an all-groups
  // mask. The previous private ray group therefore missed every ordinary floor.
  // Suppress only this capsule synchronously while the closest ray is evaluated;
  // the ray can then use Cannon's all-groups defaults and still never hit self.
  const collisionResponse=body.collisionResponse;let hit=false;body.collisionResponse=false;
  try{hit=world.raycastClosest(from,to,{skipBackfaces:true,collisionFilterGroup:-1,collisionFilterMask:-1},pawn.rayResult);}catch(err){return null;}finally{body.collisionResponse=collisionResponse;}
  if(!hit||pawn.rayResult.body===body)return null;
  const point=pawn.rayResult.hitPointWorld,normal=pawn.rayResult.hitNormalWorld;
  return {distance:finite(pawn.rayResult.distance,length),point:new CANNON.Vec3(point.x,point.y,point.z),normal:new CANNON.Vec3(normal.x,normal.y,normal.z),body:pawn.rayResult.body};
}
function characterGroundPostStep(pawn){
  const body=pawn&&pawn.body,hit=pawn&&pawn.groundHit,movement=pawn&&pawn.config&&pawn.config.movement||{},collision=pawn&&pawn.config&&pawn.config.collision||{};
  if(!body||pawn.inVehicle||!pawn.state.grounded||!hit||!hit.point)return false;
  const normal=hit.normal||{x:0,y:1,z:0},normalY=finite(normal.y,1);
  if(normalY<finite(movement.maxSlope,.72))return false;

  // Sketchbook grounds its capsule after Cannon has integrated the frame.  The
  // earlier adapter added a second vertical suspension on top of the capsule's
  // contact response; those two solvers fought each other and made both the rig
  // and its following camera pulse.  Keep the source contract instead: flatten
  // the velocity onto the supporting plane and place the capsule at ray length.
  const tangentY=-(finite(normal.x)*body.velocity.x+finite(normal.z)*body.velocity.z)/Math.max(.001,normalY);
  body.velocity.y=tangentY;
  if(hit.body&&finite(hit.body.mass,0)>0&&hit.body.getVelocityAtWorldPoint){
    const pointVelocity=new root.CANNON.Vec3();hit.body.getVelocityAtWorldPoint(hit.point,pointVelocity);
    body.velocity.x+=pointVelocity.x;body.velocity.y+=pointVelocity.y;body.velocity.z+=pointVelocity.z;
  }
  const feet=finite(collision.height,1.08)*.5+finite(collision.radius,.32),rayLength=feet+Math.max(0,finite(movement.groundClearance,.07));
  body.position.y=finite(hit.point.y)+rayLength+body.velocity.y*PHYSICS_FRAME_TIME;
  body.aabbNeedsUpdate=true;
  return true;
}
function cameraRelativeDirection(GAME,x,z){
  const THREE=root.THREE,camera=GAME&&GAME.core&&GAME.core.camera;if(!THREE||!camera)return {x,z};
  const forward=new THREE.Vector3();if(camera.getWorldDirection)camera.getWorldDirection(forward);else forward.set(0,0,1).applyQuaternion(camera.quaternion||new THREE.Quaternion());
  forward.y=0;if(forward.lengthSq()<1e-6)forward.set(0,0,1);forward.normalize();const right=new THREE.Vector3(forward.z,0,-forward.x);
  return {x:right.x*x+forward.x*z,z:right.z*x+forward.z*z};
}
function interactionBinding(pawn,key,fallback){
  const interaction=pawn&&pawn.config&&pawn.config.interaction||{},upstream=pawn&&pawn.config&&pawn.config.source&&pawn.config.source.upstreamControls||{};
  const upstreamKey={passengerKey:'enterPassenger',driverKey:'enterDriver',seatSwitchKey:'switchSeat'}[key]||key;
  return interaction[key]||upstream[upstreamKey]||fallback;
}
function readConfiguredInteract(GAME,pawn,primary){
  const raw=rawKeyboardDown(GAME,pawn,interactionBinding(pawn,'driverKey','f'),'f');return raw==null?readInteract(GAME,pawn,primary):raw;
}
function setCharacterAnimation(pawn,clip,loop){
  if(!pawn||!clip||pawn.state.animationClip===clip)return false;const STORE=root.LK_STORE;
  if(!STORE||typeof STORE.playLogicElementAnimation!=='function')return false;
  const action=STORE.playLogicElementAnimation(pawn.owner,clip,{loop:loop||'repeat',speed:1});if(!action)return false;pawn.state.animationClip=clip;return true;
}
function syncSeatOccupant(character){
  const seat=character&&character.occupyingSeat;if(!seat||!seat.node||!character.owner)return false;
  // A normal Engine Character already owns its AnimationMixer through
  // character-pawn-base/soccer-locomotion. Starting Sketchbook's `driving` or
  // `sitting` Scene Store action on that same mixer adds an unmanaged weight-1
  // action which survives the exit and fights every later on-foot clip. Only
  // the Sketchbook advanced-character uses this animation path; ordinary
  // Characters share position/seating through the occupancy contract instead.
  if(character.type!=='advanced-character'){
    const occupancy=root.LK_RUNTIME_VEHICLE_OCCUPANCY,vehicle=character.inVehicle;
    return !!(occupancy&&vehicle&&occupancy.syncSeatOccupant&&occupancy.syncSeatOccupant(character,vehicle,seat));
  }
  const position=ownerWorldPosition(seat.node),rotation=root.THREE&&seat.node.getWorldQuaternion?seat.node.getWorldQuaternion(new root.THREE.Quaternion()):null;setOwnerWorldTransform(character.owner,position,rotation);
  character.state.locomotion=seat.type==='driver'?'driving':'sitting';setCharacterAnimation(character,entryAnimation(character,seat.type==='driver'?'driving':'passenger',character.state.locomotion));return true;
}
function animateSeatDoor(pawn,seat,open,hold){
  if(!pawn||!seat||!seat.door||pawn.config.interaction&&pawn.config.interaction.doorAnimations===false)return false;
  seat.door.target=open?Math.max(0,finite(pawn.config.interaction&&pawn.config.interaction.doorOpenAngle,1)):0;seat.door.hold=open?Math.max(0,finite(hold,.75)):0;return true;
}
function updateSeatDoors(pawn,dt){
  (pawn.parts.seats||[]).forEach(seat=>{const door=seat.door;if(!door||!door.node||!door.node.rotation)return;
    if(door.hold>0){door.hold=Math.max(0,door.hold-dt);if(!door.hold)door.target=0;}
    const step=Math.max(0,dt)*Math.max(.1,finite(pawn.config.interaction&&pawn.config.interaction.doorAnimationSpeed,5));door.rotation=door.rotation<door.target?Math.min(door.target,door.rotation+step):Math.max(door.target,door.rotation-step);
    // A door hinges about its own vertical axis, so it composes onto its rest
    // pose the same way every other moving part does.
    rotatePart(door.node,'y',finite(door.swing,door.side)*door.rotation);
  });
}
function characterFeetHeight(character){
  const collision=character&&character.config&&character.config.collision||{};return finite(collision.height,.5)*.5+finite(collision.radius,.25);
}
function entryAnimation(character,key,fallback){
  const animations=character&&character.config&&character.config.entry&&character.config.entry.animations||{};return String(animations[key]||fallback||'').trim();
}
function transitionAnimation(character,vehicle,seat,phase,role){
  const side=seat&&seat.door&&seat.door.side<0?'Left':seat&&seat.door&&seat.door.side>0?'Right':finite(seat&&seat.node&&seat.node.position&&seat.node.position.x)<0?'Left':'Right',prefix=role==='passenger'?'passenger':'driver';
  if(phase==='enter'&&vehicle&&vehicle.type==='airplane')return entryAnimation(character,'airplaneEnter'+side,'enter_airplane_'+side.toLowerCase());
  const key=prefix+(phase==='exit'?'Exit':'Enter')+side,generic=prefix+(phase==='exit'?'Exit':'Enter'),fallback=(phase==='exit'?'stand_up_':'sit_down_')+side.toLowerCase();
  return entryAnimation(character,key,entryAnimation(character,generic,fallback));
}
function locomotionAnimation(character,key,fallback){
  const animations=character&&character.config&&character.config.animations||{};return String(animations[key]||fallback||'').trim();
}
function nearestEntryTarget(vehicle,seat,character){
  const here=character&&character.body&&character.body.position||ownerWorldPosition(character&&character.owner),feet=characterFeetHeight(character),points=(seat&&seat.entryPoints||[]).map(node=>ownerWorldPosition(node));
  if(!points.length){const safe=safeExitPosition(vehicle,character);return {x:safe.x,y:safe.y,z:safe.z};}
  let nearest=points[0],best=Infinity;points.forEach(point=>{const y=finite(point.y)+feet,dx=finite(point.x)-finite(here.x),dy=y-finite(here.y),dz=finite(point.z)-finite(here.z),d2=dx*dx+dy*dy+dz*dz;if(d2<best){best=d2;nearest={x:finite(point.x),y,z:finite(point.z)};}});return nearest;
}
function beginEntryChoreography(character,vehicle,role,seat){
  const choreography=character&&character.config&&character.config.entry&&character.config.entry.choreography||{};
  if(choreography.enabled===false)return false;
  if(!character||!vehicle||!seat||seat.occupiedBy||seat.reservedBy&&seat.reservedBy!==character||character.entryTransition)return false;
  seat.reservedBy=character;character.entryTransition={phase:'approach',vehicle,seat,role,elapsed:0,target:nearestEntryTarget(vehicle,seat,character)};
  const cooldown=Math.max(.1,finite(vehicle.config&&vehicle.config.entry&&vehicle.config.entry.cooldown,finite(character.config.entry.cooldown,.65)));character.entryCooldown=vehicle.entryCooldown=cooldown;
  emit(character,'OnCharacterVehicleTransitionStarted',{vehicle,seat:seat.name,role,phase:'approach'});return true;
}
function beginExitChoreography(character,vehicle,seat){
  const choreography=character&&character.config&&character.config.entry&&character.config.entry.choreography||{};
  if(choreography.enabled===false||character.entryTransition)return false;
  const position=safeExitPosition(vehicle,character),feet=characterFeetHeight(character),start=ownerWorldPosition(character.owner),end={x:position.x,y:position.y-feet,z:position.z};
  character.entryTransition={phase:'exit',vehicle,seat,role:seat.type==='driver'?'driver':'passenger',elapsed:0,start:{x:start.x,y:start.y,z:start.z},end,exitPosition:position};
  character.runtimeHidden=true;if(character.owner){character.previousOwnerVisible=character.previousOwnerVisible!==false;character.owner.visible=true;}
  animateSeatDoor(vehicle,seat,true,finite(choreography.exitDuration,.8)+.25);setCharacterAnimation(character,transitionAnimation(character,vehicle,seat,'exit',seat.type==='driver'?'driver':'passenger'),'once');
  emit(character,'OnCharacterVehicleTransitionStarted',{vehicle,seat:seat.name,role:character.entryTransition.role,phase:'exit'});return true;
}
function advanceEntryTransition(character,dt){
  const transition=character&&character.entryTransition;if(!transition)return false;const vehicle=transition.vehicle,seat=transition.seat,choreography=character.config.entry&&character.config.entry.choreography||{};
  if(!vehicle||!seat||vehicle.disposed){if(seat&&seat.reservedBy===character)seat.reservedBy=null;character.entryTransition=null;return false;}
  transition.elapsed+=Math.max(0,finite(dt));
  if(transition.phase==='approach'){
    const body=character.body,target=transition.target||nearestEntryTarget(vehicle,seat,character);if(!body){transition.phase='enter';transition.elapsed=0;}
    else {
      const dx=target.x-body.position.x,dz=target.z-body.position.z,distance=Math.hypot(dx,dz),stop=Math.max(.02,finite(choreography.stopDistance,.18)),timeout=Math.max(.1,finite(choreography.approachTimeout,3));
      if(distance>stop&&transition.elapsed<timeout){const speed=Math.max(.1,finite(choreography.approachSpeed,2.4)),scale=speed/Math.max(distance,.001);body.velocity.x=dx*scale;body.velocity.z=dz*scale;character.state.heading=Math.atan2(dx,dz);character.state.locomotion='walk';character.state.speed=speed;setCharacterAnimation(character,locomotionAnimation(character,'walk','run'));return true;}
      body.velocity.x=0;body.velocity.z=0;removeBody(character);transition.phase='enter';transition.elapsed=0;const start=ownerWorldPosition(character.owner);transition.start={x:start.x,y:start.y,z:start.z};animateSeatDoor(vehicle,seat,true,finite(choreography.enterDuration,.85)+.25);setCharacterAnimation(character,transitionAnimation(character,vehicle,seat,'enter',transition.role),'once');emit(character,'OnCharacterVehicleTransitionPhase',{vehicle,seat:seat.name,role:transition.role,phase:'enter'});
    }
  }
  if(transition.phase==='enter'){
    const duration=Math.max(.05,finite(choreography.enterDuration,.85)),amount=clamp(transition.elapsed/duration,0,1),end=ownerWorldPosition(seat.node||vehicle.owner),start=transition.start||end;
    setOwnerWorldTransform(character.owner,{x:lerp(start.x,end.x,amount),y:lerp(start.y,end.y,amount),z:lerp(start.z,end.z,amount)},root.THREE&&seat.node&&seat.node.getWorldQuaternion?seat.node.getWorldQuaternion(new root.THREE.Quaternion()):null);
    if(amount>=1){character.entryTransition=null;if(seat.reservedBy===character)seat.reservedBy=null;character.enterVehicle(vehicle,transition.role,seat,{transition:true});}
    return true;
  }
  if(transition.phase==='exit'){
    const duration=Math.max(.05,finite(choreography.exitDuration,.8)),amount=clamp(transition.elapsed/duration,0,1),start=transition.start,end=transition.end;
    setOwnerWorldTransform(character.owner,{x:lerp(start.x,end.x,amount),y:lerp(start.y,end.y,amount),z:lerp(start.z,end.z,amount)},null);
    if(amount>=1){character.entryTransition=null;character.exitSeat(true,transition.exitPosition);}
    return true;
  }
  return true;
}
function seatedCharacterBefore(pawn){
  if(pawn.entryTransition){advanceEntryTransition(pawn,PHYSICS_FRAME_TIME);return true;}
  const vehicle=pawn.inVehicle;if(!vehicle)return false;syncSeatOccupant(pawn);
  if(pawn.occupyingSeat&&pawn.occupyingSeat.type==='passenger'&&pawn.possessed){
    const exit=readConfiguredInteract(pawn.GAME,pawn),seatSwitch=rawKeyboardDown(pawn.GAME,pawn,interactionBinding(pawn,'seatSwitchKey','x'),'x')===true||pawn.control&&pawn.control.seatSwitch===true;
    if(exit&&!pawn.inputEdges.interact)pawn.exitSeat(false);if(seatSwitch&&!pawn.inputEdges.seatSwitch&&pawn.config.interaction&&pawn.config.interaction.seatSwitchEnabled!==false)pawn.switchSeat();pawn.inputEdges.interact=exit;pawn.inputEdges.seatSwitch=seatSwitch;
  }
  return true;
}
function characterBefore(pawn,dt){
  if(pawn.entryTransition){advanceEntryTransition(pawn,dt);return;}if(pawn.inVehicle){seatedCharacterBefore(pawn);return;}const body=pawn.body,movement=pawn.config.movement,input=readInput(pawn.GAME,pawn,'character'),x=clamp(input.steer,-1,1),z=clamp(finite(input.throttle)-finite(input.brake),-1,1);
  const direction=cameraRelativeDirection(pawn.GAME,x,z),length=Math.hypot(direction.x,direction.z),sprinting=input.sprint===true;
  if(length>1){direction.x/=length;direction.z/=length;}
  const baseSpeed=sprinting?finite(movement.runSpeed,4)*finite(movement.sprintMultiplier,1.4):finite(movement.walkSpeed,3.2);
  pawn.jumpGrace=Math.max(0,finite(pawn.jumpGrace,0)-dt);
  const hit=groundRay(pawn),collision=pawn.config.collision,feetDistance=finite(collision.height,1.08)*.5+finite(collision.radius,.32),groundedNow=!!(!pawn.jumpGrace&&hit&&hit.distance<=feetDistance+finite(movement.groundProbe,.24)&&finite(hit.normal&&hit.normal.y,1)>=finite(movement.maxSlope,.72));
  pawn.groundGrace=groundedNow?.1:Math.max(0,finite(pawn.groundGrace,0)-dt);let grounded=groundedNow||(pawn.groundGrace>0&&body.velocity.y<.5);
  if(groundedNow)pawn.groundSupport=hit;else if(!grounded)pawn.groundSupport=null;
  const response=finite(movement.acceleration,18)*(grounded?1:finite(movement.airControl,.28)),alpha=damp(response,dt);
  body.velocity.x=lerp(body.velocity.x,direction.x*baseSpeed*length,alpha);body.velocity.z=lerp(body.velocity.z,direction.z*baseSpeed*length,alpha);
  const jump=input.reset===true||input.jump===true;if(jump&&!pawn.inputEdges.jump&&grounded){body.velocity.y=Math.sqrt(2*9.82*Math.max(.05,finite(movement.jumpHeight,1.15)));pawn.jumpGrace=.12;pawn.groundGrace=0;grounded=false;emit(pawn,'OnCharacterJump');}
  pawn.inputEdges.jump=jump;
  // Dodge: two taps inside the window roll. Same gesture, same key and same
  // window as the engine Character, so the two bodies answer the player the same
  // way. A single tap deliberately does nothing.
  const aux=auxiliaryCharacterInput(pawn.GAME,pawn),dodge=aux.dodge===true||pawn.control&&pawn.control.dodge===true;
  pawn.state.dodgeTapAge=finite(pawn.state.dodgeTapAge,99)+dt;
  if(dodge&&!pawn.inputEdges.dodge){
    if(pawn.state.dodgeTapAge<=DODGE_TAP_WINDOW&&grounded)beginCharacterRoll(pawn,{reason:'dodge',dirX:direction.x*length,dirZ:direction.z*length,speed:Math.max(DODGE_ROLL_SPEED,pawn.state.speed)});
    pawn.state.dodgeTapAge=0;
  }
  pawn.inputEdges.dodge=dodge;
  // A roll owns the body until it finishes: steering during it would cancel the
  // move on the frame after it started.
  stepCharacterRoll(pawn,dt);
  const interact=readConfiguredInteract(pawn.GAME,pawn,input),passenger=rawKeyboardDown(pawn.GAME,pawn,interactionBinding(pawn,'passengerKey','g'),'g')===true||pawn.control&&pawn.control.passenger===true;
  if(passenger&&!pawn.inputEdges.passenger&&pawn.entryCooldown<=0)pawn.tryEnterNearestVehicle('passenger');
  else if(interact&&!pawn.inputEdges.interact&&pawn.entryCooldown<=0)pawn.tryEnterNearestVehicle('driver');
  pawn.inputEdges.interact=interact;pawn.inputEdges.passenger=passenger;
  const headingBefore=pawn.state.heading;
  if(length>.08){const target=Math.atan2(direction.x,direction.z),difference=Math.atan2(Math.sin(target-pawn.state.heading),Math.cos(target-pawn.state.heading));pawn.state.heading+=difference*damp(finite(movement.turnRate,12),dt);}
  // Angular speed drives the turn-on-the-spot clips; without it a stationary
  // character that spins to face a new direction just slides round in idle.
  pawn.state.turnRate=dt>0?Math.atan2(Math.sin(pawn.state.heading-headingBefore),Math.cos(pawn.state.heading-headingBefore))/dt:0;
  pawn.groundHit=grounded?(hit||pawn.groundSupport):null;const wasGrounded=pawn.state.grounded;pawn.state.grounded=grounded;pawn.state.sprinting=sprinting&&length>.05;pawn.state.speed=Math.hypot(body.velocity.x,body.velocity.z);pawn.state.speedKmh=pawn.state.speed*3.6;
  advanceLocomotionState(pawn,dt,length,direction,grounded,wasGrounded);
}

// The source character is a ~20-state machine and boxman.glb ships 34 clips.
// Driving it with five states (idle/walk/sprint/jump/fall) is what made the
// character read as stiff: no landing, no roll, no start or stop steps, and no
// turn on the spot. This derives the missing states from motion the adapter
// already tracks, so every state still resolves through `animations.*` and an
// absent clip degrades to the old behaviour instead of breaking.
const LOCOMOTION_CLIPS = Object.freeze({
  idle:'idle', walk:'run', sprint:'sprint',
  jump:'jump_running', jump_idle:'jump_idle', jump_running:'jump_running',
  fall:'falling', falling:'falling',
  drop_idle:'drop_idle', drop_running:'drop_running', drop_running_roll:'drop_running_roll',
  start_forward:'start_forward', start_left:'start_left', start_right:'start_right',
  start_back_left:'start_back_left', start_back_right:'start_back_right',
  stop:'stop', rotate_left:'rotate_left', rotate_right:'rotate_right',
});
const TRANSIENT_STATES = Object.freeze({
  start_forward:.28, start_left:.3, start_right:.3, start_back_left:.34, start_back_right:.34,
  stop:.3, drop_idle:.36, drop_running:.32, drop_running_roll:.68,
});
// A deliberate combat roll, the same gesture the engine Character owns: two taps
// of Dodge inside this window. The clip is the source's own running drop roll, so
// nothing new has to be authored - it is already in the animation dropdown.
const DODGE_TAP_WINDOW = .32;
const DODGE_ROLL_SECONDS = TRANSIENT_STATES.drop_running_roll;
// The roll carries the character: a dodge that does not move is just an animation.
const DODGE_ROLL_SPEED = 6.4;
// Leaving a moving vehicle above this speed lands as a roll rather than as a
// character standing still at speed. Below it, the ordinary exit applies.
const EXIT_ROLL_SPEED = 4.2;
// Starts the roll and returns true when it took. Shared by the deliberate dodge,
// the vehicle exit at speed and the landing, so all three produce the same move.
function beginCharacterRoll(pawn,options){
  if(!pawn||pawn.type!=='advanced-character'||pawn.inVehicle||pawn.entryTransition)return false;
  if(pawn.state.transient==='drop_running_roll')return false;
  const opts=options||{};
  pawn.state.transient='drop_running_roll';
  pawn.state.transientTime=DODGE_ROLL_SECONDS;
  pawn.state.locomotion='drop_running_roll';
  pawn.state.rollTime=DODGE_ROLL_SECONDS;
  // The direction is where the character is ALREADY going, or where it faces when
  // it is standing still - the same rule the engine Character uses, which is what
  // makes a roll usable as an evade instead of a commitment to face forward.
  const heading=finite(pawn.state.heading,0);
  const body=pawn.body,speed=Math.max(finite(opts.speed,0),DODGE_ROLL_SPEED);
  let dirX=finite(opts.dirX,NaN),dirZ=finite(opts.dirZ,NaN);
  if(!Number.isFinite(dirX)||!Number.isFinite(dirZ)||(Math.abs(dirX)<1e-4&&Math.abs(dirZ)<1e-4)){
    const moving=body&&Math.hypot(finite(body.velocity.x,0),finite(body.velocity.z,0))>1.2;
    if(moving){dirX=body.velocity.x;dirZ=body.velocity.z;}
    else {dirX=Math.sin(heading);dirZ=Math.cos(heading);}
  }
  const length=Math.hypot(dirX,dirZ)||1;
  pawn.state.rollDirX=dirX/length;pawn.state.rollDirZ=dirZ/length;
  pawn.state.rollSpeed=speed;
  if(body&&body.velocity){body.velocity.x=pawn.state.rollDirX*speed;body.velocity.z=pawn.state.rollDirZ*speed;}
  emit(pawn,'OnCharacterRoll',{reason:String(opts.reason||'dodge'),speed,impact:finite(opts.impact,0)});
  return true;
}
function rollActive(pawn){ return !!(pawn&&pawn.state&&finite(pawn.state.rollTime,0)>0); }
// While a roll owns the body it keeps its own velocity, so ordinary steering
// cannot cancel it half way through.
function stepCharacterRoll(pawn,dt){
  if(!rollActive(pawn))return false;
  pawn.state.rollTime=Math.max(0,finite(pawn.state.rollTime,0)-dt);
  const body=pawn.body;
  const fade=clamp(pawn.state.rollTime/Math.max(.001,DODGE_ROLL_SECONDS),0,1);
  if(body&&body.velocity){
    const speed=finite(pawn.state.rollSpeed,DODGE_ROLL_SPEED)*(.35+.65*fade);
    body.velocity.x=finite(pawn.state.rollDirX,0)*speed;
    body.velocity.z=finite(pawn.state.rollDirZ,0)*speed;
  }
  if(pawn.state.rollTime<=0)emit(pawn,'OnCharacterRollFinished',{});
  return true;
}

function transientDone(pawn,dt){
  if(!pawn.state.transient) return true;
  pawn.state.transientTime=Math.max(0,finite(pawn.state.transientTime,0)-dt);
  if(pawn.state.transientTime>0) return false;
  pawn.state.transient=null;
  return true;
}
/** Which start step to play, from the movement direction relative to facing. */
function startStepFor(pawn,direction){
  const heading=finite(pawn.state.heading,0);
  const forward=Math.sin(heading)*direction.x+Math.cos(heading)*direction.z;
  const side=Math.cos(heading)*direction.x-Math.sin(heading)*direction.z;
  if(forward>.55) return 'start_forward';
  if(forward<-.3) return side>=0?'start_back_right':'start_back_left';
  return side>=0?'start_right':'start_left';
}
// `wasGrounded` is passed in because the caller publishes `state.grounded` for
// the rest of the frame BEFORE this runs. Reading it back here made the landing
// test `grounded && state.grounded===false` a contradiction, so the drop and the
// landing roll were unreachable: the character fell from any height and simply
// stood up.
function advanceLocomotionState(pawn,dt,length,direction,grounded,wasGrounded){
  const state=pawn.state,body=pawn.body;
  const speed=state.speed,moving=length>.08;
  // Track the fall so the landing can choose between a soft drop, a running
  // drop and a full roll, the way the source does.
  if(!grounded){
    state.airTime=finite(state.airTime,0)+dt;
    state.fallSpeed=Math.min(finite(state.fallSpeed,0),body.velocity.y);
  }
  const landed=grounded&&wasGrounded===false;
  const wasAir=finite(state.airTime,0),impact=Math.abs(finite(state.fallSpeed,0));
  if(grounded){ state.airTime=0; state.fallSpeed=0; }

  if(!grounded){
    state.transient=null;
    state.locomotion=body.velocity.y>.1?(speed>1.4?'jump_running':'jump_idle'):'falling';
    return state.locomotion;
  }
  if(landed&&(impact>6.5||wasAir>.42)){
    // A fast landing with speed rolls out of it; standing still absorbs it.
    const roll=speed>2.6&&impact>7.5;
    state.transient=roll?'drop_running_roll':(speed>1?'drop_running':'drop_idle');
    state.transientTime=TRANSIENT_STATES[state.transient];
    if(roll){
      // A landing roll is the same move, so it goes through the same entry point
      // and gets the same carried velocity and the same events.
      pawn.state.rollTime=DODGE_ROLL_SECONDS;
      pawn.state.rollSpeed=Math.max(speed,DODGE_ROLL_SPEED*.8);
      pawn.state.rollDirX=body.velocity.x;pawn.state.rollDirZ=body.velocity.z;
      const length=Math.hypot(pawn.state.rollDirX,pawn.state.rollDirZ)||1;
      pawn.state.rollDirX/=length;pawn.state.rollDirZ/=length;
      emit(pawn,'OnCharacterRoll',{reason:'landing',impact,speed});
    }
    state.locomotion=state.transient;
    return state.locomotion;
  }
  if(!transientDone(pawn,dt)) { state.locomotion=state.transient; return state.locomotion; }

  const wasMoving=state.moving===true;
  if(moving&&!wasMoving&&speed<2.2){
    state.transient=startStepFor(pawn,direction);
    state.transientTime=TRANSIENT_STATES[state.transient];
    state.moving=true;
    state.locomotion=state.transient;
    return state.locomotion;
  }
  if(!moving&&wasMoving&&speed>1.1){
    state.transient='stop';
    state.transientTime=TRANSIENT_STATES.stop;
    state.moving=false;
    state.locomotion='stop';
    return state.locomotion;
  }
  state.moving=moving;
  if(!moving&&speed<.12){
    // Turning on the spot is its own animation, not a frozen idle.
    const turn=finite(state.turnRate,0);
    state.locomotion=Math.abs(turn)>.9?(turn>0?'rotate_left':'rotate_right'):'idle';
    return state.locomotion;
  }
  state.locomotion=state.sprinting?'sprint':'walk';
  return state.locomotion;
}
function characterAfter(pawn){
  if(pawn.entryTransition&&pawn.entryTransition.phase!=='approach')return;if(pawn.inVehicle){syncSeatOccupant(pawn);return;}if(!pawn.body||!pawn.owner)return;const collision=pawn.config.collision,feet=finite(collision.height,1.08)*.5+finite(collision.radius,.32);
  const position=renderBodyPosition(pawn.body),renderY=pawn.state.grounded?pawn.body.position.y:position.y,rotation=root.THREE?new root.THREE.Quaternion().setFromAxisAngle(new root.THREE.Vector3(0,1,0),pawn.state.heading):null;setOwnerWorldTransform(pawn.owner,{x:position.x,y:renderY-feet,z:position.z},rotation);if(!rotation&&pawn.owner.rotation)pawn.owner.rotation.y=pawn.state.heading;
  Object.assign(pawn.state,{velocityX:pawn.body.velocity.x,velocityY:pawn.body.velocity.y,velocityZ:pawn.body.velocity.z,airborne:!pawn.state.grounded});
  // Every state maps to a real clip in boxman.glb. `jump`/`fall` stay as
  // aliases so graphs authored against the old five-state names keep working.
  const fallback=LOCOMOTION_CLIPS[pawn.state.locomotion]||'idle';
  const transient=!!TRANSIENT_STATES[pawn.state.locomotion];
  setCharacterAnimation(pawn,locomotionAnimation(pawn,pawn.state.locomotion,fallback),transient?'once':'repeat');
}

function localMotion(pawn){
  const CANNON=root.CANNON,body=pawn.body,forward=worldVector(CANNON,body,0,0,1),right=worldVector(CANNON,body,1,0,0),up=worldVector(CANNON,body,0,1,0);
  return {forward,right,up,forwardSpeed:body.velocity.dot(forward),lateralSpeed:body.velocity.dot(right),speed:body.velocity.length()};
}
function sourceAlignmentEuler(from,to,factor){
  const THREE=root.THREE;if(!THREE||!from||!to)return null;const a=new THREE.Vector3(finite(from.x),finite(from.y),finite(from.z)),b=new THREE.Vector3(finite(to.x),finite(to.y),finite(to.z));
  if(a.lengthSq()<1e-8||b.lengthSq()<1e-8)return null;a.normalize();b.normalize();const q=new THREE.Quaternion().setFromUnitVectors(a,b),scale=finite(factor,.3);q.x*=scale;q.y*=scale;q.z*=scale;q.w*=scale;return new THREE.Euler().setFromQuaternion(q);
}
function handleVehicleSeatSwitch(pawn){
  const pressed=rawKeyboardDown(pawn.GAME,pawn,interactionBinding(pawn,'seatSwitchKey','x'),'x')===true||pawn.control&&pawn.control.seatSwitch===true;
  if(pressed&&!pawn.inputEdges.seatSwitch&&pawn.driverPawn&&pawn.config.interaction&&pawn.config.interaction.seatSwitchEnabled!==false)pawn.driverPawn.switchSeat();pawn.inputEdges.seatSwitch=pressed;
}
function vehicleExitPressed(pawn,down){
  const occupancy=root.LK_RUNTIME_VEHICLE_OCCUPANCY;
  if(occupancy&&typeof occupancy.consumeExitInput==='function')return occupancy.consumeExitInput(pawn,down===true);
  const pressed=down===true&&pawn.inputEdges.interact!==true;pawn.inputEdges.interact=down===true;return pressed;
}
function vehicleGrounded(pawn){ return pawn.vehicle?pawn.vehicle.wheelInfos.reduce((n,w)=>n+(w.isInContact?1:0),0):0; }
function carBefore(pawn,dt){
  const input=readInput(pawn.GAME,pawn,'vehicle'),body=pawn.body,vehicle=pawn.vehicle,tune=pawn.config.tuning||{},motion=localMotion(pawn),grounded=vehicleGrounded(pawn);
  const throttle=clamp(input.throttle,0,1),brake=clamp(input.brake,0,1),handbrake=input.handbrake===true,gears=Array.isArray(tune.gears)?tune.gears:[0,12,22,32,43,56];
  pawn.shiftTimer=Math.max(0,pawn.shiftTimer-dt);let gear=Math.max(1,Math.min(gears.length-1,pawn.state.gear|0||1)),forwardSpeed=motion.forwardSpeed;
  // S is a service brake while the car is still travelling forward, then
  // becomes reverse throttle near standstill, matching the arcade convention.
  // Keeping these paths separate also makes the exposed BrakeForce meaningful.
  const serviceBraking=brake>.05&&throttle<.05&&forwardSpeed>.5,reversing=brake>.05&&throttle<.05&&!serviceBraking,reverseSpeed=Math.max(.1,finite(tune.reverseSpeed,4));let force=0;
  if(!pawn.shiftTimer){
    if(reversing){const powerFactor=(-reverseSpeed-forwardSpeed)/reverseSpeed;force=(finite(tune.engineForce,500)/gear)*Math.abs(powerFactor)*brake;}
    else {
      const lower=finite(gears[gear-1],0),upper=finite(gears[gear],gears[gears.length-1]),powerFactor=(upper-forwardSpeed)/Math.max(.1,upper-lower);
      if(powerFactor<.1&&gear<gears.length-1){gear++;pawn.shiftTimer=finite(tune.shiftTime,.2);}
      else if(gear>1&&powerFactor>1.2){gear--;pawn.shiftTimer=finite(tune.shiftTime,.2);}
      else if(throttle>.05)force=-(finite(tune.engineForce,500)/gear)*powerFactor*throttle;
    }
  }
  const maxSpeed=reversing?reverseSpeed:finite(gears[gear],22);
  const speedFactor=Math.max(1,Math.abs(forwardSpeed)*.28),velocityAngle=Math.atan2(motion.lateralSpeed,Math.max(.2,Math.abs(forwardSpeed))),rawSteer=clamp(input.steer,-1,1);
  const targetSteer=clamp(rawSteer*finite(tune.maxSteer,.62)/speedFactor-velocityAngle*finite(tune.driftCorrection,.44),-finite(tune.maxSteer,.62),finite(tune.maxSteer,.62));
  pawn.steering=lerp(pawn.steering,targetSteer,damp(finite(tune.steeringResponse,9.5),dt));
  const front=[],rear=[],driven=[];(pawn.config.wheels||[]).forEach((wheel,index)=>{(wheel.front?front:rear).push(index);if(wheel.driven)driven.push(index);});
  const driveMode=String(tune.drive||'awd').toLowerCase(),metadataDrive=(pawn.config.wheels||[]).map((wheel,index)=>wheel.driveAxle===driveMode?index:-1).filter(index=>index>=0);
  const driveWheels=driveMode==='rwd'?(metadataDrive.length?metadataDrive:rear):(driveMode==='fwd'?(metadataDrive.length?metadataDrive:front):(driveMode==='awd'?front.concat(rear):(driven.length?driven:front.concat(rear))));
  vehicle.wheelInfos.forEach((wheel,index)=>{
    // Sketchbook's Vehicle.applyEngineForce applies the authored force to each
    // wheel on the selected axle; 500 therefore stays 500 per driven wheel.
    vehicle.applyEngineForce(driveWheels.includes(index)&&!pawn.shiftTimer?force:0,index);
    vehicle.setSteeringValue(front.includes(index)?pawn.steering:0,index);
    const service=serviceBraking?finite(tune.brakeForce,14500)*brake:0,parking=handbrake&&rear.includes(index)?finite(tune.handbrakeForce,1000000):0;
    vehicle.setBrake(Math.max(service,parking),index);
    const base=finite(pawn.config.suspension&&pawn.config.suspension.frictionSlip,2.6);wheel.frictionSlip=rear.includes(index)&&handbrake?base*.38:base;
  });
  if(grounded<2){
    pawn.airTime+=dt;const influence=clamp(pawn.airTime/2,0,1)*clamp(Math.abs(forwardSpeed),0,1),air=finite(tune.airControl,.18)*influence;
    addTorque(body,motion.forward.x*rawSteer*body.mass*air,motion.forward.y*rawSteer*body.mass*air,motion.forward.z*rawSteer*body.mass*air);
    const pitch=clamp(brake-throttle,-1,1);addTorque(body,motion.right.x*pitch*body.mass*air,motion.right.y*pitch*body.mass*air,motion.right.z*pitch*body.mass*air);
  } else pawn.airTime=0;
  handleVehicleSeatSwitch(pawn);const interact=readConfiguredInteract(pawn.GAME,pawn,input);if(vehicleExitPressed(pawn,interact))pawn.requestExit();
  if(pawn.exitPending&&Math.abs(forwardSpeed)<=finite(pawn.config.entry.maxExitSpeed,3.5))pawn.exitDriver();
  Object.assign(pawn.state,{gear:reversing?-1:gear,reverse:reversing,speed:forwardSpeed,speedKmh:Math.abs(forwardSpeed)*3.6,steer:rawSteer,throttle,brake,handbrake,
    groundedWheels:grounded,drift:grounded>0&&Math.abs(velocityAngle)>.16&&Math.abs(forwardSpeed)>4,slipAngle:velocityAngle,rpm:900+clamp(Math.abs(forwardSpeed)/Math.max(1,maxSpeed),0,1)*6500});
}
function syncWheels(pawn,dt){
  if(!pawn.vehicle)return;const visuals=pawn.parts.wheels||[],layout=pawn.config.wheels||[];
  pawn.vehicle.wheelInfos.forEach((wheel,index)=>{
    pawn.vehicle.updateWheelTransform(index);const node=visuals[index],transform=wheel.worldTransform;if(!node)return;
    if(root.THREE&&node.parent&&transform&&transform.position&&transform.quaternion){
      const body=pawn.body,currentPosition=body&&body.position,currentQuaternion=body&&body.quaternion,renderPosition=renderBodyPosition(body),renderQuaternion=renderBodyQuaternion(body);
      const p=new root.THREE.Vector3(transform.position.x,transform.position.y,transform.position.z),worldQ=new root.THREE.Quaternion(transform.quaternion.x,transform.quaternion.y,transform.quaternion.z,transform.quaternion.w);
      // RaycastVehicle publishes wheel transforms in the live physics-body
      // frame. The chassis is rendered from Cannon's interpolated frame, so
      // map the wheel's body-local pose into that same render frame before
      // parenting it back under the GLB. Otherwise interpolation reintroduces
      // a visible one-step chassis/wheel split even with the correct origin.
      if(currentPosition&&currentQuaternion&&renderPosition&&renderQuaternion){
        const currentP=new root.THREE.Vector3(currentPosition.x,currentPosition.y,currentPosition.z),renderP=new root.THREE.Vector3(renderPosition.x,renderPosition.y,renderPosition.z),inverseCurrentQ=new root.THREE.Quaternion(currentQuaternion.x,currentQuaternion.y,currentQuaternion.z,currentQuaternion.w).invert(),renderQ=new root.THREE.Quaternion(renderQuaternion.x,renderQuaternion.y,renderQuaternion.z,renderQuaternion.w);
        p.sub(currentP).applyQuaternion(inverseCurrentQ).applyQuaternion(renderQ).add(renderP);
        worldQ.premultiply(inverseCurrentQ).premultiply(renderQ).normalize();
      }
      node.parent.updateMatrixWorld&&node.parent.updateMatrixWorld(true);node.parent.worldToLocal(p);node.position.copy(p);
      const parentQ=node.parent.getWorldQuaternion(new root.THREE.Quaternion()).invert();node.quaternion.copy(parentQ.multiply(worldQ));
    } else if(node.rotation){const front=layout[index]&&layout[index].front,base=node.userData&&node.userData.sketchbookBaseRotation||{x:0,y:0,z:0};node.rotation.x=finite(base.x)+finite(wheel.rotation,0);if(front)node.rotation.y=finite(base.y)+pawn.steering;}
  });
  if(pawn.parts.steering)rotatePart(pawn.parts.steering,'z',-pawn.steering*2);
}

function flightInput(GAME,pawn){
  if(pawn&&pawn.damageRuntime&&pawn.damageRuntime.destroyed())return Object.assign(neutralInput(),{roll:0,pitch:0,yaw:0,collective:0});
  const input=readInput(GAME,pawn,'vehicle'),aux=auxiliaryCharacterInput(GAME,pawn),interaction=pawn.config.interaction||{},upstream=pawn.config.source&&pawn.config.source.upstreamControls||{};
  const controls=Object.assign({},pawn.config.tuning&&pawn.config.tuning.controls||{},pawn.config.controls||{}),helicopter=pawn.type==='helicopter';
  const throttleBinding=helicopter?(interaction.ascendKey||interaction.throttleKey||upstream.ascend||upstream.throttle):(interaction.throttleKey||upstream.throttle);
  const decelerateBinding=helicopter?(interaction.descendKey||interaction.decelerateKey||upstream.descend||upstream.decelerate):(interaction.decelerateKey||upstream.decelerate);
  const throttle=rawKeyboardDown(GAME,pawn,throttleBinding,'shift'),decelerate=rawKeyboardDown(GAME,pawn,decelerateBinding,'space');
  const pitch=rawPair(GAME,pawn,controls.elevator||controls.pitch||upstream.elevator||upstream.pitch,'w','s'),roll=rawPair(GAME,pawn,controls.aileron||controls.roll||upstream.aileron||upstream.roll,'a','d'),yaw=rawPair(GAME,pawn,controls.rudder||controls.yaw||upstream.rudder||upstream.yaw,'q','e');
  if(!(pawn.control&&('throttle' in pawn.control)))input.throttle=throttle==null?Math.max(finite(input.throttle),aux.sprint===true?1:0):(throttle?1:0);
  if(!(pawn.control&&('brake' in pawn.control)))input.brake=decelerate==null?Math.max(finite(input.brake),aux.reset===true?1:0):(decelerate?1:0);
  const explicit=pawn.control||{};
  input.roll=clamp(Object.prototype.hasOwnProperty.call(explicit,'roll')?finite(explicit.roll):(roll==null?finite(input.steer):roll),-1,1);
  input.pitch=clamp(Object.prototype.hasOwnProperty.call(explicit,'pitch')?finite(explicit.pitch):(pitch==null?(Math.abs(finite(input.cameraLookY))>.02?-finite(input.cameraLookY):finite(aux.brake)-finite(aux.throttle)):pitch),-1,1);
  input.yaw=clamp(Object.prototype.hasOwnProperty.call(explicit,'yaw')?finite(explicit.yaw):(yaw==null?(Math.abs(finite(input.cameraLookX))>.02?-finite(input.cameraLookX):(aux.leanRight?1:0)-(aux.leanLeft?1:0)):yaw),-1,1);
  input.collective=clamp(Object.prototype.hasOwnProperty.call(explicit,'collective')?finite(explicit.collective):finite(input.throttle)-finite(input.brake),-1,1);
  // Landing-gear braking is a first-class Vehicle action. Never sample raw B
  // (Radio Previous) or borrow R3/Camera Mode: those global actions must remain
  // independent even when an aircraft Pawn is possessed.
  input.wheelBrake=Object.prototype.hasOwnProperty.call(explicit,'wheelBrake')
    ? explicit.wheelBrake===true
    : input.wheelBrake===true;
  return input;
}
function airplaneBefore(pawn,dt){
  const input=flightInput(pawn.GAME,pawn),body=pawn.body,flight=pawn.config.flight,motion=localMotion(pawn),grounded=vehicleGrounded(pawn),occupied=!!(pawn.possessed||pawn.driverPawn||pawn.control);
  pawn.enginePower=clamp(pawn.enginePower+(occupied?finite(flight.spoolUp,.42):-finite(flight.spoolDown,.14))*dt,0,1);
  const frames=clamp(dt*60,0,6),forwardSpeed=motion.forwardSpeed,authority=clamp(forwardSpeed/10,0,1)*pawn.enginePower,authored=pawn.config.tuning||{},controls=authored.controls||{},aero=authored.aero||{};
  const baseMass=Math.max(.01,finite(authored.body&&authored.body.mass,50)),dynamicMass=baseMass*(1-clamp(forwardSpeed/10,0,1)*.6);
  if(Math.abs(body.mass-dynamicMass)>.01){body.mass=dynamicMass;body.updateMassProperties&&body.updateMassProperties();}
  const stabilization=sourceAlignmentEuler(motion.forward,body.velocity,.3),stabilizationInfluence=clamp(motion.speed-1,0,.1)*(grounded>0&&forwardSpeed<0?0:1),loopFix=input.throttle>.05&&forwardSpeed>0?0:1;
  if(stabilization){body.angularVelocity.x+=stabilization.x*stabilizationInfluence*loopFix*frames;body.angularVelocity.y+=stabilization.y*stabilizationInfluence*frames;body.angularVelocity.z+=stabilization.z*stabilizationInfluence*loopFix*frames;}
  body.angularVelocity.x+=motion.right.x*-input.pitch*finite(controls.pitchGain,.04)*authority*frames+motion.up.x*-input.yaw*finite(controls.yawGain,.02)*authority*frames+motion.forward.x*input.roll*finite(controls.rollGain,.055)*authority*frames;
  body.angularVelocity.y+=motion.right.y*-input.pitch*finite(controls.pitchGain,.04)*authority*frames+motion.up.y*-input.yaw*finite(controls.yawGain,.02)*authority*frames+motion.forward.y*input.roll*finite(controls.rollGain,.055)*authority*frames;
  body.angularVelocity.z+=motion.right.z*-input.pitch*finite(controls.pitchGain,.04)*authority*frames+motion.up.z*-input.yaw*finite(controls.yawGain,.02)*authority*frames+motion.forward.z*input.roll*finite(controls.rollGain,.055)*authority*frames;
  let speedModifier=.02;if(input.throttle>.05&&input.brake<=.05)speedModifier=.06*input.throttle;else if(input.brake>.05&&input.throttle<=.05)speedModifier=-.05*input.brake;else if(grounded>0)speedModifier=0;
  const thrust=(motion.speed*finite(pawn.lastDrag,0)+speedModifier)*pawn.enginePower*frames;body.velocity.x+=motion.forward.x*thrust;body.velocity.y+=motion.forward.y*thrust;body.velocity.z+=motion.forward.z*thrust;
  const aerodynamicSpeed=body.velocity.length(),drag=Math.max(0,aerodynamicSpeed*finite(aero.dragCoefficient,.003)*pawn.enginePower),dragScale=Math.pow(Math.max(0,1-drag),frames);body.velocity.scale(dragScale,body.velocity);pawn.lastDrag=drag;
  const lift=clamp(aerodynamicSpeed*finite(aero.liftCoefficient,.005)*pawn.enginePower,0,finite(aero.maximumLift,.05))*frames;body.velocity.x+=motion.up.x*lift;body.velocity.y+=motion.up.y*lift;body.velocity.z+=motion.up.z*lift;
  const angularScale=Math.pow(lerp(1,.98,clamp(forwardSpeed/10,0,1)),frames);body.angularVelocity.scale(angularScale,body.angularVelocity);
  if(pawn.vehicle)pawn.vehicle.wheelInfos.forEach((wheel,index)=>{pawn.vehicle.setSteeringValue(index===(pawn.vehicle.wheelInfos.length-1)?-input.yaw*.5:0,index);pawn.vehicle.setBrake(input.wheelBrake?finite(authored.brakes&&authored.brakes.wheelBrakeForce,100):0,index);});
  handleVehicleSeatSwitch(pawn);const interact=readConfiguredInteract(pawn.GAME,pawn,input);if(vehicleExitPressed(pawn,interact))pawn.requestExit();
  if(pawn.exitPending&&motion.speed<=finite(pawn.config.entry.maxExitSpeed,3.5))pawn.exitDriver();
  Object.assign(pawn.state,{speed:forwardSpeed,speedKmh:motion.speed*3.6,groundedWheels:grounded,steer:input.roll,throttle:input.throttle,gear:flight.gearDown===false?0:1,airborne:grounded===0,enginePower:pawn.enginePower,pitch:input.pitch,yaw:input.yaw,roll:input.roll});
  spinParts(pawn.parts.rotors,dt,pawn.enginePower*60);pawn.controlSurfaces={aileron:input.roll*.7,elevator:input.pitch*.7,rudder:input.yaw*.7};
}
function helicopterBefore(pawn,dt){
  const input=flightInput(pawn.GAME,pawn),body=pawn.body,flight=pawn.config.flight,motion=localMotion(pawn),occupied=!!(pawn.possessed||pawn.driverPawn||pawn.control),authored=pawn.config.tuning||{},sourceFlight=authored.flight||{},sourceRotor=authored.rotor||{},frames=clamp(dt*60,0,6);
  pawn.enginePower=clamp(pawn.enginePower+(occupied?finite(sourceRotor.spoolUp,finite(flight.spoolUp,.2)):-finite(sourceRotor.spoolDown,finite(flight.spoolDown,.06)))*dt,0,1);
  const gravity=pawn.world&&pawn.world.gravity?Math.abs(finite(pawn.world.gravity.y,-9.82)):9.82,upDot=clamp(motion.up.y,0,1),thrust=finite(sourceFlight.thrust,.15),gravityCompensation=finite(sourceFlight.gravityCompensation,.98),verticalDamping=finite(sourceFlight.verticalDamping,.01),horizontalMultiplier=clamp(finite(sourceFlight.horizontalDamping,.995),0,1),rotationGain=finite(sourceFlight.rotationGain,.07),angularMultiplier=clamp(finite(sourceFlight.angularDamping,.97),0,1);
  const supported=helicopterSupported(pawn),takeoff=input.collective>.08;
  // A spooled rotor normally cancels almost all gravity. On the skids that
  // leaves the contact solver with no steady load and every tiny penetration is
  // returned as another launch impulse. While the pilot is neutral/descending,
  // keep the chassis planted, remove upward solver rebound and damp only the
  // landing axes. Positive collective immediately releases this gate, so it
  // cannot make take-off sluggish or cap flight controls.
  if(supported&&!takeoff){
    if(body.velocity.y>0)body.velocity.y*=Math.pow(.08,frames);
    else body.velocity.y*=Math.pow(.55,frames);
    const skidScale=Math.pow(.72,frames);body.velocity.x*=skidScale;body.velocity.z*=skidScale;
    body.angularVelocity.x*=Math.pow(.18,frames);body.angularVelocity.z*=Math.pow(.18,frames);
  }
  const collective=input.collective*thrust*pawn.enginePower*frames;body.velocity.x+=motion.up.x*collective;body.velocity.y+=motion.up.y*collective;body.velocity.z+=motion.up.z*collective;
  const groundHover=supported&&!takeoff?0:1,hover=gravity/60*gravityCompensation*Math.sqrt(upDot)*pawn.enginePower*frames*groundHover;body.velocity.x+=motion.up.x*hover;body.velocity.y+=motion.up.y*hover-body.velocity.y*verticalDamping*pawn.enginePower*frames;body.velocity.z+=motion.up.z*hover;
  const horizontalScale=Math.pow(lerp(1,horizontalMultiplier,pawn.enginePower),frames);body.velocity.x*=horizontalScale;body.velocity.z*=horizontalScale;
  if(occupied){const level=sourceAlignmentEuler(motion.up,{x:0,y:1,z:0},finite(sourceFlight.autoLevel,.3));if(level){body.angularVelocity.x+=level.x*pawn.enginePower*frames;body.angularVelocity.y+=level.y*pawn.enginePower*frames;body.angularVelocity.z+=level.z*pawn.enginePower*frames;}}
  body.angularVelocity.x+=(motion.right.x*-input.pitch+motion.up.x*-input.yaw+motion.forward.x*input.roll)*rotationGain*pawn.enginePower*frames;
  body.angularVelocity.y+=(motion.right.y*-input.pitch+motion.up.y*-input.yaw+motion.forward.y*input.roll)*rotationGain*pawn.enginePower*frames;
  body.angularVelocity.z+=(motion.right.z*-input.pitch+motion.up.z*-input.yaw+motion.forward.z*input.roll)*rotationGain*pawn.enginePower*frames;
  const angularScale=Math.pow(angularMultiplier,frames);body.angularVelocity.scale(angularScale,body.angularVelocity);
  handleVehicleSeatSwitch(pawn);const interact=readConfiguredInteract(pawn.GAME,pawn,input);if(vehicleExitPressed(pawn,interact))pawn.requestExit();
  if(pawn.exitPending&&motion.speed<=finite(pawn.config.entry.maxExitSpeed,3.5))pawn.exitDriver();
  Object.assign(pawn.state,{speed:motion.forwardSpeed,speedKmh:motion.speed*3.6,groundedWheels:supported?1:0,steer:input.roll,throttle:Math.max(0,input.collective),airborne:!supported,enginePower:pawn.enginePower,pitch:input.pitch,yaw:input.yaw,roll:input.roll});
  spinParts(pawn.parts.rotors,dt,pawn.enginePower*30);
}
function isStaticHelicopterSupport(body,contact){
  if(!body||!contact||contact.bi!==body&&contact.bj!==body)return false;
  const other=contact.bi===body?contact.bj:contact.bi,normal=contact.ni;
  return !!(other&&finite(other.mass,0)===0&&normal&&Math.abs(finite(normal.y,0))>.55);
}
function helicopterSupported(pawn){
  const body=pawn&&pawn.body,world=pawn&&pawn.world;if(!body||!world)return false;
  const supported=pawn.helicopterSupportContact===true||(world.contacts||[]).some(contact=>isStaticHelicopterSupport(body,contact));
  pawn.helicopterSupportContact=false;
  return supported;
}
function settleParkedHelicopter(pawn){
  const body=pawn&&pawn.body,world=pawn&&pawn.world;
  if(!body||!world||pawn.possessed||pawn.driverPawn||pawn.control||pawn.enginePower>.001){if(pawn)pawn.parkedSupportContact=false;return false;}
  const supported=pawn.parkedSupportContact===true||(world.contacts||[]).some(contact=>isStaticHelicopterSupport(body,contact));
  if(!supported)return false;
  pawn.parkedSupportContact=false;
  // A cold, unoccupied helicopter is a parked prop, not an active flight
  // controller. Once its skids have made static support contact, discard the
  // solver remainder and sleep immediately; waiting for the rebound speed to
  // become "small" lets a tall chassis keep hopping indefinitely on complex
  // imported road colliders.
  body.velocity.set(0,0,0);body.angularVelocity.set(0,0,0);body.force.set(0,0,0);body.torque.set(0,0,0);syncBodyInterpolation(body);
  body.allowSleep=true;if(body.sleep)body.sleep();
  if(pawn.state)pawn.state.airborne=false;
  return true;
}
function vehicleAfter(pawn,dt){
  if(!pawn.body||!pawn.owner)return;const body=pawn.body,position=renderBodyPosition(body),rotation=renderBodyQuaternion(body);
  setOwnerWorldTransform(pawn.owner,{x:position.x,y:position.y-finite(pawn.physicsOriginY,vehiclePhysicsOriginY(pawn,pawn.config.collision)),z:position.z},rotation);
  pawn.owner.updateMatrixWorld&&pawn.owner.updateMatrixWorld(true);syncWheels(pawn,dt);
  updateSeatDoors(pawn,dt);(pawn.parts.seats||[]).forEach(seat=>{if(seat.occupiedBy&&!(seat.occupiedBy.entryTransition&&seat.occupiedBy.entryTransition.phase==='exit'))syncSeatOccupant(seat.occupiedBy);});
  // A control surface hinges about its SPAN, not about a fixed local Y: rotating
  // an aileron about Y sweeps it fore and aft in the plane of the wing instead
  // of raising and lowering the flap. Ailerons also deflect in opposite
  // directions, which is what makes an aircraft roll - the side comes from the
  // rig's own `side` extra or from which half of the wing the surface sits on,
  // never from its position in the scan order, which is not left-then-right.
  const controls=pawn.controlSurfaces||{};
  (pawn.parts.ailerons||[]).forEach(node=>rotatePart(node,hingeAxis(node),finite(controls.aileron)*surfaceSideSign(pawn.owner,node)));
  (pawn.parts.elevators||[]).forEach(node=>rotatePart(node,hingeAxis(node),finite(controls.elevator)));
  (pawn.parts.rudders||[]).forEach(node=>rotatePart(node,hingeAxis(node),finite(controls.rudder)));
  if(pawn.type==='helicopter')settleParkedHelicopter(pawn);
}

function safeExitPosition(vehicle,character){
  const CANNON=root.CANNON,body=vehicle.body,world=vehicle.world,offset=Math.max(.8,finite(vehicle.config.entry.exitOffset,1.65)),seat=character&&character.occupyingSeat,points=[];
  const collision=character&&character.config&&character.config.collision||{},radius=Math.max(.1,finite(collision.radius,.25)),feet=Math.max(radius,finite(collision.height,.5)*.5+radius),bodyY=finite(vehicle.physicsOriginY,vehiclePhysicsOriginY(vehicle,vehicle.config&&vehicle.config.collision));
  (seat&&seat.entryPoints||[]).forEach(node=>{const p=ownerWorldPosition(node);points.push({x:p.x,y:p.y+feet,z:p.z});});
  if(body&&CANNON)[[offset,0,0],[-offset,0,0],[0,0,-offset],[0,0,offset]].forEach(local=>{const delta=worldVector(CANNON,body,local[0],0,local[2]);points.push({x:body.position.x+delta.x,y:body.position.y-bodyY+feet,z:body.position.z+delta.z});});
  if(!points.length){const p=body&&body.position||ownerWorldPosition(vehicle.owner);points.push({x:p.x+offset,y:p.y-bodyY+feet,z:p.z});}
  for(let i=0;i<points.length;i++){
    const point=points[i],bottom=point.y-feet,top=point.y+feet;
    const blocked=world&&Array.isArray(world.bodies)&&world.bodies.some(other=>{
      if(!other||other===body||other===character.body)return false;
      const shapes=other.shapes||[],isPlane=!!(CANNON&&CANNON.Plane&&shapes.some(shape=>shape instanceof CANNON.Plane));if(isPlane)return false;
      try{if(other.computeAABB&&(other.aabbNeedsUpdate||!other.aabb))other.computeAABB();}catch(err){}
      const bounds=other.aabb;if(bounds&&bounds.lowerBound&&bounds.upperBound){
        return bounds.upperBound.x>point.x-radius&&bounds.lowerBound.x<point.x+radius&&bounds.upperBound.z>point.z-radius&&bounds.lowerBound.z<point.z+radius&&bounds.upperBound.y>bottom+.08&&bounds.lowerBound.y<top;
      }
      const reach=Math.max(radius,finite(other.boundingRadius,.5));return Math.hypot(finite(other.position&&other.position.x)-point.x,finite(other.position&&other.position.z)-point.z)<radius+reach&&Math.abs(finite(other.position&&other.position.y)-point.y)<feet+reach;
    });
    if(!blocked)return point;
  }
  return points[0];
}
function ensureVehicleSeats(vehicle){
  const occupancy=root.LK_RUNTIME_VEHICLE_OCCUPANCY;
  if(occupancy){
    const seats=occupancy.seatsOf(vehicle);
    if(seats.length){
      // Keep the Sketchbook parts view and the shared contract pointing at the
      // same records, so occupancy written by either side is visible to both.
      if(vehicle.parts&&Array.isArray(vehicle.parts.seats)&&vehicle.parts.seats!==seats&&!vehicle.parts.seats.length)vehicle.parts.seats=seats;
      return seats;
    }
  }
  if(!vehicle.parts)vehicle.parts={seats:[]};
  if(!Array.isArray(vehicle.parts.seats))vehicle.parts.seats=[];
  if(!vehicle.parts.seats.length)vehicle.parts.seats.push({id:'synthetic-driver',name:'synthetic-driver',type:'driver',node:vehicle.owner,connectedNames:[],connected:[],entryPoints:[],occupiedBy:null,reservedBy:null,door:null,synthetic:true});
  return vehicle.parts.seats;
}

function nearestAvailableSeat(vehicle,character,role){
  const here=character.body&&character.body.position||ownerWorldPosition(character.owner),wanted=role==='passenger'?'passenger':'driver';let nearest=null,best=Infinity;
  ensureVehicleSeats(vehicle).forEach(seat=>{if(!seat||seat.occupiedBy||seat.reservedBy&&seat.reservedBy!==character||seat.type!==wanted)return;const p=ownerWorldPosition(seat.node||vehicle.owner),dx=p.x-here.x,dy=p.y-here.y,dz=p.z-here.z,d2=dx*dx+dy*dy+dz*dz;if(d2<best){best=d2;nearest=seat;}});return nearest;
}
function installEntryExit(pawn){
  pawn.tryEnterNearestVehicle=function(role){
    if(this.type!=='advanced-character'||this.inVehicle||this.config.entry.enabled===false||!this.GAME.pawns||!this.GAME.pawns.list)return false;
    role=role==='passenger'?'passenger':'driver';if(role==='passenger'&&this.config.interaction&&this.config.interaction.passengerEntryEnabled===false)return false;const here=this.body?this.body.position:ownerWorldPosition(this.owner),characterRadius=Math.max(.5,finite(this.config.entry.radius,3));let nearest=null,best=Infinity;
    this.GAME.pawns.list().forEach(candidate=>{
      // Any vehicle that offers a seat is boardable, whatever runtime drives
      // it: Sketchbook, the native player car, or a Logic Vehicle Pawn. Each
      // keeps its own physics; only the seat contract is shared.
      // Without the shared contract loaded, fall back to the Sketchbook-only
      // test rather than making every vehicle unenterable.
      const occupancy=root.LK_RUNTIME_VEHICLE_OCCUPANCY;
      const boardable=occupancy?occupancy.isEnterable(candidate)
        :(/^sketchbook-(?:car|airplane|helicopter)$/.test(String(candidate&&candidate.pawnType||''))&&candidate.enabled!==false&&!(candidate.config&&candidate.config.entry&&candidate.config.entry.enabled===false));
      if(!candidate||candidate===this||!boardable||role==='passenger'&&candidate.config&&candidate.config.interaction&&candidate.config.interaction.passengerEntryEnabled===false||(role==='driver'&&candidate.driverPawn))return;
      candidate.prepareRuntime&&candidate.prepareRuntime();if(candidate.assetHydrationState==='pending')return;const seat=nearestAvailableSeat(candidate,this,role);if(!seat)return;const there=ownerWorldPosition(seat.node||candidate.owner),dx=there.x-here.x,dy=there.y-here.y,dz=there.z-here.z,d2=dx*dx+dy*dy+dz*dz,vehicleRadius=Math.max(.5,finite(candidate.config&&candidate.config.entry&&candidate.config.entry.radius,characterRadius)),limit=Math.max(characterRadius,vehicleRadius);if(d2<=limit*limit&&d2<best){best=d2;nearest={vehicle:candidate,seat};}
    });
    if(!nearest)return false;const choreography=this.config.entry&&this.config.entry.choreography||{};return choreography.enabled===false?this.enterVehicle(nearest.vehicle,role,nearest.seat):beginEntryChoreography(this,nearest.vehicle,role,nearest.seat);
  };
  pawn.enterVehicle=function(vehicle,role,seat,options){
    role=role==='passenger'?'passenger':'driver';options=options||{};if(this.type!=='advanced-character'||!vehicle||this.entryCooldown>0&&options.transition!==true)return false;const playerId=this.playerId;if(playerId==null)return false;
    seat=seat||nearestAvailableSeat(vehicle,this,role);if(!seat||seat.occupiedBy||seat.reservedBy&&seat.reservedBy!==this||(role==='driver'&&vehicle.driverPawn))return false;seat.reservedBy=null;seat.occupiedBy=this;
    if(role==='driver'){
      this.possessCamera(false);this.unpossess();if(!vehicle.possess(playerId,true)){seat.occupiedBy=null;this.possess(playerId,true);this.possessCamera(true);return false;}vehicle.driverPawn=this;vehicle.possessCamera(true);
    }
    this.inVehicle=vehicle;this.occupyingSeat=seat;this.runtimeHidden=true;if(this.owner){this.previousOwnerVisible=this.owner.visible;this.owner.visible=false;}removeBody(this);syncSeatOccupant(this);animateSeatDoor(vehicle,seat,true,.8);
    const occupancy=root.LK_RUNTIME_VEHICLE_OCCUPANCY;if(occupancy&&occupancy.requireExitInputRelease)occupancy.requireExitInputRelease(vehicle);
    this.entryCooldown=vehicle.entryCooldown=Math.max(.1,finite(vehicle.config&&vehicle.config.entry&&vehicle.config.entry.cooldown,finite(this.config.entry.cooldown,.65)));emit(this,'OnCharacterEnteredVehicle',{vehicle,seat:seat.name,role});emit(vehicle,role==='driver'?'OnVehicleDriverEntered':'OnVehiclePassengerEntered',{character:this,seat:seat.name});return true;
  };
  pawn.switchSeat=function(){
    if(this.type!=='advanced-character'||!this.inVehicle||!this.occupyingSeat||this.entryCooldown>0||this.config.interaction&&this.config.interaction.seatSwitchEnabled===false||this.inVehicle.config.interaction&&this.inVehicle.config.interaction.seatSwitchEnabled===false)return false;const vehicle=this.inVehicle,current=this.occupyingSeat,seats=ensureVehicleSeats(vehicle),candidates=(current.connected||[]).concat(seats.filter(seat=>!(current.connected||[]).includes(seat))),available=seat=>seat&&seat!==current&&!seat.occupiedBy&&!seat.reservedBy,target=candidates.find(seat=>available(seat)&&seat.type!==current.type)||candidates.find(available);
    if(!target||target.type==='driver'&&vehicle.driverPawn&&vehicle.driverPawn!==this)return false;const fromRole=current.type,toRole=target.type,playerId=fromRole==='driver'?vehicle.playerId:this.playerId;
    if(toRole==='driver'&&fromRole!=='driver'){
      this.possessCamera(false);this.unpossess();if(!vehicle.possess(playerId,true)){this.possess(playerId,true);this.possessCamera(true);return false;}vehicle.driverPawn=this;vehicle.possessCamera(true);
    } else if(fromRole==='driver'&&toRole!=='driver'){
      vehicle.possessCamera(false);vehicle.unpossess();vehicle.driverPawn=null;if(!this.possess(playerId,true)){if(vehicle.possess(playerId,true)){vehicle.driverPawn=this;vehicle.possessCamera(true);}return false;}this.possessCamera(true);
    }
    current.occupiedBy=null;target.occupiedBy=this;this.occupyingSeat=target;this.inputEdges.seatSwitch=true;vehicle.inputEdges.seatSwitch=true;syncSeatOccupant(this);emit(this,'OnCharacterSeatChanged',{vehicle,from:current.name,to:target.name,role:toRole});emit(vehicle,'OnVehicleSeatChanged',{character:this,from:current.name,to:target.name,role:toRole});return true;
  };
  pawn.requestExit=function(){
    if(this.type==='advanced-character'||!this.driverPawn||this.entryCooldown>0||this.config.entry.enabled===false)return false;const speed=this.body?this.body.velocity.length():0,max=finite(this.config.entry.maxExitSpeed,3.5);
    // Engine Characters own the physical dismount policy: they may deliberately
    // leave at speed because their own roll, damage, free-fall and ragdoll
    // systems resolve the consequence. The older Sketchbook character keeps its
    // conservative speed gate until it gains that complete survival contract.
    if(root.LK_RUNTIME_CHARACTER_VEHICLE_DISMOUNT&&typeof this.driverPawn.exitVehicle==='function')return this.driverPawn.exitVehicle(false);
    if(speed>max&&!(this.config.entry.allowAirExit===true&&(this.type==='airplane'||this.type==='helicopter'))){this.exitPending=true;return false;}
    return this.driverPawn.exitSeat(false);
  };
  pawn.exitSeat=function(force,preparedPosition){
    if(this.type!=='advanced-character'||!this.inVehicle||!this.occupyingSeat||(!force&&this.entryCooldown>0))return false;const vehicle=this.inVehicle,seat=this.occupyingSeat,driver=seat.type==='driver',speed=vehicle.body&&vehicle.body.velocity?vehicle.body.velocity.length():0,max=finite(vehicle.config.entry.maxExitSpeed,3.5);
    if(!force&&speed>max&&!(vehicle.config.entry.allowAirExit===true&&(vehicle.type==='airplane'||vehicle.type==='helicopter'))){if(driver)vehicle.exitPending=true;return false;}
    if(!force&&this.config.entry&&this.config.entry.choreography&&this.config.entry.choreography.enabled!==false)return beginExitChoreography(this,vehicle,seat);
    const playerId=driver?vehicle.playerId:this.playerId,position=preparedPosition||safeExitPosition(vehicle,this),velocity=vehicle.body&&vehicle.body.velocity,inherit=!(vehicle.config.interaction&&vehicle.config.interaction.inheritExitVelocity===false);   // default ON: `a&&a.x!==false` is falsy when there is no interaction block at all, so a vehicle that authored none never handed its velocity over
    if(driver){vehicle.possessCamera(false);vehicle.unpossess();vehicle.driverPawn=null;}seat.occupiedBy=null;vehicle.exitPending=false;this.inVehicle=null;this.occupyingSeat=null;this.runtimeHidden=false;animateSeatDoor(vehicle,seat,true,1);
    restoreBody(this);if(this.body){this.body.position.set(position.x,position.y,position.z);syncBodyInterpolation(this.body);this.body.velocity.set(inherit?finite(velocity&&velocity.x):0,inherit?finite(velocity&&velocity.y):0,inherit?finite(velocity&&velocity.z):0);if(inherit&&vehicle.body){const awayX=position.x-vehicle.body.position.x,awayZ=position.z-vehicle.body.position.z,length=Math.hypot(awayX,awayZ)||1;this.body.velocity.x+=awayX/length*1.2;this.body.velocity.z+=awayZ/length*1.2;}}
    // Ground grace is intentionally frozen while seated. It refers to the
    // pre-entry floor and must never pull the restored capsule toward that old
    // height. Publish the exit pose before making the owner/camera visible so
    // no frame renders the hidden seat transform as a second character.
    this.groundGrace=0;this.jumpGrace=0;this.groundSupport=null;this.groundHit=null;this.state.grounded=false;this.state.locomotion='idle';
    // Stepping out of something that is still moving is a roll, not a stand. The
    // exit already inherits the vehicle's velocity; this makes the body agree
    // with it instead of sliding upright at driving speed.
    const exitSpeed=Math.hypot(finite(this.body&&this.body.velocity&&this.body.velocity.x,0),finite(this.body&&this.body.velocity&&this.body.velocity.z,0));
    if(inherit&&exitSpeed>=EXIT_ROLL_SPEED)beginCharacterRoll(this,{reason:'vehicle-exit',dirX:this.body.velocity.x,dirZ:this.body.velocity.z,speed:exitSpeed});
    characterAfter(this);
    if(this.owner)this.owner.visible=this.previousOwnerVisible!==false;if(driver)this.possess(playerId,true);this.possessCamera(true);this.entryCooldown=vehicle.entryCooldown=Math.max(.1,finite(vehicle.config&&vehicle.config.entry&&vehicle.config.entry.cooldown,finite(this.config.entry.cooldown,.65)));emit(vehicle,driver?'OnVehicleDriverExited':'OnVehiclePassengerExited',{character:this,seat:seat.name});emit(this,'OnCharacterExitedVehicle',{vehicle,seat:seat.name,role:driver?'driver':'passenger'});return true;
  };
  pawn.exitDriver=function(force){
    const vehicle=this.type==='advanced-character'?this.inVehicle:this,character=vehicle&&vehicle.driverPawn;return !!(character&&character.exitSeat(force===true));
  };
}

function fallbackRecord(id,cfg,registry){
  const pawn={id,kind:'logic-element',config:cfg,state:{},enabled:cfg.enabled,hidden:cfg.hidden,possessed:cfg.possessed,playerId:cfg.playerId,started:false,sleeping:false,disposed:false};
  pawn.possess=function(playerId,force){return registry.claimPlayerSlot?registry.claimPlayerSlot(this,playerId,force):false;};
  pawn.unpossess=function(){if(registry.releasePlayerSlot)registry.releasePlayerSlot(this);this.playerId=null;this.possessed=false;return true;};
  return pawn;
}
function createLogic(GAME,owner,source,services){
  if(!GAME||!owner)return null;const registry=GAME.pawns;if(!registry||!registry.register)return null;
  const existingId=owner.userData&&owner.userData.sketchbookPawnId;if(existingId&&registry.get&&registry.get(existingId))return registry.get(existingId);
  const cfg=normalizeConfig(source),position=ownerWorldPosition(owner);
  const emptySpawn=cfg.spawn.x===0&&cfg.spawn.y===0&&cfg.spawn.z===0,localInstanceSpawn=!!(owner.parent&&spawnMatchesOwnerLocal(cfg.spawn,owner));
  // Logic services derive an un-overridden instance spawn from owner.position,
  // which is local to its level/group. Cannon and render synchronization use
  // world coordinates. Treat only that exact implicit value as local; authored
  // spawn overrides remain absolute. Without this conversion an offset/scaled
  // level parent produces an error proportional to distance from world origin.
  if(emptySpawn||localInstanceSpawn)cfg.spawn={x:finite(position.x),y:finite(position.y),z:finite(position.z),heading:ownerWorldHeading(owner,cfg.spawn.heading)};
  let preferred=String(owner.userData&&(owner.userData.logicInstanceId||owner.userData.editorId)||cfg.id||('sketchbook-'+cfg.type+'-'+nextPawnId++));
  while(registry.get&&registry.get(preferred))preferred+='-'+nextPawnId++;
  const core=root.LK_RUNTIME_PAWN_CORE&&root.LK_RUNTIME_PAWN_CORE.install?root.LK_RUNTIME_PAWN_CORE.install(GAME):null;
  const pawn=core&&core.createRecord?core.createRecord({id:preferred,kind:'logic-element',config:cfg,state:{},
    onPossess:(record,playerId,force)=>registry.claimPlayerSlot?registry.claimPlayerSlot(record,playerId,force):false,
    onUnpossess:record=>{const playerId=record.playerId;if(registry.releasePlayerSlot)registry.releasePlayerSlot(record);record.playerId=null;record.possessed=false;if(playerId!=null)emit(record,'OnPawnUnpossessed',{playerId});return true;}}):fallbackRecord(preferred,cfg,registry);
  pawn.GAME=GAME;pawn.owner=owner;pawn.services=services||{};pawn.type=cfg.type;pawn.pawnType='sketchbook-'+cfg.type;pawn.control=null;pawn.body=null;pawn.vehicle=null;pawn.world=null;
  pawn.engineAudioController=cfg.type!=='advanced-character'&&root.LK_RUNTIME_VEHICLE_ENGINE_AUDIO?root.LK_RUNTIME_VEHICLE_ENGINE_AUDIO.create(GAME,pawn):null;
  pawn.setEngineAudio=function(patch){return this.engineAudioController?this.engineAudioController.configure(patch):(this.config.engineAudio=Object.assign({},this.config.engineAudio||{},patch||{}));};
  pawn.engineAudioStatus=function(){return this.engineAudioController?this.engineAudioController.status():{ready:false,kind:null,setId:this.config.engineAudio&&this.config.engineAudio.setId||null,active:false};};
  pawn.physicsReady=false;pawn.bodyInWorld=false;pawn.parts=scanSourceParts(pawn);pawn.assetHydrationSource=null;pawn.assetHydrationReady=null;pawn.assetHydrationState='ready';pawn.assetHydrationError=null;pawn.runtimePrepareRequested=false;pawn.inputEdges={jump:false,interact:false,passenger:false,seatSwitch:false,dodge:false};pawn.entryCooldown=0;pawn.entryTransition=null;pawn.groundGrace=0;pawn.jumpGrace=0;pawn.groundSupport=null;pawn.shiftTimer=0;pawn.steering=0;pawn.airTime=0;pawn.enginePower=0;pawn.occupyingSeat=null;pawn.state={
    speed:0,speedKmh:0,gear:cfg.type==='car'?1:0,reverse:false,drift:false,grounded:cfg.type==='advanced-character',airborne:false,locomotion:'idle',
    steer:0,throttle:0,brake:0,handbrake:false,rpm:900,enginePower:0,pitch:0,yaw:0,roll:0,heading:cfg.spawn.heading,
  };
  const coordinator=createCoordinator(GAME);coordinator.register(pawn);owner.userData=owner.userData||{};owner.userData.sketchbookPawnId=pawn.id;owner.userData.sketchbookSource=SOURCE;
  owner.visible=cfg.hidden!==true;
  pawn.setControl=function(input){this.control=Object.assign({},input||{});setDrivenBodyAwake(this,true);return this.control;};pawn.clearControl=function(){this.control=null;setDrivenBodyAwake(this,!!(this.possessed||this.driverPawn));};
  pawn.setHidden=function(value){this.hidden=value===true;this.config.hidden=this.hidden;if(this.owner&&!this.runtimeHidden)this.owner.visible=!this.hidden;return this.hidden;};
  pawn.setEnabled=function(value){this.enabled=value!==false;this.config.enabled=this.enabled;if(!this.enabled)this.possessCamera(false);else if(this.possessed&&this.started)this.possessCamera(true);return this.enabled;};
  pawn.rebuildPhysics=function(){
    const previousOrigin=finite(this.physicsOriginY,vehiclePhysicsOriginY(this,this.config.collision)),snapshot=this.body?{position:vec(this.body.position),quaternion:quaternion(this.body.quaternion),velocity:vec(this.body.velocity),angularVelocity:vec(this.body.angularVelocity)}:null;
    removeBody(this);this.body=null;this.vehicle=null;this.world=null;this.physicsReady=false;if(!makeBody(this))return false;
    if(snapshot&&this.body){
      // Asset hydration replaces the primitive fallback origin with the GLB's
      // bottom-aligned metadata origin. Preserve the rendered root, not the old
      // body centre, or the chassis is lifted by bodyY and its wheels lose the
      // ground as soon as Play finishes loading the asset.
      const originDelta=finite(this.physicsOriginY)-previousOrigin;
      this.body.position.set(snapshot.position.x,snapshot.position.y+originDelta,snapshot.position.z);this.body.quaternion.set(snapshot.quaternion.x,snapshot.quaternion.y,snapshot.quaternion.z,snapshot.quaternion.w);syncBodyInterpolation(this.body);this.body.velocity.set(snapshot.velocity.x,snapshot.velocity.y,snapshot.velocity.z);this.body.angularVelocity.set(snapshot.angularVelocity.x,snapshot.angularVelocity.y,snapshot.angularVelocity.z);
    }
    if(this.inVehicle)removeBody(this);
    return true;
  };
  pawn.possessCamera=function(value){
    if(!GAME.state)return false;const outputs=GAME.state.runtimeVehicleCameraPawnIds||(GAME.state.runtimeVehicleCameraPawnIds={});
    if(value===false){Object.keys(outputs).forEach(key=>{if(outputs[key]===this.id)delete outputs[key];});if(GAME.state.runtimeVehicleCameraPawnId===this.id)GAME.state.runtimeVehicleCameraPawnId=null;return true;}
    const playerId=normalizePlayerId(this.playerId);if(playerId==null)return false;outputs[playerId]=this.id;if(playerId===1)GAME.state.runtimeVehicleCameraPawnId=this.id;
    if(this.type==='advanced-character')this.cameraSnapRequested=true;
    return true;
  };
  const basePossess=pawn.possess.bind(pawn),baseUnpossess=pawn.unpossess.bind(pawn);
  pawn.possess=function(playerId,force){
    const normalized=normalizePlayerId(playerId),previous=normalized!=null&&registry.getByPlayerId?registry.getByPlayerId(normalized):null,claimed=basePossess(normalized,force);
    if(!claimed)return false;setDrivenBodyAwake(this,true);if(previous&&previous!==this&&previous.possessCamera)previous.possessCamera(false);if(this.started&&this.enabled!==false)this.possessCamera(true);return true;
  };
  pawn.unpossess=function(){this.possessCamera(false);const released=baseUnpossess();setDrivenBodyAwake(this,!!(this.control||this.driverPawn));return released;};
  pawn.applyBinding=function(path,value){
    const key=String(path||'');if(!key)return false;setPath(this.config,key,value);this.config=normalizeConfig(this.config);this.type=this.config.type;this.pawnType='sketchbook-'+this.type;
    if(key==='enabled')this.setEnabled(value);else if(key==='hidden')this.setHidden(value);else if(key==='playerId'){if(value==null||Number(value)<1)this.unpossess();else this.possess(value,true);}
    else if(key==='possessed'){if(value===false)this.unpossess();else this.possess(this.config.playerId||(registry.firstAvailablePlayerId&&registry.firstAvailablePlayerId())||1,false);}
    else if(/^spawn\./.test(key)&&this.body)this.reset();
    else if(/^(?:kind|type|collision\.|wheels(?:\.|$)|suspension\.|tuning\.(?:body|chassis|collider|wheels))/.test(key)&&this.physicsReady)this.rebuildPhysics();
    return true;
  };
  function preparationStatus(record){return {pawnId:record.id,type:record.type,physics:record.physicsReady?'cannon':'arcade-fallback',source:SOURCE,assetHydration:record.assetHydrationState,assetError:record.assetHydrationError&&String(record.assetHydrationError.message||record.assetHydrationError)||null};}
  function watchOwnerAssetHydration(record){
    const ready=record.owner&&record.owner.userData&&record.owner.userData.logicGraph&&record.owner.userData.logicGraph.sketchbookPawn&&record.owner.userData.logicElementAssetReady;
    if(!ready||typeof ready.then!=='function'||ready===record.assetHydrationSource)return null;
    record.assetHydrationSource=ready;record.assetHydrationState='pending';record.assetHydrationError=null;
    record.assetHydrationReady=Promise.resolve(ready).then(()=>{
      if(record.disposed||record.assetHydrationSource!==ready)return preparationStatus(record);
      const rebuild=record.physicsReady;record.parts=scanSourceParts(record);record.assetHydrationState='ready';if(record.damageRuntime&&record.damageRuntime.refreshAnchors)record.damageRuntime.refreshAnchors();
      if(record.runtimePrepareRequested){if(rebuild&&record.rebuildPhysics)record.rebuildPhysics();else if(!record.physicsReady)makeBody(record);}
      return preparationStatus(record);
    },error=>{if(record.assetHydrationSource===ready){record.assetHydrationState='failed';record.assetHydrationError=error;}return preparationStatus(record);});
    return record.assetHydrationReady;
  }
  pawn.prepareRuntime=function(){
    if(this.disposed)return false;this.runtimePrepareRequested=true;const pending=watchOwnerAssetHydration(this);
    const finish=async()=>{
      if(this.assetHydrationState!=='failed'&&!this.physicsReady){const scanned=scanSourceParts(this);if(scanned.wheels.length||scanned.rotors.length||scanned.colliders.length||scanned.seats.length)this.parts=scanned;makeBody(this);}
      const audio=this.engineAudioController&&this.engineAudioController.prewarm?await this.engineAudioController.prewarm():null;
      const damage=this.damageRuntime&&this.damageRuntime.prewarm?this.damageRuntime.prewarm():null;
      if(this.type!=='advanced-character'){
        if(!this.raycastActuator&&root.LK_RUNTIME_VEHICLE_RAYCAST_ACTUATOR)this.raycastActuator=root.LK_RUNTIME_VEHICLE_RAYCAST_ACTUATOR.create();
        if(!this.visualController&&root.LK_RUNTIME_VEHICLE_VISUAL_CONTROLLER)this.visualController=root.LK_RUNTIME_VEHICLE_VISUAL_CONTROLLER.create();
      }
      return Object.assign(preparationStatus(this),{audio,damage,steering:!!this.raycastActuator,wheelVisuals:!!this.visualController,seats:this.parts&&this.parts.seats?this.parts.seats.length:0});
    };
    if(pending||this.assetHydrationState==='pending')return Promise.resolve(pending||this.assetHydrationReady).then(finish);
    return finish();
  };
  pawn.start=function(){this.started=true;this.sleeping=false;this.prepareRuntime();if(this.possessed)this.possessCamera(true);return this;};
  pawn.beforePhysics=function(dt){
    this.entryCooldown=Math.max(0,this.entryCooldown-dt);if(!this.physicsReady)return;
    if(this.type!=='advanced-character')setDrivenBodyAwake(this,!!(this.possessed||this.driverPawn||this.control));
    if(this.type==='advanced-character')characterBefore(this,dt);else if(this.type==='car')carBefore(this,dt);else if(this.type==='airplane')airplaneBefore(this,dt);else helicopterBefore(this,dt);
  };
  pawn.afterPhysics=function(dt){if(this.type==='advanced-character')characterAfter(this,dt);else {vehicleAfter(this,dt);if(this.engineAudioController)this.engineAudioController.update(dt);}};
  pawn.stepArcade=function(dt){
    if(this.entryTransition){advanceEntryTransition(this,dt);return;}
    if(this.inVehicle){syncSeatOccupant(this);return;}
    const input=readInput(GAME,this,this.type==='advanced-character'?'character':'vehicle'),speed=(this.type==='advanced-character'?finite(this.config.movement.runSpeed,5):8)*(finite(input.throttle)-finite(input.brake));
    this.state.heading+=finite(input.steer)*dt*1.8;if(this.owner&&this.owner.position){this.owner.position.x+=Math.sin(this.state.heading)*speed*dt;this.owner.position.z+=Math.cos(this.state.heading)*speed*dt;if(this.owner.rotation)this.owner.rotation.y=this.state.heading;}
    this.state.speed=speed;this.state.speedKmh=Math.abs(speed)*3.6;
    if(this.engineAudioController)this.engineAudioController.update(dt);
  };
  pawn.step=function(dt){
    if(this.disposed)return;const h=clamp(dt,0,.1);if(!this.started||this.sleeping||this.enabled===false)return;this.prepareRuntime();if(this.assetHydrationState==='pending')return;
    if(!this.physicsReady){this.stepArcade(h);return;}this.beforePhysics(h);coordinator.drive(this,h);
  };
  pawn.reset=function(){
    const spawn=this.config.spawn;if(this.body){restoreBody(this);this.physicsOriginY=vehiclePhysicsOriginY(this,this.config.collision);this.body.position.set(spawn.x,spawn.y+finite(this.physicsOriginY,0),spawn.z);this.body.quaternion.setFromAxisAngle(new root.CANNON.Vec3(0,1,0),spawn.heading);syncBodyInterpolation(this.body);this.body.velocity.set(0,0,0);this.body.angularVelocity.set(0,0,0);this.body.force.set(0,0,0);this.body.torque.set(0,0,0);this.body.wakeUp&&this.body.wakeUp();}
    this.groundGrace=0;this.jumpGrace=0;this.groundSupport=null;this.groundHit=null;if(this.owner&&this.owner.position){const rotation=root.THREE?new root.THREE.Quaternion().setFromAxisAngle(new root.THREE.Vector3(0,1,0),spawn.heading):null;setOwnerWorldTransform(this.owner,spawn,rotation);if(!rotation&&this.owner.rotation)this.owner.rotation.y=spawn.heading;}this.state.heading=spawn.heading;this.state.speed=0;this.state.speedKmh=0;this.state.locomotion='idle';emit(this,'OnPawnReset');return true;
  };
  installEntryExit(pawn);
  pawn.dispose=function(){
    if(this.disposed)return false;
    if(this.entryTransition&&this.entryTransition.seat&&this.entryTransition.seat.reservedBy===this)this.entryTransition.seat.reservedBy=null;this.entryTransition=null;
    if(this.type==='advanced-character'&&this.inVehicle){this.entryCooldown=0;this.exitSeat(true);}
    else if(this.type!=='advanced-character'){(this.parts.seats||[]).map(seat=>seat&&seat.occupiedBy).filter(Boolean).forEach(character=>{character.entryCooldown=0;character.exitSeat(true);});}
    this.possessCamera(false);this.disposed=true;this.started=false;removeBody(this);coordinator.unregister(this);
    if(this.engineAudioController)this.engineAudioController.dispose();this.engineAudioController=null;
    if(registry.unregister)registry.unregister(this);if(this.owner&&this.owner.userData&&this.owner.userData.sketchbookPawnId===this.id)delete this.owner.userData.sketchbookPawnId;
    if(this.owner&&this.runtimeHidden)this.owner.visible=this.previousOwnerVisible!==false;return true;
  };
  if(cfg.type!=='advanced-character'&&root.LK_RUNTIME_VEHICLE_DAMAGE)root.LK_RUNTIME_VEHICLE_DAMAGE.attach(GAME,pawn,pawn.config.damage);
  registry.register(pawn);return pawn;
}

function install(GAME){
  if(!GAME)return null;GAME.systems=GAME.systems||{};
  if(GAME.systems.sketchbookPawns&&GAME.systems.sketchbookPawns.schemaVersion===SCHEMA_VERSION){installWorldMetadataLifecycle(GAME,GAME.systems.sketchbookPawns.coordinator);return GAME.systems.sketchbookPawns;}
  const coordinator=createCoordinator(GAME),metadata=metadataRegistry(GAME),api=Object.freeze({schemaVersion:SCHEMA_VERSION,source:SOURCE,manifest:()=>clone(MANIFEST),coordinator,metadata,
    normalizeConfig,createLogic:(owner,config,services)=>createLogic(GAME,owner,config,services),parseWorldPhysicsExtras:source=>parseWorldPhysicsExtras(GAME,source),parseWorldMetadata:(source,key)=>parseWorldMetadata(GAME,source,key)});
  GAME.systems.sketchbookPawns=api;
  installWorldMetadataLifecycle(GAME,coordinator);
  const core=root.LK_RUNTIME_PAWN_CORE&&root.LK_RUNTIME_PAWN_CORE.install?root.LK_RUNTIME_PAWN_CORE.install(GAME):null;
  if(core&&core.components&&!core.components.has('sketchbook'))core.components.register('sketchbook',options=>createLogic(GAME,options.owner,options.config,options.services));
  return api;
}
function manifest(){return clone(MANIFEST);}

// The part-rig helpers are exported alongside the Pawn factory because they are
// the contract an imported model has to satisfy to animate: which node is the
// part, which axis it turns about, and which way its door opens.
root.LK_RUNTIME_SKETCHBOOK_PAWNS=Object.freeze({SCHEMA_VERSION,SOURCE,TYPES,normalizeConfig,createCoordinator,parseWorldPhysicsExtras,parseWorldMetadata,metadataRegistry,createLogic,install,manifest,
  scanSourceParts,spinParts,spinAxis,hingeAxis,surfaceSideSign,doorSwingSide,wheelVisualRadius,localGeometryBox,
  beginCharacterRoll,stepCharacterRoll,rollActive,DODGE_TAP_WINDOW,EXIT_ROLL_SPEED,DODGE_ROLL_SECONDS});
if(root.LOT_KING)install(root.LOT_KING);
})(typeof window!=='undefined'?window:globalThis);
