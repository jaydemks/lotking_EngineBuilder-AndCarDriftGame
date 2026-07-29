/* =========================================================
   LOT KING — CHARACTER SOUND DESIGNER (editor overlay)

   The on-foot counterpart of the Engine Sound Designer: edits a Character
   Sound Set — footsteps per surface, weapon audio per class, body foley — and
   previews every slot through the real runtime path, so what you hear here is
   what plays in game.

   Every slot is procedural by default. Loading a file into a slot makes the
   sample win; clearing the field returns that slot to its recipe. Nothing is
   ever silent because a path is wrong.

   Loaded on demand by editor.js (openCharacterSoundDesigner).
   ========================================================= */
(function(){
'use strict';

if(window.LK_CHARACTER_SOUND_DESIGNER) return;

const GAME = window.LOT_KING;
const STORE = window.LK_STORE;
const AUDIO = window.LK_RUNTIME_CHARACTER_AUDIO;
const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

if(!AUDIO || !STORE || !STORE.characterSoundSets){
  console.warn('LotKing Character Sound Designer: runtime audio non disponibile');
  return;
}

// ------------------------------------------------ state
let work = null;            // working copy of the edited set
let setId = null;
let dirty = false;
let tab = 'footsteps';
let weaponClass = 'rifle';

function runtime(){ return GAME && GAME.systems ? GAME.systems.characterAudio : null; }
// Live apply: the preview buttons drive the real runtime, so the editor never
// grows a second copy of the synthesis that could disagree with the game.
function applyLive(){
  const rt = runtime();
  if(!rt) return;
  rt.setSet(work);
  // Pawns that name this set by id cache their own resolved copy, so the cache
  // has to be dropped or a per-character set would keep the pre-edit sound.
  if(rt.invalidate) rt.invalidate(setId);
}

// ------------------------------------------------ live audition
//
// Tuning a sound by ear means hearing it WHILE the slider moves. A single
// preview is not enough for that, so every row can be put on a loop: the same
// slot fires on a timer and every parameter change is audible on the next
// repetition. Exactly one loop runs at a time, because two overlapping loops
// tell you nothing about either.
const loop = {timer:null, key:''};
function stopLoop(){
  if(loop.timer) clearInterval(loop.timer);
  loop.timer = null;
  loop.key = '';
  if(root) root.querySelectorAll('.cs-loop').forEach(button => button.classList.remove('cs-on'));
}
function toggleLoop(key, preview, button){
  const wasRunning = loop.key === key;
  stopLoop();
  if(wasRunning) return false;
  loop.key = key;
  applyLive();
  preview();
  loop.timer = setInterval(() => { applyLive(); preview(); }, 900);
  if(button) button.classList.add('cs-on');
  return true;
}
function markDirty(){ dirty = true; applyLive(); render(); }

// ------------------------------------------------ styles
const STYLE_ID = 'lkCharSoundStyles';
function installStyles(){
  if(document.getElementById(STYLE_ID)) return;
  const css = `
#lkCharSound{position:fixed;inset:auto 0 0 0;margin:auto;top:50%;left:50%;transform:translate(-50%,-50%);
  width:min(1120px,calc(100vw - 40px));max-height:min(88vh,900px);z-index:10040;display:none;
  flex-direction:column;pointer-events:auto;border:1px solid #35425a;border-radius:12px;
  background:rgba(9,13,20,.98);box-shadow:0 26px 80px rgba(0,0,0,.75);color:#dfe5f1;
  font:13px/1.45 'Segoe UI',Arial,sans-serif;overflow:hidden}
#lkCharSound.open{display:flex}
#lkCharSound .cs-head{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid #263143}
#lkCharSound .cs-head b{font-size:13px;letter-spacing:1.6px}
#lkCharSound .cs-head .cs-sub{font-size:11px;opacity:.6}
#lkCharSound .cs-spacer{flex:1}
#lkCharSound select,#lkCharSound input[type=text]{background:#111926;color:#dfe5f1;border:1px solid #2b3446;
  border-radius:7px;height:27px;padding:0 7px;font:inherit}
#lkCharSound button{background:#151d2b;color:#dfe5f1;border:1px solid #2b3446;border-radius:7px;
  height:27px;padding:0 10px;font:inherit;cursor:pointer}
#lkCharSound button:hover{border-color:#4be3a0;color:#4be3a0}
#lkCharSound button.cs-on{border-color:#4be3a0;color:#4be3a0;background:rgba(75,227,160,.12)}
#lkCharSound .cs-tabs{display:flex;gap:6px;padding:10px 16px 0}
#lkCharSound .cs-body{flex:1;min-height:0;overflow-y:auto;padding:12px 16px 18px}
#lkCharSound .cs-note{font-size:11px;opacity:.6;margin:0 0 10px}
#lkCharSound .cs-row{display:grid;grid-template-columns:132px 68px repeat(3,minmax(96px,1fr)) 74px;
  gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(120,140,175,.12)}
#lkCharSound .cs-row.cs-head-row{opacity:.55;font-size:10.5px;letter-spacing:.8px;border-bottom-color:#2b3446}
#lkCharSound .cs-name{font-size:12px}
#lkCharSound .cs-name small{display:block;opacity:.5;font-size:10px}
#lkCharSound .cs-field{display:flex;align-items:center;gap:6px}
#lkCharSound .cs-field input[type=range]{flex:1;min-width:0}
#lkCharSound .cs-field .cs-val{width:38px;text-align:right;font-size:10.5px;opacity:.7}
#lkCharSound .cs-src{font-size:10px;opacity:.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#lkCharSound .cs-globals{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:12px}
#lkCharSound .cs-globals label{display:flex;align-items:center;gap:6px;font-size:11.5px}
#lkCharSound .cs-dirty{color:#f4c86a;font-size:11px;display:none}
#lkCharSound .cs-dirty.show{display:inline}
#lkCharSound .cs-rack{display:grid;gap:10px}
#lkCharSound .cs-rack-card{border:1px solid #29364b;border-radius:11px;overflow:hidden;
  background:linear-gradient(145deg,rgba(23,31,45,.96),rgba(12,18,28,.96));box-shadow:inset 0 1px rgba(255,255,255,.025)}
#lkCharSound .cs-rack-card.fx{border-color:#5e455f;background:
  radial-gradient(circle at 88% 15%,rgba(235,85,126,.14),transparent 32%),
  linear-gradient(145deg,rgba(35,25,40,.98),rgba(12,18,28,.98))}
#lkCharSound .cs-rack-card .cs-row{padding:9px 11px;border-bottom:0}
#lkCharSound .cs-signal{display:flex;align-items:center;gap:6px;padding:0 11px 9px;color:#7e91ac;
  font-size:9px;letter-spacing:.7px;text-transform:uppercase}
#lkCharSound .cs-signal i{font-style:normal;border:1px solid #314057;border-radius:999px;padding:3px 7px}
#lkCharSound .cs-signal i.on{color:#62e6ad;border-color:#3b8068;background:rgba(75,227,160,.08)}
#lkCharSound .cs-signal b{font-weight:400;color:#47556b}
#lkCharSound .cs-recipe{border-top:1px solid rgba(120,140,175,.13)}
#lkCharSound .cs-recipe summary{cursor:pointer;list-style:none;padding:8px 11px;color:#8fa4bf;
  font-size:10px;letter-spacing:1.1px;user-select:none}
#lkCharSound .cs-recipe summary::-webkit-details-marker{display:none}
#lkCharSound .cs-recipe[open] summary{color:#62e6ad;background:rgba(75,227,160,.035)}
#lkCharSound .cs-modules{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:0 11px 11px}
#lkCharSound .cs-module{min-width:0;border:1px solid #2a374b;border-radius:9px;padding:9px;background:rgba(7,11,18,.6)}
#lkCharSound .cs-module.off{opacity:.48}
#lkCharSound .cs-module-head{display:flex;align-items:center;gap:7px;margin-bottom:8px;color:#a9bad0;
  font-size:10px;font-weight:700;letter-spacing:1px}
#lkCharSound .cs-module-head span{flex:1}
#lkCharSound .cs-module-head button{height:22px;padding:0 7px;font-size:9px}
#lkCharSound .cs-param{display:grid;grid-template-columns:70px 1fr 42px;gap:6px;align-items:center;margin:5px 0;
  font-size:9.5px;color:#7f91aa}
#lkCharSound .cs-param input[type=range]{min-width:0;width:100%}
#lkCharSound .cs-param output{text-align:right;color:#b8c6d8;font-variant-numeric:tabular-nums}
#lkCharSound .cs-param select{width:100%;height:23px;font-size:9.5px}
#lkCharSound .cs-add-modules{display:flex;gap:7px;padding:0 11px 11px}
#lkCharSound .cs-add-modules button{height:24px;color:#8ea0b8;font-size:9.5px;border-style:dashed}
#lkCharSound .cs-fx-intro{display:grid;grid-template-columns:auto 1fr;gap:14px;align-items:center;margin:0 0 13px;
  padding:12px 14px;border:1px solid #4b3854;border-radius:11px;background:linear-gradient(90deg,rgba(209,62,105,.1),transparent)}
#lkCharSound .cs-fx-pulse{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;font-size:25px;
  background:radial-gradient(circle,#ff8b77 0 8%,#d83e68 9% 16%,rgba(216,62,104,.2) 17% 42%,transparent 43%);
  box-shadow:0 0 30px rgba(216,62,104,.22)}
#lkCharSound .cs-fx-intro b{display:block;color:#f0b1bf;letter-spacing:.8px}
#lkCharSound .cs-fx-intro small{display:block;color:#9c8ba3;margin-top:3px}
@media(max-width:760px){
  #lkCharSound .cs-row{grid-template-columns:112px 54px repeat(2,minmax(82px,1fr)) 68px}
  #lkCharSound .cs-row>:nth-child(5){display:none}
  #lkCharSound .cs-modules{grid-template-columns:1fr}
}
`;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = css;
  document.head.appendChild(tag);
}

// ------------------------------------------------ DOM
let root = null;
function el(tag, cls, text){
  const node = document.createElement(tag);
  if(cls) node.className = cls;
  if(text != null) node.textContent = text;
  return node;
}

function buildRoot(){
  installStyles();
  root = el('div');
  root.id = 'lkCharSound';
  root.innerHTML = `
    <div class="cs-head">
      <div><b>CHARACTER SOUND DESIGNER</b>
        <div class="cs-sub">${tr('Footsteps, weapons and body foley — procedural by default', 'Passi, armi e foley — procedurale di default')}</div></div>
      <span class="cs-dirty" id="csDirty">● ${tr('unsaved', 'non salvato')}</span>
      <div class="cs-spacer"></div>
      <select id="csSet"></select>
      <button id="csNew">${tr('New', 'Nuovo')}</button>
      <button id="csDup">${tr('Duplicate', 'Duplica')}</button>
      <button id="csSave">${tr('Save', 'Salva')}</button>
      <button id="csClose">✕</button>
    </div>
    <div class="cs-tabs">
      <button data-tab="footsteps">${tr('Footsteps', 'Passi')}</button>
      <button data-tab="weapons">${tr('Weapons', 'Armi')}</button>
      <button data-tab="effects">${tr('Explosions / FX', 'Esplosioni / FX')}</button>
      <button data-tab="body">${tr('Body', 'Corpo')}</button>
    </div>
    <div class="cs-body" id="csBody"></div>`;
  document.body.appendChild(root);

  root.querySelector('#csClose').addEventListener('click', close);
  root.querySelector('#csSave').addEventListener('click', save);
  root.querySelector('#csNew').addEventListener('click', () => {
    const name = prompt(tr('Name for the new Character Sound Set', 'Nome del nuovo Character Sound Set'), tr('My Foley', 'Foley personale'));
    if(!name) return;
    const id = STORE.characterSoundSets.create(name, AUDIO.defaultSet());
    if(id) load(id);
  });
  root.querySelector('#csDup').addEventListener('click', () => {
    if(!setId) return;
    const id = STORE.characterSoundSets.duplicate(setId);
    if(id) load(id);
  });
  root.querySelector('#csSet').addEventListener('change', event => load(event.target.value));
  root.querySelectorAll('.cs-tabs button').forEach(button => {
    button.addEventListener('click', () => { tab = button.dataset.tab; render(); });
  });
}

// ------------------------------------------------ slot rows
function slider(value, min, max, step, onChange, format){
  const wrap = el('div', 'cs-field');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min; input.max = max; input.step = step; input.value = value;
  const readout = el('span', 'cs-val', format ? format(value) : Number(value).toFixed(2));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    readout.textContent = format ? format(v) : v.toFixed(2);
    onChange(v);
  });
  wrap.appendChild(input);
  wrap.appendChild(readout);
  return wrap;
}

