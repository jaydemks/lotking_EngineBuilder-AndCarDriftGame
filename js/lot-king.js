/* =========================================================
   LOT KING — arcade drift game in a parking lot
   Runtime · Three.js r128 · procedural WebAudio sound
   ========================================================= */
(function(){
'use strict';

const GAME = window.LOT_KING = {
  version: '0.6.4',
  assets: null,
  core: {},
  world: {},
  player: {},
  systems: {},
  settings: {},
  actions: {},
  ui: {},
  state: {started:false, editorActive:false, paused:false, sceneReady:false, levelLoaded:false, activeLevel:null, editorPreview:false, editorPreviewMode:null, playPreviewCursorVisible:false, menuCursorVisible:false},
  hooks: {frame: [], frameOverride: null},
};
const LK_LANG_KEY = 'lotking.lang.v1';
function readLotKingLang(){
  try {
    const direct = localStorage.getItem(LK_LANG_KEY);
    if(direct === 'it' || direct === 'en') return direct;
    const prefs = JSON.parse(localStorage.getItem('lotking.editorPrefs.v1') || '{}');
    return prefs && prefs.lang === 'it' ? 'it' : 'en';
  } catch(err){ return 'en'; }
}
const I18N_DICT = {
  'asset.importedTexture': {en:'Texture imported', it:'Texture importata'},
  'asset.importFailed': {en:'Asset import failed', it:'Import asset fallito'},
  'editor.freeTexture': {en:'Free Texture / Decal', it:'Free Texture / Decal'},
  'editor.decalSurface': {en:'Surface decal', it:'Decal su superficie'},
  'editor.freeImage': {en:'Free image', it:'Immagine libera'},
};
GAME.i18n = {
  lang: readLotKingLang(),
  setLang(value){
    this.lang = value === 'it' ? 'it' : 'en';
    try { localStorage.setItem(LK_LANG_KEY, this.lang); } catch(err){}
    applyRuntimeLanguage();
  },
  t(key, fallback){
    const entry = I18N_DICT[key];
    return entry ? (entry[this.lang] || entry.en || fallback || key) : (fallback || key);
  },
  pick(en, it){
    return this.lang === 'it' ? (it || en) : en;
  },
};

const RUNTIME_DOM_I18N = [
  ['#controlsToggleBtn', 'text', 'SHOW CONTROLS', 'MOSTRA COMANDI'],
  ['#controlsToggleBtn', 'data-show', 'SHOW CONTROLS', 'MOSTRA COMANDI'],
  ['#controlsToggleBtn', 'data-hide', 'HIDE CONTROLS', 'NASCONDI COMANDI'],
  ['#controls-list span:nth-child(24)', 'text', 'Driving setup', 'Setup guida'],
  ['#controls-list span:nth-child(10)', 'text', 'Look around', 'Guarda intorno'],
  ['#controls-list span:nth-child(26)', 'text', 'Pause menu', 'Menu pausa'],
  ['#controls-list span:nth-child(34)', 'text', 'Flash high beams', 'Lampeggia fari'],
  ['#tuneBtn', 'title', 'Driving setup', 'Setup guida'],
  ['.tuneTitle', 'text', 'DRIVING SETUP', 'SETUP GUIDA'],
  ['.tuneHint', 'text', '0 = base style', '0 = stile base'],
  ['#tuneTorque', 'label', 'Vehicle torque*', 'Coppia veicolo*'],
  ['#tuneTorque', 'desc', 'More pull under acceleration and corner exit.', 'Piu spinta in accelerazione e uscita curva.'],
  ['#tuneMaxSpeed', 'label', 'Top speed*', 'Velocita massima*'],
  ['#tuneMaxSpeed', 'desc', 'Extends the maximum limit on straights.', 'Allunga il limite massimo sul rettilineo.'],
  ['#tuneOversteer', 'label', 'Oversteer', 'Sovrasterzo'],
  ['#tuneOversteer', 'desc', 'Negative is more stable, positive is easier to throw sideways.', 'Negativo piu stabile, positivo piu facile da mettere di traverso.'],
  ['#tuneHandbrake', 'label', 'Handbrake', 'Freno a mano'],
  ['#tuneHandbrake', 'desc', 'How much grip breaks when you press it.', 'Quanto rompe il grip quando lo premi.'],
  ['#tuneSteer', 'label', 'Steering sensitivity', 'Sensibilita sterzo'],
  ['#tuneSteer', 'desc', 'Negative is softer, positive is sharper and more reactive.', 'Negativo piu morbida, positivo piu agile e reattiva.'],
  ['#tuneBrake', 'label', 'Braking', 'Frenata'],
  ['#tuneBrake', 'desc', 'From progressive braking to a more aggressive bite.', 'Da freno progressivo a staccata piu aggressiva.'],
  ['#tuneGrip', 'label', 'Tire grip', 'Aderenza gomme'],
  ['#tuneGrip', 'desc', 'Negative is slippier, positive is more planted.', 'Negativo piu scivolosa, positivo piu incollata.'],
  ['.lg-body', 'html',
    '<b>W A S D / arrows</b> drive · <b>SPACE</b> handbrake (drift)<br><b>Mouse / RS</b> free look · <b>Scroll</b> zoom · <b>V / B</b> look back · <b>C / R3</b> camera · <b>R / L3</b> reset<br><b>TAB / View</b> radio · <b>P / Y</b> play/pause · <b>N / D-pad right</b> next · <b>Keyboard B / D-pad down</b> prev<br><b>ESC / Start</b> menu · <b>U / D-pad up</b> driving setup · <b>M / LB</b> mute · <b>F / X</b> flash · <b>H</b> help<br><b>Gamepad / touch</b> supported · remap keys from <b>ESC → Controls</b>',
    '<b>W A S D / frecce</b> guida · <b>SPACE</b> freno a mano (drift)<br><b>Mouse / RS</b> free look · <b>Scroll</b> zoom · <b>V / B</b> guarda dietro · <b>C / R3</b> camera · <b>R / L3</b> reset<br><b>TAB / View</b> radio · <b>P / Y</b> play/pausa · <b>N / D-pad destra</b> next · <b>B tastiera / D-pad giu</b> prev<br><b>ESC / Start</b> menu · <b>U / D-pad su</b> setup guida · <b>M / LB</b> muto · <b>F / X</b> lampeggia · <b>H</b> aiuto<br><b>Gamepad / touch</b> supportati · rimappa i tasti da <b>ESC → Controlli</b>'
  ],
  ['[data-settings-tab="controls"]', 'text', 'Controls', 'Controlli'],
  ['.settingsRow[data-audio-row="master"]', 'label', 'Master volume', 'Volume generale'],
  ['.settingsRow[data-audio-row="master"]', 'desc', 'Controls the whole active mix.', 'Controlla tutto il mix attivo.'],
  ['.settingsRow[data-audio-row="car"]', 'label', 'Engine and tires', 'Motore e gomme'],
  ['.settingsRow[data-audio-row="car"]', 'desc', 'Adjusts engine, turbo audio and tire squeal.', 'Regola motore, turbo sonoro e stridio gomme.'],
  ['.settingsRow[data-audio-row="sfx"]', 'label', 'Game effects', 'Effetti gioco'],
  ['.settingsRow[data-audio-row="sfx"]', 'desc', 'Impacts, cones and parking-lot ambience.', 'Urti, coni e ambiente del parcheggio.'],
  ['.settingsRow[data-audio-row="music"]', 'label', 'Music', 'Musica'],
  ['.settingsRow[data-audio-row="music"]', 'desc', 'Radio and start-menu music volume.', 'Volume radio e musica del menu iniziale.'],
  ['#videoQuality', 'row-label', 'Render quality', 'Qualita render'],
  ['#videoQuality', 'row-desc', 'Visual profile for the engine editor and viewport.', 'Profilo visivo dell\'engine editor e del viewport.'],
  ['#videoAA', 'row-label', 'Antialiasing', 'Antialiasing'],
  ['#videoAA', 'row-desc', 'Sharpens edges and lines in the game and editor.', 'Aumenta la nitidezza di bordi e linee nel gioco e nell\'editor.'],
  ['#videoRenderer', 'row-label', 'Renderer', 'Renderer'],
  ['#videoRenderer', 'row-desc', 'Standard WebGL or experimental raytracing preset with safe fallback.', 'WebGL normale oppure preset sperimentale raytracing con fallback sicuro.'],
  ['#videoVolumetricLighting', 'row-label', 'Volumetric lighting', 'Volumetric lighting'],
  ['#videoVolumetricLighting', 'row-desc', 'Enables screen-space light rays in the current renderer.', 'Abilita raggi luce screen-space nel renderer attuale.'],
  ['#videoEditorHud', 'row-label', 'Editor HUD', 'HUD editor'],
  ['#videoEditorHud', 'row-desc', 'Shows editor panels and helpers.', 'Mostra pannelli e helper dell\'editor.'],
  ['#videoVolumetricLighting', 'next-label', 'Enabled', 'Abilitato'],
  ['#videoEditorHud', 'next-label', 'Visible', 'Visibile'],
  ['#openGameplayTune', 'row-label', 'Driving setup', 'Setup guida'],
  ['#openGameplayTune', 'row-desc', 'Open the driving parameters already available in the game.', 'Apri i parametri di guida gia presenti nel gioco.'],
  ['#openGameplayTune', 'text', 'Open setup', 'Apri setup'],
  ['#loadTxt', 'text', 'loading world…', 'caricamento mondo…'],
];

function applyRuntimeLanguage(){
  const L = GAME.i18n.lang;
  document.documentElement.lang = L;
  const pick = (en, it) => L === 'it' ? it : en;
  RUNTIME_DOM_I18N.forEach(item => {
    const node = document.querySelector(item[0]);
    if(!node) return;
    const value = pick(item[2], item[3]);
    if(item[1] === 'text') node.textContent = value;
    else if(item[1] === 'html') node.innerHTML = value;
    else if(item[1] === 'title') node.title = value;
    else if(item[1] === 'data-show') node.dataset.showLabel = value;
    else if(item[1] === 'data-hide') node.dataset.hideLabel = value;
    else if(item[1] === 'label') {
      const label = node.closest('.tuneRow, .settingsRow') ? node.closest('.tuneRow, .settingsRow').querySelector('.tuneName, .settingsName') : null;
      if(label) label.textContent = value;
    } else if(item[1] === 'desc') {
      const desc = node.closest('.tuneRow, .settingsRow') ? node.closest('.tuneRow, .settingsRow').querySelector('.tuneDesc, .settingsDesc') : null;
      if(desc) desc.textContent = value;
    } else if(item[1] === 'row-label') {
      const label = node.closest('.settingsRow') ? node.closest('.settingsRow').querySelector('.settingsName') : null;
      if(label) label.textContent = value;
    } else if(item[1] === 'row-desc') {
      const desc = node.closest('.settingsRow') ? node.closest('.settingsRow').querySelector('.settingsDesc') : null;
      if(desc) desc.textContent = value;
    } else if(item[1] === 'next-label') {
      const label = node.parentElement ? node.parentElement.querySelector('span') : null;
      if(label) label.textContent = value;
    }
  });
}
applyRuntimeLanguage();

// ------------------------------------------------ local assets
const RUNTIME_ASSETS = window.LK_RUNTIME_ASSETS;
const ASSET_DIR = RUNTIME_ASSETS.dirs;
const ASSETS = RUNTIME_ASSETS.paths;
const IS_FILE_MODE = RUNTIME_ASSETS.isFileMode;
GAME.assets = {dirs: ASSET_DIR, paths: ASSETS, isFileMode: IS_FILE_MODE};

// ------------------------------------------------ basics
const canvas = document.getElementById('c');
if(canvas && !canvas.hasAttribute('tabindex')) canvas.tabIndex = -1;
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const VIDEO_SETTINGS = window.LK_RUNTIME_SETTINGS_MENU.createVideo({
  renderer,
  pixelRatio: () => devicePixelRatio,
  size: () => ({width: innerWidth, height: innerHeight}),
});
const VIDEO = VIDEO_SETTINGS.values;
function applyVideoSettings(){
  VIDEO_SETTINGS.apply();
}
applyVideoSettings();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1420);
scene.fog = new THREE.FogExp2(0x0e1420, 0.008);

const camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.1, 500);

addEventListener('resize', () => {
  if(GAME.player && GAME.player.applyCameraCfg) GAME.player.applyCameraCfg();
  else { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); }
  applyVideoSettings();
});

// ------------------------------------------------ lights (dusk lot)
const hemi = new THREE.HemisphereLight(0x35507a, 0x141210, 0.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffd9a0, 0.85);
sun.position.set(60, 80, -40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 250;
sun.shadow.bias = -0.0006;
scene.add(sun);

// ------------------------------------------------ world state / editable entity registry
const WORLD_STATE = window.LK_RUNTIME_WORLD_STATE.create({lot:72, wallH:4, seed:1337});
const LOT = WORLD_STATE.constants.LOT;               // half-size of drivable lot
const WALL_H = WORLD_STATE.constants.WALL_H;
const circleColliders = WORLD_STATE.colliders.circle;   // {x,z,r}
const boxColliders = WORLD_STATE.colliders.box;         // {x,z,hx,hz} axis-aligned
const REGISTRY = WORLD_STATE.registry;
function srand(){ return WORLD_STATE.srand(); }
function tagEntity(obj, name, type, opts){
  return WORLD_STATE.tagEntity(obj, name, type, opts);
}
function unregisterEntity(obj){
  WORLD_STATE.unregisterEntity(obj);
}

tagEntity(hemi, 'Hemisphere Light', 'light');
tagEntity(sun, 'Sun / Moon Light', 'light');

// ------------------------------------------------ default track/world generation
const WORLD_GENERATOR = window.LK_RUNTIME_WORLD_GENERATION.create({
  THREERef: THREE,
  scene,
  tagEntity,
  colliders: {circle: circleColliders, box: boxColliders},
  srand,
  constants: {LOT, WALL_H},
});
const WORLD_TRACK = WORLD_GENERATOR.buildDefaultParkingLot({
  id: 'default-parking-lot',
  name: 'Parking Lot',
});
const parkedGroups = WORLD_TRACK.parkedGroups;
const cones = WORLD_TRACK.cones;
const lampMat = WORLD_TRACK.materials.lamp;
const pl1 = WORLD_TRACK.lights.pl1;
const pl2 = WORLD_TRACK.lights.pl2;

// ------------------------------------------------ dynamic sky: day/night cycle
const SKY = window.LK_RUNTIME_SKY.createSky({
  scene, renderer, paths: ASSETS, isFileMode: IS_FILE_MODE,
  sun, hemi, lampMat, pl1, pl2,
});

// ------------------------------------------------ rain (environment weather)
// audio passato come accessor lazy: SFX viene creato piu' in basso nel file
const RAIN = window.LK_RUNTIME_RAIN ? window.LK_RUNTIME_RAIN.create({scene, audio: {
  getContext: () => SFX.getContext(),
  getSfxGain: () => SFX.getSfxGain(),
}}) : null;
// la pioggia segue il veicolo e si anima anche in editor (i frame hook girano
// in entrambi i loop); le nuvole volumetriche avanzano qui solo in editor,
// in gameplay le fa avanzare SKY.update.
GAME.hooks.frame.push(dt => {
  if(RAIN) RAIN.update(dt, GAME.player.car ? GAME.player.car.position : null);
  if(GAME.state.editorActive && SKY.volClouds) SKY.volClouds.tick(dt);
});

// ------------------------------------------------ player car
const car = new THREE.Group();
const carVisual = new THREE.Group();   // procedural body — replaced if a GLTF model loads
car.add(carVisual);
const PLAYER_LIGHT_RIG = window.LK_RUNTIME_PLAYER_LIGHT_RIG.create({
  THREERef: THREE,
  car,
  tagEntity,
  getSky: () => SKY,
  getKeys: () => keys,
  getEngine: () => ENGINE,
  getSpeed: () => speedKmh,
  isEditorActive: () => GAME.state.editorActive,
});
const PLAYER_LIGHT_CFG = PLAYER_LIGHT_RIG.config;
const PLAYER_EXHAUST_CFG = {
  enabled:true,
  dummyVisible:true,
  intensity:1,
  smoke:true,
  idleSmoke:true,
  smokeThrottle:.18,
  fire:true,
  fireRpm:.88,
  shiftFire:true,
  limiterFire:true,
  sources:[
    {enabled:true},
    {enabled:true},
  ],
};
const PLAYER_SKID_CFG = {
  enabled:true,
  dummyVisible:true,
  width:.24,
  length:.7,
  opacity:.55,
  life:14,
  sources:[
    {enabled:true, wheel:'rearLeft', offset:[-.92,.03,-1.35], scale:[1,1,1]},
    {enabled:true, wheel:'rearRight', offset:[.92,.03,-1.35], scale:[1,1,1]},
    {enabled:true, wheel:'frontLeft', offset:[-.92,.03,1.35], scale:[1,1,1]},
    {enabled:true, wheel:'frontRight', offset:[.92,.03,1.35], scale:[1,1,1]},
  ],
};
const playerExhaustRig = {sources:[]};
const playerSkidRig = {sources:[]};
let exhaustTestPulse = 0;
function defaultExhaustSourceConfig(){
  return {enabled:true};
}
{
  const bodyMat = new THREE.MeshStandardMaterial({color:0xef476f, roughness:.3, metalness:.55});
  const dark = new THREE.MeshStandardMaterial({color:0x0e1013, roughness:.4, metalness:.4});
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, .55, 4.1), bodyMat);
  body.position.y = .55; body.castShadow = true; carVisual.add(body);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, .18, 1.2), bodyMat);
  hood.position.set(0, .9, 1.5); hood.castShadow = true; carVisual.add(hood);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, .5, 1.9), dark);
  cab.position.set(0, 1.05, -.35); cab.castShadow = true; carVisual.add(cab);
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, .1, .45), dark);
  spoiler.position.set(0, 1.15, -1.95); carVisual.add(spoiler);
  const hl = new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xfff2c0, emissiveIntensity:2});
  const tl = new THREE.MeshStandardMaterial({color:0xff0000, emissive:0xff2222, emissiveIntensity:1.6});
  for(const s of [-1,1]){
    const h = new THREE.Mesh(new THREE.BoxGeometry(.34,.16,.08), hl);
    h.position.set(s*.6,.62,2.06); carVisual.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(.42,.14,.08), tl);
    t.position.set(s*.6,.62,-2.06); t.visible = false; carVisual.add(t);
  }
}
function createExhaustSourceRig(idx, cfg){
  const side = idx % 2 === 0 ? -1 : 1;
  const row = Math.floor(idx / 2);
  const anchor = new THREE.Group();
  anchor.position.set(side * .42, .42, -2.22 - row * .18);
  anchor.rotation.y = Math.PI;
  anchor.userData.editorType = 'playerEffect';
  anchor.userData.builtin = true;
  anchor.userData.editorName = 'Exhaust Smoke Source ' + (idx + 1);
  const helper = new THREE.Mesh(
    new THREE.ConeGeometry(.18, .55, 14),
    new THREE.MeshBasicMaterial({color:0x9aa3b8, wireframe:true, transparent:true, opacity:.9, depthTest:false, depthWrite:false})
  );
  helper.rotation.x = Math.PI / 2;
  helper.userData.helperOnly = true;
  helper.renderOrder = 999;
  anchor.add(helper);
  car.add(anchor);
  tagEntity(anchor, anchor.userData.editorName, 'playerEffect', {id:'player_exhaust_' + idx});
  playerExhaustRig.sources[idx] = {anchor, helper};
  return playerExhaustRig.sources[idx];
}
function defaultSkidSourceConfig(idx){
  const defaults = [
    {wheel:'rearLeft', offset:[-.92,.03,-1.35]},
    {wheel:'rearRight', offset:[.92,.03,-1.35]},
    {wheel:'frontLeft', offset:[-.92,.03,1.35]},
    {wheel:'frontRight', offset:[.92,.03,1.35]},
  ];
  const d = defaults[idx];
  if(d) return {enabled:true, wheel:d.wheel, offset:d.offset.slice(), scale:[1,1,1]};
  const side = idx % 2 === 0 ? -1 : 1;
  const row = Math.floor((idx - defaults.length) / 2);
  return {enabled:true, wheel:'extra' + (idx + 1), offset:[side * .92, .03, -1.35 - row * .16], scale:[1,1,1]};
}
function skidWheelKey(idx, cfg){
  return (cfg && cfg.wheel) || defaultSkidSourceConfig(idx).wheel || ('extra' + (idx + 1));
}
function skidWheelLabel(wheel, idx){
  const labels = {
    rearLeft:'Rear Skid L',
    rearRight:'Rear Skid R',
    frontLeft:'Front Skid L',
    frontRight:'Front Skid R',
  };
  return labels[wheel] || ('Skid Mark Source ' + (idx + 1));
}
function isRearSkidWheel(wheel){ return wheel === 'rearLeft' || wheel === 'rearRight' || /^extra/.test(wheel || ''); }
function isFrontSkidWheel(wheel){ return wheel === 'frontLeft' || wheel === 'frontRight'; }
function normalizeSkidSource(idx){
  const base = defaultSkidSourceConfig(idx);
  const cfg = PLAYER_SKID_CFG.sources[idx] || {};
  PLAYER_SKID_CFG.sources[idx] = Object.assign({}, base, cfg, {
    wheel: cfg.wheel || base.wheel,
    offset: (cfg.offset || base.offset).slice ? (cfg.offset || base.offset).slice() : base.offset.slice(),
    scale: (cfg.scale || base.scale).slice ? (cfg.scale || base.scale).slice() : base.scale.slice(),
  });
  return PLAYER_SKID_CFG.sources[idx];
}
function createSkidSourceRig(idx, cfg){
  cfg = cfg || normalizeSkidSource(idx);
  const anchor = new THREE.Group();
  const off = cfg.offset || defaultSkidSourceConfig(idx).offset;
  const sc = cfg.scale || [1,1,1];
  const wheel = skidWheelKey(idx, cfg);
  const label = skidWheelLabel(wheel, idx);
  anchor.position.set(off[0] || 0, off[1] == null ? .03 : off[1], off[2] == null ? -1.35 : off[2]);
  anchor.scale.set(sc[0] || 1, sc[1] || 1, sc[2] || 1);
  anchor.userData.editorType = 'playerSkid';
  anchor.userData.builtin = true;
  anchor.userData.skidIndex = idx;
  anchor.userData.skidWheel = wheel;
  anchor.userData.editorName = label;
  const helperGeo = new THREE.BufferGeometry();
  helperGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -.12, 0, -.35,  .12, 0, -.35,
     .12, 0, -.35,  .12, 0,  .35,
     .12, 0,  .35, -.12, 0,  .35,
    -.12, 0,  .35, -.12, 0, -.35,
    -.12, 0,    0,  .12, 0,    0,
       0, 0, -.35,    0, 0,  .35,
  ], 3));
  const helper = new THREE.LineSegments(
    helperGeo,
    new THREE.LineBasicMaterial({color:0x111111, transparent:true, opacity:.95, depthTest:false, depthWrite:false})
  );
  helper.visible = false;
  helper.userData.helperOnly = true;
  helper.renderOrder = 999;
  anchor.add(helper);
  car.add(anchor);
  tagEntity(anchor, anchor.userData.editorName, 'playerSkid', {id:'player_skid_' + idx});
  playerSkidRig.sources[idx] = {anchor, helper};
  return playerSkidRig.sources[idx];
}
function ensureExhaustRigs(){
  for(let i=0;i<PLAYER_EXHAUST_CFG.sources.length;i++){
    if(!PLAYER_EXHAUST_CFG.sources[i]) PLAYER_EXHAUST_CFG.sources[i] = defaultExhaustSourceConfig();
    if(!playerExhaustRig.sources[i]) createExhaustSourceRig(i, PLAYER_EXHAUST_CFG.sources[i]);
  }
}
function ensureSkidRigs(){
  for(let i=PLAYER_SKID_CFG.sources.length;i<4;i++) PLAYER_SKID_CFG.sources[i] = defaultSkidSourceConfig(i);
  for(let i=0;i<PLAYER_SKID_CFG.sources.length;i++){
    const cfg = normalizeSkidSource(i);
    if(!playerSkidRig.sources[i]) createSkidSourceRig(i, PLAYER_SKID_CFG.sources[i]);
    const rig = playerSkidRig.sources[i];
    if(rig && rig.anchor){
      const wheel = skidWheelKey(i, cfg);
      rig.anchor.userData.skidWheel = wheel;
      rig.anchor.userData.editorName = skidWheelLabel(wheel, i);
    }
  }
}
function updatePlayerLights(){ (PLAYER_LIGHT_RIG.syncTimeOfDay || PLAYER_LIGHT_RIG.update)(); }
function setPlayerLightConfig(patch){ PLAYER_LIGHT_RIG.setConfig(patch); }
function addPlayerAuxLight(preset){ return PLAYER_LIGHT_RIG.addAux(preset); }
function applyPlayerExhaustConfig(){
  ensureExhaustRigs();
  const show = !!PLAYER_EXHAUST_CFG.dummyVisible && !!GAME.state.editorActive;
  for(const rig of playerExhaustRig.sources) if(rig && rig.helper) rig.helper.visible = show;
}
function setPlayerExhaustConfig(patch){
  if(!patch) return;
  if(patch.sources) patch.sources.forEach((v, i) => {
    if(!v) return;
    if(!PLAYER_EXHAUST_CFG.sources[i]) PLAYER_EXHAUST_CFG.sources[i] = defaultExhaustSourceConfig();
    Object.assign(PLAYER_EXHAUST_CFG.sources[i], v);
  });
  const rest = Object.assign({}, patch);
  delete rest.sources;
  Object.assign(PLAYER_EXHAUST_CFG, rest);
  if(PLAYER_EXHAUST_CFG.sources.length === 2 && PLAYER_EXHAUST_CFG.sources[0] && PLAYER_EXHAUST_CFG.sources[1] && PLAYER_EXHAUST_CFG.sources[1].enabled === false && !PLAYER_EXHAUST_CFG.sources[1].userDisabled){
    PLAYER_EXHAUST_CFG.sources[1].enabled = true;
  }
  ensureExhaustRigs();
  applyPlayerExhaustConfig();
}
function applyPlayerSkidConfig(){
  ensureSkidRigs();
  const show = !!PLAYER_SKID_CFG.dummyVisible && !!GAME.state.editorActive && !GAME.state.editorPreview;
  for(const rig of playerSkidRig.sources) if(rig && rig.helper) rig.helper.visible = show;
}
function setPlayerSkidConfig(patch){
  if(!patch) return;
  if(patch.sources) patch.sources.forEach((v, i) => {
    if(!v) return;
    if(!PLAYER_SKID_CFG.sources[i]) PLAYER_SKID_CFG.sources[i] = defaultSkidSourceConfig(i);
    Object.assign(PLAYER_SKID_CFG.sources[i], v);
    normalizeSkidSource(i);
    const rig = playerSkidRig.sources[i];
    if(rig && rig.anchor){
      if(v.offset) rig.anchor.position.set(v.offset[0] || 0, v.offset[1] == null ? .03 : v.offset[1], v.offset[2] == null ? -1.35 : v.offset[2]);
      if(v.scale) rig.anchor.scale.set(v.scale[0] || 1, v.scale[1] || 1, v.scale[2] || 1);
      const wheel = skidWheelKey(i, PLAYER_SKID_CFG.sources[i]);
      rig.anchor.userData.skidWheel = wheel;
      rig.anchor.userData.editorName = skidWheelLabel(wheel, i);
    }
  });
  const rest = Object.assign({}, patch);
  delete rest.sources;
  Object.assign(PLAYER_SKID_CFG, rest);
  ensureSkidRigs();
  applyPlayerSkidConfig();
}
function syncPlayerSkidSource(anchor){
  if(!anchor || anchor.userData.skidIndex == null) return;
  const cfg = PLAYER_SKID_CFG.sources[anchor.userData.skidIndex];
  if(!cfg) return;
  cfg.offset = [anchor.position.x, anchor.position.y, anchor.position.z];
  cfg.scale = [anchor.scale.x, anchor.scale.y, anchor.scale.z];
}
function addPlayerSkidSource(preset){
  const idx = PLAYER_SKID_CFG.sources.length;
  PLAYER_SKID_CFG.sources.push(Object.assign(defaultSkidSourceConfig(idx), preset || {}));
  ensureSkidRigs();
  applyPlayerSkidConfig();
  return playerSkidRig.sources[idx] && playerSkidRig.sources[idx].anchor;
}
function addPlayerExhaustSource(preset){
  const idx = PLAYER_EXHAUST_CFG.sources.length;
  PLAYER_EXHAUST_CFG.sources.push(Object.assign(defaultExhaustSourceConfig(), preset || {}));
  ensureExhaustRigs();
  applyPlayerExhaustConfig();
  return playerExhaustRig.sources[idx] && playerExhaustRig.sources[idx].anchor;
}
PLAYER_LIGHT_RIG.build();
PLAYER_LIGHT_RIG.apply();
ensureExhaustRigs();
applyPlayerExhaustConfig();
ensureSkidRigs();
applyPlayerSkidConfig();
const wheelGeo = new THREE.CylinderGeometry(.38,.38,.32,14);
const wheelMat = new THREE.MeshStandardMaterial({color:0x101216, roughness:.9});
const rimMat = new THREE.MeshStandardMaterial({color:0xd9d9d9, roughness:.3, metalness:.8});
const wheels = [];
for(const [wx, wz, front] of [[-.92,1.35,1],[.92,1.35,1],[-.92,-1.35,0],[.92,-1.35,0]]){
  const pivot = new THREE.Group(); pivot.position.set(wx,.38,wz);
  const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI/2; w.castShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,.34,8), rimMat); rim.rotation.z = Math.PI/2;
  pivot.add(w); pivot.add(rim); carVisual.add(pivot);
  wheels.push({pivot, mesh:w, rim, front:!!front, spin:0});
}
scene.add(car);
tagEntity(car, 'player_car (Logic)', 'player');

