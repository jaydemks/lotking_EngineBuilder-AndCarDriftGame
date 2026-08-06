/* =========================================================
   LOT KING - Multiplayer Mode template

   The editor-facing authoring surface for js/runtime/p2p-multiplayer-director.js.
   Drop one "Multiplayer Mode (P2P)" Logic Element into a level, fill in the
   Inspector, and the level is multiplayer: lobby, player ids, remote avatars,
   transform replication and the roster HUD all run in Play Preview, in
   gameplay.html and in the playable export without a line of code.

   Read order (and the order of the numbered sections below):
     1. Graph helpers
     2. Exposed variables, grouped by Inspector category
     3. The authored descriptor written to graph.multiplayerDirector
     4. The graph itself
     5. Registration

   EVERY setting below is `exposed:true` with a `binding`, which is what makes it
   appear as an editable row in the Logic Element Inspector and what lets the
   director read the author's value back out. Nothing about the mode is reachable
   only from code.
   ========================================================= */
(function(){
'use strict';

/* ---------------------------------------------------------------------------
   1. GRAPH HELPERS
--------------------------------------------------------------------------- */
function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function node(id, type, x, y, data){ return {id, type, x:x || 0, y:y || 0, data:Object.assign({}, data || {})}; }
function edge(id, fromNode, fromPin, toNode, toPin){ return {id, from:{node:fromNode, pin:fromPin}, to:{node:toNode, pin:toPin}}; }
function variable(name, type, value, binding, label, category, extra){
  return Object.assign({name, type, value, exposed:true, binding, label, category}, extra || {});
}
function numberVar(name, value, binding, label, category, min, max, step){
  return variable(name, 'number', value, binding, label, category, {min, max, step});
}
function selectVar(name, value, binding, label, category, options){
  return variable(name, 'string', value, binding, label, category, {
    ui:'select',
    options:options.map(item => ({value:item[0], label:item[1]})),
  });
}

const COLOR = '#38bdf8';

/* ---------------------------------------------------------------------------
   2. EXPOSED VARIABLES, GROUPED BY INSPECTOR CATEGORY

   Categories are listed in the order an author fills them in:
     Session -> Teams -> Netcode -> Players -> Scene Assets -> HUD
--------------------------------------------------------------------------- */
function multiplayerVariables(spec){
  return [
    // -------------------------------------------------------------- Session
    variable('MultiplayerEnabled', 'boolean', true, 'enabled', 'Multiplayer Enabled', 'Session'),
    variable('SessionName', 'string', spec.sessionName, 'sessionName', 'Session Name', 'Session'),
    selectVar('SessionMode', spec.mode, 'mode', 'Mode', 'Session', [
      ['co-op', 'Co-op (play together)'],
      ['versus', 'Versus (play against)'],
      ['free-roam', 'Free roam (no rules)'],
    ]),
    numberVar('MaxPlayers', spec.maxPlayers, 'maxPlayers', 'Max Players', 'Session', 2, 8, 1),
    variable('AutoStartMatch', 'boolean', spec.autoStart !== false, 'autoStart', 'Start Match Automatically', 'Session'),

    // ---------------------------------------------------------------- Teams
    numberVar('TeamCount', spec.teams, 'teams', 'Teams (0 = free for all)', 'Teams', 0, 4, 1),
    variable('FriendlyFire', 'boolean', spec.friendlyFire === true, 'friendlyFire', 'Friendly Fire', 'Teams'),

    // -------------------------------------------------------------- Netcode
    // Defaults follow the classic Source/Gaffer starting point: a 20 Hz
    // snapshot rate played back 100 ms in the past. Raising the tick rate costs
    // bandwidth; lowering the interpolation delay costs smoothness on a jittery
    // link. Both are here so the author can trade them off per level.
    numberVar('TickRate', spec.tickRate, 'tickRate', 'Network Tick Rate (Hz)', 'Netcode', 5, 60, 1),
    numberVar('InterpolationDelay', spec.interpolationDelay, 'interpolationDelay', 'Interpolation Delay (s)', 'Netcode', .02, .5, .01),
    numberVar('BandwidthBudget', spec.bandwidthBudget, 'bandwidthBudget', 'Bandwidth Budget (kB/s)', 'Netcode', 4, 256, 1),

    // -------------------------------------------------------------- Players
    numberVar('LocalPlayerId', spec.localPlayerId, 'localPlayerId', 'Local Player Slot', 'Players', 1, 4, 1),
    variable('LocalAvatarId', 'string', '', 'localAvatarId', 'Local Avatar Object Id (blank = possessed pawn)', 'Players'),
    variable('RemotePrefabId', 'string', '', 'remotePrefabId', 'Remote Player Prefab Object Id', 'Players'),

    // --------------------------------------------------------- Scene Assets
    // The associated props an author places in the level. Names decide the role:
    // "MP Spawn 1", "MP Player Prefab", "MP Lobby", "MP Team 1".
    variable('ShowSpawnMarkers', 'boolean', true, 'assets.spawnMarkers', 'Show Spawn Markers', 'Scene Assets'),
    variable('ShowNameplates', 'boolean', true, 'assets.nameplates', 'Show Player Nameplates', 'Scene Assets'),
    variable('ShowLobbyVolume', 'boolean', true, 'assets.lobbyVolume', 'Show Lobby Volume', 'Scene Assets'),
    variable('ShowTeamZones', 'boolean', true, 'assets.teamZones', 'Show Team Zones', 'Scene Assets'),

    // ------------------------------------------------------------------ HUD
    variable('HudEnabled', 'boolean', true, 'hud.enabled', 'Show Multiplayer HUD', 'HUD'),
    selectVar('HudPosition', 'top-left', 'hud.position', 'HUD Corner', 'HUD', [
      ['top-left', 'Top left'], ['top-right', 'Top right'],
      ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right'],
    ]),
    variable('HudShowRoster', 'boolean', true, 'hud.showRoster', 'Show Player Roster', 'HUD'),
    variable('HudShowNetwork', 'boolean', true, 'hud.showNetwork', 'Show Network Readout', 'HUD'),
  ];
}

/* ---------------------------------------------------------------------------
   3. THE AUTHORED DESCRIPTOR
   Mirrors the variable list above. The director merges the exposed variables
   over this object at start, so the two can never drift apart.
--------------------------------------------------------------------------- */
function makeDescriptor(spec){
  return {
    schemaVersion:1,
    template:true,
    enabled:true,
    sessionName:spec.sessionName,
    mode:spec.mode,
    maxPlayers:spec.maxPlayers,
    teams:spec.teams,
    friendlyFire:spec.friendlyFire === true,
    tickRate:spec.tickRate,
    interpolationDelay:spec.interpolationDelay,
    bandwidthBudget:spec.bandwidthBudget,
    autoStart:spec.autoStart !== false,
    localPlayerId:spec.localPlayerId,
    localAvatarId:'',
    remotePrefabId:'',
    assets:{spawnMarkers:true, nameplates:true, lobbyVolume:true, teamZones:true},
    hud:{enabled:true, position:'top-left', showRoster:true, showNetwork:true},
  };
}

function makeLogicScene(spec){
  return {
    root:{
      id:'root', name:spec.name + ' Root', type:'empty', linked:true,
      position:[0, 0, 0], rotation:[0, 0, 0], scale:[1, 1, 1], color:COLOR,
    },
    elements:[],
    components:[
      {id:'root_transform', elementId:'root', name:'Transform', type:'transform', linked:true},
      {id:'multiplayer_director', elementId:'root', name:'Multiplayer Mode', type:'multiplayer-director', linked:true},
    ],
  };
}

/* ---------------------------------------------------------------------------
   4. THE GRAPH
   Deliberately tiny: the mode is authored in the Inspector, and the graph only
   arms it and reacts to who comes and goes.
--------------------------------------------------------------------------- */
function makeGraph(spec){
  const graph = {
    version:1,
    name:spec.templateName,
    scope:'element',
    enabled:true,
    variables:multiplayerVariables(spec),
    nodes:[
      node('on_start', 'event.onStart', 80, 110),
      node('start_multiplayer', 'multiplayer.start', 340, 110),
      node('on_joined', 'event.onNetworkPlayerJoined', 80, 280),
      node('joined_log', 'debug.print', 400, 280, {message:'A player joined the session.', duration:3}),
      node('on_left', 'event.onNetworkPlayerLeft', 80, 420),
      node('left_log', 'debug.print', 400, 420, {message:'A player left the session.', duration:3}),
    ],
    edges:[
      edge('e_start', 'on_start', 'then', 'start_multiplayer', 'exec'),
      edge('e_joined', 'on_joined', 'then', 'joined_log', 'exec'),
      edge('e_left', 'on_left', 'then', 'left_log', 'exec'),
    ],
    comments:[{
      id:'multiplayer_info',
      title:'Multiplayer Mode (P2P). Everything is authored in the Inspector. Place the associated props by NAME: '
        + '"MP Spawn 1..N" for spawn points, "MP Player Prefab" for the object cloned per remote player, '
        + '"MP Lobby" for the waiting area, "MP Team 1..N" for team zones. '
        + 'Connection is serverless WebRTC: players exchange an invite code out of band. Same network works; '
        + 'restrictive networks need private TURN. See docs/P2P_SESSIONS_AND_COWORKING.md.',
      x:35, y:30, w:860, h:64, color:COLOR,
    }],
    subgraphs:[],
  };
  graph.logicScene = makeLogicScene(spec);
  graph.multiplayerDirector = makeDescriptor(spec);
  return graph;
}

const SPEC = {
  name:'Multiplayer Mode',
  templateName:'Multiplayer Mode (P2P)',
  sessionName:'Lot King session',
  mode:'co-op',
  maxPlayers:4,
  teams:0,
  friendlyFire:false,
  tickRate:20,
  interpolationDelay:.1,
  bandwidthBudget:24,
  autoStart:true,
  localPlayerId:1,
};

/** Level templates call this to ship a pre-authored multiplayer mode without
 *  duplicating the variable list or the graph. */
function makeMultiplayerGraph(overrides){
  return makeGraph(Object.assign({}, SPEC, overrides || {}));
}

function makeTemplates(){
  return [{
    id:'logic-template-multiplayer-mode',
    name:'Multiplayer Mode (P2P)',
    description:'Turns any level into a peer-to-peer multiplayer level: lobby, player ids, remote avatars, '
      + 'transform replication with interpolation, roster HUD. Place "MP Spawn n" objects for spawn points. '
      + 'Serverless WebRTC - players exchange an invite code; cross-network play may need STUN/TURN.',
    category:'Gameplay / Multiplayer',
    graph:makeGraph(SPEC),
  }];
}

/* ---------------------------------------------------------------------------
   5. REGISTRATION
   js/logic/logic-templates.js may not have run yet when this module is injected
   dynamically, so registration retries once the document is ready.
--------------------------------------------------------------------------- */
function register(){
  if(window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.register){
    window.LK_LOGIC_TEMPLATES.register(makeTemplates());
    return true;
  }
  return false;
}
if(!register() && typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register);
  else setTimeout(register, 0);
}

window.LK_LOGIC_TEMPLATES_NETWORK = Object.freeze({SPEC, makeTemplates, makeMultiplayerGraph, makeDescriptor, multiplayerVariables});
})();