function headerRow(){
  const row = el('div', 'cs-row cs-head-row');
  [tr('Slot', 'Slot'), tr('On', 'On'), tr('Volume', 'Volume'), tr('Pitch', 'Pitch'),
    tr('Random', 'Random'), ''].forEach(text => row.appendChild(el('div', null, text)));
  return row;
}

// One editable slot. `preview` plays it through the runtime.
function slotRow(label, hint, slot, preview){
  const row = el('div', 'cs-row');
  const name = el('div', 'cs-name');
  name.appendChild(document.createTextNode(label));
  if(hint) name.appendChild(el('small', null, hint));
  row.appendChild(name);

  const toggle = el('button', slot.enabled ? 'cs-on' : null, slot.enabled ? 'ON' : 'OFF');
  toggle.addEventListener('click', () => { slot.enabled = !slot.enabled; markDirty(); });
  row.appendChild(toggle);

  row.appendChild(slider(slot.volume, 0, 2, .01, v => { slot.volume = v; applyLive(); dirty = true; showDirty(); }));
  row.appendChild(slider(slot.pitch, .25, 3, .01, v => { slot.pitch = v; applyLive(); dirty = true; showDirty(); }));
  row.appendChild(slider(slot.pitchRandom, 0, .6, .01, v => { slot.pitchRandom = v; applyLive(); dirty = true; showDirty(); }));

  const actions = el('div', 'cs-field');
  const play = el('button', null, '▶');
  play.title = tr('Preview once', 'Ascolta una volta');
  play.addEventListener('click', () => { applyLive(); preview(); });
  actions.appendChild(play);

  // Loop: repeats this slot while the sliders move, so the sound is tuned by
  // ear instead of by guessing and re-clicking.
  const repeat = el('button', 'cs-loop', '⟳');
  repeat.title = tr('Loop while tuning', 'Ripeti mentre regoli');
  repeat.addEventListener('click', () => toggleLoop(label + ':' + (hint || ''), preview, repeat));
  actions.appendChild(repeat);

  // Optional sample. An empty field is not a missing sound: it is the recipe.
  const file = el('button', slot.src ? 'cs-on' : null, slot.src ? '♪' : '＋');
  file.title = slot.src
    ? tr('Sample loaded — click to clear and return to the procedural recipe', 'Campione caricato — clic per rimuoverlo e tornare alla ricetta procedurale')
    : tr('Load an audio file for this slot', 'Carica un file audio per questo slot');
  file.addEventListener('click', () => {
    if(slot.src){ slot.src = ''; markDirty(); return; }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'audio/*';
    picker.addEventListener('change', () => {
      const chosen = picker.files && picker.files[0];
      if(!chosen) return;
      file.disabled = true;
      file.textContent = '…';
      const finish = src => {
        slot.src = src;
        file.disabled = false;
        markDirty();
      };
      if(window.LK_ASSET_BLOBS && window.LK_ASSET_BLOBS.put){
        const key = 'character_sfx_' + Date.now().toString(36) + '_' +
          chosen.name.replace(/[^a-z0-9.]+/gi, '_');
        window.LK_ASSET_BLOBS.put(key, chosen)
          .then(() => finish('blob:' + key))
          .catch(() => {
            file.disabled = false;
            file.textContent = '＋';
          });
        return;
      }
      // Standalone fallback: data URLs remain serialisable with the set. The
      // full editor normally takes the IndexedDB path above.
      const reader = new FileReader();
      reader.onload = () => finish(String(reader.result || ''));
      reader.onerror = () => { file.disabled = false; file.textContent = '＋'; };
      reader.readAsDataURL(chosen);
    });
    picker.click();
  });
  actions.appendChild(file);
  row.appendChild(actions);
  return row;
}

