/* =========================================================
   LOT KING - EDITOR VISUAL HELPERS
   Selection boxes, light helpers, replace-drop helper and camera rig helper.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const ED = deps.ED;
  const helperGroup = deps.helperGroup;
  let selBox = null;
  let multiSelBoxes = [];
  let lightHelper = null;
  let replaceDropHelper = null;
  let camRigHelper = null;
  let colliderHelpers = [];

  function registry(){
    return deps.registry ? (deps.registry() || []) : [];
  }

  function clearColliderHelpers(){
    const geometries = new Set();
    const materials = new Set();
    colliderHelpers.forEach(h => {
      if(helperGroup) helperGroup.remove(h);
      h.traverse && h.traverse(n => {
        if(n.geometry) geometries.add(n.geometry);
        if(n.material) materials.add(n.material);
      });
      if(h.geometry) geometries.add(h.geometry);
      if(h.material) materials.add(h.material);
    });
    geometries.forEach(g => g.dispose && g.dispose());
    materials.forEach(m => m.dispose && m.dispose());
    colliderHelpers = [];
  }

  function isComplexMeshRef(ref){
    if(!ref || ref.enabled === false) return false;
    if(ref.compoundPart) return ref.partMode === 'complex' || ref.meshCollider === true || ref.colliderMode === 'complex';
    return ref.meshCollider === true || ref.colliderMode === 'complex';
  }

  function complexMeshKey(owner, ref){
    return ((owner && owner.uuid) || 'owner') + ':' + (ref && ref.compoundPart ? (ref.partMeshUuid || ref.partName || ref.partIndex || 'part') : 'root');
  }

  function addComplexMeshHelper(owner, ref, color, opacity){
    if(!owner || !owner.traverse || !THREE.WireframeGeometry) return false;
    owner.updateMatrixWorld(true);
    const targetUuid = ref && ref.compoundPart ? ref.partMeshUuid : null;
    const targetName = ref && ref.compoundPart ? ref.partName : null;
    let vertexCount = 0;
    owner.traverse(node => {
      if(!node || !node.isMesh || !node.geometry || (node.userData && (node.userData.colliderPreview || node.userData.editorOnly || node.userData.nonExportable || node.userData.lightPickHandle))) return;
      if(targetUuid && node.uuid !== targetUuid) return;
      if(!targetUuid && targetName && node.name !== targetName) return;
      const pos = node.geometry.attributes && node.geometry.attributes.position;
      if(pos) vertexCount += pos.count;
    });
    if(vertexCount < 3 || vertexCount > 50000) return false;
    const group = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
    });
    owner.traverse(node => {
      if(!node || !node.isMesh || !node.geometry || (node.userData && (node.userData.colliderPreview || node.userData.editorOnly || node.userData.nonExportable || node.userData.lightPickHandle))) return;
      if(targetUuid && node.uuid !== targetUuid) return;
      if(!targetUuid && targetName && node.name !== targetName) return;
      const pos = node.geometry.attributes && node.geometry.attributes.position;
      if(!pos) return;
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(node.geometry), mat);
      wire.matrixAutoUpdate = false;
      wire.matrix.copy(node.matrixWorld);
      wire.renderOrder = 998;
      wire.userData.colliderPreview = true;
      group.add(wire);
    });
    if(!group.children.length){
      mat.dispose();
      return false;
    }
    group.userData.colliderPreview = true;
    colliderHelpers.push(group);
    helperGroup.add(group);
    return true;
  }

  function colliderDummyVisibility(owner){
    const mode = owner && owner.userData ? owner.userData.colliderDummyVisibility : null;
    if(mode === 'show') return true;
    if(mode === 'hide') return false;
    return ED.showCollisionDummies !== false;
  }

  function rebuildColliderHelpers(){
    clearColliderHelpers();
    if(!ED.active || ED.playPreview || !helperGroup) return;
    registry().forEach(o => {
      if(deps.syncCollider && o) deps.syncCollider(o);
      const col = o && o.userData && o.userData.collider;
      const ref = col && col.ref;
      if(!ref || ref.enabled === false) return;
      if(!colliderDummyVisibility(o)) return;
      const refs = ref.parts && ref.parts.length ? ref.parts : [ref];
      let fallbackY = .5, fallbackHy = .5, fallbackRotX = 0, fallbackRotY = 0, fallbackRotZ = 0;
      if(o && o.updateMatrixWorld){
        o.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(o);
        if(!box.isEmpty()){
          const c = box.getCenter(new THREE.Vector3());
          const s = box.getSize(new THREE.Vector3());
          fallbackY = c.y;
          fallbackHy = Math.max(.05, s.y / 2);
        }
        fallbackRotX = o.rotation ? o.rotation.x || 0 : 0;
        fallbackRotY = o.rotation ? o.rotation.y || 0 : 0;
        fallbackRotZ = o.rotation ? o.rotation.z || 0 : 0;
      }
      const addedComplexMeshHelpers = new Set();
      refs.forEach(partRef => {
        if(!partRef || partRef.enabled === false || partRef.compoundRoot) return;
        const selectedPart = ED.selected === o && ED.colliderEdit && Number.isInteger(ED.colliderPartIndex) && partRef.compoundPart && partRef.partIndex === ED.colliderPartIndex;
        if(col.kind !== 'circle' && isComplexMeshRef(partRef)){
          const color = selectedPart || ED.selected === o ? 0x52b7ff : 0xffd166;
          const key = complexMeshKey(o, partRef);
          if(addedComplexMeshHelpers.has(key) || addComplexMeshHelper(o, partRef, color, selectedPart || ED.selected === o ? .72 : .4)){
            addedComplexMeshHelpers.add(key);
            return;
          }
        }
        const color = selectedPart ? 0x52b7ff : (partRef.physics ? 0x4be3a0 : (partRef.partMode === 'solid' ? 0xff8a4b : 0xffd166));
        const mat = new THREE.MeshBasicMaterial({color, wireframe:true, transparent:true, opacity:selectedPart ? .88 : (partRef.physics ? .56 : .42), depthTest:false});
        let helper = null;
        if(col.kind === 'circle' && !partRef.compoundPart){
          helper = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(.05, partRef.r || 1), Math.max(.05, partRef.r || 1), Math.max(.1, (partRef.hy || fallbackHy) * 2), 40, 1, true), mat);
          helper.rotation.set(
            partRef.rotX != null ? partRef.rotX : fallbackRotX,
            partRef.rotY != null ? partRef.rotY : (partRef.rot != null ? partRef.rot : fallbackRotY),
            partRef.rotZ != null ? partRef.rotZ : fallbackRotZ
          );
        } else {
          helper = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.1, (partRef.hx || 1) * 2), Math.max(.1, (partRef.hy || fallbackHy) * 2), Math.max(.1, (partRef.hz || 1) * 2)), mat);
          helper.rotation.set(
            partRef.rotX != null ? partRef.rotX : fallbackRotX,
            partRef.rotY != null ? partRef.rotY : (partRef.rot != null ? partRef.rot : fallbackRotY),
            partRef.rotZ != null ? partRef.rotZ : fallbackRotZ
          );
        }
        helper.position.set(partRef.x || 0, partRef.y != null ? partRef.y : fallbackY, partRef.z || 0);
        helper.renderOrder = 998;
        helper.userData.colliderPreview = true;
        colliderHelpers.push(helper);
        helperGroup.add(helper);
      });
    });
    const playerCar = GAME && GAME.player && GAME.player.car;
    const playerCollision = GAME && GAME.player && GAME.player.collision;
    if(ED.selected === playerCar && playerCar && playerCollision && colliderDummyVisibility(playerCar)){
      const hx = playerCollision.hx == null ? .92 : playerCollision.hx;
      const hy = playerCollision.hy == null ? .42 : playerCollision.hy;
      const hz = playerCollision.hz == null ? 1.85 : playerCollision.hz;
      const bodyY = playerCollision.bodyY == null ? .55 : playerCollision.bodyY;
      const offsetX = playerCollision.offsetX || 0;
      const offsetY = playerCollision.offsetY == null ? .45 : playerCollision.offsetY;
      const offsetZ = playerCollision.offsetZ || 0;
      const yaw = playerCar.rotation ? (playerCar.rotation.y || 0) : 0;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const selectedCollider = !!ED.playerColliderEdit;
      const mat = new THREE.MeshBasicMaterial({color:selectedCollider ? 0x4be3a0 : 0x52b7ff, wireframe:true, transparent:true, opacity:selectedCollider ? .86 : .62, depthTest:false});
      const helper = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.1, hx * 2), Math.max(.1, hy * 2), Math.max(.1, hz * 2)), mat);
      helper.position.set(
        playerCar.position.x + offsetX * cos + offsetZ * sin,
        bodyY + offsetY,
        playerCar.position.z - offsetX * sin + offsetZ * cos
      );
      helper.rotation.set(playerCollision.rotX || 0, yaw + (playerCollision.rotY || 0), playerCollision.rotZ || 0);
      helper.renderOrder = 999;
      helper.userData.colliderPreview = true;
      colliderHelpers.push(helper);
      helperGroup.add(helper);
    }
  }

  function clearReplaceDropHelper(){
    if(replaceDropHelper && helperGroup) helperGroup.remove(replaceDropHelper);
    replaceDropHelper = null;
    deps.setViewportReplaceTarget(null);
  }

  function setReplaceDropHelper(target, ok){
    if(!target){ clearReplaceDropHelper(); return; }
    deps.setViewportReplaceTarget(ok ? target : null);
    if(!replaceDropHelper || replaceDropHelper.userData.target !== target){
      clearReplaceDropHelper();
      replaceDropHelper = new THREE.BoxHelper(target, ok ? 0x4be3a0 : 0xff5566);
      replaceDropHelper.userData.target = target;
      helperGroup.add(replaceDropHelper);
    }
    replaceDropHelper.material.color.setHex(ok ? 0x4be3a0 : 0xff5566);
  }

  function refreshSelectionHelpers(){
    if(selBox && helperGroup) helperGroup.remove(selBox);
    selBox = null;
    multiSelBoxes.forEach(box => { if(box && helperGroup) helperGroup.remove(box); });
    multiSelBoxes = [];
    if(lightHelper && helperGroup) helperGroup.remove(lightHelper);
    lightHelper = null;
    const multi = Array.isArray(ED.multiSelected) ? ED.multiSelected.filter(Boolean) : [];
    if(multi.length > 1){
      multi.forEach((obj, index) => {
        const box = new THREE.BoxHelper(obj, index === 0 ? 0xffd166 : 0x4be3a0);
        multiSelBoxes.push(box);
        helperGroup.add(box);
      });
    } else if(ED.selected){
      selBox = new THREE.BoxHelper(ED.selected, 0xffd166);
      helperGroup.add(selBox);
      const l = ED.selected.isLight ? ED.selected : ED.selected.userData && ED.selected.userData.light;
      if(l){
        try {
          lightHelper = l.isDirectionalLight ? new THREE.DirectionalLightHelper(l, 2) :
            l.isSpotLight ? new THREE.SpotLightHelper(l) :
            l.isPointLight ? new THREE.PointLightHelper(l, 1.2) : null;
          if(lightHelper) helperGroup.add(lightHelper);
        } catch(err){}
      }
    }
  }

  function ensureCameraRigHelper(){
    if(camRigHelper) return camRigHelper;
    camRigHelper = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(.7, .45, .32), new THREE.MeshBasicMaterial({color:0x9db4ff, wireframe:true}));
    const lens = new THREE.Mesh(new THREE.ConeGeometry(.18, .42, 12), new THREE.MeshBasicMaterial({color:0x9db4ff, wireframe:true}));
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -.34;
    camRigHelper.add(body, lens);
    return camRigHelper;
  }

  function updateSelectionAndDropHelpers(){
    if(selBox) selBox.update();
    multiSelBoxes.forEach(box => box && box.update && box.update());
    if(replaceDropHelper) replaceDropHelper.update();
    if(lightHelper && lightHelper.update) lightHelper.update();
    rebuildColliderHelpers();
  }

  function updateCameraRigHelper(gameCam){
    if(!camRigHelper) return;
    camRigHelper.visible = ED.camHelperOn;
    camRigHelper.position.copy(gameCam.position);
    camRigHelper.quaternion.copy(gameCam.quaternion);
  }

  return Object.freeze({
    clearReplaceDropHelper,
    setReplaceDropHelper,
    refreshSelectionHelpers,
    ensureCameraRigHelper,
    updateSelectionAndDropHelpers,
    rebuildColliderHelpers,
    clearColliderHelpers,
    updateCameraRigHelper,
    getSelectionBox: () => selBox,
    getLightHelper: () => lightHelper,
    getReplaceDropHelper: () => replaceDropHelper,
    getCameraRigHelper: () => camRigHelper,
  });
}

window.LK_EDITOR_VISUAL_HELPERS = Object.freeze({create});
})();
