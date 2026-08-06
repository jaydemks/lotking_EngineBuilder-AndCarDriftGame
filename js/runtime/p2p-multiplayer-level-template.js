/* =========================================================
   LOT KING - P2P Multiplayer Arena level template

   A ready-made multiplayer level, so "add multiplayer to my game" is one click
   in the New Level dialog rather than an assembly job. Everything it builds is
   an ordinary `scene.added` entry: it shows up in the outliner, it can be
   moved, renamed, duplicated or deleted, and it is saved in the project like
   anything else. There is no hidden multiplayer geometry.

   Read order (and the order of the numbered sections below):
     1. Palette and scene entry helpers
     2. The arena shell - floor and boundary
     3. The associated multiplayer assets - spawns, lobby, team zones, prefab
     4. The Logic Elements - Multiplayer Mode plus a playable character
     5. Environment and registration

   The associated assets are recognised BY NAME by
   js/runtime/p2p-multiplayer-director.js ("MP Spawn n", "MP Player Prefab",
   "MP Lobby", "MP Team n"), which is why duplicating a spawn marker in the
   outliner and renaming it is all it takes to add a fifth spawn point.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const TEMPLATE_ID = 'p2p-multiplayer-arena';
const SOURCE = 'Lot King multiplayer arena';

/* ---------------------------------------------------------------------------
   1. PALETTE AND SCENE ENTRY HELPERS
--------------------------------------------------------------------------- */
const PALETTE = Object.freeze({
  floor:0x2f3a4b,
  grid:0x415067,
  wall:0x4a5a72,
  spawn:0x38bdf8,
  lobby:0xfacc15,
  teamA:0x60a5fa,
  teamB:0xf87171,
  prefab:0x94a3b8,
});

function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }

