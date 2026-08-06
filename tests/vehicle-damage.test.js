'use strict';

const assert=require('node:assert/strict');
const THREE=require('three');

global.window=global;
global.THREE=THREE;
global.dispatchEvent=()=>true;
global.CustomEvent=class CustomEvent{constructor(type,options){this.type=type;this.detail=options&&options.detail;}};
require('../js/runtime/combat/damage-contract.js');
require('../js/runtime/vehicle-damage.js');
require('../js/runtime/vehicle-occupancy.js');

const DAMAGE=global.LK_RUNTIME_VEHICLE_DAMAGE;
const CONTRACT=global.LK_RUNTIME_DAMAGE_CONTRACT;
const OCCUPANCY=global.LK_RUNTIME_VEHICLE_OCCUPANCY;

function test(name,run){try{run();console.log('ok - '+name);}catch(error){console.error('not ok - '+name);throw error;}}
function fixture(config){
  const scene=new THREE.Scene(),owner=new THREE.Group();owner.name='Test vehicle';scene.add(owner);
  const body=new THREE.Mesh(new THREE.BoxGeometry(2,1,4),new THREE.MeshStandardMaterial({color:0x55aaff}));body.name='Vehicle body';owner.add(body);
  const tank=new THREE.Group();tank.name='fuel_tank';tank.position.set(-.7,.5,-1.1);owner.add(tank);
  const engine=new THREE.Group();engine.name='engine_smoke';engine.position.set(0,.7,.8);owner.add(engine);
  const wheels=[];[['front_left',-1,1.25],['front_right',1,1.25],['rear_left',-1,-1.25],['rear_right',1,-1.25]].forEach(([name,x,z])=>{const wheel=new THREE.Group();wheel.name='wheel_'+name;wheel.position.set(x,0,z);owner.add(wheel);wheels.push(wheel);});
  const blasts=[];
  const GAME={core:{scene},systems:{weaponTracers:{explode(options){blasts.push(options);}}}};
  const pawn={id:'vehicle-test',kind:'logic-element',pawnType:'vehicle',type:'car',owner,config:{entry:{enabled:true},wheels:[{}],damage:config||{}},parts:{wheels,seats:[{id:'driver',type:'driver',node:owner,occupiedBy:null,reservedBy:null}]},state:{},enabled:true,hidden:false,disposed:false,possessed:false,step(){},reset(){return true;},dispose(){return true;},unpossess(){this.possessed=false;return true;}};
  const runtime=DAMAGE.attach(GAME,pawn,pawn.config.damage);
  return {GAME,pawn,runtime,scene,owner,body,tank,engine,wheels,blasts};
}

test('vehicle classes receive different authorable energy defaults',()=>{
  assert.equal(DAMAGE.normalizeConfig({},'car').maxEnergy,850);
  assert.equal(DAMAGE.normalizeConfig({},'helicopter').maxEnergy,1150);
  assert.equal(DAMAGE.normalizeConfig({},'airplane').maxEnergy,1400);
});

test('the rig fuel tank is a real shootable multiplied hit zone',()=>{
  const f=fixture({maxEnergy:1000,fuelTank:{damageMultiplier:3}}),initial=f.runtime.snapshot();
  assert.equal(initial.anchors.fuelTank,f.tank,'a named GLB rig anchor wins over the fallback');
  assert.ok(initial.anchors.proxy&&initial.anchors.proxy.isMesh,'the anchor receives a raycastable proxy');
  CONTRACT.apply(f.body,100,{object:f.body,source:'hitscan'});
  assert.equal(f.runtime.snapshot().energy,900,'body damage is applied once');
  CONTRACT.apply(initial.anchors.proxy,100,{object:initial.anchors.proxy,source:'hitscan'});
  assert.equal(f.runtime.snapshot().energy,600,'the fuel tank uses its authored multiplier');
  assert.equal(f.runtime.snapshot().lastZone,'fuel');
});

test('damage crosses smoke and fire states before a strong destructive blast',()=>{
  const f=fixture({maxEnergy:100,smokeThreshold:.7,fireThreshold:.3,explosion:{delay:.05,radius:8,force:160}});
  const target=new THREE.Group();target.position.set(2,0,0);f.scene.add(target);CONTRACT.bind(target,null,{health:200,maxHealth:200,team:'neutral'});
  CONTRACT.apply(f.body,35,{object:f.body});
  f.pawn.step(.016);
  assert.equal(f.runtime.snapshot().smoking,true);
  assert.equal(f.runtime.snapshot().burning,false);
  CONTRACT.apply(f.body,40,{object:f.body});
  f.pawn.step(.016);
  assert.equal(f.runtime.snapshot().burning,true);
  CONTRACT.apply(f.body,30,{object:f.body});
  f.pawn.step(.1);
  const snapshot=f.runtime.snapshot();
  assert.equal(snapshot.destroyed,true);
  assert.equal(f.blasts.length,1,'the weapon FX system receives one vehicle-scale blast');
  assert.ok(CONTRACT.recordOf(target).health<200,'the explosion applies radial gameplay damage, not only particles');
  assert.ok(f.body.material.color.r+f.body.material.color.g+f.body.material.color.b<.15,'the destroyed body is visibly blackened');
  f.wheels.forEach(wheel=>assert.equal(wheel.parent,f.scene,'each wheel is detached into the world'));
  assert.equal(OCCUPANCY.isEnterable(f.pawn),false,'a destroyed vehicle cannot be entered');
  assert.equal(OCCUPANCY.isCollidable(f.pawn),true,'the destroyed chassis remains a solid wreck');
});

test('reset restores energy, materials, wheels and usability',()=>{
  const f=fixture({maxEnergy:80,explosion:{delay:0,detachWheels:true,blacken:true}}),originalMaterial=f.body.material;
  CONTRACT.apply(f.body,100,{object:f.body});f.pawn.step(.1);
  f.runtime.reset();
  const snapshot=f.runtime.snapshot();
  assert.equal(snapshot.energy,80);assert.equal(snapshot.destroyed,false);assert.equal(f.body.material,originalMaterial);
  f.wheels.forEach(wheel=>assert.equal(wheel.parent,f.owner));
  assert.equal(OCCUPANCY.isEnterable(f.pawn),true);
});

test('late GLB hydration replaces a fallback anchor without leaving duplicates',()=>{
  const f=fixture();f.owner.remove(f.tank);f.runtime.refreshAnchors();
  const fallback=f.runtime.snapshot().anchors.fuelTank;
  assert.equal(fallback.userData.vehicleDamageFallback,true);
  const hydrated=new THREE.Group();hydrated.name='serbatoio';f.owner.add(hydrated);f.runtime.refreshAnchors();
  assert.equal(f.runtime.snapshot().anchors.fuelTank,hydrated);
  assert.equal(fallback.parent,null,'the superseded fallback is removed from the vehicle hierarchy');
});

test('editor reconfiguration persists and can disable/re-enable the damage contract',()=>{
  const f=fixture({maxEnergy:500});
  f.runtime.configure({maxEnergy:720,enabled:false});
  assert.equal(f.pawn.config.damage.maxEnergy,720);
  assert.equal(CONTRACT.recordOf(f.owner),null,'disabled means shots cannot fall through to generic damage');
  f.runtime.configure({enabled:true});
  assert.ok(CONTRACT.recordOf(f.owner));
});

console.log('vehicle-damage.test.js: all assertions passed');
