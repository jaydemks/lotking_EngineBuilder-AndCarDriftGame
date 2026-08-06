'use strict';

const assert=require('node:assert/strict');
const CANNON=require('cannon');

global.window=global;
require('../js/runtime/world-state.js');
require('../js/runtime/physics-world.js');
const catRuntime=require('../js/runtime/cat-neighborhood-level-template.js');

function test(name,run){
  try{run();console.log('ok - '+name);}
  catch(error){console.error('not ok - '+name);throw error;}
}

test('427 static Open World colliders stay outside lightweight per-frame integration and pair passes',()=>{
  const world=global.LK_RUNTIME_WORLD_STATE.create();
  let ownerTouches=0;
  for(let index=0;index<427;index++){
    const collider={enabled:true,physics:false,x:index,z:0,hx:.5,hy:.5,hz:.5};
    Object.defineProperty(collider,'owner',{get(){ownerTouches++;return {position:{x:index,y:0,z:0},rotation:{x:0,y:0,z:0},userData:{}};}});
    world.colliders.box.push(collider);
  }
  for(let frame=0;frame<120;frame++)world.updatePhysicsObjects(1/60);
  assert.equal(ownerTouches,0,'static collider owners must not be sampled by dynamic integration');
});

test('dynamic lightweight bodies still integrate and separate after static filtering',()=>{
  const world=global.LK_RUNTIME_WORLD_STATE.create();
  const owner=x=>({position:{x,y:0,z:0},rotation:{x:0,y:0,z:0},userData:{physicsVel:{x:0,y:0,z:0}}});
  const aOwner=owner(0),bOwner=owner(.5);
  world.colliders.circle.push(
    {enabled:true,physics:true,owner:aOwner,x:0,y:0,z:0,r:1,mass:1},
    {enabled:true,physics:true,owner:bOwner,x:.5,y:0,z:0,r:1,mass:1}
  );
  world.updatePhysicsObjects(1/60);
  assert.ok(Math.abs(bOwner.position.x-aOwner.position.x)>=1.99,'two movable bodies must still resolve their overlap');
});

test('Cannon static rebuild detaches Logic Element backlinks and collision listeners',()=>{
  const ref={enabled:true,physics:false,logicElementCollider:true,logicElementId:'logic-box',owner:{userData:{}},x:0,y:1,z:0,hx:1,hy:1,hz:1};
  let revision=1,events=0;
  const previousDispatch=global.dispatchEvent,previousCustomEvent=global.CustomEvent;
  global.dispatchEvent=()=>{events++;return true;};
  global.CustomEvent=function(type,options){this.type=type;this.detail=options&&options.detail;};
  const adapter=global.LK_RUNTIME_PHYSICS_WORLD.create({
    CANNONRef:CANNON,
    worldState:{colliderSignature(){return String(revision);}},
    playerState:{pos:{x:0,y:0,z:0},vel:{x:0,y:0,z:0},heading:0},
    playerCollision:{},
    colliders:{box:[ref],circle:[]},
  });
  try{
    assert.equal(adapter.init(),true);
    const first=ref.cannonBody;
    assert.ok(first&&first.__lkLogicColliderHandler);
    first.dispatchEvent({type:'collide',body:null,contact:null});
    assert.equal(events,1);
    revision++;
    assert.equal(adapter.rebuildStatics(true),true);
    assert.notEqual(ref.cannonBody,first);
    assert.equal(first.__lkLogicColliderRef,null);
    assert.equal(first.__lkLogicColliderHandler,null);
    first.dispatchEvent({type:'collide',body:null,contact:null});
    assert.equal(events,1,'removed body must not retain or dispatch its old Logic Element listener');
    adapter.dispose();
    assert.equal(ref.cannonBody,null,'dispose must clear the last collider backlink');
  } finally {
    adapter.dispose();
    global.dispatchEvent=previousDispatch;
    global.CustomEvent=previousCustomEvent;
  }
});

