'use strict';

// Node coverage for js/engine/procedural-surfaces.js. There is no DOM in node,
// so the browser globals the module needs (document.createElement('canvas') and
// THREE) are stubbed the same way the other node tests stub them: enough API to
// run the real code paths, plus counters so the caching contract can be proven
// by counting instead of by inspection.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;

// ------------------------------------------------ fake canvas

const counters = {canvases:0, imageData:0};

function fakeImageData(size){
  counters.imageData++;
  return {width:size, height:size, data:new Uint8ClampedArray(size * size * 4)};
}

function fakeContext(canvas){
  const calls = {fillRect:0, arc:0, stroke:0, ellipse:0, drawImage:0, putImageData:0};
  return {
    canvas,
    calls,
    fillStyle:'#000', strokeStyle:'#000', lineWidth:1, lineCap:'butt', lineJoin:'miter',
    globalAlpha:1, globalCompositeOperation:'source-over',
    save(){}, restore(){}, translate(){}, rotate(){}, scale(){},
    beginPath(){}, closePath(){}, moveTo(){}, lineTo(){},
    arc(){ calls.arc++; }, ellipse(){ calls.ellipse++; },
    fill(){}, stroke(){ calls.stroke++; },
    fillRect(){ calls.fillRect++; }, clearRect(){}, rect(){},
    drawImage(){ calls.drawImage++; },
    createImageData(w){ return fakeImageData(w); },
    putImageData(){ calls.putImageData++; },
    getImageData(x, y, w){ return fakeImageData(w); },
  };
}

global.document = {
  createElement(tag){
    if(tag !== 'canvas') return {};
    counters.canvases++;
    const canvas = {width:0, height:0};
    let ctx = null;
    canvas.getContext = () => (ctx || (ctx = fakeContext(canvas)));
    return canvas;
  },
};

// ------------------------------------------------ fake THREE

class FakeVector2 {
  constructor(x, y){ this.x = x || 0; this.y = y || 0; }
  set(x, y){ this.x = x; this.y = y; return this; }
}
let textureInstances = 0;
class FakeTexture {
  constructor(image){
    textureInstances++;
    this.image = image || null;
    // Mirrors three: clones share `source`, which is what makes the GPU upload
    // shared and the per-object clone cheap.
    this.source = {data:image || null};
    this.flipY = true;
    this.repeat = new FakeVector2(1, 1);
    this.offset = new FakeVector2(0, 0);
    this.center = new FakeVector2(0, 0);
    this.userData = {};
    this.colorSpace = '';
    this.wrapS = this.wrapT = 1000;
    this.anisotropy = 1;
    this.generateMipmaps = true;
    this.minFilter = 0;
    this.needsUpdate = false;
    this.disposed = false;
  }
  clone(){
    const copy = new FakeTexture(this.image);
    copy.source = this.source;
    copy.repeat = new FakeVector2(this.repeat.x, this.repeat.y);
    copy.colorSpace = this.colorSpace;
    copy.wrapS = this.wrapS; copy.wrapT = this.wrapT;
    copy.anisotropy = this.anisotropy;
    copy.userData = {};
    return copy;
  }
  dispose(){ this.disposed = true; }
}
// A DataTexture over a private pixel copy is the shape the module ships: no
// canvas is kept alive past generation.
class FakeDataTexture extends FakeTexture {
  constructor(data, width, height, format, type){
    super({data, width, height});
    this.isDataTexture = true;
    this.data = data;
    this.format = format;
    this.type = type;
  }
  clone(){
    const copy = new FakeDataTexture(this.data, this.image.width, this.image.height, this.format, this.type);
    copy.source = this.source;
    copy.repeat = new FakeVector2(this.repeat.x, this.repeat.y);
    copy.colorSpace = this.colorSpace;
    copy.flipY = this.flipY;
    copy.anisotropy = this.anisotropy;
    copy.userData = {};
    return copy;
  }
}
global.THREE = {
  RepeatWrapping:1000,
  SRGBColorSpace:'srgb',
  NoColorSpace:'',
  LinearSRGBColorSpace:'srgb-linear',
  LinearMipmapLinearFilter:1008,
  LinearFilter:1006,
  RGBAFormat:1023,
  UnsignedByteType:1009,
  DataTexture:FakeDataTexture,
  CanvasTexture:FakeTexture,
  Texture:FakeTexture,
  Vector2:FakeVector2,
};

