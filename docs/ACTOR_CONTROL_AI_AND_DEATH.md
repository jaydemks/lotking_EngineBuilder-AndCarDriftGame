# Actor control, AI, combat and physical death

This guide describes the reusable actor foundation shared by Character and
Animal Pawns. It applies to ordinary levels, Editor Play Preview and playable
exports; FPS Enemy Outpost is one authored example, not a separate enemy
runtime.

The central rule is ownership. A Pawn owns its input context, weapon state,
behavior descriptor and vitals. Global systems route actions and events to that
owner, but do not borrow Player 1 state or infer behavior from a missing Player
ID.

## Layered model

| Layer | Author data | Runtime responsibility |
| --- | --- | --- |
| Possession | `playerId`, `possessed` | Selects which Player controls the Pawn and suspends AI while possessed. |
| Input | Pawn type plus project/user mappings | Resolves one context per possessed Pawn and capability-gates edge actions. |
| Behavior | `behavior` | Chooses local steering, perception, reaction, target and combat intent for an unpossessed Pawn. |
| Combat | `combat`, `firstPerson`, `inventory`, `loadout` | Keeps weapon, magazine, reserve, reload, aim and carried visual state per Pawn. |
| Vitals | `vitals` | Owns health, armour, stamina, death, respawn and lifecycle events. |
| Death physics | `vitals.deathPhysics` | Converts a lethal result into an articulated or whole-owner physical fall and restores it on revive. |

Removing or disabling one layer does not silently enable another. For example,
`playerId: null` removes possession but does not enable behavior, and a Pawn's
lifecycle `reset()` method does not make it eligible for the player's Reset car
action.

## Authoring workflow

For a reusable armed Character:

1. Place **Template - AI Character** or copy one of the four Enemy Outpost
   Character Logic Elements.
2. Keep **Controller Player ID** at None and enable **AI / Behavior**.
3. Set the actor's faction and the factions it may attack.
4. Select a behavior profile, then tune its perception, range, cover, fear and
   reaction overrides.
5. Select the starting weapon and optional loadout. Each placed Pawn owns its
   own ammunition and reload state.
6. Configure health, armour, respawn and death physics.
7. Assign a compatible Main Mesh and Motion Set if the procedural placeholder
   is not wanted, then verify the result in Play Preview.

For an Animal, start with **Template - AI Animal (Cat/Dog/Horse/Generic)**. The
same behavior and vitals rules apply, while decisions are translated through
the species capabilities available on that Pawn.

To temporarily give an AI Pawn to a player, assign a Player ID and possess it.
Actor Behavior suspends automatically while the Pawn is possessed or dead; the
player's own input context and mappings become authoritative.

## Possession-safe input mapping

Input configuration schema v15 separates physical bindings from semantic
actions. `vehicle` and `character` are independent contexts, and each active
Pawn declares its context at runtime:

- Vehicle Pawn: `inputContextId: "vehicle"`, with Reset capability.
- Character and Animal Pawn: `inputContextId: "character"`, with Jump and the
  appropriate humanoid/species actions.
- Soccer Pawn: `inputContextId: "character"`, with its possession-owned Soccer
  profile. Jump, firearm and world-item verbs are filtered out while Soccer
  actions are active.

The same physical key may therefore mean different things safely. By default,
`R` is **Reset car** in the Vehicle context and **Reload** in the Character
context. Space/A is the independent Character **Jump** action. The possessed
player action router checks both the active context and the Pawn's advertised
capability before dispatching an edge action, so Reload never invokes a
Character's lifecycle reset.

The Character context has a second semantic filter owned by the possessed Pawn
type. Soccer-only `shoot`, `pass` and `tackle` commands are inactive on an
ordinary Character or Animal; firearm, world-interaction and traversal commands
are inactive on a Soccer Pawn even where a compact gamepad layout reuses the
same physical button. Vehicle Handbrake/High Beams are physically unbound from
the default on-foot gamepad scheme. Camera, lights and global UI commands are
resolved from the active mapping rather than raw key listeners.

