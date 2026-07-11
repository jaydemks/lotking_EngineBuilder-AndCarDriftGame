/* =========================================================
   LOT KING - EDITOR FLY CAMERA
   RMB viewport look and WASD/QE movement helpers.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const fly = deps.fly;
  const camE = deps.camE;
  const canvas = deps.canvas;
  const ED = deps.ED;
  function activeCamera(){
    return deps.getActiveCamera ? (deps.getActiveCamera() || camE) : camE;
  }
  function activeRig(){
    return deps.getActiveCameraRig ? deps.getActiveCameraRig() : null;
  }
  function notifyRigChanged(rig){
    if(deps.onActiveCameraRigChange) deps.onActiveCameraRigChange(rig);
  }
  function worldQuaternion(object){
    const q = new THREE.Quaternion();
    if(object && object.getWorldQuaternion) object.getWorldQuaternion(q);
    else if(object && object.quaternion) q.copy(object.quaternion);
    return q;
  }
  function setCameraLikeForward(object, forward){
    const z = forward.clone().normalize().negate();
    const up = new THREE.Vector3(0, 1, 0);
    let x = new THREE.Vector3().crossVectors(up, z).normalize();
    if(x.lengthSq() < .0001) x = new THREE.Vector3(1, 0, 0);
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const m = new THREE.Matrix4().makeBasis(x, y, z);
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    if(object.parent && object.parent.isObject3D){
      const parentQ = new THREE.Quaternion();
      object.parent.getWorldQuaternion(parentQ);
      q.premultiply(parentQ.invert());
    }
    object.quaternion.copy(q);
  }

  function flyStart(e, opts){
    opts = opts || {};
    fly.rmb = true;
    fly.button = opts.button == null ? e.button : opts.button;
    fly.rotateOnly = !!opts.rotateOnly;
    fly.panOnly = !!opts.panOnly;
    fly.orbitOnly = !!opts.orbitOnly;
    fly.moved = 0;
    fly.lastX = e.clientX;
    fly.lastY = e.clientY;
    fly.orthoPan = !!(activeCamera() && activeCamera().isOrthographicCamera);
    const orbit = deps.getOrbit();
    if(orbit) orbit.enabled = false;
    if(!fly.panOnly && !fly.orbitOnly && canvas && canvas.requestPointerLock && e.pointerType !== 'touch'){
      try {
        const result = canvas.requestPointerLock();
        if(result && result.catch) result.catch(() => {});
      } catch(err){}
    }
    try { canvas.setPointerCapture(e.pointerId); } catch(err){}
  }

  function flyMove(e){
    if(!fly.rmb) return;
    const locked = document.pointerLockElement === canvas;
    const dx = locked ? (e.movementX || 0) : (e.clientX - fly.lastX);
    const dy = locked ? (e.movementY || 0) : (e.clientY - fly.lastY);
    fly.lastX = e.clientX; fly.lastY = e.clientY; fly.moved += Math.abs(dx) + Math.abs(dy);
    if((fly.orthoPan || fly.panOnly) && deps.panActiveViewport){
      deps.panActiveViewport(dx, dy);
      return;
    }
    const cam = activeCamera();
    if(fly.orbitOnly){
      const target = deps.getActiveViewportTarget ? deps.getActiveViewportTarget() : null;
      if(target){
        const spherical = new THREE.Spherical().setFromVector3(cam.position.clone().sub(target));
        spherical.theta -= dx * .004;
        spherical.phi = Math.max(.035, Math.min(Math.PI - .035, spherical.phi - dy * .004));
        cam.position.copy(target).add(new THREE.Vector3().setFromSpherical(spherical));
        cam.lookAt(target);
      }
      return;
    }
    const rig = activeRig();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuaternion(cam)).normalize();
    const yaw = -dx * .004;
    const pitch = -dy * .004;
    fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    if(right.lengthSq() > .0001) fwd.applyAxisAngle(right, pitch);
    const maxPitch = .985;
    fwd.y = Math.max(-maxPitch, Math.min(maxPitch, fwd.y));
    fwd.normalize();
    const pos = new THREE.Vector3();
    cam.getWorldPosition(pos);
    if(rig && rig !== cam){
      rig.up.set(0, 1, 0);
      setCameraLikeForward(rig, fwd);
      rig.updateMatrixWorld(true);
      notifyRigChanged(rig);
    } else {
      cam.up.set(0, 1, 0);
      cam.lookAt(cam.position.clone().add(fwd));
    }
  }

  function syncOrbitAfterFly(){
    const orbit = deps.getOrbit();
    if(!orbit) return;
    if(fly.orthoPan) return;
    const active = activeCamera();
    if(active !== camE) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camE.quaternion).normalize();
    const target = camE.position.clone().addScaledVector(fwd, 12);
    camE.up.set(0, 1, 0);
    camE.lookAt(target);
    orbit.object.up.set(0, 1, 0);
    orbit.target.copy(target);
    orbit.update();
  }

  function flyEnd(e){
    const wasPan = !!(fly.orthoPan || fly.panOnly || fly.orbitOnly);
    fly.rmb = false;
    fly.orthoPan = false;
    fly.rotateOnly = false;
    fly.panOnly = false;
    fly.orbitOnly = false;
    fly.button = null;
    if(document.pointerLockElement === canvas && document.exitPointerLock){
      try { document.exitPointerLock(); } catch(err){}
    }
    if(e && e.pointerId != null){ try { canvas.releasePointerCapture(e.pointerId); } catch(err){} }
    if(!wasPan) syncOrbitAfterFly();
    const orbit = deps.getOrbit();
    if(orbit) orbit.enabled = deps.shouldEnableOrbit ? deps.shouldEnableOrbit() : (ED.active && !ED.playPreview);
  }

  function flyUpdate(dt){
    if(!fly.rmb) return;
    if(fly.orthoPan || fly.panOnly || fly.orbitOnly) return;
    if(fly.rotateOnly) return;
    const speed = (fly.keys.shift ? fly.speed * 2.4 : fly.speed) * Math.max(.001, dt || .016);
    const dir = new THREE.Vector3();
    if(fly.keys.w) dir.z -= 1;
    if(fly.keys.s) dir.z += 1;
    if(fly.keys.a) dir.x -= 1;
    if(fly.keys.d) dir.x += 1;
    if(fly.keys.e) dir.y += 1;
    if(fly.keys.q) dir.y -= 1;
    if(dir.lengthSq()){
      const cam = activeCamera();
      dir.normalize().multiplyScalar(speed).applyQuaternion(worldQuaternion(cam));
      const rig = activeRig();
      if(rig && rig !== cam){
        const delta = dir.clone();
        if(rig.parent && rig.parent.isObject3D){
          const parentQuat = new THREE.Quaternion();
          rig.parent.getWorldQuaternion(parentQuat);
          delta.applyQuaternion(parentQuat.invert());
        }
        rig.position.add(delta);
        rig.updateMatrixWorld(true);
        notifyRigChanged(rig);
      } else {
        cam.position.add(dir);
      }
    }
  }

  return Object.freeze({flyStart, flyMove, syncOrbitAfterFly, flyEnd, flyUpdate});
}

window.LK_EDITOR_FLY_CAMERA = Object.freeze({create});
})();
