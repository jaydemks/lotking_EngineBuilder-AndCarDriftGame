/* =========================================================
   LOT KING — editor lazy loader
   Keeps the gameplay runtime light: editor CSS and the full editor are
   loaded only on demand. Three.js addons come from the pinned local bundle.
   ========================================================= */
(function(){
'use strict';

let loading = null;
const EDITOR_SCRIPT_STAGES = Object.freeze([
  // runtime input/UI modules — loaded here too so the editor works even if the
  // host page HTML was cached before these were added (skipped if already present)
  [.73, 'loading window manager', 'js/runtime/ui/window-manager.js'],
  [.735, 'loading input actions', 'js/runtime/input/input-actions.js'],
  [.74, 'loading input devices', 'js/runtime/input/input-devices.js'],
  [.745, 'loading input manager', 'js/runtime/input/input-manager.js'],
  [.75, 'loading device visuals', 'js/runtime/input/device-visuals.js'],
	  [.755, 'loading mapping overlay', 'js/runtime/input/mapping-overlay.js'],
	  [.756, 'loading plugin api', 'js/plugins/plugin-api.js'],
	  [.757, 'loading plugin manager', 'js/plugins/plugin-manager.js'],
	  [.758, 'loading logic element plugin', 'js/plugins/logic-element-plugin.js'],
	  [.76, 'loading logic graph', 'js/logic/logic-graph.js?v=0.7.0-shading-r185-1'],
  [.7605, 'loading logic exporter', 'js/logic/logic-exporter.js'],
  [.761, 'loading logic templates', 'js/logic/logic-templates.js?v=0.7.0-shading-r185-1'],
  [.7612, 'loading soccer templates', 'js/logic/logic-templates-soccer.js'],
  [.7614, 'loading character templates', 'js/logic/logic-templates-character.js'],
  [.762, 'loading logic registry', 'js/logic/logic-registry.js'],
  [.763, 'loading logic validator', 'js/logic/logic-validator.js'],
  [.764, 'loading logic services', 'js/logic/logic-services.js'],
  [.765, 'loading logic runtime', 'js/logic/logic-runtime.js'],
  [.766, 'loading logic nodes', 'js/logic/logic-nodes-mvp.js'],
  [.7662, 'loading soccer logic nodes', 'js/logic/logic-nodes-soccer.js'],
  [.7664, 'loading character logic nodes', 'js/logic/logic-nodes-character.js'],
  [.767, 'loading logic runner', 'js/runtime/logic-elements-runner.js'],
  [.795, 'loading editor core', 'js/editor/editor-core.js?v=0.7.0-smart-collider-dummies-1'],
  [.797, 'loading editor layout', 'js/editor/editor-layout.js'],
  [.80, 'loading editor viewport tools', 'js/editor/viewport-picking.js?v=0.7.0-smart-collider-dummies-1'],
  [.805, 'loading editor viewport events', 'js/editor/viewport-events.js?v=0.7.0-smart-collider-dummies-1'],
  [.81, 'loading editor fly camera', 'js/editor/fly-camera.js'],
  [.815, 'loading editor gizmo controls', 'js/editor/gizmo-controls.js'],
  [.817, 'loading editor visual helpers', 'js/editor/visual-helpers.js?v=0.7.0-smart-collider-dummies-1'],
  [.84, 'loading editor asset library', 'js/editor/asset-library.js'],
  [.85, 'loading editor asset imports', 'js/editor/asset-imports.js'],
  [.86, 'loading editor status UI', 'js/editor/status-ui.js'],
  [.87, 'loading editor dialogs', 'js/editor/dialogs.js'],
  [.875, 'loading context menu', 'js/editor/context-menu.js'],
  [.88, 'loading level manager', 'js/editor/level-manager.js?v=0.7.0-complete-level-library-1'],
  [.89, 'loading player blueprints', 'js/editor/player-blueprints.js?v=0.7.0-shading-r185-1'],
  [.90, 'loading folder manager', 'js/editor/folder-manager.js'],
  [.91, 'loading keyboard shortcuts', 'js/editor/keyboard-shortcuts.js'],
  [.92, 'loading thumbnails', 'js/editor/thumbnail-manager.js?v=0.7.0-three-r185-1'],
  [.925, 'loading floating layout', 'js/editor/floating-layout.js'],
  [.928, 'loading editor preferences', 'js/editor/preferences.js'],
  [.9285, 'loading editor welcome', 'js/editor/welcome-overlay.js'],
  [.929, 'loading quick audio controls', 'js/editor/quick-audio.js'],
  [.9295, 'loading editor template', 'js/editor/editor-template.js?v=0.7.0-developer-debugger-3'],
  [.9296, 'loading developer debugger', 'js/editor/developer-debugger.js?v=0.7.0-developer-debugger-3'],
  [.9297, 'loading editor toolbar', 'js/editor/toolbar.js?v=0.7.0-developer-debugger-1'],
  [.9298, 'loading side panel controls', 'js/editor/side-panels.js'],
	  [.92985, 'loading editor menus', 'js/editor/editor-menus.js'],
	  [.92986, 'loading application menu bar', 'js/editor/editor-menu-bar.js'],
	  [.9299, 'loading asset panel helpers', 'js/editor/asset-panel.js'],
  [.92991, 'loading asset properties', 'js/editor/asset-properties.js'],
  [.92992, 'loading asset catalog', 'js/editor/asset-catalog.js'],
  [.92993, 'loading asset drag and drop', 'js/editor/asset-dnd.js'],
  [.92995, 'loading scene outliner', 'js/editor/outliner.js?v=0.7.0-selection-scroll-source-1'],
  [.929952, 'loading selection manager', 'js/editor/selection-manager.js?v=0.7.0-selection-scroll-source-1'],
  [.929955, 'loading history manager', 'js/editor/history-manager.js'],
  [.92996, 'loading project io', 'js/editor/project-io.js?v=0.7.0-port-independent-project-2'],
  [.929961, 'loading input settings', 'js/editor/input-settings.js'],
  [.929965, 'loading add actions', 'js/editor/add-actions.js'],
  [.929967, 'loading scene menu actions', 'js/editor/scene-menu-actions.js'],
  [.92997, 'loading inspector ui', 'js/editor/inspector-ui.js'],
  [.929975, 'loading music library panel', 'js/editor/music-library-panel.js?v=0.7.0-music-order-1'],
  [.92998, 'loading material editor', 'js/editor/material-editor.js?v=0.7.0-persistence-audit-1'],
  [.929982, 'loading mesh editor', 'js/editor/mesh-editor.js'],
  [.929985, 'loading object inspector', 'js/editor/object-inspector.js?v=0.7.0-persistence-audit-1'],
  [.92999, 'loading player camera inspector', 'js/editor/player-camera-inspector.js'],
  [.929991, 'loading player collider inspector', 'js/editor/player-collider-inspector.js?v=0.7.0-smart-collider-dummies-1'],
  [.929992, 'loading player lights inspector', 'js/editor/player-lights-inspector.js?v=0.7.0-split-rear-colors-1'],
  [.929994, 'loading player attachments inspector', 'js/editor/player-attachments-inspector.js'],
  [.929996, 'loading player setup inspector', 'js/editor/player-setup-inspector.js?v=0.7.0-shading-r185-1'],
  [.929998, 'loading hud inspector', 'js/editor/hud-inspector.js'],
  [.929999, 'loading environment inspector', 'js/editor/environment-inspector.js?v=0.7.0-cinematic-flare-1'],
  [.9299991, 'loading rendering inspector', 'js/editor/rendering-inspector.js?v=0.7.0-reflections-r185-1'],
  [.9299993, 'loading logic inspector', 'js/editor/logic-elements-inspector.js?v=0.7.0-split-rear-colors-1'],
  [.9299995, 'loading inspector controller', 'js/editor/inspector-controller.js?v=0.7.0-smart-collider-dummies-1'],
  [.9299996, 'loading cinema studio', 'js/editor/cinema-studio.js'],
  [.92999965, 'loading viewport layout', 'js/editor/viewport-layout.js?v=0.7.0-three-r185-1'],
  [.9299997, 'loading editor runtime', 'js/editor/editor-runtime.js?v=0.7.0-smart-collider-dummies-1'],
  [.9299998, 'loading playable export level picker', 'js/editor/playable-export-level-picker.js'],
  [.92999985, 'loading playable export assets', 'js/editor/playable-export-assets.js'],
  [.9299999, 'loading playable export zip', 'js/editor/playable-export-zip.js?v=0.7.0-three-r185-1'],
  [.93, 'loading playable export', 'js/editor/playable-export.js?v=0.7.0-persistence-audit-1'],
  [.95, 'starting editor', 'js/editor/editor.js?v=0.7.0-developer-debugger-2'],
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
  const existing = document.querySelector('script[data-lk-src="' + src + '"], script[src="' + src + '"], script[src^="' + src + '?"], script[src^="' + src + '#"]');
  if(existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.dataset.lkSrc = src;
    s.src = src + (src.indexOf('js/editor/') === 0 ? (src.includes('?') ? '&' : '?') + 'v=' + Date.now() : '');
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
    .then(() => { editorStage(.45, 'loading editor style'); return loadCss('css/editor.css?v=0.7.0-developer-debugger-3'); })
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
  ensureEditor().then(editor => editor.enter()).catch(() => {
    const overlay = document.getElementById('overlay');
    if(overlay) overlay.classList.remove('hidden');
  });
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
