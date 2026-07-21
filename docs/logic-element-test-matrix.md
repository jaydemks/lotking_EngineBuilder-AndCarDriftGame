# Logic Element Technical Test Matrix

This matrix tracks implementation-side verification for Logic Element Part 1. User video/presentation acceptance testing is separate and does not affect roadmap completion percentages.

## Core Graph Coverage

| Area | Coverage | Status |
|---|---|---|
| Starter graph validation | `tests/logic-core.test.js` | Automated |
| Contextual warnings/errors | `tests/logic-core.test.js` | Automated |
| Runtime start/update flow | `tests/logic-core.test.js` | Automated |
| Runtime variable persistence | `tests/logic-core.test.js` | Automated |
| Runtime profiling stats | `tests/logic-core.test.js` | Automated |
| Runtime timeline samples | `tests/logic-core.test.js` | Automated |
| Breakpoint hit timeline samples | `tests/logic-core.test.js` | Automated |
| Runner profiling aggregation | `tests/logic-core.test.js` | Automated |
| Reusable subgraph execution | `tests/logic-core.test.js` | Automated |
| Function payload and return value | `tests/logic-core.test.js` | Automated |
| Dynamic `Call Subgraph` input/output pins | `tests/logic-core.test.js` | Automated |
| Named multi-output Function return mapping | `tests/logic-core.test.js` | Automated |
| Function metadata diagnostics | `tests/logic-core.test.js` | Automated |
| Macro metadata normalization | `tests/logic-core.test.js` | Automated |
| Pause on breakpoint runtime | `tests/logic-core.test.js` | Automated |
| Step from paused breakpoint | `tests/logic-core.test.js` | Automated |
| `Tick Every` interval behavior | `tests/logic-core.test.js` | Automated |
| Built-in template validation | `tests/logic-core.test.js` | Automated |
| Template clone isolation | `tests/logic-core.test.js` | Automated |
| Logic Element dependency manifest | `tests/logic-core.test.js` | Automated |
| Logic Element definition asset migration | `tests/logic-core.test.js` | Automated |
| Vehicle Pawn registry and per-instance motion isolation | `tests/logic-core.test.js` | Passing |
| Pawn Core lifecycle/component reuse | `tests/logic-core.test.js` | Passing for Human and Animal mock components |
| Player slot conflict and forced possession transfer | `tests/logic-core.test.js` | Passing |
| Player Car template Vehicle Pawn nodes and Function validity | Focused Node validator run | Passing, zero warnings |
| Function data consistency after state mutation | `tests/logic-core.test.js` multi-output Function case | Passing |
| Complete Logic core regression suite | `tests/logic-core.test.js` | Passing |
| Generic Character nodes, template, presets, Pawn movement/jump and self-collider exclusion | `tests/character-core.test.js` | Passing |
| Soccer roles, Pawn movement, ball, goals, stadium and penalty flow | `tests/soccer-core.test.js` | Passing |
| Pawn event/node catalog | `tests/logic-core.test.js` | Passing for drift, gear, reset and possession contracts |
| Legacy Player snapshot → Vehicle Pawn v2 migration | `tests/logic-core.test.js` | Passing, lossless snapshot retained |
| Graph Inspector dependency list | Graph Inspector shows collected dependency references and found/external/missing status | Automated browser spec present |
| Dependency relink base | Graph Inspector can relink compatible mesh/texture/audio dependencies from the asset library | Automated browser spec present |
| Dependency report/fallback base | Graph Inspector can copy a dependency report and mark missing refs as manual/external fallbacks | Manual/browser smoke pending |
| Asset-aware pin picker | `Load Texture.textureRef` and `Play Sound.soundRef` accept manual refs or asset-library references | Automated browser spec present |
| Logic graph JS/TS data-module export | `tests/logic-core.test.js` | Automated |
| Logic graph JS/TS runtime-wrapper export | `tests/logic-core.test.js` | Automated |
| Logic graph JS/TS imperative subset export | `tests/logic-core.test.js` | Automated |
| Logic Profiler clear/details polish | Logic Profiler shows paused-node details, clears active runtime timelines and opens JSON details for recent timeline events | Manual/browser smoke pending |

