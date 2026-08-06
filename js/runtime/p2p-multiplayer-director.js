/* =========================================================
   LOT KING - Multiplayer Mode director

   The editor-facing half of P2P multiplayer. An author drops ONE Logic Element
   ("Multiplayer Mode") into a level, fills in the Inspector, and this director
   turns that authored data into a running session: it finds the associated
   scene assets, hands them to js/runtime/p2p-replication.js, and draws the
   lobby / roster HUD. Exactly the same relationship the Mission Director has
   with js/runtime/objective-system.js, so a game mode stays authored data
   instead of a private script.

   Read order (and the order of the numbered sections below):
     1. Descriptor normalization - the authored shape, clamped
     2. MULTIPLAYER_ROLES - one table naming every associated scene asset
     3. Scene resolution - finding those assets in the level
     4. Exposed-variable bindings - Inspector edits reach the descriptor
     5. Session control - start / stop / host / join
     6. HUD - roster, connection state and the honest NAT warning
     7. Frame stage, installation and public API

   EVERYTHING HERE IS AUTHORED. There is no value in this file that an author
   cannot change from the editor: player count, tick rate, interpolation delay,
   bandwidth budget, mode, teams, which object is the local avatar, which object
   is cloned for remote players, which objects are spawn points, and whether the
   nameplates / spawn markers / lobby volume / team zones are shown at all.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;

function replication(){ return root.LK_P2P_REPLICATION || null; }
function protocol(){ return root.LK_P2P_PROTOCOL || null; }

function finite(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function text(value, fallback){
  const raw = value == null ? '' : String(value).trim();
  return raw || (fallback == null ? '' : String(fallback));
}
function flag(value, fallback){ return value == null ? fallback === true : value === true; }

/* ---------------------------------------------------------------------------
   1. DESCRIPTOR NORMALIZATION
   `graph.multiplayerDirector` as an author saves it, turned into a value the
   runtime can trust. Unknown modes fall back to the first declared one rather
   than to whatever string happened to be typed.
--------------------------------------------------------------------------- */
const MODES = Object.freeze(['co-op', 'versus', 'free-roam']);
const HUD_POSITIONS = Object.freeze(['top-left', 'top-right', 'bottom-left', 'bottom-right']);

function normalize(source){
  const src = source && typeof source === 'object' ? source : {};
  const assets = src.assets && typeof src.assets === 'object' ? src.assets : {};
  const hud = src.hud && typeof src.hud === 'object' ? src.hud : {};
  const mode = text(src.mode);
  return {
    schemaVersion:SCHEMA_VERSION,
    enabled:src.enabled !== false,
    sessionName:text(src.sessionName, 'Lot King session'),
    mode:MODES.indexOf(mode) >= 0 ? mode : MODES[0],
    maxPlayers:Math.round(clamp(src.maxPlayers == null ? 4 : src.maxPlayers, 2, 8)),
    teams:Math.round(clamp(src.teams, 0, 4)),
    friendlyFire:flag(src.friendlyFire, false),
    // Netcode budget. Defaults follow Valve's cl_interp of 0.1 s and a 20 Hz
    // snapshot rate, which is the classic starting point for a 2-8 player game.
    tickRate:Math.round(clamp(src.tickRate == null ? 20 : src.tickRate, 5, 60)),
    interpolationDelay:clamp(src.interpolationDelay == null ? .1 : src.interpolationDelay, .02, .5),
    bandwidthBudget:Math.round(clamp(src.bandwidthBudget == null ? 24 : src.bandwidthBudget, 4, 256)),
    autoStart:flag(src.autoStart, true),
    localPlayerId:Math.round(clamp(src.localPlayerId == null ? 1 : src.localPlayerId, 1, 4)),
    localAvatarId:text(src.localAvatarId),
    remotePrefabId:text(src.remotePrefabId),
    assets:{
      spawnMarkers:flag(assets.spawnMarkers, true),
      nameplates:flag(assets.nameplates, true),
      lobbyVolume:flag(assets.lobbyVolume, true),
      teamZones:flag(assets.teamZones, true),
    },
    hud:{
      enabled:hud.enabled !== false,
      position:HUD_POSITIONS.indexOf(text(hud.position)) >= 0 ? text(hud.position) : 'top-left',
      showRoster:hud.showRoster !== false,
      showNetwork:hud.showNetwork !== false,
    },
  };
}

