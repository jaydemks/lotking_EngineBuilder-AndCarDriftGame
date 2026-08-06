'use strict';

/* The positional model every soccer system reads: formations, roles, tactical
   presets, the phase-driven team shape, the defensive line, offside, support
   spots and passing lanes. Pure math, so it is checked exhaustively here rather
   than inferred from gameplay. */

const assert = require('node:assert/strict');

global.window = global;
require('../js/runtime/soccer-tactics.js');
const T = global.LK_RUNTIME_SOCCER_TACTICS;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
const PITCH = {length:105, width:68};

test('every shipped formation fields a legal eleven', () => {
  assert.ok(T.FORMATION_IDS.length >= 5, 'formations: ' + T.FORMATION_IDS.length);
  T.FORMATION_IDS.forEach(id => {
    const slots = T.formationSlots(id);
    assert.equal(slots.length, 11, id + ' must field eleven');
    assert.equal(slots.filter(slot => slot.role === 'GK').length, 1, id + ' needs exactly one keeper');
    assert.equal(slots[0].role, 'GK', id + ' slot 0 is always the keeper');
    // The declared line counts must match the outfield roles actually placed.
    const declared = T.FORMATIONS[id].lines.reduce((sum, count) => sum + count, 0);
    assert.equal(declared, 10, id + ' declares ' + declared + ' outfield players');
    slots.forEach(slot => {
      assert.ok(T.ROLE_IDS.includes(slot.role), id + ' uses unknown role ' + slot.role);
      assert.ok(slot.spread >= -1 && slot.spread <= 1, id + ' spread out of range');
      assert.ok(slot.depth >= 0 && slot.depth <= 1, id + ' depth out of range');
      assert.equal(slot.line, T.roleLine(slot.role));
    });
  });
});

test('kickoff shapes compress into the team own half', () => {
  T.FORMATION_IDS.forEach(id => {
    T.kickoffSlots(id).forEach(slot => {
      assert.ok(slot.depth <= .5, id + ' must line up inside its own half, got ' + slot.depth);
    });
  });
});

test('unknown names throw instead of silently falling back', () => {
  assert.throws(() => T.role('SWEEPER'), /unknown role/);
  assert.throws(() => T.formation('4-4-3'), /unknown formation/);
  assert.throws(() => T.tactic('tiki-taka'), /unknown tactic/);
  assert.throws(() => T.phase('resting'), /unknown phase/);
  assert.throws(() => T.side('neutral'), /unknown side/);
  // The guarded lookups are how author input is accepted without a silent default.
  assert.equal(T.hasFormation('4-4-2'), true);
  assert.equal(T.hasFormation('4-4-3'), false);
  assert.equal(T.hasTactic('gegenpress'), true);
});

test('every role carries the full attribute set inside 0..1', () => {
  T.ROLE_IDS.forEach(id => {
    const role = T.ROLES[id];
    assert.ok(T.ROLE_LINES.includes(role.line), id + ' has unknown line ' + role.line);
    assert.ok(['striker','winger','midfielder','defender','goalkeeper'].includes(role.pawnRole),
      id + ' must map onto a Soccer Pawn role, got ' + role.pawnRole);
    T.ATTRIBUTE_KEYS.forEach(key => {
      assert.equal(typeof role[key], 'number', id + ' missing attribute ' + key);
      assert.ok(role[key] >= 0 && role[key] <= 1, id + '.' + key + ' out of range');
    });
  });
  assert.equal(T.ROLES.GK.pawnRole, 'goalkeeper');
  assert.ok(T.ROLES.ST.shooting > T.ROLES.CB.shooting, 'a striker must shoot better than a centre back');
  assert.ok(T.ROLES.CB.tackling > T.ROLES.ST.tackling, 'a centre back must tackle better than a striker');
});

test('the pitch frame mirrors the two teams exactly', () => {
  const home = T.toWorld(.5, .8, 'home', PITCH);
  const away = T.toWorld(.5, .8, 'away', PITCH);
  assert.ok(Math.abs(home.x + away.x) < 1e-9, 'mirrored spread');
  assert.ok(Math.abs(home.z + away.z) < 1e-9, 'mirrored depth');
  assert.equal(home.heading, 0);
  assert.equal(away.heading, Math.PI);
  // Round trip: world -> normalised -> world.
  const back = T.toNormalized(home.x, home.z, 'home', PITCH);
  assert.ok(Math.abs(back.spread - .5) < 1e-9);
  assert.ok(Math.abs(back.depth - .8) < 1e-9);
  // Home defends south, away defends north.
  assert.ok(T.toWorld(0, 0, 'home', PITCH).z < 0);
  assert.ok(T.toWorld(0, 0, 'away', PITCH).z > 0);
});

