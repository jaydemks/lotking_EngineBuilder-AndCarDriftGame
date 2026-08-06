'use strict';
const assert=require('node:assert/strict');
global.window=global;
const TOW=require('../js/runtime/vehicle-towing.js');
function owner(x,z){return {position:{x,y:0,z,set(nx,ny,nz){this.x=nx;this.y=ny;this.z=nz;}},rotation:{y:0},updateMatrixWorld(){}};}
function pawn(id,x,z,config){return {id,owner:owner(x,z),config:Object.assign({towing:{enabled:true,hitch:{position:[0,.35,-1]},attachRadius:2},towable:{enabled:true,coupler:{position:[0,.5,1]}},collision:{mass:1000}},config||{})};}
const truck=pawn('truck',0,0),trailer=pawn('trailer',0,-2),far=pawn('far',50,50),GAME={pawns:{list:()=>[truck,trailer,far]}};
TOW.decorate(GAME,truck);TOW.decorate(GAME,trailer);
assert.equal(TOW.nearest(truck,[trailer,far]),trailer);
assert.equal(truck.attachTow(),true);assert.equal(truck.towedPawn,trailer);assert.equal(trailer.towedBy,truck);
truck.owner.position.z=5;TOW.update(GAME,[truck,trailer]);assert.equal(trailer.owner.position.z,3,'fallback trailer follows the world hitch while preserving its coupler offset');
assert.equal(truck.toggleTow(),true);assert.equal(truck.towedPawn,null);assert.equal(trailer.towedBy,null);
trailer.config.towable.enabled=false;assert.equal(truck.attachTow(trailer),false);

// A physical constraint must use each authored dummy in its own body frame.
// Before this regression, pivot B was calculated from the truck hitch world
// point and therefore ignored the trailer coupler whenever they were apart.
class Vec3{constructor(x=0,y=0,z=0){this.set(x,y,z);}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}copy(value){return this.set(value.x,value.y,value.z);}}
let builtConstraint=null,removedConstraint=null;
class PointToPointConstraint{constructor(a,pivotA,b,pivotB,maxForce){Object.assign(this,{a,pivotA,b,pivotB,maxForce});builtConstraint=this;}}
global.CANNON={Vec3,PointToPointConstraint};
function bodyAt(x,y,z){return {position:new Vec3(x,y,z),velocity:new Vec3(),angularVelocity:new Vec3(),pointToLocalFrame(point,out){out.set(point.x-this.position.x,point.y-this.position.y,point.z-this.position.z);}};}
const physicsWorld={addConstraint(){},removeConstraint(value){removedConstraint=value;}};
const physicalTruck=pawn('physical-truck',0,0),physicalTrailer=pawn('physical-trailer',0,-1.5);
physicalTruck.backend={body:bodyAt(0,0,0),world:physicsWorld};physicalTrailer.backend={body:bodyAt(0,0,-1.5),world:physicsWorld};
TOW.decorate({pawns:{list:()=>[physicalTruck,physicalTrailer]}},physicalTruck);TOW.decorate(null,physicalTrailer);
assert.equal(TOW.attach(null,physicalTruck,physicalTrailer),true);
assert.deepEqual([builtConstraint.pivotA.x,builtConstraint.pivotA.y,builtConstraint.pivotA.z],[0,.35,-1]);
assert.deepEqual([builtConstraint.pivotB.x,builtConstraint.pivotB.y,builtConstraint.pivotB.z],[0,.5,1],
  'constraint pivot B comes from the trailer coupler, not the hitch world point');
assert.equal(TOW.detach(physicalTruck),true);assert.equal(removedConstraint,builtConstraint,'detach removes the exact owned constraint');

const brokenWorld={addConstraint(){throw new Error('physics world rejected constraint');}};
physicalTruck.backend.world=brokenWorld;physicalTrailer.backend.world=brokenWorld;
assert.equal(TOW.attach(null,physicalTruck,physicalTrailer),false,'constraint creation failure is transactional');
assert.equal(physicalTruck.towedPawn,null);assert.equal(physicalTrailer.towedBy,null);

delete global.CANNON;
const chainA=pawn('chain-a',0,0),chainB=pawn('chain-b',0,-2);
TOW.decorate(null,chainA);TOW.decorate(null,chainB);
assert.equal(TOW.attach(null,chainA,chainB),true);assert.equal(TOW.eligible(chainB,chainA),false,'a reverse attachment cannot create A → B → A');
TOW.detach(chainA);

const fallbackTruck=pawn('fallback-truck',0,0),fallbackTrailer=pawn('fallback-trailer',0,-2);
fallbackTrailer.backend={body:{position:new Vec3(),velocity:new Vec3(9,0,0),angularVelocity:new Vec3(1,2,3),wakeUp(){this.awake=true;}},bodyY:.6};
TOW.decorate(null,fallbackTruck);TOW.decorate(null,fallbackTrailer);assert.equal(TOW.attach(null,fallbackTruck,fallbackTrailer),true);
fallbackTruck.owner.position.z=4;TOW.update(null,[fallbackTruck,fallbackTrailer]);
assert.equal(fallbackTrailer.owner.position.z,2);assert.equal(fallbackTrailer.backend.body.position.z,2,'fallback keeps the physics body with its visual owner');
assert.equal(fallbackTrailer.backend.body.position.y,fallbackTrailer.owner.position.y+.6);assert.equal(fallbackTrailer.backend.body.awake,true);
console.log('vehicle-towing.test.js: all assertions passed');
