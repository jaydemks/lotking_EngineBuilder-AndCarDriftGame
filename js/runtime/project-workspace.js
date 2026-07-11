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
const GITHUB_URL = 'https://github.com/jaydemks/lotking_EngineBuilder-AndCarDriftGame';
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
function workspaceLang(){
  if(window.LOT_KING && LOT_KING.i18n) return LOT_KING.i18n.lang === 'it' ? 'it' : 'en';
  try { return JSON.parse(localStorage.getItem('lotking.editorPrefs.v1') || '{}').lang === 'it' ? 'it' : 'en'; }
  catch(err){ return 'en'; }
}
function tr(en, it){ return workspaceLang() === 'it' ? (it || en) : en; }

function isLocalOrigin(){
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function canUseDirectoryPicker(){
  return !!(window.isSecureContext && typeof window.showDirectoryPicker === 'function');
}

function canUseFilePicker(){
  return !!(!isOnlineDemoMode() && window.isSecureContext && typeof window.showOpenFilePicker === 'function');
}

function isOnlineDemoMode(){
  const state = loadState();
  return !isLocalOrigin() && (state.onlineEditor !== true || state.workspaceReady !== true);
}

function isEditorPage(){
  return !!window.__LK_STANDALONE_EDITOR || /(^|\/)engine_editor\.html$/i.test(location.pathname || '');
}

function requiresInitialChoice(){
  return isEditorPage() && loadState().workspaceReady !== true;
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
  if(!canUseDirectoryPicker()) throw new Error(tr('Folder access is available on HTTPS or localhost in Chromium browsers', 'L’accesso alle cartelle è disponibile su HTTPS o localhost nei browser Chromium'));
  const handle = await window.showDirectoryPicker({mode:'readwrite'});
  await putHandle(handle);
  saveState({mode:'folder', onlineEditor:true, workspaceReady:true, folderName:handle.name || 'Project folder', projectFile:PROJECT_DIR + '/' + PROJECT_FILE});
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
  saveState({mode:'file', onlineEditor:true, workspaceReady:true, fileName:handle.name || PROJECT_FILE, projectFile:handle.name || PROJECT_FILE, folderName:null});
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
  saveState({mode:'browser', onlineEditor:true, workspaceReady:true});
  showToast(tr('Using this browser local database. Nothing is uploaded.', 'Uso del database locale del browser. Nessun dato viene caricato.'));
}

async function chooseEditorProject(template){
  const selectedTemplate = template === 'empty' ? 'empty' : 'demo';
  if(!isLocalOrigin()){
    if(!canUseDirectoryPicker()) throw new Error(tr('Online folder projects require Chrome or Edge on HTTPS. You can still use Run locally.', 'I progetti online su cartella richiedono Chrome o Edge su HTTPS. Puoi comunque usare Avvia in locale.'));
    const handle = await window.showDirectoryPicker({mode:'readwrite', id:'lot-king-project'});
    await putHandle(handle);
    const dir = await workspaceDir(handle);
    if(selectedTemplate === 'demo'){
      const response = await fetch('demo/demo-project.lkep.json', {cache:'reload'});
      if(!response.ok) throw new Error(tr('DEMO project could not be downloaded', 'Impossibile scaricare il progetto DEMO'));
      await writeJsonFile(dir, PROJECT_FILE, JSON.parse(await response.text()));
    }
    await writeJsonFile(dir, MANIFEST_FILE, {
      app:'LOT KING ENGINE EDITOR', format:'LK_WORKSPACE', version:1,
      projectFile:PROJECT_FILE, template:selectedTemplate,
      storage:'Files stay in this user-selected folder and browser storage. No server upload is used.',
    });
    saveState({mode:'folder', onlineEditor:true, workspaceReady:true, startupTemplate:selectedTemplate, folderName:handle.name || 'Project folder', projectFile:PROJECT_DIR + '/' + PROJECT_FILE});
  } else {
    saveState({mode:'browser', onlineEditor:true, workspaceReady:true, startupTemplate:selectedTemplate});
  }
  location.reload();
}

function consumeStartupTemplate(){
  const state = loadState();
  const template = state.startupTemplate || null;
  if(template) saveState({startupTemplate:null});
  return template;
}

function resetChoice(){
  cachedHandle = null;
  cachedFileHandle = null;
  saveState({mode:'browser', onlineEditor:isLocalOrigin() ? true : false, workspaceReady:false, startupTemplate:null, folderName:null, fileName:null, projectFile:null, lastProjectName:null, lastSavedAt:null});
  showToast('Workspace choice reset');
  if(!isLocalOrigin()) location.reload();
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
  if(!overlay || requiresInitialChoice()) return;
  overlay.classList.remove('open');
}

function openGuide(){
  if(!overlay) return;
  const status = overlay.querySelector('#lkWorkspaceStatus');
  if(status) status.innerHTML = tr(
    '<b>Run locally</b><br>1. Open GitHub and download the repository ZIP.<br>2. Extract it to a normal local folder.<br>3. Run <code>avvio.bat</code> and open the localhost address.<br>4. Create, import and export projects with your own local files.<br>',
    '<b>Avvia in locale</b><br>1. Apri GitHub e scarica lo ZIP del repository.<br>2. Estrailo in una normale cartella locale.<br>3. Avvia <code>avvio.bat</code> e apri l’indirizzo localhost.<br>4. Crea, importa ed esporta progetti usando i tuoi file locali.<br>'
  ) + '<a href="' + GITHUB_URL + '" target="_blank" rel="noopener noreferrer">' + tr('Open GitHub repository', 'Apri repository GitHub') + '</a> · <a href="' + GUIDE_URL + '" target="_blank" rel="noopener noreferrer">' + tr('Detailed setup guide', 'Guida dettagliata') + '</a><br><b>' + tr('Enjoy.', 'Buon divertimento.') + '</b>';
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
          '<div class="lk-workspace-kicker">' + tr('PROJECT START', 'AVVIO PROGETTO') + '</div>',
          '<h2 id="lkWorkspaceTitle">' + tr('Choose a project', 'Scegli un progetto') + '</h2>',
        '</div>',
        '<button id="lkWorkspaceClose" type="button" title="Close">x</button>',
      '</div>',
      '<div class="lk-workspace-grid">',
        '<div id="lkWorkspaceBrowser" class="lk-workspace-card primary">',
          '<b>' + tr('Environment detected automatically', 'Ambiente rilevato automaticamente') + '</b>',
          '<span id="lkWorkspaceEnvironment"></span>',
        '</div>',
        '<button id="lkWorkspaceFile" class="lk-workspace-card" type="button">',
          '<b>' + tr('Open an existing LKEP', 'Apri un LKEP esistente') + '</b>',
          '<span>' + tr('Choose a .lkep.json project file. The editor imports it, then Save writes back to the same portable file.', 'Scegli un progetto .lkep.json. L’editor lo importa e Salva riscrive lo stesso file portabile.') + '</span>',
        '</button>',
        '<button id="lkWorkspaceGuide" class="lk-workspace-card" type="button">',
          '<b>' + tr('Run locally / GitHub', 'Avvia in locale / GitHub') + '</b>',
          '<span>' + tr('Download, extract and start the complete local installation.', 'Scarica, estrai e avvia l’installazione locale completa.') + '</span>',
        '</button>',
      '</div>',
      '<div class="lk-workspace-status" id="lkWorkspaceStatus"></div>',
      '<div class="lk-workspace-actions">',
        '<button id="lkWorkspaceDemo" type="button">' + tr('Open author DEMO project', 'Apri progetto DEMO dell’autore') + '</button>',
        '<button id="lkWorkspaceEmpty" type="button">' + tr('Create clean project', 'Crea progetto pulito') + '</button>',
        '<button id="lkWorkspaceLoad" type="button">' + tr('Reload linked LKEP', 'Ricarica LKEP collegato') + '</button>',
        '<button id="lkWorkspaceReset" type="button">' + tr('Reset choice', 'Reimposta scelta') + '</button>',
      '</div>',
    '</div>',
  ].join('');
  document.body.appendChild(overlay);
  const browserCard = overlay.querySelector('#lkWorkspaceBrowser');
  const fileCard = overlay.querySelector('#lkWorkspaceFile');
  const hosted = !isLocalOrigin();
  const environment = overlay.querySelector('#lkWorkspaceEnvironment');
  if(environment) environment.textContent = hosted
    ? tr('Choose DEMO or a clean project, then grant a local folder. Nothing is uploaded to this server.', 'Scegli DEMO o un progetto pulito, poi autorizza una cartella locale. Nulla viene caricato su questo server.')
    : tr('LOCAL INSTALLATION · Browser project storage and local LKEP files are available.', 'INSTALLAZIONE LOCALE · Sono disponibili archivio progetti del browser e file LKEP locali.');
  if(hosted){
    const kicker = overlay.querySelector('.lk-workspace-kicker');
    const title = overlay.querySelector('#lkWorkspaceTitle');
    const browserTitle = overlay.querySelector('#lkWorkspaceBrowser b');
    const browserDesc = overlay.querySelector('#lkWorkspaceBrowser span');
    const fileTitle = overlay.querySelector('#lkWorkspaceFile b');
    const fileDesc = overlay.querySelector('#lkWorkspaceFile span');
    if(kicker) kicker.textContent = 'ONLINE DEMO';
    if(title) title.textContent = tr('Choose your local project', 'Scegli il progetto locale');
    if(browserTitle) browserTitle.textContent = tr('Online editor, local files', 'Editor online, file locali');
    if(browserDesc) browserDesc.textContent = tr('You will choose a folder on this PC. The hosted editor may read/write only that authorized folder; it never saves projects or assets to the website server.', 'Sceglierai una cartella su questo PC. L’editor hosted può leggere e scrivere solo nella cartella autorizzata; non salva mai progetti o asset sul server del sito.');
    if(fileCard) fileCard.style.display = 'none';
    if(fileTitle) fileTitle.textContent = tr('Local browser project', 'Progetto locale del browser');
    if(fileDesc) fileDesc.textContent = tr('Local-only storage.', 'Archiviazione esclusivamente locale.');
  }
  const guideCard = overlay.querySelector('#lkWorkspaceGuide');
  if(guideCard) guideCard.style.display = hosted ? '' : 'none';
  if(browserCard) browserCard.classList.add('primary');
  if(fileCard) fileCard.classList.toggle('primary', false);

  overlay.querySelector('#lkWorkspaceClose').addEventListener('click', closeOverlay);
  overlay.addEventListener('click', event => { if(event.target === overlay) closeOverlay(); });
  overlay.querySelector('#lkWorkspaceFile').addEventListener('click', () => {
    connectProjectFile().then(() => {
      syncOverlayStatus();
    }).catch(err => {
      showToast(err && err.message ? err.message : 'LKEP file connection failed');
      syncOverlayStatus(err && err.message ? err.message : String(err));
    });
  });
  overlay.querySelector('#lkWorkspaceGuide').addEventListener('click', openGuide);
  overlay.querySelector('#lkWorkspaceDemo').addEventListener('click', () => chooseEditorProject('demo').catch(err => syncOverlayStatus(err.message || String(err))));
  overlay.querySelector('#lkWorkspaceEmpty').addEventListener('click', () => chooseEditorProject('empty').catch(err => syncOverlayStatus(err.message || String(err))));
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
  const close = overlay.querySelector('#lkWorkspaceClose');
  if(close) close.hidden = requiresInitialChoice();
  return overlay;
}

