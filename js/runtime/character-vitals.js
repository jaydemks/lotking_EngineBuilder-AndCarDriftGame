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

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  const maxHealth = clamp(finite(src.maxHealth, 100), 1, 100000);
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
    respawnOnDeath:src.respawnOnDeath !== false,
    respawnDelay:clamp(finite(src.respawnDelay, 2.5), 0, 60),
    team:String(src.team || 'player'),
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
  };

  function emit(type, payload){
    if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
    window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type, pawnId:pawn && pawn.id || null}, payload || {})}));
  }

  // Mirror onto the owner so the shared hitscan resolver can damage this Pawn.
  // `onDamage` is the hook that pulls the resolver's write back into the Pawn's
  // own state, which keeps armour and death in one place.
  function syncDamageable(){
    const owner = pawn && pawn.owner;
    if(!owner) return null;
    if(!owner.userData) owner.userData = {};
    const record = owner.userData.damageable || (owner.userData.damageable = {});
    record.health = state.health;
    record.maxHealth = config.maxHealth;
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
    if(!config.enabled || raw <= 0 || state.dead) return null;
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
    emit('OnCharacterDamaged', {
      damage:raw, health:state.health, maxHealth:config.maxHealth, armor:state.armor,
      source:info && info.source || 'unknown', direction:info && info.direction || null,
    });
    if(state.health <= 0) die(info);
    return {health:state.health, armor:state.armor, damage:raw, dead:state.dead};
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
    state.dead = true;
    state.health = 0;
    state.respawnTimer = config.respawnDelay;
    syncDamageable();
    emit('OnCharacterDied', {source:info && info.source || 'unknown'});
    return true;
  }

  function revive(full){
    state.dead = false;
    state.health = full === false ? Math.max(1, config.maxHealth * .5) : config.maxHealth;
    state.armor = config.armor;
    state.sinceHit = config.regenDelay;
    state.respawnTimer = 0;
    syncDamageable();
    emit('OnCharacterRevived', {health:state.health});
    return true;
  }

  function step(dt, move){
    if(!config.enabled) return state;
    const h = clamp(finite(dt, .016), .0001, .1);
    absorbExternalDamage();
    if(state.dead){
      if(!config.respawnOnDeath) return state;
      state.respawnTimer -= h;
      if(state.respawnTimer <= 0){
        revive(true);
        if(pawn && typeof pawn.reset === 'function') pawn.reset();
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
    const field = key.slice(7);
    const patch = Object.assign({}, config); patch[field] = value;
    Object.assign(config, normalizeConfig(patch));
    if(field === 'health') state.health = clamp(finite(value, state.health), 0, config.maxHealth);
    if(field === 'armor') state.armor = clamp(finite(value, state.armor), 0, config.maxArmor);
    state.health = Math.min(state.health, config.maxHealth);
    syncDamageable();
    return true;
  }

  syncDamageable();

  return Object.freeze({
    config:() => config,
    state,
    step,
    applyDamage,
    heal,
    die,
    revive,
    applyBinding,
    snapshot:() => ({
      health:state.health, maxHealth:config.maxHealth,
      armor:state.armor, maxArmor:config.maxArmor,
      stamina:state.stamina, maxStamina:config.maxStamina,
      dead:state.dead, sinceHit:state.sinceHit,
    }),
  });
}

function attach(GAME, pawn, source){
  if(!pawn) return null;
  const controller = create(GAME, pawn, source);
  const previousAfter = pawn.afterMovementStep;
  pawn.afterMovementStep = function(dt, move, snapshot){
    controller.step(dt, move);
    if(typeof previousAfter === 'function') previousAfter.call(this, dt, move, snapshot);
  };
  const previousReset = pawn.reset.bind(pawn);
  pawn.reset = function(){ const done = previousReset(); controller.revive(true); return done; };
  pawn.vitals = controller;
  return controller;
}

window.LK_RUNTIME_CHARACTER_VITALS = Object.freeze({normalizeConfig, create, attach});
})();
