'use strict';

const assert=require('node:assert/strict');
global.window=global;
require('../js/runtime/character-vehicle-dismount.js');
require('../js/runtime/character-movement.js');

const DISMOUNT=global.LK_RUNTIME_CHARACTER_VEHICLE_DISMOUNT;

function car(kmh){return {type:'car',body:{velocity:{x:kmh/3.6,y:0,z:0}}};}

assert.equal(DISMOUNT.plan(car(5)).mode,'normal','walking-speed exits stand normally');
assert.equal(DISMOUNT.plan(car(20)).mode,'roll','a moderate road exit rolls without damage');
const damaging=DISMOUNT.plan(car(52.5));
assert.equal(damaging.mode,'damage-roll');
assert.equal(damaging.roll,true);
assert.ok(Math.abs(damaging.damage-50)<1e-6,'road damage scales linearly from 25 to 80 km/h');
const lethal=DISMOUNT.plan(car(80));
assert.equal(lethal.mode,'lethal');
assert.equal(lethal.lethal,true);
assert.equal(lethal.roll,false,'death physics, never a live roll, owns a lethal exit');

const helicopter={type:'helicopter',body:{velocity:{x:4,y:-2,z:3}}};
const air=DISMOUNT.plan(helicopter);
assert.equal(air.mode,'free-fall');
assert.deepEqual(air.velocity,{x:4,y:-2,z:3},'air exits inherit the complete live trajectory');
assert.equal(air.damage,0,'height/impact damage is deferred to the normal landing contract');

assert.equal(DISMOUNT.plan({type:'boat',body:{velocity:{x:30,y:0,z:0}}}).mode,'normal','road-impact rules do not run on watercraft');
assert.deepEqual(DISMOUNT.linearVelocity({backend:{body:{velocity:{x:1,y:2,z:3}}}}),{x:1,y:2,z:3},'Logic Vehicle backend velocity is readable');
assert.deepEqual(DISMOUNT.linearVelocity({linearVelocity(){return {x:7,y:8,z:9};}}),{x:7,y:8,z:9},'native adapters can publish their authoritative velocity');

const movement=global.LK_RUNTIME_CHARACTER_MOVEMENT.create({world:{characterGroundHeight:()=>0,colliders:{box:[],circle:[]}}},{gravity:20,inputMode:'heading'});
const owner={position:{x:0,y:12,z:0},rotation:{y:0}};
movement.reset(0);
movement.launch({x:3,y:-1,z:4});
const frame=movement.step(owner,{x:0,z:0},.1,0);
assert.equal(frame.airborne,true);
assert.ok(frame.velocityY<-1,'free-fall continues through the ordinary Character gravity solver');
assert.ok(owner.position.x>0&&owner.position.z>0,'the Character retains vehicle horizontal momentum in the air');

console.log('character vehicle dismount tests passed');
