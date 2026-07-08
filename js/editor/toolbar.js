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
  const vpFold = $('#lkViewportToolbarFold');
  const vpSingle = $('#lkViewportSingle');
  const vpQuad = $('#lkViewportQuad');
  if(vpFold) vpFold.addEventListener('click', () => {
    ED.viewportToolbarCollapsed = !ED.viewportToolbarCollapsed;
    root.classList.toggle('viewport-toolbar-collapsed', ED.viewportToolbarCollapsed);
    vpFold.textContent = ED.viewportToolbarCollapsed ? '▾' : '▴';
    vpFold.title = ED.viewportToolbarCollapsed ? 'Expand viewport tools' : 'Collapse viewport tools';
  });
  if(vpSingle) vpSingle.addEventListener('click', () => {
    ED.viewportMode = 'single';
    ED.activeViewportSlot = 0;
    vpSingle.classList.add('on');
    if(vpQuad) vpQuad.classList.remove('on');
  });
  if(vpQuad) vpQuad.addEventListener('click', () => {
    ED.viewportMode = 'quad';
    vpQuad.classList.add('on');
    if(vpSingle) vpSingle.classList.remove('on');
    ED.pipMinimized = true;
  });
  const vpRender = $('#lkViewportRenderMode');
  if(vpRender) vpRender.addEventListener('change', () => {
    const slot = ED.viewportMode === 'quad' ? Math.max(0, Math.min(3, ED.activeViewportSlot || 0)) : 0;
    ED.viewportRenderModes[slot] = vpRender.value || 'normal';
  });
  const vpOptions = $('#lkViewportOptions');
  const vpOptionsMenu = $('#lkViewportOptionsMenu');
  const vpOptionsWrap = vpOptions && vpOptions.closest ? vpOptions.closest('.lk-viewport-options') : null;
  const vpCollisionDummies = $('#lkShowCollisionDummies');
  function syncViewportOptions(){
    if(vpCollisionDummies) vpCollisionDummies.checked = ED.showCollisionDummies !== false;
    if(vpOptions) vpOptions.classList.toggle('on', ED.showCollisionDummies !== false);
  }
  if(vpOptions && vpOptionsWrap) vpOptions.addEventListener('click', e => {
    e.stopPropagation();
    vpOptionsWrap.classList.toggle('open');
  });
  if(vpOptionsMenu) vpOptionsMenu.addEventListener('click', e => e.stopPropagation());
  document.addEventListener('click', () => {
    if(vpOptionsWrap) vpOptionsWrap.classList.remove('open');
  });
  if(vpCollisionDummies) vpCollisionDummies.addEventListener('change', () => {
    ED.showCollisionDummies = !!vpCollisionDummies.checked;
    syncViewportOptions();
    if(deps.updateSelectionAndDropHelpers) deps.updateSelectionAndDropHelpers();
  });
  syncViewportOptions();
  const vpFps = $('#lkViewportFps');
  if(vpFps) vpFps.addEventListener('click', () => {
    ED.showFps = !ED.showFps;
    vpFps.classList.toggle('on', ED.showFps);
  });
  const vpPerf = $('#lkViewportPerf');
  if(vpPerf) vpPerf.addEventListener('click', () => {
    ED.showPerf = !ED.showPerf;
    vpPerf.classList.toggle('on', ED.showPerf);
  });
  const pipMin = $('#lkPipMinimize');
  if(pipMin) pipMin.addEventListener('click', e => {
    e.stopPropagation();
    ED.pipMinimized = !ED.pipMinimized;
    pipMin.textContent = ED.pipMinimized ? '+' : '−';
    pipMin.title = ED.pipMinimized ? 'Expand player camera' : 'Minimize player camera';
  });
  const cinemaPreviewMin = $('#lkCinemaPreviewMinimize');
  if(cinemaPreviewMin) cinemaPreviewMin.addEventListener('click', e => {
    e.stopPropagation();
    ED.cinemaFloatPreviewMinimized = !ED.cinemaFloatPreviewMinimized;
    cinemaPreviewMin.textContent = ED.cinemaFloatPreviewMinimized ? '+' : '−';
    cinemaPreviewMin.title = ED.cinemaFloatPreviewMinimized ? 'Expand timeline preview' : 'Minimize timeline preview';
  });
  const cinemaPreviewClose = $('#lkCinemaPreviewClose');
  if(cinemaPreviewClose) cinemaPreviewClose.addEventListener('click', e => {
    e.stopPropagation();
    ED.cinemaFloatPreviewOn = false;
    const frame = $('#lkCinemaPreviewFrame');
    if(frame) frame.classList.remove('on');
  });

  $('#lkAddMenu').addEventListener('click', e => deps.openMenu(deps.addMenuItems(deps.spawnPointAhead()), e.clientX, e.clientY));
  root.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => deps.setTool(b.dataset.tool)));
  $('#lkUndo').addEventListener('click', deps.undo);
  $('#lkRedo').addEventListener('click', deps.redo);
  $('#lkSave').addEventListener('click', () => deps.saveScene({projectFile:true}));
  $('#lkNewTrack').addEventListener('click', deps.newTrack);
  $('#lkSaveAsTrack').addEventListener('click', deps.saveAsTrack);
  $('#lkProjects').addEventListener('click', () => deps.setProjectsOverlayOpen(!ED.projectsOpen));
  $('#lkProjectsClose').addEventListener('click', () => deps.setProjectsOverlayOpen(false));
  $('#lkProjectsNew').addEventListener('click', deps.createBrowserProject);
  $('#lkProjectsFromFile').addEventListener('click', () => { deps.setProjectImportTarget('project'); $('#lkProjectInput').click(); });
  $('#lkLevels').addEventListener('click', () => deps.setLevelsOverlayOpen(!ED.levelsOpen));
  $('#lkLevelsClose').addEventListener('click', () => deps.setLevelsOverlayOpen(false));
  $('#lkLevelsNew').addEventListener('click', deps.newTrack);
  $('#lkLevelsFromFile').addEventListener('click', () => { deps.setProjectImportTarget('level'); $('#lkProjectInput').click(); });
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
  $('#lkImportProject').addEventListener('click', () => { deps.setProjectImportTarget('project'); $('#lkProjectInput').click(); });
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
