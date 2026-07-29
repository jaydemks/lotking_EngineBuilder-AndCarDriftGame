# Lot King Browser-Native 3D Engine Runtime Modules

This document maps the current runtime and runtime-adjacent modules. It is meant to stay version-neutral; release-specific details belong in `docs/releases/` and active `RELEASE_NOTES_v*.md` files.

- `js/runtime/p2p-session.js`
  Browser-only WebRTC DataChannel transport shared by editor preview and gameplay. It owns temporary offer/answer codes, peer lifecycle, DTLS session handoff, bounded chunk reassembly and outgoing backpressure for large messages.

- `js/plugins/p2p-collaboration-plugin.js`
  Default-enabled networking plugin and Session Studio. It adds peer presence, single-authority coworking transforms, explicit edit-control transfer and reviewed portable LKEP snapshot exchange.

- `js/logic/logic-nodes-network.js`
  Network Logic Element node pack: message receive/send, connection state, Session Studio and disconnect. Messages are bridged through the controlled `network` service rather than exposing raw peer connections to graphs.

The gameplay runtime still composes through `js/lot-king.js`, but the project now has separate HTML entrypoints for landing/menu, gameplay, and editor. Most systems live in focused modules that register `window.LK_RUNTIME_*` factories. The editor also reuses some runtime modules, especially input, audio/HUD, and floating-window helpers.

## HTML Entrypoints

- `index.html`
  Landing/menu shell. Owns the main menu, loading-to-role-music transition, mute control, project signature, and embedded gameplay frame transitions.

- `gameplay.html`
  Gameplay runtime page. Loads the runtime, HUD, settings, radio, audio, scene store, track catalog, and game flow without loading editor modules.

- `engine_editor.html`
  Standalone editor page. Loads the runtime/editor DOM and editor module stack required by editor preview, HUD editing, Sound Designer, asset management, viewport tools, Cinema Studio, project workspace selection, and project export. Its direct script order must stay aligned with `js/editor/loader.js`.

- `drift-parking-lot.html`
  Compatibility redirect to `index.html`.

## Composition Root

- `js/lot-king.js`
  Creates `window.LOT_KING`, owns the main runtime composition, initializes Three.js, creates module instances, applies projects/levels, wires the editor bridge, runs the frame loop, and keeps fallback behavior for critical paths. It also exposes the player bridge used by editor save/load: visible heading, runtime heading conversion, visual base rotation, and `syncSpawnFromVisibleTransform()`.

## Rendering Runtime Dependency

Lighting, shadow and flare authoring is documented in `docs/RENDERING_LIGHTING_AND_SHADOWS.md`. `settings-menu.js` owns project/player exposure and shadow profiles; `sky.js` owns the day/night light balance and occlusion-aware optical flare. Both configurations persist through `scene-store.js`.

- `js/vendor/three-r185-compat.entry.js`
  Single source for the browser rendering bundle. It imports the pinned `three@0.185.1` core and every required `examples/jsm` addon from the same package, checks `THREE.REVISION === "185"` and exposes the compatibility namespace used by the existing classic modules.

- `js/runtime/rendering-backend.js`
  Central GPU capability and renderer registry. It owns the Auto/WebGPU/WebGL preference, asynchronous adapter probing, effective-backend diagnostics, serialized r185-safe pipeline preparation, live renderer counters, session-only render-scale overrides and creation/telemetry of WebGL fallback and auxiliary editor renderers.

- `js/runtime/cloth-system.js`
  Renderer-independent Character garment component. It discovers separated skinned cloth meshes, evaluates vertex-color or painted pin masks, follows the animated skeleton, solves structural constraints, wind/gravity and bone-sphere collisions, and exposes a portable CPU backend shared by WebGL, Safari, Pawn Studio, Play Preview and export. The schema keeps the future Three.js WebGPU compute backend behind an explicit parity boundary.

- `vendor/three-r185-compat.min.js`
  Generated local IIFE loaded by editor, gameplay and the standalone test editor. Rebuild it with `npm run build:three`; `npm run verify:three` rejects mixed revisions, old r128 URLs and removed color/shadow APIs.

- `vendor/cannon-0.6.2.min.js`, `vendor/jszip-3.10.1.min.js`, `vendor/helvetiker_regular.typeface.json`
  Pinned local supporting assets. Cannon preserves the existing physics behavior, JSZip keeps editor exports independent from a CDN, and the local font supports TextGeometry. Generated playable ZIPs include the runtime files plus `vendor/THIRD_PARTY_LICENSES.md`.

## Assets, Loading, and Session Flow

- `js/runtime/project-workspace.js`
  Owns browser, linked-file and folder workspace selection. The hosted Author DEMO is migrated into a private writable browser workspace backed by origin-scoped LocalStorage and IndexedDB; optional folder mirroring never grants the static site or another visitor access to that data. Legacy read-only DEMO state is upgraded automatically, while shared Author DEMO publishing remains restricted to the local installation.

