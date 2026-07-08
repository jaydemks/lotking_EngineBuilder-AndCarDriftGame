/* =========================================================
   LOT KING - player model runtime module
   Assigns/replaces the player GLB model and owns drag/drop import.
   ========================================================= */
(function(){
'use strict';

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
    car.updateMatrixWorld(true);
    try {
      const ok = rig.build(model);
      if(!ok) console.warn('LotKing: nessun rig ruote riconosciuto — modello statico');
    } catch(err){
      rig.clear();
      console.warn('LotKing: errore nel rig ruote, modello usato senza rig', err);
    }
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
    bindDrop,
  };
}

window.LK_RUNTIME_PLAYER_MODEL = Object.freeze({create});
})();
