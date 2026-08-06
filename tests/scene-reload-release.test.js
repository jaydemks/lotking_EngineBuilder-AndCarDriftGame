'use strict';

/* =========================================================
   Applying a scene releases the previous one.

   `STORE.apply()` describes a WHOLE scene, and its added loop builds one object
   per entry unconditionally. It did not remove what a previous apply had added,
   and where it did remove something - the `deleted` list - it detached the object
   without freeing its GPU buffers.

   Measured in a real browser on the FPS level, each apply added about 2000 scene
   objects, 900 geometries and 2280 textures and released none of them. The JS
   heap stayed flat the whole time, because geometry and textures live on the GPU:
   that is why the symptom looked like the machine slowly degrading, survived a
   page reload, and appeared to need a restart to clear.

   This file pins the invariant with counted dispose() calls, so the leak cannot
   come back silently.

   HOW THIS FILE IS ORGANISED
     01 harness    a THREE double that counts dispose(), and a fake world
     02 release    a second apply leaves one copy, and frees the first
     03 disposal   every texture slot is freed, shared surface textures are not
   ========================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ================================================================= 01 harness

const SOURCE = fs.readFileSync(path.join(__dirname, '../js/engine/scene-store.js'), 'utf8');

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// The disposal contract is asserted against the real functions, lifted out of the
// module. scene-store.js is a browser IIFE with a very large dependency surface,
// so the two helpers under test are evaluated on their own rather than booting
// the whole editor in node.
function loadDisposalHelpers(){
  const wanted = ['isSharedSurfaceTexture', 'DISPOSABLE_TEXTURE_SLOTS', 'disposeMaterialTextures', 'releaseGpuResources', 'disposeObject3D'];
  const parts = wanted.map(name => {
    const start = SOURCE.indexOf((name === 'DISPOSABLE_TEXTURE_SLOTS' ? 'const ' : 'function ') + name);
    assert.ok(start >= 0, 'missing ' + name + ' in scene-store.js');
    // Read to the start of the next top-level declaration.
    const rest = SOURCE.slice(start + 1);
    const next = rest.search(/\n(?:function |const )/);
    return SOURCE.slice(start, next >= 0 ? start + 1 + next : SOURCE.length);
  });
  // eslint-disable-next-line no-new-func
  return new Function(parts.join('\n') + '\nreturn {disposeObject3D, disposeMaterialTextures, DISPOSABLE_TEXTURE_SLOTS};')();
}

function fakeTexture(tag, log, shared){
  return {
    isTexture:true, tag,
    userData:shared ? {lkSurface:true} : {},
    dispose(){ log.push('texture:' + tag); },
  };
}
function fakeMaterial(tag, log, slots){
  const material = {tag, dispose(){ log.push('material:' + tag); }};
  Object.keys(slots || {}).forEach(slot => { material[slot] = slots[slot]; });
  return material;
}
function fakeMesh(tag, log, material){
  const node = {
    isMesh:true, tag, children:[],
    geometry:{dispose(){ log.push('geometry:' + tag); }},
    material,
    traverse(fn){ fn(node); node.children.forEach(child => child.traverse(fn)); },
  };
  return node;
}

// ================================================================= 02 release

test('apply tears down what a previous apply added, before building the new scene', () => {
  // Asserted on the source: the sweep has to run BEFORE the added loop, or the
  // objects it is meant to replace are built first and both copies survive.
  const release = SOURCE.indexOf('releaseAddedObjects(GAME);');
  const addedLoop = SOURCE.indexOf("for(const entry of data.added || []){");
  assert.ok(release > 0, 'apply must release the previously added objects');
  assert.ok(addedLoop > 0, 'the added loop must still exist');
  assert.ok(release < addedLoop, 'the release has to happen before the new entries are built');
});

test('the release keeps builtins and takes only what a previous apply added', () => {
  const body = SOURCE.slice(SOURCE.indexOf('function releaseAddedObjects'), SOURCE.indexOf('function apply(GAME'));
  assert.match(body, /userData\.addedEntry/, 'it must select the objects a previous apply added');
  assert.match(body, /!object\.userData\.builtin/, 'builtins are the player, sky and ground rig and must survive');
  assert.match(body, /GAME\.world\.unregister\(object\)/, 'the object has to leave the world registry');
  assert.match(body, /disposeObject3D\(object\)/, 'and free its GPU buffers');
  assert.match(body, /disposeLogicElementAnimations\(object\)/, 'mixers are not part of the object graph');
});

test('a deleted object is disposed, not just detached', () => {
  const start = SOURCE.indexOf('  // deletions');
  const block = SOURCE.slice(start, start + 420);
  assert.match(block, /GAME\.world\.unregister\(o\)/);
  assert.match(block, /o\.parent\.remove\(o\)/);
  assert.match(block, /disposeObject3D\(o\)/, 'detaching an object does not free its GPU buffers');
});

// ================================================================ 03 disposal

test('every texture slot of a material is freed, not only its colour map', () => {
  const {disposeObject3D} = loadDisposalHelpers();
  const log = [];
  const material = fakeMaterial('m', log, {
    map:fakeTexture('map', log),
    normalMap:fakeTexture('normal', log),
    roughnessMap:fakeTexture('rough', log),
    emissiveMap:fakeTexture('emissive', log),
    aoMap:fakeTexture('ao', log),
    alphaMap:fakeTexture('alpha', log),
  });
  disposeObject3D(fakeMesh('mesh', log, material));
  ['map', 'normal', 'rough', 'emissive', 'ao', 'alpha'].forEach(tag => {
    assert.ok(log.includes('texture:' + tag), 'the ' + tag + ' texture must be freed');
  });
  assert.ok(log.includes('geometry:mesh'));
  assert.ok(log.includes('material:m'));
});

test('a texture a surface pack shares between materials is never freed with one object', () => {
  const {disposeObject3D} = loadDisposalHelpers();
  const log = [];
  const material = fakeMaterial('m', log, {
    map:fakeTexture('shared', log, true),
    normalMap:fakeTexture('own', log),
  });
  disposeObject3D(fakeMesh('mesh', log, material));
  assert.ok(!log.includes('texture:shared'), 'a shared surface texture outlives any single object');
  assert.ok(log.includes('texture:own'));
});

test('one texture used by several materials is freed once', () => {
  const {disposeObject3D} = loadDisposalHelpers();
  const log = [];
  const shared = fakeTexture('reused', log);
  const mesh = fakeMesh('mesh', log, [fakeMaterial('a', log, {map:shared}), fakeMaterial('b', log, {map:shared})]);
  disposeObject3D(mesh);
  assert.equal(log.filter(entry => entry === 'texture:reused').length, 1);
});

test('a child mesh is disposed with its parent', () => {
  const {disposeObject3D} = loadDisposalHelpers();
  const log = [];
  const parent = fakeMesh('parent', log, fakeMaterial('p', log, {map:fakeTexture('p-map', log)}));
  parent.children.push(fakeMesh('child', log, fakeMaterial('c', log, {map:fakeTexture('c-map', log)})));
  disposeObject3D(parent);
  ['geometry:parent', 'geometry:child', 'texture:p-map', 'texture:c-map'].forEach(entry => {
    assert.ok(log.includes(entry), 'missing ' + entry);
  });
});

test('a skinned mesh releases its bone texture', () => {
  const {disposeObject3D} = loadDisposalHelpers();
  const log = [];
  const node = fakeMesh('skin', log, fakeMaterial('s', log, {}));
  node.isSkinnedMesh = true;
  node.skeleton = {boneTexture:{dispose(){ log.push('bone'); }}};
  disposeObject3D(node);
  assert.ok(log.includes('bone'));
  assert.equal(node.skeleton.boneTexture, null, 'and does not hold the freed texture');
});

console.log('\nscene reload release tests passed');
