# Lot King Engine Editor & Car Drift Game

Lot King is a browser drift game with the editor I am building around it.

It began as a small parking-lot drift prototype. Over time it turned into a bigger idea: a lightweight browser-only engine where I can build tracks, tune the player car, set up sounds, add assets, author camera sequences, and then play the result without leaving the browser.

There is no build step right now. It is plain JavaScript, Three.js, Cannon.js, static HTML pages, LocalStorage and IndexedDB.

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

### Project Workspace And Online Demo

The editor is local-first. On `localhost`, existing LocalStorage and IndexedDB projects continue to work, and the Project Workspace overlay can also sync a portable `.lkep.json` file where the browser supports file handles.

On hosted/static FTP deployments, the same project becomes a read-only online demo. The site owner can publish a bundled project at `demo/demo-project.lkep.json`; visitors can inspect, play and export the demo, but imports, uploads, saves, deletes and asset mutations are blocked so the server is not used as shared storage.

### Assets

The asset browser can manage imported GLB/GLTF models, scene assets, player car logic assets, engine sound sets and level assets. Larger imported files are stored in IndexedDB so they survive reloads.

### Player Car Setup

The `player_car` is treated as logic, not just a mesh. From the editor I can tune driving values, player collision, camera behavior, lights, underglow, exhaust sources, skid sources, 3D data widgets and reusable car logic presets.

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

## Current Status

This is still experimental. The editor is already useful for building and testing levels, but a lot is still moving quickly.

The main focus right now is:

- making Cinema Studio solid enough for real in-engine footage
- keeping the editor browser-only
- improving save/load reliability
- tightening the player car setup workflow
- cleaning up release notes and docs as the project grows
- doing a proper asset provenance pass before any polished public release

For detailed version notes, see:

- `RELEASE_NOTES_v*.md`
- `docs/releases/`
- `docs/ARCHITECTURE.md`
- `docs/RUNTIME_MODULES.md`

## Project Layout

- `js/lot-king.js` - runtime bridge, main game setup and the `LOT_KING` API.
- `js/runtime/` - gameplay systems: physics, cameras, audio, HUD, track flow, input and related modules.
- `js/editor/` - editor UI and tools.
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

## License

Lot King Engine Editor & Car Drift Game is released under the custom **Lot King Engine Builder & Car Drift Game Source License 0.1**.

In short: you can read, learn from, modify, fork, share, and commercially use project-authored parts, but public uses must credit **Lot King Engine Builder & Car Drift Game by jaydemks** and preserve the license notice.

This is source-available, not OSI-approved open source. See `LICENSE` for the exact terms.

## Roadmap

The project is moving toward a future `1.0.0` stable beta. The detailed roadmap lives in the active release notes and archived release docs, so this README can stay focused on what the project is and how to run it.
