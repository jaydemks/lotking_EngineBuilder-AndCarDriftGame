/* =========================================================
   LOT KING — Character vitals (health, armour, stamina)

   The player side of the damage contract already used by shootable props:
   a Pawn carrying a `vitals` block gets health, optional armour, regeneration
   and death, plus the events a HUD and a Logic graph need.

   The same `userData.damageable` shape the hitscan resolver writes is mirrored
   onto the Pawn owner, so a player Pawn is shootable by exactly the same code
   that damages a target board — there is no second damage path.

   Removing this script removes vitals and nothing else.
   ========================================================= */
(function(){
'use strict';

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
const RESPAWN_MODES = Object.freeze(['none','death','spawn','random']);
function respawnMode(source){
  const src=source&&typeof source==='object'?source:{};
  const explicit=String(src.respawnMode||'').toLowerCase();
  if(RESPAWN_MODES.indexOf(explicit)>=0)return explicit;
  // Old authored projects only had a boolean. Preserve an explicit `true`, but
  // make newly-created/missing configuration safe: corpses stay dead.
  return src.respawnOnDeath===true?'spawn':'none';
}

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  const maxHealth = clamp(finite(src.maxHealth, 100), 1, 100000);
  const deathRuntime = typeof window !== 'undefined' && window.LK_RUNTIME_PAWN_DEATH_PHYSICS;
  const deathPhysics = deathRuntime && typeof deathRuntime.normalizeConfig === 'function'
    ? deathRuntime.normalizeConfig(src.deathPhysics)
    : Object.assign({enabled:true, mode:'auto', profile:'auto', blendTime:.14, mass:72, impulseScale:.085,
        settleSeconds:2.8, boneMap:{}}, src.deathPhysics && typeof src.deathPhysics === 'object' ? src.deathPhysics : {});
  return {
    enabled:src.enabled !== false,
    maxHealth,
    health:clamp(finite(src.health, maxHealth), 0, maxHealth),
    maxArmor:clamp(finite(src.maxArmor, 100), 0, 100000),
    armor:clamp(finite(src.armor, 0), 0, 100000),
    // Fraction of incoming damage armour absorbs while it lasts.
    armorAbsorb:clamp(finite(src.armorAbsorb, .6), 0, 1),
    regen:clamp(finite(src.regen, 0), 0, 1000),           // health per second
    regenDelay:clamp(finite(src.regenDelay, 5), 0, 60),   // seconds after last hit
    // Stamina gates sprinting when a project wants it; 0 disables the system.
    maxStamina:clamp(finite(src.maxStamina, 0), 0, 1000),
    staminaDrain:clamp(finite(src.staminaDrain, 12), 0, 200),
    staminaRegen:clamp(finite(src.staminaRegen, 18), 0, 200),
    respawnMode:respawnMode(src),
    respawnOnDeath:respawnMode(src)!=='none',
    respawnDelay:clamp(finite(src.respawnDelay, 2.5), 0, 60),
    respawnRandomRadius:clamp(finite(src.respawnRandomRadius, 35), 1, 10000),
    team:String(src.team || 'player'),
    deathPhysics,
  };
}

function create(GAME, pawn, source){
  const config = normalizeConfig(source);
  const state = {
    health:config.health,
    armor:clamp(config.armor, 0, config.maxArmor),
    stamina:config.maxStamina,
    dead:false,
    sinceHit:config.regenDelay,
    respawnTimer:0,
    lastDamage:0,
    lastDamageAt:0,
    deathPosition:null,
  };
  const deathRuntime = typeof window !== 'undefined' && window.LK_RUNTIME_PAWN_DEATH_PHYSICS;
  const deathPhysics = deathRuntime && typeof deathRuntime.create === 'function'
    ? deathRuntime.create(GAME, pawn, config.deathPhysics) : null;

  function emit(type, payload){
    if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
    window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type, pawnId:pawn && pawn.id || null}, payload || {})}));
  }

  function damageInfo(source){
    const contract = typeof window !== 'undefined' && window.LK_RUNTIME_DAMAGE_CONTRACT;
    if(contract && typeof contract.metadata === 'function') return contract.metadata(source);
    const info = source && typeof source === 'object' ? source : {};
    return Object.assign({source:String(info.source || 'unknown')}, info);
  }

  // Mirror onto the owner so every weapon/Logic path sees numeric values, then
  // delegate mutations back here without storing a function in scene data.
  function syncDamageable(){
    const owner = pawn && pawn.owner;
    if(!owner) return null;
    if(!owner.userData) owner.userData = {};
    const contract = typeof window !== 'undefined' && window.LK_RUNTIME_DAMAGE_CONTRACT;
    let record = owner.userData.damageable || (owner.userData.damageable = {});
    if(contract && typeof contract.bind === 'function'){
      record = contract.bind(owner, damageDelegate, {
        health:state.health, maxHealth:config.maxHealth, team:config.team,
        pawnId:pawn && pawn.id || null,
      }) || record;
    }
    record.health = state.health;
    record.maxHealth = config.maxHealth;
    record.armor = state.armor;
    record.maxArmor = config.maxArmor;
    record.armorAbsorb = config.armorAbsorb;
    record.team = config.team;
    record.pawnId = pawn && pawn.id || null;
    return record;
  }

  // Pulls health written directly onto the mirrored record (by the hitscan
  // resolver) back into the Pawn, then re-applies armour rules to the delta.
  function absorbExternalDamage(){
    const record = pawn && pawn.owner && pawn.owner.userData && pawn.owner.userData.damageable;
    if(!record) return;
    const external = finite(record.health, state.health);
    if(external >= state.health - .0001) return;
    applyDamage(state.health - external, {source:'world'});
  }

  function applyDamage(amount, info){
    const raw = Math.max(0, finite(amount, 0));
    const owner = pawn && pawn.owner || null;
    const meta = damageInfo(info);
    if(!config.enabled || raw <= 0 || state.dead) return {
      holder:owner, health:state.health, maxHealth:config.maxHealth, armor:state.armor,
      damage:0, rawDamage:raw, dead:state.dead, killed:false, alreadyDown:state.dead,
      deathHandled:!!(deathPhysics && deathPhysics.status().active),
    };
    const beforeHealth = state.health;
    const beforeArmor = state.armor;
    let remaining = raw;
    if(state.armor > 0 && config.armorAbsorb > 0){
      const absorbed = Math.min(state.armor, remaining * config.armorAbsorb);
      state.armor -= absorbed;
      remaining -= absorbed;
    }
    state.health = clamp(state.health - remaining, 0, config.maxHealth);
    state.sinceHit = 0;
    state.lastDamage = raw;
    state.lastDamageAt = Date.now();
    syncDamageable();
    const actual = beforeHealth - state.health;
    const absorbed = beforeArmor - state.armor;
    emit('OnCharacterDamaged', {
      damage:actual, rawDamage:raw, absorbed, health:state.health, maxHealth:config.maxHealth, armor:state.armor,
      source:meta.source, direction:meta.direction || null, point:meta.point || null,
      origin:meta.origin || null, instigatorPawnId:meta.instigatorPawnId || null,
      headshot:meta.headshot === true, explosion:meta.explosion === true,
    });
    const killed = state.health <= 0 ? die(meta) : false;
    return {
      holder:owner, health:state.health, maxHealth:config.maxHealth, armor:state.armor,
      damage:actual, rawDamage:raw, absorbed, dead:state.dead, killed,
      alreadyDown:false, deathHandled:!!(deathPhysics && deathPhysics.status().active), info:meta,
    };
  }

  function heal(amount, kind){
    const raw = Math.max(0, finite(amount, 0));
    if(!config.enabled || raw <= 0) return 0;
    if(kind === 'armor'){
      const before = state.armor;
      state.armor = clamp(state.armor + raw, 0, config.maxArmor);
      emit('OnCharacterArmorChanged', {armor:state.armor, gained:state.armor - before});
      return state.armor - before;
    }
    if(state.dead) return 0;
    const before = state.health;
    state.health = clamp(state.health + raw, 0, config.maxHealth);
    syncDamageable();
    emit('OnCharacterHealed', {health:state.health, maxHealth:config.maxHealth, gained:state.health - before});
    return state.health - before;
  }

  function die(info){
    if(state.dead) return false;
    const meta = damageInfo(info);
    state.dead = true;
    state.health = 0;
    const position=pawn&&pawn.owner&&pawn.owner.position;
    state.deathPosition=position?{x:finite(position.x,0),y:finite(position.y,0),z:finite(position.z,0)}:null;
    state.respawnTimer = config.respawnDelay;
    syncDamageable();
    const deathHandled = !!(deathPhysics && deathPhysics.enter(meta));
    emit('OnCharacterDied', {
      source:meta.source, direction:meta.direction || null, point:meta.point || null,
      origin:meta.origin || null, instigatorPawnId:meta.instigatorPawnId || null,
      headshot:meta.headshot === true, explosion:meta.explosion === true, deathHandled,
    });
    return true;
  }

  function revive(full){
    const wasDead = state.dead;
    if(deathPhysics) deathPhysics.restore();
    state.dead = false;
    state.health = full === false ? Math.max(1, config.maxHealth * .5) : config.maxHealth;
    state.armor = config.armor;
    state.sinceHit = config.regenDelay;
    state.respawnTimer = 0;
    syncDamageable();
    if(wasDead) emit('OnCharacterRevived', {health:state.health});
    return true;
  }

  // The floor under a respawn point. The Pawn's own helper is preferred - it
  // knows about the level's character ground - and the world sweep is the
  // fallback for a headless/host controller created without one.
  function groundHeightAt(x,z,fallback){
    if(pawn&&typeof pawn.groundHeightAt==='function'){
      const fromPawn=Number(pawn.groundHeightAt(x,z,NaN));
      if(Number.isFinite(fromPawn))return fromPawn;
    }
    const world=GAME&&GAME.world;
    if(world&&typeof world.characterGroundHeight==='function'){
      const height=Number(world.characterGroundHeight(x,z));
      if(Number.isFinite(height))return height;
    }
    return finite(fallback,0);
  }

  function sceneBounds(){
    const candidates=[
      GAME&&GAME.world&&GAME.world.characterGround,
      GAME&&GAME.state&&GAME.state.characterGround,
      GAME&&GAME.state&&GAME.state.scene&&GAME.state.scene.characterGround,
      GAME&&GAME.sceneData&&GAME.sceneData.characterGround,
      GAME&&GAME.level&&GAME.level.characterGround,
    ];
    const found=candidates.find(value=>value&&Number.isFinite(Number(value.minX))&&Number.isFinite(Number(value.maxX))&&Number.isFinite(Number(value.minZ))&&Number.isFinite(Number(value.maxZ)));
    if(found)return {minX:finite(found.minX,0),maxX:finite(found.maxX,0),minZ:finite(found.minZ,0),maxZ:finite(found.maxZ,0)};
    const spawn=pawn&&pawn.config&&pawn.config.spawn||{x:0,z:0},radius=config.respawnRandomRadius;
    return {minX:finite(spawn.x,0)-radius,maxX:finite(spawn.x,0)+radius,minZ:finite(spawn.z,0)-radius,maxZ:finite(spawn.z,0)+radius};
  }

  function randomRespawnPoint(){
    const bounds=sceneBounds(),world=GAME&&GAME.world,boxes=world&&world.colliders&&world.colliders.box||[];
    const padding=.65,minX=Math.min(bounds.minX,bounds.maxX)+padding,maxX=Math.max(bounds.minX,bounds.maxX)-padding,minZ=Math.min(bounds.minZ,bounds.maxZ)+padding,maxZ=Math.max(bounds.minZ,bounds.maxZ)-padding;
    for(let attempt=0;attempt<18;attempt++){
      const x=minX+Math.random()*Math.max(.01,maxX-minX),z=minZ+Math.random()*Math.max(.01,maxZ-minZ);
      const y=world&&typeof world.characterGroundHeight==='function'?finite(world.characterGroundHeight(x,z),0):0;
      const blocked=Array.isArray(boxes)&&boxes.some(box=>box&&box.enabled!==false&&Math.abs(x-finite(box.x,0))<=Math.abs(finite(box.hx,0))+padding&&Math.abs(z-finite(box.z,0))<=Math.abs(finite(box.hz,0))+padding&&finite(box.y,0)+Math.abs(finite(box.hy,0))>y+.35);
      if(!blocked)return {x,y,z};
    }
    const spawn=pawn&&pawn.config&&pawn.config.spawn||{};
    return {x:finite(spawn.x,0),y:finite(spawn.y,0),z:finite(spawn.z,0)};
  }

  function respawn(){
    const mode=config.respawnMode;
    revive(true);
    // Reset clears movement/weapon-adjacent Pawn state first. The selected
    // respawn policy then decides the final world position.
    if(pawn&&typeof pawn.reset==='function')pawn.reset();
    const owner=pawn&&pawn.owner;
    const position=mode==='death'?state.deathPosition:(mode==='random'?randomRespawnPoint():null);
    if(position&&owner&&owner.position){
      // Land on the GROUND at the chosen spot, not at the Y the corpse happened
      // to hold: `deathPosition` is the standing origin, but a random point or a
      // moved spawn can sit above or below the floor there.
      const groundY=groundHeightAt(position.x,position.z,position.y);
      if(typeof owner.position.set==='function')owner.position.set(position.x,groundY,position.z);
      else Object.assign(owner.position,{x:position.x,y:groundY,z:position.z});
      // A respawn always stands up, whatever tipped the root over on the way down.
      if(owner.rotation){
        if(typeof owner.rotation.set==='function')owner.rotation.set(0,finite(owner.rotation.y,0),0);
        else {owner.rotation.x=0;owner.rotation.z=0;}
      }
      if(pawn&&pawn.state)Object.assign(pawn.state,{velocityX:0,velocityY:0,velocityZ:0,airborne:false,grounded:true});
      if(pawn&&pawn.movementController&&typeof pawn.movementController.reset==='function')pawn.movementController.reset(owner.rotation?finite(owner.rotation.y,0):0);
      if(pawn&&typeof pawn.syncRuntimeColliders==='function')pawn.syncRuntimeColliders();
    }
    emit('OnCharacterRespawned',{mode,position:owner&&owner.position?{x:finite(owner.position.x,0),y:finite(owner.position.y,0),z:finite(owner.position.z,0)}:null});
  }

  function step(dt, move){
    if(!config.enabled) return state;
    const h = clamp(finite(dt, .016), .0001, .1);
    absorbExternalDamage();
    if(state.dead){
      if(deathPhysics) deathPhysics.step(h);
      if(config.respawnMode==='none') return state;
      state.respawnTimer -= h;
      if(state.respawnTimer <= 0){
        // `create()` is also a public headless controller, so respawn cannot
        // assume attach() wrapped Pawn.reset. Revive is idempotent; an attached
        // reset wrapper may call it again without a duplicate event.
        respawn();
      }
      return state;
    }
    state.sinceHit += h;
    if(config.regen > 0 && state.sinceHit >= config.regenDelay && state.health < config.maxHealth){
      state.health = clamp(state.health + config.regen * h, 0, config.maxHealth);
      syncDamageable();
    }
    if(config.maxStamina > 0){
      const sprinting = !!(move && move.sprint === true && pawn && pawn.state && pawn.state.moving);
      state.stamina = clamp(
        state.stamina + (sprinting ? -config.staminaDrain : config.staminaRegen) * h, 0, config.maxStamina);
    }
    return state;
  }

  function applyBinding(path, value){
    const key = String(path || '');
    if(key.indexOf('vitals.') !== 0) return false;
    if(key.indexOf('vitals.deathPhysics.') === 0){
      const handled = deathPhysics && deathPhysics.applyBinding(key, value);
      if(handled) Object.assign(config.deathPhysics, deathPhysics.config());
      return !!handled;
    }
    const field = key.slice(7);
    const patch = Object.assign({}, config); patch[field] = value;
    if(field==='respawnMode')patch.respawnOnDeath=String(value||'none').toLowerCase()!=='none';
    if(field==='respawnOnDeath')patch.respawnMode=value===true?(config.respawnMode==='none'?'spawn':config.respawnMode):'none';
    Object.assign(config, normalizeConfig(patch));
    if(field === 'health') state.health = clamp(finite(value, state.health), 0, config.maxHealth);
    if(field === 'armor') state.armor = clamp(finite(value, state.armor), 0, config.maxArmor);
    state.health = Math.min(state.health, config.maxHealth);
    syncDamageable();
    return true;
  }

  const damageDelegate = Object.freeze({
    apply:applyDamage,
    heal,
    reset(){ revive(true); },
  });
  syncDamageable();

  return Object.freeze({
    config:() => config,
    state,
    step,
    applyDamage,
    heal,
    die,
    revive,
    deathPhysics,
    applyBinding,
    snapshot:() => ({
      health:state.health, maxHealth:config.maxHealth,
      armor:state.armor, maxArmor:config.maxArmor,
      stamina:state.stamina, maxStamina:config.maxStamina,
      dead:state.dead, sinceHit:state.sinceHit,
      deathPhysics:deathPhysics ? deathPhysics.status() : {active:false, kind:'none', settled:true},
    }),
  });
}

