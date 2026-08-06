/* LOT KING — shared dynamic tow-hitch contract for every Logic Vehicle Pawn. */
(function(root){
'use strict';
function finite(value,fallback){const number=Number(value);return Number.isFinite(number)?number:(fallback==null?0:fallback);}
function vector(value,fallback){const source=Array.isArray(value)?value:fallback||[0,0,0];return [finite(source[0]),finite(source[1]),finite(source[2])];}
function localPoint(pawn,kind){const cfg=pawn&&pawn.config||{},block=kind==='hitch'?cfg.towing&&cfg.towing.hitch:cfg.towable&&cfg.towable.coupler;return vector(block&&block.position,kind==='hitch'?[0,.35,-1.8]:[0,.5,1.8]);}
function worldPoint(pawn,kind){
  const local=localPoint(pawn,kind),owner=pawn&&pawn.owner,THREE=root.THREE;
  if(THREE&&owner&&owner.localToWorld){owner.updateMatrixWorld&&owner.updateMatrixWorld(true);const result=owner.localToWorld(new THREE.Vector3(local[0],local[1],local[2]));return {x:result.x,y:result.y,z:result.z};}
  const p=owner&&owner.position||{x:0,y:0,z:0},yaw=finite(owner&&owner.rotation&&owner.rotation.y,0),sin=Math.sin(yaw),cos=Math.cos(yaw);
  return {x:finite(p.x)+local[0]*cos+local[2]*sin,y:finite(p.y)+local[1],z:finite(p.z)-local[0]*sin+local[2]*cos};
}
function distanceSquared(a,b){const dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z;return dx*dx+dy*dy+dz*dz;}
function wouldCycle(tow,trailer){
  const seen=new Set();
  for(let cursor=trailer;cursor;cursor=cursor.towedPawn){
    if(cursor===tow)return true;
    if(seen.has(cursor))return true;
    seen.add(cursor);
  }
  return false;
}
function eligible(tow,trailer){return !!(tow&&trailer&&tow!==trailer&&tow.config&&tow.config.towing&&tow.config.towing.enabled!==false&&trailer.config&&trailer.config.towable&&trailer.config.towable.enabled!==false&&!trailer.towedBy&&!trailer.disposed&&!wouldCycle(tow,trailer));}
function nearest(tow,list){
  const point=worldPoint(tow,'hitch'),radius=Math.max(.1,finite(tow&&tow.config&&tow.config.towing&&tow.config.towing.attachRadius,1.25));let best=null,bestDistance=radius*radius;
  (Array.isArray(list)?list:[]).forEach(candidate=>{if(!eligible(tow,candidate))return;const d=distanceSquared(point,worldPoint(candidate,'coupler'));if(d<=bestDistance){best=candidate;bestDistance=d;}});return best;
}
function emit(type,tow,trailer){if(!root.dispatchEvent||!root.CustomEvent)return;root.dispatchEvent(new root.CustomEvent('lk-pawn-event',{detail:{type,pawn:tow,pawnId:tow&&tow.id,trailer,trailerId:trailer&&trailer.id}}));}
function constraintFor(GAME,tow,trailer){
  const CANNON=root.CANNON,a=tow&&tow.backend&&tow.backend.body,b=trailer&&trailer.backend&&trailer.backend.body,world=tow&&tow.backend&&tow.backend.world||GAME&&GAME.systems&&GAME.systems.physics&&GAME.systems.physics.raw&&GAME.systems.physics.raw.world;
  if(!CANNON||!CANNON.PointToPointConstraint||!a||!b||!world||!world.addConstraint)return null;
  const hitch=worldPoint(tow,'hitch'),coupler=worldPoint(trailer,'coupler');
  const worldHitch=new CANNON.Vec3(hitch.x,hitch.y,hitch.z),worldCoupler=new CANNON.Vec3(coupler.x,coupler.y,coupler.z),pivotA=new CANNON.Vec3(),pivotB=new CANNON.Vec3();
  if(a.pointToLocalFrame)a.pointToLocalFrame(worldHitch,pivotA);else pivotA.set.apply(pivotA,localPoint(tow,'hitch'));
  // Each pivot is authored in its OWN body. Converting the hitch through body B
  // silently attached an arbitrary point of the trailer and ignored its visible
  // coupler whenever the two vehicles were not already perfectly aligned.
  if(b.pointToLocalFrame)b.pointToLocalFrame(worldCoupler,pivotB);else pivotB.set.apply(pivotB,localPoint(trailer,'coupler'));
  const maxForce=Math.max(1000,finite(tow.config.towing.maxForce,Math.max(250000,finite(trailer.config.collision&&trailer.config.collision.mass,1000)*1800)));
  const constraint=new CANNON.PointToPointConstraint(a,pivotA,b,pivotB,maxForce);constraint.collideConnected=false;world.addConstraint(constraint);return {constraint,world};
}
function attach(GAME,tow,trailer){
  if(tow&&tow.towedPawn===trailer&&trailer&&trailer.towedBy===tow)return true;
  if(!eligible(tow,trailer))return false;
  if(tow.ensurePhysics)tow.ensurePhysics();if(trailer.ensurePhysics)trailer.ensurePhysics();
  let physics=null;
  try{physics=constraintFor(GAME,tow,trailer);}catch(error){return false;}
  if(tow.towedPawn)detach(tow);
  tow.towedPawn=trailer;trailer.towedBy=tow;tow.towRuntime={physics,trailer};emit('OnTowAttached',tow,trailer);return true;
}
function detach(tow){
  if(!tow||!tow.towedPawn)return false;const trailer=tow.towedPawn,runtime=tow.towRuntime||{},physics=runtime.physics;
  if(physics&&physics.world&&physics.constraint&&physics.world.removeConstraint)try{physics.world.removeConstraint(physics.constraint);}catch(error){}
  tow.towedPawn=null;tow.towRuntime=null;if(trailer.towedBy===tow)trailer.towedBy=null;emit('OnTowDetached',tow,trailer);return true;
}
function fallbackFollow(tow,trailer){
  if(!tow||!trailer||tow.towRuntime&&tow.towRuntime.physics||!tow.owner||!trailer.owner)return false;
  const hitch=worldPoint(tow,'hitch'),coupler=localPoint(trailer,'coupler'),yaw=finite(tow.owner.rotation&&tow.owner.rotation.y,0),sin=Math.sin(yaw),cos=Math.cos(yaw);
  const target={x:hitch.x-(coupler[0]*cos+coupler[2]*sin),y:hitch.y-coupler[1],z:hitch.z-(-coupler[0]*sin+coupler[2]*cos)};
  if(trailer.owner.position&&trailer.owner.position.set)trailer.owner.position.set(target.x,target.y,target.z);
  if(trailer.owner.rotation)trailer.owner.rotation.y=yaw;
  const backend=trailer.backend,body=backend&&backend.body;
  if(body&&body.position&&body.position.set){
    body.position.set(target.x,target.y+finite(backend.bodyY,0),target.z);
    if(body.quaternion&&body.quaternion.setFromAxisAngle&&root.CANNON&&root.CANNON.Vec3)body.quaternion.setFromAxisAngle(new root.CANNON.Vec3(0,1,0),yaw);
    const source=tow.backend&&tow.backend.body;
    if(body.velocity&&body.velocity.copy&&source&&source.velocity)body.velocity.copy(source.velocity);
    else if(body.velocity&&body.velocity.set)body.velocity.set(0,0,0);
    if(body.angularVelocity&&body.angularVelocity.set)body.angularVelocity.set(0,0,0);
    if(body.wakeUp)body.wakeUp();
  }
  if(trailer.owner.updateMatrixWorld)trailer.owner.updateMatrixWorld(true);return true;
}
function decorate(GAME,pawn){
  if(!pawn||pawn.__lkTowDecorated)return pawn;pawn.__lkTowDecorated=true;pawn.towedPawn=null;pawn.towedBy=null;pawn.towRuntime=null;
  pawn.attachTow=function(candidate){const list=GAME&&GAME.pawns&&GAME.pawns.list?GAME.pawns.list():[];return attach(GAME,this,candidate||nearest(this,list));};
  pawn.detachTow=function(){return detach(this);};pawn.toggleTow=function(){return this.towedPawn?detach(this):this.attachTow();};return pawn;
}
function update(GAME,pawns){(Array.isArray(pawns)?pawns:[]).forEach(pawn=>{if(pawn&&pawn.towedPawn)fallbackFollow(pawn,pawn.towedPawn);});}
const api=Object.freeze({decorate,eligible,wouldCycle,nearest,attach,detach,update,worldPoint});
root.LK_RUNTIME_VEHICLE_TOWING=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
