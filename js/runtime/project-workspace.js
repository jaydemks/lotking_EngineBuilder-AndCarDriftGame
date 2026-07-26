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
const PROJECTS_DIR = 'projects';
const CATALOG_FILE = 'projects.json';
const DEMO_PROJECT_URL = 'demo/demo-project.lkep.json';
const GUIDE_URL = 'HOW_TO_START.md';
const GITHUB_URL = 'https://github.com/jaydemks/lotking_EngineBuilder-AndCarDriftGame';
const DEMO_BLOCKED_SELECTOR = [
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
let demoSaveOverlay = null;
let demoSaveResolve = null;
function workspaceLang(){
  if(window.LOT_KING && LOT_KING.i18n) return LOT_KING.i18n.lang === 'it' ? 'it' : 'en';
  try { return JSON.parse(localStorage.getItem('lotking.editorPrefs.v1') || '{}').lang === 'it' ? 'it' : 'en'; }
  catch(err){ return 'en'; }
}
function tr(en, it){ return workspaceLang() === 'it' ? (it || en) : en; }

function isAbortError(err){
  return !!err && (err.name === 'AbortError' || /aborted|annull/i.test(String(err.message || err)));
}

function friendlyError(err, fallback){
  if(isAbortError(err)) return tr('Operation cancelled.', 'Operazione annullata.');
  return err && err.message ? err.message : (fallback || String(err || 'Error'));
}

function isLocalOrigin(){
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function canUseDirectoryPicker(){
  return !!(window.isSecureContext && typeof window.showDirectoryPicker === 'function');
}

function canUseFilePicker(){
  return typeof window.FileReader === 'function' || !!(window.isSecureContext && typeof window.showOpenFilePicker === 'function');
}

function isOnlineDemoMode(){
  const state = loadState();
  if(state.mode === 'demo') return true;
  if(isLocalOrigin()) return false;
  return state.workspaceReady !== true;
}

function isPrivateBrowserDemo(){
  const state = loadState();
  return state.mode === 'browser' && state.workspaceReady === true && state.sourceTemplate === 'demo';
}

function canPublishAuthorDemo(){
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
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

function requestPersistentBrowserStorage(){
  const storage=typeof navigator!=='undefined'&&navigator.storage;
  if(!storage)return Promise.resolve(null);
  const persist=typeof storage.persist==='function'?Promise.resolve(storage.persist()).catch(()=>false):Promise.resolve(false);
  return persist.then(async persistent=>{
    let estimate=null;
    if(typeof storage.estimate==='function')try{estimate=await storage.estimate();}catch(err){}
    saveState({storagePersistent:persistent===true,storageUsage:estimate&&Number(estimate.usage)||null,storageQuota:estimate&&Number(estimate.quota)||null});
    return {persistent:persistent===true,estimate};
  });
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
  // A writable handle is immediately useful for the current session even if
  // a browser refuses to structured-clone it into IndexedDB. In that case the
  // user may need to re-authorize the folder after reopening the page, but the
  // requested save must not be discarded.
  return putStoredHandle(HANDLE_KEY, handle).catch(() => handle);
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
  return putStoredHandle(FILE_HANDLE_KEY, handle).catch(() => handle);
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

async function readJsonFile(dir, name, fallback){
  try {
    return JSON.parse(await readTextFile(dir, name));
  } catch(err){
    return fallback;
  }
}

async function readFileHandleText(handle){
  const file = await handle.getFile();
  return file.text();
}

function slugifyWorkspaceName(name){
  return String(name || 'project').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

function workspaceProjectName(project, fallback){
  const meta = project && project.meta || {};
  return meta.projectName || meta.trackName || meta.levelName || fallback || 'New Project';
}

function normalizeWorkspaceCatalog(catalog){
  const normalized = catalog && typeof catalog === 'object' ? catalog : {};
  const projects = Array.isArray(normalized.projects) ? normalized.projects : [];
  return {
    app:'LOT KING ENGINE EDITOR',
    format:'LK_WORKSPACE_PROJECTS',
    version:1,
    savedAt:normalized.savedAt || null,
    activeId:normalized.activeId || null,
    projects:projects.filter(Boolean).map(item => ({
      id:slugifyWorkspaceName(item.id || item.name),
      name:item.name || item.id || 'Project',
      file:item.file || (PROJECTS_DIR + '/' + slugifyWorkspaceName(item.id || item.name) + '.lkep.json'),
      savedAt:item.savedAt || null,
    })),
  };
}

async function workspaceProjectsDir(dir){
  return dir.getDirectoryHandle(PROJECTS_DIR, {create:true});
}

function uniqueWorkspaceProjectId(catalog, preferred){
  const base = slugifyWorkspaceName(preferred);
  const used = new Set((catalog.projects || []).map(item => slugifyWorkspaceName(item && item.id)));
  if(!used.has(base)) return base;
  let n = 2;
  while(used.has(base + '-' + n)) n += 1;
  return base + '-' + n;
}

async function readWorkspaceCatalog(dir){
  return normalizeWorkspaceCatalog(await readJsonFile(dir, CATALOG_FILE, null));
}

async function writeWorkspaceCatalog(dir, catalog){
  const normalized = normalizeWorkspaceCatalog(catalog);
  normalized.savedAt = new Date().toISOString();
  await writeJsonFile(dir, CATALOG_FILE, normalized);
  return normalized;
}

async function findWorkspaceProjectRecord(dir, id){
  const catalog = await readWorkspaceCatalog(dir);
  const wanted = slugifyWorkspaceName(id || catalog.activeId || '');
  return (catalog.projects || []).find(item => item && slugifyWorkspaceName(item.id) === wanted) || null;
}

async function writeWorkspaceManifest(dir, patch){
  await writeJsonFile(dir, MANIFEST_FILE, Object.assign({
    app:'LOT KING ENGINE EDITOR',
    format:'LK_WORKSPACE',
    version:1,
    savedAt:new Date().toISOString(),
    projectFile:PROJECT_FILE,
    catalogFile:CATALOG_FILE,
    projectsDir:PROJECTS_DIR,
    storage:'Files stay in this user-selected folder and browser storage. No server upload is used.',
  }, patch || {}));
}

async function upsertWorkspaceProject(dir, project, opts){
  opts = opts || {};
  const payload = project || {};
  const catalog = await readWorkspaceCatalog(dir);
  const name = opts.name || workspaceProjectName(payload);
  let id = slugifyWorkspaceName(opts.id || (payload.meta && payload.meta.trackId) || name);
  let record = (catalog.projects || []).find(item => item && slugifyWorkspaceName(item.id) === id);
  if(opts.newProject){
    id = uniqueWorkspaceProjectId(catalog, id);
    record = null;
  }
  if(!record) record = {id};
  const now = new Date().toISOString();
  const projectCopy = JSON.parse(JSON.stringify(payload));
  projectCopy.savedAt = now;
  projectCopy.meta = Object.assign({}, projectCopy.meta || {}, {trackId:id, trackName:name});
  const fileName = slugifyWorkspaceName(id) + '.lkep.json';
  const projectsDir = await workspaceProjectsDir(dir);
  await writeJsonFile(projectsDir, fileName, projectCopy);
  await writeJsonFile(dir, PROJECT_FILE, projectCopy);
  record.id = id;
  record.name = name;
  record.file = PROJECTS_DIR + '/' + fileName;
  record.savedAt = now;
  const existingIndex = (catalog.projects || []).findIndex(item => item && slugifyWorkspaceName(item.id) === id);
  if(existingIndex >= 0) catalog.projects[existingIndex] = record;
  else catalog.projects.push(record);
  catalog.activeId = id;
  await writeWorkspaceCatalog(dir, catalog);
  await writeWorkspaceManifest(dir, {
    activeId:id,
    activeProject:record.file,
    note:'This folder is a portable local workspace. Re-select it later to restore the project catalog in the browser.',
  });
  return {record, project:projectCopy};
}

async function readWorkspaceProjectText(dir, record){
  if(record && record.file){
    const parts = String(record.file).split('/').filter(Boolean);
    if(parts.length === 2 && parts[0] === PROJECTS_DIR){
      const projectsDir = await workspaceProjectsDir(dir);
      return readTextFile(projectsDir, parts[1]);
    }
  }
  return readTextFile(dir, PROJECT_FILE);
}

async function workspaceHasCatalogOrProject(handle){
  try {
    const dir = await workspaceDir(handle);
    const catalog = await readWorkspaceCatalog(dir);
    if(catalog.projects && catalog.projects.length) return true;
    await readTextFile(dir, PROJECT_FILE);
    return true;
  } catch(err){
    return false;
  }
}

function blankWorkspaceProject(name){
  const projectName = name || 'New Project';
  return {
    format:'LKEP',
    name:'Lot King Engine Project',
    version:1,
    game:'Lot King Browser-Native 3D Engine & Editor',
    savedAt:new Date().toISOString(),
    meta:{
      trackId:'new-project',
      trackName:projectName,
      levelRole:'gameplay',
    },
    scene:{
      version:1,
      counter:0,
      transforms:{},
      props:{},
      deleted:[],
      added:[],
      env:{},
      player:{},
      ui:{},
      logic:{},
    },
  };
}

async function initializeFolderWorkspace(handle, template){
  const dir = await workspaceDir(handle);
  const selectedTemplate = template === 'demo' ? 'demo' : 'empty';
  let project = blankWorkspaceProject(selectedTemplate === 'demo' ? 'Author DEMO Project' : 'New Project');
  if(selectedTemplate === 'demo'){
    const response = await fetch(DEMO_PROJECT_URL, {cache:'reload'});
    if(!response.ok) throw new Error(tr('DEMO project could not be downloaded', 'Impossibile scaricare il progetto DEMO'));
    project = JSON.parse(await response.text());
  }
  const saved = await upsertWorkspaceProject(dir, project, {
    id:project && project.meta && project.meta.trackId,
    name:workspaceProjectName(project, selectedTemplate === 'demo' ? 'Author DEMO Project' : 'New Project'),
    newProject:true,
  });
  await writeWorkspaceManifest(dir, {
    template:selectedTemplate,
    activeId:saved.record.id,
    activeProject:saved.record.file,
  });
  return saved.project;
}

async function connectFolder(options){
  const opts = options || {};
  if(!canUseDirectoryPicker()) throw new Error(tr('Folder access is available on HTTPS or localhost in Chromium browsers', 'L’accesso alle cartelle è disponibile su HTTPS o localhost nei browser Chromium'));
  const handle = await window.showDirectoryPicker({mode:'readwrite'});
  await putHandle(handle);
  let startupTemplate = opts.startupTemplate || null;
  if(opts.initialize){
    const hasWorkspace = await workspaceHasCatalogOrProject(handle);
    if(hasWorkspace) startupTemplate = null;
    else await initializeFolderWorkspace(handle, opts.template || 'empty');
  }
  saveState({
    mode:'folder',
    onlineEditor:true,
    workspaceReady:true,
    startupTemplate,
    sourceTemplate:null,
    demoSeedPending:false,
    folderName:handle.name || 'Project folder',
    projectFile:PROJECT_DIR + '/' + PROJECT_FILE,
  });
  return handle;
}

async function promoteDemoToFolder(projectFactory, opts){
  opts = opts || {};
  if(!isOnlineDemoMode()) throw new Error(tr('The editor is not running in online DEMO mode.', 'L’editor non è in modalità DEMO online.'));
  if(!canUseDirectoryPicker()) throw new Error(tr(
    'Direct folder saving requires Chrome or Edge on HTTPS. This browser can still export a portable LKEP file.',
    'Il salvataggio diretto su cartella richiede Chrome o Edge su HTTPS. Questo browser può comunque esportare un file LKEP portabile.'
  ));

  // The picker must be requested before awaiting project serialization, while
  // the Save click still owns a browser user gesture.
  const handle = await window.showDirectoryPicker({mode:'readwrite'});
  await putHandle(handle);
  const project = typeof projectFactory === 'function' ? await projectFactory() : await projectFactory;
  if(!project) throw new Error(tr('The current DEMO project could not be prepared.', 'Impossibile preparare il progetto DEMO corrente.'));
  const dir = await workspaceDir(handle);
  const saved = await upsertWorkspaceProject(dir, project, {
    id:opts.id || (project.meta && project.meta.trackId) || 'author-demo-copy',
    name:opts.name || workspaceProjectName(project, tr('Author DEMO copy', 'Copia DEMO autore')),
    newProject:true,
  });
  await writeWorkspaceManifest(dir, {
    template:'demo-copy',
    activeId:saved.record.id,
    activeProject:saved.record.file,
  });
  saveState({
    mode:'folder',
    onlineEditor:true,
    workspaceReady:true,
    startupTemplate:null,
    sourceTemplate:'demo-copy',
    demoSeedPending:false,
    folderName:handle.name || 'Project folder',
    projectFile:PROJECT_DIR + '/' + saved.record.file,
    lastProjectId:saved.record.id,
    lastProjectName:saved.record.name,
    lastSavedAt:new Date().toISOString(),
  });
  return {handle, record:saved.record, project:saved.project};
}

async function connectProjectFile(){
  if(window.isSecureContext&&typeof window.showOpenFilePicker==='function'){
    const handles = await window.showOpenFilePicker({multiple:false,types:[{description:'Lot King Editor Project',accept:{'application/json':['.json', '.lkep']}}]});
    const handle = handles && handles[0];
    if(!handle) throw new Error('No project file selected');
    const text = await readFileHandleText(handle);
    try { JSON.parse(text); }
    catch(err){ throw new Error(tr('The selected LKEP is not valid JSON.', 'Il file LKEP selezionato non contiene JSON valido.')); }
    await putProjectFileHandle(handle);
    saveState({mode:'file', onlineEditor:true, workspaceReady:true, sourceTemplate:null, demoSeedPending:false, fileName:handle.name || PROJECT_FILE, projectFile:handle.name || PROJECT_FILE, folderName:null});
    dispatchLoadedProject(text, handle.name || PROJECT_FILE);
    showToast('Linked LKEP project file: ' + (handle.name || PROJECT_FILE));
    return handle;
  }
  // Safari/WebKit has no user-visible showOpenFilePicker/showDirectoryPicker.
  // A standard file input is universally available; it imports the portable
  // project into browser storage, while later Save/Export downloads a new LKEP.
  const file=await new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='.lkep,.json,.lkep.json,application/json';input.style.display='none';document.body.appendChild(input);input.addEventListener('change',()=>{const selected=input.files&&input.files[0];input.remove();if(selected)resolve(selected);else reject(new DOMException('Operation cancelled','AbortError'));},{once:true});input.click();});
  const text=typeof file.text==='function'?await file.text():await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('Project file not readable'));reader.readAsText(file);});
  try { JSON.parse(text); }
  catch(err){ throw new Error(tr('The selected LKEP is not valid JSON.', 'Il file LKEP selezionato non contiene JSON valido.')); }
  cachedFileHandle=null;
  saveState({mode:'browser',onlineEditor:true,workspaceReady:true,sourceTemplate:null,demoSeedPending:false,fileName:file.name||PROJECT_FILE,projectFile:null,folderName:null});
  requestPersistentBrowserStorage();
  dispatchLoadedProject(text,file.name||PROJECT_FILE);
  showToast(tr('LKEP imported into browser storage.','LKEP importato nell’archivio del browser.'));
  return file;
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
  const saved = await upsertWorkspaceProject(dir, payload, {
    id:opts.id || (payload.meta && payload.meta.trackId),
    name:opts.name || workspaceProjectName(payload),
  });
  saveState({
    mode:'folder',
    folderName:handle.name || loadState().folderName || 'Project folder',
    projectFile:PROJECT_DIR + '/' + PROJECT_FILE,
    lastProjectId:saved.record.id,
    lastProjectName:saved.record.name,
    lastSavedAt:new Date().toISOString(),
  });
  showToast('Workspace project saved to ' + PROJECT_DIR + '/' + saved.record.file);
  return {folderName:handle.name || '', file:PROJECT_DIR + '/' + saved.record.file, id:saved.record.id};
}

