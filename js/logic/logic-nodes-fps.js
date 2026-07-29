/* =========================================================
   LOT KING - First Person Pawn node pack

   Graph surface for the first-person rig in
   js/runtime/first-person-controller.js. Every node resolves through the
   Pawn service like the Character pack, so a first-person Pawn keeps all the
   generic Character nodes and only adds view/weapon/damage vocabulary here.
   ========================================================= */
(function(){
'use strict';

const execIn = {name:'exec', kind:'exec', direction:'input'};
const completedOut = {name:'completed', kind:'exec', direction:'output'};
const dataIn = (name, type, value) => ({name, kind:'data', direction:'input', type:type || 'any', defaultValue:value});
const dataOut = (name, type) => ({name, kind:'data', direction:'output', type:type || 'any'});
const number = value => Number(value) || 0;

function pawn(api){
  const explicit = api.getInput('pawn');
  if(explicit && api.services.pawns && api.services.pawns.get) return api.services.pawns.get(explicit) || explicit;
  return explicit || (api.services.pawns && api.services.pawns.self());
}
function rig(api){
  const target = pawn(api);
  return target && target.firstPerson ? target.firstPerson : null;
}

function registerFirstPersonNodes(registry){
  // ---------------------------------------------------------------- view
  registry.register({
    type:'firstPerson.getViewAngles', title:'Get View Angles', category:'First Person',
    description:'Reads the current first-person yaw and pitch in radians, plus the aim-down-sights state.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('yaw', 'number'), dataOut('pitch', 'number'), dataOut('aiming', 'boolean')],
    evaluate(api, pin){
      const view = rig(api);
      if(!view) return pin === 'aiming' ? false : 0;
      if(pin === 'aiming') return view.isAiming() === true;
      return number(view.viewAngles()[pin]);
    },
  });
  registry.register({
    type:'firstPerson.setViewAngles', title:'Set View Angles', category:'First Person',
    description:'Snaps the first-person view to explicit yaw/pitch radians. Useful for spawns, cutscenes and scripted look-at moments.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('yaw', 'number', 0), dataIn('pitch', 'number', 0)],
    outputs:[completedOut],
    run(api){
      const view = rig(api);
      if(view) view.setViewAngles(number(api.getInput('yaw')), number(api.getInput('pitch')));
      return {exec:'completed'};
    },
  });
  registry.register({
    type:'firstPerson.addLook', title:'Add Look Input', category:'First Person',
    description:'Applies an extra look delta in radians, on top of mouse and stick input. Positive pitch looks up.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('yaw', 'number', 0), dataIn('pitch', 'number', 0)],
    outputs:[completedOut],
    run(api){
      const view = rig(api);
      if(view){
        const angles = view.viewAngles();
        view.setViewAngles(angles.yaw + number(api.getInput('yaw')), angles.pitch + number(api.getInput('pitch')));
      }
      return {exec:'completed'};
    },
  });

  // -------------------------------------------------------------- weapon
  registry.register({
    type:'firstPerson.fire', title:'Fire Weapon', category:'First Person',
    description:'Fires one shot immediately, respecting cadence, magazine and reload state. Returns whether the shot landed on a damageable target.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null)],
    outputs:[completedOut, dataOut('fired', 'boolean'), dataOut('hit', 'boolean'), dataOut('killed', 'boolean')],
    run(api){
      const view = rig(api);
      const result = view ? view.fire() : null;
      api.node.data.__fps = result || null;
      return {exec:'completed'};
    },
    evaluate(api, pin){
      const result = api.node.data.__fps;
      if(pin === 'fired') return !!result;
      if(pin === 'hit') return !!(result && result.hit);
      return !!(result && result.killed);
    },
  });
  registry.register({
    type:'firstPerson.reload', title:'Reload Weapon', category:'First Person',
    description:'Starts a reload when the magazine is not full and reserve ammo remains.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null)],
    outputs:[completedOut, dataOut('started', 'boolean')],
    run(api){ const view = rig(api); api.node.data.__started = !!(view && view.reload()); return {exec:'completed'}; },
    evaluate(api){ return api.node.data.__started === true; },
  });
  registry.register({
    type:'firstPerson.setAimDownSights', title:'Set Aim Down Sights', category:'First Person',
    description:'Latches the aim-down-sights state from a graph. It stays held until this node clears it, and the player Aim button can still add to it.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('aiming', 'boolean', true)],
    outputs:[completedOut],
    run(api){ const view = rig(api); if(view) view.setAimDownSights(api.getInput('aiming') === true); return {exec:'completed'}; },
  });
  registry.register({
    type:'firstPerson.getWeaponState', title:'Get Weapon State', category:'First Person',
    description:'Reads magazine, reserve, reload state and session accuracy from the first-person weapon.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('ammo', 'number'), dataOut('reserve', 'number'), dataOut('magazine', 'number'), dataOut('reloading', 'boolean'), dataOut('shotsFired', 'number'), dataOut('hits', 'number'), dataOut('kills', 'number'), dataOut('accuracy', 'number')],
    evaluate(api, pin){
      const view = rig(api);
      if(!view) return pin === 'reloading' ? false : 0;
      if(pin === 'reloading') return view.ammo().reloading === true;
      if(pin === 'accuracy') return view.accuracy();
      if(pin === 'ammo' || pin === 'reserve' || pin === 'magazine') return number(view.ammo()[pin]);
      return number(view.state[pin]);
    },
  });

  // ------------------------------------------------------------- targets
  // Damageable is a scene-side contract (userData.damageable), so these nodes
  // work for level-authored props and Logic Element enemies alike.
  registry.register({
    type:'firstPerson.setDamageable', title:'Make Object Damageable', category:'First Person',
    description:'Registers an object as a shootable target with a health pool. Re-running it restores the target to full health.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('health', 'number', 100), dataIn('team', 'string', 'enemy')],
    outputs:[completedOut],
    run(api){
      const object = api.getInput('object') || (api.services.objects && api.services.objects.owner());
      if(object && object.userData){
        const health = Math.max(1, number(api.getInput('health')) || 100);
        object.userData.damageable = {health, maxHealth:health, team:String(api.getInput('team') || 'enemy')};
      }
      return {exec:'completed'};
    },
  });
  registry.register({
    type:'firstPerson.getDamageableState', title:'Get Damageable State', category:'First Person',
    description:'Reads the health pool of a shootable object.',
    inputs:[dataIn('object', 'object3d', null)],
    outputs:[dataOut('health', 'number'), dataOut('maxHealth', 'number'), dataOut('alive', 'boolean'), dataOut('normalized', 'number')],
    evaluate(api, pin){
      const object = api.getInput('object');
      const data = object && object.userData && object.userData.damageable;
      if(!data) return pin === 'alive' ? false : 0;
      const health = number(data.health), maxHealth = Math.max(1, number(data.maxHealth) || 1);
      if(pin === 'alive') return health > 0;
      if(pin === 'normalized') return Math.max(0, Math.min(1, health / maxHealth));
      return pin === 'maxHealth' ? maxHealth : health;
    },
  });
  registry.register({
    type:'firstPerson.applyDamage', title:'Apply Damage', category:'First Person',
    description:'Applies damage to a shootable object without a hitscan, for explosions, scripted hits and traps.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('damage', 'number', 25)],
    outputs:[completedOut, dataOut('health', 'number'), dataOut('killed', 'boolean')],
    run(api){
      const runtime = window.LK_RUNTIME_FIRST_PERSON;
      const result = runtime ? runtime.applyDamage(api.getInput('object'), number(api.getInput('damage'))) : null;
      api.node.data.__damage = result || null;
      return {exec:'completed'};
    },
    evaluate(api, pin){
      const result = api.node.data.__damage;
      if(pin === 'killed') return !!(result && result.killed);
      return result ? number(result.health) : 0;
    },
  });

  // ------------------------------------------------------- weapons as items
  // A weapon is a definition plus its ammo, not a fixed field of the rig, so a
  // graph can hand one over, take it away or drop it into the level exactly the
  // way a world pickup does.
  registry.register({
    type:'firstPerson.equipWeapon', title:'Give Weapon', category:'First Person',
    description:'Adds a weapon to the Pawn inventory and equips it. Use a preset name (rifle, marksman, shotgun, pistol, smg) or leave it blank and set the stats by hand.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('preset', 'string', 'rifle'), dataIn('ammo', 'number', -1), dataIn('reserve', 'number', -1)],
    outputs:[completedOut, dataOut('equipped', 'boolean')],
    run(api){
      const target = pawn(api);
      const inventory = target && target.inventory;
      const ammo = number(api.getInput('ammo')), reserve = number(api.getInput('reserve'));
      const state = ammo >= 0 || reserve >= 0
        ? {ammo:ammo >= 0 ? ammo : undefined, reserve:reserve >= 0 ? reserve : undefined}
        : null;
      api.node.data.__equipped = !!(inventory && inventory.add({preset:String(api.getInput('preset') || 'rifle')}, state));
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__equipped === true; },
  });
  registry.register({
    type:'firstPerson.dropWeapon', title:'Drop Weapon', category:'First Person',
    description:'Throws the equipped weapon into the level as a pickup. Power 0 places it at the feet, 1 hurls it.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('power', 'number', 0)],
    outputs:[completedOut, dataOut('dropped', 'boolean')],
    run(api){
      const items = api.services && api.services.game && api.services.game.systems && api.services.game.systems.items;
      const system = items || (window.GAME && window.GAME.systems && window.GAME.systems.items);
      api.node.data.__dropped = !!(system && system.dropWeapon(pawn(api), number(api.getInput('power'))));
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__dropped === true; },
  });
  registry.register({
    type:'firstPerson.cycleWeapon', title:'Cycle Weapon', category:'First Person',
    description:'Switches to the next or previous carried weapon.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('forward', 'boolean', true)],
    outputs:[completedOut],
    run(api){
      const target = pawn(api);
      if(target && target.inventory) target.inventory.cycle(api.getInput('forward') === false ? -1 : 1);
      return {exec:'completed'};
    },
  });
  registry.register({
    type:'firstPerson.getLoadout', title:'Get Loadout', category:'First Person',
    description:'Reads what the Pawn is carrying: the equipped weapon name, how many slots are used and whether it is armed at all.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('weapon', 'string'), dataOut('count', 'number'), dataOut('slot', 'number'), dataOut('armed', 'boolean')],
    evaluate(api, pin){
      const target = pawn(api);
      const inventory = target && target.inventory;
      const view = target && target.firstPerson;
      if(pin === 'armed') return !!(view && view.armed());
      if(pin === 'weapon') return view && view.armed() ? String(view.weapon().name) : '';
      if(pin === 'count') return inventory ? inventory.count() : 0;
      return inventory ? inventory.index() : -1;
    },
  });

  // ------------------------------------------------------------ view mode
  registry.register({
    type:'firstPerson.setViewMode', title:'Set View Mode', category:'First Person',
    description:'Switches the possessed Pawn between the first-person eye and the third-person follow camera.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('view', 'string', 'first')],
    outputs:[completedOut],
    run(api){
      const view = rig(api);
      if(view) view.setViewMode(String(api.getInput('view') || 'first'));
      return {exec:'completed'};
    },
  });
  registry.register({
    type:'firstPerson.getViewMode', title:'Get View Mode', category:'First Person',
    description:'Reads whether the Pawn is currently rendered from the eye or over the shoulder.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('view', 'string'), dataOut('firstPerson', 'boolean')],
    evaluate(api, pin){
      const view = rig(api);
      const mode = view ? view.viewMode() : 'third';
      return pin === 'firstPerson' ? mode === 'first' : mode;
    },
  });

  // --------------------------------------------------------------- vitals
  registry.register({
    type:'character.getVitals', title:'Get Vitals', category:'Character Vitals',
    description:'Reads health, armour and stamina of a character Pawn.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('health', 'number'), dataOut('maxHealth', 'number'), dataOut('armor', 'number'), dataOut('stamina', 'number'), dataOut('alive', 'boolean'), dataOut('normalized', 'number')],
    evaluate(api, pin){
      const target = pawn(api);
      const vitals = target && target.vitals;
      if(!vitals) return pin === 'alive' ? false : 0;
      const snapshot = vitals.snapshot();
      if(pin === 'alive') return snapshot.dead !== true;
      if(pin === 'normalized') return Math.max(0, Math.min(1, snapshot.health / Math.max(1, snapshot.maxHealth)));
      return number(snapshot[pin]);
    },
  });
  registry.register({
    type:'character.heal', title:'Heal Character', category:'Character Vitals',
    description:'Restores health or armour. This is what a medkit or a plate does, so a custom pickup can reuse it.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('amount', 'number', 25), dataIn('kind', 'string', 'health')],
    outputs:[completedOut, dataOut('gained', 'number')],
    run(api){
      const target = pawn(api);
      api.node.data.__gain = target && target.vitals ? target.vitals.heal(number(api.getInput('amount')), String(api.getInput('kind') || 'health')) : 0;
      return {exec:'completed'};
    },
    evaluate(api){ return number(api.node.data.__gain); },
  });
  registry.register({
    type:'character.damage', title:'Damage Character', category:'Character Vitals',
    description:'Applies damage to a character Pawn through the armour rules, for traps, explosions and scripted hits.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('amount', 'number', 20), dataIn('source', 'string', 'script')],
    outputs:[completedOut, dataOut('health', 'number'), dataOut('died', 'boolean')],
    run(api){
      const target = pawn(api);
      api.node.data.__hurt = target && target.vitals
        ? target.vitals.applyDamage(number(api.getInput('amount')), {source:String(api.getInput('source') || 'script')})
        : null;
      return {exec:'completed'};
    },
    evaluate(api, pin){
      const result = api.node.data.__hurt;
      if(pin === 'died') return !!(result && result.dead);
      return result ? number(result.health) : 0;
    },
  });

  // ------------------------------------------------------------ abilities
  registry.register({
    type:'character.getAbilityState', title:'Get Traversal State', category:'Character Abilities',
    description:'Reads what the character is doing right now: none, crouch, slide, vault, mantle or climb.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('state', 'string'), dataOut('crouch', 'number'), dataOut('busy', 'boolean')],
    evaluate(api, pin){
      const target = pawn(api);
      const abilities = target && target.abilities;
      if(!abilities) return pin === 'state' ? 'none' : (pin === 'busy' ? false : 0);
      if(pin === 'state') return abilities.mode();
      if(pin === 'busy') return abilities.isBusy();
      return abilities.crouchAmount();
    },
  });

  // ------------------------------------------- world contracts (data-only)
  // These write the SAME userData descriptors a level template authors, so a
  // graph-built pickup and a hand-placed one are the same object to the runtime.
  registry.register({
    type:'world.makeItem', title:'Make Object a Pickup', category:'World Items',
    description:'Turns any object into a pickup: a weapon, a medkit, armour, ammo, or a custom item that only fires On Item Picked Up.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('kind', 'string', 'health'), dataIn('amount', 'number', 35), dataIn('preset', 'string', ''), dataIn('respawn', 'number', 0)],
    outputs:[completedOut],
    run(api){
      const object = api.getInput('object') || (api.services.objects && api.services.objects.owner());
      const runtime = window.LK_RUNTIME_ITEMS;
      if(object && object.userData && runtime){
        const preset = String(api.getInput('preset') || '');
        object.userData.item = runtime.normalizeItem({
          kind:String(api.getInput('kind') || 'health'),
          name:object.name || undefined,
          amount:number(api.getInput('amount')),
          respawn:number(api.getInput('respawn')),
          weapon:preset ? {preset} : null,
        });
        object.userData.item.__normalized = true;
      }
      return {exec:'completed'};
    },
  });
  registry.register({
    type:'world.makeInteractable', title:'Make Object Interactive', category:'World Items',
    description:'Turns any object into a door, ladder, carryable, delivery pad, button or climbable face, driven by the Use key.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('type', 'string', 'button'), dataIn('label', 'string', ''), dataIn('range', 'number', 2.4), dataIn('locked', 'boolean', false)],
    outputs:[completedOut],
    run(api){
      const object = api.getInput('object') || (api.services.objects && api.services.objects.owner());
      const runtime = window.LK_RUNTIME_INTERACTIONS;
      if(object && object.userData && runtime){
        object.userData.interact = runtime.normalizeInteract({
          type:String(api.getInput('type') || 'button'),
          label:String(api.getInput('label') || ''),
          range:number(api.getInput('range')) || 2.4,
          locked:api.getInput('locked') === true,
        });
        object.userData.interact.__normalized = true;
      }
      return {exec:'completed'};
    },
  });
  registry.register({
    type:'world.setDoorLocked', title:'Lock / Unlock', category:'World Items',
    description:'Locks or unlocks an interactive object. A locked object still shows a prompt, but the Use key refuses it.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('locked', 'boolean', true)],
    outputs:[completedOut],
    run(api){
      const object = api.getInput('object') || (api.services.objects && api.services.objects.owner());
      if(object && object.userData && object.userData.interact) object.userData.interact.locked = api.getInput('locked') === true;
      return {exec:'completed'};
    },
  });

  // -------------------------------------------------------------- events
  // Event nodes take their output pins straight from the payload dispatched on
  // the shared `lk-pawn-event` channel, exactly like the Pawn and Soccer packs.
  const thenOut = {name:'then', kind:'exec', direction:'output'};
  registry.register({
    type:'event.onWeaponFired', title:'On Weapon Fired', category:'First Person Events',
    description:'Runs once per shot fired by a first-person Pawn.',
    event:'OnWeaponFired',
    outputs:[thenOut, dataOut('ammo', 'number'), dataOut('reserve', 'number'), dataOut('hit', 'boolean'), dataOut('killed', 'boolean')],
  });
  registry.register({
    type:'event.onWeaponHit', title:'On Weapon Hit', category:'First Person Events',
    description:'Runs for each damageable target hit by a shot.',
    event:'OnWeaponHit',
    outputs:[thenOut, dataOut('damage', 'number'), dataOut('health', 'number'), dataOut('distance', 'number'), dataOut('headshot', 'boolean')],
  });
  registry.register({
    type:'event.onTargetDown', title:'On Target Down', category:'First Person Events',
    description:'Runs when weapon damage, including an explosion, reduces a damageable target to zero health.',
    event:'OnTargetDown',
    outputs:[thenOut, dataOut('damage', 'number'), dataOut('distance', 'number'), dataOut('headshot', 'boolean')],
  });
  registry.register({
    type:'event.onWeaponReloaded', title:'On Weapon Reloaded', category:'First Person Events',
    description:'Runs when a reload completes and the magazine is refilled.',
    event:'OnWeaponReloaded',
    outputs:[thenOut, dataOut('ammo', 'number'), dataOut('reserve', 'number')],
  });
  registry.register({
    type:'event.onWeaponDryFire', title:'On Weapon Dry Fire', category:'First Person Events',
    description:'Runs when the trigger is pulled with an empty magazine.',
    event:'OnWeaponDryFire',
    outputs:[thenOut, dataOut('weapon', 'string')],
  });
  registry.register({
    type:'event.onItemPickedUp', title:'On Item Picked Up', category:'World Events',
    description:'Runs when a character takes a pickup: a weapon, a medkit, armour, ammo or a custom item.',
    event:'OnItemPickedUp',
    outputs:[thenOut, dataOut('kind', 'string'), dataOut('name', 'string'), dataOut('amount', 'number')],
  });
  registry.register({
    type:'event.onDoorOpened', title:'On Door Opened', category:'World Events',
    description:'Runs when a door is opened with the Use key or from a graph.',
    event:'OnDoorOpened',
    outputs:[thenOut, dataOut('id', 'string')],
  });
  registry.register({
    type:'event.onObjectInteracted', title:'On Object Used', category:'World Events',
    description:'Runs when a button or lever is used. This is the default event name for the button contract.',
    event:'OnObjectInteracted',
    outputs:[thenOut, dataOut('id', 'string'), dataOut('state', 'boolean')],
  });
  registry.register({
    type:'event.onObjectDelivered', title:'On Object Delivered', category:'World Events',
    description:'Runs when a carried object is set down on a delivery pad that accepts it.',
    event:'OnObjectDelivered',
    outputs:[thenOut, dataOut('zone', 'string'), dataOut('id', 'string')],
  });
  registry.register({
    type:'event.onCharacterDamaged', title:'On Character Damaged', category:'World Events',
    description:'Runs each time the character loses health, after armour has absorbed its share.',
    event:'OnCharacterDamaged',
    outputs:[thenOut, dataOut('damage', 'number'), dataOut('health', 'number'), dataOut('armor', 'number'), dataOut('source', 'string')],
  });
  registry.register({
    type:'event.onCharacterDied', title:'On Character Died', category:'World Events',
    description:'Runs when the character reaches zero health.',
    event:'OnCharacterDied',
    outputs:[thenOut, dataOut('source', 'string')],
  });
  registry.register({
    type:'event.onCharacterVault', title:'On Vault', category:'World Events',
    description:'Runs when the character vaults over an obstacle.',
    event:'OnCharacterVault',
    outputs:[thenOut, dataOut('height', 'number')],
  });
  registry.register({
    type:'event.onCharacterMantle', title:'On Mantle', category:'World Events',
    description:'Runs when the character pulls up onto a ledge.',
    event:'OnCharacterMantle',
    outputs:[thenOut, dataOut('height', 'number')],
  });
  registry.register({
    type:'event.onCharacterClimbStarted', title:'On Climb Started', category:'World Events',
    description:'Runs when the character grabs a ladder or a climbable surface.',
    event:'OnCharacterClimbStarted',
    outputs:[thenOut, dataOut('ladder', 'boolean')],
  });
}

const packs = window.LK_LOGIC_NODE_PACKS || (window.LK_LOGIC_NODE_PACKS = []);
packs.push(registerFirstPersonNodes);
window.LK_LOGIC_NODES_FPS = Object.freeze({register:registerFirstPersonNodes});
})();
