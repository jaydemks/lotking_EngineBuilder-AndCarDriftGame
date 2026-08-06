'use strict';

/* =========================================================
   Every traversal and cover action plays its own clip.

   The MECHANICS of rolling, sliding, vaulting, mantling, climbing, hanging,
   crouching and taking cover all worked long before the takes were imported, so
   for a while only the roll was visibly animated: everything else moved the body
   and asked for nothing. This file is the check that each action requests the
   right slot, once, with sane fades — and, just as importantly, that an action
   whose slot has no clip still completes instead of freezing the character.

   HOW IT IS CHECKED
   By EXECUTION, never by reading the source. A test double for the Pawn records
   every `playAction` call and simulates the clip lifecycle the real Pawn
   publishes (`actionClipPlaying` / `actionClipName` / `actionClipDuration`), and
   the real ability and cover controllers are driven frame by frame against it.
   Source-text assertions are banned here: in this repo a text assertion once
   passed while the function it described crashed at runtime, and three separate
   regexes matched a code COMMENT instead of code.

   HOW THIS FILE IS ORGANISED
     01 harness    window stubs, the recording Pawn, world fixtures
     02 crouch     the stance holds a pose
     03 ledges     hang, shimmy, climb
     04 moves      slide, roll, vault, mantle
     05 landings   land, landMoving, landCrouch, landHeavy
     06 cover      entering, shuffling, leaving
     07 degrade    an unbound slot costs nothing but itself
   ========================================================= */

const assert = require('node:assert/strict');

// ================================================================= 01 harness

global.window = global;
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
const events = [];
global.dispatchEvent = event => {
  events.push(event.detail);
  (listeners[event.type] || []).forEach(fn => fn(event));
  return true;
};

require('../js/runtime/character-movement.js');
require('../js/runtime/character-abilities.js');
require('../js/runtime/character-combat-cover.js');

const ABILITIES = global.LK_RUNTIME_CHARACTER_ABILITIES;
const COVER = global.LK_RUNTIME_CHARACTER_COVER;
const MOVEMENT = global.LK_RUNTIME_CHARACTER_MOVEMENT;

