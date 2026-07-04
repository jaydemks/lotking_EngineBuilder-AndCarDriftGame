# Release Notes

Lot King Engine Builder & Car Drift Game is built with an AI-assisted workflow: the very first version came out of a single prompt to Claude (Fable 5) in a normal chat, and everything after that has been iterated in VS Code with Claude Code and Codex, under constant human direction and testing.

A note on honesty and version numbers: the early versions (0.0.2 to 0.0.5) were not tagged while they happened — they are reconstructed here from the actual work, in logical order. Development hopped between AI tools: **at least twice a Claude session lost the thread of the project, and the owner simply switched to Codex and kept going**, later handing work back the other way. Those handoffs are marked below because they shaped where the version lines fall — though with so many hops between sessions, their exact placement is a best guess too. From 0.5.0 onward the notes are written as the work happens.

The road ahead leads to **1.0.0**.

---

## 0.5.1 — Continuing editor refactor

### Release Status

- Status: in progress.
- Scope: continue the Engine Editor refactor after the `v0.5.0-beta` baseline, keeping each extraction small, reviewed, and recoverable.

### Refactor Notes

- Started from a clean Git-backed baseline so editor recovery points are always available.
- Continued reducing risk around `js/editor/editor.js`, which is still the largest and most sensitive file in the project.
- Extracted editor settings/preferences into `js/editor/preferences.js`, keeping static chrome translation, theme switching, language switching, and quick music panel visibility out of the main editor file.
- Extracted floating quick menu music controls into `js/editor/quick-audio.js`, keeping playback, pause, volume, and next-track behavior out of the main editor file.
- Extracted static editor chrome markup into `js/editor/editor-template.js`, so `editor.js` no longer carries the full topbar, panels, overlays, and hidden inputs inline.
- Extracted topbar and toolbar event wiring into `js/editor/toolbar.js`, keeping tool buttons, snap toggles, level buttons, export buttons, and preview/exit controls out of the main editor file.
- Extracted left scene tools and asset dock control wiring into `js/editor/side-panels.js`, covering search, filters, view toggles, import, folders, refresh, and asset category checkboxes.
- Started splitting the asset dock renderer with `js/editor/asset-panel.js`, moving asset card DOM creation and asset card interaction wiring out of the main editor file.
- Moved asset visibility checks and asset group/folder rendering helpers into `js/editor/asset-panel.js`, reducing another layer of asset dock DOM work in the main editor file.
- Moved asset panel shell preparation into `js/editor/asset-panel.js`, including root drop handling and empty-space context menu wiring.
- Moved asset panel empty-state and status summary rendering into `js/editor/asset-panel.js`.
- Moved imported GLB asset item construction into `js/editor/asset-panel.js`.
- Moved level asset item construction into `js/editor/asset-panel.js`.
- Moved engine sound set asset item construction into `js/editor/asset-panel.js` while preserving Sound Designer open/assign/duplicate/delete actions.
- Moved blueprint asset item construction, scene asset item construction, and asset dock refresh orchestration into `js/editor/asset-panel.js`.
- Extracted scene outliner rendering into `js/editor/outliner.js`, including visible entity filtering, row DOM creation, folder rendering, scene tree drag/drop, and empty-space context menu wiring.
- Extracted asset, scene, and asset-dock context menu factories into `js/editor/editor-menus.js`.
- Extracted reusable inspector UI row/section builders into `js/editor/inspector-ui.js`.
- Extracted game radio and menu music library inspector sections into `js/editor/music-library-panel.js`.
- Extracted mesh material inspector controls into `js/editor/material-editor.js`, including presets, texture slots, material sliders, and shadow actions.
- Extracted the regular scene object inspector into `js/editor/object-inspector.js`, covering headers, transform fields, visibility, collision, light, effect, and object action sections.
- Extracted Player Blueprint game camera, depth-of-field, and visual grade controls into `js/editor/player-camera-inspector.js`.
- Extracted Player Blueprint vehicle light and neon controls into `js/editor/player-lights-inspector.js`.
- Extracted Player Blueprint exhaust source and 3D data widget controls into `js/editor/player-attachments-inspector.js`.
- Extracted Player Blueprint driving tuning, vehicle model, and engine sound setup controls into `js/editor/player-setup-inspector.js`.
- Extracted HUD / Radio TAB layout, preview, button, and layer controls into `js/editor/hud-inspector.js`.
- Extracted Environment inspector controls into `js/editor/environment-inspector.js`, including sky, fog, procedural environment, sun bloom, lens flare, volumetric clouds, rain, and global light selectors.
- Extracted editor project metadata, save, import, and export helpers into `js/editor/project-io.js`.
- Extracted editor add/import/replace actions into `js/editor/add-actions.js`, including primitive/light/effect creation, GLB import placement, entity GLB replacement, and player model replacement.
- Extracted editor history management into `js/editor/history-manager.js`, including undo/redo stacks, transform repeat, HUD history batching, entity restore/remove, parent links, and transform snapshots.
- Extracted scene context-menu definitions and small menu-triggered actions into `js/editor/scene-menu-actions.js`.
- Extracted asset catalog logic into `js/editor/asset-catalog.js`, including scene asset grouping, asset lookup, placement, search/filter helpers, icon resolution, asset-instance deletion, and asset panel refresh.
- Extracted selection management into `js/editor/selection-manager.js`, including object/special selection, visibility/collider toggles, delete/duplicate, focus, and gizmo-change synchronization.
- Extracted asset drag/drop and viewport replace-drop wiring into `js/editor/asset-dnd.js`.
- Extracted viewport pointer/context/wheel event wiring into `js/editor/viewport-events.js`.
- Extracted RMB fly-camera movement helpers into `js/editor/fly-camera.js`.
- Extracted toolbar/gizmo/TransformControls helpers into `js/editor/gizmo-controls.js`.
- Extracted viewport/editor visual helper objects into `js/editor/visual-helpers.js`.
- Extracted inspector routing and player inspector shell into `js/editor/inspector-controller.js`.
- Extracted editor enter/exit, play preview, frame loop and preview camera sync into `js/editor/editor-runtime.js`.
- Extracted default editor state, core chrome helpers and canvas viewport rect override into `js/editor/editor-core.js`.
- Extracted editor floating layout, viewport rect and resize restoration into `js/editor/editor-layout.js`.
- Reworked `js/editor/loader.js` into a script-stage manifest so module order and cleanup stay in one maintainable list.
- Extracted playable ZIP level selection modal into `js/editor/playable-export-level-picker.js`.
- Extracted playable export blob/database asset normalization into `js/editor/playable-export-assets.js`.
- Extracted playable ZIP packaging/runtime asset collection into `js/editor/playable-export-zip.js`.
- Extracted Sound Designer static CSS/DOM shell into `js/editor/sound-designer-template.js`.
- Extracted Sound Designer reusable form controls into `js/editor/sound-designer-form.js`.

