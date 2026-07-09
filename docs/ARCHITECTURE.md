# LOT KING ENGINE EDITOR & Car Drift Game Architecture

This document describes the current project architecture after the editor/runtime split, the v0.6.2 Cinema Studio pass, and the v0.6.3 online-demo/workspace stabilization pass.

The project is still intentionally simple at the platform level: plain JavaScript, no bundler, static HTML entrypoints, browser storage, and a static-server workflow. The internal structure is now split into a landing/menu shell, gameplay runtime, standalone editor, persistence layer, project workspace chooser, shared UI/input helpers, playable export pipeline, online demo publishing path, and versioned release documentation.

## High-Level Shape

- `index.html` is the landing/menu entrypoint. It shows the project menu, owns landing music/mute controls, and can embed gameplay as a seamless frame.
- `gameplay.html` is the playable runtime entrypoint. It loads gameplay/runtime code without loading editor UI modules.
- `engine_editor.html` is the standalone editor entrypoint. It loads the full runtime/editor DOM needed by editor preview, HUD editing, radio, settings, and the Sound Designer.
- `drift-parking-lot.html` remains as a compatibility redirect to `index.html`.
- `js/lot-king.js` is the runtime composition root. It creates `window.LOT_KING`, wires the runtime modules together, owns the main render/update loop, and keeps the public bridge stable for the editor.
- `js/runtime/` contains focused gameplay/runtime modules: assets, loading, world state, world generation, player camera, player light rig, physics, audio, sky/weather, HUD, menus, input, track/session flow, and model handling.
- `js/runtime/project-workspace.js` owns the editor-only workspace overlay. It detects local vs online origins, presents the local/synced project options, and enforces the read-only online demo mode.
- `js/runtime/input/` contains the multi-device input stack introduced in v0.5.2: action schema, physical device sources, per-player assignment, in-game controls menu, visual mapping overlay, and touch controls.
- `js/runtime/ui/` contains runtime/editor-shared UI utilities, currently the floating window manager used by the mapping overlay and movable editor settings panels.
- `js/engine/scene-store.js` is the persistence and project-application layer. It owns LKEP import/export, local level/project storage, asset blob storage, project application at boot, and shared scene factories.
- `demo/demo-project.lkep.json` is the optional bundled online demo project. On non-localhost origins, `scene-store.js` loads it automatically into the browser-local level library as a read-only demo.
- `js/editor/loader.js` remains available for editor dependency ordering, while `engine_editor.html` is now the primary editor surface. Direct editor pages and the lazy loader must keep the same module order.
- `js/editor/` contains the modular Engine Editor: core state, layout, toolbar, side panels, asset dock, outliner, inspectors, selection, history, project IO, viewport layout, Cinema Studio, playable export, Sound Designer, input settings, and preview/runtime handoff.
- `css/lot-king.css` styles runtime UI, HUD, menus, touch controls, mapping windows, and shared overlays.
- `css/editor.css` styles the Engine Editor, inspector panels, editor settings, asset dock, outliner, Sound Designer, and editor-specific overlays.
- `docs/` contains architecture docs and release history.

## Runtime Composition

`js/lot-king.js` is no longer the place where every system lives. It is now mostly the coordinator that:

- creates the Three.js scene, camera, renderer, player car root, and core state;
- creates runtime modules from `window.LK_RUNTIME_*` factories;
- exposes the stable `window.LOT_KING` API used by the editor and store;
- routes level/project data from `LK_STORE` into runtime systems;
- keeps visual player heading, runtime driving heading, and editor spawn synchronization aligned when imported car models use corrective rotations;
- runs the main loop and lets the editor override or hook the frame when needed;
- keeps compatibility fallbacks when optional modules are unavailable.

The runtime is still script-loaded rather than bundled. Each module registers a small global factory such as `window.LK_RUNTIME_SKY`, `window.LK_RUNTIME_GAME_FLOW`, or `window.LK_RUNTIME_INPUT_MANAGER`. `lot-king.js` creates the concrete instances and passes dependencies explicitly.

## Public Runtime Bridge

The editor does not reach directly into every runtime implementation detail. It mainly talks to `window.LOT_KING`, `window.LK_STORE`, and shared module APIs.

Important `LOT_KING` areas include:

