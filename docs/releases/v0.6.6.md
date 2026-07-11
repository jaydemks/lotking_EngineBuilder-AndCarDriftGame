# Release Notes: v0.6.6

## v0.6.6 - Unified rendering, Logic Element and live mesh authoring

### Release Status

- Status: released; implementation complete for the v0.6.6 editor, rendering and Logic Element upgrade. Broader visual/device acceptance continues after release.
- Tag target: `v0.6.6`.
- Scope: shared editor/game rendering configuration, scalable quality profiles, visible ray-lighting improvements, video-setting authoring, Logic Element polish and GLB sub-mesh authoring.

### Headline

`v0.6.6` gives level authors one project-owned rendering configuration shared by the editor, Play Preview and gameplay, five quality presets, configurable player-facing video options, a more practical Logic Element authoring surface and persistent live editing of imported GLB sub-meshes.

### Added

- Added the pinned `Rendering / Video` editor inspector, available without entering Play Preview.
- Added separate inspector tabs for project rendering defaults and settings exposed in the player Video menu.
- Added `Low`, `Medium`, `High`, `Super High` and `Extreme` quality profiles; Low and Medium reduce internal resolution, shadow resolution and ray-lighting samples for mobile-class hardware.
- Added a dedicated video profile post pass so quality presets are visibly reflected in Play Preview and gameplay through contrast, saturation, clarity and vignette tuning.
- Added authorable defaults and exposure controls for pipeline, quality, antialiasing, dynamic shadows, material reflections and volumetric lighting.
- Added project persistence for rendering defaults and exposed settings in LKEP scene data and playable exports.
- Added a transparent loading overlay with simple contextual status text for expensive video changes.
- Added normalization and migration coverage for the previous `Performance`, `Balanced` and `High` quality values.
- Added `Remove` actions and right-click removal for Radio HUD project tracks in both game radio and menu music libraries.
- Added browser coverage for Radio HUD music removal controls in both Game Radio Library and Menu Music Library.
- Added resizable Logic Element sidebar sections so Hierarchy, Functions, Nodes and Variables remain usable in smaller overlays.
- Added explicit Logic Element primitive meshes (`Cube`, `Sphere`, `Cylinder`, `Cone`, `Plane`, `Torus`) for root and child elements.
- Added Logic Element text scene elements with 3D plane and 2D billboard modes for quick labels, debug text and blueprint-style helpers.
- Added `Start / Stop Live Mesh Editing` for imported GLB scene objects and the active `player_car` model, reusing viewport picking with single and Ctrl/Shift multi-selection.
- Added a GLB mesh hierarchy list with persistent selection highlighting, local position/rotation/scale editing and internal part deletion/restoration.
- Added persistent node separation plus decomposition of a single non-skinned mesh by material groups or disconnected geometry islands, allowing combined left/right parts to become independently editable when their geometry is not connected.
- Added undo/redo for GLB mesh edits and LKEP persistence through versioned `meshEdits` overrides; generated editor parts are reconstructed from the source GLB on reload rather than embedding duplicate geometry.
- Added Ctrl/Shift multi-selection to Live Material Selection; material edits now apply to every selected slot together.
- Added persistent Live Mesh properties for selected GLB parts: object name, visibility, cast/receive shadow, frustum culling and render order, with multi-edit and undo/redo.
- Added a Pawn `Controller Player ID` selector for Player 1–4. The active player car now consumes the selected input profile and automatically provisions numbered local gamepad slots instead of always reading Player 1.
- Added independent Player Car Pawn state controls for Enabled, Hidden and `Controller Player ID = None`; all three persist in projects/player blueprints and allow menu or non-gameplay levels to retain the built-in player without rendering or possessing it.
- Added `Duplicate as Logic Element` to the Player Car context menu. It creates a reusable linked `Player Car Logic Element` asset containing the imported GLB/placeholder root, named rig hierarchy, collision component, categorized exposed Pawn/Input/Driving/Camera/Light/Effect variables and the complete source Pawn snapshot for the future multi-Pawn runtime adapter.
- Added `Template - Player Car Logic Element` to the built-in Logic template library beside Rotating Cube and the other starters. It provides an immediately placeable editable vehicle hierarchy with model placeholder, four wheels, Player Camera anchor, headlights, exhaust anchors, collision/Pawn components and categorized exposed controls; the context conversion remains the exact-current-car path.
- Player Car template placement now routes through the same project-aware Pawn factory as context conversion: it displays the standard heavy-asset loading overlay, clones the current GLB at the same 5.6 m normalization as the built-in Player Car, reapplies mesh/material overrides and retains the organized Logic hierarchy. Without a GLB it uses the vehicle hierarchy fallback rather than an unrelated single cube.
- Player Car Logic instances now inherit the authored/saved Player Car root scale from `player.transform.s`, write it immediately into the Logic Element scene entry and remain freely scalable before project/playable export.
- The Player Car Logic starter graph now includes a readable `On Update → W input → Branch → speed × deltaTime → Translate Owner` example, so the template demonstrates an actual node-built movement path instead of being visual metadata only.
- Player-derived Logic Elements now show an EN/IT `Player Pawn Migration` Inspector section distinguishing preserved authoring data from pending runtime/tab parity, including the unlimited-light hierarchy versus not-yet-bound Reverse/Brake/Turn vehicle conditions.
- `ControllerPlayerId` on Player Car Logic Elements is now an explicit `None / Player 1 / Player 2 / Player 3 / Player 4` selector rather than a raw number. The new `Get Player Drive Input` Logic node resolves the selected local input profile and returns throttle, brake, steer, handbrake and assigned device; `None` returns a neutral command.
- The Player Car starter movement example now consumes `ControllerPlayerId → Get Player Drive Input → throttle × speed × deltaTime`, allowing P1–P4/device routing to be tested instead of always reading the keyboard W key directly.
- Added an exclusive `Active level camera` flag to Scene Cameras. When the built-in Pawn is disabled, hidden or unpossessed, that camera owns the Player 1 frame in gameplay and the bounded Play Preview frame without enabling camera controls.
- Added Logic Element `Play Cinema Timeline` and `Stop Cinema Timeline` nodes. A timeline can be addressed by Cinema Studio id, name or runtime event name, starts immediately, suppresses player control and follows its ordered multi-camera Movie Track fullscreen in gameplay or inside the editor preview bounds.
- Added the hosted project launcher, subsequently unified into automatic hosted/local detection with direct Author DEMO or Clean Project choices and a GitHub fallback.

