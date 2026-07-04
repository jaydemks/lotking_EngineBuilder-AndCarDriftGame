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
      const j = arr.indexOf(col.ref);
      if(j >= 0) arr.splice(j, 1);
    }
  }

  function colliderSignature(){
    const parts = ['b' + colliders.box.length, 'c' + colliders.circle.length];
    for(const b of colliders.box) parts.push([b.x, b.z, b.hx, b.hz].map(v => Math.round(v * 100)).join(','));
    for(const c of colliders.circle) parts.push([c.x, c.z, c.r].map(v => Math.round(v * 100)).join(','));
    return parts.join('|');
  }

  function kickCones(cones, player, onConeHit){
    for(const cn of cones){
      if(!cn.m.parent || !cn.m.visible) continue;
      const dx = cn.m.position.x - player.pos.x, dz = cn.m.position.z - player.pos.z;
      if(dx * dx + dz * dz < 2.2 && player.vel.length() > 2 && !cn.hit){
        cn.hit = true;
        cn.vel.set(player.vel.x * .8 + (Math.random() - .5) * 3, 4 + Math.random() * 4, player.vel.z * .8 + (Math.random() - .5) * 3);
        cn.ang.set(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4);
        if(onConeHit) onConeHit(cn);
      }
    }
  }

  function collideCar(args){
    const player = args.player;
    const cones = args.cones || [];
    const R = args.radius == null ? 1.4 : args.radius;
    let impact = 0;

    for(const ax of ['x', 'z']){
      if(player.pos[ax] > constants.LOT - R){
        player.pos[ax] = constants.LOT - R;
        if(player.vel[ax] > 0){ impact = Math.max(impact, Math.abs(player.vel[ax])); player.vel[ax] *= -.35; }
      }
      if(player.pos[ax] < -constants.LOT + R){
        player.pos[ax] = -constants.LOT + R;
        if(player.vel[ax] < 0){ impact = Math.max(impact, Math.abs(player.vel[ax])); player.vel[ax] *= -.35; }
      }
    }

    for(const c of colliders.circle){
      const dx = player.pos.x - c.x, dz = player.pos.z - c.z, rr = c.r + R, d2 = dx * dx + dz * dz;
      if(d2 < rr * rr && d2 > 1e-6){
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        player.pos.x = c.x + nx * rr;
        player.pos.z = c.z + nz * rr;
        const vn = player.vel.x * nx + player.vel.z * nz;
        if(vn < 0){
          impact = Math.max(impact, -vn);
          player.vel.x -= 1.4 * vn * nx;
          player.vel.z -= 1.4 * vn * nz;
          player.vel.multiplyScalar(.82);
        }
      }
    }

    for(const b of colliders.box){
      const dx = player.pos.x - b.x, dz = player.pos.z - b.z;
      const ox = b.hx + R - Math.abs(dx), oz = b.hz + R - Math.abs(dz);
      if(ox > 0 && oz > 0){
        if(ox < oz){
          const s = Math.sign(dx) || 1;
          player.pos.x = b.x + s * (b.hx + R);
          if(player.vel.x * s < 0){ impact = Math.max(impact, Math.abs(player.vel.x)); player.vel.x *= -.35; }
        } else {
          const s = Math.sign(dz) || 1;
          player.pos.z = b.z + s * (b.hz + R);
          if(player.vel.z * s < 0){ impact = Math.max(impact, Math.abs(player.vel.z)); player.vel.z *= -.35; }
        }
      }
    }

    kickCones(cones, player, args.onConeHit);
    if(impact > 1.5 && args.onImpact) args.onImpact(impact);
    return impact;
  }

  function updateCones(cones, dt){
    for(const cn of cones){
      if(!cn.hit) continue;
      cn.vel.y -= 22 * dt;
      cn.m.position.addScaledVector(cn.vel, dt);
      cn.m.rotation.x += cn.ang.x * dt;
      cn.m.rotation.z += cn.ang.z * dt;
      if(cn.m.position.y < 0){
        cn.m.position.y = 0;
        cn.vel.y *= -.3;
        cn.vel.x *= .7;
        cn.vel.z *= .7;
        cn.ang.multiplyScalar(.6);
        if(cn.vel.length() < .5) cn.vel.set(0, 0, 0);
      }
    }
  }

  return {
    constants,
    colliders,
    registry,
    srand,
    tagEntity,
    unregisterEntity,
    colliderSignature,
    kickCones,
    collideCar,
    updateCones,
  };
}

window.LK_RUNTIME_WORLD_STATE = Object.freeze({create});
})();
