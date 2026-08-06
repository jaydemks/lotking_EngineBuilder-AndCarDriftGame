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
  const BROWSER_PROJECT_DB = 'lotking-editor-projects';
  const BROWSER_PROJECT_DB_STORE = 'projects';
  const BROWSER_PROJECT_DB_VERSION = 1;
  const BROWSER_PROJECT_INLINE_LIMIT = 1024 * 1024;
  const PROJECT_IDENTITY_VERSION = 4;
  const LOCAL_BRIDGE_URL = '/__lotking/project-state';
  const LOCAL_HISTORY_URL = '/__lotking/project-history';
  const LOCAL_HISTORY_RESTORE_URL = '/__lotking/project-history/restore';
  const LOCAL_DEMO_PUBLISH_URL = '/__lotking/publish-demo';
  const LOCAL_BRIDGE_MARKER = 'lk.localProjectBridge.v1';
  const LOCAL_BRIDGE_ETAG = 'lk.localProjectBridge.etag.v1';
  const LOCAL_BRIDGE_DUPLICATE_FIX = 'lk.localProjectBridgeDuplicateFix.v1';
  const LOCAL_BRIDGE_SOURCE = 'local-disk';
  const AUTHOR_DEMO_SOURCE = 'author-demo';
  const projectExportAssets = window.LK_EDITOR_PLAYABLE_EXPORT_ASSETS && window.LK_EDITOR_PLAYABLE_EXPORT_ASSETS.create({
    assetLibraryLoad: deps.assetLibraryLoad || function(){ return []; },
  });
  let projectFileHandle = null;
  let projectFileBusy = false;
  let activeBrowserProjectId = null;
  let workspaceProjectSyncBusy = false;
  let startupProjectsShown = false;
  let projectsLanguageBound = false;
  let projectHistoryRequest = 0;
  let projectImportTarget = 'project';
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  const isOnlineDemo = () => window.LK_PROJECT_WORKSPACE && window.LK_PROJECT_WORKSPACE.isOnlineDemoMode && window.LK_PROJECT_WORKSPACE.isOnlineDemoMode();
  const canPublishAuthorDemo = () => !window.LK_PROJECT_WORKSPACE
    || !window.LK_PROJECT_WORKSPACE.canPublishAuthorDemo
    || window.LK_PROJECT_WORKSPACE.canPublishAuthorDemo();
  function blockOnlineDemoAction(){
    status(tr('Online demo only. Run the project locally to import, save or edit assets.', 'Demo online: avvia il progetto in locale per importare, salvare o modificare asset.'));
    return true;
  }

  function requireExactPersistence(expectedScene, storedOrProject, stage){
    if(!(STORE && STORE.verifyPersistenceRoundTrip)) return true;
    const result = STORE.verifyPersistenceRoundTrip(expectedScene, storedOrProject);
    if(result.ok) return true;
    const paths = (result.differences || []).slice(0, 6).join(', ');
    throw new Error((stage || 'Persistence') + ' changed or omitted authored values' + (paths ? ': ' + paths : ''));
  }

  function slugifyTrackName(name){
    return (name || 'track').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
  }

  function setTrackMeta(meta){
    meta = meta || {};
    if(meta.projectName) ED.projectName = meta.projectName;
    ED.trackName = meta.trackName || meta.levelName || ED.trackName || 'Parking Lot';
    ED.trackId = meta.trackId || meta.levelId || slugifyTrackName(ED.trackName);
    ED.levelRole = ['editor-menu','game-menu'].includes(meta.levelRole)
      ? meta.levelRole
      : (meta.levelRole === 'gameplay' ? 'gameplay' : (ED.levelRole || 'gameplay'));
    const input = $('#lkTrackName');
    if(input) input.value = ED.trackName;
    if(GAME.levels && GAME.levels.setEditorTrack) GAME.levels.setEditorTrack({id:ED.trackId, name:ED.trackName, levelRole:ED.levelRole});
    // per-project input config (allowed devices, default bindings, players)
    ED.inputConfig = ACT ? ACT.normalizeConfig(meta.input) : (meta.input || null);
    applyInputConfig(ED.inputConfig);
  }

  function currentTrackMeta(){
    const meta = {trackId: ED.trackId || slugifyTrackName(ED.trackName), trackName: ED.trackName || 'Parking Lot', levelRole:ED.levelRole || 'gameplay'};
    const projectName = ED.projectName || activeBrowserProjectName();
    if(projectName) meta.projectName = projectName;
    if(ED.inputConfig) meta.input = ACT ? ACT.normalizeConfig(ED.inputConfig) : ED.inputConfig;
    return meta;
  }

  function loadTrackMeta(){
    let project = null;
    if(STORE.loadProject){
      project = STORE.loadProject();
      const LV = levelsApi();
      const loadedId = project && project.meta && (project.meta.trackId || project.meta.levelId);
      if(LV && LV.reconcileActive && loadedId) LV.reconcileActive(loadedId);
      const activeId=LV&&LV.activeId?LV.activeId():loadedId;
      const activeEntry=LV&&LV.list?LV.list({includeHidden:true}).find(level=>level&&level.id===activeId):null;
      // Loading a complete project is not a partial metadata edit. Old
      // projects without levelRole are gameplay by definition; retaining the
      // previous Editor Menu role here hid HUD/camera in unrelated FPS levels.
      const loadedMeta=Object.assign({levelRole:activeEntry&&activeEntry.levelRole||'gameplay'},project&&project.meta||{});
      if(!loadedMeta.levelRole)loadedMeta.levelRole='gameplay';
      const templateId=project&&project.scene&&project.scene.template&&String(project.scene.template.id||'');
      const officialFpsGameplay=templateId==='fps-shooter-test'||templateId==='fps-enemy-outpost';
      if(officialFpsGameplay&&(loadedMeta.levelRole==='editor-menu'||loadedMeta.levelRole==='game-menu')){
        loadedMeta.levelRole='gameplay';
        if(LV&&LV.setRole&&activeId)LV.setRole(activeId,'gameplay');
        console.warn('LotKing editor: repaired stale menu role on official FPS gameplay level',activeId,templateId);
      }
      setTrackMeta(loadedMeta);
    } else {
      setTrackMeta({trackName:'Parking Lot', trackId:'parking-lot', levelRole:'gameplay'});
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
    return 'lot-king-' + slugifyTrackName(meta.projectName || activeBrowserProjectName() || meta.trackName || meta.levelName || 'project') + '-' + stamp + '.lkep.json';
  }

  function canPickProjectFile(){
    return typeof window.showSaveFilePicker === 'function';
  }

  function projectJsonBlob(project){
    return new Blob([JSON.stringify(project, null, 2)], {type:'application/json'});
  }

  async function preparePortableProject(project){
    if(!projectExportAssets) return {project: JSON.parse(JSON.stringify(project || {})), warnings: []};
    return projectExportAssets.preparePlayableProject(project, {
      stripEmbeddedLevels:false,
      // A complete editor project can reference the same large GLB from the
      // Pawn definition, Logic Scene and several embedded levels. Keep one
      // portable payload per IndexedDB key instead of repeating its base64
      // string at every reference.
      deduplicateEmbeddedAssets:true,
    });
  }

  function createProjectSnapshotWithLevels(sceneData, exportLevels){
    const current = createProjectSnapshot(sceneData);
    const LV = levelsApi();
    if(!LV || !LV.list || !LV.get || !STORE.exportProjectWithLevels) return current;
    const optionsById = new Map();
    if(Array.isArray(exportLevels)){
      exportLevels.forEach(entry => {
        if(entry && entry.id != null) optionsById.set(String(entry.id), entry);
      });
    }
    const sourceLevels = LV.list({includeHidden:true}) || [];
    const levels = sourceLevels.map(level => {
      if(!level || !level.id) return null;
      const options = optionsById.size ? optionsById.get(String(level.id)) : null;
      if(optionsById.size && (!options || options.include === false)) return null;
      const isActive = level.active || String(level.id) === String(LV.activeId && LV.activeId() || '');
      const project = isActive ? current : LV.get(level.id);
      if(!project) return null;
      const visible = options ? options.visible !== false : level.visible !== false;
      return {
        id:level.id,
        name:level.name || project.meta && (project.meta.trackName || project.meta.levelName) || level.id,
        levelRole:level.levelRole || project.meta && project.meta.levelRole || 'gameplay',
        visible,
        savedAt:level.savedAt || project.savedAt || null,
        project,
      };
    }).filter(Boolean);
    if(!levels.length) return current;
    return STORE.exportProjectWithLevels(sceneData, currentTrackMeta(), levels, LV.activeId && LV.activeId());
  }

  function createCompleteProjectSnapshot(sceneData){
    return createProjectSnapshotWithLevels(sceneData, null);
  }

  async function createPortableCollaborationSnapshot(){
    const sceneData = STORE.collect(GAME);
    const project = createCompleteProjectSnapshot(sceneData);
    const prepared = await preparePortableProject(project);
    return prepared.project;
  }

  function applyPortableCollaborationSnapshot(project, name){
    const raw = JSON.stringify(project || {});
    const progressToken = beginStatusWork(tr('Collaboration snapshot', 'Snapshot collaborazione'), tr('Validating peer project', 'Validazione progetto del peer'), 'loading');
    return importProjectAsBrowserProject({name:name || 'p2p-collaboration.lkep.json'}, raw, progressToken);
  }

  function localBridgeAvailable(){
    const host = String(location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0'
      || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  }

  function localBridgeEligible(){
    if(window.LK_PROJECT_WORKSPACE
      && ((window.LK_PROJECT_WORKSPACE.isPrivateBrowserProject && window.LK_PROJECT_WORKSPACE.isPrivateBrowserProject())
        || (window.LK_PROJECT_WORKSPACE.isPrivateBrowserDemo && window.LK_PROJECT_WORKSPACE.isPrivateBrowserDemo()))) return false;
    return localBridgeAvailable();
  }

  function activeLocalBridgeRecord(){
    const idx=browserProjectIndex();
    const marker=getBrowserMarker&&getBrowserMarker();
    const id=slugifyTrackName(activeBrowserProjectId||idx.activeId||marker&&marker.id||'');
    const record=browserProjectRecord(idx,id);
    return record&&record.source===LOCAL_BRIDGE_SOURCE?record:null;
  }

  async function saveLocalBridgeProject(project, options){
    options=options||{};
    if(!localBridgeEligible() || !project) return null;
    // Browser projects, Author DEMO and temporary/test scenes are separate
    // authorities. Only the selected LOCAL DISK card may update its bridge;
    // an explicit import is the sole operation allowed to claim that role.
    if(!options.claimLocalAuthority&&!activeLocalBridgeRecord()){
      console.info('LotKing local bridge: skipped save from a non-local project authority');
      return null;
    }
    const result = await preparePortableProject(project);
    const headers={'Content-Type':'application/json','X-LotKing-Project-Authority':'local-disk'};
    if(options.confirmed===true)headers['X-LotKing-Confirm-Overwrite']='1';
    if(options.allowShrink===true)headers['X-LotKing-Allow-Project-Shrink']='1';
    const response = await fetch(LOCAL_BRIDGE_URL, {
      method:'PUT',
      headers,
      body:JSON.stringify(result.project),
    });
    if(!response.ok) throw new Error('Local project bridge HTTP ' + response.status);
    try {
      localStorage.setItem(LOCAL_BRIDGE_MARKER, result.project.savedAt || project.savedAt || 'saved');
      const etag = response.headers.get('ETag');
      if(etag) localStorage.setItem(LOCAL_BRIDGE_ETAG, etag);
    } catch(err){}
    try { sessionStorage.setItem(LOCAL_BRIDGE_MARKER, result.project.savedAt || project.savedAt || 'saved'); }
    catch(err){}
    return result;
  }

  async function restoreLocalBridgeProject(){
    if(!localBridgeAvailable()) return false;
    let progressToken = null;
    try {
      let etag = '';
      try { etag = localStorage.getItem(LOCAL_BRIDGE_ETAG) || ''; } catch(err){}
      // Installations created before the local-disk Projects card need one
      // complete read even when the scene ETag is unchanged, so the catalog can
      // be connected to its authoritative LKEP bridge.
      const bridgeRecordReady = hasLocalBridgeBrowserProject();
      const response = await fetch(LOCAL_BRIDGE_URL, {
        cache:'no-store',
        headers:etag && bridgeRecordReady ? {'If-None-Match':etag} : {},
      });
      if(response.status === 304){
        try { sessionStorage.setItem(LOCAL_BRIDGE_MARKER, etag || 'confirmed'); } catch(err){}
        compactActiveBrowserProjectForLocalBridge();
        return false;
      }
      if(!response.ok) return false;
      try {
        const nextEtag = response.headers.get('ETag');
        if(nextEtag) localStorage.setItem(LOCAL_BRIDGE_ETAG, nextEtag);
      } catch(err){}
      progressToken = beginStatusWork(tr('Restoring project', 'Ripristino progetto'), tr('Reading the complete project from disk', 'Lettura del progetto completo dal disco'), 'loading');
      updateStatusWork(progressToken, 22, tr('Parsing levels', 'Analisi livelli'), 'loading');
      const project = STORE.parseProject ? STORE.parseProject(await response.text()) : await response.json();
      const stamp = String(project.savedAt || 'project');
      const privateBrowserProject = !!(window.LK_PROJECT_WORKSPACE
        && ((window.LK_PROJECT_WORKSPACE.isPrivateBrowserProject && window.LK_PROJECT_WORKSPACE.isPrivateBrowserProject())
          || (window.LK_PROJECT_WORKSPACE.isPrivateBrowserDemo && window.LK_PROJECT_WORKSPACE.isPrivateBrowserDemo())));
      const localRecord = syncLocalBridgeBrowserProject(project, stamp, {active:!privateBrowserProject});
      if(ED.projectsOpen) refreshProjectsOverlay();
      // Discover the disk project while an Author DEMO is open, but keep that
      // deliberately selected DEMO scene active until Local Project is loaded.
      if(privateBrowserProject){
        finishStatusWork(progressToken, tr('Local project connected', 'Progetto locale collegato'), localRecord && localRecord.name || 'Local Project', 'success');
        return false;
      }
      // SessionStorage gives quota recovery a tiny independent proof even when
      // LocalStorage was already too full to record the previous bridge marker.
      try { sessionStorage.setItem(LOCAL_BRIDGE_MARKER, stamp); } catch(err){}
      compactActiveBrowserProjectForLocalBridge();
      repairBridgeCreatedBrowserProjectDuplicate(project);
      const LV = levelsApi();
      const localCount = LV && LV.list ? LV.list({includeHidden:true}).length : 0;
      const bridgeCount = 1 + (Array.isArray(project.embeddedLevels) ? project.embeddedLevels.length : 0);
      if(localStorage.getItem(LOCAL_BRIDGE_MARKER) === stamp && localCount >= bridgeCount){
        finishStatusWork(progressToken, tr('Project already synchronized', 'Progetto già sincronizzato'), '', 'success');
        return false;
      }
      updateStatusWork(progressToken, 48, tr('Migrating embedded assets', 'Migrazione asset incorporati'), 'loading');
      if(STORE.localizePortableProjectAssets) await STORE.localizePortableProjectAssets(project);
      updateStatusWork(progressToken, 82, tr('Installing all project levels', 'Installazione di tutti i livelli'), 'loading');
      STORE.importProject(JSON.stringify(project));
      localStorage.setItem(LOCAL_BRIDGE_MARKER, stamp);
      finishStatusWork(progressToken, tr('Project restored from disk', 'Progetto ripristinato dal disco'), localRecord && localRecord.name || browserProjectName(project), 'success');
      if(LV && LV.syncCatalog) LV.syncCatalog();
      if(ED.levelsOpen) refreshLevelsOverlay();
      window.dispatchEvent(new CustomEvent('lotking:local-project-restored', {detail:{project, record:localRecord, levelCount:bridgeCount}}));
      return true;
    } catch(err){
      if(progressToken) finishStatusWork(progressToken, tr('Project restore failed', 'Ripristino progetto fallito'), err && err.message || String(err || 'error'), 'error');
      console.warn('LotKing local project restore failed', err);
      status('⚠ ' + tr('Local project restore failed: ', 'Ripristino progetto locale fallito: ') + (err && err.message || err));
      return false;
    }
  }

  function isMenuLevelRole(role){
    return role === 'editor-menu' || role === 'game-menu';
  }

  function projectExportDefaultVisible(level){
    if(level && level.visible === false) return false;
    return !isMenuLevelRole(level && level.levelRole);
  }

  function levelRoleLabel(role){
    if(role === 'editor-menu') return 'EDITOR MENU';
    if(role === 'game-menu') return 'GAME MENU';
    return tr('GAMEPLAY', 'GIOCO');
  }

  async function pickProjectExportLevels(levels, activeId){
    const overlay = document.getElementById('lkConfirmOverlay') || $('#lkConfirmOverlay');
    const title = document.getElementById('lkConfirmTitle') || $('#lkConfirmTitle');
    const message = document.getElementById('lkConfirmMessage') || $('#lkConfirmMessage');
    const ok = document.getElementById('lkConfirmOk') || $('#lkConfirmOk');
    const cancel = document.getElementById('lkConfirmCancel') || $('#lkConfirmCancel');
    if(!overlay || !title || !message || !ok || !cancel) return null;
    if(overlay.parentNode !== document.body) document.body.appendChild(overlay);
    const list = Array.isArray(levels) ? levels.slice() : [];
    if(!list.length) return [];

    const oldInput = overlay.querySelector('.lk-confirm-input');
    if(oldInput) oldInput.remove();
    const oldPicker = overlay.querySelector('.lk-playable-level-picker');
    if(oldPicker) oldPicker.remove();

    title.textContent = tr('Export project levels', 'Export livelli progetto');
    ok.textContent = tr('⇩ Export Project', '⇩ Esporta progetto');
    ok.classList.toggle('danger', false);
    message.textContent = '';

    const activeKey = activeId != null ? String(activeId) : '';
    const rows = [];
    const picker = document.createElement('div');
    picker.className = 'lk-playable-level-picker lk-project-level-picker';

    const controls = document.createElement('div');
    controls.className = 'lk-playable-level-picker-controls';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'lk-playable-level-picker-toggle';
    const count = document.createElement('div');
    count.className = 'lk-playable-level-picker-count';
    controls.append(toggle, count);

    const rowsWrapper = document.createElement('div');
    rowsWrapper.className = 'lk-playable-level-picker-rows';

    const update = () => {
      let included = 0;
      let visible = 0;
      rows.forEach(row => {
        const isIncluded = row.include.checked || row.locked;
        if(row.locked) row.include.checked = true;
        row.visible.disabled = !isIncluded;
        if(!isIncluded) row.visible.checked = false;
        row.el.classList.toggle('off', !isIncluded);
        row.el.classList.toggle('primary', row.active);
        if(isIncluded) included += 1;
        if(isIncluded && row.visible.checked) visible += 1;
      });
      const optionalRows = rows.filter(row => !row.locked);
      const allOptionalIncluded = optionalRows.length ? optionalRows.every(row => row.include.checked) : true;
      toggle.textContent = allOptionalIncluded ? tr('Deselect optional', 'Deseleziona opzionali') : tr('Include all', 'Includi tutto');
      count.textContent = included + ' / ' + rows.length + tr(' included · ', ' inclusi · ') + visible + tr(' visible', ' visibili');
    };

    list.forEach(level => {
      const id = String(level.id || '');
      const active = id && id === activeKey || level.active;
      const row = document.createElement('div');
      row.className = 'lk-playable-level-picker-row lk-project-level-picker-row';

      const include = document.createElement('input');
      include.type = 'checkbox';
      include.className = 'lk-playable-level-picker-check';
      include.checked = true;
      include.disabled = !!active;
      include.title = active
        ? tr('The active level is exported as the project root', 'Il livello attivo viene esportato come root del progetto')
        : tr('Include this level inside the .lkep project', 'Includi questo livello nel progetto .lkep');

      const visible = document.createElement('input');
      visible.type = 'checkbox';
      visible.className = 'lk-playable-level-picker-check lk-project-level-picker-visible';
      visible.checked = projectExportDefaultVisible(level);
      visible.title = tr('Show this included level in normal project level lists after import', 'Mostra questo livello incluso nelle liste livelli normali dopo import');

      const label = document.createElement('span');
      label.className = 'lk-playable-level-picker-label';
      const name = document.createElement('span');
      name.textContent = level.name || level.id || tr('Level', 'Livello');
      const role = document.createElement('span');
      role.className = 'lk-playable-level-picker-badge lk-project-level-picker-role';
      role.textContent = levelRoleLabel(level.levelRole);
      label.append(name, role);
      if(active){
        const badge = document.createElement('span');
        badge.className = 'lk-playable-level-picker-badge';
        badge.textContent = tr('ROOT', 'ROOT');
        label.appendChild(badge);
      }

      const visibleText = document.createElement('span');
      visibleText.className = 'lk-project-level-picker-visible-label';
      visibleText.textContent = tr('VISIBLE', 'VISIBILE');

      include.addEventListener('change', update);
      visible.addEventListener('change', update);
      row.append(include, visible, visibleText, label);
      rowsWrapper.appendChild(row);
      rows.push({id, el:row, include, visible, locked:!!active, active:!!active, level});
    });

    toggle.addEventListener('click', () => {
      const optionalRows = rows.filter(row => !row.locked);
      const allIncluded = optionalRows.length ? optionalRows.every(row => row.include.checked) : true;
      optionalRows.forEach(row => { row.include.checked = !allIncluded; });
      update();
    });

    const hint = document.createElement('div');
    hint.className = 'lk-playable-level-picker-hint';
    hint.textContent = tr(
      'Included levels are written into the .lkep. Visible levels appear in normal project level lists after import. Menu roles can be included but hidden, so they still drive Editor Menu / Game Menu without showing as playable work levels.',
      'I livelli inclusi vengono scritti nel .lkep. I livelli visibili appaiono nelle liste livelli normali dopo import. I menu role possono essere inclusi ma nascosti, cosi guidano Editor Menu / Game Menu senza comparire come livelli di lavoro giocabili.'
    );

    picker.append(controls, rowsWrapper, hint);
    message.appendChild(picker);
    update();

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');

    return new Promise(resolve => {
      const close = value => {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        picker.remove();
        ok.removeEventListener('click', yes);
        cancel.removeEventListener('click', no);
        overlay.removeEventListener('pointerdown', outside);
        removeEventListener('keydown', key, true);
        resolve(value);
      };
      const yes = () => {
        const selected = rows.map(row => ({
          id:row.id,
          include:row.locked || row.include.checked,
          visible:(row.locked || row.include.checked) && row.visible.checked,
        }));
        if(!selected.some(row => row.include)){
          status(tr('⚠ Include at least one level', '⚠ Includi almeno un livello'));
          return;
        }
        close(selected);
      };
      const no = () => close(null);
      const outside = e => { if(e.target === overlay) close(null); };
      const key = e => {
        if(e.key === 'Escape'){ e.preventDefault(); close(null); }
        if(e.key === 'Enter'){ e.preventDefault(); yes(); }
      };
      ok.addEventListener('click', yes);
      cancel.addEventListener('click', no);
      overlay.addEventListener('pointerdown', outside);
      addEventListener('keydown', key, true);
      cancel.focus();
    });
  }

  function saveWorkspaceProjectCopy(project){
    const workspace = window.LK_PROJECT_WORKSPACE;
    const linked = workspace && ((workspace.isFileMode && workspace.isFileMode()) || (workspace.isFolderMode && workspace.isFolderMode()));
    if(!workspace || !linked || !workspace.saveProject) return;
    const folderMode = workspace.isFolderMode && workspace.isFolderMode();
    const projectName = browserProjectName(project);
    const folderSyncTitle = (en, it) => tr('Syncing local folder to: ', 'Allineando cartella locale a: ') + tr(en, it);
    const progressToken = beginStatusWork(
      folderMode ? folderSyncTitle('project preparation', 'preparazione progetto') : tr('Syncing LKEP file', 'Sincronizzazione file LKEP'),
      folderMode ? projectName : tr('Preparing project file', 'Preparazione file progetto'),
      'loading'
    );
    preparePortableProject(project).then(result => {
      updateStatusWork(
        progressToken,
        45,
        folderMode ? projectName : tr('Writing linked project file', 'Scrittura file progetto collegato'),
        'loading',
        folderMode ? folderSyncTitle('workspace catalog and project files', 'catalogo workspace e file progetto') : null
      );
      return workspace.saveProject(result.project, {id:activeBrowserProjectId, name:browserProjectName(result.project)}).then(info => ({result, info}));
    }).then(bundle => {
      const warning = bundle.result.warnings && bundle.result.warnings.length ? ' (' + bundle.result.warnings[0] + ')' : '';
      updateStatusWork(
        progressToken,
        92,
        bundle.info.file,
        'loading',
        folderMode ? folderSyncTitle('finalization', 'finalizzazione') : null
      );
      finishStatusWork(
        progressToken,
        folderMode ? tr('Local folder synced', 'Cartella locale allineata') : tr('LKEP file synced', 'File LKEP sincronizzato'),
        bundle.info.file + warning,
        bundle.result.warnings && bundle.result.warnings.length ? 'warning' : 'success'
      );
      status('Workspace copy saved: ' + bundle.info.file + warning);
    }).catch(err => {
      const message = err && err.message ? err.message : String(err || 'Error');
      finishStatusWork(
        progressToken,
        folderMode ? tr('Local folder sync failed', 'Allineamento cartella fallito') : tr('LKEP file sync failed', 'Sincronizzazione file LKEP fallita'),
        message,
        'error'
      );
      status('Workspace copy failed: ' + message);
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

  function downloadProject(project, exactName){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(projectJsonBlob(project));
    a.download = exactName || projectFilename(project);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function ensureJsZipForProjectFolder(){
    if(window.JSZip) return Promise.resolve(window.JSZip);
    if(ensureJsZipForProjectFolder.pending) return ensureJsZipForProjectFolder.pending;
    ensureJsZipForProjectFolder.pending = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/jszip-3.10.1.min.js?v=3.10.1-lk1';
      script.onload = () => window.JSZip ? resolve(window.JSZip) : reject(new Error('JSZip unavailable'));
      script.onerror = () => reject(new Error(tr('Unable to load the local ZIP writer', 'Impossibile caricare il generatore ZIP locale')));
      document.head.appendChild(script);
    });
    return ensureJsZipForProjectFolder.pending;
  }

  async function downloadSplitProjectZip(bundle){
    const JSZip = await ensureJsZipForProjectFolder();
    const zip = new JSZip();
    zip.file(bundle.base + '.lkep.json', JSON.stringify(bundle.pointer, null, 2));
    zip.file(bundle.base + '/manifest.json', JSON.stringify(bundle.manifest, null, 2));
    bundle.chunks.forEach(entry => zip.file(bundle.base + '/' + entry.file, entry.text));
    zip.file('README.txt', [
      'LOT KING split LKEP project',
      '',
      'Extract this ZIP before committing it to GitHub.',
      'Keep the .lkep.json pointer next to its same-named folder.',
      'For the bundled online demo use demo-project.lkep.json + demo-project/.',
      'Editor and Game load and verify every manifest part automatically.',
    ].join('\n'));
    const blob = await zip.generateAsync({type:'blob'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = bundle.base + '-split-project.zip';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  async function exportProjectFolder(){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return false; }
    const splitProject = window.LK_RUNTIME_SPLIT_PROJECT;
    if(!splitProject) throw new Error('Split project runtime is unavailable');
    const progressToken = beginStatusWork(tr('Export project folder', 'Esporta cartella progetto'), tr('Serializing project levels', 'Serializzazione livelli progetto'), 'loading');
    try {
      flushHudHistory();
      const sceneData = STORE.collect(GAME);
      const LV = levelsApi();
      const allLevels = LV && LV.list ? (LV.list({includeHidden:true}) || []) : [];
      const activeId = LV && LV.activeId ? LV.activeId() : ED.trackId;
      const exportLevels = await pickProjectExportLevels(allLevels, activeId);
      if(exportLevels === null) throw new DOMException('Operation cancelled', 'AbortError');
      updateStatusWork(progressToken, 25, tr('Generating exact project snapshot', 'Generazione snapshot esatto'), 'loading');
      const project = createProjectSnapshotWithLevels(sceneData, exportLevels);
      requireExactPersistence(sceneData, project, tr('Split LKEP snapshot verification', 'Verifica snapshot LKEP diviso'));
      updateStatusWork(progressToken, 42, tr('Preparing portable assets', 'Preparazione asset portabili'), 'loading');
      const prepared = await preparePortableProject(project);
      const projectName = browserProjectName(prepared.project);
      const suggested = /\bdemo\b/i.test(projectName) ? 'demo-project' : slugifyTrackName(projectName);
      const requested = await promptEditorAction({
        title:tr('Project folder name', 'Nome cartella progetto'),
        message:tr('Base name. For the GitHub online demo use "demo-project".', 'Nome base. Per il demo online GitHub usa "demo-project".'),
        value:suggested,
        okText:tr('Export', 'Esporta'),
      });
      if(requested == null) throw new DOMException('Operation cancelled', 'AbortError');
      updateStatusWork(progressToken, 55, tr('Splitting project into GitHub-safe parts', 'Divisione in parti compatibili con GitHub'), 'loading');
      const bundle = await splitProject.createBundle(prepared.project, requested);
      let info;
      if(typeof window.showDirectoryPicker === 'function'){
        const parent = await window.showDirectoryPicker({mode:'readwrite', id:'lotking-split-project-export'});
        info = await splitProject.writeBundle(parent, bundle, (ratio, file) => {
          updateStatusWork(progressToken, 62 + Math.round(ratio * 32), file, 'loading');
        });
      } else {
        await downloadSplitProjectZip(bundle);
        info = {pointerFile:bundle.base + '.lkep.json', folder:bundle.base, chunks:bundle.chunks.length, zipped:true};
      }
      const warning = prepared.warnings && prepared.warnings.length ? prepared.warnings[0] : '';
      const detail = info.pointerFile + ' + ' + info.folder + '/ · ' + info.chunks + tr(' parts', ' parti') + (warning ? ' · ' + warning : '');
      finishStatusWork(progressToken, tr('Split project exported', 'Progetto diviso esportato'), detail, warning ? 'warning' : 'success');
      status(info.zipped
        ? tr('Split project ZIP downloaded: extract it before committing to GitHub ✓', 'ZIP progetto diviso scaricato: estrailo prima del commit su GitHub ✓')
        : tr('GitHub-safe project folder exported ✓', 'Cartella progetto compatibile con GitHub esportata ✓'));
      return info;
    } catch(err){
      if(err && err.name === 'AbortError'){
        finishStatusWork(progressToken, tr('Export cancelled', 'Export annullato'), tr('No project folder written', 'Nessuna cartella scritta'), 'warning');
        return false;
      }
      finishStatusWork(progressToken, tr('Folder export failed', 'Export cartella fallito'), err && err.message || String(err), 'error');
      status(tr('Project folder export failed: ', 'Export cartella progetto fallito: ') + (err && err.message || err));
      return false;
    }
  }

  async function importProjectFolder(){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return false; }
    const splitProject = window.LK_RUNTIME_SPLIT_PROJECT;
    if(!splitProject || typeof window.showDirectoryPicker !== 'function'){
      status(tr('Project-folder import requires Chrome or Edge directory access.', 'L’import cartella progetto richiede accesso cartelle di Chrome o Edge.'));
      return false;
    }
    const progressToken = beginStatusWork(tr('Import project folder', 'Importa cartella progetto'), tr('Select the folder containing manifest.json', 'Seleziona la cartella contenente manifest.json'), 'loading');
    try {
      const directory = await window.showDirectoryPicker({mode:'read', id:'lotking-split-project-import'});
      const text = await splitProject.loadDirectory(directory, (ratio, file) => {
        updateStatusWork(progressToken, 10 + Math.round(ratio * 65), file, 'loading');
      });
      const project = STORE.parseProject ? STORE.parseProject(text) : JSON.parse(text);
      await importProjectAsBrowserProject({name:directory.name + '.lkep.json'}, JSON.stringify(project), progressToken);
      return true;
    } catch(err){
      if(err && err.name === 'AbortError'){
        finishStatusWork(progressToken, tr('Import cancelled', 'Import annullato'), '', 'warning');
        return false;
      }
      finishStatusWork(progressToken, tr('Folder import failed', 'Import cartella fallito'), err && err.message || String(err), 'error');
      status(tr('Project folder import failed: ', 'Import cartella progetto fallito: ') + (err && err.message || err));
      return false;
    }
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

  function activeBrowserProjectName(){
    const idx = browserProjectIndex();
    const marker = getBrowserMarker();
    const id = activeBrowserProjectId || idx.activeId || (marker && marker.id) || '';
    const record = browserProjectRecord(idx, id);
    return record && record.name
      || (marker && (!id || slugifyTrackName(marker.id) === slugifyTrackName(id)) && marker.name)
      || '';
  }

  function browserProjectName(project){
    const meta = project && project.meta || currentTrackMeta();
    return meta.projectName || activeBrowserProjectName() || meta.trackName || meta.levelName || ED.trackName || 'New Project';
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
    ED.projectName = record.name || ED.projectName || record.id;
    try { localStorage.setItem(BROWSER_PROJECT_MARKER, JSON.stringify({id:record.id, savedAt:record.savedAt || null, name:record.name || record.id})); }
    catch(err){}
  }

  function browserProjectRecord(idx, id){
    id = slugifyTrackName(id || '');
    return (idx.projects || []).find(item => item && slugifyTrackName(item.id) === id) || null;
  }

  function hasLocalBridgeBrowserProject(){
    const idx = browserProjectIndex();
    return !!(idx.projects || []).find(record => record && record.source === LOCAL_BRIDGE_SOURCE);
  }

  function isAuthorDemoBrowserRecord(record){
    return !!(record && (record.source===AUTHOR_DEMO_SOURCE || /(?:author\s+demo|demo\s+autore|demo\s+project)/i.test(String(record.name || ''))));
  }

  function localBridgeProjectName(project, record){
    const meta = project && project.meta || {};
    const candidate = String(meta.projectName || record && record.name || '').trim();
    const inheritedFromLevel = candidate && projectLevelNames(project).has(slugifyTrackName(candidate));
    const genericDemoName = /^demo project(?:\s+playground\b.*)?$/i.test(candidate);
    if(candidate && !inheritedFromLevel && !genericDemoName) return candidate;
    return 'Local Project';
  }

  function syncLocalBridgeBrowserProject(project, marker, options){
    options = options || {};
    const idx = browserProjectIndex();
    let record = (idx.projects || []).find(item => item && item.source === LOCAL_BRIDGE_SOURCE) || null;
    if(!record){
      const id = uniqueBrowserProjectId(idx, 'local-project');
      record = {id};
      idx.projects.push(record);
    }
    const stale = (idx.projects || []).filter(item => item && item !== record && item.source === LOCAL_BRIDGE_SOURCE);
    stale.forEach(item => localStorage.removeItem(browserProjectKey(item.id)));
    idx.projects = (idx.projects || []).filter(item => item && (item === record || item.source !== LOCAL_BRIDGE_SOURCE));
    record.name = localBridgeProjectName(project, record);
    record.savedAt = project && project.savedAt || marker || new Date().toISOString();
    record.source = LOCAL_BRIDGE_SOURCE;
    delete record.storage;
    localStorage.setItem(browserProjectKey(record.id), JSON.stringify(bridgeProjectManifest(project, record, marker)));
    if(options.active !== false){
      idx.activeId = record.id;
      activeBrowserProjectId = record.id;
      setBrowserMarker(record);
    }
    writeBrowserProjectIndex(idx);
    return record;
  }

  async function resolveBrowserProjectPayload(record, project){
    const authorDemoBacked = record && record.source === AUTHOR_DEMO_SOURCE
      || project && project.browserStorage && project.browserStorage.mode === 'author-demo';
    if(authorDemoBacked){
      const url='demo/demo-project.lkep.json';
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw new Error('Author DEMO HTTP '+response.status);
      let text=await response.text();
      const splitProject=window.LK_RUNTIME_SPLIT_PROJECT;
      if(splitProject&&splitProject.resolveText)text=await splitProject.resolveText(text,new URL(url,location.href).href);
      return STORE.parseProject?STORE.parseProject(text):JSON.parse(text);
    }
    const indexedBacked = record && record.storage === 'indexeddb'
      || project && project.browserStorage && project.browserStorage.mode === 'indexeddb-project';
    if(indexedBacked){
      const dbKey = project && project.browserStorage && project.browserStorage.dbKey || record && record.id;
      const projectText = await readIndexedBrowserProject(dbKey);
      if(!projectText) throw new Error('IndexedDB project payload not found');
      return STORE.parseProject ? STORE.parseProject(projectText) : JSON.parse(projectText);
    }
    const bridgeBacked = record && record.source === LOCAL_BRIDGE_SOURCE
      || project && project.browserStorage && project.browserStorage.mode === 'local-bridge-manifest';
    if(!bridgeBacked) return project;
    const response = await fetch(LOCAL_BRIDGE_URL, {cache:'no-store'});
    if(!response.ok) throw new Error('Local project bridge HTTP ' + response.status);
    return STORE.parseProject ? STORE.parseProject(await response.text()) : await response.json();
  }

  function projectLevelNames(project){
    const names = [];
    const add = value => {
      const normalized = String(value || '').trim();
      if(normalized) names.push(slugifyTrackName(normalized));
    };
    const meta = project && project.meta || {};
    add(meta.trackName || meta.levelName);
    (Array.isArray(project && project.embeddedLevels) ? project.embeddedLevels : []).forEach(level => {
      add(level && level.name);
      add(level && level.project && level.project.meta &&
        (level.project.meta.trackName || level.project.meta.levelName));
    });
    // Browser projects created before complete multi-level snapshots keep their
    // levels in the separate scene-store library. The bad project name may
    // therefore not appear inside `embeddedLevels` at all.
    try {
      const levelIndex = JSON.parse(localStorage.getItem('lotking.levels.v1') || 'null');
      (levelIndex && Array.isArray(levelIndex.levels) ? levelIndex.levels : []).forEach(level => {
        add(level && level.name);
        const id = level && level.id;
        if(!id) return;
        try {
          const savedLevel = JSON.parse(localStorage.getItem('lotking.level.' + id) || 'null');
          add(savedLevel && savedLevel.meta && (savedLevel.meta.trackName || savedLevel.meta.levelName));
        } catch(err){}
      });
      const activeScene = JSON.parse(localStorage.getItem('lotking.scene.v1') || 'null');
      add(activeScene && activeScene.meta && (activeScene.meta.trackName || activeScene.meta.levelName));
    } catch(err){}
    return new Set(names);
  }

  function migrateLegacyBrowserProjectIdentity(idx){
    let changed = false;
    const marker = getBrowserMarker();
    (idx.projects || []).forEach(record => {
      if(!record || !record.id) return;
      const project = readBrowserProject(record.id);
      if(!project) return;
      const meta = project.meta || {};
      const recordName = String(record.name || meta.projectName || record.id || '').trim();
      const inheritedFromLevel = projectLevelNames(project).has(slugifyTrackName(recordName));
      const explicitlyNamed = meta.projectIdentityExplicit === true;
      const needsRepair = inheritedFromLevel && !explicitlyNamed;
      if(Number(meta.projectIdentityVersion) >= PROJECT_IDENTITY_VERSION && !needsRepair) return;
      const stableFallback = String(project.name || STORE.PROJECT_NAME || 'Lot King Engine Project').trim();
      const projectName = needsRepair && stableFallback
        ? stableFallback
        : (recordName || stableFallback || 'Lot King Engine Project');
      record.name = projectName;
      project.meta = Object.assign({}, meta, {
        projectName,
        projectIdentityVersion:PROJECT_IDENTITY_VERSION,
        projectIdentityExplicit:explicitlyNamed,
        projectIdentitySource:needsRepair ? 'stable-project-root' : (meta.projectIdentitySource || 'catalog'),
      });
      localStorage.setItem(browserProjectKey(record.id), JSON.stringify(project));
      changed = true;
      if(slugifyTrackName(idx.activeId) === slugifyTrackName(record.id) ||
        marker && slugifyTrackName(marker.id) === slugifyTrackName(record.id)){
        setBrowserMarker(record);
      }
    });
    if(changed) writeBrowserProjectIndex(idx);
    return changed;
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

  function openBrowserProjectDb(){
    return new Promise((resolve, reject) => {
      if(!window.indexedDB){ reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open(BROWSER_PROJECT_DB, BROWSER_PROJECT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if(!db.objectStoreNames.contains(BROWSER_PROJECT_DB_STORE)) db.createObjectStore(BROWSER_PROJECT_DB_STORE, {keyPath:'id'});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
      request.onblocked = () => reject(new Error('IndexedDB project store is blocked by another tab'));
    });
  }

  async function writeIndexedBrowserProject(id, projectText, savedAt){
    const db = await openBrowserProjectDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(BROWSER_PROJECT_DB_STORE, 'readwrite');
        tx.objectStore(BROWSER_PROJECT_DB_STORE).put({id:String(id), text:String(projectText), savedAt:savedAt || null});
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB project write failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB project write aborted'));
      });
    } finally { db.close(); }
  }

  async function readIndexedBrowserProject(id){
    const db = await openBrowserProjectDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = db.transaction(BROWSER_PROJECT_DB_STORE, 'readonly').objectStore(BROWSER_PROJECT_DB_STORE).get(String(id));
        request.onsuccess = () => resolve(request.result && request.result.text || null);
        request.onerror = () => reject(request.error || new Error('IndexedDB project read failed'));
      });
    } finally { db.close(); }
  }

  async function removeIndexedBrowserProject(id){
    const db = await openBrowserProjectDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(BROWSER_PROJECT_DB_STORE, 'readwrite');
        tx.objectStore(BROWSER_PROJECT_DB_STORE).delete(String(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB project delete failed'));
      });
    } finally { db.close(); }
  }

  function indexedProjectManifest(project, record, byteLength){
    const source = project || {};
    return {
      format:source.format || 'LKEP',
      version:source.version || STORE.PROJECT_VERSION || '0.7.8',
      name:source.name || STORE.PROJECT_NAME || 'Lot King Engine Project',
      savedAt:source.savedAt || record.savedAt || new Date().toISOString(),
      meta:Object.assign({}, source.meta || {}, {projectName:record.name}),
      browserStorage:{mode:'indexeddb-project', dbKey:record.id, byteLength:Number(byteLength) || 0},
    };
  }

  async function compactOversizedBrowserProjects(){
    const idx = browserProjectIndex();
    let changed = false;
    for(const record of idx.projects || []){
      if(!record || !record.id) continue;
      const key = browserProjectKey(record.id);
      const raw = localStorage.getItem(key);
      if(!raw || raw.length <= BROWSER_PROJECT_INLINE_LIMIT) continue;
      let project = null;
      try { project = JSON.parse(raw); } catch(err){ continue; }
      if(project && project.browserStorage) continue;
      const marker = localBridgeMarker();
      if(record.source === LOCAL_BRIDGE_SOURCE && marker){
        localStorage.removeItem(key);
        localStorage.setItem(key, JSON.stringify(bridgeProjectManifest(project, record, marker)));
        delete record.storage;
      } else {
        await writeIndexedBrowserProject(record.id, raw, project && project.savedAt || record.savedAt);
        record.storage = 'indexeddb';
        localStorage.removeItem(key);
        localStorage.setItem(key, JSON.stringify(indexedProjectManifest(project, record, raw.length)));
      }
      changed = true;
    }
    if(changed) writeBrowserProjectIndex(idx);
    return changed;
  }

  function localBridgeMarker(){
    if(!localBridgeEligible()) return '';
    try {
      return String(localStorage.getItem(LOCAL_BRIDGE_MARKER) || sessionStorage.getItem(LOCAL_BRIDGE_MARKER) || '');
    } catch(err){
      try { return String(sessionStorage.getItem(LOCAL_BRIDGE_MARKER) || ''); }
      catch(sessionError){ return ''; }
    }
  }

  function bridgeProjectManifest(project, record, marker){
    const source = project || {};
    const sourceMeta = source.meta || {};
    const name = record && record.name || sourceMeta.projectName || ED.projectName || STORE.PROJECT_NAME || 'Lot King Engine Project';
    return {
      format:source.format || 'LKEP',
      version:source.version || STORE.PROJECT_VERSION || '0.7.8',
      name:source.name || STORE.PROJECT_NAME || 'Lot King Engine Project',
      savedAt:source.savedAt || record && record.savedAt || new Date().toISOString(),
      meta:Object.assign({}, currentTrackMeta(), sourceMeta, {
        projectName:name,
        projectIdentityVersion:PROJECT_IDENTITY_VERSION,
      }),
      browserStorage:{
        mode:'local-bridge-manifest',
        completeProject:'/__lotking/project-state',
        bridgeSavedAt:String(marker || ''),
      },
    };
  }

  function compactActiveBrowserProjectForLocalBridge(){
    const marker = localBridgeMarker();
    if(!marker) return false;
    try {
      const idx = browserProjectIndex();
      const diskRecord = (idx.projects || []).find(record => record && record.source === LOCAL_BRIDGE_SOURCE);
      const activeId = slugifyTrackName(diskRecord && diskRecord.id || activeBrowserProjectId || idx.activeId || (getBrowserMarker() && getBrowserMarker().id) || '');
      const record = browserProjectRecord(idx, activeId);
      if(!record) return false;
      if(record.source !== LOCAL_BRIDGE_SOURCE && window.LK_PROJECT_WORKSPACE
        && window.LK_PROJECT_WORKSPACE.isPrivateBrowserDemo
        && window.LK_PROJECT_WORKSPACE.isPrivateBrowserDemo()) return false;
      const key = browserProjectKey(record.id);
      const raw = localStorage.getItem(key);
      if(!raw) return false;
      let alreadyCompact = false;
      try {
        const parsed = raw.length < 256 * 1024 ? JSON.parse(raw) : null;
        alreadyCompact = !!(parsed && parsed.browserStorage && parsed.browserStorage.mode === 'local-bridge-manifest');
      } catch(err){}
      if(alreadyCompact) return false;
      // A successful bridge marker proves a complete recoverable LKEP already
      // exists on disk. Keep only project identity in LocalStorage; level JSON
      // remains in the level library and imported payloads remain in IndexedDB.
      localStorage.setItem(key, JSON.stringify(bridgeProjectManifest(null, record, marker)));
      console.info('LotKing storage: compacted redundant browser project snapshot; complete project remains in the local LKEP bridge');
      return true;
    } catch(err){
      console.warn('LotKing storage: browser project compaction failed', err);
      return false;
    }
  }

  function prepareBrowserProjectWrite(project, opts){
    opts = opts || {};
    const idx = browserProjectIndex();
    const now = new Date().toISOString();
    const targetId = opts.newProject ? '' : slugifyTrackName(opts.id || activeBrowserProjectId || (getBrowserMarker() && getBrowserMarker().id) || '');
    const existingRecord = targetId && browserProjectRecord(idx, targetId);
    const sourceMeta = project && project.meta || {};
    const name = opts.name || (existingRecord && existingRecord.name) || sourceMeta.projectName || browserProjectName(project);
    const id = targetId || uniqueBrowserProjectId(idx, name);
    const record = existingRecord || browserProjectRecord(idx, id) || {id};
    const makeActive = opts.active !== false;
    // JSON.stringify below already creates the detached persisted copy. Avoid a
    // full JSON clone immediately before it: complete multi-level projects can
    // be hundreds of MB and the duplicate pass blocks the editor thread.
    const source = project || {};
    const saved = Object.assign({}, source, {
      savedAt:now,
      meta:Object.assign({}, source.meta || {}, {
        trackId:source.meta && source.meta.trackId || id,
        projectName:name,
        projectIdentityVersion:PROJECT_IDENTITY_VERSION,
        projectIdentityExplicit:sourceMeta.projectIdentityExplicit === true || opts.explicitName === true,
      }),
    });
    record.id = id;
    record.name = name;
    record.savedAt = now;
    return {idx, id, record, saved, makeActive, marker:localBridgeMarker()};
  }

  function finishBrowserProjectWrite(write){
    const {idx, id, record, makeActive} = write;
    if(!browserProjectRecord(idx, id)) idx.projects.push(record);
    if(makeActive) idx.activeId = id;
    writeBrowserProjectIndex(idx);
    if(makeActive) setBrowserMarker(record);
    return record;
  }

  function writeBrowserProject(project, opts){
    const write = prepareBrowserProjectWrite(project, opts);
    const bridgeBacked = !!(write.marker && write.makeActive && !(opts && opts.newProject));
    if(write.record.storage === 'indexeddb' && !bridgeBacked){
      const projectText = JSON.stringify(write.saved);
      localStorage.setItem(browserProjectKey(write.id), JSON.stringify(indexedProjectManifest(write.saved, write.record, projectText.length)));
      writeIndexedBrowserProject(write.id, projectText, write.saved.savedAt).catch(err => console.warn('LotKing IndexedDB project update failed', err));
    } else {
      localStorage.setItem(
        browserProjectKey(write.id),
        JSON.stringify(bridgeBacked ? bridgeProjectManifest(write.saved, write.record, write.marker) : write.saved)
      );
      if(bridgeBacked) delete write.record.storage;
    }
    return finishBrowserProjectWrite(write);
  }

  async function writeBrowserProjectDurable(project, opts){
    await compactOversizedBrowserProjects();
    const write = prepareBrowserProjectWrite(project, opts);
    const bridgeBacked = !!(write.marker && write.makeActive && !(opts && opts.newProject));
    const projectText = JSON.stringify(write.saved);
    if(bridgeBacked){
      localStorage.setItem(browserProjectKey(write.id), JSON.stringify(bridgeProjectManifest(write.saved, write.record, write.marker)));
      delete write.record.storage;
      return finishBrowserProjectWrite(write);
    }
    if(projectText.length <= BROWSER_PROJECT_INLINE_LIMIT){
      try {
        localStorage.setItem(browserProjectKey(write.id), projectText);
        delete write.record.storage;
        return finishBrowserProjectWrite(write);
      } catch(err){
        if(!(err && (err.name === 'QuotaExceededError' || err.code === 22))) throw err;
      }
    }
    await writeIndexedBrowserProject(write.id, projectText, write.saved.savedAt);
    write.record.storage = 'indexeddb';
    // The full snapshot is durable before replacing any previous browser value.
    // Keeping only this manifest frees LocalStorage for the active level data.
    localStorage.removeItem(browserProjectKey(write.id));
    localStorage.setItem(browserProjectKey(write.id), JSON.stringify(indexedProjectManifest(write.saved, write.record, projectText.length)));
    return finishBrowserProjectWrite(write);
  }

  function embeddedLevelIds(project){
    return (Array.isArray(project && project.embeddedLevels) ? project.embeddedLevels : [])
      .map(entry => String(entry && entry.id || ''))
      .filter(Boolean)
      .sort()
      .join('|');
  }

  function repairBridgeCreatedBrowserProjectDuplicate(project){
    try {
      if(localStorage.getItem(LOCAL_BRIDGE_DUPLICATE_FIX) === '1') return false;
      const idx = browserProjectIndex();
      const bridgeId = slugifyTrackName(project && project.meta && project.meta.trackId || '');
      const bridgeRecord = browserProjectRecord(idx, bridgeId);
      const wantedName = slugifyTrackName(browserProjectName(project));
      const sibling = (idx.projects || []).find(record => record && slugifyTrackName(record.id) !== bridgeId && slugifyTrackName(record.name) === wantedName);
      const bridgeProject = bridgeRecord && readBrowserProject(bridgeRecord.id);
      const generatedSnapshot = bridgeProject && embeddedLevelIds(bridgeProject) && embeddedLevelIds(bridgeProject) === embeddedLevelIds(project);
      if(bridgeRecord && sibling && generatedSnapshot){
        localStorage.removeItem(browserProjectKey(bridgeRecord.id));
        idx.projects = idx.projects.filter(record => record && slugifyTrackName(record.id) !== bridgeId);
        if(slugifyTrackName(idx.activeId) === bridgeId) idx.activeId = sibling.id;
        writeBrowserProjectIndex(idx);
        setBrowserMarker(sibling);
      }
      localStorage.setItem(LOCAL_BRIDGE_DUPLICATE_FIX, '1');
      return !!(bridgeRecord && sibling && generatedSnapshot);
    } catch(err){
      console.warn('LotKing duplicate bridge project cleanup failed', err);
      return false;
    }
  }

  function syncAuthorDemoBrowserProject(project){
    if(!project)return null;
    const idx=browserProjectIndex();
    let record=(idx.projects||[]).find(item=>item&&item.source===AUTHOR_DEMO_SOURCE)||null;
    if(!record){record={id:uniqueBrowserProjectId(idx,'author-demo')};idx.projects.push(record);}
    const meta=project.meta||{};
    record.name=meta.trackName||meta.levelName||'Parking Lot First Ever Level Test Source';
    record.savedAt=project.savedAt||new Date().toISOString();
    record.source=AUTHOR_DEMO_SOURCE;
    delete record.storage;
    const manifest={
      format:project.format||'LKEP',
      version:project.version||STORE.PROJECT_VERSION||'0.7.8',
      name:project.name||STORE.PROJECT_NAME||'Lot King Engine Project',
      savedAt:record.savedAt,
      meta:Object.assign({},meta,{projectName:record.name,onlineDemo:true}),
      browserStorage:{mode:'author-demo',completeProject:'demo/demo-project.lkep.json'},
    };
    localStorage.setItem(browserProjectKey(record.id),JSON.stringify(manifest));
    idx.activeId=record.id;
    activeBrowserProjectId=record.id;
    writeBrowserProjectIndex(idx);
    setBrowserMarker(record);
    return record;
  }

  function ensureBrowserProjectSeed(project){
    if(isOnlineDemo()) return;
    const workspace = window.LK_PROJECT_WORKSPACE;
    const seedPrivateDemo = !!(project && workspace && workspace.consumeDemoSeedPending && workspace.consumeDemoSeedPending());
    const bundledAuthorDemo=!!(project&&project.meta&&project.meta.onlineDemo&&workspace&&workspace.isPrivateBrowserDemo&&workspace.isPrivateBrowserDemo());
    if(seedPrivateDemo||bundledAuthorDemo){
      try {
        syncAuthorDemoBrowserProject(project);
        status(tr(
          'Author DEMO ready · Save creates a separate working copy; LOCAL DISK remains untouched.',
          'DEMO autore pronto · Salva crea una copia di lavoro separata; DISCO LOCALE resta intatto.'
        ));
      } catch(err){
        console.warn('LotKing private DEMO project seed failed', err);
      }
      return;
    }
    const idx = browserProjectIndex();
    if(idx.projects && idx.projects.length){
      migrateLegacyBrowserProjectIdentity(idx);
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
    const keyProp = dbProp || 'dbKey';
    const dbKey = owner[keyProp] || owner.dbKey || (owner.asset && owner.asset.dbKey) || importedAssetDbKey(label, dataUrl);
    const blob = await dataUrlToBlob(dataUrl);
    await window.LK_ASSET_BLOBS.put(dbKey, blob);
    owner[prop] = null;
    owner[keyProp] = dbKey;
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
      for(const groupName of ['radio', 'loading', 'menu', 'editorMenu', 'gameMenu']){
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

  function commitActiveEditorControl(){
    const active = document.activeElement;
    if(!active || !active.matches || !active.matches('input, select, textarea')) return;
    const inspector = $('#lkInspector');
    const trackName = $('#lkTrackName');
    if(active !== trackName && !(inspector && inspector.contains(active))) return;
    // Many text/URL Inspector fields intentionally commit on change. Clicking
    // Save while they still had focus used to serialize the previous value.
    // Number/range controls also need input for their live preview callbacks.
    if(active.matches('input[type="number"], input[type="range"]')){
      active.dispatchEvent(new Event('input', {bubbles:true}));
    }
    active.dispatchEvent(new Event('change', {bubbles:true}));
    if(active.blur && active.isConnected) active.blur();
  }

  async function importProjectAsBrowserProject(file, raw, progressToken){
    if(isOnlineDemo()) throw new Error('Online demo is read-only');
    const project = STORE.parseProject ? STORE.parseProject(raw) : JSON.parse(raw);
    const name = importedProjectName(file, project);
    const confirmed = await confirmEditorAction({
      title:tr('Replace the active local project?', 'Sostituire il progetto locale attivo?'),
      message:tr(
        'Importing "',
        'Importando "'
      ) + name + tr(
        '" will make it the active LOCAL DISK project. The current project will first be preserved in Project History. Continue?',
        '" diventerà il progetto DISCO LOCALE attivo. Il progetto corrente verrà prima conservato nella Cronologia progetti. Continuare?'
      ),
      okText:tr('Import and preserve current', 'Importa e conserva attuale'),
      danger:false,
    });
    if(!confirmed){
      if(progressToken) finishStatusWork(progressToken, tr('Import cancelled', 'Importazione annullata'), tr('Nothing was changed', 'Nessuna modifica effettuata'), 'warning');
      return false;
    }
    updateStatusWork(progressToken, 42, tr('Preparing local assets', 'Preparazione asset locali'), 'loading');
    return prepareImportedProjectText(JSON.stringify(project)).then(async projectText => {
      const imported = STORE.parseProject ? STORE.parseProject(projectText) : JSON.parse(projectText);
      const importedRecord = await writeBrowserProjectDurable(imported, {name, newProject:true, explicitName:true});
      const importedFromIndexedDb = importedRecord.storage === 'indexeddb';
      // The disk bridge is the port-independent authority. Update it before
      // reloading, otherwise a new browser origin would restore the old active
      // project even though this import had just succeeded.
      let bridgeResult = null;
      try { bridgeResult = await saveLocalBridgeProject(imported,{claimLocalAuthority:true,allowShrink:true,confirmed:true}); }
      catch(err){ console.warn('LotKing import: port-independent disk bridge unavailable; keeping the IndexedDB copy', err); }
      if(bridgeResult){
        syncLocalBridgeBrowserProject(bridgeResult.project, bridgeResult.project.savedAt || imported.savedAt || 'imported');
        if(importedFromIndexedDb) await removeIndexedBrowserProject(importedRecord.id);
      }
      STORE.importProject(projectText);
      finishStatusWork(progressToken, tr('Import complete', 'Importazione completata'), tr('Loading project', 'Caricamento progetto'), 'success');
      reopenEditorAndReload('Project imported', name);
    });
  }

  async function saveScene(opts){
    if(isOnlineDemo()){
      return requestOnlineDemoSave();
    }
    opts = opts || {};
    const confirmed = await confirmEditorAction({
      title:tr('Save this project?', 'Salvare questo progetto?'),
      message:tr(
        'The current LOCAL DISK version will be preserved in Project History before the new version is written.',
        'La versione corrente su DISCO LOCALE verrà conservata nella Cronologia progetti prima di scrivere la nuova versione.'
      ),
      okText:tr('Save new version', 'Salva nuova versione'),
      danger:false,
    });
    if(!confirmed){
      status(tr('Save cancelled · nothing changed', 'Salvataggio annullato · nessuna modifica'));
      return false;
    }
    return saveSceneConfirmed(Object.assign({}, opts, {confirmed:true}));
  }

  function saveSceneConfirmed(opts){
    opts = opts || {};
    const projectIndexBeforeSave=browserProjectIndex();
    const activeRecordBeforeSave=browserProjectRecord(projectIndexBeforeSave,activeBrowserProjectId||projectIndexBeforeSave.activeId||'');
    const savingAuthorDemo=!!(activeRecordBeforeSave&&activeRecordBeforeSave.source===AUTHOR_DEMO_SOURCE);
    const progressToken = beginStatusWork(tr('Saving level', 'Salvataggio livello'), tr('Checking current state', 'Verifica stato corrente'), 'loading');
    updateStatusWork(progressToken, 10, tr('Preparing data', 'Preparazione dati'), 'loading');
    commitActiveEditorControl();
    flushHudHistory();
    const input = $('#lkTrackName');
    if(input && input.value.trim()){
      ED.trackName = input.value.trim();
    }
    // The rendered editor scene is the authority for a manual Save. Repair a
    // stale catalog selection before the first write, then pin the target for
    // the whole synchronous browser-store transaction. This prevents a level
    // switch/catalog race from writing the open scene under another level id.
    const LV = levelsApi();
    const editorLevelId = String(ED.trackId || '').trim();
    if(LV && LV.reconcileActive && editorLevelId) LV.reconcileActive(editorLevelId);
    const saveTargetId = String(LV && LV.activeId ? LV.activeId() : editorLevelId).trim();
    if(!saveTargetId || (editorLevelId && saveTargetId !== editorLevelId)){
      ED.dirty = true;
      $('#lkDirty').classList.add('show');
      finishStatusWork(progressToken, tr('Save failed', 'Salvataggio fallito'), tr('Active level could not be verified', 'Impossibile verificare il livello attivo'), 'error');
      status(tr('⚠ Save stopped: active level could not be verified', '⚠ Salvataggio interrotto: impossibile verificare il livello attivo'));
      return false;
    }
    const saveMeta = Object.assign({}, currentTrackMeta(), {trackId:saveTargetId});
    updateStatusWork(progressToken, 45, tr('Writing catalog', 'Scrittura catalogo'), 'loading');
    const sceneData = STORE.collect(GAME);
    // A previous complete multi-level browser-project snapshot can consume the
    // whole LocalStorage quota even though the authoritative localhost LKEP is
    // already on disk. Compact that proven-recoverable duplicate before the
    // level store needs room for the new revision.
    compactActiveBrowserProjectForLocalBridge();
    const ok = STORE.save(sceneData, saveMeta, {expectedActiveId:saveTargetId});
    if(!ok){
      ED.dirty = true;
      $('#lkDirty').classList.add('show');
      finishStatusWork(progressToken, tr('Save failed', 'Salvataggio fallito'), tr('Browser storage quota exhausted', 'Quota di archiviazione browser esaurita'), 'error');
      status(tr('⚠ Save failed: browser storage quota exhausted', '⚠ Salvataggio fallito: quota di archiviazione browser esaurita'));
      return false;
    }
    try {
      requireExactPersistence(sceneData, STORE.load(), tr('Local save verification', 'Verifica salvataggio locale'));
      requireExactPersistence(sceneData, createProjectSnapshot(sceneData), tr('Project snapshot verification', 'Verifica snapshot progetto'));
      const storedProject = STORE.loadProject ? STORE.loadProject() : null;
      const storedLevelId = String(storedProject && storedProject.meta && storedProject.meta.trackId || '').trim();
      const activeLevelId = String(LV && LV.activeId ? LV.activeId() : saveTargetId).trim();
      if(storedLevelId !== saveTargetId || activeLevelId !== saveTargetId){
        throw new Error(tr('The active level identity changed during Save', 'L’identità del livello attivo è cambiata durante il salvataggio'));
      }
    } catch(err){
      ED.dirty = true;
      $('#lkDirty').classList.add('show');
      finishStatusWork(progressToken, tr('Save verification failed', 'Verifica salvataggio fallita'), err.message, 'error');
      status('⚠ ' + err.message);
      return false;
    }
    updateStatusWork(progressToken, 85, tr('Syncing UI', 'Sincronizzazione UI'), 'loading');
    const activeId = saveTargetId;
    setTrackMeta({trackId: activeId || ED.trackId, trackName: ED.trackName});
    ED.dirty = false;
    $('#lkDirty').classList.remove('show');
    if(LV && LV.syncCatalog) LV.syncCatalog();
    if(ED.levelsOpen) refreshLevelsOverlay();
    // Rebuilding the complete asset catalog is expensive and invisible while
    // the Scene tab is active. setLeftMode('assets') refreshes it on demand.
    if(ED.leftMode === 'assets') refreshAssetsPanel();
    finishStatusWork(progressToken, tr('Level saved', 'Livello salvato'), tr('Operation complete', 'Operazione completata'), 'success');
    const project = createCompleteProjectSnapshot(sceneData);
    let browserCatalogSaved = false;
    try {
      const workingName=(project.meta&&project.meta.trackName||ED.trackName||'Author DEMO')+tr(' · Working Copy',' · Copia di lavoro');
      writeBrowserProject(project,savingAuthorDemo?{name:workingName,newProject:true,explicitName:true}:undefined);
      if(savingAuthorDemo){
        const workspace=window.LK_PROJECT_WORKSPACE;
        if(workspace&&workspace.activateBrowserProject)workspace.activateBrowserProject({demo:false});
      }
      browserCatalogSaved = true;
      status(savingAuthorDemo?tr('Working copy created · Author DEMO preserved ✓','Copia di lavoro creata · DEMO autore conservato ✓'):'Project saved ✓');
    } catch(err) {
      saveProjectFileAsync(project, {allowPicker: !!opts.projectFile, allowDownloadFallback: !!opts.projectFile});
      if(!projectFileHandle) status('Track saved locally ✓');
    }
    // Disk/workspace persistence must not be skipped just because the optional
    // browser project catalog is full. The old ordering returned from the catch
    // before either durable copy had a chance to run.
    saveWorkspaceProjectCopy(project);
    saveLocalBridgeProject(project,{confirmed:opts.confirmed===true}).then(result => {
      if(!result || browserCatalogSaved) return;
      try { writeBrowserProject(project); }
      catch(err){}
    }).catch(err => status('⚠ Local disk backup failed: ' + (err && err.message ? err.message : err)));
    window.dispatchEvent(new CustomEvent('lotking:project-saved', {detail:{
      source: opts.coworkRemote ? 'cowork' : 'local',
      trackId: activeId || ED.trackId,
      trackName: ED.trackName,
    }}));
    return true;
  }

  function requestOnlineDemoSave(){
    const workspace = window.LK_PROJECT_WORKSPACE;
    if(!workspace || !workspace.requestDemoSave){
      blockOnlineDemoAction();
      return Promise.resolve(false);
    }
    commitActiveEditorControl();
    flushHudHistory();
    const input = $('#lkTrackName');
    if(input && input.value.trim()) ED.trackName = input.value.trim();
    const sceneData = STORE.collect(GAME);
    const project = createCompleteProjectSnapshot(sceneData);
    try {
      requireExactPersistence(sceneData, project, tr('Local project snapshot verification', 'Verifica snapshot progetto locale'));
    } catch(err){
      status('⚠ ' + err.message);
      return Promise.resolve(false);
    }
    return workspace.requestDemoSave(
      () => preparePortableProject(project).then(result => result.project),
      {id:project.meta && project.meta.trackId, name:browserProjectName(project)}
    ).then(result => {
      if(!result) return false;
      const savedProject = result.project || project;
      const record = writeBrowserProject(savedProject, {
        id:result.record && result.record.id,
        name:result.record && result.record.name || browserProjectName(savedProject),
      });
      activeBrowserProjectId = record.id;
      ED.projectName = record.name;
      ED.dirty = false;
      const dirty = $('#lkDirty');
      if(dirty) dirty.classList.remove('show');
      status(tr('Project saved to the selected local folder ✓', 'Progetto salvato nella cartella locale selezionata ✓'));
      if(ED.projectsOpen) refreshProjectsOverlay();
      return true;
    }).catch(err => {
      if(err && err.name === 'AbortError') return false;
      status(tr('Local project save failed: ', 'Salvataggio progetto locale fallito: ') + (err && err.message ? err.message : err));
      return false;
    });
  }

  function exportProject(){
    const progressToken = beginStatusWork('Export LKEP', tr('Serializing project levels', 'Serializzazione livelli progetto'), 'loading');
    flushHudHistory();
    updateStatusWork(progressToken, 10, tr('Data snapshot', 'Snapshot dati'), 'loading');
    const sceneData = STORE.collect(GAME);
    const LV = levelsApi();
    const allLevels = LV && LV.list ? (LV.list({includeHidden:true}) || []) : [];
    const activeId = LV && LV.activeId ? LV.activeId() : ED.trackId;
    updateStatusWork(progressToken, 22, tr('Choosing project levels', 'Scelta livelli progetto'), 'loading');
    Promise.resolve(pickProjectExportLevels(allLevels, activeId)).then(exportLevels => {
      if(exportLevels === null){
        finishStatusWork(progressToken, tr('Export cancelled', 'Export annullato'), tr('No file written', 'Nessun file scritto'), 'warning');
        status('Export cancelled');
        return null;
      }
      updateStatusWork(progressToken, 35, tr('Generating project', 'Generazione progetto'), 'loading');
      const project = createProjectSnapshotWithLevels(sceneData, exportLevels);
      requireExactPersistence(sceneData, project, tr('LKEP snapshot verification', 'Verifica snapshot LKEP'));
      let picked;
      try {
        picked = (!isOnlineDemo() && canPickProjectFile()) ? pickProjectFile(project) : Promise.resolve(null);
      } catch(err) {
        picked = Promise.reject(err);
      }
      updateStatusWork(progressToken, 55, tr('Preparing project assets', 'Preparazione asset progetto'), 'loading');
      return picked.then(handle => ({handle, project}));
    }).then(bundle => {
      if(!bundle) return null;
      const handle = bundle.handle;
      const project = bundle.project;
      if(handle) projectFileHandle = handle;
      return preparePortableProject(project).then(result => {
        const singleFileBytes = projectJsonBlob(result.project).size;
        result.singleFileBytes = singleFileBytes;
        if(singleFileBytes >= 95 * 1024 * 1024){
          result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
          result.warnings.unshift(tr(
            'This single LKEP exceeds GitHub’s safe per-file size. Use Export project folder (GitHub).',
            'Questo LKEP singolo supera la dimensione sicura per file di GitHub. Usa Esporta cartella progetto (GitHub).'
          ));
        }
        return {handle, result};
      });
    }).then(bundle => {
      if(!bundle) return null;
      updateStatusWork(progressToken, 82, bundle.handle ? tr('Writing project file', 'Scrittura file progetto') : tr('Download started', 'Download avviato'), 'loading');
      if(bundle.handle) return writeProjectFile(bundle.handle, bundle.result.project).then(() => bundle.result);
      downloadProject(bundle.result.project);
      return bundle.result;
    }).then(result => {
      if(!result) return;
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
        try {
          const descriptor = JSON.parse(reader.result);
          if(descriptor && descriptor.format === 'LKEP_SPLIT_POINTER'){
            throw new Error(tr(
              'This is a split-project pointer. Use Import project folder and select the adjacent folder containing manifest.json.',
              'Questo è un puntatore a un progetto diviso. Usa Importa cartella progetto e seleziona la cartella adiacente che contiene manifest.json.'
            ));
          }
        } catch(err){
          if(err && /split-project pointer|puntatore a un progetto diviso/i.test(err.message || '')) throw err;
          // Ordinary malformed JSON is reported by the normal LKEP parser.
        }
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

  function projectHistoryBytes(value){
    const bytes=Math.max(0,Number(value)||0);
    if(bytes>=1024*1024*1024)return (bytes/(1024*1024*1024)).toFixed(2)+' GB';
    if(bytes>=1024*1024)return (bytes/(1024*1024)).toFixed(1)+' MB';
    if(bytes>=1024)return (bytes/1024).toFixed(1)+' KB';
    return bytes+' B';
  }

  function downloadLocalProjectVersion(version){
    if(!version||!version.id)return;
    const link=document.createElement('a');
    link.href=LOCAL_HISTORY_URL+'?file='+encodeURIComponent(version.id);
    link.download=version.file||'lotking-project-version.lkep.json';
    document.body.appendChild(link);link.click();link.remove();
  }

  async function restoreLocalProjectVersion(version){
    if(!version||!version.id)return false;
    if(ED.dirty){
      status(tr('Save or discard the current unsaved edits before restoring a version.', 'Salva o annulla le modifiche correnti prima di ripristinare una versione.'));
      return false;
    }
    const label=version.name||version.file||version.id;
    const confirmed=await confirmEditorAction({
      title:tr('Restore this project version?', 'Ripristinare questa versione del progetto?'),
      message:tr(
        'Restore "',
        'Ripristinare "'
      )+label+tr(
        '"? The current LOCAL DISK project will first be preserved as another immutable history version.',
        '"? Il progetto DISCO LOCALE corrente verrà prima conservato come un’ulteriore versione immutabile nella cronologia.'
      ),
      okText:tr('Preserve current and restore', 'Conserva attuale e ripristina'),
      danger:false,
    });
    if(!confirmed)return false;
    setProjectsOverlayOpen(false);
    setLevelLoading(true,label,18,tr('Preserving current project', 'Conservazione progetto corrente'));
    try{
      const response=await fetch(LOCAL_HISTORY_RESTORE_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json','X-LotKing-Project-Authority':'local-disk','X-LotKing-Confirm-Restore':'1'},
        body:JSON.stringify({id:version.id}),
      });
      if(!response.ok)throw new Error('Project history HTTP '+response.status);
      try{
        localStorage.removeItem(LOCAL_BRIDGE_ETAG);
        localStorage.removeItem(LOCAL_BRIDGE_MARKER);
        sessionStorage.removeItem(LOCAL_BRIDGE_MARKER);
      }catch(err){}
      const workspace=window.LK_PROJECT_WORKSPACE;
      if(workspace&&workspace.activateLocalProject)workspace.activateLocalProject();
      reopenEditorAndReload(tr('Project version restored', 'Versione progetto ripristinata'),label);
      return true;
    }catch(err){
      setLevelLoading(false);
      status(tr('Version restore failed: ', 'Ripristino versione non riuscito: ')+(err&&err.message||err));
      setProjectsOverlayOpen(true);
      return false;
    }
  }

  async function refreshLocalProjectHistory(box, requestId){
    if(!localBridgeAvailable()||!box)return;
    const section=el('<div class="lk-project-history"></div>');
    const heading=el('<div class="lk-project-history-head"><b>'+tr('PROJECT HISTORY', 'CRONOLOGIA PROGETTO')+'</b><span>'+tr('append-only disk versions · restore always asks first', 'versioni su disco append-only · il ripristino chiede sempre conferma')+'</span></div>');
    const list=el('<div class="lk-project-history-list"><div class="lk-empty">'+tr('Reading local versions…', 'Lettura versioni locali…')+'</div></div>');
    section.append(heading,list);box.appendChild(section);
    try{
      const response=await fetch(LOCAL_HISTORY_URL,{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const payload=await response.json();
      if(requestId!==projectHistoryRequest||!section.isConnected)return;
      list.innerHTML='';
      const versions=Array.isArray(payload.versions)?payload.versions:[];
      if(!versions.length){
        list.appendChild(el('<div class="lk-empty">'+tr('No previous versions yet. The first confirmed Save will preserve the current project here.', 'Nessuna versione precedente. Il primo Salva confermato conserverà qui il progetto corrente.')+'</div>'));
        return;
      }
      versions.forEach(version=>{
        const row=el('<div class="lk-level-row lk-project-version-row"></div>');
        const meta=el('<div class="lk-level-meta"></div>');
        const name=el('<div class="lk-level-name"></div>');
        name.textContent=version.name||version.file||version.id;
        const badge=el('<span class="lk-level-badge"></span>');
        badge.textContent=version.source==='version'?tr('VERSION','VERSIONE'):(version.source==='recovery'?tr('RECOVERY','RECOVERY'):(version.source==='quarantined'?tr('QUARANTINED','IN QUARANTENA'):tr('LEGACY BACKUP','BACKUP PRECEDENTE')));
        name.appendChild(badge);
        const date=version.savedAt||version.modifiedAt;
        const sub=el('<div class="lk-level-sub"></div>');
        sub.textContent=(date?new Date(date).toLocaleString()+' · ':'')+projectHistoryBytes(version.bytes)+(version.file?' · '+version.file:'');
        meta.append(name,sub);
        const actions=el('<div class="lk-level-actions"></div>');
        const restore=document.createElement('button');restore.className='lk-level-load';restore.textContent=tr('↶ Restore','↶ Ripristina');restore.title=tr('Preserve the current project, then restore this version','Conserva il progetto corrente, poi ripristina questa versione');restore.addEventListener('click',()=>restoreLocalProjectVersion(version));
        const download=document.createElement('button');download.textContent='⇩';download.title=tr('Export this exact version','Esporta questa versione esatta');download.addEventListener('click',()=>downloadLocalProjectVersion(version));
        actions.append(restore,download);row.append(meta,actions);list.appendChild(row);
      });
    }catch(err){
      if(requestId!==projectHistoryRequest||!section.isConnected)return;
      list.innerHTML='';
      list.appendChild(el('<div class="lk-empty">'+tr('Project History is available after restarting the updated local server.', 'La Cronologia progetti sarà disponibile dopo il riavvio del server locale aggiornato.')+'</div>'));
    }
  }

  function refreshProjectsOverlay(){
    const box = $('#lkProjectsList');
    if(!box) return;
    box.innerHTML = '';
    const idx = browserProjectIndex();
    // The Projects card is the user-visible authority. Run the cheap,
    // versioned repair here too so no alternate startup route can render a
    // stale level-derived project name before loadTrackMeta completes.
    migrateLegacyBrowserProjectIdentity(idx);
    const list = Array.isArray(idx.projects) ? idx.projects.map(project => Object.assign({}, project, {active: project.id === idx.activeId})) : [];
    if(!list.length){
      box.appendChild(el('<div class="lk-empty">' + tr('No saved projects.<br>Create a project or press Save to save the current one.', 'Nessun progetto salvato.<br>Crea un progetto o premi Salva per salvare quello corrente.') + '</div>'));
    }
    list.forEach(project => {
      const row = el('<div class="lk-level-row' + (project.active ? ' active' : '') + '"></div>');
      const meta = el('<div class="lk-level-meta"></div>');
      const nm = el('<div class="lk-level-name"></div>');
      nm.textContent = project.name || project.id;
      if(project.active) nm.appendChild(el('<span class="lk-level-badge">' + tr('ACTIVE', 'ATTIVO') + '</span>'));
      if(project.source === LOCAL_BRIDGE_SOURCE) nm.appendChild(el('<span class="lk-level-badge">' + tr('LOCAL DISK', 'DISCO LOCALE') + '</span>'));
      if(project.source === AUTHOR_DEMO_SOURCE) nm.appendChild(el('<span class="lk-level-badge">' + tr('AUTHOR DEMO', 'DEMO AUTORE') + '</span>'));
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
      if(canPublishAuthorDemo()){
        actions.appendChild(mkBtn('★ DEMO', tr('Publish this project as the root Author DEMO', 'Pubblica questo progetto come DEMO autore principale'), () => publishProjectAsDemo(project.id), 'lk-level-export'));
      }
      actions.appendChild(mkBtn('🗑', tr('Delete', 'Elimina'), () => deleteBrowserProject(project.id, project.name), 'lk-level-del'));
      row.append(meta, actions);
      box.appendChild(row);
    });
    const requestId=++projectHistoryRequest;
    refreshLocalProjectHistory(box,requestId);
  }

  async function createBrowserProject(options){
    options = options || {};
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    const next = options.name || await promptEditorAction({title:tr('New project', 'Nuovo progetto'), message:tr('New project name:', 'Nome del nuovo progetto:'), value:'New Project', okText:tr('Create', 'Crea')});
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
    const sceneData = options.empty ? STORE.blank() : (LV && LV.templateScene ? LV.templateScene(GAME, 'open-world-sketchbook') : STORE.blank());
    const meta = {
      projectName:next.trim(),
      projectIdentityVersion:PROJECT_IDENTITY_VERSION,
      projectIdentityExplicit:true,
      trackId:slugifyTrackName(next.trim()),
      trackName:next.trim(),
    };
    const project = createProjectSnapshot(sceneData);
    project.meta = Object.assign({}, project.meta || {}, meta);
    try {
      writeBrowserProject(project, {name:next.trim(), newProject:true, explicitName:true});
      const workspace=window.LK_PROJECT_WORKSPACE;
      if(workspace&&workspace.activateBrowserProject)workspace.activateBrowserProject({demo:false});
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
    const workspace = window.LK_PROJECT_WORKSPACE;
    const record = browserProjectRecord(idx, id);
    let project = readBrowserProject(id);
    if(!record || !project){
      setLevelLoading(false);
      status('Project load failed: project not found');
      return;
    }
    try {
      project = await resolveBrowserProjectPayload(record, project);
      if(record.source === LOCAL_BRIDGE_SOURCE && workspace && typeof workspace.activateLocalProject === 'function')workspace.activateLocalProject();
      else if(workspace&&typeof workspace.activateBrowserProject==='function')workspace.activateBrowserProject({demo:isAuthorDemoBrowserRecord(record)});
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

  async function loadLocalBridgeProject(){
    await restoreLocalBridgeProject();
    const idx = browserProjectIndex();
    const record = (idx.projects || []).find(item => item && item.source === LOCAL_BRIDGE_SOURCE);
    if(!record){
      setProjectsOverlayOpen(true);
      status(tr('No disk-backed local project was found; choose a browser project.', 'Nessun progetto locale su disco trovato; scegli un progetto del browser.'));
      return false;
    }
    await loadBrowserProject(record.id, record.name || 'Local Project');
    return true;
  }

  async function renameBrowserProject(id, currentName){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    const next = await promptEditorAction({title:tr('Rename project', 'Rinomina progetto'), message:tr('New project name:', 'Nuovo nome progetto:'), value:currentName || '', okText:tr('Rename', 'Rinomina')});
    if(!next || !next.trim() || next.trim() === currentName) return;
    try {
      const idx = browserProjectIndex();
      const record = browserProjectRecord(idx, id);
      let project = readBrowserProject(id);
      if(!record || !project) throw new Error('project not found');
      const diskBacked = record.source === LOCAL_BRIDGE_SOURCE;
      project = await resolveBrowserProjectPayload(record, project);
      record.name = next.trim();
      project.meta = Object.assign({}, project.meta || {}, {
        projectName:next.trim(),
        projectIdentityVersion:PROJECT_IDENTITY_VERSION,
        projectIdentityExplicit:true,
        projectIdentitySource:'user-rename',
      });
      await writeBrowserProjectDurable(project, {
        id,
        name:record.name,
        active:record.id === activeBrowserProjectId || record.id === idx.activeId,
        explicitName:true,
      });
      if(diskBacked){
        const bridgeResult = await saveLocalBridgeProject(project,{claimLocalAuthority:true,confirmed:true});
        if(bridgeResult) syncLocalBridgeBrowserProject(bridgeResult.project, bridgeResult.project.savedAt || project.savedAt || 'renamed');
      }
      if(record.id === activeBrowserProjectId || record.id === idx.activeId){
        ED.projectName = record.name;
        setBrowserMarker(record);
      }
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
        removeIndexedBrowserProject(id).catch(err => console.warn('LotKing IndexedDB project cleanup failed', err));
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

  async function exportBrowserProject(id){
    const idx = browserProjectIndex();
    const activeId = String(idx.activeId || activeBrowserProjectId || '');
    const record = browserProjectRecord(idx, id);
    let project = String(id || '') === activeId
      ? createCompleteProjectSnapshot(STORE.collect(GAME))
      : readBrowserProject(id);
    if(!project){
      status('Export failed: project not found');
      return;
    }
    if(String(id || '') !== activeId && record){
      try { project = await resolveBrowserProjectPayload(record, project); }
      catch(err){ status('Export failed: ' + (err && err.message ? err.message : err)); return; }
    }
    preparePortableProject(project).then(result => {
      downloadProject(result.project);
      status('Project exported');
    }).catch(err => status('Export failed: ' + (err && err.message ? err.message : err)));
  }

  async function publishProjectAsDemo(projectId){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return false; }
    if(!canPublishAuthorDemo()){
      status(tr(
        'Publishing the shared Author DEMO is available only from the local author installation. Your browser project remains private.',
        'La pubblicazione del DEMO autore condiviso è disponibile solo dall’installazione locale dell’autore. Il tuo progetto browser resta privato.'
      ));
      return false;
    }
    const idx=browserProjectIndex();
    const activeId=String(idx.activeId||activeBrowserProjectId||'');
    const selectedId=String(projectId||activeId);
    const publishingOpenProject=!selectedId||selectedId===activeId;
    const sceneData=publishingOpenProject?STORE.collect(GAME):null;
    const selectedRecord=browserProjectRecord(idx,selectedId);
    let project=publishingOpenProject?createCompleteProjectSnapshot(sceneData):readBrowserProject(selectedId);
    if(!project){status(tr('DEMO publish failed: project not found','Pubblicazione DEMO fallita: progetto non trovato'));return false;}
    if(!publishingOpenProject&&selectedRecord){
      try{project=await resolveBrowserProjectPayload(selectedRecord,project);}catch(err){status(tr('DEMO publish failed: ','Pubblicazione DEMO fallita: ')+(err&&err.message||err));return false;}
    }
    const meta=project&&project.meta||{};
    const name=meta.trackName||meta.levelName||ED.trackName||'Current project';
    const approved=await confirmEditorAction({
      title:tr('Publish "'+name+'" as Author DEMO?','Pubblicare "'+name+'" come DEMO autore?'),
      message:tr(
        (publishingOpenProject?'The exact open state':'The selected saved project')+' of "'+name+'" becomes the root online DEMO. On localhost the previous demo is backed up automatically; on LAN/hosted browsers an exact demo-project.lkep.json download is generated instead.',
        (publishingOpenProject?'Lo stato aperto esatto':'Il progetto salvato selezionato')+' di "'+name+'" diventa il DEMO online principale. Su localhost il demo precedente viene salvato automaticamente come backup; da LAN/browser ospitati viene invece generato il download esatto demo-project.lkep.json.'
      ),
      okText:tr('Publish DEMO','Pubblica DEMO'),
      danger:false,
    });
    if(!approved)return false;
    const progressToken=beginStatusWork(tr('Publish Author DEMO','Pubblicazione DEMO autore'),tr('Verifying current scene','Verifica scena corrente'),'loading');
    try{
      if(sceneData)requireExactPersistence(sceneData,project,tr('DEMO snapshot verification','Verifica snapshot DEMO'));
      updateStatusWork(progressToken,28,tr('Embedding portable assets','Incorporamento asset portabili'),'loading');
      const result=await preparePortableProject(project);
      result.project.meta=Object.assign({},result.project.meta||{}, {projectName:name,authorDemo:true});
      const payload=JSON.stringify(result.project);
      updateStatusWork(progressToken,72,tr('Writing demo project','Scrittura progetto demo'),'loading');
      let response=null;
      try{response=await fetch(LOCAL_DEMO_PUBLISH_URL,{method:'PUT',headers:{'Content-Type':'application/json','X-LotKing-Confirm-Demo-Publish':'1'},body:payload});}catch(err){}
      if(response&&response.ok){
        const report=await response.json();
        const splitDetail=report.split?' · '+Number(report.chunks||0)+tr(' GitHub-safe parts',' parti compatibili con GitHub'):'';
        const detail=(report.trackName||name)+' · '+Math.round((Number(report.bytes)||payload.length)/1048576)+' MB'+splitDetail;
        finishStatusWork(progressToken,tr('Author DEMO published','DEMO autore pubblicato'),detail,'success');
        status(report.split
          ? tr('DEMO published as a GitHub-safe pointer + folder; previous publication backed up.','DEMO pubblicato come puntatore + cartella compatibili con GitHub; pubblicazione precedente salvata.')
          : tr('DEMO published to demo/demo-project.lkep.json; previous file backed up.','DEMO pubblicato in demo/demo-project.lkep.json; file precedente salvato come backup.'));
        return report;
      }
      if(response&&(response.status===400||response.status===413))throw new Error('Local DEMO publisher HTTP '+response.status);
      downloadProject(result.project,'demo-project.lkep.json');
      finishStatusWork(progressToken,tr('DEMO file downloaded','File DEMO scaricato'),tr('Copy it to demo/demo-project.lkep.json on the publishing host','Copialo in demo/demo-project.lkep.json sul computer di pubblicazione'),'warning');
      status(tr('Downloaded demo-project.lkep.json; replace the repository demo file before upload.','Scaricato demo-project.lkep.json; sostituisci il file demo del repository prima dell’upload.'));
      return {downloaded:true,file:'demo-project.lkep.json'};
    }catch(err){
      finishStatusWork(progressToken,tr('DEMO publish failed','Pubblicazione DEMO fallita'),err&&err.message||String(err),'error');
      status(tr('DEMO publish failed: ','Pubblicazione DEMO fallita: ')+(err&&err.message||err));
      return false;
    }
  }

  async function syncWorkspaceProjectCatalog(options){
    options = options || {};
    const workspace = window.LK_PROJECT_WORKSPACE;
    if(workspaceProjectSyncBusy || !workspace || !workspace.isFolderMode || !workspace.isFolderMode() || !workspace.readWorkspaceProjects) return;
    workspaceProjectSyncBusy = true;
    try {
      const bundle = await workspace.readWorkspaceProjects();
      const entries = bundle && Array.isArray(bundle.projects) ? bundle.projects : [];
      if(!entries.length) return;
      const before = slugifyTrackName(activeBrowserProjectId || (getBrowserMarker() && getBrowserMarker().id) || browserProjectIndex().activeId || '');
      let imported = 0;
      for(const entry of entries){
        if(!entry || !entry.text) continue;
        let project = null;
        try { project = STORE.parseProject ? STORE.parseProject(entry.text) : JSON.parse(entry.text); }
        catch(err){ continue; }
        const record = entry.record || {};
        const name = record.name || importedProjectName({name:record.file || 'workspace-project.lkep.json'}, project);
        await writeBrowserProjectDurable(project, {id:record.id || (project.meta && project.meta.trackId) || name, name, active:false});
        imported += 1;
      }
      const idx = browserProjectIndex();
      const activeId = slugifyTrackName((bundle && bundle.activeId) || (entries[0] && entries[0].record && entries[0].record.id) || idx.activeId || '');
      const activeRecord = browserProjectRecord(idx, activeId);
      if(activeRecord){
        idx.activeId = activeRecord.id;
        writeBrowserProjectIndex(idx);
        setBrowserMarker(activeRecord);
      }
      if(ED.projectsOpen) refreshProjectsOverlay();
      if(imported) status(tr('Workspace projects linked: ', 'Progetti workspace collegati: ') + imported);
      if(options.openActive && activeRecord && before !== slugifyTrackName(activeRecord.id)){
        let project = readBrowserProject(activeRecord.id);
        if(project){
          project = await resolveBrowserProjectPayload(activeRecord, project);
          STORE.importProject(JSON.stringify(project));
          reopenEditorAndReload('Workspace project loaded', activeRecord.name || activeRecord.id);
        }
      }
    } catch(err){
      status(tr('Workspace catalog sync failed: ', 'Sincronizzazione catalogo workspace fallita: ') + (err && err.message ? err.message : err));
    } finally {
      workspaceProjectSyncBusy = false;
    }
  }

  function bindWorkspaceProjectImport(){
    if(bindWorkspaceProjectImport.done) return;
    bindWorkspaceProjectImport.done = true;
    window.addEventListener('lot-king:workspace-project-loaded', event => {
      const detail = event.detail || {};
      if(!detail.text) return;
      const progressToken = beginStatusWork(tr('Workspace import', 'Importazione workspace'), tr('Reading local project', 'Lettura progetto locale'), 'loading');
      Promise.resolve().then(() => importProjectAsBrowserProject(
        {name:detail.name || 'workspace-project.lkep.json'},
        detail.text,
        progressToken
      )).catch(err => {
        finishStatusWork(
          progressToken,
          tr('Workspace import failed', 'Importazione workspace fallita'),
          err && err.message ? err.message : String(err || tr('Unknown error', 'Errore sconosciuto')),
          'error'
        );
      });
    });
    window.addEventListener('lot-king:workspace-state', event => {
      const detail = event.detail || {};
      if(detail.mode === 'folder') setTimeout(() => syncWorkspaceProjectCatalog({openActive:false}), 120);
    });
    window.addEventListener('lot-king:demo-save-request', () => {
      if(isOnlineDemo()) requestOnlineDemoSave();
    });
  }

  const el = deps.el || function(html){
    const t = document.createElement('template');
    t.innerHTML = String(html || '').trim();
    return t.content.firstChild;
  };

  bindWorkspaceProjectImport();
  const workspace = window.LK_PROJECT_WORKSPACE;
  const openingAuthorDemo=!!(workspace&&workspace.shouldOpenAuthorDemoByDefault&&workspace.shouldOpenAuthorDemoByDefault());
  if(openingAuthorDemo&&workspace.activateBrowserProject)workspace.activateBrowserProject({demo:true});
  const openingEmptyWorkspace = workspace && workspace.consumeStartupTemplate && workspace.consumeStartupTemplate('empty') === 'empty';
  if(openingEmptyWorkspace){
    setTimeout(() => createBrowserProject({empty:true, name:'New Project'}), 650);
  } else {
    // The exported Author DEMO is the normal startup authority. LOCAL DISK is
    // still discovered and listed, but it may become active only after the
    // author explicitly loads that Projects card.
    setTimeout(async () => {
      const restored = await restoreLocalBridgeProject();
      if(restored){
        // The editor may already have applied this origin's empty/stale scene
        // while the disk LKEP was being read. One controlled reload makes the
        // restored project the rendered scene; its ETag prevents a reload loop.
        reopenEditorAndReload(tr('Local project restored', 'Progetto locale ripristinato'), activeBrowserProjectName() || 'Local Project');
        return;
      }
      // Startup may refresh the catalog, but opening/switching a project is
      // always an explicit user action from the Projects panel.
      syncWorkspaceProjectCatalog({openActive:false});
    }, 180);
  }

  return Object.freeze({
    slugifyTrackName, setTrackMeta, currentTrackMeta, loadTrackMeta, saveScene, projectFilename, exportProject, exportProjectFolder, importProjectFile, importProjectFolder,
    setProjectImportTarget, setProjectsOverlayOpen, refreshProjectsOverlay, createBrowserProject, loadBrowserProject, loadLocalBridgeProject, renameBrowserProject, deleteBrowserProject, exportBrowserProject,
    createPortableCollaborationSnapshot, applyPortableCollaborationSnapshot,
    publishProjectAsDemo,
  });
}

window.LK_EDITOR_PROJECT_IO = Object.freeze({create});
})();