function test(name, run){
  events.length = 0;
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

function boxCollider(x, y, z, hx, hy, hz, extra){
  return Object.assign({x, y, z, hx, hy, hz, enabled:true}, extra || {});
}
function fakeGame(boxes){
  return {
    world:{colliders:{box:boxes || [], circle:[]}, registry:[], characterGroundHeight:() => 0},
    core:{scene:null}, state:{}, systems:{}, pawns:{get:() => null},
  };
}

/** A Pawn that RECORDS what was asked of it and publishes the same action state
 *  the real Pawn publishes, so the controllers under test cannot tell the
 *  difference. `bound` is the list of slots that carry a clip; anything outside it
 *  is an authored slot that nothing can play, which is the degrade path. */
function recordingPawn(GAME, bound, options){
  const opts = options || {};
  const clipSeconds = opts.clipSeconds || {};
  const animations = {};
  (bound || []).forEach(slot => { animations[slot] = {clip:slot, asset:{src:slot + '.fbx'}}; });
  const owner = opts.owner || {position:{x:0, y:0, z:0}, rotation:{x:0, y:0, z:0}, userData:{},
    traverse(){}, updateMatrixWorld(){}, getWorldPosition(){}};
  const calls = [];
  const pawn = {
    id:'pawn-clips',
    possessed:true, enabled:true, hidden:false,
    owner,
    state:{speed:0, grounded:true, airborne:false},
    config:{animations, movement:{}},
    movementController:MOVEMENT.create(GAME, {}),
    reset(){ return true; },
    dispose(){ return true; },
    playAction(name, actionOptions){
      calls.push({name:String(name), options:Object.assign({}, actionOptions || {})});
      const playable = !!animations[name];
      this.state.action = name;
      this.state.actionClipPlaying = playable;
      this.state.actionClipName = playable ? name : null;
      this.state.actionClipDuration = playable ? (clipSeconds[name] == null ? 1.1 : clipSeconds[name]) : 0;
      return true;
    },
    /** The AnimationMixer reaching the end of a one-shot, which is what makes a
     *  held pose ask for its clip again. */
    endClip(){
      this.state.action = null;
      this.state.actionClipPlaying = false;
      this.state.actionClipName = null;
      this.state.actionClipDuration = 0;
      return true;
    },
  };
  // The locomotion controller only has to answer the two calls the action layer
  // makes of it: stopping the one-shot, and reporting how far a roll has got.
  pawn.locomotion = {
    stopAction(){ return pawn.endClip(); },
    actionProgress:() => (opts.progress == null ? 1 : opts.progress),
  };
  return {pawn, calls, owner,
    named:name => calls.filter(entry => entry.name === name),
    last:() => (calls.length ? calls[calls.length - 1] : null)};
}

/** A body with a visual root under it, the way a Character Pawn carries either the
 *  procedural placeholder rig or a GLB asset root. */
function poseRigPawn(GAME, bound, options){
  const THREE = require('three');
  const owner = new THREE.Group();
  const body = new THREE.Group();
  body.name = 'Character Placeholder - T-Pose';
  body.userData.characterPlaceholderRig = true;
  owner.add(body);
  owner.updateMatrixWorld(true);
  const built = recordingPawn(GAME, bound, Object.assign({owner}, options || {}));
  return Object.assign(built, {body});
}

/** A crouched, latched stance on flat ground. */
function crouched(GAME, bound, options){
  const built = recordingPawn(GAME, bound, options);
  built.pawn.movementController.configure({height:1.8, radius:.35});
  const abilities = ABILITIES.create(GAME, built.pawn, {crouch:{blend:1000}});
  abilities.preMovement(.05, {crouch:true});
  return Object.assign(built, {abilities});
}

// A ledge too high to mantle, with somewhere to pull up onto: the hang fixture.
function hangGame(halfWidth){
  const w = halfWidth == null ? 5 : halfWidth;
  return fakeGame([boxCollider(0, 1.45, 1.4, w, 1.45, .7), boxCollider(0, 2.95, 3, w, .15, 1.6)]);
}
function hanging(bound){
  const GAME = hangGame();
  const built = recordingPawn(GAME, bound);
  built.pawn.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
  const abilities = ABILITIES.create(GAME, built.pawn, {});
  built.owner.position.y = 1.05;
  built.pawn.state.grounded = false;
  built.pawn.state.velocityY = -2;
  abilities.preMovement(.016, {});
  return Object.assign(built, {abilities, GAME});
}

// ================================================================== 02 crouch

test('crouching holds the crouch pose, asks for it once, and gives it back', () => {
  const GAME = fakeGame();
  const {pawn, abilities, named} = crouched(GAME, ['crouchIdle']);
  for(let i = 0; i < 30; i++) abilities.preMovement(.05, {});
  assert.equal(abilities.mode(), 'crouch', 'the stance is latched');
  const held = named('crouchIdle');
  assert.equal(held.length, 1, 'a held pose is requested once, not once per frame, got ' + held.length);
  assert.ok(held[0].options.fadeIn > 0 && held[0].options.fadeIn <= .25,
    'a pose blends in over a sane time, got ' + held[0].options.fadeIn);
  assert.ok(held[0].options.fadeOut > 0, 'and blends back out');
  assert.equal(held[0].options.hold, true, 'the Pawn knows this is a stance');
  assert.equal(held[0].options.holdLastFrame, true, 'the crouch transition clamps low instead of looping back upright');
  assert.equal(held[0].options.loop, false, 'the static crouch is not a visible loop');
  assert.equal(pawn.state.actionClipName, 'crouchIdle', 'the crouch clip is what the body is playing');

  // Standing up gives the slot back, or the character walks around crouched.
  abilities.preMovement(.05, {crouch:true});
  for(let i = 0; i < 5; i++) abilities.preMovement(.05, {});
  assert.equal(abilities.mode(), 'none');
  assert.equal(pawn.state.actionClipName, null, 'standing up stops holding the crouch');
});

test('a pose whose clip ended is asked for again, so the stance never expires', () => {
  // The bundled crouch idle is a short loop and the Pawn plays one-shots: without
  // the re-request the character stood back up inside a second while still crouched.
  const GAME = fakeGame();
  const {pawn, abilities, named} = crouched(GAME, ['crouchIdle']);
  abilities.preMovement(.05, {});
  assert.equal(named('crouchIdle').length, 1);
  pawn.endClip();
  abilities.preMovement(.05, {});
  assert.equal(named('crouchIdle').length, 2, 'the pose is re-requested the moment its clip stops');
  assert.equal(pawn.state.actionClipName, 'crouchIdle');
});

test('a held pose waits for another system clip, but not for one that never ends', () => {
  // The weapon pose layer plays `fire` and `aimIdle` on the SAME one-shot slot the
  // crouch holds. Two systems that both re-request the moment the other takes over
  // cancel each other on every frame, so the pose yields — and a clip that never
  // publishes a finish must still not cost the crouch its animation for good.
  const GAME = fakeGame();
  const {pawn, abilities, named} = crouched(GAME, ['crouchIdle', 'fire']);
  abilities.preMovement(.05, {});
  assert.equal(named('crouchIdle').length, 1);

  pawn.playAction('fire');
  pawn.state.actionTime = 0;
  abilities.preMovement(.05, {});
  assert.equal(named('crouchIdle').length, 1, 'the crouch does not cut the shot short');
  assert.equal(pawn.state.actionClipName, 'fire');

  pawn.state.actionTime = 9;
  abilities.preMovement(.05, {});
  assert.equal(named('crouchIdle').length, 2, 'a foreign clip that outstays its own length is taken over');
  assert.equal(pawn.state.abilityPose, 'crouchIdle', 'and what traversal holds is published for the layer that shares it');

  abilities.preMovement(.05, {crouch:true});
  abilities.preMovement(.05, {});
  assert.equal(pawn.state.abilityPose, null, 'standing up publishes that nothing is held');
});

test('aiming from a crouch holds the aimed crouch take instead', () => {
  const GAME = fakeGame();
  const {pawn, abilities, last} = crouched(GAME, ['crouchIdle', 'crouchAimIdle']);
  pawn.firstPerson = {isAiming:() => true};
  abilities.preMovement(.05, {});
  assert.equal(last().name, 'crouchAimIdle', 'the weapon is up, so the crouch that holds it is the pose');
});

test('a crouch that MOVES holds the take for the direction it is moving', () => {
  const GAME = fakeGame();
  const {abilities, last, named} = crouched(GAME,
    ['crouchIdle', 'crouchWalk', 'crouchWalkBackward', 'crouchWalkLeft', 'crouchSneakLeft']);
  abilities.preMovement(.05, {z:1});
  assert.equal(last().name, 'crouchWalk', 'forward');
  assert.equal(last().options.loop, true, 'a moving crouch remains a gait cycle');
  assert.equal(last().options.holdLastFrame, false, 'only the stationary crouch clamps on its last frame');
  abilities.preMovement(.05, {z:-1});
  assert.equal(last().name, 'crouchWalkBackward', 'backward');
  // +X in the character's own frame is the body's own LEFT.
  abilities.preMovement(.05, {x:1});
  assert.equal(last().name, 'crouchWalkLeft', 'lateral, and on the correct side');
  // Slow Walk is the difference between moving low and moving quietly.
  abilities.preMovement(.05, {x:1, slowWalk:true});
  assert.equal(last().name, 'crouchSneakLeft', 'Slow Walk prefers the sneak take');
  abilities.preMovement(.05, {});
  assert.equal(last().name, 'crouchIdle', 'stopping returns to the standing-still crouch');
  assert.equal(named('crouchWalk').length, 1, 'holding a direction does not restart its clip');
});

test('a crouch direction with no take releases the slot instead of gliding in a pose', () => {
  // Holding a crouch IDLE while walking would suppress locomotion and slide the
  // character along in a still pose. An unbound direction hands the frame back to
  // the locomotion machine, which at least moves its legs.
  const GAME = fakeGame();
  const {pawn, abilities, calls} = crouched(GAME, ['crouchIdle', 'crouchWalkLeft']);
  abilities.preMovement(.05, {x:1});
  assert.equal(pawn.state.actionClipName, 'crouchWalkLeft');
  const before = calls.length;
  abilities.preMovement(.05, {x:-1});
  assert.equal(pawn.state.actionClipName, null, 'the unbound side is not held by anything');
  assert.equal(calls.length, before, 'and nothing was asked of the Pawn for it');
  assert.equal(abilities.mode(), 'crouch', 'the stance itself is unaffected');
});

// ================================================================== 03 ledges

test('catching a ledge holds the hang, and shuffling along it plays the shimmy', () => {
  const {pawn, abilities, named, last} = hanging(['hang', 'ledgeShimmyLeft']);
  assert.equal(abilities.mode(), 'hang');
  assert.equal(named('hang').length, 1, 'the grab holds the hang on the frame it happens');
  for(let i = 0; i < 10; i++) abilities.preMovement(.05, {});
  assert.equal(named('hang').length, 1, 'and holding on does not restart it every frame');

  abilities.preMovement(.05, {x:1});
  assert.equal(last().name, 'ledgeShimmyLeft', 'shuffling has its own take');
  // The right-hand shimmy is not bound, so it degrades to the neutral hold rather
  // than to nothing: a character with no clip on a ledge is the failure to avoid.
  abilities.preMovement(.05, {x:-1});
  assert.equal(last().name, 'hang');
  assert.equal(pawn.state.actionClipName, 'hang');

  abilities.preMovement(.016, {crouch:true});
  assert.equal(abilities.mode(), 'none', 'Crouch lets go');
  assert.equal(pawn.state.actionClipName, null, 'and the hang is released with it');
});

test('a hang with only the neutral take still animates in every direction', () => {
  const {pawn, abilities, named} = hanging(['hang']);
  abilities.preMovement(.05, {x:1});
  abilities.preMovement(.05, {x:-1});
  abilities.preMovement(.05, {});
  assert.equal(named('hang').length, 1, 'one hold covers the whole hang');
  assert.equal(pawn.state.actionClipName, 'hang');
});

test('climbing holds the up take going up and the down take coming down', () => {
  const wall = boxCollider(0, 2.5, 1, 2, 2.5, .3, {climbable:true});
  const GAME = fakeGame([wall]);
  const {pawn, abilities, last, named} = (() => {
    const built = recordingPawn(GAME, ['climb', 'climbUp', 'climbDown']);
    built.pawn.movementController.configure({height:1.8, radius:.35});
    return Object.assign(built, {abilities:ABILITIES.create(GAME, built.pawn, {})});
  })();
  assert.equal(abilities.preMovement(.016, {jump:true}), true, 'grabbing the wall takes the frame');
  assert.equal(abilities.mode(), 'climb');
  assert.equal(last().name, 'climb', 'a standing hold on the surface');
  abilities.preMovement(.016, {z:1});
  assert.equal(last().name, 'climbUp');
  for(let i = 0; i < 10; i++) abilities.preMovement(.016, {z:1});
  assert.equal(named('climbUp').length, 1, 'the ascent is one held clip, not one per frame');
  abilities.preMovement(.016, {z:-1});
  assert.equal(last().name, 'climbDown');
  abilities.endClimb('test');
  assert.equal(pawn.state.actionClipName, null, 'leaving the surface releases the pose');
});

test('a climb with only the neutral take holds it in both directions', () => {
  const wall = boxCollider(0, 2.5, 1, 2, 2.5, .3, {climbable:true});
  const GAME = fakeGame([wall]);
  const built = recordingPawn(GAME, ['climb']);
  built.pawn.movementController.configure({height:1.8, radius:.35});
  const abilities = ABILITIES.create(GAME, built.pawn, {});
  abilities.preMovement(.016, {jump:true});
  // Far enough up the wall that coming back down is a descent rather than
  // stepping off the bottom, which would legitimately end the climb.
  for(let i = 0; i < 20; i++) abilities.preMovement(.016, {z:1});
  abilities.preMovement(.016, {z:-1});
  assert.equal(abilities.mode(), 'climb', 'still on the wall');
  assert.equal(built.named('climb').length, 1);
  assert.equal(built.pawn.state.actionClipName, 'climb');
});

// =================================================================== 04 moves

function dodge(abilities){
  abilities.preMovement(.016, {dodge:true});
  abilities.preMovement(.016, {dodge:false});
  abilities.preMovement(.016, {dodge:true});
}

test('a slide plays its take, and the procedural lean stands down while it does', () => {
  const GAME = fakeGame();
  const {pawn, abilities, body, named} = (() => {
    const built = poseRigPawn(GAME, ['slide']);
    built.pawn.state.speed = 6.5;
    return Object.assign(built, {abilities:ABILITIES.create(GAME, built.pawn, {})});
  })();
  dodge(abilities);
  assert.equal(abilities.mode(), 'slide');
  assert.equal(named('slide').length, 1, 'the slide asks for its take once');
  const options = named('slide')[0].options;
  assert.ok(options.fadeIn > 0 && options.fadeOut > 0, 'with real fades');
  let guard = 0;
  while(abilities.mode() === 'slide' && guard++ < 200){
    abilities.preMovement(.016, {});
    assert.equal(Number(body.rotation.x.toFixed(6)), 0,
      'an authored slide is the only slide visual: the procedural lean must not add to it');
  }
  assert.ok(guard < 200, 'the slide still terminates');
  assert.ok(pawn.owner.position.z > .5, 'and still carries the character');
});

test('a slide with no take keeps the procedural lean it always had', () => {
  const GAME = fakeGame();
  const built = poseRigPawn(GAME, []);
  built.pawn.state.speed = 6.5;
  const abilities = ABILITIES.create(GAME, built.pawn, {});
  dodge(abilities);
  assert.equal(abilities.mode(), 'slide');
  let settled = 0, guard = 0;
  while(abilities.mode() === 'slide' && guard++ < 60){
    abilities.preMovement(.016, {});
    settled = Math.min(settled, built.body.rotation.x);
  }
  assert.ok(settled < -.2, 'the body still lays back with nothing bound, got ' + settled.toFixed(3));
  assert.equal(built.calls.length, 0, 'and the Pawn was never asked for a clip that does not exist');
});

test('the roll still asks for its own take, at the authored playback rate', () => {
  const GAME = fakeGame();
  const built = poseRigPawn(GAME, ['roll'], {progress:0});
  built.pawn.state.speed = 1.2;
  const abilities = ABILITIES.create(GAME, built.pawn, {slide:{rollPlaybackRate:1.25}});
  dodge(abilities);
  assert.equal(abilities.mode(), 'roll');
  const asked = built.named('roll');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].options.speed, 1.25, 'the roll carries its playback rate to the clip');
  assert.equal(Number(built.body.rotation.x.toFixed(6)), 0, 'the clip is the only tumble');
});