- `LOT_KING.core` - Three.js scene, camera, renderer, composer, canvas, clock, and shared render state.
- `LOT_KING.player` - car root, physics/config, spawn, model, tuning, camera config, lights, exhaust, data widgets, and blueprint-facing setters.
- `LOT_KING.player.syncSpawnFromVisibleTransform()` - the canonical editor-side sync point for player spawn position/heading. Editor tools should use this rather than writing `physics.heading` directly.
- `LOT_KING.world` - editable entity registry, colliders, cones, seeded world content, static collider rebuild hooks, and scene object registration.
- `LOT_KING.systems` - audio, engine audio, radio/HUD, sky, rain, physics world, post-processing, runtime loader, and other long-lived systems.
- `LOT_KING.input` / `GAME.input` - the v0.5.2 input manager, player device assignment, remap persistence, mapping overlay hooks, and drive-command resolution.
- `LOT_KING.ui` - popups, HUD helpers, loading overlays, and menu-facing UI hooks.
- `LOT_KING.actions` - launch/unload level, prepare editor level, play preview, apply project, and session-flow actions.
- `LOT_KING.state` - started/editor/editor-preview/loading flags used by runtime and editor guards, plus pause-menu cursor state needed by runtime/editor preview focus handoff.
- `LOT_KING.hooks.frameOverride` - lets the editor take over rendering while editing.
- `LOT_KING.hooks.frame` - shared per-frame hooks that still run during editor and game loops.

## Persistence and Project Data

`js/engine/scene-store.js` exposes `window.LK_STORE` and `window.LK_ASSET_BLOBS`.

The store is responsible for:

- active scene/project application at boot;
- level library indexing and local project storage;
- LKEP project export/import;
- scene serialization and deserialization;
- imported GLB/GLTF metadata;
- IndexedDB-backed asset blobs through `LK_ASSET_BLOBS`;
- player blueprints;
- engine sound sets;
- bundled online-demo loading from `demo/demo-project.lkep.json`;
- localizing embedded portable `data:` assets into IndexedDB-backed blob keys when applying an online demo project;
- reusable factories for primitives, lights, effects, GLB entries, and project entities.

LKEP project metadata now includes `meta.input`. That field stores the project-owned input policy: allowed device families, touch mode, player defaults, input contexts, device instances, base bindings, and per-instance overrides. Runtime user remaps are stored separately as local player overrides and do not widen the project-owned allowed-device list.

Editor projects are browser-based by default. `js/editor/project-io.js` owns the editor-facing Projects overlay and stores the project list in browser storage for the current origin, while larger imported assets still live in IndexedDB through `LK_ASSET_BLOBS`. This keeps the editor full-browser/static-server based: there is no required project backend. Because browser storage is scoped by device and origin, the portable path between origins/devices is explicit `.lkep.json` export/import. During export, blob-backed project assets are normalized into portable data so the resulting file does not depend on the original browser cache.

`js/runtime/project-workspace.js` adds an editor-only project workspace layer on top of that storage model. Locally, the editor can use normal browser storage or synchronize a project file through the File System Access API where supported. Online, the workspace becomes a read-only demo surface: uploads, saves, deletes, imports, asset edits, and server writes are blocked, while `.lkep.json` export remains allowed as a browser download.

The bundled demo path is intentionally static-host friendly. The site owner exports a local project as a portable LKEP, uploads it as `demo/demo-project.lkep.json`, and the online editor/game loads that project for demonstration. No server database, PHP upload endpoint, or shared asset write path is required.

## Input Architecture

The v0.5.2 input stack separates driving actions from physical devices.

Core ideas:

- An input context is a named action set. `vehicle` is the current context; future pawn types can add contexts such as aircraft or character controls.
- A device type is `keyboard`, `gamepad`, or `touch`.
- A device instance is a numbered slot such as `keyboard-1`, `keyboard-2`, `gamepad-1`, `gamepad-2`, or `touch-1`.
- A player slot maps to one device instance.
- A binding scheme resolves actions into a normalized drive command: `steer`, `throttle`, `brake`, `handbrake`, and `reset`.
- Shared base schemes live per context/device type; instance overrides store only differences for split local-coop setups.

Runtime input modules:

- `input-actions.js` - pure schema, migration, normalization, effective binding, conflict detection, and drive-command resolution.
- `input-devices.js` - keyboard, gamepad, and touch physical source readers.
- `input-manager.js` - merges project config and user overrides, detects connected gamepads, assigns devices to players, persists remaps, and exposes `GAME.input`.
- `touch-controls.js` - on-screen touch steering/throttle/brake/handbrake UI.
- `input-menu.js` - in-game Controls tab for device assignment, touch mode, and mapping access.
- `device-visuals.js` - schematic keyboard/gamepad/touch diagrams.
- `mapping-overlay.js` - shared visual mapper used by editor and game.

The mapping overlay is intentionally shared by the runtime and editor. It renders a compact real keyboard layout instead of a loose list of pressed keys, keeps gamepad/touch previews visually separated from the action list, and uses an internal styled scroll area for long binding lists. Keyboard actions can have multiple bindings, for example `W` and `ArrowUp`: clicking an existing key replaces that one binding, `+` adds an alternate key, and `x` removes a single binding without resetting the whole action.

Pause/menu input uses the same action layer, but cursor behavior is source-aware. Opening the pause menu from keyboard/mouse temporarily releases pointer lock and shows a UI cursor so the user can interact with menu controls. Opening it from gamepad or touch keeps cursor-hidden/gamepad navigation semantics. Closing the menu restores focus to the runtime canvas so gameplay shortcuts such as `U`, `Tab`, `M`, and remapped actions immediately work again in both normal gameplay and editor Play Preview.

Editor-side input:

- `js/editor/input-settings.js` edits `meta.input` from Settings -> Controls.
- The editor disables runtime user overrides while authoring so Preview reflects the pure project config.
- The same mapping overlay is opened from editor settings and writes project defaults instead of player overrides.

## Entry Point and Loading Model

The project no longer treats a single HTML page as both the menu, gameplay, and editor surface.

Current loading responsibilities:

- `index.html` loads the landing/menu UI and keeps menu music alive while transitioning into embedded gameplay.
- `gameplay.html` loads the gameplay runtime, settings, HUD, radio, audio, track catalog, scene store, and runtime modules needed to play.
- `engine_editor.html` loads the editor-specific DOM and module stack so editor preview works with the same runtime systems while remaining isolated from normal gameplay. Its direct script list mirrors `js/editor/loader.js`; when editor modules are extracted, both paths must be updated.
- On hosted origins, `engine_editor.html` remains the same page but the workspace layer switches the editor into online-demo mode. The user can inspect/play/export the demo, but authoring actions that would mutate browser/server project state are disabled.
- `drift-parking-lot.html` redirects old links to the new landing page.

The runtime should stay playable without loading editor CSS or `js/editor/*` modules. The editor can still use the staged loader/module ordering internally, but the architectural boundary is now page-level separation first.

## Engine Editor Architecture

`js/editor/editor.js` is now the editor composition root rather than the only editor implementation file. It creates editor state and wires the extracted editor modules together.

Major editor areas:

- Core and chrome: `editor-core.js`, `editor-template.js`, `editor-layout.js`, `floating-layout.js`.
- Toolbar and preferences: `toolbar.js`, `preferences.js`, `quick-audio.js`, `side-panels.js`.
- Viewport: `viewport-layout.js`, `viewport-picking.js`, `viewport-events.js`, `fly-camera.js`, `gizmo-controls.js`, `visual-helpers.js`.
- Selection/history: `selection-manager.js`, `history-manager.js`, `keyboard-shortcuts.js`.
- Assets: `asset-library.js`, `asset-imports.js`, `asset-panel.js`, `asset-properties.js`, `asset-catalog.js`, `asset-dnd.js`, `folder-manager.js`, `thumbnail-manager.js`.
- Scene tree and menus: `outliner.js`, `context-menu.js`, `editor-menus.js`, `scene-menu-actions.js`.
- Project and levels: `project-io.js`, `level-manager.js`, `dialogs.js`, `status-ui.js`.
- Player systems: `player-blueprints.js`, `player-camera-inspector.js`, `player-lights-inspector.js`, `player-attachments-inspector.js`, `player-setup-inspector.js`.
- Inspectors: `inspector-controller.js`, `inspector-ui.js`, `object-inspector.js`, `material-editor.js`, `hud-inspector.js`, `environment-inspector.js`, `music-library-panel.js`.
- Input authoring: `input-settings.js` plus shared runtime mapping modules.
- Runtime handoff and preview: `editor-runtime.js`.
- Sequencer/cameras: `cinema-studio.js`.
- Playable export: `playable-export.js`, `playable-export-level-picker.js`, `playable-export-assets.js`, `playable-export-zip.js`.
- Sound Designer: `sound-designer.js`, `sound-designer-template.js`, `sound-designer-form.js`.

