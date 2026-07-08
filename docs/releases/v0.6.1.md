# Published: 2026-07-08 02:30:14 +0200 (tag v0.6.1)

## v0.6.1 - Collision authoring, multi-selection, gamepad UX and power curves

### Release Status

- Status: released.
- Tag target: `v0.6.1`.
- Scope: collision authoring, complex static collision fidelity, collision-helper visibility controls, asset-browser preview workflow, precision viewport transforms, multi-selection editing, richer gamepad play controls, and advanced vehicle power-curve tuning.

### Added

- Added viewport-toolbar visibility options for collision helpers. The new `Collision dummies` checkbox is off by default for performance and can show all collision dummy previews when needed, while keeping the actual collision data active either way.
- Added per-object collision dummy visibility overrides in the Collision inspector:
  - `Auto` follows the global viewport setting.
  - `Always show` keeps that object's dummy visible even when global dummies are hidden.
  - `Always hide` hides that object's dummy even when global dummies are enabled.
- Added saved project/level support for per-object dummy visibility overrides, so important collider-debug visibility choices survive reloads and exports even while global dummy previews stay hidden by default.
- Added an Environment checkbox for `Surface world collision`, the invisible fallback physics plane at world Y=0. Disable it for underground tracks, floating levels, or custom maps where imported road meshes provide their own collision.
- Added visual previews directly in the Assets list where possible. Texture/image/GIF assets can show their real bitmap preview, scene assets keep the generated object thumbnail flow, and imported/project GLB assets can lazily render a small 3D thumbnail; unsupported entries still fall back to the existing placeholder icon.
- Added double-click asset inspection from the Assets list. Double-click now opens the asset preview/properties window for imported GLB, textures/images/GIFs, project assets, scene assets, levels, sound sets, and player blueprints instead of immediately placing/loading/applying the asset.
- Added advanced viewport transform modifiers while dragging gizmo axes:
  - Hold `Shift` for ultra-fine 0.001x movement, rotation, and scale adjustments without freezing the transform.
  - Hold `Ctrl` for temporary snap while moving, rotating, or scaling; rotation snaps in 5 degree steps.
  - Gizmo drags now use a Blender-style virtual cursor inside the preview frame, so long transforms can continue past the physical screen edge.
- Added true multi-selection workflows across the editor:
  - Scene outliner rows support `Ctrl`/`Cmd` click to toggle individual objects and `Shift` click to select ranges.
  - Asset cards support `Ctrl`/`Cmd` click toggles and `Shift` range selection.
  - Viewport picking supports `Ctrl`/`Cmd` click toggles and `Shift` click add-to-selection for 3D objects.
- Added group transforms for multi-selected scene objects. Move, rotate, and scale now operate from a temporary group pivot while preserving each object's own transform, parent space, collider sync, and undo/redo state.
- Added multi-object drag/drop support:
  - Drag selected scene rows into scene folders as a batch.
  - `Shift`-drag selected scene rows onto another object to parent/link them together, preserving the existing single-object Shift-link behavior.
  - Drag selected asset cards into asset folders as a batch.
- Added batch context actions for selected groups, including focus selection, group transform tools, hide/show selected, unlink selected, delete selected, add selected assets to the current level, and clear selected assets from folders.
- Added expanded Xbox-style gamepad defaults for play mode:
  - `Start/Menu` opens and closes pause.
  - `X` holds/flash high beams.
  - `View` toggles the radio.
  - `Y` toggles radio play/pause.
  - D-pad right/down move to next/previous radio track, keeping `RB`/`LB` free for pause-tab navigation.
  - `R3` changes camera mode, `B` looks back, `L3` resets the car.
  - D-pad up opens driving setup and `LB` toggles mute during play.
- Added more remappable gamepad actions in the Controls mapper, including pause, headlights, radio controls, camera mode, look back, tuning, mute, legend, and right-stick camera look axes.
- Added a more accurate gamepad visual layout in the Controls mapper, with both sticks, shoulders/triggers, menu/view buttons, face buttons, D-pad, and stick-click buttons.
- Added `Edit layout` for the gamepad visual mapper. The visual buttons/sticks can be dragged into a custom arrangement and reset from the mapper.
- Added gamepad navigation for the pause/settings overlay: `LB`/`RB` switch tabs, D-pad/left stick moves focus, `A` activates, and `B`/`Start` closes.
- Added console-style gamepad editing inside pause/settings controls. When a slider, checkbox, or dropdown is focused, D-pad/stick left-right now changes its value directly instead of driving the car or only moving focus.
- Added explicit render priority controls for transparent material authoring. Materials now expose `Render priority` in the material inspector, and editor FX emitters expose the same control in the Effect inspector.
- Added a vehicle `Power curves` overlay for driving setup. Designers can now tune engine torque, drift torque hold, gear pull, and wheelspin response as RPM/gear curves instead of relying only on flat sliders.
- Added per-parameter `Expose in wrench` controls in the player vehicle setup inspector. Every editor-side driving parameter can stay author-only or be selectively exposed to the in-game wrench panel for players/testers.
- Added runtime wrench support for advanced driving parameters such as suspension stiffness, damping, travel, wheel stance, chassis roll, chassis lift, and reverse delay when those parameters are exposed from the editor.
- Added vehicle tuning export as JSON. The editor can export/copy the current tuning preset, including power curves and exposed wrench settings, and designers can optionally expose the export button in the in-game wrench panel.