On the default on-foot gamepad, `R3` is Camera Mode and D-pad Up is Shoulder
Swap. Pick Up remains the hold form of X/Square Interact. Dodge, Mute and Help
have no duplicate fallback button: they remain available in the mapper, but are
unbound until the author/player assigns a free control. This is intentional;
one press never executes two simultaneous Character actions.

Aircraft landing-gear braking follows the same rule. `Wheel Brake` is a
separate Vehicle action (keyboard `K` by default, gamepad unbound) rather than a
raw `B` or `R3` read, so it cannot also change radio or camera state. Look Back
and engine-audio throttle likewise consume the resolved Vehicle mapping.

Context reads are side-effect free. Possession explicitly changes the Player's
remembered context, and the action edge is latched to the Player/Pawn/context
tuple. Holding a button while possession moves to another Pawn cannot execute
that action on the new owner.

Projects and local player overrides saved before v15 are migrated. A v14
Character binding stored under the overloaded `reset` field becomes `jump`, and
Character Reset is cleared; custom keyboard/gamepad choices are preserved.

Editor tools and menus keep their own shortcut/focus boundaries. Gameplay
verbs should always enter through `GAME.input` and the action router, never an
additional global `keydown` listener. A custom Pawn type should declare an
input context and only the capabilities it can execute.

Logic graphs have the same boundary. Use **On Input Action Down/Up** for the
Player currently possessing that graph's Pawn, or **On Player Input Action
Down/Up** when a level/NPC graph intentionally observes an explicit Player 1–4
slot. **Is Input Action Pressed** is the polling form. The Talkable NPC and the
shipped Pawn templates use these nodes, so remapping `Interact`, `Reload` or an
Animal/Soccer action keeps the graph correct. Saved Pawn graphs that still use
`On Key` are adapted to the matching semantic action; literal DOM-key behavior
remains only for legacy non-Pawn level graphs.

## Reusable behavior descriptor

Behavior is explicit and per instance. This is a representative armed
Character configuration:

```js
characterPawn: {
  playerId: null,
  possessed: false,

  behavior: {
    enabled: true,
    profile: "tactical",
    faction: "enemy",
    hostileFactions: ["player"],
    friendlyFactions: ["enemy"],
    squadId: "outpost-squad",
    squadIndex: 0,
    tag: "enemy",

    perception: {
      sightRange: 42,
      hearingRange: 32,
      memorySeconds: 5,
      fieldOfViewDeg: 125,
      requireLineOfSight: true
    },

    tactics: {
      attackRange: 38,
      preferredRange: 12,
      guardRadius: 55,
      coverBias: 0.76,
      flankBias: 0.72,
      accuracy: 0.7,
      burstMin: 2,
      burstMax: 5,
      burstPause: 0.6
    },

    fear: {
      enabled: true,
      threshold: 0.82,
      decay: 0.1
    },

    reactions: {
      onDamage: "cover",
      onWeaponFired: "investigate",
      onExplosion: "cover",
      onCharacterDied: "cover"
    },

    patrol: [
      {x: -14, y: 0, z: -18},
      {x: -4, y: 0, z: -27}
    ]
  }
}
```

`faction` identifies the actor. `hostileFactions` is the authoritative target
allow-list and may contain `"*"`; an actor does not attack a faction absent from
that list. `friendlyFactions` is preserved as relationship metadata, but the
current target filter is intentionally driven by `hostileFactions`.

`squadId` shares finite target memory among members, while `squadIndex` gives
otherwise equivalent members deterministic tactical variation. `tag` is the
optional Mission Director elimination tag. An empty squad ID disables shared
intel without disabling the actor.

### Profiles

Profiles provide a coherent baseline; every nested authored value still
overrides that baseline.