test('a vault plays its take and the tween lasts as long as the clip does', () => {
  // A 0.52 s authored default under a 1.2 s vault take made the vault read as a
  // teleport followed by a mime of the vault the character had already done.
  const build = bound => {
    const GAME = fakeGame([boxCollider(0, .45, 1.2, 2, .45, .3)]);
    const built = recordingPawn(GAME, bound, {clipSeconds:{vault:1.2}});
    built.pawn.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
    built.pawn.state.speed = 4;
    return Object.assign(built, {abilities:ABILITIES.create(GAME, built.pawn, {})});
  };
  const seconds = built => {
    let frames = 0;
    while(built.abilities.isBusy() && frames++ < 400) built.abilities.preMovement(.016, {});
    assert.ok(frames < 400, 'the traversal terminates');
    return frames * .016;
  };

  const animated = build(['vault']);
  assert.equal(animated.abilities.preMovement(.016, {jump:true}), true, 'the vault takes the frame');
  assert.equal(animated.named('vault').length, 1, 'and asks for its take once');
  const withClip = seconds(animated);
  assert.ok(Math.abs(withClip - 1.2) < .1, 'the body arrives when the clip says it does, got ' + withClip.toFixed(3));
  assert.ok(animated.owner.position.z > 1.5, 'and ends up past the obstacle');

  const bare = build([]);
  bare.abilities.preMovement(.016, {jump:true});
  const withoutClip = seconds(bare);
  assert.ok(Math.abs(withoutClip - .52) < .1, 'with no take the authored duration is untouched, got ' + withoutClip.toFixed(3));
  assert.ok(bare.owner.position.z > 1.5, 'and the vault still completes');
  assert.equal(bare.calls.length, 0);
});