function syncOverlayStatus(error){
  if(!overlay) return;
  const state = loadState();
  const status = overlay.querySelector('#lkWorkspaceStatus');
  const fileBtn = overlay.querySelector('#lkWorkspaceFile');
  const loadBtn = overlay.querySelector('#lkWorkspaceLoad');
  const demoBtn = overlay.querySelector('#lkWorkspaceDemo');
  const emptyBtn = overlay.querySelector('#lkWorkspaceEmpty');
  if(demoBtn) demoBtn.hidden = false;
  if(emptyBtn) emptyBtn.hidden = false;
  if(fileBtn){
    fileBtn.disabled = !canUseFilePicker();
    fileBtn.classList.toggle('disabled', !canUseFilePicker());
  }
  if(loadBtn) loadBtn.disabled = state.mode !== 'file' && state.mode !== 'folder';
  if(status){
    const support = !isLocalOrigin()
      ? tr('Online mode: select DEMO or Clean Project and authorize a folder. No FTP/server project writes are performed.', 'Modalità online: scegli DEMO o Progetto pulito e autorizza una cartella. Nessuna scrittura viene effettuata su FTP/server.')
      : (canUseFilePicker()
        ? tr('LKEP file sync available.', 'Sincronizzazione file LKEP disponibile.')
        : tr('LKEP file sync is available in Chrome/Edge on localhost or HTTPS.', 'La sincronizzazione LKEP è disponibile in Chrome/Edge su localhost o HTTPS.'));
    const current = !isLocalOrigin() && !state.workspaceReady
      ? tr('Current mode: waiting for a local project folder.', 'Modalità attuale: in attesa di una cartella progetto locale.')
      : (state.mode === 'file'
      ? tr('Current mode: linked LKEP file', 'Modalità attuale: file LKEP collegato') + (state.fileName ? ' (' + state.fileName + ')' : '') + '.'
      : state.mode === 'folder'
      ? tr('Current mode: local folder', 'Modalità attuale: cartella locale') + (state.folderName ? ' (' + state.folderName + ')' : '') + '.'
      : tr('Current mode: local browser database.', 'Modalità attuale: database locale del browser.'));
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
    badge.title = tr('Online demo: editing, imports and destructive actions are disabled', 'Demo online: modifica, importazione e azioni distruttive sono disabilitate');
    return;
  }
  const file = state.mode === 'file';
  const folder = state.mode === 'folder';
  badge.textContent = file ? 'Workspace: ' + (state.fileName || 'LKEP') : (folder ? 'Workspace: ' + (state.folderName || 'folder') : 'Workspace: local DB');
  badge.classList.toggle('folder', folder || file);
  badge.classList.remove('demo');
  badge.title = file ? tr('Syncing saves to linked LKEP file', 'Salvataggi sincronizzati nel file LKEP collegato') : (folder && state.projectFile ? tr('Mirroring saves to ', 'Copia dei salvataggi in ') + state.projectFile : tr('Using this browser localStorage and IndexedDB', 'Uso di localStorage e IndexedDB del browser'));
}

