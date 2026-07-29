'use strict';

// Character Sound Sets: the parts that decide WHAT plays and WHEN. Web Audio
// itself is not available in node, so the synthesis is deliberately kept behind
// a data layer — recipes, set normalization, weapon classification and the gait
// clock are all pure and covered here. The audible graph is browser-only.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/runtime/character-audio.js');
require('../js/runtime/character-movement.js');

const AUDIO = global.LK_RUNTIME_CHARACTER_AUDIO;
const MOVEMENT = global.LK_RUNTIME_CHARACTER_MOVEMENT;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

test('the default set is complete and procedural, with no media files', () => {
  const set = AUDIO.defaultSet();
  assert.ok(AUDIO.SURFACES.length >= 10, 'a useful spread of materials ships by default');
  AUDIO.SURFACES.forEach(surface => {
    const slot = set.footsteps.surfaces[surface.id];
    assert.ok(slot, surface.id + ' has a footstep slot');
    assert.equal(slot.src, '', surface.id + ' must not depend on a media file');
    assert.ok(slot.recipe && (slot.recipe.noise || slot.recipe.tone), surface.id + ' has a synthesis recipe');
  });
  AUDIO.WEAPON_CLASSES.forEach(cls => {
    const weapon = set.weapons[cls.id];
    assert.ok(weapon && weapon.fire && weapon.tail && weapon.mech, cls.id + ' has a full weapon profile');
    assert.equal(weapon.fire.src, '', cls.id + ' fires procedurally out of the box');
  });
  ['jump', 'land', 'breath'].forEach(key => assert.ok(set.body[key], 'body foley: ' + key));
  assert.ok(set.effects.explosion, 'the shared FX rack includes an explosion');
  assert.equal(set.effects.explosion.src, '', 'the explosion works without a media file');
});

test('the default explosion is a layered 808-style impact and remains authorable', () => {
  const explosion = AUDIO.defaultSet().effects.explosion;
  assert.ok(explosion.recipe.noise, 'an impact/debris transient is present');
  assert.ok(explosion.recipe.tone, 'a sub oscillator is present');
  assert.ok(explosion.recipe.ring, 'a body resonance is present');
  assert.ok(explosion.recipe.tone.freq >= 80, 'the sub begins with a perceptible punch');
  assert.ok(explosion.recipe.tone.freqEnd <= 30, 'the sub falls into 808 territory');
  assert.ok(explosion.recipe.tone.decay >= 1, 'the low-frequency tail has weight');

  const custom = AUDIO.normalizeSet({effects:{explosion:{
    volume:1.7,
    recipe:{tone:{wave:'triangle',freq:120,freqEnd:32,decay:1.4,level:.8}},
  }}});
  assert.equal(custom.effects.explosion.volume, 1.7);
  assert.equal(custom.effects.explosion.recipe.tone.wave, 'triangle');
  assert.equal(custom.effects.explosion.recipe.tone.decay, 1.4);
});

test('the Character Sound Designer exposes the procedural recipe as live modules', () => {
  const designer = fs.readFileSync(path.join(__dirname, '../js/editor/character-sound-designer.js'), 'utf8');
  assert.ok(designer.includes('data-tab="effects"'), 'explosions have a dedicated FX workspace');
  assert.ok(designer.includes("['noise','tone','ring']"), 'the rack is assembled from independent synthesis modules');
  assert.ok(designer.includes("rt.playEffect(effect.id)"), 'preview uses the real runtime FX path');
  assert.ok(designer.includes('cs-signal'), 'weapon slots expose their live signal chain');
});

test('materials are distinguishable, not the same recipe renamed', () => {
  const set = AUDIO.defaultSet();
  const signature = id => {
    const recipe = set.footsteps.surfaces[id].recipe;
    return [recipe.noise && recipe.noise.type, recipe.noise && recipe.noise.freq,
      recipe.ring ? recipe.ring.freq : 0, recipe.grains].join('/');
  };
  const seen = new Set(AUDIO.SURFACES.map(surface => signature(surface.id)));
  assert.equal(seen.size, AUDIO.SURFACES.length, 'every surface has its own timbre');
  // The ones a player would call out immediately.
  assert.ok(set.footsteps.surfaces.metal.recipe.ring.decay > set.footsteps.surfaces.carpet.recipe.noise.decay, 'metal rings, carpet does not');
  assert.ok(set.footsteps.surfaces.water.recipe.tone, 'water has a pitched splash');
  assert.ok(set.footsteps.surfaces.gravel.recipe.grains > 1, 'gravel is loose material, not one hit');
});