function buildScene(baseScene){
  const scene = baseScene || {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}, logic:{}};
  scene.added = (scene.added || []).filter(entry => !(entry && entry.name === 'Ground' && entry.asset && entry.asset.source === 'Editor primitive'));
  let seq = 0;

  function add(name, prim, position, halfSize, color, collide, options){
    options = options || {};
    const id = 'mp_arena_' + String(++seq).padStart(3, '0');
    scene.added.push({
      id, kind:'primitive', prim, name, collide:collide === true,
      props:Object.assign({color, roughness:.82, metalness:.04, centered:true}, options.props || {}),
      t:{
        p:position.slice(),
        r:(options.rotation || [0, 0, 0]).slice(),
        s:halfSize.slice(),
        v:options.visible !== false,
      },
      asset:{key:'primitive:' + prim, name, source:SOURCE},
      templateGroup:options.group || 'Multiplayer',
      driveSurface:options.driveSurface === true,
    });
    return id;
  }
  function box(name, position, size, color, collide, options){
    return add(name, 'box', position, [size[0] / 2, size[1] / 2, size[2] / 2], color, collide, options);
  }
  function plane(name, position, width, depth, color, options){
    return add(name, 'plane', position, [width / 4, 1, depth / 4], color, false, options);
  }
  function cylinder(name, position, radius, height, color, collide, options){
    return add(name, 'cylinder', position, [radius, height / 2, radius], color, collide, options);
  }

  /* -------------------------------------------------------------------------
     2. THE ARENA SHELL
  ------------------------------------------------------------------------- */
  const HALF = 26;
  plane('Arena Floor', [0, 0, 0], HALF * 2, HALF * 2, PALETTE.floor, {
    rotation:[-Math.PI / 2, 0, 0], group:'Arena', driveSurface:true,
  });
  plane('Arena Centre Circle', [0, .012, 0], 9, 9, PALETTE.grid, {
    rotation:[-Math.PI / 2, 0, 0], group:'Arena', props:{materialModel:'unlit'},
  });
  [
    ['North', [0, 1.4, -HALF], [HALF * 2, 2.8, .6]],
    ['South', [0, 1.4, HALF], [HALF * 2, 2.8, .6]],
    ['East', [HALF, 1.4, 0], [.6, 2.8, HALF * 2]],
    ['West', [-HALF, 1.4, 0], [.6, 2.8, HALF * 2]],
  ].forEach(wall => box('Arena Wall ' + wall[0], wall[1], wall[2], PALETTE.wall, true, {group:'Arena'}));

  /* -------------------------------------------------------------------------
     3. THE ASSOCIATED MULTIPLAYER ASSETS
     Named exactly the way the director's MULTIPLAYER_ROLES table expects.
  ------------------------------------------------------------------------- */
  const SPAWNS = [
    [-9, -9], [9, -9], [9, 9], [-9, 9],
  ];
  SPAWNS.forEach((point, index) => {
    const group = 'Multiplayer / Spawns';
    // The marker itself is the spawn point: the director reads its position.
    cylinder('MP Spawn ' + (index + 1), [point[0], .06, point[1]], 1.1, .12, PALETTE.spawn, false, {
      group, props:{materialModel:'unlit', opacity:.85},
    });
    box('MP Spawn ' + (index + 1) + ' Post', [point[0], .9, point[1]], [.12, 1.7, .12], PALETTE.spawn, false, {
      group, props:{materialModel:'unlit'},
    });
  });

  // The waiting area shown before the host starts the match.
  cylinder('MP Lobby', [0, .05, 0], 4.5, .1, PALETTE.lobby, false, {
    group:'Multiplayer / Lobby', props:{materialModel:'unlit', opacity:.35},
  });

  // Two team zones. The trailing number is the team index the director reads.
  plane('MP Team 1', [0, .02, -15], 44, 18, PALETTE.teamA, {
    rotation:[-Math.PI / 2, 0, 0], group:'Multiplayer / Teams', props:{materialModel:'unlit', opacity:.22},
  });
  plane('MP Team 2', [0, .02, 15], 44, 18, PALETTE.teamB, {
    rotation:[-Math.PI / 2, 0, 0], group:'Multiplayer / Teams', props:{materialModel:'unlit', opacity:.22},
  });

  // The object cloned once per remote player. Hidden during play: only the
  // clones are shown. Swap it for any imported model to change how peers look.
  box('MP Player Prefab', [-HALF + 2, .9, -HALF + 2], [.6, 1.8, .6], PALETTE.prefab, false, {
    group:'Multiplayer / Players', props:{roughness:.6},
  });

  /* -------------------------------------------------------------------------
     4. THE LOGIC ELEMENTS
  ------------------------------------------------------------------------- */
  function logic(name, graph, position, rotation, group){
    if(!graph) return null;
    const id = 'mp_arena_' + String(++seq).padStart(3, '0');
    scene.added.push({
      id, kind:'logicElement', name, collide:false, graph:clone(graph), enabled:true, runInEditorPreview:true,
      asset:{key:'logic:template:' + name, name, source:SOURCE},
      t:{p:position.slice(), r:rotation.slice(), s:[1, 1, 1], v:true},
      templateGroup:group || 'Multiplayer',
    });
    return id;
  }
  function templateGraph(templateId){
    const templates = root.LK_LOGIC_TEMPLATES;
    const entry = templates && templates.get ? templates.get(templateId) : null;
    return entry && entry.graph ? entry.graph : null;
  }

  // The mode itself. Built from the template module directly when it is loaded,
  // so the arena does not depend on template registration having happened yet.
  const multiplayerGraph = root.LK_LOGIC_TEMPLATES_NETWORK && root.LK_LOGIC_TEMPLATES_NETWORK.makeMultiplayerGraph
    ? root.LK_LOGIC_TEMPLATES_NETWORK.makeMultiplayerGraph({
      sessionName:'Multiplayer Arena',
      mode:'versus',
      maxPlayers:4,
      teams:2,
    })
    : templateGraph('logic-template-multiplayer-mode');
  logic('Multiplayer Mode', multiplayerGraph, [0, 0, 0], [0, 0, 0], 'Multiplayer');

  // Something to actually play. The character template is optional: an author
  // who wants vehicles deletes this one and drops a Vehicle Pawn in its place.
  const characterGraph = templateGraph('logic-template-player-character-normal');
  if(characterGraph){
    const configured = clone(characterGraph);
    if(configured.characterPawn){
      configured.characterPawn.spawn = {x:SPAWNS[0][0], y:0, z:SPAWNS[0][1], heading:Math.PI * .75};
    }
    logic('Player Character', configured, [SPAWNS[0][0], 0, SPAWNS[0][1]], [0, Math.PI * .75, 0], 'Players');
  }

  /* -------------------------------------------------------------------------
     5. ENVIRONMENT
  ------------------------------------------------------------------------- */
  scene.env = Object.assign({}, scene.env || {}, {
    skyTime:.42,
    dayLength:999999,
    procEnvEnabled:true,
    procEnvIntensity:1,
    backgroundColor:'#101827',
    fog:{enabled:true, color:'#131c2b', near:60, far:150},
  });
  scene.template = {
    id:TEMPLATE_ID,
    name:'P2P Multiplayer Arena',
    version:1,
    nativeEditable:true,
    multiplayer:{
      transport:'WebRTC DataChannel, serverless invite codes',
      authority:'host-authoritative session, client-owned avatars',
      note:'Default STUN covers LAN and many home networks; restrictive networks require private TURN. See docs/P2P_SESSIONS_AND_COWORKING.md.',
    },
  };
  return scene;
}

root.LK_RUNTIME_P2P_MULTIPLAYER_LEVEL_TEMPLATE = Object.freeze({id:TEMPLATE_ID, name:'P2P Multiplayer Arena', buildScene});

if(root.LK_LEVEL_TEMPLATES && root.LK_LEVEL_TEMPLATES.register){
  root.LK_LEVEL_TEMPLATES.register({
    id:TEMPLATE_ID,
    name:'P2P Multiplayer Arena',
    nameIt:'Arena multigiocatore P2P',
    // The registry's CATEGORIES list has no Multiplayer entry yet; 'Character'
    // is where this arena belongs today because it ships a Character Pawn.
    category:'Character',
    order:260,
    ground:'none',
    keepBuiltinPlayer:false,
    description:'Peer-to-peer multiplayer arena with spawn points, lobby, team zones and a ready Multiplayer Mode element.',
    descriptionIt:'Arena multigiocatore peer-to-peer con spawn point, lobby, zone squadra e un elemento Multiplayer Mode pronto.',
    build:function(scene){ return buildScene(scene); },
  });
}
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_P2P_MULTIPLAYER_LEVEL_TEMPLATE;
})();