- `js/editor/storage-manager.js`
  Provides the Editor Settings inventory and Cleanup Assistant for Lot King-owned LocalStorage, SessionStorage, IndexedDB stores, Cache Storage and same-origin service workers. It derives active/catalogued/review states from the real project and level indexes, reports available embedded save dates, explains schema-version suffixes, reports asset-blob discrepancies, supports LocalStorage backup/restore and inventory reports, and applies stronger confirmation rules to destructive project, level and asset operations. Normal HTTP cache remains under browser site-data controls.

- `js/runtime/assets.js`
  Central asset directories, path builders, local `file://` detection, and shared asset constants.

- `js/runtime/loading-flow.js`
  Loading progress UI, weighted loading stages, menu busy state, load-failure UI, and final loading messages.

- `js/runtime/runtime-loader.js`
  Runtime asset loading, local model reports, saved-project apply step, gameplay effect warmup and orchestration of the visible pre-benchmark before editor/game session entry.

- `js/runtime/pre-benchmark.js`
  Reversible scene preparation presented behind a fully opaque progress surface before the editor and every Play/Simulate session. It exercises hidden renderables, existing light/color states, authored shadows, physics and registered system hooks; uploads authored GPU textures; warms controlled camera orientations; compiles the current Three.js scene through the renderer backend's serialized r185-safe queue; measures sustained rendered frames; and requests the conservative video profile below 25 FPS. All temporary scene and camera mutations are restored before control returns.

- `js/runtime/session-flow.js`
  Gameplay/editor session state for launched tracks, editor preview, pending loads, selected project, and loaded-level flags.

- `js/runtime/game-flow.js`
  Track launch, editor preview/simulate launch, unload/back-to-menu behavior, HUD visibility, session transitions, menu-presentation profile ownership, pre-benchmark gating, play-state orchestration, and cleanup of session-only camera overrides. Browser gameplay, Play Preview and playable exports use the same flow.

- Runtime scene/cinema camera override
  `lot-king.js` applies the exclusive active Scene Camera for non-Pawn levels and evaluates Cinema Studio Movie Track camera cuts after the normal Player Camera update, ensuring the selected scene/timeline camera owns the final Player 1 render. Logic services dispatch the same start/stop contract to editor preview and standalone gameplay.

- `js/engine/scene-store.js`
  In addition to scene persistence and factories, owns versioned GLB `meshEdits`, fitted Logic Element asset loading and safe `SkeletonUtils` cloning. Runtime-only/circular `userData` is sanitized before Three.js clone/copy so collider references cannot break editor reconstruction.

- `js/runtime/track-catalog.js`
  Available track list, current track state, level-select card rendering, and runtime track catalog updates from saved levels.

## World and Physics

- `js/runtime/world-state.js`
  Editor entity registry, deterministic world seed, static collider data/signatures including circular-volume height, cone state, world entity bookkeeping, and lightweight car collision helpers.

- `js/runtime/world-generation.js`
  Default parking-lot track factory: ground, walls, props, parked cars, cones, light poles, and track-owned lights.

- `js/runtime/physics-world.js`
  Cannon world adapter: player body creation, static collider rebuild, height-aware vertical cylinders for circular props such as light poles, body sync, physics stepping, and teardown.

## Logic Element Runtime

- `js/runtime/pawn-core.js`
  Generic Pawn foundation: stable identity, authoring/runtime flags, lifecycle, possession callbacks, snapshots and a component-factory registry. Vehicle Pawn consumes this layer; future Human and Animal Pawns can reuse it without inheriting wheel, engine or RaycastVehicle assumptions.

- `js/runtime/vehicle-pawns.js`
  Versioned `VehiclePawn` v2 contract and registry exposed as `LOT_KING.pawns`. It separates authoring configuration, runtime state and visual ownership; provides lifecycle, reset/sleep/dispose, nullable Player 1–4 possession, an adapter for the untouched native Player Car, Cannon/fallback locomotion, independent synth audio, metric widgets, vehicle effects and Pawn-scoped runtime events.

## Soccer Game Mode

- `js/runtime/gameplay-difficulty.js`
  Persistent project-agnostic Easy/Medium/Hard gameplay contract with domain-specific profiles. Soccer consumes it for goalkeeper reaction, prediction, reach, tracking and dive ability, plus enabled unpossessed field-player AI reaction, pace and shot error. Future game categories can reuse the generic opponent values without adding another incompatible menu setting.

- `js/runtime/soccer-pawns.js`
  Thin Soccer specialization of the shared Character Pawn base. It owns persistent pre-shot and charged mouse/right-stick aim, animation-synchronized foot contact, goal-local predictive goalkeeper behavior and the opt-in unpossessed field-opponent baseline; movement, possession, camera and animation lifecycle stay in the base.

- `js/runtime/character-pawn-base.js`
  Shared humanoid Pawn implementation: lifecycle, registry/possession, input, ground movement, camera, animation library and motion blending, appearance and generic action playback. Generic Character and Soccer compose this module instead of inheriting from one another.

- `js/runtime/character-pawns.js`
  Thin generic Character specialization and data presets (`normal`, `civil`, `police`) over the shared Character Pawn base. It contains no Soccer dependency.

- `js/runtime/character-level-template.js`
  Native/editor-editable reconstruction of the supplied Sketch Street concept: exact sloped road profile, eight detailed houses, street furniture, vegetation, wires, sea backdrop, scooter, a preconfigured normal Character and a reusable talkable civil NPC.

