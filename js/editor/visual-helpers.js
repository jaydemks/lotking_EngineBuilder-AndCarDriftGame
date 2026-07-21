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

  function disposeVisualHelper(helper){
    if(!helper) return;
    if(helper.parent) helper.parent.remove(helper);
    helper.traverse && helper.traverse(node => {
      if(node.geometry && node.geometry.dispose) node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach(material => { if(material && material.dispose) material.dispose(); });
    });
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
      wire.userData.colliderSourceMesh = node;
      group.add(wire);
    });
    if(!group.children.length){
      mat.dispose();
      return false;
    }
    group.userData.colliderPreview = true;
    group.userData.colliderRef = ref;
    group.userData.colliderOwner = owner;
    colliderHelpers.push(group);
    helperGroup.add(group);
    return true;
  }

  function colliderDummyVisibility(owner){
    if(ED.showCollisionDummies !== true) return false;
    const mode = owner && owner.userData ? owner.userData.colliderDummyVisibility : null;
    if(mode === 'show') return true;
    if(mode === 'hide') return false;
    return ED.selected === owner;
  }

  function rebuildColliderHelpers(){
    clearColliderHelpers();
    const previewActive = ED.playPreview || ED.simulatePreview;
    if(!ED.active || !helperGroup || (previewActive && ED.forceCollisionDummiesInPreview !== true)) return;
    registry().forEach(o => {
      if(deps.syncCollider && o) deps.syncCollider(o);
      const logicRefs = o && o.userData && Array.isArray(o.userData.logicElementColliderRefs) ? o.userData.logicElementColliderRefs : [];
      logicRefs.forEach(logicRef => {
        if(!logicRef || logicRef.enabled === false) return;
        const cfg = logicRef.config || {};
        const mode = cfg.dummyVisibility || (cfg.dummyVisible === true ? 'show' : (cfg.dummyVisible === false ? 'hide' : 'auto'));
        if(ED.showCollisionDummies !== true || mode === 'hide' || (mode !== 'show' && ED.selected !== o)) return;
        const mat = new THREE.MeshBasicMaterial({color:ED.selected === o ? 0x52b7ff : 0x4be3a0, wireframe:true, transparent:true, opacity:ED.selected === o ? .72 : .48, depthTest:false});
        let helper;
        if(logicRef.kind === 'circle'){
          helper = new THREE.Mesh(new THREE.SphereGeometry(Math.max(.05, logicRef.r || .5), 24, 16), mat);
        } else {
          helper = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.1, (logicRef.hx || .5) * 2), Math.max(.1, (logicRef.hy || .5) * 2), Math.max(.1, (logicRef.hz || .5) * 2)), mat);
          helper.rotation.set(logicRef.rotX || 0, logicRef.rotY || logicRef.rot || 0, logicRef.rotZ || 0);
        }
        helper.position.set(logicRef.x || 0, logicRef.y || 0, logicRef.z || 0);
        helper.renderOrder = 998;
        helper.userData.colliderPreview = true;
        helper.userData.logicElementColliderPreview = true;
        helper.userData.colliderOwner = o;
        helper.userData.colliderRef = logicRef;
        colliderHelpers.push(helper);
        helperGroup.add(helper);
      });
      const vehicleCollision = o && o.userData && o.userData.logicGraph && o.userData.logicGraph.vehiclePawn && o.userData.logicGraph.vehiclePawn.collision;
      if(vehicleCollision && colliderDummyVisibility(o)){
        const hx = vehicleCollision.hx == null ? .92 : vehicleCollision.hx;
        const hy = vehicleCollision.hy == null ? .42 : vehicleCollision.hy;
        const hz = vehicleCollision.hz == null ? 1.85 : vehicleCollision.hz;
        const bodyY = vehicleCollision.bodyY == null ? .55 : vehicleCollision.bodyY;
        const worldPosition = o.getWorldPosition ? o.getWorldPosition(new THREE.Vector3()) : o.position;
        const worldRotation = o.getWorldQuaternion ? new THREE.Euler().setFromQuaternion(o.getWorldQuaternion(new THREE.Quaternion()), 'XYZ') : o.rotation;
        const yaw = worldRotation ? worldRotation.y || 0 : 0;
        const offsetX = vehicleCollision.offsetX || 0;
        const offsetY = vehicleCollision.offsetY == null ? .45 : vehicleCollision.offsetY;
        const offsetZ = vehicleCollision.offsetZ || 0;
        const cos = Math.cos(yaw), sin = Math.sin(yaw);
        const mat = new THREE.MeshBasicMaterial({color:0x52b7ff, wireframe:true, transparent:true, opacity:.68, depthTest:false});
        const helper = new THREE.Mesh(new THREE.BoxGeometry(Math.max(.1, hx * 2), Math.max(.1, hy * 2), Math.max(.1, hz * 2)), mat);
        helper.position.set(worldPosition.x + offsetX * cos + offsetZ * sin, worldPosition.y + bodyY + offsetY, worldPosition.z - offsetX * sin + offsetZ * cos);
        helper.rotation.set(vehicleCollision.rotX || 0, yaw + (vehicleCollision.rotY || 0), vehicleCollision.rotZ || 0);
        helper.renderOrder = 999;
        helper.userData.colliderPreview = true;
        helper.userData.logicVehicleColliderPreview = true;
        helper.userData.colliderOwner = o;
        helper.userData.colliderConfig = vehicleCollision;
        colliderHelpers.push(helper);
        helperGroup.add(helper);
      }
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
        helper.userData.colliderRef = partRef;
        helper.userData.colliderKind = col.kind;
        helper.userData.colliderOwner = o;
        colliderHelpers.push(helper);
        helperGroup.add(helper);
      });
    });
    const playerCar = GAME && GAME.player && GAME.player.car;
    const playerCollision = GAME && GAME.player && GAME.player.collision;
    if(playerCar && playerCollision && colliderDummyVisibility(playerCar)){
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
      helper.userData.playerColliderPreview = true;
      helper.userData.colliderOwner = playerCar;
      colliderHelpers.push(helper);
      helperGroup.add(helper);
    }
  }

  function clearReplaceDropHelper(){
    disposeVisualHelper(replaceDropHelper);
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
    disposeVisualHelper(selBox);
    selBox = null;
    multiSelBoxes.forEach(disposeVisualHelper);
    multiSelBoxes = [];
    disposeVisualHelper(lightHelper);
    lightHelper = null;
    const multi = Array.isArray(ED.multiSelected) ? ED.multiSelected.filter(Boolean) : [];
    if(multi.length > 1){
      multi.forEach((obj, index) => {
        const box = new THREE.BoxHelper(obj, index === 0 ? 0xffd166 : 0x4be3a0);
        box.userData.target = obj;
        multiSelBoxes.push(box);
        helperGroup.add(box);
      });
    } else if(ED.selected){
      selBox = new THREE.BoxHelper(ED.selected, 0xffd166);
      selBox.userData.target = ED.selected;
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
    refreshColliderHelperStyles();
  }

  function refreshColliderHelperStyles(){
    colliderHelpers.forEach(helper => {
      const data = helper && helper.userData || {};
      if(data.playerColliderPreview){
        if(helper.material){
          helper.material.color.setHex(ED.playerColliderEdit ? 0x4be3a0 : 0x52b7ff);
          helper.material.opacity = ED.playerColliderEdit ? .86 : .62;
        }
        return;
      }
      const ref = data.colliderRef;
      const owner = data.colliderOwner;
      if(!ref || !owner) return;
      const selectedPart = ED.selected === owner && ED.colliderEdit && Number.isInteger(ED.colliderPartIndex) && ref.compoundPart && ref.partIndex === ED.colliderPartIndex;
      const complex = isComplexMeshRef(ref);
      const color = complex
        ? (selectedPart || ED.selected === owner ? 0x52b7ff : 0xffd166)
        : (selectedPart ? 0x52b7ff : (ref.physics ? 0x4be3a0 : (ref.partMode === 'solid' ? 0xff8a4b : 0xffd166)));
      const opacity = complex ? (selectedPart || ED.selected === owner ? .72 : .4) : (selectedPart ? .88 : (ref.physics ? .56 : .42));
      helper.traverse(node => {
        if(node.material && node.material.color){
          node.material.color.setHex(color);
          node.material.opacity = opacity;
        }
      });
    });
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

  function targetMatrixChanged(helper, target){
    if(!helper || !target || !target.updateWorldMatrix) return true;
    target.updateWorldMatrix(true, false);
    const elements = target.matrixWorld.elements;
    const before = helper.userData.lkTargetMatrix;
    if(before && elements.every((value, index) => Math.abs(value - before[index]) < 1e-7)) return false;
    helper.userData.lkTargetMatrix = elements.slice();
    return true;
  }

  function updateColliderHelpers(){
    colliderHelpers.forEach(helper => {
      if(!helper) return;
      if(helper.userData && helper.userData.playerColliderPreview){
        const car = GAME && GAME.player && GAME.player.car;
        const cfg = GAME && GAME.player && GAME.player.collision;
        if(!car || !cfg) return;
        const yaw = car.rotation ? car.rotation.y || 0 : 0;
        const cos = Math.cos(yaw), sin = Math.sin(yaw);
        const ox = cfg.offsetX || 0, oz = cfg.offsetZ || 0;
        helper.position.set(car.position.x + ox * cos + oz * sin, (cfg.bodyY == null ? .55 : cfg.bodyY) + (cfg.offsetY == null ? .45 : cfg.offsetY), car.position.z - ox * sin + oz * cos);
        helper.rotation.set(cfg.rotX || 0, yaw + (cfg.rotY || 0), cfg.rotZ || 0);
        return;
      }
      if(helper.userData && helper.userData.logicVehicleColliderPreview){
        const owner = helper.userData.colliderOwner;
        const cfg = helper.userData.colliderConfig;
        if(!owner || !cfg) return;
        const worldPosition = owner.getWorldPosition ? owner.getWorldPosition(new THREE.Vector3()) : owner.position;
        const worldRotation = owner.getWorldQuaternion ? new THREE.Euler().setFromQuaternion(owner.getWorldQuaternion(new THREE.Quaternion()), 'XYZ') : owner.rotation;
        const yaw = worldRotation ? worldRotation.y || 0 : 0;
        const cos = Math.cos(yaw), sin = Math.sin(yaw);
        const ox = cfg.offsetX || 0, oz = cfg.offsetZ || 0;
        helper.position.set(worldPosition.x + ox * cos + oz * sin, worldPosition.y + (cfg.bodyY == null ? .55 : cfg.bodyY) + (cfg.offsetY == null ? .45 : cfg.offsetY), worldPosition.z - ox * sin + oz * cos);
        helper.rotation.set(cfg.rotX || 0, yaw + (cfg.rotY || 0), cfg.rotZ || 0);
        return;
      }
      if(helper.isGroup){
        helper.traverse(node => {
          const source = node.userData && node.userData.colliderSourceMesh;
          if(!source) return;
          source.updateWorldMatrix(true, false);
          node.matrix.copy(source.matrixWorld);
        });
        return;
      }
      const ref = helper.userData && helper.userData.colliderRef;
      if(!ref) return;
      helper.position.set(ref.x || 0, ref.y != null ? ref.y : 0, ref.z || 0);
      helper.rotation.set(ref.rotX || 0, ref.rotY != null ? ref.rotY : (ref.rot || 0), ref.rotZ || 0);
    });
  }

  function updateSelectionAndDropHelpers(){
    if(selBox && targetMatrixChanged(selBox, selBox.userData.target)) selBox.update();
    multiSelBoxes.forEach(box => { if(box && box.update && targetMatrixChanged(box, box.userData.target)) box.update(); });
    if(replaceDropHelper && targetMatrixChanged(replaceDropHelper, replaceDropHelper.userData.target)) replaceDropHelper.update();
    if(lightHelper && lightHelper.update){
      const light = ED.selected && (ED.selected.isLight ? ED.selected : ED.selected.userData && ED.selected.userData.light);
      const lightSig = light ? [light.color && light.color.getHex(), light.intensity, light.distance, light.angle, light.penumbra].join(':') : '';
      if(targetMatrixChanged(lightHelper, ED.selected) || lightHelper.userData.lkLightSig !== lightSig){
        lightHelper.userData.lkLightSig = lightSig;
        lightHelper.update();
      }
    }
    updateColliderHelpers();
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
