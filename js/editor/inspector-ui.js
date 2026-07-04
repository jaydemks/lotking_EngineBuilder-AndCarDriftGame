/* =========================================================
   LOT KING — EDITOR INSPECTOR UI
   Small DOM builders shared by inspector sections.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const el = deps.el;

  function section(title, open){
    const s = el('<div class="lk-sec' + (open === false ? ' closed' : '') + '"><div class="lk-sec-h">' + title + '</div><div class="lk-sec-b"></div></div>');
    s.querySelector('.lk-sec-h').addEventListener('click', () => s.classList.toggle('closed'));
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
    const r = el('<div class="lk-row lk-slider"><label>' + label + '</label><input type="range"><output></output></div>');
    const i = r.querySelector('input'), o = r.querySelector('output');
    i.min = min; i.max = max; i.step = step; i.value = value;
    const show = v => o.textContent = fmt ? fmt(v) : (+v).toFixed(step < .01 ? 4 : 2).replace(/\.?0+$/, '');
    show(value);
    i.addEventListener('input', () => { const v = parseFloat(i.value); show(v); oninput(v); });
    return {root: r, input: i};
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
    return {root: r};
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
