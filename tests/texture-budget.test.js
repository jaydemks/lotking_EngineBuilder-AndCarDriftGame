'use strict';

// The texture budget with no GPU and no DOM beyond a fake canvas: what matters
// here is which textures get resampled, to what, and which ones are left alone
// because resampling them would be wrong rather than merely unsupported.

const assert = require('node:assert/strict');

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// Minimal canvas stand-ins. `drawImage` records the size it was asked for, so a
// test can assert the resample target without pixels.
class FakeCanvas {
  constructor(){ this.width = 0; this.height = 0; this.drawn = null; }
  getContext(){
    const canvas = this;
    return {
      imageSmoothingEnabled:false,
      imageSmoothingQuality:'low',
      drawImage(image, x, y, width, height){ canvas.drawn = {image, width, height}; },
    };
  }
}
class FakeImage { constructor(width, height){ this.width = width; this.height = height; } }

global.window = global;
global.HTMLImageElement = FakeImage;
global.HTMLCanvasElement = FakeCanvas;
global.document = {createElement(tag){ return tag === 'canvas' ? new FakeCanvas() : {}; }};

require('../js/engine/texture-budget.js');
const BUDGET = global.window.LK_ENGINE_TEXTURE_BUDGET;

function texture(width, height, image){
  const data = image || new FakeImage(width, height);
  return {image:data, source:{data}, needsUpdate:false};
}

test('the module exposes a real ladder of sizes and a modest default', () => {
  assert.ok(BUDGET, 'the texture budget is registered');
  assert.equal(BUDGET.DEFAULT_MAX, 1024, 'the default cap is deliberately modest');
  assert.deepEqual(BUDGET.SIZES.slice(0, 3), [256, 512, 1024]);
  assert.equal(BUDGET.normalizeSize(3000), 2048, 'a request lands on the step at or below it');
  assert.equal(BUDGET.normalizeSize(99), 256, 'below the floor clamps to the floor');
  assert.equal(BUDGET.normalizeSize(99999), 8192, 'above the ceiling clamps to the ceiling');
  assert.equal(BUDGET.normalizeSize('nonsense'), 1024, 'a bad value falls back to the default');
});

test('an oversized texture is resampled onto its long edge, keeping aspect', () => {
  BUDGET.setMaxSize(1024);
  const tx = texture(4096, 2048);
  const result = BUDGET.fit(tx);
  assert.equal(result.resized, true, 'a 4K map is over the 1K cap');
  assert.deepEqual(result.from, [4096, 2048]);
  assert.equal(result.width, 1024, 'the long edge lands exactly on the cap');
  assert.equal(result.height, 512, 'and the aspect ratio survives');
  assert.equal(tx.image.width, 1024, 'the texture now points at the smaller canvas');
  assert.equal(tx.source.data, tx.image, 'the source follows the image, or three keeps uploading the old one');
  assert.equal(tx.needsUpdate, true, 'and it is queued for re-upload');
});

test('a texture already inside the budget is left completely alone', () => {
  BUDGET.setMaxSize(1024);
  const image = new FakeImage(512, 512);
  const tx = texture(512, 512, image);
  const result = BUDGET.fit(tx);
  assert.equal(result.resized, false);
  assert.equal(tx.image, image, 'the original image is untouched');
  assert.equal(tx.needsUpdate, false, 'and nothing is re-uploaded');
});

test('data, compressed and video textures are skipped rather than mangled', () => {
  BUDGET.setMaxSize(256);
  const data = {image:{width:2048, height:2048, data:new Uint8Array(4)}, source:{}, needsUpdate:false};
  const result = BUDGET.fit(data);
  assert.equal(result.resized, false, 'a DataTexture is not something you resample by drawing it');
  assert.equal(result.skipped, 'not-resizable');
  assert.equal(data.needsUpdate, false);
  assert.equal(BUDGET.fit({}), null, 'a texture with no image yet reports nothing');
});

test('the cap can be raised and lowered, and applies per call', () => {
  BUDGET.setMaxSize(512);
  assert.equal(BUDGET.maxSize(), 512);
  assert.equal(BUDGET.fit(texture(2048, 2048)).width, 512);
  assert.equal(BUDGET.fit(texture(2048, 2048), {maxSize:2048}).resized, false, 'an explicit cap wins for that call');
  BUDGET.setMaxSize(4096);
  assert.equal(BUDGET.fit(texture(2048, 2048)).resized, false, 'raising the cap stops the downscale');
});

test('a material has every map slot fitted, not just the albedo', () => {
  BUDGET.setMaxSize(512);
  const material = {
    map:texture(2048, 2048),
    normalMap:texture(2048, 2048),
    roughnessMap:texture(2048, 2048),
    emissiveMap:texture(256, 256),
    metalnessMap:null,
  };
  const count = BUDGET.fitMaterial(material);
  assert.equal(count, 3, 'the three oversized maps are resampled and the small one is not');
  assert.equal(material.normalMap.image.width, 512, 'the normal map is capped like any other');
});

test('an imported object is walked, arrays of materials included', () => {
  BUDGET.setMaxSize(512);
  const meshA = {material:{map:texture(4096, 4096)}};
  const meshB = {material:[{map:texture(4096, 4096)}, {normalMap:texture(4096, 4096)}]};
  const root = {traverse(fn){ fn(root); fn(meshA); fn(meshB); }};
  const count = BUDGET.fitObject(root);
  assert.equal(count, 3, 'every map on every material of every mesh is fitted');
  const stats = BUDGET.stats();
  assert.ok(stats.resized > 0 && stats.savedMegabytes > 0, 'the module reports what it saved');
});

console.log('\ntexture-budget tests passed');
