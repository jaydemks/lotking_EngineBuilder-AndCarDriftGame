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
const SHADOW_PRESETS = Object.freeze({
  low:    Object.freeze({label:'Low',    mapSize:512,  radius:1}),
  medium: Object.freeze({label:'Medium', mapSize:1024, radius:1.25}),
  high:   Object.freeze({label:'High',   mapSize:2048, radius:1.75}),
  ultra:  Object.freeze({label:'Ultra',  mapSize:4096, radius:2.25}),
});
const VIDEO_SETTING_KEYS = Object.freeze(['quality','renderResolution','textureSize','antialiasing','rendererMode','exposure','shadows','shadowQuality','ambientOcclusion','aoQuality','reflections','reflectionQuality','reflectionDistance','volumetricLighting','cinematicLensFlares']);
const VIDEO_DEFAULTS = Object.freeze({
  quality:'high', renderResolution:1, textureSize:1024, antialiasing:'ssaa2x', rendererMode:'webgl', exposure:1.12,
  shadows:true, shadowQuality:'auto', shadowDistance:55, shadowBias:-0.00035, shadowNormalBias:0.035, shadowSoftness:1,
  ambientOcclusion:true, aoQuality:'medium',
  reflections:true, reflectionQuality:'high', reflectionDistance:35, volumetricLighting:true, cinematicLensFlares:false,
});
const TEXTURE_SIZES = Object.freeze([256, 512, 1024, 2048, 4096]);
const VIDEO_BENCHMARK_PREF_KEY = 'lotking.videoBenchmark.v1';
const MENU_RENDER_PROFILE = Object.freeze({
  quality:'medium',
  maxPixelRatio:1,
  renderResolution:1,
  textureSize:1024,
  shadowQuality:'low',
  shadowDistance:55,
});

// A menu is a presentation surface, not a benchmark scene. Keep the authored
// preferences untouched and derive a transient, bounded profile for every
// menu/pause/options context. This lets a future editor-authored UI invoke
// OPTIONS without silently rewriting the player's gameplay settings.
function menuRenderValues(input){
  const values = normalizeVideoValues(input);
  return Object.assign({}, values, {
    quality:MENU_RENDER_PROFILE.quality,
    renderResolution:Math.min(values.renderResolution, MENU_RENDER_PROFILE.renderResolution),
    textureSize:Math.min(values.textureSize, MENU_RENDER_PROFILE.textureSize),
    antialiasing:values.antialiasing === 'off' ? 'off' : 'fxaa',
    rendererMode:'webgl',
    shadowQuality:MENU_RENDER_PROFILE.shadowQuality,
    shadowDistance:Math.min(values.shadowDistance, MENU_RENDER_PROFILE.shadowDistance),
    ambientOcclusion:false,
    aoQuality:'low',
    reflections:false,
    reflectionQuality:'low',
    volumetricLighting:false,
    cinematicLensFlares:false,
  });
}

function adaptiveLowValues(input){
  return Object.assign(normalizeVideoValues(input), {
    quality:'low',
    antialiasing:'off',
    rendererMode:'webgl',
    shadows:false,
    shadowQuality:'low',
    ambientOcclusion:false,
    aoQuality:'low',
    reflections:false,
    reflectionQuality:'low',
    volumetricLighting:false,
    cinematicLensFlares:false,
    textureSize:Math.min(512, normalizeVideoValues(input).textureSize),
  });
}

// The drawing buffer is `size x pixelRatio`, and that pixel ratio multiplies
// FOUR things together: the device DPR, the quality preset, the supersampling
// ratio and the session render scale. Unclamped they compound - `high` + SSAA
// 2x on a 2x-DPR panel asks for 2.83x per axis, which is EIGHT times the pixels
// of the window, and `extreme` + SSAA 4x was allowed up to 4x per axis, or
// sixteen times. A 2560 px viewport was rendering past 8000 px wide and then
// being downscaled onto the panel: all of the fill rate, none of the
// resolution. Three ceilings keep it honest:
//
//   1. The effective ratio never exceeds 2. Past that, supersampling buys
//      detail the display cannot show - on a 2x DPR panel those samples are
//      already there.
//   2. An absolute buffer budget: 4K on the long axis, and 4K worth of pixels
//      overall, so a very large window cannot climb out through sheer size.
//   3. A floor of 0.5, so a downgrade can never make the image unreadable.
//
// Pure and exported so the policy is testable without a GPU, and so the
// Rendering inspector and the video menu cannot drift apart from it.
const RENDER_RATIO_CEILING = 2;
const RENDER_BUFFER_LONG_EDGE = 3840;
const RENDER_BUFFER_PIXELS = 3840 * 2160;