async function loadProjectText(){
  const fileHandle = await getProjectFileHandle();
  if(fileHandle) return readFileHandleText(fileHandle);
  const handle = await ensureWritableHandle();
  const dir = await workspaceDir(handle);
  const catalog = await readWorkspaceCatalog(dir);
  const record = await findWorkspaceProjectRecord(dir, catalog.activeId);
  return readWorkspaceProjectText(dir, record);
}

async function readWorkspaceProjects(){
  if(!isFolderMode()) return {activeId:null, projects:[]};
  const handle = await ensureWritableHandle();
  const dir = await workspaceDir(handle);
  const catalog = await readWorkspaceCatalog(dir);
  const projects = [];
  for(const record of catalog.projects || []){
    try {
      projects.push({record, text:await readWorkspaceProjectText(dir, record)});
    } catch(err){}
  }
  if(!projects.length){
    try {
      const text = await readTextFile(dir, PROJECT_FILE);
      const project = JSON.parse(text);
      const name = workspaceProjectName(project, 'Workspace Project');
      const id = slugifyWorkspaceName(project && project.meta && project.meta.trackId || name);
      projects.push({record:{id, name, file:PROJECT_FILE, savedAt:project.savedAt || null}, text});
    } catch(err){}
  }
  return {activeId:catalog.activeId || (projects[0] && projects[0].record && projects[0].record.id) || null, projects};
}

