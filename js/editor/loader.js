/* =========================================================
   LOT KING — editor lazy loader
   Keeps the gameplay runtime light: editor CSS, OrbitControls,
   TransformControls and the full editor are loaded only on demand.
   ========================================================= */
(function(){
'use strict';

let loading = null;

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
function ensureEditor(){
  if(window.LOT_KING && window.LOT_KING.editor) return Promise.resolve(window.LOT_KING.editor);
  if(loading) return loading;
  document.querySelectorAll('script[data-lk-src^="js/editor/"], script[src^="js/editor/editor.js"], script[src^="js/editor/editor-template.js"], script[src^="js/editor/viewport-picking.js"], script[src^="js/editor/context-menu.js"], script[src^="js/editor/asset-imports.js"], script[src^="js/editor/level-manager.js"], script[src^="js/editor/player-blueprints.js"], script[src^="js/editor/folder-manager.js"], script[src^="js/editor/keyboard-shortcuts.js"], script[src^="js/editor/thumbnail-manager.js"], script[src^="js/editor/floating-layout.js"], script[src^="js/editor/preferences.js"], script[src^="js/editor/quick-audio.js"], script[src^="js/editor/toolbar.js"], script[src^="js/editor/side-panels.js"], script[src^="js/editor/editor-menus.js"], script[src^="js/editor/asset-panel.js"], script[src^="js/editor/outliner.js"], script[src^="js/editor/playable-export.js"]').forEach(s => s.remove());
  loading = Promise.resolve()
    .then(() => waitRuntime('editor'))
    .then(() => { editorStage(.45, 'loading editor style'); return loadCss('css/editor.css'); })
    .then(() => { editorStage(.58, 'loading editor camera tools'); return loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'); })
    .then(() => { editorStage(.72, 'loading transform tools'); return loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js'); })
    .then(() => { editorStage(.80, 'loading editor viewport tools'); return loadScript('js/editor/viewport-picking.js'); })
    .then(() => { editorStage(.84, 'loading editor asset library'); return loadScript('js/editor/asset-library.js'); })
    .then(() => { editorStage(.85, 'loading editor asset imports'); return loadScript('js/editor/asset-imports.js'); })
    .then(() => { editorStage(.86, 'loading editor status UI'); return loadScript('js/editor/status-ui.js'); })
    .then(() => { editorStage(.87, 'loading editor dialogs'); return loadScript('js/editor/dialogs.js'); })
    .then(() => { editorStage(.875, 'loading context menu'); return loadScript('js/editor/context-menu.js'); })
    .then(() => { editorStage(.88, 'loading level manager'); return loadScript('js/editor/level-manager.js'); })
    .then(() => { editorStage(.89, 'loading player blueprints'); return loadScript('js/editor/player-blueprints.js'); })
    .then(() => { editorStage(.90, 'loading folder manager'); return loadScript('js/editor/folder-manager.js'); })
    .then(() => { editorStage(.91, 'loading keyboard shortcuts'); return loadScript('js/editor/keyboard-shortcuts.js'); })
    .then(() => { editorStage(.92, 'loading thumbnails'); return loadScript('js/editor/thumbnail-manager.js'); })
    .then(() => { editorStage(.925, 'loading floating layout'); return loadScript('js/editor/floating-layout.js'); })
    .then(() => { editorStage(.928, 'loading editor preferences'); return loadScript('js/editor/preferences.js'); })
    .then(() => { editorStage(.929, 'loading quick audio controls'); return loadScript('js/editor/quick-audio.js'); })
    .then(() => { editorStage(.9295, 'loading editor template'); return loadScript('js/editor/editor-template.js'); })
    .then(() => { editorStage(.9297, 'loading editor toolbar'); return loadScript('js/editor/toolbar.js'); })
    .then(() => { editorStage(.9298, 'loading side panel controls'); return loadScript('js/editor/side-panels.js'); })
    .then(() => { editorStage(.92985, 'loading editor menus'); return loadScript('js/editor/editor-menus.js'); })
    .then(() => { editorStage(.9299, 'loading asset panel helpers'); return loadScript('js/editor/asset-panel.js'); })
    .then(() => { editorStage(.92995, 'loading scene outliner'); return loadScript('js/editor/outliner.js'); })
    .then(() => { editorStage(.93, 'loading playable export'); return loadScript('js/editor/playable-export.js'); })
    .then(() => { editorStage(.95, 'starting editor'); return loadScript('js/editor/editor.js'); })
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
