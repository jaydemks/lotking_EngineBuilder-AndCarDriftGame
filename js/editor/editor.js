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

// ------------------------------------------------ editor state
const ED = {
  active: false,
  tool: 'translate',          // 'select' | 'translate' | 'rotate' | 'scale'
  space: 'world',             // default editor convention: Z-up display; engine remains Three.js Y-up internally
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
  selected: null,             // Object3D from registry
  special: null,              // 'env' | null  (pseudo-selections)
  dirty: false,
  viewMode: 'grid',           // outliner: 'grid' | 'list'
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

// ------------------------------------------------ editor camera + controls
const camE = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, .1, 2000);
camE.position.set(18, 14, 70);
let editorUiReady = false;
let floatingLayout = null;
addEventListener('resize', () => {
  camE.aspect = innerWidth/innerHeight;
  camE.updateProjectionMatrix();
  if(!editorUiReady) return;
  try {
    restoreFloatingPanels();
  } catch(err) {
    console.warn('LotKing: restoreFloatingPanels (resize) skipped', err);
  }
});
function restoreFloatingPanels(){ if(editorUiReady && floatingLayout) floatingLayout.restoreFloatingPanels(); }

// ------------------------------------------------ recovered editor chrome + runtime wiring
const root = document.createElement('div');
root.id = 'lkEditor';
root.innerHTML = window.LK_EDITOR_TEMPLATE.create();
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
let gizmoUsingZUpProxy = false;
const camProxy = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, .1, 1000);
let orbit = null;
let gizmo = null;
let selBox = null;
let lightHelper = null;
let camHelper = null;
let camRigHelper = null;
const camRigLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({color:0x9db4ff, transparent:true, opacity:.65})
);
let replaceDropHelper = null;
let gizmoPointerActive = false;
let gizmoSuppressSceneClick = false;
const fly = {rmb:false, moved:0, lastX:0, lastY:0, speed:14, keys:{}};
const originalCanvasRect = canvas.getBoundingClientRect.bind(canvas);
canvas.getBoundingClientRect = function(){
  if(ED && ED.active && !ED.playPreview){
    const r = editorViewportRect();
    return {
      x: r.x, y: r.y, left: r.x, top: r.y,
      width: r.w, height: r.h,
      right: r.x + r.w, bottom: r.y + r.h,
    };
  }
  return originalCanvasRect();
};

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
let preferences = null;
let quickAudio = null;
let toolbar = null;
let sidePanels = null;
let assetPanel = null;
let outliner = null;
let editorMenus = null;
let inspectorUi = null;
let materialEditor = null;
let musicLibraryPanel = null;
let objectInspector = null;
let playerCameraInspector = null;
let playerLightsInspector = null;
let playerAttachmentsInspector = null;
let playerSetupInspector = null;
let hudInspector = null;

function status(msg){ if(statusUi) statusUi.status(msg); else $('#lkStatusRight').textContent = msg || ''; }
function beginStatusWork(title, step, state){ return statusUi ? statusUi.beginWork(title, step, state) : null; }
function updateStatusWork(token, pct, step, state, title){ if(statusUi) statusUi.updateWork(token, pct, step, state, title); }
function finishStatusWork(token, msg, step, state){ if(statusUi) statusUi.finishWork(token, msg, step, state); }
function setLevelLoading(open, name, pct, step){ if(statusUi) statusUi.setLevelLoading(open, name, pct, step); }
function setAssetLoading(open, name, pct, step){ if(statusUi) statusUi.setAssetLoading(open, name, pct, step); }
function confirmEditorAction(opts){ return dialogUi ? dialogUi.confirm(opts) : Promise.resolve(window.confirm((opts && opts.message) || 'Confirm?')); }
function promptEditorAction(opts){ return dialogUi ? dialogUi.prompt(opts) : Promise.resolve(window.prompt((opts && opts.message) || 'Value:', (opts && opts.value) || '')); }
function openMenu(items, x, y){ if(contextMenu) contextMenu.open(items, x, y); }
function closeMenu(){ if(contextMenu) contextMenu.close(); }

