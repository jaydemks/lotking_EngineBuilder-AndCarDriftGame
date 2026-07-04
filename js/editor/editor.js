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
let flyCamera = null;
let toolbar = null;
let sidePanels = null;
let assetCatalog = null;
let assetDnd = null;
let assetPanel = null;
let outliner = null;
let editorMenus = null;
let inspectorUi = null;
let materialEditor = null;
let musicLibraryPanel = null;
let objectInspector = null;
let selectionManager = null;
let viewportEvents = null;
let playerCameraInspector = null;
let playerLightsInspector = null;
let playerAttachmentsInspector = null;
let playerSetupInspector = null;
let hudInspector = null;
let environmentInspector = null;
let projectIo = null;
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
flyCamera = window.LK_EDITOR_FLY_CAMERA && window.LK_EDITOR_FLY_CAMERA.create({
  THREE, ED, fly, camE, canvas,
  getOrbit: () => orbit,
});
function flyStart(e){ return flyCamera.flyStart(e); }
function flyMove(e){ return flyCamera.flyMove(e); }
function syncOrbitAfterFly(){ return flyCamera.syncOrbitAfterFly(); }
function flyEnd(e){ return flyCamera.flyEnd(e); }
function flyUpdate(dt){ return flyCamera.flyUpdate(dt); }
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
  confirmEditorAction,
  reopenEditorAndReload,
  status,
});
function slugifyTrackName(name){ return projectIo.slugifyTrackName(name); }
function setTrackMeta(meta){ return projectIo.setTrackMeta(meta); }
function currentTrackMeta(){ return projectIo.currentTrackMeta(); }
function loadTrackMeta(){ return projectIo.loadTrackMeta(); }
function saveScene(){ return projectIo.saveScene(); }
function projectFilename(project){ return projectIo.projectFilename(project); }
function exportProject(){ return projectIo.exportProject(); }
function importProjectFile(file){ return projectIo.importProjectFile(file); }
// ------------------------------------------------ outliner
let viewportReplaceTarget = null;
assetDnd = window.LK_EDITOR_ASSET_DND && window.LK_EDITOR_ASSET_DND.create({
  ED, canvas, $,
  hasExternalFileDrag,
  getAssetByRef,
  clearReplaceDropHelper,
  setReplaceDropHelper,
  getViewportReplaceTarget: () => viewportReplaceTarget,
  hasReplaceDropHelper: () => !!replaceDropHelper,
  pickAt,
  groundPointAt,
  supportedAssetFiles,
  importAssetFiles,
  replaceSelectedWithAsset,
  replaceObjectWithFile,
  placeAssetRef,
  status,
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
function assetMatchesSearch(item, q){ return assetCatalog.assetMatchesSearch(item, q); }
function assetFilterKey(item){ return assetCatalog.assetFilterKey(item); }
function selectAssetItem(ref){ return assetCatalog.selectAssetItem(ref); }
function getAssetByRef(ref){ return assetCatalog.getAssetByRef(ref); }
function placeAssetRef(item, at){ return assetCatalog.placeAssetRef(item, at); }
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
selectionManager = window.LK_EDITOR_SELECTION_MANAGER && window.LK_EDITOR_SELECTION_MANAGER.create({
  THREE, GAME, STORE, ED, camE, thumbCache,
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
  applyZUpProxyToSelected,
  syncTransformFields,
});
function selectObject(o){ return selectionManager.selectObject(o); }
function selectSpecial(kind){ return selectionManager.selectSpecial(kind); }
function deselect(){ return selectionManager.deselect(); }
function isPlayerCameraSelection(){ return selectionManager.isPlayerCameraSelection(); }
function toggleVisible(o){ return selectionManager.toggleVisible(o); }
function setColliderEnabled(o, enabled){ return selectionManager.setColliderEnabled(o, enabled); }
function performDeleteEntity(o){ return selectionManager.performDeleteEntity(o); }
function requestDeleteEntity(o){ return selectionManager.requestDeleteEntity(o); }
function duplicateEntity(o, offset){ return selectionManager.duplicateEntity(o, offset); }
function cleanClone(o){ return selectionManager.cleanClone(o); }
function focusSelected(){ return selectionManager.focusSelected(); }
function onGizmoChange(){ return selectionManager.onGizmoChange(); }

// ------------------------------------------------ picking + context menu on canvas
function pickAt(clientX, clientY, opts){ return viewportPicking.pickAt(clientX, clientY, opts); }
function groundPointAt(clientX, clientY){ return viewportPicking.groundPointAt(clientX, clientY); }
function spawnPointAhead(){ return viewportPicking.spawnPointAhead(); }
function isGroundLikeEntity(o){ return viewportPicking.isGroundLikeEntity(o); }
viewportEvents = window.LK_EDITOR_VIEWPORT_EVENTS && window.LK_EDITOR_VIEWPORT_EVENTS.create({
  ED, canvas,
  clearHoverPickHelper,
  updateHover: e => viewportPicking.updateHover(e),
  flyStart,
  flyMove,
  flyEnd,
  isFlyActive: () => fly.rmb,
  flyMoved: () => fly.moved,
  adjustFlySpeed: deltaY => {
    fly.speed = Math.max(2, Math.min(80, fly.speed * (deltaY > 0 ? .85 : 1.18)));
    status('Velocità volo: ' + fly.speed.toFixed(0));
  },
  shouldSuppressSceneClick: () => !!(gizmoSuppressSceneClick || gizmoPointerActive || (gizmo && (gizmo.dragging || gizmo.axis))),
  pickAt,
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
  openGlbImportAt,
  setTool,
  selectObject,
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
  setTool,
  status,
  spawnPointAhead,
  importAssetFiles,
  replaceObjectWithFile,
  readFileAsDataURL,
  buildInspector,
});
function addPrimitive(prim, at){ return addActions.addPrimitive(prim, at); }
function addLight(kind, at){ return addActions.addLight(kind, at); }
function addEffect(kind, at){ return addActions.addEffect(kind, at); }
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
  replaceSelectedGlb: beginReplaceObject,
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

function buildEnvInspector(box){ return environmentInspector.build(box); }

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
  if(isHudHistorySuppress()) return;
  const d = e.detail || {};
  if(d.before && d.after) queueHudHistory(d.before, d.after, hudPatchLabel(d.patch));
});

GAME.editor = {enter: enterEditor, exit: exitEditor, state: ED};
console.info('LotKing: engine editor ready');
})();
