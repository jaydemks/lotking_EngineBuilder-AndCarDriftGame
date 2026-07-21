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
assert(Object.keys(api.shadowPresets).join(',') === 'low,medium,high,ultra', 'four explicit shadow-map profiles are available');
assert(source.includes('mat.roughness = mat.userData.lkVideoBaseRoughness'), 'video settings restore authored PBR roughness');
assert(source.includes('mat.metalness = mat.userData.lkVideoBaseMetalness'), 'video settings restore authored PBR metalness');
assert(!source.includes('baseRoughness * .58') && !source.includes('baseMetalness + .18'), 'ray lighting does not make every scene material glossy and metallic');
assert(source.includes('videoToneMappingExposure'), 'video settings own the base tone-mapping exposure');
assert(source.includes('commitValues'), 'shared editor Video controls can commit the live values to project defaults');
assert(source.includes('dpr * preset.pixelRatio * aaRatio'), 'AA sampling scales from device resolution instead of being capped to it');

const hidden = api.normalizeProject({defaults:{quality:'extreme'}, exposed:{rendererMode:false}});
assert(hidden.defaults.quality === 'extreme', 'project default quality is normalized');
assert(hidden.exposed.rendererMode === false, 'author can hide renderer selection');
assert(hidden.exposed.quality === true, 'unspecified exposure remains enabled');
assert(hidden.version === 3, 'project video schema is upgraded to version 3');
assert(hidden.defaults.exposure === 1.12, 'r185 exposure default brightens the scene without camera grading');
assert(hidden.defaults.shadowNormalBias === .035, 'sun shadow acne protection has a stable project default');
assert(hidden.defaults.reflectionQuality === 'high' && hidden.defaults.reflectionDistance === 35, 'SSR has stable quality and ray-reach defaults');

console.log('video-settings.test.js: all assertions passed');
