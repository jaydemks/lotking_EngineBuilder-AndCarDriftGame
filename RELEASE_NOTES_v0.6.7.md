# Release Notes: v0.6.7

## v0.6.7 - Vehicle Pawn Foundation

### Release Status

- Status: released; Vehicle Pawn foundation implemented, advanced Player Car parity remains an explicit post-release workstream.
- Tag target: `v0.6.7`.
- Scope: Player Car Logic Element runtime, per-instance possession/state, vehicle nodes/functions, and compact Logic Element overlay.

### Added

- Menu-role level backgrounds: `EDITOR MENU` / `GAME MENU` levels can now render as the fullscreen menu scene instead of falling back to the dark CSS/black background.
- The landing `index.html` boot progress bar now advances with the selected ROLE menu level preload instead of staying empty while the menu background iframe warms up.
- LKEP export now stores a lightweight menu-role config for `EDITOR MENU` / `GAME MENU` levels instead of embedding whole menu scenes; FTP/static demos can load those menu roles from sidecar project files such as `demo/menu-levels/editor-menu.lkep.json`.
- LKEP/project export now prefers root-relative asset paths such as `models/*.glb`, `media/*` and `musics/*` when those files already exist in the project root, keeping FTP/demo project files lightweight instead of converting known root assets to base64.
- Folder workspaces now maintain a portable `lotking-workspace/projects.json` catalog plus per-project files in `lotking-workspace/projects/`, so re-selecting the same folder can restore multiple browser-visible projects instead of only the last active project.
- Versioned `VehiclePawn` v2 contract with separate persistent config, runtime state and visual owner.
- Generic `Pawn Core` with reusable identity, lifecycle, flags and component registry for future Vehicle, Human and Animal Logic Elements.
- `LOT_KING.pawns` registry with stable IDs, nullable Player IDs, conflict-safe possession and lifecycle methods.
- Deterministic first-available P1–P4 assignment API and Logic node; a fifth Pawn remains `None` until a slot is released.
- Native Player Car adapter that exposes the reference implementation without replacing or changing its behavior.
- Independent Logic Element Pawn fallback locomotion, reset/spawn and state for multiple instances.
- Independent Cannon `RaycastVehicle` backend per Logic Pawn with four wheel infos, suspension, collision ownership and complete disposal; arcade fallback remains available.
- Configurable wheel rig with manual GLB mesh/pivot assignment, steering/driven flags and support for additional wheels without fixed naming assumptions.
- Logic Player Car instances without a GLB clone the native procedural vehicle visual with isolated geometry/material state; GLB cloning preserves skeletons, clips and morph data.
- Vehicle Pawn nodes for self/player lookup, possession, unpossession, drive controls, reset and runtime metrics.
- Runtime nodes for per-Pawn tuning, suspension, enable state and reactive light collections.
- Per-Pawn camera anchor/follow possession, neon, exhaust smoke and fading skid-mark pools with cleanup.
- Multiple authored camera anchors per Logic Pawn with runtime active-anchor selection and correct Active Level Camera fallback.
- Per-Pawn headlights/high beams, rear brake/reverse lights and unlimited conditional auxiliary lights driven by the owning Player input and Pawn state.
- Independent per-Pawn Sound Set sample playback with synth fallback, configurable 3D Data Widgets and active-camera HUD routing.
- Pawn-scoped drift, gear, reset, possession and input-device-change events for Logic graphs.
- Exposed variables can bind directly to Pawn lifecycle, Player assignment, tuning, camera, lights, effects, audio and widgets without custom graph code.
- Player Car template Function `Apply Player Drive`, using the existing Function/Subgraph system.
- Unit regression coverage for per-instance state and possession isolation.

### Improved