function liveEdit(){
  dirty = true;
  applyLive();
  showDirty();
}

function recipeParam(target, key, label, min, max, step){
  const row = el('label', 'cs-param');
  row.appendChild(el('span', null, label));
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = target[key];
  const output = document.createElement('output');
  const write = () => {
    const value = Number(input.value);
    output.textContent = Math.abs(value) >= 100 ? String(Math.round(value)) : value.toFixed(step < .01 ? 3 : 2);
  };
  write();
  input.addEventListener('input', () => {
    target[key] = Number(input.value);
    write();
    liveEdit();
  });
  row.appendChild(input);
  row.appendChild(output);
  return row;
}

function recipeChoice(target, key, label, values){
  const row = el('label', 'cs-param');
  row.appendChild(el('span', null, label));
  const select = document.createElement('select');
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    option.selected = target[key] === value;
    select.appendChild(option);
  });
  select.addEventListener('change', () => { target[key] = select.value; liveEdit(); });
  row.appendChild(select);
  row.appendChild(el('output', null, ''));
  return row;
}

const MODULE_DEFAULTS = Object.freeze({
  noise:{type:'lowpass', freq:900, q:.8, decay:.3, level:.7, sweep:-400},
  tone:{freq:90, freqEnd:35, decay:.5, level:.7, wave:'sine'},
  ring:{freq:900, q:6, decay:.3, level:.25},
});