function resolvePixelRatio(input){
  const src = input || {};
  const size = src.size || {};
  const width = Math.max(1, Number(size.width) || 1);
  const height = Math.max(1, Number(size.height) || 1);
  const positive = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
  };
  const ceiling = Math.min(RENDER_RATIO_CEILING, positive(src.maxPixelRatio, RENDER_RATIO_CEILING));
  let ratio = positive(src.dpr, 1)
    * positive(src.presetRatio, 1)
    * positive(src.aaRatio, 1)
    * positive(src.rayRatio, 1)
    * positive(src.sessionScale, 1)
    * positive(src.resolutionScale, 1);
  ratio = Math.min(ratio, ceiling);
  ratio = Math.min(ratio, RENDER_BUFFER_LONG_EDGE / Math.max(width, height));
  ratio = Math.min(ratio, Math.sqrt(RENDER_BUFFER_PIXELS / (width * height)));
  return Math.max(.5, ratio);
}

// What the slider asks for is not always what the budget allows, so the row
// reports the buffer the renderer ACTUALLY got, in pixels. A resolution control
// that hides its own result is how the 8000 px viewport went unnoticed.
function formatRenderResolution(size, pixelRatio){
  const width = Math.round(Math.max(1, Number(size && size.width) || 1) * pixelRatio);
  const height = Math.round(Math.max(1, Number(size && size.height) || 1) * pixelRatio);
  return {width, height, megapixels:width * height / 1e6,
    label:width + ' × ' + height + ' px'};
}

function reportRenderResolution(size, pixelRatio){
  if(typeof document === 'undefined') return null;
  const report = formatRenderResolution(size, pixelRatio);
  const out = document.querySelector('output[for="videoResolution"]');
  if(out) out.value = report.label;
  const note = document.getElementById('videoResolutionNote');
  if(note){
    note.textContent = tr(
      'Rendering at ' + report.label + ' (' + report.megapixels.toFixed(1) + ' MP).',
      'Rendering a ' + report.label + ' (' + report.megapixels.toFixed(1) + ' MP).');
  }
  return report;
}

function clampNumber(value, fallback, min, max){
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
}

