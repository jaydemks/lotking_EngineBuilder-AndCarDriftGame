'use strict';

// Covers the four gameplay systems added on top of the character Pawn:
// traversal abilities, vitals, world items / inventory and interactions.
// All four are DOM-free apart from event dispatch, so they run headless.

const assert = require('node:assert/strict');

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

require('../js/runtime/character-movement.js');
require('../js/runtime/first-person-controller.js');
require('../js/runtime/character-abilities.js');
require('../js/runtime/character-vitals.js');
require('../js/runtime/item-system.js');
require('../js/runtime/interaction-system.js');
require('../js/runtime/character-audio.js');
require('../js/runtime/input/input-actions.js');

const ABILITIES = global.LK_RUNTIME_CHARACTER_ABILITIES;
const VITALS = global.LK_RUNTIME_CHARACTER_VITALS;
const ITEMS = global.LK_RUNTIME_ITEMS;
const INTERACT = global.LK_RUNTIME_INTERACTIONS;
const FP = global.LK_RUNTIME_FIRST_PERSON;
const AUDIO = global.LK_RUNTIME_CHARACTER_AUDIO;

function test(name, run){
  events.length = 0;
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
function saw(type){ return events.some(detail => detail && detail.type === type); }

// A box collider in the shape the arcade world uses, so the probes under test
// see exactly what the movement controller resolves against.
function boxCollider(x, y, z, hx, hy, hz, extra){
  return Object.assign({x, y, z, hx, hy, hz, enabled:true}, extra || {});
}

function fakeGame(boxes){
  return {
    world:{colliders:{box:boxes || [], circle:[]}, registry:[], characterGroundHeight:() => 0},
    core:{scene:null},
    state:{},
    systems:{},
    pawns:{get:() => null},
  };
}

function fakePawn(GAME, overrides){
  const owner = {position:{x:0, y:0, z:0}, rotation:{x:0, y:0, z:0}, userData:{}, traverse(){}, updateMatrixWorld(){}, getWorldPosition(){}};
  const pawn = Object.assign({
    id:'pawn-test',
    possessed:true,
    enabled:true,
    hidden:false,
    owner,
    state:{speed:0, grounded:true, airborne:false},
    config:{animations:{}, movement:{}},
    movementController:global.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME, {}),
    playAction(){ return true; },
    reset(){ return true; },
    dispose(){ return true; },
  }, overrides || {});
  return pawn;
}

// ------------------------------------------------ abilities

test('ability config clamps every move and can be turned off wholesale', () => {
  const config = ABILITIES.normalizeConfig({enabled:false, crouch:{speedScale:9}, vault:{maxHeight:-3}, climb:{speed:99}});
  assert.equal(config.enabled, false);
  assert.equal(config.crouch.speedScale, 1, 'crouch speed cannot exceed standing');
  assert.equal(config.vault.maxHeight, .2, 'vault height clamps to the low bound');
  assert.equal(config.climb.speed, 10, 'climb speed clamps to the ceiling');
});

test('crouch lowers the body and the eye, and standing up restores both exactly', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  pawn.movementController.configure({height:1.8});
  const rig = FP.create(GAME, pawn, {});
  pawn.firstPerson = rig;
  const abilities = ABILITIES.create(GAME, pawn, {crouch:{blend:1000}});

  // Crouch TOGGLES: one press goes down and stays down while you walk and shoot,
  // a second press stands back up. Holding the key is not part of it.
  abilities.preMovement(.05, {crouch:true});
  for(let i = 0; i < 30; i++) abilities.preMovement(.05, {crouch:false});
  assert.equal(abilities.mode(), 'crouch', 'it stays down after the key is released');
  assert.ok(pawn.movementController.options().height < 1.1, 'the collision body shrinks while crouched');
  assert.ok(rig.state.eyeOffset < -.5, 'the eye follows the body down');
  assert.ok(abilities.movementScale({}) < .5, 'crouching is slower than standing');

  abilities.preMovement(.05, {crouch:true});
  for(let i = 0; i < 30; i++) abilities.preMovement(.05, {crouch:false});
  assert.equal(abilities.mode(), 'none');
  assert.equal(Math.round(pawn.movementController.options().height * 1000) / 1000, 1.8, 'standing height returns exactly');
  assert.equal(Math.abs(rig.state.eyeOffset), 0, 'the eye returns to the configured height');
});

test('sprinting stands the character up instead of refusing to run', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const abilities = ABILITIES.create(GAME, pawn, {crouch:{blend:1000}});
  abilities.preMovement(.05, {crouch:true});
  assert.equal(abilities.mode(), 'crouch');
  abilities.preMovement(.05, {sprint:true});
  assert.equal(abilities.mode(), 'none', 'asking for Crouch again before you can run is a step with only one answer');
});

test('leaning moves the eye sideways and rolls the view, and both keys cancel', () => {
  const GAME = fakeGame();
  const rig = FP.create(GAME, fakePawn(GAME), {});
  for(let i = 0; i < 40; i++) rig.preMovement(.05, {leanRight:true});
  assert.ok(rig.leanAmount() > .9, 'the lean settles fully to the right');
  for(let i = 0; i < 40; i++) rig.preMovement(.05, {leanLeft:true, leanRight:true});
  assert.ok(Math.abs(rig.leanAmount()) < .05, 'both at once is upright, not a priority rule');
  for(let i = 0; i < 40; i++) rig.preMovement(.05, {leanLeft:true});
  assert.ok(rig.leanAmount() < -.9);
});