function recipeModule(key, data){
  const names = {
    noise:tr('NOISE / IMPACT', 'NOISE / IMPATTO'),
    tone:tr('SUB / TONE', 'SUB / TONO'),
    ring:tr('RESONANCE', 'RISONANZA'),
  };
  const module = el('section', 'cs-module' + (data.enabled === false ? ' off' : ''));
  module.dataset.module = key;
  const head = el('div', 'cs-module-head');
  head.appendChild(el('span', null, names[key]));
  const enabled = el('button', data.enabled === false ? null : 'cs-on', data.enabled === false ? 'OFF' : 'ON');
  enabled.addEventListener('click', () => {
    data.enabled = data.enabled === false;
    enabled.textContent = data.enabled ? 'ON' : 'OFF';
    enabled.classList.toggle('cs-on', data.enabled);
    module.classList.toggle('off', !data.enabled);
    const chip = module.closest('.cs-rack-card') && module.closest('.cs-rack-card').querySelector('[data-signal="' + key + '"]');
    if(chip) chip.classList.toggle('on', data.enabled);
    liveEdit();
  });
  head.appendChild(enabled);
  module.appendChild(head);

  if(key === 'noise'){
    module.appendChild(recipeChoice(data, 'type', tr('Filter', 'Filtro'), ['lowpass','bandpass','highpass']));
    module.appendChild(recipeParam(data, 'freq', tr('Cutoff', 'Taglio'), 40, 12000, 10));
    module.appendChild(recipeParam(data, 'q', 'Q', .1, 20, .1));
    module.appendChild(recipeParam(data, 'decay', tr('Decay', 'Coda'), .02, 2.5, .01));
    module.appendChild(recipeParam(data, 'level', tr('Level', 'Livello'), 0, 2, .01));
    module.appendChild(recipeParam(data, 'sweep', 'Sweep', -8000, 8000, 10));
  } else if(key === 'tone'){
    module.appendChild(recipeChoice(data, 'wave', tr('Wave', 'Onda'), ['sine','triangle','sawtooth','square']));
    module.appendChild(recipeParam(data, 'freq', tr('Start Hz', 'Hz iniz.'), 20, 1200, 1));
    module.appendChild(recipeParam(data, 'freqEnd', tr('End Hz', 'Hz finali'), 20, 1200, 1));
    module.appendChild(recipeParam(data, 'decay', tr('Decay', 'Coda'), .02, 3, .01));
    module.appendChild(recipeParam(data, 'level', tr('Level', 'Livello'), 0, 2, .01));
  } else {
    module.appendChild(recipeParam(data, 'freq', tr('Frequency', 'Frequenza'), 40, 10000, 10));
    module.appendChild(recipeParam(data, 'q', 'Q', 1, 24, .1));
    module.appendChild(recipeParam(data, 'decay', tr('Decay', 'Coda'), .02, 3, .01));
    module.appendChild(recipeParam(data, 'level', tr('Level', 'Livello'), 0, 2, .01));
  }
  return module;
}

