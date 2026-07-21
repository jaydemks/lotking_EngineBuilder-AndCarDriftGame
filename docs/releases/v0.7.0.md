# Release Notes: v0.7.0

## Lot King Engine Builder v0.7.0 - Character Foundation, Modern Rendering and Editor Stability

### Release status

- Status: released.
- Tag target: `v0.7.0`.
- Scope: introduce reusable on-foot Character gameplay, modernize the complete rendering stack and close a broad editor-stability pass without breaking existing projects or playable exports.

### Highlights

- Added a generic Character Pawn foundation with editable Normal, Civil and Police presets, while keeping Soccer as a specialized gameplay layer.
- Added the editable **Sketch Street - Character Movement** level template with a possessed Character and talkable Civil NPC.
- Upgraded editor, gameplay and exported playables from Three.js r128 to the pinned `0.185.1` release and a reproducible local compatibility bundle.
- Added Classic and Cinematic lens-flare modes, realistic sun bloom/glow, per-light flares, improved reflections and stable GPU rain.
- Completed a release-wide Save, reload, LKEP and playable-export persistence audit covering the full authored scene.
- Decoupled local projects from browser ports through a disk-backed local project bridge that preserves every level and embedded asset.
- Expanded native Player Car and Logic Element Vehicle Pawn authoring for tire smoke, lighting, flare pairs, neon, cameras and collision helpers.
- Added an extensible Developer Debugger for frame analysis, hardware/render statistics, scene cost, particles, diagnostics and navigable heavy-element reports.

### Editor workflow and diagnostics

- Added a `Dev` menu to the viewport toolbar. Its first tool opens a draggable, resizable and responsive Developer Debugger that remains available in Editor, Simulate and Play Preview.
- The debugger reports realtime FPS, average/P95/worst frame time, frame-budget saturation, draw calls, triangles, GPU resources, heap data, WebGL/hardware limits, errors, rejected promises, long tasks and frame hitches.
- Scene analysis now includes geometry and texture estimates, materials, resolutions, media duration, shadow casters, transparent materials, sprite effects, GPU Points, rain and native/Logic Vehicle particle systems, pool capacity and active particles.
- Resource rows are keyboard- and pointer-selectable. Clicking a row selects and reveals the corresponding Scene item and focuses its 3D representation when appropriate without moving the gameplay camera during Play or Simulate.
- Added a complete JSON performance-log export and an automatic concise Markdown snapshot at `.lotking-local/developer-performance-latest.md`, allowing diagnostics to be inspected directly from the project folder.
- Increased debugger labels, table text and graph annotations for practical readability on desktop and responsive layouts.
- Scene light dummies are visible and selectable by default while editing, can be disabled with viewport helper controls and remain hidden during Play unless runtime helper visibility is explicitly forced.
- Clicking an already visible Scene-outliner row no longer recenters the sidebar. Automatic reveal remains active for viewport and debugger selections.
- Editor input no longer combines TransformControls pointer capture with pointer lock. Invalid captures, cancellation, focus loss and missed releases restore hover, selection and orbit instead of leaving the viewport stuck in navigation mode.
- Heavy or first-use editor work is deferred or warmed up where possible, while the existing loading overlay covers operations that cannot complete without a visible wait.

### Project persistence, levels and local launch

- Save, reload, LKEP and playable export now run a schema-free integrity comparison over the complete authored scene and report exact differing property paths instead of silently dropping values.
- Deferred material, shadow, light-visibility, vehicle-flare and generated-light edits now update their persistent source state immediately.
- Normal Save snapshots the active level together with every gameplay and Menu level, writes the portable project to the optional workspace and local disk bridge, and restores it across different localhost ports.
- Embedded models, textures and audio are migrated into the destination origin's IndexedDB. The previous disk snapshot remains available as a recovery copy.
- Disk recovery no longer creates duplicate Projects entries, reloads the editor unexpectedly or auto-opens a project from the landing menu.
- Project Levels always shows the complete authored library, including Editor/Game Menu levels and hidden/internal gameplay levels. Orphaned level records are repaired into the index instead of disappearing.
- `avvio.bat` now uses the project-aware `serve_local.py`, automatically selects an allowed port starting from `5700`, opens the landing page once and avoids SafeDeps text being interpreted as a server port.
- Generic and compound scene duplication now starts from the selected object's complete authored state. Mesh, light, blueprint/Logic Element properties and independent collider data are preserved instead of reverting to defaults.

