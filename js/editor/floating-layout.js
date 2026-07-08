/* =========================================================
   LOT KING — EDITOR FLOATING LAYOUT
   Panel widths, assets dock height, floating panel drag/clamp.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const root = deps.root;
  const ED = deps.ED;
  const $ = deps.$;
  const status = deps.status || function(){};
  const cameraAspect = deps.cameraAspect || function(){ return innerWidth / innerHeight; };

  function isFinitePosValue(value){ return Number.isFinite(Number(value)); }
  function panelWidth(side){
    const prop = side === 'left' ? '--lk-left-w' : '--lk-right-w';
    return parseFloat(getComputedStyle(root).getPropertyValue(prop)) || 280;
  }
  function setPanelWidth(side, px){
    const prop = side === 'left' ? '--lk-left-w' : '--lk-right-w';
    root.style.setProperty(prop, Math.max(220, Math.min(520, Math.round(px))) + 'px');
    restoreFloatingPanels();
  }
  function setAssetsHeight(px){
    ED.assetsH = Math.max(140, Math.min(Math.round(innerHeight * .45), Math.round(px)));
    root.style.setProperty('--lk-assets-h', ED.assetsH + 'px');
    restoreFloatingPanels();
  }
  function editorViewportRect(){
    const x = Math.round(panelWidth('left') + 10);
    const toolbarH = ED.viewportToolbarCollapsed ? 28 : 36;
    const y = 46 + toolbarH;
    const w = Math.max(220, Math.round(innerWidth - panelWidth('left') - panelWidth('right') - 20));
    const timelineH = ED.cinemaTimelineOpen && ED.cinemaTimelineDocked ? (ED.cinemaTimelineH || 136) : 0;
    const h = Math.max(160, Math.round(innerHeight - y - 40 - ED.assetsH - timelineH));
    return {x, y, w, h};
  }
  function clampPanelPos(pos, w, h){
    const view = editorViewportRect();
    const pad = 10;
    const minX = view.x + pad;
    const minY = view.y + pad;
    const maxX = Math.max(minX, view.x + view.w - w - pad);
    const maxY = Math.max(minY, view.y + view.h - h - pad);
    return {
      x: Math.max(minX, Math.min(maxX, pos.x)),
      y: Math.max(minY, Math.min(maxY, pos.y)),
    };
  }
  function setFloatingPanelPos(el, pos, stateKey){
    const r = el.getBoundingClientRect();
    const p = clampPanelPos(pos, r.width || 260, r.height || 36);
    el.style.left = p.x + 'px';
    el.style.top = p.y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    ED[stateKey] = p;
  }
  function clampFloatingPanelPos(el, stateKey, fallbackPos){
    if(!el) return;
    const rect = el.getBoundingClientRect();
    const saved = ED[stateKey];
    const hasSaved = saved && isFinitePosValue(saved.x) && isFinitePosValue(saved.y);
    const sourcePos = hasSaved ? {x: Number(saved.x), y: Number(saved.y)} : fallbackPos;
    if(!sourcePos) return;
    const p = clampPanelPos(sourcePos, rect.width || 260, rect.height || 36);
    setFloatingPanelPos(el, p, stateKey);
  }
  function quickAudioDefaultPos(el){
    const rect = el ? el.getBoundingClientRect() : null;
    const h = (rect && rect.height) || 36;
    const view = editorViewportRect();
    return {
      x: view.x + 10,
      y: view.y + view.h - h - 10,
    };
  }
  function restoreFloatingPanels(){
    if(!root || !panelWidth || !clampPanelPos || !setFloatingPanelPos) return;
    const qa = root.querySelector('#lkQuickAudio');
    if(!qa) return;
    clampFloatingPanelPos(qa, 'quickAudioPos', quickAudioDefaultPos(qa));
  }
  function wirePanelResize(){
    const left = $('#lkLeftResize'), right = $('#lkRightResize');
    const start = (side, e) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = panelWidth(side);
      const move = ev => {
        const dx = ev.clientX - startX;
        setPanelWidth(side, side === 'left' ? startW + dx : startW - dx);
      };
      const up = () => {
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
        status('Pannelli ridimensionati');
      };
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', up, true);
    };
    left.addEventListener('pointerdown', e => start('left', e));
    right.addEventListener('pointerdown', e => start('right', e));
  }
  function wireAssetsResize(){
    const h = $('#lkAssetsResize');
    if(!h) return;
    h.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startH = ED.assetsH;
      const move = ev => setAssetsHeight(startH + startY - ev.clientY);
      const up = () => {
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
        status('Assets dock resized');
      };
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', up, true);
    });
  }
  function wirePipResize(){
    const h = $('#lkPipResize');
    h.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = ED.pipW;
      const startRect = $('#lkPipFrame').getBoundingClientRect();
      const move = ev => {
        const aspect = cameraAspect();
        const nextW = Math.max(420, Math.min(1280, startW + startX - ev.clientX));
        const nextH = nextW / aspect;
        ED.pipW = nextW;
        ED.pipPos = clampPanelPos({x:startRect.right - nextW, y:startRect.bottom - nextH}, nextW, nextH);
      };
      const up = () => {
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
        status('Camera preview resized');
      };
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', up, true);
    });
  }
  function wireCinemaPreviewResize(){
    const h = $('#lkCinemaPreviewResize');
    const frame = $('#lkCinemaPreviewFrame');
    if(!h || !frame) return;
    h.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = ED.cinemaFloatPreviewW || 640;
      const startRect = frame.getBoundingClientRect();
      const move = ev => {
        const aspect = ED.cinemaFloatPreviewAspect === '21:9' ? 21 / 9 : (ED.cinemaFloatPreviewAspect === '4:3' ? 4 / 3 : (ED.cinemaFloatPreviewAspect === '1:1' ? 1 : (ED.cinemaFloatPreviewAspect === '9:16' ? 9 / 16 : 16 / 9)));
        const nextW = Math.max(360, Math.min(1280, startW + startX - ev.clientX));
        const nextH = nextW / aspect;
        ED.cinemaFloatPreviewW = nextW;
        ED.cinemaFloatPreviewPos = clampPanelPos({x:startRect.right - nextW, y:startRect.bottom - nextH}, nextW, nextH);
      };
      const up = () => {
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
        status('Timeline preview resized');
      };
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', up, true);
    });
  }
  function wireFloatingDrag(el, handle, stateKey, label){
    handle.addEventListener('pointerdown', e => {
      if(e.target.closest && e.target.closest('button,input,select')) return;
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const start = {x:r.left, y:r.top, mx:e.clientX, my:e.clientY};
      const move = ev => {
        setFloatingPanelPos(el, {
          x: start.x + ev.clientX - start.mx,
          y: start.y + ev.clientY - start.my,
        }, stateKey);
      };
      const up = () => {
        removeEventListener('pointermove', move, true);
        removeEventListener('pointerup', up, true);
        status(label + ' spostata');
      };
      addEventListener('pointermove', move, true);
      addEventListener('pointerup', up, true);
    });
  }
  function wireFloatingPanels(){
    wireFloatingDrag($('#lkQuickAudio'), $('#lkQuickAudio'), 'quickAudioPos', 'Toolbar audio');
    wireFloatingDrag($('#lkPipFrame'), $('#lkPipFrame .lk-pip-title'), 'pipPos', 'Player camera');
    const cinemaFrame = $('#lkCinemaPreviewFrame');
    if(cinemaFrame) wireFloatingDrag(cinemaFrame, $('#lkCinemaPreviewFrame .lk-pip-title'), 'cinemaFloatPreviewPos', 'Timeline preview');
  }

  return Object.freeze({
    panelWidth,
    setPanelWidth,
    setAssetsHeight,
    editorViewportRect,
    clampPanelPos,
    setFloatingPanelPos,
    restoreFloatingPanels,
    wirePanelResize,
    wireAssetsResize,
    wirePipResize,
    wireCinemaPreviewResize,
    wireFloatingPanels,
  });
}

window.LK_EDITOR_FLOATING_LAYOUT = Object.freeze({create});
})();
