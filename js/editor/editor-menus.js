/* =========================================================
   LOT KING — EDITOR MENUS
   Context menu item factories shared by editor panels.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const ED = deps.ED;
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const root = deps.root;
  const $ = deps.$;

  function assetContextMenuItems(item){
    if(!item) return [];
    if(item.kind === 'level'){
      const l = item.raw;
      return [
        {label:'Load in editor', icon:'▶', disabled:!!l.active, action:() => deps.loadLevel(l.id, l.name)},
        {label:'Rename', icon:'✎', action:() => deps.renameLevel(l.id, l.name)},
        {label:'Duplicate', icon:'⧉', action:() => deps.duplicateLevel(l.id, l.name)},
        {label:'Export LKEP', icon:'⇩', action:() => deps.exportLevel(l.id)},
        {sep:true},
        {label:'Delete', icon:'🗑', action:() => deps.deleteLevel(l.id, l.name)},
      ];
    }
    if(item.kind === 'sound-set'){
      const s = item.raw;
      const assignedSoundSet = GAME.player.engineAudio && GAME.player.engineAudio.setId;
      return [
        {label:'Open Engine Sound Designer', icon:'🎛', action:() => deps.openSoundDesigner(s.id)},
        {label:'Assign to player vehicle', icon:'🚗', disabled:assignedSoundSet === s.id, action:() => {
          GAME.player.setEngineSound(s.id); deps.markDirty(); deps.refreshAssetsPanel();
          deps.status('Sound set "' + s.name + '" assegnato al veicolo');
        }},
        {label:'Duplicate sound set', icon:'⧉', action:() => { STORE.soundSets.duplicate(s.id); deps.refreshAssetsPanel(); }},
        {sep:true},
        {label:'Delete sound set', icon:'🗑', action:() => {
          deps.confirmEditorAction({title:'Delete sound set?', message:'Eliminare il sound set "' + s.name + '"?', okText:'Delete'}).then(ok => {
            if(!ok) return;
            STORE.soundSets.remove(s.id);
            if(assignedSoundSet === s.id){ GAME.player.setEngineSound(null); deps.markDirty(); }
            deps.refreshAssetsPanel();
          });
        }},
      ];
    }
    if(item.kind === 'imported-glb'){
      const asset = item.raw;
      return [
        {label:'Add to level', icon:'＋', action:() => deps.placeAssetRef(item, deps.spawnPointAhead())},
        {label:'Replace selected scene object', icon:'📦', disabled:!ED.selected || ED.selected.userData.editorType === 'player', action:() => deps.replaceSelectedWithAsset(asset)},
        {label:'Properties', icon:'ⓘ', action:() => deps.openAssetProperties(item)},
        {sep:true},
        {label:'Delete imported asset', icon:'🗑', action:() => deps.deleteImportedAsset(asset)},
      ];
    }
    if(item.kind === 'scene'){
      const a = item.raw;
      return [
        {label:'Select first instance', icon:'☝', action:() => { deps.selectObject(a.instances[0]); deps.setLeftMode('scene'); }},
        {label:'Add another instance', icon:'＋', action:() => deps.placeAssetRef(item, deps.spawnPointAhead())},
        {label:'Focus first instance', icon:'🔍', action:() => { deps.selectObject(a.instances[0]); deps.focusSelected(); deps.setLeftMode('scene'); }},
        {sep:true},
        {label:'Delete all instances', icon:'🗑', action:() => deps.requestDeleteAssetInstances(a)},
      ];
    }
    if(item.kind === 'project-asset'){
      return [
        {label:'Add to current level', icon:'＋', action:() => deps.placeAssetRef(item, deps.spawnPointAhead())},
        ...(item.raw && item.raw.levelId ? [{
          label:'Open source level', icon:'🗺', action:() => deps.loadLevel(item.raw.levelId, item.raw.levelName),
        }] : []),
      ];
    }
    if(item.kind === 'player-blueprint'){
      const asset = item.raw;
      return [
        {label:'Apply to scene player', icon:'🚗', action:() => deps.applyPlayerBlueprintAsset(asset.player || asset, {applySpawn:false})},
        {label:'Properties', icon:'ⓘ', action:() => deps.openAssetProperties(item)},
        {label:'Promote to Base car logic', icon:'★', disabled:!!item.base, action:() => deps.setDefaultPlayerBlueprintAsset(asset)},
        {sep:true},
        {label:'Delete copied car logic', icon:'🗑', disabled:!!item.base, action:() => deps.deletePlayerBlueprintAsset(asset)},
      ];
    }
    return [];
  }

  function scenePanelMenuItems(){
    return [
      {label:'Create scene folder/group', icon:'📁', action:() => deps.newFolder('scene')},
      {label:'Add', icon:'＋', sub:deps.addMenuItems(deps.spawnPointAhead())},
      {sep:true},
      {label:'Grid view', icon:'▦', disabled:ED.viewMode === 'grid', action:() => deps.setViewMode('grid')},
      {label:'List view', icon:'☰', disabled:ED.viewMode === 'list', action:() => deps.setViewMode('list')},
      {label:ED.gridOn ? 'Hide viewport grid' : 'Show viewport grid', icon:'▦', action:() => deps.setGrid(!ED.gridOn)},
      {sep:true},
      {label:'Deselect', icon:'✕', disabled:!ED.selected && !ED.special, action:deps.deselect},
      {label:'Focus selected', icon:'🔍', disabled:!ED.selected, action:deps.focusSelected},
      {label:'Save track', icon:'💾', action:deps.saveScene},
    ];
  }

  function assetsPanelMenuItems(){
    const filterItems = Object.keys(ED.assetFilters).map(key => ({
      label:(ED.assetFilters[key] === false ? 'Show ' : 'Hide ') + key,
      icon:ED.assetFilters[key] === false ? '☐' : '☑',
      action:() => {
        ED.assetFilters[key] = ED.assetFilters[key] === false;
        const input = root.querySelector('[data-asset-filter="' + key + '"]');
        if(input) input.checked = ED.assetFilters[key] !== false;
        deps.refreshAssetsPanel();
      },
    }));
    return [
      {label:'Create assets folder/group', icon:'📁', action:() => deps.newFolder('assets')},
      {label:'Import GLB/GLTF assets', icon:'＋', action:() => $('#lkAssetInput').click()},
      {label:'Refresh assets', icon:'↻', action:() => { deps.refreshAssetsPanel(); deps.status('Asset library refreshed'); }},
      {sep:true},
      {label:'Grid view', icon:'▦', disabled:ED.viewMode === 'grid', action:() => deps.setViewMode('grid')},
      {label:'List view', icon:'☰', disabled:ED.viewMode === 'list', action:() => deps.setViewMode('list')},
      {label:'Filters', icon:'☑', sub:filterItems},
    ];
  }

  return Object.freeze({assetContextMenuItems, scenePanelMenuItems, assetsPanelMenuItems});
}

window.LK_EDITOR_MENUS = Object.freeze({create});
})();