- The `index.html` landing menu now starts the editor-menu background iframe directly in the initial markup, before the menu UI is released from preloading.
- `index.html` now preloads `engine_editor.html` in a hidden editor host after the menu-role background is ready, so opening the editor reuses an already warming document instead of cold-navigating away from the loaded menu background.
- The landing shell reloads the menu-role background if the browser level library changes while it is alive.
- `engine_editor.html` keeps the same menu-role background visible behind its loading/menu overlay, then hides it when the editor UI actually enters.
- Saving with a linked local folder now shows a dedicated progress overlay with the current operation, for example `Allineando cartella locale a: catalogo workspace e file progetto`.
- The workspace mode indicator now lives at the right side of the editor menu bar with `File` / `Edit` / `View`, avoiding overlap with bottom-right progress/status overlays.
- Runtime track select now filters out `EDITOR MENU` and `GAME MENU` levels; those roles are visual menu scenes, not launchable tracks.
- Menu-role backgrounds run a menu-only scene frame loop for effects, GLB animations, sky/weather and scene/cinema camera overrides while keeping player input, physics and HUD inactive.
- Player Car conversions now persist `graph.vehiclePawn` schema v2 while retaining the complete v0.6.6 `graph.playerPawnBlueprint` snapshot for lossless migration.
- Logic Element runner starts, steps and disposes the Pawn owned by each graph runtime.
- Logic Element sidebars, labels, controls and inspector spacing are smaller; the right sidebar collapses below 980 px.
- Logic Element Vehicle Pawn Inspector exposes mass, collider, acceleration, braking, steering, grip, drag and Raycast suspension tuning.
- Vehicle Pawn identity, Player assignment, authored spawn transform and complete collider offsets/radius are visible and editable together.
- Player Camera, Lights/Neon and Attachments inspectors now accept an explicit Pawn target; the native Player remains their default target while Logic Elements persist changes to their own definition.
- Player Collider now uses one target-aware inspector for native and Logic Pawns, including target-local undo/redo snapshots.
- Camera, Lights and Attachments inspectors now record target-local undo/redo snapshots for native or Logic Pawns.
- Vehicle state includes per-instance oversteer, burnout and limiter telemetry alongside drift/reverse/RPM/gear.
- Logic Vehicle Pawns mount the existing Live Material and Mesh/GLB editors against `vehicle_model`, preserving multi-selection material overrides and mesh split/join/delete edits without including wheels or effect helpers.
- Player Setup now follows the same target-aware contract for Pawn assignment, driving presets, model state and Engine Sound Set authoring.
- Data Widgets can be added, configured, selected and removed through the shared Attachments inspector for either target.
- Light, exhaust, skid and Data Widget collections support add, duplicate, reorder and delete while retaining Pawn-relative authoring anchors.
- Central graph normalization migrates v0.6.6 Player snapshots to stable Vehicle Pawn v2 data with lossless legacy retention.
- Vehicle Pawn dependency manifests include model, material textures and Engine Sound Set references; playable preparation normalizes nested Logic material and mesh-edit assets.
- Versioned Vehicle Physics Backend API with selectable Auto/Cannon/Arcade or registered plugin implementations, explicit fallback diagnostics and exportable version/license/attribution metadata.
- Player Car template no longer uses a simplified owner-translation demonstration chain.

### Fixed

- Cinema Studio timelines assigned to Player 1 now show an automatic bottom-right final preview when selected in the editor, matching the camera/player preview feedback before entering Play Preview.
- The automatic Player 1 Cinema preview advances through the timeline shots, so the selected timeline is visibly impersonated as the player output instead of showing only a static first frame.
- Assigning Player 1 to a Cinema Studio now clears Player 1 from scene cameras and other Cinema Studios, matching the single-output behavior of scene cameras.
- Editor Play Preview now allows Player 1 Cinema timelines to start while the runtime is still under the editor session, including saved `0`/`"0"` player output values; `Runtime event` timelines still wait for their event.
- Runtime Cinema Studio timelines assigned to Player 1 now apply the same clean timeline result as editor preview: object tracks, lens/FOV tracks, timeline events and the active camera cut are evaluated together instead of showing only the camera switch.
- Reloading with an authored menu-role level available no longer leaves the menu on a plain black/background-only screen; the role scene is applied for the menu background and a later track launch reloads cleanly when needed.
- FTP/online demos now keep the bundled `demo-project.lkep.json` available in memory as a menu-role fallback, so an `EDITOR MENU` / `GAME MENU` demo can still render as the background even when browser storage rejects a large legacy LKEP or a configured sidecar is missing.
- The landing boot progress now waits for the online ROLE menu iframe to apply and warm its first rendered frames before completing, instead of releasing the menu early on the previous short timeout.
- Networked menu/demo loading progress now reports the active step, downloaded/total bytes, download speed and estimated time remaining when the server exposes content length.
- Online menu-preview frames no longer install the bundled DEMO project into browser storage, preventing the landing page storage listener from reloading the role-menu background in a download loop.
- The landing page no longer preloads `engine_editor.html` automatically at boot, avoiding a second hidden menu-background runtime and duplicate `demo-project.lkep.json` download before the user opens the editor.
- ROLE menu exports no longer write a sidecar reference for the same role as the exported project, and runtime skips legacy same-role sidecar refs to avoid FTP 404s when `demo-project.lkep.json` is itself the menu background.
- The hosted workspace chooser now opens the author DEMO directly from `demo/demo-project.lkep.json` without asking for a local folder, while the local-files card is an explicit optional folder-link action with friendly cancel messaging.
- Linking a local folder from the hosted first-run card now initializes `lotking-workspace/workspace-manifest.json` and `active-project.lkep.json`, then reloads into a clean project instead of leaving the editor on `Loading world`.
- Re-selecting an existing local folder no longer overwrites it with a clean first-run project; the editor detects the workspace catalog/project and imports its project list into the browser project overlay.
- Pawn `None` possession resolves to neutral input.
- Two Pawn instances cannot claim the same Player slot unless a graph explicitly requests forced transfer.
- Disposing a Logic Element releases its Player slot and registry references.
- LKEP import reinstalls embedded linked Logic Element definitions into the local asset catalog, preserving names, links and per-instance overrides before scene hydration.

