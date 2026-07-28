# Lot King Engine — Technical README

This document contains the deeper project information that used to live in the main README. If you only want to understand what Lot King does or start it locally, begin with the [short README](README.md).

## Current technical status

Lot King is a local-first, browser-native 3D engine/editor in active development. It uses plain JavaScript, Three.js and Cannon.js, with static browser files and no mandatory runtime framework or application build step.

The released `v0.7.5` milestone adds **Asset Scout** (free online model and texture search imported straight into the project) and a **first-person Pawn** with its own FPS Shooter Test level. Both are additive: the existing import paths and the third-person character path are unchanged.

The released `v0.7.4` milestone adds granular browser-storage inspection and recovery controls to the private workspace introduced in v0.7.3. Projects, levels, preferences, imported asset blobs, workspace handles, explicit caches and Lot King service workers can be audited from Editor Settings without exposing unrelated origin data. Pawn Studio, source-preserving FBX import, Mixamo retargeting and the Three.js r185 baseline remain central foundations.

Editor startup and every Play/Simulate session now include a visible, reversible runtime pre-benchmark. It prepares real project render/physics paths and measures sustained frames; devices remaining below 25 FPS receive a conservative Low video profile. This is a recommendation, not a lock: any explicit change in Video settings becomes the user's persistent override.

Car racing and drifting remain the most complete gameplay path. Character Pawns can already use a custom rigged Main Mesh and independent Mixamo/FBX/GLB motion sources, but character authoring, retargeting and gameplay integration remain strongly experimental. More gameplay categories and reusable game rules will be added incrementally instead of presenting every current template as equally mature.

It is not yet a finished general-purpose engine, a photoreal renderer or a replacement for dedicated DCC modelling software. Complex vehicle, character and environment meshes are authored externally and imported; the editor can place them and modify supported transform, mesh-part, material, texture and animation properties. Reusable editor-authored objectives, broader game rules, simple project-specific UI authoring and several high-level Logic Element workflows are still being built. Experimental features can change and some combinations still need browser and device hardening.

## Main pages

- `index.html` — landing page and 3D menu background.
- `gameplay.html` — playable runtime.
- `engine_editor.html` — full editor.
- `drift-parking-lot.html` — old compatibility redirect.

## Editor and gameplay

The most mature playable foundation is currently an arcade drift game. It demonstrates driving, scoring, props, gearbox and handbrake behavior, radio, handling authoring and the portable runtime, while the engine itself is designed to support additional gameplay categories. The vehicle goal is responsive, cinematic driving rather than strict simulation.

The editor runs entirely in the browser and includes projects, levels, an outliner, inspector, transform gizmos, undo/redo, context menus, snapping, multi-selection, collision editing, asset placement and level save/load.

Play Preview runs the authored level inside the editor viewport. Simulate uses the same runtime, event and physics path while keeping the editor tools active, so logic can be tested without taking control away from the editor.

The environment tools include procedural sky and day/night state, fog, lighting, sun bloom, lens flare, volumetric clouds, rain and shared rendering profiles.

The r185 WebGL post-processing path keeps screen-space depth effects separate from optical sprites and transparent effects. GTAO excludes lens flare, sun, clouds, smoke and related non-depth helpers from its depth override, avoiding camera-dependent dark rectangles around those effects. Apple Metal/WebKit contexts use a capability-based conservative screen-space profile when a pass is known to be unreliable.

## Project workspace, storage and LAN access

Projects are stored in LocalStorage, while larger imported files use IndexedDB. Browser storage is origin-scoped, so `localhost`, a LAN IP and an online host normally have separate browser databases.

Editor Settings → Storage provides an origin-scoped inventory of Lot King LocalStorage, SessionStorage, IndexedDB asset/workspace stores, Cache Storage and service-worker registrations. The Cleanup Assistant marks the currently active project/level, other catalogued saves, current preferences/system records, out-of-catalog review candidates and safely rebuildable temporary/cache data. Embedded save dates are shown when available; the interface explicitly explains that suffixes such as `.v1` identify a data schema rather than an older chronological copy. Filters and assisted selection keep active/valid records separate from review candidates. Individual entries can then be removed without exposing or deleting unrelated application keys. The same panel reports catalog/blob discrepancies, exports a metadata-only inventory, backs up and restores Lot King LocalStorage, requests persistent browser storage and links to the normal portable LKEP export. High-impact project, level and asset cleanup requires an explicit backup acknowledgement and typed confirmation. Regular browser HTTP cache cannot be enumerated selectively by a web page, so the panel explains when browser site-data controls or a hard reload are required.

