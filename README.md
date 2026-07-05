# LOT KING ENGINE EDITOR & Car Drift Game

LOT KING ENGINE EDITOR & Car Drift Game is a browser drift game and the small game-engine editor used to build it.

It started as a single parking lot where you slide a car around and rack up drift points. It is now growing into a small browser-native engine workflow: you open the **Engine Editor**, build or edit a level, tune the vehicle, design how it sounds, save the level as an asset, and then play or export the game built from those levels.

No build step, no install. Plain JavaScript, static HTML entrypoints, browser storage, and a local static server.

Current main entrypoints:

- `index.html` - landing/menu shell.
- `gameplay.html` - playable runtime used by the local game and exported builds.
- `engine_editor.html` - standalone editor.
- `drift-parking-lot.html` - compatibility redirect to the new landing page.

## What you can do

**Play.** Pick a track from the level select, start the engine and drift. Points for angle and speed, cones to kick around, a working gearbox with a limiter, slow-motion radio mode (TAB), day/night cycle, damage-free arcade physics that's easy to pick up.

**Build levels.** The Engine Editor gives you a free-fly camera, selection and transform gizmos (move/rotate/scale with snapping), an outliner, an inspector, undo/redo, and context menus. You can add primitives, lights and particle effects, import your own GLB/GLTF models, and lay out a whole new track. Levels are real assets: create, save, save-as, rename, duplicate, delete, export to a `.lkep` file and import it back. Every level you save shows up as a playable card in the game's track selection screen.

**Manage assets.** The Assets tab collects everything reusable in one place: your levels, imported 3D models (stored in IndexedDB so big files survive reloads), scene assets, player blueprints and engine sound sets. Drag models straight into the viewport, filter by type, right-click for actions, and choose whether a dropped asset should be placed normally or replace the object under the cursor.

**Design your car.** The player vehicle is a blueprint: driving setup (torque, grip, oversteer, handbrake...), camera modes (arcade follow, cinematic drift, aspect ratios, DOF and color grading), vehicle lights and underglow neon, exhaust smoke/fire anchors, 3D data widgets floating next to the car. Blueprints can be copied, promoted to project default, and reused across levels.

**Design your sound.** The Engine Sound Designer is an interactive illustration of the engine: an SVG tachometer where you drag your RPM loop samples along the arc (separate ON-throttle and OFF-throttle banks, crossfaded in real time), hotspots on the engine for turbo whine, blow-off, backfire, gear shifts, limiter and ignition, plus filters, sine modulation, reverb and a full tester (gas, auto-RPM, ramps) so you can hear everything before you drive. Every slot has a synthetic fallback, so the car always sounds like something even with zero samples loaded. Sound sets are assets too — build several and swap them per vehicle.

**Tweak the HUD.** The radio/sound HUD is editable in place: move and scale the frame PNG and the digital interface, position the clickable volume/bass buttons over your own artwork, and it all persists with the project.

**Export a playable game.** From the editor you can export a playable ZIP that includes the gameplay runtime, the selected levels, and the assets referenced by those levels. The exported package does not include the editor. It is meant to be playable locally through a small static server and publishable on ordinary static hosting/FTP.

## Current status

The project is still experimental and moving quickly. The editor is already useful for building and tuning levels, but the long-term scope is still open: more editor tooling, better default content, security hardening, asset pipeline decisions, and a more polished default starter level are expected.

The current direction is:

- **Engine Editor** for creating projects, levels, player setup, audio, HUD, and assets.
- **Gameplay Runtime** for playing projects without loading editor code.
- **Playable ZIP Export** for publishing a game build without shipping the editor.
- **Default content** based on bundled/free/self-made assets so the editor opens with a usable starter project.

## Documentation and release notes

The README is intentionally kept stable so it does not need to be rewritten for every version.

Version-specific status, completed work, known issues, and roadmap notes live in the project docs and are updated together with each release:

- `docs/releases/` - archived release notes for completed milestones.
- `docs/ARCHITECTURE.md` - high-level editor/runtime architecture notes.
- `docs/RUNTIME_MODULES.md` - runtime module map and responsibilities.
- `RELEASE_NOTES_v*.md` - release-preparation notes when a new version is being finalized.

