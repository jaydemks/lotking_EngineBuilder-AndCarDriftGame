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
  const inputMode=o.inputMode === 'heading' ? 'heading' : 'camera';
  return {
    walkSpeed:clamp(finite(o.walkSpeed, 1.9), .2, 8),
    runSpeed:clamp(finite(o.runSpeed, 4.8), .5, 14),
    sprintMultiplier:clamp(finite(o.sprintMultiplier, 1), 1, 2.5),
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
    inputMode,
    // `movement` turns toward velocity (generic third-person character).
    // `heading` preserves authored facing so X becomes a real lateral strafe.
    // A heading-relative control frame cannot also derive its next frame from
    // a body that continuously turns toward velocity: that feedback loop makes
    // diagonal input orbit in a tiny circle and feels like an invisible wall.
    // Existing configs that omitted facingMode therefore inherit the only
    // stable pairing; authored/per-frame overrides remain fully supported.
    facingMode:o.facingMode === 'heading'||o.facingMode === 'movement'
      ?o.facingMode:(inputMode === 'heading' ? 'heading' : 'movement'),
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
  let cameraDirection=null;
  let groundRaycaster=null,groundRayOrigin=null,groundRayDirection=null;
  const state = {
    options:normalizeOptions(options),
    velocityX:0, velocityY:0, velocityZ:0,
    grounded:true,
    jumpQueued:false,
    groundY:0,
    stepSide:1,
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
    const dir = cameraDirection || (cameraDirection = new window.THREE.Vector3());
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

  // Thin meshes inside a complex GLB are not necessarily rectangular floors.
  // Roads, markings and bridges are commonly one large, disconnected mesh: an
  // AABB top therefore invents a solid platform everywhere between its distant
  // triangles. Sample the real mesh at the Character XZ instead. The last
  // sample is retained for a small footprint so ordinary grounded movement
  // does not ray-test a large environment mesh on every animation frame.
  function exactHorizontalGrounds(col, position){
    if(!col || col.horizontalSurface !== true) return null;
    // A generated horizontal part is allowed to support the Character only
    // where its REAL triangles exist.  Falling back to the part AABB when the
    // mesh/raycaster is temporarily unavailable turns disconnected road,
    // marking and border meshes into one enormous invisible platform.  Empty
    // is the safe answer: ordinary authored box colliders still use their AABB.
    if(!col.partMeshUuid || !window.THREE || !THREE.Raycaster) return [];
    const owner=col.owner;
    if(!owner || typeof owner.getObjectByProperty !== 'function') return [];
    let mesh=col._lkGroundMesh;
    if(!mesh || mesh.uuid !== col.partMeshUuid || !mesh.parent){
      mesh=owner.getObjectByProperty('uuid',col.partMeshUuid);
      col._lkGroundMesh=mesh||null;
      col._lkGroundRaySample=null;
    }
    if(!mesh || !mesh.isMesh || mesh.visible === false || mesh.material && mesh.material.visible === false) return [];
    for(let node=mesh.parent;node&&node!==owner;node=node.parent){if(node.visible===false)return [];}
    let bounds=col._lkGroundWorldBounds;
    if(!bounds){
      if(mesh.updateWorldMatrix)mesh.updateWorldMatrix(true,false);
      if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
      bounds=mesh.geometry.boundingBox&&new THREE.Box3().copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      col._lkGroundWorldBounds=bounds||null;
    }
    if(!bounds || bounds.isEmpty()) return [];
    const margin=state.options.radius*.5;
    if(position.x<bounds.min.x-margin||position.x>bounds.max.x+margin||position.z<bounds.min.z-margin||position.z>bounds.max.z+margin)return [];
    const cached=col._lkGroundRaySample,dx=cached?position.x-cached.x:Infinity,dz=cached?position.z-cached.z:Infinity;
    if(cached && dx*dx+dz*dz<=.01) return cached.heights;
    const upper=bounds.max.y,lower=bounds.min.y;
    if(!groundRaycaster){
      groundRaycaster=new THREE.Raycaster();
      groundRayOrigin=new THREE.Vector3();
      groundRayDirection=new THREE.Vector3(0,-1,0);
    }
    if(owner.updateMatrixWorld) owner.updateMatrixWorld(true);
    groundRayOrigin.set(position.x,upper+STEP_TOLERANCE,position.z);
    groundRaycaster.set(groundRayOrigin,groundRayDirection);
    groundRaycaster.near=0;
    groundRaycaster.far=Math.max(STEP_TOLERANCE*2,upper-lower+STEP_TOLERANCE*2);
    const hits=groundRaycaster.intersectObject(mesh,false),heights=[];
    hits.forEach(hit=>{
      const y=hit&&hit.point&&Number(hit.point.y);
      if(!Number.isFinite(y)||heights.some(value=>Math.abs(value-y)<.002))return;
      heights.push(y);
    });
    heights.sort((a,b)=>b-a);
    col._lkGroundRaySample={x:position.x,z:position.z,heights};
    return heights;
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
      // A complex imported collider keeps one aggregate root only as lifecycle
      // bookkeeping; its `parts` are the actual solids. Vehicles already skip
      // this root. Treating it as geometry trapped an on-foot Character inside
      // the full bounds of large multi-mesh scenery (for example the Parking
      // Lot city blocks) while the same level remained freely driveable.
      if(!col || col.enabled === false || col.compoundRoot || col.walkable === false) return;
      if(belongsToOwner(col, owner)) return;
      const exact=exactHorizontalGrounds(col,position);
      if(exact===null){
        // Slightly tighter than the lateral radius so the character does not
        // float while merely brushing an ordinary box edge.
        if(Math.abs(position.x-col.x)>col.hx+state.options.radius*.5)return;
        if(Math.abs(position.z-col.z)>col.hz+state.options.radius*.5)return;
      }
      const candidates=exact===null?[boxTop(col)]:exact;
      const top=candidates.find(value=>value!=null&&value>best&&value<=reach);
      if(top == null) return;
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
      // A generated horizontal mesh part is a one-sided floor, not an XZ wall.
      // It remains available to surfaceGround(), fall landing and physics.
      if(!col || col.enabled === false || col.compoundRoot || col.horizontalSurface) return;
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
    // Dynamic vehicle bodies are not part of the static arcade collider lists:
    // native Player Car, Logic Vehicle Pawn and Sketchbook each own different
    // physics. Project their shared occupancy capability into a moving XZ solid
    // so an on-foot arcade Character cannot walk through any of them.
    const occupancy=window.LK_RUNTIME_VEHICLE_OCCUPANCY,registry=GAME&&GAME.pawns;
    if(occupancy&&registry&&typeof registry.list==='function'){
      const ownerData=owner&&owner.userData||{},character=registry.get&&registry.get(ownerData.characterPawnId||ownerData.humanPawnId||ownerData.soccerPawnId||ownerData.vehiclePawnId);
      registry.list().forEach(vehicle=>{
        // A wreck is no longer enterable, but it is still a vehicle-shaped
        // obstacle. Entry eligibility must never decide collision lifetime.
        const collidable=occupancy.isCollidable?occupancy.isCollidable(vehicle):occupancy.isEnterable(vehicle);
        if(!vehicle||vehicle===character||character&&character.inVehicle===vehicle||!collidable)return;
        const footprint=occupancy.collisionFootprint(vehicle),center=footprint.center;
        const verticalReach=footprint.hy+state.options.height;
        if(Math.abs(finite(center.y,position.y)-position.y)>verticalReach)return;
        const heading=footprint.heading,c=Math.cos(heading),s=Math.sin(heading),dx=position.x-finite(center.x,0),dz=position.z-finite(center.z,0);
        let localX=dx*c-dz*s,localZ=dx*s+dz*c;
        const nearestX=clamp(localX,-footprint.hx,footprint.hx),nearestZ=clamp(localZ,-footprint.hz,footprint.hz),awayX=localX-nearestX,awayZ=localZ-nearestZ,d2=awayX*awayX+awayZ*awayZ;
        if(d2>=r*r)return;
        if(d2>1e-8){
          const d=Math.sqrt(d2),push=r-d;localX+=awayX/d*push;localZ+=awayZ/d*push;
        } else {
          // Centre lies inside the rectangle: leave through the nearest expanded
          // face. This is stable even when Character and vehicle spawn exactly
          // on top of one another.
          const pushX=footprint.hx+r-Math.abs(localX),pushZ=footprint.hz+r-Math.abs(localZ);
          if(pushX<pushZ)localX=(localX>=0?1:-1)*(footprint.hx+r);
          else localZ=(localZ>=0?1:-1)*(footprint.hz+r);
        }
        position.x=finite(center.x,0)+localX*c+localZ*s;
        position.z=finite(center.z,0)-localX*s+localZ*c;
      });
    }
  }

  // input: {x, z, sprint} in [-1,1]; owner: Object3D moved in place.
  // Returns per-frame snapshot used for animation/state.
  function step(owner, input, dt, groundY){
    const h = clamp(finite(dt, .016), .0001, .1);
    const opts = state.options;
    state.baseGroundY = finite(groundY, state.baseGroundY);
    state.groundY = finite(groundY, state.groundY);
    const feetBefore = owner && owner.position ? finite(owner.position.y, state.groundY) : state.groundY;
    const groundedBefore = state.grounded;
    let stepRise = 0;
    const move = input || {};
    const inputX = clamp(finite(move.x, 0), -1, 1);
    const inputZ = clamp(finite(move.z, 0), -1, 1);
    const sprintAmount = clamp(finite(move.sprintAmount, move.sprint === true ? 1 : 0), 0, 1);
    const sprint = move.sprint === true || sprintAmount > .001;
    const magnitude = Math.min(1, Math.sqrt(inputX * inputX + inputZ * inputZ));
    // Gait is decided by the explicit Sprint input, not analog magnitude:
    // digital keyboard presses are always full magnitude, so a magnitude
    // threshold alone could never produce a real walk state. Magnitude still
    // scales speed within the active gait for analog sticks.
    // Buttons still produce 0/1. An axis/trigger can choose every gait speed in
    // between, so movement and its animation remain the same scalar signal.
    const gaitSpeed = opts.walkSpeed + (opts.runSpeed * opts.sprintMultiplier - opts.walkSpeed) * sprintAmount;
    const topSpeed = gaitSpeed * magnitude;

    // Reference frame: camera yaw (free movement, three-player-controller
    // style) or character heading (tank-ish fallback).
    // Combat can change its control frame per animation frame without rewriting
    // the authored Pawn: hip locomotion follows travel, while ADS/first-person
    // preserves a true strafe around the crosshair. AI and ordinary characters
    // that do not provide an override keep their configured modes verbatim.
    const inputMode=move.inputMode === 'heading'||move.inputMode === 'camera'?move.inputMode:opts.inputMode;
    const facingMode=move.facingMode === 'heading'||move.facingMode === 'movement'?move.facingMode:opts.facingMode;
    let frameYaw = owner && owner.rotation ? owner.rotation.y : 0;
    if(inputMode === 'camera'){
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
      if(groundedBefore && state.groundY > feetBefore + STEP_TOLERANCE && state.groundY - feetBefore <= opts.stepHeight + STEP_TOLERANCE){
        stepRise = state.groundY - feetBefore;
        state.stepSide *= -1;
      }
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
    if(facingMode === 'movement' && speed > .35 && owner && owner.rotation && magnitude > .05){
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
      sprintAmount,
      inputMode,
      facingMode,
      inputMagnitude:magnitude,
      grounded:state.grounded,
      airborne:!state.grounded,
      justLanded:state.justLanded === true,
      // A stair tread is grounded locomotion, never a synthetic jump. Animation
      // receives the measured rise and an alternating lead foot without touching
      // velocityY, airborne or the Jump event path.
      stepRise,
      stepHeight:opts.stepHeight,
      stepSide:state.stepSide,
      groundContact:state.grounded,
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
    state.stepSide = 1;
    if(heading != null) state.heading = finite(heading, 0);
  }

  // Ownership may return from a moving platform in mid-air. `reset()` is still
  // the clean presentation/lifecycle boundary; `launch()` then seeds the real
  // world velocity without inventing a jump or snapping the feet to the floor.
  function launch(velocity){
    state.velocityX=finite(velocity&&velocity.x,0);
    state.velocityY=finite(velocity&&velocity.y,0);
    state.velocityZ=finite(velocity&&velocity.z,0);
    state.grounded=false;
    state.jumpQueued=false;
    state.justLanded=false;
    return {x:state.velocityX,y:state.velocityY,z:state.velocityZ};
  }

  return Object.freeze({configure, step, jump, reset, launch, options:() => Object.assign({}, state.options), isGrounded:() => state.grounded});
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
