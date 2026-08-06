'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

global.window = global;
require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');

const game = {player:null, systems:{}};
const registry = global.LK_RUNTIME_VEHICLE_PAWNS.createRegistry(game);

function actor(id, pawnType){
  const pawn = {
    id, kind:'logic-element', pawnType, playerId:null, possessed:false, control:null,
    cameraReleases:0, controlReleases:0,
    possessCamera(enabled){ if(enabled === false) this.cameraReleases++; return true; },
    clearPlayerControlState(){ this.control = null; this.controlReleases++; return true; },
  };
  registry.register(pawn);
  return pawn;
}

const character = actor('character', 'character');
const vehicle = actor('vehicle', 'vehicle');
const cat = actor('cat', 'animal');
const horse = actor('horse', 'animal');
const keeper = actor('keeper', 'soccer');

assert.equal(registry.claimPlayerSlot(character, 1, false), true);
assert.equal(registry.claimPlayerSlot(vehicle, 2, false), true);
assert.equal(registry.claimPlayerSlot(cat, 3, false), true);
assert.equal(registry.claimPlayerSlot(horse, 4, false), true);
assert.deepEqual([1,2,3,4].map(id => registry.getByPlayerId(id).id), ['character','vehicle','cat','horse']);

// Failed author/runtime retargets are atomic: P2 must not become an invisible
// free slot just because that Pawn also tried to claim occupied P1.
assert.equal(registry.claimPlayerSlot(vehicle, 1, false), false);
assert.equal(vehicle.playerId, 2);
assert.equal(vehicle.possessed, true);
assert.equal(registry.getByPlayerId(2), vehicle);

// Only an explicit transfer may displace an actor, and it must release camera
// plus transient controller state as symmetrically as normal unpossess.
character.control = {fire:true, jump:true};
assert.equal(registry.claimPlayerSlot(keeper, 1, true), true);
assert.equal(registry.getByPlayerId(1), keeper);
assert.equal(character.playerId, null);
assert.equal(character.possessed, false);
assert.equal(character.cameraReleases, 1);
assert.equal(character.controlReleases, 1);
assert.equal(character.control, null);

keeper.control = {shoot:true};
assert.equal(registry.claimPlayerSlot(keeper, null, false), true);
assert.equal(registry.getByPlayerId(1), null);
assert.equal(keeper.cameraReleases, 1);
assert.equal(keeper.controlReleases, 1);
assert.equal(keeper.control, null);
assert.equal(registry.claimPlayerSlot(character, 1, false), true, 'released slots must be reusable immediately');

// Shipped default Pawns cooperate with the conflict guard. Force remains a
// node capability for authored mount/vehicle/soccer switching flows only.
for(const file of [
  'js/logic/logic-templates.js',
  'js/logic/logic-templates-character.js',
  'js/logic/logic-templates-animal.js',
  'js/logic/logic-templates-soccer.js',
  'js/logic/logic-templates-fps.js',
]){
  const source = read(file);
  assert.equal(/['"]pawn\.possess['"][\s\S]{0,140}\{force\s*:\s*true\}/.test(source), false,
    file + ' must not force its automatic OnStart claim');
}
for(const file of [
  'js/logic/logic-templates.js',
  'js/logic/logic-templates-character.js',
  'js/logic/logic-templates-animal.js',
  'js/logic/logic-templates-soccer.js',
]) assert.match(read(file), /ControllerPlayerId[^\n]*ui\s*:\s*['"]player-id['"]/,
  file + ' must expose the shared None/P1-P4 Inspector control');
assert.match(read('js/logic/logic-templates-fps.js'), /characterApi\.makeGraph/,
  'the FPS template must inherit the Character Player assignment control');

const inspector = read('js/editor/logic-elements-inspector.js');
for(const descriptor of ['characterPawn','animalPawn','soccerPawn','sketchbookPawn','vehiclePawn','playerPawnBlueprint']){
  assert.match(inspector, new RegExp('otherGraph\\.' + descriptor),
    'Inspector conflict guard must include ' + descriptor);
}

console.log('player-assignment-conflicts.test.js: all assertions passed');
