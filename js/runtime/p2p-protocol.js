/* =========================================================
   LOT KING - P2P application protocol

   The single source of truth for everything that travels between two browsers
   on top of js/runtime/p2p-session.js. The transport there only knows about
   frames; this module knows about *meaning*: which message types exist, in
   which phase of a session they are legal, which side is allowed to send them,
   which data channel carries them and what a valid payload looks like.

   Read order (and the order of the numbered sections below):
     1. Limits and quantization constants
     2. Value guards used by every validator
     3. Quantization codec (position / rotation / velocity -> integers)
     4. MESSAGE_TYPES - one table, grouped and numbered by session phase
     5. Lookup, authority and validation entry points
     6. Public API

   Netcode references behind the design decisions:
     - Gaffer On Games, "State Synchronization" and "Snapshot Compression":
       quantize on BOTH sides, send integer records, use a priority accumulator
       and a byte budget instead of a full world snapshot per packet.
       https://gafferongames.com/post/state_synchronization/
     - Gaffer On Games, "Snapshot Interpolation": the receiver buffers snapshots
       and renders in the past; send rate is decoupled from frame rate.
       https://gafferongames.com/post/snapshot_interpolation/
     - Valve, "Source Multiplayer Networking": entity interpolation with a fixed
       playout delay (cl_interp default 0.1 s) between the last two snapshots.
     - MDN / web.dev RTCDataChannel: {ordered:false, maxRetransmits:0} for state,
       {ordered:true} reliable for events. Two channels, never one.

   SECURITY NOTE. Every payload here arrives from an untrusted remote browser.
   Nothing in this file trusts a field: each validator returns a NEW object built
   from clamped primitives, so a hostile peer cannot smuggle prototypes,
   functions, oversized arrays or NaN into the engine. An unknown message type is
   REJECTED BY THROWING - it is never defaulted, guessed or silently dropped.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;

/* ---------------------------------------------------------------------------
   1. LIMITS AND QUANTIZATION CONSTANTS
   Every hard number the protocol enforces lives here, nowhere else.
--------------------------------------------------------------------------- */
const PROTOCOL_VERSION = 3;
const LIMITS = Object.freeze({
  nameChars:48,
  textChars:280,
  channelChars:96,
  reasonChars:120,
  idChars:96,
  maxPlayers:8,
  maxRecordsPerSnapshot:64,
  maxRosterEntries:8,
  maxEventPayloadChars:8 * 1024,
  maxProjectPayloadChars:64 * 1024 * 1024,
  maxCoworkSnapshotChars:256 * 1024 * 1024,
  maxCoworkSnapshotChunkChars:192 * 1024,
  maxCoworkSnapshotChunks:2048,
  maxCoworkObjectChars:4 * 1024 * 1024,
  maxTeams:4,
});

const QUANTIZE = Object.freeze({
  // 1 mm. Gaffer recommends ~4096 steps per metre for state synchronization;
  // 1000 steps per metre is the same order and keeps the integers short in JSON.
  positionScale:1000,
  positionRange:8000 * 1000,
  // Quaternion components live in [-1, 1]; int16 is the classic budget.
  rotationScale:32767,
  // 1 cm/s, capped at 100 m/s (360 km/h) which is above every Lot King pawn.
  velocityScale:100,
  velocityRange:100 * 100,
});

/** [0] netId, [1..3] position, [4..7] quaternion, [8..10] velocity, [11] flags.
 *  Fixed length so the decoder never allocates a variable-shaped object. */
const STATE_RECORD_LENGTH = 12;
const STATE_FLAGS = Object.freeze({
  grounded:1,
  moving:2,
  sprinting:4,
  airborne:8,
  firing:16,
  hidden:32,
});

