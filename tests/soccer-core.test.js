'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-nodes-soccer.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-soccer.js');
require('../js/logic/logic-validator.js');
require('../js/logic/logic-runtime.js');
require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/soccer-locomotion.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/character-pawns.js');
require('../js/runtime/soccer-pawns.js');
require('../js/runtime/soccer-ball.js');
require('../js/runtime/penalty-flow.js');
require('../js/runtime/soccer-stadium.js');

const registry = global.LK_LOGIC_NODES_MVP.createRegistry();

function test(name, run){
  try {
    run();
    console.log('ok - ' + name);
  } catch(error){
    console.error('not ok - ' + name);
    throw error;
  }
}

test('soccer node pack registers through LK_LOGIC_NODE_PACKS', () => {
  ['soccer.setMoveInput', 'soccer.playAction', 'soccer.kickBall', 'soccer.registerGoal', 'penalty.start', 'penalty.getState', 'event.onGoalScored', 'event.onShootoutFinished']
    .forEach(type => assert.ok(registry.get(type), 'missing node ' + type));
});

test('soccer templates are registered and validate cleanly', () => {
  const ids = global.LK_LOGIC_TEMPLATES.list().map(t => t.id);
  assert.ok(ids.includes('logic-template-player-soccer'));
  assert.ok(ids.includes('logic-template-penalty-shootout'));
  ['logic-template-player-soccer', 'logic-template-penalty-shootout'].forEach(id => {
    const template = global.LK_LOGIC_TEMPLATES.get(id);
    const graph = global.LK_LOGIC_GRAPH.normalizeGraph(template.graph, template.name, 'element');
    const result = global.LK_LOGIC_VALIDATOR.validateGraph(graph, registry);
    assert.equal(result.ok, true, id + ' errors: ' + JSON.stringify(result.errors));
  });
});

test('player soccer template exposes role, animation slots and appearance bindings', () => {
  const template = global.LK_LOGIC_TEMPLATES.get('logic-template-player-soccer');
  const bindings = template.graph.variables.filter(v => v.exposed).map(v => v.binding);
  ['role', 'movement.runSpeed', 'movement.jumpHeight', 'movement.inputMode', 'locomotion.responsiveness', 'keeper.reach', 'animationLibrary', 'animations.shoot', 'animations.save', 'animations.diveLeft', 'animations.jump', 'appearance.shirtColor', 'appearance.hairColor', 'camera.mode', 'camera.view']
    .forEach(binding => assert.ok(bindings.includes(binding), 'missing binding ' + binding));
  assert.ok(template.graph.soccerPawn, 'graph.soccerPawn definition missing');
  assert.equal(template.graph.soccerPawn.playerId, 1);
});

test('soccer pawn config normalization: roles, defaults, goalkeeper set', () => {
  const soccer = global.LK_RUNTIME_SOCCER_PAWNS;
  assert.equal(soccer.normalizeRole('GOALKEEPER'), 'goalkeeper');
  assert.equal(soccer.normalizeRole('libero'), 'striker');
  const keeper = soccer.normalizeConfig({role:'goalkeeper', playerId:2});
  assert.equal(keeper.role, 'goalkeeper');
  assert.equal(keeper.playerId, 2);
  assert.ok(keeper.animations.diveLeft, 'goalkeeper needs a diveLeft clip slot');
  assert.ok(keeper.keeper.reach > 0);
  const striker = soccer.normalizeConfig({});
  assert.ok(striker.animations.shoot, 'striker needs a shoot clip slot');
  assert.ok(striker.movement.runSpeed > striker.movement.walkSpeed);
});

test('soccer pawn registers in the shared registry, moves and disposes', () => {
  const GAME = {systems:{}};
  const pawns = global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  assert.equal(GAME.pawns, pawns);
  const owner = {
    position:{x:1, y:0, z:2, set(x, y, z){ this.x = x; this.y = y; this.z = z; }},
    rotation:{y:0},
    visible:true,
    userData:{},
    traverse(){},
  };
  const pawn = global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME, owner, {role:'striker', playerId:1}, {});
  assert.ok(pawn, 'pawn created');
  assert.equal(pawn.pawnType, 'soccer');
  assert.equal(pawns.getByPlayerId(1), pawn);
  pawn.start();
  // No camera in the stub GAME: camera-relative input falls back to heading.
  pawn.setMoveInput({x:0, z:1, sprint:true});
  for(let i = 0; i < 60; i++) pawn.step(1 / 60);
  assert.ok(owner.position.z > 2.2, 'pawn moved forward, z=' + owner.position.z);
  assert.ok(pawn.state.speedKmh > 1);
  assert.equal(pawn.state.grounded, true);
  assert.equal(pawn.jump(), true, 'grounded pawn can jump');
  pawn.step(1 / 60);
  assert.ok(owner.position.y > 0, 'pawn left the ground, y=' + owner.position.y);
  assert.equal(pawn.jump(), false, 'no double jump while airborne');
  for(let i = 0; i < 120; i++) pawn.step(1 / 60);
  assert.equal(pawn.state.grounded, true, 'pawn landed');
  assert.ok(Math.abs(owner.position.y) < .001, 'pawn back on ground');
  assert.equal(pawn.applyBinding('movement.runSpeed', 8), true);
  assert.equal(pawn.config.movement.runSpeed, 8);
  assert.equal(pawn.applyBinding('role', 'goalkeeper'), true);
  assert.equal(pawn.config.role, 'goalkeeper');
  assert.equal(pawn.applyBinding('appearance.shirtColor', '#00ff00'), true);
  pawn.dispose();
  assert.equal(pawns.getByPlayerId(1), null);
});