test('a mantle plays its own take, and a pull-up out of a hang plays it too', () => {
  const GAME = fakeGame([boxCollider(0, .9, 1.6, 2, .9, 2)]);
  const built = recordingPawn(GAME, ['mantle']);
  built.pawn.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
  const abilities = ABILITIES.create(GAME, built.pawn, {});
  assert.equal(abilities.tryTraversal(), true);
  assert.equal(abilities.mode(), 'mantle');
  assert.equal(built.named('mantle').length, 1);

  const hang = hanging(['hang', 'mantle']);
  hang.abilities.preMovement(.016, {jump:true});
  assert.equal(hang.abilities.mode(), 'mantle', 'Jump converts the hang into a pull-up');
  assert.equal(hang.named('mantle').length, 1, 'which is the mantle, and it is animated');
  let guard = 0;
  while(hang.abilities.isBusy() && guard++ < 400) hang.abilities.preMovement(.016, {});
  assert.ok(hang.owner.position.y >= 2.85, 'the character ends up standing on the ledge');
});

// ================================================================ 05 landings

test('every kind of landing plays the take that belongs to it', () => {
  const bound = ['land', 'landMoving', 'landCrouch', 'landHeavy', 'roll'];
  const land = (prepare) => {
    const GAME = fakeGame();
    const built = recordingPawn(GAME, bound);
    built.pawn.movementController.configure({height:1.8, radius:.35});
    const abilities = ABILITIES.create(GAME, built.pawn, {});
    prepare(built.pawn, abilities);
    abilities.resolveLanding({});
    return built;
  };

  // An ordinary step off a kerb, standing still and moving.
  assert.equal(land((pawn, abilities) => { abilities.state.fallSpeed = 4; }).last().name, 'land');
  assert.equal(land((pawn, abilities) => { abilities.state.fallSpeed = 4; pawn.state.speed = 3; }).last().name, 'landMoving');
  // Already crouched on the way down.
  assert.equal(land((pawn, abilities) => { abilities.state.fallSpeed = 4; abilities.state.crouchBlend = 1; }).last().name, 'landCrouch');
  // A damaging fall that is survived, taken standing still: the feet plant.
  const heavy = land((pawn, abilities) => { abilities.state.fallSpeed = 14; pawn.state.speed = 0; });
  assert.equal(heavy.last().name, 'landHeavy');
  // The same fall taken with momentum converts into a roll instead.
  const rolled = land((pawn, abilities) => { abilities.state.fallSpeed = 14; pawn.state.speed = 5; });
  assert.equal(rolled.named('roll').length, 1, 'a fast landing that is going somewhere rolls');
});