function openOverlay(){
  renderOverlay().classList.add('open');
  syncOverlayStatus();
}

function workspaceButtonMarkup(compact){
  if(isOnlineDemoMode()){
    return compact
      ? '<span>ONLINE DEMO</span>'
      : '<b>ONLINE DEMO</b><small>' + tr('read only', 'sola lettura') + '</small>';
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
  showToast(tr('Online demo only. Run the project locally to import, save or edit assets.', 'Solo demo online. Avvia il progetto in locale per importare, salvare o modificare asset.'));
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
    if(!isOnlineDemoMode()) return;
    if(!isDemoBlockedEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blockedDemoMessage();
  }, true);
  document.addEventListener('submit', event => {
    if(!isOnlineDemoMode()) return;
    if(!isDemoBlockedEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    blockedDemoMessage();
  }, true);
  document.addEventListener('keydown', event => {
    if(!isOnlineDemoMode()) return;
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
    if(!isOnlineDemoMode()) return;
    if(!event.dataTransfer || !Array.prototype.some.call(event.dataTransfer.types || [], type => type === 'Files')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  document.addEventListener('drop', event => {
    if(!isOnlineDemoMode()) return;
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

  const shouldAutoOpen = !autoOpenChecked && requiresInitialChoice();
  if(shouldAutoOpen || (!autoOpenChecked && /[?&]workspace=1\b/.test(location.search))){
    autoOpenChecked = true;
    if(shouldAutoOpen) openOverlay();
    else setTimeout(openOverlay, 0);
  }
}

installEntryPoints();
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installEntryPoints, {once:true});
window.addEventListener('lotking:languagechange', () => {
  if(!overlay) return;
  const wasOpen = overlay.classList.contains('open');
  overlay.remove();
  overlay = null;
  if(wasOpen) openOverlay();
  else syncWorkspaceButtons();
});

window.LK_PROJECT_WORKSPACE = Object.freeze({
  open: openOverlay,
  state: loadState,
  isFolderMode,
  isFileMode,
  isOnlineDemoMode,
  isEditorPage,
  requiresInitialChoice,
  connectProjectFile,
  connectFolder,
  saveProject,
  loadProjectText,
  canUseFilePicker,
  canUseDirectoryPicker,
  consumeStartupTemplate,
});

})();
