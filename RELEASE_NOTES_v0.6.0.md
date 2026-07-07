# LOT KING ENGINE EDITOR v0.6.0 - Work in progress

## v0.6.0 - Editor localization, drift tuning, decals/materials + camera groundwork

### Release Status

- Status: draft / in progress.
- Tag target: `v0.6.0`.
- Scope: editor-wide EN/IT cleanup, project language defaults, preview/runtime state restoration, drift vehicle tuning, horsepower controls, Free Texture / Decal replacement workflows, GIF animation, PBR-style decal material controls, GLB/player material editing, scene cameras, quad viewport groundwork, and an early Cinema Studio sequencer foundation.

### Added

- Added language selection directly to the initial Projects overlay shown when opening the editor.
- Set English as the default editor language for new/default preference state.
- Added a broader editor/runtime EN/IT pass across inspector sections, asset actions, overlays, outliner/status messages, playable export flows, sound designer, player setup, HUD/radio UI, and nested editor tabs.
- Added `Horsepower` as a vehicle tuning control, with range from `15 hp` to `1500 hp`.
- Horsepower now scales vehicle acceleration, rev behavior, wheelspin, drift drive and shift torque in proportion to the selected engine power.
- Added smarter drift-aware automatic shifting that can hold revs longer during slides and downshift during controlled drift deceleration to preserve angle and drive.
- Added texture/decal replacement helpers so image assets can replace an existing Free Texture / Decal directly.
- Added viewport drop choices for external image files, matching the existing asset drag behavior: place the dropped item at the pointer or replace the hovered scene object.
- Added support for replacing texture/decal content from both external browser file drops and imported Assets.
- Added `Use from Assets` to the Free Texture / Decal inspector for selecting an already imported texture asset.
- Added drag/drop from the Assets browser directly onto the texture/decal load field in the inspector.
- Added saved preview thumbnails for existing texture/decal blobs in the inspector, including textures stored through IndexedDB `dbKey` instead of inline `src`.
- Added robust animated GIF support for Free Texture / Decal scene objects by decoding GIF frames internally and updating a `CanvasTexture` on the editor/game frame loop.
- Added material controls for Free Texture / Decal objects:
  - `Lighting`: `Unlit / flat` or `Lit / PBR`.
  - `Base color`.
  - `Roughness`.
  - `Metallic`.
  - `Specular`.
  - `Emission color`.
  - `Emission`.
- Added default PBR material fields to newly created/imported texture decal entries while keeping `Unlit / flat` as the default look for compatibility.
- Added slot-based material editing for imported GLB scene objects and `player_car Logic`.
- GLB material editing now supports `All materials` or individual mesh/material slots, so multi-material models can be tuned per channel instead of only as one global material.
- Added GLB/player material texture channels for base color, normal, roughness, metallic, alpha and emission maps.
- Material texture channels can now use either newly dropped image files or already imported texture assets from the Assets library.
- Added UV transform controls for GLB/player materials: repeat, offset and rotation.
- Added transparent material controls for GLB/player materials, including alpha mode, opacity, alpha cut, side, depth write and a dedicated `Glass fix` preset.
- Player car material overrides are now saved into the player blueprint data and reapplied after the GLB model reloads.
- Added an inspector material preview for GLB/player materials showing the selected target, color/map swatch, roughness, metalness and opacity.
- Added `Live Mat Selection` for GLB/player materials, allowing the material target to be picked directly from the viewport when material names are unclear.
- Added independent Scene Camera elements with a visible/selectable 3D camera helper.
- Added a collapsible viewport toolbar above the preview area.
- Added single/quad viewport modes with selectable secondary views (`Perspective`, `Top`, `Bottom`, `Front`, `Back`, `Left`, `Right`, Scene Cameras, and Cinema Timeline output).
- Added independent secondary Perspective views, so multiple perspective viewports can be positioned and navigated separately.
- Added per-viewport active selection/control so the chosen view receives navigation and render-mode changes.
- Added quad viewport split handles for resizing left/right, top/bottom, or all four views together.
- Added per-view render modes: `Lit`, `Wireframe`, `Clay`, `Mesh only`, `Lights only`, `Unlit`, and `Reflections`.
- Added optional viewport FPS/performance overlays showing frame time, draw calls, triangles, geometry/texture counts and heap info where the browser exposes it.
- Added a minimizable Player Camera preview panel.
- Added an early `Cinema Studio` scene element with dockable/lockable sequencer UI, shot clips, camera cuts, timeline output view, playback, loop/one-shot data support, animated target tracks, transform keyframes, key deletion and basic curve modes.
- Added unified sequencer targets so Scene Cameras and scene objects use the same `Add target` / `Key selected` workflow.

### Improved