/* ---------------------------------------------------------------------------
   2. VALUE GUARDS
   Small, total functions. Each one turns anything at all into a safe value of
   the expected type; none of them can throw on hostile input.
--------------------------------------------------------------------------- */
function finite(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function integer(value, min, max){ return Math.round(clamp(value, min, max)); }
function text(value, maxChars, fallback){
  const raw = value == null ? '' : String(value);
  const trimmed = raw.slice(0, Math.max(0, maxChars));
  return trimmed || (fallback == null ? '' : String(fallback));
}
function flag(value){ return value === true; }
function identifier(value){ return text(value, LIMITS.idChars).replace(/[^A-Za-z0-9._:\-]/g, ''); }
function list(value, maxLength){
  return Array.isArray(value) ? value.slice(0, Math.max(0, maxLength)) : [];
}
/** JSON payloads authored in a Logic graph are arbitrary but must stay small and
 *  free of prototype pollution. Re-parsing through JSON is the cheapest way to
 *  guarantee a plain, cycle-free, function-free value of a bounded size. */
function plainJson(value, maxChars){
  if(value == null) return null;
  let encoded;
  try { encoded = JSON.stringify(value); }
  catch(err){ throw protocolError('payload is not JSON serialisable'); }
  if(typeof encoded !== 'string') return null;
  if(encoded.length > maxChars) throw protocolError('payload exceeds ' + maxChars + ' characters');
  const parsed = JSON.parse(encoded);
  if(parsed && typeof parsed === 'object' && !Array.isArray(parsed)) delete parsed.__proto__;
  return parsed;
}
function protocolError(message){
  const error = new Error('Lot King P2P protocol: ' + message);
  error.name = 'LotKingProtocolError';
  error.protocolError = true;
  return error;
}

/* ---------------------------------------------------------------------------
   3. QUANTIZATION CODEC
   Both sides quantize, exactly as Gaffer's State Synchronization requires: the
   sender transmits what it also stores locally, so sender and receiver
   extrapolate from bit-identical values and cannot slowly drift apart.
--------------------------------------------------------------------------- */
function encodePosition(value){ return integer(value * QUANTIZE.positionScale, -QUANTIZE.positionRange, QUANTIZE.positionRange); }
function decodePosition(value){ return integer(value, -QUANTIZE.positionRange, QUANTIZE.positionRange) / QUANTIZE.positionScale; }
function encodeRotation(value){ return integer(clamp(value, -1, 1) * QUANTIZE.rotationScale, -QUANTIZE.rotationScale, QUANTIZE.rotationScale); }
function decodeRotation(value){ return integer(value, -QUANTIZE.rotationScale, QUANTIZE.rotationScale) / QUANTIZE.rotationScale; }
function encodeVelocity(value){ return integer(value * QUANTIZE.velocityScale, -QUANTIZE.velocityRange, QUANTIZE.velocityRange); }
function decodeVelocity(value){ return integer(value, -QUANTIZE.velocityRange, QUANTIZE.velocityRange) / QUANTIZE.velocityScale; }

/** Writes a pawn sample into `out` (a reusable array) with zero allocation. */
function encodeStateRecord(out, netId, position, quaternion, velocity, flags){
  out[0] = integer(netId, 0, 0xffff);
  out[1] = encodePosition(position ? position.x : 0);
  out[2] = encodePosition(position ? position.y : 0);
  out[3] = encodePosition(position ? position.z : 0);
  out[4] = encodeRotation(quaternion ? quaternion.x : 0);
  out[5] = encodeRotation(quaternion ? quaternion.y : 0);
  out[6] = encodeRotation(quaternion ? quaternion.z : 0);
  out[7] = encodeRotation(quaternion ? quaternion.w : 1);
  out[8] = encodeVelocity(velocity ? velocity.x : 0);
  out[9] = encodeVelocity(velocity ? velocity.y : 0);
  out[10] = encodeVelocity(velocity ? velocity.z : 0);
  out[11] = integer(flags, 0, 0xffff);
  return out;
}
/** Decodes into `sample` (a reusable object) with zero allocation. Returns null
 *  when the record is not a well-formed fixed-length integer tuple. */
function decodeStateRecord(sample, record){
  if(!Array.isArray(record) || record.length !== STATE_RECORD_LENGTH) return null;
  sample.netId = integer(record[0], 0, 0xffff);
  sample.px = decodePosition(record[1]);
  sample.py = decodePosition(record[2]);
  sample.pz = decodePosition(record[3]);
  sample.qx = decodeRotation(record[4]);
  sample.qy = decodeRotation(record[5]);
  sample.qz = decodeRotation(record[6]);
  sample.qw = decodeRotation(record[7]);
  sample.vx = decodeVelocity(record[8]);
  sample.vy = decodeVelocity(record[9]);
  sample.vz = decodeVelocity(record[10]);
  sample.flags = integer(record[11], 0, 0xffff);
  return sample;
}
function createStateSample(){
  return {netId:0, px:0, py:0, pz:0, qx:0, qy:0, qz:0, qw:1, vx:0, vy:0, vz:0, flags:0};
}
/** Declared bandwidth accounting: a record is 12 integers rendered as JSON. */
function estimateRecordBytes(){ return 72; }

/* ---------------------------------------------------------------------------
   4. MESSAGE_TYPES - ONE TABLE, GROUPED AND NUMBERED BY SESSION PHASE

   Phases are listed in the order a session walks through them. Nothing outside
   this table may invent a message string; every module asks for a constant.

     PHASE 1  HANDSHAKE  - a browser announces itself and is admitted or refused
     PHASE 2  LOBBY      - roster, configuration, readiness, match start
     PHASE 3  STATE      - the high-frequency, lossy transform stream
     PHASE 4  EVENT      - reliable gameplay facts: spawns, variables, events
     PHASE 5  COWORKING  - the editor extension of PHASE 4 (authoring, not play)
     PHASE 6  CLOSURE    - orderly and forced departures

   Columns:
     phase    numbered phase above
     channel  'state'    -> unordered / unreliable RTCDataChannel
              'reliable' -> ordered / reliable RTCDataChannel
     sender   who is allowed to originate it. The receiver enforces this, which
              is what makes the session host-authoritative: a guest that sends a
              'host' message is rejected, not obeyed.
     validate returns a fresh, clamped payload or throws.
--------------------------------------------------------------------------- */
const PHASES = Object.freeze([
  Object.freeze({index:1, id:'handshake', label:'Handshake'}),
  Object.freeze({index:2, id:'lobby', label:'Lobby'}),
  Object.freeze({index:3, id:'state', label:'State'}),
  Object.freeze({index:4, id:'event', label:'Event'}),
  Object.freeze({index:5, id:'coworking', label:'Coworking'}),
  Object.freeze({index:6, id:'closure', label:'Closure'}),
]);
const CHANNELS = Object.freeze({state:'state', reliable:'reliable'});
const SENDERS = Object.freeze({host:'host', guest:'guest', any:'any'});
const SESSION_MODES = Object.freeze(['co-op', 'versus', 'free-roam']);

const MESSAGE_TYPES = Object.freeze([
  // ------------------------------------------------------- PHASE 1 HANDSHAKE
  {type:'net.hello', phase:1, channel:CHANNELS.reliable, sender:SENDERS.guest,
    describe:'Guest announces itself to the host and asks for a player slot.',
    validate:p => ({
      name:text(p && p.name, LIMITS.nameChars, 'Player'),
      protocolVersion:integer(p && p.protocolVersion, 0, 999),
      color:text(p && p.color, 16, '#7dd3fc'),
    })},
  {type:'net.welcome', phase:1, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host admits a guest and hands out its authoritative player id.',
    validate:p => ({
      playerId:integer(p && p.playerId, 1, LIMITS.maxPlayers),
      netId:integer(p && p.netId, 1, 0xffff),
      team:integer(p && p.team, 0, LIMITS.maxTeams),
      config:validateSessionConfig(p && p.config),
    })},
  {type:'net.reject', phase:1, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host refuses a guest: session full, wrong protocol or closed lobby.',
    validate:p => ({
      code:text(p && p.code, 32, 'refused'),
      reason:text(p && p.reason, LIMITS.reasonChars, 'The host refused the connection'),
    })},
  // ----------------------------------------------------------- PHASE 2 LOBBY
  {type:'net.config', phase:2, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Authoritative session configuration, authored in the editor.',
    validate:p => validateSessionConfig(p)},
  {type:'net.roster', phase:2, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Full player list. The host is the only writer of the roster.',
    validate:p => ({
      players:list(p && p.players, LIMITS.maxRosterEntries).map(validateRosterEntry),
    })},
  {type:'net.hostMigration', phase:2, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Deterministic authority hand-off after the current host disappears.',
    validate:p => ({
      epoch:integer(p && p.epoch, 1, Number.MAX_SAFE_INTEGER),
      hostPeerId:identifier(p && p.hostPeerId),
      previousHostPeerId:identifier(p && p.previousHostPeerId),
      players:list(p && p.players, LIMITS.maxRosterEntries).map(validateRosterEntry),
      config:validateSessionConfig(p && p.config),
      started:flag(p && p.started),
      tick:integer(p && p.tick, 0, 0xffffffff),
    })},
  {type:'net.ready', phase:2, channel:CHANNELS.reliable, sender:SENDERS.guest,
    describe:'Guest toggles its own readiness flag in the lobby.',
    validate:p => ({ready:flag(p && p.ready)})},
  {type:'net.start', phase:2, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host starts the match and seeds every deterministic system.',
    validate:p => ({
      startedAt:integer(p && p.startedAt, 0, Number.MAX_SAFE_INTEGER),
      seed:integer(p && p.seed, 0, 0xffffffff),
    })},

  // ----------------------------------------------------------- PHASE 3 STATE
  {type:'net.snapshot', phase:3, channel:CHANNELS.state, sender:SENDERS.host,
    describe:'Host transform stream. Partial by design: a tick carries only the records that fit the byte budget.',
    validate:p => ({
      tick:integer(p && p.tick, 0, 0xffffffff),
      time:integer(p && p.time, 0, Number.MAX_SAFE_INTEGER),
      records:validateStateRecords(p && p.records),
    })},
  {type:'net.move', phase:3, channel:CHANNELS.state, sender:SENDERS.guest,
    describe:'Guest reports the state of the avatars it owns. The host re-checks ownership before relaying.',
    validate:p => ({
      tick:integer(p && p.tick, 0, 0xffffffff),
      records:validateStateRecords(p && p.records),
    })},
  {type:'net.ack', phase:3, channel:CHANNELS.state, sender:SENDERS.any,
    describe:'Newest tick a peer has applied. Feeds the round-trip estimate and the delta baseline.',
    validate:p => ({
      tick:integer(p && p.tick, 0, 0xffffffff),
      echo:integer(p && p.echo, 0, Number.MAX_SAFE_INTEGER),
    })},

  // ----------------------------------------------------------- PHASE 4 EVENT
  {type:'net.event', phase:4, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Reliable gameplay event addressed to a Logic channel.',
    validate:p => ({
      channel:text(p && p.channel, LIMITS.channelChars, 'gameplay'),
      payload:plainJson(p && p.payload, LIMITS.maxEventPayloadChars),
    })},
  {type:'net.spawn', phase:4, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host tells everyone that a replicated avatar now exists.',
    validate:p => ({
      netId:integer(p && p.netId, 1, 0xffff),
      playerId:integer(p && p.playerId, 1, LIMITS.maxPlayers),
      name:text(p && p.name, LIMITS.nameChars, 'Player'),
      team:integer(p && p.team, 0, LIMITS.maxTeams),
      prefabId:identifier(p && p.prefabId),
      spawnId:identifier(p && p.spawnId),
    })},
  {type:'net.despawn', phase:4, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host removes a replicated avatar.',
    validate:p => ({netId:integer(p && p.netId, 1, 0xffff)})},
  {type:'net.var', phase:4, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host publishes one replicated Logic variable to every peer.',
    validate:p => ({
      name:identifier(p && p.name),
      value:plainJson(p && p.value, LIMITS.maxEventPayloadChars),
    })},
  {type:'net.chat', phase:4, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Plain text line shown in the multiplayer HUD.',
    validate:p => ({text:text(p && p.text, LIMITS.textChars)})},

  // ------------------------------------------------------- PHASE 5 COWORKING
  {type:'cowork.presence', phase:5, channel:CHANNELS.state, sender:SENDERS.any,
    describe:'Editor presence beacon: display name, colour, viewport cursor and current selection.',
    validate:p => ({
      name:text(p && p.name, LIMITS.nameChars, 'Editor'),
      color:text(p && p.color, 16, '#7dd3fc'),
      // Normalised viewport coordinates, so a cursor is meaningful on any
      // window size and no camera has to be shared between editors.
      u:clamp(p && p.u, -1, 2),
      v:clamp(p && p.v, -1, 2),
      selectionId:identifier(p && p.selectionId),
      selectionName:text(p && p.selectionName, LIMITS.nameChars),
    })},
  {type:'cowork.authority', phase:5, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host names the single peer allowed to publish authoring changes.',
    validate:p => ({peerId:identifier(p && p.peerId)})},
  {type:'cowork.request', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'A peer asks the host for edit control.',
    validate:p => ({name:text(p && p.name, LIMITS.nameChars, 'Editor')})},
  {type:'cowork.claim', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Soft lock on one scene object, so two editors cannot drag the same node.',
    validate:p => ({
      objectId:identifier(p && p.objectId),
      release:flag(p && p.release),
    })},
  {type:'cowork.lock.request', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Requests or releases a temporary edit lease for one persistent scene object.',
    validate:p => ({
      objectId:identifier(p && p.objectId),
      surface:text(p && p.surface, 48, 'object'),
      release:flag(p && p.release),
      name:text(p && p.name, LIMITS.nameChars, 'Editor'),
    })},
  {type:'cowork.lock.state', phase:5, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host-arbitrated owner and lease state for one scene object.',
    validate:p => ({
      objectId:identifier(p && p.objectId),
      ownerPeerId:identifier(p && p.ownerPeerId),
      ownerName:text(p && p.ownerName, LIMITS.nameChars),
      surface:text(p && p.surface, 48),
      leaseMs:integer(p && p.leaseMs, 0, 15000),
      version:integer(p && p.version, 0, Number.MAX_SAFE_INTEGER),
    })},
  {type:'cowork.patch', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Fine-grained authoring change for one object: far cheaper than republishing the project.',
    validate:p => ({
      objectId:identifier(p && p.objectId),
      revision:integer(p && p.revision, 0, Number.MAX_SAFE_INTEGER),
      transform:validateTransformPatch(p && p.transform),
      name:text(p && p.name, LIMITS.nameChars),
      visible:p && p.visible == null ? null : flag(p && p.visible),
      authorPeerId:identifier(p && p.authorPeerId),
    })},
  {type:'cowork.object', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Reliable authored object state for Inspector, Pawn Studio and Cinema Studio edits.',
    validate:p => ({
      objectId:identifier(p && p.objectId),
      revision:integer(p && p.revision, 0, Number.MAX_SAFE_INTEGER),
      authorPeerId:identifier(p && p.authorPeerId),
      entry:plainJson(p && p.entry, LIMITS.maxCoworkObjectChars),
    })},
  {type:'cowork.delete', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Deletes one added scene object while its author still owns the edit lease.',
    validate:p => ({
      objectId:identifier(p && p.objectId),
      revision:integer(p && p.revision, 0, Number.MAX_SAFE_INTEGER),
      authorPeerId:identifier(p && p.authorPeerId),
    })},
  {type:'cowork.save', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Asks every connected editor to persist its already-synchronised local project copy.',
    validate:p => ({
      revision:integer(p && p.revision, 0, Number.MAX_SAFE_INTEGER),
      name:text(p && p.name, LIMITS.nameChars, 'Cowork save'),
      authorPeerId:identifier(p && p.authorPeerId),
    })},
  {type:'cowork.snapshot', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Whole portable project. Never applied without an explicit local confirmation.',
    validate:p => ({
      name:text(p && p.name, LIMITS.nameChars, 'Collaboration project'),
      project:plainJson(p && p.project, LIMITS.maxProjectPayloadChars),
    })},
  {type:'cowork.snapshot.begin', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Starts a bounded, application-chunked portable project transfer.',
    validate:p => ({
      transferId:identifier(p && p.transferId),
      name:text(p && p.name, LIMITS.nameChars, 'Collaboration project'),
      totalChars:integer(p && p.totalChars, 1, LIMITS.maxCoworkSnapshotChars),
      totalChunks:integer(p && p.totalChunks, 1, LIMITS.maxCoworkSnapshotChunks),
      checksum:text(p && p.checksum, 16),
    })},
  {type:'cowork.snapshot.chunk', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'One ordered slice of a portable project snapshot.',
    validate:p => ({
      transferId:identifier(p && p.transferId),
      index:integer(p && p.index, 0, LIMITS.maxCoworkSnapshotChunks - 1),
      data:text(p && p.data, LIMITS.maxCoworkSnapshotChunkChars),
    })},
  {type:'cowork.snapshot.commit', phase:5, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'Commits a complete portable project transfer after size and checksum verification.',
    validate:p => ({
      transferId:identifier(p && p.transferId),
      totalChars:integer(p && p.totalChars, 1, LIMITS.maxCoworkSnapshotChars),
      totalChunks:integer(p && p.totalChunks, 1, LIMITS.maxCoworkSnapshotChunks),
      checksum:text(p && p.checksum, 16),
    })},

  // --------------------------------------------------------- PHASE 6 CLOSURE
  {type:'net.leave', phase:6, channel:CHANNELS.reliable, sender:SENDERS.any,
    describe:'A peer announces it is leaving on purpose.',
    validate:p => ({reason:text(p && p.reason, LIMITS.reasonChars, 'left the session')})},
  {type:'net.kick', phase:6, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host removes a peer from the session.',
    validate:p => ({
      peerId:identifier(p && p.peerId),
      reason:text(p && p.reason, LIMITS.reasonChars, 'removed by the host'),
    })},
  {type:'net.bye', phase:6, channel:CHANNELS.reliable, sender:SENDERS.host,
    describe:'Host closes the whole session.',
    validate:p => ({reason:text(p && p.reason, LIMITS.reasonChars, 'session closed')})},
].map(Object.freeze));

/* --- validators shared by more than one row of the table above ------------ */
function validateSessionConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  const mode = text(src.mode, 24);
  return {
    mode:SESSION_MODES.indexOf(mode) >= 0 ? mode : SESSION_MODES[0],
    maxPlayers:integer(src.maxPlayers == null ? 4 : src.maxPlayers, 2, LIMITS.maxPlayers),
    tickRate:integer(src.tickRate == null ? 20 : src.tickRate, 5, 60),
    interpolationDelay:clamp(src.interpolationDelay == null ? .1 : src.interpolationDelay, .02, .5),
    bandwidthBudget:integer(src.bandwidthBudget == null ? 24 : src.bandwidthBudget, 4, 256),
    friendlyFire:flag(src.friendlyFire),
    teams:integer(src.teams == null ? 0 : src.teams, 0, LIMITS.maxTeams),
    sessionName:text(src.sessionName, LIMITS.nameChars, 'Lot King session'),
  };
}
function validateRosterEntry(source){
  const src = source && typeof source === 'object' ? source : {};
  return {
    peerId:identifier(src.peerId),
    playerId:integer(src.playerId, 1, LIMITS.maxPlayers),
    netId:integer(src.netId, 1, 0xffff),
    name:text(src.name, LIMITS.nameChars, 'Player'),
    color:text(src.color, 16, '#7dd3fc'),
    team:integer(src.team, 0, LIMITS.maxTeams),
    ready:flag(src.ready),
    host:flag(src.host),
    latency:integer(src.latency, 0, 5000),
  };
}
function validateStateRecords(source){
  const rows = list(source, LIMITS.maxRecordsPerSnapshot);
  const out = [];
  for(let index = 0; index < rows.length; index++){
    const row = rows[index];
    if(!Array.isArray(row) || row.length !== STATE_RECORD_LENGTH) continue;
    const record = new Array(STATE_RECORD_LENGTH);
    for(let slot = 0; slot < STATE_RECORD_LENGTH; slot++) record[slot] = integer(row[slot], -0x7fffffff, 0x7fffffff);
    out.push(record);
  }
  return out;
}
function validateTransformPatch(source){
  if(!source || typeof source !== 'object') return null;
  const axis = (value, fallback) => [
    clamp(value && value[0], -1e6, 1e6),
    clamp(value && value[1], -1e6, 1e6),
    clamp(value && value[2], -1e6, 1e6),
  ].map(item => Number.isFinite(item) ? item : fallback);
  return {
    p:axis(source.p, 0),
    r:axis(source.r, 0),
    s:axis(source.s, 1),
    v:source.v == null ? true : flag(source.v),
  };
}