function normalizeVideoValues(input){
  const src = input || {};
  const qualityAliases = {Performance:'low', Balanced:'medium', High:'high', Low:'low', Medium:'medium', SuperHigh:'superhigh', Extreme:'extreme'};
  const aaAliases = {Performance:'off', Normal:'fxaa', High:'ssaa2x', normal:'fxaa', high:'ssaa2x'};
  const quality = qualityAliases[src.quality] || String(src.quality || VIDEO_DEFAULTS.quality).toLowerCase().replace(/[^a-z]/g, '');
  const antialiasing = aaAliases[src.antialiasing] || String(src.antialiasing || VIDEO_DEFAULTS.antialiasing).toLowerCase();
  return {
    quality: VIDEO_PRESETS[quality] ? quality : VIDEO_DEFAULTS.quality,
    // Manual render resolution, as a fraction of the window. Independent of the
    // quality preset on purpose: the preset is a bundle of choices, this is the
    // one knob that decides how many pixels get shaded.
    renderResolution: clampNumber(src.renderResolution, VIDEO_DEFAULTS.renderResolution, .5, 2),
    // Largest texture the engine will upload, in pixels on the long edge. An
    // imported 4K PBR set is 67 MB per map before mipmaps, so the default is
    // deliberately modest and raising it is an explicit choice.
    textureSize: TEXTURE_SIZES.includes(Math.round(Number(src.textureSize))) ? Math.round(Number(src.textureSize)) : VIDEO_DEFAULTS.textureSize,
    antialiasing: ['off','fxaa','ssaa2x','ssaa4x'].includes(antialiasing) ? antialiasing : VIDEO_DEFAULTS.antialiasing,
    rendererMode: ['raytracing','pathtracing'].includes(src.rendererMode) ? src.rendererMode : 'webgl',
    exposure: clampNumber(src.exposure, VIDEO_DEFAULTS.exposure, .7, 1.6),
    shadows: src.shadows !== false,
    shadowQuality: ['auto','low','medium','high','ultra'].includes(src.shadowQuality) ? src.shadowQuality : VIDEO_DEFAULTS.shadowQuality,
    shadowDistance: clampNumber(src.shadowDistance, VIDEO_DEFAULTS.shadowDistance, 15, 180),
    shadowBias: clampNumber(src.shadowBias, VIDEO_DEFAULTS.shadowBias, -.01, .01),
    shadowNormalBias: clampNumber(src.shadowNormalBias, VIDEO_DEFAULTS.shadowNormalBias, 0, .2),
    shadowSoftness: clampNumber(src.shadowSoftness, VIDEO_DEFAULTS.shadowSoftness, 0, 2),
    ambientOcclusion: src.ambientOcclusion !== false,
    aoQuality: ['low','medium','high','ultra'].includes(src.aoQuality) ? src.aoQuality : VIDEO_DEFAULTS.aoQuality,
    reflections: src.reflections !== false,
    reflectionQuality: ['low','medium','high','ultra'].includes(src.reflectionQuality) ? src.reflectionQuality : VIDEO_DEFAULTS.reflectionQuality,
    reflectionDistance: clampNumber(src.reflectionDistance, VIDEO_DEFAULTS.reflectionDistance, 5, 120),
    volumetricLighting: src.volumetricLighting !== false,
    cinematicLensFlares: src.cinematicLensFlares === true,
  };
}

function normalizeVideoProject(input){
  const src = input || {};
  const exposed = {};
  VIDEO_SETTING_KEYS.forEach(key => { exposed[key] = !src.exposed || src.exposed[key] !== false; });
  return {version:5, defaults:normalizeVideoValues(src.defaults || src), exposed};
}