### Improved

- Complex static collision now uses mesh-based Cannon `Trimesh` surfaces for imported GLB models and curved primitives. Hard-surface models, spheres, cylinders, torus-like shapes, and sculpted static meshes can now collide against their actual visible geometry instead of only their box/cylinder proxy.
- Complex collision previews now draw mesh-following wireframes in the editor when possible, so the visible helper better matches the collider used by the runtime.
- GLB complex collision keeps track of child mesh identity, allowing complex child dummies to map back to the correct mesh part instead of treating the full object as one undifferentiated box group.
- Static collider rebuilds now distinguish mesh-based complex collision from simple box collision, preventing stale physics statics when switching collider modes.
- Static `Complex` mesh collision is now also treated as a candidate drive/surface sample, so custom road meshes can be used for vehicle surface height/normal logic without needing to be named like `road`, `ground`, or `surface`.
- Cannon `Trimesh` collision is generated double-sided to be more tolerant of imported mesh winding and normals.
- Collision inspector copy now reflects the new behavior: `Simple` remains a solid proxy, while `Complex` is intended for mesh-based static collision.
- Asset cards now reuse available blob/object sources for previews, so imported textures stored in IndexedDB and project-level GLB/texture references are easier to recognize before placing them in the scene.
- Asset placement/loading actions remain available through the explicit card buttons and context menu, while double-click is now reserved for previewing details.
- Viewport transform drags now stay controllable during very small alignment work and very long axis pulls, with the status help updated to expose the new `Shift drag` and `Ctrl drag` modifiers.
- Imported GLB assets that look like vehicles now receive the same basic forward-axis normalization used by the player model loader when the source model is authored sideways, keeping regular vehicle transforms closer to player/primitives/cones.
- Z-up viewport transforms now use the same proxy path for move, rotate, and scale. This keeps regular imported vehicle GLBs aligned to the editor axes even when the visible model has an internal orientation correction.
- Scene focus now frames the full multi-selection bounds instead of only the first selected object.
- Free camera in play now hides the cursor and can use pointer lock for continuous mouse look inside the game/editor preview frame.
- The right analog stick now controls free camera look in play/editor preview, then smoothly returns to the normal dynamic view shortly after release.
- Runtime smoke, exhaust smoke, fire bursts, wind streaks, and editor FX emitters now use explicit transparent render priorities so particles render after normal transparent/glass materials instead of disappearing behind them unpredictably.
- Default drift physics now keeps usable torque while the car is sideways. The engine holds a softer high-rpm drift band instead of repeatedly cutting power on the limiter, and throttle keeps more forward drive during sustained slides.
- Standing burnouts now behave more like an RWD line-lock: brake + throttle holds the front axle, lets the rear tires spin, and releasing the brake keeps enough rear push to roll into a donut or drift instead of staying parked.
- Vehicle power delivery now samples editable RPM curves during acceleration, sustained drift, gear pull, and wheelspin allowance, giving drift builds more controllable power bands without hard-coding one default feel.

### Fixed

- Fixed `Complex` collider mode still behaving like a simple box/cylinder for many static imported models and curved primitives.
- Fixed the always-on invisible world ground collision blocking vehicles and level design below world Y=0; it can now be disabled per level from Environment.
- Fixed collision-helper cleanup for compound and mesh-wireframe helpers so editor preview geometry/materials are disposed consistently when helpers are rebuilt.
- Fixed texture project assets with blob storage being treated as model previews just because they had a stored `dbKey`.
- Fixed collision, physics mass/impact, and `Drive surface` changes on original/built-in mesh objects such as `Ground` not being saved and restored after page reload.
- Fixed `Shift` precision drag feeling locked: fine mode now slows the gizmo input itself instead of snapping the transformed object almost back to the drag start.
- Fixed single-object-only selection assumptions in Delete, context menus, folder drag/drop, and gizmo history so batch edits behave consistently.
- Fixed regular imported vehicle GLBs rotating or scaling along swapped/opposite axes after forward-axis normalization; rotate and scale now follow the same corrected Z-up transform basis as position.
- Fixed pause/menu workflows being keyboard-first: gamepad users can now open pause and move through settings without reaching for the keyboard.
- Fixed gamepad drive inputs leaking through pause. While the pause/settings overlay is open, throttle, brake, steering, reset, camera actions, and headlights are neutralized for the player car and the gamepad is reserved for menu navigation.
- Fixed transparent materials such as glass rendering over smoke/fog-like particles. Smoke and related FX now sit in a higher transparent render layer while keeping depth testing enabled against opaque scene geometry.
- Fixed burnout wheel visuals in the Cannon vehicle path. Wheel meshes now use the physical wheel rotation when available, so front wheels can stay held while rear wheels spin under power.

### Notes

- Mesh-based `Complex` collision is intended for static collision. Objects with `Physics` enabled still use lightweight/simple collision shapes for stability and performance.
- If a complex mesh is too large or `CANNON.Trimesh` is unavailable, the runtime falls back to the existing simple collider path.
