/* =========================================================
   LOT KING — World interactions (the Use key)

   One contract, one key. Any object in the scene becomes interactive by
   carrying a descriptor:

     userData.interact = {type, ...}

   Types shipped here:
     door      swings or slides open and closed, and moves its collider with it
     ladder    mounts the climb ability and rides it to the top
     carry     lifted and held in front of the character, released with Use
     dropZone  accepts a carried object and reports what was delivered
     button    a one-shot or toggling switch that drives a Logic graph
     climb     marks a face as climbable (rope, net, mesh fence)

   Focus resolution is shared by the HUD prompt and the verb itself, so what the
   prompt says is exactly what the key does. A look ray finds what is under the
   crosshair first; proximity is the fallback for third person and for objects
   just off-centre.

   The module owns no DOM and no camera. Removing it removes interaction and
   nothing else.
   ========================================================= */
(function(){
'use strict';

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

const TYPES = Object.freeze(['door', 'ladder', 'carry', 'dropZone', 'button', 'climb']);
// Authored data is case-insensitive, but the canonical names are camelCase, so
// a plain toLowerCase() comparison silently turned every 'dropZone' into a
// button. The lookup keeps both true at once.
const TYPE_BY_KEY = TYPES.reduce((map, type) => { map[type.toLowerCase()] = type; return map; }, {});

const PROMPTS = {
  door:{en:'Open', it:'Apri'},
  doorClose:{en:'Close', it:'Chiudi'},
  ladder:{en:'Climb', it:'Sali'},
  carry:{en:'Pick up', it:'Raccogli'},
  carryDrop:{en:'Release', it:'Lascia'},
  dropZone:{en:'Deliver', it:'Consegna'},
  button:{en:'Use', it:'Usa'},
  climb:{en:'Climb', it:'Arrampica'},
  locked:{en:'Locked', it:'Bloccato'},
};

function normalizeInteract(source){
  const src = source && typeof source === 'object' ? source : {};
  const type = TYPE_BY_KEY[String(src.type || '').trim().toLowerCase()] || 'button';
  return {
    type,
    id:String(src.id || (type + '-' + Math.random().toString(36).slice(2, 8))),
    label:typeof src.label === 'string' ? src.label : '',
    range:clamp(finite(src.range, type === 'dropZone' ? 2.6 : 2.4), .3, 14),
    enabled:src.enabled !== false,
    locked:src.locked === true,
    // door
    mode:src.mode === 'slide' ? 'slide' : 'swing',
    openAngle:finite(src.openAngle, Math.PI / 2 * (src.hinge === 'right' ? -1 : 1)),
    slide:Array.isArray(src.slide) ? src.slide.slice(0, 3).map(v => finite(v, 0)) : [0, 0, 2.1],
    speed:clamp(finite(src.speed, 2.6), .1, 20),
    open:src.open === true,
    autoClose:clamp(finite(src.autoClose, 0), 0, 120),
    // ladder / climb
    top:src.top == null ? null : finite(src.top, null),
    // carry
    holdDistance:clamp(finite(src.holdDistance, 1.55), .4, 4),
    holdHeight:finite(src.holdHeight, 1.15),
    // dropZone
    accepts:typeof src.accepts === 'string' ? src.accepts : '',
    // button
    toggle:src.toggle === true,
    once:src.once === true,
    event:typeof src.event === 'string' && src.event ? src.event : 'OnObjectInteracted',
    // runtime
    progress:src.open === true ? 1 : 0,
    fired:false,
    closeTimer:0,
    basis:null,
  };
}

// ------------------------------------------------ runtime

function create(GAME){
  const THREE = typeof window !== 'undefined' ? window.THREE : null;
  const carried = new Map();     // pawn id → {object, interact}
  const raycaster = THREE ? new THREE.Raycaster() : null;
  const rayOrigin = THREE ? new THREE.Vector3() : null;
  const rayDirection = THREE ? new THREE.Vector3() : null;
  const worldPoint = THREE ? new THREE.Vector3() : null;

  function registry(){
    const world = GAME && GAME.world;
    return world && Array.isArray(world.registry) ? world.registry : [];
  }
  function language(){
    return GAME && GAME.state && GAME.state.lang === 'it' ? 'it' : 'en';
  }
  function emit(type, payload){
    if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
    window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type}, payload || {})}));
  }
  function syncCollider(object){
    if(window.LK_STORE && window.LK_STORE.syncCollider) window.LK_STORE.syncCollider(object);
  }

  // The focus query runs for the HUD prompt and again for the verb, and the
  // registry is hundreds of entries in a dressed level. The filtered list is
  // therefore cached per frame and invalidated when the registry changes size.
  const cache = {list:null, length:-1, at:0};
  const CACHE_MS = 120;
  // World items carry the same `carry` contract as a level crate, but a DROPPED
  // one lives in the item system rather than in the scene registry. Merging the
  // two lists here is what lets Use lift a weapon off the floor and set it down
  // somewhere else.
  function itemObjects(){
    const items = GAME && GAME.systems && GAME.systems.items;
    return items && items.items ? items.items() : [];
  }
  function interactables(){
    const base = registry();
    const scanned = itemObjects();
    const source = scanned.length ? base.concat(scanned.filter(object => base.indexOf(object) < 0)) : base;
    const now = Date.now();
    if(cache.list && cache.length === source.length && now - cache.at < CACHE_MS) return cache.list;
    const out = [];
    source.forEach(object => {
      const data = object && object.userData && object.userData.interact;
      if(!data) return;
      if(!data.__normalized){
        object.userData.interact = normalizeInteract(data);
        object.userData.interact.__normalized = true;
      }
      const record = object.userData.interact;
      if(record.enabled === false) return;
      // Climbable faces are declared here but consumed by the abilities module,
      // which reads the collider, so they never show a prompt.
      if(record.type === 'climb'){
        markClimbable(object);
        return;
      }
      out.push(object);
    });
    cache.list = out;
    cache.length = source.length;
    cache.at = now;
    return out;
  }

  function markClimbable(object){
    const collider = object.userData && object.userData.collider && object.userData.collider.ref;
    if(collider) collider.climbable = true;
    object.userData.climbable = true;
  }

  function captureBasis(object, record){
    if(record.basis) return record.basis;
    record.basis = {
      x:object.position.x, y:object.position.y, z:object.position.z,
      rotY:object.rotation ? object.rotation.y : 0,
    };
    return record.basis;
  }

  // --- focus ---------------------------------------------------------------

  function promptFor(record, object, pawn){
    if(record.label) return record.label;
    const lang = language();
    if(record.locked) return PROMPTS.locked[lang];
    if(record.type === 'door') return (record.progress > .5 ? PROMPTS.doorClose : PROMPTS.door)[lang];
    if(record.type === 'carry') return (carried.get(pawn && pawn.id) ? PROMPTS.carryDrop : PROMPTS.carry)[lang];
    return (PROMPTS[record.type] || PROMPTS.button)[lang];
  }

  function objectPosition(object){
    if(!object) return null;
    if(worldPoint && object.getWorldPosition){ object.getWorldPosition(worldPoint); return worldPoint; }
    return object.position || null;
  }

  // What the Use key would act on right now. Looking at something wins; when
  // nothing is under the crosshair the nearest object in range is used, which
  // is what makes third person feel the same as first person.
  function focus(pawn){
    const owner = pawn && pawn.owner;
    if(!owner || !owner.position) return null;
    const held = carried.get(pawn.id);
    if(held){
      // While carrying, the only meaningful targets are a delivery zone or
      // releasing what is in hand.
      const zone = nearestOfType(pawn, 'dropZone');
      if(zone) return zone;
      return {object:held.object, interact:held.interact, distance:0, prompt:promptFor(held.interact, held.object, pawn), carrying:true};
    }
    const looked = lookTarget(pawn);
    if(looked) return looked;
    return nearest(pawn, null);
  }

  function lookTarget(pawn){
    const rig = pawn && pawn.firstPerson;
    if(!rig || !raycaster || !THREE) return null;
    const transform = rig.cameraTransform ? rig.cameraTransform() : null;
    if(!transform) return null;
    const list = interactables();
    if(!list.length) return null;
    rayOrigin.copy(transform.position);
    rayDirection.copy(transform.forward);
    raycaster.set(rayOrigin, rayDirection);
    raycaster.far = 4;
    const hits = raycaster.intersectObjects(list, true);
    for(let i = 0; i < hits.length; i++){
      const record = ownerRecord(hits[i].object);
      if(!record) continue;
      if(hits[i].distance > record.interact.range + 1.2) continue;
      return {object:record.object, interact:record.interact, distance:hits[i].distance,
        prompt:promptFor(record.interact, record.object, pawn)};
    }
    return null;
  }

  function ownerRecord(node){
    let current = node;
    while(current){
      if(current.userData && current.userData.interact && current.userData.interact.__normalized){
        return {object:current, interact:current.userData.interact};
      }
      current = current.parent || null;
    }
    return null;
  }

  function nearest(pawn, type){
    const owner = pawn && pawn.owner;
    if(!owner) return null;
    let best = null;
    interactables().forEach(object => {
      const record = object.userData.interact;
      if(type && record.type !== type) return;
      const position = objectPosition(object);
      if(!position) return;
      const dx = position.x - owner.position.x;
      const dy = (position.y - owner.position.y) * .5;
      const dz = position.z - owner.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if(distance > record.range) return;
      if(!best || distance < best.distance){
        best = {object, interact:record, distance, prompt:promptFor(record, object, pawn)};
      }
    });
    return best;
  }
  function nearestOfType(pawn, type){ return nearest(pawn, type); }

  // --- verbs ---------------------------------------------------------------

  function trigger(pawn){
    const held = carried.get(pawn && pawn.id);
    const target = focus(pawn);
    if(held){
      if(target && target.interact.type === 'dropZone') return deliver(pawn, target);
      return release(pawn);
    }
    if(!target) return null;
    const record = target.interact;
    if(record.locked){
      emit('OnInteractBlocked', {pawnId:pawn && pawn.id || null, id:record.id, reason:'locked'});
      return null;
    }
    if(record.type === 'door') return toggleDoor(target.object, record, pawn);
    if(record.type === 'ladder') return mountLadder(pawn, target.object, record);
    if(record.type === 'carry') return lift(pawn, target.object, record);
    if(record.type === 'button') return press(pawn, target.object, record);
    if(record.type === 'dropZone') return null;
    return null;
  }

  function toggleDoor(object, record, pawn){
    captureBasis(object, record);
    record.open = !(record.progress > .5);
    record.closeTimer = record.open ? record.autoClose : 0;
    emit(record.open ? 'OnDoorOpened' : 'OnDoorClosed', {pawnId:pawn && pawn.id || null, id:record.id, object});
    return {type:'door', open:record.open};
  }

  function mountLadder(pawn, object, record){
    const abilities = pawn && pawn.abilities;
    if(!abilities || !abilities.beginClimb) return null;
    const basis = objectPosition(object);
    const collider = object.userData && object.userData.collider && object.userData.collider.ref;
    const top = record.top != null ? record.top
      : (collider && collider.hy != null ? collider.y + collider.hy : finite(basis && basis.y, 0) + 3);
    const started = abilities.beginClimb({
      collider:collider || null, top, ladder:true,
      x:finite(basis && basis.x, 0), z:finite(basis && basis.z, 0),
    });
    if(started) emit('OnLadderMounted', {pawnId:pawn.id, id:record.id});
    return started ? {type:'ladder'} : null;
  }

  function lift(pawn, object, record){
    if(!pawn || carried.get(pawn.id)) return null;
    captureBasis(object, record);
    carried.set(pawn.id, {object, interact:record});
    const collider = object.userData && object.userData.collider && object.userData.collider.ref;
    // A carried object must stop being a wall, or the character shoves itself
    // around the level with it.
    if(collider){ record.__colliderWasEnabled = collider.enabled !== false; collider.enabled = false; }
    emit('OnObjectPickedUp', {pawnId:pawn.id, id:record.id, object});
    return {type:'carry', carrying:true};
  }

  function release(pawn){
    const held = carried.get(pawn && pawn.id);
    if(!held) return null;
    carried.delete(pawn.id);
    const collider = held.object.userData && held.object.userData.collider && held.object.userData.collider.ref;
    if(collider && held.interact.__colliderWasEnabled !== false) collider.enabled = true;
    // Let go, do not place. Handing the object to the item system's ballistic
    // body means it falls, bounces and settles like anything else that was
    // thrown; teleporting it onto the floor was the giveaway that carrying and
    // dropping were two unrelated systems.
    const items = GAME && GAME.systems && GAME.systems.items;
    const yaw = pawn.owner && pawn.owner.rotation ? finite(pawn.owner.rotation.y, 0) : 0;
    if(items && items.impulse && items.impulse(held.object, {x:Math.sin(yaw), y:.1, z:Math.cos(yaw)}, 2.2)){
      syncCollider(held.object);
    } else {
      dropToFloor(held.object);
      syncCollider(held.object);
    }
    emit('OnObjectReleased', {pawnId:pawn.id, id:held.interact.id, object:held.object});
    return {type:'carry', carrying:false};
  }

  function deliver(pawn, target){
    const held = carried.get(pawn && pawn.id);
    if(!held) return null;
    const zone = target.interact;
    if(zone.accepts && zone.accepts !== held.interact.id && zone.accepts !== held.object.name){
      emit('OnDeliveryRejected', {pawnId:pawn.id, id:zone.id, delivered:held.interact.id});
      return null;
    }
    carried.delete(pawn.id);
    const position = objectPosition(target.object);
    if(position && held.object.position){
      held.object.position.set(position.x, position.y + .35, position.z);
    }
    const collider = held.object.userData && held.object.userData.collider && held.object.userData.collider.ref;
    if(collider && held.interact.__colliderWasEnabled !== false) collider.enabled = true;
    syncCollider(held.object);
    emit('OnObjectDelivered', {pawnId:pawn.id, zone:zone.id, id:held.interact.id, object:held.object});
    return {type:'dropZone', delivered:held.interact.id};
  }

  function press(pawn, object, record){
    if(record.once && record.fired) return null;
    record.fired = true;
    if(record.toggle) record.open = !record.open;
    emit(record.event, {pawnId:pawn && pawn.id || null, id:record.id, object, state:record.open === true});
    return {type:'button', state:record.open === true};
  }

  function dropToFloor(object){
    if(!object || !object.position) return;
    const world = GAME && GAME.world;
    let floor = world && typeof world.characterGroundHeight === 'function'
      ? finite(world.characterGroundHeight(object.position.x, object.position.z), 0) : 0;
    const boxes = world && world.colliders && world.colliders.box;
    if(Array.isArray(boxes)){
      for(let i = 0; i < boxes.length; i++){
        const col = boxes[i];
        if(!col || col.enabled === false || col.hy == null || col.y == null) continue;
        if(col.owner === object) continue;
        if(Math.abs(object.position.x - col.x) > col.hx || Math.abs(object.position.z - col.z) > col.hz) continue;
        const top = col.y + col.hy;
        if(top <= object.position.y + .3 && top > floor) floor = top;
      }
    }
    object.position.y = floor + .3;
  }

  // --- frame ---------------------------------------------------------------

  function update(dt, pawns){
    const h = clamp(finite(dt, .016), .0001, .1);
    interactables().forEach(object => {
      const record = object.userData.interact;
      if(record.type !== 'door') return;
      const basis = captureBasis(object, record);
      const target = record.open ? 1 : 0;
      if(Math.abs(record.progress - target) < .0005){
        if(record.open && record.autoClose > 0){
          record.closeTimer -= h;
          if(record.closeTimer <= 0){ record.open = false; emit('OnDoorClosed', {id:record.id, object, auto:true}); }
        }
        return;
      }
      const step = record.speed * h;
      record.progress = target > record.progress
        ? Math.min(target, record.progress + step)
        : Math.max(target, record.progress - step);
      if(record.mode === 'slide'){
        object.position.set(
          basis.x + record.slide[0] * record.progress,
          basis.y + record.slide[1] * record.progress,
          basis.z + record.slide[2] * record.progress);
      } else if(object.rotation){
        object.rotation.y = basis.rotY + record.openAngle * record.progress;
      }
      syncCollider(object);
    });

    // Carried objects ride in front of the character, at the height a person
    // would hold a crate.
    (pawns || []).forEach(pawn => {
      const held = carried.get(pawn && pawn.id);
      if(!held || !pawn.owner || !held.object.position) return;
      const record = held.interact;
      const yaw = pawn.owner.rotation ? finite(pawn.owner.rotation.y, 0) : 0;
      const pitch = pawn.firstPerson ? finite(pawn.firstPerson.viewAngles().pitch, 0) : 0;
      const reach = record.holdDistance * Math.cos(pitch);
      held.object.position.set(
        pawn.owner.position.x + Math.sin(yaw) * reach,
        pawn.owner.position.y + record.holdHeight + Math.sin(pitch) * record.holdDistance,
        pawn.owner.position.z + Math.cos(yaw) * reach);
      if(held.object.rotation) held.object.rotation.y = yaw;
    });
  }

  function carrying(pawn){
    const held = carried.get(pawn && pawn.id);
    return held ? held.object : null;
  }

  function dispose(){ carried.clear(); }

  return Object.freeze({TYPES, normalizeInteract, focus, trigger, update, carrying, release, dispose});
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.interactions) return GAME.systems.interactions;
  GAME.systems.interactions = create(GAME);
  return GAME.systems.interactions;
}

window.LK_RUNTIME_INTERACTIONS = Object.freeze({TYPES, PROMPTS, normalizeInteract, create, install});
})();
