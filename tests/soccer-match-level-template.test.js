'use strict';

/* Builds the real 11 v 11 scene and checks it end to end:
   registry wiring, 22 editable Soccer Pawn Logic Elements, formation slots,
   tactical roles, team/match manager descriptors and the runtime director that
   feeds js/runtime/soccer-team-ai.js and js/runtime/soccer-match-flow.js. */

const assert = require('node:assert/strict');

global.window = global;

require('../js/engine/level-template-registry.js');
global.LK_LEVEL_TEMPLATES.list().forEach(template => global.LK_LEVEL_TEMPLATES.unregister(template.id));

require('../js/runtime/soccer-tactics.js');
require('../js/runtime/soccer-stadium.js');
require('../js/runtime/soccer-match-flow.js');
require('../js/runtime/soccer-team-ai.js');
require('../js/logic/logic-templates-soccer.js');

// The soccer Logic Element templates register through LK_LOGIC_TEMPLATES; in a
// headless run we provide the tiny registry surface the level template needs.
const SOCCER_TEMPLATES = global.LK_LOGIC_TEMPLATES_SOCCER.makeSoccerTemplates();
global.LK_LOGIC_TEMPLATES = {
  get(id){
    const found = SOCCER_TEMPLATES.find(template => template.id === id);
    return found ? {id:found.id, name:found.name, graph:JSON.parse(JSON.stringify(found.graph))} : null;
  },
};

const TEMPLATE = require('../js/runtime/soccer-match-level-template.js');
const MODEL = global.LK_RUNTIME_SOCCER_TACTICS;

function blank(){
  return {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}, logic:{}};
}
function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

const scene = TEMPLATE.buildScene(blank());
const logicElements = scene.added.filter(entry => entry.kind === 'logicElement');
const players = logicElements.filter(entry => entry.graph && entry.graph.soccerTeamPlayer);
const managers = logicElements.filter(entry => entry.graph && entry.graph.soccerTeamSetup);
const director = logicElements.find(entry => entry.graph && entry.graph.soccerMatchDirector);
const varOf = (entry, name) => (entry.graph.variables.find(item => item.name === name) || {}).value;

test('the 11 v 11 template registers itself in the level template registry', () => {
  const ids = global.LK_LEVEL_TEMPLATES.list().map(template => template.id);
  assert.ok(ids.includes('soccer-match-11v11'), 'registered ids: ' + ids.join(', '));
  const descriptor = global.LK_LEVEL_TEMPLATES.get('soccer-match-11v11');
  assert.equal(descriptor.category, 'Sports');
  assert.equal(descriptor.keepBuiltinPlayer, false, 'the match owns its own possessed Pawn');
  const built = global.LK_LEVEL_TEMPLATES.build('soccer-match-11v11', blank());
  assert.equal(built.template.id, 'soccer-match-11v11', 'the registry can build the scene');
});

test('the scene is ordinary editable data with stable unique ids', () => {
  assert.equal(scene.template.nativeEditable, true);
  assert.equal(new Set(scene.added.map(entry => entry.id)).size, scene.added.length, 'duplicate entry id');
  assert.ok(scene.added.filter(entry => entry.kind === 'primitive').length > 100, 'stadium primitives missing');
  assert.ok(scene.added.filter(entry => entry.kind === 'light').length >= 4, 'floodlights missing');
  assert.ok(scene.added.every(entry => !(entry.name === 'Ground' && entry.asset && entry.asset.source === 'Editor primitive')),
    'the generic ground plane must be replaced by the pitch');
  const groups = new Set(scene.added.map(entry => entry.templateGroup));
  ['01 Stadium', '02 Goals & Ball', '03 Match Director', '04 Home Team', '05 Away Team']
    .forEach(group => assert.ok(groups.has(group), 'missing numbered scene group ' + group));
});

test('exactly 22 players are placed, eleven per side, one goalkeeper each', () => {
  assert.equal(players.length, 22, 'placed players: ' + players.length);
  ['home', 'away'].forEach(team => {
    const squad = players.filter(entry => entry.graph.soccerTeamPlayer.team === team);
    assert.equal(squad.length, 11, team + ' fielded ' + squad.length);
    assert.equal(squad.filter(entry => entry.graph.soccerTeamPlayer.role === 'GK').length, 1, team + ' needs exactly one keeper');
    assert.equal(squad.filter(entry => entry.graph.soccerPawn.role === 'goalkeeper').length, 1, team + ' keeper Pawn role');
    assert.deepEqual(squad.map(entry => entry.graph.soccerTeamPlayer.slot).sort((a, b) => a - b),
      [0,1,2,3,4,5,6,7,8,9,10], team + ' must fill every formation slot exactly once');
  });
});

