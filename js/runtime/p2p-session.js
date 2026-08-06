/* =========================================================
   LOT KING - browser P2P session transport

   WebRTC DataChannels with out-of-band invite codes. No project or gameplay
   payload ever passes through the static web server: the only thing that leaves
   the browser is the invite/answer text the two people exchange themselves.

   Read order (and the order of the numbered sections below):
     1. Transport constants and the TRANSPORT_FRAMES table
     2. Utilities: ids, base64url codec, ICE gathering
     3. Peer record: two data channels, outbox, flush
     4. Inbound path: frame decoding, chunk reassembly, application dispatch
     5. Outbound path: channel selection, chunking, send / sendTo
     6. Signalling: createInvite / join / acceptAnswer
     7. Public API
     8. Module bootstrap for the P2P feature set

   TWO CHANNELS, NOT ONE. The MDN/web.dev RTCDataChannel guidance is explicit
   that one channel cannot serve both needs, and every shipping netcode (Valve
   Source, Overwatch) separates them the same way:
     - 'lotking-state'    unordered, maxRetransmits:0 - transform snapshots.
       A late snapshot is worthless; retransmitting it only adds head-of-line
       blocking to the packets that still matter.
     - 'lotking-reliable' ordered, fully reliable - handshake, lobby, spawns,
       gameplay events, project snapshots. These must arrive, in order, once.

   HONEST LIMIT, STATED HERE BECAUSE IT IS A PROPERTY OF THE TRANSPORT:
   the default public STUN route discovers a direct path on a LAN and across
   many ordinary home routers. Symmetric/carrier-grade NAT or restrictive
   firewalls still need an authenticated TURN relay. Pass private `iceServers`
   to create(); no browser-only implementation can manufacture a relay.
   See docs/P2P_SESSIONS_AND_COWORKING.md.

   SECURITY. Everything arriving on a channel was written by a browser we do not
   control. Sizes are capped before parsing, chunk tables are bounded and aged
   out, and an unknown transport frame kind is REJECTED EXPLICITLY - it is never
   defaulted or dropped in silence. Application payloads are validated against
   js/runtime/p2p-protocol.js, the single table of what may be sent.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;

/* ---------------------------------------------------------------------------
   1. TRANSPORT CONSTANTS AND THE TRANSPORT_FRAMES TABLE
   Every literal the wire format depends on is named exactly once, here.
--------------------------------------------------------------------------- */
const PROTOCOL = 'lotking.p2p.v1';
const MAX_MESSAGE_CHARS = 64 * 1024 * 1024;
const CHUNK_CHARS = 16 * 1024;
// A slice of an already-serialized application message is wrapped in the
// transport frame JSON. Quotes and backslashes can therefore double on wire.
// Size the inbound frame guard for that exact worst case, not for plain text.
const MAX_CHUNK_FRAME_CHARS = CHUNK_CHARS * 2 + 2048;
const MAX_CHUNK_TABLES = 32;
const CHUNK_MAX_AGE = 30000;
const INVITE_MAX_AGE = 15 * 60 * 1000;
const OUTBOX_HIGH_WATER = 1024 * 1024;
const TYPE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,95}$/i;
// The WebRTC reference documentation uses this STUN endpoint in its peer
// connection example. Host-only ICE (`iceServers:[]`) is still available as an
// explicit privacy/offline override, but it is too fragile to be the engine
// default across browsers, Wi-Fi adapters and ordinary home NATs.
const DEFAULT_ICE_SERVERS = Object.freeze([
  Object.freeze({urls:'stun:stun.l.google.com:19302'}),
]);

/** The two channels, in the order they are created. `label` is what the guest
 *  matches on when the host's channels arrive through `ondatachannel`. */
