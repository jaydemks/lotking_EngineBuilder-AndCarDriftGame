const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'settings-menu.js'), 'utf8');
const sandbox = {window:{}, console};
vm.runInNewContext(source, sandbox, {filename:'settings-menu.js'});
const api = sandbox.window.LK_RUNTIME_SETTINGS_MENU;

assert(api, 'video settings API is registered');
assert(Object.keys(api.presets).join(',') === 'low,medium,high,superhigh,extreme', 'five ordered quality presets are available');
assert(api.normalizeValues({quality:'Performance'}).quality === 'low', 'legacy Performance preset migrates to Low');
assert(api.normalizeValues({quality:'Balanced'}).quality === 'medium', 'legacy Balanced preset migrates to Medium');
assert(api.normalizeValues({antialiasing:'Normal'}).antialiasing === 'fxaa', 'legacy Normal AA migrates to FXAA');
assert(api.normalizeValues({antialiasing:'High'}).antialiasing === 'ssaa2x', 'legacy High AA migrates to 2x supersampling');
assert(api.normalizeValues({antialiasing:'ssaa4x'}).antialiasing === 'ssaa4x', '4x supersampling survives normalization');
assert(api.normalizeValues({rendererMode:'raytracing'}).rendererMode === 'raytracing', 'ray-lighting renderer survives normalization');
assert(api.normalizeValues({exposure:9}).exposure === 1.6, 'exposure is clamped to the safe authoring range');
assert(api.normalizeValues({shadowQuality:'ultra'}).shadowQuality === 'ultra', 'independent Ultra shadow quality survives normalization');
assert(api.normalizeValues({shadowDistance:4}).shadowDistance === 15, 'shadow coverage is clamped away from unusable values');
assert(api.normalizeValues({shadowBias:-.0008}).shadowBias === -.0008, 'project shadow bias survives normalization');
assert(api.normalizeValues({reflectionQuality:'ultra'}).reflectionQuality === 'ultra', 'Ultra SSR quality survives normalization');
assert(api.normalizeValues({reflectionDistance:500}).reflectionDistance === 120, 'SSR ray reach is clamped to the supported range');
assert(api.normalizeValues({ambientOcclusion:false}).ambientOcclusion === false, 'GTAO can be disabled explicitly');
assert(api.normalizeValues({aoQuality:'ultra'}).aoQuality === 'ultra', 'Ultra GTAO quality survives normalization');
const adaptiveLow = api.adaptiveLowValues({quality:'extreme', antialiasing:'ssaa4x', shadows:true, ambientOcclusion:true, reflections:true, volumetricLighting:true});
assert(adaptiveLow.quality === 'low' && adaptiveLow.antialiasing === 'off', 'adaptive fallback selects Low with antialiasing disabled');
assert(adaptiveLow.shadows === false && adaptiveLow.ambientOcclusion === false, 'adaptive fallback disables dynamic shadows and ambient occlusion');
assert(adaptiveLow.reflections === false && adaptiveLow.volumetricLighting === false, 'adaptive fallback disables reflections and volumetric light');
assert(Object.keys(api.shadowPresets).join(',') === 'low,medium,high,ultra', 'four explicit shadow-map profiles are available');
assert(source.includes('mat.roughness = mat.userData.lkVideoBaseRoughness'), 'video settings restore authored PBR roughness');
assert(source.includes('mat.metalness = mat.userData.lkVideoBaseMetalness'), 'video settings restore authored PBR metalness');
assert(!source.includes('baseRoughness * .58') && !source.includes('baseMetalness + .18'), 'ray lighting does not make every scene material glossy and metallic');
assert(source.includes('videoToneMappingExposure'), 'video settings own the base tone-mapping exposure');
assert(source.includes('commitValues'), 'shared editor Video controls can commit the live values to project defaults');
assert(source.includes('resolvePixelRatio({'), 'the render resolution goes through one shared policy instead of an inline product');

