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
  let previewWarmupTimer = 0;
  let previewWarmupSeq = 0;
  const cinemaTriggerState = new Map();
  const runtimeCamPos = new THREE.Vector3();
  const runtimeCamQuat = new THREE.Quaternion();
  const playerPreviewForward = new THREE.Vector3();
  const cinemaStudio = window.LK_EDITOR_CINEMA_STUDIO && window.LK_EDITOR_CINEMA_STUDIO.create({
    GAME,
    ED,
    root,
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
    getOrbit: deps.getOrbit,
    editorViewportRect: deps.editorViewportRect,
    setActiveViewportSlot: deps.setActiveViewportSlot,
    cameraForView: deps.cameraForView,
    cinemaStudio,
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
    if(renderer && renderer.compileAsync && scene && gameCam){
      Promise.resolve(renderer.compileAsync(scene, gameCam)).then(finish, finish);
    } else {
      requestAnimationFrame(() => requestAnimationFrame(finish));
    }
  }

  function showPreviewWarmup(){
    requestWarmup('Warm-up...', {minMs:900, maxMs:1600});
  }

  function setEditorLightHandlesVisible(visible){
    if(!GAME.world || !GAME.world.registry) return;
    GAME.world.registry.forEach(o => {
      if(!o || !(o.userData && o.userData.light) || !o.traverse) return;
      o.traverse(n => {
        if(!(n.userData && n.userData.editorLightHandle)) return;
        n.visible = true;
        if(n.material){
          n.material.opacity = visible ? .42 : 0;
          n.material.needsUpdate = true;
        }
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
    car.rotation.y = GAME.player.physics.heading;

    if(!GAME.state.started){
      const h = GAME.player.physics.heading;
      const off = new THREE.Vector3(Math.sin(-h + Math.PI) * Math.cos(.32), Math.sin(.32), Math.cos(-h + Math.PI) * Math.cos(.32)).multiplyScalar(9);
      gameCam.position.copy(car.position).add(off);
      gameCam.lookAt(car.position.x, car.position.y + 1.1, car.position.z);
    }

    scene.add(helperGroup);
    helperGroup.add(grid, axes, gizmoProxy, colliderProxy);
    const rigHelper = deps.ensureCameraRigHelper();
    let camHelper = deps.getCamHelper();
    if(!camHelper){
      camHelper = new THREE.CameraHelper(camProxy);
      camHelper.visible = ED.camHelperOn;
      deps.setCamHelper(camHelper);
    }
    helperGroup.add(camHelper, rigHelper, camRigLine);
    scene.add(deps.getGizmo());
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

  function setPlayPreview(on){
    ED.playPreview = !!on;
    if(ED.playPreview) deps.clearHoverPickHelper();
    if(ED.playPreview && viewportLayout) viewportLayout.updateOverlays(null);
    if(ED.playPreview && cinemaStudio) cinemaStudio.hideTimeline();
    root.classList.toggle('play-preview', ED.playPreview);
    const btn = $('#lkPlay');
    if(btn) btn.textContent = ED.playPreview ? '■ STOP' : '▶ PREVIEW';
    $('#lkPipFrame').classList.remove('on');
    const gizmo = deps.getGizmo();
    if(gizmo) gizmo.visible = !ED.playPreview;
    const orbit = deps.getOrbit();
    if(orbit) orbit.enabled = deps.shouldEnableOrbit ? deps.shouldEnableOrbit() : (ED.active && !ED.playPreview);
  }

  function startPlayPreview(){
    if(!deps.saveScene()) return;
    deps.closeMenu();
    showPreviewWarmup();
    deps.status('Warm-up preview...');
    requestAnimationFrame(() => {
      if(GAME.actions.startEditorPreview) GAME.actions.startEditorPreview();
      if(GAME.player.updateLights) GAME.player.updateLights();
      if(GAME.player.updateExhaust) GAME.player.updateExhaust(0);
      if(GAME.player.updateSkids) GAME.player.updateSkids();
      setPlayPreview(true);
      cinemaTriggerState.clear();
      startOnPlayCinematics();
      deps.status('Play preview running — Esc to stop');
    });
  }

  function stopPlayPreview(){
    stopRuntimeCinematics();
    cinemaTriggerState.clear();
    if(GAME.actions.stopEditorPreview) GAME.actions.stopEditorPreview();
    setPlayPreview(false);
    if(GAME.player.updateExhaust) GAME.player.updateExhaust(0);
    if(GAME.player.updateSkids) GAME.player.updateSkids();
    if(deps.restorePreviewTransforms) deps.restorePreviewTransforms();
    const orbit = deps.getOrbit();
    if(orbit){
      orbit.enabled = deps.shouldEnableOrbit ? deps.shouldEnableOrbit() : true;
      orbit.target.copy(GAME.player.car.position).setY(1);
    }
    const gizmo = deps.getGizmo();
    if(gizmo) gizmo.visible = true;
    deps.status('Play preview stopped');
  }

  function exitEditor(toPlay){
    if(!ED.active) return;
    if(ED.playPreview) stopPlayPreview();
    if(!toPlay && window.__LK_STANDALONE_EDITOR){
      location.href = 'index.html';
      return;
    }
    ED.active = false;
    GAME.state.editorActive = false;
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
    scene.remove(gizmo);
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
    if(ED.playPreview){
      renderPlayPreview(dt);
      return;
    }
    deps.updateEditorControls(dt);
    const viewRect = deps.editorViewportRect();
    camE.aspect = viewRect.w / viewRect.h;
    camE.updateProjectionMatrix();

    for(const h of GAME.hooks.frame) h(dt);
    if(GAME.player.updateExhaust) GAME.player.updateExhaust(dt);
    if(GAME.player.updateDataWidgets) GAME.player.updateDataWidgets();

    if(cinemaStudio) cinemaStudio.updatePreview(dt);
    syncGamePreviewCamera();
    updateCameraHelpers();
    deps.updateViewportPickingHelpers();
    deps.updateSelectionAndDropHelpers();
    deps.processThumbQueue();
    if(viewportLayout) viewportLayout.syncToolbarVisual();
    if(viewportLayout) viewportLayout.renderEditorViewport(viewRect);
    else renderEditorViewportFallback(viewRect);
    renderPip();
    renderCinemaFloatingPreview(viewRect);
    if(viewportLayout) viewportLayout.updateStats(dt, viewRect);
    if(cinemaStudio) cinemaStudio.syncTimeline(viewRect);
  }

  function renderPlayPreview(dt){
    if(GAME.actions.stepGameplayPreview) GAME.actions.stepGameplayPreview(dt);
    scanCinemaTriggerVolumes();
    const runtimeState = ED.cinemaPreview && ED.cinemaPreview.runtime ? ED.cinemaPreview : null;
    let runtimeShot = null;
    if(runtimeState && cinemaStudio){
      const shot = cinemaStudio.updatePreview(dt);
      runtimeShot = runtimeState.playing ? shot : null;
    }
    if(viewportLayout) viewportLayout.updateOverlays(null);
    helperGroup.visible = false;
    const gizmo = deps.getGizmo();
    if(gizmo) gizmo.visible = false;
    $('#lkPipFrame').classList.remove('on');
    const viewRect = deps.editorViewportRect();
    const glRect = {x:viewRect.x, y:innerHeight - viewRect.y - viewRect.h, w:viewRect.w, h:viewRect.h};
    applyRuntimeCinemaCamera(runtimeShot, glRect);
    if(GAME.actions.renderGameplayCameraRect) GAME.actions.renderGameplayCameraRect(glRect);
    else {
      renderer.setScissorTest(true);
      renderer.setViewport(glRect.x, glRect.y, glRect.w, glRect.h);
      renderer.setScissor(glRect.x, glRect.y, glRect.w, glRect.h);
      renderer.render(scene, gameCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, innerWidth, innerHeight);
    }
    if(viewportLayout) viewportLayout.updateStats(dt, viewRect);
    helperGroup.visible = true;
    if(gizmo) gizmo.visible = false;
  }

  function updateCameraHelpers(){
    camProxy.position.copy(gameCam.position);
    camProxy.quaternion.copy(gameCam.quaternion);
    camProxy.fov = gameCam.fov;
    camProxy.aspect = gameCam.aspect;
    camProxy.far = Math.min(30, GAME.player.cameraCfg.far);
    camProxy.updateProjectionMatrix();
    camProxy.updateMatrixWorld(true);
    const camHelper = deps.getCamHelper();
    if(camHelper && camHelper.visible) camHelper.update();
    deps.updateCameraRigHelper();
    if(camRigLine){
      camRigLine.visible = ED.camHelperOn;
      const pts = camRigLine.geometry.attributes.position;
      pts.setXYZ(0, gameCam.position.x, gameCam.position.y, gameCam.position.z);
      pts.setXYZ(1, GAME.player.car.position.x, GAME.player.car.position.y + 1.1, GAME.player.car.position.z);
      pts.needsUpdate = true;
    }
  }

  function renderEditorViewportFallback(viewRect){
    renderer.setScissorTest(true);
    renderer.setViewport(viewRect.x, innerHeight - viewRect.y - viewRect.h, viewRect.w, viewRect.h);
    renderer.setScissor(viewRect.x, innerHeight - viewRect.y - viewRect.h, viewRect.w, viewRect.h);
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

  function renderPip(){
    if(!(ED.pipOn && deps.isPlayerCameraSelection())){
      $('#lkPipFrame').classList.remove('on');
      return;
    }
    const rightW = deps.panelWidth('right');
    const usableW = Math.max(320, innerWidth - deps.panelWidth('left') - rightW - 28);
    const aspect = GAME.player.cameraAspectValue ? GAME.player.cameraAspectValue() : (gameCam.aspect || innerWidth / innerHeight);
    const w = Math.round(Math.min(ED.pipW, usableW * .9));
    const hgt = Math.round(w / aspect);
    const defaultPos = {
      x: innerWidth - rightW - w - 14,
      y: innerHeight - 40 - hgt - 14,
    };
    const pos = deps.clampPanelPos(ED.pipPos || defaultPos, w, hgt);
    const x = pos.x;
    const y = pos.y;
    const pipFrame = $('#lkPipFrame');
    pipFrame.classList.add('on');
    pipFrame.classList.toggle('minimized', !!ED.pipMinimized);
    const pipMin = $('#lkPipMinimize');
    if(pipMin){
      pipMin.textContent = ED.pipMinimized ? '+' : '−';
      pipMin.title = ED.pipMinimized ? 'Expand player camera' : 'Minimize player camera';
    }
    pipFrame.style.left = x + 'px';
    pipFrame.style.top = y + 'px';
    pipFrame.style.width = (ED.pipMinimized ? 170 : w) + 'px';
    pipFrame.style.height = (ED.pipMinimized ? 26 : hgt) + 'px';
    if(ED.pipMinimized) return;
    helperGroup.visible = false;
    const gizmo = deps.getGizmo();
    if(gizmo) gizmo.visible = false;
    const glY = innerHeight - y - hgt;
    try {
      renderer.setScissorTest(true);
      renderer.setViewport(x, glY, w, hgt);
      renderer.setScissor(x, glY, w, hgt);
      const cc = GAME.player.cameraCfg;
      const postOn = ((cc.dof && cc.dof.enabled) || (cc.grade && cc.grade.enabled)) && GAME.systems.post && GAME.systems.post.ok;
      if(postOn){
        try {
          GAME.systems.post.composer.setSize(w, hgt);
          GAME.systems.post.render();
        } catch(err){
          console.error('LotKing editor: post-processing PIP failed, falling back to direct render', err);
          const it = GAME && GAME.i18n && GAME.i18n.lang === 'it';
          deps.status((it ? '⚠ Post-processing PIP fallito (' : '⚠ Post-processing PIP failed (') + (err && err.message || err) + (it ? '): render diretto' : '): direct render'));
          try { renderer.setRenderTarget(null); } catch(e){}
          renderer.render(scene, gameCam);
        } finally {
          try { GAME.systems.post.composer.setSize(innerWidth, innerHeight); } catch(e){}
        }
      } else {
        renderer.render(scene, gameCam);
      }
    } finally {
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, innerWidth, innerHeight);
      helperGroup.visible = true;
      if(gizmo) gizmo.visible = true;
    }
  }
  function cinemaFloatAspect(){
    const spec = ED.cinemaFloatPreviewAspect || '16:9';
    if(spec === '21:9') return 21 / 9;
    if(spec === '4:3') return 4 / 3;
    if(spec === '1:1') return 1;
    if(spec === '9:16') return 9 / 16;
    return 16 / 9;
  }
  function shouldHideForFinalPreview(node){
    const ud = node && node.userData || {};
    return !!(
      ud.helperOnly ||
      ud.colliderPreview ||
      ud.editorOnly ||
      ud.nonExportable ||
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
    if(gizmo) hideNode(gizmo);
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
  function startOnPlayCinematics(){
    if(!cinemaStudio) return false;
    let started = false;
    cinemaStudios().forEach(studio => {
      const props = cinemaStudio.propsFor(studio);
      if(props.trigger !== 'on-play') return;
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
    holder.updateMatrixWorld(true);
    cam.updateMatrixWorld(true);
    cam.getWorldPosition(runtimeCamPos);
    cam.getWorldQuaternion(runtimeCamQuat);
    gameCam.position.copy(runtimeCamPos);
    gameCam.quaternion.copy(runtimeCamQuat);
    gameCam.fov = cam.fov || gameCam.fov;
    gameCam.near = cam.near || gameCam.near;
    gameCam.far = cam.far || gameCam.far;
    gameCam.aspect = rect && rect.h ? rect.w / Math.max(1, rect.h) : gameCam.aspect;
    gameCam.updateProjectionMatrix();
    gameCam.updateMatrixWorld(true);
    return true;
  }
  function renderCinemaFloatingPreview(viewRect){
    const frame = $('#lkCinemaPreviewFrame');
    if(!frame) return;
    if(!ED.cinemaFloatPreviewOn || !cinemaStudio || ED.playPreview){
      frame.classList.remove('on');
      return;
    }
    const studio = cinemaStudioById(ED.cinemaTimelineId || (ED.cinemaPreview && ED.cinemaPreview.id));
    if(!studio){
      frame.classList.remove('on');
      return;
    }
    const props = cinemaStudio.propsFor(studio);
    const state = ED.cinemaPreview && ED.cinemaPreview.id === studio.userData.editorId ? ED.cinemaPreview : {time:0, playing:false};
    const shot = cinemaStudio.applyAtTime(studio, state.time || 0, {skipEditableTarget:!state.playing});
    const rightW = deps.panelWidth('right');
    const usableW = Math.max(320, innerWidth - deps.panelWidth('left') - rightW - 28);
    const aspect = cinemaFloatAspect();
    const w = Math.round(Math.min(ED.cinemaFloatPreviewW || 640, usableW * .9));
    const hgt = Math.round(w / aspect);
    const defaultPos = {x:viewRect.x + 18, y:viewRect.y + 18};
    const pos = deps.clampPanelPos(ED.cinemaFloatPreviewPos || defaultPos, w, hgt);
    const x = pos.x;
    const y = pos.y;
    frame.classList.add('on');
    frame.classList.toggle('minimized', !!ED.cinemaFloatPreviewMinimized);
    frame.style.left = x + 'px';
    frame.style.top = y + 'px';
    frame.style.width = (ED.cinemaFloatPreviewMinimized ? 210 : w) + 'px';
    frame.style.height = (ED.cinemaFloatPreviewMinimized ? 26 : hgt) + 'px';
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
      info.textContent = (finalMode ? 'Final' : 'Normal') + ' - ' + camName + ' - ' + (state.time || 0).toFixed(2) + ' / ' + (props.duration || 0).toFixed(2) + 's';
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
      renderer.setViewport(x, glY, w, hgt);
      renderer.setScissor(x, glY, w, hgt);
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
    const target = car.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    let height = mode === 'free' ? Math.max(2.3, dist * .34) : Math.max(1.2, cfg.arcadeHeight || 3.1);
    let sideOffset = 0;
    let close = 0;
    if(mode === 'cinematic'){
      sideOffset = (cfg.cinematicDriftOrbit || 0) * dist * .7;
      close = cfg.cinematicDriftClose || 0;
      height += cfg.cinematicDriftHeight || 0;
    }
    gameCam.position.copy(target)
      .addScaledVector(fwd, -Math.max(2, dist - close))
      .addScaledVector(side, sideOffset)
      .add(new THREE.Vector3(0, height, 0));
    gameCam.lookAt(target);
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
    requestWarmup,
  });
}

window.LK_EDITOR_RUNTIME = Object.freeze({create});
})();
