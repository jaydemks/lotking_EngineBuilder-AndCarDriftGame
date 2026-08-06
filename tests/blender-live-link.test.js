'use strict';

const assert=require('assert');
const fs=require('fs');
if(typeof global.btoa!=='function')global.btoa=value=>Buffer.from(value,'binary').toString('base64');
if(typeof global.atob!=='function')global.atob=value=>Buffer.from(value,'base64').toString('binary');

const core=require('../js/plugins/blender-live-link-core.js');

assert.strictEqual(core.PROTOCOL,'lotking.blender-live-link');
assert.strictEqual(core.VERSION,1);
assert.ok(core.localEndpoint('ws://127.0.0.1:8765'));
assert.ok(core.localEndpoint('ws://localhost:8765'));
assert.strictEqual(core.localEndpoint('ws://192.168.1.5:8765'),null);
assert.strictEqual(core.localEndpoint('https://localhost:8765'),null);

const object={name:'Cube',visible:true,position:{x:1,y:2,z:3},quaternion:{x:0,y:0,z:0,w:1},scale:{x:2,y:3,z:4},userData:{editorId:'scene:cube',editorName:'Cube A',editorType:'mesh'}};
const entity=core.entityOf(object);
assert.deepStrictEqual(entity.transform.position,[1,2,3]);
assert.deepStrictEqual(entity.transform.quaternion,[0,0,0,1]);
assert.deepStrictEqual(entity.transform.scale,[2,3,4]);

const journal=core.createJournal('editor-one');
journal.accept(entity.id,2,entity);
const localEntity=JSON.parse(JSON.stringify(entity));localEntity.transform.position[0]=5;
const local=journal.local(entity.id,localEntity);
assert.strictEqual(local.revision,3);
const remoteEntity=JSON.parse(JSON.stringify(entity));remoteEntity.transform.position[0]=9;
const conflict=journal.incoming(entity.id,remoteEntity,3,2,'blender');
assert.strictEqual(conflict.status,'conflict');
assert.strictEqual(journal.conflicts().length,1);
assert.deepStrictEqual(journal.resolve(entity.id,'remote'),remoteEntity);
assert.strictEqual(journal.revision(entity.id),3);

const bytes=Uint8Array.from({length:700000},(_,index)=>index%251);
const chunks=core.assetChunks(bytes,128*1024);
assert.ok(chunks.length>4);
const rebuilt=core.joinAssetChunks(chunks);
assert.deepStrictEqual(Buffer.from(rebuilt),Buffer.from(bytes));
assert.strictEqual(core.MAX_ASSET_BYTES,1024*1024*1024);

require('../js/plugins/blender-live-link-plugin.js');
assert.ok(global.LK_BLENDER_LIVE_LINK_PLUGIN);
const registrations=[];
global.LK_BLENDER_LIVE_LINK_PLUGIN.register({capability:(...args)=>registrations.push(['capability',...args]),command:(...args)=>registrations.push(['command',...args]),menu:(...args)=>registrations.push(['menu',...args])},{GAME:{world:{registry:[]}}});
assert.ok(registrations.some(item=>item[0]==='command'&&item[1]==='blender-live-link.open'));
const client=global.LK_BLENDER_LIVE_LINK.createClient({senderId:'test-editor'});
assert.strictEqual(client.state().status,'idle');
assert.throws(()=>client.connect('ws://example.com:8765','token'),/localhost/);

