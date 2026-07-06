/* =========================================================
   LOT KING - EDITOR ASSET CATALOG
   Scene/imported asset lookup, grouping, placement and panel refresh.
   ========================================================= */
(function(){
'use strict';

const TYPE_ICON = {mesh:'▣', light:'💡', effect:'✨', text:'T', player:'🚗', playerLight:'🔆', playerEffect:'☁', playerDataWidget:'◫'};

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const root = deps.root;
  const $ = deps.$;
  const placeProjectAsset = deps.placeProjectAsset || function(){ return Promise.resolve(false); };
  const LEVEL_PREFIX = 'lotking.level.';

  function clone(value){
    try { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    catch(err){ return value; }
  }

  function parseSceneFromLevelProject(project){
    const data = project ? (project.scene || project) : null;
    if(!data) return null;
    if(Array.isArray(data.added)) return data;
    if(Array.isArray(data.scene && data.scene.added)) return data.scene;
    return null;
  }

  function readLevelProjectFromStorage(levelId){
    if(!levelId) return null;
    const key = LEVEL_PREFIX + levelId;
    try {
      const raw = localStorage.getItem(key);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed) return null;
      if(parsed && parsed.format && parsed.scene) return parsed;
      if(parsed && (parsed.transforms || parsed.added || parsed.deleted || parsed.player || parsed.env)) return {scene: parsed};
      return null;
    } catch(err){
      console.warn('LotKing editor: impossibile leggere livello da storage (' + key + ')', err);
      return null;
    }
  }

  function entityIcon(o){
    const l = o.isLight ? o : o.userData.light;
    if(l){
      if(l.isSpotLight) return '🔦';
      if(l.isDirectionalLight) return '☀️';
      if(l.isHemisphereLight) return '🌗';
      if(l.isAmbientLight) return '💠';
      return '💡';
    }
    return TYPE_ICON[o.userData.editorType] || '▣';
  }

  function assetKeyOf(o){
    if(o.userData.assetKey) return o.userData.assetKey;
    if(o.userData.addedEntry) return 'added:' + (o.userData.addedEntry.kind || 'object') + ':' + (o.userData.addedEntry.prim || o.userData.addedEntry.light || o.userData.addedEntry.effect || o.userData.editorName || 'asset');
    const name = o.userData.editorName || o.userData.editorId || 'object';
    return (o.userData.editorType || 'object') + ':' + name.replace(/\s+\d+$/,'');
  }

  function assetNameOf(o){
    if(o.userData.assetName) return o.userData.assetName;
    if(o.userData.addedEntry) return o.userData.addedEntry.name || o.userData.editorName || o.userData.addedEntry.kind;
    return (o.userData.editorName || 'Object').replace(/\s+\d+$/,'');
  }

  function isPrimitiveLikeObject(o){
    if(!o || !o.userData) return false;
    const added = o.userData.addedEntry || {};
    const source = String(added.source || o.userData.assetSource || '').toLowerCase();
    const name = String(added.name || o.userData.assetName || o.userData.editorName || '').toLowerCase();
    const kind = String(added.kind || '').toLowerCase();
    if(added.kind === 'primitive' || added.prim) return true;
    if(['box', 'sphere', 'cylinder', 'cone', 'plane', 'ramp', 'torus'].includes(kind)) return true;
    if(String(added.asset && added.asset.key || o.userData.assetKey || '').toLowerCase().indexOf('primitive:') === 0) return true;
    if(source.indexOf('editor primitive') === 0 || name.indexOf('primitive') === 0) return true;
    return false;
  }

  function isPrimitiveAssetEntry(entry){
    if(!entry || typeof entry !== 'object') return false;
    if(entry.src || entry.dbKey || entry.asset && (entry.asset.dbKey || looksLikeGlbSource(entry.asset.src) || looksLikeGlbSource(entry.asset.source))) return false;
    const source = String(entry.source || entry.asset && entry.asset.source || '').toLowerCase();
    const name = String(entry.name || entry.editorName || '').toLowerCase();
    const kind = String(entry.kind || '').toLowerCase();
    if(entry.kind === 'primitive' || entry.prim) return true;
    if(['box', 'sphere', 'cylinder', 'cone', 'plane', 'ramp', 'torus'].includes(kind)) return true;
    if(entry.asset && String(entry.asset.key || '').toLowerCase().indexOf('primitive:') === 0) return true;
    if(source.indexOf('editor primitive') === 0 || name.indexOf('primitive') === 0) return true;
    return false;
  }

  function collectAssets(){
    const map = new Map();
    for(const o of GAME.world.registry){
      if(o.userData.editorType === 'player') continue;
      if(o.userData.builtin) continue;
      if(!isPrimitiveLikeObject(o)) continue;
      const key = assetKeyOf(o);
      if(!map.has(key)){
        map.set(key, {
          key,
          name: assetNameOf(o),
          type: o.userData.editorType || 'mesh',
          source: o.userData.assetSource || (o.userData.builtin ? 'Built-in scene' : 'Created in editor'),
          instances: [],
          sample: o,
        });
      }
      map.get(key).instances.push(o);
    }
    return Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
  }

  function looksLikeGlbSource(value){
    const src = String(value || '').toLowerCase();
    if(!src) return false;
    if(src.startsWith('data:')) return true;
    if(src.startsWith('blob:')) return true;
    return /(\.glb|\.gltf)(?:[?#].*)?$/i.test(src);
  }

  function detectAssetType(entry){
    if(!entry || typeof entry !== 'object') return 'other';
    if(entry.kind === 'glb') return 'glb';
    if(entry.asset && entry.asset.kind === 'glb') return 'glb';
    if(entry.key && String(entry.key).toLowerCase().indexOf('glb:') === 0) return 'glb';
    if(entry.dbKey) return 'glb';
    const src = entry.src || (entry.asset && (entry.asset.src || entry.asset.source));
    if(looksLikeGlbSource(src)) return 'glb';
    if(entry.asset && (entry.asset.dbKey || looksLikeGlbSource(entry.asset.source) || looksLikeGlbSource(entry.asset.src))) return 'glb';
    if(entry.kind === 'light') return 'light';
    if(entry.kind === 'effect') return 'effect';
    if(entry.kind === 'text') return 'text';
    return 'other';
  }

  function isSharableProjectAsset(entry){
    if(!entry || typeof entry !== 'object') return false;
    if(isPrimitiveAssetEntry(entry)) return false;
    const type = detectAssetType(entry);
    if(type === 'light' || type === 'effect') return true;
    if(type === 'glb') return true;
    if(entry.asset && (entry.asset.key || entry.asset.dbKey || entry.asset.src || entry.asset.source)) return true;
    if(entry.src || entry.dbKey || entry.key || entry.id || entry.type) return true;
    return false;
  }

  function entryDisplayName(entry){
    return (entry && (entry.name || entry.editorName)) || (entry && entry.kind) || 'Asset';
  }

  function collectProjectAssets(){
    function normalizeLevelId(v){
      if(v == null) return '';
      return String(v).trim();
    }
    function levelLabel(level){
      return level && (level.name || level.id || '').toString().trim() || normalizeLevelId(level && level.id);
    }
    function compactString(v){
      return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
    }
    function clampText(v, n){
      if(!v) return '';
      const s = String(v);
      return s.length > n ? s.slice(0, n) : s;
    }
    function assetFingerprint(entry){
      const asset = entry && entry.asset ? entry.asset : null;
      const parts = [];
      const pushIf = (v, p) => { if(v == null) return; const s = compactString(String(v)); if(s) parts.push(p + s); };
      const preferred = [asset && asset.key, entry && entry.key, entry && entry.dbKey, asset && asset.dbKey, entry && entry.src, asset && asset.src, asset && asset.source, entry && entry.id, asset && asset.id];
      preferred.some(v => {
        if(v == null) return false;
        parts.push('id:' + compactString(String(v)));
        return true;
      });
      const signature = entry ? compactString(String(entry.name || entry.editorName || (entry.prim ? 'primitive:' + entry.prim : 'asset'))) : 'asset';
      pushIf(entry && entry.kind, 'kind:');
      pushIf(signature, 'name:');
      pushIf(entry && entry.prim, 'prim:');
      pushIf(entry && (entry.light || entry.effect), 'kindOpt:');
      return parts.length ? parts.join('|') : ('name:' + clampText(signature, 120));
    }
    const itemsByKey = new Map();
    function addProjectAssetEntry(entry, level, sourceLabel){
      if(!entry || typeof entry !== 'object') return;
      if(!isSharableProjectAsset(entry)) return;
      const levelId = normalizeLevelId(level && level.id);
      const type = detectAssetType(entry);
      const assetKey = assetFingerprint(entry);
      const fingerprint = [assetKey, type].join('::');
      const label = sourceLabel || levelLabel(level);
      if(itemsByKey.has(fingerprint)){
        const existing = itemsByKey.get(fingerprint);
        if(existing && existing.levels && label && !existing.levels.includes(label)){
          existing.levels.push(label);
          existing.sub = existing.type + ' · from levels: ' + existing.levels.join(', ');
          existing.source = existing.levels.join(' · ');
        }
        return;
      }
      const ref = 'project:' + (clampText(compactString(entry.id || entry.key || assetKey || entry.src || 'asset'), 80) + '-' + (levelId || 'project'));
      const item = {
        kind:'project-asset',
        ref,
        id: entry.id || assetKey,
        levelId: level && level.id,
        levelName: label,
        name: entryDisplayName(entry),
        sub: type + (label ? ' · from levels: ' + label : ' · project asset'),
        source: (entry.asset && (entry.asset.source || entry.asset.key)) || label || 'Project',
        levels: label ? [label] : [],
        type,
        filterType: type === 'glb' ? 'glb' : type === 'light' ? 'light' : type === 'effect' ? 'effect' : 'other',
        raw: {entry: clone(entry), levelId: level && level.id, levelName: label},
        icon: entry.kind === 'glb' || type === 'glb' ? '📦' : entry.kind === 'light' ? '💡' : entry.kind === 'effect' ? '✨' : '▣',
        draggable:true,
        badges: entry.rigged ? [{label:'Rigged', type:'rigged'}] : [],
      };
      item.defaultAction = () => placeProjectAsset(item.raw, deps.spawnPointAhead ? deps.spawnPointAhead() : null);
      item.actions = [
        {label:'Place', title:'Place this project asset in the current scene', fn:() => placeProjectAsset(item.raw, deps.spawnPointAhead ? deps.spawnPointAhead() : null)},
      ];
      itemsByKey.set(fingerprint, item);
    }
    const LV = deps.levelsApi && deps.levelsApi();
    const list = LV && LV.list ? LV.list() : [];
    const activeLevelId = LV && LV.activeId ? normalizeLevelId(LV.activeId()) : '';
    for(const level of list){
      if(!level || !level.id) continue;
      const isActive = normalizeLevelId(level.id) === activeLevelId;
      const project = isActive ? null : (LV && LV.get ? LV.get(level.id) : null);
      const fallbackProject = !isActive ? (project ? null : readLevelProjectFromStorage(level.id)) : null;
      const scene = isActive ? parseSceneFromLevelProject(STORE.collect(GAME)) : parseSceneFromLevelProject(project || fallbackProject);
      const entries = scene ? scene.added : [];
      for(const entry of entries){
        addProjectAssetEntry(entry, level);
      }
    }
    return Array.from(itemsByKey.values()).sort((a,b) => a.name.localeCompare(b.name));
  }

  function assetMatchesSearch(item, q){
    if(!q) return true;
    const hay = [item.name, item.sub, item.source, item.kind, item.type].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }

  function assetFilterKey(item){
    if(item.filterType) return item.filterType;
    if(item.kind === 'player-blueprint') return 'blueprint';
    if(item.kind === 'sound-set') return 'sound';
    if(item.kind === 'level') return 'levels';
    if(item.kind === 'imported-glb') return 'glb';
    if(item.type === 'light') return 'light';
    if(item.type === 'effect') return 'effect';
    if(item.kind === 'texture') return 'texture';
    if(item.kind === 'scene') return 'scene';
    return 'other';
  }

  function selectAssetItem(ref){
    ED.selectedAsset = ref;
    root.querySelectorAll('#lkAssetsPanel .lk-asset-item').forEach(item => {
      item.classList.toggle('sel', item.dataset.assetRef === ref);
    });
  }

  function getAssetByRef(ref){
    if(!ref) return null;
    const LV = deps.levelsApi();
    if(ref.indexOf('level:') === 0 && LV){
      const id = ref.slice(6);
      const l = LV.list().find(x => x.id === id);
      return l ? {kind:'level', ref, id:l.id, name:l.name, raw:l} : null;
    }
    if(ref.indexOf('sound:') === 0 && STORE.soundSets){
      const id = ref.slice(6);
      const s = STORE.soundSets.list().find(x => x.id === id);
      return s ? {kind:'sound-set', ref, id:s.id, name:s.name, raw:s} : null;
    }
    if(ref.indexOf('imported:') === 0){
      const id = ref.slice(9);
      const asset = deps.assetLibraryLoad().find(a => a.id === id);
      return asset ? {kind:'imported-glb', ref, id:asset.id, name:asset.name, raw:asset} : null;
    }
    if(ref.indexOf('scene:') === 0){
      const key = ref.slice(6);
      const a = collectAssets().find(x => x.key === key);
      return a ? {kind:'scene', ref, key:a.key, name:a.name, type:a.type, raw:a} : null;
    }
    if(ref.indexOf('project:') === 0){
      const item = collectProjectAssets().find(x => x.ref === ref);
      return item ? {kind:'project-asset', ref, raw:item.raw, name:item.name, source:item.source, levelId:item.levelId, levelName:item.levelName, badges:item.badges || []} : null;
    }
    if(ref.indexOf('blueprint:') === 0){
      const id = ref.slice(10);
      if(id === 'base'){
        const player = STORE.playerBlueprints && STORE.playerBlueprints.default() || deps.currentPlayerBlueprint();
        return {kind:'player-blueprint', ref, id:'base', name:'player_car Logic Base', base:true, raw:{id:'base', name:'player_car Logic Base', player}};
      }
      const asset = STORE.playerBlueprints && STORE.playerBlueprints.list().find(x => x.id === id);
      return asset ? {kind:'player-blueprint', ref, id:asset.id, name:asset.name, raw:asset} : null;
    }
    return null;
  }

  function placeAssetRef(item, at){
    if(!item) return;
    if(item.kind === 'imported-glb'){
      deps.setAssetLoading(true, item.name, 20, 'Loading asset instance');
      deps.placeImportedAsset(item.raw, at || deps.spawnPointAhead()).then(() => {
        deps.setAssetLoading(true, item.name, 100, 'Placed in scene');
        setTimeout(() => deps.setAssetLoading(false), 300);
      }).catch(err => {
        deps.setAssetLoading(false);
        deps.status('Place failed: ' + err.message);
      });
      return;
    }
    if(item.kind === 'scene'){
      const a = item.raw;
      if(!a || !a.sample){ deps.status('Asset di scena non disponibile'); return; }
      deps.duplicateEntity(a.sample, (at || deps.spawnPointAhead()).sub(a.sample.position));
      deps.setLeftMode('scene');
      return;
    }
    if(item.kind === 'project-asset'){
      placeProjectAsset(item.raw, at || deps.spawnPointAhead());
      return;
    }
    if(item.kind === 'level'){ deps.status('Drag a model asset into the viewport, not a level'); return; }
    if(item.kind === 'player-blueprint'){ deps.status('Only one player blueprint can be active in scene for now'); return; }
    deps.status('Questo tipo di asset non può essere piazzato nel viewport');
  }

  function requestDeleteAssetInstances(asset){
    if(!asset || !asset.instances || !asset.instances.length) return;
    const removable = asset.instances.filter(o =>
      !['player','playerLight','playerEffect','playerDataWidget'].includes(o.userData.editorType));
    if(!removable.length){ deps.status('Questo asset non ha istanze eliminabili'); return; }
    deps.confirmEditorAction({
      title: 'Delete asset instances?',
      message: 'Delete all ' + removable.length + ' instance(s) of "' + asset.name + '" from the current level?',
      okText: 'Delete instances',
    }).then(ok => {
      if(!ok) return;
      removable.forEach(o => deps.performDeleteEntity(o));
      refreshAssetsPanel();
      deps.status('Deleted ' + removable.length + ' instance(s)');
    });
  }

  function refreshAssetsPanel(){
    const panel = deps.getAssetPanel();
    if(!panel) return;
    const box = $('#lkAssetsPanel');
    panel.refresh(box, ED.search || '');
  }

  return Object.freeze({
    entityIcon,
    assetKeyOf,
    assetNameOf,
    collectAssets,
    collectProjectAssets,
    assetMatchesSearch,
    assetFilterKey,
    selectAssetItem,
    getAssetByRef,
    placeAssetRef,
    requestDeleteAssetInstances,
    refreshAssetsPanel,
  });
}

window.LK_EDITOR_ASSET_CATALOG = Object.freeze({create});
})();
