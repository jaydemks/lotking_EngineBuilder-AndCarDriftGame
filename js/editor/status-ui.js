/* =========================================================
   LOT KING editor status/progress UI
   Owns footer status text, progress work pill and loading overlay.
   ========================================================= */
(function(){
'use strict';

function create(opts){
  opts = opts || {};
  const root = opts.root;
  const $ = sel => root.querySelector(sel);

  let statusTimer = null;
  let workTimer = null;
  let workSeq = 0;
  let workActive = 0;
  let loadingToken = 0;
  let assetToken = 0;

  function status(msg){
    $('#lkStatusRight').textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { $('#lkStatusRight').textContent = ''; }, 4000);
  }

  function hideWork(token){
    if(token && token !== workActive) return;
    const work = $('#lkStatusWork');
    if(!work) return;
    if(token === workActive) workActive = 0;
    work.classList.remove('open', 'lk-status-loading', 'lk-status-success', 'lk-status-error', 'lk-status-warning');
    $('#lkStatusWorkTitle').textContent = '';
    $('#lkStatusWorkStep').textContent = '';
    $('#lkStatusWorkPct').textContent = '';
    $('#lkStatusWorkFill').style.width = '0%';
  }

  function showWork(token, title, pct, step, state){
    if(!token) token = workActive;
    if(token !== workActive) return;
    const work = $('#lkStatusWork');
    const t = $('#lkStatusWorkTitle');
    const s = $('#lkStatusWorkStep');
    const p = $('#lkStatusWorkPct');
    const f = $('#lkStatusWorkFill');
    if(!work || !t || !s || !p || !f) return;
    work.classList.remove('open', 'lk-status-loading', 'lk-status-success', 'lk-status-error', 'lk-status-warning');
    work.classList.add('open', 'lk-status-' + (state || 'loading'));
    t.textContent = title || 'Processo in corso';
    s.textContent = step || '';
    const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
    p.textContent = clamped ? (Math.round(clamped) + '%') : '';
    f.style.width = clamped + '%';
  }

  function beginWork(title, step, state){
    const token = ++workSeq;
    workActive = token;
    clearTimeout(workTimer);
    showWork(token, title, 0, step, state || 'loading');
    return token;
  }

  function updateWork(token, pct, step, state, title){
    if(!token) return;
    const t = title ? title : ($('#lkStatusWorkTitle') ? $('#lkStatusWorkTitle').textContent : 'Processo in corso');
    showWork(token, t, pct, step, state || 'loading');
  }

  function finishWork(token, msg, step, state){
    if(!token || token !== workActive) return;
    const finalState = state || 'success';
    showWork(token, msg || (finalState === 'success' ? 'Completato' : 'Errore'), 100, step || '', finalState);
    clearTimeout(workTimer);
    if(finalState === 'success'){
      workTimer = setTimeout(() => hideWork(token), 1800);
      return;
    }
    if(finalState === 'warning'){
      workTimer = setTimeout(() => hideWork(token), 2800);
    }
  }

  function setEditorLoading(open, title, name, pct, step){
    const overlay = $('#lkLevelLoading');
    const fill = $('#lkLevelLoadingFill');
    const label = $('#lkLevelLoadingName');
    const sub = $('#lkLevelLoadingStep');
    const head = overlay && overlay.querySelector('.lk-level-loading-title');
    if(!overlay || !fill || !label || !sub) return;
    const progressTitle = [title || 'LOADING', name].filter(Boolean).join(' · ');
    const progressPct = Math.max(0, Math.min(100, Number.isFinite(+pct) ? +pct : 0));
    if(open){
      if(!loadingToken) loadingToken = beginWork(progressTitle, step || 'Avvio', 'loading');
      updateWork(loadingToken, progressPct, step || 'Avvio', 'loading', progressTitle);
    } else if(loadingToken){
      finishWork(loadingToken, progressTitle + ' · completato', step || 'Completato', 'success');
      loadingToken = 0;
    }
    overlay.classList.toggle('open', !!open);
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    if(head) head.textContent = title || 'LOADING';
    if(name) label.textContent = name;
    fill.style.width = progressPct + '%';
    if(step) sub.textContent = step;
  }

  function setLevelLoading(open, name, pct, step){
    setEditorLoading(open, 'LOADING LEVEL', name, pct, step);
  }

  function setAssetLoading(open, name, pct, step){
    const tokenTitle = ['IMPORTING ASSETS', name].filter(Boolean).join(' · ');
    if(open){
      if(!assetToken) assetToken = beginWork(tokenTitle, step || 'Avvio', 'loading');
      else updateWork(assetToken, pct || 0, step || 'Avvio', 'loading', tokenTitle);
    } else if(assetToken){
      finishWork(assetToken, 'Importazione asset completata', step || 'Completato', 'success');
      assetToken = 0;
    }
    setEditorLoading(open, 'IMPORTING ASSETS', name, pct, step);
  }

  return {
    status,
    beginWork,
    updateWork,
    finishWork,
    setEditorLoading,
    setLevelLoading,
    setAssetLoading,
  };
}

window.LK_EDITOR_STATUS_UI = Object.freeze({create});
})();
