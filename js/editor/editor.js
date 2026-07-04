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
let sceneDragId = null;
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
  return GAME.world.registry.filter(o => {
    if(o.userData.editorType === 'player') return false;
    if(ED.filter === 'added' && o.userData.builtin) return false;
    if(ED.filter === 'builtin' && !o.userData.builtin) return false;
    if(['mesh','light','effect'].includes(ED.filter) && o.userData.editorType !== ED.filter) return false;
    if(ED.search && !(o.userData.editorName || '').toLowerCase().includes(ED.search)) return false;
    return true;
  });
}

function refreshOutliner(){
  const box = $('#lkOutliner');
  box.innerHTML = '';
  const items = visibleEntities();
  const assignments = folderAssignments('scene');
  const renderEntity = o => {
    const id = o.userData.editorId;
    const div = document.createElement('div');
    div.className = 'lk-item' + (ED.selected === o ? ' sel' : '') + (o.visible ? '' : ' hidden-e');
    div.dataset.id = id;
    div.draggable = true;
    const thumb = document.createElement('div');
    thumb.className = 'lk-thumb';
    if(thumbCache.has(id)){
      const cached = thumbCache.get(id);
      if(cached) thumb.style.backgroundImage = 'url(' + cached + ')';
      else thumb.textContent = entityIcon(o);
    } else {
      thumb.textContent = entityIcon(o);
      if(o.userData.editorType === 'mesh') queueThumb(o, thumb);
    }
    const name = document.createElement('span');
    name.className = 'lk-name';
    name.textContent = o.userData.editorName || id;
    name.title = (o.userData.builtin ? '(originale) ' : '(aggiunto) ') + (o.userData.editorName || id);
    const eye = document.createElement('button');
    eye.className = 'lk-eye'; eye.textContent = o.visible ? '👁' : '—'; eye.title = 'Mostra/Nascondi';
    eye.addEventListener('click', ev => { ev.stopPropagation(); toggleVisible(o); });
    const del = document.createElement('button');
    del.className = 'lk-del'; del.textContent = '×'; del.title = 'Elimina';
    del.addEventListener('click', ev => { ev.stopPropagation(); requestDeleteEntity(o); });
    div.append(thumb, name, eye, del);
    div.addEventListener('dragstart', ev => {
      sceneDragId = id;
      ev.dataTransfer.setData('application/x-lotking-scene-object', id);
      ev.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragend', () => { sceneDragId = null; });
    bindReplaceDropTarget(div, o);
    div.addEventListener('click', () => selectObject(o));
    div.addEventListener('dblclick', () => { selectObject(o); focusSelected(); });
    div.addEventListener('contextmenu', ev => {
      ev.preventDefault(); ev.stopPropagation();
      selectObject(o);
      openMenu(objectMenuItems(o, true), ev.clientX, ev.clientY);
    });
    return div;
  };
  const folders = folderList('scene');
  const renderFolderTree = parent => {
    folders.filter(f => (f.parent || null) === (parent || null)).forEach(folder => {
      box.appendChild(makeFolderRow('scene', folder));
      if(folder.open){
        items.filter(o => assignments[o.userData.editorId] === folder.id).forEach(o => box.appendChild(renderEntity(o)));
        renderFolderTree(folder.id);
      }
    });
  };
  renderFolderTree(null);
  items.filter(o => !assignments[o.userData.editorId] || !folderById('scene', assignments[o.userData.editorId])).forEach(o => {
    box.appendChild(renderEntity(o));
  });
  box.ondragover = e => {
    if(Array.from(e.dataTransfer.types || []).includes('application/x-lotking-scene-object')){
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    }
  };
  box.ondrop = e => {
    const id = e.dataTransfer && e.dataTransfer.getData('application/x-lotking-scene-object');
    if(id && e.target === box){ delete assignments[id]; writeFolderState(); refreshOutliner(); }
  };
  box.oncontextmenu = e => {
    if(e.target.closest('.lk-item, .lk-folder-row')) return;
    e.preventDefault();
    e.stopPropagation();
    openMenu(scenePanelMenuItems(), e.clientX, e.clientY);
  };
  $('#lkStatusRight').textContent = items.length + ' oggetti';
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
function assetVisible(item, q){
  return assetPanel.visible(item, q);
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
  if(!item) return [];
  if(item.kind === 'level'){
    const l = item.raw;
    return [
      {label:'Load in editor', icon:'▶', disabled:!!l.active, action:() => loadLevel(l.id, l.name)},
      {label:'Rename', icon:'✎', action:() => renameLevel(l.id, l.name)},
      {label:'Duplicate', icon:'⧉', action:() => duplicateLevel(l.id, l.name)},
      {label:'Export LKEP', icon:'⇩', action:() => exportLevel(l.id)},
      {sep:true},
      {label:'Delete', icon:'🗑', action:() => deleteLevel(l.id, l.name)},
    ];
  }
  if(item.kind === 'sound-set'){
    const s = item.raw;
    const assignedSoundSet = GAME.player.engineAudio && GAME.player.engineAudio.setId;
    return [
      {label:'Open Engine Sound Designer', icon:'🎛', action:() => openSoundDesigner(s.id)},
      {label:'Assign to player vehicle', icon:'🚗', disabled:assignedSoundSet === s.id, action:() => {
        GAME.player.setEngineSound(s.id); markDirty(); refreshAssetsPanel();
        status('Sound set "' + s.name + '" assegnato al veicolo');
      }},
      {label:'Duplicate sound set', icon:'⧉', action:() => { STORE.soundSets.duplicate(s.id); refreshAssetsPanel(); }},
      {sep:true},
      {label:'Delete sound set', icon:'🗑', action:() => {
        confirmEditorAction({title:'Delete sound set?', message:'Eliminare il sound set "' + s.name + '"?', okText:'Delete'}).then(ok => {
          if(!ok) return;
          STORE.soundSets.remove(s.id);
          if(assignedSoundSet === s.id){ GAME.player.setEngineSound(null); markDirty(); }
          refreshAssetsPanel();
        });
      }},
    ];
  }
  if(item.kind === 'imported-glb'){
    const asset = item.raw;
    return [
      {label:'Add to level', icon:'＋', action:() => placeAssetRef(item, spawnPointAhead())},
      {label:'Replace selected scene object', icon:'📦', disabled:!ED.selected || ED.selected.userData.editorType === 'player', action:() => replaceSelectedWithAsset(asset)},
      {sep:true},
      {label:'Delete imported asset', icon:'🗑', action:() => deleteImportedAsset(asset)},
    ];
  }
  if(item.kind === 'scene'){
    const a = item.raw;
    return [
      {label:'Select first instance', icon:'☝', action:() => { selectObject(a.instances[0]); setLeftMode('scene'); }},
      {label:'Add another instance', icon:'＋', action:() => placeAssetRef(item, spawnPointAhead())},
      {label:'Focus first instance', icon:'🔍', action:() => { selectObject(a.instances[0]); focusSelected(); setLeftMode('scene'); }},
      {sep:true},
      {label:'Delete all instances', icon:'🗑', action:() => requestDeleteAssetInstances(a)},
    ];
  }
  if(item.kind === 'player-blueprint'){
    const asset = item.raw;
    return [
      {label:'Apply to scene player', icon:'🚗', action:() => applyPlayerBlueprintAsset(asset.player, {applySpawn:false})},
      {label:'Promote to Base blueprint', icon:'★', action:() => setDefaultPlayerBlueprintAsset(asset)},
      {sep:true},
      {label:'Delete copied blueprint', icon:'🗑', disabled:!!item.base, action:() => deletePlayerBlueprintAsset(asset)},
    ];
  }
  return [];
}
function scenePanelMenuItems(){
  return [
    {label:'Create scene folder/group', icon:'📁', action:() => newFolder('scene')},
    {label:'Add', icon:'＋', sub:addMenuItems(spawnPointAhead())},
    {sep:true},
    {label:'Grid view', icon:'▦', disabled:ED.viewMode === 'grid', action:() => setViewMode('grid')},
    {label:'List view', icon:'☰', disabled:ED.viewMode === 'list', action:() => setViewMode('list')},
    {label:ED.gridOn ? 'Hide viewport grid' : 'Show viewport grid', icon:'▦', action:() => setGrid(!ED.gridOn)},
    {sep:true},
    {label:'Deselect', icon:'✕', disabled:!ED.selected && !ED.special, action:deselect},
    {label:'Focus selected', icon:'🔍', disabled:!ED.selected, action:focusSelected},
    {label:'Save track', icon:'💾', action:saveScene},
  ];
}
function assetsPanelMenuItems(){
  const filterItems = Object.keys(ED.assetFilters).map(key => ({
    label:(ED.assetFilters[key] === false ? 'Show ' : 'Hide ') + key,
    icon:ED.assetFilters[key] === false ? '☐' : '☑',
    action:() => {
      ED.assetFilters[key] = ED.assetFilters[key] === false;
      const input = root.querySelector('[data-asset-filter="' + key + '"]');
      if(input) input.checked = ED.assetFilters[key] !== false;
      refreshAssetsPanel();
    },
  }));
  return [
    {label:'Create assets folder/group', icon:'📁', action:() => newFolder('assets')},
    {label:'Import GLB/GLTF assets', icon:'＋', action:() => $('#lkAssetInput').click()},
    {label:'Refresh assets', icon:'↻', action:() => { refreshAssetsPanel(); status('Asset library refreshed'); }},
    {sep:true},
    {label:'Grid view', icon:'▦', disabled:ED.viewMode === 'grid', action:() => setViewMode('grid')},
    {label:'List view', icon:'☰', disabled:ED.viewMode === 'list', action:() => setViewMode('list')},
    {label:'Filters', icon:'☑', sub:filterItems},
  ];
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
function assetButton(label, title, fn){ return assetPanel.button(label, title, fn); }
function makeAssetCard(item){ return assetPanel.makeCard(item); }
function addAssetGroup(box, title, items, folderAware){
  return assetPanel.addGroup(box, title, items, folderAware);
}
function refreshAssetsPanel(){
  const box = $('#lkAssetsPanel');
  assetPanel.preparePanel(box);
  const q = ED.search || '';
  const blueprintItems = [];
  if(STORE.playerBlueprints){
    const basePlayer = STORE.playerBlueprints.default() || currentPlayerBlueprint();
    blueprintItems.push({
      kind:'player-blueprint', ref:'blueprint:base', id:'base',
      name:'Player Blueprint Base',
      sub:'special · required · used by new levels · controller index 0',
      source:'Project default', icon:'🚗', filterType:'blueprint', active:true, draggable:false,
      defaultAction:() => applyPlayerBlueprintAsset(basePlayer, {applySpawn:false}),
      actions:[
        {label:'Apply', title:'Apply to scene player', fn:() => applyPlayerBlueprintAsset(basePlayer, {applySpawn:false})},
        {label:'Copy', title:'Copy current scene player as a new blueprint asset', fn:copyPlayerBlueprintAsset},
      ],
    });
    STORE.playerBlueprints.list().forEach(asset => blueprintItems.push({
      kind:'player-blueprint', ref:'blueprint:' + asset.id, id:asset.id,
      name:asset.name || 'Player Blueprint Copy',
      sub:'copied blueprint · controller index ' + (asset.controllerIndex == null ? 0 : asset.controllerIndex),
      source:asset.source && asset.source.levelName || 'Copied blueprint',
      icon:'🚙', filterType:'blueprint', draggable:false,
      defaultAction:() => applyPlayerBlueprintAsset(asset.player, {applySpawn:false}),
      actions:[
        {label:'Apply', title:'Apply to scene player', fn:() => applyPlayerBlueprintAsset(asset.player, {applySpawn:false})},
        {label:'★', title:'Promote to Base blueprint', fn:() => setDefaultPlayerBlueprintAsset(asset)},
        {label:'×', title:'Delete copied blueprint', fn:() => deletePlayerBlueprintAsset(asset)},
      ],
    }));
  }
  const visibleBlueprintItems = blueprintItems.filter(item => assetVisible(item, q));
  const allFolderedItems = [];
  addAssetGroup(box, 'PLAYER BLUEPRINTS', visibleBlueprintItems);
  allFolderedItems.push(...visibleBlueprintItems);

  // engine sound sets: asset audio del veicolo, come i blueprint
  const assignedSoundSet = GAME.player.engineAudio && GAME.player.engineAudio.setId;
  const soundSetItems = (STORE.soundSets ? STORE.soundSets.list() : []).map(s => ({
    kind:'sound-set', ref:'sound:' + s.id, id:s.id,
    name:s.name + (s.id === assignedSoundSet ? ' · ON CAR' : ''),
    sub:'engine sound set · ' + (s.savedAt ? new Date(s.savedAt).toLocaleDateString() : s.id),
    source:s.id, icon:'🔊', filterType:'sound', active:s.id === assignedSoundSet, draggable:false,
    defaultAction:() => openSoundDesigner(s.id),
    actions:[
      {label:'🎛', title:'Apri nel Sound Designer', fn:() => openSoundDesigner(s.id)},
      {label:'🚗', title:'Assegna al veicolo player', fn:() => {
        GAME.player.setEngineSound(s.id); markDirty(); refreshAssetsPanel();
        status('Sound set "' + s.name + '" assegnato al veicolo');
      }},
      {label:'⧉', title:'Duplica', fn:() => { STORE.soundSets.duplicate(s.id); refreshAssetsPanel(); }},
      {label:'×', title:'Elimina', fn:() => {
        confirmEditorAction({title:'Delete sound set?', message:'Eliminare il sound set "' + s.name + '"?', okText:'Delete'}).then(ok => {
          if(!ok) return;
          STORE.soundSets.remove(s.id);
          if(assignedSoundSet === s.id){ GAME.player.setEngineSound(null); markDirty(); }
          refreshAssetsPanel();
        });
      }},
    ],
  })).filter(item => assetVisible(item, q));
  addAssetGroup(box, 'ENGINE SOUND SETS', soundSetItems);
  allFolderedItems.push(...soundSetItems);

  // levels: asset "particolari" come in Unreal — in cima alla lista
  const LV = levelsApi();
  const levelItems = (LV ? LV.list() : []).map(l => ({
    kind:'level', ref:'level:' + l.id, id:l.id, name:l.name + (l.active ? ' · ACTIVE' : ''),
    sub:'level · LKEP · ' + (l.savedAt ? new Date(l.savedAt).toLocaleDateString() : l.id),
    source:l.id, icon:'🗺', active:l.active, draggable:false,
    defaultAction:() => { if(!l.active) loadLevel(l.id, l.name); },
    actions:[
      ...(l.active ? [] : [{label:'▶', title:'Load in editor', fn:() => loadLevel(l.id, l.name)}]),
      {label:'✎', title:'Rename', fn:() => renameLevel(l.id, l.name)},
      {label:'⧉', title:'Duplicate', fn:() => duplicateLevel(l.id, l.name)},
      {label:'×', title:'Delete', fn:() => deleteLevel(l.id, l.name)},
    ],
  })).filter(item => assetVisible(item, q));
  addAssetGroup(box, 'LEVELS', levelItems);
  allFolderedItems.push(...levelItems);

  const importedItems = assetLibraryLoad().map(asset => {
    const mb = asset.size ? ' · ' + (asset.size / 1e6).toFixed(1) + ' MB' : '';
    return {
      kind:'imported-glb', ref:'imported:' + asset.id, id:asset.id, name:asset.name || 'Imported Asset',
      sub:'imported glb · ' + (asset.source || asset.key) + mb,
      source:asset.source || asset.key, icon:'📦', draggable:true,
      defaultAction:() => placeAssetRef({kind:'imported-glb', ref:'imported:' + asset.id, id:asset.id, name:asset.name, raw:asset}, spawnPointAhead()),
      actions:[
        {label:'Place', title:'Place this asset in front of the editor camera', fn:() => placeAssetRef({kind:'imported-glb', ref:'imported:' + asset.id, id:asset.id, name:asset.name, raw:asset}, spawnPointAhead())},
        {label:'×', title:'Remove from imported asset library', fn:() => deleteImportedAsset(asset)},
      ],
    };
  }).filter(item => assetVisible(item, q));
  allFolderedItems.push(...importedItems);

  const sceneItems = collectAssets().map(a => ({
    kind:'scene', ref:'scene:' + a.key, key:a.key, name:a.name,
    filterType:a.sample && a.sample.userData && a.sample.userData.addedEntry && a.sample.userData.addedEntry.kind === 'glb' ? 'glb' : 'scene',
    type:a.type, sub:a.type + ' · ' + a.instances.length + ' instances · ' + a.source,
    source:a.source, icon:entityIcon(a.sample), thumbObject:a.sample,
    draggable:['mesh','light','effect'].includes(a.type),
    defaultAction:() => { selectObject(a.instances[0]); setLeftMode('scene'); },
    actions:[
      {label:'Select', title:'Select the first instance in scene', fn:() => { selectObject(a.instances[0]); setLeftMode('scene'); }},
      {label:'+', title:'Duplicate a new instance near the editor camera', fn:() => placeAssetRef({kind:'scene', ref:'scene:' + a.key, key:a.key, name:a.name, type:a.type, raw:a}, spawnPointAhead())},
    ],
  })).filter(item => assetVisible(item, q));
  allFolderedItems.push(...sceneItems);
  addAssetGroup(box, 'FOLDERS / ALL ASSETS', allFolderedItems, true);
  if(!visibleBlueprintItems.length && !levelItems.length && !importedItems.length && !sceneItems.length){
    box.appendChild(el('<div class="lk-empty">No assets visible.<br>Change filters or import GLB/GLTF files.</div>'));
  }
  $('#lkStatusRight').textContent =
    (visibleBlueprintItems.length ? visibleBlueprintItems.length + ' blueprints · ' : '') +
    (levelItems.length ? levelItems.length + ' levels · ' : '') +
    (importedItems.length ? importedItems.length + ' imported · ' : '') +
    sceneItems.length + ' scene assets';
}

// ------------------------------------------------ thumbnails (lazy, cached)
const thumbCache = {has: thumbnails.has, get: thumbnails.get, delete: thumbnails.remove};
function queueThumb(o, el){ thumbnails.queue(o, el); }
function processThumbQueue(){ thumbnails.process(); }
assetPanel = window.LK_EDITOR_ASSET_PANEL && window.LK_EDITOR_ASSET_PANEL.create({
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
  setAssetDragRef: ref => { assetDragRef = ref; },
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
function section(title, open){
  const s = el('<div class="lk-sec' + (open === false ? ' closed' : '') + '"><div class="lk-sec-h">' + title + '</div><div class="lk-sec-b"></div></div>');
  s.querySelector('.lk-sec-h').addEventListener('click', () => s.classList.toggle('closed'));
  return {root: s, body: s.querySelector('.lk-sec-b')};
}
function numRow(label, value, step, oninput){
  const r = el('<div class="lk-row"><label>' + label + '</label><input type="number" step="' + (step || .1) + '"></div>');
  const i = r.querySelector('input');
  i.value = (+value).toFixed(3).replace(/\.?0+$/, '') || 0;
  i.addEventListener('input', () => oninput(parseFloat(i.value) || 0));
  return {root: r, input: i};
}
function sliderRow(label, value, min, max, step, oninput, fmt){
  const r = el('<div class="lk-row lk-slider"><label>' + label + '</label><input type="range"><output></output></div>');
  const i = r.querySelector('input'), o = r.querySelector('output');
  i.min = min; i.max = max; i.step = step; i.value = value;
  const show = v => o.textContent = fmt ? fmt(v) : (+v).toFixed(step < .01 ? 4 : 2).replace(/\.?0+$/, '');
  show(value);
  i.addEventListener('input', () => { const v = parseFloat(i.value); show(v); oninput(v); });
  return {root: r, input: i};
}
function colorRow(label, hex, oninput){
  const r = el('<div class="lk-row"><label>' + label + '</label><input type="color"></div>');
  const i = r.querySelector('input');
  i.value = '#' + ('000000' + (hex >>> 0).toString(16)).slice(-6);
  i.addEventListener('input', () => oninput(parseInt(i.value.slice(1), 16)));
  return {root: r};
}
function checkRow(label, checked, oninput){
  const r = el('<div class="lk-row lk-check"><label>' + label + '</label><input type="checkbox"></div>');
  const i = r.querySelector('input');
  i.checked = !!checked;
  i.addEventListener('change', () => oninput(i.checked));
  return {root: r};
}
function btnRow(defs){
  const r = el('<div class="lk-btnrow"></div>');
  for(const d of defs){
    const b = el('<button' + (d.danger ? ' class="danger"' : '') + '>' + d.label + '</button>');
    b.addEventListener('click', d.action);
    r.appendChild(b);
  }
  return r;
}
function getFirstMaterial(o){
  let mat = null;
  o.traverse(n => {
    if(mat || !n.isMesh || !n.material) return;
    const mats = Array.isArray(n.material) ? n.material : [n.material];
    mat = mats.find(m => m && (m.color || m.roughness != null || m.metalness != null)) || mats[0];
  });
  return mat;
}
function selectRow(label, value, options, oninput){
  const r = el('<div class="lk-row"><label>' + label + '</label><select></select></div>');
  const s = r.querySelector('select');
  for(const opt of options){
    const o = el('<option value="' + opt.value + '">' + opt.label + '</option>');
    s.appendChild(o);
  }
  s.value = value;
  s.addEventListener('change', () => oninput(s.value));
  return {root:r, input:s};
}
function applyMaterialPatch(o, patch){
  STORE.applyMatProps(o, patch);
  thumbCache.delete(o.userData.editorId);
  markDirty();
  refreshOutliner();
}
function textureDrop(label, desc, onFile){
  const d = el('<div class="lk-drop" tabindex="0"><strong>' + label + '</strong><span>' + desc + '</span></div>');
  const input = el('<input type="file" accept="image/*" style="display:none">');
  const pick = f => { if(f) onFile(f); };
  d.appendChild(input);
  d.addEventListener('click', () => input.click());
  d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('drag'); });
  d.addEventListener('dragleave', () => d.classList.remove('drag'));
  d.addEventListener('drop', e => {
    e.preventDefault(); d.classList.remove('drag');
    pick(e.dataTransfer.files && e.dataTransfer.files[0]);
  });
  input.addEventListener('change', e => {
    pick(e.target.files && e.target.files[0]);
    e.target.value = '';
  });
  return d;
}
function musicLibrarySection(title, api){
  const s = section(title, false);
  if(!api || !api.getTracks){
    s.body.appendChild(el('<div class="lk-empty">Music library unavailable.</div>'));
    return s.root;
  }
  const tools = el('<div class="lk-row"><label>Filter</label><input type="text" placeholder="Track, artist, source"></div>');
  const filterInput = tools.querySelector('input');
  const sort = selectRow('Sort by', 'order', [
    {value:'order', label:'Number'},
    {value:'title', label:'Title'},
    {value:'artist', label:'Artist'},
    {value:'source', label:'Source'},
    {value:'fileName', label:'File name'},
  ], () => render());
  const dir = selectRow('Direction', 'asc', [
    {value:'asc', label:'A to Z'},
    {value:'desc', label:'Z to A'},
  ], () => render());
  const list = el('<div class="lk-music-list"></div>');
  const input = el('<input type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac" multiple style="display:none">');
  const addBtn = el('<button type="button">Import audio...</button>');
  const refreshBtn = el('<button type="button">Refresh list</button>');
  const row = el('<div class="lk-btnrow"></div>');
  row.append(addBtn, refreshBtn, input);
  addBtn.addEventListener('click', () => input.click());
  refreshBtn.addEventListener('click', () => render());
  input.addEventListener('change', e => {
    if(api.addTracks) api.addTracks(e.target.files);
    e.target.value = '';
    render();
    markDirty();
    status('Music library updated');
  });
  filterInput.addEventListener('input', render);

  function render(){
    list.innerHTML = '';
    const rows = api.getTracks({
      filter: filterInput.value,
      sort: sort.input.value,
      dir: dir.input.value,
    });
    if(!rows.length){
      list.appendChild(el('<div class="lk-empty">No tracks found.</div>'));
      return;
    }
    rows.forEach(t => {
      const item = el('<div class="lk-asset-item"></div>');
      const num = t.order == null ? String(t.index + 1).padStart(2, '0') : String(t.order).padStart(2, '0');
      const badge = el('<div class="lk-asset-thumb"></div>');
      badge.textContent = num;
      const meta = el('<div class="lk-asset-meta"></div>');
      const name = el('<div class="lk-asset-name"></div>');
      name.textContent = (t.artist || 'Unknown') + ' - ' + (t.title || 'Untitled');
      const sub = el('<div class="lk-asset-sub"></div>');
      sub.textContent = (t.fileName || t.source || 'Default') + (t.uploaded ? ' · session upload' : '');
      meta.append(name, sub);
      const actions = el('<div class="lk-asset-actions"></div>');
      const play = el('<button type="button">Load</button>');
      play.addEventListener('click', () => {
        if(api.loadTrack) api.loadTrack(t.index, true);
        if(api === (GAME.systems && GAME.systems.menuMusic)) ED.quickMusicIndex = t.index;
        status('Loaded: ' + (t.title || 'track'));
      });
      actions.appendChild(play);
      item.append(badge, meta, actions);
      list.appendChild(item);
    });
  }

  s.body.append(tools, sort.root, dir.root, row, list);
  render();
  return s.root;
}
function buildMaterialEditor(box, o){
  if(o.userData.editorType !== 'mesh') return;
  const mat = getFirstMaterial(o);
  if(!mat) return;
  const sm = section('EDIT MATERIAL');
  sm.body.appendChild(el('<div class="lk-hint">Modifica il materiale delle mesh selezionate. Texture: trascina PNG/JPG negli slot oppure clicca lo slot.</div>'));
  const preset = selectRow('Materiale', 'custom', [
    {value:'custom', label:'Custom'},
    {value:'matte', label:'Matte paint'},
    {value:'plastic', label:'Plastic'},
    {value:'metal', label:'Metal'},
    {value:'glass', label:'Glass / transparent'},
    {value:'emissive', label:'Emissive glow'},
  ], v => {
    const presets = {
      matte: {materialKind:'standard', roughness:.92, metalness:0, opacity:1, transparent:false, emissiveIntensity:0},
      plastic: {materialKind:'standard', roughness:.45, metalness:.05, opacity:1, transparent:false, emissiveIntensity:0},
      metal: {materialKind:'standard', roughness:.22, metalness:1, opacity:1, transparent:false, emissiveIntensity:0},
      glass: {materialKind:'standard', roughness:.04, metalness:0, opacity:.38, transparent:true, emissiveIntensity:0},
      emissive: {materialKind:'standard', roughness:.35, metalness:0, opacity:1, transparent:false, emissiveIntensity:1.6},
    };
    if(presets[v]) applyMaterialPatch(o, presets[v]);
    buildInspector();
  });
  sm.body.appendChild(preset.root);
  sm.body.appendChild(colorRow('Base color', mat.color ? mat.color.getHex() : 0xffffff, v => applyMaterialPatch(o, {color:v})).root);
  sm.body.appendChild(colorRow('Tint glow', mat.emissive ? mat.emissive.getHex() : 0x000000, v => applyMaterialPatch(o, {emissive:v})).root);
  sm.body.appendChild(sliderRow('Tint power', mat.emissiveIntensity != null ? mat.emissiveIntensity : 0, 0, 3, .05, v => applyMaterialPatch(o, {emissiveIntensity:v})).root);
  sm.body.appendChild(sliderRow('Roughness', mat.roughness != null ? mat.roughness : .7, 0, 1, .01, v => applyMaterialPatch(o, {roughness:v})).root);
  sm.body.appendChild(sliderRow('Metallic', mat.metalness != null ? mat.metalness : 0, 0, 1, .01, v => applyMaterialPatch(o, {metalness:v})).root);
  sm.body.appendChild(sliderRow('Opacity', mat.opacity != null ? mat.opacity : 1, .05, 1, .01, v => applyMaterialPatch(o, {opacity:v, transparent:v < 1})).root);
  sm.body.appendChild(sliderRow('Normal str.', mat.normalScale ? mat.normalScale.x : 1, 0, 2, .05, v => applyMaterialPatch(o, {normalScale:v})).root);
  sm.body.appendChild(textureDrop('Base texture', 'Albedo/base color map. Accetta immagini PNG/JPG/WebP.', f => {
    readFileAsDataURL(f).then(src => applyMaterialPatch(o, {mapSrc:src}));
  }));
  sm.body.appendChild(textureDrop('Normal map', 'Mappa normale tangent-space. Usa Normal str. per dosarne l\'effetto.', f => {
    readFileAsDataURL(f).then(src => applyMaterialPatch(o, {normalMapSrc:src}));
  }));
  sm.body.appendChild(btnRow([
    {label:'Reset maps', action:() => applyMaterialPatch(o, {mapSrc:null, normalMapSrc:null})},
    {label:'Shadows on', action:() => applyMaterialPatch(o, {castShadow:true})},
    {label:'Shadows off', action:() => applyMaterialPatch(o, {castShadow:false})},
  ]));
  box.appendChild(sm.root);
}

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

function transformContextInfo(o){
  const parent = o && o.parent && o.parent !== scene ? o.parent : null;
  const parentName = parent ? (parent.userData.editorName || parent.name || parent.userData.editorId || 'parent') : 'Scene';
  const inputSpace = parent ? 'LOCAL' : 'GLOBAL';
  const origin = o && o.userData.builtin ? 'Originale' : 'Aggiunto';
  return {parent, parentName, inputSpace, origin};
}

function worldTransformSummary(o){
  const wp = new THREE.Vector3();
  const wq = new THREE.Quaternion();
  const ws = new THREE.Vector3();
  o.updateMatrixWorld(true);
  o.matrixWorld.decompose(wp, wq, ws);
  const wr = new THREE.Euler().setFromQuaternion(wq, 'XYZ');
  const f = v => (+v.toFixed(2)).toString();
  const d = v => (+THREE.MathUtils.radToDeg(v).toFixed(1)).toString();
  if(ED.space !== 'engine'){
    return {
      p: 'X ' + f(wp.x) + ' · Y ' + f(wp.z) + ' · Z ' + f(wp.y),
      r: 'X ' + d(wr.x) + '° · Y ' + d(wr.z) + '° · Z ' + d(wr.y) + '°',
    };
  }
  return {
    p: 'X ' + f(wp.x) + ' · Y ' + f(wp.y) + ' · Z ' + f(wp.z),
    r: 'X ' + d(wr.x) + '° · Y ' + d(wr.y) + '° · Z ' + d(wr.z) + '°',
  };
}
function transformAxes(){
  if(ED.space !== 'engine') return [
    {label:'X', prop:'x'},
    {label:'Y', prop:'z'},
    {label:'Z', prop:'y'},
  ];
  return [
    {label:'X', prop:'x'},
    {label:'Y', prop:'y'},
    {label:'Z', prop:'z'},
  ];
}
function transformSpaceText(){
  if(ED.space === 'world') return 'World Z-up';
  if(ED.space === 'local') return 'Local Z-up';
  return 'Engine Y-up';
}

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

  // --- header
  const head = el('<div class="lk-head"><span class="lk-head-ic">' + entityIcon(o) + '</span><input class="lk-head-name"><span class="lk-head-id">' + o.userData.editorId + (o.userData.builtin ? ' · originale' : ' · aggiunto') + '</span></div>');
  const nameI = head.querySelector('input');
  nameI.value = o.userData.editorName || '';
  nameI.addEventListener('change', () => { o.userData.editorName = nameI.value; markDirty(); refreshOutliner(); });
  box.appendChild(head);
  if(o.userData.editorType === 'playerLight' || o.userData.editorType === 'playerEffect' || o.userData.editorType === 'playerDataWidget'){
    box.appendChild(btnRow([
      {label:'← Player Blueprint', action:() => selectObject(GAME.player.car)},
      {label:'Focus componente', action: focusSelected},
    ]));
    box.appendChild(el('<div class="lk-hint">This component belongs to the player vehicle. Go back to the blueprint to edit global settings, presets and sources.</div>'));
  }
  if(o.userData.linkParentId){
    const parent = GAME.world.registry.find(p => p.userData.editorId === o.userData.linkParentId);
    box.appendChild(el('<div class="lk-hint">Linked parent: ' + (parent ? (parent.userData.editorName || parent.userData.editorId) : o.userData.linkParentId) + '</div>'));
  }

  // --- transform
  const st = section('TRASFORMAZIONE');
  const ctx = transformContextInfo(o);
  const wt = worldTransformSummary(o);
  st.body.appendChild(el(
    '<div class="lk-transform-context">' +
      '<span>' + ctx.origin + '</span>' +
      '<span>Campi ' + ctx.inputSpace + '</span>' +
      '<span>Gizmo ' + transformSpaceText() + '</span>' +
    '</div>'
  ));
    st.body.appendChild(el('<div class="lk-hint">Parent: ' + ctx.parentName + (ED.space !== 'engine' ? '<br>Display convention: Z is vertical; engine still stores Y-up internally.' : '') + '</div>'));
  if(ctx.parent){
    st.body.appendChild(el('<div class="lk-hint">World pos: ' + wt.p + '<br>World rot: ' + wt.r + '</div>'));
  }
  const mk = (label, kind, get, set, isDeg) => {
    const row = el('<div class="lk-vec"><label>' + label + '</label></div>');
    const ins = [];
    transformAxes().forEach(axis => {
      const ax = axis.prop;
      const i = el('<input type="number" step="' + (isDeg ? 1 : .1) + '" title="' + axis.label + '">');
      i.value = +get(ax).toFixed(3);
      i.addEventListener('focus', beginTransformHistory);
      i.addEventListener('input', () => { set(ax, parseFloat(i.value) || 0); STORE.syncCollider(o); markDirty(); if(o.userData.editorType==='player' || o.userData.editorType==='playerDataWidget') onGizmoChange(); });
      i.addEventListener('change', () => commitTransformHistory(label));
      row.appendChild(i); ins.push({input:i, prop:ax, kind});
    });
    st.body.appendChild(row);
    return ins;
  };
  const pI = mk('Posizione', 'p', ax => o.position[ax], (ax,v) => o.position[ax] = v);
  const rI = mk('Rotazione°', 'r', ax => THREE.MathUtils.radToDeg(o.rotation[ax]), (ax,v) => o.rotation[ax] = THREE.MathUtils.degToRad(v), true);
  let uniform = false;
  const sI = mk('Scale', 's', ax => o.scale[ax], (ax,v) => {
    if(uniform) o.scale.set(v,v,v); else o.scale[ax] = v;
    if(uniform) syncTransformFields();
  });
  tf.inputs = [...pI, ...rI, ...sI];
  st.body.appendChild(checkRow('Uniform scale', false, v => uniform = v).root);
  st.body.appendChild(btnRow([{label:'↺ Reset', action:() => { resetTransform(o); syncTransformFields(); }}]));
  box.appendChild(st.root);

  // --- display
  const sd = section('VISIBILITÀ');
  sd.body.appendChild(checkRow('Visibile', o.visible, v => { o.visible = v; markDirty(); refreshOutliner(); }).root);
  if(o.userData.editorType === 'mesh'){
    let anyCast = false;
    o.traverse(n => { if(n.isMesh && n.castShadow) anyCast = true; });
    sd.body.appendChild(checkRow('Proietta ombre', anyCast, v => {
      o.traverse(n => { if(n.isMesh) n.castShadow = v; });
      o.userData.matProps = Object.assign({}, o.userData.matProps, {castShadow: v});
      markDirty();
    }).root);
  }
  box.appendChild(sd.root);

  if(o.userData.editorType === 'mesh'){
    const sc = section('COLLISION');
    const hasCollider = !!(o.userData.collider && o.userData.collider.ref);
    sc.body.appendChild(checkRow('Arcade box collider', hasCollider, v => setColliderEnabled(o, v)).root);
    const hint = hasCollider
      ? 'Collision uses one axis-aligned box around this object. Disable it for full maps, floors or visual-only GLB assets.'
      : 'No physics blocker. Recommended for large track/map GLB files; add smaller collider primitives where the car must hit something.';
    sc.body.appendChild(el('<div class="lk-hint">' + hint + '</div>'));
    if(hasCollider){
      const b = new THREE.Box3().setFromObject(o);
      const s = b.getSize(new THREE.Vector3());
      sc.body.appendChild(el('<div class="lk-hint">Box approx: X ' + s.x.toFixed(1) + ' · Z ' + s.z.toFixed(1) + '</div>'));
    }
    box.appendChild(sc.root);
  }

  // --- light props
  const light = o.isLight ? o : o.userData.light;
  if(light){
    const sl = section('LUCE');
    sl.body.appendChild(colorRow('Colore', light.color ? light.color.getHex() : 0xffffff, v => { light.color.setHex(v); markDirty(); }).root);
    if(light.groundColor) sl.body.appendChild(colorRow('Colore terreno', light.groundColor.getHex(), v => { light.groundColor.setHex(v); markDirty(); }).root);
    sl.body.appendChild(sliderRow('Intensità', light.intensity, 0, 6, .05, v => { light.intensity = v; markDirty(); }).root);
    if(light.distance != null && !light.isDirectionalLight && !light.isHemisphereLight && !light.isAmbientLight)
      sl.body.appendChild(sliderRow('Distanza', light.distance, 0, 200, 1, v => { light.distance = v; markDirty(); }).root);
    if(light.isSpotLight){
      sl.body.appendChild(sliderRow('Angolo°', THREE.MathUtils.radToDeg(light.angle), 5, 89, 1, v => { light.angle = THREE.MathUtils.degToRad(v); markDirty(); }).root);
      sl.body.appendChild(sliderRow('Penombra', light.penumbra, 0, 1, .01, v => { light.penumbra = v; markDirty(); }).root);
    }
    if(!light.isAmbientLight && !light.isHemisphereLight)
      sl.body.appendChild(checkRow('Proietta ombre', light.castShadow, v => { light.castShadow = v; markDirty(); }).root);
    box.appendChild(sl.root);
  }

  // --- material (meshes)
  buildMaterialEditor(box, o);

  // --- effect props
  if(o.userData.effectParams){
    const p = o.userData.effectParams;
    const se = section('EFFETTO (' + p.kind + ')');
    se.body.appendChild(colorRow('Colore', p.color, v => { o.userData.effectSetColor(v); markDirty(); }).root);
    se.body.appendChild(sliderRow('Frequenza', p.rate, 1, 80, 1, v => { p.rate = v; markDirty(); }).root);
    se.body.appendChild(sliderRow('Dimensione', p.size, .1, 8, .05, v => { p.size = v; markDirty(); }).root);
    se.body.appendChild(sliderRow('Vita (s)', p.life, .2, 6, .05, v => { p.life = v; markDirty(); }).root);
    se.body.appendChild(sliderRow('Spinta ↑', p.rise, 0, 8, .1, v => { p.rise = v; markDirty(); }).root);
    se.body.appendChild(sliderRow('Dispersione', p.spread, 0, 6, .05, v => { p.spread = v; markDirty(); }).root);
    se.body.appendChild(sliderRow('Opacità', p.opacity, .05, 1, .01, v => { p.opacity = v; markDirty(); }).root);
    box.appendChild(se.root);
  }

  // --- actions
  box.appendChild(btnRow([
    {label:'🔍 Focus', action: focusSelected},
    {label:'⧉ Duplica', action:() => duplicateEntity(o)},
    {label:'📦 Replace GLB', action:() => { replaceTarget = o; $('#lkReplaceInput').click(); }},
    {label:'🗑 Elimina', danger:true, action:() => requestDeleteEntity(o)},
  ]));
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

  // camera
  const cam = GAME.player.cameraCfg;
  cam.mode = cam.mode || 'free';
  cam.arcadeDistance = cam.arcadeDistance == null ? 9 : cam.arcadeDistance;
  cam.arcadeHeight = cam.arcadeHeight == null ? 3.1 : cam.arcadeHeight;
  cam.arcadeLag = cam.arcadeLag == null ? 5.8 : cam.arcadeLag;
  cam.reverseFrontSpeed = cam.reverseFrontSpeed == null ? 7 : cam.reverseFrontSpeed;
  cam.cinematicDriftOrbit = cam.cinematicDriftOrbit == null ? .18 : cam.cinematicDriftOrbit;
  cam.cinematicDriftClose = cam.cinematicDriftClose == null ? 1.65 : cam.cinematicDriftClose;
  cam.cinematicDriftHeight = cam.cinematicDriftHeight == null ? .45 : cam.cinematicDriftHeight;
  cam.cinematicLag = cam.cinematicLag == null ? 4.2 : cam.cinematicLag;
  cam.dof = Object.assign({enabled:false, focus:9, aperture:.025, maxblur:.04, autoFocus:true, focusRadius:.16, feather:.38, showFocus:false, bokeh:3}, cam.dof || {});
  delete cam.dof.exposure;
  if(cam.dof.aperture > 0 && cam.dof.aperture < .006) cam.dof.aperture = .025;
  if(cam.dof.maxblur > 0 && cam.dof.maxblur < .02) cam.dof.maxblur = .04;
  cam.grade = Object.assign({enabled:false, exposure:1, brightness:0, contrast:1, saturation:1, gamma:1}, cam.grade || {});
  const setCam = (patch, reset) => {
    if(GAME.player.setCameraConfig) GAME.player.setCameraConfig(patch, reset);
    else { Object.assign(cam, patch); GAME.player.applyCameraCfg(); }
    markDirty();
  };
  const sc = section('GAME CAMERA');
  sc.body.appendChild(selectRow('Mode', cam.mode, [
    {value:'free', label:'Default free orbit'},
    {value:'arcade', label:'Arcade follow'},
    {value:'cinematic', label:'Cinematic drift'},
  ], v => setCam({mode:v}, true)).root);
  sc.body.appendChild(selectRow('Aspect ratio', cam.aspect || 'auto', [
    {value:'auto', label:'Auto viewport'},
    {value:'16:9', label:'16:9 widescreen'},
    {value:'21:9', label:'21:9 cinematic'},
    {value:'2.39:1', label:'2.39:1 scope'},
    {value:'4:3', label:'4:3 classic'},
    {value:'1:1', label:'1:1 square'},
    {value:'9:16', label:'9:16 vertical'},
  ], v => setCam({aspect:v})).root);
  sc.body.appendChild(sliderRow('Base FOV', cam.fov, 40, 100, 1, v => setCam({fov:v})).root);
  sc.body.appendChild(sliderRow('Speed FOV gain', cam.fovSpeedGain, 0, .5, .01, v => setCam({fovSpeedGain:v})).root);
  sc.body.appendChild(sliderRow('Free zoom min', cam.minDist, 2, 12, .5, v => setCam({minDist:v})).root);
  sc.body.appendChild(sliderRow('Free zoom max', cam.maxDist, 8, 40, .5, v => setCam({maxDist:v})).root);
  sc.body.appendChild(sliderRow('Arcade distance', cam.arcadeDistance, 4, 18, .25, v => setCam({arcadeDistance:v}), v => (+v).toFixed(2) + ' m').root);
  sc.body.appendChild(sliderRow('Arcade height', cam.arcadeHeight, 1.2, 7, .1, v => setCam({arcadeHeight:v}), v => (+v).toFixed(1) + ' m').root);
  sc.body.appendChild(sliderRow('Arcade smoothness', cam.arcadeLag, 1.5, 12, .1, v => setCam({arcadeLag:v}), v => (+v).toFixed(1)).root);
  sc.body.appendChild(sliderRow('Reverse front speed', cam.reverseFrontSpeed, 1, 16, .25, v => setCam({reverseFrontSpeed:v}), v => (+v).toFixed(1)).root);
  sc.body.appendChild(sliderRow('Drift orbit', cam.cinematicDriftOrbit, 0, .35, .01, v => setCam({cinematicDriftOrbit:v}), v => (+v).toFixed(2)).root);
  sc.body.appendChild(sliderRow('Drift close-up', cam.cinematicDriftClose, 0, 4, .05, v => setCam({cinematicDriftClose:v}), v => (+v).toFixed(2) + ' m').root);
  sc.body.appendChild(sliderRow('Drift height lift', cam.cinematicDriftHeight, 0, 1.8, .05, v => setCam({cinematicDriftHeight:v}), v => (+v).toFixed(2) + ' m').root);
  sc.body.appendChild(sliderRow('Cinematic smoothness', cam.cinematicLag, 1.5, 10, .1, v => setCam({cinematicLag:v}), v => (+v).toFixed(1)).root);
  sc.body.appendChild(sliderRow('View distance', cam.far, 100, 1500, 10, v => setCam({far:v})).root);
  sc.body.appendChild(sliderRow('Fog', cam.fogDensity, 0, .03, .0005, v => setCam({fogDensity:v}), v => (+v).toFixed(4)).root);
  sc.body.appendChild(sliderRow('Impact shake', cam.shake, 0, 2, .05, v => setCam({shake:v})).root);
  box.appendChild(sc.root);

  // DOF
  const sdof = section('DEPTH OF FIELD (DOF)');
  if(!GAME.systems.post || !GAME.systems.post.ok){
    sdof.body.appendChild(el('<div class="lk-hint">Post-processing scripts are not loaded, so DOF is unavailable.</div>'));
  } else {
    const updDof = patch => { Object.assign(cam.dof, patch); GAME.player.applyCameraCfg(); markDirty(); };
    sdof.body.appendChild(checkRow('Enabled in game camera', cam.dof.enabled, v => updDof({enabled:v})).root);
    sdof.body.appendChild(checkRow('Auto focus player', cam.dof.autoFocus !== false, v => updDof({autoFocus:v})).root);
    sdof.body.appendChild(checkRow('Show focus marker', !!cam.dof.showFocus, v => updDof({showFocus:v})).root);
    sdof.body.appendChild(sliderRow('Manual focus distance', cam.dof.focus, .5, 80, .25, v => updDof({focus:v}), v => (+v).toFixed(2) + ' m').root);
    sdof.body.appendChild(sliderRow('Aperture strength', cam.dof.aperture, 0, .12, .001, v => updDof({aperture:v}), v => (+v).toFixed(3)).root);
    sdof.body.appendChild(sliderRow('Max blur', cam.dof.maxblur, 0, .25, .002, v => updDof({maxblur:v}), v => (+v).toFixed(3)).root);
    sdof.body.appendChild(sliderRow('Bokeh highlights', cam.dof.bokeh == null ? 3 : cam.dof.bokeh, 0, 8, .1, v => updDof({bokeh:v}), v => (+v).toFixed(1)).root);
    sdof.body.appendChild(sliderRow('Focus area', cam.dof.focusRadius, .04, .5, .005, v => updDof({focusRadius:v}), v => (+v).toFixed(3)).root);
    sdof.body.appendChild(sliderRow('Blur falloff', cam.dof.feather, .08, .75, .005, v => updDof({feather:v}), v => (+v).toFixed(3)).root);
    sdof.body.appendChild(el('<div class="lk-hint">Visible in Launch Track, Play Preview and Player Camera when post-processing is available.</div>'));
  }
  box.appendChild(sdof.root);

  const sgrade = section('VISUAL GRADE');
  if(!GAME.systems.post || !GAME.systems.post.ok){
    sgrade.body.appendChild(el('<div class="lk-hint">Post-processing scripts are not loaded, so visual grading is unavailable.</div>'));
  } else {
    const updGrade = patch => { Object.assign(cam.grade, patch); GAME.player.applyCameraCfg(); markDirty(); };
    sgrade.body.appendChild(checkRow('Enabled', cam.grade.enabled, v => updGrade({enabled:v})).root);
    sgrade.body.appendChild(sliderRow('Exposure', cam.grade.exposure, .35, 2.4, .01, v => updGrade({exposure:v}), v => (+v).toFixed(2)).root);
    sgrade.body.appendChild(sliderRow('Brightness', cam.grade.brightness, -.35, .35, .01, v => updGrade({brightness:v}), v => (+v).toFixed(2)).root);
    sgrade.body.appendChild(sliderRow('Gamma', cam.grade.gamma, .55, 1.8, .01, v => updGrade({gamma:v}), v => (+v).toFixed(2)).root);
    sgrade.body.appendChild(sliderRow('Contrast', cam.grade.contrast, .45, 1.8, .01, v => updGrade({contrast:v}), v => (+v).toFixed(2)).root);
    sgrade.body.appendChild(sliderRow('Saturation', cam.grade.saturation, 0, 2, .01, v => updGrade({saturation:v}), v => (+v).toFixed(2)).root);
    sgrade.body.appendChild(el('<div class="lk-hint">These controls affect the actual gameplay camera render, including Play Preview.</div>'));
  }
  box.appendChild(sgrade.root);

  // vehicle lights
  if(GAME.player.lights && GAME.player.setLights){
    const sh = section('LUCI VEICOLO', false);
    const lights = GAME.player.lights;
    const upd = patch => { GAME.player.setLights(patch); markDirty(); };
    sh.body.appendChild(el('<div class="lk-hint">Fari anteriori spot e luci posteriori reattive per posizione, freno e retromarcia.</div>'));
    sh.body.appendChild(checkRow('Mostra dummy luci', lights.dummies && lights.dummies.visible, v => { upd({dummies:{visible:v}}); refreshOutliner(); }).root);
    const addVehicleLight = preset => {
      if(!GAME.player.addLight) return;
      const anchor = GAME.player.addLight(preset);
      GAME.player.setLights({dummies:{visible:true}});
      markDirty();
      refreshOutliner();
      if(anchor){
        selectObject(anchor);
        if(ED.tool === 'select') setTool('translate');
      }
    };
    const selectVehicleLight = id => {
      const anchor = GAME.world.registry.find(x => x.userData.editorId === id);
      if(!anchor) return;
      GAME.player.setLights({dummies:{visible:true}});
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    sh.body.appendChild(btnRow([
      {label:'Front L', action:() => selectVehicleLight('player_front_light_0')},
      {label:'Front R', action:() => selectVehicleLight('player_front_light_1')},
      {label:'Pos L', action:() => selectVehicleLight('player_rear_position_0')},
      {label:'Pos R', action:() => selectVehicleLight('player_rear_position_1')},
    ]));
    sh.body.appendChild(btnRow([
      {label:'Brake L', action:() => selectVehicleLight('player_rear_brake_0')},
      {label:'Brake R', action:() => selectVehicleLight('player_rear_brake_1')},
      {label:'Rev L', action:() => selectVehicleLight('player_rear_reverse_0')},
      {label:'Rev R', action:() => selectVehicleLight('player_rear_reverse_1')},
    ]));
    sh.body.appendChild(btnRow([
      {label:'Aux 1', action:() => selectVehicleLight('player_aux_light_0')},
      {label:'Aux 2', action:() => selectVehicleLight('player_aux_light_1')},
    ]));
    sh.body.appendChild(btnRow([
      {label:'+ Freno', action:() => addVehicleLight({condition:'brake', color:0xff2020, intensity:1.6, enabled:true})},
      {label:'+ Retro', action:() => addVehicleLight({condition:'reverse', color:0xf3f4ff, intensity:1.4, enabled:true})},
      {label:'+ Freccia', action:() => addVehicleLight({condition:'left', color:0xffaa18, intensity:1.2, enabled:true})},
      {label:'+ Ausiliaria', action:() => addVehicleLight({condition:'always', color:0xffd166, intensity:1.1, enabled:true})},
    ]));
    sh.body.appendChild(checkRow('Fari anteriori', lights.front.enabled, v => upd({front:{enabled:v}})).root);
    sh.body.appendChild(checkRow('Auto giorno/notte', lights.front.auto, v => upd({front:{auto:v}})).root);
    sh.body.appendChild(sliderRow('Numero fari anteriori', lights.front.count, 1, 2, 1, v => upd({front:{count:Math.round(v)}})).root);
    sh.body.appendChild(colorRow('Colore fari', lights.front.color, v => upd({front:{color:v}})).root);
    sh.body.appendChild(sliderRow('Intensità fari', lights.front.intensity, 0, 6, .05, v => upd({front:{intensity:v}})).root);
    sh.body.appendChild(sliderRow('Distanza fari', lights.front.distance, 5, 80, 1, v => upd({front:{distance:v}})).root);
    sh.body.appendChild(sliderRow('Cono fari', lights.front.angle, .15, 1.1, .01, v => upd({front:{angle:v}}), v => (+v).toFixed(2)).root);
    sh.body.appendChild(checkRow('Glow fari', lights.front.glow, v => upd({front:{glow:v}})).root);
    sh.body.appendChild(checkRow('Bloom fari', lights.front.bloom, v => upd({front:{bloom:v}})).root);
    sh.body.appendChild(sliderRow('Intensità bloom fari', lights.front.bloomIntensity, 0, 1.5, .05, v => upd({front:{bloomIntensity:v}})).root);
    sh.body.appendChild(checkRow('Lens flare fari', lights.front.flare, v => upd({front:{flare:v}})).root);
    sh.body.appendChild(sliderRow('Front glow scale', lights.front.glowSize, .1, 2.2, .05, v => upd({front:{glowSize:v}})).root);
    sh.body.appendChild(sliderRow('Front flare scale', lights.front.flareSize, .1, 2.2, .05, v => upd({front:{flareSize:v}})).root);
    sh.body.appendChild(checkRow('Luci posteriori', lights.rear.enabled, v => upd({rear:{enabled:v}})).root);
    sh.body.appendChild(colorRow('Colore posizione/freno', lights.rear.color, v => upd({rear:{color:v}})).root);
    sh.body.appendChild(sliderRow('Posizione posteriore', lights.rear.baseIntensity, 0, 2, .05, v => upd({rear:{baseIntensity:v}})).root);
    sh.body.appendChild(sliderRow('Freno posteriore', lights.rear.brakeIntensity, 0, 6, .05, v => upd({rear:{brakeIntensity:v}})).root);
    sh.body.appendChild(colorRow('Colore retromarcia', lights.rear.reverseColor, v => upd({rear:{reverseColor:v}})).root);
    sh.body.appendChild(sliderRow('Retromarcia', lights.rear.reverseIntensity, 0, 5, .05, v => upd({rear:{reverseIntensity:v}})).root);
    sh.body.appendChild(checkRow('Glow posteriori', lights.rear.glow, v => upd({rear:{glow:v}})).root);
    sh.body.appendChild(checkRow('Bloom posteriori', lights.rear.bloom, v => upd({rear:{bloom:v}})).root);
    sh.body.appendChild(sliderRow('Intensità bloom posteriori', lights.rear.bloomIntensity, 0, 1.5, .05, v => upd({rear:{bloomIntensity:v}})).root);
    sh.body.appendChild(checkRow('Lens flare posteriori', lights.rear.flare, v => upd({rear:{flare:v}})).root);
    sh.body.appendChild(sliderRow('Rear glow scale', lights.rear.glowSize, .1, 2.2, .05, v => upd({rear:{glowSize:v}})).root);
    sh.body.appendChild(sliderRow('Rear flare scale', lights.rear.flareSize, .1, 2.2, .05, v => upd({rear:{flareSize:v}})).root);
    (lights.aux || []).forEach((aux, idx) => {
      const sa = section('LUCE EXTRA ' + (idx + 1), false);
      const patch = p => { const a = []; a[idx] = p; upd({aux:a}); };
      sa.body.appendChild(btnRow([{label:'Select dummy', action:() => selectVehicleLight('player_aux_light_' + idx)}]));
      sa.body.appendChild(checkRow('Attiva', aux.enabled, v => patch({enabled:v})).root);
      sa.body.appendChild(selectRow('Azione', aux.condition, [
        {value:'always', label:'Sempre'},
        {value:'night', label:'Notte'},
        {value:'brake', label:'Freno'},
        {value:'reverse', label:'Retromarcia'},
        {value:'left', label:'Freccia/Sterzo SX'},
        {value:'right', label:'Freccia/Sterzo DX'},
      ], v => patch({condition:v})).root);
      sa.body.appendChild(colorRow('Colore', aux.color, v => patch({color:v})).root);
      sa.body.appendChild(sliderRow('Intensità', aux.intensity, 0, 6, .05, v => patch({intensity:v})).root);
      sa.body.appendChild(checkRow('Glow', aux.glow, v => patch({glow:v})).root);
      sa.body.appendChild(checkRow('Lens flare', aux.flare, v => patch({flare:v})).root);
    sa.body.appendChild(sliderRow('Effect scale', aux.size, .1, 2.2, .05, v => patch({size:v})).root);
      sh.body.appendChild(sa.root);
    });
    box.appendChild(sh.root);

    const sn = section('NEON SOTTO-SCOCCA', false);
    sn.body.appendChild(el('<div class="lk-hint">Neon tuning presets linked to the vehicle. These sets can be exposed in the game later.</div>'));
    sn.body.appendChild(btnRow([
      {label:'Neon L', action:() => selectVehicleLight('player_neon_left')},
      {label:'Neon R', action:() => selectVehicleLight('player_neon_right')},
      {label:'Neon Front', action:() => selectVehicleLight('player_neon_front')},
      {label:'Neon Rear', action:() => selectVehicleLight('player_neon_rear')},
    ]));
    sn.body.appendChild(checkRow('Neon attivo', lights.neon.enabled, v => upd({neon:{enabled:v}})).root);
    sn.body.appendChild(checkRow('Mostra dummy neon', lights.neon.dummyVisible !== false, v => upd({neon:{dummyVisible:v}})).root);
    sn.body.appendChild(selectRow('Set neon', lights.neon.layout, [
      {value:'none', label:'Nessuno'},
      {value:'sides', label:'Solo lati'},
      {value:'frontRear', label:'Solo avanti/dietro'},
      {value:'all', label:'Tutti e 4 i lati'},
    ], v => upd({neon:{layout:v}})).root);
    sn.body.appendChild(colorRow('Neon colore A', lights.neon.colorA, v => upd({neon:{colorA:v}})).root);
    sn.body.appendChild(colorRow('Neon colore B', lights.neon.colorB, v => upd({neon:{colorB:v}})).root);
    sn.body.appendChild(sliderRow('Intensità neon', lights.neon.intensity, 0, 4, .05, v => upd({neon:{intensity:v}})).root);
    sn.body.appendChild(sliderRow('Spill luce neon', lights.neon.spill == null ? 2.8 : lights.neon.spill, .4, 8, .1, v => upd({neon:{spill:v}}), v => (+v).toFixed(1) + 'm').root);
    sn.body.appendChild(checkRow('Ombre neon', !!lights.neon.shadows, v => upd({neon:{shadows:v}})).root);
    sn.body.appendChild(selectRow('Animazione neon', lights.neon.animation, [
      {value:'static', label:'Statico'},
      {value:'pulse', label:'Pulse'},
      {value:'alternate', label:'Alternato'},
      {value:'chase', label:'Chase'},
    ], v => upd({neon:{animation:v}})).root);
    sn.body.appendChild(sliderRow('Velocità animazione', lights.neon.speed, .1, 4, .05, v => upd({neon:{speed:v}})).root);
    box.appendChild(sn.root);
  }

  if(GAME.player.exhaust && GAME.player.setExhaust){
    const sx = section('SCARICO / FUMO', false);
    const ex = GAME.player.exhaust;
    const updEx = patch => { GAME.player.setExhaust(patch); markDirty(); };
    const selectExhaust = id => {
      const anchor = GAME.world.registry.find(x => x.userData.editorId === id);
      if(!anchor) return;
      GAME.player.setExhaust({dummyVisible:true});
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    const addExhaust = () => {
      if(!GAME.player.addExhaust) return;
      const anchor = GAME.player.addExhaust({enabled:true});
      GAME.player.setExhaust({dummyVisible:true});
      markDirty();
      refreshOutliner();
      if(anchor){
        selectObject(anchor);
        if(ED.tool === 'select') setTool('translate');
      }
    };
  sx.body.appendChild(el('<div class="lk-hint">Sources attached to the vehicle: place them on the exhaust. Smoke follows throttle, shifting and limiter.</div>'));
    sx.body.appendChild(btnRow([
      {label:'+ Sorgente scarico', action:addExhaust},
      {label:'Prova fumo/fuoco', action:() => { if(GAME.player.testExhaust) GAME.player.testExhaust(); }},
    ]));
    sx.body.appendChild(checkRow('Scarico attivo', ex.enabled, v => updEx({enabled:v})).root);
    sx.body.appendChild(checkRow('Mostra dummy scarico', ex.dummyVisible !== false, v => updEx({dummyVisible:v})).root);
    sx.body.appendChild(checkRow('Fumo accelerazione', ex.smoke !== false, v => updEx({smoke:v})).root);
    sx.body.appendChild(checkRow('Fumo minimo da fermo', ex.idleSmoke !== false, v => updEx({idleSmoke:v})).root);
    sx.body.appendChild(sliderRow('Intensità', ex.intensity, 0, 4, .05, v => updEx({intensity:v})).root);
    sx.body.appendChild(sliderRow('Soglia acceleratore', ex.smokeThrottle, 0, 1, .01, v => updEx({smokeThrottle:v}), v => Math.round(v * 100) + '%').root);
    sx.body.appendChild(checkRow('Sparo fuoco', ex.fire !== false, v => updEx({fire:v})).root);
    sx.body.appendChild(sliderRow('Giri fuoco', ex.fireRpm, .55, 1.08, .01, v => updEx({fireRpm:v}), v => Math.round(v * 100) + '%').root);
    sx.body.appendChild(checkRow('Fuoco al cambio', ex.shiftFire !== false, v => updEx({shiftFire:v})).root);
    sx.body.appendChild(checkRow('Fuoco limitatore', ex.limiterFire !== false, v => updEx({limiterFire:v})).root);
    (ex.sources || []).forEach((src, idx) => {
      const ss = section('SORGENTE SCARICO ' + (idx + 1), false);
      const patch = p => { const a = []; a[idx] = p; updEx({sources:a}); };
      ss.body.appendChild(btnRow([
        {label:'Select dummy', action:() => selectExhaust('player_exhaust_' + idx)},
        {label:'Prova da qui', action:() => {
          const anchor = GAME.world.registry.find(x => x.userData.editorId === 'player_exhaust_' + idx);
          if(anchor) selectExhaust('player_exhaust_' + idx);
          if(GAME.player.testExhaust) GAME.player.testExhaust(anchor);
        }},
      ]));
      ss.body.appendChild(checkRow('Attiva sorgente', src.enabled !== false, v => patch({enabled:v, userDisabled:!v})).root);
      sx.body.appendChild(ss.root);
    });
    box.appendChild(sx.root);
  }

  if(GAME.player.dataWidgets && GAME.player.setDataWidgets){
    const dw = GAME.player.dataWidgets;
    const sw = section('3D DATA WIDGETS', false);
    const updWidget = (idx, patch) => {
      const items = [];
      items[idx] = patch;
      GAME.player.setDataWidgets({items});
      markDirty();
    };
    const selectWidget = key => {
      const anchor = GAME.world.registry.find(x => x.userData.editorId === 'player_data_' + key);
      if(!anchor) return;
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    sw.body.appendChild(el('<div class="lk-hint">Floating data text attached to the player. Move each widget with the gizmo, like vehicle lights.</div>'));
    sw.body.appendChild(checkRow('Show helpers in editor', dw.visibleInEditor !== false, v => {
      GAME.player.setDataWidgets({visibleInEditor:v});
      markDirty();
    }).root);
    (dw.items || []).forEach((item, idx) => {
      const ws = section('WIDGET ' + (item.label || item.key), false);
      ws.body.appendChild(btnRow([{label:'Select widget', action:() => selectWidget(item.key)}]));
      ws.body.appendChild(checkRow('Enabled', !!item.enabled, v => updWidget(idx, {enabled:v})).root);
      ws.body.appendChild(selectRow('Metric', item.metric, [
        {value:'driftPoints', label:'Drift points'},
        {value:'gForce', label:'G-force'},
        {value:'speed', label:'Speed KM/H'},
        {value:'rpm', label:'RPM'},
      ], v => updWidget(idx, {metric:v})).root);
      ws.body.appendChild(checkRow('Dynamic drift side', !!item.dynamicSide, v => updWidget(idx, {dynamicSide:v})).root);
      ws.body.appendChild(sliderRow('Mirror center X', item.mirrorCenterX || 0, -1.5, 1.5, .01, v => updWidget(idx, {mirrorCenterX:v}), v => (+v).toFixed(2)).root);
      ws.body.appendChild(sliderRow('Scale', item.scale == null ? 1 : item.scale, .25, 2.5, .05, v => updWidget(idx, {scale:v}), v => (+v).toFixed(2)).root);
      ws.body.appendChild(sliderRow('Opacity', item.opacity == null ? .95 : item.opacity, .1, 1, .01, v => updWidget(idx, {opacity:v}), v => Math.round(v*100) + '%').root);
      const color = item.color && item.color[0] === '#' ? parseInt(item.color.slice(1), 16) : 0xffd166;
      ws.body.appendChild(colorRow('Color', color, v => updWidget(idx, {color:'#' + ('000000' + v.toString(16)).slice(-6)})).root);
      sw.body.appendChild(ws.root);
    });
    box.appendChild(sw.root);
  }

  // driving tuning
  const sg = section('GUIDA (SETUP)', false);
  const tun = GAME.player.tuning.values;
  const tRow = (key, label, min, max) => sliderRow(label, tun[key], min, max, 1, v => {
    const patch = {}; patch[key] = v;
    GAME.player.setTuning(patch); markDirty();
  }).root;
  sg.body.appendChild(tRow('torque', 'Coppia', 0, 10));
  sg.body.appendChild(tRow('maxSpeed', 'Vel. massima', 0, 10));
  sg.body.appendChild(tRow('oversteer', 'Sovrasterzo', -10, 10));
  sg.body.appendChild(tRow('handbrake', 'Freno a mano', -10, 10));
  sg.body.appendChild(tRow('steer', 'Sterzo', -10, 10));
  sg.body.appendChild(tRow('brake', 'Frenata', -10, 10));
  sg.body.appendChild(tRow('grip', 'Aderenza', -10, 10));
  box.appendChild(sg.root);

  // model
  const sm = section('MODELLO 3D', false);
  sm.body.appendChild(el('<div class="lk-hint">' + (GAME.player.getModel() ? 'Modello GLB caricato' : 'Corpo procedurale (nessun GLB)') + '</div>'));
  sm.body.appendChild(btnRow([{label:'📦 Replace GLB model...', action:() => $('#lkPlayerModelInput').click()}]));
  box.appendChild(sm.root);

  // engine sound set (sample-based)
  const snd = section('ENGINE SOUND', false);
  const SS = STORE.soundSets;
  if(!SS){
    snd.body.appendChild(el('<div class="lk-empty">Sound sets non disponibili.</div>'));
  } else {
    const assigned = GAME.player.engineAudio && GAME.player.engineAudio.setId;
    const sets = SS.list();
    const sel = document.createElement('select');
    sel.className = 'lk-soundset-select';
    sel.appendChild(new Option('— synth procedurale (nessun set) —', ''));
    for(const s of sets) sel.appendChild(new Option(s.name, s.id, false, s.id === assigned));
    sel.value = assigned || '';
    sel.addEventListener('change', () => {
      GAME.player.setEngineSound(sel.value || null);
      markDirty();
      status(sel.value ? 'Sound set "' + sel.options[sel.selectedIndex].text + '" assegnato al veicolo' : 'Motore in fallback sintetico');
      buildInspector();
    });
    snd.body.appendChild(sel);
    const eaStatus = GAME.systems.engineAudio ? GAME.systems.engineAudio.slotStatus() : null;
    if(assigned && eaStatus){
      const bad = [];
      const scan = (obj, prefix) => { for(const k in obj){ if(obj[k].status === 'error') bad.push(prefix + k); } };
      scan(eaStatus.layers || {}, 'layer ');
      scan(eaStatus.events || {}, 'evento ');
      for(const b of ['on', 'off']) (eaStatus.banks[b] || []).forEach((s, i) => { if(s.status === 'error') bad.push('loop ' + b.toUpperCase() + ' #' + (i + 1)); });
      snd.body.appendChild(el('<div class="lk-hint">' + (bad.length
        ? '⚠ ' + bad.length + ' sample non caricati (' + bad.slice(0, 3).join(', ') + (bad.length > 3 ? '…' : '') + ') → fallback sintetico'
        : (eaStatus.engineReady ? '● Set attivo, sample caricati' : '… caricamento sample in corso')) + '</div>'));
    } else {
      snd.body.appendChild(el('<div class="lk-hint">Nessun set assegnato: il motore usa il synth procedurale.</div>'));
    }
    snd.body.appendChild(btnRow([
      {label:'🎛 Sound Designer', action:() => openSoundDesigner(assigned || null)},
      {label:'＋ Nuovo set', action:async () => {
        const name = await promptEditorAction({title:'New engine sound set', message:'Nome del nuovo sound set:', value:'New Engine Sound', okText:'Create'});
        if(!name || !name.trim()) return;
        const id = SS.create(name.trim());
        if(!id){ status('⚠ Creazione set fallita'); return; }
        GAME.player.setEngineSound(id);
        markDirty();
        buildInspector();
        openSoundDesigner(id);
      }},
    ]));
    snd.body.appendChild(el('<div class="lk-hint">I set sono asset del progetto: li trovi anche nel tab Assets e li puoi riusare su piu veicoli/livelli.</div>'));
  }
  box.appendChild(snd.root);

  box.appendChild(btnRow([{label:'🔍 Focus', action: focusSelected}]));
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

function buildHudInspector(box){
  const hud = GAME.ui && GAME.ui.radioHud;
  const setHud = GAME.ui && GAME.ui.setRadioHud;
  if(!hud || !setHud){
    box.appendChild(el('<div class="lk-empty">HUD radio non disponibile.</div>'));
    return;
  }
  const upd = patch => {
    setHud(patch);
    if(GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(true);
    markDirty();
  };
  box.appendChild(el('<div class="lk-head"><span class="lk-head-ic">▣</span><span class="lk-bp-title">HUD / RADIO TAB</span><span class="lk-head-id">soundhud.png · dynamic UI</span></div>'));

  const sp = section('PREVIEW / STATO', false);
  sp.body.appendChild(checkRow('Attiva in gioco con TAB', hud.enabled, v => upd({enabled:v})).root);
  sp.body.appendChild(btnRow([
    {label:'Add to game', action:() => upd({enabled:true})},
    {label:'Rimuovi dal gioco', action:() => upd({enabled:false})},
  ]));
  sp.body.appendChild(btnRow([
    {label:'Mostra preview', action:() => { if(GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(true); }},
    {label:'Nascondi preview', action:() => { if(GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false); }},
  ]));
  sp.body.appendChild(btnRow([
    {label:'Edit Frame PNG', action:() => upd({editTarget:'frame'})},
    {label:'Edit Interfaccia', action:() => upd({editTarget:'screen'})},
    {label:'Edit Pulsanti', action:() => upd({editTarget:'buttons', buttonLayer:10})},
  ]));
  sp.body.appendChild(el('<div class="lk-hint">In gioco resta TAB + slow-motion. In editor la preview resta ferma per poterla impaginare.</div>'));
  box.appendChild(sp.root);

  const radioApi = GAME.systems && GAME.systems.radio;
  const menuApi = GAME.systems && GAME.systems.menuMusic;
  box.appendChild(musicLibrarySection('GAME RADIO LIBRARY', radioApi));
  box.appendChild(musicLibrarySection('MENU MUSIC LIBRARY', menuApi));

  const si = section('PNG FRAME', false);
  let lock = true;
  const lockRow = checkRow('Proporzioni bloccate', true, v => { lock = v; });
  si.body.appendChild(lockRow.root);
  si.body.appendChild(sliderRow('Posizione X frame', hud.frameX == null ? 50 : hud.frameX, 5, 95, .1, v => upd({frameX:v}), v => (+v).toFixed(1) + '%').root);
  si.body.appendChild(sliderRow('Altezza dal basso', hud.frameY == null ? 2 : hud.frameY, 0, 60, .1, v => upd({frameY:v}), v => (+v).toFixed(1) + 'vh').root);
  si.body.appendChild(sliderRow('Larghezza PNG', hud.width, 280, 1400, 10, v => upd({width:v})).root);
  si.body.appendChild(sliderRow('PNG X scale', hud.pngScaleX, .45, 1.8, .01, v => {
    upd(lock ? {pngScaleX:v, pngScaleY:v} : {pngScaleX:v});
  }, v => (+v).toFixed(2)).root);
  si.body.appendChild(sliderRow('PNG Y scale', hud.pngScaleY, .45, 1.8, .01, v => {
    upd(lock ? {pngScaleX:v, pngScaleY:v} : {pngScaleY:v});
  }, v => (+v).toFixed(2)).root);
  box.appendChild(si.root);

  const ss = section('INTERFACCIA DINAMICA', false);
  ss.body.appendChild(sliderRow('Left %', hud.screenLeft, -20, 40, .1, v => upd({screenLeft:v}), v => (+v).toFixed(1) + '%').root);
  ss.body.appendChild(sliderRow('Top %', hud.screenTop, -20, 40, .1, v => upd({screenTop:v}), v => (+v).toFixed(1) + '%').root);
  ss.body.appendChild(sliderRow('Width %', hud.screenWidth, 20, 130, .1, v => upd({screenWidth:v}), v => (+v).toFixed(1) + '%').root);
  ss.body.appendChild(sliderRow('Height %', hud.screenHeight, 20, 130, .1, v => upd({screenHeight:v}), v => (+v).toFixed(1) + '%').root);
  box.appendChild(ss.root);

  const sb = section('PULSANTI (VOL− / VOL+ / BASS)', false);
  sb.body.appendChild(el('<div class="lk-hint">Cerchietti cliccabili sopra il frame: posizionali sui pulsanti disegnati nella PNG. Con "Edit Pulsanti" li trascini e ridimensioni direttamente nella preview.</div>'));
  sb.body.appendChild(btnRow([
    {label:'Mostra e modifica', action:() => upd({editTarget:'buttons', buttonLayer:10})},
    {label:'Porta davanti', action:() => upd({buttonLayer:10})},
  ]));
  const knobNames = {volDown:'VOL −', volUp:'VOL +', bass:'BASS BOOST'};
  for(const k of Object.keys(knobNames)){
    const kb = (hud.buttons && hud.buttons[k]) || {x:15, y:80, size:5.5};
    sb.body.appendChild(sliderRow(knobNames[k] + ' · X', kb.x, 0, 100, .1, v => upd({buttons:{[k]:{x:v}}}), v => (+v).toFixed(1) + '%').root);
    sb.body.appendChild(sliderRow(knobNames[k] + ' · Y', kb.y, 0, 100, .1, v => upd({buttons:{[k]:{y:v}}}), v => (+v).toFixed(1) + '%').root);
    sb.body.appendChild(sliderRow(knobNames[k] + ' · Size', kb.size, 2, 25, .1, v => upd({buttons:{[k]:{size:v}}}), v => (+v).toFixed(1) + '%').root);
  }
  sb.body.appendChild(sliderRow('Opacità in gioco', hud.buttonOpacity == null ? .22 : hud.buttonOpacity, 0, 1, .01, v => upd({buttonOpacity:v}), v => Math.round(v*100) + '%').root);
  const radio = GAME.systems && GAME.systems.radio;
  if(radio && radio.setPlayerVol){
    sb.body.appendChild(btnRow([
      {label:'Test VOL −', action:() => radio.setPlayerVol(radio.getPlayerVol() - 1)},
      {label:'Test VOL +', action:() => radio.setPlayerVol(radio.getPlayerVol() + 1)},
      {label:'Test BASS', action:() => radio.setBass((radio.getBass() + 1) % 4)},
    ]));
  }
  box.appendChild(sb.root);

  const sl = section('LAYER ORDER', false);
  const screenAbove = (hud.screenLayer|0) >= (hud.imageLayer|0);
  sl.body.appendChild(el('<div class="lk-hint">Decidi l\'ordine visuale di PNG e interfaccia. I target cliccabili VOL/BASS restano sempre sopra a tutto anche se il layer pulsanti viene impostato basso.</div>'));
  sl.body.appendChild(btnRow([
    {label:'Interfaccia sopra', action:() => upd({imageLayer:1, screenLayer:2})},
    {label:'PNG sopra', action:() => upd({imageLayer:3, screenLayer:2})},
    {label:'Pulsanti sopra tutto', action:() => upd({buttonLayer:10})},
  ]));
  sl.body.appendChild(sliderRow('Layer PNG', hud.imageLayer, 0, 10, 1, v => upd({imageLayer:Math.round(v)})).root);
  sl.body.appendChild(sliderRow('Layer interfaccia', hud.screenLayer, 0, 10, 1, v => upd({screenLayer:Math.round(v)})).root);
  sl.body.appendChild(sliderRow('Layer pulsanti', hud.buttonLayer == null ? 8 : hud.buttonLayer, 0, 12, 1, v => upd({buttonLayer:Math.round(v)})).root);
  sl.body.appendChild(el('<div class="lk-hint">Ora: ' + (screenAbove ? 'interfaccia sopra al PNG' : 'PNG sopra all\'interfaccia') + ' · click pulsanti sempre sopra.</div>'));
  box.appendChild(sl.root);
}

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
