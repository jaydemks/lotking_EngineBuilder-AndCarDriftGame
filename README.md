# Lot King Engine Editor & Car Drift Game

[![Try on GitHub Pages](https://img.shields.io/badge/TRY_IT_LIVE-GitHub_Pages-2ea44f?style=for-the-badge&logo=github)](https://jaydemks.github.io/lotking_EngineBuilder-AndCarDriftGame/)
[![Sponsor on GitHub](https://img.shields.io/badge/SPONSOR-jaydemks-ea4aaa?style=for-the-badge&logo=githubsponsors)](https://github.com/sponsors/jaydemks)

> **Build, play and export 3D browser experiences without leaving the browser.**

https://github.com/user-attachments/assets/6ccccc17-4816-4251-8ef9-867ab7ec009e

## Build Something And Put It Online

Lot King is a local-first, browser-native 3D engine/editor in active development, built with plain JavaScript, Three.js and Cannon.js. It began as a parking-lot drift prototype and is growing into a broader tool for levels, vehicles, characters, cinematics, interactive scenes and small browser games.

Today you can already create and test levels, import GLB/GLTF assets, tune gameplay and presentation, prototype visual logic, and export portable Three.js experiences or playable builds for your own website or GitHub Pages. You can [try the live project now](https://jaydemks.github.io/lotking_EngineBuilder-AndCarDriftGame/); capable hardware and a modern browser are recommended, and supported browsers can use a local workspace and download exports directly from the hosted editor.

This is not a finished general-purpose game engine. Reusable editor-authored objectives, broader game rules and several high-level Logic Element workflows are still being built. The project grows with every release, so experimental areas can change and regressions are treated as part of active development rather than hidden behind production claims.

The ambition is not to reproduce Unreal Engine in a browser. It is to keep one substantial, extensible project where creating scenes and games becomes fast, approachable and fun. Contributions, fixes, ideas and reusable systems are welcome at any time. A longer-term direction is optional AI API tooling that can generate structured level foundations quickly, while keeping the author in control instead of requiring every ordinary game detail to be described by hand.

The direction is inspired by tools like Unreal Engine, Blender, Premiere Pro and After Effects: not as clones or at the same production scale, but as references for visual editing, timelines, scene composition and node-based logic. The project deliberately stays simple at the technical level: static browser files, LocalStorage and IndexedDB, with no mandatory build step.

## What You Can Do With It

- Build multi-level browser projects with gameplay, hidden Editor Menu and Game Menu scenes.
- Shape the environment: procedural sky and day/night state, fog, global lighting, sun bloom, lens flare, volumetric clouds, rain and rendering profiles.
- Import, place and animate GLB/GLTF assets; edit transforms, materials, mesh parts, lights, primitives, text, FX and collision setups.
- Work visually with an outliner, inspector, transform gizmos, snapping, multi-selection, undo/redo, Play Preview and Simulate.
- Tune the built-in Player Car: arcade/RaycastVehicle handling, camera modes, collision, suspension, lights, neon, exhaust, skid marks, sound and reusable setup data.
- Create independent Logic Element Pawns, reusable graph assets, exposed variables, Functions/Subgraphs, macros, breakpoints and runtime profiling.
- Design the HUD and Radio layout: custom frame/screen placement, buttons, volume and bass controls, responsive camera framing, vehicle telemetry and 3D data widgets.
- Build engine Sound Sets with ON/OFF throttle samples, RPM layers, turbo, blow-off, backfire, limiter, gear shifts and ignition, with synthesized fallbacks.
- Author cinematics in Cinema Studio with scene cameras, camera cuts, transform/FOV keys, markers, timeline events and gameplay triggers.
- Create character experiments and the v0.6.8 soccer penalty mode with Soccer Pawns, Mixamo animation libraries, blended movement, ball/goal systems and a generated editable stadium.
- Save/import portable `.lkep.json` projects and choose exactly which included levels remain visible or internal-only.
- Export selected gameplay levels as a standalone Three.js playable ZIP without the editor.
- Publish playable builds or inspectable project demos on GitHub Pages, another static host or your own website.
- Use the same tools for drift tracks, 3D pages, interactive scenes, cinematic shots, prototypes and small game-like web experiences.

## Main Pages

- `index.html` - menu / landing page.
- `gameplay.html` - playable runtime.
- `engine_editor.html` - the editor.
- `drift-parking-lot.html` - old compatibility redirect.

## What Works Now

### Gameplay

The playable side is an arcade drift game: start a track, drive, slide, build score, hit cones and props, use the gearbox, limiter, handbrake, slow motion radio mode, and tune the driving feel from the editor.

The car handling is not trying to be a simulation. I am aiming for something that feels good for cinematic drift footage and fast testing inside the editor.

### Engine Editor

The editor runs in the browser. It has projects, levels, an outliner, inspector, transform gizmos, undo/redo, context menus, free camera controls, snapping, multi-selection, collision editing, asset placement and level save/load.

Levels saved in the editor become playable cards in the game.

Play Preview runs the authored level inside the editor viewport. Simulate uses the same runtime/event/physics path while keeping the editor viewport, gizmo, panels and save workflow active, so level logic can be tested without taking control away from the editor.

### Logic Element Visual Scripting

`v0.6.5` adds the first complete Logic Element foundation. Logic Element is an experimental visual scripting system inspired by Unreal Engine Blueprints, but built for this browser engine and its JavaScript runtime.

There are two main ideas:

- **Level Logic** - a graph that belongs to the whole level.
- **Logic Elements** - independent scene objects with their own graph, internal 3D viewport, hierarchy, components, variables and exposed settings.

The normal scene Inspector only shows the Logic Element position, key runtime settings and variables the author deliberately exposes. The graph internals stay inside the Logic Element editor, closer to how a Blueprint instance works in Unreal.

Current Logic Element work includes:

- a floating Graph/Viewport editor
- node graph pan/zoom, selection, comments, copy/paste and undo/redo
- events, flow, variables, math, scene, transform, physics, collision, material, camera, audio, animation and debug nodes
- Function/Subgraph support with input/output pins
- Macro foundation and exec-only Collapse to Macro
- exposed variables and per-instance overrides
- reusable Logic Element assets with linked instances
- internal 3D elements, GLB assets, colliders and animation clips
- Play Preview/runtime execution without `eval`
- Logic Profiler with breakpoints, step, timeline filtering and event details
- JS/TS graph export, runtime-wrapper export and an early imperative compiler foundation for a safe node subset
- a versioned Vehicle Pawn contract, registry and node category for independent Player Car Logic Elements

It is still marked **Logic Element (Experimental)** because the system is large and needs more browser hardening, more node coverage and more real projects before it can be considered stable.

Experimental features are not feature-complete: some workflows remain untested, some nodes are still missing, and some combinations may not work yet. For current vehicle projects, use the built-in **`player_car (Logic)`**. The **Player Car Logic Element** is an in-development comparison/template candidate and is not yet the recommended production Player Car.

### Project Workspace And Online Demo

The editor is local-first. On `localhost`, existing LocalStorage and IndexedDB projects continue to work, and the Project Workspace overlay can also sync a portable `.lkep.json` file where the browser supports file handles.

On hosted/static deployments, visitors can inspect, play and export the bundled demo without giving the site write access. Full authoring remains local-first: supported browsers can continue from the hosted editor only after the user explicitly authorizes a local workspace folder. Projects and imported assets stay in that folder or browser storage; GitHub Pages and FTP are never used as shared writable storage.

### Assets

The asset browser can manage imported GLB/GLTF models, scene assets, player car logic assets, engine sound sets and level assets. Larger imported files are stored in IndexedDB so they survive reloads.

### Player Car Setup

The `player_car` is treated as logic, not just a mesh. From the editor I can tune driving values, player collision, camera behavior, lights, underglow, exhaust sources, skid sources, 3D data widgets and reusable car logic presets.

The built-in `player_car (Logic)` remains the reference implementation and is now exposed through the same `VehiclePawn` contract as Logic Element cars. Player Car Logic Elements have their own lifecycle, runtime state, Cannon RaycastVehicle, four-wheel suspension, collision ownership, fallback locomotion, reset/spawn and local Player possession; they no longer use a demonstration-only transform chain. The internal car remains the handling reference and still owns specialist Camera, Lights/Neon, Attachments and Engine Sound inspectors, so it will not be removed until those systems reach verified parity.

The Logic Element candidate can select `None` or Player 1–4, prevents accidental double possession, and exposes Pawn control/reset/state nodes. Its starter graph uses a reusable `Apply Player Drive` Function. Multiple instances keep physics, speed, steering, gear, camera ownership, reactive lights, exhaust smoke and skid marks separate; the remaining parity work is concentrated in specialist inspectors, audio/HUD and split-screen presentation.

The longer-term goal is to separate vehicle physics behind an individual component/plugin boundary. Besides making multiple Pawns and different vehicle systems easier to add, that boundary will make third-party component provenance, licenses and author credits clearer than keeping every dependency inside one built-in player implementation.

### Cinema Studio

Cinema Studio is the in-editor timeline system. It is meant for making cinematic footage directly inside the engine.

Current timeline work includes:

- scene cameras used directly from the level
- camera cuts with trim/move support
- camera assignment per cut
- object transform keys
- camera FOV keys
- markers
- named timeline events
- floating timeline preview
- Normal / Final preview modes
- runtime triggering from collision boxes in Play Preview

It is still young, but the base idea is now in place: timelines are assets in the scene and can be played manually or triggered during gameplay.

### Sound Designer

The engine sound designer lets me place engine loops along an RPM arc, split ON/OFF throttle samples, test RPM ramps, and tune extra sound layers like turbo, blow-off, backfire, limiter, shifts and ignition.

Every slot has a fallback synth sound, so the car still works even before real samples are added.

### Playable Export

The editor can export a playable ZIP with the gameplay runtime, selected levels and referenced assets. The exported build does not include the editor.

This is the simplest publishing path: build locally in `engine_editor.html`, export the playable package, upload it to GitHub Pages, another static host or your own site, and share the result as a browser game. To share an inspectable project, publish the editor with a bundled `.lkep.json` demo.

## Current Status

This is still experimental. The editor is already useful for building and testing levels, but a lot is still moving quickly.

There are many systems left to fix and many more to add, and this is not a photoreal renderer today. Even so, the current browser-only editor can already build levels, interactive scenes, cinematics and playable experiments without requiring a large toolchain. I hope the current state is already fun to explore and that people use it to make many different projects; visual fidelity, extensibility and workflow depth can grow step by step from here.

The active `v0.7.0` milestone focuses on release-wide editor stability: complete Save/LKEP/playable persistence, smoother viewport and authoring interactions, modern Three.js rendering, improved reflections and cinematic optics, richer Player Car/Vehicle Pawn controls, and an integrated Developer Debugger for performance, stutter, error and scene-resource analysis.

The main focus areas after this milestone are:

- making Cinema Studio solid enough for real in-engine footage
- keeping the editor browser-only
- improving save/load reliability
- tightening the player car setup workflow
- completing Player Car Logic Element parity before considering removal of the built-in `player_car (Logic)`
- extracting independently instantiable vehicle physics/components behind a plugin-ready, attribution-friendly boundary
- hardening Logic Element with more browser tests and real use cases
- expanding the visual scripting compiler and macro system beyond the current foundation
- adding reusable editor-authored objectives and high-level game rules
- migrating the legacy Three.js runtime to a modern revision in controlled compatibility stages
- cleaning up release notes and docs as the project grows
- doing a proper asset provenance pass before any polished public release

For detailed version notes, see:

- `RELEASE_NOTES_v*.md`
- `docs/releases/`
- `docs/ARCHITECTURE.md`
- `docs/RUNTIME_MODULES.md`
- `docs/vehicle-pawn-parity-checklist.md`

## Project Layout

- `js/lot-king.js` - runtime bridge, main game setup and the `LOT_KING` API.
- `js/runtime/` - gameplay systems: physics, cameras, audio, HUD, track flow, input and related modules.
- `js/runtime/vehicle-pawns.js` - shared Vehicle Pawn registry, native adapter and independent Logic Element Pawn lifecycle.
- `js/editor/` - editor UI and tools.
- `js/logic/` - Logic Element graph model, node registry, validator, runtime, services, templates and exporter.
- `js/plugins/` - plugin host foundation and built-in plugin descriptors.
- `js/engine/scene-store.js` - project/level persistence, assets, player logic, sound sets and export data.
- `demo/` - optional bundled online demo project loaded on hosted origins.
- `css/` - runtime and editor styling.
- `models/`, `media/`, `musics/` - bundled runtime assets.
- `docs/` - architecture notes and release history.

## Run Locally

For a step-by-step startup guide, see `HOW_TO_START.md`.

From the repository root on Windows, the normal way I run it is:

```bat
avvio.bat
```

That starts the local server on port `5700` and opens the landing menu:

```text
http://localhost:5700/
```

The editor is loaded only after selecting **ENGINE EDITOR**. `PAGE=engine_editor.html` remains available as an explicit direct-editor override.

You can also start the project-aware local server yourself:

```bash
python3 serve_local.py 5700 --bind 127.0.0.1
```

Then open:

- `http://localhost:5700/`
- `http://localhost:5700/gameplay.html`
- `http://localhost:5700/engine_editor.html`

Browser storage is still origin-scoped internally, but `serve_local.py` keeps the complete authoritative project under `.lotking-local/` and restores all levels plus embedded assets when the local port changes. The Developer Debugger also refreshes `.lotking-local/developer-performance-latest.md`, a concise local diagnostic snapshot that can be inspected without exporting a file manually. A generic static server does not provide these disk bridges and falls back to the origin-specific browser cache; the debugger's complete JSON download remains available.

Opening files directly with `file://` can partially work, but a local server is the supported path. Models, audio files and browser storage behave much better that way.

## Large Local Assets

Some local files are authoring assets and are not meant for a normal Git commit:

- `models/player.glb` - current player vehicle model.
- `models_sources/` - Blender/source files, ignored by Git.

The repo should include the runtime assets needed to reproduce the playable state. Source files can stay local until there is a better asset-source publishing plan.

## Credits And Asset Notes

The project contains a mix of:

- project-authored code and assets
- AI-assisted or AI-generated assets
- bundled samples
- third-party or externally sourced references/assets

The music currently bundled with the project is AI-generated by the project owner.

Some assets still need a cleaner provenance pass. Before a polished public release, I want each external asset to have a clear source, license and attribution note.

Project-authored code and assets are covered by the project license. Third-party assets keep their own terms.

## AI-Assisted Development

I use AI coding tools heavily on this project, mostly as implementation help while I direct the design, test the builds, decide what stays, and keep correcting the result in the editor.

The project is not a one-prompt demo anymore. It is an ongoing browser engine/game experiment with a lot of manual testing, refactoring and iteration.

## Tech

- Three.js r128 (current legacy runtime baseline; modernization is planned)
- Cannon.js 0.6.2
- WebAudio
- LocalStorage
- IndexedDB
- plain JavaScript
- no framework and no bundler

### Three.js Upgrade Path

The runtime currently targets **Three.js r128**. Upstream Three.js has advanced to **npm 0.185.1 (the r185 generation) as of July 2026**, so this is a substantial modernization gap, not just a small move into the r15x series. The engine is intended to migrate in controlled stages because loaders, addons, color management, shaders, post-processing and renderer APIs changed significantly across those revisions.

Some advanced rendering/editor options currently use guarded fallbacks or can appear inactive because they were designed around capabilities that the legacy runtime does not fully expose. Moving to a modern Three.js baseline is expected to unlock or stabilize more of that work, including newer WebGL/WebGPU, node-material and post-processing paths. It will not automatically fix every experimental feature, so each subsystem will still need migration tests and visual parity checks. See the [Three.js releases](https://github.com/mrdoob/three.js/releases) and [official migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide).

Vehicle backend authorship, licenses and adapter modifications are tracked in [`docs/VEHICLE_PHYSICS_PROVENANCE.md`](docs/VEHICLE_PHYSICS_PROVENANCE.md).

## License

Lot King Engine Editor & Car Drift Game is released under the custom **Lot King Engine Builder & Car Drift Game Source License 0.1**.

In short: you can read, learn from, modify, fork, share, and commercially use project-authored parts, but public uses must credit **Lot King Engine Builder & Car Drift Game by jaydemks** and preserve the license notice.

This is source-available, not OSI-approved open source. See `LICENSE` for the exact terms.

## Roadmap

The project is moving toward a future `1.0.0` stable beta. The detailed roadmap lives in the active release notes and archived release docs, so this README can stay focused on what the project is and how to run it.
