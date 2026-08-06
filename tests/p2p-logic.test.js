'use strict';

/* =========================================================
   LOT KING - P2P protocol, replication and multiplayer mode

   Headless. No browser, no WebRTC: the transport is replaced by a pair of fake
   sessions that hand messages to each other exactly the way js/runtime/p2p-session.js
   does, including the protocol validation step. What is proven here:

     1. Wiring       - the Logic surface and the plugin are still registered
     2. Protocol     - one numbered table, authority rules, clamped payloads,
                       and an UNKNOWN TYPE THAT THROWS instead of defaulting
     3. Quantization - encode/decode round trip inside the declared precision
     4. Replication  - handshake, player id assignment, host authority,
                       snapshot application and interpolation playback
     5. Multiplayer  - the editor-authored descriptor and its scene asset roles
   ========================================================= */

const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

/* ---------------------------------------------------------------------------
   1. WIRING
--------------------------------------------------------------------------- */
const nodes = fs.readFileSync('js/logic/logic-nodes-network.js', 'utf8');
const services = fs.readFileSync('js/logic/logic-services.js', 'utf8');
const runtime = fs.readFileSync('js/logic/logic-runtime.js', 'utf8');
const runner = fs.readFileSync('js/runtime/logic-elements-runner.js', 'utf8');
const plugin = fs.readFileSync('js/plugins/p2p-collaboration-plugin.js', 'utf8');
const session = fs.readFileSync('js/runtime/p2p-session.js', 'utf8');
const locksSource = fs.readFileSync('js/plugins/p2p-cowork-locks.js', 'utf8');

assert(nodes.includes("type:'event.onNetworkMessage'"), 'network receive event is registered');
assert(nodes.includes("type:'network.send'"), 'network send node is registered');
assert(nodes.includes("type:'network.openSessionStudio'"), 'playables can open the P2P session UI');
assert(nodes.includes("type:'multiplayer.start'"), 'the multiplayer mode can be started from a graph');
assert(nodes.includes("type:'event.onNetworkPlayerJoined'"), 'graphs can react to a player joining');
assert(services.includes('network: createNetworkService()'), 'Logic contexts expose the network service');
assert(runtime.includes("eventType === 'OnNetworkMessage'"), 'network channels are filtered by the event node');
assert(runner.includes("detail.type!=='logic.event'"), 'P2P application messages are bridged into Logic runtimes');
assert(plugin.includes("enabledByDefault:true"), 'P2P collaboration plugin is enabled by default');
assert(plugin.includes("id:'p2p-sessions'"), 'P2P plugin has a stable ID');
assert(session.includes("maxRetransmits:0"), 'the state channel is unreliable by design');
assert(session.includes("lotking-reliable"), 'the reliable channel exists alongside it');
assert(session.includes('disconnectPeer'), 'the host transport exposes targeted peer removal');

// Static shells must agree with the dependency order documented by the
// transport. Loading session first activates its compatibility bootstrap while
// the parser is still discovering the later tags, which can duplicate modules
// and install the director before its protocol/replication dependencies.
function assertP2pScriptOrder(file){
  const source = fs.readFileSync(file, 'utf8');
  const ordered = [
    'js/runtime/p2p-protocol.js',
    'js/runtime/p2p-session.js',
    'js/runtime/p2p-replication.js',
    'js/runtime/p2p-multiplayer-director.js',
    'js/runtime/p2p-multiplayer-level-template.js',
  ];
  let previous = -1;
  ordered.forEach(modulePath => {
    const at = source.indexOf(modulePath);
    assert(at > previous, file + ' loads ' + modulePath + ' in canonical dependency order');
    previous = at;
  });
}
['engine_editor.html', 'gameplay.html', 'scripts.list', 'js/editor/loader.js'].forEach(assertP2pScriptOrder);

// Execute the compatibility bootstrap against a parser-time document. It must
// wait until DOMContentLoaded and then recognise the static modules, not inject
// a second copy while later parser-blocking tags are still undiscovered.
{
  let onReady = null;
  const appended = [];
  const moduleFiles = [
    'p2p-protocol.js', 'p2p-session.js', 'p2p-replication.js',
    'p2p-multiplayer-director.js', 'logic-templates-network.js',
    'p2p-multiplayer-level-template.js',
  ];
  const document = {
    readyState:'loading',
    currentScript:{src:'http://lotking/js/runtime/p2p-session.js?v=test'},
    scripts:moduleFiles.map(file => ({src:'http://lotking/js/runtime/' + file})),
    head:{appendChild(script){ appended.push(script.src); if(script.onload) script.onload(); }},
    addEventListener(type, listener){ if(type === 'DOMContentLoaded') onReady = listener; },
    querySelector(){ return null; },
    createElement(){ return {dataset:{}, async:true, src:'', onload:null, onerror:null}; },
  };
  const window = {document, dispatchEvent(){}};
  vm.runInNewContext(session, {window, document, globalThis:window, console, Promise, Map, Set, Date, Math, Object, Array, String, Number, RegExp, TextEncoder, TextDecoder});
  assert.equal(appended.length, 0, 'the transport does not inject siblings during parser execution');
  assert.equal(typeof onReady, 'function', 'the compatibility fallback waits for the full static script list');
  document.readyState = 'interactive';
  onReady();
  assert.equal(appended.length, 0, 'a complete static bundle is never evaluated twice');
}

