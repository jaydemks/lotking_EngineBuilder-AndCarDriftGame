/* =========================================================
   LOT KING — project workspace launcher
   Optional first-run/on-demand chooser for browser storage,
   local project folders and local setup guidance.
   ========================================================= */
(function(){
'use strict';

const STATE_KEY = 'lk.projectWorkspace.v1';
const DB_NAME = 'lotking-project-workspace';
const DB_STORE = 'handles';
const HANDLE_KEY = 'projectRoot';
const FILE_HANDLE_KEY = 'projectFile';
const PROJECT_DIR = 'lotking-workspace';
const PROJECT_FILE = 'active-project.lkep.json';
const MANIFEST_FILE = 'workspace-manifest.json';
const GUIDE_URL = 'HOW_TO_START.md';
const DEMO_BLOCKED_SELECTOR = [
  '#lkSave',
  '#lkSaveAsTrack',
  '#lkNewTrack',
  '#lkResetScene',
  '#lkImportProject',
  '#lkExportPlayableLegacy',
  '#lkExportPlayable',
  '#lkAssetImport',
  '#lkAddMenu',
  '#lkProjectsNew',
  '#lkProjectsFromFile',
  '.lk-level-del',
  '.lk-level-actions button:not(.lk-level-load):not(.lk-level-export)',
  '.lk-asset-actions button',
  '[data-demo-blocked]',
].join(',');

let cachedHandle = null;
let cachedFileHandle = null;
let overlay = null;
let badge = null;
let topbarRetry = null;
let autoOpenChecked = false;
let demoGuardsInstalled = false;

function isLocalOrigin(){
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function canUseDirectoryPicker(){
  return !!(!isOnlineDemoMode() && window.isSecureContext && typeof window.showDirectoryPicker === 'function');
}

function canUseFilePicker(){
  return !!(!isOnlineDemoMode() && window.isSecureContext && typeof window.showOpenFilePicker === 'function');
}

function isOnlineDemoMode(){
  return !isLocalOrigin();
}

function isEditorPage(){
  return !!window.__LK_STANDALONE_EDITOR || /(^|\/)engine_editor\.html$/i.test(location.pathname || '');
}

function loadState(){
  try {
    const state = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    return state && typeof state === 'object' ? state : {mode:'browser'};
  } catch(err){
    return {mode:'browser'};
  }
}

function saveState(patch){
  const next = Object.assign({}, loadState(), patch || {}, {updatedAt:new Date().toISOString()});
  try { localStorage.setItem(STATE_KEY, JSON.stringify(next)); } catch(err){}
  updateBadge(next);
  syncWorkspaceButtons();
  window.dispatchEvent(new CustomEvent('lot-king:workspace-state', {detail:next}));
  return next;
}

function openDb(){
  return new Promise((resolve, reject) => {
    if(!window.indexedDB){ reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if(!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Workspace database unavailable'));
  });
}

function putStoredHandle(key, handle){
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(handle, key);
    tx.oncomplete = () => { db.close(); resolve(handle); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Workspace handle not saved')); };
  }));
}

function getStoredHandle(key){
  return openDb().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error || new Error('Workspace handle unavailable')); };
  })).catch(() => null);
}

function putHandle(handle){
  cachedHandle = handle;
  return putStoredHandle(HANDLE_KEY, handle);
}

function getHandle(){
  if(cachedHandle) return Promise.resolve(cachedHandle);
  return getStoredHandle(HANDLE_KEY).then(handle => {
    cachedHandle = handle || null;
    return cachedHandle;
  });
}

function putProjectFileHandle(handle){
  cachedFileHandle = handle;
  return putStoredHandle(FILE_HANDLE_KEY, handle);
}

function getProjectFileHandle(){
  if(cachedFileHandle) return Promise.resolve(cachedFileHandle);
  return getStoredHandle(FILE_HANDLE_KEY).then(handle => {
    cachedFileHandle = handle || null;
    return cachedFileHandle;
  });
}

