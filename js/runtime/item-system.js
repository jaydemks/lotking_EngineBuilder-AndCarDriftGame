/* =========================================================
   LOT KING — World items, inventory, pickups and drops

   One contract for everything a character can carry or consume:

     userData.item = {kind, ...}      an object in the scene IS an item

   Kinds:
     weapon    goes into the Pawn's weapon inventory and can be re-dropped
     health    heals on pickup                (medkits, bandages)
     armor     adds armour on pickup          (vests, plates)
     ammo      refills the equipped weapon's reserve
     custom    emits OnItemPickedUp and lets a Logic graph decide

   Authoring an item is therefore data-only: a level template, an imported GLB
   or a Logic Element only has to write the descriptor onto the object. The
   visual is whatever the object already is, so ANY model — primitive, GLB, FBX
   — becomes a pickup without a second code path.

   The Pawn side is `inventory`: a small ordered list of weapon definitions with
   their own ammo, plus equip/next/previous/drop. The first-person rig owns the
   live weapon; the inventory owns the ones being carried.

   Removing this script removes items and nothing else.
   ========================================================= */
(function(){
'use strict';

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }

const KINDS = Object.freeze(['weapon', 'health', 'armor', 'ammo', 'custom']);

// ------------------------------------------------ descriptors

function normalizeItem(source){
  const src = source && typeof source === 'object' ? source : {};
  const kind = KINDS.indexOf(String(src.kind || '').toLowerCase()) >= 0 ? String(src.kind).toLowerCase() : 'custom';
  return {
    kind,
    id:String(src.id || (kind + '-' + Math.random().toString(36).slice(2, 8))),
    name:String(src.name || defaultName(kind, src)),
    amount:clamp(finite(src.amount, kind === 'health' ? 35 : 60), 0, 100000),
    weapon:src.weapon && typeof src.weapon === 'object' ? clone(src.weapon) : (src.preset ? {preset:src.preset} : null),
    // A pickup can come back after a while, which is what makes an arena loop.
    respawn:clamp(finite(src.respawn, 0), 0, 600),
    radius:clamp(finite(src.radius, 1.5), .2, 12),
    autoPickup:src.autoPickup === true,
    // Kilograms. Mass is what decides how an object behaves when it is dropped,
    // thrown or shot: a light thing bounces and skitters, a heavy one lands and
    // stays. Bounce is derived from it unless the author overrides it.
    mass:clamp(finite(src.mass, 2.5), .05, 500),
    bounce:src.bounce == null ? null : clamp(finite(src.bounce, .3), 0, .95),
    radius3d:clamp(finite(src.radius3d, .18), .02, 2),
    // Off makes an item pick-up-only: it can be taken, but not lifted and
    // carried somewhere else. Fixed level rewards want this.
    carryable:src.carryable !== false,
    prompt:typeof src.prompt === 'string' ? src.prompt : '',
    // 'auto' asks the runtime to dress an authored placeholder with the same
    // model a dropped item gets, so a rifle waiting on a table is the rifle you
    // would see if you threw it there. Anything else - the default - leaves the
    // authored geometry exactly as it is, which is what a level that placed a
    // real GLB wants.
    visual:src.visual === 'auto' ? 'auto' : '',
    consumed:false,
    respawnTimer:0,
    armTimer:0,
  };
}

function defaultName(kind, src){
  if(kind === 'weapon') return String(src.preset || 'Weapon');
  if(kind === 'health') return 'Medkit';
  if(kind === 'armor') return 'Armour Plate';
  if(kind === 'ammo') return 'Ammo Box';
  return 'Item';
}

// Weapon items resolve their stats through the first-person weapon presets, so
// the pickup, the view model and the audio class can never disagree about what
// a "shotgun" is.
function weaponDefinition(source){
  const api = window.LK_RUNTIME_FIRST_PERSON;
  if(!api || !api.normalizeWeapon) return source ? clone(source) : null;
  return api.normalizeWeapon(source || {});
}

// ------------------------------------------------ inventory (per Pawn)
//
// The shape of the inventory is a PROJECT decision, not a hard-coded one, so the
// same runtime serves an arena shooter, a military shooter and a survival game:
//
//   'none'      nothing is carried. A picked-up weapon replaces what is in hand
//               and consumables are used the instant they are touched. Quake.
//   'slots'     a fixed number of weapon slots cycled with the swap key, and
//               consumables still used on pickup. Call of Duty.
//   'backpack'  weapon slots PLUS a pack that STORES consumables for later
//               instead of using them where they lie. Survival and RPG shaped.
//
// Everything below branches on `mode` and nothing else; adding a fourth shape
// means adding a fourth branch, not a second inventory.

const INVENTORY_MODES = Object.freeze(['none', 'slots', 'backpack']);

function normalizeInventory(source){
  const src = source && typeof source === 'object' ? source : {};
  const mode = INVENTORY_MODES.indexOf(String(src.mode || '').toLowerCase()) >= 0
    ? String(src.mode).toLowerCase() : 'slots';
  return {
    mode,
    // 'none' always holds exactly one weapon, whatever the author typed.
    weaponSlots:mode === 'none' ? 1 : Math.round(clamp(finite(src.weaponSlots, finite(src.capacity, 3)), 1, 12)),
    packSize:Math.round(clamp(finite(src.packSize, 12), 0, 60)),
    allowDrop:src.allowDrop !== false,
    autoEquip:src.autoEquip !== false,
  };
}

function slotOrder(){
  const api = window.LK_RUNTIME_FIRST_PERSON;
  return api && api.WEAPON_SLOTS ? api.WEAPON_SLOTS.map(slot => slot.id) : ['primary'];
}

function createInventory(pawn, options, hooks){
  const config = normalizeInventory(options);
  const onOverflow = hooks && typeof hooks.onOverflow === 'function' ? hooks.onOverflow : null;
  const capacity = config.weaponSlots;
  const slots = [];
  const pack = [];
  let index = -1;

  // The seven roles, in number-key order. A weapon claims the slot it declares,
  // so picking up a knife never displaces a rifle: they are not competing for
  // the same hand, they are competing for the same ROLE.
  function slotIndexOf(weapon){
    const order = slotOrder();
    const at = order.indexOf(String(weapon && weapon.assignedSlot || weapon && weapon.slot || 'primary'));
    return at >= 0 ? at : order.indexOf('primary');
  }
  // The slot a weapon should take: the first candidate role that is still
  // empty, so a second heavy weapon lands in the bonus slot rather than
  // throwing away the one already carried.
  function chooseSlot(weapon){
    const api = window.LK_RUNTIME_FIRST_PERSON;
    const candidates = api && api.slotsFor ? api.slotsFor(weapon) : [weapon.slot || 'primary'];
    const taken = id => slots.some(entry => entry.weapon.assignedSlot === id);
    return candidates.find(id => !taken(id)) || candidates[0] || 'primary';
  }
  // Equips by role rather than by position, which is what the number keys use.
  function equipSlot(slotId){
    const wanted = String(slotId || '');
    const at = slots.findIndex(entry => String(entry.weapon.assignedSlot || entry.weapon.slot) === wanted);
    if(at < 0) return false;
    return equip(at);
  }
  function equipSlotIndex(number){
    const order = slotOrder();
    return equipSlot(order[clamp(Math.round(finite(number, 0)), 0, order.length - 1)]);
  }

  function emit(type, payload){
    if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
    window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type, pawnId:pawn && pawn.id || null}, payload || {})}));
  }
  function rig(){ return pawn && pawn.firstPerson || null; }

  // The live weapon is the rig's; the slot is where its ammo is parked while
  // another weapon is equipped. Writing it back on every swap is what makes a
  // half-empty magazine survive a weapon change.
  function stash(){
    const view = rig();
    if(!view || index < 0 || !slots[index]) return;
    const ammo = view.ammo();
    slots[index].ammo = ammo.ammo;
    slots[index].reserve = ammo.reserve;
  }

  function equip(slotIndex){
    const next = clamp(Math.round(finite(slotIndex, 0)), 0, slots.length - 1);
    if(!slots.length) return false;
    stash();
    index = next;
    const entry = slots[index];
    const view = rig();
    if(view && view.equipWeapon) view.equipWeapon(entry.weapon, {ammo:entry.ammo, reserve:entry.reserve});
    emit('OnWeaponEquipped', {weapon:entry.weapon.id, name:entry.weapon.name, slot:index});
    return true;
  }

  function add(weaponSource, ammoState){
    const weapon = weaponDefinition(weaponSource);
    if(!weapon) return false;
    // Same ROLE, different weapon: the new one takes the slot and the old one is
    // handed back, which is how a shotgun replaces a rifle without touching the
    // knife or the grenades.
    weapon.assignedSlot = chooseSlot(weapon);
    const roleAt = slots.findIndex(entry => entry.weapon.assignedSlot === weapon.assignedSlot);
    if(roleAt >= 0 && slots[roleAt].weapon.name !== weapon.name){
      const previous = slots[roleAt];
      slots[roleAt] = {weapon, ammo:weapon.magazine, reserve:weapon.ammoReserve};
      if(index === roleAt) equip(roleAt);
      if(typeof onOverflow === 'function' && previous.weapon.kind !== 'unarmed') onOverflow(previous);
      return 'weapon';
    }
    const existing = slots.find(entry => entry.weapon.name === weapon.name && entry.weapon.preset === weapon.preset);
    if(existing){
      // Picking up a weapon already carried tops up its reserve instead of
      // producing a duplicate slot.
      const gained = ammoState && finite(ammoState.reserve, weapon.magazine) || weapon.magazine;
      existing.reserve = Math.min(weapon.ammoReserve, existing.reserve + gained);
      if(slots.indexOf(existing) === index) equip(index);
      emit('OnAmmoPickedUp', {weapon:weapon.name, reserve:existing.reserve});
      return 'ammo';
    }
    const entry = {
      weapon,
      ammo:ammoState ? clamp(finite(ammoState.ammo, weapon.magazine), 0, weapon.magazine) : weapon.magazine,
      reserve:ammoState ? clamp(finite(ammoState.reserve, weapon.ammoReserve), 0, 100000) : weapon.ammoReserve,
    };
    if(slots.length >= capacity){
      // Full loadout: the carried weapon is swapped for the new one, so a pickup
      // is never silently refused. In 'none' mode this IS the pickup rule rather
      // than an overflow case, which is why the swap ignores `allowDrop`.
      const dropped = drop(false, true);
      if(!dropped) return false;
      // The old weapon goes back into the world when the host wired a spawner,
      // so a swap leaves something behind instead of destroying it.
      if(typeof onOverflow === 'function') onOverflow(dropped);
    }
    slots.push(entry);
    // Kept in number-key order so slot 1 is always the fists and 7 the grenades,
    // whatever order things were picked up in.
    slots.sort((a, b) => slotIndexOf(a.weapon) - slotIndexOf(b.weapon));
    const at = slots.indexOf(entry);
    if(config.autoEquip || index < 0) equip(at);
    else if(at <= index) index++;
    return 'weapon';
  }

  // --- the pack ------------------------------------------------------------
  // Only 'backpack' mode has one. Consumables land here instead of being used
  // where they lie, and `useFromPack` is what finally spends them.
  function stores(){ return config.mode === 'backpack' && config.packSize > 0; }
  function store(item){
    if(!stores() || pack.length >= config.packSize) return false;
    pack.push({kind:item.kind, name:item.name, amount:item.amount});
    emit('OnItemStored', {kind:item.kind, name:item.name, amount:item.amount, count:pack.length});
    return true;
  }
  function useFromPack(at){
    if(!pack.length) return null;
    const slot = clamp(Math.round(finite(at, 0)), 0, pack.length - 1);
    const entry = pack[slot];
    const applied = applyToPawn(pawn, entry);
    if(!applied) return null;
    pack.splice(slot, 1);
    emit('OnItemUsed', {kind:entry.kind, name:entry.name, amount:entry.amount, count:pack.length});
    return entry;
  }

  // Removes the equipped weapon and returns its definition + ammo so the caller
  // can spawn a world pickup for it.
  function drop(emitEvent, allowed){
    if(allowed === false) return null;
    if(index < 0 || !slots[index]) return null;
    stash();
    const entry = slots.splice(index, 1)[0];
    index = slots.length ? clamp(index, 0, slots.length - 1) : -1;
    const view = rig();
    if(index >= 0) equip(index);
    else if(view && view.equipWeapon) view.equipWeapon(null);
    if(emitEvent !== false) emit('OnWeaponDropped', {weapon:entry.weapon.name});
    return entry;
  }

  function cycle(step){
    if(slots.length < 2) return false;
    const next = (index + (finite(step, 1) > 0 ? 1 : -1) + slots.length) % slots.length;
    return equip(next);
  }

  return Object.freeze({
    config:() => Object.assign({}, config),
    mode:() => config.mode,
    slots:() => slots.slice(),
    pack:() => pack.slice(),
    count:() => slots.length,
    capacity:() => capacity,
    index:() => index,
    current:() => (index >= 0 ? slots[index] : null),
    add,
    drop:(emitEvent) => drop(emitEvent, config.allowDrop),
    equip,
    cycle,
    stash,
    stores,
    store,
    useFromPack,
    equipSlot,
    equipSlotIndex,
    slotOrder,
    // A spent grenade leaves nothing to hold, so the hand falls back to whatever
    // else is carried rather than miming an empty fist with a grenade's stats.
    dropEmptyThrown(){
      const current = index >= 0 ? slots[index] : null;
      if(!current || current.weapon.kind !== 'thrown') return false;
      slots.splice(index, 1);
      index = slots.length ? clamp(index - 1, 0, slots.length - 1) : -1;
      if(index >= 0) equip(index);
      return true;
    },
    hasWeapon:() => index >= 0,
    clear(){ slots.length = 0; index = -1; const view = rig(); if(view && view.equipWeapon) view.equipWeapon(null); },
  });
}

