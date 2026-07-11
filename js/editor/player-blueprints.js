/* =========================================================
   LOT KING — EDITOR PLAYER BLUEPRINTS
   Copy, apply, promote, and delete player blueprint assets.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED || {};
  const status = deps.status || function(){};
  const promptEditorAction = deps.promptEditorAction || function(){ return Promise.resolve(null); };
  const confirmEditorAction = deps.confirmEditorAction || function(){ return Promise.resolve(false); };
  const markDirty = deps.markDirty || function(){};
  const refreshOutliner = deps.refreshOutliner || function(){};
  const refreshAssetsPanel = deps.refreshAssetsPanel || function(){};
  const buildInspector = deps.buildInspector || function(){};
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function currentPlayerBlueprint(){
    return STORE.playerBlueprints && STORE.playerBlueprints.collect ? STORE.playerBlueprints.collect(GAME) : (STORE.collect(GAME).player || null);
  }
  function loadBlueprintModel(bp){
    if(!bp || !GAME.player.setModel) return;
    if(!bp.modelSrc && !bp.modelDbKey) return;
    const srcPromise = bp.modelDbKey && window.LK_ASSET_BLOBS
      ? window.LK_ASSET_BLOBS.getUrl(bp.modelDbKey)
      : Promise.resolve(bp.modelSrc);
    srcPromise.then(src => STORE.loadGlbRaw(src).then(sceneRoot => {
      GAME.player.setModel(sceneRoot);
      GAME.player.car.userData.modelSrc = bp.modelSrc || null;
      GAME.player.car.userData.modelDbKey = bp.modelDbKey || null;
      GAME.player.car.userData.modelName = bp.modelName || null;
      if(bp.meshEdits && STORE.applyMeshEdits){
        STORE.applyMeshEdits(sceneRoot, bp.meshEdits);
        GAME.player.car.userData.playerMeshEdits = STORE.normalizeMeshEdits(bp.meshEdits);
      }
    })).catch(err => status('Player model load failed: ' + err.message));
  }
  async function copyPlayerBlueprintAsset(){
    const bp = currentPlayerBlueprint();
    if(!bp){ status(tr('player_car Logic unavailable', 'player_car Logic non disponibile')); return; }
    const name = await promptEditorAction({title:'Copy player_car Logic', message:'Logic asset name:', value:'player_car Logic ' + new Date().toLocaleTimeString(), okText:'Copy'});
    if(!name || !name.trim()) return;
    const asset = STORE.playerBlueprints.saveAsset(name.trim(), bp, {
      makeDefault: true,
      source: {levelId: ED.trackId, levelName: ED.trackName, copiedFrom: 'scene-player'},
      controllerIndex: 0,
    });
    if(!asset){ status(tr('⚠ player_car Logic not saved', '⚠ player_car Logic non salvato')); return; }
    applyPlayerBlueprintAsset(asset.player, {applySpawn:false, silent:true});
    status('player_car Logic copied, promoted to Base, and applied: ' + asset.name);
    refreshAssetsPanel();
  }
  function playerLogicElementAsset(){
    const bp = currentPlayerBlueprint();
    if(!bp || !STORE.logicElementAssets || !window.LK_LOGIC_GRAPH) return null;
    const pawn = JSON.parse(JSON.stringify(bp));
    if(pawn.controllerIndex != null && pawn.enabled === false) pawn.controllerIndex = 0;
    const builtin = window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.get('logic-template-player-car');
    const graph = builtin && builtin.graph
      ? window.LK_LOGIC_GRAPH.clone(builtin.graph)
      : window.LK_LOGIC_GRAPH.createStarterGraph('Player Car Logic Element', 'element');
    const assetRef = bp.modelSrc || bp.modelDbKey ? {
      src:bp.modelSrc || null, dbKey:bp.modelDbKey || null, name:bp.modelName || 'Player Car GLB', fit:5.6,
    } : null;
    graph.name = 'Player Car Logic Element';
    if(assetRef){
      graph.logicScene = {
        root:{id:'root', name:'Player Car Root / Imported GLB', type:'mesh', asset:assetRef, linked:true, position:[0,0,0], rotation:[0,0,0], scale:[1,1,1], color:'#7dd3fc'},
        elements:[],
        components:[
          {id:'root_transform', elementId:'root', name:'Transform', type:'transform', linked:true},
          {id:'root_render', elementId:'root', name:'Imported Player Car Model', type:'render', linked:true},
          {id:'pawn_vehicle', elementId:'root', name:'Vehicle Pawn', type:'player-pawn', linked:true},
          {id:'pawn_collision', elementId:'root', name:'Vehicle Collision', type:'collider', linked:true, config:bp.collision},
        ],
      };
    } else {
      graph.logicScene = graph.logicScene || {root:{id:'root', name:'Player Car Root', type:'empty'}, elements:[], components:[]};
      const collision = (graph.logicScene.components || []).find(item => item && item.id === 'pawn_collision');
      if(collision) collision.config = bp.collision;
    }
    const rig = bp.rigTransforms || {};
    const existingIds = new Set((graph.logicScene.elements || []).map(item => item && item.id));
    Object.keys(rig).filter(id => id !== 'player').forEach((id, order) => {
      const t = rig[id] || {};
      const sceneId = 'rig_' + id.replace(/[^a-z0-9_]+/gi, '_');
      if(existingIds.has(sceneId)) return;
      graph.logicScene.elements.push({
        id:sceneId,
        name:id.replace(/^player_/, '').replace(/_/g, ' '), type:'empty', parentId:'root', linked:true,
        position:t.p || [0,0,0], rotation:t.r || [0,0,0], scale:t.s || [1,1,1], color:'#93c5fd', order,
      });
    });
    const variable = (name, type, value, category) => ({id:'var_' + name, name, type, value, defaultValue:value, exposed:true, category});
    graph.variables = [
      variable('PawnEnabled', 'boolean', bp.enabled !== false, 'Pawn'),
      variable('Hidden', 'boolean', bp.hidden === true, 'Pawn'),
      Object.assign(variable('ControllerPlayerId', 'number', pawn.controllerIndex == null ? -1 : pawn.controllerIndex + 1, 'Input'), {ui:'player-id'}),
      variable('Horsepower', 'number', Number(bp.tuning && bp.tuning.horsepower) || 450, 'Driving'),
      variable('Torque', 'number', Number(bp.tuning && bp.tuning.torque) || 0, 'Driving'),
      variable('MaxSpeed', 'number', Number(bp.tuning && bp.tuning.maxSpeed) || 0, 'Driving'),
      variable('CameraMode', 'string', bp.cam && bp.cam.mode || 'arcade', 'Camera'),
      variable('HeadlightsEnabled', 'boolean', !(bp.lights && bp.lights.enabled === false), 'Lights'),
      variable('ExhaustEnabled', 'boolean', !(bp.exhaust && bp.exhaust.enabled === false), 'Effects'),
      variable('SkidsEnabled', 'boolean', !(bp.skids && bp.skids.enabled === false), 'Effects'),
    ];
    // Full source snapshot is retained for the future multi-Pawn runtime adapter.
    graph.playerPawnBlueprint = pawn;
    return STORE.logicElementAssets.saveAsset('Player Car Logic Element', graph, {
      migration:{kind:'player-pawn-snapshot', version:1, sourceLevelId:ED.trackId || null},
    });
  }
  function applyPlayerBlueprintAsset(player, opts){
    const bp = player && JSON.parse(JSON.stringify(player));
    if(!bp){ status(tr('Invalid player_car Logic', 'player_car Logic non valido')); return; }
    const options = opts || {};
    if(GAME.player.setEnabled) GAME.player.setEnabled(bp.enabled !== false);
    if(GAME.player.setHidden) GAME.player.setHidden(bp.hidden === true);
    if(GAME.player.setControllerIndex) GAME.player.setControllerIndex(Object.prototype.hasOwnProperty.call(bp, 'controllerIndex') ? bp.controllerIndex : 0);
    if(bp.tuning && GAME.player.setTuning) GAME.player.setTuning(bp.tuning);
    if(bp.cam){
      if(GAME.player.setCameraConfig) GAME.player.setCameraConfig(bp.cam, true);
      else { Object.assign(GAME.player.cameraCfg, bp.cam); GAME.player.applyCameraCfg(); }
    }
    if(bp.lights && GAME.player.setLights) GAME.player.setLights(bp.lights);
    if(bp.collision && GAME.player.setCollision) GAME.player.setCollision(bp.collision);
    if(bp.exhaust && GAME.player.setExhaust) GAME.player.setExhaust(bp.exhaust);
    if(bp.skids && GAME.player.setSkids) GAME.player.setSkids(bp.skids);
    if(bp.dataWidgets && GAME.player.setDataWidgets) GAME.player.setDataWidgets(bp.dataWidgets);
    if(bp.rigTransforms && STORE.playerBlueprints && STORE.playerBlueprints.applyRig) STORE.playerBlueprints.applyRig(GAME, bp);
    if(options.applySpawn !== false && bp.spawn && GAME.player.car){
      GAME.player.spawn.x = bp.spawn.x || 0;
      GAME.player.spawn.z = bp.spawn.z || 0;
      GAME.player.spawn.heading = bp.spawn.heading || 0;
      GAME.player.car.position.set(GAME.player.spawn.x, 0, GAME.player.spawn.z);
      if(GAME.player.setVisibleHeading) GAME.player.setVisibleHeading(GAME.player.spawn.heading);
      else {
        GAME.player.car.rotation.y = GAME.player.spawn.heading;
        GAME.player.physics.heading = GAME.player.spawn.heading;
      }
      GAME.player.physics.pos.copy(GAME.player.car.position);
      if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
    }
    loadBlueprintModel(bp);
    if(bp.meshEdits && !bp.modelSrc && !bp.modelDbKey && GAME.player.getModel && STORE.applyMeshEdits){
      const model = GAME.player.getModel();
      if(model){
        STORE.applyMeshEdits(model, bp.meshEdits);
        GAME.player.car.userData.playerMeshEdits = STORE.normalizeMeshEdits(bp.meshEdits);
      }
    }
    markDirty();
    refreshOutliner();
    buildInspector();
    if(!options.silent) status('player_car Logic applied');
  }
  function setDefaultPlayerBlueprintAsset(asset){
    if(!asset || !asset.player || !STORE.playerBlueprints) return;
    STORE.playerBlueprints.setDefault(asset.player, {blueprintId: asset.id, blueprintName: asset.name});
    applyPlayerBlueprintAsset(asset.player, {applySpawn:false, silent:true});
    status('Promoted to player_car Logic Base: ' + asset.name);
    refreshAssetsPanel();
  }
  function deletePlayerBlueprintAsset(asset){
    if(!asset || !STORE.playerBlueprints) return;
    confirmEditorAction({
      title: 'Delete player_car Logic?',
      message: 'Delete copied player_car Logic "' + asset.name + '"? This does not delete the player in the scene.',
      okText: 'Delete logic',
    }).then(ok => {
      if(!ok) return;
      STORE.playerBlueprints.deleteAsset(asset.id);
      refreshAssetsPanel();
      status('player_car Logic deleted');
    });
  }

  return Object.freeze({
    currentPlayerBlueprint,
    copyPlayerBlueprintAsset,
    playerLogicElementAsset,
    applyPlayerBlueprintAsset,
    setDefaultPlayerBlueprintAsset,
    deletePlayerBlueprintAsset,
  });
}

window.LK_EDITOR_PLAYER_BLUEPRINTS = Object.freeze({create});
})();