---

## 0.5.0-beta — Git-ready stabilization

The first "Git-ready" milestone: the point where the prototype officially becomes a project with an initial repository, license, release notes, and a recoverable baseline. The jump from 0.0.5 to 0.5.0-beta is intentional — it marks the consolidation of everything below into one coherent, documented codebase.

### Release Status

- Status: beta stabilization.
- Scope: browser game runtime, Engine Editor, local level workflow, assets workflow, player blueprint workflow, engine sound workflow, and the big refactor.
- Tag target: `v0.5.0-beta`.

### Development Context

- Development environment: VS Code.
- Assistance: Claude Code and Codex (medium reasoning effort), plus manual work and design direction from the project owner.
- Main stack: Three.js r128, Cannon.js 0.6.2, plain JavaScript, HTML, CSS, WebAudio, LocalStorage, IndexedDB, FileReader, and browser drag-and-drop APIs.
- Main entry point: `drift-parking-lot.html`.
- Runtime code: `js/lot-king.js` and `js/runtime/`.
- Editor code: `js/editor/`.
- Scene, levels, assets, and project storage: `js/engine/scene-store.js`.

### Game Runtime

- Refined the playable drift runtime loop.
- Clean separation between menu, track launch, editor mode, editor preview, and gameplay sessions.
- Track launch flow from the main menu with a track selection screen fed by the local level library.
- Improved unload behavior when returning from a launched track to the menu.
- Prevented keyboard shortcuts such as F1 from incorrectly jumping between menu, game, and editor states.
- Fixed gameplay camera controls so Launch Track and Editor Preview use the same gameplay camera behavior.
- Improved camera smoothing and reduced jitter during driving and drifting.
- Improved reverse/brake behavior so reverse does not engage above the low-speed threshold.
- Skid marks now also appear for hard braking (all four wheels) and wheelspin under hard acceleration, not only when drifting sideways.
- Improved day/night and environment updates to remove visible flicker.