function recipeEditor(slot, expanded){
  // Recipes may originate from frozen shipped defaults or a stored JSON set.
  // A private clone makes every rack independently editable.
  slot.recipe = JSON.parse(JSON.stringify(slot.recipe || {}));
  const recipe = slot.recipe;
  if(recipe.grains == null) recipe.grains = 0;
  const details = el('details', 'cs-recipe');
  details.open = expanded === true;
  details.appendChild(el('summary', null, tr('▦  SYNTH MODULES — edit the procedural sound', '▦  MODULI SYNTH — modifica il suono procedurale')));
  const modules = el('div', 'cs-modules');
  ['noise','tone','ring'].forEach(key => {
    if(recipe[key]) modules.appendChild(recipeModule(key, recipe[key]));
  });
  if(recipe.noise){
    const grainModule = el('section', 'cs-module');
    grainModule.appendChild(el('div', 'cs-module-head', tr('TEXTURE / GRAINS', 'TEXTURE / GRANI')));
    grainModule.appendChild(recipeParam(recipe, 'grains', tr('Hits', 'Colpi'), 0, 8, 1));
    modules.appendChild(grainModule);
  }
  details.appendChild(modules);

  const missing = ['noise','tone','ring'].filter(key => !recipe[key]);
  if(missing.length){
    const add = el('div', 'cs-add-modules');
    missing.forEach(key => {
      const button = el('button', null, '+ ' + key.toUpperCase());
      button.addEventListener('click', () => {
        recipe[key] = JSON.parse(JSON.stringify(MODULE_DEFAULTS[key]));
        dirty = true;
        applyLive();
        render();
      });
      add.appendChild(button);
    });
    details.appendChild(add);
  }
  return details;
}

