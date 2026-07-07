/* =========================================================
   LOT KING - PLAYABLE EXPORT ASSETS
   Resolves blob/db asset references into exportable data URLs.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const assetLibraryLoad = deps.assetLibraryLoad || function(){ return []; };
  const tr = (en, it) => window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en;

  function blobToDataUrl(blob){
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error(tr('asset base64 conversion failed', 'conversione asset in base64 fallita')));
      r.readAsDataURL(blob);
    });
  }

  async function blobUrlToDataUrl(url){
    const response = await fetch(url);
    if(!response.ok) throw new Error('blob non leggibile (' + response.status + ')');
    const blob = await response.blob();
    return blobToDataUrl(blob);
  }

  async function exportResolveAssetFromDbKey(dbKey, dbCache){
    if(!dbKey || !window.LK_ASSET_BLOBS) return null;
    if(dbCache && dbCache.has(dbKey)) return dbCache.get(dbKey);
    const blobUrl = await window.LK_ASSET_BLOBS.getUrl(dbKey);
    const dataUrl = await blobUrlToDataUrl(blobUrl);
    if(dbCache) dbCache.set(dbKey, dataUrl);
    return dataUrl;
  }

  function findAssetLibraryEntry(library, source){
    if(!Array.isArray(library) || !source || typeof source !== 'object') return null;
    const candidates = [
      source.key,
      source.id,
      source.dbKey,
      source.asset && source.asset.key,
      source.asset && source.asset.dbKey,
      source.asset && source.asset.id,
    ];
    for(const candidate of candidates){
      if(!candidate) continue;
      for(const item of library){
        if(!item) continue;
        if(item.key === candidate || item.id === candidate || item.dbKey === candidate || item.name === candidate) return item;
      }
    }
    return null;
  }

  async function normalizePlayableAssetRef(owner, prop, label, dbCache, library, warnings){
    if(!owner || !Object.prototype.hasOwnProperty.call(owner, prop)) return;
    const fallbackName = owner.name || owner.id || label || 'asset';
    const meta = {
      src: owner[prop],
      dbKey: owner.dbKey || (owner.asset && owner.asset.dbKey),
      key: owner.key || owner.id || (owner.asset && owner.asset.key),
    };
    if((!meta.src || /^blob:/i.test(meta.src)) && !meta.dbKey){
      const lib = findAssetLibraryEntry(library, meta);
      if(lib){
        if(lib.src && !/^blob:/i.test(lib.src)) meta.src = lib.src;
        if(lib.dbKey) meta.dbKey = lib.dbKey;
      }
    }
    if(typeof meta.src === 'string' && /^blob:/i.test(meta.src)){
      meta.dbKey = meta.dbKey || meta.src.slice(5);
      meta.src = null;
    }
    let resolved = meta.src || null;
    if(!resolved && meta.dbKey){
      try {
        resolved = await exportResolveAssetFromDbKey(meta.dbKey, dbCache);
      } catch(err) {
        warnings.push(tr('Error including asset ', 'Errore nell\'inclusione asset ') + fallbackName + ': ' + (err.message || tr('missing blob', 'blob mancante')));
        return;
      }
    }
    if(!resolved){
      if(typeof meta.src === 'string' && !/^blob:/i.test(meta.src)) return;
      warnings.push('Asset ' + fallbackName + tr(' not exportable: no recoverable source', ' non esportabile: nessuna sorgente recuperabile'));
      return;
    }
    owner[prop] = resolved;
    if(owner.dbKey) owner.dbKey = null;
    if(owner.asset && owner.asset.dbKey) owner.asset.dbKey = null;
  }

  async function normalizePlayableObjectBlobs(obj, prefix, dbCache, library, warnings, depth){
    if(!obj || typeof obj !== 'object') return;
    if((depth || 0) > 8) return;
    if(Array.isArray(obj)){
      for(let i = 0; i < obj.length; i++){
        if(obj[i] && typeof obj[i] === 'object'){
          await normalizePlayableObjectBlobs(obj[i], prefix + '[' + i + ']', dbCache, library, warnings, (depth || 0) + 1);
        }
      }
      return;
    }
    if(typeof obj.src === 'string' && /^blob:/i.test(obj.src)){
      await normalizePlayableAssetRef(obj, 'src', prefix + '.src', dbCache, library, warnings);
    }
    for(const key in obj){
      if(!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      if(!obj[key] || typeof obj[key] !== 'object') continue;
      await normalizePlayableObjectBlobs(obj[key], prefix + '.' + key, dbCache, library, warnings, (depth || 0) + 1);
    }
  }

  async function preparePlayableProject(project){
    const prepared = JSON.parse(JSON.stringify(project || {}));
    const scene = prepared.scene || prepared;
    const warnings = [];
    const dbCache = new Map();
    const library = assetLibraryLoad();

    if(scene && scene.player && typeof scene.player.modelSrc === 'string'){
      await normalizePlayableAssetRef(scene.player, 'modelSrc', 'player.modelSrc', dbCache, library, warnings);
    }
    if(Array.isArray(scene && scene.added)){
      for(const entry of scene.added){
        if(entry && entry.kind === 'glb'){
          await normalizePlayableAssetRef(entry, 'src', 'added.glb' + (entry.name ? ' "' + entry.name + '"' : ''), dbCache, library, warnings);
        }
        if(entry && entry.kind === 'texture' && entry.props && typeof entry.props === 'object'){
          await normalizePlayableAssetRef(entry.props, 'src', 'added.texture' + (entry.name ? ' "' + entry.name + '"' : ''), dbCache, library, warnings);
        }
      }
    }
    if(scene && scene.player && scene.player.engineAudio && scene.player.engineAudio.set){
      await normalizePlayableObjectBlobs(scene.player.engineAudio.set, 'player.engineAudio.set', dbCache, library, warnings, 0);
    }
    return {
      project: prepared,
      warnings,
    };
  }

  return Object.freeze({preparePlayableProject});
}

window.LK_EDITOR_PLAYABLE_EXPORT_ASSETS = Object.freeze({create});
})();
