# LOT KING ENGINE EDITOR & Car Drift Game Runtime Modules

This document maps the current runtime and runtime-adjacent modules. It is meant to stay version-neutral; release-specific details belong in `docs/releases/` and active `Release_Notes_v*.md` files.

The gameplay runtime still composes through `js/lot-king.js`, but the project now has separate HTML entrypoints for landing/menu, gameplay, and editor. Most systems live in focused modules that register `window.LK_RUNTIME_*` factories. The editor also reuses some runtime modules, especially input, audio/HUD, and floating-window helpers.

## HTML Entrypoints

- `index.html`
  Landing/menu shell. Owns the main menu, landing music/mute control, project signature, and embedded gameplay frame transitions.

- `gameplay.html`
  Gameplay runtime page. Loads the runtime, HUD, settings, radio, audio, scene store, track catalog, and game flow without loading editor modules.

- `engine_editor.html`
  Standalone editor page. Loads the runtime/editor DOM and editor module stack required by editor preview, HUD editing, Sound Designer, asset management, and project export.

- `drift-parking-lot.html`
  Compatibility redirect to `index.html`.

## Composition Root

- `js/lot-king.js`
  Creates `window.LOT_KING`, owns the main runtime composition, initializes Three.js, creates module instances, applies projects/levels, wires the editor bridge, runs the frame loop, and keeps fallback behavior for critical paths.

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
  Track launch, editor preview launch, unload/back-to-menu behavior, HUD visibility, session transitions, and play-state orchestration.

- `js/runtime/track-catalog.js`
  Available track list, current track state, level-select card rendering, and runtime track catalog updates from saved levels.

## World and Physics

- `js/runtime/world-state.js`
  Editor entity registry, deterministic world seed, static collider data, cone state, world entity bookkeeping, and lightweight car collision helpers.

- `js/runtime/world-generation.js`
  Default parking-lot track factory: ground, walls, props, parked cars, cones, light poles, and track-owned lights.

- `js/runtime/physics-world.js`
  Cannon world adapter: player body creation, static collider rebuild, body sync, physics stepping, and teardown.

## Player, Vehicle, Models, and Camera

- `js/runtime/drive-tuning.js`
  Drive setup panel bindings, tuning values, and runtime config mutation for handling, power, grip, braking, and drift behavior.

- `js/runtime/model-assets.js`
  GLB/GLTF loading, model normalization, wheel rig detection, wheel animation helpers, and player model preparation.

- `js/runtime/player-model.js`
  Player GLB assignment, current model access, model flip support, drag/drop replacement support, and runtime model state.

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
  Device diagrams for keyboard, gamepad, and touch controls used by the mapping overlay.

- `js/runtime/input/mapping-overlay.js`
  Shared visual mapping overlay. Shows device diagrams, lights live inputs, warns on binding conflicts, and supports click-action/control-then-press remapping. Used by both game and editor.

## Runtime UI Helpers

- `js/runtime/ui/window-manager.js`
  Shared floating-window manager for runtime/editor overlays. Supports centered windows, drag, resize, persisted geometry, viewport clamping, magnetic snapping, z-ordering, and attaching to existing panels.

- `js/runtime/game-hud.js`
  Gameplay HUD DOM helpers for popups, drift score, total score, speed, gear, and HUD visibility.

- `js/runtime/radio-hud.js`
  Soundhud/radio UI, TAB radio interactions, editor HUD handles, player radio volume, bass boost, imported radio tracks, and runtime/editor HUD layout state.

- `js/runtime/settings-menu.js`
  Settings and pause-menu DOM bindings, audio sliders, video quality controls, and editor/game menu mode handling.

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
  Day/night cycle, stars, moon, clouds, procedural environment lighting, global light modulation, sun bloom, lens flare, and volumetric-clouds integration.

- `js/runtime/volumetric-clouds.js`
  Raymarched volumetric clouds on a sky dome. Editor-tunable coverage, density, noise scale, edge detail, wind, altitude, thickness, quality, absorption, and opacity.

- `js/runtime/rain.js`
  GPU rain using line segments and shader-driven fall, plus procedural rain audio. Editor-tunable intensity, speed, length, wind, area, opacity, and sound level.

- `js/runtime/post.js`
  Gameplay-camera post-processing: depth of field, golden-angle bokeh, highlight weighting, focus mask around the player, and visual grading.

## Persistence and Store

- `js/engine/scene-store.js`
  LKEP project save/load/import/export, scene application, active level/project persistence, local level library, asset blob storage through IndexedDB, player blueprints, sound sets, and shared scene/entity factories.

This file is runtime-adjacent rather than inside `js/runtime/`, but it is part of runtime boot because saved projects are applied before play and editor preview.

## Editor Loader and Runtime-Shared Dependencies

- `js/editor/loader.js`
  Keeps editor module dependency ordering and staged loading responsibilities. The current primary editor surface is `engine_editor.html`, while gameplay remains separated in `gameplay.html` so playable/runtime pages do not need editor modules.

The editor loader is included here because it controls when runtime-shared modules such as input actions, mapping overlay, and the window manager are available to editor code.

## Editor Modules Using Runtime State

These files live under `js/editor/`, but they directly coordinate with runtime/store systems and should be understood when tracing behavior:

- `js/editor/project-io.js`
  Editor project metadata, browser-based Projects overlay, active project save/load, import/export, and active level/project round-trip. Owns editor-side `meta.input` serialization through the runtime input schema when available. Project export writes portable `.lkep.json` data, while project storage in the editor remains scoped to the current browser origin.

- `js/editor/input-settings.js`
  Project input settings UI. Edits allowed devices, touch mode, player defaults, device instances, base bindings, and mapping overlay data stored in `meta.input`.

- `js/editor/editor-runtime.js`
  Editor enter/exit, play preview, frame-loop handoff, editor camera sync, and runtime/editor state guards.

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
