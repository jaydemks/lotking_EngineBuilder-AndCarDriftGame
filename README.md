# Lot King — Browser-Native 3D Game Engine & Editor

[![Try on GitHub Pages](https://img.shields.io/badge/TRY_IT_LIVE-GitHub_Pages-2ea44f?style=for-the-badge&logo=github)](https://jaydemks.github.io/lotking_EngineBuilder-AndCarDriftGame/)
[![Sponsor on GitHub](https://img.shields.io/badge/SPONSOR-jaydemks-ea4aaa?style=for-the-badge&logo=githubsponsors)](https://github.com/sponsors/jaydemks)

> It started as a parking-lot drift prototype.<br>
> Now it is growing into a browser-native engine for building many kinds of games and interactive 3D experiences.

**Current version: `v0.7.5` · Experimental Alpha**

[Open Lot King Online](https://jaydemks.github.io/lotking_EngineBuilder-AndCarDriftGame/) ·
[Technical README](README_TECHNICAL.md) ·
[How to Start](HOW_TO_START.md) ·
[Release History](docs/releases/)

---

## What is Lot King?

Lot King is an experimental, local-first 3D game engine and visual editor that runs entirely in the browser.

It began as a small car drift game, but it is not a car-only editor. It is gradually growing into a tool for assembling imported 3D assets into levels, interactive visuals and playable browser projects, then connecting them through physics, animation, cinematics, sound and visual JavaScript logic.

Lot King is not a complete 3D modelling package. Vehicles, characters and other complex meshes are normally created in Blender or another dedicated tool and then imported as GLB, GLTF or FBX assets. Inside Lot King you can place and transform them, adjust supported mesh, material, texture and animation properties, and connect them to gameplay systems.

The main workflow is simple:

**Assemble an experience → test it immediately → export it for the browser.**

Today, the easiest ready-to-use results are still simple games and 3D visuals, with car racing and drifting as the most complete gameplay path. Friendly one-step tools for common objectives, game rules and fully customizable UI flows are still being developed.

Logic Elements already provide a Blueprint-inspired way to create many custom interactions and gameplay dynamics through visual JavaScript logic. The system will become broader and easier over time, with development guided by real testing, feedback, contributions and other forms of community support.

Lot King is not intended to replace established engines. It is an ongoing attempt to see how far a local-first, browser-only engine can be pushed.

---

## Videos

### v0.7.1 editor and gameplay preview

https://github.com/user-attachments/assets/9c1c8dc2-2d93-4434-958f-23d9f546ac55

### Earlier v0.6.x preview

https://github.com/user-attachments/assets/c481af98-95d2-46b7-aac4-99a6be812e85

The current `v0.7.5` contains additional systems and fixes that are not shown in these videos yet.

---

## What can it do now?

- Build projects with multiple levels and custom 3D menu scenes.
- Import GLB, GLTF and FBX-based assets, then place, transform and configure their supported properties.
- Search free online models and PBR textures with Asset Scout and import them without leaving the editor.
- Build simple playable browser projects and interactive 3D visuals.
- Create custom interactions and reusable gameplay behavior with Logic Elements.
- Create and tune Race or Drift vehicle gameplay.
- Edit collision, physics, cameras, lights, effects, sound and the currently supported HUD systems.
- Configure Vehicle, Character and Soccer Pawns around imported assets or placeholders.
- Build first- **and** third-person shooter gameplay from one rig: eye camera or over-the-shoulder camera, aim down sights, telescopic sights with real magnification, configurable hitscan weapons, arms and a visible weapon.
- Give characters a full traversal move set — crouch, slow walk, slide, roll, vault, mantle, ladders, climbable walls and ledge hanging with pull-up — shared by both camera views.
- Author doors, ladders, carryable crates, delivery pads, buttons and pickups as plain data on any object, so a primitive or an imported model becomes interactive without a second code path.
- Choose the shape of the inventory per project — no inventory, weapon slots, or a backpack that stores consumables — and drop, throw, swap and pick weapons back up off the ground.
- Give characters health, armour, stamina and respawn through the same damage contract that makes props shootable.
- See the rounds fly: tracers shaped by the weapon calibre and impact flashes, drawn from a fixed pool so sustained fire never costs more than the first shot.
- Drop, throw and shoot loose objects and watch them fall, bounce and settle according to their mass.
- Design on-foot audio in the Character Sound Designer: footsteps that change with the surface underfoot, weapon fire per weapon class, jump, landing and breathing. Every sound is synthesised procedurally by default, so a project has full character audio with no media files; any slot can be replaced with your own sample.
- Assign rigged characters and Mixamo animations through Pawn Studio.
- Create camera sequences with Cinema Studio.
- Test projects through Play Preview or Simulate.
- Export portable `.lkep.json` projects.
- Export standalone playable ZIP builds for static websites.
- Experiment with browser-to-browser P2P gameplay and coworking.

For the complete feature and architecture breakdown, read the
[Technical README](README_TECHNICAL.md).

---

## Browser and local workspaces

The hosted version works as a private writable browser workspace.

Projects and imported assets are stored only inside the current browser profile. They are not uploaded to GitHub and are not shared with other visitors.

Choosing a local folder is optional. It can be used as a portable mirror when direct file access is preferred.

Version `0.7.4` also adds a dedicated interface for inspecting and cleaning the LocalStorage, IndexedDB and cached data used by Lot King.

Important projects should still be backed up as `.lkep.json` files or stored in an authorized local folder.

---

## From v0.0.1 to v0.7.5

The first version, `v0.0.1`, was a small drift prototype created from one prompt.

The Git-ready public history began at `v0.5.0-beta`. Since then, Lot King has gone through **26 public versioned milestones**, reaching `v0.7.5`.

Each milestone preserves a real stage of the project rather than hiding the development history behind one final upload.

See the complete [release history](docs/releases/).

---

## One developer, fully AI-assisted

Lot King is built and directed by one person.

I have not manually typed the implementation code line by line. AI coding tools generate the code, but they do not decide what the project becomes.

I define the systems, design the workflows, divide the work into stages, test the results, find regressions, read the logs, reject wrong implementations, direct refactors and decide what is released.

**The code is AI-generated. The project is human-directed and orchestrated.**

---

## Try it

Open the hosted workspace:

**https://jaydemks.github.io/lotking_EngineBuilder-AndCarDriftGame/**

To run it locally on Windows:

```bat
avvio.bat
```

Then open:

```text
http://localhost:5700/
```

Opening the project directly through `file://` is not supported.

---

## Technology

Lot King currently uses:

- JavaScript, HTML and CSS
- Three.js `r185`
- Cannon.js
- Web Audio API
- LocalStorage and IndexedDB
- File System Access APIs where supported
- JSZip
- Playwright for browser testing

There is no mandatory framework, bundler or cloud backend.

---

## Current status

Lot King is usable, but still experimental.

The vehicle and drift workflow is the strongest part today, and on-foot shooter gameplay is the fastest moving. Character animation, visual logic, Cinema Studio, P2P systems, browser compatibility and larger project round trips still need more testing and refinement. Faster authoring for common objectives, game rules and project-specific UI is also still missing.

The FPS layer is playable end to end but not finished: item contacts are spheres against boxes rather than a rigid-body solver, hits leave a flash rather than a decal, and traversal is animated procedurally until real clips are bound. The current limits are listed in full in [First Person Pawn](docs/FIRST_PERSON_PAWN.md).

Bugs and incomplete systems should be expected while development continues.

Feedback, testing, documentation, example projects, reusable logic and other forms of support can all help the engine mature faster.

---

## Documentation

- [Technical README](README_TECHNICAL.md)
- [Startup guide](HOW_TO_START.md)
- [Current v0.7.5 release notes](RELEASE_NOTES_v0.7.5.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Runtime modules](docs/RUNTIME_MODULES.md)
- [First Person Pawn](docs/FIRST_PERSON_PAWN.md) — the shooter layer: rig, traversal, items, interactions, vitals and inventory
- [Release history](docs/releases/)

A screenshot-based manual may be added later, when the interface is stable enough that hundreds of screenshots will not immediately become outdated.

---

## Credits and license

Lot King builds on [Three.js](https://threejs.org/), [cannon.js](https://github.com/schteppe/cannon.js) and [JSZip](https://stuk.github.io/jszip/).

See the repository documentation and third-party notices for additional credits and asset provenance.

Music is included and may be used in Lot King projects. If you enjoy it, please support the artists with a follow, comment, like or share; [Num0 is on YouTube](https://www.youtube.com/@Num0-music).

The project is publicly **source-available** under the custom
[Lot King Source License 0.1](LICENSE). It is not released under an OSI-approved open-source license.

---

Built and directed by **Giò / Jaydem**

[GitHub](https://github.com/jaydemks) ·
[X](https://x.com/jaydem_world) ·
[LinkedIn](https://www.linkedin.com/in/giodemiccoli/)