## Project layout

- `index.html` — landing/menu shell.
- `gameplay.html` — gameplay runtime entrypoint.
- `engine_editor.html` — standalone editor entrypoint.
- `drift-parking-lot.html` — compatibility redirect to the landing page.
- `js/lot-king.js` — the runtime bridge: game setup, main loop, and the `LOT_KING` API everything talks through.
- `js/runtime/` — gameplay modules: world generation, physics, sky, audio, engine sound sets, cameras, HUD, track catalog, session flow, and so on.
- `js/editor/` — the Engine Editor UI, project/level tools, playable export pipeline, and the Sound Designer overlay.
- `js/engine/scene-store.js` — persistence: level library, project (LKEP) export/import, asset blobs, player blueprints, sound sets.
- `css/` — game and editor styling.
- `docs/` — architecture notes, runtime module notes, and versioned release history.
- `models/`, `media/`, `musics/` — bundled assets (car models, HUD art, engine samples, music).

## Large Assets

The local working folder may contain large authoring/runtime assets that are not meant for a normal Git commit:

- `models/player.glb` — player vehicle GLB. The goal is to optimize it below normal repository size limits so it can be included directly with the project.
- `models_sources/` — local Blender/source authoring files. This folder is not meant to be committed to Git and is ignored by `.gitignore`.

The project should include the runtime assets needed to reproduce the public playable/video state of the game. Source authoring files remain local unless a dedicated asset-source publishing strategy is chosen later.

## Credits and asset provenance

This project includes a mix of project-authored assets, AI-assisted/generated assets, bundled runtime samples, and third-party or externally sourced material.

Known current notes:

- Music tracks bundled with the project are AI-generated by the project owner and are intended to be included with the project.
- Runtime/editor code is project-authored unless a file clearly comes from an external library or CDN dependency.
- Some 3D models, samples, textures, or reference assets may require attribution or separate license notes before a fully polished public release.
- A dedicated credits/provenance pass is still needed to identify each external asset, its source, its license, and required attribution.

The custom project license covers project-authored code and project-authored assets. Third-party assets remain under their own terms.

## Tech

Three.js r128 for rendering, Cannon.js 0.6.2 for optional physics, WebAudio for all sound (procedural synth plus sample-based engine audio), LocalStorage + IndexedDB for persistence. No frameworks, no bundler.

## License

LOT KING ENGINE EDITOR & Car Drift Game is released under the custom **Lot King Engine Builder & Car Drift Game Source License 0.1**. In short: you can read, learn from, modify, fork and share project-authored parts, but public uses must credit **Lot King Engine Builder & Car Drift Game by w4k3**. Commercial use is allowed below USD 100,000 gross revenue; above that threshold, a separate written commercial agreement must be negotiated.

This is source-available, not OSI-approved open source, because it includes attribution and commercial revenue conditions. See `LICENSE` for the exact terms.

## How this project is made

LOT KING ENGINE EDITOR & Car Drift Game is an experiment in AI-assisted development, with a human directing, testing and correcting everything.

The very first version (0.0.1) was born from a **single prompt** to Claude (Fable 5) in a normal chat — one shot, one playable parking lot. From 0.0.2 onward the project moved into a real iterative workflow: Claude Code and Codex working inside VS Code, with the project owner driving the design and playing every build — and more than once switching from one AI to the other to keep going when a session lost the thread. The release notes tell that story honestly.

## Run it locally

Start any static server from the project root, for example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

Opening the HTML file directly (`file://`) partially works, but a local server is the supported way: models, audio samples and browser storage all behave correctly there.

To open specific surfaces directly:

- `http://localhost:8000/gameplay.html`
- `http://localhost:8000/engine_editor.html`

## Roadmap

The project is moving toward a future **1.0.0 Stable Beta**. The detailed roadmap is tracked through the active release notes and the archived milestone notes in `docs/releases/`, so GitHub's main README can stay focused on what the project is and how to run it.