- `js/runtime/character-movement.js`
  Generic humanoid ground-movement controller (design adapted from three-player-controller, dependency-free): camera-relative or heading-relative input, walk/run/sprint smoothing, gravity + jump with air control, ground detection, height-aware collision with automatic step-up onto walkable colliders, the material underfoot reported in the frame snapshot, pushback against the arcade collider lists and camera view presets (third / close / first-person lite). Consumed by the Soccer Pawn and reusable by future human-type Pawns.

- `js/runtime/character-audio.js`
  Character Sound Sets: on-foot audio for footsteps, weapons, explosive FX and body foley, procedural by default. Each slot is a modular synthesis recipe (filtered noise burst, pitched/sub sweep, high-Q material ring, optional grains) plus an optional sample that wins when it loads, so an empty or broken path degrades to sound rather than to silence. Footsteps are spaced by distance walked with separate walk/run strides and pick their recipe from the surface in the movement snapshot; weapon and explosion audio is driven by the Pawn event channel. The shipped explosion layers a debris transient, resonant body and 808-style sub drop. The decision layer (`defaultSet`, `normalizeSet`, `weaponClassFor`, `createGait`) is DOM-free and node-testable; only the Web Audio graph needs a browser.

- `js/runtime/soccer-locomotion.js`
  Legacy filename for the shared Character locomotion module. It exports the generic `LK_RUNTIME_CHARACTER_LOCOMOTION` contract (and the older Soccer alias): velocity damping, metadata-driven Motion Set selection, weighted direction/speed blends, stride matching, one-shot actions and per-bone Edit Rig pose-layer blending. It canonicalizes Mixamo/Blender track names and uses r185 `SkeletonUtils.retargetClip()` for real source/target skeletons, including armature-span compensation for hip translation.

- `js/runtime/character-animation-set.js`
  Normalizes legacy slot maps and current `animationSet` entries, infers physical motion metadata and deterministically ranks candidates from state, local direction, speed, acceleration and priority. Selection returns normalized weights rather than random choices.

- `js/runtime/character-placeholder-locomotion.js`
  Procedural fallback locomotion controller sharing the same `bind/update/playAction/dispose/isBound/...` contract as `soccer-locomotion.js`. When no GLB with animations is bound yet, it drives the built-in placeholder body (torso/hips/legs/arms/head, matched by scene element id) with a speed- and gait-driven walk/run/idle cycle plus built-in Jump/Kick/Dive/Celebrate/Defeat/Interact gestures resolved through the same fuzzy clip-name matching as real clips. `character-pawn-base.js` upgrades to a GLB controller automatically as soon as one becomes available.

- `js/runtime/mixamo-placeholder-clips.js`
  Target-rig procedural clip generator for compatible humanoid/Mixamo Main Meshes. It derives quaternion tracks from each bone's rest pose for the complete Character/Soccer slot set, including goalkeeper-ready, catch and directional dive poses. It emits no position/scale tracks and is consumed by both Pawn Studio and the shared locomotion controller only when an authored take is unavailable.

- `js/runtime/soccer-ball.js`
  Regulation ball with arcade flight physics (gravity, bounce, drag, Magnus curve), soft non-welded match control, nearest-ball/timed-strike APIs, penalty-spot locking, goal-line detection against registered regulation goal frames (7.32 x 2.44), goalkeeper save checks and out/stopped detection. Balls register as non-possessable Pawn records so they step and dispose with the Play session. Emits `OnBallKicked` / `OnGoalScored` / `OnBallSaved` / `OnBallOut`.

- `js/runtime/penalty-flow.js`
  Penalty shootout referee state machine: alternating kicks, configurable kicks per team, sudden death, early mathematical decision, score/history tracking and `OnPenaltyKickReady` / `OnPenaltyPhaseChanged` / `OnPenaltyResult` / `OnShootoutFinished` events consumed from the shared Pawn event bus. Snapshots include the last outcome and result sequence used by the Soccer HUD.

- `js/runtime/soccer-stadium.js`
  Pure-data stadium level builder used by the editor `Add > Level > Soccer Stadium (Penalty)` action. Generates editable primitive/light descriptors for a regulation pitch with a single smooth penalty arc, conventional goal frame/open net, stands with placeholder fans, entrances, flags and floodlights, plus `gameplayAnchors()` (penalty spots, goal centers/headings, kickoff).

- `js/runtime/penalty-shootout-level-template.js`
  `New Level -> Penalty Shootout Stadium (Soccer)` level builder. Converts `soccer-stadium.js` output into normal editable `scene.added` entries, then places a possessed kicker, an unpossessed goalkeeper, an explicit penalty Ball, a Goal Frame sensor and a Penalty Shootout Manager. Matching stable IDs link the manager to the reusable ball/goal while the stadium meshes remain freely replaceable.

