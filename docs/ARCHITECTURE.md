# LOT KING ENGINE EDITOR & Car Drift Game Architecture

This document describes the current project architecture through the v0.6.7 Vehicle Pawn foundation, after the editor/runtime split, Cinema Studio, workspace stabilization, and the v0.6.5–v0.6.6 Logic Element authoring passes.

The project is still intentionally simple at the platform level: plain JavaScript, no bundler, static HTML entrypoints, browser storage, and a static-server workflow. The internal structure is now split into a landing/menu shell, gameplay runtime, standalone editor, persistence layer, Logic Element graph runtime, project workspace chooser, shared UI/input helpers, playable export pipeline, online demo publishing path, and versioned release documentation.

## High-Level Shape

- `index.html` is the landing/menu entrypoint. It shows the project menu, owns landing music/mute controls, and can embed gameplay as a seamless frame.
- `gameplay.html` is the playable runtime entrypoint. It loads gameplay/runtime code without loading editor UI modules.
- `engine_editor.html` is the standalone editor entrypoint. It loads the full runtime/editor DOM needed by editor preview, HUD editing, radio, settings, and the Sound Designer.
- `drift-parking-lot.html` remains as a compatibility redirect to `index.html`.
- `js/lot-king.js` is the runtime composition root. It creates `window.LOT_KING`, wires the runtime modules together, owns the main render/update loop, and keeps the public bridge stable for the editor.
- `js/runtime/` contains focused gameplay/runtime modules: assets, loading, world state, world generation, player camera, player light rig, physics, audio, sky/weather, HUD, menus, input, track/session flow, and model handling.
- `js/runtime/project-workspace.js` owns the editor-only workspace overlay. It detects local vs hosted origins and presents Browser Editor (DEMO or Empty) and Run Locally.
- `js/runtime/input/` contains the multi-device input stack introduced in v0.5.2: action schema, physical device sources, per-player assignment, in-game controls menu, visual mapping overlay, and touch controls.
- `js/runtime/ui/` contains runtime/editor-shared UI utilities, currently the floating window manager used by the mapping overlay and movable editor settings panels.
- `js/engine/scene-store.js` is the persistence and project-application layer. It owns LKEP import/export, local level/project storage, asset blob storage, project application at boot, and shared scene factories.
- `demo/demo-project.lkep.json` is the bundled online template. On hosted origins, `scene-store.js` loads it before a workspace choice and when DEMO is explicitly selected; later reloads preserve the visitor's editable browser-local copy instead of replacing it.
- `js/editor/loader.js` remains available for editor dependency ordering, while `engine_editor.html` is now the primary editor surface. Direct editor pages and the lazy loader must keep the same module order.
- `js/plugins/` contains the plugin host API, plugin manager, and built-in plugin descriptors. Logic Element is registered there as a built-in plugin while its implementation modules remain in their existing editor/runtime/store locations during the first migration pass.
- `js/editor/` contains the modular Engine Editor: core state, layout, application menu bar, toolbar, side panels, asset dock, outliner, inspectors, selection, history, project IO, viewport layout, Cinema Studio, playable export, Sound Designer, input settings, and preview/runtime handoff.
- `css/lot-king.css` styles runtime UI, HUD, menus, touch controls, mapping windows, and shared overlays.
- `css/editor.css` styles the Engine Editor, inspector panels, editor settings, asset dock, outliner, Sound Designer, and editor-specific overlays.
- `docs/` contains architecture docs and release history.
- `docs/vehicle-pawn-parity-checklist.md` is the repeatable native-vs-Logic Pawn manual comparison procedure.

## Runtime Composition

`js/lot-king.js` is no longer the place where every system lives. It is now mostly the coordinator that:

- creates the Three.js scene, camera, renderer, player car root, and core state;
- creates runtime modules from `window.LK_RUNTIME_*` factories;
- exposes the stable `window.LOT_KING` API used by the editor and store;
- routes level/project data from `LK_STORE` into runtime systems;
- keeps visual player heading, runtime driving heading, and editor spawn synchronization aligned when imported car models use corrective rotations;
- runs the main loop and lets the editor override or hook the frame when needed;
- keeps compatibility fallbacks when optional modules are unavailable.

The runtime is still script-loaded rather than bundled. Each module registers a small global factory such as `window.LK_RUNTIME_SKY`, `window.LK_RUNTIME_GAME_FLOW`, or `window.LK_RUNTIME_INPUT_MANAGER`. `lot-king.js` creates the concrete instances and passes dependencies explicitly.

## Public Runtime Bridge

The editor does not reach directly into every runtime implementation detail. It mainly talks to `window.LOT_KING`, `window.LK_STORE`, and shared module APIs.

Important `LOT_KING` areas include:

- `LOT_KING.core` - Three.js scene, camera, renderer, composer, canvas, clock, and shared render state.
- `LOT_KING.player` - car root, physics/config, spawn, model, tuning, camera config, lights, exhaust, data widgets, and blueprint-facing setters.
- `LOT_KING.pawns` - shared Vehicle Pawn registry. It exposes the native Player Car adapter and independent Logic Element Pawn instances through one lifecycle/state/possession contract.
- Player identity is intentionally split into three independent runtime contracts: input/Player slot, possessed Pawn, and camera source. A Player may own a Pawn with a static or Cinema camera, or render a camera without owning any Pawn. Logic Pawn camera sources are tracked per Player in `runtimeVehicleCameraPawnIds`; the singular `runtimeVehicleCameraPawnId` remains only as a Player 1 compatibility alias.
- `LK_RUNTIME_VEHICLE_VISUAL_CONTROLLER` is the shared per-instance wheel visual path consumed by both the native Player Car and Logic Vehicle Pawns. It owns suspension-to-visual compression, local ride height, steering and spin; Pawn adapters provide only state and visual targets.
- `LK_RUNTIME_VEHICLE_RAYCAST_ACTUATOR` is the shared stateless RaycastVehicle output stage. Native and Logic controllers provide desired total engine force, steering, per-wheel brakes and friction; the actuator applies them consistently without owning Pawn state.
- `LK_RUNTIME_VEHICLE_STEERING_CONTROLLER` provides the native steering response and speed-sensitive angle calculation as a stateless per-instance operation shared by native and Logic controllers.
- `LK_RUNTIME_VEHICLE_ENGINE_CONTROLLER` owns per-instance engine/gearbox state (RPM, gear, shift/limiter timers and torque output). The native adapter supplies its existing `ENGINE` object; every Logic Pawn owns a separate state object.
- Imported Logic Vehicle models reuse `LK_RUNTIME_MODEL_ASSETS.rig`, the same semantic/automatic GLB wheel-rig builder used by the native Player Car. It reparents wheel meshes, discs and calipers into per-instance steer/spin pivots instead of treating the GLB as one rigid chassis mesh.
- `LOT_KING.player.syncSpawnFromVisibleTransform()` - the canonical editor-side sync point for player spawn position/heading. Editor tools should use this rather than writing `physics.heading` directly.
- `LOT_KING.world` - editable entity registry, colliders, cones, seeded world content, static collider rebuild hooks, and scene object registration.
- `LOT_KING.systems` - audio, engine audio, radio/HUD, sky, rain, physics world, post-processing, runtime loader, and other long-lived systems.
- `LOT_KING.input` / `GAME.input` - the v0.5.2 input manager, player device assignment, remap persistence, mapping overlay hooks, and drive-command resolution.
- `LOT_KING.ui` - popups, HUD helpers, loading overlays, and menu-facing UI hooks.
- `LOT_KING.actions` - launch/unload level, prepare editor level, play preview, apply project, and session-flow actions.
- `LOT_KING.state` - started/editor/editor-preview/loading flags used by runtime and editor guards, plus pause-menu cursor state needed by runtime/editor preview focus handoff.
- `LOT_KING.hooks.frameOverride` - lets the editor take over rendering while editing.
- `LOT_KING.hooks.frame` - shared per-frame hooks that still run during editor and game loops.

