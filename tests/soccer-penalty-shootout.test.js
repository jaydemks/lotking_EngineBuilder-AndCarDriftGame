'use strict';

/* The upgraded standalone shootout: kick sequence (aim -> run-up -> feint ->
   strike), goalkeeper read model, pressure, presentation cameras, and the
   v1 series rules that must keep behaving exactly as before. */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/runtime/penalty-flow.js');
const PENALTY = global.LK_RUNTIME_PENALTY_FLOW;

function make(options){
  const flow = PENALTY.create({systems:{}});
  flow.configure(Object.assign({autoAdvanceDelay:.2}, options || {}));
  flow.start();
  return flow;
}
function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
/** update() clamps a single step to 0.25 s on purpose (stalled-frame guard),
 *  so a test that wants to reach 0.6 s of run-up has to tick like a frame loop. */
function tick(flow, seconds){
  const step = 1 / 240;
  let plan = null;
  for(let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) plan = flow.update(step) || plan;
  return plan;
}

test('v1 series rules are untouched: alternating kicks, early decision, winner', () => {
  const flow = make({kicksPerTeam:2, teamA:'Rossi', teamB:'Blu'});
  assert.equal(flow.state().phase, 'ready');
  assert.equal(flow.state().kickingTeam, 'A');
  flow.recordResult('goal'); flow.advance();
  assert.equal(flow.state().kickingTeam, 'B');
  flow.recordResult('saved'); flow.advance();
  flow.recordResult('goal'); flow.advance();
  const snapshot = flow.state();
  assert.equal(snapshot.finished, true);
  assert.equal(snapshot.winner, 'A');
  assert.equal(snapshot.winnerName, 'Rossi');
  assert.deepEqual([snapshot.scoreA, snapshot.scoreB], [2, 0]);
});

test('sudden death still resolves on the first difference past the series', () => {
  const flow = make({kicksPerTeam:1});
  flow.recordResult('goal'); flow.advance();
  flow.recordResult('goal'); flow.advance();
  assert.equal(flow.state().suddenDeath, true);
  assert.equal(flow.state().finished, false);
  flow.recordResult('goal'); flow.advance();
  flow.recordResult('miss'); flow.advance();
  assert.equal(flow.state().winner, 'A');
});

test('an unknown goalkeeper skill throws instead of silently picking one', () => {
  const flow = PENALTY.create({systems:{}});
  assert.throws(() => flow.configure({keeperSkill:'octopus'}), /unknown goalkeeper skill/);
  PENALTY.KEEPER_SKILL_IDS.forEach(id => assert.doesNotThrow(() => flow.configure({keeperSkill:id})));
});

test('aiming is four independent decisions: corner, height, power and curve', () => {
  const flow = make({});
  const kick = flow.aim({aimX:.8, aimY:-.4, power:.9, curve:-.6});
  assert.equal(flow.state().phase, 'aim', 'aiming leaves the ready pose');
  assert.ok(Math.abs(kick.aimX - .8) < 1e-9);
  assert.ok(Math.abs(kick.aimY + .4) < 1e-9);
  assert.ok(Math.abs(kick.power - .9) < 1e-9);
  assert.ok(Math.abs(kick.curve + .6) < 1e-9);
  // Out-of-range author input clamps rather than corrupting the plan.
  assert.equal(flow.aim({aimX:9, curve:-9}).aimX, 1);
  assert.equal(flow.state().kick.curve, -1);
});

