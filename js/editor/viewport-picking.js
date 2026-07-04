/* =========================================================
   LOT KING editor viewport picking
   Owns editor-viewport pointer conversion, scene raycast picking,
   ground placement points and hover selection helper.
   ========================================================= */
(function(){
'use strict';

function create(opts){
  opts = opts || {};
  const THREE = opts.THREE || window.THREE;
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hoverHelper = null;

  function viewportRect(){
    return opts.viewportRect();
  }
  function camera(){
    return opts.camera();
  }
  function registry(){
    return opts.registry() || [];
  }
  function helperGroup(){
    return opts.helperGroup();
  }
  function selected(){
    return opts.selected ? opts.selected() : null;
  }
  function hoverSuppressed(){
    return opts.hoverSuppressed && opts.hoverSuppressed();
  }

  function pointerToNdc(clientX, clientY){
    const r = viewportRect();
    if(clientX < r.x || clientX > r.x + r.w || clientY < r.y || clientY > r.y + r.h) return null;
    ptr.x = ((clientX - r.x) / r.w) * 2 - 1;
    ptr.y = -((clientY - r.y) / r.h) * 2 + 1;
    return ptr;
  }

  function isEntityWorldVisible(o){
    for(let n = o; n; n = n.parent){
      if(n.visible === false) return false;
    }
    return true;
  }

  function isGroundLikeEntity(o){
    if(!o || !o.userData) return false;
    const name = String(o.userData.editorName || o.name || '').toLowerCase();
    const id = String(o.userData.editorId || '').toLowerCase();
    const type = String(o.userData.editorType || '').toLowerCase();
    return type === 'mesh' && /(^|[\s_-])(ground|floor|apron|asphalt|parking|lot)([\s_-]|$)/.test(name + ' ' + id);
  }

  function pickAt(clientX, clientY, pickOpts){
    if(!pointerToNdc(clientX, clientY)) return null;
    ray.setFromCamera(ptr, camera());
    const hits = ray.intersectObjects(registry(), true);
    const candidates = [];
    const seen = new Set();
    for(const h of hits){
      let n = h.object;
      while(n && !n.userData.editorId) n = n.parent;
      if(!n || seen.has(n) || !isEntityWorldVisible(n)) continue;
      seen.add(n);
      candidates.push({entity: n, point: h.point, distance: h.distance});
    }
    if(!candidates.length) return null;
    if(!(pickOpts && pickOpts.allowGroundFirst)){
      const objectHit = candidates.find(h => !isGroundLikeEntity(h.entity));
      if(objectHit) return objectHit;
    }
    return candidates[0];
  }

  function spawnPointAhead(){
    const cam = camera();
    const p = cam.position.clone().addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion), 12);
    p.y = 0;
    return p;
  }

  function groundPointAt(clientX, clientY){
    if(!pointerToNdc(clientX, clientY)) return spawnPointAhead();
    ray.setFromCamera(ptr, camera());
    const t = -ray.ray.origin.y / (ray.ray.direction.y || -1e-6);
    if(t > 0 && t < 600) return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    const cam = camera();
    return cam.position.clone().addScaledVector(new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion), 12).setY(0);
  }

  function clearHover(){
    const group = helperGroup();
    if(hoverHelper && group){
      group.remove(hoverHelper);
      hoverHelper.geometry.dispose();
    }
    hoverHelper = null;
  }

  function setHover(target){
    if(hoverSuppressed()){ clearHover(); return; }
    if(!target || target === selected()){ clearHover(); return; }
    if(hoverHelper && hoverHelper.userData.target === target) return;
    clearHover();
    hoverHelper = new THREE.BoxHelper(target, 0x4be3a0);
    hoverHelper.userData.target = target;
    helperGroup().add(hoverHelper);
  }

  function updateHover(e){
    if(hoverSuppressed()){
      clearHover();
      return;
    }
    const hit = pickAt(e.clientX, e.clientY);
    setHover(hit && hit.entity);
  }

  function updateHelpers(){
    if(hoverHelper) hoverHelper.update();
  }

  return {
    pickAt,
    groundPointAt,
    spawnPointAhead,
    updateHover,
    updateHelpers,
    clearHover,
    isGroundLikeEntity,
  };
}

window.LK_EDITOR_VIEWPORT_PICKING = Object.freeze({create});
})();