function setBrowserMode(patch){
  saveState(Object.assign({
    mode:'browser',
    onlineEditor:true,
    workspaceReady:true,
    folderName:null,
    fileName:null,
    projectFile:null,
    sourceTemplate:null,
    demoSeedPending:false,
  },patch||{}));
  document.body.classList.remove('lk-online-demo');
  releaseDemoDisabledControls();
  requestPersistentBrowserStorage();
  showToast(tr('Using this browser local database. Nothing is uploaded.', 'Uso del database locale del browser. Nessun dato viene caricato.'));
}

async function chooseEditorProject(template){
  const selectedTemplate = template === 'empty' ? 'empty' : 'demo';
  if(selectedTemplate === 'demo'){
    setBrowserMode({
      startupTemplate:'demo',
      sourceTemplate:'demo',
      demoSeedPending:true,
    });
    showToast(tr('Creating your private browser copy of the author DEMO...', 'Creazione della tua copia browser privata del DEMO autore...'));
  } else {
    setBrowserMode({startupTemplate:'empty'});
  }
  location.reload();
}

function consumeStartupTemplate(expected){
  const state = loadState();
  const template = state.startupTemplate || null;
  if(template && (!expected || template === expected)) saveState({startupTemplate:null});
  return template;
}

function consumeDemoSeedPending(){
  const state = loadState();
  if(state.demoSeedPending !== true) return false;
  saveState({demoSeedPending:false});
  return true;
}