test('Cat Adventure prunes removed trigger state without requiring Play to stop',()=>{
  const registry=[];
  const game={
    state:{started:true},world:{registry},systems:{},
    pawns:{getByPlayerId(){return {position:{x:1000,y:0,z:1000}};}},
  };
  const system=catRuntime.createCatAdventureSystem(game);
  const makeTrigger=index=>({uuid:'cat-trigger-'+index,position:{x:index,y:0,z:0},rotation:{y:0},userData:{logicGraph:{catAdventureTrigger:{kind:'friendly',enabled:false,radius:1}}}});
  for(let cycle=0;cycle<20;cycle++){
    registry.push(...Array.from({length:100},(_,index)=>makeTrigger(cycle*100+index)));
    system.update(1/60);
    assert.equal(system.states.size,100);
    registry.length=0;
    system.update(1/60);
    assert.equal(system.states.size,0,'removed level triggers must not accumulate in the app-lifetime Map');
  }
});

require('../js/engine/level-template-registry.js');
require('../js/runtime/open-world-districts.js');
require('../js/runtime/sketchbook-open-world-level-template.js');
require('../js/runtime/open-world-streaming.js');

test('district streaming never touches the Cannon static set',()=>{
  // The whole reason the ring splits authored collision from streamed visuals.
  // colliderSignature() is what physics-world.js diffs to decide whether to
  // rebuild every static body - one of the most expensive synchronous
  // operations in the engine. If streaming ever registered a collider, the
  // signature would change every time the player crossed a 352 m cell line and
  // the world would rebuild its physics a few times a minute.
  const world=global.LK_RUNTIME_WORLD_STATE.create();
  const scene=global.LK_RUNTIME_SKETCHBOOK_OPEN_WORLD_LEVEL_TEMPLATE.buildScene();
  const drivable=scene.added.filter(entry=>entry.collide===true&&entry.t);
  assert.ok(drivable.length>200,'the ring must author a real collidable surface');
  drivable.forEach(entry=>{
    world.colliders.box.push({enabled:true,physics:false,
      x:entry.t.p[0],y:entry.t.p[1],z:entry.t.p[2],
      hx:entry.t.s[0],hy:entry.t.s[1],hz:entry.t.s[2],
      rotX:entry.t.r[0],rotY:entry.t.r[1],rotZ:entry.t.r[2]});
  });
  const before=world.colliderSignature();
  const game={camera:{position:{x:0,y:60,z:-2816}},scene:null,systems:{},hooks:{frame:[]},world,state:{}};
  const streaming=global.LK_RUNTIME_OPEN_WORLD_STREAMING.create(game,{quality:'high',seed:1337});
  streaming.settle(60,64);
  for(let frame=0;frame<900;frame++){
    game.camera.position.x+=2.4;
    game.camera.position.z+=1.1;
    streaming.update(1/60);
  }
  assert.equal(world.colliderSignature(),before,'streaming must not add, move or remove a single collider');
  const stats=streaming.stats();
  assert.ok(stats.tiles+stats.blocks<=120,'resident cell budget exceeded: '+(stats.tiles+stats.blocks));
  streaming.dispose();
});

test('the streaming warm pass terminates under every quality tier',()=>{
  // docs/TODO_IMPROVING.md note 4.4: a warm pass that never finished stopped
  // Play from starting. settle() must return inside its own budget on every
  // tier, including the worst case where no geometry can be built at all.
  global.LK_RUNTIME_OPEN_WORLD_STREAMING.TIER_IDS.forEach(id=>{
    const game={camera:{position:{x:2816,y:80,z:2816}},scene:null,systems:{},hooks:{frame:[]},world:{registry:[]},state:{}};
    const streaming=global.LK_RUNTIME_OPEN_WORLD_STREAMING.create(game,{quality:id,seed:1337});
    const started=Date.now();
    streaming.settle(50,256);
    const elapsed=Date.now()-started;
    assert.ok(elapsed<1500,id+' warm pass overran its budget: '+elapsed+' ms');
    streaming.dispose();
  });
});

console.log('Open World performance regression tests passed.');
