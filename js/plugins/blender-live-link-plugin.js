/* =========================================================
   LOT KING — Blender Live Link editor plugin
   Bidirectional, localhost-only scene transforms and normalized scene assets.
   ========================================================= */
(function(root){
'use strict';

const CORE=root.LK_BLENDER_LIVE_LINK_CORE;
const SETTINGS_KEY='lotking.blenderLiveLink.settings.v1';
const DEFAULT_URL='ws://127.0.0.1:5200';
const LOCAL_PORT_SCAN_COUNT=20;
const BINARY_CHUNK_BYTES=2*1024*1024;
const EXPORT_BATCH_MESHES=24;
const EXPORT_BATCH_BYTES=48*1024*1024;
const BINARY_MAGIC=new Uint8Array([76,75,71,76,66,49]);
let env=null,overlay=null,client=null;

function tr(en,it){return root.LOT_KING&&LOT_KING.i18n&&LOT_KING.i18n.lang==='it'?(it||en):en;}
function loadSettings(){try{const value=Object.assign({url:DEFAULT_URL,token:'',autoTransforms:true,acceptAssets:true,placeAssets:false},JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'));if(/^ws:\/\/(?:127\.0\.0\.1|localhost):8765\/?$/i.test(String(value.url||'')))value.url=DEFAULT_URL;return value;}catch(error){return{url:DEFAULT_URL,token:'',autoTransforms:true,acceptAssets:true,placeAssets:false};}}
function saveSettings(value){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(value));}catch(error){}}
function randomId(prefix){const bytes=new Uint8Array(12);if(root.crypto&&crypto.getRandomValues)crypto.getRandomValues(bytes);else bytes.forEach((_,i)=>bytes[i]=Math.floor(Math.random()*256));return prefix+Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');}
function versionAtLeast(value,wanted){const a=String(value||'').split('.').map(Number),b=String(wanted||'').split('.').map(Number);for(let index=0;index<Math.max(a.length,b.length);index++){const left=a[index]||0,right=b[index]||0;if(left!==right)return left>right;}return true;}
function localEndpointCandidates(endpoint,count){const first=CORE.localEndpoint(endpoint);if(!first)return[];const url=new URL(first),start=Number(url.port)||5200,total=Math.max(1,Number(count)||LOCAL_PORT_SCAN_COUNT),result=[];for(let offset=0;offset<total&&start+offset<=65535;offset++){const candidate=new URL(url.toString());candidate.port=String(start+offset);result.push(candidate.toString());}return result;}
function projectId(){try{const data=env&&env.STORE&&env.STORE.collect?env.STORE.collect():null;return CORE.cleanId(data&&data.meta&&(data.meta.trackId||data.meta.levelId)||'active-level');}catch(error){return'active-level';}}
function registry(){const list=env&&env.GAME&&env.GAME.world&&env.GAME.world.registry;return Array.isArray(list)?list:[];}
function authoredLogicVisual(data){return !!(data&&data.logicElementInternal&&data.logicElementRuntimeVisual!==false);}
function excludedVisual(node){
  const data=node&&node.userData||{},type=String(data.editorType||'').toLowerCase();
  return !!(
    data.helper || data.helperOnly || data.colliderPreview || data.colliderOnly ||
    data.editorOnly || data.editorCameraHelper || data.editorCameraHelperPick ||
    data.editorLightHandle || data.lightPickHandle || data.runtimeTransient ||
    data.lkPathTracingIgnore || data.lkFlareIgnore ||
    (data.nonExportable&&!authoredLogicVisual(data)) ||
    type==='playereffect' || type==='playerskid' || type==='playercamera'
  );
}
function belongsToScene(object,scene){for(let node=object;node;node=node.parent)if(node===scene)return true;return false;}
function bridgeObjects(){
  const scene=env&&env.GAME&&env.GAME.core&&env.GAME.core.scene;
  return registry().filter(object=>object&&object.userData&&object.userData.editorId&&!excludedVisual(object)&&(!scene||belongsToScene(object,scene)));
}
function hasExportContent(object){let found=false;object&&object.traverse&&object.traverse(node=>{if(!found&&!excludedVisual(node)&&(node.isMesh||node.isSkinnedMesh||node.isLine||node.isPoints||node.isLight))found=true;});return found;}
function renderAssetSelection(){
  const scene=env&&env.GAME&&env.GAME.core&&env.GAME.core.scene,objects=bridgeObjects().filter(hasExportContent);
  // The generated terrain/water/worldscape is intentionally not an editable
  // registry object, but it is still authored, visible level content.
  if(scene&&scene.children)scene.children.forEach(child=>{if(child&&child.userData&&child.userData.lkProceduralOwned&&hasExportContent(child))objects.push(child);});
  const unique=Array.from(new Set(objects)),set=new Set(unique),roots=unique.filter(object=>{let parent=object.parent;while(parent){if(set.has(parent))return false;parent=parent.parent;}return true;});
  const nodes=new Set(),meshes=new Set(),materials=new Set(),textures=new Set();
  roots.forEach(rootObject=>rootObject.traverse&&rootObject.traverse(node=>{
    if(excludedVisual(node))return;nodes.add(node);if(node.isMesh||node.isSkinnedMesh||node.isLine||node.isPoints)meshes.add(node);
    (Array.isArray(node.material)?node.material:[node.material]).filter(Boolean).forEach(material=>{materials.add(material);Object.keys(material).forEach(key=>{const value=material[key];if(value&&value.isTexture)textures.add(value);});});
  }));
  return{roots,stats:{nodes:nodes.size,meshes:meshes.size,materials:materials.size,textures:textures.size}};
}
function geometryBytes(geometry){
  if(!geometry)return 0;const arrays=new Set();if(geometry.index&&geometry.index.array)arrays.add(geometry.index.array);
  Object.values(geometry.attributes||{}).forEach(attribute=>{if(attribute&&attribute.array)arrays.add(attribute.array);});
  Object.values(geometry.morphAttributes||{}).forEach(list=>(list||[]).forEach(attribute=>{if(attribute&&attribute.array)arrays.add(attribute.array);}));
  return Array.from(arrays).reduce((total,array)=>total+(Number(array&&array.byteLength)||0),0);
}
function rootExportWeight(rootObject,omitNodes){let meshes=0,bytes=0,omitted=node=>{for(let current=node;current;current=current.parent)if(omitNodes&&omitNodes.has(current))return true;return false;};rootObject&&rootObject.traverse&&rootObject.traverse(node=>{if(omitted(node)||excludedVisual(node)||!(node.isMesh||node.isSkinnedMesh||node.isLine||node.isPoints))return;meshes++;bytes+=geometryBytes(node.geometry);});return{meshes,bytes};}
function exportBatches(roots,omitNodes){
  const batches=[];let current=[],meshes=0,bytes=0;
  (roots||[]).forEach(rootObject=>{const weight=rootExportWeight(rootObject,omitNodes);if(!weight.meshes)return;const overflow=current.length&&(meshes+weight.meshes>EXPORT_BATCH_MESHES||bytes+weight.bytes>EXPORT_BATCH_BYTES);if(overflow){batches.push(current);current=[];meshes=0;bytes=0;}current.push(rootObject);meshes+=weight.meshes;bytes+=weight.bytes;});
  if(current.length)batches.push(current);return batches;
}
function allowUiPaint(){return new Promise(resolve=>{if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(()=>setTimeout(resolve,0));else setTimeout(resolve,0);});}
function nonEmptyObject(value){return !!(value&&typeof value==='object'&&Object.keys(value).length);}
function canonicalAssetRef(asset){if(!asset)return null;const dbKey=asset.dbKey||asset.asset&&asset.asset.dbKey||'',src=asset.src||asset.asset&&asset.asset.src||'';return dbKey||src?{dbKey:String(dbKey||''),src:String(src||''),name:String(asset.name||asset.asset&&asset.asset.name||'Scene Asset')}:null;}
function placementTransform(container){
  if(!container||!env||!env.THREE)return null;container.updateMatrixWorld&&container.updateMatrixWorld(true);const matrix=container.matrixWorld.clone(),wrap=container.children&&container.children[0],source=wrap&&wrap.children&&wrap.children[0];if(wrap&&wrap.matrix)matrix.multiply(wrap.matrix);if(source&&source.matrix)matrix.multiply(source.matrix);
  const position=new env.THREE.Vector3(),quaternion=new env.THREE.Quaternion(),scale=new env.THREE.Vector3();matrix.decompose(position,quaternion,scale);return{position:position.toArray(),quaternion:quaternion.toArray(),scale:scale.toArray(),visible:container.visible!==false};
}
function collectPassthroughCandidates(roots){
  const groups=new Map(),directRoots=new Set(),omitNodes=new Set(),add=(ref,instance,node,direct)=>{const key=ref.dbKey?'db:'+ref.dbKey:'src:'+ref.src,item=groups.get(key)||{key,ref,instances:[]};item.instances.push(instance);groups.set(key,item);omitNodes.add(node);if(direct)directRoots.add(node);};
  (roots||[]).forEach(object=>{
    const data=object&&object.userData||{},entry=data.addedEntry,ref=entry&&entry.kind==='glb'&&canonicalAssetRef(entry),edited=nonEmptyObject(entry&&entry.meshEdits)||nonEmptyObject(data.meshEdits)||nonEmptyObject(data.matProps)||!!(entry&&entry.embeddedLightsExtracted)||!!(entry&&entry.physicsBackend==='sketchbook-metadata');
    if(ref&&!edited){const transform=placementTransform(object);if(transform)add(ref,{id:data.editorId||'',name:data.editorName||object.name||ref.name,parentId:data.linkParentId||'',transform},object,true);return;}
    const graph=data.logicGraph,scene=graph&&graph.logicScene,elements=scene?[scene.root].concat(scene.elements||[]):[],pawn=graph&&(graph.playerPawnBlueprint||graph.vehiclePawn||graph.characterPawn||graph.animalPawn),logicEdited=!!(pawn&&(nonEmptyObject(pawn.meshEdits)||nonEmptyObject(pawn.materials)));
    if(logicEdited||!elements.length||!object.traverse)return;
    elements.filter(element=>element&&element.asset).forEach(element=>{let holder=null;object.traverse(node=>{if(!holder&&node&&node.userData&&node.userData.logicElementSceneId===element.id&&node.userData.logicElementAssetKey)holder=node;});const model=holder&&(holder.children||[]).find(child=>child&&child.userData&&child.userData.logicElementAssetVisual),assetRef=canonicalAssetRef(element.asset),transform=placementTransform(model);if(!model||!assetRef||!transform)return;add(assetRef,{id:(data.editorId||data.logicInstanceId||'logic')+':asset:'+element.id,name:element.name||assetRef.name,parentId:data.editorId||'',transform},model,false);});
  });
  return{groups:Array.from(groups.values()),directRoots,omitNodes};
}
async function canonicalGlbBlob(ref){
  let url=ref&&ref.src||'';if(ref&&ref.dbKey&&root.LK_ASSET_BLOBS&&root.LK_ASSET_BLOBS.getUrl)url=await root.LK_ASSET_BLOBS.getUrl(ref.dbKey);if(!url)throw new Error('Canonical asset source unavailable');const response=await fetch(url);if(!response.ok&&response.status)throw new Error('Canonical asset read failed ('+response.status+')');const blob=await response.blob(),magic=new Uint8Array(await blob.slice(0,4).arrayBuffer());if(blob.size<12||magic[0]!==0x67||magic[1]!==0x6c||magic[2]!==0x54||magic[3]!==0x46)throw new Error('Canonical source is not a self-contained binary GLB');return blob;
}
async function preparePassthrough(candidates){
  const ready=[],failedKeys=new Set();for(let index=0;index<candidates.groups.length;index++){const item=candidates.groups[index];notify(tr('Reading existing project asset','Lettura asset progetto esistente')+' '+(index+1)+'/'+candidates.groups.length+' · '+item.ref.name);await allowUiPaint();try{item.blob=await canonicalGlbBlob(item.ref);ready.push(item);}catch(error){failedKeys.add(item.key);}}
  if(!failedKeys.size)return{ready,directRoots:candidates.directRoots,omitNodes:candidates.omitNodes};const directRoots=new Set(),omitNodes=new Set();
  // Rebuild the omission sets only from canonical files that were actually read.
  const validInstances=new Set(ready.flatMap(item=>item.instances.map(instance=>instance.id)));candidates.omitNodes.forEach(node=>{const data=node&&node.userData||{},directId=data.editorId||'',logicId=data.logicElementOwnerId&&data.logicElementSceneId?data.logicElementOwnerId+':asset:'+data.logicElementSceneId:'';if(validInstances.has(directId)||validInstances.has(logicId))omitNodes.add(node);});candidates.directRoots.forEach(node=>{if(validInstances.has(node&&node.userData&&node.userData.editorId||''))directRoots.add(node);});return{ready,directRoots,omitNodes};
}
function notify(message){if(env&&env.status)env.status(message);const node=overlay&&overlay.querySelector('[data-blender-status]');if(node)node.textContent=message;}
function showProgress(value){const node=overlay&&overlay.querySelector('[data-blender-progress]');if(!node)return;node.hidden=false;node.value=Math.max(0,Math.min(100,Number(value)||0));}
function hideProgress(){const node=overlay&&overlay.querySelector('[data-blender-progress]');if(node)node.hidden=true;}
function updateUi(){
  if(!overlay)return;const state=client?client.state():{status:'idle',conflicts:[],receivedAssets:0,sentAssets:0};
  const badge=overlay.querySelector('[data-blender-state]');if(badge)badge.textContent=String(state.status||'idle').toUpperCase()+' · '+state.conflicts.length+' '+tr('conflicts','conflitti')+' · ↓'+state.receivedAssets+' ↑'+state.sentAssets;
  const connect=overlay.querySelector('[data-blender-connect]'),disconnect=overlay.querySelector('[data-blender-disconnect]');if(connect)connect.disabled=state.status==='connecting'||state.status==='reconnecting'||state.status==='connected';if(disconnect)disconnect.disabled=state.status==='idle'||state.status==='closed';
  const conflictBox=overlay.querySelector('[data-blender-conflicts]');
  if(conflictBox){conflictBox.innerHTML='';state.conflicts.forEach(item=>{const row=document.createElement('div');row.className='lk-blender-conflict';const label=document.createElement('span');label.textContent=(item.remote&&item.remote.name||item.id)+' · r'+item.localRevision+' / r'+item.remoteRevision;const remote=document.createElement('button');remote.textContent=tr('Use Blender','Usa Blender');remote.onclick=()=>{client.resolveConflict(item.id,'remote');updateUi();};const local=document.createElement('button');local.textContent=tr('Keep Editor','Tieni Editor');local.onclick=()=>{client.resolveConflict(item.id,'local');updateUi();};row.append(label,remote,local);conflictBox.appendChild(row);});}
}
function setTransform(object,transform){
  const t=CORE.normalizeTransform(transform);object.position.fromArray(t.position);object.quaternion.fromArray(t.quaternion);object.scale.fromArray(t.scale);object.visible=t.visible;
  if(env&&env.STORE&&env.STORE.syncCollider)env.STORE.syncCollider(object);if(env&&env.buildInspector&&env.ED&&env.ED.selected===object)env.buildInspector();
}
function findEntity(id){return registry().find(object=>object&&object.userData&&object.userData.editorId===id)||null;}
function createPlaceholder(entity){
  if(!env||!env.STORE||!env.STORE.createPrimitive||!env.STORE.registerAdded||!env.GAME)return null;
  const object=env.STORE.createPrimitive('box',{centered:true,color:0x8b5cf6,roughness:.72});
  env.STORE.registerAdded(env.GAME,object,{id:entity.id,kind:'primitive',prim:'box',name:entity.name||'Blender object',props:{centered:true,color:0x8b5cf6,roughness:.72},t:{p:[0,0,0],r:[0,0,0],s:[1,1,1],v:true}});
  object.userData.lkBlenderPlaceholder=true;object.userData.lkBridgeId=entity.id;return object;
}
function applyEntity(entity){
  if(!entity||!entity.id)return null;let object=findEntity(entity.id);if(!object)object=createPlaceholder(entity);if(!object)return null;
  object.userData.lkBridgeId=entity.id;if(entity.name){object.name=entity.name;object.userData.editorName=entity.name;}if(entity.parentId)object.userData.linkParentId=entity.parentId;setTransform(object,entity.transform);return object;
}
function importReceivedAsset(asset){
  const bytes=CORE.joinAssetChunks(asset.chunks);if(bytes.byteLength!==asset.totalBytes)throw new Error('GLB transfer size mismatch');const file=new File([bytes],asset.name||'Blender Asset.glb',{type:'model/gltf-binary',lastModified:Date.now()});
  const importer=env&&env.importAssetFiles;
  if(typeof importer!=='function'){
    root.LK_BLENDER_LIVE_LINK_PENDING_ASSETS=root.LK_BLENDER_LIVE_LINK_PENDING_ASSETS||[];root.LK_BLENDER_LIVE_LINK_PENDING_ASSETS.push(file);
    throw new Error(tr('Asset import service is not connected to the plugin host.','Il servizio import asset non è collegato all’host plugin.'));
  }
  const settings=loadSettings(),options=settings.placeAssets?{placePoint:env.spawnPointAhead&&env.spawnPointAhead()}:{};
  return Promise.resolve(importer([file],options));
}
function serializableUserData(value){const seen=new WeakSet();try{return JSON.parse(JSON.stringify(value||{},(_key,item)=>{if(typeof item==='function')return undefined;if(item&&typeof item==='object'){if(item.isObject3D||item.isMaterial||item.isBufferGeometry||item.isTexture||seen.has(item))return undefined;seen.add(item);}return item;}));}catch(error){return{};}}
function exportObjectGlb(object,exportOptions){
  const roots=(Array.isArray(object)?object:[object]).filter(Boolean);if(!roots.length)throw new Error(tr('Select one scene object first.','Seleziona prima un oggetto della scena.'));
  if(!env||!env.THREE||!env.THREE.GLTFExporter)throw new Error('THREE.GLTFExporter unavailable');
  const opts=exportOptions||{},omitNodes=opts.omitNodes instanceof Set?opts.omitNodes:new Set(),swapped=[],hidden=[],prepared=new Set(),animationSets=[],omitted=node=>{for(let current=node;current;current=current.parent){if(omitNodes.has(current))return true;}return false;};const prepare=owner=>{if(!owner||prepared.has(owner)||!owner.userData)return;prepared.add(owner);swapped.push([owner,owner.userData]);owner.userData=serializableUserData(owner.userData);};
  roots.forEach(rootObject=>{const animations=[];rootObject.traverse&&rootObject.traverse(node=>{if(omitted(node)){if(omitNodes.has(node)&&node.visible!==false){hidden.push([node,node.visible]);node.visible=false;}return;}if(excludedVisual(node)&&node.visible!==false){hidden.push([node,node.visible]);node.visible=false;}prepare(node);prepare(node.geometry);(Array.isArray(node.material)?node.material:[node.material]).forEach(prepare);(node.animations||[]).forEach(clip=>{if(clip&&!animations.includes(clip))animations.push(clip);});});(rootObject.animations||[]).forEach(clip=>{if(clip&&!animations.includes(clip))animations.push(clip);});animationSets.push(animations);});
  const restore=()=>{swapped.forEach(entry=>{entry[0].userData=entry[1];});hidden.forEach(entry=>{entry[0].visible=entry[1];});},exporter=new env.THREE.GLTFExporter(),input=roots.length===1?roots[0]:roots,animations=roots.length===1?animationSets[0]:animationSets;return new Promise((resolve,reject)=>{try{exporter.parse(input,result=>{restore();resolve(result instanceof ArrayBuffer?new Uint8Array(result):new TextEncoder().encode(JSON.stringify(result)));},error=>{restore();reject(error);},{binary:true,onlyVisible:true,trs:false,animations});}catch(error){restore();reject(error);}});
}
function binaryAssetFrame(transferId,index,chunk){const id=new TextEncoder().encode(String(transferId)),data=chunk instanceof Uint8Array?chunk:new Uint8Array(chunk),frame=new Uint8Array(12+id.length+data.length),view=new DataView(frame.buffer);frame.set(BINARY_MAGIC,0);view.setUint16(6,id.length);view.setUint32(8,index);frame.set(id,12);frame.set(data,12+id.length);return frame;}

function createClient(options){
  options=options||{};const senderId=options.senderId||randomId('editor-'),journal=CORE.createJournal(senderId),WebSocketCtor=options.WebSocket||root.WebSocket,retryDelays=options.retryDelays||Array.from({length:LOCAL_PORT_SCAN_COUNT*2},(_,index)=>index?80:0);let socket=null,pollTimer=null,retryTimer=null,handshakeTimer=null,status='idle',receivedAssets=0,sentAssets=0,manualClose=false,attempt=0,endpoint='',endpoints=[],authToken='',lastError='',remoteAddonVersion='';const baselines=new Map(),incomingAssets=new Map(),pendingLocal=new Map(),outgoingAssets=new Map();
  function emitState(){if(options.onState)options.onState(state());updateUi();}
  function send(type,payload){if(!socket||socket.readyState!==1)return false;socket.send(JSON.stringify(CORE.envelope(type,payload,{senderId})));return true;}
  function baselineAll(){bridgeObjects().forEach(object=>{const entity=CORE.entityOf(object);baselines.set(entity.id,CORE.signature(entity));journal.accept(entity.id,journal.revision(entity.id),entity);});}
  function poll(){
    if(status!=='connected'||!loadSettings().autoTransforms)return;
    bridgeObjects().forEach(object=>{const entity=CORE.entityOf(object),sig=CORE.signature(entity);if(!entity.id||baselines.get(entity.id)===sig)return;baselines.set(entity.id,sig);const change=journal.local(entity.id,entity);pendingLocal.set(entity.id,change);send('entity.upsert',change);});
  }
  function handle(message){
    let packet;try{packet=JSON.parse(message.data);}catch(error){return;}if(!CORE.validEnvelope(packet)||packet.senderId===senderId)return;const payload=packet.payload||{};
    if(packet.type==='hello.accepted'){if(handshakeTimer){clearTimeout(handshakeTimer);handshakeTimer=null;}status='connected';attempt=0;lastError='';remoteAddonVersion=String(payload.addonVersion||'');baselineAll();notify(tr('Blender discovered and connected. Scene link is live.','Blender rilevato e connesso. Collegamento scena attivo.')+' · '+endpoint+(remoteAddonVersion?' · add-on '+remoteAddonVersion:''));emitState();return;}
    if(packet.type==='error'){lastError=String(payload.message||'protocol error');notify('Blender Live Link: '+lastError);if(/token|protocol|version/i.test(lastError)){manualClose=true;if(socket)socket.close(4001,lastError.slice(0,100));}return;}
    if(packet.type==='entity.ack'){journal.markClean(payload.id);pendingLocal.delete(payload.id);return;}
    if(packet.type==='entity.upsert'){
      const entity=payload.entity||{},decision=journal.incoming(entity.id,entity,payload.revision,payload.baseRevision,packet.senderId);
      if(decision.status==='apply'){const object=applyEntity(entity);if(object)baselines.set(entity.id,CORE.signature(CORE.entityOf(object)));if(env&&env.markDirty)env.markDirty();}
      emitState();return;
    }
    if(packet.type==='scene.snapshot'){
      (payload.entities||[]).forEach(entity=>{const decision=journal.incoming(entity.id,entity,entity.revision||0,entity.baseRevision||0,packet.senderId);if(decision.status==='apply'){const object=applyEntity(entity);if(object)baselines.set(entity.id,CORE.signature(CORE.entityOf(object)));}});if(env&&env.markDirty)env.markDirty();notify(tr('Blender scene snapshot applied.','Snapshot scena Blender applicato.'));emitState();return;
    }
    if(packet.type==='asset.begin'){
      if(!loadSettings().acceptAssets)return;const total=Number(payload.totalBytes)||0;if(total<0||total>CORE.MAX_ASSET_BYTES){send('asset.reject',{transferId:payload.transferId,reason:'size'});return;}
      incomingAssets.set(payload.transferId,{name:CORE.cleanName(payload.name||'Blender Asset.glb'),totalBytes:total,totalChunks:Number(payload.totalChunks)||0,chunks:[]});return;
    }
    if(packet.type==='asset.chunk'){
      const item=incomingAssets.get(payload.transferId);if(!item||item.chunks.length!==Number(payload.index))return;item.chunks.push(String(payload.data||''));return;
    }
    if(packet.type==='asset.commit'){
      const item=incomingAssets.get(payload.transferId);if(!item)return;incomingAssets.delete(payload.transferId);if(item.chunks.length!==item.totalChunks){send('asset.reject',{transferId:payload.transferId,reason:'incomplete'});return;}
      importReceivedAsset(item).then(()=>{receivedAssets++;send('asset.accept',{transferId:payload.transferId});notify(tr('Blender GLB imported into project assets.','GLB Blender importato negli asset di progetto.'));emitState();}).catch(error=>{send('asset.reject',{transferId:payload.transferId,reason:String(error.message||error)});notify(String(error.message||error));});
    }
    if(packet.type==='asset.accept'||packet.type==='asset.reject'){
      const pending=outgoingAssets.get(payload.transferId);if(!pending)return;outgoingAssets.delete(payload.transferId);clearTimeout(pending.timer);if(packet.type==='asset.accept')pending.resolve(payload);else pending.reject(new Error(String(payload.reason||tr('Blender rejected the asset.','Blender ha rifiutato l’asset.'))));return;
    }
  }
  function clearConnectionTimers(){if(retryTimer){clearTimeout(retryTimer);retryTimer=null;}if(handshakeTimer){clearTimeout(handshakeTimer);handshakeTimer=null;}}
  function scheduleAttempt(){
    if(manualClose)return;
    if(attempt>=retryDelays.length){status='closed';lastError=lastError||'connection retries exhausted';const hosted=root.location&&root.location.protocol==='https:';notify(hosted
      ?tr('Blender Live Link could not complete local discovery. Install/start add-on 0.1.9 or newer, then copy its new token.','Blender Live Link non ha completato la ricerca locale. Installa/avvia l’add-on 0.1.9 o successivo, poi copia il nuovo token.')
      :tr('Blender Live Link was not found on ports 5200–5219. Start add-on 0.1.9 and paste its newly generated token.','Blender Live Link non è stato trovato sulle porte 5200–5219. Avvia l’add-on 0.1.9 e incolla il nuovo token.'));emitState();return;}
    endpoint=endpoints.length?endpoints[attempt%endpoints.length]:endpoint;
    const delay=Math.max(0,Number(retryDelays[attempt])||0);status=attempt===0?'connecting':'reconnecting';
    notify((status==='connecting'?tr('Connecting to Blender','Connessione a Blender'):tr('Blender not ready; automatic retry','Blender non pronto; nuovo tentativo automatico'))+' · '+endpoint+' · '+(attempt+1)+'/'+retryDelays.length);emitState();
    retryTimer=setTimeout(openAttempt,delay);
  }
  function openAttempt(){
    retryTimer=null;if(manualClose)return;if(typeof WebSocketCtor!=='function'){status='closed';lastError='WebSocket unavailable';emitState();return;}
    attempt++;const target=new WebSocketCtor(endpoint);socket=target;
    target.addEventListener('open',()=>{if(target!==socket||manualClose)return;send('hello',{token:authToken,role:'editor',projectId:projectId(),origin:root.location&&root.location.origin||'',capabilities:['scene-transforms','scene-snapshot','glb-assets','scene-batches-v1','canonical-assets-v1','linked-instances-v1','conflicts']});handshakeTimer=setTimeout(()=>{if(target===socket&&status!=='connected'){lastError='authentication timeout';try{target.close(4000,'authentication timeout');}catch(error){}}},3500);});
    target.addEventListener('message',handle);
    target.addEventListener('error',()=>{lastError='WebSocket connection or handshake failed';});
    target.addEventListener('close',event=>{if(target!==socket)return;socket=null;if(handshakeTimer){clearTimeout(handshakeTimer);handshakeTimer=null;}if(manualClose){status='idle';emitState();return;}lastError=event&&event.reason||lastError||('WebSocket closed ('+(event&&event.code||1006)+')');scheduleAttempt();});
  }
  function connect(url,token){
    const safeEndpoint=CORE.localEndpoint(url);if(!safeEndpoint)throw new Error(tr('Only localhost WebSocket endpoints are allowed.','Sono consentiti solo endpoint WebSocket localhost.'));if(!String(token||'').trim())throw new Error(tr('Enter the token shown in Blender.','Inserisci il token mostrato in Blender.'));
    disconnect();endpoints=localEndpointCandidates(safeEndpoint,options.portScanCount||LOCAL_PORT_SCAN_COUNT);endpoint=endpoints[0]||safeEndpoint;authToken=String(token).trim();manualClose=false;attempt=0;lastError='';if(!pollTimer)pollTimer=setInterval(poll,160);scheduleAttempt();
  }
  function disconnect(){manualClose=true;clearConnectionTimers();if(pollTimer){clearInterval(pollTimer);pollTimer=null;}outgoingAssets.forEach(pending=>{clearTimeout(pending.timer);pending.reject(new Error(tr('Blender disconnected during asset transfer.','Blender si è disconnesso durante il trasferimento asset.')));});outgoingAssets.clear();const current=socket;socket=null;if(current){try{current.close(1000,'user disconnect');}catch(error){}}status='idle';emitState();}
  function pushSnapshot(){const entities=bridgeObjects().map(object=>{const entity=CORE.entityOf(object);entity.revision=journal.revision(entity.id);entity.baseRevision=entity.revision;return entity;});send('scene.snapshot',{projectId:projectId(),entities});return entities.length;}
  function pullScene(){return send('scene.request',{projectId:projectId()});}
  function waitForDrain(){return new Promise((resolve,reject)=>{const check=()=>{if(!socket||socket.readyState!==1){reject(new Error(tr('Blender disconnected during asset transfer.','Blender si è disconnesso durante il trasferimento asset.')));return;}if((Number(socket.bufferedAmount)||0)>4*1024*1024){setTimeout(check,20);return;}resolve();};check();});}
  async function pushAsset(object,transferOptions){
    const options=transferOptions||{},roots=(Array.isArray(object)?object:[object]).filter(Boolean);await allowUiPaint();
    const blob=typeof Blob!=='undefined'&&options.blob instanceof Blob?options.blob:null,bytes=blob?null:(options.bytes instanceof Uint8Array?options.bytes:(options.bytes?new Uint8Array(options.bytes):await exportObjectGlb(roots,options))),totalBytes=blob?blob.size:bytes.byteLength,transferId=randomId('asset-'),first=roots[0],name=CORE.cleanName(options.name||first&&first.userData&&first.userData.editorName||first&&first.name||'Lot King Asset')+'.glb',entityIds=(Array.isArray(options.entityIds)?options.entityIds:roots.map(rootObject=>rootObject.userData&&rootObject.userData.editorId||'')).filter(Boolean),totalChunks=Math.ceil(totalBytes/BINARY_CHUNK_BYTES);
    if(totalBytes>CORE.MAX_ASSET_BYTES)throw new Error('Asset exceeds 1 GiB live-link limit');
    const accepted=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{outgoingAssets.delete(transferId);reject(new Error(tr('Blender import acknowledgement timed out.','Conferma import Blender scaduta.')));},10*60*1000);outgoingAssets.set(transferId,{resolve,reject,timer});});
    const failPending=error=>{const pending=outgoingAssets.get(transferId);if(pending){clearTimeout(pending.timer);outgoingAssets.delete(transferId);pending.reject(error);}return accepted.catch(()=>{});};
    if(!send('asset.begin',{transferId,name,totalBytes,totalChunks,entityId:options.fullScene?'':entityIds[0]||'',entityIds,fullScene:!!options.fullScene,sceneBatchId:options.sceneBatchId||'',batchIndex:Number(options.batchIndex)||0,batchCount:Math.max(1,Number(options.batchCount)||1),passthrough:!!options.passthrough,instances:Array.isArray(options.instances)?options.instances:[],binary:true})){
      const error=new Error(tr('Connect Blender before sending assets.','Connetti Blender prima di inviare gli asset.'));await failPending(error);throw error;
    }
    try{
      for(let index=0;index<totalChunks;index++){await waitForDrain();const start=index*BINARY_CHUNK_BYTES,end=Math.min(totalBytes,(index+1)*BINARY_CHUNK_BYTES),chunk=blob?new Uint8Array(await blob.slice(start,end).arrayBuffer()):bytes.subarray(start,end);socket.send(binaryAssetFrame(transferId,index,chunk));}
      await waitForDrain();send('asset.commit',{transferId});await accepted;
    }catch(error){await failPending(error);throw error;}
    sentAssets++;emitState();return transferId;
  }
  async function pushScene(){
    if(status!=='connected')throw new Error(tr('Connect Blender before pushing the scene.','Connetti Blender prima di inviare la scena.'));
    if(!versionAtLeast(remoteAddonVersion,'0.1.9'))throw new Error(tr('Fast referenced Full Scene requires Blender add-on 0.1.9. Install the new ZIP and restart its server.','La Scena completa rapida per riferimenti richiede l’add-on Blender 0.1.9. Installa il nuovo ZIP e riavvia il server.'));
    const linked=bridgeObjects(),objects=pushSnapshot();showProgress(1);notify(tr('Collecting references and existing project assets','Raccolta riferimenti e asset progetto esistenti'));await allowUiPaint();
    const selection=renderAssetSelection(),assets=selection.roots,stats=selection.stats,failed=[],passthrough=await preparePassthrough(collectPassthroughCandidates(assets)),generatedRoots=assets.filter(object=>!passthrough.directRoots.has(object)),generated=exportBatches(generatedRoots,passthrough.omitNodes),tasks=passthrough.ready.map(item=>({kind:'canonical',item})).concat(generated.map(roots=>({kind:'generated',roots}))),sceneBatchId=randomId('scene-'),entityIds=linked.map(object=>object.userData.editorId);let completed=0;
    if(!tasks.length)return{objects,assets:0,batches:0,stats,failed};
    for(let index=0;index<tasks.length;index++){
      const task=tasks[index],label=(index+1)+'/'+tasks.length;showProgress(index/tasks.length*100);notify((task.kind==='canonical'?tr('Sending existing asset','Invio asset esistente'):tr('Building lightweight scene geometry','Creazione geometria leggera della scena'))+' '+label+(task.item?' · '+task.item.ref.name:''));await allowUiPaint();
      try{
        await pushAsset(task.roots||[],{name:task.item&&task.item.ref.name||'Lot King Lightweight Scene '+label,blob:task.item&&task.item.blob,passthrough:task.kind==='canonical',instances:task.item&&task.item.instances||[],omitNodes:passthrough.omitNodes,fullScene:true,sceneBatchId,batchIndex:index,batchCount:tasks.length,entityIds});
        completed++;showProgress(completed/tasks.length*100);notify(tr('Blender imported scene part','Blender ha importato la parte scena')+' '+label);
      }catch(error){failed.push({name:task.item&&task.item.ref.name||'Lot King Scene '+label,error:String(error&&error.message||error)});break;}
    }
    return{objects,assets:failed.length?0:assets.length,batches:completed,stats,failed,canonical:passthrough.ready.length,generated:generated.length};
  }
  function resolveConflict(id,choice){const remote=journal.resolve(id,choice);if(remote){const object=applyEntity(remote);if(object)baselines.set(id,CORE.signature(CORE.entityOf(object)));}else if(choice==='local'){const object=findEntity(id);if(object){const entity=CORE.entityOf(object),change=journal.local(id,entity);send('entity.upsert',change);}}emitState();}
  function state(){return{status,connected:status==='connected',senderId,conflicts:journal.conflicts(),receivedAssets,sentAssets,attempt,endpoint,lastError,remoteAddonVersion};}
  return Object.freeze({connect,disconnect,pushScene,pushSnapshot,pullScene,pushAsset,resolveConflict,state,_handle:handle,_poll:poll});
}

function readForm(){return{url:overlay.querySelector('[data-blender-url]').value.trim(),token:overlay.querySelector('[data-blender-token]').value.trim(),autoTransforms:overlay.querySelector('[data-blender-auto]').checked,acceptAssets:overlay.querySelector('[data-blender-assets]').checked,placeAssets:overlay.querySelector('[data-blender-place]').checked};}
function openOverlay(){
  if(overlay){overlay.style.display='flex';updateUi();return;}const settings=loadSettings();
  if(!document.getElementById('lkBlenderLinkStyle'))document.head.appendChild(Object.assign(document.createElement('style'),{id:'lkBlenderLinkStyle',textContent:'.lk-blender-bg{position:fixed;inset:0;z-index:10060;background:#050811dc;display:flex;align-items:center;justify-content:center;padding:24px}.lk-blender{width:min(780px,96vw);max-height:92vh;overflow:auto;background:#111827;border:1px solid #334155;border-radius:14px;padding:20px;color:#e5edf8;box-shadow:0 24px 80px #000}.lk-blender input[type=text],.lk-blender input[type=password]{width:100%;box-sizing:border-box;background:#070b12;color:#dbeafe;border:1px solid #334155;border-radius:6px;padding:8px}.lk-blender-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.lk-blender section{background:#0b1220;border:1px solid #263449;border-radius:10px;padding:12px}.lk-blender button{margin:6px 6px 0 0;padding:8px 11px}.lk-blender small{display:block;color:#93a4bc;line-height:1.45}.lk-blender-state{color:#7dd3fc;margin:8px 0}.lk-blender-experimental{display:inline-block;margin-left:8px;padding:3px 7px;border:1px solid #f59e0b;border-radius:999px;color:#fbbf24;font-size:11px;letter-spacing:.08em;text-transform:uppercase;vertical-align:middle}.lk-blender-warning{margin:8px 0;color:#fcd34d}.lk-blender progress{width:100%;height:10px;accent-color:#38bdf8}.lk-blender-conflict{display:flex;gap:6px;align-items:center}.lk-blender-conflict span{flex:1}@media(max-width:650px){.lk-blender-grid{grid-template-columns:1fr}}'}));
  overlay=document.createElement('div');overlay.className='lk-blender-bg';overlay.innerHTML='<div class="lk-blender" role="dialog" aria-modal="true"><button data-blender-close style="float:right">×</button><h2>Blender Live Link <span class="lk-blender-experimental">Experimental</span></h2><small class="lk-blender-warning">'+tr('Preview workflow: scene coverage, import time and round-trip fidelity are not yet production-ready. Save the Lot King project before use.','Flusso in anteprima: copertura scena, tempi di import e fedeltà round-trip non sono ancora pronti per la produzione. Salva il progetto Lot King prima dell’uso.')+'</small><small>'+tr('Local authenticated bridge. Recommended automatic port range: 5200–5219.','Ponte locale autenticato. Intervallo automatico consigliato: 5200–5219.')+'</small><div class="lk-blender-state" data-blender-state>IDLE</div><div class="lk-blender-grid"><section><label>WebSocket URL<input type="text" data-blender-url></label><label>'+tr('Session token','Token sessione')+'<input type="password" data-blender-token autocomplete="off"></label><label><input type="checkbox" data-blender-auto> '+tr('Live transform sync','Sincronizza trasformazioni live')+'</label><label><input type="checkbox" data-blender-assets> '+tr('Accept scene assets from Blender','Accetta asset scena da Blender')+'</label><label><input type="checkbox" data-blender-place> '+tr('Place received assets in viewport','Posiziona gli asset ricevuti nel viewport')+'</label><button data-blender-connect>'+tr('Connect','Connetti')+'</button><button data-blender-disconnect>'+tr('Disconnect','Disconnetti')+'</button></section><section><b>'+tr('Scene and assets','Scena e asset')+'</b><small>'+tr('Full Scene includes FBX, GLTF/GLB and procedural content already loaded by the Editor, with hierarchy, meshes, materials, textures, skeletons and animations. Binary GLB is only the interoperability transport format.','Scena completa include contenuti FBX, GLTF/GLB e procedurali già caricati dall’Editor, con gerarchia, mesh, materiali, texture, skeleton e animazioni. Il GLB binario è soltanto il formato di trasporto interoperabile.')+'</small><button data-blender-push>'+tr('Push full scene to Blender','Invia scena completa a Blender')+'</button><button data-blender-pull>'+tr('Pull scene from Blender','Ricevi scena da Blender')+'</button><button data-blender-asset>'+tr('Send selected asset','Invia asset selezionato')+'</button></section></div><progress data-blender-progress max="100" value="0" hidden></progress><h3>'+tr('Conflicts','Conflitti')+'</h3><div data-blender-conflicts></div><div class="lk-blender-state" data-blender-status>'+tr('Start the Live Link server from Blender, then copy its token here.','Avvia il server Live Link da Blender, poi copia qui il token.')+'</div></div>';
  document.body.appendChild(overlay);overlay.querySelector('[data-blender-url]').value=settings.url;overlay.querySelector('[data-blender-token]').value=settings.token;overlay.querySelector('[data-blender-auto]').checked=settings.autoTransforms;overlay.querySelector('[data-blender-assets]').checked=settings.acceptAssets;overlay.querySelector('[data-blender-place]').checked=settings.placeAssets;
  overlay.querySelector('[data-blender-close]').onclick=()=>overlay.style.display='none';overlay.querySelector('[data-blender-connect]').onclick=()=>{try{const values=readForm();saveSettings(values);if(!client)client=createClient();client.connect(values.url,values.token);}catch(error){notify(String(error.message||error));}};overlay.querySelector('[data-blender-disconnect]').onclick=()=>client&&client.disconnect();overlay.querySelector('[data-blender-push]').onclick=async event=>{if(!client)return;const button=event.currentTarget;button.disabled=true;try{const report=await client.pushScene(),failures=report.failed.length?' · '+report.failed.length+' '+tr('failed','falliti'):'',stats=report.stats||{};notify(report.objects+' '+tr('references','riferimenti')+' · '+(report.canonical||0)+' '+tr('existing assets passed through','asset esistenti trasferiti direttamente')+' · '+(report.generated||0)+' '+tr('lightweight generated batches','blocchi generati leggeri')+' · '+(stats.meshes||0)+' mesh · '+(stats.materials||0)+' '+tr('materials','materiali')+' · '+(stats.textures||0)+' texture'+failures);}catch(error){notify(String(error.message||error));}finally{button.disabled=false;setTimeout(hideProgress,700);}};overlay.querySelector('[data-blender-pull]').onclick=()=>client&&client.pullScene();overlay.querySelector('[data-blender-asset]').onclick=()=>{if(!client)return;client.pushAsset(env&&env.ED&&env.ED.selected).then(()=>notify(tr('Selected asset imported by Blender.','Asset selezionato importato da Blender.'))).catch(error=>notify(String(error.message||error)));};updateUi();
}

const plugin={id:'blender-live-link',name:'Blender Live Link — Experimental',version:'0.1.9',category:'Experimental',builtIn:false,enabledByDefault:true,experimental:true,description:'Experimental local scene/asset bridge between Lot King Editor and Blender. Coverage, performance and round-trip fidelity remain under development.',capabilities:['Dynamic localhost discovery','Canonical asset passthrough','Linked asset instances','Lightweight generated geometry','FBX/GLTF/GLB scene content','Bidirectional transforms','Explicit revision conflicts','Automatic reconnect'],register(api,pluginEnv){env=pluginEnv||api&&api.env||{};if(!api)return;api.capability('blender-live-link','Experimental token-authenticated localhost scene and asset synchronization');api.command('blender-live-link.open',{label:'Blender Live Link — Experimental',menu:'Plugins',run:openOverlay});api.menu('plugins',{label:'Blender Live Link — Experimental',icon:'◈',sub:[{label:'Open Blender Live Link — Experimental',icon:'◈',action:()=>api.runCommand('blender-live-link.open')}]});}};

root.LK_BLENDER_LIVE_LINK_PLUGIN=Object.freeze(plugin);
root.LK_BLENDER_LIVE_LINK=Object.freeze({open:openOverlay,createClient,state:()=>client&&client.state()||{status:'idle'}});
})(typeof window!=='undefined'?window:globalThis);