test('the run-up is a timing window: sweet strikes keep the aim, rushed ones rise', () => {
  const sweet = make({pressureEnabled:false});
  sweet.aim({aimX:.6, aimY:-.3, power:1});
  sweet.beginRunUp(1);
  tick(sweet, .75);                                       // 0.75 of the run-up
  assert.equal(sweet.state().kick.runUpActive, true, 'the run-up is still live');
  const good = sweet.strike();
  assert.equal(good.timingQuality, 1, 'striking inside the window is perfect');
  assert.ok(Math.abs(good.aimX - .6) < 1e-9, 'a perfect strike keeps the authored corner');
  assert.ok(Math.abs(good.aimY + .3) < 1e-9, 'a perfect strike keeps the authored height');
  assert.equal(sweet.state().phase, 'shot');

  const rushed = make({pressureEnabled:false});
  rushed.aim({aimX:.6, aimY:-.3, power:1});
  rushed.beginRunUp(1);
  tick(rushed, .05);                                      // way too early
  const bad = rushed.strike();
  assert.ok(bad.timingQuality < .2, 'striking early is punished, got ' + bad.timingQuality);
  assert.ok(bad.aimY > -.3, 'a rushed penalty rises over the authored height');
  assert.ok(bad.power < good.power, 'a mistimed strike loses power');
});

test('overrunning the run-up strikes automatically instead of stalling', () => {
  const flow = make({});
  flow.beginRunUp(.5);
  let plan = null;
  for(let i = 0; i < 60 && !plan; i++) plan = flow.update(1 / 60);
  assert.ok(plan, 'the run-up must resolve itself');
  assert.equal(flow.state().phase, 'shot');
});

test('feints are limited, deadlined, and cost accuracy', () => {
  const flow = make({pressureEnabled:false});
  flow.beginRunUp(1);
  tick(flow, .1);
  assert.equal(flow.feint(), true);
  assert.equal(flow.feint(), true);
  assert.equal(flow.feint(), false, 'a kicker cannot stutter forever');
  assert.equal(flow.state().kick.feints, PENALTY.RUN_UP.maxFeints);

  const late = make({pressureEnabled:false});
  late.beginRunUp(1);
  tick(late, .95);
  assert.equal(late.feint(), false, 'past the deadline a feint sells nothing');

  // Two feints shrink the sweet window, so the same timing is no longer perfect.
  const clean = make({pressureEnabled:false});
  clean.beginRunUp(1); tick(clean, .63);
  const cleanPlan = clean.strike();
  const stuttered = make({pressureEnabled:false});
  stuttered.beginRunUp(1); tick(stuttered, .1);
  stuttered.feint(); stuttered.feint();
  tick(stuttered, .53);
  const stutterPlan = stuttered.strike();
  assert.ok(stutterPlan.timingQuality < cleanPlan.timingQuality,
    'a stuttered run-up must be harder to time: ' + stutterPlan.timingQuality + ' vs ' + cleanPlan.timingQuality);
});

test('pressure rises as a shootout becomes decisive and degrades the kick', () => {
  const calm = make({kicksPerTeam:5});
  const opening = calm.pressure();
  // Drive the same series to a decisive, sudden-death kick.
  const tense = make({kicksPerTeam:1});
  tense.recordResult('goal'); tense.advance();
  tense.recordResult('goal'); tense.advance();
  assert.equal(tense.state().suddenDeath, true);
  assert.ok(tense.pressure() > opening, 'sudden death must weigh more than kick one: ' + tense.pressure() + ' vs ' + opening);
  assert.ok(tense.pressure() <= 1 && opening >= 0);

  // Same timing, more pressure, worse strike.
  const relaxed = make({kicksPerTeam:5, pressureEnabled:false});
  relaxed.beginRunUp(1); tick(relaxed, .60);
  const relaxedPlan = relaxed.strike();
  tense.beginRunUp(1); tick(tense, .60);
  const tensePlan = tense.strike();
  assert.ok(tensePlan.pressure > 0 && relaxedPlan.pressure === 0);
  assert.ok(tensePlan.timingQuality <= relaxedPlan.timingQuality, 'pressure shrinks the sweet window');
});

