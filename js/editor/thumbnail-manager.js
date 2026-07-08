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
  const cache = new Map();
  let renderer = null, scene = null, camera = null;
  const queue = [];
  const queued = new Set();
  const assetQueue = [];
  const assetWaiters = new Map();
  let assetBusy = false;

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
      renderer.outputEncoding = THREE.sRGBEncoding;
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
  function processQueue(){
    if(!active()) return;
    if(!queue.length){
      processAssetQueue();
      return;
    }
    const job = queue.shift();
    const id = job.o.userData.editorId;
    queued.delete(id);
    if(!cache.has(id)){
      try { cache.set(id, render(job.o)); }
      catch(err){ cache.set(id, null); }
    }
    const url = cache.get(id);
    applyImage(job.el, url);
    processAssetQueue();
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
      if(assetQueue.length) setTimeout(processAssetQueue, 0);
    });
  }
  function render(o){
    ensureRenderer(96);
    const clone = o.clone(true);
    const strip = [];
    clone.traverse(n => { if(n.isLight || n.isSprite) strip.push(n); });
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
