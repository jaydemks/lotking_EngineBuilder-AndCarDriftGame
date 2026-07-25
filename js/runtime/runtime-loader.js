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
  const preBenchmark = window.LK_RUNTIME_PRE_BENCHMARK && window.LK_RUNTIME_PRE_BENCHMARK.create({
    renderer:opts.renderer,
    scene:opts.scene,
    camera:opts.camera,
    render:opts.renderGameplayCamera,
    warmPhysics:opts.warmPhysics,
    runHooks:opts.runWarmupHooks,
    setVideoWarmProfile:opts.setVideoWarmProfile,
    applyAdaptiveLow:opts.applyAdaptiveLow,
    gameState,
    onProgress:(value, label) => setLoadingPart('warmup', .4 + Math.max(0, Math.min(1, value || 0)) * .6, label),
  });

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
        if(!scene){
          const why = opts.isFileMode && opts.isFileMode()
            ? 'apri il gioco da http://127.0.0.1:8000/gameplay.html, non da file://'
            : 'file mancante/bloccato — vedi errori rete sopra';
          console.warn('LotKing: ' + file + ' NON caricato (' + why + ')');
        }
        return scene;
      });
  }

  function loadLocalModels(){
    // The legacy player GLB fallback was retired in v0.7.1. The procedural
    // vehicle remains visible until a project/imported player model is set;
    // do not probe models/player.glb or models/player/scene.gltf on every boot.
    loadProgress.set(0, 1);
    const jobs = [
      Promise.resolve(null),
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
          if(opts.syncCollider) opts.syncCollider(group);
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
          if(opts.syncCollider) opts.syncCollider(cone.m);
        }
      }
    });
  }

  function cloneData(value){
    try { return JSON.parse(JSON.stringify(value)); } catch(err){ return null; }
  }

  function nextFrame(){
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  function renderWarmFrame(){
    if(!(opts.renderer && opts.scene && opts.camera)) return;
    if(opts.renderGameplayCamera) opts.renderGameplayCamera();
    else opts.renderer.render(opts.scene, opts.camera);
  }

  function warmRenderStep(label, fraction){
    setLoadingPart('warmup', fraction, label);
    if(opts.updatePlayerLights) opts.updatePlayerLights();
    renderWarmFrame();
  }

  function clearInput(){
    for(const key of Object.keys(keys)) keys[key] = false;
  }

  function warmRuntimeAssets(){
    setLoadingPart('warmup', .05, 'warming runtime');
    return nextFrame().then(nextFrame).then(() => {
      const oldKeys = Object.assign({}, keys);
      const oldSpeed = opts.getSpeed ? opts.getSpeed() : 0;
      const oldReverse = !!engine.reverseActive;
      const oldEditor = !!gameState.editorActive;
      const oldLights = cloneData(opts.playerLights);
      const oldStarted = !!gameState.started;
      const warmAux = opts.playerLights && opts.playerLights.aux ? opts.playerLights.aux.map(() => ({enabled:true, condition:'always', glow:true, flare:true})) : null;
      const restoreWarmupState = () => {
        clearInput();
        Object.assign(keys, oldKeys);
        if(opts.setSpeed) opts.setSpeed(oldSpeed);
        engine.reverseActive = oldReverse;
        gameState.editorActive = oldEditor;
        gameState.started = oldStarted;
        if(oldLights && opts.setPlayerLights) opts.setPlayerLights(oldLights);
        if(opts.setHighBeams) opts.setHighBeams(false);
        if(opts.updatePlayerLights) opts.updatePlayerLights();
      };
      gameState.editorActive = false;
      gameState.started = true;
      clearInput();
      if(opts.setSpeed) opts.setSpeed(28);
      if(opts.setPlayerLights){
        opts.setPlayerLights({
          front:{enabled:true, auto:false, count:2, glow:true, bloom:true, flare:true},
          rear:{enabled:true, glow:true, bloom:true, flare:true},
          neon:{enabled:true, layout:'all', dummyVisible:true, intensity:Math.max(1.25, opts.playerLights && opts.playerLights.neon ? opts.playerLights.neon.intensity || 0 : 0)},
          aux:warmAux || [{enabled:true, condition:'always', glow:true, flare:true}],
          dummies:{visible:true},
        });
      }
      engine.reverseActive = false;
      warmRenderStep('warming camera and front lights', .10);
      return nextFrame()
        .then(() => {
          keys.s = true;
          warmRenderStep('warming brake lights and HUD', .17);
          return nextFrame();
        })
        .then(() => {
          keys.s = false;
          engine.reverseActive = true;
          warmRenderStep('warming reverse lights', .24);
          return nextFrame();
        })
        .then(() => {
          engine.reverseActive = false;
          keys.a = true;
          keys.d = true;
          warmRenderStep('warming auxiliary lights and neon', .30);
          return nextFrame();
        })
        .then(() => {
          if(opts.setHighBeams) opts.setHighBeams(true);
          warmRenderStep('warming high beams and shaders', .35);
          return nextFrame();
        })
        .then(() => {
          if(opts.setHighBeams) opts.setHighBeams(false);
          if(opts.warmupHook) opts.warmupHook({render: renderWarmFrame, setStage: setLoadingPart});
          warmRenderStep('preparing full scene benchmark', .39);
        })
        .then(() => { restoreWarmupState(); }, err => { restoreWarmupState(); throw err; });
    }).then(() => preBenchmark ? preBenchmark.run({mode:loadingMode || 'game'}) : null).then(() => {
      setLoadingPart('warmup', 1, 'runtime warmed');
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
      // preBenchmark already performs the complete scene compilation. Starting
      // a second idle compile here used to overlap the first gameplay frames.
      if(opts.schedulePipelineWarmup && !(preBenchmark && preBenchmark.report())) opts.schedulePipelineWarmup();
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
    benchmark:preBenchmark,
  };
}

window.LK_RUNTIME_RUNTIME_LOADER = Object.freeze({create});
})();
