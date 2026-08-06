# First Person Pawn

The first-person rig turns any generic Character Pawn into a shooter-style Pawn: eye camera,
mouse and stick look with pitch clamping, aim down sights, view bob, recoil and a configurable
hitscan weapon with magazine, reload and reserve ammo.

It is **additive**. A Character Pawn without a `firstPerson` block behaves exactly as before,
on the untouched third-person path. See [Character Movement](CHARACTER_MOVEMENT.md) for the
shared locomotion contract this builds on.

A Character that can switch from third to first person uses one full-body Pawn in both views.
The switch changes only the shared camera from shoulder to eye height; it does not instantiate
`first-person-view-pawn`, duplicate the AnimationMixer or load a second arms mesh. For a monolithic
SkinnedMesh, the eye camera moves horizontally just beyond the face and uses a safe near plane;
it never scales or hides the Head bone. The separate-arms presentation remains available only as an explicit
choice for a dedicated first-person-only project. Vehicle interior view follows the equivalent
camera-only rule on the existing Vehicle Pawn.

---

## Modules

| File | Owns |
| --- | --- |
| `js/runtime/first-person-controller.js` | View angles, eye transform, ADS, recoil, view bob, weapon state, hitscan, the damageable contract |
| `js/runtime/fps-hud.js` | Crosshair, hit marker, ammo, weapon, loadout, health/armour/stamina, radar, prompts, toasts, damage vignette |
| `js/runtime/fps-view-model.js` | The real weapon held by the Character, plus the optional classic **separate arms** presentation: ADS, sway, recoil, reload pose, muzzle flash |
| `js/runtime/character-abilities.js` | Traversal: crouch, slow walk, slide, vault, mantle, ladder and wall climb |
| `js/runtime/character-vitals.js` | Health, armour, stamina, regeneration, death and respawn |
| `js/runtime/item-system.js` | World pickups (`userData.item`) and the per-Pawn weapon inventory |
| `js/runtime/interaction-system.js` | The Use key: doors, ladders, carryables, delivery pads, buttons, climbable faces |
| `js/runtime/weapon-tracers.js` | Visible rounds: tracer streaks, impact flashes and bullet holes, from fixed pools |
| `js/runtime/inventory-ui.js` | The weapon wheel and the backpack panel |
| `js/logic/logic-nodes-fps.js` | Graph node pack: view, weapon, targets, events |
| `js/logic/logic-templates-fps.js` | `Template - Player Character (First Person)`, `Template - Shooting Target` |
| `js/runtime/fps-arena-level-template.js` | The **FPS Shooter Test** level |

`lot-king.js` owns the actual camera object; the controller only hands it a transform.

---

## Controls

| Action | Keyboard / Mouse | Gamepad |
| --- | --- | --- |
| Move | `WASD` / arrows | Left stick |
| Sprint | `Shift` | L3 |
| Jump | `Space` | A |
| Look | Mouse (pointer lock) | Right stick |
| Fire | Left Mouse | RT |
| Aim down sights | Right Mouse | LT |
| Reload | `R` | Y |
| Crouch (toggle) | `C` | B |
| Lean left / right | `Q` / `E` | LB / RB |
| Slide / roll | **double-tap `Alt`** — slide when running, roll when walking | double-tap RB |
| Walk slowly | `X` | — (analog stick) |
| Vault / mantle / grab a climbable face | `Space` facing the obstacle | A |
| Use — doors, ladders, carry, deliver, climb | `F` **tap** | X |
| Pick up item | `F` **hold** | X hold |
| Drop / throw weapon | `G` (tap = drop, hold = throw) | ◀ |
| Next weapon | `Z` or mouse wheel | ▶ |
| Select slot 1–7 | `1` … `7` | — |
| Weapon wheel / backpack | `I` tap / `I` hold | View |
| Use item from backpack | `T` | ▼ |
| Swap weapon shoulder | `V` | R3 |
| First / third person | `B` | R3 |

**Ctrl can never be bound.** It is stripped from every scheme, including one restored from an older
project, and rebinding cannot put it back. This
runs in a browser: `Ctrl+W` closes the tab, `Ctrl+T` opens one and `Alt` focuses the menu bar,
and none of them can be cancelled from script — the browser handles them above the page. Crouch
on `Ctrl` therefore means *crouch and walk forward closes the game*. Alt survives because it CAN be
cancelled — it only steals focus on its own, and the keyboard source suppresses that while the game
holds pointer lock. The source also refuses to latch a key that arrived as part of a modifier combo,
so no chord can leave an action stuck on after the browser swallows the keyup.

Fire, Aim and Reload are real input actions on the **Character** input context, rebindable in
Input Settings like any other. Mouse buttons travel through the keyboard scheme as synthetic
`Mouse0`/`Mouse1`/`Mouse2` codes, so they share the existing rebinding UI instead of needing a
parallel device type. They are unbound in the Vehicle context, so nothing that existed before
reacts to a click.

---

## How it plugs into the Character Pawn

`character-pawn-base.js` attaches the rig when the Pawn config carries a `firstPerson` block:

