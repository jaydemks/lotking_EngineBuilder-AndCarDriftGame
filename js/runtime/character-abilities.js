/* =========================================================
   LOT KING — Character traversal abilities (GASP-style)

   Everything a humanoid Pawn can do beyond walk/run/jump, in ONE state
   machine shared by first and third person:

     crouch   hold to lower the body, slower and shorter
     walk     hold to move deliberately (quiet, precise)
     slide    double-tap Dodge at speed: a timed slide that keeps momentum
     roll     double-tap Dodge at a walk: a forward roll that ends standing
     vault    hop OVER a low obstacle and land on the far side
     mantle   pull UP onto a ledge and stand on it
     climb    ladders and climbable surfaces (free vertical movement)
     hang     catch a ledge in mid-air, shuffle along it and pull up

   The module never renders and never touches the camera. It owns a small
   amount of authority over the Pawn's transform: while a traversal is playing
   (vault / mantle / climb / hang) it drives `owner.position` directly and tells the
   Pawn to skip ordinary locomotion for that frame. Everything else is a speed
   scale layered on top of the normal movement controller.

   Geometry queries go through the arcade box colliders the movement controller
   already resolves against, so an obstacle is vaultable exactly when it is
   solid — there is no second, divergent collision world.

   Removing this script removes traversal and nothing else: the Pawn keeps
   walking, running and jumping.
   ========================================================= */