// Spends a consumable on a Pawn. Shared by "used where it lies" and "used out
// of the pack later", so the two can never drift apart.
function applyToPawn(pawn, item){
  if(item.kind === 'health'){
    const vitals = pawn && pawn.vitals;
    if(!vitals) return null;
    const gained = vitals.heal(item.amount, 'health');
    return gained > 0 ? {kind:'health', gained} : null;   // full health leaves the medkit in place
  }
  if(item.kind === 'armor'){
    const vitals = pawn && pawn.vitals;
    if(!vitals) return null;
    const gained = vitals.heal(item.amount, 'armor');
    return gained > 0 ? {kind:'armor', gained} : null;
  }
  if(item.kind === 'ammo'){
    const view = pawn && pawn.firstPerson;
    if(!view || !view.addReserve) return null;
    const gained = view.addReserve(item.amount);
    return gained > 0 ? {kind:'ammo', gained} : null;
  }
  return {kind:item.kind || 'custom'};
}

// ------------------------------------------------ world item runtime

function create(GAME){
  const THREE = typeof window !== 'undefined' ? window.THREE : null;
  const spawned = [];                 // items this system created (drops, respawns)
  const carried = new Map();          // pawn id → {object, item} for physical carry
  const flying = [];                  // thrown items still in the air

  function scene(){ return GAME && GAME.core && GAME.core.scene || null; }
  function registry(){
    const world = GAME && GAME.world;
    return world && Array.isArray(world.registry) ? world.registry : [];
  }

  function emit(type, payload){
    if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
    window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type}, payload || {})}));
  }

  // Every object in the scene carrying a descriptor is an item, whether the
  // level authored it, a Logic Element created it or this system dropped it.
  // Same reasoning as the interaction registry: the pickup query runs for the
  // HUD prompt, the radar and the verb, so the filtered list is cached per
  // frame and invalidated when the registry changes size.
  const cache = {list:null, length:-1, at:0};
  const CACHE_MS = 120;
  function items(){
    const source = registry();
    const now = Date.now();
    if(cache.list && cache.length === source.length + spawned.length && now - cache.at < CACHE_MS) return cache.list;
    const out = [];
    source.forEach(object => {
      const data = object && object.userData && object.userData.item;
      if(!data) return;
      if(!data.__normalized){
        object.userData.item = normalizeItem(data);
        object.userData.item.__normalized = true;
      }
      // Anything that can be picked up can also just be CARRIED somewhere else,
      // so every item quietly gains the same `carry` contract a crate has. Pick
      // Up takes it; Use lifts it and puts it down where you want it. Declaring
      // it here rather than writing a second code path is what keeps the two
      // verbs consistent for weapons, ammo and level props alike.
      if(object.userData.item.carryable !== false && !object.userData.interact){
        object.userData.interact = {type:'carry', range:2.2, label:'Move ' + object.userData.item.name};
      }
      if(object.userData.item.visual === 'auto') dressAuthoredItem(object, object.userData.item);
      out.push(object);
    });
    spawned.forEach(object => { if(object.parent && out.indexOf(object) < 0) out.push(object); });
    cache.list = out;
    cache.length = source.length + spawned.length;
    cache.at = now;
    return out;
  }

  function distanceTo(object, position){
    if(!object || !object.position || !position) return Infinity;
    const dx = object.position.x - position.x;
    const dy = (object.position.y - position.y) * .6;   // vertical counts less
    const dz = object.position.z - position.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Nearest available item a Pawn could take right now, for the HUD prompt and
  // for the pickup verb. Both must agree, so there is exactly one query.
  function focus(pawn){
    const owner = pawn && pawn.owner;
    if(!owner || !owner.position) return null;
    let best = null;
    items().forEach(object => {
      const item = object.userData.item;
      if(!item || item.consumed) return;
      if(object.visible === false) return;
      if(item.armTimer > 0) return;
      const distance = distanceTo(object, owner.position);
      if(distance > item.radius) return;
      if(!best || distance < best.distance) best = {object, item, distance};
    });
    return best;
  }

  // --- consuming -----------------------------------------------------------

  function consume(object, pawn){
    const item = object && object.userData && object.userData.item;
    if(!item || item.consumed) return null;
    const result = applyItem(item, pawn);
    if(!result) return null;
    item.consumed = true;
    item.respawnTimer = item.respawn;
    object.visible = false;
    if(!item.respawn) removeItem(object);
    emit('OnItemPickedUp', {pawnId:pawn && pawn.id || null, kind:item.kind, name:item.name, amount:item.amount, item:item.id});
    return result;
  }

  function applyItem(item, pawn){
    if(item.kind === 'weapon'){
      const inventory = pawn && pawn.inventory;
      if(!inventory) return null;
      return inventory.add(item.weapon || {preset:'rifle'}, item.ammoState || null) ? {kind:'weapon'} : null;
    }
    // A backpack STORES consumables rather than spending them on the floor.
    // Everything else uses them immediately, which is also the fallback when a
    // pack is full: a pickup is never silently swallowed.
    const inventory = pawn && pawn.inventory;
    if(inventory && inventory.stores && inventory.stores() && item.kind !== 'custom'){
      if(inventory.store(item)) return {kind:item.kind, stored:true};
    }
    return applyToPawn(pawn, item);
  }

  // --- spawning ------------------------------------------------------------

  // The dropped weapon reuses the view-model geometry so a rifle on the floor
  // is recognisably the rifle that was in hand.
  // Dropped weapons look like the weapon; everything else gets a shape that
  // says what it is. White boxes told the player nothing.
  function buildVisual(item){
    if(!THREE) return null;
    if(item.kind === 'weapon'){
      const api = window.LK_RUNTIME_FPS_VIEW_MODEL;
      if(api && api.buildWorldModel){
        const model = api.buildWorldModel(THREE, weaponDefinition(item.weapon));
        if(model) return model;
      }
    }
    const group = new THREE.Group();
    if(item.kind === 'custom'){
      // A thrown object: a small dark body with a lit band, so it reads at a
      // glance whether it is in the air or lying in the grass.
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(.075, 10, 8),
        new THREE.MeshStandardMaterial({color:0x2f3a2c, roughness:.7, metalness:.3}));
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(.062, .016, 6, 12),
        new THREE.MeshStandardMaterial({color:0xd9a24a, roughness:.5, emissive:0xd9a24a, emissiveIntensity:.5}));
      band.rotation.x = Math.PI / 2;
      group.add(shell); group.add(band);
      return group;
    }
    if(item.kind === 'ammo'){
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(.38, .2, .26),
        new THREE.MeshStandardMaterial({color:0x4b5238, roughness:.85, metalness:.05}));
      const lid = new THREE.Mesh(
        new THREE.BoxGeometry(.4, .04, .28),
        new THREE.MeshStandardMaterial({color:0x3a4029, roughness:.8}));
      lid.position.y = .12;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(.26, .04, .01),
        new THREE.MeshStandardMaterial({color:0xd9b44a, emissive:0xd9b44a, emissiveIntensity:.45}));
      stripe.position.set(0, 0, .135);
      group.add(crate); group.add(lid); group.add(stripe);
      return group;
    }
    // Medkit or armour plate: a white case with a coloured cross or plate face.
    const color = item.kind === 'armor' ? 0x4a8fd9 : 0xd94a4a;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(.32, .2, .22),
      new THREE.MeshStandardMaterial({color:0xeef1f4, roughness:.55, metalness:.05}));
    const face = new THREE.MeshStandardMaterial({color, roughness:.45, emissive:color, emissiveIntensity:.4});
    if(item.kind === 'armor'){
      const plate = new THREE.Mesh(new THREE.BoxGeometry(.22, .13, .015), face);
      plate.position.z = .115;
      group.add(body); group.add(plate);
      return group;
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(.17, .045, .015), face);
    const post = new THREE.Mesh(new THREE.BoxGeometry(.045, .13, .015), face);
    bar.position.z = post.position.z = .115;
    group.add(body); group.add(bar); group.add(post);
    return group;
  }

  // An authored pickup marked `visual:'auto'` keeps its editor object - that is
  // what carries the transform, the contract and the save - and gains the same
  // model a dropped item gets, parented to it. The placeholder's MESH is what
  // gets hidden, never the object itself: the group's `visible` is authored
  // data that the store writes back on save, so hiding that would turn a
  // dressed pickup into an invisible one the next time the level is opened.
  function dressAuthoredItem(object, item){
    if(!THREE || !object || object.userData.itemVisualDressed) return null;
    object.userData.itemVisualDressed = true;
    const model = buildVisual(item);
    if(!model) return null;
    object.traverse(node => {
      if(node !== object && node.isMesh && !node.userData.itemAutoVisual) node.visible = false;
    });
    model.traverse(node => {
      node.userData.itemAutoVisual = true;
      node.userData.nonExportable = true;
      node.userData.runtimeVisual = true;
    });
    // The placeholder carries the object's scale; the model is authored in real
    // metres, so it has to undo whatever the primitive was scaled to.
    const sx = object.scale.x || 1, sy = object.scale.y || 1, sz = object.scale.z || 1;
    model.scale.set(1 / sx, 1 / sy, 1 / sz);
    object.add(model);
    object.userData.itemVisualModel = model;
    return model;
  }

  function spawnItem(descriptor, position, options){
    const item = normalizeItem(descriptor);
    item.__normalized = true;
    const visual = buildVisual(item);
    if(!visual) return null;
    const target = scene();
    if(!target) return null;
    visual.name = item.name;
    visual.userData.item = item;
    visual.userData.nonExportable = (options && options.persistent) !== true;
    visual.userData.runtimeVisual = true;
    if(position) visual.position.set(finite(position.x, 0), finite(position.y, 0), finite(position.z, 0));
    target.add(visual);
    spawned.push(visual);
    item.armTimer = PICKUP_DELAY;
    if(options && options.velocity){
      flying.push({object:visual, vx:finite(options.velocity.x, 0), vy:finite(options.velocity.y, 0), vz:finite(options.velocity.z, 0), spin:Math.random() * 4 - 2, resting:false});
    }
    emit('OnItemSpawned', {kind:item.kind, name:item.name, item:item.id});
    return visual;
  }

  function removeItem(object){
    if(!object) return false;
    const index = spawned.indexOf(object);
    if(index >= 0) spawned.splice(index, 1);
    if(object.parent) object.parent.remove(object);
    if(object.traverse) object.traverse(node => { if(node.geometry && node.userData.runtimeVisual) node.geometry.dispose(); });
    return true;
  }

  // --- verbs ---------------------------------------------------------------

  function pickup(pawn){
    const target = focus(pawn);
    if(!target) return null;
    return consume(target.object, pawn) ? target.item : null;
  }

  // Dropping and throwing are the same verb with a different launch speed, so a
  // tap places the weapon at your feet and a hold hurls it.
  // Newly spawned pickups are deaf to Pick Up for a moment. Without it a weapon
  // dropped by a full-loadout swap lands inside the player, is instantly within
  // pickup range again, and the two weapons trade places forever.
  const PICKUP_DELAY = .8;

  function dropWeapon(pawn, power){
    const inventory = pawn && pawn.inventory;
    const owner = pawn && pawn.owner;
    if(!inventory || !owner) return null;
    const entry = inventory.drop(true);
    if(!entry) return null;
    const yaw = owner.rotation ? finite(owner.rotation.y, 0) : 0;
    const pitch = pawn.firstPerson ? finite(pawn.firstPerson.viewAngles().pitch, 0) : 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const speed = clamp(finite(power, 0), 0, 1) * 11 + 1.4;
    const eye = finite(owner.position.y, 0) + 1.35;
    return spawnItem(
      {kind:'weapon', name:entry.weapon.name, weapon:entry.weapon, radius:1.6},
      {x:owner.position.x + fx * .6, y:eye, z:owner.position.z + fz * .6},
      {velocity:{x:fx * speed * Math.cos(pitch), y:speed * Math.sin(pitch) + 1.6, z:fz * speed * Math.cos(pitch)}}
    );
  }

  // --- frame ---------------------------------------------------------------

  // A small ballistic body with real contacts. Not a rigid-body solver: one
  // sphere against the arcade box colliders, resolved on the axis of least
  // penetration. That is enough for "a dropped rifle slides off a crate and a
  // thrown medkit bounces off a wall", which is the behaviour a level actually
  // shows, and it costs nothing next to a physics world.
  //
  // Restitution comes from MASS unless the item overrides it: light things
  // bounce, heavy things land and stay. Friction bleeds the tangential speed on
  // every contact so nothing skates forever.
  const GRAVITY = 19;
  const REST_SPEED = .55;          // below this a body is asleep
  function bounceOf(props){
    if(props.bounce != null) return props.bounce;
    return clamp(.52 - Math.log10(Math.max(1, props.mass)) * .30, .04, .55);
  }

  // Physical properties for ANYTHING that can be thrown, dropped or shot — not
  // just pickups. A level crate carries an `interact` contract and no `item`
  // one, and a shot target carries neither, but all three are objects with mass
  // that should fall. Resolving the properties here rather than demanding an
  // `item` is what lets one body serve all of them.
  function bodyProps(object){
    const data = object && object.userData || {};
    const source = data.item || data.physicsBody || {};
    const mass = finite(source.mass, finite(data.physicsMass, 2.5));
    return {
      mass:clamp(mass, .05, 500),
      bounce:source.bounce == null ? null : clamp(finite(source.bounce, .3), 0, .95),
      radius:clamp(finite(source.radius3d, .22), .02, 2),
    };
  }

  // A body must never collide with ITS OWN collider. A shooting target owns one,
  // so every frame it pushed itself back out of the box it is standing in, and
  // the fix-up alternated axes — which is exactly the irregular twitching a
  // shot target was doing on the spot.
  function ownsCollider(col, object){
    if(!col || !object) return false;
    let node = col.owner || null;
    while(node){
      if(node === object) return true;
      node = node.parent || null;
    }
    return false;
  }

  function stepBody(body, object, h){
    const props = bodyProps(object);
    const radius = props.radius;
    const restitution = bounceOf(props);
    const friction = clamp(.82 - restitution * .3, .3, .95);
    body.vy -= GRAVITY * h;
    object.position.x += body.vx * h;
    object.position.y += body.vy * h;
    object.position.z += body.vz * h;
    object.rotation.x += body.spin * h;
    object.rotation.y += body.spin * .6 * h;

    // --- walls, crates and decks -------------------------------------------
    const boxes = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
    if(Array.isArray(boxes)){
      for(let i = 0; i < boxes.length; i++){
        const col = boxes[i];
        if(!col || col.enabled === false || col.hy == null || col.y == null) continue;
        if(ownsCollider(col, object)) continue;
        const dx = object.position.x - col.x;
        const dy = object.position.y - col.y;
        const dz = object.position.z - col.z;
        const px = col.hx + radius - Math.abs(dx);
        const py = col.hy + radius - Math.abs(dy);
        const pz = col.hz + radius - Math.abs(dz);
        if(px <= 0 || py <= 0 || pz <= 0) continue;
        // Push out along the shallowest overlap and reflect that component.
        if(py <= px && py <= pz){
          object.position.y += (dy >= 0 ? 1 : -1) * py;
          body.vy = -body.vy * restitution;
          body.vx *= friction; body.vz *= friction; body.spin *= friction;
        } else if(px <= pz){
          object.position.x += (dx >= 0 ? 1 : -1) * px;
          body.vx = -body.vx * restitution;
          body.vz *= friction; body.spin *= .7;
        } else {
          object.position.z += (dz >= 0 ? 1 : -1) * pz;
          body.vz = -body.vz * restitution;
          body.vx *= friction; body.spin *= .7;
        }
      }
    }

    // --- the floor ----------------------------------------------------------
    const floor = groundAt(object.position.x, object.position.z, object.position.y, object) + radius * .7;
    if(object.position.y <= floor){
      object.position.y = floor;
      if(body.vy < 0) body.vy = -body.vy * restitution;
      body.vx *= friction; body.vz *= friction; body.spin *= friction;
      const planar = Math.sqrt(body.vx * body.vx + body.vz * body.vz);
      // Asleep: too slow to bounce again and too slow to slide.
      if(Math.abs(body.vy) < REST_SPEED && planar < REST_SPEED){
        body.resting = true;
        body.vx = body.vy = body.vz = 0;
        if(body.settleFlat !== false) object.rotation.set(0, object.rotation.y, 0);
      }
    }
    // A body that owns a collider has to take it along, or the world keeps
    // blocking where the object used to be.
    if(object.userData && object.userData.collider && window.LK_STORE && window.LK_STORE.syncCollider){
      window.LK_STORE.syncCollider(object);
    }
    return body;
  }

  // Kicks an item that is already lying around: a shot, an explosion, a shove.
  // Mass divides the impulse, which is what makes a crate shrug off a bullet
  // that sends a can flying.
  function impulse(object, direction, force){
    if(!object || !object.position || !object.userData) return false;
    // Static level geometry stays put: only things that declare themselves
    // movable are pushed. Everything else would have the world falling apart
    // the first time someone shot a wall.
    const data = object.userData;
    const movable = !!(data.item || data.physicsBody ||
      (data.interact && data.interact.type === 'carry') || data.damageable);
    if(!movable) return false;
    const props = bodyProps(object);
    const push = Math.max(0, finite(force, 6)) / Math.max(.05, props.mass);
    const dx = finite(direction && direction.x, 0);
    const dy = finite(direction && direction.y, 0);
    const dz = finite(direction && direction.z, 0);
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    let body = flying.find(entry => entry.object === object);
    if(!body){
      // A knocked-over target keeps whatever pose the graph gave it; a loose
      // item lands flat. `settleFlat` is what separates the two.
      body = {object, vx:0, vy:0, vz:0, spin:0, resting:false,
        settleFlat:!(data.damageable && !data.item)};
      flying.push(body);
    }
    body.resting = false;
    body.vx += dx / length * push;
    body.vy += dy / length * push + push * .22;   // a hit always lifts a little
    body.vz += dz / length * push;
    body.spin += (Math.random() * 2 - 1) * push * .6;
    return true;
  }

  function groundAt(x, z, from, ignore){
    const world = GAME && GAME.world;
    let best = world && typeof world.characterGroundHeight === 'function' ? finite(world.characterGroundHeight(x, z), 0) : 0;
    const boxes = world && world.colliders && world.colliders.box;
    if(Array.isArray(boxes)){
      for(let i = 0; i < boxes.length; i++){
        const col = boxes[i];
        if(!col || col.enabled === false || col.hy == null || col.y == null) continue;
        if(ignore && ownsCollider(col, ignore)) continue;
        if(Math.abs(x - col.x) > col.hx || Math.abs(z - col.z) > col.hz) continue;
        const top = col.y + col.hy;
        if(top <= from + .2 && top > best) best = top;
      }
    }
    return best;
  }

  // Shooting something you could have picked up should move it. The hitscan
  // already reports the object and the point; mass decides what that does.
  // A thrown weapon leaves the hand as an ordinary item with a fuse. It flies,
  // bounces and settles through the same body every other loose object uses;
  // the only thing that makes it a grenade is that it deals damage when its
  // time is up, or the moment it touches something if it is set to.
  function onWeaponThrown(event){
    const detail = event && event.detail || {};
    if(detail.type !== 'OnWeaponThrown') return;
    const visual = spawnItem({
      kind:'custom', name:detail.name, mass:.45, radius3d:.09, bounce:.42,
      carryable:false, radius:1.1,
    }, detail.origin, {velocity:detail.velocity});
    if(!visual) return;
    visual.userData.thrown = {
      damage:finite(detail.damage, 40),
      radius:clamp(finite(detail.radius, 6), .5, 40),
      fuse:2.4,
      pawnId:detail.pawnId || null,
      preset:detail.preset || null,
    };
  }
  if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('lk-pawn-event', onWeaponThrown);

  // Everything inside the radius takes damage, falling off with distance, and
  // anything with a body is thrown outward. One function, so a grenade and a
  // scripted explosion cannot disagree about what an explosion does.
  function detonate(object){
    const fuse = object.userData.thrown;
    if(!fuse) return false;
    const at = object.position;
    const runtime = window.LK_RUNTIME_FIRST_PERSON;
    (registry() || []).forEach(target => {
      if(!target || !target.position || target === object) return;
      const dx = target.position.x - at.x, dy = target.position.y - at.y, dz = target.position.z - at.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if(distance > fuse.radius) return;
      const falloff = 1 - distance / fuse.radius;
      if(target.userData && target.userData.damageable && runtime && runtime.applyDamage){
        runtime.applyDamage(target, fuse.damage * falloff);
      }
      impulse(target, {x:dx, y:dy + distance * .4, z:dz}, fuse.damage * falloff * .25);
    });
    emit('OnExplosion', {at:{x:at.x, y:at.y, z:at.z}, damage:fuse.damage, radius:fuse.radius, preset:fuse.preset});
    removeItem(object);
    return true;
  }

  function onWeaponHit(event){
    const detail = event && event.detail || {};
    if(detail.type !== 'OnWeaponHit' || !detail.object) return;
    // Walk up to whatever owns the movable contract: the mesh that was hit is
    // usually a child of the crate, the pickup or the target.
    let node = detail.object;
    while(node){
      const data = node.userData || {};
      if(data.item || data.physicsBody || (data.interact && data.interact.type === 'carry') || data.damageable) break;
      node = node.parent || null;
    }
    if(!node) return;
    const from = detail.origin;
    const at = detail.point;
    const direction = from && at
      ? {x:at.x - from.x, y:at.y - from.y, z:at.z - from.z}
      : {x:0, y:1, z:0};
    // Something with a health pool that is still standing ABSORBS the shot: a
    // target board being shoved around the range on every hit reads as broken
    // physics, not as impact. It only becomes a falling body once it is down.
    const health = node.userData && node.userData.damageable;
    const loose = !!(node.userData && (node.userData.item || node.userData.physicsBody ||
      (node.userData.interact && node.userData.interact.type === 'carry')));
    if(health && !loose && !detail.killed) return;
    const force = Math.max(2, finite(detail.damage, 20) * .35) * (detail.killed ? 4 : 1);
    impulse(node, direction, force);
  }
  if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('lk-pawn-event', onWeaponHit);

  function update(dt){
    const h = clamp(finite(dt, .016), .0001, .1);
    // Thrown items: a short ballistic arc that ends the moment they touch down.
    for(let i = flying.length - 1; i >= 0; i--){
      const body = flying[i];
      const object = body.object;
      if(!object || !object.parent){ flying.splice(i, 1); continue; }
      stepBody(body, object, h);
      if(body.resting) flying.splice(i, 1);
    }
    // Fuses. A thrown weapon counts down wherever it ended up, so a grenade
    // that bounced back at you is exactly as dangerous as one that did not.
    for(let i = spawned.length - 1; i >= 0; i--){
      const object = spawned[i];
      const fuse = object && object.userData && object.userData.thrown;
      if(!fuse) continue;
      fuse.fuse -= h;
      if(fuse.fuse <= 0) detonate(object);
    }
    // Respawning pickups, and the short arming delay on a fresh drop.
    items().forEach(object => {
      const item = object.userData.item;
      if(item && item.armTimer > 0) item.armTimer = Math.max(0, item.armTimer - h);
      if(!item || !item.consumed || !item.respawn) return;
      item.respawnTimer -= h;
      if(item.respawnTimer > 0) return;
      item.consumed = false;
      object.visible = true;
      emit('OnItemRespawned', {kind:item.kind, name:item.name, item:item.id});
    });
    // Idle bob makes a pickup readable from across the arena without a shader.
    const t = (GAME && GAME.state && finite(GAME.state.time, 0)) || (Date.now() * .001);
    spawned.forEach(object => {
      if(!object.userData.item || object.userData.item.kind === 'weapon') return;
      object.rotation.y += h * 1.1;
      object.position.y += Math.sin(t * 2.2) * h * .12;
    });
  }

  // Pre-benchmark warm-up: one visual of every pickup kind, added to the scene
  // so the benchmark's render and shader-compile passes cover them, then thrown
  // away. Without it the first medkit or dropped weapon to appear compiles its
  // material mid-play. See fps-view-model.js for the same reasoning applied to
  // the weapon models themselves.
  function warmup(){
    const target = scene();
    if(!THREE || !target) return {objects:[], dispose(){}};
    const objects = [];
    KINDS.forEach(kind => {
      const visual = buildVisual(normalizeItem({kind, preset:kind === 'weapon' ? 'rifle' : ''}));
      if(!visual) return;
      visual.traverse(child => { child.frustumCulled = false; });
      target.add(visual);
      objects.push(visual);
    });
    return {
      objects,
      dispose(){
        objects.forEach(node => {
          if(node.parent) node.parent.remove(node);
          node.traverse(child => { if(child.geometry) child.geometry.dispose(); });
          (node.userData.materials || []).forEach(material => material.dispose());
        });
        objects.length = 0;
      },
    };
  }

  function dispose(){
    if(typeof window !== 'undefined' && window.removeEventListener){
      window.removeEventListener('lk-pawn-event', onWeaponHit);
      window.removeEventListener('lk-pawn-event', onWeaponThrown);
    }
    spawned.slice().forEach(removeItem);
    flying.length = 0;
    carried.clear();
  }

  return Object.freeze({
    KINDS,
    items,
    focus,
    pickup,
    consume,
    dropWeapon,
    spawnItem,
    removeItem,
    impulse,
    detonate,
    update,
    warmup,
    dispose,
  });
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.items) return GAME.systems.items;
  GAME.systems.items = create(GAME);
  return GAME.systems.items;
}

window.LK_RUNTIME_ITEMS = Object.freeze({
  KINDS,
  INVENTORY_MODES,
  normalizeItem,
  normalizeInventory,
  weaponDefinition,
  createInventory,
  create,
  install,
});
})();
