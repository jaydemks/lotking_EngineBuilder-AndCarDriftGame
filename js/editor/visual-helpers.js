/* =========================================================
   LOT KING - EDITOR VISUAL HELPERS
   Selection boxes, light helpers, replace-drop helper and camera rig helper.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const ED = deps.ED;
  const helperGroup = deps.helperGroup;
  let selBox = null;
  let lightHelper = null;
  let replaceDropHelper = null;
  let camRigHelper = null;

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
    if(lightHelper && helperGroup) helperGroup.remove(lightHelper);
    lightHelper = null;
    if(ED.selected){
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
    if(replaceDropHelper) replaceDropHelper.update();
    if(lightHelper && lightHelper.update) lightHelper.update();
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
    updateCameraRigHelper,
    getSelectionBox: () => selBox,
    getLightHelper: () => lightHelper,
    getReplaceDropHelper: () => replaceDropHelper,
    getCameraRigHelper: () => camRigHelper,
  });
}

window.LK_EDITOR_VISUAL_HELPERS = Object.freeze({create});
})();