- `js/logic/logic-nodes-soccer.js` / `js/logic/logic-templates-soccer.js`
  Soccer Logic node pack (registered through `window.LK_LOGIC_NODE_PACKS`) and template pack (registered through `LK_LOGIC_TEMPLATES.register`): `Template - Player Soccer Element`, `Template - Soccer Ball`, `Template - Soccer Goal Frame` and `Template - Penalty Shootout Manager`. Ball spawning carries explicit `match|penalty` and initial-lock state, and goal/manager composition uses stable author-facing IDs.

- `js/logic/logic-nodes-character.js` / `js/logic/logic-templates-character.js`
  Generic Character Pawn control/state nodes and `Template - Player Character (Normal)`, including preset selection and explicit in-place/no-root-motion guidance for every animation slot.

- `js/runtime/first-person-controller.js`
  Character view/weapon rig attached to a Pawn that carries a `firstPerson` config block. Owns view angles with pitch clamping and **both** camera transforms handed to `lot-king.js` — the eye, and an over-the-shoulder third-person camera with wall clearance that shares the same look angles, crosshair and hitscan, so the two views are equally playable and `C` switches between them without changing anything else. Also owns aim-down-sights blending, view bob, recoil applied to the view angles themselves, and a hitscan weapon (fire mode, cadence, spread, magazine, reload, reserve, multi-pellet). Also defines the `userData.damageable` health contract and its head hit zone, and is the only code that mutates it. `attach()` composes onto the Pawn's existing `beforeMovementStep` / `afterMovementStep` / `reset` / `dispose` hooks rather than replacing them, so the third-person path is untouched. DOM-free and unit-testable in node.

- `js/runtime/fps-hud.js`
  Optional shooter overlay for a possessed character Pawn: crosshair whose gap tracks live spread and recoil, hit and kill markers, weapon name, ammo/reserve/reload, the carried loadout, health/armour/stamina bars, a collider-driven radar, the Use and Pick Up prompts, pickup toasts and a damage vignette. It mounts **inside `#hud`**, which `lot-king.js` already positions onto the rendered camera rectangle, so the crosshair sits on the optical centre in split screen and inside the editor viewport rather than on the centre of the window. It renders only during a running session or Play Preview, never in edit mode. Removing the script removes the HUD and nothing else.

- `js/runtime/character-abilities.js`
  GASP-style traversal state machine shared by first and third person: crouch (with a headroom check that refuses to stand up under an obstacle), slow walk, slide, vault, mantle, ladder and climbable-wall climbing. Crouch and walk are speed scales layered onto the ordinary movement controller; vault, mantle and climb take over the frame and drive `owner.position` as a tween. Obstacle classification reads the same arcade box colliders the movement controller resolves against, so an obstacle is vaultable exactly when it is solid. `attach()` composes onto the Pawn hooks and adds a `movementScale` factor. DOM-free apart from event dispatch.

- `js/runtime/character-vitals.js`
  Health, armour, stamina, delayed regeneration, death and respawn for a character Pawn. Mirrors its health onto `owner.userData.damageable`, the same contract the first-person hitscan resolver writes, so the player is damaged by exactly the code that damages any other target and armour is applied in one place. Emits `OnCharacterDamaged` / `OnCharacterHealed` / `OnCharacterDied` / `OnCharacterRevived`.

- `js/runtime/item-system.js`
  World pickups and the per-Pawn weapon inventory. Exposes `warmup()` for the pre-benchmark, which builds one visual of every pickup kind so their shaders compile before the first medkit appears in play. An object in the scene **is** an item when it carries `userData.item = {kind, ...}`: `weapon`, `health`, `armor`, `ammo` or `custom`. The visual is whatever the object already is, so any primitive, GLB or FBX becomes a pickup with no second code path. The inventory parks each weapon's magazine and reserve while another is equipped, swaps rather than refusing a pickup at capacity, and hands the definition back on drop so a world pickup can be spawned for it. Dropped weapons reuse the view-model geometry and fall on a short ballistic arc.

- `js/runtime/interaction-system.js`
  The Use key. Any object becomes interactive by carrying `userData.interact = {type, ...}`: `door` (swing or slide, moving its collider with it), `ladder`, `carry`, `dropZone`, `button` or `climb`. Focus resolution — a look ray first, proximity as the fallback — is shared by the HUD prompt and by the verb, so the prompt and the key can never disagree. Doors animate from the runtime clock and re-sync their collider through `LK_STORE.syncCollider`.

- `js/runtime/fps-arena-level-template.js`
  `New Level -> FPS Shooter Test (First Person)` level builder, *Blackpine Urban Training Facility*. Emits roughly 640 ordinary editable primitive and light entries across eight `templateGroup` zones: terrain and lane markings, a covered staging bay (lockers, benches, ammo crates, lit briefing board, hanging lamps), a sandbag firing line, a CQB village (ribbed shipping containers, a walk-in two-room block house with window/door/breach openings, a wrecked car, tyre stacks, oil drums, crates and barriers), a long range (earth berms, wooden target frames, roofed watchtower) and a fenced perimeter with floodlight masts and signage. Then places one possessed first-person player and twelve Shooting Target Logic Elements with distance-scaled health, respawn delay and points. Real point lights are capped at five, with every other fixture an unlit emissive lens, and collision stays structural.

