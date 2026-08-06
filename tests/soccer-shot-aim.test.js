'use strict';

// Contract for the charged-shot experience: slow motion while aiming, a meter
// that shows power / height / curve, curve as a real controlled axis, and a
// free camera that is NOT hijacked by the aim reticle before the player charges.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

const lotKing = read('js/lot-king.js');
const pawns = read('js/runtime/soccer-pawns.js');
const hud = read('js/runtime/game-hud.js');
const css = read('css/lot-king.css');
const template = read('js/logic/logic-templates-soccer.js');
const store = read('js/engine/scene-store.js');

test('the free camera is only surrendered to aiming once a shot is actually charging', () => {
  const match = lotKing.match(/const shotAiming=[^\n]*/);
  assert.ok(match, 'the pointer handler must still decide whether aiming owns the pointer');
  assert.ok(/state\s*&&\s*\w+\.state\.shotCharge/.test(match[0]),
    'aiming must key off an active charge');
  assert.ok(!/wantsShotAimInput/.test(match[0]),
    'the whole penalty ready/aim phase must NOT claim the pointer, or the free camera is pinned');
  // The camera path itself must still be reachable.
  assert.ok(lotKing.includes('camYaw   -= dx*.005;'), 'mouse look must still drive the orbit yaw');
});

test('charging a shot requests slow motion, independently of any match phase', () => {
  assert.ok(lotKing.includes('function soccerShotSlowMotionRequested()'),
    'a dedicated request function must exist');
  const fn = lotKing.slice(lotKing.indexOf('function soccerShotSlowMotionRequested()'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 1);
  assert.ok(body.includes('state.shotCharge'), 'slow motion keys off the charge itself');
  assert.ok(!/penalty|phase/i.test(body),
    'slow motion must work while running, so it cannot depend on a penalty phase');
  assert.ok(body.includes('aimSlowMotion'), 'authors can switch the effect off');
  assert.ok(body.includes('aimTimeScale'), 'authors can set how slow it goes');
});

test('the shared time scale honours the shot request and eases in faster than out', () => {
  const ts = lotKing.slice(lotKing.indexOf('const TS = {'), lotKing.indexOf('const IS_EMBEDDED_GAMEPLAY'));
  assert.ok(ts.includes('soccerShotSlowMotionRequested()'), 'TS must consider the shot request');
  assert.ok(/shotScale > 0 \? shotScale : 0\.1/.test(ts), 'the authored scale must win over the radio default');
  assert.ok(/rate = shotScale > 0 && this\.cur > target \? 9 : 4/.test(ts),
    'entering aim should bite faster than it recovers');
});

test('curve is a signed axis the player controls, not an unused boolean', () => {
  assert.ok(pawns.includes('curve:0,pointerAim:'), 'a charge starts with neutral curve');
  assert.ok(/leanRight===true\?1:0\)-\(.*leanLeft===true\?1:0\)/.test(pawns),
    'curve must be driven by the dedicated lean controls');
  assert.ok(pawns.includes('const bend=base.clamp(base.finite(charge.curve,0),-1,1);'),
    'the shot plan must read the signed curve axis');
  assert.ok(pawns.includes('bend,target'), 'the plan exposes the bend so HUD and ball agree');
  // Releasing with no curve input must still produce a natural, non-zero bend.
  assert.ok(/bend!==0\?bend:aimX\*\.22/.test(pawns), 'an uncurved strike keeps a slight natural bend');
});

test('the meter reports power, height and curve, plus the slow-motion state', () => {
  ['soccerShotPower', 'soccerShotHeight', 'soccerShotCurve', 'soccerShotAim'].forEach(id => {
    assert.ok(hud.includes(id), 'the HUD must drive #' + id);
  });
  assert.ok(hud.includes("dataset.power=charge01>=SWEET_MIN"), 'the meter must mark the clean-strike window');
  assert.ok(hud.includes("classList.toggle('slowmo'"), 'the meter must show that time is slowed');
  assert.ok(/const SWEET_MIN = \.\d+, SWEET_MAX = \.\d+;/.test(hud), 'the sweet spot is a named constant');
  assert.ok(lotKing.includes('curve:shotCharge?Number(shotCharge.curve)||0:null'),
    'the runtime must forward the live curve to the HUD');
  assert.ok(lotKing.includes('slowMotion:!!shotCharge'), 'the runtime must forward the slow-motion state');
});