The editor has its own free camera, grid/helpers, transform gizmo, asset dock, outliner, inspector, settings overlay, preview mode, and export flows. During edit mode it guards gameplay input with `LOT_KING.state.editorActive` and can override the canvas viewport rect so picking and editor panels behave correctly.

`editor-runtime.js` is intentionally kept as an orchestration module: editor enter/exit, Play Preview/Simulate, frame handoff, player-camera preview, runtime/editor state guards, and Cinema Studio runtime-trigger scanning during editor runtime previews. View-specific behavior lives in `viewport-layout.js`, which owns quad/single view layout, view selector overlays, per-view render modes, stats overlays, performance counters, long-task diagnostics, and independent secondary perspective cameras. Input/picking/control helpers still live in `viewport-events.js`, `viewport-picking.js`, `fly-camera.js`, and `gizmo-controls.js`.

Play Preview and Simulate share the same runtime launch path. Simulate marks `LOT_KING.state.editorPreviewMode = "simulate"` and keeps runtime events, cinema playback, and physics stepping active while leaving the editor viewport, gizmo, menus, and save workflow available. Runtime keyboard/mouse/gamepad/touch controls are suppressed in Simulate so the user continues to control the editor, not the gameplay camera or vehicle.

Play Preview uses the normal runtime pause/settings overlay. `Esc` opens/closes that menu, temporarily restores the mouse cursor when the menu was opened by keyboard/mouse, and returns focus to the canvas after closing so runtime shortcuts continue without requiring an extra click. Stopping preview remains separate through `F8` or `Shift+Esc`.

In online-demo mode, editor Play Preview skips the local save step and uses the already loaded bundled LKEP project as the authoritative level state. This allows hosted demos to be played without granting write access to the server or browser project library.

`cinema-studio.js` owns the Cinema Studio timeline surface: dock/lock timeline UI, playhead and ruler controls, camera cuts bound to real Scene Camera objects, floating preview, Normal/Final preview modes, object transform keys, camera FOV lens keys, markers, timeline events, validation, timeline item selection/deletion, undo-aware edits, asset-facing timeline duplication, and the internal play/stop/runtime API. It is browser-only and intentionally does not depend on external render/export tooling. Advanced curve editing, blend modes, more camera/lens parameters, and full track controls remain future work.

Cinema Studio data is stored on scene timeline/director objects through normalized `cinemaProps` data. `scene-store.js` keeps `cameraCuts`, `objectTracks`, `lensTracks`, `eventTracks`, and `markers` persistent, while maintaining the legacy `movieTrack` alias during migration. Collision Box trigger settings can call named Cinema Studio runtime events in Play Preview; timeline Event Track playback emits browser `lotking:timelineevent` events for project-specific listeners.

The editor opens with the Projects overlay on top of the editor surface. If the browser project list is empty but an older/current editor project already exists in the legacy active project slot, `project-io.js` seeds that project into the Projects list so existing work remains visible. Loading a project writes it into the active store and reloads the editor surface; saving updates the active browser project and keeps `.lkep.json` export as the explicit portable workflow.

The Projects overlay is local-editor focused. The workspace overlay is separate and appears only on the editor entrypoint, not on the public landing page, so normal "Play Game" entrypoints remain simple demo/play flows.

## Player Blueprint and Vehicle Systems

The player vehicle is configured through blueprints rather than hardcoded runtime values.

Blueprint-related systems include:

- driving tune values such as torque, grip, steer response, drift behavior, braking, and handbrake behavior;
- player camera config: follow style, aspect/crop behavior, FOV, draw distance, fog, shake, depth of field, and visual grade;
- vehicle lights and neon;
- exhaust smoke/fire anchors;
- player-attached data widgets;
- engine sound set assignment;
- model assignment and replacement;
- spawn/default project settings.
- visual player-root transform, spawn heading, and runtime driving heading.

The editor exposes these through player inspector modules and stores them through `LK_STORE`. The player spawn heading is treated as the canonical visible editor direction: `Direction = 0` is the forward heading shown by editor fields and stored in LKEP. Runtime driving heading can apply an internal offset when an imported GLB requires corrective root rotations, for example X/Z half-turn rotations. Editor tools must synchronize player changes through `GAME.player.syncSpawnFromVisibleTransform()` so spawn, physics, save/load, player-camera preview, and Play Preview reset stay consistent.