function markDemoSession(){
  const state = loadState();
  const needsSeed = state.demoSeedPending === true
    || state.startupTemplate === 'demo'
    || state.mode === 'demo'
    || state.workspaceReady !== true;
  const next = saveState({
    mode:'browser',
    onlineEditor:true,
    workspaceReady:true,
    folderName:null,
    fileName:null,
    projectFile:null,
    sourceTemplate:'demo',
    demoSeedPending:needsSeed,
  });
  document.body.classList.remove('lk-online-demo');
  releaseDemoDisabledControls();
  requestPersistentBrowserStorage();
  return next;
}

function resetChoice(){
  cachedHandle = null;
  cachedFileHandle = null;
  saveState({mode:'browser', onlineEditor:isLocalOrigin() ? true : false, workspaceReady:false, startupTemplate:null, sourceTemplate:null, demoSeedPending:false, folderName:null, fileName:null, projectFile:null, lastProjectName:null, lastSavedAt:null});
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
    ? tr('Open the author DEMO directly, or connect a local folder only if you want file mirroring. Nothing is uploaded to this server.', 'Apri direttamente il DEMO dell’autore, oppure collega una cartella locale solo se vuoi una copia su file. Nulla viene caricato su questo server.')
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
    if(browserTitle) browserTitle.textContent = tr('Browser project · all browsers', 'Progetto browser · tutti i browser');
    if(browserDesc) browserDesc.textContent = tr('Work in this browser with local IndexedDB storage. Compatible with Safari, Chrome, Edge and Firefox; nothing is uploaded.', 'Lavora nel browser usando IndexedDB locale. Compatibile con Safari, Chrome, Edge e Firefox; nulla viene caricato online.');
    if(fileTitle) fileTitle.textContent = canUseDirectoryPicker()?tr('Optional local folder mirror','Copia opzionale su cartella locale'):tr('Import an existing LKEP','Importa un LKEP esistente');
    if(fileDesc) fileDesc.textContent = canUseDirectoryPicker()?tr('Authorize a folder for automatic file mirroring.','Autorizza una cartella per la copia automatica su file.'):tr('Safari imports the portable file into browser storage; Save/Export downloads a new LKEP.','Safari importa il file portabile nel browser; Salva/Esporta scarica un nuovo LKEP.');
  }
  const guideCard = overlay.querySelector('#lkWorkspaceGuide');
  if(guideCard) guideCard.style.display = hosted ? '' : 'none';
  if(browserCard) browserCard.classList.add('primary');
  if(browserCard){
    browserCard.setAttribute('role', 'button');
    browserCard.tabIndex = 0;
    browserCard.addEventListener('keydown', event => {
      if(event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      browserCard.click();
    });
  }
  if(fileCard) fileCard.classList.toggle('primary', false);

  overlay.querySelector('#lkWorkspaceClose').addEventListener('click', closeOverlay);
  overlay.addEventListener('click', event => { if(event.target === overlay) closeOverlay(); });
  overlay.querySelector('#lkWorkspaceFile').addEventListener('click', () => {
    const operation=hosted&&canUseDirectoryPicker()?connectFolder({initialize:false}):connectProjectFile();
    operation.then(() => {
      syncOverlayStatus();
    }).catch(err => {
      const message = friendlyError(err, 'LKEP file connection failed');
      showToast(message);
      syncOverlayStatus(message);
    });
  });
  if(browserCard){
    browserCard.addEventListener('click', () => {
      if(hosted){
        const initialChoice = requiresInitialChoice();
        setBrowserMode();
        if(initialChoice)location.reload();else closeOverlay();
        return;
      }
      setBrowserMode();
      syncOverlayStatus();
    });
  }
  overlay.querySelector('#lkWorkspaceGuide').addEventListener('click', openGuide);
  overlay.querySelector('#lkWorkspaceDemo').addEventListener('click', () => chooseEditorProject('demo').catch(err => {
    const message = friendlyError(err);
    showToast(message);
    syncOverlayStatus(message);
  }));
  overlay.querySelector('#lkWorkspaceEmpty').addEventListener('click', () => chooseEditorProject('empty').catch(err => {
    const message = friendlyError(err);
    showToast(message);
    syncOverlayStatus(message);
  }));
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
      const message = friendlyError(err, 'Workspace project not found');
      showToast(message);
      syncOverlayStatus(message);
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
      ? tr('Online mode: DEMO opens from the hosted demo file; local folders are optional and never write to FTP/server.', 'Modalità online: il DEMO si apre dal file demo pubblicato; le cartelle locali sono opzionali e non scrivono mai su FTP/server.')
      : (canUseFilePicker()
        ? tr('LKEP file sync available.', 'Sincronizzazione file LKEP disponibile.')
        : tr('LKEP file sync is available in Chrome/Edge on localhost or HTTPS.', 'La sincronizzazione LKEP è disponibile in Chrome/Edge su localhost o HTTPS.'));
    const current = !isLocalOrigin() && !state.workspaceReady
      ? tr('Current mode: choose DEMO, a clean folder project, or optional local files.', 'Modalità attuale: scegli DEMO, un progetto pulito su cartella, o file locali opzionali.')
      : (state.mode === 'file'
      ? tr('Current mode: linked LKEP file', 'Modalità attuale: file LKEP collegato') + (state.fileName ? ' (' + state.fileName + ')' : '') + '.'
      : state.mode === 'folder'
      ? tr('Current mode: local folder', 'Modalità attuale: cartella locale') + (state.folderName ? ' (' + state.folderName + ')' : '') + '.'
      : state.sourceTemplate === 'demo'
      ? tr('Current mode: private author DEMO copy in this browser.', 'Modalità attuale: copia privata del DEMO autore in questo browser.')
      : tr('Current mode: local browser database.', 'Modalità attuale: database locale del browser.'));
    status.textContent = (error ? error + ' ' : '') + current + ' ' + support;
  }
}

