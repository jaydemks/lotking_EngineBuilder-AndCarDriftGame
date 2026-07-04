/* =========================================================
   LOT KING - game/editor flow controller
   Launches tracks, editor preview sessions, unloads runtime state and returns to menu.
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts = options || {};
  const session = opts.session;
  const trackCatalog = opts.trackCatalog;
  const gameState = opts.gameState || {};
  const overlay = opts.overlay;
  const loadText = opts.loadText;
  const hud = opts.hud;

  function call(name){
    if(opts[name]) return opts[name].apply(null, Array.prototype.slice.call(arguments, 1));
    return undefined;
  }

  function setHudVisible(visible){
    if(hud) hud.style.display = visible ? 'block' : 'none';
  }

  function showLevelSelect(){
    if(session.isStarted() || session.isPending()) return;
    trackCatalog.show();
  }

  function hideLevelSelect(){
    trackCatalog.hide(!session.isPending());
  }

  function unloadCurrentLevel(){
    session.clearLevel();
    call('clearInput');
    setHudVisible(false);
    call('pauseRadio');
    call('previewRadioHud', false);
    call('resetTimescale');
    call('resetCar');
    call('disposePhysicsWorld');
    call('disposeRenderLists');
  }

  function prepareEditorLevel(){
    const currentLevel = trackCatalog.prepareEditor();
    if(currentLevel) gameState.activeLevel = currentLevel.id;
    return currentLevel;
  }

  function enterGameplayMode(){
    call('exitEditor');
    gameState.editorActive = false;
    call('clearFrameOverride');
    gameState.paused = false;
    call('setDragging', false);
    call('resetGameplayCamera');
    call('clearInput');
    call('previewRadioHud', false);
    call('setSettingsOpen', false);
    call('setTuneOpen', false);
    document.body.classList.remove('editor-hud-hidden');
  }

  function beginGameplaySession(editorPreview){
    gameState.paused = false;
    call('resetGameplayCamera');
    call('initGameplayPhysics');
    setHudVisible(true);
    session.markStarted(editorPreview);
    call('pauseMenuMusic');
    call('beginRadio');
  }

  function stopEditorPreview(){
    if(!gameState.editorPreview) return;
    session.markStopped();
    call('setDragging', false);
    call('clearInput');
    setHudVisible(false);
    call('pauseRadio');
    call('resetTimescale');
    call('resetCar');
    call('disposePhysicsWorld');
    call('disposeRenderLists');
  }

  function backToMainMenu(){
    unloadCurrentLevel();
    gameState.paused = false;
    call('clearInput');
    setHudVisible(false);
    if(overlay) overlay.classList.remove('hidden');
    hideLevelSelect();
    call('setMenuBusy', false);
    call('playMenuMusic');
  }

  function runtimeFailed(label){
    session.setPending(false);
    call('setMenuBusy', false);
    if(loadText) loadText.textContent = label || 'track loading failed';
  }

  function startGame(){
    if(session.isStarted() || session.isPending()) return;
    const currentLevel = trackCatalog.current();
    if(!currentLevel){
      showLevelSelect();
      return;
    }
    if(!opts.isRuntimeReady || !opts.isRuntimeReady()){
      session.setPending(true);
      opts.ensureRuntimeReady('game').then(() => {
        session.setPending(false);
        startGame();
      }).catch(() => {
        session.markStopped();
        gameState.levelLoaded = false;
        runtimeFailed('track loading failed');
      });
      return;
    }
    enterGameplayMode();
    if(overlay) overlay.classList.add('hidden');
    beginGameplaySession(false);
  }

  function startEditorPreview(){
    if(session.isStarted() || session.isPending()) return;
    prepareEditorLevel();
    if(!opts.isRuntimeReady || !opts.isRuntimeReady()){
      session.setPending(true);
      opts.ensureRuntimeReady('game').then(() => {
        session.setPending(false);
        startEditorPreview();
      }).catch(() => runtimeFailed('track preview failed'));
      return;
    }
    if(overlay) overlay.classList.add('hidden');
    const currentLevel = trackCatalog.current();
    if(loadText) loadText.textContent = currentLevel ? 'previewing track: ' + currentLevel.name : 'previewing track';
    beginGameplaySession(true);
  }

  function launchLevel(levelId){
    const level = trackCatalog.find(levelId);
    if(!level || session.isPending()) return;
    trackCatalog.setCurrent(level);
    session.markStopped();
    gameState.editorPreview = false;
    gameState.activeLevel = level.id;
    if(loadText) loadText.textContent = 'loading track: ' + level.name;
    startGame();
  }

  function setEditorTrack(track){
    trackCatalog.setEditorTrack(track);
  }

  return {
    showLevelSelect,
    hideLevelSelect,
    unloadCurrentLevel,
    prepareEditorLevel,
    setEditorTrack,
    enterGameplayMode,
    beginGameplaySession,
    stopEditorPreview,
    backToMainMenu,
    startGame,
    startEditorPreview,
    launchLevel,
  };
}

window.LK_RUNTIME_GAME_FLOW = Object.freeze({create});
})();