Editor mode also exposes a small `LOT_KING.editor` bridge for automation/debugging: enter/exit, editor state, warmup requests, dirty marking, viewport rect, left-panel switching, and asset-panel refresh. This bridge is intentionally small and should not become a backdoor for runtime modules to manipulate editor internals.

## Persistence and Project Data

`js/engine/scene-store.js` exposes `window.LK_STORE` and `window.LK_ASSET_BLOBS`.

The store is responsible for:

- active scene/project application at boot;
- level library indexing and local project storage;
- LKEP project export/import;
- scene serialization and deserialization;
- imported GLB/GLTF metadata;
- IndexedDB-backed asset blobs through `LK_ASSET_BLOBS`;
- player blueprints;
- reusable Logic Element definitions, linked scene instances, exposed-variable overrides, and embedded portable fallbacks;
- engine sound sets;
- bundled online-demo loading from `demo/demo-project.lkep.json`;
- localizing embedded portable `data:` assets into IndexedDB-backed blob keys when applying an online demo project;
- reusable factories for primitives, lights, effects, GLB entries, and project entities.

LKEP project metadata now includes `meta.input`. That field stores the project-owned input policy: allowed device families, touch mode, player defaults, input contexts, device instances, base bindings, and per-instance overrides. Runtime user remaps are stored separately as local player overrides and do not widen the project-owned allowed-device list. The player blueprint also persists `player.controllerIndex` (zero-based internally, shown as Player 1–4): the runtime Pawn reads that player's resolved command instead of being hardwired to Player 1. Missing slots and numbered gamepad instances are provisioned on demand, while the input manager still assigns connected browser gamepads by stable connected order.

The built-in Player Car Pawn separately persists `enabled`, `hidden` and nullable `controllerIndex`. Disabled suppresses possession/drive and arrests the current physics body; Hidden controls rendering; a null controller is displayed as `None`. `js/runtime/vehicle-pawns.js` registers it as `native-player-car` without taking over its mature behavior. Logic Element candidates use the same contract but keep their own configuration, state, transform, possession and Cannon `RaycastVehicle`; each owns its chassis, wheel infos, suspension and collision listener inside the shared physics world. An arcade fallback remains available while Cannon/world initialization is unavailable. The complete source blueprint remains in `graph.playerPawnBlueprint`, while the versioned authoring/runtime contract is stored in `graph.vehiclePawn` v2.

`logic-templates.js` also publishes a static `Template - Player Car Logic Element` starter in the normal built-in template list. It is intentionally asset-independent and uses editable placeholders for vehicle model, wheels, Player Camera, headlights, exhaust and collision. `Duplicate as Logic Element` is the complementary project-specific path: it captures the current imported GLB, rig transforms and complete Player blueprint rather than starting from generic placeholders.

Placing that built-in Player Car template is intercepted by the editor asset factory and materialized from the current Player blueprint, so the visible result matches the active Player Car when a GLB is assigned. GLB loading uses the same 5.6 m normalization, then replays `meshEdits` and material overrides inside the Logic Element asset node. The starter graph uses Vehicle Pawn nodes for possession, controls, reset/state access and a reusable `Apply Player Drive` Function; it no longer translates the owner through a demonstration-only graph chain.

When no GLB is assigned, `vehiclePawn.proceduralFallback` causes the Logic Scene `vehicle_model` node to receive an isolated clone of the native procedural visual instead of the generic cube placeholder. Asset cloning prefers `SkeletonUtils.clone`, clones animation clips, geometries and materials, and retains morph data; destructive split/join operations remain disabled for skinned or morph meshes.

Player Car migration deliberately keeps a reference and a candidate implementation side by side. Independent Logic Pawns now have lifecycle, Cannon/fallback locomotion, isolated state, Player 1–4 possession, neutral `None`, camera follow/anchor ownership, reactive lights, neon, exhaust smoke, skid marks and graph control. The built-in singleton remains authoritative for final handling comparison and the full specialist inspector/audio/HUD/material workflows. Those remaining systems must move behind the shared target contract before full parity can be claimed.

Player-derived graphs mark `ControllerPlayerId` with the `player-id` authoring UI, rendered as None/P1–P4. `input.playerDrive` asks the shared input manager for that resolved player slot and exposes normalized throttle, brake, steer, handbrake and device values; invalid/None IDs are neutral. `Possess Pawn`, `Unpossess Pawn`, `Get Player Pawn`, `Set Pawn Drive Input`, `Reset Vehicle Pawn` and `Get Vehicle State` operate on explicit Pawn references, so two Logic Elements do not share speed, steering, gear or reset state.

Local multiplayer uses an explicit global-UI policy. Player 1 owns pause, menu, radio, tuning, mute and help commands, while driving/camera/light actions continue to follow each possessed Pawn's assigned Player. Audio currently uses one shared stereo mix/listener associated with the active Player 1 frame; per-Pawn engine and effect sources remain isolated before entering that mix. This prevents multiple controllers from toggling global overlays or audio state in the same frame and leaves room for a future selectable-listener policy.

The DOM Vehicle HUD maintains a P1–P4 telemetry cache and renders only the Player owning the active Vehicle camera frame. Speed, gear, RPM, driving mode and radio telemetry are routed from that Pawn rather than read unconditionally from the native car. HUD and radio roots expose `data-player-id`, and their layout remains clipped to the corresponding rendered frame rectangle.

Local split-screen derives its participants from the possessed Pawn registry, never from the native singleton. Two players use equal vertical frames, three use one wide plus two lower frames, and four use a quad layout. Every render temporarily selects the corresponding Pawn camera and Player-scoped HUD state, then restores the prior active Pawn; consequently the native `native-player-car` adapter and Logic Vehicle Pawns can coexist with distinct Pawn IDs and Player IDs.

Scene Cameras and Cinema Studios can target P1–P4. Assignment is exclusive only within the selected Player output, allowing independent outputs to coexist. During split-screen rendering a running Cinema timeline replaces the camera only for its assigned Player frame; the remaining native or Logic Vehicle Pawn cameras continue normally.

The registry can claim the first free slot in deterministic P1→P4 order. When all four are occupied the Pawn stays unpossessed/neutral; releasing a slot makes it immediately reusable. The Input Manager retains stable device-index assignment and recomputes it on gamepad connection/disconnection, which feeds Pawn-scoped device-change events.

Exposed graph variables may declare a controlled `binding` path. The runner applies supported paths through the owning Pawn API—never arbitrary property evaluation—for lifecycle flags, Player assignment, tuning, suspension, camera, lights, effects, Engine Audio and Data Widgets. This provides component parameters without custom nodes while preserving instance isolation.

