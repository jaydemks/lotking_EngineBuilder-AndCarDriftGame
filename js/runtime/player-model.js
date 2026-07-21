/* =========================================================
   LOT KING - player model runtime module
   Assigns/replaces the player GLB model and owns drag/drop import.
   ========================================================= */
(function(){
'use strict';

const originalNormals = new WeakMap();
const originalFlatShading = new WeakMap();

function normalizeShadingMode(value){
  value = String(value || 'original').toLowerCase();
  return value === 'smooth' || value === 'flat' ? value : 'original';
}

function smoothGeometryNormals(geometry, THREE){
  const position = geometry && geometry.getAttribute && geometry.getAttribute('position');
  if(!position || position.count < 3 || !THREE || !THREE.BufferAttribute) return false;
  if(!originalNormals.has(geometry)) originalNormals.set(geometry, geometry.getAttribute('normal') ? geometry.getAttribute('normal').clone() : null);
  const index = geometry.getIndex && geometry.getIndex();
  const count = index ? index.count : position.count;
  const sums = new Map();
  const keyAt = i => Math.round(position.getX(i) * 100000) + ',' + Math.round(position.getY(i) * 100000) + ',' + Math.round(position.getZ(i) * 100000);
  const add = (key, x, y, z) => {
    const sum = sums.get(key);
    if(sum){ sum[0] += x; sum[1] += y; sum[2] += z; }
    else sums.set(key, [x,y,z]);
  };
  for(let i = 0; i + 2 < count; i += 3){
    const ia = index ? index.getX(i) : i;
    const ib = index ? index.getX(i + 1) : i + 1;
    const ic = index ? index.getX(i + 2) : i + 2;
    const ax = position.getX(ia), ay = position.getY(ia), az = position.getZ(ia);
    const abx = position.getX(ib) - ax, aby = position.getY(ib) - ay, abz = position.getZ(ib) - az;
    const acx = position.getX(ic) - ax, acy = position.getY(ic) - ay, acz = position.getZ(ic) - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    add(keyAt(ia), nx, ny, nz);
    add(keyAt(ib), nx, ny, nz);
    add(keyAt(ic), nx, ny, nz);
  }
  const normals = new Float32Array(position.count * 3);
  for(let i = 0; i < position.count; i++){
    const sum = sums.get(keyAt(i)) || [0,1,0];
    const length = Math.hypot(sum[0], sum[1], sum[2]) || 1;
    normals[i*3] = sum[0] / length;
    normals[i*3+1] = sum[1] / length;
    normals[i*3+2] = sum[2] / length;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.getAttribute('normal').needsUpdate = true;
  return true;
}

function restoreGeometryNormals(geometry){
  if(!geometry || !originalNormals.has(geometry)) return;
  const original = originalNormals.get(geometry);
  if(original) geometry.setAttribute('normal', original.clone());
  else if(geometry.deleteAttribute) geometry.deleteAttribute('normal');
}

function applyModelShading(root, value, THREERef){
  const mode = normalizeShadingMode(value);
  const THREE = THREERef || (typeof window !== 'undefined' ? window.THREE : null);
  if(!root || !root.traverse) return mode;
  const geometries = new Set();
  root.traverse(node => {
    if(!node || !node.isMesh || !node.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    const shaded = materials.filter(material => material && 'flatShading' in material);
    if(!shaded.length) return;
    shaded.forEach(material => {
      if(!originalFlatShading.has(material)) originalFlatShading.set(material, material.flatShading === true);
      material.flatShading = mode === 'original' ? originalFlatShading.get(material) : mode === 'flat';
      material.needsUpdate = true;
    });
    if(node.geometry) geometries.add(node.geometry);
  });
  geometries.forEach(geometry => {
    if(mode === 'smooth') smoothGeometryNormals(geometry, THREE);
    else if(mode === 'original') restoreGeometryNormals(geometry);
  });
  return mode;
}

function create(options){
  const opts = options || {};
  const modelAssets = opts.modelAssets;
  const rig = modelAssets.rig;
  const car = opts.car;
  const carVisual = opts.carVisual;
  const gltfLoader = modelAssets.gltfLoader;
  const modelSize = opts.modelSize || {playerLen: 5.6};
  const canDropReplace = typeof opts.canDropReplace === 'function' ? opts.canDropReplace : () => true;
  let playerModel = null;
  let modelShading = normalizeShadingMode(car && car.userData && car.userData.modelShading);

  function prepModel(root, targetLen, byHeight){
    return modelAssets.prepModel(root, targetLen, byHeight);
  }

  function setPlayerModel(sceneRoot){
    rig.clear();
    const model = prepModel(sceneRoot, modelSize.playerLen, false);
    if(playerModel) car.remove(playerModel);
    playerModel = model;
    carVisual.visible = false;
    car.add(model);
    applyModelShading(model, modelShading, window.THREE);
    car.updateMatrixWorld(true);
    try {
      const ok = rig.build(model);
      if(!ok) console.warn('LotKing: nessun rig ruote riconosciuto — modello statico');
    } catch(err){
      rig.clear();
      console.warn('LotKing: errore nel rig ruote, modello usato senza rig', err);
    }
  }

  function setModelShading(value){
    modelShading = normalizeShadingMode(value);
    if(car && car.userData) car.userData.modelShading = modelShading;
    applyModelShading(playerModel || carVisual, modelShading, window.THREE);
    return modelShading;
  }

  function bindDrop(target){
    const t = target || window;
    t.addEventListener('dragover', e => {
      if(!canDropReplace()) return;
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      const hasFileDrag = e.dataTransfer && e.dataTransfer.items && Array.from(e.dataTransfer.items).some(item => item.kind === 'file');
      if((file && /\.(glb|gltf)$/i.test(file.name)) || hasFileDrag) e.preventDefault();
    });
    t.addEventListener('drop', e => {
      if(!canDropReplace()) return;
      e.preventDefault();
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if(!file || !gltfLoader || !/\.(glb|gltf)$/i.test(file.name)) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          gltfLoader.parse(reader.result, '', gltf => {
            setPlayerModel(gltf.scene);
            if(opts.popup) opts.popup('CAR MODEL LOADED', '#7CFC9A');
          }, () => {
            if(opts.popup) opts.popup('MODEL FAILED TO LOAD', '#ff5566');
          });
        } catch(err){
          if(opts.popup) opts.popup('MODEL FAILED TO LOAD', '#ff5566');
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  return {
    prepModel,
    setPlayerModel,
    getPlayerModel: () => playerModel,
    setModelShading,
    getModelShading: () => modelShading,
    bindDrop,
  };
}

window.LK_RUNTIME_PLAYER_MODEL = Object.freeze({create, applyModelShading, normalizeShadingMode});
})();