function fakeStandardMaterial(){
  return {
    isMeshStandardMaterial:true,
    map:null, normalMap:null, roughnessMap:null, metalnessMap:null,
    normalScale:new FakeVector2(1, 1),
    roughness:.92, metalness:0,
    needsUpdate:false,
  };
}
function fakeBasicMaterial(){
  return {isMeshBasicMaterial:true, map:null, needsUpdate:false};
}

require('../js/engine/procedural-surfaces.js');
const SURF = global.LK_ENGINE_PROCEDURAL_SURFACES;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

const EXPECTED_KINDS = [
  'concrete', 'concreteSmooth', 'asphalt', 'dirt', 'gravel', 'sand',
  'metalPainted', 'metalCorrugated', 'metalRusted', 'metalTread',
  'wood', 'plywood', 'sandbag', 'brick', 'cinderblock', 'rubber', 'tarp', 'plaster',
  // sport / stadium family
  'turf', 'turfStriped', 'stadiumSeat', 'runningTrack', 'advertBoard',
  // snow family (snowboarding level template)
  'snowPowder', 'snowGroomed', 'snowPacked', 'snowIce', 'snowRock',
];

// ------------------------------------------------ registry

test('every level-dressing kind is registered with a label, a group and defaults', () => {
  EXPECTED_KINDS.forEach(kind => assert.ok(SURF.has(kind), 'missing kind ' + kind));
  const entries = SURF.list();
  assert.equal(entries.length, EXPECTED_KINDS.length);
  const ids = entries.map(entry => entry.id).sort();
  assert.deepEqual(ids, EXPECTED_KINDS.slice().sort());
  entries.forEach(entry => {
    assert.ok(entry.label && typeof entry.label === 'string', entry.id + ' has no label');
    assert.ok(entry.labelIt && typeof entry.labelIt === 'string', entry.id + ' has no italian label');
    assert.ok(['ground', 'concrete', 'metal', 'wood', 'masonry', 'fabric', 'sport', 'snow', 'misc'].includes(entry.group), entry.id + ' has an unknown group');
    assert.ok(entry.tile > 0, entry.id + ' has no default tile');
    assert.ok(entry.roughness >= 0 && entry.roughness <= 1, entry.id + ' roughness hint out of range');
    assert.ok(entry.metalness >= 0 && entry.metalness <= 1, entry.id + ' metalness hint out of range');
    assert.ok(entry.size >= 256 && entry.size <= 512, entry.id + ' texture size outside the 256..512 budget');
    assert.equal(typeof entry.roughnessMap, 'boolean', entry.id + ' does not declare whether it emits a roughness map');
  });
  // Roughness maps cost a third of the surface memory budget and are only
  // visible on specular surfaces, so most kinds deliberately go without.
  const withRoughness = entries.filter(entry => entry.roughnessMap).map(entry => entry.id);
  assert.ok(withRoughness.length >= 3 && withRoughness.length <= 8, 'roughness maps are budgeted: ' + withRoughness.join(','));
  assert.ok(withRoughness.includes('metalRusted') && withRoughness.includes('metalPainted'));
});

test('unknown kinds are refused rather than half-applied', () => {
  assert.equal(SURF.has('marzipan'), false);
  assert.equal(SURF.defaults('marzipan'), null);
  assert.equal(SURF.normalize('marzipan'), null);
  assert.equal(SURF.normalize({kind:'marzipan'}), null);
  assert.equal(SURF.normalize(null), null);
  assert.equal(SURF.normalize(undefined), null);
  assert.equal(SURF.normalize(false), null);
  assert.equal(SURF.normalize(42), null);
  assert.equal(SURF.normalize({}), null);
});

// ------------------------------------------------ normalization

test('the shorthand string and the object form normalize to the same canonical spec', () => {
  const shorthand = SURF.normalize('concrete');
  const object = SURF.normalize({kind:'concrete'});
  assert.deepEqual(shorthand, object);
  assert.equal(shorthand.kind, 'concrete');
  assert.equal(shorthand.tile, SURF.defaults('concrete').tile);
  assert.equal(shorthand.seed, 0);
  assert.equal(shorthand.strength, 1);
  assert.equal(shorthand.rotate, 0);
});

