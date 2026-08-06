'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const sequence=require('../js/runtime/cinema-sequence.js');

const authoredLoop=sequence.advancePlayback(5.9,.2,6,'loop',null);
assert.equal(authoredLoop.looped,true,'an unopposed Cinema Studio loop remains a loop');
assert.ok(authoredLoop.time<.11);
const logicCompletion=sequence.advancePlayback(5.9,.2,6,'loop','once');
assert.deepEqual(
  {time:logicCompletion.time,looped:logicCompletion.looped,completed:logicCompletion.completed,mode:logicCompletion.mode},
  {time:6,looped:false,completed:true,mode:'once'},
  'a Logic Completed contract overrides the authored loop for that invocation'
);
const authoredExit=sequence.resolveCompletion({completion:{mode:'blend',duration:1.25,curve:'ease-in-out',playerId:1,pawnId:'hero'}},null,1);
assert.deepEqual(
  {mode:authoredExit.mode,duration:authoredExit.duration,curve:authoredExit.curve,playerId:authoredExit.playerId,pawnId:authoredExit.pawnId},
  {mode:'blend',duration:1.25,curve:'ease-in-out',playerId:1,pawnId:'hero'},
  'Cinema Studio persists a complete smooth return-camera contract'
);
const nodeOverride=sequence.resolveCompletion({completion:{mode:'cut',duration:1}}, {mode:'blend',duration:.4,playerId:2}, 1);
assert.equal(nodeOverride.mode,'blend');
assert.equal(nodeOverride.duration,.4);
assert.equal(nodeOverride.playerId,2,'a Logic invocation may override the authored return controller');

const keys=[
  {time:0,position:[0,2,8],rotation:[0,0,0],scale:[1,1,1],curve:'ease-in-out',spatialMode:'broken',tangentOut:[2,2,0]},
  {time:6,position:[8,4,0],rotation:[0,1,0],scale:[1,1,1],spatialMode:'broken',tangentIn:[-2,2,0]},
];
const pair=sequence.keyPair(keys,3);
const alpha=sequence.curveAlpha(.5,pair.prev.curve);
const curved=sequence.spatialPosition({pathMode:'bezier'},pair.keys,pair.segmentIndex,alpha);
const linear=sequence.spatialPosition({pathMode:'linear'},pair.keys,pair.segmentIndex,alpha);
assert.deepEqual(pair.prev,keys[0]);
assert.deepEqual(pair.next,keys[1]);
assert.notDeepEqual(curved,linear,'authored tangents must bend the runtime path');
assert.ok(curved[1]>linear[1],'the explicit upward handles must survive Play/export evaluation');

const runtime=fs.readFileSync(path.join(__dirname,'../js/lot-king.js'),'utf8');
const editor=fs.readFileSync(path.join(__dirname,'../js/editor/cinema-studio.js'),'utf8');
const editorRuntime=fs.readFileSync(path.join(__dirname,'../js/editor/editor-runtime.js'),'utf8');
assert.match(runtime,/LK_RUNTIME_CINEMA_SEQUENCE/,'gameplay consumes the shared evaluator');
assert.match(runtime,/evaluator\.spatialPosition\(track,pair\.keys,pair\.segmentIndex,alpha\)/,
  'gameplay position uses pathMode and authored tangents');
assert.match(runtime,/evaluator\.advancePlayback\(state\.time,dt,duration,props\.playback,state\.playbackOverride\)/,
  'standalone gameplay uses the shared completion/loop policy');
assert.match(runtime,/updateRuntimeCinemaCompletionBlend/,'standalone gameplay owns the camera until the completion blend ends');
assert.match(runtime,/completeRuntimeCinema\(studio,state,state\.time\)/,'Completed is dispatched after the final blend frame');
assert.match(runtime,/editorActive\) return;/,'Editor Play keeps a single Cinema state machine instead of applying the blend twice');
assert.match(runtime,/runtimeCinemaAutoStarted\.add\(studioId\)/,
  'an explicit Logic start suppresses a duplicate automatic On Play restart');
assert.match(editorRuntime,/if\(explicit\)return true/,
  'Editor Play cannot overwrite an explicit Logic cinema with its automatic On Play scan');
assert.match(editorRuntime,/__completionBlendAlpha/,'Editor Play renders the same end-camera blend');
assert.match(editor,/require\('\.\.\/runtime\/cinema-sequence\.js'\)/,
  'the Node/editor test path consumes the same module');

console.log('cinema sequence runtime parity tests: ok');