Vehicle Pawn authoring keeps identity, Player ID, spawn position/heading and collider configuration in `graph.vehiclePawn`. Validation rejects empty explicit Pawn IDs and Player references outside P1–P4 before runtime. Spawn values and Pawn-relative dummy transforms are persistent authoring state; transient Cannon body state is never serialized.

The intended boundary is component-oriented: vehicle physics should eventually be independently instantiable and suitable for plugin extraction instead of remaining embedded in the one base Pawn. That separation is required for real local multiplayer and alternative vehicle implementations, and it provides a concrete location for third-party provenance, licenses and author attribution. Removal of the built-in `player_car (Logic)` should happen only after a parity audit passes, existing LKEP projects migrate safely and the Logic Element replacement can reproduce the reference behavior without hidden singleton calls.

Editor projects are browser-based by default. `js/editor/project-io.js` owns the editor-facing Projects overlay and stores the project list in browser storage for the current origin, while larger imported assets still live in IndexedDB through `LK_ASSET_BLOBS`. This keeps the editor full-browser/static-server based: there is no required project backend. Because browser storage is scoped by device and origin, the portable path between origins/devices is explicit `.lkep.json` export/import. During export, blob-backed project assets are normalized into portable data so the resulting file does not depend on the original browser cache.

`js/runtime/project-workspace.js` adds an editor-only project workspace layer on top of that storage model. The entrypoint detects hosted versus localhost automatically and asks for the project, not for a storage mode. Local installations can open the author DEMO, create a clean project or link an LKEP. Hosted editing requires a user-selected directory through the File System Access API before DEMO/clean creation; the DEMO LKEP and workspace manifest are copied into that authorized directory while browser state remains origin-scoped. No FTP, upload API or server-side project database write is used. Browsers without writable-directory support are directed to the GitHub/local workflow.

On the standalone editor page, `project-workspace.js` is intentionally the first external script after the standalone marker. `requiresInitialChoice()` gates menu preloading, bundled-DEMO installation, runtime `ensureReady()` and final editor entry. First setup is modal and non-dismissible; a successful project choice reloads the page with `workspaceReady`, after which the normal loading UI begins. The same overlay becomes dismissible when reopened later from the editor toolbar.

Every level carries a persisted `meta.levelRole`: `gameplay`, `editor-menu`, or `game-menu`. These roles deliberately reuse the normal scene/LKEP authoring pipeline, allowing the editor shell and future game shell to select authored menu scenes without creating a separate menu document format. `EDITOR MENU` is available now as an authoring classification; `GAME MENU` reserves the same contract for the runtime menu integration pass.

The bundled demo path is intentionally static-host friendly. The site owner exports a local project as a portable LKEP, uploads it as `demo/demo-project.lkep.json`, and the online editor/game loads that project for demonstration. No server database, PHP upload endpoint, or shared asset write path is required.

## Logic Element Architecture

Logic Element visual scripting is split into data, validation, controlled execution, scene integration, and authoring UI. Editor code never executes arbitrary graph text: saved graph JSON is normalized, validated against the node registry, and interpreted through engine services. In v0.6.5 it is also registered as the first built-in plugin through `js/plugins/logic-element-plugin.js` with the public title `Logic Element (Experimental)`; this exposes its capabilities to the plugin manager without yet moving the full implementation into a physical plugin folder.

The editor welcome overlay states this experimental boundary before authoring begins. It offers English/Italian selection through the same persisted preference service, can be dismissed permanently and reopened from Interface settings, and directs vehicle projects to the built-in `player_car (Logic)` until the Player Car Logic Element completes manual parity testing.

Pawn architecture is layered. `pawn-core.js` contains only reusable identity, lifecycle, flags, possession callbacks and component factories. `vehicle-pawns.js` adds driving state, Cannon RaycastVehicle, wheels, lights and vehicle effects. A future Human or Animal component should register against Pawn Core and provide its own locomotion/animation state rather than importing Vehicle Pawn or branching on vehicle globals. Logic pin compatibility allows specialized Pawn outputs to feed generic `pawn` inputs, never the unsafe reverse direction.

Wheel physics is data-driven through `vehiclePawn.wheels`. Each entry owns its Cannon connection point, steering/driven flags and optional visual ID. Visual IDs may resolve either a Logic Scene element or a stable Mesh Editor ID inside an imported GLB, so models do not require prescribed node names. Engine force, braking, grip and visual suspension iterate the configured wheel collection rather than fixed indices.

Driving setup exposes three common authoring baselines. `Default` is the balanced road setup, `Race` raises high-speed stability and tire authority without extreme launch torque, and `Drift` lowers rear stability while retaining steering authority. Each Logic Vehicle Pawn owns its selected setup and a private drift timer: throttle and handbrake can sustain an initiated slide, but prolonged excessive throttle progressively reduces rear grip and permits a spin. Pitch damping and bounded road-car acceleration/braking prevent routine wheelies and stoppies without coupling the Pawn to the native singleton.

The wrench delegates its complete parameter set to a possessed Logic Vehicle Pawn. Each Pawn captures an immutable suspension/collision baseline, then derives stiffness, compression/relaxation damping, rest length, travel, roll influence and chassis lift from that baseline. Live Cannon wheel information and the Pawn's own chassis shape are updated in place; no value is read from or written into the native Player Car configuration.

Vehicle effects remain per Pawn but follow the native presentation contract. Rear skid marks use Cannon raycast contact points rather than authored dummy height, exhaust uses textured smoke/flame sprites from the configured anchors, and engine shift/limiter pulses drive fire emission. Dummies are authoring anchors only and stay hidden at runtime. Partial Logic light configuration is deep-merged over a cloned native/default rig so nested headlight, rear-light and neon values survive independently per instance. Cannon Raycast is a built-in core backend dependency; Sound Sets resolve through the Sound Set catalog or embedded definition, not the generic asset library.

Smoke, flame and skid rendering itself is not duplicated by Pawn type: the native runtime owns one pooled Vehicle Effects renderer, and both the built-in car and Logic Vehicle Pawns submit emissions to it. Logic submissions carry the emitting Pawn's world anchor, body velocity, wheel contact, heading and per-instance settings. Likewise, once `player-light-rig` is installed on a Logic Pawn, authored Light elements are retained only as hidden authoring anchors; the fallback Logic PointLight updater is disabled for that instance.

`vehicle-physics-backends.js` is the versioned physics extension boundary. Backends declare ID, implementation version, API version, availability, license/repository/attribution metadata and a Raycast-compatible factory. Authoring can select Auto, Cannon, Arcade or another registered backend. Missing/unavailable implementations resolve to Arcade with a visible reason; dependency manifests retain the requested and resolved backend metadata for project/playable exports.

Vehicle light evaluation is instance-owned. The possessed Player input supplies high beams, while brake, reverse and steering state drive each Pawn's rear and auxiliary collections. `night`, `always`, `brake`, `reverse`, `left` and `right` conditions are resolved against that Pawn and the shared authored sky clock; the native light rig remains unchanged.

Logic Vehicle Pawns may author multiple camera elements under their hierarchy and persist `camera.activeAnchorId`. Runtime camera possession resolves that exact child and invalidates its cache when selection changes. Scene/Cinema cameras retain priority when explicitly active; Active Level Camera becomes the final fallback only when neither a valid controlled Logic Pawn nor the native Player owns the frame.

Core modules:

- `js/logic/logic-graph.js` owns the versioned graph JSON shape, normalization, cloning, starter graphs, nodes, edges, variables, comments, reusable subgraphs, and the internal `logicScene` model.
- `js/logic/logic-exporter.js` exports graph JSON as portable JavaScript or TypeScript data modules with metadata and dependency manifests. It can also emit a runtime-wrapper helper that instantiates the exported graph through `LK_LOGIC_RUNTIME`, plus a bounded imperative runner foundation for a safe subset of nodes. It does not use `eval`; full imperative coverage for the entire node catalog remains future work.
- Vehicle Pawn dependency collection includes Logic Scene mesh assets, material texture references and Engine Sound Sets. Playable preparation resolves nested material/mesh-edit blobs as well as the graph and linked-definition copies.
- LKEP import scans embedded Logic Element definitions before saving/loading the scene and installs each definition once through the versioned asset API. Linked instances resolve their catalog asset immediately while retaining embedded fallback and variable overrides.
- Browser persistence coverage writes a Vehicle asset to IndexedDB, saves/reloads a migrated Vehicle Pawn graph, exports it through the playable bundle builder and asserts that the local `dbKey` becomes a portable embedded source while legacy blueprint data remains intact.
- `js/logic/logic-registry.js` owns registered node definitions and their input/output metadata.
- `js/logic/logic-validator.js` produces structured errors and non-blocking warnings. Errors cover invalid graph structure such as unknown nodes, missing pins, incompatible wires, duplicate ids, execution cycles, and broken subgraph internals. Warnings cover authoring problems such as unreachable execution nodes, disconnected events, missing references, unknown variables/elements/subgraphs, ambiguous data inputs, and unsafe defaults.
- `js/logic/logic-runtime.js` interprets validated graphs without `eval` or `new Function`, owns runtime variable state and timers, enforces an execution-step cap, executes reusable subgraphs through the `Call Subgraph` node and `Entry` custom event convention, and exposes lightweight profiling stats plus a compact event/node/error timeline.
- `js/logic/logic-services.js` is the controlled bridge from nodes to Three.js, Cannon, input, audio, camera, materials, and scene lookup.
- `js/runtime/vehicle-pawns.js` owns the versioned Vehicle Pawn configuration, per-instance lifecycle/state, possession registry, native adapter, Cannon/fallback locomotion, Sound Set audio, effects and metric widgets.
- `js/logic/logic-nodes-mvp.js` registers the Part 1 node catalog.
- `js/logic/logic-templates.js` provides built-in starter Logic Element templates surfaced in the Assets panel as local editable copies.
- `js/runtime/logic-elements-runner.js` creates Level Logic and scene Logic Element runtimes, starts/steps/disposes their Vehicle Pawns, routes frame/fixed-frame/input/collision/Pawn/device events, and aggregates runtime profiling stats.
- `js/editor/logic-elements-inspector.js` owns the dedicated Graph/Viewport authoring window, hierarchy/components/variables/functions UI, contextual diagnostics, graph interaction, and the normal Inspector surface for exposed values.
- Player Camera, Collider, Lights/Neon, Attachments and Setup inspectors accept explicit Player targets. Native selection defaults to `LOT_KING.player`; Vehicle Logic selection receives a graph-backed target adapter, keeping the same UI modules without singleton writes or duplicated tab HTML. Collider history snapshots are applied through that target contract rather than the native singleton.
- Shared Camera, Lights and Attachments modules also snapshot their target configuration for history replay. Undo/redo invokes the same target API used by normal edits, so a Logic Pawn change cannot be redirected into the native Player singleton. An audit of Pawn Core, Vehicle Pawn, backend and Logic services leaves `GAME.player` only in the named native compatibility adapter.
- Dynamic light, exhaust, skid and Data Widget entries remain children of their owning Pawn. Their shared inspector actions mutate only the selected target and preserve Pawn-relative transforms when entries are duplicated or reordered.
- The standard Material and Mesh editors resolve a Player Car Logic Element to its `vehicle_model` child. Material slot selection/overrides and persistent mesh edits use the established pipelines while wheel pivots, lights, collider helpers and effect anchors remain separate hierarchy entries.
- `tests/logic-core.test.js` is the browser-free regression suite for graph validation, contextual diagnostics, runtime event flow, variable state, interval ticks, reusable subgraph execution, built-in template validation, and template clone isolation.
- `docs/logic-element-test-matrix.md` tracks implementation-side test coverage and the remaining technical sign-off matrix.

There are two graph scopes. Level Logic is stored once in `scene.logic.levelGraph` and has no scene owner. A scene Logic Element is stored as `added.kind = "logicElement"`, owns a transform in the main scene, and resolves `Root` to that owner while additional internal elements remain locked children authored inside the Logic Element viewport.

The internal `logicScene` is authored as a small locked, acyclic scene graph. `Root` is no longer assumed to be a default cube: it can be empty, a primitive mesh, a GLB-backed asset mesh, a light/camera helper, or a text element. Child elements use the same data path, with primitive mesh choices and 3D plane / 2D billboard text rendered through both the Logic Element viewport and the runtime scene-store preview path. Parent choices exclude the selected element and its descendants, and normalization repairs older circular hierarchies back to `Root` before rendering. Viewport nodes are keyed by scene element id; a visual-key or type change detaches and disposes the old node from its current parent before installing its replacement, so nested elements cannot leave orphaned render objects. While the overlay is open its capture-phase shortcut boundary owns transform keys, and the internal viewport mirrors the main editor navigation model with orbit, pan, zoom and RMB fly navigation. The editor sidebar keeps Hierarchy, Functions, Nodes and Variables as independently resizable sections so the authoring overlay remains usable at smaller sizes.

Reusable Logic Element data deliberately separates definition from instance state:

- the shared definition contains graph nodes, wires, variables, comments, `logicScene`, components, colliders, and animation settings;
- a linked scene instance stores `logicAssetId`, `logicLinked`, and `variableOverrides`;
- only variables marked `exposed` can be overridden by an instance;
- the resolved graph applies those overrides without mutating the shared definition;
- saved reusable definitions include a `definitionVersion` and dependency manifest collected from internal mesh assets plus texture/audio node references;
- reusable definitions are normalized through the shared graph helper during list/get/save/import, so legacy assets can be migrated to the current definition version without duplicating migration logic in editor UI code;
- the Logic Element Graph Inspector surfaces the current dependency manifest for author review before save/export;
- dependency entries can copy a review report, perform a base relink to compatible library assets for internal meshes and current texture/audio asset-ref nodes, or mark missing references as intentional manual/external fallbacks;
- asset-aware graph pins can store either manual refs or small asset-library refs with `id/key/dbKey/src`, with runtime services resolving supported blob-backed refs through `LK_ASSET_BLOBS`;
- each saved instance embeds the current definition and a resolved graph fallback so LKEP and playable exports remain portable if the original browser asset library is absent;
- `Make local` copies the resolved graph and removes the link, while `Reset overrides` returns exposed values to shared defaults.

Editing a linked definition propagates it to live instances. The normal scene Inspector only changes per-instance exposed values; graph internals stay in the Logic Element editor. Validation warnings are visible on node cards, in the selected-node Inspector, and in graph status, but only validation errors prevent runtime creation.

