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
  const confirmEditorAction = deps.confirmEditorAction;
  const reopenEditorAndReload = deps.reopenEditorAndReload;
  const status = deps.status;
  const applyInputConfig = deps.applyInputConfig || function(){};
  const ACT = window.LK_RUNTIME_INPUT_ACTIONS;

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
    if(STORE.loadProject){
      const project = STORE.loadProject();
      setTrackMeta(project.meta);
    } else {
      setTrackMeta({trackName:'Parking Lot', trackId:'parking-lot'});
    }
  }

  function saveScene(){
    const progressToken = beginStatusWork('Salvataggio livello', 'Verifica stato corrente', 'loading');
    updateStatusWork(progressToken, 10, 'Preparazione dati', 'loading');
    flushHudHistory();
    const input = $('#lkTrackName');
    if(input && input.value.trim()){
      ED.trackName = input.value.trim();
    }
    updateStatusWork(progressToken, 45, 'Scrittura catalogo', 'loading');
    const ok = STORE.save(STORE.collect(GAME), currentTrackMeta());
    if(!ok){
      ED.dirty = true;
      $('#lkDirty').classList.add('show');
      finishStatusWork(progressToken, 'Salvataggio fallito', 'Local storage non disponibile', 'error');
      status('⚠ Save failed: local level library was not updated');
      return false;
    }
    updateStatusWork(progressToken, 85, 'Sincronizzazione UI', 'loading');
    const LV = levelsApi();
    const activeId = LV && LV.activeId ? LV.activeId() : ED.trackId;
    setTrackMeta({trackId: activeId || ED.trackId, trackName: ED.trackName});
    ED.dirty = false;
    $('#lkDirty').classList.remove('show');
    if(LV && LV.syncCatalog) LV.syncCatalog();
    if(ED.levelsOpen) refreshLevelsOverlay();
    refreshAssetsPanel();
    finishStatusWork(progressToken, 'Livello salvato', 'Operazione completata', 'success');
    status('Track saved locally ✓');
    return true;
  }

  function projectFilename(project){
    const stamp = (project.savedAt || new Date().toISOString()).replace(/[:.]/g, '-');
    const meta = project.meta || currentTrackMeta();
    return 'lot-king-' + slugifyTrackName(meta.trackName || meta.levelName || 'track') + '-' + stamp + '.lkep.json';
  }

  function exportProject(){
    const progressToken = beginStatusWork('Export LKEP', 'Serializzazione livello corrente', 'loading');
    flushHudHistory();
    updateStatusWork(progressToken, 10, 'Snapshot dati', 'loading');
    const sceneData = STORE.collect(GAME);
    updateStatusWork(progressToken, 35, 'Generazione progetto', 'loading');
    const project = STORE.exportProject ? STORE.exportProject(sceneData, currentTrackMeta()) : {format:'LKEP', meta:currentTrackMeta(), scene:sceneData};
    updateStatusWork(progressToken, 80, 'Download avviato', 'loading');
    const blob = new Blob([JSON.stringify(project, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = projectFilename(project);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    finishStatusWork(progressToken, 'LKEP esportato', project.meta && (project.meta.trackName || project.meta.levelName) ? 'Percorso: ' + project.meta.trackName : 'Operazione completata', 'success');
    status('LKEP exported');
  }

  function importProjectFile(file){
    $('#lkProjectInput').value = '';
    if(!file) return;
    const progressToken = beginStatusWork('Importazione LKEP', 'Lettura file in corso', 'loading');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const LV = levelsApi();
        if(LV){
          updateStatusWork(progressToken, 42, 'Inserimento in libreria livelli', 'loading');
          const id = LV.importProjectAsLevel(reader.result, file.name.replace(/\.lkep(\.json)?$|\.json$/i, ''));
          if(!id) throw new Error('salvataggio locale fallito (quota?)');
          updateStatusWork(progressToken, 68, 'Apertura livello', 'loading');
          const openImported = () => {
            LV.setActive(id);
            reopenEditorAndReload('Importato');
          };
          if(ED.dirty){
            confirmEditorAction({
              title:'Open imported level?',
              message:'Il livello corrente ha modifiche non salvate che andranno perse. Aprire il livello importato?',
              okText:'Open level',
              danger:false,
            }).then(ok => {
              if(ok){
                finishStatusWork(progressToken, 'Importazione completata', 'Caricamento livello importato', 'success');
                openImported();
              }
              else {
                refreshLevelsOverlay();
                refreshAssetsPanel();
                finishStatusWork(progressToken, 'Importazione completata', 'Il livello è ora in libreria', 'success');
                status('Livello importato nella libreria ✓');
              }
            });
            return;
          }
          updateStatusWork(progressToken, 86, 'Ricaricamento editor', 'loading');
          openImported();
          return;
        }
        updateStatusWork(progressToken, 75, 'Applicazione progetto locale', 'loading');
        const project = STORE.importProject(reader.result);
        setTrackMeta(project.meta);
        ED.dirty = false;
        $('#lkDirty').classList.remove('show');
        finishStatusWork(progressToken, 'Importazione completata', 'Ricaricamento in corso', 'success');
        status('Imported ' + (project.meta && project.meta.trackName ? project.meta.trackName : 'LKEP') + ' · reloading...');
        setTimeout(() => location.reload(), 450);
      } catch(err){
        finishStatusWork(progressToken, 'Importazione fallita', (err && err.message) ? err.message : 'Errore', 'error');
        status('Import failed: ' + err.message);
      }
    };
    reader.onerror = () => {
      finishStatusWork(progressToken, 'Importazione fallita', 'File non leggibile', 'error');
      status('Import failed: file not readable');
    };
    reader.readAsText(file);
  }

  return Object.freeze({slugifyTrackName, setTrackMeta, currentTrackMeta, loadTrackMeta, saveScene, projectFilename, exportProject, importProjectFile});
}

window.LK_EDITOR_PROJECT_IO = Object.freeze({create});
})();
