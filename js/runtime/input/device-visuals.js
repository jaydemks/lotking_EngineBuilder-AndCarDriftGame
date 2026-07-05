/* =========================================================
   LOT KING — DEVICE VISUALS
   Compact, engine-styled schematic diagrams of the keyboard, gamepad
   and touch layout. Each diagram shows which action is bound to each
   key/button, highlights conflicts, and lights up the control live when
   the player actually presses it. Binding capture itself is driven by
   the mapping overlay; these are the visual surfaces it paints onto.
   ========================================================= */
(function(){
'use strict';

const ACTION_COLOR = {
  throttle: '#4be3a0', brake: '#ef476f', steerLeft: '#9db4ff', steerRight: '#ffd166',
  steer: '#9db4ff', handbrake: '#ff9e3d', reset: '#c792ea',
};

// curated keycap layout (physical e.code + label + grid col/row span)
const KEY_LAYOUT = [
  [['Tab','Tab',2],['KeyQ','Q'],['KeyW','W'],['KeyE','E'],['KeyR','R'],['KeyT','T']],
  [['KeyA','A'],['KeyS','S'],['KeyD','D'],['KeyF','F'],['KeyG','G']],
  [['ShiftLeft','⇧',2],['KeyZ','Z'],['KeyX','X'],['KeyC','C'],['KeyV','V']],
  [['Space','SPACE',5]],
];
const ARROW_LAYOUT = [
  [null,['ArrowUp','↑'],null],
  [['ArrowLeft','←'],['ArrowDown','↓'],['ArrowRight','→']],
];

function el(tag, cls, text){ const n = document.createElement(tag); if(cls) n.className = cls; if(text != null) n.textContent = text; return n; }
function reverseScheme(scheme){
  // code/button -> action (first match wins for the label)
  const map = {};
  for(const a in scheme){
    const v = scheme[a];
    if(Array.isArray(v)) v.forEach(code => { if(!map[code]) map[code] = a; });
  }
  return map;
}

// ------------------------------------------------ keyboard
function createKeyboard(container, deps){
  deps = deps || {};
  const onPick = deps.onPick || function(){};
  const keyLabel = deps.keyLabel || (c => c);
  const root = el('div', 'lk-dv lk-dv-keyboard');
  const board = el('div', 'lk-dv-kb-main');
  const arrows = el('div', 'lk-dv-kb-arrows');
  root.appendChild(board);
  root.appendChild(arrows);
  container.appendChild(root);
  const caps = {};   // code -> {cap, tag}

  function keycap(code, label, span){
    const cap = el('button', 'lk-dv-key');
    cap.type = 'button';
    if(span) cap.style.gridColumn = 'span ' + span;
    cap.dataset.code = code;
    cap.appendChild(el('span', 'lk-dv-keycap', label));
    cap.appendChild(el('span', 'lk-dv-keytag'));
    cap.addEventListener('click', () => onPick(code));
    caps[code] = {cap, tag: cap.querySelector('.lk-dv-keytag')};
    return cap;
  }
  KEY_LAYOUT.forEach(row => { const r = el('div', 'lk-dv-kb-row'); row.forEach(k => r.appendChild(keycap(k[0], k[1], k[2]))); board.appendChild(r); });
  ARROW_LAYOUT.forEach(row => { const r = el('div', 'lk-dv-kb-row'); row.forEach(k => r.appendChild(k ? keycap(k[0], k[1]) : el('span', 'lk-dv-key ghost'))); arrows.appendChild(r); });

  function ensureExtra(code){
    if(caps[code]) return;
    const r = el('div', 'lk-dv-kb-row');
    r.appendChild(keycap(code, keyLabel(code)));
    board.appendChild(r);
  }
  function render(scheme, o){
    o = o || {};
    const rev = reverseScheme(scheme);
    for(const code in rev) ensureExtra(code);
    for(const code in caps){
      const action = rev[code];
      const c = caps[code];
      c.cap.classList.toggle('bound', !!action);
      c.cap.classList.toggle('conflict', !!(action && o.conflicts && o.conflicts[action]));
      c.tag.textContent = action ? (o.short ? o.short(action) : action) : '';
      c.cap.style.setProperty('--dv', action ? (ACTION_COLOR[action] || '#8ab4ff') : 'transparent');
    }
  }
  function highlight(isDown){
    for(const code in caps) caps[code].cap.classList.toggle('active', !!isDown(code));
  }
  return {el: root, render, highlight};
}

// ------------------------------------------------ gamepad (schematic)
const GP_BUTTONS = [
  ['lt', 6, '12%', '4%', 'LT'], ['rt', 7, '78%', '4%', 'RT'],
  ['lb', 4, '12%', '20%', 'LB'], ['rb', 5, '78%', '20%', 'RB'],
  ['up', 12, '22%', '38%', '▲'], ['down', 13, '22%', '70%', '▼'], ['left', 14, '12%', '54%', '◀'], ['right', 15, '32%', '54%', '▶'],
  ['y', 3, '82%', '38%', 'Y'], ['a', 0, '82%', '70%', 'A'], ['x', 2, '72%', '54%', 'X'], ['b', 1, '92%', '54%', 'B'],
  ['back', 8, '40%', '42%', '⋯'], ['start', 9, '60%', '42%', '≡'],
];
function createGamepad(container, deps){
  deps = deps || {};
  const onPick = deps.onPick || function(){};
  const root = el('div', 'lk-dv lk-dv-gamepad');
  const pad = el('div', 'lk-dv-gp-body');
  const stick = el('button', 'lk-dv-gp-stick'); stick.type = 'button'; stick.dataset.axis = '0';
  stick.title = 'Steering axis'; stick.appendChild(el('span', 'lk-dv-gp-stickdot'));
  stick.style.left = '30%'; stick.style.top = '62%';
  pad.appendChild(stick);
  const btns = {};
  GP_BUTTONS.forEach(([key, index, left, top, label]) => {
    const b = el('button', 'lk-dv-gp-btn'); b.type = 'button';
    b.dataset.index = String(index);
    b.style.left = left; b.style.top = top;
    b.appendChild(el('span', 'lk-dv-gp-lbl', label));
    b.appendChild(el('span', 'lk-dv-gp-tag'));
    b.addEventListener('click', () => onPick({type: 'button', index}));
    pad.appendChild(b);
    btns[index] = {b, tag: b.querySelector('.lk-dv-gp-tag')};
  });
  root.appendChild(pad);
  container.appendChild(root);

  function render(scheme, o){
    o = o || {};
    const byIndex = {};
    let steerAction = null;
    for(const a in scheme){ const v = scheme[a]; if(v && v.type === 'button') byIndex[v.index] = a; else if(v && v.type === 'axis') steerAction = a; }
    for(const i in btns){
      const action = byIndex[i];
      btns[i].b.classList.toggle('bound', !!action);
      btns[i].b.classList.toggle('conflict', !!(action && o.conflicts && o.conflicts[action]));
      btns[i].tag.textContent = action ? (o.short ? o.short(action) : action) : '';
      btns[i].b.style.setProperty('--dv', action ? (ACTION_COLOR[action] || '#8ab4ff') : 'transparent');
    }
    stick.classList.toggle('bound', !!steerAction);
    stick.style.setProperty('--dv', steerAction ? (ACTION_COLOR[steerAction] || '#9db4ff') : 'transparent');
  }
  function highlight(gp){
    for(const i in btns) btns[i].b.classList.toggle('active', !!(gp && gp.pressed(Number(i))));
    if(gp){ const x = gp.axis(0), y = gp.axis(1); stick.querySelector('.lk-dv-gp-stickdot').style.transform = 'translate(' + (x * 8) + 'px,' + (y * 8) + 'px)'; }
  }
  return {el: root, render, highlight};
}

// ------------------------------------------------ touch (static preview)
function createTouch(container){
  const root = el('div', 'lk-dv lk-dv-touch');
  root.innerHTML =
    '<div class="lk-dv-touch-pad"><span>STEER</span></div>' +
    '<div class="lk-dv-touch-btns">' +
      '<span class="lk-dv-touch-b hb">e-brake</span>' +
      '<span class="lk-dv-touch-b br">brake</span>' +
      '<span class="lk-dv-touch-b ga">gas</span>' +
    '</div>';
  container.appendChild(root);
  return {el: root, render(){}, highlight(){}};
}

window.LK_RUNTIME_DEVICE_VISUALS = Object.freeze({
  ACTION_COLOR,
  createKeyboard,
  createGamepad,
  createTouch,
});
})();
