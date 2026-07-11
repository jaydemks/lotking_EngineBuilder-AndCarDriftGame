/* =========================================================
   LOT KING — EDITOR PREFERENCES
   Owns editor settings, static chrome language and quick music panel prefs.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const root = deps.root;
  const ED = deps.ED;
  const GAME = deps.GAME || window.LOT_KING;
  const $ = deps.$;
  const status = deps.status || function(){};
  const refreshOutliner = deps.refreshOutliner || function(){};
  const buildInspector = deps.buildInspector || function(){};

  const PREFS_KEY = 'lotking.editorPrefs.v1';
  const prefs = Object.assign({musicPanel: true, theme: 'dark', lang: 'en', editorKeys:{select:'q', move:'w', rotate:'e', scale:'r', focus:'f'}}, (() => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch(err){ return {}; }
  })());
  prefs.editorKeys = Object.assign({select:'q', move:'w', rotate:'e', scale:'r', focus:'f'}, prefs.editorKeys || {});

  function save(){
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch(err){}
  }

  const I18N = {
    prefsSub:       {en:'editor preferences + project general settings', it:'preferenze editor + impostazioni generali progetto'},
    tabInterface:   {en:'Interface', it:'Interfaccia'},
    tabGeneral:     {en:'Project General', it:'Generali progetto'},
    tabTheme:       {en:'Theme', it:'Tema'},
    tabLanguage:    {en:'Language', it:'Lingua'},
    tabControls:    {en:'Game Input', it:'Input gioco'},
    tabEditorKeys:  {en:'Editor Keys', it:'Tasti editor'},
    tabViewport:    {en:'Viewport', it:'Viewport'},
    letterboxName:  {en:'Frame background', it:'Sfondo fuori dal frame'},
    letterboxDesc:  {en:'Colour outside the player-camera frame (letterbox / crop). Saved with the level.', it:'Colore fuori dal frame della camera del player (letterbox / crop). Salvato col livello.'},
    musicPanelName: {en:'Menu music player', it:'Player musica del menu'},
    musicPanelDesc: {en:'Show the floating quick music player in the editor.', it:'Mostra il mini-player musicale flottante nell\'editor.'},
    themeDark:      {en:'Dark', it:'Scuro'},
    themeDarkDesc:  {en:'The current game-engine dark look.', it:'Il look scuro attuale, stile game-engine.'},
    themeLight:     {en:'Light', it:'Chiaro'},
    themeLightDesc: {en:'Bright panels, same layout.', it:'Pannelli chiari, stesso layout.'},
    langEnDesc:     {en:'Default editor language.', it:'Lingua predefinita dell\'editor.'},
    langItDesc:     {en:'Main interface in Italian (inner panels migrate over time).', it:'Interfaccia principale in italiano (i pannelli interni migrano man mano).'},
  };

  const CHROME_I18N = [
    ['#lkSearch', 'placeholder', {en:'search…', it:'cerca…'}],
    ['#lkSceneTab', 'text', {en:'Scene', it:'Scena'}],
    ['#lkAssetsTab', 'text', {en:'Assets', it:'Assets'}],
    ['#lkFilter option[value="all"]', 'text', {en:'All', it:'Tutti'}],
    ['#lkFilter option[value="mesh"]', 'text', {en:'Meshes', it:'Mesh'}],
    ['#lkFilter option[value="light"]', 'text', {en:'Lights', it:'Luci'}],
    ['#lkFilter option[value="effect"]', 'text', {en:'Effects', it:'Effetti'}],
    ['#lkFilter option[value="added"]', 'text', {en:'Added', it:'Aggiunti'}],
    ['#lkFilter option[value="builtin"]', 'text', {en:'Built-in', it:'Originali'}],
    ['#lkSave', 'text', {en:'💾 Save', it:'💾 Salva'}],
    ['#lkNewTrack', 'text', {en:'New', it:'Nuovo'}],
    ['#lkSaveAsTrack', 'text', {en:'Save As', it:'Salva come'}],
    ['#lkProjects', 'text', {en:'🗂 Projects', it:'🗂 Progetti'}],
    ['#lkLevels', 'text', {en:'🗀 Levels', it:'🗀 Livelli'}],
    ['#lkResetScene', 'text', {en:'↺ Reset', it:'↺ Reset'}],
    ['#lkPlay', 'text', {en:'▶ PREVIEW', it:'▶ PROVA'}],
    ['#lkSimulate', 'text', {en:'▶ SIMULATE', it:'▶ SIMULA'}],
    ['.lk-levels-title', 'text', {en:'🗀 PROJECT LEVELS', it:'🗀 LIVELLI DEL PROGETTO'}],
    ['.lk-levels-sub', 'text', {en:'stored locally · LKEP format', it:'salvati localmente · formato LKEP'}],
    ['#lkLevelsNew', 'text', {en:'＋ New level', it:'＋ Nuovo livello'}],
    ['#lkLevelsFromFile', 'text', {en:'⇧ Load from file…', it:'⇧ Carica da file…'}],
    ['.lk-projects-title', 'text', {en:'🗂 PROJECTS', it:'🗂 PROGETTI'}],
    ['.lk-projects-sub', 'text', {en:'stored in this browser', it:'salvati in questo browser'}],
    ['#lkProjectsNew', 'text', {en:'＋ New project', it:'＋ Nuovo progetto'}],
    ['#lkProjectsFromFile', 'text', {en:'⇧ Import project file…', it:'⇧ Importa file progetto…'}],
    ['#lkPinned .lk-pin[data-special="env"] .lk-pin-label', 'text', {en:'Environment', it:'Environment'}],
    ['#lkPinned .lk-pin[data-special="rendering"] .lk-pin-label', 'text', {en:'Rendering / Video', it:'Rendering / Video'}],
    ['#lkPinned .lk-pin[data-special="player"] .lk-pin-label', 'text', {en:'player_car (Logic)', it:'player_car (Logic)'}],
    ['#lkPinned .lk-pin[data-special="hud"] .lk-pin-label', 'text', {en:'HUD / Radio TAB', it:'HUD / Radio TAB'}],
  ];

  function lang(){ return prefs.lang === 'it' ? 'it' : 'en'; }

  function emitLanguageChange(){
    refreshOutliner();
    buildInspector();
    window.dispatchEvent(new CustomEvent('lotking:languagechange', {detail:{lang: lang()}}));
  }

  function applyLanguage(){
    const L = lang();
    if(window.LOT_KING && window.LOT_KING.i18n) window.LOT_KING.i18n.setLang(L);
    document.documentElement.lang = L;
    root.querySelectorAll('[data-pref-i18n]').forEach(n => {
      const e = I18N[n.dataset.prefI18n];
      if(e) n.textContent = e[L];
    });
    for(const [sel, prop, texts] of CHROME_I18N){
      const n = root.querySelector(sel);
      if(!n) continue;
      if(prop === 'placeholder') n.placeholder = texts[L];
      else n.textContent = texts[L];
    }
  }

  function apply(){
    const qa = $('#lkQuickAudio');
    if(qa) qa.style.display = prefs.musicPanel ? '' : 'none';
    root.classList.toggle('lk-light', prefs.theme === 'light');
    document.body.classList.toggle('lk-light', prefs.theme === 'light');
    applyLanguage();
  }

  function setLang(value){
    const next = value === 'it' ? 'it' : 'en';
    if(prefs.lang === next){
      apply();
      return;
    }
    prefs.lang = next;
    save();
    apply();
    emitLanguageChange();
  }

  function setOpen(open){
    ED.prefsOpen = !!open;
    $('#lkPrefsOverlay').classList.toggle('open', ED.prefsOpen);
    if(!ED.prefsOpen) return;
    $('#lkPrefMusicPanel').checked = !!prefs.musicPanel;
    root.querySelectorAll('[name="lkPrefTheme"]').forEach(r => { r.checked = r.value === prefs.theme; });
    root.querySelectorAll('[name="lkPrefLang"]').forEach(r => { r.checked = r.value === lang(); });
    root.querySelectorAll('[data-editor-key]').forEach(input => { input.value = String(prefs.editorKeys[input.dataset.editorKey] || '').toUpperCase(); });
  }

  function setTab(tab){
    root.querySelectorAll('[data-prefs-tab]').forEach(b => b.classList.toggle('on', b.dataset.prefsTab === tab));
    root.querySelectorAll('[data-prefs-sec]').forEach(s => s.classList.toggle('on', s.dataset.prefsSec === tab));
  }

  $('#lkLogoBtn').addEventListener('click', () => setOpen(!ED.prefsOpen));
  const projectGeneral = $('#lkOpenProjectGeneral');
  if(projectGeneral) projectGeneral.addEventListener('click', () => {
    setOpen(false);
    if(GAME && GAME.actions && GAME.actions.openSettingsTab) GAME.actions.openSettingsTab('video', 'editor');
  });
  $('#lkPrefsClose').addEventListener('click', () => setOpen(false));
  $('#lkPrefsOverlay').addEventListener('pointerdown', e => { if(e.target === e.currentTarget) setOpen(false); });
  root.querySelectorAll('[data-prefs-tab]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.prefsTab)));
  $('#lkPrefMusicPanel').addEventListener('change', e => {
    prefs.musicPanel = e.target.checked;
    save();
    apply();
  });
  root.querySelectorAll('[name="lkPrefTheme"]').forEach(r => r.addEventListener('change', () => {
    if(r.checked){ prefs.theme = r.value; save(); apply(); }
  }));
  root.querySelectorAll('[name="lkPrefLang"]').forEach(r => r.addEventListener('change', () => {
    if(r.checked) setLang(r.value);
  }));
  root.querySelectorAll('[data-editor-key]').forEach(input => input.addEventListener('change', () => {
    const value = String(input.value || '').trim().slice(0, 1).toLowerCase();
    if(!value){ input.value = String(prefs.editorKeys[input.dataset.editorKey] || '').toUpperCase(); return; }
    prefs.editorKeys[input.dataset.editorKey] = value;
    input.value = value.toUpperCase();
    save();
  }));
  $('#lkQuickHide').addEventListener('click', () => {
    prefs.musicPanel = false;
    save();
    apply();
    status(lang() === 'it' ? 'Player nascosto: riattivalo da ⚙ Impostazioni → Interfaccia' : 'Player hidden: re-enable it from ⚙ Settings → Interface');
  });

  apply();

  return Object.freeze({
    prefs,
    lang,
    setLang,
    apply,
    setOpen,
    setTab,
  });
}

window.LK_EDITOR_PREFERENCES = Object.freeze({create});
})();
