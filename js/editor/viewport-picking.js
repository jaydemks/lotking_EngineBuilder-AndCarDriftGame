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
  let materialPickHelper = null;

  function pickView(clientX, clientY){
    return opts.pickView ? opts.pickView(clientX, clientY) : null;
  }
  function viewportRect(clientX, clientY){
    const view = pickView(clientX, clientY);
    return view && view.rect ? view.rect : opts.viewportRect(clientX, clientY);
  }
  function camera(clientX, clientY){
    const view = pickView(clientX, clientY);
    return view && view.camera ? view.camera : opts.camera(clientX, clientY);
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
    const r = viewportRect(clientX, clientY);
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

  function logicElementOwnerOf(o){
    let n = o;
    while(n){
      if(n.userData && (n.userData.editorType === 'logicElement' || n.userData.addedEntry && n.userData.addedEntry.kind === 'logicElement')) return n;
      n = n.parent;
    }
    return null;
  }

  function pickAt(clientX, clientY, pickOpts){
    if(!pointerToNdc(clientX, clientY)) return null;
    ray.setFromCamera(ptr, camera(clientX, clientY));
    const hits = ray.intersectObjects(registry(), true);
    const candidates = [];
    const seen = new Set();
    for(const h of hits){
      let n = h.object;
      if(n && n.userData && n.userData.logicElementInternal){
        n = logicElementOwnerOf(n);
      }
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
    ray.setFromCamera(ptr, camera(clientX, clientY));
    const t = -ray.ray.origin.y / (ray.ray.direction.y || -1e-6);
    if(t > 0 && t < 600) return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    const cam = camera(clientX, clientY);
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

  function meshLabel(mesh, meshIndex){
    return mesh.name || mesh.userData && (mesh.userData.editorName || mesh.userData.editorId) || ('Mesh ' + (meshIndex + 1));
  }

  function materialLabel(mat, materialIndex){
    return mat && mat.name ? mat.name : ('Material ' + (materialIndex + 1));
  }

  function materialSlotInfo(root, slotKey){
    if(!root || !slotKey || slotKey === 'all') return null;
    let meshIndex = 0;
    let found = null;
    root.traverse(n => {
      if(found || !n.isMesh || !n.material) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach((mat, materialIndex) => {
        const key = meshIndex + ':' + materialIndex;
        if(key === slotKey){
          found = {
            key,
            root,
            mesh:n,
            meshIndex,
            materialIndex,
            material:mat,
            label:meshLabel(n, meshIndex) + ' / ' + materialLabel(mat, materialIndex),
          };
        }
      });
      meshIndex++;
    });
    return found;
  }

  function materialSlotForMesh(root, mesh, materialIndex){
    if(!root || !mesh) return null;
    let meshIndex = 0;
    let found = null;
    root.traverse(n => {
      if(found || !n.isMesh || !n.material) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      if(n === mesh){
        const index = Math.max(0, Math.min(mats.length - 1, materialIndex || 0));
        found = {
          key:meshIndex + ':' + index,
          root,
          mesh:n,
          meshIndex,
          materialIndex:index,
          material:mats[index],
          label:meshLabel(n, meshIndex) + ' / ' + materialLabel(mats[index], index),
        };
      }
      meshIndex++;
    });
    return found;
  }

  function pickMaterialAt(root, clientX, clientY){
    if(!root || !pointerToNdc(clientX, clientY)) return null;
    ray.setFromCamera(ptr, camera(clientX, clientY));
    const hits = ray.intersectObject(root, true);
    for(const h of hits){
      const mesh = h.object;
      if(!mesh || !mesh.isMesh || !mesh.material || !isEntityWorldVisible(mesh)) continue;
      const materialIndex = h.face && h.face.materialIndex != null ? h.face.materialIndex : 0;
      const slot = materialSlotForMesh(root, mesh, materialIndex);
      if(slot){
        slot.point = h.point;
        slot.distance = h.distance;
        return slot;
      }
    }
    return null;
  }

  function groupRangesForMaterial(geometry, materialIndex){
    const pos = geometry && geometry.attributes && geometry.attributes.position;
    if(!pos) return [];
    if(geometry.groups && geometry.groups.length){
      return geometry.groups.filter(g => (g.materialIndex || 0) === materialIndex).map(g => ({start:g.start || 0, count:g.count || 0}));
    }
    if(materialIndex !== 0) return [];
    const count = geometry.index ? geometry.index.count : pos.count;
    return [{start:0, count}];
  }

  function subsetGeometryForMaterial(mesh, materialIndex){
    const geometry = mesh && mesh.geometry;
    const pos = geometry && geometry.attributes && geometry.attributes.position;
    if(!pos) return null;
    const index = geometry.index || null;
    const ranges = groupRangesForMaterial(geometry, materialIndex);
    if(!ranges.length) return null;
    const verts = [];
    const v = new THREE.Vector3();
    ranges.forEach(range => {
      const end = Math.min((range.start || 0) + (range.count || 0), index ? index.count : pos.count);
      for(let i = range.start || 0; i + 2 < end; i += 3){
        for(let j = 0; j < 3; j++){
          const sourceIndex = index ? index.getX(i + j) : i + j;
          v.fromBufferAttribute(pos, sourceIndex);
          verts.push(v.x, v.y, v.z);
        }
      }
    });
    if(!verts.length) return null;
    const subset = new THREE.BufferGeometry();
    subset.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return subset;
  }

  function clearMaterialPickHelper(){
    if(materialPickHelper && helperGroup()){
      helperGroup().remove(materialPickHelper);
      if(materialPickHelper.geometry) materialPickHelper.geometry.dispose();
      if(materialPickHelper.material) materialPickHelper.material.dispose();
    }
    materialPickHelper = null;
  }

  function setMaterialPickHelper(slot, color){
    const group = helperGroup();
    if(!group) return;
    if(!slot || !slot.mesh){ clearMaterialPickHelper(); return; }
    if(materialPickHelper && materialPickHelper.userData.slotKey === slot.key && materialPickHelper.userData.mesh === slot.mesh){
      materialPickHelper.material.color.setHex(color || 0xffd166);
      return;
    }
    clearMaterialPickHelper();
    const subset = subsetGeometryForMaterial(slot.mesh, slot.materialIndex);
    if(!subset) return;
    const edges = new THREE.EdgesGeometry(subset, 1);
    subset.dispose();
    const mat = new THREE.LineBasicMaterial({color:color || 0xffd166, transparent:true, opacity:.95, depthTest:false});
    materialPickHelper = new THREE.LineSegments(edges, mat);
    materialPickHelper.renderOrder = 1002;
    materialPickHelper.frustumCulled = false;
    materialPickHelper.matrixAutoUpdate = false;
    materialPickHelper.userData.slotKey = slot.key;
    materialPickHelper.userData.mesh = slot.mesh;
    slot.mesh.updateMatrixWorld(true);
    materialPickHelper.matrix.copy(slot.mesh.matrixWorld);
    group.add(materialPickHelper);
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
    if(materialPickHelper && materialPickHelper.userData.mesh){
      materialPickHelper.userData.mesh.updateMatrixWorld(true);
      materialPickHelper.matrix.copy(materialPickHelper.userData.mesh.matrixWorld);
    }
  }

  return {
    pickAt,
    pickMaterialAt,
    materialSlotInfo,
    setMaterialPickHelper,
    clearMaterialPickHelper,
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
