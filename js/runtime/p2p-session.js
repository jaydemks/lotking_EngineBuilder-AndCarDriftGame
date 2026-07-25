/* =========================================================
   LOT KING — browser P2P session transport
   WebRTC DataChannel with out-of-band invite codes. No project
   or gameplay payload passes through the static web server.
   ========================================================= */
(function(){
'use strict';

const PROTOCOL='lotking.p2p.v1';
const MAX_MESSAGE_CHARS=64*1024*1024;
const CHUNK_CHARS=16*1024;
const INVITE_MAX_AGE=15*60*1000;

function uid(prefix){
  const value=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  return String(prefix||'id')+'-'+value;
}
function encode(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decode(code){
  const normalized=String(code||'').trim().replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  const binary=atob(padded),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}
function waitIce(pc,timeout){
  if(pc.iceGatheringState==='complete')return Promise.resolve();
  return new Promise(resolve=>{
    let done=false;
    const finish=()=>{if(done)return;done=true;clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',check);resolve();};
    const check=()=>{if(pc.iceGatheringState==='complete')finish();};
    const timer=setTimeout(finish,Math.max(1000,Number(timeout)||6000));
    pc.addEventListener('icegatheringstatechange',check);
  });
}
function descriptionOf(value){return value&&{type:value.type,sdp:value.sdp};}

function create(options){
  const opts=Object.assign({name:'Lot King peer',iceServers:[],iceTimeout:6000},options||{});
  const selfId=uid('peer');
  let activeSessionId=uid('session');
  const peers=new Map(),listeners=new Set(),chunks=new Map();
  let sequence=0,closed=false,role='idle';

  function supported(){return typeof RTCPeerConnection==='function'&&typeof TextEncoder==='function'&&typeof TextDecoder==='function';}
  function emit(kind,detail){
    const event=Object.assign({kind,selfId,sessionId:activeSessionId,role,time:Date.now()},detail||{});
    listeners.forEach(listener=>{try{listener(event);}catch(err){console.warn('LotKing P2P listener failed',err);}});
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(kind==='message'?'lotking:p2p-message':'lotking:p2p-state',{detail:event}));
    return event;
  }
  function state(){
    return Object.freeze({supported:supported(),selfId,sessionId:activeSessionId,role,closed,peerCount:Array.from(peers.values()).filter(item=>item.channel&&item.channel.readyState==='open').length,peers:Array.from(peers.values()).map(item=>({id:item.remoteId||item.id,name:item.remoteName||'Connecting peer',state:item.pc.connectionState||item.channel&&item.channel.readyState||'connecting'}))});
  }
  function subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}
  function rtc(){
    if(!supported())throw new Error('WebRTC DataChannel is not available in this browser');
    return new RTCPeerConnection({iceServers:Array.isArray(opts.iceServers)?opts.iceServers:[]});
  }
  function parseSignal(code,wanted){
    let value;
    try{value=decode(code);}catch(err){throw new Error('Invalid Lot King P2P code');}
    if(!value||value.protocol!==PROTOCOL||value.kind!==wanted||!value.description)throw new Error('Unsupported Lot King P2P code');
    if(Date.now()-Number(value.createdAt||0)>INVITE_MAX_AGE)throw new Error('This P2P invitation has expired; create a new one');
    return value;
  }
  function forget(record){
    if(!record)return;
    peers.delete(record.id);
    emit('state',{action:'peer-closed',peerId:record.remoteId||record.id});
  }
  function receivePacket(record,raw,assembled){
    if(typeof raw!=='string'||(!assembled&&raw.length>CHUNK_CHARS+2048)||(assembled&&raw.length>MAX_MESSAGE_CHARS))return;
    let packet;
    try{packet=JSON.parse(raw);}catch(err){return;}
    if(packet&&packet.kind==='chunk'){
      const total=Math.max(1,Math.min(8192,Number(packet.total)||0)),index=Number(packet.index);
      if(!packet.id||index<0||index>=total||typeof packet.data!=='string'||total*CHUNK_CHARS>MAX_MESSAGE_CHARS+CHUNK_CHARS)return;
      const now=Date.now(),chunkId=record.id+':'+packet.id;
      chunks.forEach((value,key)=>{if(now-value.createdAt>30000)chunks.delete(key);});
      if(!chunks.has(chunkId)&&chunks.size>=32){const oldest=Array.from(chunks.entries()).sort((a,b)=>a[1].createdAt-b[1].createdAt)[0];if(oldest)chunks.delete(oldest[0]);}
      let pending=chunks.get(chunkId);
      if(!pending){pending={parts:new Array(total),received:0,size:0,createdAt:now};chunks.set(chunkId,pending);}
      if(pending.parts.length!==total||pending.parts[index]!=null)return;
      pending.parts[index]=packet.data;pending.received++;pending.size+=packet.data.length;
      if(pending.size>MAX_MESSAGE_CHARS){chunks.delete(chunkId);return;}
      if(pending.received===total){chunks.delete(chunkId);receivePacket(record,pending.parts.join(''),true);}
      return;
    }
    if(!packet||packet.protocol!==PROTOCOL||typeof packet.type!=='string')return;
    if(packet.type==='system.hello'){
      record.remoteId=String(packet.from||record.id);
      record.remoteName=String(packet.payload&&packet.payload.name||'Peer').slice(0,80);
      emit('state',{action:'peer-ready',peerId:record.remoteId,name:record.remoteName});
      return;
    }
    emit('message',{type:packet.type,payload:packet.payload,peerId:record.remoteId||packet.from||record.id,peerName:record.remoteName||'Peer',sequence:Number(packet.sequence)||0});
  }
  function flush(record){
    const channel=record&&record.channel;
    if(!channel||channel.readyState!=='open'||record.flushing)return;
    record.flushing=true;
    const pump=()=>{
      if(!record.channel||record.channel.readyState!=='open'){record.flushing=false;return;}
      try{
        while(record.outbox.length&&record.channel.bufferedAmount<1024*1024)record.channel.send(record.outbox.shift());
      }catch(err){record.flushing=false;emit('state',{action:'send-error',peerId:record.remoteId||record.id,error:String(err&&err.message||err)});return;}
      if(record.outbox.length)setTimeout(pump,12);else record.flushing=false;
    };
    pump();
  }
  function sendRaw(record,text){
    const channel=record&&record.channel;
    if(!channel||channel.readyState!=='open')return false;
    if(text.length>MAX_MESSAGE_CHARS)throw new Error('P2P message exceeds the 64 MB safety limit');
    if(text.length<=CHUNK_CHARS)record.outbox.push(text);
    else {
      const id=uid('message'),total=Math.ceil(text.length/CHUNK_CHARS);
      for(let index=0;index<total;index++)record.outbox.push(JSON.stringify({kind:'chunk',id,index,total,data:text.slice(index*CHUNK_CHARS,(index+1)*CHUNK_CHARS)}));
    }
    flush(record);
    return true;
  }
  function sendRecord(record,type,payload){
    if(!/^[a-z0-9][a-z0-9._:-]{0,95}$/i.test(String(type||'')))throw new Error('Invalid P2P message type');
    return sendRaw(record,JSON.stringify({protocol:PROTOCOL,type:String(type),payload,from:selfId,sequence:++sequence,time:Date.now()}));
  }
  function attachChannel(record,channel){
    record.channel=channel;
    channel.binaryType='arraybuffer';
    channel.bufferedAmountLowThreshold=256*1024;
    channel.addEventListener('open',()=>{
      sendRecord(record,'system.hello',{name:String(opts.name||'Lot King peer').slice(0,80),role,protocol:PROTOCOL});
      emit('state',{action:'channel-open',peerId:record.remoteId||record.id});
    });
    channel.addEventListener('message',event=>receivePacket(record,event.data));
    channel.addEventListener('close',()=>forget(record));
    channel.addEventListener('error',()=>emit('state',{action:'channel-error',peerId:record.remoteId||record.id}));
  }
  function makeRecord(id){
    const pc=rtc(),record={id,pc,channel:null,remoteId:null,remoteName:'',outbox:[],flushing:false};
    peers.set(id,record);
    pc.addEventListener('datachannel',event=>attachChannel(record,event.channel));
    pc.addEventListener('connectionstatechange',()=>{
      emit('state',{action:'connection-state',peerId:record.remoteId||record.id,state:pc.connectionState});
      if(pc.connectionState==='failed'||pc.connectionState==='closed')forget(record);
    });
    return record;
  }
  async function createInvite(){
    if(closed)throw new Error('P2P session is closed');
    role='host';
    const inviteId=uid('invite'),record=makeRecord(inviteId);
    attachChannel(record,record.pc.createDataChannel('lotking-session',{ordered:true}));
    await record.pc.setLocalDescription(await record.pc.createOffer());
    await waitIce(record.pc,opts.iceTimeout);
    emit('state',{action:'invite-created',inviteId});
    return encode({protocol:PROTOCOL,kind:'offer',createdAt:Date.now(),sessionId:activeSessionId,inviteId,hostId:selfId,description:descriptionOf(record.pc.localDescription)});
  }
  async function join(inviteCode){
    if(closed)throw new Error('P2P session is closed');
    const invite=parseSignal(inviteCode,'offer');
    role='guest';
    activeSessionId=invite.sessionId||activeSessionId;
    const record=makeRecord(invite.inviteId);
    record.remoteId=invite.hostId||null;
    await record.pc.setRemoteDescription(invite.description);
    await record.pc.setLocalDescription(await record.pc.createAnswer());
    await waitIce(record.pc,opts.iceTimeout);
    emit('state',{action:'answer-created',inviteId:invite.inviteId});
    return encode({protocol:PROTOCOL,kind:'answer',createdAt:Date.now(),sessionId:invite.sessionId,inviteId:invite.inviteId,peerId:selfId,description:descriptionOf(record.pc.localDescription)});
  }
  async function acceptAnswer(answerCode){
    const answer=parseSignal(answerCode,'answer'),record=peers.get(answer.inviteId);
    if(!record)throw new Error('No pending host invitation matches this answer');
    record.remoteId=answer.peerId||record.remoteId;
    await record.pc.setRemoteDescription(answer.description);
    emit('state',{action:'answer-accepted',peerId:record.remoteId||record.id});
    return true;
  }
  function send(type,payload){let sent=0;peers.forEach(record=>{if(sendRecord(record,type,payload))sent++;});return sent;}
  function sendTo(peerId,type,payload){const record=Array.from(peers.values()).find(item=>item.id===peerId||item.remoteId===peerId);return !!(record&&sendRecord(record,type,payload));}
  function close(){closed=true;peers.forEach(record=>{try{if(record.channel)record.channel.close();record.pc.close();}catch(err){}});peers.clear();chunks.clear();emit('state',{action:'session-closed'});}

  return Object.freeze({supported,state,subscribe,createInvite,join,acceptAnswer,send,sendTo,close,protocol:PROTOCOL});
}

window.LK_P2P_SESSION=Object.freeze({create,encode,decode,protocol:PROTOCOL});
})();
