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
  width:min(940px,calc(100vw - 40px));max-height:min(84vh,860px);z-index:10040;display:none;
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
      slot.src = URL.createObjectURL(chosen);
      markDirty();
    });
    picker.click();
  });
  actions.appendChild(file);
  row.appendChild(actions);
  return row;
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
  body.appendChild(headerRow());
  WEAPON_SLOT_LABELS.forEach(([key, en, it, hintEn, hintIt]) => {
    body.appendChild(slotRow(tr(en, it), tr(hintEn, hintIt), slots[key], () => {
      const rt = runtime();
      if(!rt) return;
      // The fire slot auditions the complete shot — shot, tail, action and
      // casing together — because that is the sound the player actually hears.
      if(key === 'fire') rt.weaponEvent('OnWeaponFired', {preset:weaponClass});
      else rt.playWeaponSlot(weaponClass, key);
    }));
  });
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