function updateBadge(state){
  if(!badge) return;
  state = state || loadState();
  const topbarBtn = document.getElementById('lkWorkspaceBtn');
  badge.hidden = !!topbarBtn;
  if(topbarBtn) return;
  if(isOnlineDemoMode()){
    badge.textContent = 'Workspace: demo';
    badge.classList.remove('folder');
    badge.classList.add('demo');
    badge.title = tr('Online demo: editing, imports and destructive actions are disabled', 'Demo online: modifica, importazione e azioni distruttive sono disabilitate');
    return;
  }
  const privateDemo = isPrivateBrowserDemo();
  const file = state.mode === 'file';
  const folder = state.mode === 'folder';
  badge.textContent = privateDemo ? 'Workspace: private DEMO' : (file ? 'Workspace: ' + (state.fileName || 'LKEP') : (folder ? 'Workspace: ' + (state.folderName || 'folder') : 'Workspace: local DB'));
  badge.classList.toggle('folder', folder || file);
  badge.classList.remove('demo');
  badge.title = privateDemo
    ? tr('Private author DEMO copy saved only in this browser profile', 'Copia privata del DEMO autore salvata solo in questo profilo browser')
    : (file ? tr('Syncing saves to linked LKEP file', 'Salvataggi sincronizzati nel file LKEP collegato') : (folder && state.projectFile ? tr('Mirroring saves to ', 'Copia dei salvataggi in ') + state.projectFile : tr('Using this browser localStorage and IndexedDB', 'Uso di localStorage e IndexedDB del browser')));
}

