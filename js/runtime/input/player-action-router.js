/* =========================================================
   LOT KING — POSSESSED PLAYER ACTION ROUTER

   Input Actions resolves hardware into commands. This module owns the next
   boundary: which mapping context belongs to Player 1-4, and which possessed
   Pawn is allowed to execute an edge-triggered action.

   A Pawn declares:
     inputContextId     `vehicle` or `character`
     inputProfileId     `vehicle`, `character`, `animal` or `soccer`
     inputCapabilities {reset:true, ...}

   The compatibility inference below keeps older/custom Pawn implementations
   working, but dispatch remains capability-gated. A Character can implement a
   lifecycle reset method without that method becoming a player Reset action.
   ========================================================= */
(function(){
'use strict';

const MIN_PLAYER_ID = 1;
const MAX_PLAYER_ID = 4;
const SOCCER_ACTIONS = Object.freeze(['shoot','pass','tackle','diveLeft','diveRight']);
const ANIMAL_ACTIONS = Object.freeze(['primaryAbility','secondaryAbility','voice']);
const CHARACTER_ONLY_ACTIONS = Object.freeze([
  'jump','crouch','slowWalk','interact','pickup','dropItem','nextWeapon','useItem',
  'dodge','swapShoulder','takeCover','slot1','slot2','slot3','slot4','slot5',
  'slot6','slot7','inventory','aim','reload',
]);
const ON_FOOT_ACTIONS = Object.freeze(CHARACTER_ONLY_ACTIONS.concat(['leanLeft','leanRight'],SOCCER_ACTIONS,ANIMAL_ACTIONS,['fire']));

function playerId(value){
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(MIN_PLAYER_ID, Math.min(MAX_PLAYER_ID, number | 0)) : MIN_PLAYER_ID;
}

function contextForPawn(pawn){
  if(!pawn) return null;
  const explicit = String(pawn.inputContextId || pawn.inputContext || '').trim().toLowerCase();
  if(explicit === 'vehicle' || explicit === 'character') return explicit;
  // A custom Pawn is allowed to declare only its semantic profile. Treat that
  // as an explicit ownership declaration too, otherwise the router falls back
  // to whichever mapping context happened to be globally active.
  const profile = String(pawn.inputProfileId || pawn.inputActionProfile || '').trim().toLowerCase();
  if(profile === 'vehicle') return 'vehicle';
  if(profile === 'character' || profile === 'animal' || profile === 'soccer') return 'character';
  const type = String(pawn.pawnType || pawn.type || '').trim().toLowerCase();
  if(pawn.kind === 'native-adapter' || pawn.id === 'native-player-car' || type === 'vehicle' ||
    /^sketchbook-(?:car|airplane|helicopter)$/.test(type)) return 'vehicle';
  if(type === 'character' || type === 'animal' || type === 'soccer' || type === 'advanced-character' ||
    type === 'sketchbook-advanced-character') return 'character';
  return null;
}

function inputProfileForPawn(pawn){
  if(!pawn)return null;
  const explicit=String(pawn.inputProfileId||pawn.inputActionProfile||'').trim().toLowerCase();
  if(explicit==='vehicle'||explicit==='character'||explicit==='animal'||explicit==='soccer')return explicit;
  const type=String(pawn.pawnType||pawn.type||'').trim().toLowerCase();
  if(type==='soccer')return 'soccer';
  if(type==='animal')return 'animal';
  if(type==='character'||type==='advanced-character'||type==='sketchbook-advanced-character')return 'character';
  return contextForPawn(pawn)==='vehicle'?'vehicle':null;
}

function clearActions(command,actions){
  actions.forEach(action=>{
    command[action]=false;
    const amount=action+'Amount';
    if(Object.prototype.hasOwnProperty.call(command,amount))command[amount]=0;
  });
  return command;
}

// The Character mapping context is intentionally shared by humanoids, Animals
// and Soccer Pawns so projects keep one remapping surface. Possession supplies
// the missing semantic layer: safe aliases may resolve from the same physical
// button, but only verbs owned by the active Pawn leave this boundary.
function filterDriveForPawn(pawn,drive){
  if(!drive||typeof drive!=='object')return drive;
  const command=Object.assign({},drive),profile=inputProfileForPawn(pawn);
  if(profile==='soccer'){
    // Left mouse / trigger may remain a convenient Soccer shot binding, but it
    // is consumed as Shoot here and can never reach a firearm controller.
    const shoot=command.shoot===true||command.fire===true;
    clearActions(command,CHARACTER_ONLY_ACTIONS);
    clearActions(command,ANIMAL_ACTIONS);
    command.fire=false;
    command.shoot=shoot;
    command.pass=command.pass===true;
    command.tackle=command.tackle===true;
    command.diveLeft=command.diveLeft===true;
    command.diveRight=command.diveRight===true;
    return command;
  }
  if(profile==='animal'){
    clearActions(command,SOCCER_ACTIONS);
    // F/Q/E are profile-exclusive aliases: an Animal ability must never also
    // trigger a human world interaction or lean in the same frame.
    clearActions(command,['interact','leanLeft','leanRight']);
    return command;
  }
  if(profile==='character'){
    clearActions(command,SOCCER_ACTIONS);
    clearActions(command,ANIMAL_ACTIONS);
    return command;
  }
  if(profile==='vehicle'){
    // Interact doubles as Exit Vehicle only for a vehicle that explicitly owns
    // that capability. It remains filtered from older/custom vehicles, so an
    // on-foot Use binding can never leak into arbitrary driving graphs.
    const blocked=capabilitiesOf(pawn)&&capabilitiesOf(pawn).interact!==false
      ?ON_FOOT_ACTIONS.filter(action=>action!=='interact')
      :ON_FOOT_ACTIONS;
    clearActions(command,blocked);
    return command;
  }
  return command;
}

function capabilitiesOf(pawn){
  return pawn && (pawn.inputCapabilities || pawn.inputActionCapabilities) || null;
}

function supportsAction(pawn, action){
  if(!pawn || !action) return false;
  const capabilities = capabilitiesOf(pawn);
  if(capabilities && Object.prototype.hasOwnProperty.call(capabilities, action)) return capabilities[action] !== false;
  // Compatibility for vehicle implementations authored before capabilities
  // existed. The context check is the important guard: Character/Animal/Soccer
  // lifecycle reset methods are never promoted to a player action.
  return action === 'reset' && contextForPawn(pawn) === 'vehicle' && typeof pawn.reset === 'function';
}

function invokeAction(pawn, action, snapshot){
  if(!supportsAction(pawn, action)) return false;
  const capabilities = capabilitiesOf(pawn);
  const handler = capabilities && capabilities[action];
  if(typeof handler === 'function') return handler.call(pawn, snapshot) !== false;
  if(typeof pawn.handleInputAction === 'function') return pawn.handleInputAction(action, snapshot) !== false;
  if(action === 'reset' && typeof pawn.reset === 'function') return pawn.reset() !== false;
  return false;
}

function create(deps){
  const options = deps || {};
  const GAME = options.GAME || null;
  const input = options.input || (GAME && GAME.input) || null;
  const previousReset = new Array(MAX_PLAYER_ID).fill(false);
  const previousRestart = new Array(MAX_PLAYER_ID).fill(false);
  const ownerKeys = new Array(MAX_PLAYER_ID);

  function pawnFor(id){
    if(typeof options.resolvePawn === 'function') return options.resolvePawn(id) || null;
    const pawns = GAME && GAME.pawns;
    return pawns && typeof pawns.getByPlayerId === 'function' ? pawns.getByPlayerId(id) || null : null;
  }

  function activePawn(id){
    const pawn = pawnFor(id);
    if(!pawn || pawn.possessed === false || pawn.enabled === false || pawn.hidden === true) return null;
    return pawn;
  }

  function viewFor(id, ensure){
    if(!input || typeof input.player !== 'function') return null;
    if(ensure && typeof input.ensurePlayerSlot === 'function') input.ensurePlayerSlot(id - 1);
    return input.player(id - 1) || null;
  }

  function syncPlayer(value){
    const id = playerId(value), index = id - 1, pawn = activePawn(id);
    const contextId = contextForPawn(pawn);
    const key = pawn && contextId ? String(pawn.id || ('player-' + id)) + '|' + contextId : null;
    const previousOwner = ownerKeys[index];
    const ownerChanged = previousOwner !== key;
    ownerKeys[index] = key;
    const view = viewFor(id, !!pawn);
    if(view && contextId && typeof view.setContext === 'function' && (ownerChanged || view.context && view.context() !== contextId)){
      view.setContext(contextId);
    }
    return {playerId:id, pawn, contextId, view, ownerChanged, previousOwner};
  }

  function read(value, requestedContext){
    const owned = syncPlayer(value);
    const requested = requestedContext === 'vehicle' || requestedContext === 'character' ? requestedContext : null;
    const contextId = requested || owned.contextId || (owned.view && owned.view.context ? owned.view.context() : null);
    const rawDrive = owned.view && owned.view.drive ? owned.view.drive(contextId) : null;
    const drive = filterDriveForPawn(owned.pawn, rawDrive);
    return Object.assign(owned, {contextId, drive});
  }

  function updatePlayer(value){
    const snapshot = read(value);
    const index = snapshot.playerId - 1;
    const held = !!(snapshot.drive && snapshot.drive.reset);
    // Character Reload and dead-character Restart deliberately share R. The
    // second edge is observed independently and can dispatch only after death;
    // while alive this router never promotes Reload to a lifecycle reset.
    const restartHeld = !!(snapshot.drive && snapshot.drive.reload);
    // A held button from the old Pawn/context must not fire in the new one.
    // Initial discovery is not a transfer and may still honour a real press.
    if(snapshot.ownerChanged && snapshot.previousOwner !== undefined){
      previousReset[index] = held;
      previousRestart[index] = restartHeld;
      return {snapshot, action:null, dispatched:false};
    }
    const pressed = held && !previousReset[index];
    const restartPressed = restartHeld && !previousRestart[index];
    previousReset[index] = held;
    previousRestart[index] = restartHeld;
    const canReset = snapshot.contextId === 'vehicle' && supportsAction(snapshot.pawn, 'reset');
    const dead = !!(snapshot.pawn&&snapshot.pawn.vitals&&snapshot.pawn.vitals.state&&snapshot.pawn.vitals.state.dead);
    const canRestart = snapshot.contextId === 'character' && dead && supportsAction(snapshot.pawn, 'restart');
    const action = pressed ? 'reset' : (restartPressed && canRestart ? 'restart' : null);
    const dispatched = pressed && canReset
      ? invokeAction(snapshot.pawn, 'reset', snapshot)
      : (restartPressed && canRestart ? invokeAction(snapshot.pawn, 'restart', snapshot) : false);
    return {snapshot, action, dispatched};
  }

  function update(enabled){
    if(enabled === false){
      // Pausing/cinema disables dispatch, not edge observation. Sampling the
      // held state prevents a button pressed during the disabled interval from
      // becoming a fresh Reset on the first resumed frame.
      for(let id = MIN_PLAYER_ID; id <= MAX_PLAYER_ID; id++){
        if(!activePawn(id)){
          previousReset[id - 1] = false;
          previousRestart[id - 1] = false;
          ownerKeys[id - 1] = null;
          continue;
        }
        const snapshot = read(id);
        previousReset[id - 1] = !!(snapshot.drive && snapshot.drive.reset);
        previousRestart[id - 1] = !!(snapshot.drive && snapshot.drive.reload);
      }
      return [];
    }
    const events = [];
    for(let id = MIN_PLAYER_ID; id <= MAX_PLAYER_ID; id++){
      // Do not create unused Player slots merely because the router ticks.
      if(!activePawn(id)){
        const index = id - 1;
        previousReset[index] = false;
        previousRestart[index] = false;
        ownerKeys[index] = null;
        continue;
      }
      events.push(updatePlayer(id));
    }
    return events;
  }

  function resetEdges(value){
    if(value != null){
      const index = playerId(value) - 1;
      previousReset[index] = false;
      previousRestart[index] = false;
      ownerKeys[index] = undefined;
      return;
    }
    for(let index = 0; index < MAX_PLAYER_ID; index++){
      previousReset[index] = false;
      previousRestart[index] = false;
      ownerKeys[index] = undefined;
    }
  }

  function state(value){
    const index = playerId(value) - 1;
    return {resetHeld:previousReset[index], restartHeld:previousRestart[index], ownerKey:ownerKeys[index] == null ? null : ownerKeys[index]};
  }

  return Object.freeze({read, update, updatePlayer, syncPlayer, resetEdges, state, pawnFor:activePawn});
}

window.LK_RUNTIME_PLAYER_ACTION_ROUTER = Object.freeze({
  create,contextForPawn,inputProfileForPawn,filterDriveForPawn,supportsAction,invokeAction,
});
})();
