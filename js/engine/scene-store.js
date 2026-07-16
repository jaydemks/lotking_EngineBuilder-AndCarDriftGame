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
const LOGIC_ELEMENT_ASSETS_KEY = 'lotking.logicElementAssets.v1';
const ASSET_DB_NAME = 'lotking-assets';
const ASSET_DB_STORE = 'blobs';
const BUNDLED_DEMO_PROJECT_URL = 'demo/demo-project.lkep.json';
const MENU_ROLE_MANIFEST_URL = 'demo/menu-roles.json';
const BUNDLED_DEMO_LEVEL_ID = 'online-demo';
const assetUrlCache = new Map();
const logicElementAssetCache = new Map();
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
function disposeObject3D(node){
  if(!node) return;
  node.traverse(child => {
    if(child.geometry && child.geometry.dispose) child.geometry.dispose();
    if(child.material){
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => {
        if(mat && mat.map && mat.map.dispose) mat.map.dispose();
        if(mat && mat.dispose) mat.dispose();
      });
    }
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
    const bulb = new THREERef.Mesh(new THREERef.SphereGeometry(.16, 16, 8), logicElementMaterial(THREERef, element, {basic:true, helper:true}));
    const glow = new THREERef.PointLight(element && element.color || '#facc15', Math.max(0, Number(element && element.intensity) || .75), Math.max(0, Number(element && element.distance) || 4));
    bulb.userData.logicElementRuntimeVisual = false;
    bulb.visible = element && element.dummyVisible === true;
    glow.userData.logicElementRuntimeVisual = true;
    group.add(bulb, glow);
    node = group;
  } else if(type === 'camera'){
    const group = new THREERef.Group();
    const mat = logicElementMaterial(THREERef, element, {line:true, helper:true});
    const pts = [
      new THREERef.Vector3(-.28,-.18,0), new THREERef.Vector3(.28,-.18,0),
      new THREERef.Vector3(.28,-.18,0), new THREERef.Vector3(.28,.18,0),
      new THREERef.Vector3(.28,.18,0), new THREERef.Vector3(-.28,.18,0),
      new THREERef.Vector3(-.28,.18,0), new THREERef.Vector3(-.28,-.18,0),
      new THREERef.Vector3(-.28,-.18,0), new THREERef.Vector3(-.55,-.35,-.65),
      new THREERef.Vector3(.28,-.18,0), new THREERef.Vector3(.55,-.35,-.65),
      new THREERef.Vector3(.28,.18,0), new THREERef.Vector3(.55,.35,-.65),
      new THREERef.Vector3(-.28,.18,0), new THREERef.Vector3(-.55,.35,-.65),
    ];
    const helper = new THREERef.LineSegments(new THREERef.BufferGeometry().setFromPoints(pts), mat);
    helper.userData.logicElementRuntimeVisual = false;
    helper.visible = element && element.dummyVisible === true;
    group.add(helper);
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
    pending = source.then(src => loadGlb(src, Math.max(.05, Number(asset.fit) || 1)));
    logicElementAssetCache.set(key, pending);
    pending.catch(() => logicElementAssetCache.delete(key));
  }
  return pending.then(cloneLogicElementAsset);
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
    node.add(model);
    configureLogicElementAnimation(node, model, element, owner);
    return node;
  });
}
function removeLogicElementColliders(object, GAME){
  const refs = object && object.userData && object.userData.logicElementColliderRefs;
  if(!Array.isArray(refs) || !GAME || !GAME.world || !GAME.world.colliders) return;
  refs.forEach(ref => {
    const list = ref && ref.kind === 'circle' ? GAME.world.colliders.circle : GAME.world.colliders.box;
    const index = list && list.indexOf(ref);
    if(index >= 0) list.splice(index, 1);
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
function applyLogicElementPreviewTransform(THREERef, node, element){
  const pos = logicElementElementPosition(element);
  const rot = logicElementElementRotation(element);
  const scale = logicElementElementScale(element);
  node.position.set(pos[0], pos[1], pos[2]);
  node.rotation.set(THREERef.MathUtils.degToRad(rot[0]), THREERef.MathUtils.degToRad(rot[1]), THREERef.MathUtils.degToRad(rot[2]));
  node.scale.set(scale[0], scale[1], scale[2]);
}
function syncLogicElementSceneObject(object, graph, opts){
  if(!object || !window.THREE) return object;
  opts = opts || {};
  const THREERef = window.THREE;
  const normalized = ensureLogicElementScene(graph || object.userData.logicGraph || object.userData.addedEntry && object.userData.addedEntry.graph);
  object.userData.logicGraph = normalized;
  disposeLogicElementAnimations(object);
  object.userData.logicAnimationUpdate = dt => {
    const mixers = object.userData.logicElementMixers || [];
    mixers.forEach(entry => entry && entry.mixer && entry.mixer.update(Math.max(0, Number(dt) || 0)));
  };
  const old = (object.children || []).filter(child => {
    if(child.userData && (child.userData.logicElementInternal || child.userData.logicElementShell)) return true;
    return object.userData && (object.userData.editorType === 'logicElement' || object.userData.addedEntry && object.userData.addedEntry.kind === 'logicElement');
  });
  old.forEach(child => {
    object.remove(child);
    disposeObject3D(child);
  });
  const elements = logicElementSceneElements(normalized);
  const rootElement = elements.find(element => element && element.id === 'root');
  if(rootElement){
    object.userData.logicElementRootName = rootElement.name || 'Root';
    object.userData.logicElementRootPosition = Array.isArray(rootElement.position) ? rootElement.position.slice() : [0,0,0];
    object.userData.logicElementRootType = rootElement.type || 'mesh';
  }
  const nodes = new Map();
  const assetLoads = [];
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
    node.userData.logicElementRuntimeVisual = true;
    node.traverse(child => {
      child.userData.logicElementInternal = true;
      child.userData.logicElementSceneId = element.id;
      child.userData.logicElementOwnerId = object.userData.editorId || null;
      child.userData.editorLocked = true;
      child.userData.nonExportable = true;
      if(child.userData.logicElementRuntimeVisual == null) child.userData.logicElementRuntimeVisual = !(
        element.type === 'empty' || element.type === 'camera' || (element.type === 'light' && !child.isLight)
      );
    });
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
  syncLogicElementColliders(object, elements, nodes);
  object.userData.logicElementAssetReady = Promise.allSettled(assetLoads);
  return object;
}
function blank(){
  return {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}, logic:{levelGraph:defaultLevelLogicGraph()}};
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
  installEmbeddedProjectLevels(parsed);
  installMenuRoleSidecars(parsed);
  installEmbeddedLogicElementAssets(parsed.scene);
  save(parsed.scene, parsed.meta);
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
  const dbKey = demoAssetDbKey(label, dataUrl);
  const blob = await dataUrlToBlob(dataUrl);
  await assetBlobPut(dbKey, blob);
  owner[prop] = null;
  owner[dbProp || 'dbKey'] = dbKey;
  if(owner.asset && typeof owner.asset === 'object') owner.asset.dbKey = dbKey;
}
async function localizePortableProjectAssets(project, depth){
  const scene = project && sceneFromProject(project);
  if(!scene) return project;
  if(scene.player) await moveDataUrlToAssetDb(scene.player, 'modelSrc', scene.player.modelName || 'player-model', 'modelDbKey');
  if(Array.isArray(scene.added)){
    for(const entry of scene.added){
      if(!entry) continue;
      if(entry.kind === 'glb') await moveDataUrlToAssetDb(entry, 'src', entry.name || entry.id || 'glb', 'dbKey');
      if(entry.kind === 'texture' && entry.props) await moveDataUrlToAssetDb(entry.props, 'src', entry.name || entry.id || 'texture', 'dbKey');
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
    for(const groupName of ['radio', 'menu']){
      const tracks = Array.isArray(musicLibraries[groupName]) ? musicLibraries[groupName] : [];
      for(const track of tracks){
        await moveDataUrlToAssetDb(track, 'url', track.fileName || track.title || track.id || 'music-track', 'dbKey');
      }
    }
  }
  const embedded = (depth || 0) < 3 && Array.isArray(project && project.embeddedLevels) ? project.embeddedLevels : [];
  for(const entry of embedded){
    if(entry && entry.project) await localizePortableProjectAssets(entry.project, (depth || 0) + 1);
  }
  return project;
}
function isLocalOrigin(){
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}
function shouldUseBundledDemoProject(){
  try {
    const workspace = JSON.parse(localStorage.getItem('lk.projectWorkspace.v1') || 'null');
    if(window.__LK_STANDALONE_EDITOR && (!workspace || workspace.workspaceReady !== true)) return false;
    if(workspace && workspace.startupTemplate === 'demo') return true;
    if(isLocalOrigin()) return false;
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
      if(node.userData && (node.userData.colliderPreview || node.userData.editorOnly || node.userData.nonExportable || node.userData.lightPickHandle)) return;
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
    if(node.userData && (node.userData.colliderPreview || node.userData.editorOnly || node.userData.nonExportable || node.userData.lightPickHandle)) return;
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
    return raw ? parseProject(JSON.parse(raw)) : null;
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

function resetPublishedDemoLibrary(){
  if(!isPublishedGameplayRuntime()) return;
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
  try {
    await localizePortableProjectAssets(parsed);
  } catch(err){
    console.warn('LotKing demo: asset portabili non localizzati, uso fallback in memoria', err);
  }
  // A hosted/static playable is a published snapshot: levels left in this
  // origin by an older FTP upload must not leak into the current catalog.
  resetPublishedDemoLibrary();
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

function ensureBundledDemoProject(){
  if(!shouldUseBundledDemoProject()) return Promise.resolve(null);
  if(bundledDemoReady) return bundledDemoReady;
  try {
    bundledDemoRequestedLevelId = sessionStorage.getItem('lk.autolaunch') || sessionStorage.getItem('lk.playableActive') || null;
  } catch(err){}
  const url = bundledDemoProjectUrl();
  bundledDemoReady = fetchTextWithProgress(url, 8, 42, 'downloading demo project')
    .then(async text => {
      if(!text) return null;
      reportBundledDemoProgress({progress:54, step:'parsing demo project', url});
      const project = parseProject(text);
      const meta = project.meta || {};
      const name = meta.trackName || meta.levelName || 'Online Demo';
      const savedAt = project.savedAt || new Date().toISOString();
      project.meta = Object.assign({}, meta, {trackId:BUNDLED_DEMO_LEVEL_ID, trackName:name, onlineDemo:true});
      project.savedAt = savedAt;
      bundledDemoProjectCache = project;
      reportBundledDemoProgress({progress:60, step:'demo project ready in memory', url});
      if(window.LK_PROJECT_WORKSPACE && LK_PROJECT_WORKSPACE.consumeStartupTemplate){
        LK_PROJECT_WORKSPACE.consumeStartupTemplate('demo');
      }
      const isMenuPreviewFrame = !!(window.__LK_MENU_PREVIEW && window.parent && window.parent !== window);
      if(!isMenuPreviewFrame){
        try {
          await installBundledDemoProject(cloneData(project));
        } catch(err){
          console.warn('LotKing demo: bundled LKEP storage install failed', err);
        }
      }
      const scene = sceneFromProject(project);
      if(scene){
        const player = scene && scene.player;
        const playerRef = player && (player.modelSrc || player.modelDbKey) ? 'player model present' : 'player model missing';
        console.info('LotKing demo: bundled LKEP loaded from ' + url + ' · ' + ((scene && scene.added && scene.added.length) || 0) + ' added · ' + playerRef);
      }
      return project;
    })
    .catch(err => {
      console.warn('LotKing demo: bundled LKEP not loaded', err);
      return null;
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
    const copy = cloneData(set);
    copy.savedAt = copy.savedAt || new Date().toISOString();
    const i = data.sets.findIndex(x => x.id === set.id);
    if(i >= 0) data.sets[i] = copy;
    else data.sets.push(copy);
    writeSoundSets(data);
    return set.id;
  },
};

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
    collision: cloneData(GAME.player.collision || {}),
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
      collision: cloneData(GAME.player.collision || {}),
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
    const project = readLevelProject(id);
    if(!project) return false;
    try { localStorage.setItem(KEY, JSON.stringify(project)); }
    catch(err){ console.warn('LotKing store: attivazione livello fallita', err); return false; }
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
    if(applied && appliedMode === 'menu-background' && normalizeLevelId(appliedLevelId) !== id){
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
}
function applyParentLink(obj, GAME){
  const pid = obj && obj.userData.linkParentId;
  if(!pid || !GAME) return;
  const parent = GAME.world.registry.find(o => o.userData.editorId === pid);
  if(parent && parent !== obj) parent.attach(obj);
}

// keep the arcade collider (axis-aligned box / circle) in sync with the object
function syncCollider(obj){
  updateLogicElementColliderRefs(obj);
  const col = obj.userData.collider;
  if(!col || !col.ref) return;
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
      const meshBoxes = objectLocalMeshBoxes(obj).filter(partInfo => {
        const partBox = partInfo && partInfo.box ? partInfo.box : partInfo;
        const s = partBox.getSize(new THREE.Vector3());
        return s.x > .03 && s.y > .03 && s.z > .03;
      }).slice(0, 24);
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
          part.partMode = partMode;
          part.colliderMode = partMode;
          part.meshCollider = partMode === 'complex';
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
  const wantsCollider = props.collide === true || wantsPhysics;
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

// material override: global or per material slot (edited via editor)
function normalizeStoredMatProps(p){
  if(!p) return {global:{}, slots:{}};
  if(p.global || p.slots){
    return {
      global:Object.assign({}, p.global || {}),
      slots:Object.assign({}, p.slots || {}),
    };
  }
  const flat = Object.assign({}, p);
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

function applyMatProps(obj, p){
  if(!p) return;
  const loadTexture = (src, colorData) => {
    const tx = new THREE.TextureLoader().load(src);
    if(colorData) tx.encoding = THREE.sRGBEncoding;
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
    return tx;
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
    next.needsUpdate = true;
    return next;
  };
  const convertToStandard = m => {
    if(m && (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return m;
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
  const applyFlat = (patch, targetSlot) => {
    if(!patch) return;
    let meshIndex = 0;
    obj.traverse(o => {
      if(!o.isMesh || !o.material) return;
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
        if(patch.color != null && m.color) m.color.setHex(patch.color);
        if(patch.emissive != null && m.emissive) m.emissive.setHex(patch.emissive);
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
        const setMap = (prop, srcKey, dbKey, colorData, onSet) => {
          const hasSrc = Object.prototype.hasOwnProperty.call(patch, srcKey);
          const hasDb = Object.prototype.hasOwnProperty.call(patch, dbKey);
          const wantsClear = (hasSrc || hasDb) && (!hasSrc || patch[srcKey] === null) && (!hasDb || patch[dbKey] === null);
          if(wantsClear){
            m[prop] = null;
            delete m[srcKey];
            delete m[dbKey];
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
              m[prop] = tx;
              if(onSet) onSet();
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
        applyTextureTransform(m.map, patch);
        applyTextureTransform(m.normalMap, patch);
        applyTextureTransform(m.roughnessMap, patch);
        applyTextureTransform(m.metalnessMap, patch);
        applyTextureTransform(m.alphaMap, patch);
        applyTextureTransform(m.emissiveMap, patch);
        m.needsUpdate = true;
      });
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
  if(prim === 'cone'){
    gp.userData.isCone = true;
    gp.userData.coneResetRotation = [0, 0, 0];
  }
  return gp;
}

// ------------------------------------------------ factories: text
const TEXT_FONT_URL = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json';
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
  tex.encoding = THREE.sRGBEncoding;
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
  }, props || {});
}

function textureBlending(kind){
  if(kind === 'additive') return THREE.AdditiveBlending;
  if(kind === 'multiply') return THREE.MultiplyBlending;
  if(kind === 'subtractive') return THREE.SubtractiveBlending;
  return THREE.NormalBlending;
}

function createTextureMaterial(props){
  const common = {
    color: props.color,
    map: placeholderTexture(),
    transparent:true,
    opacity: Math.max(0, Math.min(1, props.opacity == null ? 1 : props.opacity)),
    alphaTest: Math.max(0, Math.min(1, props.alphaTest == null ? .01 : props.alphaTest)),
    side: props.doubleSide === false ? THREE.FrontSide : THREE.DoubleSide,
    depthWrite:false,
    depthTest: props.depthTest !== false,
    blending:textureBlending(props.blending),
    polygonOffset:true,
    polygonOffsetFactor:-4,
    polygonOffsetUnits:-4,
  };
  if(props.materialModel === 'lit'){
    const Mat = THREE.MeshPhysicalMaterial || THREE.MeshStandardMaterial;
    const mat = new Mat(Object.assign({}, common, {
      roughness:Math.max(0, Math.min(1, props.roughness == null ? .65 : props.roughness)),
      metalness:Math.max(0, Math.min(1, props.metalness == null ? 0 : props.metalness)),
      emissive:new THREE.Color(props.emissive == null ? 0x000000 : props.emissive),
      emissiveIntensity:Math.max(0, Math.min(3, props.emissiveIntensity == null ? 0 : props.emissiveIntensity)),
    }));
    const specular = Math.max(0, Math.min(1, props.specular == null ? .35 : props.specular));
    if('reflectivity' in mat) mat.reflectivity = specular;
    if('specularIntensity' in mat) mat.specularIntensity = specular;
    if('clearcoat' in mat) mat.clearcoat = Math.max(0, specular - .65) / .35;
    if('clearcoatRoughness' in mat) mat.clearcoatRoughness = Math.max(0, Math.min(1, props.roughness == null ? .65 : props.roughness));
    return mat;
  }
  return new THREE.MeshBasicMaterial(common);
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
  tx.encoding = THREE.sRGBEncoding;
  return tx;
}

function applyTextureMapFromSource(gp, mat, props){
  const loadId = (gp.userData.textureLoadId || 0) + 1;
  gp.userData.textureLoadId = loadId;
  const isCurrentLoad = () => gp.userData.textureLoadId === loadId;
  function configure(tx){
    tx.encoding = THREE.sRGBEncoding;
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
        new THREE.TextureLoader().load(src, apply, undefined, loadErr => console.warn('LotKing store: texture/decal non caricata', loadErr));
      });
      return;
    }
    new THREE.TextureLoader().load(src, apply, undefined, err => console.warn('LotKing store: texture/decal non caricata', err));
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
  if(isAnimatedTextureProps(props)){
    gp.userData.effectUpdate = dt => {
      if(gp.userData.textureFrameUpdate) gp.userData.textureFrameUpdate(dt);
      else if(mat.map) mat.map.needsUpdate = true;
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
    version:2,
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
  }, props || {});
  out.version = Math.max(2, Number(out.version) || 1);
  if(!Array.isArray(out.cameraCuts)) out.cameraCuts = Array.isArray(out.movieTrack) ? out.movieTrack : [];
  out.movieTrack = out.cameraCuts;
  if(!Array.isArray(out.objectTracks)) out.objectTracks = [];
  if(!Array.isArray(out.lensTracks)) out.lensTracks = [];
  if(!Array.isArray(out.eventTracks)) out.eventTracks = [];
  if(!Array.isArray(out.markers)) out.markers = [];
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
function createLight(kind, props){
  props = props || {};
  const color = props.color != null ? props.color : 0xffeecc;
  const intensity = props.intensity != null ? props.intensity : 1;
  const gp = new THREE.Group();
  let l;
  const makeHandle = () => {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      wireframe: true,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    const handle = new THREE.Mesh(new THREE.SphereGeometry(.65, 16, 8), mat);
    handle.name = 'Editor Light Pick Handle';
    handle.userData.editorLightHandle = true;
    handle.userData.nonExportable = true;
    handle.renderOrder = 999;
    return handle;
  };
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
  gp.add(makeHandle());
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
function normalizeMeshEdits(value){
  const edits = value && typeof value === 'object' ? cloneData(value) : {};
  edits.version = 1;
  edits.deleted = Array.isArray(edits.deleted) ? Array.from(new Set(edits.deleted.map(String))) : [];
  edits.detached = Array.isArray(edits.detached) ? Array.from(new Set(edits.detached.map(String))) : [];
  edits.transforms = edits.transforms && typeof edits.transforms === 'object' ? edits.transforms : {};
  edits.properties = edits.properties && typeof edits.properties === 'object' ? edits.properties : {};
  edits.splits = edits.splits && typeof edits.splits === 'object' ? edits.splits : {};
  edits.joins = Array.isArray(edits.joins) ? edits.joins.filter(join => join && join.id && Array.isArray(join.parts) && join.parts.length > 1).map(join => ({
    id:String(join.id),
    name:String(join.name || 'Joined Mesh'),
    parts:Array.from(new Set(join.parts.map(String))),
  })) : [];
  return edits;
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
            if(material[key] && material[key].dispose) material[key].dispose();
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
    new THREE.GLTFLoader().load(src, g => resolve(g.scene), undefined, err => reject(err));
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
function loadGlb(src, fit, opts){
  opts = opts || {};
  return new Promise((resolve, reject) => {
    if(typeof THREE.GLTFLoader === 'undefined'){ reject(new Error('GLTFLoader non disponibile')); return; }
    const loader = new THREE.GLTFLoader();
    loader.load(src, g => {
      const root = g.scene;
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
  const opts = {vehicleLike: vehicleLikeGlbEntry(entry), suppressEmbeddedLights:!!entry.embeddedLightsExtracted};
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
    const fallbackIntensity = kind === 'spot' ? 1.8 : (kind === 'point' ? 1.4 : 1.1);
    const rawIntensity = Number(source.intensity);
    const props = {
      color:source.color ? source.color.getHex() : 0xfff1d0,
      intensity:Number.isFinite(rawIntensity) && rawIntensity > 0 ? Math.max(.1, Math.min(8, rawIntensity)) : fallbackIntensity,
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

// ------------------------------------------------ create from a saved "added" entry
function createFromEntry(entry, GAME){
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
  if(entry.kind === 'light') return Promise.resolve(createLight(entry.light, entry.props));
  if(entry.kind === 'effect') return Promise.resolve(createEmitter(entry.effect, entry.params));
  if(entry.kind === 'text') return Promise.resolve(createText(entry.textKind || '2d', entry.props));
  if(entry.kind === 'texture') return Promise.resolve(createTexture(entry.textureKind || (entry.props && entry.props.mode) || 'decal', entry.props));
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
  if(entry.kind === 'text') return 'text';
  if(entry.kind === 'texture') return 'texture';
  if(entry.kind === 'camera') return 'camera';
  if(entry.kind === 'cinemaStudio') return 'cinemaStudio';
  if(entry.kind === 'logicElement') return 'logicElement';
  return entry.kind === 'light' ? 'light' : entry.kind === 'effect' ? 'effect' : 'mesh';
}

// register + optional box collider for an added object
function registerAdded(GAME, obj, entry){
  ensureEffectHook(GAME);
  obj.userData.addedEntry = entry;
  if(entry.meshEdits) applyMeshEdits(obj, entry.meshEdits);
  if(entry.kind === 'logicElement'){
    obj.userData.logicAssetId = entry.logicAssetId || obj.userData.logicAssetId || null;
    obj.userData.logicLinked = !!(entry.logicLinked !== false && obj.userData.logicAssetId);
    obj.userData.logicVariableOverrides = cloneData(entry.variableOverrides || obj.userData.logicVariableOverrides || {});
  }
  if(entry.asset){
    obj.userData.assetKey = entry.asset.key;
    obj.userData.assetName = entry.asset.name;
    obj.userData.assetSource = entry.asset.source;
  }
  const entryMass = entry && entry.physicsMass;
  const defaultMass = physicsMassFrom(entryMass);
  const defaultImpact = physicsImpactFrom(entry && entry.physicsImpact);
  obj.userData.physicsMass = defaultMass;
  obj.userData.physicsImpact = defaultImpact;
  if(entry && entry.driveSurface != null) obj.userData.driveSurface = !!entry.driveSurface;
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
  const wantPhysics = !!(entry && entry.physics);
  let colliderOpt = null;
  const hasCollider = !!(entry && (entry.collide || wantPhysics));
  if(hasCollider){
    const col = {x:0, z:0, hx:1, hz:1, mass: defaultMass, impact: defaultImpact, owner: obj};
    col._boxList = GAME.world.colliders.box;
    col.enabled = true;
    col.physics = !!wantPhysics;
    GAME.world.colliders.box.push(col);
    colliderOpt = {kind:'box', ref:col};
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
  if(entry.kind === 'logicElement') syncLogicElementSceneObject(obj, obj.userData.logicGraph || entry.graph || entry.logic);
  if(hasCollider) syncCollider(obj);
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
      if(o.userData.logicAnimationUpdate) o.userData.logicAnimationUpdate(dt);
    }
  });
}

// ------------------------------------------------ apply the whole saved scene at boot
let builtinIds = [];

function applyEnvironment(GAME, env){
  if(!GAME || !GAME.systems || !GAME.systems.sky || !env) return;
  if(env.skyTime != null) GAME.systems.sky.setTime(env.skyTime);
  if(env.dayLength != null) GAME.systems.sky.setDayLength(env.dayLength);
  if(GAME.systems.sky.hdri) GAME.systems.sky.hdri.setEnabled(false);
  if(GAME.systems.sky.proceduralEnv){
    if(env.procEnvEnabled != null) GAME.systems.sky.proceduralEnv.setEnabled(env.procEnvEnabled);
    if(env.procEnvIntensity != null) GAME.systems.sky.proceduralEnv.setIntensity(env.procEnvIntensity);
    if(env.procEnvWarmth != null) GAME.systems.sky.proceduralEnv.setWarmth(env.procEnvWarmth);
    if(env.procEnvContrast != null) GAME.systems.sky.proceduralEnv.setContrast(env.procEnvContrast);
  }
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
  if(env.sunBloom && GAME.systems.sky.sunBloom) GAME.systems.sky.sunBloom.set(env.sunBloom);
  if(env.volClouds && GAME.systems.sky.volClouds) GAME.systems.sky.volClouds.set(env.volClouds);
  if(env.rain && GAME.systems.rain) GAME.systems.rain.set(env.rain);
  if(GAME.systems.physics && GAME.systems.physics.setSurfaceWorldCollision && env.surfaceWorldCollision != null){
    GAME.systems.physics.setSurfaceWorldCollision(env.surfaceWorldCollision !== false);
  }
  if(GAME.player && GAME.player.updateLights) GAME.player.updateLights();
}

function collectEnvironment(GAME){
  const env = {
    skyTime: GAME.systems.sky.getTime(),
    dayLength: GAME.systems.sky.getDayLength(),
  };
  if(GAME.systems.sky.proceduralEnv){
    env.procEnvEnabled = GAME.systems.sky.proceduralEnv.getEnabled();
    env.procEnvIntensity = GAME.systems.sky.proceduralEnv.getIntensity();
    env.procEnvWarmth = GAME.systems.sky.proceduralEnv.getWarmth();
    env.procEnvContrast = GAME.systems.sky.proceduralEnv.getContrast();
  }
  if(GAME.systems.sky.flare){
    if(GAME.systems.sky.flare.get) env.lensFlare = GAME.systems.sky.flare.get();
    // chiavi legacy: un livello salvato ora resta leggibile da build precedenti
    env.flareEnabled = GAME.systems.sky.flare.getEnabled();
    env.flareOpacity = GAME.systems.sky.flare.getOpacity();
    env.flareSize = GAME.systems.sky.flare.getSize();
  }
  if(GAME.systems.sky.sunBloom) env.sunBloom = GAME.systems.sky.sunBloom.get();
  if(GAME.systems.sky.volClouds && GAME.systems.sky.volClouds.get()) env.volClouds = GAME.systems.sky.volClouds.get();
  if(GAME.systems.rain) env.rain = GAME.systems.rain.get();
  if(GAME.systems.physics && GAME.systems.physics.getSurfaceWorldCollision) env.surfaceWorldCollision = GAME.systems.physics.getSurfaceWorldCollision();
  return env;
}

function apply(GAME, sceneOverride){
  builtinIds = GAME.world.registry.filter(o => o.userData.builtin).map(o => o.userData.editorId);
  ensureEffectHook(GAME);
  const data = sceneOverride || load();
  if(!data){
    GAME.state.sceneReady = true;
    return Promise.resolve(null);
  }
  GAME.state.sceneReady = false;
  const pending = [];

  // Vehicle light config can create extra built-in light anchors; do it before
  // transform replay so custom Aux 3/4/... offsets have real targets.
  if(data.player && GAME.player.setEnabled) GAME.player.setEnabled(data.player.enabled !== false);
  if(data.player && GAME.player.setHidden) GAME.player.setHidden(data.player.hidden === true);
  if(data.player && GAME.player.setControllerIndex) GAME.player.setControllerIndex(Object.prototype.hasOwnProperty.call(data.player, 'controllerIndex') ? data.player.controllerIndex : 0);
  if(data.player && data.player.lights && GAME.player.setLights) GAME.player.setLights(data.player.lights);
  if(data.player && data.player.collision && GAME.player.setCollision) GAME.player.setCollision(data.player.collision);
  if(data.player && data.player.exhaust && GAME.player.setExhaust) GAME.player.setExhaust(data.player.exhaust);
  if(data.player && data.player.skids && GAME.player.setSkids) GAME.player.setSkids(data.player.skids);

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
  for(const id in data.transforms){
    const o = byId[id];
    if(o) applyParentLink(o, GAME);
  }
  // per-entity props (lights / material overrides)
  for(const id in data.props){
    const o = byId[id];
    if(!o) continue;
    const light = o.isLight ? o : o.userData.light;
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
  }
  // added objects
  for(const entry of data.added || []){
    const p = createFromEntry(entry, GAME)
      .then(obj => {
	        registerAdded(GAME, obj, entry);
	        applyParentLink(obj, GAME);
	        if(entry.props && entry.kind === 'texture') updateTextureObject(obj, entry.props);
	        else if(entry.props && entry.kind === 'camera') updateSceneCameraObject(obj, entry.props);
	        else if(entry.props && entry.kind !== 'light' && entry.kind !== 'cinemaStudio') applyMatProps(obj, entry.props);
	      })
      .catch(err => console.warn('LotKing store: oggetto "' + entry.name + '" non ricaricato', err));
    pending.push(p);
  }
  applyEnvironment(GAME, data.env);
  if(data.ui && data.ui.video && GAME.settings && GAME.settings.setVideoProject){
    GAME.settings.setVideoProject(data.ui.video);
  }
  if(data.ui && data.ui.radioHud && GAME.ui && GAME.ui.setRadioHud) GAME.ui.setRadioHud(data.ui.radioHud);
  const musicLibraries = data.ui && data.ui.musicLibraries;
  if(musicLibraries && GAME.systems){
    if(GAME.systems.radio && GAME.systems.radio.restoreTracks && Array.isArray(musicLibraries.radio)){
      pending.push(GAME.systems.radio.restoreTracks(musicLibraries.radio));
    }
    if(GAME.systems.menuMusic && GAME.systems.menuMusic.restoreTracks && Array.isArray(musicLibraries.menu)){
      pending.push(GAME.systems.menuMusic.restoreTracks(musicLibraries.menu));
    }
  }
  // player blueprint
  if(data.player){
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
          if(playerTransform){
            applyT(GAME.player.car, playerTransform);
          }
          else if(data.player.spawn && GAME.player.setVisibleHeading) GAME.player.setVisibleHeading(data.player.spawn.heading || 0);
          if(data.player.materials) applyPlayerMaterialProps(GAME, data.player.materials);
        }))
        .catch(err => console.warn('LotKing store: modello player non ricaricato', err));
      pending.push(p);
    } else if(data.player.meshEdits && GAME.player.getModel){
      const model = GAME.player.getModel();
      if(model){
        applyMeshEdits(model, data.player.meshEdits);
        GAME.player.car.userData.playerMeshEdits = normalizeMeshEdits(data.player.meshEdits);
      }
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
    if(data.player.collision && GAME.player.setCollision) GAME.player.setCollision(data.player.collision);
    if(data.player.dataWidgets && GAME.player.setDataWidgets) GAME.player.setDataWidgets(data.player.dataWidgets);
    if(data.player.exhaust && GAME.player.setExhaust) GAME.player.setExhaust(data.player.exhaust);
    if(data.player.skids && GAME.player.setSkids) GAME.player.setSkids(data.player.skids);
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
    if(data.player.materials) applyPlayerMaterialProps(GAME, data.player.materials);
  }
  return Promise.allSettled(pending).then(() => {
    for(const o of GAME.world.registry) syncCollider(o);
    if(GAME.systems.physics) GAME.systems.physics.rebuild();
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
  d.counter = Math.max(old ? old.counter || 0 : 0, _sessionCounter);
  const liveBuiltin = new Set();
  for(const o of GAME.world.registry){
    const id = o.userData.editorId;
    if(o.userData.builtin){
      liveBuiltin.add(id);
      d.transforms[id] = freezeRuntimeTransforms && old && old.transforms && old.transforms[id] ? cloneData(old.transforms[id]) : tOf(o);
      const light = o.isLight ? o : null;
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
	      if(e.kind === 'light' && o.userData.light) e.props = lightProps(o.userData.light);
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
      if(o.userData.assetKey) e.asset = Object.assign({}, e.asset || {}, {key:o.userData.assetKey, name:o.userData.assetName, source:o.userData.assetSource});
      d.added.push(e);
    }
  }
  d.deleted = builtinIds.filter(id => !liveBuiltin.has(id));
  d.env = freezeRuntimeTransforms
    ? cloneData(GAME.state.editorPreviewManualEnvironment || old && old.env || collectEnvironment(GAME))
    : collectEnvironment(GAME);
  if(GAME.ui && GAME.ui.radioHud) d.ui.radioHud = JSON.parse(JSON.stringify(GAME.ui.radioHud));
  if(GAME.settings && GAME.settings.getVideoProject) d.ui.video = cloneData(GAME.settings.getVideoProject());
  if(GAME.systems){
    const radioTracks = GAME.systems.radio && GAME.systems.radio.getStoredTracks ? GAME.systems.radio.getStoredTracks() : [];
    const menuTracks = GAME.systems.menuMusic && GAME.systems.menuMusic.getStoredTracks ? GAME.systems.menuMusic.getStoredTracks() : [];
    d.ui.musicLibraries = {radio:cloneData(radioTracks), menu:cloneData(menuTracks)};
  }
  d.player = collectPlayerBlueprint(GAME) || {};
  d.logic = old && old.logic ? cloneData(old.logic) : {};
  d.logic.levelGraph = normalizeLogicGraph(d.logic.levelGraph, 'Level Logic', 'level');
  return d;
}

function nextId(){
  const data = load();
  _sessionCounter = Math.max(_sessionCounter, data ? (data.counter || 0) + 1 : 1);
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
  ready = ensureBundledDemoProject().then(() => {
    appliedLevelId = normalizeLevelId(ensureLibrary().activeId);
    return apply(GAME || window.LOT_KING);
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
  ready = ensureBundledDemoProject().then(() => {
    const menuLevel = findMenuBackgroundLevel(preferredRoles);
    if(!menuLevel){
      reportBundledDemoProgress({progress:62, step:'no ROLE menu level found'});
      return null;
    }
    const scene = sceneFromProject(menuLevel.project);
    if(!scene){
      reportBundledDemoProgress({progress:62, step:'ROLE menu project has no scene'});
      return null;
    }
    applied = true;
    appliedMode = 'menu-background';
    appliedLevelId = menuLevel.id;
    reportBundledDemoProgress({progress:66, step:'applying role menu level', level:{id:menuLevel.id, name:menuLevel.name, role:menuLevel.role}});
    return apply(GAME || window.LOT_KING, scene)
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
  isApplied: () => applied,
  appliedInfo: () => ({applied, mode: appliedMode, levelId: appliedLevelId}),
  load, loadProject, save, clear, blank, projectFromScene, sceneFromProject, parseProject, exportProject, exportProjectWithLevels, importProject, getLevelLogicGraph, setLevelLogicGraph,
  tOf, applyT, syncCollider, applyEnvironment, collectEnvironment,
  lightProps, applyLightProps, applyMatProps,
	  createPrimitive, createText, updateTextObject, createTexture, updateTextureObject, createSceneCamera, updateSceneCameraObject, createCinemaStudio, createLogicElement, syncLogicElementSceneObject, loadLogicElementAsset, playLogicElementAnimation, stopLogicElementAnimation, setLogicElementAnimationSpeed, startLogicElementAnimations, stopLogicElementAnimations, removeLogicElementColliders, updateLogicElementColliderRefs, createLight, createEmitter, loadGlb, loadGlbRaw, extractEmbeddedLights, applyMeshEdits, normalizeMeshEdits, assignMeshEditIds, createFromEntry, registerAdded,
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