function signalChain(slot){
  const chain = el('div', 'cs-signal');
  const recipe = slot.recipe || {};
  [
    [slot.src ? 'Sample' : 'Procedural', true, 'source'],
    ['Noise', !!recipe.noise && recipe.noise.enabled !== false, 'noise'],
    ['Sub', !!recipe.tone && recipe.tone.enabled !== false, 'tone'],
    ['Resonance', !!recipe.ring && recipe.ring.enabled !== false, 'ring'],
    ['Output', slot.enabled !== false, 'output'],
  ].forEach((entry, index) => {
    if(index) chain.appendChild(el('b', null, '›'));
    const chip = el('i', entry[1] ? 'on' : null, entry[0]);
    chip.dataset.signal = entry[2];
    chain.appendChild(chip);
  });
  return chain;
}

function rackCard(label, hint, slot, preview, options){
  const card = el('article', 'cs-rack-card' + (options && options.effect ? ' fx' : ''));
  card.appendChild(slotRow(label, hint, slot, preview));
  card.appendChild(signalChain(slot));
  card.appendChild(recipeEditor(slot, options && options.expanded));
  return card;
}

function showDirty(){
  const flag = root && root.querySelector('#csDirty');
  if(flag) flag.classList.toggle('show', dirty);
}

// ------------------------------------------------ panes
function footstepsPane(body){
  const steps = work.footsteps;
  body.appendChild(el('p', 'cs-note', tr(
    'Steps are spaced by distance walked, so cadence follows speed at every gait. The surface comes from the collider underfoot — tag geometry with a `surface` property; anything untagged uses the default below.',
    'I passi sono distanziati per distanza percorsa, quindi la cadenza segue la velocità a ogni andatura. La superficie arriva dal collider sotto i piedi — marca la geometria con la proprietà `surface`; ciò che non è marcato usa il default qui sotto.')));

  const globals = el('div', 'cs-globals');
  const enabled = el('button', steps.enabled ? 'cs-on' : null, steps.enabled ? tr('Footsteps ON', 'Passi ON') : tr('Footsteps OFF', 'Passi OFF'));
  enabled.addEventListener('click', () => { steps.enabled = !steps.enabled; markDirty(); });
  globals.appendChild(enabled);

  [['strideWalk', tr('Walk stride (m)', 'Falcata camm. (m)'), .2, 3],
    ['strideRun', tr('Run stride (m)', 'Falcata corsa (m)'), .2, 4],
    ['volume', tr('Volume', 'Volume'), 0, 2],
    ['runVolume', tr('Run volume', 'Volume corsa'), 0, 3],
    ['walkVolume', tr('Walk volume', 'Volume camminata'), 0, 2],
    ['crouchVolume', tr('Crouch volume', 'Volume accovacciato'), 0, 2]].forEach(([key, label, min, max]) => {
    const wrap = el('label');
    wrap.appendChild(el('span', null, label));
    wrap.appendChild(slider(steps[key], min, max, .01, v => { steps[key] = v; applyLive(); dirty = true; showDirty(); }));
    globals.appendChild(wrap);
  });

  const defWrap = el('label');
  defWrap.appendChild(el('span', null, tr('Default surface', 'Superficie default')));
  const select = document.createElement('select');
  AUDIO.SURFACES.forEach(surface => {
    const option = document.createElement('option');
    option.value = surface.id;
    option.textContent = surface.label;
    if(surface.id === steps.defaultSurface) option.selected = true;
    select.appendChild(option);
  });
  select.addEventListener('change', () => { steps.defaultSurface = select.value; markDirty(); });
  defWrap.appendChild(select);
  globals.appendChild(defWrap);
  body.appendChild(globals);

  body.appendChild(headerRow());
  AUDIO.SURFACES.forEach(surface => {
    body.appendChild(slotRow(surface.label, surface.id, steps.surfaces[surface.id],
      () => { const rt = runtime(); if(rt) rt.footstep(surface.id, 1); }));
  });
}