test('normalize clamps and squares up every authored field', () => {
  const spec = SURF.normalize({kind:'metalCorrugated', tile:2.4, seed:3.7, strength:.8, rotate:90});
  assert.deepEqual(spec, {kind:'metalCorrugated', tile:2.4, seed:3, strength:.8, rotate:90});
  assert.equal(SURF.normalize({kind:'wood', strength:5}).strength, 1);
  assert.equal(SURF.normalize({kind:'wood', strength:-3}).strength, 0);
  assert.equal(SURF.normalize({kind:'wood', rotate:45}).rotate, 0);
  assert.equal(SURF.normalize({kind:'wood', rotate:270}).rotate, 90);
  assert.equal(SURF.normalize({kind:'wood', rotate:'90'}).rotate, 90);
  assert.equal(SURF.normalize({kind:'wood', tile:'nope'}).tile, SURF.defaults('wood').tile);
  assert.equal(SURF.normalize({kind:'wood', tile:0}).tile > 0, true);
  assert.equal(SURF.normalize({kind:'wood', seed:-4}).seed, 0);
  // A level handing out one seed per object must wrap into the variant pool
  // instead of minting a texture set per integer.
  assert.equal(SURF.SEED_VARIANTS, 4);
  assert.equal(SURF.normalize({kind:'wood', seed:9}).seed, 1);
  assert.equal(SURF.normalize({kind:'wood', seed:400}).seed, 0);
  // Optional per-object response overrides survive normalization.
  const tuned = SURF.normalize({kind:'brick', roughness:.5, metalness:.2});
  assert.equal(tuned.roughness, .5);
  assert.equal(tuned.metalness, .2);
  assert.equal(SURF.normalize({kind:'brick'}).roughness, undefined);
});

