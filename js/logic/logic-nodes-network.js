/* =========================================================
   LOT KING - Network / Multiplayer Logic node pack

   Graph surface for the three P2P runtime modules:
     js/runtime/p2p-session.js               transport
     js/runtime/p2p-replication.js           host-authoritative session
     js/runtime/p2p-multiplayer-director.js  the editor-authored mode

   Read order (and the order of the numbered sections below):
     1. Pin helpers and service lookups
     2. Multiplayer mode - start, stop, match flow
     3. Session queries - am I host, who is connected, what is my player id
     4. Messaging - send an event, publish a replicated variable
     5. Events - joined, left, match started, message, variable changed
     6. Transport utilities - open the studio, disconnect

   A node never reaches into the transport directly: it asks the director or the
   replication layer, so the authority checks and the payload validation in
   js/runtime/p2p-protocol.js cannot be bypassed by authoring a graph.
   ========================================================= */
(function(){
'use strict';

/* ---------------------------------------------------------------------------
   1. PIN HELPERS AND SERVICE LOOKUPS
--------------------------------------------------------------------------- */
const execIn = {name:'exec', kind:'exec', direction:'input'};
const thenOut = {name:'completed', kind:'exec', direction:'output'};
const eventOut = {name:'then', kind:'exec', direction:'output'};
const dataIn = (name, type, value) => ({name, kind:'data', direction:'input', type:type || 'any', defaultValue:value});
const dataOut = (name, type) => ({name, kind:'data', direction:'output', type:type || 'any'});
const number = value => Number(value) || 0;
const text = value => value == null ? '' : String(value);

function game(api){ return api && api.context && api.context.GAME || null; }
/** The authored Multiplayer Mode director for this level. */
function director(api){
  const GAME = game(api);
  if(GAME && GAME.systems && GAME.systems.multiplayer) return GAME.systems.multiplayer;
  const factory = typeof window !== 'undefined' && window.LK_P2P_MULTIPLAYER;
  return factory && GAME && factory.install ? factory.install(GAME) : null;
}
/** The host-authoritative session layer underneath the director. */
function net(api){
  const GAME = game(api);
  if(GAME && GAME.systems && GAME.systems.p2pReplication) return GAME.systems.p2pReplication;
  const factory = typeof window !== 'undefined' && window.LK_P2P_REPLICATION;
  return factory && GAME && factory.install ? factory.install(GAME) : null;
}
/** Session snapshot with a safe empty shape, so every read pin has an answer
 *  even before anyone has connected. */
function sessionState(api){
  const layer = net(api);
  const snapshot = layer ? layer.snapshot() : null;
  return snapshot || {role:'idle', running:false, started:false, players:[], localPlayerId:0, localNetId:0, replicaCount:0, tick:0};
}

function registerNetworkNodes(registry){
  /* -------------------------------------------------------------------------
     2. MULTIPLAYER MODE
  ------------------------------------------------------------------------- */
  registry.register({
    type:'multiplayer.start', title:'Start Multiplayer Mode', category:'Multiplayer',
    description:"Loads this Logic Element's Multiplayer Mode data and arms the session: spawn points, remote player prefab, tick rate and HUD all come from the Inspector.",
    inputs:[execIn, dataIn('settings', 'any', null)],
    outputs:[thenOut, dataOut('started', 'boolean')],
    run(api){
      const mode = director(api);
      let started = false;
      if(mode){
        const explicit = api.getInput('settings');
        if(explicit && typeof explicit === 'object') mode.load(explicit);
        else mode.loadFromGraph(api.context && api.context.graph);
        started = mode.start();
      }
      api.node.data.__started = started === true;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__started === true; },
  });
  registry.register({
    type:'multiplayer.stop', title:'Stop Multiplayer Mode', category:'Multiplayer',
    description:'Closes the replicated session, removes every remote avatar and hides the multiplayer HUD.',
    inputs:[execIn], outputs:[thenOut],
    run(api){ const mode = director(api); if(mode) mode.stop(); return {exec:'completed'}; },
  });
  registry.register({
    type:'multiplayer.startMatch', title:'Start Match', category:'Multiplayer',
    description:'Host only. Leaves the lobby and tells every connected peer the match has begun.',
    inputs:[execIn], outputs:[thenOut, dataOut('started', 'boolean')],
    run(api){
      const layer = net(api);
      api.node.data.__match = !!(layer && layer.startMatch());
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__match === true; },
  });

  /* -------------------------------------------------------------------------
     3. SESSION QUERIES
  ------------------------------------------------------------------------- */
  registry.register({
    type:'multiplayer.isHost', title:'Is Host', category:'Multiplayer',
    description:'True on the browser that created the invitation. Use it to run host-only gameplay once instead of once per peer.',
    outputs:[dataOut('isHost', 'boolean'), dataOut('role', 'string')],
    evaluate(api, pin){
      const info = sessionState(api);
      return pin === 'role' ? text(info.role) : info.role === 'host';
    },
  });
  registry.register({
    type:'multiplayer.getSession', title:'Get Multiplayer Session', category:'Multiplayer',
    description:'Live session readout: connection flags, player count, this browser player id and the network tick.',
    outputs:[
      dataOut('connected', 'boolean'), dataOut('started', 'boolean'),
      dataOut('playerCount', 'number'), dataOut('localPlayerId', 'number'),
      dataOut('remoteCount', 'number'), dataOut('tick', 'number'),
    ],
    evaluate(api, pin){
      const info = sessionState(api);
      if(pin === 'connected') return info.running === true;
      if(pin === 'started') return info.started === true;
      if(pin === 'playerCount') return (info.players || []).length;
      if(pin === 'localPlayerId') return number(info.localPlayerId);
      if(pin === 'remoteCount') return number(info.replicaCount);
      return number(info.tick);
    },
  });
  registry.register({
    type:'multiplayer.getPlayer', title:'Get Networked Player', category:'Multiplayer',
    description:'Reads one entry of the host-owned roster by player id.',
    inputs:[dataIn('playerId', 'number', 1)],
    outputs:[dataOut('found', 'boolean'), dataOut('name', 'string'), dataOut('team', 'number'), dataOut('latency', 'number'), dataOut('isHost', 'boolean')],
    evaluate(api, pin){
      const info = sessionState(api);
      const wanted = number(api.getInput('playerId'));
      const entry = (info.players || []).find(item => item && item.playerId === wanted) || null;
      if(!entry) return pin === 'name' ? '' : (pin === 'found' || pin === 'isHost' ? false : 0);
      if(pin === 'found') return true;
      if(pin === 'name') return text(entry.name);
      if(pin === 'team') return number(entry.team);
      if(pin === 'latency') return number(entry.latency);
      return entry.host === true;
    },
  });

  /* -------------------------------------------------------------------------
     4. MESSAGING
  ------------------------------------------------------------------------- */
  registry.register({
    type:'network.send', title:'Send P2P Message', category:'Multiplayer',
    description:'Sends a JSON-compatible payload to every connected peer on an application channel. Reliable and ordered.',
    inputs:[execIn, dataIn('channel', 'string', 'gameplay'), dataIn('payload', 'any', null)],
    outputs:[thenOut, dataOut('peerCount', 'number'), dataOut('success', 'boolean')],
    run(api){
      const layer = net(api);
      const count = layer && layer.snapshot().running
        ? layer.sendEvent(text(api.getInput('channel')) || 'gameplay', api.getInput('payload'))
        : (api.services.network ? api.services.network.send(api.getInput('channel'), api.getInput('payload')) : 0);
      api.node.data.__peerCount = number(count);
      return {exec:'completed'};
    },
    evaluate(api, pin){
      const count = number(api.node.data.__peerCount);
      return pin === 'success' ? count > 0 : count;
    },
  });
  registry.register({
    type:'multiplayer.setVariable', title:'Set Replicated Variable', category:'Multiplayer',
    description:'Host only. Publishes one named value to every peer; each of them raises On Replicated Variable Changed.',
    inputs:[execIn, dataIn('name', 'string', 'score'), dataIn('value', 'any', 0)],
    outputs:[thenOut, dataOut('published', 'boolean')],
    run(api){
      const layer = net(api);
      api.node.data.__published = !!(layer && layer.setVariable(text(api.getInput('name')), api.getInput('value')));
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__published === true; },
  });

  /* -------------------------------------------------------------------------
     5. EVENTS
  ------------------------------------------------------------------------- */
  registry.register({
    type:'event.onNetworkMessage', title:'On Network Message', category:'Multiplayer Events',
    description:'Runs when a connected WebRTC peer sends the selected Logic channel.', event:'OnNetworkMessage',
    inputs:[dataIn('channel', 'string', 'gameplay')],
    outputs:[eventOut, dataOut('payload', 'any'), dataOut('peerId', 'string'), dataOut('peerName', 'string'), dataOut('channel', 'string')],
  });
  registry.register({
    type:'event.onNetworkPlayerJoined', title:'On Player Joined', category:'Multiplayer Events',
    description:'Runs on every peer when a new player is admitted to the session.', event:'OnNetworkPlayerJoined',
    outputs:[eventOut, dataOut('playerId', 'number'), dataOut('name', 'string'), dataOut('netId', 'number')],
  });
  registry.register({
    type:'event.onNetworkPlayerLeft', title:'On Player Left', category:'Multiplayer Events',
    description:'Runs when a player disconnects, is kicked or leaves on purpose.', event:'OnNetworkPlayerLeft',
    outputs:[eventOut, dataOut('playerId', 'number'), dataOut('name', 'string'), dataOut('reason', 'string')],
  });
  registry.register({
    type:'event.onNetworkMatchStarted', title:'On Match Started', category:'Multiplayer Events',
    description:'Runs on every peer when the host leaves the lobby and starts the match.', event:'OnNetworkMatchStarted',
    outputs:[eventOut, dataOut('seed', 'number')],
  });
  registry.register({
    type:'event.onNetworkVariableChanged', title:'On Replicated Variable Changed', category:'Multiplayer Events',
    description:'Runs when the host publishes a replicated variable.', event:'OnNetworkVariableChanged',
    outputs:[eventOut, dataOut('name', 'string'), dataOut('value', 'any')],
  });

  /* -------------------------------------------------------------------------
     6. TRANSPORT UTILITIES
  ------------------------------------------------------------------------- */
  registry.register({
    type:'network.connected', title:'P2P Connected', category:'Multiplayer',
    description:'Reports whether at least one encrypted peer channel is open.',
    outputs:[dataOut('connected', 'boolean'), dataOut('peerCount', 'number'), dataOut('role', 'string')],
    evaluate(api, pin){
      const info = api.services.network ? api.services.network.state() : {};
      if(pin === 'peerCount') return number(info.peerCount);
      if(pin === 'role') return text(info.role) || 'idle';
      return number(info.peerCount) > 0;
    },
  });
  registry.register({
    type:'network.openSessionStudio', title:'Open P2P Session Studio', category:'Multiplayer',
    description:'Opens the serverless offer/answer session UI in editor, preview or exported gameplay. This is how a player hosts or joins.',
    inputs:[execIn], outputs:[thenOut],
    run(api){
      const mode = director(api);
      if(mode && mode.openStudio()) return {exec:'completed'};
      if(api.services.network) api.services.network.openStudio();
      return {exec:'completed'};
    },
  });
  registry.register({
    type:'network.disconnect', title:'Disconnect P2P Session', category:'Multiplayer',
    description:'Closes every peer connection owned by this browser instance.',
    inputs:[execIn], outputs:[thenOut],
    run(api){
      const mode = director(api);
      if(mode) mode.stop();
      if(api.services.network) api.services.network.disconnect();
      return {exec:'completed'};
    },
  });

  return registry;
}

const packs = window.LK_LOGIC_NODE_PACKS || (window.LK_LOGIC_NODE_PACKS = []);
packs.push(registerNetworkNodes);
window.LK_LOGIC_NODES_NETWORK = Object.freeze({register:registerNetworkNodes});
})();
