/* =========================================================
   LOT KING - Character / vehicle dismount policy

   Converts one live vehicle snapshot into a Character outcome. Physics stays
   in the vehicle runtimes; this module only describes what the Character must
   inherit when ownership crosses back to the on-foot controller.
   ========================================================= */
(function(root){
'use strict';

const SCHEMA_VERSION=1;
const DEFAULTS=Object.freeze({
  enabled:true,
  inheritVelocity:true,
  rollStartKmh:12,
  damageStartKmh:25,
  lethalKmh:80,
  damageAtLethal:100,
});

function finite(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function vector(value){return {x:finite(value&&value.x,0),y:finite(value&&value.y,0),z:finite(value&&value.z,0)};}
function normalizeConfig(value){
  const source=value&&typeof value==='object'?value:{};
  const rollStartKmh=clamp(finite(source.rollStartKmh,DEFAULTS.rollStartKmh),0,120);
  const damageStartKmh=clamp(finite(source.damageStartKmh,DEFAULTS.damageStartKmh),rollStartKmh,240);
  const lethalKmh=clamp(finite(source.lethalKmh,DEFAULTS.lethalKmh),damageStartKmh+1,400);
  return {
    enabled:source.enabled!==false,
    inheritVelocity:source.inheritVelocity!==false,
    rollStartKmh,
    damageStartKmh,
    lethalKmh,
    damageAtLethal:clamp(finite(source.damageAtLethal,DEFAULTS.damageAtLethal),0,10000),
  };
}

function vehicleKind(vehicle){
  const text=String(vehicle&&(
    vehicle.type||vehicle.vehicleType||vehicle.pawnType||vehicle.kind||
    vehicle.config&&vehicle.config.type
  )||'car').toLowerCase();
  if(/helicopter|heli|airplane|aeroplane|aircraft|plane/.test(text))return 'air';
  if(/boat|ship|watercraft|jetski|submarine/.test(text))return 'water';
  return 'land';
}

function linearVelocity(vehicle){
  if(!vehicle)return vector(null);
  if(typeof vehicle.linearVelocity==='function'){
    try{return vector(vehicle.linearVelocity());}catch(err){}
  }
  const candidates=[
    vehicle.body&&vehicle.body.velocity,
    vehicle.backend&&vehicle.backend.body&&vehicle.backend.body.velocity,
    vehicle.physics&&vehicle.physics.velocity,
    vehicle.physics&&vehicle.physics.vel,
    vehicle.state&&vehicle.state.velocity,
  ];
  const found=candidates.find(value=>value&&Number.isFinite(Number(value.x))&&Number.isFinite(Number(value.z)));
  if(found)return vector(found);
  const speed=Math.max(0,finite(vehicle.state&&vehicle.state.speed,0)),heading=finite(vehicle.owner&&vehicle.owner.rotation&&vehicle.owner.rotation.y,0);
  return {x:Math.sin(heading)*speed,y:0,z:Math.cos(heading)*speed};
}

function plan(vehicle,settings){
  const config=normalizeConfig(settings),kind=vehicleKind(vehicle),raw=linearVelocity(vehicle),velocity=config.inheritVelocity?raw:vector(null);
  const horizontalMps=Math.hypot(raw.x,raw.z),speedKmh=horizontalMps*3.6;
  if(!config.enabled)return {kind,mode:'normal',velocity:vector(null),horizontalMps,speedKmh,roll:false,damage:0,lethal:false,config};
  if(kind==='air')return {kind,mode:'free-fall',velocity,horizontalMps,speedKmh,roll:false,damage:0,lethal:false,config};
  // Water exits deliberately remain neutral until swimming/boat dismount owns
  // the surface transition. Road-impact rules must never fire over the sea.
  if(kind==='water')return {kind,mode:'normal',velocity:vector(null),horizontalMps,speedKmh,roll:false,damage:0,lethal:false,config};
  const lethal=speedKmh>=config.lethalKmh;
  const damage=speedKmh>config.damageStartKmh
    ?config.damageAtLethal*clamp((speedKmh-config.damageStartKmh)/(config.lethalKmh-config.damageStartKmh),0,1)
    :0;
  const roll=!lethal&&speedKmh>=config.rollStartKmh;
  return {kind,mode:lethal?'lethal':damage>0?'damage-roll':roll?'roll':'normal',velocity,horizontalMps,speedKmh,roll,damage,lethal,config};
}

const api=Object.freeze({SCHEMA_VERSION,DEFAULTS,normalizeConfig,vehicleKind,linearVelocity,plan});
root.LK_RUNTIME_CHARACTER_VEHICLE_DISMOUNT=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
