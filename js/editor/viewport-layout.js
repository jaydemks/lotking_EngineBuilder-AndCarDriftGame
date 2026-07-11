/* =========================================================
   LOT KING - EDITOR VIEWPORT LAYOUT
   Quad view layout, view overlays, render modes and viewport stats.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const ED = deps.ED;
  const root = deps.root;
  const renderer = deps.renderer;
  const scene = deps.scene;
  const camE = deps.camE;
  const $ = deps.$;
  const orthoCams = Object.create(null);
  const renderMats = {};
  const statsBox = root.querySelector('#lkViewportStats');
  let viewOptionSig = '';
  let fpsAvg = 0;
  let maxFrameMs = 0;
  let frameSpikeCount = 0;
  let lastFrameSpikeAt = 0;
  let longTaskCount = 0;
  let longTaskMaxMs = 0;
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  if(typeof PerformanceObserver !== 'undefined'){
    try {
      const observer = new PerformanceObserver(list => {
        list.getEntries().forEach(entry => {
          const ms = entry.duration || 0;
          longTaskCount++;
          if(ms > longTaskMaxMs) longTaskMaxMs = ms;
        });
      });
      observer.observe({type:'longtask', buffered:true});
    } catch(err){}
  }

  root.querySelectorAll('.lk-view-corner select').forEach(select => {
    select.addEventListener('change', () => {
      const slot = Number(select.closest('.lk-view-corner').dataset.viewSlot || 0);
      ED.viewportSlots[slot] = select.value;
      if(deps.setActiveViewportSlot) deps.setActiveViewportSlot(slot);
      else ED.activeViewportSlot = slot;
    });
  });
  root.querySelectorAll('.lk-view-corner .lk-view-helpers input').forEach(input => {
    input.addEventListener('change', () => {
      const slot = Number(input.closest('.lk-view-corner').dataset.viewSlot || 0);
      ED.viewportShowHelpers[slot] = !!input.checked;
    });
  });
  const videoSettingsButton = root.querySelector('#lkViewportVideoSettings');
  if(videoSettingsButton) videoSettingsButton.addEventListener('click', () => {
    if(GAME.actions && GAME.actions.openSettingsTab) GAME.actions.openSettingsTab('video', 'editor');
  });
  root.querySelectorAll('.lk-view-split,[data-split]').forEach(handle => {
    if(!handle.dataset || !handle.dataset.split) return;
    handle.addEventListener('pointerdown', e => {
      if(ED.viewportMode !== 'quad') return;
      e.preventDefault();
      e.stopPropagation();
      const axis = handle.dataset.split;
      const rect = deps.editorViewportRect();
      const startX = clampSplit(ED.viewportSplitX);
      const startY = clampSplit(ED.viewportSplitY);
      const start = {x:e.clientX, y:e.clientY};
      const move = ev => {
        if(axis.indexOf('x') >= 0) ED.viewportSplitX = clampSplit(startX + (ev.clientX - start.x) / Math.max(1, rect.w));
        if(axis.indexOf('y') >= 0) ED.viewportSplitY = clampSplit(startY + (ev.clientY - start.y) / Math.max(1, rect.h));
      };
      const up = () => {
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
      };
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', up, true);
    });
  });

  function sceneCameras(){
    return deps.sceneCameras ? deps.sceneCameras() : [];
  }
  function normalizeSceneCameraLocal(holder){
    return deps.normalizeSceneCameraLocal ? deps.normalizeSceneCameraLocal(holder) : null;
  }
  function syncToolbarVisual(){
    root.classList.toggle('viewport-toolbar-collapsed', !!ED.viewportToolbarCollapsed);
    const vpSingle = $('#lkViewportSingle');
    const vpQuad = $('#lkViewportQuad');
    const vpRender = $('#lkViewportRenderMode');
    const vpFps = $('#lkViewportFps');
    const vpPerf = $('#lkViewportPerf');
    if(vpSingle) vpSingle.classList.toggle('on', ED.viewportMode !== 'quad');
    if(vpQuad) vpQuad.classList.toggle('on', ED.viewportMode === 'quad');
    if(vpRender){
      const slot = ED.viewportMode === 'quad' ? Math.max(0, Math.min(3, ED.activeViewportSlot || 0)) : 0;
      vpRender.value = ED.viewportRenderModes[slot] || 'normal';
    }
    if(vpFps) vpFps.classList.toggle('on', !!ED.showFps);
    if(vpPerf) vpPerf.classList.toggle('on', !!ED.showPerf);
  }
  function viewOptions(){
    const base = [
      {value:'perspective', label:tr('Perspective', 'Prospettiva')},
      {value:'top', label:tr('Top', 'Alto')},
      {value:'bottom', label:tr('Bottom', 'Basso')},
      {value:'front', label:tr('Front', 'Fronte')},
      {value:'back', label:tr('Back', 'Retro')},
      {value:'right', label:tr('Right', 'Destra')},
      {value:'left', label:tr('Left', 'Sinistra')},
    ];
    sceneCameras().forEach(cam => base.push({
      value:'cam:' + cam.userData.editorId,
      label:cam.userData.editorName || cam.userData.editorId,
    }));
    GAME.world.registry
      .filter(o => o && o.userData && o.userData.editorType === 'cinemaStudio')
      .forEach(studio => base.push({
        value:'timeline:' + studio.userData.editorId,
        label:tr('Timeline: ', 'Timeline: ') + (studio.userData.editorName || studio.userData.editorId),
      }));
    return base;
  }
  function syncViewSelectOptions(){
    const opts = viewOptions();
    const sig = opts.map(o => o.value + ':' + o.label).join('|');
    root.querySelectorAll('.lk-view-corner select').forEach(select => {
      const slot = Number(select.closest('.lk-view-corner').dataset.viewSlot || 0);
      const current = ED.viewportSlots[slot] || select.value || 'top';
      if(sig !== viewOptionSig){
        select.innerHTML = '';
        opts.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          select.appendChild(option);
        });
      }
      select.value = opts.some(opt => opt.value === current) ? current : opts[0].value;
      ED.viewportSlots[slot] = select.value;
    });
    viewOptionSig = sig;
  }
  function updateOverlays(rects){
    const wrap = root.querySelector('#lkViewportOverlays');
    if(!wrap) return;
    wrap.classList.toggle('on', !!rects);
    if(!rects) return;
    syncViewSelectOptions();
    root.querySelectorAll('.lk-view-corner').forEach((node, index) => {
      node.style.display = rects[index] ? '' : 'none';
    });
    wrap.querySelectorAll('[data-split]').forEach(handle => { handle.style.display = rects.length === 4 ? '' : 'none'; });
    rects.forEach((rect, index) => {
      const node = wrap.querySelector('[data-view-slot="' + index + '"]');
      if(!node) return;
      node.style.left = (rect.x + 8) + 'px';
      node.style.top = (rect.y + 8) + 'px';
      node.classList.toggle('active', index === (ED.activeViewportSlot || 0));
      const helperInput = node.querySelector('.lk-view-helpers input');
      const spec = ED.viewportSlots[index] || 'perspective';
      const cleanPreview = spec.indexOf('cam:') === 0 || spec.indexOf('timeline:') === 0;
      if(helperInput){
        helperInput.disabled = cleanPreview;
        helperInput.checked = !cleanPreview && ED.viewportShowHelpers[index] !== false;
      }
      const helperLabel = node.querySelector('.lk-view-helpers');
      if(helperLabel) helperLabel.title = cleanPreview
        ? tr('Camera and Timeline views always show the clean final result', 'Le viste Camera e Timeline mostrano sempre il risultato finale pulito')
        : tr('Show editor helpers in this view', 'Mostra helper editor in questa vista');
    });
    if(rects.length < 4) return;
    const left = rects[0].x;
    const top = rects[0].y;
    const right = rects[1].x + rects[1].w;
    const bottom = rects[2].y + rects[2].h;
    const splitX = rects[1].x;
    const splitY = rects[2].y;
    const v = wrap.querySelector('#lkViewportSplitV');
    const h = wrap.querySelector('#lkViewportSplitH');
    const c = wrap.querySelector('#lkViewportSplitC');
    if(v){
      v.style.left = splitX + 'px';
      v.style.top = top + 'px';
      v.style.height = (bottom - top) + 'px';
    }
    if(h){
      h.style.left = left + 'px';
      h.style.top = splitY + 'px';
      h.style.width = (right - left) + 'px';
    }
    if(c){
      c.style.left = splitX + 'px';
      c.style.top = splitY + 'px';
    }
  }
  function clampSplit(value){
    return Math.max(.18, Math.min(.82, Number(value) || .5));
  }
  function viewportTarget(){
    const orbit = deps.getOrbit && deps.getOrbit();
    if(orbit && orbit.target) return orbit.target.clone();
    return GAME.player.car.position.clone().setY(1);
  }
  function viewState(slot){
    const states = ED.viewportViewStates || (ED.viewportViewStates = {});
    const key = 'slot' + Math.max(0, Math.min(3, slot || 0));
    if(!states[key]){
      const target = viewportTarget();
      states[key] = {target:{x:target.x, y:target.y, z:target.z}, span:Math.max(18, ED.gridSize ? ED.gridSize * .22 : 48)};
    }
    return states[key];
  }
  function viewTarget(slot){
    const state = viewState(slot);
    const t = state.target || {};
    return new THREE.Vector3(t.x || 0, t.y || 0, t.z || 0);
  }
  function orthoCamera(slot, kind, rect){
    const key = kind || 'top';
    const camKey = slot + ':' + key;
    let cam = orthoCams[camKey];
    if(!cam){
      cam = new THREE.OrthographicCamera(-10, 10, 10, -10, -1000, 1000);
      orthoCams[camKey] = cam;
    }
    const target = viewTarget(slot);
    const aspect = rect.w / Math.max(1, rect.h);
    const span = Math.max(2, viewState(slot).span || (ED.gridSize ? ED.gridSize * .22 : 48));
    cam.left = -span * aspect * .5;
    cam.right = span * aspect * .5;
    cam.top = span * .5;
    cam.bottom = -span * .5;
    const dist = 120;
    if(key === 'bottom'){
      cam.position.copy(target).add(new THREE.Vector3(0, -dist, 0));
      cam.up.set(0, 0, -1);
    } else if(key === 'front'){
      cam.position.copy(target).add(new THREE.Vector3(0, 0, dist));
      cam.up.set(0, 1, 0);
    } else if(key === 'back'){
      cam.position.copy(target).add(new THREE.Vector3(0, 0, -dist));
      cam.up.set(0, 1, 0);
    } else if(key === 'right'){
      cam.position.copy(target).add(new THREE.Vector3(dist, 0, 0));
      cam.up.set(0, 1, 0);
    } else if(key === 'left'){
      cam.position.copy(target).add(new THREE.Vector3(-dist, 0, 0));
      cam.up.set(0, 1, 0);
    } else {
      cam.position.copy(target).add(new THREE.Vector3(0, dist, 0));
      cam.up.set(0, 0, -1);
    }
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    return cam;
  }
  function cameraForView(slot, rect){
    const spec = ED.viewportSlots[slot] || ['perspective', 'top', 'right', 'front'][slot] || 'top';
    if(spec === 'perspective' && deps.cameraForView) return deps.cameraForView(slot, rect);
    if(spec.indexOf('timeline:') === 0){
      const id = spec.slice(9);
      const studio = GAME.world.registry.find(o => o && o.userData && o.userData.editorId === id && o.userData.editorType === 'cinemaStudio');
      if(studio && deps.cinemaStudio){
        const state = ED.cinemaPreview && ED.cinemaPreview.id === id ? ED.cinemaPreview : {time:0};
        const shot = deps.cinemaStudio.applyAtTime(studio, state.time || 0, {skipEditableTarget:!state.playing});
        if(shot && shot.cameraId){
          const holder = sceneCameras().find(o => o.userData.editorId === shot.cameraId);
          if(holder && holder.userData.sceneCamera){
            const cam = normalizeSceneCameraLocal(holder);
            cam.aspect = rect.w / Math.max(1, rect.h);
            cam.updateProjectionMatrix();
            holder.updateMatrixWorld(true);
            cam.userData.lkSceneCameraPreview = true;
            return cam;
          }
        }
      }
    }
    if(spec.indexOf('cam:') === 0){
      const id = spec.slice(4);
      const holder = sceneCameras().find(o => o.userData.editorId === id);
      if(holder && holder.userData.sceneCamera){
        const cam = normalizeSceneCameraLocal(holder);
        cam.aspect = rect.w / Math.max(1, rect.h);
        cam.updateProjectionMatrix();
        holder.updateMatrixWorld(true);
        cam.userData.lkSceneCameraPreview = true;
        return cam;
      }
    }
    return orthoCamera(slot, spec, rect);
  }
  function renderRect(rect, camera){
    const glY = innerHeight - rect.y - rect.h;
    renderer.setViewport(rect.x, glY, rect.w, rect.h);
    renderer.setScissor(rect.x, glY, rect.w, rect.h);
    if(camera && camera.isPerspectiveCamera){
      camera.aspect = rect.w / Math.max(1, rect.h);
      camera.updateProjectionMatrix();
    }
    const slot = rect.slot || 0;
    const mode = ED.viewportRenderModes[slot] || 'normal';
    const hidden = [];
    const previousOverride = scene.overrideMaterial;
    const previousFog = scene.fog;
    const helperGroup = deps.getHelperGroup && deps.getHelperGroup();
    const previousHelperVisible = helperGroup ? helperGroup.visible : null;
    const gizmo = deps.getGizmo && deps.getGizmo();
    const previousGizmoVisible = gizmo ? gizmo.visible : null;
    const spec = ED.viewportSlots[slot] || 'perspective';
    const cleanCameraView = spec.indexOf('cam:') === 0 || spec.indexOf('timeline:') === 0;
    const showHelpers = !cleanCameraView && ED.viewportShowHelpers[slot] !== false;
    if(helperGroup) helperGroup.visible = showHelpers && previousHelperVisible !== false;
    if(gizmo) gizmo.visible = showHelpers && (ED.viewportMode !== 'quad' || slot === (ED.activeViewportSlot || 0)) && previousGizmoVisible !== false;
    if(!showHelpers){
      scene.traverse(n => {
        if(!n.visible || n === helperGroup || n === gizmo) return;
        const ud = n.userData || {};
        if(ud.helperOnly || ud.colliderPreview || ud.editorOnly || ud.nonExportable || ud.editorCameraHelper || ud.editorCameraHelperPick || ud.editorLightHandle){
          hidden.push(n);
          n.visible = false;
        }
      });
    }
    if(camera && camera.userData && camera.userData.lkSceneCameraPreview){
      GAME.world.registry.forEach(o => {
        if(!(o && o.userData && o.userData.editorType === 'camera' && o.traverse)) return;
        o.traverse(n => {
          if(n.userData && n.userData.editorCameraHelper && n.visible){
            hidden.push(n);
            n.visible = false;
          }
        });
      });
    }
    if(mode === 'wire' || mode === 'clay' || mode === 'mesh' || mode === 'unlit' || mode === 'reflect'){
      scene.overrideMaterial = renderModeMaterial(mode);
    }
    if(mode === 'lights'){
      GAME.world.registry.forEach(o => {
        if(!o || !o.traverse) return;
        const keepEntity = o.userData && (o.userData.editorType === 'light' || o.userData.editorType === 'camera');
        o.traverse(n => {
          if(!n.visible) return;
          const keepNode = keepEntity || n.isLight || (n.userData && (n.userData.editorLightHandle || n.userData.editorCameraHelper));
          if(!keepNode && (n.isMesh || n.isLine || n.isLineSegments || n.isSprite)){
            hidden.push(n);
            n.visible = false;
          }
        });
      });
    }
    // Orthographic editor cameras sit far from their target only to establish
    // projection direction. World fog must not treat that technical offset as
    // the actual viewing distance, otherwise Top/Front/Side become a blue veil.
    if(camera && camera.isOrthographicCamera) scene.fog = null;
    try {
      const postRendered = mode === 'normal' && deps.renderPost && deps.renderPost(rect, camera);
      if(!postRendered) renderer.render(scene, camera);
    } finally {
      scene.fog = previousFog;
      scene.overrideMaterial = previousOverride;
      if(helperGroup) helperGroup.visible = previousHelperVisible;
      if(gizmo) gizmo.visible = previousGizmoVisible;
      hidden.forEach(n => { n.visible = true; });
    }
  }
  function renderModeMaterial(mode){
    if(renderMats[mode]) return renderMats[mode];
    if(mode === 'wire') renderMats[mode] = new THREE.MeshBasicMaterial({color:0x78d7ff, wireframe:true});
    else if(mode === 'clay') renderMats[mode] = new THREE.MeshStandardMaterial({color:0xaeb7c6, roughness:.82, metalness:0});
    else if(mode === 'reflect') renderMats[mode] = new THREE.MeshStandardMaterial({color:0xffffff, roughness:.08, metalness:1});
    else if(mode === 'unlit') renderMats[mode] = new THREE.MeshBasicMaterial({color:0xdfe5f1});
    else renderMats[mode] = new THREE.MeshBasicMaterial({color:0x9aa3b8});
    return renderMats[mode];
  }
  function renderEditorViewport(viewRect){
    if(ED.viewportMode === 'quad'){
      renderQuadViewport(viewRect);
      return;
    }
    updateOverlays([Object.assign({slot:0}, viewRect)]);
    renderer.setScissorTest(true);
    renderRect(Object.assign({slot:0}, viewRect), cameraForView(0, viewRect));
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
  function renderQuadViewport(viewRect){
    const splitX = clampSplit(ED.viewportSplitX);
    const splitY = clampSplit(ED.viewportSplitY);
    ED.viewportSplitX = splitX;
    ED.viewportSplitY = splitY;
    const w1 = Math.floor(viewRect.w * splitX);
    const h1 = Math.floor(viewRect.h * splitY);
    const rects = [
      {slot:0, x:viewRect.x, y:viewRect.y, w:w1, h:h1},
      {slot:1, x:viewRect.x + w1, y:viewRect.y, w:viewRect.w - w1, h:h1},
      {slot:2, x:viewRect.x, y:viewRect.y + h1, w:w1, h:viewRect.h - h1},
      {slot:3, x:viewRect.x + w1, y:viewRect.y + h1, w:viewRect.w - w1, h:viewRect.h - h1},
    ];
    updateOverlays(rects);
    renderer.setScissorTest(true);
    const warming = Number.isInteger(ED.viewportQuadWarmupStep);
    const lastSlot = warming ? Math.max(0, Math.min(3, ED.viewportQuadWarmupStep)) : 3;
    rects.forEach((rect, index) => {
      if(index > lastSlot) return;
      renderRect(rect, cameraForView(index, rect));
    });
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    if(warming){
      const rendered = lastSlot + 1;
      root.dispatchEvent(new CustomEvent('lotking:quad-warmup-progress', {detail:{step:rendered}}));
      if(lastSlot >= 3){
        delete ED.viewportQuadWarmupStep;
        root.dispatchEvent(new CustomEvent('lotking:quad-warmup-ready'));
      } else {
        ED.viewportQuadWarmupStep = lastSlot + 1;
      }
    }
  }
  function updateStats(dt, viewRect){
    if(!statsBox) return;
    const on = !!(ED.showFps || ED.showPerf);
    statsBox.classList.toggle('on', on);
    if(!on) return;
    const fps = dt > 0 ? 1 / dt : 0;
    const frameMs = dt * 1000;
    if(frameMs > maxFrameMs) maxFrameMs = frameMs;
    if(frameMs > 100 && performance.now() - lastFrameSpikeAt > 250){
      frameSpikeCount++;
      lastFrameSpikeAt = performance.now();
    }
    fpsAvg = fpsAvg ? fpsAvg * .9 + fps * .1 : fps;
    const info = renderer.info || {};
    const render = info.render || {};
    const memory = info.memory || {};
    const heap = typeof performance !== 'undefined' && performance.memory
      ? '<br><span>Heap</span> ' + (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + '/' + (performance.memory.jsHeapSizeLimit / 1048576).toFixed(0) + ' MB'
      : '';
    statsBox.style.left = 'auto';
    statsBox.style.right = Math.max(0, innerWidth - (viewRect.x + viewRect.w) + 8) + 'px';
    statsBox.style.top = (viewRect.y + 8) + 'px';
    statsBox.innerHTML = (ED.showFps ? '<b>' + Math.round(fpsAvg) + ' FPS</b> <span>' + (dt * 1000).toFixed(1) + ' ms</span>' : '') +
      (ED.showPerf ? (ED.showFps ? '<br>' : '') +
        '<span>Draw</span> ' + (render.calls || 0) +
        ' <span>Tri</span> ' + (render.triangles || 0) +
        '<br><span>Geom</span> ' + (memory.geometries || 0) +
        ' <span>Tex</span> ' + (memory.textures || 0) +
        '<br><span>Max frame</span> ' + maxFrameMs.toFixed(0) + ' ms' +
        ' <span>Spike&gt;100</span> ' + frameSpikeCount +
        '<br><span>Long tasks</span> ' + longTaskCount +
        ' <span>Max</span> ' + longTaskMaxMs.toFixed(0) + ' ms' +
        heap
      : '');
  }

  return Object.freeze({
    renderEditorViewport,
    syncToolbarVisual,
    updateOverlays,
    updateStats,
  });
}

window.LK_EDITOR_VIEWPORT_LAYOUT = Object.freeze({create});
})();