/* ---------------------------------------------------------------------------
   2. MULTIPLAYER_ROLES - ONE TABLE OF ASSOCIATED SCENE ASSETS

   These are the objects an author "puts in the scene" to build a multiplayer
   level. A scene object takes a role either by carrying `userData.multiplayerRole`
   or by being NAMED with the role's prefix in the outliner - the second form
   needs no engine change at all, so any primitive an author drops in and renames
   becomes a spawn point. Rows are read in this order.
--------------------------------------------------------------------------- */
const MULTIPLAYER_ROLES = Object.freeze([
  Object.freeze({
    id:'spawn-point', prefix:'MP Spawn', label:'Spawn Point',
    describe:'Where a player id appears. Player N uses the Nth spawn point in outliner order.',
    hideInPlay:true,
  }),
  Object.freeze({
    id:'avatar-prefab', prefix:'MP Player Prefab', label:'Remote Player Prefab',
    describe:'Cloned once per remote player. Hidden locally; only the clones are shown.',
    hideInPlay:true,
  }),
  Object.freeze({
    id:'lobby', prefix:'MP Lobby', label:'Lobby Volume',
    describe:'Marks the waiting area shown before the match starts.',
    hideInPlay:false,
  }),
  Object.freeze({
    id:'team-zone', prefix:'MP Team', label:'Team Zone',
    describe:'A team-owned area. The trailing number in the name is the team index.',
    hideInPlay:false,
  }),
]);
const ROLE_BY_ID = new Map(MULTIPLAYER_ROLES.map(entry => [entry.id, entry]));

/** @throws when asked about a role that is not in the table. */
function describeRole(id){
  const entry = ROLE_BY_ID.get(String(id));
  if(!entry) throw new Error('Lot King multiplayer: unknown scene asset role "' + String(id).slice(0, 40) + '"');
  return entry;
}
function roleOf(object){
  if(!object || !object.userData) return '';
  const explicit = String(object.userData.multiplayerRole || '');
  if(explicit && ROLE_BY_ID.has(explicit)) return explicit;
  const name = String(object.userData.editorName || object.name || '');
  for(let index = 0; index < MULTIPLAYER_ROLES.length; index++){
    const entry = MULTIPLAYER_ROLES[index];
    if(name.toLowerCase().indexOf(entry.prefix.toLowerCase()) === 0) return entry.id;
  }
  return '';
}

