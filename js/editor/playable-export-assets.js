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

  const ROOT_ASSET_PREFIXES = ['models/', 'media/', 'musics/'];
  const ROOT_ASSET_PROBE_CACHE = new Map();

  function normalizeRootAssetPath(value){
    if(typeof value !== 'string') return null;
    let raw = value.trim();
    if(!raw || /^(data:|blob:)/i.test(raw)) return null;
    try {
      if(/^https?:\/\//i.test(raw)){
        const url = new URL(raw, location.href);
        if(url.origin !== location.origin) return null;
        raw = url.pathname || '';
      }
    } catch(err){}
    raw = raw.replace(/\\/g, '/').replace(/[?#].*$/, '').replace(/^\/+/, '').replace(/^\.\/+/, '');
    return ROOT_ASSET_PREFIXES.some(prefix => raw.indexOf(prefix) === 0) ? raw : null;
  }

  function fileNameFromAssetValue(value){
    if(typeof value !== 'string') return null;
    const clean = value.trim().replace(/\\/g, '/').replace(/[?#].*$/, '');
    if(!clean || /^(data:|blob:|https?:)/i.test(clean) || clean.indexOf(':') >= 0) return null;
    const name = clean.split('/').pop();
    return name && /\.[a-z0-9]{2,5}$/i.test(name) ? name : null;
  }

  function rootAssetCandidates(owner, prop, label, meta){
    const values = [
      meta && meta.src,
      meta && meta.source,
      meta && meta.name,
      owner && owner[prop],
      owner && owner.source,
      owner && owner.fileName,
      owner && owner.name,
      owner && owner.asset && owner.asset.source,
      owner && owner.asset && owner.asset.name,
      label,
    ];
    const candidates = [];
    const seen = new Set();
    const add = path => {
      const p = normalizeRootAssetPath(path);
      if(p && !seen.has(p)){ seen.add(p); candidates.push(p); }
    };
    values.forEach(add);
    values.forEach(value => {
      const name = fileNameFromAssetValue(value);
      if(!name) return;
      if(/\.(glb|gltf)$/i.test(name)) add('models/' + name);
      else if(/\.(mp3|wav|ogg|m4a|flac)$/i.test(name)){
        if(/music\.menu|menu/i.test(String(label || ''))) add('musics/menu/' + name);
        add('musics/' + name);
        add('musics/menu/' + name);
      } else if(/\.(png|jpe?g|webp|gif|avif|hdr)$/i.test(name)){
        add('media/' + name);
        add('media/images/' + name);
      }
    });
    return candidates;
  }

  async function rootAssetPathExists(path){
    if(!path || typeof fetch !== 'function') return false;
    if(ROOT_ASSET_PROBE_CACHE.has(path)) return ROOT_ASSET_PROBE_CACHE.get(path);
    const probe = fetch(path, {method:'HEAD', cache:'no-store'}).then(response => response.ok).catch(() => false);
    ROOT_ASSET_PROBE_CACHE.set(path, probe);
    return probe;
  }

  async function resolveRootAssetPath(owner, prop, label, meta){
    const direct = normalizeRootAssetPath(meta && meta.src) || normalizeRootAssetPath(owner && owner[prop]);
    if(direct) return direct;
    const candidates = rootAssetCandidates(owner, prop, label, meta);
    for(const candidate of candidates){
      if(await rootAssetPathExists(candidate)) return candidate;
    }
    return null;
  }

  async function normalizePlayableAssetRef(owner, prop, label, dbCache, library, warnings, dbProp){
    if(!owner) return;
    const explicitDbProp = dbProp || 'dbKey';
    const hasProp = Object.prototype.hasOwnProperty.call(owner, prop);
    const hasDbProp = Object.prototype.hasOwnProperty.call(owner, explicitDbProp);
    if(!hasProp && !hasDbProp && !(owner.asset && owner.asset.dbKey)) return;
    const fallbackName = owner.name || owner.id || label || 'asset';
    const meta = {
      src: owner[prop],
      dbKey: owner[explicitDbProp] || owner.dbKey || (owner.asset && owner.asset.dbKey),
      key: owner.key || owner.id || (owner.asset && owner.asset.key),
      source: owner.source || (owner.asset && owner.asset.source),
      name: owner.name || (owner.asset && owner.asset.name),
    };
    const rootPath = await resolveRootAssetPath(owner, prop, label, meta);
    if(rootPath){
      owner[prop] = rootPath;
      if(owner[explicitDbProp]) owner[explicitDbProp] = null;
      if(owner.dbKey) owner.dbKey = null;
      if(owner.asset && owner.asset.dbKey) owner.asset.dbKey = null;
      return;
    }
    if((!meta.src || /^blob:/i.test(meta.src)) && !meta.dbKey){
      const lib = findAssetLibraryEntry(library, meta);
      if(lib){
        if(lib.src && !/^blob:/i.test(lib.src)) meta.src = lib.src;
        if(lib.dbKey) meta.dbKey = lib.dbKey;
        if(lib.source) meta.source = lib.source;
        if(lib.name) meta.name = lib.name;
      }
    }
    const libraryRootPath = await resolveRootAssetPath(owner, prop, label, meta);
    if(libraryRootPath){
      owner[prop] = libraryRootPath;
      if(owner[explicitDbProp]) owner[explicitDbProp] = null;
      if(owner.dbKey) owner.dbKey = null;
      if(owner.asset && owner.asset.dbKey) owner.asset.dbKey = null;
      return;
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
    if(owner[explicitDbProp]) owner[explicitDbProp] = null;
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
    if(Object.prototype.hasOwnProperty.call(prepared, 'embeddedLevels')) delete prepared.embeddedLevels;
    const scene = prepared.scene || prepared;
    const warnings = [];
    const dbCache = new Map();
    const library = assetLibraryLoad();

    if(scene && scene.player && (typeof scene.player.modelSrc === 'string' || scene.player.modelDbKey)){
      await normalizePlayableAssetRef(scene.player, 'modelSrc', 'player.modelSrc', dbCache, library, warnings, 'modelDbKey');
    }
    if(Array.isArray(scene && scene.added)){
      for(const entry of scene.added){
        if(entry && entry.kind === 'glb'){
          await normalizePlayableAssetRef(entry, 'src', 'added.glb' + (entry.name ? ' "' + entry.name + '"' : ''), dbCache, library, warnings);
        }
        if(entry && entry.kind === 'texture' && entry.props && typeof entry.props === 'object'){
          await normalizePlayableAssetRef(entry.props, 'src', 'added.texture' + (entry.name ? ' "' + entry.name + '"' : ''), dbCache, library, warnings);
        }
        if(entry && entry.kind === 'logicElement'){
          if(entry.props) await normalizePlayableObjectBlobs(entry.props, 'logicElement.materials', dbCache, library, warnings, 0);
          if(entry.meshEdits) await normalizePlayableObjectBlobs(entry.meshEdits, 'logicElement.meshEdits', dbCache, library, warnings, 0);
          const logicScene = entry.graph && entry.graph.logicScene;
          const elements = logicScene ? [logicScene.root].concat(logicScene.elements || []) : [];
          for(const element of elements){
            if(element && element.asset) await normalizePlayableAssetRef(element.asset, 'src', 'logicElement.' + (element.name || element.id || 'mesh'), dbCache, library, warnings);
            if(element && (element.matProps || element.materials || element.props)) await normalizePlayableObjectBlobs(element.matProps || element.materials || element.props, 'logicElement.materials.' + (element.name || element.id || 'element'), dbCache, library, warnings, 0);
          }
          const assetScene = entry.logicAsset && entry.logicAsset.graph && entry.logicAsset.graph.logicScene;
          const assetElements = assetScene ? [assetScene.root].concat(assetScene.elements || []) : [];
          for(const element of assetElements){
            if(element && element.asset) await normalizePlayableAssetRef(element.asset, 'src', 'logicElementAsset.' + (element.name || element.id || 'mesh'), dbCache, library, warnings);
            if(element && (element.matProps || element.materials || element.props)) await normalizePlayableObjectBlobs(element.matProps || element.materials || element.props, 'logicElementAsset.materials.' + (element.name || element.id || 'element'), dbCache, library, warnings, 0);
          }
          const vehicleAudio = entry.graph && entry.graph.vehiclePawn && entry.graph.vehiclePawn.engineAudio;
          if(vehicleAudio && vehicleAudio.set) await normalizePlayableObjectBlobs(vehicleAudio.set, 'logicElement.vehiclePawn.engineAudio.set', dbCache, library, warnings, 0);
          const assetVehicleAudio = entry.logicAsset && entry.logicAsset.graph && entry.logicAsset.graph.vehiclePawn && entry.logicAsset.graph.vehiclePawn.engineAudio;
          if(assetVehicleAudio && assetVehicleAudio.set) await normalizePlayableObjectBlobs(assetVehicleAudio.set, 'logicElementAsset.vehiclePawn.engineAudio.set', dbCache, library, warnings, 0);
        }
      }
    }
    if(scene && scene.player && scene.player.engineAudio && scene.player.engineAudio.set){
      await normalizePlayableObjectBlobs(scene.player.engineAudio.set, 'player.engineAudio.set', dbCache, library, warnings, 0);
    }
    const musicLibraries = scene && scene.ui && scene.ui.musicLibraries;
    if(musicLibraries){
      for(const groupName of ['radio', 'menu']){
        const tracks = Array.isArray(musicLibraries[groupName]) ? musicLibraries[groupName] : [];
        for(const track of tracks){
          await normalizePlayableAssetRef(track, 'url', 'music.' + groupName + '.' + (track.fileName || track.title || track.id || 'track'), dbCache, library, warnings);
        }
      }
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
