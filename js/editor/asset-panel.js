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
  const tr = (en, it) => deps.GAME && deps.GAME.i18n && deps.GAME.i18n.lang === 'it' ? (it || en) : en;
  let assetOrder = [];

  function selectedAssetRefs(){
    return Array.isArray(ED.selectedAssets) && ED.selectedAssets.length > 1 ? ED.selectedAssets : (ED.selectedAsset ? [ED.selectedAsset] : []);
  }

  function assetRefsFromDrop(e){
    if(!e || !e.dataTransfer) return [];
    const raw = e.dataTransfer.getData('application/x-lotking-assets');
    if(raw){
      try {
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch(err){}
    }
    const single = e.dataTransfer.getData('application/x-lotking-asset');
    return single ? [single] : [];
  }

  function button(label, title, fn){
    const b = documentRef.createElement('button');
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', ev => { ev.stopPropagation(); fn(); });
    return b;
  }

  function makeCard(item){
    if(!assetOrder.includes(item.ref)) assetOrder.push(item.ref);
    const div = documentRef.createElement('div');
    div.className = 'lk-asset-item lk-asset-' + item.kind + (selectedAssetRefs().includes(item.ref) ? ' sel' : '') + (item.active ? ' active' : '');
    div.dataset.assetRef = item.ref;
    div.draggable = true;

    const thumb = documentRef.createElement('div');
    thumb.className = 'lk-asset-thumb';
    const setThumbImage = url => {
      if(!url) return;
      thumb.style.backgroundImage = 'url(' + url + ')';
      Array.from(thumb.childNodes).forEach(node => {
        if(node.nodeType === 3) node.nodeValue = '';
      });
    };
    if(item.thumbUrl) setThumbImage(item.thumbUrl);
    else thumb.textContent = item.icon || '▣';
    if(!item.thumbUrl && item.thumbDbKey && window.LK_ASSET_BLOBS){
      window.LK_ASSET_BLOBS.getUrl(item.thumbDbKey).then(url => {
        if(!url || !thumb.isConnected) return;
        setThumbImage(url);
      }).catch(()=>{});
    } else if(!item.thumbUrl && item.thumbPromise){
      item.thumbPromise().then(url => {
        if(!url || !thumb.isConnected) return;
        setThumbImage(url);
      }).catch(()=>{});
    }
    (item.badges || []).forEach(badge => {
      const tag = documentRef.createElement('span');
      tag.className = 'lk-asset-badge lk-asset-badge-' + String(badge.type || 'info');
      tag.textContent = badge.label || badge;
      thumb.appendChild(tag);
    });

    if(item.thumbObject){
      const sid = item.thumbObject.userData.editorId;
      const thumbCache = deps.thumbCache;
      if(thumbCache && thumbCache.has(sid)){
        const cached = thumbCache.get(sid);
        if(cached) setThumbImage(cached);
      } else if(deps.queueThumb) {
        deps.queueThumb(item.thumbObject, thumb);
      }
    }
    if(item.thumbAsset && deps.queueAssetThumb){
      deps.queueAssetThumb(item.thumbAsset, thumb);
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

    div.addEventListener('click', ev => deps.selectAssetItem(item.ref, {
      toggle: ev.ctrlKey || ev.metaKey,
      range: ev.shiftKey,
      rangeRefs: assetOrder,
    }));
    div.addEventListener('dblclick', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const asset = deps.getAssetByRef(item.ref) || item;
      const opened = deps.openAssetProperties ? deps.openAssetProperties(asset) : false;
      if(!opened && item.defaultAction) item.defaultAction();
    });
    div.addEventListener('contextmenu', ev => {
      ev.preventDefault(); ev.stopPropagation();
      if(!selectedAssetRefs().includes(item.ref)) deps.selectAssetItem(item.ref);
      deps.openMenu(deps.assetContextMenuItems(deps.getAssetByRef(item.ref)), ev.clientX, ev.clientY);
    });
    div.addEventListener('dragstart', ev => {
      const refs = selectedAssetRefs().includes(item.ref) ? selectedAssetRefs().slice() : [item.ref];
      deps.setAssetDragRef(item.ref);
      ev.dataTransfer.setData('application/x-lotking-asset', item.ref);
      ev.dataTransfer.setData('application/x-lotking-assets', JSON.stringify(refs));
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
    assetOrder = [];
    box.ondragover = e => {
      const types = Array.from(e.dataTransfer.types || []);
      if(types.includes('application/x-lotking-asset') || types.includes('application/x-lotking-assets')){
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      }
    };
    box.ondrop = e => {
      const refs = assetRefsFromDrop(e);
      if(refs.length && e.target === box){
        refs.forEach(ref => { delete deps.folderAssignments('assets')[ref]; });
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
    if(!counts.blueprints && !counts.logicBlueprints && !counts.levels && !counts.imported && !counts.projectAssets && !counts.scene){
      box.appendChild(deps.el('<div class="lk-empty">No assets visible.<br>Change filters or import GLB/GLTF files.</div>'));
    }
    deps.setStatusRight(
      (counts.blueprints ? counts.blueprints + ' car logic · ' : '') +
      (counts.logicBlueprints ? counts.logicBlueprints + ' logic elements · ' : '') +
      (counts.levels ? counts.levels + ' levels · ' : '') +
      (counts.imported ? counts.imported + ' imported · ' : '') +
      (counts.projectAssets ? counts.projectAssets + ' project assets · ' : '') +
      counts.scene + ' scene assets'
    );
  }

  function importedItems(q){
    return deps.assetLibraryLoad().map(asset => {
      const mb = asset.size ? ' · ' + (asset.size / 1e6).toFixed(1) + ' MB' : '';
      const isTexture = asset.kind === 'texture';
      const item = {
        kind:isTexture ? 'imported-texture' : 'imported-glb',
        ref:'imported:' + asset.id,
        id:asset.id,
        name:asset.source || asset.name || 'Imported Asset',
        sub:(isTexture ? 'texture/decal' : 'imported glb') + ' · ' + (asset.source || asset.key) + mb,
        source:asset.source || asset.key,
        icon:isTexture ? '▧' : '📦',
        thumbUrl:isTexture ? (asset.src || null) : null,
        thumbDbKey:isTexture ? (asset.dbKey || null) : null,
        thumbPromise:isTexture && !asset.src && !asset.dbKey && deps.resolveImportedAssetUrl ? () => deps.resolveImportedAssetUrl(asset) : null,
        thumbAsset:!isTexture ? asset : null,
        filterType:isTexture ? 'texture' : 'glb',
        draggable:true,
        raw:asset,
        badges: asset.rigged ? [{label:'Rigged', type:'rigged'}] : [],
      };
      const refItem = () => ({kind:item.kind, ref:item.ref, id:asset.id, name:asset.name, raw:asset});
      item.defaultAction = () => deps.placeAssetRef(refItem(), deps.spawnPointAhead());
      item.actions = [
        {label:isTexture ? 'Add' : 'Place', title:'Place this asset in front of the editor camera', fn:() => deps.placeAssetRef(refItem(), deps.spawnPointAhead())},
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
        {label:'🎛', title:tr('Open in Sound Designer', 'Apri nel Sound Designer'), fn:() => deps.openSoundDesigner(s.id)},
        {label:'🚗', title:tr('Assign to player vehicle', 'Assegna al veicolo player'), fn:() => {
          GAME.player.setEngineSound(s.id); deps.markDirty(); deps.refreshAssetsPanel();
          deps.status(tr('Sound set "', 'Sound set "') + s.name + tr('" assigned to vehicle', '" assegnato al veicolo'));
        }},
        {label:'⧉', title:tr('Duplicate', 'Duplica'), fn:() => { STORE.soundSets.duplicate(s.id); deps.refreshAssetsPanel(); }},
        {label:'×', title:tr('Delete', 'Elimina'), fn:() => {
          deps.confirmEditorAction({title:'Delete sound set?', message:tr('Delete sound set "', 'Eliminare il sound set "') + s.name + '"?', okText:tr('Delete', 'Elimina')}).then(ok => {
            if(!ok) return;
            STORE.soundSets.remove(s.id);
            if(assignedSoundSet === s.id){ GAME.player.setEngineSound(null); deps.markDirty(); }
            deps.refreshAssetsPanel();
          });
        }},
      ],
    })).filter(item => visible(item, q));
  }

  function blueprintItems(q){
    const STORE = deps.STORE;
    const items = [];
    if(STORE.playerBlueprints){
      const basePlayer = STORE.playerBlueprints.default() || deps.currentPlayerBlueprint();
      items.push({
        kind:'player-blueprint', ref:'blueprint:base', id:'base',
        name:'player_car Logic Base',
        sub:'special · required · used by new levels · controller index 0',
        source:'Project default', icon:'🚗', filterType:'blueprint', active:true, draggable:false,
        raw:{id:'base', name:'player_car Logic Base', player:basePlayer, base:true},
        base:true,
        badges: basePlayer && (basePlayer.modelDbKey || basePlayer.modelSrc) ? [{label:'Rigged', type:'rigged'}] : [{label:'Base', type:'base'}],
        defaultAction:() => deps.applyPlayerBlueprintAsset(basePlayer, {applySpawn:false}),
        actions:[
          {label:'Apply', title:'Apply to scene player', fn:() => deps.applyPlayerBlueprintAsset(basePlayer, {applySpawn:false})},
          {label:'Copy', title:'Copy current scene player_car logic as a reusable asset', fn:deps.copyPlayerBlueprintAsset},
        ],
      });
      STORE.playerBlueprints.list().forEach(asset => items.push({
        kind:'player-blueprint', ref:'blueprint:' + asset.id, id:asset.id,
        name:asset.name || 'player_car Logic Copy',
        sub:'copied car logic · controller index ' + (asset.controllerIndex == null ? 0 : asset.controllerIndex),
        source:asset.source && asset.source.levelName || 'Copied car logic',
        icon:'🚙', filterType:'blueprint', draggable:false,
        badges: asset.player && (asset.player.modelDbKey || asset.player.modelSrc) ? [{label:'Rigged', type:'rigged'}] : [],
        defaultAction:() => deps.applyPlayerBlueprintAsset(asset.player, {applySpawn:false}),
        actions:[
          {label:'Apply', title:'Apply to scene player', fn:() => deps.applyPlayerBlueprintAsset(asset.player, {applySpawn:false})},
          {label:'★', title:'Promote to Base car logic', fn:() => deps.setDefaultPlayerBlueprintAsset(asset)},
          {label:'×', title:'Delete copied car logic', fn:() => deps.deletePlayerBlueprintAsset(asset)},
        ],
      }));
    }
    return items.filter(item => visible(item, q));
  }

  function logicBlueprintItems(q){
    const STORE = deps.STORE;
    const templates = window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.list ? window.LK_LOGIC_TEMPLATES.list().map(template => ({
      kind:'logic-template',
      ref:'logic-template:' + template.id,
      id:template.id,
      name:template.name || 'Logic Element Template',
      sub:(template.category || 'Template') + ' template · local editable copy',
      source:'Built-in Logic Element template',
      icon:'◇',
      badges:[{type:'info', label:'Template'}],
      filterType:'blueprint',
      draggable:true,
      raw:template,
      defaultAction:() => deps.placeAssetRef({kind:'logic-template', ref:'logic-template:' + template.id, id:template.id, name:template.name, raw:template}, deps.spawnPointAhead()),
      actions:[
        {label:'+', title:tr('Place editable local copy', 'Piazza copia locale editabile'), fn:() => deps.placeAssetRef({kind:'logic-template', ref:'logic-template:' + template.id, id:template.id, name:template.name, raw:template}, deps.spawnPointAhead())},
      ],
    })) : [];
    const assets = STORE.logicElementAssets ? STORE.logicElementAssets.list().map(asset => ({
      kind:'logic-blueprint',
      ref:'logic-blueprint:' + asset.id,
      id:asset.id,
      name:asset.name || 'Logic Element',
      sub:'reusable Logic Element · ' + (asset.graph && asset.graph.nodes ? asset.graph.nodes.length : 0) + ' nodes',
      source:'Reusable Logic Element',
      icon:'◇',
      filterType:'blueprint',
      draggable:true,
      raw:asset,
      defaultAction:() => deps.placeAssetRef({kind:'logic-blueprint', ref:'logic-blueprint:' + asset.id, id:asset.id, name:asset.name, raw:asset}, deps.spawnPointAhead()),
      actions:[
        {label:'+', title:tr('Place linked instance', 'Piazza istanza collegata'), fn:() => deps.placeAssetRef({kind:'logic-blueprint', ref:'logic-blueprint:' + asset.id, id:asset.id, name:asset.name, raw:asset}, deps.spawnPointAhead())},
      ],
    })) : [];
    return templates.concat(assets).filter(item => visible(item, q));
  }

  function sceneItems(q){
    function sampleEntryKind(item){
      return item && item.sample && item.sample.userData && item.sample.userData.addedEntry && item.sample.userData.addedEntry.kind || '';
    }
    function looksLikeGlbAsset(item){
      const entry = item && item.sample && item.sample.userData && item.sample.userData.addedEntry;
      if(!entry || typeof entry !== 'object') return false;
      if(entry.kind === 'glb') return true;
      if(entry.dbKey || (entry.asset && entry.asset.dbKey)) return true;
      const type = entry.kind;
      if(type === 'light' || type === 'effect') return false;
      const src = entry.src || (entry.asset && (entry.asset.src || entry.asset.source)) || entry.assetName || entry.name;
      const source = String(src || '').toLowerCase();
      if(!source) return false;
      if(source.startsWith('data:') || source.startsWith('blob:')) return true;
      return /(\.glb|\.gltf)(?:[?#].*)?$/i.test(source);
    }

    return deps.collectAssets().map(a => ({
      kind:'scene', ref:'scene:' + a.key, key:a.key, name:a.name,
      filterType: looksLikeGlbAsset(a) ? 'glb' :
        sampleEntryKind(a) === 'light' ? 'light' :
        sampleEntryKind(a) === 'effect' ? 'effect' :
        sampleEntryKind(a) === 'texture' ? 'texture' :
        sampleEntryKind(a) === 'cinemaStudio' ? 'scene' :
        'scene',
      type:a.type, sub:a.type + ' · ' + a.instances.length + ' instances · ' + a.source,
      source:a.source, icon:deps.entityIcon(a.sample), thumbObject:a.sample,
      draggable:['mesh','light','effect','cinemaStudio'].includes(a.type),
      defaultAction:() => { deps.selectObject(a.instances[0]); deps.setLeftMode('scene'); },
      actions:[
        {label:sampleEntryKind(a) === 'cinemaStudio' ? 'Open' : 'Select', title:'Select the first instance in scene', fn:() => { deps.selectObject(a.instances[0]); deps.setLeftMode('scene'); }},
        {label:'+', title:'Duplicate a new instance near the editor camera', fn:() => deps.placeAssetRef({kind:'scene', ref:'scene:' + a.key, key:a.key, name:a.name, type:a.type, raw:a}, deps.spawnPointAhead())},
      ],
    })).filter(item => visible(item, q));
  }

  function projectAssetItems(q){
    return (deps.collectProjectAssets ? deps.collectProjectAssets() : []).filter(item => visible(item, q));
  }

  function refresh(box, q){
    preparePanel(box);
    q = q || '';
    const allFolderedItems = [];

    const blueprints = blueprintItems(q);
    addGroup(box, 'PLAYER CAR LOGIC', blueprints);
    allFolderedItems.push(...blueprints);

    const logicBlueprints = logicBlueprintItems(q);
    addGroup(box, 'LOGIC ELEMENTS', logicBlueprints);
    allFolderedItems.push(...logicBlueprints);

    const sounds = soundSetItems(q);
    addGroup(box, 'ENGINE SOUND SETS', sounds);
    allFolderedItems.push(...sounds);

    const levels = levelItems(q);
    addGroup(box, 'LEVELS', levels);
    allFolderedItems.push(...levels);

    const imported = importedItems(q);
    const projectAssets = imported.concat(projectAssetItems(q));
    addGroup(box, 'PROJECT ASSETS', projectAssets);
    allFolderedItems.push(...projectAssets);

    const scene = sceneItems(q);
    allFolderedItems.push(...scene);

    addGroup(box, 'FOLDERS / ALL ASSETS', allFolderedItems, true);
    finishPanel(box, {
      blueprints: blueprints.length,
      logicBlueprints: logicBlueprints.length,
      levels: levels.length,
      imported: imported.length,
      projectAssets: projectAssets.length,
      scene: scene.length,
    });
  }

  return Object.freeze({
    button, makeCard, visible, addGroup, preparePanel, finishPanel,
    importedItems, levelItems, soundSetItems, blueprintItems, logicBlueprintItems, sceneItems, refresh,
  });
}

window.LK_EDITOR_ASSET_PANEL = Object.freeze({create});
})();
