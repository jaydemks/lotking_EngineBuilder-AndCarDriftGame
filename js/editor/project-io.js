/* =========================================================
   LOT KING — EDITOR PROJECT I/O
   Track metadata, save, import and export helpers.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const $ = deps.$;
  const beginStatusWork = deps.beginStatusWork;
  const updateStatusWork = deps.updateStatusWork;
  const finishStatusWork = deps.finishStatusWork;
  const flushHudHistory = deps.flushHudHistory;
  const levelsApi = deps.levelsApi;
  const refreshLevelsOverlay = deps.refreshLevelsOverlay;
  const refreshAssetsPanel = deps.refreshAssetsPanel;
  const promptEditorAction = deps.promptEditorAction || function(){ return Promise.resolve(null); };
  const confirmEditorAction = deps.confirmEditorAction;
  const reopenEditorAndReload = deps.reopenEditorAndReload;
  const setLevelLoading = deps.setLevelLoading || function(){};
  const status = deps.status;
  const applyInputConfig = deps.applyInputConfig || function(){};
  const getEditorLang = deps.getEditorLang || function(){ return 'en'; };
  const setEditorLang = deps.setEditorLang || function(){};
  const ACT = window.LK_RUNTIME_INPUT_ACTIONS;
  const BROWSER_PROJECT_INDEX = 'lk.editor.projects.v1';
  const BROWSER_PROJECT_PREFIX = 'lk.editor.project.';
  const BROWSER_PROJECT_MARKER = 'lk.editor.browserProject.v1';
  const projectExportAssets = window.LK_EDITOR_PLAYABLE_EXPORT_ASSETS && window.LK_EDITOR_PLAYABLE_EXPORT_ASSETS.create({
    assetLibraryLoad: deps.assetLibraryLoad || function(){ return []; },
  });
  let projectFileHandle = null;
  let projectFileBusy = false;
  let activeBrowserProjectId = null;
  let startupProjectsShown = false;
  let projectsLanguageBound = false;
  let projectImportTarget = 'project';
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  const isOnlineDemo = () => window.LK_PROJECT_WORKSPACE && window.LK_PROJECT_WORKSPACE.isOnlineDemoMode && window.LK_PROJECT_WORKSPACE.isOnlineDemoMode();
  function blockOnlineDemoAction(){
    status(tr('Online demo only. Run the project locally to import, save or edit assets.', 'Demo online: avvia il progetto in locale per importare, salvare o modificare asset.'));
    return true;
  }

  function slugifyTrackName(name){
    return (name || 'track').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
  }

  function setTrackMeta(meta){
    meta = meta || {};
    ED.trackName = meta.trackName || meta.levelName || ED.trackName || 'Parking Lot';
    ED.trackId = meta.trackId || meta.levelId || slugifyTrackName(ED.trackName);
    const input = $('#lkTrackName');
    if(input) input.value = ED.trackName;
    if(GAME.levels && GAME.levels.setEditorTrack) GAME.levels.setEditorTrack({id:ED.trackId, name:ED.trackName});
    // per-project input config (allowed devices, default bindings, players)
    ED.inputConfig = ACT ? ACT.normalizeConfig(meta.input) : (meta.input || null);
    applyInputConfig(ED.inputConfig);
  }

  function currentTrackMeta(){
    const meta = {trackId: ED.trackId || slugifyTrackName(ED.trackName), trackName: ED.trackName || 'Parking Lot'};
    if(ED.inputConfig) meta.input = ACT ? ACT.normalizeConfig(ED.inputConfig) : ED.inputConfig;
    return meta;
  }

  function loadTrackMeta(){
    let project = null;
    if(STORE.loadProject){
      project = STORE.loadProject();
      setTrackMeta(project.meta);
    } else {
      setTrackMeta({trackName:'Parking Lot', trackId:'parking-lot'});
    }
    ensureBrowserProjectSeed(project);
    showStartupProjectsOverlay();
  }

  function createProjectSnapshot(sceneData){
    return STORE.exportProject
      ? STORE.exportProject(sceneData, currentTrackMeta())
      : {format:'LKEP', meta:currentTrackMeta(), scene:sceneData};
  }

  function projectFilename(project){
    const stamp = (project.savedAt || new Date().toISOString()).replace(/[:.]/g, '-');
    const meta = project.meta || currentTrackMeta();
    return 'lot-king-' + slugifyTrackName(meta.trackName || meta.levelName || 'track') + '-' + stamp + '.lkep.json';
  }

  function canPickProjectFile(){
    return typeof window.showSaveFilePicker === 'function';
  }

  function projectJsonBlob(project){
    return new Blob([JSON.stringify(project, null, 2)], {type:'application/json'});
  }

  async function preparePortableProject(project){
    if(!projectExportAssets) return {project: JSON.parse(JSON.stringify(project || {})), warnings: []};
    return projectExportAssets.preparePlayableProject(project);
  }

  function saveWorkspaceProjectCopy(project){
    const workspace = window.LK_PROJECT_WORKSPACE;
    const linked = workspace && ((workspace.isFileMode && workspace.isFileMode()) || (workspace.isFolderMode && workspace.isFolderMode()));
    if(!workspace || !linked || !workspace.saveProject) return;
    preparePortableProject(project).then(result => {
      return workspace.saveProject(result.project, {name:browserProjectName(result.project)}).then(info => ({result, info}));
    }).then(bundle => {
      const warning = bundle.result.warnings && bundle.result.warnings.length ? ' (' + bundle.result.warnings[0] + ')' : '';
      status('Workspace copy saved: ' + bundle.info.file + warning);
    }).catch(err => {
      status('Workspace copy failed: ' + (err && err.message ? err.message : err));
    });
  }

  async function writeProjectFile(handle, project){
    const writable = await handle.createWritable();
    try {
      await writable.write(projectJsonBlob(project));
    } finally {
      await writable.close();
    }
  }

  function downloadProject(project){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(projectJsonBlob(project));
    a.download = projectFilename(project);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function pickProjectFile(project){
    if(!canPickProjectFile()) return Promise.resolve(null);
    return window.showSaveFilePicker({
      suggestedName: projectFilename(project),
      types: [{
        description: 'Lot King Editor Project',
        accept: {'application/json':['.json'], 'text/plain':['.lkep']},
      }],
    });
  }

  function browserProjectName(project){
    const meta = project && project.meta || currentTrackMeta();
    return meta.projectName || meta.trackName || meta.levelName || ED.trackName || 'New Project';
  }

  function browserProjectIndex(){
    try {
      const data = JSON.parse(localStorage.getItem(BROWSER_PROJECT_INDEX) || 'null');
      if(data && Array.isArray(data.projects)) return data;
    } catch(err){}
    return {activeId:null, projects:[]};
  }

  function writeBrowserProjectIndex(idx){
    localStorage.setItem(BROWSER_PROJECT_INDEX, JSON.stringify({
      activeId: idx.activeId || null,
      projects: Array.isArray(idx.projects) ? idx.projects : [],
    }));
  }

  function browserProjectKey(id){
    return BROWSER_PROJECT_PREFIX + slugifyTrackName(id || 'project');
  }

  function getBrowserMarker(){
    try { return JSON.parse(localStorage.getItem(BROWSER_PROJECT_MARKER) || 'null'); }
    catch(err){ return null; }
  }

  function setBrowserMarker(record){
    if(!record || !record.id) return;
    activeBrowserProjectId = record.id;
    try { localStorage.setItem(BROWSER_PROJECT_MARKER, JSON.stringify({id:record.id, savedAt:record.savedAt || null, name:record.name || record.id})); }
    catch(err){}
  }

  function browserProjectRecord(idx, id){
    id = slugifyTrackName(id || '');
    return (idx.projects || []).find(item => item && slugifyTrackName(item.id) === id) || null;
  }

  function uniqueBrowserProjectId(idx, name){
    const base = slugifyTrackName(name || 'project');
    const used = new Set((idx.projects || []).map(item => slugifyTrackName(item && item.id)));
    let id = base;
    let n = 2;
    while(used.has(id) || localStorage.getItem(browserProjectKey(id))){
      id = base + '-' + n;
      n += 1;
    }
    return id;
  }

  function readBrowserProject(id){
    try {
      const raw = localStorage.getItem(browserProjectKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch(err){ return null; }
  }

  function writeBrowserProject(project, opts){
    opts = opts || {};
    const idx = browserProjectIndex();
    const now = new Date().toISOString();
    const targetId = opts.newProject ? '' : slugifyTrackName(opts.id || activeBrowserProjectId || (getBrowserMarker() && getBrowserMarker().id) || '');
    const name = opts.name || browserProjectName(project);
    const id = targetId || uniqueBrowserProjectId(idx, name);
    const record = browserProjectRecord(idx, id) || {id};
    const saved = JSON.parse(JSON.stringify(project || {}));
    saved.savedAt = now;
    saved.meta = Object.assign({}, saved.meta || {}, {trackId: saved.meta && saved.meta.trackId || id, trackName: name});
    localStorage.setItem(browserProjectKey(id), JSON.stringify(saved));
    record.id = id;
    record.name = name;
    record.savedAt = now;
    if(!browserProjectRecord(idx, id)) idx.projects.push(record);
    idx.activeId = id;
    writeBrowserProjectIndex(idx);
    setBrowserMarker(record);
    return record;
  }

  function ensureBrowserProjectSeed(project){
    const idx = browserProjectIndex();
    if(idx.projects && idx.projects.length){
      activeBrowserProjectId = idx.activeId || (getBrowserMarker() && getBrowserMarker().id) || null;
      return;
    }
    const seed = project || (STORE.loadProject ? STORE.loadProject() : null);
    if(!seed) return;
    try {
      writeBrowserProject(seed, {name: browserProjectName(seed), newProject:true});
    } catch(err){}
  }

  function showStartupProjectsOverlay(){
    if(startupProjectsShown) return;
    startupProjectsShown = true;
    setTimeout(() => setProjectsOverlayOpen(true), 0);
  }

  function saveProjectFileAsync(project, opts){
    opts = opts || {};
    if(projectFileBusy && !opts.force) return;
    if(!projectFileHandle && !opts.allowPicker) return;
    if(!canPickProjectFile()){
      if(opts.allowDownloadFallback){
        projectFileBusy = true;
        preparePortableProject(project).then(result => {
          downloadProject(result.project);
          if(result.warnings && result.warnings.length) status('LKEP downloaded with warnings: ' + result.warnings[0]);
          else status('LKEP downloaded');
        }).catch(err => {
          status('Export failed: ' + (err && err.message ? err.message : err));
        }).finally(() => { projectFileBusy = false; });
      }
      return;
    }

    let handlePromise;
    try {
      handlePromise = projectFileHandle ? Promise.resolve(projectFileHandle) : pickProjectFile(project);
    } catch(err) {
      if(!err || err.name !== 'AbortError') status('Project file save failed: ' + (err && err.message ? err.message : err));
      return;
    }

    projectFileBusy = true;
    handlePromise.then(handle => {
      if(!handle) return null;
      projectFileHandle = handle;
      return preparePortableProject(project).then(result => {
        return writeProjectFile(handle, result.project).then(() => result);
      });
    }).then(result => {
      if(!result) return;
      if(result.warnings && result.warnings.length) status('Project file saved with warnings: ' + result.warnings[0]);
      else status('Project file saved ✓');
    }).catch(err => {
      if(err && err.name === 'AbortError') return;
      status('Project file save failed: ' + (err && err.message ? err.message : err));
    }).finally(() => {
      projectFileBusy = false;
    });
  }

  function isDataUrl(value){
    return typeof value === 'string' && /^data:/i.test(value);
  }

  function dataUrlToBlob(dataUrl){
    return fetch(dataUrl).then(response => response.blob());
  }

  function importedAssetDbKey(label, dataUrl){
    const mimeMatch = /^data:([^;,]+)/i.exec(dataUrl || '');
    const mime = mimeMatch ? mimeMatch[1].toLowerCase() : '';
    const ext = mime.indexOf('gltf') >= 0 || mime.indexOf('model') >= 0 ? '.glb'
      : mime.indexOf('png') >= 0 ? '.png'
      : mime.indexOf('jpeg') >= 0 || mime.indexOf('jpg') >= 0 ? '.jpg'
      : mime.indexOf('webp') >= 0 ? '.webp'
      : mime.indexOf('gif') >= 0 ? '.gif'
      : '.asset';
    return 'project-import:' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 8) + ':' + slugifyTrackName(label || 'asset') + ext;
  }

  async function moveDataUrlToAssetDb(owner, prop, label, dbProp){
    if(!owner || !isDataUrl(owner[prop]) || !window.LK_ASSET_BLOBS) return;
    const dataUrl = owner[prop];
    const dbKey = importedAssetDbKey(label, dataUrl);
    const blob = await dataUrlToBlob(dataUrl);
    await window.LK_ASSET_BLOBS.put(dbKey, blob);
    owner[prop] = null;
    owner[dbProp || 'dbKey'] = dbKey;
    if(owner.asset && typeof owner.asset === 'object') owner.asset.dbKey = dbKey;
  }

  async function localizePortableProjectAssets(project){
    const scene = project && (project.scene || project);
    if(!scene || !window.LK_ASSET_BLOBS) return project;
    if(scene.player) await moveDataUrlToAssetDb(scene.player, 'modelSrc', scene.player.modelName || 'player-model', 'modelDbKey');
    if(Array.isArray(scene.added)){
      for(const entry of scene.added){
        if(!entry) continue;
        if(entry.kind === 'glb') await moveDataUrlToAssetDb(entry, 'src', entry.name || entry.id || 'glb', 'dbKey');
        if(entry.kind === 'texture' && entry.props) await moveDataUrlToAssetDb(entry.props, 'src', entry.name || entry.id || 'texture', 'dbKey');
        if(entry.kind === 'logicElement'){
          const logicScene = entry.graph && entry.graph.logicScene;
          const elements = logicScene ? [logicScene.root].concat(logicScene.elements || []) : [];
          for(const element of elements){
            if(element && element.asset) await moveDataUrlToAssetDb(element.asset, 'src', element.name || element.id || 'logic-mesh', 'dbKey');
          }
          const assetScene = entry.logicAsset && entry.logicAsset.graph && entry.logicAsset.graph.logicScene;
          const assetElements = assetScene ? [assetScene.root].concat(assetScene.elements || []) : [];
          for(const element of assetElements){
            if(element && element.asset) await moveDataUrlToAssetDb(element.asset, 'src', element.name || element.id || 'logic-asset-mesh', 'dbKey');
          }
        }
      }
    }
    const musicLibraries = scene.ui && scene.ui.musicLibraries;
    if(musicLibraries){
      for(const groupName of ['radio', 'menu']){
        const tracks = Array.isArray(musicLibraries[groupName]) ? musicLibraries[groupName] : [];
        for(const track of tracks){
          await moveDataUrlToAssetDb(track, 'url', track.fileName || track.title || track.id || 'music-track', 'dbKey');
        }
      }
    }
    return project;
  }

  async function prepareImportedProjectText(raw){
    const project = STORE.parseProject ? STORE.parseProject(raw) : JSON.parse(raw);
    await localizePortableProjectAssets(project);
    return JSON.stringify(project);
  }

  function importedProjectName(file, project){
    const meta = project && project.meta || {};
    return meta.projectName || meta.trackName || meta.levelName || (file && file.name ? file.name.replace(/\.lkep(\.json)?$|\.json$/i, '') : 'Imported Project');
  }

  function importProjectAsBrowserProject(file, raw, progressToken){
    if(isOnlineDemo()) throw new Error('Online demo is read-only');
    const project = STORE.parseProject ? STORE.parseProject(raw) : JSON.parse(raw);
    const name = importedProjectName(file, project);
    updateStatusWork(progressToken, 42, tr('Preparing local assets', 'Preparazione asset locali'), 'loading');
    return prepareImportedProjectText(JSON.stringify(project)).then(projectText => {
      STORE.importProject(projectText);
      const imported = STORE.parseProject ? STORE.parseProject(projectText) : JSON.parse(projectText);
      writeBrowserProject(imported, {name, newProject:true});
      finishStatusWork(progressToken, tr('Import complete', 'Importazione completata'), tr('Loading project', 'Caricamento progetto'), 'success');
      reopenEditorAndReload('Project imported', name);
    });
  }

  function saveScene(opts){
    if(isOnlineDemo()) return !blockOnlineDemoAction();
    opts = opts || {};
    const progressToken = beginStatusWork(tr('Saving level', 'Salvataggio livello'), tr('Checking current state', 'Verifica stato corrente'), 'loading');
    updateStatusWork(progressToken, 10, tr('Preparing data', 'Preparazione dati'), 'loading');
    const active = document.activeElement;
    if(active && active.matches && active.matches('input[type="number"]')){
      active.dispatchEvent(new Event('input', {bubbles:true}));
      active.dispatchEvent(new Event('change', {bubbles:true}));
      if(active.blur) active.blur();
    }
    flushHudHistory();
    const input = $('#lkTrackName');
    if(input && input.value.trim()){
      ED.trackName = input.value.trim();
    }
    updateStatusWork(progressToken, 45, tr('Writing catalog', 'Scrittura catalogo'), 'loading');
    const sceneData = STORE.collect(GAME);
    const ok = STORE.save(sceneData, currentTrackMeta());
    if(!ok){
      ED.dirty = true;
      $('#lkDirty').classList.add('show');
      finishStatusWork(progressToken, tr('Save failed', 'Salvataggio fallito'), tr('Local storage unavailable', 'Local storage non disponibile'), 'error');
      status('⚠ Save failed: local level library was not updated');
      return false;
    }
    updateStatusWork(progressToken, 85, tr('Syncing UI', 'Sincronizzazione UI'), 'loading');
    const LV = levelsApi();
    const activeId = LV && LV.activeId ? LV.activeId() : ED.trackId;
    setTrackMeta({trackId: activeId || ED.trackId, trackName: ED.trackName});
    ED.dirty = false;
    $('#lkDirty').classList.remove('show');
    if(LV && LV.syncCatalog) LV.syncCatalog();
    if(ED.levelsOpen) refreshLevelsOverlay();
    refreshAssetsPanel();
    finishStatusWork(progressToken, tr('Level saved', 'Livello salvato'), tr('Operation complete', 'Operazione completata'), 'success');
    const project = createProjectSnapshot(sceneData);
    try {
      writeBrowserProject(project);
      status('Project saved ✓');
      saveWorkspaceProjectCopy(project);
    } catch(err) {
      saveProjectFileAsync(project, {allowPicker: !!opts.projectFile, allowDownloadFallback: !!opts.projectFile});
      if(!projectFileHandle) status('Track saved locally ✓');
    }
    return true;
  }

  function exportProject(){
    const progressToken = beginStatusWork('Export LKEP', tr('Serializing current level', 'Serializzazione livello corrente'), 'loading');
    flushHudHistory();
    updateStatusWork(progressToken, 10, tr('Data snapshot', 'Snapshot dati'), 'loading');
    const sceneData = STORE.collect(GAME);
    updateStatusWork(progressToken, 35, tr('Generating project', 'Generazione progetto'), 'loading');
    const project = createProjectSnapshot(sceneData);
    let picked;
    try {
      picked = (!isOnlineDemo() && canPickProjectFile()) ? pickProjectFile(project) : Promise.resolve(null);
    } catch(err) {
      picked = Promise.reject(err);
    }
    updateStatusWork(progressToken, 55, tr('Preparing project assets', 'Preparazione asset progetto'), 'loading');
    picked.then(handle => {
      if(handle) projectFileHandle = handle;
      return preparePortableProject(project).then(result => ({handle, result}));
    }).then(bundle => {
      updateStatusWork(progressToken, 82, bundle.handle ? tr('Writing project file', 'Scrittura file progetto') : tr('Download started', 'Download avviato'), 'loading');
      if(bundle.handle) return writeProjectFile(bundle.handle, bundle.result.project).then(() => bundle.result);
      downloadProject(bundle.result.project);
      return bundle.result;
    }).then(result => {
      const warningText = result.warnings && result.warnings.length ? tr('With warnings: ', 'Con avvisi: ') + result.warnings[0] : tr('Operation complete', 'Operazione completata');
      finishStatusWork(progressToken, tr('LKEP exported', 'LKEP esportato'), warningText, result.warnings && result.warnings.length ? 'warning' : 'success');
      status(projectFileHandle && !isOnlineDemo() ? 'LKEP saved and linked to Save ✓' : 'LKEP exported');
    }).catch(err => {
      if(err && err.name === 'AbortError'){
        finishStatusWork(progressToken, tr('Export cancelled', 'Export annullato'), tr('No file written', 'Nessun file scritto'), 'warning');
        status('Export cancelled');
        return;
      }
      finishStatusWork(progressToken, tr('Export failed', 'Export fallito'), (err && err.message) ? err.message : tr('Error', 'Errore'), 'error');
      status('Export failed: ' + (err && err.message ? err.message : err));
    });
  }

  function importProjectFile(file){
    $('#lkProjectInput').value = '';
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    if(!file) return;
    const importTarget = projectImportTarget;
    projectImportTarget = 'project';
    const progressToken = beginStatusWork(tr('LKEP import', 'Importazione LKEP'), tr('Reading file', 'Lettura file in corso'), 'loading');
    const reader = new FileReader();
    reader.onload = () => {
      Promise.resolve().then(async () => {
        if(importTarget === 'project'){
          await importProjectAsBrowserProject(file, reader.result, progressToken);
          return;
        }
        updateStatusWork(progressToken, 28, tr('Preparing project assets', 'Preparazione asset progetto'), 'loading');
        const projectText = await prepareImportedProjectText(reader.result);
        const LV = levelsApi();
        if(LV){
          updateStatusWork(progressToken, 42, tr('Adding to level library', 'Inserimento in libreria livelli'), 'loading');
          const id = LV.importProjectAsLevel(projectText, file.name.replace(/\.lkep(\.json)?$|\.json$/i, ''));
          if(!id) throw new Error(tr('local save failed (quota?)', 'salvataggio locale fallito (quota?)'));
          updateStatusWork(progressToken, 68, tr('Opening level', 'Apertura livello'), 'loading');
          const openImported = () => {
            LV.setActive(id);
            reopenEditorAndReload('Importato');
          };
          if(ED.dirty){
            confirmEditorAction({
              title:'Open imported level?',
              message:tr('The current level has unsaved changes that will be lost. Open the imported level?', 'Il livello corrente ha modifiche non salvate che andranno perse. Aprire il livello importato?'),
              okText:'Open level',
              danger:false,
            }).then(ok => {
              if(ok){
                finishStatusWork(progressToken, tr('Import complete', 'Importazione completata'), tr('Loading imported level', 'Caricamento livello importato'), 'success');
                openImported();
              }
              else {
                refreshLevelsOverlay();
                refreshAssetsPanel();
                finishStatusWork(progressToken, tr('Import complete', 'Importazione completata'), tr('The level is now in the library', 'Il livello e ora in libreria'), 'success');
                status(tr('Level imported into library ✓', 'Livello importato nella libreria ✓'));
              }
            });
            return;
          }
          updateStatusWork(progressToken, 86, tr('Reloading editor', 'Ricaricamento editor'), 'loading');
          openImported();
          return;
        }
        updateStatusWork(progressToken, 75, tr('Applying local project', 'Applicazione progetto locale'), 'loading');
        const project = STORE.importProject(projectText);
        setTrackMeta(project.meta);
        ED.dirty = false;
        $('#lkDirty').classList.remove('show');
        finishStatusWork(progressToken, tr('Import complete', 'Importazione completata'), tr('Reloading', 'Ricaricamento in corso'), 'success');
        status('Imported ' + (project.meta && project.meta.trackName ? project.meta.trackName : 'LKEP') + ' · reloading...');
        setTimeout(() => location.reload(), 450);
      }).catch(err => {
        finishStatusWork(progressToken, tr('Import failed', 'Importazione fallita'), (err && err.message) ? err.message : tr('Error', 'Errore'), 'error');
        status('Import failed: ' + err.message);
      });
    };
    reader.onerror = () => {
      finishStatusWork(progressToken, tr('Import failed', 'Importazione fallita'), tr('File not readable', 'File non leggibile'), 'error');
      status('Import failed: file not readable');
    };
    reader.readAsText(file);
  }

  function setProjectImportTarget(target){
    projectImportTarget = target === 'level' ? 'level' : 'project';
  }

  function syncProjectsLanguagePicker(){
    const L = getEditorLang() === 'it' ? 'it' : 'en';
    document.querySelectorAll('[data-project-lang]').forEach(button => {
      button.classList.toggle('on', button.dataset.projectLang === L);
      button.setAttribute('aria-pressed', button.dataset.projectLang === L ? 'true' : 'false');
    });
  }

  function bindProjectsLanguagePicker(){
    if(projectsLanguageBound) return;
    projectsLanguageBound = true;
    const overlay = $('#lkProjectsOverlay');
    if(!overlay) return;
    overlay.querySelectorAll('[data-project-lang]').forEach(button => {
      button.addEventListener('click', () => {
        setEditorLang(button.dataset.projectLang);
        syncProjectsLanguagePicker();
        refreshProjectsOverlay();
      });
    });
    window.addEventListener('lotking:languagechange', () => {
      syncProjectsLanguagePicker();
      if(ED.projectsOpen) refreshProjectsOverlay();
    });
  }

  function setProjectsOverlayOpen(open){
    ED.projectsOpen = !!open;
    const overlay = $('#lkProjectsOverlay');
    if(overlay) overlay.classList.toggle('open', ED.projectsOpen);
    bindProjectsLanguagePicker();
    syncProjectsLanguagePicker();
    if(ED.projectsOpen) refreshProjectsOverlay();
  }

  function refreshProjectsOverlay(){
    const box = $('#lkProjectsList');
    if(!box) return;
    box.innerHTML = '';
    const idx = browserProjectIndex();
    const list = Array.isArray(idx.projects) ? idx.projects.map(project => Object.assign({}, project, {active: project.id === idx.activeId})) : [];
    if(!list.length){
      box.appendChild(el('<div class="lk-empty">' + tr('No saved projects.<br>Create a project or press Save to save the current one.', 'Nessun progetto salvato.<br>Crea un progetto o premi Salva per salvare quello corrente.') + '</div>'));
      return;
    }
    list.forEach(project => {
      const row = el('<div class="lk-level-row' + (project.active ? ' active' : '') + '"></div>');
      const meta = el('<div class="lk-level-meta"></div>');
      const nm = el('<div class="lk-level-name"></div>');
      nm.textContent = project.name || project.id;
      if(project.active) nm.appendChild(el('<span class="lk-level-badge">' + tr('ACTIVE', 'ATTIVO') + '</span>'));
      const sub = el('<div class="lk-level-sub"></div>');
      sub.textContent = project.id + (project.savedAt ? tr(' · saved ', ' · salvato ') + new Date(project.savedAt).toLocaleString() : '');
      meta.append(nm, sub);
      const actions = el('<div class="lk-level-actions"></div>');
      const mkBtn = (label, title, fn, cls) => {
        const b = document.createElement('button');
        b.textContent = label; b.title = title;
        if(cls) b.className = cls;
        b.addEventListener('click', fn);
        return b;
      };
      if(!project.active) actions.appendChild(mkBtn(tr('▶ Load', '▶ Carica'), tr('Open this project', 'Apri questo progetto'), () => loadBrowserProject(project.id, project.name), 'lk-level-load'));
      actions.appendChild(mkBtn('✎', tr('Rename', 'Rinomina'), () => renameBrowserProject(project.id, project.name)));
      actions.appendChild(mkBtn('⇩', tr('Export LKEP', 'Esporta LKEP'), () => exportBrowserProject(project.id), 'lk-level-export'));
      actions.appendChild(mkBtn('🗑', tr('Delete', 'Elimina'), () => deleteBrowserProject(project.id, project.name), 'lk-level-del'));
      row.append(meta, actions);
      box.appendChild(row);
    });
  }

  async function createBrowserProject(){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    const next = await promptEditorAction({title:tr('New project', 'Nuovo progetto'), message:tr('New project name:', 'Nome del nuovo progetto:'), value:'New Project', okText:tr('Create', 'Crea')});
    if(!next || !next.trim()) return;
    if(ED.dirty){
      const ok = await confirmEditorAction({
        title:'Create new project?',
        message:tr('The current project has unsaved changes that will be lost. Continue?', 'Il progetto corrente ha modifiche non salvate che andranno perse. Continuare?'),
        okText:'Continue',
        danger:false,
      });
      if(!ok) return;
    }
    const LV = levelsApi();
    const sceneData = LV && LV.templateScene ? LV.templateScene(GAME) : STORE.blank();
    const meta = {trackId: slugifyTrackName(next.trim()), trackName: next.trim()};
    const project = createProjectSnapshot(sceneData);
    project.meta = Object.assign({}, project.meta || {}, meta);
    try {
      writeBrowserProject(project, {name:next.trim(), newProject:true});
      STORE.importProject(JSON.stringify(project));
      reopenEditorAndReload('Project created', next.trim());
    } catch(err) {
      status('Project create failed: ' + (err && err.message ? err.message : err));
    }
  }

  async function loadBrowserProject(id, name){
    if(ED.dirty){
      const ok = await confirmEditorAction({
        title:'Load project?',
        message:tr('The current project has unsaved changes that will be lost. Load "', 'Il progetto corrente ha modifiche non salvate che andranno perse. Caricare "') + (name || id) + '"?',
        okText:'Load',
        danger:false,
      });
      if(!ok) return;
    }
    setProjectsOverlayOpen(false);
    setLevelLoading(true, name || id, 14, 'Opening project');
    const idx = browserProjectIndex();
    const record = browserProjectRecord(idx, id);
    const project = readBrowserProject(id);
    if(!record || !project){
      setLevelLoading(false);
      status('Project load failed: project not found');
      return;
    }
    try {
      const projectText = JSON.stringify(project);
      STORE.importProject(projectText);
      idx.activeId = record.id;
      writeBrowserProjectIndex(idx);
      setBrowserMarker(record);
      reopenEditorAndReload('Project loaded', name || id);
    } catch(err) {
      setLevelLoading(false);
      status('Project load failed: ' + (err && err.message ? err.message : err));
    }
  }

  async function renameBrowserProject(id, currentName){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    const next = await promptEditorAction({title:tr('Rename project', 'Rinomina progetto'), message:tr('New project name:', 'Nuovo nome progetto:'), value:currentName || '', okText:tr('Rename', 'Rinomina')});
    if(!next || !next.trim() || next.trim() === currentName) return;
    try {
      const idx = browserProjectIndex();
      const record = browserProjectRecord(idx, id);
      const project = readBrowserProject(id);
      if(!record || !project) throw new Error('project not found');
      record.name = next.trim();
      project.meta = Object.assign({}, project.meta || {}, {trackName: next.trim()});
      localStorage.setItem(browserProjectKey(id), JSON.stringify(project));
      writeBrowserProjectIndex(idx);
      if(record.id === activeBrowserProjectId) setBrowserMarker(record);
      refreshProjectsOverlay();
      status('Project renamed ✓');
    } catch(err) {
      status(tr('Rename failed: ', 'Rinomina fallita: ') + (err && err.message ? err.message : err));
    }
  }

  function deleteBrowserProject(id, currentName){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    confirmEditorAction({
      title:tr('Delete project?', 'Eliminare progetto?'),
      message:tr('Delete "', 'Eliminare "') + (currentName || id) + tr('" permanently?', '" definitivamente?'),
      okText:tr('Delete project', 'Elimina progetto'),
    }).then(ok => {
      if(!ok) return;
      try {
        const idx = browserProjectIndex();
        idx.projects = (idx.projects || []).filter(project => !project || project.id !== id);
        localStorage.removeItem(browserProjectKey(id));
        if(idx.activeId === id) idx.activeId = idx.projects.length ? idx.projects[0].id : null;
        writeBrowserProjectIndex(idx);
        activeBrowserProjectId = idx.activeId || null;
        if(idx.activeId){
          const nextRecord = browserProjectRecord(idx, idx.activeId);
          if(nextRecord) setBrowserMarker(nextRecord);
        } else {
          try { localStorage.removeItem(BROWSER_PROJECT_MARKER); } catch(err){}
        }
        refreshProjectsOverlay();
        status(tr('Project deleted', 'Progetto eliminato'));
      } catch(err) {
        status(tr('Delete failed: ', 'Eliminazione fallita: ') + (err && err.message ? err.message : err));
      }
    });
  }

  function exportBrowserProject(id){
    const project = readBrowserProject(id);
    if(!project){
      status('Export failed: project not found');
      return;
    }
    preparePortableProject(project).then(result => {
      downloadProject(result.project);
      status('Project exported');
    }).catch(err => status('Export failed: ' + (err && err.message ? err.message : err)));
  }

  function bindWorkspaceProjectImport(){
    if(bindWorkspaceProjectImport.done) return;
    bindWorkspaceProjectImport.done = true;
    window.addEventListener('lot-king:workspace-project-loaded', event => {
      const detail = event.detail || {};
      if(!detail.text) return;
      const progressToken = beginStatusWork(tr('Workspace import', 'Importazione workspace'), tr('Reading local project', 'Lettura progetto locale'), 'loading');
      importProjectAsBrowserProject({name:detail.name || 'workspace-project.lkep.json'}, detail.text, progressToken);
    });
  }

  const el = deps.el || function(html){
    const t = document.createElement('template');
    t.innerHTML = String(html || '').trim();
    return t.content.firstChild;
  };

  bindWorkspaceProjectImport();

  return Object.freeze({
    slugifyTrackName, setTrackMeta, currentTrackMeta, loadTrackMeta, saveScene, projectFilename, exportProject, importProjectFile,
    setProjectImportTarget, setProjectsOverlayOpen, refreshProjectsOverlay, createBrowserProject, loadBrowserProject, renameBrowserProject, deleteBrowserProject, exportBrowserProject,
  });
}

window.LK_EDITOR_PROJECT_IO = Object.freeze({create});
})();