test('the authored formation is what actually gets placed on the pitch', () => {
  ['home', 'away'].forEach(team => {
    const setup = managers.find(entry => entry.graph.soccerTeamSetup.team === team).graph.soccerTeamSetup;
    const slots = MODEL.kickoffSlots(setup.formation);
    const squad = players.filter(entry => entry.graph.soccerTeamPlayer.team === team)
      .sort((a, b) => a.graph.soccerTeamPlayer.slot - b.graph.soccerTeamPlayer.slot);
    assert.deepEqual(squad.map(entry => entry.graph.soccerTeamPlayer.role), slots.map(slot => slot.role),
      team + ' roles must match formation ' + setup.formation);
    const expected = {x:0, y:0, z:0, heading:0};
    squad.forEach((entry, index) => {
      MODEL.toWorld(slots[index].spread, slots[index].depth, team, {length:105, width:68}, expected);
      assert.ok(Math.abs(entry.t.p[0] - expected.x) < 1e-6, team + ' slot ' + index + ' x');
      assert.ok(Math.abs(entry.t.p[2] - expected.z) < 1e-6, team + ' slot ' + index + ' z');
    });
  });
  // Home defends south and attacks north; away is the exact mirror.
  const homeKeeper = players.find(entry => entry.graph.soccerTeamPlayer.team === 'home' && entry.graph.soccerTeamPlayer.role === 'GK');
  const awayKeeper = players.find(entry => entry.graph.soccerTeamPlayer.team === 'away' && entry.graph.soccerTeamPlayer.role === 'GK');
  assert.ok(homeKeeper.t.p[2] < 0, 'home keeper defends the south goal');
  assert.ok(awayKeeper.t.p[2] > 0, 'away keeper defends the north goal');
  assert.ok(Math.abs(homeKeeper.t.p[2] + awayKeeper.t.p[2]) < 1e-9, 'the keepers are mirrored');
  players.forEach(entry => {
    assert.ok(Math.abs(entry.t.p[0]) <= 34, entry.name + ' spawns outside the touchlines');
    assert.ok(Math.abs(entry.t.p[2]) <= 52.5, entry.name + ' spawns outside the goal lines');
  });
});

test('every player is individually editable: role, attributes, kit, spawn', () => {
  players.forEach(entry => {
    const bindings = entry.graph.variables.filter(item => item.exposed).map(item => item.binding);
    ['role', 'appearance.shirtColor', 'spawn.x', 'movement.runSpeed', 'camera.distance',
     'soccerTeamPlayer.team', 'soccerTeamPlayer.slot', 'soccerTeamPlayer.role', 'soccerTeamPlayer.number']
      .forEach(binding => assert.ok(bindings.includes(binding), entry.name + ' missing exposed binding ' + binding));
    MODEL.ATTRIBUTE_KEYS.forEach(key => {
      assert.ok(bindings.includes('soccerTeamPlayer.attributes.' + key), entry.name + ' missing attribute ' + key);
      const value = entry.graph.soccerTeamPlayer.attributes[key];
      assert.ok(value >= 0 && value <= 1, entry.name + ' attribute ' + key + ' out of range');
    });
    assert.equal(varOf(entry, 'SpawnX'), entry.t.p[0], entry.name + ' spawn variable must track the placed transform');
    assert.equal(varOf(entry, 'SpawnZ'), entry.t.p[2]);
    assert.equal(varOf(entry, 'FieldOpponentAI'), false, 'the team AI owns movement, not the legacy chase AI');
    assert.equal(entry.graph.soccerPawn.fieldAI.enabled, false);
  });
  // Faster roles really do get a faster Pawn: attributes reach the runtime.
  const striker = players.find(entry => entry.graph.soccerTeamPlayer.role === 'ST' || entry.graph.soccerTeamPlayer.role === 'CF');
  const keeper = players.find(entry => entry.graph.soccerTeamPlayer.role === 'GK');
  assert.ok(striker.graph.soccerPawn.movement.runSpeed > keeper.graph.soccerPawn.movement.runSpeed,
    'role pace must drive Pawn run speed');
});