```js
pawn.firstPerson = cfg.firstPerson && window.LK_RUNTIME_FIRST_PERSON
  ? window.LK_RUNTIME_FIRST_PERSON.attach(GAME, pawn, cfg.firstPerson)
  : null;
```

`attach()` **composes** onto `beforeMovementStep`, `afterMovementStep`, `reset` and `dispose`
rather than replacing them, so a game mode that already installed its own hooks keeps working.

Ordering matters and is deliberate:

- **`beforeMovementStep`** applies stick look, ADS blending, reload timers and the fire
  cadence. In first person, ADS, or while firing it aligns the body with the aim; during normal
  third-person locomotion the hips follow the actual travel direction. Running *before* the
  shared movement controller keeps aim and movement in the same frame without forcing a running
  Character to point permanently at the crosshair.
- **`afterMovementStep`** decays recoil, advances view bob and blends FOV using the movement
  snapshot, so those effects match the distance actually travelled that frame.

The template uses the shared Character movement contract. The first-person rig temporarily owns
aim-facing only where the presentation requires it; the normal locomotion controller remains the
source of travel-facing in third person.

---

## Camera

`updateLogicPawnCameraOverride()` in `lot-king.js` checks for an active rig first and, when it
finds one, bypasses the follow-camera path entirely:

```js
if(pawn.firstPerson && pawn.firstPerson.enabled() && updateFirstPersonCameraOverride(dt, pawn)) return true;
```

The follow camera's free/arcade/cinematic blending would fight the rig's yaw and pitch, so it
is bypassed rather than reconfigured. The FPS branch still performs the same cursor and
pointer-lock bookkeeping `updateCamera` does.

Consequences, all intentional:

- Pointer lock is requested regardless of the vehicle camera mode.
- The mapped Character Camera Mode action (default `B` / `R3`) reports the destination view instead of cycling a vehicle mode the Pawn
  does not use.
- Mouse deltas go to `rig.applyLookDelta()` and never touch `camYaw`/`camPitch`, so switching
  back to a vehicle keeps its framing.
- With the default same-body presentation, the animated Character, Head bone, hands, held weapon,
  skeleton and mixer remain the same objects and transforms used in third person. Camera-only face
  clearance plus a `0.14 m` near plane prevents clipping/overdraw. Separately-authored rigid hair
  or helmet pieces may be hidden at eye height; cached visibility is restored on the TPS transition.

`autoEyeHeight` is enabled by default. The rig resolves the actual Head bone once and converts its
position to Pawn-local metres; `eyeBoneOffset` (default `0.08`) moves that pivot to eye level. The
result is stable rather than following every animated head bounce. `eyeHeight` remains the safe
minimum and becomes the exact manual value when automatic height is disabled.

The asset loader remains authoritative over procedural fallbacks. Once the real Main Mesh is
ready, its hidden placeholder parts are stamped as asset-suppressed and camera transitions cannot
restore them from an older visibility cache.

---

## Weapon

Configured under `firstPerson.weapon`, all values exposed in the inspector.

| Field | Meaning |
| --- | --- |
| `preset` | `rifle`, `marksman`, `shotgun`. Selecting one replaces the whole loadout. |
| `mode` | `auto`, `semi`, `burst` (`burstCount` shots per pull) |
| `damage`, `headshotMultiplier` | Per-hit damage; the multiplier applies to head hit zones |
| `fireRate` | Shots per second |
| `range` | Hitscan distance in metres |
| `magazine`, `ammoReserve`, `infiniteAmmo`, `reloadTime` | Ammo handling |
| `pellets` | Greater than 1 makes each shot fire several independent hitscans (shotgun) |
| `spreadHip`, `spreadAds`, `spreadMoveGain` | Cone spread; movement and being airborne widen it |
| `recoilPitch`, `recoilYaw`, `recoilRecovery` | Kick added to the view angles, then decayed |

Recoil is added to the **view angles** and decays, rather than being a separate camera offset.
That guarantees aim and crosshair can never disagree: where the reticle points is where the
shot goes.

The crosshair gap in the HUD tracks live recoil and ADS state, so the reticle stays honest
about where bullets can land.

---

## The damageable contract

Anything in the scene becomes shootable by carrying `userData.damageable`:

```js
object.userData.damageable = {health: 100, maxHealth: 100, team: 'enemy'};
```

A child mesh tagged `userData.damageableHitZone = 'head'` takes headshot damage. Objects
without the block are solid cover: they block the ray but take no damage.

The hitscan resolver is the only code that mutates health, so level-authored props and Logic
Element enemies stay consistent. `Make Object Damageable` registers it from a graph; the
`Template - Shooting Target` graph does exactly that on start.

---

## Node pack

**First Person** — `Get View Angles`, `Set View Angles`, `Add Look Input`, `Fire Weapon`,
`Reload Weapon`, `Set Aim Down Sights`, `Get Weapon State`, `Make Object Damageable`,
`Get Damageable State`, `Apply Damage`.

`Set Aim Down Sights` **latches**: the aim state is recomputed from player input every frame,
so a scripted aim is OR-ed with the Aim button and stays held until the node clears it.
Resetting the Pawn clears it too.

