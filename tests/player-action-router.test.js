'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

global.window = global;
require('../js/runtime/input/player-action-router.js');

const ROUTER = global.LK_RUNTIME_PLAYER_ACTION_ROUTER;
assert.ok(ROUTER, 'the possessed-player action router must load');

for(const shell of ['gameplay.html', 'engine_editor.html', 'test-editor.html']){
  const html = read(shell);
  const actions = html.indexOf('js/runtime/input/input-actions.js?');
  // Match the path, never the cache tag. This asserts LOAD ORDER, and pinning a
  // full `?v=` here meant an ordinary tag bump on input-manager or lot-king turned
  // an indexOf into -1 and failed the ordering claim while the order was correct.
  const manager = html.indexOf('js/runtime/input/input-manager.js?');
  const router = html.indexOf('js/runtime/input/player-action-router.js?');
  const runtime = html.indexOf('js/lot-king.js?');
  assert.ok(actions >= 0 && actions < manager && manager < router && router < runtime,
    shell + ' must load actions, manager and router before the runtime');
}
assert.ok(read('js/editor/loader.js').includes("'js/runtime/input/player-action-router.js?"),
  'the cached-shell editor loader must know about the action router');
const lotKingSource = read('js/lot-king.js');
assert.ok(lotKingSource.includes('PLAYER_ACTION_ROUTER.update(enabled)'), 'the frame loop must dispatch through the capability router');
assert.equal(lotKingSource.includes('resetPlayerVehicle'), false, 'the raw global reset helper must stay removed');
assert.equal(lotKingSource.includes("keys['f'] || (state && state.highBeams)"), false,
  'raw F/high-beam dispatch must not bypass the possessed Pawn context');
assert.ok(lotKingSource.includes("mappedSnapshot.contextId === 'vehicle'"),
  'headlights must execute only from the resolved Vehicle context');
assert.equal(lotKingSource.includes("activeFirstPersonRig() ? 'b' : 'c'"), false,
  'raw camera shortcuts must not bypass Character/Vehicle mappings');
assert.ok(lotKingSource.includes('const cameraModeHeld = !!(mappedState && mappedState.cameraMode)'),
  'camera mode must be sampled from the active Pawn mapping for keyboard and gamepad');
assert.ok(read('js/runtime/character-pawn-base.js').includes("router.filterDriveForPawn(pawn,drive)"),
  'Character, Animal and Soccer Pawn commands must consume the central semantic filter');

function fixture(){
  const pawns = new Map();
  const drives = Array.from({length:4}, () => ({vehicle:{reset:false}, character:{reset:false,reload:false}}));
  const contexts = new Array(4).fill('vehicle');
  const setContextCalls = [];
  const driveQueries = [];
  const views = contexts.map((unused, index) => ({
    drive(contextId){
      driveQueries.push({playerId:index + 1, contextId});
      return drives[index][contextId] || {};
    },
    setContext(contextId){
      contexts[index] = contextId;
      setContextCalls.push({playerId:index + 1, contextId});
      return contextId;
    },
    context(){ return contexts[index]; },
  }));
  const input = {
    ensurePlayerSlot(){},
    player(index){ return views[index] || null; },
  };
  const router = ROUTER.create({input, resolvePawn:playerId => pawns.get(playerId) || null});
  return {router, pawns, drives, contexts, setContextCalls, driveQueries};
}

assert.equal(ROUTER.contextForPawn({pawnType:'vehicle'}), 'vehicle');
assert.equal(ROUTER.contextForPawn({kind:'native-adapter'}), 'vehicle');
assert.equal(ROUTER.contextForPawn({pawnType:'animal'}), 'character');
assert.equal(ROUTER.contextForPawn({pawnType:'soccer'}), 'character');
assert.equal(ROUTER.contextForPawn({inputProfileId:'soccer'}), 'character', 'an explicit semantic profile derives its mapping context');
assert.equal(ROUTER.contextForPawn({inputActionProfile:'vehicle'}), 'vehicle', 'custom Vehicle profiles derive Vehicle context without pawnType');
assert.equal(ROUTER.contextForPawn({inputContextId:'character', pawnType:'vehicle'}), 'character', 'explicit ownership wins over compatibility inference');
assert.equal(ROUTER.inputProfileForPawn({pawnType:'soccer'}),'soccer');
assert.equal(ROUTER.inputProfileForPawn({pawnType:'animal'}),'animal');
assert.equal(ROUTER.inputProfileForPawn({pawnType:'soccer',inputProfileId:'character'}),'character',
  'an explicit input profile must win over Pawn compatibility inference');
