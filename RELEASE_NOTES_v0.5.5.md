# LOT KING ENGINE EDITOR v0.5.5 — WIP

## v0.5.5 — WIP

### Release Status

- Status: in progress.
- Tag target: `v0.5.5`.
- Scope: editor/runtime stabilization, collision and physics tooling, player car logic, asset workflow, mobile/runtime polish, and documentation refresh.

### Goals

- Continue improving the standalone Engine Editor workflow.
- Continue refining the gameplay runtime and playable ZIP export pipeline.
- Continue asset, credits, default content, and project documentation cleanup.

### Fixes

- Fixed player model replacement from editor drag/drop so imported or external rigged `.glb` files can be used as the player blueprint model instead of being rejected as a non-replaceable scene object.
- Fixed imported asset drag/drop over player rig parts by resolving the drop target back to the player blueprint root.
- Fixed imported asset drag/drop preview so asset-panel GLB drags are accepted as model replacements even when browser drag data is not fully readable during `dragover`.
- Added a small `Rigged` badge to imported GLB asset cards once they are used as the player model, and show the original `.glb` filename on the card.
- Added `Rigged`/`Base` badges to player blueprint asset cards so stale or model-backed blueprint assets are easier to distinguish.
- Removed synthetic `Player Vehicle` project assets generated from blueprint models so incomplete blueprint-derived pseudo-GLBs no longer appear as reusable project assets.
- Added an asset `Properties` overlay from the asset context menu with metadata, storage details, close button, and GLB 3D preview.
- Extended `Properties` to player blueprint assets and fixed blueprint apply so models saved through `modelDbKey` reload correctly.
- Fixed player blueprint model persistence so large replacement `.glb` files are stored through the asset blob pipeline instead of being embedded as huge data URLs that could break save/play.
- Fixed Assets panel refresh after undo/redo entity restore/remove operations so scene asset state stays in sync with history changes.
- Reworked the object inspector physics section: `Collision` now means solid/static, `Physics` builds on top of collision, and disabling collision makes an object pass-through.
- Added per-object physics mass for scene objects and GLB assets, with a much lighter low-end range so small props like cones can be pushed or launched by vehicle impacts.
- Expanded physics mass tuning from very light props (`0.001`) up to almost-wall objects (`1000+`) and made low masses transfer far more impact impulse.
- Added per-object `Impact force` tuning so lightweight props can fly away without always slowing the player vehicle too aggressively.
- Reworked `Impact force` so it scales the impulse transferred into physics objects while preserving the existing vehicle reaction feel.
- Added clearly visible editable numeric value fields beside editor sliders, allowing precise manual overrides for `Mass`, `Impact force`, and other slider-based settings.
- Added `SHIFT` fine-control mode for editor sliders and transform gizmo drags, using smaller movement/rotation/scale steps without visual flicker.
- Reduced inspector slider drag sensitivity globally, with slower pointer movement by default and even finer movement while holding `SHIFT`, while keeping numeric fields available for exact overrides.
- Fixed physics response for primitive and GLB box colliders so low-mass objects behave closer to cones instead of stopping the player like static walls.
- Added lightweight object-vs-object separation only between movable physics colliders so props with collision and physics no longer simply pass through each other without being pushed by static level geometry.
- Added `Select similar` to the scene object context menu and a multi-selection inspector that applies only the edited field across selected objects while preserving all other per-object values.
- Fixed multi-selection visibility by drawing selection boxes for every selected similar object, with the active object highlighted separately.
- Added reset actions to the multi-selection inspector for rotation, scale, and full transform resets.
- Guarded the editor page against the legacy gameplay `Choose Track` overlay leaking into the editor viewport.
- Prevented empty context-menu shells and blocked the legacy track selector from opening while the Engine Editor is active.
- Blocked menu music auto-start and runtime menu overlay activation while the Engine Editor is active.
- Added an initial hybrid vehicle surface-follow layer: the car keeps the existing drift handling while sampling ramp/road/curb-like drive surfaces for height, pitch, roll, and simple jump/drop behavior.
- Refactored lightweight impact handling so circle and box colliders share a common vehicle-impact solver, making future physics tuning more granular.
- Tuned vehicle impact reaction so lightweight physics props no longer slow the player like walls; vehicle slowdown now scales with object mass and impact force.
- Reduced cone-like vertical impact lift so lightweight props tumble more naturally instead of launching upward too aggressively.
- Scaled crash blur and heavy impact feedback by the contacted object's effective mass, so light props like cones no longer trigger wall-like visual impact blur.
- Replaced the runtime `F` model-flip shortcut with hold-to-flash high beams that boost front headlight intensity, distance, cone width, glow, and flare without center-screen popups.
- Improved mobile runtime behavior: automatic touch detection now handles more smartphone/tablet browsers, portrait gameplay forces a 9:16 camera frame, and touch controls get a compact portrait layout to avoid overlap.
- Fixed startup regressions from the mobile/touch pass by removing a stale phone-detection reference and guarding early pointer/editor initialization paths.
- Reduced first-use stutter when activating vehicle lights by keeping runtime light slots warm and switching them with intensity/opacity instead of changing light visibility.
- Extracted the vehicle-mounted lighting system into `js/runtime/player-light-rig.js`, keeping player headlights, rear lights, aux lights, neon, and high beams separate from world lighting and scene light entities.
- Included the new player light rig runtime file in playable ZIP exports so standalone builds keep vehicle lighting behavior without bundling editor code.
- Expanded the loading warmup pass into a repeatable render-pipeline preflight that exercises camera rendering, HUD, brake/reverse lights, aux lights, neon, high beams, and shader compilation before gameplay/editor preview becomes visible.
- Added a lightweight top-left `Warm-up...` indicator inside the editor viewport before Play Preview starts and when lights or shadows are added/toggled, so unavoidable shader/render refreshes have visible feedback without changing the editor flow.
- Added an editor-only pick handle around scene light entities, making spot/point/directional lights selectable directly in the viewport even when placed inside or near other objects.
- Added visible editor collider overlays for scene objects, with per-object collider offset and size/radius controls so collision dummies can be aligned independently from the rendered mesh.
- Upgraded collider previews from flat ground footprints to editable 3D volumes with Y offset, height, and yaw controls; box colliders now keep object yaw and use oriented footprint collision at runtime.
- Added `Select > Collider` in the object context menu, attaching the transform gizmo to a collider proxy so collider volumes can be moved, rotated, and scaled directly instead of only through sliders.
- Fixed collider preview/proxy rotation so collider volumes preserve and display full X/Y/Z rotation instead of resetting to yaw-only; runtime vehicle footprint uses Y rotation while Cannon statics receive the full collider orientation.
- Fixed collider gizmo selection so choosing `Select > Collider` immediately enters transform mode instead of leaving the collider proxy locked in select mode.
- Reworked collider bounds sync to derive collider size from the object's local visual bounds instead of the already-rotated world AABB, reducing oversized/misaligned collider dummies on rotated props and vehicle GLBs.
- Fixed primitive collider dimensions after rotation/scale edits by applying object world scale to local collider bounds, keeping X/Y/Z dummy size aligned with the actual physics surface.
- Added per-object collider mode selection: `Simple` keeps the current single oriented box, while `Complex` builds a lightweight compound collider from multiple mesh-local boxes for imported GLB/mesh assets.
- Added editor/runtime support for compound collider parts, including viewport dummy rendering, Cannon static rebuilds, vehicle collision checks, cleanup on entity removal, and persistence through the existing `colliderShape` data.
- Synced circular/cylindrical collider dummy rotation for lightweight GLB physics props such as cones, so fallen/tumbled objects no longer show an upright collider while the mesh is lying down.
- Renamed the visible player vehicle editing concept from `Player Blueprint` to `player_car (Logic)` / `Player Car Logic` across the editor UI and README, while keeping internal storage/API names compatible with existing projects.
- Added a dedicated `player_car (Logic)` collision setup with editable half-size, vertical offsets, arcade impact radius, visible viewport dummy, runtime Cannon body rebuilds, and persistence through saved/applied car logic assets.
- Made `player_car` collider selection truly attach the transform gizmo to the collider dummy: moving edits collider offsets, scaling edits half-size, and rotating edits the collider orientation without moving the vehicle object.
- Updated Cannon static collider rebuilds to respect edited collider height and yaw, while removing duplicated invisible Cannon lot walls in favor of visible scene wall/collision objects.
- Added a dedicated `Collision Box` add-menu item for creating standalone collision volumes like regular primitives.
- Fixed undo/redo restore for standalone collision volumes so collider refs, physics rebuild, outliner, and selection helpers stay in sync after removing/restoring them.
- Added undo/redo history for collider shape sliders and numeric overrides, so collider offset/size edits can be reverted with Ctrl+Z/Y like transforms.
- Removed the old hardcoded invisible lot boundary from vehicle collision; map limits now come from visible/editable wall or collision objects in the scene.
- Added editor grid size controls and an infinite-feel grid mode for very large layout work.
- Improved drive-surface ramps with a basic airborne launch off ramp lips instead of always magnet-following the surface, making jumps read less like a soft climb/descent.
- Improved low-speed vehicle behavior by damping idle creep and adding parking-speed steering authority without changing the high-speed drift steering feel.
- Added a low-speed handbrake stop clamp so the vehicle fully settles to zero instead of continuing to micro-slide when almost stopped.
- Added standing burnout behavior: holding throttle and brake from a near stop now spins the driven wheels without immediately entering reverse, and the tire slip briefly carries on when one pedal is released.
- Restored scene object transforms when stopping Play Preview, while preserving live-edited non-transform parameters.
- Added `Drive surface` object flag and made drive surfaces raycastable without acting as static player-blocking walls, allowing ramps/planes to be climbed instead of hit.
- Added realistic drive-surface slope and step-up limits so the player car no longer sticks to near-wall surfaces or snaps onto steep ledges, and physics props on inclined drive surfaces now receive downhill gravity so spheres/loose objects can roll with the slope.
- Fixed steep `Drive surface` colliders being treated like pass-through ramps: gentle surfaces stay driveable, but surfaces over the slope limit become real static blockers again so the player car cannot climb or phase through near-wall inclines.
- Added light grade resistance on driveable slopes so the player car loses some power uphill and gets a small downhill pull without changing the core drift handling.
- Stabilized vehicle drive-surface sampling by using the player car center point as support when wheel probes temporarily miss an inclined surface, reducing direction-dependent sinking/clipping on custom rotated ramps.
- Improved drive-surface edge precision by averaging real surface hits before falling back to ground height, and added a dedicated steep-only blocker pass so near-vertical drive surfaces cannot be climbed or phased through while normal driveable ramps stay smooth.
- Switched player-car drive-surface support to prefer collider-derived surface sampling before visual mesh raycasts, making custom rotated ramps behave consistently when approached from opposite directions.
- Tightened the default driveable slope limit from `42°` to `36°` so very steep custom surfaces behave as blockers instead of climbable ramps.
- Added a player blueprint tuning parameter for automatic reverse engagement delay (`0..2s`, default `0.5s`) instead of keeping it hardcoded.
- Prevented Play Preview saves from persisting runtime position/rotation/scale changes, while still allowing live parameter edits to be saved from the editor.
- Fixed `Physics` objects becoming pass-through during gameplay when the Cannon physics path was active by processing dynamic object collisions after the Cannon player step.
- Synced GLB colliders after runtime model replacement so parked-car GLBs and cone GLBs keep collision aligned with their final rendered model.
- Restored cone impact scoring through collider metadata (`hitScore`/`hitLabel`) instead of hardcoded cone-only gameplay logic, making the system ready for score-on-hit behavior on any object type.
- Set default cones to lightweight physics objects with collision enabled, physics enabled, and a low default mass for stronger impact response.

### Notes

- This file tracks work after `v0.5.4`.
- The inclined `Drive surface` and custom ramp physics are improved but still not final. Very steep surfaces, edge precision, and direction-dependent vehicle support remain an active refinement area for the next pass.
- The current vehicle handling feel remains the priority: environment physics improvements should not flatten the drift/arcade driving style that already feels good.
