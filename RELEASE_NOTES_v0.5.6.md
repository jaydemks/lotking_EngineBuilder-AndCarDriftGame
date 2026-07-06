# LOT KING ENGINE EDITOR v0.5.6 — Drift physics milestone + editor UX polish

## v0.5.6 — Drift physics milestone + editor UX polish

### Release Status

- Status: released.
- Tag target: `v0.5.6`.
- Scope: player-car RaycastVehicle physics, Race/Drift drive presets, vehicle HUD, scene outliner improvements, text objects, aspect-ratio/runtime polish, light warm-up flow, and editor stability fixes after `v0.5.5`.

### Highlights

- Introduced a new player-car physics pass based around wheel raycasts, suspension, brake force scaling, power-oversteer, and drift assists while preserving the arcade-drift feel.
- Added explicit `Race mode` and `Drift mode` drive presets in both the editor player setup and gameplay setup panel.
- Made `Drift mode` the default drive setup, tuned for easy rear breakaway, strong countersteer, low grip, and sustained power through the drift angle.
- Added a new bottom-right vehicle HUD with `RPM`, `KM/H`, `GEAR`, and `DRIVE TYPE` readouts styled like an in-game cockpit/vehicle display.
- Improved the Scene sidebar into a more complete outliner: list default, modern icons, expandable linked children, player-car logic visibility, and selected-object autofocus.
- Added 2D and 3D text-object editing improvements, including multiline text, crop/box sizing, and richer font styling controls.
- Improved render/light warm-up behavior so the visible `Warm-up...` state appears before expensive activation/deactivation work starts.

### Player car physics and driving

- Added dedicated `Race mode` and `Drift mode` tuning presets shared by runtime and editor.
- Added preset buttons to the gameplay setup panel and the `player_car (Logic)` driving inspector.
- Reworked default drive tuning so `Drift mode` starts as the default instead of the neutral/base setup.
- Added drive-mode detection for `DRIFT`, `RACE`, and `CUSTOM`, used by the new vehicle HUD and preset buttons.
- Reduced service braking by several times so braking no longer throws the car aggressively onto the front wheels.
- Reduced raycast wheel brake force scaling and softened brake tuning so both Race and Drift modes brake more progressively.
- Added pitch damping and yaw limiting around braking/handbrake/drift cases to reduce stoppies and sudden spinouts.
- Tuned `Drift mode` with very low default grip, stronger countersteer authority, easier rear breakaway, and better high-speed angle stability.
- Added more progressive drift yaw assist so steering in drift is less twitchy while still allowing strong countersteer.
- Added high-speed drift stabilization so the car is less likely to rotate into an unrecoverable spin at larger drift angles.
- Reworked throttle behavior in drift so full gas can keep pushing the vehicle forward instead of only killing rear grip or losing speed.
- Tuned the engine torque curve so usable torque arrives earlier and stays strong through the mid-range instead of arriving mostly at limiter/fuori-giri.
- Added drift-specific forward drive retention so the car can continue accelerating and holding speed while already sideways.
- Added gear/limiter behavior tuning for drift so the engine can stay in the useful range and carry power through slides.
- Added new driving tuning fields for suspension stiffness, damping, travel, ride/assetto, roll influence, reverse delay, and chassis lift.
- Added `chassisLift` tuning so the car body/collision can be raised relative to the wheels without moving the wheel contact points.
- Applied live suspension updates to existing RaycastVehicle wheels, including roll influence.
- Kept automatic reverse engagement protected by delay/stability checks while allowing responsive reverse once the car is actually stopped.

### Vehicle HUD

- Added a new bottom-right vehicle telemetry panel in `gameplay.html` and `engine_editor.html`.
- Added live `RPM`, `KM/H`, `GEAR`, and `DRIVE TYPE` fields.
- Added an RPM bar with green/yellow/red gradient feedback.
- Added different drive-type colors for Drift, Race, and Custom modes.
- Hid the old simple speedometer visually while keeping its DOM compatible with the existing HUD module.
- Updated the main loop to feed both the existing HUD module and the new vehicle telemetry HUD from the same engine/player state.

### Scene sidebar and outliner

- Restored modern grid/list/folder style icons in the Scene sidebar instead of letter-like placeholders.
- Made the Scene sidebar default to list view.
- Kept Scene view state independent from the lowbar Assets view state so toggling one no longer changes the other.
- Added better expandable tree behavior for linked/parented scene objects.
- Added Shift-drag linking from the Scene sidebar so an element can be linked under another directly from the list.
- Added autofocus from viewport selection to the Scene sidebar.
- Centered the selected row inside the Scene sidebar when possible instead of scrolling it only to the top or bottom.
- Made `player_car (Logic)` appear in the Scene sidebar so everything present in the scene is represented in the list.
- Exposed player-car child/sub-elements in the Scene sidebar where practical, including vehicle lights, collision, and attached effect-style children.
- Kept player-car outliner children selectable without touching the collision/physics files just to support UI listing.

### Text objects

- Added/improved 2D and 3D text object support from the editor add flow.
- Added multiline text editing with an inspector field better suited to paragraph input.
- Preserved line breaks so text wrapping/newlines behave much closer to what the user typed.
- Added crop/box sizing controls so long text is not permanently clipped by a fixed box.
- Added font styling controls for text objects, including font family/style-oriented settings, size, alignment/paragraph behavior, color/material-oriented styling, and related text layout options.
- Improved 3D text generation so 3D text is represented as actual text geometry rather than only a flat text plane.

### Lighting, warm-up, and runtime polish

- Improved light/render warm-up flow so the `Warm-up...` indicator appears before activating or deactivating expensive render/light states.
- Applied the same warm-up ordering to visibility/eye toggles for lights and scene objects where shader/render refreshes can be noticeable.
- Continued the automatic light/time-of-day behavior pass so lights are checked consistently when entering runtime/play preview and when editor/runtime state reloads.
- Added/kept runtime preflight behavior around player lights, auxiliary lights, neon, high beams, HUD, and shader compilation so first-use stutter is reduced.
- Added auto-aspect handling into gameplay/runtime when enabled from editor settings, allowing projects to carry aspect-ratio behavior from editor to game.

### Materials, editor UI, and asset/runtime stability

- Continued material editing work for scene elements, including better handling around transparent materials and safer material state updates.
- Kept inspector sections closed by default, while preserving the user's saved open/closed section preferences.
- Added precise/fallback handling for new player-car tuning fields so older projects load without empty controls or broken defaults.
- Kept playable export/runtime file lists aligned with newly added runtime modules and HUD/runtime dependencies.
- Preserved existing editor and runtime APIs while renaming visible concepts around `player_car (Logic)` / `Player Car Logic`.

### Notes

- This release closes the first major RaycastVehicle drift-tuning milestone.
- The current `Drift mode` is intentionally the default because it best represents the project direction: arcade drift first, physics support second.
- Race and Drift presets are now separate enough to keep tuning future changes without destroying the currently approved feel.
- The vehicle physics is much closer to the intended drift behavior, but final feel tuning can continue in smaller passes after this milestone.
