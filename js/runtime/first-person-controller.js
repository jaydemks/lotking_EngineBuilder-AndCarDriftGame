/* =========================================================
   LOT KING — First Person Pawn controller

   Adds a complete first-person view to any humanoid Character Pawn without
   touching the third-person path. Ownership boundary:

     · view          yaw/pitch angles, look sensitivity, clamping
     · camera        eye transform, view bob, ADS field of view, recoil kick
     · weapon        magazine, fire cadence, spread, hitscan and damage
     · damageable    opt-in health contract read by the hitscan resolver

   The module is DOM-free apart from the optional pointer bridge, so the whole
   controller can be exercised in node. `lot-king.js` owns the actual camera
   object and asks this module for a transform; nothing here writes to the
   renderer.
   ========================================================= */
(function(){
'use strict';

const DEG = Math.PI / 180;

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function dampAlpha(rate, dt){ return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)); }

// ------------------------------------------------ configuration

const FIRE_MODES = Object.freeze(['auto', 'semi', 'burst']);

// What a weapon fundamentally IS, which decides how the trigger behaves:
//
//   firearm   hitscan at range, costs a round
//   melee     hitscan at arm's length, costs nothing, swings on a cooldown
//   thrown    leaves the hand as a physical object and costs one from reserve
//   unarmed   melee with no model in hand — fists
//
// Everything else about a weapon is a number. This is the one field that
// changes what pulling the trigger means.
const WEAPON_KINDS = Object.freeze(['firearm', 'melee', 'thrown', 'unarmed']);

// The fixed loadout every character has, in the order the number keys select
// them. A slot is a ROLE, not a weapon: what sits in each one is a project
// decision, and an empty slot is simply skipped when cycling.
// `accepts` is a weapon CLASS, not a preset name, so a project can invent a
// weapon and it still lands in the right hand.
const WEAPON_SLOTS = Object.freeze([
  {id:'unarmed', label:'Fists', accepts:['unarmed']},
  {id:'primary', label:'Sidearm', accepts:['light']},
  {id:'secondary', label:'Primary', accepts:['heavy']},
  {id:'melee', label:'Melee', accepts:['melee']},
  {id:'tertiary', label:'Bonus', accepts:['heavy', 'light']},
  {id:'flash', label:'Flashbang', accepts:['flash']},
  {id:'grenade', label:'Grenade', accepts:['thrown']},
]);
// Which slots a weapon may occupy, in preference order: the first EMPTY one
// wins, so a second rifle goes to the bonus slot instead of displacing the
// first. Only when every candidate is full does a pickup replace one.
function weaponClass(weapon){
  if(!weapon) return 'heavy';
  if(weapon.kind === 'unarmed') return 'unarmed';
  if(weapon.kind === 'melee') return 'melee';
  if(weapon.kind === 'thrown') return String(weapon.slot) === 'flash' ? 'flash' : 'thrown';
  return weapon.weight === 'light' ? 'light' : 'heavy';
}
function slotsFor(weapon){
  const wanted = weaponClass(weapon);
  const explicit = WEAPON_SLOTS.filter(slot => slot.id === weapon.slot);
  const matching = WEAPON_SLOTS.filter(slot => slot.accepts.indexOf(wanted) >= 0);
  return (explicit.length ? explicit.concat(matching.filter(s => s !== explicit[0])) : matching).map(slot => slot.id);
}

// Weapon presets are runtime data, not authoring sugar: the `preset` binding
// resolves through them at runtime, so a Logic Element can swap loadout live.
const WEAPON_PRESETS = Object.freeze({
  rifle:{name:'Assault Rifle',mode:'auto',damage:22,fireRate:9.5,magazine:30,ammoReserve:180,reloadTime:1.9,range:140,pellets:1,spreadHip:.026,spreadAds:.005,recoilPitch:.018,recoilYaw:.006,recoilRecovery:8.5,headshotMultiplier:2},
  marksman:{name:'Marksman Rifle',mode:'semi',damage:58,fireRate:3.2,magazine:12,ammoReserve:72,reloadTime:2.3,range:260,pellets:1,spreadHip:.016,spreadAds:.001,recoilPitch:.042,recoilYaw:.008,recoilRecovery:6.5,headshotMultiplier:2.6,
    scope:{enabled:true,magnifications:[4,8,12],baseFov:70}},
  shotgun:{name:'Shotgun',mode:'semi',damage:13,fireRate:1.5,magazine:8,ammoReserve:48,reloadTime:2.8,range:38,pellets:9,spreadHip:.07,spreadAds:.045,recoilPitch:.06,recoilYaw:.014,recoilRecovery:5,headshotMultiplier:1.5},
  pistol:{name:'Sidearm',weight:'light',mode:'semi',damage:26,fireRate:5.5,magazine:15,ammoReserve:90,reloadTime:1.5,range:70,pellets:1,spreadHip:.032,spreadAds:.008,recoilPitch:.024,recoilYaw:.008,recoilRecovery:10,headshotMultiplier:2.2},
  smg:{name:'SMG',weight:'light',mode:'auto',damage:15,fireRate:14,magazine:35,ammoReserve:210,reloadTime:1.7,range:65,pellets:1,spreadHip:.04,spreadAds:.012,recoilPitch:.013,recoilYaw:.007,recoilRecovery:11,headshotMultiplier:1.8},
  // Always present, never runs out, never reloads. A character who drops the
  // last weapon still has something to do.
  fists:{name:'Fists',kind:'unarmed',slot:'unarmed',mode:'semi',damage:14,fireRate:2.4,range:2.1,
    magazine:1,ammoReserve:0,infiniteAmmo:true,spreadHip:0,spreadAds:0,recoilPitch:.012,recoilYaw:.004,headshotMultiplier:1.4},
  knife:{name:'Combat Knife',kind:'melee',slot:'melee',mode:'semi',damage:55,fireRate:2.1,range:2.4,
    magazine:1,ammoReserve:0,infiniteAmmo:true,spreadHip:0,spreadAds:0,recoilPitch:.014,recoilYaw:.005,headshotMultiplier:2},
  bat:{name:'Baseball Bat',kind:'melee',slot:'melee',mode:'semi',damage:75,fireRate:1.3,range:2.8,
    magazine:1,ammoReserve:0,infiniteAmmo:true,spreadHip:0,spreadAds:0,recoilPitch:.03,recoilYaw:.012,headshotMultiplier:1.6},
  flashbang:{name:'Flashbang',kind:'thrown',slot:'flash',weight:'light',mode:'semi',damage:8,fireRate:1,range:6,
    magazine:1,ammoReserve:3,reloadTime:.6,spreadHip:0,spreadAds:0,recoilPitch:.01,recoilYaw:.004},
  grenade:{name:'Frag Grenade',kind:'thrown',slot:'grenade',mode:'semi',damage:110,fireRate:1,range:7,
    magazine:1,ammoReserve:3,reloadTime:.6,spreadHip:0,spreadAds:0,recoilPitch:.012,recoilYaw:.005},
});
function weaponPreset(name){
  const key = String(name || '').trim().toLowerCase();
  return WEAPON_PRESETS[key] ? {key, values:WEAPON_PRESETS[key]} : null;
}

