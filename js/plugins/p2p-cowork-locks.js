/* =========================================================
   LOT KING — Cowork edit-lock coordinator
   Host-arbitrated, leased locks shared by Editor surfaces.
   Pure state machine: transport and UI remain in the plugin.
   ========================================================= */
(function(root){
'use strict';

const DEFAULT_LEASE_MS=9000;

function clean(value,max){return String(value==null?'':value).slice(0,max||96).replace(/[^A-Za-z0-9._:\-]/g,'');}
function create(options){
  const opts=options||{},locks=new Map(),pending=new Map();let version=0;
  const now=()=>typeof opts.now==='function'?Number(opts.now())||Date.now():Date.now();
  const selfId=()=>clean(typeof opts.selfId==='function'?opts.selfId():opts.selfId);
  const selfName=()=>String(typeof opts.selfName==='function'?opts.selfName():opts.selfName||'Editor').slice(0,48);
  const isHost=()=>!!(typeof opts.isHost==='function'?opts.isHost():opts.isHost);
  const leaseMs=()=>Math.max(3000,Math.min(15000,Number(opts.leaseMs)||DEFAULT_LEASE_MS));
  function emit(change){if(typeof opts.onChange==='function')opts.onChange(change||null,snapshot());}
  function send(type,payload){return typeof opts.send==='function'?opts.send(type,payload):0;}
  function sendTo(peerId,type,payload){return typeof opts.sendTo==='function'?opts.sendTo(peerId,type,payload):false;}
  function packet(lock,release){return{objectId:lock.objectId,ownerPeerId:release?'':lock.ownerPeerId,ownerName:release?'':lock.ownerName,surface:release?'':lock.surface,leaseMs:release?0:leaseMs(),version:++version};}
  function applyState(payload){
    const objectId=clean(payload&&payload.objectId);if(!objectId)return null;
    const ownerPeerId=clean(payload&&payload.ownerPeerId),previous=locks.get(objectId)||null;
    pending.delete(objectId);
    if(!ownerPeerId){locks.delete(objectId);emit({action:'released',objectId,previous});return null;}
    const lock={objectId,ownerPeerId,ownerName:String(payload.ownerName||'Editor').slice(0,48),surface:String(payload.surface||'object').slice(0,48),expiresAt:now()+Math.max(500,Number(payload.leaseMs)||leaseMs()),version:Math.max(Number(payload.version)||0,previous&&previous.version||0)};
    locks.set(objectId,lock);emit({action:'locked',objectId,lock,previous});return lock;
  }
  function publish(lock,release,targetPeerId){
    const body=packet(lock,release);
    applyState(body);
    if(targetPeerId)sendTo(targetPeerId,'cowork.lock.state',body);else send('cowork.lock.state',body);
    return body;
  }
  function handleRequest(event){
    if(!isHost())return false;
    const payload=event&&event.payload||{},objectId=clean(payload.objectId),requester=clean(event&&event.peerId||payload.peerId),name=String(event&&event.peerName||payload.name||'Editor').slice(0,48);
    if(!objectId||!requester)return false;
    const current=locks.get(objectId),expired=current&&current.expiresAt<=now();
    if(payload.release){if(current&&current.ownerPeerId===requester)publish(current,true);return true;}
    if(!current||expired||current.ownerPeerId===requester){publish({objectId,ownerPeerId:requester,ownerName:name,surface:String(payload.surface||'object').slice(0,48)});return true;}
    // The requester receives the live owner immediately instead of waiting for
    // another heartbeat, so its UI becomes read-only before an edit can start.
    sendTo(requester,'cowork.lock.state',packet(current,false));
    return false;
  }
  function request(objectId,surface){
    objectId=clean(objectId);if(!objectId)return false;
    pending.set(objectId,{objectId,surface:String(surface||'object').slice(0,48),requestedAt:now()});
    const payload={objectId,surface:String(surface||'object').slice(0,48),release:false,name:selfName()};
    if(isHost())return handleRequest({peerId:selfId(),peerName:selfName(),payload});
    send('cowork.lock.request',payload);emit({action:'pending',objectId});return false;
  }
  function release(objectId){
    objectId=clean(objectId);if(!objectId)return false;pending.delete(objectId);
    const current=locks.get(objectId);if(!current||current.ownerPeerId!==selfId())return false;
    const payload={objectId,surface:current.surface,release:true,name:selfName()};
    if(isHost())handleRequest({peerId:selfId(),peerName:selfName(),payload});else send('cowork.lock.request',payload);
    return true;
  }
  function releasePeer(peerId){
    if(!isHost())return 0;peerId=clean(peerId);let count=0;
    Array.from(locks.values()).forEach(lock=>{if(lock.ownerPeerId===peerId){publish(lock,true);count++;}});return count;
  }
  function tick(){
    const stamp=now();let changed=false;
    Array.from(locks.values()).forEach(lock=>{if(lock.expiresAt>stamp)return;if(isHost())publish(lock,true);else{locks.delete(lock.objectId);changed=true;}});
    Array.from(pending.entries()).forEach(([id,value])=>{if(stamp-value.requestedAt>leaseMs()){pending.delete(id);changed=true;}});
    if(changed)emit({action:'expired'});
  }
  function lock(objectId){const value=locks.get(clean(objectId));if(value&&value.expiresAt<=now()){tick();return null;}return value||null;}
  function owns(objectId){const value=lock(objectId);return!!(value&&value.ownerPeerId===selfId());}
  function blocked(objectId){const id=clean(objectId),value=lock(id);return!!(pending.has(id)||value&&value.ownerPeerId!==selfId());}
  function snapshot(){return{locks:Array.from(locks.values()).map(value=>Object.assign({},value)),pending:Array.from(pending.keys())};}
  return Object.freeze({request,release,releasePeer,handleRequest,handleState:event=>applyState(event&&event.payload||event),tick,lock,owns,blocked,snapshot});
}

const api=Object.freeze({create,DEFAULT_LEASE_MS});
root.LK_P2P_COWORK_LOCKS=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
