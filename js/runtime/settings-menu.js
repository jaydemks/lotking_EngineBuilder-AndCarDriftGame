/* =========================================================
   LOT KING - settings and pause menu runtime module
   Audio/video settings state, DOM bindings and pause overlay control.
   ========================================================= */
(function(){
'use strict';

function clamp01(v){ return Math.max(0, Math.min(1, v)); }
function tr(en, it){ return window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en; }

const VIDEO_PRESETS = Object.freeze({
  low:       Object.freeze({label:'Low',       pixelRatio:.65, shadowSize:512,  raySamples:2}),
  medium:    Object.freeze({label:'Medium',    pixelRatio:.85, shadowSize:1024, raySamples:3}),
  high:      Object.freeze({label:'High',      pixelRatio:1,   shadowSize:1536, raySamples:4}),
  superhigh: Object.freeze({label:'Super High',pixelRatio:1.35,shadowSize:2048, raySamples:6}),
  extreme:   Object.freeze({label:'Extreme',   pixelRatio:1.7, shadowSize:4096, raySamples:8}),
});
const VIDEO_SETTING_KEYS = Object.freeze(['quality','antialiasing','rendererMode','shadows','reflections','volumetricLighting']);
const VIDEO_DEFAULTS = Object.freeze({
  quality:'high', antialiasing:'ssaa2x', rendererMode:'webgl', shadows:true, reflections:true, volumetricLighting:false,
});

function normalizeVideoValues(input){
  const src = input || {};
  const qualityAliases = {Performance:'low', Balanced:'medium', High:'high', Low:'low', Medium:'medium', SuperHigh:'superhigh', Extreme:'extreme'};
  const aaAliases = {Performance:'off', Normal:'fxaa', High:'ssaa2x', normal:'fxaa', high:'ssaa2x'};
  const quality = qualityAliases[src.quality] || String(src.quality || VIDEO_DEFAULTS.quality).toLowerCase().replace(/[^a-z]/g, '');
  const antialiasing = aaAliases[src.antialiasing] || String(src.antialiasing || VIDEO_DEFAULTS.antialiasing).toLowerCase();
  return {
    quality: VIDEO_PRESETS[quality] ? quality : VIDEO_DEFAULTS.quality,
    antialiasing: ['off','fxaa','ssaa2x','ssaa4x'].includes(antialiasing) ? antialiasing : VIDEO_DEFAULTS.antialiasing,
    rendererMode: src.rendererMode === 'raytracing' ? 'raytracing' : 'webgl',
    shadows: src.shadows !== false,
    reflections: src.reflections !== false,
    volumetricLighting: !!src.volumetricLighting,
  };
}

function normalizeVideoProject(input){
  const src = input || {};
  const exposed = {};
  VIDEO_SETTING_KEYS.forEach(key => { exposed[key] = !src.exposed || src.exposed[key] !== false; });
  return {version:1, defaults:normalizeVideoValues(src.defaults || src), exposed};
}

function createVideo(options){
  const opts = options || {};
  const renderer = opts.renderer;
  const values = normalizeVideoValues();
  let project = normalizeVideoProject();
  let overlayTimer = 0;

  function ensureChangeOverlay(){
    let overlay = document.getElementById('lkVideoApplyOverlay');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'lkVideoApplyOverlay';
    overlay.innerHTML = '<div class="lk-video-apply-card"><span class="lk-video-apply-spinner"></span><b></b><small></small></div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function showChangeOverlay(message){
    const overlay = ensureChangeOverlay();
    const title = overlay.querySelector('b');
    const small = overlay.querySelector('small');
    if(title) title.textContent = tr('Applying video settings', 'Applicazione impostazioni video');
    if(small) small.textContent = message || tr('Optimizing the renderer…', 'Ottimizzazione del renderer…');
    overlay.classList.add('on');
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(() => overlay.classList.remove('on'), 900);
  }

  function applyCore(){
    if(!renderer) return;
    const preset = VIDEO_PRESETS[values.quality] || VIDEO_PRESETS.high;
    const aaRatio = values.antialiasing === 'off' ? .8 : (values.antialiasing === 'ssaa2x' ? Math.SQRT2 : (values.antialiasing === 'ssaa4x' ? 2 : 1));
    const rayRatio = 1;
    const dpr = opts.pixelRatio ? opts.pixelRatio() : window.devicePixelRatio;
    const size = opts.size ? opts.size() : {width: window.innerWidth, height: window.innerHeight};
    const mobile = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || window.innerWidth < 760;
    const maxPixelRatio = mobile ? 2 : 4;
    renderer.setPixelRatio(Math.max(.5, Math.min(maxPixelRatio, dpr * preset.pixelRatio * aaRatio * rayRatio)));
    renderer.setSize(size.width, size.height);
    renderer.shadowMap.enabled = !!values.shadows;
    renderer.shadowMap.type = values.quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    const primaryShadow = opts.scene && opts.scene.children && opts.scene.children.find(node => node && node.isDirectionalLight && node.castShadow && node.shadow);
    if(primaryShadow){
      const shadowSize = (VIDEO_PRESETS[values.quality] || VIDEO_PRESETS.high).shadowSize;
      if(primaryShadow.shadow.mapSize.x !== shadowSize){
        primaryShadow.shadow.mapSize.set(shadowSize, shadowSize);
        if(primaryShadow.shadow.map && primaryShadow.shadow.map.dispose) primaryShadow.shadow.map.dispose();
        primaryShadow.shadow.map = null;
      }
    }
    if(opts.scene && opts.scene.traverse){
      opts.scene.traverse(node => {
        const materials = node && node.material ? (Array.isArray(node.material) ? node.material : [node.material]) : [];
        materials.forEach(mat => {
          if(!mat) return;
          mat.userData = mat.userData || {};
          if(mat.userData.lkVideoBaseEnvMapIntensity == null) mat.userData.lkVideoBaseEnvMapIntensity = mat.envMapIntensity == null ? 1 : mat.envMapIntensity;
          if(mat.userData.lkVideoBaseRoughness == null && mat.roughness != null) mat.userData.lkVideoBaseRoughness = mat.roughness;
          if(mat.userData.lkVideoBaseMetalness == null && mat.metalness != null) mat.userData.lkVideoBaseMetalness = mat.metalness;
          const ray = values.rendererMode === 'raytracing';
          if(mat.envMapIntensity != null) mat.envMapIntensity = values.reflections ? mat.userData.lkVideoBaseEnvMapIntensity * (ray ? 1.85 : 1.08) : 0;
          if(mat.roughness != null){
            const baseRoughness = mat.userData.lkVideoBaseRoughness;
            mat.roughness = values.reflections && ray ? Math.max(.16, baseRoughness * .58) : baseRoughness;
          }
          if(mat.metalness != null){
            const baseMetalness = mat.userData.lkVideoBaseMetalness;
            mat.metalness = values.reflections && ray ? Math.min(1, Math.max(baseMetalness, baseMetalness + .18)) : baseMetalness;
          }
          if(mat.needsUpdate != null) mat.needsUpdate = true;
        });
      });
    }
    const videoExposure = values.rendererMode === 'raytracing' ? 1.07 : 1.05;
    renderer.userData = renderer.userData || {};
    renderer.userData.videoToneMappingExposure = videoExposure;
    renderer.toneMappingExposure = videoExposure;
    renderer.userData.videoSettings = Object.assign({}, values, {preset:Object.assign({}, preset)});
    document.body.classList.toggle('lk-renderer-raytracing', values.rendererMode === 'raytracing');
    document.body.classList.toggle('lk-volumetric-lighting', !!values.volumetricLighting);
    document.body.dataset.lkVideoQuality = values.quality;
  }

  function apply(options){
    const change = options || {};
    if(!change.heavy){ applyCore(); return Promise.resolve(values); }
    showChangeOverlay(change.message);
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        applyCore();
      } catch(err){
        console.error('LotKing video: renderer update failed; keeping the previous compatible surface.', err);
      } finally {
        clearTimeout(overlayTimer);
        const overlay = document.getElementById('lkVideoApplyOverlay');
        overlayTimer = setTimeout(() => { if(overlay) overlay.classList.remove('on'); }, 320);
        resolve(values);
      }
    })));
  }

  function setProjectConfig(config, options){
    project = normalizeVideoProject(config);
    Object.assign(values, project.defaults);
    syncVideoControls(project, values);
    return apply(options);
  }
  function getProjectConfig(){ return normalizeVideoProject(project); }
  function commitValues(){
    project.defaults = normalizeVideoValues(values);
    return getProjectConfig();
  }

  return {values, apply, presets:VIDEO_PRESETS, getProjectConfig, setProjectConfig, commitValues};
}

