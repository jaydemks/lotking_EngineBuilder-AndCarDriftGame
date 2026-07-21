/* =========================================================
   LOT KING — EDITOR THUMBNAILS
   Lazy thumbnail rendering and cache for outliner/assets.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const active = deps.active || function(){ return true; };
  const canProcessHeavy = deps.canProcessHeavy || function(){ return true; };
  const cache = new Map();
  let renderer = null, scene = null, camera = null;
  const queue = [];
  const queued = new Set();
  const assetQueue = [];
  const assetWaiters = new Map();
  let assetBusy = false;
  let scheduled = false;
  let nextSceneThumbAt = 0;

  function has(id){ return cache.has(id); }
  function get(id){ return cache.get(id); }
  function remove(id){ cache.delete(id); }
  function applyImage(el, url){
    if(!el || !el.isConnected || !url) return;
    el.style.backgroundImage = 'url(' + url + ')';
    Array.from(el.childNodes).forEach(node => {
      if(node.nodeType === 3) node.nodeValue = '';
    });
  }
  function ensureRenderer(size){
    const s = size || 96;
    if(!renderer){
      renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, .75));
      const dl = new THREE.DirectionalLight(0xffffff, .9); dl.position.set(3, 6, 4);
      scene.add(dl);
      camera = new THREE.PerspectiveCamera(40, 1, .01, 500);
    }
    renderer.setSize(s, s);
  }
  function queueThumb(o, el){
    const id = o && o.userData && o.userData.editorId;
    if(!id || cache.has(id) || queued.has(id)) return;
    queued.add(id);
    queue.push({o, el});
  }
  function queueAssetThumb(asset, el, resolveUrl){
    const id = asset && (asset.id || asset.key || asset.dbKey || asset.src || asset.source);
    if(!id) return;
    const key = 'asset:' + id;
    // A 96px thumbnail must not load a second full copy of a large map GLB.
    // Keep the normal asset icon instead; the placed scene object is still
    // rendered normally and can receive a lightweight shared-geometry thumb.
    if(asset.kind === 'glb'){
      cache.set(key, null);
      return;
    }
    if(cache.has(key)){
      applyImage(el, cache.get(key));
      return;
    }
    if(assetWaiters.has(key)){
      assetWaiters.get(key).push(el);
      return;
    }
    assetWaiters.set(key, [el]);
    assetQueue.push({key, asset, resolveUrl});
  }
  function tooComplexForLiveThumbnail(o){
    let meshes = 0;
    let triangles = 0;
    if(!o || !o.traverse) return true;
    o.traverse(node => {
      if(!node || !node.isMesh || !node.geometry) return;
      meshes++;
      const geometry = node.geometry;
      const count = geometry.index && geometry.index.count || geometry.attributes && geometry.attributes.position && geometry.attributes.position.count || 0;
      triangles += count / 3;
    });
    return meshes > 24 || triangles > 100000;
  }
  function runQueue(deadline){
    if(!active()) return;
    if(!canProcessHeavy()){
      setTimeout(processQueue, 120);
      return;
    }
    if(deadline && deadline.timeRemaining && deadline.timeRemaining() < 10){
      nextSceneThumbAt = performance.now() + 160;
      setTimeout(processQueue, 170);
      return;
    }
    if(!queue.length){
      processAssetQueue();
      return;
    }
    const job = queue.shift();
    const id = job.o.userData.editorId;
    queued.delete(id);
    if(!cache.has(id)){
      try { cache.set(id, tooComplexForLiveThumbnail(job.o) ? null : render(job.o)); }
      catch(err){ cache.set(id, null); }
    }
    const url = cache.get(id);
    applyImage(job.el, url);
    nextSceneThumbAt = performance.now() + 180;
    processAssetQueue();
  }
  function processQueue(){
    if(scheduled || !active()) return;
    const wait = nextSceneThumbAt - performance.now();
    if(wait > 0){
      scheduled = true;
      setTimeout(() => { scheduled = false; processQueue(); }, Math.ceil(wait));
      return;
    }
    scheduled = true;
    const run = deadline => {
      scheduled = false;
      runQueue(deadline);
    };
    if(window.requestIdleCallback) window.requestIdleCallback(run);
    else setTimeout(run, 32);
  }
  function processAssetQueue(){
    if(!active() || assetBusy || !assetQueue.length) return;
    const job = assetQueue.shift();
    assetBusy = true;
    renderAsset(job.asset, job.resolveUrl).then(url => {
      cache.set(job.key, url || null);
      const waiters = assetWaiters.get(job.key) || [];
      waiters.forEach(el => applyImage(el, url));
    }).catch(() => {
      cache.set(job.key, null);
    }).finally(() => {
      assetWaiters.delete(job.key);
      assetBusy = false;
      if(assetQueue.length) setTimeout(processQueue, 80);
    });
  }
  function render(o){
    ensureRenderer(96);
    const savedUserData = [];
    o.traverse(node => {
      savedUserData.push([node, node.userData]);
      node.userData = {};
    });
    let clone;
    try { clone = o.clone(true); }
    finally { savedUserData.forEach(item => { item[0].userData = item[1]; }); }
    const strip = [];
    clone.traverse(n => { if(n.isLight || n.isSprite || n.name === 'Editor Light Pick Handle' || n.userData && (n.userData.editorOnly || n.userData.nonExportable || n.userData.editorLightHandle)) strip.push(n); });
    for(const n of strip) if(n.parent) n.parent.remove(n);
    clone.position.set(0,0,0); clone.rotation.set(0,0,0);
    scene.add(clone);
    const box = new THREE.Box3().setFromObject(clone);
    if(box.isEmpty()){ scene.remove(clone); return null; }
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(.4, box.getSize(new THREE.Vector3()).length() / 2);
    camera.position.set(c.x + r*1.3, c.y + r*1.0, c.z + r*1.3);
    camera.lookAt(c);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL();
    scene.remove(clone);
    return url;
  }
  function renderRoot(root){
    ensureRenderer(96);
    const strip = [];
    root.traverse && root.traverse(n => { if(n.isLight || n.isSprite) strip.push(n); });
    for(const n of strip) if(n.parent) n.parent.remove(n);
    root.position.set(0,0,0); root.rotation.set(0,0,0);
    scene.add(root);
    const box = new THREE.Box3().setFromObject(root);
    if(box.isEmpty()){ scene.remove(root); return null; }
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(.4, box.getSize(new THREE.Vector3()).length() / 2);
    camera.position.set(c.x + r*1.3, c.y + r*1.0, c.z + r*1.3);
    camera.lookAt(c);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL();
    scene.remove(root);
    return url;
  }
  function resolveAssetUrl(asset, resolveUrl){
    if(!asset) return Promise.reject(new Error('asset missing'));
    if(asset.src) return Promise.resolve(asset.src);
    if(asset.dbKey && window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(asset.dbKey);
    if(resolveUrl) return resolveUrl(asset);
    return Promise.reject(new Error('asset source missing'));
  }
  function renderAsset(asset, resolveUrl){
    if(!THREE.GLTFLoader) return Promise.resolve(null);
    return resolveAssetUrl(asset, resolveUrl).then(src => new Promise((resolve, reject) => {
      new THREE.GLTFLoader().load(src, gltf => resolve(renderRoot(gltf.scene)), undefined, reject);
    }));
  }

  return Object.freeze({has, get, remove, queue: queueThumb, queueAsset: queueAssetThumb, process: processQueue});
}

window.LK_EDITOR_THUMBNAILS = Object.freeze({create});
})();
