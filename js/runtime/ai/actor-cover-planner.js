/* =========================================================
   LOT KING - Collider-aware Actor cover planner

   Behaviour decides WHEN an actor wants cover. This module owns HOW a nearby
   world collider is selected, approached, retried and finally attached. It is
   intentionally navigation-light: Character movement remains authoritative.
   ========================================================= */
(function(root){
'use strict';

const VERSION=3,MAX_COVER_COLLIDERS=256,BLOCKER_CELL_SIZE=4,MAX_BUCKET_CELLS=64,RESERVATION_TTL=2.5,RESERVATION_QUANTUM=.8;

function finite(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,finite(value,min)));}
function distanceSquared(a,b){const dx=a.x-b.x,dy=(a.y||0)-(b.y||0),dz=a.z-b.z;return dx*dx+dy*dy+dz*dz;}
function hash(value){let total=0;for(let i=0;i<String(value||'').length;i++)total=(total*31+String(value).charCodeAt(i))>>>0;return(total%1000)/1000;}

function pawnList(GAME){
  const registry=GAME&&GAME.pawns;if(!registry)return [];
  const list=typeof registry.list==='function'?registry.list():registry;
  return Array.isArray(list)?list.filter(Boolean):[];
}
function nodeBelongsToPawn(node,pawn){
  if(!node||!pawn)return false;const owner=pawn.owner||pawn;
  for(let current=node,depth=0;current&&depth<64;current=current.parent||null,depth++)if(current===pawn||current===owner)return true;
  return false;
}
function colliderBelongsToPawn(collider,pawn){
  return !!(collider&&pawn&&(nodeBelongsToPawn(collider,pawn)||nodeBelongsToPawn(collider.owner,pawn)||nodeBelongsToPawn(collider.logicElementOwner,pawn)));
}
function colliderBelongsToAnyPawn(collider,pawns){
  for(let index=0;index<pawns.length;index++)if(colliderBelongsToPawn(collider,pawns[index]))return true;
  return false;
}

function pawnVerticalSpan(pawn,candidate){
  const movement=pawn&&pawn.config&&pawn.config.movement||{},bottom=finite(candidate&&candidate.y,pawn&&pawn.owner&&pawn.owner.position&&pawn.owner.position.y||0);
  return {bottom,top:bottom+Math.max(.2,finite(movement.height,1.8))};
}
function overlapsPawnVertically(collider,span,fallbackHalfHeight){
  const center=Number(collider&&collider.y),halfValue=collider&&collider.hy!=null?collider.hy:fallbackHalfHeight,half=Math.abs(Number(halfValue));
  if(!Number.isFinite(center)||!Number.isFinite(half))return true;
  const tolerance=.02;
  return center+half>span.bottom+tolerance&&center-half<span.top-tolerance;
}

function segmentHitsBox(from,to,box){
  if(!box||box.x==null||box.y==null||box.z==null||box.hx==null||box.hy==null||box.hz==null)return false;
  let low=0,high=1;
  const axes=[['x','hx'],['y','hy'],['z','hz']];
  for(let i=0;i<axes.length;i++){
    const axis=axes[i][0],halfKey=axes[i][1],start=finite(from[axis],0),delta=finite(to[axis],0)-start;
    const minimum=finite(box[axis],0)-Math.abs(finite(box[halfKey],0)),maximum=finite(box[axis],0)+Math.abs(finite(box[halfKey],0));
    if(Math.abs(delta)<1e-7){if(start<minimum||start>maximum)return false;continue;}
    let entry=(minimum-start)/delta,exit=(maximum-start)/delta;if(entry>exit){const swap=entry;entry=exit;exit=swap;}
    low=Math.max(low,entry);high=Math.min(high,exit);if(low>high)return false;
  }
  return high>.01&&low<.99;
}

function coverClassForBox(box,feetY){
  if(!box||box.enabled===false||box.compoundRoot||box.horizontalSurface||box.cover===false||box.x==null||box.z==null||box.hx==null||box.hz==null||box.y==null||box.hy==null)return null;
  if(finite(box.y,0)-Math.abs(finite(box.hy,0))>feetY+.4)return null;
  const height=finite(box.y,0)+Math.abs(finite(box.hy,0))-feetY,runtime=root.LK_RUNTIME_CHARACTER_COVER;
  if(runtime&&typeof runtime.coverClassForHeight==='function')return runtime.coverClassForHeight(height);
  if(height>=.85&&height<=1.45)return {id:'low',fireMode:'pop',riseHeight:.42,crouchBehind:true,brace:1};
  if(height>=1.6&&height<=3.2)return {id:'high',fireMode:'lean',riseHeight:0,crouchBehind:false,brace:.8};
  return null;
}