const PLAYER_DATA_WIDGETS = window.LK_RUNTIME_PLAYER_DATA_WIDGETS.create({
  THREERef: THREE,
  car,
  tagEntity,
  getMetrics: () => ({
    driftScore,
    lastLatG,
    speedKmh,
    rpm: ENGINE.rpm,
    drifting: lastCamDrifting,
    driftSide: Math.abs(lastCamVR) > .35 ? Math.sign(lastCamVR) : (Math.abs(P.steer) > .08 ? Math.sign(P.steer) : 1),
  }),
  isEditorActive: () => !!GAME.state.editorActive,
  isEditorPreview: () => !!GAME.state.editorPreview,
  getSelected: () => GAME.editor && GAME.editor.state && GAME.editor.state.selected,
});

// ------------------------------------------------ car physics
// Axle slip-angle model ("bicycle model" + friction circle):
// - lateral tire force per axle saturates with the slip angle (tanh ≈ Pacejka-lite)
// - RWD: throttle usage eats rear lateral grip (friction circle) → power oversteer
// - weight transfer front/rear modulates axle grip (lift-off oversteer on entry)
// - handbrake locks the rear axle only (rear μ collapses) → drift entry
// - service brake mainly eats front grip, so braking pushes wide instead of spinning like the handbrake.
// Countersteer and slide-holding emerge naturally from the model.
const SPAWN = {x: 0, z: 55, heading: 0};   // editable from the engine editor
const P = {
  pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z),
  heading: SPAWN.heading,
  vel: new THREE.Vector3(),
  yawRate: 0,                 // rad/s
  steer: 0,
};
car.position.copy(P.pos);
car.rotation.y = P.heading;
const G_ACC = 9.81;
const CFG = {
  // powertrain / brakes (accelerations, m/s²)
  accel: 56, revAccel: 17, brake: 7.2, maxSpeed: 48,
  drag: 0.18,                 // linear drag coef (1/s)
  // chassis
  axleF: 1.30, axleR: 1.30,   // CG → front / rear axle [m]
  cgHeight: 0.52,             // weight transfer strength
  kSq: 1.35,                  // yaw inertia / mass [m²]
  // tires
  muF: 1.06, muR: 1.00,       // friction coefficient per axle
  stiffF: 6.5, stiffR: 7.5,   // slip-angle sharpness
  rearFalloff: 0.28,          // rear grip drop past the peak → slides sustain
  powerOver: 1.25,            // how much throttle usage eats rear lateral grip
  hbMuR: 0.42,                // rear μ multiplier while handbrake is pulled
  // steering
  steerMax: 0.60,             // rad at standstill
  steerHiSpeed: 0.34,         // fraction of steerMax kept at very high speed
  // drift feel (arcade assists on top of the model)
  driftAssist: 1.05,          // direct yaw authority while sliding (countersteer feel)
  driftGasPush: 3.05,         // throttle keeps the tail alive while drifting
  driftThrottlePull: 0.78,    // light recovery so the car stays playful, not rail-guided
  yawDamp: 0.55,
  driftEnterSlip: 0.34,       // rear slip angle [rad] that starts a drift
  driftEnterVy: 3.2, driftExitVy: 1.5, driftMinSpeed: 8,
};
const BASE_CFG = Object.freeze({...CFG});
const DRIVE = {
  steerResponse: 6.5,         // how fast the wheel turns toward the key input
  brakeBias: 0.56,            // longitudinal braking balance
  brakeDriveLock: 0.82,       // service-brake front slip intensity
  brakeWheelScale: 0.14,      // raycast wheel brake force scale (prevents stoppies)
  handbrakeWheelScale: 0.18,  // rear lock force scale for drift entry, not instant spin
  chassisLift: 0,
  wheelspin: 2.15,            // drive force allowed past rear grip (wheelspin margin)
  driftDrive: 0.68,           // forward push retained while the rear is sliding
  shiftOverrun: 0,            // extra limiter hold before upshift while drifting
  burnoutHold: 1.05,          // seconds: rear tires keep slipping after a standing burnout starts
  burnoutWheelspin: 3.45,     // rear drive force margin while the tires are intentionally spinning
  burnoutFrontBrakeScale: 0.34, // standing burnout line-lock strength on the front axle
  burnoutReleaseDrive: 0.56,  // how hard the rear keeps pushing when brake is released from burnout
  reverseDelay: 0.5,           // automatic reverse engagement delay after stopping [s]
  horsepower: 450,
  powerScale: 1,
};
const BASE_DRIVE = Object.freeze({...DRIVE});
const PLAYER_COLLISION = {hx:0.92, hy:0.42, hz:1.85, offsetY:0.45, bodyY:0.55, radius:1.4};
const BASE_PLAYER_COLLISION = Object.freeze({...PLAYER_COLLISION});
const ENGINE = {
  gear: 1,
  rpm: 1100,
  rpm01: 0,
  torque01: .6,
  shiftTimer: 0,
  limiterTimer: 0,
  shiftPulse: 0,
  limiterPulse: 0,
  throttle: 0,
  reverseActive: false,
  burnout: false,
  driftShiftSpeed: 0,
};
const GEARBOX = Object.freeze({
  idle: 950,
  redline: 6900,
  limiter: 7600,
  upshift: 7050,
  downshift: 2700,
  limiterHold: .34,
  shiftCut: .34,
  tops: [13, 22, 31, 40, 52],     // m/s per gear at redline
  torque: [1.55, 1.34, 1.16, 1.02, .92],
});

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function dampAlpha(rate, dt){ return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)); }
function angleDelta(target, current){
  return ((target - current + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
}
function yawQuat(q){
  return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
}
function sampleDriveCurve(key, rpm01, fallback){
  const curves = DRIVE.curves;
  if(!curves || !curves[key] || typeof curves.sample !== 'function') return fallback;
  return curves.sample(curves[key], clamp(rpm01 || 0, 0, 1));
}
function resetEngine(){
  ENGINE.gear = 1;
  ENGINE.rpm = GEARBOX.idle;
  ENGINE.rpm01 = 0;
  ENGINE.torque01 = .6;
  ENGINE.shiftTimer = 0;
  ENGINE.limiterTimer = 0;
  ENGINE.shiftPulse = 0;
  ENGINE.limiterPulse = 0;
  ENGINE.throttle = 0;
  ENGINE.reverseActive = false;
  ENGINE.driftShiftSpeed = 0;
}
function updateEngineModel(vF, throttle, sliding, dt, driftCtx){
  driftCtx = driftCtx || {};
  const speed = Math.abs(vF);
  const driftSpeed = Number.isFinite(driftCtx.speedTot) ? Math.abs(driftCtx.speedTot) : speed;
  const driftLat = Number.isFinite(driftCtx.lateral) ? driftCtx.lateral : 0;
  const driftForward = Number.isFinite(driftCtx.forward) ? driftCtx.forward : vF;
  const driftAngle = Math.atan2(Math.abs(driftLat), Math.max(0.1, Math.abs(driftForward)));
  const driftAngle01 = clamp(driftAngle / 0.86, 0, 1);
  const driftActive = !!(sliding && driftCtx.active && throttle > .05);
  if(!driftActive || !ENGINE.driftShiftSpeed) ENGINE.driftShiftSpeed = driftSpeed;
  const previousDriftShiftSpeed = ENGINE.driftShiftSpeed;
  const driftDecel = driftActive && driftSpeed < previousDriftShiftSpeed - 0.05;
  ENGINE.driftShiftSpeed += (driftSpeed - ENGINE.driftShiftSpeed) * Math.min(1, dt * 5.5);
  ENGINE.throttle = throttle;
  ENGINE.shiftTimer = Math.max(0, ENGINE.shiftTimer - dt);
  ENGINE.limiterTimer = Math.max(0, ENGINE.limiterTimer - dt);
  ENGINE.shiftPulse = Math.max(0, ENGINE.shiftPulse - dt);
  ENGINE.limiterPulse = Math.max(0, ENGINE.limiterPulse - dt);
  const g = ENGINE.gear - 1;
  const top = GEARBOX.tops[g] || GEARBOX.tops[0];
  const rpmSpeed = driftActive
    ? Math.max(speed, driftSpeed * (0.58 + throttle * .22 + (1 - driftAngle01) * .12))
    : speed;
  let targetRpm = GEARBOX.idle + clamp(rpmSpeed / top, 0, 1.25) * (GEARBOX.redline - GEARBOX.idle);
  if(throttle > .05){
    targetRpm += 650 * throttle;
    if(sliding || speed < 8) targetRpm += (sliding ? (1450 + driftAngle01 * 520) : 1250) * throttle;
  }
  if(ENGINE.shiftTimer > 0) targetRpm *= .58;
  const slew = throttle > .05 ? 7.2 : 4.0;
  ENGINE.rpm += (targetRpm - ENGINE.rpm) * Math.min(1, dt * slew);
  if(throttle > .05 && ENGINE.rpm > GEARBOX.upshift && ENGINE.gear < GEARBOX.tops.length && ENGINE.shiftTimer <= 0){
    const nextTop = GEARBOX.tops[ENGINE.gear] || top;
    const driftShiftSpeed = driftActive ? Math.max(speed, driftSpeed * (0.66 - driftAngle01 * .18)) : speed;
    const driftCanUpshift = !driftActive || (
      driftShiftSpeed > top * (0.98 + driftAngle01 * .12) &&
      driftSpeed > nextTop * (0.46 + driftAngle01 * .08) &&
      driftAngle01 < .94
    );
    if(!driftCanUpshift){
      if(driftActive){
        // In drift, hold the engine in a usable high-rpm band instead of
        // repeatedly cutting torque on the limiter while the rear tires spin.
        ENGINE.rpm = Math.min(ENGINE.rpm, GEARBOX.redline + 130 + driftAngle01 * 180);
      } else {
        ENGINE.limiterTimer = Math.max(ENGINE.limiterTimer, .13 + (DRIVE.shiftOverrun || 0) * .7);
        ENGINE.limiterPulse = Math.max(ENGINE.limiterPulse, .14);
      }
    } else if(ENGINE.limiterTimer <= 0){
      ENGINE.limiterTimer = GEARBOX.limiterHold + (sliding ? (DRIVE.shiftOverrun || 0) : 0);
      ENGINE.limiterPulse = .18;
    } else if(ENGINE.limiterTimer < .08){
      ENGINE.gear++;
      ENGINE.shiftTimer = GEARBOX.shiftCut;
      ENGINE.shiftPulse = .24;
      ENGINE.limiterTimer = 0;
      ENGINE.rpm *= .70;
    }
  } else if(driftActive && ENGINE.gear > 1 && ENGINE.shiftTimer <= 0 && ENGINE.limiterTimer <= 0 && driftAngle01 > .24 && (driftDecel || ENGINE.rpm < 4350) && driftSpeed < top * (0.64 + driftAngle01 * .08) && ENGINE.rpm < (5000 + driftAngle01 * 520)){
    ENGINE.gear--;
    ENGINE.rpm = Math.min(GEARBOX.redline * .94, Math.max(ENGINE.rpm * 1.30, 4550 + driftAngle01 * 950));
    ENGINE.shiftPulse = .16;
  } else if(ENGINE.rpm < GEARBOX.downshift && ENGINE.gear > 1 && (throttle > .05 || speed < GEARBOX.tops[ENGINE.gear - 2] * .42)){
    ENGINE.gear--;
    ENGINE.rpm = Math.min(GEARBOX.redline * .92, ENGINE.rpm * 1.34);
  }
  if(ENGINE.rpm > GEARBOX.limiter || ENGINE.limiterTimer > 0){
    ENGINE.rpm = GEARBOX.redline + Math.sin(performance.now() * .075) * 520;
  }
  const rev01 = clamp((ENGINE.rpm - GEARBOX.idle) / (GEARBOX.redline - GEARBOX.idle), 0, 1.12);
  const lowTorque = clamp((ENGINE.rpm - GEARBOX.idle) / 1150, 0, 1);
  const midTorque = clamp((6700 - ENGINE.rpm) / 900, .28, 1);
  let curve = clamp(.58 + lowTorque * .92 * midTorque + rev01 * .05, .46, 1.34);
  if(throttle > .05 && sliding){
    const lowRpmSupport = clamp((3200 - ENGINE.rpm) / 2200, 0, 1);
    curve = Math.max(curve, .84 + lowRpmSupport * .18);
  }
  curve *= clamp(sampleDriveCurve('torque', rev01, 1), .35, 1.8);
  if(throttle > .05 && sliding){
    curve *= clamp(sampleDriveCurve('driftTorque', rev01, 1), .35, 1.8);
  }
  ENGINE.rpm01 = clamp(rev01, 0, 1.12);
  const shiftTorque = driftActive
    ? clamp(.38 + driftAngle01 * .20 + Math.max(0, (DRIVE.powerScale || 1) - 1) * .09, .34, .74)
    : .25;
  const limiterTorque = driftActive
    ? clamp(.96 + driftAngle01 * .06, .94, 1.04)
    : .82;
  ENGINE.torque01 = curve * GEARBOX.torque[ENGINE.gear - 1] * (ENGINE.shiftTimer > 0 ? shiftTorque : (ENGINE.limiterTimer > 0 ? limiterTorque : 1));
  return ENGINE;
}

const PHYS_WORLD = window.LK_RUNTIME_PHYSICS_WORLD.create({
  CANNONRef: typeof CANNON !== 'undefined' ? CANNON : null,
  worldState: WORLD_STATE,
  playerState: P,
  playerCollision: PLAYER_COLLISION,
  constants: {LOT, WALL_H},
  colliders: {circle: circleColliders, box: boxColliders},
});
const PHYS = PHYS_WORLD.state;
const cannonVec = PHYS_WORLD.cannonVec;
const colliderSignature = PHYS_WORLD.colliderSignature;
const initPhysicsWorld = PHYS_WORLD.init;
const rebuildPhysicsStatics = PHYS_WORLD.rebuildStatics;
const syncCarBodyToPlayer = PHYS_WORLD.syncPlayer;
const rebuildPlayerPhysicsBody = PHYS_WORLD.rebuildPlayer;
const disposePhysicsWorld = PHYS_WORLD.dispose;
const setSurfaceWorldCollision = PHYS_WORLD.setSurfaceWorldCollision;

const DRIVE_TUNING = window.LK_RUNTIME_DRIVE_TUNING.create({
  config: CFG,
  baseConfig: BASE_CFG,
  drive: DRIVE,
  baseDrive: BASE_DRIVE,
  gearbox: GEARBOX,
  suspension: PHYS.suspension,
  onSuspensionChange: () => PHYS_WORLD.applySuspension(),
  collision: PLAYER_COLLISION,
  baseCollision: BASE_PLAYER_COLLISION,
  onCollisionChange: () => { if(PHYS.world && rebuildPlayerPhysicsBody) rebuildPlayerPhysicsBody(); },
  onChange: () => { if(GAME.editor && GAME.editor.state && GAME.editor.state.active && GAME.editor.markDirty) GAME.editor.markDirty(); },
  onExport: () => popup('TUNING EXPORTED', '#4be3a0'),
  clamp,
});
const setTuneOpen = DRIVE_TUNING.setOpen;
const toggleTunePanel = DRIVE_TUNING.toggle;

const AUDIO = {
  master: 1,
  car: 1,
  sfx: 1,
  music: 1,
};
let SETTINGS_MENU = null;
let setSettingsOpen = () => {};
let toggleSettingsMenu = () => {};

function applyAudioSettings(){
  SFX.setVolumes(AUDIO);
  RADIO.setVolume(AUDIO.master * AUDIO.music);
  MENU_MUSIC.setVolume(.55 * AUDIO.master * AUDIO.music);
}

function setAudioChannel(channel, value){
  if(SETTINGS_MENU){
    SETTINGS_MENU.setAudioChannel(channel, value);
    return;
  }
  if(AUDIO[channel] == null) return;
  AUDIO[channel] = clamp(value, 0, 1);
  applyAudioSettings();
}

function shouldShowMenuCursorForSource(source){
  if(source === 'gamepad' || source === 'touch') return false;
  if(source === 'keyboard' || source === 'mouse' || source === 'pen' || source === 'pointer') return true;
  if(INPUT && INPUT.describe){
    const info = INPUT.describe();
    const player = info && info.players && info.players[0];
    if(player && (player.deviceType === 'gamepad' || player.deviceType === 'touch')) return false;
    if(info && info.touchEnabled) return false;
  }
  return true;
}

function restoreRuntimeFocusAfterMenuClose(){
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if(active && active.closest && active.closest('#settingsOverlay') && active.blur) active.blur();
    if(!canvas || !canvas.focus) return;
    try { canvas.focus({preventScroll: true}); }
    catch(err){ try { canvas.focus(); } catch(err2){} }
  });
}

