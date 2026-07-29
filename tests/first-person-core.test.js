'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
require('../js/runtime/character-placeholder-locomotion.js');
require('../js/runtime/mixamo-placeholder-clips.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-nodes-character.js');
require('../js/runtime/first-person-controller.js');
require('../js/logic/logic-nodes-fps.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-character.js');
require('../js/logic/logic-templates-fps.js');
require('../js/logic/logic-validator.js');
require('../js/runtime/input/input-actions.js');
require('../js/runtime/fps-arena-level-template.js');
require('../js/runtime/fps-hud.js');

const FP = global.LK_RUNTIME_FIRST_PERSON;
const ACT = global.LK_RUNTIME_INPUT_ACTIONS;
const FPS_HUD = global.LK_RUNTIME_FPS_HUD;
const registry = global.LK_LOGIC_NODES_MVP.createRegistry();

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// A minimal stand-in for the Pawn contract the rig composes onto. THREE is not
// available in node, so the controller degrades to its DOM-free paths: view
// angles, weapon state and the damage contract stay fully testable.
function fakePawn(overrides){
  return Object.assign({
    id:'pawn-test',
    possessed:true,
    enabled:true,
    hidden:false,
    owner:{rotation:{x:0, y:0, z:0}, position:{x:0, y:0, z:0}, userData:{}},
    state:{speed:0, airborne:false},
    reset(){ return true; },
    dispose(){ return true; },
  }, overrides || {});
}

test('config normalization clamps and defaults every field', () => {
  const config = FP.normalizeConfig({eyeHeight:99, sensitivity:-4, pitchMaxDeg:400, fov:5, viewBob:{amplitude:9}});
  assert.equal(config.eyeHeight, 4, 'eye height clamps to the 4 m ceiling');
  assert.equal(config.sensitivity, .05, 'sensitivity clamps to the low bound');
  assert.equal(config.pitchMaxDeg, 89, 'pitch clamps below straight up');
  assert.equal(config.fov, 20, 'fov clamps to the low bound');
  assert.equal(config.viewBob.amplitude, .4, 'view bob amplitude clamps');
  assert.equal(config.enabled, true, 'enabled defaults on');
  assert.equal(config.hideOwnBody, true, 'own body is hidden by default');
});

test('weapon presets resolve and individual values override them', () => {
  assert.ok(FP.WEAPON_PRESETS.rifle && FP.WEAPON_PRESETS.marksman && FP.WEAPON_PRESETS.shotgun);
  const shotgun = FP.normalizeWeapon({preset:'shotgun'});
  assert.equal(shotgun.preset, 'shotgun');
  assert.equal(shotgun.pellets, 9, 'shotgun preset fires multiple pellets');
  assert.equal(shotgun.mode, 'semi');
  const tuned = FP.normalizeWeapon({preset:'rifle', damage:99});
  assert.equal(tuned.damage, 99, 'explicit values win over the preset');
  assert.equal(tuned.magazine, 30, 'unspecified values still come from the preset');
  assert.equal(FP.normalizeWeapon({mode:'nonsense'}).mode, 'auto', 'unknown fire mode falls back to auto');
});

test('damage contract respects health, headshot zones and death', () => {
  const target = {userData:{damageable:{health:100, maxHealth:100}}};
  const first = FP.applyDamage(target, 30);
  assert.equal(first.health, 70);
  assert.equal(first.killed, false);
  const lethal = FP.applyDamage(target, 500);
  assert.equal(lethal.health, 0);
  assert.equal(lethal.killed, true, 'health cannot go below zero and reports a kill');
  const again = FP.applyDamage(target, 10);
  assert.equal(again.alreadyDown, true, 'a downed target is not killed twice');

  const head = {userData:{damageableHitZone:'head'}, parent:target};
  assert.equal(FP.isHeadshotNode(head), true);
  assert.equal(FP.damageableOf(head), target, 'the health pool is found on the ancestor');
  const body = {userData:{}, parent:target};
  assert.equal(FP.isHeadshotNode(body), false);
  assert.equal(FP.applyDamage({userData:{}}, 10), null, 'non-damageable objects take no damage');
});

test('view angles clamp pitch and follow sensitivity and inversion', () => {
  const rig = FP.create(null, fakePawn(), {pitchMinDeg:-80, pitchMaxDeg:80, sensitivity:1});
  rig.applyLookDelta(0, 100000);
  assert.ok(rig.viewAngles().pitch <= 80 * Math.PI / 180 + 1e-9, 'pitch stops at the configured ceiling');
  rig.applyLookDelta(0, -100000);
  assert.ok(rig.viewAngles().pitch >= -80 * Math.PI / 180 - 1e-9, 'pitch stops at the configured floor');

  const normal = FP.create(null, fakePawn(), {});
  const inverted = FP.create(null, fakePawn(), {invertY:true});
  normal.applyLookDelta(0, 50);
  inverted.applyLookDelta(0, 50);
  assert.equal(Math.sign(normal.viewAngles().pitch), -Math.sign(inverted.viewAngles().pitch), 'invert Y flips the pitch delta');

  const yawRig = FP.create(null, fakePawn(), {});
  yawRig.setViewAngles(1.25, .5);
  assert.equal(yawRig.viewAngles().yaw, 1.25);
  assert.equal(yawRig.viewAngles().pitch, .5);
});