async function ensureWritableHandle(){
  const handle = await getHandle();
  if(!handle) throw new Error('No project folder selected');
  if(typeof handle.queryPermission === 'function'){
    let permission = await handle.queryPermission({mode:'readwrite'});
    if(permission !== 'granted' && typeof handle.requestPermission === 'function'){
      permission = await handle.requestPermission({mode:'readwrite'});
    }
    if(permission !== 'granted') throw new Error('Project folder permission denied');
  }
  return handle;
}

async function workspaceDir(handle){
  if(!handle || typeof handle.getDirectoryHandle !== 'function') throw new Error('Project folder is not writable');
  return handle.getDirectoryHandle(PROJECT_DIR, {create:true});
}

async function ensureWritableFileHandle(){
  const handle = await getProjectFileHandle();
  if(!handle) throw new Error('No LKEP project file linked');
  if(typeof handle.queryPermission === 'function'){
    let permission = await handle.queryPermission({mode:'readwrite'});
    if(permission !== 'granted' && typeof handle.requestPermission === 'function'){
      permission = await handle.requestPermission({mode:'readwrite'});
    }
    if(permission !== 'granted') throw new Error('Project file permission denied');
  }
  return handle;
}

async function writeJsonFile(dir, name, data){
  const file = await dir.getFileHandle(name, {create:true});
  const writable = await file.createWritable();
  try {
    await writable.write(JSON.stringify(data, null, 2));
  } finally {
    await writable.close();
  }
}

async function writeJsonFileHandle(handle, data){
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(data, null, 2));
  } finally {
    await writable.close();
  }
}

async function readTextFile(dir, name){
  const file = await dir.getFileHandle(name, {create:false});
  const blob = await file.getFile();
  return blob.text();
}

async function readFileHandleText(handle){
  const file = await handle.getFile();
  return file.text();
}

async function connectFolder(){
  if(isOnlineDemoMode()) throw new Error('The published site is demo-only. Run the project locally to connect a folder.');
  if(!canUseDirectoryPicker()) throw new Error('Folder access is available on HTTPS or localhost in Chromium browsers');
  const handle = await window.showDirectoryPicker({mode:'readwrite'});
  await putHandle(handle);
  saveState({mode:'folder', folderName:handle.name || 'Project folder', projectFile:PROJECT_DIR + '/' + PROJECT_FILE});
  return handle;
}

async function connectProjectFile(){
  if(isOnlineDemoMode()) throw new Error('The published site is demo-only. Run the project locally to open an LKEP file.');
  if(!canUseFilePicker()) throw new Error('LKEP file sync is available in Chrome/Edge on localhost or HTTPS.');
  const handles = await window.showOpenFilePicker({
    multiple:false,
    types:[{
      description:'Lot King Editor Project',
      accept:{'application/json':['.json', '.lkep']},
    }],
  });
  const handle = handles && handles[0];
  if(!handle) throw new Error('No project file selected');
  const text = await readFileHandleText(handle);
  await putProjectFileHandle(handle);
  saveState({mode:'file', fileName:handle.name || PROJECT_FILE, projectFile:handle.name || PROJECT_FILE, folderName:null});
  dispatchLoadedProject(text, handle.name || PROJECT_FILE);
  showToast('Linked LKEP project file: ' + (handle.name || PROJECT_FILE));
  return handle;
}

