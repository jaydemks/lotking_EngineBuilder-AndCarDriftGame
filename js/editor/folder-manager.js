/* =========================================================
   LOT KING — EDITOR FOLDER MANAGER
   Shared scene/assets folder state and drag/drop rows.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const promptEditorAction = deps.promptEditorAction || function(){ return Promise.resolve(null); };
  const openMenu = deps.openMenu || function(){};
  const refreshScene = deps.refreshScene || function(){};
  const refreshAssets = deps.refreshAssets || function(){};
  const FOLDERS_KEY = deps.storageKey || 'lotking.editorFolders.v1';
  const folderState = readFolderState();

  function refresh(kind){
    kind === 'scene' ? refreshScene() : refreshAssets();
  }
  function readFolderState(){
    try {
      const raw = localStorage.getItem(FOLDERS_KEY);
      const data = raw ? JSON.parse(raw) : null;
      if(data && data.scene && data.assets) return data;
    } catch(err){}
    return {scene:{folders:[], assignments:{}}, assets:{folders:[], assignments:{}}};
  }
  function writeFolderState(){
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(folderState)); } catch(err){}
  }
  function folderList(kind){ return folderState[kind].folders; }
  function folderAssignments(kind){ return folderState[kind].assignments; }
  async function newFolder(kind){
    const name = await promptEditorAction({
      title:kind === 'scene' ? 'New scene folder' : 'New assets folder',
      message:kind === 'scene' ? 'Scene folder name:' : 'Assets folder name:',
      value:'New Folder',
      okText:'Create',
    });
    if(!name || !name.trim()) return;
    const color = await promptEditorAction({title:'Folder color', message:'Folder color hex:', value:'#4be3a0', okText:'Apply'}) || '#4be3a0';
    folderList(kind).push({id:'fld_' + Date.now().toString(36), name:name.trim(), color, parent:null, open:true});
    writeFolderState();
    refresh(kind);
  }
  function folderById(kind, id){ return folderList(kind).find(f => f.id === id); }
  function folderDepth(kind, folder){
    let d = 0, f = folder;
    while(f && f.parent){ d++; f = folderById(kind, f.parent); if(d > 10) break; }
    return d;
  }
  function folderIsDescendant(kind, folderId, possibleParentId){
    let f = folderById(kind, possibleParentId);
    while(f){
      if(f.parent === folderId) return true;
      f = folderById(kind, f.parent);
    }
    return false;
  }
  function idsFromDrop(ev, multiType, singleType){
    const raw = ev.dataTransfer && ev.dataTransfer.getData(multiType);
    if(raw){
      try {
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed)) return parsed.filter(Boolean);
      } catch(err){}
    }
    const single = ev.dataTransfer && ev.dataTransfer.getData(singleType);
    return single ? [single] : [];
  }
  function folderMenu(kind, folder){
    return [
      {label:'Rename', icon:'✎', action:async () => {
        const n = await promptEditorAction({title:'Rename folder', message:'Folder name:', value:folder.name, okText:'Rename'});
        if(n){ folder.name = n.trim(); writeFolderState(); refresh(kind); }
      }},
      {label:'Color', icon:'■', action:async () => {
        const c = await promptEditorAction({title:'Folder color', message:'Folder color hex:', value:folder.color || '#4be3a0', okText:'Apply'});
        if(c){ folder.color = c; writeFolderState(); refresh(kind); }
      }},
      {label:folder.open ? 'Collapse' : 'Expand', icon:'▸', action:() => { folder.open = !folder.open; writeFolderState(); refresh(kind); }},
      {label:'Move to root', icon:'↱', action:() => { folder.parent = null; writeFolderState(); refresh(kind); }},
      {sep:true},
      {label:'Delete folder only', icon:'🗑', action:() => {
        folderList(kind).forEach(f => { if(f.parent === folder.id) f.parent = folder.parent || null; });
        const a = folderAssignments(kind);
        Object.keys(a).forEach(k => { if(a[k] === folder.id) delete a[k]; });
        folderState[kind].folders = folderList(kind).filter(f => f.id !== folder.id);
        writeFolderState();
        refresh(kind);
      }},
    ];
  }
  function makeFolderRow(kind, folder){
    const row = document.createElement('div');
    row.className = 'lk-folder-row';
    row.dataset.folderId = folder.id;
    row.draggable = true;
    row.style.setProperty('--folder-color', folder.color || '#4be3a0');
    row.style.paddingLeft = (8 + folderDepth(kind, folder) * 14) + 'px';
    row.innerHTML = '<span class="lk-folder-arrow">' + (folder.open ? '▾' : '▸') + '</span><span class="lk-folder-dot"></span><span class="lk-folder-name"></span>';
    row.querySelector('.lk-folder-name').textContent = folder.name;
    row.addEventListener('click', () => { folder.open = !folder.open; writeFolderState(); refresh(kind); });
    row.addEventListener('contextmenu', ev => { ev.preventDefault(); ev.stopPropagation(); openMenu(folderMenu(kind, folder), ev.clientX, ev.clientY); });
    row.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('application/x-lotking-folder', kind + ':' + folder.id);
      ev.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', ev => {
      const types = Array.from(ev.dataTransfer.types || []);
      const canDropFolder = types.includes('application/x-lotking-folder');
      const canDropSceneObject = kind === 'scene' && (types.includes('application/x-lotking-scene-object') || types.includes('application/x-lotking-scene-objects'));
      const canDropAsset = kind === 'assets' && (types.includes('application/x-lotking-asset') || types.includes('application/x-lotking-assets'));
      if(canDropFolder || canDropSceneObject || canDropAsset){
        ev.preventDefault(); row.classList.add('drop-ok'); ev.dataTransfer.dropEffect = 'move';
      }
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-ok'));
    row.addEventListener('drop', ev => {
      ev.preventDefault(); ev.stopPropagation(); row.classList.remove('drop-ok');
      const folderData = ev.dataTransfer.getData('application/x-lotking-folder');
      if(folderData){
        const [srcKind, id] = folderData.split(':');
        if(srcKind === kind && id !== folder.id && !folderIsDescendant(kind, id, folder.id)){
          const f = folderById(kind, id); if(f) f.parent = folder.id;
        }
      }
      if(kind === 'scene'){
        idsFromDrop(ev, 'application/x-lotking-scene-objects', 'application/x-lotking-scene-object')
          .forEach(objId => { folderAssignments('scene')[objId] = folder.id; });
      }
      if(kind === 'assets'){
        idsFromDrop(ev, 'application/x-lotking-assets', 'application/x-lotking-asset')
          .forEach(assetRef => { folderAssignments('assets')[assetRef] = folder.id; });
      }
      writeFolderState();
      refresh(kind);
    });
    return row;
  }

  return Object.freeze({
    state: folderState,
    write: writeFolderState,
    list: folderList,
    assignments: folderAssignments,
    createFolder: newFolder,
    newFolder,
    byId: folderById,
    makeRow: makeFolderRow,
  });
}

window.LK_EDITOR_FOLDER_MANAGER = Object.freeze({create});
})();
