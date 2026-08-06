/* =========================================================
   LOT KING — Third-person cover system

   Taking cover, shooting from it, and moving along it. One state machine that
   composes onto the same Pawn hooks the traversal abilities use, so cover is a
   thing a Character Pawn CAN do rather than a different kind of Pawn.

   WHAT COVER IS HERE
   Cover is not a marked-up volume an artist places: it is any solid box the
   character can stand against, classified by its height. That is deliberate —
   the level already declares what is solid, and a second, divergent "cover"
   world is how a cover system starts lying about the geometry. The classes
   below are the published shooter metrics (The Level Design Book, quoting
   Uncharted 4): high cover is standing head height at 1.75 m and up, low cover
   is waist height between 1.0 and 1.25 m, and knee height at 0.5 m or less is
   not cover at all — you cannot get behind it.

   WHAT THE PLAYER DOES WITH IT
     attach     push into a piece of cover and press Take Cover
     slide      move along the face; the body stays glued to it
     aim out    high cover leans past the edge, low cover pops up over the top
     blind fire from behind high cover without exposing the head
     detach     pull away from the wall, jump, or press Take Cover again

   The camera is not driven from here. Cover ASKS the shared view rig for a
   shoulder and a lean and lets the rig blend them, so an automatic swap at a
   corner and a manual one on the Swap Shoulder key look identical.

   TAKING COVER IS ANIMATED
   For a long time it was not: this file moved the body against the wall and asked
   for no clip at all, so a character slid into cover standing upright and shuffled
   along it in a walk cycle. The four bundled takes are hooked below — into cover,
   out of cover, and the two shuffles — through the SAME action layer the traversal
   abilities use, because both drive the one one-shot slot the Pawn owns and cannot
   be allowed to disagree about who is holding it. A slot with nothing bound to it
   plays nothing and changes nothing, which is exactly what this file did before.

   HOW THIS FILE IS ORGANISED
     01 helpers        maths
     02 cover classes  the one named height table everything reads
     02b cover clips   which take each part of the stance plays
     03 config         the authored, bindable block
     04 probes         finding cover in the arcade collider world
     05 controller     state machine and per-frame step
     06 attachment     composing onto the Pawn hooks
   ========================================================= */
(function(){
'use strict';

// ==================================================================== 01 helpers

const root = typeof window !== 'undefined' ? window : globalThis;

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function dampAlpha(rate, dt){ return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)); }

// =============================================================== 02 cover classes
//
// The ONE table that decides what a piece of geometry is. Every question the
// rest of the file asks — can I hide behind it, do I lean or pop up, how much
// does it steady the weapon — is answered from a class name, never from a loose
// number compared against a height somewhere in the step function.
//
// Ordered low to high, which is also the order the classifier tests them.

const COVER_CLASSES = Object.freeze({
  low:Object.freeze({
    id:'low',
    minHeight:.85,
    maxHeight:1.45,
    // Getting behind it. A PREFERENCE list: `coverLow` is the take that drops the
    // body behind a waist-high wall and `coverHigh` the one that stands against a
    // tall one, so low cover asks for its own entry first and settles for the
    // standing transition until the low slot is authored. An entry with neither
    // bound plays nothing, and cover still works.
    enterClip:Object.freeze(['coverLow', 'coverHigh']),
    // Firing over the top of low cover. The eye rises, the body does not leave
    // the wall, and the whole silhouette is exposed for as long as it lasts —
    // which is what makes low cover a trade rather than a hiding place.
    fireMode:'pop',
    // How far the eye rises to clear the lip.
    riseHeight:.42,
    // Crouching behind it is what makes it cover at all.
    crouchBehind:true,
    // Weapon steadiness while braced on it, read by the rig's spread ledger.
    brace:1,
  }),
  high:Object.freeze({
    id:'high',
    minHeight:1.6,
    maxHeight:3.2,
    enterClip:Object.freeze(['coverHigh']),
    // Firing past the EDGE of high cover: the body stays hidden and only the
    // shoulder and the weapon come out. This is the Gears of War / Resident
    // Evil 4 Remake shape and the reason high cover is worth walking to.
    fireMode:'lean',
    riseHeight:0,
    crouchBehind:false,
    brace:.8,
  }),
});
// Declared low to high so the classifier can take the first match and a caller
// can present them in a stable order.
const COVER_CLASS_ORDER = Object.freeze(['low', 'high']);