// A telescopic sight is a property of the WEAPON, not of the HUD: the rig owns
// the magnification and the field of view it implies, and the overlay only draws
// what the rig reports. That keeps the picture and the aim in agreement — a HUD
// that drew its own zoom would be lying about where the bullet goes.
// A visible round. It is weapon data, not an effect setting, because what a
// tracer looks like IS the calibre: a rifle round is a thin fast streak, a
// shotgun throws a short wide spray, a marksman round is long and slow enough to
// follow. Defaults are derived from damage so a custom weapon looks sane with
// nothing authored.
function normalizeTracer(source, damage){
  const src = source && typeof source === 'object' ? source : {};
  const heavy = clamp(finite(damage, 24) / 60, .25, 1.6);
  return {
    enabled:src.enabled !== false,
    // Metres per second the streak travels toward the impact point. It is a
    // visual speed: the hit itself is already resolved, so this never changes
    // where the bullet lands.
    speed:clamp(finite(src.speed, 220 + 120 * heavy), 20, 2000),
    length:clamp(finite(src.length, .9 + 1.4 * heavy), .05, 12),
    width:clamp(finite(src.width, .012 + .016 * heavy), .001, .3),
    color:finite(src.color, 0xffd9a0),
    // Not every round leaves a streak; one in three is the classic ratio.
    everyNth:Math.max(1, Math.round(clamp(finite(src.everyNth, 1), 1, 20))),
    fade:clamp(finite(src.fade, .06), .01, 2),
    impact:src.impact !== false,
    // Bullet holes. They are capped by a fixed pool, so the only cost of a long
    // life is that older holes are replaced sooner.
    decal:src.decal !== false,
    decalSeconds:clamp(finite(src.decalSeconds, 14), .5, 120),
  };
}

function normalizeScope(source){
  const src = source && typeof source === 'object' ? source : {};
  const levels = (Array.isArray(src.magnifications) && src.magnifications.length ? src.magnifications : [4, 8])
    .map(value => clamp(finite(value, 4), 1.2, 40))
    .slice(0, 6)
    .sort((a, b) => a - b);
  return {
    enabled:src.enabled === true,
    magnifications:levels,
    // The field of view at 1x. Every magnification divides it, so 70 / 8 is the
    // ~8.75 degrees an 8x scope actually shows.
    baseFov:clamp(finite(src.baseFov, 70), 20, 130),
    // Fraction of the frame height the lens circle covers.
    lens:clamp(finite(src.lens, .82), .2, 1),
    reticle:src.reticle === 'crosshair' || src.reticle === 'duplex' ? src.reticle : 'mildot',
    // How hard the glass bends and darkens toward its edge.
    distortion:clamp(finite(src.distortion, .6), 0, 1),
    vignette:clamp(finite(src.vignette, .72), 0, 1),
    // Time to raise the sight to the eye. Slower than an iron sight on purpose.
    raiseTime:clamp(finite(src.raiseTime, .16), .01, 2),
  };
}

function normalizeWeapon(source){
  const raw = source && typeof source === 'object' ? source : {};
  const preset = weaponPreset(raw.preset);
  const src = preset ? Object.assign({}, preset.values, raw) : raw;
  const mode = FIRE_MODES.indexOf(String(src.mode || '').toLowerCase()) >= 0 ? String(src.mode).toLowerCase() : 'auto';
  const magazine = Math.round(clamp(finite(src.magazine, 30), 1, 500));
  const kind = WEAPON_KINDS.indexOf(String(src.kind || '').toLowerCase()) >= 0
    ? String(src.kind).toLowerCase() : 'firearm';
  const weight = src.weight === 'light' ? 'light' : 'heavy';
  return {
    id:String(src.id || 'primary'),
    preset:preset ? preset.key : null,
    name:String(src.name || 'Primary Weapon'),
    kind,
    // Which of the seven roles this weapon occupies. Defaulted from the kind so
    // an authored weapon lands somewhere sensible with nothing declared.
    // The default role follows the kind, and for a firearm its weight: a
    // sidearm belongs in slot 2 and a rifle in slot 3 with nothing authored.
    slot:String(src.slot || (kind === 'unarmed' ? 'unarmed' : kind === 'melee' ? 'melee'
      : kind === 'thrown' ? 'grenade' : (weight === 'light' ? 'primary' : 'secondary'))),
    // How hard a thrown weapon leaves the hand, in metres per second.
    throwSpeed:clamp(finite(src.throwSpeed, 15), 1, 60),
    weight,
    mode,
    burstCount:Math.round(clamp(finite(src.burstCount, 3), 1, 10)),
    damage:clamp(finite(src.damage, 24), 0, 1000),
    headshotMultiplier:clamp(finite(src.headshotMultiplier, 2), 1, 10),
    range:clamp(finite(src.range, 120), 1, 4000),
    fireRate:clamp(finite(src.fireRate, 9), .2, 40),          // shots per second
    magazine,
    ammoReserve:Math.round(clamp(finite(src.ammoReserve, magazine * 5), 0, 100000)),
    // Fists and melee never run dry, whatever the author wrote.
    infiniteAmmo:src.infiniteAmmo === true || kind === 'unarmed' || kind === 'melee',
    reloadTime:clamp(finite(src.reloadTime, 1.9), .05, 12),
    spreadHip:clamp(finite(src.spreadHip, .028), 0, .5),
    spreadAds:clamp(finite(src.spreadAds, .006), 0, .5),
    spreadMoveGain:clamp(finite(src.spreadMoveGain, .9), 0, 6),
    pellets:Math.round(clamp(finite(src.pellets, 1), 1, 32)),
    recoilPitch:clamp(finite(src.recoilPitch, .02), 0, .6),
    recoilYaw:clamp(finite(src.recoilYaw, .006), 0, .6),
    recoilRecovery:clamp(finite(src.recoilRecovery, 8.5), .5, 60),
    scope:normalizeScope(src.scope),
    tracer:normalizeTracer(src.tracer, finite(src.damage, 24)),
  };
}

