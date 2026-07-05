/* =========================================================
   LOT KING — EDITOR INPUT SETTINGS (project controls)
   Per-project input config in meta.input: allowed device families,
   default device-instance per player, and — via the shared Mapping
   overlay — the default bindings per context/device. Edits ED.inputConfig,
   marks the project dirty and live-applies to GAME.input so Preview
   reflects the choices. The editor ignores the player override, so the
   mapping shown here is the pure project config.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const body = deps.body || document.getElementById('lkInputSettingsBody');
  const ED = deps.ED || {};
  const GAME = deps.GAME;
  // self-sufficient: build our own window manager if the editor didn't pass one
  const wm = deps.wm || (window.LK_RUNTIME_WINDOW_MANAGER ? window.LK_RUNTIME_WINDOW_MANAGER.create({storageKey: 'lotking.windows.editor.v1'}) : null);
  const status = deps.status || function(){};
  const markDirty = deps.markDirty || function(){};
  const ACT = window.LK_RUNTIME_INPUT_ACTIONS;
  if(!body || !ACT) return null;
  const lang = deps.lang || (() => 'en');
  const t = (en, it) => (lang() === 'it' ? it : en);
  const listeners = new Set();

  function cfg(){
    ED.inputConfig = ACT.normalizeConfig(ED.inputConfig);
    return ED.inputConfig;
  }
  function commit(){
    ED.inputConfig = ACT.normalizeConfig(ED.inputConfig);
    markDirty();
    if(GAME && GAME.input){
      if(GAME.input.setOverrideEnabled) GAME.input.setOverrideEnabled(false);
      if(GAME.input.setConfig) GAME.input.setConfig(ED.inputConfig);
    }
    listeners.forEach(fn => { try { fn(); } catch(err){} });
    render();
  }
  function setConfig(raw){ ED.inputConfig = ACT.normalizeConfig(raw); listeners.forEach(fn => { try { fn(); } catch(err){} }); render(); }

  // ------------------------------------------------ shared Mapping overlay (editor session)
  const session = {
    getConfig: () => cfg(),
    setContext: id => { cfg().activeContext = id; commit(); },
    remap: (dev, action, binding) => { const c = cfg(); ACT.setBinding(c, c.activeContext, dev, action, binding); commit(); },
    addInstance: type => { const i = ACT.addDeviceInstance(cfg(), type); commit(); return i; },
    removeInstance: id => { ACT.removeDeviceInstance(cfg(), id); commit(); },
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    liveKeyboardDown: code => (GAME && GAME.input && GAME.input.liveKeyboardDown) ? GAME.input.liveKeyboardDown(code) : false,
    liveGamepad: idx => (GAME && GAME.input && GAME.input.liveGamepad) ? GAME.input.liveGamepad(idx) : null,
  };
  let mapping = null;
  if(wm && window.LK_RUNTIME_MAPPING_OVERLAY){
    mapping = window.LK_RUNTIME_MAPPING_OVERLAY.create({wm, session, lang, windowId: 'lk-mapping-editor'});
  }

  function el(tag, cls, text){ const n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = text; return n; }

  // live view of the actual connected hardware (from the runtime manager)
  function renderConnected(){
    const sec = el('div', 'lk-is-block');
    sec.appendChild(el('div', 'lk-is-h', t('Connected devices (live)', 'Dispositivi connessi (live)')));
    const state = (GAME && GAME.input && GAME.input.describe) ? GAME.input.describe() : null;
    const list = state ? state.devices.filter(d => state.allowedDevices[d.type]) : [];
    if(!list.length){ sec.appendChild(el('div', 'lk-is-note', t('Runtime not ready.', 'Runtime non pronto.'))); return sec; }
    list.forEach(d => {
      const row = el('div', 'lk-is-dev' + (d.connected ? ' on' : ''));
      row.appendChild(el('span', 'lk-is-dot lk-dev-' + d.type));
      row.appendChild(el('span', 'lk-is-devname', d.label + (d.hwLabel ? ' · ' + d.hwLabel : '')));
      row.appendChild(el('span', 'lk-is-devstate', d.connected ? t('on', 'on') : t('off', 'off')));
      sec.appendChild(row);
    });
    if(state && state.allowedDevices.gamepad && !list.some(d => d.type === 'gamepad' && d.connected)){
      sec.appendChild(el('div', 'lk-is-note', t('Controller not detected? Connect it and press a button on it.', 'Controller non rilevato? Collegalo e premi un tasto su di esso.')));
    }
    return sec;
  }

  function renderAllowed(){
    const c = cfg();
    const sec = el('div', 'lk-is-block');
    sec.appendChild(el('div', 'lk-is-h', t('Devices allowed in this project', 'Dispositivi ammessi nel progetto')));
    ACT.DEVICE_TYPES.forEach(type => {
      const row = el('label', 'lk-is-toggle');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!c.allowedDevices[type];
      cb.addEventListener('change', () => { c.allowedDevices[type] = cb.checked; commit(); });
      row.appendChild(cb);
      row.appendChild(el('span', null, type === 'keyboard' ? t('Keyboard', 'Tastiera') : type === 'gamepad' ? 'Gamepad' : t('Touch (mobile)', 'Touch (mobile)')));
      sec.appendChild(row);
    });
    const tRow = el('div', 'lk-is-row');
    tRow.appendChild(el('span', 'lk-is-plabel', t('Touch controls', 'Controlli touch')));
    const tSel = el('select', 'lk-is-select'); tSel.disabled = !c.allowedDevices.touch;
    [['auto', t('Auto (phone / portrait)', 'Auto (telefono / verticale)')], ['on', t('Always on', 'Sempre visibili')], ['off', t('Off', 'Off')]].forEach(pair => {
      const o = el('option', null, pair[1]); o.value = pair[0];
      if((c.touchMode || 'auto') === pair[0]) o.selected = true;
      tSel.appendChild(o);
    });
    tSel.addEventListener('change', () => { c.touchMode = tSel.value; commit(); });
    tRow.appendChild(tSel);
    sec.appendChild(tRow);
    const aa = el('label', 'lk-is-toggle');
    const aacb = el('input'); aacb.type = 'checkbox'; aacb.checked = c.autoAssign !== false;
    aacb.addEventListener('change', () => { c.autoAssign = aacb.checked; commit(); });
    aa.appendChild(aacb);
    aa.appendChild(el('span', null, t('Auto-detect device in use (Player 1)', 'Rileva automaticamente il device in uso (Player 1)')));
    sec.appendChild(aa);
    return sec;
  }

  function renderPlayers(){
    const c = cfg();
    const sec = el('div', 'lk-is-block');
    sec.appendChild(el('div', 'lk-is-h', t('Default device per player', 'Dispositivo predefinito per giocatore')));
    const instances = c.devices.filter(d => c.allowedDevices[d.type]);
    c.players.forEach((p, i) => {
      const row = el('div', 'lk-is-row');
      row.appendChild(el('span', 'lk-is-plabel', 'Player ' + (i + 1)));
      const sel = el('select', 'lk-is-select');
      const opts = instances.slice();
      if(!opts.some(d => d.id === p.device)){ const cur = ACT.deviceInstance(c, p.device); if(cur) opts.unshift(cur); }
      opts.forEach(d => { const o = el('option', null, ACT.deviceLabel(d)); o.value = d.id; if(d.id === p.device) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', () => { p.device = sel.value; commit(); });
      row.appendChild(sel);
      if(c.players.length > 1){
        const rm = el('button', 'lk-is-rm', '🗑'); rm.type = 'button';
        rm.addEventListener('click', () => { c.players.splice(i, 1); commit(); });
        row.appendChild(rm);
      }
      sec.appendChild(row);
    });
    const add = el('button', 'lk-is-add', t('＋ Add player', '＋ Aggiungi giocatore')); add.type = 'button';
    add.addEventListener('click', () => {
      const c2 = cfg();
      c2.players.push({id: 'player-' + (c2.players.length + 1), device: 'keyboard-1'});
      commit();
    });
    sec.appendChild(add);
    return sec;
  }

  function renderMapping(){
    const sec = el('div', 'lk-is-block');
    sec.appendChild(el('div', 'lk-is-h', t('Bindings', 'Mappature')));
    const open = el('button', 'lk-is-map', '🎮 ' + t('Open Mapping editor', 'Apri editor Mapping')); open.type = 'button';
    open.disabled = !mapping;
    open.addEventListener('click', () => mapping && mapping.open());
    sec.appendChild(open);
    sec.appendChild(el('div', 'lk-is-note', t('Visual key/button mapping per context (vehicle now).', 'Mappatura visiva tasti/pulsanti per contesto (veicolo per ora).')));
    const reset = el('button', 'lk-is-reset', t('Reset to defaults', 'Ripristina predefiniti')); reset.type = 'button';
    reset.addEventListener('click', () => { ED.inputConfig = ACT.defaultConfig(); commit(); status(t('Controls reset to defaults', 'Controlli ripristinati')); });
    sec.appendChild(reset);
    return sec;
  }

  function render(){
    body.innerHTML = '';
    body.appendChild(renderConnected());
    body.appendChild(renderAllowed());
    body.appendChild(renderPlayers());
    body.appendChild(renderMapping());
  }
  // refresh the live device list on hotplug (gamepad connect/disconnect)
  if(GAME && GAME.input && GAME.input.onChange) GAME.input.onChange(() => render());
  render();

  return Object.freeze({render, setConfig, get: () => ACT.normalizeConfig(cfg())});
}

window.LK_EDITOR_INPUT_SETTINGS = Object.freeze({create});
})();