const CHANNELS = Object.freeze([
  Object.freeze({
    id:'reliable', label:'lotking-reliable', chunked:true,
    options:Object.freeze({ordered:true}),
    purpose:'handshake, lobby, spawns, gameplay events, project snapshots',
  }),
  Object.freeze({
    id:'state', label:'lotking-state', chunked:false,
    options:Object.freeze({ordered:false, maxRetransmits:0}),
    purpose:'transform snapshots; a dropped one is replaced by the next tick',
  }),
]);
const CHANNEL_BY_LABEL = new Map(CHANNELS.map(entry => [entry.label, entry]));
const DEFAULT_CHANNEL = CHANNELS[0].id;

/** The wire-level frame kinds. A frame whose `kind` is not in this table has no
 *  safe interpretation, so `frameKind()` rejects it instead of guessing. */
const TRANSPORT_FRAMES = Object.freeze({
  message:'message',  // a complete application message
  chunk:'chunk',      // one slice of an oversized application message
});
const FRAME_KINDS = Object.freeze(Object.keys(TRANSPORT_FRAMES));

/** @throws when a peer sends a frame kind this build does not implement. */
function frameKind(value){
  const kind = value == null ? TRANSPORT_FRAMES.message : String(value);
  if(!Object.prototype.hasOwnProperty.call(TRANSPORT_FRAMES, kind)){
    const error = new Error('Lot King P2P: unsupported transport frame "' + kind.slice(0, 32) + '"');
    error.name = 'LotKingTransportError';
    throw error;
  }
  return kind;
}

function protocolTable(){ return root.LK_P2P_PROTOCOL || null; }