On `localhost`, `serve_local.py` also keeps the complete authoritative project under `.lotking-local/`. This disk bridge can restore levels and embedded assets when the local port changes. Disk backup, DEMO publishing and performance endpoints are restricted to the host loopback address; LAN browsers cannot overwrite them.

The normal Windows launcher is:

```bat
avvio.bat
```

It starts port `5700`, opens the landing page and prints usable LAN URLs. You can also run the server directly:

```bash
python3 serve_local.py 5700 --bind 127.0.0.1
```

Useful URLs:

- `http://localhost:5700/`
- `http://localhost:5700/gameplay.html`
- `http://localhost:5700/engine_editor.html`

See [HOW_TO_START.md](HOW_TO_START.md) for the full startup, LAN and troubleshooting guide.

On hosted deployments, the bundled author DEMO is installed as a private copy in the visitor's origin-scoped LocalStorage and IndexedDB. The visitor can use the normal editor and save/reopen work in that browser profile; one visitor cannot see another visitor's database, and static hosting exposes no path that writes those changes back to GitHub. Folder mirroring and portable LKEP export are optional durability/portability choices rather than prerequisites. Publishing the shared Author DEMO remains available only from the local author installation.

## Assets and FBX workflow

The asset browser manages GLB/GLTF models, FBX authoring sources with linked runtime builds, scene assets, Logic Element assets, Player Car setups, sound sets and level assets. Ctrl/Meta/Shift selection and grouped deletion work across multiple imported assets.

The default-enabled **FBX → GLB Importer** plugin preserves the original FBX and the texture sidecars it consumes. FBXLoader provides source preview, while GLTFExporter creates the canonical GLB used by gameplay and portable exports. Sources can be checked, relinked and rebuilt when they change.

Models, materials, mesh parts, transforms, lights, primitives, text, effects and collision setups can be edited in the scene. Large imported data stays in IndexedDB so it can survive reloads without overflowing LocalStorage.

This is an assembly and gameplay-authoring workflow, not full mesh creation. Complex topology, sculpting, rig creation and complete texture authoring remain tasks for Blender or another dedicated content tool.

**Asset Scout** searches free online catalogues from inside the editor and imports results through the same pipeline as a local drag-and-drop. It ships two vetted sources: Poly Haven (models and PBR textures, entire catalogue CC0) and the Khronos glTF Sample Assets (reference models, per-model licenses). A downloaded glTF bundle is re-linked and re-exported as a single canonical GLB; an FBX source goes through the FBX importer plugin and keeps its source; texture sets import their individual PBR maps.

Every result card states its license, author, triangle count, real-world dimensions and source link. Anything that is not public domain, or whose license cannot be resolved, requires an explicit confirmation of the terms before it is imported, and an asset carrying several licenses reports the strictest one. Sources are a plain registry of self-contained descriptors, so one can be added or removed without touching anything else. See [Asset Scout](docs/ASSET_SCOUT.md).

## Pawn Studio and characters

Character, Soccer and Vehicle Logic Elements open in Pawn Studio, a reusable three-pane authoring overlay:

- The left side organizes Main Mesh, skeleton, collision, movement, animation sets, camera and category-specific systems.
- The center contains an isolated Three.js preview.
- The right side edits the selected container.

A Character Main Mesh can be replaced with a rigged GLB or an FBX-derived asset and reset to the procedural T-pose. Each motion can use its own GLB/FBX source with editable state, direction, nominal speed, priority, loop and playback rate.

Compatible Mixamo and Blender animations are rebound or retargeted onto the Main Mesh. The motion selector can blend from state, local direction, speed, acceleration and author priority. Invalid, static or incompatible tracks are reported instead of failing silently.

The same authored character height, uniform world scale and orientation rules are used by Pawn Studio, the Logic Element viewport, the main editor, Play Preview and exported runtime.

Gameplay settings include a persistent Easy/Medium/Hard difficulty contract intended for every project category. Soccer currently consumes it for goalkeeper reaction, prediction, reach, tracking and dives, plus opt-in unpossessed field-player opponent reaction, pace and shot accuracy.

The same Pawn Studio shell can be extended through plugins for future Animal, Aircraft, Boat and other Pawn categories.