function initSettingsMenu(){
  SETTINGS_MENU = window.LK_RUNTIME_SETTINGS_MENU.createMenu({
    gameState: GAME.state,
    audio: AUDIO,
    video: VIDEO,
    applyAudio: applyAudioSettings,
    applyVideo: applyVideoSettings,
    shouldShowMenuCursor: shouldShowMenuCursorForSource,
    applyRuntimeCursor: syncRuntimeCursorState,
    restoreRuntimeFocus: restoreRuntimeFocusAfterMenuClose,
    onEditorExit: () => {
      if(GAME.editor) GAME.editor.exit(false);
    },
    onBackMenu: backToMainMenu,
    onOpenTune: () => setTuneOpen(true),
  });
  setSettingsOpen = SETTINGS_MENU.setOpen;
  toggleSettingsMenu = SETTINGS_MENU.toggle;
}
let handbrake = false, driftAngle = 0, speedKmh = 0, isDrifting = false, lastLatG = 0;
let axPrev = 0;                 // longitudinal accel of the previous step (weight transfer)
let lastSteerAngle = 0;         // actual front wheel angle (for the visual rig)
const PHYS_STEP = 1/120;        // fixed physics substep
const REVERSE_STOP_SPEED = 3 / 3.6; // 3 km/h: automatic reverse only after the car is nearly stopped
const REVERSE_BRAKE_DELAY = 0.5; // seconds: moving-to-reverse needs a short sustained braking phase
const BRAKE_RAMP_TIME = 1.45; // seconds: pedal pressure builds progressively instead of snapping on
let reverseEngageTimer = 0;
let reverseNeedsEngageDelay = false;
let reverseBrakeTimer = 0;
let reverseGearLatched = false;
let brakeHoldTimer = 0;
let burnoutTimer = 0;
function reverseBrakeDelay(){ return clamp(DRIVE.reverseDelay == null ? REVERSE_BRAKE_DELAY : DRIVE.reverseDelay, 0, 2); }
function playerCollisionRadius(){
  const explicit = Number(PLAYER_COLLISION.radius);
  if(Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(0.2, Math.hypot(PLAYER_COLLISION.hx || 0.92, PLAYER_COLLISION.hz || 1.85) * 0.62);
}
function updateBurnoutState(up, down, handbrakeOn, speedTot, dt){
  const hold = Math.max(.12, DRIVE.burnoutHold == null ? .85 : DRIVE.burnoutHold);
  const start = up && down && !handbrakeOn && !reverseGearLatched && speedTot < 2.6;
  const keep = burnoutTimer > 0 && !handbrakeOn && speedTot < 8.5 && (up || down);
  if(start) burnoutTimer = hold;
  else if(keep) burnoutTimer = up ? Math.max(burnoutTimer, .28) : Math.max(0, burnoutTimer - dt * .85);
  else burnoutTimer = Math.max(0, burnoutTimer - dt * 1.9);
  ENGINE.burnout = burnoutTimer > 0 && !handbrakeOn && speedTot < 8.5 && (up || down);
  return ENGINE.burnout ? clamp(burnoutTimer / hold, 0, 1) : 0;
}
const carRenderPos = new THREE.Vector3();
let carRenderHeading = 0, carRenderPitch = 0, carRenderRoll = 0, carRenderSnap = true;
const SURFACE = {
  ray: new THREE.Raycaster(),
  down: new THREE.Vector3(0, -1, 0),
  normal: new THREE.Vector3(0, 1, 0),
  wheelGrade: 0,
  y: 0,
  vy: 0,
  pitch: 0,
  roll: 0,
  prevTargetY: 0,
  airborne: false,
};
const SURFACE_UP = new THREE.Vector3(0, 1, 0);
const DRIVE_SURFACE_MAX_SLOPE_DEG = 50;
const DRIVE_SURFACE_MIN_NORMAL_Y = Math.cos(THREE.MathUtils.degToRad(DRIVE_SURFACE_MAX_SLOPE_DEG));
const SURFACE_TMP = {
  fwd: new THREE.Vector3(),
  side: new THREE.Vector3(),
  origin: new THREE.Vector3(),
  normal: new THREE.Vector3(),
};

function isDriveSurfaceObject(obj){
  let o = obj;
  while(o){
    const ud = o.userData || {};
    if(ud.editorType === 'player' || ud.helperOnly) return false;
    if(ud.driveSurface === true) return true;
    const col = ud.collider && ud.collider.ref;
    if(col && col.enabled !== false && !col.physics && (col.meshCollider === true || col.colliderMode === 'complex')) return true;
    if(ud.colliderShape && ud.colliderShape.mode === 'complex' && col && col.enabled !== false && !col.physics) return true;
    const e = ud.addedEntry || {};
    const prim = e.primitive || e.prim;
    if(prim === 'ramp' || prim === 'plane') return true;
    const text = String(ud.editorName || ud.assetName || o.name || '').toLowerCase();
    if(/\b(ramp|curb|sidewalk|pavement|road|floor|ground|surface|asphalt|marciapiede|salita|rampa)\b/.test(text)) return true;
    o = o.parent;
  }
  return false;
}

const surfaceRootsCache = {t: -1e9, list: []};
function driveSurfaceRoots(){
  const now = performance.now();
  if(now - surfaceRootsCache.t > 250){
    surfaceRootsCache.list = (GAME && GAME.world && GAME.world.registry)
      ? GAME.world.registry.filter(o => o && o.visible !== false && isDriveSurfaceObject(o))
      : [];
    surfaceRootsCache.t = now;
  }
  return surfaceRootsCache.list;
}

// Raycast against the real meshes first (correct for wedges, mountains, tilted
// boxes); the analytic collider-plane sample is only a fallback near edges.
function sampleDriveSurface(x, z){
  const toSurfaceSample = (y, n, hit) => {
    if(!n || y == null) return null;
    const normal = n.clone ? n.clone() : new THREE.Vector3(n.x || 0, n.y || 1, n.z || 0);
    normal.normalize();
    if(normal.lengthSq() < 0.001) return null;
    return {y, normal, hit: hit !== false};
  };
  const collider = WORLD_STATE && WORLD_STATE.sampleDriveSurfaceAt
    ? WORLD_STATE.sampleDriveSurfaceAt(x, z)
    : null;
  const colliderNormal = collider && collider.normal && collider.normal.y >= DRIVE_SURFACE_MIN_NORMAL_Y
    ? collider.normal
    : null;
  const colliderSample = toSurfaceSample(collider && collider.y, colliderNormal, collider != null);
  const roots = driveSurfaceRoots();
  if(colliderSample) return colliderSample;
  if(roots.length){
    SURFACE_TMP.origin.set(x, Math.max(18, (P.pos.y || 0) + 12), z);
    SURFACE.ray.set(SURFACE_TMP.origin, SURFACE.down);
    SURFACE.ray.far = SURFACE_TMP.origin.y + 24;
    const hits = SURFACE.ray.intersectObjects(roots, true);
    let unreachable = null;
    for(const hit of hits){
      if(!hit || !hit.face) continue;
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      if(n.y < DRIVE_SURFACE_MIN_NORMAL_Y) continue;
      const mesh = toSurfaceSample(hit.point.y, n, true);
      if(!mesh) continue;
      if(mesh.normal && colliderSample && mesh.normal.dot(colliderSample.normal) < 0) continue;
      // highest surface the car can actually stand on (skips decks overhead)
      if(hit.point.y <= (P.pos.y || 0) + .9) return mesh;
      unreachable = mesh;
    }
    if(unreachable) return unreachable;
  }
  return {y: 0, normal: SURFACE_UP, hit: false};
}

function driveSurfaceYAt(x, z){
  const s = sampleDriveSurface(x, z);
  return s && s.hit ? s.y : null;
}

function updateVehicleSurface(dt){
  const fwd = SURFACE_TMP.fwd.set(Math.sin(P.heading), 0, Math.cos(P.heading));
  const side = SURFACE_TMP.side.set(fwd.z, 0, -fwd.x);
  const halfWheelbase = 1.3;
  const halfTrack = .92;
  const speed = P.vel.length();
  const maxStepUp = Math.min(.85, .46 + speed * .014);
  const filterStep = s => {
    if(!s || s.y == null) return {y:0, normal:SURFACE_UP, hit:false};
    if(!SURFACE.airborne && s.y - SURFACE.y > maxStepUp) return {y:SURFACE.y, normal:SURFACE_UP, hit:false};
    return s;
  };
  const center = filterStep(sampleDriveSurface(P.pos.x, P.pos.z));
  const stabilizeSample = s => {
    if(!center.hit || (s && s.hit)) return s;
    return {y: center.y, normal: center.normal, hit: false};
  };
  const samples = [
    sampleDriveSurface(P.pos.x + fwd.x * halfWheelbase + side.x * halfTrack, P.pos.z + fwd.z * halfWheelbase + side.z * halfTrack),
    sampleDriveSurface(P.pos.x + fwd.x * halfWheelbase - side.x * halfTrack, P.pos.z + fwd.z * halfWheelbase - side.z * halfTrack),
    sampleDriveSurface(P.pos.x - fwd.x * halfWheelbase + side.x * halfTrack, P.pos.z - fwd.z * halfWheelbase + side.z * halfTrack),
    sampleDriveSurface(P.pos.x - fwd.x * halfWheelbase - side.x * halfTrack, P.pos.z - fwd.z * halfWheelbase - side.z * halfTrack),
  ];
  // step-filter BEFORE picking supports: walls/ledges above maxStepUp must not
  // pull the car up, whatever direction it approaches from
  const wheelSamples = samples.map(stabilizeSample).map(filterStep);
  const realHits = wheelSamples.filter(s => s.hit);
  const frontY = (wheelSamples[0].y + wheelSamples[1].y) * .5;
  const rearY = (wheelSamples[2].y + wheelSamples[3].y) * .5;
  const leftY = (wheelSamples[0].y + wheelSamples[2].y) * .5;
  const rightY = (wheelSamples[1].y + wheelSamples[3].y) * .5;
  const supportWeight = center.hit ? 2 : 0;
  const supportCount = realHits.length + supportWeight;
  const targetY = supportCount > 0
    ? (realHits.reduce((sum, s) => sum + s.y, 0) + center.y * supportWeight) / supportCount
    : wheelSamples.reduce((sum, s) => sum + s.y, 0) / wheelSamples.length;
  const ahead = sampleDriveSurface(P.pos.x + fwd.x * halfWheelbase * 2.4, P.pos.z + fwd.z * halfWheelbase * 2.4);
  const wheelGradeRaw = (frontY - rearY) / (halfWheelbase * 2);
  const avgNormal = SURFACE_TMP.normal.set(0, 0, 0);
  wheelSamples.forEach(s => avgNormal.add(s.normal));
  avgNormal.normalize();
  if(avgNormal.lengthSq() < .1) avgNormal.copy(SURFACE_UP);
  SURFACE.wheelGrade = clamp(wheelGradeRaw, -0.55, 0.55);

  const drop = SURFACE.y - targetY;
  const climb = Math.atan2(frontY - rearY, halfWheelbase * 2);
  // positive rotation.x pitches the nose down, so climbing (front higher) needs
  // the negated angle — this was inverted and made the car dive uphill
  const targetPitch = -climb;
  const rampLipDrop = frontY - ahead.y;
  const rampLaunch = climb > .08 && rampLipDrop > .22 && speed > 6.5;
  if(!SURFACE.airborne && (drop > .32 || rampLaunch) && speed > 5.5){
    SURFACE.airborne = true;
    SURFACE.vy = rampLaunch
      ? Math.max(2.2, Math.min(8.5, speed * (.14 + Math.min(.22, climb * .45))))
      : Math.max(1.4, Math.min(6.5, speed * .12));
  }
  if(SURFACE.airborne){
    SURFACE.vy -= 10.8 * dt;
    SURFACE.y += SURFACE.vy * dt;
    if(SURFACE.y <= targetY){
      SURFACE.y = targetY;
      SURFACE.vy = 0;
      SURFACE.airborne = false;
    }
  } else {
    SURFACE.y += (targetY - SURFACE.y) * dampAlpha(targetY > SURFACE.y ? 24 : 10, dt);
    SURFACE.vy = 0;
  }

  const targetRoll = Math.atan2(leftY - rightY, halfTrack * 2);
  SURFACE.pitch += (targetPitch - SURFACE.pitch) * dampAlpha(SURFACE.airborne ? 4 : 10, dt);
  SURFACE.roll += (targetRoll - SURFACE.roll) * dampAlpha(SURFACE.airborne ? 4 : 10, dt);
  SURFACE.normal.lerp(avgNormal, dampAlpha(12, dt)).normalize();
  P.pos.y = SURFACE.y;
  SURFACE.prevTargetY = targetY;
}

function applyDriveSurfaceGrade(dt){
  if(SURFACE.airborne || !SURFACE.normal) return;
  const fwd = SURFACE_TMP.fwd.set(Math.sin(P.heading), 0, Math.cos(P.heading));
  const slope = SURFACE.wheelGrade || 0;
  const grade = Math.abs(slope);
  if(grade < .004) return;
  const slopePower = 0.28 + grade * 1.85;
  const force = G_ACC * grade * slopePower;
  const dir = slope > 0 ? -1 : 1;
  P.vel.x += fwd.x * force * dt * dir;
  P.vel.z += fwd.z * force * dt * dir;
}

function applyPlayerVisual(vF, vR, steerAngle, up, down, dt){
  const snap = carRenderSnap;
  carRenderSnap = false;
  const bodyAlpha = snap ? 1 : dampAlpha(24, dt);
  const tiltAlpha = snap ? 1 : dampAlpha(12, dt);
  carRenderPos.lerp(P.pos, bodyAlpha);
  carRenderHeading += angleDelta(P.heading, carRenderHeading) * bodyAlpha;
  carRenderRoll += ((SURFACE.roll - vR * 0.008) - carRenderRoll) * tiltAlpha;
  carRenderPitch += ((SURFACE.pitch + (up ? -.02 : 0) + (down ? .025 : 0)) - carRenderPitch) * tiltAlpha;
  car.position.copy(carRenderPos);
  car.rotation.set(playerVisualBaseRotation.x + carRenderPitch, visibleHeadingFromRuntime(carRenderHeading), playerVisualBaseRotation.z + carRenderRoll);

  const visSteer = steerAngle * 1.25;
  for(const w of wheels){
    w.spin += vF * dt / .38;
    w.mesh.rotation.x = w.spin;
    w.rim.rotation.x = w.spin;
    if(w.front) w.pivot.rotation.y = visSteer;
  }
  RIG.drive(vF, dt, visSteer);
}

// cannon RaycastVehicle conventions (measured): negative engine force drives +Z
const CANNON_FWD_SIGN = -1;
const WHEEL_GRIP = 2.6;               // wheel frictionSlip at mu = 1
const wheelSuspVis = [0, 0, 0, 0];    // smoothed per-wheel suspension offsets

function wheelsOnGround(){
  const v = PHYS.vehicle;
  if(!v) return 0;
  let n = 0;
  for(const w of v.wheelInfos) if(w.isInContact) n++;
  return n;
}

function updateCarCannon(dt){
  if(!initPhysicsWorld()) return null;
  if(PHYS.staticsSignature !== colliderSignature()) rebuildPhysicsStatics();

  const body = PHYS.carBody;
  const vehicle = PHYS.vehicle;
  if(!vehicle) return null;
  const mass = body.mass || PHYS.mass;
  const bodyY = PLAYER_COLLISION.bodyY == null ? .55 : PLAYER_COLLISION.bodyY;
  const drive = readDriveInput();
  const throttleAmt = drive.throttle, brakeAmt = drive.brake;
  const up = throttleAmt > 0.05, down = brakeAmt > 0.05;
  handbrake = drive.handbrake;
  const steerTarget = clamp(drive.steer, -1, 1);
  const steerRate = DRIVE.steerResponse * (steerTarget === 0 || steerTarget * P.steer < 0 ? 1.6 : 1);
  P.steer += (steerTarget - P.steer) * Math.min(1, dt*steerRate);

  P.heading = yawQuat(body.quaternion);
  const fwd = new THREE.Vector3(Math.sin(P.heading), 0, Math.cos(P.heading));
  const rightV = new THREE.Vector3(fwd.z, 0, -fwd.x);
  let vx = body.velocity.x * fwd.x + body.velocity.z * fwd.z;
  let vy = body.velocity.x * rightV.x + body.velocity.z * rightV.z;
  const r = body.angularVelocity.y;
  const speed = Math.abs(vx);
  const speedTot = Math.hypot(vx, vy);
  const grounded = wheelsOnGround();
  const steerScale = CFG.steerHiSpeed + (1 - CFG.steerHiSpeed) * Math.exp(-speed / 20);
  const delta = P.steer * CFG.steerMax * steerScale;
  lastSteerAngle = delta;

  const L = CFG.axleF + CFG.axleR;
  const gF = G_ACC * CFG.axleR / L;
  const gR = G_ACC * CFG.axleF / L;

  // ---- longitudinal state machines (same feel as the classic model);
  // ax [m/s²] becomes engine force on the rear wheels, brakeA a wheel brake
  let ax = -CFG.drag * vx * (isDrifting && up ? .35 : 1);
  let driveA = 0, brakeA = 0, muRl = CFG.muR, muFl = CFG.muF;
  let handbrakeForce = 0;
  let burnoutFrontBrakeForce = 0;
  const burnout = updateBurnoutState(up, down, handbrake, speedTot, dt);
  const engine = updateEngineModel(vx, throttleAmt, isDrifting || handbrake || burnout > 0 || Math.abs(vy) > 2.0, dt, {
    active: isDrifting || handbrake || Math.abs(vy) > 2.0,
    speedTot,
    lateral: vy,
    forward: vx,
  });
  ENGINE.reverseActive = false;
  if(down && !up) brakeHoldTimer = Math.min(BRAKE_RAMP_TIME, brakeHoldTimer + dt);
  else brakeHoldTimer = 0;
  const brakeRamp = down ? (.22 + .78 * Math.pow(clamp(brakeHoldTimer / BRAKE_RAMP_TIME, 0, 1), 1.35)) : 0;
  if(handbrake){
    muRl *= CFG.hbMuR;
    handbrakeForce = mass * G_ACC * (DRIVE.handbrakeWheelScale == null ? .18 : DRIVE.handbrakeWheelScale);   // rear axle locked
  } else if(up){
    driveA = CFG.accel * engine.torque01 * throttleAmt * Math.max(0, 1 - Math.max(0, vx) / (CFG.maxSpeed * 1.08));
    driveA *= clamp(sampleDriveCurve('gearPull', ENGINE.rpm01 || 0, 1), .45, 1.8);
    // traction cap: brief wheelspin off the line, then hooked up — the cannon
    // wheels slide for real (killing grip AND drive) if we push far past it
    const launch = Math.exp(-Math.max(0, vx) / 4);
    const rpmWheelspin = clamp(sampleDriveCurve('wheelspin', ENGINE.rpm01 || 0, 1), .55, 1.65);
    const driveGrip = (burnout > 0 ? DRIVE.burnoutWheelspin * .92 : DRIVE.wheelspin * (.86 + .42 * launch)) * rpmWheelspin;
    driveA = Math.min(driveA, CFG.muR * G_ACC * driveGrip);
    const driveUse = Math.abs(driveA) / Math.max(.001, CFG.muR * G_ACC);
    if(up && !handbrake){
      const launchSlip = clamp((1 - clamp(speedTot / 15, 0, 1)) * Math.max(0, CFG.powerOver - .9) * driveUse * .10, 0, .20);
      const driftGripFloor = isDrifting ? .42 : .36;
      muRl *= clamp(1 - CFG.powerOver * .09 * driveUse - launchSlip, driftGripFloor, 1);
      muFl *= 1 + clamp(Math.abs(P.steer) * (.08 + Math.max(0, CFG.steerHiSpeed - BASE_CFG.steerHiSpeed) * .7), 0, .18);
    }
    ax += burnout > 0 && down ? driveA * .24 : driveA;
  }
  if(isDrifting && up && driveA > 0){
    const driftDrive = DRIVE.driftDrive == null ? .68 : DRIVE.driftDrive;
    const angle01 = clamp(Math.abs(vy) / Math.max(4, Math.abs(vx) + 2), 0, 1);
    const lowSpeed01 = clamp((18 - speedTot) / 12, 0, 1);
    ax += driveA * driftDrive * (.48 + .68 * angle01 + .42 * lowSpeed01);
  }
  if(burnout > 0){
    muRl *= Math.max(.10, 1 - .90 * burnout);
    if(down){
      burnoutFrontBrakeForce = mass * CFG.brake * brakeAmt * (DRIVE.burnoutFrontBrakeScale == null ? .34 : DRIVE.burnoutFrontBrakeScale);
      ax -= vx * (4.8 + 4.8 * burnout);
      if(vx < -.05) ax += CFG.brake * brakeAmt * burnout;
    } else {
      ax += driveA * (DRIVE.burnoutReleaseDrive == null ? .56 : DRIVE.burnoutReleaseDrive) * burnout;
    }
  }
  if(down && !burnout){
    const alreadyReversing = reverseGearLatched;
    const reverseDelay = reverseBrakeDelay();
    const settledForReverse = speedTot < REVERSE_STOP_SPEED && Math.abs(vx) < REVERSE_STOP_SPEED && Math.abs(vy) < .16 && Math.abs(P.yawRate) < .28 && !handbrake;
    if(alreadyReversing){
      reverseEngageTimer = reverseDelay;
      reverseBrakeTimer = reverseDelay;
    } else if(!settledForReverse){
      reverseNeedsEngageDelay = true;
      reverseBrakeTimer = Math.min(reverseDelay, reverseBrakeTimer + dt);
      reverseEngageTimer = 0;
    } else if(reverseNeedsEngageDelay){
      reverseBrakeTimer = Math.min(reverseDelay, reverseBrakeTimer + dt);
      reverseEngageTimer = reverseBrakeTimer;
    } else {
      reverseEngageTimer = reverseDelay;
      reverseBrakeTimer = reverseDelay;
    }
    const reverseAllowed = alreadyReversing || (settledForReverse && reverseEngageTimer >= reverseDelay);
    if(!reverseAllowed){
      if(!settledForReverse){
        brakeA = CFG.brake * brakeAmt * brakeRamp * (speedTot > 7 ? 1 : .85);
        if(Math.abs(vx) < .25 && speedTot > 2.2) brakeA += CFG.brake * brakeAmt * brakeRamp * .08;
      }
    }
    else {
      reverseNeedsEngageDelay = false;
      reverseGearLatched = true;
      ENGINE.reverseActive = true;
      updateEngineModel(vx, 0.55 * brakeAmt, false, dt);
      ax -= CFG.revAccel * brakeAmt * (1 + vx / 12);
    }
  } else {
    reverseEngageTimer = 0;
    reverseNeedsEngageDelay = false;
    reverseBrakeTimer = 0;
    reverseGearLatched = false;
  }

  // NOTE: no extra powerOver cut on frictionSlip — cannon's own friction
  // circle already couples drive and lateral grip per wheel; stacking a cut
  // on top made the car spin at full torque. Oversteer character comes from
  // the muF/muR balance (tuning slider) plus the drift assists below.
  if(brakeA){
    const driveLock = (DRIVE.brakeDriveLock == null ? 1 : DRIVE.brakeDriveLock);
    const frontUse = (brakeA * DRIVE.brakeBias * driveLock) / Math.max(.001, CFG.muF * gF);
    const rearUseBrake = (brakeA * (1 - DRIVE.brakeBias)) / Math.max(.001, CFG.muR * gR);
    muFl *= Math.max(.6, 1 - .3 * frontUse);
    muRl *= Math.max(.85, 1 - .1 * rearUseBrake);
  }

  // ---- map onto the raycast wheels: RWD engine force, braking, steering,
  // per-wheel grip (the drift character lives in the frictionSlip modulation)
  const rearForce = CANNON_FWD_SIGN * ax * mass * .5;
  vehicle.applyEngineForce(rearForce, 2);
  vehicle.applyEngineForce(rearForce, 3);
  vehicle.setSteeringValue(delta, 0);
  vehicle.setSteeringValue(delta, 1);
  const brakeForce = mass * brakeA * (DRIVE.brakeWheelScale == null ? .36 : DRIVE.brakeWheelScale);
  const frontBrake = brakeForce * DRIVE.brakeBias * .5 + burnoutFrontBrakeForce * .5;
  const rearBrake = brakeForce * (1 - DRIVE.brakeBias) * .5 + handbrakeForce * .5;
  vehicle.setBrake(frontBrake, 0);
  vehicle.setBrake(frontBrake, 1);
  vehicle.setBrake(rearBrake, 2);
  vehicle.setBrake(rearBrake, 3);
  vehicle.wheelInfos[0].frictionSlip = vehicle.wheelInfos[1].frictionSlip = WHEEL_GRIP * muFl;
  vehicle.wheelInfos[2].frictionSlip = vehicle.wheelInfos[3].frictionSlip = WHEEL_GRIP * muRl;

  // ---- arcade drift assists on top of the raycast model (wheels grounded)
  if(grounded >= 2){
    const parkingBlend = !handbrake && speedTot > .2 && speedTot < 6 ? (1 - speedTot / 6) : 0;
    const parkingYaw = (vx / L) * Math.tan(delta);
    const steerSoft = Math.sign(P.steer) * Math.pow(Math.abs(P.steer), 1.35);
    const fastDrift = isDrifting ? clamp((speedTot - 18) / 22, 0, 1) : 0;
    const yawAssist = (isDrifting ? steerSoft * CFG.driftAssist * (vx < 0 ? -1 : 1) * (2.05 - .55 * fastDrift) : 0)
      + (parkingYaw - r) * parkingBlend * 3.2
      - r * CFG.yawDamp * (1 + fastDrift * 1.65);
    body.torque.y += yawAssist * mass * CFG.kSq;
    if(isDrifting && up && Math.abs(vy) > .25){
      const pull = clamp(CFG.driftThrottlePull * dt * (1 - throttleAmt * .45), 0, .06);
      const hold = Math.sign(vy || P.steer || 1) * CFG.driftGasPush * dt * .78;
      body.velocity.x += rightV.x * (hold - vy * pull);
      body.velocity.z += rightV.z * (hold - vy * pull);
      if(speedTot < CFG.maxSpeed * 1.04){
        const lowSpeed01 = clamp((18 - speedTot) / 12, 0, 1);
        const push = (DRIVE.driftDrive == null ? .68 : DRIVE.driftDrive) * throttleAmt * CFG.driftGasPush * dt * (1.05 + .78 * lowSpeed01);
        body.velocity.x += fwd.x * push;
        body.velocity.z += fwd.z * push;
      }
    }
    if(burnout > 0 && up){
      const steerSoft = Math.sign(P.steer) * Math.pow(Math.abs(P.steer), 1.18);
      if(Math.abs(steerSoft) > .035){
        const yawKick = steerSoft * burnout * (down ? 3.6 : 2.4);
        body.torque.y += yawKick * mass * CFG.kSq;
        if(!down){
          const sideKick = steerSoft * burnout * throttleAmt * dt * 2.2;
          body.velocity.x += rightV.x * sideKick;
          body.velocity.z += rightV.z * sideKick;
        }
      }
    }
  }

  const beforeSpeed = Math.hypot(body.velocity.x, body.velocity.z);
  PHYS.world.step(PHYS_STEP, dt, 8);
  if(brakeA > 0 && grounded >= 2){
    const pitchDamp = clamp(dt * (4 + brakeAmt * 4), 0, .45);
    body.angularVelocity.x *= 1 - pitchDamp;
  }
  if(handbrake || isDrifting){
    const fastDrift = isDrifting ? clamp((speedTot - 18) / 22, 0, 1) : 0;
    const yawLimit = ((isDrifting ? 3.4 : 2.4) + Math.abs(P.steer) * 2.6 + (up ? .7 : 0)) * (1 - fastDrift * .34);
    body.angularVelocity.y = clamp(body.angularVelocity.y, -yawLimit, yawLimit);
  }
  if(handbrake && speedTot < 1.05){
    const stop = Math.min(1, dt * 9);
    body.velocity.x *= 1 - stop;
    body.velocity.z *= 1 - stop;
    body.angularVelocity.y *= 1 - stop;
    if(speedTot < .18){
      body.velocity.x = 0;
      body.velocity.z = 0;
      body.angularVelocity.y = 0;
    }
  }
  if(grounded >= 3 && !up && !down && !handbrake && Math.abs(P.steer) < .04 && speedTot < .28){
    body.velocity.x = 0;
    body.velocity.z = 0;
    body.angularVelocity.y = 0;
  }
  P.heading = yawQuat(body.quaternion);
  fwd.set(Math.sin(P.heading), 0, Math.cos(P.heading));
  rightV.set(fwd.z, 0, -fwd.x);
  const afterSpeed = Math.hypot(body.velocity.x, body.velocity.z);
  if(beforeSpeed - afterSpeed > 3) PHYS.lastImpact = Math.max(PHYS.lastImpact, beforeSpeed - afterSpeed);

  P.pos.set(body.position.x, body.position.y - bodyY, body.position.z);
  P.vel.set(body.velocity.x, 0, body.velocity.z);
  P.yawRate = body.angularVelocity.y;
  const physicsImpact = WORLD_STATE.collideCar({
    player: P,
    radius: playerCollisionRadius(),
    onlyPhysics: true,
    onObjectHit: col => {
      SFX.thud(.25);
      addPoints(col.hitScore, col.hitLabel || ('+' + col.hitScore));
    },
  });
  if(physicsImpact > 1.5) PHYS.lastImpact = Math.max(PHYS.lastImpact, physicsImpact);
  body.position.x = P.pos.x;
  body.position.z = P.pos.z;
  body.velocity.x = P.vel.x;
  body.velocity.z = P.vel.z;
  vx = P.vel.dot(fwd);
  vy = P.vel.dot(rightV);
  axPrev = ax;

  const rearSlip = Math.abs(Math.atan2(vy - CFG.axleR * P.yawRate, Math.max(Math.abs(vx), 2)));
  if(isDrifting){
    if((Math.abs(vy) < CFG.driftExitVy && rearSlip < CFG.driftEnterSlip * .55) || P.vel.length() < 4.5) isDrifting = false;
  } else {
    const handbrakeKick = handbrake && Math.abs(P.steer) > .15 && Math.abs(vx) > CFG.driftMinSpeed;
    const slipDrift = (rearSlip > CFG.driftEnterSlip || Math.abs(vy) > CFG.driftEnterVy) && P.vel.length() > CFG.driftMinSpeed;
    if(handbrakeKick || slipDrift) isDrifting = true;
  }
  const drifting = isDrifting;
  driftAngle = Math.atan2(Math.abs(vy), Math.max(0.001, Math.abs(vx)));
  speedKmh = P.vel.length() * 3.6;
  lastLatG = Math.abs(P.yawRate * P.vel.length()) / G_ACC;

  if(PHYS.lastImpact > 1.5){ lastImpact = PHYS.lastImpact; onCrash(PHYS.lastImpact); PHYS.lastImpact = 0; }
  if(body.position.y < -30) resetCar();

  applyPlayerVisualCannon(vx, vy, delta, dt);
  return {vF:vx, vR:vy, drifting};
}

const carRenderQuat = new THREE.Quaternion();
const carVisTmpQ = new THREE.Quaternion();
const carVisTmpV = new THREE.Vector3();
function applyPlayerVisualCannon(vF, vR, steerAngle, dt){
  const body = PHYS.carBody, vehicle = PHYS.vehicle;
  const chassisLift = DRIVE.chassisLift || 0;
  const snap = carRenderSnap;
  carRenderSnap = false;
  const alpha = snap ? 1 : dampAlpha(24, dt);
  carVisTmpQ.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  if(snap) carRenderQuat.copy(carVisTmpQ);
  else carRenderQuat.slerp(carVisTmpQ, alpha);
  // the visual car origin sits at ground level under the chassis centre
  const bodyY = PLAYER_COLLISION.bodyY == null ? .55 : PLAYER_COLLISION.bodyY;
  carVisTmpV.set(0, -bodyY, 0).applyQuaternion(carRenderQuat);
  carVisTmpV.x += body.position.x;
  carVisTmpV.y += body.position.y;
  carVisTmpV.z += body.position.z;
  if(snap) carRenderPos.copy(carVisTmpV);
  else carRenderPos.lerp(carVisTmpV, alpha);
  carRenderHeading = P.heading;
  car.position.copy(carRenderPos);
  car.quaternion.copy(carRenderQuat)
    .multiply(playerDriveOffsetQuatTmp.setFromAxisAngle(SURFACE_UP, -playerDriveHeadingOffset))
    .multiply(playerVisualQuatTmp.setFromEuler(playerVisualBaseEulerTmp.set(playerVisualBaseRotation.x, 0, playerVisualBaseRotation.z)))
    .multiply(playerVisualOffsetQuatTmp.setFromAxisAngle(SURFACE_UP, -playerVisualYawOffset()));
  carVisual.position.y = chassisLift;

  // per-wheel suspension travel straight from the raycasts
  const visSteer = steerAngle * 1.25;
  for(let i = 0; i < wheels.length; i++){
    const w = wheels[i];
    const wi = vehicle.wheelInfos[i];
    if(wi){
      const compress = clamp(PHYS.suspension.restLength - wi.suspensionLength, -PHYS.suspension.travel, PHYS.suspension.travel);
      wheelSuspVis[i] += (compress - wheelSuspVis[i]) * dampAlpha(18, dt);
    }
    if(wi && Number.isFinite(wi.rotation)) w.spin = -wi.rotation;
    else w.spin += vF * dt / .38;
    w.mesh.rotation.x = w.spin;
    w.rim.rotation.x = w.spin;
    if(w.front) w.pivot.rotation.y = visSteer;
    w.pivot.position.y = .38 - chassisLift + (wheelSuspVis[i] || 0);
  }
  RIG.drive(vF, dt, visSteer);
  if(RIG.setSuspension) RIG.setSuspension(wheelSuspVis.map(v => (v || 0) - chassisLift));
}

function updateCar(dt){
  const cannonState = updateCarCannon(dt);
  if(cannonState) return cannonState;

  // input
  const drive = readDriveInput();
  const throttleAmt = drive.throttle, brakeAmt = drive.brake;
  const up = throttleAmt > 0.05, down = brakeAmt > 0.05;
  handbrake = drive.handbrake;
  const steerTarget = clamp(drive.steer, -1, 1);
  // wheel returns to center faster than it turns in (feels crisper mid-drift)
  const steerRate = DRIVE.steerResponse * (steerTarget === 0 || steerTarget * P.steer < 0 ? 1.6 : 1);
  P.steer += (steerTarget - P.steer) * Math.min(1, dt*steerRate);

  // body-frame velocity (fwd / right) carried through the substeps
  let fwd = new THREE.Vector3(Math.sin(P.heading), 0, Math.cos(P.heading));
  let rightV = new THREE.Vector3(fwd.z, 0, -fwd.x);
  let vx = P.vel.dot(fwd), vy = P.vel.dot(rightV);
  let r = P.yawRate;
  let delta = lastSteerAngle;

  const n = clamp(Math.ceil(dt / PHYS_STEP), 1, 8);
  const h = dt / n;
  const L = CFG.axleF + CFG.axleR;

  for(let i = 0; i < n; i++){
    const sp = Math.abs(vx);
    const speedTot = Math.hypot(vx, vy);

    // steering angle: full at low speed, tightens smoothly at high speed
    const steerScale = CFG.steerHiSpeed + (1 - CFG.steerHiSpeed) * Math.exp(-sp / 20);
    delta = P.steer * CFG.steerMax * steerScale;

    // slip angles: speed magnitude keeps atan2 sane; steering sign handles reverse.
    const dirSign = vx < -.05 ? -1 : 1;
    const vxs = Math.max(sp, 2.0);
    const alphaF = Math.atan2(vy + CFG.axleF * r, vxs) - delta * dirSign;
    const alphaR = Math.atan2(vy - CFG.axleR * r, vxs);

    // axle loads (per unit mass) with longitudinal weight transfer
    const dW = clamp(CFG.cgHeight / L * axPrev, -G_ACC * .32, G_ACC * .32);
    const gF = Math.max(1.5, G_ACC * CFG.axleR / L - dW);
    const gR = Math.max(1.5, G_ACC * CFG.axleF / L + dW);

    // ---- longitudinal (RWD, drive on the rear axle)
    let ax = -CFG.drag * vx;
    let muRl = CFG.muR;                       // rear lateral μ, eaten by throttle/brake lock
    let muFl = CFG.muF;
    let driveA = 0;
    let brakeA = 0;
    const burnout = updateBurnoutState(up, down, handbrake, speedTot, h);
    const engine = updateEngineModel(vx, throttleAmt, isDrifting || handbrake || burnout > 0 || Math.abs(vy) > 2.0, h, {
      active: isDrifting || handbrake || Math.abs(vy) > 2.0,
      speedTot,
      lateral: vy,
      forward: vx,
    });
    ENGINE.reverseActive = false;
    if(down && !up) brakeHoldTimer = Math.min(BRAKE_RAMP_TIME, brakeHoldTimer + h);
    else brakeHoldTimer = 0;
    const brakeRamp = down ? (.22 + .78 * Math.pow(clamp(brakeHoldTimer / BRAKE_RAMP_TIME, 0, 1), 1.35)) : 0;
    if(handbrake){
      // Handbrake locks the rear wheels: rear grip collapses and creates drift entry.
      muRl *= CFG.hbMuR;
      if(sp > .3) ax -= Math.sign(vx) * muRl * gR * .9;
    } else if(up){
      driveA = CFG.accel * engine.torque01 * throttleAmt * Math.max(0, 1 - Math.max(0, vx) / (CFG.maxSpeed * 1.08));
      driveA *= clamp(sampleDriveCurve('gearPull', ENGINE.rpm01 || 0, 1), .45, 1.8);
      const rpmWheelspin = clamp(sampleDriveCurve('wheelspin', ENGINE.rpm01 || 0, 1), .55, 1.65);
      driveA = Math.min(driveA, CFG.muR * gR * (burnout > 0 ? DRIVE.burnoutWheelspin * .92 : DRIVE.wheelspin) * rpmWheelspin);   // traction limit (+ wheelspin margin)
      ax += burnout > 0 && down ? driveA * .24 : driveA;
    }
    if(isDrifting && up && driveA > 0){
      const driftDrive = DRIVE.driftDrive == null ? .68 : DRIVE.driftDrive;
      const angle01 = clamp(Math.abs(vy) / Math.max(4, Math.abs(vx) + 2), 0, 1);
      const lowSpeed01 = clamp((18 - speedTot) / 12, 0, 1);
      ax += driveA * driftDrive * (.42 + .62 * angle01 + .36 * lowSpeed01);
    }
    if(burnout > 0){
      muRl *= Math.max(.12, 1 - .88 * burnout);
      if(down){
        ax -= vx * (4.8 + 4.8 * burnout);
        if(vx < -.05) ax += CFG.brake * brakeAmt * burnout;
      } else {
        ax += driveA * (DRIVE.burnoutReleaseDrive == null ? .56 : DRIVE.burnoutReleaseDrive) * burnout;
      }
    }
    if(down && !burnout){
      const alreadyReversing = reverseGearLatched;
      const reverseDelay = reverseBrakeDelay();
      const settledForReverse = speedTot < REVERSE_STOP_SPEED && Math.abs(vx) < REVERSE_STOP_SPEED && Math.abs(vy) < .16 && Math.abs(P.yawRate) < .28 && !handbrake;
      if(alreadyReversing){
        reverseEngageTimer = reverseDelay;
        reverseBrakeTimer = reverseDelay;
      } else if(!settledForReverse){
        reverseNeedsEngageDelay = true;
        reverseBrakeTimer = Math.min(reverseDelay, reverseBrakeTimer + h);
        reverseEngageTimer = 0;
      } else if(reverseNeedsEngageDelay){
        reverseBrakeTimer = Math.min(reverseDelay, reverseBrakeTimer + h);
        reverseEngageTimer = reverseBrakeTimer;
      } else {
        reverseEngageTimer = reverseDelay;
        reverseBrakeTimer = reverseDelay;
      }
      const reverseAllowed = alreadyReversing || (settledForReverse && reverseEngageTimer >= reverseDelay);
      if(!reverseAllowed){
        if(!settledForReverse){
          brakeA = CFG.brake * brakeAmt * brakeRamp;
          ax -= Math.sign(vx || 1) * brakeA;   // split kept for the friction circle below
          if(Math.abs(vx) < .25 && speedTot > 2.2) ax -= CFG.brake * brakeAmt * brakeRamp * .08;
        }
      } else {
        reverseNeedsEngageDelay = false;
        reverseGearLatched = true;
        ENGINE.reverseActive = true;
        ax -= CFG.revAccel * brakeAmt * (1 + vx / 12);
      }
    } else {
      reverseEngageTimer = 0;
      reverseNeedsEngageDelay = false;
      reverseBrakeTimer = 0;
      reverseGearLatched = false;
    }

    // ---- friction circle: longitudinal usage reduces lateral grip
    const rearUse = handbrake ? 0 : Math.max(Math.abs(driveA) / Math.max(.001, CFG.muR * gR), burnout > 0 ? 1.08 * burnout : 0);
    const powerCut = CFG.powerOver * Math.pow(rearUse, 1.35) * (isDrifting ? .46 : .62);
    muRl *= Math.max(isDrifting ? .36 : .28, 1 - powerCut);
    if(brakeA && vx > 0.5){
      const driveLock = (DRIVE.brakeDriveLock == null ? 1 : DRIVE.brakeDriveLock);
      const frontUse = (brakeA * DRIVE.brakeBias * driveLock) / Math.max(.001, CFG.muF * gF);
      const rearUseBrake = (brakeA * (1 - DRIVE.brakeBias)) / Math.max(.001, CFG.muR * gR);
      muFl *= Math.max(.42, 1 - .56 * frontUse);
      muRl *= Math.max(.74, 1 - .16 * rearUseBrake);
    }

    // ---- lateral tire forces (per unit mass), tanh saturation ≈ simplified Pacejka
    let latScale = clamp(speedTot / 2.5, 0, 1);   // no lateral forces when parked
    if(!handbrake && speedTot > .25) latScale = Math.max(latScale, Math.min(.62, speedTot / 1.2));
    const rearPeak = Math.max(.35, 1 - CFG.rearFalloff * Math.min(1, Math.abs(alphaR) / .7));
    const satR = Math.tanh(CFG.stiffR * alphaR) * rearPeak;
    const fyF = -muFl * gF * Math.tanh(CFG.stiffF * alphaF) * latScale;
    const fyR = -muRl * gR * satR * latScale;

    // ---- integrate body-frame dynamics
    const cosD = Math.cos(delta);
    vx += (ax + r * vy) * h;
    vy += (fyF * cosD + fyR - r * vx) * h;
    r  += ((CFG.axleF * fyF * cosD - CFG.axleR * fyR) / CFG.kSq) * h;

    // ---- arcade assists
    r -= r * CFG.yawDamp * h;
    if(!handbrake && speedTot > .2 && speedTot < 6 && Math.abs(delta) > .02){
      const parkingBlend = 1 - speedTot / 6;
      const parkingYaw = (vx / L) * Math.tan(delta);
      r += (parkingYaw - r) * clamp(4.2 * parkingBlend * h, 0, .38);
    }
    if(isDrifting){
      r += P.steer * CFG.driftAssist * (vx < 0 ? -1 : 1) * h * 2.2;          // countersteer authority
      if(up && Math.abs(vy) > .5){
        const lowSpeed01 = clamp((18 - speedTot) / 12, 0, 1);
        vy += Math.sign(vy) * CFG.driftGasPush * h;
        vy -= vy * clamp(CFG.driftThrottlePull * h, 0, .06);
        if(speedTot < CFG.maxSpeed * 1.04){
          vx += (DRIVE.driftDrive == null ? .68 : DRIVE.driftDrive) * throttleAmt * CFG.driftGasPush * h * (.72 + .58 * lowSpeed01);
        }
      }
    }
    if(burnout > 0 && up){
      const steerSoft = Math.sign(P.steer) * Math.pow(Math.abs(P.steer), 1.18);
      if(Math.abs(steerSoft) > .035){
        r += steerSoft * burnout * h * (down ? 4.2 : 2.8);
        if(!down) vy += steerSoft * burnout * throttleAmt * h * 3.1;
      }
    }
    // low speed: settle rotation and creep so the car doesn't "ice skate" when parking
    if(speedTot < 1.2){
      const settle = Math.min(1, h * 6);
      vy -= vy * settle; r -= r * settle;
    }
    if(handbrake && speedTot < 1.05){
      const stop = Math.min(1, h * 9);
      vx -= vx * stop;
      vy -= vy * stop;
      r -= r * stop;
      if(speedTot < .18){
        vx = 0; vy = 0; r = 0;
      }
    }
    if(!up && !down && !handbrake && Math.abs(P.steer) < .04 && speedTot < .22){
      vx = 0; vy = 0; r = 0;
    }
    vx = clamp(vx, -12, CFG.maxSpeed * 1.05);
    axPrev = ax;
    P.heading += r * h;
  }
  P.yawRate = r;
  lastSteerAngle = delta;

  // back to world space with the updated heading
  fwd.set(Math.sin(P.heading), 0, Math.cos(P.heading));
  rightV.set(fwd.z, 0, -fwd.x);
  P.vel.copy(fwd).multiplyScalar(vx).addScaledVector(rightV, vy);
  P.pos.addScaledVector(P.vel, dt);

  const vF = vx, vR = vy;
  const speed = Math.abs(vF);

  // drift state with hysteresis: handbrake kick, rear slip breakaway, or big lateral speed
  const rearSlip = Math.abs(Math.atan2(vy - CFG.axleR * r, Math.max(speed, 2)));
  if(isDrifting){
    if((Math.abs(vR) < CFG.driftExitVy && rearSlip < CFG.driftEnterSlip * .55) || P.vel.length() < 4.5) isDrifting = false;
  } else {
    const handbrakeKick = handbrake && Math.abs(P.steer) > .15 && speed > CFG.driftMinSpeed;
    const slipDrift = (rearSlip > CFG.driftEnterSlip || Math.abs(vR) > CFG.driftEnterVy) && P.vel.length() > CFG.driftMinSpeed;
    if(handbrakeKick || slipDrift) isDrifting = true;
  }
  const drifting = isDrifting;

  driftAngle = Math.atan2(Math.abs(vR), Math.max(0.001, Math.abs(vF)));
  speedKmh = P.vel.length() * 3.6;
  lastLatG = Math.abs(r * P.vel.length()) / G_ACC;

  // ---- collisions
  handleCollisions();

  updateVehicleSurface(dt);
  applyDriveSurfaceGrade(dt);
  applyPlayerVisual(vF, vR, delta, up, down, dt);
  return {vF, vR, drifting};
}

let lastImpact = 0;
function handleCollisions(){
  WORLD_STATE.collideCar({
    player: P,
    radius: playerCollisionRadius(),
    surfaceYAt: driveSurfaceYAt,
    onObjectHit: col => {
      SFX.thud(.25);
      addPoints(col.hitScore, col.hitLabel || ('+' + col.hitScore));
    },
    onImpact: impact => {
      lastImpact = impact;
      onCrash(impact);
    },
  });
}

// ------------------------------------------------ scoring
let totalScore = 0, driftScore = 0, driftMult = 1, driftTime = 0, driftEndTimer = 0;
const HUD = window.LK_RUNTIME_GAME_HUD.create();

function popup(txt, color){
  HUD.popup(txt, color);
}
function addPoints(p, msg){
  totalScore += p;
  HUD.setTotal(totalScore);
  if(msg) popup(msg, '#ffd166');
}
function updateScoring(dt, drifting){
  const active = drifting && speedKmh > 22;
  if(active){
    driftEndTimer = 0;
    driftTime += dt;
    driftScore += driftAngle * speedKmh * dt * 1.6;
    driftMult = Math.min(8, 1 + Math.floor(driftTime / 1.6));
    HUD.showDrift(driftScore, driftMult);
  } else if(driftScore > 0){
    driftEndTimer += dt;
    if(driftEndTimer > .65){   // bank it
      const gained = Math.round(driftScore * driftMult);
      addPoints(gained);
      popup('+' + gained.toLocaleString() + (driftMult>1 ? '  (x'+driftMult+')' : ''), '#7CFC9A');
      driftScore = 0; driftMult = 1; driftTime = 0;
      HUD.hideDrift();
    }
  }
}
function onCrash(impact){
  SFX.crash(Math.min(1, impact/18));
  camShake = Math.min(1, impact/14);
  if(impact > 7 && driftScore > 0){
    popup('CRASH — DRIFT LOST', '#ff5566');
    driftScore = 0; driftMult = 1; driftTime = 0;
    HUD.hideDrift();
  }
}

// ------------------------------------------------ smoke particles
function makeSmokeTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32,32,2,32,32,30);
  gr.addColorStop(0,'rgba(230,230,235,.85)');
  gr.addColorStop(.5,'rgba(220,220,228,.35)');
  gr.addColorStop(1,'rgba(220,220,228,0)');
  g.fillStyle = gr; g.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(c);
}
function makeFlameTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 96;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(48,58,2,48,58,42);
  gr.addColorStop(0,'rgba(255,255,235,1)');
  gr.addColorStop(.24,'rgba(255,211,82,.95)');
  gr.addColorStop(.55,'rgba(255,84,20,.72)');
  gr.addColorStop(1,'rgba(255,20,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(48,58,28,39,0,0,Math.PI*2);
  g.fill();
  const tx = new THREE.CanvasTexture(c);
  tx.encoding = THREE.sRGBEncoding;
  return tx;
}
const smokeTex = makeSmokeTexture();
const flameTex = makeFlameTexture();
const TRANSPARENT_FX_RENDER_ORDER = Object.freeze({
  skid: 6,
  smoke: 60,
  exhaustSmoke: 62,
  exhaustFire: 72,
  wind: 58,
});
const SMOKE_N = 140;
const smokePool = [];
for(let i=0;i<SMOKE_N;i++){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTex, transparent:true, opacity:0, depthWrite:false, depthTest:true}));
  s.renderOrder = TRANSPARENT_FX_RENDER_ORDER.smoke;
  s.visible = false; scene.add(s);
  smokePool.push({s, life:0, max:1, vel:new THREE.Vector3(), size:1});
}
let smokeIdx = 0;
function spawnSmoke(pos, intensity){
  const p = smokePool[smokeIdx++ % SMOKE_N];
  p.s.visible = true;
  p.s.position.copy(pos); p.s.position.y = .25;
  p.life = 0; p.max = .8 + Math.random()*.7;
  p.size = .6 + intensity*1.4;
  p.vel.set((Math.random()-.5)*1.5, 1 + Math.random()*1.2, (Math.random()-.5)*1.5);
}
function updateSmoke(dt){
  for(const p of smokePool){
    if(!p.s.visible) continue;
    p.life += dt;
    if(p.life >= p.max){ p.s.visible = false; p.s.material.opacity = 0; continue; }
    const t = p.life / p.max;
    p.s.position.addScaledVector(p.vel, dt);
    const sc = p.size * (0.6 + t*2.2);
    p.s.scale.set(sc, sc, 1);
    p.s.material.opacity = (1-t) * .5;
  }
}