function createVideo(options){
  const opts = options || {};
  const renderer = opts.renderer;
  const values = normalizeVideoValues();
  let project = normalizeVideoProject();
  let overlayTimer = 0;
  let warmProfileSnapshot = null;
  let appliedRendererMode = values.rendererMode;
  const presentationReasons = new Set();
  if(opts.initialPresentation) presentationReasons.add(
    typeof opts.initialPresentation === 'string' ? opts.initialPresentation : 'menu-overlay');
  if(typeof document !== 'undefined' && document.body){
    document.body.classList.toggle('lk-menu-presentation', presentationReasons.size > 0);
  }
  let benchmarkPreference = {userOverride:false, autoLow:false, fps:null};
  try { benchmarkPreference = Object.assign(benchmarkPreference, JSON.parse(localStorage.getItem(VIDEO_BENCHMARK_PREF_KEY) || 'null') || {}); }
  catch(err){}

  function writeBenchmarkPreference(){
    try { localStorage.setItem(VIDEO_BENCHMARK_PREF_KEY, JSON.stringify(benchmarkPreference)); }
    catch(err){}
  }

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
    const activeValues = presentationReasons.size ? menuRenderValues(values) : values;
    const preset = VIDEO_PRESETS[activeValues.quality] || VIDEO_PRESETS.high;
    const aaRatio = activeValues.antialiasing === 'off' ? .8 : (activeValues.antialiasing === 'ssaa2x' ? Math.SQRT2 : (activeValues.antialiasing === 'ssaa4x' ? 2 : 1));
    const rayRatio = 1;
    const dpr = opts.pixelRatio ? opts.pixelRatio() : window.devicePixelRatio;
    const size = opts.size ? opts.size() : {width: window.innerWidth, height: window.innerHeight};
    const mobile = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || window.innerWidth < 760;
    const backend=window.LK_RUNTIME_RENDERING_BACKEND,compat=backend&&backend.compatibilityProfile?backend.compatibilityProfile(renderer):null;
    const normalMaxPixelRatio = mobile ? 2 : (compat?compat.maxPixelRatio:4);
    const maxPixelRatio = presentationReasons.size
      ? Math.min(normalMaxPixelRatio, MENU_RENDER_PROFILE.maxPixelRatio)
      : normalMaxPixelRatio;
    const effectiveAaRatio=compat&&compat.conservativePost&&activeValues.antialiasing.indexOf('ssaa')===0?1:aaRatio;
    const sessionScale=backend&&backend.sessionOverrides?backend.sessionOverrides().renderScale:1;
    const pixelRatio = resolvePixelRatio({
      dpr, size, maxPixelRatio,
      presetRatio:preset.pixelRatio,
      aaRatio:effectiveAaRatio,
      rayRatio,
      sessionScale,
      resolutionScale:activeValues.renderResolution,
    });
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.width, size.height);
    reportRenderResolution(size, pixelRatio);
    // The budget applies to textures loaded from here on; anything already on
    // the GPU keeps the size it was uploaded at until the project reloads.
    const budget = window.LK_ENGINE_TEXTURE_BUDGET;
    if(budget) budget.setMaxSize(activeValues.textureSize);
    renderer.shadowMap.enabled = !!activeValues.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const primaryShadow = opts.scene && opts.scene.children && opts.scene.children.find(node => node && node.isDirectionalLight && node.castShadow && node.shadow);
    if(primaryShadow){
      const autoShadowQuality = activeValues.quality === 'low' ? 'low' : (activeValues.quality === 'medium' ? 'medium' : (activeValues.quality === 'extreme' ? 'ultra' : 'high'));
      const shadowProfile = SHADOW_PRESETS[activeValues.shadowQuality === 'auto' ? autoShadowQuality : activeValues.shadowQuality] || SHADOW_PRESETS.high;
      const shadowSize = shadowProfile.mapSize;
      if(primaryShadow.shadow.mapSize.x !== shadowSize){
        primaryShadow.shadow.mapSize.set(shadowSize, shadowSize);
        if(primaryShadow.shadow.map && primaryShadow.shadow.map.dispose) primaryShadow.shadow.map.dispose();
        primaryShadow.shadow.map = null;
      }
      const shadowCamera = primaryShadow.shadow.camera;
      const shadowDistance = activeValues.shadowDistance;
      if(shadowCamera && shadowCamera.isOrthographicCamera){
        shadowCamera.left = -shadowDistance;
        shadowCamera.right = shadowDistance;
        shadowCamera.top = shadowDistance;
        shadowCamera.bottom = -shadowDistance;
        shadowCamera.near = 1;
        shadowCamera.far = Math.max(180, shadowDistance * 4);
        shadowCamera.updateProjectionMatrix();
      }
      primaryShadow.shadow.bias = activeValues.shadowBias;
      primaryShadow.shadow.normalBias = activeValues.shadowNormalBias;
      primaryShadow.shadow.radius = shadowProfile.radius * activeValues.shadowSoftness;
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
          if(mat.envMapIntensity != null) mat.envMapIntensity = activeValues.reflections ? mat.userData.lkVideoBaseEnvMapIntensity : 0;
          // Video presets must never rewrite authored PBR properties. Making every
          // surface smoother and more metallic caused bright pools on asphalt and
          // made non-reflective ground enter the SSR pass.
          if(mat.roughness != null) mat.roughness = mat.userData.lkVideoBaseRoughness;
          if(mat.metalness != null) mat.metalness = mat.userData.lkVideoBaseMetalness;
          if(mat.needsUpdate != null) mat.needsUpdate = true;
        });
      });
    }
    const videoExposure = activeValues.exposure;
    renderer.userData = renderer.userData || {};
    renderer.userData.videoToneMappingExposure = videoExposure;
    renderer.toneMappingExposure = videoExposure;
    renderer.userData.videoSettings = Object.assign({}, activeValues, {
      preset:Object.assign({}, preset),
      presentationProfile:presentationReasons.size ? 'menu' : 'gameplay',
    });
    renderer.userData.lkCompatibilityProfile=compat;
    if(compat)document.body.dataset.lkGpuCompatibility=compat.conservativePost?'conservative':'full';
    document.body.classList.toggle('lk-renderer-raytracing', activeValues.rendererMode === 'raytracing');
    document.body.classList.toggle('lk-renderer-pathtracing', activeValues.rendererMode === 'pathtracing');
    document.body.classList.toggle('lk-volumetric-lighting', !!activeValues.volumetricLighting);
    document.body.classList.toggle('lk-cinematic-lens-flares', activeValues.cinematicLensFlares !== false);
    document.body.dataset.lkVideoQuality = activeValues.quality;
    document.body.dataset.lkPresentationProfile = presentationReasons.size ? 'menu' : 'gameplay';
    if(values.rendererMode!==appliedRendererMode){
      const previous=appliedRendererMode;
      appliedRendererMode=values.rendererMode;
      window.dispatchEvent(new CustomEvent('lotking:renderer-mode-change',{
        detail:{previous,mode:values.rendererMode},
      }));
    }
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

  function markUserOverride(){
    benchmarkPreference.userOverride = true;
    benchmarkPreference.autoLow = false;
    benchmarkPreference.updatedAt = new Date().toISOString();
    writeBenchmarkPreference();
    return Object.assign({}, benchmarkPreference);
  }

  function setWarmProfile(active){
    if(active){
      if(warmProfileSnapshot) return Promise.resolve(values);
      warmProfileSnapshot = Object.assign({}, values);
      // Warm exactly the authored profile. Constructing effects that the
      // project deliberately disabled (especially volumetrics on a software
      // or compatibility renderer) can leave a heavyweight composer pass
      // allocated after restoration. Enabled shadows/AO/reflections/shafts are
      // still rendered and compiled by the visible benchmark frame below.
      return apply();
    }
    if(!warmProfileSnapshot) return Promise.resolve(values);
    Object.assign(values, warmProfileSnapshot);
    warmProfileSnapshot = null;
    return apply();
  }

  function applyAdaptiveLow(report){
    const fps = Number(report && report.fps);
    benchmarkPreference.fps = Number.isFinite(fps) ? fps : null;
    benchmarkPreference.testedAt = new Date().toISOString();
    if(benchmarkPreference.userOverride){
      writeBenchmarkPreference();
      return Promise.resolve({applied:false, reason:'user-override', fps:benchmarkPreference.fps});
    }
    Object.assign(values, adaptiveLowValues(values));
    benchmarkPreference.autoLow = true;
    benchmarkPreference.updatedAt = new Date().toISOString();
    writeBenchmarkPreference();
    syncVideoControls(project, values);
    return apply().then(() => ({applied:true, reason:'below-25-fps', fps:benchmarkPreference.fps, values:Object.assign({}, values)}));
  }

  function setPresentationReason(reason, active){
    const key = String(reason || 'menu');
    const hadReason = presentationReasons.has(key);
    if(active) presentationReasons.add(key);
    else presentationReasons.delete(key);
    if(hadReason === presentationReasons.has(key)) return Promise.resolve(values);
    document.body.classList.toggle('lk-menu-presentation', presentationReasons.size > 0);
    return apply();
  }

  return {
    values,
    apply,
    presets:VIDEO_PRESETS,
    getProjectConfig,
    setProjectConfig,
    commitValues,
    markUserOverride,
    setWarmProfile,
    setPresentationReason,
    isMenuPresentation:() => presentationReasons.size > 0,
    effectiveValues:() => Object.assign({}, presentationReasons.size ? menuRenderValues(values) : values),
    applyAdaptiveLow,
    benchmarkPreference:() => Object.assign({}, benchmarkPreference),
  };
}

