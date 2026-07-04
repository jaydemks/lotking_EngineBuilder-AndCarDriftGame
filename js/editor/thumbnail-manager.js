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

  function has(id){ return cache.has(id); }
  function get(id){ return cache.get(id); }
  function remove(id){ cache.delete(id); }
  function queueThumb(o, el){
    const id = o && o.userData && o.userData.editorId;
    if(!id || cache.has(id) || queued.has(id)) return;
    queued.add(id);
    queue.push({o, el});
  }
  function processQueue(){
    if(!active() || !queue.length) return;
    const job = queue.shift();
    const id = job.o.userData.editorId;
    queued.delete(id);
    if(!cache.has(id)){
      try { cache.set(id, render(job.o)); }
      catch(err){ cache.set(id, null); }
    }
    const url = cache.get(id);
    if(url && job.el.isConnected){ job.el.style.backgroundImage = 'url(' + url + ')'; job.el.textContent = ''; }
  }
  function render(o){
    if(!renderer){
      renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
      renderer.setSize(96, 96);
      renderer.outputEncoding = THREE.sRGBEncoding;
      scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, .75));
      const dl = new THREE.DirectionalLight(0xffffff, .9); dl.position.set(3, 6, 4);
      scene.add(dl);
      camera = new THREE.PerspectiveCamera(40, 1, .01, 500);
    }
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

  return Object.freeze({has, get, remove, queue: queueThumb, process: processQueue});
}

window.LK_EDITOR_THUMBNAILS = Object.freeze({create});
})();