test('standing up is refused while there is something overhead', () => {
  // A deck 1.2 m up: too low to stand under, high enough to crouch under.
  const GAME = fakeGame([boxCollider(0, 1.5, 0, 3, .3, 3)]);
  const pawn = fakePawn(GAME);
  pawn.movementController.configure({height:1.8, radius:.35});
  const abilities = ABILITIES.create(GAME, pawn, {crouch:{blend:1000}});
  for(let i = 0; i < 20; i++) abilities.preMovement(.05, {crouch:false});
  assert.equal(abilities.mode(), 'crouch', 'the character stays down until the ceiling clears');
  abilities.preMovement(.05, {sprint:true});
  assert.equal(abilities.mode(), 'crouch', 'and sprinting cannot force it through the ceiling either');
});

test('slow walk is a speed scale, not a separate gait', () => {
  const GAME = fakeGame();
  const abilities = ABILITIES.create(GAME, fakePawn(GAME), {});
  assert.equal(abilities.movementScale({}), 1);
  assert.ok(abilities.movementScale({slowWalk:true}) < .5, 'walking is much slower than running');
});

test('a low obstacle with clear floor beyond it is a vault, a tall one is a mantle', () => {
  const GAME = fakeGame([
    boxCollider(0, .45, 1.2, 2, .45, .3),        // 0.9 m wall, nothing behind it
  ]);
  const pawn = fakePawn(GAME);
  pawn.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
  const abilities = ABILITIES.create(GAME, pawn, {});
  const vault = abilities.probeLedge();
  assert.ok(vault, 'the wall in front is detected');
  assert.equal(vault.kind, 'vault');

  const tall = fakeGame([boxCollider(0, .9, 1.6, 2, .9, 2)]);   // 1.8 m block with a top
  const pawn2 = fakePawn(tall);
  pawn2.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
  const abilities2 = ABILITIES.create(tall, pawn2, {});
  const mantle = abilities2.probeLedge();
  assert.ok(mantle, 'the block in front is detected');
  assert.equal(mantle.kind, 'mantle');
});

test('a traversal owns the frame and lands the character on the far side', () => {
  const GAME = fakeGame([boxCollider(0, .45, 1.2, 2, .45, .3)]);
  const pawn = fakePawn(GAME);
  pawn.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
  pawn.state.speed = 4;
  const abilities = ABILITIES.create(GAME, pawn, {});
  assert.equal(abilities.preMovement(.016, {jump:true}), true, 'movement is suppressed while vaulting');
  assert.ok(saw('OnCharacterVault'));
  let guard = 0;
  while(abilities.isBusy() && guard++ < 500) abilities.preMovement(.016, {});
  assert.ok(guard < 500, 'the traversal terminates');
  assert.ok(pawn.owner.position.z > 1.5, 'the character ends up past the obstacle');
  assert.equal(abilities.mode(), 'none');
});

test('climbing rides a surface to its top and steps off', () => {
  const wall = boxCollider(0, 2.5, 1, 2, 2.5, .3, {climbable:true});
  const GAME = fakeGame([wall]);
  const pawn = fakePawn(GAME);
  pawn.movementController.configure({height:1.8, radius:.35});
  const abilities = ABILITIES.create(GAME, pawn, {});
  assert.equal(abilities.preMovement(.016, {jump:true}), true, 'grabbing the wall takes the frame');
  assert.equal(abilities.mode(), 'climb');
  assert.ok(saw('OnCharacterClimbStarted'));
  let guard = 0;
  while(abilities.mode() === 'climb' && guard++ < 2000) abilities.preMovement(.016, {z:1});
  assert.ok(guard < 2000, 'the climb terminates at the top');
  assert.ok(pawn.owner.position.y >= 5 - .01, 'the character ends up on top of the wall');
});

test('a ledge too high to mantle is caught in mid-air and can be shuffled along', () => {
  // A 2.9 m wall: the top is far above the feet, so it is a hang, not a mantle.
  const wall = boxCollider(0, 1.45, 1.4, 5, 1.45, .7);
  const deck = boxCollider(0, 2.95, 3, 5, .15, 1.6);
  const GAME = fakeGame([wall, deck]);
  const pawn = fakePawn(GAME);
  pawn.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
  const abilities = ABILITIES.create(GAME, pawn, {});

  assert.equal(abilities.probeLedge(), null, 'the wall is out of mantling range from the ground');
  // The catch happens at the top of a jump, so the probe runs from the apex.
  pawn.owner.position.y = 1.05;
  const ledge = abilities.probeHangLedge(0, 0);
  assert.ok(ledge, 'the top edge is within arm reach');
  assert.ok(Math.abs(ledge.top - 2.9) < .01);

  // Falling past the edge catches it automatically.
  pawn.state.grounded = false;
  pawn.state.velocityY = -2;
  assert.equal(abilities.preMovement(.016, {}), true, 'the grab takes the frame');
  assert.equal(abilities.mode(), 'hang');
  assert.ok(saw('OnCharacterLedgeGrabbed'));
  assert.ok(Math.abs(pawn.owner.position.y - (2.9 - 1.85)) < .01, 'the body hangs below the edge');

  const before = pawn.owner.position.x;
  for(let i = 0; i < 20; i++) abilities.preMovement(.05, {x:1});
  assert.ok(Math.abs(pawn.owner.position.x - before) > .3, 'A/D shuffles along the ledge');
  assert.equal(abilities.mode(), 'hang', 'shuffling does not let go');
});