const WEAPON_SLOT_LABELS = [
  ['fire', 'Fire', 'Sparo', 'the shot itself', 'lo sparo'],
  ['tail', 'Tail', 'Coda', 'reflection / distance tail', 'coda riverberata'],
  ['mech', 'Mechanism', 'Meccanica', 'bolt, action', 'otturatore'],
  ['shell', 'Shell', 'Bossolo', 'casing on the ground', 'bossolo a terra'],
  ['dry', 'Dry fire', 'Colpo a vuoto', 'empty magazine', 'caricatore vuoto'],
  ['reloadOut', 'Reload start', 'Inizio ricarica', 'magazine out', 'caricatore fuori'],
  ['reloadIn', 'Reload end', 'Fine ricarica', 'magazine in', 'caricatore dentro'],
];

function weaponsPane(body){
  body.appendChild(el('p', 'cs-note', tr(
    'One profile per weapon class. A Pawn picks its class from the weapon preset, or from behaviour when the loadout is fully custom — pellets make a shotgun, long range a marksman.',
    'Un profilo per classe di arma. Il Pawn sceglie la classe dal preset, o dal comportamento se il loadout è personalizzato — i pallettoni fanno un fucile a pompa, la gittata lunga un tiratore scelto.')));

  const tabs = el('div', 'cs-globals');
  AUDIO.WEAPON_CLASSES.forEach(cls => {
    const button = el('button', cls.id === weaponClass ? 'cs-on' : null, cls.label);
    button.addEventListener('click', () => { weaponClass = cls.id; render(); });
    tabs.appendChild(button);
  });
  body.appendChild(tabs);

  const slots = work.weapons[weaponClass];
  const rack = el('div', 'cs-rack');
  WEAPON_SLOT_LABELS.forEach(([key, en, it, hintEn, hintIt]) => {
    rack.appendChild(rackCard(tr(en, it), tr(hintEn, hintIt), slots[key], () => {
      const rt = runtime();
      if(!rt) return;
      // The fire slot auditions the complete shot — shot, tail, action and
      // casing together — because that is the sound the player actually hears.
      if(key === 'fire') rt.weaponEvent('OnWeaponFired', {preset:weaponClass});
      else rt.playWeaponSlot(weaponClass, key);
    }, {expanded:key === 'fire'}));
  });
  body.appendChild(rack);
}

function effectsPane(body){
  const intro = el('div', 'cs-fx-intro');
  intro.appendChild(el('div', 'cs-fx-pulse', '◉'));
  const copy = el('div');
  copy.appendChild(el('b', null, tr('IMPACT FX RACK', 'RACK FX D’IMPATTO')));
  copy.appendChild(el('small', null, tr(
    'Layer transients, an 808-style sub drop and resonances. Every module is live, optional and saved inside the Character Sound Set.',
    'Sovrapponi transienti, un sub drop stile 808 e risonanze. Ogni modulo è live, opzionale e salvato nel Character Sound Set.')));
  intro.appendChild(copy);
  body.appendChild(intro);

  const rack = el('div', 'cs-rack');
  (AUDIO.EFFECTS || []).forEach(effect => {
    const slot = work.effects[effect.id];
    rack.appendChild(rackCard(effect.label,
      tr('damage-area explosion / grenade', 'esplosione ad area / granata'),
      slot,
      () => { const rt = runtime(); if(rt) rt.playEffect(effect.id); },
      {effect:true, expanded:true}));
  });
  body.appendChild(rack);
}

