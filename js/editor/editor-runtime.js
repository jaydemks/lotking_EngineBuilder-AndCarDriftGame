/* =========================================================
   LOT KING - EDITOR RUNTIME
   Enter/exit, play preview, editor frame loop and preview camera sync.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const ED = deps.ED;
  const scene = deps.scene;
  const renderer = deps.renderer;
  const gameCam = deps.gameCam;
  const camE = deps.camE;
  const root = deps.root;
  const helperGroup = deps.helperGroup;
  const grid = deps.grid;
  const axes = deps.axes;
  const gizmoProxy = deps.gizmoProxy;
  const colliderProxy = deps.colliderProxy;
  const camProxy = deps.camProxy;
  const camRigLine = deps.camRigLine;
  const $ = deps.$;
  const overlay = document.getElementById('overlay');
  const levelSelect = document.getElementById('levelSelect');
  const viewportY = (bottomY, height) => {
    const backend = window.LK_RUNTIME_RENDERING_BACKEND;
    return backend && backend.viewportOriginY
      ? backend.viewportOriginY(renderer, bottomY, height, innerHeight)
      : (renderer && renderer.isWebGPURenderer ? innerHeight - bottomY - height : bottomY);
  };
  function transformControlsHelper(controls){
    return controls && typeof controls.getHelper === 'function' ? controls.getHelper() : controls;
  }
  let previewWarmupTimer = 0;
  let previewWarmupCompileTimer = 0;
  let previewWarmupSeq = 0;
  // Authoring does not need to submit an identical GPU frame sixty times per
  // second while nobody is touching the editor. Keep interaction/Play/Cinema
  // fully realtime and pace only a truly idle authoring viewport.
  const EDITOR_IDLE_AFTER_MS = 1800;
  const EDITOR_IDLE_FRAME_MS = 250;
  const EDITOR_HIDDEN_FRAME_MS = 1000;
  let lastEditorActivity = performance.now();
  let lastPacedEditorFrame = 0;
  let pacedEditorDt = 0;
  const markEditorActivity = () => { lastEditorActivity = performance.now(); };
  if(root){
    root.addEventListener('pointermove',markEditorActivity,{passive:true});
    root.addEventListener('pointerdown',markEditorActivity,{passive:true});
    root.addEventListener('wheel',markEditorActivity,{passive:true});
    root.addEventListener('input',markEditorActivity,true);
    root.addEventListener('change',markEditorActivity,true);
  }
  window.addEventListener('keydown',markEditorActivity,true);
  const cinemaTriggerState = new Map();
  const runtimeCamPos = new THREE.Vector3();
  const runtimeCamQuat = new THREE.Quaternion();
  const playerPreviewForward = new THREE.Vector3();
  const playerDummyPreviewCamera = new THREE.PerspectiveCamera(72, 16 / 9, .03, 500);
  let cinemaVideoExporter = null;
  const cinemaStudio = window.LK_EDITOR_CINEMA_STUDIO && window.LK_EDITOR_CINEMA_STUDIO.create({
    THREE,
    GAME,
    ED,
    root,
    helperGroup,
    getGizmo:deps.getGizmo,
    sceneCameras,
    editorViewportRect: deps.editorViewportRect,
    markDirty: deps.markDirty,
    buildInspector: deps.buildInspector,
    pushHistory: deps.pushHistory,
    selectObject: deps.selectObject,
    setCameraViewSlot: cameraId => {
      ED.viewportMode = 'quad';
      ED.viewportSlots[1] = 'cam:' + cameraId;
      if(deps.setActiveViewportSlot) deps.setActiveViewportSlot(1);
    },
    openVideoExport:studio => {
      if(cinemaVideoExporter) cinemaVideoExporter.open(studio);
    },
    exportInteractive:deps.exportInteractive,
  });
  cinemaVideoExporter = window.LK_EDITOR_CINEMA_VIDEO_EXPORT && window.LK_EDITOR_CINEMA_VIDEO_EXPORT.create({
    THREE,
    GAME,
    ED,
    root,
    renderer,
    scene,
    cinemaStudio:() => cinemaStudio,
    sceneCameraHolderById,
    normalizeSceneCamera:normalizeSceneCameraLocal,
    beginFinalRender:beginCinemaFinalPreviewRender,
    endFinalRender:endCinemaFinalPreviewRender,
    status:deps.status,
  });
  const viewportLayout = window.LK_EDITOR_VIEWPORT_LAYOUT && window.LK_EDITOR_VIEWPORT_LAYOUT.create({
    THREE,
    GAME,
    ED,
    root,
    renderer,
    scene,
    camE,
    $,
    sceneCameras,
    normalizeSceneCameraLocal,
    getGizmo: deps.getGizmo,
    getHelperGroup: () => helperGroup,
    getOrbit: deps.getOrbit,
    editorViewportRect: deps.editorViewportRect,
    setActiveViewportSlot: deps.setActiveViewportSlot,
    cameraForView: deps.cameraForView,
    cinemaStudio,
    renderPost:(rect, camera) => {
      const post = GAME.systems && GAME.systems.post;
      const pathTracing = GAME.systems && GAME.systems.pathTracing;
      const video = GAME.settings && GAME.settings.video;
      const illustratedOutput=video&&(video.visualStyle==='illustrated-sketch'||video.monochrome===true);
      if(!illustratedOutput&&video&&video.rendererMode==='pathtracing'&&ED.viewportMode!=='quad'&&pathTracing&&pathTracing.supported){
        try {
          if(pathTracing.render(camera,video,{width:rect.w,height:rect.h}))return true;
        } catch(err){}
      }
      const enabled = post && post.ok && video && (post.webgpu && post.needsPost
        ? post.needsPost(camera)
        : (
          video.rendererMode === 'raytracing' ||
          video.visualStyle === 'illustrated-sketch' ||
          video.monochrome === true ||
          video.volumetricLighting ||
          video.quality !== 'high' ||
          video.antialiasing === 'fxaa' ||
          post.needsOpticalPost && post.needsOpticalPost(camera)
        ));
      // One composer cannot efficiently serve four differently sized cameras:
      // every setSize reallocates all SSR/DOF/bloom render targets. In quad view
      // use the direct renderer; single view keeps the configured post effects.
      if(!enabled || ED.viewportMode === 'quad') return false;
      try {
        // Navigation may skip editor picking work, but it must not change the
        // authored render pipeline. Toggling GTAO/SSR on pointer-down caused a
        // visible full-frame exposure/sky shift.
        post.render(camera, {videoOnly:true, width:rect.w, height:rect.h, interactive:false});
        return true;
      } catch(err){
        return false;
      }
    },
  });

  function requestWarmup(label, opts){
    opts = opts || {};
    const seq = ++previewWarmupSeq;
    let box = root.querySelector('.lk-preview-warmup');
    if(!box){
      box = document.createElement('div');
      box.className = 'lk-preview-warmup';
      root.appendChild(box);
    }
    box.textContent = label || 'Warm-up...';
    box.classList.add('on');
    const started = performance.now();
    const minMs = opts.minMs == null ? 420 : opts.minMs;
    const maxMs = opts.maxMs == null ? 1400 : opts.maxMs;
    const finish = () => {
      const left = Math.max(0, minMs - (performance.now() - started));
      clearTimeout(previewWarmupTimer);
      previewWarmupTimer = setTimeout(() => {
        if(seq === previewWarmupSeq) box.classList.remove('on');
      }, left);
    };
    clearTimeout(previewWarmupTimer);
    previewWarmupTimer = setTimeout(() => {
      if(seq === previewWarmupSeq) box.classList.remove('on');
    }, maxMs);
    // Coalesce rapid structural edits and let the overlay paint before shader
    // compilation starts. Slider values do not call this path anymore.
    clearTimeout(previewWarmupCompileTimer);
    if(opts.compile === false){
      requestAnimationFrame(() => requestAnimationFrame(finish));
      return;
    }
    previewWarmupCompileTimer = setTimeout(() => {
      requestAnimationFrame(() => {
        if(seq !== previewWarmupSeq) return;
        if(renderer && scene && gameCam){
          const backend = window.LK_RUNTIME_RENDERING_BACKEND;
          if(backend && backend.compileScene){
            Promise.resolve(backend.compileScene(renderer, scene, gameCam, {settleFrames:1})).then(finish, finish);
          } else if(renderer.compile){
            try { renderer.compile(scene, gameCam); } catch(error) {}
            finish();
          } else {
            requestAnimationFrame(finish);
          }
        } else {
          requestAnimationFrame(finish);
        }
      });
    }, opts.delayMs == null ? 70 : opts.delayMs);
  }

  function showPreviewWarmup(){
    requestWarmup('Warm-up...', {minMs:900, maxMs:1600});
  }

  function setEditorLightHandlesVisible(visible){
    if(!GAME.world || !GAME.world.registry) return;
    GAME.world.registry.forEach(o => {
      if(!o || !o.traverse) return;
      const dummyEnabled = !(o.userData && o.userData.lightDummyVisible === false) &&
        !(o.userData && o.userData.light && o.userData.light.userData && o.userData.light.userData.editorDummyVisible === false);
      o.traverse(n => {
        if(!(n.userData && n.userData.editorLightHandle)) return;
        n.visible = !!visible && dummyEnabled;
      });
    });
  }

  function enterEditor(){
    if(ED.active) return;
    deps.loadTrackMeta();
    deps.ensureControls();
    ED.active = true;
    GAME.state.editorActive = true;
    setEditorLightHandlesVisible(true);
    GAME.hooks.frameOverride = editorFrame;
    root.classList.add('active');
    if(overlay){
      overlay.classList.remove('menu-preloading');
      overlay.classList.remove('choosing-level');
      overlay.classList.add('hidden');
    }
    if(levelSelect) levelSelect.setAttribute('aria-hidden', 'true');
    document.getElementById('hud').style.display = 'none';

    const car = GAME.player.car;
    car.position.copy(GAME.player.physics.pos);
    const visibleHeading = GAME.player.visibleHeadingFromRuntime
      ? GAME.player.visibleHeadingFromRuntime(GAME.player.physics.heading)
      : GAME.player.physics.heading;
    if(GAME.player.setVisibleHeading) GAME.player.setVisibleHeading(visibleHeading);
    else car.rotation.y = visibleHeading;

    if(!GAME.state.started){
      const h = visibleHeading;
      const off = new THREE.Vector3(Math.sin(-h + Math.PI) * Math.cos(.32), Math.sin(.32), Math.cos(-h + Math.PI) * Math.cos(.32)).multiplyScalar(9);
      gameCam.position.copy(car.position).add(off);
      gameCam.lookAt(car.position.x, car.position.y + 1.1, car.position.z);
    }

    scene.add(helperGroup);
    helperGroup.add(grid, axes, gizmoProxy, colliderProxy);
    if(deps.rebuildColliderHelpers) deps.rebuildColliderHelpers();
    const rigHelper = deps.ensureCameraRigHelper();
    let camHelper = deps.getCamHelper();
    if(!camHelper){
      camHelper = new THREE.CameraHelper(camProxy);
      camHelper.userData.editorHelper = true;
      camHelper.userData.editorOnly = true;
      camHelper.userData.nonExportable = true;
      camHelper.userData.lkFlareIgnore = true;
      camHelper.visible = ED.camHelperOn && GAME.player.enabled !== false && GAME.player.hidden !== true;
      deps.setCamHelper(camHelper);
    }
    helperGroup.add(camHelper, rigHelper, camRigLine);
    const gizmoHelper = transformControlsHelper(deps.getGizmo());
    if(gizmoHelper) scene.add(gizmoHelper);
    $('#lkSpace').textContent = deps.spaceLabel();
    deps.updateEditorAxesConvention();
    const orbit = deps.getOrbit();
    orbit.enabled = deps.shouldEnableOrbit ? deps.shouldEnableOrbit() : true;
    orbit.target.copy(car.position).setY(1);
    camE.position.copy(car.position).add(new THREE.Vector3(12, 9, 14));
    camE.lookAt(orbit.target);

    deps.setTool(ED.tool);
    if(GAME.systems && GAME.systems.menuMusic && GAME.systems.menuMusic.fadeOut){
      GAME.systems.menuMusic.fadeOut(2400).then(deps.syncQuickAudio);
    }
    deps.syncQuickAudio();
    $('#lkOutliner').className = ED.sceneViewMode || 'list';
    $('#lkAssetsPanel').className = ED.assetsViewMode || 'grid';
    if(viewportLayout) viewportLayout.syncToolbarVisual();
    if(GAME.player.updateLights) GAME.player.updateLights();
    if(GAME.player.updateExhaust) GAME.player.updateExhaust(0);
    if(GAME.player.updateSkids) GAME.player.updateSkids();
    if(GAME.player.updateDataWidgets) GAME.player.updateDataWidgets();
    deps.refreshOutliner();
    deps.refreshAssetsPanel();
    deps.buildInspector();
    if(ED.special === 'hud' && GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(true);
    deps.status('Editor active');
  }

  function previewModeLabel(mode){
    return mode === 'simulate' ? 'Simulate' : 'Play preview';
  }

  function setPlayPreview(on, mode){
    mode = mode === 'simulate' ? 'simulate' : 'play';
    ED.playPreview = !!on && mode === 'play';
    ED.simulatePreview = !!on && mode === 'simulate';
    ED.playPreviewMode = on ? mode : 'play';
    if(deps.rebuildColliderHelpers) deps.rebuildColliderHelpers();
    setEditorLightHandlesVisible(!on);
    if(!on) GAME.state.cinemaInputLocked = false;
    if(ED.playPreview) deps.clearHoverPickHelper();
    if(ED.playPreview && viewportLayout) viewportLayout.updateOverlays(null);
    if(ED.playPreview && cinemaStudio) cinemaStudio.hideTimeline();
    root.classList.toggle('play-preview', ED.playPreview);
    root.classList.toggle('simulate-preview', ED.simulatePreview);
    document.body.classList.toggle('lk-editor-simulate-preview', ED.simulatePreview);
    const btn = $('#lkPlay');
    const simBtn = $('#lkSimulate');
    if(btn){
      btn.textContent = ED.playPreview && ED.playPreviewMode === 'play' ? '■ STOP' : '▶ PREVIEW';
      btn.disabled = ED.simulatePreview;
    }
    if(simBtn){
      simBtn.textContent = ED.simulatePreview ? '■ STOP' : '▶ SIMULATE';
      simBtn.disabled = ED.playPreview;
    }
    if(ED.playPreview) $('#lkPipFrame').classList.remove('on');
    const gizmo = deps.getGizmo();
    const helper = transformControlsHelper(gizmo);
    if(helper) helper.visible = !ED.playPreview;
    const orbit = deps.getOrbit();
    if(orbit) orbit.enabled = deps.shouldEnableOrbit ? deps.shouldEnableOrbit() : (ED.active && !ED.playPreview);
  }

  function startPlayPreview(mode){
    mode = mode === 'simulate' ? 'simulate' : 'play';
    // Preview is a simulation boundary, never a persistence boundary. The old
    // path persisted here and could replace the complete LOCAL DISK project
    // merely because the author pressed Play. Disk/browser/workspace
    // writes now remain exclusive to an explicit Save, import or rename action.
    if(mode === 'play' && GAME.actions.armFreeCamera) GAME.actions.armFreeCamera();
    deps.closeMenu();
    deps.status(mode === 'simulate' ? 'Pre-benchmark simulation...' : 'Pre-benchmark preview...');
    const startRequest = GAME.actions.startEditorPreview ? GAME.actions.startEditorPreview(mode) : Promise.resolve(false);
    Promise.resolve(startRequest).then(started => {
      if(!started){
        deps.status(mode === 'simulate' ? 'Simulation pre-benchmark failed' : 'Preview pre-benchmark failed');
        return;
      }
      if(GAME.player.updateLights) GAME.player.updateLights();
      if(GAME.player.updateExhaust) GAME.player.updateExhaust(0);
      if(GAME.player.updateSkids) GAME.player.updateSkids();
      setPlayPreview(true, mode);
      cinemaTriggerState.clear();
      startOnPlayCinematics();
      deps.status(previewModeLabel(mode) + ' running - F8 or Shift+Esc to stop');
    }).catch(error => {
      console.warn('LotKing editor: preview pre-benchmark failed', error);
      deps.status('Preview pre-benchmark failed');
    });
  }

  function stopPlayPreview(){
    stopRuntimeCinematics();
    cinemaTriggerState.clear();
    GAME.state.runtimeActiveSceneCameraId = null;
    if(GAME.actions.stopEditorPreview) GAME.actions.stopEditorPreview();
    const stoppedMode = ED.playPreviewMode;
    setPlayPreview(false);
    if(GAME.player.updateExhaust) GAME.player.updateExhaust(0);
    if(GAME.player.updateSkids) GAME.player.updateSkids();
    if(stoppedMode !== 'simulate' && deps.restorePreviewTransforms) deps.restorePreviewTransforms();
    const orbit = deps.getOrbit();
    if(orbit){
      orbit.enabled = deps.shouldEnableOrbit ? deps.shouldEnableOrbit() : true;
      orbit.target.copy(GAME.player.car.position).setY(1);
    }
    const gizmo = deps.getGizmo();
    const helper = transformControlsHelper(gizmo);
    if(helper) helper.visible = true;
    deps.status(previewModeLabel(stoppedMode) + ' stopped');
  }

  function exitEditor(toPlay){
    if(!ED.active) return;
    if(ED.playPreview || ED.simulatePreview) stopPlayPreview();
    if(!toPlay && window.__LK_STANDALONE_EDITOR){
      if(window.parent && window.parent !== window){
        window.parent.postMessage({type:'lot-king:return-menu', source:'editor'}, '*');
        return;
      }
      location.href = 'index.html';
      return;
    }
    ED.active = false;
    GAME.state.editorActive = false;
    if(GAME.player && GAME.player.cameraDummies){
      Object.keys(GAME.player.cameraDummies).forEach(key => {
        if(GAME.player.cameraDummies[key]) GAME.player.cameraDummies[key].visible = false;
      });
    }
    setEditorLightHandlesVisible(false);
    GAME.hooks.frameOverride = null;
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
    if(GAME.player.updateLights) GAME.player.updateLights();
    if(GAME.player.updateExhaust) GAME.player.updateExhaust(0);
    if(GAME.player.updateSkids) GAME.player.updateSkids();
    root.classList.remove('active');
    document.body.classList.remove('editor-hud-hidden');
    const hudToggle = document.getElementById('videoEditorHud');
    if(hudToggle) hudToggle.checked = true;
    $('#lkPipFrame').classList.remove('on');
    if(viewportLayout) viewportLayout.updateOverlays(null);
    deps.closeMenu();
    deps.clearHoverPickHelper();
    deps.clearReplaceDropHelper();
    const gizmo = deps.getGizmo();
    if(gizmo){
      deps.setGizmoUsingZUpProxy(false);
      gizmo.detach();
    }
    const gizmoHelper = transformControlsHelper(gizmo);
    if(gizmoHelper) scene.remove(gizmoHelper);
    helperGroup.remove(grid, axes, gizmoProxy, colliderProxy);
    const camHelper = deps.getCamHelper();
    if(camHelper) helperGroup.remove(camHelper);
    const rigHelper = deps.getCameraRigHelper();
    if(rigHelper) helperGroup.remove(rigHelper);
    if(camRigLine) helperGroup.remove(camRigLine);
    scene.remove(helperGroup);
    const orbit = deps.getOrbit();
    if(orbit) orbit.enabled = false;
    if(!toPlay && !GAME.state.started && overlay) overlay.classList.remove('hidden');
  }

  function editorFrame(dt){
    // Offline Cinema export owns the shared renderer and advances the timeline
    // with an exact fixed step. The normal editor loop must not submit a second
    // scene between the rendered frame and its WebCodecs snapshot.
    if(ED.cinemaExporting) return;
    // The pre-benchmark owns the renderer while it deliberately exercises
    // hidden objects, lights and camera views. Rendering the normal editor
    // frame concurrently doubles GPU work and exposes transient scene state.
    if(GAME.state.preBenchmarkRunning) return;
    if(ED.playPreview){
      pacedEditorDt = 0;
      renderPlayPreview(dt);
      return;
    }
    if(ED.simulatePreview){
      pacedEditorDt = 0;
      stepSimulationPreview(dt);
    } else {
      const now = performance.now();
      const cinemaPlaying = !!(ED.cinemaPreview && ED.cinemaPreview.playing);
      const idleFor = now - lastEditorActivity;
      const frameInterval = document.visibilityState === 'hidden'
        ? EDITOR_HIDDEN_FRAME_MS
        : (!cinemaPlaying && idleFor >= EDITOR_IDLE_AFTER_MS ? EDITOR_IDLE_FRAME_MS : 0);
      if(frameInterval && now - lastPacedEditorFrame < frameInterval){
        pacedEditorDt += Math.max(0,Number(dt)||0);
        return;
      }
      lastPacedEditorFrame = now;
      dt = Math.min(.05,Math.max(0,Number(dt)||0) + pacedEditorDt);
      pacedEditorDt = 0;
    }
    deps.updateEditorControls(dt);
    const viewRect = deps.editorViewportRect();
    camE.aspect = viewRect.w / viewRect.h;
    camE.updateProjectionMatrix();

    for(const h of GAME.hooks.frame) h(dt);
    if(!ED.simulatePreview && GAME.player.updateExhaust) GAME.player.updateExhaust(dt);
    if(!ED.simulatePreview && GAME.player.updateDataWidgets) GAME.player.updateDataWidgets();

    if(cinemaStudio && !ED.simulatePreview) cinemaStudio.updatePreview(dt);
    syncGamePreviewCamera();
    updateCameraHelpers();
    deps.updateViewportPickingHelpers();
    deps.updateSelectionAndDropHelpers();
    deps.processThumbQueue();
    if(viewportLayout) viewportLayout.syncToolbarVisual();
    if(viewportLayout) viewportLayout.renderEditorViewport(viewRect);
    else renderEditorViewportFallback(viewRect);
    renderPip();
    renderCinemaFloatingPreview(viewRect, dt);
    if(viewportLayout) viewportLayout.updateStats(dt, viewRect);
    if(cinemaStudio) cinemaStudio.syncTimeline(viewRect);
  }

  function stepSimulationPreview(dt){
    suppressSimulationRuntimeUi();
    if(GAME.actions.stepGameplayPreview) GAME.actions.stepGameplayPreview(dt);
    scanCinemaTriggerVolumes();
    if(cinemaStudio) cinemaStudio.updatePreview(dt);
    suppressSimulationRuntimeUi();
  }

  function suppressSimulationRuntimeUi(){
    const radio = GAME.systems && GAME.systems.radio;
    if(radio && radio.toggleOpen) radio.toggleOpen(false);
    if(GAME.actions && GAME.actions.closePause) GAME.actions.closePause();
    if(GAME.settings && GAME.settings.setTuningOpen) GAME.settings.setTuningOpen(false);
  }
  function syncCinemaTimeline(){
    if(cinemaStudio) cinemaStudio.syncTimeline(deps.editorViewportRect());
  }

  function renderPlayPreview(dt){
    if(GAME.actions.stepGameplayPreview) GAME.actions.stepGameplayPreview(dt);
    scanCinemaTriggerVolumes();
    const runtimeState = ED.cinemaPreview && ED.cinemaPreview.runtime ? ED.cinemaPreview : null;
    let runtimeShot = null;
    if(runtimeState && cinemaStudio){
      const shot = cinemaStudio.updatePreview(dt);
      runtimeShot = runtimeState.playing || runtimeState.blending ? shot : null;
    }
    const outputApi=window.LK_RUNTIME_PLAYER_OUTPUT;
    if(!outputApi||typeof outputApi.resolve!=='function')throw new Error('LotKing Player Output resolver unavailable');
    const state=GAME.state||{},cameraOutputs=state.runtimeVehicleCameraPawnIds||{};
    const pawnCameraId=cameraOutputs[1]||state.runtimeVehicleCameraPawnId;
    const pawnById=id=>id&&GAME.pawns&&GAME.pawns.get?GAME.pawns.get(id):null;
    const possessedPawn=GAME.pawns&&GAME.pawns.getByPlayerId?GAME.pawns.getByPlayerId(1):null;
    const cinemaCamera=runtimeShot&&runtimeShot.cameraId?sceneCameraHolderById(runtimeShot.cameraId):null;
    const runtimeCamera=state.runtimeActiveSceneCameraId?sceneCameraHolderById(state.runtimeActiveSceneCameraId):null;
    const levelCamera=sceneCameras().find(holder=>(holder.userData.cameraProps||{}).activeLevelCamera===true)
      ||sceneCameras().find(holder=>Number((holder.userData.cameraProps||{}).outputPlayerIndex)===0)||null;
    const output=outputApi.resolve({
      playerId:1,
      cinemaActive:!!runtimeShot,
      cinemaCamera,
      logicCamera:runtimeCamera,
      possessedPawn,
      cameraPawn:pawnById(pawnCameraId),
      nativePlayer:GAME.player,
      levelCamera,
    });
    // Lock gameplay input only when Cinema actually owns a valid output. A
    // stale/missing shot camera must fall through without trapping the player.
    GAME.state.cinemaInputLocked=output.kind==='cinema';
    // stepGameplayPreview() has already updated Pawn/native cameras. Editor Play
    // only copies a selected Scene/Cinema camera; otherwise it preserves that
    // gameplay camera exactly as the standalone runtime does.
    if(output.camera){
      if(output.kind!=='cinema'||!runtimeShot)runtimeShot={cameraId:output.camera.userData.editorId};
    }else runtimeShot=null;
    if(viewportLayout) viewportLayout.updateOverlays(null);
    const forcedCollisionDummies = ED.forceCollisionDummiesInPreview === true && ED.showCollisionDummies === true;
    const helperVisibility = [];
    if(forcedCollisionDummies){
      helperGroup.visible = true;
      helperGroup.children.forEach(child => {
        helperVisibility.push([child, child.visible]);
        if(!(child.userData && child.userData.colliderPreview)) child.visible = false;
      });
    } else helperGroup.visible = false;
    const gizmo = deps.getGizmo();
    const gizmoHelper = transformControlsHelper(gizmo);
    if(gizmoHelper) gizmoHelper.visible = false;
    $('#lkPipFrame').classList.remove('on');
    const viewRect = deps.editorViewportRect();
    const glRect = {x:viewRect.x, y:innerHeight - viewRect.y - viewRect.h, w:viewRect.w, h:viewRect.h};
    applyRuntimeCinemaCamera(runtimeShot, glRect);
    try {
      if(GAME.actions.renderGameplayCameraRect) GAME.actions.renderGameplayCameraRect(glRect);
      else {
        renderer.setScissorTest(true);
        const targetY = viewportY(glRect.y, glRect.h);
        renderer.setViewport(glRect.x, targetY, glRect.w, glRect.h);
        renderer.setScissor(glRect.x, targetY, glRect.w, glRect.h);
        renderer.render(scene, gameCam);
      }
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, innerWidth, innerHeight);
      helperVisibility.forEach(pair => { pair[0].visible = pair[1]; });
      helperGroup.visible = true;
    }
    if(viewportLayout) viewportLayout.updateStats(dt, viewRect);
    if(gizmoHelper) gizmoHelper.visible = false;
  }

  function updateCameraHelpers(){
    const nativePlayerCameraActive = ED.camHelperOn && GAME.player.enabled !== false && GAME.player.hidden !== true;
    const cameraDummies = GAME.player && GAME.player.cameraDummies;
    if(cameraDummies){
      Object.keys(cameraDummies).forEach(key => {
        if(cameraDummies[key]) cameraDummies[key].visible = nativePlayerCameraActive && !ED.playPreview;
      });
    }
    // Logic Pawn camera transforms stay parented to their Pawn, but their
    // geometry is mounted only for the selected camera. Keeping an invisible
    // mesh under every Character still lets Box3 include its distant position;
    // a detached visual gives the author the familiar vehicle-camera dummy
    // without changing Pawn selection bounds, collider fitting or traversal.
    let pawnCameraVisualChanged=false;
    (GAME.world&&GAME.world.registry||[]).forEach(owner=>{
      const dummies=owner&&owner.userData&&owner.userData.pawnCameraDummies;
      if(!Array.isArray(dummies))return;
      dummies.forEach(dummy=>{
        const visual=dummy&&dummy.userData&&dummy.userData.pawnCameraVisual;
        if(!dummy||!visual)return;
        const show=!ED.playPreview&&!ED.simulatePreview&&ED.selected===dummy;
        if(show&&visual.parent!==dummy){dummy.add(visual);pawnCameraVisualChanged=true;}
        else if(!show&&visual.parent===dummy){dummy.remove(visual);pawnCameraVisualChanged=true;}
        visual.visible=show;
      });
    });
    if(pawnCameraVisualChanged&&deps.refreshSelectionHelpers)deps.refreshSelectionHelpers();
    camProxy.position.copy(gameCam.position);
    camProxy.quaternion.copy(gameCam.quaternion);
    camProxy.fov = gameCam.fov;
    camProxy.aspect = gameCam.aspect;
    const helperRange = Math.max(.5, Math.min(20, Number(GAME.player.cameraCfg.helperRange) || 5));
    const helperSize = Math.max(.2, Math.min(2.5, Number(GAME.player.cameraCfg.helperSize) || .7));
    camProxy.far = Math.min(helperRange, GAME.player.cameraCfg.far);
    camProxy.updateProjectionMatrix();
    camProxy.updateMatrixWorld(true);
    const camHelper = deps.getCamHelper();
    if(camHelper) camHelper.visible = nativePlayerCameraActive;
    if(camHelper && camHelper.visible) camHelper.update();
    deps.updateCameraRigHelper();
    const rigHelper = deps.ensureCameraRigHelper();
    if(rigHelper){ rigHelper.visible = nativePlayerCameraActive; rigHelper.scale.setScalar(helperSize); }
    if(camRigLine){
      camRigLine.visible = nativePlayerCameraActive;
      const pts = camRigLine.geometry.attributes.position;
      pts.setXYZ(0, gameCam.position.x, gameCam.position.y, gameCam.position.z);
      pts.setXYZ(1, GAME.player.car.position.x, GAME.player.car.position.y + Math.max(.1, Number(GAME.player.cameraCfg.lookHeight) || 1.1), GAME.player.car.position.z);
      pts.needsUpdate = true;
    }
  }

  function syncNativePlayerHelperVisibility(event){
    const active=event&&event.detail?event.detail.active===true:(GAME.player.enabled!==false&&GAME.player.hidden!==true);
    const camHelper=deps.getCamHelper(),rigHelper=deps.ensureCameraRigHelper();
    if(camHelper)camHelper.visible=active&&ED.camHelperOn;
    if(rigHelper)rigHelper.visible=active&&ED.camHelperOn;
    if(camRigLine)camRigLine.visible=active&&ED.camHelperOn;
  }
  if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('lotking:nativeplayeractivechange',syncNativePlayerHelperVisibility);

  function renderEditorViewportFallback(viewRect){
    renderer.setScissorTest(true);
    const bottomY = innerHeight - viewRect.y - viewRect.h;
    const targetY = viewportY(bottomY, viewRect.h);
    renderer.setViewport(viewRect.x, targetY, viewRect.w, viewRect.h);
    renderer.setScissor(viewRect.x, targetY, viewRect.w, viewRect.h);
    camE.aspect = viewRect.w / Math.max(1, viewRect.h);
    camE.updateProjectionMatrix();
    renderer.render(scene, camE);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  }

  function sceneCameras(){
    return GAME.world.registry.filter(o => o && o.userData && o.userData.editorType === 'camera' && o.userData.sceneCamera);
  }
  function normalizeSceneCameraLocal(holder){
    const cam = holder && holder.userData && holder.userData.sceneCamera;
    if(!cam) return null;
    cam.position.set(0, 0, 0);
    cam.rotation.set(0, 0, 0);
    cam.scale.set(1, 1, 1);
    cam.updateMatrixWorld(true);
    return cam;
  }

  function syncPlayerDummyPreviewCamera(dummy){
    if(!dummy) return gameCam;
    const cfg = GAME.player.cameraCfg || {};
    dummy.updateWorldMatrix(true, false);
    dummy.getWorldPosition(playerDummyPreviewCamera.position);
    dummy.getWorldQuaternion(playerDummyPreviewCamera.quaternion);
    playerDummyPreviewCamera.fov = dummy.userData && dummy.userData.cameraRole === 'interior'
      ? (Number(cfg.interiorFov) || 72)
      : (Number(cfg.fov) || 62);
    playerDummyPreviewCamera.near = .03;
    playerDummyPreviewCamera.far = Math.max(20, Number(cfg.far) || 500);
    playerDummyPreviewCamera.updateProjectionMatrix();
    playerDummyPreviewCamera.updateMatrixWorld(true);
    return playerDummyPreviewCamera;
  }

  function renderPip(){
    if(!(ED.pipOn && deps.isPlayerCameraSelection())){
      $('#lkPipFrame').classList.remove('on');
      return;
    }
    let selectedCameraHolder = null;
    let selectedPlayerCamera = null;
    let selectedNode = ED.selected;
    while(selectedNode){
      const data = selectedNode.userData || {};
      if(data.editorType === 'playerCamera'){ selectedPlayerCamera = selectedNode;break; }
      if(data.editorType === 'camera' && data.sceneCamera){ selectedCameraHolder = selectedNode;break; }
      selectedNode = selectedNode.parent;
    }
    const sourceCamera = selectedCameraHolder
      ? normalizeSceneCameraLocal(selectedCameraHolder)
      : (selectedPlayerCamera ? syncPlayerDummyPreviewCamera(selectedPlayerCamera) : gameCam);
    const isSceneCamera = !!selectedCameraHolder;
    const rightW = deps.panelWidth('right');
    const usableW = Math.max(320, innerWidth - deps.panelWidth('left') - rightW - 28);
    // THE bug behind "every camera previews as 16:9": this read
    // `GAME.player.cameraAspectValue()` - the PLAYER camera's ratio - for whichever
    // camera you had selected, so a scene camera could never show its own shape.
    // The selected camera's own aspect is asked for first now, with the editor-wide
    // master override above it and the level default below.
    const aspect = editorPreviewAspect(selectedCameraHolder, selectedPlayerCamera).ratio;
    const w = Math.round(Math.min(ED.pipW, usableW * .9));
    const hgt = Math.round(w / aspect);
    const displayW = ED.pipMinimized ? 170 : w;
    const displayH = ED.pipMinimized ? 26 : hgt;
    const defaultPos = {
      x: innerWidth - rightW - displayW - 14,
      y: innerHeight - 40 - displayH - 14,
    };
    const pos = deps.clampPanelPos(ED.pipPos || defaultPos, displayW, displayH);
    const x = pos.x;
    const y = pos.y;
    const pipFrame = $('#lkPipFrame');
    pipFrame.classList.add('on');
    pipFrame.classList.toggle('minimized', !!ED.pipMinimized);
    const pipTitle = pipFrame.querySelector('.lk-pip-title span');
    if(pipTitle) pipTitle.textContent = isSceneCamera
      ? ((selectedCameraHolder.userData.editorName || selectedCameraHolder.name || 'SCENE CAMERA').toUpperCase() + ' · PREVIEW')
      : (selectedPlayerCamera
        ? ((selectedPlayerCamera.userData.editorName || selectedPlayerCamera.name || 'PLAYER CAMERA').toUpperCase() + ' · PREVIEW')
        : 'PLAYER CAMERA');
    const pipMin = $('#lkPipMinimize');
    if(pipMin){
      pipMin.textContent = ED.pipMinimized ? '+' : '−';
      pipMin.title = ED.pipMinimized ? 'Expand camera preview' : 'Minimize camera preview';
    }
    pipFrame.style.left = x + 'px';
    pipFrame.style.top = y + 'px';
    pipFrame.style.width = displayW + 'px';
    pipFrame.style.height = displayH + 'px';
    if(ED.pipMinimized) return;
    helperGroup.visible = false;
    const gizmo = deps.getGizmo();
    const gizmoHelper = transformControlsHelper(gizmo);
    if(gizmoHelper) gizmoHelper.visible = false;
    const cameraHelperVisibility = sceneCameras().map(holder => {
      const helper = holder.children.find(child => child.userData && child.userData.editorCameraHelper);
      const visible = helper ? helper.visible : false;
      if(helper) helper.visible = false;
      return [helper, visible];
    });
    const glY = innerHeight - y - hgt;
    try {
      renderer.setScissorTest(true);
      const targetY = viewportY(glY, hgt);
      renderer.setViewport(x, targetY, w, hgt);
      renderer.setScissor(x, targetY, w, hgt);
      sourceCamera.aspect = w / Math.max(1, hgt);
      sourceCamera.updateProjectionMatrix();
      // The shared composer cannot render the main viewport and a differently
      // sized PIP without reallocating every post-process target twice per
      // frame. The PIP is an editor framing aid, so keep it direct and let the
      // main viewport remain fully post-processed and allocation-free.
      renderer.render(scene, sourceCamera);
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, innerWidth, innerHeight);
      helperGroup.visible = true;
      if(gizmoHelper) gizmoHelper.visible = true;
      cameraHelperVisibility.forEach(pair => { if(pair[0]) pair[0].visible = pair[1]; });
    }
  }
  // ---------------------------------------------------------- preview aspect
  // Every editor preview resolves its shape here, through one policy, so the PIP,
  // the Cinema floating preview and the floating layout can no longer disagree.
  // `ED.masterPreviewAspect` is the editor-wide override; 'auto' means it is off.
  function aspectPolicy(){ return window.LK_ASPECT_POLICY; }
  function levelDefaultAspect(){
    const cfg = GAME.player && GAME.player.cameraCfg;
    return cfg && cfg.aspect || 'auto';
  }
  /** The shape a camera preview should have. `authored` is the camera's own choice. */
  function resolvePreviewAspect(authored){
    const policy = aspectPolicy();
    if(!policy) return {ratio:16 / 9, name:'16:9', source:'fallback', scoped:true};
    return policy.resolve({
      mode:'editor',
      authored,
      level:levelDefaultAspect(),
      master:ED.masterPreviewAspect,
      width:innerWidth,
      height:innerHeight,
    });
  }
  /** The PIP's shape: the selected camera's own aspect, whichever kind it is. */
  function editorPreviewAspect(sceneCameraHolder, playerCameraNode){
    const authored = sceneCameraHolder
      ? (sceneCameraHolder.userData && sceneCameraHolder.userData.cameraProps || {}).aspect
      : (playerCameraNode ? levelDefaultAspect() : levelDefaultAspect());
    return resolvePreviewAspect(authored);
  }
  function cinemaFloatAspect(){
    // The Cinema select is this preview's authored choice; the master still wins.
    return resolvePreviewAspect(ED.cinemaFloatPreviewAspect || '16:9').ratio;
  }
  function shouldHideForFinalPreview(node){
    const ud = node && node.userData || {};
    const renderableHelper = !!(node && (node.isMesh || node.isLine || node.isPoints || node.isSprite || node.isLight));
    return !!(
      ud.helperOnly ||
      ud.colliderPreview ||
      ud.editorOnly ||
      (ud.nonExportable && (!ud.logicElementInternal || ud.logicElementRuntimeVisual === false) && renderableHelper) ||
      ud.editorCameraHelper ||
      ud.editorCameraHelperPick ||
      ud.editorLightHandle
    );
  }
  function beginCinemaFinalPreviewRender(finalMode){
    if(!finalMode) return [];
    const hidden = [];
    const hideNode = node => {
      if(!node || !node.visible) return;
      hidden.push([node, node.visible]);
      node.visible = false;
    };
    if(helperGroup) hideNode(helperGroup);
    const gizmo = deps.getGizmo && deps.getGizmo();
    const gizmoHelper = transformControlsHelper(gizmo);
    if(gizmoHelper) hideNode(gizmoHelper);
    scene.traverse(node => {
      if(shouldHideForFinalPreview(node)) hideNode(node);
    });
    return hidden;
  }
  function endCinemaFinalPreviewRender(hidden){
    (hidden || []).forEach(pair => {
      if(pair && pair[0]) pair[0].visible = pair[1];
    });
  }
  function cinemaStudioById(id){
    return GAME.world.registry.find(o => o && o.userData && o.userData.editorId === id && o.userData.editorType === 'cinemaStudio') || null;
  }
  function sceneCameraHolderById(id){
    return sceneCameras().find(o => o.userData && o.userData.editorId === id) || null;
  }
  function cinemaStudios(){
    return GAME.world.registry.filter(o => o && o.userData && o.userData.editorType === 'cinemaStudio');
  }
  function isPlayerOutput(value){
    const index = Number(value);
    return Number.isInteger(index) && index >= 0 && index <= 3;
  }
  function shouldStartPlayerCinema(props){
    return !!props && isPlayerOutput(props.outputPlayerIndex) && props.trigger === 'on-play';
  }
  function playerOneCinemaPreviewState(studio){
    const id = studio && studio.userData && studio.userData.editorId || '';
    let state = ED.cinemaPlayerOutputPreview;
    if(!state || state.id !== id) state = {id, time:0};
    ED.cinemaPlayerOutputPreview = state;
    return state;
  }
  function startOnPlayCinematics(){
    if(!cinemaStudio) return false;
    const explicit=ED.cinemaPreview&&ED.cinemaPreview.runtime&&ED.cinemaPreview.playing&&ED.cinemaPreview.source==='logic-element';
    // startEditorPreview resolves after Logic On Start has run. Never let the
    // subsequent automatic Studio scan overwrite that explicit one-shot state
    // (and its deferred Completed continuation) with the authored loop state.
    if(explicit)return true;
    let started = false;
    cinemaStudios().forEach(studio => {
      const props = cinemaStudio.propsFor(studio);
      if(!shouldStartPlayerCinema(props)) return;
      cinemaStudio.playStudio(studio, {time:0, playing:true, runtime:true, source:'on-play'});
      started = true;
    });
    return started;
  }
  function stopRuntimeCinematics(){
    if(!cinemaStudio) return;
    const state = ED.cinemaPreview;
    if(!state || !state.runtime) return;
    const studio = cinemaStudioById(state.id);
    cinemaStudio.stopStudio(studio);
  }
  function triggerCinemaEvent(eventName, opts){
    if(!cinemaStudio) return [];
    return cinemaStudio.triggerRuntimeEvent(eventName, opts);
  }
  function openCinemaVideoExport(studio){
    const target = studio || (cinemaStudio && cinemaStudio.activeStudio());
    return !!(target && cinemaVideoExporter && cinemaVideoExporter.open(target));
  }
  window.addEventListener('lotking:cinemastart', event => {
    if(!cinemaStudio || !GAME.state || !GAME.state.editorActive) return;
    const detail = event && event.detail || {};
    const directStudio = detail.studio && detail.studio.userData ? detail.studio : null;
    const ref = directStudio ? '' : String(detail.studio || '');
    const studio = directStudio || cinemaStudios().find(item => !ref || item.userData.editorId === ref || item.userData.editorName === ref ||
      (item.userData.cinemaProps && item.userData.cinemaProps.eventName === ref));
    if(studio){
      GAME.state.cinemaInputLocked = true;
      cinemaStudio.playStudio(studio, {
        time:detail.time || 0,playing:true,runtime:true,source:'logic-element',
        playerId:Number(detail.playerId)||null,
        playbackOverride:detail.playbackOverride==='once'?'once':null,
        onComplete:typeof detail.onComplete==='function'?detail.onComplete:null,
        completionOverride:detail.completion&&typeof detail.completion==='object'?detail.completion:null,
      });
    }
  });
  window.addEventListener('lotking:cinemastop', () => {
    if(!cinemaStudio || !GAME.state || !GAME.state.editorActive) return;
    const state = ED.cinemaPreview;
    cinemaStudio.stopStudio(state && cinemaStudioById(state.id));
    GAME.state.cinemaInputLocked = false;
  });
  function cinemaTriggerId(o){
    return o && o.userData && (o.userData.editorId || (o.userData.addedEntry && o.userData.addedEntry.id)) || '';
  }
  function pointInsideCinemaTrigger(o, point){
    const c = o && o.userData && o.userData.collider;
    const ref = c && c.ref;
    if(!ref || ref.enabled === false || !point) return false;
    const hx = Math.max(.05, Number(ref.hx) || 1);
    const hy = Math.max(.05, Number(ref.hy) || 1);
    const hz = Math.max(.05, Number(ref.hz) || 1);
    const dx = point.x - (Number(ref.x) || 0);
    const dy = point.y - (Number(ref.y) || 0);
    const dz = point.z - (Number(ref.z) || 0);
    const ry = Number.isFinite(Number(ref.rotY)) ? Number(ref.rotY) : (Number(ref.rot) || 0);
    const cos = Math.cos(-ry);
    const sin = Math.sin(-ry);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    return Math.abs(lx) <= hx && Math.abs(lz) <= hz && Math.abs(dy) <= hy + .75;
  }
  function scanCinemaTriggerVolumes(){
    if(!cinemaStudio || !GAME.player || !GAME.player.car) return;
    const pos = GAME.player.car.position;
    GAME.world.registry.forEach(o => {
      if(!(o && o.userData && o.userData.colliderOnly)) return;
      const trigger = Object.assign({enabled:false, eventName:'', mode:'once'}, o.userData.cinemaTrigger || {});
      const id = cinemaTriggerId(o);
      if(!id || !trigger.enabled){
        if(id) cinemaTriggerState.delete(id);
        return;
      }
      const inside = pointInsideCinemaTrigger(o, pos);
      const prev = cinemaTriggerState.get(id) || {inside:false, fired:false};
      if(inside && !prev.inside && (trigger.mode === 'repeat' || !prev.fired)){
        const started = triggerCinemaEvent(trigger.eventName || '', {time:0});
        if(started && started.length){
          deps.status('Cinema event: ' + (trigger.eventName || 'runtime-event'));
        }
        prev.fired = true;
      }
      prev.inside = inside;
      cinemaTriggerState.set(id, prev);
    });
  }
  function applyRuntimeCinemaCamera(shot, rect){
    if(!shot || !shot.cameraId) return false;
    const holder = sceneCameraHolderById(shot.cameraId);
    const cam = holder && normalizeSceneCameraLocal(holder);
    if(!holder || !cam) return false;
    const blendAlpha=Number(shot.__completionBlendAlpha);
    const blending=Number.isFinite(blendAlpha);
    const targetPosition=blending?gameCam.position.clone():null;
    const targetQuaternion=blending?gameCam.quaternion.clone():null;
    const targetFov=gameCam.fov,targetNear=gameCam.near,targetFar=gameCam.far;
    holder.updateMatrixWorld(true);
    cam.updateMatrixWorld(true);
    cam.getWorldPosition(runtimeCamPos);
    cam.getWorldQuaternion(runtimeCamQuat);
    gameCam.position.copy(runtimeCamPos);
    gameCam.quaternion.copy(runtimeCamQuat);
    gameCam.fov = cam.fov || gameCam.fov;
    gameCam.near = cam.near || gameCam.near;
    gameCam.far = cam.far || gameCam.far;
    if(blending){
      const alpha=Math.max(0,Math.min(1,blendAlpha));
      gameCam.position.lerp(targetPosition,alpha);
      gameCam.quaternion.slerp(targetQuaternion,alpha);
      gameCam.fov+=(targetFov-gameCam.fov)*alpha;
      gameCam.near+=(targetNear-gameCam.near)*alpha;
      gameCam.far+=(targetFar-gameCam.far)*alpha;
    }
    gameCam.aspect = rect && rect.h ? rect.w / Math.max(1, rect.h) : gameCam.aspect;
    gameCam.updateProjectionMatrix();
    gameCam.updateMatrixWorld(true);
    return true;
  }
  function renderCinemaFloatingPreview(viewRect, dt){
    const frame = $('#lkCinemaPreviewFrame');
    if(!frame) return;
    if(!cinemaStudio || ED.playPreview){
      frame.classList.remove('on');
      return;
    }
    let selectedStudio = ED.selected;
    while(selectedStudio && !(selectedStudio.userData && selectedStudio.userData.editorType === 'cinemaStudio')){
      selectedStudio = selectedStudio.parent;
    }
    const selectedProps = selectedStudio ? cinemaStudio.propsFor(selectedStudio) : null;
    const selectedPlayerPreview = !!(selectedStudio && selectedProps && isPlayerOutput(selectedProps.outputPlayerIndex));
    const studio = selectedPlayerPreview
      ? selectedStudio
      : (ED.cinemaFloatPreviewOn ? cinemaStudioById(ED.cinemaTimelineId || (ED.cinemaPreview && ED.cinemaPreview.id)) : null);
    const autoPlayerPreview = selectedPlayerPreview && !ED.cinemaFloatPreviewOn;
    if(!studio){
      frame.classList.remove('on');
      return;
    }
    const props = cinemaStudio.propsFor(studio);
    const activePreviewState = ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId ? ED.cinemaPreview : null;
    const state = activePreviewState || (autoPlayerPreview ? playerOneCinemaPreviewState(studio) : {time:0, playing:false});
    const finalOutputPreview = autoPlayerPreview && !activePreviewState;
    const shot = cinemaStudio.applyAtTime(studio, state.time || 0, {skipEditableTarget:!state.playing && !finalOutputPreview});
    const rightW = deps.panelWidth('right');
    const usableW = Math.max(320, innerWidth - deps.panelWidth('left') - rightW - 28);
    const aspect = cinemaFloatAspect();
    const availableW = Math.max(80, Math.min(usableW * .9, viewRect.w - 20));
    const availableH = Math.max(80, viewRect.h - 20);
    const fitW = Math.min(availableW, availableH * aspect);
    const w = Math.round(Math.max(80, Math.min(ED.cinemaFloatPreviewW || 640, fitW)));
    const hgt = Math.round(w / aspect);
    const displayW = ED.cinemaFloatPreviewMinimized ? 210 : w;
    const displayH = ED.cinemaFloatPreviewMinimized ? 26 : hgt;
    const defaultPos = autoPlayerPreview
      ? {x:innerWidth - rightW - displayW - 14, y:innerHeight - 40 - displayH - 14}
      : {x:viewRect.x + 18, y:viewRect.y + 18};
    const pos = deps.clampPanelPos(ED.cinemaFloatPreviewPos || defaultPos, displayW, displayH);
    const x = pos.x;
    const y = pos.y;
    frame.classList.add('on');
    frame.classList.toggle('minimized', !!ED.cinemaFloatPreviewMinimized);
    frame.style.left = x + 'px';
    frame.style.top = y + 'px';
    frame.style.width = displayW + 'px';
    frame.style.height = displayH + 'px';
    const minBtn = $('#lkCinemaPreviewMinimize');
    if(minBtn) minBtn.textContent = ED.cinemaFloatPreviewMinimized ? '+' : '-';
    const meta = $('#lkCinemaPreviewMeta');
    if(meta){
      meta.innerHTML = '';
      const title = document.createElement('b');
      const info = document.createElement('span');
      const camName = shot && shot.cameraId ? (sceneCameraHolderById(shot.cameraId) && (sceneCameraHolderById(shot.cameraId).userData.editorName || shot.cameraId) || shot.cameraId) : 'No active camera';
      const finalMode = (ED.cinemaPreviewMode || 'final') !== 'normal';
      title.textContent = studio.userData.editorName || 'Cinema Studio';
      info.textContent = (autoPlayerPreview ? 'Player 1 - ' : '') + (finalMode ? 'Final' : 'Normal') + ' - ' + camName + ' - ' + (state.time || 0).toFixed(2) + ' / ' + (props.duration || 0).toFixed(2) + 's';
      meta.appendChild(title);
      meta.appendChild(document.createElement('br'));
      meta.appendChild(info);
    }
    if(ED.cinemaFloatPreviewMinimized) return;
    const holder = shot && shot.cameraId ? sceneCameraHolderById(shot.cameraId) : null;
    const cam = holder && normalizeSceneCameraLocal(holder);
    if(!cam) return;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    holder.updateMatrixWorld(true);
    const finalMode = (ED.cinemaPreviewMode || 'final') !== 'normal';
    const hidden = beginCinemaFinalPreviewRender(finalMode);
    const glY = innerHeight - y - hgt;
    try {
      renderer.setScissorTest(true);
      const targetY = viewportY(glY, hgt);
      renderer.setViewport(x, targetY, w, hgt);
      renderer.setScissor(x, targetY, w, hgt);
      renderer.render(scene, cam);
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, innerWidth, innerHeight);
      endCinemaFinalPreviewRender(hidden);
    }
  }

  function syncGamePreviewCamera(){
    const car = GAME.player.car;
    const cfg = GAME.player.cameraCfg;
    const mode = cfg.mode || 'free';
    const dist = mode === 'free'
      ? Math.max(cfg.minDist || 4.5, Math.min(cfg.maxDist || 20, (cfg.minDist + cfg.maxDist) * .5 || 9))
      : Math.max(2, cfg.arcadeDistance || 9);
    car.updateMatrixWorld(true);
    const fwd = playerPreviewForward.set(0, 0, 1).transformDirection(car.matrixWorld);
    fwd.y = 0;
    if(fwd.lengthSq() < 1e-6) fwd.set(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y));
    fwd.normalize();
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();
    const target = car.position.clone().add(new THREE.Vector3(0, Math.max(.1, Number(cfg.lookHeight) || 1.1), 0));
    if(mode === 'interior'){
      const interiorDummy = GAME.player.cameraDummies && GAME.player.cameraDummies.interior;
      if(interiorDummy){
        interiorDummy.updateWorldMatrix(true, false);
        interiorDummy.getWorldPosition(gameCam.position);
        interiorDummy.getWorldQuaternion(gameCam.quaternion);
      } else {
        gameCam.position.copy(car.localToWorld(new THREE.Vector3(
          cfg.interiorLateral == null ? -.42 : Number(cfg.interiorLateral) || 0,
          Number(cfg.interiorHeight) || 1.15,
          Number(cfg.interiorForward) || 0
        )));
        const interiorTarget = gameCam.position.clone().addScaledVector(fwd, 12);
        interiorTarget.y += Number(cfg.interiorLookHeight) || 0;
        gameCam.lookAt(interiorTarget);
        if(Array.isArray(cfg.interiorRotation)){
          gameCam.quaternion.copy(car.getWorldQuaternion(new THREE.Quaternion()).multiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(cfg.interiorRotation[0] || 0, cfg.interiorRotation[1] || 0, cfg.interiorRotation[2] || 0, 'XYZ'))
          ));
        }
      }
      gameCam.fov = cfg.interiorFov || 72;
      gameCam.aspect = GAME.player.cameraAspectValue ? GAME.player.cameraAspectValue() : (innerWidth / innerHeight);
      gameCam.far = cfg.far || 500;
      gameCam.updateProjectionMatrix();
      gameCam.updateMatrixWorld(true);
      return;
    }
    const freePitch = Math.max(.05, Math.min(1.2, Number(cfg.freePitch) || .32));
    let height = mode === 'free' ? Math.max(.2, Math.sin(freePitch) * dist) : Math.max(1.2, cfg.arcadeHeight || 3.1);
    let sideOffset = Math.max(-8, Math.min(8, Number(cfg.lateralOffset) || 0));
    let close = 0;
    if(mode === 'cinematic'){
      sideOffset += (cfg.cinematicDriftOrbit || 0) * dist * .7;
      close = cfg.cinematicDriftClose || 0;
      height += cfg.cinematicDriftHeight || 0;
    }
    if(mode === 'free'){
      const yaw = THREE.MathUtils.degToRad(Number(cfg.freeYawOffset) || 0);
      const horizontal = Math.cos(freePitch) * dist;
      gameCam.position.copy(target)
        .addScaledVector(fwd, -Math.cos(yaw) * horizontal)
        .addScaledVector(side, Math.sin(yaw) * horizontal + sideOffset)
        .add(new THREE.Vector3(0, height, 0));
    } else {
      gameCam.position.copy(target)
        .addScaledVector(fwd, -Math.max(2, dist - close))
        .addScaledVector(side, sideOffset)
        .add(new THREE.Vector3(0, height, 0));
    }
    gameCam.lookAt(target);
    if((mode === 'arcade' || mode === 'cinematic') && Array.isArray(cfg.externalRotation)){
      gameCam.quaternion.copy(car.getWorldQuaternion(new THREE.Quaternion()).multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(cfg.externalRotation[0] || 0, cfg.externalRotation[1] || 0, cfg.externalRotation[2] || 0, 'XYZ'))
      ));
    }
    gameCam.fov = cfg.fov || 62;
    gameCam.aspect = GAME.player.cameraAspectValue ? GAME.player.cameraAspectValue() : (innerWidth / innerHeight);
    gameCam.far = cfg.far || 500;
    gameCam.updateProjectionMatrix();
    gameCam.updateMatrixWorld(true);
  }

  return Object.freeze({
    enterEditor,
    setPlayPreview,
    startPlayPreview,
    stopPlayPreview,
    exitEditor,
    editorFrame,
    syncGamePreviewCamera,
    triggerCinemaEvent,
    openCinemaVideoExport,
    syncCinemaTimeline,
    requestWarmup,
  });
}

window.LK_EDITOR_RUNTIME = Object.freeze({create});
})();
