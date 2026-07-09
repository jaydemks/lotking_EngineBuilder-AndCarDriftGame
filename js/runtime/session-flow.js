/* =========================================================
   LOT KING - gameplay/editor session state
   Keeps menu, track launch, editor preview and runtime state in sync.
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts = options || {};
  const gameState = opts.gameState || {};
  const trackCatalog = opts.trackCatalog;
  let started = false;
  let pending = false;
  let levelLoaded = false;

  function sync(extra){
    if(extra) Object.assign(gameState, extra);
    gameState.started = started;
    gameState.levelLoaded = levelLoaded;
  }

  function resetRuntimeState(){
    started = false;
    levelLoaded = false;
    sync({activeLevel:null, editorPreview:false, editorPreviewMode:null, paused:false});
  }

  function markStarted(editorPreview, editorPreviewMode){
    started = true;
    levelLoaded = true;
    const current = trackCatalog && trackCatalog.current ? trackCatalog.current() : null;
    sync({
      editorPreview: !!editorPreview,
      editorPreviewMode: editorPreview ? (editorPreviewMode || 'play') : null,
      activeLevel: current && current.id,
      paused: false,
    });
  }

  function markStopped(){
    started = false;
    levelLoaded = false;
    sync({editorPreview:false, editorPreviewMode:null, paused:false});
  }

  function setPending(value){
    pending = !!value;
  }

  function clearLevel(){
    if(trackCatalog && trackCatalog.clearCurrent) trackCatalog.clearCurrent();
    resetRuntimeState();
  }

  return {
    isStarted: () => started,
    isPending: () => pending,
    isLoaded: () => levelLoaded,
    setPending,
    markStarted,
    markStopped,
    clearLevel,
    resetRuntimeState,
  };
}

window.LK_RUNTIME_SESSION_FLOW = Object.freeze({create});
})();
