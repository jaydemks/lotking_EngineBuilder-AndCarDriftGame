/* =========================================================
   LOT KING — EDITOR CONTEXT MENU
   Nested context menu rendering and outside-click closing.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const ctxEl = deps.ctxEl;
  function close(){
    if(!ctxEl) return;
    ctxEl.innerHTML = '';
    ctxEl.classList.remove('open');
  }
  function buildMenuItems(m, items){
    for(const it of items || []){
      if(it.sep){ const s = document.createElement('div'); s.className = 'lk-menu-sep'; m.appendChild(s); continue; }
      const d = document.createElement('div');
      d.className = 'lk-menu-item' + (it.disabled ? ' disabled' : '') + (it.sub ? ' has-sub' : '');
      d.innerHTML = '<span class="mi-ic">' + (it.icon || '') + '</span><span>' + it.label + '</span>' + (it.sub ? '<span class="mi-arrow">▸</span>' : '');
      if(it.sub){
        const sub = document.createElement('div');
        sub.className = 'lk-menu lk-submenu';
        buildMenuItems(sub, it.sub);
        d.appendChild(sub);
      } else if(!it.disabled) {
        d.addEventListener('click', () => { close(); it.action && it.action(); });
      }
      m.appendChild(d);
    }
  }
  function open(items, x, y){
    if(!ctxEl) return;
    close();
    const m = document.createElement('div');
    m.className = 'lk-menu';
    buildMenuItems(m, items);
    ctxEl.appendChild(m);
    ctxEl.classList.add('open');
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  }
  addEventListener('pointerdown', e => {
    if(ctxEl && ctxEl.classList.contains('open') && !e.target.closest('.lk-menu')) close();
  }, true);
  return Object.freeze({open, close});
}

window.LK_EDITOR_CONTEXT_MENU = Object.freeze({create});
})();
