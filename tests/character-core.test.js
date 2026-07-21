'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-nodes-soccer.js');
require('../js/logic/logic-nodes-character.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-soccer.js');
require('../js/logic/logic-templates-character.js');
require('../js/logic/logic-validator.js');
require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/soccer-locomotion.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/character-pawns.js');
require('../js/runtime/soccer-pawns.js');
require('../js/runtime/character-level-template.js');

const registry = global.LK_LOGIC_NODES_MVP.createRegistry();
function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

test('generic character node pack and template validate cleanly', () => {
  ['character.getMoveInput','character.setMoveInput','character.jump','character.playAction','character.setPreset','character.getState']
    .forEach(type => assert.ok(registry.get(type), 'missing node ' + type));
  const template = global.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal');
  assert.ok(template && template.graph.characterPawn);
  const result = global.LK_LOGIC_VALIDATOR.validateGraph(template.graph, registry);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const npc = global.LK_LOGIC_TEMPLATES.get('logic-template-talkable-civil-npc');
  assert.ok(npc && npc.graph.characterPawn);
  const npcResult = global.LK_LOGIC_VALIDATOR.validateGraph(npc.graph, registry);
  assert.equal(npcResult.ok, true, JSON.stringify(npcResult.errors));
});

test('character template documents in-place animation requirements', () => {
  const graph = global.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal').graph;
  const variables = new Map(graph.variables.map(variable => [variable.binding, variable]));
  ['animations.idle','animations.walk','animations.run','animations.jump','animations.interact'].forEach(binding => {
    const variable = variables.get(binding);
    assert.ok(variable, 'missing ' + binding);
    assert.match(variable.description, /in-place/i);
    assert.match(variable.description, /root motion|root translation/i);
  });
  assert.equal(variables.get('preset').options.length, 3);
});

test('normal, civil and police presets normalize independently', () => {
  const characters = global.LK_RUNTIME_CHARACTER_PAWNS;
  const normal = characters.normalizeConfig({preset:'normal'});
  const civil = characters.normalizeConfig({preset:'civil'});
  const police = characters.normalizeConfig({preset:'POLICE'});
  assert.ok(civil.movement.runSpeed < normal.movement.runSpeed);
  assert.ok(police.movement.runSpeed > normal.movement.runSpeed);
  assert.equal(police.preset, 'police');
  assert.equal(characters.normalizePreset('unknown'), 'normal');
});

test('generic Character Pawn moves, jumps and changes preset', () => {
  const GAME = {systems:{}};
  const pawns = global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner = {position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,userData:{},traverse(){}};
  const pawn = global.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME, owner, {preset:'normal',playerId:1}, {});
  assert.ok(pawn);
  assert.equal(pawn.pawnType, 'character');
  assert.equal(pawns.getByPlayerId(1), pawn);
  pawn.start();
  pawn.setMoveInput({z:1,sprint:true});
  for(let i=0;i<30;i++) pawn.step(1/60);
  assert.ok(owner.position.z > .2);
  assert.equal(pawn.jump(), true);
  pawn.step(1/60);
  assert.ok(owner.position.y > 0);
  assert.equal(pawn.setPreset('civil'), 'civil');
  assert.equal(pawn.characterPreset, 'civil');
  pawn.dispose();
});

test('character movement ignores the Pawn own Logic Element collider', () => {
  const owner = {position:{x:0,y:0,z:0},rotation:{y:0}};
  const GAME = {world:{colliders:{box:[{x:0,y:.95,z:0,hx:.35,hy:.95,hz:.35,enabled:true,logicElementOwner:owner}],circle:[]}}};
  const movement = global.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME, {inputMode:'heading'});
  movement.step(owner, {x:0,z:0,sprint:false}, 1/60, 0);
  assert.equal(owner.position.x, 0);
  assert.equal(owner.position.z, 0);
});

test('Sketch Street template preserves the concept as editable native objects', () => {
  const scene = global.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE.buildScene({version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}});
  const logic = scene.added.filter(entry => entry.kind === 'logicElement');
  const names = scene.added.map(entry => entry.name);
  assert.equal(logic.length, 2);
  assert.ok(logic.some(entry => entry.graph.characterPawn && entry.graph.characterPawn.possessed));
  assert.ok(logic.some(entry => entry.graph.characterPawn && entry.graph.characterPawn.id === 'talkable-civil-npc'));
  assert.equal(names.filter(name => /^House \d Body$/.test(name)).length, 8);
  assert.ok(names.includes('Green Scooter Body'));
  assert.ok(names.includes('Vending Machine Body'));
  assert.ok(names.includes('Sea Backdrop'));
  assert.ok(scene.added.filter(entry => entry.kind === 'primitive').length >= 200);
  assert.deepEqual(scene.characterGround, {type:'slope-z',slopeStart:-2,crestZ:-30,slope:.26,baseY:0,minX:-3.45,maxX:3.45,minZ:-28.4,maxZ:16.5});
  assert.ok(global.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE.groundH(-20) > global.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE.groundH(0));
  assert.equal(scene.template.id, 'character-movement-playground');
  assert.equal(scene.template.sourceConcept, 'sketch-street_v2.html');
  assert.equal(scene.template.nativeEditable, true);
});

console.log('All character core tests passed.');
