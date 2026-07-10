# Draft: v0.6.5

## v0.6.5 - Nodes, blueprints, and JavaScript workflow

### Release Status

- Status: draft / implementation complete, pending manual/browser verification.
- Tag target: `v0.6.5`.
- Scope: node/blueprint authoring, JavaScript workflow planning, editor runtime extensibility, and follow-up polish after `v0.6.4`.
- Logic Element Part 1 and Part 2 v0.6.5 are implementation-complete; browser/manual verification remains before final release sign-off.
- Estimated implementation status, excluding user manual acceptance tests: Part 1 at 100%; Part 2 v0.6.5 at 100%; full Logic Element v0.6.5 scope at 100%.
- Current roadmap percentages, excluding user manual acceptance tests: Part 1 100% complete / 0% remaining on code; Part 2 v0.6.5 100% complete / 0% remaining on code; total Logic Element v0.6.5 scope 100% complete / 0% remaining on code.

### Headline

`v0.6.5` introduces the first complete Logic Element foundation: level-wide and scene-instance visual scripting, a dedicated Graph/Viewport editor, more than one hundred registered nodes, internal 3D assets, colliders and animation playback. This pass also fixes Sound Designer closing, HUD Radio editor interaction and persistent project music.

### Added

- Added modular Logic Element architecture under `js/logic/`: graph model, registry, validator, controlled services and runtime interpreter without `eval` or dynamic JavaScript generation.
- Added the first Plugin Host foundation with `js/plugins/plugin-api.js`, `js/plugins/plugin-manager.js`, a top application menu bar and a non-modal Plugin Manager panel.
- Registered Logic Element as a built-in plugin descriptor titled `Logic Element (Experimental)`, declaring its scene type, reusable asset type, inspector provider, runtime hook, export hook and Level Logic command.
- Added Level Logic as the visual-script graph shared by the current level.
- Added independent Logic Element scene objects with graph, enabled state, editor-preview state and exposed variables.
- Added reusable Logic Element assets and linked scene instances from the Assets library.
- Added built-in Logic Element templates in the Assets library: Rotating Cube, Click Color Pulse, Debug Counter, Space Jump Body, Patrol Mover, Toggle Switch and Distance Beacon.
- Added per-instance overrides restricted to exposed variables, plus Reset overrides and Make local controls.
- Linked instances share graph, hierarchy, components and viewport content while retaining an embedded portable fallback in saved projects.
- Added a dedicated floating Logic Element editor with Graph and Viewport tabs, persistent left hierarchy/variables sidebar and contextual inspector.
- Added graph pan/zoom, fit-all, fit-selection, minimap navigation, box selection and mixed multi-selection.
- Added graph undo/redo, copy/paste, duplication with internal wires, isolated graph delete and removable connections.
- Added searchable palette and context menu, pin-compatible search-to-add, wire preview and automatic connection after dropping from a pin.
- Added draggable Variables and Hierarchy entries for creating Get/Set Variable, Get Owner and Get Element nodes.
- Added colorable/resizable comment boxes stored separately from runtime graph execution.
- Added editable inline node defaults and a contextual node inspector; `Print Debug` includes configurable message duration.
- Added internal Logic Element hierarchy with Root/default mesh, child elements, parent relationships and linked components.
- Logic Element internal viewport now has a real Three.js transform gizmo with Move/Rotate/Scale, World/Local space, snapping and W/E/R shortcuts.
- Logic Element mesh entries can use imported GLB project assets in the internal viewport, main-editor preview and runtime scene.
- Logic Element Root and child elements can define static Box/Sphere colliders with editable size, radius and offset.
- Animated GLB assets expose clip, loop, speed, autoplay and editor-preview controls inside Logic Element.
- Added `Play Animation`, `Stop Animation`, `Set Animation Speed` and `Get Animation Clips` nodes.
- Added `On Destroy`, `On Gamepad Button`, `On Window Resize` and `Tick Every` event nodes.
- Added 108 registered node definitions across Events, Flow, Variables, Data, Math, Vector, Scene, Transform, Material, Physics, Collision, Camera, Audio, Animation and Debug categories.
- Added runtime events for keyboard, pointer, gamepad, resize, collision, update/fixed-update, interval tick, custom events and graph destruction.
- Added structured graph diagnostics with blocking errors, non-blocking warnings and node/edge/pin references.
- Added contextual warnings for unreachable execution nodes, disconnected events, missing variables/elements/references, ambiguous data inputs and unsafe common defaults.
- Added `tests/logic-core.test.js` regression coverage for validator diagnostics, runtime events, variable state and interval ticks.
- Added `docs/logic-element-authoring.md` with the current node/template authoring rules.
- Added built-in Logic Element template validation and clone-isolation coverage to the core test suite.
- Added browser coverage for placing a built-in Logic Element template from the Assets panel as a local editable copy.
- Added browser coverage for LKEP store export/import of a local Logic Element template graph, including comments and `logicScene`.
- Added browser coverage for Play Preview startup of a Logic Element template and its `On Start` runtime path.
- Added browser coverage for reusable linked Logic Element assets, exposed overrides, embedded fallback and import without the original local asset library.
- Added browser coverage for Logic Element Functions: Function creation, graph switching, input/output metadata and `Call Subgraph` insertion.
- Added browser coverage for linked Logic Element `Reset overrides` and `Make local` flows.
- Added browser coverage for Logic Element dependency inspection, dependency relinking and asset-aware texture/audio pin pickers.
- Added Part 2 groundwork: Logic runtime and runner now expose lightweight profiling stats for events, node runs, data evaluations, max steps, last event, last node and active runtime count.
- Added a Logic Profiler panel under Tools/Plugins, showing active runtime count, per-graph stats and a compact event/node/error timeline during Preview/Simulate.
- Added base Logic Profiler timeline filters for events, nodes, breakpoints and errors, including filtered/total sample counts.
- Added a breakpoint foundation for Logic Graph nodes: nodes can be marked from the Inspector, show a graph badge and report hits through runtime stats/profiler timeline.
- Added pause-on-breakpoint runtime support: the Logic Profiler can pause graph execution before marked nodes and resume paused Logic runtimes.
- Added `Step Breakpoint` support: paused Logic runtimes can execute the current node and pause again at the next node in the execution chain, with timeline entries for stepped and step-paused states.
- Added the Part 2 Subgraph runtime foundation: graph JSON can store reusable subgraphs, `Call Subgraph` can execute a named `Entry` graph, shared variables synchronize back to the caller, and validator diagnostics catch missing or broken subgraph references.
- Added the first Functions authoring UI inside the Logic Element editor: subgraphs can be created with an automatic `Entry`, selected, renamed, enabled/disabled, deleted, dragged to the canvas and inserted as `Call Subgraph` nodes.
- Added base Function canvas editing: the Logic Element topbar can switch between `Main Graph` and individual Functions, with graph editing, undo/redo, copy/paste, delete and local run scoped to the active graph while save/preview remain rooted on the owning Logic Element.
- Added a Macro foundation on top of Functions/Subgraphs: selected nodes can be packaged into a non-destructive reusable Macro and inserted through a generated `Call Subgraph` node.
- Added `Collapse to macro` for selected Logic Graph chains with exec-only external wiring, replacing selected nodes with a `Call Macro` node and preserving incoming/outgoing exec flow.
- Improved `Call Subgraph` authoring UX so Function/Macro call nodes show their target and can open it directly from the Inspector.
- Added base Function input/output authoring: Function metadata exposes editable inputs/outputs, `Function Input` reads payload fields, `Function Return` sets the return value, and core tests cover payload plus result flow.
- Added dynamic `Call Subgraph` pins: selected Function inputs/outputs appear directly on the call node, runtime builds payloads from those pins, declared outputs can feed downstream nodes, and validator/core coverage recognizes the dynamic pins.
- Added named multi-output Function returns: `Function Return` can write a named output, `Call Subgraph` stores the returned object and dynamic output pins can read the mapped fields.
- Added Function metadata diagnostics for duplicate inputs/outputs, undeclared `Function Input` / `Function Return` names, and declared outputs that are never written.
- Added base Logic Element definition metadata: reusable assets now include `definitionVersion` and a dependency manifest collected from internal mesh assets plus texture/audio node references.
- Added base Logic Element asset migration: legacy reusable definitions are normalized through a shared graph helper during list/get/save/import, preserving `definitionVersion`, dependency manifests and migration metadata.
- Added a Graph Inspector `Dependencies` section showing collected Logic Element mesh/texture/audio dependencies, graph owners and `found` / `external` / `missing` status.
- Added base dependency relinking from the Graph Inspector for compatible mesh, texture and audio assets.
- Added dependency report/fallback controls: the Graph Inspector can copy a dependency report and mark missing mesh/texture/audio references as intentional manual/external fallbacks.
- Added base asset-aware pin controls for Logic Element nodes: `Load Texture.textureRef` and `Play Sound.soundRef` can use manual paths/URLs or compatible asset-library references, including blob-backed `dbKey` references at runtime.
- Added `js/logic/logic-exporter.js`, a safe JS/TS data-module exporter for Logic Element graphs with metadata, definition version, dependencies and an optional runtime-wrapper helper that creates a `LK_LOGIC_RUNTIME` instance without `eval`.
- Added `exportGraphImperativeModule`, a bounded JS/TS imperative compiler foundation for a safe subset of Logic Element graphs (`On Start`, `Print`, math base and variables), with explicit unsupported-node guards instead of `eval`.
- Added Logic Profiler polish: clearer paused-node/input-pin details, pause-on-breakpoint status, a Clear Timeline action for active Logic runtimes and clickable recent timeline events with JSON detail inspection.
- Added modern wire dragging feedback in the Logic Graph: live preview curves use the source pin color, snap to compatible input pins, and show incompatible targets before dropping.
- Added clearer multi-type graph pins: `any` pins render as multi-color, connected pins show an attachment ring, and generic wires adopt concrete target colors when possible.
- Added `docs/logic-element-test-matrix.md` to separate implementation-side verification from user acceptance/video checks.