function normalizeSocket(source){
  const src = source && typeof source === 'object' ? source : {};
  const triple = (value, fallback) => {
    const list = Array.isArray(value) ? value : [];
    return [0, 1, 2].map(i => clamp(finite(list[i], fallback[i]), -20, 20));
  };
  return {
    // Empty means "find the right hand yourself". A name here wins outright.
    bone:typeof src.bone === 'string' ? src.bone.trim() : '',
    offset:triple(src.offset, [0, 0, 0]),
    rotation:triple(src.rotation, [0, 0, 0]),   // radians, on top of the aim orientation
    scale:clamp(finite(src.scale, 1), .05, 20),
    // Draws a small three-axis gizmo at the socket so it can be placed by eye.
    showHelper:src.showHelper === true,
  };
}

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? clone(source) : {};
  const bob = src.viewBob && typeof src.viewBob === 'object' ? src.viewBob : {};
  const third = src.thirdPerson && typeof src.thirdPerson === 'object' ? src.thirdPerson : {};
  return {
    enabled:src.enabled !== false,
    eyeHeight:clamp(finite(src.eyeHeight, 1.62), .2, 4),
    // Pitch limits are stored in degrees because that is what the inspector
    // shows; radians only exist inside the running view state.
    pitchMinDeg:clamp(finite(src.pitchMinDeg, -85), -89, 0),
    pitchMaxDeg:clamp(finite(src.pitchMaxDeg, 85), 0, 89),
    sensitivity:clamp(finite(src.sensitivity, 1), .05, 10),
    adsSensitivityScale:clamp(finite(src.adsSensitivityScale, .55), .05, 1),
    invertY:src.invertY === true,
    fov:clamp(finite(src.fov, 78), 20, 130),
    fovAds:clamp(finite(src.fovAds, 52), 20, 130),
    fovSprint:clamp(finite(src.fovSprint, 84), 20, 130),
    fovBlend:clamp(finite(src.fovBlend, 11), .5, 40),
    adsBlend:clamp(finite(src.adsBlend, 13), .5, 40),
    // `hideOwnBody` hides the whole character while the eye is inside its head.
    // `showLegs` is the middle ground: the body stays, only the head and
    // shoulders are culled, so the player can look down and see their feet.
    // Off by default because a full body costs a skinned draw the hidden path
    // does not pay.
    hideOwnBody:src.hideOwnBody !== false,
    showLegs:src.showLegs === true,
    // Starting view. `allowViewToggle` is what makes the Camera Mode key swap
    // between the eye and the over-the-shoulder camera at runtime.
    view:src.view === 'third' ? 'third' : 'first',
    allowViewToggle:src.allowViewToggle !== false,
    // The rig owns BOTH cameras. Third person is not the generic follow camera
    // with the rig switched off: it is the same look angles, the same weapon and
    // the same crosshair, seen from behind the shoulder. That is the only way
    // the two views can be equally playable.
    thirdPerson:{
      distance:clamp(finite(third.distance, 3.3), .6, 14),
      distanceAds:clamp(finite(third.distanceAds, 1.9), .4, 14),
      height:clamp(finite(third.height, 1.5), .1, 4),
      // Lateral offset of the camera from the character's spine. Positive is to
      // the right, which is what keeps the body out of the aiming line.
      shoulder:clamp(finite(third.shoulder, .62), -3, 3),
      shoulderAds:clamp(finite(third.shoulderAds, .48), -3, 3),
      fov:clamp(finite(third.fov, 68), 20, 130),
      fovAds:clamp(finite(third.fovAds, 52), 20, 130),
      // Radius kept clear of walls when the camera is pulled in toward the
      // character; without it the near plane clips through geometry.
      collisionRadius:clamp(finite(third.collisionRadius, .34), .05, 2),
      blend:clamp(finite(third.blend, 12), .5, 40),
    },
    // Weapons are optional: an unarmed Pawn still gets the view, the bob and
    // the crosshair-free HUD, and picks a weapon up from the world.
    startUnarmed:src.startUnarmed === true,
    // Leaning out from behind cover. The eye slides sideways and the whole view
    // rolls with it, which is what makes a corner readable without stepping
    // into the open. The body follows in third person.
    lean:{
      enabled:src.lean && src.lean.enabled === false ? false : true,
      // How far the eye actually moves. This is the part that lets you SEE
      // past a corner; the roll alone only looks like leaning.
      offset:clamp(finite(src.lean && src.lean.offset, .42), 0, 1.5),
      angle:clamp(finite(src.lean && src.lean.angle, .26), 0, 1.2),
      speed:clamp(finite(src.lean && src.lean.speed, 9), .5, 40),
      // Leaning while aiming is the whole point, so it is not scaled down.
      adsScale:clamp(finite(src.lean && src.lean.adsScale, 1), 0, 1),
    },
    // Where the weapon sits on the character in third person. Auto-detection
    // finds a right hand on most rigs, but "most" is not "all", so the socket is
    // authorable: name the bone, nudge the offset, and turn the helper on to see
    // exactly where it lands while you tune it.
    weaponSocket:normalizeSocket(src.weaponSocket),
    viewBob:{
      enabled:bob.enabled !== false,
      amplitude:clamp(finite(bob.amplitude, .035), 0, .4),
      frequency:clamp(finite(bob.frequency, 9.4), .5, 30),
      sway:clamp(finite(bob.sway, .022), 0, .4),
    },
    weapon:normalizeWeapon(src.weapon),
  };
}

// ------------------------------------------------ damage contract
// Anything in the scene can become shootable by carrying `userData.damageable`.
// Level templates and Logic Elements author it; the resolver below is the only
// place that mutates it, so health stays consistent across both paths.

function damageableOf(object){
  let node = object;
  while(node){
    if(node.userData && node.userData.damageable) return node;
    node = node.parent || null;
  }
  return null;
}

function isHeadshotNode(object){
  let node = object;
  while(node){
    if(node.userData && node.userData.damageableHitZone === 'head') return true;
    if(node.userData && node.userData.damageable) return false;
    node = node.parent || null;
  }
  return false;
}

function applyDamage(holder, amount){
  const target = holder && holder.userData && holder.userData.damageable;
  if(!target) return null;
  const maxHealth = finite(target.maxHealth, finite(target.health, 100));
  const before = finite(target.health, maxHealth);
  if(before <= 0) return {holder, damage:0, health:0, maxHealth, killed:false, alreadyDown:true};
  const health = clamp(before - Math.max(0, finite(amount, 0)), 0, maxHealth);
  target.health = health;
  target.maxHealth = maxHealth;
  target.lastHitAt = Date.now();
  const killed = health <= 0;
  if(killed) target.downedAt = target.lastHitAt;
  return {holder, damage:before - health, health, maxHealth, killed, alreadyDown:false};
}

// Reuses the Pawn event channel already routed into Logic Element graphs by
// logic-elements-runner.js, so first-person events need no extra plumbing.
function emit(detail){
  if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
  window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:detail || {}}));
}

// ------------------------------------------------ controller

