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
  const tr = (en, it) => deps.lang && deps.lang() === 'it' ? (it || en) : en;
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
  let quadLoadingTimer = 0;
  const setQuadLoading = (open, pct, step) => {
    if(deps.setEditorLoading) deps.setEditorLoading(open, tr('PREPARING VIEWPORTS', 'PREPARAZIONE VIEWPORT'), tr('Quad View', 'Quattro viste'), pct, step);
    else if(deps.setLevelLoading) deps.setLevelLoading(open, 'Quad View', pct, step);
  };
  if(vpFold) vpFold.addEventListener('click', () => {
    ED.viewportToolbarCollapsed = !ED.viewportToolbarCollapsed;
    root.classList.toggle('viewport-toolbar-collapsed', ED.viewportToolbarCollapsed);
    vpFold.textContent = ED.viewportToolbarCollapsed ? '▾' : '▴';
    vpFold.title = ED.viewportToolbarCollapsed ? 'Expand viewport tools' : 'Collapse viewport tools';
  });
  if(vpSingle) vpSingle.addEventListener('click', () => {
    ED.viewportTransitionSeq = (ED.viewportTransitionSeq || 0) + 1;
    clearTimeout(quadLoadingTimer);
    delete ED.viewportQuadWarmupStep;
    ED.viewportTransitioning = false;
    if(vpQuad) vpQuad.disabled = false;
    setQuadLoading(false, 100, tr('Ready', 'Pronto'));
    ED.viewportMode = 'single';
    ED.activeViewportSlot = 0;
    vpSingle.classList.add('on');
    if(vpQuad) vpQuad.classList.remove('on');
  });
  if(vpQuad) vpQuad.addEventListener('click', () => {
    if(ED.viewportMode === 'quad' || ED.viewportTransitioning) return;
    const transitionSeq = ED.viewportTransitionSeq = (ED.viewportTransitionSeq || 0) + 1;
    ED.viewportTransitioning = true;
    vpQuad.disabled = true;
    setQuadLoading(true, 8, tr('Preparing four independent viewports', 'Preparazione di quattro viewport indipendenti'));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if(transitionSeq !== ED.viewportTransitionSeq || !ED.viewportTransitioning) return;
      ED.viewportQuadWarmupStep = 0;
      ED.viewportMode = 'quad';
      vpQuad.classList.add('on');
      if(vpSingle) vpSingle.classList.remove('on');
      ED.pipMinimized = true;
      if(deps.requestWarmup) deps.requestWarmup(tr('Preparing Quad View...', 'Preparazione quattro viste...'));
      clearTimeout(quadLoadingTimer);
      quadLoadingTimer = setTimeout(() => {
        if(transitionSeq !== ED.viewportTransitionSeq || !ED.viewportTransitioning) return;
        delete ED.viewportQuadWarmupStep;
        ED.viewportTransitioning = false;
        vpQuad.disabled = false;
        setQuadLoading(false, 100, tr('Viewport warm-up completed with fallback', 'Preparazione viewport completata con fallback'));
      }, 6000);
    }));
  });
  root.addEventListener('lotking:quad-warmup-progress', event => {
    const step = Math.max(0, Math.min(4, Number(event.detail && event.detail.step) || 0));
    setQuadLoading(true, Math.max(12, step * 25), tr('Preparing viewport ', 'Preparazione viewport ') + step + tr(' of 4', ' di 4'));
  });
  root.addEventListener('lotking:quad-warmup-ready', () => {
    clearTimeout(quadLoadingTimer);
    ED.viewportTransitioning = false;
    vpQuad.disabled = false;
    setQuadLoading(false, 100, tr('Four viewports ready', 'Quattro viewport pronte'));
  });
  const vpRender = $('#lkViewportRenderMode');
  const captureRenderTarget = () => {
    if(!vpRender) return;
    vpRender.dataset.viewportSlot = String(ED.viewportMode === 'quad' ? Math.max(0, Math.min(3, ED.activeViewportSlot || 0)) : 0);
  };
  if(vpRender){
    vpRender.addEventListener('pointerdown', captureRenderTarget);
    vpRender.addEventListener('focus', captureRenderTarget);
  }
  if(vpRender) vpRender.addEventListener('change', () => {
    const captured = Number(vpRender.dataset.viewportSlot);
    const slot = ED.viewportMode === 'quad' && Number.isFinite(captured)
      ? Math.max(0, Math.min(3, captured))
      : 0;
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
    pipMin.title = ED.pipMinimized ? 'Expand camera preview' : 'Minimize camera preview';
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
    ED.cinemaFloatPreviewMinimized = false;
    if(ED.cinemaPreview && !ED.cinemaPreview.runtime) ED.cinemaPreview = null;
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
  $('#lkPlay').addEventListener('click', () => ED.playPreview ? deps.stopPlayPreview() : deps.startPlayPreview('play'));
  $('#lkSimulate').addEventListener('click', () => ED.simulatePreview ? deps.stopPlayPreview() : deps.startPlayPreview('simulate'));
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
