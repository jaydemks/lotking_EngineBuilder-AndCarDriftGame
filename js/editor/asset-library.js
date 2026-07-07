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
  const status = typeof opts.status === 'function' ? opts.status : () => {};
  const tr = (en, it) => window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en;

  function load(){
    try {
      const raw = localStorage.getItem(ASSET_LIBRARY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if(Array.isArray(parsed)) return parsed;
      return parsed && Array.isArray(parsed.assets) ? parsed.assets : [];
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
    return 'other';
  }

  function fileName(file){
    return (file.name || 'Asset').replace(/\.(glb|gltf|png|jpe?g|webp|gif|avif)$/i, '');
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
    const asset = {
      id: existing ? existing.id : ('asset_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)),
      key,
      kind,
      name: fileName(file),
      source: file.name,
      mime: file.type || (kind === 'texture' ? 'image/*' : ''),
      size: file.size || 0,
      src: info.src || null,
      dbKey: info.dbKey || null,
      rigged: kind === 'glb' ? !!(info.rigged || (existing && existing.rigged)) : false,
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