function create(GAME, pawn, source){
  const THREE = typeof window !== 'undefined' ? window.THREE : null;
  const config = normalizeConfig(source);
  const state = {
    yaw:0,
    pitch:0,
    recoilPitch:0,
    recoilYaw:0,
    bobPhase:0,
    bobOffsetY:0,
    bobOffsetX:0,
    ads:0,                 // 0..1 blend, not the raw button
    adsHeld:false,
    adsForced:false,       // graph-driven aim, OR-ed with the player button
    fov:config.fov,
    cooldown:0,
    burstLeft:0,
    firePressed:false,
    reloadPressed:false,
    reloading:false,
    reloadTimer:0,
    ammo:config.weapon.magazine,
    reserve:config.weapon.ammoReserve,
    shotsFired:0,
    hits:0,
    kills:0,
    lastHit:null,
    bodyHidden:null,       // null = never applied, so the first sync always runs
    bodyMode:null,         // last applied visibility mode, same guard as above
    viewMode:config.view,  // 'first' | 'third' — toggled by the Camera Mode key
    viewTogglePressed:false,
    eyeOffset:0,           // crouch and other body-height effects, in metres
    armed:!config.startUnarmed,
    tpDistance:config.thirdPerson.distance,
    tpShoulder:config.thirdPerson.shoulder,
    lean:0,               // -1 fully left .. +1 fully right, blended
    weaponSide:1,         // +1 right shoulder, -1 left. Swapped by the player.
    swapPressed:false,
    zoomIndex:0,          // index into the weapon's magnification list
    scopeBlend:0,         // 0 sight down .. 1 eye against the glass
  };
  if(config.startUnarmed){ state.ammo = 0; state.reserve = 0; }

  // Reused vectors: the controller runs every frame and must not allocate.
  const eye = THREE ? new THREE.Vector3() : null;
  const forward = THREE ? new THREE.Vector3() : null;
  const right = THREE ? new THREE.Vector3() : null;
  const quaternion = THREE ? new THREE.Quaternion() : null;
  const euler = THREE ? new THREE.Euler(0, 0, 0, 'YXZ') : null;
  const raycaster = THREE ? new THREE.Raycaster() : null;
  const rayOrigin = THREE ? new THREE.Vector3() : null;
  const rayDirection = THREE ? new THREE.Vector3() : null;
  const pivot = THREE ? new THREE.Vector3() : null;
  const leanBase = THREE ? new THREE.Vector3() : null;
  const camPosition = THREE ? new THREE.Vector3() : null;

  function pitchLimits(){
    return {min:config.pitchMinDeg * DEG, max:config.pitchMaxDeg * DEG};
  }

  function syncFromOwner(){
    const owner = pawn && pawn.owner;
    if(owner && owner.rotation) state.yaw = finite(owner.rotation.y, state.yaw);
    return state.yaw;
  }

  // --- look -------------------------------------------------------------
  // Sign conventions, which the whole rig depends on:
  //   yaw    a heading of `yaw` faces (sin yaw, 0, cos yaw), the same
  //          convention character-movement.js and lot-king.js already use.
  //          Facing +Z, right is -X, so turning right DECREASES yaw.
  //   pitch  positive looks UP. Moving the mouse down must therefore lower it.
  //
  // Mouse deltas arrive in raw pixels; gamepad look arrives as a -1..1 axis
  // integrated over dt. Both funnel through the same clamp so sensitivity and
  // inversion behave identically across devices.
  // Turning the mouse the same distance must sweep the same ANGLE of the world
  // at every magnification, or a 12x scope becomes unusable. The extra factor is
  // normalized to 4x so a plain 4x scope keeps the familiar aim sensitivity.
  function zoomSensitivity(){
    if(!isScoped()) return 1;
    return clamp(4 / magnification(), .12, 1);
  }
  function applyLookDelta(dx, dy){
    const scale = .0022 * config.sensitivity * (1 - state.ads * (1 - config.adsSensitivityScale)) * zoomSensitivity();
    const limits = pitchLimits();
    state.yaw -= finite(dx, 0) * scale;
    state.pitch -= finite(dy, 0) * scale * (config.invertY ? -1 : 1);
    state.pitch = clamp(state.pitch, limits.min, limits.max);
    return {yaw:state.yaw, pitch:state.pitch};
  }
  function applyStickLook(lookX, lookY, dt){
    const rate = 2.6 * config.sensitivity * (1 - state.ads * (1 - config.adsSensitivityScale)) * zoomSensitivity();
    const limits = pitchLimits();
    state.yaw -= finite(lookX, 0) * rate * finite(dt, 0);
    state.pitch -= finite(lookY, 0) * rate * finite(dt, 0) * (config.invertY ? -1 : 1);
    state.pitch = clamp(state.pitch, limits.min, limits.max);
    return {yaw:state.yaw, pitch:state.pitch};
  }
  function setViewAngles(yaw, pitch){
    const limits = pitchLimits();
    if(yaw != null) state.yaw = finite(yaw, state.yaw);
    if(pitch != null) state.pitch = clamp(finite(pitch, state.pitch), limits.min, limits.max);
    return {yaw:state.yaw, pitch:state.pitch};
  }

  // --- weapon -----------------------------------------------------------
  // Animation slots are opt-in: with nothing bound the procedural weapon pose
  // carries the moment, and binding `fire` / `reload` in the Pawn's animation
  // slots swaps in a real clip without touching this file.
  function playWeaponAction(slot, duration){
    if(!pawn || typeof pawn.playAction !== 'function') return false;
    const clips = pawn.config && pawn.config.animations;
    if(!clips || !clips[slot]) return false;
    return pawn.playAction(slot, {fadeIn:.05, fadeOut:.12, duration});
  }

  function magazineFull(){ return state.ammo >= config.weapon.magazine; }
  function reserveEmpty(){ return !config.weapon.infiniteAmmo && state.reserve <= 0; }

  function reload(){
    if(state.reloading || magazineFull() || reserveEmpty()) return false;
    state.reloading = true;
    state.reloadTimer = config.weapon.reloadTime;
    state.burstLeft = 0;
    playWeaponAction('reload', config.weapon.reloadTime);
    emit({type:'OnWeaponReloadStarted', pawnId:pawn && pawn.id, weapon:config.weapon.id});
    return true;
  }
  function finishReload(){
    const missing = config.weapon.magazine - state.ammo;
    const taken = config.weapon.infiniteAmmo ? missing : Math.min(missing, state.reserve);
    state.ammo += taken;
    if(!config.weapon.infiniteAmmo) state.reserve -= taken;
    state.reloading = false;
    state.reloadTimer = 0;
    emit({type:'OnWeaponReloaded', pawnId:pawn && pawn.id, weapon:config.weapon.id, ammo:state.ammo, reserve:state.reserve});
  }

  // Swaps the live loadout. The inventory owns which weapons exist and their
  // parked ammo; this is the only place the RIG's idea of "the weapon in hand"
  // changes, so the view model, the audio class and the HUD all follow one
  // source of truth. `null` leaves the character unarmed.
  function equipWeapon(source, ammoState){
    state.reloading = false;
    state.reloadTimer = 0;
    state.burstLeft = 0;
    state.cooldown = 0;
    if(!source){
      state.armed = false;
      state.ammo = 0;
      state.reserve = 0;
      emit({type:'OnWeaponUnequipped', pawnId:pawn && pawn.id});
      return null;
    }
    Object.assign(config.weapon, normalizeWeapon(source));
    state.armed = true;
    state.zoomIndex = 0;
    state.scopeBlend = 0;
    state.ammo = ammoState ? clamp(finite(ammoState.ammo, config.weapon.magazine), 0, config.weapon.magazine) : config.weapon.magazine;
    state.reserve = ammoState ? Math.max(0, finite(ammoState.reserve, config.weapon.ammoReserve)) : config.weapon.ammoReserve;
    emit({type:'OnWeaponEquipped', pawnId:pawn && pawn.id, weapon:config.weapon.id, name:config.weapon.name, ammo:state.ammo, reserve:state.reserve});
    return config.weapon;
  }

  // Ammo boxes top up the reserve of whatever is in hand; an unarmed character
  // has nothing to fill, which is what makes the pickup refuse itself.
  function addReserve(amount){
    if(!state.armed) return 0;
    const room = Math.max(0, config.weapon.ammoReserve - state.reserve);
    const gained = Math.min(room, Math.max(0, finite(amount, 0)));
    state.reserve += gained;
    if(gained > 0) emit({type:'OnAmmoAdded', pawnId:pawn && pawn.id, reserve:state.reserve, gained});
    return gained;
  }

  // Crouch and other body-height effects shift the eye without rewriting the
  // configured standing height, so standing back up always returns exactly.
  function setEyeOffset(value){ state.eyeOffset = clamp(finite(value, 0), -2, 2); return state.eyeOffset; }

  function swapShoulder(){
    state.weaponSide = state.weaponSide >= 0 ? -1 : 1;
    emit({type:'OnShoulderSwapped', pawnId:pawn && pawn.id, side:state.weaponSide > 0 ? 'right' : 'left'});
    return state.weaponSide;
  }

  function setViewMode(mode){
    const next = mode === 'third' ? 'third' : 'first';
    if(next === state.viewMode) return state.viewMode;
    state.viewMode = next;
    state.bodyMode = null;             // force the visibility sync to re-run
    syncBodyVisibility();
    emit({type:'OnViewModeChanged', pawnId:pawn && pawn.id, view:state.viewMode});
    return state.viewMode;
  }
  function toggleViewMode(){ return setViewMode(state.viewMode === 'first' ? 'third' : 'first'); }

  // --- telescopic sight ---------------------------------------------------
  function scope(){ return config.weapon.scope; }
  function magnification(){
    const levels = scope().magnifications;
    return levels[clamp(state.zoomIndex, 0, levels.length - 1)] || 1;
  }
  // Scoped means "the eye is against the glass": aiming, armed, first person and
  // the weapon actually has a sight. Third person never scopes, because there is
  // no eye behind the weapon to look through.
  function isScoped(){
    return state.armed && scope().enabled && state.viewMode === 'first' && state.ads > .82 && !state.reloading;
  }
  function cycleZoom(direction){
    if(!scope().enabled) return magnification();
    const levels = scope().magnifications;
    const step = finite(direction, 1) >= 0 ? 1 : -1;
    state.zoomIndex = clamp(state.zoomIndex + step, 0, levels.length - 1);
    emit({type:'OnScopeZoomChanged', pawnId:pawn && pawn.id, magnification:magnification()});
    return magnification();
  }

  function currentSpread(){
    const base = config.weapon.spreadHip + (config.weapon.spreadAds - config.weapon.spreadHip) * state.ads;
    const speed = pawn && pawn.state ? finite(pawn.state.speed, 0) : 0;
    const airborne = pawn && pawn.state && pawn.state.airborne === true ? 1.6 : 1;
    return Math.max(0, base * (1 + speed * .06 * config.weapon.spreadMoveGain) * airborne);
  }

  // A dressed level is several hundred registry entries and a shotgun traces
  // one ray per pellet, so the filtered candidate list is cached and rebuilt
  // only when the scene actually changes size or a short window elapses —
  // rebuilding it per pellet was the dominant cost of a single shot.
  const candidates = {list:null, length:-1, at:0};
  const CANDIDATE_TTL_MS = 250;
  function hitCandidates(){
    const world = GAME && GAME.world;
    const registry = world && Array.isArray(world.registry) ? world.registry : [];
    const now = Date.now();
    if(candidates.list && candidates.length === registry.length && now - candidates.at < CANDIDATE_TTL_MS) return candidates.list;
    const owner = pawn && pawn.owner;
    candidates.list = registry.filter(object => {
      if(!object || object.visible === false) return false;
      if(object.userData && object.userData.editorOnly) return false;
      if(owner && object === owner) return false;
      return true;
    });
    candidates.length = registry.length;
    candidates.at = now;
    return candidates.list;
  }

  // Hitscan: one raycast per pellet, spread applied as a small random cone
  // around the exact view direction. Damage is only applied to nodes that
  // opted into the damageable contract; everything else is a blocking wall.
  function traceShot(){
    if(!THREE || !raycaster) return null;
    const transform = cameraTransform();
    if(!transform) return null;
    const spread = currentSpread();
    const owner = pawn && pawn.owner;
    const targets = hitCandidates();   // shared by every pellet of this shot
    const results = [];
    for(let pellet = 0; pellet < config.weapon.pellets; pellet++){
      rayOrigin.copy(transform.position);
      rayDirection.copy(transform.forward);
      if(spread > 0){
        rayDirection.x += (Math.random() - .5) * 2 * spread;
        rayDirection.y += (Math.random() - .5) * 2 * spread;
        rayDirection.z += (Math.random() - .5) * 2 * spread;
        rayDirection.normalize();
      }
      raycaster.set(rayOrigin, rayDirection);
      raycaster.far = config.weapon.range;
      const hits = raycaster.intersectObjects(targets, true);
      const hit = hits.find(item => {
        let node = item.object;
        while(node){
          if(node === owner) return false;
          node = node.parent || null;
        }
        return true;
      });
      if(!hit){
        // A miss still has an end point: it is where the round would have gone.
        // Tracers need it, and without it a missed shot has nothing to draw.
        results.push({
          hit:false, point:null, distance:config.weapon.range, object:null, damage:0,
          end:rayOrigin.clone().addScaledVector(rayDirection, config.weapon.range),
        });
        continue;
      }
      const holder = damageableOf(hit.object);
      const headshot = holder ? isHeadshotNode(hit.object) : false;
      const damage = config.weapon.damage * (headshot ? config.weapon.headshotMultiplier : 1);
      const applied = holder ? applyDamage(holder, damage) : null;
      results.push({
        hit:true,
        point:hit.point.clone(),
        end:hit.point.clone(),
        // World-space surface normal, so a bullet hole can lie flat on whatever
        // it hit instead of guessing an orientation from the shot direction.
        normal:hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null,
        distance:finite(hit.distance, 0),
        object:hit.object,
        holder,
        headshot,
        damage:applied ? applied.damage : 0,
        health:applied ? applied.health : null,
        killed:!!(applied && applied.killed),
      });
    }
    return results;
  }

  function fire(){
    if(!state.armed || state.reloading || state.cooldown > 0) return null;
    // A thrown weapon does not shoot: it leaves the hand as a real object, and
    // the item system carries it from there. It is the one kind whose "shot"
    // has no hitscan at all.
    if(config.weapon.kind === 'thrown') return throwWeapon();
    if(config.weapon.infiniteAmmo !== true && state.ammo <= 0){
      emit({type:'OnWeaponDryFire', pawnId:pawn && pawn.id, weapon:config.weapon.id});
      reload();
      return null;
    }
    if(config.weapon.infiniteAmmo !== true) state.ammo--;
    state.shotsFired++;
    // Hand the shot to the animation system as an ACTION, exactly like the
    // Character and Soccer packs do, so binding a real fire clip in the
    // animation slots replaces the procedural pose with no code change.
    playWeaponAction('fire', .22);
    state.cooldown = 1 / config.weapon.fireRate;
    // Recoil is added to the view angles and then decays; it never becomes a
    // separate camera offset, so aiming and the crosshair cannot disagree.
    state.sinceShot = 0;
    state.recoilPitch += config.weapon.recoilPitch * (1 - state.ads * .35);
    state.recoilYaw += (Math.random() - .5) * 2 * config.weapon.recoilYaw;
    const shots = traceShot() || [];
    const landed = shots.filter(shot => shot.hit && shot.holder);
    if(landed.length) state.hits++;
    const kills = landed.filter(shot => shot.killed);
    state.kills += kills.length;
    state.lastHit = landed[0] || null;
    // The muzzle: one allocation per shot, shared by every pellet. Tracers and
    // impact impulses both need to know where the round started, and deriving
    // it afterwards from the camera would be a frame late.
    const transform = cameraTransform();
    const origin = transform ? transform.position.clone() : null;
    const payload = {
      type:'OnWeaponFired', pawnId:pawn && pawn.id, weapon:config.weapon.id,
      ammo:state.ammo, reserve:state.reserve, shots, hit:landed.length > 0,
      killed:kills.length > 0, origin, tracer:config.weapon.tracer,
    };
    emit(payload);
    landed.forEach(shot => emit(Object.assign({type:'OnWeaponHit', pawnId:pawn && pawn.id, origin, tracer:config.weapon.tracer}, shot)));
    kills.forEach(shot => emit(Object.assign({type:'OnTargetDown', pawnId:pawn && pawn.id}, shot)));
    if(state.ammo <= 0 && config.weapon.infiniteAmmo !== true) reload();
    return payload;
  }

  // Throwing spends one from the reserve and hands a physical object to the item
  // system, which already knows how to make things fly, bounce and hurt what
  // they land on. Nothing here simulates anything.
  function throwWeapon(){
    if(state.reserve <= 0 && config.weapon.infiniteAmmo !== true){
      emit({type:'OnWeaponDryFire', pawnId:pawn && pawn.id, weapon:config.weapon.id});
      return null;
    }
    const transform = cameraTransform();
    if(!transform) return null;
    if(config.weapon.infiniteAmmo !== true) state.reserve--;
    state.cooldown = 1 / config.weapon.fireRate;
    state.recoilPitch += config.weapon.recoilPitch;
    playWeaponAction('throw', .4);
    const speed = config.weapon.throwSpeed;
    const payload = {
      type:'OnWeaponThrown', pawnId:pawn && pawn.id, weapon:config.weapon.id,
      name:config.weapon.name, preset:config.weapon.preset, damage:config.weapon.damage,
      radius:config.weapon.range, reserve:state.reserve,
      origin:{x:transform.position.x, y:transform.position.y, z:transform.position.z},
      velocity:{
        x:transform.forward.x * speed,
        y:transform.forward.y * speed + 1.6,
        z:transform.forward.z * speed,
      },
    };
    emit(payload);
    // Out of grenades: fall back to whatever else is carried rather than
    // leaving the player holding an empty hand they cannot use.
    if(state.reserve <= 0 && pawn && pawn.inventory && pawn.inventory.dropEmptyThrown) pawn.inventory.dropEmptyThrown();
    return payload;
  }

  // Graph-driven aim. It latches instead of writing `adsHeld` directly: that
  // field is recomputed from player input every frame, so a direct write would
  // be erased before it ever reached the camera.
  function setAimDownSights(value){
    state.adsForced = value === true;
    state.adsHeld = state.adsHeld || state.adsForced;
    return state.adsForced;
  }

  // --- frame ------------------------------------------------------------
  // preMovement runs before the shared movement controller so the character
  // body is already facing the view yaw when locomotion resolves. That keeps
  // strafing exactly perpendicular to the crosshair.
  function preMovement(dt, move){
    const h = clamp(finite(dt, .016), .0001, .1);
    const input = move || {};
    if(input.lookX || input.lookY) applyStickLook(input.lookX, input.lookY, h);

    // Camera Mode swaps eye and follow camera. Edge-triggered, because the
    // drive command reports the button as held for as long as it is down.
    if(config.allowViewToggle){
      if(input.viewToggle === true && !state.viewTogglePressed) toggleViewMode();
      state.viewTogglePressed = input.viewToggle === true;
    }
    // Shoulder swap. The crosshair never moves: only the weapon, the arms and
    // the third-person camera offset mirror, which is the whole point — you
    // change which side of cover you can shoot from without changing your aim.
    if(input.swapShoulder === true && !state.swapPressed) swapShoulder();
    state.swapPressed = input.swapShoulder === true;

    // Lean. Both keys at once cancels out, which is the natural reading and
    // saves a priority rule nobody would remember.
    const leanTarget = (input.leanRight === true ? 1 : 0) - (input.leanLeft === true ? 1 : 0);
    state.lean += (leanTarget - state.lean) * dampAlpha(config.lean.speed, h);
    if(Math.abs(state.lean) < .002) state.lean = 0;
    if(pawn && pawn.state) pawn.state.lean = state.lean;

    state.adsHeld = input.aim === true || state.adsForced === true;
    const adsTarget = state.adsHeld && !state.reloading ? 1 : 0;
    state.ads += (adsTarget - state.ads) * dampAlpha(config.adsBlend, h);

    if(input.reload === true && !state.reloadPressed) reload();
    state.reloadPressed = input.reload === true;

    if(state.reloading){
      state.reloadTimer -= h;
      if(state.reloadTimer <= 0) finishReload();
    }
    state.cooldown = Math.max(0, state.cooldown - h);

    const firing = state.armed && input.fire === true;
    if(config.weapon.mode === 'auto'){
      if(firing) fire();
    } else if(config.weapon.mode === 'semi'){
      if(firing && !state.firePressed) fire();
    } else {
      if(firing && !state.firePressed) state.burstLeft = config.weapon.burstCount;
      if(state.burstLeft > 0 && state.cooldown <= 0 && fire()) state.burstLeft--;
    }
    state.firePressed = firing;

    const owner = pawn && pawn.owner;
    if(owner && owner.rotation) owner.rotation.y = state.yaw + state.recoilYaw;
    return false;
  }

  // afterMovementStep only consumes the movement snapshot, so recoil decay and
  // view bob stay in sync with the distance actually travelled this frame.
  function afterMovement(dt, move, snapshot){
    const h = clamp(finite(dt, .016), .0001, .1);
    const recovery = dampAlpha(config.weapon.recoilRecovery, h);
    state.recoilPitch -= state.recoilPitch * recovery;
    state.recoilYaw -= state.recoilYaw * recovery;

    const speed = snapshot ? finite(snapshot.speed, 0) : 0;
    const grounded = snapshot ? snapshot.grounded !== false : true;
    if(config.viewBob.enabled && grounded && speed > .2){
      state.bobPhase += h * config.viewBob.frequency * clamp(speed / 4, .35, 1.8);
      const intensity = clamp(speed / 5.5, 0, 1) * (1 - state.ads * .8);
      state.bobOffsetY = Math.sin(state.bobPhase * 2) * config.viewBob.amplitude * intensity;
      state.bobOffsetX = Math.sin(state.bobPhase) * config.viewBob.sway * intensity;
    } else {
      const settle = dampAlpha(9, h);
      state.bobOffsetY -= state.bobOffsetY * settle;
      state.bobOffsetX -= state.bobOffsetX * settle;
    }

    // Hip FOV widens while sprinting; aiming interpolates from the current hip
    // FOV toward the sight FOV so the two effects never fight each other.
    const sprinting = snapshot ? snapshot.sprinting === true : false;
    // The view model lowers the weapon while sprinting, but only when the
    // player is not actually trying to aim through it.
    // Sprinting lowers the weapon — until the player pulls the trigger. Running
    // and shooting is a real thing to want to do, and a weapon that stays at the
    // hip while it fires reads as broken. The window outlives the cadence so an
    // automatic burst does not strobe the pose.
    state.sinceShot = finite(state.sinceShot, 9) + h;
    state.sprintPose = sprinting && state.ads < .25 && state.sinceShot > .45;
    const third = state.viewMode === 'third';
    const hipFov = third ? config.thirdPerson.fov : (sprinting ? config.fovSprint : config.fov);
    // A telescopic sight replaces the iron-sight field of view outright: the
    // magnification IS the field of view, so the picture and the reticle cannot
    // drift apart.
    const scoped = isScoped();
    state.scopeBlend += ((scoped ? 1 : 0) - state.scopeBlend) * dampAlpha(1 / scope().raiseTime, h);
    const adsFov = third ? config.thirdPerson.fovAds
      : (scope().enabled ? scope().baseFov / magnification() : config.fovAds);
    const targetFov = hipFov + (adsFov - hipFov) * state.ads;
    state.fov += (targetFov - state.fov) * dampAlpha(config.fovBlend, h);
    // Aiming in third person brings the camera in over the shoulder instead of
    // narrowing the FOV alone, which is what makes the reticle usable.
    const tpAlpha = dampAlpha(config.thirdPerson.blend, h);
    const wantDistance = config.thirdPerson.distance + (config.thirdPerson.distanceAds - config.thirdPerson.distance) * state.ads;
    const wantShoulder = config.thirdPerson.shoulder + (config.thirdPerson.shoulderAds - config.thirdPerson.shoulder) * state.ads;
    state.tpDistance += (wantDistance - state.tpDistance) * tpAlpha;
    state.tpShoulder += (wantShoulder - state.tpShoulder) * tpAlpha;
    syncBodyVisibility();
    return state;
  }

  // The camera sits inside the character's head, so the own body must not be
  // rendered as-is for the owning player. Three modes:
  //
  //   'visible'  third person, or a first-person rig that keeps its body
  //   'hidden'   the whole character is culled (cheapest, the default)
  //   'legs'     only head-and-shoulders geometry is culled, so looking down
  //              shows a real body — the Unreal-style "first person legs" look
  //
  // The traversal is guarded by the last applied mode: it runs on state
  // changes, not every frame.
  const HEAD_PARTS = /head|neck|face|hair|helmet|hat|eye|jaw|teeth|tongue|beard|collar|shoulder/i;
  function bodyMode(){
    if(!firstPersonView()) return 'visible';
    if(config.showLegs) return 'legs';
    return config.hideOwnBody ? 'hidden' : 'visible';
  }
  function syncBodyVisibility(){
    const owner = pawn && pawn.owner;
    if(!owner || !owner.traverse) return;
    const mode = bodyMode();
    if(state.bodyMode === mode) return;
    state.bodyMode = mode;
    state.bodyHidden = mode !== 'visible';
    owner.traverse(node => {
      if(!node || node === owner || !node.isObject3D) return;
      if(!(node.isMesh || node.isSkinnedMesh)) return;
      if(node.userData.firstPersonBaseVisible === undefined) node.userData.firstPersonBaseVisible = node.visible !== false;
      const base = node.userData.firstPersonBaseVisible !== false;
      if(mode === 'visible'){ node.visible = base; return; }
      if(mode === 'hidden'){ node.visible = false; return; }
      const label = [node.name, node.material && node.material.name, node.parent && node.parent.name].join(' ');
      node.visible = base && !HEAD_PARTS.test(label);
    });
  }

  // --- camera -----------------------------------------------------------
  // The frame's camera transform, whichever view is active. lot-king.js copies
  // it onto the shared game camera; nothing else is allowed to move that camera
  // while the rig owns the output.
  //
  // Every consumer downstream — the hitscan, the interaction look ray, the view
  // model — reads this one function, so the crosshair, the bullet and the "what
  // would Use do" query can never disagree about where the player is looking.
  function cameraTransform(){
    const transform = eyeTransform();
    if(!transform) return null;
    return state.viewMode === 'first' ? transform : shoulderTransform(transform);
  }

  // The eye: inside the character's head. In third person it stays the pivot the
  // shoulder camera orbits, so both views share one set of look angles.
  function eyeTransform(){
    if(!THREE || !eye) return null;
    const owner = pawn && pawn.owner;
    if(!owner) return null;
    owner.updateMatrixWorld(true);
    owner.getWorldPosition(eye);
    // Recoil kicks the view up, so it ADDS to pitch under the positive-is-up
    // convention above.
    const pitch = clamp(state.pitch + state.recoilPitch, pitchLimits().min - .2, pitchLimits().max + .2);
    const yaw = state.yaw + state.recoilYaw;
    const lean = config.lean.enabled ? state.lean * (1 - state.ads * (1 - config.lean.adsScale)) : 0;
    // A Three.js camera looks down its own -Z, while an engine heading of `yaw`
    // faces +Z. Without this half-turn the camera points exactly opposite to
    // the direction the character walks, which reads as every control being
    // inverted at once.
    // The roll is the Z of a YXZ euler, which is a rotation about the camera's
    // own forward axis — a real lean, not a sideways slide with a tilted image.
    euler.set(pitch, yaw + Math.PI, -lean * config.lean.angle, 'YXZ');
    quaternion.setFromEuler(euler);
    forward.set(0, 0, -1).applyQuaternion(quaternion);   // == (cosP·sinYaw, sinP, cosP·cosYaw)
    right.set(1, 0, 0).applyQuaternion(quaternion);
    eye.y += config.eyeHeight + state.eyeOffset + state.bobOffsetY;
    eye.addScaledVector(right, state.bobOffsetX);
    if(lean !== 0){
      // Sliding the eye through a wall would let a player see into rooms they
      // are not in, so the lean is stopped by whatever it runs into.
      leanBase.copy(eye);
      eye.addScaledVector(right, lean * config.lean.offset);
      pullOutOfWalls(leanBase, eye);
    }
    return {position:eye, quaternion, forward, right, fov:state.fov, yaw, pitch, lean};
  }

  // Over the shoulder: same orientation as the eye, pulled back along the view
  // direction and offset sideways, then pulled IN again by whatever wall is in
  // the way. Reusing the eye's quaternion is what makes the crosshair mean the
  // same thing in both views.
  function shoulderTransform(base){
    pivot.copy(base.position);
    pivot.y += config.thirdPerson.height - config.eyeHeight;
    camPosition.copy(pivot)
      .addScaledVector(base.forward, -state.tpDistance)
      .addScaledVector(base.right, state.tpShoulder * state.weaponSide);
    pullOutOfWalls(pivot, camPosition);
    return {position:camPosition, quaternion:base.quaternion, forward:base.forward, right:base.right,
      fov:state.fov, yaw:base.yaw, pitch:base.pitch, pivot};
  }

  // Marches from the pivot toward the desired camera position and stops at the
  // last sample that is clear of every solid box. Sampling rather than solving
  // is enough here: the segment is at most a few metres and the result only has
  // to keep the near plane out of a wall.
  const WALL_SAMPLES = 8;
  function pullOutOfWalls(from, to){
    const boxes = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
    if(!Array.isArray(boxes) || !boxes.length) return to;
    const radius = config.thirdPerson.collisionRadius;
    const owner = pawn && pawn.owner;
    let safe = 0;
    for(let step = 1; step <= WALL_SAMPLES; step++){
      const t = step / WALL_SAMPLES;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      const z = from.z + (to.z - from.z) * t;
      let blocked = false;
      for(let i = 0; i < boxes.length; i++){
        const col = boxes[i];
        if(!col || col.enabled === false || col.owner === owner) continue;
        if(Math.abs(x - col.x) > col.hx + radius) continue;
        if(Math.abs(z - col.z) > col.hz + radius) continue;
        if(col.hy != null && col.y != null && Math.abs(y - col.y) > col.hy + radius) continue;
        blocked = true;
        break;
      }
      if(blocked) break;
      safe = t;
    }
    if(safe >= 1) return to;
    to.set(from.x + (to.x - from.x) * safe, from.y + (to.y - from.y) * safe, from.z + (to.z - from.z) * safe);
    return to;
  }

  // `enabled` is "this rig owns the camera", which is true in BOTH views: third
  // person is the rig's own shoulder camera, not the generic follow camera with
  // the rig switched off. `firstPersonView` is the narrower "the eye is the
  // output", and is what decides whether the body is culled and whether the
  // held weapon is drawn in front of the camera or in the character's hands.
  function enabled(){
    return config.enabled === true && !!(pawn && pawn.possessed && pawn.enabled !== false && pawn.hidden !== true);
  }
  function firstPersonView(){ return enabled() && state.viewMode === 'first'; }
  const active = enabled;

  function applyBinding(path, value){
    const key = String(path || '');
    if(key.indexOf('firstPerson.weapon.') === 0){
      const field = key.slice(19);
      // Selecting a preset replaces the whole loadout; every other field is a
      // single-value tweak layered on top of the values already in use.
      const patch = field === 'preset'
        ? {id:config.weapon.id, preset:value}
        : Object.assign({}, config.weapon, {preset:null});
      if(field !== 'preset') patch[field] = value;
      Object.assign(config.weapon, normalizeWeapon(patch));
      state.ammo = Math.min(state.ammo, config.weapon.magazine);
      if(field === 'preset'){ state.ammo = config.weapon.magazine; state.reserve = config.weapon.ammoReserve; }
      return true;
    }
    if(key.indexOf('firstPerson.weaponSocket.') === 0){
      const field = key.slice(25);
      const patch = Object.assign({}, config.weaponSocket);
      // Vector fields are addressed component-wise so a graph or an inspector
      // slider can move one axis without rebuilding the triple.
      const axis = {offsetX:['offset', 0], offsetY:['offset', 1], offsetZ:['offset', 2],
        rotationX:['rotation', 0], rotationY:['rotation', 1], rotationZ:['rotation', 2]}[field];
      if(axis){ patch[axis[0]] = patch[axis[0]].slice(); patch[axis[0]][axis[1]] = value; }
      else patch[field] = value;
      config.weaponSocket = normalizeSocket(patch);
      return true;
    }
    if(key.indexOf('firstPerson.viewBob.') === 0){
      const patch = {viewBob:Object.assign({}, config.viewBob)};
      patch.viewBob[key.slice(20)] = value;
      Object.assign(config, normalizeConfig(Object.assign({}, config, patch)));
      return true;
    }
    if(key.indexOf('firstPerson.') === 0){
      const patch = {}; patch[key.slice(12)] = value;
      const merged = normalizeConfig(Object.assign({}, config, patch));
      merged.weapon = config.weapon;   // weapon has its own binding branch
      Object.assign(config, merged);
      return true;
    }
    return false;
  }

  function reset(){
    state.pitch = 0;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
    state.bobPhase = 0;
    state.bobOffsetX = 0;
    state.bobOffsetY = 0;
    state.ads = 0;
    state.adsHeld = false;
    state.adsForced = false;
    state.cooldown = 0;
    state.burstLeft = 0;
    state.reloading = false;
    state.reloadTimer = 0;
    state.ammo = state.armed ? config.weapon.magazine : 0;
    state.reserve = state.armed ? config.weapon.ammoReserve : 0;
    state.eyeOffset = 0;
    state.zoomIndex = 0;
    state.scopeBlend = 0;
    state.shotsFired = 0;
    state.hits = 0;
    state.kills = 0;
    state.lastHit = null;
    syncFromOwner();
    return state;
  }

  syncFromOwner();

  return Object.freeze({
    config:() => config,
    state,
    enabled,
    active,
    firstPersonView,
    viewMode:() => state.viewMode,
    setViewMode,
    toggleViewMode,
    setEyeOffset,
    equipWeapon,
    addReserve,
    armed:() => state.armed,
    weapon:() => config.weapon,
    reset,
    syncFromOwner,
    applyLookDelta,
    applyStickLook,
    setViewAngles,
    viewAngles:() => ({yaw:state.yaw, pitch:state.pitch}),
    // Where the shot actually goes: the view angles WITH the live recoil folded
    // in. The camera already uses these, and anything that draws the weapon has
    // to as well or the barrel and the bullet disagree on screen.
    aimAngles:() => ({yaw:state.yaw + state.recoilYaw, pitch:state.pitch + state.recoilPitch}),
    weaponSide:() => state.weaponSide,
    leanAmount:() => state.lean,
    swapShoulder,
    preMovement,
    afterMovement,
    cameraTransform,
    eyeTransform,
    fire,
    reload,
    setAimDownSights,
    syncBodyVisibility,
    isAiming:() => state.ads > .5,
    isScoped,
    scope,
    magnification,
    cycleZoom,
    scopeBlend:() => state.scopeBlend,
    ammo:() => ({ammo:state.ammo, reserve:state.reserve, magazine:config.weapon.magazine, reloading:state.reloading, infinite:config.weapon.infiniteAmmo, armed:state.armed, name:config.weapon.name}),
    accuracy:() => (state.shotsFired ? state.hits / state.shotsFired : 0),
    applyBinding,
  });
}

