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
  const values = {quality:'High', antialiasing:'High', rendererMode:'webgl', volumetricLighting:false};

  function apply(){
    if(!renderer) return;
    const qualityRatio = values.quality === 'Performance' ? 1 : (values.quality === 'Balanced' ? 1.5 : 2);
    const aaRatio = values.antialiasing === 'Performance' ? .85 : (values.antialiasing === 'Normal' ? 1 : 1.25);
    const dpr = opts.pixelRatio ? opts.pixelRatio() : window.devicePixelRatio;
    const size = opts.size ? opts.size() : {width: window.innerWidth, height: window.innerHeight};
    renderer.setPixelRatio(Math.min(dpr, qualityRatio * aaRatio));
    renderer.setSize(size.width, size.height);
    renderer.userData = renderer.userData || {};
    renderer.userData.videoSettings = Object.assign({}, values);
    document.body.classList.toggle('lk-renderer-raytracing', values.rendererMode === 'raytracing');
    document.body.classList.toggle('lk-volumetric-lighting', !!values.volumetricLighting);
    if(values.rendererMode === 'raytracing' && !values._raytracingWarned){
      values._raytracingWarned = true;
      console.warn('LotKing video: raytracing experimental selected; generic scene raytracing is not available yet, using Three.js WebGL fallback.');
    }
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
  let navRaf = 0;
  let navPrev = {buttons: [], axX: 0, axY: 0, repeat: {}};

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
    const rendererMode = document.getElementById('videoRenderer');
    const volumetricLighting = document.getElementById('videoVolumetricLighting');
    const editorHud = document.getElementById('videoEditorHud');
    if(!btn || !overlay || !close || !resume || !backMenu) return;

    const setTab = tab => {
      overlay.querySelectorAll('[data-settings-tab]').forEach(b => b.classList.toggle('on', b.dataset.settingsTab === tab));
      overlay.querySelectorAll('[data-settings-section]').forEach(s => s.classList.toggle('on', s.dataset.settingsSection === tab));
      const active = overlay.querySelector('[data-settings-tab="' + tab + '"]');
      if(active && document.activeElement && document.activeElement.closest && document.activeElement.closest('#settingsOverlay')) active.focus();
    };

    const focusables = () => Array.from(overlay.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null && !el.closest('[data-settings-section]:not(.on)'));
    const focusMove = dir => {
      const list = focusables();
      if(!list.length) return;
      const i = Math.max(0, list.indexOf(document.activeElement));
      list[(i + dir + list.length) % list.length].focus();
    };
    const activeTabIndex = () => {
      const tabs = Array.from(overlay.querySelectorAll('[data-settings-tab]')).filter(b => b.offsetParent !== null);
      const i = tabs.findIndex(b => b.classList.contains('on'));
      return {tabs, index: Math.max(0, i)};
    };
    const tabMove = dir => {
      const cur = activeTabIndex();
      if(!cur.tabs.length) return;
      const next = cur.tabs[(cur.index + dir + cur.tabs.length) % cur.tabs.length];
      if(next) setTab(next.dataset.settingsTab);
    };
    const buttonDown = (pad, i) => !!(pad && pad.buttons && pad.buttons[i] && pad.buttons[i].pressed);
    const snapshotButtons = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.from(pads).find(Boolean);
      navPrev.buttons = [];
      navPrev.repeat = {};
      if(pad && pad.buttons) pad.buttons.forEach((button, i) => { navPrev.buttons[i] = !!(button && button.pressed); });
      navPrev.axX = pad && pad.axes ? pad.axes[0] || 0 : 0;
      navPrev.axY = pad && pad.axes ? pad.axes[1] || 0 : 0;
    };
    const buttonEdge = (pad, i) => {
      const down = buttonDown(pad, i);
      const edge = down && !navPrev.buttons[i];
      navPrev.buttons[i] = down;
      return edge;
    };
    const activeMenuControl = () => {
      const active = document.activeElement && document.activeElement.closest && document.activeElement.closest('#settingsOverlay') ? document.activeElement : null;
      return active || focusables()[0] || null;
    };
    const emit = (el, type) => el && el.dispatchEvent(new Event(type, {bubbles: true}));
    const adjustRange = (input, dir) => {
      const min = input.min === '' ? 0 : Number(input.min);
      const max = input.max === '' ? 100 : Number(input.max);
      const rawStep = input.step && input.step !== 'any' ? Number(input.step) : 0;
      const step = rawStep > 0 ? rawStep : Math.max(1, (max - min) / 100);
      const next = Math.max(min, Math.min(max, Number(input.value || 0) + step * dir));
      input.value = String(next);
      emit(input, 'input');
      emit(input, 'change');
    };
    const adjustSelect = (select, dir) => {
      if(!select.options || !select.options.length) return;
      const next = Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + dir));
      if(next === select.selectedIndex) return;
      select.selectedIndex = next;
      emit(select, 'change');
    };
    const adjustCheckbox = (input, dir) => {
      const next = dir > 0;
      if(input.checked === next) return;
      input.checked = next;
      emit(input, 'input');
      emit(input, 'change');
    };
    const adjustFocused = dir => {
      const target = activeMenuControl();
      if(!target) return false;
      if(target.matches && target.matches('input[type="range"]')){ adjustRange(target, dir); return true; }
      if(target.matches && target.matches('select')){ adjustSelect(target, dir); return true; }
      if(target.matches && target.matches('input[type="checkbox"]')){ adjustCheckbox(target, dir); return true; }
      const nested = target.querySelector && target.querySelector('input[type="range"], select, input[type="checkbox"]');
      if(nested && nested.matches('input[type="range"]')){ nested.focus(); adjustRange(nested, dir); return true; }
      if(nested && nested.matches('select')){ nested.focus(); adjustSelect(nested, dir); return true; }
      if(nested && nested.matches('input[type="checkbox"]')){ nested.focus(); adjustCheckbox(nested, dir); return true; }
      return false;
    };
    const activateFocused = () => {
      const target = activeMenuControl();
      if(!target) return;
      if(target.matches && target.matches('select')){ adjustSelect(target, 1); return; }
      if(target.matches && target.matches('input[type="range"]')) return;
      if(target.click) target.click();
    };
    const repeatAction = (key, active, fn) => {
      if(!active){ delete navPrev.repeat[key]; return; }
      const now = performance.now();
      const state = navPrev.repeat[key] || {next: 0, fired: false};
      if(now >= state.next){
        fn();
        state.fired = true;
        state.next = now + (state.fired ? 135 : 320);
      }
      navPrev.repeat[key] = state;
    };
    const navTick = () => {
      navRaf = requestAnimationFrame(navTick);
      if(!overlay.classList.contains('open')) return;
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = Array.from(pads).find(Boolean);
      if(!pad) return;
      if(buttonEdge(pad, 4)) tabMove(-1);
      if(buttonEdge(pad, 5)) tabMove(1);
      if(buttonEdge(pad, 0)) activateFocused();
      if(buttonEdge(pad, 1) || buttonEdge(pad, 9)) setOpen(false);
      const axX = pad.axes && pad.axes[0] || 0;
      const axY = pad.axes && pad.axes[1] || 0;
      const yDir = (buttonDown(pad, 12) || axY < -.55) ? -1 : ((buttonDown(pad, 13) || axY > .55) ? 1 : 0);
      const xDir = (buttonDown(pad, 14) || axX < -.55) ? -1 : ((buttonDown(pad, 15) || axX > .55) ? 1 : 0);
      repeatAction('nav-y-up', yDir < 0, () => focusMove(-1));
      repeatAction('nav-y-down', yDir > 0, () => focusMove(1));
      repeatAction('nav-x-left', xDir < 0, () => { if(!adjustFocused(-1)) focusMove(-1); });
      repeatAction('nav-x-right', xDir > 0, () => { if(!adjustFocused(1)) focusMove(1); });
      navPrev.axX = axX;
      navPrev.axY = axY;
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
      document.body.classList.toggle('lk-gamepad-menu-nav', !!open);
      if(open){
        navPrev = {buttons: [], axX: 0, axY: 0, repeat: {}};
        snapshotButtons();
        requestAnimationFrame(() => {
          const first = overlay.querySelector('[data-settings-tab].on') || focusables()[0];
          if(first && first.focus) first.focus();
        });
      }
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
    if(rendererMode){
      rendererMode.value = video && video.rendererMode || 'webgl';
      rendererMode.addEventListener('change', () => {
        if(video) video.rendererMode = rendererMode.value === 'raytracing' ? 'raytracing' : 'webgl';
        if(opts.applyVideo) opts.applyVideo();
      });
    }
    if(volumetricLighting){
      volumetricLighting.checked = !!(video && video.volumetricLighting);
      volumetricLighting.addEventListener('change', () => {
        if(video) video.volumetricLighting = !!volumetricLighting.checked;
        if(opts.applyVideo) opts.applyVideo();
      });
    }
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
    navRaf = requestAnimationFrame(navTick);
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
