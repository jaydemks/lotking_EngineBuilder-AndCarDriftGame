/* =========================================================
   LOT KING — Blender Live Link protocol core
   Pure helpers shared by the editor plugin and Node tests.
   ========================================================= */
(function(root){
'use strict';

const PROTOCOL='lotking.blender-live-link';
const VERSION=1;
const MAX_ASSET_BYTES=1024*1024*1024;
const CHUNK_BYTES=192*1024;

function finite(value,fallback){const n=Number(value);return Number.isFinite(n)?n:(fallback||0);}
function vector(source,length,fallback){const input=Array.isArray(source)?source:[];return Array.from({length},(_,i)=>finite(input[i],fallback&&fallback[i]));}
function cleanId(value){return String(value||'').trim().replace(/[^a-zA-Z0-9_.:-]/g,'_').slice(0,160);}
function cleanName(value){return String(value||'Object').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,240)||'Object';}
function localEndpoint(value){
  try{const url=new URL(String(value||''));return (url.protocol==='ws:'||url.protocol==='wss:')&&['127.0.0.1','localhost','[::1]','::1'].includes(url.hostname)?url.toString():null;}
  catch(error){return null;}
}
function transformOf(object){
  const p=object&&object.position||{},q=object&&object.quaternion||{},s=object&&object.scale||{};
  return {position:[finite(p.x),finite(p.y),finite(p.z)],quaternion:[finite(q.x),finite(q.y),finite(q.z),Number.isFinite(Number(q.w))?Number(q.w):1],scale:[finite(s.x,1),finite(s.y,1),finite(s.z,1)],visible:object&&object.visible!==false};
}
function normalizeTransform(value){value=value||{};return {position:vector(value.position,3,[0,0,0]),quaternion:vector(value.quaternion,4,[0,0,0,1]),scale:vector(value.scale,3,[1,1,1]),visible:value.visible!==false};}
function entityOf(object){
  const data=object&&object.userData||{};
  return {id:cleanId(data.editorId||data.lkBridgeId),name:cleanName(data.editorName||object&&object.name),type:cleanName(data.editorType||'mesh'),parentId:cleanId(data.linkParentId||''),transform:transformOf(object)};
}
function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
function signature(value){return stable(value);}
function envelope(type,payload,meta){
  const extra=meta||{};
  return {protocol:PROTOCOL,version:VERSION,type:String(type||''),messageId:cleanId(extra.messageId||('m-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9))),senderId:cleanId(extra.senderId||''),sentAt:new Date().toISOString(),payload:payload||{}};
}
function validEnvelope(value){return !!(value&&value.protocol===PROTOCOL&&value.version===VERSION&&typeof value.type==='string'&&value.type.length<=80&&value.payload&&typeof value.payload==='object');}

function createJournal(senderId){
  const revisions=new Map(),acceptedSignatures=new Map(),dirty=new Set(),conflicts=new Map();let clock=0;
  function revision(id){return revisions.get(cleanId(id))||0;}
  function accept(id,rev,value){id=cleanId(id);revisions.set(id,Math.max(revision(id),finite(rev)));acceptedSignatures.set(id,signature(value));dirty.delete(id);conflicts.delete(id);clock=Math.max(clock,finite(rev));}
  function local(id,value){id=cleanId(id);clock=Math.max(clock,revision(id))+1;revisions.set(id,clock);acceptedSignatures.set(id,signature(value));dirty.add(id);return {entity:value,revision:clock,baseRevision:Math.max(0,clock-1),author:senderId};}
  function incoming(id,value,rev,baseRevision,author){
    id=cleanId(id);const current=revision(id),next=finite(rev),base=finite(baseRevision);
    if(next<=current&&signature(value)===acceptedSignatures.get(id))return {status:'duplicate'};
    if(dirty.has(id)&&base<current&&author!==senderId){const conflict={id,localRevision:current,remoteRevision:next,remote:value,author:cleanId(author)};conflicts.set(id,conflict);return {status:'conflict',conflict};}
    accept(id,next,value);return {status:'apply'};
  }
  return Object.freeze({revision,accept,local,incoming,conflicts:()=>Array.from(conflicts.values()),resolve(id,choice){id=cleanId(id);const item=conflicts.get(id);if(!item)return null;conflicts.delete(id);if(choice==='remote'){accept(id,item.remoteRevision,item.remote);return item.remote;}dirty.add(id);return null;},markClean:id=>dirty.delete(cleanId(id))});
}

function bytesToBase64(bytes){
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0);let text='';
  for(let offset=0;offset<data.length;offset+=0x8000)text+=String.fromCharCode.apply(null,data.subarray(offset,Math.min(data.length,offset+0x8000)));
  return btoa(text);
}
function base64ToBytes(text){const raw=atob(String(text||'')),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
function assetChunks(bytes,chunkSize){
  const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes||0);if(data.byteLength>MAX_ASSET_BYTES)throw new Error('Asset exceeds 1 GiB live-link limit');
  const size=Math.max(16*1024,Math.min(512*1024,finite(chunkSize,CHUNK_BYTES)));const chunks=[];
  for(let offset=0;offset<data.length;offset+=size)chunks.push(bytesToBase64(data.subarray(offset,Math.min(data.length,offset+size))));
  return chunks;
}
function joinAssetChunks(chunks){
  const parts=(chunks||[]).map(base64ToBytes),total=parts.reduce((sum,part)=>sum+part.byteLength,0),out=new Uint8Array(total);let offset=0;
  parts.forEach(part=>{out.set(part,offset);offset+=part.byteLength;});return out;
}

const api=Object.freeze({PROTOCOL,VERSION,MAX_ASSET_BYTES,CHUNK_BYTES,cleanId,cleanName,localEndpoint,normalizeTransform,transformOf,entityOf,signature,envelope,validEnvelope,createJournal,bytesToBase64,base64ToBytes,assetChunks,joinAssetChunks});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.LK_BLENDER_LIVE_LINK_CORE=api;
})(typeof window!=='undefined'?window:globalThis);