function openOverlay(){
  renderOverlay().classList.add('open');
  syncOverlayStatus();
}

function workspaceButtonMarkup(compact){
  if(isOnlineDemoMode()){
    return compact
      ? '<span>CHOOSE WORKSPACE</span>'
      : '<b>PROJECT WORKSPACE</b><small>' + tr('setup required', 'configurazione richiesta') + '</small>';
  }
  const state = loadState();
  const privateDemo = isPrivateBrowserDemo();
  const file = state.mode === 'file';
  const folder = state.mode === 'folder';
  if(compact) return '<span>' + (privateDemo ? 'DEMO · PRIVATE' : (file ? 'LKEP LINKED' : (folder ? 'FOLDER WORKSPACE' : 'WORKSPACE'))) + '</span>';
  return '<b>' + (privateDemo ? 'AUTHOR DEMO' : (file ? 'LKEP PROJECT FILE' : (folder ? 'FOLDER WORKSPACE' : 'LOCAL WORKSPACE'))) + '</b><small>' + (privateDemo ? tr('private browser copy', 'copia privata browser') : (file ? 'sync on save' : (folder ? 'folder linked' : 'local DB'))) + '</small>';
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
      ? tr('Choose a private browser, linked-file or folder workspace', 'Scegli un workspace browser privato, file collegato o cartella')
      : (isPrivateBrowserDemo()
        ? tr('Private DEMO workspace: changes stay in this browser and are never uploaded', 'Workspace DEMO privato: le modifiche restano nel browser e non vengono mai caricate online')
        : 'Open project workspace options');
  });
}

