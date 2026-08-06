/* =========================================================
   LOT KING - CINEMA SEQUENCE EVALUATION

   Pure interpolation shared by Cinema Studio, Editor Play and exported runtime.
   Keeping one evaluator is the contract that makes an authored spline identical
   everywhere it is previewed or played.
   ========================================================= */
(function(root){
'use strict';

function finite(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function vec3(value,fallback){
  const source=Array.isArray(value)?value:(fallback||[0,0,0]);
  return [finite(source[0],0),finite(source[1],0),finite(source[2],0)];
}
function lerpArray(a,b,t){
  const from=Array.isArray(a)?a:[],to=Array.isArray(b)?b:[],alpha=clamp(finite(t,0),0,1);
  return from.map((value,index)=>finite(value,0)+(finite(to[index],finite(value,0))-finite(value,0))*alpha);
}
function cubicBezierArray(p0,p1,p2,p3,t){
  const x=clamp(finite(t,0),0,1),inv=1-x;
  return [0,1,2].map(index=>inv*inv*inv*p0[index]+3*inv*inv*x*p1[index]+3*inv*x*x*p2[index]+x*x*x*p3[index]);
}
function automaticTangent(keys,index,direction){
  const list=Array.isArray(keys)?keys:[],safe=clamp(Number(index)||0,0,Math.max(0,list.length-1));
  const current=vec3(list[safe]&&list[safe].position);
  const previous=vec3(list[Math.max(0,safe-1)]&&list[Math.max(0,safe-1)].position,current);
  const next=vec3(list[Math.min(list.length-1,safe+1)]&&list[Math.min(list.length-1,safe+1)].position,current);
  const scale=direction==='in'?-1/6:1/6;
  return [0,1,2].map(i=>(next[i]-previous[i])*scale);
}
function spatialPosition(track,keys,segmentIndex,t){
  const list=Array.isArray(keys)?keys:[],index=clamp(Number(segmentIndex)||0,0,Math.max(0,list.length-2));
  const current=list[index],next=list[index+1];
  const p0=vec3(current&&current.position),p3=vec3(next&&next.position,p0);
  const mode=track&&track.pathMode||'linear',alpha=clamp(finite(t,0),0,1);
  if(mode==='linear'||!next)return lerpArray(p0,p3,alpha);
  const outTangent=mode==='bezier'&&current&&current.spatialMode!=='auto'&&Array.isArray(current.tangentOut)
    ?vec3(current.tangentOut):automaticTangent(list,index,'out');
  const inTangent=mode==='bezier'&&next&&next.spatialMode!=='auto'&&Array.isArray(next.tangentIn)
    ?vec3(next.tangentIn):automaticTangent(list,index+1,'in');
  return cubicBezierArray(p0,p0.map((value,i)=>value+outTangent[i]),p3.map((value,i)=>value+inTangent[i]),p3,alpha);
}
function curveAlpha(t,mode){
  const x=clamp(finite(t,0),0,1);
  if(mode==='ease-in')return x*x;
  if(mode==='ease-out')return 1-Math.pow(1-x,2);
  if(mode==='ease-in-out'||mode==='manual')return x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2;
  return x;
}
function keyPair(keys,time){
  const sorted=(Array.isArray(keys)?keys:[]).slice().sort((a,b)=>finite(a&&a.time,0)-finite(b&&b.time,0));
  if(!sorted.length)return null;
  let prev=sorted[0],next=sorted[sorted.length-1];
  for(let i=0;i<sorted.length;i++){
    if(finite(sorted[i]&&sorted[i].time,0)<=time)prev=sorted[i];
    if(finite(sorted[i]&&sorted[i].time,0)>=time){next=sorted[i];break;}
  }
  return {keys:sorted,prev,next,segmentIndex:Math.max(0,Math.min(sorted.length-2,sorted.indexOf(prev)))};
}
function playbackMode(authored,override){
  if(override==='once')return 'once';
  return authored==='loop'?'loop':'once';
}
function advancePlayback(time,delta,duration,authored,override){
  const length=Math.max(.1,finite(duration,6));
  const previous=clamp(finite(time,0),0,length);
  const next=previous+Math.max(0,finite(delta,0));
  const mode=playbackMode(authored,override);
  if(next<length)return {time:next,previous,duration:length,mode,looped:false,completed:false};
  if(mode==='loop')return {time:next%length,previous,duration:length,mode,looped:true,completed:false};
  return {time:length,previous,duration:length,mode,looped:false,completed:true};
}

const COMPLETION_DEFAULTS=Object.freeze({mode:'cut',duration:1,curve:'ease-in-out',playerId:null,pawnId:''});
function normalizeCompletion(value,fallbackPlayerId){
  const source=value&&typeof value==='object'?value:{};
  const rawPlayer=source.playerId==null||source.playerId===''?fallbackPlayerId:source.playerId;
  const player=Number(rawPlayer);
  return {
    mode:source.mode==='blend'?'blend':'cut',
    duration:clamp(finite(source.duration,COMPLETION_DEFAULTS.duration),0,30),
    curve:['linear','ease-in','ease-out','ease-in-out'].includes(source.curve)?source.curve:COMPLETION_DEFAULTS.curve,
    playerId:Number.isInteger(player)&&player>=1&&player<=4?player:null,
    pawnId:typeof source.pawnId==='string'?source.pawnId.trim():'',
    pawnRef:source.pawnRef||null,
  };
}
function resolveCompletion(props,override,fallbackPlayerId){
  const authored=normalizeCompletion(props&&props.completion,fallbackPlayerId);
  const source=override&&typeof override==='object'?override:{};
  const merged=Object.assign({},authored);
  if(source.mode==='cut'||source.mode==='blend')merged.mode=source.mode;
  if(Number.isFinite(Number(source.duration))&&Number(source.duration)>=0)merged.duration=Number(source.duration);
  if(['linear','ease-in','ease-out','ease-in-out'].includes(source.curve))merged.curve=source.curve;
  if(source.playerId!=null&&source.playerId!=='')merged.playerId=source.playerId;
  if(typeof source.pawnId==='string')merged.pawnId=source.pawnId;
  if(source.pawnRef)merged.pawnRef=source.pawnRef;
  return normalizeCompletion(merged,fallbackPlayerId);
}

const api=Object.freeze({COMPLETION_DEFAULTS,advancePlayback,automaticTangent,cubicBezierArray,curveAlpha,keyPair,lerpArray,normalizeCompletion,playbackMode,resolveCompletion,spatialPosition,vec3});
root.LK_RUNTIME_CINEMA_SEQUENCE=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
