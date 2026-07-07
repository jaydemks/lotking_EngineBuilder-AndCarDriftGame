/* =========================================================
   LOT KING — PLAYABLE EXPORT
   HTML/ZIP export pipeline for editor-created playable builds.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const $ = deps.$ || (sel => document.querySelector(sel));
  const status = deps.status || function(){};
  const beginStatusWork = deps.beginStatusWork || function(){ return null; };
  const updateStatusWork = deps.updateStatusWork || function(){};
  const finishStatusWork = deps.finishStatusWork || function(){};
  const currentTrackMeta = deps.currentTrackMeta || function(){ return {trackId:'track', trackName:'track'}; };
  const slugifyTrackName = deps.slugifyTrackName || function(name){
    return (name || 'track').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'track';
  };
  const assetLibraryLoad = deps.assetLibraryLoad || function(){ return []; };
  const levelsApi = deps.levelsApi || function(){ return null; };
  const playableExportAssets = window.LK_EDITOR_PLAYABLE_EXPORT_ASSETS && window.LK_EDITOR_PLAYABLE_EXPORT_ASSETS.create({
    assetLibraryLoad,
  });
  const playableExportZip = window.LK_EDITOR_PLAYABLE_EXPORT_ZIP && window.LK_EDITOR_PLAYABLE_EXPORT_ZIP.create({
    slugifyTrackName,
    buildPlayableBootstrapHtml,
  });
  const PLAYABLE_ZIP_RUNTIME_TEMPLATE = playableExportZip ? playableExportZip.RUNTIME_TEMPLATE : 'gameplay.html';
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function safeJsonForInlineScript(value){
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }
  async function preparePlayableProject(project){
    if(!playableExportAssets) return {project: JSON.parse(JSON.stringify(project || {})), warnings: []};
    return playableExportAssets.preparePlayableProject(project);
  }
  function normalizePlayableProject(project, fallbackName){
    const src = project || {};
    const meta = src.meta || currentTrackMeta();
    const trackId = src.meta && src.meta.trackId ? src.meta.trackId : slugifyTrackName(fallbackName || meta.trackName || meta.levelName || 'track');
    const trackName = (src.meta && (src.meta.trackName || src.meta.levelName)) || fallbackName || 'track';
    return {
      format: 'LKEP',
      version: src.version || 1,
      game: src.game || 'LOT KING ENGINE EDITOR & Car Drift Game',
      name: src.name || 'LOT KING ENGINE EDITOR Project',
      savedAt: src.savedAt || new Date().toISOString(),
      meta: Object.assign({}, meta, {trackId, trackName}),
      scene: src.scene || src,
    };
  }
  async function buildPlayableProjectZip(bundle, onProgress){
    if(!playableExportZip) throw new Error('Playable ZIP module non disponibile');
    return playableExportZip.buildPlayableProjectZip(bundle, onProgress);
  }
  function getCurrentPlayableProject(){
    const sceneData = STORE.collect(GAME);
    return STORE.exportProject ? STORE.exportProject(sceneData, currentTrackMeta()) : {format:'LKEP', meta:currentTrackMeta(), scene:sceneData};
  }
  const playableLevelPicker = window.LK_EDITOR_PLAYABLE_LEVEL_PICKER && window.LK_EDITOR_PLAYABLE_LEVEL_PICKER.create({
    $,
    status,
    levelsApi,
    getCurrentPlayableProject,
  });
  async function buildPlayableBundle(levelProjects, runtimePath, levelNameHint){
    const projects = Array.isArray(levelProjects) ? levelProjects : (levelProjects ? [levelProjects] : []);
    if(!projects.length) throw new Error(tr('No levels to export', 'Nessun livello da esportare'));
  
    const now = new Date().toISOString();
    const warnings = [];
    const levels = [];
    const usedIds = new Set();
  
    const orderedProjects = projects
      .slice()
      .sort((a, b) => {
        const aOrder = Number.isFinite(Number(a && a.__lkExportLevelOrder))
          ? Number(a && a.__lkExportLevelOrder)
          : Number.MAX_SAFE_INTEGER;
        const bOrder = Number.isFinite(Number(b && b.__lkExportLevelOrder))
          ? Number(b && b.__lkExportLevelOrder)
          : Number.MAX_SAFE_INTEGER;
        const av = Number.isFinite(aOrder) ? aOrder : Number.MAX_SAFE_INTEGER;
        const bv = Number.isFinite(bOrder) ? bOrder : Number.MAX_SAFE_INTEGER;
        if(av !== bv) return av - bv;
        const aLabel = String((a && a.__lkExportLevelName) || (a && a.meta && (a.meta.trackName || a.meta.levelName)) || (a && a.id) || '');
        const bLabel = String((b && b.__lkExportLevelName) || (b && b.meta && (b.meta.trackName || b.meta.levelName)) || (b && b.id) || '');
        if(aLabel !== bLabel) return aLabel.localeCompare(bLabel);
        return 0;
      });
    const orderedSources = orderedProjects.length ? orderedProjects : projects;
    const primaryProject = orderedSources.find(item => item && item.__lkExportLevelPrimary === true) || orderedSources[0] || null;
  
    for(let i = 0; i < orderedSources.length; i += 1){
      const sourceProject = orderedSources[i];
      if(!sourceProject || (!sourceProject.scene && !sourceProject.meta && !sourceProject.version)) continue;
      const sourceOrder = Number.isFinite(Number(sourceProject.__lkExportLevelOrder)) ? Number(sourceProject.__lkExportLevelOrder) : i;
      const exportMeta = {};
      if(sourceProject.__lkExportLevelId && String(sourceProject.__lkExportLevelId).trim()){
        exportMeta.trackId = String(sourceProject.__lkExportLevelId).trim();
      }
      if(sourceProject.__lkExportLevelName && String(sourceProject.__lkExportLevelName).trim()){
        exportMeta.trackName = String(sourceProject.__lkExportLevelName).trim();
      }
      const normalizedSource = Object.assign({}, sourceProject, {
        meta: Object.assign({}, sourceProject.meta || {}, exportMeta),
      });
  
      const normalizedProject = await preparePlayableProject(normalizePlayableProject(
        normalizedSource,
        i === 0 ? (levelNameHint || null) : null
      ));
      const finalProject = normalizedProject.project;
      const meta = finalProject.meta || {};
      let levelId = sourceProject.__lkExportLevelId && String(sourceProject.__lkExportLevelId).trim()
        ? String(sourceProject.__lkExportLevelId).trim()
        : (sourceProject.id ? String(sourceProject.id).trim() : null);
      if(!levelId){
        levelId = meta.trackId || slugifyTrackName((i === 0 ? levelNameHint : null) || meta.trackName || meta.levelName || 'track');
      }
      const baseId = levelId;
      let n = 2;
      while(usedIds.has(levelId)){
        levelId = baseId + '-' + n;
        n += 1;
      }
      usedIds.add(levelId);
      if(Array.isArray(normalizedProject.warnings)) warnings.push(...normalizedProject.warnings);
  
      levels.push({
        id: levelId,
        name: meta.trackName || meta.levelName || baseId || 'track',
        description: 'Playable track export',
        savedAt: finalProject.savedAt || now,
        project: finalProject,
        __lkExportOrder: i,
        __lkExportSourceOrder: sourceOrder,
        __lkExportPrimary: primaryProject && sourceProject === primaryProject,
      });
    }
  
    if(!levels.length) throw new Error(tr('No valid levels to export', 'Nessun livello valido da esportare'));
    const explicitActiveLevel = levels.find(item => item.__lkExportPrimary);
    const activeProject = explicitActiveLevel || levels[0];
  
    return {
      format: 'LKPKG',
      version: 1,
      game: 'LOT KING ENGINE EDITOR & Car Drift Game',
      createdAt: now,
      exportMode: 'playable-track',
      runtime: runtimePath || 'gameplay.html',
      activeId: activeProject ? activeProject.id : (levels[0] ? levels[0].id : null),
      warnings: warnings,
      levels,
    };
  }
  function buildPlayableHtml(bundle){
    return buildPlayableBootstrapHtml(bundle);
  }
  function buildPlayableBootstrapHtml(bundle){
    const payload = safeJsonForInlineScript(bundle);
    const runtime = bundle && bundle.runtime ? bundle.runtime : PLAYABLE_ZIP_RUNTIME_TEMPLATE;
    return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LOT KING ENGINE EDITOR — Playable Track</title>
  </head>
  <body>
  <p>Loading playable LOT KING ENGINE EDITOR level...</p>
  <script>
  (function(){
    'use strict';
    const PACKAGE = ${payload};
    const KEY_SCENE = 'lotking.scene.v1';
    const KEY_LEVELS = 'lotking.levels.v1';
    const KEY_PREFIX = 'lotking.level.';
  
    function safeDate(value){
      return value || new Date().toISOString();
    }
    function isObject(v){ return v && typeof v === 'object'; }
    function nId(value){ return value == null ? '' : String(value); }
    function cleanupOldLevels(levelIds){
      const keep = Object.create(null);
      levelIds.forEach(id => {
        const k = String(id || '').trim();
        if(k) keep[k] = true;
      });
      Object.keys(localStorage).forEach(key => {
        if(key.indexOf(KEY_PREFIX) !== 0) return;
        const id = key.slice(KEY_PREFIX.length);
        if(id && !keep[id]) localStorage.removeItem(key);
      });
    }
  
    function writeProject(key, project){
      localStorage.setItem(key, JSON.stringify(project));
    }
    function writeIndex(levels, activeId){
      writeProject(KEY_LEVELS, {
        activeId: activeId || (levels[0] ? levels[0].id : null),
        levels: levels.map(l => ({
          id: l.id,
          name: l.name || 'track',
          savedAt: safeDate(l.savedAt),
          __lkExportPrimary: !!l.__lkExportPrimary,
          __lkExportOrder: Number.isFinite(Number(l.__lkExportSourceOrder))
            ? Number(l.__lkExportSourceOrder)
            : (Number.isFinite(Number(l.__lkExportOrder)) ? Number(l.__lkExportOrder) : undefined),
        })),
      });
    }
  
      try {
        if(!isObject(PACKAGE) || !Array.isArray(PACKAGE.levels) || !PACKAGE.levels.length){
          throw new Error('package vuoto');
        }
        cleanupOldLevels(PACKAGE.levels.map(level => level && level.id).filter(level => level));
        const index = {
          activeId: PACKAGE.activeId || PACKAGE.levels[0].id,
          levels: [],
        };
        for(const level of PACKAGE.levels){
          if(!isObject(level) || !level.id || !level.project) continue;
          const project = level.project;
          writeProject(KEY_PREFIX + level.id, project);
          index.levels.push({
            id: level.id,
            name: level.name || (project.meta && (project.meta.trackName || project.meta.levelName)) || 'track',
            savedAt: safeDate(level.savedAt || project.savedAt),
            __lkExportPrimary: !!level.__lkExportPrimary,
            __lkExportOrder: Number.isFinite(Number(level.__lkExportSourceOrder))
              ? Number(level.__lkExportSourceOrder)
              : (Number.isFinite(Number(level.__lkExportOrder)) ? Number(level.__lkExportOrder) : undefined),
          });
        }
        if(!index.levels.length) throw new Error('nessun livello nel pacchetto');
        if(index.activeId && !index.levels.some(l => nId(l.id) === nId(index.activeId))){
          index.activeId = index.levels[0].id;
        }
        index.activeId = String(index.activeId || index.levels[0].id || '').trim();
        writeIndex(index.levels, index.activeId);
        writeProject(KEY_SCENE, (function(){
          for(const level of index.levels){
            if(nId(level.id) === nId(index.activeId)){
              const raw = localStorage.getItem(KEY_PREFIX + level.id);
              if(raw) return JSON.parse(raw);
            }
          }
          return JSON.parse(localStorage.getItem(KEY_PREFIX + index.levels[0].id));
        })());
        try { sessionStorage.setItem('lk.autolaunch', String(index.activeId || '')); } catch(err){}
        try { sessionStorage.setItem('lk.playableActive', String(index.activeId || '')); } catch(err){}
        try {
          var _act = index.levels.filter(function(l){ return nId(l.id) === nId(index.activeId); })[0];
          console.log('[LotKing bootstrap] activeId=' + index.activeId + ' → "' + (_act ? _act.name : '?') + '"; livelli: ' + index.levels.map(function(l){ return l.name + '[' + l.id + ']'; }).join(', '));
        } catch(e){}
        location.replace(${JSON.stringify(runtime)});
    } catch(err){
    document.body.textContent = 'Unable to start exported level: ' + err.message;
    throw err;
  }
  })();
  </script>
  </body>
  </html>`;
  }
  function exportPlayableProject(project, projectName){
    const progressToken = beginStatusWork('Export playable HTML', tr('Preparing package', 'Preparazione pacchetto'), 'loading');
    updateStatusWork(progressToken, 12, tr('Building bundle', 'Costruzione bundle'), 'loading');
    Promise.resolve().then(() => buildPlayableBundle(project, 'gameplay.html', projectName)).then(bundle => {
      updateStatusWork(progressToken, 60, tr('Creating HTML document', 'Creazione documento HTML'), 'loading');
      const level = bundle.levels[0];
      const html = buildPlayableHtml(bundle);
      updateStatusWork(progressToken, 80, tr('Starting download', 'Avvio download'), 'loading');
      const blob = new Blob([html], {type: 'text/html'});
      const a = document.createElement('a');
      const warnings = bundle && Array.isArray(bundle.warnings) ? bundle.warnings : [];
      a.href = URL.createObjectURL(blob);
      a.download = 'lot-king-' + slugifyTrackName((level && level.name) || 'track') + '-playable.html';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
      finishStatusWork(progressToken, tr('HTML export ready', 'Export HTML pronto'), tr('File ready for download', 'File pronto per il download'), 'success');
      status('PLAYABLE export created' + (warnings.length ? tr(' with warnings: ', ' con avvisi: ') + warnings.join(' · ') : ' ✓'));
    }).catch(err => {
      console.error('Playable export failed', err);
      finishStatusWork(progressToken, tr('HTML export failed', 'Export HTML fallito'), (err && err.message) ? err.message : tr('Unknown error', 'Errore sconosciuto'), 'error');
      status('⚠ Playable export failed: ' + err.message);
    });
  }
  async function exportCurrentPlayableProjectZip(){
    const progressToken = beginStatusWork('Export playable ZIP', tr('Selecting levels', 'Selezione livelli'), 'loading');
    const LV = levelsApi();
    const list = LV && LV.list ? LV.list() : [];
    const activeId = LV && LV.activeId ? LV.activeId() : null;
    const selectable = Array.isArray(list) ? list : [];
    let projects = null;
    if(selectable.length){
      const selectedLevelProjects = await pickPlayableLevelsForZipExport(selectable, activeId);
      if(selectedLevelProjects === null){
        finishStatusWork(progressToken, tr('ZIP export cancelled', 'Export ZIP annullato'), tr('Operation cancelled', 'Operazione annullata'), 'warning');
        return;
      }
      if(!selectedLevelProjects.length){
        finishStatusWork(progressToken, tr('ZIP export cancelled', 'Export ZIP annullato'), tr('No level selected', 'Nessun livello selezionato'), 'warning');
        return;
      }
      projects = selectedLevelProjects;
    } else {
      projects = [getCurrentPlayableProject()];
    }
  
    if(!projects.length){
      finishStatusWork(progressToken, tr('ZIP export cancelled', 'Export ZIP annullato'), tr('No levels to export', 'Nessun livello da esportare'), 'warning');
      return;
    }
    const bundleHint = projects.length === 1 && projects[0] && projects[0].meta ? (projects[0].meta.trackName || projects[0].meta.levelName) : null;
    try {
      updateStatusWork(progressToken, 18, tr('Building level package', 'Costruzione pacchetto livelli'), 'loading');
      const bundle = await buildPlayableBundle(projects, PLAYABLE_ZIP_RUNTIME_TEMPLATE, bundleHint);
      // diagnostica: cosa finisce DAVVERO nel pacchetto (id/nome/#entità per livello)
      try {
        const diag = (bundle.levels || []).map(l => {
          const sc = l.project && l.project.scene || {};
          const nAdded = Array.isArray(sc.added) ? sc.added.length : 0;
          const nDeleted = Array.isArray(sc.deleted) ? sc.deleted.length : 0;
          return (l.id === bundle.activeId ? '▶ ' : '  ') + l.name + ' [' + l.id + '] · +' + nAdded + tr(' entities, -', ' entita, -') + nDeleted + ' builtin';
        });
        console.log('[LotKing export] activeId=' + bundle.activeId + '\n' + diag.join('\n'));
        status(tr('Export: start ▶ ', 'Export: avvio ▶ ') + (bundle.levels.find(l => l.id === bundle.activeId) || {}).name + ' · ' + bundle.levels.length + tr(' level(s) (details in F12 console)', ' livello/i (dettagli in console F12)'));
      } catch(diagErr){}
      const warnings = await buildPlayableProjectZip(bundle, (pct, step, tone) => {
        if(tone === 'error') return;
        updateStatusWork(progressToken, pct, step, 'loading');
      });
      finishStatusWork(progressToken, tr('ZIP export ready', 'Export ZIP pronto'), tr('Package with ', 'Pacchetto con ') + bundle.levels.length + tr(' level(s) ready', ' livello/i pronto'), 'success');
      status('PLAYABLE ZIP export created (' + bundle.levels.length + tr(' levels)', ' livelli)') + (warnings.length ? tr(' with warnings: ', ' con avvisi: ') + warnings.join(' · ') : ' ✓'));
    } catch(err){
      console.error('Playable ZIP export failed', err);
      finishStatusWork(progressToken, tr('ZIP export failed', 'Export ZIP fallito'), (err && err.message) ? err.message : tr('Unknown error', 'Errore sconosciuto'), 'error');
      status('⚠ Playable ZIP export failed: ' + err.message);
    }
  }
  async function pickPlayableLevelsForZipExport(levels, activeId){
    return playableLevelPicker ? playableLevelPicker.pick(levels, activeId) : null;
  }
  function exportCurrentPlayableProject(){
    const LV = levelsApi();
    const activeId = LV && LV.activeId ? LV.activeId() : null;
    const active = LV && activeId && LV.get ? LV.get(activeId) : null;
    if(active){
      exportPlayableProject(active, active.meta && (active.meta.trackName || active.meta.levelName));
      return;
    }
    const sceneData = STORE.collect(GAME);
    const project = STORE.exportProject ? STORE.exportProject(sceneData, currentTrackMeta()) : {format:'LKEP', meta:currentTrackMeta(), scene:sceneData};
    exportPlayableProject(project, currentTrackMeta().trackName);
  }
  
  return Object.freeze({
    getCurrentPlayableProject,
    buildPlayableBundle,
    buildPlayableHtml,
    exportPlayableProject,
    exportCurrentPlayableProjectZip,
    exportCurrentPlayableProject,
    pickPlayableLevelsForZipExport,
  });
}

window.LK_EDITOR_PLAYABLE_EXPORT = Object.freeze({create});
})();