**First Person Events** — `On Weapon Fired`, `On Weapon Hit`, `On Target Down`,
`On Weapon Reloaded`, `On Weapon Dry Fire`.

Events are dispatched on the shared `lk-pawn-event` channel already routed into Logic Element
graphs, so they need no extra plumbing.

Basic shooting needs **no graph wiring at all** — fire, aim and reload are input actions read
by the runtime. The nodes exist for scoring, objectives, HUD and scripted sequences.

---

## FPS Shooter Test level

`New level` → template **FPS Shooter Test (First Person)**.

**Blackpine Urban Training Facility** — a dressed, fully editable environment of roughly 940
objects, laid out south (spawn) to north (long range) and filed into twelve outliner zones,
numbered in the order you walk through them:

The marked lanes are kept clear end to end: cover, containers and berms sit **between** or
**beside** the lanes, never across them, and the block house closes the north end of the range
rather than standing in the middle of it. A test walks each target's bullet path at chest
height and fails if anything obstructs it.

| Zone | Contents |
| --- | --- |
| `01 Terrain and Markings` | Dirt floor, concrete apron with a gravel shoulder, four lane strips and dividers, distance bands at 10/25/45/65 m, cracked patches, puddles, tyre tracks, oil and scorch stains |
| `02 Staging Bay` | Covered bay on pillars with a corrugated roof, six weapon locker banks, four prep benches with ammo crates and magazines, a loadout table, a lit briefing board, hanging lamps, conduit runs, camo netting, pallets and stacked spare crates |
| `03 Firing Line` | Four sandbag emplacements built bag by bag with rest planks, shooting mats, lane placards and brass litter, shell buckets, a range control desk |
| `04 CQB Village` | Two stacked shipping containers plus a third (corrugated sides, corner castings, end doors, lever bars, stencils), a walk-in two-room block house with window openings, a sandbagged doorway, an interior divider and a breach hole with spilled rubble, a wrecked car resting on one rim with its door hanging open, tyre stacks, oil drums, a burn barrel, cable spools, cover crates, jersey barriers |
| `05 Long Range` | Four earth berms with timber revetments, ten wooden target A-frames, hanging steel gongs, a roofed watchtower with railing, sandbag rest, spotting scope and legs |
| `06 Perimeter and Lighting` | Corrugated boundary wall on four sides with a concrete plinth and structural posts, razor wire, chain-link inner fence, four floodlight masts, warning signage, facility name panel |
| `07 Targets` | Twelve damageable targets and their concrete posts |
| `08 Practice Yard` | Carry-and-deliver crate, a swing door, a ladder, a vault rail and a 2.9 m hang ledge, all in sight of the spawn |
| `09 Traversal Course` | Vault, mantle, slide gap, climbable net, ladder, sliding door and a second carry task down the east wall |
| `10 Pickups and Interactables` | Weapons, medkits, armour and ammo as ordinary `item` contracts |
| `11 Characters` | The possessed first-person player |
| `12 Outside the Wire` | Pine treelines, a water tower, a radio mast with a beacon, outlying blocks and a ridge line — silhouettes only, no collision |

**Twelve damageable targets** from 10 m to 65 m, including two elevated ones only visible from
the watchtower. Health, respawn delay and points all scale with distance.

### Material classes

Every piece of dressing names a **material class** in the template's `MAT` table instead of
carrying a loose hex. A class is the whole surface identity in one place — colour, roughness,
metalness, which procedural surface it wears and at what world tile size, plus the footstep
material the Character Sound Set plays when a body stands on it:

```js
concreteFloor: material(COLOR.concrete, .93, .02, 'concrete', 6, 'concrete'),
containerRed:  material(COLOR.containerRed, .58, .42, 'metalCorrugated', 2.6, 'metal'),
sandbag:       material(COLOR.sandbag, .96, 0, 'sandbag', .6, 'sand'),
```

The surface entry becomes `props.surfaceTexture` on the entry, which
`js/engine/procedural-surfaces.js` turns into a generated albedo/normal/roughness set. Two
consequences worth knowing:

- **The colour still drives the read.** The generated albedo is neutral grain that multiplies
  the class colour, so editing an object's colour in the Inspector works exactly as before and
  only the grain comes from the surface.
- **Footsteps follow the material.** `surface` is derived from the class rather than typed per
  object, so standing on a container sounds like steel without anyone remembering to say so.

Corrugation, brick courses and plank joints live in the surface, not in geometry. That is what
let the containers drop 22 rib boxes each and the boundary wall drop 48, and it is why those
objects now read as ribbed metal from two metres rather than as stripes stuck on a flat side.

### Light, sky and grade

The level authors its own look rather than inheriting the editor default:

- `env.skyTime` `0.455` — about 16:55. The sun rakes **across** the range instead of standing
  over it, which is what gives every crate, berm and container a long shadow.
- `env.lighting` — a warmer, dimmer key (`daySun 1.62`) with ambient lift (`dayAmbient 0.58`)
  so the shaded sides stay readable at 65 m.
- `env.sunBloom` and `env.lensFlare` — restrained, `classic` mode, low chroma.
- `player.cam.fogDensity` `0.0115` and `player.cam.grade` — cool shadows, warm highlights,
  contrast `1.14`, saturation `0.94`.