/* =========================================================================
   DIRECTOR INSTANCE
========================================================================= */
function create(GAME){
  const state = {
    descriptor:normalize(null),
    running:false,
    session:null,
    hud:null,
    hudTimer:0,
    resolved:{spawnPoints:[], localAvatar:null, prefab:null, lobby:null, teamZones:[]},
    unsubscribe:null,
    frameHookInstalled:false,
    frameHook:null,
    lastStatus:'',
  };

  function registry(){
    return GAME && GAME.world && Array.isArray(GAME.world.registry) ? GAME.world.registry : [];
  }
  function net(){
    const factory = replication();
    return factory && GAME ? factory.install(GAME) : null;
  }

  /* -------------------------------------------------------------------------
     3. SCENE RESOLUTION
  ------------------------------------------------------------------------- */
  function objectById(id){
    const needle = text(id);
    if(!needle) return null;
    return registry().find(item => item && item.userData && item.userData.editorId === needle) || null;
  }
  function objectsWithRole(roleId){
    describeRole(roleId);
    return registry().filter(item => roleOf(item) === roleId);
  }
  /** The object this browser is actually playing. Authored id wins; otherwise
   *  the pawn possessed by the authored local player id; otherwise the built-in
   *  player car. Never guesses across pawn types - it only ever asks the pawn
   *  registry, which is the same lookup every other system uses. */
  function resolveLocalAvatar(){
    const explicit = objectById(state.descriptor.localAvatarId);
    if(explicit) return explicit;
    const pawns = GAME && GAME.pawns;
    const pawn = pawns && pawns.getByPlayerId ? pawns.getByPlayerId(state.descriptor.localPlayerId) : null;
    if(pawn && pawn.owner) return pawn.owner;
    return GAME && GAME.player && GAME.player.car || null;
  }
  function resolveScene(){
    const spawnObjects = objectsWithRole('spawn-point');
    state.resolved.spawnPoints = spawnObjects.map((object, index) => ({
      x:object.position.x, y:object.position.y, z:object.position.z,
      team:teamIndexFromName(object) || (state.descriptor.teams > 0 ? (index % state.descriptor.teams) + 1 : 0),
    }));
    state.resolved.localAvatar = resolveLocalAvatar();
    state.resolved.prefab = objectById(state.descriptor.remotePrefabId) || objectsWithRole('avatar-prefab')[0] || null;
    state.resolved.lobby = objectsWithRole('lobby')[0] || null;
    state.resolved.teamZones = objectsWithRole('team-zone');

    // Associated assets are authoring aids: the author sees them in the editor,
    // the player does not see the ones flagged hideInPlay.
    MULTIPLAYER_ROLES.forEach(role => {
      if(!role.hideInPlay) return;
      objectsWithRole(role.id).forEach(object => {
        if(object === state.resolved.localAvatar) return;
        object.visible = false;
      });
    });
    if(!state.descriptor.assets.spawnMarkers) spawnObjects.forEach(object => { object.visible = false; });
    if(!state.descriptor.assets.lobbyVolume && state.resolved.lobby) state.resolved.lobby.visible = false;
    if(!state.descriptor.assets.teamZones) state.resolved.teamZones.forEach(object => { object.visible = false; });
    return state.resolved;
  }
  function teamIndexFromName(object){
    const match = /(\d+)\s*$/.exec(String(object && object.userData && object.userData.editorName || object && object.name || ''));
    return match ? clamp(match[1], 0, 4) : 0;
  }

  /* -------------------------------------------------------------------------
     4. EXPOSED-VARIABLE BINDINGS
     The Inspector writes exposed graph variables; the runtime reads a
     descriptor. This walks the `binding` paths so an edit made in the editor is
     the value the session actually uses - which is the whole point of the
     "everything stays editable" rule.
  ------------------------------------------------------------------------- */
  function applyGraphBindings(descriptor, graph){
    const variables = graph && Array.isArray(graph.variables) ? graph.variables : [];
    const target = descriptor && typeof descriptor === 'object' ? descriptor : {};
    variables.forEach(variable => {
      if(!variable || variable.exposed !== true) return;
      const path = String(variable.binding || '').trim();
      if(!path) return;
      const keys = path.split('.').filter(Boolean);
      if(!keys.length) return;
      let cursor = target;
      for(let index = 0; index < keys.length - 1; index++){
        const key = keys[index];
        if(!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
        cursor = cursor[key];
      }
      cursor[keys[keys.length - 1]] = variable.value;
    });
    return target;
  }
  /** Entry point used by the Logic node: takes the owning graph, merges the
   *  Inspector's exposed variables over the stored descriptor and normalizes. */
  function loadFromGraph(graph){
    const stored = graph && graph.multiplayerDirector;
    const merged = applyGraphBindings(JSON.parse(JSON.stringify(stored || {})), graph);
    return load(merged);
  }
  function load(descriptor){
    state.descriptor = normalize(descriptor);
    return state.descriptor;
  }

  /* -------------------------------------------------------------------------
     5. SESSION CONTROL
  ------------------------------------------------------------------------- */
  function activeSession(){ return root.LK_P2P_ACTIVE_SESSION || null; }
  function status(message){
    state.lastStatus = String(message || '');
    if(GAME && GAME.ui && GAME.ui.popup && state.lastStatus) GAME.ui.popup('[Multiplayer] ' + state.lastStatus, '#7dd3fc', 3);
    return state.lastStatus;
  }
  function start(){
    if(!state.descriptor.enabled) return false;
    const layer = net();
    if(!layer){ status('The P2P replication runtime is not loaded'); return false; }
    resolveScene();
    installFrameHook();
    const session = activeSession();
    if(!session){
      // Nothing to attach to yet. The mode is armed: as soon as the author (or
      // the player) opens the session studio and connects, `retry()` binds it.
      status('Multiplayer mode armed. Open the P2P session studio to host or join.');
      state.running = true;
      buildHud();
      return true;
    }
    return bind(session, layer);
  }
  function bind(session, layer){
    const attached = layer.attach(session, {
      name:playerName(),
      config:{
        mode:state.descriptor.mode,
        maxPlayers:state.descriptor.maxPlayers,
        tickRate:state.descriptor.tickRate,
        interpolationDelay:state.descriptor.interpolationDelay,
        bandwidthBudget:state.descriptor.bandwidthBudget,
        teams:state.descriptor.teams,
        friendlyFire:state.descriptor.friendlyFire,
        sessionName:state.descriptor.sessionName,
      },
      localObject:state.resolved.localAvatar,
      prefab:state.resolved.prefab,
      spawnPoints:state.resolved.spawnPoints,
      nameplates:state.descriptor.assets.nameplates,
    });
    if(!attached){ status('Could not attach to the P2P session'); return false; }
    state.session = session;
    state.running = true;
    if(state.unsubscribe) state.unsubscribe();
    state.unsubscribe = layer.subscribe(event => {
      if(event.kind === 'joined' || event.kind === 'spawn') status((event.name || 'A player') + ' joined');
      if(event.kind === 'left' || event.kind === 'despawn') status((event.name || 'A player') + ' left');
      if(event.kind === 'refused') status('Refused by the host: ' + (event.reason || ''));
      if(event.kind === 'host-migrated'){
        status(event.transportConnected === false
          ? 'Host migrated locally; reconnect signaling is required by the current star transport.'
          : 'Host migrated to ' + event.hostPeerId + ' (term ' + event.epoch + ').');
      }
      if(event.kind === 'host-migration-waiting') status('Waiting for elected host ' + event.hostPeerId + ' (term ' + event.epoch + ').');
      refreshHud();
    });
    buildHud();
    if(state.descriptor.autoStart && layer.isHost()) layer.startMatch();
    status('Multiplayer session active (' + state.descriptor.mode + ')');
    return true;
  }
  /** Called by the frame stage: binds late when a session appears after start. */
  function retry(){
    if(!state.running || state.session) return false;
    const session = activeSession();
    if(!session) return false;
    const layer = net();
    return layer ? bind(session, layer) : false;
  }
  function stop(){
    const layer = net();
    if(layer) layer.stop();
    if(state.unsubscribe) state.unsubscribe();
    state.unsubscribe = null;
    state.session = null;
    state.running = false;
    uninstallFrameHook();
    destroyHud();
    return true;
  }
  function playerName(){
    try {
      const stored = root.localStorage && root.localStorage.getItem('lotking.p2p.displayName.v1');
      if(stored) return String(stored).slice(0, 48);
    } catch(err){}
    return 'Player ' + state.descriptor.localPlayerId;
  }
  function openStudio(){
    if(root.LK_P2P_COLLABORATION && root.LK_P2P_COLLABORATION.open){ root.LK_P2P_COLLABORATION.open(); return true; }
    return false;
  }

  /* -------------------------------------------------------------------------
     6. HUD
     Roster plus one line of honest connection reality. The NAT warning is shown
     to the PLAYER, not buried in documentation, because "it just never
     connects" is the single most common way browser P2P wastes someone's hour.
  ------------------------------------------------------------------------- */
  const HUD_CORNERS = Object.freeze({
    'top-left':'top:14px;left:14px', 'top-right':'top:14px;right:14px',
    'bottom-left':'bottom:14px;left:14px', 'bottom-right':'bottom:14px;right:14px',
  });
  function buildHud(){
    if(typeof document === 'undefined' || !state.descriptor.hud.enabled) return null;
    if(state.hud) return state.hud;
    const node = document.createElement('div');
    node.id = 'lkMultiplayerHud';
    node.setAttribute('style', 'position:fixed;z-index:9200;min-width:190px;max-width:280px;padding:9px 11px;border-radius:9px;'
      + 'background:rgba(8,12,22,.72);border:1px solid rgba(125,211,252,.35);color:#dbeafe;'
      + 'font:12px/1.5 system-ui,sans-serif;pointer-events:none;backdrop-filter:blur(4px);'
      + (HUD_CORNERS[state.descriptor.hud.position] || HUD_CORNERS['top-left']));
    document.body.appendChild(node);
    state.hud = node;
    refreshHud();
    return node;
  }
  function destroyHud(){
    if(state.hud && state.hud.parentNode) state.hud.parentNode.removeChild(state.hud);
    state.hud = null;
  }
  function refreshHud(){
    if(!state.hud) return;
    const layer = net();
    const snapshot = layer ? layer.snapshot() : null;
    const rows = [];
    rows.push('<b style="color:#7dd3fc">' + escapeHtml(state.descriptor.sessionName) + '</b>');
    rows.push('<span style="opacity:.72">' + escapeHtml(state.descriptor.mode) + ' &middot; max ' + state.descriptor.maxPlayers + '</span>');
    if(snapshot && state.descriptor.hud.showRoster){
      const players = snapshot.players || [];
      if(players.length){
        rows.push('<div style="margin-top:6px;border-top:1px solid rgba(125,211,252,.22);padding-top:5px">'
          + players.map(entry => '<div>' + (entry.host ? '&#9733; ' : '') + escapeHtml(entry.name)
            + ' <span style="opacity:.6">P' + entry.playerId + (entry.latency ? ' &middot; ' + entry.latency + 'ms' : '') + '</span></div>').join('')
          + '</div>');
      } else {
        rows.push('<div style="margin-top:6px;opacity:.7">Waiting for players&hellip;</div>');
      }
    }
    if(snapshot && state.descriptor.hud.showNetwork && snapshot.running){
      rows.push('<div style="margin-top:5px;opacity:.6">' + escapeHtml(snapshot.role) + ' &middot; ' + snapshot.tickRate + ' Hz &middot; '
        + Math.round(state.descriptor.interpolationDelay * 1000) + ' ms interp &middot; term ' + snapshot.epoch + '</div>');
      if(snapshot.transportConnected === false){
        rows.push('<div style="margin-top:4px;color:#fbbf24">Host elected, but this star session has no surviving guest-to-guest link. Reconnect signaling is required.</div>');
      }
    }
    if(!snapshot || !snapshot.running){
      rows.push('<div style="margin-top:6px;color:#fbbf24">Not connected. Open the P2P session studio and exchange an invite code.</div>');
      rows.push('<div style="margin-top:4px;opacity:.62">Serverless signaling with default STUN: LAN and many home networks work directly; '
        + 'restrictive NAT/firewalls require private TURN. See docs/P2P_SESSIONS_AND_COWORKING.md.</div>');
    }
    if(state.lastStatus) rows.push('<div style="margin-top:5px;opacity:.8">' + escapeHtml(state.lastStatus) + '</div>');
    state.hud.innerHTML = rows.join('');
  }
  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, chr => (
      {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[chr]
    ));
  }

  /* -------------------------------------------------------------------------
     7. FRAME STAGE, INSTALLATION, PUBLIC API
     The frame stage does nothing per-frame except billboard the nameplates and
     refresh the HUD twice a second. All networking happens on the fixed tick
     inside the replication layer.
  ------------------------------------------------------------------------- */
  function update(dt){
    if(!state.running) return;
    if(!state.session) retry();
    state.hudTimer += Math.max(0, Number(dt) || 0);
    if(state.hudTimer >= .5){
      state.hudTimer = 0;
      refreshHud();
    }
  }
  function installFrameHook(){
    if(state.frameHookInstalled || !GAME || !GAME.hooks || !Array.isArray(GAME.hooks.frame)) return false;
    state.frameHookInstalled = true;
    state.frameHook = dt => update(dt);
    GAME.hooks.frame.push(state.frameHook);
    return true;
  }
  function uninstallFrameHook(){
    if(state.frameHook && GAME && GAME.hooks && Array.isArray(GAME.hooks.frame)){
      const index = GAME.hooks.frame.indexOf(state.frameHook);
      if(index >= 0) GAME.hooks.frame.splice(index, 1);
    }
    state.frameHook = null;
    state.frameHookInstalled = false;
  }
  function snapshot(){
    const layer = net();
    return {
      schemaVersion:SCHEMA_VERSION,
      running:state.running,
      descriptor:JSON.parse(JSON.stringify(state.descriptor)),
      spawnPointCount:state.resolved.spawnPoints.length,
      hasLocalAvatar:!!state.resolved.localAvatar,
      hasPrefab:!!state.resolved.prefab,
      teamZoneCount:state.resolved.teamZones.length,
      session:layer ? layer.snapshot() : null,
      status:state.lastStatus,
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    load, loadFromGraph, normalize, applyGraphBindings,
    start, stop, retry, update, snapshot, status,
    openStudio, resolveScene, objectsWithRole,
    descriptor:() => JSON.parse(JSON.stringify(state.descriptor)),
    running:() => state.running,
  });
}

/* ---------------------------------------------------------------------------
   INSTALLATION
--------------------------------------------------------------------------- */
function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.multiplayer && GAME.systems.multiplayer.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.multiplayer;
  const director = create(GAME);
  GAME.systems.multiplayer = director;
  return director;
}
function boot(){
  const GAME = root.LOT_KING;
  if(GAME) install(GAME);
}

root.LK_P2P_MULTIPLAYER = Object.freeze({
  SCHEMA_VERSION, MODES, HUD_POSITIONS, MULTIPLAYER_ROLES,
  normalize, describeRole, roleOf, create, install, boot,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_P2P_MULTIPLAYER;
if(root.LOT_KING) boot();
else if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
})();