const python=fs.readFileSync('tools/blender 5.0+/lotking_live_link-0.1.0/__init__.py','utf8');
const manifest=fs.readFileSync('tools/blender 5.0+/lotking_live_link-0.1.0/blender_manifest.toml','utf8');
const editorPlugin=fs.readFileSync('js/plugins/blender-live-link-plugin.js','utf8');
const liveLinkCacheTag='blender-live-link-plugin.js?v=0.7.8-live-link-experimental-1';
const liveLinkCoreCacheTag='blender-live-link-core.js?v=0.7.8-blender-binary-scene-1';
assert.ok(!editorPlugin.includes('!object.userData.builtin'),'full-scene collection must not exclude builtin level geometry');
assert.ok(editorPlugin.includes('data.logicElementInternal&&data.logicElementRuntimeVisual!==false'),'authored Logic Element visuals must survive the export filter');
assert.ok(editorPlugin.includes('userData.lkProceduralOwned'),'procedural worldscape must be included in the full-scene GLB');
assert.ok(editorPlugin.includes('entityIds:linked.map(object=>object.userData.editorId)'),'nested scene identities must replace their Blender reference empties');
['engine_editor.html','gameplay.html','test-editor.html','scripts.list','js/editor/loader.js'].forEach(file=>{
  const source=fs.readFileSync(file,'utf8');
  assert.ok(source.includes(liveLinkCacheTag),file+' must load the current Live Link client');
  assert.ok(source.includes(liveLinkCoreCacheTag),file+' must load the current Live Link protocol limits');
  assert.ok(!source.includes('blender-live-link-plugin.js?v=0.7.8-live-link-reconnect-1'),file+' still loads the stale Live Link client');
});
assert.match(editorPlugin,/DEFAULT_URL='ws:\/\/127\.0\.0\.1:5200'/);
assert.match(editorPlugin,/Push full scene to Blender/);
assert.match(editorPlugin,/serializableUserData/);
assert.match(editorPlugin,/waitForDrain/);
assert.match(editorPlugin,/BINARY_CHUNK_BYTES=2\*1024\*1024/);
assert.match(editorPlugin,/binaryAssetFrame/);
assert.match(editorPlugin,/sceneBatchId:options\.sceneBatchId/);
assert.match(editorPlugin,/batchCount:Math\.max\(1,Number\(options\.batchCount\)/);
assert.match(editorPlugin,/await accepted/);
assert.match(editorPlugin,/data-blender-progress/);
assert.match(editorPlugin,/versionAtLeast\(remoteAddonVersion,'0\.1\.9'\)/);
assert.match(editorPlugin,/canonicalGlbBlob/);
assert.match(editorPlugin,/collectPassthroughCandidates/);
assert.match(editorPlugin,/passthrough:!!options\.passthrough/);
assert.match(editorPlugin,/blob\.slice\(start,end\)\.arrayBuffer/);
assert.match(editorPlugin,/assets\.filter\(object=>!passthrough\.directRoots\.has\(object\)\)/);
assert.match(python,/default=5200/);
assert.match(python,/lk_bridge_asset_owner/);
assert.match(python,/__lotking_full_scene_batch__/);
assert.match(python,/batch_index == batch_count - 1/);
assert.match(python,/"addonVersion": ADDON_VERSION/);
assert.match(python,/Blender asset import is disabled/);
assert.match(python,/def _place_imported_instances/);
assert.match(python,/def _duplicate_imported_objects/);
assert.match(python,/def _binary_asset_chunk/);
assert.match(python,/bind\(\(LOCAL_HOST, self\.port\)\)/);
assert.match(python,/secrets\.compare_digest/);
assert.match(python,/MAX_ASSET_BYTES = 1024 \* 1024 \* 1024/);
assert.match(python,/Matrix\.LocRotScale/);
assert.match(python,/depsgraph_update_post/);
assert.match(python,/lk_bridge_id/);
assert.match(python,/lk_link_conflict_remote/);
assert.match(python,/http:\/\/localhost:\*/);
assert.match(python,/https:\/\/jaydemks\.github\.io/);
assert.match(python,/def _origin_allowed/);
assert.match(manifest,/version = "0\.1\.9"/);

async function testAutomaticReconnect(){
  const sockets=[];
  class FakeWebSocket{
    constructor(url){this.url=url;this.readyState=0;this.listeners={};sockets.push(this);setTimeout(()=>{
      if(sockets.length===1){this.readyState=3;this.emit('close',{code:1006,reason:''});}
      else{this.readyState=1;this.emit('open',{});}
    },0);}
    addEventListener(type,listener){(this.listeners[type]||(this.listeners[type]=[])).push(listener);}
    emit(type,event){(this.listeners[type]||[]).forEach(listener=>listener(event));}
    send(raw){const packet=JSON.parse(raw);assert.equal(packet.type,'hello');assert.equal(packet.payload.token,'retry-token');setTimeout(()=>this.emit('message',{data:JSON.stringify(core.envelope('hello.accepted',{role:'blender'},{senderId:'blender-test'}))}),0);}
    close(code,reason){this.readyState=3;this.emit('close',{code,reason});}
  }
  const reconnecting=global.LK_BLENDER_LIVE_LINK.createClient({senderId:'retry-editor',WebSocket:FakeWebSocket,retryDelays:[0,0,0]});
  reconnecting.connect('ws://127.0.0.1:5200','retry-token');
  await new Promise(resolve=>setTimeout(resolve,40));
  assert.equal(sockets.length,2,'the editor retries after Blender was not ready on the first attempt');
  assert.equal(new URL(sockets[0].url).port,'5200');
  assert.equal(new URL(sockets[1].url).port,'5201','local discovery advances to the next candidate port');
  assert.equal(reconnecting.state().status,'connected','the retry completes token authentication');
  reconnecting.disconnect();
}

testAutomaticReconnect().then(()=>console.log('blender-live-link tests passed')).catch(error=>{console.error(error);process.exitCode=1;});