- `js/logic/logic-nodes-fps.js` / `js/logic/logic-templates-fps.js`
  First Person node pack (view angles, weapon control and state, damageable target registration and querying, five weapon events on the Pawn event channel) and template pack: `Template - Player Character (First Person)` and `Template - Shooting Target`. The player template reuses the generic Character Pawn contract instead of forking it, so Pawn Studio authoring carries over.

- `js/logic/logic-graph.js`
  Pure graph JSON helpers. Creates and normalizes Level Logic and Logic Element graphs while preserving variables, nodes, edges, comments, reusable subgraphs/macros, and the internal Logic Element scene model. Also exposes the Logic Element definition version, dependency manifest collection, and reusable definition asset migration/normalization used by the store and exporter.

- `js/logic/logic-exporter.js`
  Safe JS/TS exporter for Logic Element graphs. Emits portable graph JSON plus metadata and dependencies, can emit a runtime-wrapper helper that creates a `LK_LOGIC_RUNTIME` instance from the exported graph, and includes a bounded imperative runner foundation for a safe subset of nodes. The exporter does not use `eval`; full imperative coverage for every node remains future work.

- `js/logic/logic-registry.js`
  Registry for node metadata and behavior. Every executable/evaluable node must be registered here through a definition supplied by a node catalog.

- `js/logic/logic-validator.js`
  Shared structural and authoring diagnostics. Returns blocking `errors`, non-blocking `warnings`, and a combined `diagnostics` list with node/edge/pin references for editor presentation. It also validates reusable subgraph internals and `Call Subgraph` references. Runtime creation checks `ok` and skips graphs with structural errors.

- `js/logic/logic-runtime.js`
  Controlled graph interpreter. Resolves data wires, follows execution wires, keeps per-runtime variables/timers, dispatches events, executes reusable subgraphs through the `Entry` custom event convention, enforces a maximum execution-step count without dynamic JavaScript evaluation, supports pause/resume/step on marked breakpoints, and exposes lightweight runtime profiling stats plus a compact event/node/error/breakpoint timeline.

- `js/logic/logic-services.js`
  Capability boundary used by node implementations to access scene objects, Three.js transforms/materials, Cannon bodies, input, audio, camera, animation, and debug output. Material/audio services also resolve supported asset-ref objects, including blob-backed `dbKey` values through `LK_ASSET_BLOBS`.

- `js/logic/logic-nodes-mvp.js`
  Catalog with 108 registered node definitions for events, flow, variables/data, math/vector, scene/transform, physics/collision, material, raycast, camera, audio, animation, and debug, plus the Part 2 `Call Subgraph`, Function Input/Return, dynamic pins and multi-output return foundations.

- `js/logic/logic-templates.js`
  Built-in Logic Element starter templates used by the Assets panel, including gameplay, interaction, debug and physics starters. Templates are placed as local editable Logic Element copies, not as hidden linked definitions.

- `js/runtime/logic-elements-runner.js`
  Runtime lifecycle bridge for Level Logic and scene Logic Elements. Builds validated runtimes, creates/starts/steps/disposes owned Vehicle Pawns, routes start/update/fixed-update/input/gamepad/resize/collision/custom/destroy events, starts internal animations, aggregates profiling stats across active graph runtimes, and manages breakpoint execution.

`js/engine/scene-store.js` resolves reusable Logic Element definitions before runtime creation. Linked instances share their definition and apply only exposed-variable overrides; saved entries embed the definition and resolved fallback so runtime/playable imports do not depend on another browser's local asset library.

## Editor Mesh Authoring

- `js/editor/material-editor.js`
  Edits material slots and provides Live Material Selection, including Ctrl/Shift multi-selection and one patch across all selected stable slots.

- `js/editor/mesh-editor.js`
  Edits scene GLBs and the active player model through Start/Stop Live Mesh Editing, Ctrl/Shift multi-selection, hierarchy controls, local transforms, node visibility/name/shadow/culling/render-order properties, deletion/restoration, internal detachment, safe non-skinned decomposition and reversible joins. For scene GLBs it can also extract selected parts as independent persisted entities that reuse the source asset and receive normal per-object collision editing. Commands use shared editor history and compact `meshEdits` overrides.

- `js/editor/player-blueprints.js`
  Collects/applies the built-in Player Car blueprint, including enabled/hidden/nullable controller possession state, and can generate a reusable Player Car Logic Element snapshot with model, rig hierarchy, collision metadata, exposed categorized variables and the complete future-runtime Pawn payload.

- `js/editor/viewport-picking.js`
  Supplies the mesh/material intersection used by both live authoring modes; the editor composition layer routes a click to the currently active mode so structural selection cannot accidentally change a material target.

- `tests/logic-core.test.js`
  Standalone Node regression suite for clean graph validation, contextual warning/error codes, runtime start/update execution, variable persistence, `Tick Every` timing, reusable subgraph execution, and built-in template integrity. Browser/Three.js/Cannon integration remains a separate test layer.

- `docs/logic-element-test-matrix.md`
  Implementation-side verification matrix for core graph tests, browser editor coverage, save/reload/export scenarios, and built-in template behavior.

## Plugin Host

