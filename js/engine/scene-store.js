/* =========================================================
   LOT KING — scene store (engine module)
   Serializza le modifiche fatte nell'engine editor e le riapplica
   al gioco a ogni avvio. Contiene anche le factory condivise
   (primitive, luci, effetti, GLB) usate da editor e runtime.
   ========================================================= */
(function(){
'use strict';

const KEY = 'lotking.scene.v1';
const PROJECT_FORMAT = 'LKEP';
const PROJECT_NAME = 'Lot King Engine Builder Editor Project';
const PROJECT_VERSION = 1;
const HUD_TEMPLATE_LEVEL_NAME = 'Parking Lot First Ever Level Test';
const PLAYER_TEMPLATE_LEVEL_NAME = 'Parking Lot First Ever Level';
const PLAYER_TEMPLATE_KEY = 'lotking.playerBlueprintDefault.v1';
const HUD_TEMPLATE_KEY = 'lotking.radioHudDefault.v1';
const PLAYER_BLUEPRINT_ASSETS_KEY = 'lotking.playerBlueprintAssets.v1';
const ASSET_DB_NAME = 'lotking-assets';
const ASSET_DB_STORE = 'blobs';
const assetUrlCache = new Map();

function assetDbOpen(){
  return new Promise((resolve, reject) => {
    if(!window.indexedDB){ reject(new Error('IndexedDB non disponibile')); return; }
    const req = indexedDB.open(ASSET_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(ASSET_DB_STORE)) db.createObjectStore(ASSET_DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Asset database non disponibile'));
  });
}
function assetBlobPut(key, blob){
  return assetDbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_DB_STORE, 'readwrite');
    tx.objectStore(ASSET_DB_STORE).put(blob, key);
    tx.oncomplete = () => { db.close(); resolve(key); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Asset non salvato')); };
  }));
}
function assetBlobGet(key){
  return assetDbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_DB_STORE, 'readonly');
    const req = tx.objectStore(ASSET_DB_STORE).get(key);
    req.onsuccess = () => { db.close(); req.result ? resolve(req.result) : reject(new Error('Asset blob non trovato')); };
    req.onerror = () => { db.close(); reject(req.error || new Error('Asset blob non leggibile')); };
  }));
}
function assetBlobRemove(key){
  return assetDbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_DB_STORE, 'readwrite');
    tx.objectStore(ASSET_DB_STORE).delete(key);
    tx.oncomplete = () => {
      db.close();
      if(assetUrlCache.has(key)){ URL.revokeObjectURL(assetUrlCache.get(key)); assetUrlCache.delete(key); }
      resolve();
    };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Asset blob non eliminato')); };
  }));
}
function assetBlobUrl(key){
  if(assetUrlCache.has(key)) return Promise.resolve(assetUrlCache.get(key));
  return assetBlobGet(key).then(blob => {
    const url = URL.createObjectURL(blob);
    assetUrlCache.set(key, url);
    return url;
  });
}
window.LK_ASSET_BLOBS = Object.freeze({put: assetBlobPut, getUrl: assetBlobUrl, remove: assetBlobRemove});

