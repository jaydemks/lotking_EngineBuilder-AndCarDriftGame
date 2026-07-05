/* =========================================================
   LOT KING — MAPPING OVERLAY
   The visual key/button mapper, hosted in a draggable/resizable window.
   Works against an abstract `session` so the exact same UI serves both
   the in-game Controls menu (live, edits the player override) and the
   editor (edits the project's meta.input). Shows the keyboard / gamepad
   / touch diagrams, binds via "click action or key → press input", warns
   on conflicts and lights inputs live.

   session interface:
     getConfig()                      -> normalized config
     setContext(id)
     remap(deviceId, action, binding)
     addInstance(type)                -> instance | null
     removeInstance(deviceId)
     onChange(fn)                     -> unsubscribe
     liveKeyboardDown(code)           -> bool
     liveGamepad(padIndex)            -> source | null
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const wm = deps.wm;
  const session = deps.session;
  const ACT = window.LK_RUNTIME_INPUT_ACTIONS;
  const DV = window.LK_RUNTIME_DEVICE_VISUALS;
  if(!wm || !session || !ACT || !DV) return null;
  const lang = deps.lang || (() => 'it');
  const t = (en, it) => (lang() === 'it' ? it : en);

  let curType = 'keyboard';
  let curInstance = null;          // selected device instance id
  let capturing = null;            // {action, chip, raf}
  let raf = 0;
  let kbVis = null, gpVis = null, touchVis = null;

  const content = document.createElement('div');
  content.className = 'lk-map';
  content.innerHTML =
    '<div class="lk-map-bar">' +
      '<label class="lk-map-ctx">' + t('Context', 'Contesto') + ' <select class="lk-map-ctxsel"></select></label>' +
      '<div class="lk-map-tabs"></div>' +
    '</div>' +
    '<div class="lk-map-instrow"></div>' +
    '<div class="lk-map-stage"></div>' +
    '<div class="lk-map-actions"></div>' +
    '<div class="lk-map-hint"></div>';
  const ctxSel = content.querySelector('.lk-map-ctxsel');
  const tabsEl = content.querySelector('.lk-map-tabs');
  const instRow = content.querySelector('.lk-map-instrow');
  const stage = content.querySelector('.lk-map-stage');
  const actionsEl = content.querySelector('.lk-map-actions');
  const hint = content.querySelector('.lk-map-hint');

  const win = wm.create({
    id: deps.windowId || 'lk-mapping',
    title: t('Mapping', 'Mappatura'),
    width: 560, height: 520, minWidth: 420, minHeight: 380,
    content,
    onOpen: () => { render(); startLive(); },
    onClose: () => { endCapture(); stopLive(); },
  });

  function actionsFor(type){ return type === 'gamepad' ? ACT.GAMEPAD_ACTIONS : ACT.KEYBOARD_ACTIONS; }
  function actionLabel(a){ const e = ACT.ACTION_LABELS[a]; return e ? (lang() === 'it' ? e.it : e.en) : a; }
  function shortLabel(a){ return actionLabel(a).split(/[\s/]/)[0]; }
  function config(){ return session.getConfig(); }
  function instancesOfType(cfg, type){ return cfg.devices.filter(d => d.type === type); }

  function ensureInstance(cfg){
    const list = instancesOfType(cfg, curType);
    if(!list.some(d => d.id === curInstance)) curInstance = list[0] ? list[0].id : null;
  }

  // ------------------------------------------------ capture
  function endCapture(){
    if(!capturing) return;
    if(capturing.kbHandler) window.removeEventListener('keydown', capturing.kbHandler, true);
    if(capturing.raf) cancelAnimationFrame(capturing.raf);
    if(capturing.chip) capturing.chip.classList.remove('capturing');
    capturing = null;
  }
  function beginCapture(action, chip){
    endCapture();
    capturing = {action, chip};
    if(chip) chip.classList.add('capturing');
    hint.textContent = curType === 'gamepad' ? t('Press a button on the gamepad…', 'Premi un pulsante sul gamepad…') : t('Press a key… (Esc to cancel)', 'Premi un tasto… (Esc annulla)');
    if(curType === 'keyboard'){
      capturing.kbHandler = e => {
        e.preventDefault(); e.stopPropagation();
        if(e.code !== 'Escape') session.remap(curInstance, action, [e.code]);
        endCapture(); render();
      };
      window.addEventListener('keydown', capturing.kbHandler, true);
    } else if(curType === 'gamepad'){
      const poll = () => {
        if(!capturing) return;
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        for(const pad of pads){
          if(!pad) continue;
          for(let i = 0; i < pad.buttons.length; i++){
            if(pad.buttons[i] && pad.buttons[i].pressed){
              session.remap(curInstance, action, {type: 'button', index: i});
              endCapture(); render();
              return;
            }
          }
        }
        capturing.raf = requestAnimationFrame(poll);
      };
      capturing.raf = requestAnimationFrame(poll);
    }
  }

  // ------------------------------------------------ live highlight
  function startLive(){
    stopLive();
    const tick = () => {
      const cfg = config();
      const inst = ACT.deviceInstance(cfg, curInstance);
      if(curType === 'keyboard' && kbVis) kbVis.highlight(code => session.liveKeyboardDown(code));
      if(curType === 'gamepad' && gpVis) gpVis.highlight(session.liveGamepad(inst ? (inst.slot - 1) : 0));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function stopLive(){ if(raf) cancelAnimationFrame(raf); raf = 0; }

  // ------------------------------------------------ render
  function render(){
    const cfg = config();
    // context selector
    ctxSel.innerHTML = '';
    Object.keys(cfg.contexts).forEach(id => {
      const o = document.createElement('option'); o.value = id;
      o.textContent = (cfg.contexts[id].label && (lang() === 'it' ? cfg.contexts[id].label.it : cfg.contexts[id].label.en)) || id;
      if(id === cfg.activeContext) o.selected = true;
      ctxSel.appendChild(o);
    });
    // device tabs (allowed only)
    tabsEl.innerHTML = '';
    ACT.DEVICE_TYPES.filter(type => cfg.allowedDevices[type]).forEach(type => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'lk-map-tab' + (type === curType ? ' on' : '');
      b.textContent = type === 'keyboard' ? t('Keyboard', 'Tastiera') : type === 'gamepad' ? 'Gamepad' : 'Touch';
      b.addEventListener('click', () => { curType = type; curInstance = null; endCapture(); render(); });
      tabsEl.appendChild(b);
    });
    if(!cfg.allowedDevices[curType]){ const first = ACT.DEVICE_TYPES.find(x => cfg.allowedDevices[x]); if(first) curType = first; }
    ensureInstance(cfg);

    // instance row (split add/remove) — not for touch
    instRow.innerHTML = '';
    if(curType !== 'touch'){
      const sel = document.createElement('select'); sel.className = 'lk-map-instsel';
      instancesOfType(cfg, curType).forEach(d => {
        const o = document.createElement('option'); o.value = d.id; o.textContent = ACT.deviceLabel(d);
        if(d.id === curInstance) o.selected = true; sel.appendChild(o);
      });
      sel.addEventListener('change', () => { curInstance = sel.value; render(); });
      instRow.appendChild(sel);
      const add = document.createElement('button'); add.type = 'button'; add.className = 'lk-map-inst-add';
      add.textContent = t('＋ Split', '＋ Split');
      add.title = t('Add a second device with its own bindings (local co-op)', 'Aggiungi un secondo device con binding propri (co-op locale)');
      add.addEventListener('click', () => { const inst = session.addInstance(curType); if(inst){ curInstance = inst.id; render(); } });
      instRow.appendChild(add);
      const inst = ACT.deviceInstance(cfg, curInstance);
      if(inst && inst.slot > 1){
        const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'lk-map-inst-rm'; rm.textContent = '🗑';
        rm.addEventListener('click', () => { session.removeInstance(curInstance); curInstance = null; render(); });
        instRow.appendChild(rm);
      }
    }

    // diagram
    stage.innerHTML = '';
    kbVis = gpVis = touchVis = null;
    const scheme = ACT.effectiveScheme(cfg, cfg.activeContext, curType, curInstance);
    const conflicts = ACT.schemeConflicts(scheme, curType);
    const rev = {};
    if(curType === 'keyboard'){ for(const a in scheme) (scheme[a] || []).forEach(c => { if(!rev[c]) rev[c] = a; }); }
    else if(curType === 'gamepad'){ for(const a in scheme){ const b = scheme[a]; if(b && b.type === 'button') rev['btn' + b.index] = a; } }

    if(curType === 'keyboard'){
      kbVis = DV.createKeyboard(stage, {keyLabel: ACT.keyLabel, onPick: code => { const a = rev[code]; if(a) beginCapture(a); }});
      kbVis.render(scheme, {conflicts, short: shortLabel});
    } else if(curType === 'gamepad'){
      gpVis = DV.createGamepad(stage, {onPick: b => { const a = rev['btn' + b.index]; if(a) beginCapture(a); }});
      gpVis.render(scheme, {conflicts, short: shortLabel});
    } else {
      touchVis = DV.createTouch(stage);
    }

    // action list
    actionsEl.innerHTML = '';
    if(curType === 'touch'){
      actionsEl.appendChild(elc('div', 'lk-map-note', t('Touch layout is fixed and shown above.', 'Il layout touch è fisso ed è mostrato sopra.')));
    } else {
      actionsFor(curType).forEach(a => {
        const row = elc('div', 'lk-map-arow' + (conflicts[a] ? ' conflict' : ''));
        row.appendChild(elc('span', 'lk-map-adot', '', ACT_COLOR(a)));
        row.appendChild(elc('span', 'lk-map-aname', actionLabel(a)));
        const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'lk-map-chip';
        chip.textContent = bindText(curType, scheme[a]);
        chip.addEventListener('click', () => beginCapture(a, chip));
        row.appendChild(chip);
        actionsEl.appendChild(row);
      });
    }
    hint.textContent = t('Click an action or a control, then press the input.', 'Clicca un\'azione o un controllo, poi premi l\'input.');
  }

  function bindText(type, v){
    if(type === 'gamepad') return ACT.gamepadBindLabel(v);
    return (v || []).map(ACT.keyLabel).join(' / ') || '—';
  }
  function ACT_COLOR(a){ return DV.ACTION_COLOR[a] || '#8ab4ff'; }
  function elc(tag, cls, text, bg){ const n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = text; if(bg) n.style.background = bg; return n; }

  ctxSel.addEventListener('change', () => { session.setContext(ctxSel.value); render(); });
  session.onChange(() => { if(win.isOpen() && !capturing) render(); });

  return {
    open: () => win.open(),
    close: () => win.close(),
    toggle: () => win.toggle(),
    isOpen: () => win.isOpen(),
    render,
    window: win,
  };
}

window.LK_RUNTIME_MAPPING_OVERLAY = Object.freeze({create});
})();
