'use strict';

const assert=require('node:assert/strict');
global.window=global;
const created=[];
global.LK_RUNTIME_ENGINE_AUDIO={create(options){
  const manager={options,config:null,muted:null,updates:0,stopped:false,setConfig(value){this.config=value;},start(){},setMuted(value){this.muted=value;},setSkids(){},update(){this.updates++;},stop(){this.stopped=true;}};
  created.push(manager);return manager;
}};
require('../js/runtime/vehicle-engine-audio.js');

const soundSets=new Map([
  ['car-a',{id:'car-a',name:'Car A',updatedAt:1}],
  ['car-b',{id:'car-b',name:'Car B',updatedAt:1}],
]);
const fakeNode=()=>({connect(){},disconnect(){},start(){},stop(){},frequency:{setTargetAtTime(){}},gain:{value:0,setTargetAtTime(){}}});
const GAME={systems:{audio:{getContext:()=>({currentTime:0,createGain:fakeNode,createOscillator:fakeNode}),getCarGain:()=>fakeNode()}}};
function pawn(id,setId){return {id,config:{engineAudio:{enabled:true,volume:.3,pitch:1,setId}},services:{STORE:{soundSets}},state:{rpm:1200,speedKmh:10,throttle:.2},enabled:true,sleeping:false,possessed:true};}

const first=pawn('first','car-a'),second=pawn('second','car-b');
const firstAudio=global.LK_RUNTIME_VEHICLE_ENGINE_AUDIO.create(GAME,first),secondAudio=global.LK_RUNTIME_VEHICLE_ENGINE_AUDIO.create(GAME,second);
firstAudio.update(1/60);secondAudio.update(1/60);
assert.equal(created.length,2,'each vehicle owns an independent sample manager');
assert.notEqual(created[0],created[1]);
assert.equal(created[0].config.id,'car-a');
assert.equal(created[1].config.id,'car-b');
assert.equal(created[0].muted,false);

first.possessed=false;firstAudio.update(1/60);
assert.equal(created[0].muted,true,'an unpossessed vehicle mutes only its own manager');
assert.equal(created[1].muted,false);
firstAudio.configure({setId:'car-b'});first.possessed=true;firstAudio.update(1/60);
assert.equal(created.length,3,'changing one vehicle set rebuilds only that vehicle manager');
assert.equal(created[0].stopped,true);
assert.equal(created[2].config.id,'car-b');
firstAudio.dispose();secondAudio.dispose();
assert.equal(created[2].stopped,true);
assert.equal(created[1].stopped,true);

console.log('vehicle-engine-audio.test.js: all assertions passed');