/** The class a solid of this height belongs to, or null when it is not cover.
 *  An unknown NAME throws; an unknown HEIGHT is simply not cover, which is a
 *  different thing and a legitimate answer. */
function coverClassForHeight(height){
  const h = finite(height, 0);
  for(let i = 0; i < COVER_CLASS_ORDER.length; i++){
    const entry = COVER_CLASSES[COVER_CLASS_ORDER[i]];
    if(h >= entry.minHeight && h <= entry.maxHeight) return entry;
  }
  return null;
}
/** Look a class up by name. This is the fallback that THROWS: a typo in an
 *  authored class name must not silently become "low cover somewhere". */
function coverClass(name){
  const key = String(name || '');
  if(COVER_CLASSES[key]) return COVER_CLASSES[key];
  throw new Error('Cover system: unknown cover class "' + key + '"');
}

// ================================================================= 02b cover clips
//
// Leaving cover and shuffling along it are the same movement whichever class the
// wall is, so they live here rather than being duplicated per class. Standing
// still behind cover deliberately has NO entry: the bundled set has no cover idle,
// and re-requesting a stand-to-cover transition once a second to fake one would
// have the character climbing into cover it is already in.

const COVER_CLIPS = Object.freeze({
  exit:Object.freeze(['coverToStand']),
  // Engine convention: +X in the character's own frame is the body's own LEFT, so
  // a positive lateral input shuffles left.
  left:Object.freeze(['coverSneakLeft']),
  right:Object.freeze(['coverSneakRight']),
});

// Cover with no action layer available plays nothing. That is not a failure mode
// to guard against, it is precisely what this file did before the slots existed,
// and a missing animation module must never cost the player the cover mechanic.
const SILENT_ACTIONS = Object.freeze({
  play:() => null,
  hold:() => null,
  release:() => false,
  tick:() => null,
  slotFor:() => null,
  playingSlot:() => null,
  clipSeconds:() => 0,
  heldSlot:() => null,
});

/** The action layer this controller drives, shared with the traversal abilities. */
function actionLayerFor(pawn){
  const abilities = root.LK_RUNTIME_CHARACTER_ABILITIES;
  return abilities && typeof abilities.createActionLayer === 'function'
    ? abilities.createActionLayer(pawn) : SILENT_ACTIONS;
}

// ===================================================================== 03 config

// Which drive channel takes cover. It is a table rather than a free string
// because the channel has to EXIST on the Pawn command object: a typo would
// otherwise produce a cover system that simply never triggers and no way to
// find out why. An unknown name throws.
//
//   crouch     contextual, and the default. Crouch facing cover takes it;
//              crouch anywhere else still ducks, because the press is only
//              claimed when there is actually something to get behind. This is
//              the Gears of War / Resident Evil 4 contextual button, and it
//              needs no new binding in the input pack.
//   takeCover  a dedicated action, once one is bound.
//   dodge / slowWalk / interact   for projects that would rather spend one of
//              those on cover.
const COVER_BUTTONS = Object.freeze({
  crouch:'crouch',
  takeCover:'takeCover',
  dodge:'dodge',
  slowWalk:'slowWalk',
  interact:'interact',
});
function coverButton(name){
  const key = String(name || '');
  if(COVER_BUTTONS[key]) return COVER_BUTTONS[key];
  throw new Error('Cover system: unknown cover button "' + key + '"');
}

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  const fire = src.fire || {};
  return {
    enabled:src.enabled !== false,
    button:coverButton(src.button == null ? 'crouch' : src.button),
    // How far ahead of the character a wall counts as "reachable cover".
    reach:clamp(finite(src.reach, 1.1), .2, 4),
    // How close the body ends up to the face it is hugging.
    hugDistance:clamp(finite(src.hugDistance, .42), .05, 2),
    // Take Cover is a toggle by default: cover is a stance you fight from, not
    // a key you hold for a minute.
    toggle:src.toggle !== false,
    // Attaching without pressing anything, by walking into a wall while
    // aiming. Off by default: automatic cover that grabs the player when they
    // did not ask is the single most complained-about cover-system behaviour.
    autoAttach:src.autoAttach === true,
    // Speed along the face, as a fraction of the walk speed.
    slideSpeed:clamp(finite(src.slideSpeed, .78), .05, 2),
    // How fast the body settles onto the wall and lets go of it.
    blend:clamp(finite(src.blend, 12), 1, 40),
    // Leaving cover by pulling away: how hard the stick has to be pushed off
    // the wall before the character actually lets go.
    detachThreshold:clamp(finite(src.detachThreshold, .6), .05, 1),
    // The camera moves to the shoulder nearest the edge you are about to shoot
    // past, which is the whole reason a cover system needs a shoulder swap.
    autoShoulder:src.autoShoulder !== false,
    fire:{
      // Aiming while in cover exposes the character. `exposure` is how far out
      // of the wall the lean reaches, as a fraction of the rig's lean offset.
      exposure:clamp(finite(fire.exposure, 1), 0, 1),
      // Blind fire: shooting without aiming, from behind high cover. It costs
      // accuracy, which is the entire point.
      blindEnabled:fire.blindEnabled !== false,
      blindSpreadScale:clamp(finite(fire.blindSpreadScale, 3.2), 1, 12),
      // How long the pop-up over low cover lasts before the body drops back.
      popTime:clamp(finite(fire.popTime, .55), .05, 4),
    },
  };
}