function attach(GAME, pawn, source){
  if(!pawn) return null;
  const controller = create(GAME, pawn, source);
  // Gate the complete Pawn frame while dead. This is intentionally outside
  // movement hooks: world verbs, AI actions and weapon hooks are also skipped,
  // while vitals/death physics and the respawn timer continue to tick.
  const previousStep = typeof pawn.step === 'function' ? pawn.step.bind(pawn) : null;
  if(previousStep) pawn.step = function(dt){
    if(controller.state.dead){
      if(this.disposed || this.enabled === false || this.started === false || this.sleeping === true) return;
      controller.step(dt, {});
      return;
    }
    return previousStep(dt);
  };
  const previousAfter = pawn.afterMovementStep;
  pawn.afterMovementStep = function(dt, move, snapshot){
    controller.step(dt, move);
    if(typeof previousAfter === 'function') previousAfter.call(this, dt, move, snapshot);
  };
  const previousReset = pawn.reset.bind(pawn);
  pawn.reset = function(){ controller.revive(true); return previousReset(); };
  const previousDispose = typeof pawn.dispose === 'function' ? pawn.dispose.bind(pawn) : null;
  pawn.dispose = function(){
    const contract = typeof window !== 'undefined' && window.LK_RUNTIME_DAMAGE_CONTRACT;
    if(contract && contract.unbind && this.owner) contract.unbind(this.owner);
    if(controller.deathPhysics) controller.deathPhysics.dispose();
    this.vitals = null;
    return previousDispose ? previousDispose() : undefined;
  };
  pawn.vitals = controller;
  return controller;
}

window.LK_RUNTIME_CHARACTER_VITALS = Object.freeze({normalizeConfig, create, attach});
})();