async function saveProject(project, opts){
  opts = opts || {};
  const fileHandle = await getProjectFileHandle();
  if(fileHandle){
    const writableFile = await ensureWritableFileHandle();
    const payload = project || {};
    await writeJsonFileHandle(writableFile, payload);
    saveState({
      mode:'file',
      fileName:writableFile.name || loadState().fileName || PROJECT_FILE,
      projectFile:writableFile.name || PROJECT_FILE,
      lastProjectName:opts.name || (payload.meta && (payload.meta.projectName || payload.meta.trackName)) || null,
      lastSavedAt:new Date().toISOString(),
    });
    showToast('LKEP project file synced: ' + (writableFile.name || PROJECT_FILE));
    return {file:writableFile.name || PROJECT_FILE};
  }
  if(loadState().mode === 'file') throw new Error('Linked LKEP file permission expired. Open / sync the LKEP file again.');
  const handle = await ensureWritableHandle();
  const dir = await workspaceDir(handle);
  const payload = project || {};
  await writeJsonFile(dir, PROJECT_FILE, payload);
  await writeJsonFile(dir, MANIFEST_FILE, {
    app:'LOT KING ENGINE EDITOR',
    format:'LK_WORKSPACE',
    version:1,
    savedAt:new Date().toISOString(),
    projectFile:PROJECT_FILE,
    note:'This folder is a local workspace bridge. Browser storage remains available and unchanged.',
  });
  saveState({
    mode:'folder',
    folderName:handle.name || loadState().folderName || 'Project folder',
    projectFile:PROJECT_DIR + '/' + PROJECT_FILE,
    lastProjectName:opts.name || (payload.meta && (payload.meta.projectName || payload.meta.trackName)) || null,
    lastSavedAt:new Date().toISOString(),
  });
  showToast('Workspace project saved to ' + PROJECT_DIR + '/' + PROJECT_FILE);
  return {folderName:handle.name || '', file:PROJECT_DIR + '/' + PROJECT_FILE};
}

async function loadProjectText(){
  const fileHandle = await getProjectFileHandle();
  if(fileHandle) return readFileHandleText(fileHandle);
  const handle = await ensureWritableHandle();
  const dir = await workspaceDir(handle);
  return readTextFile(dir, PROJECT_FILE);
}

function setBrowserMode(){
  saveState({mode:'browser'});
  showToast(isOnlineDemoMode() ? 'Online demo mode' : 'Using local browser database');
}

function resetChoice(){
  cachedHandle = null;
  cachedFileHandle = null;
  saveState({mode:'browser', folderName:null, fileName:null, projectFile:null, lastProjectName:null, lastSavedAt:null});
  showToast('Workspace choice reset');
}

function isFolderMode(){
  return loadState().mode === 'folder';
}

function isFileMode(){
  return loadState().mode === 'file';
}