test('shuffling stops at the end of a ledge instead of walking off it', () => {
  const wall = boxCollider(0, 1.45, 1.4, 1.2, 1.45, .7);   // a short ledge
  const deck = boxCollider(0, 2.95, 3, 1.2, .15, 1.6);
  const GAME = fakeGame([wall, deck]);
  const pawn = fakePawn(GAME);
  pawn.movementController.configure({height:1.8, radius:.35});
  const abilities = ABILITIES.create(GAME, pawn, {});
  pawn.owner.position.y = 1.05;
  pawn.state.grounded = false;
  pawn.state.velocityY = -2;
  abilities.preMovement(.016, {});
  assert.equal(abilities.mode(), 'hang');
  for(let i = 0; i < 200; i++) abilities.preMovement(.05, {x:1});
  assert.ok(Math.abs(pawn.owner.position.x) <= 1.4, 'the shuffle is bounded by the ledge itself');
});

test('a hang is released downward and pulled up onto the ledge', () => {
  const build = () => {
    const GAME = fakeGame([boxCollider(0, 1.45, 1.4, 5, 1.45, .7), boxCollider(0, 2.95, 3, 5, .15, 1.6)]);
    const pawn = fakePawn(GAME);
    pawn.movementController.configure({height:1.8, radius:.35});
    const abilities = ABILITIES.create(GAME, pawn, {});
    pawn.owner.position.y = 1.05;
    pawn.state.grounded = false;
    pawn.state.velocityY = -2;
    abilities.preMovement(.016, {});
    return {pawn, abilities};
  };

  const dropped = build();
  dropped.abilities.preMovement(.016, {crouch:true});
  assert.equal(dropped.abilities.mode(), 'none', 'Crouch lets go');

  const climbed = build();
  climbed.abilities.preMovement(.016, {jump:true});
  assert.equal(climbed.abilities.mode(), 'mantle', 'Jump converts the hang into a pull-up');
  let guard = 0;
  while(climbed.abilities.isBusy() && guard++ < 500) climbed.abilities.preMovement(.016, {});
  assert.ok(climbed.pawn.owner.position.y >= 2.85, 'the character ends up standing on the ledge');
});

test('the Use key climbs when there is nothing to use', () => {
  // A 1.8 m block: a mantle, not a hang, and nothing interactive anywhere.
  const GAME = fakeGame([boxCollider(0, .9, 1.6, 2, .9, 2)]);
  const pawn = fakePawn(GAME);
  pawn.movementController.configure({height:1.8, stepHeight:.55, radius:.35});
  const abilities = ABILITIES.create(GAME, pawn, {});
  assert.equal(abilities.tryTraversal(), true, 'Use finds the ledge');
  assert.equal(abilities.mode(), 'mantle');

  const empty = fakeGame();
  const bare = ABILITIES.create(empty, fakePawn(empty), {});
  assert.equal(bare.tryTraversal(), false, 'nothing in front means the caller can try another verb');
});

test('a tracer is weapon data derived from the calibre, and never changes the hit', () => {
  const light = FP.normalizeWeapon({preset:'smg'}).tracer;
  const heavy = FP.normalizeWeapon({preset:'marksman'}).tracer;
  assert.ok(heavy.length > light.length, 'a heavier round leaves a longer streak');
  assert.ok(heavy.width > light.width, 'and a thicker one');
  const authored = FP.normalizeTracer({speed:9999, everyNth:0, width:-1}, 24);
  assert.equal(authored.speed, 2000, 'speed clamps');
  assert.equal(authored.everyNth, 1, 'every round at minimum');
  assert.equal(authored.width, .001, 'width clamps to a visible minimum');
  assert.equal(FP.normalizeTracer({enabled:false}, 24).enabled, false);
});

test('the shoulder swap mirrors the weapon without moving the aim', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rig = FP.create(GAME, pawn, {});
  assert.equal(rig.weaponSide(), 1, 'right shoulder by default');
  const before = rig.viewAngles();
  rig.preMovement(.016, {swapShoulder:true});
  assert.equal(rig.weaponSide(), -1);
  rig.preMovement(.016, {swapShoulder:true});
  assert.equal(rig.weaponSide(), -1, 'holding the key does not strobe');
  rig.preMovement(.016, {swapShoulder:false});
  rig.preMovement(.016, {swapShoulder:true});
  assert.equal(rig.weaponSide(), 1);
  const after = rig.viewAngles();
  assert.equal(after.yaw, before.yaw, 'the aim is untouched');
  assert.equal(after.pitch, before.pitch);
});

test('aim angles carry the recoil the view angles leave out', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rig = FP.create(GAME, pawn, {weapon:{preset:'rifle'}});
  rig.fire();
  assert.ok(rig.state.recoilPitch > 0, 'the shot kicked');
  assert.equal(rig.viewAngles().pitch, 0, 'view angles are the player intent');
  assert.ok(rig.aimAngles().pitch > 0, 'aim angles are where the barrel actually points');
});

test('a tracer carries its bullet-hole settings and they are bounded', () => {
  const tracer = FP.normalizeTracer({decalSeconds:1e6}, 24);
  assert.equal(tracer.decal, true, 'holes are on by default');
  assert.equal(tracer.decalSeconds, 120, 'how long a hole lives is capped');
  assert.equal(FP.normalizeTracer({decal:false}, 24).decal, false);
});

