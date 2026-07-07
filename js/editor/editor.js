/* =========================================================
   LOT KING — ENGINE EDITOR
   Editor 3D in stile game-engine sopra la scena di gioco:
   camera libera, selezione con gizmo (move/rotate/scale + snap),
   outliner con anteprime, inspector, menu contestuali,
   aggiunta primitive/luci/effetti/GLB, blueprint del player.
   Parla col runtime SOLO tramite window.LOT_KING + LK_STORE.
   ========================================================= */
(function(){
'use strict';

const GAME = window.LOT_KING;
const STORE = window.LK_STORE;
if(!GAME || !STORE){ console.warn('LotKing editor: runtime non trovato'); return; }

const scene = GAME.core.scene;
const renderer = GAME.core.renderer;
const gameCam = GAME.core.camera;
const canvas = GAME.core.canvas;

const ED = window.LK_EDITOR_CORE.createState();

// ------------------------------------------------ editor camera + controls
const camE = window.LK_EDITOR_CORE.createCamera(THREE);

// ------------------------------------------------ recovered editor chrome + runtime wiring
const editorChrome = window.LK_EDITOR_CORE.createChrome({THREE, template: window.LK_EDITOR_TEMPLATE.create()});
const root = editorChrome.root;
const $ = editorChrome.$;
const helperGroup = editorChrome.helperGroup;
const grid = editorChrome.grid;
const axes = editorChrome.axes;
const gizmoProxy = editorChrome.gizmoProxy;
const colliderProxy = editorChrome.colliderProxy;
const zUpGizmoQuat = editorChrome.zUpGizmoQuat;
let gizmoUsingZUpProxy = false;
const camProxy = editorChrome.camProxy;
let orbit = null;
let gizmo = null;
let camHelper = null;
const camRigLine = editorChrome.camRigLine;
let gizmoPointerActive = false;
let gizmoSuppressSceneClick = false;
const fly = editorChrome.fly;

let statusUi = null;
let dialogUi = null;
let contextMenu = null;
let viewportPicking = null;
let assetLibrary = null;
let assetImports = null;
let levelManager = null;
let playerBlueprints = null;
let folderManager = null;
let keyboardShortcuts = null;
let thumbnails = null;
let playableExport = null;
let editorLayout = null;
let preferences = null;
let quickAudio = null;
let flyCamera = null;
let gizmoControls = null;
let visualHelpers = null;
let toolbar = null;
let sidePanels = null;
let assetCatalog = null;
let assetDnd = null;
let assetPanel = null;
let assetProperties = null;
let outliner = null;
let editorMenus = null;
let inspectorUi = null;
let materialEditor = null;
let musicLibraryPanel = null;
let objectInspector = null;
let inspectorController = null;
let editorRuntime = null;
let selectionManager = null;
let viewportEvents = null;
let playerCameraInspector = null;
let playerLightsInspector = null;
let playerAttachmentsInspector = null;
let playerSetupInspector = null;
let hudInspector = null;
let environmentInspector = null;
let projectIo = null;
let inputSettings = null;
let addActions = null;
let historyManager = null;
let sceneMenuActions = null;

function status(msg){ if(statusUi) statusUi.status(msg); else $('#lkStatusRight').textContent = msg || ''; }
function beginStatusWork(title, step, state){ return statusUi ? statusUi.beginWork(title, step, state) : null; }
function updateStatusWork(token, pct, step, state, title){ if(statusUi) statusUi.updateWork(token, pct, step, state, title); }
function finishStatusWork(token, msg, step, state){ if(statusUi) statusUi.finishWork(token, msg, step, state); }
function setLevelLoading(open, name, pct, step){ if(statusUi) statusUi.setLevelLoading(open, name, pct, step); }
function setAssetLoading(open, name, pct, step){ if(statusUi) statusUi.setAssetLoading(open, name, pct, step); }
function confirmEditorAction(opts){ return dialogUi ? dialogUi.confirm(opts) : Promise.resolve(window.confirm((opts && opts.message) || 'Confirm?')); }
function promptEditorAction(opts){ return dialogUi ? dialogUi.prompt(opts) : Promise.resolve(window.prompt((opts && opts.message) || 'Value:', (opts && opts.value) || '')); }
function openMenu(items, x, y){
  lockEditorTrackSelector();
  if(contextMenu) contextMenu.open(items, x, y);
}
function closeMenu(){ if(contextMenu) contextMenu.close(); }
function lockEditorTrackSelector(){
  const overlay = $('#overlay');
  const levelSelect = $('#levelSelect');
  if(overlay) overlay.classList.remove('choosing-level');
  if(levelSelect) levelSelect.setAttribute('aria-hidden', 'true');
}

function setGrid(on){
  ED.gridOn = !!on;
  grid.visible = ED.gridOn;
  syncToolbarState();
  status(ED.gridOn ? 'Grid on' : 'Grid off');
}
function applyGridSize(){
  const size = ED.gridInfinite ? 5000 : Math.max(20, Number(ED.gridSize) || 240);
  const scale = size / 240;
  grid.scale.set(scale, scale, scale);
  const input = $('#lkGridSize');
  if(input) input.value = Math.round(ED.gridSize || 240);
  const inf = $('#lkGridInfinite');
  if(inf) inf.classList.toggle('on', !!ED.gridInfinite);
  status(ED.gridInfinite ? 'Grid infinite-feel' : ('Grid size ' + Math.round(size)));
}
function restoreFloatingPanels(){ return editorLayout.restoreFloatingPanels(); }
function panelWidth(side){ return editorLayout.panelWidth(side); }
function editorViewportRect(){ return editorLayout.editorViewportRect(); }
function clampPanelPos(pos, w, h){ return editorLayout.clampPanelPos(pos, w, h); }
function clearHoverPickHelper(){ if(viewportPicking) viewportPicking.clearHover(); }
window.LK_EDITOR_CORE.installCanvasViewportRectOverride(canvas, ED, activeCanvasViewportRect);
canvas.addEventListener('pointerdown', e => {
  if(!ED.active || ED.playPreview || ED.levelsOpen || ED.projectsOpen) return;
  setActiveViewportAt(e.clientX, e.clientY);
}, true);
visualHelpers = window.LK_EDITOR_VISUAL_HELPERS && window.LK_EDITOR_VISUAL_HELPERS.create({
  THREE, GAME, ED, helperGroup,
  registry: () => GAME.world.registry,
  syncCollider: o => STORE.syncCollider(o),
  setViewportReplaceTarget: value => { viewportReplaceTarget = value; },
});
function clearReplaceDropHelper(){ return visualHelpers.clearReplaceDropHelper(); }
function setReplaceDropHelper(target, ok){ return visualHelpers.setReplaceDropHelper(target, ok); }
function refreshSelectionHelpers(){ return visualHelpers.refreshSelectionHelpers(); }
function ensureCameraRigHelper(){ return visualHelpers.ensureCameraRigHelper(); }
function updateSelectionAndDropHelpers(){ return visualHelpers.updateSelectionAndDropHelpers(); }
function updateCameraRigHelper(){ return visualHelpers.updateCameraRigHelper(gameCam); }
function getCameraRigHelper(){ return visualHelpers.getCameraRigHelper(); }
function getReplaceDropHelper(){ return visualHelpers.getReplaceDropHelper(); }
flyCamera = window.LK_EDITOR_FLY_CAMERA && window.LK_EDITOR_FLY_CAMERA.create({
  THREE, ED, fly, camE, canvas,
  getOrbit: () => orbit,
  shouldEnableOrbit: shouldEnableOrbitForActiveViewport,
  getActiveCamera: () => activeViewportCamera(),
  getActiveCameraRig: () => activeViewportCameraRig(),
  onActiveCameraRigChange,
  panActiveViewport: (dx, dy) => panActiveViewport(dx, dy),
});
function flyStart(e, opts){ return flyCamera.flyStart(e, opts); }
function flyMove(e){ return flyCamera.flyMove(e); }
function syncOrbitAfterFly(){ return flyCamera.syncOrbitAfterFly(); }
function flyEnd(e){ return flyCamera.flyEnd(e); }
function flyUpdate(dt){ return flyCamera.flyUpdate(dt); }
gizmoControls = window.LK_EDITOR_GIZMO_CONTROLS && window.LK_EDITOR_GIZMO_CONTROLS.create({
  THREE, GAME, ED, root, $, scene, camE, renderer, canvas, gizmoProxy, colliderProxy, zUpGizmoQuat, fly,
  getGizmo: () => gizmo,
  setGizmo: value => { gizmo = value; },
  getOrbit: () => orbit,
  shouldEnableOrbit: shouldEnableOrbitForActiveViewport,
  setOrbit: value => { orbit = value; },
  isGizmoUsingZUpProxy: () => gizmoUsingZUpProxy,
  setGizmoUsingZUpProxy: value => { gizmoUsingZUpProxy = !!value; },
  setGizmoPointerActive: value => { gizmoPointerActive = !!value; },
  setGizmoSuppressSceneClick: value => { gizmoSuppressSceneClick = !!value; },
  beginTransformHistory,
  commitTransformHistory,
  beginColliderHistory,
  commitColliderHistory,
  onGizmoChange,
  flyUpdate,
  status,
});
function spaceLabel(){ return gizmoControls.spaceLabel(); }
function transformControlsSpace(){ return gizmoControls.transformControlsSpace(); }
function syncToolbarState(){ return gizmoControls.syncToolbarState(); }
function updateEditorAxesConvention(){ return gizmoControls.updateEditorAxesConvention(); }
function usesZUpGizmoProxy(){ return gizmoControls.usesZUpGizmoProxy(); }
function syncZUpProxyFromSelected(){ return gizmoControls.syncZUpProxyFromSelected(); }
function applyZUpProxyToSelected(){ return gizmoControls.applyZUpProxyToSelected(); }
function attachGizmoToSelection(){ return gizmoControls.attachGizmoToSelection(); }
function ensureControls(){ return gizmoControls.ensureControls(); }
function setTool(tool){ return gizmoControls.setTool(tool); }
function updateEditorControls(dt){ return gizmoControls.updateFly(dt); }
function syncQuickAudio(){ if(quickAudio) quickAudio.sync(); }
toolbar = window.LK_EDITOR_TOOLBAR && window.LK_EDITOR_TOOLBAR.create({
  root, ED, $, THREE,
  getGizmo: () => gizmo,
  getPlayableExport: () => playableExport,
  getCamHelper: () => camHelper,
  getCamRigHelper: getCameraRigHelper,
  getCamRigLine: () => camRigLine,
  syncToolbarState, transformControlsSpace, updateEditorAxesConvention, setGrid,
  applyGridSize,
  openMenu, addMenuItems, spawnPointAhead, setTool, undo, redo, saveScene,
  newTrack, saveAsTrack, setLevelsOverlayOpen, setProjectsOverlayOpen, createBrowserProject, setProjectImportTarget, importProjectFile,
  confirmEditorAction, exportProject, stopPlayPreview, startPlayPreview,
  exitEditor, restoreFloatingPanels,
});
sidePanels = window.LK_EDITOR_SIDE_PANELS && window.LK_EDITOR_SIDE_PANELS.create({
  root, ED, $, status, refreshOutliner, refreshAssetsPanel,
  setLeftMode, setViewMode, newFolder, importAssetFiles,
});
// ------------------------------------------------ editor preferences (settings panel)
function editorLang(){ return preferences ? preferences.lang() : 'en'; }
function setPrefsOpen(open){ if(preferences) preferences.setOpen(open); }
function applyPrefs(){ if(preferences) preferences.apply(); }
preferences = window.LK_EDITOR_PREFERENCES && window.LK_EDITOR_PREFERENCES.create({
  root, ED, $, status, refreshOutliner,
});
quickAudio = window.LK_EDITOR_QUICK_AUDIO && window.LK_EDITOR_QUICK_AUDIO.create({
  GAME, ED, $,
});

statusUi = window.LK_EDITOR_STATUS_UI && window.LK_EDITOR_STATUS_UI.create({root});
dialogUi = window.LK_EDITOR_DIALOGS && window.LK_EDITOR_DIALOGS.create({root});
contextMenu = window.LK_EDITOR_CONTEXT_MENU && window.LK_EDITOR_CONTEXT_MENU.create({ctxEl: $('#lkCtx')});
lockEditorTrackSelector();
assetLibrary = window.LK_EDITOR_ASSET_LIBRARY && window.LK_EDITOR_ASSET_LIBRARY.create({store: STORE, status});
thumbnails = window.LK_EDITOR_THUMBNAILS && window.LK_EDITOR_THUMBNAILS.create({THREE, active: () => ED.active && !ED.playPreview});
editorLayout = window.LK_EDITOR_LAYOUT && window.LK_EDITOR_LAYOUT.create({
  root, ED, $, status,
  camE,
  cameraAspect: () => GAME.player && GAME.player.cameraAspectValue ? GAME.player.cameraAspectValue() : (gameCam.aspect || innerWidth / innerHeight),
});
const editorViewCams = Object.create(null);
function editorSceneCameras(){
  return GAME.world.registry.filter(o => o && o.userData && o.userData.editorType === 'camera' && o.userData.sceneCamera);
}
function sceneCameraHolderFromSpec(spec){
  if(!spec || spec.indexOf('cam:') !== 0) return null;
  const id = spec.slice(4);
  return editorSceneCameras().find(o => o.userData.editorId === id) || null;
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
function cinemaStudioById(id){
  return GAME.world.registry.find(o => o && o.userData && o.userData.editorType === 'cinemaStudio' && o.userData.editorId === id) || null;
}
function cinemaShotAt(studio, time){
  const props = studio && studio.userData && studio.userData.cinemaProps || {};
  const shots = Array.isArray(props.movieTrack) ? props.movieTrack.slice().sort((a,b) => (a.time || 0) - (b.time || 0)) : [];
  return shots.find(shot => time >= (shot.time || 0) && time < (shot.time || 0) + (shot.duration || 0)) ||
    shots.filter(shot => (shot.time || 0) <= time).pop() ||
    shots[0] || null;
}
function clampViewportSplit(value){
  return Math.max(.18, Math.min(.82, Number(value) || .5));
}
function editorQuadRects(viewRect){
  const splitX = clampViewportSplit(ED.viewportSplitX);
  const splitY = clampViewportSplit(ED.viewportSplitY);
  ED.viewportSplitX = splitX;
  ED.viewportSplitY = splitY;
  const w1 = Math.floor(viewRect.w * splitX);
  const h1 = Math.floor(viewRect.h * splitY);
  return [
    {slot:0, x:viewRect.x, y:viewRect.y, w:w1, h:h1},
    {slot:1, x:viewRect.x + w1, y:viewRect.y, w:viewRect.w - w1, h:h1},
    {slot:2, x:viewRect.x, y:viewRect.y + h1, w:w1, h:viewRect.h - h1},
    {slot:3, x:viewRect.x + w1, y:viewRect.y + h1, w:viewRect.w - w1, h:viewRect.h - h1},
  ];
}
function editorViewportTarget(){
  if(orbit && orbit.target) return orbit.target.clone();
  return GAME.player && GAME.player.car ? GAME.player.car.position.clone().setY(1) : new THREE.Vector3();
}
function editorViewState(slot){
  const states = ED.viewportViewStates || (ED.viewportViewStates = {});
  const key = 'slot' + Math.max(0, Math.min(3, slot || 0));
  if(!states[key]){
    const target = editorViewportTarget();
    states[key] = {target:{x:target.x, y:target.y, z:target.z}, span:Math.max(18, ED.gridSize ? ED.gridSize * .22 : 48)};
  }
  return states[key];
}
function editorViewTarget(slot){
  const state = editorViewState(slot);
  const t = state.target || {};
  return new THREE.Vector3(t.x || 0, t.y || 0, t.z || 0);
}
function setEditorViewTarget(slot, value){
  const state = editorViewState(slot);
  state.target = {x:value.x || 0, y:value.y || 0, z:value.z || 0};
}
function setEditorViewSpan(slot, value){
  const state = editorViewState(slot);
  state.span = Math.max(2, Math.min(2000, Number(value) || 48));
}
function editorPerspectiveCamera(slot, rect){
  if(slot === 0){
    camE.aspect = rect.w / Math.max(1, rect.h);
    camE.updateProjectionMatrix();
    return camE;
  }
  const key = slot + ':perspective';
  let cam = editorViewCams[key];
  if(!cam){
    cam = new THREE.PerspectiveCamera(60, rect.w / Math.max(1, rect.h), .1, 2000);
    cam.position.copy(camE.position);
    cam.quaternion.copy(camE.quaternion);
    cam.up.copy(camE.up);
    editorViewCams[key] = cam;
  }
  cam.aspect = rect.w / Math.max(1, rect.h);
  cam.updateProjectionMatrix();
  return cam;
}
function activeCanvasViewportRect(){
  const viewRect = editorViewportRect();
  if(ED.viewportMode !== 'quad') return viewRect;
  const slot = Math.max(0, Math.min(3, ED.activeViewportSlot || 0));
  return editorQuadRects(viewRect)[slot] || viewRect;
}
function editorOrthoCamera(slot, kind, rect){
  const key = kind || 'top';
  const camKey = slot + ':' + key;
  let cam = editorViewCams[camKey];
  if(!cam){
    cam = new THREE.OrthographicCamera(-10, 10, 10, -10, -1000, 1000);
    editorViewCams[camKey] = cam;
  }
  const target = editorViewTarget(slot);
  const aspect = rect.w / Math.max(1, rect.h);
  const span = Math.max(2, editorViewState(slot).span || (ED.gridSize ? ED.gridSize * .22 : 48));
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
function editorCameraForView(slot, rect){
  const spec = ED.viewportSlots[slot] || ['perspective', 'top', 'right', 'front'][slot] || 'top';
  if(slot === 0 || spec === 'perspective') return editorPerspectiveCamera(slot, rect);
  if(spec.indexOf('timeline:') === 0){
    const id = spec.slice(9);
    const studio = cinemaStudioById(id);
    const state = ED.cinemaPreview && ED.cinemaPreview.id === id ? ED.cinemaPreview : {time:0};
    const shot = cinemaShotAt(studio, state.time || 0);
    if(shot && shot.cameraId){
      const holder = sceneCameraHolderFromSpec('cam:' + shot.cameraId);
      if(holder && holder.userData.sceneCamera){
        const cam = normalizeSceneCameraLocal(holder);
        cam.aspect = rect.w / Math.max(1, rect.h);
        cam.updateProjectionMatrix();
        holder.updateMatrixWorld(true);
        return cam;
      }
    }
  }
  if(spec.indexOf('cam:') === 0){
    const holder = sceneCameraHolderFromSpec(spec);
    if(holder && holder.userData.sceneCamera){
      const cam = normalizeSceneCameraLocal(holder);
      cam.aspect = rect.w / Math.max(1, rect.h);
      cam.updateProjectionMatrix();
      holder.updateMatrixWorld(true);
      return cam;
    }
  }
  return editorOrthoCamera(slot, spec, rect);
}
function editorPickView(clientX, clientY){
  const viewRect = editorViewportRect();
  if(ED.viewportMode !== 'quad'){
    return {slot:0, rect:viewRect, camera:camE};
  }
  const rects = editorQuadRects(viewRect);
  for(let i = 0; i < rects.length; i++){
    const r = rects[i];
    if(clientX >= r.x && clientX <= r.x + r.w && clientY >= r.y && clientY <= r.y + r.h){
      return {slot:i, rect:r, camera:editorCameraForView(i, r)};
    }
  }
  return null;
}
function activeViewportSpec(){
  if(ED.viewportMode !== 'quad'){
    const rect = editorViewportRect();
    camE.aspect = rect.w / Math.max(1, rect.h);
    camE.updateProjectionMatrix();
    return {slot:0, rect, spec:'perspective', camera:camE};
  }
  const slot = Math.max(0, Math.min(3, ED.activeViewportSlot || 0));
  const rect = editorQuadRects(editorViewportRect())[slot];
  const spec = slot === 0 ? 'perspective' : (ED.viewportSlots[slot] || ['perspective', 'top', 'right', 'front'][slot] || 'top');
  return {slot, rect, spec, camera:editorCameraForView(slot, rect)};
}
function setActiveViewportAt(clientX, clientY){
  const view = editorPickView(clientX, clientY);
  if(!view) return null;
  setActiveViewportSlot(view.slot);
  return view;
}
function setActiveViewportSlot(slot){
  ED.activeViewportSlot = ED.viewportMode === 'quad' ? Math.max(0, Math.min(3, slot || 0)) : 0;
  const view = activeViewportSpec();
  if(orbit) orbit.enabled = shouldEnableOrbitForActiveViewport();
  if(gizmo && view && view.camera){
    gizmo.camera = view.camera;
    if(gizmo.updateMatrixWorld) gizmo.updateMatrixWorld(true);
  }
  return view;
}
function shouldEnableOrbitForActiveViewport(){
  return !!(ED.active && !ED.playPreview && (ED.viewportMode !== 'quad' || (ED.activeViewportSlot || 0) === 0));
}
function activeViewportCamera(){
  return activeViewportSpec().camera || camE;
}
function activeViewportCameraRig(){
  const view = activeViewportSpec();
  if(view.spec && view.spec.indexOf('timeline:') === 0){
    const id = view.spec.slice(9);
    const studio = cinemaStudioById(id);
    const state = ED.cinemaPreview && ED.cinemaPreview.id === id ? ED.cinemaPreview : {time:0};
    const shot = cinemaShotAt(studio, state.time || 0);
    return shot && shot.cameraId ? sceneCameraHolderFromSpec('cam:' + shot.cameraId) : null;
  }
  return sceneCameraHolderFromSpec(view.spec);
}
function isActiveViewportCameraDriven(){
  return !!activeViewportCameraRig();
}
function onActiveCameraRigChange(rig){
  if(!rig) return;
  markDirty();
  if(ED.selected === rig){
    if(usesZUpGizmoProxy()) syncZUpProxyFromSelected();
    refreshSelectionHelpers();
    updateSelectionAndDropHelpers();
    syncTransformFields();
    if(gizmo && gizmo.updateMatrixWorld) gizmo.updateMatrixWorld(true);
  }
}
function panActiveViewport(dx, dy){
  const view = activeViewportSpec();
  if(!view.camera || !view.camera.isOrthographicCamera) return false;
  const key = view.spec || 'top';
  if(key.indexOf('cam:') === 0) return false;
  const current = editorViewTarget(view.slot);
  const span = Math.max(2, editorViewState(view.slot).span || 48);
  const scale = span / Math.max(80, view.rect.h || 1);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(view.camera.quaternion).normalize();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(view.camera.quaternion).normalize();
  current.addScaledVector(right, -dx * scale);
  current.addScaledVector(up, dy * scale);
  setEditorViewTarget(view.slot, current);
  return true;
}
function zoomActiveViewport(deltaY, clientX, clientY){
  const picked = clientX == null ? activeViewportSpec() : editorPickView(clientX, clientY);
  if(!picked || !picked.camera || !picked.camera.isOrthographicCamera) return false;
  const slot = picked.slot || 0;
  const state = editorViewState(slot);
  setEditorViewSpan(slot, (state.span || 48) * (deltaY > 0 ? 1.12 : .88));
  return true;
}
function focusActiveViewportTarget(target){
  if(!target) return false;
  const box = new THREE.Box3().setFromObject(target);
  const c = box.isEmpty() ? target.position.clone() : box.getCenter(new THREE.Vector3());
  const r = box.isEmpty() ? 4 : Math.max(2.5, box.getSize(new THREE.Vector3()).length() * .8);
  const view = activeViewportSpec();
  if(view.camera && view.camera.isOrthographicCamera){
    setEditorViewTarget(view.slot, c);
    setEditorViewSpan(view.slot, Math.max(6, r * 2.4));
    return true;
  }
  if(view.camera && view.camera.isPerspectiveCamera){
    const dir = new THREE.Vector3().subVectors(view.camera.position, c).normalize();
    if(dir.lengthSq() < .01) dir.set(1, .6, 1).normalize();
    view.camera.position.copy(c).addScaledVector(dir, r * 1.6).add(new THREE.Vector3(0, r*.35, 0));
    view.camera.lookAt(c);
    if(view.camera === camE && orbit) orbit.target.copy(c);
    return true;
  }
  return true;
}
viewportPicking = window.LK_EDITOR_VIEWPORT_PICKING && window.LK_EDITOR_VIEWPORT_PICKING.create({
  THREE,
  pickView: editorPickView,
  viewportRect: editorViewportRect,
  camera: () => camE,
  registry: () => GAME.world.registry,
  helperGroup: () => helperGroup,
  selected: () => ED.selected,
  hoverSuppressed: () => !!(ED.playPreview || ED.levelsOpen || ED.projectsOpen || (gizmo && (gizmo.dragging || gizmo.axis)) || gizmoPointerActive),
});
if(!viewportPicking){
  viewportPicking = {
    pickAt:()=>null,
    pickMaterialAt:()=>null,
    materialSlotInfo:()=>null,
    setMaterialPickHelper:()=>{},
    clearMaterialPickHelper:()=>{},
    groundPointAt:()=>spawnPointAhead(),
    spawnPointAhead:()=>camE.position.clone().setY(0),
    updateHover:()=>{},
    updateHelpers:()=>{},
    clearHover:()=>{},
    isGroundLikeEntity:()=>false,
  };
}

function assetLibraryLoad(){ return assetLibrary ? assetLibrary.load() : []; }
function assetLibrarySave(list){ return assetLibrary ? assetLibrary.save(list) : false; }
function supportedAssetFiles(files){ return assetLibrary ? assetLibrary.supportedFiles(files) : Array.from(files || []).filter(file => /\.(glb|gltf)$/i.test(file.name || '')); }
function assetKeyFromFile(file){ return assetLibrary ? assetLibrary.keyFromFile(file) : (file && file.name || 'asset'); }
function assetDbKeyFromFile(file, key){ return assetLibrary ? assetLibrary.dbKeyFromFile(file, key) : key; }
function resolveImportedAssetUrl(asset){ return assetLibrary ? assetLibrary.resolveUrl(asset) : Promise.reject(new Error('asset library unavailable')); }
function upsertImportedAsset(file, data){ return assetLibrary ? assetLibrary.upsert(file, data) : null; }
function createGlbEntryFromAsset(asset, at){ return assetLibrary ? assetLibrary.createGlbEntry(asset, at) : {}; }
function createTextureEntryFromAsset(asset, at){ return assetLibrary ? assetLibrary.createTextureEntry(asset, at) : {}; }

assetImports = window.LK_EDITOR_ASSET_IMPORTS && window.LK_EDITOR_ASSET_IMPORTS.create({
  GAME, STORE, THREE, status, setAssetLoading, confirmEditorAction, refreshAssetsPanel, finishAdd,
  spawnPointAhead, performDeleteEntity, selected: () => ED.selected,
  assetLibraryLoad, assetLibrarySave, supportedAssetFiles, assetKeyFromFile, assetDbKeyFromFile,
  resolveImportedAssetUrl, upsertImportedAsset, createGlbEntryFromAsset, createTextureEntryFromAsset,
});
function readFileAsDataURL(f){ return assetImports ? assetImports.readFileAsDataURL(f) : Promise.reject(new Error('asset imports unavailable')); }
function hasExternalFileDrag(e){ return assetImports ? assetImports.hasExternalFileDrag(e) : false; }
function importAssetFiles(files, opts){ return assetImports ? assetImports.importAssetFiles(files, opts) : Promise.resolve([]); }
function importTextureFile(file, opts){ return assetImports ? assetImports.importTextureFile(file, opts) : Promise.resolve(null); }
function placeImportedAsset(asset, at){ return assetImports ? assetImports.placeImportedAsset(asset, at) : Promise.reject(new Error('asset imports unavailable')); }
function deleteImportedAsset(asset){ if(assetImports) assetImports.deleteImportedAsset(asset); }
function replaceSelectedWithAsset(asset, target){ if(assetImports) assetImports.replaceSelectedWithAsset(asset, target); }
function replaceObjectWithFile(target, file){ if(assetImports) assetImports.replaceObjectWithFile(target, file); }
function replaceTextureObjectWithAsset(asset, target){ if(assetImports) assetImports.replaceTextureObjectWithAsset(asset, target); }
function replaceTextureObjectWithFile(target, file){ if(assetImports) assetImports.replaceTextureObjectWithFile(target, file); }
function replacePlayerModelWithAsset(asset){ if(assetImports) assetImports.replacePlayerModelWithAsset(asset); }
function replacePlayerModelWithFile(file){ if(assetImports) assetImports.replacePlayerModelWithFile(file); }

levelManager = window.LK_EDITOR_LEVEL_MANAGER && window.LK_EDITOR_LEVEL_MANAGER.create({
  GAME, STORE, ED, $, status, promptEditorAction, confirmEditorAction, beginStatusWork, updateStatusWork,
  finishStatusWork, setLevelLoading, flushHudHistory, setTrackMeta, refreshAssetsPanel, projectFilename, el,
});
function levelsApi(){ return levelManager ? levelManager.levelsApi() : (STORE.levels || null); }
function reopenEditorAndReload(msg, levelName){ if(levelManager) levelManager.reopenEditorAndReload(msg, levelName); }
function saveAsTrack(){ return levelManager && levelManager.saveAsTrack(); }
function newTrack(){ return levelManager && levelManager.newTrack(); }
function loadLevel(id, name){ return levelManager && levelManager.loadLevel(id, name); }
function renameLevel(id, name){ return levelManager && levelManager.renameLevel(id, name); }
function duplicateLevel(id, name){ return levelManager && levelManager.duplicateLevel(id, name); }
function deleteLevel(id, name){ return levelManager && levelManager.deleteLevel(id, name); }
function exportLevel(id){ return levelManager && levelManager.exportLevel(id); }
function setLevelsOverlayOpen(open){ if(levelManager) levelManager.setLevelsOverlayOpen(open); }
function refreshLevelsOverlay(){ if(levelManager) levelManager.refreshLevelsOverlay(); }

playerBlueprints = window.LK_EDITOR_PLAYER_BLUEPRINTS && window.LK_EDITOR_PLAYER_BLUEPRINTS.create({
  GAME, STORE, ED, status, promptEditorAction, confirmEditorAction, markDirty, refreshOutliner, refreshAssetsPanel, buildInspector,
});
function currentPlayerBlueprint(){ return playerBlueprints ? playerBlueprints.currentPlayerBlueprint() : null; }
function copyPlayerBlueprintAsset(){ if(playerBlueprints) playerBlueprints.copyPlayerBlueprintAsset(); }
function applyPlayerBlueprintAsset(player, opts){ if(playerBlueprints) playerBlueprints.applyPlayerBlueprintAsset(player, opts); }
function setDefaultPlayerBlueprintAsset(asset){ if(playerBlueprints) playerBlueprints.setDefaultPlayerBlueprintAsset(asset); }
function deletePlayerBlueprintAsset(asset){ if(playerBlueprints) playerBlueprints.deletePlayerBlueprintAsset(asset); }

folderManager = window.LK_EDITOR_FOLDER_MANAGER && window.LK_EDITOR_FOLDER_MANAGER.create({
  promptEditorAction, openMenu, refreshScene: refreshOutliner, refreshAssets: refreshAssetsPanel,
});
function newFolder(kind){ if(folderManager) (folderManager.createFolder || folderManager.newFolder)(kind); }
function makeFolderRow(kind, folder){ return folderManager ? folderManager.makeRow(kind, folder) : document.createElement('div'); }
function folderList(kind){ return folderManager ? folderManager.list(kind) : []; }
function folderAssignments(kind){ return folderManager ? folderManager.assignments(kind) : {}; }
function folderById(kind, id){ return folderManager ? folderManager.byId(kind, id) : null; }
function writeFolderState(){ if(folderManager) folderManager.write(); }

keyboardShortcuts = window.LK_EDITOR_KEYBOARD_SHORTCUTS && window.LK_EDITOR_KEYBOARD_SHORTCUTS.create({
  ED, fly, GAME, closeMenu, setPrefsOpen, setLevelsOverlayOpen, setProjectsOverlayOpen, stopPlayPreview,
  saveAsTrack, saveScene, newTrack, duplicateEntity, undo, redo, applyLastTransform,
  setTool, focusSelected, setGrid, requestDeleteEntity,
});

playableExport = window.LK_EDITOR_PLAYABLE_EXPORT && window.LK_EDITOR_PLAYABLE_EXPORT.create({
  GAME, STORE, $, status, beginStatusWork, updateStatusWork, finishStatusWork,
  currentTrackMeta, slugifyTrackName, assetLibraryLoad, levelsApi,
});

editorLayout.init();

// ------------------------------------------------ undo / redo / repeat
historyManager = window.LK_EDITOR_HISTORY_MANAGER && window.LK_EDITOR_HISTORY_MANAGER.create({
  GAME,
  STORE,
  ED,
  scene,
  $,
  status,
  markDirty,
  selectObject,
  refreshSelectionHelpers,
  attachGizmoToSelection,
  syncTransformFields,
  refreshOutliner,
  refreshAssetsPanel,
  buildInspector,
  getGizmo: () => gizmo,
});
function pushHistory(cmd){ return historyManager.pushHistory(cmd); }
function undo(){ return historyManager.undo(); }
function redo(){ return historyManager.redo(); }
function hudPatchLabel(patch){ return historyManager.hudPatchLabel(patch); }
function queueHudHistory(before, after, label){ return historyManager.queueHudHistory(before, after, label); }
function flushHudHistory(){ return historyManager.flushHudHistory(); }
function restoreEntity(o){ return historyManager.restoreEntity(o); }
function removeEntity(o){ return historyManager.removeEntity(o); }
function applyTransform(o, t){ return historyManager.applyTransform(o, t); }
function setLinkParent(o){ return historyManager.setLinkParent(o); }
function linkToParent(child, parent){ return historyManager.linkToParent(child, parent); }
function unlinkObject(child){ return historyManager.unlinkObject(child); }
function beginTransformHistory(){ return historyManager.beginTransformHistory(); }
function commitTransformHistory(label){ return historyManager.commitTransformHistory(label); }
function withTransformHistory(label, fn){ return historyManager.withTransformHistory(label, fn); }
function beginColliderHistory(o){ return historyManager.beginColliderHistory(o); }
function commitColliderHistory(label){ return historyManager.commitColliderHistory(label); }
function applyLastTransform(){ return historyManager.applyLastTransform(); }
function hasLastTransformRepeat(){ return historyManager.hasLastTransformRepeat(); }
function isHudHistorySuppress(){ return historyManager.isHudHistorySuppress(); }

function markDirty(){
  ED.dirty = true;
  $('#lkDirty').classList.add('show');
}
projectIo = window.LK_EDITOR_PROJECT_IO && window.LK_EDITOR_PROJECT_IO.create({
  GAME,
  STORE,
  ED,
  $,
  beginStatusWork,
  updateStatusWork,
  finishStatusWork,
  flushHudHistory,
  levelsApi,
  refreshLevelsOverlay,
  refreshAssetsPanel,
  promptEditorAction,
  confirmEditorAction,
  reopenEditorAndReload,
  setLevelLoading,
  status,
  getEditorLang: editorLang,
  setEditorLang: value => {
    if(preferences && preferences.setLang) preferences.setLang(value);
  },
  assetLibraryLoad,
  applyInputConfig: cfg => {
    if(inputSettings) inputSettings.setConfig(cfg);
    if(GAME.input){
      if(GAME.input.setOverrideEnabled) GAME.input.setOverrideEnabled(false);   // editor shows the pure project config
      if(GAME.input.setConfig) GAME.input.setConfig(cfg);
    }
  },
});
const editorWM = window.LK_RUNTIME_WINDOW_MANAGER && window.LK_RUNTIME_WINDOW_MANAGER.create({storageKey: 'lotking.windows.editor.v1'});
if(editorWM){
  const prefsPanel = root.querySelector('.lk-prefs-panel');
  if(prefsPanel){
    const prefsAttach = editorWM.attach(prefsPanel, {id: 'lk-prefs', handle: '.lk-prefs-head', minWidth: 360, minHeight: 300});
    const logo = root.querySelector('#lkLogoBtn');
    // center/restore once the panel is actually visible (offsetWidth is 0 while hidden)
    if(logo && prefsAttach) logo.addEventListener('click', () => setTimeout(() => { if(root.querySelector('#lkPrefsOverlay').classList.contains('open')) prefsAttach.restore(); }, 0));
  }
}
// Viewport tab: letterbox / frame-background colour (per level, saved in the camera blueprint)
(function wireViewportPrefs(){
  const lb = root.querySelector('#lkPrefLetterbox');
  if(!lb) return;
  const camCfg = () => GAME.player && GAME.player.cameraCfg;
  const syncLb = () => { const c = camCfg(); if(c) lb.value = (typeof c.letterboxColor === 'string' && /^#[0-9a-f]{6}$/i.test(c.letterboxColor)) ? c.letterboxColor : '#141518'; };
  lb.addEventListener('input', () => { const c = camCfg(); if(c){ c.letterboxColor = lb.value; if(GAME.player.applyCameraCfg) GAME.player.applyCameraCfg(); markDirty(); } });
  const logo = root.querySelector('#lkLogoBtn');
  if(logo) logo.addEventListener('click', () => setTimeout(syncLb, 0));
  syncLb();
})();
inputSettings = window.LK_EDITOR_INPUT_SETTINGS && window.LK_EDITOR_INPUT_SETTINGS.create({
  body: $('#lkInputSettingsBody'), ED, GAME, status, markDirty, lang: editorLang, wm: editorWM,
});
function slugifyTrackName(name){ return projectIo.slugifyTrackName(name); }
function setTrackMeta(meta){ return projectIo.setTrackMeta(meta); }
function currentTrackMeta(){ return projectIo.currentTrackMeta(); }
function loadTrackMeta(){ return projectIo.loadTrackMeta(); }
function saveScene(opts){ return projectIo.saveScene(opts); }
function projectFilename(project){ return projectIo.projectFilename(project); }
function exportProject(){ return projectIo.exportProject(); }
function importProjectFile(file){ return projectIo.importProjectFile(file); }
function setProjectImportTarget(target){ return projectIo.setProjectImportTarget(target); }
function setProjectsOverlayOpen(open){ return projectIo.setProjectsOverlayOpen(open); }
function createBrowserProject(){ return projectIo.createBrowserProject(); }
// ------------------------------------------------ outliner
let viewportReplaceTarget = null;
assetDnd = window.LK_EDITOR_ASSET_DND && window.LK_EDITOR_ASSET_DND.create({
  GAME, ED, canvas, $,
  hasExternalFileDrag,
  getAssetByRef,
  clearReplaceDropHelper,
  setReplaceDropHelper,
  getViewportReplaceTarget: () => viewportReplaceTarget,
  hasReplaceDropHelper: () => !!getReplaceDropHelper(),
  pickAt,
  groundPointAt,
  supportedAssetFiles,
  importAssetFiles,
  replaceSelectedWithAsset,
  replaceObjectWithFile,
  replaceTextureObjectWithAsset,
  replaceTextureObjectWithFile,
  replacePlayerModelWithAsset,
  replacePlayerModelWithFile,
  placeAssetRef,
  status,
  openMenu,
});
function acceptEditorFileDrag(e){ return assetDnd.acceptEditorFileDrag(e); }
function acceptAssetBrowserDrag(e){ return assetDnd.acceptAssetBrowserDrag(e); }
function canReplaceTarget(o){ return assetDnd.canReplaceTarget(o); }
function dragAssetModel(e){ return assetDnd.dragAssetModel(e); }
function updateViewportReplaceHint(e){ return assetDnd.updateViewportReplaceHint(e); }
function bindReplaceDropTarget(el, target){ return assetDnd.bindReplaceDropTarget(el, target); }
function bindAssetDropZone(el){ return assetDnd.bindAssetDropZone(el); }
function setAssetDragRef(ref){ return assetDnd.setAssetDragRef(ref); }
function setLeftMode(mode){
  const m = mode === 'assets' ? 'assets' : 'scene';
  ED.leftMode = m;
  $('#lkSceneTab').classList.toggle('on', m === 'scene');
  refreshOutliner();
  refreshAssetsPanel();
}
function setViewMode(m, scope){
  const mode = m === 'grid' ? 'grid' : 'list';
  const target = scope === 'assets' ? 'assets' : 'scene';
  if(target === 'assets'){
    ED.assetsViewMode = mode;
    $('#lkAssetsPanel').className = mode;
    const ag = $('#lkAssetViewGrid');
    const al = $('#lkAssetViewList');
    if(ag) ag.classList.toggle('on', mode === 'grid');
    if(al) al.classList.toggle('on', mode === 'list');
    refreshAssetsPanel();
    return;
  }
  ED.sceneViewMode = mode;
  $('#lkViewGrid').classList.toggle('on', mode === 'grid');
  $('#lkViewList').classList.toggle('on', mode === 'list');
  $('#lkOutliner').className = mode;
  refreshOutliner();
}
root.querySelectorAll('.lk-pin').forEach(p => {
  p.addEventListener('click', () => {
    if(p.dataset.special === 'env') selectSpecial('env');
    else if(p.dataset.special === 'hud') selectSpecial('hud');
    else selectObject(GAME.player.car);
  });
});

function visibleEntities(){
  return outliner ? outliner.visibleEntities() : [];
}

function refreshOutliner(){
  if(outliner) outliner.refresh();
}
assetCatalog = window.LK_EDITOR_ASSET_CATALOG && window.LK_EDITOR_ASSET_CATALOG.create({
  GAME, STORE, ED, root, $,
  levelsApi,
  assetLibraryLoad,
  currentPlayerBlueprint,
  setAssetLoading,
  placeProjectAsset,
  placeImportedAsset,
  spawnPointAhead,
  status,
  duplicateEntity,
  setLeftMode,
  confirmEditorAction,
  performDeleteEntity,
  getAssetPanel: () => assetPanel,
});
function entityIcon(o){ return assetCatalog.entityIcon(o); }
function assetKeyOf(o){ return assetCatalog.assetKeyOf(o); }
function assetNameOf(o){ return assetCatalog.assetNameOf(o); }
function collectAssets(){ return assetCatalog.collectAssets(); }
function collectProjectAssets(){ return assetCatalog.collectProjectAssets(); }
function assetMatchesSearch(item, q){ return assetCatalog.assetMatchesSearch(item, q); }
function assetFilterKey(item){ return assetCatalog.assetFilterKey(item); }
function selectAssetItem(ref){ return assetCatalog.selectAssetItem(ref); }
function getAssetByRef(ref){ return assetCatalog.getAssetByRef(ref); }
function placeAssetRef(item, at){ return assetCatalog.placeAssetRef(item, at); }
function cloneForStorage(value){
  try { return value == null ? value : JSON.parse(JSON.stringify(value)); } catch(err){ return value; }
}
function placeProjectAsset(rawAsset, at){
  if(!rawAsset || !rawAsset.entry){
    status(editorLang() === 'it' ? 'Asset di progetto non disponibile' : 'Project asset unavailable');
    return;
  }
  const entry = cloneForStorage(rawAsset.entry);
  const point = at || spawnPointAhead();
  if(!entry || !point){
    status(editorLang() === 'it' ? 'Posizione non disponibile per il posizionamento' : 'Position unavailable for placement');
    return;
  }
  setAssetLoading(true, entry.name || entry.kind || 'project asset', 15, editorLang() === 'it' ? 'Caricamento template' : 'Loading template');
  return Promise.resolve()
    .then(() => STORE.createFromEntry(entry, GAME))
    .then(obj => {
      const nextEntry = cloneForStorage(entry);
      nextEntry.id = STORE.nextId();
      if(!nextEntry.t || typeof nextEntry.t !== 'object'){ nextEntry.t = {}; }
      obj.position.copy(point);
      obj.rotation.set(
        Array.isArray(nextEntry.t.r) && nextEntry.t.r.length >= 3 ? nextEntry.t.r[0] : 0,
        Array.isArray(nextEntry.t.r) && nextEntry.t.r.length >= 3 ? nextEntry.t.r[1] : 0,
        Array.isArray(nextEntry.t.r) && nextEntry.t.r.length >= 3 ? nextEntry.t.r[2] : 0
      );
      if(Array.isArray(nextEntry.t.s) && nextEntry.t.s.length >= 3){
        obj.scale.fromArray(nextEntry.t.s);
      }
      nextEntry.t = STORE.tOf(obj);
      if(nextEntry.props && nextEntry.kind === 'light' && obj.userData && obj.userData.light){
        const l = obj.userData.light;
        if(l) STORE.applyLightProps(l, nextEntry.props);
      } else if(nextEntry.props && nextEntry.kind === 'texture' && STORE.updateTextureObject){
        STORE.updateTextureObject(obj, nextEntry.props);
      } else if(nextEntry.props && nextEntry.kind !== 'light'){
        STORE.applyMatProps(obj, nextEntry.props);
      }
      STORE.registerAdded(GAME, obj, nextEntry);
      finishAdd(obj);
      setAssetLoading(true, entry.name || entry.kind || 'project asset', 100, editorLang() === 'it' ? 'Posizionato' : 'Placed');
      setTimeout(() => setAssetLoading(false), 300);
    })
    .catch(err => {
      setAssetLoading(false);
      status((editorLang() === 'it' ? 'Aggiunta asset progetto fallita: ' : 'Project asset add failed: ') + err.message);
    });
}

function assetContextMenuItems(item){
  return editorMenus ? editorMenus.assetContextMenuItems(item) : [];
}
function scenePanelMenuItems(){
  return editorMenus ? editorMenus.scenePanelMenuItems() : [];
}
function assetsPanelMenuItems(){
  return editorMenus ? editorMenus.assetsPanelMenuItems() : [];
}
function requestDeleteAssetInstances(asset){ return assetCatalog.requestDeleteAssetInstances(asset); }
function refreshAssetsPanel(){ return assetCatalog && assetCatalog.refreshAssetsPanel(); }
assetProperties = window.LK_EDITOR_ASSET_PROPERTIES && window.LK_EDITOR_ASSET_PROPERTIES.create({
  THREE,
  resolveImportedAssetUrl,
});
function openAssetProperties(item){ if(assetProperties) assetProperties.open(item); }

// ------------------------------------------------ thumbnails (lazy, cached)
const thumbCache = {has: thumbnails.has, get: thumbnails.get, delete: thumbnails.remove};
function queueThumb(o, el){ thumbnails.queue(o, el); }
function processThumbQueue(){ thumbnails.process(); }
editorMenus = window.LK_EDITOR_MENUS && window.LK_EDITOR_MENUS.create({
  GAME, STORE, ED, root, $,
  loadLevel,
  renameLevel,
  duplicateLevel,
  exportLevel,
  deleteLevel,
  openSoundDesigner,
  markDirty,
  refreshAssetsPanel,
  status,
  confirmEditorAction,
  placeAssetRef,
  spawnPointAhead,
  replaceSelectedWithAsset,
  openAssetProperties,
  deleteImportedAsset,
  selectObject,
  setLeftMode,
  focusSelected,
  requestDeleteAssetInstances,
  applyPlayerBlueprintAsset,
  setDefaultPlayerBlueprintAsset,
  deletePlayerBlueprintAsset,
  newFolder,
  addMenuItems,
  setViewMode,
  setGrid,
  deselect,
  saveScene,
});
assetPanel = window.LK_EDITOR_ASSET_PANEL && window.LK_EDITOR_ASSET_PANEL.create({
  GAME,
  STORE,
  ED,
  thumbCache,
  queueThumb,
  selectAssetItem,
  openMenu,
  assetContextMenuItems,
  getAssetByRef,
  assetFilterKey,
  assetMatchesSearch,
  el,
  folderList,
  makeFolderRow,
  folderAssignments,
  folderById,
  writeFolderState,
  refreshAssetsPanel,
  assetsPanelMenuItems,
  setStatusRight: text => { $('#lkStatusRight').textContent = text; },
  assetLibraryLoad,
  placeAssetRef,
  spawnPointAhead,
  deleteImportedAsset,
  levelsApi,
  loadLevel,
  renameLevel,
  duplicateLevel,
  deleteLevel,
  openSoundDesigner,
  markDirty,
  status,
  confirmEditorAction,
  currentPlayerBlueprint,
  applyPlayerBlueprintAsset,
  copyPlayerBlueprintAsset,
  setDefaultPlayerBlueprintAsset,
  deletePlayerBlueprintAsset,
  collectAssets,
  collectProjectAssets,
  entityIcon,
  selectObject,
  setLeftMode,
  setAssetDragRef,
});
outliner = window.LK_EDITOR_OUTLINER && window.LK_EDITOR_OUTLINER.create({
  GAME, ED, $,
  thumbCache,
  queueThumb,
  entityIcon,
  folderAssignments,
  folderList,
  makeFolderRow,
  folderById,
  writeFolderState,
  linkToParent,
  toggleVisible,
  requestDeleteEntity,
  bindReplaceDropTarget,
  selectObject,
  selectColliderPart,
  selectPlayerCollider,
  focusSelected,
  openMenu,
  objectMenuItems,
  scenePanelMenuItems,
  setStatusRight: text => { $('#lkStatusRight').textContent = text; },
});

// ------------------------------------------------ selection
selectionManager = window.LK_EDITOR_SELECTION_MANAGER && window.LK_EDITOR_SELECTION_MANAGER.create({
  THREE, GAME, STORE, ED, camE, thumbCache, colliderProxy,
  clearHoverPickHelper,
  getGizmo: () => gizmo,
  setGizmoUsingZUpProxy: value => { gizmoUsingZUpProxy = !!value; },
  attachGizmoToSelection,
  refreshSelectionHelpers,
  buildInspector,
  refreshOutliner,
  markDirty,
  status,
  removeEntity,
  restoreEntity,
  pushHistory,
  confirmEditorAction,
  getOrbit: () => orbit,
  focusViewportTarget: focusActiveViewportTarget,
  applyZUpProxyToSelected,
  syncTransformFields,
});
function selectObject(o){
  if(ED.liveMaterialSelection && ED.liveMaterialSelection.object !== o) clearLiveMaterialSelection();
  if(o && o.userData && o.userData.editorType === 'cinemaStudio'){
    ED.cinemaTimelineClosedId = null;
    ED.cinemaTimelineId = o.userData.editorId;
    ED.cinemaTimelineOpen = true;
  }
  return selectionManager.selectObject(o);
}
function selectCollider(o){
  if(ED.liveMaterialSelection && ED.liveMaterialSelection.object !== o) clearLiveMaterialSelection();
  return selectionManager.selectCollider(o);
}
function selectColliderPart(o, index){
  if(ED.liveMaterialSelection && ED.liveMaterialSelection.object !== o) clearLiveMaterialSelection();
  return selectionManager.selectColliderPart(o, index);
}
function selectPlayerCollider(){
  if(ED.liveMaterialSelection && ED.liveMaterialSelection.object !== GAME.player.car) clearLiveMaterialSelection();
  clearHoverPickHelper();
  ED.multiSelected = null;
  ED.special = null;
  ED.colliderEdit = false;
  ED.colliderPartIndex = null;
  ED.playerColliderEdit = true;
  ED.selected = GAME.player.car;
  setTool('translate');
  refreshSelectionHelpers();
  updateSelectionAndDropHelpers();
  buildInspector();
  refreshOutliner();
  status('player_car collider selected');
}
function selectMultiObjects(objects){
  if(ED.liveMaterialSelection) clearLiveMaterialSelection();
  return selectionManager.selectMultiObjects(objects);
}
function selectSimilarObjects(o){
  if(ED.liveMaterialSelection) clearLiveMaterialSelection();
  return selectionManager.selectSimilarObjects(o);
}
function selectSpecial(kind){
  if(ED.liveMaterialSelection) clearLiveMaterialSelection();
  return selectionManager.selectSpecial(kind);
}
function deselect(){
  if(ED.liveMaterialSelection) clearLiveMaterialSelection();
  return selectionManager.deselect();
}
function isPlayerCameraSelection(){ return selectionManager.isPlayerCameraSelection(); }
function isLightLikeObject(o){
  if(!o) return false;
  if(o.isLight) return true;
  if(o.userData){
    if(o.userData.light) return true;
    if(o.userData.editorType === 'playerLight') return true;
  }
  return false;
}
function toggleVisible(o){
  if(!isLightLikeObject(o)) return selectionManager.toggleVisible(o);
  requestEditorWarmup('Warm-up light...');
  requestAnimationFrame(() => selectionManager.toggleVisible(o));
}
function setColliderEnabled(o, enabled){ return selectionManager.setColliderEnabled(o, enabled); }
function performDeleteEntity(o){ return selectionManager.performDeleteEntity(o); }
function requestDeleteEntity(o){ return selectionManager.requestDeleteEntity(o); }
function duplicateEntity(o, offset){ return selectionManager.duplicateEntity(o, offset); }
function cleanClone(o){ return selectionManager.cleanClone(o); }
function focusSelected(){ return selectionManager.focusSelected(); }
function onGizmoChange(){ return selectionManager.onGizmoChange(); }
function setPhysicsEnabled(o, enabled){ return selectionManager.setPhysicsEnabled(o, enabled); }

// ------------------------------------------------ picking + context menu on canvas
function pickAt(clientX, clientY, opts){ return viewportPicking.pickAt(clientX, clientY, opts); }
function groundPointAt(clientX, clientY){ return viewportPicking.groundPointAt(clientX, clientY); }
function spawnPointAhead(){ return viewportPicking.spawnPointAhead(); }
function isGroundLikeEntity(o){ return viewportPicking.isGroundLikeEntity(o); }
function liveMaterialRoot(o){ return materialEditor && materialEditor.materialRoot ? materialEditor.materialRoot(o) : o; }
function isLiveMaterialSelectionActive(o){
  const target = o || ED.selected;
  return !!(target && ED.liveMaterialSelection && ED.liveMaterialSelection.object === target && ED.selected === target);
}
function clearLiveMaterialSelection(){
  if(viewportPicking && viewportPicking.clearMaterialPickHelper) viewportPicking.clearMaterialPickHelper();
  ED.liveMaterialSelection = null;
}
function syncLiveMaterialSelection(o){
  if(!isLiveMaterialSelectionActive(o)) return;
  const root = liveMaterialRoot(o);
  const key = o && o.userData && o.userData.materialEditorSlot;
  if(!root || !key || key === 'all'){
    viewportPicking.clearMaterialPickHelper();
    return;
  }
  viewportPicking.setMaterialPickHelper(viewportPicking.materialSlotInfo(root, key), 0xffd166);
}
function toggleLiveMaterialSelection(o){
  if(!o) return;
  if(isLiveMaterialSelectionActive(o)){
    clearLiveMaterialSelection();
    status(editorLang() === 'it' ? 'Live Mat Selection disattivata' : 'Live Mat Selection off');
    return;
  }
  ED.liveMaterialSelection = {object:o};
  clearHoverPickHelper();
  syncLiveMaterialSelection(o);
  status(editorLang() === 'it'
    ? 'Live Mat Selection: clicca una parte del modello per scegliere il materiale'
    : 'Live Mat Selection: click a model part to choose the material');
}
function updateLiveMaterialSelection(e){
  if(!isLiveMaterialSelectionActive()) return false;
  const o = ED.liveMaterialSelection.object;
  const hit = viewportPicking.pickMaterialAt(liveMaterialRoot(o), e.clientX, e.clientY);
  if(hit){
    const current = o && o.userData && o.userData.materialEditorSlot;
    viewportPicking.setMaterialPickHelper(hit, hit.key === current ? 0xffd166 : 0x52b7ff);
  } else {
    syncLiveMaterialSelection(o);
  }
  return true;
}
function commitLiveMaterialSelection(e){
  if(!isLiveMaterialSelectionActive()) return false;
  const o = ED.liveMaterialSelection.object;
  const hit = viewportPicking.pickMaterialAt(liveMaterialRoot(o), e.clientX, e.clientY);
  if(hit){
    o.userData.materialEditorSlot = hit.key;
    viewportPicking.setMaterialPickHelper(hit, 0xffd166);
    buildInspector();
    status('Material target: ' + hit.label);
  } else {
    status(editorLang() === 'it' ? 'Nessun materiale sotto il puntatore' : 'No material under pointer');
  }
  return true;
}
viewportEvents = window.LK_EDITOR_VIEWPORT_EVENTS && window.LK_EDITOR_VIEWPORT_EVENTS.create({
  ED, GAME, canvas,
  clearHoverPickHelper,
  updateHover: e => viewportPicking.updateHover(e),
  isLiveMaterialSelectionActive,
  updateLiveMaterialSelection,
  commitLiveMaterialSelection,
  setActiveViewportAt,
  flyStart,
  flyMove,
  flyEnd,
  isFlyActive: () => fly.rmb,
  flyMoved: () => fly.moved,
  isActiveViewportCameraDriven,
  zoomActiveViewport,
  adjustFlySpeed: deltaY => {
    fly.speed = Math.max(2, Math.min(80, fly.speed * (deltaY > 0 ? .85 : 1.18)));
    status((editorLang() === 'it' ? 'Velocita volo: ' : 'Fly speed: ') + fly.speed.toFixed(0));
  },
  shouldSuppressSceneClick: () => !!(gizmoSuppressSceneClick || gizmoPointerActive || (gizmo && (gizmo.dragging || gizmo.axis))),
  getGizmo: () => gizmo,
  pickAt,
  setTool,
  groundPointAt,
  isGroundLikeEntity,
  selectObject,
  deselect,
  openMenu,
  objectMenuItems,
  playerMenuItems,
  canvasMenuItems,
});
function updateViewportHover(e){ return viewportEvents.updateViewportHover(e); }

// ------------------------------------------------ scene menu definitions
sceneMenuActions = window.LK_EDITOR_SCENE_MENU_ACTIONS && window.LK_EDITOR_SCENE_MENU_ACTIONS.create({
  THREE, GAME, STORE, ED, scene, camE, $,
  status,
  spawnPointAhead,
  addPrimitive,
  addLight,
  addEffect,
  addText,
  addTexture,
  addCamera,
  addCinemaStudio,
  openGlbImportAt,
  setTool,
  selectObject,
  selectCollider,
  selectPlayerCollider,
  selectSimilarObjects,
  focusSelected,
  duplicateEntity,
  hasLastTransformRepeat,
  applyLastTransform,
  setLinkParent,
  linkToParent,
  unlinkObject,
  toggleVisible,
  beginReplaceObject,
  requestDeleteEntity,
  buildInspector,
  copyPlayerBlueprintAsset,
  deselect,
  setGrid,
  saveScene,
  promptEditorAction,
  markDirty,
  refreshOutliner,
  withTransformHistory,
  syncTransformFields,
});
function addMenuItems(at){ return sceneMenuActions.addMenuItems(at); }
function objectMenuItems(o, fromOutliner, gp){ return sceneMenuActions.objectMenuItems(o, fromOutliner, gp); }
function duplicateLine(o, count){ return sceneMenuActions.duplicateLine(o, count); }
function playerMenuItems(){ return sceneMenuActions.playerMenuItems(); }
function canvasMenuItems(gp){ return sceneMenuActions.canvasMenuItems(gp); }
function renameEntity(o){ return sceneMenuActions.renameEntity(o); }
function resetTransform(o){ return sceneMenuActions.resetTransform(o); }
function setSpawnHere(){ return sceneMenuActions.setSpawnHere(); }

// ------------------------------------------------ add actions
addActions = window.LK_EDITOR_ADD_ACTIONS && window.LK_EDITOR_ADD_ACTIONS.create({
  THREE,
  GAME,
  STORE,
  ED,
  $,
  pushHistory,
  removeEntity,
  restoreEntity,
  markDirty,
  refreshOutliner,
  selectObject,
  selectCollider,
  setTool,
  status,
  spawnPointAhead,
  importAssetFiles,
  replaceObjectWithFile,
  replacePlayerModelWithFile,
  readFileAsDataURL,
  buildInspector,
  refreshAssetsPanel,
});
function addPrimitive(prim, at){ return addActions.addPrimitive(prim, at); }
function addLight(kind, at){ return addActions.addLight(kind, at); }
function addEffect(kind, at){ return addActions.addEffect(kind, at); }
function addText(kind, at){ return addActions.addText(kind, at); }
function addTexture(kind, at, asset){ return addActions.addTexture(kind, at, asset); }
function addCamera(at){ return addActions.addCamera(at); }
function addCinemaStudio(at){ return addActions.addCinemaStudio(at); }
function finishAdd(obj){ return addActions.finishAdd(obj); }
function openGlbImportAt(point){ return addActions.openGlbImportAt(point); }
function beginReplaceObject(target){ return addActions.beginReplaceObject(target); }

// ------------------------------------------------ inspector
const insp = () => $('#lkInspector');

function el(html){
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}
inspectorUi = window.LK_EDITOR_INSPECTOR_UI && window.LK_EDITOR_INSPECTOR_UI.create({el});
function section(title, open){ return inspectorUi.section(title, open); }
function numRow(label, value, step, oninput){ return inspectorUi.numRow(label, value, step, oninput); }
function sliderRow(label, value, min, max, step, oninput, fmt){ return inspectorUi.sliderRow(label, value, min, max, step, oninput, fmt); }
function colorRow(label, hex, oninput){ return inspectorUi.colorRow(label, hex, oninput); }
function checkRow(label, checked, oninput){ return inspectorUi.checkRow(label, checked, oninput); }
function btnRow(defs){ return inspectorUi.btnRow(defs); }
function selectRow(label, value, options, oninput){ return inspectorUi.selectRow(label, value, options, oninput); }
function textureDrop(label, desc, onFile){ return inspectorUi.textureDrop(label, desc, onFile); }
musicLibraryPanel = window.LK_EDITOR_MUSIC_LIBRARY_PANEL && window.LK_EDITOR_MUSIC_LIBRARY_PANEL.create({
  ED,
  GAME,
  markDirty,
  status,
  section,
  selectRow,
  el,
});
materialEditor = window.LK_EDITOR_MATERIAL_EDITOR && window.LK_EDITOR_MATERIAL_EDITOR.create({
  THREE,
  GAME,
  STORE,
  thumbCache,
  markDirty,
  refreshOutliner,
  buildInspector,
  readFileAsDataURL,
  section,
  selectRow,
  colorRow,
  sliderRow,
  textureDrop,
  assetLibraryLoad,
  liveMaterialSelection: {
    isActive: isLiveMaterialSelectionActive,
    toggle: toggleLiveMaterialSelection,
    sync: syncLiveMaterialSelection,
  },
  requestWarmup: label => requestEditorWarmup(label),
  btnRow,
  el,
});
function getFirstMaterial(o){ return materialEditor.getFirstMaterial(o); }
function applyMaterialPatch(o, patch){ return materialEditor.applyMaterialPatch(o, patch); }
function musicLibrarySection(title, api){ return musicLibraryPanel.build(title, api); }
function buildMaterialEditor(box, o){ return materialEditor.build(box, o); }

  const tf = {inputs: null};   // live transform inputs for sync during gizmo drag
function syncTransformFields(){ if(inspectorController) inspectorController.syncTransformFields(); }
objectInspector = window.LK_EDITOR_OBJECT_INSPECTOR && window.LK_EDITOR_OBJECT_INSPECTOR.create({
  THREE,
  GAME,
  STORE,
  ED,
  scene,
  tf,
  el,
  section,
  selectRow,
  sliderRow,
  btnRow,
  checkRow,
  colorRow,
  entityIcon,
  markDirty,
  refreshOutliner,
  selectObject,
  focusSelected,
  beginTransformHistory,
  commitTransformHistory,
  beginColliderHistory,
  commitColliderHistory,
  resetTransform,
  syncTransformFields,
  onGizmoChange,
  setColliderEnabled,
  setPhysicsEnabled,
  buildMaterialEditor,
  duplicateEntity,
  requestDeleteEntity,
  replaceSelectedGlb: beginReplaceObject,
  requestWarmup: label => requestEditorWarmup(label),
  importTextureFile,
  assetLibraryLoad,
  resolveImportedAssetUrl,
});
playerCameraInspector = window.LK_EDITOR_PLAYER_CAMERA_INSPECTOR && window.LK_EDITOR_PLAYER_CAMERA_INSPECTOR.create({
  GAME,
  markDirty,
  section,
  selectRow,
  sliderRow,
  checkRow,
  colorRow,
  el,
});
playerLightsInspector = window.LK_EDITOR_PLAYER_LIGHTS_INSPECTOR && window.LK_EDITOR_PLAYER_LIGHTS_INSPECTOR.create({
  GAME,
  ED,
  markDirty,
  refreshOutliner,
  selectObject,
  setTool,
  section,
  btnRow,
  checkRow,
  colorRow,
  sliderRow,
  selectRow,
  el,
  requestWarmup: label => requestEditorWarmup(label),
});
playerAttachmentsInspector = window.LK_EDITOR_PLAYER_ATTACHMENTS_INSPECTOR && window.LK_EDITOR_PLAYER_ATTACHMENTS_INSPECTOR.create({
  GAME,
  ED,
  markDirty,
  refreshOutliner,
  selectObject,
  setTool,
  section,
  btnRow,
  checkRow,
  sliderRow,
  selectRow,
  colorRow,
  el,
});
playerSetupInspector = window.LK_EDITOR_PLAYER_SETUP_INSPECTOR && window.LK_EDITOR_PLAYER_SETUP_INSPECTOR.create({
  STORE,
  GAME,
  markDirty,
  status,
  promptEditorAction,
  buildInspector,
  openSoundDesigner,
  openPlayerModelPicker: () => $('#lkPlayerModelInput').click(),
  focusSelected,
  section,
  sliderRow,
  btnRow,
  el,
});
hudInspector = window.LK_EDITOR_HUD_INSPECTOR && window.LK_EDITOR_HUD_INSPECTOR.create({
  GAME,
  markDirty,
  musicLibrarySection,
  section,
  sliderRow,
  checkRow,
  btnRow,
  el,
});
environmentInspector = window.LK_EDITOR_ENVIRONMENT_INSPECTOR && window.LK_EDITOR_ENVIRONMENT_INSPECTOR.create({
  GAME,
  markDirty,
  buildInspector,
  selectObject,
  section,
  sliderRow,
  checkRow,
  btnRow,
  el,
});
inspectorController = window.LK_EDITOR_INSPECTOR_CONTROLLER && window.LK_EDITOR_INSPECTOR_CONTROLLER.create({
  THREE,
  GAME,
  STORE,
  ED,
  tf,
  insp,
  el,
  section,
  sliderRow,
  btnRow,
  status,
  markDirty,
  refreshOutliner,
  setColliderEnabled,
  setPhysicsEnabled,
  checkRow,
  objectInspector,
  hudInspector,
  environmentInspector,
  playerCameraInspector,
  playerLightsInspector,
  playerAttachmentsInspector,
  playerSetupInspector,
  buildMaterialEditor,
  copyPlayerBlueprintAsset,
  currentPlayerBlueprint,
  applyPlayerBlueprintAsset,
  setSpawnHere,
  onGizmoChange,
  beginTransformHistory,
  commitTransformHistory,
  updateSelectionAndDropHelpers,
});
function buildInspector(){ return inspectorController.buildInspector(); }
function openSoundDesigner(setId){ return inspectorController.openSoundDesigner(setId); }

editorRuntime = window.LK_EDITOR_RUNTIME && window.LK_EDITOR_RUNTIME.create({
  THREE,
  GAME,
  ED,
  scene,
  renderer,
  gameCam,
  camE,
  root,
  helperGroup,
  grid,
  axes,
  gizmoProxy,
  colliderProxy,
  camProxy,
  camRigLine,
  $,
  loadTrackMeta,
  ensureControls,
  ensureCameraRigHelper,
  getCameraRigHelper,
  getCamHelper: () => camHelper,
  setCamHelper: value => { camHelper = value; },
  getGizmo: () => gizmo,
  getOrbit: () => orbit,
  shouldEnableOrbit: shouldEnableOrbitForActiveViewport,
  setGizmoUsingZUpProxy: value => { gizmoUsingZUpProxy = value; },
  spaceLabel,
  updateEditorAxesConvention,
  setTool,
  syncQuickAudio,
  refreshOutliner,
  refreshAssetsPanel,
  buildInspector,
  status,
  clearHoverPickHelper,
  clearReplaceDropHelper,
  saveScene,
  restorePreviewTransforms: () => {
    const data = STORE.load && STORE.load();
    if(!data) return;
    const added = new Map();
    (data.added || []).forEach(entry => { if(entry && entry.id) added.set(entry.id, entry); });
    for(const o of GAME.world.registry){
      if(!o || !o.userData) continue;
      const id = o.userData.editorId;
      if(o.userData.builtin && data.transforms && data.transforms[id]) STORE.applyT(o, data.transforms[id]);
      else if(o.userData.addedEntry){
        const oldEntry = added.get(o.userData.addedEntry.id);
        if(oldEntry && oldEntry.t) STORE.applyT(o, oldEntry.t);
      }
      STORE.syncCollider(o);
      if(o.userData.physicsVel) o.userData.physicsVel = null;
      if(o.userData.physicsAng) o.userData.physicsAng = null;
    }
    if(data.env && STORE.applyEnvironment) STORE.applyEnvironment(GAME, data.env);
    refreshOutliner();
    buildInspector();
  },
  closeMenu,
  markDirty,
  updateEditorControls,
  editorViewportRect,
  setActiveViewportSlot,
  cameraForView: editorCameraForView,
  updateCameraRigHelper,
  updateViewportPickingHelpers: () => viewportPicking.updateHelpers(),
  updateSelectionAndDropHelpers,
  processThumbQueue,
  isPlayerCameraSelection,
  panelWidth,
  clampPanelPos,
});
function enterEditor(){ return editorRuntime.enterEditor(); }
function setPlayPreview(on){ return editorRuntime.setPlayPreview(on); }
function startPlayPreview(){ return editorRuntime.startPlayPreview(); }
function stopPlayPreview(){ return editorRuntime.stopPlayPreview(); }
function exitEditor(toPlay){ return editorRuntime.exitEditor(toPlay); }
function editorFrame(dt){ return editorRuntime.editorFrame(dt); }
function syncGamePreviewCamera(){ return editorRuntime.syncGamePreviewCamera(); }
function requestEditorWarmup(label){
  if(editorRuntime && editorRuntime.requestWarmup) editorRuntime.requestWarmup(label || 'Warm-up...');
}

addEventListener('lotking:radiohudchange', e => {
  if(!(ED.active && ED.special === 'hud')) return;
  markDirty();
  if(isHudHistorySuppress()) return;
  const d = e.detail || {};
  if(d.before && d.after) queueHudHistory(d.before, d.after, hudPatchLabel(d.patch));
});

GAME.editor = {enter: enterEditor, exit: exitEditor, state: ED, requestWarmup: requestEditorWarmup};
console.info('LotKing: engine editor ready');
})();
