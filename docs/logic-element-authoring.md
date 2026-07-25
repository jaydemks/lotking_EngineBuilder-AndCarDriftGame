# Logic Element Authoring Notes

This is the short operational guide for extending the current Logic Element system without coupling UI, runtime, and persistence too tightly.

## Where Things Live

- `js/logic/logic-graph.js` owns graph shape, cloning, starter graphs, and normalization.
- `js/logic/logic-nodes-mvp.js` registers node definitions.
- `js/logic/logic-runtime.js` executes graph JSON through registered nodes.
- `js/logic/logic-services.js` is the only bridge from nodes to engine systems.
- `js/logic/logic-templates.js` contains built-in starter Logic Element templates shown in the Assets panel and exposes `LK_LOGIC_TEMPLATES.register(...)` for external template packs.
- `js/logic/logic-nodes-soccer.js` and `js/logic/logic-templates-soccer.js` are the soccer game-mode pack (nodes + templates) and the reference for writing feature packs in their own files.
- `js/logic/logic-nodes-character.js` and `js/logic/logic-templates-character.js` provide the generic on-foot Character Pawn base. See `docs/CHARACTER_MOVEMENT.md` for rig, clip, root-motion, Sprint and placeholder-animation requirements.
- `js/runtime/character-placeholder-locomotion.js` is the procedural fallback animator used by Character/Soccer Pawns when no GLB is bound yet; it shares its public contract (`bind/update/playAction/dispose/isBound/...`) with the GLB motion-blend controller in `js/runtime/soccer-locomotion.js` so `character-pawn-base.js` can swap between them transparently.
- `js/runtime/penalty-shootout-level-template.js` is a worked example of a ready-to-play level built from templates: it places two `logic-template-player-soccer` Pawns plus explicit `logic-template-soccer-ball`, `logic-template-soccer-goal` and `logic-template-penalty-shootout` elements onto a generated `js/runtime/soccer-stadium.js` stadium. Stable Ball/Goal IDs link the independent parts. See `docs/CHARACTER_MOVEMENT.md` for the level-picker entry and the `ControllerPlayerId = -1` convention it uses to avoid a second Pawn auto-possessing Player 1.
- `js/editor/logic-elements-inspector.js` owns authoring UI only.
- `js/editor/pawn-studio.js` owns specialist Pawn authoring through category adapters; Character/Soccer motion data should not be duplicated as one-off Inspector controls.

## Adding A Node

1. Register the node in `logic-nodes-mvp.js` with a stable `type`, or — for feature packs — push a registration function into `window.LK_LOGIC_NODE_PACKS` from a dedicated file loaded after `logic-nodes-mvp.js` (see `logic-nodes-soccer.js`).
2. Give every input/output a stable pin name. Display labels can change; pin ids should not.
3. Use `run(api)` for exec nodes and `evaluate(api, pin)` for pure data nodes.
4. Access scene, physics, material, audio, camera, input, animation, and debug only through `api.services`.
5. Add validator coverage when the node has reference-heavy defaults, such as variables, elements, assets, or names.
6. Add at least one focused example graph or template if the node is intended for authoring demos.

## Adding A Template

Templates are local editable starters, not linked reusable assets. Placing a template creates a normal scene Logic Element copy, so users can change it freely without mutating a hidden built-in definition.

The Player Car template is a special Vehicle Pawn definition. Keep its persistent authoring data in `graph.vehiclePawn` (schema v2) and retain `graph.playerPawnBlueprint` only as the lossless migration/reference snapshot. Runtime speed, RPM, gear and temporary control state belong to the Pawn instance and must never be written back into the graph during Play Preview.

The Player Soccer template follows the same contract with `graph.soccerPawn`: role, movement, locomotion blending, keeper, Motion Animation Set, appearance and camera are persistent authoring data; runtime speed, current action and dive timers live on the Soccer Pawn instance only. Non-vehicle Pawn kinds route exposed-variable bindings through `pawn.applyBinding(path, value)` instead of the vehicle-specific runner dispatch.

The Player Character template uses `graph.characterPawn`. `normal`, `civil` and `police` are data presets over the shared character controller; project-specific subtypes should tune or extend a preset rather than duplicate locomotion. Main Mesh, skeleton, collision, movement and the per-entry Motion Animation Set are edited in Pawn Studio. Movement clips should normally be in-place because runtime owns translation and collision; imported root/hip movement is scale-normalized during compatible skeleton retargeting.

In the Logic Element Viewport, Graph **Run** and Viewport **Play Isolated** are deliberately different modes. Graph Run executes the authored graph interpreter. Play Isolated creates only the lightweight Character/Vehicle simulation required for input and animation testing, does not start the editor world, and restores the authored root transform on Stop.

Reusable vehicle behavior should be authored as Functions/Subgraphs. The built-in template demonstrates this with `Apply Player Drive`; control and queries must use explicit `vehiclePawn` references through the Vehicle Pawn node category instead of reading or mutating `GAME.player`.

Each template should include:

- a stable id prefixed with `logic-template-`;
- a readable name prefixed with `Template -`;
- a complete `graph` object with `scope: "element"`;
- a `logicScene` with at least `Default Mesh`;
- comments that explain the execution flow inside the graph;
- exposed variables only when the template actually uses them.

Good starter templates are small and inspectable: one event path, one obvious behavior, and no silent dependency on project assets.

## Adding A Subgraph

Subgraphs are reusable graph fragments stored inside the parent graph. The current runtime foundation supports execution through the `Call Subgraph` node.

Current convention:

- create a subgraph with a stable `id` and readable `name`;
- add a `Custom Event` node whose `eventName` is `Entry`;
- call it with `Call Subgraph` using either the subgraph id or name;
- pass optional data through the `payload` input and read it from the `Custom Event` payload output;
- for named inputs, add Function metadata inputs and use `Function Input` nodes inside the Function graph;
- the selected Function's metadata inputs appear as direct pins on `Call Subgraph`, so callers can wire named values without packing a manual payload object;
- for a scalar return value, use `Function Return` with an empty `name`; `Call Subgraph.result` receives that value;
- for named outputs, set `Function Return.name` to the Function output name; `Call Subgraph` receives an object and the matching dynamic output pins read those fields;
- shared parent variables are synchronized back to the caller after the subgraph runs.

Browser hardening and richer inspector polish are still Part 2 work. Keep runtime assumptions data-driven so return editing can grow without changing graph execution.

Current editor support:

- the Logic Element sidebar has a `Functions` section;
- `+` creates a subgraph and adds the `Entry` event automatically;
- selecting a function opens metadata in the right Inspector;
- the topbar graph selector opens a function graph directly in the canvas;
- the Function Inspector edits metadata inputs/outputs and can create `Function Input` / `Function Return` nodes;
- dragging a function onto the graph creates a `Call Subgraph` node;
- double-clicking a function also inserts a `Call Subgraph` node.

## Current Built-In Templates

- `Template - Rotating Cube`: rotates the internal Default Mesh using `deltaTime * speedY`.
- `Template - Click Color Pulse`: pointer press changes material color, then restores it after a delay.
- `Template - Debug Counter`: accumulates `secondsAlive` and prints a readable interval heartbeat.
- `Template - Space Jump Body`: creates a physics body on start and applies an upward impulse on Space.
- `Template - Patrol Mover`: exposes movement/spin variables and moves the Default Mesh every update.
- `Template - Toggle Switch`: toggles an exposed boolean with E and swaps material color through a Branch.
- `Template - Distance Beacon`: compares owner distance from world origin against an exposed radius and swaps material color.
- `Template - Player Soccer Element` (soccer pack): Soccer Pawn starter with role selection up to goalkeeper, Mixamo animation clip slots per action, motion-blend movement and kit color live edit.
- `Template - Soccer Ball` (soccer pack): explicit ball spawn with selectable classic-match or locked-penalty behavior.
- `Template - Soccer Goal Frame` (soccer pack): reusable goal-line scoring sensor, kept independent from the authored posts/net mesh.
- `Template - Player Character (Normal)` (character pack): generic on-foot starter with normal/civil/police presets, walk/run/sprint/jump/interact graph, camera and documented in-place animation slots.
- `Template - Penalty Shootout Manager` (soccer pack): referee/coordinator that reuses Ball/Goal IDs, runs the alternating shootout and emits score events. It can still create missing runtime objects for older scenes.

These are local editable starters placed one Logic Element at a time. For a complete, already-playable scene built from them, use **New Level -> Penalty Shootout Stadium (Soccer)** (`docs/CHARACTER_MOVEMENT.md`), which places the five-element kicker, goalkeeper, ball, goal sensor and manager composition onto a generated regulation stadium.

The player template passes Action as continuous input rather than a one-frame key event. Hold `F / X`, use movement axes to aim, optionally hold Sprint for curve, and release to commit the kick at the animation's authored contact phase. The Ball runtime samples compatible foot bones for physical touches; during a penalty, contact before a committed kick is an immediate miss.

Reusable Logic Element assets also store `definitionVersion` and a dependency manifest. Current dependency collection covers internal mesh assets plus texture/audio references used by graph nodes.

The Graph Inspector shows the current dependency manifest so authors can spot external mesh, texture and audio references before saving/exporting a reusable Logic Element. Each entry is marked as `found`, `external`, `external fallback`, or `missing` against the local asset library where possible, and the report can be copied for review/debug notes.

Asset-aware node inputs can still be typed as manual paths/URLs, but compatible pins such as `Load Texture.textureRef` and `Play Sound.soundRef` also expose library pickers in the Logic Element Inspector. Picked assets are stored as small references with `id/key/dbKey/src` metadata, and runtime services resolve blob-backed `dbKey` values through `LK_ASSET_BLOBS` where supported.

The dependency list also exposes a base `Relink asset...` control when compatible library assets exist. Current relink coverage updates internal mesh assets plus `Load Texture.textureRef` and `Play Sound.soundRef` nodes in the main graph or Function graphs. Missing refs can also be marked as intentional manual/external fallbacks so reusable assets stay explicit while waiting for a real project asset replacement.

For portable code-facing workflows, `LK_LOGIC_EXPORTER.exportGraphModule(graph, {format:'js' | 'ts'})` can emit a safe graph data module with metadata and dependencies. `LK_LOGIC_EXPORTER.exportGraphRuntimeModule(...)` adds a small `create...Runtime()` helper that instantiates the exported graph through `LK_LOGIC_RUNTIME`. `LK_LOGIC_EXPORTER.exportGraphImperativeModule(...)` emits a bounded imperative runner for the safe starter subset (`On Start`, `Print`, math base and variables) and records unsupported reached nodes instead of evaluating arbitrary code.

## Validation Pass

Before marking a Logic Element authoring change complete:

- run the graph through the shared validator;
- make sure warnings are visible but do not block runtime unless structural errors exist;
- verify save/reload for local graph JSON;
- verify linked-instance behavior only if reusable assets were touched;
- update the active `RELEASE_NOTES_v*.md`, architecture/runtime docs, applicable roadmap and this guide when the public authoring surface changes.