function blockedDemoMessage(){
  showToast(tr('Choose a project workspace before editing.', 'Scegli un workspace di progetto prima di modificare.'));
}

function closeDemoSaveOverlay(result){
  const resolve = demoSaveResolve;
  demoSaveResolve = null;
  if(!demoSaveOverlay) return;
  demoSaveOverlay.classList.remove('open');
  demoSaveOverlay.remove();
  demoSaveOverlay = null;
  if(resolve) resolve(result || null);
}

function requestDemoSave(projectFactory, opts){
  if(!isOnlineDemoMode()) return Promise.resolve(null);
  if(demoSaveOverlay) closeDemoSaveOverlay();
  demoSaveOverlay = el('div', 'lk-workspace-overlay lk-demo-save-overlay open');
  demoSaveOverlay.id = 'lkDemoSaveOverlay';
  demoSaveOverlay.innerHTML = [
    '<div class="lk-workspace-panel" role="dialog" aria-modal="true" aria-labelledby="lkDemoSaveTitle">',
      '<div class="lk-workspace-head"><div>',
        '<div class="lk-workspace-kicker">' + tr('ONLINE DEMO', 'DEMO ONLINE') + '</div>',
        '<h2 id="lkDemoSaveTitle">' + tr('Save your project', 'Salva il progetto') + '</h2>',
      '</div></div>',
      '<div class="lk-workspace-status">' + tr(
        'This legacy session has not selected a writable workspace yet. Continue in private browser storage or select a folder for a portable mirror. Neither choice can overwrite the shared online project.',
        'Questa sessione precedente non ha ancora scelto un workspace modificabile. Continua nello spazio privato del browser o seleziona una cartella per una copia portabile. Nessuna scelta può sovrascrivere il progetto online condiviso.'
      ) + '</div>',
      '<div class="lk-workspace-grid">',
        '<button id="lkDemoSelectFolder" class="lk-workspace-card primary" type="button">',
          '<b>' + tr('Select folder on this PC', 'Seleziona cartella su PC') + '</b>',
          '<span>' + tr('A portable workspace copy is created locally. Nothing is uploaded to the server.', 'Viene creata una copia workspace portabile in locale. Nulla viene caricato sul server.') + '</span>',
        '</button>',
      '</div>',
      '<div id="lkDemoSaveStatus" class="lk-workspace-status"></div>',
      '<div class="lk-workspace-actions"><button id="lkDemoSaveCancel" type="button">' + tr('Continue without saving', 'Continua senza salvare') + '</button></div>',
    '</div>',
  ].join('');
  document.body.appendChild(demoSaveOverlay);
  const folderButton = demoSaveOverlay.querySelector('#lkDemoSelectFolder');
  const statusNode = demoSaveOverlay.querySelector('#lkDemoSaveStatus');
  if(!canUseDirectoryPicker()){
    folderButton.disabled = true;
    folderButton.classList.add('disabled');
    statusNode.textContent = tr(
      'Folder access is not supported by this browser. Use Chrome or Edge on HTTPS, or use Export LKEP to download a portable copy.',
      'Questo browser non supporta l’accesso diretto alle cartelle. Usa Chrome o Edge su HTTPS, oppure Esporta LKEP per scaricare una copia portabile.'
    );
  } else {
    statusNode.textContent = tr('The current DEMO remains untouched until a folder is selected.', 'Il DEMO corrente resta invariato finché non selezioni una cartella.');
  }
  return new Promise(resolve => {
    demoSaveResolve = resolve;
    const cancel = () => {
      closeDemoSaveOverlay();
    };
    demoSaveOverlay.querySelector('#lkDemoSaveCancel').addEventListener('click', cancel, {once:true});
    demoSaveOverlay.addEventListener('pointerdown', event => {
      if(event.target === demoSaveOverlay) cancel();
    });
    folderButton.addEventListener('click', () => {
      folderButton.disabled = true;
      statusNode.textContent = tr('Preparing and saving the local workspace…', 'Preparazione e salvataggio workspace locale…');
      promoteDemoToFolder(projectFactory, opts).then(result => {
        statusNode.textContent = tr('Project saved locally. Normal editor saving is now active.', 'Progetto salvato in locale. Il normale salvataggio dell’editor è ora attivo.');
        document.body.classList.remove('lk-online-demo');
        releaseDemoDisabledControls();
        syncWorkspaceButtons();
        updateBadge(loadState());
        setTimeout(closeDemoSaveOverlay, 700);
        demoSaveResolve = null;
        resolve(result);
      }).catch(err => {
        folderButton.disabled = false;
        const message = friendlyError(err, tr('Local save failed.', 'Salvataggio locale fallito.'));
        statusNode.textContent = message;
        showToast(message);
      });
    }, {once:false});
  });
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
    if('disabled' in node && !node.disabled){
      node.dataset.lkDemoDisabled = '1';
      node.disabled = true;
    }
    node.setAttribute('aria-disabled', 'true');
    if(!node.title) node.title = 'Disabled in online demo';
  });
}