test('normalization fills gaps, clamps values and keeps custom recipes', () => {
  const custom = {noise:{type:'lowpass', freq:200, q:1, decay:.4, level:1, sweep:0}};
  const set = AUDIO.normalizeSet({
    name:'Mine',
    master:{volume:99},
    footsteps:{strideWalk:0, surfaces:{wood:{volume:12, src:'sfx/wood.wav', recipe:custom}}},
    weapons:{shotgun:{fire:{pitch:100}}},
  });
  assert.equal(set.name, 'Mine');
  assert.equal(set.master.volume, 2, 'master volume clamps');
  assert.equal(set.footsteps.strideWalk, .2, 'stride clamps to a sane minimum');
  assert.equal(set.footsteps.surfaces.wood.volume, 4, 'slot volume clamps');
  assert.equal(set.footsteps.surfaces.wood.src, 'sfx/wood.wav', 'a sample path survives');
  assert.equal(set.footsteps.surfaces.wood.recipe.noise.freq, 200, 'an authored recipe is not overwritten');
  assert.equal(set.footsteps.surfaces.wood.recipe.tone, undefined, 'normalization does not invent disabled modules');
  assert.equal(set.footsteps.surfaces.metal.src, '', 'untouched slots keep their defaults');
  assert.equal(set.weapons.shotgun.fire.pitch, 4, 'weapon pitch clamps');
  assert.ok(set.weapons.rifle.fire, 'untouched weapon classes survive');
  assert.ok(set.effects.explosion, 'older sets gain the default FX rack');
  // A set written by an older build, or by hand, must never come back broken.
  assert.deepEqual(Object.keys(AUDIO.normalizeSet(null).footsteps.surfaces).sort(),
    Object.keys(AUDIO.defaultSet().footsteps.surfaces).sort());
});

test('weapon class follows the preset, then behaviour, never the name', () => {
  assert.equal(AUDIO.weaponClassFor({preset:'marksman'}), 'marksman');
  assert.equal(AUDIO.weaponClassFor({preset:'nonsense', pellets:9}), 'shotgun', 'pellets make a shotgun');
  assert.equal(AUDIO.weaponClassFor({range:400}), 'marksman', 'long range makes a marksman');
  assert.equal(AUDIO.weaponClassFor({magazine:12, fireRate:4}), 'pistol');
  assert.equal(AUDIO.weaponClassFor({fireRate:16}), 'smg');
  assert.equal(AUDIO.weaponClassFor(null), 'rifle', 'no weapon still resolves to a profile');
  // The display name must not decide the sound.
  assert.equal(AUDIO.weaponClassFor({name:'Sniper Rifle', magazine:30, fireRate:9.5, range:140}), 'rifle');
});

test('footstep cadence is driven by distance, so it follows every gait', () => {
  const set = AUDIO.defaultSet().footsteps;
  const gait = AUDIO.createGait();
  // Walking 10 m must produce the number of strides the set describes.
  let steps = 0;
  for(let i = 0; i < 600; i++) steps += gait.advance(1 / 60, 2, false, true, set);
  assert.equal(steps, Math.floor(20 / set.strideWalk), 'walking cadence matches the walk stride');

  const runner = AUDIO.createGait();
  let runSteps = 0;
  for(let i = 0; i < 600; i++) runSteps += runner.advance(1 / 60, 6, true, true, set);
  assert.ok(runSteps > steps, 'running covers more ground, so more steps land');
  assert.ok(runSteps / steps < 6 / 2, 'but the stride lengthens, so steps do not scale with speed');

  const air = AUDIO.createGait();
  let airSteps = 0;
  for(let i = 0; i < 120; i++) airSteps += air.advance(1 / 60, 6, false, false, set);
  assert.equal(airSteps, 0, 'no footsteps while airborne');

  const idle = AUDIO.createGait();
  let idleSteps = 0;
  for(let i = 0; i < 120; i++) idleSteps += idle.advance(1 / 60, .1, false, true, set);
  assert.equal(idleSteps, 0, 'standing still is silent');
});

test('the movement snapshot reports the material under the feet', () => {
  const colliders = {box:[
    {x:0, z:0, hx:4, hz:4, y:1, hy:1, enabled:true, surface:'metal'},
  ], circle:[]};
  const GAME = {world:{colliders}};
  const movement = MOVEMENT.create(GAME, {defaultSurface:'concrete', stepHeight:.6});
  const owner = {position:{x:0, y:2, z:0}, rotation:{y:0}};
  const onDeck = movement.step(owner, {x:0, z:0}, 1 / 60, 0);
  assert.equal(onDeck.surface, 'metal', 'a tagged collider names the surface');

  // Stepping off it must fall back to the set default, not latch on the tag.
  owner.position.x = 30;
  const offDeck = movement.step(owner, {x:0, z:0}, 1 / 60, 0);
  assert.equal(offDeck.surface, 'concrete', 'untagged ground uses the default surface');

  // A collider can also inherit the tag from the scene object that owns it,
  // which is how the editor tags geometry.
  colliders.box[0].surface = null;
  colliders.box[0].owner = {userData:{surface:'wood'}};
  owner.position.x = 0;
  owner.position.y = 2;
  assert.equal(movement.step(owner, {x:0, z:0}, 1 / 60, 0).surface, 'wood', 'the owning object can carry the tag');
});

console.log('\ncharacter audio tests passed');
