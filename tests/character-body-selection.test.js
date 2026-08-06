'use strict';

/* =========================================================
   The Body select actually changes the body.

   It did not. `bodyType` was written by the Inspector and read by nobody: a grep
   for it across `js/` matched only the template pack that produced it. Flipping
   Male to Female changed a string, and the Pawn kept the male mannequin with the
   male clips - the choice existed in the UI and nowhere else.

   The catalogue therefore moved out of the logic template pack into
   `js/runtime/character-bodies.js`, so the runtime resolves a body from the same
   table the templates are built from, and `normalizeCommonConfig` applies it.

   The hard part is not the swap, it is NOT swapping too much: an author who
   imported their own model, bound their own clip to a slot, or picked a shirt
   colour has to keep all of it, or flipping the select twice quietly destroys
   their work. That is what most of this file is about.

   HOW THIS FILE IS ORGANISED
     01 harness    the body catalogue and the pawn base
     02 catalogue  resolution, and a wrong id that must not become male
     03 swap       a Pawn follows the selected body
     04 authored   imported models, bound clips and chosen colours survive
     05 wiring     both shells load the catalogue before its readers
   ========================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ================================================================= 01 harness

global.window = global;
require('../js/runtime/character-bodies.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-pawn-base.js');

const BODIES = global.LK_RUNTIME_CHARACTER_BODIES;
const BASE = global.LK_RUNTIME_CHARACTER_PAWN_BASE;
const root = file => path.join(__dirname, '..', file);

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
/** What the runtime does with an authored Pawn config. */
const normalize = config => BASE.normalizeCommonConfig(config, {});

// =============================================================== 02 catalogue

test('a body resolves by id, and both bodies are offered', () => {
  assert.equal(BODIES.resolve('male').file, 'y-bot.fbx');
  assert.equal(BODIES.resolve('female').file, 'x-bot.fbx');
  assert.equal(BODIES.resolve('FEMALE').id, 'female', 'the id is case-insensitive');
  assert.equal(BODIES.resolve('').id, BODIES.DEFAULT_BODY, 'an absent id is the documented default');
  assert.deepEqual(BODIES.OPTIONS.map(option => option.value), ['male', 'female']);
});

test('an unknown body id throws instead of silently becoming male', () => {
  // Exactly how `bodyType` became decorative: a value nobody validated. A typo has
  // to be reported, not rendered as the other body.
  assert.throws(() => BODIES.resolve('mail'), /Unknown character body "mail"/);
  assert.throws(() => BODIES.resolve('woman'), /expected one of male, female/);
  // Saved project data takes the forgiving path instead, because refusing to load
  // an existing level is worse than showing a default body.
  assert.equal(BODIES.resolveOrDefault('mail').id, 'male');
});

// ==================================================================== 03 swap

test('selecting a body gives the Pawn that model, at that body own fit', () => {
  const female = normalize({bodyType:'female'});
  assert.match(female.model.src, /mannequin-female\/x-bot\.fbx$/);
  assert.equal(female.model.fit, BODIES.BODIES.female.fit);
  const male = normalize({bodyType:'male'});
  assert.match(male.model.src, /mannequin-male\/y-bot\.fbx$/);
  assert.notEqual(male.model.fit, female.model.fit,
    'the fits differ on purpose - a shared fit made one body shorter than the other');
});

