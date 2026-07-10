/* =========================================================
   LOT KING — EDITOR OUTLINER
   Renders the scene tree and wires scene-row interactions.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const ED = deps.ED;
  const GAME = deps.GAME;
  const $ = deps.$;
  const documentRef = deps.document || document;
  const selectPlayerCollider = deps.selectPlayerCollider;
  const selectColliderPart = deps.selectColliderPart;
  let sceneDragId = null;
  const linkExpanded = Object.create(null);
  let sceneIndex = new Map();
  let visibleSceneOrder = [];
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function selectedSceneObjects(){
    return Array.isArray(ED.multiSelected) && ED.multiSelected.length > 1 ? ED.multiSelected.filter(Boolean) : (ED.selected ? [ED.selected] : []);
  }

  function selectedSceneIds(fallback){
    const ids = selectedSceneObjects()
      .filter(o => o && o.userData && o.userData.editorId && !o.__lkSynthetic)
      .map(o => o.userData.editorId);
    const fallbackId = fallback && fallback.userData && fallback.userData.editorId;
    if(fallbackId && !ids.includes(fallbackId)) ids.push(fallbackId);
    return ids;
  }

  function idsFromDrop(e){
    if(!e || !e.dataTransfer) return [];
    const raw = e.dataTransfer.getData('application/x-lotking-scene-objects');
    if(raw){
      try {
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch(err){}
    }
    const single = e.dataTransfer.getData('application/x-lotking-scene-object');
    return single ? [single] : [];
  }

  function visibleEntities(){
    return GAME.world.registry.filter(o => {
      if(!o || !o.userData) return false;
      if(ED.filter === 'added' && o.userData.builtin) return false;
      if(ED.filter === 'builtin' && !o.userData.builtin) return false;
	      if(['mesh','light','effect','camera','cinemaStudio','logicElement'].includes(ED.filter) && o.userData.editorType !== ED.filter) return false;
      if(ED.search && !(o.userData.editorName || '').toLowerCase().includes(ED.search)) return false;
      return true;
    });
  }

  function isExpanded(id){
    return linkExpanded[id] !== false;
  }
  function toggleExpanded(id){
    linkExpanded[id] = !isExpanded(id);
  }

  function buildTree(items){
    const byId = new Map();
    const children = Object.create(null);
    const roots = [];
    const playerId = GAME.player && GAME.player.car && GAME.player.car.userData && GAME.player.car.userData.editorId;

    items.forEach(item => {
      if(item && item.userData && item.userData.editorId) byId.set(item.userData.editorId, item);
    });

    items.forEach(item => {
      const itemId = item && item.userData && item.userData.editorId;
      const rawParentId = item && item.userData && item.userData.linkParentId;
      const parentRef = item && item.parent;
      const parentFromScene = parentRef && parentRef.userData && parentRef.userData.editorId;
      const parentId = rawParentId === 'player' && playerId ? playerId : (rawParentId || parentFromScene);
      if(parentId && byId.has(parentId) && parentId !== itemId){
        if(!children[parentId]) children[parentId] = [];
        children[parentId].push(item);
      } else {
        roots.push(item);
      }
    });

    return {roots, children};
  }

  function renderEntity(o, depth, hasChildren){
    const id = o.userData.editorId;
    const div = documentRef.createElement('div');
    const isSyntheticSelection = o && (
      (o.__lkSpecialSelect === 'playerCollider' && ED.playerColliderEdit) ||
      (o.__lkSpecialSelect === 'colliderPart' && ED.colliderEdit && o.userData && ED.selected && ED.selected.userData &&
        o.userData.linkParentId === ED.selected.userData.editorId &&
        o.userData.editorId === ED.selected.userData.editorId + '_collider_part_' + ED.colliderPartIndex)
    );
    const selected = selectedSceneObjects().includes(o) || isSyntheticSelection;
    div.className = 'lk-item' + (selected ? ' sel' : '') + (o.visible ? '' : ' hidden-e');
    div.dataset.id = id;
    div.draggable = o && o.__lkSkipControls ? false : true;
    div.style.paddingLeft = ((ED.sceneViewMode === 'list') ? (4 + (depth || 0) * 16) : 4) + 'px';

    const toggle = documentRef.createElement('span');
    toggle.className = 'lk-link-arrow';
    toggle.textContent = hasChildren ? (isExpanded(id) ? '▾' : '▸') : '';
    if(hasChildren){
      toggle.title = isExpanded(id) ? 'Collapse' : 'Expand';
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        toggleExpanded(id);
        refresh();
      });
    }

    const thumb = documentRef.createElement('div');
    thumb.className = 'lk-thumb';
    const thumbCache = deps.thumbCache;
    if(thumbCache && thumbCache.has(id)){
      const cached = thumbCache.get(id);
      if(cached) thumb.style.backgroundImage = 'url(' + cached + ')';
      else thumb.textContent = deps.entityIcon(o);
    } else {
      thumb.textContent = deps.entityIcon(o);
      if(o.userData.editorType === 'mesh') deps.queueThumb(o, thumb);
    }

    const name = documentRef.createElement('span');
    name.className = 'lk-name';
    name.textContent = o.userData.editorName || id;
    name.title = (o.userData.builtin ? tr('(original) ', '(originale) ') : tr('(added) ', '(aggiunto) ')) + (o.userData.editorName || id);

    const eye = documentRef.createElement('button');
    eye.className = 'lk-eye'; eye.textContent = o.visible ? '👁' : '—'; eye.title = tr('Show/Hide', 'Mostra/Nascondi');
    if(!o.__lkSkipControls){
      eye.addEventListener('click', ev => { ev.stopPropagation(); deps.toggleVisible(o); });
    } else {
      eye.disabled = true;
      eye.style.opacity = '.34';
      eye.tabIndex = -1;
    }

    const del = documentRef.createElement('button');
    del.className = 'lk-del'; del.textContent = '×'; del.title = tr('Delete', 'Elimina');
    if(!o.__lkSkipControls){
      del.addEventListener('click', ev => {
        ev.stopPropagation();
        if(selectedSceneObjects().includes(o) && selectedSceneObjects().length > 1 && deps.requestDeleteSelection) deps.requestDeleteSelection();
        else deps.requestDeleteEntity(o);
      });
    } else {
      del.style.opacity = '.34';
      del.tabIndex = -1;
    }

    div.append(toggle, thumb, name, eye, del);
    div.addEventListener('dragstart', ev => {
      sceneDragId = id;
      const ids = selectedSceneIds(o);
      ev.dataTransfer.setData('application/x-lotking-scene-object', id);
      ev.dataTransfer.setData('application/x-lotking-scene-objects', JSON.stringify(ids));
      ev.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragend', () => { sceneDragId = null; });
    div.addEventListener('dragover', e => {
      const types = Array.from(e.dataTransfer && e.dataTransfer.types || []);
      if(e.shiftKey && (types.includes('application/x-lotking-scene-object') || types.includes('application/x-lotking-scene-objects'))){
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        div.classList.add('link-drop-ok');
      }
    });
    div.addEventListener('dragleave', () => { div.classList.remove('link-drop-ok'); });
    div.addEventListener('drop', e => {
      const ids = idsFromDrop(e).filter(fromId => fromId && fromId !== id);
      if(!e.shiftKey || !ids.length || !deps.linkToParent) return;
      e.preventDefault();
      e.stopPropagation();
      div.classList.remove('link-drop-ok');
      ids.forEach(fromId => {
        const fromObj = sceneIndex.get(fromId);
        if(fromObj && fromObj !== o && !fromObj.__lkSynthetic) deps.linkToParent(fromObj, o);
      });
      refresh();
    });
    deps.bindReplaceDropTarget(div, o);
    div.addEventListener('click', ev => {
      if(typeof o.__lkSpecialActivate === 'function') return o.__lkSpecialActivate();
      if(deps.selectObjectWithModifiers){
        return deps.selectObjectWithModifiers(o, {
          toggle: ev.ctrlKey || ev.metaKey,
          range: ev.shiftKey,
          rangeObjects: visibleSceneOrder,
        });
      }
      return deps.selectObject(o);
    });
    div.addEventListener('dblclick', () => {
      if(typeof o.__lkSpecialActivate === 'function') return o.__lkSpecialActivate();
      deps.selectObject(o); deps.focusSelected();
    });
    div.addEventListener('contextmenu', ev => {
      ev.preventDefault(); ev.stopPropagation();
      if(o && o.__lkSkipContext) return;
      if(!selectedSceneObjects().includes(o) && !(o.userData && o.userData.editorType === 'cinemaStudio')) deps.selectObject(o);
      deps.openMenu(deps.objectMenuItems(o, true), ev.clientX, ev.clientY);
    });
    return div;
  }

  function withSyntheticExtras(items){
    const expanded = items.slice();
    if(typeof selectColliderPart === 'function'){
      items.forEach(item => {
        const ud = item && item.userData;
        const col = ud && ud.collider;
        const ref = col && col.ref;
        const shape = ud && ud.colliderShape || {};
        if(!ud || !ud.editorId || !ref || ref.enabled === false || shape.mode !== 'complex' || !Array.isArray(ref.parts) || !ref.parts.length) return;
        ref.parts.forEach((part, index) => {
          if(!part) return;
          const partName = part.partName || (shape.parts && shape.parts[index] && shape.parts[index].name) || ('Collider ' + (index + 1));
          const partMode = part.partMode || (shape.parts && shape.parts[index] && shape.parts[index].mode) || 'complex';
          expanded.push({
            __lkSynthetic: true,
            __lkSpecialSelect: 'colliderPart',
            __lkSpecialActivate: () => selectColliderPart(item, index),
            __lkSkipContext: true,
            __lkSkipControls: true,
            userData: {
              editorId: ud.editorId + '_collider_part_' + index,
              editorName: partName + ' · ' + (partMode === 'off' ? 'Off' : (partMode === 'solid' ? 'Solid' : 'Complex')),
              editorType: 'colliderPart',
              builtin: !!ud.builtin,
              linkParentId: ud.editorId,
            },
            visible: part.enabled !== false,
          });
        });
      });
    }
    const car = GAME.player && GAME.player.car;
    if(!car || !car.userData || !car.userData.editorId || !GAME.player.collision || typeof selectPlayerCollider !== 'function') return expanded;
    const collisionId = 'player_collision_' + car.userData.editorId;
    const hasCollisionRow = expanded.some(item => item && item.userData && item.userData.editorId === collisionId);
    if(hasCollisionRow) return expanded;
    const collisionRow = {
      __lkSynthetic: true,
      __lkSpecialSelect: 'playerCollider',
      __lkSpecialActivate: () => selectPlayerCollider(),
      __lkSkipContext: true,
      __lkSkipControls: true,
      userData: {
        editorId: collisionId,
        editorName: 'Collision Box',
        editorType: 'playerCollider',
        builtin: true,
        linkParentId: car.userData.editorId,
      },
      visible: true,
    };
    return expanded.concat(collisionRow);
  }

  function renderLinkedTree(box, list, depthBase){
    const tree = buildTree(list);
    const seen = new Set();

    function walk(item, depth){
      const itemId = item && item.userData && item.userData.editorId;
      if(!itemId || seen.has(itemId)) return;
      seen.add(itemId);
      const childList = tree.children[itemId] || [];
      box.appendChild(renderEntity(item, (depthBase || 0) + depth, childList.length > 0));
      if(!isExpanded(itemId) || !childList.length) return;
      childList.forEach(child => walk(child, depth + 1));
    }

    tree.roots.forEach(root => walk(root, 0));
  }

  function refresh(){
    const box = $('#lkOutliner');
    if(!box) return;
    box.innerHTML = '';
    const items = withSyntheticExtras(visibleEntities());
    visibleSceneOrder = items.filter(item => item && item.userData && !item.__lkSynthetic);

    sceneIndex = new Map();
    items.forEach(item => {
      if(item && item.userData && item.userData.editorId) sceneIndex.set(item.userData.editorId, item);
    });

    const assignments = deps.folderAssignments('scene') || Object.create(null);
    const folders = deps.folderList('scene') || [];

    const byFolder = Object.create(null);
    items.forEach(item => {
      const itemId = item && item.userData && item.userData.editorId;
      const folderId = assignments[itemId] || null;
      const validFolder = folderId && deps.folderById('scene', folderId) ? folderId : null;
      if(!byFolder[validFolder]) byFolder[validFolder] = [];
      byFolder[validFolder].push(item);
    });

    const renderFolderTree = parent => {
      folders
        .filter(f => (f.parent || null) === (parent || null))
        .forEach(folder => {
          box.appendChild(deps.makeFolderRow('scene', folder));
          if(folder.open){
            renderLinkedTree(box, byFolder[folder.id] || [], 0);
            renderFolderTree(folder.id);
          }
        });
    };

    renderFolderTree(null);
    renderLinkedTree(box, byFolder[null] || [], 0);

    box.ondragover = e => {
      const types = Array.from(e.dataTransfer.types || []);
      if(types.includes('application/x-lotking-scene-object') || types.includes('application/x-lotking-scene-objects')){
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      }
    };
    box.ondrop = e => {
      const ids = idsFromDrop(e);
      if(ids.length && e.target === box){
        ids.forEach(id => { delete assignments[id]; });
        deps.writeFolderState();
        refresh();
      }
    };
    box.oncontextmenu = e => {
      if(e.target.closest('.lk-item, .lk-folder-row')) return;
      e.preventDefault();
      e.stopPropagation();
      deps.openMenu(deps.scenePanelMenuItems(), e.clientX, e.clientY);
    };
    deps.setStatusRight(items.length + ' oggetti');
  }

  return Object.freeze({
    refresh,
    visibleEntities,
    getSceneDragId: () => sceneDragId,
  });
}

window.LK_EDITOR_OUTLINER = Object.freeze({create});
})();