### Improved

- Play Preview and normal gameplay now consume the same `GAME.settings.video` state instead of behaving as separate video configurations.
- Replaced the former no-op raytracing selector with a more visible browser-compatible ray-lighting post pass, stronger environment response and an explicit standard WebGL compatibility path.
- Improved Ray lighting reflections on GLB/player materials by applying a reversible PBR boost to roughness, metalness and environment response when material reflections are enabled.
- Fixed video color state drifting after settings changes by making video own the base tone-mapping exposure while camera grade only overrides it when explicitly enabled.
- Quality profiles now scale renderer pixel ratio, shadow-map size and ray-lighting sample count through one centralized runtime module.
- Runtime Video rows are hidden or shown from the project authoring configuration while hidden options retain the project defaults.
- Rendering state is normalized through one versioned schema to keep future presets and migrations contained.
- Volumetric lighting now samples smoke-like density and applies transmittance-style attenuation, making light shafts read better through tire and exhaust smoke while preserving the transparent FX render order.
- Removing imported music tracks now uses the shared editor confirmation overlay, updates the live audio library and keeps removed project tracks out of future project serialization.
- Logic Element root objects can now be authored as empty, primitive mesh, GLB-backed mesh or text without the hierarchy falling back to the old `Default Mesh` label.
- Logic Element viewport and runtime scene rendering now share the same primitive/text fallback path, reducing editor/game mismatch.
- Logic Element mesh selection now uses one `Mesh Type` selector for standard primitives and GLB assets, so root and child elements update predictably.
- Logic Element parent selection now prevents self/descendant parent cycles and normalizes older broken hierarchies back to `Root` to avoid duplicated or untouchable internal nodes.
- Logic Element viewport replacement now detaches the previous object from its actual scene parent before disposal, preventing non-selectable ghost meshes after changing `Type` or `Mesh Type`.
- Logic Element viewport shortcuts now stay inside the active overlay, and its camera supports editor-style RMB look with `WASD`/`Q`/`E`, Shift acceleration, wheel speed adjustment, orbit, middle-button pan and wheel zoom.
- Undo/redo now covers Logic Element graph and viewport edits, object and player collider parameters, and general scene-object Inspector parameters through centralized snapshots that also rebuild their live representation.
- Play Preview saving continues to freeze gameplay-driven transforms and automatic weather progression, while environment values deliberately changed through the Inspector are retained.
- Cinema Studio scene elements now use a non-exportable 3D clapperboard helper instead of the former plain box dummy.
- Live Material Selection and Live Mesh Editing are mutually exclusive, keeping material-slot editing separate from structural GLB editing while sharing the same viewport interaction model.
- Player-car `Edit Material` and `Edit Mesh / GLB Parts` sections now stay at the top of its Inspector before transform, collider, setup and Focus actions; player mesh overrides persist in its blueprint through `player.meshEdits`.
- Live Mesh Editing now shows a geometry-edge hover highlight before selection, matching the immediate targeting feedback of Live Material Selection while retaining cyan multi-selection helpers.
- Viewport hover picking and live material/mesh outlines are suspended during RMB fly, camera rotation and gizmo drags; mesh hover geometry is cached while the pointer remains on the same part, removing camera stutter from repeated raycast-helper rebuilds.
- Added persistent `Join selected` and `Unjoin selected` operations for GLB mesh parts. Joined geometry remains one structural mesh while retaining distinct material groups/slots, and material overrides now use stable mesh-edit ids so Live Material targets survive split/join and reload.
- Split/join now creates independent material and texture-transform instances per resulting part, allowing glass, lamp and body groups that originally shared one default material/UV channel to receive different transparency, color, PBR and UV settings.
- Blender/glTF embedded lights remain converted into normal editor light entities, so their intensity, color, range, spot cone/penumbra and shadow properties use the existing light Inspector rather than a reduced Live Mesh control set.
- Wheel zoom and left/middle viewport navigation now enter the same hover-suspension path as RMB fly, preventing entity, Live Material and Live Mesh highlight work from interrupting smooth camera movement.
- The minimized Player Camera now uses its visible 170×26 bounds for clamping, so it can be dragged into every viewport corner.
- Hosted authoring uses only visitor-owned localStorage/IndexedDB and local browser files; it never writes projects or imports to the hosting FTP/server. LKEP and playable exports remain downloads with their supported project/runtime content embedded.
- Logic Element validation totals are now clickable and keyboard-accessible, open the graph diagnostics Inspector, show every warning/error message and select the referenced node when possible.
- Ray lighting now uses the official Three.js screen-space reflection pass when available, restricted to reflective metallic meshes, so visible scene geometry can appear in material reflections; the previous environment/PBR path remains the fallback.
- Quality presets now change resolution, shadow/reflection sampling and sharpness without changing exposure, brightness, contrast, saturation, vignette or volumetric-light intensity.
- Restored collision on the built-in fake 3D light poles: circle colliders now create height-aware vertical Cannon cylinders instead of floating midpoint spheres.
- Audited Environment rendering and persistence. Rain now follows the camera used by each editor/game/PIP viewport, retains the player/level ground height, uses a stable camera-relative distribution and an explicit transparent render order instead of appearing only in part of the view.
- Rain, volumetric-cloud, sun-bloom and lens-flare values are normalized on live edits and project import so invalid or legacy values cannot leave an effect partially rendered or visually out of range.
- Added `Extract as scene objects` to Live Mesh editing for large multi-part GLB environments. Every selected visible non-skinned part becomes an independent persisted scene entity, keeps its world transform/material and split/join state, reuses the original GLB asset, and receives its own editable collider.
- Renamed the previous separation action to `Detach inside GLB` to distinguish hierarchy detachment from physical scene-object extraction; extraction supports undo/redo and cleans up partial results if an asset load fails.
- Collider auto-fit and Complex collision generation now ignore hidden/deleted GLB parts, so an extracted building/road/prop receives bounds only from its visible geometry instead of retaining the invisible full-scenario footprint. Mesh Delete/Restore snapshots now also restore visibility reliably.
- Unified the runtime `C` camera action across gameplay, editor Play Preview, gamepad mappings and playable exports. It now cycles `Free → Arcade → Cinematic → Free`; Free is a persistent manual orbit for the current session.
- Camera switching during play is now session-only and no longer mutates the authored `player.cam.mode` that is persisted with the project. Stopping Play Preview explicitly clears the runtime camera override.
- Completed a v0.6.6 persistence audit across scene transforms/parents, simple and Complex collision, player/rig, materials, GLB mesh edits/extraction, environment/video, HUD/music, Logic Elements, cameras, text, textures, lights, effects, Cinema Studio and project input metadata.
- Arcade and Cinematic runtime cameras now hide the pointer by default in gameplay and Play Preview just like Free Camera. In editor Play Preview `Shift+F1` remains the explicit show/hide override; non-Free modes do not request pointer lock.
- The normal editor viewport now renders through the same project Video pipeline used by Play Preview/gameplay—including ray lighting/SSR, volumetric lighting and quality profiles—while deliberately excluding Player Camera DOF/grade from the authoring camera.
- Added a right-aligned Quick Video gear to the viewport toolbar. It opens the existing shared Video controls, so no duplicate editor-only quality state is introduced.
- Reorganized Engine Editor settings into Project General access, Game Input and a separate local Editor Keys area. Select/Move/Rotate/Scale/Focus authoring keys are now remappable without changing exported gameplay controls.
- Moved editor entity/GLB thumbnail work from the animation frame into idle scheduling and suspend heavy thumbnail starts during camera/gizmo interaction, reducing long RAF and pointer-move stalls.
- Logic Element's internal 3D viewport now observes its actual panel bounds and redraws on every layout resize frame, preventing the black/stale canvas that previously required a click after resizing the overlay.
- Replaced the visually identical legacy antialiasing choices with real Off, mobile-friendly FXAA, Supersampling 2× and Supersampling 4× modes shared by editor, Play Preview and gameplay. Supersampling now scales from device resolution instead of being capped to it, with mobile/desktop GPU safety limits and automatic migration of existing Normal/High projects.
- Cinema Studio floating Preview now fits both width and height inside the actual editor viewport when switching aspect ratio. Vertical 9:16 shots resize immediately above the timeline instead of retaining a widescreen width and overflowing below it; manual resizing uses the same aspect-aware bounds.
- Editor loading now presents authoring controls in a dedicated left column and Gameplay/Play Preview controls in a separate right column.
- Replaced the three-way workspace choice with automatic hosted/local detection followed directly by Author DEMO or Clean Project. Hosted authoring requires explicit access to a user-selected local folder, copies the DEMO project/manifest there, stores remaining state in that visitor's browser and never writes projects or assets to FTP/server; unsupported browsers are guided to GitHub/local setup.
- Levels now persist an explicit Gameplay, `EDITOR MENU`, or `GAME MENU` role while retaining the same scene and LKEP format. This makes editor-menu scenes fully authorable today and reserves the identical scene contract for the future game-menu runtime.
- Quad View render modes now target the viewport selected when the Lit/Wireframe/etc. menu is opened, with immediate toolbar synchronization per slot. Wheel zoom is consumed by the hovered secondary viewport, preventing its event from also moving the main Perspective preview; every orthographic and secondary Perspective view keeps independent navigation state.
- Top, Bottom, Front, Back, Left and Right editor views no longer inherit distance fog from their artificial 120-unit orthographic camera offset. Fog is suppressed only for each orthographic render and restored immediately afterward, removing the intermittent strong blue veil without changing Perspective, Timeline or gameplay environment rendering.
- Entering Quad View now opens the shared editor loading overlay before GPU work starts and warms the four viewports across consecutive frames with real 25/50/75/100% progress. This prevents four camera/material/post variants from compiling in one silent blocking frame; the overlay closes only after the fourth viewport has rendered successfully.
- Audited English/Italian coverage across the recent v0.6.6 surfaces. Quad View/video loading messages, the hosted/local workspace and consent flow, editor/game loading-control columns, Radio/Menu music library actions and confirmations, Live Material/Mesh feedback, collider history labels and empty Radio states now follow the active language immediately; the workspace overlay rebuilds safely when language changes while open.
- Quad View now reserves space below the viewport toolbar using its actual rendered bottom edge instead of the previous mismatched fixed offset. The upper Perspective/Top selectors no longer overlap toolbar controls, and the toolbar keeps a protective higher stacking layer during collapse/expand and narrow-layout transitions.
- Standalone editor startup now treats project selection as a mandatory gate before menu/world assets, the bundled DEMO, editor entry and GPU warm-up begin. The workspace chooser is loaded before Three.js/runtime scripts, its close button is hidden on first setup, and choosing DEMO/Clean Project reloads into the normal loading phase; when reopened later from the toolbar it remains dismissible.
- Every viewport slot—including the main single/fullscreen slot—now supports Perspective, fixed Top/Bottom/Front/Back/Left/Right, authored Camera and Timeline output. Fixed orthographic views pan with middle-mouse drag and zoom under the wheel without rotating; secondary Perspective cameras retain independent navigation. Camera/Timeline outputs are navigation-locked clean previews, and each normal editor view has its own EN/IT helper-visibility checkbox for grids, gizmos, colliders and editor-only dummies.
- Placed GLB/GLTF assets now detect Blender/glTF embedded Point, Spot and Directional lights and convert them once into independent editor light entities. World position/direction/color are preserved, unsafe or missing intensity/range values receive bounded defaults, and the source entry suppresses its internal lights on reload to prevent duplicate illumination.
- Save, LKEP and Playable Export now perform a final embedded-light normalization pass over live GLB instances. Spotlight/Point/Directional nodes left by older or library-only placement paths are converted to persisted `kind: light` entries before scene collection, preventing lights visible in the editor from disappearing in exported projects.
- `Replace with GLB` no longer converts large files into duplicated base64 Data URLs. Replacement now loads from a temporary object URL, persists the source blob in IndexedDB and stores only its database key; object URLs are revoked on both success and failure.
- Asset thumbnails skip a second full GLB decode for files above 12 MB, retaining the normal asset icon instead. This prevents delayed tab out-of-memory crashes after a visually successful replacement of large map/level GLBs.
- Vehicle `Auto day/night` lighting now exposes configurable 0–24 switch-on and switch-off times (15-minute steps, default 18:00/07:00). Overnight/daytime windows are supported, equal times mean always active, and auxiliary lights configured for `Night` use the same persisted schedule.
- Removed missing menu-background and favicon requests, redundant model/rig/store startup logs, the known non-actionable Three r128 secondary-normal-UV warning and the browser-extension message-channel rejection without suppressing unrelated diagnostics.