(function(){
'use strict';

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function ease(t){ return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

const STATES = Object.freeze(['none', 'crouch', 'slide', 'roll', 'vault', 'mantle', 'climb', 'hang']);

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  const crouch = src.crouch || {};
  const walk = src.walk || {};
  const slide = src.slide || {};
  const vault = src.vault || {};
  const mantle = src.mantle || {};
  const climb = src.climb || {};
  const hang = src.hang || {};
  return {
    enabled:src.enabled !== false,
    crouch:{
      enabled:crouch.enabled !== false,
      // Toggle by default: crouching is a stance you stay in while you move
      // and shoot, not a key you hold down for a minute. Set false for hold.
      toggle:crouch.toggle !== false,
      heightScale:clamp(finite(crouch.heightScale, .55), .3, 1),
      speedScale:clamp(finite(crouch.speedScale, .42), .05, 1),
      blend:clamp(finite(crouch.blend, 11), 1, 40),
    },
    walk:{
      enabled:walk.enabled !== false,
      speedScale:clamp(finite(walk.speedScale, .33), .05, 1),
    },
    slide:{
      enabled:slide.enabled !== false,
      // Double-tapping the Dodge key, not Crouch. Crouch is held constantly to
      // move quietly, so binding the slide to it fires the move every time the
      // player ducks at speed — including when the crouch was forced by a low
      // ceiling, which made stairs launch a slide on their own.
      doubleTapWindow:clamp(finite(slide.doubleTapWindow, .32), .08, 1),
      // Above this the dodge is a slide; below it, a roll. One gesture, two
      // moves, chosen by what the character is already doing.
      minSpeed:clamp(finite(slide.minSpeed, 4.2), .5, 20),
      rollDuration:clamp(finite(slide.rollDuration, .62), .1, 3),
      rollSpeed:clamp(finite(slide.rollSpeed, 4.6), .5, 16),
      duration:clamp(finite(slide.duration, .85), .1, 4),
      boost:clamp(finite(slide.boost, 1.35), 1, 3),
      friction:clamp(finite(slide.friction, 2.6), .1, 20),
      cooldown:clamp(finite(slide.cooldown, .6), 0, 5),
    },
    vault:{
      enabled:vault.enabled !== false,
      minHeight:clamp(finite(vault.minHeight, .5), .1, 3),
      maxHeight:clamp(finite(vault.maxHeight, 1.25), .2, 4),
      reach:clamp(finite(vault.reach, .95), .2, 3),
      // How far past the obstacle the character must find floor to go OVER it
      // rather than climb ON it.
      clearance:clamp(finite(vault.clearance, 1.15), .3, 4),
      duration:clamp(finite(vault.duration, .52), .1, 2),
      minSpeed:clamp(finite(vault.minSpeed, .8), 0, 10),
    },
    mantle:{
      enabled:mantle.enabled !== false,
      maxHeight:clamp(finite(mantle.maxHeight, 2.35), .3, 6),
      reach:clamp(finite(mantle.reach, .95), .2, 3),
      duration:clamp(finite(mantle.duration, .78), .1, 3),
    },
    climb:{
      enabled:climb.enabled !== false,
      speed:clamp(finite(climb.speed, 2.4), .2, 10),
      // Lateral shuffle along a climbable wall; ladders keep it at 0.
      strafe:clamp(finite(climb.strafe, 1.4), 0, 6),
      reach:clamp(finite(climb.reach, .85), .2, 3),
      exitBoost:clamp(finite(climb.exitBoost, 1), 0, 4),
    },
    // Ledge hang: catching an edge that is too high to mantle from the ground,
    // hanging from it, shuffling along it and pulling up. The Assassin's Creed
    // move, and the reason a jump at a wall is worth trying.
    hang:{
      enabled:hang.enabled !== false,
      reach:clamp(finite(hang.reach, 1), .2, 3),
      // How far above the feet the edge has to be. Below this the character
      // mantles from the ground instead; above it the edge is out of reach.
      minHeight:clamp(finite(hang.minHeight, 1.1), .3, 4),
      maxHeight:clamp(finite(hang.maxHeight, 2.6), .5, 8),
      // Distance from the edge down to the feet while hanging.
      drop:clamp(finite(hang.drop, 1.85), .3, 4),
      shimmy:clamp(finite(hang.shimmy, 1.5), 0, 6),
      // Pulling up out of a hang is slower than a standing mantle.
      pullUpTime:clamp(finite(hang.pullUpTime, .72), .1, 3),
    },
  };
}

// ------------------------------------------------ geometry probes
//
// The obstacle world is the arcade box collider list. A box is a candidate
// ledge when its top is above the feet, below the ability ceiling, and the
// character is pointed at its footprint.

function boxTop(col){ return col && col.hy != null && col.y != null ? col.y + col.hy : null; }

function isClimbable(col){
  if(!col) return false;
  if(col.climbable === true) return true;
  const data = col.owner && col.owner.userData;
  return !!(data && (data.climbable === true || data.climbSurface === true));
}

function boxesNear(GAME, x, z, radius){
  const list = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
  if(!Array.isArray(list)) return [];
  const out = [];
  for(let i = 0; i < list.length; i++){
    const col = list[i];
    if(!col || col.enabled === false) continue;
    if(Math.abs(x - col.x) > col.hx + radius) continue;
    if(Math.abs(z - col.z) > col.hz + radius) continue;
    out.push(col);
  }
  return out;
}

// Highest solid top at an XZ position, ignoring anything above `ceiling`.
function topAt(GAME, x, z, ceiling, radius){
  const list = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
  let best = null;
  if(!Array.isArray(list)) return best;
  for(let i = 0; i < list.length; i++){
    const col = list[i];
    if(!col || col.enabled === false || col.walkable === false) continue;
    if(Math.abs(x - col.x) > col.hx + (radius || 0)) continue;
    if(Math.abs(z - col.z) > col.hz + (radius || 0)) continue;
    const top = boxTop(col);
    if(top == null || top > ceiling) continue;
    if(best == null || top > best.top) best = {top, collider:col};
  }
  return best;
}

// ------------------------------------------------ controller

function create(GAME, pawn, source){
  const config = normalizeConfig(source);
  const state = {
    mode:'none',
    crouchBlend:0,          // 0 standing .. 1 fully crouched
    crouchHeld:false,
    crouchLatched:false,
    slideTimer:0,
    slideCooldown:0,
    slideSpeed:0,
    slideDirX:0, slideDirZ:0,
    dodgeHeld:false,
    dodgeTapAge:99,         // seconds since the last Dodge press
    rollTimer:0,
    rollSpin:0,
    traversal:null,         // active vault / mantle tween
    climb:null,             // {volume, top, normalX, normalZ, ladder}
    hang:null,              // {top} while hanging from a ledge
    lastGrounded:true,
    baseHeight:null,
    baseEyeHeight:null,
    blockedTimer:0,
  };

  function owner(){ return pawn && pawn.owner || null; }
  function movement(){ return pawn && pawn.movementController || null; }
  function options(){ const m = movement(); return m ? m.options() : {radius:.35, height:1.8, stepHeight:.55}; }

  function emit(type, payload){
    if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
    window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type, pawnId:pawn && pawn.id || null}, payload || {})}));
  }

  function heading(){
    const node = owner();
    return node && node.rotation ? finite(node.rotation.y, 0) : 0;
  }
  // Engine convention: a heading of `yaw` faces (sin yaw, 0, cos yaw).
  function forwardX(){ return Math.sin(heading()); }
  function forwardZ(){ return Math.cos(heading()); }

  // --- crouch / walk ------------------------------------------------------

  // The standing height is captured once, so repeated crouch cycles cannot
  // ratchet the body shorter and shorter.
  function captureBaseHeight(){
    if(state.baseHeight != null) return;
    state.baseHeight = finite(options().height, 1.8);
    const rig = pawn && pawn.firstPerson;
    state.baseEyeHeight = rig && rig.config ? finite(rig.config().eyeHeight, 1.62) : 1.62;
  }

  // Standing back up must not push the head through a ceiling: the crouch is
  // held until the space above the character is actually clear.
  //
  // "Overhead" has to mean ABOVE THE BODY, not merely intersecting it. Testing
  // for any box between the feet and the head also matches the next tread of a
  // staircase, so running up stairs forced a permanent crouch — and, while the
  // slide was still bound to crouch, launched a slide on every step. A ceiling
  // is a box whose UNDERSIDE is above waist height and below standing height.
  function headroomBlocked(){
    const node = owner();
    if(!node || !node.position) return false;
    const opts = options();
    const height = finite(state.baseHeight, opts.height);
    const standTop = node.position.y + height;
    const waist = node.position.y + height * .55;
    const boxes = boxesNear(GAME, node.position.x, node.position.z, opts.radius * .8);
    for(let i = 0; i < boxes.length; i++){
      const col = boxes[i];
      if(col.hy == null || col.y == null) continue;
      const bottom = col.y - col.hy;
      if(bottom > waist && bottom < standTop - .05) return true;
    }
    return false;
  }

  function applyCrouchBlend(dt){
    captureBaseHeight();
    const wantCrouch = state.mode === 'crouch' || state.mode === 'slide' || state.mode === 'roll';
    const target = wantCrouch ? 1 : 0;
    const alpha = 1 - Math.exp(-config.crouch.blend * dt);
    state.crouchBlend += (target - state.crouchBlend) * alpha;
    if(state.crouchBlend < .002) state.crouchBlend = 0;
    if(state.crouchBlend > .998) state.crouchBlend = 1;
    const scale = 1 - (1 - config.crouch.heightScale) * state.crouchBlend;
    const move = movement();
    if(move) move.configure({height:finite(state.baseHeight, 1.8) * scale});
    // The eye follows the body so first person actually ducks, and the third
    // person camera pivot follows through the same number.
    const rig = pawn && pawn.firstPerson;
    if(rig && rig.setEyeOffset) rig.setEyeOffset(-(1 - scale) * finite(state.baseEyeHeight, 1.62));
    if(pawn && pawn.state) pawn.state.crouch = state.crouchBlend;
  }

  // --- traversal detection ------------------------------------------------

  // Looks for a ledge straight ahead and classifies it. Returns null when the
  // way is clear or the obstacle is too tall to deal with.
  function probeLedge(){
    const node = owner();
    if(!node || !node.position) return null;
    const opts = options();
    const feet = node.position.y;
    const fx = forwardX(), fz = forwardZ();
    const ceiling = feet + Math.max(config.vault.maxHeight, config.mantle.maxHeight);
    const reach = Math.max(config.vault.reach, config.mantle.reach);
    const ahead = topAt(GAME, node.position.x + fx * reach, node.position.z + fz * reach, ceiling, opts.radius * .6);
    if(!ahead) return null;
    const rise = ahead.top - feet;
    // Anything the movement controller already steps over is not a traversal.
    if(rise <= finite(opts.stepHeight, .55) + .02) return null;

    // Landing test: is there floor just past the obstacle at roughly its own
    // height? If so the character goes OVER it, otherwise it climbs ON it.
    const landX = node.position.x + fx * (reach + config.vault.clearance);
    const landZ = node.position.z + fz * (reach + config.vault.clearance);
    const landing = topAt(GAME, landX, landZ, ahead.top + .05, opts.radius * .6);
    const landY = landing ? landing.top : groundBelow(landX, landZ, feet);
    const canVault = config.vault.enabled && rise >= config.vault.minHeight && rise <= config.vault.maxHeight &&
      landY != null && landY <= ahead.top - .12;
    if(canVault) return {kind:'vault', top:ahead.top, landY, x:landX, z:landZ, rise};
    if(config.mantle.enabled && rise <= config.mantle.maxHeight){
      const standX = node.position.x + fx * (reach + opts.radius + .18);
      const standZ = node.position.z + fz * (reach + opts.radius + .18);
      const surface = topAt(GAME, standX, standZ, ahead.top + .06, opts.radius * .6);
      // A ledge is only mantleable when its top is a real standing surface.
      if(surface && Math.abs(surface.top - ahead.top) < .25){
        return {kind:'mantle', top:ahead.top, landY:ahead.top, x:standX, z:standZ, rise};
      }
    }
    return null;
  }

  function groundBelow(x, z, feet){
    const world = GAME && GAME.world;
    let base = 0;
    if(world && typeof world.characterGroundHeight === 'function') base = finite(world.characterGroundHeight(x, z), 0);
    const stacked = topAt(GAME, x, z, feet + .05, options().radius * .6);
    return stacked ? Math.max(base, stacked.top) : base;
  }

  // An edge above the head that the character can catch in mid-air. It is the
  // same query as probeLedge, only looking HIGHER: what makes a ledge a hang
  // rather than a mantle is simply that the feet cannot reach it.
  function probeHangLedge(offsetX, offsetZ){
    if(!config.hang.enabled) return null;
    const node = owner();
    if(!node || !node.position) return null;
    const opts = options();
    const feet = node.position.y;
    const fx = forwardX(), fz = forwardZ();
    const x = node.position.x + finite(offsetX, 0) + fx * config.hang.reach;
    const z = node.position.z + finite(offsetZ, 0) + fz * config.hang.reach;
    const found = topAt(GAME, x, z, feet + config.hang.maxHeight, opts.radius * .6);
    if(!found || found.top < feet + config.hang.minHeight) return null;
    // The edge is only a ledge if there is somewhere to pull up ONTO.
    const standX = x + fx * (opts.radius + .2);
    const standZ = z + fz * (opts.radius + .2);
    const surface = topAt(GAME, standX, standZ, found.top + .06, opts.radius * .6);
    if(!surface || Math.abs(surface.top - found.top) > .25) return null;
    return {top:found.top, x:standX, z:standZ, collider:found.collider};
  }

  function beginHang(ledge){
    const node = owner();
    if(!node || !ledge) return false;
    state.hang = ledge;
    state.mode = 'hang';
    const move = movement();
    if(move) move.reset();
    node.position.y = ledge.top - config.hang.drop;
    if(pawn && pawn.state){ pawn.state.hanging = true; pawn.state.speed = 0; pawn.state.moving = false; }
    playAction('hang');
    emit('OnCharacterLedgeGrabbed', {top:ledge.top});
    return true;
  }

  function releaseHang(reason){
    if(state.mode !== 'hang') return false;
    state.hang = null;
    state.mode = 'none';
    if(pawn && pawn.state) pawn.state.hanging = false;
    emit('OnCharacterLedgeReleased', {reason:reason || 'dropped'});
    return true;
  }

  // Pulling up is an ordinary mantle onto the edge already found, so the pose,
  // the arc and the landing are the same code the standing mantle uses.
  function pullUp(){
    const ledge = state.hang;
    if(!ledge) return false;
    state.hang = null;
    if(pawn && pawn.state) pawn.state.hanging = false;
    const node = owner();
    const rise = ledge.top - (node ? node.position.y : ledge.top);
    const started = beginTraversal({kind:'mantle', top:ledge.top, landY:ledge.top, x:ledge.x, z:ledge.z, rise});
    if(started && state.traversal) state.traversal.duration = config.hang.pullUpTime;
    return started;
  }

  function stepHang(dt, move){
    const node = owner();
    const ledge = state.hang;
    if(!node || !ledge) return false;
    const input = move || {};
    if(input.jump === true || finite(input.z, 0) > .5) return pullUp() ? true : !releaseHang('failed');
    if(input.crouch === true) return !releaseHang('dropped');

    // Shimmy sideways, but only onto edge that actually continues: stepping off
    // the end of a ledge into thin air is the classic ledge-hang bug.
    const side = clamp(finite(input.x, 0), -1, 1);
    if(side !== 0 && config.hang.shimmy > 0){
      const step = side * config.hang.shimmy * dt;
      const dx = Math.cos(heading()) * step;
      const dz = -Math.sin(heading()) * step;
      const ahead = probeHangLedge(dx, dz);
      if(ahead && Math.abs(ahead.top - ledge.top) < .25){
        node.position.x += dx;
        node.position.z += dz;
        ledge.x += dx;
        ledge.z += dz;
      }
    }
    node.position.y = ledge.top - config.hang.drop;
    if(pawn && pawn.state){ pawn.state.speed = Math.abs(side) * config.hang.shimmy; pawn.state.moving = Math.abs(side) > .1; }
    return true;
  }

  function probeClimbSurface(){
    if(!config.climb.enabled) return null;
    const node = owner();
    if(!node || !node.position) return null;
    const opts = options();
    const fx = forwardX(), fz = forwardZ();
    const x = node.position.x + fx * config.climb.reach;
    const z = node.position.z + fz * config.climb.reach;
    const boxes = boxesNear(GAME, x, z, opts.radius * .5);
    for(let i = 0; i < boxes.length; i++){
      const col = boxes[i];
      if(!isClimbable(col)) continue;
      const top = boxTop(col);
      if(top == null || top <= node.position.y + .2) continue;
      return {collider:col, top, ladder:false, x:col.x, z:col.z};
    }
    return null;
  }

  // --- traversal playback --------------------------------------------------

  function beginTraversal(ledge){
    const node = owner();
    if(!node || !ledge) return false;
    const duration = ledge.kind === 'vault' ? config.vault.duration : config.mantle.duration;
    state.mode = ledge.kind;
    state.traversal = {
      kind:ledge.kind,
      time:0,
      duration,
      fromX:node.position.x, fromY:node.position.y, fromZ:node.position.z,
      toX:ledge.x, toY:ledge.landY, toZ:ledge.z,
      peak:Math.max(ledge.top, ledge.landY, node.position.y) + (ledge.kind === 'vault' ? .28 : .16),
    };
    const move = movement();
    if(move) move.reset();
    playAction(ledge.kind);
    emit(ledge.kind === 'vault' ? 'OnCharacterVault' : 'OnCharacterMantle', {height:ledge.rise});
    return true;
  }

  // Traversals are position tweens, so they read the same in first and third
  // person and never fight the collision solver: collisions are simply not
  // consulted while one plays.
  function stepTraversal(dt){
    const tween = state.traversal;
    const node = owner();
    if(!tween || !node) return false;
    tween.time += dt;
    const t = clamp(tween.time / tween.duration, 0, 1);
    const k = ease(t);
    node.position.x = tween.fromX + (tween.toX - tween.fromX) * k;
    node.position.z = tween.fromZ + (tween.toZ - tween.fromZ) * k;
    // Arc: rise to the ledge in the first half, settle onto the landing in the
    // second. A straight lerp would clip the character through the obstacle.
    const up = tween.fromY + (tween.peak - tween.fromY) * ease(clamp(t * 2, 0, 1));
    const down = tween.peak + (tween.toY - tween.peak) * ease(clamp(t * 2 - 1, 0, 1));
    node.position.y = t < .5 ? up : down;
    if(pawn && pawn.state){ pawn.state.traversal = tween.kind; pawn.state.traversalTime = t; }
    if(t < 1) return true;
    state.traversal = null;
    state.mode = 'none';
    if(pawn && pawn.state){ pawn.state.traversal = null; pawn.state.traversalTime = 0; }
    emit('OnCharacterTraversalFinished', {kind:tween.kind});
    return false;
  }

  function playAction(name){
    if(!pawn || typeof pawn.playAction !== 'function') return;
    const clips = pawn.config && pawn.config.animations;
    if(clips && clips[name]) pawn.playAction(name, {fadeIn:.06, fadeOut:.12});
  }

  // --- climbing ------------------------------------------------------------

  function beginClimb(surface){
    if(!config.climb.enabled || !surface) return false;
    state.climb = surface;
    state.mode = 'climb';
    const move = movement();
    if(move) move.reset();
    if(pawn && pawn.state) pawn.state.climbing = true;
    playAction('climb');
    emit('OnCharacterClimbStarted', {ladder:surface.ladder === true});
    return true;
  }

  function endClimb(reason){
    if(state.mode !== 'climb') return false;
    state.climb = null;
    state.mode = 'none';
    if(pawn && pawn.state) pawn.state.climbing = false;
    emit('OnCharacterClimbFinished', {reason:reason || 'released'});
    return true;
  }

  function stepClimb(dt, move){
    const node = owner();
    const surface = state.climb;
    if(!node || !surface) return false;
    const up = clamp(finite(move.z, 0), -1, 1);
    const side = clamp(finite(move.x, 0), -1, 1);
    node.position.y += up * config.climb.speed * dt;
    if(!surface.ladder && config.climb.strafe > 0){
      // Shuffle along the wall, perpendicular to the facing.
      node.position.x += Math.cos(heading()) * side * config.climb.strafe * dt;
      node.position.z += -Math.sin(heading()) * side * config.climb.strafe * dt;
    }
    const floor = groundBelow(node.position.x, node.position.z, node.position.y);
    if(node.position.y <= floor + .02){
      node.position.y = floor;
      return !endClimb('bottom');
    }
    // Reaching the top pops the character onto the ledge, exactly like a mantle.
    if(node.position.y >= surface.top - .1){
      const fx = forwardX(), fz = forwardZ();
      const opts = options();
      node.position.x += fx * (opts.radius + .3);
      node.position.z += fz * (opts.radius + .3);
      node.position.y = surface.top;
      endClimb('top');
      return false;
    }
    if(pawn && pawn.state){ pawn.state.speed = Math.abs(up) * config.climb.speed; pawn.state.moving = Math.abs(up) > .1; }
    return true;
  }

  // --- slide ---------------------------------------------------------------

  // A roll is the low-speed half of the same gesture: it carries the character
  // the same way, but it ends standing and spins the body instead of ducking.
  // Direction is the way the character is ALREADY going, which is what makes it
  // usable as an evade rather than a commitment to face forward.
  function beginRoll(speed){
    if(!config.slide.enabled || state.slideCooldown > 0) return false;
    state.mode = 'roll';
    state.rollTimer = config.slide.rollDuration;
    state.rollSpin = 0;
    state.slideSpeed = Math.max(config.slide.rollSpeed, speed);
    state.slideDirX = forwardX();
    state.slideDirZ = forwardZ();
    playAction('roll');
    emit('OnCharacterRollStarted', {speed:state.slideSpeed});
    return true;
  }

  function stepRoll(dt){
    const node = owner();
    if(!node) return false;
    state.rollTimer -= dt;
    const t = clamp(1 - state.rollTimer / config.slide.rollDuration, 0, 1);
    node.position.x += state.slideDirX * state.slideSpeed * dt;
    node.position.z += state.slideDirZ * state.slideSpeed * dt;
    // One full tumble across the move, applied to the body rather than the view:
    // spinning the camera is how a roll becomes motion sickness.
    state.rollSpin = t;
    // The tumble goes on the BODY (pitch), never on the view: the camera reads
    // its yaw and pitch from the rig, so this is visible from outside and does
    // not spin the player's own screen.
    if(node.rotation) node.rotation.x = -t * Math.PI * 2;
    if(pawn && pawn.state){ pawn.state.speed = state.slideSpeed; pawn.state.moving = true; pawn.state.rolling = t; }
    if(state.rollTimer > 0) return true;
    if(node.rotation) node.rotation.x = 0;
    state.slideCooldown = config.slide.cooldown;
    state.mode = 'none';
    if(pawn && pawn.state) pawn.state.rolling = 0;
    emit('OnCharacterRollFinished', {});
    return false;
  }

  function beginSlide(speed){
    if(!config.slide.enabled || state.slideCooldown > 0) return false;
    state.mode = 'slide';
    state.slideTimer = config.slide.duration;
    state.slideSpeed = speed * config.slide.boost;
    state.slideDirX = forwardX();
    state.slideDirZ = forwardZ();
    playAction('slide');
    emit('OnCharacterSlideStarted', {speed:state.slideSpeed});
    return true;
  }

  function stepSlide(dt){
    const node = owner();
    if(!node) return false;
    state.slideTimer -= dt;
    state.slideSpeed = Math.max(0, state.slideSpeed - config.slide.friction * dt);
    node.position.x += state.slideDirX * state.slideSpeed * dt;
    node.position.z += state.slideDirZ * state.slideSpeed * dt;
    if(pawn && pawn.state){ pawn.state.speed = state.slideSpeed; pawn.state.moving = true; pawn.state.sliding = true; }
    if(state.slideTimer > 0 && state.slideSpeed > 1.2) return true;
    state.slideCooldown = config.slide.cooldown;
    state.mode = state.crouchHeld || headroomBlocked() ? 'crouch' : 'none';
    if(pawn && pawn.state) pawn.state.sliding = false;
    emit('OnCharacterSlideFinished', {});
    return false;
  }

  // --- frame ---------------------------------------------------------------

  // Runs before the movement controller. Returning true tells the Pawn to skip
  // ordinary locomotion this frame because a traversal owns the transform.
  function preMovement(dt, move){
    if(!config.enabled) return false;
    const h = clamp(finite(dt, .016), .0001, .1);
    const input = move || {};
    state.slideCooldown = Math.max(0, state.slideCooldown - h);

    if(state.mode === 'vault' || state.mode === 'mantle'){
      applyCrouchBlend(h);
      return stepTraversal(h);
    }
    if(state.mode === 'hang'){
      applyCrouchBlend(h);
      return stepHang(h, input);
    }
    if(state.mode === 'climb'){
      applyCrouchBlend(h);
      // Jumping off a wall or ladder is always allowed and always instant.
      if(input.jump === true){ endClimb('jump'); return false; }
      return stepClimb(h, input);
    }
    if(state.mode === 'slide'){
      applyCrouchBlend(h);
      if(stepSlide(h)) return true;
    }
    if(state.mode === 'roll'){
      applyCrouchBlend(h);
      if(stepRoll(h)) return true;
    }

    // Crouch input: hold or toggle, but never while the head is under something.
    const crouchPressed = input.crouch === true;
    if(config.crouch.enabled){
      if(config.crouch.toggle){
        if(crouchPressed && !state.crouchHeld) state.crouchLatched = !state.crouchLatched;
      } else state.crouchLatched = crouchPressed;
    }
    state.crouchHeld = crouchPressed;
    // Sprinting cancels a crouch outright: asking the player to press Crouch
    // again before they can run is a step that never has a different answer.
    // A forced crouch under a low ceiling still wins, because it has to.
    if(input.sprint === true && state.crouchLatched) state.crouchLatched = false;
    const wantsCrouch = config.crouch.enabled && (state.crouchLatched || headroomBlocked());

    const speed = pawn && pawn.state ? finite(pawn.state.speed, 0) : 0;
    const grounded = pawn && pawn.state ? pawn.state.grounded !== false : true;

    // Double-tap Dodge. At speed it is a slide, at a walk it is a roll — one
    // gesture, and what the character is already doing picks the move. The tap
    // clock runs unconditionally so the timing feels the same everywhere.
    state.dodgeTapAge += h;
    const dodgePressed = input.dodge === true;
    if(dodgePressed && !state.dodgeHeld){
      const busy = state.mode === 'slide' || state.mode === 'roll';
      if(state.dodgeTapAge <= config.slide.doubleTapWindow && grounded && !busy){
        state.dodgeTapAge = 99;
        state.dodgeHeld = true;
        const started = speed >= config.slide.minSpeed ? beginSlide(speed) : beginRoll(speed);
        if(started) return true;
      }
      state.dodgeTapAge = 0;
    }
    state.dodgeHeld = dodgePressed;

    if(state.mode !== 'slide') state.mode = wantsCrouch ? 'crouch' : 'none';

    // Vault / mantle: the Jump button in front of a ledge becomes a traversal.
    // Free jumps are unaffected because the probe only fires when something is
    // actually there.
    if(input.jump === true && grounded && !wantsCrouch){
      const ledge = probeLedge();
      if(ledge && (ledge.kind !== 'vault' || speed >= config.vault.minSpeed)){
        if(beginTraversal(ledge)) return true;
      }
    }
    // Grabbing a climbable wall: push into it and press Jump.
    if(input.jump === true && !state.climb){
      const surface = probeClimbSurface();
      if(surface && beginClimb(surface)) return true;
    }
    // Falling past an edge within arm's reach catches it. Automatic on purpose:
    // asking the player to press a key at the apex of a jump is a coordination
    // test, not a traversal system.
    if(!grounded && finite(pawn && pawn.state && pawn.state.velocityY, 0) <= .2){
      const ledge = probeHangLedge(0, 0);
      if(ledge && beginHang(ledge)) return true;
    }

    applyCrouchBlend(h);
    state.lastGrounded = grounded;
    return false;
  }

  // Speed multiplier the Pawn applies to the movement input. Crouch and slow
  // walk are speed scales rather than separate gaits, so every existing
  // acceleration and animation curve keeps working.
  function movementScale(move){
    if(!config.enabled) return 1;
    let scale = 1;
    if(state.crouchBlend > 0) scale *= 1 - (1 - config.crouch.speedScale) * state.crouchBlend;
    if(config.walk.enabled && move && move.slowWalk === true) scale *= config.walk.speedScale;
    return scale;
  }

  function afterMovement(dt, move, snapshot){
    if(pawn && pawn.state){
      pawn.state.ability = state.mode;
      pawn.state.crouch = state.crouchBlend;
    }
    // Landing from a fall while crouch is held reads as a crouched landing;
    // nothing else needs the snapshot yet.
    if(snapshot && snapshot.justLanded && state.crouchBlend > .5) playAction('landCrouch');
    return state;
  }

  // What the Use key does when there is nothing to use: climb whatever is in
  // front. Hanging pulls up, a ledge on the ground is vaulted or mantled, a
  // climbable face is grabbed. Returns false when there is nothing to climb, so
  // the caller can fall through to another verb.
  function tryTraversal(){
    if(state.mode === 'hang') return pullUp();
    if(isBusyState()) return false;
    const ledge = probeLedge();
    if(ledge) return beginTraversal(ledge);
    const surface = probeClimbSurface();
    if(surface) return beginClimb(surface);
    const hang = probeHangLedge(0, 0);
    return hang ? beginHang(hang) : false;
  }
  function isBusyState(){
    return state.mode === 'vault' || state.mode === 'mantle' || state.mode === 'climb' || state.mode === 'slide';
  }

  function reset(){
    state.mode = 'none';
    state.crouchBlend = 0;
    state.crouchLatched = false;
    state.slideTimer = 0;
    state.slideCooldown = 0;
    state.dodgeHeld = false;
    state.dodgeTapAge = 99;
    state.rollTimer = 0;
    state.rollSpin = 0;
    const node = owner();
    if(node && node.rotation) node.rotation.x = 0;
    state.traversal = null;
    state.climb = null;
    state.hang = null;
    if(pawn && pawn.state) pawn.state.hanging = false;
    const move = movement();
    if(move && state.baseHeight != null) move.configure({height:state.baseHeight});
    const rig = pawn && pawn.firstPerson;
    if(rig && rig.setEyeOffset) rig.setEyeOffset(0);
    return state;
  }

  function applyBinding(path, value){
    const key = String(path || '');
    if(key.indexOf('abilities.') !== 0) return false;
    const parts = key.slice(10).split('.');
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
    STATES,
    config:() => config,
    state,
    preMovement,
    afterMovement,
    movementScale,
    reset,
    applyBinding,
    // Used by the interaction system when the player mounts a ladder.
    beginClimb,
    endClimb,
    beginTraversal,
    beginHang,
    releaseHang,
    probeLedge,
    probeHangLedge,
    tryTraversal,
    isHanging:() => state.mode === 'hang',
    isBusy:() => isBusyState() || state.mode === 'hang',
    mode:() => state.mode,
    crouchAmount:() => state.crouchBlend,
  });
}

