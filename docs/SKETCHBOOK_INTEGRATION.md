# Sketchbook integration

This integration imports the reusable open-world data and pawn definitions from [swift502/Sketchbook](https://github.com/swift502/Sketchbook) as a separate, editable authoring pack. It does not replace or modify LOT KING's native `player_car`, race, or drift definitions.

## License, credit, and provenance

Sketchbook is Copyright (c) 2020 swift502 and is distributed under the MIT License. The exact upstream license shipped with these assets is included at `models/sketchbook/LICENSE-Sketchbook-MIT.txt`.

Thank you to **Jan Bláha (swift502)** for publishing Sketchbook and making this upgrade possible. The upstream README also credits aleqsunder, barhatsor, and danshuri.

- Repository: `https://github.com/swift502/Sketchbook`
- Imported branch: `master`
- Source snapshot: `62f4b7986fd1ce1e4f91daba89ef032c20a6ce55`
- License: MIT
- Imported source paths: `build/assets/{world,boxman,car,heli,airplane}.glb` and `LICENSE`
- Import policy: the five GLBs are byte-identical copies. Their glTF `extras` are intentionally retained.

| Local asset | Size (bytes) | SHA-256 |
| --- | ---: | --- |
| `models/sketchbook/world.glb` | 26,389,488 | `2f38a76c0c954ff30d06aeca8bc0f0555cdfd70b5cc665f98514017008524e58` |
| `models/sketchbook/boxman.glb` | 757,340 | `3540a3dc0dcab22982be12a7f4f6132822f2abaac6f140dc4c08a312af49f8a9` |
| `models/sketchbook/car.glb` | 619,264 | `697672a989130ce4bde31cd31185c1c4edae816920cb6e61b4705ace99b28422` |
| `models/sketchbook/heli.glb` | 477,304 | `1fe2a67a8881d493dbe99e1dd5319f5c958d71491161aa89dbde90c4a3d04bd7` |
| `models/sketchbook/airplane.glb` | 457,620 | `ea62746672ae2b423e9a36b2abb72243b2e58338c6bc5e101545eea5a67db873` |

## Editor content

The authoring pack provides four new built-in Logic Elements. Each has a `graph.sketchbookPawn` descriptor and exposes its model, model fit, spawn, player assignment, engine camera mode, driver/passenger interaction, seat keys, linked-door animation, and vehicle-specific tuning without changing the existing native pawn types. The model field uses a dedicated all-GLB picker (vehicles and aircraft are not filtered as animation libraries); imported asset identity is mirrored into `logicScene`, so replacement GLBs persist and are discovered by playable export. The dedicated runtime dispatches this descriptor before the legacy vehicle fallback, so it never substitutes the native race/drift car physics.

| Logic Element | Upstream feature mapping | Placeholder |
| --- | --- | --- |
| Sketchbook - Advanced Character | spring-derived character motion, capsule/ground probe, sprint/jump, driver/passenger entry and seat switching | `boxman.glb` with 34 animation clips |
| Sketchbook - Arcade Car | raycast wheels, suspension, AWD/FWD/RWD configuration, gears, steering and rear handbrake | `car.glb`; wheel, collider, camera, seat and door metadata retained |
| Sketchbook - Arcade Airplane | landing gear, throttle spool, lift/drag and pitch/yaw/roll controls | `airplane.glb`; aileron, elevator, rudder, rotor, seat and camera metadata retained |
| Sketchbook - Arcade Helicopter | thrust, gravity compensation, damping, auto-level, pitch/roll/yaw and rotor spool | `heli.glb`; rotor, collider, seat, door and camera metadata retained |

`Sketchbook Open World` is the corresponding editable level template. It adds the unmodified `world.glb` and **seven** editable Pawn instances at their actual upstream spawn-node positions: the default player from `Spawn.024`, plus two cars, two airplanes, and two helicopters from all six children of the invisible `air_vehicles` scenario marked `spawn_always=true`. It also records attribution/template metadata and disables the level's generic native player because the advanced character owns Player 1. The shared native `player_car` assets and logic remain available and unchanged for race and drift projects.

The world file retains 427 physics descriptors (303 boxes and 124 triangle meshes), 74 path nodes, 3 paths, 8 scenario descriptors, and 29 spawn descriptors. They remain inside the original GLB as glTF `extras`, including links such as `nextNode`, `previousNode`, `first_node`, seat/door connections, scenario flags, and vehicle-part roles.

The current Sketchbook world adapter discovers a loaded scene entry tagged `physicsBackend: sketchbook-metadata` or `metadataMode: gltf-extras` and automatically converts its `data=physics` box/trimesh nodes into shared Cannon static bodies. It reference-counts those bodies and removes them with the scene. Path, scenario, and spawn records are exposed through a read-only runtime registry without silently spawning AI. Vehicle Pawn instances consume their own seat, connection, entry-point and door records directly from the GLB.

The upstream scenarios represented by this metadata are Oval race, Tunnel race, Figure 8, Loop ramp, Mega ramp, two Free roam variants, and the always-spawn aviation/vehicle group. Sketchbook supplies AI spawn/path setup for the race scenarios; it does not contain a complete lap, checkpoint, race-position, or results system.

## Current adapter controls

Movement and car input continue through the engine's normal rebindable player contexts. Flight axes also fall back to the engine's analog input on non-keyboard devices; seat actions are available through their exposed keys or the Logic Element control fields. The defaults mirror the source:

| Pawn | Controls |
| --- | --- |
| Character | WASD/arrows move, Shift sprint, Space jump, F driver seat/exit, G passenger seat, X switch linked seat |
| Car | W/S throttle/reverse, A/D steer, Space handbrake, F exit, X switch linked seat, C camera |
| Airplane | Shift throttle, Space decelerate, W/S pitch, A/D roll, Q/E yaw, B wheel brake, F driver seat/exit, C camera; the bundled GLB has one driver seat |
| Helicopter | Shift ascend, Space descend, W/S pitch, A/D roll, Q/E yaw, F/G seats, X switch, C camera |

The supported camera values are the engine modes `free`, `interior`, `arcade`, and `cinematic`. The engine's global C action cycles these modes (B while the first-person rig owns C); V remains Look Back. Seat occupancy is reserved atomically; a passenger keeps their player/camera ownership, while taking the driver seat transfers both to the vehicle. The advanced character now reserves a free seat, walks to the nearest linked entry point, opens the linked door, and runs timed full-body enter/exit phases. Clip selection is side-aware from seat/door metadata: the bundled defaults use the real `sit_down_left/right` and `stand_up_left/right` clips, while airplanes prefer `enter_airplane_left/right`. Left/right driver/passenger mappings, seated and locomotion clips, approach speed/distance/timeout and transition durations are exposed in the Logic Element. If a replacement GLB does not contain a mapped clip, the same state machine completes through procedural world-space interpolation instead of trapping the player.

## Starting from Empty

The open-world template is a convenience, not a dependency. In an Empty level, all five bundled MIT assets (`world`, `boxman`, `car`, `airplane`, and `heli`) are listed automatically in the Assets panel and can be placed like normal GLBs. Add any of the four Sketchbook Logic Elements from the Logic Element templates, position it, assign its controller/player, and tune its exposed settings. Add the bundled world only when that environment is wanted; custom levels and imported environments can use the same pawns. This preserves the editor as the master authoring surface for projects and levels.

The automatic adapters consume physics and vehicle-seat records. Path/scenario/spawn records are deliberately registered for project systems to query rather than being treated as already-running AI gameplay:

- world objects: `data=physics`, `type=box|trimesh`;
- paths: `data=path` and `data=pathNode` with previous/next node links;
- scenarios: `data=scenario` plus name, default/always/invisible flags and description/camera fields;
- spawns: `data=spawn`, `type=player|car|heli|airplane`, `driver=player|ai`, and optional `first_node`;
- vehicle models: collision shapes, wheels, seats, linked entry points/doors, cameras, steering wheel, control surfaces, and rotors.

## Baseline tuning retained from Sketchbook

- Character: mass 1, three-sphere capsule radius 0.25 with 0.5 between the extreme sphere centers, ground ray 0.57, safe offset 0.03, move speed 4, walking/sprint targets 0.8/1.4, vertical jump addition 4, velocity-spring mass/damping 50/0.8, and rotation-spring mass/damping 10/0.5. The current adapter adds explicit acceleration, turn-rate, slope, and air-control stabilization around that source baseline.
- Car: inherited vehicle mass 50; wheel radius 0.25; stiffness 20; rest length 0.35; travel 1; friction slip 0.8; relaxation/compression damping 2/2; roll influence 0.8; engine force 500; shift time 0.2; speed limits 5/9/13/17/22; reverse 4; max steer 0.8; rear handbrake force 1,000,000.
- Airplane: inherited initial mass 50, dynamically reduced toward 20 with speed; wheel radius 0.12; suspension stiffness 150; rest length 0.25; damping 5/5; pitch/yaw/roll gains 0.04/0.02/0.055; drag 0.003; lift 0.005 capped at 0.05; wheel brake 100; spool up/down 0.4/0.12. The adapter preserves the source's 60 Hz arcade velocity model while time-normalizing it for bounded variable deltas.
- Helicopter: inherited mass 50; thrust 0.15; gravity compensation 0.98; vertical damping 0.01; horizontal velocity multiplier 0.995; auto-level quaternion factor 0.3; rotation gain 0.07; angular-velocity multiplier 0.97; spool up/down 0.2/0.06. The adapter time-normalizes these frame-oriented source values.

## Known limitations and integration boundaries

- The Logic Elements are the stable, editable authoring contract. The loaded dedicated Sketchbook runtime consumes `graph.sketchbookPawn` and supplies Cannon physics with a headless arcade fallback; it remains separate from the native race/drift car.
- Keeping `world.glb` intact preserves all author data. The automatic metadata adapter creates physics bodies for recognized box/trimesh nodes and registers paths/scenarios/spawns, but it does not auto-create AI agents or execute scenario rules. The 124 triangle meshes may still need spatial streaming/batching for large production levels.
- Upstream targets Three.js r113, Cannon.js 0.6.2, TypeScript 3.9, and webpack 4. Its runtime is an architectural source, not a dependency that should be copied wholesale into the current engine.
- The upstream airplane and helicopter use arcade velocity behavior tuned around a fixed 60 Hz step. The adapter preserves their authored coefficients and normalizes frame-oriented changes against a bounded 60 Hz delta; it remains an r185/Cannon integration rather than execution of the old application bundle.
- The source character controller has limited slope/step/continuous-collision handling compared with a production controller. These are explicit improvement points, not reasons to alter existing player movement globally.
- Entry/exit supports driver and passenger roles, connected-seat switching, atomic reservation/occupancy, automatic walk-to-door choreography, configurable full-body transition clips with procedural fallback, linked entry points, visual door motion, inherited vehicle velocity and a safe-exit fallback. Exit clearance uses Cannon body bounds; it does not yet perform a capsule sweep against every individual static triangle at the exit point.
- This import deliberately excludes upstream libraries and shaders. Only the five project GLBs and the repository's MIT license are included here.

The source commit and asset hashes above are the review boundary for future upgrades. Any later replacement should update this document and keep the attribution/license alongside the imported files.