### Raytracing Reference Decision

- Reviewed `lisyarus/webgpu-raytracer`. It is a native C++/SDL application using `wgpu-native` and a single glTF input scene, so it cannot be embedded directly into this browser Three.js runtime.
- v0.6.6 applies the relevant architecture ideas—distinct pipeline choice, cost-scaled samples and safe fallback—without adding a native dependency that would break editor, mobile or playable exports.

### Verification

- Added `tests/video-settings.test.js` for preset ordering, legacy-value migration, ray-lighting normalization and exposed-setting defaults.
- Added `tests/music-library.test.js` for project-track removal and serialization behavior.
- Added `tests/post-processing.test.js` for the smoke-aware volumetric shader path.
- Focused Playwright integration coverage passes on desktop and mobile Chromium; broader visual device acceptance remains part of release sign-off.

### Known Limitations

- `Ray lighting` is a realtime WebGL-compatible indirect-light/reflection approximation, not hardware RTX or an offline path tracer.
- Antialiasing levels adjust render sampling scale because WebGL context MSAA cannot be toggled after renderer creation.
- Connected/material decomposition is intentionally blocked for `SkinnedMesh` and morph-target nodes because splitting them without rebuilding skeleton bindings, morph buffers and animation weights would corrupt animated models.
- `Template - Player Car Logic Element` is currently an authoring/migration preview, not a fully independent replacement for the built-in `player_car (Logic)`. It preserves the current GLB, scale, mesh/material edits, rig snapshot and categorized variables, and demonstrates node movement, but the mature vehicle physics and specialist Player Car tabs still execute through the built-in singleton.
- The built-in Player Car supports unbounded auxiliary light entries—so multiple Reverse, Brake, Turn, Night or Always lights can be added and positioned independently. A Logic Element hierarchy can likewise contain any number of light elements, but reactive vehicle conditions do not yet bind those arbitrary hierarchy lights to an independent Logic Pawn runtime.
- Full parity still requires Logic-native or reusable component panels for Driving Setup, vehicle collision/physics, Player Camera, Vehicle Lights/Neon, Exhaust/Smoke, Skids, Data Widgets, Engine Sound, material/mesh authoring and controller possession, plus independent runtime instances for each Pawn.

