/* =========================================================
   LOT KING editor dialogs
   Shared confirm/prompt modal built on #lkConfirmOverlay.
   ========================================================= */
(function(){
'use strict';

function create(opts){
  opts = opts || {};

  function parts(){
    const overlay = document.getElementById('lkConfirmOverlay');
    return {
      overlay,
      title: document.getElementById('lkConfirmTitle'),
      message: document.getElementById('lkConfirmMessage'),
      ok: document.getElementById('lkConfirmOk'),
      cancel: document.getElementById('lkConfirmCancel'),
    };
  }

  function liftOverlay(overlay){
    if(overlay && overlay.parentNode !== document.body) document.body.appendChild(overlay);
  }

  function clearInput(overlay){
    const oldInput = overlay && overlay.querySelector('.lk-confirm-input');
    if(oldInput) oldInput.remove();
  }

  function confirm(opts){
    const cfg = opts || {};
    const p = parts();
    if(!p.overlay || !p.title || !p.message || !p.ok || !p.cancel) return Promise.resolve(false);
    liftOverlay(p.overlay);
    p.title.textContent = cfg.title || 'Confirm action';
    p.message.textContent = cfg.message || 'Are you sure?';
    p.ok.textContent = cfg.okText || 'Delete';
    p.ok.classList.toggle('danger', cfg.danger !== false);
    clearInput(p.overlay);
    p.overlay.classList.add('open');
    p.overlay.setAttribute('aria-hidden', 'false');
    return new Promise(resolve => {
      const close = value => {
        p.overlay.classList.remove('open');
        p.overlay.setAttribute('aria-hidden', 'true');
        p.ok.removeEventListener('click', yes);
        p.cancel.removeEventListener('click', no);
        p.overlay.removeEventListener('pointerdown', outside);
        removeEventListener('keydown', key, true);
        resolve(value);
      };
      const yes = () => close(true);
      const no = () => close(false);
      const outside = e => { if(e.target === p.overlay) close(false); };
      const key = e => {
        if(e.key === 'Escape'){ e.preventDefault(); close(false); }
      };
      p.ok.addEventListener('click', yes);
      p.cancel.addEventListener('click', no);
      p.overlay.addEventListener('pointerdown', outside);
      addEventListener('keydown', key, true);
      p.cancel.focus();
    });
  }

  function prompt(opts){
    const cfg = opts || {};
    const p = parts();
    if(!p.overlay || !p.title || !p.message || !p.ok || !p.cancel) return Promise.resolve(null);
    liftOverlay(p.overlay);
    p.title.textContent = cfg.title || 'Editor input';
    p.message.textContent = cfg.message || '';
    p.ok.textContent = cfg.okText || 'OK';
    p.ok.classList.toggle('danger', false);
    clearInput(p.overlay);
    const input = document.createElement(Array.isArray(cfg.options) ? 'select' : 'input');
    input.className = 'lk-confirm-input';
    if(Array.isArray(cfg.options)){
      cfg.options.forEach(option => {
        const item = document.createElement('option');
        item.value = option.value;
        item.textContent = option.label;
        input.appendChild(item);
      });
      input.value = cfg.value || (cfg.options[0] && cfg.options[0].value) || '';
    } else {
      input.type = cfg.type || 'text';
      input.value = cfg.value || '';
      input.placeholder = cfg.placeholder || '';
    }
    p.message.insertAdjacentElement('afterend', input);
    p.overlay.classList.add('open');
    p.overlay.setAttribute('aria-hidden', 'false');
    return new Promise(resolve => {
      const close = value => {
        p.overlay.classList.remove('open');
        p.overlay.setAttribute('aria-hidden', 'true');
        input.remove();
        p.ok.removeEventListener('click', yes);
        p.cancel.removeEventListener('click', no);
        p.overlay.removeEventListener('pointerdown', outside);
        removeEventListener('keydown', key, true);
        resolve(value);
      };
      const yes = () => close(input.value);
      const no = () => close(null);
      const outside = e => { if(e.target === p.overlay) close(null); };
      const key = e => {
        if(e.key === 'Escape'){ e.preventDefault(); close(null); }
        if(e.key === 'Enter'){ e.preventDefault(); close(input.value); }
      };
      p.ok.addEventListener('click', yes);
      p.cancel.addEventListener('click', no);
      p.overlay.addEventListener('pointerdown', outside);
      addEventListener('keydown', key, true);
      setTimeout(() => { input.focus(); if(input.select) input.select(); }, 0);
    });
  }

  return {confirm, prompt};
}

window.LK_EDITOR_DIALOGS = Object.freeze({create});
})();