The default-enabled **Cloth Studio** plugin extends Character and Soccer Pawns with separated-garment discovery, pin-mask painting, wind/gravity/quality settings, mesh diagnostics and per-bone collision spheres. Its saved component behaves identically in the isolated viewport, Play Preview and exported gameplay through a portable CPU solver; its backend boundary is ready for the official Three.js WebGPU compute approach once engine-wide WebGPU parity is complete. See [Cloth Studio](docs/CLOTH_STUDIO.md).

## First Person Pawns

A generic Character Pawn becomes a first-person Pawn by carrying a `firstPerson` block. The rig owns the eye camera, mouse and stick look with pitch clamping, aim down sights, view bob, recoil, and a configurable hitscan weapon with magazine, reload, reserve ammo and optional multi-pellet spread. Anything shootable carries `userData.damageable`, and a child mesh can be tagged as a head hit zone.

The addition is additive rather than a fork: a Character Pawn without that block keeps the untouched third-person path, the rig composes onto the existing movement hooks instead of replacing them, and the follow-camera path is bypassed only while a first-person Pawn owns camera output. Recoil is applied to the view angles rather than as a separate camera offset, so aim and crosshair cannot disagree.

`fire`, `aim` and `reload` are input actions on the Character context, rebindable like any other; mouse buttons travel through the keyboard scheme as synthetic `Mouse0`/`Mouse1`/`Mouse2` codes. They stay unbound in the Vehicle context.

The **FPS Shooter Test** level template provides a full editable range — covered firing bay, four marked lanes with distance bands, cover, an overwatch platform and twelve damageable targets from 10 m to 65 m. Player and targets are ordinary Logic Elements. See [First Person Pawn](docs/FIRST_PERSON_PAWN.md), which also lists the current limits: no first-person view model, no muzzle-flash or impact effects, and no weapon audio yet.

## Player Car and Vehicle Pawns

The built-in `player_car (Logic)` is the handling reference. It exposes driving values, collision, camera behavior, lights, underglow, exhaust, skid sources, data widgets, sound and reusable setup data.

Independent Vehicle Logic Elements use the shared `VehiclePawn` contract. They have their own lifecycle, runtime state, possession, Cannon RaycastVehicle suspension, collision ownership, fallback locomotion and reset/spawn state.

Player assignment supports `None` and Player 1–4 while preventing accidental double possession. Multiple instances keep physics, steering, speed, gear, camera ownership, lights, exhaust and skid state separate.

Native and Logic Vehicle exhausts use the same pooled effects contract. Smoke supports continuous or pulsed emission, lifetime, opacity, expansion, turbulence, temperature color and velocity inheritance. Backfire uses short-lived anchored flame cones aligned with each exhaust outlet rather than smoke particles left in world space. Shader variants are prepared during the pre-benchmark so the first runtime backfire does not become an avoidable compilation stall.

The longer-term direction is to keep vehicle physics behind an instantiable plugin/component boundary, making additional vehicle types and third-party backend provenance easier to manage.

## Logic Element visual scripting

Logic Element is the experimental Blueprint-inspired visual scripting system built around the engine's JavaScript codebase. Graphs are stored as portable data and execute registered JavaScript node implementations without `eval`; they are not a separate proprietary scripting language. There are two main scopes:

- **Level Logic** belongs to the complete level.
- **Logic Elements** are independent scene objects with their own graph, internal viewport, hierarchy, components, variables and exposed settings.

The normal scene inspector only shows placement, important runtime settings and deliberately exposed variables. Graph internals remain inside the Logic Element editor.

Current functionality includes:

- Graph and internal 3D viewport editing.
- Node selection, pan/zoom, comments, copy/paste and undo/redo.
- Events, flow, variables, math, transform, physics, collision, materials, camera, audio, animation and debug nodes.
- Functions, Subgraphs, Macro foundations and exposed per-instance variables.
- Reusable linked Logic Element assets.
- Internal GLB assets, colliders and animation clips.
- Runtime execution without `eval`.
- Breakpoints, stepping, timeline filtering and Logic Profiler diagnostics.
- JS/TS graph export and an early imperative compiler for a safe node subset.
- Vehicle, Character, Soccer, First Person and networking node categories.

The graph editor makes JavaScript-backed behavior accessible visually, while exported JS/TS and the plugin/node registries keep the system understandable and extensible to web developers. The built-in `player_car (Logic)` remains the recommended vehicle implementation while the newer reusable Vehicle Logic Element path completes specialist feature parity.

## P2P sessions and coworking