/* ---------------------------------------------------------------------------
   MODULE LOADING
--------------------------------------------------------------------------- */
global.window = global;
const SESSION = require('../js/runtime/p2p-session.js');
const COWORK_LOCKS = require('../js/plugins/p2p-cowork-locks.js');
require('../js/plugins/p2p-collaboration-plugin.js');
require('../js/runtime/p2p-protocol.js');
require('../js/runtime/p2p-replication.js');
require('../js/runtime/p2p-multiplayer-director.js');
const P = global.LK_P2P_PROTOCOL;
const REPLICATION = global.LK_P2P_REPLICATION;
const MULTIPLAYER = global.LK_P2P_MULTIPLAYER;
const COLLAB = global.LK_P2P_COLLABORATION;

function testCoworkTokenRouting(){
  const offer=SESSION.encode({protocol:SESSION.protocol,kind:'offer',createdAt:Date.now(),description:{type:'offer',sdp:'x'}});
  const answer=SESSION.encode({protocol:SESSION.protocol,kind:'answer',createdAt:Date.now(),description:{type:'answer',sdp:'y'}});
  assert.equal(COLLAB.signalKind(offer),'offer');assert.equal(COLLAB.signalKind(answer),'answer');
  assert.equal(COLLAB.pickSignalCode('offer',['',offer]),offer,'Guest Join reads its dedicated invitation field');
  assert.equal(COLLAB.pickSignalCode('offer',['','',offer]),offer,'Guest Join recognizes an invitation pasted in the legacy answer field');
  assert.equal(COLLAB.pickSignalCode('answer',['',answer]),answer,'Host Accept reads the guest answer field');
  assert.throws(()=>COLLAB.pickSignalCode('offer',[answer]),/Join needs the host invitation/,'an answer is diagnosed instead of reported as an empty token');
  console.log('  cowork invitation/answer token routing and legacy paste fallback: ok');
}

