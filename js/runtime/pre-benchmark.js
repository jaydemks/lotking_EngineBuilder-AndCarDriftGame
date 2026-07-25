/* =========================================================
   LOT KING - opaque runtime pre-benchmark
   Exercises authored render paths before editor/play sessions and records a
   sustained frame sample without permanently changing scene state.
   ========================================================= */
(function(){
'use strict';

function shouldUseLowProfile(fps, threshold){
  const measured = Number(fps);
  const limit = Number.isFinite(Number(threshold)) ? Number(threshold) : 25;
  return Number.isFinite(measured) && measured > 0 && measured < limit;
}

function create(options){
  const opts = options || {};
  const renderer = opts.renderer;
  const scene = opts.scene;
  const camera = opts.camera;
  let running = null;
  let lastReport = null;

  function nextFrame(){
    return new Promise(resolve => requestAnimationFrame(resolve));
  }

  function ensureOverlay(){
    let overlay = document.getElementById('lkPreBenchmark');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'lkPreBenchmark';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML =
      '<div class="lk-prebench-card">' +
        '<div class="lk-prebench-head"><span>RUNTIME PRE-BENCHMARK</span><b data-prebench-percent>0%</b></div>' +
        '<div class="lk-prebench-stage" data-prebench-stage>Preparing scene</div>' +
        '<div class="lk-prebench-track"><i data-prebench-fill></i></div>' +
        '<div class="lk-prebench-meta"><span data-prebench-detail>Compiling real project paths before use</span><strong data-prebench-fps>-- FPS</strong></div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function show(){
    const overlay = ensureOverlay();
    document.body.classList.add('lk-prebenchmark-running');
    overlay.classList.add('on');
    return overlay;
  }

  function hide(){
    const overlay = ensureOverlay();
    overlay.classList.remove('on');
    document.body.classList.remove('lk-prebenchmark-running');
  }

  function progress(value, stage, detail, fps){
    const amount = Math.max(0, Math.min(1, Number(value) || 0));
    const overlay = ensureOverlay();
    const pct = Math.round(amount * 100);
    const percent = overlay.querySelector('[data-prebench-percent]');
    const label = overlay.querySelector('[data-prebench-stage]');
    const info = overlay.querySelector('[data-prebench-detail]');
    const fill = overlay.querySelector('[data-prebench-fill]');
    const fpsLabel = overlay.querySelector('[data-prebench-fps]');
    if(percent) percent.textContent = pct + '%';
    if(label) label.textContent = stage || 'Preparing runtime';
    if(info) info.textContent = detail || 'The scene remains visible while its render paths are exercised';
    if(fill) fill.style.width = pct + '%';
    if(fpsLabel) fpsLabel.textContent = Number.isFinite(fps) ? Math.round(fps) + ' FPS' : '-- FPS';
    if(opts.onProgress) opts.onProgress(amount, stage || 'pre-benchmark');
  }

  function render(){
    if(opts.render) opts.render();
    else if(renderer && scene && camera) renderer.render(scene, camera);
  }

  function collectSceneState(){
    const nodes = [];
    const lights = [];
    const materials = [];
    const materialSet = new Set();
    if(!scene || !scene.traverse) return {nodes, lights, materials};
    scene.traverse(node => {
      if(!node) return;
      nodes.push({node, visible:node.visible});
      if(node.isLight){
        lights.push({
          node,
          visible:node.visible,
          intensity:node.intensity,
          color:node.color && node.color.clone ? node.color.clone() : null,
          castShadow:node.castShadow,
        });
      }
      const list = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
      list.forEach(material => {
        if(!material || materialSet.has(material)) return;
        materialSet.add(material);
        materials.push({
          material,
          visible:material.visible,
          color:material.color && material.color.clone ? material.color.clone() : null,
          emissive:material.emissive && material.emissive.clone ? material.emissive.clone() : null,
        });
      });
    });
    return {nodes, lights, materials};
  }

  function restoreSceneState(state){
    (state.nodes || []).forEach(item => { if(item.node) item.node.visible = item.visible; });
    (state.lights || []).forEach(item => {
      if(!item.node) return;
      item.node.visible = item.visible;
      item.node.intensity = item.intensity;
      item.node.castShadow = item.castShadow;
      if(item.color && item.node.color) item.node.color.copy(item.color);
    });
    (state.materials || []).forEach(item => {
      if(!item.material) return;
      item.material.visible = item.visible;
      if(item.color && item.material.color) item.material.color.copy(item.color);
      if(item.emissive && item.material.emissive) item.material.emissive.copy(item.emissive);
    });
  }

  function collectTextures(state){
    const textures = new Set();
    const add = value => { if(value && value.isTexture) textures.add(value); };
    add(scene && scene.background);
    add(scene && scene.environment);
    (state.materials || []).forEach(item => {
      const material = item && item.material;
      if(!material) return;
      Object.keys(material).forEach(key => add(material[key]));
      if(material.uniforms) Object.keys(material.uniforms).forEach(key => add(material.uniforms[key] && material.uniforms[key].value));
    });
    return Array.from(textures);
  }

  async function uploadTextures(textures, maximumTextures){
    if(!renderer || !renderer.initTexture || !textures.length) return;
    const selected = textures.slice(0, Math.max(0, Math.min(textures.length, Number(maximumTextures) || textures.length)));
    const batchSize = 8;
    for(let start = 0; start < selected.length; start += batchSize){
      selected.slice(start, start + batchSize).forEach(texture => {
        try { renderer.initTexture(texture); } catch(err){}
      });
      progress(.91 + Math.min(1, (start + batchSize) / selected.length) * .035, 'Uploading authored textures', Math.min(selected.length, start + batchSize) + ' / ' + selected.length + ' GPU textures prepared');
      await nextFrame();
    }
  }

  function snapshotCamera(){
    if(!camera) return null;
    return {
      position:camera.position && camera.position.clone ? camera.position.clone() : null,
      quaternion:camera.quaternion && camera.quaternion.clone ? camera.quaternion.clone() : null,
    };
  }

  function restoreCamera(snapshot){
    if(!camera || !snapshot) return;
    if(snapshot.position && camera.position) camera.position.copy(snapshot.position);
    if(snapshot.quaternion && camera.quaternion) camera.quaternion.copy(snapshot.quaternion);
    if(camera.updateMatrixWorld) camera.updateMatrixWorld(true);
  }

  async function warmCameraViews(snapshot, maximumViews){
    if(!camera || !snapshot || !snapshot.quaternion || !camera.rotateY) return 0;
    const views = [
      {yaw:Math.PI, pitch:0},
      {yaw:Math.PI / 2, pitch:0},
      {yaw:-Math.PI / 2, pitch:0},
      {yaw:0, pitch:.22},
      {yaw:0, pitch:-.22},
    ].slice(0, Math.max(0, Math.min(5, Number(maximumViews) || 5)));
    for(let index = 0; index < views.length; index++){
      restoreCamera(snapshot);
      camera.rotateY(views[index].yaw);
      if(camera.rotateX) camera.rotateX(views[index].pitch);
      if(camera.updateMatrixWorld) camera.updateMatrixWorld(true);
      progress(.95 + ((index + 1) / views.length) * .04, 'Preparing camera surroundings', 'View ' + (index + 1) + ' / ' + views.length + ' · preventing first-look shader and geometry stalls');
      render();
      await nextFrame();
    }
    restoreCamera(snapshot);
    return views.length;
  }

  async function paintedStep(value, stage, mutate, detail){
    progress(value, stage, detail);
    if(mutate) await mutate();
    render();
    await nextFrame();
  }

  async function compileScene(){
    if(!renderer || !scene || !camera) return {state:'skipped', mode:'none', error:''};
    const backend = window.LK_RUNTIME_RENDERING_BACKEND;
    if(backend && backend.compileScene){
      return backend.compileScene(renderer, scene, camera, {settleFrames:1});
    }
    try {
      if(renderer.compile) renderer.compile(scene, camera);
      await nextFrame();
      return {state:'ready', mode:'sync-webgl-fallback', error:''};
    } catch(error) {
      console.warn('LotKing: shader warm-up degraded safely', error);
      return {state:'failed', mode:'sync-webgl-fallback', error:String(error && error.message || error)};
    }
  }

  async function sampleFrames(count){
    const deltas = [];
    let previous = 0;
    const total = Math.max(12, Number(count) || 24);
    const wallLimitMs = 5000;
    let sampleStarted = 0;
    for(let i = 0; i < total; i++){
      const stamp = await nextFrame();
      if(!sampleStarted) sampleStarted = stamp;
      if(previous) deltas.push(stamp - previous);
      previous = stamp;
      const useful = deltas.slice(Math.min(3, Math.max(0, deltas.length - 1)));
      const average = useful.length ? useful.reduce((sum, value) => sum + value, 0) / useful.length : 0;
      const fps = average > 0 ? 1000 / average : null;
      const elapsedRatio = sampleStarted ? Math.min(1, (stamp - sampleStarted) / wallLimitMs) : 0;
      progress(.75 + Math.max((i + 1) / total, elapsedRatio) * .15, 'Measuring sustained performance', 'Real frames after shader and scene preparation', fps);
      // A fixed 24-frame sample would keep a 1 FPS device blocked for almost
      // half a minute. Four or more rendered deltas across five seconds are
      // already decisive for the <25 FPS fallback, so keep this stage bounded.
      const latestDelta = deltas.length ? deltas[deltas.length - 1] : 0;
      if((deltas.length >= 1 && latestDelta >= 250) || (deltas.length >= 2 && stamp - sampleStarted >= wallLimitMs)) break;
      render();
    }
    const useful = deltas.slice(Math.min(3, Math.max(0, deltas.length - 1)));
    const average = useful.length ? useful.reduce((sum, value) => sum + value, 0) / useful.length : 0;
    return average > 0 ? 1000 / average : null;
  }

  async function execute(runOptions){
    const mode = runOptions && runOptions.mode || 'game';
    const state = collectSceneState();
    const startedAt = performance.now();
    let videoWarm = false;
    let fps = null;
    let adaptive = null;
    let cameraViews = 0;
    let shaderWarmup = null;
    const cameraState = snapshotCamera();
    const renderableNodes = state.nodes.filter(item => item.node && (item.node.isMesh || item.node.isLine || item.node.isPoints || item.node.isSprite));
    const hiddenWarmSet = renderableNodes.filter(item => item.visible === false).slice(0, 32);
    const textures = collectTextures(state);
    gameStateFlag(true);
    show();
    progress(.01, 'Inspecting project scene', state.nodes.length + ' scene nodes · ' + state.lights.length + ' lights · ' + state.materials.length + ' materials');
    await nextFrame();
    try {
      await paintedStep(.10, 'Preparing hidden objects', () => {
        hiddenWarmSet.forEach(item => { item.node.visible = true; });
      }, hiddenWarmSet.length + ' hidden render paths prepared in a bounded batch');

      await paintedStep(.22, 'Exercising scene visibility', () => {
        restoreSceneState(state);
        renderableNodes.forEach((item, index) => {
          if(item.visible) item.node.visible = index % 3 !== 0;
        });
      }, 'Switching authored objects through visible states');

      await paintedStep(.34, 'Exercising lights and colors', () => {
        restoreSceneState(state);
        state.lights.forEach((item, index) => {
          item.node.visible = true;
          item.node.intensity = Math.max(.01, Number(item.intensity) || 1);
          if(item.node.color) item.node.color.setHSL((index * .173) % 1, .72, .58);
        });
        state.materials.forEach((item, index) => {
          if(item.material.color) item.material.color.offsetHSL((index % 5) * .025, 0, 0);
          if(item.material.emissive) item.material.emissive.offsetHSL(.04, 0, .015);
        });
      }, 'Activating existing lights and material color paths');

      await paintedStep(.46, 'Preparing dynamic shadows', () => restoreSceneState(state), 'Rendering the authored shadow casters and shadow lights');

      if(mode === 'game' && opts.warmPhysics){
        progress(.54, 'Preparing runtime physics', 'Building current colliders and dynamic bodies');
        await Promise.resolve(opts.warmPhysics());
        render();
        await nextFrame();
      }

      if(opts.runHooks){
        progress(.60, 'Preparing registered runtime systems', 'Running safe plugin and system warm-up hooks');
        await Promise.resolve(opts.runHooks({mode, render, progress}));
      }

      if(opts.setVideoWarmProfile){
        progress(.66, 'Preparing authored render passes', 'Rendering configured reflections, occlusion and volumetric paths when enabled');
        await Promise.resolve(opts.setVideoWarmProfile(true));
        videoWarm = true;
        render();
        await nextFrame();
        await Promise.resolve(opts.setVideoWarmProfile(false));
        videoWarm = false;
      }

      restoreSceneState(state);

      progress(.72, 'Compiling scene shaders', 'Three.js renderer compilation for the complete authored scene');
      // Let the 72% stage paint before synchronous WebGL compilation. The
      // backend deliberately avoids r185.1 compileAsync because its internal
      // material polling can throw outside the Promise and leave loading stuck.
      await nextFrame();
      shaderWarmup = await compileScene();
      progress(.74, shaderWarmup.state === 'failed' ? 'Shader warm-up completed with fallback' : 'Scene shaders prepared', shaderWarmup.state === 'failed' ? 'The editor will continue and compile remaining paths on first use' : 'GPU programs prepared without a background compilation race');
      restoreSceneState(state);
      restoreCamera(cameraState);
      render();
      fps = document.hidden ? null : await sampleFrames(24);

      if(shouldUseLowProfile(fps, 25) && opts.applyAdaptiveLow){
        progress(.905, 'Applying a safer video profile', Math.round(fps) + ' FPS sustained · Low profile recommended', fps);
        adaptive = await Promise.resolve(opts.applyAdaptiveLow({fps, threshold:25, mode}));
      }

      const slowProfile = !Number.isFinite(fps) || shouldUseLowProfile(fps, 25);
      await uploadTextures(textures, slowProfile ? 8 : textures.length);
      if(!document.hidden){
        cameraViews = await warmCameraViews(cameraState, slowProfile ? 1 : 5);
      }

      lastReport = {
        mode,
        fps:Number.isFinite(fps) ? fps : null,
        threshold:25,
        adaptive:adaptive || null,
        nodes:state.nodes.length,
        lights:state.lights.length,
        materials:state.materials.length,
        textures:textures.length,
        cameraViews,
        shaderWarmup,
        durationMs:performance.now() - startedAt,
        completedAt:new Date().toISOString(),
      };
      progress(1, adaptive && adaptive.applied ? 'Ready · Low video profile selected' : 'Runtime ready', Number.isFinite(fps) ? Math.round(fps) + ' FPS sustained sample' : 'Scene paths prepared', fps);
      return lastReport;
    } finally {
      if(videoWarm && opts.setVideoWarmProfile){
        try { await Promise.resolve(opts.setVideoWarmProfile(false)); } catch(err){}
      }
      restoreSceneState(state);
      restoreCamera(cameraState);
      hide();
      gameStateFlag(false);
    }
  }

  function gameStateFlag(active){
    const state = opts.gameState;
    if(state) state.preBenchmarkRunning = !!active;
  }

  function run(runOptions){
    if(running) return running;
    running = execute(runOptions).finally(() => { running = null; });
    return running;
  }

  return {
    run,
    isRunning:() => !!running,
    report:() => lastReport && Object.assign({}, lastReport),
  };
}

window.LK_RUNTIME_PRE_BENCHMARK = Object.freeze({create, shouldUseLowProfile});
})();
