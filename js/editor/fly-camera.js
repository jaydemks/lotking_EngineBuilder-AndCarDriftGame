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

  function flyStart(e){
    fly.rmb = true;
    fly.moved = 0;
    fly.lastX = e.clientX;
    fly.lastY = e.clientY;
    const orbit = deps.getOrbit();
    if(orbit) orbit.enabled = false;
    try { canvas.setPointerCapture(e.pointerId); } catch(err){}
  }

  function flyMove(e){
    if(!fly.rmb) return;
    const dx = e.clientX - fly.lastX;
    const dy = e.clientY - fly.lastY;
    fly.lastX = e.clientX; fly.lastY = e.clientY; fly.moved += Math.abs(dx) + Math.abs(dy);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camE.quaternion).normalize();
    const yaw = -dx * .004;
    const pitch = -dy * .004;
    fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    if(right.lengthSq() > .0001) fwd.applyAxisAngle(right, pitch);
    const maxPitch = .985;
    fwd.y = Math.max(-maxPitch, Math.min(maxPitch, fwd.y));
    fwd.normalize();
    camE.up.set(0, 1, 0);
    camE.lookAt(camE.position.clone().add(fwd));
  }

  function syncOrbitAfterFly(){
    const orbit = deps.getOrbit();
    if(!orbit) return;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camE.quaternion).normalize();
    const target = camE.position.clone().addScaledVector(fwd, 12);
    camE.up.set(0, 1, 0);
    camE.lookAt(target);
    orbit.object.up.set(0, 1, 0);
    orbit.target.copy(target);
    orbit.update();
  }

  function flyEnd(e){
    fly.rmb = false;
    if(e && e.pointerId != null){ try { canvas.releasePointerCapture(e.pointerId); } catch(err){} }
    syncOrbitAfterFly();
    const orbit = deps.getOrbit();
    if(orbit) orbit.enabled = ED.active && !ED.playPreview;
  }

  function flyUpdate(dt){
    if(!fly.rmb) return;
    const speed = (fly.keys.shift ? fly.speed * 2.4 : fly.speed) * Math.max(.001, dt || .016);
    const dir = new THREE.Vector3();
    if(fly.keys.w) dir.z -= 1;
    if(fly.keys.s) dir.z += 1;
    if(fly.keys.a) dir.x -= 1;
    if(fly.keys.d) dir.x += 1;
    if(fly.keys.e) dir.y += 1;
    if(fly.keys.q) dir.y -= 1;
    if(dir.lengthSq()){
      dir.normalize().multiplyScalar(speed).applyQuaternion(camE.quaternion);
      camE.position.add(dir);
    }
  }

  return Object.freeze({flyStart, flyMove, syncOrbitAfterFly, flyEnd, flyUpdate});
}

window.LK_EDITOR_FLY_CAMERA = Object.freeze({create});
})();
