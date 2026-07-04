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
  let sceneDragId = null;

  function visibleEntities(){
    return GAME.world.registry.filter(o => {
      if(o.userData.editorType === 'player') return false;
      if(ED.filter === 'added' && o.userData.builtin) return false;
      if(ED.filter === 'builtin' && !o.userData.builtin) return false;
      if(['mesh','light','effect'].includes(ED.filter) && o.userData.editorType !== ED.filter) return false;
      if(ED.search && !(o.userData.editorName || '').toLowerCase().includes(ED.search)) return false;
      return true;
    });
  }

  function renderEntity(o){
    const id = o.userData.editorId;
    const div = documentRef.createElement('div');
    div.className = 'lk-item' + (ED.selected === o ? ' sel' : '') + (o.visible ? '' : ' hidden-e');
    div.dataset.id = id;
    div.draggable = true;

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
    name.title = (o.userData.builtin ? '(originale) ' : '(aggiunto) ') + (o.userData.editorName || id);

    const eye = documentRef.createElement('button');
    eye.className = 'lk-eye'; eye.textContent = o.visible ? '👁' : '—'; eye.title = 'Mostra/Nascondi';
    eye.addEventListener('click', ev => { ev.stopPropagation(); deps.toggleVisible(o); });

    const del = documentRef.createElement('button');
    del.className = 'lk-del'; del.textContent = '×'; del.title = 'Elimina';
    del.addEventListener('click', ev => { ev.stopPropagation(); deps.requestDeleteEntity(o); });

    div.append(thumb, name, eye, del);
    div.addEventListener('dragstart', ev => {
      sceneDragId = id;
      ev.dataTransfer.setData('application/x-lotking-scene-object', id);
      ev.dataTransfer.effectAllowed = 'move';
    });
    div.addEventListener('dragend', () => { sceneDragId = null; });
    deps.bindReplaceDropTarget(div, o);
    div.addEventListener('click', () => deps.selectObject(o));
    div.addEventListener('dblclick', () => { deps.selectObject(o); deps.focusSelected(); });
    div.addEventListener('contextmenu', ev => {
      ev.preventDefault(); ev.stopPropagation();
      deps.selectObject(o);
      deps.openMenu(deps.objectMenuItems(o, true), ev.clientX, ev.clientY);
    });
    return div;
  }

  function refresh(){
    const box = $('#lkOutliner');
    box.innerHTML = '';
    const items = visibleEntities();
    const assignments = deps.folderAssignments('scene');
    const folders = deps.folderList('scene');

    const renderFolderTree = parent => {
      folders.filter(f => (f.parent || null) === (parent || null)).forEach(folder => {
        box.appendChild(deps.makeFolderRow('scene', folder));
        if(folder.open){
          items.filter(o => assignments[o.userData.editorId] === folder.id).forEach(o => box.appendChild(renderEntity(o)));
          renderFolderTree(folder.id);
        }
      });
    };
    renderFolderTree(null);

    items
      .filter(o => !assignments[o.userData.editorId] || !deps.folderById('scene', assignments[o.userData.editorId]))
      .forEach(o => box.appendChild(renderEntity(o)));

    box.ondragover = e => {
      if(Array.from(e.dataTransfer.types || []).includes('application/x-lotking-scene-object')){
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      }
    };
    box.ondrop = e => {
      const id = e.dataTransfer && e.dataTransfer.getData('application/x-lotking-scene-object');
      if(id && e.target === box){
        delete assignments[id];
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
