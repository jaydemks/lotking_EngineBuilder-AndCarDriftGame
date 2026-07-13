# Logic Element Authoring Notes

This is the short operational guide for extending the current Logic Element system without coupling UI, runtime, and persistence too tightly.

## Where Things Live

- `js/logic/logic-graph.js` owns graph shape, cloning, starter graphs, and normalization.
- `js/logic/logic-nodes-mvp.js` registers node definitions.
- `js/logic/logic-runtime.js` executes graph JSON through registered nodes.
- `js/logic/logic-services.js` is the only bridge from nodes to engine systems.
- `js/logic/logic-templates.js` contains built-in starter Logic Element templates shown in the Assets panel.
- `js/editor/logic-elements-inspector.js` owns authoring UI only.

## Adding A Node

1. Register the node in `logic-nodes-mvp.js` with a stable `type`.
2. Give every input/output a stable pin name. Display labels can change; pin ids should not.
3. Use `run(api)` for exec nodes and `evaluate(api, pin)` for pure data nodes.
4. Access scene, physics, material, audio, camera, input, animation, and debug only through `api.services`.
5. Add validator coverage when the node has reference-heavy defaults, such as variables, elements, assets, or names.
6. Add at least one focused example graph or template if the node is intended for authoring demos.

## Adding A Template

Templates are local editable starters, not linked reusable assets. Placing a template creates a normal scene Logic Element copy, so users can change it freely without mutating a hidden built-in definition.

The Player Car template is a special Vehicle Pawn definition. Keep its persistent authoring data in `graph.vehiclePawn` (schema v2) and retain `graph.playerPawnBlueprint` only as the lossless migration/reference snapshot. Runtime speed, RPM, gear and temporary control state belong to the Pawn instance and must never be written back into the graph during Play Preview.

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
- update `ROADMAP_NODES_BLUEPRINT_JS_PART1.md`, `RELEASE_NOTES_v0.6.5.md`, and this doc when the public authoring surface changes.