### Improved

- Logic Element overlays are draggable and resizable, allow interaction with the main editor behind them and use editor-consistent scrollbars.
- Logic Element is labeled experimental in the Plugin Manager until the full browser/GLB/Cannon/export regression pass is complete.
- The editor now has a software-style top menu bar with File, Edit, View, Tools and Plugins menus for common project/editor actions.
- Logic Graph wires now inherit type colors from their source pins, making exec/data/value connections easier to scan.
- Logic Element templates place local editable copies, so demo starters can be changed freely before being promoted to reusable linked assets.
- The Logic Element hierarchy always exposes the Root/default mesh and keeps technical components out of the main tree.
- Internal children render live beneath the Logic Element owner but remain locked from selection and manipulation in the main editor.
- Exposed Logic Element variables appear in the normal scene inspector while graph internals remain inside the Logic Element editor.
- Logic Graph status, node cards and contextual inspectors now present the same shared validator diagnostics; clicking a graph diagnostic selects its node.
- Internal GLB loading is awaited by scene startup and uses independent per-instance materials.
- Logic Element GLB assets are cached, cloned per instance and included in portable project export/import.
- Internal collider transforms follow the Logic Element hierarchy and feed both arcade collision and Cannon static bodies; collision events are routed to the owning graph.
- Rigged GLB instances use Three.js `SkeletonUtils` cloning so each Logic Element owns an independent animated skeleton.
- Uploaded menu and radio tracks are stored in IndexedDB while projects retain stable metadata references instead of large temporary URLs.
- Runtime HUD popups now accept a caller-defined display duration.
- Landing page and runtime version now report `v0.6.5`.