test('penalty flow: alternating kicks, early decision and winner', () => {
  const flow = global.LK_RUNTIME_PENALTY_FLOW.create({systems:{}});
  flow.configure({kicksPerTeam:2, teamA:'Rossi', teamB:'Blu', autoAdvanceDelay:.2});
  flow.start();
  assert.equal(flow.state().phase, 'ready');
  assert.equal(flow.state().kickingTeam, 'A');
  flow.recordResult('goal');   // A 1-0
  flow.advance();
  assert.equal(flow.state().kickingTeam, 'B');
  flow.recordResult('saved');  // A 1-0 B miss
  flow.advance();
  flow.recordResult('goal');   // A 2-0
  flow.advance();
  // B can reach at most 1 < 2: mathematically decided.
  assert.equal(flow.state().finished, true);
  assert.equal(flow.state().winner, 'A');
  assert.equal(flow.state().winnerName, 'Rossi');
  assert.equal(flow.state().scoreA, 2);
  assert.equal(flow.state().scoreB, 0);
});

test('penalty flow: sudden death resolves on difference', () => {
  const flow = global.LK_RUNTIME_PENALTY_FLOW.create({systems:{}});
  flow.configure({kicksPerTeam:1, autoAdvanceDelay:.2});
  flow.start();
  flow.recordResult('goal'); flow.advance();   // A 1
  flow.recordResult('goal'); flow.advance();   // B 1 -> sudden death
  assert.equal(flow.state().finished, false);
  assert.equal(flow.state().suddenDeath, true);
  flow.recordResult('goal'); flow.advance();   // A 2
  flow.recordResult('miss'); flow.advance();   // B 1 -> decided
  assert.equal(flow.state().finished, true);
  assert.equal(flow.state().winner, 'A');
});

test('soccer ball goal registry uses regulation frame defaults', () => {
  const ball = global.LK_RUNTIME_SOCCER_BALL.create({systems:{}});
  const goalId = ball.registerGoal({x:0, z:52.5, heading:Math.PI, team:'A'});
  const goal = ball.goals().find(g => g.id === goalId);
  assert.equal(goal.width, 7.32);
  assert.equal(goal.height, 2.44);
  assert.equal(global.LK_RUNTIME_SOCCER_BALL.BALL_RADIUS, .11);
});

test('soccer stadium builder produces a regulation penalty level', () => {
  const stadium = global.LK_RUNTIME_SOCCER_STADIUM;
  const entries = stadium.buildEntries({x:0, z:0});
  assert.ok(entries.length > 100, 'stadium entries: ' + entries.length);
  const names = entries.map(e => e.name);
  ['Stadium - Pitch Grass', 'Stadium - Penalty Spot North', 'Stadium - Goal Crossbar South', 'Stadium - Players Tunnel Frame', 'Stadium - Corner Flag NE', 'Stadium - Floodlight 4']
    .forEach(name => assert.ok(names.includes(name), 'missing ' + name));
  assert.ok(names.some(n => n.indexOf('Stadium - Fans ') === 0), 'fans placeholder missing');
  const postWest = entries.find(e => e.name === 'Stadium - Goal Post West North');
  const postEast = entries.find(e => e.name === 'Stadium - Goal Post East North');
  const span = Math.abs(postEast.t.p[0] - postWest.t.p[0]);
  assert.ok(Math.abs(span - (7.32 + .12)) < .01, 'goal post span: ' + span);
  const anchors = stadium.gameplayAnchors({x:0, z:0});
  assert.equal(anchors.penaltySpotNorth.z, 52.5 - 11);
  assert.equal(anchors.goalNorth.heading, Math.PI);
});

console.log('All soccer core tests passed.');