/* ---------------------------------------------------------------------------
   2. UTILITIES
--------------------------------------------------------------------------- */
function uid(prefix){
  const value = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return String(prefix || 'id') + '-' + value;
}
function encode(value){
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for(let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(code){
  const normalized = String(code || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded), bytes = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}
function waitIce(pc, timeout){
  if(pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    let done = false;
    const finish = () => {
      if(done) return;
      done = true;
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => { if(pc.iceGatheringState === 'complete') finish(); };
    const timer = setTimeout(finish, Math.max(1000, Number(timeout) || 6000));
    pc.addEventListener('icegatheringstatechange', check);
  });
}
function descriptionOf(value){ return value && {type:value.type, sdp:value.sdp}; }
function normalizeIceServers(value, useDefault){
  const source = Array.isArray(value) ? value : (useDefault === false ? [] : DEFAULT_ICE_SERVERS);
  if(source.length > 8) throw new Error('Lot King P2P supports at most 8 ICE server entries');
  return source.map(entry => {
    const input = typeof entry === 'string' ? {urls:entry} : entry;
    if(!input || typeof input !== 'object') throw new Error('Invalid P2P ICE server entry');
    const rawUrls = Array.isArray(input.urls) ? input.urls : [input.urls];
    const urls = rawUrls.map(url => String(url || '').trim()).filter(Boolean);
    if(!urls.length || urls.length > 8 || urls.some(url => !/^(?:stun|stuns|turn|turns):[^\s]{1,500}$/i.test(url))){
      throw new Error('ICE URLs must use stun:, stuns:, turn: or turns:');
    }
    const needsCredential = urls.some(url => /^turns?:/i.test(url));
    const username = input.username == null ? '' : String(input.username).slice(0, 256);
    const credential = input.credential == null ? '' : String(input.credential).slice(0, 512);
    if(needsCredential && (!username || !credential)) throw new Error('TURN servers require both username and credential');
    const result = {urls:Array.isArray(input.urls) ? urls : urls[0]};
    if(username) result.username = username;
    if(credential) result.credential = credential;
    return result;
  });
}

/* =========================================================================
   SESSION FACTORY
========================================================================= */
function create(options){
  const supplied = options || {};
  const opts = Object.assign({name:'Lot King peer', iceTimeout:9000, strict:false}, supplied);
  opts.iceServers = normalizeIceServers(
    Object.prototype.hasOwnProperty.call(supplied, 'iceServers') ? supplied.iceServers : null,
    !Object.prototype.hasOwnProperty.call(supplied, 'iceServers')
  );
  const selfId = uid('peer');
  let activeSessionId = uid('session');
  const peers = new Map(), listeners = new Set(), chunks = new Map();
  let sequence = 0, closed = false, role = 'idle';
  let authorityEpoch = 1, authorityPeerId = '';

  function supported(){
    return typeof RTCPeerConnection === 'function' && typeof TextEncoder === 'function' && typeof TextDecoder === 'function';
  }
  function emit(kind, detail){
    const event = Object.assign({kind, selfId, sessionId:activeSessionId, role, time:Date.now()}, detail || {});
    listeners.forEach(listener => {
      try { listener(event); }
      catch(err){ console.warn('LotKing P2P listener failed', err); }
    });
    if(root && typeof root.dispatchEvent === 'function' && typeof CustomEvent === 'function'){
      root.dispatchEvent(new CustomEvent(kind === 'message' ? 'lotking:p2p-message' : 'lotking:p2p-state', {detail:event}));
    }
    return event;
  }
  function openCount(){
    let count = 0;
    peers.forEach(record => { if(isOpen(record, DEFAULT_CHANNEL)) count++; });
    return count;
  }
  function state(){
    return Object.freeze({
      supported:supported(), selfId, sessionId:activeSessionId, role, closed,
      authorityEpoch, authorityPeerId,
      iceServerCount:opts.iceServers.length,
      peerCount:openCount(),
      peers:Array.from(peers.values()).map(record => ({
        id:record.remoteId || record.id,
        name:record.remoteName || 'Connecting peer',
        state:record.pc.connectionState || (isOpen(record, DEFAULT_CHANNEL) ? 'open' : 'connecting'),
        channels:CHANNELS.filter(entry => isOpen(record, entry.id)).map(entry => entry.id),
      })),
    });
  }
  function subscribe(listener){ listeners.add(listener); return () => listeners.delete(listener); }
  function rtc(){
    if(!supported()) throw new Error('WebRTC DataChannel is not available in this browser');
    return new RTCPeerConnection({iceServers:opts.iceServers, iceCandidatePoolSize:1});
  }
  function parseSignal(code, wanted){
    let value;
    try { value = decode(code); }
    catch(err){ throw new Error('Invalid Lot King P2P code'); }
    if(!value || value.protocol !== PROTOCOL || value.kind !== wanted || !value.description) throw new Error('Unsupported Lot King P2P code');
    if(Date.now() - Number(value.createdAt || 0) > INVITE_MAX_AGE) throw new Error('This P2P invitation has expired; create a new one');
    return value;
  }

  /* -------------------------------------------------------------------------
     3. PEER RECORD - two channels, one outbox each
  ------------------------------------------------------------------------- */
  function makeRecord(id){
    const pc = rtc();
    const record = {
      id, pc, remoteId:null, remoteName:'', remoteRole:'',
      // One slot per entry of CHANNELS, keyed by its id.
      channels:CHANNELS.reduce((out, entry) => {
        out[entry.id] = {spec:entry, channel:null, outbox:[], flushing:false};
        return out;
      }, {}),
    };
    peers.set(id, record);
    pc.addEventListener('datachannel', event => attachChannel(record, event.channel));
    pc.addEventListener('connectionstatechange', () => {
      emit('state', {action:'connection-state', peerId:record.remoteId || record.id, state:pc.connectionState});
      if(pc.connectionState === 'failed' || pc.connectionState === 'closed') forget(record);
    });
    pc.addEventListener('icecandidateerror', event => {
      emit('state', {
        action:'ice-candidate-error', peerId:record.remoteId || record.id,
        code:Number(event && event.errorCode) || 0,
        error:String(event && event.errorText || 'ICE candidate gathering failed').slice(0, 240),
        url:String(event && event.url || '').slice(0, 512),
      });
    });
    return record;
  }
  function slot(record, channelId){ return record && record.channels[channelId] || null; }
  function isOpen(record, channelId){
    const entry = slot(record, channelId);
    return !!(entry && entry.channel && entry.channel.readyState === 'open');
  }
  function forget(record){
    if(!record) return;
    // The reliable channel close and RTCPeerConnection close are two views of
    // the same teardown. Only the first may publish peer-closed; otherwise host
    // migration and OnNetworkPlayerLeft run twice for one peer.
    if(!peers.delete(record.id)) return false;
    emit('state', {action:'peer-closed', peerId:record.remoteId || record.id});
    return true;
  }
  function attachChannel(record, channel){
    const spec = CHANNEL_BY_LABEL.get(String(channel && channel.label || ''));
    if(!spec){
      // A label we never create is not a Lot King channel. Refuse it loudly
      // rather than wiring unknown traffic into the engine.
      emit('state', {action:'channel-rejected', peerId:record.remoteId || record.id, label:String(channel && channel.label || '')});
      try { channel.close(); } catch(err){}
      return;
    }
    const entry = slot(record, spec.id);
    entry.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = 256 * 1024;
    channel.addEventListener('open', () => {
      if(spec.id === DEFAULT_CHANNEL){
        sendOn(record, DEFAULT_CHANNEL, 'system.hello', {name:String(opts.name || 'Lot King peer').slice(0, 80), role, protocol:PROTOCOL});
      }
      emit('state', {action:'channel-open', peerId:record.remoteId || record.id, channel:spec.id});
    });
    channel.addEventListener('message', event => receiveFrame(record, spec, event.data));
    channel.addEventListener('close', () => { if(spec.id === DEFAULT_CHANNEL) forget(record); });
    channel.addEventListener('error', () => emit('state', {action:'channel-error', peerId:record.remoteId || record.id, channel:spec.id}));
  }
  function flush(record, channelId){
    const entry = slot(record, channelId);
    if(!entry || !entry.channel || entry.channel.readyState !== 'open' || entry.flushing) return;
    entry.flushing = true;
    const pump = () => {
      if(!entry.channel || entry.channel.readyState !== 'open'){ entry.flushing = false; return; }
      try {
        while(entry.outbox.length && entry.channel.bufferedAmount < OUTBOX_HIGH_WATER) entry.channel.send(entry.outbox.shift());
      } catch(err){
        entry.flushing = false;
        emit('state', {action:'send-error', peerId:record.remoteId || record.id, channel:channelId, error:String(err && err.message || err)});
        return;
      }
      if(entry.outbox.length) setTimeout(pump, 12);
      else entry.flushing = false;
    };
    pump();
  }

  /* -------------------------------------------------------------------------
     4. INBOUND PATH
     raw text -> transport frame -> (chunk reassembly) -> application message
  ------------------------------------------------------------------------- */
  function reject(record, reason, detail){
    emit('state', Object.assign({
      action:'message-rejected',
      peerId:record && (record.remoteId || record.id) || '',
      reason:String(reason),
    }, detail || {}));
    return false;
  }
  function receiveFrame(record, spec, raw, assembled){
    if(typeof raw !== 'string') return reject(record, 'binary frames are not part of this protocol');
    const cap = assembled ? MAX_MESSAGE_CHARS : MAX_CHUNK_FRAME_CHARS;
    if(raw.length > cap) return reject(record, 'frame exceeds the size limit', {limit:cap});

    let frame;
    try { frame = JSON.parse(raw); }
    catch(err){ return reject(record, 'frame is not valid JSON'); }
    if(!frame || typeof frame !== 'object') return reject(record, 'frame is not an object');

    let kind;
    try { kind = frameKind(frame.kind); }
    catch(err){ return reject(record, err.message); }

    if(kind === TRANSPORT_FRAMES.chunk) return receiveChunk(record, spec, frame);
    return receiveMessage(record, spec, frame);
  }
  function receiveChunk(record, spec, frame){
    if(!spec.chunked) return reject(record, 'chunks are only accepted on the reliable channel');
    const total = Math.max(1, Math.min(8192, Number(frame.total) || 0));
    const index = Number(frame.index);
    if(!frame.id || !(index >= 0) || index >= total || typeof frame.data !== 'string') return reject(record, 'malformed chunk header');
    if(total * CHUNK_CHARS > MAX_MESSAGE_CHARS + CHUNK_CHARS) return reject(record, 'chunked message exceeds the 64 MB safety limit');

    const now = Date.now(), chunkId = record.id + ':' + frame.id;
    chunks.forEach((value, key) => { if(now - value.createdAt > CHUNK_MAX_AGE) chunks.delete(key); });
    if(!chunks.has(chunkId) && chunks.size >= MAX_CHUNK_TABLES){
      const oldest = Array.from(chunks.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if(oldest) chunks.delete(oldest[0]);
    }
    let pending = chunks.get(chunkId);
    if(!pending){ pending = {parts:new Array(total), received:0, size:0, createdAt:now}; chunks.set(chunkId, pending); }
    if(pending.parts.length !== total || pending.parts[index] != null) return reject(record, 'duplicate or inconsistent chunk');
    pending.parts[index] = frame.data;
    pending.received++;
    pending.size += frame.data.length;
    if(pending.size > MAX_MESSAGE_CHARS){ chunks.delete(chunkId); return reject(record, 'reassembled message exceeds the 64 MB safety limit'); }
    if(pending.received === total){
      chunks.delete(chunkId);
      return receiveFrame(record, spec, pending.parts.join(''), true);
    }
    return true;
  }
  function receiveMessage(record, spec, frame){
    if(frame.protocol !== PROTOCOL) return reject(record, 'foreign protocol tag');
    if(typeof frame.type !== 'string' || !TYPE_PATTERN.test(frame.type)) return reject(record, 'malformed message type');

    // system.hello is the only type the transport itself understands; it names
    // the peer so every later event can be attributed.
    if(frame.type === 'system.hello'){
      record.remoteId = String(frame.from || record.id);
      record.remoteName = String(frame.payload && frame.payload.name || 'Peer').slice(0, 80);
      record.remoteRole = frame.payload && frame.payload.role === 'host' ? 'host' : 'guest';
      emit('state', {action:'peer-ready', peerId:record.remoteId, name:record.remoteName});
      return true;
    }

    // Application types are checked against the one protocol table. A type the
    // table declares MUST validate. A type it does not declare is forwarded as
    // unvalidated only on a permissive session, and is rejected explicitly on a
    // strict one (which is what the replication layer asks for). Either way the
    // outcome is observable: nothing is discarded in silence.
    const table = protocolTable();
    let payload = frame.payload;
    let known = false;
    if(table && table.has(frame.type)){
      known = true;
      const senderRole = record.remoteRole || (role === 'host' ? 'guest' : 'host');
      try { payload = table.validateInbound(frame.type, payload, senderRole); }
      catch(err){ return reject(record, err.message, {type:frame.type}); }
    } else if(opts.strict === true){
      return reject(record, 'message type is not declared in the P2P protocol table', {type:frame.type});
    }

    emit('message', {
      type:frame.type, payload, known, channel:spec.id,
      peerId:record.remoteId || frame.from || record.id,
      peerName:record.remoteName || 'Peer',
      sequence:Number(frame.sequence) || 0,
    });
    return true;
  }

  /* -------------------------------------------------------------------------
     5. OUTBOUND PATH
  ------------------------------------------------------------------------- */
  /** Which channel a type belongs on: the protocol table decides for every type
   *  it declares, so no call site has to remember. */
  function channelFor(type, override){
    if(override && CHANNELS.some(entry => entry.id === override)) return override;
    const table = protocolTable();
    if(table && table.has(type)) return table.channelOf(type);
    return DEFAULT_CHANNEL;
  }
  function sendRaw(record, channelId, text){
    const entry = slot(record, channelId);
    if(!entry || !entry.channel || entry.channel.readyState !== 'open') return false;
    if(text.length > MAX_MESSAGE_CHARS) throw new Error('P2P message exceeds the 64 MB safety limit');
    if(text.length <= CHUNK_CHARS){
      entry.outbox.push(text);
    } else if(!entry.spec.chunked){
      // An unreliable channel cannot reassemble; sending a partial state packet
      // would be worse than not sending it, so this is a caller error.
      throw new Error('P2P message too large for the unreliable state channel');
    } else {
      const id = uid('message'), total = Math.ceil(text.length / CHUNK_CHARS);
      for(let index = 0; index < total; index++){
        entry.outbox.push(JSON.stringify({
          kind:TRANSPORT_FRAMES.chunk, id, index, total,
          data:text.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS),
        }));
      }
    }
    flush(record, channelId);
    return true;
  }
  function sendOn(record, channelId, type, payload){
    if(!TYPE_PATTERN.test(String(type || ''))) throw new Error('Invalid P2P message type');
    return sendRaw(record, channelId, JSON.stringify({
      kind:TRANSPORT_FRAMES.message, protocol:PROTOCOL, type:String(type),
      payload, from:selfId, sequence:++sequence, time:Date.now(),
    }));
  }
  /** Validates locally before transmitting, so a local bug surfaces here rather
   *  than as a rejected message on the other machine. */
  function prepare(type, payload){
    const table = protocolTable();
    if(table && table.has(type)){
      let source = payload;
      if(role === 'host' && table.isHostAuthoritative && table.isHostAuthoritative(type)){
        source = Object.assign({}, payload || {}, {
          epoch:authorityEpoch,
          hostPeerId:authorityPeerId || selfId,
        });
      }
      return table.validateOutbound(type, source);
    }
    if(opts.strict === true && table) throw table.protocolError('refusing to send undeclared type "' + String(type).slice(0, 64) + '"');
    return payload;
  }
  function send(type, payload, options){
    const body = prepare(type, payload);
    const channelId = channelFor(type, options && options.channel);
    let sent = 0;
    peers.forEach(record => { if(sendOn(record, channelId, type, body)) sent++; });
    return sent;
  }
  function sendTo(peerId, type, payload, options){
    const body = prepare(type, payload);
    const channelId = channelFor(type, options && options.channel);
    const record = Array.from(peers.values()).find(item => item.id === peerId || item.remoteId === peerId);
    return !!(record && sendOn(record, channelId, type, body));
  }
  function disconnectPeer(peerId, reason){
    if(role !== 'host') throw new Error('Only the P2P host can remove a peer');
    const record = Array.from(peers.values()).find(item => item.id === peerId || item.remoteId === peerId);
    if(!record) return false;
    // Give the reliable channel one event-loop turn to deliver the explanation
    // before closing both channels and the underlying peer connection.
    sendOn(record, DEFAULT_CHANNEL, 'net.kick', {peerId:record.remoteId||record.id,reason:String(reason || 'Removed by host').slice(0, 240)});
    setTimeout(() => {
      if(!peers.has(record.id)) return;
      try { CHANNELS.forEach(entry => {const item=slot(record,entry.id);if(item&&item.channel)item.channel.close();});record.pc.close(); } catch(err){}
      forget(record);
    }, 80);
    return true;
  }
  function pressure(channelId){
    const wanted = channelId && CHANNELS.some(entry => entry.id === channelId) ? channelId : null;
    let bufferedBytes = 0, queuedBytes = 0, queuedFrames = 0;
    peers.forEach(record => {
      CHANNELS.forEach(spec => {
        if(wanted && spec.id !== wanted) return;
        const entry = slot(record, spec.id);
        if(!entry) return;
        bufferedBytes += Number(entry.channel && entry.channel.bufferedAmount) || 0;
        queuedFrames += entry.outbox.length;
        entry.outbox.forEach(frame => { queuedBytes += typeof frame === 'string' ? frame.length : 0; });
      });
    });
    return Object.freeze({bufferedBytes, queuedBytes, queuedFrames, totalBytes:bufferedBytes + queuedBytes});
  }
  function waitForDrain(options){
    const config = Object.assign({channel:'reliable', maxBytes:512 * 1024, maxFrames:32, timeout:30000}, options || {});
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const inspect = () => {
        if(closed) return reject(new Error('P2P session closed while waiting for queued data'));
        const current = pressure(config.channel);
        if(current.totalBytes <= config.maxBytes && current.queuedFrames <= config.maxFrames) return resolve(current);
        if(Date.now() - started >= config.timeout) return reject(new Error('P2P channel stayed congested for more than ' + config.timeout + ' ms'));
        setTimeout(inspect, 20);
      };
      inspect();
    });
  }
  function setRole(nextRole){
    const wanted = String(nextRole || '');
    if(wanted !== 'host' && wanted !== 'guest') throw new Error('P2P role must be host or guest');
    if(role === wanted) return role;
    const previousRole = role;
    role = wanted;
    peers.forEach(record => {
      if(isOpen(record, DEFAULT_CHANNEL)){
        sendOn(record, DEFAULT_CHANNEL, 'system.hello', {
          name:String(opts.name || 'Lot King peer').slice(0, 80), role, protocol:PROTOCOL,
        });
      }
    });
    emit('state', {action:'role-changed', previousRole, nextRole:role});
    return role;
  }
  function setAuthority(epoch, hostPeerId){
    authorityEpoch = Math.max(1, Math.round(Number(epoch) || 1));
    authorityPeerId = String(hostPeerId || (role === 'host' ? selfId : '')).slice(0, 96);
    emit('state', {action:'authority-changed', epoch:authorityEpoch, hostPeerId:authorityPeerId});
    return Object.freeze({epoch:authorityEpoch, hostPeerId:authorityPeerId});
  }
  function close(){
    if(closed) return false;
    closed = true;
    peers.forEach(record => {
      try {
        CHANNELS.forEach(entry => {
          const item = slot(record, entry.id);
          if(item && item.channel) item.channel.close();
        });
        record.pc.close();
      } catch(err){}
    });
    peers.clear();
    chunks.clear();
    emit('state', {action:'session-closed'});
    return true;
  }

  /* -------------------------------------------------------------------------
     6. SIGNALLING - manual, out of band, no server
  ------------------------------------------------------------------------- */
  async function createInvite(){
    if(closed) throw new Error('P2P session is closed');
    role = 'host';
    authorityPeerId = selfId;
    const inviteId = uid('invite'), record = makeRecord(inviteId);
    // The host opens both channels; the guest receives them through ondatachannel.
    CHANNELS.forEach(entry => attachChannel(record, record.pc.createDataChannel(entry.label, entry.options)));
    await record.pc.setLocalDescription(await record.pc.createOffer());
    await waitIce(record.pc, opts.iceTimeout);
    emit('state', {action:'invite-created', inviteId});
    return encode({
      protocol:PROTOCOL, kind:'offer', createdAt:Date.now(), sessionId:activeSessionId,
      inviteId, hostId:selfId, description:descriptionOf(record.pc.localDescription),
    });
  }
  async function join(inviteCode){
    if(closed) throw new Error('P2P session is closed');
    const invite = parseSignal(inviteCode, 'offer');
    role = 'guest';
    authorityPeerId = String(invite.hostId || '');
    activeSessionId = invite.sessionId || activeSessionId;
    const record = makeRecord(invite.inviteId);
    record.remoteId = invite.hostId || null;
    await record.pc.setRemoteDescription(invite.description);
    await record.pc.setLocalDescription(await record.pc.createAnswer());
    await waitIce(record.pc, opts.iceTimeout);
    emit('state', {action:'answer-created', inviteId:invite.inviteId});
    return encode({
      protocol:PROTOCOL, kind:'answer', createdAt:Date.now(), sessionId:invite.sessionId,
      inviteId:invite.inviteId, peerId:selfId, description:descriptionOf(record.pc.localDescription),
    });
  }
  async function acceptAnswer(answerCode){
    const answer = parseSignal(answerCode, 'answer');
    if(String(answer.sessionId || '') !== String(activeSessionId || '')){
      throw new Error('This answer belongs to another P2P session; use the host window that created its invitation');
    }
    const record = peers.get(answer.inviteId);
    if(!record) throw new Error('This invitation is no longer pending. Create a fresh invitation without resetting the host session');
    record.remoteId = answer.peerId || record.remoteId;
    await record.pc.setRemoteDescription(answer.description);
    emit('state', {action:'answer-accepted', peerId:record.remoteId || record.id});
    return true;
  }

  /* -------------------------------------------------------------------------
     7. PUBLIC API
  ------------------------------------------------------------------------- */
  return Object.freeze({
    supported, state, subscribe, createInvite, join, acceptAnswer,
    send, sendTo, disconnectPeer, pressure, waitForDrain, setRole, setAuthority, close,
    protocol:PROTOCOL, channels:CHANNELS,
    isHost:() => role === 'host',
  });
}