// ------------------------------------------------ store I/O
function load(){
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sceneFromProject(JSON.parse(raw)) : null;
  } catch(err){ console.warn('LotKing store: dati scena corrotti, ignorati', err); return null; }
}
function loadProject(){
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseProject(JSON.parse(raw)) : projectFromScene(blank());
  } catch(err){ console.warn('LotKing store: progetto corrotto, ignorato', err); return projectFromScene(blank()); }
}
function save(data, meta){
  try {
    const project = projectFromScene(data, meta);
    localStorage.setItem(KEY, JSON.stringify(project));
    return !!upsertActiveLevel(project);
  }
  catch(err){ console.warn('LotKing store: salvataggio fallito (quota?)', err); return false; }
}
function clear(){ localStorage.removeItem(KEY); }
function blank(){
  return {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}};
}
function sceneFromProject(data){
  if(!data) return null;
  if(data.format === PROJECT_FORMAT && data.scene) return data.scene;
  if(data.transforms || data.added || data.player || data.env || data.ui) return data;
  return null;
}
function projectFromScene(scene, meta){
  return {
    format: PROJECT_FORMAT,
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    game: 'Lot King Engine Builder & Car Drift Game',
    savedAt: new Date().toISOString(),
    meta: Object.assign({trackId:'parking-lot', trackName:'Parking Lot'}, meta || {}),
    scene: scene || blank(),
  };
}
function parseProject(raw){
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const scene = sceneFromProject(data);
  if(!scene) throw new Error('Formato progetto non valido');
  return data && data.format === PROJECT_FORMAT ? data : projectFromScene(scene, {importedLegacy:true});
}
function exportProject(scene, meta){
  return projectFromScene(scene, meta);
}
function importProject(project){
  const parsed = parseProject(project);
  save(parsed.scene, parsed.meta);
  return parsed;
}
function cloneData(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function normalizeName(s){
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ------------------------------------------------ level library (multi-livello, stile Unreal)
// KEY resta lo "slot attivo" applicato al boot; la libreria tiene un progetto
// LKEP per livello sotto 'lotking.level.<id>' + un indice con l'id attivo.
const LEVELS_KEY = 'lotking.levels.v1';
const LEVEL_PREFIX = 'lotking.level.';
function normalizeLevelId(value){
  if(value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function readIndex(){
  try {
    const raw = localStorage.getItem(LEVELS_KEY);
    if(raw){
      const idx = JSON.parse(raw);
      if(idx && Array.isArray(idx.levels)){
        idx.activeId = normalizeLevelId(idx.activeId);
        idx.levels = idx.levels
          .map(entry => Object.assign({}, entry, {id: normalizeLevelId(entry && entry.id)}))
          .filter(entry => !!entry.id);
        return idx;
      }
    }
  } catch(err){ console.warn('LotKing store: indice livelli corrotto, rigenerato', err); }
  return {activeId: null, levels: []};
}
function writeIndex(idx){
  try { localStorage.setItem(LEVELS_KEY, JSON.stringify(idx)); return true; }
  catch(err){ console.warn('LotKing store: indice livelli non salvato', err); return false; }
}
function levelEntry(idx, id){
  const target = normalizeLevelId(id);
  return idx.levels.find(l => normalizeLevelId(l.id) === target) || null;
}
function slugifyLevel(name){
  return (name || 'level').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'level';
}
function uniqueLevelId(idx, name){
  const base = slugifyLevel(name);
  let id = base, n = 2;
  while(levelEntry(idx, id)) id = base + '-' + (n++);
  return id;
}
function readLevelProject(id){
  id = normalizeLevelId(id);
  try {
    const raw = localStorage.getItem(LEVEL_PREFIX + id);
    return raw ? parseProject(JSON.parse(raw)) : null;
  } catch(err){ console.warn('LotKing store: livello "' + id + '" corrotto', err); return null; }
}
function writeLevelProject(id, project){
  id = normalizeLevelId(id);
  try { localStorage.setItem(LEVEL_PREFIX + id, JSON.stringify(project)); return true; }
  catch(err){ console.warn('LotKing store: livello "' + id + '" non salvato (quota?)', err); return false; }
}

function repairIndexFromStoredLevels(idx){
  let changed = false;
  try {
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(!key || key.indexOf(LEVEL_PREFIX) !== 0) continue;
      const id = key.slice(LEVEL_PREFIX.length);
      if(!id || levelEntry(idx, id)) continue;
      const project = readLevelProject(id);
      if(!project) continue;
      const meta = project.meta || {};
      idx.levels.push({
        id,
        name: meta.trackName || meta.levelName || id,
        savedAt: project.savedAt || new Date().toISOString(),
      });
      changed = true;
    }
  } catch(err){ console.warn('LotKing store: riparazione indice livelli fallita', err); }
  if(!idx.activeId && idx.levels.length){
    idx.levels.sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
    idx.activeId = idx.levels[0].id;
    changed = true;
  }
  if(changed) writeIndex(idx);
  return idx;
}

// migrazione: il vecchio salvataggio single-slot diventa il primo livello della libreria
function ensureLibrary(){
  const idx = readIndex();
  if(!idx.levels.length){
    let project = null;
    try {
      const raw = localStorage.getItem(KEY);
      project = raw ? parseProject(JSON.parse(raw)) : null;
    } catch(err){}
    if(project){
      const meta = project.meta || {};
      const name = meta.trackName || meta.levelName || 'Parking Lot';
      const id = uniqueLevelId(idx, meta.trackId || name);
      project.meta = Object.assign({}, meta, {trackId: id, trackName: name});
      if(writeLevelProject(id, project)){
        idx.levels.push({id, name, savedAt: project.savedAt || new Date().toISOString()});
        idx.activeId = id;
        writeIndex(idx);
      }
    }
  }
  if(idx.activeId && !levelEntry(idx, idx.activeId)){
    idx.activeId = idx.levels.length ? idx.levels[0].id : null;
    writeIndex(idx);
  }
  return repairIndexFromStoredLevels(idx);
}

function upsertActiveLevel(project){
  const idx = ensureLibrary();
  const meta = project.meta || {};
  let id = normalizeLevelId(idx.activeId);
  idx.activeId = id;
  if(!id){
    id = uniqueLevelId(idx, meta.trackId || meta.trackName || 'level');
    idx.levels.push({id, name: meta.trackName || id, savedAt: project.savedAt});
    idx.activeId = id;
  }
  const entry = levelEntry(idx, id);
  if(!entry) return false;
  if(meta.trackName) entry.name = meta.trackName;
  entry.savedAt = project.savedAt || new Date().toISOString();
  const copy = Object.assign({}, project, {meta: Object.assign({}, meta, {trackId: id, trackName: entry.name})});
  if(!writeLevelProject(id, copy)) return false;
  if(!writeIndex(idx)) return false;
  maybeStorePlayerBlueprintDefault(copy, entry);
  maybeStoreRadioHudDefault(copy, entry);
  syncCatalog();
  return {id, name: entry.name, savedAt: entry.savedAt};
}

function playerBlueprintScore(player){
  if(!player) return 0;
  let score = 0;
  if(player.modelSrc) score += 20;
  if(player.cam) score += 8 + Object.keys(player.cam).length;
  if(player.tuning) score += Object.keys(player.tuning).length;
  if(player.lights) score += 10 + JSON.stringify(player.lights).length / 300;
  if(player.exhaust) score += 12 + JSON.stringify(player.exhaust).length / 220;
  if(player.dataWidgets) score += 8 + JSON.stringify(player.dataWidgets).length / 260;
  return score;
}
function levelLooksLikePlayerDefault(entry){
  const name = normalizeName(entry && entry.name);
  const id = normalizeName(entry && entry.id);
  const wanted = normalizeName(PLAYER_TEMPLATE_LEVEL_NAME);
  return name === wanted || id === wanted || (name.includes('parking lot') && name.includes('first') && name.includes('ever'));
}
function levelLooksLikeHudDefault(entry){
  const name = normalizeName(entry && entry.name);
  const id = normalizeName(entry && entry.id);
  const wanted = normalizeName(HUD_TEMPLATE_LEVEL_NAME);
  const fallback = normalizeName(PLAYER_TEMPLATE_LEVEL_NAME);
  return name === wanted || id === wanted || name === fallback || id === fallback ||
    (name.includes('parking lot') && name.includes('first') && name.includes('ever'));
}
function readStoredPlayerBlueprintDefault(){
  try {
    const raw = localStorage.getItem(PLAYER_TEMPLATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.player ? cloneData(parsed.player) : null;
  } catch(err){ return null; }
}
function readStoredRadioHudDefault(){
  try {
    const raw = localStorage.getItem(HUD_TEMPLATE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.radioHud ? cloneData(parsed.radioHud) : null;
  } catch(err){ return null; }
}
function writeStoredPlayerBlueprintDefault(player, source){
  if(!player) return false;
  try {
    localStorage.setItem(PLAYER_TEMPLATE_KEY, JSON.stringify({
      version: 1,
      source: source || null,
      savedAt: new Date().toISOString(),
      player: cloneData(player),
    }));
    return true;
  } catch(err){
    console.warn('LotKing store: player blueprint default non salvato', err);
    return false;
  }
}
function writeStoredRadioHudDefault(radioHud, source){
  if(!radioHud) return false;
  try {
    localStorage.setItem(HUD_TEMPLATE_KEY, JSON.stringify({
      version: 1,
      source: source || null,
      savedAt: new Date().toISOString(),
      radioHud: cloneData(radioHud),
    }));
    return true;
  } catch(err){
    console.warn('LotKing store: radio HUD default non salvato', err);
    return false;
  }
}
function readPlayerBlueprintAssets(){
  try {
    const raw = localStorage.getItem(PLAYER_BLUEPRINT_ASSETS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.items) ? parsed.items : [];
  } catch(err){ return []; }
}
function writePlayerBlueprintAssets(items){
  try {
    localStorage.setItem(PLAYER_BLUEPRINT_ASSETS_KEY, JSON.stringify({version:1, items: items || []}));
    return true;
  } catch(err){
    console.warn('LotKing store: player blueprint assets non salvati', err);
    return false;
  }
}
// ------------------------------------------------ engine sound sets (asset audio veicolo)
// Set piccoli (solo JSON: path dei sample + parametri) salvati inline nell'indice.
const SOUNDSETS_KEY = 'lotking.soundsets.v1';

function readSoundSets(){
  try {
    const raw = localStorage.getItem(SOUNDSETS_KEY);
    if(raw){
      const data = JSON.parse(raw);
      if(data && Array.isArray(data.sets)) return data;
    }
  } catch(err){ console.warn('LotKing store: sound sets corrotti, rigenerati', err); }
  return {sets: []};
}
function writeSoundSets(data){
  try { localStorage.setItem(SOUNDSETS_KEY, JSON.stringify(data)); return true; }
  catch(err){ console.warn('LotKing store: sound sets non salvati', err); return false; }
}
function uniqueSoundSetId(data, name){
  const base = slugifyLevel(name || 'sound-set');
  let id = base, n = 2;
  while(data.sets.some(s => s.id === id)) id = base + '-' + (n++);
  return id;
}
function engineAudioDefaults(){
  const mod = window.LK_RUNTIME_ENGINE_AUDIO;
  return mod && mod.defaultSet ? mod.defaultSet() : null;
}
function ensureSoundSets(){
  const data = readSoundSets();
  if(!data.sets.length){
    const def = engineAudioDefaults();
    if(def){
      def.savedAt = new Date().toISOString();
      data.sets.push(def);
      writeSoundSets(data);
    }
  }
  return data;
}
const SOUND_SETS = {
  list(){
    return ensureSoundSets().sets.map(s => ({id: s.id, name: s.name, savedAt: s.savedAt}));
  },
  get(id){
    const s = ensureSoundSets().sets.find(x => x.id === id);
    return s ? cloneData(s) : null;
  },
  save(set){
    if(!set || !set.id) return false;
    const data = ensureSoundSets();
    const copy = cloneData(set);
    copy.savedAt = new Date().toISOString();
    const i = data.sets.findIndex(x => x.id === copy.id);
    if(i >= 0) data.sets[i] = copy;
    else data.sets.push(copy);
    return writeSoundSets(data);
  },
  create(name, base){
    const data = ensureSoundSets();
    const src = cloneData(base || engineAudioDefaults() || {});
    src.id = uniqueSoundSetId(data, name);
    src.name = (name || 'Sound Set').trim();
    src.savedAt = new Date().toISOString();
    data.sets.push(src);
    return writeSoundSets(data) ? src.id : null;
  },
  duplicate(id, name){
    const src = SOUND_SETS.get(id);
    if(!src) return null;
    return SOUND_SETS.create((name || (src.name + ' Copy')).trim(), src);
  },
  rename(id, name){
    if(!name || !name.trim()) return false;
    const data = ensureSoundSets();
    const s = data.sets.find(x => x.id === id);
    if(!s) return false;
    s.name = name.trim();
    s.savedAt = new Date().toISOString();
    return writeSoundSets(data);
  },
  remove(id){
    const data = ensureSoundSets();
    const i = data.sets.findIndex(x => x.id === id);
    if(i < 0) return false;
    data.sets.splice(i, 1);
    return writeSoundSets(data);
  },
  upsertImported(set){
    // set arrivato da un LKEP importato: entra in libreria mantenendo l'id
    if(!set || !set.id) return null;
    const data = ensureSoundSets();
    if(!data.sets.some(x => x.id === set.id)){
      const copy = cloneData(set);
      copy.savedAt = copy.savedAt || new Date().toISOString();
      data.sets.push(copy);
      writeSoundSets(data);
    }
    return set.id;
  },
};

function collectPlayerBlueprint(GAME){
  if(!GAME || !GAME.player) return null;
  const player = {
    tuning: cloneData(GAME.player.tuning && GAME.player.tuning.values || {}),
    cam: cloneData(GAME.player.cameraCfg || {}),
    lights: cloneData(GAME.player.lights || {}),
    dataWidgets: cloneData(GAME.player.dataWidgets || {}),
    exhaust: cloneData(GAME.player.exhaust || {}),
  };
  if(GAME.player.spawn) player.spawn = cloneData(GAME.player.spawn);
  if(GAME.player.car && GAME.player.car.userData.modelSrc) player.modelSrc = GAME.player.car.userData.modelSrc;
  player.rigTransforms = collectPlayerRigTransforms(GAME);
  // engine sound set: id + copia completa (cosi' l'export LKEP e' autosufficiente)
  if(GAME.player.engineAudio && GAME.player.engineAudio.setId){
    player.engineAudio = {
      setId: GAME.player.engineAudio.setId,
      set: cloneData(SOUND_SETS.get(GAME.player.engineAudio.setId) || GAME.player.engineAudio.set || null),
    };
  }
  return player;
}
function isPlayerRigId(id){
  id = String(id || '');
  return id === 'player' || id.indexOf('player_') === 0;
}
function collectPlayerRigTransforms(GAME){
  const out = {};
  if(!GAME || !GAME.world || !GAME.world.registry) return out;
  for(const o of GAME.world.registry){
    const id = o && o.userData && o.userData.editorId;
    if(isPlayerRigId(id)) out[id] = tOf(o);
  }
  return out;
}
function mergePlayerRigTransformsFromScene(player, scene){
  if(!player || !scene || !scene.transforms) return player;
  const transforms = Object.assign({}, player.rigTransforms || {});
  for(const id in scene.transforms){
    if(isPlayerRigId(id) && !transforms[id]) transforms[id] = cloneData(scene.transforms[id]);
  }
  if(Object.keys(transforms).length) player.rigTransforms = transforms;
  return player;
}
function applyPlayerRigTransforms(GAME, player){
  const transforms = player && player.rigTransforms;
  if(!GAME || !GAME.world || !GAME.world.registry || !transforms) return;
  const byId = {};
  for(const o of GAME.world.registry) byId[o.userData.editorId] = o;
  for(const id in transforms){
    const o = byId[id];
    if(o) applyT(o, transforms[id]);
  }
  for(const id in transforms){
    const o = byId[id];
    if(o) applyParentLink(o, GAME);
  }
}
function savePlayerBlueprintAsset(name, player, opts){
  const options = opts || {};
  const source = options.source || {};
  const items = readPlayerBlueprintAssets();
  const id = options.id || ('pb_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7));
  const asset = {
    id,
    name: name || 'Player Blueprint',
    kind: 'player-blueprint',
    player: cloneData(player),
    source,
    controllerIndex: options.controllerIndex == null ? 0 : options.controllerIndex,
    createdAt: options.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const i = items.findIndex(x => x.id === id);
  if(i >= 0) items[i] = asset;
  else items.push(asset);
  if(!writePlayerBlueprintAssets(items)) return null;
  if(options.makeDefault !== false) writeStoredPlayerBlueprintDefault(asset.player, {blueprintId: id, blueprintName: asset.name});
  return asset;
}
function deletePlayerBlueprintAsset(id){
  const next = readPlayerBlueprintAssets().filter(x => x.id !== id);
  return writePlayerBlueprintAssets(next);
}
function playerBlueprintApi(){
  return {
    list: () => readPlayerBlueprintAssets().map(cloneData),
    default: () => readStoredPlayerBlueprintDefault(),
    setDefault: (player, source) => writeStoredPlayerBlueprintDefault(player, source),
    saveAsset: savePlayerBlueprintAsset,
    deleteAsset: deletePlayerBlueprintAsset,
    collect: collectPlayerBlueprint,
    applyRig: applyPlayerRigTransforms,
  };
}
function maybeStorePlayerBlueprintDefault(project, entry){
  const scene = project && sceneFromProject(project);
  if(!scene || !scene.player) return;
  const current = readStoredPlayerBlueprintDefault();
  const incomingPlayer = mergePlayerRigTransformsFromScene(cloneData(scene.player), scene);
  const incomingScore = playerBlueprintScore(incomingPlayer);
  const currentScore = playerBlueprintScore(current);
  if(levelLooksLikePlayerDefault(entry) || incomingScore > currentScore + 4){
    writeStoredPlayerBlueprintDefault(incomingPlayer, {levelId: entry && entry.id, levelName: entry && entry.name});
  }
}
function radioHudScore(radioHud){
  if(!radioHud) return 0;
  let score = Object.keys(radioHud).length;
  if(radioHud.buttons) score += Object.keys(radioHud.buttons).length * 4;
  if(radioHud.width) score += 3;
  if(radioHud.imageLayer != null || radioHud.screenLayer != null || radioHud.buttonLayer != null) score += 8;
  return score;
}
function maybeStoreRadioHudDefault(project, entry){
  const scene = project && sceneFromProject(project);
  const radioHud = scene && scene.ui && scene.ui.radioHud;
  if(!radioHud) return;
  const current = readStoredRadioHudDefault();
  const incomingScore = radioHudScore(radioHud);
  const currentScore = radioHudScore(current);
  if(levelLooksLikeHudDefault(entry) || (!current && incomingScore > currentScore)){
    writeStoredRadioHudDefault(radioHud, {levelId: entry && entry.id, levelName: entry && entry.name});
  }
}
function bestPlayerTemplateFromLevels(idx){
  let best = null;
  let bestScore = -1;
  for(const entry of idx.levels){
    const project = readLevelProject(entry.id);
    const scene = project && sceneFromProject(project);
    if(!scene || !scene.player) continue;
    const priority = levelLooksLikePlayerDefault(entry) ? 10000 : 0;
    const mergedPlayer = mergePlayerRigTransformsFromScene(cloneData(scene.player), scene);
    const score = priority + playerBlueprintScore(mergedPlayer);
    if(score > bestScore){
      bestScore = score;
      best = {entry, player: mergedPlayer};
    }
  }
  if(best && best.player) writeStoredPlayerBlueprintDefault(best.player, {levelId: best.entry.id, levelName: best.entry.name});
  return best ? best.player : null;
}
function bestRadioHudTemplateFromLevels(idx){
  let best = null;
  let bestScore = -1;
  for(const entry of idx.levels){
    const project = readLevelProject(entry.id);
    const scene = project && sceneFromProject(project);
    const radioHud = scene && scene.ui && scene.ui.radioHud;
    if(!radioHud) continue;
    const priority = levelLooksLikeHudDefault(entry) ? 10000 : 0;
    const score = priority + radioHudScore(radioHud);
    if(score > bestScore){
      bestScore = score;
      best = {entry, radioHud: cloneData(radioHud)};
    }
  }
  if(best && best.radioHud) writeStoredRadioHudDefault(best.radioHud, {levelId: best.entry.id, levelName: best.entry.name});
  return best ? best.radioHud : null;
}
function playerTemplateFromLevelLibrary(GAME){
  const idx = ensureLibrary();
  let player = bestPlayerTemplateFromLevels(idx) || readStoredPlayerBlueprintDefault();
  if(!player && GAME && GAME.player){
    player = {
      tuning: cloneData(GAME.player.tuning && GAME.player.tuning.values || {}),
      cam: cloneData(GAME.player.cameraCfg || {}),
      lights: cloneData(GAME.player.lights || {}),
      dataWidgets: cloneData(GAME.player.dataWidgets || {}),
      exhaust: cloneData(GAME.player.exhaust || {}),
    };
    if(GAME.player.car && GAME.player.car.userData.modelSrc) player.modelSrc = GAME.player.car.userData.modelSrc;
  }
  if(!player) return {spawn: {x: 0, z: 0, heading: 0}};
  const active = idx.activeId && readLevelProject(idx.activeId);
  player = mergePlayerRigTransformsFromScene(player, active && sceneFromProject(active));
  player.spawn = {x: 0, z: 0, heading: 0};
  return player;
}
function radioHudTemplateFromLevelLibrary(GAME){
  const idx = ensureLibrary();
  let radioHud = bestRadioHudTemplateFromLevels(idx) || readStoredRadioHudDefault();
  if(!radioHud && GAME && GAME.ui && GAME.ui.radioHud) radioHud = cloneData(GAME.ui.radioHud);
  return radioHud || null;
}

const LEVELS = {
  list(){
    const idx = ensureLibrary();
    const activeId = normalizeLevelId(idx.activeId);
    return idx.levels.map(l => Object.assign({}, l, {active: normalizeLevelId(l.id) === activeId}));
  },
  activeId(){ return normalizeLevelId(ensureLibrary().activeId); },
  get: readLevelProject,
  create(name, scene){
    const idx = ensureLibrary();
    const id = uniqueLevelId(idx, name);
    const project = projectFromScene(scene || blank(), {trackId: id, trackName: name});
    if(!writeLevelProject(id, project)) return null;
    const entry = {id, name, savedAt: project.savedAt};
    idx.levels.push(entry);
    maybeStorePlayerBlueprintDefault(project, entry);
    maybeStoreRadioHudDefault(project, entry);
    writeIndex(idx);
    syncCatalog();
    return id;
  },
  setActive(id){
    const idx = ensureLibrary();
    id = normalizeLevelId(id);
    if(!levelEntry(idx, id)) return false;
    const project = readLevelProject(id);
    if(!project) return false;
    try { localStorage.setItem(KEY, JSON.stringify(project)); }
    catch(err){ console.warn('LotKing store: attivazione livello fallita', err); return false; }
    idx.activeId = id;
    writeIndex(idx);
    syncCatalog();
    return true;
  },
  rename(id, name){
    id = normalizeLevelId(id);
    if(!name || !name.trim()) return false;
    name = name.trim();
    const idx = ensureLibrary();
    const entry = levelEntry(idx, id);
    if(!entry) return false;
    entry.name = name;
    const project = readLevelProject(id);
    if(project){
      project.meta = Object.assign({}, project.meta, {trackName: name});
      writeLevelProject(id, project);
    }
    if(normalizeLevelId(idx.activeId) === id){
      try {
        const raw = localStorage.getItem(KEY);
        if(raw){
          const p = JSON.parse(raw);
          p.meta = Object.assign({}, p.meta, {trackName: name});
          localStorage.setItem(KEY, JSON.stringify(p));
        }
      } catch(err){}
    }
    writeIndex(idx);
    syncCatalog();
    return true;
  },
  duplicate(id, name){
    const idx = ensureLibrary();
    id = normalizeLevelId(id);
    const src = levelEntry(idx, id);
    const project = readLevelProject(id);
    if(!src || !project) return null;
    const newName = (name || (src.name + ' Copy')).trim();
    const newId = uniqueLevelId(idx, newName);
    const copy = JSON.parse(JSON.stringify(project));
    copy.meta = Object.assign({}, copy.meta, {trackId: newId, trackName: newName});
    copy.savedAt = new Date().toISOString();
    if(!writeLevelProject(newId, copy)) return null;
    idx.levels.push({id: newId, name: newName, savedAt: copy.savedAt});
    writeIndex(idx);
    syncCatalog();
    return newId;
  },
  remove(id){
    const idx = ensureLibrary();
    id = normalizeLevelId(id);
    const activeId = normalizeLevelId(idx.activeId);
    const i = idx.levels.findIndex(l => normalizeLevelId(l.id) === id);
    if(i < 0) return false;
    idx.levels.splice(i, 1);
    localStorage.removeItem(LEVEL_PREFIX + id);
    if(activeId === id){
      idx.activeId = idx.levels.length ? idx.levels[0].id : null;
      if(idx.activeId){
        const p = readLevelProject(idx.activeId);
        if(p){ try { localStorage.setItem(KEY, JSON.stringify(p)); } catch(err){} }
      } else {
        localStorage.removeItem(KEY);
      }
    }
    writeIndex(idx);
    syncCatalog();
    return true;
  },
  importProjectAsLevel(raw, fallbackName){
    const project = parseProject(raw);
    const meta = project.meta || {};
    const idx = ensureLibrary();
    const name = meta.trackName || meta.levelName || fallbackName || 'Imported Track';
    const id = uniqueLevelId(idx, meta.trackId || name);
    project.meta = Object.assign({}, meta, {trackId: id, trackName: name});
    if(!writeLevelProject(id, project)) return null;
    const entry = {id, name, savedAt: project.savedAt || new Date().toISOString()};
    idx.levels.push(entry);
    maybeStorePlayerBlueprintDefault(project, entry);
    maybeStoreRadioHudDefault(project, entry);
    writeIndex(idx);
    syncCatalog();
    return id;
  },
  // template "livello vuoto": via i mesh/effetti del parking lot (restano luci
  // globali e player), un piano semplice come terreno, pieno giorno fisso.
  templateScene(GAME){
    const d = blank();
    const seen = new Set();
    if(GAME && GAME.world && GAME.world.registry){
      for(const o of GAME.world.registry){
        if(!o.userData.builtin) continue;
        seen.add(o.userData.editorId);
        if(o.isLight || o.userData.light) continue;
        const type = o.userData.editorType || '';
        if(type === 'player' || type.indexOf('player') === 0) continue;
        d.deleted.push(o.userData.editorId);
      }
    }
    for(const id of builtinIds){ if(!seen.has(id)) d.deleted.push(id); }
    d.added.push({
      id: 'lvlground_' + Date.now().toString(36),
      prim: 'plane',
      name: 'Ground',
      collide: false,
      props: {color: 0x39404d, roughness: .95, metalness: 0},
      t: {p:[0, 0, 0], r:[0, 0, 0], s:[40, 1, 40], v: true},
      asset: {key:'primitive:plane', name:'Primitive Plane', source:'Editor primitive'},
    });
    d.env = {skyTime: .3, dayLength: 999999};
    d.player = playerTemplateFromLevelLibrary(GAME);
    const radioHud = radioHudTemplateFromLevelLibrary(GAME);
    if(radioHud) d.ui.radioHud = radioHud;
    return d;
  },
  // dal menu del gioco: prepara il lancio di un livello della libreria.
  // Ritorna 'reload' se la pagina sta per ricaricarsi (scena già applicata).
  prepareLaunch(id){
    const idx = ensureLibrary();
    id = normalizeLevelId(id);
    if(!levelEntry(idx, id)) return 'ready';       // track built-in, nulla da fare
    if(normalizeLevelId(idx.activeId) === id) return 'ready';
    if(!applied){ LEVELS.setActive(id); return 'ready'; }
    LEVELS.setActive(id);
    try { sessionStorage.setItem('lk.autolaunch', id); } catch(err){}
    location.reload();
    return 'reload';
  },
  syncCatalog,
};

// level select del gioco ← libreria (il livello attivo per primo: è quello dell'editor)
function catalogTracks(){
  const idx = ensureLibrary();
  if(!idx.levels.length) return null;
  const activeId = normalizeLevelId(idx.activeId);
  const list = idx.levels.slice().sort((a, b) => {
    const aActive = normalizeLevelId(a.id) === activeId ? 1 : 0;
    const bActive = normalizeLevelId(b.id) === activeId ? 1 : 0;
    if(aActive !== bActive) return bActive - aActive;
    const aOrder = Number.isFinite(Number(a.__lkExportOrder)) ? Number(a.__lkExportOrder) : Number.MAX_SAFE_INTEGER;
    const bOrder = Number.isFinite(Number(b.__lkExportOrder)) ? Number(b.__lkExportOrder) : Number.MAX_SAFE_INTEGER;
    if(aOrder !== bOrder) return aOrder - bOrder;
    return String(b.savedAt || '').localeCompare(String(a.savedAt || ''));
  });
  return list.map(l => ({
    id: l.id,
    name: l.name,
    active: normalizeLevelId(l.id) === activeId,
    primary: normalizeLevelId(l.id) === activeId || !!l.__lkExportPrimary,
    tag: normalizeLevelId(l.id) === activeId ? 'EDITOR TRACK' : 'CUSTOM TRACK',
    description: 'Livello del Lot King Engine Builder salvato localmente' +
      (l.savedAt ? ' · ' + new Date(l.savedAt).toLocaleString() : '') + '.',
    surface: 'Custom',
    goal: 'Drift sandbox',
  }));
}
function syncCatalog(){
  const g = window.LOT_KING;
  const tracks = catalogTracks();
  if(g && g.levels && g.levels.setTracks && tracks) g.levels.setTracks(tracks);
}

// ------------------------------------------------ transform helpers
function tOf(obj){
  const t = {
    p:[obj.position.x, obj.position.y, obj.position.z],
    r:[obj.rotation.x, obj.rotation.y, obj.rotation.z],
    s:[obj.scale.x, obj.scale.y, obj.scale.z],
    v: obj.visible,
    name: obj.userData.editorName,
  };
  if(obj.userData.linkParentId) t.parent = obj.userData.linkParentId;
  return t;
}
function applyT(obj, t){
  if(!t) return;
  if(t.p) obj.position.fromArray(t.p);
  if(t.r) obj.rotation.set(t.r[0], t.r[1], t.r[2]);
  if(t.s) obj.scale.fromArray(t.s);
  if(t.v != null) obj.visible = t.v;
  if(t.name) obj.userData.editorName = t.name;
  if(t.parent) obj.userData.linkParentId = t.parent;
}
function applyParentLink(obj, GAME){
  const pid = obj && obj.userData.linkParentId;
  if(!pid || !GAME) return;
  const parent = GAME.world.registry.find(o => o.userData.editorId === pid);
  if(parent && parent !== obj) parent.attach(obj);
}

// keep the arcade collider (axis-aligned box / circle) in sync with the object
function syncCollider(obj){
  const col = obj.userData.collider;
  if(!col || !col.ref) return;
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  if(box.isEmpty()) return;
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  col.ref.x = c.x; col.ref.z = c.z;
  if(col.kind === 'circle') col.ref.r = Math.max(size.x, size.z) / 2;
  else { col.ref.hx = size.x / 2; col.ref.hz = size.z / 2; }
}

// ------------------------------------------------ light props
function lightProps(l){
  const p = {color: l.color ? l.color.getHex() : undefined, intensity: l.intensity, visible: l.visible};
  if(l.groundColor) p.groundColor = l.groundColor.getHex();
  if(l.distance != null) p.distance = l.distance;
  if(l.decay != null) p.decay = l.decay;
  if(l.angle != null) p.angle = l.angle;
  if(l.penumbra != null) p.penumbra = l.penumbra;
  if(l.castShadow != null) p.castShadow = l.castShadow;
  return p;
}
function applyLightProps(l, p){
  if(!p) return;
  if(p.color != null && l.color) l.color.setHex(p.color);
  if(p.groundColor != null && l.groundColor) l.groundColor.setHex(p.groundColor);
  if(p.intensity != null) l.intensity = p.intensity;
  if(p.distance != null && l.distance != null) l.distance = p.distance;
  if(p.decay != null && l.decay != null) l.decay = p.decay;
  if(p.angle != null && l.angle != null) l.angle = p.angle;
  if(p.penumbra != null && l.penumbra != null) l.penumbra = p.penumbra;
  if(p.castShadow != null) l.castShadow = p.castShadow;
  if(p.visible != null) l.visible = p.visible;
}

// material override: applied to every mesh in the object (edited via editor)
function applyMatProps(obj, p){
  if(!p) return;
  const loadTexture = (src, colorData) => {
    const tx = new THREE.TextureLoader().load(src);
    if(colorData) tx.encoding = THREE.sRGBEncoding;
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
  };
  obj.traverse(o => {
    if(!o.isMesh || !o.material) return;
    if(p.materialKind === 'standard'){
      const convert = m => {
        if(m && m.isMeshStandardMaterial) return m;
        const nm = new THREE.MeshStandardMaterial({
          color: m && m.color ? m.color.clone() : new THREE.Color(0xffffff),
          map: m ? m.map || null : null,
          normalMap: m ? m.normalMap || null : null,
          roughness: .7,
          metalness: 0,
          transparent: m ? !!m.transparent : false,
          opacity: m && m.opacity != null ? m.opacity : 1,
        });
        return nm;
      };
      o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material);
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for(const m of mats){
      if(p.color != null && m.color) m.color.setHex(p.color);
      if(p.emissive != null && m.emissive) m.emissive.setHex(p.emissive);
      if(p.roughness != null && m.roughness != null) m.roughness = p.roughness;
      if(p.metalness != null && m.metalness != null) m.metalness = p.metalness;
      if(p.opacity != null){ m.opacity = p.opacity; m.transparent = p.opacity < 1 || !!p.transparent; }
      if(p.transparent != null) m.transparent = !!p.transparent;
      if(p.emissiveIntensity != null && m.emissiveIntensity != null) m.emissiveIntensity = p.emissiveIntensity;
      if(p.normalScale != null && m.normalScale) m.normalScale.set(p.normalScale, p.normalScale);
      if(p.mapSrc === null){
        m.map = null;
        delete m.mapSrc;
      } else if(p.mapSrc){
        m.map = loadTexture(p.mapSrc, true);
        m.mapSrc = p.mapSrc;
      }
      if(p.normalMapSrc === null && m.normalMap !== undefined){
        m.normalMap = null;
        delete m.normalMapSrc;
      } else if(p.normalMapSrc && m.normalMap !== undefined){
        m.normalMap = loadTexture(p.normalMapSrc, false);
        m.normalMapSrc = p.normalMapSrc;
      }
      m.needsUpdate = true;
    }
    if(p.castShadow != null) o.castShadow = p.castShadow;
  });
  obj.userData.matProps = Object.assign({}, obj.userData.matProps, p);
}

// ------------------------------------------------ factories: primitives
const PRIM_DEFS = {
  box:      () => new THREE.BoxGeometry(2, 2, 2),
  sphere:   () => new THREE.SphereGeometry(1.2, 24, 18),
  cylinder: () => new THREE.CylinderGeometry(1, 1, 2, 20),
  cone:     () => new THREE.ConeGeometry(1, 2, 20),
  plane:    () => new THREE.PlaneGeometry(4, 4),
  torus:    () => new THREE.TorusGeometry(1.4, .4, 12, 28),
  ramp:     () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(6, 0); shape.lineTo(6, 2.2); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {depth: 4, bevelEnabled: false});
    g.translate(-3, 0, -2);
    return g;
  },
};
function createPrimitive(prim, props){
  props = props || {};
  const geo = (PRIM_DEFS[prim] || PRIM_DEFS.box)();
  const mat = new THREE.MeshStandardMaterial({
    color: props.color != null ? props.color : 0x8899aa,
    roughness: props.roughness != null ? props.roughness : .7,
    metalness: props.metalness != null ? props.metalness : .1,
    side: prim === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  if(prim === 'plane') m.rotation.x = -Math.PI/2;
  const gp = new THREE.Group();
  m.position.y = prim === 'plane' ? 0.01 : (prim === 'ramp' ? 0 : 1);
  gp.add(m);
  return gp;
}

// ------------------------------------------------ factories: lights
function createLight(kind, props){
  props = props || {};
  const color = props.color != null ? props.color : 0xffeecc;
  const intensity = props.intensity != null ? props.intensity : 1;
  const gp = new THREE.Group();
  let l;
  if(kind === 'spot'){
    l = new THREE.SpotLight(color, intensity,
      props.distance != null ? props.distance : 40,
      props.angle != null ? props.angle : .5,
      props.penumbra != null ? props.penumbra : .4, 1.2);
    const target = new THREE.Object3D(); target.position.set(0, -6, 0);
    gp.add(target); l.target = target;
    gp.position.y = 8;
  } else if(kind === 'directional'){
    l = new THREE.DirectionalLight(color, intensity);
    const target = new THREE.Object3D(); target.position.set(0, -6, 3);
    gp.add(target); l.target = target;
    gp.position.y = 12;
  } else if(kind === 'hemisphere'){
    l = new THREE.HemisphereLight(color, props.groundColor != null ? props.groundColor : 0x222018, intensity);
    gp.position.y = 10;
  } else if(kind === 'ambient'){
    l = new THREE.AmbientLight(color, intensity != null ? intensity : .4);
  } else { // point
    l = new THREE.PointLight(color, intensity, props.distance != null ? props.distance : 35, 1.6);
    gp.position.y = 6;
  }
  applyLightProps(l, props);
  gp.add(l);
  gp.userData.lightKind = kind;
  gp.userData.light = l;
  return gp;
}

// ------------------------------------------------ factories: effects (sprite emitters)
let _softTex = null;
function softTex(){
  if(_softTex) return _softTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32,32,2,32,32,30);
  gr.addColorStop(0,'rgba(255,255,255,.95)');
  gr.addColorStop(.5,'rgba(255,255,255,.4)');
  gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0,0,64,64);
  _softTex = new THREE.CanvasTexture(c);
  return _softTex;
}
const EFFECT_PRESETS = {
  smoke:  {rate:12, size:1.8, life:2.2, rise:2.4, spread:.7, gravity:0,   color:0xbfc3cc, opacity:.4,  additive:false, grow:true},
  fire:   {rate:38, size:1.3, life:.85, rise:3.2, spread:.7, gravity:0,   color:0xff8830, opacity:.85, additive:true,  grow:false},
  sparks: {rate:55, size:.28, life:.75, rise:3.5, spread:3,  gravity:-7,  color:0xffd966, opacity:.95, additive:true,  grow:false},
  steam:  {rate:18, size:1.1, life:1.4, rise:3.6, spread:.4, gravity:0,   color:0xe8f0ff, opacity:.35, additive:false, grow:true},
  glow:   {rate:2,  size:4.5, life:2.6, rise:.1,  spread:.1, gravity:0,   color:0x66c2ff, opacity:.5,  additive:true,  grow:false},
};
function createEmitter(kind, params){
  const p = Object.assign({kind: kind || 'smoke'}, EFFECT_PRESETS[kind] || EFFECT_PRESETS.smoke, params || {});
  const gp = new THREE.Group();
  const N = Math.min(220, Math.max(16, Math.ceil(p.rate * p.life * 1.5)));
  const parts = [];
  for(let i=0;i<N;i++){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softTex(), color: p.color, transparent: true, opacity: 0, depthWrite: false,
      blending: p.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    s.visible = false; gp.add(s);
    parts.push({s, life:0, max:1, vel:new THREE.Vector3()});
  }
  let acc = 0, idx = 0;
  gp.userData.effectParams = p;
  gp.userData.effectUpdate = dt => {
    if(!gp.visible || !gp.parent) return;
    acc += dt * p.rate;
    while(acc >= 1){
      acc -= 1;
      const q = parts[idx++ % N];
      q.s.visible = true; q.life = 0; q.max = p.life * (.7 + Math.random()*.6);
      q.s.position.set(0, 0, 0);
      q.vel.set((Math.random()-.5)*p.spread, p.rise*(.7+Math.random()*.6), (Math.random()-.5)*p.spread);
    }
    for(const q of parts){
      if(!q.s.visible) continue;
      q.life += dt;
      if(q.life >= q.max){ q.s.visible = false; q.s.material.opacity = 0; continue; }
      const t = q.life / q.max;
      q.vel.y += (p.gravity || 0) * dt;
      q.s.position.addScaledVector(q.vel, dt);
      const sc = p.size * (p.grow ? (.5 + t*2) : 1);
      q.s.scale.set(sc, sc, 1);
      q.s.material.opacity = p.opacity * (1 - t);
    }
  };
  gp.userData.effectSetColor = hex => {
    p.color = hex;
    for(const q of parts) q.s.material.color.setHex(hex);
  };
  return gp;
}

// ------------------------------------------------ factory: GLB import
function loadGlbRaw(src){
  return new Promise((resolve, reject) => {
    if(typeof THREE.GLTFLoader === 'undefined'){ reject(new Error('GLTFLoader non disponibile')); return; }
    new THREE.GLTFLoader().load(src, g => resolve(g.scene), undefined, err => reject(err));
  });
}
function loadGlb(src, fit){
  return new Promise((resolve, reject) => {
    if(typeof THREE.GLTFLoader === 'undefined'){ reject(new Error('GLTFLoader non disponibile')); return; }
    const loader = new THREE.GLTFLoader();
    loader.load(src, g => {
      const root = g.scene;
      root.traverse(o => { if(o.isMesh){ o.castShadow = true; } });
      // normalize: fit to target size, bottom on ground, centered
      const wrap = new THREE.Group();
      wrap.add(root);
      const box = new THREE.Box3().setFromObject(wrap);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const k = (fit || 4) / Math.max(1e-4, maxDim);
      wrap.scale.setScalar(k);
      const box2 = new THREE.Box3().setFromObject(wrap);
      const c = box2.getCenter(new THREE.Vector3());
      wrap.position.set(-c.x, -box2.min.y, -c.z);
      const gp = new THREE.Group();
      gp.add(wrap);
      resolve(gp);
    }, undefined, err => reject(err));
  });
}
function loadGlbEntry(entry){
  if(entry.src) return loadGlb(entry.src, entry.fit);
  const dbKey = entry.dbKey || (entry.asset && entry.asset.dbKey);
  if(dbKey && window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(dbKey).then(url => loadGlb(url, entry.fit));
  return Promise.reject(new Error('sorgente GLB non disponibile'));
}

// ------------------------------------------------ create from a saved "added" entry
function createFromEntry(entry, GAME){
  if(entry.kind === 'light') return Promise.resolve(createLight(entry.light, entry.props));
  if(entry.kind === 'effect') return Promise.resolve(createEmitter(entry.effect, entry.params));
  if(entry.kind === 'glb') return loadGlbEntry(entry);
  if(entry.kind === 'clone'){
    const src = GAME && GAME.world.registry.find(o => o.userData.editorId === entry.srcId);
    if(!src) return Promise.reject(new Error('sorgente clone non trovata: ' + entry.srcId));
    const c = src.clone(true);
    c.userData = {};
    return Promise.resolve(c);
  }
  const gp = createPrimitive(entry.prim, entry.props);
  if(entry.props) applyMatProps(gp, entry.props);
  return Promise.resolve(gp);
}
function entryType(entry, obj){
  if(entry.kind === 'clone') return (obj && (obj.isLight || obj.userData && obj.userData.light)) ? 'light' : 'mesh';
  return entry.kind === 'light' ? 'light' : entry.kind === 'effect' ? 'effect' : 'mesh';
}

// register + optional box collider for an added object
function registerAdded(GAME, obj, entry){
  obj.userData.addedEntry = entry;
  if(entry.asset){
    obj.userData.assetKey = entry.asset.key;
    obj.userData.assetName = entry.asset.name;
    obj.userData.assetSource = entry.asset.source;
  }
  let colliderOpt = null;
  if(entry.collide){
    const col = {x:0, z:0, hx:1, hz:1};
    GAME.world.colliders.box.push(col);
    colliderOpt = {kind:'box', ref:col};
  }
  GAME.world.register(obj, entry.name || entry.kind, entryType(entry, obj), {id: entry.id, builtin: false, collider: colliderOpt});
  GAME.core.scene.add(obj);
  applyT(obj, entry.t);
  if(entry.collide) syncCollider(obj);
  return obj;
}

// ------------------------------------------------ effects hook (game + editor loops)
let _hooked = false;
function ensureEffectHook(GAME){
  if(_hooked) return;
  _hooked = true;
  GAME.hooks.frame.push(dt => {
    for(const o of GAME.world.registry){
      if(o.userData.effectUpdate) o.userData.effectUpdate(dt);
    }
  });
}

// ------------------------------------------------ apply the whole saved scene at boot
let builtinIds = [];
function apply(GAME){
  builtinIds = GAME.world.registry.filter(o => o.userData.builtin).map(o => o.userData.editorId);
  ensureEffectHook(GAME);
  const data = load();
  if(!data){
    GAME.state.sceneReady = true;
    return Promise.resolve(null);
  }
  GAME.state.sceneReady = false;
  const pending = [];

  // Vehicle light config can create extra built-in light anchors; do it before
  // transform replay so custom Aux 3/4/... offsets have real targets.
  if(data.player && data.player.lights && GAME.player.setLights) GAME.player.setLights(data.player.lights);
  if(data.player && data.player.exhaust && GAME.player.setExhaust) GAME.player.setExhaust(data.player.exhaust);

  const byId = {};
  for(const o of GAME.world.registry) byId[o.userData.editorId] = o;

  // transforms + names + visibility on builtin entities
  for(const id in data.transforms){
    const o = byId[id];
    if(!o) continue;
    applyT(o, data.transforms[id]);
    syncCollider(o);
  }
  for(const id in data.transforms){
    const o = byId[id];
    if(o) applyParentLink(o, GAME);
  }
  // per-entity props (lights / material overrides)
  for(const id in data.props){
    const o = byId[id];
    if(!o) continue;
    const light = o.isLight ? o : o.userData.light;
    if(light) applyLightProps(light, data.props[id]);
    else applyMatProps(o, data.props[id]);
  }
  // deletions
  for(const id of data.deleted || []){
    const o = byId[id];
    if(!o) continue;
    GAME.world.unregister(o);
    if(o.parent) o.parent.remove(o);
  }
  // added objects
  for(const entry of data.added || []){
    const p = createFromEntry(entry, GAME)
      .then(obj => {
        registerAdded(GAME, obj, entry);
        applyParentLink(obj, GAME);
        if(entry.props && entry.kind !== 'light') applyMatProps(obj, entry.props);
      })
      .catch(err => console.warn('LotKing store: oggetto "' + entry.name + '" non ricaricato', err));
    pending.push(p);
  }
  // environment
  if(data.env){
    if(data.env.skyTime != null) GAME.systems.sky.setTime(data.env.skyTime);
    if(data.env.dayLength != null) GAME.systems.sky.setDayLength(data.env.dayLength);
    if(GAME.systems.sky.hdri) GAME.systems.sky.hdri.setEnabled(false);
    if(GAME.systems.sky.proceduralEnv){
      if(data.env.procEnvEnabled != null) GAME.systems.sky.proceduralEnv.setEnabled(data.env.procEnvEnabled);
      if(data.env.procEnvIntensity != null) GAME.systems.sky.proceduralEnv.setIntensity(data.env.procEnvIntensity);
      if(data.env.procEnvWarmth != null) GAME.systems.sky.proceduralEnv.setWarmth(data.env.procEnvWarmth);
      if(data.env.procEnvContrast != null) GAME.systems.sky.proceduralEnv.setContrast(data.env.procEnvContrast);
    }
    if(GAME.systems.sky.flare){
      if(data.env.lensFlare && GAME.systems.sky.flare.set){
        GAME.systems.sky.flare.set(data.env.lensFlare);
      } else {
        // livelli salvati prima del flare parametrico
        if(data.env.flareEnabled != null) GAME.systems.sky.flare.setEnabled(data.env.flareEnabled);
        if(data.env.flareOpacity != null) GAME.systems.sky.flare.setOpacity(data.env.flareOpacity);
        if(data.env.flareSize != null) GAME.systems.sky.flare.setSize(data.env.flareSize);
      }
    }
    if(data.env.sunBloom && GAME.systems.sky.sunBloom) GAME.systems.sky.sunBloom.set(data.env.sunBloom);
    if(data.env.volClouds && GAME.systems.sky.volClouds) GAME.systems.sky.volClouds.set(data.env.volClouds);
    if(data.env.rain && GAME.systems.rain) GAME.systems.rain.set(data.env.rain);
  }
  if(data.ui && data.ui.radioHud && GAME.ui && GAME.ui.setRadioHud) GAME.ui.setRadioHud(data.ui.radioHud);
  // player blueprint
  if(data.player){
    if(data.player.spawn){
      Object.assign(GAME.player.spawn, data.player.spawn);
      GAME.player.physics.pos.set(GAME.player.spawn.x, 0, GAME.player.spawn.z);
      GAME.player.physics.heading = GAME.player.spawn.heading;
      GAME.player.car.position.copy(GAME.player.physics.pos);
      GAME.player.car.rotation.y = GAME.player.physics.heading;
      if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
    }
    if(data.player.modelSrc){
      const p = loadGlbRaw(data.player.modelSrc)
        .then(s => { GAME.player.setModel(s); GAME.player.car.userData.modelSrc = data.player.modelSrc; })
        .catch(err => console.warn('LotKing store: modello player non ricaricato', err));
      pending.push(p);
    }
    if(data.player.cam){
      Object.assign(GAME.player.cameraCfg, data.player.cam, {
        dof: Object.assign({}, GAME.player.cameraCfg.dof, data.player.cam.dof),
        grade: Object.assign({}, GAME.player.cameraCfg.grade, data.player.cam.grade),
      });
      GAME.player.applyCameraCfg();
    }
    if(data.player.tuning) GAME.player.setTuning(data.player.tuning);
    if(data.player.lights && GAME.player.setLights) GAME.player.setLights(data.player.lights);
    if(data.player.dataWidgets && GAME.player.setDataWidgets) GAME.player.setDataWidgets(data.player.dataWidgets);
    if(data.player.exhaust && GAME.player.setExhaust) GAME.player.setExhaust(data.player.exhaust);
    applyPlayerRigTransforms(GAME, data.player);
    if(data.player.engineAudio && GAME.player.setEngineSound){
      // il set embedded entra in libreria se manca, poi si applica per id
      if(data.player.engineAudio.set) SOUND_SETS.upsertImported(data.player.engineAudio.set);
      GAME.player.setEngineSound(data.player.engineAudio.setId || null);
    }
    if(data.player.headlight && !data.player.lights){
      // headlight loads slightly later than this script → retry briefly
      const applyHl = () => {
        const hl = GAME.player.headlight();
        if(!hl){ setTimeout(applyHl, 250); return; }
        applyLightProps(hl, data.player.headlight);
      };
      applyHl();
    }
  }
  return Promise.allSettled(pending).then(() => {
    for(const o of GAME.world.registry) syncCollider(o);
    if(GAME.systems.physics) GAME.systems.physics.rebuild();
    GAME.state.sceneReady = true;
    console.info('LotKing store: scena editor applicata (' + (data.added||[]).length + ' aggiunti, ' + (data.deleted||[]).length + ' eliminati)');
    return data;
  });
}

// ------------------------------------------------ collect current scene → data (editor save)
let _sessionCounter = 1;
function collect(GAME){
  const d = blank();
  const old = load();
  d.counter = Math.max(old ? old.counter || 0 : 0, _sessionCounter);
  const liveBuiltin = new Set();
  for(const o of GAME.world.registry){
    const id = o.userData.editorId;
    if(o.userData.builtin){
      liveBuiltin.add(id);
      d.transforms[id] = tOf(o);
      const light = o.isLight ? o : null;
      if(light) d.props[id] = lightProps(light);
      else if(o.userData.matProps) d.props[id] = Object.assign({}, o.userData.matProps);
    } else if(o.userData.addedEntry){
      const e = o.userData.addedEntry;
      e.t = tOf(o);
      e.name = o.userData.editorName;
      e.collide = !!(o.userData.collider && o.userData.collider.ref);
      if(e.kind === 'light' && o.userData.light) e.props = lightProps(o.userData.light);
      else if(e.kind === 'effect') e.params = Object.assign({}, o.userData.effectParams);
      else if(o.userData.matProps) e.props = Object.assign({}, o.userData.matProps);
      if(o.userData.assetKey) e.asset = Object.assign({}, e.asset || {}, {key:o.userData.assetKey, name:o.userData.assetName, source:o.userData.assetSource});
      d.added.push(e);
    }
  }
  d.deleted = builtinIds.filter(id => !liveBuiltin.has(id));
  d.env = {
    skyTime: GAME.systems.sky.getTime(),
    dayLength: GAME.systems.sky.getDayLength(),
  };
  if(GAME.systems.sky.proceduralEnv){
    d.env.procEnvEnabled = GAME.systems.sky.proceduralEnv.getEnabled();
    d.env.procEnvIntensity = GAME.systems.sky.proceduralEnv.getIntensity();
    d.env.procEnvWarmth = GAME.systems.sky.proceduralEnv.getWarmth();
    d.env.procEnvContrast = GAME.systems.sky.proceduralEnv.getContrast();
  }
  if(GAME.systems.sky.flare){
    if(GAME.systems.sky.flare.get) d.env.lensFlare = GAME.systems.sky.flare.get();
    // chiavi legacy: un livello salvato ora resta leggibile da build precedenti
    d.env.flareEnabled = GAME.systems.sky.flare.getEnabled();
    d.env.flareOpacity = GAME.systems.sky.flare.getOpacity();
    d.env.flareSize = GAME.systems.sky.flare.getSize();
  }
  if(GAME.systems.sky.sunBloom) d.env.sunBloom = GAME.systems.sky.sunBloom.get();
  if(GAME.systems.sky.volClouds && GAME.systems.sky.volClouds.get()) d.env.volClouds = GAME.systems.sky.volClouds.get();
  if(GAME.systems.rain) d.env.rain = GAME.systems.rain.get();
  if(GAME.ui && GAME.ui.radioHud) d.ui.radioHud = JSON.parse(JSON.stringify(GAME.ui.radioHud));
  d.player = collectPlayerBlueprint(GAME) || {};
  return d;
}

function nextId(){
  const data = load();
  _sessionCounter = Math.max(_sessionCounter, data ? (data.counter || 0) + 1 : 1);
  return 'a' + Date.now().toString(36) + '_' + (_sessionCounter++);
}

let ready = Promise.resolve(null);
let applied = false;
function ensureApplied(GAME){
  if(applied) return ready;
  applied = true;
  ready = apply(GAME || window.LOT_KING);
  window.LK_STORE.ready = ready;
  return ready;
}
window.LK_STORE = {
  KEY, PROJECT_FORMAT, PROJECT_NAME, PROJECT_VERSION,
  levels: LEVELS,
  playerBlueprints: playerBlueprintApi(),
  soundSets: SOUND_SETS,
  isApplied: () => applied,
  load, loadProject, save, clear, blank, projectFromScene, sceneFromProject, parseProject, exportProject, importProject,
  tOf, applyT, syncCollider,
  lightProps, applyLightProps, applyMatProps,
  createPrimitive, createLight, createEmitter, loadGlb, loadGlbRaw, createFromEntry, registerAdded,
  EFFECT_PRESETS, PRIM_DEFS,
  apply, ensureApplied, collect, nextId,
  builtinIds: () => builtinIds.slice(),
  ready,
};

// ------------------------------------------------ boot: libreria → catalogo + autolaunch
(function bootLevels(){
  ensureLibrary();
  function applyPlayableLevelHint(){
    let forcedId = null;
    try {
      forcedId = sessionStorage.getItem('lk.playableActive');
    } catch(err){}
    if(!forcedId) return;
    forcedId = normalizeLevelId(forcedId);
    try { sessionStorage.removeItem('lk.playableActive'); } catch(err){}
    if(!forcedId) return;
    const idx = ensureLibrary();
    if(normalizeLevelId(idx.activeId) === forcedId) return;
    const entry = levelEntry(idx, forcedId);
    if(!entry) return;
    const project = readLevelProject(forcedId);
    if(!project) return;
    try { localStorage.setItem(KEY, JSON.stringify(project)); } catch(err){}
    idx.activeId = forcedId;
    writeIndex(idx);
    syncCatalog();
  }
  applyPlayableLevelHint();
  try {
    const _idx = ensureLibrary();
    const _act = levelEntry(_idx, _idx.activeId);
    console.log('[LotKing runtime] livello attivo risolto: ' + normalizeLevelId(_idx.activeId) +
      ' → "' + (_act ? _act.name : '?') + '"; catalogo: ' + _idx.levels.map(l => l.name + '[' + normalizeLevelId(l.id) + ']').join(', '));
  } catch(e){}
  function syncCatalogNow(attempt){
    attempt = attempt || 0;
    const tracks = catalogTracks();
    const g = window.LOT_KING;
    if(g && g.levels && g.levels.setTracks && tracks){
      g.levels.setTracks(tracks);
      return;
    }
    if(attempt >= 12) return;
    setTimeout(() => syncCatalogNow(attempt + 1), 80);
  }
  syncCatalogNow();
  let auto = null;
  try {
    auto = sessionStorage.getItem('lk.autolaunch');
    if(auto) sessionStorage.removeItem('lk.autolaunch');
  } catch(err){}
  if(!auto) return;
  // il reload arriva senza user gesture: al primo input riattiva audio e radio
  const resumeAudio = () => {
    const g = window.LOT_KING;
    if(!g) return;
    if(g.systems && g.systems.audio && g.systems.audio.resume) g.systems.audio.resume();
    if(g.state && g.state.started && g.systems && g.systems.radio && g.systems.radio.audio && g.systems.radio.audio.paused){
      g.systems.radio.audio.play().catch(()=>{});
    }
  };
  addEventListener('pointerdown', resumeAudio, {once: true});
  addEventListener('keydown', resumeAudio, {once: true});
  // autolaunch robusto: aspetta che il catalogo contenga il livello prima di
  // lanciarlo (evita che, per una race, resti visibile il menu "choose track").
  const wantId = normalizeLevelId(auto);
  (function launchWhenReady(attempt){
    attempt = attempt || 0;
    const g = window.LOT_KING;
    const ready = g && g.actions && g.actions.launchLevel && g.levels &&
      Array.isArray(g.levels.available) &&
      g.levels.available.some(t => normalizeLevelId(t.id) === wantId);
    if(ready){ g.actions.launchLevel(auto); return; }
    if(attempt >= 40) {   // ~3.2s di grazia: prova comunque il target esplicito
      if(g && g.actions && g.actions.launchLevel){
        g.actions.launchLevel(auto);   // ultimo tentativo comunque
      }
      return;
    }
    setTimeout(() => launchWhenReady(attempt + 1), 80);
  })();
})();
})();
