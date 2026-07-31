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
    call('setMenuPresentation', 'menu-overlay', true);
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
    call('disarmFreeCamera');
    call('clearInput');
    setHudVisible(false);
    call('pauseRadio');
    call('pauseMenuMusic');
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
    const levelRole = call('currentLevelRole') || 'gameplay';
    const menuSession = levelRole === 'editor-menu' || levelRole === 'game-menu';
    call('setMenuPresentation', 'menu-overlay', false);
    call('setMenuPresentation', 'menu-session', menuSession);
    call('initGameplayPhysics', {levelRole, menuSession});
    setHudVisible(!menuSession);
    session.markStarted(editorPreview, editorPreviewMode);
    call('beginLogicRuntime');
    if(menuSession){
      call('pauseRadio');
      call('playMenuMusic', levelRole);
    } else {
      call('pauseMenuMusic');
      call('beginRadio');
    }
  }

  function stopEditorPreview(){
    if(!gameState.editorPreview) return;
    gameState.playPreviewCursorVisible = false;
    document.body.classList.remove('lk-free-camera-cursor-hidden');
    document.body.classList.remove('lk-game-ui-cursor');
    // Play may have acquired pointer lock from the toolbar's user gesture.
    // Always release it before restoring editor controls; otherwise the
    // invisible cursor remains pinned to Preview and blocks Simulate/UI clicks.
    call('disarmFreeCamera');
    session.markStopped();
    call('stopLogicRuntime');
    call('setDragging', false);
    call('clearInput');
    setHudVisible(false);
    call('pauseRadio');
    call('stopMenuMusic');
    call('resetTimescale');
    call('resetCar');
    call('resetGameplayCamera');
    call('disposePhysicsWorld');
    call('disposeRenderLists');
    if(gameState.editorActive){
      call('setMenuPresentation', 'menu-session', false);
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
    if(call('requestHostMenu') === true) return;
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

  function prepareRuntimeForSession(mode, failureLabel){
    if(session.isPending()) return Promise.resolve(false);
    session.setPending(true);
    const pending = opts.ensureRuntimeReady ? opts.ensureRuntimeReady(mode || 'game') : Promise.resolve();
    return Promise.resolve(pending).then(() => {
      session.setPending(false);
      return true;
    }).catch(() => {
      session.markStopped();
      gameState.levelLoaded = false;
      runtimeFailed(failureLabel);
      return false;
    });
  }

  function startGame(){
    if(session.isStarted() || session.isPending()) return Promise.resolve(false);
    const currentLevel = trackCatalog.current();
    if(!currentLevel){
      showLevelSelect();
      return Promise.resolve(false);
    }
    // WebAudio must be created in the same synchronous user-gesture turn. It
    // also moves the procedural buffers and engine graph out of the first
    // accelerator frame and into the visible preparation phase.
    call('primeAudio');
    call('setMenuPresentation', 'menu-overlay', true);
    // Preserve the Play click's user activation across asynchronous runtime
    // preparation so free-look starts with a real pointer lock.
    call('armFreeCamera');
    return prepareRuntimeForSession('game', 'track loading failed').then(ready => {
      if(!ready){ call('disarmFreeCamera'); showLevelSelect(); return false; }
      hideMenuOverlay();
      enterGameplayMode();
      beginGameplaySession(false);
      return true;
    });
  }

  function startEditorPreview(mode){
    mode = mode === 'simulate' ? 'simulate' : 'play';
    if(session.isStarted() || session.isPending()) return Promise.resolve(false);
    call('primeAudio');
    prepareEditorLevel();
    if(mode === 'play') call('armFreeCamera');
    return prepareRuntimeForSession('game', 'track preview failed').then(ready => {
      if(!ready){ call('disarmFreeCamera'); return false; }
      hideMenuOverlay();
      const currentLevel = trackCatalog.current();
      if(loadText) loadText.textContent = currentLevel ? (mode === 'simulate' ? 'simulating track: ' : 'previewing track: ') + currentLevel.name : (mode === 'simulate' ? 'simulating track' : 'previewing track');
      beginGameplaySession(true, mode);
      return true;
    });
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