/* ---------------------------------------------------------------------------
   5. LOOKUP, AUTHORITY AND VALIDATION
   The only ways into the table. `describe` throws on an unknown type: a message
   the protocol does not define has no safe default, so it must never be guessed.
--------------------------------------------------------------------------- */
const BY_TYPE = new Map(MESSAGE_TYPES.map(entry => [entry.type, entry]));
const TYPE = Object.freeze(MESSAGE_TYPES.reduce((out, entry) => {
  out[entry.type.replace(/[.\-]([a-z])/g, (all, chr) => chr.toUpperCase())] = entry.type;
  return out;
}, {}));

function has(type){ return BY_TYPE.has(String(type)); }
/** @throws when `type` is not in MESSAGE_TYPES. Callers that legitimately deal
 *  with foreign traffic must test `has()` first and reject explicitly. */
function describe(type){
  const entry = BY_TYPE.get(String(type));
  if(!entry) throw protocolError('unknown message type "' + String(type).slice(0, 64) + '"');
  return entry;
}
function typesOfPhase(phaseIndex){
  return MESSAGE_TYPES.filter(entry => entry.phase === Number(phaseIndex)).map(entry => entry.type);
}
function channelOf(type){ return describe(type).channel; }
function senderOf(type){ return describe(type).sender; }
function isHostAuthoritative(type){ return senderOf(type) === SENDERS.host; }

