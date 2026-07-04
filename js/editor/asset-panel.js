/* =========================================================
   LOT KING — EDITOR ASSET PANEL
   DOM helpers for asset cards.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const ED = deps.ED;
  const documentRef = deps.document || document;

  function button(label, title, fn){
    const b = documentRef.createElement('button');
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', ev => { ev.stopPropagation(); fn(); });
    return b;
  }

  function makeCard(item){
    const div = documentRef.createElement('div');
    div.className = 'lk-asset-item lk-asset-' + item.kind + (ED.selectedAsset === item.ref ? ' sel' : '') + (item.active ? ' active' : '');
    div.dataset.assetRef = item.ref;
    div.draggable = true;

    const thumb = documentRef.createElement('div');
    thumb.className = 'lk-asset-thumb';
    if(item.thumbUrl) thumb.style.backgroundImage = 'url(' + item.thumbUrl + ')';
    else thumb.textContent = item.icon || '▣';

    if(item.thumbObject){
      const sid = item.thumbObject.userData.editorId;
      const thumbCache = deps.thumbCache;
      if(thumbCache && thumbCache.has(sid)){
        const cached = thumbCache.get(sid);
        if(cached){ thumb.style.backgroundImage = 'url(' + cached + ')'; thumb.textContent = ''; }
      } else if(deps.queueThumb) {
        deps.queueThumb(item.thumbObject, thumb);
      }
    }

    const meta = documentRef.createElement('div');
    meta.className = 'lk-asset-meta';
    meta.innerHTML = '<div class="lk-asset-name"></div><div class="lk-asset-sub"></div>';
    meta.querySelector('.lk-asset-name').textContent = item.name;
    meta.querySelector('.lk-asset-sub').textContent = item.sub || '';

    const actions = documentRef.createElement('div');
    actions.className = 'lk-asset-actions';
    (item.actions || []).forEach(a => actions.appendChild(button(a.label, a.title, a.fn)));
    div.append(thumb, meta, actions);

    div.addEventListener('click', () => deps.selectAssetItem(item.ref));
    div.addEventListener('dblclick', () => { if(item.defaultAction) item.defaultAction(); });
    div.addEventListener('contextmenu', ev => {
      ev.preventDefault(); ev.stopPropagation();
      deps.selectAssetItem(item.ref);
      deps.openMenu(deps.assetContextMenuItems(deps.getAssetByRef(item.ref)), ev.clientX, ev.clientY);
    });
    div.addEventListener('dragstart', ev => {
      deps.setAssetDragRef(item.ref);
      ev.dataTransfer.setData('application/x-lotking-asset', item.ref);
      ev.dataTransfer.effectAllowed = item.draggable ? 'copyMove' : 'move';
    });
    div.addEventListener('dragend', () => deps.setAssetDragRef(null));

    return div;
  }

  function visible(item, q){
    return ED.assetFilters[deps.assetFilterKey(item)] !== false && deps.assetMatchesSearch(item, q);
  }

  function addGroup(box, title, items, folderAware){
    if(!items.length && !(folderAware && deps.folderList('assets').length)) return;
    box.appendChild(deps.el('<div class="lk-asset-group">' + title + '</div>'));
    if(folderAware){
      const assignments = deps.folderAssignments('assets');
      const folders = deps.folderList('assets');
      const renderFolderTree = parent => {
        folders.filter(f => (f.parent || null) === (parent || null)).forEach(folder => {
          box.appendChild(deps.makeFolderRow('assets', folder));
          if(folder.open){
            items.filter(item => assignments[item.ref] === folder.id).forEach(item => box.appendChild(makeCard(item)));
            renderFolderTree(folder.id);
          }
        });
      };
      renderFolderTree(null);
      return;
    }
    const assignments = deps.folderAssignments('assets');
    items
      .filter(item => !assignments[item.ref] || !deps.folderById('assets', assignments[item.ref]))
      .forEach(item => box.appendChild(makeCard(item)));
  }

  function preparePanel(box){
    box.innerHTML = '';
    box.ondragover = e => {
      if(Array.from(e.dataTransfer.types || []).includes('application/x-lotking-asset')){
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      }
    };
    box.ondrop = e => {
      const ref = e.dataTransfer && e.dataTransfer.getData('application/x-lotking-asset');
      if(ref && e.target === box){
        delete deps.folderAssignments('assets')[ref];
        deps.writeFolderState();
        deps.refreshAssetsPanel();
      }
    };
    box.oncontextmenu = e => {
      if(e.target.closest('.lk-asset-item, .lk-folder-row, .lk-asset-group')) return;
      e.preventDefault();
      e.stopPropagation();
      deps.openMenu(deps.assetsPanelMenuItems(), e.clientX, e.clientY);
    };
  }

  function finishPanel(box, counts){
    counts = counts || {};
    if(!counts.blueprints && !counts.levels && !counts.imported && !counts.scene){
      box.appendChild(deps.el('<div class="lk-empty">No assets visible.<br>Change filters or import GLB/GLTF files.</div>'));
    }
    deps.setStatusRight(
      (counts.blueprints ? counts.blueprints + ' blueprints · ' : '') +
      (counts.levels ? counts.levels + ' levels · ' : '') +
      (counts.imported ? counts.imported + ' imported · ' : '') +
      counts.scene + ' scene assets'
    );
  }

  function importedItems(q){
    return deps.assetLibraryLoad().map(asset => {
      const mb = asset.size ? ' · ' + (asset.size / 1e6).toFixed(1) + ' MB' : '';
      const item = {
        kind:'imported-glb', ref:'imported:' + asset.id, id:asset.id, name:asset.name || 'Imported Asset',
        sub:'imported glb · ' + (asset.source || asset.key) + mb,
        source:asset.source || asset.key, icon:'📦', draggable:true,
      };
      const refItem = () => ({kind:'imported-glb', ref:item.ref, id:asset.id, name:asset.name, raw:asset});
      item.defaultAction = () => deps.placeAssetRef(refItem(), deps.spawnPointAhead());
      item.actions = [
        {label:'Place', title:'Place this asset in front of the editor camera', fn:() => deps.placeAssetRef(refItem(), deps.spawnPointAhead())},
        {label:'×', title:'Remove from imported asset library', fn:() => deps.deleteImportedAsset(asset)},
      ];
      return item;
    }).filter(item => visible(item, q));
  }

  function levelItems(q){
    const LV = deps.levelsApi();
    return (LV ? LV.list() : []).map(l => ({
      kind:'level', ref:'level:' + l.id, id:l.id, name:l.name + (l.active ? ' · ACTIVE' : ''),
      sub:'level · LKEP · ' + (l.savedAt ? new Date(l.savedAt).toLocaleDateString() : l.id),
      source:l.id, icon:'🗺', active:l.active, draggable:false,
      defaultAction:() => { if(!l.active) deps.loadLevel(l.id, l.name); },
      actions:[
        ...(l.active ? [] : [{label:'▶', title:'Load in editor', fn:() => deps.loadLevel(l.id, l.name)}]),
        {label:'✎', title:'Rename', fn:() => deps.renameLevel(l.id, l.name)},
        {label:'⧉', title:'Duplicate', fn:() => deps.duplicateLevel(l.id, l.name)},
        {label:'×', title:'Delete', fn:() => deps.deleteLevel(l.id, l.name)},
      ],
    })).filter(item => visible(item, q));
  }

  function soundSetItems(q){
    const STORE = deps.STORE;
    const GAME = deps.GAME;
    const assignedSoundSet = GAME.player.engineAudio && GAME.player.engineAudio.setId;
    return (STORE.soundSets ? STORE.soundSets.list() : []).map(s => ({
      kind:'sound-set', ref:'sound:' + s.id, id:s.id,
      name:s.name + (s.id === assignedSoundSet ? ' · ON CAR' : ''),
      sub:'engine sound set · ' + (s.savedAt ? new Date(s.savedAt).toLocaleDateString() : s.id),
      source:s.id, icon:'🔊', filterType:'sound', active:s.id === assignedSoundSet, draggable:false,
      defaultAction:() => deps.openSoundDesigner(s.id),
      actions:[
        {label:'🎛', title:'Apri nel Sound Designer', fn:() => deps.openSoundDesigner(s.id)},
        {label:'🚗', title:'Assegna al veicolo player', fn:() => {
          GAME.player.setEngineSound(s.id); deps.markDirty(); deps.refreshAssetsPanel();
          deps.status('Sound set "' + s.name + '" assegnato al veicolo');
        }},
        {label:'⧉', title:'Duplica', fn:() => { STORE.soundSets.duplicate(s.id); deps.refreshAssetsPanel(); }},
        {label:'×', title:'Elimina', fn:() => {
          deps.confirmEditorAction({title:'Delete sound set?', message:'Eliminare il sound set "' + s.name + '"?', okText:'Delete'}).then(ok => {
            if(!ok) return;
            STORE.soundSets.remove(s.id);
            if(assignedSoundSet === s.id){ GAME.player.setEngineSound(null); deps.markDirty(); }
            deps.refreshAssetsPanel();
          });
        }},
      ],
    })).filter(item => visible(item, q));
  }

  return Object.freeze({button, makeCard, visible, addGroup, preparePanel, finishPanel, importedItems, levelItems, soundSetItems});
}

window.LK_EDITOR_ASSET_PANEL = Object.freeze({create});
})();
