/* =========================================================
   LOT KING — WINDOW MANAGER
   Lightweight floating-window system for editor/game overlays:
   centered on first open, draggable by a title bar, resizable, with
   gentle magnetic snapping (to the viewport edges and to other windows)
   and per-window geometry persistence. Windows never fly off-screen —
   positions are clamped into view. Can also `attach` to an existing
   panel element (e.g. the editor Settings overlay) to make it movable.
   ========================================================= */
(function(){
'use strict';

const SNAP = 10;
const MARGIN = 6;
let zTop = 4000;

function create(opts){
  opts = opts || {};
  const storageKey = opts.storageKey || 'lotking.windows.v1';
  let layer = opts.layer;
  if(!layer){
    layer = document.createElement('div');
    layer.className = 'lk-win-layer';
    (opts.mount || document.body).appendChild(layer);
  }
  const movable = new Map();   // el -> record

  function loadGeom(id){
    try { return (JSON.parse(localStorage.getItem(storageKey) || '{}'))[id] || null; } catch(err){ return null; }
  }
  function saveGeom(id, g){
    try { const all = JSON.parse(localStorage.getItem(storageKey) || '{}'); all[id] = g; localStorage.setItem(storageKey, JSON.stringify(all)); } catch(err){}
  }
  function otherRects(exceptEl){
    const rects = [];
    movable.forEach((r, el) => { if(el !== exceptEl && isVisible(el)) rects.push(el.getBoundingClientRect()); });
    return rects;
  }
  function isVisible(el){ return el.offsetParent !== null || el.classList.contains('open'); }

  function snap(left, top, w, h, others){
    const vw = window.innerWidth, vh = window.innerHeight;
    const right = left + w, bottom = top + h;
    const near = (a, b) => Math.abs(a - b) <= SNAP;
    if(near(left, MARGIN)) left = MARGIN;
    if(near(right, vw - MARGIN)) left = vw - MARGIN - w;
    if(near(top, MARGIN)) top = MARGIN;
    if(near(bottom, vh - MARGIN)) top = vh - MARGIN - h;
    for(const r of others){
      if(near(left, r.right)) left = r.right;
      if(near(right, r.left)) left = r.left - w;
      if(near(top, r.top)) top = r.top;
      if(near(bottom, r.bottom)) top = r.bottom - h;
      if(near(top, r.bottom)) top = r.bottom;
      if(near(bottom, r.top)) top = r.top - h;
      if(near(left, r.left)) left = r.left;
      if(near(right, r.right)) left = r.right - w;
    }
    return {left, top};
  }
  function clampIntoView(el){
    const r = el.getBoundingClientRect();
    let left = Math.min(Math.max(r.left, MARGIN - r.width + 80), window.innerWidth - 80);
    let top = Math.min(Math.max(r.top, MARGIN), window.innerHeight - 40);
    el.style.left = left + 'px'; el.style.top = top + 'px';
  }
  function bringToFront(el){ el.style.zIndex = String(++zTop); }
  function center(el){
    el.style.left = Math.max(MARGIN, (window.innerWidth - el.offsetWidth) / 2) + 'px';
    el.style.top = Math.max(MARGIN, (window.innerHeight - el.offsetHeight) / 2) + 'px';
  }

  // shared drag + resize wiring for any positioned element
  function wire(el, head, resize, id, min){
    el.classList.add('lk-movable');
    function persist(){ const r = el.getBoundingClientRect(); saveGeom(id, {left: r.left, top: r.top, width: r.width, height: r.height}); }
    let dragId = null, dx = 0, dy = 0;
    head.addEventListener('pointerdown', e => {
      if(e.target.closest('button, input, select, textarea, a')) return;
      dragId = e.pointerId;
      const r = el.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top;
      bringToFront(el); head.setPointerCapture(e.pointerId); el.classList.add('dragging'); e.preventDefault();
    });
    head.addEventListener('pointermove', e => {
      if(e.pointerId !== dragId) return;
      const s = snap(e.clientX - dx, e.clientY - dy, el.offsetWidth, el.offsetHeight, otherRects(el));
      el.style.left = s.left + 'px'; el.style.top = s.top + 'px';
    });
    const endDrag = e => { if(e.pointerId !== dragId) return; dragId = null; el.classList.remove('dragging'); clampIntoView(el); persist(); };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);

    if(resize){
      let rzId = null, rw = 0, rh = 0, rx = 0, ry = 0;
      resize.addEventListener('pointerdown', e => {
        rzId = e.pointerId; const r = el.getBoundingClientRect(); rw = r.width; rh = r.height; rx = e.clientX; ry = e.clientY;
        resize.setPointerCapture(e.pointerId); bringToFront(el); e.preventDefault(); e.stopPropagation();
      });
      resize.addEventListener('pointermove', e => {
        if(e.pointerId !== rzId) return;
        el.style.width = Math.max(min.w, rw + (e.clientX - rx)) + 'px';
        el.style.height = Math.max(min.h, rh + (e.clientY - ry)) + 'px';
      });
      const endResize = e => { if(e.pointerId !== rzId) return; rzId = null; persist(); };
      resize.addEventListener('pointerup', endResize);
      resize.addEventListener('pointercancel', endResize);
    }
    el.addEventListener('pointerdown', () => bringToFront(el));
    movable.set(el, {id});
    return {persist};
  }

  function applyStored(el, id){
    const g = loadGeom(id);
    if(g){ el.style.left = g.left + 'px'; el.style.top = g.top + 'px'; if(g.width) el.style.width = g.width + 'px'; if(g.height) el.style.height = g.height + 'px'; clampIntoView(el); }
    else center(el);
  }

  function createWindow(cfg){
    cfg = cfg || {};
    const id = cfg.id || ('win-' + Math.random().toString(36).slice(2));
    const el = document.createElement('div');
    el.className = 'lk-win';
    el.innerHTML =
      '<div class="lk-win-head"><span class="lk-win-title"></span>' +
        '<span class="lk-win-actions"><button class="lk-win-close" type="button" title="Close">×</button></span></div>' +
      '<div class="lk-win-body"></div><div class="lk-win-resize" title="Resize"></div>';
    const titleEl = el.querySelector('.lk-win-title');
    const bodyEl = el.querySelector('.lk-win-body');
    titleEl.textContent = cfg.title || '';
    el.style.width = (cfg.width || 460) + 'px';
    el.style.height = (cfg.height || 360) + 'px';
    layer.appendChild(el);
    wire(el, el.querySelector('.lk-win-head'), el.querySelector('.lk-win-resize'), id, {w: cfg.minWidth || 300, h: cfg.minHeight || 200});
    el.querySelector('.lk-win-close').addEventListener('click', () => api.close());
    const api = {
      id, el, body: bodyEl,
      setTitle: t => { titleEl.textContent = t; },
      open(){ el.classList.add('open'); applyStored(el, id); bringToFront(el); if(cfg.onOpen) cfg.onOpen(); return api; },
      close(){ el.classList.remove('open'); if(cfg.onClose) cfg.onClose(); return api; },
      toggle(){ return el.classList.contains('open') ? api.close() : api.open(); },
      isOpen: () => el.classList.contains('open'),
      center: () => center(el),
    };
    if(cfg.content) bodyEl.appendChild(cfg.content);
    return api;
  }

  // make an existing panel element movable/resizable (e.g. Settings overlay)
  function attach(el, o){
    o = o || {};
    if(movable.has(el)) return movable.get(el);
    const id = o.id || el.id || ('attach-' + Math.random().toString(36).slice(2));
    const head = o.handle ? el.querySelector(o.handle) : el;
    let resize = el.querySelector('.lk-win-resize');
    if(o.resizable !== false && !resize){ resize = document.createElement('div'); resize.className = 'lk-win-resize'; el.appendChild(resize); }
    wire(el, head || el, resize, id, {w: o.minWidth || 320, h: o.minHeight || 240});
    return {
      center: () => center(el),
      restore: () => applyStored(el, id),
    };
  }

  window.addEventListener('resize', () => { movable.forEach((r, el) => { if(isVisible(el)) clampIntoView(el); }); });

  return {create: createWindow, attach, layer};
}

window.LK_RUNTIME_WINDOW_MANAGER = Object.freeze({create});
})();
