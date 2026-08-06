/* =========================================================
   LOT KING — deterministic local Player output authority

   Pure resolver shared by runtime, Editor Play and split-screen. It chooses
   ownership only; callers remain responsible for updating/copying the selected
   camera. No scene, global state or renderer is read here.
   ========================================================= */
(function(){
'use strict';

const root=typeof window!=='undefined'?window:globalThis;
const MIN_PLAYER=1,MAX_PLAYER=4;

function playerId(value){
  const id=Number(value);
  return Number.isInteger(id)&&id>=MIN_PLAYER&&id<=MAX_PLAYER?id:1;
}
function validCamera(holder){
  return !!(holder&&holder.userData&&holder.userData.sceneCamera);
}
function validPawn(pawn,id){
  return !!(pawn&&pawn.possessed===true&&Number(pawn.playerId)===id&&pawn.enabled!==false&&pawn.hidden!==true&&pawn.owner);
}
function validNativePlayer(nativePlayer,id){
  return id===1&&!!(nativePlayer&&nativePlayer.enabled!==false&&nativePlayer.hidden!==true&&nativePlayer.controllerIndex!=null);
}
function result(kind,id,target){
  const output={kind,playerId:id,target:target||null,camera:null,pawn:null,nativePlayer:null};
  if(kind==='cinema'||kind==='logic-camera'||kind==='level-camera')output.camera=target;
  else if(kind==='pawn')output.pawn=target;
  else if(kind==='native-player')output.nativePlayer=target;
  return Object.freeze(output);
}
function resolve(context){
  const source=context||{},id=playerId(source.playerId);
  if(source.cinemaActive===true&&validCamera(source.cinemaCamera))return result('cinema',id,source.cinemaCamera);
  if(validCamera(source.logicCamera))return result('logic-camera',id,source.logicCamera);

  // The possession registry is authoritative. The legacy camera-id map is only
  // a compatibility hint and may lag behind possess/unpossess by one graph step.
  if(validPawn(source.possessedPawn,id))return result('pawn',id,source.possessedPawn);
  if(validPawn(source.cameraPawn,id))return result('pawn',id,source.cameraPawn);

  if(validNativePlayer(source.nativePlayer,id))return result('native-player',id,source.nativePlayer);
  if(validCamera(source.levelCamera))return result('level-camera',id,source.levelCamera);
  return result('none',id,null);
}

root.LK_RUNTIME_PLAYER_OUTPUT=Object.freeze({resolve,validCamera,validPawn,validNativePlayer});
})();