test('sprinting lowers the weapon until the trigger is pulled', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rig = FP.create(GAME, pawn, {weapon:{preset:'rifle'}});
  rig.afterMovement(.1, {}, {speed:6, grounded:true, sprinting:true});
  assert.equal(rig.state.sprintPose, true, 'a sprint with no shooting carries the weapon low');
  rig.fire();
  rig.afterMovement(.1, {}, {speed:6, grounded:true, sprinting:true});
  assert.equal(rig.state.sprintPose, false, 'firing brings it back up mid-sprint');
  for(let i = 0; i < 20; i++) rig.afterMovement(.1, {}, {speed:6, grounded:true, sprinting:true});
  assert.equal(rig.state.sprintPose, true, 'and it drops again once the shooting stops');
});

test('the weapon socket is authorable one component at a time', () => {
  const GAME = fakeGame();
  const rig = FP.create(GAME, fakePawn(GAME), {});
  rig.applyBinding('firstPerson.weaponSocket.offsetY', .18);
  rig.applyBinding('firstPerson.weaponSocket.bone', 'mixamorig:RightHand');
  rig.applyBinding('firstPerson.weaponSocket.scale', 1.4);
  const socket = rig.config().weaponSocket;
  assert.deepEqual(socket.offset, [0, .18, 0], 'one axis moves without rebuilding the triple');
  assert.equal(socket.bone, 'mixamorig:RightHand');
  assert.equal(socket.scale, 1.4);
});

test('Ctrl can never be bound, however a project was saved', () => {
  const api = global.LK_RUNTIME_INPUT_ACTIONS;
  // A project saved before the rule existed still carries the old binding.
  const restored = api.normalizeConfig({
    version:9,
    contexts:{character:{schemes:{keyboard:{crouch:['ControlLeft', 'ControlRight'], jump:['Space']}}}},
  });
  assert.deepEqual(restored.contexts.character.schemes.keyboard.crouch, [],
    'Ctrl is stripped on load: the page never sees Ctrl+W, so a binding there loses the session');
  // And rebinding cannot put it back.
  const config = api.defaultConfig();
  api.setBinding(config, 'character', 'keyboard-1', 'crouch', ['ControlLeft', 'KeyZ']);
  assert.deepEqual(config.contexts.character.schemes.keyboard.crouch, ['KeyZ']);
  // Alt survives: it can be cancelled, and the dodge gesture uses it.
  assert.deepEqual(api.stripUnsafe(['AltLeft', 'KeyX']), ['AltLeft', 'KeyX']);
});

test('a target absorbs shots while it stands and only falls once it is down', () => {
  const GAME = fakeGame();
  const items = ITEMS.create(GAME);
  const board = {name:'Target', visible:true, parent:{}, position:{x:0, y:1, z:0}, rotation:{x:0, y:0, z:0},
    userData:{damageable:{health:100, maxHealth:100}}};
  GAME.world.registry.push(board);
  const shoot = killed => global.dispatchEvent(new global.CustomEvent('lk-pawn-event', {detail:{
    type:'OnWeaponHit', object:board, origin:{x:0, y:1, z:-5}, point:{x:0, y:1, z:0},
    damage:40, killed, holder:board,
  }}));

  shoot(false);
  const before = board.position.z;
  for(let i = 0; i < 10; i++) items.update(.016);
  assert.equal(board.position.z, before, 'a standing target is not shoved around the range');

  shoot(true);
  for(let i = 0; i < 10; i++) items.update(.016);
  assert.ok(board.position.z !== before, 'a killing shot knocks it over');
});

test('the seven roles fill from the first empty one, not by displacement', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  pawn.firstPerson = FP.create(GAME, pawn, {});
  const inventory = ITEMS.createInventory(pawn, {mode:'slots', weaponSlots:7});
  const slotOf = name => inventory.slots().find(entry => entry.weapon.name === name);

  inventory.add({preset:'fists'});
  inventory.add({preset:'pistol'});
  inventory.add({preset:'rifle'});
  inventory.add({preset:'knife'});
  inventory.add({preset:'grenade'});
  assert.equal(inventory.count(), 5);
  assert.equal(slotOf('Fists').weapon.assignedSlot, 'unarmed');
  assert.equal(slotOf('Sidearm').weapon.assignedSlot, 'primary');
  assert.equal(slotOf('Assault Rifle').weapon.assignedSlot, 'secondary');
  assert.equal(slotOf('Combat Knife').weapon.assignedSlot, 'melee');
  assert.equal(slotOf('Frag Grenade').weapon.assignedSlot, 'grenade');

  // A second heavy weapon takes the bonus role rather than throwing the first away.
  inventory.add({preset:'shotgun'});
  assert.equal(inventory.count(), 6);
  assert.equal(slotOf('Shotgun').weapon.assignedSlot, 'tertiary');
  assert.ok(slotOf('Assault Rifle'), 'the rifle is still carried');

  // Selecting by role is stable whatever order things arrived in.
  assert.equal(inventory.equipSlotIndex(3), true, 'slot 4 is the melee role');
  assert.equal(pawn.firstPerson.weapon().name, 'Combat Knife');
  assert.equal(inventory.equipSlotIndex(0), true);
  assert.equal(pawn.firstPerson.weapon().kind, 'unarmed');
});