function setGrid(on){
  ED.gridOn = !!on;
  grid.visible = ED.gridOn;
  syncToolbarState();
  status(ED.gridOn ? 'Grid on' : 'Grid off');
}
function panelWidth(side){ return floatingLayout ? floatingLayout.panelWidth(side) : (parseFloat(getComputedStyle(root).getPropertyValue(side === 'left' ? '--lk-left-w' : '--lk-right-w')) || 280); }
function editorViewportRect(){ return floatingLayout ? floatingLayout.editorViewportRect() : {x:panelWidth('left') + 10, y:46, w:Math.max(220, innerWidth - panelWidth('left') - panelWidth('right') - 20), h:Math.max(160, innerHeight - 46 - 40 - ED.assetsH)}; }
function clampPanelPos(pos, w, h){ return floatingLayout ? floatingLayout.clampPanelPos(pos, w, h) : pos; }
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
  if(!o || !gizmoUsingZUpProxy) return;
  if(o.parent && o.parent.isObject3D && o.parent !== scene){
    o.parent.updateMatrixWorld(true);
    o.position.copy(o.parent.worldToLocal(gizmoProxy.position.clone()));
  } else {
    o.position.copy(gizmoProxy.position);
  }
  o.updateMatrixWorld(true);
}
function attachGizmoToSelection(){
  if(!gizmo || !ED.selected) return;
  gizmo.setMode(ED.tool);
  if(usesZUpGizmoProxy()){
    syncZUpProxyFromSelected();
    gizmo.setSpace('local');
    gizmoUsingZUpProxy = true;
  } else {
    gizmo.setSpace(transformControlsSpace());
    gizmoUsingZUpProxy = false;
  }
  gizmo.setTranslationSnap(ED.snap ? ED.snapMove : null);
  gizmo.setRotationSnap(ED.snap ? THREE.MathUtils.degToRad(ED.snapRot) : null);
  gizmo.setScaleSnap(ED.snap ? ED.snapScale : null);
  gizmo.attach(gizmoUsingZUpProxy ? gizmoProxy : ED.selected);
}
function clearHoverPickHelper(){ if(viewportPicking) viewportPicking.clearHover(); }
function clearReplaceDropHelper(){
  if(replaceDropHelper && helperGroup) helperGroup.remove(replaceDropHelper);
  replaceDropHelper = null;
  viewportReplaceTarget = null;
}
function setReplaceDropHelper(target, ok){
  if(!target){ clearReplaceDropHelper(); return; }
  viewportReplaceTarget = ok ? target : null;
  if(!replaceDropHelper || replaceDropHelper.userData.target !== target){
    clearReplaceDropHelper();
    replaceDropHelper = new THREE.BoxHelper(target, ok ? 0x4be3a0 : 0xff5566);
    replaceDropHelper.userData.target = target;
    helperGroup.add(replaceDropHelper);
  }
  replaceDropHelper.material.color.setHex(ok ? 0x4be3a0 : 0xff5566);
}
function refreshSelectionHelpers(){
  if(selBox && helperGroup) helperGroup.remove(selBox);
  selBox = null;
  if(lightHelper && helperGroup) helperGroup.remove(lightHelper);
  lightHelper = null;
  if(ED.selected){
    selBox = new THREE.BoxHelper(ED.selected, 0xffd166);
    helperGroup.add(selBox);
    const l = ED.selected.isLight ? ED.selected : ED.selected.userData && ED.selected.userData.light;
    if(l){
      try {
        lightHelper = l.isDirectionalLight ? new THREE.DirectionalLightHelper(l, 2) :
          l.isSpotLight ? new THREE.SpotLightHelper(l) :
          l.isPointLight ? new THREE.PointLightHelper(l, 1.2) : null;
        if(lightHelper) helperGroup.add(lightHelper);
      } catch(err){}
    }
  }
}
function ensureCameraRigHelper(){
  if(camRigHelper) return;
  camRigHelper = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.7, .45, .32), new THREE.MeshBasicMaterial({color:0x9db4ff, wireframe:true}));
  const lens = new THREE.Mesh(new THREE.ConeGeometry(.18, .42, 12), new THREE.MeshBasicMaterial({color:0x9db4ff, wireframe:true}));
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -.34;
  camRigHelper.add(body, lens);
}
function ensureControls(){
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
  }
  if(!gizmo && THREE.TransformControls){
    gizmo = new THREE.TransformControls(camE, renderer.domElement);
    gizmo.setMode(ED.tool);
    gizmo.setSpace(transformControlsSpace());
    gizmo.setTranslationSnap(ED.snap ? ED.snapMove : null);
    gizmo.setRotationSnap(ED.snap ? THREE.MathUtils.degToRad(ED.snapRot) : null);
    gizmo.setScaleSnap(ED.snap ? ED.snapScale : null);
    gizmo.addEventListener('mouseDown', () => { gizmoPointerActive = true; gizmoSuppressSceneClick = true; beginTransformHistory(); if(orbit) orbit.enabled = false; });
    gizmo.addEventListener('mouseUp', () => { commitTransformHistory('Transform'); gizmoPointerActive = false; setTimeout(() => { gizmoSuppressSceneClick = false; }, 0); if(orbit) orbit.enabled = ED.active && !ED.playPreview; });
    gizmo.addEventListener('objectChange', onGizmoChange);
    gizmo.addEventListener('dragging-changed', e => { if(orbit) orbit.enabled = !e.value && ED.active && !ED.playPreview; });
  }
}
function setTool(tool){
  ED.tool = tool || 'select';
  syncToolbarState();
  if(gizmo){
    if(ED.tool === 'select' || !ED.selected){ gizmoUsingZUpProxy = false; gizmo.detach(); }
    else {
      gizmo.setMode(ED.tool);
      gizmo.setSpace(transformControlsSpace());
      attachGizmoToSelection();
    }
  }
  status('Tool: ' + ED.tool);
}
function flyStart(e){
  fly.rmb = true;
  fly.moved = 0;
  fly.lastX = e.clientX;
  fly.lastY = e.clientY;
  if(orbit) orbit.enabled = false;
  try { canvas.setPointerCapture(e.pointerId); } catch(err){}
}
function flyMove(e){
  if(!fly.rmb) return;
  const dx = e.clientX - fly.lastX;
  const dy = e.clientY - fly.lastY;
  fly.lastX = e.clientX; fly.lastY = e.clientY; fly.moved += Math.abs(dx) + Math.abs(dy);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camE.quaternion).normalize();
  const yaw = -dx * .004;
  const pitch = -dy * .004;
  fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  if(right.lengthSq() > .0001) fwd.applyAxisAngle(right, pitch);
  const maxPitch = .985;
  fwd.y = Math.max(-maxPitch, Math.min(maxPitch, fwd.y));
  fwd.normalize();
  camE.up.set(0, 1, 0);
  camE.lookAt(camE.position.clone().add(fwd));
}
function syncOrbitAfterFly(){
  if(!orbit) return;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camE.quaternion).normalize();
  const target = camE.position.clone().addScaledVector(fwd, 12);
  camE.up.set(0, 1, 0);
  camE.lookAt(target);
  orbit.object.up.set(0, 1, 0);
  orbit.target.copy(target);
  orbit.update();
}
function flyEnd(e){
  fly.rmb = false;
  if(e && e.pointerId != null){ try { canvas.releasePointerCapture(e.pointerId); } catch(err){} }
  syncOrbitAfterFly();
  if(orbit) orbit.enabled = ED.active && !ED.playPreview;
}
function flyUpdate(dt){
  if(!fly.rmb) return;
  const speed = (fly.keys.shift ? fly.speed * 2.4 : fly.speed) * Math.max(.001, dt || .016);
  const dir = new THREE.Vector3();
  if(fly.keys.w) dir.z -= 1;
  if(fly.keys.s) dir.z += 1;
  if(fly.keys.a) dir.x -= 1;
  if(fly.keys.d) dir.x += 1;
  if(fly.keys.e) dir.y += 1;
  if(fly.keys.q) dir.y -= 1;
  if(dir.lengthSq()){
    dir.normalize().multiplyScalar(speed).applyQuaternion(camE.quaternion);
    camE.position.add(dir);
  }
}
function syncQuickAudio(){ if(quickAudio) quickAudio.sync(); }
toolbar = window.LK_EDITOR_TOOLBAR && window.LK_EDITOR_TOOLBAR.create({
  root, ED, $, THREE,
  getGizmo: () => gizmo,
  getPlayableExport: () => playableExport,
  getCamHelper: () => camHelper,
  getCamRigHelper: () => camRigHelper,
  getCamRigLine: () => camRigLine,
  syncToolbarState, transformControlsSpace, updateEditorAxesConvention, setGrid,
  openMenu, addMenuItems, spawnPointAhead, setTool, undo, redo, saveScene,
  newTrack, saveAsTrack, setLevelsOverlayOpen, importProjectFile,
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
assetLibrary = window.LK_EDITOR_ASSET_LIBRARY && window.LK_EDITOR_ASSET_LIBRARY.create({store: STORE, status});
thumbnails = window.LK_EDITOR_THUMBNAILS && window.LK_EDITOR_THUMBNAILS.create({THREE, active: () => ED.active && !ED.playPreview});
floatingLayout = window.LK_EDITOR_FLOATING_LAYOUT && window.LK_EDITOR_FLOATING_LAYOUT.create({
  root, ED, $, status,
  cameraAspect: () => GAME.player && GAME.player.cameraAspectValue ? GAME.player.cameraAspectValue() : (gameCam.aspect || innerWidth / innerHeight),
});
viewportPicking = window.LK_EDITOR_VIEWPORT_PICKING && window.LK_EDITOR_VIEWPORT_PICKING.create({
  THREE,
  viewportRect: editorViewportRect,
  camera: () => camE,
  registry: () => GAME.world.registry,
  helperGroup: () => helperGroup,
  selected: () => ED.selected,
  hoverSuppressed: () => !!(ED.playPreview || ED.levelsOpen || (gizmo && (gizmo.dragging || gizmo.axis)) || gizmoPointerActive),
});
if(!viewportPicking){
  viewportPicking = {pickAt:()=>null, groundPointAt:()=>spawnPointAhead(), spawnPointAhead:()=>camE.position.clone().setY(0), updateHover:()=>{}, updateHelpers:()=>{}, clearHover:()=>{}, isGroundLikeEntity:()=>false};
}

function assetLibraryLoad(){ return assetLibrary ? assetLibrary.load() : []; }
function assetLibrarySave(list){ return assetLibrary ? assetLibrary.save(list) : false; }
function supportedAssetFiles(files){ return assetLibrary ? assetLibrary.supportedFiles(files) : Array.from(files || []).filter(file => /\.(glb|gltf)$/i.test(file.name || '')); }
function assetKeyFromFile(file){ return assetLibrary ? assetLibrary.keyFromFile(file) : (file && file.name || 'asset'); }
function assetDbKeyFromFile(file, key){ return assetLibrary ? assetLibrary.dbKeyFromFile(file, key) : key; }
function resolveImportedAssetUrl(asset){ return assetLibrary ? assetLibrary.resolveUrl(asset) : Promise.reject(new Error('asset library unavailable')); }
function upsertImportedAsset(file, data){ return assetLibrary ? assetLibrary.upsert(file, data) : null; }
function createGlbEntryFromAsset(asset, at){ return assetLibrary ? assetLibrary.createGlbEntry(asset, at) : {}; }

assetImports = window.LK_EDITOR_ASSET_IMPORTS && window.LK_EDITOR_ASSET_IMPORTS.create({
  GAME, STORE, status, setAssetLoading, confirmEditorAction, refreshAssetsPanel, finishAdd,
  spawnPointAhead, performDeleteEntity, selected: () => ED.selected,
  assetLibraryLoad, assetLibrarySave, supportedAssetFiles, assetKeyFromFile, assetDbKeyFromFile,
  resolveImportedAssetUrl, upsertImportedAsset, createGlbEntryFromAsset,
});
function readFileAsDataURL(f){ return assetImports ? assetImports.readFileAsDataURL(f) : Promise.reject(new Error('asset imports unavailable')); }
function hasExternalFileDrag(e){ return assetImports ? assetImports.hasExternalFileDrag(e) : false; }
function importAssetFiles(files, opts){ return assetImports ? assetImports.importAssetFiles(files, opts) : Promise.resolve([]); }
function placeImportedAsset(asset, at){ return assetImports ? assetImports.placeImportedAsset(asset, at) : Promise.reject(new Error('asset imports unavailable')); }
function deleteImportedAsset(asset){ if(assetImports) assetImports.deleteImportedAsset(asset); }
function replaceSelectedWithAsset(asset, target){ if(assetImports) assetImports.replaceSelectedWithAsset(asset, target); }
function replaceObjectWithFile(target, file){ if(assetImports) assetImports.replaceObjectWithFile(target, file); }

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
function newFolder(kind){ if(folderManager) folderManager.newFolder(kind); }
function makeFolderRow(kind, folder){ return folderManager ? folderManager.makeRow(kind, folder) : document.createElement('div'); }
function folderList(kind){ return folderManager ? folderManager.list(kind) : []; }
function folderAssignments(kind){ return folderManager ? folderManager.assignments(kind) : {}; }
function folderById(kind, id){ return folderManager ? folderManager.byId(kind, id) : null; }
function writeFolderState(){ if(folderManager) folderManager.write(); }

keyboardShortcuts = window.LK_EDITOR_KEYBOARD_SHORTCUTS && window.LK_EDITOR_KEYBOARD_SHORTCUTS.create({
  ED, fly, GAME, closeMenu, setPrefsOpen, setLevelsOverlayOpen, stopPlayPreview,
  saveAsTrack, saveScene, newTrack, duplicateEntity, undo, redo, applyLastTransform,
  setTool, focusSelected, setGrid, requestDeleteEntity,
});

playableExport = window.LK_EDITOR_PLAYABLE_EXPORT && window.LK_EDITOR_PLAYABLE_EXPORT.create({
  GAME, STORE, $, status, beginStatusWork, updateStatusWork, finishStatusWork,
  currentTrackMeta, slugifyTrackName, assetLibraryLoad, levelsApi,
});

if(floatingLayout){
  floatingLayout.wirePanelResize();
  floatingLayout.wireAssetsResize();
  floatingLayout.wirePipResize();
  floatingLayout.wireFloatingPanels();
}
editorUiReady = true;
requestAnimationFrame(restoreFloatingPanels);

// ------------------------------------------------ undo / redo / repeat
const undoStack = [];
const redoStack = [];
let transformBefore = null;
let lastTransformRepeat = null;

function sameT(a, b){
  return JSON.stringify(a) === JSON.stringify(b);
}
function transformMask(before, after){
  const eq = (aa, bb) => aa.length === bb.length && aa.every((v, i) => Math.abs(v - bb[i]) < 1e-5);
  return {
    p: before && after && !eq(before.p, after.p),
    r: before && after && !eq(before.r, after.r),
    s: before && after && !eq(before.s, after.s),
  };
}
function historyChanged(){
  $('#lkUndo').classList.toggle('disabled', !undoStack.length);
  $('#lkRedo').classList.toggle('disabled', !redoStack.length);
}
function pushHistory(cmd){
  if(!cmd) return;
  undoStack.push(cmd);
  if(undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
  historyChanged();
}
function undo(){
  flushHudHistory();
  const cmd = undoStack.pop();
  if(!cmd){ status('Niente da annullare'); return; }
  cmd.undo();
  redoStack.push(cmd);
  historyChanged();
  markDirty();
  status('Undo: ' + cmd.label);
}
function redo(){
  flushHudHistory();
  const cmd = redoStack.pop();
  if(!cmd){ status('Niente da rifare'); return; }
  cmd.redo();
  undoStack.push(cmd);
  historyChanged();
  markDirty();
  status('Redo: ' + cmd.label);
}

let hudHistoryPending = null;
let hudHistoryTimer = null;
let hudHistorySuppress = false;

function cloneHudConfig(v){
  return JSON.parse(JSON.stringify(v || {}));
}
function sameHudConfig(a, b){
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}
function hudPatchLabel(patch){
  if(!patch) return 'HUD radio';
  if(patch.buttons) return 'HUD radio pulsanti';
  if('editTarget' in patch) return 'HUD radio modalità edit';
  if('buttonLayer' in patch || 'imageLayer' in patch || 'screenLayer' in patch) return 'HUD radio layer';
  if('frameX' in patch || 'frameY' in patch || 'width' in patch || 'pngScaleX' in patch || 'pngScaleY' in patch) return 'HUD radio frame';
  if('screenLeft' in patch || 'screenTop' in patch || 'screenWidth' in patch || 'screenHeight' in patch) return 'HUD radio interfaccia';
  return 'HUD radio';
}
function applyHudSnapshot(snapshot){
  const setHud = GAME.ui && GAME.ui.setRadioHud;
  if(!setHud || !snapshot) return;
  hudHistorySuppress = true;
  setHud(cloneHudConfig(snapshot));
  hudHistorySuppress = false;
  if(GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(true);
  if(ED.active && ED.special === 'hud') buildInspector();
}
function queueHudHistory(before, after, label){
  if(!before || !after || sameHudConfig(before, after)) return;
  if(!hudHistoryPending){
    hudHistoryPending = {before: cloneHudConfig(before), after: cloneHudConfig(after), label: label || 'HUD radio'};
  } else {
    hudHistoryPending.after = cloneHudConfig(after);
    hudHistoryPending.label = label || hudHistoryPending.label;
  }
  clearTimeout(hudHistoryTimer);
  hudHistoryTimer = setTimeout(flushHudHistory, 260);
}
function flushHudHistory(){
  if(!hudHistoryPending) return;
  clearTimeout(hudHistoryTimer);
  const pending = hudHistoryPending;
  hudHistoryPending = null;
  if(sameHudConfig(pending.before, pending.after)) return;
  pushHistory({
    label: pending.label,
    undo: () => applyHudSnapshot(pending.before),
    redo: () => applyHudSnapshot(pending.after),
  });
  historyChanged();
}
function restoreEntity(o){
  if(!o) return;
  if(!GAME.world.registry.includes(o)){
    const col = o.userData.collider;
    const isBuiltin = !!o.userData.builtin && !o.userData.addedEntry;
    if(col && col.ref){
      const arr = col.kind === 'circle' ? GAME.world.colliders.circle : GAME.world.colliders.box;
      if(!arr.includes(col.ref)) arr.push(col.ref);
    }
    GAME.world.register(o, o.userData.editorName || 'Entity', o.userData.editorType || 'mesh', {
      id: o.userData.editorId,
      builtin: isBuiltin,
      collider: col || null,
    });
  }
  if(!o.parent) scene.add(o);
  STORE.syncCollider(o);
}
function removeEntity(o){
  if(!o || o.userData.editorType === 'player') return;
  GAME.world.unregister(o);
  if(o.parent) o.parent.remove(o);
  if(ED.selected === o) selectObject(null);
}
function applyTransform(o, t){
  if(!o || !t) return;
  restoreEntity(o);
  STORE.applyT(o, t);
  if(o.userData.editorType === 'player'){
    GAME.player.physics.pos.copy(o.position);
    GAME.player.physics.heading = o.rotation.y;
    if(GAME.player.spawn){
      GAME.player.spawn.x = o.position.x;
      GAME.player.spawn.z = o.position.z;
      GAME.player.spawn.heading = o.rotation.y;
    }
    if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
  }
  if(o.userData.editorType === 'playerDataWidget' && GAME.player.syncDataWidget) GAME.player.syncDataWidget(o);
  STORE.syncCollider(o);
  refreshSelectionHelpers();
  if(ED.selected === o && gizmo && !gizmo.dragging) attachGizmoToSelection();
  syncTransformFields();
  refreshOutliner();
}
function setLinkParent(o){
  ED.linkParent = o || null;
  status(o ? 'Parent pronto: ' + (o.userData.editorName || o.userData.editorId) : 'Parent link svuotato');
}
function linkToParent(child, parent){
  if(!child || !parent || child === parent) return;
  let n = parent;
  while(n){
    if(n === child){ status('Link non valido: creerebbe un ciclo'); return; }
    n = n.parent;
  }
  parent.attach(child);
  child.userData.linkParentId = parent.userData.editorId;
  STORE.syncCollider(child);
  markDirty();
  buildInspector();
  status('Link: ' + (child.userData.editorName || 'object') + ' → ' + (parent.userData.editorName || 'parent'));
}
function unlinkObject(child){
  if(!child || !child.parent || child.parent === scene) return;
  scene.attach(child);
  delete child.userData.linkParentId;
  STORE.syncCollider(child);
  markDirty();
  buildInspector();
  status('Link rimosso');
}
function beginTransformHistory(){
  transformBefore = ED.selected ? {obj: ED.selected, t: STORE.tOf(ED.selected)} : null;
}
function commitTransformHistory(label){
  if(!transformBefore || !transformBefore.obj) return;
  const obj = transformBefore.obj;
  const before = transformBefore.t;
  const after = STORE.tOf(obj);
  transformBefore = null;
  if(sameT(before, after)) return;
  const mask = transformMask(before, after);
  lastTransformRepeat = {label: label || 'Transform', t: after, mask};
  pushHistory({
    label: label || 'Transform',
    undo: () => applyTransform(obj, before),
    redo: () => applyTransform(obj, after),
  });
}
function withTransformHistory(label, fn){
  const obj = ED.selected;
  if(!obj) return;
  const before = STORE.tOf(obj);
  fn(obj);
  const after = STORE.tOf(obj);
  if(sameT(before, after)) return;
  const mask = transformMask(before, after);
  lastTransformRepeat = {label, t: after, mask};
  pushHistory({
    label,
    undo: () => applyTransform(obj, before),
    redo: () => applyTransform(obj, after),
  });
}
function applyLastTransform(){
  const obj = ED.selected;
  if(!obj || !lastTransformRepeat){ status('No transform to repeat'); return; }
  if(obj.userData.editorType === 'player'){ status('Il player non usa Ctrl+R rapido'); return; }
  const before = STORE.tOf(obj);
  const next = STORE.tOf(obj);
  if(lastTransformRepeat.mask.p) next.p = lastTransformRepeat.t.p.slice();
  if(lastTransformRepeat.mask.r) next.r = lastTransformRepeat.t.r.slice();
  if(lastTransformRepeat.mask.s) next.s = lastTransformRepeat.t.s.slice();
  applyTransform(obj, next);
  if(sameT(before, next)){ status('Trasformazione gia applicata'); return; }
  pushHistory({
    label: 'Repeat ' + lastTransformRepeat.label,
    undo: () => applyTransform(obj, before),
    redo: () => applyTransform(obj, next),
  });
  markDirty();
  status('Repeated transform on ' + (obj.userData.editorName || 'object'));
}
historyChanged();

function markDirty(){
  ED.dirty = true;
  $('#lkDirty').classList.add('show');
}
function slugifyTrackName(name){
  return (name || 'track').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
}
function setTrackMeta(meta){
  meta = meta || {};
  ED.trackName = meta.trackName || meta.levelName || ED.trackName || 'Parking Lot';
  ED.trackId = meta.trackId || meta.levelId || slugifyTrackName(ED.trackName);
  const input = $('#lkTrackName');
  if(input) input.value = ED.trackName;
  if(GAME.levels && GAME.levels.setEditorTrack) GAME.levels.setEditorTrack({id:ED.trackId, name:ED.trackName});
}
function currentTrackMeta(){
  return {trackId: ED.trackId || slugifyTrackName(ED.trackName), trackName: ED.trackName || 'Parking Lot'};
}
function loadTrackMeta(){
  if(STORE.loadProject){
    const project = STORE.loadProject();
    setTrackMeta(project.meta);
  } else {
    setTrackMeta({trackName:'Parking Lot', trackId:'parking-lot'});
  }
}
function saveScene(){
  const progressToken = beginStatusWork('Salvataggio livello', 'Verifica stato corrente', 'loading');
  updateStatusWork(progressToken, 10, 'Preparazione dati', 'loading');
  flushHudHistory();
  const input = $('#lkTrackName');
  if(input && input.value.trim()){
    ED.trackName = input.value.trim();
  }
  updateStatusWork(progressToken, 45, 'Scrittura catalogo', 'loading');
  const ok = STORE.save(STORE.collect(GAME), currentTrackMeta());
  if(!ok){
    ED.dirty = true;
    $('#lkDirty').classList.add('show');
    finishStatusWork(progressToken, 'Salvataggio fallito', 'Local storage non disponibile', 'error');
    status('⚠ Save failed: local level library was not updated');
    return false;
  }
  updateStatusWork(progressToken, 85, 'Sincronizzazione UI', 'loading');
  const LV = levelsApi();
  const activeId = LV && LV.activeId ? LV.activeId() : ED.trackId;
  setTrackMeta({trackId: activeId || ED.trackId, trackName: ED.trackName});
  ED.dirty = false;
  $('#lkDirty').classList.remove('show');
  if(LV && LV.syncCatalog) LV.syncCatalog();
  if(ED.levelsOpen) refreshLevelsOverlay();
  refreshAssetsPanel();
  finishStatusWork(progressToken, 'Livello salvato', 'Operazione completata', 'success');
  status('Track saved locally ✓');
  return true;
}
function projectFilename(project){
  const stamp = (project.savedAt || new Date().toISOString()).replace(/[:.]/g, '-');
  const meta = project.meta || currentTrackMeta();
  return 'lot-king-' + slugifyTrackName(meta.trackName || meta.levelName || 'track') + '-' + stamp + '.lkep.json';
}
function exportProject(){
  const progressToken = beginStatusWork('Export LKEP', 'Serializzazione livello corrente', 'loading');
  flushHudHistory();
  updateStatusWork(progressToken, 10, 'Snapshot dati', 'loading');
  const sceneData = STORE.collect(GAME);
  updateStatusWork(progressToken, 35, 'Generazione progetto', 'loading');
  const project = STORE.exportProject ? STORE.exportProject(sceneData, currentTrackMeta()) : {format:'LKEP', meta:currentTrackMeta(), scene:sceneData};
  updateStatusWork(progressToken, 80, 'Download avviato', 'loading');
  const blob = new Blob([JSON.stringify(project, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = projectFilename(project);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  finishStatusWork(progressToken, 'LKEP esportato', project.meta && (project.meta.trackName || project.meta.levelName) ? 'Percorso: ' + project.meta.trackName : 'Operazione completata', 'success');
  status('LKEP exported');
}
function importProjectFile(file){
  $('#lkProjectInput').value = '';
  if(!file) return;
  const progressToken = beginStatusWork('Importazione LKEP', 'Lettura file in corso', 'loading');
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const LV = levelsApi();
      if(LV){
        updateStatusWork(progressToken, 42, 'Inserimento in libreria livelli', 'loading');
        // il progetto importato diventa un livello della libreria e viene aperto
        const id = LV.importProjectAsLevel(reader.result, file.name.replace(/\.lkep(\.json)?$|\.json$/i, ''));
        if(!id) throw new Error('salvataggio locale fallito (quota?)');
        updateStatusWork(progressToken, 68, 'Apertura livello', 'loading');
        const openImported = () => {
          LV.setActive(id);
          reopenEditorAndReload('Importato');
        };
        if(ED.dirty){
          confirmEditorAction({
            title:'Open imported level?',
            message:'Il livello corrente ha modifiche non salvate che andranno perse. Aprire il livello importato?',
            okText:'Open level',
            danger:false,
          }).then(ok => {
            if(ok){
              finishStatusWork(progressToken, 'Importazione completata', 'Caricamento livello importato', 'success');
              openImported();
            }
            else {
              refreshLevelsOverlay();
              refreshAssetsPanel();
              finishStatusWork(progressToken, 'Importazione completata', 'Il livello è ora in libreria', 'success');
              status('Livello importato nella libreria ✓');
            }
          });
          return;
        }
        updateStatusWork(progressToken, 86, 'Ricaricamento editor', 'loading');
        openImported();
        return;
      }
      updateStatusWork(progressToken, 75, 'Applicazione progetto locale', 'loading');
      const project = STORE.importProject(reader.result);
      setTrackMeta(project.meta);
      ED.dirty = false;
      $('#lkDirty').classList.remove('show');
      finishStatusWork(progressToken, 'Importazione completata', 'Ricaricamento in corso', 'success');
      status('Imported ' + (project.meta && project.meta.trackName ? project.meta.trackName : 'LKEP') + ' · reloading...');
      setTimeout(() => location.reload(), 450);
    } catch(err){
      finishStatusWork(progressToken, 'Importazione fallita', (err && err.message) ? err.message : 'Errore', 'error');
      status('Import failed: ' + err.message);
    }
  };
  reader.onerror = () => {
    finishStatusWork(progressToken, 'Importazione fallita', 'File non leggibile', 'error');
    status('Import failed: file not readable');
  };
  reader.readAsText(file);
}
// ------------------------------------------------ outliner
let assetDragRef = null;
let viewportReplaceTarget = null;
function acceptEditorFileDrag(e){
  if(!hasExternalFileDrag(e)) return false;
  e.preventDefault();
  e.stopPropagation();
  if(e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  return true;
}
function acceptAssetBrowserDrag(e){
  if(!e.dataTransfer || !e.dataTransfer.types || !Array.from(e.dataTransfer.types).includes('application/x-lotking-asset')) return false;
  e.preventDefault();
  e.stopPropagation();
  e.dataTransfer.dropEffect = 'copy';
  return true;
}
function canReplaceTarget(o){
  return !!(o && o.userData && o.userData.editorType !== 'player' &&
    !['playerLight','playerEffect','playerDataWidget'].includes(o.userData.editorType));
}
function dragAssetModel(e){
  const ref = e.dataTransfer && (e.dataTransfer.getData('application/x-lotking-asset') || assetDragRef);
  const asset = ref ? getAssetByRef(ref) : null;
  return asset && asset.kind === 'imported-glb' ? asset : null;
}
function updateViewportReplaceHint(e){
  const hasModelAsset = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('application/x-lotking-asset');
  const hasFile = hasExternalFileDrag(e);
  if(!hasModelAsset && !hasFile){ clearReplaceDropHelper(); return null; }
  const hit = pickAt(e.clientX, e.clientY);
  if(!hit || !hit.entity){ clearReplaceDropHelper(); return null; }
  let modelOk = hasFile;
  if(hasModelAsset){
    const asset = dragAssetModel(e);
    modelOk = !!(asset && asset.kind === 'imported-glb');
  }
  const ok = modelOk && canReplaceTarget(hit.entity);
  setReplaceDropHelper(hit.entity, ok);
  return ok ? hit.entity : null;
}
function bindReplaceDropTarget(el, target){
  if(!el || !target) return;
  const clear = () => {
    el.classList.remove('replace-ok');
    el.classList.remove('replace-bad');
  };
  const evaluate = e => {
    const types = Array.from((e.dataTransfer && e.dataTransfer.types) || []);
    const hasAsset = types.includes('application/x-lotking-asset');
    const hasFile = hasExternalFileDrag(e);
    if(!hasAsset && !hasFile) return null;
    const ok = canReplaceTarget(target) && (hasFile || !!dragAssetModel(e));
    return {ok, hasAsset, hasFile};
  };
  el.addEventListener('dragover', e => {
    const info = evaluate(e);
    if(!info) return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.toggle('replace-ok', info.ok);
    el.classList.toggle('replace-bad', !info.ok);
    e.dataTransfer.dropEffect = info.ok ? 'copy' : 'none';
  });
  el.addEventListener('dragleave', clear);
  el.addEventListener('drop', e => {
    const info = evaluate(e);
    if(!info) return;
    e.preventDefault();
    e.stopPropagation();
    clear();
    if(!info.ok){
      status('Questo oggetto non puo essere sostituito direttamente');
      return;
    }
    if(info.hasAsset){
      const asset = dragAssetModel(e);
      if(asset) replaceSelectedWithAsset(asset.raw, target);
      return;
    }
    const files = supportedAssetFiles(e.dataTransfer.files);
    if(files.length !== 1){
      status('Drop one GLB/GLTF to replace this object');
      return;
    }
    replaceObjectWithFile(target, files[0]);
  });
}
function bindAssetDropZone(el){
  if(!el) return;
  el.addEventListener('dragenter', e => { if(acceptEditorFileDrag(e)) el.classList.add('drag'); });
  el.addEventListener('dragover', e => acceptEditorFileDrag(e));
  el.addEventListener('dragleave', e => {
    if(!el.contains(e.relatedTarget)) el.classList.remove('drag');
  });
  el.addEventListener('drop', e => {
    if(!acceptEditorFileDrag(e)) return;
    el.classList.remove('drag');
    importAssetFiles(e.dataTransfer.files);
  });
}
bindAssetDropZone($('#lkAssetsPanel'));
bindAssetDropZone($('#lkAssetsToolbar'));
canvas.addEventListener('dragover', e => {
  if(!ED.active || ED.playPreview) return;
  const target = updateViewportReplaceHint(e);
  if(target){
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    return;
  }
  if(acceptAssetBrowserDrag(e)) return;
  acceptEditorFileDrag(e);
});
canvas.addEventListener('dragleave', e => { if(e.target === canvas) clearReplaceDropHelper(); });
canvas.addEventListener('drop', e => {
  if(!ED.active || ED.playPreview) return;
  const replaceTargetNow = viewportReplaceTarget;
  const blockedReplaceNow = !!(replaceDropHelper && !viewportReplaceTarget);
  if(acceptAssetBrowserDrag(e)){
    const asset = getAssetByRef(e.dataTransfer.getData('application/x-lotking-asset') || assetDragRef);
    if(!asset){ status('Asset non disponibile'); return; }
    if(blockedReplaceNow){
      clearReplaceDropHelper();
      status('Questo oggetto non puo essere sostituito direttamente');
      return;
    }
    if(replaceTargetNow && asset.kind === 'imported-glb'){
      clearReplaceDropHelper();
      replaceSelectedWithAsset(asset.raw, replaceTargetNow);
      return;
    }
    clearReplaceDropHelper();
    placeAssetRef(asset, groundPointAt(e.clientX, e.clientY));
    return;
  }
  if(!acceptEditorFileDrag(e)) return;
  const files = supportedAssetFiles(e.dataTransfer.files);
  if(files.length !== 1){
    clearReplaceDropHelper();
    status('Viewport drop accepts one model at a time');
    return;
  }
  if(blockedReplaceNow){
    clearReplaceDropHelper();
    status('Questo oggetto non puo essere sostituito direttamente');
    return;
  }
  if(replaceTargetNow){
    const f = files[0];
    clearReplaceDropHelper();
    replaceObjectWithFile(replaceTargetNow, f);
    return;
  }
  clearReplaceDropHelper();
  const at = groundPointAt(e.clientX, e.clientY);
  importAssetFiles(files, {placePoint: at});
});
function setLeftMode(mode){
  ED.leftMode = 'scene';
  $('#lkSceneTab').classList.add('on');
  $('#lkAssetsPanel').className = ED.viewMode;
  refreshOutliner();
  refreshAssetsPanel();
}
function setViewMode(m){
  ED.viewMode = m;
  $('#lkViewGrid').classList.toggle('on', m === 'grid');
  $('#lkViewList').classList.toggle('on', m === 'list');
  $('#lkOutliner').className = m;
  $('#lkAssetsPanel').className = m;
  refreshAssetsPanel();
}
root.querySelectorAll('.lk-pin').forEach(p => {
  p.addEventListener('click', () => {
    if(p.dataset.special === 'env') selectSpecial('env');
    else if(p.dataset.special === 'hud') selectSpecial('hud');
    else selectObject(GAME.player.car);
  });
});

const TYPE_ICON = {mesh:'▣', light:'💡', effect:'✨', player:'🚗', playerLight:'🔆', playerEffect:'☁', playerDataWidget:'◫'};
function entityIcon(o){
  const l = o.isLight ? o : o.userData.light;
  if(l){
    if(l.isSpotLight) return '🔦';
    if(l.isDirectionalLight) return '☀️';
    if(l.isHemisphereLight) return '🌗';
    if(l.isAmbientLight) return '💠';
    return '💡';
  }
  return TYPE_ICON[o.userData.editorType] || '▣';
}
function assetKeyOf(o){
  if(o.userData.assetKey) return o.userData.assetKey;
  if(o.userData.addedEntry) return 'added:' + (o.userData.addedEntry.kind || 'object') + ':' + (o.userData.addedEntry.prim || o.userData.addedEntry.light || o.userData.addedEntry.effect || o.userData.editorName || 'asset');
  const name = o.userData.editorName || o.userData.editorId || 'object';
  return (o.userData.editorType || 'object') + ':' + name.replace(/\s+\d+$/,'');
}
function assetNameOf(o){
  if(o.userData.assetName) return o.userData.assetName;
  if(o.userData.addedEntry) return o.userData.addedEntry.name || o.userData.editorName || o.userData.addedEntry.kind;
  return (o.userData.editorName || 'Object').replace(/\s+\d+$/,'');
}
function collectAssets(){
  const map = new Map();
  for(const o of GAME.world.registry){
    if(o.userData.editorType === 'player') continue;
    const key = assetKeyOf(o);
    if(!map.has(key)){
      map.set(key, {
        key,
        name: assetNameOf(o),
        type: o.userData.editorType || 'mesh',
        source: o.userData.assetSource || (o.userData.builtin ? 'Built-in scene' : 'Created in editor'),
        instances: [],
        sample: o,
      });
    }
    map.get(key).instances.push(o);
  }
  return Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
}

function visibleEntities(){
  return outliner ? outliner.visibleEntities() : [];
}

function refreshOutliner(){
  if(outliner) outliner.refresh();
}
function assetMatchesSearch(item, q){
  if(!q) return true;
  const hay = [item.name, item.sub, item.source, item.kind, item.type].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}
function assetFilterKey(item){
  if(item.filterType) return item.filterType;
  if(item.kind === 'player-blueprint') return 'blueprint';
  if(item.kind === 'sound-set') return 'sound';
  if(item.kind === 'level') return 'levels';
  if(item.kind === 'imported-glb') return 'glb';
  if(item.type === 'light') return 'light';
  if(item.type === 'effect') return 'effect';
  if(item.kind === 'texture') return 'texture';
  if(item.kind === 'scene') return 'scene';
  return 'other';
}
function selectAssetItem(ref){
  ED.selectedAsset = ref;
  root.querySelectorAll('#lkAssetsPanel .lk-asset-item').forEach(item => {
    item.classList.toggle('sel', item.dataset.assetRef === ref);
  });
}
function getAssetByRef(ref){
  if(!ref) return null;
  const LV = levelsApi();
  if(ref.indexOf('level:') === 0 && LV){
    const id = ref.slice(6);
    const l = LV.list().find(x => x.id === id);
    return l ? {kind:'level', ref, id:l.id, name:l.name, raw:l} : null;
  }
  if(ref.indexOf('sound:') === 0 && STORE.soundSets){
    const id = ref.slice(6);
    const s = STORE.soundSets.list().find(x => x.id === id);
    return s ? {kind:'sound-set', ref, id:s.id, name:s.name, raw:s} : null;
  }
  if(ref.indexOf('imported:') === 0){
    const id = ref.slice(9);
    const asset = assetLibraryLoad().find(a => a.id === id);
    return asset ? {kind:'imported-glb', ref, id:asset.id, name:asset.name, raw:asset} : null;
  }
  if(ref.indexOf('scene:') === 0){
    const key = ref.slice(6);
    const a = collectAssets().find(x => x.key === key);
    return a ? {kind:'scene', ref, key:a.key, name:a.name, type:a.type, raw:a} : null;
  }
  if(ref.indexOf('blueprint:') === 0){
    const id = ref.slice(10);
    if(id === 'base'){
      const player = STORE.playerBlueprints && STORE.playerBlueprints.default() || currentPlayerBlueprint();
      return {kind:'player-blueprint', ref, id:'base', name:'Player Blueprint Base', base:true, raw:{id:'base', name:'Player Blueprint Base', player}};
    }
    const asset = STORE.playerBlueprints && STORE.playerBlueprints.list().find(x => x.id === id);
    return asset ? {kind:'player-blueprint', ref, id:asset.id, name:asset.name, raw:asset} : null;
  }
  return null;
}
function placeAssetRef(item, at){
  if(!item) return;
  if(item.kind === 'imported-glb'){
    setAssetLoading(true, item.name, 20, 'Loading asset instance');
    placeImportedAsset(item.raw, at || spawnPointAhead()).then(() => {
      setAssetLoading(true, item.name, 100, 'Placed in scene');
      setTimeout(() => setAssetLoading(false), 300);
    }).catch(err => {
      setAssetLoading(false);
      status('Place failed: ' + err.message);
    });
    return;
  }
  if(item.kind === 'scene'){
    const a = item.raw;
    if(!a || !a.sample){ status('Asset di scena non disponibile'); return; }
    duplicateEntity(a.sample, (at || spawnPointAhead()).sub(a.sample.position));
    setLeftMode('scene');
    return;
  }
  if(item.kind === 'level'){ status('Drag a model asset into the viewport, not a level'); return; }
  if(item.kind === 'player-blueprint'){ status('Only one player blueprint can be active in scene for now'); return; }
  status('Questo tipo di asset non può essere piazzato nel viewport');
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
function requestDeleteAssetInstances(asset){
  if(!asset || !asset.instances || !asset.instances.length) return;
  const removable = asset.instances.filter(o =>
    !['player','playerLight','playerEffect','playerDataWidget'].includes(o.userData.editorType));
  if(!removable.length){ status('Questo asset non ha istanze eliminabili'); return; }
  confirmEditorAction({
    title: 'Delete asset instances?',
    message: 'Delete all ' + removable.length + ' instance(s) of "' + asset.name + '" from the current level?',
    okText: 'Delete instances',
  }).then(ok => {
    if(!ok) return;
    removable.forEach(o => performDeleteEntity(o));
    refreshAssetsPanel();
    status('Deleted ' + removable.length + ' instance(s)');
  });
}
function refreshAssetsPanel(){
  const box = $('#lkAssetsPanel');
  assetPanel.refresh(box, ED.search || '');
}

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
  entityIcon,
  selectObject,
  setLeftMode,
  setAssetDragRef: ref => { assetDragRef = ref; },
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
  toggleVisible,
  requestDeleteEntity,
  bindReplaceDropTarget,
  selectObject,
  focusSelected,
  openMenu,
  objectMenuItems,
  scenePanelMenuItems,
  setStatusRight: text => { $('#lkStatusRight').textContent = text; },
});

// ------------------------------------------------ selection
function selectObject(o){
  if(ED.selected === o && ED.special === null) return;
  clearHoverPickHelper();
  ED.special = null;
  ED.selected = o;
  if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
  if(gizmo){
    if(o && ED.tool !== 'select'){
      gizmo.setMode(ED.tool);
      attachGizmoToSelection();
    }
    else { gizmoUsingZUpProxy = false; gizmo.detach(); }
  }
  refreshSelectionHelpers();
  buildInspector();
  refreshOutliner();
}
function selectSpecial(kind){
  clearHoverPickHelper();
  ED.selected = null;
  ED.special = kind;
  if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(kind === 'hud');
  if(gizmo){ gizmoUsingZUpProxy = false; gizmo.detach(); }
  refreshSelectionHelpers();
  buildInspector();
  refreshOutliner();
}
function deselect(){ selectObject(null); }

function isPlayerCameraSelection(){
  const car = GAME.player && GAME.player.car;
  let o = ED.selected;
  while(o){
    if(o === car) return true;
    o = o.parent;
  }
  return false;
}

function toggleVisible(o){
  o.visible = !o.visible;
  markDirty(); refreshOutliner();
  if(ED.selected === o) buildInspector();
}
function setColliderEnabled(o, enabled){
  if(!o || o.userData.editorType !== 'mesh') return;
  const old = o.userData.collider || null;
  if(enabled && !old){
    const col = {x:0, z:0, hx:1, hz:1};
    GAME.world.colliders.box.push(col);
    o.userData.collider = {kind:'box', ref:col};
    if(o.userData.addedEntry) o.userData.addedEntry.collide = true;
    STORE.syncCollider(o);
  } else if(!enabled && old){
    const arr = old.kind === 'circle' ? GAME.world.colliders.circle : GAME.world.colliders.box;
    const i = old.ref ? arr.indexOf(old.ref) : -1;
    if(i >= 0) arr.splice(i, 1);
    o.userData.collider = null;
    if(o.userData.addedEntry) o.userData.addedEntry.collide = false;
  }
  if(GAME.systems.physics) GAME.systems.physics.rebuild();
  markDirty();
  buildInspector();
  refreshOutliner();
  status(enabled ? 'Collider enabled' : 'Collider disabled');
}

function performDeleteEntity(o){
  if(!o || o.userData.editorType === 'player' || o.userData.editorType === 'playerLight' || o.userData.editorType === 'playerEffect' || o.userData.editorType === 'playerDataWidget'){ status('Componente blueprint non eliminabile'); return; }
  const wasSelected = ED.selected === o;
  removeEntity(o);
  if(wasSelected) deselect();
  thumbCache.delete(o.userData.editorId);
  pushHistory({
    label: 'Delete ' + (o.userData.editorName || 'Entity'),
    undo: () => { restoreEntity(o); selectObject(o); },
    redo: () => removeEntity(o),
  });
  markDirty(); refreshOutliner();
  status('Deleted: ' + (o.userData.editorName || ''));
}
function requestDeleteEntity(o){
  if(!o || o.userData.editorType === 'player' || o.userData.editorType === 'playerLight' || o.userData.editorType === 'playerEffect' || o.userData.editorType === 'playerDataWidget'){
    status('Componente blueprint non eliminabile');
    return;
  }
  confirmEditorAction({
    title: 'Delete scene object?',
    message: 'Delete "' + (o.userData.editorName || o.userData.editorId || 'Entity') + '" from the current level?',
    okText: 'Delete object',
  }).then(ok => { if(ok) performDeleteEntity(o); });
}

function duplicateEntity(o, offset){
  if(!o || o.userData.editorType === 'player' || o.userData.editorType === 'playerLight' || o.userData.editorType === 'playerEffect' || o.userData.editorType === 'playerDataWidget') return;
  const id = STORE.nextId();
  let obj, entry;
  const src = o.userData.addedEntry;
  if(o.userData.effectParams){
    const params = Object.assign({}, o.userData.effectParams);
    obj = STORE.createEmitter(params.kind, params);
    entry = {id, kind:'effect', effect: params.kind, params, name: o.userData.editorName + ' copy', collide: false};
  } else if(src){
    entry = JSON.parse(JSON.stringify(src));
    entry.id = id; entry.name = o.userData.editorName + ' copy';
    obj = null; // created async below
  } else {
    // builtin: persist as a clone-by-reference entry
    entry = {id, kind:'clone', srcId: o.userData.editorId, name: o.userData.editorName + ' copy', collide: !!o.userData.collider};
    obj = cleanClone(o);
  }
  if(o.userData.assetKey) entry.asset = {key:o.userData.assetKey, name:o.userData.assetName, source:o.userData.assetSource};
  const place = created => {
    created.position.copy(o.position);
    if(offset) created.position.add(offset);
    else created.position.x += 3;
    created.rotation.copy(o.rotation);
    created.scale.copy(o.scale);
    entry.t = STORE.tOf(created);
    entry.t.name = entry.name;
    STORE.registerAdded(GAME, created, entry);
    if(o.userData.matProps) STORE.applyMatProps(created, o.userData.matProps);
    pushHistory({
      label: 'Duplicate ' + (o.userData.editorName || 'Entity'),
      undo: () => removeEntity(created),
      redo: () => { restoreEntity(created); selectObject(created); },
    });
    markDirty(); refreshOutliner(); selectObject(created);
  };
  if(obj) place(obj);
  else STORE.createFromEntry(entry, GAME).then(place).catch(err => status('Duplicazione fallita: ' + err.message));
}
function cleanClone(o){
  const c = o.clone(true);
  c.userData = {};
  return c;
}

function focusSelected(){
  const target = ED.selected || (ED.special === 'env' ? null : null);
  if(!target) return;
  const box = new THREE.Box3().setFromObject(target);
  const c = box.isEmpty() ? target.position.clone() : box.getCenter(new THREE.Vector3());
  const r = box.isEmpty() ? 4 : Math.max(2.5, box.getSize(new THREE.Vector3()).length() * .8);
  const dir = new THREE.Vector3().subVectors(camE.position, c).normalize();
  if(dir.lengthSq() < .01) dir.set(1, .6, 1).normalize();
  camE.position.copy(c).addScaledVector(dir, r * 1.6).add(new THREE.Vector3(0, r*.35, 0));
  camE.lookAt(c);
  if(orbit) orbit.target.copy(c);
}

// gizmo change → sync physics/colliders/inspector
function onGizmoChange(){
  const o = ED.selected;
  if(!o) return;
  applyZUpProxyToSelected();
  if(o.userData.editorType === 'player'){
    GAME.player.physics.pos.copy(o.position);
    GAME.player.physics.heading = o.rotation.y;
    if(GAME.player.spawn){
      GAME.player.spawn.x = o.position.x;
      GAME.player.spawn.z = o.position.z;
      GAME.player.spawn.heading = o.rotation.y;
    }
    if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
  }
  STORE.syncCollider(o);
  markDirty();
  syncTransformFields();
}

// ------------------------------------------------ picking + context menu on canvas
let downX = 0, downY = 0, downBtn = -1;

function pickAt(clientX, clientY, opts){ return viewportPicking.pickAt(clientX, clientY, opts); }
function groundPointAt(clientX, clientY){ return viewportPicking.groundPointAt(clientX, clientY); }
function spawnPointAhead(){ return viewportPicking.spawnPointAhead(); }
function isGroundLikeEntity(o){ return viewportPicking.isGroundLikeEntity(o); }
function updateViewportHover(e){
  if(!ED.active || e.target !== canvas){
    clearHoverPickHelper();
    return;
  }
  viewportPicking.updateHover(e);
}

canvas.addEventListener('pointerdown', e => {
  if(!ED.active || ED.playPreview || ED.levelsOpen) return;
  downX = e.clientX; downY = e.clientY; downBtn = e.button;
  clearHoverPickHelper();
  if(e.button === 2) flyStart(e);
});
addEventListener('pointermove', e => {
  if(ED.active && !ED.playPreview && !ED.levelsOpen){
    flyMove(e);
    updateViewportHover(e);
  }
});
addEventListener('pointerup', e => {
  if(!ED.active || ED.playPreview || ED.levelsOpen) return;
  const dist = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
  const wasFlying = fly.rmb && fly.moved > 6;
  if(e.button === 2) flyEnd(e);
  if(e.target !== canvas) return;
  if(gizmoSuppressSceneClick || gizmoPointerActive || (gizmo && (gizmo.dragging || gizmo.axis))) return;
  if(e.button === 0 && downBtn === 0 && dist < 5){
    const hit = pickAt(e.clientX, e.clientY);
    if(hit) selectObject(hit.entity);
    else deselect();
  }
  if(e.button === 2 && !wasFlying && dist < 5){
    const hit = pickAt(e.clientX, e.clientY);
    const gp = hit ? hit.point.clone().setY(0) : groundPointAt(e.clientX, e.clientY);
    const isGround = hit && isGroundLikeEntity(hit.entity);
    if(hit && !isGround && hit.entity.userData.editorType !== 'player'){
      selectObject(hit.entity);
      openMenu(objectMenuItems(hit.entity, false, gp), e.clientX, e.clientY);
    } else if(hit && hit.entity.userData.editorType === 'player'){
      selectObject(hit.entity);
      openMenu(playerMenuItems(), e.clientX, e.clientY);
    } else {
      openMenu(canvasMenuItems(gp), e.clientX, e.clientY);
    }
  }
});
canvas.addEventListener('contextmenu', e => { if(ED.active && !ED.levelsOpen) e.preventDefault(); });
addEventListener('contextmenu', e => {
  if(!ED.active || ED.levelsOpen) return;
  e.preventDefault();
}, true);
canvas.addEventListener('wheel', e => {
  if(ED.levelsOpen) return;
  if(ED.active && !ED.playPreview){
    e.preventDefault();
    if(fly.rmb){
      fly.speed = Math.max(2, Math.min(80, fly.speed * (e.deltaY > 0 ? .85 : 1.18)));
      status('Velocità volo: ' + fly.speed.toFixed(0));
    }
  }
}, {passive:false});

// ------------------------------------------------ menu definitions
function addMenuItems(at){
  const P = at ? {x: at.x, y: at.y, z: at.z} : spawnPointAhead();
  const prim = k => ({label: k[0].toUpperCase()+k.slice(1), icon:'▣', action: () => addPrimitive(k, P)});
  return [
    {label:'Primitiva', icon:'▣', sub: ['box','sphere','cylinder','cone','plane','torus','ramp'].map(prim)},
    {label:'Luce', icon:'💡', sub: [
      {label:'Point Light', icon:'💡', action:() => addLight('point', P)},
      {label:'Spot Light', icon:'🔦', action:() => addLight('spot', P)},
      {label:'Directional Light', icon:'☀️', action:() => addLight('directional', P)},
      {label:'Hemisphere Light', icon:'🌗', action:() => addLight('hemisphere', P)},
      {label:'Ambient Light', icon:'💠', action:() => addLight('ambient', P)},
    ]},
    {label:'Effetto', icon:'✨', sub: Object.keys(STORE.EFFECT_PRESETS).map(k => (
      {label: k[0].toUpperCase()+k.slice(1), icon:'✨', action:() => addEffect(k, P)}
    ))},
    {sep:true},
    {label:'Importa modello GLB…', icon:'📦', action:() => { pendingGlbPoint = P; $('#lkGlbInput').click(); }},
  ];
}
function objectMenuItems(o, fromOutliner, gp){
  const items = [
    {label:'Strumento', icon:'✥', sub: [
      {label:'Select  Q', icon:'☝', action:() => setTool('select')},
      {label:'Move  W', icon:'✥', action:() => { selectObject(o); setTool('translate'); }},
      {label:'Rotate  E', icon:'⟳', action:() => { selectObject(o); setTool('rotate'); }},
      {label:'Scale  R', icon:'⤢', action:() => { selectObject(o); setTool('scale'); }},
    ]},
    {label:'Focus', icon:'🔍', action: focusSelected},
    {label:'Duplica', icon:'⧉', sub: [
      {label:'Duplica  Ctrl+D', icon:'⧉', action:() => duplicateEntity(o)},
      {label:'Popola in fila x5', icon:'▦', action:() => duplicateLine(o, 5)},
    ]},
    {label:'Applica ultima trasformazione  Ctrl+R', icon:'↻', disabled:!lastTransformRepeat, action:applyLastTransform},
    {label:'Link / Parent', icon:'⛓', sub: [
      {label:'Set as link parent', icon:'◎', action:() => setLinkParent(o)},
      {label:'Link to ' + (ED.linkParent ? (ED.linkParent.userData.editorName || 'parent') : 'parent'), icon:'→', disabled:!ED.linkParent || ED.linkParent === o, action:() => linkToParent(o, ED.linkParent)},
      {label:'Unlink from parent', icon:'×', disabled:!o.parent || o.parent === scene, action:() => unlinkObject(o)},
      {label:'Clear pending parent', icon:'⌫', disabled:!ED.linkParent, action:() => setLinkParent(null)},
    ]},
    {label: o.visible ? 'Nascondi' : 'Mostra', icon:'👁', action:() => toggleVisible(o)},
    {label:'Rinomina…', icon:'✏️', action:() => renameEntity(o)},
    {label:'Reset trasformazione', icon:'↺', action:() => resetTransform(o)},
    {sep:true},
    {label:'Replace with GLB...', icon:'📦', action:() => { replaceTarget = o; $('#lkReplaceInput').click(); }},
  ];
  if(!fromOutliner && gp){
    items.push({sep:true});
    items.push({label:'Add here', icon:'＋', sub: addMenuItems(gp)});
  }
  items.push({sep:true});
  items.push({label:'Elimina', icon:'🗑', action:() => requestDeleteEntity(o)});
  return items;
}
function duplicateLine(o, count){
  if(!o) return;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camE.quaternion).setY(0);
  if(right.lengthSq() < .01) right.set(1, 0, 0);
  right.normalize();
  const spacing = Math.max(2.5, new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).length() * .45);
  for(let i=1;i<=count;i++) duplicateEntity(o, right.clone().multiplyScalar(spacing * i));
  status('Popolati ' + count + ' duplicati');
}
function playerMenuItems(){
  return [
    {label:'Focus', icon:'🔍', action: focusSelected},
    {label:'Apri Blueprint Player', icon:'🚗', action:() => buildInspector()},
    {label:'Copy blueprint', icon:'◇', action: copyPlayerBlueprintAsset},
    {label:'Replace GLB model...', icon:'📦', action:() => $('#lkPlayerModelInput').click()},
    {label:'Imposta spawn qui', icon:'📍', action: setSpawnHere},
  ];
}
function canvasMenuItems(gp){
  return [
    {label:'Add', icon:'＋', sub: addMenuItems(gp)},
    {sep:true},
    {label:'Deseleziona', icon:'✕', action: deselect},
    {label: ED.gridOn ? 'Nascondi griglia' : 'Mostra griglia', icon:'▦', action:() => setGrid(!ED.gridOn)},
    {label:'Vai al player', icon:'🚗', action:() => { selectObject(GAME.player.car); focusSelected(); }},
    {label:'Save track', icon:'💾', action: saveScene},
  ];
}
async function renameEntity(o){
  const n = await promptEditorAction({title:'Rename object', message:'Nuovo nome:', value:o.userData.editorName || '', okText:'Rename'});
  if(n){ o.userData.editorName = n; markDirty(); refreshOutliner(); buildInspector(); }
}
function resetTransform(o){
  const prev = ED.selected;
  if(ED.selected !== o) ED.selected = o;
  withTransformHistory('Reset transform', target => {
    target.rotation.set(0, target.userData.editorType === 'mesh' && target.userData.builtin ? target.rotation.y : 0, 0);
    target.scale.set(1,1,1);
    STORE.syncCollider(target);
  });
  ED.selected = prev;
  markDirty(); syncTransformFields();
}
function setSpawnHere(){
  const car = GAME.player.car;
  if(GAME.player.spawn){
    GAME.player.spawn.x = car.position.x;
    GAME.player.spawn.z = car.position.z;
    GAME.player.spawn.heading = car.rotation.y;
  }
  GAME.player.physics.pos.copy(car.position);
  GAME.player.physics.heading = car.rotation.y;
  if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
  markDirty(); status('Spawn del player aggiornato');
}

// ------------------------------------------------ add actions
function addPrimitive(prim, at){
  const id = STORE.nextId();
  const obj = STORE.createPrimitive(prim);
  const entry = {id, kind:'primitive', prim, name: prim[0].toUpperCase()+prim.slice(1), collide: prim !== 'plane',
    asset:{key:'primitive:' + prim, name:'Primitive ' + prim[0].toUpperCase() + prim.slice(1), source:'Editor primitive'},
    t:{p:[at.x, 0, at.z], r:[0,0,0], s:[1,1,1], v:true}};
  STORE.registerAdded(GAME, obj, entry);
  obj.userData.assetKey = 'primitive:' + prim;
  obj.userData.assetName = 'Primitive ' + prim[0].toUpperCase() + prim.slice(1);
  obj.userData.assetSource = 'Editor primitive';
  finishAdd(obj);
}
function addLight(kind, at){
  const id = STORE.nextId();
  const obj = STORE.createLight(kind);
  const y = obj.position.y;
  const entry = {id, kind:'light', light: kind, name: kind[0].toUpperCase()+kind.slice(1)+' Light', collide:false,
    asset:{key:'light:' + kind, name:kind[0].toUpperCase() + kind.slice(1) + ' Light', source:'Editor light'},
    t:{p:[at.x, y, at.z], r:[0,0,0], s:[1,1,1], v:true}};
  STORE.registerAdded(GAME, obj, entry);
  obj.userData.assetKey = 'light:' + kind;
  obj.userData.assetName = kind[0].toUpperCase() + kind.slice(1) + ' Light';
  obj.userData.assetSource = 'Editor light';
  finishAdd(obj);
}
function addEffect(kind, at){
  const id = STORE.nextId();
  const obj = STORE.createEmitter(kind);
  const entry = {id, kind:'effect', effect: kind, params: Object.assign({}, obj.userData.effectParams), name: 'FX ' + kind, collide:false,
    asset:{key:'effect:' + kind, name:'FX ' + kind, source:'Editor effect'},
    t:{p:[at.x, .3, at.z], r:[0,0,0], s:[1,1,1], v:true}};
  STORE.registerAdded(GAME, obj, entry);
  obj.userData.assetKey = 'effect:' + kind;
  obj.userData.assetName = 'FX ' + kind;
  obj.userData.assetSource = 'Editor effect';
  finishAdd(obj);
}
function finishAdd(obj){
  pushHistory({
    label: 'Add ' + (obj.userData.editorName || 'Entity'),
    undo: () => removeEntity(obj),
    redo: () => { restoreEntity(obj); selectObject(obj); },
  });
  markDirty(); refreshOutliner(); selectObject(obj);
  if(ED.tool === 'select') setTool('translate');
  status('Aggiunto: ' + obj.userData.editorName);
}

// GLB import
let pendingGlbPoint = null;
$('#lkGlbInput').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!f) return;
  const at = pendingGlbPoint || spawnPointAhead();
  pendingGlbPoint = null;
  importAssetFiles([f], {placePoint: at}).then(() => {
    if(f.size > 4.5e6) status('⚠ GLB grande (' + (f.size/1e6).toFixed(1) + ' MB): il salvataggio permanente può fallire');
  });
});
// replace an entity with a GLB (keeps the transform)
let replaceTarget = null;
$('#lkReplaceInput').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!f || !replaceTarget) return;
  const target = replaceTarget; replaceTarget = null;
  replaceObjectWithFile(target, f);
});