function createBlockerIndex(GAME){
  const colliders=GAME&&GAME.world&&GAME.world.colliders||{},boxes=Array.isArray(colliders.box)?colliders.box:[],circles=Array.isArray(colliders.circle)?colliders.circle:[],buckets=new Map(),oversized=[],indexed=new Set();
  const stats={sourceColliders:boxes.length+circles.length,indexedColliders:0,bucketReferences:0,oversizedColliders:0,queries:0,bucketCells:0,entryVisits:0,exactTests:0};
  function bucketKey(x,z){return x+':'+z;}
  function add(kind,collider,halfX,halfZ){
    if(!collider||collider.enabled===false||collider.compoundRoot||collider.horizontalSurface||indexed.has(collider))return;indexed.add(collider);
    const x=finite(collider.x,0),z=finite(collider.z,0),hx=Math.max(0,Math.abs(finite(halfX,0))),hz=Math.max(0,Math.abs(finite(halfZ,0))),minX=Math.floor((x-hx)/BLOCKER_CELL_SIZE),maxX=Math.floor((x+hx)/BLOCKER_CELL_SIZE),minZ=Math.floor((z-hz)/BLOCKER_CELL_SIZE),maxZ=Math.floor((z+hz)/BLOCKER_CELL_SIZE),cells=(maxX-minX+1)*(maxZ-minZ+1),entry={kind,collider};
    stats.indexedColliders++;
    if(cells>MAX_BUCKET_CELLS){oversized.push(entry);stats.oversizedColliders++;return;}
    for(let cellX=minX;cellX<=maxX;cellX++)for(let cellZ=minZ;cellZ<=maxZ;cellZ++){
      const key=bucketKey(cellX,cellZ),list=buckets.get(key)||[];if(!buckets.has(key))buckets.set(key,list);list.push(entry);stats.bucketReferences++;
    }
  }
  boxes.forEach(box=>add('box',box,box&&box.hx,box&&box.hz));
  circles.forEach(circle=>{const radius=Math.max(0,finite(circle&&circle.r,finite(circle&&circle.radius,0)));add('circle',circle,radius,radius);});
  function blocks(entry,pawn,candidate,radius,ignored,span,visited){
    stats.entryVisits++;const collider=entry.collider;if(visited.has(collider))return false;visited.add(collider);
    if(collider===ignored||colliderBelongsToPawn(collider,pawn))return false;stats.exactTests++;
    if(entry.kind==='box'){
      if(Math.abs(candidate.x-finite(collider.x,0))>=Math.abs(finite(collider.hx,0))+radius||Math.abs(candidate.z-finite(collider.z,0))>=Math.abs(finite(collider.hz,0))+radius)return false;
      return overlapsPawnVertically(collider,span,0);
    }
    const dx=candidate.x-finite(collider.x,0),dz=candidate.z-finite(collider.z,0),clearance=Math.max(0,finite(collider.r,finite(collider.radius,0)))+radius;
    return dx*dx+dz*dz<clearance*clearance&&overlapsPawnVertically(collider,span,Math.max(0,finite(collider.r,finite(collider.radius,0))));
  }
  function pointBlocked(pawn,candidate,radius,ignored){
    stats.queries++;const span=pawnVerticalSpan(pawn,candidate),visited=new Set(),minX=Math.floor((candidate.x-radius)/BLOCKER_CELL_SIZE),maxX=Math.floor((candidate.x+radius)/BLOCKER_CELL_SIZE),minZ=Math.floor((candidate.z-radius)/BLOCKER_CELL_SIZE),maxZ=Math.floor((candidate.z+radius)/BLOCKER_CELL_SIZE);
    for(let cellX=minX;cellX<=maxX;cellX++)for(let cellZ=minZ;cellZ<=maxZ;cellZ++){
      stats.bucketCells++;const list=buckets.get(bucketKey(cellX,cellZ));if(!list)continue;
      for(let index=0;index<list.length;index++)if(blocks(list[index],pawn,candidate,radius,ignored,span,visited))return true;
    }
    for(let index=0;index<oversized.length;index++)if(blocks(oversized[index],pawn,candidate,radius,ignored,span,visited))return true;
    return false;
  }
  function snapshot(){return Object.assign({},stats);}
  return Object.freeze({pointBlocked,snapshot});
}