function validateAuthorityEnvelope(source, body){
  const src = source && typeof source === 'object' ? source : {};
  body.epoch = integer(src.epoch, 1, Number.MAX_SAFE_INTEGER);
  body.hostPeerId = identifier(src.hostPeerId);
  return body;
}

/** True when `senderRole` ('host' | 'guest') may originate `type`.
 *  This single predicate is what enforces host authority on the wire. */
function maySend(type, senderRole){
  const entry = describe(type);
  if(entry.sender === SENDERS.any) return true;
  return entry.sender === String(senderRole);
}

/** Validate an inbound message. Returns a brand new, clamped payload.
 *  @throws on an unknown type or on a payload the sender is not allowed to send. */
function validateInbound(type, payload, senderRole){
  const entry = describe(type);
  if(senderRole != null && !maySend(type, senderRole)){
    throw protocolError('"' + entry.type + '" may only be sent by the ' + entry.sender + ', not by a ' + String(senderRole));
  }
  const body = entry.validate(payload);
  return entry.sender === SENDERS.host ? validateAuthorityEnvelope(payload, body) : body;
}
/** Validate an outbound message before it reaches the transport, so a local bug
 *  is caught here instead of becoming a remote peer's problem. */
function validateOutbound(type, payload){
  const entry = describe(type);
  const body = entry.validate(payload);
  return entry.sender === SENDERS.host ? validateAuthorityEnvelope(payload, body) : body;
}

/* ---------------------------------------------------------------------------
   6. PUBLIC API
--------------------------------------------------------------------------- */
const api = Object.freeze({
  PROTOCOL_VERSION, LIMITS, QUANTIZE, PHASES, CHANNELS, SENDERS, SESSION_MODES,
  STATE_RECORD_LENGTH, STATE_FLAGS, MESSAGE_TYPES, TYPE,
  has, describe, typesOfPhase, channelOf, senderOf, isHostAuthoritative, maySend, validateInbound, validateOutbound,
  validateSessionConfig, validateRosterEntry,
  encodePosition, decodePosition, encodeRotation, decodeRotation, encodeVelocity, decodeVelocity,
  encodeStateRecord, decodeStateRecord, createStateSample, estimateRecordBytes,
  protocolError,
});

root.LK_P2P_PROTOCOL = api;
if(typeof module !== 'undefined' && module.exports) module.exports = api;
})();