root.LK_P2P_SESSION = Object.freeze({
  create, encode, decode, normalizeIceServers, protocol:PROTOCOL,
  DEFAULT_ICE_SERVERS, CHANNELS, TRANSPORT_FRAMES, FRAME_KINDS, frameKind,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_P2P_SESSION;

/* ---------------------------------------------------------------------------
   8. MODULE BOOTSTRAP

   Current HTML shells and js/editor/loader.js list this feature set statically.
   This bootstrap remains for older cached shells and tests/fixtures that load
   only the transport; it fills only genuinely missing siblings, in dependency
   order, resolved against THIS script's own URL.

   CANONICAL STATIC ORDER, for whoever wires the HTML. A ZIP export scans
   gameplay.html for <script src>, so those tags are what make an exported
   playable multiplayer-capable:
     1. js/runtime/p2p-protocol.js
     2. js/runtime/p2p-session.js              <- this file
     3. js/runtime/p2p-replication.js
     4. js/runtime/p2p-multiplayer-director.js
     5. js/logic/logic-templates-network.js    (after js/logic/logic-templates.js)
     6. js/runtime/p2p-multiplayer-level-template.js (after level-template-registry.js)
--------------------------------------------------------------------------- */
(function bootstrapModules(){
  if(typeof document === 'undefined' || !document.head) return;
  const self = document.currentScript && document.currentScript.src;
  if(!self) return;
  const base = self.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  const MODULES = [
    'p2p-protocol.js?v=0.7.8-session-monitor-1',
    'p2p-replication.js?v=0.7.8-host-migration-1',
    'p2p-multiplayer-director.js?v=0.7.8-session-lifetime-1',
    '../logic/logic-templates-network.js?v=0.7.8-session-lifetime-1',
    'p2p-multiplayer-level-template.js?v=0.7.8-session-lifetime-1',
  ];
  function already(name){
    const clean = name.replace(/[?#].*$/, '');
    const file = clean.replace('../', '').replace(/^.*\//, '');
    if(document.querySelector('script[data-lk-p2p-module="' + name + '"]')) return true;
    return Array.prototype.some.call(document.scripts, item => {
      const src = item.src && item.src.replace(/[?#].*$/, '');
      return !!src && src.slice(src.lastIndexOf('/') + 1) === file;
    });
  }
  function loadMissing(){
    MODULES.reduce((chain, name) => chain.then(() => new Promise(resolve => {
      if(already(name)) return resolve();
      const script = document.createElement('script');
      script.src = base + name;
      script.async = false;
      script.dataset.lkP2pModule = name;
      script.onload = () => resolve();
      script.onerror = () => { console.warn('LotKing P2P: optional module not loaded', name); resolve(); };
      document.head.appendChild(script);
    })), Promise.resolve());
  }
  // Wait until parser-blocking static tags are all visible. Running this from
  // the session tag itself races the following protocol/replication tags and
  // evaluates those modules twice. Old cached shells and the standalone P2P
  // harness still get every missing sibling immediately after DOM parsing.
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadMissing, {once:true});
  else loadMissing();
})();
})();
