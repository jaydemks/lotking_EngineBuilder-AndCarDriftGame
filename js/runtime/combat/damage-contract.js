/* =========================================================
   LOT KING — Shared synchronous damage contract

   `userData.damageable` remains a plain numeric authoring contract. Runtime
   owners (Pawn vitals today, other health models tomorrow) can delegate its
   mutations without placing functions in scene data. This makes hitscan,
   explosions and Logic nodes agree about armour, lethal hits and metadata.
   ========================================================= */
(function(root){
'use strict';

const delegates = new WeakMap();
const MODES = Object.freeze({DAMAGE:'damage', HEAL:'heal', RESET:'reset'});

function finite(value, fallback){ const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, minimum, maximum){ return Math.max(minimum, Math.min(maximum, value)); }

function holderOf(object){
  let node = object || null;
  while(node){
    if(node.userData && node.userData.damageable) return node;
    node = node.parent || null;
  }
  return null;
}

function recordOf(object){
  const holder = holderOf(object);
  return holder && holder.userData ? holder.userData.damageable || null : null;
}

function vector(value){
  if(!value || typeof value !== 'object') return null;
  return {
    x:finite(value.x, 0),
    y:finite(value.y, 0),
    z:finite(value.z, 0),
  };
}

function metadata(source){
  const info = source && typeof source === 'object' ? source : {};
  const point = vector(info.point);
  const origin = vector(info.origin);
  let direction = vector(info.direction);
  if(!direction && point && origin){
    direction = {x:point.x - origin.x, y:point.y - origin.y, z:point.z - origin.z};
  }
  if(direction){
    const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z);
    if(length > .000001){ direction.x /= length; direction.y /= length; direction.z /= length; }
  }
  return {
    source:String(info.source || (info.explosion ? 'explosion' : 'unknown')),
    direction,
    point,
    origin,
    normal:vector(info.normal),
    instigatorPawnId:info.instigatorPawnId || info.pawnId || null,
    weapon:info.weapon || null,
    headshot:info.headshot === true,
    explosion:info.explosion === true,
    force:Math.max(0, finite(info.force, 0)),
    raw:info,
  };
}

function ensureRecord(object, source){
  if(!object) return null;
  const holder = holderOf(object) || object;
  if(!holder.userData) holder.userData = {};
  const previous = holder.userData.damageable;
  const record = previous && typeof previous === 'object' ? previous : {};
  holder.userData.damageable = record;
  const values = source && typeof source === 'object' ? source : {};
  const maxHealth = Math.max(1, finite(values.maxHealth, finite(values.health, finite(record.maxHealth, finite(record.health, 100)))));
  record.maxHealth = maxHealth;
  record.health = clamp(finite(values.health, finite(record.health, maxHealth)), 0, maxHealth);
  if(values.team != null) record.team = String(values.team);
  else if(record.team == null) record.team = 'neutral';
  if(values.pawnId !== undefined) record.pawnId = values.pawnId;
  return {holder, record};
}

function bind(object, handler, source){
  const ensured = ensureRecord(object, source);
  if(!ensured) return null;
  const normalized = typeof handler === 'function' ? {apply:handler} : handler;
  if(normalized && typeof normalized.apply === 'function') delegates.set(ensured.record, normalized);
  else delegates.delete(ensured.record);
  return ensured.record;
}

function unbind(object){
  const record = recordOf(object);
  if(!record) return false;
  return delegates.delete(record);
}

function resultFrom(holder, record, before, response, rawAmount, info){
  const maxHealth = Math.max(1, finite(response && response.maxHealth, finite(record.maxHealth, before)));
  const health = clamp(finite(response && response.health, finite(record.health, before)), 0, maxHealth);
  record.maxHealth = maxHealth;
  record.health = health;
  const actual = Math.max(0, finite(response && response.damage, before - health));
  const alreadyDown = before <= 0;
  const killed = !alreadyDown && (response && response.killed === true || response && response.dead === true || health <= 0);
  const at = Date.now();
  if(actual > 0) record.lastHitAt = at;
  if(killed) record.downedAt = at;
  return {
    holder,
    record,
    requestedDamage:rawAmount,
    damage:actual,
    health,
    maxHealth,
    armor:response && Number.isFinite(Number(response.armor)) ? Number(response.armor) : undefined,
    killed,
    dead:response && response.dead != null ? response.dead === true : health <= 0,
    alreadyDown,
    deathHandled:!!(response && response.deathHandled),
    info,
  };
}

function apply(object, amount, source){
  const holder = holderOf(object);
  if(!holder) return null;
  const record = holder.userData.damageable;
  const maxHealth = Math.max(1, finite(record.maxHealth, finite(record.health, 100)));
  const before = clamp(finite(record.health, maxHealth), 0, maxHealth);
  const requested = Math.max(0, finite(amount, 0));
  const info = metadata(source);
  if(before <= 0) return resultFrom(holder, record, before, {health:0, maxHealth, damage:0, dead:true}, requested, info);
  if(requested <= 0) return resultFrom(holder, record, before, {health:before, maxHealth, damage:0}, requested, info);

  const delegate = delegates.get(record);
  if(delegate){
    const response = delegate.apply(requested, info) || {};
    return resultFrom(holder, record, before, response, requested, info);
  }

  let remaining = requested;
  if(finite(record.armor, 0) > 0){
    const absorbShare = clamp(finite(record.armorAbsorb, .6), 0, 1);
    const absorbed = Math.min(finite(record.armor, 0), remaining * absorbShare);
    record.armor = Math.max(0, finite(record.armor, 0) - absorbed);
    remaining -= absorbed;
  }
  const health = clamp(before - remaining, 0, maxHealth);
  record.health = health;
  const response = {health, maxHealth, armor:record.armor, damage:before - health, dead:health <= 0};

  // Numeric scene props keep their old lightweight-body behaviour. The death
  // module owns Pawn bodies; the item system is the dependency-free fallback.
  if(health <= 0){
    const physics = root.LK_RUNTIME_PAWN_DEATH_PHYSICS;
    if(physics && typeof physics.handleObjectDeath === 'function'){
      response.deathHandled = physics.handleObjectDeath(holder, info) === true;
    }
  }
  return resultFrom(holder, record, before, response, requested, info);
}

function heal(object, amount, kind){
  const holder = holderOf(object);
  if(!holder) return 0;
  const record = holder.userData.damageable;
  const delegate = delegates.get(record);
  if(delegate && typeof delegate.heal === 'function') return finite(delegate.heal(amount, kind), 0);
  const field = kind === 'armor' ? 'armor' : 'health';
  const maximum = field === 'armor'
    ? Math.max(0, finite(record.maxArmor, finite(record.armor, 0)))
    : Math.max(1, finite(record.maxHealth, finite(record.health, 100)));
  const before = clamp(finite(record[field], 0), 0, maximum);
  record[field] = clamp(before + Math.max(0, finite(amount, 0)), 0, maximum);
  return record[field] - before;
}

function reset(object, source){
  const holder = holderOf(object) || object;
  if(!holder) return null;
  const existing = holder.userData && holder.userData.damageable;
  const delegate = existing && delegates.get(existing);
  if(delegate && typeof delegate.reset === 'function'){
    delegate.reset(source || {});
    return existing;
  }
  const values = source && typeof source === 'object' ? source : {};
  const ensured = ensureRecord(holder, values);
  if(!ensured) return null;
  ensured.record.health = clamp(finite(values.health, ensured.record.maxHealth), 0, ensured.record.maxHealth);
  if(values.armor != null) ensured.record.armor = Math.max(0, finite(values.armor, 0));
  const physics = root.LK_RUNTIME_PAWN_DEATH_PHYSICS;
  if(physics && typeof physics.restoreObject === 'function') physics.restoreObject(holder);
  return ensured.record;
}

function isDead(object){
  const record = recordOf(object);
  return !!record && finite(record.health, 0) <= 0;
}

const api = Object.freeze({MODES, holderOf, recordOf, metadata, ensureRecord, bind, unbind, apply, heal, reset, isDead});
root.LK_RUNTIME_DAMAGE_CONTRACT = api;
if(typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