### Vehicle authoring and effects

- Added independent tire-smoke controls to native Player Car and Vehicle Pawn: amount, slip threshold, minimum heat, heating/cooling rates and separate drift, braking and wheelspin/burnout triggers.
- Tire smoke is driven by real slip work and accumulated tire heat. Legacy settings migrate to the restrained v3 baseline so ordinary steering no longer creates immediate screen-filling smoke.
- Skid marks and tire smoke can be enabled independently. Exhaust intensity accepts a real zero value and its exposed control is clearly named `Exhaust Smoke Intensity`.
- Native `player_car (Logic)` and Player Car Logic Element share persistent Original, Smooth and Flat surface shading.
- Native Player Car now exposes paired headlight, position, brake and reverse colors. Position and brake lights keep independent reds and independent intensity.
- Vehicle Cinematic flares use restrained, separately authored front-pair and rear-pair power, size, bloom and occlusion. Left/right lamps always share the pair value and persist through every export path.
- High beams change only luminous strength, reach and cone opening; they no longer resize or move the light dummy, glow or flare origin.
- Player Car and Vehicle Pawn emitters, dummies, glow and flare share the exact authored anchor transform, including after Logic Element hierarchy rebuilds.
- Replaced point/spot-style underglow with downward-facing rectangular area lights that follow the authored neon-strip shape in both vehicle implementations.
- Collision helpers use an Automatic/Always/Hidden policy. Automatic shows only the selected element's collider; Play and Simulate hide helpers unless the runtime override is explicitly enabled.
- The native Player Car camera now exposes persistent orbit pitch/yaw, look height, lateral offset and compact independent body/cone helper sizing; compatible values are honored by Logic Element vehicles.

### Rendering, lighting and weather

- Upgraded Three.js to `0.185.1`, modernized color-space handling, migrated TransformControls helper ownership and added OutputPass before display-space FXAA.
- Replaced mixed CDN dependencies with local version-pinned Three.js, Cannon `0.6.2`, JSZip `3.10.1` and TextGeometry font assets for static-host and offline playable reliability.
- Rebalanced daylight, sky fill and ground bounce; added separate direct and indirect moonlight controls and a persistent day/night-cycle pause.
- Environment time and automatic light schedules now share a readable 24-hour clock. Every scene light and both vehicle implementations support independent on/off hours with overnight intervals.
- Migrated point, spot, imported GLTF and vehicle lights to r185 photometric units with lumen power and physical decay authoring.
- Added player-facing shadow quality plus authored coverage distance, bias, normal bias and softness.
- Screen-space reflections now follow the active camera projection, clear stale ray data and retain the environment/sky fallback on misses. Quality profiles control resolution, near-hit tolerance and a `5-120 m` ray reach without producing a camera-facing black crop at close range.
- Rain now uses camera-facing instanced GPU ribbons with stable distance/resolution visibility, soft volume edges, editable thickness, wind, speed, area, height and opacity.
- Added persistent Classic and Cinematic lens-flare modes. The Cinematic r185 pass provides HDR glare, circular/hexagonal ghosts, chromatic dispersion, lens dirt, starburst and dedicated sun bloom/glow.
- Point, spot, directional, hemisphere, ambient and rectangular scene lights can use the Cinematic flare with persistent intensity, size, bloom and mesh/glass/smoke occlusion.
- Sun, moon, stars and flare source use camera-relative sky directions. Camera helpers never occlude the sun; real meshes still do, while clouds, smoke and transmissive glass attenuate it according to coverage.
- Cinematic point ghosts use bounded soft cores to remove sub-pixel flicker. Disabling Volumetric Lighting falls back to the Classic sun flare instead of hiding flare visibility.
- Volumetric lighting samples only the real camera-relative sun region and rejects bright meshes, headlights and SSR highlights that previously produced repeated directional ghosting.

