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

function createConfig(){
  return {
    aspect: 'auto',
    mode: 'free',
    fov: 62,
    fovSpeedGain: .16,
    fovSpeedMax: 20,
    minDist: 4.5,
    maxDist: 20,
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
    dof: {enabled:false, focus:9, aperture:.025, maxblur:.04, autoFocus:true, focusRadius:.16, feather:.38, showFocus:false},
    grade: {enabled:false, exposure:1, brightness:0, contrast:1, saturation:1, gamma:1},
  };
}

function aspectValue(cfg, width, height){
  return ASPECTS[cfg.aspect] || (width / height);
}

function renderRect(cfg, width, height){
  const aspect = aspectValue(cfg, width, height);
  const screenAspect = width / height;
  let w = width;
  let h = height;
  if(ASPECTS[cfg.aspect]){
    if(screenAspect > aspect) w = Math.round(height * aspect);
    else h = Math.round(width / aspect);
  }
  return {
    x: Math.round((width - w) / 2),
    y: Math.round((height - h) / 2),
    w,
    h,
    aspect,
    scoped: !!ASPECTS[cfg.aspect],
  };
}

function renderScoped(opts){
  const cfg = opts.config;
  const renderer = opts.renderer;
  const camera = opts.camera;
  const rect = renderRect(cfg, opts.width, opts.height);
  const ox = Math.round(opts.offsetX || 0);
  const oy = Math.round(opts.offsetY || 0);
  const clipped = rect.scoped || !!opts.clip;
  camera.aspect = rect.aspect;
  camera.updateProjectionMatrix();

  if(clipped){
    const oldAlpha = renderer.getClearAlpha ? renderer.getClearAlpha() : 1;
    if(renderer.getClearColor) renderer.getClearColor(CLEAR_RESTORE_COLOR);
    if(opts.clearColor && renderer.setClearColor) renderer.setClearColor(opts.clearColor, 1);
    renderer.setScissorTest(true);
    renderer.setViewport(ox, oy, opts.width, opts.height);
    renderer.setScissor(ox, oy, opts.width, opts.height);
    renderer.clear();
    if(opts.clearColor && renderer.setClearColor) renderer.setClearColor(CLEAR_RESTORE_COLOR, oldAlpha);
    renderer.setViewport(ox + rect.x, oy + rect.y, rect.w, rect.h);
    renderer.setScissor(ox + rect.x, oy + rect.y, rect.w, rect.h);
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
  createConfig,
  aspectValue,
  renderRect,
  renderScoped,
});
})();