assert.equal(ROUTER.inputProfileForPawn({pawnType:'character',inputActionProfile:'soccer'}),'soccer',
  'custom Pawns may opt into an existing semantic action profile');

{
  const raw={
    jump:true,pass:true,crouch:true,tackle:true,interact:true,pickup:true,
    dropItem:true,shoot:true,fire:true,aim:true,reload:true,leanLeft:true,diveLeft:true,
    primaryAbility:true,secondaryAbility:true,voice:true,
  };
  const soccer=ROUTER.filterDriveForPawn({pawnType:'soccer'},raw);
  assert.equal(soccer.jump,false);assert.equal(soccer.crouch,false);
  assert.equal(soccer.interact,false);assert.equal(soccer.pickup,false);assert.equal(soccer.dropItem,false);
  assert.equal(soccer.pass,true);assert.equal(soccer.tackle,true);assert.equal(soccer.shoot,true);
  assert.equal(soccer.fire,false,'Fire must be consumed as Shoot, not exposed to firearm systems');
  assert.equal(soccer.aim,false);assert.equal(soccer.reload,false);
  assert.equal(soccer.leanLeft,true,'Soccer keeps lean as its authored shot-curve control');
  assert.equal(soccer.diveLeft,true,'Soccer keeps its dedicated goalkeeper dive action');
  assert.equal(soccer.primaryAbility,false,'Soccer cannot execute Animal abilities');

  const character=ROUTER.filterDriveForPawn({pawnType:'character'},raw);
  assert.equal(character.jump,true);assert.equal(character.crouch,true);
  assert.equal(character.interact,true);assert.equal(character.dropItem,true);assert.equal(character.fire,true);
  assert.equal(character.shoot,false);assert.equal(character.pass,false);assert.equal(character.tackle,false);
  assert.equal(character.primaryAbility,false);assert.equal(character.voice,false);
  const animal=ROUTER.filterDriveForPawn({pawnType:'animal'},raw);
  assert.equal(animal.shoot,false);assert.equal(animal.pass,false);assert.equal(animal.tackle,false);
  assert.equal(animal.primaryAbility,true);assert.equal(animal.secondaryAbility,true);assert.equal(animal.voice,true);
  assert.equal(animal.interact,false);assert.equal(animal.leanLeft,false);
  assert.equal(raw.fire,true,'semantic filtering must not mutate the resolver snapshot');
}

{
  const f=fixture();
  f.pawns.set(1,{id:'custom-football-pawn',inputProfileId:'soccer',possessed:true,enabled:true});
  f.drives[0].character={jump:true,pass:true,diveLeft:true};
  const snapshot=f.router.read(1);
  assert.equal(snapshot.contextId,'character');
  assert.equal(f.contexts[0],'character','router.read must activate context derived from an explicit profile');
  assert.equal(snapshot.drive.pass,true);assert.equal(snapshot.drive.diveLeft,true);
  assert.equal(snapshot.drive.jump,false,'the derived Soccer profile must still apply its semantic filter');
}

{
  const f = fixture();
  let restarts = 0;
  const character = {
    id:'dead-fps-character', pawnType:'character', inputContextId:'character',
    possessed:true, enabled:true, vitals:{state:{dead:false}},
    inputCapabilities:{restart(){ restarts++; return true; }},
  };
  f.pawns.set(1, character);
  f.drives[0].character.reload = true;
  let event = f.router.updatePlayer(1);
  assert.equal(event.dispatched, false, 'R remains Reload and never restarts a living Character');
  assert.equal(restarts, 0);
  character.vitals.state.dead = true;
  event = f.router.updatePlayer(1);
  assert.equal(event.dispatched, false, 'dying while R is held does not synthesize a new press');
  f.drives[0].character.reload = false;
  f.router.updatePlayer(1);
  f.drives[0].character.reload = true;
  event = f.router.updatePlayer(1);
  assert.equal(event.action, 'restart');
  assert.equal(event.dispatched, true, 'a fresh R edge restarts only the dead Character');
  assert.equal(restarts, 1);
  f.router.updatePlayer(1);
  assert.equal(restarts, 1, 'holding R cannot restart repeatedly');
}

