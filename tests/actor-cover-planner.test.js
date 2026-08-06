'use strict';

const assert=require('node:assert/strict');

global.window=global;
const COVER=require('../js/runtime/ai/actor-cover-planner.js');
const MAX_BUCKET_REFS_FOR_TEST=64;

function test(name,run){try{run();console.log('ok - '+name);}catch(error){console.error('not ok - '+name);throw error;}}
function node(x,z){return {position:{x:x||0,y:0,z:z||0},parent:null};}
function pawn(id,x,z){
  const actor={id,owner:node(x,z),config:{movement:{height:1.8,radius:.35}},attached:null,attachCalls:0};
  actor.cover={config:()=>({hugDistance:.42}),inCover:()=>!!actor.attached,attach:found=>{actor.attachCalls++;actor.attached=found;return true;}};
  return actor;
}
function game(pawns){return {pawns:{list:()=>pawns},world:{colliders:{box:[],circle:[]}}};}
function wall(overrides){return Object.assign({enabled:true,cover:true,x:0,y:1,z:4,hx:2,hy:1,hz:.4},overrides||{});}
function context(actor,state,origin,threat,extra){
  return Object.assign({pawn:actor,cfg:{tactics:{preferredRange:7}},state,origin,threat,dt:.1,now:0,motion:{moveToward(){},face(){},stop(){}}},extra||{});
}

test('cyclic bounded searches discover cover beyond collider 255 on the next retry',()=>{
  const actor=pawn('cover-searcher',0,0),enemy=pawn('cover-threat',0,10),GAME=game([actor,enemy]),planner=COVER.create(GAME),state=planner.createState();
  for(let index=0;index<280;index++)GAME.world.colliders.box.push(wall({enabled:false,z:100+index}));
  const lateWall=wall({z:4});GAME.world.colliders.box.push(lateWall);
  const first=planner.seek(context(actor,state,{x:0,y:0,z:0},{x:0,y:0,z:10}));
  assert.equal(first,null);assert.equal(state.searches,1);assert.equal(state.target,null);assert.equal(state.searchCursor,256);
  planner.tick(state,1);
  const second=planner.seek(context(actor,state,{x:0,y:0,z:0},{x:0,y:0,z:10},{now:1}));
  assert.equal(second,'seek-cover');assert.equal(state.searches,2);assert.equal(state.target.collider,lateWall);assert.equal(actor.attachCalls,0,'distant cover is approached, never attached remotely');
  const destination=Object.assign({},state.target.position);
  const attached=planner.seek(context(actor,state,destination,{x:0,y:0,z:10},{now:1.1}));
  assert.equal(attached,'cover');assert.equal(actor.attachCalls,1);assert.equal(actor.attached.collider,lateWall);assert.equal(planner.reservationCount(),0,'attach releases the approach reservation');
});

test('Pawn colliders are never cover; self clears the point while a bystander occupies it',()=>{
  const actor=pawn('cover-owner',0,0),enemy=pawn('cover-enemy',0,10),bystander=pawn('cover-bystander',2,2),GAME=game([actor,enemy,bystander]),planner=COVER.create(GAME),state=planner.createState();
  const direct=wall({z:1.5,owner:bystander.owner});
  const ownerChild={parent:bystander.owner},nestedOwner=wall({z:2.2,owner:ownerChild});
  const logicChild={parent:enemy.owner},nestedLogic=wall({z:2.6,logicElementOwner:logicChild});
  const parentOwned=wall({z:3,parent:bystander.owner});
  const worldWall=wall({z:5});
  const selfCircle={enabled:true,x:0,y:.9,z:4.18,r:.7,hy:.9,owner:{parent:actor.owner}};
  GAME.world.colliders.box.push(direct,nestedOwner,nestedLogic,parentOwned,worldWall);GAME.world.colliders.circle.push(selfCircle);
  const best=planner.findBest(actor,{tactics:{preferredRange:7}},state,{x:0,y:0,z:0},{x:0,y:0,z:10},0);
  assert.ok(best);assert.equal(best.collider,worldWall,'a Pawn body/Logic Element is never selected as world cover and self does not block movement');
  planner.clear(state,false);GAME.world.colliders.circle.push({enabled:true,x:0,y:.9,z:4.18,r:.7,hy:.9,logicElementOwner:{parent:bystander.owner}});
  const occupied=planner.findBest(actor,{tactics:{preferredRange:7}},planner.createState(),{x:0,y:0,z:0},{x:0,y:0,z:10},.1);
  assert.equal(occupied,null,'another Pawn physically occupying the destination blocks it');
});