**Fog and grade are camera values, not environment values.** `sky.js` copies the sky colour
into `scene.fog` every frame and `lot-king.js` drives the density from the camera config, so an
`env.fog` block with a colour and a near/far — which this template used to carry, as do a
couple of others — is never read by anything. The only fog a level can own is the density.

Volumetric clouds (`env.volClouds`) are deliberately **left off**: enabling them made the cloud
layer composite over the whole scene in the WebGL path used for verification, hiding the ground
and the walls. That is an engine-side issue, not a level one.

### Verticality and the character collider

`character-movement.js` used to resolve collision purely on the XZ plane, ignoring a box
unless the character was already above its top. A roof or a walkway deck therefore behaved as
a full-height wall at ground level — that is what originally shoved the spawn into the
perimeter wall — and nothing could ever be stood on, because `characterGroundHeight` was
called but implemented nowhere.

The controller is now height aware:

- **Passing under.** A box is ignored when the character's whole body clears its underside, so
  roofs, lintels and decks stop blocking the floor beneath them.
- **Standing on.** The ground solver returns the highest collidable surface at the character's
  XZ position, so decks, container roofs and platforms are walkable.
- **Stepping up.** Any surface within `stepHeight` (0.55 m by default) is climbed rather than
  blocked, which makes ordinary stair treads and kerbs work with no dedicated stair logic. The
  watchtower is reached by a normal flight of 0.29 m steps.

Three options control it, all on the movement config: `height` (1.8 m), `stepHeight` (0.55 m)
and `walkOnColliders` (on). Setting `walkOnColliders:false` restores the old flat/slope-only
behaviour for a level that expects it.

**Rotation is still ignored.** The box collider takes an object's *local* half-extents and
never reads `rotY`, so a container turned 90° looks right and collides sideways. Collidable
geometry must be authored on an axis — the level's container builder takes an `axis` parameter
rather than a rotation — and props that genuinely need an angle, like the wrecked car, keep
the rotation on non-colliding visuals and carry one hidden axis-aligned collision proxy sized
to the rotated footprint. Invisible entries do register colliders, which is what makes proxies
work.

### The weapon view model

The default is **not** a second arms Pawn. `js/runtime/fps-view-model.js` updates the real held
weapon attached to the full Character's hand while the camera moves between the rig's shoulder
and eye transforms. Switching view therefore does not create a second weapon, skeleton, mixer,
input owner, or Pawn.

An author can explicitly select `first-person-arms` for a traditional FPS-only project. Only in
that optional mode does the module build a separate procedural arms-and-weapon presentation in
front of the camera, with aim-down-sights, sway, walking bob, recoil, reload pose and muzzle
flash. The optional model is an ordinary scene object positioned from the rig's eye transform;
it carries `userData.editorOnly`, so it is never picked, exported, or hit by hitscan.

The optional arms model uses `depthTest:false` so its barrel cannot poke through a wall. This
special-case rendering is absent from the default same-body path.

### Lighting and collision budget

The facility shows more lit fixtures than it has lights. Point lights cost per fragment on
every material in the level, so only **five** are real — two of the four floodlight masts, the
inner pair of bay lamps, and the watchtower — while every other fixture is an unlit emissive
lens. That keeps the level near the four point lights the soccer stadium establishes as the
project norm. A test enforces the ceiling.

Collision is structural only: walls, containers, the block house, crates, drums, benches and
sandbags block; trim, stripes, signage text, ground decals and markings do not. Around 29% of
the entries are collidable, and a test asserts flat decoration never becomes collision.

The player and every target are ordinary Logic Elements. Duplicate them, move them, retune
them or replace their meshes like any other scene object; the environment lives in the level
template, the behaviour lives in the Pawn templates.

---

## Leaning out of cover

`Q` and `E` lean left and right. It is not a tilt effect: the **eye actually slides sideways**, which
is the part that lets you see past a corner, and the whole view rolls with it. In third person the
chest, head and shoulders follow, so the character visibly peeks rather than sidesteps. Both keys at
once is upright — the natural reading, and it saves a priority rule nobody would remember.

The lean is **stopped by whatever it runs into**: sliding the eye through a wall would let a player
see into rooms they are not standing in.

```js
firstPerson.lean = {enabled:true, offset:.42, angle:.26, speed:9, adsScale:1};
```

Aiming does not scale the lean down, because leaning while aiming is the entire point.

---

## Traversal abilities

`characterPawn.abilities` adds a GASP-shaped move set on top of walk/run/jump. It is one state
machine, shared by first and third person, and every move is a tuning block that can be turned
off on its own:

