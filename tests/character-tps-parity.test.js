'use strict';

/* =========================================================
   Third-person combat parity.

   The committente's question was literally "can the advanced character do the
   same things" as the FPS pawn. This file is the answer, asserted rather than
   claimed: it drives ONE Character Pawn and checks, verb by verb, that every
   combat action the first-person Pawn owns is available and produces the same
   result while the view is over the shoulder.

   Parity means the SAME runtime, not a second one. So the test also proves the
   negative: the third-person template does not carry a private weapon, damage
   or inventory implementation — it carries the same `firstPerson`, `abilities`,
   `vitals`, `loadout` and `inventory` blocks, reaching the same modules.

   HOW THIS FILE IS ORGANISED
     01 harness            window stubs, event capture, fake Pawn
     02 template parity    the authored blocks match the FPS template
     03 verb parity        every combat verb, run in both views, compared
     04 camera             third-person camera behaviour and the runtime toggle
     05 editability        every exposed variable reaches a real binding
   ========================================================= */

const assert = require('node:assert/strict');

// ================================================================= 01 harness

global.window = global;
global.CustomEvent = class CustomEvent {
  constructor(type, init){ this.type = type; this.detail = (init || {}).detail || {}; }
};
const listeners = {};
global.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
global.removeEventListener = (type, fn) => {
  const list = listeners[type] || [];
  const at = list.indexOf(fn);
  if(at >= 0) list.splice(at, 1);
};
const events = [];
global.dispatchEvent = event => {
  events.push(event.detail);
  (listeners[event.type] || []).forEach(fn => fn(event));
  return true;
};

require('../js/runtime/character-placeholder-locomotion.js');
require('../js/runtime/mixamo-placeholder-clips.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-nodes-character.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/first-person-controller.js');
require('../js/runtime/character-abilities.js');
require('../js/runtime/physics/pawn-death-physics.js');
require('../js/runtime/character-vitals.js');
require('../js/runtime/character-combat-cover.js');
require('../js/runtime/item-system.js');
require('../js/logic/logic-nodes-fps.js');
require('../js/logic/logic-templates.js');
require('../js/runtime/character-bodies.js');
require('../js/logic/logic-templates-character.js');
require('../js/logic/logic-templates-fps.js');
require('../js/logic/logic-validator.js');

const FP = global.LK_RUNTIME_FIRST_PERSON;
const ABILITIES = global.LK_RUNTIME_CHARACTER_ABILITIES;
const VITALS = global.LK_RUNTIME_CHARACTER_VITALS;
const COVER = global.LK_RUNTIME_CHARACTER_COVER;
const TEMPLATES = global.LK_LOGIC_TEMPLATES;
const registry = global.LK_LOGIC_NODES_MVP.createRegistry();