- `js/plugins/plugin-api.js`
  Stable registration API passed to plugins. Supports commands, menu entries, scene types, asset types, asset importers, authoring preview loaders, Pawn Studio adapters, inspector providers, runtime hooks, export hooks, and declared capabilities.

- `js/plugins/plugin-manager.js`
  Editor/runtime plugin registry. Tracks built-in and external/reference plugins, persisted enabled state, commands and extension entries. Mandatory built-ins cannot be disabled; default-enabled non-built-ins such as the FBX importer can be toggled.

- `js/plugins/logic-element-plugin.js`
  Built-in `Logic Element (Experimental)` plugin descriptor. Declares Logic Element capabilities and registers the scene object type, reusable asset type, inspector provider, runtime runner hook, export hook, and Level Logic command while the implementation remains in the existing Logic Element modules.

- `js/plugins/fbx-import-plugin.js`
  Default-enabled, user-toggleable reference plugin. Resolves multi-file/folder FBX texture dependencies, persists source provenance, previews FBX directly through `FBXLoader`, and compiles scenes, skeletons and animations to the linked binary GLB used by runtime and portable export.

- `js/plugins/cloth-authoring-plugin.js`
  Default-enabled, user-toggleable Cloth Studio plugin. It augments Character and Soccer Pawn Studio with garment discovery, per-piece masks, viewport painting, solver/wind controls, mesh diagnostics and automatic or explicit bone collider authoring.

- `js/editor/editor-menu-bar.js`
  Software-style top application menu (`File`, `Edit`, `View`, `Tools`, `Plugins`), non-modal Plugin Manager panel, and Logic Profiler panel for active runtime stats, pause/resume/step breakpoint controls, filtered timeline samples, and filtered/total sample counts.

## Player, Vehicle, Models, and Camera

- `js/runtime/drive-tuning.js`
  Drive setup panel bindings, tuning values, and runtime config mutation for handling, power, grip, braking, and drift behavior.

- `js/runtime/model-assets.js`
  GLB/GLTF loading, model normalization, wheel rig detection, wheel animation helpers, and player model preparation.

- `js/runtime/player-model.js`
  Player GLB assignment, current model access, drag/drop replacement support, and runtime model state.

- `js/runtime/player-light-rig.js`
  Vehicle-mounted lighting only: front headlights, rear/brake/reverse lights, auxiliary vehicle lights, neon, high beams, warm light slots, and the player-light bridge used by the editor inspector.

- `js/runtime/player-camera.js`
  Player camera defaults, cinematic aspect-ratio math, scoped viewport rendering, player-camera frame rects, letterbox/crop handling, and HUD frame coordination.

- `js/runtime/player-data-widgets.js`
  Player-attached 3D metric labels, mirrored drift-side placement, editor helpers, and widget text rendering.

## Input System

- `js/runtime/input/input-actions.js`
  Pure input schema and resolver. Owns config versioning, migration, normalization, independent Vehicle/Character keyboard and gamepad schemes, input contexts, device instances, player mappings, effective schemes, conflict logic, and normalized drive-command resolution.

- `js/runtime/input/input-devices.js`
  Physical input sources for keyboard, gamepad, and touch. Tracks key/button/axis state and presents a small source API to the input manager.

- `js/runtime/input/input-manager.js`
  Runtime input coordinator exposed as `GAME.input`. Merges project `meta.input` with local user overrides, detects connected gamepads (including the connection-event window before `getGamepads()` catches up), reserves configured multiplayer devices before Player 1 auto-assign, persists remaps, computes touch visibility, and returns per-player commands in the context requested by each possessed Pawn.

- `js/runtime/input/touch-controls.js`
  On-screen mobile/portrait touch UI for steering, throttle, brake, and handbrake.

- `js/runtime/input/input-menu.js`
  In-game Controls tab for connected devices, player assignment, touch mode, auto-assign, and opening the visual mapper.

- `js/runtime/input/device-visuals.js`
  Device diagrams for keyboard, gamepad, and touch controls used by the mapping overlay. The keyboard visual is a compact QWERTY-style layout that includes the default runtime keys instead of stacking extra bound keys vertically. Gamepad and touch previews stay inside the shared mapping preview area.

- `js/runtime/input/mapping-overlay.js`
  Shared visual mapping overlay. Shows device diagrams, lights live inputs, warns on binding conflicts, and supports click-action/control-then-press remapping. Used by both game and editor. Keyboard actions support multiple bindings per action: individual key chips can be replaced, `+` adds alternate bindings, and `x` removes one binding without discarding the others. The preview area and action list are separated so long binding lists scroll without overlapping keyboard/gamepad/touch diagrams.

## Runtime UI Helpers

- `js/runtime/project-workspace.js`
  Editor-only workspace overlay and hosted-origin gate. It detects hosted versus local execution automatically, then offers Author DEMO or Clean Project. Author DEMO creates an origin-scoped private browser project with normal editor persistence. Folder mirroring and portable LKEP export are optional, and no hosted project/FTP write endpoint is used.

- `js/runtime/ui/window-manager.js`
  Shared floating-window manager for runtime/editor overlays. Supports centered windows, drag, resize, persisted geometry, viewport clamping, magnetic snapping, z-ordering, and attaching to existing panels.