const EXHAUST_N = 180;
const exhaustPool = [];
for(let i=0;i<EXHAUST_N;i++){
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map:smokeTex, transparent:true, opacity:0, depthWrite:false, depthTest:true, blending:THREE.NormalBlending,
  }));
  s.renderOrder = TRANSPARENT_FX_RENDER_ORDER.exhaustSmoke;
  s.visible = false; scene.add(s);
  exhaustPool.push({s, life:0, max:1, vel:new THREE.Vector3(), size:1, fire:false});
}
let exhaustIdx = 0, exhaustSmokeAcc = 0, exhaustFireAcc = 0;
function spawnExhaustParticle(anchor, fire, intensity){
  const p = exhaustPool[exhaustIdx++ % EXHAUST_N];
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  anchor.getWorldPosition(pos);
  anchor.getWorldQuaternion(quat);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(quat).normalize();
  p.s.visible = true;
  p.s.position.copy(pos);
  p.life = 0;
  p.fire = !!fire;
  if(fire){
    p.max = .22 + Math.random() * .16;
    p.size = (.72 + Math.random() * .42) * intensity;
    p.vel.copy(dir).multiplyScalar(8.5 + Math.random() * 5.5).addScaledVector(P.vel, .08);
    p.s.material.map = flameTex;
    p.s.material.blending = THREE.AdditiveBlending;
    p.s.material.color.setHex(0xffffff);
    p.s.material.opacity = .95;
    p.s.renderOrder = TRANSPARENT_FX_RENDER_ORDER.exhaustFire;
  } else {
    p.max = 1.25 + Math.random() * 1.15;
    p.size = (.32 + Math.random() * .42) * intensity;
    p.vel.copy(dir).multiplyScalar(.45 + Math.random() * 1.25).add(new THREE.Vector3((Math.random()-.5)*.42, .62 + Math.random()*.72, (Math.random()-.5)*.42)).addScaledVector(P.vel, .025);
    p.s.material.map = smokeTex;
    p.s.material.blending = THREE.NormalBlending;
    p.s.material.color.setHex(0xbec3cc);
    p.s.material.opacity = .30;
    p.s.renderOrder = TRANSPARENT_FX_RENDER_ORDER.exhaustSmoke;
  }
  p.s.material.needsUpdate = true;
}
function updatePlayerExhaust(dt){
  applyPlayerExhaustConfig();
  const cfg = PLAYER_EXHAUST_CFG;
  if(!cfg.enabled){ updateExhaustParticles(dt); return; }
  const active = [];
  for(let i=0;i<playerExhaustRig.sources.length;i++){
    const src = cfg.sources[i], rig = playerExhaustRig.sources[i];
    if(src && rig && src.enabled !== false) active.push(rig.anchor);
  }
  if(!active.length){ updateExhaustParticles(dt); return; }
  const throttle = ENGINE.throttle || 0;
  const intensity = Math.max(.05, cfg.intensity || 1);
  const rpmHot = ENGINE.rpm01 >= (cfg.fireRpm == null ? .88 : cfg.fireRpm);
  const shiftFire = cfg.shiftFire && ENGINE.shiftPulse > 0;
  const limiterFire = cfg.limiterFire && ENGINE.limiterPulse > 0;
  const testFire = exhaustTestPulse > 0;
  exhaustTestPulse = Math.max(0, exhaustTestPulse - dt);
  const idleSmoke = cfg.idleSmoke && throttle <= (cfg.smokeThrottle == null ? .18 : cfg.smokeThrottle);
  const fireOn = !!cfg.fire && ((throttle > .05 && (rpmHot || shiftFire || limiterFire)) || testFire);
  if(cfg.smoke && (idleSmoke || throttle > (cfg.smokeThrottle == null ? .18 : cfg.smokeThrottle))){
    const rate = idleSmoke ? 2.2 : (5 + 22 * throttle * intensity);
    exhaustSmokeAcc += dt * rate * intensity;
    while(exhaustSmokeAcc >= 1){
      exhaustSmokeAcc -= 1;
      spawnExhaustParticle(active[Math.floor(Math.random() * active.length)], false, intensity);
    }
  }
  if(fireOn){
    exhaustFireAcc += dt * (testFire || shiftFire || limiterFire ? 120 : 24) * intensity;
    while(exhaustFireAcc >= 1){
      exhaustFireAcc -= 1;
      spawnExhaustParticle(active[Math.floor(Math.random() * active.length)], true, intensity);
    }
  } else {
    exhaustFireAcc = Math.min(exhaustFireAcc, .6);
  }
  updateExhaustParticles(dt);
}
function testPlayerExhaust(targetAnchor){
  exhaustTestPulse = .55;
  const targets = targetAnchor ? [targetAnchor] : playerExhaustRig.sources.map(r => r && r.anchor).filter(Boolean);
  for(const anchor of targets){
    spawnExhaustParticle(anchor, false, PLAYER_EXHAUST_CFG.intensity || 1);
  }
}
function updateExhaustParticles(dt){
  for(const p of exhaustPool){
    if(!p.s.visible) continue;
    p.life += dt;
    if(p.life >= p.max){ p.s.visible = false; p.s.material.opacity = 0; continue; }
    const t = p.life / p.max;
    p.s.position.addScaledVector(p.vel, dt);
    if(!p.fire) p.vel.y += .28 * dt;
    const sc = p.fire ? p.size * (1.25 - t * .55) : p.size * (.65 + t * 2.9);
    p.s.scale.set(sc, sc, 1);
    p.s.material.opacity = p.fire ? (.95 * (1 - t)) : (.30 * (1 - t));
  }
}

