'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/runtime/soccer-match-flow.js');
const MATCH = global.LK_RUNTIME_SOCCER_MATCH;

function makeGame(){
  const events = [];
  return {
    events,
    hooks:{frame:[]},
    systems:{logic:{triggerRuntimeEvent(type, payload){ events.push({type, payload}); }}},
  };
}
const types = game => game.events.map(e => e.type);
/** Drive the match until `predicate` holds or the step budget runs out. */
function run(match, seconds, step){
  const dt = step || 1 / 60;
  for(let t = 0; t < seconds; t += dt) match.update(dt);
}
/** Step only as far as the restart delay needs. A fixed run would overshoot the
 *  fast-clock configs below and finish the whole match before the test starts. */
function toPlay(match){
  for(let i = 0; i < 6000 && match.phase() !== 'play'; i++) match.update(1 / 60);
  assert.equal(match.phase(), 'play');
}

function main(){
  // --- formations ----------------------------------------------------------
  MATCH.FORMATION_IDS.forEach(id => {
    const slots = MATCH.formationPositions(id);
    assert.equal(slots.length, 11, id + ' must field exactly 11 players');
    assert.equal(slots.filter(s => s.role === 'keeper').length, 1, id + ' must field exactly one keeper');
    slots.forEach(slot => {
      assert.ok(slot.x >= -1 && slot.x <= 1, id + ' slot x out of normalised range');
      assert.ok(slot.depth >= 0 && slot.depth <= 1, id + ' slot depth out of normalised range');
    });
    // Everyone starts in their own half at kickoff.
    assert.ok(slots.every(s => s.depth <= .5), id + ' must line up inside its own half');
  });
  assert.equal(MATCH.formationPositions('nonsense').length, 11, 'an unknown formation falls back to a valid XI');

  // --- lineups mirror correctly -------------------------------------------
  {
    const config = MATCH.normalizeConfig({pitch:{fieldLength:105, fieldWidth:68}});
    const lineups = MATCH.buildLineups(config);
    assert.equal(lineups.home.length, 11);
    assert.equal(lineups.away.length, 11);
    const homeKeeper = lineups.home.find(p => p.keeper);
    const awayKeeper = lineups.away.find(p => p.keeper);
    assert.ok(homeKeeper.spawn.z < 0, 'the home keeper defends the south goal');
    assert.ok(awayKeeper.spawn.z > 0, 'the away keeper defends the north goal');
    assert.ok(Math.abs(homeKeeper.spawn.z + awayKeeper.spawn.z) < 1e-9, 'the two keepers are mirrored');
    lineups.home.concat(lineups.away).forEach(p => {
      assert.ok(Math.abs(p.spawn.x) <= 34, p.name + ' spawns outside the touchlines');
      assert.ok(Math.abs(p.spawn.z) <= 52.5, p.name + ' spawns outside the goal lines');
    });
    assert.equal(lineups.home.filter(p => p.controlled).length, 0, 'no slot is player-controlled by default');
  }
  {
    const lineups = MATCH.buildLineups(MATCH.normalizeConfig({teams:{home:{playerSlot:9}}}));
    assert.equal(lineups.home.filter(p => p.controlled).length, 1, 'an authored player slot marks exactly one player');
    assert.equal(lineups.home[9].controlled, true);
  }

  // --- config normalization -----------------------------------------------
  {
    const cfg = MATCH.normalizeConfig({halves:99, halfMinutes:-4, secondsPerMinute:0, kickoffTeam:'martians',
      teams:{home:{formation:'6-6-6'}}});
    assert.equal(cfg.halves, 4, 'halves clamp');
    assert.equal(cfg.halfMinutes, 1, 'half length clamps to a playable minimum');
    assert.ok(cfg.secondsPerMinute > 0, 'the clock scale can never be zero');
    assert.equal(cfg.kickoffTeam, 'home', 'an unknown kickoff team falls back');
    assert.equal(cfg.teams.home.formation, '4-4-2', 'an unknown formation falls back');
    assert.equal(cfg.penaltiesOnDraw, true, 'a drawn match goes to penalties by default');
  }

  // --- kickoff and clock ---------------------------------------------------
  {
    const game = makeGame();
    const match = MATCH.create(game);
    match.configure({halfMinutes:1, secondsPerMinute:1, halves:2, restartDelay:2});
    match.start();
    assert.equal(match.phase(), 'kickoff');
    assert.ok(types(game).includes('OnMatchStarted'));
    assert.equal(match.snapshot().clock, 0);

    run(match, 1);
    assert.equal(match.phase(), 'kickoff', 'play does not begin before the restart delay elapses');
    run(match, 1.5);
    assert.equal(match.phase(), 'play');

    const before = match.snapshot().clock;
    run(match, 10);
    assert.ok(match.snapshot().clock > before, 'the clock advances during live play');
  }
  {
    // The clock must not advance while the ball is dead.
    const match = MATCH.create(makeGame());
    match.configure({halfMinutes:5, secondsPerMinute:1, restartDelay:2});
    match.start();
    const frozen = match.snapshot().clock;
    run(match, 1.5);
    assert.equal(match.snapshot().clock, frozen, 'the kickoff delay is not match time');
  }

  // --- goals and restarts --------------------------------------------------
  {
    const game = makeGame();
    const match = MATCH.create(game);
    match.configure({halfMinutes:10, secondsPerMinute:1, restartDelay:1});
    match.start();
    toPlay(match);
    assert.equal(match.goal('home'), true);
    assert.deepEqual(match.snapshot().score, {home:1, away:0});
    assert.equal(match.phase(), 'goal');
    assert.ok(types(game).includes('OnMatchGoal'));
    run(match, 1.5);
    assert.equal(match.phase(), 'kickoff', 'the conceding side restarts');
    assert.equal(match.snapshot().restartTeam, 'away');
    run(match, 1.5);
    assert.equal(match.phase(), 'play');

    assert.equal(match.goal('away'), true);
    assert.deepEqual(match.snapshot().score, {home:1, away:1});
  }
  {
    const match = MATCH.create(makeGame());
    match.configure({restartDelay:1});
    match.start();
    assert.equal(match.goal('home'), true, 'a goal straight from kickoff counts');
    // A goal while the ball is dead must not count twice.
    assert.equal(match.goal('home'), false);
    assert.deepEqual(match.snapshot().score, {home:1, away:0});
  }

  // --- restarts from out of play ------------------------------------------
  {
    const match = MATCH.create(makeGame());
    match.configure({halfMinutes:10, secondsPerMinute:1, restartDelay:1});
    match.start();
    toPlay(match);
    match.touch('home');
    assert.equal(match.ballOut({edge:'touchline'}), true);
    assert.equal(match.phase(), 'throwIn');
    assert.equal(match.snapshot().restartTeam, 'away', 'the throw goes to the side that did not touch it last');
    run(match, 2);
    assert.equal(match.phase(), 'play');

    match.touch('home');
    assert.equal(match.ballOut({edge:'goalLineOpponent'}), true);
    assert.equal(match.phase(), 'goalKick', 'an attacker putting it behind concedes a goal kick');
    run(match, 2.5);

    match.touch('away');
    assert.equal(match.ballOut({edge:'goalLineOwn'}), true);
    assert.equal(match.phase(), 'corner', 'a defender putting it behind concedes a corner');
  }
  {
    // Rules toggles must actually disable their restart.
    const match = MATCH.create(makeGame());
    match.configure({restartDelay:1, rules:{throwIns:false}});
    match.start();
    toPlay(match);
    match.touch('home');
    assert.equal(match.ballOut({edge:'touchline'}), false, 'throw-ins can be switched off');
    assert.equal(match.phase(), 'play');
  }

  // --- half time and full time --------------------------------------------
  {
    const game = makeGame();
    const match = MATCH.create(game);
    match.configure({halves:2, halfMinutes:1, secondsPerMinute:1, restartDelay:.5});
    match.start();
    toPlay(match);
    run(match, 1.2);
    assert.equal(match.phase(), 'halfTime', 'the first half ends on the clock');
    assert.ok(types(game).includes('OnMatchPhaseChanged'));
    run(match, .7);
    assert.equal(match.snapshot().half, 2, 'the match moves into the second half');
    assert.equal(match.finished(), false);
  }
  {
    const game = makeGame();
    const match = MATCH.create(game);
    match.configure({halves:1, halfMinutes:1, secondsPerMinute:1, restartDelay:.5, penaltiesOnDraw:false});
    match.start();
    toPlay(match);
    match.goal('home');
    run(match, 4);
    assert.equal(match.finished(), true);
    assert.equal(match.outcome(), 'home');
    assert.ok(types(game).includes('OnMatchEnded'));
  }
  {
    // A drawn match with penalties disabled simply ends level.
    const match = MATCH.create(makeGame());
    match.configure({halves:1, halfMinutes:1, secondsPerMinute:1, restartDelay:.5, penaltiesOnDraw:false});
    match.start();
    toPlay(match);
    run(match, 4);
    assert.equal(match.outcome(), 'draw');
  }

  // --- drawn match goes to a shootout --------------------------------------
  {
    const game = makeGame();
    const match = MATCH.create(game);
    match.configure({halves:1, halfMinutes:1, secondsPerMinute:1, restartDelay:.5, penaltiesOnDraw:true});
    match.start();
    toPlay(match);
    run(match, 4);
    assert.equal(match.phase(), 'shootout', 'a level match goes to penalties');
    assert.ok(types(game).includes('OnMatchShootoutStarted'));
    assert.equal(match.finished(), false);

    // 5-4 on kicks: home converts every kick, away misses the last.
    for(let round = 0; round < 4; round++){
      match.shootoutKick('home', true);
      match.shootoutKick('away', true);
    }
    assert.equal(match.finished(), false, 'four each is still level');
    match.shootoutKick('home', true);
    match.shootoutKick('away', false);
    assert.equal(match.finished(), true);
    assert.equal(match.outcome(), 'home');
    const ended = game.events.filter(e => e.type === 'OnMatchEnded').pop();
    assert.equal(ended.payload.decidedBy, 'shootout');
  }
  {
    // Decided early: 3-0 up after three kicks each cannot be caught.
    const match = MATCH.create(makeGame());
    match.configure({halves:1, halfMinutes:1, secondsPerMinute:1, restartDelay:.5});
    match.start();
    toPlay(match);
    run(match, 4);
    for(let i = 0; i < 3; i++){
      match.shootoutKick('home', true);
      match.shootoutKick('away', false);
    }
    assert.equal(match.finished(), true, 'a shootout ends as soon as it cannot be caught');
    assert.equal(match.outcome(), 'home');
  }
  {
    // Sudden death past five each.
    const match = MATCH.create(makeGame());
    match.configure({halves:1, halfMinutes:1, secondsPerMinute:1, restartDelay:.5});
    match.start();
    toPlay(match);
    run(match, 4);
    for(let i = 0; i < 5; i++){ match.shootoutKick('home', true); match.shootoutKick('away', true); }
    assert.equal(match.finished(), false, '5-5 goes to sudden death');
    match.shootoutKick('home', true);
    match.shootoutKick('away', false);
    assert.equal(match.outcome(), 'home');
  }

  // --- extra time before penalties ----------------------------------------
  {
    const game = makeGame();
    const match = MATCH.create(game);
    match.configure({halves:1, halfMinutes:1, secondsPerMinute:1, restartDelay:.5, extraTime:true});
    match.start();
    toPlay(match);
    assert.equal(match.snapshot().period, 'regulation');
    run(match, 1.2);
    // Extra time is a period: play resumes through the normal kickoff cycle
    // rather than parking in a phase of its own.
    assert.equal(match.snapshot().period, 'extra', 'a level match plays extra time before penalties');
    assert.ok(types(game).includes('OnMatchExtraTime'));
    assert.equal(match.finished(), false);
    assert.notEqual(match.phase(), 'shootout');
    // Still level at the end of extra time, so it finally goes to penalties.
    run(match, 2.2);
    assert.equal(match.phase(), 'shootout');
  }

  // --- possession and shots ------------------------------------------------
  {
    const match = MATCH.create(makeGame());
    match.configure({halfMinutes:10, secondsPerMinute:1, restartDelay:.5});
    match.start();
    toPlay(match);
    match.touch('home');
    run(match, 3);
    const snapshot = match.snapshot();
    assert.ok(snapshot.possession.home > snapshot.possession.away, 'holding the ball builds possession');
    assert.ok(Math.abs(snapshot.possession.home + snapshot.possession.away - 1) < 1e-9, 'possession is a share of 1');
    assert.equal(match.shot('home'), true);
    assert.equal(match.snapshot().shots.home, 1);
  }

  // --- a stalled frame must not skip the match ----------------------------
  {
    const match = MATCH.create(makeGame());
    match.configure({halves:2, halfMinutes:45, secondsPerMinute:2, restartDelay:1});
    match.start();
    toPlay(match);
    match.update(600);
    assert.equal(match.phase(), 'play', 'one huge frame is clamped instead of ending the half');
  }

  // --- snapshot / reset ----------------------------------------------------
  {
    const match = MATCH.create(makeGame());
    match.configure({halfMinutes:10, secondsPerMinute:1, restartDelay:.5,
      teams:{home:{name:'Lot King FC', color:'#ff0000'}, away:{name:'Visitors'}}});
    match.start();
    toPlay(match);
    match.goal('home');
    const snapshot = match.snapshot();
    assert.equal(snapshot.teams.home.name, 'Lot King FC');
    assert.equal(snapshot.teams.home.shortName, 'LOT');
    assert.ok(/^\d+'\d{2}$/.test(snapshot.clockText), 'the clock renders as a scoreboard string, got ' + snapshot.clockText);
    match.reset();
    assert.deepEqual(match.snapshot().score, {home:0, away:0}, 'reset clears the score');
    assert.equal(match.phase(), 'kickoff');
  }

  // --- install -------------------------------------------------------------
  {
    const game = makeGame();
    const match = MATCH.install(game);
    assert.equal(game.systems.soccerMatch, match);
    assert.equal(game.hooks.frame.length, 1);
    assert.equal(MATCH.install(game), match, 'install is idempotent');
    assert.equal(game.hooks.frame.length, 1, 'a second install does not add a second frame hook');
  }

  // --- separation from the standalone shootout mode ------------------------
  const source = fs.readFileSync(path.join(__dirname, '..', 'js/runtime/soccer-match-flow.js'), 'utf8');
  assert.ok(!source.includes('LK_RUNTIME_PENALTY_FLOW'),
    'the match must not reach into the standalone penalty module state');
  const penalty = fs.readFileSync(path.join(__dirname, '..', 'js/runtime/penalty-flow.js'), 'utf8');
  assert.ok(!penalty.includes('LK_RUNTIME_SOCCER_MATCH'),
    'the standalone penalty mode must stay usable without a match');

  console.log('soccer-match-flow.test.js: all assertions passed');
}

try { main(); }
catch(error){ console.error(error); process.exitCode = 1; }
