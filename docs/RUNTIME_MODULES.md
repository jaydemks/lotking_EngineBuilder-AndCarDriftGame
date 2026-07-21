# LOT KING ENGINE EDITOR & Car Drift Game Runtime Modules

This document maps the current runtime and runtime-adjacent modules. It is meant to stay version-neutral; release-specific details belong in `docs/releases/` and active `RELEASE_NOTES_v*.md` files.

The gameplay runtime still composes through `js/lot-king.js`, but the project now has separate HTML entrypoints for landing/menu, gameplay, and editor. Most systems live in focused modules that register `window.LK_RUNTIME_*` factories. The editor also reuses some runtime modules, especially input, audio/HUD, and floating-window helpers.

## HTML Entrypoints

- `index.html`
  Landing/menu shell. Owns the main menu, landing music/mute control, project signature, and embedded gameplay frame transitions.

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

- `vendor/three-r185-compat.min.js`
  Generated local IIFE loaded by editor, gameplay and the standalone test editor. Rebuild it with `npm run build:three`; `npm run verify:three` rejects mixed revisions, old r128 URLs and removed color/shadow APIs.

- `vendor/cannon-0.6.2.min.js`, `vendor/jszip-3.10.1.min.js`, `vendor/helvetiker_regular.typeface.json`
  Pinned local supporting assets. Cannon preserves the existing physics behavior, JSZip keeps editor exports independent from a CDN, and the local font supports TextGeometry. Generated playable ZIPs include the runtime files plus `vendor/THIRD_PARTY_LICENSES.md`.

## Assets, Loading, and Session Flow

- `js/runtime/assets.js`
  Central asset directories, path builders, local `file://` detection, and shared asset constants.

- `js/runtime/loading-flow.js`
  Loading progress UI, weighted loading stages, menu busy state, load-failure UI, and final loading messages.

- `js/runtime/runtime-loader.js`
  Runtime asset loading, local model reports, saved-project apply step, and gameplay effect warmup.

- `js/runtime/session-flow.js`
  Gameplay/editor session state for launched tracks, editor preview, pending loads, selected project, and loaded-level flags.

- `js/runtime/game-flow.js`
  Track launch, editor preview/simulate launch, unload/back-to-menu behavior, HUD visibility, session transitions, play-state orchestration, and cleanup of session-only camera overrides. Browser gameplay, Play Preview and playable exports use the same flow.

- Runtime scene/cinema camera override
  `lot-king.js` applies the exclusive active Scene Camera for non-Pawn levels and evaluates Cinema Studio Movie Track camera cuts after the normal Player Camera update, ensuring the selected scene/timeline camera owns the final Player 1 render. Logic services dispatch the same start/stop contract to editor preview and standalone gameplay.

- `js/engine/scene-store.js`
  In addition to scene persistence and factories, owns versioned GLB `meshEdits`: stable mesh ids, deleted/detached parts, local transforms, persistent non-material node properties and deterministic material/connected-island decomposition reconstructed from source geometry at load time.

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

- `js/runtime/soccer-pawns.js`
  Thin Soccer specialization of the shared Character Pawn base. It owns only football roles, football actions and goalkeeper behavior; movement, collision, possession, camera and animation lifecycle stay in the base.

- `js/runtime/character-pawn-base.js`
  Shared humanoid Pawn implementation: lifecycle, registry/possession, input, ground movement, camera, animation library and motion blending, appearance and generic action playback. Generic Character and Soccer compose this module instead of inheriting from one another.

- `js/runtime/character-pawns.js`
  Thin generic Character specialization and data presets (`normal`, `civil`, `police`) over the shared Character Pawn base. It contains no Soccer dependency.

- `js/runtime/character-level-template.js`
  Native/editor-editable reconstruction of the supplied Sketch Street concept: exact sloped road profile, eight detailed houses, street furniture, vegetation, wires, sea backdrop, scooter, a preconfigured normal Character and a reusable talkable civil NPC.