| Move | Trigger | What it does |
| --- | --- | --- |
| `crouch` | **Press** Crouch to go down, press again to stand (set `toggle:false` for hold) | Shrinks the collision height and the eye, and scales speed. **Sprinting stands the character up** rather than refusing to run. Standing up is refused while something is overhead — and sprinting cannot force it through a ceiling either. |
| `walk` | Hold Walk Slowly | A speed scale, not a separate gait, so every existing acceleration and animation curve keeps working. |
| `slide` | Double-tap Dodge above `minSpeed` | A timed slide that keeps momentum and ends crouched under an obstacle. |
| `roll` | Double-tap Dodge below `minSpeed` | The same gesture at a walk: a forward roll that ends standing. The tumble is applied to the body, never to the view. |
| `vault` | Jump facing an obstacle with clear floor beyond | Goes **over** it. |
| `mantle` | Jump facing an obstacle whose top is a standing surface | Pulls **up** onto it. |
| `climb` | Jump into a climbable face, or Use a ladder | Free vertical movement; reaching the top steps off onto the ledge. |
| `hang` | Falling past an edge within arm's reach | Catches it automatically. `A`/`D` shuffle along it, `W`/`Space` pull up, `Z` drop. |

**`F` is also the climb key.** It first asks the world what is in front (door, ladder, crate,
delivery pad); with nothing to use, the same key climbs whatever is there — a vault, a mantle, a
climbable face, or a ledge to hang from. A player never has to know which of the two a given wall
is.

Geometry queries go through the same arcade box colliders the movement controller resolves
against, so an obstacle is vaultable exactly when it is solid. There is no second collision
world to keep in sync. While a vault, mantle or climb plays, the module drives `owner.position`
directly and tells the Pawn to skip ordinary locomotion for that frame.

A face becomes climbable by carrying `userData.interact = {type:'climb'}` (or by setting
`climbable` on its collider). A ladder is `{type:'ladder'}` and is mounted with the Use key.

---

## Telescopic sights

A scope is a property of the **weapon**, not of the HUD: the rig owns the magnification and the
field of view it implies, and the overlay only draws what the rig reports. A HUD that applied its
own zoom would be lying about where the bullet goes.

```js
weapon.scope = {
  enabled:true,
  magnifications:[4, 8, 12],   // mouse wheel cycles them while scoped
  baseFov:70,                  // field of view at 1x; 70 / 8 is a real 8x picture
  lens:.82,                    // fraction of the frame the glass covers
  distortion:.6,               // edge curvature and chromatic fringe
  vignette:.72,
};
```

The `marksman` preset ships with one. Scoped means *the eye is against the glass*: armed, aiming
past 82%, first person, not reloading — third person never scopes, because there is no eye behind
the weapon. Look sensitivity divides by the magnification (normalized to 4x) so the same mouse
movement sweeps the same angle of the world at every setting, and the weapon model steps out of
the way once the sight is up.

The sight picture is four stacked CSS layers, so it costs no render target: the opaque surround
with the lens cut out, the glass (edge darkening plus a blue/amber fringe that reads as
curvature), the ocular housing, and a mil-dot reticle. The crosshair, radar and prompts stand
down while it is up.

---

## Vitals, and the fact that the player is shootable

`characterPawn.vitals` gives the Pawn health, armour, optional stamina, regeneration after a
delay, death and respawn. It mirrors its health onto `owner.userData.damageable`, the **same**
contract the hitscan resolver writes for a target board — so the player is damaged by exactly
the code that damages everything else, and armour rules are applied in one place.

Medkits and armour plates are ordinary pickups that call into it. So is the `Heal Character`
node.

---

## Items: weapons you can drop, and everything else you can pick up

An object in the scene **is** an item when it carries a descriptor:

```js
object.userData.item = {kind:'health', amount:50, respawn:25};
```

| Kind | Effect |
| --- | --- |
| `weapon` | Goes into the Pawn inventory and can be dropped again. `weapon:{preset:'shotgun'}` or full stats. |
| `health` | Heals. Refuses itself at full health, so a medkit is not wasted. |
| `armor` | Adds armour. |
| `ammo` | Refills the reserve of the weapon in hand. |
| `custom` | Fires `On Item Picked Up` and lets a graph decide. |

Because the contract lives on the object rather than on the geometry, swapping the primitive for
an imported GLB or FBX keeps the pickup working. Nothing about it is special-cased by shape.

### Seven roles, not a pile of weapons

A slot is a **role**, not a position, so `3` is always the primary weapon whatever order things were
picked up in:

| Key | Role | Accepts |
| --- | --- | --- |
| `1` | Fists | `unarmed` — always present, never runs out, never reloads |
| `2` | Sidearm | light firearms (pistol, SMG) |
| `3` | Primary | heavy firearms (rifle, shotgun, marksman) |
| `4` | Melee | knife, bat — hitscan at arm's length, costs nothing |
| `5` | Bonus | a second heavy or light firearm |
| `6` | Flashbang | thrown |
| `7` | Grenade | thrown |

A pickup takes the first **empty** role it fits, so a second rifle lands in the bonus slot instead
of throwing away the one already carried; only when every candidate is full does it replace one, and
the weapon that leaves is spawned back into the level.

`weapon.kind` is the one field that changes what pulling the trigger means:

| Kind | Trigger |
| --- | --- |
| `firearm` | hitscan at range, costs a round |
| `melee` | hitscan at arm's length, costs nothing, swings on a cooldown |
| `thrown` | leaves the hand as a real object and costs one from reserve |
| `unarmed` | melee with no model in hand |