- Runtime Play Preview now restores environment/weather state when stopping preview, matching the existing transform reset behavior for scene objects.
- Time of day and weather/environment parameters no longer persist runtime-only preview changes unless edited intentionally from the editor.
- Drift mode defaults were softened: oversteer now starts close to minimum and steering sensitivity starts near the middle for better controllability.
- Drift power delivery was strengthened so the vehicle keeps useful drive through lower revs, torque peak transitions and gear changes.
- Drift shifting now delays upshifts while sliding and makes downshift decisions using drift angle, speed and throttle instead of simple sequential gear changes.
- Project asset placement messages and several asset import/replacement paths now respect the selected editor language.
- Texture/decal inspector now keeps the same material/texture controls available after selecting an existing decal already placed in the scene.
- GIF animation no longer depends on browser/Three.js static GIF texture refresh behavior.
- Texture/decal GIFs now use real GIF frame delays and continue animating in the editor viewport, Play Preview and runtime.
- Lit texture/decal materials now use `MeshPhysicalMaterial` when available, falling back to `MeshStandardMaterial`.
- Unlit texture/decal materials continue to use the previous flat material path for the same visual result as older projects.
- GLB material overrides now support per-slot persistence while keeping older flat/global material overrides compatible.
- Glass-like GLB materials can now be made visibly transparent by combining blend alpha, reduced opacity, disabled depth write and optional physical-material parameters.
- GLB/player material previews now refresh while editing color, roughness, metallic, opacity and related material controls.
- Live material picking highlights only the picked material region with a temporary border overlay, leaving the real material shading unchanged.
- Scene Camera viewport navigation now moves/rotates the actual camera object instead of only changing a temporary preview transform.
- Timeline evaluation no longer locks the currently selected camera/object while the sequencer is paused, so new keyframes can be authored by moving the target and pressing `Key selected`.
- Cinema Studio code has been split out of `editor-runtime.js` into `js/editor/cinema-studio.js` so the sequencer can be expanded later without growing the main editor frame loop.
- Quad viewport layout/render-mode/stat code has been split out of `editor-runtime.js` into `js/editor/viewport-layout.js`, keeping the runtime focused on editor lifecycle, preview state and frame orchestration.

### Fixed

- Fixed `selectRow is not a function` when opening the inspector for Free Texture / Decal objects.
- Fixed Free Texture / Decal previews not showing already assigned PNG/texture blobs when the scene object only had a `dbKey`.
- Fixed external image drops into the viewport bypassing the place/replace confirmation flow.
- Fixed imported texture assets being placeable but not directly usable as replacement content for existing decal/free texture scene objects.
- Fixed animated GIF decals appearing animated in the inspector preview but static in the editor/game viewport.
- Fixed GIF decals created before the latest changes being missed when animation state had to be inferred from asset filename/source instead of only the `animated` flag.
- Fixed texture replacement races where an older async texture load could overwrite a newer texture selection.
- Fixed climate/environment runtime state being saved after Play Preview when it should return to the pre-preview editor state.
- Fixed GLB/player material editing being limited to the first material and applying changes too broadly across complex imported models.
- Fixed player-car material edits not being part of the saved player blueprint reload path.
- Fixed `Edit Material` not appearing in the dedicated `player_car Logic` inspector.
- Fixed player-car material editing targeting the logic dummy instead of the actual loaded GLB model.
- Fixed legacy/global player material overrides turning the loaded player GLB gray by applying them as real model-wide material edits.
- Fixed common GLB/player material sliders forcing material conversion and dropping original material metadata/maps.
- Fixed skid/brake source dummies rendering as visible solid surfaces by replacing them with line-only editor helpers.
- Fixed skid/brake source dummies staying visible during Play Preview; they are now editor-authoring helpers only.
- Fixed quad viewport perspective stretching when viewport panels are resized by updating camera aspect per rendered viewport.
- Fixed scene camera gizmo/proxy desync after moving a camera from its own viewport, which could snap the camera back when touching the transform axes.
- Fixed Cinema Studio timeline close/reopen behavior when selecting the Cinema Studio element again.
- Fixed timeline target/key deletion controls so selected shots, animated targets and transform keys can be removed from the sequencer without deleting the original scene object.
- Fixed timeline viewport dropdown contrast so camera/view choices remain readable.
- Fixed standalone editor script loading after the Cinema Studio / viewport refactor so toolbar controls, quad views and Play Preview return-to-editor rendering remain available outside the lazy loader path.

### Notes / to verify

- Free Texture / Decal still uses an editable transparent plane. `Lit / PBR` reacts to lights based on the plane normal; it is not yet true projected decal shading on arbitrary underlying mesh normals.
- Existing projects keep their current unlit decal look until `Lighting` is changed to `Lit / PBR`.
- GIF decoder support targets normal GIF89a/GIF87a animation, transparency, interlacing and common disposal modes. Very unusual GIF encodings should still be tested with real assets.
- Scene Cameras, quad viewports and Cinema Studio are integrated as a first usable foundation, but Cinema Studio is intentionally still unfinished. Remaining work includes richer timeline editing, draggable shot trim/duration, multi-property tracks, advanced curve editing, trigger/event tracks, runtime event playback and final UX polish.
- `Cinema Studio` currently covers basic shot/cut playback and transform keyframing; it should be treated as an editor preview feature until the runtime trigger/save-game model is finalized.
- Hard refresh the editor after updating local files so browser cache does not keep an older `scene-store.js` or inspector module loaded.
- Automated JS runtime tests were not available in this local environment because no `node`, `nodejs`, `bun` or `deno` binary was present.