test('exactly one player is possessed, and only on the human team', () => {
  const controlled = players.filter(entry => entry.graph.soccerPawn.possessed === true);
  assert.equal(controlled.length, 1, 'possessed players: ' + controlled.length);
  assert.equal(controlled[0].graph.soccerTeamPlayer.team, 'home');
  assert.equal(controlled[0].graph.soccerPawn.playerId, 1);
  assert.equal(varOf(controlled[0], 'ControllerPlayerId'), 1);
  players.filter(entry => entry !== controlled[0]).forEach(entry => {
    assert.equal(varOf(entry, 'ControllerPlayerId'), -1, entry.name + ' must not auto-possess Player 1');
    assert.equal(entry.graph.soccerPawn.playerId, null);
  });
});

test('team managers expose formation, tactics, kit and difficulty', () => {
  assert.equal(managers.length, 2);
  ['home', 'away'].forEach(team => {
    const entry = managers.find(item => item.graph.soccerTeamSetup.team === team);
    assert.ok(entry, 'missing team manager for ' + team);
    const bindings = entry.graph.variables.map(item => item.binding);
    ['soccerTeamSetup.formation', 'soccerTeamSetup.tactics.preset', 'soccerTeamSetup.tactics.lineHeight',
     'soccerTeamSetup.tactics.pressing', 'soccerTeamSetup.tactics.offsideTrap', 'soccerTeamSetup.difficulty',
     'soccerTeamSetup.kit.shirt', 'soccerTeamSetup.controlledSlot']
      .forEach(binding => assert.ok(bindings.includes(binding), team + ' missing ' + binding));
    const formationOptions = entry.graph.variables.find(item => item.name === 'Formation').options.map(option => option.value);
    assert.deepEqual(formationOptions, MODEL.FORMATION_IDS, 'the editor must offer every shipped formation');
  });
});

test('the match director exposes the whole rule set and the AI budget', () => {
  assert.ok(director, 'match director missing');
  const bindings = director.graph.variables.map(item => item.binding);
  ['soccerMatchDirector.halves', 'soccerMatchDirector.halfMinutes', 'soccerMatchDirector.stoppageMinutes',
   'soccerMatchDirector.rules.offside', 'soccerMatchDirector.rules.fouls', 'soccerMatchDirector.rules.cards',
   'soccerMatchDirector.substitutions', 'soccerMatchDirector.penaltiesOnDraw',
   'soccerMatchDirector.ai.tickHz', 'soccerMatchDirector.ai.playersPerTick', 'soccerMatchDirector.ai.lod']
    .forEach(binding => assert.ok(bindings.includes(binding), 'missing ' + binding));
});

test('goal sensors and the match ball are explicit, linked Logic Elements', () => {
  const goals = logicElements.filter(entry => entry.asset.key === 'logic:template:logic-template-soccer-goal');
  assert.equal(goals.length, 2);
  const ids = goals.map(entry => (entry.graph.variables.find(item => item.name === 'GoalId') || {}).value);
  assert.deepEqual(ids.sort(), ['match-goal-north', 'match-goal-south']);
  const ball = logicElements.find(entry => entry.asset.key === 'logic:template:logic-template-soccer-ball');
  assert.ok(ball, 'match ball missing');
  assert.equal((ball.graph.variables.find(item => item.name === 'BallId') || {}).value, 'match-ball');
  assert.equal((ball.graph.variables.find(item => item.name === 'BallMode') || {}).value, 'match');
});

test('edited exposed variables win over the authored descriptor at Play time', () => {
  const managerEntry = managers.find(item => item.graph.soccerTeamSetup.team === 'home');
  const graph = JSON.parse(JSON.stringify(managerEntry.graph));
  graph.variables.find(item => item.name === 'Formation').value = '3-5-2';
  graph.variables.find(item => item.name === 'Pressing').value = .91;
  TEMPLATE.overlayBindings(graph, 'soccerTeamSetup', graph.soccerTeamSetup);
  assert.equal(graph.soccerTeamSetup.formation, '3-5-2', 'an editor change must reach the runtime descriptor');
  assert.ok(Math.abs(graph.soccerTeamSetup.tactics.pressing - .91) < 1e-9);
});