test('only blockers overlapping the Pawn vertical span reject a cover point',()=>{
  const actor=pawn('vertical-cover',0,0),enemy=pawn('vertical-threat',0,10),GAME=game([actor,enemy]),planner=COVER.create(GAME),worldWall=wall({z:4});
  const roof=wall({cover:false,z:3.18,y:2.8,hy:.5,hx:1,hz:1}),below=wall({cover:false,z:3.18,y:-.5,hy:.5,hx:1,hz:1});
  GAME.world.colliders.box.push(worldWall,roof,below);
  const open=planner.findBest(actor,{tactics:{preferredRange:7}},planner.createState(),{x:0,y:0,z:0},{x:0,y:0,z:10},0);
  assert.ok(open);assert.equal(open.collider,worldWall,'a roof above and geometry ending at the feet do not block the point');
  planner.dispose();
  const blockedPlanner=COVER.create(GAME);
  GAME.world.colliders.box.push(wall({cover:false,z:3.18,y:.9,hy:.45,hx:1,hz:1}));
  const blocked=blockedPlanner.findBest(actor,{tactics:{preferredRange:7}},blockedPlanner.createState(),{x:0,y:0,z:0},{x:0,y:0,z:10},0);
  assert.equal(blocked,null,'a collider crossing the body height still blocks the point');
});

test('the shared blocker index sees an obstacle beyond the cover-search budget',()=>{
  const actor=pawn('late-blocker-actor',0,0),enemy=pawn('late-blocker-threat',0,10),GAME=game([actor,enemy]),planner=COVER.create(GAME),state=planner.createState(),worldWall=wall({z:4});
  GAME.world.colliders.box.push(worldWall);for(let index=0;index<300;index++)GAME.world.colliders.box.push(wall({cover:false,x:100+index,z:100,hy:.2,hx:.2,hz:.2}));
  const lateBlocker=wall({cover:false,z:3.18,y:.9,hy:.45,hx:1,hz:1});GAME.world.colliders.box.push(lateBlocker);
  const best=planner.findBest(actor,{tactics:{preferredRange:7}},state,{x:0,y:0,z:0},{x:0,y:0,z:10},0);
  assert.equal(best,null);assert.ok(GAME.world.colliders.box.indexOf(lateBlocker)>255);assert.ok(state.lastSearchStats.indexedColliders>255,'blocker indexing is complete even though cover candidate scanning is bounded');
});

test('one spatial index keeps thousands of blocker checks subquadratic',()=>{
  const actor=pawn('perf-cover-actor',0,0),enemy=pawn('perf-cover-threat',0,30),GAME=game([actor,enemy]),planner=COVER.create(GAME),state=planner.createState();
  for(let index=0;index<256;index++)GAME.world.colliders.box.push(wall({x:-15+(index%16)*2,z:2+Math.floor(index/16),hx:.4,hz:.2}));
  for(let index=0;index<6000;index++)GAME.world.colliders.box.push(wall({cover:false,x:100+(index%100)*5,z:100+Math.floor(index/100)*5,y:.2,hy:.2,hx:.2,hz:.2}));
  planner.findBest(actor,{tactics:{preferredRange:16}},state,{x:0,y:0,z:0},{x:0,y:0,z:30},0);
  const stats=state.lastSearchStats;assert.equal(stats.coverCandidates,256);assert.ok(stats.queries>=128&&stats.queries<=256);assert.ok(stats.indexedColliders>=6256);
  assert.ok(stats.entryVisits<stats.sourceColliders*4,'bucket queries visit nearby entries, not 256 times every world collider');assert.ok(stats.exactTests<stats.sourceColliders*4);assert.ok(stats.bucketReferences<=stats.indexedColliders*MAX_BUCKET_REFS_FOR_TEST);
});

test('approaching actors reserve distinct slots and release reservations on every exit',()=>{
  const first=pawn('slot-first',-2,0),second=pawn('slot-second',2,0),enemy=pawn('slot-threat',0,12),GAME=game([first,second,enemy]),planner=COVER.create(GAME),firstState=planner.createState(),secondState=planner.createState(),longWall=wall({z:5,hx:5});
  GAME.world.colliders.box.push(longWall);
  const firstPlan=planner.findBest(first,{tactics:{preferredRange:8}},firstState,{x:-2,y:0,z:0},{x:0,y:0,z:12},0),secondPlan=planner.findBest(second,{tactics:{preferredRange:8}},secondState,{x:2,y:0,z:0},{x:0,y:0,z:12},0);
  assert.equal(firstPlan.collider,longWall);assert.equal(secondPlan.collider,longWall);assert.notEqual(firstState.reservationKey,secondState.reservationKey,'a long wall exposes independent quantized slots');assert.equal(planner.reservationCount(),2);
  firstState.target=firstPlan;longWall.enabled=false;planner.seek(context(first,firstState,{x:-2,y:0,z:0},{x:0,y:0,z:12},{now:.1}));assert.equal(planner.reservationCount(),1,'reject releases only its own slot');
  longWall.enabled=true;planner.clear(secondState,false);assert.equal(planner.reservationCount(),0,'clear releases the remaining slot');
  const finalState=planner.createState();assert.ok(planner.findBest(first,{tactics:{preferredRange:8}},finalState,{x:-2,y:0,z:0},{x:0,y:0,z:12},.2));assert.equal(planner.reservationCount(),1);
  planner.dispose();assert.equal(planner.reservationCount(),0);assert.equal(finalState.reservationKey,null,'dispose clears state ownership as well as the reservation map');
});

console.log('Actor Cover Planner tests passed.');