function bodyPane(body){
  body.appendChild(el('p', 'cs-note', tr(
    'Jump, landing and sprint breathing. Landing volume scales with impact speed.',
    'Salto, atterraggio e respiro in corsa. Il volume dell\'atterraggio scala con la velocità d\'impatto.')));
  const globals = el('div', 'cs-globals');
  const wrap = el('label');
  wrap.appendChild(el('span', null, tr('Breath interval (s)', 'Intervallo respiro (s)')));
  wrap.appendChild(slider(work.body.breathInterval, .4, 6, .05, v => { work.body.breathInterval = v; applyLive(); dirty = true; showDirty(); }));
  globals.appendChild(wrap);
  body.appendChild(globals);

  body.appendChild(headerRow());
  const play = key => { const r = runtime(); if(r) r.playBody(key); };
  body.appendChild(slotRow(tr('Jump', 'Salto'), null, work.body.jump, () => play('jump')));
  body.appendChild(slotRow(tr('Land', 'Atterraggio'), null, work.body.land, () => play('land')));
  body.appendChild(slotRow(tr('Breath', 'Respiro'), null, work.body.breath, () => play('breath')));
}

// ------------------------------------------------ render
function render(){
  if(!root || !work) return;
  // The body is rebuilt from scratch, so any running loop is holding buttons
  // that are about to be discarded.
  stopLoop();
  const picker = root.querySelector('#csSet');
  picker.innerHTML = '';
  STORE.characterSoundSets.list().forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    if(item.id === setId) option.selected = true;
    picker.appendChild(option);
  });
  root.querySelectorAll('.cs-tabs button').forEach(button => {
    button.classList.toggle('cs-on', button.dataset.tab === tab);
  });
  const body = root.querySelector('#csBody');
  body.innerHTML = '';
  if(tab === 'footsteps') footstepsPane(body);
  else if(tab === 'weapons') weaponsPane(body);
  else if(tab === 'effects') effectsPane(body);
  else bodyPane(body);
  showDirty();
}

// ------------------------------------------------ lifecycle
function load(id){
  const stored = id ? STORE.characterSoundSets.get(id) : null;
  work = AUDIO.normalizeSet(stored);
  setId = stored ? stored.id : null;
  if(!setId){
    // First open with an empty library: seed it with the shipped default so
    // there is always something to edit and save.
    const list = STORE.characterSoundSets.list();
    setId = list.length ? list[0].id : STORE.characterSoundSets.create(tr('Default Foley', 'Foley predefinito'), AUDIO.defaultSet());
    work = AUDIO.normalizeSet(STORE.characterSoundSets.get(setId));
  }
  work.id = setId;
  dirty = false;
  // Opening or switching a set is also choosing it for the level, so the choice
  // is recorded straight away rather than only on Save. `open()` is only ever
  // reached from the editor, so this cannot bind a set during play.
  bindToLevel();
  applyLive();
  render();
}

function save(){
  if(!work || !setId) return false;
  work.id = setId;
  const done = STORE.characterSoundSets.save(work);
  if(done){ dirty = false; showDirty(); bindToLevel(); }
  return done;
}

// Saving a set is also the act of choosing it: the level records the id so the
// next session loads this audio instead of falling back to the shipped default.
// Without this the designer only ever changed the LIVE set, and every edit was
// silently lost on reload.
function bindToLevel(){
  if(!GAME || !GAME.world || !setId) return false;
  if(GAME.world.characterSoundSetId === setId) return false;
  GAME.world.characterSoundSetId = setId;
  if(GAME.editor && GAME.editor.markDirty) GAME.editor.markDirty();
  return true;
}

// Which weapon class the player is holding right now, so the Weapons tab opens
// on the sound you would actually hear instead of always on the rifle.
function equippedWeaponClass(){
  const api = window.LK_RUNTIME_FIRST_PERSON;
  const rig = api && api.activeRig ? api.activeRig(GAME, 1) : null;
  if(!rig || !rig.armed || !rig.armed()) return null;
  return AUDIO.weaponClassFor(rig.config().weapon);
}

function open(id){
  if(!root) buildRoot();
  stopLoop();
  const held = equippedWeaponClass();
  if(held) weaponClass = held;
  load(id || setId);
  root.classList.add('open');
  return true;
}
function close(){
  stopLoop();
  if(root) root.classList.remove('open');
}

window.LK_CHARACTER_SOUND_DESIGNER = Object.freeze({open, close, save, current:() => work});
})();