// ------------------------------------------------ skid marks
const SKID_N = 700;
const skidGeo = new THREE.PlaneGeometry(.24, .7);
const skidPool = [];
for(let i=0;i<SKID_N;i++){
  const m = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({color:0x0a0a0c, transparent:true, opacity:0, depthWrite:false}));
  m.renderOrder = TRANSPARENT_FX_RENDER_ORDER.skid;
  m.rotation.x = -Math.PI/2; m.position.y = .015; m.visible = false;
  scene.add(m); skidPool.push({m, life:0, opacity:0});
}
let skidIdx = 0;
function spawnSkid(x, z, heading, widthScale, lengthScale, strength){
  if(!PLAYER_SKID_CFG.enabled) return;
  const p = skidPool[skidIdx++ % SKID_N];
  const baseW = PLAYER_SKID_CFG.width == null ? .24 : PLAYER_SKID_CFG.width;
  const baseL = PLAYER_SKID_CFG.length == null ? .7 : PLAYER_SKID_CFG.length;
  const slip = clamp(strength == null ? 1 : strength, 0, 1);
  const opacity = PLAYER_SKID_CFG.opacity == null ? .55 : PLAYER_SKID_CFG.opacity;
  const life = PLAYER_SKID_CFG.life == null ? 14 : PLAYER_SKID_CFG.life;
  p.m.visible = true;
  p.m.position.set(x, .015 + (skidIdx%7)*0.0004, z);
  p.m.rotation.z = -heading;
  p.m.scale.set((baseW / .24) * (widthScale || 1), (baseL / .7) * (lengthScale || 1) * (.78 + slip * .42), 1);
  p.opacity = opacity * (.22 + slip * .78);
  p.m.material.opacity = p.opacity;
  p.life = life * (.72 + slip * .42);
}
function updateSkids(dt){
  for(const p of skidPool){
    if(!p.m.visible) continue;
    p.life -= dt;
    if(p.life < 4) p.m.material.opacity = Math.max(0, p.life/4*(p.opacity || 0));
    if(p.life <= 0) p.m.visible = false;
  }
}

// ------------------------------------------------ speed lines (screen wind sprites)
const windPool = [];
const windMat = new THREE.MeshBasicMaterial({color:0xd0e8ff, transparent:true, opacity:0});
for(let i=0;i<24;i++){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(.03, 3.2), windMat.clone());
  m.renderOrder = TRANSPARENT_FX_RENDER_ORDER.wind;
  m.visible = false; scene.add(m);
  windPool.push({m, life:0});
}
let windIdx = 0;
function updateWind(dt, speed){
  if(speed > 70 && Math.random() < (speed-70)/60){
    const p = windPool[windIdx++ % windPool.length];
    const fwd = new THREE.Vector3(Math.sin(P.heading),0,Math.cos(P.heading));
    const side = new THREE.Vector3(fwd.z,0,-fwd.x);
    p.m.position.copy(P.pos).addScaledVector(fwd, 10 + Math.random()*8)
      .addScaledVector(side, (Math.random()-.5)*10);
    p.m.position.y = .5 + Math.random()*2.5;
    p.m.lookAt(p.m.position.clone().add(new THREE.Vector3(-fwd.z,0,fwd.x)));
    p.m.rotation.z = Math.PI/2 - P.heading;
    p.m.visible = true; p.life = .3; p.m.material.opacity = .35;
  }
  for(const p of windPool){
    if(!p.m.visible) continue;
    p.life -= dt;
    p.m.material.opacity = Math.max(0, p.life/.3*.35);
    if(p.life<=0) p.m.visible=false;
  }
}

