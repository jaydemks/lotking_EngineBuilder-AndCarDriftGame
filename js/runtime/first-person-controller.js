/* =========================================================
   LOT KING — Player view rig (first AND third person)

   ONE rig owns the player's view and weapon for a humanoid Character Pawn.
   First and third person are two OUTPUTS of the same rig, not two systems:
   the same look angles, the same weapon, the same crosshair and the same world
   verbs, seen either from the eye or from over the shoulder. That is the only
   arrangement in which the two views can be equally playable, and it is why
   `Camera Mode` can swap them mid-fight without any state handover.

   Ownership boundary:

     · view          yaw/pitch angles, look sensitivity, clamping
     · camera        eye transform, shoulder transform, view bob, FOV, shake
     · weapon        magazine, fire cadence, spread, hitscan and damage
     · damageable    opt-in health contract read by the hitscan resolver

   The module is DOM-free apart from the optional pointer bridge, so the whole
   controller can be exercised in node. `lot-king.js` owns the actual camera
   object and asks this module for a transform; nothing here writes to the
   renderer.

   HOW THIS FILE IS ORGANISED
     01  helpers            maths shared by every section below
     02  weapon tables      fire modes, kinds, slots, presets
     03  weapon normalizers tracer, scope, socket, weapon
     04  view normalizers   shake, third person, lean, config
     05  damage contract    the shootable-object contract and its resolver
     06  controller/state   per-Pawn state and reusable vectors
     07  look               mouse, stick and scripted view angles
     08  weapon handling    equip, reload, fire cadence, throw
     09  ballistics         two-stage aim trace, spread, damage application
     10  frame              preMovement / afterMovement
     11  camera             eye, shoulder, spring arm, shake, FOV
     12  bindings           editor / graph writes into the live config
     13  attachment         composing onto the Pawn hooks
   ========================================================= */
(function(){
'use strict';

// ==================================================================== 01 helpers

const DEG = Math.PI / 180;
const PRESENTATION_VERSION = 3;
const VIEW_PAWN_SCHEMA_VERSION = 1;

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function dampAlpha(rate, dt){ return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)); }
function cameraMountRotation(value){const source=Array.isArray(value)?value:[0,0,0];return [finite(source[0],0),finite(source[1],0),finite(source[2],0)];}

// =============================================================== 02 weapon tables

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

// ========================================================== 03 weapon normalizers

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
  const tracer = normalizeTracer(src.tracer, finite(src.damage, 24));
  // A fist, blade or grenade can still resolve a hit through the shared damage
  // contract, but it must never inherit a bullet streak, muzzle impact/decal or
  // firearm flash merely because normalizeTracer defaults to enabled.
  if(kind !== 'firearm'){
    tracer.enabled = false;
    tracer.impact = false;
    tracer.decal = false;
  }
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
    tracer,
    // Pawn Studio authors grip profiles on the weapon descriptor. Dropping the
    // block here made the starting weapon survive only through the Pawn's raw
    // firstPerson copy, while an equipped loadout/pickup lost every per-state
    // hand pose as soon as it became the normalized runtime weapon.
    grip:src.grip && typeof src.grip === 'object' ? clone(src.grip) : undefined,
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
    // True by default: the weapon follows the actual trigger-hand animation.
    // Turning it off restores sight-line orientation for intentionally rigid
    // weapon rigs while position still remains on the selected hand.
    followHandRotation:src.followHandRotation !== false,
    // Draws a small three-axis gizmo at the socket so it can be placed by eye.
    showHelper:src.showHelper === true,
  };
}

// ============================================================ 04 view normalizers

// Camera shake, trauma model. `trauma` is a 0..1 charge that decays on its own;
// the visible offset is trauma SQUARED, which is what makes a small bump barely
// register while a grenade throws the frame around — the standard curve from
// Squirrel Eiserloh's "Juicing Your Cameras With Math" (GDC 2016).
//
// Shake moves the RENDER camera only. It is never folded into the aim angles,
// so a shaking screen can never move the bullet: recoil does that, and recoil
// alone, because recoil is something the player can read and fight.
function normalizeShake(source){
  const src = source && typeof source === 'object' ? source : {};
  return {
    enabled:src.enabled !== false,
    // How much trauma each event contributes. One shot of a rifle should be a
    // texture, not an event, so `fire` is deliberately small.
    fire:clamp(finite(src.fire, .16), 0, 1),
    land:clamp(finite(src.land, .34), 0, 1),
    damage:clamp(finite(src.damage, .45), 0, 1),
    traversal:clamp(finite(src.traversal, .22), 0, 1),
    // Trauma per second bled off. Fast: shake that outlives its cause reads as
    // a broken camera rather than as an impact.
    decay:clamp(finite(src.decay, 1.8), .1, 10),
    maxYaw:clamp(finite(src.maxYaw, .035), 0, .5),
    maxPitch:clamp(finite(src.maxPitch, .03), 0, .5),
    maxRoll:clamp(finite(src.maxRoll, .05), 0, .5),
    // Hz of the shake carrier. Three mutually prime rates keep the three axes
    // from ever agreeing, which is what stops it looking like a rotation.
    frequency:clamp(finite(src.frequency, 22), 1, 90),
    // Third person is watching a body from outside; the same trauma reads much
    // stronger there than it does behind the eye.
    thirdScale:clamp(finite(src.thirdScale, .7), 0, 2),
  };
}

// Over-the-shoulder camera. The numbers below are the AAA consensus shape:
// a ~3 m arm at rest that collapses to ~1.9 m when aiming, a lateral shoulder
// offset that keeps the body out of the aiming line (Resident Evil 4 / Gears of
// War), and a sprint pose that pulls back and re-centres so the run reads as
// speed (The Last of Us Part II, Uncharted 4). Every one of them is a bindable
// variable: this table is a starting point, not a policy.
function normalizeThirdPerson(source){
  const src = source && typeof source === 'object' ? source : {};
  return {
    distance:clamp(finite(src.distance, 3.3), .6, 14),
    distanceAds:clamp(finite(src.distanceAds, 1.9), .4, 14),
    distanceSprint:clamp(finite(src.distanceSprint, 4.1), .4, 16),
    height:clamp(finite(src.height, 1.5), .1, 4),
    heightAds:clamp(finite(src.heightAds, 1.58), .1, 4),
    // Lateral offset of the camera from the character's spine. Positive is to
    // the right, which is what keeps the body out of the aiming line.
    shoulder:clamp(finite(src.shoulder, .62), -3, 3),
    shoulderAds:clamp(finite(src.shoulderAds, .48), -3, 3),
    shoulderSprint:clamp(finite(src.shoulderSprint, .2), -3, 3),
    // The pivot the arm orbits, pushed forward of the spine so the character
    // sits in the lower third of the frame instead of dead centre.
    pivotForward:clamp(finite(src.pivotForward, .18), -2, 2),
    cameraRotation:cameraMountRotation(src.cameraRotation),
    fov:clamp(finite(src.fov, 68), 20, 130),
    fovAds:clamp(finite(src.fovAds, 52), 20, 130),
    focusDistance:clamp(finite(src.focusDistance, 9), .25, 200),
    near:clamp(finite(src.near, .1), .02, .5),
    // Speed opens the lens. Small, and capped, because a field of view that
    // tracks the speedometer is nausea rather than feedback.
    fovSpeedGain:clamp(finite(src.fovSpeedGain, .9), 0, 6),
    fovSpeedMax:clamp(finite(src.fovSpeedMax, 8), 0, 30),
    // Distance belongs to the player/author by default. ADS and sprint may
    // still change shoulder, height and lens, but no longer make the camera
    // "breathe" toward and away from an animated body. Projects that want the
    // old cinematic dolly can opt into it explicitly.
    autoDistance:src.autoDistance === true,
    // A strict fixed arm is the safe Character default: scene props and an
    // animated Pawn cannot force a surprise close-up. `pull-in` remains an
    // author choice for levels that prefer wall avoidance over fixed framing.
    collisionMode:src.collisionMode === 'pull-in' ? 'pull-in' : 'fixed',
    // Radius kept clear of walls when the camera is pulled in toward the
    // character; without it the near plane clips through geometry.
    collisionRadius:clamp(finite(src.collisionRadius, .34), .05, 2),
    // If a wall collapses the spring arm below the character's own body, the
    // output temporarily uses the safe eye point instead of rasterising from
    // inside skin/hair. This is both a visual and a fill-rate safety boundary.
    minimumBodyDistance:clamp(finite(src.minimumBodyDistance, .55), .25, 1.5),
    collisionSamples:Math.round(clamp(finite(src.collisionSamples, 8), 3, 32)),
    // Spring arm asymmetry: snap IN so the camera is never inside a wall for a
    // frame, ease OUT so leaving a doorway does not fling the view backwards.
    pullInSpeed:clamp(finite(src.pullInSpeed, 40), 1, 200),
    pushOutSpeed:clamp(finite(src.pushOutSpeed, 6), .5, 60),
    // How fast the shoulder mirrors when the player swaps sides. Instant reads
    // as a teleport; this is the arc every cover shooter uses instead.
    swapSpeed:clamp(finite(src.swapSpeed, 11), .5, 60),
    blend:clamp(finite(src.blend, 12), .5, 40),
  };
}