test('fists and blades never run dry; a thrown weapon spends its reserve', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rig = FP.create(GAME, pawn, {weapon:{preset:'fists'}});
  assert.equal(rig.weapon().infiniteAmmo, true, 'an author cannot make fists run out');
  for(let i = 0; i < 5; i++){ rig.fire(); rig.preMovement(1, {}); }
  assert.equal(rig.ammo().reloading, false, 'and they never reload');

  // A thrown weapon is a different KIND, which is the one field that changes
  // what the trigger does. The throw itself needs a camera transform, so this
  // asserts the decision rather than the flight — the flight is a browser test.
  const grenade = FP.normalizeWeapon({preset:'grenade'});
  assert.equal(grenade.kind, 'thrown');
  assert.equal(grenade.infiniteAmmo, false, 'grenades run out');
  assert.ok(grenade.throwSpeed > 0, 'and leave the hand at a real speed');
  assert.equal(FP.normalizeWeapon({preset:'knife'}).kind, 'melee');
  assert.equal(FP.normalizeWeapon({preset:'knife'}).infiniteAmmo, true);
  assert.ok(FP.normalizeWeapon({preset:'knife'}).range < 4, 'melee reaches arm length, not across the map');
});

// ------------------------------------------------ telescopic sight

test('only a weapon that declares a scope can be scoped, and only through the eye', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rifle = FP.create(GAME, pawn, {weapon:{preset:'rifle'}});
  rifle.state.ads = 1;
  assert.equal(rifle.isScoped(), false, 'iron sights are not a scope');

  const marksman = FP.create(GAME, fakePawn(GAME), {weapon:{preset:'marksman'}});
  marksman.state.ads = 1;
  assert.equal(marksman.isScoped(), true);
  marksman.setViewMode('third');
  assert.equal(marksman.isScoped(), false, 'there is no eye behind the weapon in third person');
});

test('magnification cycles within the weapon list and drives the field of view', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rig = FP.create(GAME, pawn, {weapon:{preset:'marksman'}});
  assert.deepEqual(rig.scope().magnifications, [4, 8, 12]);
  assert.equal(rig.magnification(), 4);
  rig.cycleZoom(1);
  assert.equal(rig.magnification(), 8);
  rig.cycleZoom(1); rig.cycleZoom(1);
  assert.equal(rig.magnification(), 12, 'zoom clamps at the strongest setting');
  rig.cycleZoom(-1);
  assert.equal(rig.magnification(), 8);

  // Aiming settles the field of view onto baseFov / magnification.
  rig.state.ads = 1;
  rig.state.adsHeld = true;
  for(let i = 0; i < 200; i++) rig.afterMovement(.016, {}, {speed:0, grounded:true});
  assert.ok(Math.abs(rig.state.fov - 70 / 8) < .5, 'an 8x scope shows roughly 8.75 degrees');
});

test('equipping a different weapon resets the sight', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rig = FP.create(GAME, pawn, {weapon:{preset:'marksman'}});
  rig.cycleZoom(1);
  assert.equal(rig.magnification(), 8);
  rig.equipWeapon({preset:'shotgun'});
  assert.equal(rig.scope().enabled, false);
  rig.state.ads = 1;
  assert.equal(rig.isScoped(), false, 'a shotgun cannot be scoped');
});

test('the dodge gesture picks slide or roll from the speed it is used at', () => {
  const GAME = fakeGame();
  const fast = fakePawn(GAME);
  fast.state.speed = 6;
  const a = ABILITIES.create(GAME, fast, {});
  a.preMovement(.016, {dodge:true});          // first tap arms the gesture
  a.preMovement(.016, {dodge:false});
  a.preMovement(.016, {dodge:true});          // second tap inside the window
  assert.equal(a.mode(), 'slide', 'running turns the dodge into a slide');

  const slow = fakePawn(GAME);
  slow.state.speed = 1.4;
  const b = ABILITIES.create(GAME, slow, {});
  b.preMovement(.016, {dodge:true});
  b.preMovement(.016, {dodge:false});
  b.preMovement(.016, {dodge:true});
  assert.equal(b.mode(), 'roll', 'walking turns the same gesture into a roll');
});

test('a single dodge tap does nothing, and the roll ends standing', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  pawn.state.speed = 1.2;
  const abilities = ABILITIES.create(GAME, pawn, {});
  abilities.preMovement(.016, {dodge:true});
  for(let i = 0; i < 40; i++) abilities.preMovement(.016, {dodge:false});
  assert.equal(abilities.mode(), 'none', 'one tap is not a gesture');

  abilities.preMovement(.016, {dodge:true});
  abilities.preMovement(.016, {dodge:false});
  abilities.preMovement(.016, {dodge:true});
  assert.equal(abilities.mode(), 'roll');
  let guard = 0;
  while(abilities.mode() === 'roll' && guard++ < 500) abilities.preMovement(.016, {});
  assert.ok(guard < 500, 'the roll terminates');
  assert.equal(pawn.owner.rotation.x, 0, 'the tumble is undone, not left on the body');
  assert.ok(pawn.owner.position.z > .5, 'it carried the character forward');
});

test('a Pawn can name its own sound set and falls back to the level one', () => {
  const stored = {id:'guard', name:'Guard', footsteps:{volume:1.4}};
  const audio = AUDIO.create({lookupSet:id => (id === 'guard' ? stored : null)});
  const level = audio.get();
  const plain = {id:'a', config:{}};
  const guard = {id:'b', config:{soundSet:'guard'}};
  assert.equal(audio.setFor(plain), level, 'no set named means the level default');
  assert.equal(audio.setFor(guard).footsteps.volume, 1.4, 'a named set resolves through the host lookup');
  assert.equal(audio.setFor({id:'c', config:{soundSet:'missing'}}), level, 'an unknown id degrades to the default');
});