Built-in templates are intentionally not linked definitions. They are listed in Assets under Logic Elements, but placing one creates a normal local Logic Element graph copy. This keeps demos fast and safe: users can edit the placed template freely, then promote it to a reusable asset only when they want shared linked instances.

Functions/Subgraphs are stored inside the graph as reusable fragments. The authoring UI creates an `Entry` custom event automatically, manages function metadata from the sidebar/Inspector, inserts `Call Subgraph` nodes into the main graph, and can switch the canvas between `Main Graph` and a selected Function. The active canvas graph owns local undo/redo, copy/paste, delete and local run; its shortcut boundary applies in both Graph and Viewport tabs so graph, hierarchy and internal scene edits cannot fall through to the main editor history. Persistence and the internal `logicScene` stay rooted on the owning Logic Element graph. Function metadata can define named inputs/outputs; `Function Input` reads named payload fields, `Function Return` writes scalar or named multi-output return values, and the selected Function's metadata appears as dynamic input/output pins on the call node. The validator also checks duplicate Function ports, undeclared input/return names, and declared outputs that are never written.

Macros currently reuse the Function/Subgraph runtime path with explicit `macro` metadata. The editor can create a non-destructive Macro from selected graph nodes and insert a `Call Subgraph` node for it, or collapse selected exec-only chains into a Macro while replacing the original nodes with a `Call Macro` node and preserving incoming/outgoing exec flow. Data-pin collapse, multiple external macro outputs and a richer macro library remain advanced macro work.

Node breakpoints are runtime-aware debugger markers. The editor stores `node.data.breakpoint`, renders a badge on marked nodes, and the runtime records breakpoint hits in stats/timeline for the Logic Profiler. When `pauseOnBreakpoint` is enabled, execution pauses before the marked node and can be resumed through the runner/profiler or advanced one node at a time with `Step Breakpoint`. A richer debugger inspector stack remains future debugger work.

The core suite runs directly with Node (`node tests/logic-core.test.js`) and does not require a bundler. Browser interaction, Three.js viewport rendering, imported GLB behavior, and Cannon integration still require browser-level coverage.

The Part 2 automated sign-off now combines the deterministic native-reference Vehicle contract with a direct-editor Chromium path that instantiates a Cannon Logic Pawn, verifies Active Camera ownership and downloads a complete playable ZIP. This establishes automated parity without deprecating the built-in Player Car: `native-player-car` remains available alongside independently identified Logic Pawns until prolonged manual handling comparisons authorize a future, separate removal decision.

Its Vehicle Pawn parity section performs behavioral assertions over isolated acceleration, braking/reverse, handbrake drift, telemetry and reset/spawn in the deterministic Arcade backend, in addition to registry and graph-contract tests.

The same suite uses synthetic per-Pawn light backends to verify night, high-beam, brake, reverse and turn conditions, plus lifecycle mocks proving that exhaust/skid geometry, widgets and audio managers are disposed together. Chromium persistence additionally checks material and mesh-edit data in the playable result.

## Plugin Host

The editor now has a first plugin layer intended for future built-in and local extension modules:

- `js/plugins/plugin-api.js` exposes the registration API passed to each plugin.
- `js/plugins/plugin-manager.js` tracks registered plugins, enabled state, commands, menu entries, scene types, asset types, inspector providers, runtime hooks, and export hooks.
- `js/editor/editor-menu-bar.js` provides a software-style top menu bar (`File`, `Edit`, `View`, `Tools`, `Plugins`), a non-modal Plugin Manager panel, and the Logic Profiler panel backed by runtime runner stats and timeline samples.
- `js/plugins/logic-element-plugin.js` registers `Logic Element (Experimental)` as a built-in plugin and declares its scene type, asset type, inspector provider, runtime hook, export hook, and Level Logic command.

This is intentionally a host-first migration. Existing Logic Element code still lives in `js/logic/`, `js/runtime/logic-elements-runner.js`, `js/editor/logic-elements-inspector.js`, and `js/engine/scene-store.js`, so the built-in Logic Element plugin is always enabled for now. Real enable/disable requires moving implementation files and hardcoded editor/runtime/store/export hooks behind plugin registration, then adding missing-plugin fallbacks for projects that reference disabled or unavailable plugins.

## Input Architecture

The v0.5.2 input stack separates driving actions from physical devices.

Core ideas:

- An input context is a named action set. `vehicle` is the current context; future pawn types can add contexts such as aircraft or character controls.
- A device type is `keyboard`, `gamepad`, or `touch`.
- A device instance is a numbered slot such as `keyboard-1`, `keyboard-2`, `gamepad-1`, `gamepad-2`, or `touch-1`.
- A player slot maps to one device instance.
- A binding scheme resolves actions into a normalized drive command: `steer`, `throttle`, `brake`, `handbrake`, and `reset`.
- Shared base schemes live per context/device type; instance overrides store only differences for split local-coop setups.

Runtime input modules:

- `input-actions.js` - pure schema, migration, normalization, effective binding, conflict detection, and drive-command resolution.
- `input-devices.js` - keyboard, gamepad, and touch physical source readers.
- `input-manager.js` - merges project config and user overrides, detects connected gamepads, assigns devices to players, persists remaps, and exposes `GAME.input`.
- `touch-controls.js` - on-screen touch steering/throttle/brake/handbrake UI.
- `input-menu.js` - in-game Controls tab for device assignment, touch mode, and mapping access.
- `device-visuals.js` - schematic keyboard/gamepad/touch diagrams.
- `mapping-overlay.js` - shared visual mapper used by editor and game.

The mapping overlay is intentionally shared by the runtime and editor. It renders a compact real keyboard layout instead of a loose list of pressed keys, keeps gamepad/touch previews visually separated from the action list, and uses an internal styled scroll area for long binding lists. Keyboard actions can have multiple bindings, for example `W` and `ArrowUp`: clicking an existing key replaces that one binding, `+` adds an alternate key, and `x` removes a single binding without resetting the whole action.

Pause/menu input uses the same action layer, but cursor behavior is source-aware. Opening the pause menu from keyboard/mouse temporarily releases pointer lock and shows a UI cursor so the user can interact with menu controls. Opening it from gamepad or touch keeps cursor-hidden/gamepad navigation semantics. Closing the menu restores focus to the runtime canvas so gameplay shortcuts such as `U`, `Tab`, `M`, and remapped actions immediately work again in both normal gameplay and editor Play Preview.

Editor-side input:

- `js/editor/input-settings.js` edits `meta.input` from Settings -> Controls.
- The editor disables runtime user overrides while authoring so Preview reflects the pure project config.
- The same mapping overlay is opened from editor settings and writes project defaults instead of player overrides.

## Entry Point and Loading Model

The project no longer treats a single HTML page as both the menu, gameplay, and editor surface.

Current loading responsibilities:

- `index.html` loads the landing/menu UI and keeps menu music alive while transitioning into embedded gameplay.
- `gameplay.html` loads the gameplay runtime, settings, HUD, radio, audio, track catalog, scene store, and runtime modules needed to play.
- `engine_editor.html` loads the editor-specific DOM and module stack so editor preview works with the same runtime systems while remaining isolated from normal gameplay. Its direct script list mirrors `js/editor/loader.js`; when editor modules are extracted, both paths must be updated.
- On hosted origins, `engine_editor.html` remains the same page and automatically opens the project chooser. Authoring starts only after the user grants a local folder; mutations then target that folder plus origin-scoped browser storage, never the hosting server. Before consent, the legacy online-demo guard keeps mutation actions disabled.
- `drift-parking-lot.html` redirects old links to the new landing page.

