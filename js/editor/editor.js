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
function restoreFloatingPanels(){ return editorLayout.restoreFloatingPanels(); }
function panelWidth(side){ return editorLayout.panelWidth(side); }
function editorViewportRect(){ return editorLayout.editorViewportRect(); }
function clampPanelPos(pos, w, h){ return editorLayout.clampPanelPos(pos, w, h); }
function clearHoverPickHelper(){ if(viewportPicking) viewportPicking.clearHover(); }
window.LK_EDITOR_CORE.installCanvasViewportRectOverride(canvas, ED, editorViewportRect);
visualHelpers = window.LK_EDITOR_VISUAL_HELPERS && window.LK_EDITOR_VISUAL_HELPERS.create({
  THREE, ED, helperGroup,
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
});
function flyStart(e){ return flyCamera.flyStart(e); }
function flyMove(e){ return flyCamera.flyMove(e); }
function syncOrbitAfterFly(){ return flyCamera.syncOrbitAfterFly(); }
function flyEnd(e){ return flyCamera.flyEnd(e); }
function flyUpdate(dt){ return flyCamera.flyUpdate(dt); }
gizmoControls = window.LK_EDITOR_GIZMO_CONTROLS && window.LK_EDITOR_GIZMO_CONTROLS.create({
  THREE, ED, root, $, scene, camE, renderer, gizmoProxy, zUpGizmoQuat, fly,
  getGizmo: () => gizmo,
  setGizmo: value => { gizmo = value; },
  getOrbit: () => orbit,
  setOrbit: value => { orbit = value; },
  isGizmoUsingZUpProxy: () => gizmoUsingZUpProxy,
  setGizmoUsingZUpProxy: value => { gizmoUsingZUpProxy = !!value; },
  setGizmoPointerActive: value => { gizmoPointerActive = !!value; },
  setGizmoSuppressSceneClick: value => { gizmoSuppressSceneClick = !!value; },
  beginTransformHistory,
  commitTransformHistory,
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
editorLayout = window.LK_EDITOR_LAYOUT && window.LK_EDITOR_LAYOUT.create({
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
  hasReplaceDropHelper: () => !!getReplaceDropHelper(),
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
inspectorController = window.LK_EDITOR_INSPECTOR_CONTROLLER && window.LK_EDITOR_INSPECTOR_CONTROLLER.create({
  THREE,
  STORE,
  ED,
  tf,
  insp,
  el,
  section,
  btnRow,
  status,
  objectInspector,
  hudInspector,
  environmentInspector,
  playerCameraInspector,
  playerLightsInspector,
  playerAttachmentsInspector,
  playerSetupInspector,
  copyPlayerBlueprintAsset,
  currentPlayerBlueprint,
  applyPlayerBlueprintAsset,
  setSpawnHere,
  onGizmoChange,
  beginTransformHistory,
  commitTransformHistory,
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
  closeMenu,
  updateEditorControls,
  editorViewportRect,
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
