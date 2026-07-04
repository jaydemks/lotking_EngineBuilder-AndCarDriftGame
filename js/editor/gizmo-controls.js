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
  const gizmoProxy = deps.gizmoProxy;
  const zUpGizmoQuat = deps.zUpGizmoQuat;
  const fly = deps.fly;

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
    return !!(ED.selected && ED.space !== 'engine' && ED.tool === 'translate');
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

  function attachGizmoToSelection(){
    const gizmo = deps.getGizmo();
    if(!gizmo || !ED.selected) return;
    gizmo.setMode(ED.tool);
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
    let orbit = deps.getOrbit();
    if(!orbit && THREE.OrbitControls){
      orbit = new THREE.OrbitControls(camE, renderer.domElement);
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
      gizmo = new THREE.TransformControls(camE, renderer.domElement);
      gizmo.setMode(ED.tool);
      gizmo.setSpace(transformControlsSpace());
      applyGizmoSnap(gizmo);
      gizmo.addEventListener('mouseDown', () => {
        deps.setGizmoPointerActive(true);
        deps.setGizmoSuppressSceneClick(true);
        deps.beginTransformHistory();
        const activeOrbit = deps.getOrbit();
        if(activeOrbit) activeOrbit.enabled = false;
      });
      gizmo.addEventListener('mouseUp', () => {
        deps.commitTransformHistory('Transform');
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