test('selecting a body brings its own locomotion and keeps the shared actions', () => {
  const female = normalize({bodyType:'female'});
  ['idle', 'walk', 'run', 'strafeLeft', 'strafeRight', 'jump'].forEach(slot => {
    assert.match(female.animations[slot].asset.src, /mannequin-female\//, slot + ' is the female clip');
  });
  ['fall', 'roll', 'landHeavy'].forEach(slot => {
    assert.match(female.animations[slot].asset.src, /characters\/shared\//,
      slot + ' is authored once and drives both rigs');
  });
});

test('flipping the select replaces the previous body completely', () => {
  // The regression that mattered: a male Pawn switched to female used to keep the
  // male mannequin and the male clips.
  const first = normalize({bodyType:'male'});
  const flipped = normalize(Object.assign({}, first, {bodyType:'female'}));
  assert.match(flipped.model.src, /x-bot\.fbx$/, 'the model followed');
  assert.match(flipped.animations.walk.asset.src, /mannequin-female\//, 'the clips followed');
  assert.equal(flipped.appearance.shirtColor, BODIES.BODIES.female.appearance.shirtColor,
    'and so did the default palette, so the two are distinguishable at a glance');
  const back = normalize(Object.assign({}, flipped, {bodyType:'male'}));
  assert.match(back.model.src, /y-bot\.fbx$/);
  assert.match(back.animations.walk.asset.src, /mannequin-male\//);
});

test('a Pawn with no body selected is left exactly as authored', () => {
  // Every project saved before the select exists is in this state.
  const custom = {model:{src:'user/hero.glb', kind:'glb'}, animations:{walk:{clip:'Walk', asset:{src:'user/walk.glb', key:'imported:walk'}}}};
  const out = normalize(JSON.parse(JSON.stringify(custom)));
  assert.equal(out.model.src, 'user/hero.glb', 'no bodyType means nothing is resolved');
  assert.equal(out.animations.walk.asset.src, 'user/walk.glb');
  assert.equal(out.bodyType, undefined);
});

// ================================================================ 04 authored

test('an imported model survives a body change', () => {
  const out = normalize({bodyType:'female', model:{src:'user/hero.glb', kind:'glb', fit:1.7}});
  assert.equal(out.model.src, 'user/hero.glb', 'the author own model is not replaced by a mannequin');
  assert.equal(out.model.fit, 1.7, 'nor is their fit');
  assert.equal(out.bodyType, 'female', 'the selection is still recorded');
  assert.match(out.animations.walk.asset.src, /mannequin-female\//,
    'the bundled clips still follow the choice - a custom model on the Mixamo rig is the normal case');
});

test('a clip the author bound to a slot survives a body change', () => {
  const out = normalize({bodyType:'female', animations:{
    walk:{clip:'My Walk', asset:{src:'user/my-walk.fbx', key:'imported:my-walk'}},
    run:'Some Clip By Name',
    idle:null,
  }});
  assert.equal(out.animations.walk.asset.src, 'user/my-walk.fbx', 'an imported clip is authored work');
  assert.equal(out.animations.run, 'Some Clip By Name', 'a clip named by hand is authored work too');
  assert.match(out.animations.idle.asset.src, /mannequin-female\//, 'an empty slot is ours to fill');
});

test('saved bundled action entries migrate with their named slot', () => {
  const old=BODIES.motionAsset('models/characters/shared','vault-over-box.fbx','Vault Over Box');
  const out=BODIES.applyBody({bodyType:'male',animationSet:[{id:'action-slot-vault',state:'action',action:'vault',clip:'Vault Over Box',asset:old}]},'male');
  assert.match(out.animationSet[0].asset.src,/front-flip-vault\.fbx$/,'the stale Motion Set copy cannot override the new default');
  const custom={src:'user/my-vault.fbx',key:'imported:my-vault'},authored=BODIES.applyBody({bodyType:'male',animationSet:[{id:'action-slot-vault',state:'action',action:'vault',asset:custom}]},'male');
  assert.equal(authored.animationSet[0].asset,custom,'an author asset remains authoritative');
});

test('a colour the author picked survives, a default does not', () => {
  const male = BODIES.BODIES.male.appearance, female = BODIES.BODIES.female.appearance;
  const out = normalize({bodyType:'female', appearance:{shirtColor:'#00ff00', shortsColor:male.shortsColor}});
  assert.equal(out.appearance.shirtColor, '#00ff00', 'a chosen colour is kept');
  assert.equal(out.appearance.shortsColor, female.shortsColor,
    'a colour still equal to the previous body default is a default, and follows the body');
});

test('applying the same body twice changes nothing further', () => {
  const once = BODIES.applyBody({bodyType:'female'}, 'female');
  const twice = BODIES.applyBody(JSON.parse(JSON.stringify(once)), 'female');
  assert.deepEqual(twice, once, 'the swap is idempotent, so it can run on every normalize');
  assert.equal(BODIES.applyBody(once, 'female'), once, 'and returns the same object when there is nothing to do');
});

// =================================================================== 05 wiring

test('both shells load the catalogue before the code that reads it', () => {
  ['engine_editor.html', 'gameplay.html'].forEach(shell => {
    const html = fs.readFileSync(root(shell), 'utf8');
    const catalogue = html.indexOf('js/runtime/character-bodies.js');
    const pawn = html.indexOf('js/runtime/character-pawn-base.js');
    const templates = html.indexOf('js/logic/logic-templates-character.js');
    assert.ok(catalogue > 0, shell + ' loads the body catalogue');
    assert.ok(catalogue < pawn, shell + ': the catalogue must precede the Pawn base');
    assert.ok(catalogue < templates, shell + ': and precede the template pack that aliases it');
  });
});

test('putting a graph on a body moves the Inspector with the Pawn', () => {
  // A level places a template and then adjusts it, so the swap has to work after
  // the fact - and on all four places a graph carries the body, or the Inspector
  // shows one mannequin while the viewport shows the other.
  require('../js/logic/logic-graph.js');
  require('../js/logic/logic-registry.js');
  require('../js/logic/logic-templates.js');
  require('../js/logic/logic-templates-character.js');
  const pack = global.LK_LOGIC_TEMPLATES_CHARACTER;
  const graph = JSON.parse(JSON.stringify(global.LK_LOGIC_TEMPLATES.get('logic-template-talkable-civil-npc').graph));
  assert.equal(graph.characterPawn.bodyType, 'male', 'the NPC template starts male');

  pack.applyGraphBody(graph, 'female');
  assert.match(graph.characterPawn.model.src, /x-bot\.fbx$/, 'the Pawn moved');
  const element = graph.logicScene.elements.find(item => item.id === 'character_model');
  assert.equal(element.asset.src, graph.characterPawn.model.src, 'the model element moved with it');
  const variable = binding => graph.variables.find(item => item.binding === binding);
  assert.equal(variable('bodyType').value, 'female', 'the Body select shows the real body');
  assert.equal(variable('animations.walk').value.asset.src, graph.characterPawn.animations.walk.asset.src,
    'the Animations category shows the clip the Pawn will actually play');
  assert.equal(variable('appearance.shirtColor').value, graph.characterPawn.appearance.shirtColor,
    'and the colour swatch matches the Pawn');
});

test('the character level ships one of each body, so both are visible without authoring', () => {
  const level = fs.readFileSync(root('js/runtime/character-level-template.js'), 'utf8');
  assert.match(level, /applyBody\(g,'female'\)/, 'the NPC is placed on the female body');
  assert.match(level, /applyGraphBody/, 'through the shared operation, not by hand-editing the Pawn');
});

test('the template pack reads the catalogue instead of keeping its own copy', () => {
  const pack = fs.readFileSync(root('js/logic/logic-templates-character.js'), 'utf8');
  assert.match(pack, /LK_RUNTIME_CHARACTER_BODIES/, 'it defers to the shared table');
  assert.ok(!/mannequin-male/.test(pack),
    'the file paths must live in one place only, or the two copies drift apart');
  assert.ok(!/1\.941743/.test(pack), 'and so must the measured fits');
});

console.log('\ncharacter body selection tests passed');
