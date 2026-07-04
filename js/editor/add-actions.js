/* =========================================================
   LOT KING — EDITOR ADD / REPLACE ACTIONS
   Primitive/light/effect creation and GLB replacement inputs.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const $ = deps.$;
  const pushHistory = deps.pushHistory;
  const removeEntity = deps.removeEntity;
  const restoreEntity = deps.restoreEntity;
  const markDirty = deps.markDirty;
  const refreshOutliner = deps.refreshOutliner;
  const selectObject = deps.selectObject;
  const setTool = deps.setTool;
  const status = deps.status;
  const spawnPointAhead = deps.spawnPointAhead;
  const importAssetFiles = deps.importAssetFiles;
  const replaceObjectWithFile = deps.replaceObjectWithFile;
  const readFileAsDataURL = deps.readFileAsDataURL;
  const buildInspector = deps.buildInspector;

  let pendingGlbPoint = null;
  let replaceTarget = null;

  function addPrimitive(prim, at){
    const id = STORE.nextId();
    const obj = STORE.createPrimitive(prim);
    const entry = {id, kind:'primitive', prim, name: prim[0].toUpperCase()+prim.slice(1), collide: prim !== 'plane',
      asset:{key:'primitive:' + prim, name:'Primitive ' + prim[0].toUpperCase() + prim.slice(1), source:'Editor primitive'},
      t:{p:[at.x, 0, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = 'primitive:' + prim;
    obj.userData.assetName = 'Primitive ' + prim[0].toUpperCase() + prim.slice(1);
    obj.userData.assetSource = 'Editor primitive';
    finishAdd(obj);
  }

  function addLight(kind, at){
    const id = STORE.nextId();
    const obj = STORE.createLight(kind);
    const y = obj.position.y;
    const entry = {id, kind:'light', light: kind, name: kind[0].toUpperCase()+kind.slice(1)+' Light', collide:false,
      asset:{key:'light:' + kind, name:kind[0].toUpperCase() + kind.slice(1) + ' Light', source:'Editor light'},
      t:{p:[at.x, y, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = 'light:' + kind;
    obj.userData.assetName = kind[0].toUpperCase() + kind.slice(1) + ' Light';
    obj.userData.assetSource = 'Editor light';
    finishAdd(obj);
  }

  function addEffect(kind, at){
    const id = STORE.nextId();
    const obj = STORE.createEmitter(kind);
    const entry = {id, kind:'effect', effect: kind, params: Object.assign({}, obj.userData.effectParams), name: 'FX ' + kind, collide:false,
      asset:{key:'effect:' + kind, name:'FX ' + kind, source:'Editor effect'},
      t:{p:[at.x, .3, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = 'effect:' + kind;
    obj.userData.assetName = 'FX ' + kind;
    obj.userData.assetSource = 'Editor effect';
    finishAdd(obj);
  }

  function finishAdd(obj){
    pushHistory({
      label: 'Add ' + (obj.userData.editorName || 'Entity'),
      undo: () => removeEntity(obj),
      redo: () => { restoreEntity(obj); selectObject(obj); },
    });
    markDirty(); refreshOutliner(); selectObject(obj);
    if(ED.tool === 'select') setTool('translate');
    status('Aggiunto: ' + obj.userData.editorName);
  }

  function openGlbImportAt(point){
    pendingGlbPoint = point || null;
    $('#lkGlbInput').click();
  }

  function beginReplaceObject(target){
    replaceTarget = target || null;
    $('#lkReplaceInput').click();
  }

  function bindInputs(){
    const glbInput = $('#lkGlbInput');
    if(glbInput){
      glbInput.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if(!f) return;
        const at = pendingGlbPoint || spawnPointAhead();
        pendingGlbPoint = null;
        importAssetFiles([f], {placePoint: at}).then(() => {
          if(f.size > 4.5e6) status('⚠ GLB grande (' + (f.size/1e6).toFixed(1) + ' MB): il salvataggio permanente può fallire');
        });
      });
    }

    const replaceInput = $('#lkReplaceInput');
    if(replaceInput){
      replaceInput.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if(!f || !replaceTarget) return;
        const target = replaceTarget; replaceTarget = null;
        replaceObjectWithFile(target, f);
      });
    }

    const playerInput = $('#lkPlayerModelInput');
    if(playerInput){
      playerInput.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if(!f) return;
        readFileAsDataURL(f).then(src => {
          new THREE.GLTFLoader().load(src, g => {
            GAME.player.setModel(g.scene);
            GAME.player.car.userData.modelSrc = src;
            markDirty(); buildInspector();
            status(f.size > 4.5e6 ? '⚠ Modello grande: il salvataggio permanente può fallire' : 'Modello player sostituito');
          }, undefined, () => status('Model loading failed'));
        });
      });
    }
  }

  bindInputs();

  return Object.freeze({addPrimitive, addLight, addEffect, finishAdd, openGlbImportAt, beginReplaceObject});
}

window.LK_EDITOR_ADD_ACTIONS = Object.freeze({create});
})();