test('normalize is idempotent, so surfaceTexture survives save -> reload -> save', () => {
  const first = SURF.normalize({kind:'sandbag', tile:1.1, seed:9, strength:.6, rotate:90});
  const second = SURF.normalize(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(second, first);
  const third = SURF.normalize(JSON.parse(JSON.stringify(second)));
  assert.deepEqual(third, first);
});

// ------------------------------------------------ world-space tiling

test('world size follows the real geometry of each primitive, not its UVs', () => {
  // box: BoxGeometry(2,2,2) scaled by half-extents.
  const cube = SURF.worldSize({prim:'box', scale:[1, 1, 1]});
  assert.equal(Math.round(cube.u * 1000) / 1000, 2);
  assert.equal(Math.round(cube.v * 1000) / 1000, 2);
  // A 52 x 4 x 0.5 m wall: the dominant face must drive both axes.
  const wall = SURF.worldSize({prim:'box', scale:[26, 2, .25]});
  assert.ok(Math.abs(wall.u - 52) < 1.5, 'wall U ' + wall.u);
  assert.ok(Math.abs(wall.v - 4) < .5, 'wall V ' + wall.v);
  // plane: PlaneGeometry(4,4) scaled [w/4, 1, d/4].
  const floor = SURF.worldSize({prim:'plane', scale:[56 / 4, 1, 96 / 4]});
  assert.equal(floor.u, 56);
  assert.equal(floor.v, 96);
  // cylinder: CylinderGeometry(1,1,2,20) scaled [r, h/2, r]; U wraps the girth.
  const drum = SURF.worldSize({prim:'cylinder', scale:[.3, 1.5 / 2, .3]});
  assert.ok(Math.abs(drum.u - 2 * Math.PI * .3) < 1e-6);
  assert.equal(drum.v, 1.5);
  // Missing scale still yields a sane size rather than NaN or zero.
  const fallback = SURF.worldSize({prim:'box'});
  assert.equal(fallback.u, 2);
  assert.equal(fallback.v, 2);
  const junk = SURF.worldSize({prim:'box', scale:['x', null, undefined]});
  assert.ok(Number.isFinite(junk.u) && junk.u > 0);
});

test('texel density is identical on a 52 m wall and a 0.6 m crate', () => {
  const spec = {kind:'concrete', tile:3};
  const wall = SURF.repeatFor(spec, {prim:'box', scale:[26, 2, .25]});
  const crate = SURF.repeatFor(spec, {prim:'box', scale:[.3, .3, .3]});
  // repeat / metres must match: that ratio IS the texel density.
  const wallSize = SURF.worldSize({prim:'box', scale:[26, 2, .25]});
  const crateSize = SURF.worldSize({prim:'box', scale:[.3, .3, .3]});
  assert.ok(Math.abs(wall.x / wallSize.u - crate.x / crateSize.u) < 1e-9);
  assert.ok(Math.abs(wall.x / wallSize.u - 1 / 3) < 1e-9);
  assert.ok(Math.abs(crate.x - .6 / 3) < 1e-9);
});

test('the tile prop is metres per repeat and an unknown spec never divides by zero', () => {
  const tight = SURF.repeatFor({kind:'brick', tile:.9}, {prim:'plane', scale:[1, 1, 1]});
  const loose = SURF.repeatFor({kind:'brick', tile:1.8}, {prim:'plane', scale:[1, 1, 1]});
  assert.ok(Math.abs(tight.x - loose.x * 2) < 1e-9);
  assert.deepEqual(SURF.repeatFor('marzipan', {prim:'box', scale:[4, 4, 4]}), {x:1, y:1});
  const huge = SURF.repeatFor({kind:'sand', tile:.02}, {prim:'plane', scale:[400, 1, 400]});
  assert.ok(huge.x <= 256 && huge.y <= 256, 'repeat must stay clamped');
});

// ------------------------------------------------ material application

test('apply dresses a standard material with the full map set and the kind hints', () => {
  const material = fakeStandardMaterial();
  const applied = SURF.apply(material, 'metalRusted', {prim:'box', scale:[1, 1, 1]});
  assert.equal(applied.kind, 'metalRusted');
  assert.ok(material.map && material.normalMap && material.roughnessMap, 'missing map slots');
  assert.equal(material.map.colorSpace, 'srgb', 'albedo must be decoded from sRGB');
  assert.equal(material.normalMap.colorSpace, '', 'normal map must stay linear');
  assert.equal(material.roughnessMap.colorSpace, '', 'roughness map must stay linear');
  assert.ok(material.map.anisotropy >= 1);
  assert.equal(material.map.wrapS, THREE.RepeatWrapping);
  assert.equal(material.roughness, SURF.defaults('metalRusted').roughness);
  assert.equal(material.metalness, SURF.defaults('metalRusted').metalness);
});

// Regression: the first cut kept one canvas alive per generated map. A dressed
// level needs ~70 sets, that was ~300 live canvas backing stores, the browser
// stopped honouring the later ones, and the LAST map generated per set - the
// derived roughness map - reached the GPU with no pixels. An incomplete texture
// makes every draw call that samples it fail with GL_INVALID_OPERATION
// ("mismatch between texture format and sampler type") and the object vanishes.
test('maps are RGBA byte data textures and no canvas is retained per set', () => {
  SURF.dispose();
  const canvasesBefore = counters.canvases;
  ['concrete', 'metalPainted', 'brick', 'sand', 'gravel', 'wood'].forEach(kind => {
    SURF.apply(fakeStandardMaterial(), {kind, seed:1}, {prim:'box', scale:[6, 3, .3]});
  });
  assert.ok(counters.canvases - canvasesBefore <= 1, 'generation must reuse one scratch canvas, allocated ' + (counters.canvases - canvasesBefore));
  assert.ok(SURF.stats().liveCanvases <= 2, 'no canvas may be retained per texture set');
  const material = fakeStandardMaterial();
  SURF.apply(material, 'metalPainted', {prim:'box', scale:[1, 1, 1]});
  ['map', 'normalMap', 'roughnessMap', 'metalnessMap'].forEach(slot => {
    const texture = material[slot];
    assert.ok(texture, 'metalPainted must produce ' + slot);
    assert.equal(texture.isDataTexture, true, slot + ' must be a data texture');
    assert.equal(texture.format, THREE.RGBAFormat, slot + ' must be RGBA (three reads roughness from G, metalness from B)');
    assert.equal(texture.type, THREE.UnsignedByteType, slot + ' must be unsigned byte');
    assert.equal(texture.data.length, 256 * 256 * 4, slot + ' must carry a full pixel buffer');
    assert.equal(texture.flipY, false, slot + ' pre-flips its rows on the CPU');
  });
});

test('per-object roughness / metalness overrides beat the kind hint', () => {
  const material = fakeStandardMaterial();
  SURF.apply(material, {kind:'metalPainted', roughness:.2, metalness:.9}, {prim:'box', scale:[1, 1, 1]});
  assert.equal(material.roughness, .2);
  assert.equal(material.metalness, .9);
  const untouched = fakeStandardMaterial();
  SURF.apply(untouched, 'metalPainted', {prim:'box', scale:[1, 1, 1], hints:false});
  assert.equal(untouched.roughness, .92);
});

test('unlit and unknown inputs leave the material completely alone', () => {
  const basic = fakeBasicMaterial();
  assert.equal(SURF.apply(basic, 'concrete', {prim:'box', scale:[1, 1, 1]}), null);
  assert.equal(basic.map, null);
  const material = fakeStandardMaterial();
  assert.equal(SURF.apply(material, 'marzipan', {prim:'box', scale:[1, 1, 1]}), null);
  assert.equal(material.map, null);
  assert.equal(SURF.apply(null, 'concrete', {}), null);
});

test('one texture set per (kind, seed, strength, rotate) - 700 objects do not make 700 sets', () => {
  SURF.dispose();
  const before = SURF.stats().setsBuilt;
  const materials = [];
  for(let i = 0; i < 700; i++){
    const material = fakeStandardMaterial();
    SURF.apply(material, {kind:'cinderblock', seed:0}, {prim:'box', scale:[1 + i * .01, 2, .3]});
    materials.push(material);
  }
  assert.equal(SURF.stats().setsBuilt - before, 1, '700 objects of one kind must generate exactly one set');
  assert.equal(SURF.stats().sets, 1);
  // Every object still gets its own texture object (its own repeat) that shares
  // the one pixel source.
  const sources = new Set(materials.map(material => material.map.source));
  assert.equal(sources.size, 1, 'clones must share the texture source');
  const instances = new Set(materials.map(material => material.map));
  assert.equal(instances.size, 700, 'each object needs its own texture clone for its own repeat');
  assert.ok(materials[0].map.repeat.x !== materials[699].map.repeat.x, 'differently sized objects must tile differently');

  // A different seed / strength / rotation is a different set; the same one is not.
  const afterFirstSet = SURF.stats().setsBuilt;
  SURF.apply(fakeStandardMaterial(), {kind:'cinderblock', seed:0}, {prim:'box', scale:[1, 1, 1]});
  assert.equal(SURF.stats().setsBuilt, afterFirstSet, 'the same spec must be served from cache');
  SURF.apply(fakeStandardMaterial(), {kind:'cinderblock', seed:1}, {prim:'box', scale:[1, 1, 1]});
  assert.equal(SURF.stats().setsBuilt, afterFirstSet + 1, 'a new seed must build a new variant');
  assert.equal(SURF.stats().sets, 2);
});

test('the seed pool and the set ceiling keep GPU memory bounded', () => {
  SURF.dispose();
  // Per-object seeds: 900 objects across every kind must collapse onto the
  // variant pool, not mint 900 sets.
  let seed = 0;
  for(let i = 0; i < 900; i++){
    const kind = EXPECTED_KINDS[i % EXPECTED_KINDS.length];
    SURF.apply(fakeStandardMaterial(), {kind, seed:seed++}, {prim:'box', scale:[2, 2, 2]});
  }
  const stats = SURF.stats();
  assert.ok(stats.sets <= SURF.MAX_SETS, 'set ceiling breached: ' + stats.sets);
  assert.ok(stats.sets <= EXPECTED_KINDS.length * SURF.SEED_VARIANTS, 'the seed pool must bound the set count');
  assert.ok(stats.megabytes < 42, 'surface set is too heavy: ' + stats.megabytes + ' MB');
  assert.ok(stats.bytes > 0);
  // Every kind already has a set here, so seed / strength / rotation churn can
  // no longer add one: past the ceiling a variant reuses what the kind has.
  for(let i = 0; i < 900; i++){
    SURF.apply(fakeStandardMaterial(), {kind:EXPECTED_KINDS[i % EXPECTED_KINDS.length], seed:i, strength:.5 + (i % 5) * .1, rotate:i % 2 ? 90 : 0}, {prim:'box', scale:[2, 2, 2]});
  }
  const churned = SURF.stats();
  assert.ok(churned.sets <= SURF.MAX_SETS, 'set ceiling breached under seed+strength churn: ' + churned.sets);
  assert.ok(churned.megabytes <= 42, 'worst-case surface memory: ' + churned.megabytes + ' MB');
});

test('generation is lazy: an unused kind costs nothing', () => {
  SURF.dispose();
  const before = SURF.stats().setsBuilt;
  SURF.list();
  SURF.defaults('gravel');
  SURF.normalize('gravel');
  SURF.repeatFor('gravel', {prim:'box', scale:[1, 1, 1]});
  assert.equal(SURF.stats().setsBuilt, before, 'metadata queries must not generate anything');
  SURF.apply(fakeStandardMaterial(), 'gravel', {prim:'box', scale:[1, 1, 1]});
  assert.equal(SURF.stats().setsBuilt, before + 1, 'first use must build the set');
});

test('re-applying the same spec reuses the clones instead of churning textures', () => {
  SURF.dispose();
  const material = fakeStandardMaterial();
  SURF.apply(material, 'wood', {prim:'box', scale:[1, 1, 1]});
  const first = material.map;
  const beforeRepeat = material.map.repeat.x;
  SURF.apply(material, 'wood', {prim:'box', scale:[2, 1, 1]});
  assert.equal(material.map, first, 'the same key must not re-clone');
  assert.ok(material.map.repeat.x > beforeRepeat, 're-applying must still refresh the repeat');
  // Switching kind disposes the old clone (a per-material object) and swaps in
  // the new one.
  SURF.apply(material, 'brick', {prim:'box', scale:[1, 1, 1]});
  assert.equal(first.disposed, true);
  assert.notEqual(material.map, first);
});

test('retile recomputes the repeat from the live scale', () => {
  SURF.dispose();
  const material = fakeStandardMaterial();
  // metalPainted carries all four slots, so this proves every map re-tiles.
  SURF.apply(material, {kind:'metalPainted', tile:2}, {prim:'box', scale:[1, 1, 1]});
  assert.equal(material.map.repeat.x, 1);
  assert.equal(SURF.retile(material, {prim:'box', scale:[5, 5, 5]}), true);
  assert.equal(material.map.repeat.x, 5);
  assert.equal(material.normalMap.repeat.x, 5);
  assert.equal(material.roughnessMap.repeat.x, 5);
  assert.equal(material.metalnessMap.repeat.x, 5);
  assert.equal(SURF.retile(material, {prim:'box', scale:[5, 5, 5]}), false, 'an unchanged scale must be a no-op');
  assert.equal(SURF.retile(fakeStandardMaterial(), {prim:'box', scale:[5, 5, 5]}), false);
});

test('adopt gives a duplicated material its own texture instance on the shared source', () => {
  SURF.dispose();
  const source = fakeStandardMaterial();
  SURF.apply(source, 'plywood', {prim:'box', scale:[1, 1, 1]});
  // Material.clone() copies texture references.
  const copy = Object.assign({}, source);
  assert.equal(copy.map, source.map);
  SURF.adopt(copy);
  assert.notEqual(copy.map, source.map, 'the copy must own its texture');
  assert.equal(copy.map.source, source.map.source, 'but still share the canvas upload');
  SURF.retile(copy, {prim:'box', scale:[8, 8, 8]});
  assert.notEqual(copy.map.repeat.x, source.map.repeat.x, 'tiling must be independent');
});

test('every generated texture is tagged so the disposal path can recognise it', () => {
  SURF.dispose();
  const material = fakeStandardMaterial();
  SURF.apply(material, 'metalRusted', {prim:'box', scale:[1, 1, 1]});
  ['map', 'normalMap', 'roughnessMap', 'metalnessMap'].forEach(slot => {
    assert.equal(SURF.isProcedural(material[slot]), true, slot + ' is not tagged');
    assert.equal(material[slot].userData[SURF.TAG].kind, 'metalRusted');
  });
  assert.equal(SURF.isProcedural(null), false);
  assert.equal(SURF.isProcedural(new THREE.Texture()), false);
  assert.equal(SURF.clear(material), true);
  assert.equal(material.map, null);
  assert.equal(material.normalMap, null);
});

test('every kind actually generates without throwing', () => {
  SURF.dispose();
  const declared = new Map(SURF.list().map(entry => [entry.id, entry]));
  EXPECTED_KINDS.forEach(kind => {
    const material = fakeStandardMaterial();
    const applied = SURF.apply(material, {kind, seed:2, strength:.7, rotate:90}, {prim:'box', scale:[3, 2, 1]});
    assert.ok(applied, kind + ' did not apply');
    assert.ok(material.map, kind + ' produced no albedo');
    assert.ok(material.normalMap, kind + ' produced no normal map');
    assert.equal(!!material.roughnessMap, declared.get(kind).roughnessMap, kind + ' disagrees with its declared roughness map');
    assert.equal(!!material.metalnessMap, declared.get(kind).metalnessMap, kind + ' disagrees with its declared metalness map');
  });
  assert.equal(SURF.stats().sets, EXPECTED_KINDS.length);
  SURF.dispose();
  assert.equal(SURF.stats().sets, 0);
});

// ------------------------------------------------ store + page wiring

test('scene-store materialises surfaceTexture and protects shared maps on delete', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/engine/scene-store.js'), 'utf8');
  assert.ok(source.includes('LK_ENGINE_PROCEDURAL_SURFACES'), 'store never reads the surface module');
  assert.ok(source.includes("props.surfaceTexture != null && props.materialModel !== 'unlit'"), 'unlit glow panels must stay flat');
  assert.ok(source.includes("hasOwnProperty.call(patch, 'surfaceTexture')"), 'applyMatProps must carry surfaceTexture');
  assert.ok(source.includes('function refreshSurfaceTiling'), 'tiling must be refreshed from the live scale');
  // disposeObject3D now frees every texture slot, not only `map`, so the shared
  // surface guard lives in the per-slot sweep it delegates to. What matters is
  // that a pack-owned texture is still never freed with one object.
  assert.ok(source.includes('function disposeMaterialTextures'), 'material textures need a single disposal sweep');
  assert.ok(/function disposeMaterialTextures[\s\S]{0,600}if\(isSharedSurfaceTexture\(texture\)\) return;/.test(source),
    'the texture sweep must skip shared surface textures');
  // Read the whole function rather than a byte budget from its opening line: the
  // frees now sit inside a deferred release closure, so the guarded sweep is
  // further down than it used to be without being any less required.
  // Match the CALL, not its argument list: the sweep has since grown a third
  // parameter (the set of textures a live object still uses), and pinning the exact
  // two-argument form failed on a change that was entirely correct.
  const sweep = source.slice(source.indexOf('function disposeObject3D'), source.indexOf('function logicElementElementPosition'));
  assert.match(sweep, /disposeMaterialTextures\(mat, seen/,
    'disposeObject3D must go through that guarded sweep');
  assert.ok(source.includes('!isSharedSurfaceTexture(material[key])'), 'the mesh-edit disposal must not dispose shared surface maps');
  assert.ok(source.includes('surfaces().adopt(material)'), 'duplicated objects need their own texture instances');
});

test('the module is registered before scene-store on every page and in the playable export', () => {
  ['engine_editor.html', 'gameplay.html'].forEach(file => {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const surfaceAt = html.indexOf('js/engine/procedural-surfaces.js');
    const storeAt = html.indexOf('js/engine/scene-store.js');
    assert.ok(surfaceAt > 0, file + ' does not load the surface module');
    assert.ok(surfaceAt < storeAt, file + ' loads the surface module after scene-store');
    assert.match(html.slice(surfaceAt, surfaceAt + 80), /procedural-surfaces\.js\?v=[^"']+/, file + ' is missing a cache key');
  });
  const exporter = fs.readFileSync(path.join(__dirname, '../js/editor/playable-export-zip.js'), 'utf8');
  assert.ok(exporter.includes("'js/engine/procedural-surfaces.js'"), 'playable export would ship a broken runtime');
});

console.log('procedural surfaces: all tests passed');
