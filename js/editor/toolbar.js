/* =========================================================
   LOT KING — EDITOR TOOLBAR
   Wires topbar buttons to editor callbacks.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const root = deps.root;
  const ED = deps.ED;
  const $ = deps.$;
  const THREE = deps.THREE;
  const getGizmo = deps.getGizmo || (() => null);
  const getPlayableExport = deps.getPlayableExport || (() => null);
  const getCamHelper = deps.getCamHelper || (() => null);
  const getCamRigHelper = deps.getCamRigHelper || (() => null);
  const getCamRigLine = deps.getCamRigLine || (() => null);
  if(!root || !ED || !$) return null;

  $('#lkSpace').addEventListener('click', () => {
    ED.space = ED.space === 'world' ? 'local' : (ED.space === 'local' ? 'engine' : 'world');
    const gizmo = getGizmo();
    if(gizmo) gizmo.setSpace(deps.transformControlsSpace());
    deps.updateEditorAxesConvention();
  });

  $('#lkSnap').addEventListener('click', () => {
    ED.snap = !ED.snap;
    deps.syncToolbarState();
    const gizmo = getGizmo();
    if(gizmo){
      gizmo.setTranslationSnap(ED.snap ? ED.snapMove : null);
      gizmo.setRotationSnap(ED.snap ? THREE.MathUtils.degToRad(ED.snapRot) : null);
      gizmo.setScaleSnap(ED.snap ? ED.snapScale : null);
    }
  });

  $('#lkSnapMove').addEventListener('change', e => {
    ED.snapMove = Math.max(.01, +e.target.value || 1);
    const gizmo = getGizmo();
    if(gizmo && ED.snap) gizmo.setTranslationSnap(ED.snapMove);
  });

  $('#lkSnapRot').addEventListener('change', e => {
    ED.snapRot = Math.max(1, +e.target.value || 15);
    const gizmo = getGizmo();
    if(gizmo && ED.snap) gizmo.setRotationSnap(THREE.MathUtils.degToRad(ED.snapRot));
  });

  $('#lkSnapScale').addEventListener('change', e => {
    ED.snapScale = Math.max(.01, +e.target.value || .1);
    const gizmo = getGizmo();
    if(gizmo && ED.snap) gizmo.setScaleSnap(ED.snapScale);
  });

  $('#lkGrid').addEventListener('click', () => {
    deps.setGrid(!ED.gridOn);
  });
  const gridSize = $('#lkGridSize');
  if(gridSize) gridSize.addEventListener('change', e => {
    ED.gridSize = Math.max(20, +e.target.value || 240);
    ED.gridInfinite = false;
    if(deps.applyGridSize) deps.applyGridSize();
  });
  const gridInfinite = $('#lkGridInfinite');
  if(gridInfinite) gridInfinite.addEventListener('click', () => {
    ED.gridInfinite = !ED.gridInfinite;
    if(deps.applyGridSize) deps.applyGridSize();
  });

  $('#lkCamHelper').addEventListener('click', () => {
    ED.camHelperOn = !ED.camHelperOn;
    deps.syncToolbarState();
    const camHelper = getCamHelper();
    const camRigHelper = getCamRigHelper();
    const camRigLine = getCamRigLine();
    if(camHelper) camHelper.visible = ED.camHelperOn;
    if(camRigHelper) camRigHelper.visible = ED.camHelperOn;
    if(camRigLine) camRigLine.visible = ED.camHelperOn;
  });

  $('#lkPipToggle').addEventListener('click', () => {
    ED.pipOn = !ED.pipOn;
    deps.syncToolbarState();
    if(!ED.pipOn) $('#lkPipFrame').classList.remove('on');
  });

  $('#lkAddMenu').addEventListener('click', e => deps.openMenu(deps.addMenuItems(deps.spawnPointAhead()), e.clientX, e.clientY));
  root.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => deps.setTool(b.dataset.tool)));
  $('#lkUndo').addEventListener('click', deps.undo);
  $('#lkRedo').addEventListener('click', deps.redo);
  $('#lkSave').addEventListener('click', deps.saveScene);
  $('#lkNewTrack').addEventListener('click', deps.newTrack);
  $('#lkSaveAsTrack').addEventListener('click', deps.saveAsTrack);
  $('#lkLevels').addEventListener('click', () => deps.setLevelsOverlayOpen(!ED.levelsOpen));
  $('#lkLevelsClose').addEventListener('click', () => deps.setLevelsOverlayOpen(false));
  $('#lkLevelsNew').addEventListener('click', deps.newTrack);
  $('#lkLevelsFromFile').addEventListener('click', () => $('#lkProjectInput').click());
  $('#lkProjectInput').addEventListener('change', e => deps.importProjectFile(e.target.files && e.target.files[0]));

  $('#lkResetScene').addEventListener('click', () => {
    deps.confirmEditorAction({title:'Reset level?', message:'Reload the current level and lose unsaved changes?', okText:'Reset', danger:false})
      .then(ok => { if(ok) location.reload(); });
  });

  $('#lkExportProject').addEventListener('click', deps.exportProject);
  $('#lkExportPlayableLegacy').addEventListener('click', () => {
    const playableExport = getPlayableExport();
    if(playableExport) playableExport.exportCurrentPlayableProject();
  });
  $('#lkImportProject').addEventListener('click', () => $('#lkProjectInput').click());
  $('#lkExportPlayable').addEventListener('click', () => {
    const playableExport = getPlayableExport();
    if(playableExport) playableExport.exportCurrentPlayableProjectZip();
  });
  $('#lkPlay').addEventListener('click', () => ED.playPreview ? deps.stopPlayPreview() : deps.startPlayPreview());
  $('#lkExit').addEventListener('click', () => deps.exitEditor(false));

  const hudToggle = document.getElementById('videoEditorHud');
  if(hudToggle){
    document.body.classList.toggle('editor-hud-hidden', !hudToggle.checked);
    hudToggle.addEventListener('change', () => {
      document.body.classList.toggle('editor-hud-hidden', !hudToggle.checked);
      deps.restoreFloatingPanels();
    });
  }

  return Object.freeze({});
}

window.LK_EDITOR_TOOLBAR = Object.freeze({create});
})();