A thrown weapon is handed to the item system as an ordinary body with a fuse: it flies, bounces and
settles like anything else, and when its time is up it damages everything inside its radius with
distance falloff and throws whatever has a body outward. A grenade that bounced back at you is
exactly as dangerous as one that did not.

### The wheel and the backpack

`I` tapped opens the **weapon wheel**, `I` held opens the **backpack** — the same tap-versus-hold
rule the Use key follows, so a player learns it once.

The wheel is **steered with the mouse without releasing pointer lock**. That is the whole reason it
is a wheel rather than a menu: you flick toward a weapon and the game never stops being a game.
Highlighting equips **live** rather than on a confirm press, because a wheel that needs a second
press is slower than the number key it was meant to replace. The number keys keep working
throughout, so the wheel is a convenience and never the only way in.

An empty role still shows in the wheel, so slot 5 is in the same place whether or not anything is in
it and the layout never reflows under the pointer.

The backpack lists what `backpack` mode is storing. In the other two inventory modes there is
nothing to store, so it opens empty and says so.

### The inventory is a project setting

The SHAPE of the inventory is authored, not hard-coded, so one runtime serves three kinds of game:

```js
characterPawn.inventory = {
  mode:'slots',      // 'none' | 'slots' | 'backpack'
  weaponSlots:3,
  packSize:12,
  allowDrop:true,
  autoEquip:true,
};
```

| Mode | Behaviour |
| --- | --- |
| `none` | Exactly one weapon. A pickup **replaces** what is in hand and consumables are used where they lie. Arena shooter. |
| `slots` | N weapon slots cycled with `Q`; consumables still used on pickup. Military shooter. |
| `backpack` | Slots **plus a pack that stores** consumables for later instead of spending them on the floor, used with `T`. Survival / RPG. |

Each slot parks its own magazine and reserve while another weapon is equipped, so a half-empty
magazine survives a swap. A full loadout swaps rather than refusing a pickup, and the weapon that
leaves is spawned back into the level rather than destroyed. `allowDrop:false` makes the loadout
fixed.

**One key, two verbs, told apart by how long it is held.** `F` **tapped** uses whatever is in
front — a door, a ladder, a crate to lift and carry, a ledge to climb. `F` **held** fills a ring
around the key and *takes* the item: a weapon into the inventory, a medkit into health or into the
pack. The ring is driven by the Pawn's own hold timer, so what fills on screen and what fires the
pickup are one number rather than two that drift apart.

With nothing takeable in front, `F` acts on press — a door never waits for a timer it does not
need. `carryable:false` on an item descriptor makes it pick-up-only. `G` drops the weapon in hand:
a tap places it at your feet, holding it winds up a throw.

---

## Interactions: one key, one contract

An object becomes interactive by carrying `userData.interact = {type, ...}`:

| Type | Behaviour |
| --- | --- |
| `door` | Swings or slides open and closed, and moves its collider with it. `autoClose` closes it again after N seconds. |
| `ladder` | Mounts the climb ability and rides it to the top. |
| `carry` | Lifted and held in front of the character; its collider is disabled while carried. |
| `dropZone` | Accepts a carried object and reports what was delivered. `accepts` filters it. |
| `button` | A one-shot or toggling switch that fires a named event into a graph. |
| `climb` | Marks a face as climbable. Never shows a prompt — the abilities module consumes it. |

Focus resolution is shared by the HUD prompt and by the verb, so what the prompt says is exactly
what the key does. A look ray finds what is under the crosshair first; proximity is the fallback,
which is what makes third person feel the same as first person.

---

## First person, third person, and your own legs

The mapped Character Camera Mode action (default `B` / `R3`) toggles the view
(`firstPerson.allowViewToggle`), and **the same rig owns the camera in both**.

Third person is *not* the generic vehicle follow camera with the rig switched off. It is the
rig's own over-the-shoulder camera: same yaw and pitch, same recoil, same crosshair, same weapon,
same hitscan down the centre of the screen, same Use and Pick Up prompts. The only thing that
changes is the transform the rig hands to `lot-king.js` — the eye, or a point pulled back along
the view direction and offset to the right shoulder, with a short wall check that pulls the
camera in rather than letting it clip through geometry.

Aiming pulls the camera in (`distanceAds`, `shoulderAds`) instead of only narrowing the FOV,
which is what makes the reticle usable at range.

```js
firstPerson.thirdPerson = {
  distance:3.3, distanceAds:1.9,   // metres behind the pivot
  height:1.5,                      // pivot height above the feet
  shoulder:.62, shoulderAds:.48,   // lateral offset, positive is right
  fov:68, fovAds:52,
  collisionRadius:.34,             // clearance kept from walls
};
```

Set `firstPerson.view = 'third'` to start behind the shoulder. Everything else is identical, so a
project can ship a third-person shooter from the same template without touching a node.

By default the weapon is drawn once: it is the same world weapon carried by the same full Character
in both views. It takes its **position** from the right hand bone and its **orientation** from the
view angles. Parenting it outright to the bone is a trap — the grip axis of a hand bone is whatever
the rig author decided, so a fixed local rotation points the barrel backwards for every rig but
one, and the bone's scale is inherited. The socket is authorable when auto-detection is wrong:

```js
firstPerson.weaponSocket = {
  bone:'',                 // empty = find a right hand; a name wins outright
  offset:[0, 0, 0],        // nudge, applied in the weapon's own space
  rotation:[0, 0, 0],      // radians, on top of the aim orientation
  scale:1,
  showHelper:false,        // three coloured axes at the socket, to place it by eye
};
```

First-person presentation has two authorable modes:

The procedural body has real **elbows**: each arm is shoulder → upper arm → elbow → forearm → hand.
With a two-handed weapon the support arm is **solved**, not posed: the view model reports where the
foregrip actually is and a two-bone IK pass aims the shoulder and folds the elbow so the hand lands
on it — the same point a rigged GLB would attach its hand to. Angles alone get close and never quite
arrive. A one-handed weapon skips it entirely and the off arm keeps swinging with the run.
Without them the arm is one rigid bar, and no amount of shoulder posing stops a character holding a
rifle from reading as a T-pose — real arms bend. A project saved before elbows existed simply has no
node with those ids, and an absent part is skipped, so those arms stay straight and everything else
bends.

- `viewPawn.kind:'none'` (default) — no separate Pawn is created. The eye camera, animated body
  and held world weapon all belong to the same Character used in third person; camera clearance
  keeps the lens beyond the face without modifying any skeleton bone.
- `viewPawn.kind:'first-person-arms'` (optional) — enables the classic separate arms visual for a
  dedicated FPS presentation. `showLegs:false` hides the world body; `showLegs:true` retains it
  below the head-and-shoulder cull.

Legacy engine FPS levels that still contain the old default arms configuration are migrated once
to `kind:'none'`. A later explicit author selection of `first-person-arms` is preserved.

---

## Where the audio is edited

**Editor toolbar → `👣 Sounds`** (also under `Tools`).

Three tabs:

| Tab | What is in it |
| --- | --- |
| **Footsteps** | Per-surface recipes (concrete, tile, wood, metal, gravel, dirt, grass, sand, snow, water, carpet), the walk and run stride lengths, and the run / walk / crouch volume scales. |
| **Weapons** | Per weapon class (rifle, marksman, shotgun, pistol, smg): shot, tail, action, dry fire, magazine out / in, casing. |
| **Body** | Jump, land, breathing. |

Every slot is a small synthesis recipe with volume, pitch and pitch randomness, plus an optional
`src` pointing at a sample — the sample wins when it loads, and an empty or broken path falls back
to the recipe rather than to silence. `▶` auditions one slot through the same path the game uses,
and edits are audible **live** in Play Preview.

Every row has two buttons: `▶` auditions the slot once, and `⟳` puts it on a **loop** so the sound
can be tuned by ear while the sliders move. Exactly one loop runs at a time — two overlapping
loops tell you nothing about either.

Sets live in a shared library and are assigned at two levels:

- the **level** records a default (`characterSoundSetId`), bound automatically when a set is opened
  or saved in the designer;
- a **Pawn** can name its own (`characterPawn.soundSet = '<id>'`), the way a vehicle names its
  engine set. A guard, a civilian and the player can walk on the same floor and sound like three
  different people. Empty falls back to the level's set, so a project that only wants one never has
  to think about it.

If the footsteps are still too loud for your taste, the single number to move is
*Footsteps → Volume* (shipped at `0.34`).

---

## The body knows it is holding a weapon

Carrying is an **upper-body pose laid on top of whatever the legs are doing**, not a separate
animation state. The locomotion pass writes the frame's arm swing first and the weapon pose blends
over it, so a character running with a rifle still moves its arms instead of freezing into a
statue. Aiming tightens the pose onto the sight line and follows the view pitch, which is what
makes "aiming" readable from outside.

`pawn.weaponPose()` is the signal: `{carry, aim, pitch, twoHanded, firing, reloading}`. A sidearm
is held in one hand, everything else is shouldered. The procedural placeholder body consumes it
directly; a rigged character consumes it through the animation slots.

Firing and reloading are dispatched as ordinary **actions**, exactly like the Character and Soccer
packs: bind a clip to the `fire` or `reload` animation slot and the real animation replaces the
procedural pose with no code change.

The third-person weapon rides the right hand — and that node no longer has to be a *bone*. The
procedural body has no skeleton at all, only named joints, and requiring `isBone` was why the
weapon hung off the hip and ignored the arm swing on every character without an imported rig.

---

## Visible rounds

A hitscan resolves the whole shot in one frame: the bullet has arrived before anything is drawn.
That is right for gameplay and wrong for the eye, so the round is drawn separately — and the module
that draws it knows it is cosmetic. The hit was decided before the event it listens to was emitted,
so nothing there can change where a bullet lands.

**What a tracer looks like is the calibre**, so it is weapon data:

```js
weapon.tracer = {
  enabled:true,
  speed:280,        // metres per second the streak travels toward the impact
  length:1.8,       // how long the streak is
  width:.02,
  color:0xffd9a0,   // numeric, like every other colour in the store
  everyNth:1,       // 3 is the classic "one round in three" ratio
  fade:.06,         // seconds the impact flash lingers
  impact:true,
};
```

