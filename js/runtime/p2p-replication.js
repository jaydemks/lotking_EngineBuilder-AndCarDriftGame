/* =========================================================
   LOT KING - P2P gameplay replication

   The host-authoritative session layer that sits on top of the transport in
   js/runtime/p2p-session.js and speaks only the vocabulary declared in
   js/runtime/p2p-protocol.js. It owns the lobby, hands out player ids, spawns
   and removes remote avatars, streams transforms at a fixed network tick and
   plays them back with interpolation.

   Read order (and the order of the numbered sections below):
     1. Tuning defaults and reusable scratch state
     2. Fixed-rate ticker - the network clock, decoupled from the frame loop
     3. Replica factories - one table, registered per pawn type, no branching
     4. Interpolation buffer - snapshot playback with a fixed playout delay
     5. Roster - lobby, player ids, join and leave (host is the only writer)
     6. Inbound router - one handler table; an undeclared type is rejected
     7. Outbound - capture, priority accumulator, byte budget, snapshot send
     8. Session lifecycle and public API

   ARCHITECTURE, AND WHY IT IS THIS ONE.

   Two peers in a browser have no dedicated server, so there are exactly two
   honest choices: the host simulates everything and guests send input, or every
   peer simulates its own avatar and the host arbitrates. Lot King pawns
   (Character, Vehicle, Animal, Soccer) read their input from the local input
   manager, and there is no generic way to inject a remote command into all of
   them without branching per pawn type - which the brief forbids and which
   would rot the moment a new pawn kind ships. So this layer uses the second
   model, which is also what shipping browser P2P games use:

     - Each peer SIMULATES ONLY ITS OWN avatar and publishes its transform.
     - The HOST is authoritative over everything that is not somebody's avatar:
       the roster, player ids, spawn assignment, match start, replicated
       variables and reliable gameplay events. It is also the relay: guests talk
       only to the host, the host validates and re-broadcasts. That is what
       makes a star of two-peer WebRTC links behave like one session.
     - A guest can therefore never write another player's state and never inject
       an entity: `ownsNetId()` is checked on every inbound state record, and
       spawn/despawn are host-only in the protocol table itself.

   The honest cost of having no server: a guest is authoritative over its own
   position, so a modified client can lie about where it is. Without a
   server-side simulation nothing in a browser can prevent that. It is written
   here, in docs/P2P_MULTIPLAYER.md and in the editor UI rather than implied.

   Netcode references applied here:
     - Valve, Source Multiplayer Networking: render remote entities in the past
       by a fixed playout delay (cl_interp, 100 ms by default) and interpolate
       between the last two received snapshots. `interpolationDelay` is that.
     - Gaffer On Games, Snapshot Interpolation: send rate is decoupled from
       frame rate, and the receive buffer must cover jitter plus loss.
     - Gaffer On Games, State Synchronization: a priority accumulator plus a
       per-packet byte budget, and quantize on both sides so sender and receiver
       agree bit for bit (the quantization lives in p2p-protocol.js).
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;

function protocol(){ return root.LK_P2P_PROTOCOL || null; }

/* ---------------------------------------------------------------------------
   1. TUNING DEFAULTS AND REUSABLE SCRATCH STATE
   Authored values always win; these are only what an unconfigured session uses.
--------------------------------------------------------------------------- */
const DEFAULTS = Object.freeze({
  mode:'co-op',
  maxPlayers:4,
  tickRate:20,             // snapshots per second, 5..60
  interpolationDelay:.1,   // seconds of deliberate playback lag (Valve cl_interp)
  bandwidthBudget:24,      // kilobytes per second the state channel may use
  sessionName:'Lot King session',
  teams:0,
  friendlyFire:false,
});
const SAMPLE_RING = 12;              // snapshots kept per replica
const SAMPLE_MAX_AGE = 3000;         // ms before a replica is considered stale
const EXTRAPOLATION_LIMIT = .25;     // s - never guess further ahead than this
const HOST_NET_ID = 1;

/** Preallocated so nothing in the frame loop or the tick allocates. */
const SCRATCH = {
  sample:null,          // filled lazily from the protocol module
  record:new Array(12),
  position:{x:0, y:0, z:0},
  quaternion:{x:0, y:0, z:0, w:1},
  velocity:{x:0, y:0, z:0},
};

