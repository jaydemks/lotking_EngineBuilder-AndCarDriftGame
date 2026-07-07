/* =========================================================
   LOT KING — EDITOR LEVEL MANAGER
   Multi-level library actions and levels overlay rendering.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED || {};
  const $ = deps.$ || (sel => document.querySelector(sel));
  const status = deps.status || function(){};
  const promptEditorAction = deps.promptEditorAction || function(){ return Promise.resolve(null); };
  const confirmEditorAction = deps.confirmEditorAction || function(){ return Promise.resolve(false); };
  const beginStatusWork = deps.beginStatusWork || function(){ return null; };
  const updateStatusWork = deps.updateStatusWork || function(){};
  const finishStatusWork = deps.finishStatusWork || function(){};
  const setLevelLoading = deps.setLevelLoading || function(){};
  const flushHudHistory = deps.flushHudHistory || function(){};
  const setTrackMeta = deps.setTrackMeta || function(){};
  const refreshAssetsPanel = deps.refreshAssetsPanel || function(){};
  const projectFilename = deps.projectFilename || function(){ return 'lot-king-level.lkep.json'; };
  const el = deps.el || function(html){
    const t = document.createElement('template');
    t.innerHTML = String(html || '').trim();
    return t.content.firstChild;
  };
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function levelsApi(){ return STORE.levels || null; }
  function reopenEditorAndReload(msg, levelName){
    try { sessionStorage.setItem('lk.reopenEditor', '1'); } catch(err){}
    const title = levelName || msg || 'Level';
    setLevelLoading(true, title, 28, 'Preparing editor viewport');
    status((msg || 'Level') + ' · loading...');
    setTimeout(() => setLevelLoading(true, title, 62, 'Applying saved LKEP data'), 90);
    setTimeout(() => setLevelLoading(true, title, 92, 'Reloading editor scene'), 210);
    setTimeout(() => location.reload(), 420);
  }
  async function saveAsTrack(){
    const LV = levelsApi();
    if(!LV){ status(tr('⚠ Level library unavailable', '⚠ Libreria livelli non disponibile')); return; }
    const next = await promptEditorAction({title:tr('Save level as', 'Salva livello come'), message:tr('Save level with name:', 'Salva livello con nome:'), value:(ED.trackName || 'Parking Lot') + ' Copy', okText:tr('Save', 'Salva')});
    if(!next || !next.trim()) return;
    const progressToken = beginStatusWork('Save As', tr('Collecting current state', 'Raccolta stato corrente'), 'loading');
    flushHudHistory();
    updateStatusWork(progressToken, 32, tr('Writing level to library', 'Scrittura livello nella libreria'), 'loading');
    const id = LV.create(next.trim(), STORE.collect(GAME));
    if(!id){
      finishStatusWork(progressToken, tr('Save As failed', 'Save As fallito'), tr('Insufficient localStorage quota', 'Quota localStorage insufficiente'), 'error');
      status(tr('⚠ Save As failed (localStorage quota?)', '⚠ Save As fallito (quota localStorage?)'));
      return;
    }
    updateStatusWork(progressToken, 72, tr('Activating new level', 'Attivazione nuovo livello'), 'loading');
    LV.setActive(id);
    setTrackMeta({trackName: next.trim(), trackId: id});
    ED.dirty = false;
    const dirty = $('#lkDirty');
    if(dirty) dirty.classList.remove('show');
    updateStatusWork(progressToken, 96, tr('Updating UI', 'Aggiornamento UI'), 'loading');
    finishStatusWork(progressToken, tr('Save As complete', 'Save As completato'), tr('New level saved', 'Nuovo livello salvato'), 'success');
    status(tr('Saved as "', 'Salvato come "') + next.trim() + '" ✓');
    refreshAssetsPanel();
  }
  async function newTrack(){
    const LV = levelsApi();
    if(!LV){ status(tr('⚠ Level library unavailable', '⚠ Libreria livelli non disponibile')); return; }
    const next = await promptEditorAction({title:tr('New level', 'Nuovo livello'), message:tr('New level name:', 'Nome del nuovo livello:'), value:'New Level', okText:tr('Create', 'Crea')});
    if(!next || !next.trim()) return;
    if(ED.dirty){
      const ok = await confirmEditorAction({
        title:'Create new level?',
        message:tr('The current level has unsaved changes that will be lost. Continue?', 'Il livello corrente ha modifiche non salvate che andranno perse. Continuare?'),
        okText:'Continue',
        danger:false,
      });
      if(!ok) return;
    }
    const id = LV.create(next.trim(), LV.templateScene(GAME));
    if(!id){ status(tr('⚠ Level creation failed', '⚠ Creazione livello fallita')); return; }
    LV.setActive(id);
    reopenEditorAndReload(tr('New level created', 'Nuovo livello creato'), next.trim());
  }
  async function loadLevel(id, name){
    const LV = levelsApi();
    if(!LV) return;
    if(id === LV.activeId()){ setLevelsOverlayOpen(false); status('"' + (name || id) + tr('" is already the active level', '" e gia il livello attivo')); return; }
    if(ED.dirty){
      const ok = await confirmEditorAction({
        title:'Load level?',
        message:tr('The current level has unsaved changes that will be lost. Load "', 'Il livello corrente ha modifiche non salvate che andranno perse. Caricare "') + (name || id) + '"?',
        okText:'Load',
        danger:false,
      });
      if(!ok) return;
    }
    setLevelsOverlayOpen(false);
    setLevelLoading(true, name || id, 12, 'Opening level package');
    if(!LV.setActive(id)){
      setLevelLoading(false);
      status(tr('⚠ Level load failed', '⚠ Caricamento livello fallito'));
      return;
    }
    reopenEditorAndReload(tr('Loading "', 'Carico "') + (name || id) + '"', name || id);
  }
  async function renameLevel(id, currentName){
    const LV = levelsApi();
    if(!LV) return;
    const next = await promptEditorAction({title:tr('Rename level', 'Rinomina livello'), message:tr('New level name:', 'Nuovo nome livello:'), value:currentName || '', okText:tr('Rename', 'Rinomina')});
    if(!next || !next.trim() || next.trim() === currentName) return;
    if(!LV.rename(id, next.trim())){ status(tr('⚠ Rename failed', '⚠ Rinomina fallita')); return; }
    if(id === LV.activeId()) setTrackMeta({trackName: next.trim(), trackId: id});
    refreshLevelsOverlay();
    refreshAssetsPanel();
    status(tr('Level renamed to "', 'Livello rinominato in "') + next.trim() + '"');
  }
  function duplicateLevel(id, currentName){
    const LV = levelsApi();
    if(!LV) return;
    const newId = LV.duplicate(id);
    if(!newId){ status(tr('⚠ Duplicate failed', '⚠ Duplicazione fallita')); return; }
    refreshLevelsOverlay();
    refreshAssetsPanel();
    status('"' + (currentName || id) + tr('" duplicated ✓', '" duplicato ✓'));
  }
  function deleteLevel(id, currentName){
    const LV = levelsApi();
    if(!LV) return;
    const isActive = id === LV.activeId();
    confirmEditorAction({
      title: 'Delete level?',
      message: 'Delete "' + (currentName || id) + '" permanently?' + (isActive ? ' It is the active level, so the editor will reload the next available level.' : ''),
      okText: 'Delete level',
    }).then(ok => {
      if(!ok) return;
      if(!LV.remove(id)){ status(tr('⚠ Delete failed', '⚠ Eliminazione fallita')); return; }
      if(isActive){ reopenEditorAndReload(tr('Level deleted', 'Livello eliminato'), 'Next available level'); return; }
      refreshLevelsOverlay();
      refreshAssetsPanel();
      status(tr('Level deleted', 'Livello eliminato'));
    });
  }
  function exportLevel(id){
    const LV = levelsApi();
    const project = LV && LV.get(id);
    if(!project){ status(tr('⚠ Level not readable', '⚠ Livello non leggibile')); return; }
    const blob = new Blob([JSON.stringify(project, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = projectFilename(project);
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    status(tr('LKEP exported', 'LKEP esportato'));
  }
  function setLevelsOverlayOpen(open){
    ED.levelsOpen = !!open;
    const overlay = $('#lkLevelsOverlay');
    if(overlay) overlay.classList.toggle('open', ED.levelsOpen);
    if(ED.levelsOpen){
      const LV = levelsApi();
      if(LV && LV.syncCatalog) LV.syncCatalog();
      refreshLevelsOverlay();
    }
  }
  function refreshLevelsOverlay(){
    const box = $('#lkLevelsList');
    if(!box) return;
    box.innerHTML = '';
    const LV = levelsApi();
    const list = LV ? LV.list() : [];
    if(!list.length){
      box.appendChild(el('<div class="lk-empty">' + tr('No saved levels.<br>Save the current level or create a new one.', 'Nessun livello salvato.<br>Salva il livello corrente o creane uno nuovo.') + '</div>'));
      return;
    }
    for(const l of list){
      const row = el('<div class="lk-level-row' + (l.active ? ' active' : '') + '"></div>');
      const meta = el('<div class="lk-level-meta"></div>');
      const nm = el('<div class="lk-level-name"></div>');
      nm.textContent = l.name;
      if(l.active) nm.appendChild(el('<span class="lk-level-badge">' + tr('ACTIVE', 'ATTIVO') + '</span>'));
      const sub = el('<div class="lk-level-sub"></div>');
      sub.textContent = l.id + (l.savedAt ? tr(' · saved ', ' · salvato ') + new Date(l.savedAt).toLocaleString() : '');
      meta.append(nm, sub);
      const actions = el('<div class="lk-level-actions"></div>');
      const mkBtn = (label, title, fn, cls) => {
        const b = document.createElement('button');
        b.textContent = label; b.title = title;
        if(cls) b.className = cls;
        b.addEventListener('click', fn);
        return b;
      };
      if(!l.active) actions.appendChild(mkBtn(tr('▶ Load', '▶ Carica'), tr('Open this level in the editor', "Apri questo livello nell'editor"), () => loadLevel(l.id, l.name), 'lk-level-load'));
      actions.appendChild(mkBtn('✎', tr('Rename', 'Rinomina'), () => renameLevel(l.id, l.name)));
      actions.appendChild(mkBtn('⧉', tr('Duplicate', 'Duplica'), () => duplicateLevel(l.id, l.name)));
      actions.appendChild(mkBtn('⇩', tr('Export LKEP', 'Esporta LKEP'), () => exportLevel(l.id)));
      actions.appendChild(mkBtn('🗑', tr('Delete', 'Elimina'), () => deleteLevel(l.id, l.name), 'lk-level-del'));
      row.append(meta, actions);
      box.appendChild(row);
    }
  }

  return Object.freeze({
    levelsApi,
    reopenEditorAndReload,
    saveAsTrack,
    newTrack,
    loadLevel,
    renameLevel,
    duplicateLevel,
    deleteLevel,
    exportLevel,
    setLevelsOverlayOpen,
    refreshLevelsOverlay,
  });
}

window.LK_EDITOR_LEVEL_MANAGER = Object.freeze({create});
})();