test('phase classification separates possession from the two transitions', () => {
  assert.equal(T.phaseFor('home', 'home', 'home'), 'possession');
  assert.equal(T.phaseFor('home', 'home', 'away'), 'transitionAttack');
  assert.equal(T.phaseFor('home', 'away', 'home'), 'transitionDefence');
  assert.equal(T.phaseFor('home', 'away', 'away'), 'outOfPossession');
  assert.equal(T.phaseFor('home', null, null), 'outOfPossession');
});

test('the team shape pushes up in possession and drops off without the ball', () => {
  const slot = T.formationSlots('4-4-2')[7];   // a central midfielder
  const dials = T.normalizeTactics({preset:'balanced'});
  const attacking = T.shapeTarget(slot, {tactics:dials, phase:'possession', ball:{spread:0, depth:.7}});
  const defending = T.shapeTarget(slot, {tactics:dials, phase:'outOfPossession', ball:{spread:0, depth:.3}});
  assert.ok(attacking.depth > defending.depth, 'the block must move with the phase');

  // Mentality moves the whole block; the keeper never leaves its box.
  const bold = T.shapeTarget(slot, {tactics:T.normalizeTactics({preset:'allOutAttack'}), phase:'possession', ball:{spread:0, depth:.7}});
  const timid = T.shapeTarget(slot, {tactics:T.normalizeTactics({preset:'parkTheBus'}), phase:'possession', ball:{spread:0, depth:.7}});
  assert.ok(bold.depth > timid.depth, 'mentality must reshape the block');

  const keeperSlot = T.formationSlots('4-4-2')[0];
  T.TACTIC_IDS.forEach(id => {
    const target = T.shapeTarget(keeperSlot, {tactics:T.normalizeTactics({preset:id}), phase:'possession', ball:{spread:.9, depth:.95}});
    assert.ok(target.depth <= T.SHAPE.keeperMaxDepth, id + ' let the keeper leave its area: ' + target.depth);
    assert.ok(Math.abs(target.spread) <= .3, id + ' let the keeper take the touchline');
  });

  // The block leans toward the ball's side of the pitch.
  const wide = T.shapeTarget(slot, {tactics:dials, phase:'outOfPossession', ball:{spread:.9, depth:.4}});
  const central = T.shapeTarget(slot, {tactics:dials, phase:'outOfPossession', ball:{spread:0, depth:.4}});
  assert.ok(wide.spread > central.spread, 'the shape must slide toward the ball');
});

test('every shape target stays on the pitch, for every formation and phase', () => {
  T.FORMATION_IDS.forEach(formationId => {
    T.TACTIC_IDS.forEach(tacticId => {
      T.PHASES.forEach(phaseId => {
        const dials = T.normalizeTactics({preset:tacticId});
        T.formationSlots(formationId).forEach(slot => {
          const target = T.shapeTarget(slot, {tactics:dials, phase:phaseId, ball:{spread:1, depth:1}});
          assert.ok(target.depth >= 0 && target.depth <= 1, formationId + '/' + tacticId + '/' + phaseId + ' depth ' + target.depth);
          assert.ok(target.spread >= -1 && target.spread <= 1, formationId + '/' + tacticId + '/' + phaseId + ' spread ' + target.spread);
        });
      });
    });
  });
});

test('the defensive line reacts to the dial, the ball and the offside trap', () => {
  const high = T.defensiveLineDepth({lineHeight:.9, ballDepth:.5});
  const low = T.defensiveLineDepth({lineHeight:.1, ballDepth:.5});
  assert.ok(high > low, 'the line-height dial must move the line');
  assert.ok(low >= T.LINE.minDepth && high <= T.LINE.maxDepth, 'the line stays inside playable bounds');

  const pinned = T.defensiveLineDepth({lineHeight:.6, ballDepth:.1});
  const pushing = T.defensiveLineDepth({lineHeight:.6, ballDepth:.9});
  assert.ok(pushing > pinned, 'a ball deep in our half must drag the line back');

  const resting = T.defensiveLineDepth({lineHeight:.6, ballDepth:.5});
  const trap = T.defensiveLineDepth({lineHeight:.6, ballDepth:.5, trap:true, urgency:1});
  assert.ok(trap > resting, 'the offside trap steps the line up');
});