function syncVideoControls(project, values){
  const config = normalizeVideoProject(project);
  const selectors = {
    quality:'#videoQuality', antialiasing:'#videoAA', rendererMode:'#videoRenderer',
    shadows:'#videoShadows', reflections:'#videoReflections', volumetricLighting:'#videoVolumetricLighting',
  };
  Object.keys(selectors).forEach(key => {
    const input = document.querySelector(selectors[key]);
    if(input){
      if(input.type === 'checkbox') input.checked = !!values[key];
      else input.value = values[key];
    }
    document.querySelectorAll('[data-video-setting="' + key + '"]').forEach(row => {
      row.dataset.videoExposed = config.exposed[key] === false ? 'false' : 'true';
      const editorMode = !!(row.closest('#settingsOverlay') && row.closest('#settingsOverlay').classList.contains('editor'));
      row.classList.toggle('hidden', !editorMode && config.exposed[key] === false);
    });
  });
}

function createMenu(options){
  const opts = options || {};
  const gameState = opts.gameState || {};
  const audio = opts.audio;
  const video = opts.video;
  let currentMode = 'game';
  let setOpen = () => {};
  let toggle = () => {};
  let setTab = () => {};
  let navRaf = 0;
  let navPrev = {buttons: [], axX: 0, axY: 0, repeat: {}};
  let lastButtonPointer = 'mouse';

  function applyAudio(){
    if(opts.applyAudio) opts.applyAudio();
  }
  function applyVideo(options){
    if(currentMode === 'editor' && opts.commitVideo){
      opts.commitVideo();
      window.dispatchEvent(new CustomEvent('lotking:video-project-change'));
    }
    if(opts.applyVideo) opts.applyVideo(options);
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
    const shadows = document.getElementById('videoShadows');
    const reflections = document.getElementById('videoReflections');
    const volumetricLighting = document.getElementById('videoVolumetricLighting');
    const editorHud = document.getElementById('videoEditorHud');
    if(!btn || !overlay || !close || !resume || !backMenu) return;

    setTab = tab => {
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
      overlay.querySelectorAll('[data-video-setting]').forEach(row => row.classList.toggle('hidden', currentMode !== 'editor' && row.dataset.videoExposed === 'false'));
      if(title) title.textContent = currentMode === 'editor' ? 'ENGINE EDITOR MENU' : 'GAME MENU';
      const activeTab = overlay.querySelector('[data-settings-tab].on');
      if(currentMode === 'editor' && activeTab && activeTab.dataset.settingsTab === 'gameplay') setTab('audio');
    };

    function menuCursorAllowed(open, source){
      if(!open) return false;
      if(source === 'gamepad' || source === 'touch') return false;
      if(opts.shouldShowMenuCursor) return !!opts.shouldShowMenuCursor(source, currentMode);
      return true;
    }

    function syncMenuCursor(open, source){
      const visible = menuCursorAllowed(open, source);
      gameState.menuCursorVisible = visible;
      document.body.classList.toggle('lk-gamepad-menu-nav', !!open && !visible);
      if(opts.applyRuntimeCursor) opts.applyRuntimeCursor();
    }

    function restoreFocusAfterClose(){
      const active = document.activeElement;
      if(active && active.closest && active.closest('#settingsOverlay') && active.blur) active.blur();
      if(opts.restoreRuntimeFocus) opts.restoreRuntimeFocus(currentMode);
    }

    setOpen = (open, mode, options) => {
      const wasOpen = overlay.classList.contains('open');
      configureMode(mode);
      const source = options && options.source;
      overlay.classList.toggle('open', open);
      btn.classList.toggle('open', open);
      gameState.paused = !!open && currentMode === 'game' && gameState.started;
      syncMenuCursor(!!open, source);
      if(open){
        navPrev = {buttons: [], axX: 0, axY: 0, repeat: {}};
        snapshotButtons();
        requestAnimationFrame(() => {
          const first = overlay.querySelector('[data-settings-tab].on') || focusables()[0];
          if(first && first.focus) first.focus();
        });
      } else if(wasOpen){
        restoreFocusAfterClose();
      }
    };
    toggle = (mode, options) => setOpen(!overlay.classList.contains('open'), mode, options);

    btn.addEventListener('pointerdown', e => { lastButtonPointer = e.pointerType || 'mouse'; }, {passive: true});
    btn.addEventListener('click', () => toggle('game', {source: lastButtonPointer === 'touch' ? 'touch' : 'mouse'}));
    close.addEventListener('click', () => setOpen(false));
    resume.addEventListener('click', () => setOpen(false));
    backMenu.addEventListener('click', () => {
      setOpen(false);
      if(currentMode === 'editor' && opts.onEditorExit){
        opts.onEditorExit();
        return;
      }
      if(opts.onBackMenu) opts.onBackMenu();
    });
    if(tuneOpen) tuneOpen.addEventListener('click', () => {
      setOpen(false);
      if(opts.onOpenTune) opts.onOpenTune();
    });
    if(quality) quality.addEventListener('change', () => {
      if(video) video.quality = VIDEO_PRESETS[quality.value] ? quality.value : 'high';
      applyVideo({heavy:true, message:tr('Adjusting render quality…', 'Regolazione qualità rendering…')});
    });
    if(aa) aa.addEventListener('change', () => {
      if(video) video.antialiasing = aa.value;
      applyVideo({heavy:true, message:tr('Rebuilding the render surface…', 'Ricostruzione superficie di rendering…')});
    });
    if(rendererMode){
      rendererMode.value = video && video.rendererMode || 'webgl';
      rendererMode.addEventListener('change', () => {
        if(video) video.rendererMode = rendererMode.value === 'raytracing' ? 'raytracing' : 'webgl';
        applyVideo({heavy:true, message:tr('Switching rendering pipeline…', 'Cambio pipeline di rendering…')});
      });
    }
    if(shadows){
      shadows.checked = video ? video.shadows !== false : true;
      shadows.addEventListener('change', () => {
        if(video) video.shadows = !!shadows.checked;
        applyVideo({heavy:true, message:tr('Rebuilding scene shadows…', 'Ricostruzione ombre della scena…')});
      });
    }
    if(reflections){
      reflections.checked = video ? video.reflections !== false : true;
      reflections.addEventListener('change', () => {
        if(video) video.reflections = !!reflections.checked;
        applyVideo({heavy:true, message:tr('Updating material reflections…', 'Aggiornamento riflessi dei materiali…')});
      });
    }
    if(volumetricLighting){
      volumetricLighting.checked = !!(video && video.volumetricLighting);
      volumetricLighting.addEventListener('change', () => {
        if(video) video.volumetricLighting = !!volumetricLighting.checked;
        applyVideo({heavy:true, message:tr('Updating volumetric lighting…', 'Aggiornamento illuminazione volumetrica…')});
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
    setOpen: (open, mode, options) => setOpen(open, mode, options),
    toggle: (mode, options) => toggle(mode, options),
    openTab: (tab, mode, options) => { setTab(tab || 'audio'); setOpen(true, mode, options || {source:'mouse'}); },
    setAudioChannel,
    getMode: () => currentMode,
  };
}

window.LK_RUNTIME_SETTINGS_MENU = Object.freeze({
  createVideo, createMenu, presets:VIDEO_PRESETS, defaults:VIDEO_DEFAULTS,
  normalizeValues:normalizeVideoValues, normalizeProject:normalizeVideoProject, syncControls:syncVideoControls,
});
})();
