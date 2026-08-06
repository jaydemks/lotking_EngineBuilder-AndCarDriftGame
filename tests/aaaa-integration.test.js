'use strict';

// Cross-surface contract for systems added by the AAAA roadmap. A feature is
// not integrated when it exists on disk but is missing from Play Preview, the
// standalone gameplay shell or the lazy editor loader.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const scripts = source => Array.from(source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi), match => match[1].replace(/[?#].*$/, ''));

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

const editorHtml = read('engine_editor.html');
const gameplayHtml = read('gameplay.html');
const testEditorHtml = read('test-editor.html');
const loader = read('js/editor/loader.js');
const editorScripts = scripts(editorHtml);
const gameplayScripts = scripts(gameplayHtml);

test('every self-registering level template reaches editor, gameplay and lazy loader', () => {
  const templates = fs.readdirSync(path.join(ROOT, 'js/runtime'))
    .filter(file => /-level-template\.js$/.test(file))
    .map(file => 'js/runtime/' + file)
    .sort();
  assert.ok(templates.length >= 4, 'the established templates disappeared');
  for(const file of templates){
    assert.ok(editorScripts.includes(file), file + ' is missing from engine_editor.html');
    assert.ok(gameplayScripts.includes(file), file + ' is missing from gameplay.html / playable export');
    assert.ok(loader.includes(file), file + ' is missing from the lazy editor loader');
  }
});

test('registry and mission foundations load before their consumers', () => {
  const registry = 'js/engine/level-template-registry.js';
  const firstTemplateEditor = Math.min(...editorScripts.filter(file => /-level-template\.js$/.test(file)).map(file => editorScripts.indexOf(file)));
  const firstTemplateGameplay = Math.min(...gameplayScripts.filter(file => /-level-template\.js$/.test(file)).map(file => gameplayScripts.indexOf(file)));
  assert.ok(editorScripts.indexOf(registry) >= 0 && editorScripts.indexOf(registry) < firstTemplateEditor);
  assert.ok(gameplayScripts.indexOf(registry) >= 0 && gameplayScripts.indexOf(registry) < firstTemplateGameplay);
  for(const file of [
    'js/runtime/objective-hud.js',
    'js/runtime/objective-system.js',
    'js/logic/logic-templates-mission.js',
    'js/logic/logic-nodes-objectives.js',
    'js/runtime/weather-system.js',
    'js/logic/logic-nodes-weather.js',
  ]){
    assert.ok(editorScripts.includes(file), file + ' is missing from Play Preview');
    assert.ok(gameplayScripts.includes(file), file + ' is missing from standalone gameplay/export');
    assert.ok(loader.includes(file), file + ' is missing from the lazy editor loader');
  }
});

test('Animal Pawn remains portable while its authoring adapter stays editor-only', () => {
  const portable = [
    'js/runtime/animal-placeholder-locomotion.js',
    'js/runtime/animal-pawns.js',
    'js/logic/logic-templates-animal.js',
    'js/logic/logic-nodes-animal.js',
  ];
  for(const file of portable){
    assert.ok(editorScripts.includes(file), file + ' is missing from Play Preview');
    assert.ok(gameplayScripts.includes(file), file + ' is missing from gameplay/export');
    assert.ok(loader.includes(file), file + ' is missing from the lazy editor loader');
  }
  const studio = 'js/editor/animal-pawn-studio.js';
  assert.ok(editorScripts.includes(studio), 'Animal Pawn Studio is missing from the editor');
  assert.ok(loader.includes(studio), 'Animal Pawn Studio is missing from the lazy editor loader');
  assert.ok(!gameplayScripts.includes(studio), 'editor-only Animal Pawn Studio leaked into gameplay/export');
  const services = read('js/logic/logic-services.js');
  assert.ok(services.includes('graph && graph.animalPawn'), 'logic services cannot materialize graph.animalPawn');
  assert.ok(services.indexOf('graph && graph.animalPawn') < services.indexOf('graph && (graph.vehiclePawn || graph.playerPawnBlueprint)'), 'Animal Pawn dispatch must remain separate from the native vehicle fallback');
});