function releaseDemoDisabledControls(){
  document.querySelectorAll('.lk-demo-locked').forEach(node => {
    node.classList.remove('lk-demo-locked');
    node.removeAttribute('aria-disabled');
    if(node.dataset && node.dataset.lkDemoDisabled === '1'){
      node.disabled = false;
      delete node.dataset.lkDemoDisabled;
    }
    if(node.title === 'Disabled in online demo') node.removeAttribute('title');
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
    if(mod && key === 's'){
      event.preventDefault();
      event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent('lot-king:demo-save-request'));
      return;
    }
    if(((key === 'delete' || key === 'backspace') && !isTextEditingTarget(event.target))
      || (mod && (key === 'i' || key === 'd' || key === 'r'))
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

  const appMenuBar = document.getElementById('lkAppMenuBar');
  const topbar = document.getElementById('lkTopbar');
  const workspaceHost = appMenuBar || topbar;
  if(workspaceHost && !document.getElementById('lkWorkspaceBtn')){
    const btn = document.createElement('button');
    btn.id = 'lkWorkspaceBtn';
    btn.className = 'lk-workspace-entry';
    btn.type = 'button';
    btn.addEventListener('click', openOverlay);
    if(appMenuBar) appMenuBar.appendChild(btn);
    else {
      const spacer = topbar.querySelector('.lk-spacer');
      const trackbar = topbar.querySelector('.lk-trackbar');
      if(spacer && spacer.parentNode) spacer.parentNode.insertBefore(btn, spacer.nextSibling);
      else if(trackbar && trackbar.parentNode) trackbar.parentNode.insertBefore(btn, trackbar);
      else topbar.insertBefore(btn, topbar.firstChild);
    }
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
      if(document.getElementById('lkAppMenuBar') || document.getElementById('lkTopbar') || tries > 80){
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

// v0.7.2 used `mode:demo` as a read-only hosted session. Upgrade that state
// in place before the editor boots: the published snapshot becomes a private,
// origin-scoped browser workspace and the next load seeds its own project copy.
const legacyDemoState = loadState();
if(legacyDemoState.mode === 'demo'){
  saveState({
    mode:'browser',
    onlineEditor:true,
    workspaceReady:true,
    startupTemplate:legacyDemoState.startupTemplate || 'demo',
    sourceTemplate:'demo',
    demoSeedPending:true,
    folderName:null,
    fileName:null,
    projectFile:null,
  });
  requestPersistentBrowserStorage();
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
  isPrivateBrowserDemo,
  canPublishAuthorDemo,
  markDemoSession,
  isEditorPage,
  requiresInitialChoice,
  connectProjectFile,
  connectFolder,
  promoteDemoToFolder,
  requestDemoSave,
  saveProject,
  loadProjectText,
  readWorkspaceProjects,
  canUseFilePicker,
  canUseDirectoryPicker,
  consumeStartupTemplate,
  consumeDemoSeedPending,
});

})();