test('a missing crouched landing degrades by current movement', () => {
  const GAME=fakeGame(),built=recordingPawn(GAME,['landMoving','land']);
  built.pawn.movementController.configure({height:1.8,radius:.35});
  const abilities=ABILITIES.create(GAME,built.pawn,{});
  abilities.state.fallSpeed=4;
  abilities.state.crouchBlend=1;
  abilities.resolveLanding();
  assert.equal(built.last().name,'land');
  built.pawn.state.speed=3;
  abilities.state.fallSpeed=4;
  abilities.resolveLanding();
  assert.equal(built.last().name,'landMoving');
});

// =================================================================== 06 cover

function coverPawn(GAME, bound){
  const built = recordingPawn(GAME, bound);
  built.pawn.movementController.configure({height:1.8, radius:.35, walkSpeed:3.1});
  return built;
}
// A wall face on the +z side of a character standing at z = 2 and facing it.
function coverWorld(height){
  const half = (height == null ? 2.2 : height) / 2;
  return fakeGame([boxCollider(0, half, 3, 4, half, .5)]);
}

test('taking cover, shuffling along it and leaving it each play their own take', () => {
  const GAME = coverWorld(2.2);
  const built = coverPawn(GAME, ['coverHigh', 'coverToStand', 'coverSneakLeft', 'coverSneakRight']);
  const cover = COVER.create(GAME, built.pawn, {button:'takeCover', reach:1.6, blend:40});
  built.owner.position.z = 2;

  assert.equal(cover.preMovement(.016, {takeCover:true}), true, 'the press takes cover');
  assert.equal(cover.coverClass(), 'high');
  assert.equal(built.named('coverHigh').length, 1, 'getting behind cover is animated');
  const entry = built.named('coverHigh')[0].options;
  assert.ok(entry.fadeIn > 0 && entry.fadeOut > 0, 'with real fades');

  // The shuffle must not cut the entry transition short.
  const beforeSneak = built.calls.length;
  cover.preMovement(.016, {takeCover:true, x:1});
  assert.equal(built.calls.length, beforeSneak, 'the entry take is left to finish');

  built.pawn.endClip();
  for(let i = 0; i < 8; i++) cover.preMovement(.016, {takeCover:true, x:1});
  assert.equal(built.named('coverSneakLeft').length, 1, 'shuffling left is one held take');
  assert.equal(built.pawn.state.actionClipName, 'coverSneakLeft');
  for(let i = 0; i < 8; i++) cover.preMovement(.016, {takeCover:true, x:-1});
  assert.equal(built.named('coverSneakRight').length, 1, 'and the other side has its own');

  // Standing still behind cover releases the shuffle: there is no cover idle take,
  // so holding one would loop a stand-to-cover the character is already in.
  cover.preMovement(.016, {takeCover:true});
  assert.equal(built.pawn.state.actionClipName, null);

  cover.preMovement(.016, {takeCover:true, z:-1});
  assert.equal(cover.inCover(), false, 'pulling off the wall lets go');
  assert.equal(built.named('coverToStand').length, 1, 'leaving cover is animated too');
});

