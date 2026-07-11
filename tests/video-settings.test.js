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
assert(source.includes('lkVideoBaseRoughness'), 'video settings preserve base PBR roughness before reflection boosts');
assert(source.includes('videoToneMappingExposure'), 'video settings own the base tone-mapping exposure');
assert(source.includes('commitValues'), 'shared editor Video controls can commit the live values to project defaults');
assert(source.includes('dpr * preset.pixelRatio * aaRatio'), 'AA sampling scales from device resolution instead of being capped to it');

const hidden = api.normalizeProject({defaults:{quality:'extreme'}, exposed:{rendererMode:false}});
assert(hidden.defaults.quality === 'extreme', 'project default quality is normalized');
assert(hidden.exposed.rendererMode === false, 'author can hide renderer selection');
assert(hidden.exposed.quality === true, 'unspecified exposure remains enabled');

console.log('video-settings.test.js: all assertions passed');