### Engine Editor

- Editor/runtime split so launching the game does not carry editor-only UI and tools.
- Lazy loading for editor assets, controls, and the Sound Designer.
- Level management: New Level, Save, Save As, Load, Duplicate, Rename, Delete, Import, and Export, via toolbar, shortcuts, and a dedicated levels overlay.
- New levels start from a clean template: simple ground plane, the base car, fixed daylight.
- Persistent local level library, with repair logic that rediscovers previously saved levels.
- Editor preview that behaves like a game-engine "play in editor" flow, hiding editor-only overlays (including the camera PIP) while playing.
- In-editor loading overlays with progress text for level and asset operations.

### Level And Project Storage

- Lot King Engine Builder Editor Project (LKEP) storage through `scene-store.js`.
- Project export/import as `.lkep` files, self-contained (player blueprint and sound set travel with the level).
- Local multi-level storage: one active-level slot the runtime applies at boot, plus a library of levels stored individually.
- Level metadata with track names and IDs, and early structure for future format versioning and migration.

### Engine Sound (new)

- Sample-based engine audio with two RPM loop banks — ON-throttle and OFF-throttle — crossfaded in real time on both RPM and gas pedal (constant-power).
- Continuous layers: rev limiter (with sample rate, stutter frequency and depth controls), turbo whine with simulated boost and blow-off, transmission whine under load and on release.
- One-shot events: ignition, gear-shift pop, blow-off, backfire, rev — each with volume, pitch, random pitch, probability, and cooldown.
- Per-slot lowpass filters, sine modulation for continuous layers, master tone (high/low cut), procedural reverb (amount and decay), RPM smoothing to tame the limiter bounce.
- Every empty or failed slot falls back to a synthetic sound, and the whole system falls back to the original procedural engine if no samples load. Slot status (loaded / loading / error / empty) is visible in the editor.
- Engine Sound Designer overlay: an interactive illustration with a draggable-sample SVG tachometer, engine hotspots for every layer and event, live parameter editing, and a tester (RPM slider, gas hold, auto-RPM mode, full ramp, release-only ramp) to hear everything without driving.
- Sound sets are assets: create, rename, duplicate, delete, assign per vehicle; saved in the player blueprint and inside exported levels.

### Assets Browser

- Assets tab with grid/list views, filters (Blueprints, Sound, Levels, GLB, Scene, Lights, FX, Textures, Other), search, selection, and context menus.
- Drag-and-drop import of external GLB/GLTF files, into the library or straight onto the viewport.
- Imported asset binaries stored in IndexedDB, so large files are not limited by LocalStorage.
- Levels, player blueprints, and engine sound sets appear as first-class assets alongside models.
- Confirmation overlay for destructive asset and level operations.

### Player Blueprint Assets

- Player Blueprint as a special asset category, with a required non-deletable `Player Blueprint Base`.
- Copy blueprint / Promote to Base flows from the inspector and context menus.
- Blueprints store tuning, camera, lights, exhaust, data widgets, spawn, model source, and engine sound set.
- Prepared the concept for future local/online multiplayer, where blueprint index 0 is the base player and duplicates can map to more controllers.

### Player Vehicle And Camera

- Editable camera modes: free orbit, arcade follow, cinematic drift follow.
- Camera aspect ratio options (16:9, 21:9, 2.39:1, 4:3, 1:1, 9:16), DOF, and color grading (exposure, brightness, contrast, saturation, gamma).
- Editable vehicle lights with editor helpers, underglow neon, exhaust smoke/fire anchors, and 3D data widgets with mirrored side placement.
- Player camera PIP: draggable, resizable, visible only when it makes sense.

### HUD And Radio

- HUD/Radio fully editable in the editor: frame PNG, digital interface, and clickable buttons (volume −/+, bass boost) positionable over custom artwork.
- Clock and date centered on the digital screen, plus an in-HUD player volume slider synced with the physical buttons.
- Undo/redo for HUD edits, correct layer ordering so buttons stay clickable, bass boost cycling through levels.

### Environment And Rendering