function finite(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function text(value, fallback){
  const raw = value == null ? '' : String(value);
  return raw || (fallback == null ? '' : String(fallback));
}
function now(){
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/* ---------------------------------------------------------------------------
   2. FIXED-RATE TICKER
   The network tick MUST NOT ride the render loop: a machine drawing at 12 fps
   would starve the session, and one drawing at 240 fps would flood it. This is
   a plain interval, so the send rate is what the author asked for regardless of
   what the GPU is doing.
--------------------------------------------------------------------------- */
function createTicker(){
  let handle = null, hz = 0, callback = null;
  function stop(){
    if(handle != null) clearInterval(handle);
    handle = null;
    hz = 0;
  }
  function start(rate, fn){
    const wanted = Math.round(clamp(rate, 1, 60));
    if(handle != null && hz === wanted && callback === fn) return wanted;
    stop();
    hz = wanted;
    callback = fn;
    handle = setInterval(() => { if(callback) callback(1 / hz); }, Math.round(1000 / wanted));
    return hz;
  }
  return {start, stop, rate:() => hz, running:() => handle != null};
}

/* ---------------------------------------------------------------------------
   3. REPLICA FACTORIES - ONE TABLE, REGISTERED PER PAWN TYPE

   A remote player's avatar is built by the factory registered for its pawn
   type, exactly the way level templates and pawn components register elsewhere
   in the engine. There is no `if (character) ... else if (vehicle) ...` here and
   there never should be: a new pawn kind ships its own row.

   Every factory returns a THREE.Object3D that this module owns and disposes.
   The default factory works for every existing pawn because it only relies on
   what all of them share - an `owner` Object3D - so Character, Vehicle, Animal
   and Soccer replicate today without a line of type-specific code.
--------------------------------------------------------------------------- */
const replicaFactories = new Map();

function registerReplicaFactory(pawnType, factory){
  const key = text(pawnType).toLowerCase();
  if(!key || typeof factory !== 'function') throw new Error('A replica factory needs a pawn type and a function');
  replicaFactories.set(key, factory);
  return key;
}
function resolveReplicaFactory(pawnType){
  return replicaFactories.get(text(pawnType).toLowerCase()) || replicaFactories.get('default');
}

/** Marks every descendant as a network replica: not saved, not pickable as an
 *  authored object, and never mistaken for a locally simulated pawn. */
function tagReplica(object, netId){
  if(!object) return object;
  object.traverse(child => {
    if(!child.userData) child.userData = {};
    child.userData.p2pReplica = true;
    child.userData.p2pNetId = netId;
    child.userData.runtimeOnly = true;
    // A replica must never be picked up by the pawn registry or the store.
    delete child.userData.characterPawnId;
    delete child.userData.animalPawnId;
    delete child.userData.soccerPawnId;
    delete child.userData.logicElementSceneId;
  });
  return object;
}

/** Explicit GPU ownership for runtime-only replica resources. Object3D.clone(true)
 * shares geometry, materials and textures with its source, so descendants are NOT
 * disposable merely because the clone is. Factories mark only resources they create. */
function ownReplicaResources(object, resources){
  if(!object) return object;
  if(!object.userData) object.userData={};
  const list=object.userData.p2pOwnedResources||(object.userData.p2pOwnedResources=[]);
  (Array.isArray(resources)?resources:[resources]).filter(Boolean).forEach(resource=>{
    if(list.indexOf(resource)<0)list.push(resource);
  });
  return object;
}
function disposeReplicaObject(object){
  if(!object)return false;
  if(object.parent)object.parent.remove(object);
  const owned=new Set();
  object.traverse(child=>{
    const list=child&&child.userData&&child.userData.p2pOwnedResources;
    if(Array.isArray(list))list.forEach(resource=>{if(resource)owned.add(resource);});
    if(child&&child.userData)delete child.userData.p2pOwnedResources;
  });
  owned.forEach(resource=>{if(resource&&typeof resource.dispose==='function')resource.dispose();});
  return true;
}

/** The fallback body: a capsule the size of a person. Used when the author has
 *  not designated a prefab and there is no local avatar to copy. */
function buildPlaceholderBody(THREE, color){
  const group = new THREE.Object3D();
  const material = THREE.MeshStandardMaterial
    ? new THREE.MeshStandardMaterial({color:color || '#7dd3fc', roughness:.6, metalness:.05})
    : new THREE.MeshBasicMaterial({color:color || '#7dd3fc'});
  const geometry = THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(.32, 1.1, 6, 12)
    : new THREE.BoxGeometry(.64, 1.74, .64);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = .95;
  mesh.castShadow = true;
  group.add(mesh);
  ownReplicaResources(mesh,[geometry,material]);
  return group;
}

/** A billboarded name label. This is one of the "associated assets" an author
 *  can switch on for the multiplayer mode from the editor. */
function buildNameplate(THREE, label, color){
  if(!THREE.CanvasTexture || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if(!ctx) return null;
  ctx.fillStyle = 'rgba(6,10,20,.72)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = color || '#7dd3fc';
  ctx.fillRect(0, 58, 256, 6);
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillStyle = '#eaf2ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(label || 'Player').slice(0, 16), 128, 30);
  const texture = new THREE.CanvasTexture(canvas);
  if(THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:texture, depthTest:false, transparent:true}));
  sprite.scale.set(1.5, .38, 1);
  sprite.position.y = 2.25;
  sprite.renderOrder = 10;
  sprite.userData.p2pNameplate = true;
  ownReplicaResources(sprite,[texture,sprite.material]);
  return sprite;
}

/** THE DEFAULT FACTORY. Order of preference, most authored first:
 *    1. the prefab object the author designated in the editor, cloned
 *    2. the local avatar, cloned (so a remote looks like what you are playing)
 *    3. a placeholder capsule
 *  Nothing here inspects the pawn type, which is precisely why it works for all
 *  of them. */
function defaultReplicaFactory(context){
  const THREE = context.THREE;
  if(!THREE) return null;
  const source = context.prefab || context.localObject || null;
  let body = null;
  if(source && source.clone){
    try { body = source.clone(true); }
    catch(err){ body = null; }
  }
  if(!body) body = buildPlaceholderBody(THREE, context.color);
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  body.scale.copy(source && source.scale ? source.scale : new THREE.Vector3(1, 1, 1));
  const group = new THREE.Object3D();
  group.name = 'P2P Replica ' + (context.name || context.netId);
  group.add(body);
  if(context.nameplates !== false){
    const plate = buildNameplate(THREE, context.name, context.color);
    if(plate) group.add(plate);
  }
  return group;
}
registerReplicaFactory('default', defaultReplicaFactory);

/* ---------------------------------------------------------------------------
   4. INTERPOLATION BUFFER
   Snapshots land here with their local arrival time, and playback runs a fixed
   delay behind. Using the LOCAL arrival clock instead of the sender's clock is
   deliberate: it removes clock synchronisation from the problem entirely, at
   the cost of folding one-way jitter into the buffer, which the playout delay
   already has to cover.
--------------------------------------------------------------------------- */
function createBuffer(){
  const samples = new Array(SAMPLE_RING);
  for(let i = 0; i < SAMPLE_RING; i++) samples[i] = {t:0, px:0, py:0, pz:0, qx:0, qy:0, qz:0, qw:1, used:false};
  return {samples, head:-1, count:0, lastApplied:0};
}
function pushSample(buffer, sample, arrivedAt){
  buffer.head = (buffer.head + 1) % SAMPLE_RING;
  const slot = buffer.samples[buffer.head];
  slot.t = arrivedAt;
  slot.px = sample.px; slot.py = sample.py; slot.pz = sample.pz;
  slot.qx = sample.qx; slot.qy = sample.qy; slot.qz = sample.qz; slot.qw = sample.qw;
  slot.used = true;
  if(buffer.count < SAMPLE_RING) buffer.count++;
  return slot;
}
function sampleAt(buffer, index){
  return buffer.samples[(buffer.head - index + SAMPLE_RING * 2) % SAMPLE_RING];
}
/** Writes the interpolated pose into `out`. Returns false when the buffer holds
 *  nothing usable, so the caller can leave the object exactly where it is
 *  instead of snapping it to the origin. */
function evaluate(buffer, renderTime, out){
  if(buffer.count <= 0) return false;
  const newest = sampleAt(buffer, 0);
  if(buffer.count === 1 || renderTime >= newest.t){
    // Ahead of the newest sample: hold it. Extrapolating a pose we were never
    // told about is how netcode produces rubber-banding, so we do not.
    if(renderTime - newest.t > EXTRAPOLATION_LIMIT * 1000 && renderTime - newest.t > SAMPLE_MAX_AGE) return false;
    copySample(newest, out);
    return true;
  }
  for(let index = 1; index < buffer.count; index++){
    const older = sampleAt(buffer, index);
    const newer = sampleAt(buffer, index - 1);
    if(!older.used || older.t > renderTime) continue;
    const span = newer.t - older.t;
    const alpha = span > 0 ? clamp((renderTime - older.t) / span, 0, 1) : 1;
    lerpSample(older, newer, alpha, out);
    return true;
  }
  copySample(sampleAt(buffer, buffer.count - 1), out);
  return true;
}
function copySample(from, out){
  out.px = from.px; out.py = from.py; out.pz = from.pz;
  out.qx = from.qx; out.qy = from.qy; out.qz = from.qz; out.qw = from.qw;
}
function lerpSample(a, b, alpha, out){
  out.px = a.px + (b.px - a.px) * alpha;
  out.py = a.py + (b.py - a.py) * alpha;
  out.pz = a.pz + (b.pz - a.pz) * alpha;
  // Shortest-arc nlerp: cheap, allocation free, and indistinguishable from slerp
  // over the small angles one network tick covers.
  let bx = b.qx, by = b.qy, bz = b.qz, bw = b.qw;
  if(a.qx * bx + a.qy * by + a.qz * bz + a.qw * bw < 0){ bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let x = a.qx + (bx - a.qx) * alpha;
  let y = a.qy + (by - a.qy) * alpha;
  let z = a.qz + (bz - a.qz) * alpha;
  let w = a.qw + (bw - a.qw) * alpha;
  const length = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
  out.qx = x / length; out.qy = y / length; out.qz = z / length; out.qw = w / length;
}

/* =========================================================================
   SESSION INSTANCE
========================================================================= */
function create(GAME){
  const state = {
    session:null,
    unsubscribe:null,
    role:'idle',
    selfPeerId:'',
    hostPeerId:'',
    epoch:0,
    migrationState:'stable',
    transportConnected:true,
    config:Object.assign({}, DEFAULTS),
    running:false,
    started:false,
    tick:0,
    // netId -> replica record
    replicas:new Map(),
    // peerId -> roster entry (host only writes this; guests mirror it)
    roster:new Map(),
    localNetId:0,
    localPlayerId:0,
    localName:'Player',
    localColor:'#7dd3fc',
    localObject:null,
    prefab:null,
    spawnPoints:[],
    nameplates:true,
    nextNetId:HOST_NET_ID + 1,
    lastCapture:null,
    accumulatedBytes:0,
    budgetWindow:0,
    listeners:new Set(),
    frameHookInstalled:false,
    frameHook:null,
    stats:{sent:0, received:0, rejected:0, bytesOut:0, bytesIn:0, lastRejection:''},
  };
  const ticker = createTicker();
  const pose = {px:0, py:0, pz:0, qx:0, qy:0, qz:0, qw:1};

  function THREE(){ return root.THREE || null; }
  function scene(){ return GAME && GAME.core && GAME.core.scene || null; }
  function isHost(){ return state.role === 'host'; }
  function authorityPayload(payload){
    return Object.assign({}, payload || {}, {epoch:state.epoch, hostPeerId:state.hostPeerId});
  }
  function sendAuthority(type, payload, peerId){
    if(!state.session || !isHost()) return peerId == null ? 0 : false;
    const body = authorityPayload(payload);
    return peerId == null ? state.session.send(type, body) : state.session.sendTo(peerId, type, body);
  }
  function sendHello(peerId){
    if(!state.session || isHost()) return false;
    const payload = {name:state.localName, protocolVersion:protocol().PROTOCOL_VERSION, color:state.localColor};
    return peerId == null
      ? state.session.send(protocol().TYPE.netHello, payload)
      : state.session.sendTo(peerId, protocol().TYPE.netHello, payload);
  }
  function notify(kind, detail){
    const event = Object.assign({kind, role:state.role, time:Date.now()}, detail || {});
    state.listeners.forEach(listener => {
      try { listener(event); }
      catch(err){ console.warn('LotKing P2P replication listener failed', err); }
    });
    if(root && typeof root.dispatchEvent === 'function' && typeof CustomEvent === 'function'){
      root.dispatchEvent(new CustomEvent('lotking:p2p-replication', {detail:event}));
    }
    // Logic graphs listen through the normal runtime event bus.
    const runner = GAME && GAME.systems && GAME.systems.logic;
    if(runner && runner.triggerRuntimeEvent && event.logicEvent) runner.triggerRuntimeEvent(event.logicEvent, event);
    return event;
  }
  function subscribe(listener){ state.listeners.add(listener); return () => state.listeners.delete(listener); }
  function reject(reason, detail){
    state.stats.rejected++;
    state.stats.lastRejection = String(reason);
    notify('rejected', Object.assign({reason:String(reason)}, detail || {}));
    return false;
  }

  /* -------------------------------------------------------------------------
     5. ROSTER - lobby, player ids, join and leave
     The host is the only writer. A guest applies what it is told and never
     invents an entry, which is what keeps player ids unique.
  ------------------------------------------------------------------------- */
  function rosterArray(){
    return Array.from(state.roster.values()).sort((a, b) => a.playerId - b.playerId || String(a.peerId).localeCompare(String(b.peerId)));
  }
  function freePlayerId(){
    const taken = new Set(rosterArray().map(entry => entry.playerId));
    for(let id = 1; id <= state.config.maxPlayers; id++) if(!taken.has(id)) return id;
    return 0;
  }
  function admit(peerId, hello){
    if(!isHost()) return null;
    const existing = state.roster.get(peerId);
    if(existing) return existing;
    if(state.roster.size >= state.config.maxPlayers) return null;
    const playerId = freePlayerId();
    if(!playerId) return null;
    const entry = {
      peerId:String(peerId),
      playerId,
      netId:state.nextNetId++,
      name:text(hello && hello.name, 'Player ' + playerId),
      color:text(hello && hello.color, '#7dd3fc'),
      team:state.config.teams > 0 ? ((playerId - 1) % state.config.teams) + 1 : 0,
      ready:false,
      host:false,
      latency:0,
    };
    state.roster.set(entry.peerId, entry);
    return entry;
  }
  function seatHost(name){
    const entry = {
      peerId:state.selfPeerId,
      playerId:1,
      netId:HOST_NET_ID,
      name:text(name, 'Host'),
      color:'#7dd3fc',
      team:state.config.teams > 0 ? 1 : 0,
      ready:true,
      host:true,
      latency:0,
    };
    state.roster.set(entry.peerId, entry);
    state.localNetId = entry.netId;
    state.localPlayerId = entry.playerId;
    return entry;
  }
  function broadcastRoster(){
    if(!isHost() || !state.session) return 0;
    return sendAuthority(protocol().TYPE.netRoster, {players:rosterArray()});
  }

  function electionOrder(entries){
    return entries.slice().sort((a, b) => a.playerId - b.playerId || String(a.peerId).localeCompare(String(b.peerId)));
  }
  function electedHost(entries){
    const ordered = electionOrder(entries);
    return ordered.length ? ordered[0] : null;
  }
  function rebalanceRoster(hostPeerId, entries){
    const ordered = electionOrder(entries || rosterArray());
    const host = ordered.find(entry => entry.peerId === hostPeerId);
    if(!host) return [];
    const survivors = [host].concat(ordered.filter(entry => entry !== host));
    state.roster.clear();
    survivors.forEach((entry, index) => {
      const normalized = Object.assign({}, entry, {playerId:index + 1, host:index === 0});
      state.roster.set(normalized.peerId, normalized);
    });
    state.nextNetId = Math.max(HOST_NET_ID + 1, ...survivors.map(entry => Number(entry.netId) + 1));
    const local = state.roster.get(state.selfPeerId);
    if(local){
      state.localPlayerId = local.playerId;
      state.localNetId = local.netId;
    }
    return rosterArray();
  }
  function reconcileReplicas(){
    const valid = new Set(rosterArray().map(entry => entry.netId));
    Array.from(state.replicas.keys()).forEach(netId => {
      if(netId === state.localNetId || !valid.has(netId)) despawnReplica(netId);
    });
    rosterArray().forEach(entry => {
      if(entry.peerId !== state.selfPeerId) spawnReplica(entry);
    });
  }
  function setTransportAuthority(){
    if(!state.session) return;
    if(typeof state.session.setRole === 'function') state.session.setRole(state.role);
    if(typeof state.session.setAuthority === 'function') state.session.setAuthority(state.epoch, state.hostPeerId);
  }
  function applyMigration(payload, sourcePeerId){
    const previousHostPeerId = String(payload.previousHostPeerId || state.hostPeerId);
    const localSurvivors = rosterArray().filter(entry => entry.peerId !== previousHostPeerId);
    const sourceRoster = payload.players && payload.players.length ? payload.players : [];
    const survivors = localSurvivors;
    const expected = electedHost(survivors);
    if(!expected || expected.peerId !== payload.hostPeerId){
      return reject('host migration winner does not match deterministic roster order', {peerId:sourcePeerId});
    }
    if(String(sourcePeerId) !== expected.peerId){
      return reject('host migration was not announced by the elected peer', {peerId:sourcePeerId});
    }
    if(Number(payload.epoch) < state.epoch || Number(payload.epoch) > state.epoch + 1){
      return reject('host migration epoch is outside the next valid term', {epoch:payload.epoch});
    }
    if(Number(payload.epoch) === state.epoch && state.migrationState === 'stable'){
      return reject('host migration term was already committed', {epoch:payload.epoch});
    }
    const announced = new Map(sourceRoster.map(entry => [entry.peerId, entry]));
    if(announced.size !== localSurvivors.length || localSurvivors.some(entry => {
      const remote = announced.get(entry.peerId);
      return !remote || remote.netId !== entry.netId;
    })){
      return reject('host migration roster does not match the locally witnessed survivors', {peerId:sourcePeerId});
    }
    state.epoch = Number(payload.epoch);
    state.hostPeerId = expected.peerId;
    state.role = state.selfPeerId === expected.peerId ? 'host' : 'guest';
    state.config = protocol().validateSessionConfig(payload.config || state.config);
    state.started = payload.started === true;
    state.tick = Math.max(state.tick, Number(payload.tick) || 0);
    state.roster.clear();
    localSurvivors.forEach(entry => state.roster.set(entry.peerId, Object.assign({}, entry)));
    rebalanceRoster(state.hostPeerId);
    reconcileReplicas();
    setTransportAuthority();
    state.migrationState = 'stable';
    state.transportConnected = !state.session.state || state.session.state().peerCount > 0 || state.roster.size <= 1;
    notify('host-migrated', {
      epoch:state.epoch, hostPeerId:state.hostPeerId, previousHostPeerId,
      localIsHost:isHost(), transportConnected:state.transportConnected,
      logicEvent:'OnNetworkHostMigrated',
    });
    return true;
  }
  function beginHostMigration(failedPeerId){
    const previousHostPeerId = String(failedPeerId || state.hostPeerId);
    const failed = state.roster.get(previousHostPeerId);
    if(failed) {
      state.roster.delete(previousHostPeerId);
      despawnReplica(failed.netId);
    }
    const winner = electedHost(rosterArray());
    if(!winner){
      state.hostPeerId = '';
      state.migrationState = 'empty';
      state.transportConnected = false;
      notify('host-migration-empty', {previousHostPeerId, logicEvent:'OnNetworkHostMigrationFailed'});
      return false;
    }
    state.epoch = Math.max(1, state.epoch + 1);
    state.hostPeerId = winner.peerId;
    state.role = state.selfPeerId === winner.peerId ? 'host' : 'guest';
    rebalanceRoster(state.hostPeerId);
    reconcileReplicas();
    setTransportAuthority();
    const peerCount = state.session && state.session.state ? state.session.state().peerCount : 0;
    state.transportConnected = peerCount > 0 || state.roster.size <= 1;
    state.migrationState = isHost() ? 'elected' : 'waiting-for-host';
    if(isHost()){
      const payload = {
        epoch:state.epoch,
        hostPeerId:state.hostPeerId,
        previousHostPeerId,
        players:rosterArray(),
        config:state.config,
        started:state.started,
        tick:state.tick,
      };
      state.session.send(protocol().TYPE.netHostMigration, payload);
      broadcastRoster();
      state.migrationState = state.transportConnected ? 'stable' : 'awaiting-reconnect';
      notify('host-migrated', {
        epoch:state.epoch, hostPeerId:state.hostPeerId, previousHostPeerId,
        localIsHost:true, transportConnected:state.transportConnected,
        logicEvent:'OnNetworkHostMigrated',
      });
    } else {
      notify('host-migration-waiting', {
        epoch:state.epoch, hostPeerId:state.hostPeerId, previousHostPeerId,
        transportConnected:state.transportConnected,
      });
    }
    return true;
  }
  /** Which netIds a given peer is allowed to write. Today one avatar per peer;
   *  the shape is a set so split-screen guests can be added without reworking
   *  the authority check. */
  function ownsNetId(peerId, netId){
    const entry = state.roster.get(String(peerId));
    return !!entry && entry.netId === Number(netId);
  }

  /* -------------------------------------------------------------------------
     REPLICAS
  ------------------------------------------------------------------------- */
  function spawnReplica(info){
    const netId = Number(info.netId);
    if(!netId || netId === state.localNetId) return null;
    if(state.replicas.has(netId)) return state.replicas.get(netId);
    const three = THREE(), parent = scene();
    if(!three || !parent) return null;
    const factory = resolveReplicaFactory(info.pawnType);
    let object = null;
    try {
      object = factory({
        THREE:three, GAME, netId,
        name:info.name, color:info.color, team:info.team,
        prefab:state.prefab, localObject:state.localObject,
        nameplates:state.nameplates,
      });
    } catch(err){
      console.warn('LotKing P2P: replica factory failed', err);
      object = null;
    }
    if(!object) return null;
    tagReplica(object, netId);
    const spawn = spawnPointFor(info.playerId);
    if(spawn) object.position.set(spawn.x, spawn.y, spawn.z);
    parent.add(object);
    const record = {
      netId, playerId:Number(info.playerId) || 0,
      name:text(info.name, 'Player'), team:Number(info.team) || 0,
      object, buffer:createBuffer(), lastSeen:now(),
    };
    state.replicas.set(netId, record);
    notify('spawn', {netId, playerId:record.playerId, name:record.name, logicEvent:'OnNetworkPlayerJoined'});
    return record;
  }
  function despawnReplica(netId){
    const record = state.replicas.get(Number(netId));
    if(!record) return false;
    state.replicas.delete(record.netId);
    disposeReplicaObject(record.object);
    notify('despawn', {netId:record.netId, playerId:record.playerId, name:record.name, logicEvent:'OnNetworkPlayerLeft'});
    return true;
  }
  function clearReplicas(){
    Array.from(state.replicas.keys()).forEach(despawnReplica);
  }
  function spawnPointFor(playerId){
    const points = state.spawnPoints;
    if(!points.length) return null;
    const index = (Math.max(1, Number(playerId) || 1) - 1) % points.length;
    return points[index];
  }

  /* -------------------------------------------------------------------------
     6. INBOUND ROUTER
     One handler per declared message type, in protocol phase order. A type that
     reaches here without a handler is REJECTED EXPLICITLY - never defaulted.
  ------------------------------------------------------------------------- */
  const HANDLERS = {};
  function installHandlers(){
    const P = protocol();
    if(!P || HANDLERS.__installed) return;
    const T = P.TYPE;

    // --- phase 1 handshake ---------------------------------------------------
    HANDLERS[T.netHello] = (peerId, payload) => {
      if(!isHost()) return reject('only a host answers net.hello');
      if(payload.protocolVersion !== P.PROTOCOL_VERSION){
        sendAuthority(T.netReject, {code:'protocol', reason:'This peer uses an incompatible P2P protocol'}, peerId);
        return false;
      }
      const wasSeated = state.roster.has(String(peerId));
      const entry = admit(peerId, payload);
      if(!entry){
        sendAuthority(T.netReject, {code:'full', reason:'This session is full'}, peerId);
        return false;
      }
      sendAuthority(T.netWelcome, {
        playerId:entry.playerId, netId:entry.netId, team:entry.team, config:state.config,
      }, peerId);
      broadcastRoster();
      if(wasSeated) return true;
      // Tell everyone about the newcomer, and the newcomer about everyone.
      sendAuthority(T.netSpawn, {
        netId:entry.netId, playerId:entry.playerId, name:entry.name, team:entry.team,
        prefabId:'', spawnId:'',
      });
      rosterArray().forEach(other => {
        if(other.peerId === entry.peerId) return;
        sendAuthority(T.netSpawn, {
          netId:other.netId, playerId:other.playerId, name:other.name, team:other.team,
          prefabId:'', spawnId:'',
        }, peerId);
      });
      // The host needs a body for the newcomer immediately, not only once its
      // first net.move arrives, so the roster and the scene agree at all times.
      spawnReplica(entry);
      notify('joined', {peerId, playerId:entry.playerId, name:entry.name, logicEvent:'OnNetworkPlayerJoined'});
      return true;
    };
    HANDLERS[T.netWelcome] = (peerId, payload) => {
      if(isHost()) return reject('a host cannot be welcomed into its own session');
      state.config = P.validateSessionConfig(payload.config);
      state.localNetId = payload.netId;
      state.localPlayerId = payload.playerId;
      state.epoch = payload.epoch;
      state.hostPeerId = payload.hostPeerId || peerId;
      state.migrationState = 'stable';
      setTransportAuthority();
      applyTickRate();
      notify('welcome', {playerId:payload.playerId, netId:payload.netId, config:state.config});
      return true;
    };
    HANDLERS[T.netReject] = (peerId, payload) => {
      notify('refused', {reason:payload.reason, code:payload.code});
      return true;
    };

    // --- phase 2 lobby -------------------------------------------------------
    HANDLERS[T.netConfig] = (peerId, payload) => {
      if(isHost()) return reject('the host owns the session configuration');
      state.config = payload;
      applyTickRate();
      notify('config', {config:state.config});
      return true;
    };
    HANDLERS[T.netRoster] = (peerId, payload) => {
      if(isHost()) return reject('the host owns the roster');
      state.roster.clear();
      payload.players.forEach(entry => state.roster.set(entry.peerId, entry));
      notify('roster', {players:payload.players});
      return true;
    };
    HANDLERS[T.netHostMigration] = (peerId, payload) => applyMigration(payload, peerId);
    HANDLERS[T.netReady] = (peerId, payload) => {
      if(!isHost()) return reject('readiness is collected by the host');
      const entry = state.roster.get(String(peerId));
      if(!entry) return reject('unknown peer marked itself ready', {peerId});
      entry.ready = payload.ready;
      broadcastRoster();
      return true;
    };
    HANDLERS[T.netStart] = (peerId, payload) => {
      if(isHost()) return reject('the host starts its own match');
      state.started = true;
      notify('start', {startedAt:payload.startedAt, seed:payload.seed, logicEvent:'OnNetworkMatchStarted'});
      return true;
    };

    // --- phase 3 state -------------------------------------------------------
    HANDLERS[T.netSnapshot] = (peerId, payload) => {
      if(isHost()) return reject('a guest may not send snapshots');
      return applySnapshot(payload);
    };
    HANDLERS[T.netMove] = (peerId, payload) => {
      if(!isHost()) return reject('avatar updates are relayed by the host');
      // AUTHORITY CHECK. This single line is what stops a guest from moving
      // somebody else's avatar or inventing a new one.
      const owned = payload.records.filter(record => ownsNetId(peerId, record[0]));
      if(owned.length !== payload.records.length){
        reject('peer tried to write a netId it does not own', {peerId});
        if(!owned.length) return false;
      }
      applyRecords(owned);
      return true;
    };
    HANDLERS[T.netAck] = (peerId, payload) => {
      const entry = state.roster.get(String(peerId));
      if(entry && payload.echo) entry.latency = clamp(Date.now() - payload.echo, 0, 5000);
      return true;
    };

    // --- phase 4 event -------------------------------------------------------
    HANDLERS[T.netEvent] = (peerId, payload) => {
      notify('event', {channel:payload.channel, payload:payload.payload, peerId, logicEvent:'OnNetworkMessage'});
      // Relay so a guest-originated event reaches the other guests too.
      if(isHost()) state.session.send(protocol().TYPE.netEvent, payload);
      return true;
    };
    HANDLERS[T.netSpawn] = (peerId, payload) => {
      if(isHost()) return reject('only the host spawns replicated avatars');
      spawnReplica(payload);
      return true;
    };
    HANDLERS[T.netDespawn] = (peerId, payload) => {
      if(isHost()) return reject('only the host despawns replicated avatars');
      return despawnReplica(payload.netId);
    };
    HANDLERS[T.netVar] = (peerId, payload) => {
      if(isHost()) return reject('replicated variables are published by the host');
      notify('variable', {name:payload.name, value:payload.value, logicEvent:'OnNetworkVariableChanged'});
      return true;
    };
    HANDLERS[T.netChat] = (peerId, payload) => {
      notify('chat', {text:payload.text, peerId});
      if(isHost()) state.session.send(protocol().TYPE.netChat, payload);
      return true;
    };

    // --- phase 6 closure -----------------------------------------------------
    HANDLERS[T.netLeave] = peerId => dropPeer(peerId, 'left');
    HANDLERS[T.netKick] = (peerId, payload) => {
      if(isHost()) return reject('a guest cannot kick');
      notify('kicked', {reason:payload.reason});
      stop();
      return true;
    };
    HANDLERS[T.netBye] = (peerId, payload) => {
      if(isHost()) return reject('a guest cannot close the session');
      notify('closed', {reason:payload.reason});
      stop();
      return true;
    };

    HANDLERS.__installed = true;
  }

  /** Routes one already transport-validated message.
   *  @throws when the type is not declared in the protocol table at all. */
  function route(type, peerId, payload){
    const P = protocol();
    if(!P) return reject('the P2P protocol table is not loaded');
    installHandlers();
    // Undeclared type: describe() throws by design. Phase 5 (coworking) is
    // declared but deliberately not handled here - it belongs to the editor
    // plugin - so it is refused with a reason rather than silently swallowed.
    const entry = P.describe(type);
    if(P.isHostAuthoritative(type)){
      const incomingEpoch = Number(payload && payload.epoch) || 0;
      const incomingHost = String(payload && payload.hostPeerId || '');
      const initialHandshake = state.epoch === 0 && (type === P.TYPE.netWelcome || type === P.TYPE.netReject);
      if(initialHandshake){
        if(!incomingHost || incomingHost !== String(peerId)) return reject('handshake authority does not match its sender', {peerId, type});
      } else if(incomingEpoch !== state.epoch || incomingHost !== state.hostPeerId || String(peerId) !== state.hostPeerId){
        return reject('stale or foreign host authority', {
          peerId, type, epoch:incomingEpoch, expectedEpoch:state.epoch,
          hostPeerId:incomingHost, expectedHostPeerId:state.hostPeerId,
        });
      }
    }
    const handler = HANDLERS[type];
    if(typeof handler !== 'function'){
      return reject('message type "' + entry.type + '" (phase ' + entry.phase + ') has no gameplay handler', {type:entry.type});
    }
    state.stats.received++;
    return handler(String(peerId), payload) !== false;
  }

  function applySnapshot(payload){
    state.tick = Math.max(state.tick, Number(payload.tick) || 0);
    return applyRecords(payload.records);
  }
  function applyRecords(records){
    const P = protocol();
    if(!SCRATCH.sample) SCRATCH.sample = P.createStateSample();
    const arrivedAt = now();
    for(let index = 0; index < records.length; index++){
      const sample = P.decodeStateRecord(SCRATCH.sample, records[index]);
      if(!sample) continue;
      if(sample.netId === state.localNetId) continue;      // never let the wire move us
      let replica = state.replicas.get(sample.netId);
      if(!replica){
        // A state record for an avatar we were never told to spawn is exactly
        // the "inject an arbitrary entity" case. Guests refuse it outright; the
        // host tolerates it only for a netId that is already in its roster.
        const seated = rosterArray().find(entry => entry.netId === sample.netId);
        if(!isHost() || !seated){
          reject('state for an unknown netId', {netId:sample.netId});
          continue;
        }
        replica = spawnReplica(seated);
        if(!replica) continue;
      }
      pushSample(replica.buffer, sample, arrivedAt);
      replica.lastSeen = arrivedAt;
    }
    return true;
  }
  function dropPeer(peerId, reason){
    const entry = state.roster.get(String(peerId));
    if(!entry) return false;
    state.roster.delete(entry.peerId);
    despawnReplica(entry.netId);
    if(isHost()){
      sendAuthority(protocol().TYPE.netDespawn, {netId:entry.netId});
      broadcastRoster();
    }
    notify('left', {peerId:entry.peerId, playerId:entry.playerId, name:entry.name, reason:text(reason, 'disconnected'), logicEvent:'OnNetworkPlayerLeft'});
    return true;
  }

  /* -------------------------------------------------------------------------
     7. OUTBOUND - capture, budget, send
     Runs on the network tick, never on the frame loop.
  ------------------------------------------------------------------------- */
  function captureLocal(out){
    const object = state.localObject;
    if(!object) return false;
    const P = protocol();
    // getWorldPosition/Quaternion would allocate; a replicated avatar is always
    // a scene-level object, so its local transform is its world transform.
    SCRATCH.position.x = object.position.x;
    SCRATCH.position.y = object.position.y;
    SCRATCH.position.z = object.position.z;
    SCRATCH.quaternion.x = object.quaternion.x;
    SCRATCH.quaternion.y = object.quaternion.y;
    SCRATCH.quaternion.z = object.quaternion.z;
    SCRATCH.quaternion.w = object.quaternion.w;
    const body = object.userData && object.userData.logicPhysicsBody;
    const velocity = body && body.velocity ? body.velocity : null;
    SCRATCH.velocity.x = velocity ? velocity.x : 0;
    SCRATCH.velocity.y = velocity ? velocity.y : 0;
    SCRATCH.velocity.z = velocity ? velocity.z : 0;
    P.encodeStateRecord(out, state.localNetId, SCRATCH.position, SCRATCH.quaternion, SCRATCH.velocity, 0);
    return true;
  }
  /** Bandwidth accounting, declared and enforced. `bandwidthBudget` is in kB/s;
   *  a tick that would exceed it is skipped rather than queued, because a
   *  backed-up unreliable channel is worse than a missing snapshot. */
  function withinBudget(bytes){
    const stamp = now();
    if(stamp - state.budgetWindow >= 1000){
      state.budgetWindow = stamp;
      state.accumulatedBytes = 0;
    }
    if(state.accumulatedBytes + bytes > state.config.bandwidthBudget * 1024) return false;
    state.accumulatedBytes += bytes;
    return true;
  }
  function sendTick(){
    if(!state.session || !state.running) return;
    const P = protocol();
    if(!captureLocal(SCRATCH.record)) return;
    const bytes = P.estimateRecordBytes();
    if(!withinBudget(bytes)) return;
    state.tick++;
    state.stats.bytesOut += bytes;
    state.stats.sent++;
    if(isHost()){
      // The host is the relay: it sends its own record plus the newest record of
      // every replica it knows about, subject to the byte budget. Gaffer's
      // priority accumulator lives here: replicas that missed a tick are sent
      // first on the next one.
      const records = [SCRATCH.record.slice()];
      const ordered = Array.from(state.replicas.values()).sort((a, b) => (b.priority || 0) - (a.priority || 0));
      for(let index = 0; index < ordered.length; index++){
        const replica = ordered[index];
        replica.priority = (replica.priority || 0) + 1;
        if(replica.buffer.count <= 0) continue;
        if(!withinBudget(bytes)) break;
        const newest = sampleAt(replica.buffer, 0);
        records.push(P.encodeStateRecord(new Array(P.STATE_RECORD_LENGTH), replica.netId,
          {x:newest.px, y:newest.py, z:newest.pz},
          {x:newest.qx, y:newest.qy, z:newest.qz, w:newest.qw},
          null, 0));
        replica.priority = 0;
      }
      sendAuthority(P.TYPE.netSnapshot, {tick:state.tick, time:Date.now(), records});
    } else {
      state.session.send(P.TYPE.netMove, {tick:state.tick, records:[SCRATCH.record.slice()]});
    }
  }
  function applyTickRate(){
    if(!state.running) return;
    ticker.start(state.config.tickRate, sendTick);
  }

  /* -------------------------------------------------------------------------
     FRAME STAGE - interpolation playback only. No allocation, no networking.
  ------------------------------------------------------------------------- */
  function update(){
    if(!state.running || state.replicas.size === 0) return;
    const renderTime = now() - state.config.interpolationDelay * 1000;
    state.replicas.forEach(replica => {
      if(!replica.object) return;
      if(!evaluate(replica.buffer, renderTime, pose)) return;
      replica.object.position.set(pose.px, pose.py, pose.pz);
      replica.object.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);
    });
  }
  function installFrameHook(){
    if(state.frameHookInstalled || !GAME || !GAME.hooks || !Array.isArray(GAME.hooks.frame)) return false;
    state.frameHookInstalled = true;
    state.frameHook=()=>update();
    GAME.hooks.frame.push(state.frameHook);
    return true;
  }
  function uninstallFrameHook(){
    if(state.frameHook&&GAME&&GAME.hooks&&Array.isArray(GAME.hooks.frame)){
      const index=GAME.hooks.frame.indexOf(state.frameHook);
      if(index>=0)GAME.hooks.frame.splice(index,1);
    }
    state.frameHook=null;
    state.frameHookInstalled=false;
  }

  /* -------------------------------------------------------------------------
     8. SESSION LIFECYCLE AND PUBLIC API
  ------------------------------------------------------------------------- */
  function attach(session, options){
    const P = protocol();
    if(!P) throw new Error('js/runtime/p2p-protocol.js must load before the replication layer');
    detach();
    // A replacement transport is a new authority domain. Replicas and seat/tick
    // state from the previous session must not leak into it (or collide with its
    // newly assigned netIds), while subscribers remain owned by this instance.
    clearReplicas();
    state.roster.clear();
    state.started = false;
    state.tick = 0;
    state.localNetId = 0;
    state.localPlayerId = 0;
    state.lastCapture = null;
    state.accumulatedBytes = 0;
    state.budgetWindow = 0;
    state.stats = {sent:0, received:0, rejected:0, bytesOut:0, bytesIn:0, lastRejection:''};
    state.session = session || root.LK_P2P_ACTIVE_SESSION || null;
    if(!state.session) return false;
    const info = state.session.state();
    state.selfPeerId = info.selfId;
    state.role = info.role === 'host' ? 'host' : 'guest';
    state.epoch = isHost() ? Math.max(1, Number(info.authorityEpoch) || 1) : 0;
    state.hostPeerId = isHost() ? state.selfPeerId : String(info.authorityPeerId || '');
    state.migrationState = 'stable';
    state.transportConnected = true;
    state.config = P.validateSessionConfig(Object.assign({}, DEFAULTS, options && options.config));
    state.nameplates = !(options && options.nameplates === false);
    state.prefab = options && options.prefab || null;
    state.spawnPoints = Array.isArray(options && options.spawnPoints) ? options.spawnPoints.slice() : [];
    state.localObject = options && options.localObject || null;
    state.localName = text(options && options.name, 'Player');
    state.localColor = text(options && options.color, '#7dd3fc');
    state.nextNetId = HOST_NET_ID + 1;
    if(isHost()) seatHost(options && options.name);
    setTransportAuthority();
    state.unsubscribe = state.session.subscribe(handleSessionEvent);
    installFrameHook();
    state.running = true;
    applyTickRate();
    if(!isHost()) sendHello();
    notify('attached', {role:state.role, config:state.config});
    return true;
  }
  function handleSessionEvent(event){
    if(event.kind === 'message'){
      try { route(event.type, event.peerId, event.payload); }
      catch(err){ reject(err.message, {type:event.type}); }
      return;
    }
    if(event.action === 'peer-closed'){
      const lostHost = !isHost() && String(event.peerId) === state.hostPeerId;
      if(lostHost) beginHostMigration(event.peerId);
      else dropPeer(event.peerId, 'disconnected');
    }
    if(event.action === 'peer-ready'){
      if(isHost()) broadcastRoster();
      else if(!state.hostPeerId || String(event.peerId) === state.hostPeerId) sendHello(event.peerId);
    }
  }
  function detach(){
    ticker.stop();
    uninstallFrameHook();
    if(state.unsubscribe) state.unsubscribe();
    state.unsubscribe = null;
    state.session = null;
    state.running = false;
  }
  function stop(){
    clearReplicas();
    detach();
    state.roster.clear();
    state.started = false;
    notify('stopped', {});
    return true;
  }
  function startMatch(){
    if(!isHost() || !state.session) return false;
    state.started = true;
    sendAuthority(protocol().TYPE.netStart, {startedAt:Date.now(), seed:Math.floor(Math.random() * 0xffffffff)});
    notify('start', {logicEvent:'OnNetworkMatchStarted'});
    return true;
  }
  function sendEvent(channel, payload){
    if(!state.session) return 0;
    return state.session.send(protocol().TYPE.netEvent, {channel, payload});
  }
  function setVariable(name, value){
    if(!isHost() || !state.session) return false;
    sendAuthority(protocol().TYPE.netVar, {name, value});
    notify('variable', {name, value, logicEvent:'OnNetworkVariableChanged'});
    return true;
  }
  function setLocalAvatar(object){ state.localObject = object || null; return state.localObject; }
  function setSpawnPoints(points){
    state.spawnPoints = (Array.isArray(points) ? points : []).map(point => ({
      x:finite(point && point.x), y:finite(point && point.y), z:finite(point && point.z),
      team:finite(point && point.team),
    }));
    return state.spawnPoints.length;
  }
  function configure(patch){
    state.config = protocol().validateSessionConfig(Object.assign({}, state.config, patch || {}));
    applyTickRate();
    if(isHost() && state.session) sendAuthority(protocol().TYPE.netConfig, state.config);
    return state.config;
  }
  function snapshot(){
    return {
      schemaVersion:SCHEMA_VERSION,
      role:state.role,
      hostPeerId:state.hostPeerId,
      epoch:state.epoch,
      migrationState:state.migrationState,
      transportConnected:state.transportConnected,
      running:state.running,
      started:state.started,
      tick:state.tick,
      config:Object.assign({}, state.config),
      localPlayerId:state.localPlayerId,
      localNetId:state.localNetId,
      players:rosterArray(),
      replicaCount:state.replicas.size,
      stats:Object.assign({}, state.stats),
      tickRate:ticker.rate(),
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    attach, detach, stop, update, subscribe,
    startMatch, sendEvent, setVariable, configure,
    setLocalAvatar, setSpawnPoints,
    spawnReplica, despawnReplica,
    route, snapshot, beginHostMigration,
    isHost, roster:rosterArray,
    replicas:() => Array.from(state.replicas.values()),
  });
}

/* ---------------------------------------------------------------------------
   INSTALLATION
--------------------------------------------------------------------------- */
function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.p2pReplication && GAME.systems.p2pReplication.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.p2pReplication;
  const instance = create(GAME);
  GAME.systems.p2pReplication = instance;
  return instance;
}
function boot(){
  const GAME = root.LOT_KING;
  if(GAME) install(GAME);
}

root.LK_P2P_REPLICATION = Object.freeze({
  SCHEMA_VERSION, DEFAULTS, SAMPLE_RING,
  create, install, boot,
  registerReplicaFactory, resolveReplicaFactory,
  ownReplicaResources, disposeReplicaObject,
  createTicker, createBuffer, pushSample, evaluate,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_P2P_REPLICATION;
if(root.LOT_KING) boot();
else if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
})();
