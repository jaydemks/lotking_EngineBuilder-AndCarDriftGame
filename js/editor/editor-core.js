/* =========================================================
   LOT KING - EDITOR CORE
   Default state, editor camera, chrome helpers and canvas viewport rect override.
   ========================================================= */
(function(){
'use strict';

function createState(){
  return {
    active: false,
    tool: 'translate',
    space: 'world',
    snap: false,
    snapMove: 1, snapRot: 15, snapScale: .1,
    gridOn: true,
    camHelperOn: true,
    pipOn: true,
    pipW: 840,
    pipPos: null,
    assetsH: 220,
    quickAudioPos: null,
    quickMusicIndex: -1,
    selected: null,
    special: null,
    dirty: false,
    viewMode: 'grid',
    search: '',
    filter: 'all',
    leftMode: 'scene',
    assetFilters: {blueprint:true, sound:true, levels:true, glb:true, scene:true, texture:true, light:true, effect:true, other:true},
    selectedAsset: null,
    linkParent: null,
    trackId: 'parking-lot',
    trackName: 'Parking Lot',
    playPreview: false,
  };
}

function createCamera(THREE){
  const cam = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, .1, 2000);
  cam.position.set(18, 14, 70);
  return cam;
}

function createChrome(deps){
  const THREE = deps.THREE;
  const root = document.createElement('div');
  root.id = 'lkEditor';
  root.innerHTML = deps.template;
  document.body.appendChild(root);
  const $ = sel => root.querySelector(sel);

  const helperGroup = new THREE.Group();
  helperGroup.name = 'LK Editor Helpers';
  const grid = new THREE.GridHelper(240, 48, 0x4b5568, 0x273142);
  grid.material.transparent = true;
  grid.material.opacity = .48;
  const axes = new THREE.AxesHelper(8);
  const gizmoProxy = new THREE.Group();
  const zUpGizmoQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const camProxy = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, .1, 1000);
  const camRigLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({color:0x9db4ff, transparent:true, opacity:.65})
  );
  const fly = {rmb:false, moved:0, lastX:0, lastY:0, speed:14, keys:{}};

  return Object.freeze({
    root,
    $,
    helperGroup,
    grid,
    axes,
    gizmoProxy,
    zUpGizmoQuat,
    camProxy,
    camRigLine,
    fly,
  });
}

function installCanvasViewportRectOverride(canvas, ED, getViewportRect){
  const originalCanvasRect = canvas.getBoundingClientRect.bind(canvas);
  canvas.getBoundingClientRect = function(){
    if(ED && ED.active && !ED.playPreview){
      const r = getViewportRect();
      return {
        x: r.x, y: r.y, left: r.x, top: r.y,
        width: r.w, height: r.h,
        right: r.x + r.w, bottom: r.y + r.h,
      };
    }
    return originalCanvasRect();
  };
}

window.LK_EDITOR_CORE = Object.freeze({
  createState,
  createCamera,
  createChrome,
  installCanvasViewportRectOverride,
});
})();
