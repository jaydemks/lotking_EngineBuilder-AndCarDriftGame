# Illustrated Sketch rendering

This document is the implementation and regression checklist for Lot King's
illustrated rendering. The feature deliberately uses an original **Detailed
Illustrated Sketch** identity rather than naming or imitating a specific studio.

## Authoring model

- **Per material:** `Original material`, `Color Sketch`, or `Monochrome Ink`.
  The selected GLB/material slots receive a `MeshToonMaterial` presentation
  layer while the exact original material instance remains protected below it.
- **Whole scene:** `Project → Rendering / Video → Illustrated Sketch` controls
  automatic contours, tonal bands, cross-hatching and paper grain. The author
  can choose `Painted Storybook` (full-colour pigment, illustrated light and
  atmosphere), `Paper Pencil` (high-key paper, irregular graphite and fibres)
  or the stronger `Illustrated Ink` treatment.
- **Black & white:** an independent whole-frame filter. It works with both
  Natural and Illustrated rendering.
- **Author output override:** two independent project locks can force the full
  authored sketch appearance and the authored black-and-white value. Enabling
  either or both disables only those player-facing choices; unlocked video
  settings remain personal.
- **Surfaces:** the per-material layer stores its authoring data in `matProps`;
  runtime-only original references and generated grayscale textures are not
  written into project JSON.

## Full-scene colour treatment

The illustrated pipeline is not an outline overlay. Before drawing contours it
separates luminance from chroma, quantises both into a controlled material
palette, re-deposits colour as pigment and shapes shadows into cool tonal bands.
Highlights and emissive pixels receive a warm drawn-light response. A separate
low-chroma classifier gives smoke, clouds, haze and transparent particles a
soft granular wash; rain, flame and flare highlights retain readable strokes.
Because this happens after the scene and optical effects are composited, every
visible pixel participates without requiring a special particle material.

`Pigment & Palette` controls how far surfaces move away from their original PBR
colour. `Atmosphere & transparent FX` controls the wash and light response of
soft/transparent effects. Neither setting changes the authored source asset.

For material-specific direction, `Color Sketch` now derives a cached pigment
texture for the selected material slot, with its own `Color pigment response`,
toon-lit shadow bands and paper tint. It preserves alpha, emission, normals,
texture transforms and the exact original material instance. If browser canvas
security prevents reading a source texture, the original texture is preserved
and the toon/pigment colour response still applies.

## Runtime contract

- WebGL uses one bounded `ShaderPass` before `OutputPass`.
- WebGPU/common renderer uses the equivalent TSL graph in `RenderPipeline`.
- Scoped WebGPU output samples `viewportUV / viewportSize`, including the main
  scene texture and all contour neighbours. `screenUV` is forbidden here: in
  the Editor it includes the surrounding toolbar and asset panels and would
  crop/stretch the scene pass to a different camera aspect.
- Each WebGPU render also applies the requested `{width, height}` to the
  intermediate scene pass. Editor, Play, PIP and full-screen output therefore
  agree on both camera projection and render-target aspect.
- The same saved video values drive Editor viewport, Play Preview, menu/gameplay
  and playable runtime.
- Illustrated or monochrome output takes precedence over the experimental
  progressive path tracer because that renderer presents directly to the canvas;
  Natural output continues to use path tracing when selected.
- Disabling a material sketch layer restores the original material object, maps,
  opacity, sides and dynamic-surface controller.
- If a source texture cannot be sampled safely for Monochrome Ink, the runtime
  falls back to tonal material color without modifying the source texture.

## Mobile budget

The scene pass is full resolution but bounded: four neighbour taps plus the
source sample, analytic two-direction hatching, palette/pigment operations and
procedural paper noise/fibre. It allocates no per-frame textures. Material tone
bands use small shared nearest-filtered lookup textures. Derived monochrome and
colour-pigment maps are cached per source texture and capped at 1536 px per axis.

## Regression checklist

- [x] Project settings normalize and persist style, medium and all controls.
- [x] Schema v7 preserves independent author locks for sketch and monochrome.
- [x] Material slot selection persists Color Sketch / Monochrome Ink.
- [x] Color Sketch derives per-slot pigment textures and preserves transparent
  and emissive material behaviour.
- [x] Original material restoration is non-destructive.
- [x] WebGL contour/hatch/paper pass is wired before display conversion.
- [x] WebGPU TSL contour/hatch/paper graph is wired to the common renderer.
- [x] WebGL and WebGPU implement the same palette, shadow, highlight and
  atmospheric-particle treatment.
- [x] WebGPU TSL samples the scoped viewport with the same camera aspect as
  WebGL, Play and standalone game.
- [x] Editor single viewport, Play and game request the same visual pipeline.
- [x] Desktop and gameplay settings expose the same controls.
- [x] Chromium desktop and Pixel 7 profiles render a measurably different
  illustrated frame and restore the exact original material after toggling.
- [ ] Qualify the final appearance and frame time on physical Android WebGPU.
- [ ] Qualify the final appearance and frame time on physical iOS/WebKit when
  WebGPU is available in the target browser.
- [ ] Add a dedicated masked post buffer only if future art direction requires
  screen-space outlines around selected materials without the global preset.

## Visual acceptance

The target is a detailed hand-worked illustration: readable silhouettes,
material-aware tonal bands, fine irregular contours, layered shadow hatching
and a subtle warm paper surface. `Paper Pencil + Black & white` targets the
white-paper reference; `Paper Pencil` alone retains restrained authored colour.
The style must preserve authored shapes and content rather than hallucinating
or replacing them.