function candidateFor(pawn,origin,threat,box,pawns,blockers){
  const entry=coverClassForBox(box,origin.y||0);if(!entry||colliderBelongsToAnyPawn(box,pawns))return null;
  const awayX=finite(box.x,0)-threat.x,awayZ=finite(box.z,0)-threat.z;if(Math.abs(awayX)+Math.abs(awayZ)<.001)return null;
  const normal=Math.abs(awayX)>=Math.abs(awayZ)?{x:awayX>=0?1:-1,z:0}:{x:0,z:awayZ>=0?1:-1};
  const coverCfg=pawn.cover&&typeof pawn.cover.config==='function'?pawn.cover.config():{},radius=Math.max(.12,finite(pawn.config&&pawn.config.movement&&pawn.config.movement.radius,.35)),hug=Math.max(radius+.06,finite(coverCfg.hugDistance,.42));
  const alongX=Math.max(0,Math.abs(finite(box.hx,0))-.2),alongZ=Math.max(0,Math.abs(finite(box.hz,0))-.2);
  const position={
    x:normal.x?finite(box.x,0)+normal.x*(Math.abs(finite(box.hx,0))+hug):clamp(origin.x,finite(box.x,0)-alongX,finite(box.x,0)+alongX),
    y:origin.y||0,
    z:normal.z?finite(box.z,0)+normal.z*(Math.abs(finite(box.hz,0))+hug):clamp(origin.z,finite(box.z,0)-alongZ,finite(box.z,0)+alongZ),
  };
  const flatThreat={x:threat.x,y:finite(box.y,0),z:threat.z},flatPosition={x:position.x,y:finite(box.y,0),z:position.z};
  if(!segmentHitsBox(flatThreat,flatPosition,box)||blockers.pointBlocked(pawn,position,radius,box))return null;
  const top=finite(box.y,0)+Math.abs(finite(box.hy,0)),height=top-(origin.y||0);
  return {collider:box,position,found:{collider:box,cover:entry,height,top,normal},score:distanceSquared(origin,position)-height*.18};
}

function createState(){return {target:null,retry:0,bestDistance:Infinity,stalled:0,attempts:0,searches:0,searchCursor:0,reservationKey:null,lastSearchStats:null,rejected:new Map()};}
function clear(state,clearRejected){
  if(!state)return null;state.target=null;state.retry=0;state.bestDistance=Infinity;state.stalled=0;
  if(clearRejected===true&&state.rejected&&typeof state.rejected.clear==='function')state.rejected.clear();return state;
}
function tick(state,dt){if(state)state.retry=Math.max(0,finite(state.retry,0)-Math.max(0,finite(dt,0)));return state;}