test('the meter markup and styling exist on every playable shell', () => {
  ['engine_editor.html', 'gameplay.html'].forEach(file => {
    const html = read(file);
    ['soccerShotPower', 'soccerShotSweet', 'soccerShotHeight', 'soccerShotCurve'].forEach(id => {
      assert.ok(html.includes('id="' + id + '"'), file + ' is missing #' + id);
    });
  });
  ['.ssmPower', '.ssmAxes', '.ssmHeight', '.ssmCurve', '[data-power="sweet"]'].forEach(rule => {
    assert.ok(css.includes(rule), 'runtime CSS must style ' + rule);
  });
});

test('the new aiming settings are authorable and migrate into existing projects', () => {
  ['ball.aimSlowMotion', 'ball.aimTimeScale'].forEach(binding => {
    assert.ok(template.includes("binding:'" + binding + "'"), 'the Soccer template must expose ' + binding);
    assert.ok(store.includes("binding:'" + binding + "'"), 'saved Soccer graphs must gain ' + binding);
  });
  assert.ok(pawns.includes('aimSlowMotion:ball.aimSlowMotion!==false'), 'the runtime defaults slow motion on');
  assert.ok(/aimTimeScale:base\.clamp\(base\.finite\(ball\.aimTimeScale,\.18\),\.02,\.9\)/.test(pawns),
    'the aiming time scale must be clamped to a usable range');
  assert.ok(store.includes('normalized.soccerPawn.ball.aimTimeScale=.18'),
    'older saved projects get a sane default rather than undefined');
});

test('a Soccer Pawn uses football verbs, not borrowed vehicle actions', () => {
  const actions = read('js/runtime/input/input-actions.js');
  assert.ok(actions.includes("const SOCCER_ACTIONS = ['shoot', 'pass', 'tackle', 'diveLeft', 'diveRight'];"),
    'football verbs and dedicated goalkeeper dives must exist in the shared schema');
  assert.ok(actions.includes(".concat(SOCCER_ACTIONS)"), 'they must join the on-foot action list');
  assert.ok(actions.includes("scheme.shoot = ['KeyF'];"), 'F must actually bind Shoot in the character context');
  assert.ok(actions.includes("scheme.pass = ['KeyG'];") && actions.includes("scheme.tackle = ['KeyC'];"),
    'pass and tackle need real default keys');
  assert.ok(actions.includes('shoot: anyDown(scheme.shoot),') && actions.includes('pass: anyDown(scheme.pass),') && actions.includes('tackle: anyDown(scheme.tackle),'),
    'football bindings must reach the resolved keyboard action snapshot');
  assert.ok(actions.includes('shoot: readGamepadPressed(scheme.shoot, gp),'),
    'football bindings must reach the resolved gamepad action snapshot');
  assert.ok(actions.includes('shoot:false, pass:false, tackle:false'),
    'neutral input must explicitly release every football action');
  assert.ok(!/scheme\.shoot = \[[^\]]*Mouse0/.test(actions),
    'Shoot must not squat on Mouse0: that is Fire, and the mapping UI would flag a conflict');
  assert.ok(actions.includes('function migrateV13Soccer'), 'existing saved configs must gain the new verbs');
  assert.ok(actions.includes('const CONFIG_VERSION = 15;'), 'the config version must advance with the new schema');

  // The bug: shooting read the vehicle headlight flash, which the character
  // context deliberately unbinds, so the key could never fire.
  assert.ok(pawns.length > 0);
  const base = read('js/runtime/character-pawn-base.js');
  assert.ok(base.includes('action:drive.shoot===true||drive.fire===true,'),
    'the primary verb must come from Shoot first, with Fire as the only safe profile alias');
  assert.equal(base.includes('drive.fire===true||drive.highBeams===true'),false,
    'Soccer must never borrow the Vehicle High Beams action');
  assert.ok(base.includes('jump:drive.jump===true,'),
    'jump must use its own action and never borrow vehicle reset');
  ['shoot', 'pass', 'tackle'].forEach(channel => {
    assert.ok(base.includes("'" + channel + "'"), 'DEVICE_CHANNELS must carry ' + channel);
    assert.ok(base.includes(channel + ':false'), 'neutralMove must declare ' + channel);
  });
});

console.log('soccer-shot-aim.test.js: all assertions passed');