test('the runtime director configures the team AI and the match flow', () => {
  const events = [];
  const GAME = {
    state:{started:true},
    hooks:{frame:[]},
    systems:{logic:{triggerRuntimeEvent(type, payload){ events.push({type, payload}); }}},
    pawns:{list:() => []},
    world:{registry:logicElements.map(entry => ({userData:{logicGraph:JSON.parse(JSON.stringify(entry.graph))}}))},
  };
  const runtime = TEMPLATE.install(GAME);
  assert.equal(GAME.hooks.frame.length, 1, 'the director installs exactly one frame hook');
  assert.equal(runtime.update(), true, 'the director applies once the session has started');
  assert.equal(runtime.applied(), true);
  assert.equal(runtime.update(), false, 'applying is idempotent');

  const collected = runtime.descriptors();
  assert.equal(collected.players, 22, 'the director must see all 22 team-AI descriptors');
  assert.ok(collected.soccerTeamSetup.home && collected.soccerTeamSetup.away);

  const ai = GAME.systems.soccerTeamAI.get();
  assert.equal(ai.teams.home.formation, '4-3-3');
  assert.equal(ai.teams.away.formation, '4-4-2');
  assert.equal(ai.teams.home.controllerPlayerId, 1, 'the home side is the playable one');
  assert.equal(ai.teams.away.controllerPlayerId, null, 'the away side is fully AI');
  assert.equal(ai.playersPerTick, 6, 'the AI budget is split across ticks, not run for all 22 at once');
  assert.ok(ai.tickHz > 0 && ai.tickHz < 60, 'decisions run on a fixed tick');

  const match = GAME.systems.soccerMatch;
  assert.equal(match.get().halves, 2);
  assert.equal(match.get().rules.offside, true);
  assert.equal(match.phase(), 'kickoff', 'the match starts at kickoff');
  assert.ok(events.some(event => event.type === 'OnMatchStarted'), 'match start must be observable from a graph');
});

test('the team AI enrolls the placed players and drives them without a human', () => {
  const model = MODEL;
  const pawns = [];
  players.forEach(entry => {
    const graph = JSON.parse(JSON.stringify(entry.graph));
    const owner = {position:{x:entry.t.p[0], y:0, z:entry.t.p[2]}, rotation:{y:entry.t.r[1]}, userData:{logicGraph:graph}};
    pawns.push({
      id:entry.id, pawnType:'soccer', disposed:false, possessed:false, playerId:null, owner,
      config:{movement:{turnRate:10}}, state:{}, control:null,
      setMoveInput(input){ this.control = Object.assign({x:0, z:0, sprint:false, jump:false, action:false}, input); return this.control; },
      possess(){ this.possessed = true; return true; }, unpossess(){ this.possessed = false; return true; },
    });
  });
  const GAME = {
    state:{started:true}, hooks:{frame:[]}, systems:{},
    pawns:{list:() => pawns},
    world:{registry:[]},
  };
  const ai = global.LK_RUNTIME_SOCCER_TEAM_AI.install(GAME);
  ai.configure({
    pitch:{length:105, width:68},
    teams:{home:{formation:'4-3-3', tactics:{preset:'possession'}}, away:{formation:'4-4-2', tactics:{preset:'balanced'}}},
  });
  assert.equal(ai.rescan(), 22, 'every placed player must be enrolled');

  // A ball just inside the home half: the away side presses, the home side keeps shape.
  GAME.systems.soccerBall = {
    list:() => ['match-ball'],
    state:() => ({id:'match-ball', position:{x:4, y:.11, z:-6}, velocity:{x:0, y:0, z:0}, inFlight:false, resolved:false}),
  };
  for(let frame = 0; frame < 90; frame++) ai.update(1 / 60);

  const roster = ai.roster();
  assert.equal(roster.length, 22);
  assert.ok(roster.every(record => model.ROLE_IDS.includes(record.role)), 'every record carries a known tactical role');
  assert.ok(roster.some(record => record.duty === 'firstPress'), 'somebody must close the ball down');
  assert.ok(roster.every(record => record.duty === 'keeper' || record.role !== 'GK'), 'keepers keep their duty');
  assert.ok(pawns.every(pawn => pawn.control), 'the AI must author a movement command for every player');
  assert.ok(pawns.some(pawn => Math.abs(pawn.control.x) + Math.abs(pawn.control.z) > .05), 'players must actually be moving');

  const home = ai.defensiveLine('home'), away = ai.defensiveLine('away');
  assert.ok(home > 0 && home < 1 && away > 0 && away < 1, 'both defensive lines are live');
  assert.ok(ai.offsideLine('home') <= 1 && ai.offsideLine('away') <= 1, 'both offside lines are live');

  const snapshot = ai.snapshot();
  assert.equal(snapshot.players.length, 22, 'the HUD snapshot covers both teams');
  assert.ok(snapshot.ball && snapshot.ball.x === 4, 'the snapshot carries the ball for the radar');
  const before = snapshot.players[0];
  assert.equal(ai.snapshot().players[0], before, 'the snapshot buffer is pooled, not reallocated per poll');
});

console.log('soccer-match-level-template.test.js: all assertions passed');