// ===================================================================== 04 probes
//
// The obstacle world is the arcade box collider list — the same list the
// movement controller resolves against, so a wall is cover exactly when it is
// solid and there is no second collision world to disagree with.

function boxTop(col){ return col && col.hy != null && col.y != null ? col.y + col.hy : null; }
function boxBottom(col){ return col && col.hy != null && col.y != null ? col.y - col.hy : null; }

/** Every solid box whose footprint is within `radius` of (x, z). */
function boxesNear(GAME, x, z, radius){
  const list = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
  if(!Array.isArray(list)) return [];
  const out = [];
  for(let i = 0; i < list.length; i++){
    const col = list[i];
    if(!col || col.enabled === false || col.compoundRoot || col.horizontalSurface || col.cover === false) continue;
    if(Math.abs(x - col.x) > col.hx + radius) continue;
    if(Math.abs(z - col.z) > col.hz + radius) continue;
    out.push(col);
  }
  return out;
}

/** Which face of an axis-aligned box a point is outside of, as an outward unit
 *  normal. Cover only ever hugs a face, so the normal is one of four. */
function faceNormal(col, x, z){
  const dx = (x - col.x) / Math.max(.001, col.hx);
  const dz = (z - col.z) / Math.max(.001, col.hz);
  if(Math.abs(dx) >= Math.abs(dz)) return {x:dx >= 0 ? 1 : -1, z:0};
  return {x:0, z:dz >= 0 ? 1 : -1};
}

/** The best piece of cover in front of the character, or null.
 *  `feetY` is the ground the character is standing on: cover height is measured
 *  from the FEET, so the same crate is high cover from a ditch and no cover at
 *  all from a rooftop. */
function probeCover(GAME, position, headingX, headingZ, feetY, reach, radius){
  const x = finite(position.x, 0) + headingX * reach;
  const z = finite(position.z, 0) + headingZ * reach;
  const boxes = boxesNear(GAME, x, z, finite(radius, .35));
  let best = null;
  for(let i = 0; i < boxes.length; i++){
    const col = boxes[i];
    const top = boxTop(col);
    const bottom = boxBottom(col);
    if(top == null) continue;
    // A ledge that starts above the head is a roof, not cover.
    if(bottom != null && bottom > feetY + .4) continue;
    const height = top - feetY;
    const entry = coverClassForHeight(height);
    if(!entry) continue;
    if(best && best.height >= height) continue;
    const normal = faceNormal(col, finite(position.x, 0), finite(position.z, 0));
    best = {collider:col, cover:entry, height, top, normal};
  }
  return best;
}

/** Is the face still there `offset` metres along it? Sliding off the end of a
 *  wall has to release the character rather than leave them hugging air. */
function faceContinues(GAME, cover, x, z, feetY, radius){
  const boxes = boxesNear(GAME, x, z, finite(radius, .35));
  for(let i = 0; i < boxes.length; i++){
    const top = boxTop(boxes[i]);
    if(top == null) continue;
    const entry = coverClassForHeight(top - feetY);
    if(entry && entry.id === cover.cover.id) return true;
  }
  return false;
}

// ================================================================= 05 controller

