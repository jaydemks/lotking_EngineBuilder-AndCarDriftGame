# WebGPU dual-backend migration

## Viewport coordinate contract

Lot King layout rectangles remain authored in WebGL-style lower-left logical
coordinates. `LK_RUNTIME_RENDERING_BACKEND.viewportOriginY()` converts them at
engine call sites for `WebGPURenderer`, whose common canvas target expects an
upper-left origin even when it uses its internal WebGL 2 backend. Never wrap
`renderer.setViewport()` globally: Three's internal render-target operations
must keep their native coordinate contract.

This document is the implementation and release checklist for associating
WebGPU with the complete Lot King runtime without removing WebGL 2.

## Product contract

- WebGL 2 remains available as the stable backend and as the automatic fallback.
- `Auto` never selects an unqualified backend.
- An explicit `WebGPU` preference starts the same engine, editor viewport, Play
  preview, menu background and gameplay using `THREE.WebGPURenderer`.
- Failure to acquire a WebGPU adapter or device falls back to WebGL 2 on the
  same canvas and is reported by the Rendering Inspector.
- The rendering backend is independent from the visual pipeline selector
  (Raster, Ray effects, Path tracer).
- Unsupported WebGL-only effects degrade explicitly; they must never blank the
  canvas, stop the frame loop or corrupt a project.

## Implementation checklist

- [x] Bundle WebGLRenderer, WebGPURenderer, RenderPipeline and TSL from one
  pinned Three.js r185.1 module graph.
- [x] Keep `three-gpu-pathtracer` attached to that same module graph.
- [x] Create the main renderer from the stored backend preference.
- [x] Await WebGPU initialization before the first Editor/Play/game frame.
- [x] Detect the renderer's actual backend after Three.js automatic fallback.
- [x] Make explicit WebGPU selectable when the browser API, secure context and
  runtime are available; keep `Auto` guarded.
- [x] Report requested backend, actual backend and fallback reason in UI and
  the Rendering Inspector.
- [x] Route WebGPU through a TSL/RenderPipeline post-processing path.
- [x] Prevent legacy EffectComposer, ShaderPass and WebGLRenderTarget code from
  executing on a WebGPU backend.
- [x] Provide safe WebGPU alternatives or explicit fallbacks for rain,
  volumetric clouds, snow trails and material `onBeforeCompile` patches.
- [x] Keep path tracing WebGL-only and fall back to raster output under WebGPU.
- [x] Qualify automated scene loading, menu background, Editor viewport, Play
  preview, gameplay and fallback behavior on desktop and mobile browser profiles.
- [ ] Qualify real Android/iOS performance and physical device-loss recovery.
- [x] Run focused logic/unit tests and Chromium desktop/mobile renderer suites.
- [x] Record the backend association, limitations and validation in the current
  release notes.

## Release gate

`Auto` may promote WebGPU only after real Android and iOS devices pass the same
project-load and frame-stability scenarios as WebGL 2. Until then WebGPU is an
explicit experimental selection with automatic fallback, not the global
default.
