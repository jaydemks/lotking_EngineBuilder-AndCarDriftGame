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
const projectIo = fs.readFileSync('js/editor/project-io.js', 'utf8');
const hudInspector = fs.readFileSync('js/editor/hud-inspector.js', 'utf8');
const radioHud = fs.readFileSync('js/runtime/radio-hud.js', 'utf8');
const gameHud = fs.readFileSync('js/runtime/game-hud.js', 'utf8');
const vehicleRadar = fs.readFileSync('js/runtime/vehicle-radar.js', 'utf8');
const lotKingCss = fs.readFileSync('css/lot-king.css', 'utf8');
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
assert(store.includes("levelRole:'gameplay'"), 'playable runtime catalog entries retain their positive gameplay role');
assert(lotKing.indexOf('if(current&&current.levelRole') < lotKing.indexOf('if(editorRole)return editorRole'), 'the active editor track role wins over stale editor state');
assert(projectIo.includes("levelRole:activeEntry&&activeEntry.levelRole||'gameplay'"), 'legacy project loading defaults a missing level role from the active local level, then gameplay');
assert(projectIo.includes("templateId==='fps-shooter-test'||templateId==='fps-enemy-outpost'"), 'official FPS levels persistently repair a stale menu role written by older editor sessions');
assert(lotKing.includes("if(templateId==='fps-shooter-test'||templateId==='fps-enemy-outpost')return 'gameplay'"), 'official FPS runtime role is gameplay even before a repaired project is reloaded');
assert(hudInspector.includes('MENU MUSIC DESTINATION'), 'HUD inspector exposes the menu destination selector');
assert(hudInspector.includes('RADIO OWNERSHIP'), 'HUD inspector exposes the radio ownership policy');
assert(radioHud.includes("bindingMode:'vehicle'"), 'radio defaults to possessed-vehicle ownership');
assert(radioHud.includes('resolveAvailability'), 'radio playback and UI are availability-gated');
assert(lotKing.includes('function runtimePawnUiActive(pawn)') && lotKing.includes('function activeRuntimeVehiclePawn(playerId)'), 'player-car UI resolves only active, visible vehicle Pawns');
assert(lotKing.includes("return isRuntimeVehiclePawn(pawn) ? 'vehicle' : 'none'") && lotKing.includes('runtimePawnHudContext(hudPawn)'), 'missing or non-vehicle Pawns cannot fall through to the driving HUD');
assert(lotKing.includes('if(RADIO.syncAvailability) RADIO.syncAvailability();'), 'the vehicle radio gate is refreshed even while gameplay is paused');
assert(gameHud.includes("setContext('none')"), 'the game HUD starts without an implicit player car');
assert(lotKingCss.includes('#hud[data-context="none"] #vehicleHud'), 'the no-player context hides player-car HUD widgets');
assert(!hudInspector.includes('Global gameplay') && !hudInspector.includes('Specific actor'), 'radio ownership no longer offers ambient level or arbitrary-actor playback');
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

const radioSandbox = {window:{}};
vm.runInNewContext(radioHud, radioSandbox, {filename:'radio-hud.js'});
const runtimeAvailability = radioSandbox.window.LK_RUNTIME_RADIO_HUD.runtimeAvailability;
assert(runtimeAvailability({editorPreview:false, materialSurfaceAvailable:true, resolveAvailability:() => false}) === false,
  'an authored radio material cannot turn the radio into level music without a vehicle');
assert(runtimeAvailability({editorPreview:false, playerId:1, resolveAvailability:(config, playerId) => config.enabled && playerId === 1, config:{enabled:true}}) === true,
  'an enabled visible vehicle may activate its radio for the owning player');
assert(runtimeAvailability({editorPreview:false, playerId:1, resolveAvailability:() => true, config:{enabled:false}}) === false,
  'the Radio HUD enabled toggle also prevents hidden vehicle music from starting');
assert(runtimeAvailability({editorPreview:true, resolveAvailability:() => false}) === true,
  'the explicit editor HUD preview remains available without starting runtime music');

const hudNodes = new Map();
function hudNode(id){
  if(!hudNodes.has(id)) hudNodes.set(id, {id, dataset:{}, hidden:false, textContent:'', innerHTML:'', style:{}, classList:{add(){}, remove(){}, toggle(){}}});
  return hudNodes.get(id);
}
const hudSandbox = {window:{}, document:{getElementById:hudNode}, setTimeout, clearTimeout};
vm.runInNewContext(gameHud, hudSandbox, {filename:'game-hud.js'});
const hudApi = hudSandbox.window.LK_RUNTIME_GAME_HUD.create();
assert(hudApi.context() === 'none' && hudNode('hud').dataset.context === 'none',
  'the concrete HUD runtime mounts in a no-player state instead of flashing driving widgets');
hudApi.setContext('vehicle');
assert(hudApi.context() === 'vehicle', 'vehicle HUD becomes available explicitly when a vehicle Pawn owns the player');
hudApi.setContext('missing');
assert(hudApi.context() === 'none', 'unknown/missing Pawn contexts collapse back to no player-car HUD');

const radarSandbox = {window:{}};
vm.runInNewContext(vehicleRadar, radarSandbox, {filename:'vehicle-radar.js'});
const resolveVehicleTarget = radarSandbox.window.LK_RUNTIME_VEHICLE_RADAR.resolveVehicleTarget;
const visibleOwner = {visible:true, userData:{logicEnabled:true}};
assert(resolveVehicleTarget({}, {pawnType:'vehicle', possessed:true, enabled:true, hidden:false, owner:visibleOwner}).object === visibleOwner,
  'vehicle radar accepts the active visible player vehicle');
assert(resolveVehicleTarget({}, {pawnType:'vehicle', possessed:true, enabled:true, hidden:false, owner:{visible:false, userData:{logicEnabled:true}}}) === null,
  'the Player Car eye state removes its radar together with the rest of the vehicle HUD');
assert(resolveVehicleTarget({}, {pawnType:'character', possessed:true, enabled:true, hidden:false, owner:visibleOwner}) === null,
  'a character Pawn cannot inherit the vehicle radar');
assert(resolveVehicleTarget({player:{enabled:false, hidden:true, car:{visible:false}}}, null) === null,
  'the inactive native Player Car cannot leave a fallback radar behind');

console.log('menu-role-music.test.js: all assertions passed');