test('low cover asks for its own entry take and settles for the standing one', () => {
  const low = () => coverWorld(1.1);
  const GAME = low();
  const built = coverPawn(GAME, ['coverLow', 'coverHigh']);
  const cover = COVER.create(GAME, built.pawn, {button:'takeCover', reach:1.6});
  built.owner.position.z = 2;
  assert.equal(cover.preMovement(.016, {takeCover:true}), true);
  assert.equal(cover.coverClass(), 'low', 'waist height is low cover');
  assert.equal(built.last().name, 'coverLow', 'and it has its own entry take');

  // With only the high take authored, low cover uses it rather than nothing.
  const fallbackGame = low();
  const fallback = coverPawn(fallbackGame, ['coverHigh']);
  const fallbackCover = COVER.create(fallbackGame, fallback.pawn, {button:'takeCover', reach:1.6});
  fallback.owner.position.z = 2;
  fallbackCover.preMovement(.016, {takeCover:true});
  assert.equal(fallbackCover.coverClass(), 'low');
  assert.equal(fallback.last().name, 'coverHigh');
});

// ================================================================= 07 degrade

test('an unbound slot costs nothing but itself: every action still completes', () => {
  const GAME = fakeGame([boxCollider(0, .45, 1.2, 2, .45, .3)]);
  const built = recordingPawn(GAME, []);
  built.pawn.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
  built.pawn.state.speed = 4;
  const abilities = ABILITIES.create(GAME, built.pawn, {});
  assert.equal(abilities.preMovement(.016, {jump:true}), true);
  let guard = 0;
  while(abilities.isBusy() && guard++ < 400) abilities.preMovement(.016, {});
  assert.ok(guard < 400, 'the vault terminates with no clip anywhere');
  assert.ok(built.owner.position.z > 1.5, 'and lands past the obstacle');
  assert.equal(built.calls.length, 0, 'an unbound slot is never asked for');
});