// ------------------------------------------------ pawn attachment
// Composes onto the Pawn hooks like the first-person rig does. Attach this
// BEFORE the first-person controller so the view still updates during a
// traversal: the later attachment runs its own hook first.

function attach(GAME, pawn, source){
  if(!pawn) return null;
  const controller = create(GAME, pawn, source);
  const previousBefore = pawn.beforeMovementStep;
  const previousAfter = pawn.afterMovementStep;
  const previousScale = pawn.movementScale;
  pawn.beforeMovementStep = function(dt, move){
    if(controller.preMovement(dt, move) === true) return true;
    return typeof previousBefore === 'function' ? previousBefore.call(this, dt, move) : false;
  };
  pawn.afterMovementStep = function(dt, move, snapshot){
    controller.afterMovement(dt, move, snapshot);
    if(typeof previousAfter === 'function') previousAfter.call(this, dt, move, snapshot);
  };
  pawn.movementScale = function(move){
    const previous = typeof previousScale === 'function' ? previousScale.call(this, move) : 1;
    return previous * controller.movementScale(move);
  };
  const previousReset = pawn.reset.bind(pawn);
  pawn.reset = function(){ const done = previousReset(); controller.reset(); return done; };
  pawn.abilities = controller;
  return controller;
}

window.LK_RUNTIME_CHARACTER_ABILITIES = Object.freeze({
  STATES,
  normalizeConfig,
  isClimbable,
  create,
  attach,
});
})();