- Procedural environment lighting (intensity, warmth, contrast) replacing the heavier HDRI approach.
- Smooth day/night cycle without black flicker, lens flare, sky, fog, and post-processing controls.

### Refactor Work

- `js/lot-king.js` reduced to a runtime bridge; systems moved into ~20 focused modules under `js/runtime/` (world generation, physics, sky, audio, engine audio, cameras, HUD, track catalog, session/game/loading flow, settings, and more).
- Editor loader, editor UI, and Sound Designer split under `js/editor/`.
- Storage and project logic consolidated in `js/engine/scene-store.js`.

### Editor Recovery And Stabilization

- Documented the first Git baseline before continuing the editor refactor.
- Restored editor chrome that was temporarily broken during a risky extraction from `js/editor/editor.js`.
- Reconnected the top toolbar, export buttons, transform tool buttons, pinned sidebar entries, settings overlay tabs, quick menu music controls, and loading/progress overlays.
- Fixed viewport camera regressions around RMB fly movement and release behavior.
- Restored transform gizmo behavior, including precise axis interaction and the World / Local / Engine space toggle.
- Restored Z-up editor display behavior for the translate gizmo while preserving Engine Y-up as the raw internal Three.js convention.
- Repaired Menu Music quick player behavior so On/Off and Next operate through the runtime menu music API.
- Added `EDITOR_REFACTOR_CHECKS.md` with the PowerShell `node --check` commands used to validate editor modules on Windows.
- Added a custom source-available license with attribution and commercial revenue conditions.
- Prepared Git metadata for a first local baseline. Oversized assets such as `models/player.glb` and Blender source files are intentionally kept out of normal Git and should move through Git LFS or release assets before public distribution.

### Known Limitations

- GLB internal child objects load visually but are not yet individually editable entities.
- Collision is simple arcade box/circle colliders; full mesh collision from imported maps is planned.
- Playable track build/publish pipeline and versioned migrations are planned, not finalized.
- Online multiplayer is a prepared concept, not an active feature.
- The editor refactor must continue in small, verified slices. The recent recovery showed that `js/editor/editor.js` is still too large and too risky to edit with broad text-based extractions.

### Planned Next Steps

- Formal level format version and migration pipeline so old tracks keep loading.
- Separate "Export Editor Project", "Build Playable Track", and "Publish Track" flows.
- GLB hierarchy import/explode mode and better collision authoring.
- Asset packaging (manifest, hashes, engine version) for sharing tracks online.

---

## 0.0.5 — Handoff and the big refactor

The second handoff: a Claude session lost the project's thread mid-refactor, so development continued in Codex — and that stretch did the structural work properly: splitting the giant `lot-king.js` into the `js/runtime/` modules, rebuilding the Assets browser with IndexedDB storage, introducing player blueprint assets, camera modes, and the procedural environment. Most of what makes 0.5.0 feel like an engine landed here.

## 0.0.4 — The car gets a voice

Engine sound moves from "a sawtooth oscillator pretending to be a motor" to a real sample-based system: ON/OFF throttle loop banks crossfaded over RPM, limiter, turbo, transmission layers, one-shot events with synthetic fallbacks, and the first version of the Engine Sound Designer overlay. Sound sets become assets assignable to the vehicle. Also fixed: skid marks for hard braking and launch wheelspin.

## 0.0.3 — Levels become real

Up to here there was exactly one level. This version adds the level library: create a new level from a clean template, save/save-as/rename/duplicate/delete, import and export projects as files, and see every saved level as a launchable card in the game menu — the first true "build it, then play it" loop. Somewhere in this stretch the **first handoff** happened: a Claude session drifted away from the plan, and the owner switched to Codex to carry the work forward before development came back around.

## 0.0.2 — The editor is born

The first real Claude Code iteration on the prototype. The `LOT_KING` runtime bridge, the first Engine Editor (free camera, selection, gizmos, outliner, inspector) and persistence via `scene-store.js`, so editor changes survive reload and show up in the game. The radio HUD becomes editable: frame and screen positionable in the editor, physical volume/bass buttons placeable over the artwork, clock and date on the digital display.

## 0.0.1 — One prompt

The origin. A single prompt to Claude (Fable 5) in a regular chat produced the whole first playable prototype in one HTML file: parking lot, drifting car with arcade physics, drift scoring, procedural engine sound, radio, day/night sky. Everything since has been iteration on top of that one answer.
