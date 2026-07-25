/* =========================================================
   LOT KING — P2P Sessions & Coworking plugin
   Default-enabled, inspectable WebRTC collaboration example.
   One explicit authority publishes changes; other peers remain
   independent reviewers until control is granted.
   ========================================================= */
(function(){
'use strict';

const NAME_KEY='lotking.p2p.displayName.v1';
let env=null,session=null,overlay=null,unsubscribe=null,pendingSnapshot=null;
let authorityId='',hostPeerId='',controlRequester='',lastTransformSignature='',presenceTimer=null;

function tr(en,it){return window.LOT_KING&&LOT_KING.i18n&&LOT_KING.i18n.lang==='it'?(it||en):en;}
function displayName(){try{return localStorage.getItem(NAME_KEY)||('Editor '+Math.random().toString(36).slice(2,6).toUpperCase());}catch(err){return'Lot King Editor';}}
function saveName(value){try{localStorage.setItem(NAME_KEY,String(value||'').trim().slice(0,80));}catch(err){}}
function status(message){if(env&&env.status)env.status(message);const node=overlay&&overlay.querySelector('[data-p2p-status]');if(node)node.textContent=message;}
function sessionState(){return session?session.state():{supported:typeof RTCPeerConnection==='function',role:'idle',peerCount:0,peers:[],selfId:'',sessionId:''};}
function isAuthority(){const state=sessionState();return !!state.selfId&&authorityId===state.selfId;}
function updateUi(){
  if(!overlay)return;
  const state=sessionState(),stateNode=overlay.querySelector('[data-p2p-state]'),peers=overlay.querySelector('[data-p2p-peers]');
  if(stateNode)stateNode.textContent=(state.supported?String(state.role||'idle').toUpperCase():'UNSUPPORTED')+' · '+state.peerCount+' peer · '+(isAuthority()?tr('EDIT CONTROL','CONTROLLO MODIFICA'):tr('REVIEW / LOCAL DRAFT','REVISIONE / BOZZA LOCALE'));
  if(peers)peers.textContent=state.peers.length?state.peers.map(peer=>(peer.name||peer.id)+' · '+peer.state).join('\n'):tr('No connected peers.','Nessun peer collegato.');
  const publish=overlay.querySelector('[data-p2p-publish]'),apply=overlay.querySelector('[data-p2p-apply]'),grant=overlay.querySelector('[data-p2p-grant]');
  if(publish)publish.disabled=!isAuthority()||state.peerCount<1;
  if(apply)apply.disabled=!pendingSnapshot;
  if(grant)grant.disabled=!controlRequester||state.role!=='host';
}
function ensureSession(){
  if(session&&!session.state().closed)return session;
  if(!window.LK_P2P_SESSION)throw new Error('P2P runtime unavailable');
  session=window.LK_P2P_SESSION.create({name:displayName()});
  window.LK_P2P_ACTIVE_SESSION=session;
  authorityId='';hostPeerId='';controlRequester='';pendingSnapshot=null;
  if(unsubscribe)unsubscribe();
  unsubscribe=session.subscribe(handleSessionEvent);
  updateUi();
  return session;
}
function handleSessionEvent(event){
  if(event.kind==='state'){
    if(event.action==='channel-open'&&sessionState().role==='host'){
      if(!authorityId)authorityId=sessionState().selfId;
      session.send('collab.authority',{peerId:authorityId});
    }
    if(event.action==='peer-ready'){
      if(sessionState().role==='guest'&&!hostPeerId)hostPeerId=event.peerId;
      status(tr('Peer connected: ','Peer collegato: ')+(event.name||event.peerId));
    }
    if(event.action==='channel-error'||event.action==='send-error')status(tr('P2P transport error.','Errore trasporto P2P.'));
    updateUi();
    return;
  }
  if(event.kind!=='message')return;
  if(event.type==='collab.authority'){
    if(sessionState().role==='host'||!hostPeerId||event.peerId!==hostPeerId)return;
    authorityId=String(event.payload&&event.payload.peerId||'');
    status(isAuthority()?tr('You have edit control.','Hai il controllo delle modifiche.'):tr('Peer authority active; local edits stay private.','Autorità peer attiva; le modifiche locali restano private.'));
  } else if(event.type==='collab.control-request'&&sessionState().role==='host'){
    controlRequester=event.peerId;
    status((event.peerName||'Peer')+tr(' requests edit control.',' richiede il controllo modifiche.'));
  } else if(event.type==='collab.transform'){
    applyRemoteTransform(event);
  } else if(event.type==='collab.snapshot'){
    if(!authorityId||event.peerId!==authorityId)return;
    pendingSnapshot=event.payload&&event.payload.project||null;
    status(pendingSnapshot?tr('A complete peer snapshot is ready. Review and apply it explicitly.','È pronto uno snapshot completo del peer. Controllalo e applicalo esplicitamente.'):tr('Invalid collaboration snapshot.','Snapshot collaborazione non valido.'));
  }
  updateUi();
}
function applyRemoteTransform(event){
  if(isAuthority()||!authorityId||event.peerId!==authorityId)return;
  const patch=event.payload||{},registry=env&&env.GAME&&env.GAME.world&&env.GAME.world.registry;
  if(!patch.id||!patch.transform||!Array.isArray(registry))return;
  const object=registry.find(item=>item&&item.userData&&item.userData.editorId===patch.id);
  if(!object)return;
  env.STORE.applyT(object,patch.transform);
  if(env.STORE.syncCollider)env.STORE.syncCollider(object);
  if(env.buildInspector)env.buildInspector();
  window.dispatchEvent(new CustomEvent('lotking:collab-transform-applied',{detail:{id:patch.id,peerId:event.peerId}}));
}
function startPresence(){
  if(presenceTimer)return;
  presenceTimer=setInterval(()=>{
    const state=sessionState();
    if(!session||state.peerCount<1||!isAuthority()||!env||!env.ED||!env.STORE)return;
    const object=env.ED.selected;
    if(!object||!object.userData||!object.userData.editorId)return;
    const payload={id:object.userData.editorId,name:object.userData.editorName||object.name||'',transform:env.STORE.tOf(object)};
    const signature=JSON.stringify(payload);
    if(signature===lastTransformSignature)return;
    lastTransformSignature=signature;
    session.send('collab.transform',payload);
  },180);
}
function field(selector){return overlay&&overlay.querySelector(selector);}
function selectCode(node){if(!node)return;node.focus();node.select();try{navigator.clipboard&&navigator.clipboard.writeText(node.value).catch(()=>{});}catch(err){}}
async function hostInvite(){
  try{
    const name=field('[data-p2p-name]').value.trim();saveName(name);
    if(session)session.close();session=null;
    const code=await ensureSession().createInvite();
    const node=field('[data-p2p-offer]');node.value=code;selectCode(node);
    authorityId=sessionState().selfId;
    status(tr('Invitation created. Send this code privately to one peer.','Invito creato. Invia privatamente questo codice a un peer.'));
    updateUi();
  }catch(err){status(String(err&&err.message||err));}
}
async function joinInvite(){
  try{
    const code=field('[data-p2p-offer]').value.trim();if(!code)throw new Error(tr('Paste the host invitation first.','Incolla prima l’invito dell’host.'));
    const name=field('[data-p2p-name]').value.trim();saveName(name);
    if(session)session.close();session=null;
    const answer=await ensureSession().join(code);
    const node=field('[data-p2p-answer]');node.value=answer;selectCode(node);
    status(tr('Answer created. Return it to the host.','Risposta creata. Restituiscila all’host.'));
  }catch(err){status(String(err&&err.message||err));}
}
async function acceptAnswer(){
  try{const code=field('[data-p2p-answer]').value.trim();if(!code)throw new Error(tr('Paste the peer answer first.','Incolla prima la risposta del peer.'));await ensureSession().acceptAnswer(code);status(tr('Answer accepted; opening encrypted channel…','Risposta accettata; apertura canale cifrato…'));}
  catch(err){status(String(err&&err.message||err));}
}
async function publishSnapshot(){
  try{
    if(!isAuthority())throw new Error(tr('Only the active editor can publish.','Solo l’editor attivo può pubblicare.'));
    const io=window.LK_EDITOR_PROJECT_IO_INSTANCE;
    if(!io||!io.createPortableCollaborationSnapshot)throw new Error('Project snapshot service unavailable');
    status(tr('Preparing portable project and embedded assets…','Preparazione progetto portabile e asset incorporati…'));
    const project=await io.createPortableCollaborationSnapshot();
    const count=session.send('collab.snapshot',{name:project&&project.meta&&(project.meta.projectName||project.meta.trackName)||'Collaboration project',project});
    status(tr('Snapshot queued for ','Snapshot accodato per ')+count+' peer.');
  }catch(err){status(String(err&&err.message||err));}
}
function applySnapshot(){
  if(!pendingSnapshot)return;
  if(!confirm(tr('Import the peer snapshot as a new local browser project and reload the editor? Your current local project is not overwritten.','Importare lo snapshot del peer come nuovo progetto locale e ricaricare l’editor? Il progetto locale corrente non viene sovrascritto.')))return;
  const io=window.LK_EDITOR_PROJECT_IO_INSTANCE;
  if(!io||!io.applyPortableCollaborationSnapshot)return status('Project snapshot service unavailable');
  io.applyPortableCollaborationSnapshot(pendingSnapshot,'P2P Collaboration.lkep.json').catch(err=>status(String(err&&err.message||err)));
}
function requestControl(){if(session&&sessionState().peerCount)session.send('collab.control-request',{peerId:sessionState().selfId,name:displayName()});}
function grantControl(){if(!session||!controlRequester)return;authorityId=controlRequester;session.send('collab.authority',{peerId:authorityId});controlRequester='';status(tr('Edit control granted. Your local edits now remain private.','Controllo modifiche concesso. Le tue modifiche locali ora restano private.'));updateUi();}
function reclaimControl(){if(!session||sessionState().role!=='host')return;authorityId=sessionState().selfId;session.send('collab.authority',{peerId:authorityId});status(tr('Host edit control restored.','Controllo modifiche host ripristinato.'));updateUi();}
function closeOverlay(){if(overlay){overlay.remove();overlay=null;}}
function openOverlay(){
  if(!env)env={GAME:window.LOT_KING,STORE:window.LK_STORE,ED:null,status:message=>console.info('LotKing P2P:',message)};
  if(overlay){overlay.style.display='flex';updateUi();return;}
  const style=document.getElementById('lkP2pStyle')||document.head.appendChild(Object.assign(document.createElement('style'),{id:'lkP2pStyle',textContent:'.lk-p2p-bg{position:fixed;inset:0;z-index:10050;background:#050811dc;display:flex;align-items:center;justify-content:center;padding:24px}.lk-p2p{width:min(920px,96vw);max-height:92vh;overflow:auto;background:#111827;border:1px solid #334155;border-radius:14px;padding:20px;color:#e5edf8;box-shadow:0 24px 80px #000}.lk-p2p h2{margin:0 0 4px}.lk-p2p-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.lk-p2p section{background:#0b1220;border:1px solid #263449;border-radius:10px;padding:12px}.lk-p2p textarea,.lk-p2p input{width:100%;box-sizing:border-box;background:#070b12;color:#dbeafe;border:1px solid #334155;border-radius:6px;padding:8px}.lk-p2p textarea{min-height:84px;resize:vertical;font:11px monospace}.lk-p2p button{margin:6px 6px 0 0;padding:8px 11px}.lk-p2p small{display:block;color:#93a4bc;line-height:1.4}.lk-p2p-state{color:#7dd3fc;margin:8px 0;white-space:pre-wrap}@media(max-width:720px){.lk-p2p-grid{grid-template-columns:1fr}}'}));
  void style;
  overlay=document.createElement('div');overlay.className='lk-p2p-bg';
  overlay.innerHTML='<div class="lk-p2p" role="dialog" aria-modal="true"><button data-p2p-close style="float:right">×</button><h2>P2P Sessions & Coworking</h2><small>'+tr('Encrypted WebRTC data channels. Invite codes contain connection data: share them only with collaborators you trust.','Canali dati WebRTC cifrati. I codici invito contengono dati di connessione: condividili solo con collaboratori fidati.')+'</small><div class="lk-p2p-state" data-p2p-state></div><label>'+tr('Display name','Nome visualizzato')+'<input data-p2p-name maxlength="80"></label><div class="lk-p2p-grid"><section><b>1 · Host</b><small>'+tr('Create a fresh, 15-minute invitation for one peer. Create another invite for each additional peer.','Crea un invito nuovo, valido 15 minuti, per un peer. Crea un altro invito per ogni peer aggiuntivo.')+'</small><button data-p2p-host>'+tr('Create invitation','Crea invito')+'</button><textarea data-p2p-offer placeholder="Offer / invitation code"></textarea></section><section><b>2 · Guest</b><small>'+tr('Paste the host invitation, create the answer, then send the answer back to the host.','Incolla l’invito host, crea la risposta, poi restituiscila all’host.')+'</small><button data-p2p-join>'+tr('Join and create answer','Entra e crea risposta')+'</button><textarea data-p2p-answer placeholder="Answer code"></textarea><button data-p2p-accept>'+tr('Host: accept answer','Host: accetta risposta')+'</button></section><section><b>'+tr('Coworking authority','Autorità coworking')+'</b><small>'+tr('Exactly one peer publishes transforms and snapshots. Other editors keep an independent local draft, so simultaneous changes cannot silently overwrite each other.','Un solo peer pubblica trasformazioni e snapshot. Gli altri editor mantengono una bozza locale indipendente, quindi modifiche simultanee non possono sovrascriversi in silenzio.')+'</small><button data-p2p-request>'+tr('Request edit control','Richiedi controllo modifiche')+'</button><button data-p2p-grant>'+tr('Grant request','Concedi richiesta')+'</button><button data-p2p-reclaim>'+tr('Host reclaim','Riprendi come host')+'</button><pre data-p2p-peers></pre></section><section><b>'+tr('Portable project snapshot','Snapshot progetto portabile')+'</b><small>'+tr('The authority sends a complete LKEP including portable assets. Receiving it never auto-overwrites the open project: applying creates a new browser project and reloads.','L’autorità invia un LKEP completo con asset portabili. La ricezione non sovrascrive mai automaticamente il progetto aperto: Applica crea un nuovo progetto browser e ricarica.')+'</small><button data-p2p-publish>'+tr('Publish snapshot','Pubblica snapshot')+'</button><button data-p2p-apply>'+tr('Apply received snapshot','Applica snapshot ricevuto')+'</button></section></div><div class="lk-p2p-state" data-p2p-status>'+tr('Ready. No data is uploaded by the static server.','Pronto. Nessun dato viene caricato dal server statico.')+'</div></div>';
  document.body.appendChild(overlay);field('[data-p2p-name]').value=displayName();
  field('[data-p2p-close]').onclick=closeOverlay;field('[data-p2p-host]').onclick=hostInvite;field('[data-p2p-join]').onclick=joinInvite;field('[data-p2p-accept]').onclick=acceptAnswer;field('[data-p2p-publish]').onclick=publishSnapshot;field('[data-p2p-apply]').onclick=applySnapshot;field('[data-p2p-request]').onclick=requestControl;field('[data-p2p-grant]').onclick=grantControl;field('[data-p2p-reclaim]').onclick=reclaimControl;
  updateUi();startPresence();
}

const plugin={
  id:'p2p-sessions',name:'P2P Sessions & Coworking',version:'0.1.0',category:'Networking',builtIn:false,enabledByDefault:true,
  description:'Browser-only WebRTC sessions, Logic Element messages and host-authoritative coworking with portable LKEP snapshots.',
  capabilities:['Encrypted WebRTC DataChannel','Manual serverless signaling','Logic Element network events','Single-authority collaboration','Portable project snapshots'],
  register(api,pluginEnv){
    env=pluginEnv||api&&api.env||{};
    if(!api)return;
    api.capability('p2p-session','Encrypted peer-to-peer data transport with explicit invitation');
    api.capability('coworking','Single-authority live transforms and opt-in portable snapshots');
    api.runtimeHook('p2p-logic-messages',{label:'P2P Logic Element messages',description:'Network event transport for gameplay and previews.'});
    api.command('p2p.open',{label:'P2P Sessions & Coworking',menu:'Plugins',run:openOverlay});
    api.menu('plugins',{label:'P2P Sessions & Coworking',icon:'⇄',sub:[{label:'Open session studio',icon:'⇄',action:()=>api.runCommand('p2p.open')}]});
  },
};

window.LK_P2P_COLLABORATION_PLUGIN=Object.freeze(plugin);
window.LK_P2P_COLLABORATION=Object.freeze({open:openOverlay,state:sessionState,session:()=>session});
})();