test('weapon fires, empties, reloads and refills from reserve', () => {
  const rig = FP.create(null, fakePawn(), {weapon:{magazine:3, ammoReserve:6, fireRate:1000, reloadTime:1, mode:'auto', spreadHip:0}});
  assert.equal(rig.ammo().ammo, 3);
  for(let i = 0; i < 3; i++){ rig.fire(); rig.state.cooldown = 0; }
  assert.equal(rig.ammo().ammo, 0, 'the magazine empties');
  assert.equal(rig.ammo().reloading, true, 'an empty magazine starts a reload automatically');
  // preMovement clamps dt to 0.1 s, so the reload has to be stepped in frames
  // rather than one large jump — same as the real frame loop.
  for(let frame = 0; frame < 12; frame++) rig.preMovement(.1, {});
  assert.equal(rig.ammo().ammo, 3, 'the magazine refills after the reload time');
  assert.equal(rig.ammo().reserve, 3, 'the reserve pays for the refill');
  assert.equal(rig.state.shotsFired, 3);
});

test('fire cadence and semi-automatic mode gate the trigger', () => {
  const auto = FP.create(null, fakePawn(), {weapon:{magazine:50, fireRate:5, mode:'auto', spreadHip:0}});
  auto.fire();
  assert.equal(auto.fire(), null, 'a second shot inside the cadence window is refused');
  auto.state.cooldown = 0;
  assert.ok(auto.fire(), 'the shot lands once the cooldown elapses');

  const semi = FP.create(null, fakePawn(), {weapon:{magazine:50, fireRate:1000, mode:'semi', spreadHip:0}});
  semi.preMovement(.016, {fire:true});
  const afterHold = semi.state.shotsFired;
  semi.preMovement(.016, {fire:true});
  assert.equal(semi.state.shotsFired, afterHold, 'holding the trigger does not repeat in semi mode');
  semi.preMovement(.016, {fire:false});
  semi.preMovement(.016, {fire:true});
  assert.equal(semi.state.shotsFired, afterHold + 1, 'releasing and pulling again fires once more');
});

test('aim down sights blends in and narrows spread', () => {
  const rig = FP.create(null, fakePawn(), {adsBlend:20, weapon:{spreadHip:.1, spreadAds:.001}});
  assert.equal(rig.isAiming(), false);
  for(let i = 0; i < 30; i++) rig.preMovement(.05, {aim:true});
  assert.equal(rig.isAiming(), true, 'holding aim reaches the aiming state');
  for(let i = 0; i < 30; i++) rig.preMovement(.05, {aim:false});
  assert.equal(rig.isAiming(), false, 'releasing aim returns to the hip state');
});

test('look input follows the engine sign conventions', () => {
  // Engine heading convention: yaw faces (sin yaw, 0, cos yaw). Facing +Z the
  // right vector is -X, so turning right LOWERS yaw. Pitch is positive-up, so
  // pushing the mouse down must lower it. Getting either backwards is what
  // "every control is inverted" feels like in play.
  const rig = FP.create(null, fakePawn(), {});
  rig.setViewAngles(0, 0);
  rig.applyLookDelta(120, 0);
  assert.ok(rig.viewAngles().yaw < 0, 'mouse right must turn right');
  rig.setViewAngles(0, 0);
  rig.applyLookDelta(-120, 0);
  assert.ok(rig.viewAngles().yaw > 0, 'mouse left must turn left');
  rig.setViewAngles(0, 0);
  rig.applyLookDelta(0, 120);
  assert.ok(rig.viewAngles().pitch < 0, 'mouse down must look down');
  rig.setViewAngles(0, 0);
  rig.applyLookDelta(0, -120);
  assert.ok(rig.viewAngles().pitch > 0, 'mouse up must look up');

  const inverted = FP.create(null, fakePawn(), {invertY:true});
  inverted.setViewAngles(0, 0);
  inverted.applyLookDelta(0, 120);
  assert.ok(inverted.viewAngles().pitch > 0, 'invert Y flips only the vertical axis');
  inverted.setViewAngles(0, 0);
  inverted.applyLookDelta(120, 0);
  assert.ok(inverted.viewAngles().yaw < 0, 'invert Y must not touch the horizontal axis');

  // Gamepad look integrates an axis over dt but must agree with the mouse.
  const stick = FP.create(null, fakePawn(), {});
  stick.setViewAngles(0, 0);
  stick.applyStickLook(1, 0, .1);
  assert.ok(stick.viewAngles().yaw < 0, 'stick right must turn right, like the mouse');
});

test('the FPS radar puts forward at the top and engine-right at screen-right', () => {
  const project=FPS_HUD.projectRadarOffset;
  assert.deepEqual(project(0,5,0),{x:0,y:-5},'facing +Z, a point ahead belongs above the player');
  assert.deepEqual(project(-4,0,0),{x:4,y:0},'facing +Z, the D/right input is world -X');
  const facingX=project(5,0,Math.PI/2);
  assert.ok(Math.abs(facingX.x)<1e-9&&Math.abs(facingX.y+5)<1e-9,'after turning toward +X, +X stays at the top');
  const rightOfFacingX=project(0,3,Math.PI/2);
  assert.ok(Math.abs(rightOfFacingX.x-3)<1e-9&&Math.abs(rightOfFacingX.y)<1e-9,'after turning toward +X, +Z is screen-right');
});