// player model replacement
$('#lkPlayerModelInput').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!f) return;
  readFileAsDataURL(f).then(src => {
    new THREE.GLTFLoader().load(src, g => {
      GAME.player.setModel(g.scene);
      GAME.player.car.userData.modelSrc = src;
      markDirty(); buildInspector();
      status(f.size > 4.5e6 ? '⚠ Modello grande: il salvataggio permanente può fallire' : 'Modello player sostituito');
    }, undefined, () => status('Model loading failed'));
  });
});

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
  btnRow,
  el,
});
function getFirstMaterial(o){ return materialEditor.getFirstMaterial(o); }
function applyMaterialPatch(o, patch){ return materialEditor.applyMaterialPatch(o, patch); }
function musicLibrarySection(title, api){ return musicLibraryPanel.build(title, api); }
function buildMaterialEditor(box, o){ return materialEditor.build(box, o); }

const tf = {inputs: null};   // live transform inputs for sync during gizmo drag
function syncTransformFields(){
  const o = ED.selected;
  if(!o || !tf.inputs) return;
  const f = v => +v.toFixed(3);
  tf.inputs.forEach(item => {
    if(item.kind === 'p') item.input.value = f(o.position[item.prop]);
    else if(item.kind === 'r') item.input.value = f(THREE.MathUtils.radToDeg(o.rotation[item.prop]));
    else if(item.kind === 's') item.input.value = f(o.scale[item.prop]);
  });
}
objectInspector = window.LK_EDITOR_OBJECT_INSPECTOR && window.LK_EDITOR_OBJECT_INSPECTOR.create({
  THREE,
  GAME,
  STORE,
  ED,
  scene,
  tf,
  el,
  section,
  btnRow,
  checkRow,
  colorRow,
  sliderRow,
  entityIcon,
  markDirty,
  refreshOutliner,
  selectObject,
  focusSelected,
  beginTransformHistory,
  commitTransformHistory,
  resetTransform,
  syncTransformFields,
  onGizmoChange,
  setColliderEnabled,
  buildMaterialEditor,
  duplicateEntity,
  requestDeleteEntity,
  replaceSelectedGlb: o => { replaceTarget = o; $('#lkReplaceInput').click(); },
});
playerCameraInspector = window.LK_EDITOR_PLAYER_CAMERA_INSPECTOR && window.LK_EDITOR_PLAYER_CAMERA_INSPECTOR.create({
  GAME,
  markDirty,
  section,
  selectRow,
  sliderRow,
  checkRow,
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

function buildInspector(){
  const box = insp();
  box.innerHTML = '';
  tf.inputs = null;
  if(ED.special === 'env') return buildEnvInspector(box);
  if(ED.special === 'hud') return buildHudInspector(box);
  const o = ED.selected;
  if(!o){
    box.appendChild(el('<div class="lk-empty">No selection.<br>Click an object in the scene<br>or in the list on the left.</div>'));
    return;
  }
  if(o.userData.editorType === 'player') return buildPlayerInspector(box, o);
  return objectInspector.build(box, o);
}

function buildPlayerInspector(box, o){
  box.appendChild(el('<div class="lk-head lk-bp"><span class="lk-head-ic">🚗</span><span class="lk-bp-title">BLUEPRINT · PLAYER</span><span class="lk-head-id">player vehicle</span></div>'));
  box.appendChild(btnRow([
    {label:'◇ Copy blueprint', action: copyPlayerBlueprintAsset},
    {label:'★ Promote current to Base', action:() => {
      const bp = currentPlayerBlueprint();
      if(bp && STORE.playerBlueprints && STORE.playerBlueprints.setDefault){
        STORE.playerBlueprints.setDefault(bp, {levelId: ED.trackId, levelName: ED.trackName, copiedFrom: 'scene-player'});
        applyPlayerBlueprintAsset(bp, {applySpawn:false, silent:true});
        status('Current player blueprint promoted to Base');
      }
    }},
  ]));

  // transform (spawn)
  const st = section('POSIZIONE / SPAWN');
  st.body.appendChild(el('<div class="lk-hint">Move the car with the gizmo: its position becomes the spawn.</div>'));
  const row = el('<div class="lk-vec"><label>Posizione</label></div>');
  const ins = [];
  ['x','y','z'].forEach(ax => {
    const i = el('<input type="number" step="0.5">');
    i.value = +o.position[ax].toFixed(2);
    i.addEventListener('focus', beginTransformHistory);
    i.addEventListener('input', () => { o.position[ax] = parseFloat(i.value) || 0; onGizmoChange(); });
    i.addEventListener('change', () => commitTransformHistory('Player spawn'));
    row.appendChild(i); ins.push(i);
  });
  st.body.appendChild(row);
  const rowR = el('<div class="lk-vec"><label>Direzione°</label></div>');
  const rI = el('<input type="number" step="5">');
  rI.value = +THREE.MathUtils.radToDeg(o.rotation.y).toFixed(1);
  rI.addEventListener('focus', beginTransformHistory);
  rI.addEventListener('input', () => { o.rotation.y = THREE.MathUtils.degToRad(parseFloat(rI.value) || 0); onGizmoChange(); });
  rI.addEventListener('change', () => commitTransformHistory('Player direction'));
  rowR.appendChild(rI);
  st.body.appendChild(rowR);
  tf.inputs = [ins[0], ins[1], ins[2], {set value(v){}, get value(){return 0;}}, rI, {set value(v){}, get value(){return 0;}}, {set value(v){}}, {set value(v){}}, {set value(v){}}];
  st.body.appendChild(btnRow([{label:'📍 Spawn qui', action: setSpawnHere}, {label:'↺ Spawn default', action:() => {
    o.position.set(0,0,55); o.rotation.y = Math.PI; onGizmoChange(); buildInspector();
  }}]));
  box.appendChild(st.root);

  playerCameraInspector.build(box);
  playerLightsInspector.build(box);
  playerAttachmentsInspector.build(box);
  playerSetupInspector.build(box);
}

// carica il Sound Designer (modulo separato) solo alla prima apertura
function openSoundDesigner(setId){
  const open = () => {
    if(window.LK_SOUND_DESIGNER) window.LK_SOUND_DESIGNER.open(setId);
    else status('⚠ Sound Designer non disponibile');
  };
  if(window.LK_SOUND_DESIGNER) return open();
  const s = document.createElement('script');
  s.src = 'js/editor/sound-designer.js?v=' + Date.now();
  s.onload = open;
  s.onerror = () => status('⚠ Sound Designer non caricato');
  document.body.appendChild(s);
}

function buildHudInspector(box){ return hudInspector.build(box); }

function buildEnvInspector(box){
  box.appendChild(el('<div class="lk-head"><span class="lk-head-ic">🌍</span><span class="lk-bp-title">ENVIRONMENT</span><span class="lk-head-id">sky · fog · global lights</span></div>'));
  const sky = GAME.systems.sky;
  const cam = GAME.player.cameraCfg;

  const ss = section('SKY / DAY-NIGHT');
  ss.body.appendChild(sliderRow('Time of day', sky.getTime(), 0, 1, .005, v => { sky.setTime(v); if(GAME.player.updateLights) GAME.player.updateLights(); markDirty(); },
    v => { const names = ['dawn','day','dusk','night']; return names[Math.floor(((+v)+.125)%1*4 % 4)] + ' (' + (+v).toFixed(2) + ')'; }).root);
  ss.body.appendChild(sliderRow('Day length (s)', sky.getDayLength(), 30, 1200, 10, v => { sky.setDayLength(v); markDirty(); }).root);
  box.appendChild(ss.root);

  const sf = section('FOG / DISTANCE');
  sf.body.appendChild(sliderRow('Fog density', cam.fogDensity, 0, .03, .0005, v => { cam.fogDensity = v; GAME.player.applyCameraCfg(); markDirty(); }, v => (+v).toFixed(4)).root);
  sf.body.appendChild(sliderRow('View distance', cam.far, 100, 1500, 10, v => { cam.far = v; GAME.player.applyCameraCfg(); markDirty(); }).root);
  box.appendChild(sf.root);

  const spe = section('PROCEDURAL ENVIRONMENT');
  if(sky.proceduralEnv){
    spe.body.appendChild(checkRow('Enabled', sky.proceduralEnv.getEnabled(), v => { sky.proceduralEnv.setEnabled(v); markDirty(); }).root);
    spe.body.appendChild(sliderRow('Intensity', sky.proceduralEnv.getIntensity(), 0, 1, .01, v => { sky.proceduralEnv.setIntensity(v); markDirty(); }, v => (+v).toFixed(2)).root);
    spe.body.appendChild(sliderRow('Warmth', sky.proceduralEnv.getWarmth(), 0, 1, .01, v => { sky.proceduralEnv.setWarmth(v); markDirty(); }, v => (+v).toFixed(2)).root);
    spe.body.appendChild(sliderRow('Contrast', sky.proceduralEnv.getContrast(), 0, 1, .01, v => { sky.proceduralEnv.setContrast(v); markDirty(); }, v => (+v).toFixed(2)).root);
    spe.body.appendChild(el('<div class="lk-hint">Lightweight dynamic environment map generated in code. Use this instead of HDRI for faster iteration and lower memory cost.</div>'));
  }
  box.appendChild(spe.root);

  const ssb = section('SUN BLOOM');
  if(sky.sunBloom){
    const sb = sky.sunBloom.get();
    const sbset = patch => { sky.sunBloom.set(patch); markDirty(); };
    ssb.body.appendChild(checkRow('Attivo', sb.enabled, v => sbset({enabled:v})).root);
    ssb.body.appendChild(sliderRow('Intensita\'', sb.intensity, 0, 2, .01, v => sbset({intensity:v}), v => (+v).toFixed(2)).root);
    ssb.body.appendChild(sliderRow('Dimensione', sb.size, .2, 3, .05, v => sbset({size:v}), v => (+v).toFixed(2)).root);
    ssb.body.appendChild(el('<div class="lk-hint">Alone luminoso attorno al disco solare. Indipendente dal lens flare: qui regoli il "bagliore", sotto i riflessi di lente.</div>'));
  }
  box.appendChild(ssb.root);

  const sfl = section('LENS FLARE');
  if(sky.flare && sky.flare.get){
    const fl = sky.flare.get();
    const flset = patch => { sky.flare.set(patch); markDirty(); };
    sfl.body.appendChild(checkRow('Attivo', fl.enabled, v => flset({enabled:v})).root);
    sfl.body.appendChild(sliderRow('Intensita\'', fl.intensity, 0, 2, .01, v => flset({intensity:v}), v => (+v).toFixed(2)).root);
    sfl.body.appendChild(sliderRow('Dimensione', fl.size, .2, 3, .05, v => flset({size:v}), v => (+v).toFixed(2)).root);
    sfl.body.appendChild(sliderRow('Ghost (numero)', fl.ghosts, 0, 8, 1, v => flset({ghosts:Math.round(v)}), v => String(Math.round(v))).root);
    sfl.body.appendChild(sliderRow('Spaziatura ghost', fl.spacing, .1, 2, .05, v => flset({spacing:v}), v => (+v).toFixed(2)).root);
    sfl.body.appendChild(sliderRow('Cromatismo', fl.chroma, 0, 1, .01, v => flset({chroma:v}), v => Math.round(v*100) + '%').root);
    sfl.body.appendChild(sliderRow('Alone (halo)', fl.halo, 0, 1, .01, v => flset({halo:v}), v => Math.round(v*100) + '%').root);
    sfl.body.appendChild(sliderRow('Dimensione halo', fl.haloSize, .2, 3, .05, v => flset({haloSize:v}), v => (+v).toFixed(2)).root);
    sfl.body.appendChild(sliderRow('Streak orizzontale', fl.streak, 0, 1, .01, v => flset({streak:v}), v => Math.round(v*100) + '%').root);
    sfl.body.appendChild(btnRow([{label:'↺ Default', action:() => { sky.flare.set(sky.flare.defaults()); markDirty(); buildInspector(); }}]));
    sfl.body.appendChild(el('<div class="lk-hint">Riflessi di lente veri: catena di ghost lungo l\'asse sole → centro schermo, ricalcolata con la camera attiva (guarda verso il sole e muovi la visuale). Sparisce quando il sole esce dall\'inquadratura.</div>'));
  }
  box.appendChild(sfl.root);

  const svc = section('NUVOLE VOLUMETRICHE', false);
  if(sky.volClouds && (!sky.volClouds.available || sky.volClouds.available()) && sky.volClouds.get()){
    const vc = sky.volClouds.get();
    const vset = patch => { sky.volClouds.set(patch); markDirty(); };
    svc.body.appendChild(checkRow('Attive (sostituiscono le sprite clouds)', vc.enabled, v => { vset({enabled:v}); buildInspector(); }).root);
    svc.body.appendChild(sliderRow('Copertura', vc.coverage, 0, 1, .01, v => vset({coverage:v}), v => Math.round(v*100) + '%').root);
    svc.body.appendChild(sliderRow('Densita\'', vc.density, 0, 3, .05, v => vset({density:v}), v => (+v).toFixed(2)).root);
    svc.body.appendChild(sliderRow('Scala rumore', vc.scale, .2, 6, .05, v => vset({scale:v}), v => (+v).toFixed(2)).root);
    svc.body.appendChild(sliderRow('Dettaglio bordi', vc.detail, 0, 1, .01, v => vset({detail:v}), v => Math.round(v*100) + '%').root);
    svc.body.appendChild(sliderRow('Vento', vc.speed, 0, 6, .05, v => vset({speed:v}), v => (+v).toFixed(2)).root);
    svc.body.appendChild(sliderRow('Direzione vento', vc.windAngle, 0, 360, 1, v => vset({windAngle:v}), v => Math.round(v) + '°').root);
    svc.body.appendChild(sliderRow('Quota strato', vc.altitude, 40, 400, 5, v => vset({altitude:v}), v => Math.round(v) + 'm').root);
    svc.body.appendChild(sliderRow('Spessore strato', vc.thickness, 10, 260, 5, v => vset({thickness:v}), v => Math.round(v) + 'm').root);
    svc.body.appendChild(sliderRow('Qualita\' (passi)', vc.quality, 6, 40, 1, v => vset({quality:Math.round(v)}), v => String(Math.round(v))).root);
    svc.body.appendChild(sliderRow('Assorbimento', vc.absorption, .2, 3, .05, v => vset({absorption:v}), v => (+v).toFixed(2)).root);
    svc.body.appendChild(sliderRow('Opacita\'', vc.opacity, 0, 1, .01, v => vset({opacity:v}), v => Math.round(v*100) + '%').root);
    svc.body.appendChild(btnRow([{label:'↺ Default', action:() => { sky.volClouds.set(sky.volClouds.defaults()); markDirty(); buildInspector(); }}]));
    svc.body.appendChild(el('<div class="lk-hint">Nuvole raymarched illuminate dal sole (seguono il ciclo giorno/notte). La "Qualita\'" e\' il costo GPU principale: 14-20 e\' un buon compromesso, alza solo se il frame rate regge.</div>'));
  } else {
    svc.body.appendChild(el('<div class="lk-empty">Modulo nuvole non caricato:<br>ricarica la pagina con Ctrl+F5<br>(cache del browser).</div>'));
  }
  box.appendChild(svc.root);

  const srn = section('PIOGGIA', false);
  const rain = GAME.systems.rain;
  if(rain){
    const rp = rain.get();
    const rset = patch => { rain.set(patch); markDirty(); };
    srn.body.appendChild(checkRow('Attiva', rp.enabled, v => { rset({enabled:v}); buildInspector(); }).root);
    srn.body.appendChild(sliderRow('Intensita\'', rp.intensity, 0, 1, .01, v => rset({intensity:v}), v => Math.round(v*100) + '%').root);
    srn.body.appendChild(sliderRow('Velocita\' caduta', rp.speed, 10, 160, 1, v => rset({speed:v}), v => Math.round(v) + ' m/s').root);
    srn.body.appendChild(sliderRow('Lunghezza gocce', rp.length, .05, 3, .05, v => rset({length:v}), v => (+v).toFixed(2) + 'm').root);
    srn.body.appendChild(sliderRow('Vento', rp.wind, 0, 1.5, .01, v => rset({wind:v}), v => (+v).toFixed(2)).root);
    srn.body.appendChild(sliderRow('Direzione vento', rp.windAngle, 0, 360, 1, v => rset({windAngle:v}), v => Math.round(v) + '°').root);
    srn.body.appendChild(sliderRow('Area (raggio)', rp.area, 20, 200, 5, v => rset({area:v}), v => Math.round(v) + 'm').root);
    srn.body.appendChild(sliderRow('Opacita\'', rp.opacity, 0, 1, .01, v => rset({opacity:v}), v => Math.round(v*100) + '%').root);
    srn.body.appendChild(sliderRow('Volume suono', rp.sound == null ? .6 : rp.sound, 0, 1, .01, v => rset({sound:v}), v => Math.round(v*100) + '%').root);
    srn.body.appendChild(btnRow([{label:'↺ Default', action:() => { rain.set(rain.defaults()); markDirty(); buildInspector(); }}]));
    srn.body.appendChild(el('<div class="lk-hint">Pioggia GPU che segue il veicolo: il costo e\' quasi nullo anche a intensita\' piena. Il suono e\' procedurale e segue l\'intensita\' (esce sul bus SFX, rispetta i volumi generali). Vento e direzione sono condivisi concettualmente con le nuvole: allineali per coerenza.</div>'));
  } else {
    srn.body.appendChild(el('<div class="lk-empty">Modulo pioggia non caricato.</div>'));
  }
  box.appendChild(srn.root);

  const lights = GAME.core.lights;
  const sl = section('LUCI GLOBALI');
  sl.body.appendChild(el('<div class="lk-hint">Sun and hemi are driven by the day/night cycle; select the light entities here for detailed edits.</div>'));
  sl.body.appendChild(btnRow([
    {label:'💡 Warm', action:() => selectObject(lights.pl1)},
    {label:'💡 Cool', action:() => selectObject(lights.pl2)},
    {label:'🌗 Hemi', action:() => selectObject(lights.hemi)},
    {label:'☀️ Sun', action:() => selectObject(lights.sun)},
  ]));
  box.appendChild(sl.root);
}

// ------------------------------------------------ enter / exit
function enterEditor(){
  if(ED.active) return;
  loadTrackMeta();
  ensureControls();
  ED.active = true;
  GAME.state.editorActive = true;
  GAME.hooks.frameOverride = editorFrame;
  root.classList.add('active');
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('hud').style.display = 'none';

  // place the car visual at its physics position (before first start it sits at origin)
  const car = GAME.player.car;
  car.position.copy(GAME.player.physics.pos);
  car.rotation.y = GAME.player.physics.heading;

  // place the game camera behind the car so the frustum helper means something
  if(!GAME.state.started){
    const h = GAME.player.physics.heading;
    const off = new THREE.Vector3(Math.sin(-h + Math.PI) * Math.cos(.32), Math.sin(.32), Math.cos(-h + Math.PI) * Math.cos(.32)).multiplyScalar(9);
    gameCam.position.copy(car.position).add(off);
    gameCam.lookAt(car.position.x, car.position.y + 1.1, car.position.z);
  }

  scene.add(helperGroup);
  helperGroup.add(grid, axes, gizmoProxy);
  ensureCameraRigHelper();
  if(!camHelper){
    camHelper = new THREE.CameraHelper(camProxy);
    camHelper.visible = ED.camHelperOn;
  }
  helperGroup.add(camHelper, camRigHelper, camRigLine);
  scene.add(gizmo);
  $('#lkSpace').textContent = spaceLabel();
  updateEditorAxesConvention();
  orbit.enabled = true;
  orbit.target.copy(car.position).setY(1);
  camE.position.copy(car.position).add(new THREE.Vector3(12, 9, 14));
  camE.lookAt(orbit.target);

  setTool(ED.tool);
  if(GAME.systems && GAME.systems.menuMusic && GAME.systems.menuMusic.fadeOut){
    GAME.systems.menuMusic.fadeOut(2400).then(syncQuickAudio);
  }
  syncQuickAudio();
  $('#lkAssetsPanel').className = ED.viewMode;
  if(GAME.player.updateLights) GAME.player.updateLights();
  if(GAME.player.updateExhaust) GAME.player.updateExhaust(0);
  if(GAME.player.updateDataWidgets) GAME.player.updateDataWidgets();
  refreshOutliner();
  refreshAssetsPanel();
  buildInspector();
  if(ED.special === 'hud' && GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(true);
  status('Editor active');
}

function setPlayPreview(on){
  ED.playPreview = !!on;
  if(ED.playPreview) clearHoverPickHelper();
  root.classList.toggle('play-preview', ED.playPreview);
  const btn = $('#lkPlay');
  if(btn) btn.textContent = ED.playPreview ? '■ STOP' : '▶ PREVIEW';
  $('#lkPipFrame').classList.remove('on');
  if(gizmo) gizmo.visible = !ED.playPreview;
  if(orbit) orbit.enabled = ED.active && !ED.playPreview;
}

function startPlayPreview(){
  if(!saveScene()) return;
  if(GAME.actions.startEditorPreview) GAME.actions.startEditorPreview();
  setPlayPreview(true);
  closeMenu();
  status('Play preview running — Esc to stop');
}

function stopPlayPreview(){
  if(GAME.actions.stopEditorPreview) GAME.actions.stopEditorPreview();
  setPlayPreview(false);
  if(orbit){
    orbit.enabled = true;
    orbit.target.copy(GAME.player.car.position).setY(1);
  }
  if(gizmo) gizmo.visible = true;
  status('Play preview stopped');
}

function exitEditor(toPlay){
  if(!ED.active) return;
  if(ED.playPreview) stopPlayPreview();
  ED.active = false;
  GAME.state.editorActive = false;
  GAME.hooks.frameOverride = null;
  if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
  if(GAME.player.updateLights) GAME.player.updateLights();
  if(GAME.player.updateExhaust) GAME.player.updateExhaust(0);
  root.classList.remove('active');
  document.body.classList.remove('editor-hud-hidden');
  const hudToggle = document.getElementById('videoEditorHud');
  if(hudToggle) hudToggle.checked = true;
  $('#lkPipFrame').classList.remove('on');
  closeMenu();
  clearHoverPickHelper();
  clearReplaceDropHelper();
  if(gizmo){ gizmoUsingZUpProxy = false; gizmo.detach(); }
  scene.remove(gizmo);
  helperGroup.remove(grid, axes, gizmoProxy);
  if(camHelper) helperGroup.remove(camHelper);
  if(camRigHelper) helperGroup.remove(camRigHelper);
  if(camRigLine) helperGroup.remove(camRigLine);
  scene.remove(helperGroup);
  if(orbit) orbit.enabled = false;

  document.getElementById('overlay').classList.remove('hidden');
}

// ------------------------------------------------ editor frame loop
const _clock = {t: performance.now()};
function editorFrame(dt){
  if(ED.playPreview){
    if(GAME.actions.stepGameplayPreview) GAME.actions.stepGameplayPreview(dt);
    helperGroup.visible = false;
    if(gizmo) gizmo.visible = false;
    $('#lkPipFrame').classList.remove('on');
    const viewRect = editorViewportRect();
    const glRect = {x:viewRect.x, y:innerHeight - viewRect.y - viewRect.h, w:viewRect.w, h:viewRect.h};
    if(GAME.actions.renderGameplayCameraRect) GAME.actions.renderGameplayCameraRect(glRect);
    else {
      renderer.setScissorTest(true);
      renderer.setViewport(glRect.x, glRect.y, glRect.w, glRect.h);
      renderer.setScissor(glRect.x, glRect.y, glRect.w, glRect.h);
      renderer.render(scene, gameCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, innerWidth, innerHeight);
    }
    helperGroup.visible = true;
    if(gizmo) gizmo.visible = false;
    return;
  }
  flyUpdate(dt);
  if(orbit && orbit.enabled) orbit.update();
  const viewRect = editorViewportRect();
  camE.aspect = viewRect.w / viewRect.h;
  camE.updateProjectionMatrix();

  // animate effects in the editor too
  for(const h of GAME.hooks.frame) h(dt);
  if(GAME.player.updateExhaust) GAME.player.updateExhaust(dt);
  if(GAME.player.updateDataWidgets) GAME.player.updateDataWidgets();

  syncGamePreviewCamera();

  // player camera proxy + helper
  camProxy.position.copy(gameCam.position);
  camProxy.quaternion.copy(gameCam.quaternion);
  camProxy.fov = gameCam.fov;
  camProxy.aspect = gameCam.aspect;
  camProxy.far = Math.min(30, GAME.player.cameraCfg.far);
  camProxy.updateProjectionMatrix();
  camProxy.updateMatrixWorld(true);
  if(camHelper && camHelper.visible) camHelper.update();
  if(camRigHelper){
    camRigHelper.visible = ED.camHelperOn;
    camRigHelper.position.copy(gameCam.position);
    camRigHelper.quaternion.copy(gameCam.quaternion);
  }
  if(camRigLine){
    camRigLine.visible = ED.camHelperOn;
    const pts = camRigLine.geometry.attributes.position;
    pts.setXYZ(0, gameCam.position.x, gameCam.position.y, gameCam.position.z);
    pts.setXYZ(1, GAME.player.car.position.x, GAME.player.car.position.y + 1.1, GAME.player.car.position.z);
    pts.needsUpdate = true;
  }

  if(selBox) selBox.update();
  viewportPicking.updateHelpers();
  if(replaceDropHelper) replaceDropHelper.update();
  if(lightHelper && lightHelper.update) lightHelper.update();

  processThumbQueue();

  renderer.setScissorTest(true);
  renderer.setViewport(viewRect.x, innerHeight - viewRect.y - viewRect.h, viewRect.w, viewRect.h);
  renderer.setScissor(viewRect.x, innerHeight - viewRect.y - viewRect.h, viewRect.w, viewRect.h);
  renderer.render(scene, camE);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);

  // picture-in-picture: player camera view
  if(ED.pipOn && isPlayerCameraSelection()){
    const rightW = panelWidth('right');
    const usableW = Math.max(320, innerWidth - panelWidth('left') - rightW - 28);
    const aspect = GAME.player.cameraAspectValue ? GAME.player.cameraAspectValue() : (gameCam.aspect || innerWidth / innerHeight);
    const w = Math.round(Math.min(ED.pipW, usableW * .9));
    const hgt = Math.round(w / aspect);
    const defaultPos = {
      x: innerWidth - rightW - w - 14,
      y: innerHeight - 40 - hgt - 14,
    };
    const pos = clampPanelPos(ED.pipPos || defaultPos, w, hgt);
    const x = pos.x;
    const y = pos.y;
    const pipFrame = $('#lkPipFrame');
    pipFrame.classList.add('on');
    pipFrame.style.left = x + 'px';
    pipFrame.style.top = y + 'px';
    pipFrame.style.width = w + 'px';
    pipFrame.style.height = hgt + 'px';
    helperGroup.visible = false;
    if(gizmo) gizmo.visible = false;
    const glY = innerHeight - y - hgt;
    // try/finally: qualunque errore nel post non deve MAI lasciare lo scissor
    // attivo (viewport "sparito"); in caso di errore si degrada al render diretto
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
          console.error('LotKing editor: post-processing PIP fallito, fallback al render diretto', err);
          status('⚠ Post-processing PIP fallito (' + (err && err.message || err) + '): render diretto');
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
  } else {
    $('#lkPipFrame').classList.remove('on');
  }
}

function syncGamePreviewCamera(){
  const car = GAME.player.car;
  const cfg = GAME.player.cameraCfg;
  const mode = cfg.mode || 'free';
  const dist = mode === 'free'
    ? Math.max(cfg.minDist || 4.5, Math.min(cfg.maxDist || 20, (cfg.minDist + cfg.maxDist) * .5 || 9))
    : Math.max(2, cfg.arcadeDistance || 9);
  const fwd = new THREE.Vector3(Math.sin(car.rotation.y), 0, Math.cos(car.rotation.y)).normalize();
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

// ------------------------------------------------ menu button (start screen)
const menuBtn = document.getElementById('editorBtn');
if(menuBtn) menuBtn.addEventListener('click', enterEditor);

addEventListener('lotking:radiohudchange', e => {
  if(!(ED.active && ED.special === 'hud')) return;
  markDirty();
  if(hudHistorySuppress) return;
  const d = e.detail || {};
  if(d.before && d.after) queueHudHistory(d.before, d.after, hudPatchLabel(d.patch));
});

GAME.editor = {enter: enterEditor, exit: exitEditor, state: ED};
console.info('LotKing: engine editor ready');
})();