### Forward Direction

- A future release may retire the fixed `player_car (Logic)` after the Player Car Logic Element reaches behavioral and Inspector parity. Keeping both implementations in v0.6.6 provides a working reference while the expandable replacement is tested against real projects.
- Vehicle physics is a candidate for extraction into an independently instantiable, plugin-ready component. This would support multiple local Pawns and alternative physics implementations while making third-party licenses, provenance and author credits explicit at the component boundary.
- The project is already capable of substantial browser-only level, cinematic and playable authoring. Photorealism is not the current claim; the practical direction is progressively better fidelity and extensibility without requiring users to install a large, complex toolchain.
### Camera Player 1 e query Logic Element

- L'uscita delle Scene Camera è ora un'unica assegnazione esclusiva (`None` / `Player 1`): disabilitando il Pawn o impostandolo su `Controlled by None`, la camera assegnata possiede davvero il frame di Play e Play Preview senza essere riscritta dal Player Car.
- Selezionando una Scene Camera nell'editor si apre automaticamente lo stesso pannello PIP usato dal Player Car, con preview dal punto di vista della camera, titolo contestuale e gli stessi controlli persistenti di spostamento, ridimensionamento e minimizzazione.
- Cinema Studio può essere assegnato direttamente a `Player 1`; le timeline `On Play`, incluse quelle in loop e con camera cut, occupano automaticamente il frame corretto sia nella preview sia nel playable.
- Logic Element aggiunge `Get Element By Type` e `Get All Elements By Type` per cercare Camera, Cinema Studio/Timeline, luci, mesh, Player Car e altri elementi di scena. `Set Active Camera` mantiene ora l'assegnazione runtime invece di copiare la camera per un solo frame.
