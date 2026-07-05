/* =========================================================
   LOT KING - loading flow UI module
   Progress parts, menu busy state and final loading messages.
   ========================================================= */
(function(){
'use strict';

const DEFAULT_WEIGHTS = {models:.62, project:.16, warmup:.16, editor:.06};

function create(options){
  const opts = options || {};
  const weights = Object.assign({}, DEFAULT_WEIGHTS, opts.weights || {});
  const parts = {};
  Object.keys(weights).forEach(k => parts[k] = 0);
  let mode = null;

  const loadBar = opts.loadBar;
  const loadText = opts.loadText;
  const overlay = opts.overlay;
  const startButton = opts.startButton;
  const editorButton = opts.editorButton;

  function fraction(){
    let total = 0;
    Object.keys(weights).forEach(k => total += weights[k] * (parts[k] || 0));
    return Math.max(0, Math.min(.995, total));
  }

  function setMode(nextMode){
    mode = nextMode || 'game';
  }

  function labelBase(){
    return 'loading ' + (mode === 'editor' ? 'editor assets' : 'game assets');
  }

  function setPart(part, value, label){
    if(!(part in parts)) parts[part] = 0;
    parts[part] = Math.max(0, Math.min(1, value || 0));
    if(!loadBar || !loadText || !mode) return;
    const pct = Math.min(99, Math.floor(fraction() * 100));
    loadBar.style.width = pct + '%';
    loadText.textContent = (label || labelBase()) + '... ' + pct + '%';
  }

  function reset(){
    Object.keys(parts).forEach(k => parts[k] = 0);
    setPart('models', 0, labelBase());
  }

  function setBusy(busy){
    if(overlay) overlay.classList.toggle('loading', !!busy);
    if(startButton) startButton.classList.toggle('loading', !!busy);
    if(editorButton) editorButton.classList.toggle('loading', !!busy);
  }

  function finish(){
    if(loadBar) loadBar.style.width = '100%';
    if(!loadText) return;
    const report = opts.getLoadReport ? opts.getLoadReport() : [];
    const fails = report.filter(r => String(r).includes('✗'));
    if(opts.isFileMode && opts.isFileMode()) loadText.textContent = 'Apri da http://127.0.0.1:8000/gameplay.html per caricare i modelli locali';
    else if(opts.hasGltfLoader && !opts.hasGltfLoader()) loadText.textContent = '⚠ GLTFLoader non caricato (CDN bloccata) — auto procedurali';
    else if(fails.length) loadText.textContent = '⚠ non caricati: ' + fails.join(', ');
    else loadText.textContent = 'ready';
  }

  function fail(label){
    if(loadText) loadText.textContent = label || 'loading failed';
    setBusy(false);
  }

  function setIdleText(label){
    if(loadText) loadText.textContent = label || 'choose track';
  }

  function setBar(value){
    if(loadBar) loadBar.style.width = Math.max(0, Math.min(100, value || 0)) + '%';
  }

  return {
    setMode,
    getMode: () => mode,
    reset,
    setPart,
    setBusy,
    finish,
    fail,
    fraction,
    setIdleText,
    setBar,
  };
}

window.LK_RUNTIME_LOADING_FLOW = Object.freeze({create});
})();