### Fixed

- Sound Designer now shows an in-window Save and close / Close without saving / Keep editing choice when closing with unsaved changes.
- Sound Designer confirmation UI now appears above the designer instead of behind another editor overlay.
- HUD Radio preview no longer captures the entire editor pointer layer and block unrelated editor interaction.
- Logic graph delete confirmation appears above floating Logic Element overlays, stays clickable, and deletion only occurs after explicit confirmation.
- Logic Graph node/comment deletion is now isolated from the main scene editor: `Delete/Backspace` inside the Logic Element editor removes graph items without confirming or deleting the selected scene Logic Element.
- Logic Element left-sidebar sections no longer overlap Hierarchy entries.
- Imported menu music and game-radio tracks are now stored as project assets and restored after saving and reloading a project.
- Portable project export/import now includes uploaded music instead of retaining temporary browser `blob:` URLs.

### Known Limitations / Post-v0.6.5 Follow-up

- Advanced macro data-pin collapse, complete imperative compilation for the full node catalog, profiler scrubbing, generic asset binding for every asset-aware pin, physical plugin-folder migration and final browser hardening remain follow-up work after the v0.6.5 implementation milestone.
- The plugin system is host-first: Logic Element is registered as `Logic Element (Experimental)` and cannot be disabled yet because implementation files and hardcoded editor/runtime/store hooks have not yet been moved into a standalone plugin folder.
- Full Three.js/Cannon visual coverage and linked reusable asset round-trip still need a final browser run; the Logic core Node suite now includes template validation and should be run in a working Node/Windows environment before sign-off.

