'use strict';

// "DollBody" is the product name for this engine's character / vehicle
// traversal kit. The upstream project it derives from keeps its credit in the
// licence, the docs and the SOURCE provenance blocks — but its name must never
// appear as a label, a title or an identifier the user can see.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// Quoted strings that reach a user: labels, titles, names, descriptions.
// Provenance fields are explicitly allowed to name the source.
const PROVENANCE = /swift502|LICENSE|licence|license|MIT|repository|attribution|sourcePath|github\.com|Jan Bl/i;
// An apostrophe inside a comment ("the loader's offset") is not an opening
// quote, but a raw scan pairs it with the next one and then reports the code
// caught in between. Comments carry no user-facing label, so they are removed
// before the strings are collected.
function stripComments(source){
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function userFacingStrings(source){
  source = stripComments(source);
  const out = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g;
  let match;
  while((match = re.exec(source))){
    const value = match[1] != null ? match[1] : match[2];
    if(!value || !/sketchbook/i.test(value)) continue;
    if(PROVENANCE.test(value)) continue;
    // Internal identifiers are a separate, migration-bearing concern.
    if(/^[a-z0-9._:/-]*sketchbook[a-z0-9._:/-]*$/i.test(value)) continue;
    // Module paths and their cache-busting query, not labels.
    if(/^js\/[a-z0-9/_-]+\.js(\?v=[a-z0-9.-]+)?$/i.test(value)) continue;
    // Embedded source snippets asserted elsewhere, not UI copy.
    if(value.length > 120 || /\\n/.test(value)) continue;
    out.push(value);
  }
  return out;
}

test('no user-facing label names the upstream project', () => {
  const files = [
    'js/logic/logic-templates-sketchbook.js',
    'js/runtime/sketchbook-open-world-level-template.js',
    'js/editor/asset-panel.js',
    'js/editor/logic-elements-inspector.js',
    'js/engine/scene-store.js',
    'js/editor/loader.js',
  ];
  const offenders = [];
  files.forEach(file => userFacingStrings(read(file)).forEach(value => offenders.push(file + ': ' + value)));
  assert.deepEqual(offenders, [], 'these labels still show the upstream name to the user');
});

test('the product name is actually used for the shipped templates', () => {
  const templates = read('js/logic/logic-templates-sketchbook.js');
  ['DollBody - Advanced Character', 'DollBody - Arcade Car',
   'DollBody - Arcade Airplane', 'DollBody - Arcade Helicopter']
    .forEach(name => assert.ok(templates.includes(name), 'missing template name: ' + name));

  const level = read('js/runtime/sketchbook-open-world-level-template.js');
  assert.ok(level.includes("name:'DollBody Open World'"), 'the level template must present as DollBody');
  assert.ok(level.includes("'DollBody Pawns'"), 'the scene group must present as DollBody');
});

test('attribution survives the rename', () => {
  const level = read('js/runtime/sketchbook-open-world-level-template.js');
  assert.ok(level.includes('swift502'), 'the upstream author credit must remain');
  assert.ok(level.includes('MIT'), 'the licence must remain');
  const templates = read('js/logic/logic-templates-sketchbook.js');
  assert.ok(/Jan Bl.*swift502/.test(templates), 'the SOURCE block must keep the author credit');
  assert.ok(fs.existsSync(path.join(ROOT, 'models/sketchbook/LICENSE-Sketchbook-MIT.txt')),
    'the upstream licence file must stay shipped');
});

test('internal identifiers are untouched, so saved projects still load', () => {
  // Renaming these is a separate change that needs a project migration; until
  // then they must stay exactly as every saved level already spells them.
  const level = read('js/runtime/sketchbook-open-world-level-template.js');
  ['logic-template-sketchbook-car', 'sketchbook_pawn_character', 'models/sketchbook/world.glb']
    .forEach(id => assert.ok(level.includes(id), 'saved-project identifier must not change yet: ' + id));
  assert.ok(read('js/logic/logic-services.js').includes('graph.sketchbookPawn'),
    'the descriptor key is persisted data and must keep loading');
});

console.log('dollbody-naming.test.js: all assertions passed');