function create(GAME, pawn, source){
  const config = normalizeConfig(source);
  const state = {
    mode:'none',          // 'none' | 'attached'
    cover:null,           // the probe result the character is hugging
    blend:0,              // 0 free .. 1 fully against the wall
    takePressed:false,
    aimPressed:false,
    popTimer:0,           // low cover: how long the body stays up
    exposed:0,            // 0 hidden .. 1 leaning or popped out
    edgeSide:0,           // -1 nearest the left edge, +1 the right, 0 mid-face
    blindFiring:false,
  };
  const actions = actionLayerFor(pawn);

  function owner(){ return pawn && pawn.owner || null; }
  function rig(){ return pawn && pawn.firstPerson || null; }
  function abilities(){ return pawn && pawn.abilities || null; }
  function movementOptions(){
    const controller = pawn && pawn.movementController;
    return controller ? controller.options() : {radius:.35, height:1.8};
  }

  function emit(type, payload){
    if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
    window.dispatchEvent(new CustomEvent('lk-pawn-event',
      {detail:Object.assign({type, pawnId:pawn && pawn.id || null}, payload || {})}));
  }

  function heading(){
    const node = owner();
    return node && node.rotation ? finite(node.rotation.y, 0) : 0;
  }
  // Engine convention: a heading of `yaw` faces (sin yaw, 0, cos yaw).
  function forwardX(){ return Math.sin(heading()); }
  function forwardZ(){ return Math.cos(heading()); }

  // --- attach / detach ----------------------------------------------------

  function findCover(){
    const node = owner();
    if(!node || !node.position) return null;
    const opts = movementOptions();
    return probeCover(GAME, node.position, forwardX(), forwardZ(),
      finite(node.position.y, 0), config.reach, finite(opts.radius, .35) * .8);
  }

  function attach(found){
    const cover = found || findCover();
    if(!cover) return false;
    state.cover = cover;
    state.mode = 'attached';
    state.popTimer = 0;
    state.blindFiring = false;
    // A traversal must not fire out of a cover stance: the ability set is told
    // to stand down rather than being fought for the transform every frame.
    const ability = abilities();
    if(ability && ability.suspend) ability.suspend(true);
    // Getting behind cover is a TRANSITION: one take, played once, ending in the
    // stance. It has to come after the ability set has stood down, or the pose that
    // set was holding is released on top of the transition that replaces it.
    actions.play(cover.cover.enterClip, {fadeIn:.08, fadeOut:.18});
    if(pawn && pawn.state){ pawn.state.cover = cover.cover.id; pawn.state.coverBrace = 0; }
    emit('OnCharacterCoverEntered', {cover:cover.cover.id, height:cover.height});
    return true;
  }

  function detach(reason){
    if(state.mode !== 'attached') return false;
    const cover = state.cover;
    state.mode = 'none';
    state.cover = null;
    state.popTimer = 0;
    state.exposed = 0;
    state.blindFiring = false;
    const ability = abilities();
    if(ability && ability.suspend) ability.suspend(false);
    // Let go of the shuffle before playing the stand-up, so the two do not spend a
    // frame each cancelling the other on the one slot they share.
    actions.release();
    actions.play(COVER_CLIPS.exit, {fadeIn:.08, fadeOut:.2});
    if(pawn && pawn.state){ pawn.state.cover = null; pawn.state.coverBrace = 0; pawn.state.coverPose = null; }
    const active = rig();
    if(active && active.setCoverLean) active.setCoverLean(0);
    emit('OnCharacterCoverExited', {cover:cover ? cover.cover.id : null, reason:reason || 'released'});
    return true;
  }

  // --- frame --------------------------------------------------------------

  // Runs before the movement controller, like the ability set does. Returning
  // true means cover owns the transform this frame.
  function preMovement(dt, move){
    if(!config.enabled) return false;
    const h = clamp(finite(dt, .016), .0001, .1);
    const input = move || {};
    actions.tick(h);

    // Take Cover. Edge-triggered: the drive command reports a held button for
    // as long as it is down.
    const takeDown = input[config.button] === true;
    const takePressed = takeDown && !state.takePressed;
    state.takePressed = takeDown;

    if(state.mode !== 'attached'){
      state.blend += (0 - state.blend) * dampAlpha(config.blend, h);
      // The press is only CLAIMED when there is something to get behind, so a
      // contextual button keeps its other meaning everywhere else in the level.
      if(takePressed){
        const found = findCover();
        if(found) return attach(found);
      }
      if(config.autoAttach && input.aim === true && forwardInput(input) > .5) return attach(null);
      return false;
    }

    // Toggling off, jumping out, or pulling away from the wall all release it.
    if(config.toggle && takePressed) return !detach('released');
    if(input.jump === true) return !detach('jumped');
    if(!config.toggle && !takeDown) return !detach('released');
    if(awayFromWall(input) > config.detachThreshold) return !detach('stepped-out');

    return stepAttached(h, input);
  }

  function forwardInput(input){ return Math.max(0, finite(input.z, 0)); }

  /** How hard the stick is being pushed AWAY from the wall the character is on.
   *  Movement input is in the character's own frame, and the character faces
   *  the wall, so pulling back is simply -z. */
  function awayFromWall(input){ return Math.max(0, -finite(input.z, 0)); }

  function stepAttached(dt, input){
    const node = owner();
    const cover = state.cover;
    if(!node || !cover) return !detach('lost');
    state.blend += (1 - state.blend) * dampAlpha(config.blend, dt);

    const opts = movementOptions();
    const radius = finite(opts.radius, .35);
    const feetY = finite(node.position.y, 0);

    // --- slide along the face ---------------------------------------------
    // The face normal points out of the wall; along-face is its perpendicular.
    const alongX = -cover.normal.z, alongZ = cover.normal.x;
    const side = clamp(finite(input.x, 0), -1, 1);
    if(side !== 0){
      const walk = finite(opts.walkSpeed, 1.9) * config.slideSpeed;
      const step = side * walk * dt;
      const nx = node.position.x + alongX * step;
      const nz = node.position.z + alongZ * step;
      // Sliding off the end of a wall must stop at the edge rather than leave
      // the character hugging thin air.
      // The normal points out of the wall, so the probe has to step back along
      // it to land on the face. Adding it would sample the open air the body is
      // already standing in, and the slide would stall on the first frame.
      if(faceContinues(GAME, cover, nx - cover.normal.x * config.hugDistance,
        nz - cover.normal.z * config.hugDistance, feetY, radius)){
        node.position.x = nx;
        node.position.z = nz;
        state.edgeSide = 0;
      } else state.edgeSide = side >= 0 ? 1 : -1;
    } else state.edgeSide = 0;

    // Shuffling along the face is a POSE held for as long as the stick is pushed.
    // Standing still lets it go and leaves the body to the entry transition and
    // then to the locomotion idle: there is no cover idle take to hold.
    if(side > .1) actions.hold(COVER_CLIPS.left);
    else if(side < -.1) actions.hold(COVER_CLIPS.right);
    else actions.release();

    // --- hug the wall ------------------------------------------------------
    // The body is held at a fixed distance from the face, so the silhouette the
    // enemy sees is the same wherever along it the player stands.
    const col = cover.collider;
    const wallX = col.x + cover.normal.x * (col.hx + config.hugDistance);
    const wallZ = col.z + cover.normal.z * (col.hz + config.hugDistance);
    if(cover.normal.x !== 0) node.position.x += (wallX - node.position.x) * dampAlpha(config.blend, dt);
    if(cover.normal.z !== 0) node.position.z += (wallZ - node.position.z) * dampAlpha(config.blend, dt);

    // --- stance ------------------------------------------------------------
    // Low cover means crouching behind it; high cover is stood against.
    const active = rig();
    const aiming = input.aim === true;
    const firing = input.fire === true;
    // Blind fire: pulling the trigger from behind high cover without aiming.
    state.blindFiring = config.fire.blindEnabled && firing && !aiming && cover.cover.fireMode === 'lean';

    if(cover.cover.fireMode === 'pop'){
      // Popping up over low cover is a timed exposure, not a held state: it is
      // what makes low cover a rhythm instead of a place to live.
      if(aiming) state.popTimer = config.fire.popTime;
      else state.popTimer = Math.max(0, state.popTimer - dt);
      state.exposed += ((state.popTimer > 0 ? 1 : 0) - state.exposed) * dampAlpha(10, dt);
      if(active && active.setEyeOffset){
        const crouched = cover.cover.crouchBehind ? -cover.cover.riseHeight : 0;
        active.setEyeOffset(crouched + cover.cover.riseHeight * state.exposed);
      }
      if(active && active.setCoverLean) active.setCoverLean(0);
    } else {
      // High cover leans out past the edge the player is nearest to.
      const want = aiming ? config.fire.exposure : 0;
      state.exposed += (want - state.exposed) * dampAlpha(10, dt);
      const outSide = state.edgeSide !== 0 ? state.edgeSide : (active && active.weaponSide ? active.weaponSide() : 1);
      if(active && active.setCoverLean) active.setCoverLean(state.exposed * outSide);
      if(config.autoShoulder && active && active.setShoulder && state.edgeSide !== 0) active.setShoulder(state.edgeSide);
    }

    // Braced on cover: the rig's spread ledger reads this and steadies the
    // weapon for it. Leaning out gives the bonus up, which is the trade.
    if(pawn && pawn.state){
      pawn.state.cover = cover.cover.id;
      // What the stance is holding, published for the same reason the brace is:
      // one ledger the rig, the debugger and anything else sharing the slot read.
      pawn.state.coverPose = actions.heldSlot();
      pawn.state.coverBrace = cover.cover.brace * state.blend * (1 - state.exposed);
      pawn.state.coverExposed = state.exposed;
      pawn.state.speed = Math.abs(side) * finite(opts.walkSpeed, 1.9) * config.slideSpeed;
      pawn.state.moving = Math.abs(side) > .05;
    }
    return true;   // cover owns the transform
  }

  function afterMovement(){
    if(pawn && pawn.state) pawn.state.coverMode = state.mode;
    return state;
  }

  function reset(){
    detach('reset');
    state.blend = 0;
    state.exposed = 0;
    state.edgeSide = 0;
    state.takePressed = false;
    return state;
  }

  function applyBinding(path, value){
    const key = String(path || '');
    if(key.indexOf('cover.') !== 0) return false;
    const parts = key.slice(6).split('.');
    if(parts.length === 1){
      const patch = {}; patch[parts[0]] = value;
      Object.assign(config, normalizeConfig(Object.assign({}, config, patch)));
      return true;
    }
    const group = config[parts[0]];
    if(!group) return false;
    const patch = {}; patch[parts[0]] = Object.assign({}, group);
    patch[parts[0]][parts[1]] = value;
    Object.assign(config, normalizeConfig(Object.assign({}, config, patch)));
    return true;
  }

  return Object.freeze({
    COVER_CLASSES,
    config:() => config,
    state,
    preMovement,
    afterMovement,
    reset,
    applyBinding,
    attach,
    detach,
    findCover,
    inCover:() => state.mode === 'attached',
    coverClass:() => (state.cover ? state.cover.cover.id : null),
    exposure:() => state.exposed,
    isBlindFiring:() => state.blindFiring,
    // How much the current stance steadies the weapon, for the rig's spread
    // ledger and for anything that wants to draw it.
    brace:() => (state.cover ? state.cover.cover.brace * state.blend * (1 - state.exposed) : 0),
  });
}

