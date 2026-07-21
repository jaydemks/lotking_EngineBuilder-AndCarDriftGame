/* =========================================================
   LOT KING — EDITOR MUSIC LIBRARY PANEL
   Inspector section for game radio and menu music tracks.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const ED = deps.ED;
  const GAME = deps.GAME;
  const markDirty = deps.markDirty;
  const status = deps.status;
  const section = deps.section;
  const selectRow = deps.selectRow;
  const el = deps.el;
  const confirmEditorAction = deps.confirmEditorAction || (opts => Promise.resolve(confirm((opts && opts.message) || 'Confirm?')));
  const promptEditorAction = deps.promptEditorAction || (opts => Promise.resolve(prompt((opts && opts.message) || 'Value:', (opts && opts.value) || '')));
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function build(title, api){
    const s = section(title, false);
    if(!api || !api.getTracks){
      s.body.appendChild(el('<div class="lk-empty">' + tr('Music library unavailable.', 'Libreria musicale non disponibile.') + '</div>'));
      return s.root;
    }
    const tools = el('<div class="lk-row"><label>' + tr('Filter', 'Filtro') + '</label><input type="text" placeholder="' + tr('Track, artist, source', 'Brano, artista, sorgente') + '"></div>');
    const filterInput = tools.querySelector('input');
    const sort = selectRow(tr('Sort by', 'Ordina per'), 'order', [
      {value:'order', label:tr('Manual order', 'Ordine manuale')},
      {value:'title', label:tr('Title', 'Titolo')},
      {value:'artist', label:tr('Artist', 'Artista')},
      {value:'source', label:tr('Source', 'Sorgente')},
      {value:'fileName', label:tr('File name', 'Nome file')},
    ], () => render());
    const dir = selectRow(tr('Direction', 'Direzione'), 'asc', [
      {value:'asc', label:tr('A to Z', 'Dalla A alla Z')},
      {value:'desc', label:tr('Z to A', 'Dalla Z alla A')},
    ], () => render());
    const list = el('<div class="lk-music-list"></div>');
    const input = el('<input type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac" multiple style="display:none">');
    const addBtn = el('<button type="button">' + tr('Import audio...', 'Importa audio...') + '</button>');
    const refreshBtn = el('<button type="button">' + tr('Refresh list', 'Aggiorna elenco') + '</button>');
    const row = el('<div class="lk-btnrow"></div>');
    row.append(addBtn, refreshBtn, input);
    addBtn.addEventListener('click', () => input.click());
    refreshBtn.addEventListener('click', () => render());
    input.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if(!files.length || !api.addTracks) return;
      addBtn.disabled = true;
      status(tr('Importing audio...', 'Importazione audio...'));
      try {
        const added = await api.addTracks(files);
        render();
        if(added && added.length){
          markDirty();
          status(tr('Music library updated and ready to save', 'Libreria musicale aggiornata e pronta da salvare'));
        } else status(tr('No compatible audio files selected', 'Nessun file audio compatibile selezionato'));
      } catch(err){
        status(tr('Audio import failed: ', 'Importazione audio fallita: ') + (err && err.message ? err.message : err));
      } finally {
        addBtn.disabled = false;
      }
    });
    filterInput.addEventListener('input', render);

    function render(){
      list.innerHTML = '';
      const rows = api.getTracks({
        filter: filterInput.value,
        sort: sort.input.value,
        dir: dir.input.value,
      });
      const totalTracks = api.getTracks({sort:'order', dir:'asc'}).length;
      if(!rows.length){
        list.appendChild(el('<div class="lk-empty">' + tr('No tracks found.', 'Nessun brano trovato.') + '</div>'));
        return;
      }
      async function removeTrack(t){
        if(!api.removeTrack) return;
        const label = (t.artist || 'Unknown') + ' - ' + (t.title || 'Untitled');
        const ok = await confirmEditorAction({
          title:tr('Remove music track?', 'Rimuovere il brano?'),
          message:tr('Remove "', 'Rimuovere "') + label + tr('" from this project library?', '" dalla libreria del progetto?'),
          okText:tr('Remove track', 'Rimuovi brano'),
          danger:true,
        });
        if(!ok) return;
        const removed = api.removeTrack(t.index);
        if(removed){
          if(api === (GAME.systems && GAME.systems.menuMusic) && ED.quickMusicIndex != null) ED.quickMusicIndex = Math.max(0, ED.quickMusicIndex - (t.index <= ED.quickMusicIndex ? 1 : 0));
          markDirty();
          status(tr('Removed: ', 'Rimosso: ') + (removed.title || tr('track', 'brano')));
          render();
        } else {
          status(tr('Track remove failed', 'Rimozione brano fallita'));
        }
      }
      rows.forEach(t => {
        const item = el('<div class="lk-asset-item"></div>');
        const badge = el('<div class="lk-asset-thumb"></div>');
        badge.textContent = '♪';
        const meta = el('<div class="lk-asset-meta"></div>');
        const name = el('<div class="lk-asset-name"></div>');
        name.textContent = (t.artist || 'Unknown') + ' - ' + (t.title || 'Untitled');
        const sub = el('<div class="lk-asset-sub"></div>');
        sub.textContent = (t.fileName || t.source || 'Default') + (t.persisted ? ' · project asset' : (t.uploaded ? ' · unsaved upload' : ''));
        meta.append(name, sub);
        const actions = el('<div class="lk-asset-actions"></div>');
        const play = el('<button type="button">' + tr('Load', 'Carica') + '</button>');
        play.addEventListener('click', () => {
          if(api.loadTrack) api.loadTrack(t.index, true);
          if(api === (GAME.systems && GAME.systems.menuMusic)) ED.quickMusicIndex = t.index;
          status(tr('Loaded: ', 'Caricato: ') + (t.title || tr('track', 'brano')));
        });
        actions.appendChild(play);
        if(api.moveTrack){
          const up = el('<button type="button" title="' + tr('Move earlier', 'Sposta prima') + '">↑</button>');
          const down = el('<button type="button" title="' + tr('Move later', 'Sposta dopo') + '">↓</button>');
          up.disabled = t.index <= 0;
          down.disabled = t.index >= totalTracks - 1;
          const move = direction => {
            const moved = api.moveTrack(t.index, direction);
            if(!moved) return;
            if(api === (GAME.systems && GAME.systems.menuMusic) && ED.quickMusicIndex != null){
              if(ED.quickMusicIndex === moved.fromIndex) ED.quickMusicIndex = moved.index;
              else if(ED.quickMusicIndex === moved.index) ED.quickMusicIndex = moved.fromIndex;
            }
            markDirty(); sort.input.value='order'; dir.input.value='asc'; render();
          };
          up.addEventListener('click', () => move(-1));
          down.addEventListener('click', () => move(1));
          actions.append(up, down);
        }
        if(api.renameTrack){
          const rename = el('<button type="button">' + tr('Rename', 'Rinomina') + '</button>');
          rename.addEventListener('click', async () => {
            const next = await promptEditorAction({title:tr('Rename track', 'Rinomina brano'), message:tr('Displayed track title:', 'Titolo visualizzato del brano:'), value:t.title || '', okText:tr('Rename', 'Rinomina')});
            if(next == null || !String(next).trim()) return;
            if(api.renameTrack(t.index, String(next).trim())){ markDirty(); status(tr('Track renamed', 'Brano rinominato')); render(); }
          });
          actions.appendChild(rename);
        }
        if(api.removeTrack){
          const remove = el('<button type="button" class="lk-danger">' + tr('Remove', 'Rimuovi') + '</button>');
          remove.title = tr('Remove track from this project library', 'Rimuovi il brano dalla libreria del progetto');
          remove.addEventListener('click', () => removeTrack(t));
          actions.appendChild(remove);
          item.addEventListener('contextmenu', e => {
            e.preventDefault();
            removeTrack(t);
          });
        }
        item.append(badge, meta, actions);
        list.appendChild(item);
      });
    }

    s.body.append(tools, sort.root, dir.root, row, list);
    render();
    return s.root;
  }

  return Object.freeze({build});
}

window.LK_EDITOR_MUSIC_LIBRARY_PANEL = Object.freeze({create});
})();
