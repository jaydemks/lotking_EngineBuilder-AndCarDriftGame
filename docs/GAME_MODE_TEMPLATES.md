# Editable game-mode templates

The four game-mode starters below are ordinary editor-authored scenes. Their
geometry, Pawns, Logic Elements, objective lists, physics values and placeholder
visuals can be selected, duplicated, replaced or removed. They use the same
runtime modules in Play Preview and `gameplay.html`; the playable ZIP discovers
those modules directly from the gameplay shell.

Starting from **Empty** remains supported. Authors can place the same Pawn,
Mission Director and gameplay Logic Elements individually without creating one
of these templates.

## Snowboarding Objective Run

Template id: `snowboarding-objective-run`

- Editable segmented snow slope, gates, jumps, forest and finish apron.
- Opt-in `snowboardPhysics` on a Character Pawn: downhill acceleration, maximum
  speed, carving, brake, ride drag, air drag and trick spin are exposed values.
- Air time and spin accumulate while airborne. A successful landing reports
  score to the shared Mission Director and emits `OnSnowboardLanded`.
- Sequential gates, a time limit and an optional trick-score objective.
- Real cloud settings and gameplay fog are stored with the level.

The board and rider are placeholders. A compatible user GLB or animation set
can replace the visual without moving authority away from the Pawn controller.

## Cat Neighborhood Adventure

Template id: `cat-neighborhood-adventure`

- Uses the reusable Cat Animal Pawn, including stealth, physical pounce,
  climb/mantle, ledge balance and fall recovery.
- Two independently editable mouse chase/collect Logic Elements.
- Dog patrol/alert, moving traffic hazards, a friendly stop and a family reward
  are separate Logic Elements with exposed radius and movement values.
- Those elements report `collect`, `custom` and `avoid` events to the shared
  mission instead of hiding progress in a private level script.
- Houses, streets, trees, props and every gameplay placeholder are ordinary
  scene entries. The level uses separated surface heights to avoid z-fighting.

## Jungle Car Escape

Template id: `jungle-car-escape`

- Editable island, ocean, jungle vegetation, dirt route, hazards, bridge and
  extraction beach.
- Keeps the native `player_car` race/drift implementation and its existing
  physics and authoring surface unchanged.
- Timed sequential route objectives plus an optional no-wreck condition.
- Authored rain, volumetric cloud and camera-fog settings run in Play Preview
  and export.

## FPS Enemy Outpost

Template id: `fps-enemy-outpost`

- Extends the existing editable FPS arena and first-person player systems.
- Four ordinary `Template - AI Character` Logic Elements retain replaceable
  rigged GLBs, Motion Sets and per-instance configuration. They can be copied
  into another level without the Outpost template script owning their AI.
- Every enemy owns a separate weapon controller, magazine/reserve state,
  inventory and loadout. The shipped squad starts with rifle, SMG, marksman and
  shotgun presets and fires through the same Actor Combat and Damage Contract
  used by a player Character.
- Each enemy explicitly selects Tactical or Defensive behavior and exposes
  faction/hostility, squad ID, sight, hearing, memory, attack/preferred/guard
  range, cover/flank bias, patrol and event reactions. Clearing Player ID alone
  does not enable AI.
- The squad patrols, shares finite target memory, checks line of sight, manages
  engagement distance, searches ordinary world colliders for a protected local
  cover face, approaches before attaching and reacts to damage, shots,
  explosions and squad deaths. A depleted primary can fall back to that enemy's
  own usable sidearm without touching another actor's inventory.
- Vitals, armour and `vitals.deathPhysics` are per Character. A lethal shared
  damage result drives humanoid GLB/placeholder death physics, then reports the
  enemy tag to the Mission Director.
- Mission flow requires clearing the squad and reaching extraction, with a
  player-down constraint.

The current AI uses authored patrol points, local steering, collider line of
sight and a bounded local collider cover planner driving the existing cover
component. A general baked navmesh, global path planner and dedicated
cover-authoring tool remain separate roadmap items; this lightweight squad
layer does not claim those systems.

`enemyAi` remains serialized as a compatibility alias for older projects and
plugins, but the global runtime prefers the normalized `behavior` descriptor
when both exist. Author new reusable actors through `behavior`, `combat`,
`firstPerson`, `inventory`, `loadout` and `vitals`; see
`docs/ACTOR_CONTROL_AI_AND_DEATH.md`.

## Verification

- `tests/game-mode-level-templates.test.js` covers deterministic construction,
  editable entries, missions, climate settings and the live AI/snowboard loops.
- `tests/aaaa-integration.test.js` checks editor, lazy loader, gameplay and
  playable-export script parity.
- `tests/browser/aaaa-templates.spec.js` confirms discovery and construction in
  the real Chromium editor shell.