| Profile | Intended behavior |
| --- | --- |
| `aggressive` | Chases, closes range, uses longer bursts and keeps pressure. Fear is disabled by default. |
| `tactical` | Uses shorter bursts, flanking and collider-aware local cover. Reacts cautiously to heavy events. |
| `defensive` | Holds a tighter guard area, prefers cover and returns toward its authored origin. |
| `flee` | Avoids a hostile or remembered threat and does not use ranged attacks by default. |
| `civilian` | Remains passive until a sufficiently strong local event raises fear, then flees. |
| `reactive` | Does not proactively acquire a target while calm; investigates or counters after a configured stimulus. |

The reaction values accepted by each event are `attack`, `cover`, `flee`,
`investigate`, `freeze` and `ignore`. Weapon fire, explosions, damage and death
publish bounded stimuli containing position, radius, intensity, source Pawn and
faction. Hearing range and the event radius determine who notices them;
perception memory determines how long the response can retain its target.

Animals consume the same descriptor. A cat may use pounce at close range, a dog
may bark/chase, and a horse can rear or flee from damage or an explosion. A
generic Animal still supports patrol, guard, investigate and flee through its
normal movement controller. It only gains a firearm when an author explicitly
configures compatible combat; animal behavior does not invent one.

Natural Animal attack settings live under `behavior.animalAttack`: `enabled`,
`damage`, `range`, `cooldown`, `force` and `action`. The attack range is
independent from ranged `tactics.attackRange`; the selected species action must
start successfully before Damage Contract applies the hit.

### Behavior limits

The current system provides deterministic local steering, authored patrol
points, field-of-view/hearing checks, box/cylinder-aware line of sight, finite
squad memory and a bounded local cover planner. The planner evaluates ordinary
box colliders, chooses the protected face, approaches it through normal
Character movement and only then attaches the existing cover component. One
spatial blocker index is built per search, cover candidates are capped, and
quantized face/slot reservations prevent two actors choosing the same point. It
retries with backoff and rejects occupied, vertically irrelevant and Pawn-owned
colliders. Reservations are refreshed while owned and released immediately on
descriptor removal, possession/disposal, registry removal, ID reuse or Stop.
It does not provide:

- a baked navigation mesh or global path planner;
- automatic traversal links around arbitrary buildings;
- a tactical cover-point baking/editor tool;
- crowd avoidance or a full behavior-tree authoring UI.

On a level with complex obstacles, author reachable patrol points and ordinary
colliders. Treat `guardRadius` as a territorial leash, not a navigation area.

## Per-actor weapon and loadout

An armed Character should keep its actual weapon definition in `firstPerson`
and enable the Actor Combat facade:

```js
characterPawn: {
  firstPerson: {
    enabled: true,
    view: "third",
    allowViewToggle: false,
    hideOwnBody: false,
    weapon: {id: "primary", preset: "rifle"},
    weaponSocket: {
      bone: "",
      offset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1
    }
  },

  combat: {
    enabled: true,
    weapon: {preset: "rifle"}
  },

  inventory: {
    mode: "slots",
    weaponSlots: 7,
    packSize: 8,
    allowDrop: true,
    autoEquip: false
  },

  loadout: [
    {preset: "pistol"},
    {preset: "grenade"}
  ]
}
```

`firstPerson.weapon` is the live weapon-controller source. `combat.weapon` is
the facade/bootstrap value used when the controller must be attached lazily;
keep the two starting presets aligned in authored data. The initial weapon and
every loadout entry become that Pawn's inventory entries. Magazine, reserve,
reload, cycling and dropped-item state are not shared with another actor.
For AI loadouts keep `autoEquip: false`: adding later entries must not replace
the authored primary at spawn. If that primary and its reserve are exhausted,
Actor Combat performs a bounded search of that Pawn's inventory and prefers a
usable sidearm before more specialized entries. Player-controlled projects may
enable `autoEquip` deliberately when pickup behavior should replace the current
weapon.

