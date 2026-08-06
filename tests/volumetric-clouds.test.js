'use strict';

// Volumetric clouds with no GPU: what matters here is that every authored
// number survives normalization and a save/load round trip unchanged, that the
// quality dials map onto a bounded march budget, and that the module keeps
// working when the 3D-texture path is unavailable instead of throwing.

const assert = require('node:assert/strict');

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

/* ---------- minimal Three.js stand-ins ---------- */

class V2 {
  constructor(x, y){ this.x = x || 0; this.y = y || 0; }
  set(x, y){ this.x = x; this.y = y; return this; }
  multiplyScalar(s){ this.x *= s; this.y *= s; return this; }
}
class V3 {
  constructor(x, y, z){ this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  copy(v){ this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  normalize(){
    const l = Math.hypot(this.x, this.y, this.z) || 1;
    this.x /= l; this.y /= l; this.z /= l; return this;
  }
}
class Col {
  constructor(hex){ this.r = ((hex >> 16) & 255) / 255; this.g = ((hex >> 8) & 255) / 255; this.b = (hex & 255) / 255; }
  copy(c){ this.r = c.r; this.g = c.g; this.b = c.b; return this; }
  lerp(c, t){ this.r += (c.r - this.r) * t; this.g += (c.g - this.g) * t; this.b += (c.b - this.b) * t; return this; }
  multiplyScalar(s){ this.r *= s; this.g *= s; this.b *= s; return this; }
}
class ShaderMaterial {
  constructor(options){ Object.assign(this, options); this.disposed = false; }
  dispose(){ this.disposed = true; }
}
class Mesh {
  constructor(geometry, material){ this.geometry = geometry; this.material = material; this.userData = {}; this.visible = true; }
}
class Data3DTexture {
  constructor(data, w, h, d){ this.image = {data, width: w, height: h, depth: d}; }
}

function makeThree(overrides){
  return Object.assign({
    Vector2: V2, Vector3: V3, Color: Col,
    ShaderMaterial, Mesh, Data3DTexture,
    SphereGeometry: class { constructor(r, a, b){ this.parameters = {r, a, b}; } },
    BackSide: 1, RGBAFormat: 1023, UnsignedByteType: 1009, LinearFilter: 1006, RepeatWrapping: 1000,
  }, overrides || null);
}

function makeScene(){ return {children: [], add(o){ this.children.push(o); }}; }
function makeCamera(y){
  return {getWorldPosition(target){ target.x = 0; target.y = y; target.z = 0; return target; }};
}
function makeSkyInfo(){
  return {sunDir: new V3(0, 1, 0), sunColor: new Col(0xfff2dd), ambient: new Col(0x86b4e2), dayF: .8, duskF: .1, nightF: 0};
}

global.window = global;
global.THREE = makeThree();

require('../js/runtime/volumetric-clouds.js');
const CLOUDS = global.window.LK_RUNTIME_VOL_CLOUDS;

const NUMERIC_KEYS = Object.keys(CLOUDS.RANGES);

/* ---------- configuration normalization ---------- */

test('defaults normalize to themselves and expose every authored key', () => {
  const normalized = CLOUDS.normalize(null);
  assert.deepEqual(normalized, CLOUDS.DEFAULTS, 'the shipped defaults are already a legal configuration');
  assert.equal(normalized.enabled, false, 'clouds stay off until a level asks for them');
  for(const key of NUMERIC_KEYS) assert.ok(key in normalized, key + ' is missing from a normalized config');
});

test('every numeric range clamps on both ends', () => {
  for(const key of NUMERIC_KEYS){
    const [min, max] = CLOUDS.RANGES[key];
    const low = CLOUDS.normalize({[key]: min - 1000});
    const high = CLOUDS.normalize({[key]: max + 1000});
    assert.equal(low[key], min, key + ' does not clamp to its minimum');
    assert.equal(high[key], max, key + ' does not clamp to its maximum');
  }
});

test('garbage values fall back to the default instead of poisoning a uniform', () => {
  for(const key of NUMERIC_KEYS){
    for(const junk of [undefined, null, NaN, 'nonsense', {}, Infinity, -Infinity]){
      const value = CLOUDS.normalize({[key]: junk})[key];
      assert.ok(Number.isFinite(value), key + ' produced a non-finite uniform from ' + String(junk));
    }
    assert.equal(CLOUDS.normalize({[key]: 'nonsense'})[key], CLOUDS.DEFAULTS[key], key + ' ignores its default for unreadable input');
  }
});

test('step-like settings stay integers and enabled stays strictly boolean', () => {
  const p = CLOUDS.normalize({quality: 17.6, lightSteps: 3.4, multiScatter: 2.5});
  assert.equal(p.quality, 18);
  assert.equal(p.lightSteps, 3);
  assert.equal(p.multiScatter, 3);
  assert.equal(CLOUDS.normalize({enabled: 'yes'}).enabled, false, 'only a real true enables the raymarch');
  assert.equal(CLOUDS.normalize({enabled: true}).enabled, true);
});

test('wind direction wraps instead of clamping', () => {
  assert.equal(CLOUDS.normalize({windAngle: -35}).windAngle, 325);
  assert.equal(CLOUDS.normalize({windAngle: 725}).windAngle, 5);
  assert.equal(CLOUDS.normalize({windAngle: 360}).windAngle, 0);
});

test('unknown keys are dropped so a stale project cannot smuggle in uniforms', () => {
  const p = CLOUDS.normalize({coverage: .5, bogusUniform: 12, __proto__: null});
  assert.equal(p.coverage, .5);
  assert.ok(!('bogusUniform' in p), 'a foreign key survived normalization');
});

test('authoring presets are normalized, editable snapshots rather than hidden modes', () => {
  for(const id of ['clear', 'cumulus', 'overcast', 'storm']){
    const values = CLOUDS.preset(id);
    assert.deepEqual(values, CLOUDS.normalize(values));
    assert.equal(typeof values.enabled, 'boolean');
    assert.ok(Number.isFinite(values.coverage));
  }
  const first = CLOUDS.preset('storm');
  first.coverage = 0;
  assert.notEqual(CLOUDS.preset('storm').coverage, 0, 'preset calls must never share mutable state');
  assert.equal(CLOUDS.preset('unknown').enabled, CLOUDS.preset('cumulus').enabled, 'unknown ids use the safe cumulus preset');
});

/* ---------- quality -> march budget ---------- */

test('quality maps onto a bounded step count', () => {
  const full = CLOUDS.stepBudget({quality: 40, resolutionScale: 1});
  assert.equal(full.steps, 40, 'maximum quality at full render scale uses the whole budget');
  assert.equal(full.steps, full.maxSteps, 'the budget never exceeds the shader loop bound');
  const low = CLOUDS.stepBudget({quality: 6, resolutionScale: .35});
  assert.equal(low.steps, CLOUDS.MIN_STEPS, 'the cheapest configuration still marches a usable minimum');
  let previous = 0;
  for(let quality = 6; quality <= 40; quality++){
    const steps = CLOUDS.stepBudget({quality, resolutionScale: 1}).steps;
    assert.ok(steps >= previous, 'raising quality must never reduce the step count');
    assert.ok(steps <= CLOUDS.MAX_STEPS, 'step count escaped the hard cap at quality ' + quality);
    previous = steps;
  }
});

test('render scale trims per-pixel work without touching the authored numbers', () => {
  const config = {quality: 40, lightSteps: 8, detail: 1, multiScatter: 4};
  const full = CLOUDS.stepBudget(Object.assign({resolutionScale: 1}, config));
  const cheap = CLOUDS.stepBudget(Object.assign({resolutionScale: .35}, config));
  assert.ok(cheap.steps < full.steps, 'render scale must cut marching steps');
  assert.ok(cheap.lightSteps < full.lightSteps, 'render scale must cut sun shadow taps');
  assert.ok(cheap.range < full.range, 'render scale must shorten the march reach');
  assert.ok(cheap.detail < full.detail, 'render scale must drop edge erosion first');
  assert.ok(cheap.lightSteps >= 1, 'at least one shadow tap always survives');
  assert.ok(cheap.scatterOctaves >= 1 && cheap.scatterOctaves <= CLOUDS.MAX_SCATTER_OCTAVES);
});

test('the budget is derived from a normalized config, never from raw input', () => {
  const budget = CLOUDS.stepBudget({quality: 5000, lightSteps: 5000, multiScatter: 5000, resolutionScale: 5000});
  assert.equal(budget.steps, CLOUDS.MAX_STEPS);
  assert.equal(budget.lightSteps, CLOUDS.MAX_LIGHT_STEPS);
  assert.equal(budget.scatterOctaves, CLOUDS.MAX_SCATTER_OCTAVES);
});

/* ---------- capability detection ---------- */

test('capability detection recognizes every unsupported backend', () => {
  assert.equal(CLOUDS.capabilities(null, makeThree()).volumeTextures, true, 'a plain WebGL2 build gets the 3D-texture path');
  assert.equal(CLOUDS.capabilities({capabilities: {isWebGL2: true}}, makeThree()).volumeTextures, true);
  assert.equal(CLOUDS.capabilities({capabilities: {isWebGL2: false}}, makeThree()).volumeTextures, false, 'WebGL 1 must fall back');
  assert.equal(CLOUDS.capabilities({isWebGPURenderer: true}, makeThree()).volumeTextures, false, 'the WebGPU backend must fall back');
  const noVolume = makeThree({Data3DTexture: undefined});
  assert.equal(CLOUDS.capabilities(null, noVolume).volumeTextures, false, 'a build without Data3DTexture must fall back');
  const previous = global.THREE;
  delete global.THREE;
  try {
    assert.equal(CLOUDS.capabilities(null).volumeTextures, false, 'no Three.js at all is still not a crash');
  } finally { global.THREE = previous; }
});

/* ---------- runtime instance ---------- */

test('a WebGL2 instance compiles the volume path and builds its noise once', () => {
  const scene = makeScene();
  const started = Date.now();
  const vc = CLOUDS.create({scene, renderer: {capabilities: {isWebGL2: true}}});
  assert.equal(scene.children.length, 1, 'the cloud dome joins the scene');
  assert.equal(vc.mesh.material.defines.LK_VOLUME_NOISE, '', 'the 3D-texture branch is compiled in');
  assert.equal(vc.mesh.material.premultipliedAlpha, true, 'integrated radiance is blended premultiplied');
  assert.equal(vc.capabilities().volumesReady, false, 'noise generation waits until the clouds are switched on');
  assert.equal(vc.mesh.userData.lkFlareTransmission instanceof Function, true, 'the sun flare can still query cloud occlusion');

  vc.set({enabled: true});
  assert.equal(vc.capabilities().volumesReady, true, 'enabling the clouds uploads the shape and detail volumes');
  assert.ok(vc.mesh.material.uniforms.tShape.value instanceof Data3DTexture);
  assert.ok(vc.mesh.material.uniforms.tDetail.value instanceof Data3DTexture);
  assert.equal(vc.isEnabled(), true);
  console.log('     noise + instance built in ' + (Date.now() - started) + ' ms (one-time cost)');
});

test('a build without 3D textures degrades to the procedural shader without throwing', () => {
  const previous = global.THREE;
  global.THREE = makeThree({Data3DTexture: undefined});
  try {
    const vc = CLOUDS.create({scene: makeScene(), renderer: {capabilities: {isWebGL2: false}}});
    assert.ok(!('LK_VOLUME_NOISE' in vc.mesh.material.defines), 'the sampler3D branch must be compiled out');
    assert.equal(vc.capabilities().volumeTextures, false);
    vc.set({enabled: true, coverage: .6});
    assert.equal(vc.isEnabled(), true, 'the fallback still renders clouds');
    assert.equal(vc.mesh.material.uniforms.tShape.value, null, 'no dangling sampler is bound');
    vc.sync(makeSkyInfo());
    vc.tick(1 / 60);
    assert.ok(vc.sunTransmission(makeCamera(2), new V3(.3, .8, .2)) <= 1);
  } finally { global.THREE = previous; }
});

test('a failing volume upload falls back at runtime instead of breaking the frame', () => {
  const previous = global.THREE;
  global.THREE = makeThree({Data3DTexture: function(){ throw new Error('out of texture memory'); }});
  try {
    const vc = CLOUDS.create({scene: makeScene(), renderer: {capabilities: {isWebGL2: true}}});
    assert.equal(vc.mesh.material.defines.LK_VOLUME_NOISE, '', 'the volume path is chosen optimistically');
    const optimistic = vc.mesh.material;
    vc.set({enabled: true});
    assert.equal(vc.capabilities().volumeTextures, false, 'the failure is remembered');
    assert.equal(vc.capabilities().volumesReady, false);
    assert.ok(!('LK_VOLUME_NOISE' in vc.mesh.material.defines), 'the material is rebuilt on the procedural branch');
    assert.equal(optimistic.disposed, true, 'the abandoned shader is released');
    assert.equal(vc.isEnabled(), true, 'clouds keep rendering after the fallback');
  } finally { global.THREE = previous; }
});

test('no setting is dropped on an editor / save / load round trip', () => {
  const vc = CLOUDS.create({scene: makeScene(), renderer: {capabilities: {isWebGL2: true}}});
  const authored = {
    enabled: true, coverage: .77, density: 2.4, scale: 3.1, detail: .82, speed: 2.5, windAngle: 213,
    altitude: 210, thickness: 145, quality: 28, absorption: 1.9, opacity: .66, anvil: .74,
    detailScale: 5.5, detailSpeed: 3.1, anisotropy: .81, backScatter: .44, silverLining: 1.7,
    powder: .21, multiScatter: 2, lightSteps: 7, ambient: 1.35, skyTint: .33, resolutionScale: .6,
  };
  vc.set(authored);
  const saved = vc.get();
  for(const key in authored) assert.equal(saved[key], authored[key], key + ' changed value on the way into the runtime');

  // the persistence path is collect -> JSON -> apply, so reload through it
  const reloaded = CLOUDS.create({scene: makeScene(), renderer: {capabilities: {isWebGL2: true}}});
  reloaded.set(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(reloaded.get(), saved, 'a saved cloud configuration does not drift when reloaded');
  assert.deepEqual(CLOUDS.normalize(saved), saved, 'normalization is idempotent on a stored configuration');

  // a partial patch, the way a single inspector slider sends it
  reloaded.set({coverage: .12});
  const patched = reloaded.get();
  assert.equal(patched.coverage, .12);
  for(const key in saved){
    if(key === 'coverage') continue;
    assert.equal(patched[key], saved[key], key + ' was reset by an unrelated slider');
  }
});

test('authored settings reach the shader uniforms and the march budget', () => {
  const vc = CLOUDS.create({scene: makeScene(), renderer: {capabilities: {isWebGL2: true}}});
  vc.set({enabled: true, quality: 40, resolutionScale: 1, coverage: .9, thickness: 200, windAngle: 0, speed: 3});
  const u = vc.mesh.material.uniforms;
  assert.equal(u.uSteps.value, 40);
  assert.equal(u.uCoverage.value, .9);
  assert.equal(u.uThickness.value, 200);
  assert.ok(Math.abs(u.uWind.value.x - 3) < 1e-6 && Math.abs(u.uWind.value.y) < 1e-6, 'wind angle and speed become a direction vector');
  assert.equal(u.uSteps.value, vc.budget().steps, 'the uniform and the reported budget cannot disagree');

  vc.set({coverage: 0});
  assert.equal(vc.isEnabled(), false, 'an empty sky stops rendering the dome entirely');
  vc.set({coverage: .5, opacity: 0});
  assert.equal(vc.isEnabled(), false, 'a fully transparent layer stops rendering the dome entirely');
});

test('day-night sync and ticking never allocate a new colour per frame', () => {
  const vc = CLOUDS.create({scene: makeScene(), renderer: {capabilities: {isWebGL2: true}}});
  const u = vc.mesh.material.uniforms;
  const low = u.uAmbientLow.value, high = u.uAmbientHigh.value, sun = u.uSunColor.value;
  vc.sync(makeSkyInfo());
  const noon = {r: high.r, g: high.g, b: high.b};
  vc.sync({sunDir: new V3(0, -1, 0), sunColor: new Col(0x9db4ff), ambient: new Col(0x060a14), dayF: 0, duskF: 0, nightF: 1});
  assert.equal(u.uAmbientLow.value, low, 'the ambient colour objects are reused');
  assert.equal(u.uAmbientHigh.value, high);
  assert.equal(u.uSunColor.value, sun);
  assert.ok(high.r < noon.r && high.g < noon.g, 'night tints the clouds darker than noon');
  vc.tick(.25);
  vc.tick(.25);
  assert.ok(Math.abs(u.uTime.value - .5) < 1e-9, 'wind animation advances with real time');
});

test('sun transmission answers the lens flare from the same density field', () => {
  const vc = CLOUDS.create({scene: makeScene(), renderer: {capabilities: {isWebGL2: true}}});
  assert.equal(vc.sunTransmission(makeCamera(2), new V3(0, 1, 0)), 1, 'disabled clouds never dim the sun');
  vc.set({enabled: true, coverage: .95, density: 3, absorption: 3, opacity: 1, altitude: 60, thickness: 200});
  const overcast = vc.sunTransmission(makeCamera(2), new V3(.2, .9, .1));
  assert.ok(overcast > 0 && overcast <= 1, 'transmission stays a legal 0..1 factor');
  vc.set({coverage: .02});
  assert.equal(vc.sunTransmission(makeCamera(2), new V3(.2, .9, .1)), 1, 'a clear sky leaves the flare untouched');
  vc.set({coverage: .95});
  assert.equal(vc.sunTransmission(makeCamera(2), new V3(0, -1, 0)), 1, 'a ray pointing at the ground never crosses the layer');
});

/* ---------- procedural noise volumes ---------- */

test('the noise volumes are deterministic, tileable and actually varied', () => {
  const a = CLOUDS.buildShapeVolume(8);
  const b = CLOUDS.buildShapeVolume(8);
  assert.equal(a.size, 8);
  assert.equal(a.data.length, 8 * 8 * 8 * 4);
  assert.deepEqual(Array.from(a.data), Array.from(b.data), 'the same seed must rebuild the same volume');

  let min = 255, max = 0;
  for(let i = 0; i < a.data.length; i += 4){ min = Math.min(min, a.data[i]); max = Math.max(max, a.data[i]); }
  assert.ok(max - min > 40, 'the shape channel is a noise field, not a flat value');

  const detail = CLOUDS.buildDetailVolume(8);
  assert.equal(detail.data.length, 8 * 8 * 8 * 4);

  // wrapped sampling: coordinate 0 and coordinate 1 are the same texel
  const here = CLOUDS.sampleVolume(a, .3, .4, .5, [0, 0, 0, 0]).slice();
  const wrapped = CLOUDS.sampleVolume(a, 1.3, -.6, 2.5, [0, 0, 0, 0]).slice();
  for(let c = 0; c < 4; c++) assert.ok(Math.abs(here[c] - wrapped[c]) < 1e-9, 'channel ' + c + ' does not tile');
  for(let c = 0; c < 4; c++) assert.ok(here[c] >= 0 && here[c] <= 1, 'sampled channels stay normalized');
});

console.log('\nvolumetric-clouds tests passed');
