/* =========================================================
   LOT KING - runtime asset loader and warmup controller
   Loads local GLB assets, applies saved project data and prewarms gameplay effects.
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts = options || {};
  const loading = opts.loading;
  const gameState = opts.gameState || {};
  const keys = opts.keys || {};
  const engine = opts.engine || {};
  const loadReport = [];
  const loadProgress = {
    frac: [0, 0, 0, 0],
    set(i, v){
      this.frac[i] = v;
      const avg = this.frac.reduce((a, b) => a + b, 0) / this.frac.length;
      setLoadingPart('models', avg);
    },
  };
  let assetsReady = false;
  let assetsLoading = null;
  let loadingMode = null;
  let runtimeWarmed = false;

  function setLoadingPart(part, value, label){
    if(loading) loading.setPart(part, value, label);
  }

  function resetLoadingParts(){
    loadProgress.frac = [0, 0, 0, 0];
    if(loading) loading.reset();
  }

  function setMenuBusy(busy){
    if(loading) loading.setBusy(busy);
  }

  function finishReadyMessage(){
    if(loading) loading.finish();
  }

  function modelPaths(name){
    const paths = opts.paths;
    return [
      paths.model(name + '.glb'),
      paths.model(name + '/scene.gltf'),
    ];
  }

  function trackedModel(name, progressIndex){
    return opts.tryLoadModel(modelPaths(name), v => loadProgress.set(progressIndex, v))
      .then(scene => {
        const file = name + '.glb';
        loadReport.push(file + (scene ? ' ✓' : ' ✗'));
        if(scene){
          console.info('LotKing: ' + file + ' caricato da ' + (scene.userData.assetUrl || opts.paths.model(file)));
        } else {
          const why = opts.isFileMode && opts.isFileMode()
            ? 'apri il gioco da http://127.0.0.1:8000/gameplay.html, non da file://'
            : 'file mancante/bloccato — vedi errori rete sopra';
          console.warn('LotKing: ' + file + ' NON caricato (' + why + ')');
        }
        return scene;
      });
  }

  function loadLocalModels(){
    const jobs = [
      trackedModel('player', 0).then(scene => { if(scene && opts.setPlayerModel) opts.setPlayerModel(scene); }),
      trackedModel('car1', 1),
      trackedModel('car2', 2),
      trackedModel('cone', 3),
    ];
    return Promise.all(jobs).then(([_, carA, carB, coneScene]) => {
      const variants = [carA, carB].filter(Boolean);
      if(variants.length && opts.parkedGroups){
        for(const group of opts.parkedGroups){
          const variantIndex = Math.random() * variants.length | 0;
          const src = variants[variantIndex];
          const model = opts.prepModel(src.clone(true), opts.modelSize.parkedLen, false);
          group.clear();
          group.add(model);
          group.userData.assetKey = 'parked-car-glb-' + (variantIndex + 1);
          group.userData.assetName = 'Parked Car GLB ' + (variantIndex + 1);
          group.userData.assetSource = src.userData.assetUrl || ('models/car' + (variantIndex + 1) + '.glb');
        }
      }
      if(coneScene && opts.cones){
        for(const cone of opts.cones){
          const model = opts.prepModel(coneScene.clone(true), opts.modelSize.coneHeight, true);
          cone.m.clear();
          cone.m.add(model);
        }
      }
    });
  }

  function warmRenderStep(label, fraction){
    setLoadingPart('warmup', fraction, label);
    if(opts.updatePlayerLights) opts.updatePlayerLights();
    if(opts.renderer && opts.scene && opts.camera){
      opts.renderer.compile(opts.scene, opts.camera);
      opts.renderer.render(opts.scene, opts.camera);
    }
  }

  function clearInput(){
    for(const key of Object.keys(keys)) keys[key] = false;
  }

  function warmRuntimeAssets(){
    if(runtimeWarmed){
      setLoadingPart('warmup', 1, 'warming runtime');
      return Promise.resolve();
    }
    setLoadingPart('warmup', .05, 'warming runtime');
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        const oldKeys = Object.assign({}, keys);
        const oldSpeed = opts.getSpeed ? opts.getSpeed() : 0;
        const oldReverse = !!engine.reverseActive;
        const oldEditor = !!gameState.editorActive;
        try {
          gameState.editorActive = false;
          clearInput();
          if(opts.setSpeed) opts.setSpeed(28);
          engine.reverseActive = false;
          warmRenderStep('warming lights', .25);
          keys.s = true;
          warmRenderStep('warming brake lights', .5);
          keys.s = false;
          engine.reverseActive = true;
          warmRenderStep('warming reverse lights', .72);
          engine.reverseActive = false;
          keys.a = true;
          keys.d = true;
          warmRenderStep('warming auxiliary effects', .9);
        } finally {
          clearInput();
          Object.assign(keys, oldKeys);
          if(opts.setSpeed) opts.setSpeed(oldSpeed);
          engine.reverseActive = oldReverse;
          gameState.editorActive = oldEditor;
          if(opts.updatePlayerLights) opts.updatePlayerLights();
          runtimeWarmed = true;
          setLoadingPart('warmup', 1, 'runtime warmed');
          resolve();
        }
      });
    });
  }

  function ensureReady(mode){
    loadingMode = mode || 'game';
    if(loading) loading.setMode(loadingMode);
    setMenuBusy(true);
    if(!assetsLoading){
      resetLoadingParts();
      assetsLoading = loadLocalModels()
        .then(() => { assetsReady = true; })
        .catch(() => { assetsReady = true; });
    }
    return assetsLoading.then(() => {
      const sceneReady = opts.getSceneReady ? opts.getSceneReady() : null;
      if(sceneReady && !gameState.sceneReady){
        setLoadingPart('project', .2, 'loading editor project');
        return sceneReady.then(() => setLoadingPart('project', 1, 'editor project loaded'));
      }
      setLoadingPart('project', 1, 'editor project loaded');
      return null;
    }).then(() => warmRuntimeAssets()).then(() => {
      gameState.sceneReady = true;
      if(loadingMode === 'editor'){
        setLoadingPart('editor', .35, 'loading editor UI');
        return;
      }
      setLoadingPart('editor', 1, 'game assets ready');
      finishReadyMessage();
      setMenuBusy(false);
    }, err => {
      finishReadyMessage();
      setMenuBusy(false);
      throw err;
    });
  }

  function finishLoading(){
    if(loadingMode === 'editor') setLoadingPart('editor', 1, 'editor ready');
    finishReadyMessage();
    setMenuBusy(false);
  }

  function failLoading(label){
    if(loading) loading.fail(label || 'loading failed');
    else setMenuBusy(false);
  }

  return {
    ensureReady,
    isReady: () => assetsReady && gameState.sceneReady,
    setLoadingStage: setLoadingPart,
    finishLoading,
    failLoading,
    setBusy: setMenuBusy,
    report: () => loadReport,
    getMode: () => loadingMode,
    loadLocalModels,
    warmRuntimeAssets,
  };
}

window.LK_RUNTIME_RUNTIME_LOADER = Object.freeze({create});
})();