The runtime should stay playable without loading editor CSS or `js/editor/*` modules. The editor can still use the staged loader/module ordering internally, but the architectural boundary is now page-level separation first.

Gameplay and editor Play Preview share the same runtime input and camera state machine. The `cameraMode` action (`C` by default) cycles Free, Arcade and Cinematic modes; this override belongs to the active session and is reset when preview/gameplay stops. Authored `player.cam.mode` remains the project default and is never mutated by runtime switching, preventing a preview-only camera choice from leaking into the next save or playable export.

Runtime camera modes hide the pointer while the session is active. Free may acquire pointer lock for mouse look; Arcade and Cinematic only apply the hidden-cursor state. Editor Play Preview can temporarily reveal the pointer with `Shift+F1` in every mode, while normal gameplay reveals it only for menus/UI.

Pointer ownership is Player-frame aware. The runtime records rendered rectangles by Player ID, accepts Free-camera pointer acquisition only inside the active Player's rectangle, exposes the owner on the canvas, and releases pointer lock if camera ownership moves to another Player. This contract is also used by editor Play Preview and is ready for the split-screen compositor.

Project General Settings are shared state, not editor preferences. Video, Audio, gameplay input and gameplay settings belong to the project/runtime surface. The viewport toolbar Quick Video gear and the Engine Editor `Project General` entry both open the same runtime settings overlay and mutate the same `GAME.settings.video` object persisted in LKEP. Editor theme, interface behavior and authoring keys remain under local Editor Preferences and are not exported as game controls. Core Select/Move/Rotate/Scale/Focus keys are read dynamically from `lotking.editorPrefs.v1`.

For normal Lit viewport rendering, `post.js` can temporarily bind an editor/scene camera to the shared composer. `videoOnly` rendering enables the project quality, ray/SSR and volumetric passes but suppresses Player Camera DOF and grade, preserving an accurate project render preview without applying shot-specific lens treatment to the authoring camera. Debug render modes remain direct diagnostic renders.

## Engine Editor Architecture

`js/editor/editor.js` is now the editor composition root rather than the only editor implementation file. It creates editor state and wires the extracted editor modules together.

Major editor areas:

- Core and chrome: `editor-core.js`, `editor-template.js`, `editor-layout.js`, `floating-layout.js`.
- Toolbar and preferences: `toolbar.js`, `preferences.js`, `quick-audio.js`, `side-panels.js`.
- Viewport: `viewport-layout.js`, `viewport-picking.js`, `viewport-events.js`, `fly-camera.js`, `gizmo-controls.js`, `visual-helpers.js`.
- Selection/history: `selection-manager.js`, `history-manager.js`, `keyboard-shortcuts.js`.
- Assets: `asset-library.js`, `asset-imports.js`, `asset-panel.js`, `asset-properties.js`, `asset-catalog.js`, `asset-dnd.js`, `folder-manager.js`, `thumbnail-manager.js`.
- Scene tree and menus: `outliner.js`, `context-menu.js`, `editor-menus.js`, `scene-menu-actions.js`.
- Project and levels: `project-io.js`, `level-manager.js`, `dialogs.js`, `status-ui.js`.
- Player systems: `player-blueprints.js`, `player-camera-inspector.js`, `player-lights-inspector.js`, `player-attachments-inspector.js`, `player-setup-inspector.js`.
- Inspectors: `inspector-controller.js`, `inspector-ui.js`, `object-inspector.js`, `material-editor.js`, `hud-inspector.js`, `environment-inspector.js`, `music-library-panel.js`.
- Logic authoring: `logic-elements-inspector.js` plus the editor-independent modules under `js/logic/`.
- Input authoring: `input-settings.js` plus shared runtime mapping modules.
- Runtime handoff and preview: `editor-runtime.js`.
- Sequencer/cameras: `cinema-studio.js`.
- Playable export: `playable-export.js`, `playable-export-level-picker.js`, `playable-export-assets.js`, `playable-export-zip.js`.
- Sound Designer: `sound-designer.js`, `sound-designer-template.js`, `sound-designer-form.js`.

The editor has its own free camera, grid/helpers, transform gizmo, asset dock, outliner, inspector, settings overlay, preview mode, and export flows. During edit mode it guards gameplay input with `LOT_KING.state.editorActive` and can override the canvas viewport rect so picking and editor panels behave correctly.

`editor-runtime.js` is intentionally kept as an orchestration module: editor enter/exit, Play Preview/Simulate, frame handoff, player-camera preview, runtime/editor state guards, and Cinema Studio runtime-trigger scanning during editor runtime previews. View-specific behavior lives in `viewport-layout.js`, which owns quad/single view layout, view selector overlays, per-view render modes, stats overlays, performance counters, long-task diagnostics, and independent secondary perspective cameras. Input/picking/control helpers still live in `viewport-events.js`, `viewport-picking.js`, `fly-camera.js`, and `gizmo-controls.js`.

Play Preview and Simulate share the same runtime launch path. Simulate marks `LOT_KING.state.editorPreviewMode = "simulate"` and keeps runtime events, cinema playback, and physics stepping active while leaving the editor viewport, gizmo, menus, and save workflow available. Runtime keyboard/mouse/gamepad/touch controls are suppressed in Simulate so the user continues to control the editor, not the gameplay camera or vehicle.

The history manager owns transforms, collider snapshots and general object Inspector snapshots. Inspector restoration reapplies normalized live objects—materials, lights, text, textures, scene cameras, Logic Element internals, colliders and physics—instead of changing serialized fields only. During Play Preview, collection freezes runtime-driven entity transforms and automatic environment progression against the pre-preview project; explicit Environment Inspector edits create a manual environment snapshot that is allowed through this guard.

GLB structural authoring is split from material authoring. `material-editor.js` targets renderer material slots, while `mesh-editor.js` targets stable sub-mesh ids assigned by `scene-store.js`. For normal GLB entities the editable root is the scene object; for `player_car` it is `GAME.player.getModel()`, matching Live Material Selection. Live Mesh Editing uses the same viewport raycast path but owns an independent single/multi-selection set and multi-box highlight. Its versioned `meshEdits` payload stores deleted ids, detached nodes, local transforms, non-material node properties (name, visibility, cast/receive shadow, frustum culling and render order) and deterministic split requests; scene GLBs store it on their added entry while the player blueprint stores it as `player.meshEdits`. Material-group and connected-island splits are reconstructed from the original GLB when loading, keeping LKEP files compact and making reset/undo possible without serializing generated vertex buffers. Skinned and morph-target meshes cannot be decomposed because safe splitting would also require skeleton, bind-pose, morph-target and animation-track remapping.

Placed GLB assets are also inspected for glTF `KHR_lights_punctual` output created by Blender or similar tools. Embedded Point, Spot and Directional lights are converted once into normal editor light entities with world transforms, color and bounded browser-safe intensity/range defaults. The source GLB entry records `embeddedLightsExtracted`; subsequent reconstruction suppresses its internal light nodes so the converted persistent entities do not double-light the scene.