// ------------------------------------------------ pawn attachment
// Called by character-pawn-base when a Pawn config carries a `firstPerson`
// block. Hooks compose with whatever the game mode already installed, so a
// future mode can keep its own beforeMovementStep behaviour.

function attach(GAME, pawn, source){
  if(!pawn) return null;
  const controller = create(GAME, pawn, source);
  const previousBefore = pawn.beforeMovementStep;
  const previousAfter = pawn.afterMovementStep;
  pawn.beforeMovementStep = function(dt, move){
    controller.preMovement(dt, move);
    return typeof previousBefore === 'function' ? previousBefore.call(this, dt, move) : false;
  };
  pawn.afterMovementStep = function(dt, move, snapshot){
    controller.afterMovement(dt, move, snapshot);
    if(typeof previousAfter === 'function') previousAfter.call(this, dt, move, snapshot);
  };
  const previousReset = pawn.reset.bind(pawn);
  pawn.reset = function(){ const done = previousReset(); controller.reset(); return done; };
  const previousDispose = pawn.dispose.bind(pawn);
  pawn.dispose = function(){
    // Restore the body the rig hid, otherwise unpossessing leaves an invisible
    // character behind in the editor scene.
    if(this.owner && this.owner.traverse){
      this.owner.traverse(node => {
        if(node && (node.isMesh || node.isSkinnedMesh) && node.userData.firstPersonBaseVisible !== undefined){
          node.visible = node.userData.firstPersonBaseVisible !== false;
          delete node.userData.firstPersonBaseVisible;
        }
      });
    }
    this.firstPerson = null;
    return previousDispose();
  };
  return controller;
}