// ------------------------------------------------ vitals

test('armour absorbs its share before health is touched', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const vitals = VITALS.create(GAME, pawn, {maxHealth:100, armor:100, armorAbsorb:.5});
  vitals.applyDamage(40, {source:'test'});
  assert.equal(vitals.state.armor, 80, 'armour takes half of the 40');
  assert.equal(vitals.state.health, 80, 'health takes the other half');
  assert.ok(saw('OnCharacterDamaged'));
});

test('health regenerates only after the delay and never past the maximum', () => {
  const GAME = fakeGame();
  const vitals = VITALS.create(GAME, fakePawn(GAME), {maxHealth:100, regen:50, regenDelay:1});
  vitals.applyDamage(60);
  vitals.step(.5, {});
  assert.equal(vitals.state.health, 40, 'nothing regenerates inside the delay');
  for(let i = 0; i < 40; i++) vitals.step(.1, {});
  assert.equal(vitals.state.health, 100, 'regeneration stops at full health');
});

test('reaching zero health kills once and respawns after the delay', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const vitals = VITALS.create(GAME, pawn, {maxHealth:50, respawnDelay:1});
  vitals.applyDamage(80);
  assert.equal(vitals.state.dead, true);
  assert.equal(vitals.state.health, 0);
  assert.equal(events.filter(detail => detail.type === 'OnCharacterDied').length, 1);
  vitals.applyDamage(20);
  assert.equal(events.filter(detail => detail.type === 'OnCharacterDied').length, 1, 'a corpse cannot die twice');
  // The vitals clock clamps dt to 100 ms, so a second of game time is ten steps.
  for(let i = 0; i < 12; i++) vitals.step(.1, {});
  assert.equal(vitals.state.dead, false);
  assert.equal(vitals.state.health, 50);
});

test('the Pawn owner mirrors the damageable contract, so the hitscan can hurt it', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const vitals = VITALS.create(GAME, pawn, {maxHealth:120});
  const record = pawn.owner.userData.damageable;
  assert.ok(record, 'the owner is shootable');
  assert.equal(record.maxHealth, 120);
  // A hitscan writes health straight onto the record; the next step pulls it in.
  FP.applyDamage(pawn.owner, 30);
  vitals.step(.016, {});
  assert.equal(vitals.state.health, 90, 'external damage lands in the Pawn vitals');
});

// ------------------------------------------------ items and inventory

test('item descriptors normalize kind, amount and respawn', () => {
  const item = ITEMS.normalizeItem({kind:'nonsense', amount:-5, respawn:9999});
  assert.equal(item.kind, 'custom', 'an unknown kind falls back to custom');
  assert.equal(item.amount, 0);
  assert.equal(item.respawn, 600, 'respawn clamps to ten minutes');
  assert.equal(ITEMS.normalizeItem({kind:'health'}).name, 'Medkit');
});

test('the inventory parks ammo per weapon and restores it on swap', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  pawn.firstPerson = FP.create(GAME, pawn, {});
  const inventory = ITEMS.createInventory(pawn, {capacity:3});
  assert.equal(inventory.add({preset:'rifle'}), 'weapon');
  pawn.firstPerson.fire();
  pawn.firstPerson.fire();
  const spent = pawn.firstPerson.ammo().ammo;
  assert.equal(inventory.add({preset:'shotgun'}), 'weapon');
  assert.equal(pawn.firstPerson.ammo().magazine, 8, 'the shotgun is now in hand');
  // Two heavy weapons occupy two different roles, so both are still carried.
  assert.equal(inventory.count(), 2);
  inventory.cycle(1);
  assert.equal(pawn.firstPerson.ammo().ammo, spent, 'the rifle comes back with the magazine it had');
});

test('a full loadout swaps rather than refusing a pickup, and picking up a duplicate is ammo', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  pawn.firstPerson = FP.create(GAME, pawn, {});
  const inventory = ITEMS.createInventory(pawn, {capacity:2});
  inventory.add({preset:'rifle'});
  inventory.add({preset:'shotgun'});
  assert.equal(inventory.count(), 2);
  inventory.add({preset:'marksman'});
  assert.equal(inventory.count(), 2, 'the loadout stays at capacity');
  assert.equal(inventory.add({preset:'marksman'}), 'ammo', 'a duplicate weapon tops up its reserve');
});

test('dropping the last weapon leaves the character unarmed and unable to fire', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  pawn.firstPerson = FP.create(GAME, pawn, {});
  const inventory = ITEMS.createInventory(pawn, {});
  inventory.add({preset:'rifle'});
  assert.equal(pawn.firstPerson.armed(), true);
  const dropped = inventory.drop(true);
  assert.ok(dropped && dropped.weapon.preset === 'rifle', 'the definition comes back for the world pickup');
  assert.equal(pawn.firstPerson.armed(), false);
  assert.equal(pawn.firstPerson.fire(), null, 'an unarmed character cannot shoot');
});

test('ammo pickups top up the reserve and refuse when it is already full', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rig = FP.create(GAME, pawn, {weapon:{preset:'rifle'}});
  assert.equal(rig.addReserve(50), 0, 'a full reserve takes nothing');
  rig.state.reserve = 10;
  assert.equal(rig.addReserve(50), 50);
  assert.equal(rig.addReserve(1000), rig.config().weapon.ammoReserve - 60, 'the reserve stops at its ceiling');
});

