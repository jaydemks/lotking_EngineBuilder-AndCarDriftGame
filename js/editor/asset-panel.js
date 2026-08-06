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
    div.className = 'lk-asset-item lk-asset-' + item.kind + (item.elementType ? ' lk-element-' + item.elementType : '') + (selectedAssetRefs().includes(item.ref) ? ' sel' : '') + (item.active ? ' active' : '');
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

  function addOriginHeader(box, title, subtitle, origin){
    const header=documentRef.createElement('div');header.className='lk-asset-origin lk-asset-origin-'+origin;
    const name=documentRef.createElement('strong');name.textContent=title;
    const description=documentRef.createElement('span');description.textContent=subtitle;
    header.append(name,description);box.appendChild(header);return header;
  }

  function addGroup(box, title, items, folderAware, options){
    options=options||{};
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
      .filter(item => options.respectFolders===false||!assignments[item.ref] || !deps.folderById('assets', assignments[item.ref]))
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
    if(!counts.engine && !counts.user && !counts.plugin){
      box.appendChild(deps.el('<div class="lk-empty">No assets visible.<br>Change filters or import FBX/GLB/GLTF files.</div>'));
    }
    deps.setStatusRight(
      counts.engine+' engine assets · '+counts.user+' user assets'+(counts.plugin?' · '+counts.plugin+' plugin assets':'')
    );
  }

  function importedItems(q){
    return deps.assetLibraryLoad().map(asset => {
      const mb = asset.size ? ' · ' + (asset.size / 1e6).toFixed(1) + ' MB' : '';
      const isTexture = asset.kind === 'texture';
      const item = {
        kind:isTexture ? 'imported-texture' : 'imported-glb',
        assetOrigin:'user',
        ref:'imported:' + asset.id,
        id:asset.id,
        name:asset.source || asset.name || 'Imported Asset',
        sub:(isTexture ? 'texture/decal' : (asset.sourceFormat === 'fbx' ? 'FBX source · GLB runtime build' : 'imported glb')) + ' · ' + (asset.source || asset.key) + mb,
        source:asset.source || asset.key,
        icon:isTexture ? '▧' : '📦',
        thumbUrl:isTexture ? (asset.src || null) : null,
        thumbDbKey:isTexture ? (asset.dbKey || null) : null,
        thumbPromise:isTexture && !asset.src && !asset.dbKey && deps.resolveImportedAssetUrl ? () => deps.resolveImportedAssetUrl(asset) : null,
        thumbAsset:!isTexture ? asset : null,
        filterType:isTexture ? 'texture' : 'glb',
        draggable:true,
        raw:asset,
        badges: (asset.vehicleRigged ? [{label:'Vehicle rig', type:'rigged'}] :
          asset.skeletonRigged ? [{label:'Skeleton', type:'rigged'}] :
          asset.rigged ? [{label:'Rigged', type:'rigged'}] : [{label:'Static', type:'base'}])
          .concat(asset.sourceFormat === 'fbx' ? [{label:asset.sourceDbKey||asset.sourceSrc?'FBX SOURCE':'FBX→GLB', type:'converted'}] : [])
          .concat(Array.isArray(asset.conversionWarnings) && asset.conversionWarnings.length ? [{label:'Warnings', type:'warning'}] : []),
      };
      const refItem = () => ({kind:item.kind, ref:item.ref, id:asset.id, name:asset.name, raw:asset});
      item.defaultAction = () => deps.placeAssetRef(refItem(), deps.spawnPointAhead());
      item.actions = [
        {label:isTexture ? 'Add' : 'Place', title:'Place this asset in front of the editor camera', fn:() => deps.placeAssetRef(refItem(), deps.spawnPointAhead())},
        {label:'×', title:tr('Remove selected assets from imported library','Rimuovi gli asset selezionati dalla libreria importati'), fn:() => {
          const refs=selectedAssetRefs();
          const selected=refs.includes(item.ref)?refs.map(ref=>deps.getAssetByRef(ref)).filter(entry=>entry&&(entry.kind==='imported-glb'||entry.kind==='imported-texture')).map(entry=>entry.raw):[];
          deps.deleteImportedAssets(selected.length>1?selected:[asset]);
        }},
      ];
      return item;
    }).filter(item => visible(item, q));
  }

  // Every pack of bundled content, not only the Sketchbook one: the default
  // character mannequins are bundled the same way and are FBX rather than GLB, so
  // neither the pack nor the format may be hard-wired here or they never appear.
  function bundledPacks(){
    const packs = [];
    const dollbody = window.LK_LOGIC_TEMPLATES_SKETCHBOOK;
    if(dollbody && dollbody.ASSETS) packs.push({assets:dollbody.ASSETS, label:'DollBody', licence:'MIT'});
    const characters = window.LK_LOGIC_TEMPLATES_CHARACTER;
    if(characters && characters.BODY_TYPES && characters.bodyAsset){
      const bodies = {};
      Object.keys(characters.BODY_TYPES).forEach(id => { bodies[id] = characters.bodyAsset(id); });
      packs.push({assets:bodies, label:'character', licence:'Mixamo'});
      if(characters.motionAssets) packs.push({assets:characters.motionAssets(), label:'character animation', licence:'Mixamo'});
    }
    return packs;
  }
  function bundledItems(q){
    const assets = [];
    bundledPacks().forEach(pack => {
      Object.keys(pack.assets).forEach(key => {
        const asset = pack.assets[key];
        if(asset && asset.id && asset.src) assets.push({asset, pack});
      });
    });
    return assets.map(({asset, pack}) => {
      const format = String(asset.kind || 'glb').toLowerCase();
      const item = {
        kind:'bundled-glb', assetOrigin:'engine', ref:'bundled:' + asset.id, id:asset.id,
        name:asset.name || asset.id,
        sub:'bundled ' + pack.label + ' ' + format.toUpperCase() + ' · ' + pack.licence + ' · ' + asset.src,
        source:asset.source || asset.src, icon:asset.assetRole === 'animation' ? '🎞' : '📦', filterType:format, draggable:true,
        raw:asset, badges:[{label:'Bundled',type:'base'}].concat(asset.assetRole === 'animation' ? [{label:'Animation',type:'rigged'}] : []).concat([{label:pack.licence,type:'converted'}]),
      };
      const refItem = () => ({kind:item.kind,ref:item.ref,id:asset.id,name:item.name,raw:asset});
      // A motion-only FBX has an animation take but no scene model worth placing.
      // It stays draggable into animation pickers / Pawn Studio.
      item.defaultAction = asset.assetRole === 'animation' ? null : () => deps.placeAssetRef(refItem(), deps.spawnPointAhead());
      item.actions = asset.assetRole === 'animation' ? [] : [{label:'Place',title:tr('Place this bundled asset in front of the editor camera','Piazza questo asset incluso davanti alla camera editor'),fn:() => deps.placeAssetRef(refItem(), deps.spawnPointAhead())}];
      return item;
    }).filter(item => visible(item, q));
  }

  function proceduralItems(q){
    const api=window.LK_ENGINE_PROCEDURAL_ASSETS;
    return api&&api.list?api.list().map(descriptor=>{
      const item={kind:'procedural-asset',assetOrigin:'engine',ref:'procedural:'+descriptor.type,id:descriptor.type,name:descriptor.name,
        sub:'parametric · material / UV / collision · deterministic',source:'Engine Procedural Assets',icon:descriptor.icon,thumbUrl:descriptor.thumbnail,
        filterType:'other',draggable:true,raw:descriptor,badges:[{label:'Procedural',type:'template'},{label:'Serializable',type:'base'}]};
      const refItem=()=>({kind:item.kind,assetOrigin:'engine',ref:item.ref,id:item.id,name:item.name,raw:descriptor});
      item.defaultAction=()=>deps.placeAssetRef(refItem(),deps.spawnPointAhead());
      item.actions=[{label:'Place',title:tr('Place an editable procedural instance','Piazza un’istanza procedurale modificabile'),fn:item.defaultAction}];
      return item;
    }).filter(item=>visible(item,q)):[];
  }

  function levelItems(q){
    const LV = deps.levelsApi();
    return (LV ? LV.list() : []).map(l => ({
      kind:'level', assetOrigin:'user', ref:'level:' + l.id, id:l.id, name:l.name + (l.active ? ' · ACTIVE' : ''),
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
      kind:'sound-set', assetOrigin:'user', ref:'sound:' + s.id, id:s.id,
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
        kind:'player-blueprint', assetOrigin:'user', ref:'blueprint:base', id:'base',
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
        kind:'player-blueprint', assetOrigin:'user', ref:'blueprint:' + asset.id, id:asset.id,
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
    const classify = graph => {
      if(graph && graph.sketchbookPawn) return graph.sketchbookPawn.kind === 'advanced-character'
        ? {type:'character', label:'DollBody Character', icon:'♟'}
        : {type:'vehicle', label:'DollBody Vehicle', icon:'🚁'};
      if(graph && graph.vehiclePawn) return {type:'vehicle', label:'Vehicle Logic', icon:'🚗'};
      if(graph && graph.characterPawn) return {type:'character', label:'Character Logic', icon:'♟'};
      if(graph && graph.soccerPawn) return {type:'character', label:'Soccer Character', icon:'⚽'};
      const components = graph && graph.logicScene && graph.logicScene.components || [];
      if(components.some(item => item && /anim/i.test(item.type || item.name || ''))) return {type:'animation', label:'Animation', icon:'▶'};
      if(components.some(item => item && /rig|skeleton|bone/i.test(item.type || item.name || ''))) return {type:'rig', label:'Rig', icon:'♙'};
      return {type:'logic', label:'Logic', icon:'◇'};
    };
    const deleteReusableLogicAsset = asset => {
      if(!asset || !STORE.logicElementAssets || !STORE.logicElementAssets.deleteAsset) return;
      const linked = deps.GAME && deps.GAME.world && Array.isArray(deps.GAME.world.registry)
        ? deps.GAME.world.registry.filter(item => item && item.userData && item.userData.logicLinked && item.userData.logicAssetId === asset.id)
        : [];
      if(linked.length){
        deps.status(tr(
          'Cannot delete "' + asset.name + '": ' + linked.length + ' linked scene instance(s). Make them local or delete them first.',
          'Impossibile eliminare "' + asset.name + '": ' + linked.length + ' istanza/e della scena collegate. Rendile locali o eliminale prima.'
        ));
        return;
      }
      deps.confirmEditorAction({
        title:tr('Delete reusable Logic Element?', 'Eliminare il Logic Element riutilizzabile?'),
        message:tr('Delete "' + asset.name + '" from this project?', 'Eliminare "' + asset.name + '" da questo progetto?'),
        okText:tr('Delete', 'Elimina'),
      }).then(ok => {
        if(!ok) return;
        STORE.logicElementAssets.deleteAsset(asset.id);
        const ref = 'logic-blueprint:' + asset.id;
        delete deps.folderAssignments('assets')[ref];
        deps.writeFolderState();
        deps.markDirty();
        deps.refreshAssetsPanel();
        deps.status(tr('Reusable Logic Element deleted', 'Logic Element riutilizzabile eliminato'));
      });
    };
    const templates = window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.list ? window.LK_LOGIC_TEMPLATES.list().map(template => {
      const category = classify(template.graph);
      return {
      kind:'logic-template', assetOrigin:'engine',
      ref:'logic-template:' + template.id,
      id:template.id,
      name:template.name || 'Logic Element Template',
      sub:(template.category || 'Template') + ' template · local editable copy',
      source:'Built-in Logic Element template',
      icon:category.icon,
      elementType:category.type,
      badges:[{type:category.type, label:category.label}, {type:'template', label:'Master Template'}],
      filterType:'blueprint',
      draggable:true,
      raw:template,
      defaultAction:() => deps.placeAssetRef({kind:'logic-template', ref:'logic-template:' + template.id, id:template.id, name:template.name, raw:template}, deps.spawnPointAhead()),
      actions:[
        {label:'+', title:tr('Place editable local copy', 'Piazza copia locale editabile'), fn:() => deps.placeAssetRef({kind:'logic-template', ref:'logic-template:' + template.id, id:template.id, name:template.name, raw:template}, deps.spawnPointAhead())},
      ],
    };}) : [];
    const assets = STORE.logicElementAssets ? STORE.logicElementAssets.list().map((asset, assetIndex) => {
      const category = classify(asset.graph);
      return {
      kind:'logic-blueprint', assetOrigin:'user',
      ref:'logic-blueprint:' + asset.id,
      id:asset.id,
      name:asset.name || 'Logic Element',
      sub:'Project Asset ' + (assetIndex + 1) + ' · ' + (asset.graph && asset.graph.nodes ? asset.graph.nodes.length : 0) + ' nodes · ' + String(asset.id || '').slice(-7),
      source:'Reusable Logic Element',
      icon:category.icon,
      elementType:category.type,
      badges:[{type:category.type, label:category.label}, {type:'project', label:'Project Asset'}],
      filterType:'blueprint',
      draggable:true,
      raw:asset,
      defaultAction:() => deps.placeAssetRef({kind:'logic-blueprint', ref:'logic-blueprint:' + asset.id, id:asset.id, name:asset.name, raw:asset}, deps.spawnPointAhead()),
      actions:[
        {label:'+', title:tr('Place linked instance', 'Piazza istanza collegata'), fn:() => deps.placeAssetRef({kind:'logic-blueprint', ref:'logic-blueprint:' + asset.id, id:asset.id, name:asset.name, raw:asset}, deps.spawnPointAhead())},
        {label:'×', title:tr('Delete reusable asset', 'Elimina asset riutilizzabile'), fn:() => deleteReusableLogicAsset(asset)},
      ],
    };}) : [];
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
      kind:'scene', assetOrigin:'user', ref:'scene:' + a.key, key:a.key, name:a.name,
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
    return (deps.collectProjectAssets ? deps.collectProjectAssets() : []).map(item=>Object.assign({},item,{assetOrigin:'user'})).filter(item => visible(item, q));
  }

  function pluginItems(q, includeFiltered){
    const providers=deps.pluginAssetProviders?deps.pluginAssetProviders():[],plugins=deps.pluginList?deps.pluginList():[];
    const pluginNames=new Map(plugins.map(plugin=>[String(plugin.id),plugin.name||plugin.id]));
    const items=[];
    providers.forEach(provider=>{
      let supplied=[];
      try{supplied=typeof provider.assets==='function'?provider.assets({GAME:deps.GAME,STORE:deps.STORE}):(provider.assets||[]);}catch(err){console.warn('LotKing plugin asset provider failed:',provider.pluginId,err);}
      (Array.isArray(supplied)?supplied:[]).forEach((descriptor,index)=>{
        if(!descriptor)return;
        const pluginId=String(provider.pluginId||'plugin'),providerId=String(provider.id||'assets'),id=String(descriptor.id||descriptor.key||index),pluginName=pluginNames.get(pluginId)||pluginId;
        const item={
          kind:'plugin-asset',assetOrigin:'plugin',pluginId,pluginName,providerId,
          ref:'plugin:'+encodeURIComponent(pluginId)+':'+encodeURIComponent(providerId)+':'+encodeURIComponent(id),id,
          name:String(descriptor.name||id||'Plugin Asset'),sub:String(descriptor.sub||descriptor.description||pluginName+' asset'),
          source:String(descriptor.source||pluginName),icon:descriptor.icon||'🧩',filterType:descriptor.filterType||descriptor.type||'other',
          thumbUrl:descriptor.thumbUrl||descriptor.thumbnail||null,thumbDbKey:descriptor.thumbDbKey||null,thumbAsset:descriptor.thumbAsset||null,
          draggable:descriptor.draggable!==false&&typeof descriptor.place==='function',raw:{descriptor,provider},
          badges:[{label:pluginName,type:'plugin'}].concat(Array.isArray(descriptor.badges)?descriptor.badges:[]),
        };
        const refItem=()=>({kind:item.kind,assetOrigin:'plugin',ref:item.ref,id:item.id,name:item.name,pluginId,raw:item.raw});
        if(typeof descriptor.place==='function'){
          item.defaultAction=()=>deps.placeAssetRef(refItem(),deps.spawnPointAhead());
          item.actions=[{label:descriptor.actionLabel||'Place',title:descriptor.actionTitle||tr('Place this plugin asset','Piazza questo asset del plugin'),fn:item.defaultAction}];
        } else item.actions=[];
        (Array.isArray(descriptor.actions)?descriptor.actions:[]).forEach(action=>{
          if(!action||typeof action.run!=='function')return;
          item.actions.push({label:action.label||'Open',title:action.title||'',fn:()=>action.run({asset:descriptor,GAME:deps.GAME,STORE:deps.STORE})});
        });
        if(includeFiltered||visible(item,q||''))items.push(item);
      });
    });
    return items;
  }

  function refresh(box, q){
    preparePanel(box);
    q = q || '';
    const blueprints=blueprintItems(q),logicItems=logicBlueprintItems(q),engineLogic=logicItems.filter(item=>item.assetOrigin==='engine'),userLogic=logicItems.filter(item=>item.assetOrigin==='user');
    const bundled=bundledItems(q),procedural=proceduralItems(q),sounds=soundSetItems(q),levels=levelItems(q),imported=importedItems(q),projectAssets=projectAssetItems(q),scene=sceneItems(q);
    const userItems=[...blueprints,...userLogic,...sounds,...levels,...imported,...projectAssets,...scene];
    const plugins=pluginItems(q);

    if(engineLogic.length||bundled.length||procedural.length){
      addOriginHeader(box,'ENGINE ASSETS',tr('Assets shipped with and required by the engine','Asset inclusi e necessari al motore'),'engine');
      addGroup(box,'LOGIC TEMPLATES · VEHICLES',engineLogic.filter(item=>item.elementType==='vehicle'),false,{respectFolders:false});
      addGroup(box,'LOGIC TEMPLATES · CHARACTERS',engineLogic.filter(item=>item.elementType==='character'),false,{respectFolders:false});
      addGroup(box,'LOGIC TEMPLATES · GENERAL',engineLogic.filter(item=>item.elementType==='logic'),false,{respectFolders:false});
      addGroup(box,'ANIMATION & RIG TEMPLATES',engineLogic.filter(item=>item.elementType==='animation'||item.elementType==='rig'),false,{respectFolders:false});
      addGroup(box,'BUILT-IN MODELS & PACKS',bundled,false,{respectFolders:false});
      addGroup(box,'PROCEDURAL BUILDING KIT',procedural,false,{respectFolders:false});
    }

    if(userItems.length||deps.folderList('assets').length){
      addOriginHeader(box,'USER ASSETS',tr('Project, imported, authored and scene assets','Asset del progetto, importati, creati e della scena'),'user');
      addGroup(box,'PLAYER CAR LOGIC',blueprints);
      addGroup(box,'REUSABLE LOGIC · VEHICLES',userLogic.filter(item=>item.elementType==='vehicle'));
      addGroup(box,'REUSABLE LOGIC · CHARACTERS',userLogic.filter(item=>item.elementType==='character'));
      addGroup(box,'REUSABLE LOGIC · GENERAL',userLogic.filter(item=>!['vehicle','character'].includes(item.elementType)));
      addGroup(box,'SOUND SETS',sounds);
      addGroup(box,'LEVELS',levels);
      addGroup(box,'IMPORTED & PROJECT ASSETS',[...imported,...projectAssets]);
      addGroup(box,'CURRENT SCENE ASSETS',scene);
      addGroup(box,'USER FOLDERS',userItems,true);
    }

    if(plugins.length){
      addOriginHeader(box,'PLUGIN ASSETS',tr('Assets exposed by currently enabled plugins','Asset esposti dai plugin attualmente attivi'),'plugin');
      const names=Array.from(new Set(plugins.map(item=>item.pluginName))).sort((a,b)=>a.localeCompare(b));
      names.forEach(name=>addGroup(box,name.toUpperCase(),plugins.filter(item=>item.pluginName===name),false,{respectFolders:false}));
    }

    finishPanel(box,{engine:engineLogic.length+bundled.length+procedural.length,user:userItems.length,plugin:plugins.length});
  }

  return Object.freeze({
    button, makeCard, visible, addOriginHeader, addGroup, preparePanel, finishPanel,
    importedItems, bundledItems, proceduralItems, levelItems, soundSetItems, blueprintItems, logicBlueprintItems, sceneItems, pluginItems, refresh,
  });
}

window.LK_EDITOR_ASSET_PANEL = Object.freeze({create});
})();
