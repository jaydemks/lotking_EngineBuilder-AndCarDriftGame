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

  function softwareRenderer(){
    if(!renderer || !renderer.getContext) return false;
    try {
      const gl = renderer.getContext();
      const debug = gl && gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
      const label = gl && gl.getParameter
        ? String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '')
        : '';
      return /swiftshader|llvmpipe|software|microsoft basic/i.test(label);
    } catch(error){ return false; }
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

  function hiddenResourceRepresentatives(state){
    const geometries = new Set();
    const materials = new Set();
    const selected = [];
    (state.nodes || []).forEach(item => {
      const node = item && item.node;
      if(!node || item.visible !== false || !(node.isMesh || node.isLine || node.isPoints || node.isSprite)) return;
      const data = node.userData || {};
      if(data.editorOnly || data.nonExportable || data.helperOnly) return;
      let addsResource = false;
      if(node.geometry && !geometries.has(node.geometry)){
        geometries.add(node.geometry);
        addsResource = true;
      }
      const list = node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
      list.forEach(material => {
        if(!material || materials.has(material)) return;
        materials.add(material);
        addsResource = true;
      });
      if(addsResource) selected.push(item);
    });
    return selected;
  }

  async function warmHiddenResources(state){
    const selected = hiddenResourceRepresentatives(state);
    const batchSize = 24;
    let warmed = 0;
    for(let start = 0; start < selected.length; start += batchSize){
      const batch = selected.slice(start, start + batchSize);
      batch.forEach(item => {
        let node = item.node;
        while(node && node !== scene){
          node.visible = true;
          node = node.parent;
        }
      });
      progress(.665 + Math.min(1, (start + batch.length) / Math.max(1, selected.length)) * .005,
        'Preparing deferred visual paths',
        Math.min(selected.length, start + batch.length) + ' / ' + selected.length + ' hidden geometry/material resources rendered');
      render();
      warmed += batch.length;
      await nextFrame();
      restoreSceneState(state);
    }
    return warmed;
  }

  async function uploadTextures(textures, maximumTextures){
    if(!renderer || !renderer.initTexture || !textures.length) return;
    const selected = textures.slice(0, Math.max(0, Math.min(textures.length, Number(maximumTextures) || textures.length)));
    const batchSize = 8;
    for(let start = 0; start < selected.length; start += batchSize){
      selected.slice(start, start + batchSize).forEach(texture => {
        try { renderer.initTexture(texture); } catch(err){}
      });
      progress(.67 + Math.min(1, (start + batchSize) / selected.length) * .08, 'Uploading authored textures', Math.min(selected.length, start + batchSize) + ' / ' + selected.length + ' GPU textures prepared');
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

  function strategicMapStops(state, maximumStops){
    const THREE = window.THREE;
    if(!THREE || !scene || !camera) return [];
    if(scene.updateMatrixWorld) scene.updateMatrixWorld(true);
    const cells = new Map();
    const cellSize = 36;
    const point = new THREE.Vector3();
    (state.nodes || []).forEach(item => {
      const node = item && item.node;
      if(!node || item.visible === false || !(node.isMesh || node.isLine || node.isPoints) || !node.getWorldPosition) return;
      const ud = node.userData || {};
      if(ud.helperOnly || ud.editorOnly || ud.nonExportable || ud.runtimeTransient) return;
      node.getWorldPosition(point);
      if(!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return;
      const key = Math.floor(point.x / cellSize) + ':' + Math.floor(point.z / cellSize);
      let cell = cells.get(key);
      if(!cell){
        cell = {sum:new THREE.Vector3(), count:0, key};
        cells.set(key, cell);
      }
      cell.sum.add(point);
      cell.count++;
    });
    const candidates = Array.from(cells.values()).map(cell => ({
      target:cell.sum.multiplyScalar(1 / Math.max(1, cell.count)),
      weight:cell.count,
      key:cell.key,
    }));
    if(!candidates.length) return [];
    const origin = camera.position && camera.position.clone ? camera.position.clone() : new THREE.Vector3();
    const selected = [];
    // Farthest-point sampling covers the whole authored map without making the
    // benchmark duration proportional to mesh count.
    while(candidates.length && selected.length < Math.max(1, Number(maximumStops) || 10)){
      let bestIndex = 0;
      let bestScore = -Infinity;
      candidates.forEach((candidate, index) => {
        const anchors = selected.length ? selected.map(item => item.target) : [origin];
        const nearest = Math.min.apply(null, anchors.map(anchor => candidate.target.distanceToSquared(anchor)));
        const score = nearest + Math.min(2500, candidate.weight * 18);
        if(score > bestScore){ bestScore = score; bestIndex = index; }
      });
      selected.push(candidates.splice(bestIndex, 1)[0]);
    }
    return selected;
  }

  async function tourStrategicMap(state, snapshot, maximumStops){
    if(!renderer || !scene || !camera || !camera.lookAt) return 0;
    const stops = strategicMapStops(state, maximumStops);
    const THREE = window.THREE;
    const previousTarget = renderer.getRenderTarget ? renderer.getRenderTarget() : null;
    const target = THREE && THREE.WebGLRenderTarget ? new THREE.WebGLRenderTarget(320, 180, {depthBuffer:true}) : null;
    const shadowAutoUpdate = renderer.shadowMap ? renderer.shadowMap.autoUpdate : null;
    const started = performance.now();
    let rendered = 0;
    try {
      if(target && renderer.setRenderTarget) renderer.setRenderTarget(target);
      for(let index = 0; index < stops.length; index++){
        const focus = stops[index].target;
        const angle = index * 2.399963229728653;
        const distance = 14 + Math.min(12, Math.sqrt(stops[index].weight) * 1.8);
        camera.position.set(
          focus.x + Math.sin(angle) * distance,
          focus.y + Math.max(5, distance * .38),
          focus.z + Math.cos(angle) * distance
        );
        camera.lookAt(focus);
        if(camera.updateMatrixWorld) camera.updateMatrixWorld(true);
        progress(.75 + ((index + 1) / Math.max(1, stops.length)) * .07,
          'Touring strategic map sectors',
          'Sector ' + (index + 1) + ' / ' + stops.length + ' · uploading distant geometry before play');
        // A tiny offscreen target uploads exactly the same geometry/material
        // resources without paying full viewport fill-rate. One shadow update
        // is enough to warm shadow programs; subsequent sectors reuse it.
        renderer.render(scene, camera);
        rendered++;
        if(renderer.shadowMap && index === 0) renderer.shadowMap.autoUpdate = false;
        await nextFrame();
        if(rendered >= 2 && performance.now() - started > 12000) break;
      }
    } finally {
      if(renderer.shadowMap && shadowAutoUpdate != null) renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      if(renderer.setRenderTarget) renderer.setRenderTarget(previousTarget || null);
      if(target) target.dispose();
      restoreCamera(snapshot);
    }
    return rendered;
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
    const THREE = window.THREE;
    const previousTarget = renderer && renderer.getRenderTarget ? renderer.getRenderTarget() : null;
    const target = renderer && THREE && THREE.WebGLRenderTarget ? new THREE.WebGLRenderTarget(320, 180, {depthBuffer:true}) : null;
    const shadowAutoUpdate = renderer && renderer.shadowMap ? renderer.shadowMap.autoUpdate : null;
    const started = performance.now();
    let rendered = 0;
    try {
      if(target && renderer.setRenderTarget) renderer.setRenderTarget(target);
      for(let index = 0; index < views.length; index++){
        restoreCamera(snapshot);
        camera.rotateY(views[index].yaw);
        if(camera.rotateX) camera.rotateX(views[index].pitch);
        if(camera.updateMatrixWorld) camera.updateMatrixWorld(true);
        progress(.965 + ((index + 1) / views.length) * .03, 'Preparing camera surroundings', 'View ' + (index + 1) + ' / ' + views.length + ' · preventing first-look shader and geometry stalls');
        if(renderer && target) renderer.render(scene, camera);
        else render();
        rendered++;
        if(renderer && renderer.shadowMap && index === 0) renderer.shadowMap.autoUpdate = false;
        await nextFrame();
        if(rendered >= 2 && performance.now() - started > 8000) break;
      }
    } finally {
      if(renderer && renderer.shadowMap && shadowAutoUpdate != null) renderer.shadowMap.autoUpdate = shadowAutoUpdate;
      if(renderer && renderer.setRenderTarget) renderer.setRenderTarget(previousTarget || null);
      if(target) target.dispose();
      restoreCamera(snapshot);
    }
    return rendered;
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
      progress(.84 + Math.max((i + 1) / total, elapsedRatio) * .08, 'Measuring sustained performance', 'Real frames after shader and scene preparation', fps);
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
    const allowAdaptive = !runOptions || runOptions.adaptive !== false;
    const state = collectSceneState();
    let warmedState = state;
    const startedAt = performance.now();
    let videoWarm = false;
    let fps = null;
    let adaptive = null;
    let cameraViews = 0;
    let strategicStops = 0;
    let hiddenResources = 0;
    let shaderWarmup = null;
    const cameraState = snapshotCamera();
    const renderableNodes = state.nodes.filter(item => item.node && (item.node.isMesh || item.node.isLine || item.node.isPoints || item.node.isSprite));
    const hiddenWarmSet = renderableNodes.filter(item => item.visible === false).slice(0, 32);
    let textures = collectTextures(state);
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
      // Runtime hooks can materialize pawn meshes, data widgets, lights,
      // particles and their textures. The original snapshot intentionally
      // predates those hooks so it can restore the authored scene, but using
      // that same snapshot for GPU upload left every newly created texture to
      // be uploaded on its first gameplay frame.
      warmedState = collectSceneState();
      textures = collectTextures(warmedState);
      hiddenResources = await warmHiddenResources(warmedState);

      // Slow hardware must not receive a deliberately incomplete PLAY preload:
      // that simply transfers omitted uploads into gameplay. Editor bootstrap is
      // intentionally lighter so authoring controls become usable quickly; the
      // full pass still runs when Play/Simulate is requested.
      const gameplayWarmup = mode === 'game';
      const software = softwareRenderer();
      await uploadTextures(textures, gameplayWarmup ? textures.length : Math.min(textures.length, 16));
      strategicStops = gameplayWarmup ? await tourStrategicMap(warmedState, cameraState, software ? 2 : 10) : 0;

      progress(.82, 'Compiling scene shaders', 'Three.js renderer compilation for the complete authored scene');
      // Let the 72% stage paint before synchronous WebGL compilation. The
      // backend deliberately avoids r185.1 compileAsync because its internal
      // material polling can throw outside the Promise and leave loading stuck.
      await nextFrame();
      shaderWarmup = await compileScene();
      progress(.84, shaderWarmup.state === 'failed' ? 'Shader warm-up completed with fallback' : 'Scene shaders prepared', shaderWarmup.state === 'failed' ? 'The editor will continue and compile remaining paths on first use' : 'GPU programs prepared without a background compilation race');
      restoreSceneState(state);
      restoreCamera(cameraState);
      if(!software) render();
      if(software){
        // A software WebGL implementation is already a decisive Low-profile
        // signal. Sampling several full project frames can take minutes and
        // teaches us nothing that the renderer identity did not already prove.
        fps = 1;
        progress(.92, 'Software renderer detected', 'Skipping full-resolution sustained sampling · Low profile recommended', fps);
      } else {
        fps = document.hidden ? null : await sampleFrames(24);
      }

      if(allowAdaptive && shouldUseLowProfile(fps, 25) && opts.applyAdaptiveLow){
        progress(.93, 'Applying a safer video profile', Math.round(fps) + ' FPS sustained · Low profile recommended', fps);
        adaptive = await Promise.resolve(opts.applyAdaptiveLow({fps, threshold:25, mode}));
      }

      if(!document.hidden && !software){
        cameraViews = await warmCameraViews(cameraState, gameplayWarmup ? (software ? 2 : 5) : 1);
      }

      lastReport = {
        mode,
        reason:runOptions&&runOptions.reason||'session-start',
        fps:Number.isFinite(fps) ? fps : null,
        threshold:25,
        adaptive:adaptive || null,
        nodes:warmedState.nodes.length,
        lights:warmedState.lights.length,
        materials:warmedState.materials.length,
        textures:textures.length,
        hiddenResources,
        cameraViews,
        strategicStops,
        softwareRenderer:software,
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