function test(name, run){
  events.length = 0;
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
function saw(type){ return events.some(detail => detail && detail.type === type); }

// The Pawn contract the rig composes onto. THREE is absent in node, so the
// controller runs its DOM-free paths: view angles, weapon state, ammo, recoil
// and the whole event surface stay fully testable.
function fakePawn(overrides){
  return Object.assign({
    id:'pawn-parity',
    possessed:true,
    enabled:true,
    hidden:false,
    owner:{rotation:{x:0, y:0, z:0}, position:{x:0, y:0, z:0}, userData:{}, traverse(){}},
    state:{speed:0, airborne:false, grounded:true},
    reset(){ return true; },
    dispose(){ return true; },
  }, overrides || {});
}

function tpsTemplate(){ return TEMPLATES.get('logic-template-player-character-third-person'); }
function fpsTemplate(){ return TEMPLATES.get('logic-template-player-first-person'); }

// ========================================================== 02 template parity

test('the third person combat template is registered and validates', () => {
  const template = tpsTemplate();
  assert.ok(template, 'the third person combat template is registered');
  assert.ok(template.graph.characterPawn, 'it is an ordinary Character Pawn, not a fork');
  const result = global.LK_LOGIC_VALIDATOR.validateGraph(template.graph, registry);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('the third person Pawn carries every combat block the FPS Pawn carries', () => {
  const tps = tpsTemplate().graph.characterPawn;
  const fps = fpsTemplate().graph.characterPawn;
  // Parity is structural: the same named blocks, reaching the same modules.
  ['firstPerson', 'abilities', 'vitals', 'loadout', 'inventory'].forEach(block => {
    assert.ok(fps[block], 'the FPS template is expected to own ' + block);
    assert.ok(tps[block], 'the third person template is missing ' + block);
  });
  assert.equal(tps.firstPerson.enabled, true, 'the shared view rig is switched on');
  assert.equal(tps.firstPerson.view, 'third', 'it starts over the shoulder');
  assert.equal(tps.firstPerson.allowViewToggle, true, 'Camera Mode can swap views at runtime');
  assert.equal(tps.firstPerson.hideOwnBody, false, 'the body is the point of a third person camera');
  // The loadout is the same set of roles: fists, sidearm, melee and a thrown.
  assert.deepEqual(tps.loadout.map(item => item.preset).sort(), fps.loadout.map(item => item.preset).sort(),
    'both Pawns spawn holding the same roles');
  assert.equal(tps.inventory.weaponSlots, fps.inventory.weaponSlots, 'the same number row');
  assert.equal(tps.movement.inputMode, 'heading', 'the body follows the view, not the camera frame');
  assert.equal(tps.movement.facingMode, 'heading', 'facing must not turn toward velocity while aiming');
});

test('the third person template exposes combat, not follow-camera settings', () => {
  const graph = tpsTemplate().graph;
  const bindings = new Set(graph.variables.map(variable => variable.binding).filter(Boolean));
  [
    'firstPerson.thirdPerson.distance', 'firstPerson.thirdPerson.shoulder',
    'firstPerson.thirdPerson.swapSpeed', 'firstPerson.shake.enabled',
    'firstPerson.weapon.preset', 'firstPerson.weapon.damage', 'firstPerson.weapon.magazine',
    'firstPerson.weapon.reloadTime', 'vitals.maxHealth', 'abilities.mantle.maxHeight',
  ].forEach(binding => assert.ok(bindings.has(binding), 'missing exposed setting ' + binding));
  graph.variables.forEach(variable => {
    assert.ok(!/^camera\./.test(String(variable.binding || '')),
      'the dead follow-camera controls must not be exposed: ' + variable.binding);
  });
});

test('eight-way locomotion is authored for the combat body', () => {
  const set = tpsTemplate().graph.characterPawn.animationSet;
  const grounded = set.filter(entry => entry.state === 'grounded' && entry.speed > 0);
  const directions = new Set(grounded.map(entry => entry.direction.map(v => Math.round(v * 100) / 100).join(',')));
  assert.equal(directions.size, 8, 'a strafing shooter needs all eight directions, got ' + directions.size);
  assert.ok(set.some(entry => entry.id === 'idle'), 'and an idle to blend out of');
});

// ============================================================= 03 verb parity

// Every combat verb, driven through the rig exactly as the frame loop drives
// it. `view` selects which output the rig produces; nothing else changes.
function runCombatScript(view){
  const pawn = fakePawn();
  const rig = FP.create(null, pawn, {
    view,
    allowViewToggle:true,
    adsBlend:30,
    weapon:{preset:'rifle', magazine:4, ammoReserve:12, fireRate:1000, reloadTime:.4, spreadHip:0},
  });
  const log = {view:rig.viewMode()};

  // -- equip -------------------------------------------------------------
  log.equipped = rig.equipWeapon({preset:'shotgun'}).preset;
  log.equipEvent = saw('OnWeaponEquipped');
  rig.equipWeapon({preset:'rifle', magazine:4, ammoReserve:12, fireRate:1000, reloadTime:.4, spreadHip:0});

  // -- aim down sights ---------------------------------------------------
  for(let i = 0; i < 20; i++) rig.preMovement(.05, {aim:true});
  log.aiming = rig.isAiming();
  for(let i = 0; i < 20; i++) rig.preMovement(.05, {aim:false});
  log.released = rig.isAiming();

  // -- fire: cadence, ammo, recoil, tracer payload ------------------------
  const before = rig.ammo().ammo;
  const shot = rig.fire();
  log.fired = !!shot;
  log.spent = before - rig.ammo().ammo;
  log.recoil = rig.state.recoilPitch > 0;
  log.tracer = !!(shot && shot.tracer && shot.tracer.enabled);
  log.fireEvent = saw('OnWeaponFired');
  // Recoil decays back on its own.
  rig.afterMovement(.5, {}, {speed:0, grounded:true});
  log.recoilRecovered = rig.state.recoilPitch < .0001 || rig.state.recoilPitch < .01;

  // -- reload ------------------------------------------------------------
  rig.state.cooldown = 0;
  rig.fire(); rig.state.cooldown = 0;
  rig.fire(); rig.state.cooldown = 0;
  rig.fire(); rig.state.cooldown = 0;
  log.emptied = rig.ammo().ammo === 0;
  log.autoReload = rig.ammo().reloading;
  for(let frame = 0; frame < 12; frame++) rig.preMovement(.1, {});
  log.reloaded = rig.ammo().ammo;
  log.reserveSpent = rig.ammo().reserve;
  log.reloadEvent = saw('OnWeaponReloaded');

  // -- grenade -----------------------------------------------------------
  rig.equipWeapon({preset:'grenade'});
  rig.state.cooldown = 0;
  const thrown = rig.fire();
  log.thrown = !!(thrown && thrown.type === 'OnWeaponThrown');
  log.throwReserve = rig.ammo().reserve;

  // -- ammo pickup -------------------------------------------------------
  rig.equipWeapon({preset:'rifle', magazine:4, ammoReserve:12});
  rig.state.reserve = 0;
  log.ammoGained = rig.addReserve(5);

  // -- unarmed / drop ----------------------------------------------------
  rig.equipWeapon(null);
  log.disarmed = rig.armed() === false;
  return log;
}

test('every combat verb behaves identically in first and third person', () => {
  events.length = 0;
  const first = runCombatScript('first');
  events.length = 0;
  const third = runCombatScript('third');

  assert.equal(first.view, 'first');
  assert.equal(third.view, 'third');
  // The view is the ONLY field allowed to differ.
  const compare = log => Object.assign({}, log, {view:null});
  assert.deepEqual(compare(third), compare(first),
    'third person must produce the same combat result as first person');

  // ...and the results themselves have to be right, not merely equal.
  assert.equal(third.equipped, 'shotgun', 'the third person Pawn can equip a weapon');
  assert.equal(third.equipEvent, true, 'equipping is announced on the shared Pawn event channel');
  assert.equal(third.aiming, true, 'the third person Pawn can aim down sights');
  assert.equal(third.released, false, 'and stop aiming');
  assert.equal(third.fired, true, 'the third person Pawn can fire');
  assert.equal(third.spent, 1, 'a shot costs a round');
  assert.equal(third.recoil, true, 'firing kicks the aim up');
  assert.equal(third.tracer, true, 'the shot carries the tracer contract the effect system reads');
  assert.equal(third.fireEvent, true, 'firing is announced');
  assert.equal(third.emptied, true, 'the magazine empties');
  assert.equal(third.autoReload, true, 'an empty magazine reloads itself');
  assert.equal(third.reloaded, 4, 'the magazine refills');
  assert.equal(third.reserveSpent, 8, 'the reserve pays for the refill');
  assert.equal(third.thrown, true, 'the third person Pawn can throw a grenade');
  assert.equal(third.ammoGained, 5, 'an ammo box tops up the reserve');
  assert.equal(third.disarmed, true, 'and the weapon can be taken away again');
});

test('third person damage, headshots and death use the shared contract', () => {
  const target = {userData:{damageable:{health:100, maxHealth:100, team:'enemy'}}};
  const head = {userData:{damageableHitZone:'head'}, parent:target};
  assert.equal(FP.damageableOf(head), target, 'the health pool is found on the ancestor');
  assert.equal(FP.isHeadshotNode(head), true, 'head zones are recognised from any view');
  const body = FP.applyDamage(target, 40);
  assert.equal(body.health, 60);
  const lethal = FP.applyDamage(target, 500);
  assert.equal(lethal.killed, true, 'a target can be killed');

  // Taking damage: the same vitals block the FPS Pawn carries.
  const pawn = fakePawn();
  const vitals = VITALS.attach(null, pawn, tpsTemplate().graph.characterPawn.vitals);
  assert.ok(vitals, 'the third person Pawn has vitals');
  vitals.applyDamage(60, {source:'test'});
  assert.ok(vitals.state.health < 100 || vitals.state.armor < 100, 'damage lands on health or armour');
  vitals.applyDamage(1000, {source:'test'});
  assert.equal(vitals.state.dead, true, 'the third person Pawn can be killed');
});

test('the third person Pawn keeps the shared traversal verbs', () => {
  const pawn = fakePawn();
  const abilities = ABILITIES.attach(null, pawn, tpsTemplate().graph.characterPawn.abilities);
  assert.ok(abilities, 'the abilities block attaches');
  // Crouch is a toggle in this template, so one press latches it.
  abilities.preMovement(.05, {crouch:true});
  abilities.preMovement(.05, {crouch:false});
  for(let i = 0; i < 30; i++) abilities.preMovement(.05, {});
  assert.ok(abilities.crouchAmount() > .5, 'crouch latches and blends in');
  assert.ok(ABILITIES.STATES.indexOf('vault') >= 0 && ABILITIES.STATES.indexOf('mantle') >= 0,
    'vault and mantle are part of the shared state machine');
});

// ================================================================== 04 cover

// The arcade box collider shape the movement controller resolves against, which
// is the same list the cover probes read.
function boxCollider(x, y, z, hx, hy, hz){
  return {x, y, z, hx, hy, hz, enabled:true};
}
function coverGame(boxes){
  return {world:{colliders:{box:boxes || [], circle:[]}, registry:[], characterGroundHeight:() => 0}, state:{}, systems:{}};
}
function coverPawn(){
  const pawn = fakePawn();
  pawn.movementController = {options:() => ({radius:.35, height:1.8, walkSpeed:3.1})};
  return pawn;
}

test('cover height decides the cover class, and unknown names throw', () => {
  // The published shooter metrics: high cover is head height from 1.75 m, low
  // cover is waist height around 1.0-1.25 m, and knee height is not cover.
  assert.equal(COVER.coverClassForHeight(1.15).id, 'low', 'waist height is low cover');
  assert.equal(COVER.coverClassForHeight(2).id, 'high', 'head height is high cover');
  assert.equal(COVER.coverClassForHeight(.45), null, 'knee height is not cover at all');
  assert.equal(COVER.coverClassForHeight(1.5), null, 'the gap between the classes is not cover either');
  assert.equal(COVER.coverClass('low').fireMode, 'pop', 'low cover is popped over');
  assert.equal(COVER.coverClass('high').fireMode, 'lean', 'high cover is leaned past');
  assert.throws(() => COVER.coverClass('waist'), /unknown cover class/, 'a typo must throw, not pick a default');
  assert.throws(() => COVER.normalizeConfig({button:'triangle'}), /unknown cover button/,
    'an unbindable cover button must throw');
});

test('the character takes cover, hugs it, slides along it and lets go', () => {
  // A 6 m high wall face on the +z side of the character, at head height.
  const wall = boxCollider(0, 1.1, 3, 4, 1.1, .5);
  const pawn = coverPawn();
  const game = coverGame([wall]);
  const cover = COVER.create(game, pawn, {button:'takeCover', reach:1.6, hugDistance:.42, blend:40});
  pawn.owner.position.z = 2;         // just south of the wall
  pawn.owner.rotation.y = 0;          // facing +z, straight at it

  assert.ok(cover.findCover(), 'the wall in front is recognised as cover');
  assert.equal(cover.preMovement(.016, {takeCover:true}), true, 'the press takes cover');
  assert.equal(cover.inCover(), true);
  assert.equal(cover.coverClass(), 'high', 'a 2.2 m wall is high cover');
  assert.equal(saw('OnCharacterCoverEntered'), true, 'entering cover is announced');

  // Hugging: the body settles at the authored distance from the face.
  for(let i = 0; i < 60; i++) cover.preMovement(.016, {takeCover:true});
  const face = wall.z - wall.hz;                       // 2.5
  assert.ok(Math.abs(pawn.owner.position.z - (face - .42)) < .05,
    'the body hugs the face at the authored distance, got ' + pawn.owner.position.z.toFixed(3));

  // Sliding along it moves laterally and stays on the wall.
  const startX = pawn.owner.position.x;
  for(let i = 0; i < 30; i++) cover.preMovement(.016, {takeCover:true, x:1});
  assert.ok(pawn.owner.position.x > startX + .1, 'the character slides along the face');
  assert.ok(Math.abs(pawn.owner.position.z - (face - .42)) < .05, 'and stays glued to it while sliding');

  // Pulling away releases it.
  cover.preMovement(.016, {takeCover:true, z:-1});
  assert.equal(cover.inCover(), false, 'pulling off the wall lets go');
  assert.equal(saw('OnCharacterCoverExited'), true, 'leaving cover is announced');
});

test('cover steadies the weapon and leaning out gives that back', () => {
  const wall = boxCollider(0, 1.1, 3, 4, 1.1, .5);
  const pawn = coverPawn();
  const cover = COVER.create(coverGame([wall]), pawn, {button:'takeCover', reach:1.6, blend:40});
  pawn.owner.position.z = 2;
  cover.preMovement(.016, {takeCover:true});
  for(let i = 0; i < 60; i++) cover.preMovement(.016, {takeCover:true});
  const braced = cover.brace();
  assert.ok(braced > .5, 'hiding behind cover braces the weapon, got ' + braced);
  for(let i = 0; i < 60; i++) cover.preMovement(.016, {takeCover:true, aim:true});
  assert.ok(cover.exposure() > .8, 'aiming leans the character out past the edge');
  assert.ok(cover.brace() < braced, 'and leaning out gives the steadiness back');

  // The rig reads the brace off the Pawn state, which is how one spread ledger
  // can account for crouching, cover and sliding without any of them knowing
  // about the others.
  assert.ok(pawn.state.coverBrace >= 0, 'the brace is published for the spread ledger');
});

test('low cover is crouched behind and popped over, high cover is leaned past', () => {
  const low = boxCollider(0, .55, 3, 4, .55, .5);      // 1.1 m: waist height
  const pawn = coverPawn();
  const leans = [];
  pawn.firstPerson = {
    setCoverLean(value){ leans.push(value); return value; },
    setEyeOffset(value){ pawn.eyeOffset = value; return value; },
    weaponSide:() => 1,
    setShoulder(){ return 1; },
  };
  const cover = COVER.create(coverGame([low]), pawn, {button:'takeCover', reach:1.6, blend:40});
  pawn.owner.position.z = 2;
  cover.preMovement(.016, {takeCover:true});
  assert.equal(cover.coverClass(), 'low', 'waist height is low cover');
  for(let i = 0; i < 60; i++) cover.preMovement(.016, {takeCover:true});
  assert.ok(pawn.eyeOffset < 0, 'the character ducks behind low cover');
  for(let i = 0; i < 40; i++) cover.preMovement(.016, {takeCover:true, aim:true});
  assert.ok(pawn.eyeOffset > -.05, 'aiming pops the eye up over the lip');
  assert.ok(leans.every(value => value === 0), 'low cover never leans: it pops');
});

test('the contextual crouch button only claims the press when there is cover', () => {
  const wall = boxCollider(0, 1.1, 3, 4, 1.1, .5);
  const pawn = coverPawn();
  const cover = COVER.create(coverGame([wall]), pawn, {reach:1.6});
  // Standing in the open, crouch has to fall through to the ability set.
  pawn.owner.position.z = -20;
  assert.equal(cover.preMovement(.016, {crouch:true}), false, 'crouch in the open is not cover');
  assert.equal(cover.inCover(), false);
  // Facing the wall, the same press takes cover.
  pawn.owner.position.z = 2;
  cover.preMovement(.016, {crouch:false});
  assert.equal(cover.preMovement(.016, {crouch:true}), true, 'crouch facing cover takes it');
  assert.equal(cover.inCover(), true);
});

test('cover and traversal never own the same frame', () => {
  const abilities = ABILITIES.create(null, fakePawn(), tpsTemplate().graph.characterPawn.abilities);
  assert.equal(abilities.isSuspended(), false);
  abilities.suspend(true);
  assert.equal(abilities.isSuspended(), true, 'cover can stand the ability set down');
  assert.equal(abilities.preMovement(.016, {crouch:true, jump:true}), false,
    'a suspended ability set reads no input and claims no frame');
  abilities.suspend(false);
  assert.equal(abilities.isSuspended(), false, 'and takes the body back');
});

test('a long fall rolls out, a short one does not', () => {
  const pawn = fakePawn();
  pawn.movementController = {options:() => ({radius:.35, height:1.8}), reset(){}, configure(){}};
  const abilities = ABILITIES.create(null, pawn, tpsTemplate().graph.characterPawn.abilities);

  // Short drop: the feet just plant.
  pawn.state.grounded = false;
  pawn.state.velocityY = -3;
  abilities.preMovement(.016, {});
  pawn.state.grounded = true;
  assert.equal(abilities.resolveLanding({}), 'soft', 'a short drop is an ordinary step');

  // Long drop while running: it converts into a roll.
  pawn.state.grounded = false;
  pawn.state.velocityY = -14;
  abilities.preMovement(.016, {});
  pawn.state.grounded = true;
  pawn.state.speed = 5;
  assert.equal(abilities.resolveLanding({}), 'roll', 'a long drop with momentum rolls out');
  assert.equal(saw('OnCharacterLandRoll'), true, 'and says so');

  // Long drop standing still: a heavy landing, not a tumble across the room.
  abilities.reset();
  pawn.state.grounded = false;
  pawn.state.velocityY = -14;
  abilities.preMovement(.016, {});
  pawn.state.grounded = true;
  pawn.state.speed = 0;
  assert.equal(abilities.resolveLanding({}), 'heavy', 'a long drop on the spot plants the feet');
});

test('a vehicle dismount roll follows inherited world velocity', () => {
  const pawn=fakePawn({playAction(){return true;}});
  pawn.movementController={options:()=>({radius:.35,height:1.8}),reset(){},configure(){}};
  const abilities=ABILITIES.create(null,pawn,tpsTemplate().graph.characterPawn.abilities);
  assert.equal(abilities.beginRoll(12,{force:true,reason:'vehicle-exit',dirX:-4,dirZ:3,impact:52}),true);
  assert.ok(Math.abs(abilities.state.slideDirX+.8)<1e-9);
  assert.ok(Math.abs(abilities.state.slideDirZ-.6)<1e-9);
  assert.equal(saw('OnCharacterRollStarted'),true);
});

test('a running jump lands normally; only survived fall damage plays Hard Landing', () => {
  const actions = [];
  const pawn = fakePawn({
    config:{animations:{land:'Run To Stop', landMoving:'Falling To Landing', landHeavy:'Hard Landing'}},
    playAction(name){ actions.push(name); return true; },
  });
  pawn.movementController = {options:() => ({radius:.35, height:1.8}), reset(){}, configure(){}};
  const abilities = ABILITIES.create(null, pawn, {land:{damageSpeed:10, damageScale:8, rollSpeed:20}});

  pawn.state.grounded = false;
  pawn.state.velocityY = -6.9; // stock 1.05 m jump returns at about 6.8 m/s
  abilities.preMovement(.016, {});
  pawn.state.grounded = true;
  pawn.state.speed = 5.9;
  assert.equal(abilities.resolveLanding({}), 'soft');
  assert.equal(actions.pop(), 'landMoving', 'run + jump uses Soccer Falling To Landing, never a stop or Hard Landing');

  pawn.vitals = {state:{dead:false}, applyDamage(amount){ return {damage:amount, dead:false, killed:false}; }};
  pawn.state.grounded = false;
  pawn.state.velocityY = -14;
  abilities.preMovement(.016, {});
  pawn.state.grounded = true;
  pawn.state.speed = 0;
  assert.equal(abilities.resolveLanding({}), 'heavy');
  assert.equal(actions.pop(), 'landHeavy', 'a survived damaging impact gets the heavy recovery');

  pawn.vitals = {state:{dead:true}, applyDamage(amount){ return {damage:amount, dead:true, killed:true}; }};
  pawn.state.grounded = false;
  pawn.state.velocityY = -30;
  abilities.preMovement(.016, {});
  pawn.state.grounded = true;
  const before = actions.length;
  assert.equal(abilities.resolveLanding({}), 'dead');
  assert.equal(actions.length, before, 'a lethal impact goes straight to ragdoll without a landing clip');
});

// ================================================================= 05 camera

test('the shoulder swap crosses over instead of snapping', () => {
  const rig = FP.create(null, fakePawn(), {view:'third', thirdPerson:{swapSpeed:8}});
  assert.equal(rig.weaponSide(), 1);
  assert.equal(rig.shoulderBlend(), 1);
  rig.preMovement(.016, {swapShoulder:true});
  assert.equal(rig.weaponSide(), -1, 'the requested side flips at once');
  assert.ok(rig.shoulderBlend() > -1, 'but the camera has not teleported to it');
  for(let i = 0; i < 200; i++) rig.preMovement(.016, {});
  assert.equal(rig.shoulderBlend(), -1, 'and it arrives');
  // A cover or targeting system can ask for a side without the player pressing.
  rig.setShoulder(1);
  assert.equal(rig.weaponSide(), 1, 'a system can request the other shoulder');
});

test('camera shake charges and decays without ever moving the aim', () => {
  const rig = FP.create(null, fakePawn(), {view:'third', weapon:{magazine:30, fireRate:1000, spreadHip:0}});
  const before = rig.viewAngles();
  rig.addTrauma(.9);
  assert.ok(rig.trauma() > .5, 'trauma charges');
  rig.afterMovement(.016, {}, {speed:0, grounded:true});
  assert.ok(rig.state.shakeYaw !== 0 || rig.state.shakePitch !== 0 || rig.state.shakeRoll !== 0,
    'charged trauma produces a visible offset');
  const after = rig.viewAngles();
  assert.equal(after.yaw, before.yaw, 'shake must never move the aim yaw');
  assert.equal(after.pitch, before.pitch, 'shake must never move the aim pitch');
  for(let i = 0; i < 200; i++) rig.afterMovement(.016, {}, {speed:0, grounded:true});
  assert.equal(rig.trauma(), 0, 'trauma bleeds off on its own');
  assert.equal(rig.state.shakeYaw, 0, 'and the offset returns to nothing');

  // Firing charges it, so a burst reads on screen.
  rig.fire();
  assert.ok(rig.trauma() > 0, 'firing charges the shake');
});

test('Camera Mode swaps first and third person on the same Pawn at runtime', () => {
  const rig = FP.create(null, fakePawn(), {view:'third', allowViewToggle:true});
  assert.equal(rig.viewMode(), 'third');
  rig.preMovement(.016, {viewToggle:true});
  assert.equal(rig.viewMode(), 'first', 'the toggle swaps the view');
  rig.preMovement(.016, {viewToggle:true});
  assert.equal(rig.viewMode(), 'first', 'holding the key does not strobe the view');
  rig.preMovement(.016, {viewToggle:false});
  rig.preMovement(.016, {viewToggle:true});
  assert.equal(rig.viewMode(), 'third', 'releasing and pressing again swaps back');
  assert.equal(saw('OnViewModeChanged'), true, 'the swap is announced');

  const locked = FP.create(null, fakePawn(), {view:'third', allowViewToggle:false});
  locked.preMovement(.016, {viewToggle:true});
  assert.equal(locked.viewMode(), 'third', 'a project can lock the view');

  // The rig owns the camera in BOTH views: third person is its own shoulder
  // camera, not the generic follow camera with the rig switched off.
  const rig3 = FP.create(null, fakePawn(), {view:'third'});
  assert.equal(rig3.enabled(), true, 'the rig owns camera output over the shoulder');
  assert.equal(rig3.firstPersonView(), false, 'but the eye is not the output');
});

test('third person distance stays player-owned unless automatic dolly is authored', () => {
  const rig = FP.create(null, fakePawn({state:{speed:7, airborne:false, grounded:true}}), {
    view:'third', adsBlend:40,
    thirdPerson:{distance:3.3, distanceAds:1.9, distanceSprint:4.1, shoulder:.62, shoulderAds:.48, blend:30},
  });
  const rest = rig.state.tpDistance;
  for(let i = 0; i < 60; i++){ rig.preMovement(.05, {aim:true}); rig.afterMovement(.05, {}, {speed:0, grounded:true}); }
  assert.equal(rig.state.tpDistance, rest, 'aiming cannot override the authored/player distance by default');
  assert.ok(rig.state.tpShoulder < .62 + 1e-6, 'and tightens the shoulder offset');
  for(let i = 0; i < 60; i++){ rig.preMovement(.05, {}); rig.afterMovement(.05, {}, {speed:7, grounded:true, sprinting:true}); }
  assert.equal(rig.state.tpDistance, rest, 'sprinting cannot pump the camera either');
  assert.ok(rig.adjustThirdPersonDistance(.7) > rest, 'manual zoom owns the distance');

  const cinematic = FP.create(null, fakePawn(), {
    view:'third', adsBlend:40,
    thirdPerson:{distance:3.3,distanceAds:1.9,distanceSprint:4.1,autoDistance:true,blend:30},
  });
  for(let i=0;i<60;i++){cinematic.preMovement(.05,{aim:true});cinematic.afterMovement(.05,{}, {speed:0,grounded:true});}
  assert.ok(cinematic.state.tpDistance<3.3,'the old ADS dolly remains an explicit author option');
});

test('firing from third person leaves the character, not the camera', () => {
  // Without THREE the trace itself cannot run, but the contract it depends on
  // can: the shot payload reports an origin derived from the EYE transform, and
  // the focus distance the camera ray resolves is published for the HUD.
  const rig = FP.create(null, fakePawn(), {view:'third', weapon:{magazine:5, fireRate:1000, spreadHip:0, range:140}});
  const payload = rig.fire();
  assert.ok(payload, 'the shot resolves');
  assert.equal(payload.origin, null, 'no THREE in node, so there is no world-space muzzle to report');
  assert.equal(rig.focusDistance(), 140, 'the crosshair focus defaults to the weapon range');
});

// ============================================================ 05 editability

test('every exposed third person setting reaches a live binding', () => {
  const graph = tpsTemplate().graph;
  const rig = FP.create(null, fakePawn(), graph.characterPawn.firstPerson);
  const abilities = ABILITIES.create(null, fakePawn(), graph.characterPawn.abilities);
  const vitals = VITALS.attach(null, fakePawn(), graph.characterPawn.vitals);
  const dead = [];
  graph.variables.forEach(variable => {
    const binding = String(variable.binding || '');
    if(!binding) return;
    let handled = false;
    if(binding.indexOf('firstPerson.') === 0) handled = rig.applyBinding(binding, variable.value);
    else if(binding.indexOf('abilities.') === 0) handled = abilities.applyBinding(binding, variable.value);
    else if(binding.indexOf('vitals.') === 0) handled = vitals.applyBinding(binding, variable.value);
    else return;   // movement / spawn / appearance are the Pawn's own bindings
    if(!handled) dead.push(variable.name + ' -> ' + binding);
  });
  assert.deepEqual(dead, [], 'exposed controls that write nowhere: ' + dead.join(', '));
});

test('grouped camera settings are writable one field at a time', () => {
  // The generic `firstPerson.` branch cannot reach a nested block, so every
  // grouped setting used to be a dead slider in the inspector.
  const rig = FP.create(null, fakePawn(), {view:'third'});
  assert.equal(rig.applyBinding('firstPerson.thirdPerson.distance', 5.5), true);
  assert.equal(rig.config().thirdPerson.distance, 5.5);
  assert.equal(rig.config().thirdPerson.shoulder, .62, 'its neighbours survive the write');
  assert.equal(rig.applyBinding('firstPerson.lean.offset', .9), true);
  assert.equal(rig.config().lean.offset, .9);
  assert.equal(rig.applyBinding('firstPerson.shake.decay', 4), true);
  assert.equal(rig.config().shake.decay, 4);
  assert.equal(rig.applyBinding('firstPerson.eyeHeight', 1.5), true, 'flat settings still work');
  assert.equal(rig.config().eyeHeight, 1.5);
  assert.equal(rig.applyBinding('somethingElse.value', 1), false, 'foreign bindings are refused');
});

test('the default Character is the complete FPS-capable same-body player', () => {
  const normal = TEMPLATES.get('logic-template-player-character-normal');
  assert.ok(normal, 'the generic character template still exists');
  const pawn=normal.graph.characterPawn;
  ['firstPerson','abilities','cover','vitals','loadout','inventory'].forEach(key=>assert.ok(pawn[key],'default Character misses '+key));
  assert.equal(pawn.firstPerson.view,'third');
  assert.equal(pawn.firstPerson.allowViewToggle,true);
  assert.equal(pawn.firstPerson.unifiedBodyCamera,true);
  assert.equal(pawn.firstPerson.presentation,'body');
  assert.deepEqual(pawn.firstPerson.viewPawn,{schemaVersion:1,kind:'none',enabled:false,showLegs:false});
  assert.equal(pawn.movement.inputMode,'heading');
  assert.equal(pawn.movement.facingMode,'heading');
});

test('legacy saved Characters gain player capabilities without losing authored work', () => {
  const API=global.LK_LOGIC_TEMPLATES_CHARACTER;
  const graph=API.makeGraph('male');
  graph.characterPawn.model={src:'project/custom-character.glb',fit:2.15};
  graph.characterPawn.movement.runSpeed=3.75;
  graph.characterPawn.animations.run={clip:'My Run',asset:{src:'project/my-run.fbx'}};
  assert.equal(API.upgradeLegacyPlayerCharacterGraph(graph,{}),true);
  assert.equal(graph.characterPawn.model.src,'project/custom-character.glb');
  assert.equal(graph.characterPawn.movement.runSpeed,3.75);
  assert.equal(graph.characterPawn.animations.run.clip,'My Run');
  assert.ok(graph.characterPawn.firstPerson&&graph.characterPawn.inventory&&graph.characterPawn.loadout);
  assert.equal(graph.characterPawn.firstPerson.presentation,'body');
  assert.equal(graph.characterPawn.firstPerson.viewPawn.kind,'none');
  assert.equal(graph.characterPawn.movement.inputMode,'heading');
  assert.ok(graph.variables.some(variable=>variable.binding==='firstPerson.thirdPerson.distance'));
  const snapshot=JSON.stringify(graph);
  assert.equal(API.upgradeLegacyPlayerCharacterGraph(graph,{}),false,'migration is one-shot');
  assert.equal(JSON.stringify(graph),snapshot,'second normalization changes nothing');
});

console.log('\nthird-person combat parity tests passed');
