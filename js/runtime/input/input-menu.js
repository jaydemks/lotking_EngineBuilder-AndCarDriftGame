/* =========================================================
   LOT KING — IN-GAME CONTROLS MENU
   Binds the "Controlli" tab of the pause/settings overlay: connected
   devices, per-player device-instance assignment, touch toggle and a
   "Mapping" button that opens the visual mapper. All bounded by the
   project's allowed devices. Talks only to the input manager.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const manager = deps.manager;
  const body = deps.body || document.getElementById('lkControlsBody');
  const openMapping = deps.openMapping || function(){};
  const ACT = window.LK_RUNTIME_INPUT_ACTIONS;
  if(!manager || !body || !ACT) return null;
  const L = deps.lang || 'it';
  const t = (en, it) => (L === 'it' ? it : en);

  function el(tag, cls, text){ const n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = text; return n; }

  function renderDevices(state){
    const sec = el('div', 'lk-ctrl-block');
    sec.appendChild(el('div', 'lk-ctrl-h', t('Connected devices', 'Dispositivi connessi')));
    const usable = state.devices.filter(d => state.allowedDevices[d.type]);
    if(!usable.length){ sec.appendChild(el('div', 'lk-ctrl-empty', t('No device available for this project.', 'Nessun dispositivo disponibile per questo progetto.'))); return sec; }
    usable.forEach(d => {
      const row = el('div', 'lk-ctrl-dev' + (d.connected ? '' : ' off'));
      row.appendChild(el('span', 'lk-ctrl-dot lk-dev-' + d.type));
      row.appendChild(el('span', 'lk-ctrl-devname', d.label + (d.hwLabel ? ' · ' + d.hwLabel : '')));
      const used = state.players.find(p => p.deviceId === d.id);
      if(used) row.appendChild(el('span', 'lk-ctrl-tag', 'P' + (used.index + 1)));
      else if(!d.connected) row.appendChild(el('span', 'lk-ctrl-tag off', t('off', 'off')));
      sec.appendChild(row);
    });
    // browsers only expose a gamepad after the first button press
    if(state.allowedDevices.gamepad && !usable.some(d => d.type === 'gamepad' && d.connected)){
      sec.appendChild(el('div', 'lk-ctrl-hint', t('Controller not detected? Connect it and press any button on it.', 'Controller non rilevato? Collegalo e premi un tasto qualsiasi su di esso.')));
    }
    return sec;
  }

  function renderPlayers(state){
    const sec = el('div', 'lk-ctrl-block');
    sec.appendChild(el('div', 'lk-ctrl-h', t('Players', 'Giocatori')));
    const usable = state.devices.filter(d => state.allowedDevices[d.type]);
    state.players.forEach(p => {
      const row = el('div', 'lk-ctrl-player');
      row.appendChild(el('span', 'lk-ctrl-plabel', 'Player ' + (p.index + 1)));
      const sel = el('select', 'lk-ctrl-select');
      const none = el('option', null, t('— none —', '— nessuno —')); none.value = ''; sel.appendChild(none);
      usable.forEach(d => {
        const o = el('option', null, d.label + (d.connected ? '' : t(' (off)', ' (off)')));
        o.value = d.id; if(d.id === p.deviceId) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', () => manager.assignPlayerDevice(p.index, sel.value));
      row.appendChild(sel);
      sec.appendChild(row);
    });
    return sec;
  }

  function renderExtras(state){
    const sec = el('div', 'lk-ctrl-block');
    const autoRow = el('label', 'lk-ctrl-toggle');
    const acb = el('input'); acb.type = 'checkbox'; acb.checked = state.autoAssign !== false;
    acb.addEventListener('change', () => manager.setAutoAssign(acb.checked));
    autoRow.appendChild(acb);
    autoRow.appendChild(el('span', null, t('Auto-detect device in use', 'Rileva automaticamente il device in uso')));
    sec.appendChild(autoRow);
    if(state.allowedDevices.touch){
      const row = el('div', 'lk-ctrl-player');
      row.appendChild(el('span', 'lk-ctrl-plabel', t('Touch controls', 'Controlli touch')));
      const sel = el('select', 'lk-ctrl-select');
      [['auto', t('Auto (phone / portrait)', 'Auto (telefono / verticale)')], ['on', t('Always on', 'Sempre visibili')], ['off', t('Off', 'Off')]].forEach(pair => {
        const o = el('option', null, pair[1]); o.value = pair[0];
        if((state.touchMode || 'auto') === pair[0]) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => manager.setTouchMode(sel.value));
      row.appendChild(sel);
      sec.appendChild(row);
    }
    const map = el('button', 'lk-ctrl-map', '🎮 ' + t('Open key mapping', 'Apri mappatura tasti'));
    map.type = 'button';
    map.addEventListener('click', () => openMapping());
    sec.appendChild(map);
    const reset = el('button', 'lk-ctrl-reset', t('Reset controls to default', 'Ripristina controlli predefiniti'));
    reset.type = 'button';
    reset.addEventListener('click', () => manager.resetOverride());
    sec.appendChild(reset);
    return sec;
  }

  function render(){
    const state = manager.describe();
    body.innerHTML = '';
    body.appendChild(renderDevices(state));
    body.appendChild(renderPlayers(state));
    body.appendChild(renderExtras(state));
  }

  manager.onChange(render);
  render();
  return {render};
}

window.LK_RUNTIME_INPUT_MENU = Object.freeze({create});
})();