### Character foundation and animation authoring

- Added `Template - Player Character (Normal)` as a separate editable Logic Element for camera-relative walking, running, sprinting, jumping and interaction.
- Added independent `normal`, `civil` and `police` Character presets. Soccer retains striker, winger, midfielder, defender and goalkeeper specializations.
- Added Character Logic nodes for movement input/output, jump, action playback, preset changes and runtime-state queries.
- Added a shared Character Pawn base for lifecycle, movement, collision, possession, camera and animation. Generic Character and Soccer remain thin independent specializations.
- Added a dedicated Character/Soccer model assignment section. Animation slots document expected clips, looping and gameplay purpose.
- Locomotion and actions are authored in-place with root motion disabled because runtime owns Pawn translation, collision, jump height and goalkeeper displacement.
- Clips-only GLBs remain supported when they use the same skeleton hierarchy and bone names as the Character model.
- Added **Sketch Street - Character Movement**, a fully editable native level containing the sloped seaside road, eight houses, vending machine, signs, vegetation, walls, guardrail, poles/cables, scooter and street props.
- Character and Soccer Pawns ignore their own Logic Element collider while continuing to resolve world obstacles.

### Logic Element and runtime stability

- Logic Element Inspector normalization preserves the selected root identity, so root, primitive and text edits survive panel refreshes.
- Function input/output ports write to the live subgraph and persist through normalization, Save and reload.
- Built-in templates use the current v2 root/component structure and keep their default mesh editable and visible.
- Vehicle Pawn initialization safely fills missing collision data in older or partial projects.
- The standalone editor harness boots the same complete runtime stack as the primary editor.
- Ray Lighting no longer rewrites authored roughness/metalness values, eliminating reflective ground blotches after the rendering upgrade.

### Documentation

- Added `docs/CHARACTER_MOVEMENT.md` for Character presets, controls, GLB setup, animation slots and fallback behavior.
- Added `docs/RENDERING_LIGHTING_AND_SHADOWS.md` for exposure, daylight, shadow artifacts, reflections and lens-flare authoring.
- Updated architecture, runtime-module, Logic Element and Vehicle Pawn documentation for the v0.7.0 systems.

### Verification

- Added a complete persistence round-trip covering transforms, meshes, materials, physics/colliders, every light type and schedule, Environment/weather/rendering, Player Car and Vehicle Pawn settings, camera/DOF/grade, effects, HUD/music, input, level logic, text, textures and Cinema Studio across local Save, LKEP and playable export.
- Added Character core coverage for registration, graph validation, animation guidance, preset isolation, movement/jump lifecycle, self-collider filtering and the Sketch Street template.
- Added browser coverage for Three.js revision 185, WebGL2, modern color space, addons, TransformControls pointer recovery, editor/gameplay boot and playable ZIP contents.
- Added browser coverage for local level repair, Player Car/Vehicle Pawn persistence, light schedules, shading, photometric migration, reflection settings, cinematic flare state and Developer Debugger export/navigation.
- The Three.js migration gate and the Logic, Soccer, Character, Video Settings, Music Library and Post-processing Node suites pass.
- Final Playwright matrix passes `44/44`: `22/22` desktop Chromium and `22/22` mobile Chromium.
- `git diff --check` and Python syntax validation for both local/LAN servers pass.

### Known limitations

- The editor remains experimental; keep versioned project exports and validate the final playable on the intended browser/static host.
- The automatic Markdown performance snapshot requires `serve_local.py`/`avvio.bat`; on a generic static or hosted server the debugger still provides the complete manual JSON download.
- Screen-space reflections cannot reflect geometry that is outside the current camera view or hidden behind another surface; those rays intentionally fall back to the authored environment.
