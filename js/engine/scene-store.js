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
const PROJECT_NAME = 'Lot King Engine Project';
const PROJECT_VERSION = 1;
const HUD_TEMPLATE_LEVEL_NAME = 'Parking Lot First Ever Level Test';
const PLAYER_TEMPLATE_LEVEL_NAME = 'Parking Lot First Ever Level';
const PLAYER_TEMPLATE_KEY = 'lotking.playerBlueprintDefault.v1';
const HUD_TEMPLATE_KEY = 'lotking.radioHudDefault.v1';
const LOADING_MUSIC_HINT_KEY = 'lotking.loadingMusic.v1';
const PLAYER_BLUEPRINT_ASSETS_KEY = 'lotking.playerBlueprintAssets.v1';
const LOGIC_ELEMENT_ASSETS_KEY = 'lotking.logicElementAssets.v1';
const ASSET_DB_NAME = 'lotking-assets';
const ASSET_DB_STORE = 'blobs';
const BUNDLED_DEMO_PROJECT_URL = 'demo/demo-project.lkep.json';
const MENU_ROLE_MANIFEST_URL = 'demo/menu-roles.json';
const MENU_ROLE_CACHE_VERSION = '0.7.8-menu-role-2';
const BUNDLED_DEMO_LEVEL_ID = 'online-demo';
const assetUrlCache = new Map();
const logicElementAssetCache = new Map();
const dynamicMaterialTextures = new Set();
let dynamicRadioSurfaceCount = 0;

// ------------------------------------------------ procedural surfaces
// Optional engine module (js/engine/procedural-surfaces.js). It is read lazily
// and every call site degrades to "no surface" when the script is absent, so a
// trimmed playable export still boots.
function surfaces(){
  return typeof window !== 'undefined' && window.LK_ENGINE_PROCEDURAL_SURFACES ? window.LK_ENGINE_PROCEDURAL_SURFACES : null;
}
// Optional engine module (js/engine/texture-budget.js): one ceiling on texture
// size, applied wherever a texture enters. Absent, textures load at their
// native size exactly as they used to.
function textureBudget(){
  return typeof window !== 'undefined' && window.LK_ENGINE_TEXTURE_BUDGET ? window.LK_ENGINE_TEXTURE_BUDGET : null;
}
function budgetTexture(texture){
  const api = textureBudget();
  if(api && texture) api.fitWhenReady(texture);
  return texture;
}
function budgetObjectTextures(root){
  const api = textureBudget();
  if(api && root) api.fitObject(root);
  return root;
}
// A procedural map is owned by that module's cache and is SHARED: every object
// using the same kind renders from the same canvas `source`, and a duplicated
// object even shares the very same texture instance with the object it was
// copied from. Disposing one on delete therefore blanked the others, so the
// disposal paths below skip these and the cache keeps the lifetime.
function isSharedSurfaceTexture(texture){
  return !!(texture && texture.userData && texture.userData.lkSurface);
}
function forEachMaterial(root, fn){
  if(!root || !root.traverse) return;
  root.traverse(node => {
    if(!node.isMesh || !node.material) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    list.forEach(material => { if(material) fn(material, node); });
  });
}
// The world size a surface tiles against only exists once the group scale is
// applied, and the editor keeps changing it. Both applyT and syncCollider call
// this so a scaled object re-tiles instead of stretching its texels.
// A dressed material has to be recompiled ONCE after the scene has actually
// rendered a frame. Attaching the maps inside createPrimitive is not enough:
// the program the renderer ends up using does not agree with the samplers it
// binds, WebGL reports
//   glDrawElements: Mismatch between texture format and sampler type
// and the affected objects - in the FPS level that was the range floor, the
// boundary walls, the bay roof and every other large surface - draw nothing at
// all. Ruled out as causes, each by isolating it: the texture format/type/size
// (RGBA UnsignedByte 256px Uint8Array, verified per kind), the colour spaces
// and `source` sharing between slots (all correct and distinct), the shadow
// samplers (disabling shadows changes nothing) and the pre-benchmark warm-up
// (neutralising renderer.compile changes nothing). Marking the materials dirty
// once, a couple of frames in, fixes it completely and permanently.
//
// Programs are deduplicated by cache key, so a thousand dressed objects still
// compile a few dozen, and this runs once per level load.
let surfaceWarmupFrames = -1;
function scheduleSurfaceWarmup(){ surfaceWarmupFrames = 2; }
function runSurfaceWarmup(GAME){
  if(surfaceWarmupFrames < 0) return;
  if(surfaceWarmupFrames-- > 0) return;
  const registry = GAME && GAME.world ? GAME.world.registry : null;
  if(!registry) return;
  for(const object of registry){
    if(!object || !object.userData || !object.userData.lkSurface) continue;
    forEachMaterial(object, material => { material.needsUpdate = true; });
  }
}
// The world size a surface tiles against only exists once the group scale is
// applied, and the editor keeps changing it. Both applyT and syncCollider call
// this so a scaled object re-tiles instead of stretching its texels.
function refreshSurfaceTiling(obj){
  const api = surfaces();
  if(!obj || !api) return false;
  let changed = false;
  const targets=[];
  obj.traverse(node=>{if(node&&node.userData&&node.userData.lkSurface)targets.push(node);});
  targets.forEach(node=>{
    const surface=node.userData.lkSurface,worldScale=new THREE.Vector3();
    if(node.updateWorldMatrix)node.updateWorldMatrix(true,false);
    node.getWorldScale(worldScale);
    forEachMaterial(node, material => {
      if(api.retile(material, {prim:surface.prim, scale:[worldScale.x,worldScale.y,worldScale.z]})) changed = true;
    });
  });
  scheduleSurfaceWarmup();
  return changed;
}
// Applies (or clears) the procedural surface authored in `props.surfaceTexture`.
// `root` owns the scale, `material` is the slot being dressed.
function applySurfaceTexture(root, material, value, prim){
  const api = surfaces();
  if(!api) return null;
  const spec = api.normalize(value);
  if(!spec){
    if(value === null || value === false || value === '') api.clear(material);
    return null;
  }
  const kind = prim || root && root.userData && root.userData.lkSurface && root.userData.lkSurface.prim
    || root && root.userData && root.userData.addedEntry && root.userData.addedEntry.prim || 'box';
  const scale = root && root.scale ? [root.scale.x, root.scale.y, root.scale.z] : [1, 1, 1];
  const applied = api.apply(material, spec, {prim:kind, scale});
  if(applied && root){
    root.userData = root.userData || {};
    root.userData.lkSurface = {spec:applied, prim:kind};
  }
  return applied;
}
let bundledDemoReady = null;
let bundledDemoProjectCache = null;
let bundledDemoRequestedLevelId = null;

function bundledDemoProjectUrl(){
  const sep = BUNDLED_DEMO_PROJECT_URL.indexOf('?') >= 0 ? '&' : '?';
  return BUNDLED_DEMO_PROJECT_URL + sep + 'v=' + Date.now().toString(36);
}

function reportBundledDemoProgress(detail){
  if(!detail || typeof window === 'undefined') return;
  try { window.dispatchEvent(new CustomEvent('lotking:bundled-demo-progress', {detail})); }
  catch(err){}
}

function progressPercent(base, span, loaded, total){
  const n = Number(total) || 0;
  if(n <= 0) return base;
  return Math.max(base, Math.min(base + span, base + (Number(loaded) || 0) / n * span));
}

async function fetchTextWithProgress(url, progressBase, progressSpan, step){
  const startedAt = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  reportBundledDemoProgress({progress:progressBase || 0, step:step || 'requesting demo project', url});
  const response = await fetch(url, {cache:'reload'});
  if(!response.ok){
    reportBundledDemoProgress({progress:progressBase || 0, step:'demo project not found', url, error:'HTTP ' + response.status});
    return null;
  }
  const total = Number(response.headers && response.headers.get('content-length')) || 0;
  if(!response.body || !response.body.getReader){
    const text = await response.text();
    reportBundledDemoProgress({
      progress:(progressBase || 0) + (progressSpan || 0),
      step:step || 'downloaded demo project',
      url,
      loaded:text.length,
      total:text.length,
      bps:null,
      eta:null,
    });
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let loaded = 0;
  let text = '';
  while(true){
    const chunk = await reader.read();
    if(chunk.done) break;
    loaded += chunk.value ? chunk.value.byteLength : 0;
    text += decoder.decode(chunk.value, {stream:true});
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const elapsed = Math.max(.001, (now - startedAt) / 1000);
    const bps = loaded / elapsed;
    reportBundledDemoProgress({
      progress:progressPercent(progressBase || 0, progressSpan || 0, loaded, total),
      step:step || 'downloading demo project',
      url,
      loaded,
      total,
      bps,
      eta:total > 0 && bps > 0 ? (total - loaded) / bps : null,
    });
  }
  text += decoder.decode();
  reportBundledDemoProgress({
    progress:(progressBase || 0) + (progressSpan || 0),
    step:'demo project downloaded',
    url,
    loaded,
    total:total || loaded,
    bps:null,
    eta:0,
  });
  return text;
}

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

function collectPortableAssetDbKeys(value, keys, seen, depth){
  if(!value || (depth || 0) > 32) return keys;
  keys = keys || new Set();
  seen = seen || new WeakSet();
  if(typeof value === 'string'){
    const text = value.trim();
    if(text.length < 2097152 && text.charAt(0) === '{' && /"(?:dbKey|modelDbKey)"\s*:/.test(text)){
      try { collectPortableAssetDbKeys(JSON.parse(text), keys, seen, (depth || 0) + 1); } catch(err){}
    }
    return keys;
  }
  if(typeof value !== 'object' || seen.has(value)) return keys;
  seen.add(value);
  if(typeof value.dbKey === 'string' && value.dbKey) keys.add(value.dbKey);
  if(typeof value.modelDbKey === 'string' && value.modelDbKey) keys.add(value.modelDbKey);
  if(Array.isArray(value)){
    value.forEach(item => collectPortableAssetDbKeys(item, keys, seen, (depth || 0) + 1));
  } else {
    Object.keys(value).forEach(key => collectPortableAssetDbKeys(value[key], keys, seen, (depth || 0) + 1));
  }
  return keys;
}

function missingAssetBlobKeys(keys){
  const list = Array.from(keys || []).filter(Boolean);
  if(!list.length) return Promise.resolve([]);
  return assetDbOpen().then(db => new Promise((resolve, reject) => {
    const missing = [];
    const tx = db.transaction(ASSET_DB_STORE, 'readonly');
    const store = tx.objectStore(ASSET_DB_STORE);
    list.forEach(key => {
      const request = store.get(key);
      request.onsuccess = () => { if(!request.result) missing.push(key); };
    });
    tx.oncomplete = () => { db.close(); resolve(missing); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Verifica asset DEMO fallita')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Verifica asset DEMO interrotta')); };
  }));
}

async function hydrateBundledProjectAssets(project, label){
  let lastError = null;
  for(let attempt = 1; attempt <= 3; attempt++){
    try {
      reportBundledDemoProgress({progress:61 + attempt, step:(label || 'demo') + ' asset hydration ' + attempt + '/3'});
      await localizePortableProjectAssets(project);
      const missing = await missingAssetBlobKeys(collectPortableAssetDbKeys(project));
      if(missing.length) throw new Error('Asset DEMO non disponibili dopo idratazione: ' + missing.slice(0, 4).join(', ') + (missing.length > 4 ? ' +' + (missing.length - 4) : ''));
      return project;
    } catch(err){
      lastError = err;
      if(attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 120));
    }
  }
  throw lastError || new Error('Idratazione asset DEMO fallita');
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
function save(data, meta, options){
  try {
    options = options || {};
    const expectedActiveId = normalizeLevelId(options.expectedActiveId);
    if(expectedActiveId){
      const actualActiveId = normalizeLevelId(ensureLibrary().activeId);
      if(actualActiveId !== expectedActiveId){
        console.warn('LotKing store: save refused because the active level changed', expectedActiveId, '→', actualActiveId);
        return false;
      }
    }
    const saveMeta = expectedActiveId
      ? Object.assign({}, meta || {}, {trackId: expectedActiveId})
      : meta;
    const project = projectFromScene(data, saveMeta);
    localStorage.setItem(KEY, JSON.stringify(project));
    return !!upsertActiveLevel(project);
  }
  catch(err){ console.warn('LotKing store: salvataggio fallito (quota?)', err); return false; }
}
function clear(){ localStorage.removeItem(KEY); }
function defaultLevelLogicGraph(){
  return window.LK_LOGIC_GRAPH
    ? window.LK_LOGIC_GRAPH.createEmptyGraph('Level Logic', 'level')
    : {version:1, name:'Level Logic', scope:'level', enabled:true, variables:[], nodes:[], edges:[]};
}
function normalizeLogicGraph(graph, name, scope){
  return window.LK_LOGIC_GRAPH
    ? window.LK_LOGIC_GRAPH.normalizeGraph(graph || defaultLevelLogicGraph(), name, scope)
    : (graph || {version:1, name:name || 'Logic Graph', scope:scope || 'element', enabled:true, variables:[], nodes:[], edges:[]});
}
function normalizeLogicElementHierarchy(scene){
  if(!scene || !Array.isArray(scene.elements)) return;
  const ids = new Set(['root'].concat(scene.elements.map(element => element && element.id).filter(Boolean)));
  scene.elements.forEach(element => {
    if(!element || !element.id) return;
    if(!element.parentId || !ids.has(element.parentId) || element.parentId === element.id) element.parentId = 'root';
  });
  scene.elements.forEach(element => {
    if(!element || !element.id) return;
    const visited = new Set([element.id]);
    let current = element;
    while(current && current.parentId && current.parentId !== 'root'){
      if(visited.has(current.parentId)){
        element.parentId = 'root';
        return;
      }
      visited.add(current.parentId);
      current = scene.elements.find(item => item && item.id === current.parentId) || null;
    }
  });
}
function ensureLogicElementScene(graph){
  graph = normalizeLogicGraph(graph, 'Logic Element', 'element');
  if(graph.vehiclePawn && graph.vehiclePawn.proceduralFallback === 'native-player-visual-v1'){
    const tuning = graph.vehiclePawn.tuning || (graph.vehiclePawn.tuning = {});
    const translatedProfile = Number(tuning.horsepower) === 700 && Number(tuning.acceleration) === 45.6 && Math.abs(Number(tuning.maxSpeed) - 41.42) < .01;
    if(translatedProfile){
      Object.assign(tuning, {horsepower:450,torque:5,maxSpeed:38,acceleration:16,brake:24,grip:.84});
      const migratedVariables = {Horsepower:450,Torque:5,MaxSpeed:38,Acceleration:16,BrakeForce:24,Grip:.84};
      (graph.variables || []).forEach(variable => {
        if(variable && Object.prototype.hasOwnProperty.call(migratedVariables, variable.name)) variable.value = variable.defaultValue = migratedVariables[variable.name];
      });
    }
  }
  if(!graph.logicScene || typeof graph.logicScene !== 'object') graph.logicScene = {};
  const scene = graph.logicScene;
  if(!scene.root) scene.root = {};
  scene.root = Object.assign({id:'root', name:'Root', type:'mesh', linked:true, position:[0,0,0], rotation:[0,0,0], scale:[1,1,1], color:'#7dd3fc'}, scene.root || {});
  scene.root.id = 'root';
  if(scene.root.type === 'mesh' && !scene.root.asset && !scene.root.primitive) scene.root.primitive = 'cube';
  if(scene.root.type === 'text'){
    if(!scene.root.text) scene.root.text = 'Text';
    if(!scene.root.textMode) scene.root.textMode = 'plane';
  }
  if(!Array.isArray(scene.elements)) scene.elements = [];
  scene.elements.forEach(element => {
    if(!element || typeof element !== 'object') return;
    if(!Array.isArray(element.position)) element.position = [0,0,0];
    if(!Array.isArray(element.rotation)) element.rotation = [0,0,0];
    if(!Array.isArray(element.scale)) element.scale = [1,1,1];
    if(!element.color) element.color = '#7dd3fc';
    if(!element.type) element.type = 'mesh';
    if(element.type === 'mesh' && !element.asset && !element.primitive) element.primitive = 'cube';
    if(element.type === 'text'){
      if(!element.text) element.text = 'Text';
      if(!element.textMode) element.textMode = 'plane';
    }
    if(!element.parentId) element.parentId = 'root';
    if(/^headlight_(?:left|right)$/.test(element.id || '')){
      if(element.intensity == null) element.intensity = 1.35;
      if(element.distance == null) element.distance = 30;
    }
    if(/^neon_(?:left|right|front|rear)$/.test(element.id || '')){
      if(element.intensity == null) element.intensity = .8;
      if(element.distance == null) element.distance = 3;
    }
  });
  if(graph.vehiclePawn && graph.vehiclePawn.proceduralFallback){
    const nativeWheels = {
      wheel_front_left:[-.92,.38,1.35], wheel_front_right:[.92,.38,1.35],
      wheel_rear_left:[-.92,.38,-1.35], wheel_rear_right:[.92,.38,-1.35],
    };
    Object.keys(nativeWheels).forEach(id => {
      const wheel = scene.elements.find(element => element && element.id === id);
      if(!wheel) return;
      const legacyRotation = Array.isArray(wheel.rotation) && Math.abs((Number(wheel.rotation[2]) || 0) - Math.PI / 2) < .01;
      const legacyScale = Array.isArray(wheel.scale) && Math.abs((Number(wheel.scale[0]) || 0) - .42) < .01 && Math.abs((Number(wheel.scale[1]) || 0) - .26) < .01;
      if(!legacyRotation && !legacyScale) return;
      wheel.position = nativeWheels[id].slice();
      wheel.rotation = [0,0,90];
      wheel.scale = [.905,.356,.905];
    });
    if(Object.keys(nativeWheels).every(id => scene.elements.some(element => element && element.id === id)) && !scene.elements.some(element => element && /^skid_/.test(element.id || ''))){
      [
        ['skid_rear_left',-.92,.03,-1.35], ['skid_rear_right',.92,.03,-1.35],
        ['skid_front_left',-.92,.03,1.35], ['skid_front_right',.92,.03,1.35],
      ].forEach(def => scene.elements.push({id:def[0],name:def[0].replace(/_/g,' '),type:'empty',parentId:'root',linked:true,dummyVisible:false,position:def.slice(1),rotation:[0,0,0],scale:[1,1,1],color:'#334155'}));
    }
  }
  normalizeLogicElementHierarchy(scene);
  if(!Array.isArray(scene.components)) scene.components = [];
  const oldDefault = scene.elements.find(item => item && item.id === 'default_mesh');
  if(oldDefault){
    scene.root = Object.assign({}, oldDefault, scene.root, {id:'root', name:scene.root.name || 'Root'});
    scene.elements = scene.elements.filter(item => item && item.id !== 'default_mesh');
    scene.components = scene.components.filter(item => item && item.elementId !== 'default_mesh');
  }
  if(!scene.components.some(item => item && item.elementId === 'root' && item.type === 'transform')){
    scene.components.push({id:'root_transform', elementId:'root', name:'Transform', type:'transform', linked:true});
  }
  if(!scene.components.some(item => item && item.elementId === 'root' && item.type === 'render')){
    scene.components.push({id:'root_render', elementId:'root', name:'Render Mesh', type:'render', linked:true});
  }
  return graph;
}
function logicElementSceneElements(graph){
  const g = ensureLogicElementScene(graph);
  return [g.logicScene.root].concat(g.logicScene.elements || []);
}
// Every texture slot, not only `map`. A PBR material here can carry a normal,
// roughness, metalness, emissive, ao or alpha map plus the derived sketch/pigment
// layers, and each one is a separate GPU allocation. Freeing `map` alone left the
// rest resident, which is most of the texture memory a scene reload leaked.
// Textures a surface pack shares between materials are skipped: they outlive any
// single object and are owned by the pack.
const DISPOSABLE_TEXTURE_SLOTS = Object.freeze([
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap',
  'bumpMap', 'displacementMap', 'lightMap', 'envMap', 'specularMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap',
  'transmissionMap', 'thicknessMap', 'iridescenceMap', 'anisotropyMap', 'gradientMap', 'matcap',
]);
function disposeMaterialTextures(material, seen, liveTextures){
  if(!material) return;
  DISPOSABLE_TEXTURE_SLOTS.forEach(slot => {
    const texture = material[slot];
    if(!texture || !texture.isTexture || !texture.dispose) return;
    if(isSharedSurfaceTexture(texture)) return;
    if(liveTextures && liveTextures.has(texture)) return;
    if(seen){ if(seen.has(texture)) return; seen.add(texture); }
    texture.dispose();
  });
}
// Most callers below dispose from inside a frame, and under WebGPU a dispose()
// destroys the GPU buffer immediately - including buffers a command buffer has
// already recorded. The rendering backend owns that timing: it delays the release
// past the frame's submit on WebGPU and runs it straight away on WebGL.
function releaseGpuResources(release){
  const backend = typeof window !== 'undefined' && window.LK_RUNTIME_RENDERING_BACKEND;
  if(backend && typeof backend.deferGpuRelease === 'function') return backend.deferGpuRelease(release);
  release();
  return false;
}
function disposeObject3D(node){
  if(!node) return;
  // One texture can be shared by several materials in the same object; disposing
  // it twice is harmless but the set keeps the sweep O(textures).
  const seen = typeof Set === 'function' ? new Set() : null;
  // The traverse runs now, while the object graph is still whole; only the frees
  // themselves are allowed to wait.
  const geometries = [], materials = [], skeletons = [], excluded = new Set();
  node.traverse(child => {
    excluded.add(child);
    if(child.geometry && child.geometry.dispose) geometries.push(child.geometry);
    if(child.material){
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => { if(mat) materials.push(mat); });
    }
    // A skinned mesh keeps its own skeleton texture.
    if(child.isSkinnedMesh && child.skeleton && child.skeleton.boneTexture && child.skeleton.boneTexture.dispose) skeletons.push(child.skeleton);
  });
  releaseGpuResources(() => {
    // Imported GLBs, clones, warm-up objects and engine pools can share the
    // exact same geometry/material/texture object. Disposing one detached root
    // must never retire a resource still referenced by the live scene. Resolve
    // references at release time, after unregister/detach has completed.
    const liveGeometries=new Set(),liveMaterials=new Set(),liveTextures=new Set();
    const GAME=typeof window!=='undefined'&&window.LOT_KING;
    const roots=[];
    if(GAME&&GAME.core&&GAME.core.scene)roots.push(GAME.core.scene);
    if(GAME&&GAME.world&&Array.isArray(GAME.world.registry))GAME.world.registry.forEach(root=>{if(root&&!roots.includes(root))roots.push(root);});
    roots.forEach(root=>{if(!root||!root.traverse)return;root.traverse(child=>{
      if(excluded.has(child))return;
      if(child.geometry)liveGeometries.add(child.geometry);
      const list=child.material?(Array.isArray(child.material)?child.material:[child.material]):[];
      list.forEach(material=>{
        if(!material)return;liveMaterials.add(material);
        DISPOSABLE_TEXTURE_SLOTS.forEach(slot=>{if(material[slot])liveTextures.add(material[slot]);});
      });
      if(child.isSkinnedMesh&&child.skeleton&&child.skeleton.boneTexture)liveTextures.add(child.skeleton.boneTexture);
    });});
    geometries.forEach(geometry => {if(!liveGeometries.has(geometry))geometry.dispose();});
    materials.forEach(mat => {
      disposeMaterialTextures(mat, seen, liveTextures);
      if(mat.dispose&&!liveMaterials.has(mat)) mat.dispose();
    });
    skeletons.forEach(skeleton => {
      if(skeleton.boneTexture && skeleton.boneTexture.dispose&&!liveTextures.has(skeleton.boneTexture)){
        skeleton.boneTexture.dispose();
        skeleton.boneTexture = null;
      }
    });
  });
}
function logicElementElementPosition(element){
  const p = Array.isArray(element && element.position) ? element.position : [0,0,0];
  return [Number(p[0]) || 0, Number.isFinite(Number(p[1])) ? Number(p[1]) : 0, Number(p[2]) || 0];
}
function logicElementElementRotation(element){
  const r = Array.isArray(element && element.rotation) ? element.rotation : [0,0,0];
  return [Number(r[0]) || 0, Number(r[1]) || 0, Number(r[2]) || 0];
}
function logicElementElementScale(element){
  const s = Array.isArray(element && element.scale) ? element.scale : [1,1,1];
  return [
    Number.isFinite(Number(s[0])) ? Number(s[0]) : 1,
    Number.isFinite(Number(s[1])) ? Number(s[1]) : 1,
    Number.isFinite(Number(s[2])) ? Number(s[2]) : 1,
  ];
}
function logicElementMaterial(THREERef, element, opts){
  opts = opts || {};
  const color = new THREERef.Color(element && element.color || (opts.helper ? '#facc15' : '#7dd3fc'));
  if(opts.line) return new THREERef.LineBasicMaterial({color, transparent:true, opacity:opts.opacity == null ? .9 : opts.opacity, depthTest:false});
  if(opts.basic) return new THREERef.MeshBasicMaterial({color, transparent:opts.transparent === true, opacity:opts.opacity == null ? 1 : opts.opacity, depthTest:opts.depthTest !== false});
  if(THREERef.MeshStandardMaterial) return new THREERef.MeshStandardMaterial({color, roughness:.55, metalness:.08, transparent:opts.transparent === true, opacity:opts.opacity == null ? 1 : opts.opacity});
  return new THREERef.MeshBasicMaterial({color, transparent:opts.transparent === true, opacity:opts.opacity == null ? 1 : opts.opacity});
}
function logicElementPrimitiveGeometry(THREERef, element){
  const primitive = String(element && element.primitive || 'cube').toLowerCase();
  if(primitive === 'sphere') return new THREERef.SphereGeometry(.48, 32, 16);
  if(primitive === 'cylinder') return new THREERef.CylinderGeometry(.42, .42, .9, 32);
  if(primitive === 'cone') return new THREERef.ConeGeometry(.46, .95, 32);
  if(primitive === 'plane') return new THREERef.PlaneGeometry(1, 1);
  if(primitive === 'torus') return new THREERef.TorusGeometry(.36, .13, 16, 40);
  return new THREERef.BoxGeometry(.8, .8, .8);
}
function createLogicElementTextTexture(THREERef, element){
  if(typeof document === 'undefined' || !THREERef.CanvasTexture) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const text = String(element && element.text || 'Text');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 72px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,.52)';
  ctx.fillStyle = element && element.color || '#ffffff';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREERef.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
function createLogicElementTextNode(THREERef, element){
  const width = Math.max(.05, Number(element && element.textWidth) || 2.2);
  const height = Math.max(.05, Number(element && element.textHeight) || .75);
  const texture = createLogicElementTextTexture(THREERef, element);
  if(texture && String(element && element.textMode || 'plane') === 'billboard' && THREERef.Sprite){
    const sprite = new THREERef.Sprite(new THREERef.SpriteMaterial({map:texture, transparent:true, depthWrite:false}));
    sprite.scale.set(width, height, 1);
    return sprite;
  }
  const material = texture
    ? new THREERef.MeshBasicMaterial({map:texture, transparent:true, depthWrite:false, side:THREERef.DoubleSide})
    : logicElementMaterial(THREERef, element, {basic:true, transparent:true, opacity:.85});
  return new THREERef.Mesh(new THREERef.PlaneGeometry(width, height), material);
}
function createLogicElementPreviewNode(THREERef, element){
  const type = String(element && element.type || 'mesh');
  let node;
  if(type === 'empty'){
    const helperKind = String(element && (element.id || element.name) || '').toLowerCase();
    const geo = /exhaust|scarico/.test(helperKind)
      ? new THREERef.ConeGeometry(.18, .55, 14)
      : (/skid/.test(helperKind) ? new THREERef.BoxGeometry(.24,.02,.7) : new THREERef.SphereGeometry(.18, 16, 8));
    node = new THREERef.Group();
    const helper = new THREERef.Mesh(geo, logicElementMaterial(THREERef, element, {basic:true, transparent:true, opacity:.72}));
    if(/exhaust|scarico/.test(helperKind)) helper.rotation.x = Math.PI / 2;
    if(/skid/.test(helperKind) && helper.material) helper.material.wireframe = true;
    helper.userData.logicElementRuntimeVisual = false;
    helper.visible = element && element.dummyVisible === true;
    node.add(helper);
  } else if(type === 'light'){
    const group = new THREERef.Group();
    const lightKey = String(element && [element.lightKind, element.condition, element.id, element.name].filter(Boolean).join(' ') || '').toLowerCase();
    const isNeonArea = /rectarea|rect-area|neon|underglow/.test(lightKey) && typeof THREERef.RectAreaLight === 'function';
    const isFrontRear = /front|rear/.test(lightKey);
    const areaWidth = Math.max(.04, Number(element && element.areaWidth) || (isFrontRear ? 1.9 : .08));
    const areaHeight = Math.max(.04, Number(element && element.areaHeight) || (isFrontRear ? .08 : 2.7));
    const bulb = new THREERef.Mesh(
      isNeonArea ? new THREERef.BoxGeometry(areaWidth, .035, areaHeight) : new THREERef.SphereGeometry(.16, 16, 8),
      logicElementMaterial(THREERef, element, {basic:true, helper:true})
    );
    const authoredIntensity = Math.max(0, Number(element && element.intensity) || .75);
    const glow = isNeonArea
      ? new THREERef.RectAreaLight(element && element.color || '#facc15', authoredIntensity * 8, areaWidth, areaHeight)
      : new THREERef.PointLight(element && element.color || '#facc15', authoredIntensity, Math.max(0, Number(element && element.distance) || 4));
    if(isNeonArea){
      glow.rotation.x = Math.PI / 2;
      glow.userData.vehicleNeonAreaLight = true;
    }
    if(element && element.cinematicLensFlare){
      glow.userData.cinematicLensFlare = normalizeCinematicLightFlare(element.cinematicLensFlare);
    }
    bulb.userData.logicElementRuntimeVisual = false;
    bulb.visible = element && element.dummyVisible === true;
    glow.userData.logicElementRuntimeVisual = true;
    group.add(bulb, glow);
    node = group;
  } else if(type === 'camera'){
    const group = new THREERef.Group();
    // Same compact camera body used by the native Player Car. The previous
    // oversized frustum looked unlike every other camera dummy and, as a child
    // of a Pawn, could expand authoring bounds several metres behind it.
    const visual = new THREERef.Group();
    const material = new THREERef.MeshBasicMaterial({color:element && element.color || '#9db4ff',wireframe:true,depthTest:false,transparent:true,opacity:.9});
    const body = new THREERef.Mesh(new THREERef.BoxGeometry(.58,.38,.3),material);
    const lens = new THREERef.Mesh(new THREERef.ConeGeometry(.15,.36,12),material);
    lens.rotation.x=Math.PI/2;lens.position.z=-.3;
    visual.add(body,lens);
    visual.visible=element&&element.dummyVisible===true;
    visual.userData.logicElementCameraVisual=true;
    visual.traverse(child=>{child.renderOrder=1000;child.userData.logicElementRuntimeVisual=false;child.userData.editorOnly=true;child.userData.helperOnly=true;child.userData.nonExportable=true;child.userData.lkFlareIgnore=true;});
    group.add(visual);
    group.userData.logicElementCameraVisual=visual;
    node = group;
  } else if(type === 'text'){
    node = createLogicElementTextNode(THREERef, element);
  } else if(element && element.asset) {
    node = new THREERef.Group();
    const placeholder = new THREERef.Mesh(
      new THREERef.BoxGeometry(.8, .8, .8),
      logicElementMaterial(THREERef, element, {basic:true, transparent:true, opacity:.22})
    );
    placeholder.userData.logicElementAssetPlaceholder = true;
    node.add(placeholder);
  } else {
    const geo = logicElementPrimitiveGeometry(THREERef, element);
    node = new THREERef.Mesh(geo, logicElementMaterial(THREERef, element));
  }
  return node;
}

function logicElementAssetKey(asset){
  if(!asset) return '';
  return [asset.id || '', asset.key || '', asset.dbKey || '', asset.src || '', Number(asset.fit) || 1].join(':');
}
function cloneLogicElementAsset(template){
  const copy = window.THREE && THREE.SkeletonUtils && THREE.SkeletonUtils.clone
    ? THREE.SkeletonUtils.clone(template)
    : template.clone(true);
  copy.animations = (template.animations || []).map(clip => clip && clip.clone ? clip.clone() : clip);
  copy.traverse(child => {
    if(child.geometry && child.geometry.clone) child.geometry = child.geometry.clone();
    if(child.material){
      child.material = Array.isArray(child.material)
        ? child.material.map(material => material && material.clone ? material.clone() : material)
        : (child.material.clone ? child.material.clone() : child.material);
    }
  });
  return copy;
}
function logicAnimationConfig(element){
  return Object.assign({enabled:true, clip:'', autoplay:true, loop:'repeat', speed:1, playInEditor:true}, element && element.animation || {});
}
function animationTargetNode(target){
  if(!target) return null;
  if(target.userData && target.userData.logicAnimationMixer) return target;
  let found = null;
  if(target.traverse) target.traverse(child => {
    if(!found && child.userData && child.userData.logicAnimationMixer) found = child;
  });
  return found;
}
function playLogicElementAnimation(target, clipName, options){
  const node = animationTargetNode(target);
  if(!node || !node.userData.logicAnimationMixer) return null;
  const clips = node.userData.logicAnimationClips || [];
  const wanted = String(clipName || '').trim();
  const clip = clips.find(item => item && item.name === wanted) || clips[0];
  if(!clip) return null;
  const opts = options || {};
  const mixer = node.userData.logicAnimationMixer;
  if(node.userData.logicAnimationAction) node.userData.logicAnimationAction.stop();
  const action = mixer.clipAction(clip);
  const loop = String(opts.loop || 'repeat').toLowerCase();
  action.enabled = true;
  action.clampWhenFinished = loop === 'once';
  action.setLoop(loop === 'once' ? THREE.LoopOnce : (loop === 'pingpong' ? THREE.LoopPingPong : THREE.LoopRepeat), loop === 'once' ? 1 : Infinity);
  action.setEffectiveTimeScale(Number.isFinite(Number(opts.speed)) ? Number(opts.speed) : 1);
  action.reset().play();
  node.userData.logicAnimationAction = action;
  node.userData.logicAnimationClipName = clip.name || '';
  return action;
}
function stopLogicElementAnimation(target){
  const node = animationTargetNode(target);
  if(!node || !node.userData.logicAnimationMixer) return false;
  node.userData.logicAnimationMixer.stopAllAction();
  node.userData.logicAnimationAction = null;
  return true;
}
function setLogicElementAnimationSpeed(target, speed){
  const node = animationTargetNode(target);
  if(!node || !node.userData.logicAnimationMixer) return false;
  const value = Number.isFinite(Number(speed)) ? Number(speed) : 1;
  node.userData.logicAnimationMixer.timeScale = 1;
  if(node.userData.logicAnimationAction) node.userData.logicAnimationAction.setEffectiveTimeScale(value);
  else node.userData.logicAnimationMixer.timeScale = value;
  return true;
}
function startLogicElementAnimations(target, runtimeMode){
  if(!target || !target.traverse) return 0;
  let started = 0;
  target.traverse(node => {
    // A live Character Pawn owns this mixer exclusively. Starting the generic
    // imported-model autoplay after prewarming makes that foreign action fight
    // locomotion until a vehicle exit happens to reset the presentation.
    if(node.userData && node.userData.logicCharacterLocomotionMixerOwner) return;
    const config = node.userData && node.userData.logicAnimationConfig;
    if(!config || config.enabled === false || config.autoplay === false) return;
    if(!runtimeMode && config.playInEditor === false) return;
    if(playLogicElementAnimation(node, config.clip, config)) started++;
  });
  return started;
}
function stopLogicElementAnimations(target){
  if(!target || !target.traverse) return 0;
  let stopped = 0;
  target.traverse(node => {
    if(!node.userData || !node.userData.logicAnimationMixer) return;
    node.userData.logicAnimationMixer.stopAllAction();
    node.userData.logicAnimationAction = null;
    stopped++;
  });
  return stopped;
}
function configureLogicElementAnimation(node, model, element, owner){
  const clips = (model && model.animations || []).filter(Boolean);
  node.userData.logicAnimationClips = clips;
  node.userData.logicAnimationClipNames = clips.map(clip => clip.name || 'Animation');
  if(!clips.length || !window.THREE || !THREE.AnimationMixer) return null;
  const mixer = new THREE.AnimationMixer(model);
  node.userData.logicAnimationMixer = mixer;
  const entry = {mixer, node};
  if(owner && owner.userData){
    owner.userData.logicElementMixers = owner.userData.logicElementMixers || [];
    owner.userData.logicElementMixers.push(entry);
  }
  const config = logicAnimationConfig(element);
  node.userData.logicAnimationConfig = config;
  const GAME = window.LOT_KING;
  const inEditor = !!(GAME && GAME.state && GAME.state.editorActive && !GAME.state.editorPreview);
  if(config.enabled !== false && config.autoplay !== false && (!inEditor || config.playInEditor !== false)){
    playLogicElementAnimation(node, config.clip, config);
  }
  return mixer;
}
function disposeLogicElementAnimations(object){
  const entries = object && object.userData && object.userData.logicElementMixers;
  if(Array.isArray(entries)) entries.forEach(entry => {
    if(entry && entry.mixer) entry.mixer.stopAllAction();
  });
  if(object && object.userData) object.userData.logicElementMixers = [];
}
function normalizeLogicElementFbxSource(model,fit){
  if(!model||!window.THREE)return model;
  const animations=(model.animations||[]).map(clip=>clip&&clip.clone?clip.clone():clip),wrap=new THREE.Group();wrap.add(model);wrap.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(wrap),size=box.getSize(new THREE.Vector3()),maxDim=Math.max(size.x,size.y,size.z),target=Math.max(.05,Number(fit)||1.9);
  if(maxDim>1e-5)wrap.scale.setScalar(target/maxDim);
  wrap.updateMatrixWorld(true);const fitted=new THREE.Box3().setFromObject(wrap),center=fitted.getCenter(new THREE.Vector3());wrap.position.set(-center.x,-fitted.min.y,-center.z);
  const root=new THREE.Group();root.add(wrap);root.animations=animations;root.userData.lkLogicAssetSourceFallback='fbx';return root;
}
function loadLogicElementFbxFallback(asset,canonicalError){
  if(!asset||asset.sourceFormat!=='fbx'||(!asset.sourceDbKey&&!asset.sourceSrc))return Promise.reject(canonicalError);
  const plugin=window.LK_FBX_IMPORT_PLUGIN;
  if(!plugin||typeof plugin.loadSource!=='function')return Promise.reject(canonicalError);
  return Promise.resolve(plugin.loadSource(asset,{THREE:window.THREE,assetBlobs:window.LK_ASSET_BLOBS})).then(model=>normalizeLogicElementFbxSource(model,asset.fit)).catch(fallbackError=>{
    const error=new Error('Canonical GLB failed ('+String(canonicalError&&canonicalError.message||canonicalError)+'); FBX fallback failed ('+String(fallbackError&&fallbackError.message||fallbackError)+')');error.cause=canonicalError;throw error;
  });
}
function loadLogicElementAsset(asset){
  if(!asset) return Promise.reject(new Error('Logic Element asset missing'));
  const key = logicElementAssetKey(asset);
  let pending = logicElementAssetCache.get(key);
  if(!pending){
    const source = asset.src
      ? Promise.resolve(asset.src)
      : (asset.dbKey && window.LK_ASSET_BLOBS
        ? window.LK_ASSET_BLOBS.getUrl(asset.dbKey)
        : Promise.reject(new Error('Logic Element asset source missing')));
    // An asset that declares itself FBX goes straight to the FBX path. Trying the
    // canonical GLB loader on a `.fbx` is a guaranteed failure that still fetches
    // and parses the whole file, and it reports a GLTF error for a file that was
    // never a GLB - which reads as a broken asset rather than a bundled FBX.
    // Only when there is nothing else to try: an imported asset keeps a converted
    // GLB in `dbKey` and its original FBX as the fallback, and that order stays.
    const canonicalGlb = !!(asset.dbKey || (asset.src && !/\.fbx$/i.test(String(asset.src))));
    const declaresFbx = !canonicalGlb && (String(asset.sourceFormat || '').toLowerCase() === 'fbx'
      || /\.fbx$/i.test(String(asset.src || '')));
    pending = declaresFbx
      ? loadLogicElementFbxFallback(asset, new Error('asset is FBX source'))
      : source.then(src => loadGlb(src, Math.max(.05, Number(asset.fit) || 1))).catch(error=>loadLogicElementFbxFallback(asset,error));
    logicElementAssetCache.set(key, pending);
    pending.catch(() => logicElementAssetCache.delete(key));
  }
  return pending.then(cloneLogicElementAsset);
}
const CHARACTER_PLACEHOLDER_ID=/^(torso_|hips_|leg_sock_|arm_skin_|hand_skin_|head_skin|hair_top)/;
function setCharacterPlaceholderVisibility(owner,visible){if(!owner||!owner.traverse)return;const shown=visible!==false;owner.traverse(child=>{const data=child&&child.userData,id=data&&data.logicElementSceneId;if(!id||!CHARACTER_PLACEHOLDER_ID.test(String(id)))return;data.characterPlaceholderSuppressedByAsset=!shown;if(data.firstPersonBaseVisible!==undefined)data.firstPersonBaseVisible=shown;child.visible=shown;});}
function removeCharacterAssetFallback(owner){const fallback=owner&&owner.userData&&owner.userData.characterAssetFallback;if(!fallback)return;if(fallback.parent)fallback.parent.remove(fallback);disposeObject3D(fallback);delete owner.userData.characterAssetFallback;}
function ensureCharacterAssetFallback(owner,parent,definition){
  if(!owner||!parent||!window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION||!LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION.createVisual)return null;
  const current=owner.userData&&owner.userData.characterAssetFallback;if(current&&current.parent)return current;
  const visual=LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION.createVisual(window.THREE,definition&&definition.appearance);if(!visual)return null;
  visual.userData.characterAssetFallback=true;visual.userData.logicElementInternal=true;visual.userData.logicElementRuntimeVisual=true;visual.traverse(child=>{child.userData.logicElementInternal=true;child.userData.logicElementRuntimeVisual=true;child.userData.editorLocked=true;child.userData.nonExportable=true;});parent.add(visual);owner.userData.characterAssetFallback=visual;return visual;
}
function hideSketchbookLogicAssetMetadata(model, owner){
  const graph = owner && owner.userData && owner.userData.logicGraph;
  if(!model || !model.traverse || !graph || !graph.sketchbookPawn) return 0;
  let hidden = 0;
  model.traverse(child => {
    const data = child && child.userData || {};
    const tag = String(data.data || data.kind || '').toLowerCase();
    // Source-authored physics/navigation helpers remain in the hierarchy for
    // Pawn metadata scanning, but they are not vehicle body visuals.
    if(tag !== 'collision' && tag !== 'physics' && tag !== 'navmesh') return;
    child.visible = false;
    child.userData.lkSketchbookMetadataHidden = true;
    hidden++;
  });
  model.userData.lkSketchbookHiddenMetadataCount = hidden;
  return hidden;
}
function hydrateLogicElementPreviewAsset(node, element, owner){
  if(!node || !element || !element.asset) return Promise.resolve(node);
  const key = logicElementAssetKey(element.asset);
  node.userData.logicElementAssetKey = key;
  return loadLogicElementAsset(element.asset).then(model => {
    if(node.userData.logicElementAssetKey !== key || !node.parent){
      disposeObject3D(model);
      return node;
    }
    Array.from(node.children).filter(child => child.userData && (child.userData.logicElementAssetPlaceholder || child.userData.logicElementAssetVisual)).forEach(child => {
      node.remove(child);
      disposeObject3D(child);
    });
    hideSketchbookLogicAssetMetadata(model, owner);
    model.traverse(child => {
      child.userData.logicElementAssetVisual = true;
      child.userData.logicElementInternal = true;
      child.userData.logicElementSceneId = element.id;
      child.userData.logicElementOwnerId = owner && owner.userData && owner.userData.editorId || null;
      child.userData.editorLocked = true;
      child.userData.nonExportable = true;
      child.userData.logicElementRuntimeVisual = true;
    });
    const pawn = owner && owner.userData && owner.userData.logicGraph && owner.userData.logicGraph.playerPawnBlueprint;
    if(pawn){
      if(pawn.meshEdits) applyMeshEdits(model, pawn.meshEdits);
      if(pawn.materials) applyMatProps(model, pawn.materials);
    }
    const vehiclePawn = owner && owner.userData && owner.userData.logicGraph && owner.userData.logicGraph.vehiclePawn;
    const shading = vehiclePawn && vehiclePawn.modelShading || pawn && pawn.modelShading || 'original';
    if(window.LK_RUNTIME_PLAYER_MODEL && window.LK_RUNTIME_PLAYER_MODEL.applyModelShading){
      window.LK_RUNTIME_PLAYER_MODEL.applyModelShading(model, shading, THREE);
    }
    node.add(model);
    configureLogicElementAnimation(node, model, element, owner);
    delete node.userData.logicElementAssetError;
    if(element.id==='character_model'&&owner&&owner.userData){delete owner.userData.characterModelError;owner.userData.characterModelSource=model.userData&&model.userData.lkLogicAssetSourceFallback||'glb';setCharacterPlaceholderVisibility(owner,false);removeCharacterAssetFallback(owner);}
    return node;
  }).catch(error=>{
    const message=String(error&&error.message||error||'Character model load failed');
    node.userData.logicElementAssetError=message;
    if(element.id==='character_model'&&owner&&owner.userData){owner.userData.characterModelError=message;setCharacterPlaceholderVisibility(owner,true);}
    throw error;
  });
}
function sketchbookLogicAssetHierarchyReady(object, graph){
  if(!object || !object.traverse || !graph || !graph.sketchbookPawn) return false;
  const expected = logicElementSceneElements(graph).filter(element => element && element.linked !== false && element.asset).length;
  if(!expected) return false;
  let roots = 0;
  let placeholders = 0;
  object.traverse(node => {
    const data = node && node.userData || {};
    if(data.logicElementAssetPlaceholder) placeholders++;
    if(data.logicElementAssetVisual && !(node.parent && node.parent.userData && node.parent.userData.logicElementAssetVisual)) roots++;
  });
  return placeholders === 0 && roots === expected;
}
function retagLogicElementOwner(object){
  if(!object || !object.traverse || !object.userData) return;
  const ownerId = object.userData.editorId || object.userData.logicInstanceId || null;
  object.traverse(node => {
    if(node && node.userData && node.userData.logicElementInternal) node.userData.logicElementOwnerId = ownerId;
  });
}
function removeLogicElementColliders(object, GAME){
  const refs = object && object.userData && object.userData.logicElementColliderRefs;
  if(!Array.isArray(refs) || !GAME || !GAME.world || !GAME.world.colliders) return;
  refs.forEach(ref => {
    const list = ref && ref.kind === 'circle' ? GAME.world.colliders.circle : GAME.world.colliders.box;
    const index = list && list.indexOf(ref);
    if(index >= 0) list.splice(index, 1);
    const body=ref&&ref.cannonBody;
    if(body){
      if(body.__lkLogicColliderHandler&&body.removeEventListener)body.removeEventListener('collide',body.__lkLogicColliderHandler);
      if(body.__lkLogicColliderRef===ref)body.__lkLogicColliderRef=null;
      body.__lkLogicColliderHandler=null;
      body.logicObject=null;
      ref.cannonBody=null;
    }
    if(ref && ref.owner && ref.owner.userData) delete ref.owner.userData.collider;
  });
  object.userData.logicElementColliderRefs = [];
}
function updateLogicElementColliderRef(ref){
  if(!ref || !ref.owner || !window.THREE) return;
  const node = ref.owner;
  const collider = ref.config || {};
  node.updateMatrixWorld(true);
  const offset = Array.isArray(collider.offset) ? collider.offset : [0,0,0];
  const center = node.localToWorld(new THREE.Vector3(Number(offset[0]) || 0, Number(offset[1]) || 0, Number(offset[2]) || 0));
  const scale = node.getWorldScale(new THREE.Vector3());
  const rotation = new THREE.Euler().setFromQuaternion(node.getWorldQuaternion(new THREE.Quaternion()), 'XYZ');
  ref.x = center.x;
  ref.y = center.y;
  ref.z = center.z;
  ref.rotX = rotation.x;
  ref.rotY = rotation.y;
  ref.rotZ = rotation.z;
  ref.rot = rotation.y;
  if(ref.kind === 'circle'){
    ref.r = Math.max(.01, Number(collider.radius) || .5) * Math.max(Math.abs(scale.x || 1), Math.abs(scale.y || 1), Math.abs(scale.z || 1));
    ref.hy = ref.r;
  } else {
    const size = Array.isArray(collider.size) ? collider.size : [1,1,1];
    ref.hx = Math.max(.005, Math.abs((Number(size[0]) || 1) * (scale.x || 1)) * .5);
    ref.hy = Math.max(.005, Math.abs((Number(size[1]) || 1) * (scale.y || 1)) * .5);
    ref.hz = Math.max(.005, Math.abs((Number(size[2]) || 1) * (scale.z || 1)) * .5);
  }
  const body = ref.cannonBody;
  if(body){
    if(body.position) body.position.set(ref.x, ref.y, ref.z);
    if(body.quaternion) body.quaternion.setFromEuler(ref.rotX || 0, ref.rotY || 0, ref.rotZ || 0, 'XYZ');
    body.aabbNeedsUpdate = true;
    if(body.updateBoundingRadius) body.updateBoundingRadius();
    if(body.wakeUp) body.wakeUp();
  }
}
function updateLogicElementColliderRefs(object){
  const refs = object && object.userData && object.userData.logicElementColliderRefs;
  if(!Array.isArray(refs)) return;
  refs.forEach(updateLogicElementColliderRef);
}
function syncLogicElementColliders(object, elements, nodes){
  const GAME = window.LOT_KING;
  if(!object || !GAME || !GAME.world || !GAME.world.colliders) return;
  removeLogicElementColliders(object, GAME);
  if(!object.parent) return;
  const refs = [];
  (elements || []).forEach(element => {
    const collider = element && element.collider;
    const node = element && nodes && nodes.get(element.id);
    if(!node || !collider || collider.enabled !== true) return;
    const kind = collider.shape === 'sphere' ? 'circle' : 'box';
    const ref = {
      kind,
      owner:node,
      config:cloneData(collider),
      enabled:true,
      physics:false,
      logicElementCollider:true,
      logicElementOwner:object,
      logicElementId:element.id,
    };
    updateLogicElementColliderRef(ref);
    const list = kind === 'circle' ? GAME.world.colliders.circle : GAME.world.colliders.box;
    list.push(ref);
    node.userData.collider = {kind, ref};
    refs.push(ref);
  });
  object.userData.logicElementColliderRefs = refs;
  const rawPhysics = GAME.systems && GAME.systems.physics && GAME.systems.physics.raw;
  if(rawPhysics) rawPhysics.staticsSignature = '';
}

// ------------------------------------------------ Drift Track composite colliders
// The generated track ships a list of local-space wall/cone box specs. They are
// registered as a single compound arcade collider (root.ref.parts) so the whole
// set follows the object transform and world.unregister() cleans it up on delete.
function driftTrackColliderList(GAME){
  return GAME && GAME.world && GAME.world.colliders ? GAME.world.colliders.box : null;
}
function removeDriftTrackColliders(obj, GAME){
  const root = obj && obj.userData && obj.userData.collider && obj.userData.collider.ref;
  const list = driftTrackColliderList(GAME);
  if(!root || !root.driftTrackRoot || !list || !Array.isArray(root.parts)) return;
  root.parts.forEach(part => { const i = list.indexOf(part); if(i >= 0) list.splice(i, 1); });
  root.parts = [];
}
function driftTrackPartWorld(obj, spec, out){
  const w = obj.localToWorld(new THREE.Vector3(Number(spec.x) || 0, Number(spec.y) || 0, Number(spec.z) || 0));
  const worldEuler = new THREE.Euler().setFromQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()), 'XYZ');
  const worldScale = obj.getWorldScale(new THREE.Vector3());
  const sx = Math.abs(worldScale.x || 1), sy = Math.abs(worldScale.y || 1), sz = Math.abs(worldScale.z || 1);
  out.x = w.x; out.y = w.y; out.z = w.z;
  out.hx = Math.max(.02, (Number(spec.hx) || .1) * sx);
  out.hy = Math.max(.02, (Number(spec.hy) || .1) * sy);
  out.hz = Math.max(.02, (Number(spec.hz) || .1) * sz);
  out.rotX = worldEuler.x;
  out.rotY = worldEuler.y + (Number(spec.rotY) || 0);
  out.rotZ = worldEuler.z;
  out.rot = out.rotY;
  return out;
}
function syncDriftTrackColliders(GAME, obj){
  const list = driftTrackColliderList(GAME);
  if(!list || !obj || !window.THREE) return;
  const specs = obj.userData.driftTrackColliderSpecs || [];
  let root = obj.userData.collider && obj.userData.collider.ref;
  if(!root || !root.driftTrackRoot){
    root = {driftTrackRoot:true, owner:obj, enabled:true, physics:false, _boxList:list, parts:[]};
    obj.userData.collider = {kind:'box', ref:root};
  }
  root.owner = obj;
  root.parts.forEach(part => { const i = list.indexOf(part); if(i >= 0) list.splice(i, 1); });
  root.parts = [];
  obj.updateMatrixWorld(true);
  specs.forEach(spec => {
    const part = {owner:obj, parentRef:root, compoundPart:true, driftTrackPart:true, colliderKind:spec.kind, _boxList:list, enabled:root.enabled !== false, physics:false, mass:0};
    driftTrackPartWorld(obj, spec, part);
    root.parts.push(part);
    list.push(part);
  });
  const rawPhysics = GAME.systems && GAME.systems.physics && GAME.systems.physics.raw;
  if(rawPhysics) rawPhysics.staticsSignature = '';
}
function updateDriftTrackColliderRefs(obj){
  const root = obj && obj.userData && obj.userData.collider && obj.userData.collider.ref;
  if(!root || !root.driftTrackRoot || !Array.isArray(root.parts) || !window.THREE) return;
  const specs = obj.userData.driftTrackColliderSpecs || [];
  obj.updateMatrixWorld(true);
  root.parts.forEach((part, i) => {
    const spec = specs[i];
    if(!spec) return;
    driftTrackPartWorld(obj, spec, part);
    part.enabled = root.enabled !== false;
  });
}
function createDriftTrack(props){
  const gen = window.LK_RUNTIME_DRIFT_TRACK;
  if(!gen || !window.THREE){
    const fallback = new THREE.Group();
    fallback.name = 'MinamiDriftPark';
    fallback.userData.driftTrack = true;
    fallback.userData.driftTrackParams = props ? cloneData(props) : {};
    fallback.userData.driftTrackColliderSpecs = [];
    return fallback;
  }
  const params = gen.normalizeParams(props || {});
  const result = gen.build(THREE, params);
  const group = result.group;
  group.userData.driftTrack = true;
  group.userData.driftTrackParams = params;
  group.userData.driftTrackColliderSpecs = result.colliders || [];
  group.userData.driftTrackInfo = {length:result.length, spawn:result.spawn};
  group.userData.editorLocked = false;
  return group;
}
function rebuildDriftTrack(GAME, obj, props){
  if(!obj) return obj;
  const gen = window.LK_RUNTIME_DRIFT_TRACK;
  const params = gen ? gen.normalizeParams(props || obj.userData.driftTrackParams || {}) : (props || obj.userData.driftTrackParams || {});
  Array.from(obj.children).forEach(child => { obj.remove(child); disposeObject3D(child); });
  removeDriftTrackColliders(obj, GAME);
  if(gen && window.THREE){
    const result = gen.build(THREE, params);
    Array.from(result.group.children).forEach(child => obj.add(child));
    obj.userData.driftTrackColliderSpecs = result.colliders || [];
    obj.userData.driftTrackInfo = {length:result.length, spawn:result.spawn};
  }
  obj.userData.driftTrackParams = params;
  syncDriftTrackColliders(GAME, obj);
  return obj;
}
function applyLogicElementPreviewTransform(THREERef, node, element){
  const pos = logicElementElementPosition(element);
  const rot = logicElementElementRotation(element);
  const scale = logicElementElementScale(element);
  node.position.set(pos[0], pos[1], pos[2]);
  node.rotation.set(THREERef.MathUtils.degToRad(rot[0]), THREERef.MathUtils.degToRad(rot[1]), THREERef.MathUtils.degToRad(rot[2]));
  node.scale.set(scale[0], scale[1], scale[2]);
}
function sketchbookStoredAssetRef(value){
  if(value&&typeof value==='object')return cloneData(value);
  const text=String(value==null?'':value).trim();if(!text)return null;
  if(text.charAt(0)==='{')try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==='object')return parsed;}catch(err){}
  return {src:text,name:text.split('/').pop()||'DollBody Pawn GLB',kind:'glb'};
}
function syncSketchbookModelAsset(graph){
  const definition=graph&&graph.sketchbookPawn,scene=graph&&graph.logicScene;if(!definition||!scene)return null;
  const variables=graph.variables||[],assetVariable=variables.find(variable=>variable&&(variable.name==='ModelAsset'||variable.ui==='sketchbook-model-asset'||variable.binding==='modelAsset'||variable.binding==='modelAsset.src'));
  const fitVariable=variables.find(variable=>variable&&(variable.name==='ModelFit'||variable.binding==='modelAsset.fit'));
  const elements=[scene.root].concat(scene.elements||[]),kind=String(definition.kind||definition.type||''),modelElement=elements.find(element=>element&&element.id===kind+'_model')||elements.find(element=>element&&element.asset);
  const current=cloneData(definition.modelAsset||modelElement&&modelElement.asset||{}),selected=sketchbookStoredAssetRef(assetVariable&&assetVariable.value);
  let descriptor=current;if(selected){const sameSource=selected.src&&current.src&&String(selected.src)===String(current.src);descriptor=sameSource?Object.assign({},current,selected):Object.assign({},selected);}
  const fit=Number(fitVariable&&fitVariable.value!=null?fitVariable.value:descriptor&&descriptor.fit!=null?descriptor.fit:current.fit);if(Number.isFinite(fit)&&fit>0)descriptor.fit=fit;
  if(!descriptor.kind)descriptor.kind='glb';definition.modelAsset=cloneData(descriptor);
  if(modelElement){modelElement.asset=cloneData(descriptor);modelElement.linked=true;}
  if(assetVariable){assetVariable.type='asset';assetVariable.binding='modelAsset';assetVariable.ui='sketchbook-model-asset';assetVariable.value=cloneData(descriptor);}
  return descriptor;
}
function syncLogicElementSceneObject(object, graph, opts){
  if(!object || !window.THREE) return object;
  opts = opts || {};
  const THREERef = window.THREE;
  const normalized = ensureLogicElementScene(graph || object.userData.logicGraph || object.userData.addedEntry && object.userData.addedEntry.graph);
  // Template placement stores a graph copy. Upgrade Soccer elements already
  // embedded in levels created with the first modular preset, otherwise a
  // catalog update alone cannot remove its referee cube or add the ball marker.
  if(normalized.name === 'Template - Penalty Shootout Manager' && normalized.logicScene){
    const oldElements = normalized.logicScene.elements || [];
    const legacyCube = oldElements.length === 1 && oldElements[0] &&
      oldElements[0].id === 'root' && (oldElements[0].name === 'Default Mesh' || oldElements[0].mesh === 'box');
    if(legacyCube) normalized.logicScene = {
      root:{id:'root',name:'Penalty Shootout Referee',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#38bdf8'},
      elements:[],
      components:[{id:'root_transform',elementId:'root',name:'Transform',type:'transform',linked:true}],
    };
  }
  if(normalized.name === 'Template - Soccer Ball' && normalized.logicScene){
    const elements = normalized.logicScene.elements || (normalized.logicScene.elements = []);
    if(!elements.some(element => element && element.id === 'ball_preview')){
      elements.push({id:'ball_preview',name:'Soccer Ball Preview',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[0,.11,0],rotation:[0,0,0],scale:[.23,.23,.23],color:'#f8fafc',runtimeVisual:false});
    }
  }
  if(normalized.soccerPawn){
    normalized.soccerPawn.keeper = normalized.soccerPawn.keeper || {};
    if(normalized.soccerPawn.keeper.aiEnabled == null) normalized.soccerPawn.keeper.aiEnabled = normalized.soccerPawn.role === 'goalkeeper';
    if(normalized.soccerPawn.keeper.aiReaction == null) normalized.soccerPawn.keeper.aiReaction = .14;
    if(normalized.soccerPawn.keeper.aiPrediction == null) normalized.soccerPawn.keeper.aiPrediction = 1.15;
    const variables = normalized.variables || (normalized.variables = []);
    const addKeeperVariable = spec => {
      if(!variables.some(variable => variable && (variable.name === spec.name || variable.binding === spec.binding))) variables.push(spec);
    };
    addKeeperVariable({name:'KeeperAI',type:'boolean',value:normalized.soccerPawn.keeper.aiEnabled!==false,exposed:true,binding:'keeper.aiEnabled',label:'Goalkeeper AI',category:'Goalkeeper / AI'});
    addKeeperVariable({name:'KeeperAIReaction',type:'number',value:normalized.soccerPawn.keeper.aiReaction,min:.02,max:.8,step:.01,exposed:true,binding:'keeper.aiReaction',label:'Reaction Time (s)',category:'Goalkeeper / AI'});
    addKeeperVariable({name:'KeeperAIPrediction',type:'number',value:normalized.soccerPawn.keeper.aiPrediction,min:.2,max:2.5,step:.05,exposed:true,binding:'keeper.aiPrediction',label:'Prediction Window (s)',category:'Goalkeeper / AI'});
    // The first Soccer template fired Shoot from a key-down edge. Continuous
    // Action input is required for charge, aim and release, so upgrade embedded
    // copies without touching user-authored nodes with different ids.
    const nodes=normalized.nodes||(normalized.nodes=[]),edges=normalized.edges||(normalized.edges=[]);
    const legacyShootIds=new Set(['on_key_shoot','play_shoot']);
    if(nodes.some(node=>node&&legacyShootIds.has(node.id))){
      normalized.nodes=nodes.filter(node=>!(node&&legacyShootIds.has(node.id)));
      normalized.edges=edges.filter(edge=>!(edge&&(legacyShootIds.has(edge.from&&edge.from.node)||legacyShootIds.has(edge.to&&edge.to.node)||edge.id==='e_key_shoot')));
    }
    if(normalized.nodes.some(node=>node&&node.id==='move_input')&&normalized.nodes.some(node=>node&&node.id==='set_move')&&!normalized.edges.some(edge=>edge&&edge.id==='e_input_action')){
      normalized.edges.push({id:'e_input_action',from:{node:'move_input',pin:'action'},to:{node:'set_move',pin:'action'}});
    }
    normalized.soccerPawn.ball=normalized.soccerPawn.ball||{};
    if(normalized.soccerPawn.ball.shotMinPower==null)normalized.soccerPawn.ball.shotMinPower=10;
    if(normalized.soccerPawn.ball.shotChargeTime==null)normalized.soccerPawn.ball.shotChargeTime=1.15;
    if(normalized.soccerPawn.ball.shotCurve==null)normalized.soccerPawn.ball.shotCurve=.65;
    if(normalized.soccerPawn.ball.aimReticle==null)normalized.soccerPawn.ball.aimReticle=true;
    if(normalized.soccerPawn.ball.aimSlowMotion==null)normalized.soccerPawn.ball.aimSlowMotion=true;
    if(normalized.soccerPawn.ball.aimTimeScale==null)normalized.soccerPawn.ball.aimTimeScale=.18;
    const addShotVariable=spec=>{if(!variables.some(variable=>variable&&(variable.name===spec.name||variable.binding===spec.binding)))variables.push(spec);};
    addShotVariable({name:'ShotMinPower',type:'number',value:normalized.soccerPawn.ball.shotMinPower,min:4,max:25,step:.5,exposed:true,binding:'ball.shotMinPower',label:'Minimum Shot Power (m/s)',category:'Soccer / Shot'});
    addShotVariable({name:'ShotChargeTime',type:'number',value:normalized.soccerPawn.ball.shotChargeTime,min:.3,max:3,step:.05,exposed:true,binding:'ball.shotChargeTime',label:'Full Charge Time (s)',category:'Soccer / Shot'});
    addShotVariable({name:'ShotCurve',type:'number',value:normalized.soccerPawn.ball.shotCurve,min:0,max:1,step:.05,exposed:true,binding:'ball.shotCurve',label:'Maximum Curve',category:'Soccer / Shot'});
    addShotVariable({name:'AimReticle',type:'boolean',value:normalized.soccerPawn.ball.aimReticle!==false,exposed:true,binding:'ball.aimReticle',label:'Show Aim Reticle',category:'Soccer / Shot'});
    addShotVariable({name:'AimSlowMotion',type:'boolean',value:normalized.soccerPawn.ball.aimSlowMotion!==false,exposed:true,binding:'ball.aimSlowMotion',label:'Slow Motion While Aiming',category:'Soccer / Shot'});
    addShotVariable({name:'AimTimeScale',type:'number',value:normalized.soccerPawn.ball.aimTimeScale,min:.02,max:.9,step:.02,exposed:true,binding:'ball.aimTimeScale',label:'Aiming Time Scale',category:'Soccer / Shot'});
  }
  const sketchbookDefinition=normalized.sketchbookPawn;
  if(sketchbookDefinition&&normalized.logicScene)syncSketchbookModelAsset(normalized);
  if(sketchbookDefinition&&(sketchbookDefinition.type==='advanced-character'||sketchbookDefinition.kind==='advanced-character')&&normalized.logicScene&&Number(sketchbookDefinition.animationDefaultVersion||0)<1){
    // Old Sketchbook instances inherited the generic GLB autoplay defaults.
    // With no selected clip that means "play the first animation", which is a
    // seated door/hand sequence in boxman.glb. At runtime that action then
    // competed with locomotion. Migrate only the old default contract; an
    // explicitly authored animation object keeps every value it owns.
    const elements=normalized.logicScene.elements||[];
    const modelElement=elements.find(element=>element&&element.asset&&(element.id==='advanced-character_model'||/boxman\.glb(?:$|[?#])/i.test(String(element.asset.src||''))));
    if(modelElement)modelElement.animation=Object.assign({enabled:true,clip:'idle',autoplay:false,loop:'repeat',speed:1,playInEditor:false},modelElement.animation||{});
    sketchbookDefinition.animationDefaultVersion=1;
  }
  const characterDefinition=normalized.characterPawn||normalized.soccerPawn;
  // Saved Normal Characters predate the shared FPS/TPS player contract.  Bring
  // those instances forward in place so the Author DEMO keeps its model,
  // animations and authored tuning while gaining weapons, inventory and the
  // same-body eye/shoulder view rig.  Vehicle interior cameras remain owned by
  // vehicle possession and are never written into this Character descriptor.
  if(normalized.characterPawn&&window.LK_LOGIC_TEMPLATES_CHARACTER&&window.LK_LOGIC_TEMPLATES_CHARACTER.upgradeLegacyPlayerCharacterGraph){
    window.LK_LOGIC_TEMPLATES_CHARACTER.upgradeLegacyPlayerCharacterGraph(normalized,object.userData&&object.userData.logicVariableOverrides||{});
  }
  // Camera mounts must be generated AFTER the legacy Character upgrade: old
  // Parking Lot saves do not carry `firstPerson` until the call above.
  if(window.LK_LOGIC_GRAPH&&window.LK_LOGIC_GRAPH.ensurePawnCameraRigs)window.LK_LOGIC_GRAPH.ensurePawnCameraRigs(normalized);
  // Old embedded Characters exposed Input Mode but did not persist its matching
  // facing frame. In heading mode that omission formed a feedback loop (turn,
  // reinterpret input from the new heading, turn again) and looked exactly like
  // an invisible wall. Persist a stable pair and expose it to the current level.
  if(characterDefinition&&Number(characterDefinition.movementDirectionDefaultVersion||0)<1){
    const movement=characterDefinition.movement||(characterDefinition.movement={});
    const variables=normalized.variables||(normalized.variables=[]);
    const inputVariable=variables.find(variable=>variable&&variable.binding==='movement.inputMode');
    const inputMode=String(inputVariable&&inputVariable.value||movement.inputMode||'camera').toLowerCase()==='heading'?'heading':'camera';
    if(movement.facingMode!=='heading'&&movement.facingMode!=='movement')movement.facingMode=inputMode==='heading'?'heading':'movement';
    let facingVariable=variables.find(variable=>variable&&variable.binding==='movement.facingMode');
    if(!facingVariable){
      facingVariable={name:'FacingMode',type:'string',value:movement.facingMode,exposed:true,binding:'movement.facingMode',label:'Facing Mode',category:'Movement',ui:'select',options:[{value:'movement',label:'Face movement direction'},{value:'heading',label:'Preserve character / aim heading'}],description:'Heading-relative input should preserve heading. Camera-relative movement may rotate the body toward travel.'};
      variables.push(facingVariable);
    }
    characterDefinition.movementDirectionDefaultVersion=1;
  }
  // Player Pawns used to inherit the Enemy-friendly "never respawn" default.
  // Upgrade embedded levels once, but preserve an explicit inspector override
  // and every unpossessed AI/civilian Character (those must still stay dead).
  if(characterDefinition&&Number(characterDefinition.playerRespawnDefaultVersion||0)<1){
    const playerId=Number(characterDefinition.playerId),vitals=characterDefinition.vitals||(characterDefinition.vitals={});
    const team=String(vitals.team||'player').toLowerCase();
    const playerOwned=Number.isFinite(playerId)&&playerId>=1&&team!=='enemy'&&team!=='civilian';
    const variables=normalized.variables||(normalized.variables=[]);
    const respawnVariable=variables.find(variable=>variable&&variable.binding==='vitals.respawnMode');
    const overrides=object.userData&&object.userData.logicVariableOverrides||{};
    const explicitlyAuthored=!!(respawnVariable&&Object.prototype.hasOwnProperty.call(overrides,respawnVariable.name));
    if(playerOwned&&!explicitlyAuthored&&String(vitals.respawnMode||'none').toLowerCase()==='none'){
      vitals.respawnMode='spawn';
      vitals.respawnOnDeath=true;
      if(respawnVariable&&String(respawnVariable.value||'none').toLowerCase()==='none')respawnVariable.value='spawn';
    }
    characterDefinition.playerRespawnDefaultVersion=1;
  }
  if(characterDefinition&&characterDefinition.abilities&&characterDefinition.abilities.slide){
    const slide=characterDefinition.abilities.slide;
    if(slide.rollDistance==null)slide.rollDistance=Math.max(.1,(Number(slide.rollSpeed)||4.6)*(Number(slide.rollDuration)||.62));
    if(slide.rollPlaybackRate==null)slide.rollPlaybackRate=1;
    const variables=normalized.variables||(normalized.variables=[]);
    const addRollVariable=spec=>{if(!variables.some(variable=>variable&&(variable.name===spec.name||variable.binding===spec.binding)))variables.push(spec);};
    addRollVariable({name:'TpsRollDistance',type:'number',value:slide.rollDistance,min:.1,max:12,step:.05,exposed:true,binding:'abilities.slide.rollDistance',label:'Roll Travel (m)',category:'Traversal',description:'Total forward distance while the authored roll clip plays. Duration is synchronized to the clip.'});
    addRollVariable({name:'TpsRollPlaybackRate',type:'number',value:slide.rollPlaybackRate,min:.25,max:3,step:.05,exposed:true,binding:'abilities.slide.rollPlaybackRate',label:'Roll Animation Speed',category:'Traversal',description:'Playback multiplier for the roll clip; movement duration follows it automatically.'});
  }
  if(characterDefinition){
    characterDefinition.abilities=characterDefinition.abilities||{};
    const wall=characterDefinition.abilities.wallFlip=characterDefinition.abilities.wallFlip||{};
    // v1 was an in-place one-second animation latch. Migrate only that exact
    // untouched default; deliberately authored non-default durations survive.
    if(Number(characterDefinition.wallFlipReboundVersion||0)<1){
      if(wall.duration==null||Math.abs(Number(wall.duration)-1)<.000001)wall.duration=.72;
      characterDefinition.wallFlipReboundVersion=1;
    }
    if(wall.playbackRate==null)wall.playbackRate=1.15;
    if(wall.lift==null)wall.lift=.72;
    if(wall.pushback==null)wall.pushback=.62;
    if(wall.reach==null)wall.reach=.72;
    const variables=normalized.variables||(normalized.variables=[]),addWallVariable=spec=>{if(!variables.some(variable=>variable&&(variable.name===spec.name||variable.binding===spec.binding)))variables.push(spec);};
    addWallVariable({name:'TpsWallFlipDuration',type:'number',value:wall.duration,min:.2,max:2,step:.01,exposed:true,binding:'abilities.wallFlip.duration',label:'Wall Flip Maximum Duration (s)',category:'Traversal',description:'Fits a long source take into this gameplay window.'});
    addWallVariable({name:'TpsWallFlipPlayback',type:'number',value:wall.playbackRate,min:.25,max:4,step:.05,exposed:true,binding:'abilities.wallFlip.playbackRate',label:'Wall Flip Gameplay Playback',category:'Traversal',description:'Multiplier composed with the Motion Set playback rate.'});
    addWallVariable({name:'TpsWallFlipLift',type:'number',value:wall.lift,min:0,max:3,step:.02,exposed:true,binding:'abilities.wallFlip.lift',label:'Wall Flip Upward Rebound (m)',category:'Traversal'});
    addWallVariable({name:'TpsWallFlipPushback',type:'number',value:wall.pushback,min:0,max:3,step:.02,exposed:true,binding:'abilities.wallFlip.pushback',label:'Wall Flip Pushback (m)',category:'Traversal'});
    addWallVariable({name:'TpsWallFlipReach',type:'number',value:wall.reach,min:.2,max:2,step:.02,exposed:true,binding:'abilities.wallFlip.reach',label:'Wall Flip Detection Reach (m)',category:'Traversal'});
  }
  if(characterDefinition&&window.LK_RUNTIME_CLOTH){
    characterDefinition.cloth=window.LK_RUNTIME_CLOTH.normalizeConfig(characterDefinition.cloth||{});
  }
  if(characterDefinition&&normalized.logicScene){
    // Character cameras are real authoring mounts now. They remain editor-only
    // and outside collision/bounds, while their transforms are mirrored into
    // firstPerson config consumed by Play.
    const sceneElements=normalized.logicScene.elements;
    const modelElement=sceneElements.find(element=>element&&element.id==='character_model');
    if(!characterDefinition.model&&modelElement&&modelElement.asset)characterDefinition.model=cloneData(modelElement.asset);
    if(modelElement&&characterDefinition.model){modelElement.asset=cloneData(characterDefinition.model);modelElement.linked=true;const scale=Array.isArray(modelElement.scale)?modelElement.scale:[1,1,1];if(Math.max.apply(Math,scale.map(value=>Math.abs(Number(value)||0)))<.01){modelElement.position=[0,0,0];modelElement.rotation=[0,0,0];modelElement.scale=[1,1,1];}}
    if(!characterDefinition.model&&window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION&&window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION.sceneElements){
      const pose=window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION.sceneElements(characterDefinition.appearance||{});
      pose.forEach(spec=>{let element=sceneElements.find(item=>item&&item.id===spec.id);if(!element){element={};sceneElements.push(element);}Object.assign(element,cloneData(spec),{linked:true});});
    }
  }
  object.userData.logicGraph = normalized;
  disposeLogicElementAnimations(object);
  object.userData.logicAnimationUpdate = dt => {
    const mixers = object.userData.logicElementMixers || [];
    // An active Character Pawn owns its locomotion mixer so animation cannot
    // freeze when the editor/effect hook registry changes. Scene-store keeps
    // driving every other imported animation, including authoring previews.
    // Skipping the matching post hook also prevents applying rig/weapon
    // corrections twice in the same rendered frame.
    const characterOwnsMixer=entry=>!!(entry&&entry.node&&entry.node.userData&&entry.node.userData.logicCharacterLocomotionMixerOwner);
    mixers.forEach(entry => {if(!characterOwnsMixer(entry)&&entry&&entry.mixer)entry.mixer.update(Math.max(0, Number(dt) || 0));});
    mixers.forEach(entry => {if(characterOwnsMixer(entry))return;const post=entry&&entry.node&&entry.node.userData&&entry.node.userData.logicCharacterRigPostUpdate;if(typeof post==='function')post();});
  };
  const old = (object.children || []).filter(child => {
    if(child.userData && (child.userData.logicElementInternal || child.userData.logicElementShell)) return true;
    return object.userData && (object.userData.editorType === 'logicElement' || object.userData.addedEntry && object.userData.addedEntry.kind === 'logicElement');
  });
  old.forEach(child => {
    const detachedCameraVisual=child.userData&&child.userData.pawnCameraVisual;
    if(detachedCameraVisual&&detachedCameraVisual.parent!==child)disposeObject3D(detachedCameraVisual);
    object.remove(child);
    disposeObject3D(child);
  });
  if(object.userData)delete object.userData.characterAssetFallback;
  const elements = logicElementSceneElements(normalized);
  const rootElement = elements.find(element => element && element.id === 'root');
  if(rootElement){
    object.userData.logicElementRootName = rootElement.name || 'Root';
    object.userData.logicElementRootPosition = Array.isArray(rootElement.position) ? rootElement.position.slice() : [0,0,0];
    object.userData.logicElementRootType = rootElement.type || 'mesh';
  }
  const nodes = new Map();
  const assetLoads = [];
  object.userData.pawnCameraDummies=[];
  elements.forEach(element => {
    if(!element || element.linked === false) return;
    const node = createLogicElementPreviewNode(THREERef, element);
    applyLogicElementPreviewTransform(THREERef, node, element);
    node.name = element.name || element.id;
    node.userData.logicElementInternal = true;
    node.userData.logicElementSceneId = element.id;
    node.userData.logicElementSceneType = element.type || 'mesh';
    node.userData.editorName = element.name || element.id;
    node.userData.logicElementOwnerId = object.userData.editorId || null;
    node.userData.editorLocked = true;
    node.userData.nonExportable = true;
    node.userData.logicElementRuntimeVisual = element.runtimeVisual !== false;
    if(element.cameraRigRole){
      node.userData.pawnCameraDummy=true;
      node.userData.pawnCameraRole=element.cameraRigRole;
      node.userData.editorType='pawnCamera';
      node.userData.editorId=(object.userData.editorId||object.userData.logicInstanceId||'logic')+':'+element.id;
      node.userData.editorName=element.name||element.id;
      node.userData.linkParentId=object.userData.editorId||null;
      node.userData.editorLocked=false;
      node.userData.editorOnly=true;
      node.__lkSkipControls=true;
      node.__lkSkipContext=true;
      object.userData.pawnCameraDummies.push(node);
    }
    node.traverse(child => {
      child.userData.logicElementInternal = true;
      child.userData.logicElementSceneId = element.id;
      child.userData.logicElementOwnerId = object.userData.editorId || null;
      child.userData.editorLocked = true;
      child.userData.nonExportable = true;
      if(element.editorOnly===true||element.cameraRigRole)child.userData.editorOnly=true;
      if(element.runtimeVisual === false) child.userData.logicElementRuntimeVisual = false;
      else if(child.userData.logicElementRuntimeVisual == null) child.userData.logicElementRuntimeVisual = !(
        element.type === 'empty' || element.type === 'camera' || (element.type === 'light' && !child.isLight)
      );
    });
    if(element.cameraRigRole&&node.userData.logicElementCameraVisual){
      // Keep the transform node under the Pawn, but detach its render geometry.
      // It is reattached only while THIS camera is selected, so the Character
      // bounds/collider can never include a camera several metres away.
      node.userData.pawnCameraVisual=node.userData.logicElementCameraVisual;
      node.remove(node.userData.pawnCameraVisual);
    }
    nodes.set(element.id, node);
    if(element.asset) assetLoads.push(hydrateLogicElementPreviewAsset(node, element, object));
    else if(element.id === 'vehicle_model' && normalized.vehiclePawn && normalized.vehiclePawn.proceduralFallback && window.LOT_KING && LOT_KING.player && LOT_KING.player.visual){
      if(node.geometry && node.geometry.dispose) node.geometry.dispose();
      if(node.material){
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach(material => { if(material && material.dispose) material.dispose(); });
      }
      node.geometry = new THREERef.BufferGeometry();
      node.material = new THREERef.MeshBasicMaterial({visible:false});
      node.position.set(0,0,0);
      node.rotation.set(0,0,0);
      node.scale.set(1,1,1);
      const fallback = cloneLogicElementAsset(LOT_KING.player.visual);
      Array.from(fallback.children || []).filter(child => {
        if(child.userData && (child.userData.logicVehicleWheelVisual || child.userData.logicVehicleWheelId)) return true;
        const x=Math.abs(Number(child.position && child.position.x)||0), z=Math.abs(Number(child.position && child.position.z)||0);
        return child.type === 'Group' && Math.abs(x-.92)<.08 && Math.abs(z-1.35)<.12;
      }).forEach(child => fallback.remove(child));
      fallback.userData.logicVehicleModel = true;
      fallback.traverse(child => {
        child.userData.logicElementAssetVisual = true;
        child.userData.logicElementInternal = true;
        child.userData.logicElementSceneId = element.id;
        child.userData.logicElementOwnerId = object.userData.editorId || null;
        child.userData.editorLocked = true;
        child.userData.nonExportable = true;
        child.userData.logicElementRuntimeVisual = true;
      });
      node.add(fallback);
      configureLogicElementAnimation(node, fallback, element, object);
    } else if(/^wheel_(?:front|rear)_(?:left|right)$/.test(element.id || '') && normalized.vehiclePawn && normalized.vehiclePawn.proceduralFallback && window.LOT_KING && LOT_KING.player && LOT_KING.player.visual){
      let sourceWheel = null;
      LOT_KING.player.visual.traverse(child => {
        if(!sourceWheel && child.userData && child.userData.logicVehicleWheelId === element.id) sourceWheel = child;
      });
      if(sourceWheel){
        if(node.geometry && node.geometry.dispose) node.geometry.dispose();
        if(node.material){
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          materials.forEach(material => { if(material && material.dispose) material.dispose(); });
        }
        node.geometry = new THREERef.BufferGeometry();
        node.material = new THREERef.MeshBasicMaterial({visible:false});
        node.rotation.set(0,0,0);
        node.scale.set(1,1,1);
        const wheelRig = cloneLogicElementAsset(sourceWheel);
        wheelRig.position.set(0,0,0);
        wheelRig.rotation.set(0,0,0);
        wheelRig.scale.set(1,1,1);
        wheelRig.userData.logicVehicleWheelRig = true;
        wheelRig.traverse(child => {
          child.userData.logicElementAssetVisual = true;
          child.userData.logicElementInternal = true;
          child.userData.logicElementSceneId = element.id;
          child.userData.logicElementOwnerId = object.userData.editorId || null;
          child.userData.editorLocked = true;
          child.userData.nonExportable = true;
          child.userData.logicElementRuntimeVisual = true;
        });
        let brakeDisc = null;
        wheelRig.traverse(child => { if(!brakeDisc && child.userData && child.userData.logicVehicleBrakeDisc) brakeDisc = child; });
        if(brakeDisc && brakeDisc.parent){
          brakeDisc.parent.remove(brakeDisc);
          brakeDisc.userData.logicVehicleBrakeDiscVisual = true;
          node.add(brakeDisc);
        }
        node.add(wheelRig);
      }
    }
  });
  elements.forEach(element => {
    const node = element && nodes.get(element.id);
    if(!node) return;
    const parentId = element.id === 'root' ? null : (element.parentId || 'root');
    const parent = parentId && nodes.get(parentId) ? nodes.get(parentId) : object;
    parent.add(node);
  });
  if(characterDefinition&&characterDefinition.model){
    const hasAuthoredPlaceholder=Array.from(nodes.keys()).some(id=>CHARACTER_PLACEHOLDER_ID.test(String(id||'')));
    if(!hasAuthoredPlaceholder)ensureCharacterAssetFallback(object,nodes.get('root')||object,characterDefinition);
    else setCharacterPlaceholderVisibility(object,true);
  }
  syncLogicElementColliders(object, elements, nodes);
  if(normalized.vehiclePawn && window.LK_RUNTIME_PLAYER_MODEL && window.LK_RUNTIME_PLAYER_MODEL.applyModelShading){
    window.LK_RUNTIME_PLAYER_MODEL.applyModelShading(object, normalized.vehiclePawn.modelShading || 'original', THREERef);
  }
  const assetReady = Promise.allSettled(assetLoads);
  object.userData.logicElementAssetReady = normalized.sketchbookPawn ? assetReady.then(results => {
    const rejected = results.find(result => result && result.status === 'rejected');
    if(rejected) throw rejected.reason;
    return results;
  }) : assetReady;
  return object;
}
function blank(){
  return {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, proceduralWorld:null, player:{}, characterGround:null, characterSoundSetId:null, ui:{}, logic:{levelGraph:defaultLevelLogicGraph()}};
}
function sceneFromProject(data){
  if(!data) return null;
  if(data.format === PROJECT_FORMAT && data.scene) return data.scene;
  if(data.transforms || data.added || data.player || data.env || data.proceduralWorld || data.ui) return data;
  return null;
}
function projectFromScene(scene, meta){
  return {
    format: PROJECT_FORMAT,
    name: PROJECT_NAME,
    version: PROJECT_VERSION,
    game: 'Lot King Browser-Native 3D Engine & Editor',
    savedAt: new Date().toISOString(),
    meta: Object.assign({trackId:'parking-lot', trackName:'Parking Lot'}, meta || {}),
    scene: scene || blank(),
  };
}
function persistenceCanonical(value){
  if(Array.isArray(value)) return value.map(persistenceCanonical);
  if(value && typeof value === 'object'){
    const out = {};
    Object.keys(value).sort().forEach(key => {
      if(value[key] !== undefined) out[key] = persistenceCanonical(value[key]);
    });
    return out;
  }
  return value;
}
function persistenceDifferences(expected, actual, limit){
  const differences = [];
  const max = Math.max(1, Number(limit) || 32);
  const walk = (left, right, path) => {
    if(differences.length >= max) return;
    if(left === right) return;
    if(Number.isNaN(left) && Number.isNaN(right)) return;
    const leftArray = Array.isArray(left), rightArray = Array.isArray(right);
    if(leftArray || rightArray){
      if(!leftArray || !rightArray || left.length !== right.length){ differences.push(path || '$'); return; }
      for(let i = 0; i < left.length; i++) walk(left[i], right[i], (path || '$') + '[' + i + ']');
      return;
    }
    const leftObject = left && typeof left === 'object';
    const rightObject = right && typeof right === 'object';
    if(leftObject || rightObject){
      if(!leftObject || !rightObject){ differences.push(path || '$'); return; }
      const keys = Array.from(new Set(Object.keys(left).concat(Object.keys(right)))).sort();
      keys.forEach(key => walk(left[key], right[key], (path ? path + '.' : '$.') + key));
      return;
    }
    differences.push(path || '$');
  };
  walk(persistenceCanonical(expected), persistenceCanonical(actual), '');
  return differences;
}
function verifyPersistenceRoundTrip(expectedScene, storedOrProject){
  const actualScene = sceneFromProject(storedOrProject) || storedOrProject;
  const differences = persistenceDifferences(expectedScene, actualScene, 48);
  return {ok:differences.length === 0, differences};
}
function parseProject(raw){
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const scene = sceneFromProject(data);
  if(!scene) throw new Error('Formato progetto non valido');
  return data && data.format === PROJECT_FORMAT ? data : projectFromScene(scene, {importedLegacy:true});
}
function isMenuLevelRole(role){
  return role === 'editor-menu' || role === 'game-menu';
}
function projectWithoutEmbeddedLevels(project){
  const copy = cloneData(project);
  if(copy && Object.prototype.hasOwnProperty.call(copy, 'embeddedLevels')) delete copy.embeddedLevels;
  return copy;
}
function collectMenuRoleConfig(){
  const idx = ensureLibrary();
  const config = {version:1};
  idx.levels.forEach(entry => {
    const project = readLevelProject(entry && entry.id);
    const role = project && project.meta && project.meta.levelRole || entry && entry.levelRole || 'gameplay';
    if(!isMenuLevelRole(role) || !project) return;
    const key = role === 'editor-menu' ? 'editorMenu' : 'gameMenu';
    if(config[key]) return;
    config[key] = {
      levelId: normalizeLevelId(entry.id),
      name: entry.name || project.meta && project.meta.trackName || entry.id,
      role,
      sidecar: 'demo/menu-levels/' + role + '.lkep.json',
    };
  });
  return config.editorMenu || config.gameMenu ? config : null;
}
function withMenuRoleConfig(project){
  const menuRoles = collectMenuRoleConfig();
  project.meta = Object.assign({}, project.meta || {});
  const ownRole = isMenuLevelRole(project.meta.levelRole) ? project.meta.levelRole : null;
  if(menuRoles && ownRole === 'editor-menu') delete menuRoles.editorMenu;
  if(menuRoles && ownRole === 'game-menu') delete menuRoles.gameMenu;
  if(menuRoles && (menuRoles.editorMenu || menuRoles.gameMenu)) project.meta.menuRoles = menuRoles;
  else if(Object.prototype.hasOwnProperty.call(project.meta, 'menuRoles')) delete project.meta.menuRoles;
  if(Object.prototype.hasOwnProperty.call(project, 'embeddedLevels')) delete project.embeddedLevels;
  return project;
}
function embeddedLevelVisible(entry, project){
  if(entry && entry.visible === false) return false;
  if(project && project.meta && project.meta.levelVisible === false) return false;
  return true;
}
function installMenuRoleProject(idx, entry, role, project, index){
  if(!idx || !entry || !isMenuLevelRole(role) || !project) return null;
  let levelProject = null;
  try { levelProject = parseProject(project); }
  catch(err){ console.warn('LotKing store: menu role level non valido', err); return null; }
  const meta = levelProject.meta || {};
  const name = entry.name || meta.trackName || meta.levelName || (role === 'editor-menu' ? 'Editor Menu' : 'Game Menu');
  const visible = embeddedLevelVisible(entry, levelProject);
  let id = normalizeLevelId(entry.id || entry.levelId || meta.trackId || name);
  if(!id) id = uniqueLevelId(idx, role + '-' + ((Number(index) || 0) + 1));
  let existing = levelEntry(idx, id);
  if(existing){
    const existingProject = readLevelProject(id);
    const existingRole = existingProject && existingProject.meta && existingProject.meta.levelRole || existing.levelRole || 'gameplay';
    if(!isMenuLevelRole(existingRole)){
      id = uniqueLevelId(idx, id + '-' + role);
      existing = null;
    }
  }
  levelProject = projectWithoutEmbeddedLevels(levelProject);
  levelProject.meta = Object.assign({}, meta, {trackId:id, trackName:name, levelRole:role, levelVisible:visible, menuRoleSidecar:true});
  levelProject.savedAt = entry.savedAt || levelProject.savedAt || new Date().toISOString();
  if(!writeLevelProject(id, levelProject)) return null;
  if(existing){
    existing.name = name;
    existing.levelRole = role;
    existing.savedAt = levelProject.savedAt;
    existing.visible = visible;
  } else {
    idx.levels.push({id, name, levelRole:role, savedAt:levelProject.savedAt, visible});
  }
  return {id, name, role};
}
function embeddedLevelRole(value){
  return value === 'editor-menu' || value === 'game-menu' ? value : 'gameplay';
}
function installEmbeddedLevelProject(idx, entry, index){
  if(!idx || !entry || !entry.project) return null;
  const role = embeddedLevelRole(entry.role || entry.levelRole);
  if(isMenuLevelRole(role)) return installMenuRoleProject(idx, entry, role, entry.project, index);
  let levelProject = null;
  try { levelProject = parseProject(entry.project); }
  catch(err){ console.warn('LotKing store: embedded gameplay level non valido', err); return null; }
  const meta = levelProject.meta || {};
  const name = entry.name || meta.trackName || meta.levelName || ('Gameplay Level ' + ((Number(index) || 0) + 1));
  const visible = embeddedLevelVisible(entry, levelProject);
  let id = normalizeLevelId(entry.id || entry.levelId || meta.trackId || name);
  if(!id) id = uniqueLevelId(idx, name);
  const existing = levelEntry(idx, id);
  levelProject = projectWithoutEmbeddedLevels(levelProject);
  levelProject.meta = Object.assign({}, meta, {trackId:id, trackName:name, levelRole:'gameplay', levelVisible:visible});
  levelProject.savedAt = entry.savedAt || levelProject.savedAt || new Date().toISOString();
  if(!writeLevelProject(id, levelProject)) return null;
  if(existing){
    existing.name = name;
    existing.levelRole = 'gameplay';
    existing.savedAt = levelProject.savedAt;
    existing.visible = visible;
  } else {
    idx.levels.push({id, name, levelRole:'gameplay', savedAt:levelProject.savedAt, visible});
  }
  return {id, name, role:'gameplay'};
}
function installEmbeddedProjectLevels(project){
  const embedded = Array.isArray(project && project.embeddedLevels) ? project.embeddedLevels : [];
  if(!embedded.length) return [];
  const idx = ensureLibrary();
  const installed = [];
  embedded.forEach((entry, index) => {
    if(!entry || !entry.project) return;
    const installedEntry = installEmbeddedLevelProject(idx, entry, index);
    if(installedEntry) installed.push(installedEntry);
  });
  if(installed.length){
    writeIndex(idx);
    syncCatalog();
  }
  return installed;
}
function roleSidecarRefsFromMenuRoles(menuRoles){
  const refs = [];
  if(!menuRoles || typeof menuRoles !== 'object') return refs;
  [['editorMenu', 'editor-menu'], ['gameMenu', 'game-menu']].forEach(pair => {
    const ref = menuRoles[pair[0]];
    if(!ref || typeof ref !== 'object') return;
    const sidecar = ref.sidecar || ref.url || ref.projectUrl || '';
    if(!sidecar) return;
    refs.push(Object.assign({}, ref, {role:pair[1], sidecar}));
  });
  return refs;
}
function sidecarUrl(url){
  const value = String(url || '').trim();
  if(!value) return '';
  if(/^https?:\/\//i.test(value) || value.indexOf('/') === 0) return value;
  return value;
}
function readMenuRoleManifest(){
  return fetch(MENU_ROLE_MANIFEST_URL, {cache:'reload'})
    .then(response => response.ok ? response.json() : null)
    .catch(() => null);
}
function refsFromMenuRoleManifest(manifest){
  if(!manifest || typeof manifest !== 'object') return [];
  if(Array.isArray(manifest.levels)){
    return manifest.levels
      .filter(item => item && isMenuLevelRole(item.role) && (item.sidecar || item.url || item.projectUrl))
      .map(item => Object.assign({}, item, {sidecar:item.sidecar || item.url || item.projectUrl}));
  }
  return roleSidecarRefsFromMenuRoles(manifest.menuRoles || manifest);
}
async function installMenuRoleSidecars(project){
  const metaRefs = roleSidecarRefsFromMenuRoles(project && project.meta && project.meta.menuRoles);
  const projectRole = isMenuLevelRole(project && project.meta && project.meta.levelRole) ? project.meta.levelRole : null;
  const refs = metaRefs.filter(ref => !(projectRole && ref && ref.role === projectRole));
  if(!refs.length) return [];
  const idx = ensureLibrary();
  const installed = [];
  const seen = new Set();
  for(let i = 0; i < refs.length; i++){
    const ref = refs[i];
    const role = isMenuLevelRole(ref && ref.role) ? ref.role : null;
    const url = sidecarUrl(ref && ref.sidecar);
    const key = role + ':' + url;
    if(!role || !url || seen.has(key)) continue;
    seen.add(key);
    try {
      const response = await fetch(url, {cache:'reload'});
      if(!response.ok){
        console.warn('LotKing store: menu role sidecar non trovato "' + url + '" (HTTP ' + response.status + ')');
        continue;
      }
      const sidecarProject = parseProject(await response.text());
      await localizePortableProjectAssets(sidecarProject);
      const entry = installMenuRoleProject(idx, ref, role, sidecarProject, i);
      if(entry) installed.push(entry);
    } catch(err){
      console.warn('LotKing store: menu role sidecar non caricato "' + url + '"', err);
    }
  }
  if(installed.length){
    writeIndex(idx);
    syncCatalog();
  }
  return installed;
}
function exportProject(scene, meta){
  return withMenuRoleConfig(projectFromScene(scene, meta));
}
function exportProjectWithLevels(scene, meta, levels, activeId){
  const root = exportProject(scene, meta);
  const list = Array.isArray(levels) ? levels : [];
  const activeKey = normalizeLevelId(activeId || root.meta && root.meta.trackId);
  const activeEntry = list.find(entry => normalizeLevelId(entry && entry.id) === activeKey);
  if(activeEntry) root.meta = Object.assign({}, root.meta || {}, {levelVisible:activeEntry.visible === false ? false : true});
  const embedded = [];
  list.forEach((entry, index) => {
    if(!entry || !entry.project) return;
    const project = projectWithoutEmbeddedLevels(parseProject(entry.project));
    const projectMeta = project.meta || {};
    const id = normalizeLevelId(entry.id || projectMeta.trackId || ('level-' + (index + 1)));
    if(activeKey && id === activeKey) return;
    const role = embeddedLevelRole(entry.role || entry.levelRole || projectMeta.levelRole);
    const visible = entry.visible === false ? false : embeddedLevelVisible(entry, project);
    project.meta = Object.assign({}, projectMeta, {levelVisible:visible});
    embedded.push({
      id,
      name:entry.name || projectMeta.trackName || projectMeta.levelName || id || ('Level ' + (index + 1)),
      role,
      visible,
      savedAt:entry.savedAt || project.savedAt || null,
      active:!!(activeKey && id === activeKey),
      project,
    });
  });
  if(embedded.length) root.embeddedLevels = embedded;
  return root;
}
function installEmbeddedLogicElementAssets(scene){
  const installed = new Set();
  (scene && Array.isArray(scene.added) ? scene.added : []).forEach(entry => {
    if(!entry || entry.kind !== 'logicElement' || !entry.logicAsset || !entry.logicAsset.id || installed.has(entry.logicAsset.id)) return;
    importLogicElementAsset(entry.logicAsset);
    installed.add(entry.logicAsset.id);
  });
  return installed.size;
}
function importProject(project){
  const parsed = parseProject(project);
  // Establish the imported root as the active level before installing its
  // embedded siblings. On a fresh browser origin, installing siblings first
  // made ensureLibrary choose the newest sibling as active, so the following
  // root save overwrote that level (typically SoccerTest).
  const idx = ensureLibrary();
  const meta = parsed.meta || {};
  const rootName = meta.trackName || meta.levelName || 'Imported Level';
  let rootId = normalizeLevelId(meta.trackId || meta.levelId);
  if(!rootId) rootId = uniqueLevelId(idx, rootName);
  let rootEntry = levelEntry(idx, rootId);
  if(!rootEntry){
    rootEntry = {id:rootId, name:rootName, levelRole:embeddedLevelRole(meta.levelRole), savedAt:parsed.savedAt || new Date().toISOString(), visible:meta.levelVisible === false ? false : true};
    idx.levels.push(rootEntry);
  } else {
    rootEntry.name = rootName;
    rootEntry.levelRole = embeddedLevelRole(meta.levelRole);
    rootEntry.savedAt = parsed.savedAt || rootEntry.savedAt;
    rootEntry.visible = meta.levelVisible === false ? false : true;
  }
  idx.activeId = rootId;
  writeIndex(idx);
  parsed.meta = Object.assign({}, meta, {trackId:rootId, trackName:rootName});
  save(parsed.scene, parsed.meta);
  installEmbeddedProjectLevels(parsed);
  installMenuRoleSidecars(parsed);
  installEmbeddedLogicElementAssets(parsed.scene);
  return parsed;
}
function getLevelLogicGraph(){
  const scene = load() || blank();
  scene.logic = scene.logic || {};
  scene.logic.levelGraph = normalizeLogicGraph(scene.logic.levelGraph, 'Level Logic', 'level');
  return cloneData(scene.logic.levelGraph);
}
function setLevelLogicGraph(graph){
  const project = loadProject();
  const scene = project.scene || blank();
  scene.logic = scene.logic || {};
  scene.logic.levelGraph = normalizeLogicGraph(graph, 'Level Logic', 'level');
  save(scene, project.meta);
  return cloneData(scene.logic.levelGraph);
}
function cloneData(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
function normalizeAngle(value){
  let n = Number(value) || 0;
  while(n <= -Math.PI) n += Math.PI * 2;
  while(n > Math.PI) n -= Math.PI * 2;
  return n;
}
function angleDistance(a, b){
  return Math.abs(normalizeAngle((Number(a) || 0) - (Number(b) || 0)));
}
function isDataUrl(value){
  return typeof value === 'string' && /^data:/i.test(value);
}
function dataUrlToBlob(dataUrl){
  return fetch(dataUrl).then(response => response.blob());
}
function demoAssetDbKey(label, dataUrl){
  const mimeMatch = /^data:([^;,]+)/i.exec(dataUrl || '');
  const mime = mimeMatch ? mimeMatch[1].toLowerCase() : '';
  const ext = mime.indexOf('gltf') >= 0 || mime.indexOf('model') >= 0 ? '.glb'
    : mime.indexOf('png') >= 0 ? '.png'
    : mime.indexOf('jpeg') >= 0 || mime.indexOf('jpg') >= 0 ? '.jpg'
    : mime.indexOf('webp') >= 0 ? '.webp'
    : mime.indexOf('gif') >= 0 ? '.gif'
    : '.asset';
  return 'online-demo:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 8) + ':' + normalizeName(label || 'asset').replace(/\s+/g, '-') + ext;
}
async function moveDataUrlToAssetDb(owner, prop, label, dbProp){
  if(!owner || !isDataUrl(owner[prop])) return;
  const dataUrl = owner[prop];
  // Deduplicated portable projects deliberately keep their original key on
  // the single reference that carries the payload. Reusing it lets all the
  // key-only references resolve without cloning the same blob.
  const keyProp = dbProp || 'dbKey';
  const dbKey = owner[keyProp] || owner.dbKey || (owner.asset && owner.asset.dbKey) || demoAssetDbKey(label, dataUrl);
  const blob = await dataUrlToBlob(dataUrl);
  await assetBlobPut(dbKey, blob);
  owner[prop] = null;
  owner[keyProp] = dbKey;
  if(owner.asset && typeof owner.asset === 'object') owner.asset.dbKey = dbKey;
}
async function localizePortableObjectAssets(value, path, seen, depth){
  if(!value || typeof value !== 'object' || (depth || 0) > 24) return;
  seen = seen || new WeakSet();
  if(seen.has(value)) return;
  seen.add(value);
  if(Array.isArray(value)){
    for(let i = 0; i < value.length; i++){
      const childPath = (path || 'asset') + '[' + i + ']';
      const child = value[i];
      if(typeof child === 'string' && child.trim().charAt(0) === '{' && /"(?:src|url|modelSrc|dbKey|modelDbKey)"\s*:/.test(child)){
        let parsed = null;
        try { parsed = JSON.parse(child); } catch(err){}
        if(parsed){
          await localizePortableObjectAssets(parsed, childPath, seen, (depth || 0) + 1);
          value[i] = JSON.stringify(parsed);
        }
      } else {
        await localizePortableObjectAssets(child, childPath, seen, (depth || 0) + 1);
      }
    }
    return;
  }
  const label = value.name || value.fileName || value.id || path || 'asset';
  if(isDataUrl(value.modelSrc)) await moveDataUrlToAssetDb(value, 'modelSrc', label, 'modelDbKey');
  if(isDataUrl(value.src)) await moveDataUrlToAssetDb(value, 'src', label, 'dbKey');
  if(isDataUrl(value.url)) await moveDataUrlToAssetDb(value, 'url', label, 'dbKey');
  for(const key of Object.keys(value)){
    const child = value[key];
    if(typeof child === 'string' && child.trim().charAt(0) === '{' && /"(?:src|url|modelSrc|dbKey|modelDbKey)"\s*:/.test(child)){
      let parsed = null;
      try { parsed = JSON.parse(child); } catch(err){}
      if(parsed){
        await localizePortableObjectAssets(parsed, (path || 'asset') + '.' + key, seen, (depth || 0) + 1);
        value[key] = JSON.stringify(parsed);
      }
    } else if(child && typeof child === 'object'){
      await localizePortableObjectAssets(child, (path || 'asset') + '.' + key, seen, (depth || 0) + 1);
    }
  }
}
async function localizePortableProjectAssets(project, depth){
  const scene = project && sceneFromProject(project);
  if(!scene) return project;
  if(scene.player) await moveDataUrlToAssetDb(scene.player, 'modelSrc', scene.player.modelName || 'player-model', 'modelDbKey');
  if(Array.isArray(scene.added)){
    for(const entry of scene.added){
      if(!entry) continue;
      if(entry.kind === 'glb') await moveDataUrlToAssetDb(entry, 'src', entry.name || entry.id || 'glb', 'dbKey');
      if(entry.kind === 'texture' && entry.props){
        await moveDataUrlToAssetDb(entry.props, 'src', entry.name || entry.id || 'texture', 'dbKey');
        // Older exports could retain an obsolete catalog dbKey in entry.asset
        // while the actual decal payload lived in props.src. Keep authoring
        // metadata aligned with the hydrated runtime reference so the atomic
        // audit does not treat that dead alias as a second required blob.
        if(entry.asset && entry.props.dbKey){
          entry.asset.dbKey = entry.props.dbKey;
          entry.asset.src = null;
        }
      }
      if(entry.kind === 'logicElement'){
        const logicScene = entry.graph && entry.graph.logicScene;
        const elements = logicScene ? [logicScene.root].concat(logicScene.elements || []) : [];
        for(const element of elements){
          if(element && element.asset) await moveDataUrlToAssetDb(element.asset, 'src', element.name || element.id || 'logic-mesh', 'dbKey');
        }
        const assetScene = entry.logicAsset && entry.logicAsset.graph && entry.logicAsset.graph.logicScene;
        const assetElements = assetScene ? [assetScene.root].concat(assetScene.elements || []) : [];
        for(const element of assetElements){
          if(element && element.asset) await moveDataUrlToAssetDb(element.asset, 'src', element.name || element.id || 'logic-asset-mesh', 'dbKey');
        }
      }
    }
  }
  const musicLibraries = scene.ui && scene.ui.musicLibraries;
  if(musicLibraries){
    for(const groupName of ['radio', 'loading', 'menu', 'editorMenu', 'gameMenu']){
      const tracks = Array.isArray(musicLibraries[groupName]) ? musicLibraries[groupName] : [];
      for(const track of tracks){
        await moveDataUrlToAssetDb(track, 'url', track.fileName || track.title || track.id || 'music-track', 'dbKey');
      }
    }
  }
  // Imported project snapshots may contain asset references deeper inside
  // logic blueprints (for example vehiclePawn.modelSrc). Localize every
  // remaining data URL before writing the project to LocalStorage, otherwise
  // a complete multi-level project can exceed the browser quota.
  await localizePortableObjectAssets(scene, 'scene', new WeakSet(), 0);
  const embedded = (depth || 0) < 3 && Array.isArray(project && project.embeddedLevels) ? project.embeddedLevels : [];
  for(const entry of embedded){
    if(entry && entry.project) await localizePortableProjectAssets(entry.project, (depth || 0) + 1);
  }
  return project;
}
async function localizeBundledMenuRoleAssets(project){
  if(!project) return project;
  const candidates = [];
  if(isMenuLevelRole(project.meta && project.meta.levelRole)) candidates.push(project);
  (Array.isArray(project.embeddedLevels) ? project.embeddedLevels : []).forEach(entry => {
    const embedded = entry && entry.project;
    const role = entry && (entry.role || entry.levelRole) || embedded && embedded.meta && embedded.meta.levelRole;
    if(embedded && isMenuLevelRole(role)) candidates.push(embedded);
  });
  // Depth 3 deliberately prevents a menu level from recursively preparing
  // unrelated embedded gameplay levels. The landing only needs its ROLE scene.
  for(const candidate of candidates) await localizePortableProjectAssets(candidate, 3);
  return project;
}
function isLocalOrigin(){
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}
function hasLocalMenuRoleProject(){
  const idx = readIndex();
  return idx.levels.some(entry => {
    const project = entry && readLevelProject(entry.id);
    // An interrupted browser save can leave the small index entry behind after
    // its actual project record disappeared. Such an orphan is not a usable
    // menu and must not suppress the bundled ROLE fallback.
    const role = project && project.meta && project.meta.levelRole;
    return !!project && isMenuLevelRole(role);
  });
}
function shouldUseBundledDemoProject(){
  try {
    if(window.__LK_STANDALONE_EDITOR && window.LK_PROJECT_WORKSPACE
      && typeof window.LK_PROJECT_WORKSPACE.shouldOpenAuthorDemoByDefault === 'function'){
      return window.LK_PROJECT_WORKSPACE.shouldOpenAuthorDemoByDefault();
    }
    const workspace = JSON.parse(localStorage.getItem('lk.projectWorkspace.v1') || 'null');
    if(window.__LK_STANDALONE_EDITOR && (!workspace || workspace.workspaceReady !== true)) return false;
    if(workspace && workspace.startupTemplate === 'demo') return true;
    if(isLocalOrigin()){
      // Keep the author's current local ROLE level when it exists. A new LAN
      // browser has no such level yet, so its menu iframe must use the published
      // DEMO immediately instead of showing the fallback world until refresh.
      // The landing background is an exported DEMO role, not whichever local
      // authoring level happened to be active yesterday. Local ROLE projects
      // remain editable in the workspace but never replace the published menu.
      if(window.__LK_MENU_PREVIEW) return true;
      return false;
    }
    return !workspace || workspace.onlineEditor !== true || workspace.startupTemplate === 'demo';
  } catch(err){ return true; }
}
function normalizeName(s){
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function objectLocalVisualBox(obj){
  if(!obj || !window.THREE) return null;
  obj.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const localBox = new THREE.Box3();
  const points = [
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  ];
  if(obj.traverse){
    obj.traverse(node => {
      if(!node || !node.isMesh || !node.geometry) return;
      for(let current = node; current; current = current.parent){
        if(current.visible === false) return;
        if(current === obj) break;
      }
      const data=node.userData||{},authoredLogicVisual=data.logicElementInternal&&data.logicElementRuntimeVisual!==false;
      if(data.colliderPreview || data.editorOnly || (data.nonExportable&&!authoredLogicVisual) || data.lightPickHandle) return;
      if(!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      const bb = node.geometry.boundingBox;
      if(!bb || bb.isEmpty()) return;
      const min = bb.min, max = bb.max;
      points[0].set(min.x, min.y, min.z);
      points[1].set(max.x, min.y, min.z);
      points[2].set(min.x, max.y, min.z);
      points[3].set(max.x, max.y, min.z);
      points[4].set(min.x, min.y, max.z);
      points[5].set(max.x, min.y, max.z);
      points[6].set(min.x, max.y, max.z);
      points[7].set(max.x, max.y, max.z);
      points.forEach(p => localBox.expandByPoint(p.applyMatrix4(node.matrixWorld).applyMatrix4(rootInverse)));
    });
  }
  if(!localBox.isEmpty()) return {box: localBox, world: false};
  const worldBox = new THREE.Box3().setFromObject(obj);
  return worldBox.isEmpty() ? null : {box: worldBox, world: true};
}
function objectLocalMeshBoxes(obj){
  if(!obj || !window.THREE) return [];
  obj.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const boxes = [];
  const points = [
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  ];
  if(!obj.traverse) return boxes;
  obj.traverse(node => {
    if(!node || !node.isMesh || !node.geometry) return;
    for(let current = node; current; current = current.parent){
      if(current.visible === false) return;
      if(current === obj) break;
    }
    const data=node.userData||{},authoredLogicVisual=data.logicElementInternal&&data.logicElementRuntimeVisual!==false;
    if(data.colliderPreview || data.editorOnly || (data.nonExportable&&!authoredLogicVisual) || data.lightPickHandle) return;
    if(!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    const bb = node.geometry.boundingBox;
    if(!bb || bb.isEmpty()) return;
    const localBox = new THREE.Box3();
    const min = bb.min, max = bb.max;
    points[0].set(min.x, min.y, min.z);
    points[1].set(max.x, min.y, min.z);
    points[2].set(min.x, max.y, min.z);
    points[3].set(max.x, max.y, min.z);
    points[4].set(min.x, min.y, max.z);
    points[5].set(max.x, min.y, max.z);
    points[6].set(min.x, max.y, max.z);
    points[7].set(max.x, max.y, max.z);
    points.forEach(p => localBox.expandByPoint(p.applyMatrix4(node.matrixWorld).applyMatrix4(rootInverse)));
    if(!localBox.isEmpty()) boxes.push({
      box: localBox,
      name: node.name || (node.parent && node.parent.name) || ('Mesh ' + (boxes.length + 1)),
      uuid: node.uuid,
    });
  });
  return boxes;
}
function colliderBoxList(ref){
  if(ref && ref._boxList) return ref._boxList;
  const game = window.LOT_KING;
  return game && game.world && game.world.colliders ? game.world.colliders.box : null;
}
function removeCompoundColliderParts(ref){
  if(!ref || !ref.parts) return;
  const list = colliderBoxList(ref);
  if(list){
    ref.parts.forEach(part => {
      const i = list.indexOf(part);
      if(i >= 0) list.splice(i, 1);
    });
  }
  ref.parts = [];
  ref.compoundRoot = false;
}
function colliderPartShape(shape, index, name){
  if(!shape) return {};
  if(!Array.isArray(shape.parts)) shape.parts = [];
  if(!shape.parts[index]) shape.parts[index] = {};
  if(name && !shape.parts[index].name) shape.parts[index].name = name;
  return shape.parts[index];
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
          .map(entry => Object.assign({}, entry, {
            id: normalizeLevelId(entry && entry.id),
            visible: entry && entry.visible === false ? false : true,
          }))
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
    if(raw) return parseProject(JSON.parse(raw));
    // The active level already lives in KEY. Keeping a second byte-for-byte
    // copy under LEVEL_PREFIX can double storage for the largest scene and
    // exhaust LocalStorage even though every asset payload is in IndexedDB.
    const idx = readIndex();
    if(normalizeLevelId(idx.activeId) === id){
      const activeRaw = localStorage.getItem(KEY);
      return activeRaw ? parseProject(JSON.parse(activeRaw)) : null;
    }
    return null;
  } catch(err){ console.warn('LotKing store: livello "' + id + '" corrotto', err); return null; }
}
function writeLevelProject(id, project){
  id = normalizeLevelId(id);
  try { localStorage.setItem(LEVEL_PREFIX + id, JSON.stringify(project)); return true; }
  catch(err){ console.warn('LotKing store: livello "' + id + '" non salvato (quota?)', err); return false; }
}

function isPublishedGameplayRuntime(){
  return shouldUseBundledDemoProject() && !window.__LK_STANDALONE_EDITOR && !window.__LK_MENU_PREVIEW;
}

function resetPublishedDemoLibrary(force){
  if(!force && !isPublishedGameplayRuntime()) return;
  const keys = [];
  try {
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(key && key.indexOf(LEVEL_PREFIX) === 0) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
    localStorage.removeItem(LEVELS_KEY);
  } catch(err){
    console.warn('LotKing demo: catalogo pubblicato non ripulito completamente', err);
  }
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
        visible: meta.levelVisible === false ? false : true,
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

async function installBundledDemoProject(project){
  if(!project) return null;
  const parsed = parseProject(project);
  const meta = parsed.meta || {};
  const name = meta.trackName || meta.levelName || 'Online Demo';
  const id = BUNDLED_DEMO_LEVEL_ID;
  const savedAt = parsed.savedAt || new Date().toISOString();
  parsed.meta = Object.assign({}, meta, {trackId:id, trackName:name, onlineDemo:true});
  parsed.savedAt = savedAt;
  if(!bundledDemoProjectCache) bundledDemoProjectCache = parsed;
  // Never install a half-hydrated snapshot. A previous best-effort catch let
  // the first visit apply whichever assets happened to reach IndexedDB; the
  // refresh then looked correct only because that partial visit had warmed the
  // database. Hydration is now verified and retried before catalog mutation.
  await hydrateBundledProjectAssets(parsed, 'gameplay');
  // A hosted/static playable is a published snapshot: levels left in this
  // origin by an older FTP upload must not leak into the current catalog.
  // Reaching this installer means the bundled author snapshot was explicitly
  // requested (first hosted visit or "Open author DEMO"). Replace only the
  // origin-scoped level library; browser project copies remain private and
  // independent. The workspace state may already have switched to writable
  // browser mode by this point, so this reset must not depend on that state.
  resetPublishedDemoLibrary(true);
  installEmbeddedProjectLevels(parsed);
  try {
    await installMenuRoleSidecars(parsed);
  } catch(err){
    console.warn('LotKing demo: sidecar menu role non installati', err);
  }
  const idx = readIndex();
  let entry = levelEntry(idx, id);
  const visible = parsed.meta && parsed.meta.levelVisible === false ? false : true;
  if(!entry){
    entry = {id, name, savedAt, visible};
    idx.levels.unshift(entry);
  }
  entry.name = name;
  entry.savedAt = savedAt;
  entry.levelRole = parsed.meta && parsed.meta.levelRole || 'gameplay';
  entry.visible = visible;
  entry.tag = 'ONLINE DEMO';
  writeLevelProject(id, parsed);
  const requestedId = normalizeLevelId(bundledDemoRequestedLevelId);
  const requestedEntry = requestedId && levelEntry(idx, requestedId);
  const requestedProject = requestedEntry && readLevelProject(requestedId);
  idx.activeId = requestedProject ? requestedId : id;
  try { localStorage.setItem(KEY, JSON.stringify(requestedProject || parsed)); } catch(err){}
  writeIndex(idx);
  syncCatalog();
  return parsed;
}

function menuPreviewRoles(){
  return window.__LK_MENU_PREVIEW === 'game'
    ? ['game-menu','editor-menu']
    : ['editor-menu','game-menu'];
}
async function loadBundledMenuPreviewProject(){
  reportBundledDemoProgress({progress:8, step:'locating lightweight role menu'});
  const manifest = await readMenuRoleManifest();
  const refs = refsFromMenuRoleManifest(manifest);
  let selected = null;
  for(const role of menuPreviewRoles()){
    selected = refs.find(ref => ref && ref.role === role);
    if(selected) break;
  }
  if(!selected) return null;
  const baseUrl = sidecarUrl(selected.sidecar || selected.url || selected.projectUrl);
  if(!baseUrl) return null;
  const separator = baseUrl.indexOf('?') >= 0 ? '&' : '?';
  const url = baseUrl + separator + 'v=' + MENU_ROLE_CACHE_VERSION;
  const text = await fetchTextWithProgress(url, 10, 42, 'downloading lightweight role menu');
  if(!text) return null;
  reportBundledDemoProgress({progress:54, step:'parsing lightweight role menu', url});
  const project = parseProject(text);
  const meta = project.meta || {};
  const role = isMenuLevelRole(selected.role) ? selected.role : meta.levelRole;
  const id = normalizeLevelId(selected.id || selected.levelId || meta.trackId || role);
  const name = selected.name || meta.trackName || meta.levelName || (role === 'editor-menu' ? 'Editor Menu' : 'Game Menu');
  project.meta = Object.assign({}, meta, {trackId:id, trackName:name, levelRole:role, onlineDemo:true, menuRoleSidecar:true});
  bundledDemoProjectCache = project;
  reportBundledDemoProgress({progress:58, step:'preparing lightweight role menu assets', url});
  await hydrateBundledProjectAssets(project, 'role menu');
  reportBundledDemoProgress({progress:64, step:'lightweight role menu ready', url});
  return project;
}
function loadBundledFullDemoProject(options){
  const opts=options||{};
  const url = bundledDemoProjectUrl();
  return fetchTextWithProgress(url, 8, 42, 'downloading demo project')
    .then(async text => {
      if(!text) return null;
      const splitProject = window.LK_RUNTIME_SPLIT_PROJECT;
      if(splitProject && splitProject.resolveText){
        text = await splitProject.resolveText(text, new URL(url, location.href).href, (ratio, file) => {
          reportBundledDemoProgress({
            progress:42 + Math.round(Math.max(0, Math.min(1, ratio)) * 11),
            step:'assembling demo project parts',
            file,
            url,
          });
        });
      }
      reportBundledDemoProgress({progress:54, step:'parsing demo project', url});
      const project = parseProject(text);
      const meta = project.meta || {};
      const name = meta.trackName || meta.levelName || 'Online Demo';
      const savedAt = project.savedAt || new Date().toISOString();
      project.meta = Object.assign({}, meta, {trackId:BUNDLED_DEMO_LEVEL_ID, trackName:name, projectName:name, onlineDemo:true});
      project.savedAt = savedAt;
      bundledDemoProjectCache = project;
      reportBundledDemoProgress({progress:60, step:'demo project ready in memory', url});
      if(!opts.memoryOnly&&window.LK_PROJECT_WORKSPACE && LK_PROJECT_WORKSPACE.markDemoSession){
        LK_PROJECT_WORKSPACE.markDemoSession();
      }
      if(!opts.memoryOnly&&window.LK_PROJECT_WORKSPACE && LK_PROJECT_WORKSPACE.consumeStartupTemplate){
        LK_PROJECT_WORKSPACE.consumeStartupTemplate('demo');
      }
      // The landing iframe reads the authoritative DEMO in memory. Installing
      // it into the author's Local Workspace DB would generate cross-frame
      // storage events and could reload the menu while its renderer is alive.
      if(!opts.memoryOnly)await installBundledDemoProject(cloneData(project));
      const scene = sceneFromProject(project);
      if(scene){
        const player = scene && scene.player;
        const playerRef = player && (player.modelSrc || player.modelDbKey) ? 'player model present' : 'player model missing';
        console.info('LotKing demo: bundled LKEP loaded from ' + url + ' · ' + ((scene && scene.added && scene.added.length) || 0) + ' added · ' + playerRef);
      }
      return project;
    });
}
function ensureBundledDemoProject(){
  if(!shouldUseBundledDemoProject()) return Promise.resolve(null);
  if(bundledDemoReady) return bundledDemoReady;
  try {
    bundledDemoRequestedLevelId = sessionStorage.getItem('lk.autolaunch') || sessionStorage.getItem('lk.playableActive') || null;
  } catch(err){}
  const isMenuPreviewFrame = !!(window.__LK_MENU_PREVIEW && window.parent && window.parent !== window);
  bundledDemoReady = (isMenuPreviewFrame
    ? loadBundledFullDemoProject({memoryOnly:true}).then(project => project || loadBundledMenuPreviewProject())
    : loadBundledFullDemoProject())
    .catch(err => {
      console.warn('LotKing demo: bundled LKEP not loaded', err);
      // Fail closed. Falling through to the procedural parking lot made a
      // broken/cold DEMO look like a valid but obsolete level.
      throw err;
    });
  return bundledDemoReady;
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
        idx.levels.push({id, name, savedAt: project.savedAt || new Date().toISOString(), visible:meta.levelVisible === false ? false : true});
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
    idx.levels.push({id, name: meta.trackName || id, savedAt: project.savedAt, visible:meta.levelVisible === false ? false : true});
    idx.activeId = id;
  }
  const entry = levelEntry(idx, id);
  if(!entry) return false;
  if(meta.trackName) entry.name = meta.trackName;
  entry.savedAt = project.savedAt || new Date().toISOString();
  if(meta.levelVisible === false) entry.visible = false;
  else if(!Object.prototype.hasOwnProperty.call(entry, 'visible')) entry.visible = true;
  const copy = Object.assign({}, project, {meta: Object.assign({}, meta, {trackId: id, trackName: entry.name})});
  // save() has already committed this exact project to KEY. The active level
  // is an alias of that slot, not a second full LocalStorage allocation.
  try { localStorage.removeItem(LEVEL_PREFIX + id); }
  catch(err){ console.warn('LotKing store: active level duplicate not removed', err); }
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
  if(player.skids) score += 8 + JSON.stringify(player.skids).length / 240;
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
function readLogicElementAssets(){
  try {
    const raw = localStorage.getItem(LOGIC_ELEMENT_ASSETS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const items = parsed && Array.isArray(parsed.items) ? parsed.items : [];
    return items.filter(item => item && typeof item === 'object').map(item => normalizeLogicElementAssetRecord(item));
  } catch(err){ return []; }
}
function writeLogicElementAssets(items){
  try {
    const normalized = (Array.isArray(items) ? items : []).filter(item => item && typeof item === 'object').map(item => normalizeLogicElementAssetRecord(item));
    localStorage.setItem(LOGIC_ELEMENT_ASSETS_KEY, JSON.stringify({version:1, items:normalized}));
    return true;
  } catch(err){
    console.warn('LotKing store: Logic Element assets non salvati', err);
    return false;
  }
}
function normalizeLogicElementAssetRecord(asset, fallbackName){
  const source = asset && typeof asset === 'object' ? cloneData(asset) : {};
  const name = String(source.name || fallbackName || 'Logic Element').trim() || 'Logic Element';
  const graph = ensureLogicElementScene(normalizeLogicGraph(source.graph || source.logic, name, 'element'));
  const normalizeAsset = window.LK_LOGIC_GRAPH && window.LK_LOGIC_GRAPH.normalizeDefinitionAsset;
  const normalized = normalizeAsset
    ? normalizeAsset(Object.assign({}, source, {name, graph}), name, 'element')
    : Object.assign({}, source, {
      name,
      kind:'logic-element-definition',
      definitionVersion:1,
      graph,
      dependencies:[],
    });
  normalized.name = String(normalized.name || name).trim() || 'Logic Element';
  normalized.kind = 'logic-element-definition';
  normalized.graph = ensureLogicElementScene(normalizeLogicGraph(normalized.graph, normalized.name, 'element'));
  normalized.definitionVersion = Number(normalized.definitionVersion) || (window.LK_LOGIC_GRAPH && window.LK_LOGIC_GRAPH.DEFINITION_VERSION || 1);
  normalized.dependencies = window.LK_LOGIC_GRAPH && window.LK_LOGIC_GRAPH.collectGraphDependencies
    ? window.LK_LOGIC_GRAPH.collectGraphDependencies(normalized.graph)
    : (Array.isArray(normalized.dependencies) ? normalized.dependencies : []);
  if(source.id) normalized.id = String(source.id);
  if(source.createdAt) normalized.createdAt = source.createdAt;
  if(source.updatedAt) normalized.updatedAt = source.updatedAt;
  return normalized;
}
function logicElementAssetById(id){
  const asset = readLogicElementAssets().find(item => item && item.id === id);
  return asset ? cloneData(asset) : null;
}
function saveLogicElementAsset(name, graph, opts){
  const options = opts || {};
  const items = readLogicElementAssets();
  const id = options.id || ('lea_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7));
  const previous = items.find(item => item && item.id === id);
  const normalizedGraph = ensureLogicElementScene(normalizeLogicGraph(graph, name || 'Logic Element', 'element'));
  const asset = normalizeLogicElementAssetRecord({
    id,
    name:String(name || previous && previous.name || 'Logic Element').trim() || 'Logic Element',
    kind:'logic-element-definition',
    definitionVersion:window.LK_LOGIC_GRAPH && window.LK_LOGIC_GRAPH.DEFINITION_VERSION || 1,
    migration:options.migration || previous && previous.migration || undefined,
    graph:normalizedGraph,
    createdAt:options.createdAt || previous && previous.createdAt || new Date().toISOString(),
    updatedAt:options.updatedAt || new Date().toISOString(),
  });
  const index = items.findIndex(item => item && item.id === id);
  if(index >= 0) items[index] = asset;
  else items.push(asset);
  return writeLogicElementAssets(items) ? cloneData(asset) : null;
}
function importLogicElementAsset(asset){
  if(!asset || !asset.id || !asset.graph) return null;
  const incoming = normalizeLogicElementAssetRecord(asset);
  const current = logicElementAssetById(incoming.id);
  const currentTime = current && Date.parse(current.updatedAt || '') || 0;
  const incomingTime = Date.parse(incoming.updatedAt || '') || 0;
  if(current && currentTime > incomingTime) return current;
  return saveLogicElementAsset(incoming.name, incoming.graph, {
    id:incoming.id,
    createdAt:incoming.createdAt,
    updatedAt:incoming.updatedAt || new Date().toISOString(),
    migration:incoming.migration,
  });
}
function deleteLogicElementAsset(id){
  return writeLogicElementAssets(readLogicElementAssets().filter(item => item && item.id !== id));
}
function applyLogicVariableOverrides(graph, overrides){
  const normalized = ensureLogicElementScene(normalizeLogicGraph(graph, graph && graph.name || 'Logic Element', 'element'));
  const values = overrides && typeof overrides === 'object' ? overrides : {};
  normalized.variables.forEach(variable => {
    if(variable.exposed === true && Object.prototype.hasOwnProperty.call(values, variable.name)){
      variable.value = cloneData(values[variable.name]);
    }
  });
  return normalized;
}
function resolveLogicElementGraph(source, fallbackName){
  source = source || {};
  const assetId = source.logicAssetId || null;
  const linked = source.logicLinked !== false && !!assetId;
  const embedded = source.logicAsset && source.logicAsset.id === assetId ? source.logicAsset : null;
  const asset = linked ? (logicElementAssetById(assetId) || embedded) : null;
  const base = asset && asset.graph || source.graph || source.logic || defaultLevelLogicGraph();
  const overrides = source.variableOverrides || source.logicVariableOverrides || {};
  return applyLogicVariableOverrides(normalizeLogicGraph(base, fallbackName || asset && asset.name || 'Logic Element', 'element'), linked ? overrides : {});
}
function logicElementAssetsApi(){
  return {
    list:() => readLogicElementAssets().map(cloneData),
    get:logicElementAssetById,
    saveAsset:saveLogicElementAsset,
    importAsset:importLogicElementAsset,
    deleteAsset:deleteLogicElementAsset,
    resolveGraph:resolveLogicElementGraph,
    applyOverrides:applyLogicVariableOverrides,
  };
}
// ------------------------------------------------ engine sound sets (asset audio veicolo)
// Set piccoli (solo JSON: path dei sample + parametri) salvati inline nell'indice.
// La libreria e' identica per i set motore (veicoli) e per i Character Sound
// Set (passi, armi, foley): stesso CRUD, stesso storage, solo chiave e default
// diversi. Una fabbrica sola evita due copie che divergono.
function createSoundSetLibrary(options){
  const storageKey = options.key;
  const slugBase = options.slug || 'sound-set';
  const label = options.label || 'Sound Set';
  const defaults = options.defaults || (() => null);

  function read(){
    try {
      const raw = localStorage.getItem(storageKey);
      if(raw){
        const data = JSON.parse(raw);
        if(data && Array.isArray(data.sets)) return data;
      }
    } catch(err){ console.warn('LotKing store: ' + label + ' corrotti, rigenerati', err); }
    return {sets: []};
  }
  function write(data){
    try { localStorage.setItem(storageKey, JSON.stringify(data)); return true; }
    catch(err){ console.warn('LotKing store: ' + label + ' non salvati', err); return false; }
  }
  function uniqueId(data, name){
    const base = slugifyLevel(name || slugBase);
    let id = base, n = 2;
    while(data.sets.some(s => s.id === id)) id = base + '-' + (n++);
    return id;
  }
  function ensure(){
    const data = read();
    if(!data.sets.length){
      const def = defaults();
      if(def){
        def.savedAt = new Date().toISOString();
        data.sets.push(def);
        write(data);
      }
    }
    return data;
  }
  const api = {
    list(){
      return ensure().sets.map(s => ({id: s.id, name: s.name, savedAt: s.savedAt}));
    },
    get(id){
      const s = ensure().sets.find(x => x.id === id);
      return s ? cloneData(s) : null;
    },
    save(set){
      if(!set || !set.id) return false;
      const data = ensure();
      const copy = cloneData(set);
      copy.savedAt = new Date().toISOString();
      const i = data.sets.findIndex(x => x.id === copy.id);
      if(i >= 0) data.sets[i] = copy;
      else data.sets.push(copy);
      return write(data);
    },
    create(name, base){
      const data = ensure();
      const src = cloneData(base || defaults() || {});
      src.id = uniqueId(data, name);
      src.name = (name || label).trim();
      src.savedAt = new Date().toISOString();
      data.sets.push(src);
      return write(data) ? src.id : null;
    },
    duplicate(id, name){
      const src = api.get(id);
      if(!src) return null;
      return api.create((name || (src.name + ' Copy')).trim(), src);
    },
    rename(id, name){
      if(!name || !name.trim()) return false;
      const data = ensure();
      const s = data.sets.find(x => x.id === id);
      if(!s) return false;
      s.name = name.trim();
      s.savedAt = new Date().toISOString();
      return write(data);
    },
    remove(id){
      const data = ensure();
      const i = data.sets.findIndex(x => x.id === id);
      if(i < 0) return false;
      data.sets.splice(i, 1);
      return write(data);
    },
    upsertImported(set){
      // set arrivato da un LKEP importato: entra in libreria mantenendo l'id
      if(!set || !set.id) return null;
      const data = ensure();
      const copy = cloneData(set);
      copy.savedAt = copy.savedAt || new Date().toISOString();
      const i = data.sets.findIndex(x => x.id === set.id);
      if(i >= 0) data.sets[i] = copy;
      else data.sets.push(copy);
      write(data);
      return set.id;
    },
    defaults,
  };
  return api;
}

function engineAudioDefaults(){
  const mod = window.LK_RUNTIME_ENGINE_AUDIO;
  return mod && mod.defaultSet ? mod.defaultSet() : null;
}
function characterAudioDefaults(){
  const mod = window.LK_RUNTIME_CHARACTER_AUDIO;
  return mod && mod.defaultSet ? mod.defaultSet() : null;
}

const SOUND_SETS = createSoundSetLibrary({
  key: 'lotking.soundsets.v1', slug: 'sound-set', label: 'sound sets', defaults: engineAudioDefaults,
});
const CHARACTER_SOUND_SETS = createSoundSetLibrary({
  key: 'lotking.charactersoundsets.v1', slug: 'character-sound-set', label: 'character sound sets', defaults: characterAudioDefaults,
});

function collectPlayerBlueprint(GAME){
  if(!GAME || !GAME.player) return null;
  if(GAME.state && GAME.state.editorActive && !GAME.state.editorPreview && GAME.player.syncSpawnFromVisibleTransform){
    GAME.player.syncSpawnFromVisibleTransform();
  }
  const player = {
    headingMode: 'runtime-v2',
    enabled: GAME.player.enabled !== false,
    hidden: GAME.player.hidden === true,
    controllerIndex: GAME.player.controllerIndex == null ? null : Math.max(0, Math.min(3, Number(GAME.player.controllerIndex) | 0)),
    tuning: cloneData(GAME.player.tuning && GAME.player.tuning.values || {}),
    cam: cloneData(GAME.player.cameraCfg || {}),
    lights: cloneData(GAME.player.lights || {}),
    dataWidgets: cloneData(GAME.player.dataWidgets || {}),
    exhaust: cloneData(GAME.player.exhaust || {}),
    skids: cloneData(GAME.player.skids || {}),
    damage: cloneData(GAME.player.damage || {}),
    collision: cloneData(GAME.player.collision || {}),
    modelShading: GAME.player.getModelShading ? GAME.player.getModelShading() : (GAME.player.car && GAME.player.car.userData.modelShading || 'original'),
    steeringWheel: cloneData(GAME.player.getSteeringWheelConfig ? GAME.player.getSteeringWheelConfig() : (GAME.player.steeringWheel || {})),
  };
  if(GAME.player.spawn){
    player.spawn = cloneData(GAME.player.spawn);
    if(GAME.state && GAME.state.editorActive && !GAME.state.editorPreview && GAME.player.car){
      const heading = GAME.player.visibleHeading ? GAME.player.visibleHeading() : (GAME.player.car.rotation ? (GAME.player.car.rotation.y || 0) : 0);
      player.spawn.x = GAME.player.car.position.x || 0;
      player.spawn.z = GAME.player.car.position.z || 0;
      player.spawn.heading = heading;
      GAME.player.spawn.x = player.spawn.x;
      GAME.player.spawn.z = player.spawn.z;
      GAME.player.spawn.heading = player.spawn.heading;
    }
  } else if(GAME.player.car){
    player.spawn = {
      x: GAME.player.car.position.x || 0,
      z: GAME.player.car.position.z || 0,
      heading: GAME.player.visibleHeading ? GAME.player.visibleHeading() : (GAME.player.car.rotation ? (GAME.player.car.rotation.y || 0) : 0),
    };
  }
  if(GAME.player.car) player.transform = tOf(GAME.player.car);
  if(GAME.player.car && GAME.player.car.userData.modelSrc) player.modelSrc = GAME.player.car.userData.modelSrc;
  if(GAME.player.car && GAME.player.car.userData.modelDbKey) player.modelDbKey = GAME.player.car.userData.modelDbKey;
  if(GAME.player.car && GAME.player.car.userData.modelName) player.modelName = GAME.player.car.userData.modelName;
  if(GAME.player.car && GAME.player.car.userData.matProps) player.materials = cloneData(GAME.player.car.userData.matProps);
  if(GAME.player.car){
    const model = GAME.player.getModel ? GAME.player.getModel() : null;
    const meshEdits = GAME.player.car.userData.playerMeshEdits || model && model.userData && model.userData.meshEdits;
    if(meshEdits) player.meshEdits = normalizeMeshEdits(meshEdits);
  }
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
    if(o && o.userData && o.userData.editorType === 'playerSkid' && GAME.player.syncSkid) GAME.player.syncSkid(o);
    if(o && o.userData && o.userData.editorType === 'playerDataWidget' && GAME.player.syncDataWidget) GAME.player.syncDataWidget(o);
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
    name: name || 'player_car Logic',
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
      skids: cloneData(GAME.player.skids || {}),
      damage: cloneData(GAME.player.damage || {}),
      collision: cloneData(GAME.player.collision || {}),
      modelShading: GAME.player.getModelShading ? GAME.player.getModelShading() : 'original',
      steeringWheel: cloneData(GAME.player.getSteeringWheelConfig ? GAME.player.getSteeringWheelConfig() : (GAME.player.steeringWheel || {})),
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

function writeLoadingMusicHint(tracks){
  const first = Array.isArray(tracks) && tracks[0];
  if(!first || (!first.url && !first.dbKey)) return false;
  try {
    localStorage.setItem(LOADING_MUSIC_HINT_KEY, JSON.stringify({
      url:first.url ? String(first.url) : '',
      dbKey:first.dbKey ? String(first.dbKey) : '',
      title:String(first.title || ''),
      artist:String(first.artist || ''),
    }));
    return true;
  } catch(err){
    return false;
  }
}

/** Shared baseline ground every template starts from. Templates that ship their
 *  own terrain declare `ground:'none'` and get a clean scene. */
function applyTemplateGround(scene, mode){
  if(mode === 'none') return scene;
  if(mode === 'drift-apron'){
    // Large drivable apron under the track (the track ships its own grass at y=0)
    scene.added.push({
      id: 'lvlground_' + Date.now().toString(36),
      prim: 'plane',
      name: 'Ground',
      collide: false,
      driveSurface: true,
      props: {color: 0x2a2f39, roughness: .98, metalness: 0},
      t: {p:[6, -0.03, -40], r:[0, 0, 0], s:[90, 1, 90], v: true},
      asset: {key:'primitive:plane', name:'Primitive Plane', source:'Editor primitive'},
    });
    return scene;
  }
  scene.added.push({
    id: 'lvlground_' + Date.now().toString(36),
    prim: 'plane',
    name: 'Ground',
    collide: false,
    props: {color: 0x39404d, roughness: .95, metalness: 0},
    t: {p:[0, 0, 0], r:[0, 0, 0], s:[40, 1, 40], v: true},
    asset: {key:'primitive:plane', name:'Primitive Plane', source:'Editor primitive'},
  });
  return scene;
}

/** The two templates whose content is implemented inside this module. Every
 *  other template registers itself from its own runtime module.
 *  Script order is not guaranteed across the HTML shells and the lazy editor
 *  loader, so this is idempotent and retried from templateScene(). */
let storeLevelTemplatesRegistered = false;
function registerStoreLevelTemplates(){
  if(storeLevelTemplatesRegistered) return true;
  const registry = window.LK_LEVEL_TEMPLATES;
  if(!registry || !registry.register) return false;
  storeLevelTemplatesRegistered = true;
  registry.register([
    {
      id:'drift-track-minami', name:'Drift Track - Minami Drift Park', nameIt:'Tracciato Drift - Minami Drift Park',
      category:'Vehicle', order:500, ground:'drift-apron', keepBuiltinPlayer:true,
      description:'Generated drift circuit with the native player car spawned on the start line.',
      build(scene){
        const gen = window.LK_RUNTIME_DRIFT_TRACK;
        if(!gen) return scene;
        const params = gen.defaultParams();
        let spawn = null;
        try {
          const built = gen.build(THREE, params);
          spawn = built.spawn;
          disposeObject3D(built.group);
        } catch(err){ console.warn('LotKing drift template: spawn probe failed', err); }
        scene.added.push({
          id: 'drifttrack_' + Date.now().toString(36),
          kind: 'driftTrack',
          name: 'Drift Track (Minami)',
          collide: false,
          physics: false,
          props: params,
          asset: {key:'level:driftTrack', name:'Drift Track', source:'Drift Track generator'},
          t: {p:[0, 0, 0], r:[0, 0, 0], s:[1, 1, 1], v: true},
        });
        if(spawn && scene.player){
          scene.player.spawn = Object.assign({}, scene.player.spawn, {x: spawn.position[0], z: spawn.position[2], heading: spawn.yaw});
        }
        return scene;
      },
    },
    {
      id:'empty', name:'Empty Level', nameIt:'Livello vuoto',
      category:'Blank', order:900, ground:'plane', keepBuiltinPlayer:true,
      description:'Ground plane, default lighting and the native player car. Build from here.',
      build(scene){ return scene; },
    },
  ]);
  return true;
}
registerStoreLevelTemplates();

const LEVELS = {
  list(opts){
    opts = opts || {};
    const idx = ensureLibrary();
    const activeId = normalizeLevelId(idx.activeId);
    return idx.levels.filter(l => opts.includeHidden || l.visible !== false).map(l => {
      const project = readLevelProject(l.id);
      const levelRole = project && project.meta && project.meta.levelRole || l.levelRole || 'gameplay';
      const visible = project && project.meta && project.meta.levelVisible === false ? false : (l.visible === false ? false : true);
      return Object.assign({}, l, {levelRole, visible, active: normalizeLevelId(l.id) === activeId});
    });
  },
  activeId(){ return normalizeLevelId(ensureLibrary().activeId); },
  reconcileActive(id){
    const target = normalizeLevelId(id);
    if(!target) return false;
    const idx = ensureLibrary();
    if(!levelEntry(idx, target)) return false;
    const previous = normalizeLevelId(idx.activeId);
    if(previous === target) return true;
    idx.activeId = target;
    if(!writeIndex(idx)) return false;
    if(applied && appliedMode === 'active') appliedLevelId = target;
    syncCatalog();
    console.warn('LotKing store: active level index realigned with the loaded editor scene', previous, '→', target);
    return true;
  },
  get: readLevelProject,
  create(name, scene, meta){
    const idx = ensureLibrary();
    const id = uniqueLevelId(idx, name);
    const project = projectFromScene(scene || blank(), Object.assign({trackId: id, trackName: name, levelRole:'gameplay'}, meta || {}));
    if(!writeLevelProject(id, project)) return null;
    const entry = {id, name, levelRole:project.meta.levelRole || 'gameplay', savedAt: project.savedAt, visible:true};
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
    const previousId = normalizeLevelId(idx.activeId);
    let previousRaw = null;
    if(previousId && previousId !== id){
      try {
        previousRaw = localStorage.getItem(KEY);
        if(previousRaw){
          // Move, rather than copy, the old active slot. If the new KEY write
          // fails, restore the old slot immediately.
          localStorage.setItem(LEVEL_PREFIX + previousId, previousRaw);
          localStorage.removeItem(KEY);
        }
      } catch(err){
        console.warn('LotKing store: current level could not be archived before switch', err);
        return false;
      }
    }
    const project = readLevelProject(id);
    if(!project){
      if(previousRaw) try { localStorage.setItem(KEY, previousRaw); } catch(err){}
      return false;
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(project));
      localStorage.removeItem(LEVEL_PREFIX + id);
    }
    catch(err){
      if(previousRaw) try { localStorage.setItem(KEY, previousRaw); } catch(restoreError){}
      console.warn('LotKing store: attivazione livello fallita', err);
      return false;
    }
    idx.activeId = id;
    writeIndex(idx);
    syncCatalog();
    return true;
  },
  setRole(id, levelRole){
    id = normalizeLevelId(id);
    levelRole = ['editor-menu','game-menu'].includes(levelRole) ? levelRole : 'gameplay';
    const idx = ensureLibrary();
    const entry = levelEntry(idx, id);
    const project = readLevelProject(id);
    if(!entry || !project) return false;
    project.meta = Object.assign({}, project.meta, {levelRole});
    if(!writeLevelProject(id, project)) return false;
    entry.levelRole = levelRole;
    if(normalizeLevelId(idx.activeId) === id){
      try { localStorage.setItem(KEY, JSON.stringify(project)); } catch(err){}
    }
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
    idx.levels.push({id: newId, name: newName, levelRole:copy.meta && copy.meta.levelRole || 'gameplay', savedAt: copy.savedAt, visible:src.visible === false ? false : true});
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
    const entry = {id, name, levelRole:project.meta.levelRole || 'gameplay', savedAt: project.savedAt || new Date().toISOString(), visible:project.meta && project.meta.levelVisible === false ? false : true};
    idx.levels.push(entry);
    maybeStorePlayerBlueprintDefault(project, entry);
    maybeStoreRadioHudDefault(project, entry);
    writeIndex(idx);
    syncCatalog();
    return id;
  },
  // Open World is the normal authored-project default. This function owns only
  // the shared baseline (builtin sweep, ground, env, player, radio HUD);
  // template content itself lives in the LK_LEVEL_TEMPLATES registry.
  templateScene(GAME, templateId){
    registerStoreLevelTemplates();
    const registry = window.LK_LEVEL_TEMPLATES;
    const template = registry && registry.resolve ? registry.resolve(templateId) : null;
    const d = blank();
    const seen = new Set();
    if(GAME && GAME.world && GAME.world.registry){
      for(const o of GAME.world.registry){
        if(!o.userData.builtin) continue;
        seen.add(o.userData.editorId);
        if(o.isLight || o.userData.light) continue;
        const type = o.userData.editorType || '';
        // Templates that own their own player Pawn delete the builtin car; the
        // legacy vehicle/blank templates keep it as their starting player.
        if((!template || template.keepBuiltinPlayer) && (type === 'player' || type.indexOf('player') === 0)) continue;
        d.deleted.push(o.userData.editorId);
      }
    }
    for(const id of builtinIds){ if(!seen.has(id)) d.deleted.push(id); }
    applyTemplateGround(d, template ? template.ground : 'plane');
    d.env = Object.assign({skyTime: .3, dayLength: 999999}, template && template.env || {});
    d.player = playerTemplateFromLevelLibrary(GAME);
    const radioHud = radioHudTemplateFromLevelLibrary(GAME);
    if(radioHud) d.ui.radioHud = radioHud;
    if(!template) return d;
    return registry.build(template.id, d, {GAME, THREE, disposeObject3D});
  },
  // dal menu del gioco: prepara il lancio di un livello della libreria.
  // Ritorna 'reload' se la pagina sta per ricaricarsi (scena già applicata).
  prepareLaunch(id){
    const idx = ensureLibrary();
    id = normalizeLevelId(id);
    if(!levelEntry(idx, id)) return 'ready';       // track built-in, nulla da fare
    if(applied && (appliedMode === 'menu-background' || appliedMode === 'menu-background-pending') && normalizeLevelId(appliedLevelId) !== id){
      LEVELS.setActive(id);
      try { sessionStorage.setItem('lk.autolaunch', id); } catch(err){}
      location.reload();
      return 'reload';
    }
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
  const list = idx.levels.filter(l => {
    const project = l && readLevelProject(l.id);
    const role = l && (project && project.meta && project.meta.levelRole || l.levelRole);
    const visible = !(l && l.visible === false) && !(project && project.meta && project.meta.levelVisible === false);
    return visible && role !== 'editor-menu' && role !== 'game-menu';
  }).sort((a, b) => {
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
    // Menu roles were filtered immediately above. Preserve the positive role
    // too: dropping it made Editor Play fall back to a stale ED.levelRole from
    // a previously opened menu project and start an FPS scene as a menu.
    levelRole:'gameplay',
    active: normalizeLevelId(l.id) === activeId,
    primary: normalizeLevelId(l.id) === activeId || !!l.__lkExportPrimary,
    tag: normalizeLevelId(l.id) === activeId ? 'EDITOR TRACK' : 'CUSTOM TRACK',
    description: ((window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it') ? 'Livello del Lot King Engine Builder salvato localmente' : 'Locally saved Lot King Engine Builder level') +
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
  if(t.s) refreshSurfaceTiling(obj);
}
function applyParentLink(obj, GAME){
  const pid = obj && obj.userData.linkParentId;
  if(!pid || !GAME) return;
  const parent = GAME.world.registry.find(o => o.userData.editorId === pid);
  if(parent && parent !== obj) parent.attach(obj);
}

// keep the arcade collider (axis-aligned box / circle) in sync with the object
function syncCollider(obj){
  // syncCollider is this codebase's "the transform changed" notification (the
  // gizmo, the inspector fields and the loader all call it), which makes it the
  // one place a procedural surface can re-tile after a resize.
  refreshSurfaceTiling(obj);
  updateLogicElementColliderRefs(obj);
  updateDriftTrackColliderRefs(obj);
  const col = obj.userData.collider;
  if(!col || !col.ref) return;
  if(col.ref.driftTrackRoot) return;
  if(col.ref.logicElementCollider){
    updateLogicElementColliderRef(col.ref);
    return;
  }
  col.ref.owner = obj;
  obj.updateMatrixWorld(true);
  if(col.ref.enabled === false){
    removeCompoundColliderParts(col.ref);
    return;
  }
  const bounds = objectLocalVisualBox(obj);
  if(!bounds) return;
  const box = bounds.box;
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  if(!bounds.world){
    const worldScale = obj.getWorldScale(new THREE.Vector3());
    size.set(
      size.x * Math.abs(worldScale.x || 1),
      size.y * Math.abs(worldScale.y || 1),
      size.z * Math.abs(worldScale.z || 1)
    );
  }
  const wc = bounds.world ? c : obj.localToWorld(c.clone());
  const shape = obj.userData.colliderShape || {};
  const offX = Number(shape.offsetX);
  const offY = Number(shape.offsetY);
  const offZ = Number(shape.offsetZ);
  col.ref.x = wc.x + (Number.isFinite(offX) ? offX : 0);
  col.ref.y = wc.y + (Number.isFinite(offY) ? offY : 0);
  col.ref.z = wc.z + (Number.isFinite(offZ) ? offZ : 0);
  const mode = shape.mode === 'complex' ? 'complex' : 'simple';
  col.ref.colliderMode = mode;
  col.ref.meshCollider = false;
  // Three PlaneGeometry is authored in local XY and normally rotated onto XZ.
  // Treating its local height as collider `hy` creates a many-metres-tall box;
  // the Character solver then sees an unreachable top while Cannon happens to
  // see a thin rotated slab. Normalize an untouched horizontal drive plane to
  // the shared world-space thin-surface convention used by both runtimes.
  const directPlane = col.kind !== 'circle' && obj.isMesh && obj.geometry && obj.geometry.type === 'PlaneGeometry';
  const planeShapeOverride = ['hx','hy','hz','rotX','rotY','rotZ','rot','offsetX','offsetY','offsetZ'].some(key=>Number.isFinite(Number(shape[key])));
  if(directPlane && obj.userData.driveSurface === true && !planeShapeOverride){
    const worldBox = new THREE.Box3().setFromObject(obj);
    const worldSize = worldBox.getSize(new THREE.Vector3());
    if(worldSize.x > .03 && worldSize.z > .03 && worldSize.y <= .08){
      const worldCenter = worldBox.getCenter(new THREE.Vector3()), halfThickness = .025;
      col.ref.x = worldCenter.x;
      col.ref.y = worldCenter.y - halfThickness;
      col.ref.z = worldCenter.z;
      col.ref.hx = worldSize.x / 2;
      col.ref.hy = halfThickness;
      col.ref.hz = worldSize.z / 2;
      col.ref.rotX = col.ref.rotY = col.ref.rotZ = col.ref.rot = 0;
      // `horizontalSurface` is reserved for complex mesh parts carrying a
      // partMeshUuid and exact triangle sampling. This direct plane is already
      // an exact rectangle, so its normalized box is the authoritative floor.
      col.ref.horizontalSurface = false;
      removeCompoundColliderParts(col.ref);
      return;
    }
  }
  col.ref.horizontalSurface = false;
  if(col.kind === 'circle'){
    removeCompoundColliderParts(col.ref);
    const r = Number(shape.r);
    col.ref.r = Number.isFinite(r) && r > 0 ? r : Math.max(size.x, size.z) / 2;
    const hy = Number(shape.hy);
    col.ref.hy = Number.isFinite(hy) && hy > 0 ? hy : Math.max(.1, size.y / 2);
    const rotX = Number(shape.rotX);
    const rotY = Number(shape.rotY != null ? shape.rotY : shape.rot);
    const rotZ = Number(shape.rotZ);
    col.ref.rotX = Number.isFinite(rotX) ? rotX : obj.rotation.x;
    col.ref.rotY = Number.isFinite(rotY) ? rotY : obj.rotation.y;
    col.ref.rotZ = Number.isFinite(rotZ) ? rotZ : obj.rotation.z;
    col.ref.rot = col.ref.rotY;
  } else {
    col.ref.meshCollider = mode === 'complex';
    const hx = Number(shape.hx);
    const hy = Number(shape.hy);
    const hz = Number(shape.hz);
    col.ref.hx = Number.isFinite(hx) && hx > 0 ? hx : size.x / 2;
    col.ref.hy = Number.isFinite(hy) && hy > 0 ? hy : Math.max(.1, size.y / 2);
    col.ref.hz = Number.isFinite(hz) && hz > 0 ? hz : size.z / 2;
    const rotX = Number(shape.rotX);
    const rotY = Number(shape.rotY != null ? shape.rotY : shape.rot);
    const rotZ = Number(shape.rotZ);
    col.ref.rotX = Number.isFinite(rotX) ? rotX : obj.rotation.x;
    col.ref.rotY = Number.isFinite(rotY) ? rotY : obj.rotation.y;
    col.ref.rotZ = Number.isFinite(rotZ) ? rotZ : obj.rotation.z;
    col.ref.rot = col.ref.rotY;
    if(mode === 'complex'){
      const list = colliderBoxList(col.ref);
      const colliderCandidates = objectLocalMeshBoxes(obj);
      // Keep the established solid-part ordering so existing per-part edits do
      // not move to another mesh. Horizontal zero/thin meshes (roads, asphalt,
      // floors) are then appended as shallow boxes: older filtering discarded
      // them entirely and the Character fell through to the editor grid.
      const solidParts = colliderCandidates.filter(partInfo => {
        const partBox = partInfo && partInfo.box ? partInfo.box : partInfo;
        const s = partBox.getSize(new THREE.Vector3());
        return s.x > .03 && s.y > .03 && s.z > .03;
      }).slice(0, 24);
      const horizontalParts = colliderCandidates.filter(partInfo => {
        const partBox = partInfo && partInfo.box ? partInfo.box : partInfo;
        const s = partBox.getSize(new THREE.Vector3());
        return s.x > .03 && s.z > .03 && s.y <= .03;
      }).slice(0, 8).map(partInfo=>Object.assign({},partInfo,{horizontalSurface:true}));
      const meshBoxes = solidParts.concat(horizontalParts);
      if(list && meshBoxes.length > 1){
        const worldScale = obj.getWorldScale(new THREE.Vector3());
        col.ref.compoundRoot = true;
        col.ref.parts = col.ref.parts || [];
        meshBoxes.forEach((partInfo, i) => {
          const partBox = partInfo && partInfo.box ? partInfo.box : partInfo;
          const partName = (partInfo && partInfo.name) || ('Collider ' + (i + 1));
          const partShape = colliderPartShape(shape, i, partName);
          const partMode = partShape.mode === 'solid' ? 'solid' : (partShape.mode === 'off' ? 'off' : 'complex');
          const pc = partBox.getCenter(new THREE.Vector3());
          const ps = partBox.getSize(new THREE.Vector3());
          ps.set(ps.x * Math.abs(worldScale.x || 1), ps.y * Math.abs(worldScale.y || 1), ps.z * Math.abs(worldScale.z || 1));
          const pw = obj.localToWorld(pc.clone());
          const part = col.ref.parts[i] || {
            owner: obj,
            parentRef: col.ref,
            compoundPart: true,
            _boxList: list,
          };
          part.owner = obj;
          part.parentRef = col.ref;
          part.compoundPart = true;
          part._boxList = list;
          part.partIndex = i;
          part.partName = partName;
          part.partMeshUuid = partInfo && partInfo.uuid;
          // A moved/rescaled complex model invalidates the Character's cached
          // exact ground sample for this mesh part.
          part._lkGroundRaySample = null;
          part._lkGroundMesh = null;
          part._lkGroundWorldBounds = null;
          part.partMode = partMode;
          part.colliderMode = partMode;
          part.meshCollider = partMode === 'complex';
          part.horizontalSurface = partInfo&&partInfo.horizontalSurface===true;
          part.enabled = col.ref.enabled !== false && partMode !== 'off';
          part.physics = !!col.ref.physics;
          part.mass = col.ref.mass;
          part.impact = col.ref.impact;
          const autoX = pw.x + (Number.isFinite(offX) ? offX : 0);
          const autoY = pw.y + (Number.isFinite(offY) ? offY : 0);
          const autoZ = pw.z + (Number.isFinite(offZ) ? offZ : 0);
          part.autoX = autoX;
          part.autoY = autoY;
          part.autoZ = autoZ;
          part.x = autoX + (Number.isFinite(Number(partShape.offsetX)) ? Number(partShape.offsetX) : 0);
          part.y = autoY + (Number.isFinite(Number(partShape.offsetY)) ? Number(partShape.offsetY) : 0);
          part.z = autoZ + (Number.isFinite(Number(partShape.offsetZ)) ? Number(partShape.offsetZ) : 0);
          part.hx = Number.isFinite(Number(partShape.hx)) && Number(partShape.hx) > 0 ? Number(partShape.hx) : Math.max(.05, ps.x / 2);
          part.hy = Number.isFinite(Number(partShape.hy)) && Number(partShape.hy) > 0 ? Number(partShape.hy) : Math.max(.05, ps.y / 2);
          part.hz = Number.isFinite(Number(partShape.hz)) && Number(partShape.hz) > 0 ? Number(partShape.hz) : Math.max(.05, ps.z / 2);
          part.rotX = Number.isFinite(Number(partShape.rotX)) ? Number(partShape.rotX) : col.ref.rotX;
          part.rotY = Number.isFinite(Number(partShape.rotY != null ? partShape.rotY : partShape.rot)) ? Number(partShape.rotY != null ? partShape.rotY : partShape.rot) : col.ref.rotY;
          part.rotZ = Number.isFinite(Number(partShape.rotZ)) ? Number(partShape.rotZ) : col.ref.rotZ;
          part.rot = part.rotY;
          if(!col.ref.parts[i]) col.ref.parts[i] = part;
          if(!list.includes(part)) list.push(part);
        });
        while(col.ref.parts.length > meshBoxes.length){
          const extra = col.ref.parts.pop();
          const idx = list.indexOf(extra);
          if(idx >= 0) list.splice(idx, 1);
        }
      } else {
        removeCompoundColliderParts(col.ref);
      }
    } else {
      removeCompoundColliderParts(col.ref);
    }
  }
}
function physicsMassFrom(value){
  const raw = Number(value);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}
function physicsImpactFrom(value){
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0.25;
}
function colliderKindFrom(value){
  return value === 'circle' ? 'circle' : 'box';
}
function ensureStoredCollider(GAME, obj, kind){
  if(!GAME || !GAME.world || !GAME.world.colliders || !obj) return null;
  const kindKey = colliderKindFrom(kind);
  const old = obj.userData && obj.userData.collider;
  if(old && old.ref){
    old.kind = colliderKindFrom(old.kind || kindKey);
    old.ref.owner = obj;
    old.ref.enabled = true;
    if(old.kind === 'circle'){
      if(!GAME.world.colliders.circle.includes(old.ref)) GAME.world.colliders.circle.push(old.ref);
    } else {
      old.ref._boxList = GAME.world.colliders.box;
      if(!GAME.world.colliders.box.includes(old.ref)) GAME.world.colliders.box.push(old.ref);
    }
    return old.ref;
  }
  const mass = physicsMassFrom(obj.userData && obj.userData.physicsMass);
  const impact = physicsImpactFrom(obj.userData && obj.userData.physicsImpact);
  const ref = kindKey === 'circle'
    ? {x:0, z:0, r:1, mass, impact, physics:false, enabled:true, owner:obj}
    : {x:0, z:0, hx:1, hz:1, mass, impact, physics:false, enabled:true, owner:obj, _boxList:GAME.world.colliders.box};
  if(kindKey === 'circle') GAME.world.colliders.circle.push(ref);
  else GAME.world.colliders.box.push(ref);
  obj.userData.collider = {kind: kindKey, ref};
  return ref;
}
function applyBuiltinRuntimeProps(GAME, obj, props){
  if(!obj || !obj.userData || obj.userData.editorType !== 'mesh' || !props) return;
  const hasCollisionState = props.collide != null || props.physics != null;
  if(props.driveSurface != null) obj.userData.driveSurface = props.driveSurface === true;
  if(props.physicsMass != null) obj.userData.physicsMass = physicsMassFrom(props.physicsMass);
  if(props.physicsImpact != null) obj.userData.physicsImpact = physicsImpactFrom(props.physicsImpact);
  if(!hasCollisionState && props.driveSurface == null && props.physicsMass == null && props.physicsImpact == null) return;
  const wantsPhysics = props.physics === true;
  // Drive Surface is a gameplay support contract, not a visual-only tag. Older
  // projects could save it beside Collision=false, leaving vehicles and Pawns
  // to fall through the surface until they happened to meet lower geometry.
  const wantsDriveSurface = props.driveSurface === true || (props.driveSurface == null && obj.userData.driveSurface === true);
  const wantsCollider = props.collide === true || wantsPhysics || wantsDriveSurface;
  let ref = obj.userData.collider && obj.userData.collider.ref;
  if(wantsCollider){
    ref = ensureStoredCollider(GAME, obj, props.colliderKind);
    if(ref){
      ref.enabled = true;
      ref.physics = wantsPhysics;
      ref.owner = obj;
      ref.mass = physicsMassFrom(props.physicsMass != null ? props.physicsMass : ref.mass);
      ref.impact = physicsImpactFrom(props.physicsImpact != null ? props.physicsImpact : ref.impact);
      obj.userData.physicsMass = ref.mass;
      obj.userData.physicsImpact = ref.impact;
    }
  } else if(ref){
    ref.enabled = false;
    ref.physics = false;
  }
  obj.userData.physicsEnabled = wantsPhysics;
}

// ------------------------------------------------ light props
// Since r155 Three.js always uses physically-correct punctual lights. Older Lot
// King projects authored point/spot intensity as a small, unitless value, so
// preserve their visual intent while storing every new value in candela.
const LEGACY_PUNCTUAL_INTENSITY_TO_CANDELA = 400;
function physicalLightIntensity(l, p, fallback){
  const raw = Number(p && p.intensity);
  if(!Number.isFinite(raw)) return fallback;
  if((l.isPointLight || l.isSpotLight) && p.intensityUnit !== 'candela'){
    return Math.max(0, raw) * LEGACY_PUNCTUAL_INTENSITY_TO_CANDELA;
  }
  return Math.max(0, raw);
}
function normalizeLightSchedule(value){
  value = value || {};
  const hour = (input, fallback) => {
    const n = Number(input);
    return Number.isFinite(n) ? ((n % 24) + 24) % 24 : fallback;
  };
  return {enabled:value.enabled === true, onHour:hour(value.onHour, 18), offHour:hour(value.offHour, 7)};
}
function normalizeCinematicLightFlare(value){
  value = value && typeof value === 'object' ? value : {};
  const clamp = (input,min,max,fallback) => {
    const n=Number(input);
    return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
  };
  return {
    enabled:value.enabled===true,
    intensity:clamp(value.intensity,0,2,.65),
    size:clamp(value.size,.2,3,.7),
    bloomIntensity:clamp(value.bloomIntensity,0,3,.52),
    occlusion:value.occlusion!==false,
  };
}
function lightProps(l){
  const manualVisible = l.userData && l.userData.dayNightManualVisible;
  const p = {color: l.color ? l.color.getHex() : undefined, intensity: l.intensity, visible:manualVisible == null ? l.visible : manualVisible};
  p.editorDummyVisible = !(l.userData && l.userData.editorDummyVisible === false);
  if(l.isPointLight || l.isSpotLight) p.intensityUnit = 'candela';
  if(l.userData && l.userData.dayNightSchedule) p.dayNightSchedule = normalizeLightSchedule(l.userData.dayNightSchedule);
  if(l.userData && l.userData.cinematicLensFlare) p.cinematicLensFlare = normalizeCinematicLightFlare(l.userData.cinematicLensFlare);
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
  if(p.intensity != null) l.intensity = physicalLightIntensity(l, p, l.intensity);
  if(p.distance != null && l.distance != null) l.distance = p.distance;
  if(p.decay != null && l.decay != null) l.decay = p.decay;
  if(p.angle != null && l.angle != null) l.angle = p.angle;
  if(p.penumbra != null && l.penumbra != null) l.penumbra = p.penumbra;
  if(p.castShadow != null) l.castShadow = p.castShadow;
  if(p.dayNightSchedule != null) l.userData.dayNightSchedule = normalizeLightSchedule(p.dayNightSchedule);
  if(p.cinematicLensFlare != null) l.userData.cinematicLensFlare = normalizeCinematicLightFlare(p.cinematicLensFlare);
  if(p.editorDummyVisible != null) l.userData.editorDummyVisible = p.editorDummyVisible !== false;
  if(p.visible != null){
    l.userData.dayNightManualVisible = p.visible !== false;
    l.visible = p.visible !== false;
  } else if(l.userData.dayNightManualVisible == null) {
    l.userData.dayNightManualVisible = l.visible !== false;
  }
}
function objectLight(obj){
  if(!obj) return null;
  if(obj.isLight) return obj;
  if(obj.userData && obj.userData.light) return obj.userData.light;
  let found = null;
  if(obj.traverse) obj.traverse(node => { if(!found && node && node.isLight) found = node; });
  return found;
}

// material override: global or per material slot (edited via editor)
function normalizeStoredMaterialState(value){
  const state = Object.assign({}, value || {});
  // Old Inspector saves could contain a contradictory state: Standard +
  // explicitly opaque, but with a Physical transmission value left behind by
  // a previous Glass preset. Three then kept rendering the mesh as transmissive
  // even though the saved opacity was exactly 1.
  if(Number(state.opacity) >= 1 &&
    state.transparent === false &&
    state.depthWrite !== false){
    state.opacity = 1;
    state.transmission = 0;
  }
  return state;
}

function normalizeStoredMatProps(p){
  if(!p) return {global:{}, slots:{}};
  if(p.global || p.slots){
    const slots = {};
    Object.keys(p.slots || {}).forEach(key => { slots[key] = normalizeStoredMaterialState(p.slots[key]); });
    return {
      global:normalizeStoredMaterialState(p.global),
      slots,
    };
  }
  const flat = normalizeStoredMaterialState(p);
  delete flat.materialSlot;
  return {global:flat, slots:{}};
}

function mergeStoredMatProps(current, patch){
  const next = normalizeStoredMatProps(current);
  const incoming = normalizeStoredMatProps(patch);
  next.global = Object.assign({}, next.global, incoming.global);
  Object.keys(incoming.slots || {}).forEach(key => {
    next.slots[key] = Object.assign({}, next.slots[key] || {}, incoming.slots[key] || {});
  });
  if(patch && patch.materialSlot){
    const slot = patch.materialSlot;
    const flat = Object.assign({}, patch);
    delete flat.materialSlot;
    next.slots[slot] = Object.assign({}, next.slots[slot] || {}, flat);
  }
  return next;
}

// Persist the authored material state immediately, even when the expensive
// shader/material application is deferred to the next animation frame.
function stageMatProps(obj, p){
  if(!obj || !p) return null;
  obj.userData = obj.userData || {};
  obj.userData.matProps = mergeStoredMatProps(obj.userData.matProps, p);
  return obj.userData.matProps;
}

function sanitizePlayerMatProps(props){
  const stored = normalizeStoredMatProps(props);
  const global = Object.assign({}, stored.global || {});
  const explicitGlobal = !!global.allowGlobal;
  const slots = {};
  Object.keys(stored.slots || {}).forEach(key => {
    const slot = Object.assign({}, stored.slots[key] || {});
    delete slot.allowGlobal;
    slots[key] = slot;
  });
  return {
    global: explicitGlobal ? global : {},
    slots,
  };
}

function materialSlotMatches(mesh, meshIndex, materialIndex, targetSlot){
  const stableId = mesh && mesh.userData && mesh.userData.lkMeshEditId;
  return !targetSlot || targetSlot === 'all' || targetSlot === (meshIndex + ':' + materialIndex) || (stableId && targetSlot === ('id|' + stableId + '|' + materialIndex));
}

function dynamicTextureTelemetry(){
  const provider = typeof window !== 'undefined' && window.LK_RUNTIME_VEHICLE_TELEMETRY;
  const value = provider && typeof provider.get === 'function' ? provider.get() : null;
  if(value) return value;
  return {
    speedKmh:0,
    rpm:900,
    rpm01:.12,
    gearLabel:'N',
    throttle:0,
    lateralG:0,
    drift:false,
    editorPreview:true,
  };
}

function drawDynamicVehicleHud(controller, force){
  const now = performance.now();
  const hz = Math.max(1, Math.min(30, Number(controller.props.dynamicRefreshHz) || 15));
  if(!force && now - controller.lastPaint < 1000 / hz) return;
  controller.lastPaint = now;
  const data = dynamicTextureTelemetry();
  const speed = Math.max(0, Math.round(Number(data.speedKmh) || 0));
  const rpm = Math.max(0, Math.round(Number(data.rpm) || 0));
  const rpm01 = Math.max(0, Math.min(1, Number(data.rpm01) || rpm / 8000));
  const gear = String(data.gearLabel != null ? data.gearLabel : (data.reverse ? 'R' : (data.gear || 'N')));
  const lateralG = Number(data.lateralG != null ? data.lateralG : data.lastLatG) || 0;
  const style = controller.props.dynamicHudStyle || 'sport';
  const signature = [speed, Math.round(rpm / 25), gear, Math.round(rpm01 * 100), Math.round(lateralG * 10), style].join('|');
  if(!force && signature === controller.signature) return;
  controller.signature = signature;

  const c = controller.canvas, g = controller.ctx, w = c.width, h = c.height;
  const accent = style === 'telemetry' ? '#51f5c7' : (rpm01 > .9 ? '#ff496c' : '#58b8ff');
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#05080d';
  g.fillRect(0, 0, w, h);
  const gradient = g.createRadialGradient(w * .5, h * .58, 0, w * .5, h * .58, w * .7);
  gradient.addColorStop(0, 'rgba(28,45,70,.72)');
  gradient.addColorStop(1, 'rgba(2,4,8,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, w, h);

  g.save();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if(style === 'minimal'){
    g.shadowColor = accent; g.shadowBlur = w * .025;
    g.fillStyle = '#f4f8ff';
    g.font = '800 ' + Math.round(h * .54) + 'px Arial, sans-serif';
    g.fillText(String(speed), w * .43, h * .51);
    g.shadowBlur = 0;
    g.fillStyle = accent;
    g.font = '700 ' + Math.round(h * .105) + 'px Arial, sans-serif';
    g.fillText('KM/H', w * .43, h * .84);
    g.font = '900 ' + Math.round(h * .33) + 'px Arial, sans-serif';
    g.fillText(gear, w * .82, h * .54);
  } else {
    const cx = w * .35, cy = h * .55, radius = h * .36;
    g.lineCap = 'round';
    g.lineWidth = Math.max(8, h * .035);
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.beginPath(); g.arc(cx, cy, radius, Math.PI * .72, Math.PI * 2.28); g.stroke();
    g.strokeStyle = accent;
    g.shadowColor = accent; g.shadowBlur = h * .05;
    g.beginPath(); g.arc(cx, cy, radius, Math.PI * .72, Math.PI * (.72 + 1.56 * rpm01)); g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#f5f8ff';
    g.font = '900 ' + Math.round(h * .42) + 'px Arial, sans-serif';
    g.fillText(String(speed), cx, cy - h * .025);
    g.fillStyle = 'rgba(235,242,255,.72)';
    g.font = '700 ' + Math.round(h * .075) + 'px Arial, sans-serif';
    g.fillText('KM/H', cx, cy + h * .23);
    g.fillStyle = accent;
    g.font = '900 ' + Math.round(h * .3) + 'px Arial, sans-serif';
    g.fillText(gear, w * .76, h * .42);
    g.fillStyle = 'rgba(235,242,255,.74)';
    g.font = '700 ' + Math.round(h * .07) + 'px Arial, sans-serif';
    g.fillText(Math.round(rpm).toLocaleString() + ' RPM', w * .76, h * .68);
    if(style === 'telemetry'){
      g.fillStyle = lateralG > .7 ? '#ffcf5a' : '#51f5c7';
      g.font = '800 ' + Math.round(h * .085) + 'px Arial, sans-serif';
      g.fillText(Math.abs(lateralG).toFixed(1) + ' G  ·  ' + (data.drift ? 'DRIFT' : 'GRIP'), w * .76, h * .84);
    }
  }
  g.restore();
  controller.texture.needsUpdate = true;
}

function dynamicRadioRuntime(){
  const game = typeof window !== 'undefined' && window.LOT_KING;
  return game && game.systems && game.systems.radio || null;
}

function syncDynamicRadioSurfaceAvailability(){
  const radio = dynamicRadioRuntime();
  if(radio && radio.setMaterialSurfaceAvailable){
    radio.setMaterialSurfaceAvailable(dynamicRadioSurfaceCount > 0);
  }
}

function retainDynamicRadioSurface(controller){
  if(!controller || controller.type !== 'radio-hud' || controller.radioSurfaceRetained) return;
  controller.radioSurfaceRetained = true;
  dynamicRadioSurfaceCount++;
  syncDynamicRadioSurfaceAvailability();
}

function releaseDynamicRadioSurface(controller){
  if(!controller || !controller.radioSurfaceRetained) return;
  controller.radioSurfaceRetained = false;
  dynamicRadioSurfaceCount = Math.max(0, dynamicRadioSurfaceCount - 1);
  syncDynamicRadioSurfaceAvailability();
}

function canvasRoundRect(g, x, y, w, h, radius){
  const r = Math.max(0, Math.min(radius, w * .5, h * .5));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function drawDynamicRadioHud(controller, force){
  const now = performance.now();
  const hz = Math.max(1, Math.min(30, Number(controller.props.dynamicRefreshHz) || 15));
  if(!force && now - controller.lastPaint < 1000 / hz) return;
  controller.lastPaint = now;
  const radio = dynamicRadioRuntime();
  const state = radio && radio.surfaceState ? radio.surfaceState() : {
    title:'LOT KING RADIO', artist:'EDITOR PREVIEW', paused:true, shuffle:false,
    currentTime:0, duration:0, volume:10, bass:0, speedKmh:0, lastLatG:0, rpm01:.12, throttle:0,
  };
  const signature = [
    state.title, state.artist, state.paused, state.shuffle,
    Math.floor((state.currentTime || 0) * 2), Math.round(state.speedKmh || 0),
    Math.round((state.lastLatG || 0) * 10), state.volume, state.bass,
  ].join('|');
  if(!force && signature === controller.signature) return;
  controller.signature = signature;

  const c = controller.canvas, g = controller.ctx, w = c.width, h = c.height;
  const fmt = seconds => {
    const value = Math.max(0, Number(seconds) || 0) | 0;
    return (value / 60 | 0) + ':' + String(value % 60).padStart(2, '0');
  };
  g.clearRect(0, 0, w, h);
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#101827'); bg.addColorStop(.55, '#070c14'); bg.addColorStop(1, '#140914');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(81,245,199,.35)'; g.lineWidth = Math.max(2, w * .003);
  canvasRoundRect(g, w * .018, h * .035, w * .964, h * .93, h * .05); g.stroke();

  g.fillStyle = '#51f5c7';
  g.font = '800 ' + Math.round(h * .055) + 'px Arial, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('LOT KING  ·  RADIO TAB', w * .055, h * .105);
  g.fillStyle = 'rgba(235,245,255,.55)';
  g.font = '700 ' + Math.round(h * .04) + 'px Arial, sans-serif';
  g.textAlign = 'right';
  g.fillText(Math.round(state.speedKmh || 0) + ' KM/H   ' + Math.abs(state.lastLatG || 0).toFixed(1) + ' G', w * .945, h * .105);

  g.textAlign = 'left';
  g.fillStyle = '#f3f7ff';
  g.font = '900 ' + Math.round(h * .105) + 'px Arial, sans-serif';
  g.fillText(String(state.title || 'NO TRACK').slice(0, 26), w * .055, h * .285);
  g.fillStyle = '#ff7dce';
  g.font = '700 ' + Math.round(h * .052) + 'px Arial, sans-serif';
  g.fillText(String(state.artist || 'RADIO').slice(0, 32), w * .058, h * .39);

  const progress = state.duration > 0 ? Math.max(0, Math.min(1, state.currentTime / state.duration)) : 0;
  const barX = w * .055, barY = h * .48, barW = w * .89, barH = Math.max(6, h * .018);
  g.fillStyle = 'rgba(255,255,255,.12)'; canvasRoundRect(g, barX, barY, barW, barH, barH * .5); g.fill();
  g.fillStyle = '#51f5c7'; canvasRoundRect(g, barX, barY, Math.max(barH, barW * progress), barH, barH * .5); g.fill();
  g.fillStyle = 'rgba(235,245,255,.62)';
  g.font = '700 ' + Math.round(h * .038) + 'px Arial, sans-serif';
  g.fillText(fmt(state.currentTime) + '  /  ' + fmt(state.duration), barX, h * .555);

  const buttons = [
    {key:'prev', label:'◀◀', x:.08, w:.12},
    {key:'play', label:state.paused ? '▶' : 'Ⅱ', x:.225, w:.14},
    {key:'next', label:'▶▶', x:.39, w:.12},
    {key:'shuffle', label:state.shuffle ? 'SHUFFLE ON' : 'SHUFFLE', x:.535, w:.17},
    {key:'volume-down', label:'VOL −', x:.73, w:.095},
    {key:'volume-up', label:'VOL +', x:.84, w:.095},
  ];
  controller.hitAreas = [];
  buttons.forEach(button => {
    const x = w * button.x, y = h * .68, bw = w * button.w, bh = h * .18;
    g.fillStyle = button.key === 'shuffle' && state.shuffle ? 'rgba(81,245,199,.24)' : 'rgba(255,255,255,.08)';
    g.strokeStyle = button.key === 'play' ? '#ff7dce' : 'rgba(145,185,220,.4)';
    g.lineWidth = Math.max(2, w * .002);
    canvasRoundRect(g, x, y, bw, bh, h * .035); g.fill(); g.stroke();
    g.fillStyle = '#edf5ff';
    g.textAlign = 'center';
    g.font = '800 ' + Math.round(h * (button.key === 'play' ? .075 : .045)) + 'px Arial, sans-serif';
    g.fillText(button.label, x + bw * .5, y + bh * .52);
    controller.hitAreas.push({action:button.key, x:x / w, y:y / h, w:bw / w, h:bh / h});
  });
  const bassX = w * .055, bassY = h * .905;
  g.textAlign = 'left'; g.fillStyle = 'rgba(235,245,255,.58)';
  g.font = '700 ' + Math.round(h * .035) + 'px Arial, sans-serif';
  g.fillText(
    'BASS ' + (state.bass || 0) + '/3  ·  VOLUME ' + (state.volume == null ? 10 : state.volume) +
    '/10  ·  OIL ' + Math.round(state.oilC || 90) + '°C  ·  BOOST ' + Number(state.boostBar || 0).toFixed(1) + ' BAR',
    bassX, bassY
  );
  controller.hitAreas.push({action:'bass', x:.04, y:.86, w:.34, h:.11});
  controller.texture.needsUpdate = true;
}

function parseYouTubeSurfaceUrl(value){
  const raw = String(value || '').trim();
  if(!raw) return null;
  try {
    const url = new URL(raw, location.href);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    let videoId = '';
    if(host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    else if(host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')){
      videoId = url.searchParams.get('v') || '';
      if(!videoId){
        const parts = url.pathname.split('/').filter(Boolean);
        const marker = parts.findIndex(part => part === 'embed' || part === 'shorts' || part === 'live');
        if(marker >= 0) videoId = parts[marker + 1] || '';
      }
    }
    videoId = videoId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    const playlistId = String(url.searchParams.get('list') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if(!videoId && !playlistId) return null;
    return {videoId, playlistId};
  } catch(_err){
    return null;
  }
}

function drawDynamicYouTubeSurface(controller){
  const parsed = parseYouTubeSurfaceUrl(controller.props.dynamicVideoUrl || controller.props.dynamicYoutubeUrl);
  controller.youtube = parsed;
  const c = controller.canvas, g = controller.ctx, w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  const bg = g.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#17191f'); bg.addColorStop(1, '#050609');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = parsed ? '#ff0033' : '#7a2637';
  canvasRoundRect(g, w * .38, h * .22, w * .24, h * .34, h * .07); g.fill();
  g.fillStyle = '#fff'; g.beginPath();
  g.moveTo(w * .475, h * .3); g.lineTo(w * .475, h * .48); g.lineTo(w * .56, h * .39); g.closePath(); g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#f5f7fb'; g.font = '800 ' + Math.round(h * .095) + 'px Arial, sans-serif';
  g.fillText(parsed ? 'YOUTUBE' : 'YOUTUBE URL NON VALIDO', w * .5, h * .69);
  g.fillStyle = 'rgba(235,240,250,.62)'; g.font = '600 ' + Math.round(h * .052) + 'px Arial, sans-serif';
  g.fillText(parsed ? 'CLICCA LA SUPERFICIE PER APRIRE IL PLAYER' : 'INCOLLA UN LINK VIDEO O PLAYLIST', w * .5, h * .82);
  controller.texture.needsUpdate = true;
}

let dynamicYouTubeDialog = null;
let dynamicYouTubePlayer = null;
let dynamicYouTubeController = null;
let youtubeIframeApiPromise = null;

function pauseRuntimeMusicExcept(exceptAudio){
  const game = typeof window !== 'undefined' && window.LOT_KING;
  const systems = game && game.systems || {};
  ['radio','menuMusic','loadingMusic','editorMenuMusic','gameMenuMusic'].forEach(key => {
    const system = systems[key];
    if(!system || system.audio === exceptAudio) return;
    if(system.pauseForExternalMedia) system.pauseForExternalMedia();
    else if(system.pause) system.pause();
    else if(system.audio && system.audio.pause) system.audio.pause();
  });
}

function dynamicVideoIsAudible(video){
  return !!(video && !video.muted && Number(video.volume) > 0);
}

function pauseDynamicMediaExcept(exceptController){
  dynamicMaterialTextures.forEach(controller => {
    if(!controller || controller === exceptController) return;
    if(dynamicVideoIsAudible(controller.video) && !controller.video.paused){
      controller.audioFocusPaused = true;
      controller.video.pause();
    }
  });
  if(dynamicYouTubeController && dynamicYouTubeController !== exceptController){
    if(dynamicYouTubePlayer && dynamicYouTubePlayer.pauseVideo){
      try { dynamicYouTubePlayer.pauseVideo(); } catch(_err){}
    } else if(dynamicYouTubeDialog){
      const frame = dynamicYouTubeDialog.querySelector('iframe');
      if(frame && frame.contentWindow){
        frame.contentWindow.postMessage(JSON.stringify({event:'command', func:'pauseVideo', args:[]}), 'https://www.youtube-nocookie.com');
      }
    }
  }
}

const dynamicMediaAudioFocus = {
  owner:null,
  claim(kind, source){
    this.owner = {kind:String(kind || 'media'), source:source || null};
    if(kind === 'surface-video' && source) source.audioFocusPaused = false;
    const sourceAudio = source && source.tagName === 'AUDIO' ? source : null;
    pauseRuntimeMusicExcept(sourceAudio);
    if(kind === 'radio' || kind === 'menu-music') pauseDynamicMediaExcept(null);
    else pauseDynamicMediaExcept(source && source.type ? source : null);
    return this.owner;
  },
  pauseSurfaces(){ pauseDynamicMediaExcept(null); },
};
window.LK_MEDIA_AUDIO_FOCUS = dynamicMediaAudioFocus;

function ensureYouTubeIframeApi(){
  if(window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if(youtubeIframeApiPromise) return youtubeIframeApiPromise;
  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function(){
      if(typeof previousReady === 'function') try { previousReady(); } catch(_err){}
      if(window.YT && window.YT.Player) resolve(window.YT);
      else reject(new Error('YouTube IFrame API unavailable'));
    };
    let script = document.querySelector('script[data-lk-youtube-api]');
    if(!script){
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.lkYoutubeApi = '1';
      script.addEventListener('error', () => reject(new Error('YouTube IFrame API failed to load')), {once:true});
      document.head.appendChild(script);
    }
  });
  return youtubeIframeApiPromise;
}

function ensureDynamicYouTubeFrame(root){
  let frame = root && root.querySelector('iframe');
  if(frame) return frame;
  const panel = root && root.querySelector('.lk-dynamic-youtube-panel');
  if(!panel) return null;
  frame = document.createElement('iframe');
  frame.title = 'YouTube embedded player';
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  panel.appendChild(frame);
  return frame;
}

function closeDynamicYouTubePlayer(){
  if(!dynamicYouTubeDialog) return;
  if(dynamicYouTubePlayer){
    try { dynamicYouTubePlayer.destroy(); } catch(_err){}
    dynamicYouTubePlayer = null;
  }
  dynamicYouTubeController = null;
  const frame = ensureDynamicYouTubeFrame(dynamicYouTubeDialog);
  if(frame) frame.src = 'about:blank';
  dynamicYouTubeDialog.hidden = true;
  document.body.classList.remove('lk-dynamic-player-open');
}

function ensureDynamicYouTubeDialog(){
  if(dynamicYouTubeDialog && dynamicYouTubeDialog.isConnected) return dynamicYouTubeDialog;
  const root = document.createElement('div');
  root.className = 'lk-dynamic-youtube-player';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'YouTube player');
  const panel = document.createElement('div');
  panel.className = 'lk-dynamic-youtube-panel';
  const bar = document.createElement('div');
  bar.className = 'lk-dynamic-youtube-bar';
  const title = document.createElement('strong');
  title.textContent = 'YOUTUBE · VEHICLE DISPLAY';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lk-dynamic-youtube-close';
  close.textContent = '×';
  close.setAttribute('aria-label', 'Close YouTube player');
  bar.append(title, close);
  panel.appendChild(bar);
  root.appendChild(panel);
  ensureDynamicYouTubeFrame(root);
  close.addEventListener('click', closeDynamicYouTubePlayer);
  root.addEventListener('pointerdown', event => {
    if(event.target === root) closeDynamicYouTubePlayer();
  });
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && !root.hidden) closeDynamicYouTubePlayer();
  });
  document.body.appendChild(root);
  dynamicYouTubeDialog = root;
  return root;
}

function openDynamicYouTubePlayer(controller){
  const parsed = controller && (controller.youtube || parseYouTubeSurfaceUrl(controller.props.dynamicVideoUrl || controller.props.dynamicYoutubeUrl));
  if(!parsed) return false;
  const root = ensureDynamicYouTubeDialog();
  const frame = ensureDynamicYouTubeFrame(root);
  if(!frame) return false;
  const params = new URLSearchParams({playsinline:'1', rel:'0', enablejsapi:'1'});
  if(location.origin && location.origin !== 'null') params.set('origin', location.origin);
  let path = parsed.videoId ? '/embed/' + encodeURIComponent(parsed.videoId) : '/embed/videoseries';
  if(parsed.playlistId) params.set('list', parsed.playlistId);
  frame.src = 'https://www.youtube-nocookie.com' + path + '?' + params.toString();
  dynamicYouTubeController = controller;
  dynamicMediaAudioFocus.claim('youtube', controller);
  ensureYouTubeIframeApi().then(YT => {
    if(root.hidden || dynamicYouTubeController !== controller) return;
    if(dynamicYouTubePlayer) try { dynamicYouTubePlayer.destroy(); } catch(_err){}
    dynamicYouTubePlayer = new YT.Player(frame, {
      events:{
        onStateChange:event => {
          if(event.data === YT.PlayerState.PLAYING) dynamicMediaAudioFocus.claim('youtube', controller);
        },
      },
    });
  }).catch(error => {
    console.warn('LotKing YouTube audio focus: player state API unavailable; open-time exclusivity remains active', error);
  });
  root.hidden = false;
  document.body.classList.add('lk-dynamic-player-open');
  if(document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  const close = root.querySelector('.lk-dynamic-youtube-close');
  if(close) close.focus({preventScroll:true});
  return true;
}

function disposeDynamicMaterialTexture(controller){
  if(!controller) return;
  releaseDynamicRadioSurface(controller);
  dynamicMaterialTextures.delete(controller);
  if(controller.surfaceProxy){
    const proxy = controller.surfaceProxy;
    if(proxy.parent) proxy.parent.remove(proxy);
    const materials = Array.isArray(proxy.material) ? proxy.material : [proxy.material];
    materials.forEach(material => { if(material && material.dispose) material.dispose(); });
    controller.surfaceProxy = null;
    controller.surfaceMesh = null;
    controller.surfaceMaterial = null;
  }
  if(controller === dynamicYouTubeController) closeDynamicYouTubePlayer();
  if(controller.ownerMaterial && controller.disposeListener && controller.ownerMaterial.removeEventListener){
    controller.ownerMaterial.removeEventListener('dispose', controller.disposeListener);
  }
  controller.ownerMaterial = null;
  controller.disposeListener = null;
  if(controller.video){
    try { controller.video.pause(); controller.video.removeAttribute('src'); controller.video.load(); } catch(_err){}
  }
  if(controller.texture && controller.texture.dispose) controller.texture.dispose();
}

function bindDynamicMaterialTexture(controller, material){
  if(!controller || !material || controller.ownerMaterial === material) return;
  if(controller.ownerMaterial && controller.disposeListener && controller.ownerMaterial.removeEventListener){
    controller.ownerMaterial.removeEventListener('dispose', controller.disposeListener);
  }
  controller.ownerMaterial = material;
  controller.disposeListener = () => controller.dispose();
  if(material.addEventListener) material.addEventListener('dispose', controller.disposeListener);
}

function bindDynamicSurfaceProxy(controller, mesh, material){
  if(!controller || !mesh || !mesh.isMesh || !mesh.geometry || !material) return;
  if(controller.surfaceProxy && controller.surfaceMesh === mesh && controller.surfaceMaterial === material) return;
  if(controller.surfaceProxy){
    const previous = controller.surfaceProxy;
    if(previous.parent) previous.parent.remove(previous);
    const previousMaterials = Array.isArray(previous.material) ? previous.material : [previous.material];
    previousMaterials.forEach(entry => { if(entry && entry.dispose) entry.dispose(); });
  }
  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const selectedIndices = new Set();
  sourceMaterials.forEach((entry, index) => { if(entry === material) selectedIndices.add(index); });
  if(!selectedIndices.size) selectedIndices.add(0);
  // Raycaster honours geometry groups and material.visible. Reusing the exact
  // source geometry with only the authored slot raycast-visible creates a
  // precise interaction surface without duplicating vertex/index buffers.
  const proxyMaterials = sourceMaterials.map((_entry, index) => new THREE.MeshBasicMaterial({
    visible:selectedIndices.has(index),
    side:THREE.DoubleSide,
    transparent:true,
    opacity:0,
    depthTest:false,
    depthWrite:false,
    colorWrite:false,
    fog:false,
    toneMapped:false,
  }));
  const proxy = new THREE.Mesh(mesh.geometry, Array.isArray(mesh.material) ? proxyMaterials : proxyMaterials[0]);
  proxy.name = (mesh.name || 'Material screen') + ' · Interaction Surface';
  proxy.frustumCulled = false;
  proxy.renderOrder = 100000;
  proxy.userData = {
    lkDynamicSurfaceProxy:true,
    lkDynamicSurfaceController:controller,
    nonExportable:true,
    logicElementInternal:true,
  };
  mesh.add(proxy);
  controller.surfaceProxy = proxy;
  controller.surfaceMesh = mesh;
  controller.surfaceMaterial = material;
}

function ensureDynamicScreenUv(mesh, controller){
  const texture = controller && controller.texture;
  if(!texture) return;
  if(!mesh || !mesh.geometry || controller.props.dynamicAutoUv === false){
    texture.channel = 0;
    return;
  }
  const geometry = mesh.geometry;
  geometry.userData = geometry.userData || {};
  const cached = geometry.userData.lkDynamicScreenUv;
  if(cached && geometry.getAttribute(cached.attributeName)){
    texture.channel = cached.channel;
    return;
  }
  const position = geometry.getAttribute && geometry.getAttribute('position');
  if(!position || !position.count){
    texture.channel = 0;
    return;
  }
  const available = [
    {attributeName:'uv3', channel:3},
    {attributeName:'uv2', channel:2},
    {attributeName:'uv1', channel:1},
  ].find(entry => !geometry.getAttribute(entry.attributeName));
  if(!available){
    texture.channel = 0;
    return;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for(let index = 0; index < position.count; index++){
    const values = [position.getX(index), position.getY(index), position.getZ(index)];
    for(let axis = 0; axis < 3; axis++){
      if(values[axis] < min[axis]) min[axis] = values[axis];
      if(values[axis] > max[axis]) max[axis] = values[axis];
    }
  }
  const axes = [0, 1, 2].sort((a, b) => (max[b] - min[b]) - (max[a] - min[a]));
  const uAxis = axes[0];
  const vAxis = axes[1];
  const uSpan = max[uAxis] - min[uAxis];
  const vSpan = max[vAxis] - min[vAxis];
  if(!(uSpan > 1e-7 && vSpan > 1e-7)){
    texture.channel = 0;
    return;
  }
  const uv = new Float32Array(position.count * 2);
  const padding = .015;
  const range = 1 - padding * 2;
  for(let index = 0; index < position.count; index++){
    const values = [position.getX(index), position.getY(index), position.getZ(index)];
    uv[index * 2] = padding + ((values[uAxis] - min[uAxis]) / uSpan) * range;
    uv[index * 2 + 1] = padding + ((values[vAxis] - min[vAxis]) / vSpan) * range;
  }
  geometry.setAttribute(available.attributeName, new THREE.Float32BufferAttribute(uv, 2));
  geometry.userData.lkDynamicScreenUv = available;
  texture.channel = available.channel;
}

function applyDynamicTextureTransform(controller){
  const texture = controller && controller.texture;
  if(!texture) return;
  const props = controller.props || {};
  texture.repeat.set(
    props.dynamicRepeatX == null ? 1 : Number(props.dynamicRepeatX) || 1,
    props.dynamicRepeatY == null ? 1 : Number(props.dynamicRepeatY) || 1
  );
  texture.offset.set(
    props.dynamicOffsetX == null ? 0 : Number(props.dynamicOffsetX) || 0,
    props.dynamicOffsetY == null ? 0 : Number(props.dynamicOffsetY) || 0
  );
  texture.center.set(.5, .5);
  texture.rotation = props.dynamicRotation == null ? 0 : Number(props.dynamicRotation) || 0;
}

function installDynamicSaturationShader(material, controller){
  if(!material || !controller) return;
  const activeRenderer=window.LOT_KING&&window.LOT_KING.core&&window.LOT_KING.core.renderer;
  if(activeRenderer&&activeRenderer.isWebGPURenderer) return;
  const saturation = Math.max(0, Math.min(2, Number(controller.props.dynamicSaturation == null ? 1 : controller.props.dynamicSaturation)));
  if(controller.saturationUniform) controller.saturationUniform.value = saturation;
  if(controller.shaderMaterial === material) return;
  const baseCompile = controller.baseOnBeforeCompile;
  const baseCacheKey = controller.baseCustomProgramCacheKey;
  const baseSignature = baseCompile ? String(baseCompile) : '';
  material.onBeforeCompile = function(shader, renderer){
    if(typeof baseCompile === 'function') baseCompile.call(this, shader, renderer);
    const currentSaturation = Math.max(0, Math.min(2,
      Number(controller.props.dynamicSaturation == null ? 1 : controller.props.dynamicSaturation)));
    shader.uniforms.lkDynamicScreenSaturation = {value:currentSaturation};
    controller.saturationUniform = shader.uniforms.lkDynamicScreenSaturation;
    shader.fragmentShader = 'uniform float lkDynamicScreenSaturation;\n' + shader.fragmentShader;
    const output = '#include <opaque_fragment>';
    if(shader.fragmentShader.includes(output)){
      shader.fragmentShader = shader.fragmentShader.replace(output, [
        'float lkDynamicScreenLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));',
        'outgoingLight = max(vec3(0.0), mix(vec3(lkDynamicScreenLuma), outgoingLight, lkDynamicScreenSaturation));',
        output,
      ].join('\n'));
    }
  };
  material.customProgramCacheKey = function(){
    return baseSignature + '|lk-dynamic-screen-saturation-v1';
  };
  controller.shaderMaterial = material;
  controller.baseCustomProgramCacheKey = baseCacheKey;
  material.needsUpdate = true;
}

function applyDynamicMaterialOverride(material, controller, screenEmission, mesh){
  if(!material || !controller || !controller.texture) return;
  const previousChannel = controller.texture.channel;
  const shaderFeaturesChanged =
    material.map !== controller.texture ||
    ('vertexColors' in material && material.vertexColors !== false) ||
    (material.emissive && material.emissiveMap !== controller.texture) ||
    (material.roughness != null && material.roughnessMap != null) ||
    (material.metalness != null && material.metalnessMap != null);
  ensureDynamicScreenUv(mesh, controller);
  applyDynamicTextureTransform(controller);
  material.map = controller.texture;
  // Three.js multiplies every color map by material.color and optional vertex
  // colors. Dark imported GLB tints made a correctly assigned HUD/video map
  // look black, so the screen layer temporarily uses a neutral white base.
  if(material.color) material.color.set(0xffffff);
  if('vertexColors' in material) material.vertexColors = false;
  if(material.emissive){
    material.emissive.set(0xffffff);
    material.emissiveMap = controller.texture;
    const authored = screenEmission != null
      ? Number(screenEmission)
      : (controller.props.dynamicScreenEmission != null ? Number(controller.props.dynamicScreenEmission) : 1);
    material.emissiveIntensity = Math.max(0, Number.isFinite(authored) ? authored : 1);
  }
  if(material.roughness != null){
    material.roughness = Math.max(0, Math.min(1,
      Number(controller.props.dynamicRoughness == null ? .72 : controller.props.dynamicRoughness)));
    material.roughnessMap = null;
  }
  if(material.metalness != null){
    material.metalness = Math.max(0, Math.min(1,
      Number(controller.props.dynamicMetalness == null ? 0 : controller.props.dynamicMetalness)));
    material.metalnessMap = null;
  }
  installDynamicSaturationShader(material, controller);
  bindDynamicSurfaceProxy(controller, mesh, material);
  if(shaderFeaturesChanged || previousChannel !== controller.texture.channel) material.needsUpdate = true;
}

function restoreDynamicMaterialBase(material, base){
  if(!material || !base) return;
  material.map = base.map || null;
  material.emissiveMap = base.emissiveMap || null;
  if(material.color && base.color) material.color.copy(base.color);
  if(material.emissive && base.emissive) material.emissive.copy(base.emissive);
  if(material.emissiveIntensity != null) material.emissiveIntensity = base.emissiveIntensity;
  if('vertexColors' in material && base.vertexColors != null) material.vertexColors = base.vertexColors;
  if(material.roughness != null && base.roughness != null) material.roughness = base.roughness;
  if(material.metalness != null && base.metalness != null) material.metalness = base.metalness;
  if('roughnessMap' in material) material.roughnessMap = base.roughnessMap || null;
  if('metalnessMap' in material) material.metalnessMap = base.metalnessMap || null;
  if(typeof base.onBeforeCompile === 'function') material.onBeforeCompile = base.onBeforeCompile;
  if(typeof base.customProgramCacheKey === 'function') material.customProgramCacheKey = base.customProgramCacheKey;
  material.needsUpdate = true;
}

function createDynamicMaterialTexture(props){
  if(props.dynamicMapEnabled === false) return null;
  let type = props.dynamicMapType || 'none';
  const requestedUrl = String(props.dynamicVideoUrl || props.dynamicYoutubeUrl || '').trim();
  if(type === 'video' && /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(requestedUrl)) type = 'youtube';
  if(type !== 'vehicle-hud' && type !== 'radio-hud' && type !== 'youtube' && type !== 'video') return null;
  if(type === 'video'){
    const src = requestedUrl;
    if(!src) return null;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.playsInline = true;
    video.loop = props.dynamicVideoLoop !== false;
    video.muted = props.dynamicVideoMuted !== false;
    video.src = src;
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const controller = {
      type, props:Object.assign({}, props), texture, video, lastPaint:0,
      audioFocusPaused:false, dispose:null, activate:null,
    };
    controller.dispose = () => disposeDynamicMaterialTexture(controller);
    controller.activate = () => {
      controller.audioFocusPaused = false;
      if(dynamicVideoIsAudible(video)) dynamicMediaAudioFocus.claim('surface-video', controller);
      video.play().catch(() => {});
      return true;
    };
    dynamicMaterialTextures.add(controller);
    const claimVideoFocus = () => {
      if(dynamicVideoIsAudible(video) && !video.paused) dynamicMediaAudioFocus.claim('surface-video', controller);
    };
    video.addEventListener('play', claimVideoFocus);
    video.addEventListener('volumechange', claimVideoFocus);
    if(dynamicVideoIsAudible(video)) dynamicMediaAudioFocus.claim('surface-video', controller);
    video.play().catch(() => {});
    return controller;
  }
  const size = Math.max(256, Math.min(2048, Number(props.dynamicResolution) || 1024));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = Math.max(128, Math.round(size / 2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  const controller = {
    type, props:Object.assign({}, props), canvas, ctx:canvas.getContext('2d'),
    texture, video:null, lastPaint:0, signature:'', hitAreas:[], dispose:null, activate:null,
  };
  retainDynamicRadioSurface(controller);
  controller.dispose = () => disposeDynamicMaterialTexture(controller);
  if(type === 'radio-hud'){
    controller.activate = (x, y) => {
      const hit = controller.hitAreas.find(area => x >= area.x && x <= area.x + area.w && y >= area.y && y <= area.y + area.h);
      const radio = dynamicRadioRuntime();
      if(!radio) return false;
      if(hit && radio.surfaceAction && radio.surfaceAction(hit.action)){
        drawDynamicRadioHud(controller, true);
        return true;
      }
      // The whole authored display is interactive, not only its small painted
      // buttons. A click on artwork/title opens the full Radio TAB as a clear,
      // accessible fallback while the in-world controls remain direct.
      if(radio.toggleOpen){
        radio.toggleOpen(true);
        return true;
      }
      return false;
    };
  } else if(type === 'youtube'){
    controller.activate = () => openDynamicYouTubePlayer(controller);
  }
  dynamicMaterialTextures.add(controller);
  if(type === 'vehicle-hud') drawDynamicVehicleHud(controller, true);
  else if(type === 'radio-hud') drawDynamicRadioHud(controller, true);
  else drawDynamicYouTubeSurface(controller);
  return controller;
}

function applyMatProps(obj, p){
  if(!p) return;
  const loadTexture = (src, colorData) => {
    const tx = new THREE.TextureLoader().load(src);
    if(colorData) tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return budgetTexture(tx);
  };
  const resolveTextureUrl = (src, dbKey) => {
    if(dbKey && window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(dbKey);
    return Promise.resolve(src || null);
  };
  const applyTextureTransform = (tx, props) => {
    if(!tx || !props) return;
    tx.repeat.set(
      props.repeatX != null ? props.repeatX : tx.repeat.x,
      props.repeatY != null ? props.repeatY : tx.repeat.y
    );
    tx.offset.set(
      props.offsetX != null ? props.offsetX : tx.offset.x,
      props.offsetY != null ? props.offsetY : tx.offset.y
    );
    if(props.rotation != null){
      tx.center.set(.5, .5);
      tx.rotation = props.rotation;
    }
    tx.needsUpdate = true;
  };
  const preserveMaterialMeta = (next, m) => {
    if(!next || !m) return next;
    next.name = m.name || next.name;
    next.transparent = !!m.transparent;
    next.opacity = m.opacity != null ? m.opacity : next.opacity;
    next.alphaTest = m.alphaTest != null ? m.alphaTest : next.alphaTest;
    next.depthWrite = m.depthWrite != null ? m.depthWrite : next.depthWrite;
    next.depthTest = m.depthTest != null ? m.depthTest : next.depthTest;
    next.side = m.side != null ? m.side : next.side;
    next.blending = m.blending != null ? m.blending : next.blending;
    next.vertexColors = m.vertexColors != null ? m.vertexColors : next.vertexColors;
    next.fog = m.fog != null ? m.fog : next.fog;
    next.map = m.map || next.map || null;
    next.normalMap = m.normalMap || next.normalMap || null;
    next.roughnessMap = m.roughnessMap || next.roughnessMap || null;
    next.metalnessMap = m.metalnessMap || next.metalnessMap || null;
    next.alphaMap = m.alphaMap || next.alphaMap || null;
    next.emissiveMap = m.emissiveMap || next.emissiveMap || null;
    next.aoMap = m.aoMap || next.aoMap || null;
    next.lightMap = m.lightMap || next.lightMap || null;
    next.bumpMap = m.bumpMap || next.bumpMap || null;
    next.displacementMap = m.displacementMap || next.displacementMap || null;
    next.envMap = m.envMap || next.envMap || null;
    if(m.emissive && next.emissive) next.emissive.copy(m.emissive);
    if(m.emissiveIntensity != null && next.emissiveIntensity != null) next.emissiveIntensity = m.emissiveIntensity;
    if(m.normalScale && next.normalScale) next.normalScale.copy(m.normalScale);
    if(m.userData) next.userData = cloneData(m.userData);
    if(m.lkDynamicTextureController){
      next.lkDynamicTextureController = m.lkDynamicTextureController;
      bindDynamicMaterialTexture(next.lkDynamicTextureController, next);
      delete m.lkDynamicTextureController;
    }
    next.needsUpdate = true;
    return next;
  };
  const convertToStandard = m => {
    // MeshPhysicalMaterial is derived from Standard and may expose both flags.
    // It still has transmission/clearcoat state, so it must really be replaced
    // when the author selects the Standard material kind.
    if(m && m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial) return m;
    return preserveMaterialMeta(new THREE.MeshStandardMaterial({
      color: m && m.color ? m.color.clone() : new THREE.Color(0xffffff),
      map: m ? m.map || null : null,
      normalMap: m ? m.normalMap || null : null,
      roughnessMap: m ? m.roughnessMap || null : null,
      metalnessMap: m ? m.metalnessMap || null : null,
      alphaMap: m ? m.alphaMap || null : null,
      emissiveMap: m ? m.emissiveMap || null : null,
      roughness: m && m.roughness != null ? m.roughness : .7,
      metalness: m && m.metalness != null ? m.metalness : 0,
      transparent: m ? !!m.transparent : false,
      opacity: m && m.opacity != null ? m.opacity : 1,
      side: m && m.side != null ? m.side : THREE.FrontSide,
    }), m);
  };
  const convertToPhysical = m => {
    if(m && m.isMeshPhysicalMaterial) return m;
    const Mat = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const base = convertToStandard(m);
    return preserveMaterialMeta(new Mat({
      color: base.color ? base.color.clone() : new THREE.Color(0xffffff),
      map: base.map || null,
      normalMap: base.normalMap || null,
      roughnessMap: base.roughnessMap || null,
      metalnessMap: base.metalnessMap || null,
      alphaMap: base.alphaMap || null,
      emissiveMap: base.emissiveMap || null,
      roughness: base.roughness != null ? base.roughness : .35,
      metalness: base.metalness != null ? base.metalness : 0,
      transparent: !!base.transparent,
      opacity: base.opacity != null ? base.opacity : 1,
      side: base.side != null ? base.side : THREE.FrontSide,
    }), base);
  };
  const sketchMonoTextureCache = new WeakMap();
  const sketchColorTextureCache = new WeakMap();
  const sketchGradientTextures = new Map();
  const sketchLuminance = color => color ? Math.max(0, Math.min(1,
    color.r * .2126 + color.g * .7152 + color.b * .0722)) : 1;
  const sketchGradientMap = bands => {
    const count = Math.max(3, Math.min(8, Math.round(Number(bands) || 5)));
    if(sketchGradientTextures.has(count)) return sketchGradientTextures.get(count);
    const values = new Uint8Array(count);
    for(let i=0;i<count;i++) values[i] = Math.round(28 + (225 * i / Math.max(1, count - 1)));
    const texture = new THREE.DataTexture(values, count, 1, THREE.RedFormat);
    texture.name = 'Lot King sketch tone bands ' + count;
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    texture.userData = Object.assign({}, texture.userData, {lkSharedSketchGradient:true});
    sketchGradientTextures.set(count, texture);
    return texture;
  };
  const copySketchTextureTransform = (target, source) => {
    if(!target || !source) return target;
    ['wrapS','wrapT','magFilter','minFilter','anisotropy','mapping','channel','flipY','premultiplyAlpha','unpackAlignment','colorSpace'].forEach(key => {
      if(source[key] != null) target[key] = source[key];
    });
    if(source.repeat && target.repeat) target.repeat.copy(source.repeat);
    if(source.offset && target.offset) target.offset.copy(source.offset);
    if(source.center && target.center) target.center.copy(source.center);
    if(source.rotation != null) target.rotation = source.rotation;
    target.needsUpdate = true;
    return target;
  };
  const monochromeSketchMap = source => {
    if(!source || typeof document === 'undefined') return null;
    const cached = sketchMonoTextureCache.get(source);
    if(cached) return cached;
    const image = source.image;
    const width = Math.max(1, Math.min(1536, Number(image && (image.naturalWidth || image.videoWidth || image.width)) || 0));
    const height = Math.max(1, Math.min(1536, Number(image && (image.naturalHeight || image.videoHeight || image.height)) || 0));
    if(!image || !width || !height) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', {alpha:true});
      if(!context) return null;
      context.filter = 'grayscale(1) contrast(1.08)';
      context.drawImage(image, 0, 0, width, height);
      const texture = copySketchTextureTransform(new THREE.CanvasTexture(canvas), source);
      texture.name = (source.name || 'Material map') + ' · monochrome sketch';
      texture.userData = Object.assign({}, texture.userData, {lkRuntimeSketchDerived:true});
      sketchMonoTextureCache.set(source, texture);
      return texture;
    } catch(error){
      console.warn('LotKing sketch: material texture could not be converted to monochrome; using tonal base color.', error);
      return null;
    }
  };
  const colorSketchMap = (source, settings) => {
    if(!source || typeof document === 'undefined') return null;
    const bands=Math.max(3,Math.min(8,Math.round(Number(settings&&settings.toneBands)||5)));
    const pigment=Math.max(0,Math.min(1,Number(settings&&settings.pigmentStrength)||0));
    const paperTint=Math.max(0,Math.min(1,Number(settings&&settings.paperTint)||0));
    const signature=bands+'|'+pigment.toFixed(2)+'|'+paperTint.toFixed(2);
    let variants=sketchColorTextureCache.get(source);
    if(variants&&variants.has(signature))return variants.get(signature);
    const image=source.image;
    const sourceWidth=Number(image&&(image.naturalWidth||image.videoWidth||image.width))||0;
    const sourceHeight=Number(image&&(image.naturalHeight||image.videoHeight||image.height))||0;
    if(!image||!sourceWidth||!sourceHeight)return null;
    const scale=Math.min(1,1536/Math.max(sourceWidth,sourceHeight));
    const width=Math.max(1,Math.round(sourceWidth*scale));
    const height=Math.max(1,Math.round(sourceHeight*scale));
    try{
      const canvas=document.createElement('canvas');
      canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{alpha:true,willReadFrequently:true});
      if(!context)return null;
      context.drawImage(image,0,0,width,height);
      const pixels=context.getImageData(0,0,width,height),data=pixels.data;
      const paletteSteps=8+Math.round(bands*.85),toneSteps=Math.max(2,bands-1);
      for(let i=0;i<data.length;i+=4){
        const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;
        const l=r*.2126+g*.7152+b*.0722;
        const tone=Math.round(l*toneSteps)/toneSteps;
        const saturation=.82+pigment*.32;
        const grain=((((i>>2)*1103515245+12345)>>>16)&255)/255-.5;
        const channel=value=>{
          const painted=tone+(value-l)*saturation;
          const banded=Math.round(Math.max(0,Math.min(1,painted))*paletteSteps)/paletteSteps;
          const deposited=painted*(1-pigment*.58)+banded*(pigment*.58)+grain*pigment*.035;
          return Math.max(0,Math.min(1,deposited*(1-paperTint*.035)+paperTint*.035));
        };
        data[i]=Math.round(channel(r)*255);
        data[i+1]=Math.round(channel(g)*250+paperTint*5);
        data[i+2]=Math.round(channel(b)*242+paperTint*13);
      }
      context.putImageData(pixels,0,0);
      const texture=copySketchTextureTransform(new THREE.CanvasTexture(canvas),source);
      texture.name=(source.name||'Material map')+' · color pigment sketch';
      texture.userData=Object.assign({},texture.userData,{lkRuntimeSketchDerived:true,lkSketchPigmentSignature:signature});
      if(!variants){variants=new Map();sketchColorTextureCache.set(source,variants);}
      variants.set(signature,texture);
      return texture;
    }catch(error){
      console.warn('LotKing sketch: material texture could not be filtered into color pigment; preserving source texture.',error);
      return null;
    }
  };
  const normalizedSketchMaterial = (settings, material) => {
    const source = settings && typeof settings === 'object' ? settings : {};
    const mode = source.mode === 'monochrome' ? 'monochrome' : (source.mode === 'color' ? 'color' : 'off');
    return {
      enabled:source.enabled === true && mode !== 'off',
      mode,
      toneBands:Math.max(3, Math.min(8, Math.round(Number(source.toneBands) || 5))),
      preserveTexture:source.preserveTexture !== false,
      paperTint:Math.max(0, Math.min(1, Number.isFinite(Number(source.paperTint)) ? Number(source.paperTint) : .12)),
      pigmentStrength:Math.max(0, Math.min(1, Number.isFinite(Number(source.pigmentStrength)) ? Number(source.pigmentStrength) : .82)),
      sourceColor:source.sourceColor == null && material && material.color ? material.color.getHex() : source.sourceColor,
    };
  };
  const applySketchMaterialLayer = (material, settings) => {
    if(!material) return material;
    const source = material.lkSketchOriginalMaterial || material;
    const next = normalizedSketchMaterial(settings, source);
    const oldMap = material.map;
    const oldGradient = material.gradientMap;
    const baseColor = source.color && source.color.clone ? source.color.clone() : new THREE.Color(0xffffff);
    if(next.mode === 'monochrome'){
      const luma = sketchLuminance(baseColor);
      material.color.setRGB(luma, luma, luma);
      material.map = next.preserveTexture ? monochromeSketchMap(source.map) : null;
    } else {
      const luma=sketchLuminance(baseColor),saturation=.82+next.pigmentStrength*.32;
      material.color.setRGB(
        Math.max(0,Math.min(1,luma+(baseColor.r-luma)*saturation)),
        Math.max(0,Math.min(1,luma+(baseColor.g-luma)*saturation)),
        Math.max(0,Math.min(1,luma+(baseColor.b-luma)*saturation))
      );
      material.map = next.preserveTexture ? colorSketchMap(source.map,next) || source.map || null : null;
    }
    if(next.paperTint > 0 && material.color){
      material.color.lerp(new THREE.Color(0xfff1d5), next.paperTint * .12);
    }
    material.gradientMap = sketchGradientMap(next.toneBands);
    material.userData = material.userData || {};
    material.userData.lkSketchMaterial = next;
    material.userData.lkSketchMaterialActive = true;
    if(oldMap !== material.map || oldGradient !== material.gradientMap) material.needsUpdate = true;
    return material;
  };
  const convertToSketchMaterial = (material, settings) => {
    if(!material || !THREE.MeshToonMaterial) return material;
    if(material.lkSketchOriginalMaterial) return applySketchMaterialLayer(material, settings);
    const toon = preserveMaterialMeta(new THREE.MeshToonMaterial({
      color:material.color && material.color.clone ? material.color.clone() : new THREE.Color(0xffffff),
      map:material.map || null,
      normalMap:material.normalMap || null,
      alphaMap:material.alphaMap || null,
      emissiveMap:material.emissiveMap || null,
      emissive:material.emissive && material.emissive.clone ? material.emissive.clone() : new THREE.Color(0x000000),
      emissiveIntensity:material.emissiveIntensity == null ? 1 : material.emissiveIntensity,
      transparent:!!material.transparent,
      opacity:material.opacity == null ? 1 : material.opacity,
      alphaTest:material.alphaTest == null ? 0 : material.alphaTest,
      depthTest:material.depthTest !== false,
      depthWrite:material.depthWrite !== false,
      blending:material.blending,
      vertexColors:material.vertexColors === true,
      fog:material.fog !== false,
      side:material.side == null ? THREE.FrontSide : material.side,
    }), material);
    toon.lkSketchOriginalMaterial = material;
    return applySketchMaterialLayer(toon, settings);
  };
  const restoreOriginalSketchMaterial = material => {
    if(!material || !material.lkSketchOriginalMaterial) return material;
    const original = material.lkSketchOriginalMaterial;
    if(material.lkDynamicTextureController){
      original.lkDynamicTextureController = material.lkDynamicTextureController;
      bindDynamicMaterialTexture(original.lkDynamicTextureController, original);
      delete material.lkDynamicTextureController;
    }
    if(original.userData){
      delete original.userData.lkSketchMaterial;
      delete original.userData.lkSketchMaterialActive;
    }
    if(material.dispose) material.dispose();
    original.needsUpdate = true;
    return original;
  };
  const captureCarPaintBase = material => {
    if(!material || material.lkCarPaintBase) return;
    material.lkCarPaintBase = {
      color:material.color && material.color.clone(),
      map:material.map || null,
      roughnessMap:material.roughnessMap || null,
      metalnessMap:material.metalnessMap || null,
      roughness:material.roughness,
      metalness:material.metalness,
      clearcoat:material.clearcoat,
      clearcoatRoughness:material.clearcoatRoughness,
      iridescence:material.iridescence,
      iridescenceIOR:material.iridescenceIOR,
      iridescenceThicknessRange:Array.isArray(material.iridescenceThicknessRange) ? material.iridescenceThicknessRange.slice() : null,
      specularIntensity:material.specularIntensity,
      envMapIntensity:material.envMapIntensity,
      transmission:material.transmission,
      ior:material.ior,
      opacity:material.opacity,
      transparent:material.transparent,
      depthWrite:material.depthWrite,
    };
  };
  const restoreCarPaintBase = material => {
    const base = material && material.lkCarPaintBase;
    if(!base) return material;
    if(material.color && base.color) material.color.copy(base.color);
    material.map = base.map;
    material.roughnessMap = base.roughnessMap;
    material.metalnessMap = base.metalnessMap;
    const restore = key => { if(base[key] != null && key in material) material[key] = base[key]; };
    ['roughness','metalness','clearcoat','clearcoatRoughness','iridescence','iridescenceIOR',
      'specularIntensity','envMapIntensity','transmission','ior','opacity'].forEach(restore);
    if(base.iridescenceThicknessRange && 'iridescenceThicknessRange' in material){
      material.iridescenceThicknessRange = base.iridescenceThicknessRange.slice();
    }
    material.transparent = !!base.transparent;
    material.depthWrite = base.depthWrite !== false;
    delete material.lkCarPaintBase;
    material.needsUpdate = true;
    return material;
  };
  const restoreOriginalCarPaintMaterial = material => {
    if(!material || !material.lkCarPaintOriginalMaterial) return restoreCarPaintBase(material);
    const original = material.lkCarPaintOriginalMaterial;
    const dynamicController = material.lkDynamicTextureController;
    if(dynamicController){
      original.lkDynamicTextureController = dynamicController;
      original.map = material.map;
      if(original.emissiveMap === dynamicController.baseEmissiveMap || material.emissiveMap === dynamicController.texture){
        original.emissiveMap = material.emissiveMap;
      }
      bindDynamicMaterialTexture(dynamicController, original);
      delete material.lkDynamicTextureController;
    }
    original.needsUpdate = true;
    return original;
  };
  const applyCarPaintLayer = (material, settings) => {
    if(!material || !settings) return;
    captureCarPaintBase(material);
    const featureState = {
      map:!!material.map,
      clearcoat:Number(material.clearcoat) > 0,
      iridescence:Number(material.iridescence) > 0,
    };
    const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
    const mix = (a, b, t) => a + (b - a) * t;
    const kind = settings.kind === 'vinyl' ? 'vinyl' : 'paint';
    const metallic = clamp01(settings.metallic == null ? (kind === 'paint' ? .58 : .05) : settings.metallic);
    const finish = clamp01(settings.finish == null ? .82 : settings.finish);
    const coat = clamp01(settings.clearcoat == null ? (kind === 'paint' ? .9 : .55) : settings.clearcoat);
    const pearl = clamp01(settings.pearl || 0);
    if(material.color) material.color.set(settings.color == null ? 0xc20d19 : settings.color);
    material.map = settings.preserveBaseMap === true ? material.lkCarPaintBase.map : null;
    material.roughnessMap = null;
    material.metalnessMap = null;
    material.roughness = mix(kind === 'paint' ? .58 : .72, kind === 'paint' ? .075 : .14, finish);
    material.metalness = kind === 'paint' ? (.025 + metallic * .58) : (metallic * .18);
    if('clearcoat' in material) material.clearcoat = coat;
    if('clearcoatRoughness' in material) material.clearcoatRoughness = mix(.36, .025, finish);
    if('specularIntensity' in material) material.specularIntensity = mix(.55, 1, finish);
    if('envMapIntensity' in material) material.envMapIntensity = mix(.7, 1.85, finish) * (1 + metallic * .22);
    if('ior' in material) material.ior = kind === 'paint' ? 1.52 : 1.47;
    if('iridescence' in material) material.iridescence = pearl * .42;
    if('iridescenceIOR' in material) material.iridescenceIOR = 1.3;
    if('iridescenceThicknessRange' in material) material.iridescenceThicknessRange = [180, 460];
    if('transmission' in material) material.transmission = 0;
    material.opacity = 1;
    material.transparent = false;
    material.depthWrite = true;
    material.userData = material.userData || {};
    material.userData.lkCarPaintActive = true;
    if(featureState.map !== !!material.map ||
      featureState.clearcoat !== (Number(material.clearcoat) > 0) ||
      featureState.iridescence !== (Number(material.iridescence) > 0)){
      material.needsUpdate = true;
    }
  };
  const applyFlat = (patch, targetSlot) => {
    if(!patch) return;
    // glTF commonly reuses one Material instance on multiple meshes. A
    // per-slot edit must first split that reference, otherwise editing a
    // second dashboard silently replaces/disposes the first one's live map.
    if(targetSlot && targetSlot !== 'all'){
      const uses = new Map();
      obj.traverse(node => {
        if(!node || !node.isMesh || !node.material) return;
        (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => {
          if(material) uses.set(material, (uses.get(material) || 0) + 1);
        });
      });
      let splitMeshIndex = 0;
      obj.traverse(node => {
        if(!node || !node.isMesh || !node.material) return;
        const source = Array.isArray(node.material) ? node.material.slice() : [node.material];
        let changed = false;
        source.forEach((material, materialIndex) => {
          if(!material || !materialSlotMatches(node, splitMeshIndex, materialIndex, targetSlot) || (uses.get(material) || 0) < 2) return;
          const clone = material.clone();
          clone.userData = Object.assign({}, clone.userData || {}, {lkMaterialSlotInstance:targetSlot});
          const existing = material.lkDynamicTextureController;
          if(existing && !Object.prototype.hasOwnProperty.call(patch, 'dynamicMapType')){
            const copied = createDynamicMaterialTexture(existing.props || {});
            if(copied){
              copied.baseMap = existing.baseMap || null;
              copied.baseEmissiveMap = existing.baseEmissiveMap || null;
              copied.baseColor = existing.baseColor && existing.baseColor.clone ? existing.baseColor.clone() : null;
              copied.baseEmissive = existing.baseEmissive && existing.baseEmissive.clone ? existing.baseEmissive.clone() : null;
              copied.baseEmissiveIntensity = existing.baseEmissiveIntensity;
              copied.baseVertexColors = existing.baseVertexColors;
              copied.baseRoughness = existing.baseRoughness;
              copied.baseMetalness = existing.baseMetalness;
              copied.baseRoughnessMap = existing.baseRoughnessMap || null;
              copied.baseMetalnessMap = existing.baseMetalnessMap || null;
              copied.baseOnBeforeCompile = existing.baseOnBeforeCompile;
              copied.baseCustomProgramCacheKey = existing.baseCustomProgramCacheKey;
              clone.lkDynamicTextureController = copied;
              bindDynamicMaterialTexture(copied, clone);
              applyDynamicMaterialOverride(clone, copied, null, node);
            }
          }
          source[materialIndex] = clone;
          changed = true;
        });
        if(changed) node.material = Array.isArray(node.material) ? source : source[0];
        splitMeshIndex++;
      });
    }
    let meshIndex = 0;
    obj.traverse(o => {
      if(!o.isMesh || !o.material) return;
      if(o.userData && o.userData.lkDynamicSurfaceProxy) return;
      if(patch.sketchMaterial && patch.sketchMaterial.enabled === false){
        const restoreSketch = (m, i) => materialSlotMatches(o, meshIndex, i, targetSlot) ? restoreOriginalSketchMaterial(m) : m;
        o.material = Array.isArray(o.material) ? o.material.map(restoreSketch) : restoreSketch(o.material, 0);
      }
      if(patch.carPaintOverride && patch.carPaintOverride.enabled === true){
        const makePaintPhysical = (m, i) => {
          if(!materialSlotMatches(o, meshIndex, i, targetSlot) || !m) return m;
          if(m.isMeshPhysicalMaterial) return m;
          const original = m;
          const physical = convertToPhysical(m);
          physical.lkCarPaintOriginalMaterial = original;
          return physical;
        };
        o.material = Array.isArray(o.material) ? o.material.map(makePaintPhysical) : makePaintPhysical(o.material, 0);
      } else if(patch.carPaintOverride && patch.carPaintOverride.enabled === false){
        const restorePaint = (m, i) => materialSlotMatches(o, meshIndex, i, targetSlot) ? restoreOriginalCarPaintMaterial(m) : m;
        o.material = Array.isArray(o.material) ? o.material.map(restorePaint) : restorePaint(o.material, 0);
      }
      if(patch.materialKind === 'standard'){
        const convert = (m, i) => materialSlotMatches(o, meshIndex, i, targetSlot) ? convertToStandard(m) : m;
        o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material, 0);
      }
      if(patch.materialKind === 'physical'){
        const convert = (m, i) => materialSlotMatches(o, meshIndex, i, targetSlot) ? convertToPhysical(m) : m;
        o.material = Array.isArray(o.material) ? o.material.map(convert) : convert(o.material, 0);
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m, materialIndex) => {
        if(!materialSlotMatches(o, meshIndex, materialIndex, targetSlot)) return;
        // Three.Color.setHex expects a number. Editor/template colors are also
        // authored as CSS strings, and passing "#ffffff" to setHex coerced it
        // to NaN/black after primitive creation.
        if(patch.color != null && m.color) m.color.set(patch.color);
        if(patch.emissive != null && m.emissive) m.emissive.set(patch.emissive);
        if(patch.roughness != null && m.roughness != null) m.roughness = patch.roughness;
        if(patch.metalness != null && m.metalness != null) m.metalness = patch.metalness;
        if(patch.opacity != null){ m.opacity = patch.opacity; m.transparent = patch.opacity < 1 || !!patch.transparent; }
        if(patch.transparent != null) m.transparent = !!patch.transparent;
        if(patch.depthWrite != null) m.depthWrite = !!patch.depthWrite;
        if(patch.alphaTest != null) m.alphaTest = patch.alphaTest;
        if(patch.side != null) m.side = patch.side;
        if(patch.renderOrder != null) o.renderOrder = patch.renderOrder;
        if(patch.emissiveIntensity != null && m.emissiveIntensity != null) m.emissiveIntensity = patch.emissiveIntensity;
        if(patch.normalScale != null && m.normalScale) m.normalScale.set(patch.normalScale, patch.normalScale);
        if(patch.transmission != null && m.transmission != null) m.transmission = patch.transmission;
        if(patch.thickness != null && m.thickness != null) m.thickness = patch.thickness;
        if(patch.ior != null && m.ior != null) m.ior = patch.ior;
        if(patch.carPaintOverride && patch.carPaintOverride.enabled === true) applyCarPaintLayer(m, patch.carPaintOverride);
        else if(patch.carPaintOverride && patch.carPaintOverride.enabled === false && m.userData){
          delete m.userData.lkCarPaintActive;
        }
        if(Object.prototype.hasOwnProperty.call(patch, 'dynamicMapType')){
          const previous = m.lkDynamicTextureController;
          const baseMap = previous && Object.prototype.hasOwnProperty.call(previous, 'baseMap') ? previous.baseMap : m.map;
          const baseEmissiveMap = previous && Object.prototype.hasOwnProperty.call(previous, 'baseEmissiveMap') ? previous.baseEmissiveMap : m.emissiveMap;
          const baseColor = previous && previous.baseColor
            ? previous.baseColor.clone()
            : (m.color && m.color.clone ? m.color.clone() : null);
          const baseEmissive = previous && previous.baseEmissive ? previous.baseEmissive.clone() : (m.emissive ? m.emissive.clone() : null);
          const baseEmissiveIntensity = previous && previous.baseEmissiveIntensity != null
            ? previous.baseEmissiveIntensity : (m.emissiveIntensity != null ? m.emissiveIntensity : 0);
          const baseVertexColors = previous && previous.baseVertexColors != null
            ? previous.baseVertexColors : ('vertexColors' in m ? m.vertexColors : null);
          const baseRoughness = previous && previous.baseRoughness != null ? previous.baseRoughness : m.roughness;
          const baseMetalness = previous && previous.baseMetalness != null ? previous.baseMetalness : m.metalness;
          const baseRoughnessMap = previous && Object.prototype.hasOwnProperty.call(previous, 'baseRoughnessMap')
            ? previous.baseRoughnessMap : m.roughnessMap;
          const baseMetalnessMap = previous && Object.prototype.hasOwnProperty.call(previous, 'baseMetalnessMap')
            ? previous.baseMetalnessMap : m.metalnessMap;
          const baseOnBeforeCompile = previous && previous.baseOnBeforeCompile
            ? previous.baseOnBeforeCompile : m.onBeforeCompile;
          const baseCustomProgramCacheKey = previous && previous.baseCustomProgramCacheKey
            ? previous.baseCustomProgramCacheKey : m.customProgramCacheKey;
          const nextType = patch.dynamicMapType || 'none';
          const dynamicEnabled = patch.dynamicMapEnabled !== false && nextType !== 'none';
          const nextResolution = Math.max(256, Math.min(2048, Number(patch.dynamicResolution) ||
            previous && previous.canvas && previous.canvas.width || 1024));
          const effectiveNextType = !dynamicEnabled
            ? 'none'
            : (nextType === 'video' && /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(String(patch.dynamicVideoUrl || '').trim())
              ? 'youtube' : nextType);
          const canReuseHud = previous && previous.type === 'vehicle-hud' && effectiveNextType === 'vehicle-hud' &&
            previous.canvas && previous.canvas.width === nextResolution;
          const canReuseRadio = previous && previous.type === 'radio-hud' && effectiveNextType === 'radio-hud' &&
            previous.canvas && previous.canvas.width === nextResolution;
          const canReuseYoutube = previous && previous.type === 'youtube' && effectiveNextType === 'youtube' &&
            String(previous.props.dynamicVideoUrl || previous.props.dynamicYoutubeUrl || '') === String(patch.dynamicVideoUrl || patch.dynamicYoutubeUrl || '');
          const canReuseVideo = previous && previous.type === 'video' && effectiveNextType === 'video' &&
            previous.video &&
            String(previous.props.dynamicVideoUrl || '') === String(patch.dynamicVideoUrl || '');
          let controller = null;
          if(canReuseHud || canReuseRadio || canReuseYoutube || canReuseVideo){
            controller = previous;
            Object.assign(controller.props, patch);
            if(canReuseHud) drawDynamicVehicleHud(controller, true);
            if(canReuseRadio) drawDynamicRadioHud(controller, true);
            if(canReuseYoutube) drawDynamicYouTubeSurface(controller);
            if(canReuseVideo){
              controller.video.loop = patch.dynamicVideoLoop !== false;
              controller.video.muted = patch.dynamicVideoMuted !== false;
            }
          } else {
            if(previous && previous.dispose) previous.dispose();
            delete m.lkDynamicTextureController;
            if(dynamicEnabled) controller = createDynamicMaterialTexture(patch);
          }
          if(controller){
            controller.baseMap = baseMap;
            controller.baseEmissiveMap = baseEmissiveMap;
            controller.baseColor = baseColor;
            controller.baseEmissive = baseEmissive;
            controller.baseEmissiveIntensity = baseEmissiveIntensity;
            controller.baseVertexColors = baseVertexColors;
            controller.baseRoughness = baseRoughness;
            controller.baseMetalness = baseMetalness;
            controller.baseRoughnessMap = baseRoughnessMap;
            controller.baseMetalnessMap = baseMetalnessMap;
            controller.baseOnBeforeCompile = baseOnBeforeCompile;
            controller.baseCustomProgramCacheKey = baseCustomProgramCacheKey;
            // Runtime-only: keeping DOM/canvas objects out of userData makes
            // material cloning and project JSON serialization deterministic.
            m.lkDynamicTextureController = controller;
            bindDynamicMaterialTexture(controller, m);
            applyDynamicMaterialOverride(m, controller, patch.dynamicScreenEmission, o);
          } else {
            restoreDynamicMaterialBase(m, {
              map:baseMap,
              emissiveMap:baseEmissiveMap,
              color:baseColor,
              emissive:baseEmissive,
              emissiveIntensity:baseEmissiveIntensity,
              vertexColors:baseVertexColors,
              roughness:baseRoughness,
              metalness:baseMetalness,
              roughnessMap:baseRoughnessMap,
              metalnessMap:baseMetalnessMap,
              onBeforeCompile:baseOnBeforeCompile,
              customProgramCacheKey:baseCustomProgramCacheKey,
            });
          }
        }
        const setMap = (prop, srcKey, dbKey, colorData, onSet) => {
          const hasSrc = Object.prototype.hasOwnProperty.call(patch, srcKey);
          const hasDb = Object.prototype.hasOwnProperty.call(patch, dbKey);
          const wantsClear = (hasSrc || hasDb) && (!hasSrc || patch[srcKey] === null) && (!hasDb || patch[dbKey] === null);
          if(wantsClear){
            const activeDynamic = m.lkDynamicTextureController;
            if(activeDynamic && prop === 'map') activeDynamic.baseMap = null;
            else if(activeDynamic && prop === 'emissiveMap') activeDynamic.baseEmissiveMap = null;
            else if(activeDynamic && prop === 'roughnessMap') activeDynamic.baseRoughnessMap = null;
            else if(activeDynamic && prop === 'metalnessMap') activeDynamic.baseMetalnessMap = null;
            else m[prop] = null;
            delete m[srcKey];
            delete m[dbKey];
            if(activeDynamic) applyDynamicMaterialOverride(m, activeDynamic, null, o);
            m.needsUpdate = true;
            return;
          }
          if((hasSrc && patch[srcKey]) || (hasDb && patch[dbKey])){
            const srcValue = patch[srcKey] || null;
            const dbValue = patch[dbKey] || null;
            m[srcKey] = srcValue;
            m[dbKey] = dbValue;
            resolveTextureUrl(srcValue, dbValue).then(url => {
              if(!url) return;
              const tx = loadTexture(url, colorData);
              applyTextureTransform(tx, patch);
              const activeDynamic = m.lkDynamicTextureController;
              if(activeDynamic && prop === 'map') activeDynamic.baseMap = tx;
              else if(activeDynamic && prop === 'emissiveMap') activeDynamic.baseEmissiveMap = tx;
              else if(activeDynamic && prop === 'roughnessMap') activeDynamic.baseRoughnessMap = tx;
              else if(activeDynamic && prop === 'metalnessMap') activeDynamic.baseMetalnessMap = tx;
              else m[prop] = tx;
              if(onSet) onSet();
              if(activeDynamic) applyDynamicMaterialOverride(m, activeDynamic, null, o);
              m.needsUpdate = true;
            }).catch(err => console.warn('LotKing store: material texture not loaded', err));
          }
        };
        setMap('map', 'mapSrc', 'mapDbKey', true);
        setMap('normalMap', 'normalMapSrc', 'normalMapDbKey', false);
        setMap('roughnessMap', 'roughnessMapSrc', 'roughnessMapDbKey', false);
        setMap('metalnessMap', 'metalnessMapSrc', 'metalnessMapDbKey', false);
        setMap('alphaMap', 'alphaMapSrc', 'alphaMapDbKey', false, () => { m.transparent = true; });
        setMap('emissiveMap', 'emissiveMapSrc', 'emissiveMapDbKey', true);
        if(!m.lkDynamicTextureController) applyTextureTransform(m.map, patch);
        applyTextureTransform(m.normalMap, patch);
        applyTextureTransform(m.roughnessMap, patch);
        applyTextureTransform(m.metalnessMap, patch);
        applyTextureTransform(m.alphaMap, patch);
        applyTextureTransform(m.emissiveMap, patch);
        // Last, so the per-kind roughness/metalness hints win over the authored
        // scalars in both directions of the round trip and the result is stable
        // no matter how many times the same props are re-applied.
        if(Object.prototype.hasOwnProperty.call(patch, 'surfaceTexture')) applySurfaceTexture(obj, m, patch.surfaceTexture, null);
        if(m.lkDynamicTextureController){
          applyDynamicMaterialOverride(m, m.lkDynamicTextureController, null, o);
        }
        const dynamicShaderPatch = ['side','transparent','alphaTest','depthWrite','materialKind','transmission']
          .some(key => Object.prototype.hasOwnProperty.call(patch, key));
        if(!m.lkDynamicTextureController || dynamicShaderPatch) m.needsUpdate = true;
      });
      if(patch.sketchMaterial && patch.sketchMaterial.enabled === true){
        const makeSketch = (m, i) => materialSlotMatches(o, meshIndex, i, targetSlot)
          ? convertToSketchMaterial(m, patch.sketchMaterial) : m;
        o.material = Array.isArray(o.material) ? o.material.map(makeSketch) : makeSketch(o.material, 0);
      }
      if(patch.castShadow != null) o.castShadow = patch.castShadow;
      meshIndex++;
    });
  };
  const stored = p.materialSlot
    ? {global:{}, slots:{[p.materialSlot]: Object.assign({}, p)}}
    : normalizeStoredMatProps(p);
  if(p.materialSlot) delete stored.slots[p.materialSlot].materialSlot;
  applyFlat(stored.global, null);
  Object.keys(stored.slots || {}).forEach(slot => applyFlat(stored.slots[slot], slot));
  obj.userData.matProps = mergeStoredMatProps(obj.userData.matProps, p);
}

function applyPlayerMaterialProps(GAME, props){
  if(!GAME || !GAME.player || !GAME.player.car || !props) return;
  const root = GAME.player.getModel ? (GAME.player.getModel() || GAME.player.car) : GAME.player.car;
  root.userData.matProps = null;
  applyMatProps(root, sanitizePlayerMatProps(props));
  GAME.player.car.userData.matProps = cloneData(root.userData.matProps || props);
}

// ------------------------------------------------ factories: primitives
const PRIM_DEFS = {
  box:      props => { const s=props&&props.geometry&&props.geometry.segments||{};return new THREE.BoxGeometry(2,2,2,Math.max(1,Number(s.width)||1),Math.max(1,Number(s.height)||1),Math.max(1,Number(s.depth)||1)); },
  sphere:   props => { const s=props&&props.geometry&&props.geometry.segments||{};return new THREE.SphereGeometry(1.2,Math.max(3,Number(s.radial)||24),Math.max(2,Number(s.height)||18)); },
  cylinder: props => { const s=props&&props.geometry&&props.geometry.segments||{};return new THREE.CylinderGeometry(1,1,2,Math.max(3,Number(s.radial)||20),Math.max(1,Number(s.height)||1)); },
  cone:     () => new THREE.ConeGeometry(1, 2, 20),
  plane:    props => { const s=props&&props.geometry&&props.geometry.segments||{};return new THREE.PlaneGeometry(4,4,Math.max(1,Number(s.width)||1),Math.max(1,Number(s.depth)||1)); },
  torus:    () => new THREE.TorusGeometry(1.4, .4, 12, 28),
  arc:      () => {
    const arc=1.85,g=new THREE.TorusGeometry(9.15, .06, 6, 56, arc);
    g.rotateZ((Math.PI-arc)/2);
    return g;
  },
  triangle: () => new THREE.CircleGeometry(1, 3),
  ramp:     () => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(6, 0); shape.lineTo(6, 2.2); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {depth: 4, bevelEnabled: false});
    g.translate(-3, 0, -2);
    return g;
  },
};
// Material props travel in two shapes. Templates and the editor hand them over
// FLAT ({color, roughness, centered, ...}); a saved project stores whatever
// `normalizeStoredMatProps` produced, which nests everything under `global` so
// per-material-slot overrides have somewhere to live.
//
// createPrimitive reads GEOMETRY keys out of that same bag — `centered` above
// all — so reading the nested shape raw silently lost them on the round trip.
// A centered box reloaded as an uncentered one, which moves its mesh a full
// local unit up and, once the group scale is applied, leaves the object sitting
// exactly half its own height too high. Flattening accepts both shapes and
// repairs projects already saved with the nested one.
function flatPrimitiveProps(props){
  if(!props || typeof props !== 'object') return {};
  if(!props.global && !props.slots) return props;
  return Object.assign({}, props, props.global || {});
}

function createPrimitive(prim, props){
  props = flatPrimitiveProps(props);
  if(prim === 'goalNet'){
    const width=7.32,height=2.44,depth=1.8,backHeight=1.72,half=width/2,vertices=[];
    const segment=(ax,ay,az,bx,by,bz)=>vertices.push(ax,ay,az,bx,by,bz);
    const columns=18,rows=8,depthRows=6;
    for(let i=0;i<=columns;i++){
      const x=-half+width*i/columns;
      segment(x,0,depth,x,backHeight,depth);
      segment(x,height,0,x,backHeight,depth);
    }
    for(let i=0;i<=rows;i++){
      const t=i/rows,y=backHeight*t;
      segment(-half,y,depth,half,y,depth);
      segment(-half,height*t,0,-half,y,depth);
      segment(half,height*t,0,half,y,depth);
    }
    for(let i=0;i<=depthRows;i++){
      const t=i/depthRows,z=depth*t,y=height+(backHeight-height)*t;
      segment(-half,y,z,half,y,z);
      segment(-half,0,z,-half,y,z);
      segment(half,0,z,half,y,z);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
    const material=new THREE.LineBasicMaterial({color:props.color!=null?props.color:0xe9eef3,transparent:true,opacity:.58});
    const lines=new THREE.LineSegments(geometry,material),group=new THREE.Group();
    lines.castShadow=false;lines.receiveShadow=false;group.add(lines);
    return group;
  }
  const geo = (PRIM_DEFS[prim] || PRIM_DEFS.box)(props);
  const materialOptions = {color:props.color != null ? props.color : 0x8899aa, side:prim === 'plane' || prim === 'triangle' ? THREE.DoubleSide : THREE.FrontSide};
  let mat;
  if(props.materialModel === 'unlit') mat = new THREE.MeshBasicMaterial(materialOptions);
  else if(props.materialModel === 'toon' && THREE.MeshToonMaterial) mat = new THREE.MeshToonMaterial(materialOptions);
  else mat = new THREE.MeshStandardMaterial(Object.assign(materialOptions, {roughness:props.roughness != null ? props.roughness : .7, metalness:props.metalness != null ? props.metalness : .1}));
  if(props.sketch && typeof document !== 'undefined'){
    const spec = props.sketch === true ? {} : props.sketch;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d'), seed = Number(spec.seed) || 1;
    let state = seed >>> 0;
    const random = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 4294967296; };
    ctx.fillStyle = spec.base || '#ffffff'; ctx.fillRect(0,0,256,256); ctx.lineCap = 'round';
    for(let i=0;i<(Number(spec.strokes)||70);i++){
      ctx.strokeStyle = random()<.5?'rgba(0,0,0,.055)':'rgba(255,255,255,.065)'; ctx.lineWidth=1.5+random()*2.5;
      const x=random()*256,y=random()*256,length=18+random()*46,angle=Number(spec.angle)||-.65;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(angle)*length,y+Math.sin(angle)*length);ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    const repeat=Array.isArray(spec.repeat)?spec.repeat:[1,1];texture.repeat.set(Number(repeat[0])||1,Number(repeat[1])||1);texture.colorSpace=THREE.SRGBColorSpace;mat.map=texture;
  }
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = m.receiveShadow = true;
  // Opt-out for geometry that cannot contribute a visible shadow: a decal lying
  // flat on the ground casts onto the ground it is touching, and a silhouette
  // 100 m outside the play area casts outside the shadow camera. Every caster
  // is redrawn into the shadow map each frame, so this is draw calls, not just
  // fill rate. Default stays on - a level opts a specific object out.
  if(props.castShadow === false) m.castShadow = false;
  if(props.receiveShadow === false) m.receiveShadow = false;
  if(prim === 'plane' || prim === 'arc') m.rotation.x = -Math.PI/2;
  const gp = new THREE.Group();
  m.position.y = props.centered === true ? 0 : (prim === 'plane' || prim === 'arc' ? 0.01 : (prim === 'ramp' ? 0 : 1));
  gp.add(m);
  // A procedural surface turns the flat authored colour into a real material.
  // `materialModel:'unlit'` is excluded on purpose: glow panels (lamp lenses,
  // lit signs, windows) must stay flat and unlit.
  if(props.surfaceTexture != null && props.materialModel !== 'unlit'){
    applySurfaceTexture(gp, mat, props.surfaceTexture, prim);
  }
  if(prim === 'cone'){
    gp.userData.isCone = true;
    gp.userData.coneResetRotation = [0, 0, 0];
  }
  return gp;
}

function proceduralAssets(){return typeof window!=='undefined'?window.LK_ENGINE_PROCEDURAL_ASSETS:null;}
function createProceduralAsset(source){
  const api=proceduralAssets();
  if(!api||typeof api.create!=='function')return createPrimitive('box',{color:0x67e8f9,centered:true});
  return api.create(source,{THREE,createPrimitive,retile:refreshSurfaceTiling});
}
function rebuildProceduralAsset(root,source){
  const api=proceduralAssets();
  if(!root||!api||typeof api.rebuild!=='function')return null;
  const recipe=api.normalize(source);
  api.rebuild(root,recipe,{THREE,createPrimitive,retile:refreshSurfaceTiling});
  const entry=root.userData&&root.userData.addedEntry;
  if(entry){
    const fresh=api.entry(recipe.type,recipe);
    const authoredProps=cloneData(entry.props||{});
    entry.procedural=cloneData(recipe);entry.props=Object.assign({},cloneData(fresh.props),authoredProps);
    applyMatProps(root,entry.props);
  }
  refreshSurfaceTiling(root);syncCollider(root);return root;
}

// ------------------------------------------------ factories: text
const TEXT_FONT_URL = 'vendor/helvetiker_regular.typeface.json';
let _textFont = null;
let _textFontPromise = null;

function normalizeTextProps(props){
  return Object.assign({
    text:'Text',
    color:0xffffff,
    background:0x000000,
    opacity:0,
    size:1,
    width:4,
    height:1.4,
    fontSize:96,
    fontFamily:'Arial',
    weight:'900',
    italic:false,
    align:'center',
    valign:'middle',
    lineHeight:1.15,
    padding:.12,
    wrap:false,
    depth:.16,
    bevel:false,
  }, props || {});
}

function colorCss(hex, alpha){
  hex = hex == null ? 0xffffff : hex >>> 0;
  if(alpha == null || alpha >= 1) return '#' + ('000000' + hex.toString(16)).slice(-6);
  return 'rgba(' + ((hex >> 16) & 255) + ',' + ((hex >> 8) & 255) + ',' + (hex & 255) + ',' + Math.max(0, Math.min(1, alpha)) + ')';
}

function loadTextFont(){
  if(_textFont) return Promise.resolve(_textFont);
  if(_textFontPromise) return _textFontPromise;
  if(!THREE.FontLoader) return Promise.reject(new Error('FontLoader unavailable'));
  _textFontPromise = new Promise((resolve, reject) => {
    new THREE.FontLoader().load(TEXT_FONT_URL, font => {
      _textFont = font;
      resolve(font);
    }, undefined, reject);
  });
  return _textFontPromise;
}

function textLines(ctx, props, maxWidth){
  const source = String(props.text || 'Text').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  if(!props.wrap) return source;
  const out = [];
  source.forEach(line => {
    const words = line.split(/(\s+)/);
    let cur = '';
    words.forEach(part => {
      const next = cur + part;
      if(cur && ctx.measureText(next).width > maxWidth){
        out.push(cur.trimEnd());
        cur = part.trimStart();
      } else cur = next;
    });
    out.push(cur);
  });
  return out.length ? out : [''];
}

function drawTextCanvas(canvas, props){
  const ctx = canvas.getContext('2d');
  const ratio = Math.max(.12, props.height / Math.max(.12, props.width));
  canvas.width = 1024;
  canvas.height = Math.max(128, Math.round(canvas.width * ratio));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if(props.opacity > 0){
    ctx.fillStyle = colorCss(props.background, props.opacity);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const pad = Math.max(0, props.padding || 0) * canvas.width / Math.max(.1, props.width);
  const fontStyle = props.italic ? 'italic ' : '';
  ctx.font = fontStyle + (props.weight || '900') + ' ' + Math.max(8, props.fontSize || 96) + 'px ' + (props.fontFamily || 'Arial') + ', sans-serif';
  ctx.fillStyle = colorCss(props.color);
  ctx.textAlign = props.align || 'center';
  ctx.textBaseline = 'top';
  const maxWidth = Math.max(20, canvas.width - pad * 2);
  const lines = textLines(ctx, props, maxWidth);
  const lh = Math.max(8, (props.fontSize || 96) * (props.lineHeight || 1.15));
  const totalH = lines.length * lh;
  const x = props.align === 'left' ? pad : props.align === 'right' ? canvas.width - pad : canvas.width / 2;
  let y = pad;
  if(props.valign === 'middle') y = (canvas.height - totalH) / 2;
  else if(props.valign === 'bottom') y = canvas.height - totalH - pad;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.clip();
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lh, maxWidth));
  ctx.restore();
}

function buildTextPlane(gp, props){
  const canvas = gp.userData.textCanvas || document.createElement('canvas');
  drawTextCanvas(canvas, props);
  const tex = gp.userData.textTexture || new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({map:tex, transparent:true, side:THREE.DoubleSide, depthWrite:false});
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(props.width, props.height), mat);
  mesh.castShadow = false; mesh.receiveShadow = false;
  gp.userData.textCanvas = canvas;
  gp.userData.textTexture = tex;
  gp.add(mesh);
}

function rebuildText3D(gp, props){
  if(!_textFont || !THREE.TextGeometry) return false;
  const mat = new THREE.MeshStandardMaterial({color:props.color, roughness:.58, metalness:.05});
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = (props.weight || '900') + ' ' + Math.max(8, props.fontSize || 96) + 'px ' + (props.fontFamily || 'Arial') + ', sans-serif';
  const lines = textLines(ctx, props, Math.max(20, (props.width - props.padding * 2) * 220));
  const size = Math.max(.05, (props.fontSize || 96) / 120);
  const lh = size * (props.lineHeight || 1.15);
  const maxLines = Math.max(1, Math.floor(props.height / Math.max(.05, lh)));
  const shown = lines.slice(0, maxLines);
  const totalH = shown.length * lh;
  let top = props.valign === 'bottom' ? -props.height / 2 + totalH : props.valign === 'middle' ? totalH / 2 - lh : props.height / 2 - lh;
  shown.forEach((line, i) => {
    const geo = new THREE.TextGeometry(line || ' ', {
      font:_textFont,
      size,
      height:Math.max(.01, props.depth || .16),
      curveSegments:8,
      bevelEnabled:!!props.bevel,
      bevelThickness:.018,
      bevelSize:.012,
      bevelSegments:2,
    });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const w = bb ? (bb.max.x - bb.min.x) : 0;
    let x = -props.width / 2 + (props.padding || 0);
    if(props.align === 'center') x = -w / 2;
    else if(props.align === 'right') x = props.width / 2 - (props.padding || 0) - w;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, top - i * lh, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    gp.add(mesh);
  });
  return true;
}

function updateTextObject(gp){
  if(!gp || !gp.userData) return gp;
  const props = normalizeTextProps(gp.userData.textProps);
  gp.userData.textProps = props;
  gp.children.slice().forEach(child => {
    gp.remove(child);
    if(child.geometry && child.geometry.dispose) child.geometry.dispose();
    if(child.material){
      const list = Array.isArray(child.material) ? child.material : [child.material];
      list.forEach(mat => { if(mat && mat.dispose) mat.dispose(); });
    }
  });
  gp.scale.setScalar(props.size || 1);
  if(gp.userData.textKind === '3d'){
    if(rebuildText3D(gp, props)) return gp;
    buildTextPlane(gp, props);
    loadTextFont().then(() => updateTextObject(gp)).catch(() => {});
    return gp;
  }
  buildTextPlane(gp, props);
  return gp;
}

function createText(kind, props){
  const gp = new THREE.Group();
  gp.userData.textKind = kind === '3d' ? '3d' : '2d';
  gp.userData.textProps = normalizeTextProps(props);
  return updateTextObject(gp);
}

// ------------------------------------------------ factories: free texture / decal planes
function normalizeTextureProps(props){
  return Object.assign({
    mode:'decal',
    src:null,
    dbKey:null,
    asset:null,
    width:2,
    height:2,
    opacity:1,
    color:0xffffff,
    alphaTest:.01,
    blending:'normal',
    depthBias:.012,
    doubleSide:true,
    animated:false,
    materialModel:'unlit',
    roughness:.65,
    metalness:0,
    specular:.35,
    emissive:0x000000,
    emissiveIntensity:0,
    surfaceInfluence:0,
    surfaceBaseInfluence:.18,
    surfaceProbeDistance:1.5,
    surfaceReceiverId:null,
    surfaceReceiverName:'',
    surfaceRoughness:null,
    surfaceMetalness:null,
    surfaceSpecular:null,
  }, props || {});
}

function textureBlending(kind){
  if(kind === 'additive') return THREE.AdditiveBlending;
  if(kind === 'multiply') return THREE.MultiplyBlending;
  if(kind === 'subtractive') return THREE.SubtractiveBlending;
  return THREE.NormalBlending;
}

function createTextureMaterial(props){
  const surfaceLayer = props.blending === 'surface';
  const influence = Math.max(0, Math.min(1, props.surfaceInfluence == null ? 0 : props.surfaceInfluence));
  const inherited = (key, fallback) => {
    const sampled = Number(props['surface' + key.charAt(0).toUpperCase() + key.slice(1)]);
    const authored = Number(props[key]);
    const base = Number.isFinite(sampled) ? sampled : fallback;
    const target = Number.isFinite(authored) ? authored : fallback;
    return base + (target - base) * influence;
  };
  const common = {
    color: props.color,
    map: placeholderTexture(),
    transparent:true,
    opacity: Math.max(0, Math.min(1, props.opacity == null ? 1 : props.opacity)),
    alphaTest: Math.max(0, Math.min(1, props.alphaTest == null ? .01 : props.alphaTest)),
    side: props.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide,
    depthWrite:false,
    depthTest: props.depthTest !== false,
    blending:textureBlending(surfaceLayer ? 'normal' : props.blending),
    polygonOffset:true,
    polygonOffsetFactor:-4,
    polygonOffsetUnits:-4,
  };
  if(props.materialModel === 'lit' || surfaceLayer){
    const Mat = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const mat = new Mat(Object.assign({}, common, {
      roughness:Math.max(0, Math.min(1, surfaceLayer ? inherited('roughness', .65) : (props.roughness == null ? .65 : props.roughness))),
      metalness:Math.max(0, Math.min(1, surfaceLayer ? inherited('metalness', 0) : (props.metalness == null ? 0 : props.metalness))),
      emissive:new THREE.Color(props.emissive == null ? 0x000000 : props.emissive),
      emissiveIntensity:Math.max(0, Math.min(3, props.emissiveIntensity == null ? 0 : props.emissiveIntensity)),
    }));
    const specular = Math.max(0, Math.min(1, surfaceLayer ? inherited('specular', .35) : (props.specular == null ? .35 : props.specular)));
    if('reflectivity' in mat) mat.reflectivity = specular;
    if('specularIntensity' in mat) mat.specularIntensity = specular;
    if('clearcoat' in mat) mat.clearcoat = Math.max(0, specular - .65) / .35;
    if('clearcoatRoughness' in mat) mat.clearcoatRoughness = mat.roughness;
    mat.userData.lkSurfaceLayer = surfaceLayer;
    if(surfaceLayer) installTextureSurfaceShader(mat, props);
    return mat;
  }
  return new THREE.MeshBasicMaterial(common);
}

function installTextureSurfaceShader(mat, props){
  if(!mat) return;
  const state = mat.userData.lkSurfaceMaps = {
    baseMap:null,
    baseInfluence:Math.max(0, Math.min(1, Number(props && props.surfaceBaseInfluence) || 0)),
    shader:null,
  };
  const activeRenderer=window.LOT_KING&&window.LOT_KING.core&&window.LOT_KING.core.renderer;
  if(activeRenderer&&activeRenderer.isWebGPURenderer) return;
  mat.onBeforeCompile = shader => {
    state.shader = shader;
    shader.uniforms.lkSurfaceBaseMap = {value:state.baseMap || placeholderTexture()};
    shader.uniforms.lkSurfaceBaseInfluence = {value:state.baseInfluence};
    shader.uniforms.lkSurfaceHasBaseMap = {value:state.baseMap ? 1 : 0};
    shader.fragmentShader = [
      'uniform sampler2D lkSurfaceBaseMap;',
      'uniform float lkSurfaceBaseInfluence;',
      'uniform float lkSurfaceHasBaseMap;',
      shader.fragmentShader,
    ].join('\n').replace(
      '#include <map_fragment>',
      [
        '#include <map_fragment>',
        '#ifdef USE_MAP',
        '  vec3 lkSurfaceBase = texture2D(lkSurfaceBaseMap, vMapUv).rgb;',
        '  diffuseColor.rgb *= mix(vec3(1.0), lkSurfaceBase, lkSurfaceBaseInfluence * lkSurfaceHasBaseMap);',
        '#endif',
      ].join('\n')
    );
  };
  mat.customProgramCacheKey = () => 'lotking-surface-layer-pbr-v2';
}

function applyTextureSurfaceMaps(mat, receiverMat, props){
  if(!mat || !receiverMat || !mat.userData || !mat.userData.lkSurfaceMaps) return false;
  const state = mat.userData.lkSurfaceMaps;
  state.baseMap = receiverMat.map || null;
  state.baseInfluence = Math.max(0, Math.min(1, Number(props.surfaceBaseInfluence) || 0));
  // The same GPU texture objects are referenced, never cloned. The decal keeps
  // its own color/alpha map while receiver micro-surface maps shade that color.
  if('normalMap' in mat) mat.normalMap = receiverMat.normalMap || null;
  if('normalScale' in mat && receiverMat.normalScale && mat.normalScale && mat.normalScale.copy){
    mat.normalScale.copy(receiverMat.normalScale);
  }
  if('roughnessMap' in mat) mat.roughnessMap = receiverMat.roughnessMap || null;
  if('metalnessMap' in mat) mat.metalnessMap = receiverMat.metalnessMap || null;
  if('aoMap' in mat) mat.aoMap = receiverMat.aoMap || null;
  if('aoMapIntensity' in mat && Number.isFinite(Number(receiverMat.aoMapIntensity))) mat.aoMapIntensity = receiverMat.aoMapIntensity;
  if('envMap' in mat) mat.envMap = receiverMat.envMap || null;
  if(state.shader){
    state.shader.uniforms.lkSurfaceBaseMap.value = state.baseMap || placeholderTexture();
    state.shader.uniforms.lkSurfaceBaseInfluence.value = state.baseInfluence;
    state.shader.uniforms.lkSurfaceHasBaseMap.value = state.baseMap ? 1 : 0;
  }
  return true;
}

function textureSurfaceMaterial(object, intersection){
  if(!object || !object.material) return null;
  if(!Array.isArray(object.material)) return object.material;
  const index = intersection && intersection.face && Number.isFinite(intersection.face.materialIndex)
    ? intersection.face.materialIndex
    : 0;
  return object.material[index] || object.material[0] || null;
}

function textureSurfaceOwner(object){
  let current = object;
  while(current){
    if(current.userData && current.userData.editorId) return current;
    current = current.parent;
  }
  return object || null;
}

function textureSurfaceCandidates(gp){
  const game = window.LOT_KING;
  const registry = game && game.world && game.world.registry;
  if(!registry) return [];
  return Array.from(registry).filter(root => {
    if(!root || root === gp || root.visible === false) return false;
    const ud = root.userData || {};
    if(ud.editorType === 'texture' || ud.editorType === 'helper' || ud.helper) return false;
    return true;
  });
}

function textureSurfaceMeshes(candidates){
  const meshes = [];
  const seen = new Set();
  (candidates || []).forEach(root => {
    if(!root) return;
    const add = object => {
      if(!object || !object.isMesh || !object.material || object.visible === false || seen.has(object)) return;
      seen.add(object);
      meshes.push(object);
    };
    add(root);
    if(root.traverse) root.traverse(add);
  });
  return meshes;
}

function applyTextureSurfaceSample(gp, mat, props, receiver, receiverMat){
  if(!mat || !props || !receiverMat) return false;
  const scalar = (key, fallback) => {
    const value = Number(receiverMat[key]);
    props['surface' + key.charAt(0).toUpperCase() + key.slice(1)] = Number.isFinite(value) ? value : fallback;
    return props['surface' + key.charAt(0).toUpperCase() + key.slice(1)];
  };
  const influence = Math.max(0, Math.min(1, props.surfaceInfluence == null ? 0 : props.surfaceInfluence));
  const mix = (base, authored) => base + (authored - base) * influence;
  const roughness = scalar('roughness', .65);
  const metalness = scalar('metalness', 0);
  let specular = Number(receiverMat.specularIntensity);
  if(!Number.isFinite(specular)) specular = Number(receiverMat.reflectivity);
  if(!Number.isFinite(specular)) specular = .35;
  props.surfaceSpecular = Math.max(0, Math.min(1, specular));
  props.surfaceReceiverId = receiver && receiver.userData && receiver.userData.editorId || null;
  props.surfaceReceiverName = receiver && (receiver.userData && receiver.userData.editorName || receiver.name) || '';
  mat.roughness = Math.max(0, Math.min(1, mix(roughness, Number.isFinite(Number(props.roughness)) ? Number(props.roughness) : .65)));
  mat.metalness = Math.max(0, Math.min(1, mix(metalness, Number.isFinite(Number(props.metalness)) ? Number(props.metalness) : 0)));
  const finalSpecular = Math.max(0, Math.min(1, mix(props.surfaceSpecular, Number.isFinite(Number(props.specular)) ? Number(props.specular) : .35)));
  if('reflectivity' in mat) mat.reflectivity = finalSpecular;
  if('specularIntensity' in mat) mat.specularIntensity = finalSpecular;
  if('envMapIntensity' in mat && Number.isFinite(Number(receiverMat.envMapIntensity))) mat.envMapIntensity = receiverMat.envMapIntensity;
  if('clearcoat' in mat) mat.clearcoat = Math.max(0, finalSpecular - .65) / .35;
  if('clearcoatRoughness' in mat) mat.clearcoatRoughness = mat.roughness;
  applyTextureSurfaceMaps(mat, receiverMat, props);
  mat.needsUpdate = true;
  gp.userData.textureProps = props;
  return true;
}

function matchTextureSurface(gp, forceProbe){
  if(!gp || !gp.userData || !gp.userData.textureProps || gp.userData.textureProps.blending !== 'surface') return false;
  const props = gp.userData.textureProps;
  const mesh = gp.children && gp.children.find(child => child && child.isMesh);
  const mat = mesh && mesh.material;
  if(!mesh || !mat) return false;
  const candidates = textureSurfaceCandidates(gp);
  if(!candidates.length) return false;
  let receiver = null;
  let receiverMat = null;
  if(!forceProbe && props.surfaceReceiverId){
    receiver = candidates.find(root => root.userData && root.userData.editorId === props.surfaceReceiverId) || null;
    if(receiver){
      let found = null;
      receiver.traverse(child => { if(!found && child.isMesh && child.material) found = child; });
      receiverMat = textureSurfaceMaterial(found);
    }
  }
  if(!receiverMat){
    gp.updateWorldMatrix(true, false);
    const origin = gp.getWorldPosition(new THREE.Vector3());
    const quaternion = gp.getWorldQuaternion(new THREE.Quaternion());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize();
    const bias = Math.max(.002, Number(props.depthBias) || 0);
    origin.addScaledVector(normal, bias + .025);
    const raycaster = new THREE.Raycaster(
      origin,
      normal.multiplyScalar(-1),
      0,
      Math.max(.05, Number(props.surfaceProbeDistance) || 1.5)
    );
    // Raycast only renderable mesh receivers. Sprite/flare raycasters require a
    // camera and could otherwise abort matching before the road mesh is tested.
    const hits = raycaster.intersectObjects(textureSurfaceMeshes(candidates), false);
    const hit = hits.find(item => item && item.object && item.object.material && item.object.visible !== false);
    if(!hit) return false;
    receiver = textureSurfaceOwner(hit.object);
    receiverMat = textureSurfaceMaterial(hit.object, hit);
  }
  return applyTextureSurfaceSample(gp, mat, props, receiver, receiverMat);
}

function textureSurfaceTransformSignature(gp){
  const p = gp.position;
  const q = gp.quaternion;
  const s = gp.scale;
  return [p.x,p.y,p.z,q.x,q.y,q.z,q.w,s.x,s.y,s.z].map(value => Number(value).toFixed(5)).join('|');
}

function isAnimatedTextureProps(props){
  const p = props || {};
  const asset = p.asset || {};
  return !!(p.animated ||
    /^data:image\/gif/i.test(p.src || '') ||
    /\.gif(?:$|[?#])/i.test(p.src || '') ||
    /\.gif$/i.test(asset.source || '') ||
    /\.gif$/i.test(asset.name || '') ||
    /gif/i.test(asset.mime || ''));
}

function gifReadSubBlocks(bytes, pos){
  const chunks = [];
  let total = 0;
  while(pos < bytes.length){
    const len = bytes[pos++];
    if(!len) break;
    chunks.push(bytes.subarray(pos, pos + len));
    total += len;
    pos += len;
  }
  const out = new Uint8Array(total);
  let at = 0;
  chunks.forEach(chunk => { out.set(chunk, at); at += chunk.length; });
  return {data:out, pos};
}

function gifSkipSubBlocks(bytes, pos){
  while(pos < bytes.length){
    const len = bytes[pos++];
    if(!len) break;
    pos += len;
  }
  return pos;
}

function gifColorTable(bytes, pos, count){
  const table = [];
  for(let i = 0; i < count; i++){
    table.push([bytes[pos++], bytes[pos++], bytes[pos++]]);
  }
  return {table, pos};
}

function gifReadCode(data, bitPos, size){
  let code = 0;
  for(let i = 0; i < size; i++){
    if(data[(bitPos + i) >> 3] & (1 << ((bitPos + i) & 7))) code |= 1 << i;
  }
  return code;
}

function gifLzwDecode(minCodeSize, data, expectedLength){
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = end + 1;
  let bitPos = 0;
  let prev = null;
  let dict = [];
  const reset = () => {
    dict = [];
    for(let i = 0; i < clear; i++) dict[i] = [i];
    dict[clear] = [];
    dict[end] = null;
    codeSize = minCodeSize + 1;
    nextCode = end + 1;
    prev = null;
  };
  const out = [];
  reset();
  while(bitPos + codeSize <= data.length * 8){
    const code = gifReadCode(data, bitPos, codeSize);
    bitPos += codeSize;
    if(code === clear){ reset(); continue; }
    if(code === end) break;
    let entry;
    if(dict[code]) entry = dict[code].slice();
    else if(code === nextCode && prev) entry = prev.concat(prev[0]);
    else break;
    for(let i = 0; i < entry.length; i++) out.push(entry[i]);
    if(prev){
      dict[nextCode++] = prev.concat(entry[0]);
      if(nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
    }
    prev = entry;
    if(out.length >= expectedLength) break;
  }
  return out.slice(0, expectedLength);
}

function gifDeinterlace(indices, w, h){
  const out = new Array(indices.length);
  let src = 0;
  const passes = [
    {start:0, step:8},
    {start:4, step:8},
    {start:2, step:4},
    {start:1, step:2},
  ];
  passes.forEach(pass => {
    for(let y = pass.start; y < h; y += pass.step){
      for(let x = 0; x < w; x++) out[y * w + x] = indices[src++];
    }
  });
  return out;
}

function decodeGifAnimation(bytes){
  const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
  if(sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('not a GIF');
  let pos = 6;
  const width = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
  const height = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
  const packed = bytes[pos++];
  pos += 2; // background + pixel aspect
  let globalTable = null;
  if(packed & 0x80){
    const res = gifColorTable(bytes, pos, 1 << ((packed & 7) + 1));
    globalTable = res.table;
    pos = res.pos;
  }
  const frames = [];
  let gce = {delay:100, transparent:false, transparentIndex:-1, disposal:0};
  while(pos < bytes.length){
    const block = bytes[pos++];
    if(block === 0x3b) break;
    if(block === 0x21){
      const label = bytes[pos++];
      if(label === 0xf9){
        pos++; // block size
        const gp = bytes[pos++];
        const delay = (bytes[pos] | (bytes[pos + 1] << 8)) * 10; pos += 2;
        const transparentIndex = bytes[pos++];
        pos++; // terminator
        gce = {
          delay:delay || 100,
          transparent:!!(gp & 1),
          transparentIndex,
          disposal:(gp >> 2) & 7,
        };
      } else {
        pos = gifSkipSubBlocks(bytes, pos);
      }
      continue;
    }
    if(block !== 0x2c) break;
    const x = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    const y = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    const w = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    const h = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    const ip = bytes[pos++];
    let table = globalTable;
    if(ip & 0x80){
      const res = gifColorTable(bytes, pos, 1 << ((ip & 7) + 1));
      table = res.table;
      pos = res.pos;
    }
    const minCodeSize = bytes[pos++];
    const blocks = gifReadSubBlocks(bytes, pos);
    pos = blocks.pos;
    let indices = gifLzwDecode(minCodeSize, blocks.data, w * h);
    if(ip & 0x40) indices = gifDeinterlace(indices, w, h);
    frames.push({x, y, w, h, table, indices, gce:Object.assign({}, gce)});
    gce = {delay:100, transparent:false, transparentIndex:-1, disposal:0};
  }
  if(!frames.length) throw new Error('GIF has no frames');
  const pixels = new Uint8ClampedArray(width * height * 4);
  const rendered = [];
  let prev = null;
  frames.forEach(frame => {
    if(prev){
      if(prev.gce.disposal === 2){
        for(let yy = 0; yy < prev.h; yy++){
          for(let xx = 0; xx < prev.w; xx++){
            const di = ((prev.y + yy) * width + prev.x + xx) * 4;
            pixels[di] = pixels[di + 1] = pixels[di + 2] = pixels[di + 3] = 0;
          }
        }
      } else if(prev.gce.disposal === 3 && prev.restore){
        pixels.set(prev.restore);
      }
    }
    const restore = frame.gce.disposal === 3 ? new Uint8ClampedArray(pixels) : null;
    for(let yy = 0; yy < frame.h; yy++){
      for(let xx = 0; xx < frame.w; xx++){
        const idx = frame.indices[yy * frame.w + xx];
        if(frame.gce.transparent && idx === frame.gce.transparentIndex) continue;
        const rgb = frame.table && frame.table[idx];
        if(!rgb) continue;
        const di = ((frame.y + yy) * width + frame.x + xx) * 4;
        pixels[di] = rgb[0];
        pixels[di + 1] = rgb[1];
        pixels[di + 2] = rgb[2];
        pixels[di + 3] = 255;
      }
    }
    rendered.push({imageData:new ImageData(new Uint8ClampedArray(pixels), width, height), delay:Math.max(20, frame.gce.delay || 100)});
    prev = {x:frame.x, y:frame.y, w:frame.w, h:frame.h, gce:frame.gce, restore};
  });
  return {width, height, frames:rendered};
}

function applyAnimatedGifTexture(gp, mat, src, isCurrentLoad, configure){
  return fetch(src)
    .then(res => {
      if(!res.ok) throw new Error('GIF fetch failed');
      return res.arrayBuffer();
    })
    .then(buf => decodeGifAnimation(new Uint8Array(buf)))
    .then(anim => {
      if(!isCurrentLoad()) return;
      const c = document.createElement('canvas');
      c.width = anim.width;
      c.height = anim.height;
      const g = c.getContext('2d');
      let frameIndex = 0;
      let elapsed = 0;
      const draw = () => {
        g.putImageData(anim.frames[frameIndex].imageData, 0, 0);
      };
      draw();
      const tx = configure(new THREE.CanvasTexture(c));
      gp.userData.textureFrameUpdate = dt => {
        if(!isCurrentLoad()) return;
        elapsed += Math.max(1, (dt || 1 / 60) * 1000);
        let changed = false;
        while(elapsed >= anim.frames[frameIndex].delay){
          elapsed -= anim.frames[frameIndex].delay;
          frameIndex = (frameIndex + 1) % anim.frames.length;
          changed = true;
        }
        if(changed){
          draw();
          tx.needsUpdate = true;
        }
      };
      mat.map = tx;
      mat.needsUpdate = true;
      gp.userData.textureLoaded = true;
      gp.userData.textureFrameUpdate(0);
    });
}

function placeholderTexture(){
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#151a24'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ffd166'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
  g.fillStyle = '#4be3a0'; g.fillRect(64, 0, 64, 64); g.fillRect(0, 64, 64, 64);
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 0, c.width, c.height);
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

function applyTextureMapFromSource(gp, mat, props){
  const loadId = (gp.userData.textureLoadId || 0) + 1;
  gp.userData.textureLoadId = loadId;
  const isCurrentLoad = () => gp.userData.textureLoadId === loadId;
  function configure(tx){
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.wrapS = tx.wrapT = THREE.ClampToEdgeWrapping;
    tx.anisotropy = 4;
    return tx;
  }
  const apply = tx => {
    if(!isCurrentLoad()) return;
    configure(tx);
    mat.map = tx;
    mat.needsUpdate = true;
    gp.userData.textureLoaded = true;
  };
  const srcPromise = props.dbKey && window.LK_ASSET_BLOBS
    ? window.LK_ASSET_BLOBS.getUrl(props.dbKey)
    : Promise.resolve(props.src || null);
  srcPromise.then(src => {
    if(!src) return;
    if(isAnimatedTextureProps(props)){
      applyAnimatedGifTexture(gp, mat, src, isCurrentLoad, configure).catch(err => {
        console.warn('LotKing store: GIF decoder fallback', err);
        budgetTexture(new THREE.TextureLoader().load(src, apply, undefined, loadErr => console.warn('LotKing store: texture/decal non caricata', loadErr)));
      });
      return;
    }
    budgetTexture(new THREE.TextureLoader().load(src, apply, undefined, err => console.warn('LotKing store: texture/decal non caricata', err)));
  }).catch(err => console.warn('LotKing store: texture/decal non caricata', err));
}

function updateTextureObject(gp, patch){
  if(!gp || !gp.userData) return gp;
  const props = normalizeTextureProps(Object.assign({}, gp.userData.textureProps || {}, patch || {}));
  gp.userData.textureProps = props;
  gp.userData.textureFrameUpdate = null;
  if(gp.userData.textureAnimatedImage && gp.userData.textureAnimatedImage.parentNode){
    gp.userData.textureAnimatedImage.parentNode.removeChild(gp.userData.textureAnimatedImage);
  }
  gp.userData.textureAnimatedImage = null;
  gp.children.slice().forEach(child => {
    gp.remove(child);
    if(child.geometry && child.geometry.dispose) child.geometry.dispose();
    if(child.material && child.material.dispose) child.material.dispose();
  });
  const mat = createTextureMaterial(props);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(.05, props.width || 2), Math.max(.05, props.height || 2)), mat);
  mesh.name = props.mode === 'image' ? 'Free Texture Image' : 'Free Texture Decal';
  mesh.renderOrder = 40;
  mesh.position.y = props.mode === 'decal' ? Math.max(0, props.depthBias || 0) : 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  gp.add(mesh);
  applyTextureMapFromSource(gp, mat, props);
  const animatedTexture = isAnimatedTextureProps(props);
  const surfaceLayer = props.blending === 'surface';
  gp.userData.textureSurfaceSignature = '';
  gp.userData.textureSurfaceElapsed = 0;
  if(animatedTexture || surfaceLayer){
    gp.userData.effectUpdate = dt => {
      if(animatedTexture){
        if(gp.userData.textureFrameUpdate) gp.userData.textureFrameUpdate(dt);
        else if(mat.map) mat.map.needsUpdate = true;
      }
      if(surfaceLayer){
        gp.userData.textureSurfaceElapsed += Number(dt) || 0;
        const signature = textureSurfaceTransformSignature(gp);
        const moved = signature !== gp.userData.textureSurfaceSignature;
        const needsFirstMatch = !gp.userData.textureProps.surfaceReceiverId && gp.userData.textureSurfaceElapsed >= .5;
        if(moved || needsFirstMatch){
          gp.userData.textureSurfaceSignature = signature;
          gp.userData.textureSurfaceElapsed = 0;
          matchTextureSurface(gp, true);
        }
      }
    };
  } else if(gp.userData.effectUpdate && gp.userData.editorType === 'texture'){
    delete gp.userData.effectUpdate;
  }
  return gp;
}

function createTexture(kind, props){
  const gp = new THREE.Group();
  gp.userData.textureKind = kind === 'image' ? 'image' : 'decal';
  gp.userData.textureProps = normalizeTextureProps(Object.assign({mode: gp.userData.textureKind}, props || {}));
  return updateTextureObject(gp);
}

// ------------------------------------------------ factories: editor cameras / cinema studios
function normalizeCameraProps(props){
  return Object.assign({
    fov:50,
    near:.05,
    far:800,
    helperSize:1.2,
    preview:true,
    activeLevelCamera:false,
    outputPlayerIndex:null,
    // A scene camera had no aspect at all, so a preview had nothing of its own to
    // honour and fell back to the PLAYER camera's ratio - which is why every camera
    // previewed as the same shape. `auto` means "no opinion": the level default, and
    // then the viewport, answer instead. See js/runtime/aspect-policy.js.
    aspect:'auto',
  }, props || {});
}

function createCameraHelperMesh(props){
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({color:0x66d9ff, transparent:true, opacity:.9, depthTest:false});
  const bodyMat = new THREE.MeshBasicMaterial({color:0x24364f, transparent:true, opacity:.82, depthTest:false});
  const lensMat = new THREE.MeshBasicMaterial({color:0x66d9ff, transparent:true, opacity:.9, depthTest:false});
  const s = Math.max(.25, props.helperSize || 1.2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(s*.54, s*.34, s*.28), bodyMat);
  body.position.set(0, 0, s*.12);
  body.userData.nonExportable = true;
  body.userData.editorCameraHelperPick = true;
  body.renderOrder = 997;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(s*.12, s*.16, s*.22, 18), lensMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, -s*.1);
  lens.userData.nonExportable = true;
  lens.userData.editorCameraHelperPick = true;
  lens.renderOrder = 998;
  const top = new THREE.Mesh(new THREE.BoxGeometry(s*.24, s*.1, s*.18), lensMat);
  top.position.set(0, s*.24, s*.1);
  top.userData.nonExportable = true;
  top.userData.editorCameraHelperPick = true;
  top.renderOrder = 998;
  g.add(body, lens, top);
  const pts = [
    new THREE.Vector3(0,0,0), new THREE.Vector3(-s*.55,-s*.35,-s),
    new THREE.Vector3(0,0,0), new THREE.Vector3(s*.55,-s*.35,-s),
    new THREE.Vector3(0,0,0), new THREE.Vector3(s*.55,s*.35,-s),
    new THREE.Vector3(0,0,0), new THREE.Vector3(-s*.55,s*.35,-s),
    new THREE.Vector3(-s*.55,-s*.35,-s), new THREE.Vector3(s*.55,-s*.35,-s),
    new THREE.Vector3(s*.55,-s*.35,-s), new THREE.Vector3(s*.55,s*.35,-s),
    new THREE.Vector3(s*.55,s*.35,-s), new THREE.Vector3(-s*.55,s*.35,-s),
    new THREE.Vector3(-s*.55,s*.35,-s), new THREE.Vector3(-s*.55,-s*.35,-s),
    new THREE.Vector3(-s*.22,s*.52,-s*.55), new THREE.Vector3(s*.22,s*.52,-s*.55),
    new THREE.Vector3(s*.22,s*.52,-s*.55), new THREE.Vector3(0,s*.82,-s*.55),
    new THREE.Vector3(0,s*.82,-s*.55), new THREE.Vector3(-s*.22,s*.52,-s*.55),
  ];
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
  line.userData.nonExportable = true;
  line.renderOrder = 998;
  g.add(line);
  return g;
}

function updateSceneCameraObject(gp, patch){
  if(!gp || !gp.userData) return gp;
  const props = normalizeCameraProps(Object.assign({}, gp.userData.cameraProps || {}, patch || {}));
  gp.userData.cameraProps = props;
  let cam = gp.userData.sceneCamera;
  if(!cam){
    cam = new THREE.PerspectiveCamera(props.fov, innerWidth / Math.max(1, innerHeight), props.near, props.far);
    cam.name = 'Scene Camera View';
    cam.userData.nonExportable = true;
    gp.userData.sceneCamera = cam;
    gp.add(cam);
  }
  cam.fov = props.fov;
  cam.near = props.near;
  cam.far = props.far;
  cam.position.set(0, 0, 0);
  cam.rotation.set(0, 0, 0);
  cam.scale.set(1, 1, 1);
  cam.updateProjectionMatrix();
  const oldHelper = gp.children.find(child => child.userData && child.userData.editorCameraHelper);
  if(oldHelper) gp.remove(oldHelper);
  const helper = createCameraHelperMesh(props);
  helper.userData.editorCameraHelper = true;
  helper.visible = props.preview !== false;
  gp.add(helper);
  return gp;
}

function createSceneCamera(props){
  const gp = new THREE.Group();
  gp.userData.cameraProps = normalizeCameraProps(props);
  return updateSceneCameraObject(gp);
}

function normalizeCinemaStudioProps(props){
  const out = Object.assign({
    version:4,
    duration:6,
    fps:24,
    playback:'one-shot',
    trigger:'manual',
    eventName:'',
    outputPlayerIndex:null,
    previewCamera:'',
    cameraCuts:[],
    movieTrack:[],
    cameras:[],
    keyframes:[],
    objectTracks:[],
    lensTracks:[],
    eventTracks:[],
    markers:[],
    completion:{mode:'cut',duration:1,curve:'ease-in-out',playerId:null,pawnId:''},
  }, props || {});
  out.version = Math.max(4, Number(out.version) || 1);
  out.duration = Math.max(.1, Math.min(86400, Number(out.duration) || 6));
  if(!Array.isArray(out.cameraCuts)) out.cameraCuts = Array.isArray(out.movieTrack) ? out.movieTrack : [];
  out.movieTrack = out.cameraCuts;
  if(!Array.isArray(out.objectTracks)) out.objectTracks = [];
  out.objectTracks.forEach(track => {
    track.pathMode = ['linear','smooth','bezier'].includes(track.pathMode) ? track.pathMode : 'linear';
    track.pathVisible = track.pathVisible !== false;
  });
  if(!Array.isArray(out.lensTracks)) out.lensTracks = [];
  if(!Array.isArray(out.eventTracks)) out.eventTracks = [];
  if(!Array.isArray(out.markers)) out.markers = [];
  const completion=Object.assign({mode:'cut',duration:1,curve:'ease-in-out',playerId:null,pawnId:''},out.completion||{});
  completion.mode=completion.mode==='blend'?'blend':'cut';
  completion.duration=Math.max(0,Math.min(30,Number(completion.duration)||0));
  completion.curve=['linear','ease-in','ease-out','ease-in-out'].includes(completion.curve)?completion.curve:'ease-in-out';
  const playerId=Number(completion.playerId);
  completion.playerId=Number.isInteger(playerId)&&playerId>=1&&playerId<=4?playerId:null;
  completion.pawnId=typeof completion.pawnId==='string'?completion.pawnId.trim():'';
  out.completion=completion;
  return out;
}

function createCinemaStudio(props){
  const gp = new THREE.Group();
  gp.userData.cinemaProps = normalizeCinemaStudioProps(props);
  const helper = new THREE.Group();
  helper.name = 'Cinema Studio Clapperboard Helper';
  helper.position.y = 1.05;
  const dark = new THREE.MeshBasicMaterial({color:0x151a22, depthTest:false});
  const gold = new THREE.MeshBasicMaterial({color:0xffd166, depthTest:false});
  const pale = new THREE.MeshBasicMaterial({color:0xf8fafc, depthTest:false});
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, .16), dark);
  body.position.y = .1;
  const bodyBand = new THREE.Mesh(new THREE.BoxGeometry(1.55, .08, .18), gold);
  bodyBand.position.set(0, .14, 0);
  const top = new THREE.Group();
  top.position.set(-.88, .72, 0);
  top.rotation.z = .16;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.9, .28, .18), pale);
  bar.position.x = .95;
  top.add(bar);
  for(let i = 0; i < 5; i++){
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(.22, .3, .19), dark);
    stripe.position.x = .22 + i * .39;
    stripe.rotation.z = -.48;
    top.add(stripe);
  }
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .22, 16), gold);
  hinge.rotation.x = Math.PI / 2;
  hinge.position.set(-.88, .72, 0);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .75, 8), gold);
  stem.position.y = -.8;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.48, .58, .08, 24), dark);
  base.position.y = -1.18;
  helper.add(body, bodyBand, top, hinge, stem, base);
  helper.traverse(child => {
    child.userData.nonExportable = true;
    child.userData.editorHelper = true;
    child.renderOrder = 998;
  });
  gp.add(helper);
  return gp;
}

function createLogicElement(props){
  props = props || {};
  const gp = new THREE.Group();
  gp.userData.logicAssetId = props.logicAssetId || null;
  gp.userData.logicLinked = !!(props.logicLinked !== false && gp.userData.logicAssetId);
  gp.userData.logicVariableOverrides = cloneData(props.variableOverrides || {});
  gp.userData.logicGraph = resolveLogicElementGraph({
    graph:props.graph,
    logicAssetId:gp.userData.logicAssetId,
    logicLinked:gp.userData.logicLinked,
    logicAsset:props.logicAsset,
    variableOverrides:gp.userData.logicVariableOverrides,
  }, props.name || 'Logic Element');
  gp.userData.logicEnabled = props.enabled !== false;
  gp.userData.logicRunInEditorPreview = props.runInEditorPreview !== false;
  syncLogicElementSceneObject(gp, gp.userData.logicGraph);
  return gp;
}

// ------------------------------------------------ factories: lights
const _editorLightHandleGeometries = Object.create(null);
let _editorLightHandleMaterial = null;
function editorLightHandleGeometry(kind){
  const key = kind === 'spot' ? 'spot' : 'point';
  if(_editorLightHandleGeometries[key]) return _editorLightHandleGeometries[key];
  const geometry = key === 'spot'
    ? new THREE.ConeGeometry(.58, 1.15, 10, 1, true)
    : new THREE.OctahedronGeometry(.62, 0);
  if(key === 'spot') geometry.translate(0, -.42, 0);
  _editorLightHandleGeometries[key] = geometry;
  return geometry;
}
function editorLightHandleMaterial(){
  if(!_editorLightHandleMaterial){
    _editorLightHandleMaterial = new THREE.MeshBasicMaterial({
      color:0xffd166, wireframe:true, transparent:true, opacity:.78,
      depthTest:false, depthWrite:false, toneMapped:false,
    });
  }
  return _editorLightHandleMaterial;
}
function createLight(kind, props){
  props = props || {};
  const color = props.color != null ? props.color : 0xffeecc;
  const punctual = kind === 'spot' || kind === 'point';
  const defaultIntensity = kind === 'spot' ? 600 : (kind === 'point' ? 300 : 1);
  const intensity = punctual
    ? (props.intensity != null
      ? (props.intensityUnit === 'candela' ? Math.max(0, Number(props.intensity) || 0) : Math.max(0, Number(props.intensity) || 0) * LEGACY_PUNCTUAL_INTENSITY_TO_CANDELA)
      : defaultIntensity)
    : (props.intensity != null ? props.intensity : defaultIntensity);
  const resolvedProps = punctual && props.intensity != null && props.intensityUnit !== 'candela'
    ? Object.assign({}, props, {intensity, intensityUnit:'candela'})
    : props;
  const gp = new THREE.Group();
  let l;
  const makeHandle = () => {
    const handle = new THREE.Mesh(editorLightHandleGeometry(kind), editorLightHandleMaterial());
    handle.name = 'Editor Light Pick Handle';
    handle.userData.editorLightHandle = true;
    handle.userData.lightPickHandle = true;
    handle.userData.editorOnly = true;
    handle.userData.nonExportable = true;
    handle.visible = false;
    handle.frustumCulled = false;
    handle.renderOrder = 999;
    return handle;
  };
  if(kind === 'spot'){
    l = new THREE.SpotLight(color, intensity,
      props.distance != null ? props.distance : 40,
      props.angle != null ? props.angle : .5,
      props.penumbra != null ? props.penumbra : .4,
      props.decay != null ? props.decay : 2);
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
    l = new THREE.PointLight(color, intensity, props.distance != null ? props.distance : 35, props.decay != null ? props.decay : 2);
    gp.position.y = 6;
  }
  applyLightProps(l, resolvedProps);
  gp.add(l);
  gp.add(makeHandle());
  gp.userData.lightKind = kind;
  gp.userData.light = l;
  gp.userData.lightDummyVisible = l.userData.editorDummyVisible !== false;
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
const EFFECT_RENDER_ORDER = 60;
const EFFECT_PRESETS = {
  smoke:  {rate:12, size:1.8, life:2.2, rise:2.4, spread:.7, gravity:0,   color:0xbfc3cc, opacity:.4,  additive:false, grow:true,  renderOrder:EFFECT_RENDER_ORDER},
  fire:   {rate:38, size:1.3, life:.85, rise:3.2, spread:.7, gravity:0,   color:0xff8830, opacity:.85, additive:true,  grow:false, renderOrder:EFFECT_RENDER_ORDER + 12},
  sparks: {rate:55, size:.28, life:.75, rise:3.5, spread:3,  gravity:-7,  color:0xffd966, opacity:.95, additive:true,  grow:false, renderOrder:EFFECT_RENDER_ORDER + 12},
  steam:  {rate:18, size:1.1, life:1.4, rise:3.6, spread:.4, gravity:0,   color:0xe8f0ff, opacity:.35, additive:false, grow:true,  renderOrder:EFFECT_RENDER_ORDER},
  glow:   {rate:2,  size:4.5, life:2.6, rise:.1,  spread:.1, gravity:0,   color:0x66c2ff, opacity:.5,  additive:true,  grow:false, renderOrder:EFFECT_RENDER_ORDER + 8},
};
function createEmitter(kind, params){
  const p = Object.assign({kind: kind || 'smoke'}, EFFECT_PRESETS[kind] || EFFECT_PRESETS.smoke, params || {});
  p.renderOrder = Number.isFinite(Number(p.renderOrder)) ? Number(p.renderOrder) : EFFECT_RENDER_ORDER;
  const gp = new THREE.Group();
  gp.renderOrder = p.renderOrder;
  const N = Math.min(220, Math.max(16, Math.ceil(p.rate * p.life * 1.5)));
  const parts = [];
  for(let i=0;i<N;i++){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softTex(), color: p.color, transparent: true, opacity: 0, depthWrite: false, depthTest: true,
      blending: p.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    s.renderOrder = p.renderOrder;
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
  gp.userData.effectSetRenderOrder = value => {
    p.renderOrder = Number.isFinite(Number(value)) ? Number(value) : EFFECT_RENDER_ORDER;
    gp.renderOrder = p.renderOrder;
    for(const q of parts) q.s.renderOrder = p.renderOrder;
  };
  return gp;
}

// ------------------------------------------------ factory: GLB import
// Kept outside Object3D.userData: embedding BufferGeometry there would make
// ordinary Three.js clones serialize a complete hidden geometry payload.
const UV_BASE_GEOMETRIES = new WeakMap();
function normalizeMeshEdits(value){
  const edits = value && typeof value === 'object' ? cloneData(value) : {};
  edits.version = 1;
  edits.deleted = Array.isArray(edits.deleted) ? Array.from(new Set(edits.deleted.map(String))) : [];
  edits.detached = Array.isArray(edits.detached) ? Array.from(new Set(edits.detached.map(String))) : [];
  edits.transforms = edits.transforms && typeof edits.transforms === 'object' ? edits.transforms : {};
  edits.properties = edits.properties && typeof edits.properties === 'object' ? edits.properties : {};
  edits.splits = edits.splits && typeof edits.splits === 'object' ? edits.splits : {};
  edits.uvMappings = edits.uvMappings && typeof edits.uvMappings === 'object' ? edits.uvMappings : {};
  edits.joins = Array.isArray(edits.joins) ? edits.joins.filter(join => join && join.id && Array.isArray(join.parts) && join.parts.length > 1).map(join => ({
    id:String(join.id),
    name:String(join.name || 'Joined Mesh'),
    parts:Array.from(new Set(join.parts.map(String))),
  })) : [];
  return edits;
}

function normalizedUvMapping(value){
  const input = value && typeof value === 'object' ? value : {};
  const allowed = ['planar-x','planar-y','planar-z','cube','cylindrical','spherical','smart'];
  return {
    mode:allowed.includes(input.mode) ? input.mode : 'smart',
    offset:Array.isArray(input.offset) ? [Number(input.offset[0]) || 0, Number(input.offset[1]) || 0] : [0,0],
    scale:Array.isArray(input.scale) ? [Math.max(.001, Number(input.scale[0]) || 1), Math.max(.001, Number(input.scale[1]) || 1)] : [1,1],
    rotation:Number(input.rotation) || 0,
    padding:Math.max(0, Math.min(.12, Number(input.padding) || .018)),
  };
}
function restoreUvBaseGeometry(mesh){
  const base = mesh && UV_BASE_GEOMETRIES.get(mesh);
  if(!base || !base.clone) return false;
  if(mesh.geometry && mesh.geometry !== base && mesh.geometry.dispose) mesh.geometry.dispose();
  mesh.geometry = base.clone();
  return true;
}
function applyUvMapping(mesh, value){
  if(!mesh || !mesh.geometry || !mesh.geometry.attributes || !mesh.geometry.attributes.position) return false;
  const THREERef = window.THREE;
  if(!THREERef || !THREERef.Float32BufferAttribute) return false;
  const map = normalizedUvMapping(value);
  if(!UV_BASE_GEOMETRIES.has(mesh)) UV_BASE_GEOMETRIES.set(mesh, mesh.geometry.clone());
  else restoreUvBaseGeometry(mesh);
  let geometry = mesh.geometry;
  const faceMapping = map.mode === 'cube' || map.mode === 'smart';
  const hasMorphs = mesh.morphTargetInfluences || Object.keys(geometry.morphAttributes || {}).length;
  if(faceMapping && geometry.index && !mesh.isSkinnedMesh && !hasMorphs){
    const expanded = geometry.toNonIndexed();
    if(geometry !== UV_BASE_GEOMETRIES.get(mesh) && geometry.dispose) geometry.dispose();
    geometry = expanded;
    mesh.geometry = geometry;
  }
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const size = new THREERef.Vector3();
  if(box && box.getSize) box.getSize(size);
  size.set(Math.max(size.x, 1e-6), Math.max(size.y, 1e-6), Math.max(size.z, 1e-6));
  const uv = new Float32Array(pos.count * 2);
  const project = (axis, x, y, z) => {
    if(axis === 0) return [(z - box.min.z) / size.z, (y - box.min.y) / size.y];
    if(axis === 1) return [(x - box.min.x) / size.x, (z - box.min.z) / size.z];
    return [(x - box.min.x) / size.x, (y - box.min.y) / size.y];
  };
  const write = (index, u, v, group) => {
    if(map.mode === 'smart'){
      const col = group % 3, row = Math.floor(group / 3);
      const pad = map.padding;
      u = (col + pad + u * (1 - pad * 2)) / 3;
      v = (row + pad + v * (1 - pad * 2)) / 2;
    }
    const angle = map.rotation * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const cx = (u - .5) * map.scale[0], cy = (v - .5) * map.scale[1];
    uv[index * 2] = cx * cos - cy * sin + .5 + map.offset[0];
    uv[index * 2 + 1] = cx * sin + cy * cos + .5 + map.offset[1];
  };
  const triMapped = faceMapping && !geometry.index;
  if(triMapped){
    const a = new THREERef.Vector3(), b = new THREERef.Vector3(), c = new THREERef.Vector3();
    const ab = new THREERef.Vector3(), ac = new THREERef.Vector3(), face = new THREERef.Vector3();
    for(let start = 0; start + 2 < pos.count; start += 3){
      a.fromBufferAttribute(pos, start); b.fromBufferAttribute(pos, start + 1); c.fromBufferAttribute(pos, start + 2);
      face.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
      const abs = [Math.abs(face.x), Math.abs(face.y), Math.abs(face.z)];
      const axis = abs[0] > abs[1] && abs[0] > abs[2] ? 0 : (abs[1] > abs[2] ? 1 : 2);
      const sign = axis === 0 ? face.x : (axis === 1 ? face.y : face.z);
      const group = axis * 2 + (sign < 0 ? 1 : 0);
      for(let corner = 0; corner < 3; corner++){
        const index = start + corner;
        const pair = project(axis, pos.getX(index), pos.getY(index), pos.getZ(index));
        write(index, sign < 0 ? 1 - pair[0] : pair[0], pair[1], group);
      }
    }
  } else {
    for(let index = 0; index < pos.count; index++){
      const x = pos.getX(index), y = pos.getY(index), z = pos.getZ(index);
      let u = 0, v = 0, group = 0;
      if(map.mode === 'spherical'){
        const nx = (x - (box.min.x + box.max.x) * .5) / size.x;
        const ny = (y - (box.min.y + box.max.y) * .5) / size.y;
        const nz = (z - (box.min.z + box.max.z) * .5) / size.z;
        const length = Math.hypot(nx, ny, nz) || 1;
        u = .5 + Math.atan2(nz, nx) / (Math.PI * 2);
        v = .5 - Math.asin(Math.max(-1, Math.min(1, ny / length))) / Math.PI;
      } else if(map.mode === 'cylindrical'){
        const nx = x - (box.min.x + box.max.x) * .5;
        const nz = z - (box.min.z + box.max.z) * .5;
        u = .5 + Math.atan2(nz, nx) / (Math.PI * 2);
        v = (y - box.min.y) / size.y;
      } else {
        let axis = map.mode === 'planar-x' ? 0 : (map.mode === 'planar-z' ? 2 : 1);
        let sign = 1;
        if(faceMapping && normal){
          const values = [Math.abs(normal.getX(index)), Math.abs(normal.getY(index)), Math.abs(normal.getZ(index))];
          axis = values[0] > values[1] && values[0] > values[2] ? 0 : (values[1] > values[2] ? 1 : 2);
          sign = axis === 0 ? normal.getX(index) : (axis === 1 ? normal.getY(index) : normal.getZ(index));
        }
        const pair = project(axis, x, y, z); u = sign < 0 ? 1 - pair[0] : pair[0]; v = pair[1];
        group = axis * 2 + (sign < 0 ? 1 : 0);
      }
      write(index, u, v, group);
    }
  }
  geometry.setAttribute('uv', new THREERef.Float32BufferAttribute(uv, 2));
  geometry.attributes.uv.needsUpdate = true;
  geometry.computeBoundingSphere();
  mesh.userData.lkUvMapping = map;
  return true;
}
function assignMeshEditIds(root){
  let index = 0;
  root.traverse(node => {
    if(!node.isMesh || node.userData && node.userData.lkMeshEditGenerated) return;
    if(!node.userData.lkMeshEditId) node.userData.lkMeshEditId = 'mesh:' + index;
    if(!node.userData.lkMeshEditBaseProps) node.userData.lkMeshEditBaseProps = {
      name:node.name || '', visible:node.visible !== false,
      castShadow:!!node.castShadow, receiveShadow:!!node.receiveShadow,
      frustumCulled:node.frustumCulled !== false, renderOrder:node.renderOrder || 0,
    };
    index++;
  });
}
function triangleMaterialIndex(geometry, triangle){
  const offset = triangle * 3;
  const group = (geometry.groups || []).find(item => offset >= item.start && offset < item.start + item.count);
  return group ? (group.materialIndex || 0) : 0;
}
function meshTriangleComponents(geometry, mode){
  const source = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const position = source.attributes && source.attributes.position;
  if(!position) return {source, components:[]};
  const triangleCount = Math.floor(position.count / 3);
  if(triangleCount > 120000) return {source, components:[], tooLarge:true};
  if(mode === 'material'){
    const groups = new Map();
    for(let triangle = 0; triangle < triangleCount; triangle++){
      const materialIndex = triangleMaterialIndex(source, triangle);
      if(!groups.has(materialIndex)) groups.set(materialIndex, []);
      groups.get(materialIndex).push(triangle);
    }
    return {source, components:Array.from(groups.values())};
  }
  const parent = Array.from({length:triangleCount}, (_, i) => i);
  const find = value => {
    let current = value;
    while(parent[current] !== current){ parent[current] = parent[parent[current]]; current = parent[current]; }
    return current;
  };
  const union = (a, b) => {
    const aa = find(a), bb = find(b);
    if(aa !== bb) parent[bb] = aa;
  };
  const ownerByVertex = new Map();
  const precision = 100000;
  for(let triangle = 0; triangle < triangleCount; triangle++){
    for(let corner = 0; corner < 3; corner++){
      const vertex = triangle * 3 + corner;
      const key = Math.round(position.getX(vertex) * precision) + ':' + Math.round(position.getY(vertex) * precision) + ':' + Math.round(position.getZ(vertex) * precision);
      if(ownerByVertex.has(key)) union(triangle, ownerByVertex.get(key));
      else ownerByVertex.set(key, triangle);
    }
  }
  const groups = new Map();
  for(let triangle = 0; triangle < triangleCount; triangle++){
    const id = find(triangle);
    if(!groups.has(id)) groups.set(id, []);
    groups.get(id).push(triangle);
  }
  return {source, components:Array.from(groups.values())};
}
function geometryFromTriangles(source, triangles){
  const geometry = new THREE.BufferGeometry();
  Object.keys(source.attributes || {}).forEach(name => {
    const attr = source.attributes[name];
    const values = [];
    const read = (vertex, component) => {
      if(component === 0 && attr.getX) return attr.getX(vertex);
      if(component === 1 && attr.getY) return attr.getY(vertex);
      if(component === 2 && attr.getZ) return attr.getZ(vertex);
      if(component === 3 && attr.getW) return attr.getW(vertex);
      return attr.array ? attr.array[vertex * attr.itemSize + component] : 0;
    };
    triangles.forEach(triangle => {
      for(let corner = 0; corner < 3; corner++){
        const vertex = triangle * 3 + corner;
        for(let component = 0; component < attr.itemSize; component++) values.push(read(vertex, component));
      }
    });
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, attr.itemSize));
  });
  triangles.forEach((triangle, index) => geometry.addGroup(index * 3, 3, triangleMaterialIndex(source, triangle)));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
function cloneMeshEditMaterial(material, suffix){
  const clone = material && material.clone ? material.clone() : material;
  if(clone && clone !== material){
    ['map','normalMap','roughnessMap','metalnessMap','alphaMap','emissiveMap','aoMap','lightMap','bumpMap','displacementMap'].forEach(key => {
      if(material[key] && material[key].clone){ clone[key] = material[key].clone(); clone[key].needsUpdate = true; }
    });
  }
  if(clone && suffix) clone.name = (material && material.name || 'Material') + ' · ' + suffix;
  return clone;
}
function splitMeshForEditing(mesh, mode){
  if(!mesh || !mesh.isMesh || mesh.isSkinnedMesh || !mesh.geometry || mesh.morphTargetInfluences || Object.keys(mesh.geometry.morphAttributes || {}).length) return [];
  const id = mesh.userData.lkMeshEditId;
  const result = meshTriangleComponents(mesh.geometry, mode);
  if(result.tooLarge || result.components.length < 2){
    if(result.source && result.source.dispose) result.source.dispose();
    return [];
  }
  const group = new THREE.Group();
  group.name = (mesh.name || id) + ' · separated';
  group.userData.lkMeshEditGenerated = true;
  group.userData.lkMeshEditSplitSource = id;
  group.position.copy(mesh.position);
  group.quaternion.copy(mesh.quaternion);
  group.scale.copy(mesh.scale);
  result.components.forEach((triangles, index) => {
    const geometry = geometryFromTriangles(result.source, triangles);
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const usedMaterialIds = Array.from(new Set((geometry.groups || []).map(item => item.materialIndex || 0)));
    const materialMap = new Map(usedMaterialIds.map((id, materialIndex) => [id, materialIndex]));
    geometry.groups.forEach(item => { item.materialIndex = materialMap.get(item.materialIndex || 0) || 0; });
    const materials = usedMaterialIds.map(id => cloneMeshEditMaterial(sourceMaterials[id] || sourceMaterials[0], 'Part ' + (index + 1)));
    const child = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
    child.name = (mesh.name || id) + ' · Part ' + (index + 1);
    child.castShadow = mesh.castShadow;
    child.receiveShadow = mesh.receiveShadow;
    child.renderOrder = mesh.renderOrder;
    child.userData.lkMeshEditGenerated = true;
    child.userData.lkMeshEditId = id + '#part:' + index;
    group.add(child);
  });
  if(result.source && result.source.dispose) result.source.dispose();
  mesh.visible = false;
  mesh.userData.lkMeshEditSplitHidden = true;
  mesh.parent.add(group);
  return group.children.slice();
}
function joinedGeometry(root, parts){
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const prepared = parts.map(mesh => {
    mesh.updateMatrixWorld(true);
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld));
    const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const count = geometry.attributes.position.count;
    const groups = geometry.groups && geometry.groups.length ? geometry.groups : [{start:0, count, materialIndex:0}];
    const usedMaterialIds = Array.from(new Set(groups.map(group => group.materialIndex || 0)));
    const materialMap = new Map(usedMaterialIds.map((id, index) => [id, index]));
    return {mesh, geometry, groups, materialMap, materials:usedMaterialIds.map(id => cloneMeshEditMaterial(sourceMaterials[id] || sourceMaterials[0], 'Joined ' + (mesh.name || mesh.userData.lkMeshEditId || 'Part')))};
  });
  const names = Array.from(new Set(prepared.flatMap(item => Object.keys(item.geometry.attributes || {}))));
  const output = new THREE.BufferGeometry();
  names.forEach(name => {
    const itemSize = Math.max.apply(null, prepared.map(item => item.geometry.attributes[name] && item.geometry.attributes[name].itemSize || 0));
    if(!itemSize) return;
    const values = [];
    prepared.forEach(item => {
      const attr = item.geometry.attributes[name];
      const count = item.geometry.attributes.position.count;
      for(let vertex = 0; vertex < count; vertex++){
        for(let component = 0; component < itemSize; component++){
          let value = 0;
          if(attr && component < attr.itemSize){
            if(component === 0 && attr.getX) value = attr.getX(vertex);
            else if(component === 1 && attr.getY) value = attr.getY(vertex);
            else if(component === 2 && attr.getZ) value = attr.getZ(vertex);
            else if(component === 3 && attr.getW) value = attr.getW(vertex);
          } else if(name === 'color' && component < 3) value = 1;
          values.push(value);
        }
      }
    });
    output.setAttribute(name, new THREE.Float32BufferAttribute(values, itemSize));
  });
  let vertexOffset = 0;
  let materialOffset = 0;
  const materials = [];
  prepared.forEach(item => {
    const count = item.geometry.attributes.position.count;
    item.groups.forEach(group => output.addGroup(vertexOffset + group.start, group.count, materialOffset + (item.materialMap.get(group.materialIndex || 0) || 0)));
    vertexOffset += count;
    materials.push.apply(materials, item.materials);
    materialOffset += item.materials.length;
    item.geometry.dispose();
  });
  output.computeBoundingBox();
  output.computeBoundingSphere();
  return {geometry:output, materials};
}
function joinMeshesForEditing(root, definition, meshes){
  const parts = definition.parts.map(id => meshes.get(id)).filter(mesh => mesh && mesh.isMesh && !mesh.isSkinnedMesh && !mesh.morphTargetInfluences);
  if(parts.length < 2) return null;
  const merged = joinedGeometry(root, parts);
  const mesh = new THREE.Mesh(merged.geometry, merged.materials.length === 1 ? merged.materials[0] : merged.materials);
  mesh.name = definition.name || 'Joined Mesh';
  mesh.castShadow = parts.some(part => part.castShadow);
  mesh.receiveShadow = parts.some(part => part.receiveShadow);
  mesh.renderOrder = Math.max.apply(null, parts.map(part => part.renderOrder || 0));
  mesh.userData.lkMeshEditGenerated = true;
  mesh.userData.lkMeshEditJoin = true;
  mesh.userData.lkMeshEditId = definition.id;
  mesh.userData.lkMeshEditJoinParts = definition.parts.slice();
  parts.forEach(part => { part.visible = false; part.userData.lkMeshEditJoinHidden = true; });
  root.add(mesh);
  return mesh;
}
function applyMeshEdits(root, value){
  if(!root) return root;
  const edits = normalizeMeshEdits(value);
  root.traverse(node => {
    if(node.isMesh && node.userData && !node.userData.lkMeshEditGenerated) restoreUvBaseGeometry(node);
  });
  const generated = [];
  root.traverse(node => { if(node.userData && node.userData.lkMeshEditGenerated && node.parent) generated.push(node); });
  generated.filter(node => !(node.parent && node.parent.userData && node.parent.userData.lkMeshEditGenerated)).forEach(node => {
    node.traverse(child => {
      if(child.isMesh && child.userData && child.userData.lkMeshEditGenerated){
        if(child.geometry && child.geometry.dispose) child.geometry.dispose();
        const materials = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
        materials.forEach(material => {
          if(!material) return;
          ['map','normalMap','roughnessMap','metalnessMap','alphaMap','emissiveMap','aoMap','lightMap','bumpMap','displacementMap'].forEach(key => {
            // Shared procedural surface maps are owned by the surface cache; see
            // isSharedSurfaceTexture. Disposing them here blanks every other
            // object that shows the same kind.
            if(material[key] && material[key].dispose && !isSharedSurfaceTexture(material[key])) material[key].dispose();
          });
          if(material.dispose) material.dispose();
        });
      }
    });
    node.parent.remove(node);
  });
  root.traverse(node => {
    if(node.userData && node.userData.lkMeshEditSplitHidden){ node.visible = true; delete node.userData.lkMeshEditSplitHidden; }
    if(node.userData && node.userData.lkMeshEditJoinHidden){ node.visible = true; delete node.userData.lkMeshEditJoinHidden; }
    if(node.userData && node.userData.lkMeshEditDeleted){ node.visible = true; delete node.userData.lkMeshEditDeleted; }
    if(node.isMesh && node.userData && node.userData.lkMeshEditBaseProps){
      const p = node.userData.lkMeshEditBaseProps;
      node.name = p.name; node.visible = p.visible; node.castShadow = p.castShadow;
      node.receiveShadow = p.receiveShadow; node.frustumCulled = p.frustumCulled;
      node.renderOrder = p.renderOrder;
    }
  });
  assignMeshEditIds(root);
  const originals = new Map();
  root.traverse(node => { if(node.isMesh && node.userData && node.userData.lkMeshEditId) originals.set(node.userData.lkMeshEditId, node); });
  Object.keys(edits.splits).sort().forEach(id => {
    const mesh = originals.get(id);
    if(mesh) splitMeshForEditing(mesh, edits.splits[id] === 'material' ? 'material' : 'connected');
  });
  const meshes = new Map();
  root.traverse(node => { if(node.isMesh && node.userData && node.userData.lkMeshEditId) meshes.set(node.userData.lkMeshEditId, node); });
  edits.detached.forEach(id => {
    const mesh = meshes.get(id);
    if(mesh && mesh.parent && mesh.parent !== root) root.attach(mesh);
  });
  Object.keys(edits.transforms).forEach(id => {
    const mesh = meshes.get(id), t = edits.transforms[id];
    if(!mesh || !t) return;
    if(Array.isArray(t.p)) mesh.position.fromArray(t.p);
    if(Array.isArray(t.r)) mesh.rotation.set(t.r[0] || 0, t.r[1] || 0, t.r[2] || 0);
    if(Array.isArray(t.s)) mesh.scale.fromArray(t.s);
  });
  edits.joins.forEach(join => {
    const joined = joinMeshesForEditing(root, join, meshes);
    if(joined) meshes.set(join.id, joined);
  });
  const joinedMeshes = new Map();
  root.traverse(node => { if(node.isMesh && node.userData && node.userData.lkMeshEditId) joinedMeshes.set(node.userData.lkMeshEditId, node); });
  Object.keys(edits.transforms).forEach(id => {
    const mesh = joinedMeshes.get(id), t = edits.transforms[id];
    if(!mesh || !t) return;
    if(Array.isArray(t.p)) mesh.position.fromArray(t.p);
    if(Array.isArray(t.r)) mesh.rotation.set(t.r[0] || 0, t.r[1] || 0, t.r[2] || 0);
    if(Array.isArray(t.s)) mesh.scale.fromArray(t.s);
  });
  Object.keys(edits.properties).forEach(id => {
    const mesh = joinedMeshes.get(id), p = edits.properties[id];
    if(!mesh || !p) return;
    if(typeof p.name === 'string') mesh.name = p.name;
    if(typeof p.visible === 'boolean') mesh.visible = p.visible;
    if(typeof p.castShadow === 'boolean') mesh.castShadow = p.castShadow;
    if(typeof p.receiveShadow === 'boolean') mesh.receiveShadow = p.receiveShadow;
    if(typeof p.frustumCulled === 'boolean') mesh.frustumCulled = p.frustumCulled;
    if(Number.isFinite(Number(p.renderOrder))) mesh.renderOrder = Number(p.renderOrder);
  });
  Object.keys(edits.uvMappings).forEach(id => {
    const mesh = joinedMeshes.get(id);
    if(mesh) applyUvMapping(mesh, edits.uvMappings[id]);
  });
  edits.deleted.forEach(id => {
    const mesh = joinedMeshes.get(id);
    if(mesh){ mesh.visible = false; mesh.userData.lkMeshEditDeleted = true; }
  });
  root.userData.meshEdits = edits;
  if(root.userData.addedEntry) root.userData.addedEntry.meshEdits = cloneData(edits);
  return root;
}
function loadGlbRaw(src){
  return new Promise((resolve, reject) => {
    if(typeof THREE.GLTFLoader === 'undefined'){ reject(new Error('GLTFLoader non disponibile')); return; }
    new THREE.GLTFLoader().load(src, g => resolve(budgetObjectTextures(g.scene)), undefined, err => reject(err));
  });
}
function vehicleLikeGlbEntry(entry){
  const text = [
    entry && entry.name,
    entry && entry.source,
    entry && entry.src,
    entry && entry.asset && entry.asset.name,
    entry && entry.asset && entry.asset.source,
    entry && entry.asset && entry.asset.key,
  ].filter(Boolean).join(' ').toLowerCase();
  return /\b(car|vehicle|auto|truck|van|bus|taxi|coupe|sedan|suv|hatchback|ambulance|police|macchina|veicolo|camion|furgone)\b/.test(text);
}
function normalizeVehicleGlbRoot(root){
  const box = new THREE.Box3().setFromObject(root);
  if(box.isEmpty()) return false;
  const size = box.getSize(new THREE.Vector3());
  if(size.x <= size.z * 1.08) return false;
  root.rotation.y += Math.PI / 2;
  root.updateMatrixWorld(true);
  return true;
}
function hideGlbPhysicsMetadata(root){
  let hidden = 0;
  if(!root || !root.traverse) return hidden;
  root.traverse(node => {
    const data = node && node.userData || {};
    const tag = String(data.data || data.kind || '').toLowerCase();
    if(tag !== 'physics' && !data.sketchbookPhysics) return;
    node.visible = false;
    node.userData.lkPhysicsMetadataHidden = true;
    hidden++;
  });
  root.userData.lkHiddenPhysicsMetadataCount = hidden;
  return hidden;
}
function loadGlb(src, fit, opts){
  opts = opts || {};
  return new Promise((resolve, reject) => {
    if(typeof THREE.GLTFLoader === 'undefined'){ reject(new Error('GLTFLoader non disponibile')); return; }
    const loader = new THREE.GLTFLoader();
    loader.load(src, g => {
      const root = g.scene;
      // Sketchbook physics nodes contain ordinary renderable meshes. Hide them
      // as soon as GLTFLoader yields the scene, before it can be registered or
      // rendered for a frame; Cannon materialization may happen later.
      if(opts.hidePhysicsMetadata) hideGlbPhysicsMetadata(root);
      // An imported model brings its own maps, and a 4K PBR set is 67 MB per
      // map before mipmaps. The cap applies here, once, rather than being
      // rediscovered as a stutter later.
      budgetObjectTextures(root);
      root.traverse(o => { if(o.isMesh){ o.castShadow = true; } });
      if(opts.suppressEmbeddedLights){
        const embedded = [];
        root.traverse(o => { if(o && o.isLight) embedded.push(o); });
        embedded.forEach(light => { if(light.parent) light.parent.remove(light); });
      }
      if(opts.vehicleLike && normalizeVehicleGlbRoot(root)){
        root.userData.lkVehicleAxisNormalized = true;
      }
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
      gp.animations = (g.animations || []).map(clip => clip && clip.clone ? clip.clone() : clip);
      resolve(gp);
    }, undefined, err => reject(err));
  });
}
function loadGlbEntry(entry){
  const opts = {
    vehicleLike:vehicleLikeGlbEntry(entry),
    suppressEmbeddedLights:!!entry.embeddedLightsExtracted,
    hidePhysicsMetadata:entry.physicsBackend === 'sketchbook-metadata' || entry.metadataMode === 'gltf-extras',
  };
  if(entry.src) return loadGlb(entry.src, entry.fit, opts).then(root => applyMeshEdits(root, entry.meshEdits));
  const dbKey = entry.dbKey || (entry.asset && entry.asset.dbKey);
  if(dbKey && window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(dbKey).then(url => loadGlb(url, entry.fit, opts)).then(root => applyMeshEdits(root, entry.meshEdits));
  return Promise.reject(new Error('sorgente GLB non disponibile'));
}

function extractEmbeddedLights(GAME, root, sourceEntry){
  if(!GAME || !root || !sourceEntry || sourceEntry.embeddedLightsExtracted) return [];
  root.updateMatrixWorld(true);
  const found = [];
  root.traverse(node => { if(node && node.isLight && !node.userData.editorLightHandle) found.push(node); });
  if(!found.length) return [];
  const created = [];
  found.forEach((source, index) => {
    const kind = source.isSpotLight ? 'spot' : (source.isDirectionalLight ? 'directional' : 'point');
    const fallbackIntensity = kind === 'spot' ? 600 : (kind === 'point' ? 300 : 1.1);
    const rawIntensity = Number(source.intensity);
    const props = {
      color:source.color ? source.color.getHex() : 0xfff1d0,
      intensity:Number.isFinite(rawIntensity) && rawIntensity > 0 ? Math.max(.1, Math.min(100000, rawIntensity)) : fallbackIntensity,
      intensityUnit:kind === 'spot' || kind === 'point' ? 'candela' : undefined,
      distance:source.distance > 0 ? Math.max(2, Math.min(100, source.distance)) : (kind === 'spot' ? 45 : 35),
      angle:source.isSpotLight && source.angle > 0 ? Math.max(.1, Math.min(1.2, source.angle)) : .55,
      penumbra:source.isSpotLight && Number.isFinite(source.penumbra) ? Math.max(0, Math.min(1, source.penumbra)) : .35,
      decay:Number.isFinite(source.decay) && source.decay > 0 ? Math.max(.5, Math.min(3, source.decay)) : 2,
      castShadow:false,
    };
    const lightRoot = createLight(kind, props);
    const worldPos = source.getWorldPosition(new THREE.Vector3());
    const sourceQuat = source.getWorldQuaternion(new THREE.Quaternion());
    let direction = new THREE.Vector3(0, 0, -1).applyQuaternion(sourceQuat).normalize();
    if(source.target && source.target.getWorldPosition){
      const targetPos = source.target.getWorldPosition(new THREE.Vector3());
      if(targetPos.distanceToSquared(worldPos) > 1e-6) direction.copy(targetPos).sub(worldPos).normalize();
    }
    lightRoot.position.copy(worldPos);
    if(kind !== 'point') lightRoot.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction);
    const id = nextId();
    const baseName = source.name || ((sourceEntry.name || 'GLB') + ' ' + (kind === 'spot' ? 'Spot' : kind === 'point' ? 'Point' : 'Directional') + ' Light ' + (index + 1));
    const entry = {id, kind:'light', light:kind, name:baseName, props, t:tOf(lightRoot), embeddedFrom:sourceEntry.id || null};
    registerAdded(GAME, lightRoot, entry);
    created.push(lightRoot);
  });
  found.forEach(light => { if(light.parent) light.parent.remove(light); });
  sourceEntry.embeddedLightsExtracted = true;
  root.userData.embeddedLightsExtracted = true;
  return created;
}

// THREE.Object3D.copy() clones userData through JSON serialization. Runtime
// collider metadata contains owner/list links back into the scene, so cloning a
// saved builtin duplicate directly can throw on a circular structure. Keep the
// source untouched and give Three only the serializable authoring metadata.
function cloneSerializableUserData(value){
  if(!value || typeof value !== 'object') return {};
  const seen = new WeakSet();
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if(typeof item === 'function') return undefined;
      if(key === 'owner' || key === '_boxList' || item && item.isObject3D) return undefined;
      if(item && typeof item === 'object'){
        if(seen.has(item)) return undefined;
        seen.add(item);
      }
      return item;
    }));
  } catch(err){ return {}; }
}

function cloneObject3DForRestore(source){
  const savedUserData = [];
  source.traverse(node => {
    savedUserData.push([node, node.userData]);
    node.userData = cloneSerializableUserData(node.userData);
  });
  try {
    return source.clone(true);
  } finally {
    savedUserData.forEach(item => { item[0].userData = item[1]; });
  }
}

// ------------------------------------------------ create from a saved "added" entry
function createFromEntry(entry, GAME, restoreSources){
  if(entry.kind === 'camera') return Promise.resolve(createSceneCamera(entry.props));
  if(entry.kind === 'cinemaStudio') return Promise.resolve(createCinemaStudio(entry.props));
  if(entry.kind === 'logicElement'){
    if(entry.logicAsset) importLogicElementAsset(entry.logicAsset);
    const object = createLogicElement({
      graph:entry.graph || entry.logic,
      logicAssetId:entry.logicAssetId,
      logicLinked:entry.logicLinked,
      logicAsset:entry.logicAsset,
      variableOverrides:entry.variableOverrides,
      enabled:entry.enabled,
      runInEditorPreview:entry.runInEditorPreview,
      name:entry.name,
    });
    return Promise.resolve(object.userData.logicElementAssetReady).then(() => object);
  }
  if(entry.kind === 'driftTrack') return Promise.resolve(createDriftTrack(entry.props));
  if(entry.kind === 'light') return Promise.resolve(createLight(entry.light, entry.props));
  if(entry.kind === 'effect') return Promise.resolve(createEmitter(entry.effect, entry.params));
  if(entry.kind === 'text') return Promise.resolve(createText(entry.textKind || '2d', entry.props));
  if(entry.kind === 'texture') return Promise.resolve(createTexture(entry.textureKind || (entry.props && entry.props.mode) || 'decal', entry.props));
  if(entry.kind === 'glb') return loadGlbEntry(entry);
  if(entry.kind === 'proceduralAsset') return Promise.resolve(createProceduralAsset(entry.procedural));
  if(entry.kind === 'clone'){
    let src = GAME && GAME.world.registry.find(o => o.userData.editorId === entry.srcId)
      || restoreSources && restoreSources[entry.srcId];
    if(!src && restoreSources){
      // Builtin IDs from very old snapshots can shift when the procedural
      // default world gains a new object. Clone recipes still carry the stable
      // human source name ("Light Pole 5 copy"), so migrate by exact base name
      // instead of silently dropping the clone.
      const sourceName = String(entry.srcName || entry.name || '')
        .replace(/\s+(?:copy|copia)(?:\s+\d+)?$/i, '').trim().toLowerCase();
      if(sourceName){
        src = Object.values(restoreSources).find(object => {
          const name = object && object.userData && object.userData.editorName || object && object.name || '';
          return String(name).trim().toLowerCase() === sourceName;
        }) || null;
      }
    }
    if(!src) return Promise.reject(new Error('sorgente clone non trovata: ' + entry.srcId));
    const c = cloneObject3DForRestore(src);
    c.userData = {};
    // A duplicate is an editable object of its own. Three's default clone
    // shares geometries and materials, which made later Inspector edits leak
    // back to the source (and vice versa).
    c.traverse(node => {
      if(!node || !node.isMesh) return;
      if(node.userData && node.userData.editorLightHandle) return;
      if(node.geometry && node.geometry.clone) node.geometry = node.geometry.clone();
      if(Array.isArray(node.material)) node.material = node.material.map(material => material && material.clone ? material.clone() : material);
      else if(node.material && node.material.clone) node.material = node.material.clone();
      // Material.clone() copies texture REFERENCES, so without this the copy
      // would share one texture - and therefore one repeat - with its source and
      // rescaling either one would re-tile both.
      if(surfaces()){
        const list = Array.isArray(node.material) ? node.material : [node.material];
        list.forEach(material => { if(material) surfaces().adopt(material); });
      }
    });
    if(src.userData && src.userData.lkSurface) c.userData.lkSurface = cloneData(src.userData.lkSurface);
    return Promise.resolve(c);
  }
  const gp = createPrimitive(entry.prim, entry.props);
  if(entry.props) applyMatProps(gp, entry.props);
  return Promise.resolve(gp);
}
function entryType(entry, obj){
  if(entry.kind === 'clone') return objectLight(obj) ? 'light' : 'mesh';
  if(entry.kind === 'text') return 'text';
  if(entry.kind === 'texture') return 'texture';
  if(entry.kind === 'camera') return 'camera';
  if(entry.kind === 'cinemaStudio') return 'cinemaStudio';
  if(entry.kind === 'logicElement') return 'logicElement';
  return entry.kind === 'light' ? 'light' : entry.kind === 'effect' ? 'effect' : 'mesh';
}

function migrateLegacyCharacterGroundPlacement(entry){
  if(!entry || entry.kind !== 'logicElement' || Number(entry.logicGroundPlacementVersion) >= 2) return false;
  const graph = entry.graph || entry.logic || entry.logicAsset && entry.logicAsset.graph;
  const character = graph && (graph.characterPawn || graph.soccerPawn);
  const source = String(entry.asset && entry.asset.source || '');
  const editorPlaced = source === 'Logic Element template' || source === 'Reusable Logic Element' || source === 'Editor logic';
  const position = entry.t && Array.isArray(entry.t.p) ? entry.t.p : null;
  const root = graph && graph.logicScene && graph.logicScene.root;
  const rootY = root && Array.isArray(root.position) ? Number(root.position[1]) || 0 : 0;
  let migrated = false;
  if(character && editorPlaced && position && Math.abs((Number(position[1]) || 0) - .15) < 1e-6 && Math.abs(rootY) < 1e-6){
    position[1] = 0;
    migrated = true;
    if(character.spawn && Math.abs((Number(character.spawn.y) || 0) - .15) < 1e-6) character.spawn.y = 0;
    const spawnY = (graph.variables || []).find(variable => variable && variable.binding === 'spawn.y');
    if(spawnY && Math.abs((Number(spawnY.value) || 0) - .15) < 1e-6) spawnY.value = 0;
    if(entry.variableOverrides && spawnY && Math.abs((Number(entry.variableOverrides[spawnY.name]) || 0) - .15) < 1e-6) entry.variableOverrides[spawnY.name] = 0;
  }
  entry.logicGroundPlacementVersion = 2;
  return migrated;
}

// register + optional box collider for an added object
function registerAdded(GAME, obj, entry){
  ensureEffectHook(GAME);
  const groundPlacementMigrated = migrateLegacyCharacterGroundPlacement(entry);
  obj.userData.addedEntry = entry;
  if(entry.meshEdits) applyMeshEdits(obj, entry.meshEdits);
  if(entry.kind === 'logicElement'){
    obj.userData.logicAssetId = entry.logicAssetId || obj.userData.logicAssetId || null;
    obj.userData.logicLinked = !!(entry.logicLinked !== false && obj.userData.logicAssetId);
    obj.userData.logicVariableOverrides = cloneData(entry.variableOverrides || obj.userData.logicVariableOverrides || {});
    if(groundPlacementMigrated){
      obj.userData.logicGraph = resolveLogicElementGraph({
        graph:entry.graph || entry.logic,
        logicAssetId:entry.logicAssetId,
        logicLinked:entry.logicLinked,
        logicAsset:entry.logicAsset,
        variableOverrides:entry.variableOverrides,
      }, entry.name || 'Logic Element');
    }
  }
  if(entry.asset){
    obj.userData.assetKey = entry.asset.key;
    obj.userData.assetName = entry.asset.name;
    obj.userData.assetSource = entry.asset.source;
  }
  // clone entries can also contain lights (for example built-in light poles).
  // Keep their live light state separately from mesh material properties so a
  // save/reload never falls back to the source object's defaults.
  if(entry.lightProps){
    const liveLight = objectLight(obj);
    if(liveLight){
      applyLightProps(liveLight, entry.lightProps);
      obj.userData.lightDummyVisible = liveLight.userData.editorDummyVisible !== false;
    }
  }
  const entryMass = entry && entry.physicsMass;
  const defaultMass = physicsMassFrom(entryMass);
  const defaultImpact = physicsImpactFrom(entry && entry.physicsImpact);
  obj.userData.physicsMass = defaultMass;
  obj.userData.physicsImpact = defaultImpact;
  if(entry && entry.driveSurface != null) obj.userData.driveSurface = !!entry.driveSurface;
  // Material tag read by character audio (footsteps) through the collider that
  // owns this object. Free-form on purpose: a project can invent its own names
  // and add matching slots to its Character Sound Set.
  if(entry && typeof entry.surface === 'string' && entry.surface) obj.userData.surface = entry.surface;
  // Gameplay contracts authored on an ordinary scene object: `interact` makes it
  // a door / ladder / carryable, `item` makes it a pickup. Both are read by the
  // runtime systems straight off userData, so a level template or the inspector
  // can turn ANY primitive or imported model into one without a special kind.
  if(entry && entry.interact && typeof entry.interact === 'object') obj.userData.interact = cloneData(entry.interact);
  if(entry && entry.item && typeof entry.item === 'object') obj.userData.item = cloneData(entry.item);
  if(entry && entry.colliderShape) obj.userData.colliderShape = cloneData(entry.colliderShape);
  if(entry && (entry.colliderDummyVisibility === 'show' || entry.colliderDummyVisibility === 'hide')) obj.userData.colliderDummyVisibility = entry.colliderDummyVisibility;
  if(entry && entry.colliderOnly){
    obj.userData.colliderOnly = true;
    obj.userData.cinemaTrigger = cloneData(entry.cinemaTrigger || {enabled:false, eventName:'', mode:'once'});
    obj.traverse(n => {
      if(!n.isMesh) return;
      n.material = new THREE.MeshBasicMaterial({color:0x4be3a0, wireframe:true, transparent:true, opacity:.28, depthTest:false});
      n.renderOrder = 997;
    });
  }
  const wantPhysics = !!(entry && entry.physics) && entry.kind !== 'driftTrack';
  let colliderOpt = null;
  const hasCollider = entry.kind !== 'driftTrack' && !!(entry && (entry.collide || wantPhysics || entry.driveSurface === true));
  if(hasCollider){
    const colliderKind = colliderKindFrom(entry && entry.colliderKind);
    const col = colliderKind === 'circle'
      ? {x:0, z:0, r:1, mass:defaultMass, impact:defaultImpact, owner:obj}
      : {x:0, z:0, hx:1, hz:1, mass:defaultMass, impact:defaultImpact, owner:obj, _boxList:GAME.world.colliders.box};
    col.enabled = true;
    col.physics = !!wantPhysics;
    if(colliderKind === 'circle') GAME.world.colliders.circle.push(col);
    else GAME.world.colliders.box.push(col);
    colliderOpt = {kind:colliderKind, ref:col};
  }
  obj.userData.physicsEnabled = !!wantPhysics;
  if(obj.userData.addedEntry){
    obj.userData.addedEntry.physics = obj.userData.physicsEnabled;
    if(!wantPhysics && obj.userData.addedEntry.physics === undefined){
      obj.userData.addedEntry.physics = false;
    }
  }
  GAME.world.register(obj, entry.name || entry.kind, entryType(entry, obj), {id: entry.id, builtin: false, collider: colliderOpt});
  if(entry.kind === 'logicElement') obj.userData.logicInstanceId = obj.userData.editorId || entry.id;
  GAME.core.scene.add(obj);
  applyT(obj, entry.t);
  if(entry.kind === 'logicElement'){
    const graph = obj.userData.logicGraph || entry.graph || entry.logic;
    // createFromEntry already awaited this exact bundled Sketchbook hierarchy.
    // Rebuilding it here would dispose the real GLB, recreate a placeholder and
    // start a second unobserved hydration. Pending/editor-created instances still
    // take the normal sync path; every other Logic Element is unchanged.
    if(!groundPlacementMigrated && graph && graph.sketchbookPawn && sketchbookLogicAssetHierarchyReady(obj, graph)) retagLogicElementOwner(obj);
    else syncLogicElementSceneObject(obj, graph);
  }
  if(entry.kind === 'driftTrack') syncDriftTrackColliders(GAME, obj);
  if(hasCollider) syncCollider(obj);
  return obj;
}

// Strips the runtime-only bookkeeping a gameplay contract accumulates while it
// plays, so saving a level never persists "this door is halfway open".
function cleanContract(source, transient){
  const out = cloneData(source) || {};
  transient.forEach(key => { delete out[key]; });
  return out;
}

// Build a serializable snapshot from the object as it exists right now in the
// editor. Duplication must copy this state, not the possibly stale placement
// recipe kept in userData.addedEntry.
function snapshotAddedEntry(obj, baseEntry){
  if(!obj) return cloneData(baseEntry || {});
  const ud = obj.userData || {};
  const entry = cloneData(baseEntry || ud.addedEntry || {});
  entry.name = ud.editorName || entry.name || obj.name || 'Object';
  entry.t = tOf(obj);

  const colliderRef = ud.collider && ud.collider.ref;
  entry.collide = !!(colliderRef && colliderRef.enabled !== false);
  entry.physics = !!(ud.physicsEnabled || colliderRef && colliderRef.physics);
  if(colliderRef){
    entry.colliderKind = colliderKindFrom(ud.collider && ud.collider.kind);
    entry.physicsMass = physicsMassFrom(colliderRef.mass != null ? colliderRef.mass : ud.physicsMass);
    entry.physicsImpact = physicsImpactFrom(colliderRef.impact != null ? colliderRef.impact : ud.physicsImpact);
  } else {
    delete entry.colliderKind;
    entry.physicsMass = physicsMassFrom(ud.physicsMass);
    entry.physicsImpact = physicsImpactFrom(ud.physicsImpact);
  }
  if(ud.colliderShape) entry.colliderShape = cloneData(ud.colliderShape);
  else delete entry.colliderShape;
  if(ud.colliderDummyVisibility === 'show' || ud.colliderDummyVisibility === 'hide') entry.colliderDummyVisibility = ud.colliderDummyVisibility;
  else delete entry.colliderDummyVisibility;
  if(ud.colliderOnly) entry.colliderOnly = true;
  if(ud.colliderOnly && ud.cinemaTrigger) entry.cinemaTrigger = cloneData(ud.cinemaTrigger);
  if(ud.driveSurface != null) entry.driveSurface = !!ud.driveSurface;
  if(typeof ud.surface === 'string' && ud.surface) entry.surface = ud.surface;
  else delete entry.surface;
  // Round-trip the gameplay contracts. The runtime adds its own bookkeeping
  // fields to the live descriptor, so only the authored subset is written back.
  if(ud.interact) entry.interact = cleanContract(ud.interact, ['progress', 'fired', 'closeTimer', 'basis', '__normalized', '__colliderWasEnabled']);
  else delete entry.interact;
  if(ud.item) entry.item = cleanContract(ud.item, ['consumed', 'respawnTimer', '__normalized']);
  else delete entry.item;
  if(ud.meshEdits) entry.meshEdits = normalizeMeshEdits(ud.meshEdits);
  else delete entry.meshEdits;

  const liveLight = objectLight(obj);
  if(liveLight){
    const props = lightProps(liveLight);
    if(entry.kind === 'light') entry.props = props;
    else entry.lightProps = props;
  } else {
    delete entry.lightProps;
  }

  if(entry.kind === 'effect') entry.params = cloneData(ud.effectParams || entry.params || {});
  else if(entry.kind === 'text') entry.props = cloneData(ud.textProps || entry.props || {});
  else if(entry.kind === 'texture') entry.props = cloneData(ud.textureProps || entry.props || {});
  else if(entry.kind === 'camera') entry.props = cloneData(ud.cameraProps || entry.props || {});
  else if(entry.kind === 'cinemaStudio') entry.props = normalizeCinemaStudioProps(cloneData(ud.cinemaProps || entry.props || {}));
  else if(entry.kind === 'driftTrack'){
    entry.props = cloneData(ud.driftTrackParams || entry.props || {});
    entry.collide = false;
    entry.physics = false;
    delete entry.colliderKind;
    delete entry.colliderShape;
    delete entry.physicsMass;
    delete entry.physicsImpact;
  }
  else if(entry.kind === 'logicElement'){
    entry.graph = normalizeLogicGraph(ud.logicGraph || entry.graph || entry.logic, entry.name, 'element');
    entry.enabled = ud.logicEnabled !== false;
    entry.runInEditorPreview = ud.logicRunInEditorPreview !== false;
    entry.logicAssetId = ud.logicAssetId || null;
    entry.logicLinked = !!(ud.logicLinked && entry.logicAssetId);
    entry.variableOverrides = cloneData(ud.logicVariableOverrides || {});
    if(entry.logicLinked){
      const definition = logicElementAssetById(entry.logicAssetId) || entry.logicAsset;
      if(definition) entry.logicAsset = cloneData(definition);
    } else {
      delete entry.logicAssetId;
      delete entry.logicLinked;
      delete entry.variableOverrides;
      delete entry.logicAsset;
    }
  } else if(ud.matProps){
    entry.props = cloneData(ud.matProps);
  }
  if(ud.assetKey) entry.asset = Object.assign({}, entry.asset || {}, {key:ud.assetKey, name:ud.assetName, source:ud.assetSource});
  return entry;
}

// ------------------------------------------------ effects hook (game + editor loops)
const sceneStoreEffectHookToken = {};
function installDynamicSurfaceInteraction(GAME){
  if(!GAME || !GAME.core) return;
  const renderer = GAME.core.renderer;
  const canvas = renderer && renderer.domElement;
  const scene = GAME.core.scene;
  if(!canvas || !scene) return;
  const slot='__lkDynamicSurfaceInteraction',previous=GAME[slot];
  if(previous&&previous.token===sceneStoreEffectHookToken&&previous.canvas===canvas)return;
  if(previous){
    if(previous.pointerDown)window.removeEventListener('pointerdown',previous.pointerDown,true);
    if(previous.pointerUp)window.removeEventListener('pointerup',previous.pointerUp,true);
  }
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const localPoint = new THREE.Vector3();
  const triangleA = new THREE.Vector3();
  const triangleB = new THREE.Vector3();
  const triangleC = new THREE.Vector3();
  const barycentric = new THREE.Vector3();
  const mappedUv = new THREE.Vector2();
  let down = null;
  const interactionRect = () => {
    if(GAME.player && typeof GAME.player.runtimeInteractionRect === 'function'){
      const runtimeRect = GAME.player.runtimeInteractionRect();
      if(runtimeRect && runtimeRect.w > 0 && runtimeRect.h > 0) return runtimeRect;
    }
    const rect = canvas.getBoundingClientRect();
    return {x:rect.left, y:rect.top, w:rect.width, h:rect.height};
  };
  const interactionEnabled = () => {
    if(GAME.player && typeof GAME.player.surfaceInteractionEnabled === 'function'){
      return GAME.player.surfaceInteractionEnabled();
    }
    return document.body.classList.contains('lk-game-ui-cursor');
  };
  const runtimeUiTarget = target => {
    if(!target || target === canvas || !target.closest) return false;
    return !!target.closest(
      'input, textarea, select, button, [role="button"], ' +
      '#lkAppMenuBar, #lkTopbar, #lkLeft, #lkRight, #lkAssetsDock, #lkStatus, ' +
      '#lkViewportToolbar, #settingsOverlay, #tunePanel, #radio, #overlay, ' +
      '#lkCinemaTimeline, #lkCinemaPreviewFrame, #lkPipFrame, .lk-win, .lk-movable'
    );
  };
  const pointInside = (event, rect) => !!(rect && rect.w > 0 && rect.h > 0 &&
    event.clientX >= rect.x && event.clientX <= rect.x + rect.w &&
    event.clientY >= rect.y && event.clientY <= rect.y + rect.h);
  const hitUvForTexture = (hit, texture) => {
    const channel = Math.max(0, Math.min(3, Number(texture && texture.channel) || 0));
    if(channel === 0 && hit.uv) return mappedUv.copy(hit.uv);
    const object = hit.object;
    const geometry = object && object.geometry;
    const face = hit.face;
    const attributeName = channel === 1 ? 'uv1' : (channel === 2 ? 'uv2' : (channel === 3 ? 'uv3' : 'uv'));
    const uvAttribute = geometry && geometry.getAttribute && geometry.getAttribute(attributeName);
    const baseUvAttribute = geometry && geometry.getAttribute && geometry.getAttribute('uv');
    const position = geometry && geometry.getAttribute && geometry.getAttribute('position');
    if(!face || !uvAttribute || !position || !hit.point) return hit.uv ? mappedUv.copy(hit.uv) : mappedUv.set(.5, .5);
    // Raycaster's primary UV already contains the correct barycentric result
    // for morph/skinned geometry. Recover those weights in UV space when
    // possible, then apply them to the separate auto-screen channel.
    if(hit.uv && baseUvAttribute){
      localPoint.set(hit.uv.x, hit.uv.y, 0);
      triangleA.set(baseUvAttribute.getX(face.a), baseUvAttribute.getY(face.a), 0);
      triangleB.set(baseUvAttribute.getX(face.b), baseUvAttribute.getY(face.b), 0);
      triangleC.set(baseUvAttribute.getX(face.c), baseUvAttribute.getY(face.c), 0);
    } else {
      localPoint.copy(hit.point);
      object.worldToLocal(localPoint);
      triangleA.fromBufferAttribute(position, face.a);
      triangleB.fromBufferAttribute(position, face.b);
      triangleC.fromBufferAttribute(position, face.c);
    }
    THREE.Triangle.getBarycoord(localPoint, triangleA, triangleB, triangleC, barycentric);
    if(!Number.isFinite(barycentric.x + barycentric.y + barycentric.z)){
      return hit.uv ? mappedUv.copy(hit.uv) : mappedUv.set(.5, .5);
    }
    mappedUv.set(
      uvAttribute.getX(face.a) * barycentric.x + uvAttribute.getX(face.b) * barycentric.y + uvAttribute.getX(face.c) * barycentric.z,
      uvAttribute.getY(face.a) * barycentric.x + uvAttribute.getY(face.b) * barycentric.y + uvAttribute.getY(face.c) * barycentric.z
    );
    return mappedUv;
  };
  const recordInteraction = (stage, extra) => {
    GAME.state.dynamicSurfaceInteraction = Object.assign({
      stage,
      at:Date.now(),
    }, extra || {});
  };
  const pointerDown = event => {
    const rect = interactionRect();
    down = null;
    if(event.button !== 0 || runtimeUiTarget(event.target) || !interactionEnabled() || !pointInside(event, rect)) return;
    down = {x:event.clientX, y:event.clientY, at:performance.now()};
    recordInteraction('pointer-down', {x:event.clientX, y:event.clientY});
  };
  const pointerUp = event => {
    if(event.button !== 0 || !down) return;
    const start = down;
    down = null;
    if(runtimeUiTarget(event.target)) return;
    if(Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6 || performance.now() - start.at > 700) return;
    const camera = GAME.core.camera;
    const rect = interactionRect();
    if(!camera || !interactionEnabled() || !pointInside(event, rect)) return;
    pointer.x = ((event.clientX - rect.x) / rect.w) * 2 - 1;
    pointer.y = -((event.clientY - rect.y) / rect.h) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(scene.children, true);
    recordInteraction('raycast', {hits:hits.length, x:event.clientX, y:event.clientY});
    // Interactive proxies are exact copies of the authored material faces and
    // therefore take priority over a coplanar source mesh or transparent
    // cockpit glass returned first by the raycaster.
    const orderedHits = hits.slice().sort((a, b) => {
      const ap = !!(a.object && a.object.userData && a.object.userData.lkDynamicSurfaceController);
      const bp = !!(b.object && b.object.userData && b.object.userData.lkDynamicSurfaceController);
      return ap === bp ? a.distance - b.distance : (ap ? -1 : 1);
    });
    for(const hit of orderedHits){
      const object = hit.object;
      if(!object || object.visible === false || object.userData && (object.userData.helperOnly || object.userData.lkRaycastIgnore)) continue;
      // Lines, flare sprites and editor adornments are not solid occluders for
      // an authored material screen. Only an opaque mesh may stop the ray.
      if(!object.isMesh || !object.material) continue;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const materialIndex = hit.face && hit.face.materialIndex != null ? hit.face.materialIndex : 0;
      const material = materials[materialIndex] || materials[0];
      const controller = object.userData && object.userData.lkDynamicSurfaceController ||
        material && material.lkDynamicTextureController;
      if(!controller || typeof controller.activate !== 'function'){
        // A transparent windscreen may legitimately sit between the cockpit
        // camera and its display. It must not make the screen behind it inert.
        if(material && (material.transparent === true || Number(material.opacity) < .98 || Number(material.transmission) > .01)) continue;
        recordInteraction('blocked', {object:object.name || object.uuid || 'mesh', material:material && material.name || ''});
        break;
      }
      const uv = hitUvForTexture(hit, controller.texture);
      // transformUv includes repeat/offset/rotation and CanvasTexture flipY,
      // so hit regions stay aligned after the author adapts the UI to a mesh.
      if(controller.texture && controller.texture.transformUv) controller.texture.transformUv(uv);
      if(controller.activate(uv.x, uv.y, {event, hit, GAME})){
        recordInteraction('activated', {
          object:object.name || object.uuid || 'mesh',
          material:controller.surfaceMaterial && controller.surfaceMaterial.name || material.name || '',
          type:controller.type,
          u:uv.x,
          v:uv.y,
        });
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      break;
    }
  };
  // Editor chrome can leave a transparent DOM element as the event target even
  // though the rendered game is the canvas below it. Window capture makes
  // interaction independent from that target while runtimeUiTarget protects
  // every real editor/game control.
  window.addEventListener('pointerdown', pointerDown, true);
  window.addEventListener('pointerup', pointerUp, true);
  const registration={token:sceneStoreEffectHookToken,canvas,pointerDown,pointerUp};
  try{Object.defineProperty(GAME,slot,{value:registration,writable:true,configurable:true});}catch(err){GAME[slot]=registration;}
}

function ensureEffectHook(GAME){
  installDynamicSurfaceInteraction(GAME);
  if(!GAME || !GAME.hooks || !Array.isArray(GAME.hooks.frame)) return;
  const slot='__lkSceneStoreEffectFrameHook',previous=GAME[slot];
  if(previous&&previous.__lkSceneStoreEffectHookToken===sceneStoreEffectHookToken&&GAME.hooks.frame.includes(previous)){if(previous.__lkRefreshEffectTargets)previous.__lkRefreshEffectTargets(true);return;}
  // A lazy/hot reload evaluates this module with fresh closures. Remove the
  // prior marked hook from the shared GAME before installing the replacement;
  // otherwise every reload advances Sketchbook mixers and runtime visuals one
  // extra time per frame.
  if(previous){for(let index=GAME.hooks.frame.length-1;index>=0;index--)if(GAME.hooks.frame[index]===previous)GAME.hooks.frame.splice(index,1);}
  for(let index=GAME.hooks.frame.length-1;index>=0;index--){const hook=GAME.hooks.frame[index];if(hook&&hook.__lkSceneStoreEffectHook===true)GAME.hooks.frame.splice(index,1);}
  let effectTargets=[],effectRegistry=null,effectRegistryLength=-1,effectRefreshElapsed=Infinity;
  const refreshEffectTargets=force=>{
    const registry=GAME.world&&Array.isArray(GAME.world.registry)?GAME.world.registry:[];
    if(!force&&effectRegistry===registry&&effectRegistryLength===registry.length&&effectRefreshElapsed<.75)return;
    effectRegistry=registry;effectRegistryLength=registry.length;effectRefreshElapsed=0;
    effectTargets=registry.filter(object=>object&&object.userData&&(typeof object.userData.effectUpdate==='function'||typeof object.userData.logicAnimationUpdate==='function'));
  };
  refreshEffectTargets(true);
  const hook=dt => {
    dynamicMaterialTextures.forEach(controller => {
      if(controller.type === 'vehicle-hud') drawDynamicVehicleHud(controller, false);
      else if(controller.type === 'radio-hud') drawDynamicRadioHud(controller, false);
      else if(controller.video && controller.video.paused && !controller.audioFocusPaused && !document.hidden) controller.video.play().catch(() => {});
    });
    effectRefreshElapsed+=Math.max(0,Number(dt)||0);
    const registry=GAME.world&&Array.isArray(GAME.world.registry)?GAME.world.registry:[];
    if(effectRegistry!==registry||effectRegistryLength!==registry.length||effectRefreshElapsed>=.75)refreshEffectTargets(false);
    for(const o of effectTargets){
      const data=o&&o.userData;
      if(data&&typeof data.effectUpdate==='function')data.effectUpdate(dt);
      if(data&&typeof data.logicAnimationUpdate==='function')data.logicAnimationUpdate(dt);
    }
    runSurfaceWarmup(GAME);
  };
  Object.defineProperties(hook,{__lkSceneStoreEffectHook:{value:true},__lkSceneStoreEffectHookToken:{value:sceneStoreEffectHookToken},__lkRefreshEffectTargets:{value:refreshEffectTargets}});
  GAME.hooks.frame.push(hook);
  try{Object.defineProperty(GAME,slot,{value:hook,writable:true,configurable:true});}catch(err){GAME[slot]=hook;}
}

// ------------------------------------------------ apply the whole saved scene at boot
let builtinIds = [];

function applyEnvironment(GAME, env){
  if(!GAME || !GAME.systems || !GAME.systems.sky || !env) return;
  if(env.skyTime != null) GAME.systems.sky.setTime(env.skyTime);
  if(env.dayLength != null) GAME.systems.sky.setDayLength(env.dayLength);
  if(GAME.systems.sky.setCycleEnabled) GAME.systems.sky.setCycleEnabled(env.dayNightCycleEnabled !== false);
  if(GAME.systems.sky.hdri) GAME.systems.sky.hdri.setEnabled(false);
  if(GAME.systems.sky.proceduralEnv){
    if(env.procEnvEnabled != null) GAME.systems.sky.proceduralEnv.setEnabled(env.procEnvEnabled);
    if(env.procEnvIntensity != null) GAME.systems.sky.proceduralEnv.setIntensity(env.procEnvIntensity);
    if(env.procEnvWarmth != null) GAME.systems.sky.proceduralEnv.setWarmth(env.procEnvWarmth);
    if(env.procEnvContrast != null) GAME.systems.sky.proceduralEnv.setContrast(env.procEnvContrast);
  }
  if(env.environmentOrientation&&GAME.systems.sky.orientation)GAME.systems.sky.orientation.set(env.environmentOrientation);
  if(GAME.systems.sky.flare){
    if(env.lensFlare && GAME.systems.sky.flare.set){
      GAME.systems.sky.flare.set(env.lensFlare);
    } else {
      // livelli salvati prima del flare parametrico
      if(env.flareEnabled != null) GAME.systems.sky.flare.setEnabled(env.flareEnabled);
      if(env.flareOpacity != null) GAME.systems.sky.flare.setOpacity(env.flareOpacity);
      if(env.flareSize != null) GAME.systems.sky.flare.setSize(env.flareSize);
    }
  }
  if(env.lighting && GAME.systems.sky.lighting) GAME.systems.sky.lighting.set(env.lighting);
  if(env.sunBloom && GAME.systems.sky.sunBloom) GAME.systems.sky.sunBloom.set(env.sunBloom);
  if(env.volClouds && GAME.systems.sky.volClouds) GAME.systems.sky.volClouds.set(env.volClouds);
  if(env.rain && GAME.systems.rain) GAME.systems.rain.set(env.rain);
  // Applied after rain/clouds: an enabled weather preset is the authority and
  // must overwrite the individual look values it owns.
  if(env.weather && window.LK_RUNTIME_WEATHER){
    const weather = GAME.systems.weather || window.LK_RUNTIME_WEATHER.install(GAME);
    if(weather) weather.set(env.weather);
  }
  if(GAME.systems.physics && GAME.systems.physics.setSurfaceWorldCollision && env.surfaceWorldCollision != null){
    GAME.systems.physics.setSurfaceWorldCollision(env.surfaceWorldCollision !== false);
  }
  if(GAME.player && GAME.player.updateLights) GAME.player.updateLights();
}

function collectEnvironment(GAME){
  const env = {
    skyTime: GAME.systems.sky.getTime(),
    dayLength: GAME.systems.sky.getDayLength(),
    dayNightCycleEnabled: GAME.systems.sky.getCycleEnabled ? GAME.systems.sky.getCycleEnabled() : true,
  };
  if(GAME.systems.sky.proceduralEnv){
    env.procEnvEnabled = GAME.systems.sky.proceduralEnv.getEnabled();
    env.procEnvIntensity = GAME.systems.sky.proceduralEnv.getIntensity();
    env.procEnvWarmth = GAME.systems.sky.proceduralEnv.getWarmth();
    env.procEnvContrast = GAME.systems.sky.proceduralEnv.getContrast();
  }
  if(GAME.systems.sky.orientation)env.environmentOrientation=GAME.systems.sky.orientation.get();
  if(GAME.systems.sky.flare){
    if(GAME.systems.sky.flare.get) env.lensFlare = GAME.systems.sky.flare.get();
    // chiavi legacy: un livello salvato ora resta leggibile da build precedenti
    env.flareEnabled = GAME.systems.sky.flare.getEnabled();
    env.flareOpacity = GAME.systems.sky.flare.getOpacity();
    env.flareSize = GAME.systems.sky.flare.getSize();
  }
  if(GAME.systems.sky.lighting) env.lighting = GAME.systems.sky.lighting.get();
  if(GAME.systems.sky.sunBloom) env.sunBloom = GAME.systems.sky.sunBloom.get();
  if(GAME.systems.sky.volClouds && GAME.systems.sky.volClouds.get()) env.volClouds = GAME.systems.sky.volClouds.get();
  if(GAME.systems.rain) env.rain = GAME.systems.rain.get();
  if(GAME.systems.weather) env.weather = GAME.systems.weather.get();
  if(GAME.systems.physics && GAME.systems.physics.getSurfaceWorldCollision) env.surfaceWorldCollision = GAME.systems.physics.getSurfaceWorldCollision();
  return env;
}

/** Tear down every object a previous `apply` added: unregister it, detach it and
 *  free its GPU resources.
 *
 *  A Logic Element owns more than meshes - a Pawn, a Cannon body, a mixer - so
 *  the object's own registered teardown runs first where the world provides one,
 *  and `disposeObject3D` only frees what is left. Builtins are never touched:
 *  they are the player, the sky and the ground rig, and `data.deleted` is how the
 *  scene describes removing one of those. */
function releaseAddedObjects(GAME){
  const registry = GAME && GAME.world && Array.isArray(GAME.world.registry) ? GAME.world.registry : null;
  if(!registry) return 0;
  const stale = registry.filter(object => object && object.userData && object.userData.addedEntry && !object.userData.builtin);
  stale.forEach(object => {
    try {
      GAME.world.unregister(object);
      // Mixers and cached clips are not part of the object graph.
      disposeLogicElementAnimations(object);
    }
    catch(err){ console.warn('LotKing store: teardown of "' + (object.name || object.userData.editorId) + '" failed', err); }
    if(object.parent) object.parent.remove(object);
    disposeObject3D(object);
  });
  return stale.length;
}

function apply(GAME, sceneOverride, options){
  options = options || {};
  const strict = options.strict === true;
  const menuBackground = options.menuBackground === true;
  builtinIds = GAME.world.registry.filter(o => o.userData.builtin).map(o => o.userData.editorId);
  ensureEffectHook(GAME);
  const data = sceneOverride || load();
  if(!data){
    GAME.state.sceneReady = true;
    return Promise.resolve(null);
  }
  GAME.state.sceneReady = false;
  if(GAME.systems&&GAME.systems.proceduralWorld&&GAME.systems.proceduralWorld.set){
    GAME.systems.proceduralWorld.set(data.proceduralWorld,{scene:data,rebuild:false,menuBackground});
  }
  // Enemy Outpost v5 changes only its generated player presentation: it is the
  // full Character/TPS showcase now, while fps-shooter-test remains the
  // explicit arms-only sample. Upgrade saved copies of the template in place so
  // recreating the level or clearing storage is not required.
  if(data.template && data.template.id === 'fps-enemy-outpost' && (Number(data.template.version) || 0) < 5){
    (data.added || []).forEach(entry => {
      const pawn=entry&&entry.graph&&entry.graph.characterPawn,view=pawn&&pawn.firstPerson;
      if(!view || pawn.playerId === null || !(entry.asset&&entry.asset.key==='logic:template:logic-template-player-first-person')) return;
      view.view='third';view.presentation='body';view.hideOwnBody=false;view.showLegs=false;
      view.thirdPerson=Object.assign({},view.thirdPerson||{},{autoDistance:false,collisionMode:'fixed'});
      const presentation=(entry.graph.variables||[]).find(variable=>variable&&variable.binding==='firstPerson.presentation');
      if(presentation)presentation.value='body';
      entry.name='Player Character (Third Person / Full Body Eye)';
    });
    data.template.version=5;
  }
  // v0.7.1's first penalty preset accidentally authored 20:52 (.62 on the
  // sunrise-based clock) while intending a fixed daytime scene. Migrate only
  // that exact generated value so deliberate user-authored lighting remains
  // untouched.
  const generatedPenaltyScene = Array.isArray(data.added) && data.added.some(entry =>
    entry && entry.kind === 'logicElement' &&
    (entry.name === 'Penalty Shootout Manager' || entry.asset && entry.asset.key === 'logic:template:logic-template-penalty-shootout')
  );
  if(generatedPenaltyScene && data.env && Math.abs((Number(data.env.skyTime) || 0) - .62) < .0001){
    data.env.skyTime = .25;
    data.env.dayNightCycleEnabled = false;
    data.env.lighting = Object.assign({daySun:1.45,dayAmbient:.95,moonDirect:.16,moonIndirect:.18}, data.env.lighting || {});
  }
  if(generatedPenaltyScene){
    // Repair already-saved copies of the original preset. The first revision
    // changed the keeper component directly but left its exposed Role/kit
    // variables at striker defaults; runtime bindings then won in Play.
    data.added.forEach(entry=>{
      if(!(entry&&entry.kind==='logicElement'&&entry.name==='Penalty Goalkeeper'&&entry.graph&&entry.graph.soccerPawn))return;
      const graph=entry.graph,write=(name,value)=>{const variable=(graph.variables||[]).find(item=>item&&item.name===name);if(variable)variable.value=value;};
      graph.soccerPawn.role='goalkeeper';graph.soccerPawn.playerId=null;graph.soccerPawn.possessed=false;
      graph.soccerPawn.appearance=Object.assign({},graph.soccerPawn.appearance||{},{shirtColor:'#facc15',shortsColor:'#111827',socksColor:'#facc15'});
      write('Role','goalkeeper');write('ControllerPlayerId',-1);write('KeeperAI',true);
      write('ShirtColor','#facc15');write('ShortsColor','#111827');write('SocksColor','#facc15');
    });
    const replaceGeneratedColor = (entry, expected, next) => {
      const current = entry && entry.props && entry.props.color;
      if(typeof current === 'string' && current.toLowerCase() === expected) entry.props.color = next;
    };
    data.added.forEach(entry => {
      if(!(entry && entry.asset && entry.asset.source === 'Penalty Shootout Stadium template')) return;
      const name = String(entry.name || '');
      if(name === 'Stadium - Pitch Grass') replaceGeneratedColor(entry, '#1e7d38', '#197a39');
      if(/Stadium - (?:Touchline|Goal Line|Halfway Line|Center Spot|Penalty Spot|Penalty Arc)/.test(name)) {
        replaceGeneratedColor(entry, '#f4f6f2', '#ffffff');
      }
      if(/Stadium - Goal (?:Post|Crossbar)/.test(name)) replaceGeneratedColor(entry, '#f8fafc', '#ffffff');
      if(/Stadium - Stand .* Tier 1$/.test(name)) replaceGeneratedColor(entry, '#3b4252', '#1d3557');
      if(/Stadium - Stand .* Tier 2$/.test(name)) replaceGeneratedColor(entry, '#434c5e', '#284b73');
      if(/Stadium - Stand .* Tier 3$/.test(name)) replaceGeneratedColor(entry, '#4c566a', '#35648f');
      if(/^Stadium - Goal Top Rail (?:West|East) (?:North|South)$/.test(name)&&entry.t){
        const railAngle=Math.atan2(2.44-1.72,1.8);
        entry.t.r=[/ North$/.test(name)?railAngle:-railAngle,0,0];
        if(data.template&&data.template.id==='penalty-shootout-stadium')data.template.version=Math.max(4,Number(data.template.version)||0);
      }
    });
    const legacyGoal=data.added.some(entry=>entry&&entry.asset&&entry.asset.source==='Penalty Shootout Stadium template'&&entry.name==='Stadium - Goal Net Back North');
    if(legacyGoal&&window.LK_RUNTIME_SOCCER_STADIUM){
      const replacePattern=/^Stadium - (?:Penalty Arc|Goal Post|Goal Crossbar|Goal Net|Goal Rear|Goal Top Rail)/;
      data.added=data.added.filter(entry=>!(entry&&entry.asset&&entry.asset.source==='Penalty Shootout Stadium template'&&replacePattern.test(String(entry.name||''))));
      let upgradeIndex=0;
      window.LK_RUNTIME_SOCCER_STADIUM.buildEntries({x:0,z:0}).filter(item=>replacePattern.test(String(item.name||''))).forEach(item=>{
        const id='penalty_stadium_goal_v3_'+String(++upgradeIndex).padStart(3,'0');
        const props={color:item.color,roughness:item.roughness,metalness:item.metalness};
        data.added.push({id,kind:'primitive',prim:item.prim,name:item.name,collide:item.collide===true,driveSurface:false,props,t:cloneData(item.t),asset:{key:'primitive:'+item.prim,name:item.name,source:'Penalty Shootout Stadium template'},templateGroup:'Stadium'});
      });
      if(data.template&&data.template.id==='penalty-shootout-stadium')data.template.version=4;
    }
  }
  GAME.world.characterGround = cloneData(data.characterGround || null);
  // Which Character Sound Set this level plays. The set itself lives in the
  // shared library; the level only records the choice, so two levels can use the
  // same footstep and weapon audio without duplicating it.
  GAME.world.characterSoundSetId = typeof data.characterSoundSetId === 'string' && data.characterSoundSetId
    ? data.characterSoundSetId : null;
  const pending = [];

  // Vehicle light config can create extra built-in light anchors; do it before
  // transform replay so custom Aux 3/4/... offsets have real targets.
  let preserveDisabledPlayerVisual = false;
  if(data.player){
    // The native singleton has one scene-level activation state. Historical
    // `enabled + hidden` snapshots are migrated to inactive so a visually
    // absent car cannot retain physics, input, audio or camera ownership.
    const nativePlayerId = GAME.player && GAME.player.car && GAME.player.car.userData && GAME.player.car.userData.editorId;
    const nativeTransform = nativePlayerId && data.transforms && data.transforms[nativePlayerId];
    const authoredPlayerVisible = data.player.hidden !== true && !(nativeTransform && nativeTransform.v === false);
    preserveDisabledPlayerVisual = menuBackground && data.player.enabled === false && authoredPlayerVisible;
    const nativePlayerActive = data.player.enabled !== false && authoredPlayerVisible;
    if(GAME.player.setEnabled) GAME.player.setEnabled(nativePlayerActive);
    else { GAME.player.enabled = nativePlayerActive; GAME.player.hidden = !nativePlayerActive; }
    if(preserveDisabledPlayerVisual){
      // A ROLE menu may use the native vehicle as a non-interactive scene prop.
      // setEnabled(false) correctly releases control/physics, but its normal
      // gameplay contract also hides the visual. Restore only that authored
      // visibility for the isolated menu-background runtime.
      GAME.player.enabled = false;
      GAME.player.hidden = false;
      if(GAME.player.car) GAME.player.car.visible = true;
    }
  }
  if(data.player && GAME.player.setControllerIndex) GAME.player.setControllerIndex(Object.prototype.hasOwnProperty.call(data.player, 'controllerIndex') ? data.player.controllerIndex : 0);
  if(data.player && data.player.lights && GAME.player.setLights) GAME.player.setLights(data.player.lights);
  if(data.player && data.player.collision && GAME.player.setCollision) GAME.player.setCollision(data.player.collision);
  if(data.player && data.player.exhaust && GAME.player.setExhaust) GAME.player.setExhaust(data.player.exhaust);
  if(data.player && data.player.skids && GAME.player.setSkids) GAME.player.setSkids(data.player.skids);
  if(data.player && data.player.damage && GAME.player.setDamageConfig) GAME.player.setDamageConfig(data.player.damage);

  // Everything a previous apply ADDED is torn down here, before the new entries
  // are built. `apply` describes the whole scene - `data.deleted` only records
  // builtins the author removed - and the added loop below unconditionally
  // constructs one object per entry.
  //
  // Without this sweep the two facts combined: applying a scene on top of a
  // scene kept both. Measured on the FPS level, each apply added ~2000 objects,
  // ~900 geometries and ~2280 textures and released none of them, so a few level
  // loads or Play cycles exhausted GPU memory and the tab stopped responding.
  // The JS heap looked innocent throughout, because textures and geometry live
  // on the GPU - which is also why the symptom survived a page reload and only a
  // machine restart appeared to clear it.
  releaseAddedObjects(GAME);

  const byId = {};
  for(const o of GAME.world.registry) byId[o.userData.editorId] = o;

  // transforms + names + visibility on builtin entities
  for(const id in data.transforms){
    const o = byId[id];
    if(!o) continue;
    applyT(o, data.transforms[id]);
    const storedProps = data.props && data.props[id];
    if(storedProps && storedProps.colliderShape) o.userData.colliderShape = cloneData(storedProps.colliderShape);
    if(storedProps) applyBuiltinRuntimeProps(GAME, o, storedProps);
    if(storedProps && (storedProps.colliderDummyVisibility === 'show' || storedProps.colliderDummyVisibility === 'hide')) o.userData.colliderDummyVisibility = storedProps.colliderDummyVisibility;
    else delete o.userData.colliderDummyVisibility;
    syncCollider(o);
  }
  if(GAME.player && GAME.player.car) GAME.player.car.visible = preserveDisabledPlayerVisual || (GAME.player.enabled !== false && GAME.player.hidden !== true);
  for(const id in data.transforms){
    const o = byId[id];
    if(o) applyParentLink(o, GAME);
  }
  // per-entity props (lights / material overrides)
  for(const id in data.props){
    const o = byId[id];
    if(!o) continue;
    const light = objectLight(o);
    const props = Object.assign({}, data.props[id]);
    delete props.colliderShape;
    delete props.colliderDummyVisibility;
    delete props.collide;
    delete props.physics;
    delete props.physicsMass;
    delete props.physicsImpact;
    delete props.colliderKind;
    delete props.driveSurface;
    if(!Object.keys(props).length) continue;
    if(light) applyLightProps(light, props);
    else applyMatProps(o, props);
  }
  // deletions
  for(const id of data.deleted || []){
    const o = byId[id];
    if(!o) continue;
    GAME.world.unregister(o);
    if(o.parent) o.parent.remove(o);
    // Detaching an object from the scene graph does not free its GPU buffers.
    disposeObject3D(o);
  }
  // added objects
  for(const entry of data.added || []){
    // Start inside a Promise so synchronous factory failures are isolated to
    // the offending entry instead of rejecting the whole editor bootstrap.
    const p = Promise.resolve()
      .then(() => createFromEntry(entry, GAME, byId))
      .then(obj => {
	        registerAdded(GAME, obj, entry);
	        applyParentLink(obj, GAME);
	        if(entry.props && entry.kind === 'texture') updateTextureObject(obj, entry.props);
	        else if(entry.props && entry.kind === 'camera') updateSceneCameraObject(obj, entry.props);
	        else if(entry.props && entry.kind !== 'light' && entry.kind !== 'cinemaStudio' && entry.kind !== 'driftTrack') applyMatProps(obj, entry.props);
	      })
      .catch(err => {
        console.warn('LotKing store: oggetto "' + entry.name + '" non ricaricato', err);
        if(strict) throw err;
      });
    pending.push(p);
  }
  applyEnvironment(GAME, data.env);
  if(data.ui && data.ui.video && GAME.settings && GAME.settings.setVideoProject){
    GAME.settings.setVideoProject(data.ui.video);
  }
  if(data.ui && data.ui.radioHud && GAME.ui && GAME.ui.setRadioHud) GAME.ui.setRadioHud(data.ui.radioHud);
  if(data.ui && data.ui.vehicleRadar && GAME.ui && GAME.ui.setVehicleRadar) GAME.ui.setVehicleRadar(data.ui.vehicleRadar);
  const musicLibraries = data.ui && data.ui.musicLibraries;
  if(musicLibraries && GAME.systems){
    if(GAME.systems.radio && GAME.systems.radio.restoreTracks && Array.isArray(musicLibraries.radio)){
      pending.push(GAME.systems.radio.restoreTracks(musicLibraries.radio));
    }
    if(GAME.systems.loadingMusic && GAME.systems.loadingMusic.restoreTracks && Array.isArray(musicLibraries.loading)){
      pending.push(Promise.resolve(GAME.systems.loadingMusic.restoreTracks(musicLibraries.loading)).then(result => {
        writeLoadingMusicHint(GAME.systems.loadingMusic.getStoredTracks
          ? GAME.systems.loadingMusic.getStoredTracks()
          : musicLibraries.loading);
        return result;
      }));
    }
    const editorMenu = GAME.systems.editorMenuMusic;
    const gameMenu = GAME.systems.gameMenuMusic;
    if(editorMenu && editorMenu.restoreTracks && Array.isArray(musicLibraries.editorMenu)){
      pending.push(editorMenu.restoreTracks(musicLibraries.editorMenu));
    }
    if(gameMenu && gameMenu.restoreTracks && Array.isArray(musicLibraries.gameMenu)){
      pending.push(gameMenu.restoreTracks(musicLibraries.gameMenu));
    }
    if(Array.isArray(musicLibraries.menu)){
      // v0.7.0 and older stored one shared menu list. Restore it into any
      // missing role so old projects sound exactly as before while new saves
      // keep Editor Menu and Game Menu independent.
      if(editorMenu && editorMenu.restoreTracks && !Array.isArray(musicLibraries.editorMenu)){
        pending.push(editorMenu.restoreTracks(musicLibraries.menu));
      }
      if(gameMenu && gameMenu.restoreTracks && !Array.isArray(musicLibraries.gameMenu)){
        pending.push(gameMenu.restoreTracks(musicLibraries.menu));
      }
    }
  }
  // player blueprint
  if(data.player){
    if(data.player.steeringWheel && GAME.player.setSteeringWheelConfig){
      GAME.player.setSteeringWheelConfig(data.player.steeringWheel);
    }
    if(GAME.player.setModelShading) GAME.player.setModelShading(data.player.modelShading || 'original');
    const playerTransform = data.player.transform || (data.transforms && data.transforms.player);
    if(playerTransform && playerTransform.r && GAME.player.setVisualBaseRotation) GAME.player.setVisualBaseRotation(playerTransform.r[0], playerTransform.r[2]);
    else if(GAME.player.setVisualBaseRotation) GAME.player.setVisualBaseRotation(0, 0);
    let migratedLegacyPlayerHeading = false;
    if(data.player.headingMode !== 'runtime-v2' && data.player.spawn && playerTransform && playerTransform.r && (data.player.modelSrc || data.player.modelDbKey)){
      const rawHeading = Number(playerTransform.r[1] || 0);
      const spawnHeading = Number(data.player.spawn.heading);
      if(Number.isFinite(spawnHeading) && angleDistance(spawnHeading, rawHeading) < 0.001){
        data.player.spawn.heading = normalizeAngle(rawHeading + Math.PI);
        migratedLegacyPlayerHeading = true;
      }
      data.player.headingMode = 'runtime-v2';
    }
    if(!data.player.spawn && playerTransform && playerTransform.p){
      data.player.spawn = Object.assign({}, data.player.spawn || {}, {
        x: playerTransform.p[0] || 0,
        z: playerTransform.p[2] || 0,
        heading: data.player.spawn && data.player.spawn.heading != null ? data.player.spawn.heading : (playerTransform.r ? (playerTransform.r[1] || 0) : 0),
      });
    }
    if(data.player.headingMode === 'runtime-v2' && data.player.spawn && playerTransform){
      if(playerTransform.p){
        data.player.spawn.x = Number(playerTransform.p[0] || 0);
        data.player.spawn.z = Number(playerTransform.p[2] || 0);
      }
      if(playerTransform.r && !migratedLegacyPlayerHeading) data.player.spawn.heading = Number(playerTransform.r[1] || 0);
    }
    if(data.player.spawn){
      Object.assign(GAME.player.spawn, data.player.spawn);
      GAME.player.physics.pos.set(GAME.player.spawn.x, 0, GAME.player.spawn.z);
      GAME.player.car.position.copy(GAME.player.physics.pos);
      if(GAME.player.setVisibleHeading) GAME.player.setVisibleHeading(GAME.player.spawn.heading);
      else {
        GAME.player.physics.heading = GAME.player.spawn.heading;
        GAME.player.car.rotation.y = GAME.player.physics.heading;
      }
      if(playerTransform){
        applyT(GAME.player.car, playerTransform);
      }
      if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
    }
    if(data.player.modelSrc || data.player.modelDbKey){
      const srcPromise = data.player.modelDbKey && window.LK_ASSET_BLOBS
        ? window.LK_ASSET_BLOBS.getUrl(data.player.modelDbKey)
        : Promise.resolve(data.player.modelSrc);
      const p = srcPromise.then(src => loadGlbRaw(src)
        .then(s => {
          GAME.player.setModel(s);
          GAME.player.car.userData.modelSrc = data.player.modelSrc || null;
          GAME.player.car.userData.modelDbKey = data.player.modelDbKey || null;
          GAME.player.car.userData.modelName = data.player.modelName || null;
          if(data.player.meshEdits){
            applyMeshEdits(s, data.player.meshEdits);
            GAME.player.car.userData.playerMeshEdits = normalizeMeshEdits(data.player.meshEdits);
          }
          if(GAME.player.setModelShading) GAME.player.setModelShading(data.player.modelShading || 'original');
          if(playerTransform){
            applyT(GAME.player.car, playerTransform);
          }
          else if(data.player.spawn && GAME.player.setVisibleHeading) GAME.player.setVisibleHeading(data.player.spawn.heading || 0);
          if(data.player.materials) applyPlayerMaterialProps(GAME, data.player.materials);
        }))
        .catch(err => {
          console.warn('LotKing store: modello player non ricaricato', err);
          if(strict) throw err;
        });
      pending.push(p);
    } else if(data.player.meshEdits && GAME.player.getModel){
      const model = GAME.player.getModel();
      if(model){
        applyMeshEdits(model, data.player.meshEdits);
        GAME.player.car.userData.playerMeshEdits = normalizeMeshEdits(data.player.meshEdits);
        if(GAME.player.setModelShading) GAME.player.setModelShading(data.player.modelShading || 'original');
      }
    }
    if(data.player.cam){
      const loadedCamera = window.LK_RUNTIME_PLAYER_CAMERA && window.LK_RUNTIME_PLAYER_CAMERA.migrateConfig
        ? window.LK_RUNTIME_PLAYER_CAMERA.migrateConfig(data.player.cam)
        : data.player.cam;
      Object.assign(GAME.player.cameraCfg, loadedCamera, {
        dof: Object.assign({}, GAME.player.cameraCfg.dof, loadedCamera.dof),
        grade: Object.assign({}, GAME.player.cameraCfg.grade, loadedCamera.grade),
      });
      GAME.player.applyCameraCfg();
    }
    if(data.player.tuning) GAME.player.setTuning(data.player.tuning);
    if(data.player.lights && GAME.player.setLights) GAME.player.setLights(data.player.lights);
    if(data.player.collision && GAME.player.setCollision) GAME.player.setCollision(data.player.collision);
    if(data.player.dataWidgets && GAME.player.setDataWidgets) GAME.player.setDataWidgets(data.player.dataWidgets);
    if(data.player.exhaust && GAME.player.setExhaust) GAME.player.setExhaust(data.player.exhaust);
    if(data.player.skids && GAME.player.setSkids) GAME.player.setSkids(data.player.skids);
    if(data.player.damage && GAME.player.setDamageConfig) GAME.player.setDamageConfig(data.player.damage);
    applyPlayerRigTransforms(GAME, data.player);
    if(data.player.engineAudio && GAME.player.setEngineSound){
      // il set embedded entra in libreria se manca, poi si applica per id
      if(data.player.engineAudio.set) SOUND_SETS.upsertImported(data.player.engineAudio.set);
      GAME.player.setEngineSound(data.player.engineAudio.setId || null, data.player.engineAudio.set || null);
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
    if(data.player.materials) applyPlayerMaterialProps(GAME, data.player.materials);
  }
  return Promise.allSettled(pending).then(results => {
    const failed = results.filter(result => result.status === 'rejected');
    if(strict && failed.length){
      GAME.state.sceneReady = false;
      const first = failed[0].reason;
      throw new Error('Caricamento scena atomico fallito (' + failed.length + ' risorse): ' + String(first && first.message || first || 'errore'));
    }
    for(const o of GAME.world.registry) syncCollider(o);
    if(GAME.systems.proceduralWorld&&GAME.systems.proceduralWorld.rebuildFromScene)GAME.systems.proceduralWorld.rebuildFromScene(data);
    if(GAME.systems.physics) GAME.systems.physics.rebuild(true);
    GAME.state.sceneReady = true;
    return data;
  });
}

// ------------------------------------------------ collect current scene → data (editor save)
let _sessionCounter = 1;
function collect(GAME){
  // Older/import-library placement paths could leave KHR_lights_punctual nodes
  // inside a GLB without creating persisted editor light entries. Normalize the
  // live scene before collecting so Save, LKEP and Playable Export all serialize
  // the same Point/Spot/Directional lights visible in the editor.
  if(GAME && GAME.world && Array.isArray(GAME.world.registry)){
    GAME.world.registry.slice().forEach(object => {
      const entry = object && object.userData && object.userData.addedEntry;
      if(!entry || entry.kind !== 'glb' || entry.embeddedLightsExtracted) return;
      extractEmbeddedLights(GAME, object, entry);
    });
  }
  const d = blank();
  const old = load();
  const freezeRuntimeTransforms = !!(GAME && GAME.state && GAME.state.editorPreview);
  const oldAddedById = new Map();
  if(freezeRuntimeTransforms && old && Array.isArray(old.added)){
    old.added.forEach(entry => { if(entry && entry.id) oldAddedById.set(entry.id, entry); });
  }
  if(old && old.template != null) d.template = cloneData(old.template);
  if(old && old.sketchbook != null) d.sketchbook = cloneData(old.sketchbook);
  d.counter = Math.max(old ? old.counter || 0 : 0, _sessionCounter);
  const liveBuiltin = new Set();
  for(const o of GAME.world.registry){
    const id = o.userData.editorId;
    if(o.userData.builtin){
      liveBuiltin.add(id);
      d.transforms[id] = freezeRuntimeTransforms && old && old.transforms && old.transforms[id] ? cloneData(old.transforms[id]) : tOf(o);
      const light = objectLight(o);
      if(light) d.props[id] = lightProps(light);
      else if(o.userData.matProps) d.props[id] = Object.assign({}, o.userData.matProps);
      const colliderRef = o.userData.collider && o.userData.collider.ref ? o.userData.collider.ref : null;
      if(colliderRef){
        d.props[id] = Object.assign({}, d.props[id] || {}, {
          collide: colliderRef.enabled !== false,
          physics: !!(o.userData.physicsEnabled || colliderRef.physics),
          physicsMass: physicsMassFrom(colliderRef.mass != null ? colliderRef.mass : o.userData.physicsMass),
          physicsImpact: physicsImpactFrom(colliderRef.impact != null ? colliderRef.impact : o.userData.physicsImpact),
          colliderKind: colliderKindFrom(o.userData.collider && o.userData.collider.kind),
        });
      } else if(o.userData.physicsEnabled){
        d.props[id] = Object.assign({}, d.props[id] || {}, {
          collide: true,
          physics: true,
          physicsMass: physicsMassFrom(o.userData.physicsMass),
          physicsImpact: physicsImpactFrom(o.userData.physicsImpact),
          colliderKind: 'box',
        });
      }
      if(o.userData.driveSurface != null) d.props[id] = Object.assign({}, d.props[id] || {}, {driveSurface: !!o.userData.driveSurface});
      if(o.userData.colliderShape) d.props[id] = Object.assign({}, d.props[id] || {}, {colliderShape: cloneData(o.userData.colliderShape)});
      if(o.userData.colliderDummyVisibility === 'show' || o.userData.colliderDummyVisibility === 'hide') d.props[id] = Object.assign({}, d.props[id] || {}, {colliderDummyVisibility: o.userData.colliderDummyVisibility});
    } else if(o.userData.addedEntry){
      const e = o.userData.addedEntry;
      const oldEntry = freezeRuntimeTransforms ? oldAddedById.get(e.id) : null;
      e.t = oldEntry && oldEntry.t ? cloneData(oldEntry.t) : tOf(o);
      e.name = o.userData.editorName;
      const colliderRef = o.userData.collider && o.userData.collider.ref ? o.userData.collider.ref : null;
      const isPhysics = !!(colliderRef && colliderRef.physics);
      const hasCollider = !!(colliderRef && colliderRef.enabled !== false);
      const hasPhysics = !!(o.userData.physicsEnabled || isPhysics);
      e.physics = !!hasPhysics;
      e.collide = !!hasCollider;
      if(colliderRef) e.colliderKind = colliderKindFrom(o.userData.collider && o.userData.collider.kind);
      else delete e.colliderKind;
      if(o.userData.colliderOnly) e.colliderOnly = true;
      if(o.userData.colliderOnly && o.userData.cinemaTrigger) e.cinemaTrigger = cloneData(o.userData.cinemaTrigger);
      if(o.userData.driveSurface != null) e.driveSurface = !!o.userData.driveSurface;
      if(o.userData.colliderShape) e.colliderShape = cloneData(o.userData.colliderShape);
      if(o.userData.colliderDummyVisibility === 'show' || o.userData.colliderDummyVisibility === 'hide') e.colliderDummyVisibility = o.userData.colliderDummyVisibility;
      else delete e.colliderDummyVisibility;
      if(o.userData.meshEdits) e.meshEdits = normalizeMeshEdits(o.userData.meshEdits);
      else delete e.meshEdits;
      if(colliderRef && colliderRef.mass != null){
        e.physicsMass = physicsMassFrom(o.userData.collider.ref.mass);
      } else {
        e.physicsMass = physicsMassFrom(o.userData.physicsMass);
      }
      if(colliderRef && colliderRef.impact != null) e.physicsImpact = physicsImpactFrom(colliderRef.impact);
      else e.physicsImpact = physicsImpactFrom(o.userData.physicsImpact);
	      const liveAddedLight = objectLight(o);
	      if(e.kind === 'light' && liveAddedLight) e.props = lightProps(liveAddedLight);
	      else if(e.kind === 'effect') e.params = Object.assign({}, o.userData.effectParams);
	      else if(e.kind === 'text') e.props = Object.assign({}, o.userData.textProps || e.props || {});
	      else if(e.kind === 'texture') e.props = Object.assign({}, o.userData.textureProps || e.props || {});
	      else if(e.kind === 'camera') e.props = Object.assign({}, o.userData.cameraProps || e.props || {});
	      else if(e.kind === 'cinemaStudio') e.props = normalizeCinemaStudioProps(cloneData(o.userData.cinemaProps || e.props || {}));
	      else if(e.kind === 'logicElement'){
	        e.graph = normalizeLogicGraph(o.userData.logicGraph || e.graph, o.userData.editorName || e.name || 'Logic Element', 'element');
	        e.enabled = o.userData.logicEnabled !== false;
	        e.runInEditorPreview = o.userData.logicRunInEditorPreview !== false;
	        e.logicAssetId = o.userData.logicAssetId || null;
	        e.logicLinked = !!(o.userData.logicLinked && e.logicAssetId);
	        e.variableOverrides = cloneData(o.userData.logicVariableOverrides || {});
	        if(e.logicLinked){
	          const definition = logicElementAssetById(e.logicAssetId) || e.logicAsset;
	          if(definition) e.logicAsset = cloneData(definition);
	        } else {
	          delete e.logicAssetId;
	          delete e.logicLinked;
	          delete e.variableOverrides;
	          delete e.logicAsset;
	        }
	      }
	      else if(o.userData.matProps) e.props = Object.assign({}, o.userData.matProps);
	      if(liveAddedLight && e.kind !== 'light') e.lightProps = lightProps(liveAddedLight);
      if(o.userData.assetKey) e.asset = Object.assign({}, e.asset || {}, {key:o.userData.assetKey, name:o.userData.assetName, source:o.userData.assetSource});
      d.added.push(e);
    }
  }
  d.deleted = builtinIds.filter(id => !liveBuiltin.has(id));
  d.env = freezeRuntimeTransforms
    ? cloneData(GAME.state.editorPreviewManualEnvironment || old && old.env || collectEnvironment(GAME))
    : collectEnvironment(GAME);
  d.proceduralWorld=GAME.systems&&GAME.systems.proceduralWorld&&GAME.systems.proceduralWorld.get?GAME.systems.proceduralWorld.get():cloneData(old&&old.proceduralWorld||null);
  if(GAME.ui && GAME.ui.radioHud) d.ui.radioHud = JSON.parse(JSON.stringify(GAME.ui.radioHud));
  if(GAME.ui && GAME.ui.vehicleRadar) d.ui.vehicleRadar = JSON.parse(JSON.stringify(GAME.ui.vehicleRadar));
  if(GAME.settings && GAME.settings.getVideoProject) d.ui.video = cloneData(GAME.settings.getVideoProject());
  if(GAME.systems){
    const radioTracks = GAME.systems.radio && GAME.systems.radio.getStoredTracks ? GAME.systems.radio.getStoredTracks() : [];
    const loadingTracks = GAME.systems.loadingMusic && GAME.systems.loadingMusic.getStoredTracks ? GAME.systems.loadingMusic.getStoredTracks() : [];
    writeLoadingMusicHint(loadingTracks);
    const editorMenuTracks = GAME.systems.editorMenuMusic && GAME.systems.editorMenuMusic.getStoredTracks ? GAME.systems.editorMenuMusic.getStoredTracks() : [];
    const gameMenuTracks = GAME.systems.gameMenuMusic && GAME.systems.gameMenuMusic.getStoredTracks ? GAME.systems.gameMenuMusic.getStoredTracks() : [];
    const legacyMenuTracks = GAME.systems.menuMusic && GAME.systems.menuMusic.getStoredTracks ? GAME.systems.menuMusic.getStoredTracks() : gameMenuTracks;
    d.ui.musicLibraries = {
      schemaVersion:4,
      radio:cloneData(radioTracks),
      loading:cloneData(loadingTracks),
      editorMenu:cloneData(editorMenuTracks),
      gameMenu:cloneData(gameMenuTracks),
      menu:cloneData(legacyMenuTracks),
    };
  }
  d.player = collectPlayerBlueprint(GAME) || {};
  d.characterGround = cloneData(old && old.characterGround || GAME && GAME.world && GAME.world.characterGround || null);
  const soundSetId = GAME && GAME.world && GAME.world.characterSoundSetId;
  d.characterSoundSetId = (typeof soundSetId === 'string' && soundSetId)
    ? soundSetId
    : (old && typeof old.characterSoundSetId === 'string' && old.characterSoundSetId) || null;
  d.logic = old && old.logic ? cloneData(old.logic) : {};
  d.logic.levelGraph = normalizeLogicGraph(d.logic.levelGraph, 'Level Logic', 'level');
  return d;
}

function nextId(){
  // The timestamp already separates this editing session from persisted IDs.
  // Parsing the entire saved scene from localStorage for every duplication was
  // a synchronous long task on large projects.
  _sessionCounter = Math.max(1, _sessionCounter);
  return 'a' + Date.now().toString(36) + '_' + (_sessionCounter++);
}

let ready = Promise.resolve(null);
let applied = false;
let appliedLevelId = null;
let appliedMode = null;
function ensureApplied(GAME){
  if(applied) return ready;
  applied = true;
  appliedMode = 'active';
  ready = ensureBundledDemoProject().then(bundledProject => {
    appliedLevelId = normalizeLevelId(ensureLibrary().activeId);
    const bundledScene=bundledProject&&sceneFromProject(bundledProject);
    return apply(GAME || window.LOT_KING,bundledScene||undefined,{strict:!!bundledProject});
  });
  window.LK_STORE.ready = ready;
  return ready;
}
function menuBackgroundRoles(preferredRoles){
  const input = Array.isArray(preferredRoles) ? preferredRoles : [preferredRoles];
  const roles = input.filter(role => role === 'editor-menu' || role === 'game-menu');
  if(!roles.length) roles.push('game-menu', 'editor-menu');
  return roles;
}
function findMenuBackgroundLevel(preferredRoles){
  const roles = menuBackgroundRoles(preferredRoles);
  // The menu iframe does not install the downloaded project into localStorage.
  // Resolve its root/embedded menu roles directly, and prefer the current FTP
  // snapshot over stale browser data from an older deployment.
  if(window.__LK_MENU_PREVIEW){
    const bundled = findBundledMenuBackgroundLevel(roles);
    if(bundled) return bundled;
  }
  const idx = ensureLibrary();
  const entries = idx.levels.slice();
  for(const role of roles){
    const activeId = normalizeLevelId(idx.activeId);
    const active = entries.find(entry => normalizeLevelId(entry.id) === activeId);
    const ordered = active ? [active].concat(entries.filter(entry => normalizeLevelId(entry.id) !== activeId)) : entries;
    for(const entry of ordered){
      const project = readLevelProject(entry.id);
      const levelRole = project && project.meta && project.meta.levelRole || entry.levelRole || 'gameplay';
      if(levelRole !== role) continue;
      return {id: normalizeLevelId(entry.id), name: entry.name, role, project};
    }
  }
  const bundled = findBundledMenuBackgroundLevel(roles);
  if(bundled) return bundled;
  return null;
}
function findBundledMenuBackgroundLevel(preferredRoles){
  const roles = menuBackgroundRoles(preferredRoles);
  const project = bundledDemoProjectCache;
  if(!project) return null;
  const candidates = [{
    id:project.meta && project.meta.trackId || BUNDLED_DEMO_LEVEL_ID,
    name:project.meta && (project.meta.trackName || project.meta.levelName) || 'Online Demo',
    role:project.meta && project.meta.levelRole || 'gameplay',
    project,
  }].concat((Array.isArray(project.embeddedLevels) ? project.embeddedLevels : []).map(entry => {
    const embeddedProject = entry && entry.project;
    const meta = embeddedProject && embeddedProject.meta || {};
    return {
      id:entry && (entry.id || entry.levelId) || meta.trackId,
      name:entry && entry.name || meta.trackName || meta.levelName,
      role:entry && (entry.role || entry.levelRole) || meta.levelRole || 'gameplay',
      project:embeddedProject,
    };
  }));
  for(const role of roles){
    const candidate = candidates.find(item => item && item.project && item.role === role);
    if(candidate){
      return {
        id:normalizeLevelId(candidate.id || role),
        name:candidate.name || (role === 'editor-menu' ? 'Editor Menu' : 'Game Menu'),
        role,
        project:candidate.project,
      };
    }
  }
  return null;
}
function ensureMenuBackgroundApplied(GAME, preferredRoles){
  if(applied) return ready;
  // Reserve the one scene-application lane before the asynchronous DEMO fetch.
  // Previously `applied` changed only after the fetch, allowing a fast Play
  // request to start the gameplay apply in parallel with the menu apply.
  applied = true;
  appliedMode = 'menu-background-pending';
  appliedLevelId = null;
  ready = ensureBundledDemoProject().then(() => {
    const menuLevel = findMenuBackgroundLevel(preferredRoles);
    if(!menuLevel){
      applied = false;
      appliedMode = null;
      reportBundledDemoProgress({progress:62, step:'no ROLE menu level found'});
      return null;
    }
    const scene = sceneFromProject(menuLevel.project);
    if(!scene){
      applied = false;
      appliedMode = null;
      reportBundledDemoProgress({progress:62, step:'ROLE menu project has no scene'});
      return null;
    }
    applied = true;
    appliedMode = 'menu-background';
    appliedLevelId = menuLevel.id;
    reportBundledDemoProgress({progress:66, step:'applying role menu level', level:{id:menuLevel.id, name:menuLevel.name, role:menuLevel.role}});
    return apply(GAME || window.LOT_KING, scene, {strict:true, menuBackground:true})
      .then(data => {
        reportBundledDemoProgress({progress:84, step:'role menu level applied', level:{id:menuLevel.id, name:menuLevel.name, role:menuLevel.role}});
        return {data, menuLevel};
      })
      .catch(err => {
        reportBundledDemoProgress({progress:84, step:'role menu level failed', error:err && err.message || String(err || 'error'), level:{id:menuLevel.id, name:menuLevel.name, role:menuLevel.role}});
        throw err;
      });
  }).then(result => {
    if(!result) return null;
    const data = result.data;
    const menuLevel = result.menuLevel;
    const g = GAME || window.LOT_KING;
    if(g && g.state){
      g.state.menuBackgroundLevel = {
        id: menuLevel.id,
        name: menuLevel.name,
        role: menuLevel.role,
      };
      g.state.activeLevel = menuLevel.id;
    }
    return data;
  });
  window.LK_STORE.ready = ready;
  return ready;
}
window.LK_STORE = {
  KEY, PROJECT_FORMAT, PROJECT_NAME, PROJECT_VERSION,
	  levels: LEVELS,
	  playerBlueprints: playerBlueprintApi(),
	  logicElementAssets: logicElementAssetsApi(),
  soundSets: SOUND_SETS,
  characterSoundSets: CHARACTER_SOUND_SETS,
  isApplied: () => applied,
  appliedInfo: () => ({applied, mode: appliedMode, levelId: appliedLevelId}),
  load, loadProject, save, clear, blank, projectFromScene, sceneFromProject, parseProject, exportProject, exportProjectWithLevels, importProject, localizePortableProjectAssets, getLevelLogicGraph, setLevelLogicGraph,
  tOf, applyT, syncCollider, applyEnvironment, collectEnvironment,
  refreshSurfaceTiling, applySurfaceTexture, isSharedSurfaceTexture,
  lightProps, applyLightProps, applyMatProps, stageMatProps, snapshotAddedEntry,
  verifyPersistenceRoundTrip, persistenceDifferences,
	  createPrimitive, createProceduralAsset, rebuildProceduralAsset, createText, updateTextObject, createTexture, updateTextureObject, matchTextureSurface, createSceneCamera, updateSceneCameraObject, createCinemaStudio, createLogicElement, syncLogicElementSceneObject, loadLogicElementAsset, playLogicElementAnimation, stopLogicElementAnimation, setLogicElementAnimationSpeed, startLogicElementAnimations, stopLogicElementAnimations, removeLogicElementColliders, updateLogicElementColliderRefs, createDriftTrack, rebuildDriftTrack, syncDriftTrackColliders, removeDriftTrackColliders, createLight, createEmitter, loadGlb, loadGlbRaw, extractEmbeddedLights, applyMeshEdits, normalizeMeshEdits, assignMeshEditIds, createFromEntry, registerAdded, normalizeStoredMatProps,
  EFFECT_PRESETS, PRIM_DEFS,
  apply, ensureApplied, ensureMenuBackgroundApplied, findMenuBackgroundLevel, collect, nextId,
  ensureBundledDemoProject,
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
  ensureBundledDemoProject().then(() => syncCatalogNow()).catch(() => {});
  let auto = null;
  try {
    auto = sessionStorage.getItem('lk.autolaunch');
    if(auto) sessionStorage.removeItem('lk.autolaunch');
  } catch(err){}
  if(!auto) return;
  // A reload arrives without a user gesture. Resume the audio family owned by
  // the active level role instead of always reviving the gameplay radio.
  const resumeAudio = () => {
    const g = window.LOT_KING;
    if(!g) return;
    if(g.systems && g.systems.audio && g.systems.audio.resume) g.systems.audio.resume();
    const idx = ensureLibrary();
    const project = idx.activeId && readLevelProject(idx.activeId);
    const role = project && project.meta && project.meta.levelRole || 'gameplay';
    if((role === 'editor-menu' || role === 'game-menu') && g.state && g.state.started && g.systems && g.systems.menuMusic){
      if(g.systems.menuMusic.play) g.systems.menuMusic.play(role).catch(()=>{});
    } else if(g.state && g.state.started && g.systems && g.systems.radio){
      const radio = g.systems.radio;
      if(!radio.isAvailable || radio.isAvailable()){
        if(radio.begin) radio.begin();
        else if(radio.audio && radio.audio.paused) radio.audio.play().catch(()=>{});
      }
    }
  };
  addEventListener('pointerdown', resumeAudio, {once: true});
  addEventListener('keydown', resumeAudio, {once: true});
  // autolaunch robusto: aspetta che il catalogo contenga il livello prima di
  // lanciarlo (evita che, per una race, resti visibile il menu "choose track").
  const wantId = normalizeLevelId(auto);
  // lot-king.js may already be polling for a ROLE menu background while this
  // module boots. Expose the reload intent so that poll cannot apply the menu
  // scene in place of the gameplay level selected by the user.
  window.__LK_AUTOLAUNCH_LEVEL = wantId;
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