- `js/runtime/game-hud.js`
  Gameplay HUD DOM helpers for popups, drift score, total score, speed, gear, and HUD visibility.

- `js/runtime/radio-hud.js`
  Soundhud/radio UI, TAB interactions, editor HUD handles, player radio volume, bass boost, imported tracks, and possessed-vehicle/specific-actor/global ownership gating.

- `js/runtime/settings-menu.js`
  Settings and pause-menu DOM bindings, audio sliders, video quality controls, persistent gameplay difficulty selection, editor/game/options-only modes, source-aware cursor behavior, gamepad menu navigation, and focus restoration after closing the menu. It derives a transient bounded render profile while any menu reason is active, leaving authored/player gameplay values unchanged. `GAME.ui.menuActions.run('options')` and `GAME.actions.openMenuOptions()` expose the Audio/Video-only view to built-in and future editor-authored menu UI. Keyboard/mouse-opened menus release pointer lock and show the UI cursor; gamepad/touch-opened menus keep cursor-hidden navigation semantics.

## Audio and Music

- `js/runtime/audio.js`
  Procedural WebAudio SFX: fallback engine tone, tire screech, ambient hum, crash, thud, and shared SFX bus helpers.

- `js/runtime/engine-audio.js`
  Sample-based engine sound sets: ON/OFF throttle RPM loop banks with constant-power crossfade, continuous limiter/turbo/gear/skid channels, one-shot events, synthetic fallbacks, procedural reverb, and Sound Designer test mode.

- `js/runtime/music-library.js`
  Shared sortable music libraries, browser-session audio imports, metadata from filenames, and safe audio URL handling.

- `js/runtime/menu-music.js`
  Independent Loading, Editor Menu and Game Menu playback, menu music button state, ordered track switching, upload handling, legacy shared-library migration and persistence.

## Environment, Weather, and Post

- `js/runtime/sky.js`
  Day/night cycle, stars, moon, clouds, procedural environment lighting, global light modulation, classic sun bloom/lens flare state, and volumetric-clouds integration.

- `js/runtime/cinematic-lens-flare.js`
  Optional fullscreen realistic sun flare for the shared post pipeline, with optical ghosts, chromatic dispersion, aperture rays, lens dirt and selective analytic sun bloom/glow.

- `js/runtime/volumetric-clouds.js`
  Day/night-synchronized raymarched cloud layer with normalized editor-tunable coverage, density, noise scale, edge detail, wind, altitude, thickness, quality, absorption and opacity.

- `js/runtime/rain.js`
  Camera-aware instanced GPU ribbon rain with stable camera-relative distribution, soft volume edges, distance-compensated thickness, level-relative vertical volume, normalized intensity/speed/length/width/wind/area/opacity controls and procedural SFX routing.

- `js/runtime/post.js`
  Shared camera-bindable post-processing: gameplay DOF/bokeh/grade plus a `videoOnly` editor path for color-neutral quality sharpening, selective Three.js SSR, compatibility indirect lighting, volumetric shafts and the optional cinematic lens flare. Its final OutputPass owns r185 tone mapping and output color conversion before display-space FXAA.

## Persistence and Store

- `js/editor/developer-debugger.js`
  Bounded, low-overhead editor diagnostic overlay for frame timing, renderer/hardware limits, errors, promise rejections, long tasks, scene-resource cost and particle capacity/activity. Heavy scene audits are throttled and scheduled during idle time. Table rows select/reveal authored Scene entries; complete reports download as JSON and concise snapshots are posted to the local server bridge.

- `serve_local.py`
  Localhost-only static/project bridge used by `avvio.bat`. In addition to atomic LKEP project snapshots, it validates debugger summary payloads and atomically writes the generated `.lotking-local/developer-performance-latest.md` report. Neither write endpoint exists on generic static hosts.

- `js/engine/scene-store.js`
  LKEP project save/load/import/export, scene application, active level/project persistence, local level library, asset blob storage through IndexedDB, player blueprints, reusable Logic Element definitions/instances, sound sets, and shared scene/entity factories. It loads `demo/demo-project.lkep.json` for an explicit hosted DEMO start and keeps that session marked as non-persistent until the visitor creates a local workspace copy; embedded `data:` model/texture assets are localized into IndexedDB.

This file is runtime-adjacent rather than inside `js/runtime/`, but it is part of runtime boot because saved projects are applied before play and editor preview.

## Editor Loader and Runtime-Shared Dependencies

- `js/editor/loader.js`
  Keeps editor module dependency ordering and staged loading responsibilities. The current primary editor surface is `engine_editor.html`, while gameplay remains separated in `gameplay.html` so playable/runtime pages do not need editor modules. Any new editor module needed by `editor-runtime.js` must be added both here and to the direct script stack in `engine_editor.html`.

The editor loader is included here because it controls when runtime-shared modules such as input actions, mapping overlay, and the window manager are available to editor code.

## Editor Modules Using Runtime State

These files live under `js/editor/`, but they directly coordinate with runtime/store systems and should be understood when tracing behavior:

- `js/editor/project-io.js`
  Editor project metadata, browser-based Projects overlay, active project save/load, import/export, active level/project round-trip, and persisted `meta.levelRole` (`gameplay`, `editor-menu`, `game-menu`). Owns editor-side `meta.input` serialization through the runtime input schema when available. Project export writes portable `.lkep.json` data. Hosted imports/saves stay blocked only before local-folder consent; afterward they use browser storage and the authorized workspace, never the hosting server.

- `js/editor/asset-catalog.js`, `js/editor/asset-panel.js`, `js/editor/asset-imports.js`
  Imported-asset selection, card rendering and lifecycle. Ctrl/Meta/Shift selection can span several assets; batch deletion deduplicates the logical records and removes their canonical blobs plus linked FBX source/sidecar records in one confirmation.

- `js/editor/pawn-studio.js`
  Shared schema-driven Pawn overlay for Character, Soccer, Vehicle and plugin adapters. Owns Main Mesh/reset/scale authoring, Motion Set batch intake, direct source preview, clip and rig diagnostics, r185 Timer/Mixer/Action lifecycle and isolated playback controls.

- `js/editor/logic-elements-inspector.js`
  Runtime-adjacent Logic Element authoring surface. Owns Graph/Viewport tabs, hierarchy/components/variables/functions, dependency list inspection, asset-ref picker/relink controls, shared-definition editing, exposed instance overrides and contextual validator diagnostics. Graph Run uses the interpreter; Viewport **Play Isolated** drives Character/Vehicle simulation locally and restores authored transforms on Stop.

- `js/editor/input-settings.js`
  Project input settings UI. Edits allowed devices, touch mode, player defaults, device instances, base bindings, and mapping overlay data stored in `meta.input`.

- `js/editor/editor-runtime.js`
  Editor enter/exit, Play Preview/Simulate, frame-loop handoff, editor camera sync, player-camera preview rendering, runtime/editor state guards, Cinema Studio runtime-trigger scanning, and runtime camera handoff when a Cinema Studio is active in Play Preview. It converts runtime player heading back to visible editor heading when returning from preview and should remain an orchestration layer; viewport layout and Cinema Studio authoring behavior are delegated to focused modules. Simulate uses the same runtime stepping path as Play Preview while keeping editor viewport/input/save behavior active; `LOT_KING.state.editorPreviewMode = "simulate"` tells runtime input/camera/touch handling to stay passive.

- `js/editor/viewport-layout.js`
  Runtime-adjacent editor viewport module. Owns quad/single viewport rendering, secondary cameras, render modes, split handles, overlays, FPS/performance stats and the Quick Video entry. Normal Lit views can use the shared project Video composer; diagnostic modes render directly.

- `js/editor/scene-menu-actions.js`, `js/editor/selection-manager.js`, `js/editor/history-manager.js`, `js/editor/inspector-controller.js`, `js/editor/player-blueprints.js`
  Editor modules that can mutate player position/direction. These should route player spawn updates through `GAME.player.syncSpawnFromVisibleTransform()` instead of writing runtime physics heading directly, so visible editor heading, saved spawn, and runtime driving heading remain stable.

- `js/editor/cinema-studio.js`
  Runtime-adjacent editor timeline module. Owns Cinema Studio timeline UI, dock/lock state, playhead/ruler controls, real Scene Camera camera cuts, floating preview, Normal/Final preview modes, timeline output evaluation, object transform tracks, camera FOV lens tracks, markers, event tracks, validation, selected-item deletion, undo-aware edits, and the internal play/stop/runtime API. Runtime event triggering and outbound `lotking:timelineevent` dispatch are implemented for Play Preview; advanced curve editing, blend modes, more camera parameters, and full track controls remain future work.

- `js/editor/playable-export.js`
  Coordinates playable ZIP export.

- `js/editor/playable-export-level-picker.js`
  Selects which saved levels/projects are exported and which selected level is primary.

- `js/editor/playable-export-assets.js`
  Collects and normalizes referenced assets, including blob-backed imported models/audio and texture/decal image assets.

- `js/editor/playable-export-zip.js`
  Builds the gameplay-only ZIP payload, runtime file list, asset list, manifest, local launch helpers, and editor-only exclusion guard.

## Sound Designer Modules

- `js/editor/sound-designer.js`
  Interactive engine sound set editor and tester.

- `js/editor/sound-designer-template.js`
  Static Sound Designer DOM/SVG shell.

- `js/editor/sound-designer-form.js`
  Reusable form controls and slot UI for the Sound Designer.

These modules work with `js/runtime/engine-audio.js`, `LK_STORE.soundSets`, and `LK_ASSET_BLOBS`.

## Remaining Responsibilities in `lot-king.js`

The long-term direction is still gradual extraction. Current responsibilities that remain in `js/lot-king.js` include:

- renderer/bootstrap setup;
- main loop coordination;
- runtime module creation order;
- player driving step and legacy keyboard fallback;
- player exhaust glue;
- editor/game bridge wiring;
- applying project input config before play;
- high-level level launch and preview glue where multiple systems meet.

Future extractions should keep the current rule: extract behavior only when it is self-contained enough to avoid breaking `window.LOT_KING`, editor preview, saved LKEP projects, or existing runtime workflows.