{
  const f = fixture();
  let lifecycleResets = 0;
  f.pawns.set(1, {
    id:'fps-character', pawnType:'character', inputContextId:'character',
    possessed:true, enabled:true, reset(){ lifecycleResets++; },
  });
  f.drives[0].character = {reload:true, reset:true};
  const event = f.router.updatePlayer(1);
  assert.equal(f.contexts[0], 'character', 'possession must explicitly own the Character mapping context');
  assert.equal(event.action, 'reset', 'the edge remains observable for diagnostics');
  assert.equal(event.dispatched, false, 'Character Reset must be rejected at the capability boundary');
  assert.equal(lifecycleResets, 0, 'a Character lifecycle reset method is not a player Reset action');
  assert.equal(ROUTER.supportsAction(f.pawns.get(1), 'reset'), false);

  f.router.read(1, 'vehicle');
  assert.equal(f.contexts[0], 'character', 'a requested read must not steal the owned context');
  assert.equal(f.driveQueries.at(-1).contextId, 'vehicle', 'requested context reads remain available to diagnostics');
}

{
  const f = fixture();
  let resetCount = 0;
  f.pawns.set(1, {
    id:'player-car', pawnType:'vehicle', inputContextId:'vehicle', possessed:true, enabled:true,
    inputCapabilities:{reset:true}, reset(){ resetCount++; },
  });
  f.drives[0].vehicle.reset = true;
  assert.equal(f.router.updatePlayer(1).dispatched, true, 'a possessed vehicle receives the initial Reset edge');
  assert.equal(resetCount, 1);
  f.router.updatePlayer(1);
  assert.equal(resetCount, 1, 'holding Reset must not dispatch every frame');
  f.router.update(false);
  f.router.update(true);
  assert.equal(resetCount, 1, 'a held Reset must not become a fresh edge after pause/cinema');
  f.drives[0].vehicle.reset = false;
  f.router.updatePlayer(1);
  f.drives[0].vehicle.reset = true;
  f.router.updatePlayer(1);
  assert.equal(resetCount, 2, 'a release followed by a new press dispatches a new edge');
}

{
  const f = fixture();
  const resets = [0, 0, 0, 0];
  for(let playerId = 1; playerId <= 4; playerId++){
    f.pawns.set(playerId, {
      id:'vehicle-p' + playerId, pawnType:'vehicle', possessed:true, enabled:true,
      inputCapabilities:{reset:true}, reset(){ resets[playerId - 1]++; },
    });
    f.drives[playerId - 1].vehicle.reset = true;
  }
  const events = f.router.update(true);
  assert.equal(events.length, 4, 'Player 1-4 must be routed independently');
  assert.deepEqual(resets, [1, 1, 1, 1]);
}

{
  const f = fixture();
  let firstResets = 0;
  let secondResets = 0;
  const first = {
    id:'car-a', pawnType:'vehicle', possessed:true, enabled:true,
    inputCapabilities:{reset:true}, reset(){ firstResets++; },
  };
  const second = {
    id:'car-b', pawnType:'vehicle', possessed:true, enabled:true,
    inputCapabilities:{reset:true}, reset(){ secondResets++; },
  };
  f.pawns.set(1, first);
  f.router.updatePlayer(1); // establish ownership while released
  f.drives[0].vehicle.reset = true;
  f.router.updatePlayer(1);
  assert.equal(firstResets, 1);

  f.pawns.set(1, second);
  f.router.updatePlayer(1);
  assert.equal(secondResets, 0, 'a held action must not cross a possession transition');
  f.drives[0].vehicle.reset = false;
  f.router.updatePlayer(1);
  f.drives[0].vehicle.reset = true;
  f.router.updatePlayer(1);
  assert.equal(secondResets, 1, 'the new Pawn receives only a fresh edge');
}

console.log('player-action-router.test.js: all assertions passed');
