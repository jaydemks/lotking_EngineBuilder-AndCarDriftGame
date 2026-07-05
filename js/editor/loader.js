/* =========================================================
   LOT KING — editor lazy loader
   Keeps the gameplay runtime light: editor CSS, OrbitControls,
   TransformControls and the full editor are loaded only on demand.
   ========================================================= */
(function(){
'use strict';

let loading = null;
const EDITOR_SCRIPT_STAGES = Object.freeze([
  [.58, 'loading editor camera tools', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'],
  [.72, 'loading transform tools', 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js'],
  // runtime input/UI modules — loaded here too so the editor works even if the
  // host page HTML was cached before these were added (skipped if already present)
  [.73, 'loading window manager', 'js/runtime/ui/window-manager.js'],
  [.735, 'loading input actions', 'js/runtime/input/input-actions.js'],
  [.74, 'loading input devices', 'js/runtime/input/input-devices.js'],
  [.745, 'loading input manager', 'js/runtime/input/input-manager.js'],
  [.75, 'loading device visuals', 'js/runtime/input/device-visuals.js'],
  [.755, 'loading mapping overlay', 'js/runtime/input/mapping-overlay.js'],
  [.795, 'loading editor core', 'js/editor/editor-core.js'],
  [.797, 'loading editor layout', 'js/editor/editor-layout.js'],
  [.80, 'loading editor viewport tools', 'js/editor/viewport-picking.js'],
  [.805, 'loading editor viewport events', 'js/editor/viewport-events.js'],
  [.81, 'loading editor fly camera', 'js/editor/fly-camera.js'],
  [.815, 'loading editor gizmo controls', 'js/editor/gizmo-controls.js'],
  [.817, 'loading editor visual helpers', 'js/editor/visual-helpers.js'],
  [.84, 'loading editor asset library', 'js/editor/asset-library.js'],
  [.85, 'loading editor asset imports', 'js/editor/asset-imports.js'],
  [.86, 'loading editor status UI', 'js/editor/status-ui.js'],
  [.87, 'loading editor dialogs', 'js/editor/dialogs.js'],
  [.875, 'loading context menu', 'js/editor/context-menu.js'],
  [.88, 'loading level manager', 'js/editor/level-manager.js'],
  [.89, 'loading player blueprints', 'js/editor/player-blueprints.js'],
  [.90, 'loading folder manager', 'js/editor/folder-manager.js'],
  [.91, 'loading keyboard shortcuts', 'js/editor/keyboard-shortcuts.js'],
  [.92, 'loading thumbnails', 'js/editor/thumbnail-manager.js'],
  [.925, 'loading floating layout', 'js/editor/floating-layout.js'],
  [.928, 'loading editor preferences', 'js/editor/preferences.js'],
  [.929, 'loading quick audio controls', 'js/editor/quick-audio.js'],
  [.9295, 'loading editor template', 'js/editor/editor-template.js'],
  [.9297, 'loading editor toolbar', 'js/editor/toolbar.js'],
  [.9298, 'loading side panel controls', 'js/editor/side-panels.js'],
  [.92985, 'loading editor menus', 'js/editor/editor-menus.js'],
  [.9299, 'loading asset panel helpers', 'js/editor/asset-panel.js'],
  [.92992, 'loading asset catalog', 'js/editor/asset-catalog.js'],
  [.92993, 'loading asset drag and drop', 'js/editor/asset-dnd.js'],
  [.92995, 'loading scene outliner', 'js/editor/outliner.js'],
  [.929952, 'loading selection manager', 'js/editor/selection-manager.js'],
  [.929955, 'loading history manager', 'js/editor/history-manager.js'],
  [.92996, 'loading project io', 'js/editor/project-io.js'],
  [.929961, 'loading input settings', 'js/editor/input-settings.js'],
  [.929965, 'loading add actions', 'js/editor/add-actions.js'],
  [.929967, 'loading scene menu actions', 'js/editor/scene-menu-actions.js'],
  [.92997, 'loading inspector ui', 'js/editor/inspector-ui.js'],
  [.929975, 'loading music library panel', 'js/editor/music-library-panel.js'],
  [.92998, 'loading material editor', 'js/editor/material-editor.js'],
  [.929985, 'loading object inspector', 'js/editor/object-inspector.js'],
  [.92999, 'loading player camera inspector', 'js/editor/player-camera-inspector.js'],
  [.929992, 'loading player lights inspector', 'js/editor/player-lights-inspector.js'],
  [.929994, 'loading player attachments inspector', 'js/editor/player-attachments-inspector.js'],
  [.929996, 'loading player setup inspector', 'js/editor/player-setup-inspector.js'],
  [.929998, 'loading hud inspector', 'js/editor/hud-inspector.js'],
  [.929999, 'loading environment inspector', 'js/editor/environment-inspector.js'],
  [.9299995, 'loading inspector controller', 'js/editor/inspector-controller.js'],
  [.9299997, 'loading editor runtime', 'js/editor/editor-runtime.js'],
  [.9299998, 'loading playable export level picker', 'js/editor/playable-export-level-picker.js'],
  [.92999985, 'loading playable export assets', 'js/editor/playable-export-assets.js'],
  [.9299999, 'loading playable export zip', 'js/editor/playable-export-zip.js'],
  [.93, 'loading playable export', 'js/editor/playable-export.js'],
  [.95, 'starting editor', 'js/editor/editor.js'],
]);

function loadCss(href){
  if(document.querySelector('link[data-lk-editor-css]')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.dataset.lkEditorCss = '1';
    l.onload = resolve;
    l.onerror = () => reject(new Error('CSS editor non caricato: ' + href));
    document.head.appendChild(l);
  });
}
function loadScript(src){
  const existing = document.querySelector('script[data-lk-src="' + src + '"], script[src="' + src + '"]');
  if(existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.dataset.lkSrc = src;
    s.src = src + (src.indexOf('js/editor/') === 0 ? '?v=' + Date.now() : '');
    s.onload = resolve;
    s.onerror = () => reject(new Error('Script editor non caricato: ' + src));
    document.body.appendChild(s);
  });
}
function waitForStore(){
  const ready = window.LK_STORE && window.LK_STORE.ready;
  return ready && ready.finally ? ready.catch(()=>{}) : Promise.resolve();
}
function waitRuntime(mode){
  const assets = window.LOT_KING && window.LOT_KING.assets;
  if(assets && assets.ensureReady) return assets.ensureReady(mode).catch(()=>{});
  return waitForStore();
}
function editorStage(value, label){
  const assets = window.LOT_KING && window.LOT_KING.assets;
  if(assets && assets.setLoadingStage) assets.setLoadingStage('editor', value, label);
}
function finishEditorLoading(){
  const assets = window.LOT_KING && window.LOT_KING.assets;
  if(assets && assets.finishLoading) assets.finishLoading();
}
function failEditorLoading(label){
  const assets = window.LOT_KING && window.LOT_KING.assets;
  if(assets && assets.failLoading) assets.failLoading(label);
}
function cleanupEditorScripts(){
  const selectors = ['script[data-lk-src^="js/editor/"]'];
  EDITOR_SCRIPT_STAGES.forEach(item => {
    const src = item[2];
    if(src.indexOf('js/editor/') === 0) selectors.push('script[src^="' + src + '"]');
  });
  document.querySelectorAll(selectors.join(', ')).forEach(s => s.remove());
}
function loadEditorScriptStages(){
  return EDITOR_SCRIPT_STAGES.reduce((chain, item) => {
    return chain.then(() => {
      editorStage(item[0], item[1]);
      return loadScript(item[2]);
    });
  }, Promise.resolve());
}
function ensureEditor(){
  if(window.LOT_KING && window.LOT_KING.editor) return Promise.resolve(window.LOT_KING.editor);
  if(loading) return loading;
  cleanupEditorScripts();
  loading = Promise.resolve()
    .then(() => waitRuntime('editor'))
    .then(() => { editorStage(.45, 'loading editor style'); return loadCss('css/editor.css'); })
    .then(loadEditorScriptStages)
    .then(() => {
      if(!window.LOT_KING || !window.LOT_KING.editor) throw new Error('Editor non inizializzato');
      finishEditorLoading();
      return window.LOT_KING.editor;
    })
    .catch(err => {
      loading = null;
      console.warn('LotKing editor loader:', err);
      const pop = window.LOT_KING && window.LOT_KING.ui && window.LOT_KING.ui.popup;
      if(pop) pop('EDITOR NON CARICATO', '#ff5566');
      failEditorLoading('editor loading failed');
      throw err;
    });
  return loading;
}
function openEditor(){
  const actions = window.LOT_KING && window.LOT_KING.actions;
  const state = window.LOT_KING && window.LOT_KING.state;
  if(actions && actions.unloadLevel && state && (state.started || state.levelLoaded || state.editorPreview)) actions.unloadLevel();
  if(actions && actions.prepareEditorLevel) actions.prepareEditorLevel();
  ensureEditor().then(editor => editor.enter()).catch(()=>{});
}

const btn = document.getElementById('editorBtn');
if(btn) btn.addEventListener('click', openEditor);

// cambio livello dall'editor → reload → rientra direttamente in editor
try {
  if(sessionStorage.getItem('lk.reopenEditor')){
    sessionStorage.removeItem('lk.reopenEditor');
    setTimeout(openEditor, 120);
  }
} catch(err){}

window.LK_EDITOR_LOADER = {load: ensureEditor, open: openEditor};
})();
