# Lot King

Lot King is a drift game that runs entirely in the browser — and, at the same time, the small game engine you use to build it.

It started as a single parking lot where you slide a car around and rack up drift points. It's growing into something closer to a tiny Unreal-style workflow: you open the **Engine Editor**, build or edit a level, tune your car, design how it sounds, save the level as an asset — and then go back to the main menu and actually play the thing you just made.

No build step, no install. One HTML file, plain JavaScript, and a local static server.

## What you can do

**Play.** Pick a track from the level select, start the engine and drift. Points for angle and speed, cones to kick around, a working gearbox with a limiter, slow-motion radio mode (TAB), day/night cycle, damage-free arcade physics that's easy to pick up.

**Build levels.** The Engine Editor gives you a free-fly camera, selection and transform gizmos (move/rotate/scale with snapping), an outliner, an inspector, undo/redo, and context menus. You can add primitives, lights and particle effects, import your own GLB/GLTF models, and lay out a whole new track. Levels are real assets: create, save, save-as, rename, duplicate, delete, export to a `.lkep` file and import it back. Every level you save shows up as a playable card in the game's track selection screen.

**Manage assets.** The Assets tab collects everything reusable in one place: your levels, imported 3D models (stored in IndexedDB so big files survive reloads), scene assets, player blueprints and engine sound sets. Drag models straight into the viewport, filter by type, right-click for actions.

**Design your car.** The player vehicle is a blueprint: driving setup (torque, grip, oversteer, handbrake...), camera modes (arcade follow, cinematic drift, aspect ratios, DOF and color grading), vehicle lights and underglow neon, exhaust smoke/fire anchors, 3D data widgets floating next to the car. Blueprints can be copied, promoted to project default, and reused across levels.

**Design your sound.** The Engine Sound Designer is an interactive illustration of the engine: an SVG tachometer where you drag your RPM loop samples along the arc (separate ON-throttle and OFF-throttle banks, crossfaded in real time), hotspots on the engine for turbo whine, blow-off, backfire, gear shifts, limiter and ignition, plus filters, sine modulation, reverb and a full tester (gas, auto-RPM, ramps) so you can hear everything before you drive. Every slot has a synthetic fallback, so the car always sounds like something even with zero samples loaded. Sound sets are assets too — build several and swap them per vehicle.

**Tweak the HUD.** The radio/sound HUD is editable in place: move and scale the frame PNG and the digital interface, position the clickable volume/bass buttons over your own artwork, and it all persists with the project.

## Current Status

Current working milestone: **0.5.0-beta**.

This is the first Git-ready consolidation pass. The runtime has already been split into focused modules, and the editor refactor is underway, but the editor is still being stabilized carefully after a risky extraction temporarily disconnected parts of the UI. The current priority is keeping the Engine Editor usable and recoverable before continuing the next refactor slices.

Recently restored editor areas include transform gizmos, viewport camera movement, menu music controls, loading/progress overlays, settings tabs, pinned sidebar icons, quick audio positioning, and the top toolbar actions.

## Project layout

- `drift-parking-lot.html` — the entry point (game + editor).
- `js/lot-king.js` — the runtime bridge: game setup, main loop, and the `LOT_KING` API everything talks through.
- `js/runtime/` — gameplay modules: world generation, physics, sky, audio, engine sound sets, cameras, HUD, track catalog, session flow, and so on.
- `js/editor/` — the Engine Editor UI, the lazy loader, and the Sound Designer overlay.
- `js/engine/scene-store.js` — persistence: level library, project (LKEP) export/import, asset blobs, player blueprints, sound sets.
- `css/` — game and editor styling.
- `models/`, `media/`, `musics/` — bundled assets (car models, HUD art, engine samples, music).

## Large Assets

The local working folder may contain large authoring/runtime assets that are not meant for a normal Git commit:

- `models/player.glb` — large player vehicle GLB, should be published through Git LFS or as a release asset.
- `models_sources/` — Blender source files, kept locally unless the project moves to Git LFS.

The project can still be versioned and reviewed without those files, but a complete public playable package should include them through a proper asset release pipeline.

## Tech

Three.js r128 for rendering, Cannon.js 0.6.2 for optional physics, WebAudio for all sound (procedural synth plus sample-based engine audio), LocalStorage + IndexedDB for persistence. No frameworks, no bundler.

## License

Lot King is released under the custom **Lot King Source License 0.1**. In short: you can read, learn from, modify, fork and share it, but public uses must credit **Lot King by w4k3**. Commercial use is allowed below USD 100,000 gross revenue; above that threshold, a separate written commercial agreement must be negotiated.

This is source-available, not OSI-approved open source, because it includes attribution and commercial revenue conditions. See `LICENSE` for the exact terms.

## How this project is made

Lot King is an experiment in AI-assisted development, with a human directing, testing and correcting everything.

The very first version (0.0.1) was born from a **single prompt** to Claude (Fable 5) in a normal chat — one shot, one playable parking lot. From 0.0.2 onward the project moved into a real iterative workflow: Claude Code and Codex working inside VS Code, with the project owner driving the design and playing every build — and more than once switching from one AI to the other to keep going when a session lost the thread. The release notes tell that story honestly.

## Run it locally

Start any static server from the project root, for example:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/drift-parking-lot.html
```

Opening the HTML file directly (`file://`) partially works, but a local server is the supported way: models, audio samples and browser storage all behave correctly there.

## Where it's going

The current working version is **0.5.0-beta**, on the road to **1.0.0 Stable Beta**. Between here and there: a formal level format with versioned migrations (old tracks must keep loading as the engine grows), a proper split between "export editor project" and "build playable track", real mesh collision for imported maps, GLB hierarchy editing, and the groundwork for sharing tracks online. See `RELEASE_NOTES.md` for the full history and the current plan.
