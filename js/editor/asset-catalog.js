/* =========================================================
   LOT KING - EDITOR ASSET CATALOG
   Scene/imported asset lookup, grouping, placement and panel refresh.
   ========================================================= */
(function(){
'use strict';

const TYPE_ICON = {mesh:'▣', light:'💡', effect:'✨', player:'🚗', playerLight:'🔆', playerEffect:'☁', playerDataWidget:'◫'};

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const root = deps.root;
  const $ = deps.$;

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

  function collectAssets(){
    const map = new Map();
    for(const o of GAME.world.registry){
      if(o.userData.editorType === 'player') continue;
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
    if(ref.indexOf('blueprint:') === 0){
      const id = ref.slice(10);
      if(id === 'base'){
        const player = STORE.playerBlueprints && STORE.playerBlueprints.default() || deps.currentPlayerBlueprint();
        return {kind:'player-blueprint', ref, id:'base', name:'Player Blueprint Base', base:true, raw:{id:'base', name:'Player Blueprint Base', player}};
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
