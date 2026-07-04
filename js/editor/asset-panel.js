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

  return Object.freeze({button, makeCard, visible, addGroup});
}

window.LK_EDITOR_ASSET_PANEL = Object.freeze({create});
})();