// ------------------------------------------------ camera
// Player camera config — editable from the engine editor (saved with the scene)
const PLAYER_CAMERA = window.LK_RUNTIME_PLAYER_CAMERA;
const CAM_CFG = PLAYER_CAMERA.createConfig();
const CAMERA_ASPECTS = PLAYER_CAMERA.ASPECTS;
const camPos = new THREE.Vector3(0, 6, 65);
const camFocus = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camVisualForward = new THREE.Vector3();
const camVisualSide = new THREE.Vector3();
const playerVisualForwardTmp = new THREE.Vector3();
const playerVisualQuatTmp = new THREE.Quaternion();
const playerVisualInvQuatTmp = new THREE.Quaternion();
const playerVisualOffsetQuatTmp = new THREE.Quaternion();
const playerDriveOffsetQuatTmp = new THREE.Quaternion();
const playerVisualBaseEulerTmp = new THREE.Euler();
const playerVisualBaseRotation = {x:0, z:0};
let playerDriveHeadingOffset = 0;
let camYaw = 0, camPitch = .32, camDist = 9, camMode = 0; // 0 chase, 1 free orbit
let dragging = false, lastMX = 0, lastMY = 0, userCamTimer = 0, camShake = 0;
let camDriftSide = 0, camReverseBlend = 0, camCinematicRoll = 0, lastCamVF = 0, lastCamVR = 0, lastCamDrifting = false;
let camSnapNext = false;
let camReverseHold = 0;
let camHeading = 0, camSpeedForFov = 0;
function resetCameraState(){
  dragging = false;
  camMode = 0;
  camPitch = .32;
  camDist = Math.max(CAM_CFG.minDist, Math.min(CAM_CFG.maxDist, camDist || CAM_CFG.arcadeDistance || 9));
  camYaw = Math.atan2(-playerCameraForwardVector(camVisualForward).x, -camVisualForward.z);
  camHeading = P.heading;
  camFocus.copy(P.pos);
  camLook.set(P.pos.x, P.pos.y + 1.1, P.pos.z);
  camSpeedForFov = speedKmh || 0;
  camDriftSide = 0;
  camReverseBlend = 0;
  camCinematicRoll = 0;
  camReverseHold = 0;
  lastCamVF = 0;
  lastCamVR = 0;
  lastCamDrifting = false;
  userCamTimer = 0;
  camSnapNext = true;
}
function playerCameraForwardVector(target){
  const out = target || new THREE.Vector3();
  return out.set(Math.sin(P.heading || 0), 0, Math.cos(P.heading || 0)).normalize();
}
function playerVisualRoot(){
  return PLAYER_MODEL && PLAYER_MODEL.getPlayerModel && PLAYER_MODEL.getPlayerModel() || carVisual;
}
function playerVisibleForwardVector(target){
  const out = target || new THREE.Vector3();
  const heading = car && car.rotation ? (car.rotation.y || 0) : (P.heading || 0);
  return out.set(Math.sin(heading), 0, Math.cos(heading)).normalize();
}
function playerVisibleHeading(){
  return car && car.rotation ? (car.rotation.y || 0) : (P.heading || 0);
}
function setPlayerVisibleHeading(heading){
  const n = Number(heading);
  if(!Number.isFinite(n)) return playerVisibleHeading();
  car.rotation.y = n;
  P.heading = runtimeHeadingFromVisible(n);
  if(GAME.player && GAME.player.physics) GAME.player.physics.heading = P.heading;
  if(GAME.state && GAME.state.editorActive && !GAME.state.editorPreview && GAME.player && GAME.player.spawn) GAME.player.spawn.heading = n;
  car.updateMatrixWorld(true);
  return playerVisibleHeading();
}
function playerVisualYawOffset(){
  return 0;
}
function nearHalfTurn(value){
  return Math.abs(angleDelta(Math.PI, Number(value) || 0)) < 0.01;
}
function runtimeHeadingFromVisible(heading){
  return (Number(heading) || 0) + playerDriveHeadingOffset;
}
function visibleHeadingFromRuntime(heading){
  return (Number(heading) || 0) - playerDriveHeadingOffset;
}
function setPlayerVisualBaseRotation(x, z){
  const nx = Number(x);
  const nz = Number(z);
  playerVisualBaseRotation.x = Number.isFinite(nx) ? nx : 0;
  playerVisualBaseRotation.z = Number.isFinite(nz) ? nz : 0;
  playerDriveHeadingOffset = nearHalfTurn(playerVisualBaseRotation.x) && nearHalfTurn(playerVisualBaseRotation.z) ? Math.PI : 0;
  return playerVisualBaseRotation;
}
function applyPlayerRootFromRuntimeHeading(){
  car.rotation.set(playerVisualBaseRotation.x, visibleHeadingFromRuntime(P.heading), playerVisualBaseRotation.z);
}
function syncPlayerSpawnFromVisibleTransform(){
  if(!GAME.player || !GAME.player.car) return SPAWN;
  const heading = playerVisibleHeading();
  SPAWN.x = car.position.x;
  SPAWN.z = car.position.z;
  SPAWN.heading = heading;
  P.pos.copy(car.position);
  setPlayerVisibleHeading(heading);
  P.vel.set(0, 0, 0);
  P.yawRate = 0;
  if(GAME.systems && GAME.systems.physics) GAME.systems.physics.syncPlayer();
  return SPAWN;
}
function cameraAspectValue(){
  return PLAYER_CAMERA.aspectValue(CAM_CFG, innerWidth, innerHeight);
}
function cameraRenderRect(w, h){
  return PLAYER_CAMERA.renderRect(CAM_CFG, w, h);
}
function applyCameraCfg(){
  Object.assign(CAM_CFG, {
    mode: CAM_CFG.mode || 'free',
    arcadeDistance: CAM_CFG.arcadeDistance == null ? 9 : CAM_CFG.arcadeDistance,
    arcadeHeight: CAM_CFG.arcadeHeight == null ? 3.1 : CAM_CFG.arcadeHeight,
    arcadeLag: CAM_CFG.arcadeLag == null ? 5.8 : CAM_CFG.arcadeLag,
    reverseFrontSpeed: CAM_CFG.reverseFrontSpeed == null ? 7 : CAM_CFG.reverseFrontSpeed,
    cinematicDriftOrbit: CAM_CFG.cinematicDriftOrbit == null ? .18 : CAM_CFG.cinematicDriftOrbit,
    cinematicDriftClose: CAM_CFG.cinematicDriftClose == null ? 1.65 : CAM_CFG.cinematicDriftClose,
    cinematicDriftHeight: CAM_CFG.cinematicDriftHeight == null ? .45 : CAM_CFG.cinematicDriftHeight,
    cinematicLag: CAM_CFG.cinematicLag == null ? 4.2 : CAM_CFG.cinematicLag,
  });
  CAM_CFG.grade = Object.assign({enabled:false, exposure:1, brightness:0, contrast:1, saturation:1, gamma:1}, CAM_CFG.grade || {});
  CAM_CFG.dof = Object.assign({enabled:false, focus:9, aperture:.025, maxblur:.04, autoFocus:true, focusRadius:.16, feather:.38, showFocus:false}, CAM_CFG.dof || {});
  delete CAM_CFG.dof.exposure;
  if(CAM_CFG.dof.aperture > 0 && CAM_CFG.dof.aperture < .006) CAM_CFG.dof.aperture = .025;
  if(CAM_CFG.dof.maxblur > 0 && CAM_CFG.dof.maxblur < .02) CAM_CFG.dof.maxblur = .04;
  camera.aspect = cameraAspectValue();
  camera.far = CAM_CFG.far;
  camera.updateProjectionMatrix();
  scene.fog.density = CAM_CFG.fogDensity;
  renderer.toneMappingExposure = CAM_CFG.grade && CAM_CFG.grade.enabled && CAM_CFG.grade.exposure != null ? CAM_CFG.grade.exposure : 1;
  camDist = clamp(camDist, CAM_CFG.minDist, CAM_CFG.maxDist);
}
function setCameraConfig(patch, reset){
  if(!patch) return;
  const previousMode = CAM_CFG.mode;
  if(patch.dof) CAM_CFG.dof = Object.assign({}, CAM_CFG.dof, patch.dof);
  if(patch.grade) CAM_CFG.grade = Object.assign({}, CAM_CFG.grade, patch.grade);
  const rest = Object.assign({}, patch);
  delete rest.dof;
  delete rest.grade;
  Object.assign(CAM_CFG, rest);
  applyCameraCfg();
  if(reset || (patch.mode && patch.mode !== previousMode)) resetCameraState();
  camSnapNext = true;
}
const LETTERBOX_COLOR = new THREE.Color(0x141518);
let TOUCH_CONTROLS = null;
function letterboxColor(){
  if(CAM_CFG.letterboxColor){ try { LETTERBOX_COLOR.set(CAM_CFG.letterboxColor); } catch(err){} }
  return LETTERBOX_COLOR;
}
// keep the game HUD confined to the camera's rendered rectangle so the on-screen
// UI (score, legend, speedo…) never spills outside a letterboxed / cropped frame
function syncHudRect(css){
  const hud = document.getElementById('hud');
  if(!hud) return;
  const portrait = css ? (css.h > css.w) : (innerHeight > innerWidth);
  if(css){
    // Constrain HUD layout to the actual rendered camera rectangle.
    // This keeps every HUD control anchored to the playable frame.
    hud.style.left = css.x + 'px'; hud.style.top = css.y + 'px';
    hud.style.width = css.w + 'px'; hud.style.height = css.h + 'px';
    hud.style.right = 'auto'; hud.style.bottom = 'auto';

    // Keep the HUD clip neutral now that it already sits inside the frame.
    hud.style.setProperty('--ui-mask-top', '0px');
    hud.style.setProperty('--ui-mask-right', '0px');
    hud.style.setProperty('--ui-mask-bottom', '0px');
    hud.style.setProperty('--ui-mask-left', '0px');

    if(RADIO && RADIO.setFrameRect) RADIO.setFrameRect(css);
    if(TOUCH_CONTROLS && TOUCH_CONTROLS.setFrameRect) TOUCH_CONTROLS.setFrameRect(css);
  } else {
    hud.style.left = hud.style.top = hud.style.width = hud.style.height = hud.style.right = hud.style.bottom = '';
    hud.style.setProperty('--ui-mask-top', '0px');
    hud.style.setProperty('--ui-mask-right', '0px');
    hud.style.setProperty('--ui-mask-bottom', '0px');
    hud.style.setProperty('--ui-mask-left', '0px');
    if(RADIO && RADIO.setFrameRect) RADIO.setFrameRect(null);
    if(TOUCH_CONTROLS && TOUCH_CONTROLS.setFrameRect) TOUCH_CONTROLS.setFrameRect(null);
  }
  // portrait / phone frame: drop the legend and let the input manager show touch
  document.body.classList.toggle('lk-portrait', portrait);
  if(GAME.input && GAME.input.setPortrait) GAME.input.setPortrait(portrait);
}
function shouldHideForFinalGameplayRender(node){
  const ud = node && node.userData || {};
  return !!(
    ud.helperOnly ||
    ud.colliderPreview ||
    ud.editorOnly ||
    ud.nonExportable ||
    ud.editorCameraHelper ||
    ud.editorCameraHelperPick ||
    ud.editorLightHandle
  );
}
function beginFinalGameplayRender(){
  const hidden = [];
  const hideNode = node => {
    if(!node || !node.visible) return;
    hidden.push([node, node.visible]);
    node.visible = false;
  };
  scene.traverse(node => {
    if(shouldHideForFinalGameplayRender(node)) hideNode(node);
  });
  return hidden;
}
function endFinalGameplayRender(hidden){
  (hidden || []).forEach(pair => {
    if(pair && pair[0]) pair[0].visible = pair[1];
  });
}
function renderPlayerCamera(targetRect){
  const area = targetRect || {x:0, y:0, w:innerWidth, h:innerHeight};
  const hidden = beginFinalGameplayRender();
  let rect = null;
  try {
    rect = PLAYER_CAMERA.renderScoped({
      config: CAM_CFG,
      renderer,
      camera,
      width: area.w,
      height: area.h,
      offsetX: area.x || 0,
      offsetY: area.y || 0,
      clip: !!targetRect,
      clearColor: letterboxColor(),
      render: rect => {
        if(POST.ok && ((CAM_CFG.dof && CAM_CFG.dof.enabled) || (CAM_CFG.grade && CAM_CFG.grade.enabled) || (VIDEO && VIDEO.volumetricLighting))){
          if(rect.scoped || targetRect) POST.composer.setSize(rect.w, rect.h);
          POST.render();
          if(rect.scoped || targetRect) POST.composer.setSize(innerWidth, innerHeight);
        } else {
          renderer.render(scene, camera);
        }
      },
    });
  } finally {
    endFinalGameplayRender(hidden);
  }
  if(!rect) return;
  // confine the HUD to the actual rendered frame (letterbox / editor viewport).
  // renderer rects use WebGL bottom-left origin; convert to CSS top-left for the DOM.
  const clipped = rect.scoped || !!targetRect;
  if(clipped){
    const cssX = (area.x || 0) + rect.x;
    const cssTop = innerHeight - ((area.y || 0) + rect.y + rect.h);
    syncHudRect({x: cssX, y: cssTop, w: rect.w, h: rect.h});
  } else {
    syncHudRect(null);
  }
}
function requestRuntimeCameraPointerLock(){
  if(!canvas.requestPointerLock || document.pointerLockElement === canvas) return;
  try {
    const result = canvas.requestPointerLock();
    if(result && result.catch) result.catch(() => {});
  } catch(err){}
}
function pointInRuntimeViewport(e){
  if(!GAME.state.editorPreview) return true;
  const rect = GAME.editor && GAME.editor.viewportRect ? GAME.editor.viewportRect() : null;
  if(!rect) return true;
  return e.clientX >= rect.x && e.clientX <= rect.x + rect.w && e.clientY >= rect.y && e.clientY <= rect.y + rect.h;
}
function runtimePointerLookUiTarget(target){
  if(!target || !target.closest) return false;
  return !!target.closest('input, textarea, select, button, #settingsOverlay, #tunePanel, #radio, #overlay, #lkCinemaTimeline, #lkCinemaPreviewFrame, #lkPipFrame, #lkViewportToolbar, #lkViewportOverlays');
}
function canStartRuntimeCameraLook(e){
  if(isEditorSimulationPreview()) return false;
  if(e.button > 0) return false;
  if((CAM_CFG.mode || 'free') !== 'free') return false;
  if(!((SESSION && SESSION.isStarted && SESSION.isStarted()) || GAME.state.editorPreview)) return false;
  if(GAME.state.editorActive && !GAME.state.editorPreview) return false;
  if(shouldShowRuntimeCursor()) return false;
  if(runtimePointerLookUiTarget(e.target)) return false;
  return pointInRuntimeViewport(e);
}
function startRuntimeCameraLook(e){
  dragging = true;
  lastMX = e.clientX;
  lastMY = e.clientY;
  requestRuntimeCameraPointerLock();
}
addEventListener('pointerdown', e => {
  if(e.target === canvas) return;
  if(!canStartRuntimeCameraLook(e)) return;
  startRuntimeCameraLook(e);
}, true);
canvas.addEventListener('pointerdown', e => {
  if((GAME.state.editorActive && !GAME.state.editorPreview) || e.button > 0) return;
  if(!canStartRuntimeCameraLook(e)) return;
  startRuntimeCameraLook(e);
  if(canvas.setPointerCapture){
    try { canvas.setPointerCapture(e.pointerId); } catch(err){}
  }
});
canvas.addEventListener('pointerup', e => {
  dragging = false;
  if(canvas.releasePointerCapture){
    try { canvas.releasePointerCapture(e.pointerId); } catch(err){}
  }
});
canvas.addEventListener('pointercancel', () => dragging = false);
addEventListener('pointerup', () => dragging = false);
addEventListener('pointerlockchange', () => {
  if(document.pointerLockElement !== canvas) dragging = false;
});
function isCameraUiTarget(target){
  return !!(target && target.closest && target.closest('#lkEditor, #settingsOverlay, #tunePanel, #radio, #overlay'));
}
function isGameplayOverlayOpen(){
  const menu = document.getElementById('overlay');
  const settings = document.getElementById('settingsOverlay');
  const tuneDock = document.getElementById('tuneDock');
  const radio = document.getElementById('radio');
  return !!(
    (settings && settings.classList.contains('open')) ||
    (tuneDock && tuneDock.classList.contains('open')) ||
    (radio && radio.classList.contains('open')) ||
    (menu && !menu.classList.contains('hidden'))
  );
}
function isSettingsOverlayOpen(){
  const settings = document.getElementById('settingsOverlay');
  return !!(settings && settings.classList.contains('open'));
}
function isNonSettingsGameplayOverlayOpen(){
  const menu = document.getElementById('overlay');
  const tuneDock = document.getElementById('tuneDock');
  const radio = document.getElementById('radio');
  return !!(
    (tuneDock && tuneDock.classList.contains('open')) ||
    (radio && radio.classList.contains('open')) ||
    (menu && !menu.classList.contains('hidden'))
  );
}
function runtimeSessionActive(){
  return !!(((SESSION && SESSION.isStarted && SESSION.isStarted()) || GAME.state.editorPreview));
}
function shouldShowRuntimeCursor(){
  if(isEditorSimulationPreview()) return false;
  if(isSettingsOverlayOpen()) return !!GAME.state.menuCursorVisible;
  if(isNonSettingsGameplayOverlayOpen()) return true;
  return !!(GAME.state.editorPreview && GAME.state.playPreviewCursorVisible);
}
function syncRuntimeCursorState(){
  const cursorVisible = shouldShowRuntimeCursor() && runtimeSessionActive();
  document.body.classList.toggle('lk-game-ui-cursor', cursorVisible);
  if(cursorVisible){
    document.body.classList.remove('lk-free-camera-cursor-hidden');
    if(document.pointerLockElement === canvas && document.exitPointerLock){
      try { document.exitPointerLock(); } catch(err){}
    }
  } else if(isSettingsOverlayOpen() && runtimeSessionActive()){
    document.body.classList.add('lk-free-camera-cursor-hidden');
  }
}
function runtimeCameraAllowsMouseLook(target){
  if(shouldShowRuntimeCursor()) return false;
  return !isCameraUiTarget(target);
}
function runtimeWheelBelongsToUi(target){
  if(!target || !target.closest) return false;
  if(target === canvas) return false;
  return !!target.closest('#lkEditor, #settingsOverlay, #tunePanel, #radio, #overlay, input, textarea, select, button');
}
function viewportOwnsPointerEvent(e){
  if(e.target && e.target.closest && e.target.closest('input,textarea,select,button')) return false;
  return e.target === canvas || (SESSION && SESSION.isStarted && SESSION.isStarted()) || (GAME.state.editorPreview && !isEditorSimulationPreview());
}
['contextmenu','selectstart','dragstart'].forEach(type => {
  addEventListener(type, e => {
    if(!viewportOwnsPointerEvent(e)) return;
    e.preventDefault();
  }, true);
});
addEventListener('pointermove', e => {
  if(isEditorSimulationPreview()) return;
  const freeMouseLook = !dragging && (CAM_CFG.mode || 'free') === 'free' && ((SESSION && SESSION.isStarted && SESSION.isStarted()) || GAME.state.editorPreview) &&
    !(GAME.state.editorActive && !GAME.state.editorPreview) && runtimeCameraAllowsMouseLook(e.target);
  const locked = document.pointerLockElement === canvas;
  if((!dragging && !freeMouseLook && !locked) || (GAME.state.editorActive && !GAME.state.editorPreview)) return;
  const dx = locked ? (e.movementX || 0) : (dragging ? (e.clientX-lastMX) : (e.movementX || 0));
  const dy = locked ? (e.movementY || 0) : (dragging ? (e.clientY-lastMY) : (e.movementY || 0));
  camYaw   -= dx*.005;
  camPitch += dy*.004;
  camPitch = Math.max(.05, Math.min(1.2, camPitch));
  lastMX = e.clientX; lastMY = e.clientY;
  userCamTimer = (freeMouseLook || locked) ? 1.6 : 2.2;
});
addEventListener('wheel', e => {
  if(isEditorSimulationPreview()) return;
  if(GAME.state.editorActive && !GAME.state.editorPreview) return;
  if(runtimeWheelBelongsToUi(e.target)) return;
  camDist = Math.max(CAM_CFG.minDist, Math.min(CAM_CFG.maxDist, camDist + Math.sign(e.deltaY)*1.1));
}, {passive:true});

function updateCamera(dt){
  const snap = camSnapNext;
  camSnapNext = false;
  const mode = CAM_CFG.mode || 'free';
  const cursorVisible = shouldShowRuntimeCursor();
  const runtimeCameraActive = !isEditorSimulationPreview() && mode === 'free' && runtimeSessionActive() && !(GAME.state.editorActive && !GAME.state.editorPreview) && !GAME.state.paused && !cursorVisible;
  document.body.classList.toggle('lk-free-camera-cursor-hidden', runtimeCameraActive);
  syncRuntimeCursorState();
  if(!runtimeCameraActive && document.pointerLockElement === canvas && document.exitPointerLock){
    try { document.exitPointerLock(); } catch(err){}
  }
  const focusAlpha = snap ? 1 : dampAlpha(mode === 'free' ? 13 : 16, dt);
  const headingAlpha = snap ? 1 : dampAlpha(mode === 'free' ? 12 : 14, dt);
  camFocus.lerp(P.pos, focusAlpha);
  camHeading += angleDelta(P.heading, camHeading) * headingAlpha;
  const camInput = readDriveInput();
  if(mode === 'free'){
    const lookX = camInput.cameraLookX || 0;
    const lookY = camInput.cameraLookY || 0;
    if(Math.abs(lookX) > .02 || Math.abs(lookY) > .02){
      camYaw -= lookX * 2.4 * dt;
      camPitch += lookY * 1.65 * dt;
      camPitch = Math.max(.05, Math.min(1.2, camPitch));
      userCamTimer = 1.45;
      camMode = 0;
    }
  }
  if(mode === 'free' && camMode === 0 && !dragging){
    userCamTimer -= dt;
    if(userCamTimer <= 0){
      // ease yaw back behind the car
      const fwd = playerCameraForwardVector(camVisualForward);
      const targetYaw = Math.atan2(-fwd.x, -fwd.z);
      camYaw += angleDelta(targetYaw, camYaw) * (snap ? 1 : dampAlpha(2.4, dt));
    }
  }
  let look = new THREE.Vector3(camFocus.x, camFocus.y + 1.1, camFocus.z);
  let lag = 6;
  if(mode === 'arcade' || mode === 'cinematic'){
    const reversingForCamera = ENGINE.reverseActive && lastCamVF < -1.8;
    camReverseHold = reversingForCamera ? camReverseHold + dt : Math.max(0, camReverseHold - dt * 2.4);
    const lookBack = !!(keys['v'] || camInput.lookBack);
    const reverseTarget = (lookBack || camReverseHold > .65) ? 1 : 0;
    camReverseBlend += (reverseTarget - camReverseBlend) * (snap ? 1 : dampAlpha(CAM_CFG.reverseFrontSpeed, dt));
    const fwd = playerCameraForwardVector(camVisualForward);
    const side = camVisualSide.set(fwd.z, 0, -fwd.x);
    let dist = Math.max(2, CAM_CFG.arcadeDistance);
    let height = CAM_CFG.arcadeHeight;
    lag = CAM_CFG.arcadeLag;
    let sideOffset = 0;

    if(mode === 'cinematic'){
      const driftAmount = lastCamDrifting && speedKmh > 18 ? clamp(driftAngle / .82, 0, 1) : 0;
      const driftDir = Math.sign(lastCamVR || P.steer || 1);
      const driftTarget = driftDir * driftAmount;
      camDriftSide += (driftTarget - camDriftSide) * (snap ? 1 : dampAlpha(4.6, dt));
      sideOffset = -camDriftSide * dist * clamp(CAM_CFG.cinematicDriftOrbit, 0, .22) * (1 - camReverseBlend * .65);
      camCinematicRoll += ((-camDriftSide * .045) - camCinematicRoll) * (snap ? 1 : dampAlpha(4.8, dt));
      dist -= Math.abs(camDriftSide) * CAM_CFG.cinematicDriftClose;
      height += Math.abs(camDriftSide) * CAM_CFG.cinematicDriftHeight;
      lag = CAM_CFG.cinematicLag;
    } else {
      camDriftSide += (0 - camDriftSide) * (snap ? 1 : dampAlpha(5, dt));
      camCinematicRoll += (0 - camCinematicRoll) * (snap ? 1 : dampAlpha(5, dt));
    }

    const behind = camFocus.clone().addScaledVector(fwd, -dist).addScaledVector(side, sideOffset);
    const front = camFocus.clone().addScaledVector(fwd, dist).addScaledVector(side, -sideOffset);
    const want = behind.lerp(front, camReverseBlend);
    want.y = camFocus.y + height;
    camPos.lerp(want, snap ? 1 : dampAlpha(Math.max(lag, 8), dt));
    look.addScaledVector(fwd, camReverseBlend > .5 ? -2.2 : clamp(lastCamVF * .06, -1.2, 1.8));
  } else {
    const cy = Math.cos(camPitch), sy = Math.sin(camPitch);
    const off = new THREE.Vector3(Math.sin(camYaw)*cy, sy, Math.cos(camYaw)*cy).multiplyScalar(camDist);
    const want = camFocus.clone().add(off);
    want.y = Math.max(1.2, want.y);
    camPos.lerp(want, snap ? 1 : dampAlpha(6, dt));
  }
  camShake = Math.max(0, camShake - dt*2.5);
  const sh = camShake * .35 * CAM_CFG.shake;
  camera.position.copy(camPos).add(new THREE.Vector3((Math.random()-.5)*sh,(Math.random()-.5)*sh,(Math.random()-.5)*sh));
  camLook.lerp(look, snap ? 1 : dampAlpha(18, dt));
  camera.lookAt(camLook);
  if(mode === 'cinematic') camera.rotateZ(camCinematicRoll);
  // speed FOV
  camSpeedForFov += ((speedKmh || 0) - camSpeedForFov) * (snap ? 1 : dampAlpha(7, dt));
  const targetFov = CAM_CFG.fov + Math.min(CAM_CFG.fovSpeedMax, camSpeedForFov * CAM_CFG.fovSpeedGain);
  camera.fov += (targetFov - camera.fov) * (snap ? 1 : dampAlpha(4, dt));
  camera.updateProjectionMatrix();
}