test('a Pawn that cannot play anything at all is driven without throwing', () => {
  // The Actor rig, a Pawn built before its animation library resolved, and every
  // test double in the repo: none of them carry playAction or an animations table.
  // A missing property in a cosmetic layer once threw every frame and abandoned
  // camera, HUD and animation while input kept working. Not again.
  const GAME = fakeGame([boxCollider(0, .45, 1.2, 2, .45, .3), boxCollider(0, 2.5, -1, 2, 2.5, .3, {climbable:true})]);
  const bare = {
    id:'pawn-bare',
    owner:{position:{x:0, y:0, z:0}, rotation:{x:0, y:0, z:0}, userData:{}, traverse(){}},
    state:{speed:4, grounded:true},
    movementController:MOVEMENT.create(GAME, {}),
    reset(){ return true; },
  };
  bare.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
  const abilities = ABILITIES.create(GAME, bare, {});
  assert.equal(abilities.preMovement(.05, {crouch:true}), false, 'crouching is silent, not broken');
  for(let i = 0; i < 10; i++) abilities.preMovement(.05, {});
  assert.equal(abilities.mode(), 'crouch');
  abilities.preMovement(.05, {crouch:true});
  abilities.preMovement(.016, {jump:true});
  let guard = 0;
  while(abilities.isBusy() && guard++ < 400) abilities.preMovement(.016, {});
  assert.ok(bare.owner.position.z > 1.5, 'and the vault still happens');
  assert.equal(abilities.reset().mode, 'none');

  // The same Pawn through the cover state machine.
  const coverGame = coverWorld(2.2);
  const coverBare = {
    id:'pawn-bare-cover',
    owner:{position:{x:0, y:0, z:2}, rotation:{x:0, y:0, z:0}, userData:{}, traverse(){}},
    state:{speed:0, grounded:true},
    movementController:{options:() => ({radius:.35, height:1.8, walkSpeed:3.1})},
    reset(){ return true; },
  };
  const cover = COVER.create(coverGame, coverBare, {button:'takeCover', reach:1.6, blend:40});
  assert.equal(cover.preMovement(.016, {takeCover:true}), true, 'cover still attaches');
  for(let i = 0; i < 20; i++) cover.preMovement(.016, {takeCover:true, x:1});
  assert.equal(cover.inCover(), true, 'and still hugs and slides along the wall');
  assert.equal(cover.preMovement(.016, {takeCover:true, jump:true}), false);
  assert.equal(cover.inCover(), false, 'and still lets go');
});

console.log('\ncharacter traversal and cover action clip tests passed');
