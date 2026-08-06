/* =========================================================
   LOT KING editor imported asset library
   Local metadata for imported GLB/GLTF assets.
   Blob storage itself is delegated to window.LK_ASSET_BLOBS.
   ========================================================= */
(function(){
'use strict';

const ASSET_LIBRARY_KEY = 'lotking.assetLibrary.v1';

function create(opts){
  opts = opts || {};
  const store = opts.store;
  const pluginManager = opts.pluginManager || null;
  const status = typeof opts.status === 'function' ? opts.status : () => {};
  const tr = (en, it) => window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en;

  function load(){
    try {
      const raw = localStorage.getItem(ASSET_LIBRARY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const assets=Array.isArray(parsed)?parsed:(parsed&&Array.isArray(parsed.assets)?parsed.assets:[]);
      // Everything persisted in this library was imported/created by the
      // project author. Old v1 entries predate provenance, so migrate them in
      // memory instead of ever mistaking them for shipped engine content.
      return assets.map(asset=>Object.assign({},asset,{assetOrigin:'user'}));
    } catch(err){ console.warn('LotKing editor: asset library corrupta', err); return []; }
  }

  function save(list){
    try {
      localStorage.setItem(ASSET_LIBRARY_KEY, JSON.stringify({version:1, assets:list}));
      return true;
    } catch(err){
      status(tr('⚠ Asset library save failed: browser storage unavailable', '⚠ Asset library save failed: browser storage non disponibile'));
      return false;
    }
  }

  function assetKindFromFile(file){
    const name = String(file && file.name || '').toLowerCase();
    const type = String(file && file.type || '').toLowerCase();
    if(/\.(glb|gltf)$/i.test(name)) return 'glb';
    if(/^image\//.test(type) || /\.(png|jpe?g|webp|gif|avif)$/i.test(name)) return 'texture';
    const importers = pluginManager && pluginManager.extensions ? pluginManager.extensions('assetImporter') : [];
    const importer = importers.find(item => typeof item.accepts === 'function' && item.accepts(file));
    if(importer) return importer.type || 'plugin-asset';
    return 'other';
  }

  function fileName(file){
    return (file.name || 'Asset').replace(/\.(fbx|glb|gltf|png|jpe?g|webp|gif|avif)$/i, '');
  }

  function supportedFiles(files){
    return Array.from(files || []).filter(file => assetKindFromFile(file) !== 'other');
  }

  function keyFromFile(file){
    const kind = assetKindFromFile(file);
    return kind + ':' + fileName(file).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function dbKeyFromFile(file, key){
    return key + ':' + (file.size || 0) + ':' + (file.lastModified || Date.now());
  }

  function resolveUrl(asset){
    if(asset && asset.src) return Promise.resolve(asset.src);
    if(asset && asset.dbKey && window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(asset.dbKey);
    return Promise.reject(new Error('asset source missing'));
  }

  function defaultColliderForAsset(asset){
    if(asset && asset.defaultCollider != null) return !!asset.defaultCollider;
    const text = ((asset && (asset.name || asset.source || asset.key)) || '').toLowerCase();
    if(/\b(map|track|level|ground|floor|road|asphalt|parking[- ]?lot|terrain)\b/.test(text)) return false;
    return true;
  }

  function upsert(file, data){
    const info = data || {};
    const list = load();
    const key = keyFromFile(file);
    const existing = list.find(a => a.key === key);
    const kind = assetKindFromFile(file);
    const has = key => Object.prototype.hasOwnProperty.call(info, key);
    const asset = {
      id: existing ? existing.id : ('asset_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)),
      assetOrigin:'user',
      key,
      kind,
      name: fileName(file),
      source: file.__lkImportSource || file.name,
      sourceFormat: file.__lkSourceFormat || (existing && existing.sourceFormat) || kind,
      sourceDbKey:info.sourceDbKey || (existing && existing.sourceDbKey) || null,
      sourceSrc:info.sourceSrc || (existing && existing.sourceSrc) || null,
      sourceName:info.sourceName || (existing && existing.sourceName) || null,
      sourceSize:Number(info.sourceSize != null ? info.sourceSize : (existing && existing.sourceSize)) || 0,
      sourceLastModified:Number(info.sourceLastModified != null ? info.sourceLastModified : (existing && existing.sourceLastModified)) || 0,
      sourceCheckedAt:info.sourceCheckedAt || (existing && existing.sourceCheckedAt) || null,
      sourceChangedAt:info.sourceChangedAt || (existing && existing.sourceChangedAt) || null,
      sourceDependencies:Array.isArray(info.sourceDependencies) ? info.sourceDependencies.slice() : (existing && Array.isArray(existing.sourceDependencies) ? existing.sourceDependencies.slice() : []),
      compileState:file.__lkSourceFormat === 'fbx' ? 'ready' : (existing && existing.compileState || null),
      compiledAt:file.__lkSourceFormat === 'fbx' ? new Date().toISOString() : (existing && existing.compiledAt || null),
      conversionWarnings:Array.isArray(file.__lkConversionWarnings) ? file.__lkConversionWarnings.slice() : (existing && existing.conversionWarnings || []),
      mime: file.type || (kind === 'texture' ? 'image/*' : ''),
      size: file.size || 0,
      src: info.src || null,
      dbKey: info.dbKey || null,
      rigged: kind === 'glb' ? (has('rigged') ? !!info.rigged : !!(existing && existing.rigged)) : false,
      vehicleRigged:kind === 'glb' ? (has('vehicleRigged') ? !!info.vehicleRigged : !!(existing && existing.vehicleRigged)) : undefined,
      skeletonRigged:kind === 'glb' ? (has('skeletonRigged') ? !!info.skeletonRigged : !!(existing && existing.skeletonRigged)) : undefined,
      rigType:kind === 'glb' ? String(has('rigType') ? info.rigType : (existing && existing.rigType) || 'static') : undefined,
      vehicleWheelCount:kind === 'glb' ? Number(has('vehicleWheelCount') ? info.vehicleWheelCount : (existing && existing.vehicleWheelCount)) || 0 : undefined,
      usedAsPlayerModel: kind === 'glb' ? !!(info.usedAsPlayerModel || (existing && existing.usedAsPlayerModel)) : undefined,
      usedAsSoccerPawnModel: kind === 'glb' ? !!(info.usedAsSoccerPawnModel || (existing && existing.usedAsSoccerPawnModel)) : undefined,
      clips: kind === 'glb' && Array.isArray(info.clips) ? info.clips.slice() : (existing && Array.isArray(existing.clips) ? existing.clips.slice() : undefined),
      clipCount: kind === 'glb' ? Number(info.clipCount != null ? info.clipCount : (existing && existing.clipCount)) || 0 : undefined,
      hasAnimations: kind === 'glb' ? (has('hasAnimations') ? !!info.hasAnimations : !!(existing && existing.hasAnimations)) : undefined,
      skinnedMeshCount: kind === 'glb' ? Number(info.skinnedMeshCount != null ? info.skinnedMeshCount : (existing && existing.skinnedMeshCount)) || 0 : undefined,
      boneCount: kind === 'glb' ? Number(info.boneCount != null ? info.boneCount : (existing && existing.boneCount)) || 0 : undefined,
      boneNames:kind === 'glb' && Array.isArray(info.boneNames) ? info.boneNames.slice() : (existing && Array.isArray(existing.boneNames) ? existing.boneNames.slice() : undefined),
      skeletonSignature:kind === 'glb' ? String(info.skeletonSignature || (existing && existing.skeletonSignature) || '') : undefined,
      meshCount: kind === 'glb' ? Number(info.meshCount != null ? info.meshCount : (existing && existing.meshCount)) || 0 : undefined,
      fit: kind === 'glb' ? 5 : undefined,
      importedAt: new Date().toISOString(),
    };
    if(existing) Object.assign(existing, asset);
    else list.push(asset);
    return save(list) ? asset : null;
  }

  function createGlbEntry(asset, at){
    const id = store.nextId();
    return {
      id,
      kind: 'glb',
      src: asset.src || null,
      dbKey: asset.dbKey || null,
      fit: asset.fit || 5,
      name: asset.name,
      collide: defaultColliderForAsset(asset),
      asset: {key: asset.key, dbKey: asset.dbKey || null, name: asset.name, source: asset.source || 'Imported asset'},
      t: {p:[at.x, 0, at.z], r:[0,0,0], s:[1,1,1], v:true},
    };
  }

  function createTextureEntry(asset, at){
    const id = store.nextId();
    return {
      id,
      kind: 'texture',
      name: asset.name || 'Free Texture',
      collide:false,
      props:{
        mode:'decal',
        src: asset.src || null,
        dbKey: asset.dbKey || null,
        asset:{key: asset.key, dbKey: asset.dbKey || null, name: asset.name, source: asset.source || 'Imported texture'},
        width:2,
        height:2,
        opacity:1,
        color:0xffffff,
        alphaTest:.01,
        blending:'normal',
        depthBias:.012,
        doubleSide:true,
        animated:/\.gif$/i.test(asset.source || '') || /gif/i.test(asset.mime || ''),
        materialModel:'unlit',
        roughness:.65,
        metalness:0,
        specular:.35,
        emissive:0x000000,
        emissiveIntensity:0,
        surfaceInfluence:0,
        surfaceProbeDistance:1.5,
        surfaceReceiverId:null,
        surfaceReceiverName:'',
      },
      asset:{key: asset.key, dbKey: asset.dbKey || null, name: asset.name, source: asset.source || 'Imported texture'},
      t:{p:[at.x, .025, at.z], r:[-Math.PI/2,0,0], s:[1,1,1], v:true},
    };
  }

  return {
    load,
    save,
    assetKindFromFile,
    fileName,
    supportedFiles,
    keyFromFile,
    dbKeyFromFile,
    resolveUrl,
    upsert,
    createGlbEntry,
    createTextureEntry,
  };
}

window.LK_EDITOR_ASSET_LIBRARY = Object.freeze({create});
})();