// ------------------------------------------------ post-processing (DOF + visual grade)
const POST = window.LK_RUNTIME_POST.createPost({
  THREERef: THREE,
  scene,
  camera,
  renderer,
  config: CAM_CFG,
  video: VIDEO,
  size: () => ({width: innerWidth, height: innerHeight}),
  focusTarget: () => (typeof player !== 'undefined' && player?.car ? player.car : car),
  volumetricTarget: () => sun,
});

// ------------------------------------------------ sound (procedural WebAudio)
const SFX = window.LK_RUNTIME_AUDIO.createSfx({getVolumes: () => AUDIO});

// ------------------------------------------------ engine sound sets (sample-based, fallback sul synth)
const ENGINE_AUDIO = window.LK_RUNTIME_ENGINE_AUDIO.create({
  audio: SFX,
  engine: ENGINE,
  gearbox: GEARBOX,
  getSpeed: () => speedKmh,
  getTimescale: () => TS.cur,
  resolveSrc: src => {
    if(src && src.indexOf('blob:') === 0 && window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(src.slice(5));
    return Promise.resolve(src);
  },
});
const PLAYER_ENGINE_AUDIO_CFG = {setId: null, set: null};
function setPlayerEngineSound(setId){
  PLAYER_ENGINE_AUDIO_CFG.setId = setId || null;
  const store = window.LK_STORE;
  const set = setId && store && store.soundSets ? store.soundSets.get(setId) : null;
  PLAYER_ENGINE_AUDIO_CFG.set = set;
  ENGINE_AUDIO.setConfig(set);
}

// ------------------------------------------------ input
const keys = {};
addEventListener('keydown', e => {
  if(isEditorSimulationPreview()) return;
  if(e.key === 'F1' && e.shiftKey && GAME.state.editorActive && GAME.state.editorPreview){
    e.preventDefault();
    GAME.state.playPreviewCursorVisible = !GAME.state.playPreviewCursorVisible;
    dragging = false;
    if(GAME.state.playPreviewCursorVisible){
      document.body.classList.remove('lk-free-camera-cursor-hidden');
      document.body.classList.add('lk-game-ui-cursor');
      if(document.pointerLockElement === canvas && document.exitPointerLock){
        try { document.exitPointerLock(); } catch(err){}
      }
    } else {
      document.body.classList.remove('lk-game-ui-cursor');
      document.body.classList.add('lk-free-camera-cursor-hidden');
      userCamTimer = 1.6;
      requestRuntimeCameraPointerLock();
    }
    popup(GAME.state.playPreviewCursorVisible ? 'PREVIEW CURSOR ON' : 'PREVIEW CURSOR OFF', '#9db4ff');
    return;
  }
  if(e.key === 'F1'){
    e.preventDefault();
    return;
  }
  if(GAME.state.editorActive && !GAME.state.editorPreview) return;      // editor owns the keyboard outside play preview
  const key = e.key.toLowerCase();
  if(key === 'escape'){
    e.preventDefault();
    toggleSettingsMenu('game', {source: 'keyboard'});
    return;
  }
  if(e.target && e.target.closest && e.target.closest('#tunePanel, #settingsOverlay')) return;
  if(key === 'u'){
    e.preventDefault();
    toggleTunePanel();
    return;
  }
  keys[key] = true;
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) e.preventDefault();
  if(key === 'r' && !isEditorSimulationPreview()) resetCar();
  if(key === 'c'){
    if(CAM_CFG.mode === 'free'){
      camMode = 1-camMode; userCamTimer = camMode ? 1e9 : 0;
    } else {
      CAM_CFG.mode = CAM_CFG.mode === 'arcade' ? 'cinematic' : 'arcade';
      popup(CAM_CFG.mode === 'cinematic' ? 'CINEMATIC CAMERA' : 'ARCADE CAMERA', '#9db4ff');
    }
  }
  if(key === 'm'){ const m = SFX.toggleMute(); popup(m?'MUTED':'SOUND ON','#9aa3b8'); }
  if(key === 'f' && !isEditorSimulationPreview()){
    PLAYER_LIGHT_RIG.setHighBeams(true);
  }
  if(e.key === 'Tab'){ e.preventDefault(); RADIO.toggleOpen(); }
  if(key === 'p'){ RADIO.togglePlay(); }
  if(key === 'n'){ RADIO.next(); }
  if(key === 'b'){ RADIO.prev(); }
  if(key === 'h'){ document.getElementById('legend').classList.toggle('collapsed'); }
});
addEventListener('keyup', e => {
  if(isEditorSimulationPreview()) return;
  if(GAME.state.editorActive && !GAME.state.editorPreview) return;
  if(e.target && e.target.closest && e.target.closest('#tunePanel, #settingsOverlay')) return;
  const key = e.key.toLowerCase();
  keys[key] = false;
  if(key === 'f'){
    PLAYER_LIGHT_RIG.setHighBeams(false);
  }
});

// ------------------------------------------------ input manager (keyboard / gamepad / touch)
// Abstract driving actions resolved per player from the active device.
// Project rules (allowed devices, default bindings) come from meta.input;
// the player's in-game remaps layer on top. See js/runtime/input/*.
const INPUT = window.LK_RUNTIME_INPUT_MANAGER ? window.LK_RUNTIME_INPUT_MANAGER.create({}) : null;
GAME.input = INPUT;
let lastResetHeld = false;
let lastGamepadActions = {};

function neutralPlayerDrive(){
  if(window.LK_RUNTIME_INPUT_ACTIONS && window.LK_RUNTIME_INPUT_ACTIONS.neutralDrive) return window.LK_RUNTIME_INPUT_ACTIONS.neutralDrive();
  return {
    steer: 0,
    throttle: 0,
    brake: 0,
    handbrake: false,
    reset: false,
    pauseMenu: false,
    highBeams: false,
    radioToggle: false,
    radioPlay: false,
    radioNext: false,
    radioPrev: false,
    cameraMode: false,
    lookBack: false,
    tuningMenu: false,
    mute: false,
    legend: false,
    cameraLookX: 0,
    cameraLookY: 0,
  };
}
function isEditorSimulationPreview(){
  return !!(GAME.state.editorPreview && GAME.state.editorPreviewMode === 'simulate');
}

function readDriveInput(){
  if(GAME.state.paused) return neutralPlayerDrive();
  if(isEditorSimulationPreview()) return neutralPlayerDrive();
  if(INPUT){
    const drive = INPUT.player(0).drive();
    return drive;
  }
  // fallback if the input modules failed to load: legacy keyboard
  const legacyDrive = {
    steer: ((keys['a']||keys['arrowleft']) ? 1 : 0) - ((keys['d']||keys['arrowright']) ? 1 : 0),
    throttle: (keys['w']||keys['arrowup']) ? 1 : 0,
    brake: (keys['s']||keys['arrowdown']) ? 1 : 0,
    handbrake: !!keys[' '],
    reset: false,
    pauseMenu: false,
    highBeams: !!keys['f'],
    radioToggle: false,
    radioPlay: false,
    radioNext: false,
    radioPrev: false,
    cameraMode: false,
    lookBack: !!keys['v'],
    tuningMenu: false,
    mute: false,
    legend: false,
    cameraLookX: 0,
    cameraLookY: 0,
  };
  return legacyDrive;
}
function gamepadActions(){
  if(isEditorSimulationPreview()) return null;
  if(!INPUT) return null;
  const p = INPUT.player(0);
  if(!p || p.deviceType() !== 'gamepad') return null;
  return p.drive();
}
function gamepadEdge(state, key){
  return !!(state && state[key] && !lastGamepadActions[key]);
}
function handleGamepadActions(){
  if(GAME.state.editorActive && !GAME.state.editorPreview){
    lastGamepadActions = {};
    return;
  }
  const state = gamepadActions();
  if(state){
    if(!GAME.state.paused && gamepadEdge(state, 'pauseMenu')) toggleSettingsMenu('game', {source: 'gamepad'});
    if(!GAME.state.paused){
      if(gamepadEdge(state, 'radioToggle')) RADIO.toggleOpen();
      if(gamepadEdge(state, 'radioPlay')) RADIO.togglePlay();
      if(gamepadEdge(state, 'radioNext')) RADIO.next();
      if(gamepadEdge(state, 'radioPrev')) RADIO.prev();
      if(gamepadEdge(state, 'cameraMode')){
        if(CAM_CFG.mode === 'free'){
          camMode = 1 - camMode;
          userCamTimer = camMode ? 1e9 : 0;
        } else {
          CAM_CFG.mode = CAM_CFG.mode === 'arcade' ? 'cinematic' : 'arcade';
          popup(CAM_CFG.mode === 'cinematic' ? 'CINEMATIC CAMERA' : 'ARCADE CAMERA', '#9db4ff');
        }
      }
      if(gamepadEdge(state, 'tuningMenu')) toggleTunePanel();
      if(gamepadEdge(state, 'mute')){
        const muted = SFX.toggleMute();
        popup(muted ? 'MUTED' : 'SOUND ON', '#9aa3b8');
      }
      if(gamepadEdge(state, 'legend')){
        const legend = document.getElementById('legend');
        if(legend) legend.classList.toggle('collapsed');
      }
    }
  }
  PLAYER_LIGHT_RIG.setHighBeams(!GAME.state.paused && !isEditorSimulationPreview() && !!(keys['f'] || (state && state.highBeams)));
  lastGamepadActions = state ? Object.assign({}, state) : {};
}
function checkResetEdge(){
  if(!INPUT) return;
  const held = !isEditorSimulationPreview() && !!INPUT.player(0).drive().reset;
  if(held && !lastResetHeld) resetCar();
  lastResetHeld = held;
}
function applyProjectInputConfig(){
  if(!INPUT) return;
  let cfg = null;
  try {
    const store = window.LK_STORE;
    const project = store && store.loadProject ? store.loadProject() : null;
    cfg = project && project.meta ? project.meta.input : null;
  } catch(err){}
  if(INPUT.setOverrideEnabled) INPUT.setOverrideEnabled(true);   // game applies player remaps (editor turned this off)
  INPUT.setConfig(cfg);
}
let MAPPING = null;
function touchControlsRuntimeVisible(){
  const settings = document.getElementById('settingsOverlay');
  if(settings && settings.classList.contains('open')) return false;
  if(GAME.state.editorActive) return !!GAME.state.editorPreview && !isEditorSimulationPreview();
  if(!(SESSION && SESSION.isStarted && SESSION.isStarted())) return false;
  return !(overlay && !overlay.classList.contains('hidden'));
}
function refreshTouchControls(){
  if(TOUCH_CONTROLS && TOUCH_CONTROLS.refresh) TOUCH_CONTROLS.refresh();
}
if(INPUT){
  if(window.LK_RUNTIME_TOUCH_CONTROLS){
    TOUCH_CONTROLS = window.LK_RUNTIME_TOUCH_CONTROLS.create({
      manager: INPUT,
      mount: document.body,
      isRuntimeVisible: touchControlsRuntimeVisible,
    });
  }
  // draggable/resizable Mapping window shared by the in-game Controls menu
  if(window.LK_RUNTIME_WINDOW_MANAGER && window.LK_RUNTIME_MAPPING_OVERLAY){
    const WM = window.LK_RUNTIME_WINDOW_MANAGER.create({storageKey: 'lotking.windows.game.v1'});
    const session = {
      getConfig: () => INPUT.getConfig(),
      setContext: id => INPUT.setActiveContext(id),
      remap: (deviceId, action, binding) => INPUT.remap(deviceId, action, binding),
      addInstance: type => INPUT.addInstance(type),
      removeInstance: id => INPUT.removeInstance(id),
      onChange: fn => INPUT.onChange(fn),
      liveKeyboardDown: code => INPUT.liveKeyboardDown(code),
      liveGamepad: idx => INPUT.liveGamepad(idx),
    };
    MAPPING = window.LK_RUNTIME_MAPPING_OVERLAY.create({wm: WM, session, lang: () => GAME.i18n.lang, windowId: 'lk-mapping-game'});
    GAME.input.openMapping = () => MAPPING && MAPPING.open();
  }
  if(window.LK_RUNTIME_INPUT_MENU){
    window.LK_RUNTIME_INPUT_MENU.create({manager: INPUT, body: document.getElementById('lkControlsBody'), lang: GAME.i18n.lang, openMapping: () => MAPPING && MAPPING.open()});
  }
  applyProjectInputConfig();
}

function resetCar(){
  P.pos.set(SPAWN.x, 0, SPAWN.z); P.heading = runtimeHeadingFromVisible(SPAWN.heading); P.vel.set(0,0,0);
  P.yawRate = 0; P.steer = 0;
  SURFACE.y = 0;
  SURFACE.vy = 0;
  SURFACE.pitch = 0;
  SURFACE.roll = 0;
  SURFACE.airborne = false;
  SURFACE.normal.set(0, 1, 0);
  axPrev = 0; lastSteerAngle = 0; isDrifting = false; handbrake = false; reverseEngageTimer = 0; reverseNeedsEngageDelay = false; reverseBrakeTimer = 0; reverseGearLatched = false; brakeHoldTimer = 0; burnoutTimer = 0; ENGINE.burnout = false;
  resetEngine();
  if(PHYS.carBody) syncCarBodyToPlayer();
  carRenderPos.copy(P.pos);
  carRenderHeading = P.heading;
  carRenderPitch = 0;
  carRenderRoll = 0;
  carRenderSnap = true;
  car.position.copy(P.pos); applyPlayerRootFromRuntimeHeading();
  driftScore = 0; driftMult = 1; driftTime = 0;
  HUD.hideDrift();
}
function syncEditorSpawnFromPlayer(){
  if(!GAME.state.editorActive || GAME.state.editorPreview || !GAME.player || !GAME.player.car) return;
  syncPlayerSpawnFromVisibleTransform();
}

// ------------------------------------------------ local 3D models
// Load order: ./models/*.glb first, optional ./models/*/scene.gltf fallback,
// then procedural placeholders if no model can be loaded.
// You can also DRAG & DROP a .glb file onto the page to use it as the player car.
const MODEL_ASSETS = window.LK_RUNTIME_MODEL_ASSETS.create({THREERef: THREE, car, isFileMode: IS_FILE_MODE});
const gltfLoader = MODEL_ASSETS.gltfLoader;
const RIG = MODEL_ASSETS.rig;
const MODEL_SIZE = Object.freeze({
  playerLen: 5.6,
  parkedLen: 4.2,
  coneHeight: .9,
});

function tryLoadModel(paths, onProg){
  return MODEL_ASSETS.tryLoadModel(paths, onProg);
}

const PLAYER_MODEL = window.LK_RUNTIME_PLAYER_MODEL.create({
  modelAssets: MODEL_ASSETS,
  car,
  carVisual,
  modelSize: MODEL_SIZE,
  popup,
  canDropReplace: () => GAME.state.started && !GAME.state.editorActive && !GAME.state.editorPreview,
});
const prepModel = PLAYER_MODEL.prepModel;
function setPlayerModel(sceneRoot){
  const result = PLAYER_MODEL.setPlayerModel(sceneRoot);
  applyPlayerRootFromRuntimeHeading();
  return result;
}
PLAYER_MODEL.bindDrop(window);

// ------------------------------------------------ RADIO (soundhud) + slow-motion
const RADIO = window.LK_RUNTIME_RADIO_HUD.create({
  paths: ASSETS,
  canvas,
  clamp,
  popup,
  telemetry: () => ({speedKmh, lastLatG}),
  isRuntimeUiSuppressed: () => isEditorSimulationPreview(),
});

// slow-motion state (radio open → super slow-mo)
const TS = {cur:1, get target(){ return RADIO.isOpen() ? 0.1 : 1; }};

const IS_EMBEDDED_GAMEPLAY = !!window.__LK_EMBEDDED_GAMEPLAY;
function createNoopMenuMusic(){
  return {
    audio: null,
    bindAutoStart: function(){},
    bindButton: function(){},
    syncButton: function(){},
    setVolume: function(){},
    getTracks: function(){ return []; },
    addTracks: function(){ return []; },
    loadTrack: function(){},
    play: function(){ return Promise.resolve(); },
    pause: function(){},
    fadeOut: function(){ return Promise.resolve(); },
    toggle: function(){ return Promise.resolve(); },
  };
}

// menu music (loops on the start screen; starts at first interaction - browser policy)
const MENU_MUSIC = IS_EMBEDDED_GAMEPLAY ? createNoopMenuMusic() : window.LK_RUNTIME_MENU_MUSIC.create({
  tracks: [
    {url: ASSETS.menuMusic, title:'JUST WAIT', artist:'NUM0', fileName:'Num0  JustWait.mp3', source:'Menu default'},
  ],
  popup,
  getVolume: () => .55 * AUDIO.master * AUDIO.music,
});
initSettingsMenu();
applyAudioSettings();

// ------------------------------------------------ start / loading flow
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const loadTxt = document.getElementById('loadTxt');
const levelSelect = document.getElementById('levelSelect');
const levelCards = document.getElementById('levelCards');
const levelBackBtn = document.getElementById('levelBackBtn');

const TRACK_CATALOG = window.LK_RUNTIME_TRACK_CATALOG.create({
  overlay,
  levelSelect,
  levelCards,
  loadText: loadTxt,
  onLaunch: levelId => launchLevel(levelId),
});
var SESSION = window.LK_RUNTIME_SESSION_FLOW.create({
  gameState: GAME.state,
  trackCatalog: TRACK_CATALOG,
});

let GAME_FLOW = null;
function showLevelSelect(){ if(GAME_FLOW) GAME_FLOW.showLevelSelect(); }
function hideLevelSelect(){ if(GAME_FLOW) GAME_FLOW.hideLevelSelect(); }
function unloadCurrentLevel(){ if(GAME_FLOW) GAME_FLOW.unloadCurrentLevel(); }
function prepareEditorLevel(){ return GAME_FLOW ? GAME_FLOW.prepareEditorLevel() : null; }
function setEditorTrack(track){ if(GAME_FLOW) GAME_FLOW.setEditorTrack(track); }
function enterGameplayMode(){ if(GAME_FLOW) GAME_FLOW.enterGameplayMode(); }
function beginGameplaySession(editorPreview, editorPreviewMode){ if(GAME_FLOW) GAME_FLOW.beginGameplaySession(editorPreview, editorPreviewMode); }
function stopEditorPreview(){ if(GAME_FLOW) GAME_FLOW.stopEditorPreview(); }
function backToMainMenu(){ if(GAME_FLOW) GAME_FLOW.backToMainMenu(); }
function startGame(){ if(GAME_FLOW) { GAME_FLOW.startGame(); } }
function startEditorPreview(mode){ if(GAME_FLOW) GAME_FLOW.startEditorPreview(mode); }
function launchLevel(levelId){
  // livelli della libreria editor: se serve, lo store attiva il livello
  // scelto (ed eventualmente ricarica la pagina quando la scena è già applicata)
  const store = window.LK_STORE;
  if(store && store.levels && store.levels.prepareLaunch){
    const prepareResult = store.levels.prepareLaunch(levelId);
    if(prepareResult === 'reload') return;
    const levelsStore = store.levels;
    if(levelsStore && typeof levelsStore.setActive === 'function'){
      const currentId = typeof levelsStore.activeId === 'function' ? levelsStore.activeId() : null;
      if(currentId !== levelId){
        const changed = levelsStore.setActive(levelId);
        if(changed && store.isApplied && store.isApplied()){
          try { sessionStorage.setItem('lk.autolaunch', levelId); } catch(err){}
          location.reload();
          return;
        }
      }
    }
  }
  applyProjectInputConfig();   // pick up this level's meta.input before play
  if(GAME_FLOW) GAME_FLOW.launchLevel(levelId);
}