// ================================================================ 06 attachment
//
// Attach this AFTER the traversal abilities and BEFORE the view rig, so the
// composed order is: cover may take the frame, abilities may take the frame,
// and the rig's view/weapon step runs first either way — aiming keeps working
// while something else owns the body.

function attach(GAME, pawn, source){
  if(!pawn) return null;
  const controller = create(GAME, pawn, source);
  const previousBefore = pawn.beforeMovementStep;
  const previousAfter = pawn.afterMovementStep;
  pawn.beforeMovementStep = function(dt, move){
    if(controller.preMovement(dt, move) === true) return true;
    return typeof previousBefore === 'function' ? previousBefore.call(this, dt, move) : false;
  };
  pawn.afterMovementStep = function(dt, move, snapshot){
    controller.afterMovement(dt, move, snapshot);
    if(typeof previousAfter === 'function') previousAfter.call(this, dt, move, snapshot);
  };
  const previousReset = pawn.reset.bind(pawn);
  pawn.reset = function(){ const done = previousReset(); controller.reset(); return done; };
  pawn.cover = controller;
  return controller;
}

root.LK_RUNTIME_CHARACTER_COVER = Object.freeze({
  COVER_CLASSES,
  COVER_CLASS_ORDER,
  COVER_CLIPS,
  COVER_BUTTONS,
  coverButton,
  coverClass,
  coverClassForHeight,
  normalizeConfig,
  probeCover,
  faceNormal,
  create,
  attach,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_CHARACTER_COVER;
})();