The default P2P plugin creates encrypted WebRTC DataChannels through a temporary manual invite/answer exchange. It supports Logic Element messages, peer presence, paced large-message transfer, host-authoritative live transforms and reviewed portable project snapshots.

This is not a central cloud collaboration service. Each browser keeps its own data, and project changes are exchanged deliberately to avoid silently overwriting another workspace.

## Cinema Studio

Cinema Studio is the in-editor timeline system for creating cinematic footage and triggered sequences. It currently supports:

- Scene cameras and camera cuts.
- Cut trim/move and camera assignment.
- Object transform and camera FOV keys.
- Markers and named timeline events.
- Floating Normal/Final preview.
- Gameplay triggering from collision boxes and Logic events.

Timelines are saved as scene assets and can be previewed manually or started at runtime.

## Sound Designer, radio and HUD

Audio is authored as **sound sets**: small JSON documents holding parameters and optional sample paths, saved in their own library and referenced by id. Two families exist, sharing one storage layer and one rule — *every slot has a procedural fallback, so nothing is ever silent because a sample is missing or a path is wrong.*

**Engine Sound Sets** (vehicles) can use ON/OFF throttle samples, RPM layers, turbo, blow-off, backfire, limiter, shift and ignition sounds, so a vehicle remains testable before real samples are assigned.

**Character Sound Sets** (on foot) cover footsteps, weapons and body foley, and are edited in the **Character Sound Designer**. They are procedural *by default* rather than as a fallback: the shipped set contains no media files at all and is a complete, playable soundscape.

- **Footsteps follow the surface underfoot.** A slot per material — concrete, marble/tile, wood, metal, gravel, dirt, grass, sand, snow, water, carpet — each a distinct synthesis recipe rather than one sound retuned: metal rings, gravel is several grains, water has a pitched splash. The material comes from the collider the character stands on, tagged with a `surface` property on the collider or its scene object; untagged geometry uses the set's default. Surface names are free-form, so a project can invent its own and add matching slots.
- **Steps are spaced by distance walked, not by a timer**, with a separate stride for walking and running, so cadence follows speed at every gait without a case per animation state.
- **Weapons have a profile per class** — rifle, marksman, shotgun, pistol, SMG — each with shot, tail, action, casing, dry fire and the two halves of a reload. A Pawn picks its class from the weapon preset, or from behaviour when the loadout is fully custom (pellets make a shotgun, long range a marksman); never from the weapon's display name. Weapon audio is driven by the events already on the shared Pawn event channel, so it needs no wiring per project.
- **Body foley** covers jump, landing (scaled by impact speed) and sprint breathing.

The system is attached to the Character Pawn rather than to a camera mode, so first-person and third-person characters are audible through the same path. Only a possessed Pawn is audible today; remote and AI characters would need spatialisation, which the set does not model yet. Vehicles keep their own designer: the two families describe genuinely different signal chains, and merging them would produce a panel that serves neither.

The Radio/HUD authoring tools control frame and screen placement, buttons, volume and bass behavior, responsive camera framing, vehicle telemetry and 3D data widgets. Radio ownership defaults to the vehicle possessed by Player 1, covering both the native `player_car (Logic)` adapter and Vehicle Logic Elements. Projects can explicitly override it to a selected actor or global gameplay.

Loading Music, Game Radio, Editor Menu and Game Menu use four independent ordered music libraries. Loading transitions use only Loading Music; a ready menu switches to the library matching its role. Gameplay requests the radio only when its ownership policy is satisfied. The first row of each library is its startup track.

## Projects, levels and export

A project can contain multiple gameplay levels plus hidden `EDITOR MENU` and `GAME MENU` scenes. Portable `.lkep.json` exports can include selected levels and preserve whether each level is visible or internal-only.

The playable exporter produces a standalone ZIP containing the runtime, selected gameplay levels and referenced assets. It does not include the editor. The result can be uploaded to GitHub Pages, another static host or a normal website and launched without the author's editor database.

Export assembly resolves the selected scene data, runtime modules, pinned local dependencies and asset blobs into a portable static build. Further work is moving more systems behind explicit runtime/plugin manifests so projects can include only the capabilities they use.

For an inspectable online project, the author can publish a bundled DEMO. On the project-aware local server, the current DEMO is written atomically to `demo/demo-project.lkep.json` and the previous version is backed up.

## Project layout