// The Pawn owning camera output for a player.
function cameraPawn(GAME, playerId){
  const pawns = GAME && GAME.pawns;
  if(!pawns || !pawns.get) return null;
  const outputs = GAME.state && GAME.state.runtimeVehicleCameraPawnIds || {};
  const id = outputs[playerId || 1] || (GAME.state && GAME.state.runtimeVehicleCameraPawnId);
  return id ? pawns.get(id) : null;
}
// The rig that owns the camera. True in both views, because the rig owns the
// shoulder camera too. Callers that place the camera, feed it look input or
// draw the HUD all use this.
function activeController(GAME, playerId){
  const pawn = cameraPawn(GAME, playerId);
  if(!pawn || !pawn.firstPerson || !pawn.firstPerson.enabled()) return null;
  return pawn.firstPerson;
}
const activeRig = activeController;
// Only when the EYE is the output: what the first-person weapon model asks
// before drawing itself in front of the camera.
function activeFirstPersonView(GAME, playerId){
  const rig = activeController(GAME, playerId);
  return rig && rig.firstPersonView() ? rig : null;
}
function activePawn(GAME, playerId){
  const pawn = cameraPawn(GAME, playerId);
  return pawn && pawn.possessed && pawn.enabled !== false ? pawn : null;
}

window.LK_RUNTIME_FIRST_PERSON = Object.freeze({
  FIRE_MODES,
  WEAPON_KINDS,
  WEAPON_SLOTS,
  weaponClass,
  slotsFor,
  WEAPON_PRESETS,
  weaponPreset,
  normalizeConfig,
  normalizeWeapon,
  normalizeScope,
  normalizeSocket,
  normalizeTracer,
  damageableOf,
  isHeadshotNode,
  applyDamage,
  create,
  attach,
  cameraPawn,
  activeController,
  activeRig,
  activeFirstPersonView,
  activePawn,
});
})();