const loadBar = document.getElementById('loadBar');
const editorBtn = document.getElementById('editorBtn');
let RUNTIME_LOADER = null;
const LOADING = window.LK_RUNTIME_LOADING_FLOW.create({
  loadBar,
  loadText: loadTxt,
  overlay,
  startButton: startBtn,
  editorButton: editorBtn,
  getLoadReport: () => RUNTIME_LOADER ? RUNTIME_LOADER.report() : [],
  isFileMode: () => IS_FILE_MODE,
  hasGltfLoader: () => !!gltfLoader,
});
LOADING.setIdleText('choose track');
LOADING.setBar(0);
function preloadMenuShell(){
  if(!overlay) return;
  const tasks = [];
  const setMenuProgress = (pct, label) => {
    if(loadBar) loadBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
    if(loadTxt) loadTxt.textContent = label + '... ' + Math.round(pct) + '%';
  };
  setMenuProgress(8, 'loading menu');
  tasks.push(new Promise(resolve => {
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = 'media/images/menu_bg.png';
    setTimeout(done, 1200);
  }).then(() => setMenuProgress(46, 'loading menu background')));
  if(MENU_MUSIC && MENU_MUSIC.audio){
    tasks.push(new Promise(resolve => {
      const audio = MENU_MUSIC.audio;
      const done = () => {
        audio.removeEventListener('canplaythrough', done);
        audio.removeEventListener('loadeddata', done);
        audio.removeEventListener('error', done);
        resolve();
      };
      audio.addEventListener('canplaythrough', done, {once:true});
      audio.addEventListener('loadeddata', done, {once:true});
      audio.addEventListener('error', done, {once:true});
      try { audio.load(); } catch(err){ done(); }
      setTimeout(done, 1800);
    }).then(() => setMenuProgress(82, 'loading menu music')));
  }
  Promise.all(tasks).then(() => {
    setMenuProgress(100, 'menu ready');
    setTimeout(() => {
      if(GAME.state.editorActive){
        overlay.classList.remove('menu-preloading');
        overlay.classList.remove('choosing-level');
        overlay.classList.add('hidden');
        return;
      }
      overlay.classList.remove('menu-preloading');
      overlay.classList.remove('choosing-level');
      overlay.classList.remove('hidden');
      LOADING.setIdleText('choose track');
      LOADING.setBar(0);
    }, 280);
  });
}
preloadMenuShell();
RUNTIME_LOADER = window.LK_RUNTIME_RUNTIME_LOADER.create({
  loading: LOADING,
  gameState: GAME.state,
  paths: ASSETS,
  isFileMode: () => IS_FILE_MODE,
  hasGltfLoader: () => !!gltfLoader,
  tryLoadModel,
  prepModel,
  modelSize: MODEL_SIZE,
  setPlayerModel,
  parkedGroups,
  cones,
  keys,
  engine: ENGINE,
  getSpeed: () => speedKmh,
  setSpeed: value => { speedKmh = value; },
  syncCollider: obj => { if(window.LK_STORE && window.LK_STORE.syncCollider) window.LK_STORE.syncCollider(obj); },
  renderer,
  scene,
  camera,
  playerLights: PLAYER_LIGHT_CFG,
  setPlayerLights: setPlayerLightConfig,
  setHighBeams: v => PLAYER_LIGHT_RIG.setHighBeams(v),
  renderGameplayCamera: renderPlayerCamera,
  updatePlayerLights,
  getSceneReady: () => window.LK_STORE && (window.LK_STORE.ensureApplied ? window.LK_STORE.ensureApplied(GAME) : window.LK_STORE.ready),
});

GAME_FLOW = window.LK_RUNTIME_GAME_FLOW.create({
  gameState: GAME.state,
  session: SESSION,
  trackCatalog: TRACK_CATALOG,
  overlay,
  loadText: loadTxt,
  hud: document.getElementById('hud'),
  ensureRuntimeReady: RUNTIME_LOADER.ensureReady,
  isRuntimeReady: RUNTIME_LOADER.isReady,
  clearInput: () => { for(const k of Object.keys(keys)) keys[k] = false; },
  pauseRadio: () => {
    RADIO.toggleOpen(false);
    RADIO.audio.pause();
    try { RADIO.audio.currentTime = 0; } catch(err){}
    ENGINE_AUDIO.stop();
    if(SFX.stopEngineSynth) SFX.stopEngineSynth();
  },
  beginRadio: () => {
    RADIO.begin();
    RADIO.audio.play().catch(()=>{});
  },
  previewRadioHud: visible => {
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(visible);
  },
  resetTimescale: () => { TS.cur = 1; },
  resetCar,
  syncEditorSpawnFromPlayer,
  disposePhysicsWorld,
  disposeRenderLists: () => {
    if(renderer && renderer.renderLists) renderer.renderLists.dispose();
  },
  exitEditor: toPlay => {
    if(GAME.editor && GAME.editor.state && GAME.editor.state.active && GAME.editor.exit) GAME.editor.exit(!!toPlay);
  },
  clearFrameOverride: () => { GAME.hooks.frameOverride = null; },
  setDragging: value => { dragging = !!value; },
  resetGameplayCamera: resetCameraState,
  refreshTouchControls,
  setSettingsOpen,
  setTuneOpen,
  initGameplayPhysics: () => {
    if(initPhysicsWorld()){
      rebuildPhysicsStatics();
      syncCarBodyToPlayer();
    }
    SFX.init();
    ENGINE_AUDIO.start();   // sample engine + accensione (fallback synth se set assente)
  },
  pauseMenuMusic: () => {
    if(MENU_MUSIC.fadeOut) return MENU_MUSIC.fadeOut(2200);
    return MENU_MUSIC.pause();
  },
  playMenuMusic: () => MENU_MUSIC.play().catch(()=>{}),
  setMenuBusy: RUNTIME_LOADER.setBusy,
});

// menu music: explicit button (browsers require a user gesture for audio)
MENU_MUSIC.bindButton(document.getElementById('menuMusicBtn'));
MENU_MUSIC.bindAutoStart(overlay, () => SESSION.isStarted());

if(startBtn) startBtn.addEventListener('click', showLevelSelect);
if(levelBackBtn) levelBackBtn.addEventListener('click', hideLevelSelect);

Object.assign(GAME.assets, {
  ensureReady: RUNTIME_LOADER.ensureReady,
  isReady: RUNTIME_LOADER.isReady,
  setLoadingStage: RUNTIME_LOADER.setLoadingStage,
  finishLoading: RUNTIME_LOADER.finishLoading,
  failLoading: RUNTIME_LOADER.failLoading,
});
GAME.levels = {
  available: TRACK_CATALOG.available(),
  current: TRACK_CATALOG.current,
  isLoaded: SESSION.isLoaded,
  choose: showLevelSelect,
  launch: launchLevel,
  unload: unloadCurrentLevel,
  prepareEditor: prepareEditorLevel,
  setTracks: TRACK_CATALOG.setTracks,
  setEditorTrack,
};

function setPlayerCollisionConfig(values){
  const v = values || {};
  const setPositive = (key, min, max) => {
    if(v[key] == null) return;
    const n = Number(v[key]);
    if(Number.isFinite(n)) PLAYER_COLLISION[key] = clamp(n, min, max);
  };
  setPositive('hx', 0.1, 8);
  setPositive('hy', 0.05, 4);
  setPositive('hz', 0.1, 12);
  setPositive('radius', 0.1, 10);
  ['offsetX', 'offsetZ'].forEach(key => {
    if(v[key] == null) return;
    const n = Number(v[key]);
    if(Number.isFinite(n)) PLAYER_COLLISION[key] = clamp(n, -6, 6);
  });
  if(v.offsetY != null){
    const n = Number(v.offsetY);
    if(Number.isFinite(n)) PLAYER_COLLISION.offsetY = clamp(n, -2, 4);
  }
  ['rotX', 'rotY', 'rotZ'].forEach(key => {
    if(v[key] == null) return;
    const n = Number(v[key]);
    if(Number.isFinite(n)) PLAYER_COLLISION[key] = clamp(n, -Math.PI, Math.PI);
  });
  if(v.bodyY != null){
    const n = Number(v.bodyY);
    if(Number.isFinite(n)) PLAYER_COLLISION.bodyY = clamp(n, 0.05, 5);
  }
  if(PHYS.world && rebuildPlayerPhysicsBody) rebuildPlayerPhysicsBody();
  return PLAYER_COLLISION;
}

Object.assign(GAME.core, {canvas, renderer, scene, camera, lights: {hemi, sun, pl1, pl2}});
Object.assign(GAME.world, {
  state: WORLD_STATE,
  generator: WORLD_GENERATOR,
  activeTrack: WORLD_TRACK,
  constants: {LOT, WALL_H},
  colliders: {circle: circleColliders, box: boxColliders},
  entities: {parkedGroups, cones},
  registry: REGISTRY,
  register: tagEntity,
  unregister: unregisterEntity,
});
Object.assign(GAME.player, {
  car,
  visual: carVisual,
  wheels,
  physics: P,
  collision: PLAYER_COLLISION,
  setCollision: setPlayerCollisionConfig,
  config: CFG,
  drive: DRIVE,
  engine: ENGINE,
  tuning: DRIVE_TUNING,
  reset: resetCar,
  spawn: SPAWN,
  visibleHeading: playerVisibleHeading,
  visibleHeadingFromRuntime,
  setVisibleHeading: setPlayerVisibleHeading,
  setVisualBaseRotation: setPlayerVisualBaseRotation,
  syncSpawnFromVisibleTransform: syncPlayerSpawnFromVisibleTransform,
  setModel: setPlayerModel,
  getModel: PLAYER_MODEL.getPlayerModel,
  headlight: PLAYER_LIGHT_RIG.headlight,
  lights: PLAYER_LIGHT_CFG,
  setLights: setPlayerLightConfig,
  addLight: addPlayerAuxLight,
  updateLights: updatePlayerLights,
  dataWidgets: PLAYER_DATA_WIDGETS.config,
  setDataWidgets: PLAYER_DATA_WIDGETS.set,
  updateDataWidgets: PLAYER_DATA_WIDGETS.update,
  syncDataWidget: PLAYER_DATA_WIDGETS.syncFromAnchor,
  skids: PLAYER_SKID_CFG,
  setSkids: setPlayerSkidConfig,
  addSkid: addPlayerSkidSource,
  syncSkid: syncPlayerSkidSource,
  updateSkids: applyPlayerSkidConfig,
  engineAudio: PLAYER_ENGINE_AUDIO_CFG,
  setEngineSound: setPlayerEngineSound,
  exhaust: PLAYER_EXHAUST_CFG,
  setExhaust: setPlayerExhaustConfig,
  addExhaust: addPlayerExhaustSource,
  updateExhaust: updatePlayerExhaust,
  testExhaust: testPlayerExhaust,
  cameraCfg: CAM_CFG,
  cameraAspects: CAMERA_ASPECTS,
  cameraAspectValue,
  cameraRenderRect,
  applyCameraCfg,
  setCameraConfig,
  resetCamera: resetCameraState,
  setTuning: values => DRIVE_TUNING.syncInputs(values),
});
Object.assign(GAME.systems, {
  audio: SFX,
  engineAudio: ENGINE_AUDIO,
  rain: RAIN,
  radio: RADIO,
  menuMusic: {
    audio: MENU_MUSIC.audio,
    play: MENU_MUSIC.play,
    pause: MENU_MUSIC.pause,
    toggle: MENU_MUSIC.toggle,
    setVolume: MENU_MUSIC.setVolume,
    getTracks: MENU_MUSIC.getTracks,
    addTracks: MENU_MUSIC.addTracks,
    loadTrack: MENU_MUSIC.loadTrack,
    fadeOut: MENU_MUSIC.fadeOut,
  },
  sky: SKY,
  rig: RIG,
  post: POST,
  session: SESSION,
  physics: {
    available: () => PHYS.available,
    active: () => PHYS.active,
    rebuild: rebuildPhysicsStatics,
    syncPlayer: syncCarBodyToPlayer,
    setSurfaceWorldCollision: value => {
      setSurfaceWorldCollision(value);
      rebuildPhysicsStatics();
    },
    getSurfaceWorldCollision: () => PHYS.surfaceWorldCollision !== false,
    raw: PHYS,
  },
});
Object.assign(GAME.actions, {
  start: startGame,
  chooseLevel: showLevelSelect,
  launchLevel,
  startEditorPreview,
  stopEditorPreview,
  stepGameplayPreview: dt => stepGameplayFrame(dt, false),
  renderGameplayCamera: renderPlayerCamera,
  renderGameplayCameraRect: renderPlayerCamera,
  unloadLevel: unloadCurrentLevel,
  prepareEditorLevel,
  backToMenu: backToMainMenu,
  openPause: (mode, options) => setSettingsOpen(true, mode, options || {source: 'keyboard'}),
  closePause: () => setSettingsOpen(false),
  togglePause: (mode, options) => toggleSettingsMenu(mode, options),
  toggleMenuMusic: MENU_MUSIC.toggle,
});
Object.assign(GAME.ui, {
  popup,
  radioHud: RADIO.config,
  setRadioHud: RADIO.setConfig,
  previewRadioHud: RADIO.setEditorPreview,
});
Object.assign(GAME.settings, {
  audio: AUDIO,
  applyAudio: applyAudioSettings,
  setAudio: setAudioChannel,
  video: VIDEO,
  applyVideo: applyVideoSettings,
  menuMusic: MENU_MUSIC.audio,
  setAudioOpen: setSettingsOpen,
  toggleAudio: toggleSettingsMenu,
  setTuningOpen: setTuneOpen,
  toggleTuning: toggleTunePanel,
});

// ------------------------------------------------ main loop
let prevT = performance.now();

function stepGameplayFrame(dt, shouldRender){
  if(GAME.state.paused){
    SFX.update(0, 0, 0);
    ENGINE_AUDIO.setMuted(true);
    ENGINE_AUDIO.update(dt);
    if(shouldRender) renderPlayerCamera();
    return;
  }
  ENGINE_AUDIO.setMuted(false);

  // super slow-motion while the radio is open (smooth in/out)
  TS.cur += (TS.target - TS.cur) * Math.min(1, dt*4);
  const sdt = dt * TS.cur;

  const {vF, vR, drifting} = updateCar(sdt);
  lastCamVF = vF;
  lastCamVR = vR;
  lastCamDrifting = drifting;
  updatePlayerLights();
  updatePlayerExhaust(sdt);
  updateScoring(sdt, drifting);
  PLAYER_DATA_WIDGETS.update();
  WORLD_STATE.updatePhysicsObjects(sdt);

  // Tire mark decals: drift, braking, wheelspin, burnout and spinout all feed
  // the same ground marks; intensity controls both density and opacity.
  const slide = Math.min(1, Math.abs(vR)/12);
  const driveFx = readDriveInput();
  const speed01 = clamp(speedKmh / 120, 0, 1);
  const tireRotation01 = clamp(Math.abs(vF) / 28, 0, 1);
  const yawSpin = clamp(Math.abs(P.yawRate || 0) / 2.8, 0, 1);
  const gSlip = clamp((lastLatG || 0) / .75, 0, 1);
  const decelSlip = clamp(Math.max(0, -axPrev) / (G_ACC * .72), 0, 1);
  const accelForce = clamp(Math.max(0, axPrev) / (G_ACC * .95), 0, 1);
  const brakeSlip = driveFx.brake > .05 && !ENGINE.reverseActive && speedKmh > 16;
  const burnoutSlip = !!ENGINE.burnout && !ENGINE.reverseActive;
  const accelSlip = (ENGINE.throttle || 0) > .55 && !ENGINE.reverseActive &&
    speedKmh > 2 && speedKmh < 26 && (ENGINE.rpm01 || 0) > .4;
  const lateralSlip = (drifting || (handbrake && speedKmh > 15)) && speedKmh > 12;
  const driveWheelMismatch = clamp(
    ((ENGINE.rpm01 || 0) * Math.max(.25, ENGINE.throttle || 0)) + (burnoutSlip ? .55 : 0) - tireRotation01 * .68 - speed01 * .18,
    0,
    1
  );
  const spinoutSlip = speedKmh > 12 ? clamp(Math.max(slide, yawSpin, gSlip) * .92, 0, 1) : 0;
  const allWheelSlip = Math.max(
    lateralSlip ? Math.max(slide, gSlip * .72) : 0,
    brakeSlip ? Math.max(.18 + driveFx.brake * .45 + speed01 * .22, decelSlip) : 0,
    spinoutSlip > .42 ? spinoutSlip : 0
  );
  const rearWheelSlip = Math.max(
    allWheelSlip,
    burnoutSlip ? clamp(.58 + (ENGINE.rpm01 || 0) * .36, 0, 1) : 0,
    accelSlip ? clamp(.22 + driveWheelMismatch * .62 + (ENGINE.rpm01 || 0) * .28 + accelForce * .34 + slide * .18, 0, 1) : 0
  );
  const frontWheelSlip = Math.max(allWheelSlip, brakeSlip ? decelSlip : 0);
  const skidAudioDrift = Math.max(lateralSlip ? Math.min(1, .35 + slide * .8) : 0, spinoutSlip > .42 ? spinoutSlip : 0);
  const skidAudioBrake = brakeSlip ? Math.min(1, .34 + driveFx.brake * .42 + speedKmh / 170 + decelSlip * .36) : 0;
  const skidAudioAccel = Math.max(
    accelSlip ? Math.min(1, .28 + driveWheelMismatch * .56 + (ENGINE.rpm01 || 0) * .32 + accelForce * .2) : 0,
    burnoutSlip ? Math.min(1, .62 + (ENGINE.rpm01 || 0) * .3) : 0
  );
  if(lateralSlip || brakeSlip || accelSlip || burnoutSlip || spinoutSlip > .42){
    const activeSkids = playerSkidRig.sources
      .map((rig, i) => ({rig, cfg:PLAYER_SKID_CFG.sources[i]}))
      .filter(item => item.rig && item.rig.anchor && item.cfg && item.cfg.enabled !== false);
    const hasSkidRig = playerSkidRig.sources.some(rig => rig && rig.anchor);
    if(activeSkids.length){
      for(const item of activeSkids){
        const idx = item.rig.anchor.userData.skidIndex;
        const wheel = skidWheelKey(idx, item.cfg);
        const slipAmount = clamp(isFrontSkidWheel(wheel) ? frontWheelSlip : (isRearSkidWheel(wheel) ? rearWheelSlip : allWheelSlip), 0, 1);
        if(slipAmount < .08) continue;
        const anchor = item.rig.anchor;
        const wp = new THREE.Vector3();
        anchor.getWorldPosition(wp);
        const q = new THREE.Quaternion();
        anchor.getWorldQuaternion(q);
        const dir = new THREE.Vector3(0,0,1).applyQuaternion(q);
        const heading = Math.atan2(dir.x, dir.z);
        const density = clamp(.16 + slipAmount * .74 + speed01 * .12 + gSlip * .16, 0, 1);
        if(Math.random() < density * .62) spawnSmoke(wp, slipAmount);
        if(Math.random() < density) spawnSkid(wp.x, wp.z, heading, Math.abs(anchor.scale.x || 1), Math.abs(anchor.scale.z || 1), slipAmount);
      }
    } else if(!hasSkidRig) {
      const fwd = new THREE.Vector3(Math.sin(P.heading),0,Math.cos(P.heading));
      const side = new THREE.Vector3(fwd.z,0,-fwd.x);
      const fallback = [
        {z:-1.35, s:-1, slip:rearWheelSlip},
        {z:-1.35, s:1, slip:rearWheelSlip},
        {z:1.35, s:-1, slip:frontWheelSlip},
        {z:1.35, s:1, slip:frontWheelSlip},
      ];
      for(const src of fallback){
        const slipAmount = clamp(src.slip, 0, 1);
        if(slipAmount < .08) continue;
        const wp = P.pos.clone().addScaledVector(fwd, src.z).addScaledVector(side, src.s*.92);
        const density = clamp(.16 + slipAmount * .74 + speed01 * .12 + gSlip * .16, 0, 1);
        if(Math.random() < density * .62) spawnSmoke(wp, slipAmount);
        if(Math.random() < density) spawnSkid(wp.x, wp.z, P.heading, 1, 1, slipAmount);
      }
    }
  }
  updateSmoke(sdt);
  updateSkids(sdt);
  updateWind(sdt, speedKmh);
  for(const h of GAME.hooks.frame) h(sdt);   // editor-added effects (emitters, ...)
  updateCamera(dt);                       // camera stays responsive in slow-mo
  SKY.update(sdt);                        // day/night cycle (slows down with slow-mo)

  // sound
  const rpm01 = ENGINE.rpm01 || Math.min(1, Math.abs(vF)/CFG.maxSpeed);
  const throttle = (keys['w']||keys['arrowup']) ? 1 : 0;
  // sgommate → engine audio: stessi flag delle skid mark, cosi' suono e segni
  // partono e finiscono insieme; lo screech del synth resta come fallback
  const skidByEngineAudio = ENGINE_AUDIO.handlesSkids();
  ENGINE_AUDIO.setSkids({
    drift: skidAudioDrift * TS.cur,
    brake: skidAudioBrake * TS.cur,
    accel: skidAudioAccel * TS.cur,
  });
  const screech01 = skidByEngineAudio ? 0 : (drifting || (handbrake && speedKmh>15) ? Math.min(1,.3+slide) : 0);
  SFX.update(rpm01 * TS.cur, throttle * TS.cur, screech01 * TS.cur);
  ENGINE_AUDIO.update(sdt);

  RADIO.updateHUD(dt, rpm01, throttle);

  const gearLabel = (ENGINE.reverseActive || vF < -.3) ? 'R' : String(ENGINE.gear || 1);
  const modeLabel = DRIVE_TUNING.getMode ? DRIVE_TUNING.getMode() : 'custom';
  const vehicleHud = document.getElementById('vehicleHud');
  if(vehicleHud){
    const mode = String(modeLabel || 'custom').toLowerCase();
    vehicleHud.classList.toggle('race', mode === 'race');
    vehicleHud.classList.toggle('custom', mode !== 'race' && mode !== 'drift');
    const kmh2 = document.getElementById('kmh2');
    const gear2 = document.getElementById('gearHud2');
    const rpmHud = document.getElementById('rpmHud');
    const rpmBar = document.getElementById('rpmBar');
    const driveType = document.getElementById('driveTypeHud');
    if(kmh2) kmh2.textContent = String(Math.max(0, Math.round(speedKmh || 0)));
    if(gear2) gear2.textContent = gearLabel;
    if(rpmHud) rpmHud.textContent = String(Math.round(ENGINE.rpm || 0));
    if(rpmBar) rpmBar.style.width = (clamp((ENGINE.rpm || 0) / GEARBOX.limiter, 0, 1) * 100).toFixed(1) + '%';
    if(driveType) driveType.textContent = mode === 'race' ? 'RACE' : (mode === 'drift' ? 'DRIFT' : 'CUSTOM');
  }
  HUD.setSpeedGear(speedKmh, gearLabel);
  if(shouldRender) renderPlayerCamera();
}

function loop(now){
  requestAnimationFrame(loop);
  if(INPUT) INPUT.update();              // poll gamepads / refresh device assignments each frame
  handleGamepadActions();
  let dt = (now - prevT)/1000; prevT = now;
  if(dt > .05) dt = .05;                 // clamp: no physics explosions on tab-back
  if(!GAME.state.paused && (SESSION.isStarted() || GAME.state.editorPreview)) checkResetEdge();
  if(GAME.hooks.frameOverride){ GAME.hooks.frameOverride(dt); return; }   // editor takes over
  if(!SESSION.isStarted()){ renderPlayerCamera(); return; }
  stepGameplayFrame(dt, true);
}
requestAnimationFrame(loop);

})();