- `js/lot-king.js` — runtime bridge, main game setup and `LOT_KING` API.
- `js/runtime/` — gameplay, physics, cameras, audio, HUD, input and track flow.
- `js/runtime/vehicle-pawns.js` — Vehicle Pawn registry and runtime adapters.
- `js/editor/` — editor UI and authoring tools.
- `js/logic/` — graph model, nodes, validator, runtime, templates and exporter.
- `js/plugins/` — plugin API, manager and built-in plugins.
- `js/engine/scene-store.js` — scene persistence, levels, assets and export data.
- `demo/` — optional bundled online demo.
- `css/` — runtime and editor styling.
- `models/`, `media/`, `musics/` — bundled runtime assets.
- `docs/` — architecture, feature guides and release history.

## Technology baseline

- Three.js `0.185.1` / revision 185 with matched local addons.
- Cannon.js `0.6.2`.
- WebAudio.
- LocalStorage and IndexedDB.
- Plain JavaScript and static HTML/CSS.
- No runtime application framework.

WebGL remains the validated release backend. WebGPU/TSL and other advanced paths stay behind capability and parity work until rendering, post-processing and export behave consistently.

Core Three.js and addons are never mixed across revisions. Every upgrade must update the package pin, generated compatibility bundle, cache keys, playable manifest, migration tests and [Three.js version tracker](docs/THREEJS_VERSION_TRACKER.md) together. The r185 migration record is in [THREEJS_R185_MIGRATION.md](docs/THREEJS_R185_MIGRATION.md).

Vehicle backend authorship, licenses and adapter changes are tracked in [VEHICLE_PHYSICS_PROVENANCE.md](docs/VEHICLE_PHYSICS_PROVENANCE.md).

## Main work still in progress

- Expand ready-to-use gameplay methods beyond the current car-racing foundation.
- Harden Character/Mixamo authoring, retargeting and Pawn Studio/runtime parity with more real asset sets.
- Make Cinema Studio solid enough for real in-engine footage.
- Improve save/load reliability across browsers and operating systems.
- Complete Vehicle Logic Element parity with the built-in Player Car.
- Extract plugin-ready vehicle physics components.
- Add more Logic Element nodes, compiler coverage and real project tests.
- Add reusable objectives and high-level game rules.
- Continue GPU/rendering parity work without breaking portable WebGL export.
- Complete the external asset provenance and attribution pass.

## Known limitations

- The editor is experimental; keep versioned `.lkep.json` exports.
- Browser security cannot silently monitor arbitrary FBX source files. Checking for changes requires an explicit relink/check action.
- Animation-only files still need a real armature and keyframes.
- Automatic retargeting handles compatible humanoid rigs and common naming variants, not every possible skeleton.
- Sprint does not yet have a dedicated touch button.
- The Penalty Shootout goalkeeper has a configurable predictive AI baseline with generated catch and directional-dive fallbacks; Player 2 possession or custom Logic can override it.
- Drift Track sub-pieces are generated as one parametric element and are not individually selectable.

## Local assets, credits and AI-assisted development

`models_sources/` contains local Blender/source assets and is intentionally ignored by Git. Runtime assets needed to reproduce the playable state should remain in the repository or use the project publishing plan.

The project includes project-authored work, AI-assisted/generated assets, bundled samples and external references. The bundled music is AI-generated by the project owner. Runtime and design references include Three.js, cannon.js, JSZip, Anderson Mancini's R3F Ultimate Lens Flare work, and bandinopla's MIT-licensed `three-simplecloth`, itself based on the official Three.js WebGPU compute-cloth example. Exact notices and links are kept in [THIRD_PARTY_LICENSES.md](vendor/THIRD_PARTY_LICENSES.md); the wider asset-by-asset provenance audit remains in progress.

The original one-file drift prototype was generated from a single Fable 5 prompt. Continued implementation with GPT-5.6 Sol then expanded it into the current multi-module editor and runtime, under the project owner's design direction, testing and final decisions. Maintaining that growth requires repeated refactoring, cross-browser checks, export verification and documentation work; AI assistance does not replace those acceptance steps.

Community contributions can be useful beyond code. Focused bug reports, reusable Logic Elements, example projects, tutorials and demonstration videos can all shorten the distance between an implemented feature and something other people can understand and use.

## License

Lot King uses the custom **Lot King Engine Builder & Car Drift Game Source License 0.1**, whose historical name is retained as the legal license title.

Project-authored parts can be read, learned from, modified, forked, shared and used commercially, but public uses must credit **Lot King Engine Builder & Car Drift Game by jaydemks** and preserve the license notice. This is source-available rather than OSI-approved open source. Read [LICENSE](LICENSE) for the exact terms.
