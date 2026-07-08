/* =========================================================
   LOT KING - EDITOR GIZMO CONTROLS
   Toolbar state, TransformControls setup, Z-up proxy and tool switching.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const ED = deps.ED;
  const root = deps.root;
  const $ = deps.$;
  const scene = deps.scene;
  const camE = deps.camE;
  const renderer = deps.renderer;
  const GAME = deps.GAME || window.LOT_KING || {};
  const controlDom = (renderer && renderer.domElement) || deps.canvas || (GAME.core && GAME.core.canvas) || (GAME.core && GAME.core.renderer && GAME.core.renderer.domElement) || null;
  const gizmoProxy = deps.gizmoProxy;
  const colliderProxy = deps.colliderProxy;
  const zUpGizmoQuat = deps.zUpGizmoQuat;
  const fly = deps.fly;
  let shiftFineMode = false;
  let ctrlSnapMode = false;
  const fineDragFactor = 0.001;
  const modifierSnap = {
    move: 0.5,
    rot: THREE.MathUtils.degToRad(5),
    scale: 0.05,
  };
  const advancedDrag = {
    active: false,
    object: null,
    virtualX: 0,
    virtualY: 0,
    controlX: 0,
    controlY: 0,
    lastPointerDown: null,
    cursor: null,
  };

  function spaceLabel(){
    if(ED.space === 'local') return '📍 Local Z-up';
    if(ED.space === 'engine') return '⚙ Engine Y-up';
    return '🌐 World Z-up';
  }

  function transformControlsSpace(){
    if(ED.space === 'local') return 'local';
    return 'world';
  }

  function syncToolbarState(){
    const space = $('#lkSpace');
    if(space) space.textContent = spaceLabel();
    const snap = $('#lkSnap');
    if(snap) snap.classList.toggle('on', ED.snap);
    const gridBtn = $('#lkGrid');
    if(gridBtn) gridBtn.classList.toggle('on', ED.gridOn);
    const camBtn = $('#lkCamHelper');
    if(camBtn) camBtn.classList.toggle('on', ED.camHelperOn);
    const pipBtn = $('#lkPipToggle');
    if(pipBtn) pipBtn.classList.toggle('on', ED.pipOn);
    root.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === ED.tool));
  }

  function updateEditorAxesConvention(){
    syncToolbarState();
    const gizmo = deps.getGizmo();
    if(gizmo) gizmo.setSpace(transformControlsSpace());
    if(ED.selected && gizmo && ED.tool !== 'select') attachGizmoToSelection();
  }

  function shouldEnableOrbit(){
    return deps.shouldEnableOrbit ? deps.shouldEnableOrbit() : (ED.active && !ED.playPreview);
  }

  function usesZUpGizmoProxy(){
    return !!(ED.selected && !ED.colliderEdit && !ED.playerColliderEdit && ED.space !== 'engine' && ['translate','rotate','scale'].includes(ED.tool));
  }

  function multiSelection(){
    return Array.isArray(ED.multiSelected) ? ED.multiSelected.filter(o => o && o.isObject3D) : [];
  }

  function usesMultiGizmoProxy(){
    return !!(multiSelection().length > 1 && !ED.colliderEdit && !ED.playerColliderEdit);
  }

  function syncMultiGizmoProxyFromSelection(){
    const list = multiSelection();
    if(!gizmoProxy || list.length < 2) return false;
    const box = new THREE.Box3();
    let hasBox = false;
    list.forEach(o => {
      o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o);
      if(!b.isEmpty()){
        box.union(b);
        hasBox = true;
      }
    });
    if(hasBox) box.getCenter(gizmoProxy.position);
    else {
      gizmoProxy.position.set(0, 0, 0);
      list.forEach(o => gizmoProxy.position.add(o.getWorldPosition(new THREE.Vector3())));
      gizmoProxy.position.multiplyScalar(1 / list.length);
    }
    gizmoProxy.quaternion.identity();
    gizmoProxy.scale.set(1, 1, 1);
    gizmoProxy.updateMatrix();
    gizmoProxy.updateMatrixWorld(true);
    gizmoProxy.userData.multiTransformBase = {
      proxyWorld: gizmoProxy.matrixWorld.clone(),
      objects: list.map(o => {
        o.updateMatrixWorld(true);
        return {object: o, world: o.matrixWorld.clone()};
      }),
    };
    return true;
  }

  function applyMultiGizmoProxyToSelection(){
    const base = gizmoProxy && gizmoProxy.userData && gizmoProxy.userData.multiTransformBase;
    if(!base || !Array.isArray(base.objects) || !base.objects.length) return false;
    gizmoProxy.updateMatrixWorld(true);
    const invBase = base.proxyWorld.clone().invert();
    const delta = gizmoProxy.matrixWorld.clone().multiply(invBase);
    const parentInv = new THREE.Matrix4();
    const nextWorld = new THREE.Matrix4();
    const nextLocal = new THREE.Matrix4();
    base.objects.forEach(item => {
      const o = item && item.object;
      if(!o || !o.parent) return;
      if(o.parent.updateMatrixWorld) o.parent.updateMatrixWorld(true);
      parentInv.copy(o.parent.matrixWorld).invert();
      nextWorld.multiplyMatrices(delta, item.world);
      nextLocal.multiplyMatrices(parentInv, nextWorld);
      nextLocal.decompose(o.position, o.quaternion, o.scale);
      o.updateMatrixWorld(true);
    });
    return true;
  }

  function syncColliderProxyFromSelected(){
    const o = ED.selected;
    let ref = o && o.userData && o.userData.collider && o.userData.collider.ref;
    if(!colliderProxy || !ref) return false;
    if(Number.isInteger(ED.colliderPartIndex) && ref.parts && ref.parts[ED.colliderPartIndex]){
      ref = ref.parts[ED.colliderPartIndex];
    }
    colliderProxy.position.set(ref.x || 0, ref.y != null ? ref.y : Math.max(.1, ref.hy || .5), ref.z || 0);
    colliderProxy.rotation.set(ref.rotX || 0, ref.rotY != null ? ref.rotY : (ref.rot || 0), ref.rotZ || 0);
    colliderProxy.scale.set(1, 1, 1);
    colliderProxy.userData.colliderBase = {
      kind: o.userData.collider.kind,
      x: ref.x || 0,
      y: ref.y != null ? ref.y : Math.max(.1, ref.hy || .5),
      z: ref.z || 0,
      hx: ref.hx || 1,
      hy: ref.hy || .5,
      hz: ref.hz || 1,
      r: ref.r || 1,
      rotX: ref.rotX || 0,
      rotY: ref.rotY != null ? ref.rotY : (ref.rot || 0),
      rotZ: ref.rotZ || 0,
      partIndex: Number.isInteger(ED.colliderPartIndex) ? ED.colliderPartIndex : null,
    };
    colliderProxy.updateMatrixWorld(true);
    return true;
  }

  function syncPlayerColliderProxyFromSelected(){
    const car = GAME && GAME.player && GAME.player.car;
    const col = GAME && GAME.player && GAME.player.collision;
    if(!colliderProxy || !car || !col || ED.selected !== car) return false;
    const hx = col.hx == null ? .92 : col.hx;
    const hy = col.hy == null ? .42 : col.hy;
    const hz = col.hz == null ? 1.85 : col.hz;
    const offsetX = col.offsetX || 0;
    const offsetY = col.offsetY == null ? .45 : col.offsetY;
    const offsetZ = col.offsetZ || 0;
    const bodyY = col.bodyY == null ? .55 : col.bodyY;
    const yaw = car.rotation ? (car.rotation.y || 0) : 0;
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    colliderProxy.position.set(
      car.position.x + offsetX * cos + offsetZ * sin,
      bodyY + offsetY,
      car.position.z - offsetX * sin + offsetZ * cos
    );
    colliderProxy.rotation.set(col.rotX || 0, yaw + (col.rotY || 0), col.rotZ || 0);
    colliderProxy.scale.set(1, 1, 1);
    colliderProxy.userData.colliderBase = {
      playerCollider: true,
      hx, hy, hz,
      offsetX, offsetY, offsetZ,
      bodyY,
      rotX: col.rotX || 0,
      rotY: col.rotY || 0,
      rotZ: col.rotZ || 0,
      carYaw: yaw,
    };
    colliderProxy.updateMatrixWorld(true);
    return true;
  }

  function syncZUpProxyFromSelected(){
    if(!ED.selected) return;
    ED.selected.updateMatrixWorld(true);
    ED.selected.getWorldPosition(gizmoProxy.position);
    if(ED.space === 'local'){
      ED.selected.getWorldQuaternion(gizmoProxy.quaternion);
      gizmoProxy.quaternion.multiply(zUpGizmoQuat);
    } else {
      gizmoProxy.quaternion.copy(zUpGizmoQuat);
    }
    gizmoProxy.scale.set(1, 1, 1);
    gizmoProxy.userData.zUpTransformBase = {
      proxyWorld: null,
      object: ED.selected,
      objectWorld: ED.selected.matrixWorld.clone(),
    };
    gizmoProxy.updateMatrixWorld(true);
    gizmoProxy.userData.zUpTransformBase.proxyWorld = gizmoProxy.matrixWorld.clone();
  }

  function applyZUpProxyToSelected(){
    const o = ED.selected;
    if(!o || !deps.isGizmoUsingZUpProxy()) return;
    const base = gizmoProxy.userData && gizmoProxy.userData.zUpTransformBase;
    if(!base || base.object !== o || !base.proxyWorld || !base.objectWorld){
      syncZUpProxyFromSelected();
      return;
    }
    gizmoProxy.updateMatrixWorld(true);
    const delta = gizmoProxy.matrixWorld.clone().multiply(base.proxyWorld.clone().invert());
    const nextWorld = delta.multiply(base.objectWorld);
    if(o.parent && o.parent.isObject3D){
      o.parent.updateMatrixWorld(true);
      const nextLocal = o.parent.matrixWorld.clone().invert().multiply(nextWorld);
      nextLocal.decompose(o.position, o.quaternion, o.scale);
    } else {
      nextWorld.decompose(o.position, o.quaternion, o.scale);
    }
    o.updateMatrixWorld(true);
  }

  function applyGizmoSnap(gizmo){
    gizmo.setTranslationSnap(ED.snap ? ED.snapMove : null);
    gizmo.setRotationSnap(ED.snap ? THREE.MathUtils.degToRad(ED.snapRot) : null);
    gizmo.setScaleSnap(ED.snap ? ED.snapScale : null);
  }

  function applyGizmoModifierSnap(gizmo){
    if(!gizmo) return;
    if(ctrlSnapMode){
      gizmo.setTranslationSnap(modifierSnap.move);
      gizmo.setRotationSnap(modifierSnap.rot);
      gizmo.setScaleSnap(modifierSnap.scale);
    } else {
      applyGizmoSnap(gizmo);
    }
  }

  function setTransformModifierState(gizmo, e){
    if(e){
      shiftFineMode = !!e.shiftKey;
      ctrlSnapMode = !!(e.ctrlKey || e.metaKey);
    }
    applyGizmoModifierSnap(gizmo);
  }

  function patchGizmoPointerMove(gizmo){
    if(!gizmo || gizmo.userData && gizmo.userData.lkAdvancedTransformPatched) return;
    const basePointerMove = gizmo.pointerMove.bind(gizmo);
    gizmo.pointerMove = pointer => {
      applyGizmoModifierSnap(gizmo);
      basePointerMove(pointer);
    };
    gizmo.userData = gizmo.userData || {};
    gizmo.userData.lkAdvancedTransformPatched = true;
  }

  function viewportRect(){
    return controlDom && controlDom.getBoundingClientRect ? controlDom.getBoundingClientRect() : null;
  }

  function ensureVirtualCursor(){
    if(advancedDrag.cursor) return advancedDrag.cursor;
    const c = document.createElement('div');
    c.className = 'lk-transform-virtual-cursor';
    c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '<span></span>';
    document.body.appendChild(c);
    advancedDrag.cursor = c;
    return c;
  }

  function setVirtualCursorVisible(visible){
    const c = ensureVirtualCursor();
    c.classList.toggle('on', !!visible);
    updateVirtualCursor();
  }

  function updateVirtualCursor(){
    const c = advancedDrag.cursor;
    if(!c || !c.classList.contains('on')) return;
    c.style.transform = 'translate(' + Math.round(advancedDrag.virtualX) + 'px,' + Math.round(advancedDrag.virtualY) + 'px)';
  }

  function clampVirtualPointer(){
    const rect = viewportRect();
    if(!rect) return;
    advancedDrag.virtualX = Math.max(rect.left + 2, Math.min(rect.right - 2, advancedDrag.virtualX));
    advancedDrag.virtualY = Math.max(rect.top + 2, Math.min(rect.bottom - 2, advancedDrag.virtualY));
  }

  function wrapVirtualPointer(dx, dy){
    const rect = viewportRect();
    if(!rect || rect.width <= 2 || rect.height <= 2) return null;
    const fine = shiftFineMode && !ctrlSnapMode ? fineDragFactor : 1;
    const stepX = (dx || 0) * fine;
    const stepY = (dy || 0) * fine;
    advancedDrag.controlX += stepX;
    advancedDrag.controlY += stepY;
    advancedDrag.virtualX += stepX;
    advancedDrag.virtualY += stepY;
    const pad = 3;
    const minX = rect.left + pad, maxX = rect.right - pad;
    const minY = rect.top + pad, maxY = rect.bottom - pad;
    if(advancedDrag.virtualX < minX) advancedDrag.virtualX = maxX;
    else if(advancedDrag.virtualX > maxX) advancedDrag.virtualX = minX;
    if(advancedDrag.virtualY < minY) advancedDrag.virtualY = maxY;
    else if(advancedDrag.virtualY > maxY) advancedDrag.virtualY = minY;
    updateVirtualCursor();
    return {
      x: (advancedDrag.controlX - rect.left) / rect.width * 2 - 1,
      y: -((advancedDrag.controlY - rect.top) / rect.height) * 2 + 1,
      button: -1,
    };
  }

  function startAdvancedDrag(gizmo){
    if(!gizmo || !gizmo.object) return;
    const rect = viewportRect();
    const p = advancedDrag.lastPointerDown || {};
    advancedDrag.active = true;
    advancedDrag.object = gizmo.object;
    advancedDrag.virtualX = Number.isFinite(p.clientX) ? p.clientX : (rect ? rect.left + rect.width / 2 : 0);
    advancedDrag.virtualY = Number.isFinite(p.clientY) ? p.clientY : (rect ? rect.top + rect.height / 2 : 0);
    clampVirtualPointer();
    advancedDrag.controlX = advancedDrag.virtualX;
    advancedDrag.controlY = advancedDrag.virtualY;
    setTransformModifierState(gizmo, p.event);
    if(controlDom && controlDom.requestPointerLock && p.pointerType !== 'touch'){
      try {
        const result = controlDom.requestPointerLock();
        if(result && result.catch) result.catch(() => {});
      } catch(err){}
    }
  }

  function endAdvancedDrag(gizmo){
    advancedDrag.active = false;
    advancedDrag.object = null;
    setVirtualCursorVisible(false);
    if(document.pointerLockElement === controlDom && document.exitPointerLock){
      try { document.exitPointerLock(); } catch(err){}
    }
    applyGizmoSnap(gizmo);
  }

  function handleLockedMove(e){
    const gizmo = deps.getGizmo();
    if(!advancedDrag.active || !gizmo || !gizmo.dragging || document.pointerLockElement !== controlDom) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setTransformModifierState(gizmo, e);
    const pointer = wrapVirtualPointer(e.movementX || 0, e.movementY || 0);
    if(pointer) gizmo.pointerMove(pointer);
  }

  function handlePointerLockChange(){
    const locked = document.pointerLockElement === controlDom && advancedDrag.active;
    setVirtualCursorVisible(locked);
  }

  function attachGizmoToSelection(){
    const gizmo = deps.getGizmo();
    if(!gizmo || !ED.selected) return;
    gizmo.setMode(ED.tool);
    if(ED.playerColliderEdit && syncPlayerColliderProxyFromSelected()){
      gizmo.setSpace('world');
      deps.setGizmoUsingZUpProxy(false);
      applyGizmoSnap(gizmo);
      gizmo.attach(colliderProxy);
      return;
    }
    if(ED.colliderEdit && syncColliderProxyFromSelected()){
      gizmo.setSpace('world');
      deps.setGizmoUsingZUpProxy(false);
      applyGizmoSnap(gizmo);
      gizmo.attach(colliderProxy);
      return;
    }
    if(usesMultiGizmoProxy() && syncMultiGizmoProxyFromSelection()){
      gizmo.setSpace('world');
      deps.setGizmoUsingZUpProxy(false);
      applyGizmoSnap(gizmo);
      gizmo.attach(gizmoProxy);
      return;
    }
    if(usesZUpGizmoProxy()){
      syncZUpProxyFromSelected();
      gizmo.setSpace('local');
      deps.setGizmoUsingZUpProxy(true);
    } else {
      gizmo.setSpace(transformControlsSpace());
      deps.setGizmoUsingZUpProxy(false);
    }
    applyGizmoSnap(gizmo);
    gizmo.attach(deps.isGizmoUsingZUpProxy() ? gizmoProxy : ED.selected);
  }

  function ensureControls(){
    if(!controlDom) return;
    let orbit = deps.getOrbit();
    if(!orbit && THREE.OrbitControls){
      orbit = new THREE.OrbitControls(camE, controlDom);
      orbit.enabled = false;
      orbit.enableDamping = true;
      orbit.dampingFactor = .08;
      orbit.screenSpacePanning = true;
      orbit.enablePan = true;
      orbit.enableZoom = true;
      orbit.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: null,
      };
      deps.setOrbit(orbit);
    }
    let gizmo = deps.getGizmo();
    if(!gizmo && THREE.TransformControls){
      gizmo = new THREE.TransformControls(camE, controlDom);
      patchGizmoPointerMove(gizmo);
      gizmo.setMode(ED.tool);
      gizmo.setSpace(transformControlsSpace());
      applyGizmoSnap(gizmo);
      controlDom.addEventListener('pointerdown', e => {
        advancedDrag.lastPointerDown = {clientX:e.clientX, clientY:e.clientY, pointerType:e.pointerType, event:e};
      }, true);
      document.addEventListener('pointermove', handleLockedMove, true);
      document.addEventListener('mousemove', handleLockedMove, true);
      document.addEventListener('pointerlockchange', handlePointerLockChange);
      gizmo.addEventListener('mouseDown', () => {
        ED.gizmoPointerActive = true;
        deps.setGizmoPointerActive(true);
        deps.setGizmoSuppressSceneClick(true);
        if(deps.isGizmoUsingZUpProxy()) syncZUpProxyFromSelected();
        startAdvancedDrag(gizmo);
        if(ED.colliderEdit) deps.beginColliderHistory(ED.selected);
        else deps.beginTransformHistory();
        const activeOrbit = deps.getOrbit();
        if(activeOrbit) activeOrbit.enabled = false;
      });
      gizmo.addEventListener('mouseUp', () => {
        if(ED.colliderEdit) deps.commitColliderHistory('Collider transform');
        else deps.commitTransformHistory('Transform');
        endAdvancedDrag(gizmo);
        ED.gizmoPointerActive = false;
        deps.setGizmoPointerActive(false);
        setTimeout(() => { deps.setGizmoSuppressSceneClick(false); }, 0);
        const activeOrbit = deps.getOrbit();
        if(activeOrbit) activeOrbit.enabled = shouldEnableOrbit();
      });
      gizmo.addEventListener('objectChange', deps.onGizmoChange);
      gizmo.addEventListener('dragging-changed', e => {
        ED.gizmoPointerActive = !!e.value;
        const activeOrbit = deps.getOrbit();
        if(activeOrbit) activeOrbit.enabled = !e.value && shouldEnableOrbit();
      });
      addEventListener('keydown', e => {
        if(e.key === 'Shift'){
          shiftFineMode = true;
          if(gizmo.dragging) applyGizmoModifierSnap(gizmo);
        } else if(e.key === 'Control' || e.key === 'Meta'){
          ctrlSnapMode = true;
          if(gizmo.dragging) applyGizmoModifierSnap(gizmo);
        }
      });
      addEventListener('keyup', e => {
        if(e.key === 'Shift'){
          shiftFineMode = false;
          applyGizmoModifierSnap(gizmo);
        } else if(e.key === 'Control' || e.key === 'Meta'){
          ctrlSnapMode = false;
          applyGizmoModifierSnap(gizmo);
        }
      });
      deps.setGizmo(gizmo);
    }
  }

  function setTool(tool){
    ED.tool = tool || 'select';
    syncToolbarState();
    const gizmo = deps.getGizmo();
    if(gizmo){
      if(ED.tool === 'select' || !ED.selected){
        deps.setGizmoUsingZUpProxy(false);
        gizmo.detach();
      } else {
        gizmo.setMode(ED.tool);
        gizmo.setSpace(transformControlsSpace());
        attachGizmoToSelection();
      }
    }
    deps.status('Tool: ' + ED.tool);
  }

  function updateFly(dt){
    deps.flyUpdate(dt);
    const orbit = deps.getOrbit();
    if(orbit && orbit.enabled) orbit.update();
  }

  return Object.freeze({
    spaceLabel,
    transformControlsSpace,
    syncToolbarState,
    updateEditorAxesConvention,
    usesZUpGizmoProxy,
    syncZUpProxyFromSelected,
    applyZUpProxyToSelected,
    usesMultiGizmoProxy,
    syncMultiGizmoProxyFromSelection,
    applyMultiGizmoProxyToSelection,
    attachGizmoToSelection,
    ensureControls,
    setTool,
    updateFly,
  });
}

window.LK_EDITOR_GIZMO_CONTROLS = Object.freeze({create});
})();