Defaults are derived from damage, so a custom weapon looks sane with nothing authored: an SMG round
is a thin fast streak, a marksman round is long and slow enough to follow.

A hit also leaves a **bullet hole**, capped by its own fixed pool of 64 that recycles oldest-first,
so a long firefight replaces holes rather than adding to them. Holes need the surface normal to lie
flat, which is why the hitscan reports one — orienting from the shot direction puts the hole
visibly askew on anything not hit dead on. A hit on something with a health pool leaves no hole: a
body is not masonry.

Everything here runs on the game's **time scale**, so a bullet slows down with the world during a
slow-motion moment. A round at full speed through the one moment you slowed down to look at it is
the opposite of the point.

**The cost is fixed, not growing.** The pool is allocated once and never grows — the oldest streak
is recycled when it is full, so a minute of sustained automatic fire costs exactly what the first
shot did. Geometry is shared by every streak and materials are cached per colour, so five weapons
hold five materials rather than five hundred. A missed shot still draws: the trace reports the point
the round *would* have reached, not only the points it hit.

---

## Things that fall

Dropped, thrown and shot items are simulated as a small ballistic body with real contacts: one
sphere against the arcade box colliders, resolved on the axis of least penetration, then put to
sleep once it is too slow to bounce or slide. It is not a rigid-body solver and does not pretend to
be — it is enough for *a dropped rifle slides off a crate and a thrown medkit bounces off a wall*,
which is the behaviour a level actually shows, and it costs nothing next to a physics world.

**Mass is the dial.** Restitution is derived from it unless the item overrides it, so light things
bounce and skitter while heavy things land and stay. Shooting an item pushes it, with the impulse
divided by mass — the same round that sends a can flying barely moves a crate.

```js
object.userData.item = {kind:'ammo', mass:.6, bounce:null, radius3d:.18};
```

**It is not only pickups.** A level crate carries an `interact` contract and no `item` one, and a
shot target carries neither, but all three are objects with mass that should fall. Physical
properties are resolved from whichever contract an object happens to have, so one body serves them
all — and an object with none of them is static level geometry and never moves, which is what stops
the world falling apart the first time someone shoots a wall.

Releasing a carried object **lets go** rather than placing it: it is handed to the same body and
falls, bounces and settles like anything else thrown. A body that owns a collider takes it along, or
the world keeps blocking where the object used to be.

---

## Pre-benchmark warm-up

Weapon models and pickup visuals are built the first time they are needed, which is mid-play — on
a pickup, a drop or a weapon swap. Compiling those shader programs and uploading their geometry
at that moment is a visible hitch, and the benchmark's scene snapshot never sees them because
they do not exist yet.

A warm-up hook (`GAME.hooks.warmup`, the same list the exhaust flame cones use) therefore builds
one of every weapon profile in both the first-person and world variants, one visual of every
pickup kind, and the HUD's DOM and radar canvas. They are added to the scene with
`frustumCulled = false` so they join the render list wherever they sit — the point is to compile
the programs and upload the buffers, not to draw pixels — the benchmark renders one frame, and
everything is disposed again before the FPS sample. The stage reports at 63%.

---

## Known limits

- **The arms are procedural.** Hands, forearms and sleeves are boxes and cylinders welded to the
  weapon's grip and foregrip. They read correctly and they animate with the weapon, but a rigged
  first-person arms mesh would look better.
- **No tracer or impact decals.** Muzzle flash exists; bullet impacts have no visual mark.
- **Weapon audio lives in the Character Sound Set**, not here: the rig emits the events and
  `js/runtime/character-audio.js` turns them into sound, procedurally by default. Shot, tail,
  action, casing, dry fire and reload are editable in the Character Sound Designer.
- **Thrown items use a simple arc**, not the physics world: they fall, land and stop. They do not
  bounce off walls.
- **Carried objects pass through geometry.** The collider is disabled while an object is held, so
  a crate can be walked through a wall.
- **Traversal is a position tween**, not a root-motion animation. It reads correctly and never
  fights the collision solver, but the character does not physically reach for the ledge unless a
  `vault` / `mantle` / `climb` animation slot is bound.
- **The radar draws colliders, not meshes.** Anything without a collider is invisible on it.
- **The third-person weapon takes its POSITION from the hand and its ORIENTATION from the view.**
  Parenting it outright to the hand bone is a trap — the grip axis of a hand bone is whatever the
  rig author decided, so a fixed local rotation points the barrel backwards for every rig but one,
  and the bone's scale is inherited. Taking only the position means the weapon follows the
  animation and still aims correctly on any rig, but the character's arms do not physically point
  at it. An aim-offset pose layer would close the gap.
- **The scope has no real barrel distortion.** The curvature is a CSS gradient and an inset
  chromatic ring, not a lens shader, so straight lines stay straight through the glass.
- **The view model ignores depth.** It draws over the world to avoid clipping into walls,
  rather than rendering in a dedicated pass.
- **Targets are hidden on death**, not animated or destroyed. The respawn graph is a
  deliberately simple starting point.
- **Multiplayer split-screen** routes through the same override, but only Player 1's pointer
  lock is meaningful on a single mouse.
