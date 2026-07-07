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

  function usesZUpGizmoProxy(){
    return !!(ED.selected && !ED.colliderEdit && ED.space !== 'engine' && ED.tool === 'translate');
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
    gizmoProxy.updateMatrixWorld(true);
  }

  function applyZUpProxyToSelected(){
    const o = ED.selected;
    if(!o || !deps.isGizmoUsingZUpProxy()) return;
    if(o.parent && o.parent.isObject3D && o.parent !== scene){
      o.parent.updateMatrixWorld(true);
      o.position.copy(o.parent.worldToLocal(gizmoProxy.position.clone()));
    } else {
      o.position.copy(gizmoProxy.position);
    }
    o.updateMatrixWorld(true);
  }

  function applyGizmoSnap(gizmo){
    gizmo.setTranslationSnap(ED.snap ? ED.snapMove : null);
    gizmo.setRotationSnap(ED.snap ? THREE.MathUtils.degToRad(ED.snapRot) : null);
    gizmo.setScaleSnap(ED.snap ? ED.snapScale : null);
  }

  function applyGizmoFineSnap(gizmo, fine){
    if(!gizmo) return;
    if(!fine){
      applyGizmoSnap(gizmo);
      return;
    }
    gizmo.setTranslationSnap(0.01);
    gizmo.setRotationSnap(THREE.MathUtils.degToRad(0.1));
    gizmo.setScaleSnap(0.001);
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
      gizmo.setMode(ED.tool);
      gizmo.setSpace(transformControlsSpace());
      applyGizmoSnap(gizmo);
      gizmo.addEventListener('mouseDown', () => {
        deps.setGizmoPointerActive(true);
        deps.setGizmoSuppressSceneClick(true);
        applyGizmoFineSnap(gizmo, shiftFineMode);
        if(ED.colliderEdit) deps.beginColliderHistory(ED.selected);
        else deps.beginTransformHistory();
        const activeOrbit = deps.getOrbit();
        if(activeOrbit) activeOrbit.enabled = false;
      });
      gizmo.addEventListener('mouseUp', () => {
        if(ED.colliderEdit) deps.commitColliderHistory('Collider transform');
        else deps.commitTransformHistory('Transform');
        applyGizmoSnap(gizmo);
        deps.setGizmoPointerActive(false);
        setTimeout(() => { deps.setGizmoSuppressSceneClick(false); }, 0);
        const activeOrbit = deps.getOrbit();
        if(activeOrbit) activeOrbit.enabled = ED.active && !ED.playPreview;
      });
      gizmo.addEventListener('objectChange', deps.onGizmoChange);
      gizmo.addEventListener('dragging-changed', e => {
        const activeOrbit = deps.getOrbit();
        if(activeOrbit) activeOrbit.enabled = !e.value && ED.active && !ED.playPreview;
      });
      addEventListener('keydown', e => {
        if(e.key === 'Shift'){
          shiftFineMode = true;
          if(gizmo.dragging) applyGizmoFineSnap(gizmo, true);
        }
      });
      addEventListener('keyup', e => {
        if(e.key === 'Shift'){
          shiftFineMode = false;
          applyGizmoSnap(gizmo);
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
    attachGizmoToSelection,
    ensureControls,
    setTool,
    updateFly,
  });
}

window.LK_EDITOR_GIZMO_CONTROLS = Object.freeze({create});
})();