Scene collection repeats that conversion as an idempotent preflight over live GLB entries. This covers older saves and placement paths that predate immediate extraction: any remaining embedded punctual light becomes a normal persisted `added.kind = "light"` entry before Save/LKEP/Playable serialization. The GLB source is marked only after conversion, so reload suppresses the original internal nodes while the exported editor-light entries retain spot angle, penumbra, distance, decay, shadow flag, transform and color/intensity.

For large environment GLBs, hierarchy detachment and physical extraction are separate operations. `Detach inside GLB` changes only the internal parent. `Extract as scene objects` creates one normal GLB scene entry per selected visible part, reusing the same `src`/IndexedDB asset reference and isolating the part through deterministic `meshEdits`. The source entry hides the extracted id. Extracted roots preserve the source world transform and material overrides, are independently selectable in the Outliner, and use the standard collider/physics Inspector and persistence pipeline. No geometry buffer or source GLB is duplicated in the project document.

Collider bounds and Complex per-mesh boxes traverse visible geometry only. This is required for extracted objects because their compact representation reloads the shared GLB and hides every non-owned mesh id; invisible source geometry must never enlarge or contribute to that object's collision. `applyMeshEdits` marks deletion visibility explicitly so applying an older undo snapshot can restore it.

Viewport hover work follows an interaction guard: normal entity hover, Live Material outlines and Live Mesh outlines stop while RMB fly/camera rotation, wheel zoom, left/middle navigation, gizmo manipulation or modal viewport dragging is active. Confirmed multi-selection helpers remain visible, but transient hover geometry is removed and no raycast outline is rebuilt until navigation ends. Live Mesh and Live Material cache their current hover target instead of recreating edge geometry on every pointer-move event.

Live Material Selection owns a stable set of material-slot ids. A normal click replaces the set; Ctrl/Meta/Shift-click toggles slots. Inspector patches apply to every selected slot, including independent slots preserved through split/join. The minimized Player Camera uses its visible panel dimensions for clamping rather than the hidden expanded render size.

Thumbnail generation is also interaction-aware. `thumbnail-manager.js` only starts scene and GLB thumbnail work from an idle callback and defers it while fly-camera or gizmo interaction is active, keeping model parsing and thumbnail rendering out of the editor animation-frame handler. `console-policy.js` filters only explicitly identified third-party diagnostics: the unsupported secondary UV normal-map warning emitted by Three r128 and the closed message-channel rejection generated by browser extensions. Native browser Tracking Prevention and long-task `[Violation]` diagnostics are not intercepted because page JavaScript cannot safely control DevTools reporting.

Mesh joins are stored as ordered definitions referencing stable mesh-edit ids. At reconstruction time the selected non-skinned geometries are transformed into the editable root space and merged into one generated mesh. Source parts remain recoverable for `Unjoin` and undo, while geometry groups are remapped to a compact material array. Material targets on edited meshes use `id|<meshEditId>|<materialIndex>` keys; the runtime still accepts legacy numeric `meshIndex:materialIndex` keys, but new split/join workflows no longer depend on traversal order.

Every split part and every material group entering a join receives its own cloned material plus cloned texture-transform objects. Image data can still be browser-cached, but material state and UV repeat/offset/rotation are no longer shared by reference. This is what lets two components originating from one default glass or lamp material become independently editable through Live Material after structural editing.

Play Preview uses the normal runtime pause/settings overlay. `Esc` opens/closes that menu, temporarily restores the mouse cursor when the menu was opened by keyboard/mouse, and returns focus to the canvas after closing so runtime shortcuts continue without requiring an extra click. Stopping preview remains separate through `F8` or `Shift+Esc`.

Before a hosted workspace is authorized, editor Play Preview uses the bundled LKEP as read-only state. After folder consent, hosted Play Preview follows the normal local save path and mirrors the project to the authorized workspace; server files remain immutable.

`cinema-studio.js` owns the Cinema Studio timeline surface: dock/lock timeline UI, playhead and ruler controls, camera cuts bound to real Scene Camera objects, floating preview, Normal/Final preview modes, object transform keys, camera FOV lens keys, markers, timeline events, validation, timeline item selection/deletion, undo-aware edits, asset-facing timeline duplication, and the internal play/stop/runtime API. It is browser-only and intentionally does not depend on external render/export tooling. Advanced curve editing, blend modes, more camera/lens parameters, and full track controls remain future work.

Cinema Studio data is stored on scene timeline/director objects through normalized `cinemaProps` data. `scene-store.js` keeps `cameraCuts`, `objectTracks`, `lensTracks`, `eventTracks`, and `markers` persistent, while maintaining the legacy `movieTrack` alias during migration. Its scene representation is a non-exportable clapperboard helper: it remains an editor selection/authoring handle and never becomes playable geometry. Collision Box trigger settings can call named Cinema Studio runtime events in Play Preview; timeline Event Track playback emits browser `lotking:timelineevent` events for project-specific listeners.

The editor opens with the Projects overlay on top of the editor surface. If the browser project list is empty but an older/current editor project already exists in the legacy active project slot, `project-io.js` seeds that project into the Projects list so existing work remains visible. Loading a project writes it into the active store and reloads the editor surface; saving updates the active browser project and keeps `.lkep.json` export as the explicit portable workflow.

The Projects overlay is local-editor focused. The workspace overlay is separate and appears only on the editor entrypoint, not on the public landing page, so normal "Play Game" entrypoints remain simple demo/play flows.

## Player Blueprint and Vehicle Systems

The player vehicle is configured through blueprints rather than hardcoded runtime values.

Blueprint-related systems include:

- driving tune values such as torque, grip, steer response, drift behavior, braking, and handbrake behavior;
- player camera config: follow style, aspect/crop behavior, FOV, draw distance, fog, shake, depth of field, and visual grade;
- vehicle lights and neon;
- exhaust smoke/fire anchors;
- player-attached data widgets;
- engine sound set assignment;
- model assignment and replacement;
- spawn/default project settings.
- visual player-root transform, spawn heading, and runtime driving heading.

The editor exposes these through player inspector modules and stores them through `LK_STORE`. The player spawn heading is treated as the canonical visible editor direction: `Direction = 0` is the forward heading shown by editor fields and stored in LKEP. Runtime driving heading can apply an internal offset when an imported GLB requires corrective root rotations, for example X/Z half-turn rotations. Editor tools must synchronize player changes through `GAME.player.syncSpawnFromVisibleTransform()` so spawn, physics, save/load, player-camera preview, and Play Preview reset stay consistent.

`scene-store.js` stores `player.headingMode: "runtime-v2"` plus `player.transform` for the player root. This preserves position, scale, visible rotation, model source, and the spawn direction across export/import. Older projects without the new heading mode are migrated conservatively.

## Audio and Sound Designer

Runtime audio is split between general procedural SFX and the sample-based engine audio system.

- `audio.js` owns fallback/procedural SFX such as engine tone, tire sounds, ambient hum, crashes, and thuds.
- `engine-audio.js` owns engine sound sets: ON/OFF throttle RPM loop banks, continuous layers, one-shots, synthetic fallbacks, reverb, skid channels, and Sound Designer test mode.
- `music-library.js`, `menu-music.js`, and `radio-hud.js` manage menu music, radio/HUD music, imported browser-session audio, and TAB/radio interactions.
- The Sound Designer editor overlay is lazy-loaded from the inspector and split into template, form helpers, and behavior.

Sound sets are assets stored by `LK_STORE.soundSets` and assigned per player blueprint.