### Verification

- JavaScript syntax checks pass for all changed runtime/Logic files.
- The new Vehicle Pawn isolation/possession unit test passes.
- A focused registry/validator check confirms the Player Car Vehicle Pawn template, all new nodes and `Apply Player Drive` with zero warnings.
- The complete Logic core suite passes, including Functions/Subgraphs, template validation, Vehicle Pawn isolation, node contracts and exporter checks.
- Validator coverage rejects empty Pawn IDs, invalid P1–P4 assignments and invalid literal Player references in nodes.
- Dependency regression coverage verifies Vehicle Pawn mesh, material texture and Sound Set references survive graph normalization/export metadata.
- Backend API regression coverage verifies plugin registration, selection and missing-plugin fallback metadata.
- Multi-Pawn regression coverage verifies deterministic P1–P4 assignment, `None`, contention, forced transfer and slot reuse.
- Functional Pawn regression coverage executes acceleration, braking into reverse, handbrake drift, RPM/gear telemetry and exact reset-to-spawn behavior.
- Visual/effect parity coverage verifies per-instance camera modes, automatic light conditions/high beams and unified exhaust/skid/widget/audio cleanup.
- Runtime audit confirms new Pawn components avoid the native singleton; `GAME.player` remains only at the explicit compatibility adapter boundary.
- Chromium persistence coverage now also asserts material properties and mesh delete/transform edits survive editor and playable round trips.
- Wheel configuration regression coverage verifies custom pivot IDs and additional wheel definitions survive normalization.
- Template regression coverage verifies the default Player Car exposed-variable bindings survive normalization.
- Added a Vehicle Physics provenance audit covering Cannon.js, the project Arcade fallback and metadata requirements for external backends.
- Function data evaluation is cached per execution chain, preventing a return value from being recomputed after a preceding state mutation.
- Focused Chromium Playwright round-trip for linked Logic assets, embedded fallback and variable overrides passes; broader WebGL parity remains required.
- A second focused Chromium test passes for Vehicle Pawn save/reload, IndexedDB blob recovery, v0.6.6 migration and playable `LKPKG` asset normalization.
- Cannon browser sign-off now covers the Logic Vehicle Pawn chassis, four-wheel RaycastVehicle suspension and isolated collider construction; runtime Active Camera ownership is asserted in the same parity path.
- Playable ZIP assembly now uses a bounded concurrent fetch queue and no longer requests nonexistent Three.js FontLoader/TextGeometry classic CDN files.
- Local multiplayer now exposes a stable Player 1 global-UI/audio-listener policy; other assigned controllers cannot toggle pause, radio, tuning, mute or help through the native Pawn path.
- Vehicle HUD and radio telemetry now follow the Player ID of the Pawn owning the active camera frame, with isolated P1–P4 HUD data caches and explicit frame ownership metadata.
- Runtime pointer lock is now owned by a Player frame, constrained to that frame rectangle and released automatically when active camera ownership changes.
- The hosted DEMO/local-first path is signed off around an immutable remote template, isolated browser workspace and explicitly optional linked local folder.
- Added configurable 2–4 player split-screen layouts driven by possessed Pawn/Player IDs; the native Player Car and Logic Vehicle Pawns render side by side without identity replacement.
- Optional third-party physics implementations remain outside the runtime core behind the versioned backend registry; only the compatibility-critical Cannon and Arcade implementations remain built in.
- Scene Camera and Cinema Studio outputs now support P1–P4; Cinema timeline camera cuts take over only their assigned split-screen frame while other native or Logic Pawn cameras continue rendering.
- Final Part 2 sign-off passes: JavaScript syntax, the complete Logic core suite, deterministic Vehicle reference behavior, Cannon Logic Pawn creation, Active Camera ownership and a real downloadable playable ZIP from `engine_editor.html`.
- The native Player Car remains installed as `native-player-car` and can coexist with independently identified Logic Vehicle Pawns throughout prolonged manual comparison testing.
- Reusable Logic Element asset cards now expose a protected delete action. Built-in templates remain non-deletable, and deletion is blocked while scene instances are still linked to the asset.
- The asset catalog now classifies reusable definitions with Unreal-style category colors and badges for Vehicle Logic, general Logic, Animation and Rig. Master templates and project assets are visually distinct, and related Player Car definitions share one virtual catalog group.
- Placing the Player Car Master Template no longer silently creates another reusable definition. The editor warns before the first conversion and, when project assets already exist, requires an explicit choice to reuse, replace or intentionally create a named new copy.
- Fixed the Vehicle Pawn inspector crash caused by an unbound `selectRow`, and guaranteed the Player Car loading overlay closes on synchronous placement failures.
- Asset context menus now delete reusable Logic project assets individually or through multi-selection, while built-in templates remain protected and linked scene instances block unsafe deletion.
- Logic Element instance inspectors are now universally generated from exposed variable metadata and grouped by authored category, with support for booleans, numbers/ranges, text, vectors, select menus, colors and structured values.
- The Player Car Master Template exposes its complete everyday Pawn configuration by default—identity/input, driving, collision, suspension, camera, lights, effects, audio and HUD/widgets—and native conversion preserves those bindings instead of reducing the asset to ten controls.
- Reassigning a Player output from an active Cinema Studio now stops that timeline's ownership immediately. Menu-role levels therefore switch to the newly assigned Player camera instead of continuing to display a stale running timeline until reload.
- Selecting a Cinema Studio now shows a static final-frame preview at its current playhead; it advances only while the timeline is actually playing. Only the explicit `On Play` trigger auto-starts in Play Preview/menu roles—`Manual` timelines remain stopped.
- Assigning P1–P4 to a Logic Pawn now claims that Player frame authoring-wide: conflicting Scene Camera/Cinema outputs are cleared, a conflicting native Player assignment becomes `None`, and stale timeline ownership is stopped.
- Fixed linked Vehicle Pawn instances spawning at the master definition's coordinates instead of their placed scene position. Placement now writes per-instance Spawn X/Y/Z/Heading overrides, and runtime Pawn identity prefers the unique Logic instance ID over the reusable template ID.
- Existing Logic Vehicle instances created before Spawn overrides are migrated at runtime: when no explicit per-instance Spawn value exists, the scene object's authored transform becomes its spawn instead of the reusable asset's historical coordinates.
- Restored the native Player Car `Enabled` contract: disabling neutralizes/sleeps it without changing visibility or removing its established physics representation; visibility remains controlled independently by `Hidden`.
- Logic Vehicle Pawn camera ownership is now resolved in the final camera arbitration stage, with the same ordering used by Cinema Studio, so a possessed Logic Player Car can own Player 1 while the native car remains installed for comparison.
- Refactored Player output ownership: Pawn possession, static Camera output and Cinema output are independent contracts. Assigning a Logic Pawn no longer clears cameras or timelines, camera-only Player frames are supported, and Logic Pawn camera ownership is stored per Player instead of in one global slot.
- Player 1–4 Pawn assignment is exclusive in authoring as well as runtime: assigning an occupied slot sets the previous native/Logic Pawn to `None`, including linked Logic Element instances through per-instance overrides.
- Logic Vehicle Pawn startup now detects an overlapping native/Logic vehicle chassis and selects a nearby free runtime spawn, preventing the explosive Cannon separation that could throw the vehicle out of view and make its follow camera oscillate.
- Fixed Logic Element scene parts disappearing in Play/Final preview: internal meshes remain excluded from standalone serialization but are no longer mistaken for editor-only render helpers.
- `Pawn Enabled` now gates vehicle simulation without implicitly releasing its Player camera or hiding its model; `Hidden` remains the explicit visibility control.
- Corrected Player Car Logic Element visual parity: procedural fallback no longer inherits placeholder scale/offset, cloned native wheel pivots are excluded in favor of the four runtime-driven Logic wheels, and wheel transforms now use the Logic Scene degree convention with native dimensions.
- Logic Element empty, camera and light bulb helpers are editor-only runtime visuals by default; actual meshes, imported models and light emission remain visible in Play and playable builds.
- Logic Vehicle wheel visuals now consume Cannon `RaycastVehicle` world transforms directly (position, steering, suspension and spin) instead of approximating an independent visual suspension rig.
- Logic Element Empty/Light/Camera dummy geometry is hidden by default in both the scene and the dedicated Logic viewport, with an explicit per-element `Show dummy` authoring option; helpers remain excluded from Play/game regardless.
- Player Car Logic Element now includes native-aligned exhaust anchors and four dedicated skid anchors; optional exhaust/skid dummies use cone/footprint shapes instead of generic spheres.
- Logic Pawn follow cameras now maintain per-Pawn damped focus/target state to interpolate Cannon motion instead of exposing fixed-step lateral jitter.
- Keyboard `C` camera cycling is no longer gated by the native Player Car controller index; keyboard and gamepad edges are separated to avoid double cycling while Logic Player Pawns own the frame.
- Removed the separate Logic follow-camera solver: Logic Player Car now feeds its transform/telemetry into the native Player Car `updateCamera()` path, and the native target update is skipped while the Logic Pawn owns Player 1, eliminating the two-target per-frame oscillation.
- Procedural Player Car Logic wheels now clone the four native wheel rigs (tire/rim hierarchy and dimensions) into stable Logic wheel pivots instead of rendering independent cylinder approximations; Cannon continues to own each pivot transform.
- Wheel animation is explicitly split into suspension/steering on the outer pivot and continuous Cannon `wheel.rotation` on the inner tire/rim rig; brake discs remain outside the spinning group.
- Runtime now guarantees a visual Spin Root for every configured Logic wheel, including migrated/legacy instances, and publishes per-wheel binding/rotation/steer diagnostics on `vehicleWheelRigStatus`.
- Logic wheel spin now has a native-style speed/radius integration fallback whenever Cannon leaves `wheel.rotation` unchanged, so a moving vehicle cannot retain visually static tires.
- Logic light elements now honor authored intensity and distance; Player Car template headlights use native-range illumination and underglow uses an explicit spill radius.
- The wrench tuning panel now resolves the Logic Pawn owning Player 1 and reads/writes that Pawn's independent `driveSetup`; native and sibling vehicles are no longer modified together. Player Car Logic defaults are derived from the native Drift preset rather than the old 450 hp placeholder profile.
- Logic Player Car now instantiates the same `LK_RUNTIME_PLAYER_LIGHT_RIG` factory used by the native car, with an independent cloned configuration per Pawn; template PointLight previews are disabled at runtime to prevent a second conflicting light system.
- Added live per-instance Vehicle Runtime Diagnostics to the Logic Element Inspector: backend/body/input plus contact, suspension, Cannon rotation, visual rotation, steering, visibility, node and Spin Root status for every wheel.
- Removed the invalid numeric translation of native Drift tuning into the simplified Logic controller; migrated instances return to the previously stable Logic baseline until the native controller itself is extracted for per-Pawn reuse.
- Added `vehicle-visual-controller.js`: native and Logic Player Cars now call the same per-instance wheel visual update for suspension compression, ride height, steering and spin; the Logic-only world-transform approximation has been removed.
- Added `vehicle-raycast-actuator.js`: native and Logic Player Cars now share wheel-level engine-force, steering, brake and friction application. Logic braking now uses the native front/rear bias and wheel-force scale instead of applying full brake force independently to every wheel.
- Added `vehicle-steering-controller.js`: native and Logic Player Cars now share steering response, counter-direction recenter acceleration, maximum steering angle and high-speed steering reduction.
- Added `vehicle-engine-controller.js`: RPM, gearbox shifts, limiter, shift torque cuts and drift torque support now run through the same per-instance controller for native and Logic Player Cars.
- Logic wheel binding now removes static wheel groups from the cloned chassis using both semantic IDs and native wheel positions, then applies spin directly to the rendered tire/rim meshes rather than relying only on an intermediate Spin Root.
- Imported Logic Player Car GLBs now run through the same `LK_RUNTIME_MODEL_ASSETS.rig` builder as the native Player Car. Named wheel meshes, discs and calipers are reparented under generated steering/spin pivots and receive per-wheel suspension offsets.
- Fixed stale runtime ownership after editor changes: the Logic runner now rebuilds when Logic scene objects are added/removed or enabled, and the native Pawn adapter immediately mirrors native `Enabled`, `Hidden` and `Controller Player` changes in the shared P1–P4 registry.
- Logic runtime stepping is now an explicit stage of gameplay, Editor Play Preview and menu-role frames instead of an order-dependent generic frame hook, ensuring newly added Logic Pawns are always instantiated before camera/HUD routing.
- Gameplay session flow now explicitly rebuilds the Logic runtime immediately after the session starts and disposes it on preview stop, so Pawn creation no longer depends on receiving an initial rendered frame.
- Driving setup now includes three deliberately separated presets: balanced Default, agile high-grip Race, and controllable Drift. Drift throttle and handbrake sustain the slide angle, while prolonged excessive throttle progressively allows a spin instead of providing unlimited assistance.
- Logic Vehicle acceleration and braking were rebalanced and chassis pitch is damped to prevent unrealistic wheelies and forward flips under normal road-car loads.
- Fixed the driving wrench target for possessed Logic vehicles: it now resolves the Pawn occupying Player 1 directly instead of depending on camera ownership. Each Logic Vehicle persists and reapplies its own `driveSetup`; legacy low-level bindings can no longer restore copied native/dragster values after the setup is applied.
- Logic Vehicle driving edits now update an already-running Pawn immediately from both the wrench and the Logic Element inspector. The selected runtime target is pinned while the wrench is open, its engine controller is refreshed after setup changes, and live diagnostics report the exact applied setup and effective physics values.
- Fixed the external Logic Pawn branch of the wrench omitting suspension controls. Suspension stiffness, damping, travel, ride height, roll influence and chassis collider lift now use the same formulas as the native panel, calculated from a private per-Pawn baseline and applied live to its Cannon wheel infos/body.
- Replaced compressed Logic handling conversions with explicit per-Pawn values. Overall grip now produces separate front/rear tire authority, Oversteer directly changes their balance, Handbrake controls the rear grip cut, and horsepower/torque, braking and steering use broad monotonic ranges without mode-specific hidden grip boosts. Default, Race and Drift were recalibrated on this scale.
- Replaced Logic Vehicle placeholder effects with wheel-contact skid marks and textured exhaust sprites supporting idle/throttle smoke plus RPM, shift and limiter fire pulses. Logic lights now receive a deep native/default configuration merge, so partial per-instance settings no longer discard nested light parameters.
- Dependency status now recognizes the built-in Cannon Raycast backend as core and resolves Sound Sets from the dedicated Sound Set catalog or their embedded data instead of incorrectly reporting both as missing asset-library entries.
- Removed the remaining parallel Logic rendering path for exhaust and skid presentation. Native and Logic vehicles now emit through the same pooled smoke/flame sprites and skid geometry; the Logic Pawn supplies only its own anchors, velocity, contact point and configuration.
- Fixed duplicate Logic vehicle lighting: after the shared native light rig is installed, authored template PointLights remain hidden anchors and can no longer be reactivated by the legacy Logic light updater.
- Added a concise EN/IT editor welcome overlay with feature highlights and explicit experimental-status warnings. Users can hide it persistently or reopen it from Editor Settings → Interface; it recommends the built-in `player_car (Logic)` while the Player Car Logic Element remains under development.
- The landing ROLE menu now remains the only active runtime until the user chooses Game or Engine Editor. Choosing either unloads the ROLE frame first, then starts only the selected destination; `engine_editor.html` no longer creates a second menu-preview runtime behind the editor.
- Runtime startup now reports the exact missing shared Vehicle module files instead of failing later on an undefined `.create()`, and the editor suppresses the secondary canvas-listener exception when runtime initialization could not complete.
- Both Player Car authoring paths now expose model replacement directly near the top of their inspector. The native `player_car (Logic)` can replace/import a GLB normally, while a Vehicle Pawn Logic Element stores the selected GLB inside its reusable graph definition and rebuilds every linked instance through the shared vehicle rig pipeline without replacing wheel pivots, collision, cameras, lights or attachment anchors.
