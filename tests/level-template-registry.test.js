'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/engine/level-template-registry.js');
const REGISTRY = global.LK_LEVEL_TEMPLATES;

function reset(){ REGISTRY.list().forEach(template => REGISTRY.unregister(template.id)); }

function run(){
  reset();

  // --- descriptor normalization -------------------------------------------
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  assert.deepEqual(REGISTRY.register({id:'', build(){}}), [], 'a descriptor without an id is rejected');
  assert.deepEqual(REGISTRY.register({id:'no-builder'}), [], 'a descriptor without a build function is rejected');
  console.warn = originalWarn;
  assert.equal(warnings.length, 2, 'each rejected descriptor is reported once');
  assert.equal(REGISTRY.list().length, 0);

  REGISTRY.register({id:'minimal', build:scene => scene});
  const minimal = REGISTRY.get('minimal');
  assert.equal(minimal.name, 'minimal', 'name falls back to the id');
  assert.equal(minimal.nameIt, 'minimal', 'the Italian label falls back to the English one');
  assert.equal(minimal.ground, 'plane', 'plane is the default ground');
  assert.equal(minimal.category, 'Blank', 'an unknown category falls back to Blank');
  assert.equal(minimal.keepBuiltinPlayer, false, 'the builtin player is dropped unless a template opts in');
  assert.equal(minimal.order, 500);
  assert.throws(() => { REGISTRY.get('minimal').name = 'mutated'; }, 'descriptors are frozen');

  REGISTRY.register({id:'bad-ground', ground:'lava', build:scene => scene});
  assert.equal(REGISTRY.get('bad-ground').ground, 'plane', 'an unsupported ground mode falls back to plane');

  // --- ordering and options ------------------------------------------------
  reset();
  REGISTRY.register([
    {id:'c', name:'Charlie', nameIt:'Carlo', order:300, build:scene => scene},
    {id:'a', name:'Alpha', nameIt:'Alfa', order:100, build:scene => scene},
    {id:'b', name:'Bravo', order:200, build:scene => scene},
  ]);
  assert.deepEqual(REGISTRY.list().map(t => t.id), ['a','b','c'], 'list is sorted by order');
  assert.deepEqual(REGISTRY.options((en) => en).map(o => o.label), ['Alpha','Bravo','Charlie']);
  assert.deepEqual(REGISTRY.options((en, it) => it).map(o => o.label), ['Alfa','Bravo','Carlo'],
    'Bravo declares no nameIt, so its Italian option label falls back to English');

  // --- resolution ----------------------------------------------------------
  assert.equal(REGISTRY.resolve('a').id, 'a');
  assert.equal(REGISTRY.resolve('does-not-exist').id, 'a',
    'an unknown id resolves to the first registered template rather than null');
  REGISTRY.register({id:REGISTRY.DEFAULT_ID, name:'Default', order:50, build:scene => scene});
  assert.equal(REGISTRY.defaultId(), REGISTRY.DEFAULT_ID);
  assert.equal(REGISTRY.resolve('nope').id, REGISTRY.DEFAULT_ID, 'unknown ids prefer the declared default');

  // --- build ---------------------------------------------------------------
  reset();
  let received = null;
  REGISTRY.register({id:'builder', build(scene, context){ received = context; scene.marked = true; return scene; }});
  const built = REGISTRY.build('builder', {added:[]}, {GAME:'game-ref'});
  assert.equal(built.marked, true);
  assert.equal(received.GAME, 'game-ref', 'build context is forwarded to the template');
  assert.equal(received.template.id, 'builder', 'the descriptor is available to its own builder');

  REGISTRY.register({id:'null-builder', build(){ return null; }});
  const passthrough = {untouched:true};
  assert.equal(REGISTRY.build('null-builder', passthrough), passthrough,
    'a builder returning nothing must not discard the baseline scene');

  // --- wiring: every shipped template registers itself ---------------------
  reset();
  const repoRoot = path.join(__dirname, '..');
  const moduleTemplates = {
    'js/runtime/sketchbook-open-world-level-template.js':'open-world-sketchbook',
    'js/runtime/character-level-template.js':'character-movement-playground',
    'js/runtime/penalty-shootout-level-template.js':'penalty-shootout-stadium',
    'js/runtime/fps-arena-level-template.js':'fps-shooter-test',
    'js/runtime/snowboarding-level-template.js':'snowboarding-objective-run',
    'js/runtime/jungle-car-escape-level-template.js':'jungle-car-escape',
    'js/runtime/fps-enemy-outpost-level-template.js':'fps-enemy-outpost',
    'js/runtime/cat-neighborhood-level-template.js':'cat-neighborhood-adventure',
  };
  Object.keys(moduleTemplates).forEach(file => {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    assert.ok(source.includes('LK_LEVEL_TEMPLATES'), file + ' must self-register its level template');
    assert.ok(source.includes("'" + moduleTemplates[file] + "'"), file + ' must keep its established template id');
  });

  const store = fs.readFileSync(path.join(repoRoot, 'js/engine/scene-store.js'), 'utf8');
  assert.ok(store.includes("registry.build(template.id"), 'templateScene must delegate to the registry');
  assert.ok(!/const\s+characterTemplate\s*=\s*templateId\s*===/.test(store),
    'the hardcoded templateId comparison chain must be gone from scene-store');
  ["id:'drift-track-minami'", "id:'empty'"].forEach(id => {
    assert.ok(store.includes(id), 'scene-store must register its own inline template ' + id);
  });

  const levelManager = fs.readFileSync(path.join(repoRoot, 'js/editor/level-manager.js'), 'utf8');
  assert.ok(levelManager.includes('templateRegistry.options(tr)'),
    'the New Level dialog must build its options from the registry');
  assert.ok(!levelManager.includes("{value:'penalty-shootout-stadium', label:"),
    'the hardcoded New Level template list must be gone');

  // --- html / loader wiring ------------------------------------------------
  ['engine_editor.html','gameplay.html'].forEach(file => {
    const html = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const registryIndex = html.indexOf('js/engine/level-template-registry.js');
    assert.ok(registryIndex > 0, file + ' must load the level template registry');
    Object.keys(moduleTemplates).forEach(moduleFile => {
      const templateIndex = html.indexOf(moduleFile);
      assert.ok(templateIndex > registryIndex,
        file + ' must load ' + moduleFile + ' after the registry so registration succeeds');
    });
  });
  const loader = fs.readFileSync(path.join(repoRoot, 'js/editor/loader.js'), 'utf8');
  assert.ok(loader.includes('js/engine/level-template-registry.js'),
    'the lazy editor loader must also provide the registry for cached HTML shells');
  Object.keys(moduleTemplates).forEach(moduleFile => {
    assert.ok(loader.includes(moduleFile), 'the lazy editor loader must provide ' + moduleFile);
  });

  console.log('level-template-registry.test.js: all assertions passed');
}

try { run(); }
catch(error){ console.error(error); process.exitCode = 1; }