test('the goalkeeper reads or guesses, and a bought feint makes it commit early', () => {
  const flow = make({keeperSkill:'worldClass'});
  const plan = flow.keeperPlan();
  assert.ok(plan, 'a plan must exist before the run-up, like a real penalty');
  assert.equal(plan.skill, 'worldClass');
  assert.ok(plan.commitProgress > 0 && plan.commitProgress <= 1);
  assert.equal(flow.keeperCommitment(), null, 'the keeper does not move while the kicker is still standing');

  flow.aim({aimX:.75});
  flow.beginRunUp(1);
  tick(flow, .1);
  const before = flow.keeperPlan().commitProgress;
  flow.feint();
  assert.ok(flow.keeperPlan().commitProgress <= before, 'a feint can only pull the commitment earlier');

  // By the strike the keeper must have chosen a side.
  tick(flow, .88);
  const call = flow.keeperCommitment() || {side:0, reason:'already-committed'};
  assert.ok(['guess', 'read', 'early', 'already-committed'].includes(call.reason));
});

test('a reading keeper follows the real corner, a guessing one does not have to', () => {
  // worldClass has the highest readAccuracy: when it reads, it reads well.
  let reads = 0, correct = 0;
  for(let round = 0; round < 12; round++){
    const flow = make({keeperSkill:'worldClass'});
    for(let i = 0; i < round; i++){ flow.recordResult('goal'); flow.advance(); }
    if(flow.state().finished) break;
    flow.aim({aimX:.85});
    flow.strike();
    const call = flow.keeperCommitment();
    if(!call || call.reason !== 'read') continue;
    reads++;
    if(call.side === 1) correct++;
  }
  assert.ok(reads > 0, 'a world class keeper must sometimes read rather than guess');
  assert.ok(correct / reads >= .5, 'reading the ball must beat a coin flip: ' + correct + '/' + reads);
});

test('presentation cameras are exposed per phase and can be switched off', () => {
  // A long auto-advance keeps the reaction camera on screen for the assertion
  // below instead of being replaced by the next kicker's walk-up.
  const flow = make({autoAdvanceDelay:5});
  assert.equal(flow.state().camera.preset, 'ready');
  assert.ok(flow.state().camera.hold > 0, 'the walk-up holds long enough to be a presentation');
  flow.beginRunUp(1);
  assert.equal(flow.state().camera.preset, 'runUp');
  flow.strike();
  assert.equal(flow.state().camera.preset, 'shot');
  flow.recordResult('goal');
  assert.equal(flow.state().camera.preset, 'resolved');
  const remaining = flow.state().camera.remaining;
  tick(flow, .5);
  assert.ok(flow.state().camera.remaining < remaining, 'the camera hold runs down on the frame clock');

  const plain = make({presentationCameras:false});
  assert.equal(plain.state().camera, null, 'presentation can be switched off entirely');
});

test('the frame clock advances the series without relying on setTimeout', () => {
  const flow = make({kicksPerTeam:5, autoAdvanceDelay:.5});
  flow.recordResult('goal');
  assert.equal(flow.state().phase, 'resolved');
  for(let i = 0; i < 40; i++) flow.update(1 / 60);
  assert.equal(flow.state().phase, 'ready', 'the next kicker steps up on the tick clock');
  assert.equal(flow.state().kickingTeam, 'B');
});

test('install adds one frame hook and stays idempotent', () => {
  const GAME = {systems:{}, hooks:{frame:[]}};
  const api = PENALTY.install(GAME);
  assert.equal(GAME.systems.penaltyFlow, api);
  assert.equal(GAME.hooks.frame.length, 1);
  assert.equal(PENALTY.install(GAME), api);
  assert.equal(GAME.hooks.frame.length, 1);
});

test('the Soccer Pawn keeper executes the shootout director decision', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/runtime/soccer-pawns.js'), 'utf8');
  assert.ok(source.includes('commitPenaltyDive'), 'the keeper must be able to commit before the ball is readable');
  assert.ok(source.includes('keeperCommitment'), 'the commitment has to come from the shootout director');
  const flow = fs.readFileSync(path.join(__dirname, '..', 'js/runtime/penalty-flow.js'), 'utf8');
  assert.ok(!flow.includes('LK_RUNTIME_SOCCER_MATCH'),
    'the standalone penalty mode must stay usable without a match');
});

console.log('soccer-penalty-shootout.test.js: all assertions passed');