test('the inventory mode changes what a pickup DOES, not just how many fit', () => {
  const GAME = fakeGame();

  // 'none': one weapon, and a pickup replaces what is in hand.
  const arena = fakePawn(GAME);
  arena.firstPerson = FP.create(GAME, arena, {});
  const none = ITEMS.createInventory(arena, {mode:'none', weaponSlots:5});
  assert.equal(none.capacity(), 1, 'a no-inventory game holds exactly one weapon');
  none.add({preset:'rifle'});
  none.add({preset:'shotgun'});
  assert.equal(none.count(), 1);
  assert.equal(arena.firstPerson.weapon().preset, 'shotgun', 'the new weapon replaces the old one');

  // 'backpack': consumables are stored instead of spent where they lie.
  const survivor = fakePawn(GAME);
  survivor.firstPerson = FP.create(GAME, survivor, {});
  survivor.vitals = VITALS.create(GAME, survivor, {maxHealth:100});
  survivor.vitals.applyDamage(60);
  survivor.inventory = ITEMS.createInventory(survivor, {mode:'backpack', packSize:4});
  const items = ITEMS.create(GAME);
  const medkit = {name:'Medkit', visible:true, position:{x:0, y:0, z:0}, userData:{item:{kind:'health', amount:30}}};
  GAME.world.registry.push(medkit);
  items.pickup(survivor);
  assert.equal(survivor.vitals.state.health, 40, 'the medkit is not spent on the floor');
  assert.equal(survivor.inventory.pack().length, 1, 'it goes into the pack');
  survivor.inventory.useFromPack(0);
  assert.equal(survivor.vitals.state.health, 70, 'and heals when it is finally used');
  assert.equal(survivor.inventory.pack().length, 0);
});

test('dropping is a project setting, not an assumption', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  pawn.firstPerson = FP.create(GAME, pawn, {});
  const locked = ITEMS.createInventory(pawn, {mode:'slots', allowDrop:false});
  locked.add({preset:'rifle'});
  assert.equal(locked.drop(true), null, 'a game that forbids dropping keeps the weapon');
  assert.equal(locked.count(), 1);
});

test('every item is carryable with the Use key unless it opts out', () => {
  const GAME = fakeGame();
  const items = ITEMS.create(GAME);
  const crate = {name:'Ammo Crate', visible:true, position:{x:0, y:0, z:0}, userData:{item:{kind:'ammo', amount:60}}};
  const fixed = {name:'Trophy', visible:true, position:{x:2, y:0, z:0}, userData:{item:{kind:'health', carryable:false}}};
  GAME.world.registry.push(crate, fixed);
  items.items();
  assert.ok(crate.userData.interact, 'an ordinary pickup can also be lifted and moved');
  assert.equal(crate.userData.interact.type, 'carry');
  assert.equal(fixed.userData.interact, undefined, 'carryable:false leaves it pick-up-only');
});

test('mass decides whether a dropped item bounces or lands', () => {
  const light = ITEMS.normalizeItem({kind:'ammo', mass:.4});
  const heavy = ITEMS.normalizeItem({kind:'weapon', mass:40});
  assert.ok(light.mass < heavy.mass);
  assert.equal(ITEMS.normalizeItem({kind:'health', mass:1e9}).mass, 500, 'mass clamps');
  assert.equal(ITEMS.normalizeItem({kind:'health', bounce:.9}).bounce, .9, 'an author can override the derived bounce');
  assert.equal(ITEMS.normalizeItem({kind:'health'}).bounce, null, 'and null means "derive it from mass"');
});

test('an impulse wakes a resting item and scales with its mass', () => {
  const GAME = fakeGame();
  const items = ITEMS.create(GAME);
  // A body whose object has left the scene stops simulating, so the fixtures
  // need a parent the way a real scene object has one.
  const can = {name:'Can', visible:true, parent:{}, position:{x:0, y:1, z:0}, rotation:{x:0, y:0, z:0},
    userData:{item:ITEMS.normalizeItem({kind:'ammo', mass:.5})}};
  const crate = {name:'Crate', visible:true, parent:{}, position:{x:0, y:1, z:0}, rotation:{x:0, y:0, z:0},
    userData:{item:ITEMS.normalizeItem({kind:'ammo', mass:50})}};
  assert.equal(items.impulse(can, {x:0, y:0, z:1}, 10), true);
  assert.equal(items.impulse(crate, {x:0, y:0, z:1}, 10), true);
  const before = {can:can.position.z, crate:crate.position.z};
  for(let i = 0; i < 10; i++) items.update(.016);
  const movedCan = can.position.z - before.can;
  const movedCrate = crate.position.z - before.crate;
  assert.ok(movedCan > movedCrate * 5, 'the same shot barely moves a heavy crate');
  assert.equal(items.impulse({userData:{}}, {x:0, y:1, z:0}, 5), false, 'a non-item ignores it');
});

// ------------------------------------------------ interactions

test('interaction descriptors normalize type, range and door mode', () => {
  const door = INTERACT.normalizeInteract({type:'DOOR', mode:'slide', range:99});
  assert.equal(door.type, 'door');
  assert.equal(door.mode, 'slide');
  assert.equal(door.range, 14, 'range clamps');
  assert.equal(INTERACT.normalizeInteract({type:'nope'}).type, 'button', 'an unknown type is a plain button');
});