// The drawing buffer is what actually costs fill rate, and it is the product of
// FOUR multipliers. These cases are the ones that used to blow past 8000 px on
// the long axis, which is four times the fill rate of the panel it lands on.
{
  const px = api.resolvePixelRatio;
  const budget = api.renderBudget;
  assert(budget.ratioCeiling === 2, 'the effective pixel ratio is capped at 2');

  const hd = {width:1920, height:1080};
  assert(px({dpr:1, presetRatio:1, aaRatio:1, size:hd}) === 1, 'a plain 1x desktop stays at 1x');
  assert(px({dpr:2, presetRatio:1, aaRatio:Math.SQRT2, size:hd}) === 2,
    'High + SSAA 2x on a Retina panel is held at 2x instead of 2.83x');
  assert(px({dpr:2, presetRatio:1.7, aaRatio:2, maxPixelRatio:4, size:hd}) === 2,
    'Extreme + SSAA 4x cannot ask for 6.8x, or sixteen times the pixels of the window');

  const wide = {width:2560, height:1440};
  const wideRatio = px({dpr:2, presetRatio:1.35, aaRatio:Math.SQRT2, size:wide});
  assert(Math.round(wide.width * wideRatio) <= budget.longEdge,
    'a 1440p viewport never renders wider than the 4K budget, got ' + Math.round(wide.width * wideRatio));

  const uhd = {width:3840, height:2160};
  const uhdRatio = px({dpr:2, presetRatio:1, aaRatio:Math.SQRT2, size:uhd});
  assert(Math.abs(uhdRatio - 1) < 1e-9, 'a 4K viewport renders 1:1 rather than supersampling to 8K');
  assert(uhd.width * uhd.height * uhdRatio * uhdRatio <= budget.pixels + 1, 'the total pixel budget holds at 4K');

  assert(px({dpr:.25, presetRatio:.65, aaRatio:.8, size:hd}) === .5, 'the floor keeps a downgrade readable');
  assert(px({dpr:2, presetRatio:1, aaRatio:1, maxPixelRatio:1, size:hd}) === 1,
    'a compatibility profile that asks for a lower ceiling still wins');
}

// The manual resolution control: one knob that decides how many pixels get
// shaded, independent of the quality preset bundle.
{
  const px = api.resolvePixelRatio;
  const hd = {width:1920, height:1080};
  assert(api.defaults.renderResolution === 1, 'render resolution defaults to the window size');
  assert(api.normalizeValues({renderResolution:3}).renderResolution === 2, 'render resolution clamps at 200%');
  assert(api.normalizeValues({renderResolution:.1}).renderResolution === .5, 'render resolution clamps at 50%');
  assert(api.normalizeValues({renderResolution:'nonsense'}).renderResolution === 1, 'a bad value falls back to 100%');
  assert(api.normalizeValues({}).renderResolution === 1, 'existing projects without the key default to 100%');

  const half = px({dpr:1, presetRatio:1, aaRatio:1, resolutionScale:.5, size:hd});
  assert(half === .5, '50% halves the buffer, got ' + half);
  assert(px({dpr:1, presetRatio:1, aaRatio:1, resolutionScale:2, size:hd}) === 2, '200% doubles it, up to the ceiling');
  assert(px({dpr:2, presetRatio:1, aaRatio:Math.SQRT2, resolutionScale:2, size:hd}) === 2,
    'the manual control cannot be used to escape the ratio ceiling');

  const shown = api.formatRenderResolution(hd, .5);
  assert(shown.label === '960 × 540 px', 'the row reports the real buffer, got ' + shown.label);
  assert(Math.abs(shown.megapixels - .518) < .01, 'and its pixel count');
}
assert(source.includes("values.antialiasing.indexOf('ssaa')===0?1:aaRatio"), 'Apple/WebKit compatibility avoids multiplying Retina DPR by SSAA a second time');
assert(source.includes("reason:'user-override'"), 'manual video choices prevent a later benchmark from forcing Low again');

const hidden = api.normalizeProject({defaults:{quality:'extreme'}, exposed:{rendererMode:false}});
assert(hidden.defaults.quality === 'extreme', 'project default quality is normalized');
assert(hidden.exposed.rendererMode === false, 'author can hide renderer selection');
assert(hidden.exposed.quality === true, 'unspecified exposure remains enabled');
assert(hidden.version === 4, 'project video schema is upgraded to version 4');
assert(hidden.defaults.exposure === 1.12, 'r185 exposure default brightens the scene without camera grading');
assert(hidden.defaults.shadowNormalBias === .035, 'sun shadow acne protection has a stable project default');
assert(hidden.defaults.reflectionQuality === 'high' && hidden.defaults.reflectionDistance === 35, 'SSR has stable quality and ray-reach defaults');
assert(hidden.defaults.ambientOcclusion === true && hidden.defaults.aoQuality === 'medium', 'r185 GTAO has a guided project default');

console.log('video-settings.test.js: all assertions passed');
