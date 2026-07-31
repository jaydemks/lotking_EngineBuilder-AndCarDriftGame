# Rendering, Lighting and Shadows

## Recommended daylight baseline

Lot King v0.7.1 uses a brighter r185 baseline: exposure `1.12×`, day sun `1.30` and day ambient fill `0.82`. These values restore readable shaded surfaces without removing the direction and contrast of sunlight.

The Environment inspector exposes separate background and image-based-lighting rotation. Both values are saved in degrees with the level and applied through Three.js r185 `Scene.backgroundRotation` and `Scene.environmentRotation`, so editor and gameplay reproduce the same orientation.

Use **Environment → Day / Night Lighting** for level-authored light balance:

- **Day sun** controls direct sunlight and the contrast of cast shadows.
- **Day ambient fill** lights surfaces facing away from the sun. Raise this before overexposing the whole image.
- **Moon direct light** controls the directional lunar contribution and its cast shadows.
- **Moon indirect light** controls the blue diffuse night fill and follows moon visibility.
- **Night environment response** scales image-based reflections and indirect environment response after sunset independently from the hemisphere fill. Its extended range is intended for night scenes with no visible sun.

Point and spot lights use the photometric model required by Three.js r185. Their inspector exposes luminous power in lumens and decay separately; `2` is the physically correct inverse-square decay. Legacy project values are migrated to candela when loaded instead of remaining nearly black after the renderer upgrade.

Use **Rendering / Video → Exposure** only for the final overall brightness. Camera color grading can still override exposure deliberately for a specific camera.

## Day/night cycle and scheduled lights

Use **Environment → Sky / Day-Night → Day / night cycle** to start or stop time progression. When disabled, the environment remains at the selected **Time of day** and that state is saved with the level.

Editable lights other than the environment sun/moon and hemisphere key expose **Follow environment time** in their Light Inspector. Set **Turn on at** and **Turn off at** in quarter-hour steps. Night windows such as `18:00–07:00` wrap across midnight automatically; equal times mean always on. A stopped environment clock still evaluates schedules against its fixed authored time.

## Player Car surface shading

Both the native **player_car (Logic)** and **Player Car Logic Element** expose **3D Model → Surface shading**:

- **Original normals** restores the GLB/material authoring state.
- **Smooth** averages normals across coincident polygon positions, including duplicated vertices at common UV seams, without adding polygons.
- **Flat** uses Three.js face-normal shading so each polygon remains visually distinct.

Shading is stored with the player blueprint or Vehicle Pawn graph and is reapplied after model replacement and mesh edits.

## Render resolution and texture budget

**Rendering / Video → Render resolution** sets how many pixels the engine shades, as a share of the
window (50%–200%). There is one renderer behind the editor viewport, the editor Play preview and the
standalone game, so this value governs all three. The row prints the buffer that was actually
allocated, in pixels and megapixels.

The effective pixel ratio is the product of four multipliers — device DPR, quality preset,
supersampling ratio and this control — and it is clamped by three ceilings: an effective ratio of
`2`, a 4K buffer budget on the long axis and in total, and a floor of `0.5`. Without them, `High` +
SSAA 2× on a 2× DPR panel asks for eight times the pixels of the window, and `Extreme` + SSAA 4×
asked for sixteen. Supersampling still helps on a low-DPR display; on a high-DPR one those samples
are already there.

**Rendering / Video → Texture budget** caps the largest texture the engine uploads, from `256 px` to
`4096 px`, defaulting to `1024 px`. Imported images, decals and GLB-embedded maps are downscaled as
they load; the source files are never modified, so raising the cap restores full detail on the next
load. Data, compressed and video textures are left untouched. A 4K PBR map is 67 MB before mipmaps,
which is why the default is deliberately modest.

## Reflections and artifact control

**Rendering / Video → Screen-Space Reflections** provides two independent controls when Ray lighting is selected:

- **Reflection quality** changes the SSR buffer resolution and hit tolerance. Low and Medium favor performance; High is the balanced default; Ultra uses a supersampled reflection buffer and the finest hit tolerance.
- **Ray reach** sets the maximum reflected distance from `5` to `120 m`. Use the shortest distance that covers the playable view; a longer ray is more expensive and can cross unrelated geometry.

SSR can reflect only geometry currently visible to the camera. Objects behind the camera or outside the frame still require an environment map or a future reflection-probe system. Authored material roughness and metalness are never changed by a video preset, so ordinary asphalt and matte ground no longer become accidental reflection receivers.