### Testing Checklist

- Create Level Logic and a scene Logic Element, save/reload and verify both graphs remain intact.
- Verify Graph pan/zoom, minimap, multi-select, comments, copy/paste, undo/redo and confirmed deletion.
- Create disconnected/invalid nodes and verify warning badges, clickable diagnostics and error-only runtime blocking.
- Verify exposed variables appear in the normal inspector and non-exposed variables remain internal.
- Convert a local Logic Element into a reusable asset, place two linked instances, edit their shared graph and verify both update.
- Place each built-in Logic Element template from Assets, open it, and verify its graph, Default Mesh and exposed variables are editable.
- Give the two instances different exposed-variable overrides, save/reload and verify the values remain independent; then test Reset overrides and Make local.
- Export and reimport a project containing linked Logic Element instances and verify the embedded definition restores the reusable asset.
- Move/rotate/scale Root and children in World and Local space, with and without snapping, and verify the main-editor preview updates live.
- Import one menu track and one game-radio track, save, reload, and verify that both remain listed and playable.
- Export and reimport an `.lkep.json` project containing uploaded music, then verify both libraries.
- Add Box and Sphere colliders to internal Logic Element children, move the owner and children, then verify viewport helpers, vehicle collision and `On Collision Begin` in Play Preview.
- Import an animated GLB, switch clips and loop modes, verify Play/Stop in the internal viewport, then control it from animation nodes in Play Preview.
- Verify resize, gamepad-button, interval tick and graph-destroy event paths.
- Modify a Sound Designer set, close with X and verify all three close choices.
- Open HUD Radio preview and verify the rest of the editor remains interactive.

### Files/Areas Touched

- `js/logic/` graph, registry, validator, services, runtime and node definitions.
- `js/plugins/` plugin API, plugin manager and built-in Logic Element plugin descriptor.
- `js/runtime/logic-elements-runner.js`, physics, HUD, music library, menu music and radio runtime modules.
- `js/editor/editor-menu-bar.js`, `js/editor/logic-elements-inspector.js`, scene inspector, graph UI, asset/project export and Sound Designer modules.
- `js/engine/scene-store.js` scene serialization, Logic Element hierarchy, assets, colliders and animations.
- `css/editor.css`, `css/lot-king.css`, editor/game HTML entry points and version metadata.

### Notes

- `v0.6.4` release notes are archived in `docs/releases/v0.6.4.md`.