function create(GAME){
  const reservations=new Map(),colliderIds=new WeakMap();let nextColliderId=1;
  function colliderId(collider){
    if(!collider||(typeof collider!=='object'&&typeof collider!=='function'))return String(collider);
    let id=colliderIds.get(collider);if(!id){id=nextColliderId++;colliderIds.set(collider,id);}return id;
  }
  function reservationKey(candidate){
    const normal=candidate&&candidate.found&&candidate.found.normal||{},position=candidate&&candidate.position||{};
    return colliderId(candidate&&candidate.collider)+':'+finite(normal.x,0)+','+finite(normal.z,0)+':'+Math.round(finite(position.x,0)/RESERVATION_QUANTUM)+','+Math.round(finite(position.z,0)/RESERVATION_QUANTUM);
  }
  function releaseReservation(state){
    if(!state||state.reservationKey==null)return false;const key=state.reservationKey,entry=reservations.get(key);
    if(entry&&entry.state===state)reservations.delete(key);state.reservationKey=null;return true;
  }
  function cleanupReservations(now){
    reservations.forEach((entry,key)=>{if(entry.expires>now)return;reservations.delete(key);if(entry.state&&entry.state.reservationKey===key)entry.state.reservationKey=null;});
  }
  function reservationAvailable(candidate,state){const entry=reservations.get(reservationKey(candidate));return !entry||entry.state===state;}
  function reserve(candidate,pawn,state,now){
    const key=reservationKey(candidate),entry=reservations.get(key);if(entry&&entry.state!==state)return false;
    if(state.reservationKey!==key)releaseReservation(state);reservations.set(key,{pawn,state,expires:now+RESERVATION_TTL});state.reservationKey=key;return true;
  }
  function refreshReservation(candidate,pawn,state,now){return reserve(candidate,pawn,state,now);}
  function clearPlan(state,clearRejected){releaseReservation(state);return clear(state,clearRejected);}
  function reject(state,pawn,collider,now){
    if(collider)state.rejected.set(collider,now+1.6+hash((pawn&&pawn.id||'actor')+':cover')*.8);
    releaseReservation(state);state.target=null;state.bestDistance=Infinity;state.stalled=0;state.retry=.18;
  }
  function findBest(pawn,cfg,state,origin,threat,now){
    const boxes=GAME&&GAME.world&&GAME.world.colliders&&GAME.world.colliders.box;if(!Array.isArray(boxes))return null;
    const time=Math.max(0,finite(now,0)),radius=Math.max(8,Math.min(24,finite(cfg&&cfg.tactics&&cfg.tactics.preferredRange,12)*1.45)),radiusSq=radius*radius,total=boxes.length,budget=Math.min(total,MAX_COVER_COLLIDERS),owners=pawnList(GAME),blockers=createBlockerIndex(GAME);let best=null,candidateChecks=0,reservationConflicts=0;
    releaseReservation(state);cleanupReservations(time);state.searches++;state.rejected.forEach((expires,box)=>{if(expires<=time)state.rejected.delete(box);});
    const start=total?Math.max(0,Math.floor(finite(state.searchCursor,0)))%total:0;
    for(let offset=0;offset<budget;offset++){
      const index=(start+offset)%total;
      const box=boxes[index];if(!box||box.compoundRoot||box.horizontalSurface||state.rejected.has(box))continue;
      candidateChecks++;const candidate=candidateFor(pawn,origin,threat,box,owners,blockers);if(!candidate||distanceSquared(origin,candidate.position)>radiusSq)continue;
      if(!reservationAvailable(candidate,state)){reservationConflicts++;continue;}
      if(!best||candidate.score<best.score)best=candidate;
    }
    state.searchCursor=total?(start+budget)%total:0;
    if(best&&!reserve(best,pawn,state,time))best=null;
    state.lastSearchStats=Object.assign(blockers.snapshot(),{coverCandidates:candidateChecks,reservationConflicts});
    if(best){state.attempts++;state.bestDistance=Math.sqrt(distanceSquared(origin,best.position));state.stalled=0;}
    return best;
  }
  function seek(context){
    const input=context||{},pawn=input.pawn,cfg=input.cfg,state=input.state,origin=input.origin,threat=input.threat,dt=Math.max(.001,finite(input.dt,.016)),now=Math.max(0,finite(input.now,0)),motion=input.motion||{};
    if(!state||!(pawn&&pawn.cover&&typeof pawn.cover.inCover==='function'&&typeof pawn.cover.attach==='function')||!origin||!threat)return null;
    if(pawn.cover.inCover()){clearPlan(state,false);return null;}
    let target=state.target;
    if(target&&(!target.collider||target.collider.enabled===false||!segmentHitsBox({x:threat.x,y:finite(target.collider.y,0),z:threat.z},{x:target.position.x,y:finite(target.collider.y,0),z:target.position.z},target.collider))){reject(state,pawn,target.collider,now);target=null;}
    if(target&&!refreshReservation(target,pawn,state,now)){releaseReservation(state);state.target=null;state.bestDistance=Infinity;state.stalled=0;state.retry=.08;target=null;}
    if(!target&&state.retry<=0){target=findBest(pawn,cfg,state,origin,threat,now);state.target=target;if(!target)state.retry=.45+hash((pawn.id||'actor')+':'+Math.floor(now*2))*.35;}
    if(!target)return null;
    const distance=Math.sqrt(distanceSquared(origin,target.position));
    if(distance>.72){
      if(distance<state.bestDistance-.04){state.bestDistance=distance;state.stalled=0;}else state.stalled+=dt;
      if(state.stalled>.9){reject(state,pawn,target.collider,now);if(typeof motion.stop==='function')motion.stop(pawn);return 'cover-retry';}
      if(typeof motion.moveToward==='function')motion.moveToward(pawn,origin,target.position,.92,true,0);return 'seek-cover';
    }
    if(typeof motion.face==='function')motion.face(pawn,finite(target.collider.x,origin.x)-origin.x,finite(target.collider.z,origin.z)-origin.z);
    if(pawn.cover.attach(target.found)){clearPlan(state,false);if(typeof motion.stop==='function')motion.stop(pawn);return 'cover';}
    reject(state,pawn,target.collider,now);if(typeof motion.stop==='function')motion.stop(pawn);return 'cover-retry';
  }
  function dispose(){reservations.forEach(entry=>{if(entry.state)entry.state.reservationKey=null;});reservations.clear();}
  return Object.freeze({version:VERSION,createState,findBest,seek,tick,clear:clearPlan,dispose,reservationCount:()=>reservations.size});
}

root.LK_RUNTIME_ACTOR_COVER_PLANNER=Object.freeze({VERSION,MAX_COVER_COLLIDERS,createState,segmentHitsBox,create});
if(typeof module!=='undefined'&&module.exports)module.exports=root.LK_RUNTIME_ACTOR_COVER_PLANNER;
})(typeof window!=='undefined'?window:globalThis);
