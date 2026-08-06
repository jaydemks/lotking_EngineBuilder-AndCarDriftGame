'use strict';

/* =========================================================
   The bundled bodies and clips actually LOAD.

   They did not. Both loaders try the canonical GLB first and only fall back to the
   FBX plugin when the asset declares `sourceFormat === 'fbx'` AND carries a
   `sourceDbKey` or `sourceSrc`. The bundled descriptors carried only `src`, so the
   guard rejected them and the plugin reported "FBX source blob is missing" - the
   templates referenced the mannequins correctly and nothing ever appeared.

   Placing a character in a level and looking at it is the only way that failure
   shows up, which is why it is pinned here: this drives the REAL loaders with the
   REAL bundled descriptors and the real FBX plugin contract.

   HOW THIS FILE IS ORGANISED
     01 harness     window/THREE stubs and a recording FBX plugin
     02 descriptors the fields the FBX path requires are present
     03 bodies      a body loads through the store path
     04 motions     a clip loads through the animation-library path
     05 imported    a converted GLB still wins over its FBX source
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');
const fs = require('node:fs');
const path = require('node:path');

// ================================================================= 01 harness

global.window = global;
global.THREE = THREE;
require('../js/runtime/character-placeholder-locomotion.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-templates.js');
require('../js/runtime/character-bodies.js');
require('../js/logic/logic-templates-character.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-animation-set.js');
require('../js/runtime/character-pawn-base.js');

const PACK = global.LK_LOGIC_TEMPLATES_CHARACTER;
const BASE = global.LK_RUNTIME_CHARACTER_PAWN_BASE;
const root = file => path.join(__dirname, '..', file);

function test(name, run){
  try { const out = run(); console.log('ok - ' + name); return out; }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
async function asyncTest(name, run){
  try { await run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

/** Records what each loader was asked for, so the ORDER is observable. */
function recordingPlugin(calls){
  return {
    loadSource(ref){
      calls.push(['fbx', ref.sourceSrc || ref.sourceDbKey || ref.src]);
      const group = new THREE.Group();
      const clip = new THREE.AnimationClip('mixamo.com', 1, []);
      group.animations = [clip];
      return Promise.resolve(group);
    },
  };
}

// ============================================================= 02 descriptors

test('every bundled descriptor carries the fields the FBX path requires', () => {
  const checked = [];
  Object.keys(PACK.BODY_TYPES).forEach(id => checked.push(PACK.bodyAsset(id)));
  ['male', 'female'].forEach(id => {
    const motions = PACK.bodyMotions(id);
    Object.keys(motions).forEach(slot => { if(motions[slot]) checked.push(motions[slot]); });
  });
  assert.ok(checked.length >= 20, 'there are descriptors to check, got ' + checked.length);
  checked.forEach(asset => {
    // The exact guard both loaders apply.
    assert.equal(String(asset.sourceFormat || '').toLowerCase(), 'fbx', asset.src + ' must declare its format');
    assert.ok(asset.sourceDbKey || asset.sourceSrc,
      asset.src + ' must carry a source the plugin can open, or it reports "FBX source blob is missing"');
    assert.equal(asset.sourceSrc, asset.src, 'the bundled source IS the file at that path');
    assert.ok(fs.existsSync(root(asset.src)), 'missing file ' + asset.src);
  });
});

// ================================================================== 03 bodies

test('a bundled body is routed straight to the FBX loader, not to GLTFLoader', () => {
  const source = fs.readFileSync(root('js/engine/scene-store.js'), 'utf8');
  const at = source.indexOf('const declaresFbx');
  assert.ok(at > 0, 'the store decides which loader to use');
  const decision = source.slice(at, at + 400);
  assert.match(decision, /canonicalGlb/, 'it only skips the GLB when there is no GLB to try');
  assert.match(decision, /loadLogicElementFbxFallback/, 'and goes to the FBX path when there is not');
});

// ================================================================= 04 motions
//
// These run in sequence, not in parallel: they share one recording plugin on
// `window`, and `loadAnimationLibrary` memoises per asset key - so an interleaved
// run sees another test's calls, and a clip already loaded never reaches the
// plugin a second time.

async function motionsLoad(){
  const calls = [];
  global.LK_FBX_IMPORT_PLUGIN = recordingPlugin(calls);
  const roll = PACK.bodyMotions('male').roll;
  assert.ok(roll, 'the roll is bound to a bundled clip');
  const library = await BASE.loadAnimationLibrary(roll);
  assert.ok(library, 'the library resolved');
  assert.equal(library.source, 'fbx',
    'it came from the FBX plugin - before the fix this rejected with "FBX source blob is missing"');
  assert.deepEqual(library.names, ['mixamo.com'],
    'the single take is what the slot resolves to, which is why binding is per asset');
  // Straight to the plugin: a bundled clip has no converted GLB to try first.
  assert.deepEqual(calls, [['fbx', roll.src]]);
  assert.equal(library.clips[0].userData.lkAnimationAssetKey, roll.key,
    'the clip is scoped to its asset key, which is how findClip() tells the slots apart');
}

async function slotsAreDistinct(){
  const calls = [];
  global.LK_FBX_IMPORT_PLUGIN = recordingPlugin(calls);
  const motions = PACK.bodyMotions('female');
  // Per-body slots only. `roll` is shared with the male body, so the previous test
  // already cached it and it would never reach the plugin again.
  const slots = ['idle', 'walk', 'run', 'strafeLeft'];
  const keys = [];
  for(const slot of slots){
    const library = await BASE.loadAnimationLibrary(motions[slot]);
    keys.push(library.clips[0].userData.lkAnimationAssetKey);
  }
  assert.equal(new Set(keys).size, slots.length,
    'four slots, four distinct asset keys - otherwise they would all be the same mixamo.com clip');
  assert.deepEqual(calls.map(call => call[1]), slots.map(slot => motions[slot].src));
}

// ================================================================ 05 imported

async function importedKeepsGlbFirst(){
  const calls = [];
  global.LK_FBX_IMPORT_PLUGIN = recordingPlugin(calls);
  global.LK_ASSET_BLOBS = {getUrl(key){ calls.push(['blob', key]); return Promise.resolve('blob:no-such-glb'); }};
  const previousLoader = THREE.GLTFLoader;
  THREE.GLTFLoader = function(){ return {load(url, _ok, _progress, fail){ calls.push(['gltf', url]); fail(new Error('missing')); }}; };
  try {
    const library = await BASE.loadAnimationLibrary({dbKey:'imported:idle', sourceFormat:'fbx', sourceDbKey:'imported:idle:source'});
    assert.equal(library.source, 'fbx', 'it still ends up on the preserved FBX');
    assert.deepEqual(calls, [['blob', 'imported:idle'], ['gltf', 'blob:no-such-glb'], ['fbx', 'imported:idle:source']],
      'the GLB-first order for an imported asset must survive the bundled short-circuit');
  } finally {
    THREE.GLTFLoader = previousLoader;
    delete global.LK_ASSET_BLOBS;
  }
}

(async () => {
  await asyncTest('a bundled motion clip loads through the animation library', motionsLoad);
  await asyncTest('each slot resolves to its own clip even though every take shares a name', slotsAreDistinct);
  await asyncTest('an imported asset still tries its converted GLB before its FBX source', importedKeepsGlbFirst);
  console.log('\nbundled character loading tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
