/* =========================================================
   LOT KING - Generic character movement controller
   Reusable ground locomotion for humanoid Pawns (soccer,
   human standard, police, civil...). Design adapted from
   three-player-controller (camera-relative input, walk/run
   smoothing, gravity + jump, first/third person view) but
   dependency-free: collision uses the engine arcade collider
   lists instead of BVH meshes.
   ========================================================= */
(function(){
'use strict';

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

const STEP_TOLERANCE = .06;   // slack that keeps standing-on-a-surface stable

function normalizeOptions(options){
  const o = options || {};
  return {
    walkSpeed:clamp(finite(o.walkSpeed, 1.9), .2, 8),
    runSpeed:clamp(finite(o.runSpeed, 6), .5, 14),
    sprintMultiplier:clamp(finite(o.sprintMultiplier, 1.35), 1, 2.5),
    acceleration:clamp(finite(o.acceleration, 14), 1, 80),
    turnRate:clamp(finite(o.turnRate, 10), .5, 40),
    gravity:clamp(finite(o.gravity, 22), 1, 80),
    jumpHeight:clamp(finite(o.jumpHeight, 1.1), 0, 5),
    airControl:clamp(finite(o.airControl, .35), 0, 1),
    radius:clamp(finite(o.radius, .35), .1, 2),
    // Body height, used to decide whether the character passes under a box
    // instead of being blocked by it.
    height:clamp(finite(o.height, 1.8), .3, 6),
    // Maximum rise the character climbs without jumping: stair treads, kerbs
    // and low platform edges. Anything taller still blocks.
    stepHeight:clamp(finite(o.stepHeight, .55), 0, 3),
    // Whether solid box colliders act as standable surfaces. Off keeps the
    // pre-existing flat/slope-only behaviour for levels that expect it.
    walkOnColliders:o.walkOnColliders !== false,
    // 'camera': input is relative to the active camera yaw (three-player-
    // controller style). 'heading': input is relative to the character facing.
    inputMode:o.inputMode === 'heading' ? 'heading' : 'camera',
    // `movement` turns toward velocity (generic third-person character).
    // `heading` preserves authored facing so X becomes a real lateral strafe.
    facingMode:o.facingMode === 'heading' ? 'heading' : 'movement',
    // Material the character is assumed to be walking on when the surface it
    // stands on does not declare one. Footstep audio reads it from the frame
    // snapshot; nothing in the movement itself depends on it.
    defaultSurface:typeof o.defaultSurface === 'string' && o.defaultSurface ? o.defaultSurface : 'concrete',
  };
}

// A collider declares its material either on the record itself or on the scene
// object that owns it, so a level can tag geometry without the movement code
// knowing anything about materials.
function colliderSurface(col){
  if(!col) return null;
  if(typeof col.surface === 'string' && col.surface) return col.surface;
  const data = col.owner && col.owner.userData;
  return data && typeof data.surface === 'string' && data.surface ? data.surface : null;
}

function create(GAME, options){
  const state = {
    options:normalizeOptions(options),
    velocityX:0, velocityY:0, velocityZ:0,
    grounded:true,
    jumpQueued:false,
    groundY:0,
    // Terrain height with no surface stacked on it. Kept separate from
    // `groundY` so stepping off a platform falls back to the real floor
    // instead of latching onto the height the character last stood at.
    baseGroundY:0,
  };

  function configure(patch){
    state.options = normalizeOptions(Object.assign({}, state.options, patch || {}));
    return state.options;
  }

  function cameraYaw(){
    const camera = GAME && GAME.core && GAME.core.camera;
    if(!camera || !camera.getWorldDirection || !window.THREE) return null;
    const dir = new window.THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    if(dir.lengthSq() < .0001) return null;
    dir.normalize();
    return Math.atan2(dir.x, dir.z);
  }

  function jump(){
    if(!state.grounded || state.options.jumpHeight <= 0) return false;
    state.jumpQueued = true;
    return true;
  }

  // Base terrain height, before any solid surface stacked on top of it.
  function terrainGround(position, fallback){
    const world = GAME && GAME.world;
    if(world && typeof world.characterGroundHeight === 'function') return finite(world.characterGroundHeight(position.x, position.z), fallback);
    const profile = world && world.characterGround;
    if(!profile || profile.type !== 'slope-z') return fallback;
    const start = finite(profile.slopeStart, -2), crest = finite(profile.crestZ, -30), slope = finite(profile.slope, .26);
    return position.z < start ? Math.min((start - position.z) * slope, (start - crest) * slope) : finite(profile.baseY, fallback);
  }

  // Highest box collider the character can be standing on at this XZ position.
  // A surface counts when its top is at or below the feet (already on it) or
  // within step height above them (a stair tread, a kerb, a low platform edge),
  // which is what makes stairs climb without any dedicated stair logic.
  function surfaceGround(position, owner, base){
    state.groundSurface = null;
    if(!state.options.walkOnColliders) return base;
    const colliders = GAME && GAME.world && GAME.world.colliders;
    if(!colliders || !colliders.box) return base;
    const feet = position.y;
    const reach = feet + state.options.stepHeight;
    let best = base;
    colliders.box.forEach(col => {
      if(!col || col.enabled === false || col.walkable === false) return;
      if(belongsToOwner(col, owner)) return;
      const top = boxTop(col);
      if(top == null || top <= best || top > reach) return;
      // Slightly tighter than the lateral radius so the character does not
      // float while merely brushing an edge.
      if(Math.abs(position.x - col.x) > col.hx + state.options.radius * .5) return;
      if(Math.abs(position.z - col.z) > col.hz + state.options.radius * .5) return;
      best = top;
      state.groundSurface = colliderSurface(col);
    });
    return best;
  }

  function worldGround(position, fallback, owner){
    return surfaceGround(position, owner, terrainGround(position, fallback));
  }

  // Push the character out of the arcade world colliders (walls, pillars,
  // goal posts...) the same lists the car physics resolves against.
  function belongsToOwner(collider, owner){
    if(!collider || !owner) return false;
    if(collider.logicElementOwner === owner || collider.owner === owner) return true;
    let node = collider.owner || null;
    while(node){
      if(node === owner) return true;
      node = node.parent || null;
    }
    return false;
  }
  // Vertical span of a box collider, when it declares one.
  function boxTop(col){ return col.hy != null && col.y != null ? col.y + col.hy : null; }
  function boxBottom(col){ return col.hy != null && col.y != null ? col.y - col.hy : null; }

  // True when the character's body does not overlap the box vertically, so it
  // must not push laterally. Without the ceiling half of this test any roof or
  // walkway deck behaved as a full-height wall down at ground level.
  function clearsVertically(col, feetY){
    const top = boxTop(col);
    if(top == null) return false;
    if(feetY >= top - STEP_TOLERANCE) return true;                       // standing on or above it
    return feetY + state.options.height <= boxBottom(col) + STEP_TOLERANCE;  // passing underneath
  }

  function resolveColliders(position, owner){
    const colliders = GAME && GAME.world && GAME.world.colliders;
    if(!colliders) return;
    const r = state.options.radius;
    (colliders.box || []).forEach(col => {
      if(!col || col.enabled === false) return;
      if(belongsToOwner(col, owner)) return;
      if(clearsVertically(col, position.y)) return;
      const dx = position.x - col.x, dz = position.z - col.z;
      const px = col.hx + r - Math.abs(dx), pz = col.hz + r - Math.abs(dz);
      if(px <= 0 || pz <= 0) return;
      // A surface within step height is climbed by the ground solver rather
      // than blocked, so stairs and kerbs do not stop the character dead.
      const top = boxTop(col);
      if(top != null && top - position.y > 0 && top - position.y <= state.options.stepHeight) return;
      if(px < pz) position.x += (dx >= 0 ? 1 : -1) * px;
      else position.z += (dz >= 0 ? 1 : -1) * pz;
    });
    (colliders.circle || []).forEach(col => {
      if(!col || col.enabled === false || col.physics === true) return;
      if(belongsToOwner(col, owner)) return;
      const dx = position.x - col.x, dz = position.z - col.z;
      const min = (col.r || .5) + r;
      const d2 = dx * dx + dz * dz;
      if(d2 >= min * min || d2 < 1e-8) return;
      const d = Math.sqrt(d2);
      position.x = col.x + dx / d * min;
      position.z = col.z + dz / d * min;
    });
  }

  // input: {x, z, sprint} in [-1,1]; owner: Object3D moved in place.
  // Returns per-frame snapshot used for animation/state.
  function step(owner, input, dt, groundY){
    const h = clamp(finite(dt, .016), .0001, .1);
    const opts = state.options;
    state.baseGroundY = finite(groundY, state.baseGroundY);
    state.groundY = finite(groundY, state.groundY);
    const move = input || {};
    const inputX = clamp(finite(move.x, 0), -1, 1);
    const inputZ = clamp(finite(move.z, 0), -1, 1);
    const sprint = move.sprint === true;
    const magnitude = Math.min(1, Math.sqrt(inputX * inputX + inputZ * inputZ));
    // Gait is decided by the explicit Sprint input, not analog magnitude:
    // digital keyboard presses are always full magnitude, so a magnitude
    // threshold alone could never produce a real walk state. Magnitude still
    // scales speed within the active gait for analog sticks.
    const gaitSpeed = sprint ? opts.runSpeed * opts.sprintMultiplier : opts.walkSpeed;
    const topSpeed = gaitSpeed * magnitude;

    // Reference frame: camera yaw (free movement, three-player-controller
    // style) or character heading (tank-ish fallback).
    let frameYaw = owner && owner.rotation ? owner.rotation.y : 0;
    if(opts.inputMode === 'camera'){
      const yaw = cameraYaw();
      if(yaw != null) frameYaw = yaw;
    }
    const desiredX = (Math.sin(frameYaw) * inputZ + Math.cos(frameYaw) * inputX) * topSpeed;
    const desiredZ = (Math.cos(frameYaw) * inputZ - Math.sin(frameYaw) * inputX) * topSpeed;
    const control = state.grounded ? 1 : opts.airControl;
    const k = 1 - Math.exp(-opts.acceleration / Math.max(1, topSpeed || 1) * h * 4 * control);
    state.velocityX += (desiredX - state.velocityX) * k;
    state.velocityZ += (desiredZ - state.velocityZ) * k;

    // Vertical: gravity and queued jump (v = sqrt(2gh)).
    if(state.jumpQueued && state.grounded){
      state.velocityY = Math.sqrt(2 * opts.gravity * opts.jumpHeight);
      state.grounded = false;
    }
    state.jumpQueued = false;
    if(!state.grounded) state.velocityY -= opts.gravity * h;

    if(owner && owner.position){
      owner.position.x += state.velocityX * h;
      owner.position.z += state.velocityZ * h;
      const profile = GAME && GAME.world && GAME.world.characterGround;
      if(profile){
        if(profile.minX != null) owner.position.x = Math.max(Number(profile.minX), owner.position.x);
        if(profile.maxX != null) owner.position.x = Math.min(Number(profile.maxX), owner.position.x);
        if(profile.minZ != null) owner.position.z = Math.max(Number(profile.minZ), owner.position.z);
        if(profile.maxZ != null) owner.position.z = Math.min(Number(profile.maxZ), owner.position.z);
      }
      state.groundY = worldGround(owner.position, state.baseGroundY, owner);
      owner.position.y += state.velocityY * h;
      if(owner.position.y <= state.groundY){
        owner.position.y = state.groundY;
        if(!state.grounded && state.velocityY < 0) state.justLanded = true;
        state.velocityY = 0;
        state.grounded = true;
      } else if(owner.position.y > state.groundY + .002){
        state.grounded = false;
      }
      resolveColliders(owner.position, owner);
    }

    const speed = Math.sqrt(state.velocityX * state.velocityX + state.velocityZ * state.velocityZ);
    // Face the actual velocity for free movement.
    if(state.options.facingMode === 'movement' && speed > .35 && owner && owner.rotation && magnitude > .05){
      const targetHeading = Math.atan2(state.velocityX, state.velocityZ);
      let delta = targetHeading - owner.rotation.y;
      while(delta > Math.PI) delta -= Math.PI * 2;
      while(delta < -Math.PI) delta += Math.PI * 2;
      owner.rotation.y += clamp(delta, -opts.turnRate * h, opts.turnRate * h);
    }

    const snapshot = {
      speed,
      speedKmh:speed * 3.6,
      moving:speed > .15,
      sprinting:sprint && speed > .15,
      grounded:state.grounded,
      airborne:!state.grounded,
      justLanded:state.justLanded === true,
      // Material under the feet this frame, for footstep audio and effects.
      surface:state.groundSurface || state.options.defaultSurface,
      velocityX:state.velocityX,
      velocityY:state.velocityY,
      velocityZ:state.velocityZ,
    };
    state.justLanded = false;
    return snapshot;
  }

  function reset(heading){
    state.velocityX = 0; state.velocityY = 0; state.velocityZ = 0;
    state.grounded = true;
    state.jumpQueued = false;
    if(heading != null) state.heading = finite(heading, 0);
  }

  return Object.freeze({configure, step, jump, reset, options:() => Object.assign({}, state.options), isGrounded:() => state.grounded});
}

// Camera presets for humanoid Pawns. 'first' is a first-person-lite preset:
// the shared follow camera collapses onto the head position.
const VIEW_PRESETS = Object.freeze({
  third:{distance:7.5, height:2.6, lag:6.5, fov:60},
  close:{distance:3.4, height:1.9, lag:9, fov:65},
  first:{distance:.28, height:1.68, lag:18, fov:75},
});

window.LK_RUNTIME_CHARACTER_MOVEMENT = Object.freeze({create, normalizeOptions, VIEW_PRESETS});
})();
