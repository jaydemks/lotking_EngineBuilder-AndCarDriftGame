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

  function build(title, api){
    const s = section(title, false);
    if(!api || !api.getTracks){
      s.body.appendChild(el('<div class="lk-empty">Music library unavailable.</div>'));
      return s.root;
    }
    const tools = el('<div class="lk-row"><label>Filter</label><input type="text" placeholder="Track, artist, source"></div>');
    const filterInput = tools.querySelector('input');
    const sort = selectRow('Sort by', 'order', [
      {value:'order', label:'Number'},
      {value:'title', label:'Title'},
      {value:'artist', label:'Artist'},
      {value:'source', label:'Source'},
      {value:'fileName', label:'File name'},
    ], () => render());
    const dir = selectRow('Direction', 'asc', [
      {value:'asc', label:'A to Z'},
      {value:'desc', label:'Z to A'},
    ], () => render());
    const list = el('<div class="lk-music-list"></div>');
    const input = el('<input type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac" multiple style="display:none">');
    const addBtn = el('<button type="button">Import audio...</button>');
    const refreshBtn = el('<button type="button">Refresh list</button>');
    const row = el('<div class="lk-btnrow"></div>');
    row.append(addBtn, refreshBtn, input);
    addBtn.addEventListener('click', () => input.click());
    refreshBtn.addEventListener('click', () => render());
    input.addEventListener('change', e => {
      if(api.addTracks) api.addTracks(e.target.files);
      e.target.value = '';
      render();
      markDirty();
      status('Music library updated');
    });
    filterInput.addEventListener('input', render);

    function render(){
      list.innerHTML = '';
      const rows = api.getTracks({
        filter: filterInput.value,
        sort: sort.input.value,
        dir: dir.input.value,
      });
      if(!rows.length){
        list.appendChild(el('<div class="lk-empty">No tracks found.</div>'));
        return;
      }
      rows.forEach(t => {
        const item = el('<div class="lk-asset-item"></div>');
        const num = t.order == null ? String(t.index + 1).padStart(2, '0') : String(t.order).padStart(2, '0');
        const badge = el('<div class="lk-asset-thumb"></div>');
        badge.textContent = num;
        const meta = el('<div class="lk-asset-meta"></div>');
        const name = el('<div class="lk-asset-name"></div>');
        name.textContent = (t.artist || 'Unknown') + ' - ' + (t.title || 'Untitled');
        const sub = el('<div class="lk-asset-sub"></div>');
        sub.textContent = (t.fileName || t.source || 'Default') + (t.uploaded ? ' · session upload' : '');
        meta.append(name, sub);
        const actions = el('<div class="lk-asset-actions"></div>');
        const play = el('<button type="button">Load</button>');
        play.addEventListener('click', () => {
          if(api.loadTrack) api.loadTrack(t.index, true);
          if(api === (GAME.systems && GAME.systems.menuMusic)) ED.quickMusicIndex = t.index;
          status('Loaded: ' + (t.title || 'track'));
        });
        actions.appendChild(play);
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
