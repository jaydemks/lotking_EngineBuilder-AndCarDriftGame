/* =========================================================
   LOT KING — EDITOR ASSET IMPORTS
   GLB/GLTF import, placement, deletion, and replacement flows.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const THREE = deps.THREE || window.THREE;
  const status = deps.status || function(){};
  const setAssetLoading = deps.setAssetLoading || function(){};
  const confirmEditorAction = deps.confirmEditorAction || function(){ return Promise.resolve(false); };
  const refreshAssetsPanel = deps.refreshAssetsPanel || function(){};
  const finishAdd = deps.finishAdd || function(){};
  const spawnPointAhead = deps.spawnPointAhead || function(){ return null; };
  const performDeleteEntity = deps.performDeleteEntity || function(){};
  const assetLibraryLoad = deps.assetLibraryLoad || function(){ return []; };
  const assetLibrarySave = deps.assetLibrarySave || function(){ return false; };
  const supportedAssetFiles = deps.supportedAssetFiles || function(){ return []; };
  const assetKeyFromFile = deps.assetKeyFromFile || function(file){ return file && file.name || 'asset'; };
  const assetDbKeyFromFile = deps.assetDbKeyFromFile || function(file, key){ return key || (file && file.name) || 'asset'; };
  const resolveImportedAssetUrl = deps.resolveImportedAssetUrl || function(asset){ return Promise.resolve(asset && asset.src); };
  const upsertImportedAsset = deps.upsertImportedAsset || function(){ return null; };
  const createGlbEntryFromAsset = deps.createGlbEntryFromAsset || function(){ return {}; };
  const createTextureEntryFromAsset = deps.createTextureEntryFromAsset || function(){ return {}; };
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  function entityPhysicsMass(target){
    const stored = target && target.userData ? Number(target.userData.physicsMass) : NaN;
    if(Number.isFinite(stored) && stored > 0) return stored;
    const colliderMass = target && target.userData && target.userData.collider && target.userData.collider.ref && target.userData.collider.ref.mass;
    const coll = Number(colliderMass);
    return Number.isFinite(coll) && coll > 0 ? coll : null;
  }

  function readFileAsDataURL(f){
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error(tr('file read failed', 'lettura file fallita')));
      r.readAsDataURL(f);
    });
  }
  function hasExternalFileDrag(e){
    const dt = e.dataTransfer;
    if(!dt) return false;
    if(dt.files && supportedAssetFiles(dt.files).length) return true;
    if(dt.items && Array.from(dt.items).some(item => item.kind === 'file')) return true;
    return false;
  }
  function registerImportedObject(asset, obj, at){
    const entry = createGlbEntryFromAsset(asset, at || spawnPointAhead());
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = asset.key;
    obj.userData.assetName = asset.name;
    obj.userData.assetSource = asset.source || 'Imported asset';
    finishAdd(obj);
    return obj;
  }
  function registerImportedTexture(asset, at){
    const entry = createTextureEntryFromAsset(asset, at || spawnPointAhead());
    const obj = STORE.createTexture(entry.textureKind || 'decal', entry.props || {});
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = asset.key;
    obj.userData.assetName = asset.name;
    obj.userData.assetSource = asset.source || 'Imported texture';
    finishAdd(obj);
    return obj;
  }
  function textureAssetPatch(asset){
    if(!asset) return null;
    return {
      src:asset.src || null,
      dbKey:asset.dbKey || null,
      asset:{key:asset.key, dbKey:asset.dbKey || null, name:asset.name, source:asset.source || 'Imported texture'},
      animated:/\.gif$/i.test(asset.source || '') || /gif/i.test(asset.mime || ''),
    };
  }
  function targetTextureSize(target){
    if(!target) return {width:2, height:2};
    try {
      const box = new THREE.Box3().setFromObject(target);
      const size = box.getSize(new THREE.Vector3());
      return {width:Math.max(.25, Math.max(size.x, size.z) || 2), height:Math.max(.25, size.y || size.z || size.x || 2)};
    } catch(err){
      return {width:2, height:2};
    }
  }
  function replaceTextureObjectWithAsset(asset, target){
    if(!asset || !target) return;
    const patch = textureAssetPatch(asset);
    if(!patch) return;
    if(target.userData && target.userData.editorType === 'texture'){
      const props = Object.assign({}, target.userData.textureProps || {}, patch);
      target.userData.textureProps = props;
      if(target.userData.addedEntry){
        target.userData.addedEntry.props = Object.assign({}, props);
        target.userData.addedEntry.asset = Object.assign({}, patch.asset);
      }
      STORE.updateTextureObject(target);
      refreshAssetsPanel();
      status(tr('Texture replaced: ', 'Texture sostituita: ') + (asset.name || asset.source || 'asset'));
      return;
    }
    const at = target.position || spawnPointAhead();
    const entry = createTextureEntryFromAsset(asset, at);
    const size = targetTextureSize(target);
    entry.props = Object.assign({}, entry.props || {}, patch, size);
    entry.t = STORE.tOf(target);
    entry.kind = 'texture';
    entry.textureKind = entry.props.mode === 'image' ? 'image' : 'decal';
    const obj = STORE.createTexture(entry.textureKind || 'decal', entry.props || {});
    obj.position.copy(target.position);
    obj.rotation.copy(target.rotation);
    obj.scale.copy(target.scale);
    performDeleteEntity(target);
    STORE.registerAdded(GAME, obj, entry);
    finishAdd(obj);
    refreshAssetsPanel();
    status(tr('Replaced with texture: ', 'Sostituito con texture: ') + (asset.name || asset.source || 'asset'));
  }
  function replaceTextureObjectWithFile(target, file){
    if(!target || !file) return;
    importTextureFile(file).then(asset => {
      if(asset) replaceTextureObjectWithAsset(asset, target);
    }).catch(err => status(tr('Texture replacement failed: ', 'Sostituzione texture fallita: ') + err.message));
  }
  function placeImportedAsset(asset, at){
    if(!asset) return Promise.reject(new Error(tr('invalid asset', 'asset non valido')));
    if(asset.kind === 'texture') return Promise.resolve(registerImportedTexture(asset, at));
    return resolveImportedAssetUrl(asset)
      .then(src => STORE.loadGlb(src, asset.fit || 5))
      .then(obj => registerImportedObject(asset, obj, at));
  }
  function deleteImportedAsset(asset){
    if(!asset) return;
    confirmEditorAction({
      title: tr('Delete imported asset?', 'Eliminare asset importato?'),
      message: tr('Remove "', 'Rimuovere "') + asset.name + tr('" from the imported asset library? Scene instances already placed will stay.', '" dalla libreria asset importati? Le istanze gia piazzate nella scena resteranno.'),
      okText: tr('Delete asset', 'Elimina asset'),
    }).then(ok => {
      if(!ok) return;
      const next = assetLibraryLoad().filter(a => a.id !== asset.id);
      if(assetLibrarySave(next)){
        if(asset.dbKey && window.LK_ASSET_BLOBS) window.LK_ASSET_BLOBS.remove(asset.dbKey).catch(()=>{});
        refreshAssetsPanel();
        status(tr('Asset removed from library', 'Asset rimosso dalla libreria'));
      }
    });
  }
  function markImportedAssetRigged(asset){
    if(!asset || !asset.id) return;
    const list = assetLibraryLoad();
    const found = list.find(a => a.id === asset.id || a.key === asset.key);
    if(!found) return;
    found.rigged = true;
    found.usedAsPlayerModel = true;
    found.playerModelAt = new Date().toISOString();
    assetLibrarySave(list);
  }
  function saveImportedBlob(file, dbKey){
    return window.LK_ASSET_BLOBS
      ? window.LK_ASSET_BLOBS.put(dbKey, file).then(() => ({dbKey})).catch(() => readFileAsDataURL(file).then(src => ({src})))
      : readFileAsDataURL(file).then(src => ({src}));
  }
  function importTextureFile(file, opts){
    const options = opts || {};
    const key = assetKeyFromFile(file);
    const dbKey = assetDbKeyFromFile(file, key);
    return saveImportedBlob(file, dbKey).then(sourceInfo => {
      const asset = upsertImportedAsset(file, sourceInfo);
      if(asset && options.placePoint) registerImportedTexture(asset, options.placePoint);
      refreshAssetsPanel();
      status(tr('Texture imported: ', 'Texture importata: ') + (file.name || asset && asset.name || 'asset'));
      return asset;
    });
  }
  function importAssetFiles(files, opts){
    const list = supportedAssetFiles(files);
    const options = opts || {};
    if(!list.length){ status('Drop GLB/GLTF or image files to import assets'); return Promise.resolve([]); }
    if(options.placePoint && list.length !== 1){
      status('Viewport drop accepts one asset at a time');
      return Promise.resolve([]);
    }
    const imported = [];
    const total = list.length;
    setAssetLoading(true, total > 1 ? total + ' assets' : list[0].name, 3, 'Preparing import queue');
    let chain = Promise.resolve();
    list.forEach((file, index) => {
      chain = chain.then(() => {
        const basePct = Math.round(index / total * 100);
        setAssetLoading(true, file.name, basePct, 'Reading file ' + (index + 1) + ' of ' + total);
        const key = assetKeyFromFile(file);
        const dbKey = assetDbKeyFromFile(file, key);
        if(/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name || '') || /^image\//i.test(file.type || '')){
          setAssetLoading(true, file.name, basePct + Math.round(35 / total), 'Saving texture blob');
          return saveImportedBlob(file, dbKey).then(sourceInfo => {
            const asset = upsertImportedAsset(file, sourceInfo);
            if(asset) imported.push(asset);
            if(options.placePoint && asset){
              setAssetLoading(true, file.name, 86, 'Spawning texture/decal');
              registerImportedTexture(asset, options.placePoint);
            }
          }).then(() => {
            setAssetLoading(true, file.name, Math.round((index + 1) / total * 100), 'Imported');
          });
        }
        const objectUrl = URL.createObjectURL(file);
        return STORE.loadGlb(objectUrl, 5).then(obj => {
          setAssetLoading(true, file.name, basePct + Math.round(42 / total), 'Saving asset blob');
          return saveImportedBlob(file, dbKey).then(sourceInfo => {
            const asset = upsertImportedAsset(file, sourceInfo);
            if(asset) imported.push(asset);
            setAssetLoading(true, file.name, Math.round((index + .75) / total * 100), 'Registering asset');
            if(options.placePoint && asset){
              setAssetLoading(true, file.name, 86, 'Spawning in viewport');
              registerImportedObject(asset, obj, options.placePoint);
              return null;
            }
            return null;
          });
        }).then(() => {
          URL.revokeObjectURL(objectUrl);
          setAssetLoading(true, file.name, Math.round((index + 1) / total * 100), 'Imported');
        }).catch(err => {
          URL.revokeObjectURL(objectUrl);
          throw err;
        });
      });
    });
    return chain.then(() => {
      setAssetLoading(true, 'Asset import complete', 100, imported.length + ' asset' + (imported.length === 1 ? '' : 's') + ' imported');
      refreshAssetsPanel();
      setTimeout(() => setAssetLoading(false), 450);
      status(imported.length + (GAME && GAME.i18n && GAME.i18n.lang === 'it'
        ? (imported.length === 1 ? ' asset importato' : ' asset importati')
        : (' asset' + (imported.length === 1 ? '' : 's') + ' imported')));
      return imported;
    }).catch(err => {
      setAssetLoading(false);
      status('Asset import failed: ' + err.message);
      return imported;
    });
  }
  function replaceSelectedWithAsset(asset, targetOverride){
    const target = targetOverride || deps.selected && deps.selected();
    if(!asset || !target){
      status('Select a scene object to replace');
      return;
    }
    if(target.userData.editorType === 'player'){
      replacePlayerModelWithAsset(asset);
      return;
    }
    setAssetLoading(true, asset.name, 20, 'Loading replacement');
    resolveImportedAssetUrl(asset).then(src => STORE.loadGlb(src, asset.fit || 5)).then(obj => {
      const at = target.position.clone();
      obj.position.copy(target.position);
      obj.rotation.copy(target.rotation);
      obj.scale.copy(target.scale);
      const entry = createGlbEntryFromAsset(asset, at);
      entry.t = STORE.tOf(obj);
      entry.collide = !!target.userData.collider;
      entry.physics = !!(target.userData.physicsEnabled || (target.userData.collider && target.userData.collider.ref && target.userData.collider.ref.physics));
      entry.physicsMass = entityPhysicsMass(target);
      performDeleteEntity(target);
      STORE.registerAdded(GAME, obj, entry);
      finishAdd(obj);
      setAssetLoading(true, asset.name, 100, 'Replacement complete');
      setTimeout(() => setAssetLoading(false), 300);
    }).catch(err => {
      setAssetLoading(false);
      status('Replace failed: ' + err.message);
    });
  }
  function replaceObjectWithFile(target, file){
    if(!target || !file) return;
    if(target.userData && target.userData.editorType === 'player'){
      replacePlayerModelWithFile(file);
      return;
    }
    setAssetLoading(true, file.name, 12, 'Importing replacement');
    readFileAsDataURL(file).then(src => STORE.loadGlb(src, 5).then(obj => {
      const asset = upsertImportedAsset(file, {src});
      const id = STORE.nextId();
      const entry = {
        id, kind:'glb', src, fit:5,
        name:file.name.replace(/\.(glb|gltf)$/i,''),
        collide:!!target.userData.collider,
        physics: !!(target.userData.physicsEnabled || (target.userData.collider && target.userData.collider.ref && target.userData.collider.ref.physics)),
        physicsMass: entityPhysicsMass(target),
        asset: asset ? {key:asset.key, name:asset.name, source:asset.source} : undefined,
      };
      obj.position.copy(target.position);
      obj.rotation.copy(target.rotation);
      obj.scale.copy(target.scale);
      entry.t = STORE.tOf(obj);
      performDeleteEntity(target);
      STORE.registerAdded(GAME, obj, entry);
      finishAdd(obj);
      if(asset) refreshAssetsPanel();
      setAssetLoading(true, file.name, 100, 'Replacement complete');
      setTimeout(() => setAssetLoading(false), 300);
      status(tr('Replaced with ', 'Sostituito con ') + file.name);
    })).catch(err => {
      setAssetLoading(false);
      status(tr('Replacement failed: ', 'Sostituzione fallita: ') + err.message);
    });
  }

  function applyPlayerModelSource(src, label, meta){
    const info = meta || {};
    return STORE.loadGlbRaw(src).then(sceneRoot => {
      GAME.player.setModel(sceneRoot);
      GAME.player.car.userData.modelSrc = info.modelSrc || src;
      GAME.player.car.userData.modelDbKey = info.modelDbKey || null;
      GAME.player.car.userData.modelName = label || null;
      GAME.player.car.userData.assetName = label || GAME.player.car.userData.assetName;
      GAME.player.car.userData.assetSource = label || GAME.player.car.userData.assetSource;
      refreshAssetsPanel();
      status(tr('Player model replaced', 'Modello player sostituito') + (label ? ': ' + label : ''));
      return sceneRoot;
    });
  }

  function replacePlayerModelWithAsset(asset){
    if(!asset){ status(tr('Invalid player asset', 'Asset player non valido')); return; }
    setAssetLoading(true, asset.name || 'Player model', 20, 'Loading player model');
    resolveImportedAssetUrl(asset).then(src => {
      setAssetLoading(true, asset.name || 'Player model', 72, 'Applying player model');
      markImportedAssetRigged(asset);
      return applyPlayerModelSource(src, asset.name || asset.source || 'imported player model', {
        modelSrc: asset.src || null,
        modelDbKey: asset.dbKey || null,
      });
    }).then(() => {
      setAssetLoading(true, asset.name || 'Player model', 100, 'Player model replaced');
      setTimeout(() => setAssetLoading(false), 300);
    }).catch(err => {
      setAssetLoading(false);
      status('Player model replace failed: ' + err.message);
    });
  }

  function replacePlayerModelWithFile(file){
    if(!file){ status(tr('Invalid player file', 'File player non valido')); return; }
    setAssetLoading(true, file.name, 12, 'Importing player model');
    const key = assetKeyFromFile(file);
    const dbKey = assetDbKeyFromFile(file, key);
    const put = window.LK_ASSET_BLOBS
      ? window.LK_ASSET_BLOBS.put(dbKey, file).then(() => ({dbKey})).catch(() => readFileAsDataURL(file).then(src => ({src})))
      : readFileAsDataURL(file).then(src => ({src}));
    put.then(sourceInfo => {
      const asset = upsertImportedAsset(file, sourceInfo);
      if(asset) markImportedAssetRigged(asset);
      const srcPromise = sourceInfo.dbKey && window.LK_ASSET_BLOBS
        ? window.LK_ASSET_BLOBS.getUrl(sourceInfo.dbKey)
        : Promise.resolve(sourceInfo.src);
      setAssetLoading(true, file.name, 72, 'Applying player model');
      return srcPromise.then(src => applyPlayerModelSource(src, file.name, {
        modelSrc: sourceInfo.src || null,
        modelDbKey: sourceInfo.dbKey || null,
      })).then(() => asset);
    }).then(asset => {
      if(asset) refreshAssetsPanel();
      setAssetLoading(true, file.name, 100, 'Player model replaced');
      setTimeout(() => setAssetLoading(false), 300);
    }).catch(err => {
      setAssetLoading(false);
      status('Player model replace failed: ' + err.message);
    });
  }

  return Object.freeze({
    readFileAsDataURL,
    hasExternalFileDrag,
    registerImportedObject,
    registerImportedTexture,
    placeImportedAsset,
    deleteImportedAsset,
    importTextureFile,
    importAssetFiles,
    replaceSelectedWithAsset,
    replaceObjectWithFile,
    replaceTextureObjectWithAsset,
    replaceTextureObjectWithFile,
    replacePlayerModelWithAsset,
    replacePlayerModelWithFile,
  });
}

window.LK_EDITOR_ASSET_IMPORTS = Object.freeze({create});
})();