function normalizeLean(source){
  const src = source && typeof source === 'object' ? source : {};
  return {
    enabled:src.enabled !== false,
    // How far the eye actually moves. This is the part that lets you SEE
    // past a corner; the roll alone only looks like leaning.
    offset:clamp(finite(src.offset, .42), 0, 1.5),
    angle:clamp(finite(src.angle, .26), 0, 1.2),
    speed:clamp(finite(src.speed, 9), .5, 40),
    // Leaning while aiming is the whole point, so it is not scaled down.
    adsScale:clamp(finite(src.adsScale, 1), 0, 1),
  };
}

function normalizeViewPawn(source, legacy){
  const api = typeof window !== 'undefined' && window.LK_RUNTIME_FIRST_PERSON_VIEW_PAWN;
  if(api && typeof api.normalizeConfig === 'function') return api.normalizeConfig(source, legacy);
  const src = source && typeof source === 'object' ? clone(source) : {};
  const legacyPresentation = legacy && legacy.presentation === 'arms'
    ? 'arms' : (legacy && legacy.presentation === 'body' ? 'body'
      : (legacy && legacy.hideOwnBody === true ? 'arms' : 'body'));
  const requested = String(src.kind || (legacyPresentation === 'arms' ? 'first-person-arms' : 'none')).toLowerCase();
  const kind = requested === 'arms' || requested === 'first-person-arms' ? 'first-person-arms' : 'none';
  return {
    schemaVersion:VIEW_PAWN_SCHEMA_VERSION,
    kind,
    enabled:src.enabled == null ? kind === 'first-person-arms' : src.enabled === true && kind === 'first-person-arms',
    showLegs:src.showLegs == null ? !!(legacy && legacy.showLegs === true) : src.showLegs === true,
  };
}

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? clone(source) : {};
  const bob = src.viewBob && typeof src.viewBob === 'object' ? src.viewBob : {};
  const oldPresentationVersion=Number(src.presentationVersion)||0;
  // Before the unified body camera, the reusable combat template started in
  // third person but still carried the arms-only FPS presentation. Saved levels
  // therefore switched to a duplicate rig at eye height. Migrate only that old
  // pairing; an intentionally first-person-only level keeps `arms` unchanged.
  const migrateThirdPersonArms=oldPresentationVersion<2&&src.view==='third'&&src.presentation==='arms';
  const legacyPresentation=migrateThirdPersonArms?'body':(src.presentation === 'arms' || src.presentation === 'body'
    ? src.presentation : (src.hideOwnBody === true ? 'arms' : 'body'));
  const allowViewToggle=src.allowViewToggle!==false;
  // A Character authored as a third-person/convertible Pawn always keeps its
  // one body when the camera reaches the eyes. Old saved bindings could still
  // re-enable the optional arms presentation after graph migration, creating a
  // second rig exactly at the expensive close-camera moment.
  const requestedViewPawn=normalizeViewPawn(src.viewPawn,{presentation:legacyPresentation,hideOwnBody:legacyPresentation==='arms',showLegs:src.showLegs});
  // A switchable Character is one body whichever view happened to be active
  // when the project was saved. Previously saving while `view === first` could
  // resurrect the legacy arms Pawn on next load despite allowViewToggle, adding
  // a second rig and weapon exactly at the first-person transition.
  const dedicatedArms=src.view!=='third'&&allowViewToggle!==true&&requestedViewPawn.enabled===true&&requestedViewPawn.kind==='first-person-arms';
  const unifiedBodyCamera=!dedicatedArms&&(src.unifiedBodyCamera===true||Number(src.unifiedBodyCameraVersion)>=1||(src.view==='third'&&allowViewToggle));
  const viewPawn=unifiedBodyCamera?normalizeViewPawn({schemaVersion:VIEW_PAWN_SCHEMA_VERSION,kind:'none',enabled:false,showLegs:false},{}):requestedViewPawn;
  const presentation=viewPawn.enabled&&viewPawn.kind==='first-person-arms'?'arms':'body';
  return {
    enabled:src.enabled !== false,
    eyeHeight:clamp(finite(src.eyeHeight, 1.62), .2, 4),
    autoEyeHeight:src.autoEyeHeight !== false,
    eyeBoneOffset:clamp(finite(src.eyeBoneOffset, .08), -.3, .5),
    // A monolithic SkinnedMesh cannot hide only its head safely. Put the eye
    // just in front of the face instead: this keeps the authored skeleton
    // untouched and prevents full-screen skin/hair overdraw at the near plane.
    // The safety floor also repairs saved graphs carrying the old .12 default.
    bodyEyeForward:clamp(finite(src.bodyEyeForward, .28), .18, .6),
    bodyEyeSide:clamp(finite(src.bodyEyeSide, 0), -.5, .5),
    cameraRotation:cameraMountRotation(src.cameraRotation),
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
    focusDistance:clamp(finite(src.focusDistance, 9), .25, 200),
    near:clamp(finite(src.near, .14), .02, .5),
    fovBlend:clamp(finite(src.fovBlend, 11), .5, 40),
    adsBlend:clamp(finite(src.adsBlend, 13), .5, 40),
    // HOW the eye view is presented, as one authored choice instead of two
    // settings that can contradict each other:
    //
    //   'body'  the character's own mesh, seen from its eyes. No arms model, no
    //           second weapon: one skinned draw, the one already on screen in
    //           third person. This is what a Character or DollBody Pawn uses.
    //   'arms'  the dedicated first-person arms and weapon in front of the
    //           camera, with the body culled. The classic shooter look, and the
    //           expensive one - a second rig plus a second weapon mesh.
    //
    // Keeping them coupled is the point. `hideOwnBody: true` with no arms model
    // shows nothing at all, and `false` with arms shows the weapon twice; both
    // were reachable before. A level authored entirely in first person just sets
    // every Pawn to 'arms'.
    presentationVersion:PRESENTATION_VERSION,
    unifiedBodyCamera,
    // Versioned component data is authoritative. These three flat fields remain
    // derived mirrors so saved graphs and plugins written before schema v1 keep
    // working while ownership moves out of the controller.
    viewPawn,
    presentation,
    // `showLegs` is the legacy middle ground for the optional arms look: the
    // body stays so the player can look down and see their feet. Ignored by the
    // default unified-body camera, which already owns that same body.
    showLegs:viewPawn.showLegs,
    // Kept as a DERIVED mirror of the presentation, never as a second source of
    // truth. Other systems read it - `actor-combat.js` builds a config with it -
    // and a value that could disagree with the presentation is exactly the
    // contradiction this change removes.
    hideOwnBody:presentation === 'arms',
    // Starting view. `allowViewToggle` is what makes the Camera Mode key swap
    // between the eye and the over-the-shoulder camera at runtime.
    view:src.view === 'third' ? 'third' : 'first',
    allowViewToggle,
    // The rig owns BOTH cameras. Third person is not the generic follow camera
    // with the rig switched off: it is the same look angles, the same weapon and
    // the same crosshair, seen from behind the shoulder. That is the only way
    // the two views can be equally playable.
    thirdPerson:normalizeThirdPerson(src.thirdPerson),
    // Weapons are optional: an unarmed Pawn still gets the view, the bob and
    // the crosshair-free HUD, and picks a weapon up from the world.
    startUnarmed:src.startUnarmed === true,
    // Leaning out from behind cover. The eye slides sideways and the whole view
    // rolls with it, which is what makes a corner readable without stepping
    // into the open. The body follows in third person.
    lean:normalizeLean(src.lean),
    shake:normalizeShake(src.shake),
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

// ============================================================ 05 damage contract
// Anything in the scene can become shootable by carrying `userData.damageable`.
// Level templates and Logic Elements author it; the resolver below is the only
// place that mutates it, so health stays consistent across both paths.

function damageableOf(object){
  const contract = typeof window !== 'undefined' && window.LK_RUNTIME_DAMAGE_CONTRACT;
  if(contract && typeof contract.holderOf === 'function') return contract.holderOf(object);
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

function applyDamage(holder, amount, info){
  const contract = typeof window !== 'undefined' && window.LK_RUNTIME_DAMAGE_CONTRACT;
  if(contract && typeof contract.apply === 'function') return contract.apply(holder, amount, info);
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

// ========================================================= 06 controller / state

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
    fireAnimationSlot:null,
    reloadPressed:false,
    reloading:false,
    reloadTimer:0,
    ammo:config.weapon.magazine,
    reserve:config.weapon.ammoReserve,
    shotsFired:0,
    sinceShot:9,
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
    // A lean asked for by a system rather than by the player: the cover module
    // writes it, and it is summed with the lean keys through the same blend.
    coverLean:0,
    weaponSide:1,         // +1 right shoulder, -1 left. Swapped by the player.
    // The shoulder the camera is ACTUALLY on, easing toward `weaponSide`. The
    // two are separate so the swap is an arc rather than a teleport.
    sideBlend:1,
    swapPressed:false,
    zoomIndex:0,          // index into the weapon's magnification list
    scopeBlend:0,         // 0 sight down .. 1 eye against the glass
    // --- camera shake, trauma model -------------------------------------
    trauma:0,             // 0..1 charge; the visible offset is its square
    shakeTime:0,          // carrier phase, so the shake is continuous
    shakeYaw:0, shakePitch:0, shakeRoll:0,
    // --- spring arm -------------------------------------------------------
    armLength:config.thirdPerson.distance,   // the arm AFTER wall collision
    tpHeight:config.thirdPerson.height,
    sprintBlend:0,
    // Last frame step, so the camera helpers can damp without being handed a dt
    // they have no way to obtain: they are called from the renderer, not from
    // the frame hook.
    frameDt:.016,
    // Where the crosshair is pointing in the world this frame, and how far
    // away that is. Published for the HUD and reused by the ballistics.
    focusDistance:config.weapon.range,
    airTime:0,            // seconds since the feet last left the ground
    eyeAnchorBone:null,   // cached real Head bone; never searched every frame
    eyeAnchorHeight:null, // stable Pawn-local eye height, not animated head bob
    eyeAnchorSearchAt:0,
  };
  if(config.startUnarmed){ state.ammo = 0; state.reserve = 0; }

  function armsPresentation(){
    const component = pawn && pawn.firstPersonViewPawn;
    if(component && typeof component.active === 'function') return component.active();
    return config.viewPawn.enabled === true && config.viewPawn.kind === 'first-person-arms';
  }
  function configureViewPawn(patch){
    const asksForArms=patch&&(patch.kind==='arms'||patch.kind==='first-person-arms'||patch.enabled===true);
    if(config.unifiedBodyCamera&&config.view==='first'&&asksForArms)config.unifiedBodyCamera=false;
    config.viewPawn = config.unifiedBodyCamera
      ?normalizeViewPawn({schemaVersion:VIEW_PAWN_SCHEMA_VERSION,kind:'none',enabled:false,showLegs:false},{})
      :normalizeViewPawn(Object.assign({}, config.viewPawn, patch || {}), config);
    const component = pawn && pawn.firstPersonViewPawn;
    if(component && typeof component.configure === 'function') config.viewPawn = component.configure(config.viewPawn);
    config.presentation = config.viewPawn.enabled && config.viewPawn.kind === 'first-person-arms' ? 'arms' : 'body';
    config.hideOwnBody = config.presentation === 'arms';
    config.showLegs = config.viewPawn.showLegs;
    state.bodyMode = null;
    return config.viewPawn;
  }

  function pawnDead(){
    if(pawn && pawn.vitals && pawn.vitals.state && pawn.vitals.state.dead === true) return true;
    const record = pawn && pawn.owner && pawn.owner.userData && pawn.owner.userData.damageable;
    return !!record && finite(record.health, 1) <= 0;
  }

  // Reused vectors: the controller runs every frame and must not allocate.
  const eye = THREE ? new THREE.Vector3() : null;
  const forward = THREE ? new THREE.Vector3() : null;
  const right = THREE ? new THREE.Vector3() : null;
  const quaternion = THREE ? new THREE.Quaternion() : null;
  const euler = THREE ? new THREE.Euler(0, 0, 0, 'YXZ') : null;
  const cameraMountEuler = THREE ? new THREE.Euler(0, 0, 0, 'XYZ') : null;
  const cameraMountQuaternion = THREE ? new THREE.Quaternion() : null;
  const raycaster = THREE ? new THREE.Raycaster() : null;
  const rayOrigin = THREE ? new THREE.Vector3() : null;
  const rayDirection = THREE ? new THREE.Vector3() : null;
  const pivot = THREE ? new THREE.Vector3() : null;
  const leanBase = THREE ? new THREE.Vector3() : null;
  const camPosition = THREE ? new THREE.Vector3() : null;
  const segmentEnd = THREE ? new THREE.Vector3() : null;
  const cameraProbeCache={frame:-1,boxes:null,length:-1,fromX:0,fromY:0,fromZ:0,toX:0,toY:0,toZ:0,radius:0,result:0};
  // Ballistics scratch: the focus point the camera ray found, and the shaken
  // render transform. Both are reused, never reallocated.
  const focusPoint = THREE ? new THREE.Vector3() : null;
  const shakePosition = THREE ? new THREE.Vector3() : null;
  const shakeQuaternion = THREE ? new THREE.Quaternion() : null;
  const shakeEuler = THREE ? new THREE.Euler(0, 0, 0, 'YXZ') : null;
  const shakeForward = THREE ? new THREE.Vector3() : null;
  const shakeRight = THREE ? new THREE.Vector3() : null;
  const renderTransform = {position:shakePosition, quaternion:shakeQuaternion, forward:shakeForward,
    right:shakeRight, fov:config.fov, near:.1, yaw:0, pitch:0, lean:0, pivot:null};
  const headWorld = THREE ? new THREE.Vector3() : null;
  const headLocal = THREE ? new THREE.Vector3() : null;

  function headBoneKey(value){
    return String(value||'').split(/[\\/|:]/).pop()
      .replace(/^(?:mixamorig|armature|skeleton|rig)(?:[_\-\s]*\d+)?[_\-\s]*/i,'')
      .replace(/[^a-z0-9]/gi,'').toLowerCase();
  }
  // Imported bodies do not all share one height. Resolve the real Head bone
  // once, convert it into Pawn-local metres, then keep that stable height while
  // the animation moves the bone. This avoids both a chest-height fixed camera
  // and nauseating per-step head animation in the view.
  function resolvedEyeHeight(){
    if(!config.autoEyeHeight||!THREE)return config.eyeHeight;
    const owner=pawn&&pawn.owner;
    if(!owner||!owner.traverse)return config.eyeHeight;
    if(state.eyeAnchorBone&&state.eyeAnchorBone.parent&&Number.isFinite(state.eyeAnchorHeight))return Math.max(config.eyeHeight,state.eyeAnchorHeight);
    const now=typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
    if(now<state.eyeAnchorSearchAt)return config.eyeHeight;
    state.eyeAnchorSearchAt=now+500;
    let head=null,score=-1;
    owner.traverse(node=>{
      if(!node||!node.isBone||!node.parent)return;
      const key=headBoneKey(node.name);let candidate=-1;
      if(key==='head')candidate=3;
      else if(/head$/.test(key)&&!/headtop|headend/.test(key))candidate=2;
      else if(/headtop|headend/.test(key))candidate=1;
      if(candidate>score){head=node;score=candidate;}
    });
    if(!head||!headWorld||!headLocal)return config.eyeHeight;
    if(typeof owner.updateWorldMatrix==='function')owner.updateWorldMatrix(true,false);
    if(typeof head.updateWorldMatrix==='function')head.updateWorldMatrix(true,false);
    head.getWorldPosition(headWorld);headLocal.copy(headWorld);owner.worldToLocal(headLocal);
    const height=headLocal.y+config.eyeBoneOffset;
    if(!Number.isFinite(height)||height<.4||height>4)return config.eyeHeight;
    state.eyeAnchorBone=head;state.eyeAnchorHeight=height;
    return Math.max(config.eyeHeight,height);
  }

  function pitchLimits(){
    return {min:config.pitchMinDeg * DEG, max:config.pitchMaxDeg * DEG};
  }

  // The aim, as plain numbers. Every transform below needs THREE; these two do
  // not, because the aim IS a yaw/pitch pair and the eye IS a height above the
  // Pawn origin. Anything that only needs a direction or a hand position — a
  // thrown grenade, a headless test, a graph node asking where the player is
  // pointing — uses these and keeps working with no renderer at all.
  //
  // Engine convention: a heading of `yaw` faces (sin yaw, 0, cos yaw), and
  // pitch is positive-up.
  const aimVector = {x:0, y:0, z:1};
  function aimDirection(){
    const yaw = state.yaw + state.recoilYaw;
    const pitch = clamp(state.pitch + state.recoilPitch, -1.55, 1.55);
    const cos = Math.cos(pitch);
    aimVector.x = Math.sin(yaw) * cos;
    aimVector.y = Math.sin(pitch);
    aimVector.z = Math.cos(yaw) * cos;
    return aimVector;
  }
  const eyeVector = {x:0, y:0, z:0};
  function eyePosition(){
    const owner = pawn && pawn.owner;
    if(!owner || !owner.position) return null;
    eyeVector.x = finite(owner.position.x, 0);
    eyeVector.y = finite(owner.position.y, 0) + resolvedEyeHeight() + state.eyeOffset;
    eyeVector.z = finite(owner.position.z, 0);
    return eyeVector;
  }

  function syncFromOwner(){
    const owner = pawn && pawn.owner;
    if(owner && owner.rotation) state.yaw = finite(owner.rotation.y, state.yaw);
    return state.yaw;
  }

  // ============================================================== 07 look
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

  // ==================================================== 08 weapon handling
  // Animation slots are opt-in: with nothing bound the procedural weapon pose
  // carries the moment, and binding `fire` / `reload` in the Pawn's animation
  // slots swaps in a real clip without touching this file.
  function stopContinuousFireAction(){
    const slot=state.fireAnimationSlot;
    state.fireAnimationSlot=null;
    if(!slot||!pawn||!pawn.state||pawn.state.action!==slot)return false;
    const locomotion=pawn.locomotion;
    if(locomotion&&typeof locomotion.stopAction==='function')locomotion.stopAction();
    return true;
  }
  function playWeaponAction(slot, duration, options){
    if(!pawn || typeof pawn.playAction !== 'function') return false;
    const clips = pawn.config && pawn.config.animations;
    if(!clips) return false;
    const o=options||{};
    const chain=Array.isArray(slot)?slot:[slot];
    if(o.continuous===true&&state.fireAnimationSlot){
      const active=state.fireAnimationSlot,locomotion=pawn.locomotion;
      const preferred=chain.find(candidate=>clips[candidate])||chain[0];
      if(active===preferred&&pawn.state&&pawn.state.action===active&&(!locomotion||!locomotion.isActionPlaying||locomotion.isActionPlaying()))return active;
      stopContinuousFireAction();
    }
    for(let index=0;index<chain.length;index++){
      const candidate=chain[index];
      if(clips[candidate]&&pawn.playAction(candidate,{fadeIn:.07,fadeOut:.12,duration,fitDuration:o.continuous===true?null:duration,loop:o.continuous===true,locomotionFloor:o.locomotionFloor,requireClip:true})===true){
        if(o.continuous===true)state.fireAnimationSlot=candidate;
        return candidate;
      }
    }
    // A missing author clip still gets a gait-aware recoil generated against
    // the real humanoid skeleton. requireClip makes this a truthful playback
    // query rather than the accepted-command fallback used by Logic actions.
    const fallback=chain[0];
    if(fallback&&pawn.playAction(fallback,{fadeIn:.07,fadeOut:.12,duration,fitDuration:o.continuous===true?null:duration,loop:o.continuous===true,locomotionFloor:o.locomotionFloor,requireClip:true})===true){
      if(o.continuous===true)state.fireAnimationSlot=fallback;
      return fallback;
    }
    return false;
  }
  function bodyActionSlot(){
    const status=pawn&&pawn.state||{};
    if(status.abilityPose)return String(status.abilityPose);
    if(status.traversal)return String(status.traversal);
    if(status.sliding===true)return 'slide';
    if(finite(status.rolling,0)>0)return 'roll';
    return String(status.action||'');
  }
  function bodyActionLocked(){
    return /^(?:roll|slide|vault|mantle|climb|climbup|climbdown|hang|ledgeshimmy|landheavy|hardlanding|death|punch|melee|knifeattack|throw)/i.test(bodyActionSlot().replace(/[^a-z0-9]/gi,''));
  }
  function fireAnimationSlots(){
    const speed=Math.max(0,finite(pawn&&pawn.state&&pawn.state.speed,0));
    const gait=speed>=Math.max(3.8,finite(pawn&&pawn.config&&pawn.config.movement&&pawn.config.movement.runSpeed,5.5)*.68)?'Run'
      :speed>.35?'Walk':'Idle';
    const family=config.weapon.mode==='semi'?'Single':'Auto';
    return ['fire'+family+gait,'fire'];
  }

  function magazineFull(){ return state.ammo >= config.weapon.magazine; }
  function reserveEmpty(){ return !config.weapon.infiniteAmmo && state.reserve <= 0; }

  function reload(){
    if(pawnDead() || state.reloading || magazineFull() || reserveEmpty()) return false;
    stopContinuousFireAction();
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
    stopContinuousFireAction();
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

  // Manual zoom is the sole default owner of third-person distance. Mouse
  // wheel and a future mapped gamepad axis both call this same verb, so editor
  // authors do not need separate camera implementations per device.
  function adjustThirdPersonDistance(delta){
    const tp = config.thirdPerson;
    const next = clamp(tp.distance + finite(delta, 0), .6, 14);
    tp.distance = next;
    state.tpDistance = next;
    state.armLength = next;
    emit({type:'OnThirdPersonDistanceChanged', pawnId:pawn && pawn.id, distance:next});
    return next;
  }
  // A cover or targeting system can ASK for a shoulder without the player
  // pressing anything — hugging the left edge of a wall should put the camera
  // on the left. It goes through the same blend, so an automatic swap and a
  // manual one look identical.
  function setShoulder(side){
    const next = finite(side, state.weaponSide) >= 0 ? 1 : -1;
    if(next === state.weaponSide) return state.weaponSide;
    return swapShoulder();
  }

  // A lean requested by a system (the cover module) rather than by the player.
  // It is summed with the lean keys instead of replacing them, so leaning out
  // of cover and leaning around a corner are one blended value.
  function setCoverLean(value){
    state.coverLean = clamp(finite(value, 0), -1, 1);
    return state.coverLean;
  }

  // Camera shake is charged, never set: two impacts in the same frame add up
  // instead of the second one replacing the first.
  function addTrauma(amount){
    if(!config.shake.enabled) return state.trauma;
    state.trauma = clamp(state.trauma + Math.max(0, finite(amount, 0)), 0, 1);
    return state.trauma;
  }

  function setViewMode(mode){
    const next = mode === 'third' ? 'third' : 'first';
    if(next === state.viewMode) return state.viewMode;
    state.viewMode = next;
    if(next==='first')state.eyeAnchorSearchAt=0;
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

  // ========================================================= 09 ballistics

  // What the stance is worth. Every shooter since Rainbow Six pays the player
  // for standing still, ducking and bracing on something, and charges them for
  // running and jumping; this is that whole ledger in one named table rather
  // than as five multipliers scattered through the fire path.
  const STANCE_SPREAD = Object.freeze({
    airborne:1.6,     // no ground under the feet: the worst case
    crouch:.62,       // fully crouched
    cover:.55,        // braced on a piece of cover
    slide:1.9,        // sliding is the price of the distance it buys
  });
  function currentSpread(){
    const base = config.weapon.spreadHip + (config.weapon.spreadAds - config.weapon.spreadHip) * state.ads;
    const body = pawn && pawn.state || {};
    const speed = finite(body.speed, 0);
    let stance = 1;
    if(body.airborne === true) stance *= STANCE_SPREAD.airborne;
    if(body.sliding === true) stance *= STANCE_SPREAD.slide;
    // Crouch and cover are blends, not flags: a half-crouch is worth half the
    // bonus, which is what stops the reticle snapping as the body ducks.
    const crouch = clamp(finite(body.crouch, 0), 0, 1);
    if(crouch > 0) stance *= 1 - (1 - STANCE_SPREAD.crouch) * crouch;
    const cover = clamp(finite(body.coverBrace, 0), 0, 1);
    if(cover > 0) stance *= 1 - (1 - STANCE_SPREAD.cover) * cover;
    return Math.max(0, base * (1 + speed * .06 * config.weapon.spreadMoveGain) * stance);
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

  // Where the crosshair is pointing, in the world.
  //
  // THIS IS THE WHOLE REASON THIRD PERSON CAN SHOOT AT ALL. The crosshair is
  // drawn at the centre of the screen, so what it means is "the first thing the
  // CAMERA can see straight ahead" — but the bullet leaves the character, three
  // metres in front of the camera. Firing along the camera ray from the camera
  // POSITION is the classic third-person bug: back into a crate and every shot
  // hits the crate that is behind you but in front of the lens.
  //
  // So the shot is resolved in two stages, the way every over-the-shoulder
  // shooter does it:
  //
  //   stage 1  ray from the CAMERA through the crosshair -> a focus point
  //   stage 2  ray from the character's own EYE toward that focus point
  //
  // In first person the camera IS the eye, so the two collapse into the single
  // ray this rig has always fired and nothing changes.
  //
  // `near` on the first ray is what keeps geometry BETWEEN the camera and the
  // character out of the answer: the arm has already been shortened out of
  // walls, and anything still inside that span is behind the player's back.
  function resolveFocus(aim){
    if(!THREE || !raycaster || !aim) return null;
    const range = config.weapon.range;
    focusPoint.copy(aim.position).addScaledVector(aim.forward, range);
    state.focusDistance = range;
    if(state.viewMode !== 'third' || !aim.pivot) return focusPoint;
    raycaster.set(aim.position, aim.forward);
    // Skip everything inside the arm: it is between the lens and the shoulder.
    raycaster.near = aim.position.distanceTo(aim.pivot) + .05;
    raycaster.far = range;
    const owner = pawn && pawn.owner;
    const hits = raycaster.intersectObjects(hitCandidates(), true);
    raycaster.near = 0;
    for(let i = 0; i < hits.length; i++){
      let node = hits[i].object, mine = false;
      while(node){ if(node === owner){ mine = true; break; } node = node.parent || null; }
      if(mine) continue;
      focusPoint.copy(hits[i].point);
      state.focusDistance = finite(hits[i].distance, range);
      break;
    }
    return focusPoint;
  }

  // Hitscan: one raycast per pellet, spread applied as a small random cone
  // around the exact aim direction. Damage is only applied to nodes that
  // opted into the damageable contract; everything else is a blocking wall.
  function traceShot(){
    if(!THREE || !raycaster) return null;
    const aim = aimTransform();
    if(!aim) return null;
    const focus = resolveFocus(aim);
    // Stage 2 always leaves the character's own eye, never the camera.
    const muzzle = eyeTransform();
    const transform = muzzle || aim;
    const spread = currentSpread();
    const owner = pawn && pawn.owner;
    const targets = hitCandidates();   // shared by every pellet of this shot
    const results = [];
    for(let pellet = 0; pellet < config.weapon.pellets; pellet++){
      rayOrigin.copy(transform.position);
      if(focus && transform !== aim) rayDirection.copy(focus).sub(rayOrigin).normalize();
      else rayDirection.copy(transform.forward);
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
      const applied = holder ? applyDamage(holder, damage, {
        source:'weapon', direction:rayDirection, point:hit.point, origin:rayOrigin,
        normal:hit.face ? hit.face.normal : null,
        object:hit.object,
        pawnId:pawn && pawn.id || null, weapon:config.weapon.id,
        headshot, force:damage,
      }) : null;
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
        armor:applied ? applied.armor : null,
        killed:!!(applied && applied.killed),
        deathHandled:!!(applied && applied.deathHandled),
      });
    }
    return results;
  }

  function fire(){
    if(pawnDead() || bodyActionLocked() || !state.armed || state.reloading || state.cooldown > 0) return null;
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
    const continuous=config.weapon.mode==='auto';
    playWeaponAction(fireAnimationSlots(), Math.min(.32,Math.max(.1,1/config.weapon.fireRate)),{
      continuous,
      // Fire is an upper-body accent while travelling. Keeping most of the
      // gait underneath prevents a rifle take from restarting the feet.
      locomotionFloor:finite(pawn&&pawn.state&&pawn.state.speed,0)>.35?.72:0,
    });
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
    // it afterwards from the camera would be a frame late. It is the EYE, not
    // the camera, so a third-person tracer leaves the character rather than
    // appearing three metres behind their back.
    const transform = eyeTransform();
    const origin = transform ? transform.position.clone() : null;
    addTrauma(config.shake.fire);
    const payload = {
      type:'OnWeaponFired', pawnId:pawn && pawn.id, weapon:config.weapon.id,
      kind:config.weapon.kind,
      ammo:state.ammo, reserve:state.reserve, shots, hit:landed.length > 0,
      killed:kills.length > 0, origin, tracer:config.weapon.tracer,
    };
    emit(payload);
    landed.forEach(shot => emit(Object.assign({type:'OnWeaponHit', pawnId:pawn && pawn.id,
      kind:config.weapon.kind, origin, tracer:config.weapon.tracer}, shot)));
    kills.forEach(shot => emit(Object.assign({type:'OnTargetDown', pawnId:pawn && pawn.id}, shot)));
    if(state.ammo <= 0 && config.weapon.infiniteAmmo !== true) reload();
    return payload;
  }

  // Throwing spends one from the reserve and hands a physical object to the item
  // system, which already knows how to make things fly, bounce and hurt what
  // they land on. Nothing here simulates anything.
  function throwWeapon(){
    if(pawnDead()) return null;
    if(state.reserve <= 0 && config.weapon.infiniteAmmo !== true){
      emit({type:'OnWeaponDryFire', pawnId:pawn && pawn.id, weapon:config.weapon.id});
      return null;
    }
    // A grenade leaves the HAND and flies toward what the crosshair is on, so
    // it is thrown from the eye along the resolved focus direction. Throwing it
    // from the camera would drop it behind the character in third person.
    //
    // Both the origin and the direction have an analytic form, so a throw is a
    // verb the Pawn owns rather than something the renderer grants it: with a
    // scene present the camera ray refines the direction onto the crosshair,
    // and without one the yaw/pitch pair is already the answer.
    const aim = aimTransform();
    const focus = aim ? resolveFocus(aim) : null;
    const transform = eyeTransform();
    const origin = transform ? transform.position : eyePosition();
    if(!origin) return null;
    const heading = focus && rayDirection
      ? rayDirection.copy(focus).sub(origin).normalize()
      : aimDirection();
    if(config.weapon.infiniteAmmo !== true) state.reserve--;
    state.cooldown = 1 / config.weapon.fireRate;
    state.recoilPitch += config.weapon.recoilPitch;
    playWeaponAction('throw', .4);
    const speed = config.weapon.throwSpeed;
    const payload = {
      type:'OnWeaponThrown', pawnId:pawn && pawn.id, weapon:config.weapon.id,
      name:config.weapon.name, preset:config.weapon.preset, damage:config.weapon.damage,
      radius:config.weapon.range, reserve:state.reserve,
      origin:{x:origin.x, y:origin.y, z:origin.z},
      velocity:{
        x:heading.x * speed,
        y:heading.y * speed + 1.6,
        z:heading.z * speed,
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

  // ============================================================= 10 frame
  // preMovement runs before the shared movement controller so the character
  // body is already facing the view yaw when locomotion resolves. That keeps
  // strafing exactly perpendicular to the crosshair.
  function preMovement(dt, move){
    const h = clamp(finite(dt, .016), .0001, .1);
    state.frameDt = h;
    state.cameraProbeFrame=(state.cameraProbeFrame||0)+1;
    const input = move || {};
    if(pawnDead()){
      state.adsHeld = false;
      state.adsForced = false;
      state.firePressed = false;
      state.reloadPressed = false;
      state.burstLeft = 0;
      state.reloading = false;
      state.reloadTimer = 0;
      return false;
    }
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
    state.sideBlend += (state.weaponSide - state.sideBlend) * dampAlpha(config.thirdPerson.swapSpeed, h);
    if(Math.abs(state.sideBlend - state.weaponSide) < .003) state.sideBlend = state.weaponSide;

    // Lean. Both keys at once cancels out, which is the natural reading and
    // saves a priority rule nobody would remember. A cover system can ask for a
    // lean on top of the player's own keys — leaning out from behind a wall and
    // leaning around a doorway are the same move, so they share one blend.
    const leanTarget = clamp((input.leanRight === true ? 1 : 0) - (input.leanLeft === true ? 1 : 0) + state.coverLean, -1, 1);
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
    if(state.fireAnimationSlot&&(!firing||state.reloading||pawnDead()||bodyActionLocked()))stopContinuousFireAction();
    state.firePressed = firing;

    const owner = pawn && pawn.owner;
    const locked=bodyActionLocked();
    const recentShot=finite(state.sinceShot,9)<.18;
    const combatFacing=state.viewMode==='first'||state.ads>.18||firing||recentShot||state.reloading;
    if(!locked){
      // Hip movement in third person follows the actual travel direction. ADS,
      // firing and first-person keep heading-relative strafing. This is a
      // per-frame policy: it does not overwrite the author's saved Movement
      // Space settings and therefore cannot leak into vehicles, animals or AI.
      input.inputMode=combatFacing?'heading':'camera';
      input.facingMode=combatFacing?'heading':'movement';
      if(combatFacing&&owner&&owner.rotation)owner.rotation.y=state.yaw+state.recoilYaw;
    }
    return false;
  }

  // afterMovementStep only consumes the movement snapshot, so recoil decay and
  // view bob stay in sync with the distance actually travelled this frame.
  function afterMovement(dt, move, snapshot){
    const h = clamp(finite(dt, .016), .0001, .1);
    if(pawnDead()) return;
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
    // Speed opens the lens in third person. It is added to the HIP field of
    // view only, so aiming still closes it all the way down: a player who is
    // sprinting and then aims should see the lens shut, not fight the run.
    const dynamic = third
      ? Math.min(config.thirdPerson.fovSpeedMax, Math.max(0, speed - 2) * config.thirdPerson.fovSpeedGain) * (1 - state.ads)
      : 0;
    const targetFov = hipFov + (adsFov - hipFov) * state.ads + dynamic;
    state.fov += (targetFov - state.fov) * dampAlpha(config.fovBlend, h);

    // --- third person arm ---------------------------------------------------
    // Aiming brings the camera in over the shoulder instead of narrowing the
    // FOV alone, which is what makes the reticle usable; sprinting pushes it
    // back out and re-centres it, which is what makes the run read as speed.
    // Sprint and aim can never both be at 1, so a plain weighted sum of the
    // three poses is exact rather than an approximation.
    const tp = config.thirdPerson;
    const tpAlpha = dampAlpha(tp.blend, h);
    const sprintWeight = state.sprintPose ? 1 : 0;
    state.sprintBlend = finite(state.sprintBlend, 0) + (sprintWeight - finite(state.sprintBlend, 0)) * dampAlpha(6, h);
    const sprintMix = state.sprintBlend * (1 - state.ads);
    const wantDistance = tp.autoDistance
      ? mix3(tp.distance, tp.distanceAds, tp.distanceSprint, state.ads, sprintMix)
      : tp.distance;
    const wantShoulder = mix3(tp.shoulder, tp.shoulderAds, tp.shoulderSprint, state.ads, sprintMix);
    state.tpDistance += (wantDistance - state.tpDistance) * tpAlpha;
    state.tpShoulder += (wantShoulder - state.tpShoulder) * tpAlpha;
    state.tpHeight = finite(state.tpHeight, tp.height) + ((tp.height + (tp.heightAds - tp.height) * state.ads) - finite(state.tpHeight, tp.height)) * tpAlpha;

    // --- shake --------------------------------------------------------------
    // A hard landing is an impact the body felt, so it charges trauma from the
    // fall itself rather than from a separate "landed" flag: the height decides
    // how much, which is what makes a drop from a crate and a drop from the
    // watchtower feel like different events.
    if(grounded){
      if(state.airTime > .35) addTrauma(config.shake.land * clamp(state.airTime / 1.1, 0, 1));
      state.airTime = 0;
    } else state.airTime += h;
    stepShake(h);
    syncBodyVisibility();
    return state;
  }

  // Blends a rest / aim / sprint triple. `ads` wins outright where they
  // overlap, because a player who is aiming has stopped sprinting.
  function mix3(rest, aim, sprint, ads, sprintMix){
    const s = clamp(sprintMix, 0, 1) * (1 - clamp(ads, 0, 1));
    return rest + (aim - rest) * clamp(ads, 0, 1) + (sprint - rest) * s;
  }

  // Trauma decays linearly and the visible offset is its square, so shake
  // fades out fast at the end instead of hanging around as a tremble. Three
  // mutually prime carrier rates keep the axes from agreeing.
  function stepShake(dt){
    if(!config.shake.enabled || state.trauma <= 0){
      state.trauma = 0;
      state.shakeYaw = 0; state.shakePitch = 0; state.shakeRoll = 0;
      return state;
    }
    state.trauma = Math.max(0, state.trauma - config.shake.decay * dt);
    state.shakeTime += dt;
    const amount = state.trauma * state.trauma * (state.viewMode === 'third' ? config.shake.thirdScale : 1);
    const t = state.shakeTime * config.shake.frequency;
    state.shakeYaw = Math.sin(t * 1.00 + 1.3) * config.shake.maxYaw * amount;
    state.shakePitch = Math.sin(t * 1.37 + 4.1) * config.shake.maxPitch * amount;
    state.shakeRoll = Math.sin(t * 0.79 + 2.7) * config.shake.maxRoll * amount;
    return state;
  }

  // The camera reaches the character's eyes, so the own body needs an explicit
  // presentation policy. Three modes:
  //
  //   'visible'  third person, or a first-person rig that keeps its body
  //   'hidden'   the whole character is culled (cheapest, the default)
  //   'legs'     separately-authored rigid head accessories are culled, while
  //              the one full-body SkinnedMesh remains completely untouched
  //
  // The traversal is guarded by the last applied mode: it runs on state
  // changes, not every frame.
  const HEAD_PARTS = /head|neck|face|hair|helmet|hat|eye|jaw|teeth|tongue|beard|collar|shoulder/i;
  function bodyMode(){
    if(!firstPersonView()) return 'visible';
    // Body presentation keeps the exact TPS mesh, mixer and skeleton. The eye
    // clearance in eyeTransform prevents the face from covering the near plane;
    // mutating a Head bone here used to leak into TPS and recursively update the
    // complete skeleton every frame.
    if(!armsPresentation()) return 'visible';
    if(config.viewPawn.showLegs) return 'legs';
    return 'hidden';
  }
  function syncBodyVisibility(force){
    const owner = pawn && pawn.owner;
    if(!owner || !owner.traverse) return;
    const mode = bodyMode();
    // Vehicle seating and asset hydration are allowed to change descendant
    // visibility while the camera mode itself stays unchanged. Callers at
    // those ownership boundaries can force one authoritative re-application
    // instead of leaving the cached mode pointing at stale mesh visibility.
    if(state.bodyMode === mode&&force!==true)return;
    state.bodyMode = mode;
    state.bodyHidden = mode !== 'visible';
    owner.traverse(node => {
      if(!node || node === owner || !node.isObject3D) return;
      if(!(node.isMesh || node.isSkinnedMesh)) return;
      const data=node.userData||{};
      // Asset loading owns these objects. A camera transition must never revive
      // a procedural body hidden because the real Character finished loading,
      // nor the temporary cube shown while that asset was pending.
      if(data.characterPlaceholderSuppressedByAsset||
        (mode!=='visible'&&data.logicElementAssetPlaceholder)){
        data.firstPersonBaseVisible=false;node.visible=false;return;
      }
      if(node.userData.firstPersonBaseVisible === undefined) node.userData.firstPersonBaseVisible = node.visible !== false;
      const base = node.userData.firstPersonBaseVisible !== false;
      if(mode === 'visible'){ node.visible = base; return; }
      if(mode === 'hidden'){ node.visible = false; return; }
      const label = [node.name, node.material && node.material.name, node.parent && node.parent.name].join(' ');
      // A monolithic imported Character is one SkinnedMesh. Hiding it because
      // its material happens to contain "head" removes the entire body. Keep
      // every skinned body exactly as authored; name filtering remains useful
      // only for separately-authored rigid head/hair pieces.
      node.visible = base && (node.isSkinnedMesh || !HEAD_PARTS.test(label));
    });
  }

  // ============================================================ 11 camera
  //
  // Three transforms, and which one a caller wants is never a matter of taste:
  //
  //   eyeTransform     the character's own head. Where a bullet, a grenade and
  //                    a tracer leave from, in BOTH views.
  //   aimTransform     the viewpoint the crosshair belongs to: the eye in first
  //                    person, the shoulder camera in third. Authoritative and
  //                    UNSHAKEN — this is what the world is queried with.
  //   cameraTransform  what the renderer gets: aimTransform plus camera shake.
  //
  // The split is the whole reason shake can exist at all. Shake is a lie told to
  // the eye about how hard something hit; folding it into the aim would make it
  // a lie told to the bullet as well, and a weapon whose accuracy depends on how
  // recently something exploded nearby is not a weapon anyone can learn.

  // The frame's aiming viewpoint. Every world query downstream — the hitscan
  // focus ray, the interaction look ray, the view model — reads this one
  // function, so the crosshair, the bullet and the "what would Use do" query
  // can never disagree about where the player is looking.
  function aimTransform(){
    const transform = eyeTransform();
    if(!transform) return null;
    return state.viewMode === 'first' ? transform : shoulderTransform(transform);
  }

  // What lot-king.js copies onto the shared game camera; nothing else is
  // allowed to move that camera while the rig owns the output.
  function cameraTransform(){
    const aim = aimTransform();
    if(!aim) return null;
    if(!config.shake.enabled || (state.shakeYaw === 0 && state.shakePitch === 0 && state.shakeRoll === 0)) return aim;
    // Shake is applied as three small angles on top of the aim orientation, in
    // the same YXZ order the eye uses, so the roll stays a roll about the view
    // axis rather than becoming a sideways slide.
    shakeEuler.set(aim.pitch + state.shakePitch, aim.yaw + Math.PI + state.shakeYaw,
      -aim.lean * config.lean.angle + state.shakeRoll, 'YXZ');
    shakeQuaternion.setFromEuler(shakeEuler);
    shakeForward.set(0, 0, -1).applyQuaternion(shakeQuaternion);
    shakeRight.set(1, 0, 0).applyQuaternion(shakeQuaternion);
    shakePosition.copy(aim.position);
    renderTransform.fov = aim.fov;
    renderTransform.near = aim.near;
    renderTransform.focusDistance = aim.focusDistance;
    renderTransform.yaw = aim.yaw;
    renderTransform.pitch = aim.pitch;
    renderTransform.lean = aim.lean;
    renderTransform.pivot = aim.pivot || null;
    return renderTransform;
  }

  // The eye: inside the character's head. In third person it stays the pivot the
  // shoulder camera orbits, so both views share one set of look angles.
  function eyeTransform(){
    if(!THREE || !eye) return null;
    const owner = pawn && pawn.owner;
    if(!owner) return null;
    // Only the Pawn root world transform is needed for the eye. Forcing
    // updateMatrixWorld(true) walks the complete GLB and every skeleton/bone;
    // camera, interaction and weapon queries can call this several times in a
    // frame, creating the severe close-camera/first-person FPS cliff.
    if(typeof owner.updateWorldMatrix === 'function') owner.updateWorldMatrix(true, false);
    else owner.updateMatrixWorld(false);
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
    const mount=state.viewMode==='third'?config.thirdPerson.cameraRotation:config.cameraRotation;
    if(mount&&(mount[0]||mount[1]||mount[2]))quaternion.multiply(cameraMountQuaternion.setFromEuler(cameraMountEuler.set(mount[0],mount[1],mount[2],'XYZ')));
    forward.set(0, 0, -1).applyQuaternion(quaternion);   // == (cosP·sinYaw, sinP, cosP·cosYaw)
    right.set(1, 0, 0).applyQuaternion(quaternion);
    const eyeHeight=resolvedEyeHeight();
    eye.y += eyeHeight + state.eyeOffset + state.bobOffsetY;
    eye.addScaledVector(right, state.bobOffsetX);
    if(state.viewMode === 'first' && !armsPresentation()){
      // Move horizontally beyond the face rather than along the pitched view
      // vector. Looking down must not drive the camera back into the chest (and
      // recreate the same near-plane overdraw/FPS cliff we are avoiding).
      eye.x += Math.sin(yaw) * config.bodyEyeForward;
      eye.z += Math.cos(yaw) * config.bodyEyeForward;
      eye.addScaledVector(right,config.bodyEyeSide);
    }
    if(lean !== 0){
      // Sliding the eye through a wall would let a player see into rooms they
      // are not in, so the lean is stopped by whatever it runs into.
      leanBase.copy(eye);
      eye.addScaledVector(right, lean * config.lean.offset);
      pullOutOfWalls(leanBase, eye);
    }
    return {position:eye, quaternion, forward, right, fov:state.fov,
      near:state.viewMode==='first'&&!armsPresentation()?config.near:.1,
      focusDistance:config.focusDistance,
      yaw, pitch, lean, eyeHeight};
  }

  // Over the shoulder: same orientation as the eye, pulled back along the view
  // direction and offset sideways, then pulled IN again by whatever wall is in
  // the way. Reusing the eye's quaternion is what makes the crosshair mean the
  // same thing in both views.
  //
  // The lateral offset follows `sideBlend`, not `weaponSide`: the swap is an arc
  // the eye can follow rather than a cut, which is what every cover shooter does
  // when the player changes shoulder against a wall.
  function shoulderTransform(base){
    const tp = config.thirdPerson;
    pivot.copy(base.position);
    pivot.y += finite(state.tpHeight, tp.height) - finite(base.eyeHeight,config.eyeHeight);
    // The pivot sits slightly ahead of the spine so the character occupies the
    // lower third of the frame instead of standing dead centre in it.
    if(tp.pivotForward !== 0) pivot.addScaledVector(base.forward, tp.pivotForward);
    const armLength=springArm(base,pivot);
    // A collision may leave less space than the character body itself. Do not
    // put the lens inside a SkinnedMesh (the close-camera FPS cliff): use the
    // same forward-cleared eye point as first person until the arm is safe.
    if(armLength<tp.minimumBodyDistance){
      camPosition.copy(base.position).addScaledVector(base.forward,config.bodyEyeForward).addScaledVector(base.right,config.bodyEyeSide);
      return {position:camPosition,quaternion:base.quaternion,forward:base.forward,right:base.right,
        fov:state.fov,near:config.near,yaw:base.yaw,pitch:base.pitch,lean:base.lean,pivot,
        focusDistance:tp.focusDistance,bodySafetyFallback:true};
    }
    camPosition.copy(pivot)
      .addScaledVector(base.forward, -armLength)
      .addScaledVector(base.right, state.tpShoulder * state.sideBlend);
    if(tp.collisionMode === 'pull-in') pullOutOfWalls(pivot, camPosition);
    return {position:camPosition, quaternion:base.quaternion, forward:base.forward, right:base.right,
      fov:state.fov, near:tp.near, yaw:base.yaw, pitch:base.pitch, lean:base.lean, pivot,
      focusDistance:tp.focusDistance};
  }

  // Spring arm length for this frame. The wanted length is what the pose asks
  // for; the arm is then shortened by whatever is behind the character and
  // released again SLOWLY. The asymmetry is the whole trick: snapping in keeps
  // the near plane out of a wall on the frame the wall appears, while easing out
  // stops a doorway from flinging the camera backwards the instant it clears.
  function springArm(base, from){
    const tp = config.thirdPerson;
    const wanted = state.tpDistance;
    const clear = clearDistance(base, from, wanted);
    if(tp.collisionMode !== 'pull-in'){
      // Fixed means no easing/breathing, not permission to enter geometry.
      // It snaps to the collision-safe length and returns to the authored arm
      // as soon as the path clears.
      state.armLength = clear;
      return clear;
    }
    const rate = clear < state.armLength ? tp.pullInSpeed : tp.pushOutSpeed;
    state.armLength += (clear - state.armLength) * dampAlpha(rate, state.frameDt || .016);
    return clamp(state.armLength, .05, wanted);
  }

  // How far back from `from` the camera can sit before it is inside something.
  // This is one analytic segment/AABB pass. The former sampled every collider
  // eight times here and eight more times in pullOutOfWalls, and cameraTransform
  // is legitimately queried by camera, interactions and view model in one
  // frame. That multiplied into the visible FPS cliff near walls.
  function clearDistance(base, from, wanted){
    const boxes = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
    if(!Array.isArray(boxes) || !boxes.length) return wanted;
    const tp = config.thirdPerson;
    const radius = tp.collisionRadius;
    const owner = pawn && pawn.owner;
    segmentEnd.set(from.x - base.forward.x * wanted, from.y - base.forward.y * wanted, from.z - base.forward.z * wanted);
    const frame=state.cameraProbeFrame||0,cache=cameraProbeCache;
    if(cache.frame===frame&&cache.boxes===boxes&&cache.length===boxes.length&&cache.fromX===from.x&&cache.fromY===from.y&&cache.fromZ===from.z&&cache.toX===segmentEnd.x&&cache.toY===segmentEnd.y&&cache.toZ===segmentEnd.z&&cache.radius===radius)return cache.result;
    const hit = firstBoxHit(boxes, owner, from, segmentEnd, radius);
    const result=hit == null ? wanted : Math.max(.05, wanted * hit - .02);Object.assign(cache,{frame,boxes,length:boxes.length,fromX:from.x,fromY:from.y,fromZ:from.z,toX:segmentEnd.x,toY:segmentEnd.y,toZ:segmentEnd.z,radius,result});return result;
  }

  function belongsTo(node, owner){
    for(let current = node; current; current = current.parent || null) if(current === owner) return true;
    return false;
  }

  function cameraCollider(col, owner, from, to){
    if(!col || col.enabled === false || col.cameraCollision === false || col.cameraBlocker === false || col.compoundRoot === true || col.horizontalSurface === true) return false;
    // A compound root is only a broad-phase envelope for its generated parts.
    // Treating that large envelope as solid collapses the spring arm even when
    // the camera is in empty space above a road/asphalt mesh. The real parts
    // remain eligible below, so walls still pull the camera in as authored.
    // Moving physics props and Pawn-owned boxes must never pump the camera.
    // In particular a Logic Element collider is owned by a child node, not by
    // the Pawn root, which made the old direct equality test miss itself.
    if(col.physics === true) return false;
    if(owner && (belongsTo(col.owner, owner) || belongsTo(col.logicElementOwner, owner))) return false;
    // Generated horizontal parts are support samples, not wall geometry. Their
    // conservative boxes can be metres thick (roads, markup and borders in an
    // imported city block), so even an arm visibly above asphalt may start
    // inside one. Authored roofs/floors remain ordinary box colliders and still
    // block the camera when the arm crosses them.
    return col.x != null && col.z != null && col.hx != null && col.hz != null;
  }

  function segmentBoxHit(from, to, col, radius){
    let low = 0, high = 1;
    const axes = [['x','hx'], ['y','hy'], ['z','hz']];
    for(let i = 0; i < axes.length; i++){
      const axis = axes[i][0], half = axes[i][1];
      if(col[axis] == null || col[half] == null) continue;
      const start = from[axis], delta = to[axis] - start;
      const min = col[axis] - Math.abs(col[half]) - radius;
      const max = col[axis] + Math.abs(col[half]) + radius;
      if(Math.abs(delta) < 1e-7){ if(start < min || start > max) return null; continue; }
      let enter = (min - start) / delta, exit = (max - start) / delta;
      if(enter > exit){ const swap = enter; enter = exit; exit = swap; }
      low = Math.max(low, enter); high = Math.min(high, exit);
      if(low > high) return null;
    }
    return high >= 0 && low <= 1 ? clamp(low, 0, 1) : null;
  }

  function firstBoxHit(boxes, owner, from, to, radius){
    let first = null;
    for(let i = 0; i < boxes.length; i++){
      const col = boxes[i];
      if(!cameraCollider(col, owner, from, to)) continue;
      const hit = segmentBoxHit(from, to, col, radius);
      if(hit != null && (first == null || hit < first)) first = hit;
    }
    return first;
  }

  // Stops a short sideways move (lean, or an opt-in shoulder spring) at the
  // first solid box using the same analytic probe as the main camera arm.
  function pullOutOfWalls(from, to){
    const boxes = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
    if(!Array.isArray(boxes) || !boxes.length) return to;
    const radius = config.thirdPerson.collisionRadius;
    const owner = pawn && pawn.owner;
    const hit = firstBoxHit(boxes, owner, from, to, radius);
    if(hit == null) return to;
    const safe = Math.max(0, hit - .015);
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

  // ========================================================== 12 bindings
  //
  // Grouped blocks each need their own branch. The generic `firstPerson.` branch
  // below writes `patch['thirdPerson.distance'] = value`, which normalizeConfig
  // then ignores, so every nested camera, lean and shake setting would have been
  // a dead control in the inspector without this table.
  const CONFIG_GROUPS = Object.freeze({
    thirdPerson:normalizeThirdPerson,
    lean:normalizeLean,
    shake:normalizeShake,
  });
  function applyBinding(path, value){
    const key = String(path || '');
    if(key.indexOf('firstPerson.') !== 0) return false;
    const groupName = key.slice(12).split('.')[0];
    if(groupName === 'viewPawn' && key.length > 12 + groupName.length + 1){
      const patch = {};
      const field = key.slice(12 + groupName.length + 1);
      patch[field] = value;
      if(field === 'kind') patch.enabled = value === 'arms' || value === 'first-person-arms';
      configureViewPawn(patch);
      return true;
    }
    if(CONFIG_GROUPS[groupName] && key.length > 12 + groupName.length + 1){
      const patch = Object.assign({}, config[groupName]);
      patch[key.slice(12 + groupName.length + 1)] = value;
      config[groupName] = CONFIG_GROUPS[groupName](patch);
      return true;
    }
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
    // Saved graphs may still address the pre-component fields. Treat them as
    // adapters into schema v1 instead of creating a second source of truth.
    if(key === 'firstPerson.presentation'){
      configureViewPawn({kind:value === 'arms' ? 'first-person-arms' : 'none', enabled:value === 'arms'});
      return true;
    }
    if(key === 'firstPerson.hideOwnBody'){
      configureViewPawn({kind:value === true ? 'first-person-arms' : 'none', enabled:value === true});
      return true;
    }
    if(key === 'firstPerson.showLegs'){
      configureViewPawn({showLegs:value === true});
      return true;
    }
    if(key.indexOf('firstPerson.') === 0){
      const patch = {}; patch[key.slice(12)] = value;
      const merged = normalizeConfig(Object.assign({}, config, patch));
      merged.weapon = config.weapon;   // weapon has its own binding branch
      Object.assign(config, merged);
      if(key==='firstPerson.eyeHeight'||key==='firstPerson.autoEyeHeight'||key==='firstPerson.eyeBoneOffset'){
        state.eyeAnchorBone=null;state.eyeAnchorHeight=null;state.eyeAnchorSearchAt=0;
      }
      return true;
    }
    return false;
  }

  function reset(){
    stopContinuousFireAction();
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
    state.sinceShot = 9;
    state.hits = 0;
    state.kills = 0;
    state.lastHit = null;
    state.trauma = 0;
    state.shakeYaw = 0;
    state.shakePitch = 0;
    state.shakeRoll = 0;
    state.sideBlend = state.weaponSide;
    state.armLength = config.thirdPerson.distance;
    state.tpDistance = config.thirdPerson.distance;
    state.tpShoulder = config.thirdPerson.shoulder;
    state.tpHeight = config.thirdPerson.height;
    state.sprintBlend = 0;
    state.airTime = 0;
    syncFromOwner();
    return state;
  }

  // Ownership can move without resetting the actor. Clear only edge/held input
  // state, preserving ammunition, health-facing statistics and camera tuning.
  // Otherwise a Pawn displaced by an explicit vehicle/mount transfer can fire,
  // toggle view or swap shoulder when it is no longer the Player's actor.
  function releaseInput(){
    stopContinuousFireAction();
    state.adsHeld = false;
    state.adsForced = false;
    state.ads = 0;
    state.firePressed = false;
    state.reloadPressed = false;
    state.burstLeft = 0;
    state.viewTogglePressed = false;
    state.swapPressed = false;
    state.lean = 0;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
    state.bobOffsetX = 0;
    state.bobOffsetY = 0;
    return true;
  }

  syncFromOwner();

  return Object.freeze({
    config:() => config,
    state,
    enabled,
    active,
    firstPersonView,
    armsPresentation,
    viewMode:() => state.viewMode,
    setViewMode,
    toggleViewMode,
    setEyeOffset,
    equipWeapon,
    addReserve,
    armed:() => state.armed,
    weapon:() => config.weapon,
    reset,
    releaseInput,
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
    // The shoulder the camera is actually on, mid-swap. The view model reads it
    // so the weapon crosses over with the camera instead of snapping.
    shoulderBlend:() => state.sideBlend,
    setShoulder,
    adjustThirdPersonDistance,
    leanAmount:() => state.lean,
    setCoverLean,
    swapShoulder,
    preMovement,
    afterMovement,
    cameraTransform,
    aimTransform,
    eyeTransform,
    // Where the crosshair is resting in the world, and how far that is. Third
    // person needs it to draw an honest reticle; first person gets the same
    // answer for free.
    focusDistance:() => state.focusDistance,
    aimDirection,
    eyePosition,
    addTrauma,
    trauma:() => state.trauma,
    armLength:() => state.armLength,
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

// ========================================================== 13 attachment
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
  // Getting hit shakes the camera. The rig listens for it on the shared Pawn
  // event channel rather than reaching into character-vitals.js: vitals is a
  // contract other packs (animals, soccer) also attach to, and a rig that
  // reached into it would make the two modules impossible to use apart.
  const onDamaged = event => {
    const detail = event && event.detail || {};
    if(detail.type !== 'OnCharacterDamaged') return;
    if(detail.pawnId && pawn.id && detail.pawnId !== pawn.id) return;
    const config = controller.config();
    // Bigger hits shake harder, up to the authored ceiling at ~40 damage.
    const share = clamp(finite(detail.damage, 20) / 40, .2, 1);
    controller.addTrauma(config.shake.damage * share);
  };
  if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('lk-pawn-event', onDamaged);
  const previousDispose = pawn.dispose.bind(pawn);
  pawn.dispose = function(){
    if(typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('lk-pawn-event', onDamaged);
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
  normalizeThirdPerson,
  normalizeLean,
  normalizeShake,
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
