/* =========================================================
   LOT KING — player camera runtime helpers
   Config defaults, cinematic aspect math, and scoped rendering.
   ========================================================= */
(function(){
'use strict';

const ASPECTS = Object.freeze({
  auto: null,
  '16:9': 16 / 9,
  '21:9': 21 / 9,
  '2.39:1': 2.39,
  '4:3': 4 / 3,
  '1:1': 1,
  '9:16': 9 / 16,
});
const CLEAR_RESTORE_COLOR = new THREE.Color();
const INTERIOR_CAMERA_VERSION = 3;
const INTERIOR_DEFAULTS = Object.freeze({
  interiorHeight: 1.15,
  interiorForward: .28,
  interiorLateral: -.42,
  interiorLookHeight: .04,
  interiorFov: 72,
  interiorLag: 18,
  interiorGForceMotion: 0,
  interiorAccelerationMotion: 0,
  interiorRoadShake: 0,
  interiorMotionLimit: .035,
  interiorSpeedFovGain: .025,
  interiorSpeedFovMax: 4.5,
});

function isLegacyCenteredInterior(source){
  if(!source || typeof source !== 'object') return false;
  const close = (value, expected) => value == null || Math.abs(Number(value) - expected) < .0001;
  const rotation = Array.isArray(source.interiorRotation) ? source.interiorRotation : null;
  const authoredRotation = rotation && rotation.some(value => Math.abs(Number(value) || 0) > .0001);
  return !authoredRotation &&
    close(source.interiorHeight, 1.15) &&
    close(source.interiorForward, .28) &&
    close(source.interiorLateral, 0) &&
    close(source.interiorLookHeight, .04) &&
    close(source.interiorFov, 72) &&
    close(source.interiorLag, 18);
}

function migrateConfig(source){
  const config = Object.assign({}, source || {});
  const oldVersion = Number(config.interiorCameraVersion) || 0;
  if(oldVersion < 2 && isLegacyCenteredInterior(config)){
    // Move only the untouched, old centred cockpit preset. A camera with any
    // authored placement/rotation is left exactly where its creator put it.
    config.interiorLateral = INTERIOR_DEFAULTS.interiorLateral;
  }
  if(oldVersion < 3){
    // v2 shipped these exact motion values as defaults. Migrate only untouched
    // presets; deliberately authored non-default strengths remain intact.
    if(config.interiorGForceMotion == null || Math.abs(Number(config.interiorGForceMotion) - .18) < .0001){
      config.interiorGForceMotion = 0;
    }
    if(config.interiorAccelerationMotion == null) config.interiorAccelerationMotion = 0;
    if(config.interiorRoadShake == null || Math.abs(Number(config.interiorRoadShake) - .08) < .0001){
      config.interiorRoadShake = 0;
    }
  }
  Object.keys(INTERIOR_DEFAULTS).forEach(key => {
    if(config[key] == null) config[key] = INTERIOR_DEFAULTS[key];
  });
  config.interiorCameraVersion = INTERIOR_CAMERA_VERSION;
  return config;
}

function createConfig(){
  return {
    aspect: 'auto',
    gameAutoAspect: false,
    letterboxColor: '#141518',   // fill outside the camera frame (dark grey by default)
    mode: 'free',
    fov: 62,
    near: .1,
    focusDistance: 12,
    fovSpeedGain: .16,
    fovSpeedMax: 20,
    minDist: 4.5,
    maxDist: 20,
    freePitch: .32,
    freeYawOffset: 0,
    lookHeight: 1.1,
    lateralOffset: 0,
    helperRange: 5,
    helperSize: .7,
    far: 500,
    fogDensity: 0.008,
    shake: 1,
    arcadeDistance: 9,
    arcadeHeight: 3.1,
    arcadeLag: 5.8,
    reverseFrontSpeed: 7,
    cinematicDriftOrbit: .18,
    cinematicDriftClose: 1.65,
    cinematicDriftHeight: .45,
    cinematicLag: 4.2,
    interiorCameraVersion: INTERIOR_CAMERA_VERSION,
    interiorHeight: INTERIOR_DEFAULTS.interiorHeight,
    interiorForward: INTERIOR_DEFAULTS.interiorForward,
    interiorLateral: INTERIOR_DEFAULTS.interiorLateral,
    interiorLookHeight: INTERIOR_DEFAULTS.interiorLookHeight,
    interiorFov: INTERIOR_DEFAULTS.interiorFov,
    interiorNear: .1,
    interiorFocusDistance: 9,
    interiorLag: INTERIOR_DEFAULTS.interiorLag,
    interiorGForceMotion: INTERIOR_DEFAULTS.interiorGForceMotion,
    interiorAccelerationMotion: INTERIOR_DEFAULTS.interiorAccelerationMotion,
    interiorRoadShake: INTERIOR_DEFAULTS.interiorRoadShake,
    interiorSpeedFovGain: INTERIOR_DEFAULTS.interiorSpeedFovGain,
    interiorSpeedFovMax: INTERIOR_DEFAULTS.interiorSpeedFovMax,
    externalRotation: null,
    interiorRotation: null,
    dof: {enabled:false, focus:9, aperture:.025, maxblur:.04, autoFocus:true, focusRadius:.16, feather:.38, showFocus:false},
    grade: {enabled:false, exposure:1, brightness:0, contrast:1, saturation:1, gamma:1},
  };
}

/** In PLAY the level's own default is the answer - a per-camera choice is an
 *  authoring aid and does not get to fight it - except on a phone, which is forced
 *  to 9:16 because letterboxing a portrait screen into a stripe is never right.
 *  `gameAutoAspect` is the author saying the level has no opinion, so the viewport
 *  fills; the phone rule still applies above it. See js/runtime/aspect-policy.js. */
function resolveGameAspect(cfg, width, height){
  const policy = window.LK_ASPECT_POLICY;
  if(!policy){
    // Kept so a shell that has not loaded the policy still renders something sane.
    if(cfg.gameAutoAspect) return {ratio:width / height, scoped:false};
    if(height > width) return {ratio:ASPECTS['9:16'], scoped:true};
    const named = ASPECTS[cfg.aspect];
    return named ? {ratio:named, scoped:true} : {ratio:width / height, scoped:false};
  }
  return policy.resolve({
    mode:'game',
    level:cfg.gameAutoAspect ? 'auto' : cfg.aspect,
    width,
    height,
  });
}
function aspectValue(cfg, width, height){
  return resolveGameAspect(cfg, width, height).ratio;
}

function renderRect(cfg, width, height){
  const resolved = resolveGameAspect(cfg, width, height);
  const policy = window.LK_ASPECT_POLICY;
  const rect = policy
    ? policy.fitRect(resolved, width, height)
    : (function(){
        let w = width, h = height;
        if(resolved.scoped){
          if(width / height > resolved.ratio) w = Math.round(height * resolved.ratio);
          else h = Math.round(width / resolved.ratio);
        }
        return {x:Math.round((width - w) / 2), y:Math.round((height - h) / 2), w, h, ratio:resolved.ratio, scoped:resolved.scoped};
      })();
  // `aspect` is the long-standing key every caller reads; keep it.
  return {x:rect.x, y:rect.y, w:rect.w, h:rect.h, aspect:resolved.ratio, scoped:!!rect.scoped};
}

function renderScoped(opts){
  const cfg = opts.config;
  const renderer = opts.renderer;
  const camera = opts.camera;
  const rect = renderRect(cfg, opts.width, opts.height);
  const ox = Math.round(opts.offsetX || 0);
  const oy = Math.round(opts.offsetY || 0);
  const clipped = rect.scoped || !!opts.clip;
  const backend = window.LK_RUNTIME_RENDERING_BACKEND;
  const viewportY = (bottomY, height) => backend && backend.viewportOriginY
    ? backend.viewportOriginY(renderer, bottomY, height, innerHeight)
    : (renderer && renderer.isWebGPURenderer ? innerHeight - bottomY - height : bottomY);
  camera.aspect = rect.aspect;
  camera.updateProjectionMatrix();

  if(clipped){
    const oldAlpha = renderer.getClearAlpha ? renderer.getClearAlpha() : 1;
    if(renderer.getClearColor) renderer.getClearColor(CLEAR_RESTORE_COLOR);
    if(opts.clearColor && renderer.setClearColor) renderer.setClearColor(opts.clearColor, 1);
    renderer.setScissorTest(true);
    const outerY = viewportY(oy, opts.height);
    renderer.setViewport(ox, outerY, opts.width, opts.height);
    renderer.setScissor(ox, outerY, opts.width, opts.height);
    renderer.clear();
    if(opts.clearColor && renderer.setClearColor) renderer.setClearColor(CLEAR_RESTORE_COLOR, oldAlpha);
    const frameY = viewportY(oy + rect.y, rect.h);
    renderer.setViewport(ox + rect.x, frameY, rect.w, rect.h);
    renderer.setScissor(ox + rect.x, frameY, rect.w, rect.h);
  }

  opts.render(rect);

  if(clipped){
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
  return rect;
}

window.LK_RUNTIME_PLAYER_CAMERA = Object.freeze({
  ASPECTS,
  INTERIOR_CAMERA_VERSION,
  INTERIOR_DEFAULTS,
  createConfig,
  migrateConfig,
  aspectValue,
  renderRect,
  renderScoped,
});
})();
