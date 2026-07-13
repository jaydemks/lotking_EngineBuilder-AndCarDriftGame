# Lot King Engine Editor & Car Drift Game

https://github.com/user-attachments/assets/6ccccc17-4816-4251-8ef9-867ab7ec009e

## Project Status And Demo Availability

The complete author demo project (`.lkep.json`) is currently too large to publish directly in this GitHub repository. A separate download and a browser-based live demo that requires no installation are planned for upcoming releases.

Cloning or downloading the repository locally already provides the editor's default project template and the bundled level content available at that point in development. This should be enough to explore a substantial part of the current editor while the complete author demo is being prepared for separate distribution.

The editor cannot yet produce a fully featured finished car game on its own. Several reusable gameplay-authoring systems are still missing beyond the current drift-points foundation, including customizable objectives, broader game rules and more high-level Logic Element methods. The current release is a capable experimental engine/editor, but it should not yet be treated as a complete production game toolkit.

Many releases were developed in a short period during my available extra time. Development will continue, although updates may now arrive more slowly because the project has already become large for a single developer.

If a community grows around the project, everyone is welcome to create, exchange and share their own Lot King projects with other users.

Lot King is a browser drift game and a local-first 3D engine/editor being built around it.

The simplest way to describe it is this: you can download the project, run it locally, build a small but fairly complete browser car game, export a playable version, and publish that build on your own site without a traditional install/build pipeline. The same editor can also be published as a read-only online demo, or used more creatively as a browser 3D authoring tool for interactive scenes, cinematic pages, prototypes, and small game-like web experiences.

It began as a small parking-lot drift prototype. Over time it turned into a bigger idea: a lightweight browser-only engine where I can build tracks, tune the player car, set up sounds, add assets, author camera sequences, wire gameplay logic, and then play the result without leaving the browser.

The direction is inspired by tools like Unreal Engine, Blender, Premiere Pro and After Effects: not as a clone, and not with the same production scale, but with the same kind of ambition around visual editing, timeline-driven authoring, scene composition and node-based logic. The project stays deliberately simple at the tech level: plain JavaScript, Three.js, Cannon.js, static HTML pages, LocalStorage and IndexedDB. There is no build step right now.

## What You Can Do With It

- Make and test a browser drift/car game level locally.
- Tune the player car, camera, lights, collision, effects, sound and HUD.
- Import and place GLB/GLTF assets.
- Build levels in an editor with outliner, inspector, transform tools and Play Preview.
- Export a playable ZIP that contains the runtime and selected levels, without the editor.
- Publish a read-only online demo project on a normal static site.
- Use the editor creatively for 3D web scenes, interactive pages, cinematic shots or experimental browser experiences.
- Prototype gameplay logic with the experimental Logic Element visual scripting system.

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

On hosted/static FTP deployments, the same project becomes a read-only online demo. The site owner can publish a bundled project at `demo/demo-project.lkep.json`; visitors can inspect, play and export the demo, but imports, uploads, saves, deletes and asset mutations are blocked so the server is not used as shared storage.

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

This is the simplest publishing path: build locally in `engine_editor.html`, export the playable package, upload it to a static host or your own site, and share the result as a browser game. If you want people to inspect a project instead, you can publish the whole editor as a read-only online demo with a bundled `.lkep.json` project.

## Current Status

This is still experimental. The editor is already useful for building and testing levels, but a lot is still moving quickly.

There are many systems left to fix and many more to add, and this is not a photoreal renderer today. Even so, the current browser-only editor can already build levels, interactive scenes, cinematics and playable experiments without requiring a large toolchain. I hope the current state is already fun to explore and that people use it to make many different projects; visual fidelity, extensibility and workflow depth can grow step by step from here.

The `v0.6.5` milestone is implementation-complete for the current Logic Element scope. The next practical focus is manual/browser verification, presentation testing and follow-up hardening.

The main focus areas after this milestone are:

- making Cinema Studio solid enough for real in-engine footage
- keeping the editor browser-only
- improving save/load reliability
- tightening the player car setup workflow
- completing Player Car Logic Element parity before considering removal of the built-in `player_car (Logic)`
- extracting independently instantiable vehicle physics/components behind a plugin-ready, attribution-friendly boundary
- hardening Logic Element with more browser tests and real use cases
- expanding the visual scripting compiler and macro system beyond the current foundation
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

That starts the local static server on port `5600` and opens:

```text
http://localhost:5600/engine_editor.html
```

You can also start any static server yourself, for example:

```bash
python3 -m http.server 5600
```

Then open:

- `http://localhost:5600/`
- `http://localhost:5600/gameplay.html`
- `http://localhost:5600/engine_editor.html`

Try to keep using the same host and port while working. Browser storage is tied to the exact origin, so `localhost:5600`, `127.0.0.1:5600`, another port, or a LAN IP all have separate saved projects and IndexedDB assets.

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

- Three.js r128
- Cannon.js 0.6.2
- WebAudio
- LocalStorage
- IndexedDB
- plain JavaScript
- no framework and no bundler

Vehicle backend authorship, licenses and adapter modifications are tracked in [`docs/VEHICLE_PHYSICS_PROVENANCE.md`](docs/VEHICLE_PHYSICS_PROVENANCE.md).

## License

Lot King Engine Editor & Car Drift Game is released under the custom **Lot King Engine Builder & Car Drift Game Source License 0.1**.

In short: you can read, learn from, modify, fork, share, and commercially use project-authored parts, but public uses must credit **Lot King Engine Builder & Car Drift Game by jaydemks** and preserve the license notice.

This is source-available, not OSI-approved open source. See `LICENSE` for the exact terms.

## Roadmap

The project is moving toward a future `1.0.0` stable beta. The detailed roadmap lives in the active release notes and archived release docs, so this README can stay focused on what the project is and how to run it.