function testCoworkSnapshotStreaming(){
  assert(P.has('cowork.snapshot.begin')&&P.has('cowork.snapshot.chunk')&&P.has('cowork.snapshot.commit'),
    'the application-level snapshot transfer is declared in the canonical protocol');
  const project={meta:{projectName:'Realtime test'},scene:{note:'à🚗'.repeat(90000)},assets:[{id:'asset-one'}]};
  const transfer=COLLAB.createSnapshotTransfer(project,'Realtime test',{transferId:'cowork-test',chunkChars:32768});
  const transfers=new Map();
  let result=COLLAB.consumeSnapshotPacket('cowork.snapshot.begin',transfer.metadata,transfers);
  assert.equal(result.status,'started');
  for(let index=0;index<transfer.metadata.totalChunks;index++){
    const packet=P.validateOutbound('cowork.snapshot.chunk',transfer.chunk(index));
    result=COLLAB.consumeSnapshotPacket('cowork.snapshot.chunk',packet,transfers);
  }
  result=COLLAB.consumeSnapshotPacket('cowork.snapshot.commit',transfer.commit,transfers);
  assert.equal(result.status,'complete');
  assert.deepEqual(result.project,project,'a multi-packet Unicode project round-trips without truncation');

  const broken=COLLAB.createSnapshotTransfer({ok:true},'Broken',{transferId:'cowork-broken',chunkChars:1024});
  COLLAB.consumeSnapshotPacket('cowork.snapshot.begin',broken.metadata,transfers);
  const damaged=broken.chunk(0);damaged.data+='x';
  assert.throws(()=>COLLAB.consumeSnapshotPacket('cowork.snapshot.chunk',damaged,transfers),/more data than declared/,
    'declared size is enforced before parsing a peer project');
  const pluginSource=fs.readFileSync('js/plugins/p2p-collaboration-plugin.js','utf8');
  assert(!/session\.send\('collab\./.test(pluginSource),'new builds no longer transmit undeclared legacy cowork message names');
  assert(/session\.send\('cowork\.patch'/.test(pluginSource),'live editor changes use the canonical fine-grained patch protocol');
  console.log('  streamed cowork snapshot integrity and canonical realtime messages: ok');
}

function testCoworkEditLeases(){
  assert(locksSource.includes('DEFAULT_LEASE_MS=9000'), 'cowork locks are finite leases, never permanent ownership');
  let now=1000;
  const broadcasts=[],direct=[],requests=[];
  const host=COWORK_LOCKS.create({selfId:'host',selfName:'Host',isHost:true,leaseMs:3000,now:()=>now,
    send:(type,payload)=>{broadcasts.push({type,payload});return 2;},sendTo:(peerId,type,payload)=>{direct.push({peerId,type,payload});return true;}});
  const guest=COWORK_LOCKS.create({selfId:'guest-a',selfName:'Alice',isHost:false,leaseMs:3000,now:()=>now,
    send:(type,payload)=>{requests.push({type,payload});return 1;}});
  const rival=COWORK_LOCKS.create({selfId:'guest-b',selfName:'Bob',isHost:false,leaseMs:3000,now:()=>now,
    send:(type,payload)=>{requests.push({type,payload,peerId:'guest-b'});return 1;}});

  guest.request('crate-1','pawn-studio');
  const first=requests.shift();host.handleRequest({peerId:'guest-a',peerName:'Alice',payload:first.payload});
  guest.handleState(broadcasts.at(-1).payload);
  assert.equal(guest.owns('crate-1'),true,'the first editor receives the host-arbitrated object lease');
  assert.equal(host.lock('crate-1').surface,'pawn-studio','the lock identifies the editing surface');

  rival.request('crate-1','cinema-studio');
  const denied=requests.shift();host.handleRequest({peerId:'guest-b',peerName:'Bob',payload:denied.payload});
  rival.handleState(direct.at(-1).payload);
  assert.equal(rival.blocked('crate-1'),true,'a second editor is read-only on the same element');
  assert.equal(rival.lock('crate-1').ownerName,'Alice','the UI can name the peer holding the lock');

  guest.release('crate-1');
  const release=requests.shift();host.handleRequest({peerId:'guest-a',peerName:'Alice',payload:release.payload});
  guest.handleState(broadcasts.at(-1).payload);rival.handleState(broadcasts.at(-1).payload);
  assert.equal(host.lock('crate-1'),null,'deselect/release removes ownership for every peer');

  host.request('camera-1','viewport-gizmo');
  assert.equal(host.owns('camera-1'),true,'the host is also an ordinary coauthor');
  now+=4000;host.tick();
  assert.equal(host.lock('camera-1'),null,'abandoned locks expire automatically after their lease');

  host.handleRequest({peerId:'guest-a',peerName:'Alice',payload:{objectId:'actor-1',surface:'inspector'}});
  assert.equal(host.releasePeer('guest-a'),1,'disconnecting a peer releases all of its locks');
  assert.equal(host.lock('actor-1'),null);

  assert(P.has('net.kick')&&P.has('cowork.lock.request')&&P.has('cowork.lock.state')&&P.has('cowork.object')&&P.has('cowork.delete')&&P.has('cowork.save'),
    'locks, complete object edits, structural deletion and coordinated saves are canonical protocol messages');
  assert.equal(P.maySend('net.kick','guest'),false,'a guest cannot remove another peer');
  assert.equal(P.maySend('cowork.lock.request','guest'),true);
  assert.equal(P.maySend('cowork.lock.state','guest'),false,'only the host may arbitrate lock state');
  assert.throws(()=>P.validateInbound('cowork.lock.state',{objectId:'x'},'guest'),/may only be sent by the host/);
  console.log('  multi-author cowork leases, conflict denial, expiry and save protocol: ok');
}

function testIceConfiguration(){
  assert.deepEqual(SESSION.normalizeIceServers(null,true), [{urls:'stun:stun.l.google.com:19302'}],
    'ordinary sessions get the documented STUN route');
  assert.deepEqual(SESSION.normalizeIceServers([],false), [],
    'an explicit empty list keeps a fully local/offline ICE policy');
  assert.deepEqual(SESSION.normalizeIceServers([{urls:'turns:relay.example:5349',username:'u',credential:'p'}],false),
    [{urls:'turns:relay.example:5349',username:'u',credential:'p'}], 'private authenticated TURN configuration is accepted');
  assert.throws(() => SESSION.normalizeIceServers([{urls:'turn:relay.example:3478'}],false), /require both username and credential/,
    'an unusable or accidentally public TURN relay is rejected before RTCPeerConnection');
  assert.throws(() => SESSION.normalizeIceServers([{urls:'https://relay.example'}],false), /must use stun/,
    'foreign URL schemes cannot enter RTCConfiguration');
  console.log('  STUN defaults and private TURN validation: ok');
}

async function testPendingInvitationLifetime(){
  const previousRtc=global.RTCPeerConnection;
  let serial=0;
  class FakeChannel{
    constructor(label){this.label=label;this.readyState='connecting';this.bufferedAmount=0;}
    addEventListener(){}
    close(){this.readyState='closed';}
  }
  class FakePeerConnection{
    constructor(configuration){this.configuration=configuration;this.iceGatheringState='complete';this.connectionState='new';this.listeners={};}
    addEventListener(type,listener){this.listeners[type]=listener;}
    removeEventListener(type){delete this.listeners[type];}
    createDataChannel(label){return new FakeChannel(label);}
    async createOffer(){return{type:'offer',sdp:'offer-'+(++serial)};}
    async createAnswer(){return{type:'answer',sdp:'answer-'+(++serial)};}
    async setLocalDescription(value){this.localDescription=value;}
    async setRemoteDescription(value){this.remoteDescription=value;}
    close(){this.connectionState='closed';}
  }
  global.RTCPeerConnection=FakePeerConnection;
  try{
    const host=SESSION.create({name:'Host',iceServers:[]});
    const first=SESSION.decode(await host.createInvite());
    const second=SESSION.decode(await host.createInvite());
    assert.notEqual(first.inviteId,second.inviteId,'each peer receives a distinct one-use invitation');
    const answerFor=value=>SESSION.encode({
      protocol:SESSION.protocol,kind:'answer',createdAt:Date.now(),sessionId:value.sessionId,
      inviteId:value.inviteId,peerId:'peer-test',description:{type:'answer',sdp:'answer-test'},
    });
    assert.equal(await host.acceptAnswer(answerFor(first)),true,
      'creating a second invitation does not delete the first pending peer connection');
    assert.equal(await host.acceptAnswer(answerFor(second)),true,
      'the newer invitation remains independently usable as well');
    const foreign=Object.assign({},second,{sessionId:'session-foreign'});
    await assert.rejects(host.acceptAnswer(answerFor(foreign)),/belongs to another P2P session/,
      'answers cannot be applied to a similarly shaped invitation in another host session');
    host.close();
    console.log('  multiple pending invitations and session-bound answers: ok');
  }finally{
    if(previousRtc===undefined)delete global.RTCPeerConnection;
    else global.RTCPeerConnection=previousRtc;
  }
}

/* ---------------------------------------------------------------------------
   2. PROTOCOL - one numbered table, authority, clamping, explicit rejection
--------------------------------------------------------------------------- */
function testProtocol(){
  assert.deepEqual(P.PHASES.map(phase => phase.index), [1, 2, 3, 4, 5, 6], 'phases are numbered in reading order');
  assert(P.MESSAGE_TYPES.length > 0, 'the message table is populated');
  P.MESSAGE_TYPES.forEach(entry => {
    assert(entry.phase >= 1 && entry.phase <= P.PHASES.length, entry.type + ' belongs to a declared phase');
    assert(entry.channel === 'state' || entry.channel === 'reliable', entry.type + ' names a real channel');
    assert(typeof entry.validate === 'function', entry.type + ' declares a validator');
  });
  // Every declared type must be unique - a duplicate row would silently shadow.
  const seen = new Set();
  P.MESSAGE_TYPES.forEach(entry => {
    assert(!seen.has(entry.type), entry.type + ' appears exactly once in the table');
    seen.add(entry.type);
  });

  // THE RULE: an undeclared type throws. It is never defaulted or guessed.
  assert.throws(() => P.describe('totally.made.up'), /unknown message type/, 'an unknown type is rejected by throwing');
  assert.equal(P.has('totally.made.up'), false, 'and has() reports it honestly');

  // Host authority is enforced by the table itself, not by call sites.
  assert.equal(P.maySend('net.spawn', 'host'), true, 'the host may spawn avatars');
  assert.equal(P.maySend('net.spawn', 'guest'), false, 'a guest may not spawn avatars');
  assert.equal(P.maySend('net.roster', 'guest'), false, 'a guest may not rewrite the roster');
  assert.equal(P.maySend('net.event', 'guest'), true, 'gameplay events may come from either side');
  assert.equal(P.maySend('net.hostMigration', 'guest'), true, 'the elected survivor may announce a migration before its role flips');
  assert.throws(() => P.validateInbound('net.despawn', {netId:2}, 'guest'), /may only be sent by the host/,
    'an inbound host-only message from a guest is refused');

  // Payloads are rebuilt from clamped primitives, never trusted as they arrive.
  const hello = P.validateInbound('net.hello', {name:'x'.repeat(400), protocolVersion:String(P.PROTOCOL_VERSION)}, 'guest');
  assert.equal(hello.name.length, P.LIMITS.nameChars, 'an oversized name is truncated, not rejected outright');
  assert.equal(hello.protocolVersion, P.PROTOCOL_VERSION, 'numeric strings are coerced');
  const authority = P.validateInbound('net.snapshot', {epoch:7, hostPeerId:'peer-seven', records:[]}, 'host');
  assert.equal(authority.epoch, 7, 'host-authoritative messages preserve their explicit term');
  assert.equal(authority.hostPeerId, 'peer-seven', 'and the authority peer identity');

  const config = P.validateSessionConfig({mode:'nonsense', maxPlayers:99, tickRate:1000, interpolationDelay:-4});
  assert.equal(config.mode, 'co-op', 'an unknown mode falls back to the first declared one');
  assert.equal(config.maxPlayers, P.LIMITS.maxPlayers, 'the player count clamps to the protocol limit');
  assert.equal(config.tickRate, 60, 'the tick rate clamps to 60 Hz');
  assert.equal(config.interpolationDelay, .02, 'a negative interpolation delay clamps to the minimum');

  // A malformed state record is dropped; a well formed one survives.
  const records = P.validateInbound('net.snapshot', {tick:5, records:[[1, 2, 3], new Array(12).fill(0)]}, 'host').records;
  assert.equal(records.length, 1, 'a record of the wrong length is discarded');
  assert.equal(records[0].length, P.STATE_RECORD_LENGTH, 'a valid record keeps its fixed length');

  // Channel assignment comes from the table, so no call site can get it wrong.
  assert.equal(P.channelOf('net.snapshot'), 'state', 'snapshots ride the unreliable channel');
  assert.equal(P.channelOf('net.event'), 'reliable', 'gameplay events ride the reliable channel');
  console.log('  protocol table, authority and validation: ok');
}

/* ---------------------------------------------------------------------------
   3. QUANTIZATION
--------------------------------------------------------------------------- */
function testQuantization(){
  const record = new Array(P.STATE_RECORD_LENGTH);
  P.encodeStateRecord(record, 7,
    {x:12.3456, y:-4.002, z:99.9999},
    {x:0, y:.7071, z:0, w:.7071},
    {x:3.21, y:0, z:-18.75}, 5);
  const sample = P.decodeStateRecord(P.createStateSample(), record);
  assert.equal(sample.netId, 7, 'the net id survives untouched');
  assert(Math.abs(sample.px - 12.3456) <= .001, 'position is accurate to a millimetre');
  assert(Math.abs(sample.pz - 99.9999) <= .001, 'and stays accurate far from the origin');
  assert(Math.abs(sample.qy - .7071) <= .0001, 'rotation survives int16 quantization');
  assert(Math.abs(sample.vz + 18.75) <= .01, 'velocity is accurate to a centimetre per second');
  assert.equal(sample.flags, 5, 'the flag word round trips');
  assert.equal(P.decodeStateRecord(P.createStateSample(), [1, 2, 3]), null, 'a short record decodes to null, not to garbage');
  console.log('  quantization round trip: ok');
}

/* ---------------------------------------------------------------------------
   TEST DOUBLES - a THREE stub and a pair of connected fake sessions
--------------------------------------------------------------------------- */
function makeThree(){
  class Vector3 {
    constructor(x, y, z){ this.x = x || 0; this.y = y || 0; this.z = z || 0; }
    set(x, y, z){ this.x = x; this.y = y; this.z = z; return this; }
    copy(v){ return this.set(v.x, v.y, v.z); }
  }
  class Quaternion {
    constructor(){ this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
    set(x, y, z, w){ this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  }
  // Real Object3D carries both an Euler and a Quaternion; a replica factory
  // resets the Euler to identity after cloning, so the stub needs it too.
  class Euler {
    constructor(){ this.x = 0; this.y = 0; this.z = 0; }
    set(x, y, z){ this.x = x; this.y = y; this.z = z; return this; }
  }
  class Object3D {
    constructor(){
      this.children = [];
      this.parent = null;
      this.position = new Vector3();
      this.rotation = new Euler();
      this.quaternion = new Quaternion();
      this.scale = new Vector3(1, 1, 1);
      this.userData = {};
      this.name = '';
      this.visible = true;
    }
    add(child){ child.parent = this; this.children.push(child); return this; }
    remove(child){
      const index = this.children.indexOf(child);
      if(index >= 0) this.children.splice(index, 1);
      child.parent = null;
      return this;
    }
    traverse(fn){ fn(this); this.children.forEach(child => child.traverse(fn)); }
    clone(){ const copy = new Object3D(); copy.name = this.name; return copy; }
  }
  class Mesh extends Object3D {
    constructor(geometry, material){ super(); this.geometry = geometry; this.material = material; }
  }
  return {
    Vector3, Quaternion, Object3D, Mesh,
    BoxGeometry:function(){ this.dispose = () => {}; },
    CapsuleGeometry:function(){ this.dispose = () => {}; },
    MeshStandardMaterial:function(){ this.dispose = () => {}; },
    MeshBasicMaterial:function(){ this.dispose = () => {}; },
  };
}

/** A fake transport that mirrors js/runtime/p2p-session.js closely enough to be
 *  meaningful: it validates every payload through the protocol table before
 *  delivering it, exactly as the real receive path does. */
function makeSession(role, selfId){
  const listeners = new Set();
  let currentRole = role;
  let authorityEpoch = 1;
  let authorityPeerId = role === 'host' ? selfId : 'peer-host';
  const api = {
    peer:null,
    sent:[],
    state:() => ({supported:true, selfId, sessionId:'test-session', role:currentRole, closed:false, peerCount:api.peer ? 1 : 0, peers:[], authorityEpoch, authorityPeerId}),
    subscribe(listener){ listeners.add(listener); return () => listeners.delete(listener); },
    send(type, payload){
      api.sent.push({type, payload});
      if(api.peer) api.peer.receive(type, payload, selfId, currentRole);
      return api.peer ? 1 : 0;
    },
    sendTo(peerId, type, payload){
      api.sent.push({type, payload, to:peerId});
      if(api.peer) api.peer.receive(type, payload, selfId, currentRole);
      return !!api.peer;
    },
    /** The receive path: validate as the sender's role, then dispatch. */
    receive(type, payload, fromPeerId, senderRole){
      let body;
      try { body = P.validateInbound(type, payload, senderRole); }
      catch(err){ return false; }
      listeners.forEach(listener => listener({kind:'message', type, payload:body, peerId:fromPeerId, known:true}));
      return true;
    },
    setRole(nextRole){ currentRole = nextRole; return currentRole; },
    setAuthority(epoch, hostPeerId){ authorityEpoch = epoch; authorityPeerId = hostPeerId; return {epoch, hostPeerId}; },
    emitState(action, detail){ listeners.forEach(listener => listener(Object.assign({kind:'state', action}, detail || {}))); },
    close(){ listeners.clear(); },
  };
  return api;
}
function makeGame(THREE){
  return {
    core:{scene:new THREE.Object3D()},
    world:{registry:[]},
    hooks:{frame:[]},
    systems:{},
    pawns:null,
    state:{started:true},
  };
}

/* ---------------------------------------------------------------------------
   4. REPLICATION - handshake, ids, authority, snapshots, interpolation
--------------------------------------------------------------------------- */
function testReplication(){
  const THREE = makeThree();
  global.THREE = THREE;

  const hostGame = makeGame(THREE);
  const guestGame = makeGame(THREE);
  const host = REPLICATION.create(hostGame);
  const guest = REPLICATION.create(guestGame);

  const hostSession = makeSession('host', 'peer-host');
  const guestSession = makeSession('guest', 'peer-guest');
  hostSession.peer = guestSession;
  guestSession.peer = hostSession;

  // Each side needs something to publish; a bare Object3D is enough.
  const hostAvatar = new THREE.Object3D();
  const guestAvatar = new THREE.Object3D();

  host.attach(hostSession, {name:'Host', localObject:hostAvatar, config:{maxPlayers:4, tickRate:20}});
  assert.equal(host.isHost(), true, 'the inviting side is the host');
  assert.equal(host.roster().length, 1, 'the host seats itself as player 1');
  assert.equal(host.roster()[0].playerId, 1, 'the host is player 1');

  // --- handshake and player id assignment ---------------------------------
  guest.attach(guestSession, {name:'Guest', localObject:guestAvatar});
  const roster = host.roster();
  assert.equal(roster.length, 2, 'the guest is admitted to the roster');
  const seated = roster.find(entry => entry.name === 'Guest');
  assert(seated, 'the guest keeps the name it announced');
  assert.equal(seated.playerId, 2, 'the host assigns the next free player id');
  assert.notEqual(seated.netId, host.roster()[0].netId, 'every player gets a distinct net id');

  const guestView = guest.snapshot();
  assert.equal(guestView.localPlayerId, 2, 'the guest learns its authoritative player id');
  assert.equal(guestView.localNetId, seated.netId, 'and the net id it owns');
  assert.equal(guestView.config.maxPlayers, 4, 'the host configuration is adopted by the guest');

  // The host built a body for the newcomer.
  assert.equal(host.replicas().length, 1, 'the host spawns a replica for the guest');
  // The guest was told about the host.
  assert.equal(guest.replicas().length, 1, 'the guest spawns a replica for the host');

  // --- an unknown message type is rejected by throwing ---------------------
  assert.throws(() => host.route('not.a.real.type', 'peer-guest', {}), /unknown message type/,
    'the router refuses a type the protocol table does not declare');

  // --- a declared type with no gameplay handler is refused explicitly ------
  const beforeRejected = host.snapshot().stats.rejected;
  assert.equal(host.route('cowork.presence', 'peer-guest', {name:'x', u:0, v:0}), false,
    'an editor-only message is refused by the gameplay router');
  assert.equal(host.snapshot().stats.rejected, beforeRejected + 1, 'and the refusal is counted, not swallowed');

  // --- host authority: a guest cannot write somebody else's avatar ---------
  const hostNetId = host.roster()[0].netId;
  const forged = new Array(P.STATE_RECORD_LENGTH).fill(0);
  forged[0] = hostNetId;                       // pretend to be the host
  forged[7] = P.QUANTIZE.rotationScale;        // identity rotation
  const rejectedBefore = host.snapshot().stats.rejected;
  host.route('net.move', 'peer-guest', {tick:1, records:[forged]});
  assert.equal(host.snapshot().stats.rejected, rejectedBefore + 1,
    'a guest writing a net id it does not own is rejected');

  // --- a guest CAN write its own avatar ------------------------------------
  const owned = new Array(P.STATE_RECORD_LENGTH).fill(0);
  P.encodeStateRecord(owned, seated.netId, {x:5, y:0, z:-3}, {x:0, y:0, z:0, w:1}, null, 0);
  assert.equal(host.route('net.move', 'peer-guest', {tick:2, records:[owned]}), true,
    'a guest updating its own avatar is accepted');

  // --- snapshot application and interpolation playback ---------------------
  const guestBefore = guest.replicas()[0].object.position.x;
  const snapshotRecord = new Array(P.STATE_RECORD_LENGTH);
  P.encodeStateRecord(snapshotRecord, hostNetId, {x:11.5, y:2, z:-7.25}, {x:0, y:0, z:0, w:1}, null, 0);
  guest.route('net.snapshot', 'peer-host', {epoch:1, hostPeerId:'peer-host', tick:9, time:Date.now(), records:[snapshotRecord]});
  guest.update();
  const replica = guest.replicas()[0];
  assert(Math.abs(replica.object.position.x - 11.5) <= .01, 'the replica is moved to the received position');
  assert(Math.abs(replica.object.position.z + 7.25) <= .01, 'on every axis');
  assert.notEqual(replica.object.position.x, guestBefore, 'and it actually changed');
  assert.equal(replica.object.userData.p2pReplica, true, 'a replica is tagged as runtime-only, never saved');

  // --- a state record for a net id nobody announced is refused -------------
  const orphan = new Array(P.STATE_RECORD_LENGTH).fill(0);
  P.encodeStateRecord(orphan, 4242, {x:0, y:0, z:0}, {x:0, y:0, z:0, w:1}, null, 0);
  const orphanBefore = guest.snapshot().stats.rejected;
  guest.route('net.snapshot', 'peer-host', {epoch:1, hostPeerId:'peer-host', tick:10, time:Date.now(), records:[orphan]});
  assert.equal(guest.snapshot().stats.rejected, orphanBefore + 1,
    'an unannounced net id cannot inject an entity into the scene');
  assert.equal(guest.replicas().length, 1, 'and no body was created for it');

  // --- leaving ------------------------------------------------------------
  host.route('net.leave', 'peer-guest', {reason:'done'});
  assert.equal(host.roster().length, 1, 'the roster shrinks when a peer leaves');
  assert.equal(host.replicas().length, 0, 'and its body is removed from the scene');

  // Reusing the runtime for another lobby must not retain the previous host's
  // body or the old authoritative identity while the new host assigns a seat.
  const replacementSession = makeSession('guest', 'peer-guest-next');
  guest.attach(replacementSession, {name:'Guest next', localObject:guestAvatar});
  const replacementView = guest.snapshot();
  assert.equal(replacementView.replicaCount, 0, 'switching sessions releases every old remote replica');
  assert.equal(replacementView.localNetId, 0, 'the old session net id cannot leak into the next lobby');
  assert.equal(replacementView.localPlayerId, 0, 'the next host remains authoritative for seat assignment');
  assert.equal(guestGame.hooks.frame.length,1,'reattaching replaces rather than duplicates the frame hook');

  // The network tick must be a real interval, decoupled from any frame loop.
  assert.equal(host.snapshot().tickRate, 20, 'the fixed network tick runs at the configured rate');
  assert.equal(hostGame.hooks.frame.length,1,'interpolation playback owns one frame hook');

  host.stop();
  guest.stop();
  assert.equal(hostGame.hooks.frame.length,0,'stopping removes the replication frame hook');
  assert.equal(guestGame.hooks.frame.length,0,'every session releases its frame hook');
  console.log('  replication handshake, authority, snapshots and interpolation: ok');
}

function testReplicaResourceOwnership(){
  const THREE=makeThree(),parent=new THREE.Object3D(),replica=new THREE.Object3D(),child=new THREE.Object3D();
  let sharedDisposals=0,ownedDisposals=0;
  child.geometry={dispose(){sharedDisposals++;}};
  child.material={dispose(){sharedDisposals++;}};
  const owned={dispose(){ownedDisposals++;}};
  REPLICATION.ownReplicaResources(child,[owned,owned]);
  replica.add(child);parent.add(replica);
  assert.equal(REPLICATION.disposeReplicaObject(replica),true);
  assert.equal(replica.parent,null,'despawn detaches the replica root');
  assert.equal(sharedDisposals,0,'resources inherited from clone(true) remain owned by the local avatar');
  assert.equal(ownedDisposals,1,'factory-owned resources are disposed exactly once');
  console.log('  replica GPU ownership manifest and hook teardown: ok');
}

function testHostMigration(){
  const THREE = makeThree();
  global.THREE = THREE;
  const gameA = makeGame(THREE), gameB = makeGame(THREE);
  const peerA = REPLICATION.create(gameA), peerB = REPLICATION.create(gameB);
  const sessionA = makeSession('guest', 'peer-a'), sessionB = makeSession('guest', 'peer-b');
  const roster = [
    {peerId:'peer-host', playerId:1, netId:1, name:'Old host', color:'#fff', team:0, ready:true, host:true, latency:0},
    {peerId:'peer-a', playerId:2, netId:2, name:'Alpha', color:'#f00', team:0, ready:true, host:false, latency:0},
    {peerId:'peer-b', playerId:3, netId:3, name:'Bravo', color:'#0f0', team:0, ready:true, host:false, latency:0},
  ];
  function seed(replica, localNetId, localPlayerId){
    replica.route('net.welcome', 'peer-host', {
      epoch:1, hostPeerId:'peer-host', playerId:localPlayerId, netId:localNetId, team:0,
      config:{maxPlayers:4, tickRate:20},
    });
    replica.route('net.roster', 'peer-host', {epoch:1, hostPeerId:'peer-host', players:roster});
  }
  peerA.attach(sessionA, {name:'Alpha', localObject:new THREE.Object3D()});
  peerB.attach(sessionB, {name:'Bravo', localObject:new THREE.Object3D()});
  seed(peerA, 2, 2);
  seed(peerB, 3, 3);

  sessionA.emitState('peer-closed', {peerId:'peer-host'});
  sessionB.emitState('peer-closed', {peerId:'peer-host'});
  const migratedA = peerA.snapshot(), waitingB = peerB.snapshot();
  assert.equal(migratedA.role, 'host', 'the lowest surviving player is elected host deterministically');
  assert.equal(migratedA.localPlayerId, 1, 'the elected host becomes Player 1');
  assert.equal(migratedA.epoch, 2, 'host loss advances the authority term exactly once');
  assert.equal(migratedA.migrationState, 'awaiting-reconnect', 'a star transport reports its missing surviving links honestly');
  assert.equal(waitingB.role, 'guest', 'all other survivors remain guests');
  assert.equal(waitingB.hostPeerId, 'peer-a', 'every survivor elects the same peer');
  assert.equal(waitingB.localPlayerId, 2, 'remaining player ids are rebalanced without duplicates');

  const claim = sessionA.sent.find(message => message.type === 'net.hostMigration');
  assert(claim, 'the elected host publishes an explicit migration contract');
  assert.equal(peerB.route('net.hostMigration', 'peer-a', claim.payload), true, 'a valid elected-host claim is accepted');
  assert.equal(peerB.snapshot().migrationState, 'stable', 'the accepted claim settles the migration state');
  const afterClaimRejected = peerB.snapshot().stats.rejected;
  assert.equal(peerB.route('net.hostMigration', 'peer-a', claim.payload), false, 'a committed migration claim cannot be replayed');
  assert.equal(peerB.snapshot().stats.rejected, afterClaimRejected + 1, 'the replay is observable as a rejection');

  const beforeStale = peerB.snapshot().stats.rejected;
  peerB.route('net.snapshot', 'peer-host', {epoch:1, hostPeerId:'peer-host', tick:99, time:Date.now(), records:[]});
  peerB.route('net.snapshot', 'peer-host', {epoch:2, hostPeerId:'peer-a', tick:100, time:Date.now(), records:[]});
  assert.equal(peerB.snapshot().stats.rejected, beforeStale + 2,
    'old-term packets and current-term packets from the former host are both rejected');
  assert.equal(peerA.route('net.hello', 'peer-c', {name:'Charlie', protocolVersion:P.PROTOCOL_VERSION, color:'#00f'}), true,
    'the migrated host can admit a peer after reconnect signaling');
  assert.equal(peerA.roster().find(entry => entry.peerId === 'peer-c').netId, 4,
    'post-migration admission continues after the highest surviving net id');
  peerA.route('net.hello', 'peer-c', {name:'Charlie again', protocolVersion:P.PROTOCOL_VERSION, color:'#00f'});
  assert.equal(peerA.roster().filter(entry => entry.peerId === 'peer-c').length, 1,
    'a reconnect hello reuses its seat instead of duplicating the player');
  assert.equal(gameA.hooks.frame.length, 1, 'migration does not install a second interpolation hook');
  assert.equal(gameB.hooks.frame.length, 1, 'waiting and adoption keep one hook as well');

  peerA.stop();
  peerB.stop();
  assert.equal(gameA.hooks.frame.length, 0, 'the elected host still tears its hook down');
  assert.equal(gameB.hooks.frame.length, 0, 'the migrated guest tears its hook down');
  console.log('  deterministic host migration, epoch authority and star-topology limit: ok');
}

/* ---------------------------------------------------------------------------
   5. MULTIPLAYER MODE - the editor-authored descriptor and its scene assets
--------------------------------------------------------------------------- */
function testMultiplayerMode(){
  const normalized = MULTIPLAYER.normalize({
    mode:'nope', maxPlayers:400, tickRate:0, interpolationDelay:9,
    hud:{position:'sideways'}, assets:{nameplates:false},
  });
  assert.equal(normalized.mode, 'co-op', 'an unknown mode falls back to the first declared one');
  assert.equal(normalized.maxPlayers, 8, 'the player count clamps to the supported maximum');
  assert.equal(normalized.tickRate, 5, 'the tick rate clamps to the supported minimum');
  assert.equal(normalized.interpolationDelay, .5, 'the interpolation delay clamps to half a second');
  assert.equal(normalized.hud.position, 'top-left', 'an unknown HUD corner falls back to top-left');
  assert.equal(normalized.assets.nameplates, false, 'an author can switch the nameplates off');
  assert.equal(normalized.assets.spawnMarkers, true, 'and the other associated assets keep their default');

  // The scene asset roles are one table, and an unknown role throws.
  const roles = MULTIPLAYER.MULTIPLAYER_ROLES.map(entry => entry.id);
  assert.deepEqual(roles, ['spawn-point', 'avatar-prefab', 'lobby', 'team-zone'], 'the associated asset roles are declared in order');
  assert.throws(() => MULTIPLAYER.describeRole('teleporter'), /unknown scene asset role/, 'an unknown role is rejected by throwing');

  // Naming an object in the outliner is what gives it a role.
  assert.equal(MULTIPLAYER.roleOf({userData:{editorName:'MP Spawn 3'}}), 'spawn-point', 'a renamed primitive becomes a spawn point');
  assert.equal(MULTIPLAYER.roleOf({userData:{editorName:'MP Team 2'}}), 'team-zone', 'and a team zone');
  assert.equal(MULTIPLAYER.roleOf({userData:{editorName:'Just A Crate'}}), '', 'an ordinary object has no multiplayer role');

  // Every setting is reachable from the Inspector: each exposed variable must
  // name a binding that exists in the normalized descriptor.
  const templates = fs.readFileSync('js/logic/logic-templates-network.js', 'utf8');
  assert(templates.includes("binding:'tickRate'") || templates.includes("'tickRate', 'Network Tick Rate (Hz)'"),
    'the tick rate is an exposed, bound variable');
  assert(templates.includes('multiplayerDirector'), 'the template writes an authored descriptor');
  assert(templates.includes("'logic-template-multiplayer-mode'"), 'the multiplayer mode ships as a Logic Element template');

  const level = fs.readFileSync('js/runtime/p2p-multiplayer-level-template.js', 'utf8');
  assert(level.includes("'MP Spawn '"), 'the arena level template places named spawn points');
  assert(level.includes("'MP Player Prefab'"), 'and a remote player prefab');
  assert(level.includes("'MP Lobby'"), 'and a lobby volume');
  assert(level.includes('LK_LEVEL_TEMPLATES'), 'and registers itself with the level template registry');
  console.log('  multiplayer mode descriptor and scene assets: ok');
}

async function run(){
  testCoworkTokenRouting();
  testCoworkSnapshotStreaming();
  testCoworkEditLeases();
  testProtocol();
  testIceConfiguration();
  await testPendingInvitationLifetime();
  testQuantization();
  testReplication();
  testReplicaResourceOwnership();
  testHostMigration();
  testMultiplayerMode();
  console.log('p2p-logic.test.js: all assertions passed');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