test('a door animates its transform and drives its collider with it', () => {
  const GAME = fakeGame();
  const collider = boxCollider(0, 1.4, 3, 2, 1.4, .15);
  const door = {
    name:'Test Door',
    position:{x:0, y:1.4, z:3, set(x, y, z){ this.x = x; this.y = y; this.z = z; }},
    rotation:{x:0, y:0, z:0},
    userData:{interact:{type:'door', mode:'slide', slide:[4, 0, 0], speed:5, range:4}, collider:{ref:collider}},
  };
  GAME.world.registry.push(door);
  const system = INTERACT.create(GAME);
  const pawn = fakePawn(GAME);
  pawn.owner.position.z = 2;

  const focus = system.focus(pawn);
  assert.ok(focus, 'the door is in range');
  assert.equal(focus.prompt, 'Open');
  system.trigger(pawn);
  assert.ok(saw('OnDoorOpened'));
  for(let i = 0; i < 60; i++) system.update(.05, [pawn]);
  assert.ok(door.position.x > 3.9, 'the door reaches its open offset');
  pawn.owner.position.x = 3.5;   // follow the leaf, which slid out of reach
  assert.equal(system.focus(pawn).prompt, 'Close', 'the prompt now offers the opposite verb');
});

test('carrying an object disables its collider and delivering it re-enables it', () => {
  const GAME = fakeGame();
  const collider = boxCollider(0, .35, 2, .35, .35, .35);
  const crate = {
    name:'Crate',
    position:{x:0, y:.35, z:2, set(x, y, z){ this.x = x; this.y = y; this.z = z; }},
    rotation:{x:0, y:0, z:0},
    userData:{interact:{type:'carry', range:3}, collider:{ref:collider}},
  };
  const pad = {
    name:'Pad',
    position:{x:0, y:0, z:6},
    userData:{interact:{type:'dropZone', range:3}},
  };
  GAME.world.registry.push(crate, pad);
  const system = INTERACT.create(GAME);
  const pawn = fakePawn(GAME);

  system.trigger(pawn);
  assert.equal(system.carrying(pawn), crate);
  assert.equal(collider.enabled, false, 'a carried crate stops being a wall');
  system.update(.016, [pawn]);
  assert.ok(crate.position.y > .9, 'the crate rides in front of the character');

  pawn.owner.position.z = 5;
  system.trigger(pawn);
  assert.equal(system.carrying(pawn), null);
  assert.equal(collider.enabled, true);
  assert.ok(saw('OnObjectDelivered'));
});

test('a locked object shows a prompt but refuses the verb', () => {
  const GAME = fakeGame();
  GAME.world.registry.push({
    name:'Locked Door',
    position:{x:0, y:1, z:1.5, set(){}},
    rotation:{x:0, y:0, z:0},
    userData:{interact:{type:'door', locked:true, range:3}},
  });
  const system = INTERACT.create(GAME);
  const pawn = fakePawn(GAME);
  assert.equal(system.focus(pawn).prompt, 'Locked');
  assert.equal(system.trigger(pawn), null);
  assert.ok(saw('OnInteractBlocked'));
});

test('a climb contract tags the collider the abilities module reads', () => {
  const GAME = fakeGame();
  const collider = boxCollider(0, 2.5, 1, 2, 2.5, .3);
  GAME.world.registry.push({
    name:'Net',
    position:{x:0, y:2.5, z:1},
    rotation:{x:0, y:0, z:0},
    userData:{interact:{type:'climb'}, collider:{ref:collider}},
  });
  const system = INTERACT.create(GAME);
  assert.equal(system.focus(fakePawn(GAME)), null, 'a climbable face never shows a prompt');
  assert.equal(collider.climbable, true);
  assert.equal(ABILITIES.isClimbable(collider), true);
});

// ------------------------------------------------ view mode

test('the rig owns the camera in BOTH views; only the eye output changes', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rig = FP.create(GAME, pawn, {});
  assert.equal(rig.enabled(), true);
  assert.equal(rig.firstPersonView(), true);
  rig.setViewMode('third');
  // Third person is the rig's OWN shoulder camera, not the generic follow
  // camera with the rig switched off: look input, weapon and HUD keep working.
  assert.equal(rig.enabled(), true, 'the rig still owns the camera');
  assert.equal(rig.firstPersonView(), false, 'the eye is no longer the output');
  assert.ok(saw('OnViewModeChanged'));
  rig.toggleViewMode();
  assert.equal(rig.viewMode(), 'first');
});

test('third person configuration clamps and defaults independently of the eye', () => {
  const config = FP.normalizeConfig({thirdPerson:{distance:99, shoulder:-9, fov:2}});
  assert.equal(config.thirdPerson.distance, 14, 'distance clamps');
  assert.equal(config.thirdPerson.shoulder, -3, 'shoulder offset clamps');
  assert.equal(config.thirdPerson.fov, 20, 'fov clamps');
  assert.equal(FP.normalizeConfig({}).thirdPerson.distance, 3.3, 'a sane over-the-shoulder default');
});

test('the view toggle is edge triggered, so holding the key does not strobe', () => {
  const GAME = fakeGame();
  const pawn = fakePawn(GAME);
  const rig = FP.create(GAME, pawn, {});
  for(let i = 0; i < 10; i++) rig.preMovement(.016, {viewToggle:true});
  assert.equal(rig.viewMode(), 'third', 'one press, one switch');
  rig.preMovement(.016, {viewToggle:false});
  rig.preMovement(.016, {viewToggle:true});
  assert.equal(rig.viewMode(), 'first');
});

console.log('\ncharacter traversal, vitals, items and interaction tests passed');