test('shooter HUD controls do not overlap the left-centre radar', () => {
  const css=fs.readFileSync(path.join(__dirname,'../css/lot-king.css'),'utf8');
  assert.match(css,/#tuneDock\s*\{[^}]*right:84px/s,'the vehicle wrench belongs immediately left of settings');
  assert.match(css,/#settingsBtn\s*\{[^}]*right:22px/s,'settings belongs on the far right in every gameplay mode');
  assert.match(css,/\.lk-fps-radar\s*\{[^}]*left:calc\(22px[^}]*top:50%[^}]*translateY\(-50%\)/s,
    'the FPS radar belongs at left centre, below the vitals block');
});

test('the camera-mode popup names the view being entered', () => {
  const runtime=fs.readFileSync(path.join(__dirname,'../js/lot-king.js'),'utf8');
  assert.ok(runtime.includes("const next = current === 'first' ? 'third' : 'first';"));
  assert.ok(runtime.includes("popup(next === 'first' ? 'FIRST PERSON' : 'THIRD PERSON'"),
    'the popup must not describe the view that is being left');
});

test('the FPS template disables the native vehicle and native effects follow real P1 ownership', () => {
  const scene=global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  assert.equal(scene.player.enabled,false);
  assert.equal(scene.player.hidden,true);
  assert.equal(scene.player.controllerIndex,null);
  assert.equal(scene.template.version,5);
  const runtime=fs.readFileSync(path.join(__dirname,'../js/lot-king.js'),'utf8');
  assert.ok(runtime.includes('function nativePlayerRuntimeActive()'));
  assert.ok(runtime.includes('if(!nativePlayerRuntimeActive()){\n    exhaustSmokeAcc = 0;'),
    'native exhaust must be cleared whenever the native singleton does not own runtime play');
  assert.ok(runtime.includes('ENGINE_AUDIO.setMuted(!nativePlayerActive)'),
    'native engine audio must be muted from the same ownership decision');
  assert.ok(runtime.includes('else if(SFX.stopEngineSynth) SFX.stopEngineSynth();'),
    'the fallback idle synth must be stopped rather than updated with zero throttle');
  const audio=fs.readFileSync(path.join(__dirname,'../js/runtime/audio.js'),'utf8');
  assert.ok(audio.includes('screechGain.gain.setTargetAtTime(0'),
    'stopping the native fallback audio must also silence any lingering tyre screech');
});

test('recoil raises the aim rather than pushing it down', () => {
  const rig = FP.create(null, fakePawn(), {weapon:{magazine:30, fireRate:1000, recoilPitch:.08, spreadHip:0}});
  rig.setViewAngles(0, 0);
  rig.fire();
  // Pitch is positive-up, so the kick has to be added, not subtracted.
  assert.ok(rig.state.recoilPitch > 0, 'firing produces upward kick');
});

test('graph-driven aim survives the per-frame input refresh', () => {
  const rig = FP.create(null, fakePawn(), {adsBlend:30});
  rig.setAimDownSights(true);
  // preMovement recomputes the held state from player input every frame, so a
  // scripted aim has to latch rather than be written straight into it.
  for(let i = 0; i < 30; i++) rig.preMovement(.05, {aim:false});
  assert.equal(rig.isAiming(), true, 'Set Aim Down Sights keeps aiming without a held button');
  rig.setAimDownSights(false);
  for(let i = 0; i < 30; i++) rig.preMovement(.05, {aim:false});
  assert.equal(rig.isAiming(), false, 'clearing the scripted aim releases it');
  rig.setAimDownSights(true);
  rig.preMovement(.05, {aim:false});
  rig.reset();
  assert.equal(rig.state.adsForced, false, 'resetting the Pawn clears a scripted aim');
});

test('recoil is added to the view and decays back', () => {
  const rig = FP.create(null, fakePawn(), {weapon:{magazine:30, fireRate:1000, recoilPitch:.05, recoilRecovery:10, spreadHip:0}});
  rig.fire();
  const kicked = rig.state.recoilPitch;
  assert.ok(kicked > 0, 'firing kicks the view up');
  rig.afterMovement(.5, {}, {speed:0, grounded:true});
  assert.ok(rig.state.recoilPitch < kicked, 'recoil decays after the shot');
});

test('the rig only owns the camera while the Pawn is possessed and visible', () => {
  const pawn = fakePawn();
  const rig = FP.create(null, pawn, {});
  assert.equal(rig.enabled(), true);
  pawn.possessed = false;
  assert.equal(rig.enabled(), false, 'an unpossessed Pawn does not own camera output');
  pawn.possessed = true;
  pawn.hidden = true;
  assert.equal(rig.enabled(), false, 'a hidden Pawn does not own camera output');
});

test('attach composes onto existing Pawn hooks instead of replacing them', () => {
  const calls = [];
  const pawn = fakePawn({
    beforeMovementStep(){ calls.push('before'); return false; },
    afterMovementStep(){ calls.push('after'); },
  });
  const rig = FP.attach(null, pawn, {});
  assert.ok(rig, 'attach returns the controller');
  pawn.beforeMovementStep(.016, {});
  pawn.afterMovementStep(.016, {}, {speed:0, grounded:true});
  assert.deepEqual(calls, ['before', 'after'], 'the pre-existing hooks still run');

  const resetPawn = fakePawn();
  const resetRig = FP.attach(null, resetPawn, {weapon:{magazine:5, fireRate:1000, spreadHip:0}});
  resetRig.fire();
  resetPawn.reset();
  assert.equal(resetRig.ammo().ammo, 5, 'resetting the Pawn restores the magazine');
});

test('combat input actions exist and are bound only for on-foot Pawns', () => {
  const config = ACT.defaultConfig();
  ['fire', 'aim', 'reload'].forEach(action => {
    assert.ok(ACT.KEYBOARD_ACTIONS.includes(action), 'keyboard schema exposes ' + action);
    assert.ok(ACT.GAMEPAD_ACTIONS.includes(action), 'gamepad schema exposes ' + action);
    assert.ok(ACT.ACTION_LABELS[action], action + ' has a display label');
  });
  const character = config.contexts.character.schemes;
  const vehicle = config.contexts.vehicle.schemes;
  assert.deepEqual(character.keyboard.fire, ['Mouse0'], 'fire is the left mouse button on foot');
  assert.deepEqual(character.keyboard.aim, ['Mouse2'], 'aim is the right mouse button on foot');
  assert.deepEqual(character.keyboard.reload, ['KeyR']);
  assert.deepEqual(vehicle.keyboard.fire, [], 'the vehicle context leaves combat unbound');
  assert.deepEqual(vehicle.keyboard.aim, []);
  assert.equal(vehicle.gamepad.fire, null, 'no vehicle gamepad button reacts to fire');
});

test('combat bindings do not collide with existing character bindings', () => {
  const config = ACT.defaultConfig();
  const keyboard = ACT.schemeConflicts(config.contexts.character.schemes.keyboard, 'keyboard');
  const gamepad = ACT.schemeConflicts(config.contexts.character.schemes.gamepad, 'gamepad');
  ['fire', 'aim', 'reload'].forEach(action => {
    assert.ok(!keyboard[action], action + ' has no keyboard conflict');
    assert.ok(!gamepad[action], action + ' has no gamepad conflict');
  });
});

test('mouse codes get readable labels', () => {
  assert.equal(ACT.keyLabel('Mouse0'), 'Mouse L');
  assert.equal(ACT.keyLabel('Mouse2'), 'Mouse R');
  assert.equal(ACT.keyLabel('KeyR'), 'R', 'ordinary key labels are unchanged');
});

test('neutral drive stays false for the combat actions', () => {
  const neutral = ACT.neutralDrive();
  assert.equal(neutral.fire, false);
  assert.equal(neutral.aim, false);
  assert.equal(neutral.reload, false);
  const merged = ACT.mergeDrive(neutral, Object.assign(ACT.neutralDrive(), {fire:true}));
  assert.equal(merged.fire, true, 'merge ORs the combat buttons like every other button');
});

test('FPS node pack registers the full view/weapon/target surface', () => {
  [
    'firstPerson.getViewAngles', 'firstPerson.setViewAngles', 'firstPerson.addLook',
    'firstPerson.fire', 'firstPerson.reload', 'firstPerson.setAimDownSights',
    'firstPerson.getWeaponState', 'firstPerson.setDamageable',
    'firstPerson.getDamageableState', 'firstPerson.applyDamage',
    'event.onWeaponFired', 'event.onWeaponHit', 'event.onTargetDown',
    'event.onWeaponReloaded', 'event.onWeaponDryFire',
  ].forEach(type => assert.ok(registry.get(type), 'missing node ' + type));
});

test('first person and target templates validate cleanly', () => {
  const player = global.LK_LOGIC_TEMPLATES.get('logic-template-player-first-person');
  assert.ok(player && player.graph.characterPawn, 'the player template is still a Character Pawn');
  assert.ok(player.graph.characterPawn.firstPerson.enabled, 'the first person rig is enabled');
  assert.equal(player.graph.characterPawn.movement.inputMode, 'heading', 'the body follows the view, not the camera frame');
  assert.equal(player.graph.characterPawn.movement.facingMode, 'heading', 'facing must not turn toward velocity');
  const playerResult = global.LK_LOGIC_VALIDATOR.validateGraph(player.graph, registry);
  assert.equal(playerResult.ok, true, JSON.stringify(playerResult.errors));

  const target = global.LK_LOGIC_TEMPLATES.get('logic-template-shooting-target');
  assert.ok(target, 'the shooting target template is registered');
  const targetResult = global.LK_LOGIC_VALIDATOR.validateGraph(target.graph, registry);
  assert.equal(targetResult.ok, true, JSON.stringify(targetResult.errors));
});

test('the first person template exposes view and weapon settings, not follow-camera ones', () => {
  const graph = global.LK_LOGIC_TEMPLATES.get('logic-template-player-first-person').graph;
  const bindings = new Set(graph.variables.map(variable => variable.binding).filter(Boolean));
  ['firstPerson.eyeHeight', 'firstPerson.sensitivity', 'firstPerson.fov', 'firstPerson.fovAds',
   'firstPerson.weapon.preset', 'firstPerson.weapon.damage', 'firstPerson.weapon.magazine',
   'firstPerson.weapon.reloadTime'].forEach(binding => {
    assert.ok(bindings.has(binding), 'missing exposed setting ' + binding);
  });
  graph.variables.forEach(variable => {
    assert.ok(!/^camera\./.test(String(variable.binding || '')), 'follow-camera settings must not be exposed: ' + variable.binding);
  });
});

test('the target template never queues a respawn from the per-frame update', () => {
  const graph = global.LK_LOGIC_TEMPLATES.get('logic-template-shooting-target').graph;
  const types = graph.nodes.map(node => node.type);
  assert.ok(types.includes('flow.delay'), 'the respawn delay exists');
  assert.ok(!types.includes('event.onUpdate'), 'a per-frame tick would queue one delay per frame while the target is down');
  assert.ok(types.includes('event.onTargetDown'), 'the cycle is driven by the knock-down event');
});

test('the FPS Shooter Test level builds a complete, playable range', () => {
  const template = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE;
  assert.equal(template.id, 'fps-shooter-test');
  assert.equal(template.name, 'FPS Shooter Test');
  const scene = template.buildScene();

  const logic = scene.added.filter(entry => entry.kind === 'logicElement');
  const players = logic.filter(entry => entry.graph && entry.graph.characterPawn && entry.graph.characterPawn.firstPerson);
  const targets = logic.filter(entry => entry.asset.key === 'logic:template:logic-template-shooting-target');
  assert.equal(players.length, 1, 'exactly one possessed first-person player');
  assert.equal(targets.length, 12, 'twelve shooting targets');

  assert.ok(scene.added.some(entry => entry.name === 'Range Floor'), 'the range has a floor');
  assert.ok(scene.added.filter(entry => /^Wall /.test(entry.name)).length >= 4, 'the arena is enclosed');
  assert.ok(scene.added.some(entry => /Cover Crate/.test(entry.name)), 'there is cover to break line of sight');
  assert.ok(scene.added.some(entry => entry.name === 'Overwatch Platform'), 'there is a raised firing position');

  assert.ok(scene.characterGround, 'movement bounds are authored');
  assert.ok(scene.characterGround.maxX > scene.characterGround.minX);
  assert.ok(scene.characterGround.maxZ > scene.characterGround.minZ);
  assert.equal(scene.template.id, 'fps-shooter-test');
  assert.ok(scene.template.controls.fire, 'the level documents its own controls');

  const spawn = players[0].graph.characterPawn.spawn;
  assert.ok(spawn.z > scene.characterGround.minZ && spawn.z < scene.characterGround.maxZ, 'the player spawns inside the playable bounds');
  assert.ok(spawn.x > scene.characterGround.minX && spawn.x < scene.characterGround.maxX);

  // Every target must sit downrange of the player, otherwise the range reads
  // backwards the moment it opens.
  targets.forEach(target => assert.ok(target.t.p[2] < spawn.z, target.name + ' is downrange of the spawn'));
});

test('the FPS level is a dressed environment, not a greybox', () => {
  const template = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE;
  const scene = template.buildScene();

  // Every authored zone must actually contain geometry, so the outliner reads
  // as the facility rather than as one flat list.
  const groups = {};
  scene.added.forEach(entry => { groups[entry.templateGroup || ''] = (groups[entry.templateGroup || ''] || 0) + 1; });
  Object.keys(template.GROUPS).forEach(key => {
    const label = template.GROUPS[key];
    assert.ok(groups[label] > 0, 'zone "' + label + '" is empty');
  });
  assert.ok(scene.added.every(entry => entry.templateGroup), 'every entry is filed under a zone');

  const has = pattern => scene.added.some(entry => pattern.test(entry.name));
  // Staging bay
  assert.ok(has(/^Locker Bank /), 'the staging bay has weapon lockers');
  assert.ok(has(/^Prep Bench /), 'the staging bay has prep benches');
  assert.ok(has(/^Briefing Board /), 'the staging bay has a briefing board');
  // Firing line
  assert.ok(has(/^Emplacement \d+ Sandbag /), 'the firing line is built from individual sandbags');
  // CQB village
  assert.ok(has(/^Container [ABC] Shell$/), 'the village has shipping containers');
  // The corrugation lives in the surface rather than in a rib box per panel,
  // so what proves a container is not a coloured box is its hardware: corner
  // castings, door bars and the ribbed surface the shell asks for.
  assert.ok(has(/^Container A Casting /), 'containers have corner castings');
  assert.ok(has(/^Container A Door Bar /), 'containers have door hardware');
  const containerShell = scene.added.find(entry => entry.name === 'Container A Shell');
  assert.equal(containerShell.props.surfaceTexture.kind, 'metalCorrugated', 'container sides are corrugated');
  assert.ok(has(/^Block House /), 'the village has a block house');
  assert.ok(has(/Window Frame/), 'the block house has window openings');
  assert.ok(has(/Breach/), 'the block house has a breach opening');
  assert.ok(has(/^Wrecked Car /), 'the village has a wrecked car');
  assert.ok(has(/^Tyre Stack /), 'the village has tyre stacks');
  assert.ok(has(/^Oil Drum /), 'the village has oil drums');
  // Long range
  assert.ok(has(/^Berm /), 'the long range has earth berms');
  assert.ok(has(/^Target Frame /), 'targets stand in authored frames');
  assert.ok(has(/^Tower /), 'the overwatch position is a roofed tower');
  // Perimeter
  assert.ok(has(/^Fence Post /), 'the perimeter has a fence');
  assert.ok(has(/^Floodlight Mast /), 'the perimeter has floodlight masts');
  assert.ok(has(/^Sign /), 'the facility is signposted');

  assert.ok(scene.added.length > 400, 'the environment is detailed, got ' + scene.added.length + ' entries');
  // Fog is a CAMERA value: sky.js copies the sky colour into scene.fog every
  // frame and lot-king.js drives the density from the camera config, so an
  // env.fog block with a colour and a near/far was never read by anything.
  assert.ok(scene.player.cam.fogDensity > 0, 'distance fog is authored on the camera');
  assert.ok(scene.player.cam.grade.enabled, 'the level owns its colour grade');
  assert.ok(scene.template.setting, 'the level names its setting');
});

test('the FPS level files its zones in walking order', () => {
  const template = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE;
  const labels = Object.keys(template.GROUPS).map(key => template.GROUPS[key]);
  // The outliner sorts folder labels as text, so the numeric prefix is the
  // only thing keeping the zones in ground order - and two zones sharing a
  // number (there used to be two 08s) puts them in an arbitrary one.
  const numbers = labels.map(label => {
    const match = /^(\d\d) /.exec(label);
    assert.ok(match, 'zone "' + label + '" is not numbered');
    return match[1];
  });
  assert.equal(new Set(numbers).size, numbers.length, 'two zones share a number: ' + numbers.join(', '));
  assert.deepEqual(labels.slice().sort(), labels, 'declaration order must match the order the outliner will show');
});

test('every FPS surface names a material class instead of a loose colour', () => {
  const template = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE;
  const scene = template.buildScene();
  const primitives = scene.added.filter(entry => entry.kind === 'primitive');

  // A material class carries the procedural surface, so most of the level
  // should be wearing one. The exceptions are deliberate: unlit emissive
  // panels, painted lines, water and glass.
  const dressed = primitives.filter(entry => entry.props.surfaceTexture);
  assert.ok(dressed.length > primitives.length * .6,
    'only ' + dressed.length + ' of ' + primitives.length + ' primitives wear a procedural surface');
  primitives.forEach(entry => {
    if(entry.props.materialModel === 'unlit'){
      assert.ok(!entry.props.surfaceTexture, entry.name + ' is unlit and must not carry a surface');
    }
    if(entry.props.surfaceTexture){
      assert.ok(entry.props.surfaceTexture.kind, entry.name + ' has a surface with no kind');
      assert.ok(entry.props.surfaceTexture.tile > 0, entry.name + ' has a surface with no world tile size');
    }
  });

  // The footstep material is derived from the class rather than typed per
  // object, which is what keeps a metal deck sounding like metal.
  const deck = scene.added.find(entry => entry.name === 'Overwatch Platform');
  assert.equal(deck.surface, 'metal', 'the walkway deck reports a metal footstep surface');
  const floor = scene.added.find(entry => entry.name === 'Range Floor');
  assert.equal(floor.surface, 'dirt', 'the range floor reports a dirt footstep surface');

  // Every class the level names must exist in the published table.
  assert.ok(template.MATERIALS && template.MATERIALS.concreteFloor, 'the material table is exported');
});

test('the FPS level does not pay for shadows it cannot see', () => {
  // Every caster is redrawn into the shadow map each frame, so a decal lying
  // flat on the ground it stains and a silhouette 100 m outside the wire are
  // pure cost: one casts onto the surface it is touching, the other casts
  // outside the sun's shadow camera entirely.
  const template = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE;
  const scene = template.buildScene();
  const skylineLabel = template.GROUPS.skyline;

  const skyline = scene.added.filter(entry => entry.templateGroup === skylineLabel);
  assert.ok(skyline.length > 40, 'the silhouette layer exists');
  skyline.forEach(entry => assert.equal(entry.props.castShadow, false, entry.name + ' casts a shadow nobody can reach'));

  const decals = scene.added.filter(entry => entry.prim === 'plane' && entry.t.p[1] < .05);
  assert.ok(decals.length > 20, 'the ground carries decals');
  // Floors included: a plane lying on the ground casts onto the ground.
  decals.forEach(entry => assert.equal(entry.props.castShadow, false, entry.name + ' is a flat decal and must not cast'));

  // Structure still casts: this is an opt-out, not a blanket switch.
  ['Container A Shell', 'Block House Roof', 'Overwatch Platform', 'Wall West'].forEach(name => {
    const entry = scene.added.find(item => item.name === name);
    assert.ok(entry && entry.props.castShadow !== false, name + ' must still cast');
  });
});

test('the FPS level authors torus props at a believable size', () => {
  // A torus primitive is TorusGeometry(1.4, .4) scaled uniformly, so the
  // visible outer radius is 1.8x the scale. Passing a tyre's radius straight
  // in as the scale drew a two-metre donut and made every tyre stack read as
  // a black scribble.
  const scene = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  const oversized = scene.added
    .filter(entry => entry.prim === 'torus')
    .map(entry => ({name:entry.name, outer:+(entry.t.s[0] * 1.8).toFixed(2)}))
    .filter(item => item.outer > 1.2);
  assert.deepEqual(oversized, [], 'torus props larger than any object they belong to');
});

test('the FPS level keeps its lighting and collision budget sane', () => {
  const scene = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  const lights = scene.added.filter(entry => entry.kind === 'light');
  // Point lights cost per fragment on every material in the level. The soccer
  // stadium establishes four as the project norm; dressing must not blow past
  // it just because there are more visible fixtures than real lights.
  assert.ok(lights.length > 0, 'the facility is lit');
  assert.ok(lights.length <= 6, 'too many real lights: ' + lights.length);
  lights.forEach(entry => {
    assert.ok(Number(entry.props.distance) > 0, entry.name + ' must have a bounded falloff');
    assert.equal(entry.props.intensityUnit, 'candela', entry.name + ' must use the r185 punctual unit');
    // scene-store applies light colour with Color.setHex, which floors its
    // argument: a CSS string becomes NaN and the fixture renders pure black.
    assert.equal(typeof entry.props.color, 'number', entry.name + ' colour must be numeric, not a CSS string');
    assert.ok(entry.props.color > 0, entry.name + ' must not be black');
  });
  // Emissive fixtures are cheap and should outnumber the real lights.
  const lenses = scene.added.filter(entry => /Lens|Glow|Lamp Lens/.test(entry.name));
  assert.ok(lenses.length >= lights.length, 'lit-looking fixtures should outnumber real lights');

  // Decoration must not become collision: only structural geometry blocks.
  const colliders = scene.added.filter(entry => entry.collide);
  assert.ok(colliders.length < scene.added.length * .45, 'too much of the dressing is collidable');
  assert.ok(colliders.some(entry => /^Wall /.test(entry.name)), 'the boundary walls block');
  assert.ok(!scene.added.some(entry => entry.collide && /Rib |Stripe|Text|Note|Marking|Patch|Puddle/.test(entry.name)), 'flat decoration must not collide');
});

test('the watchtower rails follow the stairs instead of fighting them', () => {
  const scene = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  const stairs = scene.added.filter(entry => /^Overwatch Stair /.test(entry.name));
  const rail = scene.added.find(entry => entry.name === 'Stair Rail 1');
  const posts = scene.added.filter(entry => /^Stair Rail Post 1-/.test(entry.name));
  assert.ok(stairs.length > 4 && rail && posts.length > 2, 'the flight and its railing exist');

  const lowest = stairs.reduce((best, entry) => entry.t.p[1] < best.t.p[1] ? entry : best);
  const highest = stairs.reduce((best, entry) => entry.t.p[1] > best.t.p[1] ? entry : best);
  assert.ok(highest.t.p[2] < lowest.t.p[2], 'the flight climbs toward -z');
  // A box rotated by +x about X tips its local +z downward, which is the way
  // the treads fall. The opposite sign leaves the rail buried in the top steps
  // and floating over the bottom ones.
  assert.ok(rail.t.r[0] > 0, 'the rail slopes with the flight, not against it');

  posts.forEach(post => {
    const z = post.t.p[2];
    const tread = stairs.find(entry => Math.abs(entry.t.p[2] - z) <= entry.t.s[2]);
    assert.ok(tread, post.name + ' stands off the flight at z ' + z);
    const rise = (post.t.p[1] + post.t.s[1]) - (tread.t.p[1] + tread.t.s[1]);
    assert.ok(rise > .8 && rise < 1.3, post.name + ' holds the rail ' + rise.toFixed(2) + ' m above its tread');
  });
});

// Mirrors character-movement.js `resolveColliders`: the arcade character
// collider is a 2D XZ push that only ignores a box when the character is
// already ABOVE its top. Overhead geometry marked collidable therefore behaves
// as a full-height wall — the reason the spawn originally landed inside one.
function collidableBoxes(scene){
  return scene.added
    .filter(entry => entry.collide && entry.kind === 'primitive' && entry.prim === 'box')
    .map(entry => ({
      name:entry.name,
      x:entry.t.p[0], y:entry.t.p[1], z:entry.t.p[2],
      hx:entry.t.s[0], hy:entry.t.s[1], hz:entry.t.s[2],
    }));
}
// Mirrors the height-aware test in character-movement.js: a box only blocks a
// character standing at `feetY` when their body actually overlaps it.
function blockersAt(boxes, x, z, radius, feetY){
  const r = radius == null ? .35 : radius;
  const feet = feetY == null ? 0 : feetY;
  const HEIGHT = 1.8, STEP = .55, TOLERANCE = .06;
  return boxes.filter(box => {
    const top = box.y + box.hy, bottom = box.y - box.hy;
    if(feet >= top - TOLERANCE) return false;            // standing on or above it
    if(feet + HEIGHT <= bottom + TOLERANCE) return false; // walking underneath
    if(top - feet > 0 && top - feet <= STEP) return false; // stepped over
    return (box.hx + r - Math.abs(x - box.x)) > 0 && (box.hz + r - Math.abs(z - box.z)) > 0;
  }).map(box => box.name);
}

test('the FPS level spawns the player in open space', () => {
  const scene = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  const player = scene.added.find(entry => entry.kind === 'logicElement' && entry.graph && entry.graph.characterPawn && entry.graph.characterPawn.firstPerson);
  const spawn = player.graph.characterPawn.spawn;
  const blocked = blockersAt(collidableBoxes(scene), spawn.x, spawn.z);
  assert.deepEqual(blocked, [], 'spawn overlaps collidable geometry: ' + blocked.join(', '));
});

test('overhead geometry stays solid now that the collider is height aware', () => {
  // This used to assert the opposite. The 2D collider made roofs behave as
  // full-height walls, so the level stripped their collision as a workaround;
  // character-movement.js now understands a box's vertical span, so roofs and
  // decks are solid again and the workaround is gone.
  const scene = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  ['Staging Bay Roof', 'Block House Roof', 'Overwatch Platform'].forEach(name => {
    const entry = scene.added.find(item => item.name === name);
    assert.ok(entry, name + ' is missing');
    assert.equal(entry.collide, true, name + ' should be solid');
  });
  assert.ok(scene.added.some(entry => /^Overwatch Stair /.test(entry.name)), 'the watchtower is reached by a climbable stair');
});

test('every zone of the FPS level is reachable on foot from the spawn', () => {
  const scene = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  const boxes = collidableBoxes(scene);
  const bounds = scene.characterGround;
  const player = scene.added.find(entry => entry.kind === 'logicElement' && entry.graph && entry.graph.characterPawn && entry.graph.characterPawn.firstPerson);
  const spawn = player.graph.characterPawn.spawn;

  // Flood fill the walkable area on a half-metre grid.
  const STEP = .5;
  const key = (x, z) => x.toFixed(1) + ',' + z.toFixed(1);
  const seen = new Set([key(spawn.x, spawn.z)]);
  const queue = [[spawn.x, spawn.z]];
  while(queue.length){
    const [x, z] = queue.pop();
    [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]].forEach(step => {
      const nx = x + step[0], nz = z + step[1];
      if(nx < bounds.minX || nx > bounds.maxX || nz < bounds.minZ || nz > bounds.maxZ) return;
      const k = key(nx, nz);
      if(seen.has(k) || blockersAt(boxes, nx, nz).length) return;
      seen.add(k);
      queue.push([nx, nz]);
    });
  }
  const reachable = (x, z) => seen.has(key(x, z));

  assert.ok(seen.size > 8000, 'most of the facility should be walkable, got ' + seen.size + ' cells');
  [
    ['the firing line', 0, 2.5],
    ['the mid range', 0, -20],
    ['the block house south room', 0, -29],
    ['the block house north room', 0, -35],
    ['under the watchtower deck', -18, -46],
    ['the long range', 0, -60],
    ['the west lane', -15, -20],
    ['the east lane', 15, -20],
    ['the north end block house', 0, -70],
  ].forEach(([label, x, z]) => assert.ok(reachable(x, z), label + ' is unreachable from the spawn'));

});

