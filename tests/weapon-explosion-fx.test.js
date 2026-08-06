'use strict';

/* =========================================================
   Grenade blast visuals.

   A grenade already resolved its damage, its impulses and its `OnExplosion`
   event inside item-system.js before anything is drawn. What was missing was the
   READ: the blast had no visual at all, so a grenade killed things silently.

   This file pins the effect and, more importantly, its COST. The blast pool is
   allocated once like the tracer pool, so a firefight full of grenades costs
   what the first one costs; a per-blast allocation would be a leak with a
   friendly name.

   HOW THIS FILE IS ORGANISED
     01 harness    THREE, a scene, the real effects module
     02 shape      what a blast is made of, and that it follows the damage radius
     03 lifetime   fireball, shockwave, embers and smoke all end
     04 budget     many blasts do not grow the pool, and dispose frees it
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');

// ================================================================= 01 harness

global.window = global;
global.THREE = THREE;
global.addEventListener = () => {};
global.removeEventListener = () => {};

require('../js/runtime/weapon-tracers.js');
const FX = global.LK_RUNTIME_WEAPON_TRACERS;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
function harness(){
  const scene = new THREE.Scene();
  return {scene, fx:FX.create({core:{scene}})};
}
function visibleMeshes(scene){
  let n = 0;
  scene.traverse(node => { if(node.isMesh && node.visible) n++; });
  return n;
}
function allMeshes(scene){
  let n = 0;
  scene.traverse(node => { if(node.isMesh) n++; });
  return n;
}
function litLights(scene){
  let n = 0;
  scene.traverse(node => { if(node.isLight && node.intensity > 0) n++; });
  return n;
}

// =================================================================== 02 shape

test('a blast is a fireball, a shockwave, smoke and a burst of embers', () => {
  const {scene, fx} = harness();
  assert.equal(visibleMeshes(scene), 0, 'nothing is drawn before a blast');
  assert.equal(fx.explode({at:{x:0, y:1, z:0}, radius:6}), true);
  // fireball + shockwave + smoke + the ember budget
  assert.equal(visibleMeshes(scene), 3 + 24);
  assert.equal(litLights(scene), 1, 'one flash, not one light per spark');
});

test('an explosion with no position is refused rather than drawn at the origin', () => {
  const {fx} = harness();
  assert.equal(fx.explode({radius:6}), false);
  assert.equal(fx.explode(null), false);
});

test('the blast follows the authored damage radius', () => {
  const measure = radius => {
    const {scene, fx} = harness();
    fx.explode({at:{x:0, y:1, z:0}, radius});
    for(let i = 0; i < 30; i++) fx.update(1 / 60);
    let largest = 0;
    scene.traverse(node => { if(node.isMesh && node.visible) largest = Math.max(largest, node.scale.x); });
    return largest;
  };
  const small = measure(3), big = measure(12);
  assert.ok(big > small * 2, 'a wider grenade makes a wider blast: ' + small.toFixed(2) + ' vs ' + big.toFixed(2));
});

test('the fireball cools instead of only fading', () => {
  const {scene, fx} = harness();
  fx.explode({at:{x:0, y:1, z:0}, radius:8});
  let fireball = null;
  scene.traverse(node => { if(!fireball && node.isMesh && node.visible && node.renderOrder === 960) fireball = node; });
  assert.ok(fireball, 'the fireball is identifiable');
  const hot = fireball.material.color.getHex();
  for(let i = 0; i < 20; i++) fx.update(1 / 60);
  const cooled = fireball.material.color.getHex();
  assert.notEqual(cooled, hot, 'the colour moves along the ramp');
  const channel = hex => ({r:(hex >> 16) & 255, g:(hex >> 8) & 255, b:hex & 255});
  assert.ok(channel(cooled).b < channel(hot).b, 'it loses blue first, which is what cooling looks like');
});

// ================================================================ 03 lifetime

test('everything a blast draws ends, including the flash', () => {
  const {scene, fx} = harness();
  fx.explode({at:{x:0, y:1, z:0}, radius:6});
  assert.ok(visibleMeshes(scene) > 20);
  // Three seconds is past the fireball, the embers and the smoke.
  for(let i = 0; i < 200; i++) fx.update(1 / 60);
  assert.equal(visibleMeshes(scene), 0, 'no part of the blast is left on screen');
  assert.equal(litLights(scene), 0, 'the flash is not left burning');
});

test('embers arc under gravity instead of flying in straight lines', () => {
  const {scene, fx} = harness();
  fx.explode({at:{x:0, y:5, z:0}, radius:6});
  const embers = [];
  scene.traverse(node => { if(node.isMesh && node.visible && node.renderOrder === 961) embers.push(node); });
  assert.equal(embers.length, 24);

  // What makes a trajectory ballistic is that the RISE PER FRAME shrinks by the
  // same amount every frame. Sampling two frames and demanding that some ember has
  // already dropped below the earlier one is not that test: an ember is launched at
  // up to 1.2 * 6 * 3.2 = 23 m/s, gravity is 15 m/s² and an ember lives 0.85 s, so
  // the fastest ones legitimately never come back down before they burn out. That
  // assertion depended on the random draw and failed about one run in ten.
  const h = 1 / 60;
  const step = () => { const before = embers.map(node => node.position.y); fx.update(h); return embers.map((node, i) => node.position.y - before[i]); };
  const first = step(), second = step(), third = step();
  for(let i = 0; i < embers.length; i++){
    assert.ok(second[i] < first[i] && third[i] < second[i],
      'ember ' + i + ' must rise less each frame, got ' + [first[i], second[i], third[i]].map(v => v.toFixed(4)).join(' > '));
    // And by gravity exactly, not by an arbitrary damping of the vertical axis.
    assert.ok(Math.abs((first[i] - second[i]) - 15 * h * h) < 1e-9,
      'the vertical loss per frame is EMBER_GRAVITY * h², so the arc is real physics');
  }
  const spread = new Set(embers.map(node => node.position.x.toFixed(3)));
  assert.ok(spread.size > 12, 'the burst spreads rather than moving as one clump');
});

// ================================================================== 04 budget

test('many blasts do not grow the pool', () => {
  const {scene, fx} = harness();
  fx.explode({at:{x:0, y:1, z:0}, radius:5});
  fx.update(1 / 60);
  const one = allMeshes(scene);
  for(let i = 0; i < 20; i++){
    fx.explode({at:{x:i * 3, y:1, z:0}, radius:5});
    fx.update(1 / 60);
  }
  assert.equal(fx.stats().blasts, FX.MAX_BLASTS, 'the pool stops at its budget');
  assert.equal(allMeshes(scene), one * FX.MAX_BLASTS,
    'twenty blasts allocate at most ' + FX.MAX_BLASTS + ' blasts worth of meshes');
});

test('the pool is warmed before play, so the first grenade does not compile shaders', () => {
  const {scene, fx} = harness();
  const warm = fx.warmup();
  assert.ok(warm.objects.length >= 3, 'the blast materials are warmed with the tracer ones');
  warm.dispose();
  assert.equal(visibleMeshes(scene), 0, 'warming leaves nothing on screen');
});

test('dispose frees the blast materials and geometry', () => {
  const {scene, fx} = harness();
  fx.explode({at:{x:0, y:1, z:0}, radius:6});
  const disposed = [];
  scene.traverse(node => {
    if(!node.isMesh) return;
    const material = node.material, geometry = node.geometry;
    if(material && !material.__watched){ material.__watched = true; const raw = material.dispose.bind(material); material.dispose = () => { disposed.push('material'); raw(); }; }
    if(geometry && !geometry.__watched){ geometry.__watched = true; const raw = geometry.dispose.bind(geometry); geometry.dispose = () => { disposed.push('geometry'); raw(); }; }
  });
  fx.dispose();
  assert.ok(disposed.filter(kind => kind === 'material').length >= 4, 'fireball, shockwave, smoke and embers are freed');
  assert.equal(scene.children.length, 0, 'and the effect root leaves the scene');
  assert.equal(fx.stats().blasts, 0);
});

console.log('\nweapon explosion FX tests passed');