test('offside uses the second-last defender and can never be behind the ball', () => {
  // Defending frame: 0 is their own goal line. Keeper .04, then a back four.
  const line = T.offsideDepth([.04, .30, .32, .34, .36], 0);
  assert.ok(Math.abs(line - (1 - .30)) < 1e-9, 'the second smallest depth is the line, got ' + line);
  assert.equal(T.isOffside(line + .01, line), true);
  assert.equal(T.isOffside(line - .01, line), false);
  // The ball itself always plays an attacker onside.
  assert.equal(T.offsideDepth([.04, .30], .95), .95);
  // Fewer than two defenders means nobody can be caught offside.
  assert.equal(T.offsideDepth([.3], 0), 1);
  assert.equal(T.offsideDepth(null, 0), 1);
});

test('support spots prefer open, forward, pass-length positions', () => {
  const dials = T.normalizeTactics({preset:'possession'});
  const carrier = {spread:0, depth:.5};
  const good = {spread:.2, depth:.65};
  const crowded = [{spread:.2, depth:.65}, {spread:.22, depth:.66}];
  assert.ok(T.supportSpotScore(good, carrier, [], dials) > T.supportSpotScore(good, carrier, crowded, dials),
    'a marked spot must score lower than a free one');
  const tooClose = {spread:0, depth:.51};
  assert.ok(T.supportSpotScore(good, carrier, [], dials) > T.supportSpotScore(tooClose, carrier, [], dials),
    'standing on the carrier is not support');
  const backwards = {spread:.2, depth:.35};
  assert.ok(T.supportSpotScore(good, carrier, [], dials) > T.supportSpotScore(backwards, carrier, [], dials),
    'a forward option must outrank a backward one');
  T.FORMATION_IDS.forEach(id => T.formationSlots(id).forEach(slot => {
    const score = T.supportSpotScore({spread:slot.spread, depth:slot.depth}, carrier, [], dials);
    assert.ok(score >= 0 && score <= 1, 'support score out of range: ' + score);
  }));
});

test('a passing lane is blocked by an opponent standing in it', () => {
  const carrier = {spread:0, depth:.4}, receiver = {spread:0, depth:.7};
  assert.equal(T.passingLaneOpen(carrier, receiver, []), true);
  assert.equal(T.passingLaneOpen(carrier, receiver, [{spread:0, depth:.55}]), false, 'a marker in the lane blocks it');
  assert.equal(T.passingLaneOpen(carrier, receiver, [{spread:.9, depth:.55}]), true, 'a marker off the lane does not');
  assert.equal(T.passingLaneOpen(carrier, receiver, [{spread:0, depth:.2}]), true, 'a marker behind the carrier does not');
  assert.equal(T.passingLaneOpen(carrier, carrier, []), false, 'you cannot pass to yourself');
});

test('marking is goal-side containment, tighter as pressing rises', () => {
  const opponent = {spread:.4, depth:.6};
  const loose = T.markingTarget({spread:0, depth:.5}, opponent, 0);
  const tight = T.markingTarget({spread:0, depth:.5}, opponent, 1);
  assert.ok(loose.depth < opponent.depth, 'a marker always stands goal-side');
  assert.ok(tight.depth > loose.depth, 'high pressing marks closer to the opponent');
  assert.ok(Math.abs(tight.spread - opponent.spread) < Math.abs(loose.spread - opponent.spread),
    'high pressing marks tighter across the pitch too');
});

test('tactical presets normalize, clamp and keep every dial', () => {
  T.TACTIC_IDS.forEach(id => {
    const dials = T.normalizeTactics({preset:id});
    assert.equal(dials.preset, id);
    T.TACTIC_KEYS.forEach(key => {
      if(key === 'offsideTrap'){ assert.equal(typeof dials.offsideTrap, 'boolean'); return; }
      assert.ok(dials[key] >= 0 && dials[key] <= 1, id + '.' + key + ' out of range');
    });
  });
  const override = T.normalizeTactics({preset:'balanced', pressing:9, lineHeight:-4, offsideTrap:true});
  assert.equal(override.pressing, 1, 'author overrides clamp');
  assert.equal(override.lineHeight, 0);
  assert.equal(override.offsideTrap, true);
  assert.equal(T.normalizeTactics(null).preset, T.DEFAULT_TACTIC_ID, 'no input uses the declared default');
});

console.log('soccer-tactics.test.js: all assertions passed');
