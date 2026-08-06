'use strict';

/* =========================================================
   Character implementation registry.

   `js/logic/logic-services.js` routes EVERY authored `characterPawn` through
   `LK_RUNTIME_CHARACTER_IMPLEMENTATIONS.createCharacter()`, not only the ones
   whose author asked for a different locomotion backend. The registry therefore
   has one hard invariant: translating a descriptor into the shape it is already
   in must not change it.

   It is asserted here because breaking it is silent and total — a translator
   that rebuilds a native descriptor from the handful of fields the Sketchbook
   runtime exposes drops `firstPerson`, `abilities`, `cover`, `vitals`,
   `loadout`, `inventory` and `appearance`, and the FPS player spawns with no
   weapon, no traversal moves and no view rig, on a vehicle follow camera.

   HOW THIS FILE IS ORGANISED
     01 harness      window stubs, THREE, module load order
     02 shape        which descriptor is in which shape
     03 identity     translating into the current shape changes nothing
     04 round trip   native -> sketchbook -> native keeps the authored blocks
     05 live pawn    the FPS template really spawns armed through the registry
   ========================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const THREE = require('three');

// ================================================================= 01 harness

global.window = global;
global.THREE = THREE;
global.CustomEvent = class CustomEvent {
  constructor(type, init){ this.type = type; this.detail = (init || {}).detail || {}; }
};
const listeners = {};
global.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
global.removeEventListener = (type, fn) => {
  const list = listeners[type] || [];
  const at = list.indexOf(fn);
  if(at >= 0) list.splice(at, 1);
};
global.dispatchEvent = event => { (listeners[event.type] || []).forEach(fn => fn(event)); return true; };

require('../js/runtime/character-placeholder-locomotion.js');
require('../js/runtime/mixamo-placeholder-clips.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-nodes-character.js');
require('../js/logic/logic-nodes-fps.js');
require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/input/input-actions.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-animation-set.js');
// The FPS templates seed their weapon values from the runtime's presets, so the
// controller has to be loaded before the template pack is built.
require('../js/runtime/first-person-controller.js');
require('../js/logic/logic-templates.js');
require('../js/runtime/character-bodies.js');
require('../js/logic/logic-templates-character.js');
require('../js/logic/logic-templates-fps.js');
require('../js/runtime/character-abilities.js');
require('../js/runtime/character-vitals.js');
require('../js/runtime/character-combat-cover.js');
require('../js/runtime/item-system.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/character-pawns.js');
require('../js/runtime/character-implementations.js');

const IMPL = global.LK_RUNTIME_CHARACTER_IMPLEMENTATIONS;
const TEMPLATES = global.LK_LOGIC_TEMPLATES;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
function fpsDescriptor(){
  const template = TEMPLATES.get('logic-template-player-first-person');
  assert.ok(template && template.graph && template.graph.characterPawn, 'missing FPS template');
  return JSON.parse(JSON.stringify(template.graph.characterPawn));
}

// =================================================================== 02 shape

test('the registry can tell a native descriptor from a Sketchbook one', () => {
  const native = fpsDescriptor();
  assert.equal(IMPL.isNativeShape(native), true);
  assert.equal(IMPL.isSketchbookShape(native), false);
  const sketchbook = IMPL.toSketchbook(native);
  assert.equal(IMPL.isSketchbookShape(sketchbook), true);
  assert.equal(IMPL.isNativeShape(sketchbook), false);
  // A Sketchbook descriptor is recognised by its own tuning budget even when
  // the type tag is missing, because `sketchbookPawn` graphs author it that way.
  assert.equal(IMPL.isSketchbookShape({tuning:{groundProbe:{rayLength:.57}}}), true);
  assert.equal(IMPL.isSketchbookShape({tuning:{movement:{moveSpeed:5}}}), true);
  // `tuning` alone is not enough: a vehicle-shaped tuning block is not a
  // character backend.
  assert.equal(IMPL.isSketchbookShape({tuning:{horsepower:300}}), false);
});

// ================================================================ 03 identity

test('translating a native descriptor to native changes nothing', () => {
  const native = fpsDescriptor();
  const before = JSON.stringify(native);
  const after = IMPL.toNative(native);
  assert.equal(JSON.stringify(after), before, 'toNative must be the identity on its own shape');
  assert.notEqual(after, native, 'the result must be a copy, not the caller descriptor');
});

test('the native path preserves every authored gameplay block', () => {
  const native = fpsDescriptor();
  const after = IMPL.toNative(native);
  // These are exactly the blocks the FPS player is made of. A translator that
  // only knows Sketchbook fields silently returns a descriptor without them.
  ['firstPerson', 'abilities', 'vitals', 'loadout', 'inventory'].forEach(key => {
    assert.deepEqual(after[key], native[key], 'lost the ' + key + ' block');
  });
  assert.equal(after.firstPerson.enabled, true);
  assert.ok(after.firstPerson.weapon && after.firstPerson.weapon.magazine > 0, 'the starting weapon must survive');
  assert.equal(after.abilities.slide.enabled, true, 'slide/roll must survive');
  assert.ok(Array.isArray(after.loadout) && after.loadout.length >= 4, 'the spawn loadout must survive');
  assert.equal(after.movement.inputMode, 'heading', 'the authored control frame must survive');
});

test('translating a Sketchbook descriptor to Sketchbook does not eat its native original', () => {
  const native = fpsDescriptor();
  const once = IMPL.toSketchbook(native);
  const twice = IMPL.toSketchbook(once);
  assert.deepEqual(twice.sourceCharacterPawn, once.sourceCharacterPawn,
    'a second conversion must not overwrite the stored native descriptor with the Sketchbook one');
  assert.ok(twice.sourceCharacterPawn.firstPerson, 'the native blocks must still be reachable');
});

// ============================================================== 04 round trip

test('native -> sketchbook -> native restores the authored blocks', () => {
  const native = fpsDescriptor();
  const sketchbook = IMPL.toSketchbook(native);
  const back = IMPL.toNative(sketchbook);
  ['firstPerson', 'abilities', 'vitals', 'loadout', 'inventory', 'appearance'].forEach(key => {
    assert.deepEqual(back[key], native[key], 'round trip lost ' + key);
  });
});

test('the round trip keeps a spawn and possession the Sketchbook backend moved', () => {
  const native = fpsDescriptor();
  const sketchbook = IMPL.toSketchbook(native);
  sketchbook.spawn = {x:12, y:3, z:-4, heading:1.2};
  sketchbook.playerId = 2;
  const back = IMPL.toNative(sketchbook);
  assert.deepEqual(back.spawn, {x:12, y:3, z:-4, heading:1.2});
  assert.equal(back.playerId, 2);
  assert.ok(back.firstPerson, 'the live transform must not cost the authored blocks');
});

// ================================================================ 05 live pawn

// A Pawn built the way `logic-services.js` builds one: through the registry,
// with the backend the exposed `Locomotion Backend` variable selects.
function spawnThroughRegistry(descriptor, implementation){
  const GAME = {state:{}, systems:{}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  global.LK_RUNTIME_ITEMS.install(GAME);
  const owner = new THREE.Group();
  owner.name = 'Player (First Person)';
  const pawn = IMPL.createCharacter(GAME, owner, descriptor, {}, implementation);
  return {GAME, owner, pawn};
}

test('the FPS template spawns armed and traversal-capable through the registry', () => {
  const {pawn} = spawnThroughRegistry(fpsDescriptor(), 'native');
  assert.ok(pawn, 'the registry must build a Pawn');
  assert.equal(pawn.characterImplementation, 'native');
  assert.ok(pawn.firstPerson, 'no first-person rig: the Camera Mode key would fall through to the vehicle cameras');
  assert.equal(pawn.firstPerson.enabled(), true);
  assert.ok(pawn.abilities, 'no traversal: crouch, slide, roll, vault and mantle would all be gone');
  assert.ok(pawn.vitals, 'no vitals: damage and medkits would have nothing to write into');
  assert.ok(pawn.inventory, 'no inventory: weapons on the ground could not be picked up');
  const ammo = pawn.firstPerson.ammo();
  assert.ok(ammo.ammo > 0, 'the Pawn must spawn with a loaded magazine');
  assert.equal(pawn.firstPerson.viewMode(), 'first');
  assert.equal(pawn.firstPerson.toggleViewMode(), 'third', 'Camera Mode must swap the view on the rig');
  assert.equal(pawn.firstPerson.toggleViewMode(), 'first');
});

test('a level-template block the registry has never heard of survives the trip', () => {
  // FPS Enemy Outpost hangs its whole AI off `characterPawn.enemyAi`, which no
  // backend maps. A translator that rebuilds the descriptor from the fields it
  // does know drops it, and four enemies stand still in an empty outpost.
  const descriptor = fpsDescriptor();
  descriptor.enemyAi = {enabled:true, tag:'enemy', sightRange:42, patrol:[{x:1, z:2}]};
  descriptor.vitals = Object.assign({}, descriptor.vitals, {team:'enemy'});
  const {pawn} = spawnThroughRegistry(descriptor, 'native');
  assert.deepEqual(pawn.config.enemyAi, descriptor.enemyAi, 'the AI block must reach the Pawn config');
  assert.equal(pawn.config.vitals.team, 'enemy');
  // And it survives a full round trip through the other backend as well.
  const back = IMPL.toNative(IMPL.toSketchbook(descriptor));
  assert.deepEqual(back.enemyAi, descriptor.enemyAi);
});

test('an omitted backend id still resolves to the native character', () => {
  const {pawn} = spawnThroughRegistry(fpsDescriptor(), '');
  assert.equal(pawn.characterImplementation, 'native');
  assert.ok(pawn.firstPerson);
});

test('the Logic service reads the backend id after the graph bindings are applied', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/logic/logic-services.js'), 'utf8');
  assert.ok(source.includes('boundCharacter.implementation'),
    'the exposed Locomotion Backend variable binds to `implementation`, so the raw descriptor is stale');
  assert.ok(!/createCharacter\([\s\S]{0,240}characterDefinition\.implementation/.test(source),
    'the pre-binding value must not decide the backend');
});

console.log('\ncharacter implementation registry tests passed');
