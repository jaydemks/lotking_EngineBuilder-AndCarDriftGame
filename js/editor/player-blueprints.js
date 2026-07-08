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
  function applyPlayerBlueprintAsset(player, opts){
    const bp = player && JSON.parse(JSON.stringify(player));
    if(!bp){ status(tr('Invalid player_car Logic', 'player_car Logic non valido')); return; }
    const options = opts || {};
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
      else GAME.player.car.rotation.y = GAME.player.spawn.heading;
      GAME.player.physics.pos.copy(GAME.player.car.position);
      GAME.player.physics.heading = GAME.player.spawn.heading;
      if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
    }
    loadBlueprintModel(bp);
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
    applyPlayerBlueprintAsset,
    setDefaultPlayerBlueprintAsset,
    deletePlayerBlueprintAsset,
  });
}

window.LK_EDITOR_PLAYER_BLUEPRINTS = Object.freeze({create});
})();
