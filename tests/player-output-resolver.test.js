'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const window={};
vm.runInNewContext(read('js/runtime/player-output-resolver.js'),{window},{filename:'player-output-resolver.js'});
const OUTPUT=window.LK_RUNTIME_PLAYER_OUTPUT;
assert.ok(OUTPUT&&typeof OUTPUT.resolve==='function');

const camera=id=>({id,userData:{editorId:id,sceneCamera:{id:id+'-camera'}}});
const pawn=(id,playerId,patch)=>Object.assign({id,playerId,possessed:true,enabled:true,hidden:false,owner:{id:id+'-owner'}},patch||{});
const nativePlayer=patch=>Object.assign({enabled:true,hidden:false,controllerIndex:0},patch||{});

const cinema=camera('cinema'),logic=camera('logic'),level=camera('level');
const owned=pawn('owned',1),alias=pawn('alias',1),native=nativePlayer();
const all={playerId:1,cinemaActive:true,cinemaCamera:cinema,logicCamera:logic,possessedPawn:owned,cameraPawn:alias,nativePlayer:native,levelCamera:level};

assert.equal(OUTPUT.resolve(all).kind,'cinema','an active valid Cinema cut owns the output first');
assert.equal(OUTPUT.resolve(Object.assign({},all,{cinemaCamera:null})).kind,'logic-camera','a missing Cinema camera degrades without blocking the remaining authority chain');
assert.equal(OUTPUT.resolve(Object.assign({},all,{cinemaActive:false})).kind,'logic-camera','Logic activation outranks every gameplay camera');
assert.equal(OUTPUT.resolve(Object.assign({},all,{cinemaActive:false,logicCamera:null})).target,owned,'the possession registry is authoritative');
assert.equal(OUTPUT.resolve(Object.assign({},all,{cinemaActive:false,logicCamera:null,possessedPawn:null})).target,alias,'the legacy camera-id map remains a compatible Pawn hint');
assert.equal(OUTPUT.resolve(Object.assign({},all,{cinemaActive:false,logicCamera:null,possessedPawn:pawn('hidden',1,{hidden:true}),cameraPawn:null})).kind,'native-player','hidden Pawns cannot steal output from the native Player');
assert.equal(OUTPUT.resolve(Object.assign({},all,{cinemaActive:false,logicCamera:null,possessedPawn:null,cameraPawn:null,nativePlayer:native})).kind,'native-player','native Player precedes authored fallback');
assert.equal(OUTPUT.resolve(Object.assign({},all,{cinemaActive:false,logicCamera:null,possessedPawn:null,cameraPawn:null,nativePlayer:nativePlayer({enabled:false})})).kind,'level-camera','Active Level Camera is the final usable fallback');
assert.equal(OUTPUT.resolve({playerId:2,nativePlayer:native,levelCamera:level}).kind,'level-camera','the native Player is Player 1 only');
assert.equal(OUTPUT.resolve({playerId:2,possessedPawn:pawn('wrong-player',1),levelCamera:null}).kind,'none','a Pawn cannot own another split-screen Player');
assert.ok(Object.isFrozen(OUTPUT.resolve(all)),'the decision cannot be mutated after resolution');

const editor=read('js/editor/editor-runtime.js');
const playBlock=editor.slice(editor.indexOf('function renderPlayPreview'),editor.indexOf('function renderEditorViewport'));
assert.match(playBlock,/outputApi\.resolve\(/,'Editor Play consumes the shared resolver');
assert.match(playBlock,/cinemaInputLocked=output\.kind==='cinema'/,'Editor Play locks input only when Cinema owns a valid output');

const runtime=read('js/lot-king.js');
const sceneBlock=runtime.slice(runtime.indexOf('function updateSceneCameraOverride'),runtime.indexOf("window.addEventListener('lotking:cinemastart'"));
assert.match(sceneBlock,/resolveRuntimePlayerOutput\(1/,'standalone Player 1 consumes the shared resolver adapter');
assert.match(sceneBlock,/runtimeCinemaState&&runtimeCinemaState\.playerId===1/,'a Cinema assigned to Player 2–4 cannot steal Player 1 output');
const splitBlock=runtime.slice(runtime.indexOf('function localPlayerOutputs'),runtime.indexOf('function requestRuntimeCameraPointerLock'));
assert.match(splitBlock,/map\(id=>resolveRuntimePlayerOutput\(id\)\)/,'every split-screen Player uses the same authority order');
assert.ok(!/output\.camera[\s\S]*else if\(pawn/.test(splitBlock),'split-screen no longer has a separate camera-before-Pawn priority tree');
assert.match(splitBlock,/runtimeActiveOutputPlayerId=output\.playerId[\s\S]*finally\{[\s\S]*runtimeActiveOutputPlayerId=previousOutputPlayerId/,
  'split-screen scopes and restores the active output Player even when rendering throws');

['engine_editor.html','gameplay.html','test-editor.html'].forEach(file=>{
  const source=read(file),resolverAt=source.indexOf('js/runtime/player-output-resolver.js'),runtimeAt=source.indexOf('js/lot-king.js');
  assert.ok(resolverAt>=0&&resolverAt<runtimeAt,file+' must load Player output authority before the runtime');
});

console.log('player output resolver tests passed');