Actor Behavior calls the facade's aim, fire and reload verbs. It does not apply
magic damage directly. The normal weapon cadence, spread, pellets, range,
headshot multiplier and shared hitscan resolver therefore remain authoritative.
An unpossessed actor gets a separate carried-world weapon visual. The runtime
uses a recognizable right-hand bone when available and a deterministic body
socket otherwise; tune `weaponSocket` offset, rotation and scale for an unusual
imported rig.

The same inventory attachment function is used whether the Character created
its weapon rig during Pawn construction or Actor Combat attached it lazily for
AI. Hydration is idempotent: resolving the facade again does not duplicate a
loadout or refill ammunition. Stop Preview and Pawn disposal synchronously
release the facade and its carried visual.

Dog chase state also has explicit ownership. Actor Behavior supplies an opaque
token when it starts a chase and releases only that token when AI is suspended,
the target disappears, the Pawn dies or the behavior descriptor is removed. An
author or player may replace the command with its own chase without the AI
later cancelling it.

## Shared damage contract

`owner.userData.damageable` stays a plain serializable record:

```js
owner.userData.damageable = {
  health: 100,
  maxHealth: 100,
  armor: 15,
  maxArmor: 30,
  armorAbsorb: 0.35,
  team: "enemy",
  pawnId: "outpost-enemy-1"
};
```

At runtime, Character/Animal vitals bind that record to the shared synchronous
Damage Contract without placing functions in scene data. A hit provides source
metadata such as `direction`, `point`, `origin`, `normal`,
`instigatorPawnId`, `weapon`, `headshot`, `explosion` and `force`. The returned
result reports requested damage, actual post-armour health damage, remaining
health/armour, `killed`, `dead` and whether death physics handled the fall.

Use the existing weapon, explosion and Logic damage paths when authoring. A
runtime extension may call the same boundary directly:

```js
const result = LK_RUNTIME_DAMAGE_CONTRACT.apply(targetObject, 24, {
  source: "hazard",
  direction: {x: 0, y: 0.2, z: -1},
  point: hitPoint,
  instigatorPawnId: "trap-controller",
  force: 30
});
```

Vitals emits `OnCharacterDamaged`, `OnCharacterHealed`, `OnCharacterDied` and
`OnCharacterRevived`. The names remain Character-prefixed for compatibility,
but Animal Pawns use the same lifecycle stream. While dead, the Pawn frame is
gated so movement, abilities, AI and weapons stop; death physics and an optional
respawn timer continue.

## Death physics configuration

Every Character and Animal template can author:

```js
vitals: {
  enabled: true,
  maxHealth: 100,
  maxArmor: 30,
  armor: 15,
  armorAbsorb: 0.35,
  respawnOnDeath: false,
  respawnDelay: 2.5,
  team: "enemy",

  deathPhysics: {
    enabled: true,
    mode: "auto",
    profile: "humanoid",
    blendTime: 0.14,
    mass: 72,
    impulseScale: 0.085,
    settleSeconds: 2.8,
    gravity: 18,
    damping: 0.985,
    constraintIterations: 6,
    radius: 0.075,
    boneMap: {}
  }
}
```

Modes:

- `enabled: false`: master switch; the authored mode remains stored but no
  death presentation is created.
- `auto`: use articulated death when enough semantic joints are found;
  otherwise use the whole-owner rigid fallback.
- `ragdoll`: request articulated death, while still falling back safely when
  the rig is insufficient.
- `rigid`: move and rotate the complete owner as one lightweight physical body.
- `animation`: play the configured `animation` action and hold that authored
  pose instead of simulating a fall.
- `none`: keep vitals/death events but disable the death presentation.

Profiles are `auto`, `humanoid` and `quadruped`. Auto selects quadruped for an
Animal Pawn and humanoid otherwise. The solver recognizes common rig and
procedural-placeholder names. For an unusual GLB, map semantic roles to exact
bone/node names:

```js
deathPhysics: {
  mode: "auto",
  profile: "humanoid",
  boneMap: {
    pelvis: "mixamorig:Hips",
    spine: "mixamorig:Spine2",
    head: "mixamorig:Head",
    upperArmL: "mixamorig:LeftArm",
    lowerArmL: "mixamorig:LeftForeArm",
    upperLegR: "mixamorig:RightUpLeg"
  }
}
```

Humanoid role keys are `pelvis`, `spine`, `head`, left/right `upperArm`,
`lowerArm`, `hand`, `upperLeg`, `lowerLeg` and `foot` (using the `L`/`R`
suffix). Quadruped roles add `chest`, `neck`, `tail`, and left/right
`upperFront`, `lowerFront`, `pawFront`, `upperRear`, `lowerRear` and `pawRear`.
Serialized `boneMap` values should be exact node/bone names; matching ignores
case and punctuation.

The articulated path snapshots the live death pose, pauses discovered animation
mixers, applies the hit impulse near the impact point and solves joint-length
constraints against the shared ground and box colliders. After
`settleSeconds`, the pose remains settled without continuing to spend solver
work. Revive, reset and disposal restore the captured transforms and mixer
speeds.

The upright Logic Element collider belongs to locomotion, not to the fallen
pose. It is therefore retired while articulated/rigid death presentation is
active (including its optional Cannon body), then aligned to the restored Pawn
and re-enabled with its exact previous state on revive or disposal.

This is a portable CPU/lightweight solver that behaves without an active Cannon
vehicle world. It is not full per-bone rigid-body physics: there are no
self-colliding capsules, authored angular joint limits, dynamic ragdoll-to-
ragdoll collisions or navmesh integration. Mesh-only GLBs and unrecognized rigs
remain supported through the whole-owner fallback rather than staying upright.

Ordinary non-Pawn damageable props can reuse the item system's short ballistic
body. If that optional body service is unavailable, the damage result remains
correct, but the prop cannot receive that presentation impulse.

## Compatibility and migration

- `enemyAi` remains a read-compatible descriptor. Legacy sight, hearing,
  memory, attack/preferred/guard range, flank strength, damage and patrol fields
  are normalized into Actor Behavior. When both blocks exist, `behavior` is the
  authoritative authored override.
- `GAME.systems.fpsEnemyAi`, the Outpost `normalizeAi` helper and its
  `createEnemyAi` entry remain compatibility aliases over the global Actor
  Behavior service. New levels should not depend on the Outpost namespace.
- A null/negative legacy Player ID does not opt a Pawn into AI. Add
  `behavior.enabled: true` explicitly.
- Existing `userData.damageable` numeric props remain valid. New damage sources
  should call the Damage Contract instead of mutating `health` first and trying
  to infer armour or a kill afterward.
- Input schema v15 migrates the old Character Reset-as-Jump binding, including
  per-device overrides. Vehicle Reset remains unchanged.
- Procedural Character/Animal placeholders and imported GLBs use the same
  death component. Bone mapping improves an imported result but is not required
  for the safe rigid fallback.

## Related modules

- `js/runtime/input/player-action-router.js`
- `js/runtime/combat/actor-combat.js`
- `js/runtime/ai/actor-cover-planner.js`
- `js/runtime/ai/actor-behavior.js`
- `js/runtime/combat/damage-contract.js`
- `js/runtime/physics/pawn-death-physics.js`
- `js/runtime/character-vitals.js`
- `js/runtime/fps-enemy-outpost-level-template.js`
- `js/logic/logic-templates-character.js`
- `js/logic/logic-templates-animal.js`

Focused runtime and template coverage belongs with these module boundaries; a
browser Play Preview remains the final check for imported rig bone naming,
weapon socket placement and complex authored collider layouts.
