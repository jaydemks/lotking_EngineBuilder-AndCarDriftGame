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

  function currentPlayerBlueprint(){
    return STORE.playerBlueprints && STORE.playerBlueprints.collect ? STORE.playerBlueprints.collect(GAME) : (STORE.collect(GAME).player || null);
  }
  async function copyPlayerBlueprintAsset(){
    const bp = currentPlayerBlueprint();
    if(!bp){ status('Player blueprint non disponibile'); return; }
    const name = await promptEditorAction({title:'Copy player blueprint', message:'Blueprint asset name:', value:'Player Blueprint ' + new Date().toLocaleTimeString(), okText:'Copy'});
    if(!name || !name.trim()) return;
    const asset = STORE.playerBlueprints.saveAsset(name.trim(), bp, {
      makeDefault: true,
      source: {levelId: ED.trackId, levelName: ED.trackName, copiedFrom: 'scene-player'},
      controllerIndex: 0,
    });
    if(!asset){ status('⚠ Blueprint non salvato'); return; }
    applyPlayerBlueprintAsset(asset.player, {applySpawn:false, silent:true});
    status('Blueprint copied, promoted to Base, and applied: ' + asset.name);
    refreshAssetsPanel();
  }
  function applyPlayerBlueprintAsset(player, opts){
    const bp = player && JSON.parse(JSON.stringify(player));
    if(!bp){ status('Blueprint non valido'); return; }
    const options = opts || {};
    if(bp.tuning && GAME.player.setTuning) GAME.player.setTuning(bp.tuning);
    if(bp.cam){
      if(GAME.player.setCameraConfig) GAME.player.setCameraConfig(bp.cam, true);
      else { Object.assign(GAME.player.cameraCfg, bp.cam); GAME.player.applyCameraCfg(); }
    }
    if(bp.lights && GAME.player.setLights) GAME.player.setLights(bp.lights);
    if(bp.exhaust && GAME.player.setExhaust) GAME.player.setExhaust(bp.exhaust);
    if(bp.dataWidgets && GAME.player.setDataWidgets) GAME.player.setDataWidgets(bp.dataWidgets);
    if(bp.rigTransforms && STORE.playerBlueprints && STORE.playerBlueprints.applyRig) STORE.playerBlueprints.applyRig(GAME, bp);
    if(options.applySpawn !== false && bp.spawn && GAME.player.car){
      GAME.player.spawn.x = bp.spawn.x || 0;
      GAME.player.spawn.z = bp.spawn.z || 0;
      GAME.player.spawn.heading = bp.spawn.heading || 0;
      GAME.player.car.position.set(GAME.player.spawn.x, 0, GAME.player.spawn.z);
      GAME.player.car.rotation.y = GAME.player.spawn.heading;
      GAME.player.physics.pos.copy(GAME.player.car.position);
      GAME.player.physics.heading = GAME.player.spawn.heading;
      if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
    }
    if(bp.modelSrc && GAME.player.setModel){
      STORE.loadGlbRaw(bp.modelSrc).then(sceneRoot => {
        GAME.player.setModel(sceneRoot);
        GAME.player.car.userData.modelSrc = bp.modelSrc;
      }).catch(err => status('Player model load failed: ' + err.message));
    }
    markDirty();
    refreshOutliner();
    buildInspector();
    if(!options.silent) status('Player blueprint applied');
  }
  function setDefaultPlayerBlueprintAsset(asset){
    if(!asset || !asset.player || !STORE.playerBlueprints) return;
    STORE.playerBlueprints.setDefault(asset.player, {blueprintId: asset.id, blueprintName: asset.name});
    applyPlayerBlueprintAsset(asset.player, {applySpawn:false, silent:true});
    status('Promoted to Player Blueprint Base: ' + asset.name);
    refreshAssetsPanel();
  }
  function deletePlayerBlueprintAsset(asset){
    if(!asset || !STORE.playerBlueprints) return;
    confirmEditorAction({
      title: 'Delete player blueprint?',
      message: 'Delete copied blueprint "' + asset.name + '"? This does not delete the player in the scene.',
      okText: 'Delete blueprint',
    }).then(ok => {
      if(!ok) return;
      STORE.playerBlueprints.deleteAsset(asset.id);
      refreshAssetsPanel();
      status('Player blueprint deleted');
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