- `js/runtime/character-movement.js`
  Generic humanoid ground-movement controller (design adapted from three-player-controller, dependency-free): camera-relative or heading-relative input, walk/run/sprint smoothing, gravity + jump with air control, ground detection, pushback against the arcade collider lists and camera view presets (third / close / first-person lite). Consumed by the Soccer Pawn and reusable by future human-type Pawns.

- `js/runtime/soccer-locomotion.js`
  Legacy filename for the shared Character locomotion module. It exports the generic `LK_RUNTIME_CHARACTER_LOCOMOTION` contract (and the older Soccer alias): velocity damping plus look-ahead cross-blends idle/walk/run/strafe, scales stride playback with real speed and runs one-shot actions. Missing clips degrade to the nearest available one.

- `js/runtime/soccer-ball.js`
  Regulation ball with arcade flight physics (gravity, bounce, drag, Magnus curve), kick-toward-target API, goal-line detection against registered regulation goal frames (7.32 x 2.44), goalkeeper save checks and out/stopped detection. Balls register as non-possessable Pawn records so they step and dispose with the Play session. Emits `OnBallKicked` / `OnGoalScored` / `OnBallSaved` / `OnBallOut`.

- `js/runtime/penalty-flow.js`
  Penalty shootout referee state machine: alternating kicks, configurable kicks per team, sudden death, early mathematical decision, score/history tracking and `OnPenaltyKickReady` / `OnPenaltyPhaseChanged` / `OnPenaltyResult` / `OnShootoutFinished` events consumed from the shared Pawn event bus.

- `js/runtime/soccer-stadium.js`
  Pure-data stadium level builder used by the editor `Add > Level > Soccer Stadium (Penalty)` action. Generates editable primitive/light descriptors for a regulation pitch with full markings, goals, stands with placeholder fans, entrances, flags and floodlights, plus `gameplayAnchors()` (penalty spots, goal centers/headings, kickoff).

- `js/logic/logic-nodes-soccer.js` / `js/logic/logic-templates-soccer.js`
  Soccer Logic node pack (registered through `window.LK_LOGIC_NODE_PACKS`) and the soccer template pack (registered through `LK_LOGIC_TEMPLATES.register`): `Template - Player Soccer Element` and `Template - Penalty Shootout Manager`.

- `js/logic/logic-nodes-character.js` / `js/logic/logic-templates-character.js`
  Generic Character Pawn control/state nodes and `Template - Player Character (Normal)`, including preset selection and explicit in-place/no-root-motion guidance for every animation slot.

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
  Stable registration API passed to plugins. Supports commands, menu entries, scene types, asset types, inspector providers, runtime hooks, export hooks, and declared capabilities.

- `js/plugins/plugin-manager.js`
  Editor/runtime plugin registry. Tracks built-in and future external plugins, enabled state, commands and extension entries. Built-in plugins cannot be disabled from the current UI.

- `js/plugins/logic-element-plugin.js`
  Built-in `Logic Element (Experimental)` plugin descriptor. Declares Logic Element capabilities and registers the scene object type, reusable asset type, inspector provider, runtime runner hook, export hook, and Level Logic command while the implementation remains in the existing Logic Element modules.

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
  Pure input schema and resolver. Owns config versioning, migration, normalization, default keyboard/gamepad schemes, input contexts, device instances, player mappings, effective schemes, conflict logic, and normalized drive-command resolution.

- `js/runtime/input/input-devices.js`
  Physical input sources for keyboard, gamepad, and touch. Tracks key/button/axis state and presents a small source API to the input manager.

- `js/runtime/input/input-manager.js`
  Runtime input coordinator exposed as `GAME.input`. Merges project `meta.input` with local user overrides, detects connected gamepads, maps device instances to players, supports Player 1 auto-assign, persists remaps, computes touch visibility, and returns per-player drive commands.

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
  Editor-only workspace overlay and hosted-origin gate. It detects hosted versus local execution automatically, then offers Author DEMO or Clean Project. Hosted editing requires a user-authorized writable folder through the File System Access API; the portable DEMO/manifest and later saves remain in that folder plus origin-scoped browser storage. Unsupported browsers use the GitHub/local guide. No hosted project/FTP write endpoint is used.