function showToast(message){
  let toast = document.getElementById('lkWorkspaceToast');
  if(!toast){
    toast = document.createElement('div');
    toast.id = 'lkWorkspaceToast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function el(tag, className, text){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text != null) node.textContent = text;
  return node;
}

function closeOverlay(){
  if(overlay) overlay.classList.remove('open');
}

function openGuide(){
  window.open(GUIDE_URL, '_blank', 'noopener,noreferrer');
}

function dispatchLoadedProject(text, name){
  window.dispatchEvent(new CustomEvent('lot-king:workspace-project-loaded', {
    detail:{text:text, name:name || PROJECT_FILE},
  }));
}

function renderOverlay(){
  if(overlay) return overlay;
  overlay = el('div', 'lk-workspace-overlay');
  overlay.id = 'lkWorkspaceOverlay';
  overlay.innerHTML = [
    '<div class="lk-workspace-panel" role="dialog" aria-modal="true" aria-labelledby="lkWorkspaceTitle">',
      '<div class="lk-workspace-head">',
        '<div>',
          '<div class="lk-workspace-kicker">PROJECT STORAGE</div>',
          '<h2 id="lkWorkspaceTitle">Choose how this project should work</h2>',
        '</div>',
        '<button id="lkWorkspaceClose" type="button" title="Close">x</button>',
      '</div>',
      '<div class="lk-workspace-grid">',
        '<button id="lkWorkspaceBrowser" class="lk-workspace-card" type="button">',
          '<b>Local browser database</b>',
          '<span>Local editor mode: projects stay in this browser on this computer. Nothing is uploaded to a server.</span>',
        '</button>',
        '<button id="lkWorkspaceFile" class="lk-workspace-card" type="button">',
          '<b>Open / sync LKEP file</b>',
          '<span>Choose a .lkep.json project file. The editor imports it, then Save writes back to the same portable file.</span>',
        '</button>',
        '<button id="lkWorkspaceGuide" class="lk-workspace-card" type="button">',
          '<b>Run locally</b>',
          '<span>Open the local setup guide for avvio.bat, localhost and LAN testing.</span>',
        '</button>',
      '</div>',
      '<div class="lk-workspace-status" id="lkWorkspaceStatus"></div>',
      '<div class="lk-workspace-actions">',
        '<button id="lkWorkspaceLoad" type="button">Reload linked LKEP</button>',
        '<button id="lkWorkspaceReset" type="button">Reset choice</button>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(overlay);
  const browserCard = overlay.querySelector('#lkWorkspaceBrowser');
  const fileCard = overlay.querySelector('#lkWorkspaceFile');
  if(isOnlineDemoMode()){
    const kicker = overlay.querySelector('.lk-workspace-kicker');
    const title = overlay.querySelector('#lkWorkspaceTitle');
    const browserTitle = overlay.querySelector('#lkWorkspaceBrowser b');
    const browserDesc = overlay.querySelector('#lkWorkspaceBrowser span');
    const fileTitle = overlay.querySelector('#lkWorkspaceFile b');
    const fileDesc = overlay.querySelector('#lkWorkspaceFile span');
    if(kicker) kicker.textContent = 'ONLINE DEMO';
    if(title) title.textContent = 'Bundled project, read-only';
    if(browserTitle) browserTitle.textContent = 'Online demo only';
    if(browserDesc) browserDesc.textContent = 'Bundled/default assets only. Upload, save and delete are disabled because the hosting space is not a shared project database. LKEP export is download-only.';
    if(fileTitle) fileTitle.textContent = 'LKEP sync disabled online';
    if(fileDesc) fileDesc.textContent = 'Run the project locally, then open your .lkep.json file from your own computer.';
  }
  if(browserCard) browserCard.classList.toggle('primary', isOnlineDemoMode());
  if(fileCard) fileCard.classList.toggle('primary', !isOnlineDemoMode());

  overlay.querySelector('#lkWorkspaceClose').addEventListener('click', closeOverlay);
  overlay.addEventListener('click', event => { if(event.target === overlay) closeOverlay(); });
  overlay.querySelector('#lkWorkspaceBrowser').addEventListener('click', () => {
    setBrowserMode();
    syncOverlayStatus();
    closeOverlay();
  });
  overlay.querySelector('#lkWorkspaceFile').addEventListener('click', () => {
    connectProjectFile().then(() => {
      syncOverlayStatus();
    }).catch(err => {
      showToast(err && err.message ? err.message : 'LKEP file connection failed');
      syncOverlayStatus(err && err.message ? err.message : String(err));
    });
  });
  overlay.querySelector('#lkWorkspaceGuide').addEventListener('click', openGuide);
  overlay.querySelector('#lkWorkspaceReset').addEventListener('click', () => {
    resetChoice();
    syncOverlayStatus();
  });
  overlay.querySelector('#lkWorkspaceLoad').addEventListener('click', () => {
    loadProjectText().then(text => {
      dispatchLoadedProject(text);
      closeOverlay();
      showToast('Workspace project loaded');
    }).catch(err => {
      showToast(err && err.message ? err.message : 'Workspace project not found');
      syncOverlayStatus(err && err.message ? err.message : String(err));
    });
  });

  syncOverlayStatus();
  return overlay;
}

function syncOverlayStatus(error){
  if(!overlay) return;
  const state = loadState();
  const status = overlay.querySelector('#lkWorkspaceStatus');
  const fileBtn = overlay.querySelector('#lkWorkspaceFile');
  const loadBtn = overlay.querySelector('#lkWorkspaceLoad');
  if(fileBtn){
    fileBtn.disabled = !canUseFilePicker();
    fileBtn.classList.toggle('disabled', !canUseFilePicker());
  }
  if(loadBtn) loadBtn.disabled = state.mode !== 'file' && state.mode !== 'folder';
  if(status){
    const support = isOnlineDemoMode()
      ? 'Published site mode: demo only. Import, delete and save are disabled. LKEP export downloads a local copy only.'
      : (canUseFilePicker()
        ? 'LKEP file sync available.'
        : 'LKEP file sync is available in Chrome/Edge on localhost or HTTPS.');
    const current = isOnlineDemoMode()
      ? 'Current mode: online demo.'
      : (state.mode === 'file'
      ? 'Current mode: linked LKEP file' + (state.fileName ? ' (' + state.fileName + ')' : '') + '.'
      : state.mode === 'folder'
      ? 'Current mode: local folder' + (state.folderName ? ' (' + state.folderName + ')' : '') + '.'
      : 'Current mode: local browser database.');
    status.textContent = (error ? error + ' ' : '') + current + ' ' + support;
  }
}

function updateBadge(state){
  if(!badge) return;
  state = state || loadState();
  if(isOnlineDemoMode()){
    badge.textContent = 'Workspace: demo';
    badge.classList.remove('folder');
    badge.classList.add('demo');
    badge.title = 'Online demo: editing, imports and destructive actions are disabled';
    return;
  }
  const file = state.mode === 'file';
  const folder = state.mode === 'folder';
  badge.textContent = file ? 'Workspace: ' + (state.fileName || 'LKEP') : (folder ? 'Workspace: ' + (state.folderName || 'folder') : 'Workspace: local DB');
  badge.classList.toggle('folder', folder || file);
  badge.classList.remove('demo');
  badge.title = file ? 'Syncing saves to linked LKEP file' : (folder && state.projectFile ? 'Mirroring saves to ' + state.projectFile : 'Using this browser localStorage and IndexedDB');
}

function openOverlay(){
  renderOverlay().classList.add('open');
  syncOverlayStatus();
}

function workspaceButtonMarkup(compact){
  if(isOnlineDemoMode()){
    return compact
      ? '<span>ONLINE DEMO</span>'
      : '<b>ONLINE DEMO</b><small>read only</small>';
  }
  const state = loadState();
  const file = state.mode === 'file';
  const folder = state.mode === 'folder';
  if(compact) return '<span>' + (file ? 'LKEP LINKED' : (folder ? 'FOLDER WORKSPACE' : 'WORKSPACE')) + '</span>';
  return '<b>' + (file ? 'LKEP PROJECT FILE' : (folder ? 'FOLDER WORKSPACE' : 'LOCAL WORKSPACE')) + '</b><small>' + (file ? 'sync on save' : (folder ? 'folder linked' : 'local DB')) + '</small>';
}

function syncWorkspaceButtons(){
  const menuBtn = document.getElementById('workspaceBtn');
  const topbarBtn = document.getElementById('lkWorkspaceBtn');
  [menuBtn, topbarBtn].forEach(btn => {
    if(!btn) return;
    const compact = btn.id === 'lkWorkspaceBtn';
    btn.innerHTML = workspaceButtonMarkup(compact);
    btn.classList.toggle('demo', isOnlineDemoMode());
    btn.classList.toggle('folder', !isOnlineDemoMode() && (loadState().mode === 'folder' || loadState().mode === 'file'));
    btn.title = isOnlineDemoMode()
      ? 'Online demo: save/import/edit actions are disabled'
      : 'Open project workspace options';
  });
}

function blockedDemoMessage(){
  showToast('Online demo only. Run the project locally to import, save or edit assets.');
}

function isTextEditingTarget(target){
  if(!target) return false;
  if(target.isContentEditable) return true;
  const tag = String(target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function isDemoBlockedEvent(event){
  const target = event && event.target;
  if(!target || !target.closest) return false;
  const blocked = target.closest(DEMO_BLOCKED_SELECTOR);
  if(!blocked) return false;
  const workspace = target.closest('#lkWorkspaceOverlay, #lkWorkspaceBadge, #lkWorkspaceBtn, #workspaceBtn');
  return !workspace;
}

function markDemoDisabledControls(){
  if(!isOnlineDemoMode()) return;
  document.querySelectorAll(DEMO_BLOCKED_SELECTOR).forEach(node => {
    if(!node || node.closest && node.closest('#lkWorkspaceOverlay')) return;
    node.classList.add('lk-demo-locked');
    if('disabled' in node) node.disabled = true;
    node.setAttribute('aria-disabled', 'true');
    if(!node.title) node.title = 'Disabled in online demo';
  });
}

function installOnlineDemoGuards(){
  if(demoGuardsInstalled || !isOnlineDemoMode()) return;
  demoGuardsInstalled = true;
  document.body.classList.add('lk-online-demo');
  document.addEventListener('click', event => {
    if(!isDemoBlockedEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blockedDemoMessage();
  }, true);
  document.addEventListener('submit', event => {
    if(!isDemoBlockedEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blockedDemoMessage();
  }, true);
  document.addEventListener('keydown', event => {
    const key = String(event.key || '').toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    if(((key === 'delete' || key === 'backspace') && !isTextEditingTarget(event.target))
      || (mod && (key === 's' || key === 'i' || key === 'd' || key === 'r'))
      || (mod && event.altKey && key === 'n')){
      event.preventDefault();
      event.stopImmediatePropagation();
      blockedDemoMessage();
    }
  }, true);
  document.addEventListener('dragover', event => {
    if(!event.dataTransfer || !Array.prototype.some.call(event.dataTransfer.types || [], type => type === 'Files')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('drop', event => {
    if(!event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blockedDemoMessage();
  }, true);
  let tries = 0;
  const marker = setInterval(() => {
    tries += 1;
    markDemoDisabledControls();
    if(tries > 80) clearInterval(marker);
  }, 250);
}

function installEntryPoints(){
  const state = loadState();
  installOnlineDemoGuards();

  const menu = document.getElementById('menuMain');
  if(menu && isEditorPage() && !document.getElementById('workspaceBtn')){
    const btn = document.createElement('button');
    btn.id = 'workspaceBtn';
    btn.className = 'lk-workspace-entry';
    btn.type = 'button';
    btn.addEventListener('click', openOverlay);
    menu.appendChild(btn);
  }

  const topbar = document.getElementById('lkTopbar');
  if(topbar && !document.getElementById('lkWorkspaceBtn')){
    const btn = document.createElement('button');
    btn.id = 'lkWorkspaceBtn';
    btn.className = 'lk-workspace-entry';
    btn.type = 'button';
    btn.addEventListener('click', openOverlay);
    const logo = document.getElementById('lkLogoBtn');
    if(logo && logo.parentNode) logo.parentNode.insertBefore(btn, logo.nextSibling);
    else topbar.insertBefore(btn, topbar.firstChild);
  }
  syncWorkspaceButtons();

  if(!badge){
    badge = document.createElement('button');
    badge.id = 'lkWorkspaceBadge';
    badge.type = 'button';
    badge.addEventListener('click', openOverlay);
    document.body.appendChild(badge);
  }
  updateBadge(state);

  if(!document.getElementById('lkWorkspaceBtn') && !topbarRetry){
    let tries = 0;
    topbarRetry = setInterval(() => {
      tries += 1;
      if(document.getElementById('lkTopbar') || tries > 80){
        clearInterval(topbarRetry);
        topbarRetry = null;
        installEntryPoints();
      }
    }, 250);
  }

  const shouldAutoOpen = !autoOpenChecked && isEditorPage();
  if(shouldAutoOpen || (!autoOpenChecked && /[?&]workspace=1\b/.test(location.search))){
    autoOpenChecked = true;
    setTimeout(openOverlay, 450);
  }
}

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', installEntryPoints);
} else {
  installEntryPoints();
}

window.LK_PROJECT_WORKSPACE = Object.freeze({
  open: openOverlay,
  state: loadState,
  isFolderMode,
  isFileMode,
  isOnlineDemoMode,
  isEditorPage,
  connectProjectFile,
  connectFolder,
  saveProject,
  loadProjectText,
  canUseFilePicker,
  canUseDirectoryPicker,
});

})();