test('Actor input, combat, behaviour, damage and death foundations ship together', () => {
  const portable = [
    'js/runtime/input/player-action-router.js',
    'js/runtime/combat/damage-contract.js',
    'js/runtime/physics/pawn-death-physics.js',
    'js/runtime/combat/actor-combat.js',
    'js/runtime/ai/actor-cover-planner.js',
    'js/runtime/ai/actor-behavior.js',
  ];
  for(const file of portable){
    assert.ok(editorScripts.includes(file), file + ' is missing from Play Preview');
    assert.ok(gameplayScripts.includes(file), file + ' is missing from standalone gameplay/export');
    assert.ok(loader.includes(file), file + ' is missing from the lazy editor loader');
  }
  const before = (list, dependency, consumer) => {
    assert.ok(list.indexOf(dependency) >= 0 && list.indexOf(dependency) < list.indexOf(consumer), dependency + ' must load before ' + consumer);
  };
  for(const list of [editorScripts, gameplayScripts]){
    before(list, 'js/runtime/combat/damage-contract.js', 'js/runtime/item-system.js');
    before(list, 'js/runtime/physics/pawn-death-physics.js', 'js/runtime/character-vitals.js');
    before(list, 'js/runtime/combat/actor-combat.js', 'js/runtime/ai/actor-behavior.js');
    before(list, 'js/runtime/ai/actor-cover-planner.js', 'js/runtime/ai/actor-behavior.js');
    before(list, 'js/runtime/ai/actor-behavior.js', 'js/runtime/fps-enemy-outpost-level-template.js');
  }
});

test('cloud runtime cache identity is current and identical on all browser shells', () => {
  const tag = 'js/runtime/volumetric-clouds.js?v=0.7.8-webgpu-safe-2';
  assert.ok(editorHtml.includes(tag));
  assert.ok(gameplayHtml.includes(tag));
  assert.ok(testEditorHtml.includes(tag));
  assert.ok(!editorHtml.includes('volumetric-clouds.js?v=0.7.4-cinematic-optics-1'));
});

test('Sketchbook stability runtime has one cache identity in editor, test and export shells', () => {
  const portable = [
    'js/runtime/sketchbook-pawns.js',
    'js/runtime/sketchbook-open-world-level-template.js',
    'js/logic/logic-templates-sketchbook.js',
    'js/logic/logic-services.js',
    'js/runtime/logic-elements-runner.js',
    // Every authored Character Pawn is routed through the implementation
    // registry, so a stale copy of it costs a Pawn its weapon and its rig.
    'js/runtime/character-implementations.js',
  ];
  // These files are bumped together whenever any of them changes, so the
  // contract asserted here is that the shells and the lazy loader AGREE, not
  // that they sit on one literal version forever. Pinning the literal only
  // meant editing this file on every bump, which is not what it is for.
  const tags = new Set();
  for(const file of portable){
    const pattern = new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\?(v=[^"\']+)');
    const editorTag = editorHtml.match(pattern);
    assert.ok(editorTag, file + ' must carry a cache-busting version in Play Preview');
    const ref = file + '?' + editorTag[1];
    assert.ok(gameplayHtml.includes(ref), ref + ' is missing from playable export');
    assert.ok(loader.includes(ref), file + ' is stale in the lazy editor loader');
    // The test shell boots the editor only, so it carries the editor scripts and
    // not the runtime-only ones.
    if(testEditorHtml.includes(file + '?')) assert.ok(testEditorHtml.includes(ref), ref + ' is stale in the test shell');
    tags.add(editorTag[1]);
  }
  assert.equal(tags.size, 1, 'the DollBody runtime must ship as one cache identity, saw ' + Array.from(tags).join(', '));
  for(const file of ['js/lot-king.js','js/engine/scene-store.js']){
    const pattern = new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\?(v=[^"\']+)');
    const editorTag = editorHtml.match(pattern);
    assert.ok(editorTag, file + ' must carry a cache-busting version in Play Preview');
    const ref = file + '?' + editorTag[1];
    assert.ok(gameplayHtml.includes(ref), ref + ' is missing from playable export');
    assert.ok(testEditorHtml.includes(ref), ref + ' is missing from the test shell');
  }
});

test('playable ZIP discovers scripts from gameplay and keeps Sketchbook attribution mandatory', () => {
  const zip = read('js/editor/playable-export-zip.js');
  assert.ok(zip.includes('extractLocalRuntimeRefs(runtimeHtml)'));
  assert.ok(zip.includes("'models/sketchbook/LICENSE-Sketchbook-MIT.txt'"));
  assert.ok(zip.includes("asset.indexOf('models/sketchbook/') === 0"));
});

test('split-screen renders Player 1 without advancing its logic camera twice', () => {
  const game = read('js/lot-king.js');
  assert.ok(game.includes("if(output.playerId !== 1) updateLogicPawnCameraOverride(dt, pawn);"));
});

console.log('aaaa-integration.test.js: all assertions passed');
