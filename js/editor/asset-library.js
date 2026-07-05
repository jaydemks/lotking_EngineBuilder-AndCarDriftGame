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
      status('⚠ Asset library save failed: browser storage non disponibile');
      return false;
    }
  }

  function fileName(file){
    return (file.name || 'Asset').replace(/\.(glb|gltf)$/i, '');
  }

  function supportedFiles(files){
    return Array.from(files || []).filter(file => /\.(glb|gltf)$/i.test(file.name || ''));
  }

  function keyFromFile(file){
    return 'glb:' + fileName(file).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function dbKeyFromFile(file, key){
    return key + ':' + (file.size || 0) + ':' + (file.lastModified || Date.now());
  }

  function resolveUrl(asset){
    if(asset && asset.src) return Promise.resolve(asset.src);
    if(asset && asset.dbKey && window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(asset.dbKey);
    return Promise.reject(new Error('asset source missing'));
  }

  function upsert(file, data){
    const info = data || {};
    const list = load();
    const key = keyFromFile(file);
    const existing = list.find(a => a.key === key);
    const asset = {
      id: existing ? existing.id : ('asset_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)),
      key,
      kind: 'glb',
      name: fileName(file),
      source: file.name,
      size: file.size || 0,
      src: info.src || null,
      dbKey: info.dbKey || null,
      fit: 5,
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
      collide: !!asset.defaultCollider,
      asset: {key: asset.key, dbKey: asset.dbKey || null, name: asset.name, source: asset.source || 'Imported asset'},
      t: {p:[at.x, 0, at.z], r:[0,0,0], s:[1,1,1], v:true},
    };
  }

  return {
    load,
    save,
    fileName,
    supportedFiles,
    keyFromFile,
    dbKeyFromFile,
    resolveUrl,
    upsert,
    createGlbEntry,
  };
}

window.LK_EDITOR_ASSET_LIBRARY = Object.freeze({create});
})();