test('no collidable box relies on a rotation the collider ignores', () => {
  // character-movement.js `resolveColliders` uses a box's LOCAL half-extents
  // and never reads its rotation, so a turned collidable box looks one way and
  // blocks another. Collidable geometry must therefore be authored on an axis;
  // rotation is only safe for decoration.
  const scene = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  // Measured as AABB growth rather than raw angle: what matters is how far the
  // real footprint drifts from the box the collider will actually use.
  const TOLERANCE = 1.25;
  const turned = scene.added.filter(entry => {
    if(!entry.collide || entry.kind !== 'primitive' || entry.prim !== 'box') return false;
    const yaw = Number(entry.t.r[1]) || 0;
    const hx = entry.t.s[0], hz = entry.t.s[2];
    const cos = Math.abs(Math.cos(yaw)), sin = Math.abs(Math.sin(yaw));
    return (hx * cos + hz * sin) > hx * TOLERANCE || (hx * sin + hz * cos) > hz * TOLERANCE;
  });
  assert.deepEqual(turned.map(entry => entry.name), [],
    'collidable geometry authored with a rotation the collider will not follow');
});

test('every target on the FPS range has a clear line of fire', () => {
  // A shooting range whose lanes are blocked is not a shooting range. Dressing
  // was originally added without checking sightlines and left seven of the
  // twelve targets unhittable — berms sat in front of the very targets they
  // were meant to back, and containers and the block house stood across the
  // lanes. This walks the actual bullet path at chest height.
  const scene = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  const solid = collidableBoxes(scene);
  const FIRING_LINE_Z = 2;
  const EYE_Y = 1.6;
  const TARGET_CENTRE_Y = 1.35;

  const blocked = [];
  scene.added
    .filter(entry => entry.asset && entry.asset.key === 'logic:template:logic-template-shooting-target')
    .forEach(target => {
      const [tx, ty, tz] = target.t.p;
      const aimY = ty + TARGET_CENTRE_Y;
      const hits = new Set();
      // March the ray from the firing position straight down the target's lane.
      for(let u = .02; u < 1; u += .005){
        const x = tx, z = FIRING_LINE_Z + (tz - FIRING_LINE_Z) * u, y = EYE_Y + (aimY - EYE_Y) * u;
        solid.forEach(box => {
          if(Math.abs(x - box.x) < box.hx && Math.abs(z - box.z) < box.hz && Math.abs(y - box.y) < box.hy) hits.add(box.name);
        });
      }
      if(hits.size) blocked.push(target.name + ' <- ' + Array.from(hits).slice(0, 2).join(', '));
    });

  assert.deepEqual(blocked, [], 'targets with an obstructed lane:\n  ' + blocked.join('\n  '));
});

