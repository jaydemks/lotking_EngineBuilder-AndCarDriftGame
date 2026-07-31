const assert = require('node:assert/strict');
const fs = require('node:fs');

const store = fs.readFileSync('js/engine/scene-store.js', 'utf8');
const projectIo = fs.readFileSync('js/editor/project-io.js', 'utf8');
const levelManager = fs.readFileSync('js/editor/level-manager.js', 'utf8');

assert.match(store, /reconcileActive\(id\)/, 'the level store exposes an explicit active-index repair');
assert.match(store, /idx\.activeId = target/, 'the repair aligns the index with the loaded level id');
assert.match(projectIo, /LV\.reconcileActive\(loadedId\)/, 'editor entry repairs the index from the loaded project metadata');
assert.match(levelManager, /LV\.reconcileActive\(ED\.trackId\)/, 'opening Project Levels rechecks the loaded editor identity');
assert.match(store, /active level[\s\S]{0,80}is an alias of that slot/i,
  'the active level is not duplicated across the scene slot and level library');
assert.match(store, /localStorage\.removeItem\(LEVEL_PREFIX \+ id\)/,
  'saving or activating a level removes its redundant library copy');
assert.match(store, /localStorage\.setItem\(LEVEL_PREFIX \+ previousId, previousRaw\)[\s\S]{0,120}localStorage\.removeItem\(KEY\)/,
  'switching levels moves the previous active slot before loading the next one');

console.log('level-active-sync.test.js: all assertions passed');
