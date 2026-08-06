/* =========================================================
   LOT KING — P2P Sessions & Coworking plugin
   Default-enabled, inspectable WebRTC collaboration example.
   Every peer may author. A host-arbitrated lease prevents two
   editors from mutating the same persistent object at once.
   ========================================================= */
(function(){
'use strict';

const NAME_KEY='lotking.p2p.displayName.v1';
const ICE_KEY='lotking.p2p.iceServers.v1';
const SNAPSHOT_CHUNK_CHARS=192*1024;
const SNAPSHOT_MAX_CHARS=256*1024*1024;
const LIVE_SCAN_MS=150;
const LIVE_SETTLE_MS=400;
const LIVE_MAX_PATCHES_PER_TICK=64;
let env=null,session=null,overlay=null,unsubscribe=null,pendingSnapshot=null;
let hostPeerId='',presenceTimer=null,presenceTick=0,lockCoordinator=null,desiredLockId='',desiredLockSurface='',lastLockRenew=0,saveRevision=0,remoteApplying=false,uiGuardInstalled=false,saveListenerInstalled=false,structureListenerInstalled=false;
const localObjects=new Map(),remoteRevisions=new Map(),snapshotTransfers=new Map();
const recentPeers=new Map(),signalMemory={offer:'',joinOffer:'',answer:'',hostAnswer:''};
let sessionButton=null,sessionPanel=null,lastDisconnectReason='';

function transferId(){return'cowork-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
function snapshotChecksum(text){
  let hash=0x811c9dc5;
  for(let index=0;index<text.length;index++){hash^=text.charCodeAt(index);hash=Math.imul(hash,0x01000193);}
  return(hash>>>0).toString(16).padStart(8,'0');
}
function createSnapshotTransfer(project,name,options){
  const text=JSON.stringify(project),chunkChars=Math.max(1024,Math.min(SNAPSHOT_CHUNK_CHARS,Number(options&&options.chunkChars)||SNAPSHOT_CHUNK_CHARS));
  if(!text||text.length>SNAPSHOT_MAX_CHARS)throw new Error('Cowork snapshot exceeds the 256 MiB application limit');
  const id=String(options&&options.transferId||transferId()),totalChunks=Math.ceil(text.length/chunkChars),checksum=snapshotChecksum(text);
  if(totalChunks>2048)throw new Error('Cowork snapshot requires too many chunks');
  const metadata={transferId:id,name:String(name||'Collaboration project').slice(0,48),totalChars:text.length,totalChunks,checksum};
  return Object.freeze({
    metadata:Object.freeze(metadata),
    chunk(index){const offset=index*chunkChars;return{transferId:id,index,data:text.slice(offset,offset+chunkChars)};},
    commit:Object.freeze({transferId:id,totalChars:text.length,totalChunks,checksum}),
  });
}
function consumeSnapshotPacket(type,payload,transfers){
  const table=transfers||snapshotTransfers,packet=payload||{},id=String(packet.transferId||'');
  if(type==='cowork.snapshot.begin'){
    if(!id||packet.totalChars<1||packet.totalChars>SNAPSHOT_MAX_CHARS||packet.totalChunks<1||packet.totalChunks>2048)throw new Error('Invalid cowork snapshot header');
    table.clear();
    table.set(id,{name:String(packet.name||'Collaboration project'),totalChars:Number(packet.totalChars),totalChunks:Number(packet.totalChunks),checksum:String(packet.checksum||''),parts:new Array(Number(packet.totalChunks)),received:0,size:0});
    return{status:'started',progress:0};
  }
  const current=table.get(id);if(!current)throw new Error('Cowork snapshot transfer was not started');
  if(type==='cowork.snapshot.chunk'){
    const index=Number(packet.index);if(index!==current.received||typeof packet.data!=='string')throw new Error('Cowork snapshot chunk is missing or out of order');
    current.parts[index]=packet.data;current.received++;current.size+=packet.data.length;
    if(current.size>current.totalChars){table.delete(id);throw new Error('Cowork snapshot received more data than declared');}
    return{status:'receiving',progress:current.received/current.totalChunks};
  }
  if(type==='cowork.snapshot.commit'){
    table.delete(id);
    if(current.received!==current.totalChunks||current.size!==current.totalChars)throw new Error('Cowork snapshot is incomplete ('+current.received+'/'+current.totalChunks+' chunks, '+current.size+'/'+current.totalChars+' characters)');
    const text=current.parts.join('');
    if(snapshotChecksum(text)!==current.checksum||String(packet.checksum||'')!==current.checksum)throw new Error('Cowork snapshot checksum does not match');
    let project;try{project=JSON.parse(text);}catch(error){throw new Error('Cowork snapshot is not valid project JSON');}
    return{status:'complete',progress:1,project,name:current.name};
  }
  throw new Error('Unsupported cowork snapshot packet');
}

function tr(en,it){return window.LOT_KING&&LOT_KING.i18n&&LOT_KING.i18n.lang==='it'?(it||en):en;}
function displayName(){try{return localStorage.getItem(NAME_KEY)||('Editor '+Math.random().toString(36).slice(2,6).toUpperCase());}catch(err){return'Lot King Editor';}}
function saveName(value){try{localStorage.setItem(NAME_KEY,String(value||'').trim().slice(0,80));}catch(err){}}
function storedIceText(){try{return localStorage.getItem(ICE_KEY)||'';}catch(err){return'';}}
function configuredIceOptions(){
  const node=overlay&&overlay.querySelector('[data-p2p-ice]'),text=String(node&&node.value||'').trim();
  if(!text)return{};
  let parsed;
  try{parsed=JSON.parse(text);}catch(err){throw new Error(tr('ICE configuration is not valid JSON.','La configurazione ICE non è un JSON valido.'));}
  if(!window.LK_P2P_SESSION||!window.LK_P2P_SESSION.normalizeIceServers)throw new Error('P2P ICE configuration service unavailable');
  const iceServers=window.LK_P2P_SESSION.normalizeIceServers(parsed,false);
  try{localStorage.setItem(ICE_KEY,JSON.stringify(iceServers));}catch(err){}
  return{iceServers};
}
function status(message){if(env&&env.status)env.status(message);const node=overlay&&overlay.querySelector('[data-p2p-status]');if(node)node.textContent=message;}
function sessionState(){return session?session.state():{supported:typeof RTCPeerConnection==='function',role:'idle',peerCount:0,peers:[],selfId:'',sessionId:''};}
function selfId(){return String(sessionState().selfId||'');}
function isHost(){return sessionState().role==='host';}
function escapeHtml(value){return String(value==null?'':value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
function rememberPeer(peerId,name,state){
  peerId=String(peerId||'');if(!peerId)return;
  const previous=recentPeers.get(peerId)||{};
  recentPeers.set(peerId,{id:peerId,name:String(name||previous.name||'Peer').slice(0,80),state:String(state||previous.state||'disconnected'),lastSeen:Date.now()});
}
function rememberSignals(){
  if(!overlay)return;
  const pairs=[['offer','[data-p2p-offer]'],['joinOffer','[data-p2p-join-offer]'],['answer','[data-p2p-answer]'],['hostAnswer','[data-p2p-host-answer]']];
  pairs.forEach(([key,selector])=>{const node=overlay.querySelector(selector);if(node&&node.value)signalMemory[key]=node.value;});
}
function sessionLabel(state){
  if(state.peerCount>0)return'● '+(state.role==='host'?'HOST':'P2P')+' · '+state.peerCount;
  if(session&&!state.closed&&(state.role==='host'||state.role==='guest'))return'◌ '+(state.role==='host'?'HOST':'P2P');
  return'⇄ P2P';
}
function renderSessionPanel(){
  if(!sessionPanel)return;
  const state=sessionState(),connected=new Set();
  (state.peers||[]).forEach(peer=>{connected.add(peer.id);rememberPeer(peer.id,peer.name,peer.state||'connected');});
  const peers=Array.from(recentPeers.values()).sort((a,b)=>(connected.has(b.id)?1:0)-(connected.has(a.id)?1:0)||b.lastSeen-a.lastSeen);
  const peerRows=peers.length?peers.map(peer=>{
    const live=connected.has(peer.id),stateText=live?String(peer.state||'connected'):tr('disconnected','disconnesso');
    const action=state.role==='host'?(live?`<button type="button" data-p2p-kick="${escapeHtml(peer.id)}">${tr('Remove','Espelli')}</button>`:`<button type="button" data-p2p-reinvite="${escapeHtml(peer.id)}">${tr('Re-invite','Re-invita')}</button>`):'';
    return`<div class="lk-p2p-peer ${live?'live':'offline'}"><span class="lk-p2p-peer-dot"></span><span><b>${escapeHtml(peer.name)}</b><small>${escapeHtml(stateText)}</small></span>${action}</div>`;
  }).join(''):`<div class="lk-p2p-empty">${tr('No connected or recent users.','Nessun utente connesso o recente.')}</div>`;
  const sessionText=state.sessionId?escapeHtml(state.sessionId.slice(0,18))+'…':'—';
  sessionPanel.innerHTML=`<div class="lk-p2p-monitor-head"><b>${tr('P2P session','Sessione P2P')}</b><button type="button" data-p2p-monitor-close>×</button></div>
    <div class="lk-p2p-monitor-state"><span class="${state.peerCount?'live':'offline'}"></span>${escapeHtml(String(state.role||'idle').toUpperCase())} · ${state.peerCount} peer · ${sessionText}</div>
    ${lastDisconnectReason?`<div class="lk-p2p-monitor-warning">${escapeHtml(lastDisconnectReason)}</div>`:''}
    <div class="lk-p2p-monitor-peers">${peerRows}</div>
    <div class="lk-p2p-monitor-actions"><button type="button" data-p2p-studio>${state.role==='guest'&&!state.peerCount?tr('Reconnect…','Riconnetti…'):tr('Session details','Dettagli sessione')}</button>${state.role==='host'?`<button type="button" data-p2p-new-invite>${tr('Add user','Aggiungi utente')}</button>`:''}${session&&!state.closed?`<button type="button" class="danger" data-p2p-disconnect>${tr('Disconnect','Disconnetti')}</button>`:''}</div>`;
}
function updateSessionChrome(){
  installSessionChrome();if(!sessionButton)return;
  const state=sessionState();sessionButton.textContent=sessionLabel(state);sessionButton.classList.toggle('live',state.peerCount>0);sessionButton.classList.toggle('waiting',!state.peerCount&&!!session&&!state.closed);sessionButton.title=state.peerCount?tr('Open connected users and P2P session controls','Apri utenti connessi e controlli sessione P2P'):tr('Open P2P Sessions & Coworking','Apri Sessioni P2P e Coworking');
  renderSessionPanel();
}
function positionSessionPanel(){
  if(!sessionPanel||!sessionButton)return;const rect=sessionButton.getBoundingClientRect();sessionPanel.style.top=Math.round(rect.bottom+6)+'px';sessionPanel.style.right=Math.max(8,Math.round(innerWidth-rect.right))+'px';
}
function toggleSessionPanel(force){
  installSessionChrome();if(!sessionPanel)return;const open=force==null?sessionPanel.hidden:!!force;sessionPanel.hidden=!open;if(open){positionSessionPanel();renderSessionPanel();}
}
function installSessionChrome(){
  if(sessionButton&&sessionButton.isConnected)return;
  const bar=document.querySelector('#lkTopbar .lk-preview-tools');if(!bar)return;
  if(!document.getElementById('lkP2pMonitorStyle'))document.head.appendChild(Object.assign(document.createElement('style'),{id:'lkP2pMonitorStyle',textContent:'#lkP2pSessionButton{border-color:#475569;color:#cbd5e1;white-space:nowrap}#lkP2pSessionButton.live{border-color:#10b981;background:#063c32;color:#a7f3d0;box-shadow:0 0 0 1px #10b98155 inset}#lkP2pSessionButton.waiting{border-color:#f59e0b;color:#fde68a}.lk-p2p-monitor{position:fixed;z-index:10040;width:min(360px,calc(100vw - 16px));max-height:min(520px,80vh);overflow:auto;padding:10px;background:#0b1220;color:#e5edf8;border:1px solid #334155;border-radius:10px;box-shadow:0 16px 50px #000b;font:12px/1.35 system-ui}.lk-p2p-monitor[hidden]{display:none}.lk-p2p-monitor-head,.lk-p2p-monitor-actions,.lk-p2p-peer{display:flex;align-items:center;gap:7px}.lk-p2p-monitor-head{justify-content:space-between;font-size:14px}.lk-p2p-monitor-head button{font-size:18px;background:transparent;border:0;color:#cbd5e1}.lk-p2p-monitor-state{padding:8px 0;color:#93c5fd}.lk-p2p-monitor-state>span,.lk-p2p-peer-dot{display:inline-block;width:8px;height:8px;margin-right:6px;border-radius:50%;background:#64748b}.lk-p2p-monitor-state>span.live,.lk-p2p-peer.live .lk-p2p-peer-dot{background:#10b981;box-shadow:0 0 8px #10b981}.lk-p2p-peer{padding:8px;border-top:1px solid #1e293b}.lk-p2p-peer>span:nth-child(2){display:flex;flex:1;min-width:0;flex-direction:column}.lk-p2p-peer small{color:#94a3b8}.lk-p2p-peer.offline{opacity:.78}.lk-p2p-monitor button{padding:5px 8px}.lk-p2p-monitor-actions{flex-wrap:wrap;padding-top:9px;border-top:1px solid #334155}.lk-p2p-monitor button.danger,.lk-p2p-peer button{border-color:#7f1d1d;color:#fecaca}.lk-p2p-monitor-warning{margin:3px 0 8px;padding:7px;background:#3b1520;color:#fecdd3;border-radius:6px}.lk-p2p-empty{padding:12px 4px;color:#94a3b8}' }));
  sessionButton=document.createElement('button');sessionButton.id='lkP2pSessionButton';sessionButton.type='button';sessionButton.textContent='⇄ P2P';sessionButton.addEventListener('click',()=>toggleSessionPanel());bar.insertBefore(sessionButton,bar.firstChild);
  sessionPanel=document.createElement('div');sessionPanel.className='lk-p2p-monitor';sessionPanel.hidden=true;sessionPanel.addEventListener('click',handleSessionPanelClick);document.body.appendChild(sessionPanel);
  addEventListener('resize',()=>{if(sessionPanel&&!sessionPanel.hidden)positionSessionPanel();});
}
function ensureLockCoordinator(){
  if(lockCoordinator)return lockCoordinator;
  const service=window.LK_P2P_COWORK_LOCKS;if(!service||!service.create)return null;
  lockCoordinator=service.create({
    selfId, selfName:displayName, isHost,
    send:(type,payload)=>session?session.send(type,payload):0,
    sendTo:(peerId,type,payload)=>session?session.sendTo(peerId,type,payload):false,
    onChange:()=>{decorateLocks();updateUi();},
  });
  return lockCoordinator;
}
function updateUi(){
  updateSessionChrome();
  if(!overlay)return;
  const state=sessionState(),stateNode=overlay.querySelector('[data-p2p-state]'),peers=overlay.querySelector('[data-p2p-peers]');
  const lockState=lockCoordinator&&lockCoordinator.snapshot?lockCoordinator.snapshot():{locks:[],pending:[]};
  if(stateNode)stateNode.textContent=(state.supported?String(state.role||'idle').toUpperCase():'UNSUPPORTED')+' · '+state.peerCount+' peer · '+tr('LIVE COAUTHOR','COAUTORE LIVE')+' · '+lockState.locks.length+' '+tr('locked','bloccati');
  if(peers){const lines=state.peers.length?state.peers.map(peer=>(peer.name||peer.id)+' · '+peer.state):[tr('No connected peers.','Nessun peer collegato.')];lockState.locks.forEach(lock=>lines.push('🔒 '+(lock.ownerName||lock.ownerPeerId)+' · '+lock.surface+' · '+lock.objectId));peers.textContent=lines.join('\n');}
  const publish=overlay.querySelector('[data-p2p-publish]'),apply=overlay.querySelector('[data-p2p-apply]');
  if(publish)publish.disabled=state.peerCount<1;
  if(apply)apply.disabled=!pendingSnapshot;
}
function ensureSession(){
  if(session&&!session.state().closed)return session;
  if(!window.LK_P2P_SESSION)throw new Error('P2P runtime unavailable');
  const active=window.LK_P2P_ACTIVE_SESSION;
  if(active&&active.state&&!active.state().closed)session=active;
  else session=window.LK_P2P_SESSION.create(Object.assign({name:displayName()},configuredIceOptions()));
  window.LK_P2P_ACTIVE_SESSION=session;
  hostPeerId='';pendingSnapshot=null;localObjects.clear();remoteRevisions.clear();snapshotTransfers.clear();lockCoordinator=null;desiredLockId='';desiredLockSurface='';
  const adoptedState=session.state();
  if(adoptedState.role==='guest'&&adoptedState.peers&&adoptedState.peers[0])hostPeerId=adoptedState.peers[0].id;
  if(unsubscribe)unsubscribe();
  unsubscribe=session.subscribe(handleSessionEvent);
  ensureLockCoordinator();installUiGuard();startPresence();
  updateUi();
  return session;
}
function handleSessionEvent(event){
  if(event.kind==='state'){
    if(event.action==='peer-ready'){
      if(sessionState().role==='guest'&&!hostPeerId)hostPeerId=event.peerId;
      rememberPeer(event.peerId,event.name,'connected');lastDisconnectReason='';
      localObjects.clear();
      status(tr('Peer connected: ','Peer collegato: ')+(event.name||event.peerId));
    }
    if(event.action==='connection-state')rememberPeer(event.peerId,'',event.state);
    if(event.action==='peer-closed'){
      rememberPeer(event.peerId,'','disconnected');
      if(isHost()&&lockCoordinator)lockCoordinator.releasePeer(event.peerId);
      if(!lastDisconnectReason)lastDisconnectReason=tr('A peer disconnected. The host can create a fresh invitation from this panel.','Un peer si è disconnesso. L’host può creare un nuovo invito da questo pannello.');
    }
    if(event.action==='session-closed'){
      recentPeers.forEach(peer=>rememberPeer(peer.id,peer.name,'disconnected'));
      if(!lastDisconnectReason)lastDisconnectReason=tr('Session closed. Open details to start or join another one.','Sessione chiusa. Apri i dettagli per avviarne o raggiungerne un’altra.');
    }
    if(event.action==='channel-error'||event.action==='send-error')status(tr('P2P transport error.','Errore trasporto P2P.'));
    if(event.action==='ice-candidate-error')status(tr('An ICE server could not provide a route; Lot King is trying the remaining LAN/STUN/TURN candidates.','Un server ICE non ha fornito una rotta; Lot King prova gli altri candidati LAN/STUN/TURN.'));
    if(event.action==='connection-state'&&event.state==='failed')status(tr('Connection failed. Create a fresh invite; across restrictive networks configure a TURN server below.','Connessione fallita. Crea un nuovo invito; tra reti restrittive configura un server TURN qui sotto.'));
    updateUi();
    return;
  }
  if(event.kind!=='message')return;
  const type=event.type;
  if(type==='net.kick'){
    lastDisconnectReason=tr('Removed by host: ','Espulso dall’host: ')+String(event.payload&&event.payload.reason||tr('No reason supplied','Nessun motivo indicato'));
    status(lastDisconnectReason);
  } else if(type==='cowork.lock.request'&&isHost()){
    ensureLockCoordinator().handleRequest(event);
  } else if(type==='cowork.lock.state'){
    if(!isHost()&&hostPeerId&&event.peerId!==hostPeerId)return;
    ensureLockCoordinator().handleState(event);
  } else if(type==='cowork.patch'||type==='collab.transform'){
    if(applyRemoteTransform(event)&&isHost())relayCowork(event,'cowork.patch');
  } else if(type==='cowork.object'){
    if(applyRemoteObject(event)&&isHost())relayCowork(event,'cowork.object');
  } else if(type==='cowork.delete'){
    if(applyRemoteDelete(event)&&isHost())relayCowork(event,'cowork.delete');
  } else if(type==='cowork.save'){
    if(handleRemoteSave(event)&&isHost())relayCowork(event,'cowork.save');
  } else if(type==='cowork.snapshot'||type==='collab.snapshot'){
    pendingSnapshot=event.payload&&event.payload.project||null;
    status(pendingSnapshot?tr('A complete peer snapshot is ready. Review and apply it explicitly.','È pronto uno snapshot completo del peer. Controllalo e applicalo esplicitamente.'):tr('Invalid collaboration snapshot.','Snapshot collaborazione non valido.'));
  } else if(type==='cowork.snapshot.begin'||type==='cowork.snapshot.chunk'||type==='cowork.snapshot.commit'){
    try{
      const result=consumeSnapshotPacket(type,event.payload);
      if(result.status==='complete'){
        pendingSnapshot=result.project;
        status(tr('Snapshot received and verified. Review and apply it explicitly.','Snapshot ricevuto e verificato. Controllalo e applicalo esplicitamente.'));
      }else if(result.status==='receiving')status(tr('Receiving project snapshot: ','Ricezione snapshot progetto: ')+Math.round(result.progress*100)+'%');
    }catch(error){snapshotTransfers.clear();status(String(error&&error.message||error));}
  }
  updateUi();
}
function findObject(id){const list=env&&env.GAME&&env.GAME.world&&env.GAME.world.registry;return Array.isArray(list)?list.find(item=>item&&item.userData&&item.userData.editorId===id)||null:null;}
function patchAuthor(event){
  const wirePeer=String(event&&event.peerId||'');
  // A guest cannot impersonate another author when talking to the host. A
  // guest receiving a host relay instead keeps the original author metadata.
  if(isHost()&&wirePeer&&wirePeer!==selfId())return wirePeer;
  return String(event&&event.payload&&event.payload.authorPeerId||wirePeer);
}
function ownsWireLock(id,author){const locks=ensureLockCoordinator(),lock=locks&&locks.lock(id);return!!(lock&&lock.ownerPeerId===author);}
function acceptRevision(id,author,revision){const key=author+':'+id,current=remoteRevisions.get(key)||0,next=Number(revision)||0;if(next&&next<=current)return false;if(next)remoteRevisions.set(key,next);return true;}
function relayCowork(event,type){
  if(!session||!isHost())return 0;const payload=Object.assign({},event.payload||{},{authorPeerId:patchAuthor(event)});let count=0;
  (sessionState().peers||[]).forEach(peer=>{if(peer.id!==event.peerId&&session.sendTo(peer.id,type,payload))count++;});return count;
}
function markRemoteDirty(){if(!env||!env.markDirty)return;remoteApplying=true;try{env.markDirty();}finally{remoteApplying=false;}}
function applyRemoteTransform(event){
  const patch=event.payload||{},id=String(patch.objectId||patch.id||''),author=patchAuthor(event);
  if(!id||!patch.transform||!ownsWireLock(id,author)||!acceptRevision(id,author,patch.revision))return false;
  const object=findObject(id);if(!object)return false;
  env.STORE.applyT(object,patch.transform);
  if(patch.name){object.name=patch.name;object.userData.editorName=patch.name;}
  if(patch.visible!=null)object.visible=!!patch.visible;
  if(env.STORE.syncCollider)env.STORE.syncCollider(object);
  markRemoteDirty();
  if(env.buildInspector&&env.ED&&env.ED.selected===object)env.buildInspector();
  window.dispatchEvent(new CustomEvent('lotking:collab-transform-applied',{detail:{id,peerId:author}}));return true;
}
function cloneJson(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function objectEntry(object){
  if(!object||!object.userData||!object.userData.addedEntry||!env||!env.STORE)return null;
  const entry=env.STORE.snapshotAddedEntry?env.STORE.snapshotAddedEntry(object,object.userData.addedEntry):cloneJson(object.userData.addedEntry),encoded=JSON.stringify(entry);
  if(encoded.length>4*1024*1024)throw new Error(tr('This object state exceeds the 4 MiB realtime limit; publish a project snapshot instead.','Lo stato di questo oggetto supera il limite realtime di 4 MiB; pubblica invece uno snapshot del progetto.'));
  return entry;
}
function applyRemoteObject(event){
  const payload=event.payload||{},id=String(payload.objectId||''),author=patchAuthor(event);
  if(!id||!payload.entry||!ownsWireLock(id,author)||!acceptRevision(id+':object',author,payload.revision))return false;
  const object=findObject(id),entry=cloneJson(payload.entry);
  if(!object){
    if(!env||!env.STORE||typeof env.STORE.createFromEntry!=='function'||typeof env.STORE.registerAdded!=='function')return false;
    Promise.resolve(env.STORE.createFromEntry(entry,env.GAME)).then(created=>env.STORE.registerAdded(env.GAME,created,entry)).then(created=>{
      markRemoteDirty();if(env.refreshOutliner)env.refreshOutliner();
      window.dispatchEvent(new CustomEvent('lotking:collab-object-applied',{detail:{id,peerId:author,created:true}}));return created;
    }).catch(error=>status(tr('Cowork object creation failed: ','Creazione oggetto cowork fallita: ')+String(error&&error.message||error)));
    return true;
  }
  if(!object.userData)return false;const ud=object.userData;
  ud.addedEntry=Object.assign(ud.addedEntry||{},entry);ud.editorName=entry.name||ud.editorName;object.name=ud.editorName||object.name;
  if(entry.t)env.STORE.applyT(object,entry.t);
  if(entry.kind==='logicElement'){
    ud.logicGraph=cloneJson(entry.graph);ud.logicEnabled=entry.enabled!==false;ud.logicRunInEditorPreview=entry.runInEditorPreview!==false;ud.logicAssetId=entry.logicAssetId||null;ud.logicLinked=!!entry.logicLinked;ud.logicVariableOverrides=cloneJson(entry.variableOverrides||{});
    if(env.STORE.syncLogicElementSceneObject)env.STORE.syncLogicElementSceneObject(object,ud.logicGraph);
  }else if(entry.kind==='cinemaStudio'){ud.cinemaProps=cloneJson(entry.props||{});}
  else if(entry.kind==='camera'){ud.cameraProps=cloneJson(entry.props||{});if(env.STORE.updateSceneCameraObject)env.STORE.updateSceneCameraObject(object,ud.cameraProps);}
  else if(entry.kind==='text'){ud.textProps=cloneJson(entry.props||{});if(env.STORE.updateTextObject)env.STORE.updateTextObject(object,ud.textProps);}
  else if(entry.kind==='texture'){ud.textureProps=cloneJson(entry.props||{});if(env.STORE.updateTextureObject)env.STORE.updateTextureObject(object,ud.textureProps);}
  else if(entry.kind==='effect'){ud.effectParams=cloneJson(entry.params||{});}
  else if(entry.props){ud.matProps=cloneJson(entry.props);if(env.STORE.applyMatProps)env.STORE.applyMatProps(object,ud.matProps);}
  if(env.STORE.syncCollider)env.STORE.syncCollider(object);markRemoteDirty();
  if(env.refreshOutliner)env.refreshOutliner();if(env.buildInspector&&env.ED&&env.ED.selected===object)env.buildInspector();
  window.dispatchEvent(new CustomEvent('lotking:collab-object-applied',{detail:{id,peerId:author}}));return true;
}
function applyRemoteDelete(event){
  const payload=event.payload||{},id=String(payload.objectId||''),author=patchAuthor(event);
  if(!id||!ownsWireLock(id,author)||!acceptRevision(id+':delete',author,payload.revision))return false;
  const object=findObject(id);if(!object||!object.userData||!object.userData.addedEntry)return false;
  remoteApplying=true;try{if(env&&typeof env.removeEntity==='function')env.removeEntity(object);else{if(env.GAME&&env.GAME.world&&env.GAME.world.unregister)env.GAME.world.unregister(object);if(object.parent)object.parent.remove(object);}}finally{remoteApplying=false;}
  markRemoteDirty();if(env.refreshOutliner)env.refreshOutliner();
  window.dispatchEvent(new CustomEvent('lotking:collab-object-deleted',{detail:{id,peerId:author}}));return true;
}
function syncLiveObjects(){
  if(!session||sessionState().peerCount<1||!env||!env.STORE||!lockCoordinator)return;
  let sent=0;const now=Date.now(),lockState=lockCoordinator.snapshot();
  for(const lock of lockState.locks){
    if(sent>=LIVE_MAX_PATCHES_PER_TICK||lock.ownerPeerId!==selfId())continue;
    const object=findObject(lock.objectId);if(!object)continue;
    const objectId=lock.objectId,transform=env.STORE.tOf(object),name=object.userData.editorName||object.name||'',visible=object.visible!==false;
    const transformSignature=JSON.stringify({transform,name,visible});let entry=localObjects.get(objectId);
    if(!entry){entry={signature:transformSignature,revision:0,changedAt:now,settled:transformSignature,objectSignature:'',objectRevision:0,objectChangedAt:now,objectSettled:''};localObjects.set(objectId,entry);}
    if(entry.signature!==transformSignature){entry.signature=transformSignature;entry.revision++;entry.changedAt=now;session.send('cowork.patch',{objectId,revision:entry.revision,transform,name,visible,authorPeerId:selfId()},{channel:'state'});sent++;}
    else if(entry.settled!==transformSignature&&now-entry.changedAt>=LIVE_SETTLE_MS){session.send('cowork.patch',{objectId,revision:entry.revision,transform,name,visible,authorPeerId:selfId()});entry.settled=transformSignature;sent++;}
    const authored=objectEntry(object),authoredSignature=authored?JSON.stringify(authored):'';
    if(entry.objectSignature!==authoredSignature){entry.objectSignature=authoredSignature;entry.objectRevision++;entry.objectChangedAt=now;}
    else if(authored&&entry.objectSettled!==authoredSignature&&now-entry.objectChangedAt>=LIVE_SETTLE_MS){session.send('cowork.object',{objectId,revision:entry.objectRevision,entry:authored,authorPeerId:selfId()});entry.objectSettled=authoredSignature;sent++;}
  }
}
function flushOwnedObjects(){
  if(!session||sessionState().peerCount<1||!lockCoordinator||!env||!env.STORE)return 0;
  let sent=0;
  lockCoordinator.snapshot().locks.forEach(lock=>{
    if(lock.ownerPeerId!==selfId())return;
    const object=findObject(lock.objectId);if(!object)return;
    let entry=localObjects.get(lock.objectId);
    if(!entry){entry={revision:0,objectRevision:0};localObjects.set(lock.objectId,entry);}
    const transform=env.STORE.tOf(object),name=object.userData.editorName||object.name||'',visible=object.visible!==false;
    entry.revision=(Number(entry.revision)||0)+1;
    session.send('cowork.patch',{objectId:lock.objectId,revision:entry.revision,transform,name,visible,authorPeerId:selfId()});sent++;
    const authored=objectEntry(object);
    if(authored){entry.objectRevision=(Number(entry.objectRevision)||0)+1;session.send('cowork.object',{objectId:lock.objectId,revision:entry.objectRevision,entry:authored,authorPeerId:selfId()});sent++;}
  });
  return sent;
}
function selectedObject(){return env&&env.ED&&env.ED.selected||null;}
function persistentId(object){return String(object&&object.userData&&object.userData.editorId||'');}
function editingSurface(){
  if(document.querySelector('.lk-pawn-studio-modal'))return'pawn-studio';
  if(env&&env.ED&&env.ED.cinemaTimelineOpen)return'cinema-studio';
  const gizmo=env&&env.getGizmo&&env.getGizmo();
  return gizmo&&gizmo.axis?'viewport-gizmo':'inspector';
}
function describeLock(lock){return(lock&&lock.ownerName||tr('Another editor','Un altro editor'))+' · '+(lock&&lock.surface||'object');}
function decorateLocks(){
  const selected=selectedObject(),id=persistentId(selected),coordinator=lockCoordinator,lock=id&&coordinator&&coordinator.lock(id),pending=id&&coordinator&&coordinator.snapshot().pending.includes(id);
  const blocked=!!(lock&&lock.ownerPeerId!==selfId()||pending&&!(lock&&lock.ownerPeerId===selfId())),inspector=document.getElementById('lkInspector'),cinema=document.getElementById('lkCinemaTimeline'),pawn=document.querySelector('.lk-pawn-studio-modal');
  [inspector,cinema,pawn].forEach(node=>{if(!node)return;node.classList.toggle('lk-cowork-readonly',blocked);if(blocked)node.setAttribute('data-cowork-lock',lock?describeLock(lock):tr('Requesting edit lock…','Richiesta blocco modifica…'));else node.removeAttribute('data-cowork-lock');});
  if(selected&&selected.userData){if(lock)selected.userData.coworkLock={ownerPeerId:lock.ownerPeerId,ownerName:lock.ownerName,surface:lock.surface};else delete selected.userData.coworkLock;}
}
function releaseDesiredLock(){
  if(desiredLockId&&lockCoordinator)lockCoordinator.release(desiredLockId);
  localObjects.delete(desiredLockId);desiredLockId='';desiredLockSurface='';lastLockRenew=0;decorateLocks();
}
function syncDesiredLock(){
  const coordinator=ensureLockCoordinator(),state=sessionState();
  if(!coordinator||!session||state.peerCount<1){releaseDesiredLock();return;}
  coordinator.tick();
  const object=selectedObject(),id=persistentId(object),surface=id?editingSurface():'';
  if(id!==desiredLockId){releaseDesiredLock();desiredLockId=id;desiredLockSurface=surface;if(id)coordinator.request(id,surface);lastLockRenew=Date.now();decorateLocks();return;}
  if(!id)return;
  const lock=coordinator.lock(id),now=Date.now();
  if(surface!==desiredLockSurface||!lock||lock.ownerPeerId===selfId()&&now-lastLockRenew>3000){
    desiredLockSurface=surface;coordinator.request(id,surface);lastLockRenew=now;
  }
}
function canEditObject(object,options){
  const state=sessionState();if(!session||state.peerCount<1)return true;
  const id=typeof object==='string'?object:persistentId(object||selectedObject());if(!id)return true;
  const coordinator=ensureLockCoordinator(),surface=String(options&&options.surface||editingSurface());
  if(!coordinator)return false;
  const lock=coordinator.lock(id);
  if(lock&&lock.ownerPeerId===selfId())return true;
  if(!lock&&!coordinator.snapshot().pending.includes(id))coordinator.request(id,surface);
  const active=coordinator.lock(id);if(active&&active.ownerPeerId!==selfId())status('🔒 '+tr('Element edited by ','Elemento modificato da ')+describeLock(active));
  else status(tr('Waiting for the host edit lock…','In attesa del blocco modifica dall’host…'));
  decorateLocks();return!!(active&&active.ownerPeerId===selfId());
}
function mutationSurface(target){
  if(!target||!target.closest)return'';
  if(target.closest('.lk-pawn-studio-modal'))return'pawn-studio';
  if(target.closest('#lkCinemaTimeline'))return'cinema-studio';
  if(target.closest('#lkInspector'))return'inspector';
  const gizmo=env&&env.getGizmo&&env.getGizmo();
  if(gizmo&&gizmo.axis&&target.closest('canvas'))return'viewport-gizmo';
  return'';
}
function allowReadonlyAction(target){return!!(target&&target.closest&&target.closest('[data-p2p-close],#lkCinemaTlClose,.lk-logic-modal-close')) || target&&target.tagName==='BUTTON'&&String(target.textContent||'').trim()==='×';}
function installUiGuard(){
  if(uiGuardInstalled)return;uiGuardInstalled=true;
  const guard=event=>{
    const surface=mutationSurface(event.target);if(!surface||allowReadonlyAction(event.target))return;
    const object=selectedObject(),id=persistentId(object);if(!id||canEditObject(object,{surface}))return;
    event.preventDefault();event.stopImmediatePropagation();
  };
  ['pointerdown','mousedown','click','beforeinput','input','change','keydown'].forEach(type=>document.addEventListener(type,guard,true));
  if(!document.getElementById('lkCoworkLockStyle'))document.head.appendChild(Object.assign(document.createElement('style'),{id:'lkCoworkLockStyle',textContent:'.lk-cowork-readonly{position:relative;filter:saturate(.7)}.lk-cowork-readonly:after{content:"🔒  " attr(data-cowork-lock);position:sticky;top:0;z-index:10020;display:block;padding:7px 10px;background:#3b1520e8;color:#fecdd3;border:1px solid #be123c;font:600 11px/1.3 system-ui;pointer-events:none}' }));
}
function handleRemoteSave(event){
  const author=patchAuthor(event),payload=event&&event.payload||{};if(!author||author===selfId()||!acceptRevision('__save__',author,payload.revision))return false;
  const save=env&&env.saveScene||window.LK_EDITOR_PROJECT_IO_INSTANCE&&window.LK_EDITOR_PROJECT_IO_INSTANCE.saveScene;if(typeof save!=='function')return false;
  remoteApplying=true;
  try{
    const result=save({coworkRemote:true});
    Promise.resolve(result).then(ok=>{if(ok!==false)status(tr('Project saved locally for both collaborators ✓','Progetto salvato localmente per entrambi i collaboratori ✓'));}).catch(error=>status('⚠ '+String(error&&error.message||error)));
  }finally{remoteApplying=false;}
  return true;
}
function installSaveRelay(){
  if(saveListenerInstalled)return;saveListenerInstalled=true;
  window.addEventListener('lotking:project-saved',event=>{
    const detail=event&&event.detail||{};if(remoteApplying||detail.source==='cowork'||!session||sessionState().peerCount<1)return;
    try{flushOwnedObjects();}catch(error){status('⚠ '+String(error&&error.message||error));return;}
    saveRevision++;session.send('cowork.save',{revision:saveRevision,name:displayName(),authorPeerId:selfId()});
    status(tr('Project saved here and sent to collaborators ✓','Progetto salvato qui e inviato ai collaboratori ✓'));
  });
}
function installStructureRelay(){
  if(structureListenerInstalled)return;structureListenerInstalled=true;
  window.addEventListener('lotking:entity-removed',event=>{
    const object=event&&event.detail&&event.detail.object,id=persistentId(object);if(remoteApplying||!id||!object.userData.addedEntry||!session||sessionState().peerCount<1||!ownsWireLock(id,selfId()))return;
    let entry=localObjects.get(id);if(!entry){entry={revision:0,objectRevision:0,deleteRevision:0};localObjects.set(id,entry);}entry.deleteRevision=(Number(entry.deleteRevision)||0)+1;
    session.send('cowork.delete',{objectId:id,revision:entry.deleteRevision,authorPeerId:selfId()});
  });
}
function startPresence(){
  if(presenceTimer)return;
  presenceTimer=setInterval(()=>{
    const state=sessionState();if(!session||state.peerCount<1){syncDesiredLock();return;}
    syncDesiredLock();
    if((presenceTick++%10)===0){
      const selected=env&&env.ED&&env.ED.selected;
      session.send('cowork.presence',{name:displayName(),color:'#7dd3fc',u:0,v:0,selectionId:selected&&selected.userData&&selected.userData.editorId||'',selectionName:selected&&selected.userData&&(selected.userData.editorName||selected.name)||''},{channel:'state'});
    }
    syncLiveObjects();
  },LIVE_SCAN_MS);
}
function field(selector){return overlay&&overlay.querySelector(selector);}
function selectCode(node){if(!node)return;node.focus();node.select();try{navigator.clipboard&&navigator.clipboard.writeText(node.value).catch(()=>{});}catch(err){}}
function signalKind(code){
  const text=String(code||'').trim();if(!text||!window.LK_P2P_SESSION||!window.LK_P2P_SESSION.decode)return'';
  try{const decoded=window.LK_P2P_SESSION.decode(text);return decoded&&decoded.protocol===window.LK_P2P_SESSION.protocol?String(decoded.kind||''):'';}catch(err){return'';}
}
function pickSignalCode(wanted,codes){
  const populated=(Array.isArray(codes)?codes:[]).map(code=>String(code||'').trim()).filter(Boolean);
  const exact=populated.find(code=>signalKind(code)===wanted);if(exact)return exact;
  const wrong=populated.find(code=>signalKind(code));
  if(wrong){
    const actual=signalKind(wrong);
    if(wanted==='offer'&&actual==='answer')throw new Error(tr('This is a peer answer. Join needs the host invitation.','Questa è una risposta del peer. Per entrare serve l’invito dell’host.'));
    if(wanted==='answer'&&actual==='offer')throw new Error(tr('This is a host invitation. Accept needs the guest answer.','Questo è un invito host. Per accettare serve la risposta del guest.'));
  }
  return populated.length?populated[0]:'';
}
function signalCode(wanted,selectors){
  return pickSignalCode(wanted,(selectors||[]).map(selector=>field(selector)).filter(Boolean).map(node=>node.value));
}
function installSignalRouting(){
  if(!overlay)return;
  overlay.addEventListener('paste',event=>{
    const target=event.target&&event.target.closest&&event.target.closest('[data-p2p-signal]');if(!target)return;
    setTimeout(()=>{
      const code=String(target.value||'').trim(),kind=signalKind(code);if(!kind)return;
      const selector=kind==='offer'?'[data-p2p-join-offer]':kind==='answer'?'[data-p2p-host-answer]':'';
      const destination=selector&&field(selector);if(!destination||destination===target)return;
      destination.value=code;
      status(kind==='offer'?tr('Host invitation recognized and placed in Guest Join.','Invito host riconosciuto e inserito in Guest Join.'):tr('Guest answer recognized and placed in Host Accept.','Risposta guest riconosciuta e inserita in Host Accept.'));
    },0);
  });
}
async function hostInvite(){
  try{
    const name=field('[data-p2p-name]').value.trim();saveName(name);
    // A host session may own several connected peers and several outstanding
    // one-use invitations. Resetting it here made every earlier answer report
    // that its invitation/session no longer existed.
    const current=ensureSession(),state=current.state();
    if(state.role==='guest'){
      current.close();session=null;
    }
    const code=await ensureSession().createInvite();
    signalMemory.offer=code;const node=field('[data-p2p-offer]');node.value=code;selectCode(node);
    status(tr('Invitation created. Send this code privately to one peer.','Invito creato. Invia privatamente questo codice a un peer.'));
    updateUi();
  }catch(err){status(String(err&&err.message||err));}
}
async function joinInvite(){
  try{
    // Read the dedicated Guest field first, then accept the legacy Host/output
    // and Answer fields. Existing users can paste where the old UI taught them
    // to paste and the token kind—not its textarea—decides what it is.
    const code=signalCode('offer',['[data-p2p-join-offer]','[data-p2p-offer]','[data-p2p-answer]','[data-p2p-host-answer]']);if(!code)throw new Error(tr('Paste the host invitation in Guest Join first.','Incolla prima l’invito dell’host in Guest Join.'));signalMemory.joinOffer=code;
    const name=field('[data-p2p-name]').value.trim();saveName(name);
    if(session)session.close();
    else if(window.LK_P2P_ACTIVE_SESSION&&window.LK_P2P_ACTIVE_SESSION.state&&!window.LK_P2P_ACTIVE_SESSION.state().closed)window.LK_P2P_ACTIVE_SESSION.close();
    session=null;window.LK_P2P_ACTIVE_SESSION=null;
    const answer=await ensureSession().join(code);
    signalMemory.answer=answer;const node=field('[data-p2p-answer]');node.value=answer;selectCode(node);
    status(tr('Answer created. Return it to the host.','Risposta creata. Restituiscila all’host.'));
  }catch(err){status(String(err&&err.message||err));}
}
async function acceptAnswer(){
  try{const code=signalCode('answer',['[data-p2p-host-answer]','[data-p2p-answer]','[data-p2p-join-offer]','[data-p2p-offer]']);if(!code)throw new Error(tr('Paste the guest answer in Host Accept first.','Incolla prima la risposta del guest in Host Accept.'));signalMemory.hostAnswer=code;await ensureSession().acceptAnswer(code);status(tr('Answer accepted; opening encrypted channel…','Risposta accettata; apertura canale cifrato…'));}
  catch(err){status(String(err&&err.message||err));}
}
async function publishSnapshot(){
  try{
    if(!session||sessionState().peerCount<1)throw new Error(tr('Connect at least one peer before publishing.','Collega almeno un peer prima di pubblicare.'));
    const io=window.LK_EDITOR_PROJECT_IO_INSTANCE;
    if(!io||!io.createPortableCollaborationSnapshot)throw new Error('Project snapshot service unavailable');
    status(tr('Preparing portable project and embedded assets…','Preparazione progetto portabile e asset incorporati…'));
    const project=await io.createPortableCollaborationSnapshot();
    const name=project&&project.meta&&(project.meta.projectName||project.meta.trackName)||'Collaboration project',transfer=createSnapshotTransfer(project,name),meta=transfer.metadata;
    if(session.send('cowork.snapshot.begin',meta)<1)throw new Error(tr('The peer disconnected before the snapshot started.','Il peer si è disconnesso prima dell’inizio dello snapshot.'));
    for(let index=0;index<meta.totalChunks;index++){
      if(session.send('cowork.snapshot.chunk',transfer.chunk(index))<1)throw new Error(tr('The peer disconnected during the snapshot.','Il peer si è disconnesso durante lo snapshot.'));
      if(session.pressure&&session.pressure('reliable').totalBytes>4*1024*1024&&session.waitForDrain)await session.waitForDrain({channel:'reliable',maxBytes:512*1024,maxFrames:24,timeout:45000});
      if(index===meta.totalChunks-1||index%8===7)status(tr('Sending project snapshot: ','Invio snapshot progetto: ')+Math.round((index+1)/meta.totalChunks*100)+'%');
    }
    if(session.send('cowork.snapshot.commit',transfer.commit)<1)throw new Error(tr('The peer disconnected before snapshot verification.','Il peer si è disconnesso prima della verifica dello snapshot.'));
    status(tr('Snapshot sent reliably to ','Snapshot inviato in modo affidabile a ')+sessionState().peerCount+' peer.');
  }catch(err){status(String(err&&err.message||err));}
}
function applySnapshot(){
  if(!pendingSnapshot)return;
  if(!confirm(tr('Import the peer snapshot as a new local browser project and reload the editor? Your current local project is not overwritten.','Importare lo snapshot del peer come nuovo progetto locale e ricaricare l’editor? Il progetto locale corrente non viene sovrascritto.')))return;
  const io=window.LK_EDITOR_PROJECT_IO_INSTANCE;
  if(!io||!io.applyPortableCollaborationSnapshot)return status('Project snapshot service unavailable');
  io.applyPortableCollaborationSnapshot(pendingSnapshot,'P2P Collaboration.lkep.json').catch(err=>status(String(err&&err.message||err)));
}
async function createRecoveryInvite(peerId){
  try{
    if(session&&session.state().closed){session=null;window.LK_P2P_ACTIVE_SESSION=null;}
    openOverlay();
    await hostInvite();
    const peer=recentPeers.get(String(peerId||''));
    status((peer?tr('Fresh invitation for ','Nuovo invito per ')+peer.name+'. ':tr('Fresh invitation created. ','Nuovo invito creato. '))+tr('It has been copied; send it privately to the user.','È stato copiato; invialo privatamente all’utente.'));
    toggleSessionPanel(false);
  }catch(error){status(String(error&&error.message||error));}
}
function kickPeer(peerId){
  const peer=recentPeers.get(String(peerId||'')),name=peer&&peer.name||'Peer';
  if(!session||!isHost()||typeof session.disconnectPeer!=='function')return;
  if(!confirm(tr('Remove ','Espellere ')+name+tr(' from this P2P session?',' da questa sessione P2P?')))return;
  if(session.disconnectPeer(peerId,tr('Removed by host','Espulso dall’host'))){rememberPeer(peerId,name,'disconnecting');status(tr('Removing peer: ','Espulsione peer: ')+name);}
  updateUi();
}
function disconnectSession(){
  if(!session||session.state().closed)return;
  if(!confirm(tr('Disconnect this browser from the current P2P session?','Disconnettere questo browser dalla sessione P2P corrente?')))return;
  releaseDesiredLock();session.close();window.LK_P2P_ACTIVE_SESSION=null;lastDisconnectReason=tr('Disconnected locally.','Disconnesso localmente.');toggleSessionPanel(false);updateUi();
}
function handleSessionPanelClick(event){
  const target=event.target&&event.target.closest&&event.target.closest('button');if(!target)return;
  if(target.hasAttribute('data-p2p-monitor-close'))return toggleSessionPanel(false);
  if(target.hasAttribute('data-p2p-studio')){toggleSessionPanel(false);openOverlay();return;}
  if(target.hasAttribute('data-p2p-new-invite')){createRecoveryInvite('');return;}
  if(target.hasAttribute('data-p2p-reinvite')){createRecoveryInvite(target.getAttribute('data-p2p-reinvite'));return;}
  if(target.hasAttribute('data-p2p-kick')){kickPeer(target.getAttribute('data-p2p-kick'));return;}
  if(target.hasAttribute('data-p2p-disconnect'))disconnectSession();
}
function closeOverlay(){if(overlay){rememberSignals();overlay.remove();overlay=null;}updateSessionChrome();}
function openOverlay(){
  if(!env)env={GAME:window.LOT_KING,STORE:window.LK_STORE,ED:null,status:message=>console.info('LotKing P2P:',message)};
  if(!session&&window.LK_P2P_ACTIVE_SESSION&&window.LK_P2P_ACTIVE_SESSION.state&&!window.LK_P2P_ACTIVE_SESSION.state().closed){try{ensureSession();}catch(error){status(String(error&&error.message||error));}}
  if(overlay){overlay.style.display='flex';updateUi();return;}
  const style=document.getElementById('lkP2pStyle')||document.head.appendChild(Object.assign(document.createElement('style'),{id:'lkP2pStyle',textContent:'.lk-p2p-bg{position:fixed;inset:0;z-index:10050;background:#050811dc;display:flex;align-items:center;justify-content:center;padding:24px}.lk-p2p{width:min(920px,96vw);max-height:92vh;overflow:auto;background:#111827;border:1px solid #334155;border-radius:14px;padding:20px;color:#e5edf8;box-shadow:0 24px 80px #000}.lk-p2p h2{margin:0 0 4px}.lk-p2p-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.lk-p2p section{background:#0b1220;border:1px solid #263449;border-radius:10px;padding:12px}.lk-p2p textarea,.lk-p2p input{width:100%;box-sizing:border-box;background:#070b12;color:#dbeafe;border:1px solid #334155;border-radius:6px;padding:8px}.lk-p2p textarea{min-height:84px;resize:vertical;font:11px monospace}.lk-p2p button{margin:6px 6px 0 0;padding:8px 11px}.lk-p2p small{display:block;color:#93a4bc;line-height:1.4}.lk-p2p-state{color:#7dd3fc;margin:8px 0;white-space:pre-wrap}@media(max-width:720px){.lk-p2p-grid{grid-template-columns:1fr}}'}));
  void style;
  overlay=document.createElement('div');overlay.className='lk-p2p-bg';
  overlay.innerHTML=`
    <div class="lk-p2p" role="dialog" aria-modal="true">
      <button data-p2p-close style="float:right">×</button>
      <h2>P2P Sessions & Coworking</h2>
      <small>${tr('Encrypted WebRTC data channels. Invite codes contain connection data: share them only with collaborators you trust.','Canali dati WebRTC cifrati. I codici invito contengono dati di connessione: condividili solo con collaboratori fidati.')}</small>
      <div class="lk-p2p-state" data-p2p-state></div>
      <label>${tr('Display name','Nome visualizzato')}<input data-p2p-name maxlength="80"></label>
      <div class="lk-p2p-grid">
        <section>
          <b>1 · Host</b>
          <small>${tr('Create an invitation and send it to the guest. Then paste the guest answer below.','Crea un invito e invialo al guest. Poi incolla qui sotto la risposta del guest.')}</small>
          <button data-p2p-host>${tr('Create invitation','Crea invito')}</button>
          <label>${tr('Invitation to send','Invito da inviare')}<textarea data-p2p-offer data-p2p-signal="offer" placeholder="Host invitation code"></textarea></label>
          <label>${tr('Paste guest answer','Incolla risposta guest')}<textarea data-p2p-host-answer data-p2p-signal="answer" placeholder="Guest answer code"></textarea></label>
          <button data-p2p-accept>${tr('Accept guest answer','Accetta risposta guest')}</button>
        </section>
        <section>
          <b>2 · Guest</b>
          <small>${tr('Paste the host invitation here, create the answer, then return that answer to the host.','Incolla qui l’invito host, crea la risposta, poi restituiscila all’host.')}</small>
          <label>${tr('Paste host invitation','Incolla invito host')}<textarea data-p2p-join-offer data-p2p-signal="offer" placeholder="Host invitation code"></textarea></label>
          <button data-p2p-join>${tr('Join and create answer','Entra e crea risposta')}</button>
          <label>${tr('Answer to return','Risposta da restituire')}<textarea data-p2p-answer data-p2p-signal="answer" placeholder="Guest answer code"></textarea></label>
        </section>
        <section>
          <b>${tr('Live coauthoring locks','Blocchi coauthoring live')}</b>
          <small>${tr('Both peers can edit and save. Selecting an element reserves only that element; Inspector, gizmo, Pawn Studio and Cinema Studio become read-only for the other peer until it is released.','Entrambi i peer possono modificare e salvare. Selezionare un elemento riserva solo quell’elemento; Inspector, gizmo, Pawn Studio e Cinema Studio diventano in sola lettura per l’altro peer fino al rilascio.')}</small>
          <pre data-p2p-peers></pre>
        </section>
        <section>
          <b>${tr('Portable project snapshot','Snapshot progetto portabile')}</b>
          <small>${tr('Either collaborator can send a complete LKEP. Applying creates a new browser project and never silently overwrites this one.','Entrambi i collaboratori possono inviare un LKEP completo. Applica crea un nuovo progetto browser senza sovrascrivere questo in silenzio.')}</small>
          <button data-p2p-publish>${tr('Publish snapshot','Pubblica snapshot')}</button>
          <button data-p2p-apply>${tr('Apply received snapshot','Applica snapshot ricevuto')}</button>
        </section>
      </div>
      <details>
        <summary>${tr('Advanced Internet connection (TURN)','Connessione Internet avanzata (TURN)')}</summary>
        <small>${tr('The default STUN route covers LAN and many home networks. For restrictive NAT/firewalls, paste a private ICE server JSON array with TURN credentials. It is stored only in this browser, never in the project or invitation.','La rotta STUN predefinita copre LAN e molte reti domestiche. Per NAT/firewall restrittivi, incolla un array JSON ICE privato con credenziali TURN. Resta solo in questo browser, mai nel progetto o nell’invito.')}</small>
        <textarea data-p2p-ice placeholder='[{"urls":"turns:turn.example.com:5349","username":"…","credential":"…"}]'></textarea>
      </details>
      <div class="lk-p2p-state" data-p2p-status>${tr('Ready. Project/gameplay data travels only through the encrypted peer channel.','Pronto. I dati progetto/gameplay viaggiano solo nel canale cifrato tra peer.')}</div>
    </div>`;
  document.body.appendChild(overlay);field('[data-p2p-name]').value=displayName();field('[data-p2p-ice]').value=storedIceText();field('[data-p2p-offer]').value=signalMemory.offer;field('[data-p2p-join-offer]').value=signalMemory.joinOffer;field('[data-p2p-answer]').value=signalMemory.answer;field('[data-p2p-host-answer]').value=signalMemory.hostAnswer;
  overlay.addEventListener('input',event=>{const target=event.target;if(!target)return;if(target.matches('[data-p2p-offer]'))signalMemory.offer=target.value;else if(target.matches('[data-p2p-join-offer]'))signalMemory.joinOffer=target.value;else if(target.matches('[data-p2p-answer]'))signalMemory.answer=target.value;else if(target.matches('[data-p2p-host-answer]'))signalMemory.hostAnswer=target.value;});
  field('[data-p2p-close]').onclick=closeOverlay;field('[data-p2p-host]').onclick=hostInvite;field('[data-p2p-join]').onclick=joinInvite;field('[data-p2p-accept]').onclick=acceptAnswer;field('[data-p2p-publish]').onclick=publishSnapshot;field('[data-p2p-apply]').onclick=applySnapshot;installSignalRouting();
  updateUi();startPresence();
}

const plugin={
  id:'p2p-sessions',name:'P2P Sessions & Coworking',version:'0.4.0',category:'Networking',builtIn:false,enabledByDefault:true,
  description:'Browser-only WebRTC sessions with simultaneous coauthoring, per-element edit leases and coordinated local saves.',
  capabilities:['Encrypted WebRTC DataChannel','Manual serverless signaling','Logic Element network events','Multi-author collaboration','Per-element edit leases','Coordinated local saves','Portable project snapshots'],
  register(api,pluginEnv){
    env=pluginEnv||api&&api.env||{};
    if(!api)return;
    api.capability('p2p-session','Encrypted peer-to-peer data transport with explicit invitation');
    api.capability('coworking','Multi-author live objects with host-arbitrated locks and coordinated local saves');
    api.runtimeHook('p2p-logic-messages',{label:'P2P Logic Element messages',description:'Network event transport for gameplay and previews.'});
    api.command('p2p.open',{label:'P2P Sessions & Coworking',menu:'Plugins',run:openOverlay});
    api.menu('plugins',{label:'P2P Sessions & Coworking',icon:'⇄',sub:[{label:'Open session studio',icon:'⇄',action:()=>api.runCommand('p2p.open')}]});installUiGuard();installSaveRelay();installStructureRelay();installSessionChrome();startPresence();updateUi();
  },
};

window.LK_P2P_COLLABORATION_PLUGIN=Object.freeze(plugin);
window.LK_P2P_COLLABORATION=Object.freeze({open:openOverlay,state:sessionState,session:()=>session,signalKind,pickSignalCode,snapshotChecksum,createSnapshotTransfer,consumeSnapshotPacket,canEdit:canEditObject,requestLock:(object,surface)=>ensureLockCoordinator()&&ensureLockCoordinator().request(typeof object==='string'?object:persistentId(object),surface),releaseLock:object=>ensureLockCoordinator()&&ensureLockCoordinator().release(typeof object==='string'?object:persistentId(object)),locks:()=>ensureLockCoordinator()&&ensureLockCoordinator().snapshot()});
})();
