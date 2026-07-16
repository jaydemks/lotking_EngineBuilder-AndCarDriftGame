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
  const loadText = opts.loadText;
  const hud = opts.hud;
  const overlay = opts.overlay;

  function editorActive(){
    const editor = document.getElementById('lkEditor');
    return !!(editor && editor.classList.contains('active'));
  }

  function onlineDemoMode(){
    return !!(window.LK_PROJECT_WORKSPACE &&
      window.LK_PROJECT_WORKSPACE.isOnlineDemoMode &&
      window.LK_PROJECT_WORKSPACE.isOnlineDemoMode());
  }

  function call(name){
    if(opts[name]) return opts[name].apply(null, Array.prototype.slice.call(arguments, 1));
    return undefined;
  }

  function showMenuOverlay(){
    if(editorActive()) return;
    if(!overlay) return;
    overlay.classList.remove('hidden');
    overlay.classList.remove('choosing-level');
    call('refreshTouchControls');
  }

  function hideMenuOverlay(){
    if(!overlay) return;
    overlay.classList.remove('choosing-level');
    overlay.classList.add('hidden');
    call('refreshTouchControls');
  }

  function setHudVisible(visible){
    if(hud) hud.style.display = visible ? 'block' : 'none';
    call('refreshTouchControls');
  }

  function showLevelSelect(){
    if(editorActive()) return;
    if(session.isStarted() || session.isPending()) return;
    if(loadText) loadText.textContent = TRACK_CATALOG_AVAILABLE_TEXT();
    showMenuOverlay();
    if(overlay) overlay.classList.add('choosing-level');
    trackCatalog.show();
  }

  function hideLevelSelect(){
    trackCatalog.hide(!session.isPending());
    showMenuOverlay();
  }

  function unloadCurrentLevel(){
    session.clearLevel();
    call('clearInput');
    setHudVisible(false);
    call('pauseRadio');
    call('previewRadioHud', false);
    call('resetTimescale');
    call('resetCar');
    call('resetGameplayCamera');
    call('disposePhysicsWorld');
    call('disposeRenderLists');
  }

  function prepareEditorLevel(){
    const currentLevel = trackCatalog.prepareEditor();
    if(currentLevel) gameState.activeLevel = currentLevel.id;
    return currentLevel;
  }

  function enterGameplayMode(){
    call('exitEditor', true);
    gameState.editorActive = false;
    gameState.playPreviewCursorVisible = false;
    document.body.classList.remove('lk-game-ui-cursor');
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

  function beginGameplaySession(editorPreview, editorPreviewMode){
    // Menu-role and asset preloads can finish after a level was selected.
    // Reassert the running-session UI state at the session boundary.
    hideMenuOverlay();
    gameState.paused = false;
    gameState.playPreviewCursorVisible = false;
    if(editorPreview) delete gameState.editorPreviewManualEnvironment;
    if(editorPreview && !onlineDemoMode()) call('syncEditorSpawnFromPlayer');
    call('resetCar');
    call('resetGameplayCamera');
    call('initGameplayPhysics');
    setHudVisible(true);
    session.markStarted(editorPreview, editorPreviewMode);
    call('beginLogicRuntime');
    call('pauseMenuMusic');
    call('beginRadio');
  }

  function stopEditorPreview(){
    if(!gameState.editorPreview) return;
    gameState.playPreviewCursorVisible = false;
    document.body.classList.remove('lk-free-camera-cursor-hidden');
    document.body.classList.remove('lk-game-ui-cursor');
    session.markStopped();
    call('stopLogicRuntime');
    call('setDragging', false);
    call('clearInput');
    setHudVisible(false);
    call('pauseRadio');
    call('resetTimescale');
    call('resetCar');
    call('resetGameplayCamera');
    call('disposePhysicsWorld');
    call('disposeRenderLists');
    if(gameState.editorActive){
      if(overlay){
        overlay.classList.remove('menu-preloading');
        overlay.classList.remove('choosing-level');
        overlay.classList.add('hidden');
      }
    } else {
      showMenuOverlay();
      if(loadText) loadText.textContent = 'choose track';
    }
  }

  function backToMainMenu(){
    unloadCurrentLevel();
    gameState.paused = false;
    call('clearInput');
    gameState.playPreviewCursorVisible = false;
    document.body.classList.remove('lk-free-camera-cursor-hidden');
    document.body.classList.remove('lk-game-ui-cursor');
    setHudVisible(false);
    hideLevelSelect();
    showMenuOverlay();
    if(loadText && !session.isPending()) loadText.textContent = 'choose track';
    call('setMenuBusy', false);
    if(!editorActive()) call('playMenuMusic');
  }

  function TRACK_CATALOG_AVAILABLE_TEXT(){
    return trackCatalog.available().length ? 'select track' : 'no tracks available';
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
        showLevelSelect();
      });
      return;
    }
    hideMenuOverlay();
    enterGameplayMode();
    beginGameplaySession(false);
  }

  function startEditorPreview(mode){
    mode = mode === 'simulate' ? 'simulate' : 'play';
    if(session.isStarted() || session.isPending()) return;
    prepareEditorLevel();
    if(!opts.isRuntimeReady || !opts.isRuntimeReady()){
      session.setPending(true);
      opts.ensureRuntimeReady('game').then(() => {
        session.setPending(false);
        startEditorPreview(mode);
      }).catch(() => runtimeFailed('track preview failed'));
      return;
    }
    hideMenuOverlay();
    const currentLevel = trackCatalog.current();
    if(loadText) loadText.textContent = currentLevel ? (mode === 'simulate' ? 'simulating track: ' : 'previewing track: ') + currentLevel.name : (mode === 'simulate' ? 'simulating track' : 'previewing track');
    beginGameplaySession(true, mode);
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
