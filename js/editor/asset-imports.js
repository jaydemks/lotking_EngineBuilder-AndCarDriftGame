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
  const refreshOutliner = deps.refreshOutliner || function(){};
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
  const assetImporters = deps.assetImporters || function(){ return []; };
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
    extractEmbeddedLights(obj, entry);
    return obj;
  }
  function extractEmbeddedLights(obj, entry){
    if(!STORE.extractEmbeddedLights) return [];
    const lights = STORE.extractEmbeddedLights(GAME, obj, entry);
    if(lights.length){
      refreshOutliner();
      refreshAssetsPanel();
      status(lights.length + tr(lights.length === 1 ? ' embedded GLB light converted' : ' embedded GLB lights converted', lights.length === 1 ? ' luce GLB incorporata convertita' : ' luci GLB incorporate convertite'));
    }
    return lights;
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
  function deleteImportedAssets(assets){
    const unique=[];
    (assets||[]).forEach(asset=>{
      if(asset&&asset.id&&!unique.some(item=>item.id===asset.id))unique.push(asset);
    });
    if(!unique.length)return Promise.resolve(false);
    const count=unique.length,names=unique.slice(0,3).map(asset=>asset.name||asset.source||asset.id).join(', '),more=count>3?' +'+(count-3):'';
    return confirmEditorAction({
      title:count===1?tr('Delete imported asset?','Eliminare asset importato?'):tr('Delete selected imported assets?','Eliminare gli asset importati selezionati?'),
      message:count===1
        ?tr('Remove "','Rimuovere "')+names+tr('" and its stored source? Existing Pawn/project references may become unavailable after reload.','" e la relativa sorgente memorizzata? I riferimenti Pawn/progetto esistenti potrebbero non essere più disponibili dopo il reload.')
        :tr('Remove ','Rimuovere ')+count+tr(' assets and their stored sources? ',' asset e le relative sorgenti memorizzate? ')+names+more+tr('. Existing Pawn/project references may become unavailable after reload.','. I riferimenti Pawn/progetto esistenti potrebbero non essere più disponibili dopo il reload.'),
      okText:count===1?tr('Delete asset','Elimina asset'):tr('Delete selected','Elimina selezionati'),
    }).then(ok=>{
      if(!ok)return false;
      const ids=new Set(unique.map(asset=>asset.id));
      if(!assetLibrarySave(assetLibraryLoad().filter(asset=>!ids.has(asset.id))))return false;
      const blobKeys=new Set();
      unique.forEach(asset=>{
        if(asset.dbKey)blobKeys.add(asset.dbKey);
        if(asset.sourceDbKey)blobKeys.add(asset.sourceDbKey);
        (asset.sourceDependencies||[]).forEach(dependency=>{if(dependency&&dependency.dbKey)blobKeys.add(dependency.dbKey);});
      });
      const removals=window.LK_ASSET_BLOBS?Array.from(blobKeys).map(key=>window.LK_ASSET_BLOBS.remove(key)):[];
      return Promise.allSettled(removals).then(()=>{
        if(typeof deps.onImportedAssetsDeleted==='function')deps.onImportedAssetsDeleted(unique);
        refreshAssetsPanel();
        status(count===1?tr('Asset removed from library','Asset rimosso dalla libreria'):count+tr(' assets removed from library',' asset rimossi dalla libreria'));
        return true;
      });
    });
  }
  function deleteImportedAsset(asset){return deleteImportedAssets(asset?[asset]:[]);}
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
  function glbMetadataFromObject(obj){
    const clips = (obj && obj.animations || []).filter(Boolean).map(clip => clip.name || 'Animation');
    let meshCount = 0, skinnedMeshCount = 0, boneCount = 0;const boneNames=[];
    if(obj && obj.traverse) obj.traverse(node => {
      if(node && node.isMesh) meshCount++;
      if(node && node.isSkinnedMesh) skinnedMeshCount++;
      if(node && node.isBone){boneCount++;if(node.name)boneNames.push(String(node.name));}
    });
    return {
      clips,
      clipCount:clips.length,
      hasAnimations:clips.length > 0,
      meshCount,
      skinnedMeshCount,
      boneCount,
      boneNames:Array.from(new Set(boneNames)).sort(),
      skeletonSignature:Array.from(new Set(boneNames)).sort().join('|'),
      rigged:skinnedMeshCount > 0 || boneCount > 8 || clips.length > 0,
    };
  }
  function saveImportedBlob(file, dbKey){
    return window.LK_ASSET_BLOBS
      ? window.LK_ASSET_BLOBS.put(dbKey, file).then(() => ({dbKey})).catch(err => {
        if(file && file.size > 12 * 1024 * 1024) throw new Error(tr('IndexedDB could not store this large GLB; base64 fallback was stopped to protect page memory.', 'IndexedDB non ha potuto salvare questo GLB grande; il fallback base64 è stato fermato per proteggere la memoria della pagina.'));
        return readFileAsDataURL(file).then(src => ({src}));
      })
      : (file && file.size > 12 * 1024 * 1024
        ? Promise.reject(new Error(tr('IndexedDB asset storage is unavailable; large GLB base64 fallback was stopped to protect page memory.', 'Lo storage asset IndexedDB non è disponibile; il fallback base64 del GLB grande è stato fermato per proteggere la memoria della pagina.')))
        : readFileAsDataURL(file).then(src => ({src})));
  }
  function sourceBlobKey(file,prefix){
    const name=String(file&&file.webkitRelativePath||file&&file.name||'source').toLowerCase().replace(/[^a-z0-9._/-]+/g,'-');
    return String(prefix||'source')+':'+name+':'+(file&&file.size||0)+':'+(file&&file.lastModified||0);
  }
  function saveImportProvenance(file){
    const source=file&&file.__lkSourceFile;
    if(!source)return Promise.resolve({});
    const dependencies=Array.from(file.__lkSourceDependencies||[]);
    return saveImportedBlob(source,sourceBlobKey(source,'source:fbx')).then(sourceInfo=>{
      return Promise.all(dependencies.map(dependency=>saveImportedBlob(dependency,sourceBlobKey(dependency,'source:dependency')).then(info=>({
        name:dependency.name||'dependency',
        path:dependency.webkitRelativePath||dependency.name||'dependency',
        dbKey:info.dbKey||null,
        src:info.src||null,
      })))).then(savedDependencies=>({
        sourceDbKey:sourceInfo.dbKey||null,
        sourceSrc:sourceInfo.src||null,
        sourceName:source.name||null,
        sourceSize:Number(source.size)||0,
        sourceLastModified:Number(source.lastModified)||0,
        sourceCheckedAt:new Date().toISOString(),
        sourceDependencies:savedDependencies,
      }));
    });
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
    const options = opts || {};
    const rawList = Array.from(files || []);
    if(!options.__pluginPrepared){
      const importers = assetImporters().filter(importer => importer && typeof importer.prepare === 'function' &&
        rawList.some(file => typeof importer.accepts === 'function' && importer.accepts(file)));
      if(importers.length){
        const warnings = [];
        setAssetLoading(true, rawList.length === 1 ? rawList[0].name : rawList.length + ' source files', 2, 'Preparing plugin import');
        const context = {
          THREE,
          options,
          progress:(name, pct, step) => setAssetLoading(true, name, pct, step),
          warn:message => { if(message) warnings.push(message); },
        };
        let prepare = Promise.resolve(rawList);
        importers.forEach(importer => {
          prepare = prepare.then(current => importer.prepare(current, context));
        });
        return prepare.then(prepared => importAssetFiles(prepared, Object.assign({}, options, {__pluginPrepared:true})))
          .then(imported => {
            if(warnings.length) status(tr('Imported with warnings: ', 'Importato con avvisi: ') + warnings.join(' · '));
            return imported;
          })
          .catch(err => {
            setAssetLoading(false);
            status(tr('Plugin import failed: ', 'Import plugin fallito: ') + (err && err.message || err));
            return [];
          });
      }
      if(rawList.some(file => /\.fbx$/i.test(file && file.name || ''))){
        status(tr('Enable the FBX → GLB Importer plugin to import this source.', 'Attiva il plugin FBX → GLB Importer per importare questa sorgente.'));
        return Promise.resolve([]);
      }
    }
    const list = supportedAssetFiles(rawList);
    if(!list.length){ status('Drop FBX, GLB/GLTF or image files to import assets'); return Promise.resolve([]); }
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
          return Promise.all([saveImportedBlob(file, dbKey),saveImportProvenance(file)]).then(saved => {
            const sourceInfo=saved[0]||{},provenance=saved[1]||{};
            const asset = upsertImportedAsset(file, Object.assign({}, sourceInfo, provenance, glbMetadataFromObject(obj)));
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
  function setCompileState(asset,state,message){
    const list=assetLibraryLoad(),found=list.find(item=>item&&(item.id===asset.id||item.key===asset.key));
    if(!found)return;
    found.compileState=state;
    if(state==='ready')found.compiledAt=new Date().toISOString();
    if(message)found.conversionWarnings=[message];
    assetLibrarySave(list);
    Object.assign(asset,found);
    refreshAssetsPanel();
  }
  function rebuildImportedAsset(asset){
    if(!asset||asset.sourceFormat!=='fbx')return Promise.reject(new Error(tr('This asset has no rebuildable FBX source.','Questo asset non possiede una sorgente FBX ricompilabile.')));
    const importer=assetImporters().find(item=>item&&item.type==='fbx'&&typeof item.rebuild==='function');
    if(!importer)return Promise.reject(new Error(tr('Enable the FBX plugin to rebuild this asset.','Attiva il plugin FBX per ricompilare questo asset.')));
    setCompileState(asset,'building');
    setAssetLoading(true,asset.name||asset.source||'FBX',5,'Preparing FBX rebuild');
    const context={THREE,assetBlobs:window.LK_ASSET_BLOBS,progress:(name,pct,step)=>setAssetLoading(true,name,pct,step),warn:()=>{}};
    return Promise.resolve(importer.rebuild(asset,context)).then(file=>importAssetFiles([file],{__pluginPrepared:true})).then(imported=>{
      const result=(imported||[])[0];
      if(!result)throw new Error(tr('GLB build produced no asset.','La build GLB non ha prodotto alcun asset.'));
      setCompileState(result,'ready');
      status(tr('FBX runtime build ready: ','Build runtime FBX pronta: ')+(result.name||asset.name));
      return result;
    }).catch(error=>{
      setAssetLoading(false);setCompileState(asset,'failed',String(error&&error.message||error));
      status(tr('FBX rebuild failed: ','Ricompilazione FBX fallita: ')+String(error&&error.message||error));
      throw error;
    });
  }
  function refreshFbxSource(asset,file){
    if(!asset||asset.sourceFormat!=='fbx')return Promise.reject(new Error(tr('This asset has no linked FBX source.','Questo asset non possiede una sorgente FBX collegata.')));
    if(!file||!/\.fbx$/i.test(file.name||''))return Promise.reject(new Error(tr('Choose an FBX source file.','Scegli un file sorgente FBX.')));
    const oldSize=Number(asset.sourceSize)||0,oldModified=Number(asset.sourceLastModified)||0;
    const oldName=String(asset.sourceName||asset.source||'').toLowerCase();
    const changed=!oldSize||!oldModified||oldSize!==Number(file.size)||oldModified!==Number(file.lastModified)||oldName!==String(file.name||'').toLowerCase();
    return saveImportedBlob(file,sourceBlobKey(file,'source:fbx')).then(sourceInfo=>{
      const list=assetLibraryLoad(),found=list.find(item=>item&&(item.id===asset.id||item.key===asset.key));
      if(!found)throw new Error(tr('Asset library entry is missing.','La voce della libreria asset non è disponibile.'));
      found.source=file.name||found.source;found.sourceName=file.name||null;found.sourceSize=Number(file.size)||0;
      found.sourceLastModified=Number(file.lastModified)||0;found.sourceCheckedAt=new Date().toISOString();
      found.sourceDbKey=sourceInfo.dbKey||null;found.sourceSrc=sourceInfo.src||null;
      if(changed){found.compileState='stale';found.sourceChangedAt=found.sourceCheckedAt;}
      assetLibrarySave(list);Object.assign(asset,found);refreshAssetsPanel();
      status(changed?tr('FBX source changed. Rebuild the runtime GLB.','Sorgente FBX modificata. Ricostruisci il GLB runtime.'):tr('FBX source is unchanged.','La sorgente FBX non è cambiata.'));
      return {asset,changed};
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
      extractEmbeddedLights(obj, entry);
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
    const key = assetKeyFromFile(file);
    const dbKey = assetDbKeyFromFile(file, key);
    const objectUrl = URL.createObjectURL(file);
    Promise.all([STORE.loadGlb(objectUrl, 5), saveImportedBlob(file, dbKey)]).then(results => {
      const obj = results[0];
      const sourceInfo = results[1] || {};
      const asset = upsertImportedAsset(file, Object.assign({}, sourceInfo, glbMetadataFromObject(obj)));
      const id = STORE.nextId();
      const entry = {
        id, kind:'glb', src:sourceInfo.src || null, dbKey:sourceInfo.dbKey || null, fit:5,
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
      extractEmbeddedLights(obj, entry);
      if(asset) refreshAssetsPanel();
      setAssetLoading(true, file.name, 100, 'Replacement complete');
      setTimeout(() => setAssetLoading(false), 300);
      status(tr('Replaced with ', 'Sostituito con ') + file.name);
    }).catch(err => {
      setAssetLoading(false);
      status(tr('Replacement failed: ', 'Sostituzione fallita: ') + err.message);
    }).finally(() => {
      URL.revokeObjectURL(objectUrl);
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
    if(!asset){ status(tr('Invalid player asset', 'Asset player non valido')); return Promise.resolve(false); }
    setAssetLoading(true, asset.name || 'Player model', 20, 'Loading player model');
    return resolveImportedAssetUrl(asset).then(src => {
      setAssetLoading(true, asset.name || 'Player model', 72, 'Applying player model');
      markImportedAssetRigged(asset);
      return applyPlayerModelSource(src, asset.name || asset.source || 'imported player model', {
        modelSrc: asset.src || null,
        modelDbKey: asset.dbKey || null,
      });
    }).then(() => {
      setAssetLoading(true, asset.name || 'Player model', 100, 'Player model replaced');
      setTimeout(() => setAssetLoading(false), 300);
      return true;
    }).catch(err => {
      setAssetLoading(false);
      status('Player model replace failed: ' + err.message);
      return false;
    });
  }

  function replacePlayerModelWithFile(file){
    if(!file){ status(tr('Invalid player file', 'File player non valido')); return Promise.resolve(false); }
    setAssetLoading(true, file.name, 12, 'Importing player model');
    const key = assetKeyFromFile(file);
    const dbKey = assetDbKeyFromFile(file, key);
    const put = window.LK_ASSET_BLOBS
      ? window.LK_ASSET_BLOBS.put(dbKey, file).then(() => ({dbKey})).catch(() => readFileAsDataURL(file).then(src => ({src})))
      : readFileAsDataURL(file).then(src => ({src}));
    return put.then(sourceInfo => {
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
      return true;
    }).catch(err => {
      setAssetLoading(false);
      status('Player model replace failed: ' + err.message);
      return false;
    });
  }

  return Object.freeze({
    readFileAsDataURL,
    hasExternalFileDrag,
    registerImportedObject,
    registerImportedTexture,
    placeImportedAsset,
    deleteImportedAsset,
    deleteImportedAssets,
    importTextureFile,
    importAssetFiles,
    rebuildImportedAsset,
    refreshFbxSource,
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