## Browser Editor Coverage

| Area | Coverage | Status |
|---|---|---|
| Editor boot and canvas render | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Add scene Logic Element | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Open Logic Element Editor | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Graph node render and validator status | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Graph zoom and comments | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Graph Delete key isolation | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Warning UI from invalid node default | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Viewport tab canvas render | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Assets-panel template placement | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Character template pack/runtime loading | `tests/browser/character-template.spec.js` | Automated and passing |
| Save/reload linked asset round trip | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Export/import portable local Logic Element template | `tests/browser/logic-element-editor.spec.js` | Automated browser spec present |
| Logic Profiler panel | Shows active runtime stats during Play Preview | Automated browser spec present |
| Functions sidebar base | Create/select/manage subgraphs and insert `Call Subgraph` nodes | Automated browser spec present |
| Function canvas switch | Edit Main Graph or an individual Function from the graph selector | Automated browser spec present |
| Function metadata I/O UI | Add/remove/rename Function inputs and outputs | Automated browser spec present |

## Save / Reload / Export Matrix

| Scenario | Expected Result | Status |
|---|---|---|
| Local Logic Element graph export/import | Graph, variables, comments and `logicScene` remain intact | Automated browser spec present for template graph |
| Reusable Logic Element asset save/reload | Asset definition remains available in Assets | Automated browser spec present |
| Linked instance save/reload | Instance keeps `logicAssetId`, link state and embedded fallback | Automated browser spec present |
| Exposed variable override save/reload | Override survives without mutating shared asset defaults | Automated browser spec present |
| Make local | Instance keeps resolved graph and removes shared link | Automated browser spec present |
| Reset overrides | Instance returns exposed values to shared defaults | Automated browser spec present |
| Portable export/import | Local graph and linked asset fallback restore from LKEP | Automated browser spec present |
| Play Preview startup | Local Logic Element template starts and runs `On Start` debug print | Automated browser spec present |
| Runtime profiler UI | Runtime count and per-graph stats are visible during Play Preview | Automated browser spec present |

## Template Matrix

| Template | Expected Behavior | Automated Validation |
|---|---|---|
| `Template - Rotating Cube` | Rotates `Default Mesh` using exposed `speedY` | Graph valid, local clone isolated |
| `Template - Click Color Pulse` | Pointer press flashes color and restores it after delay | Graph valid, local clone isolated |
| `Template - Debug Counter` | Updates exposed `secondsAlive` and prints interval heartbeat | Graph valid, local clone isolated |
| `Template - Space Jump Body` | Creates a physics body and applies impulse on Space | Graph valid, local clone isolated |
| `Template - Patrol Mover` | Moves and rotates `Default Mesh` from exposed speeds | Graph valid, local clone isolated |
| `Template - Toggle Switch` | Toggles exposed boolean with E and swaps color | Graph valid, local clone isolated |
| `Template - Distance Beacon` | Compares owner distance to exposed radius and swaps color | Graph valid, local clone isolated |
| `Template - Player Character (Normal)` | Camera-relative on-foot movement with normal/civil/police presets and documented in-place animation slots | `tests/character-core.test.js` + browser pack load |
| `Template - Player Soccer Element` | Shared Character movement plus football roles/actions up to goalkeeper | `tests/soccer-core.test.js` |

## Sign-Off Rule

Part 1 implementation can be marked complete when:

- core graph tests pass in a working Node environment;
- browser editor spec passes in a working Playwright environment;
- save/reload/export matrix has at least one recorded successful browser run;
- release notes, roadmap, architecture and runtime modules docs match the implemented state.