## Environment, Camera, HUD, and Weather

Environment systems are split out of the old monolith:

- `sky.js` owns day/night, stars, moon, procedural lighting, sun bloom, lens flare, sprite clouds, and the volumetric-clouds sub-API.
- `volumetric-clouds.js` owns the raymarched cloud dome.
- `rain.js` owns GPU rain lines and procedural rain audio.
- `post.js` owns gameplay-camera post-processing, depth of field, highlight bokeh, focus masking, visual grade, ray lighting, and smoke-aware screen-space volumetric lighting.
- `settings-menu.js` owns the versioned project video schema, five scalable quality presets, the shared editor/game runtime video state, exposed player settings, and heavy-change feedback. Antialiasing is shared too: Off renders directly, FXAA uses the final lightweight post pass, and 2×/4× supersampling raise the internal pixel ratio with mobile/desktop safety caps. Legacy Normal/High values migrate to FXAA/2×. `post.js` also owns the browser-compatible ray-lighting pass selected by that state.
- Quality profiles affect render scale, shadow size, reflection sample quality and sharpening only; scene exposure, color response and volumetric intensity remain project/camera properties. In Ray lighting mode `post.js` enables the Three.js SSR pass for visible metallic, sufficiently smooth meshes. SSR is screen-space—off-screen or occluded geometry still falls back to the scene environment map—and absence/failure of the optional pass retains the standard PBR renderer.
- Runtime `circle` colliders are vertical cylindrical volumes. Their X/Z radius comes from the circular editor shape and their half-height/Y center comes from synchronized visual bounds; `physics-world.js` mirrors that volume with a Cannon cylinder (box fallback), avoiding the former midpoint sphere that left tall narrow props such as light poles non-solid at vehicle height.
- Environment state follows one Inspector → normalized runtime module → `scene-store` persistence path. Rain uses `onBeforeRender` to recenter X/Z on the actual camera for each editor, PIP or gameplay render while its Y base remains tied to the player/level, so multi-viewport rendering does not expose the edge of a vehicle-centered rain volume. Clouds, rain, flare and sun bloom normalize imported/live ranges before updating GPU uniforms.
- `player-camera.js` owns player camera defaults, cinematic aspect math, scoped viewport rendering, HUD frame rects, and the letterbox/crop frame used by the HUD.
- Player 1 frame ownership is shared consistently by the built-in Pawn, Scene Camera, Cinema Studio and Logic Element runtime. A Scene Camera's `Player output` assignment persists as the exclusive `activeLevelCamera` fallback for menu/non-Pawn levels; a Cinema Studio assigned to Player 1 can acquire the same frame through an `On Play` timeline, including loops and camera cuts. Logic `Set Active Camera` stores a session-only override (`runtimeActiveSceneCameraId`) after the vehicle camera update, so it remains active until replaced instead of lasting one frame. Scene queries expose `Get Element By Type` / `Get All Elements By Type`, backed by the world registry and Logic Element hierarchy.
- The editor camera PIP is a shared floating surface for the built-in Player Camera and selected Scene Cameras. It retains one layout state (`pipPos`, `pipW`, `pipMinimized`) across sources and renders a selected Scene Camera directly while temporarily excluding editor camera helpers.
- Logic exposes `cinema.playTimeline`/`cinema.stopTimeline` through the Cinema service. The start event resolves a Cinema Studio by editor id, authored name or event name. Editor runtime delegates to the full Cinema Studio evaluator (camera cuts, lens/object/event tracks); gameplay follows the persisted Movie Track camera cuts and keeps the runtime camera as the final frame owner until one-shot completion or explicit stop. Vehicle commands are neutral while a runtime cinema owns the camera.
- `player-light-rig.js` owns the vehicle-light automatic schedule. `front.autoOnHour` and `front.autoOffHour` are authored as 0–24 clock values, support overnight windows and drive both automatic headlights and auxiliary lights whose condition is `night`; legacy projects inherit 18:00/07:00 defaults.
- `game-hud.js` and `radio-hud.js` own runtime HUD DOM updates.

The v0.5.2 camera/HUD work confines HUD and radio panels to the actual rendered player-camera frame, including letterboxed/cropped frames and editor Preview.

## Playable Export

Playable ZIP export builds a gameplay-only package. It should include the runtime page, runtime scripts/styles, selected level projects, and referenced assets, but not the standalone editor.

- `playable-export.js` coordinates the flow.
- `playable-export-level-picker.js` handles selecting which level/project set to package and which level starts first.
- `playable-export-assets.js` normalizes referenced project assets and blob-backed files.
- `playable-export-zip.js` builds the export payload.

The ZIP bootstrap writes the selected package into browser storage, then launches `gameplay.html`. Exported gameplay should show only the levels intentionally included in the package. Embedded Sound Designer engine sound sets are carried with levels so playable builds can match editor vehicle audio.

This flow is separate from editor project export/import, which remains in `project-io.js` and `scene-store.js`.

The site owner's template is still published as `demo/demo-project.lkep.json`. Visitor edits never rewrite it: Browser Editor creates browser-local state, while LKEP and playable ZIP output are explicit downloads. The playable package embeds selected scene/project data and supported assets, so runtime capabilities do not depend on the author's browser database after export. ZIP assembly fetches independent runtime, vendor and asset files through a bounded six-worker queue; Three r128 already supplies its classic text constructors, so the package no longer waits on nonexistent FontLoader/TextGeometry CDN scripts.

## Editor Performance Diagnostics

`viewport-layout.js` exposes the viewport `FPS` and `Performance` buttons. The performance overlay reports renderer draw calls, triangle counts, geometry/texture counts, heap information where available, maximum frame time, frame spikes above 100 ms, long-task count, and maximum long-task duration.

All four viewport slots share the same view-type contract, and slot 0 remains available in Single View rather than being hardwired to Perspective. Perspective slots own independent cameras; orthographic slots own a fixed orientation plus independent target/span state for pan and zoom. Authored Camera and Timeline slots are clean, navigation-locked result previews. `viewportShowHelpers[slot]` controls editor-only helpers per normal view, while Camera/Timeline always suppress helpers regardless of the checkbox.

These counters are diagnostic only. They help distinguish GPU/render pressure from main-thread stalls caused by DOM refreshes, large JSON serialization, localStorage writes, thumbnail rendering, browser garbage collection, or asset/project data movement.

## Shared Floating Windows

`js/runtime/ui/window-manager.js` is a shared lightweight window manager used by both runtime and editor overlays.

It supports:

- centered floating windows;
- drag and resize;
- z-ordering;
- persisted geometry;
- viewport clamping;
- magnetic snapping to edges and other windows;
- attaching window behavior to existing panels, such as editor Settings.

The mapping overlay uses this manager in both game and editor contexts.

## What Still Lives in `lot-king.js`

`js/lot-king.js` is smaller than before but still contains important orchestration and some behavior that could be extracted later:

- renderer/bootstrap setup and global runtime object creation;
- main loop coordination;
- player driving step and fallback keyboard input path;
- player exhaust glue around runtime/editor hooks;
- runtime module creation order;
- level launch and editor-preview glue where multiple systems meet.

The preferred extraction pattern is still conservative: move low-risk, self-contained behavior into modules while keeping `window.LOT_KING`, LKEP compatibility, and editor workflows stable.