function syncVideoControls(project, values){
  const config = normalizeVideoProject(project);
  const selectors = {
    quality:'#videoQuality', renderResolution:'#videoResolution', textureSize:'#videoTextureSize', antialiasing:'#videoAA', rendererMode:'#videoRenderer',
    exposure:'#videoExposure', shadows:'#videoShadows', shadowQuality:'#videoShadowQuality',
    ambientOcclusion:'#videoAmbientOcclusion',aoQuality:'#videoAoQuality',
    reflections:'#videoReflections', reflectionQuality:'#videoReflectionQuality', reflectionDistance:'#videoReflectionDistance',
    volumetricLighting:'#videoVolumetricLighting',
    cinematicLensFlares:'#videoCinematicLensFlares',
  };
  Object.keys(selectors).forEach(key => {
    const input = document.querySelector(selectors[key]);
    if(input){
      if(input.type === 'checkbox') input.checked = !!values[key];
      else input.value = values[key];
      if(input.type === 'range'){
        const out = document.querySelector('output[for="' + input.id + '"]');
        if(out) out.value = key === 'reflectionDistance' ? Math.round(values[key]) + ' m' : Number(values[key]).toFixed(2) + '×';
      }
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
    if(opts.markVideoUserOverride) opts.markVideoUserOverride();
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
    const eyebrow = overlay && overlay.querySelector('.settingsEyebrow');
    const resume = document.getElementById('pauseResume');
    const backMenu = document.getElementById('pauseBackMenu');
    const tuneOpen = document.getElementById('openGameplayTune');
    const gameplayDifficulty = document.getElementById('gameplayDifficulty');
    const quality = document.getElementById('videoQuality');
    const resolution = document.getElementById('videoResolution');
    const textureSize = document.getElementById('videoTextureSize');
    const aa = document.getElementById('videoAA');
    const rendererMode = document.getElementById('videoRenderer');
    const exposure = document.getElementById('videoExposure');
    const shadows = document.getElementById('videoShadows');
    const shadowQuality = document.getElementById('videoShadowQuality');
    const ambientOcclusion = document.getElementById('videoAmbientOcclusion');
    const aoQuality = document.getElementById('videoAoQuality');
    const reflections = document.getElementById('videoReflections');
    const reflectionQuality = document.getElementById('videoReflectionQuality');
    const reflectionDistance = document.getElementById('videoReflectionDistance');
    const volumetricLighting = document.getElementById('videoVolumetricLighting');
    const cinematicLensFlares = document.getElementById('videoCinematicLensFlares');
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
      const optionsOnly = currentMode === 'options';
      overlay.classList.toggle('editor', currentMode === 'editor');
      overlay.classList.toggle('game', currentMode === 'game');
      overlay.classList.toggle('options-only', optionsOnly);
      overlay.querySelectorAll('[data-video-setting]').forEach(row => row.classList.toggle('hidden', currentMode !== 'editor' && row.dataset.videoExposed === 'false'));
      if(eyebrow) eyebrow.textContent = optionsOnly ? 'OPTIONS' : 'PAUSE';
      if(title) title.textContent = currentMode === 'editor' ? 'ENGINE EDITOR MENU' : (optionsOnly ? 'AUDIO / VIDEO' : 'GAME MENU');
      const activeTab = overlay.querySelector('[data-settings-tab].on');
      if((currentMode === 'editor' || optionsOnly) && activeTab &&
          (activeTab.dataset.settingsTab === 'gameplay' || (optionsOnly && activeTab.dataset.settingsTab === 'controls'))) setTab('audio');
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
      if(open || mode) configureMode(mode);
      const source = options && options.source;
      overlay.classList.toggle('open', open);
      btn.classList.toggle('open', open);
      gameState.paused = !!open && currentMode === 'game' && gameState.started;
      if(opts.onPresentationChange) opts.onPresentationChange(!!open, currentMode);
      if(opts.onOpenChange) opts.onOpenChange(!!open, currentMode);
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
    toggle = (mode, options) => {
      const opening = !overlay.classList.contains('open');
      setOpen(opening, opening ? mode : null, options);
    };

    btn.addEventListener('pointerdown', e => { lastButtonPointer = e.pointerType || 'mouse'; }, {passive: true});
    btn.addEventListener('click', () => {
      const mode = opts.resolveButtonMode ? opts.resolveButtonMode() : 'game';
      toggle(mode, {source: lastButtonPointer === 'touch' ? 'touch' : 'mouse'});
    });
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
    if(gameplayDifficulty){
      const difficulty=opts.gameplayDifficulty||window.LK_RUNTIME_GAMEPLAY_DIFFICULTY;
      gameplayDifficulty.value=difficulty&&difficulty.current?difficulty.current():'normal';
      gameplayDifficulty.addEventListener('change',()=>{
        if(difficulty&&difficulty.set)difficulty.set(gameplayDifficulty.value);
        gameplayDifficulty.value=difficulty&&difficulty.current?difficulty.current():gameplayDifficulty.value;
      });
      window.addEventListener('lotking:gameplay-difficulty-change',event=>{
        const value=event&&event.detail&&event.detail.difficulty;
        if(value)gameplayDifficulty.value=value;
      });
    }
    if(quality) quality.addEventListener('change', () => {
      if(video) video.quality = VIDEO_PRESETS[quality.value] ? quality.value : 'high';
      applyVideo({heavy:true, message:tr('Adjusting render quality…', 'Regolazione qualità rendering…')});
    });
    if(resolution){
      // The slider is a fraction of the window; `applyCore` writes the resulting
      // buffer back into the row, so the number the user reads is the number the
      // GPU is actually shading - including when the budget clamps the request.
      resolution.value = video && video.renderResolution != null ? video.renderResolution : VIDEO_DEFAULTS.renderResolution;
      const syncResolutionLabel = () => {
        const percent = document.querySelector('output[for="videoResolutionScale"]');
        if(percent) percent.value = Math.round(Number(resolution.value) * 100) + '%';
      };
      syncResolutionLabel();
      resolution.addEventListener('input', () => {
        if(video) video.renderResolution = clampNumber(resolution.value, VIDEO_DEFAULTS.renderResolution, .5, 2);
        syncResolutionLabel();
        applyVideo({heavy:true, message:tr('Resizing the render surface…', 'Ridimensionamento superficie di rendering…')});
      });
    }
    if(textureSize){
      textureSize.value = String(video && video.textureSize || VIDEO_DEFAULTS.textureSize);
      textureSize.addEventListener('change', () => {
        const wanted = Math.round(Number(textureSize.value));
        if(video) video.textureSize = TEXTURE_SIZES.includes(wanted) ? wanted : VIDEO_DEFAULTS.textureSize;
        applyVideo({heavy:true, message:tr('Applying the texture budget…', 'Applicazione budget texture…')});
      });
    }
    if(aa) aa.addEventListener('change', () => {
      if(video) video.antialiasing = aa.value;
      applyVideo({heavy:true, message:tr('Rebuilding the render surface…', 'Ricostruzione superficie di rendering…')});
    });
    if(rendererMode){
      rendererMode.value = video && video.rendererMode || 'webgl';
      rendererMode.addEventListener('change', () => {
        if(video) video.rendererMode = ['raytracing','pathtracing'].includes(rendererMode.value) ? rendererMode.value : 'webgl';
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
    if(shadowQuality){
      shadowQuality.value = video && video.shadowQuality || 'auto';
      shadowQuality.addEventListener('change', () => {
        if(video) video.shadowQuality = ['auto','low','medium','high','ultra'].includes(shadowQuality.value) ? shadowQuality.value : 'auto';
        applyVideo({heavy:true, message:tr('Rebuilding shadow maps…', 'Ricostruzione shadow map…')});
      });
    }
    if(ambientOcclusion){
      ambientOcclusion.checked=video?video.ambientOcclusion!==false:true;
      ambientOcclusion.addEventListener('change',()=>{if(video)video.ambientOcclusion=!!ambientOcclusion.checked;applyVideo({heavy:true,message:tr('Updating ambient occlusion…','Aggiornamento occlusione ambientale…')});});
    }
    if(aoQuality){
      aoQuality.value=video&&video.aoQuality||VIDEO_DEFAULTS.aoQuality;
      aoQuality.addEventListener('change',()=>{if(video)video.aoQuality=['low','medium','high','ultra'].includes(aoQuality.value)?aoQuality.value:VIDEO_DEFAULTS.aoQuality;applyVideo({heavy:true,message:tr('Rebuilding ambient occlusion…','Ricostruzione occlusione ambientale…')});});
    }
    if(exposure){
      const syncExposureOutput = () => {
        const out = document.querySelector('output[for="videoExposure"]');
        if(out) out.value = Number(exposure.value).toFixed(2) + '×';
      };
      exposure.value = video && video.exposure != null ? video.exposure : VIDEO_DEFAULTS.exposure;
      syncExposureOutput();
      exposure.addEventListener('input', () => {
        if(video) video.exposure = clampNumber(exposure.value, VIDEO_DEFAULTS.exposure, .7, 1.6);
        syncExposureOutput();
        applyVideo();
      });
    }
    if(reflections){
      reflections.checked = video ? video.reflections !== false : true;
      reflections.addEventListener('change', () => {
        if(video) video.reflections = !!reflections.checked;
        applyVideo({heavy:true, message:tr('Updating material reflections…', 'Aggiornamento riflessi dei materiali…')});
      });
    }
    if(reflectionQuality){
      reflectionQuality.value = video && video.reflectionQuality || VIDEO_DEFAULTS.reflectionQuality;
      reflectionQuality.addEventListener('change', () => {
        if(video) video.reflectionQuality = ['low','medium','high','ultra'].includes(reflectionQuality.value) ? reflectionQuality.value : VIDEO_DEFAULTS.reflectionQuality;
        applyVideo({heavy:true, message:tr('Rebuilding screen-space reflections…', 'Ricostruzione riflessi screen-space…')});
      });
    }
    if(reflectionDistance){
      const syncReflectionDistanceOutput = () => {
        const out = document.querySelector('output[for="videoReflectionDistance"]');
        if(out) out.value = Math.round(Number(reflectionDistance.value)) + ' m';
      };
      reflectionDistance.value = video && video.reflectionDistance != null ? video.reflectionDistance : VIDEO_DEFAULTS.reflectionDistance;
      syncReflectionDistanceOutput();
      reflectionDistance.addEventListener('input', () => {
        if(video) video.reflectionDistance = clampNumber(reflectionDistance.value, VIDEO_DEFAULTS.reflectionDistance, 5, 120);
        syncReflectionDistanceOutput();
        applyVideo();
      });
    }
    if(volumetricLighting){
      volumetricLighting.checked = !!(video && video.volumetricLighting);
      volumetricLighting.addEventListener('change', () => {
        if(video) video.volumetricLighting = !!volumetricLighting.checked;
        applyVideo({heavy:true, message:tr('Updating volumetric lighting…', 'Aggiornamento illuminazione volumetrica…')});
      });
    }
    if(cinematicLensFlares){
      cinematicLensFlares.checked = !!(video&&video.cinematicLensFlares);
      cinematicLensFlares.addEventListener('change', () => {
        if(video) video.cinematicLensFlares = !!cinematicLensFlares.checked;
        applyVideo({heavy:true, message:tr('Updating cinematic lens flares…', 'Aggiornamento lens flare cinematici…')});
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
      if(!input.dataset.audio) return;
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
    openOptions: options => {
      const config = options || {};
      setTab(config.tab === 'video' ? 'video' : 'audio');
      setOpen(true, 'options', {source:config.source || 'mouse'});
    },
    setAudioChannel,
    getMode: () => currentMode,
  };
}

window.LK_RUNTIME_SETTINGS_MENU = Object.freeze({
  createVideo, createMenu, presets:VIDEO_PRESETS, shadowPresets:SHADOW_PRESETS, defaults:VIDEO_DEFAULTS,
  normalizeValues:normalizeVideoValues, normalizeProject:normalizeVideoProject, adaptiveLowValues, menuRenderValues, syncControls:syncVideoControls,
  resolvePixelRatio, formatRenderResolution, textureSizes:TEXTURE_SIZES,
  renderBudget:Object.freeze({ratioCeiling:RENDER_RATIO_CEILING, longEdge:RENDER_BUFFER_LONG_EDGE, pixels:RENDER_BUFFER_PIXELS}),
  menuRenderProfile:MENU_RENDER_PROFILE,
});
})();
