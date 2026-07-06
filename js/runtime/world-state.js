/* =========================================================
   LOT KING - world state helpers
   Editor registry, deterministic seed, colliders and lightweight collisions.
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts = options || {};
  const constants = Object.freeze({
    LOT: opts.lot == null ? 72 : opts.lot,
    WALL_H: opts.wallH == null ? 4 : opts.wallH,
  });
  const colliders = {circle: [], box: []};
  const registry = [];
  let entityCounter = 0;
  let worldSeed = opts.seed == null ? 1337 : opts.seed;

  function srand(){
    worldSeed = (worldSeed * 1664525 + 1013904223) >>> 0;
    return worldSeed / 4294967296;
  }

  function tagEntity(obj, name, type, tagOptions){
    const tag = tagOptions || {};
    obj.userData.editorId = tag.id || ('e' + (entityCounter++));
    obj.userData.editorName = name;
    obj.userData.editorType = type;
    if(tag.collider) obj.userData.collider = tag.collider;
    if(tag.builtin !== false) obj.userData.builtin = true;
    registry.push(obj);
    return obj;
  }

  function unregisterEntity(obj){
    const i = registry.indexOf(obj);
    if(i >= 0) registry.splice(i, 1);
    const col = obj.userData.collider;
    if(col && col.ref){
      const arr = col.kind === 'circle' ? colliders.circle : colliders.box;
      if(col.ref.parts){
        col.ref.parts.forEach(part => {
          const pi = arr.indexOf(part);
          if(pi >= 0) arr.splice(pi, 1);
        });
        col.ref.parts = [];
      }
      const j = arr.indexOf(col.ref);
      if(j >= 0) arr.splice(j, 1);
    }
  }

  function colliderSignature(){
    let activeBoxes = 0, activeCircles = 0;
    const parts = [];
    for(const b of colliders.box){
      // drive surfaces are real cannon statics now, so they count too
      if(!b || b.enabled === false || b.compoundRoot || b.physics) continue;
      activeBoxes++;
      parts.push([b.x, b.y || 0, b.z, b.hx, b.hy || 0, b.hz, b.rotX || 0, b.rotY != null ? b.rotY : (b.rot || 0), b.rotZ || 0, colliderMass(b)].map(v => Math.round(v * 100)).join(','));
    }
    for(const c of colliders.circle){
      if(!c || c.enabled === false || c.physics || isDriveSurfaceCollider(c)) continue;
      activeCircles++;
      parts.push([c.x, c.z, c.r, colliderMass(c)].map(v => Math.round(v * 100)).join(','));
    }
    parts.unshift('b' + activeBoxes, 'c' + activeCircles);
    return parts.join('|');
  }

  function colliderMass(col){
    const value = Number(col && col.mass);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }

  function colliderMassScale(col){
    const m = colliderMass(col);
    return Math.max(0.04, Math.min(35, 1 / Math.sqrt(m)));
  }

  function physicsMoveRatio(col){
    const s = colliderMassScale(col);
    return Math.max(0.02, Math.min(0.992, s / (s + 0.16)));
  }

  function physicsPlayerBounce(col){
    const m = colliderMass(col);
    const impact = Number(col && col.impact);
    const impactForce = Number.isFinite(impact) ? Math.max(0, Math.min(1, impact)) : 0.25;
    return Math.max(0.02, Math.min(0.96, 0.02 + (m / (m + 4)) * 0.94)) * impactForce;
  }

  function physicsImpactForce(col){
    const value = Number(col && col.impact);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.25;
  }

  function vehicleReactionRatio(col){
    if(!col || !col.physics) return 1;
    const effectiveMass = colliderMass(col) * physicsImpactForce(col);
    return Math.max(0, Math.min(1, effectiveMass / (effectiveMass + 14)));
  }

  function isDriveSurfaceCollider(col){
    const owner = col && col.owner;
    const ud = owner && owner.userData;
    if(!ud) return false;
    if(ud.driveSurface === true) return true;
    const e = ud.addedEntry || {};
    const prim = e.primitive || e.prim;
    if(prim === 'ramp' || prim === 'plane') return true;
    const text = String(ud.editorName || ud.assetName || owner.name || '').toLowerCase();
    return /\b(ramp|curb|sidewalk|pavement|road|floor|ground|surface|asphalt|marciapiede|salita|rampa)\b/.test(text);
  }

  function driveSurfaceNormal(box){
    if(!box) return null;
    if(window.THREE){
      const e = new THREE.Euler(box.rotX || 0, box.rotY != null ? box.rotY : (box.rot || 0), box.rotZ || 0, 'XYZ');
      return new THREE.Vector3(0, 1, 0).applyEuler(e).normalize();
    }
    // Rx(rx)·Ry(ry)·Rz(rz)·(0,1,0), same as THREE Euler order 'XYZ'
    const rx = box.rotX || 0, ry = box.rotY != null ? box.rotY : (box.rot || 0), rz = box.rotZ || 0;
    const n = {
      x: -Math.sin(rz) * Math.cos(ry),
      y: Math.cos(rx) * Math.cos(rz) - Math.sin(rx) * Math.sin(ry) * Math.sin(rz),
      z: Math.sin(rx) * Math.cos(rz) + Math.cos(rx) * Math.sin(ry) * Math.sin(rz),
    };
    const l = Math.hypot(n.x, n.y, n.z) || 1;
    n.x /= l; n.y /= l; n.z /= l;
    return n;
  }

  function driveSurfaceMinNormalY(){
    return Math.cos(Math.PI * 50 / 180);
  }

  function isDriveableSurfaceCollider(col){
    if(!isDriveSurfaceCollider(col)) return false;
    const n = driveSurfaceNormal(col);
    return !!(n && n.y >= driveSurfaceMinNormalY());
  }

  let surfScratch = null;
  function boxLocalPoint(box, x, y, z){
    if(!window.THREE) return null;
    const s = surfScratch || (surfScratch = {e: new THREE.Euler(), q: new THREE.Quaternion(), v: new THREE.Vector3()});
    s.e.set(box.rotX || 0, box.rotY != null ? box.rotY : (box.rot || 0), box.rotZ || 0, 'XYZ');
    s.q.setFromEuler(s.e).invert();
    return s.v.set(x - box.x, y - (box.y || 0), z - box.z).applyQuaternion(s.q);
  }

  // Height of the box top face at world (x,z), null when the vertical line
  // misses the (fully rotated) face — avoids the plane extending past the box.
  function driveSurfaceTopAt(box, x, z){
    const n = driveSurfaceNormal(box);
    if(!n || n.y < driveSurfaceMinNormalY()) return null;
    const hy = box.hy || .5;
    const px = box.x + n.x * hy;
    const py = (box.y || 0) + n.y * hy;
    const pz = box.z + n.z * hy;
    const y = py - (n.x * (x - px) + n.z * (z - pz)) / Math.max(.12, n.y);
    const l = boxLocalPoint(box, x, y, z);
    if(l){
      if(Math.abs(l.x) > (box.hx || 1) + .35 || Math.abs(l.z) > (box.hz || 1) + .35) return null;
    } else {
      const rot = Number(box.rotY != null ? box.rotY : box.rot) || 0;
      const cos = Math.cos(-rot), sin = Math.sin(-rot);
      const wx = x - box.x, wz = z - box.z;
      if(Math.abs(wx * cos - wz * sin) > (box.hx || 1) + .35 || Math.abs(wx * sin + wz * cos) > (box.hz || 1) + .35) return null;
    }
    return {y, normal: n};
  }

  // Reachable when the surface height at the contact point (player position
  // clamped inside the box footprint) is within a step of the player height.
  function canDriveThroughSurfaceCollider(box, player, surfaceYAt){
    if(!player || !player.pos) return false;
    const rot = Number(box.rotY != null ? box.rotY : box.rot) || 0;
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const wx = player.pos.x - box.x, wz = player.pos.z - box.z;
    const hx = Math.max(.06, (box.hx || 1) - .05), hz = Math.max(.06, (box.hz || 1) - .05);
    const lx = Math.max(-hx, Math.min(hx, wx * cr + wz * sr));
    const lz = Math.max(-hz, Math.min(hz, -wx * sr + wz * cr));
    const cx = box.x + lx * cr - lz * sr;
    const cz = box.z + lx * sr + lz * cr;
    let y = surfaceYAt ? surfaceYAt(cx, cz) : null;
    if(y == null){
      const top = driveSurfaceTopAt(box, cx, cz);
      y = top ? top.y : null;
    }
    if(y == null) return false;
    return ((player.pos.y || 0) >= y - .45);
  }

  function sampleDriveSurfaceAt(x, z){
    let best = null;
    for(const b of colliders.box || []){
      if(!b || b.enabled === false || !isDriveSurfaceCollider(b)) continue;
      const top = driveSurfaceTopAt(b, x, z);
      if(top && (!best || top.y > best.y)) best = top;
    }
    return best;
  }

  function colliderRadius(col){
    if(!col) return 0;
    if(Number.isFinite(Number(col.r))) return Math.max(0.05, Number(col.r));
    const hx = Math.max(0.05, Number(col.hx) || 0.5);
    const hz = Math.max(0.05, Number(col.hz) || 0.5);
    return Math.sqrt(hx * hx + hz * hz);
  }

  function canMoveCollider(col){
    return !!(col && col.enabled !== false && !col.compoundPart && col.physics && col.owner);
  }

  function physicsVelocity(col){
    if(!col || !col.owner) return null;
    const ud = col.owner.userData || (col.owner.userData = {});
    return ud.physicsVel || (ud.physicsVel = {x:0, y:0, z:0});
  }

  function moveColliderOwner(col, dx, dz){
    if(!col || !col.owner) return;
    col.owner.position.x += dx;
    col.owner.position.z += dz;
    col.x += dx;
    col.z += dz;
  }

  function nudgePhysicsOwner(col, awayX, awayZ, amount, impact){
    if(!col || !col.physics || !col.owner || amount <= 0) return;
    const owner = col.owner;
    const massScale = colliderMassScale(col);
    const move = amount * physicsMoveRatio(col);
    owner.position.x += awayX * move;
    owner.position.z += awayZ * move;
    col.x += awayX * move;
    col.z += awayZ * move;
    const ud = owner.userData || (owner.userData = {});
    const v = ud.physicsVel || (ud.physicsVel = {x:0, y:0, z:0});
    const impactForce = physicsImpactForce(col);
    const impulse = Math.min(25, Math.max(0.4, impact || 1)) * massScale * impactForce;
    v.x += awayX * impulse * 0.62;
    v.z += awayZ * impulse * 0.62;
    if(col.coneLike || ud.isCone){
      v.y = Math.max(v.y || 0, Math.min(5.2, 0.45 + impulse * 0.11));
      const av = ud.physicsAng || (ud.physicsAng = {x:0, y:0, z:0});
      av.x += (Math.random() - .5) * impulse * 2.2;
      av.z += (Math.random() - .5) * impulse * 2.2;
    }
  }

  function separateColliderPair(a, b){
      if(!a || !b || a === b || a.enabled === false || b.enabled === false || a.compoundRoot || b.compoundRoot) return;
    const aMovable = canMoveCollider(a);
    const bMovable = canMoveCollider(b);
    if(!aMovable || !bMovable) return;
    const ar = colliderRadius(a), br = colliderRadius(b);
    if(ar <= 0 || br <= 0) return;
    let dx = b.x - a.x, dz = b.z - a.z;
    let d2 = dx * dx + dz * dz;
    if(d2 < 1e-8){
      dx = 1;
      dz = 0;
      d2 = 1;
    }
    const rr = ar + br;
    if(d2 >= rr * rr) return;
    const d = Math.sqrt(d2);
    const nx = dx / d, nz = dz / d;
    const penetration = rr - d;
    const invA = 1 / colliderMass(a);
    const invB = 1 / colliderMass(b);
    const invTotal = invA + invB;
    if(invTotal <= 0) return;
    const aShare = invA / invTotal;
    const bShare = invB / invTotal;
    moveColliderOwner(a, -nx * penetration * aShare, -nz * penetration * aShare);
    moveColliderOwner(b, nx * penetration * bShare, nz * penetration * bShare);

    const av = physicsVelocity(a);
    const bv = physicsVelocity(b);
    const relX = (bv ? bv.x || 0 : 0) - (av ? av.x || 0 : 0);
    const relZ = (bv ? bv.z || 0 : 0) - (av ? av.z || 0 : 0);
    const relN = relX * nx + relZ * nz;
    const push = Math.min(18, penetration * 8 + Math.max(0, -relN) * 0.45);
    if(av){
      av.x -= nx * push * aShare;
      av.z -= nz * push * aShare;
    }
    if(bv){
      bv.x += nx * push * bShare;
      bv.z += nz * push * bShare;
    }
  }

  function collidePhysicsObjects(){
    const all = [];
    for(const c of colliders.circle) if(c && c.enabled !== false) all.push(c);
    for(const b of colliders.box) if(b && b.enabled !== false) all.push(b);
    for(let pass = 0; pass < 2; pass++){
      for(let i = 0; i < all.length; i++){
        for(let j = i + 1; j < all.length; j++) separateColliderPair(all[i], all[j]);
      }
    }
  }

  function maybeScoreCollider(col, args){
    if(!col || !col.hitScore || col.hitCooldown > 0 || !args.onObjectHit) return;
    col.hitCooldown = 0.75;
    args.onObjectHit(col);
  }

  function solveVehicleImpact(col, args){
    const player = args.player;
    const nx = args.nx, nz = args.nz;
    const penetration = args.penetration;
    const vn = args.vn;
    const amount = args.amount == null ? penetration : args.amount;
    const objectRatio = col.physics ? physicsMoveRatio(col) : 0;
    const vehicleRatio = vehicleReactionRatio(col);
    player.pos.x += nx * penetration * (1 - objectRatio) * vehicleRatio;
    player.pos.z += nz * penetration * (1 - objectRatio) * vehicleRatio;
    nudgePhysicsOwner(col, -nx, -nz, amount, Math.max(0, -vn));
    if(vn >= 0) return 0;
    const bounce = col.physics ? physicsPlayerBounce(col) : (args.staticBounce == null ? 0.4 : args.staticBounce);
    const rebound = 1 + bounce;
    const damp = col.physics ? (1 - (1 - .94) * vehicleRatio) : (args.staticDamp == null ? .82 : args.staticDamp);
    player.vel.x -= rebound * vn * nx * vehicleRatio;
    player.vel.z -= rebound * vn * nz * vehicleRatio;
    player.vel.multiplyScalar(damp);
    if(col.physics) maybeScoreCollider(col, args);
    return -vn * (col.physics ? vehicleRatio : 1);
  }

  function collideCar(args){
    const player = args.player;
    const R = args.radius == null ? 1.4 : args.radius;
    const onlyPhysics = !!args.onlyPhysics;
    const driveSurfaceBlockersOnly = !!args.driveSurfaceBlockersOnly;
    let impact = 0;

    for(const c of colliders.circle){
      if(driveSurfaceBlockersOnly) continue;
      if(c && c.enabled === false) continue;
      if(isDriveSurfaceCollider(c)) continue;
      if(onlyPhysics && !c.physics) continue;
      const dx = player.pos.x - c.x, dz = player.pos.z - c.z, rr = c.r + R, d2 = dx * dx + dz * dz;
      if(d2 < rr * rr && d2 > 1e-6){
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        const penetration = rr - d;
        const vn = player.vel.x * nx + player.vel.z * nz;
        impact = Math.max(impact, solveVehicleImpact(c, Object.assign({}, args, {nx, nz, penetration, vn, amount: penetration})));
      }
    }

    for(const b of colliders.box){
      if(!b || b.enabled === false || b.compoundRoot) continue;
      const driveSurface = isDriveSurfaceCollider(b);
      if(driveSurfaceBlockersOnly && !driveSurface) continue;
      if(onlyPhysics && !driveSurfaceBlockersOnly && (driveSurface || !b.physics)) continue;
      const rot = Number(b.rotY != null ? b.rotY : b.rot) || 0;
      const cos = Math.cos(-rot), sin = Math.sin(-rot);
      const wx = player.pos.x - b.x, wz = player.pos.z - b.z;
      const dx = wx * cos - wz * sin;
      const dz = wx * sin + wz * cos;
      const ox = (b.hx || 1) + R - Math.abs(dx), oz = (b.hz || 1) + R - Math.abs(dz);
      if(ox > 0 && oz > 0){
        // drive surfaces stay solid until their top is actually reachable
        if(driveSurface && isDriveableSurfaceCollider(b) && canDriveThroughSurfaceCollider(b, player, args.surfaceYAt)) continue;
        if(ox < oz){
          const s = Math.sign(dx) || 1;
          const nx = s * Math.cos(rot), nz = s * Math.sin(rot);
          const vn = player.vel.x * nx + player.vel.z * nz;
          impact = Math.max(impact, solveVehicleImpact(b, Object.assign({}, args, {nx, nz, penetration:ox, vn, amount:ox, staticBounce:-0.65, staticDamp:1})));
        } else {
          const s = Math.sign(dz) || 1;
          const nx = -s * Math.sin(rot), nz = s * Math.cos(rot);
          const vn = player.vel.x * nx + player.vel.z * nz;
          impact = Math.max(impact, solveVehicleImpact(b, Object.assign({}, args, {nx, nz, penetration:oz, vn, amount:oz, staticBounce:-0.65, staticDamp:1})));
        }
      }
    }

    if(impact > 1.5 && args.onImpact) args.onImpact(impact);
    return impact;
  }

  function updatePhysicsObjects(dt){
    const update = col => {
      if(!col || !col.owner || col.compoundRoot || col.compoundPart) return;
      if(isDriveSurfaceCollider(col)) return;
      if(col.hitCooldown > 0) col.hitCooldown = Math.max(0, col.hitCooldown - dt);
      const ud = col.owner.userData || {};
      const surface = sampleDriveSurfaceAt(col.owner.position.x, col.owner.position.z);
      let v = ud.physicsVel;
      if(!v){
        if(!surface || !surface.normal || surface.normal.y > .985) return;
        v = ud.physicsVel = {x:0, y:0, z:0};
      }
      if(surface && surface.normal && surface.normal.y < .985){
        const n = surface.normal;
        const slope = Math.max(0, Math.min(1, 1 - n.y));
        v.x += 9.81 * n.y * n.x * dt * (1.3 + slope * 2.2);
        v.z += 9.81 * n.y * n.z * dt * (1.3 + slope * 2.2);
      }
      v.y = (v.y || 0) - 13 * dt;
      col.owner.position.x += (v.x || 0) * dt;
      col.owner.position.y = Math.max(0, col.owner.position.y + (v.y || 0) * dt);
      col.owner.position.z += (v.z || 0) * dt;
      if(surface && surface.y != null && col.owner.position.y < surface.y){
        col.owner.position.y = surface.y;
        if(v.y < 0) v.y *= -0.18;
      }
      col.x = col.owner.position.x;
      col.y = col.owner.position.y;
      col.z = col.owner.position.z;
      const av = ud.physicsAng;
      if(av){
        col.owner.rotation.x += (av.x || 0) * dt;
        col.owner.rotation.z += (av.z || 0) * dt;
        col.rotX = col.owner.rotation.x || 0;
        col.rotY = col.owner.rotation.y || 0;
        col.rotZ = col.owner.rotation.z || 0;
        col.rot = col.rotY;
        av.x *= Math.max(0, 1 - dt * 2.4);
        av.z *= Math.max(0, 1 - dt * 2.4);
      }
      if(col.owner.position.y <= 0 && v.y < 0) v.y *= -0.25;
      const damp = Math.max(0, 1 - dt * 2.2);
      v.x *= damp;
      v.z *= damp;
      if(Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z) < .08){
        ud.physicsVel = null;
        if(ud.physicsAng) ud.physicsAng = null;
      }
    };
    for(const c of colliders.circle) update(c);
    for(const b of colliders.box) update(b);
    collidePhysicsObjects();
  }

  return {
    constants,
    colliders,
    registry,
    srand,
    tagEntity,
    unregisterEntity,
    colliderSignature,
    collideCar,
    updatePhysicsObjects,
    sampleDriveSurfaceAt,
  };
}

window.LK_RUNTIME_WORLD_STATE = Object.freeze({create});
})();