`scene-store.js` stores `player.headingMode: "runtime-v2"` plus `player.transform` for the player root. This preserves position, scale, visible rotation, model source, and the spawn direction across export/import. Older projects without the new heading mode are migrated conservatively.

## Audio and Sound Designer

Runtime audio is split between general procedural SFX and the sample-based engine audio system.

- `audio.js` owns fallback/procedural SFX such as engine tone, tire sounds, ambient hum, crashes, and thuds.
- `engine-audio.js` owns engine sound sets: ON/OFF throttle RPM loop banks, continuous layers, one-shots, synthetic fallbacks, reverb, skid channels, and Sound Designer test mode.
- `music-library.js`, `menu-music.js`, and `radio-hud.js` manage menu music, radio/HUD music, imported browser-session audio, and TAB/radio interactions.
- The Sound Designer editor overlay is lazy-loaded from the inspector and split into template, form helpers, and behavior.

Sound sets are assets stored by `LK_STORE.soundSets` and assigned per player blueprint.

## Environment, Camera, HUD, and Weather

Environment systems are split out of the old monolith:

- `sky.js` owns day/night, stars, moon, procedural lighting, sun bloom, lens flare, sprite clouds, and the volumetric-clouds sub-API.
- `volumetric-clouds.js` owns the raymarched cloud dome.
- `rain.js` owns GPU rain lines and procedural rain audio.
- `post.js` owns gameplay-camera post-processing, depth of field, highlight bokeh, focus masking, and visual grade.
- `player-camera.js` owns player camera defaults, cinematic aspect math, scoped viewport rendering, HUD frame rects, and the letterbox/crop frame used by the HUD.
- `game-hud.js` and `radio-hud.js` own runtime HUD DOM updates.

The v0.5.2 camera/HUD work confines HUD and radio panels to the actual rendered player-camera frame, including letterboxed/cropped frames and editor Preview.

## Playable Export

Playable ZIP export builds a gameplay-only package. It should include the runtime page, runtime scripts/styles, selected level projects, and referenced assets, but not the standalone editor.

- `playable-export.js` coordinates the flow.
- `playable-export-level-picker.js` handles selecting which level/project set to package and which level starts first.
- `playable-export-assets.js` normalizes referenced project assets and blob-backed files.
- `playable-export-zip.js` builds the export payload.

The ZIP bootstrap writes the selected package into browser storage, then launches `gameplay.html`. Exported gameplay should show only the levels intentionally included in the package. Embedded Sound Designer engine sound sets are carried with levels so playable builds can match editor vehicle audio.

This flow is separate from editor project export/import, which remains in `project-io.js` and `scene-store.js`.

The online demo does not use playable ZIP export. It uses the same portable LKEP export path but publishes the resulting file directly under `demo/demo-project.lkep.json`.

## Editor Performance Diagnostics

`viewport-layout.js` exposes the viewport `FPS` and `Performance` buttons. The performance overlay reports renderer draw calls, triangle counts, geometry/texture counts, heap information where available, maximum frame time, frame spikes above 100 ms, long-task count, and maximum long-task duration.

These counters are diagnostic only. They help distinguish GPU/render pressure from main-thread stalls caused by DOM refreshes, large JSON serialization, localStorage writes, thumbnail rendering, browser garbage collection, or asset/project data movement.

## Shared Floating Windows

`js/runtime/ui/window-manager.js` is a shared lightweight window manager used by both runtime and editor overlays.

It supports:

- centered floating windows;
- drag and resize;
- z-ordering;
- persisted geometry;
- viewport clamping;
- magnetic snapping to edges and other windows;
- attaching window behavior to existing panels, such as editor Settings.

The mapping overlay uses this manager in both game and editor contexts.

## What Still Lives in `lot-king.js`

`js/lot-king.js` is smaller than before but still contains important orchestration and some behavior that could be extracted later:

- renderer/bootstrap setup and global runtime object creation;
- main loop coordination;
- player driving step and fallback keyboard input path;
- player exhaust glue around runtime/editor hooks;
- runtime module creation order;
- level launch and editor-preview glue where multiple systems meet.

The preferred extraction pattern is still conservative: move low-risk, self-contained behavior into modules while keeping `window.LOT_KING`, LKEP compatibility, and editor workflows stable.
