const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('js/runtime/game-flow.js', 'utf8');
const sandbox = {
  window:{},
  document:{
    body:{classList:{add(){}, remove(){}}},
    getElementById(){ return null; },
  },
  console,
  Promise,
};
vm.runInNewContext(source, sandbox, {filename:'game-flow.js'});

function runRole(role){
  const calls = [];
  const hud = {style:{display:''}};
  const session = {
    markStarted(){ calls.push('session-started'); },
    isStarted(){ return false; },
    isPending(){ return false; },
  };
  const flow = sandbox.window.LK_RUNTIME_GAME_FLOW.create({
    gameState:{},
    session,
    trackCatalog:{},
    hud,
    currentLevelRole:() => role,
    resetCar(){},
    resetGameplayCamera(){},
    initGameplayPhysics(){},
    beginLogicRuntime(){},
    pauseRadio(){ calls.push('pause-radio'); },
    beginRadio(){ calls.push('begin-radio'); },
    pauseMenuMusic(){ calls.push('pause-menu'); },
    stopMenuMusic(){ calls.push('stop-menu'); },
    playMenuMusic(menuRole){ calls.push('play-menu:' + menuRole); },
  });
  flow.beginGameplaySession(false);
  return {calls, hud};
}

function runPreviewStop(){
  const calls = [];
  const flow = sandbox.window.LK_RUNTIME_GAME_FLOW.create({
    gameState:{editorPreview:true},
    session:{
      markStopped(){ calls.push('session-stopped'); },
      isStarted(){ return true; },
      isPending(){ return false; },
    },
    trackCatalog:{},
    stopMenuMusic(){ calls.push('stop-menu'); },
    pauseRadio(){ calls.push('pause-radio'); },
  });
  flow.stopEditorPreview();
  return calls;
}

const gameplay = runRole('gameplay');
assert(gameplay.calls.includes('begin-radio'), 'gameplay levels request radio startup; vehicle ownership decides availability');
assert(gameplay.calls.includes('pause-menu'), 'gameplay levels stop menu music');
assert(gameplay.hud.style.display === 'block', 'gameplay levels keep the gameplay HUD visible');

for(const role of ['editor-menu', 'game-menu']){
  const menu = runRole(role);
  assert(menu.calls.includes('pause-radio'), role + ' levels stop the game radio');
  assert(menu.calls.includes('play-menu:' + role), role + ' levels start their matching menu library');
  assert(!menu.calls.includes('begin-radio'), role + ' levels never start the game radio');
  assert(menu.hud.style.display === 'none', role + ' levels hide the gameplay HUD');
}

const stoppedPreview = runPreviewStop();
assert(stoppedPreview.includes('stop-menu'), 'Stop Preview fades menu music and resets it to the beginning');

const lotKing = fs.readFileSync('js/lot-king.js', 'utf8');
const store = fs.readFileSync('js/engine/scene-store.js', 'utf8');
const hudInspector = fs.readFileSync('js/editor/hud-inspector.js', 'utf8');
const radioHud = fs.readFileSync('js/runtime/radio-hud.js', 'utf8');
const menuMusic = fs.readFileSync('js/runtime/menu-music.js', 'utf8');
const vehiclePawns = fs.readFileSync('js/runtime/vehicle-pawns.js', 'utf8');
const logicRunner = fs.readFileSync('js/runtime/logic-elements-runner.js', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const quickAudio = fs.readFileSync('js/editor/quick-audio.js', 'utf8');
const musicPanel = fs.readFileSync('js/editor/music-library-panel.js', 'utf8');
const visualHelpers = fs.readFileSync('js/editor/visual-helpers.js', 'utf8');
assert(lotKing.includes('editorMenuMusic: EDITOR_MENU_MUSIC'), 'runtime exposes the Editor Menu library');
assert(lotKing.includes('gameMenuMusic: GAME_MENU_MUSIC'), 'runtime exposes the Game Menu library');
assert(lotKing.includes('loadingMusic: LOADING_MUSIC'), 'runtime exposes an independent Loading Music library');
assert(store.includes('editorMenu:cloneData(editorMenuTracks)'), 'Editor Menu order is persisted');
assert(store.includes('gameMenu:cloneData(gameMenuTracks)'), 'Game Menu order is persisted');
assert(store.includes('loading:cloneData(loadingTracks)'), 'Loading Music order is persisted');
assert(store.includes('lotking.loadingMusic.v1'), 'the index receives the last saved Loading Music startup-track hint');
assert(hudInspector.includes('MENU MUSIC DESTINATION'), 'HUD inspector exposes the menu destination selector');
assert(hudInspector.includes('RADIO OWNERSHIP'), 'HUD inspector exposes the radio ownership policy');
assert(radioHud.includes("bindingMode:'vehicle'"), 'radio defaults to possessed-vehicle ownership');
assert(radioHud.includes('resolveAvailability'), 'radio playback and UI are availability-gated');
assert(radioHud.includes("focus.claim('radio', audio)"), 'radio claims the shared music focus before playback');
assert(radioHud.includes('pauseForExternalMedia:() => audio.pause()'), 'radio exposes a non-destructive pause for mesh media');
assert(menuMusic.includes("focus.claim('menu-music', audio)"), 'menu and loading music claim the same exclusive focus');
assert(store.includes('window.LK_MEDIA_AUDIO_FOCUS = dynamicMediaAudioFocus'), 'dynamic material media exposes one shared audio-focus arbiter');
assert(store.includes("dynamicMediaAudioFocus.claim('youtube', controller)"), 'YouTube surfaces pause other music when opened or played');
assert(store.includes("dynamicMediaAudioFocus.claim('surface-video', controller)"), 'audible direct-video surfaces pause other music');
assert(store.includes('function dynamicVideoIsAudible(video)'), 'silent or muted mesh videos keep rendering without stealing music focus');
assert(store.includes('controller.audioFocusPaused = true'), 'focus-paused mesh videos do not auto-restart over the selected music source');
assert(store.includes('YT.PlayerState.PLAYING'), 'YouTube playback changes reassert focus after another source was selected');
assert(vehiclePawns.includes("radio:Object.assign({enabled:true}"), 'native and Logic Element vehicles own an editable radio capability');
assert(logicRunner.includes("path.indexOf('radio.')"), 'Vehicle Radio exposed variables update the runtime Pawn instance');
assert(index.includes("applyMusicTrack(message.loadingTrack, 'loading')"), 'index keeps Loading Music active before the role menu is ready');
assert(index.includes('preferredLoadingTrack()'), 'index resolves the saved Loading Music track before booting a destination');
assert(quickAudio.includes('function preview(api, index, label)'), 'floating audio transport can adopt every music library');
assert(quickAudio.includes('audio.currentTime = 0'), 'floating Stop returns an editor audio preview to 0:00');
assert(musicPanel.includes("tr('Stop', 'Ferma')"), 'every music-library row exposes an explicit Stop action');
assert(visualHelpers.includes("if(mode === 'hide') return false;\n    return true;"), 'global Collision Dummies shows every collider not explicitly hidden');

console.log('menu-role-music.test.js: all assertions passed');