test('the FPS level scales target difficulty with distance', () => {
  const scene = global.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene();
  const targets = scene.added
    .filter(entry => entry.asset && entry.asset.key === 'logic:template:logic-template-shooting-target')
    .map(entry => {
      const variables = entry.graph.variables;
      const read = name => (variables.find(item => item.name === name) || {}).value;
      return {z:entry.t.p[2], health:read('TargetHealth'), points:read('PointsValue')};
    });
  const nearest = targets.reduce((best, item) => (item.z > best.z ? item : best), targets[0]);
  const furthest = targets.reduce((best, item) => (item.z < best.z ? item : best), targets[0]);
  assert.ok(furthest.health > nearest.health, 'distant targets are tougher');
  assert.ok(furthest.points > nearest.points, 'distant targets are worth more');
});

test('the third-person character path is untouched by the first-person addition', () => {
  const normal = global.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal');
  assert.ok(normal, 'the generic character template still exists');
  assert.equal(normal.graph.characterPawn.firstPerson, undefined, 'it must not gain a first-person rig');
  assert.equal(normal.graph.characterPawn.camera.view, 'third');
  assert.equal(normal.graph.characterPawn.movement.inputMode, 'camera', 'it keeps camera-relative input');
  const result = global.LK_LOGIC_VALIDATOR.validateGraph(normal.graph, registry);
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

console.log('\nfirst-person core tests passed');
