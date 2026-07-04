/* =========================================================
   LOT KING - settings and pause menu runtime module
   Audio/video settings state, DOM bindings and pause overlay control.
   ========================================================= */
(function(){
'use strict';

function clamp01(v){ return Math.max(0, Math.min(1, v)); }

function createVideo(options){
  const opts = options || {};
  const renderer = opts.renderer;
  const values = {quality:'High', antialiasing:'High'};

  function apply(){
    if(!renderer) return;
    const qualityRatio = values.quality === 'Performance' ? 1 : (values.quality === 'Balanced' ? 1.5 : 2);
    const aaRatio = values.antialiasing === 'Performance' ? .85 : (values.antialiasing === 'Normal' ? 1 : 1.25);
    const dpr = opts.pixelRatio ? opts.pixelRatio() : window.devicePixelRatio;
    const size = opts.size ? opts.size() : {width: window.innerWidth, height: window.innerHeight};
    renderer.setPixelRatio(Math.min(dpr, qualityRatio * aaRatio));
    renderer.setSize(size.width, size.height);
  }

  return {values, apply};
}

function createMenu(options){
  const opts = options || {};
  const gameState = opts.gameState || {};
  const audio = opts.audio;
  const video = opts.video;
  let currentMode = 'game';
  let setOpen = () => {};
  let toggle = () => {};

  function applyAudio(){
    if(opts.applyAudio) opts.applyAudio();
  }

  function setAudioChannel(channel, value){
    if(!audio || audio[channel] == null) return;
    audio[channel] = clamp01(value);
    const input = document.querySelector('[data-audio="' + channel + '"]');
    if(input){
      input.value = Math.round(audio[channel] * 100);
      const out = document.querySelector('output[for="' + input.id + '"]');
      if(out) out.value = input.value + '%';
    }
    applyAudio();
  }

  function init(){
    const btn = document.getElementById('settingsBtn');
    const overlay = document.getElementById('settingsOverlay');
    const close = document.getElementById('settingsClose');
    const title = document.getElementById('settingsTitle');
    const resume = document.getElementById('pauseResume');
    const backMenu = document.getElementById('pauseBackMenu');
    const tuneOpen = document.getElementById('openGameplayTune');
    const quality = document.getElementById('videoQuality');
    const aa = document.getElementById('videoAA');
    const editorHud = document.getElementById('videoEditorHud');
    if(!btn || !overlay || !close || !resume || !backMenu) return;

    const setTab = tab => {
      overlay.querySelectorAll('[data-settings-tab]').forEach(b => b.classList.toggle('on', b.dataset.settingsTab === tab));
      overlay.querySelectorAll('[data-settings-section]').forEach(s => s.classList.toggle('on', s.dataset.settingsSection === tab));
    };

    const configureMode = mode => {
      currentMode = mode || (gameState.editorActive ? 'editor' : 'game');
      overlay.classList.toggle('editor', currentMode === 'editor');
      overlay.classList.toggle('game', currentMode !== 'editor');
      if(title) title.textContent = currentMode === 'editor' ? 'ENGINE EDITOR MENU' : 'GAME MENU';
      const activeTab = overlay.querySelector('[data-settings-tab].on');
      if(currentMode === 'editor' && activeTab && activeTab.dataset.settingsTab === 'gameplay') setTab('audio');
    };

    setOpen = (open, mode) => {
      configureMode(mode);
      overlay.classList.toggle('open', open);
      btn.classList.toggle('open', open);
      gameState.paused = !!open && currentMode === 'game' && gameState.started;
    };
    toggle = mode => setOpen(!overlay.classList.contains('open'), mode);

    btn.addEventListener('click', () => toggle('game'));
    close.addEventListener('click', () => setOpen(false));
    resume.addEventListener('click', () => setOpen(false));
    backMenu.addEventListener('click', () => {
      setOpen(false);
      if(currentMode === 'editor' && opts.onEditorExit) opts.onEditorExit();
      if(opts.onBackMenu) opts.onBackMenu();
    });
    if(tuneOpen) tuneOpen.addEventListener('click', () => {
      setOpen(false);
      if(opts.onOpenTune) opts.onOpenTune();
    });
    if(quality) quality.addEventListener('change', () => {
      if(video) video.quality = quality.value;
      if(opts.applyVideo) opts.applyVideo();
    });
    if(aa) aa.addEventListener('change', () => {
      if(video) video.antialiasing = aa.value;
      if(opts.applyVideo) opts.applyVideo();
    });
    if(editorHud) editorHud.addEventListener('change', () => {
      document.body.classList.toggle('editor-hud-hidden', !editorHud.checked);
    });
    overlay.querySelectorAll('[data-settings-tab]').forEach(tab => {
      tab.addEventListener('click', () => setTab(tab.dataset.settingsTab));
    });
    overlay.addEventListener('click', e => { if(e.target === overlay) setOpen(false); });
    overlay.querySelectorAll('input[type="range"]').forEach(input => {
      const out = overlay.querySelector('output[for="' + input.id + '"]');
      const update = () => {
        if(audio && input.dataset.audio) audio[input.dataset.audio] = Number(input.value) / 100;
        if(out) out.value = input.value + '%';
        applyAudio();
      };
      input.addEventListener('input', update);
      update();
    });
    configureMode('game');
  }

  init();

  return {
    setOpen: (open, mode) => setOpen(open, mode),
    toggle: mode => toggle(mode),
    setAudioChannel,
    getMode: () => currentMode,
  };
}

window.LK_RUNTIME_SETTINGS_MENU = Object.freeze({createVideo, createMenu});
})();