- `js/runtime/ui/window-manager.js`
  Shared floating-window manager for runtime/editor overlays. Supports centered windows, drag, resize, persisted geometry, viewport clamping, magnetic snapping, z-ordering, and attaching to existing panels.

- `js/runtime/game-hud.js`
  Gameplay HUD DOM helpers for popups, drift score, total score, speed, gear, and HUD visibility.

- `js/runtime/radio-hud.js`
  Soundhud/radio UI, TAB radio interactions, editor HUD handles, player radio volume, bass boost, imported radio tracks, and runtime/editor HUD layout state.

- `js/runtime/settings-menu.js`
  Settings and pause-menu DOM bindings, audio sliders, video quality controls, editor/game menu mode handling, source-aware cursor behavior, gamepad menu navigation, and focus restoration after closing the menu. Keyboard/mouse-opened menus release pointer lock and show the UI cursor; gamepad/touch-opened menus keep cursor-hidden navigation semantics.

## Audio and Music

- `js/runtime/audio.js`
  Procedural WebAudio SFX: fallback engine tone, tire screech, ambient hum, crash, thud, and shared SFX bus helpers.

- `js/runtime/engine-audio.js`
  Sample-based engine sound sets: ON/OFF throttle RPM loop banks with constant-power crossfade, continuous limiter/turbo/gear/skid channels, one-shot events, synthetic fallbacks, procedural reverb, and Sound Designer test mode.

- `js/runtime/music-library.js`
  Shared sortable music libraries, browser-session audio imports, metadata from filenames, and safe audio URL handling.

- `js/runtime/menu-music.js`
  Start-screen music playback, menu music button state, track switching, upload handling, and menu music state persistence.

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
  LKEP project save/load/import/export, scene application, active level/project persistence, local level library, asset blob storage through IndexedDB, player blueprints, reusable Logic Element definitions/instances, sound sets, and shared scene/entity factories. It loads `demo/demo-project.lkep.json` for the hosted chooser and an explicit DEMO start, then preserves the visitor's editable browser-local copy on later reloads; embedded `data:` model/texture assets are localized into IndexedDB.

This file is runtime-adjacent rather than inside `js/runtime/`, but it is part of runtime boot because saved projects are applied before play and editor preview.

## Editor Loader and Runtime-Shared Dependencies

- `js/editor/loader.js`
  Keeps editor module dependency ordering and staged loading responsibilities. The current primary editor surface is `engine_editor.html`, while gameplay remains separated in `gameplay.html` so playable/runtime pages do not need editor modules. Any new editor module needed by `editor-runtime.js` must be added both here and to the direct script stack in `engine_editor.html`.

The editor loader is included here because it controls when runtime-shared modules such as input actions, mapping overlay, and the window manager are available to editor code.

## Editor Modules Using Runtime State

These files live under `js/editor/`, but they directly coordinate with runtime/store systems and should be understood when tracing behavior:

- `js/editor/project-io.js`
  Editor project metadata, browser-based Projects overlay, active project save/load, import/export, active level/project round-trip, and persisted `meta.levelRole` (`gameplay`, `editor-menu`, `game-menu`). Owns editor-side `meta.input` serialization through the runtime input schema when available. Project export writes portable `.lkep.json` data. Hosted imports/saves stay blocked only before local-folder consent; afterward they use browser storage and the authorized workspace, never the hosting server.

- `js/editor/logic-elements-inspector.js`
  Runtime-adjacent Logic Element authoring surface. Owns Graph/Viewport tabs, hierarchy/components/variables/functions, dependency list inspection, asset-ref picker/relink controls, shared-definition editing, exposed instance overrides, contextual validator diagnostics, and local graph Play/Stop without duplicating the runtime interpreter.

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
