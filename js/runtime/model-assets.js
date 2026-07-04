/* =========================================================
   LOT KING - 3D model loading and wheel rig helpers
   GLB/GLTF loading, model normalization and player wheel rig detection.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  const THREE = deps.THREERef;
  const car = deps.car;
  const isFileMode = deps.isFileMode;
  const gltfLoader = (typeof THREE.GLTFLoader !== 'undefined') ? new THREE.GLTFLoader() : null;

  function prepModel(root, targetLen, byHeight){
    root.traverse(o => {
      if(!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for(const m of mats){
        if(!m) continue;
        m.side = THREE.DoubleSide;
        m.needsUpdate = true;
      }
    });
    const wrap = new THREE.Group();
    let box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    if(!byHeight && size.x > size.z) root.rotation.y = Math.PI / 2;
    wrap.add(root);
    box = new THREE.Box3().setFromObject(wrap);
    const s2 = box.getSize(new THREE.Vector3());
    const ref = byHeight ? s2.y : Math.max(s2.x, s2.z);
    const k = ref > 1e-4 ? targetLen / ref : 1;
    wrap.scale.setScalar(k);
    box = new THREE.Box3().setFromObject(wrap);
    const c = box.getCenter(new THREE.Vector3());
    const inner = new THREE.Group();
    inner.add(wrap);
    wrap.position.set(-c.x, -box.min.y, -c.z);
    return inner;
  }

  function tryLoadModel(paths, onProg){
    return new Promise(resolve => {
      if(!gltfLoader){ resolve(null); return; }
      if(isFileMode){
        if(onProg) onProg(1);
        resolve(null);
        return;
      }
      const list = paths || [];
      if(!list.length){ resolve(null); return; }
      let i = 0, done = false;
      const finish = v => { if(!done){ done = true; if(onProg) onProg(1); resolve(v); } };
      const next = () => {
        if(i >= list.length){ finish(null); return; }
        const url = list[i++];
        gltfLoader.load(url,
          g => { g.scene.userData.assetUrl = url; finish(g.scene); },
          ev => { if(onProg && ev && ev.total) onProg(Math.min(1, ev.loaded / ev.total)); },
          next);
      };
      next();
      setTimeout(() => finish(null), 45000);
    });
  }

  function createWheelRig(){
    let items = [];
    const tmpQ = new THREE.Quaternion();

    function nameOf(o){ return (o.name || '').toLowerCase(); }
    function has(o, keys){ const n = nameOf(o); return keys.some(k => n.includes(k)); }

    function build(modelRoot){
      items = [];
      car.updateMatrixWorld(true);
      const carQ = new THREE.Quaternion(); car.getWorldQuaternion(carQ);
      const upWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(carQ);
      const axleWorld = new THREE.Vector3(1, 0, 0).applyQuaternion(carQ);

      const lower = {};
      modelRoot.traverse(o => { if(o.name) lower[o.name.toLowerCase()] = o; });
      const pick = n => lower[n] || null;
      let found = 0;
      let exactPivotOk = true;
      for(const key of ['fl', 'fr', 'rl', 'rr']){
        const spin = pick('wheel_' + key + '_spin');
        if(!spin) continue;
        const steer = pick('wheel_' + key + '_steer');
        const mesh = pick('wheel_' + key + '_mesh');
        let radius = .34;
        const meshCenter = new THREE.Vector3();
        if(mesh){
          const b = new THREE.Box3().setFromObject(mesh);
          b.getCenter(meshCenter);
          radius = Math.max(.12, b.getSize(new THREE.Vector3()).y / 2);
        } else {
          spin.getWorldPosition(meshCenter);
        }
        const spinCenter = new THREE.Vector3();
        spin.getWorldPosition(spinCenter);
        if(spinCenter.distanceTo(meshCenter) > radius * .45){
          exactPivotOk = false;
          break;
        }
        const invS = new THREE.Quaternion(); spin.getWorldQuaternion(invS).invert();
        const spinAxis = axleWorld.clone().applyQuaternion(invS).normalize();
        let steerAxis = null, baseQ = null;
        if(steer){
          const invP = new THREE.Quaternion(); steer.getWorldQuaternion(invP).invert();
          steerAxis = upWorld.clone().applyQuaternion(invP).normalize();
          baseQ = steer.quaternion.clone();
        }
        items.push({pivot:steer, spinGroup:spin, steerAxis, spinAxis, baseQ, front:!!steer, radius});
        found++;
      }
      if(found && exactPivotOk){
        console.info('LotKing rig: struttura Car Wheel GLB Rigger riconosciuta (' + found + ' ruote)');
        return true;
      }
      if(found && !exactPivotOk){
        items = [];
        console.info('LotKing rig: pivot GLB non centrati, ricreo i pivot ruota dai mesh');
      }

      let namedFound = 0;
      for(const key of ['fl', 'fr', 'rl', 'rr']){
        const wheel = pick('wheel_' + key + '_mesh');
        if(!wheel) continue;
        const disc = pick('brakedisc_' + key + '_mesh') || pick('brake_disc_' + key + '_mesh') || pick('disc_' + key + '_mesh');
        const caliper = pick('brakecaliper_' + key + '_mesh') || pick('brake_caliper_' + key + '_mesh') || pick('caliper_' + key + '_mesh');
        const wbox = new THREE.Box3().setFromObject(wheel);
        const wpos = wbox.getCenter(new THREE.Vector3());
        const radius = Math.max(.15, wbox.getSize(new THREE.Vector3()).y / 2);
        const parent = wheel.parent;
        const pivot = new THREE.Group();
        pivot.name = 'LotKing_Wheel_' + key.toUpperCase() + '_pivot';
        parent.add(pivot);
        pivot.position.copy(parent.worldToLocal(wpos.clone()));
        pivot.updateMatrixWorld(true);
        const spinGroup = new THREE.Group();
        spinGroup.name = 'LotKing_Wheel_' + key.toUpperCase() + '_spin';
        pivot.add(spinGroup);
        spinGroup.updateMatrixWorld(true);
        spinGroup.attach(wheel);
        if(disc) spinGroup.attach(disc);
        if(caliper) pivot.attach(caliper);
        const invQ = new THREE.Quaternion(); pivot.getWorldQuaternion(invQ).invert();
        const steerAxis = upWorld.clone().applyQuaternion(invQ).normalize();
        const invQ2 = new THREE.Quaternion(); spinGroup.getWorldQuaternion(invQ2).invert();
        const spinAxis = axleWorld.clone().applyQuaternion(invQ2).normalize();
        const front = key === 'fl' || key === 'fr';
        items.push({pivot, spinGroup, steerAxis, spinAxis, baseQ:pivot.quaternion.clone(), front, radius});
        namedFound++;
      }
      if(namedFound >= 2){
        console.info('LotKing rig: ruote/dischi/pinze agganciati dai nomi mesh (' + namedFound + ' ruote)');
        return true;
      }
      items = [];

      const nodes = []; modelRoot.traverse(o => nodes.push(o));
      const wheelsN = nodes.filter(o => has(o, ['wheel', 'ruota', 'tire', 'tyre']) && !has(o, ['steer', 'spin', 'collider', 'arch', 'fender']));
      const discsN = nodes.filter(o => has(o, ['disc', 'disco', 'rotor']) && !has(o, ['caliper', 'pinza']));
      const calipersN = nodes.filter(o => has(o, ['caliper', 'pinza', 'brake_cal', 'freno']));
      const topWheels = wheelsN.filter(w => { let p = w.parent; while(p){ if(wheelsN.includes(p)) return false; p = p.parent; } return true; });
      if(topWheels.length < 2) return false;

      const wpos = new THREE.Vector3(), lpos = new THREE.Vector3();
      for(const w of topWheels){
        const wbox = new THREE.Box3().setFromObject(w);
        wbox.getCenter(wpos);
        lpos.copy(wpos); car.worldToLocal(lpos);
        const n = nameOf(w);
        let front;
        if(n.includes('front') || n.includes('ant') || /(^|[_.\-\s])f[lr]?([_.\-\s]|$)/.test(n)) front = true;
        else if(n.includes('rear') || n.includes('back') || n.includes('post') || /(^|[_.\-\s])r[lr]?([_.\-\s]|$)/.test(n)) front = false;
        else front = lpos.z > 0;
        const radius = Math.max(.15, wbox.getSize(new THREE.Vector3()).y / 2);
        const parent = w.parent;
        const pivot = new THREE.Group();
        parent.add(pivot);
        pivot.position.copy(parent.worldToLocal(wpos.clone()));
        pivot.updateMatrixWorld(true);
        const spinGroup = new THREE.Group();
        pivot.add(spinGroup);
        spinGroup.updateMatrixWorld(true);
        spinGroup.attach(w);
        const near = (arr, maxD) => {
          let best = null, bd = maxD;
          const p2 = new THREE.Vector3();
          for(const o of arr){ o.getWorldPosition(p2); const d = p2.distanceTo(wpos); if(d < bd){ bd = d; best = o; } }
          return best;
        };
        const disc = near(discsN, radius * 2.2);
        if(disc) spinGroup.attach(disc);
        const cal = near(calipersN, radius * 2.2);
        if(cal) pivot.attach(cal);
        const invQ = new THREE.Quaternion(); pivot.getWorldQuaternion(invQ).invert();
        const steerAxis = upWorld.clone().applyQuaternion(invQ).normalize();
        const invQ2 = new THREE.Quaternion(); spinGroup.getWorldQuaternion(invQ2).invert();
        const spinAxis = axleWorld.clone().applyQuaternion(invQ2).normalize();
        items.push({pivot, spinGroup, steerAxis, spinAxis, baseQ:pivot.quaternion.clone(), front, radius});
      }
      return items.length > 0;
    }

    function drive(vF, dt, steerAngle){
      for(const it of items){
        it.spinGroup.rotateOnAxis(it.spinAxis, vF * dt / it.radius);
        if(it.front && it.pivot) it.pivot.quaternion.copy(it.baseQ).multiply(tmpQ.setFromAxisAngle(it.steerAxis, steerAngle));
      }
    }

    return {
      build,
      drive,
      clear: () => { items = []; },
      active: () => items.length > 0,
    };
  }

  return {gltfLoader, prepModel, tryLoadModel, rig:createWheelRig()};
}

window.LK_RUNTIME_MODEL_ASSETS = Object.freeze({create});
})();
