/* =========================================================
   LOT KING - PLAYABLE EXPORT LEVEL PICKER
   Modal UI for choosing ZIP playable export levels and start level.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const $ = deps.$ || (sel => document.querySelector(sel));
  const status = deps.status || function(){};
  const levelsApi = deps.levelsApi || function(){ return null; };
  const getCurrentPlayableProject = deps.getCurrentPlayableProject || function(){ return null; };
  const tr = (en, it) => window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en;

  async function pick(levels, activeId){
    const overlay = document.getElementById('lkConfirmOverlay') || $('#lkConfirmOverlay');
    const title = document.getElementById('lkConfirmTitle') || $('#lkConfirmTitle');
    const message = document.getElementById('lkConfirmMessage') || $('#lkConfirmMessage');
    const ok = document.getElementById('lkConfirmOk') || $('#lkConfirmOk');
    const cancel = document.getElementById('lkConfirmCancel') || $('#lkConfirmCancel');
    if(!overlay || !title || !message || !ok || !cancel) return null;
    if(overlay.parentNode !== document.body) document.body.appendChild(overlay);

    const list = Array.isArray(levels) ? levels.slice() : [];
    if(!list.length) return null;

    const activeKey = activeId != null ? String(activeId) : '';
    const nameOf = level => level.name || (level.meta && (level.meta.trackName || level.meta.levelName)) || level.id || tr('Level', 'Livello');

    const activeEntry = list.find(l => String(l.id) === activeKey) || (list.some(l => l.active) ? list.find(l => l.active) : list[0]);
    const primaryDefault = activeEntry && activeEntry.id ? String(activeEntry.id) : (list[0] && list[0].id ? String(list[0].id) : '');
    const selected = new Set();
    if(primaryDefault) selected.add(primaryDefault);
    let primaryId = primaryDefault;

    function readStoredLevelProject(levelId){
      try {
        const raw = localStorage.getItem('lotking.level.' + String(levelId || '').trim());
        return raw ? JSON.parse(raw) : null;
      } catch(err){
        return null;
      }
    }

    const oldInput = overlay.querySelector('.lk-confirm-input');
    if(oldInput) oldInput.remove();
    const oldPicker = overlay.querySelector('.lk-playable-level-picker');
    if(oldPicker) oldPicker.remove();

    title.textContent = tr('Export playable levels (ZIP)', 'Export livelli giocabili (ZIP)');
    ok.textContent = tr('⇩ Export ZIP', '⇩ Esporta ZIP');
    ok.classList.toggle('danger', false);
    message.textContent = '';

    const picker = document.createElement('div');
    picker.className = 'lk-playable-level-picker';

    const controls = document.createElement('div');
    controls.className = 'lk-playable-level-picker-controls';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'lk-playable-level-picker-toggle';
    toggle.textContent = tr('Select all', 'Seleziona tutto');

    const selectCount = document.createElement('div');
    selectCount.className = 'lk-playable-level-picker-count';

    const buildRows = [];
    const rows = [];

    const updateCounters = () => {
      for(const r of buildRows) r.cb.checked = selected.has(String(r.id));
      const totalChecked = rows.filter(r => r.checked).length;
      const allChecked = totalChecked === rows.length;
      toggle.textContent = allChecked ? tr('Deselect all', 'Deseleziona tutto') : tr('Select all', 'Seleziona tutto');
      selectCount.textContent = totalChecked + ' / ' + rows.length + tr(' levels · start: ', ' livelli · avvio: ') +
        (primaryId ? (nameOf(list.find(l => String(l.id) === primaryId) || {})) : '-');
      for(const r of buildRows){
        const on = r.cb.checked;
        r.radio.disabled = !on;
        r.row.classList.toggle('off', !on);
        r.row.classList.toggle('primary', on && String(r.id) === primaryId);
      }
    };
    const ensurePrimaryValid = () => {
      const checked = buildRows.filter(r => selected.has(String(r.id))).map(r => String(r.id));
      if(!checked.length){ primaryId = ''; return; }
      if(!checked.includes(primaryId)) primaryId = checked[0];
      for(const r of buildRows) r.radio.checked = String(r.id) === primaryId;
    };

    const rowsWrapper = document.createElement('div');
    rowsWrapper.className = 'lk-playable-level-picker-rows';
    for(const level of list){
      const id = level.id || '';
      const row = document.createElement('div');
      row.className = 'lk-playable-level-picker-row';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'lk-playable-level-picker-check';
      cb.value = id;
      cb.checked = !!(id && selected.has(String(id)));
      cb.title = tr('Include this level in the package', 'Includi questo livello nel pacchetto');

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'lk-export-primary';
      radio.className = 'lk-playable-level-picker-radio';
      radio.value = id;
      radio.checked = String(id) === primaryId;
      radio.title = tr('Startup level (starts first when you open the package)', 'Livello di avvio (parte per primo quando apri il pacchetto)');

      const label = document.createElement('span');
      label.className = 'lk-playable-level-picker-label';
      label.textContent = nameOf(level);
      if(level.active){
        const badge = document.createElement('span');
        badge.className = 'lk-playable-level-picker-badge';
        badge.textContent = tr('ACTIVE', 'ATTIVO');
        label.appendChild(badge);
      }

      cb.addEventListener('change', e => {
        if(cb.checked) selected.add(String(id));
        else selected.delete(String(id));
        ensurePrimaryValid();
        updateCounters();
      });
      radio.addEventListener('change', () => {
        if(!cb.checked) cb.checked = true;
        selected.add(String(id));
        primaryId = String(id);
        ensurePrimaryValid();
        updateCounters();
      });

      buildRows.push({cb, radio, row, id});
      rows.push(cb);
      row.appendChild(cb);
      row.appendChild(radio);
      row.appendChild(label);
      rowsWrapper.appendChild(row);
    }

    toggle.addEventListener('click', () => {
      const allChecked = rows.every(cb => cb.checked);
      selected.clear();
      rows.forEach(cb => {
        cb.checked = !allChecked;
        if(cb.checked) selected.add(String(cb.value));
      });
      ensurePrimaryValid();
      updateCounters();
    });

    const hint = document.createElement('div');
    hint.className = 'lk-playable-level-picker-hint';
    hint.textContent = tr('Check every level to include in the package. The ▶ dot marks which one starts first when you open the exported build.', 'Spunta tutti i livelli da mettere nel pacchetto. Il pallino ▶ indica quale parte per primo quando apri la build esportata.');

    controls.appendChild(toggle);
    controls.appendChild(selectCount);
    picker.appendChild(controls);
    picker.appendChild(rowsWrapper);
    picker.appendChild(hint);
    message.appendChild(picker);
    ensurePrimaryValid();
    updateCounters();

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
        ensurePrimaryValid();
        const checkedIds = Array.from(selected).map(id => String(id).trim()).filter(Boolean);
        if(!checkedIds.length){
          status(tr('⚠ Select at least one level', '⚠ Seleziona almeno un livello'));
          return;
        }
        const orderedIds = [primaryId].concat(checkedIds.filter(id => id !== primaryId))
          .filter((id, i, arr) => id && arr.indexOf(id) === i);
        const LV = levelsApi();
        const activeLevelId = LV && LV.activeId ? String(LV.activeId() || '') : '';
        const picked = [];
        let order = 0;
        for(const levelId of orderedIds){
          const listEntry = list.find(item => String(item.id) === levelId);
          const isActiveLive = activeLevelId && String(levelId) === activeLevelId;
          let project = isActiveLive ? getCurrentPlayableProject() : (LV && LV.get ? LV.get(levelId) : null);
          if(!project && LV && LV.get) project = LV.get(levelId);
          if(!project) project = readStoredLevelProject(levelId);
          if(!project){
            status(tr('⚠ Level not found: ', '⚠ Livello non trovato: ') + levelId);
            continue;
          }
          if(project.scene || project.meta || project.version){
            const selectedName = listEntry
              ? (listEntry.name || (listEntry.meta && (listEntry.meta.trackName || listEntry.meta.levelName)) || levelId)
              : (project.meta && (project.meta.trackName || project.meta.levelName) || levelId);
            picked.push(Object.assign({}, project, {
              __lkExportLevelId: levelId,
              __lkExportLevelName: selectedName,
              __lkExportLevelOrder: order,
              __lkExportLevelPrimary: order === 0,
            }));
            order += 1;
          }
        }
        close(picked.length ? picked : null);
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

  return Object.freeze({pick});
}

window.LK_EDITOR_PLAYABLE_LEVEL_PICKER = Object.freeze({create});
})();
