/* =========================================================
   LOT KING — EDITOR INSPECTOR UI
   Small DOM builders shared by inspector sections.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const el = deps.el;
  const SECTION_STORE_KEY = 'lotking.editor.inspectorSections.v1';

  function readSectionState(){
    try { return JSON.parse(localStorage.getItem(SECTION_STORE_KEY) || '{}') || {}; }
    catch(err){ return {}; }
  }

  function writeSectionState(state){
    try { localStorage.setItem(SECTION_STORE_KEY, JSON.stringify(state || {})); }
    catch(err){}
  }

  function section(title, open){
    const saved = readSectionState();
    const hasSaved = Object.prototype.hasOwnProperty.call(saved, title);
    const isOpen = hasSaved ? !!saved[title] : open === true;
    const s = el('<div class="lk-sec' + (isOpen ? '' : ' closed') + '"><div class="lk-sec-h">' + title + '</div><div class="lk-sec-b"></div></div>');
    s.querySelector('.lk-sec-h').addEventListener('click', () => {
      s.classList.toggle('closed');
      const next = readSectionState();
      next[title] = !s.classList.contains('closed');
      writeSectionState(next);
    });
    return {root: s, body: s.querySelector('.lk-sec-b')};
  }

  function numRow(label, value, step, oninput){
    const r = el('<div class="lk-row"><label>' + label + '</label><input type="number" step="' + (step || .1) + '"></div>');
    const i = r.querySelector('input');
    i.value = (+value).toFixed(3).replace(/\.?0+$/, '') || 0;
    i.addEventListener('input', () => oninput(parseFloat(i.value) || 0));
    return {root: r, input: i};
  }

  function sliderRow(label, value, min, max, step, oninput, fmt){
    const r = el('<div class="lk-row lk-slider"><label>' + label + '</label><input type="range"><input class="lk-slider-value" type="number" title="Exact value / manual override"><output></output></div>');
    const i = r.querySelector('input[type="range"]'), n = r.querySelector('.lk-slider-value'), o = r.querySelector('output');
    i.min = min; i.max = max; i.step = step; i.value = value;
    n.step = step;
    n.value = value;
    const baseStep = Number(step) || .01;
    const fineStep = Math.min(baseStep, baseStep >= .1 ? .01 : .001);
    let dragValue = Number(value);
    let dragPointer = null;
    let dragActive = false;
    const clampValue = v => Math.max(Number(min), Math.min(Number(max), v));
    const show = v => {
      const shown = fmt ? fmt(v) : (+v).toFixed(step < .01 ? 4 : 2).replace(/\.?0+$/, '');
      o.textContent = shown;
      if(document.activeElement !== n) n.value = Number.isFinite(Number(v)) ? (+v).toFixed(step < .01 ? 4 : 3).replace(/\.?0+$/, '') : v;
    };
    const applyStepMode = fine => {
      const s = fine ? fineStep : baseStep;
      i.step = s;
      n.step = s;
    };
    show(value);
    i.addEventListener('pointerdown', e => {
      r.dispatchEvent(new CustomEvent('lk-slider-edit-start'));
      applyStepMode(!!e.shiftKey);
      dragActive = true;
      dragPointer = e.clientX;
      dragValue = Number(i.value);
      if(i.setPointerCapture) i.setPointerCapture(e.pointerId);
    });
    i.addEventListener('pointermove', e => {
      if(!dragActive || dragPointer == null) return;
      const w = Math.max(80, i.getBoundingClientRect().width || 160);
      const range = Number(max) - Number(min);
      const slow = e.shiftKey ? .12 : .32;
      const v = clampValue(dragValue + ((e.clientX - dragPointer) / w) * range * slow);
      i.value = v;
      show(v);
      oninput(v);
    });
    i.addEventListener('keydown', e => applyStepMode(!!e.shiftKey));
    i.addEventListener('keyup', e => applyStepMode(!!e.shiftKey));
    i.addEventListener('pointerup', e => {
      dragActive = false;
      dragPointer = null;
      dragValue = Number(i.value);
      if(i.releasePointerCapture) try { i.releasePointerCapture(e.pointerId); } catch(err){}
      applyStepMode(false);
      r.dispatchEvent(new CustomEvent('lk-slider-edit-end'));
    });
    i.addEventListener('blur', () => { if(dragActive) r.dispatchEvent(new CustomEvent('lk-slider-edit-end')); dragActive = false; dragPointer = null; applyStepMode(false); });
    i.addEventListener('input', e => {
      if(dragActive) return;
      applyStepMode(!!e.shiftKey);
      const v = parseFloat(i.value);
      show(v);
      oninput(v);
    });
    n.addEventListener('input', () => {
      const v = parseFloat(n.value);
      if(!Number.isFinite(v)) return;
      if(v >= Number(min) && v <= Number(max)) i.value = v;
      show(v);
      oninput(v);
    });
    n.addEventListener('focus', () => r.dispatchEvent(new CustomEvent('lk-slider-edit-start')));
    n.addEventListener('change', () => r.dispatchEvent(new CustomEvent('lk-slider-edit-end')));
    n.addEventListener('blur', () => r.dispatchEvent(new CustomEvent('lk-slider-edit-end')));
    return {root: r, input: i, valueInput: n, output: o};
  }

  function colorRow(label, hex, oninput){
    const r = el('<div class="lk-row"><label>' + label + '</label><input type="color"></div>');
    const i = r.querySelector('input');
    i.value = '#' + ('000000' + (hex >>> 0).toString(16)).slice(-6);
    i.addEventListener('input', () => oninput(parseInt(i.value.slice(1), 16)));
    return {root: r};
  }

  function checkRow(label, checked, oninput){
    const r = el('<div class="lk-row lk-check"><label>' + label + '</label><input type="checkbox"></div>');
    const i = r.querySelector('input');
    i.checked = !!checked;
    i.addEventListener('change', () => oninput(i.checked));
    return {root: r, input: i};
  }

  function btnRow(defs){
    const r = el('<div class="lk-btnrow"></div>');
    for(const d of defs){
      const b = el('<button' + (d.danger ? ' class="danger"' : '') + '>' + d.label + '</button>');
      b.addEventListener('click', d.action);
      r.appendChild(b);
    }
    return r;
  }

  function selectRow(label, value, options, oninput){
    const r = el('<div class="lk-row"><label>' + label + '</label><select></select></div>');
    const s = r.querySelector('select');
    for(const opt of options){
      const o = el('<option value="' + opt.value + '">' + opt.label + '</option>');
      s.appendChild(o);
    }
    s.value = value;
    s.addEventListener('change', () => oninput(s.value));
    return {root:r, input:s};
  }

  function textureDrop(label, desc, onFile){
    const d = el('<div class="lk-drop" tabindex="0"><strong>' + label + '</strong><span>' + desc + '</span></div>');
    const input = el('<input type="file" accept="image/*" style="display:none">');
    const pick = f => { if(f) onFile(f); };
    d.appendChild(input);
    d.addEventListener('click', () => input.click());
    d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('drag'); });
    d.addEventListener('dragleave', () => d.classList.remove('drag'));
    d.addEventListener('drop', e => {
      e.preventDefault(); d.classList.remove('drag');
      pick(e.dataTransfer.files && e.dataTransfer.files[0]);
    });
    input.addEventListener('change', e => {
      pick(e.target.files && e.target.files[0]);
      e.target.value = '';
    });
    return d;
  }

  return Object.freeze({section, numRow, sliderRow, colorRow, checkRow, btnRow, selectRow, textureDrop});
}

window.LK_EDITOR_INSPECTOR_UI = Object.freeze({create});
})();