Volumetric shafts now accept only HDR light emitters and automatically fade out when the source is behind or outside the camera. This prevents bright neutral meshes from being interpreted as smoke and leaving directional ghost trails.

## Rendering modes

The Video menu offers three independent rendering modes:

- **Normal** uses the stable WebGL post-processing pipeline.
- **Ray lighting** adds the real-time screen-space ray effects intended for driving.
- **Path tracing** progressively accumulates a physically based static-world image. It shares the primary Three.js bundle so materials cannot cross incompatible Three.js instances. Vehicles, characters, custom shader materials, dynamic dashboard/video textures and transient effects remain a depth-correct raster overlay so controls stay responsive while the static image converges.

Path tracing requires WebGL 2 and is intentionally progressive: camera movement resets accumulation, and the quality preset controls its render scale, bounce count and texture-array budget. If initialization or BVH construction fails, the frame falls back to Normal rendering instead of leaving a black view.

The visually specialized demos in Erich Loftis' project use scene-specific GLSL integrators for effects such as oceans, participating media and mathematical primitives. Lot King uses a general scene/BVH renderer instead: it cannot copy every demo-specific shader into arbitrary editor levels, but it provides the transferable features—progressive global illumination, multiple bounces, physically based reflections/refractions and soft light transport—without constraining the authored level to one demo scene.

## Shadow controls

The player Video menu can expose:

- **Dynamic shadows**: master on/off switch.
- **Shadow quality**: Automatic, Low `512`, Medium `1024`, High `2048` or Ultra `4096`.

The project author has additional controls in **Rendering / Video → Sun Shadows**:

- **Coverage distance**: half-width of the directional shadow camera. Keep this as small as gameplay permits; a smaller area gives every texel more world-space detail.
- **Bias**: offsets depth comparison along the light direction. Change it in very small increments.
- **Normal bias**: offsets receivers along their surface normals and is the main control for acne on angled meshes.
- **Softness**: scales the PCF filter radius. It softens edges but cannot recover detail lost to a shadow map covering too much terrain.

Suggested starting points:

- Character or compact street level: High, `30–55 m`, bias `-0.00035`, normal bias `0.025–0.045`.
- Parking lot or medium driving area: High or Ultra, `55–90 m`, normal bias `0.035–0.065`.
- Large open world: increase coverage only when necessary; consider multiple localized lights or a future cascaded-shadow system instead of one enormous map.

If a specific mesh still looks wrong, verify **Cast shadows** and **Receive shadows** on the object. Thin or intersecting geometry may need corrected normals or thickness in the source model.

## Optical lens flare

The sun flare is an engine-native procedural effect with:

- source occlusion against scene geometry;
- aperture starburst;
- chromatic ghost chain along the sun-to-image-center axis;
- halo and glare controls;
- optional anamorphic horizontal response;
- camera-specific smoothing for editor, gameplay, PIP and split views.

The Cinematic mode integrates Anderson Mancini's complete CC0 shader from [R3F Ultimate Lens Flare](https://github.com/ektogamat/R3F-Ultimate-Lens-Flare), adapted to remain HDR until Lot King's Three.js r185 OutputPass. Its complete ring, ghost and starburst design is retained, while the expensive optical field runs at reduced HDR resolution and is composited back over the full-resolution scene. The Classic mode remains the lighter engine-native implementation. Attribution and the CC0 notice ship with the editor and playable exports under `media/lensflare/`.

For a photographic starting point, keep intensity below `0.9`, chromatic split around `0.35–0.55`, ghost opacity below `0.8` and starburst below `0.4`. Anamorphic mode is a stylistic lens choice, not a universal realism upgrade.

Occlusion performs a throttled ray query toward the sun and fades smoothly. Disable **Scene occlusion** only for stylized scenes or profiling.

Vehicle lamp meshes now receive state-driven color and emissive intensity for running lights, high beam, braking and reverse. The optional front/rear glow sprites remain disabled by default; they can be enabled independently when a stronger halo is wanted.

## macOS and WebKit compatibility

The rendering backend derives a compatibility profile from the actual WebGL context, extensions and GPU renderer. Apple Metal/WebKit contexts use a conservative screen-space path: device pixel ratio is capped at 2, SSAA does not add a second Retina multiplier, and GTAO/SSR are disabled when their intermediate HDR/depth buffers are not considered reliable. This does not alter authored materials, lighting, shadows, tone mapping or animation data. The active profile is exposed through `LK_RUNTIME_RENDERING_BACKEND.compatibilityProfile(renderer)` and `renderer.userData.lkCompatibilityProfile`.
