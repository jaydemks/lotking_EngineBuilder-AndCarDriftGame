# Lot King Engine Editor & Car Drift Game

[![Try on GitHub Pages](https://img.shields.io/badge/TRY_IT_LIVE-GitHub_Pages-2ea44f?style=for-the-badge&logo=github)](https://jaydemks.github.io/lotking_EngineBuilder-AndCarDriftGame/)
[![Sponsor on GitHub](https://img.shields.io/badge/SPONSOR-jaydemks-ea4aaa?style=for-the-badge&logo=githubsponsors)](https://github.com/sponsors/jaydemks)

> Build, play and export 3D browser experiences without leaving the browser.

Music is included with the project and may be used for any purpose. If you enjoy or reuse it, please consider following the featured artists and occasionally supporting their work with a view, like, comment or share.

## Videos

### v0.7.1 development preview

[▶ Watch the v0.7.1 editor and gameplay preview](<docs/media/Lotkinged 071_LQ.MP4>)

### Earlier v0.6.x preview

[▶ Watch the earlier v0.6.x project preview](<docs/media/Lotkinged 062_LQ.mp4>)

Lot King is a browser-only 3D engine and editor built with JavaScript, Three.js and Cannon.js. It started as a parking-lot drift game, then slowly became a place where I can build levels, vehicles, characters, cinematics, interactive scenes and small browser games.

It is still experimental and it is not trying to replace Unreal Engine. The idea is simpler: open the browser, make something in 3D, test it immediately and export a playable project without setting up a large toolchain.

## What can you do?

- Build projects with multiple gameplay levels and custom 3D menu scenes.
- Import GLB/GLTF models and use FBX sources through the built-in importer plugin.
- Place and edit models, materials, lights, text, effects, collisions and procedural environments.
- Build and tune car-racing or drift experiences, currently the most complete gameplay path.
- Create Vehicle, Character and Soccer Pawns, then test them directly in the editor.
- Give a Character a rigged model and a set of Mixamo animations through Pawn Studio.
- Build visual JavaScript logic with reusable Logic Elements, variables, Functions and Subgraphs.
- Make cinematics, engine sound sets, HUD layouts and interactive scenes.
- Test everything with Play Preview or Simulate.
- Inspect, back up and selectively clean Lot King browser storage from Editor Settings.
- Export portable `.lkep.json` projects or standalone playable ZIP files ready for your website.
- Connect two browser sessions with the P2P plugin for multiplayer logic and experimental coworking.

You can use it for a racing game, a 3D page, a cinematic scene, a prototype or something completely different. More gameplay methods and reusable game rules will be added over time. Character and Mixamo support already works as a serious authoring foundation, but it is still heavily in development and should be treated as an experimental workflow rather than a finished character system.

## Visual logic, backed by JavaScript

Logic Elements are inspired by Blueprint-style node editors, but they belong to this engine and its JavaScript codebase. A Logic Element can contain its own graph, 3D contents, variables, components and settings, then be reused in different scenes. The graph runtime executes registered JavaScript node behavior without `eval`, and the editor can also export graph foundations as JavaScript or TypeScript.

This makes it possible to build gameplay visually while keeping the underlying system familiar to web developers. Node coverage, the compiler and higher-level game rules are still growing.

## From the editor to your website

Projects can be saved as portable `.lkep.json` files for continued authoring. The playable exporter creates a standalone ZIP with the selected levels, runtime and referenced assets, without including the editor. That package can be placed on a normal website or a static host and launched directly in the browser. The export path will become more modular as the runtime and plugin boundaries continue to mature.

## Try it

The public demo runs directly on [GitHub Pages](https://jaydemks.github.io/lotking_EngineBuilder-AndCarDriftGame/). A modern browser and reasonably capable hardware are recommended.

The hosted DEMO is a complete private browser workspace. Its author snapshot is copied into storage belonging only to the current browser profile, so levels, assets and editor changes can be saved and reopened without uploading anything or changing the shared GitHub project. A local folder or portable LKEP export remains available when a file copy is wanted.

To work locally on Windows, run:

```bat
avvio.bat
```

Then open `http://localhost:5700/`. The launcher also prints LAN addresses, so you can test the same build from a Mac, phone or another computer on your network. Each browser gets its own workspace unless you deliberately share a P2P snapshot.

Opening the project through `file://` is not supported. Use the local server so models, audio, storage and exports work correctly.

## Want the details?

- [Technical README](README_TECHNICAL.md) — editor systems, architecture, storage, export and project structure.
- [How to start](HOW_TO_START.md) — complete local and network startup guide.
- [P2P sessions and coworking](docs/P2P_SESSIONS_AND_COWORKING.md) — connect two editors and test authority, transforms and reviewed snapshots.
- [v0.7.4 release notes](RELEASE_NOTES_v0.7.4.md) — current browser storage control release.
- [v0.7.3 release notes](docs/releases/v0.7.3.md) — private browser DEMO workspace release.
- [v0.7.2 release notes](docs/releases/v0.7.2.md) — atomic loading, input and safe online-workspace foundations.
- [v0.7.1 release notes](docs/releases/v0.7.1.md) — Pawn Studio, soccer gameplay and cross-platform authoring.
- [Documentation](docs/) — architecture, runtime modules, Pawn Studio, Logic Elements and Three.js maintenance.

## Project status

Lot King has been public and versioned since the `v0.5.0-beta` Git-ready baseline. Every release since then has preserved a recoverable stage of the editor and runtime while the project continues moving toward a future stable beta.

The `v0.7.0` milestone completed the main migration from the old Three.js r128 runtime to the pinned r185 generation. The `v0.7.1` cycle built Pawn Studio, FBX/Mixamo authoring, soccer gameplay, LAN/P2P experiments and broader cross-platform support. Version `v0.7.2` concentrated on deterministic first loading and independent Character/Vehicle input contexts. Version `v0.7.3` turned the hosted author DEMO into a complete, isolated browser workspace instead of requiring a folder before normal saving and editing. Version `v0.7.4` adds a professional browser-storage inventory so those local projects, levels, assets and preferences can be diagnosed, backed up and cleaned selectively from inside the editor.

Recent testing exposed important macOS, Safari and Apple WebGL differences that were not visible on the main Windows development setup. Startup, storage, DEMO loading and conservative rendering fallbacks have been improved, but browser, operating-system and GPU coverage remains an ongoing part of every release.

The project remains experimental and each release documents a real working checkpoint, not a claim that every system is finished. Some combinations may still fail, especially after changes this broad. Feedback and bug reports are welcome, and browser, device and GPU details are particularly useful when behavior differs across Windows, macOS, Chrome, Safari or another environment.

### What still needs attention before moving further

- More real-world testing on Windows and macOS, both locally and from a hosted build.
- Save, import, DEMO publishing and playable export round trips with larger real projects.
- Character rigs, Mixamo/FBX animation sets and Pawn behavior across editor preview and final gameplay.
- Rendering consistency across browsers, GPUs and different quality settings.
- More hardening for Logic Elements, Cinema Studio and complex multi-level projects. The P2P foundation already connects peers, exchanges Logic messages, mirrors authority-owned transforms and transfers reviewed project snapshots, while wider network conditions and conflict-safe collaboration still need more testing.
- Continue the asset-by-asset provenance audit. Known libraries and several external references are already documented, but some bundled or historical assets still need a verified source, license and attribution entry.

### Things I may explore later

- More Pawn families such as animals, boats, aircraft and other controllable actors.
- Reusable objectives and higher-level game rules built through visual logic.
- Deeper multiplayer and coworking tools once conflict handling is solid enough.
- Optional AI API tools that can create a structured level foundation while keeping the author in control.
- WebGPU, TSL and more advanced rendering paths when they can match the current portable WebGL workflow.

This list will change as the project changes. For now the priority is to protect the progress already made, test it properly and fix the problems people actually find.

The very first drift prototype came from a single prompt in Fable 5. The project then grew far beyond that experiment through continued development with GPT-5.6 Sol, with me directing the design, testing the builds, reviewing what stays and repeatedly reorganizing the code as new systems meet older ones.

Keeping a browser engine, editor, game logic, exports and documentation together takes attention and a surprising amount of retesting. There are already many complete and incomplete systems to explore, and I hope people have fun with what works today. Contributions are welcome, especially fixes, reusable logic, tutorials, videos and examples that can help more people understand the project without slowing development to create every piece of learning material alone.

It is not a big-tech project, but I think it has real potential. Building it with more expensive creative models for every long implementation pass would probably have taken much longer and cost far more; the current workflow made this scale of iteration possible while keeping the project under human direction.

## Credits

Music featured in the project includes work by [Num0](https://www.youtube.com/@Num0-music). Please consider following and supporting the artists whose music helps give Lot King its atmosphere.

Lot King builds on [Three.js](https://threejs.org/), [cannon.js](https://github.com/schteppe/cannon.js/) and [JSZip](https://stuk.github.io/jszip/). Cinematic lens flare work references Anderson Mancini's R3F Ultimate Lens Flare, while Cloth Studio is inspired by the MIT-licensed [three-simplecloth](https://github.com/bandinopla/three-simplecloth) project and the official [Three.js WebGPU compute-cloth example](https://github.com/mrdoob/three.js/blob/a58e9ecf225b50e4a28a934442e854878bc2a959/examples/webgpu_compute_cloth.html).

See [third-party notices](vendor/THIRD_PARTY_LICENSES.md) for authorship and license details. The broader asset attribution audit is still ongoing, so please report anything that needs a clearer credit.

The project uses the custom **Lot King Engine Builder & Car Drift Game Source License 0.1**. You can read, learn from, modify, fork, share and commercially use project-authored parts, but public uses must preserve the required credit and license notice. See [LICENSE](LICENSE) for the exact terms.
