# Three.js r185 Migration Roadmap

Status: completed and verified locally for v0.7.0.

## Objective

Upgrade every Lot King runtime, editor and playable-export entry point from Three.js r128 to the pinned stable release `0.185.1` while preserving existing projects, rendering behavior and static-host/offline export support.

## Non-regression contract

- One Three.js version must own core and every addon; mixed revisions are forbidden.
- `engine_editor.html`, `gameplay.html`, `test-editor.html` and exported playables must use the same local compatibility bundle.
- Existing legacy modules may continue to read `window.THREE`, but the bundle source must use the official ESM package and `examples/jsm` addons.
- Existing LKEP data, GLB assets, material overrides and runtime settings must not require manual migration.
- Direct rendering and post-processing must use the same color-space and tone-mapping policy.
- Editor picking, OrbitControls and both TransformControls viewports must remain functional.
- The upgrade is complete only after syntax checks, Node suites, targeted browser tests, export checks and visual smoke checks pass without new browser/WebGL errors.

## Baseline before migration

- Three.js core: `r128` from cdnjs.
- Addons: `0.128.0/examples/js` from jsDelivr.
- Node baseline: 6/6 suites pass.
- Targeted Character browser baseline: desktop and mobile pass.
- Full browser baseline exposed pre-existing timeouts in the large Logic Element editor scenario before the dependency change; these are tracked separately and are not attributed to r185.

## API inventory

- Global constructors and constants are used throughout legacy IIFE modules.
- Addons in use: GLTFLoader, SkeletonUtils, OrbitControls, TransformControls, Lensflare, EffectComposer, RenderPass, ShaderPass, FXAA, SimplexNoise, SSR and Bokeh.
- The standalone test editor additionally needs FontLoader and TextGeometry.
- Removed color APIs in use: `WebGLRenderer.outputEncoding`, `Texture.encoding` and `THREE.sRGBEncoding`.
- TransformControls must use its modern scene helper instead of adding the controls object directly.
- Modern post-processing requires an explicit output pass so tone mapping and output color conversion occur after custom passes.
- The ZIP exporter currently downloads r128 core/addons separately and must instead package the pinned local bundle.
- Cannon remains at `0.6.2`, but is vendored locally to prevent an unrelated CDN request from blocking r185 regression tests and offline startup.
- The existing JSZip `3.10.1` exporter dependency is also pinned locally so playable packaging does not introduce a network-only failure path.

## Execution phases

### 1. Pinned compatibility bundle

- Add `three@0.185.1` as an exact runtime dependency.
- Add a small ESM bundle entry that imports core and every required addon from the same package.
- Build one browser IIFE that exposes a mutable `window.THREE` compatibility namespace.
- Record the actual revision at runtime and fail loudly if the expected revision is not loaded.

### 2. Core API migration

- Replace encoding APIs with `colorSpace` / `outputColorSpace`.
- Audit renderer, texture, render-target, PMREM, light and shadow behavior.
- Keep the existing ACES exposure baseline unless visual comparison demonstrates a required compensation.

### 3. Addon migration

- Adapt main-editor and Logic Element TransformControls to `getHelper()`.
- Add OutputPass at the end of the composer.
- Verify GLTFLoader, SkeletonUtils, OrbitControls, Lensflare, SSR, Bokeh, FXAA, FontLoader and TextGeometry.

### 4. Entry points and exports

- Replace all r128 CDN tags in editor, gameplay and test pages.
- Remove obsolete dynamic addon downloads from the editor loader.
- Package the local r185 bundle in playable ZIPs, with no runtime Three.js network dependency.
- Add a cache key for static hosts.

### 5. Verification

- Static scan rejects r128 URLs and removed APIs.
- Node suites and syntax checks pass.
- Browser smoke checks assert `THREE.REVISION === "185"`, WebGL context creation and zero page errors.
- Editor checks cover selection, gizmos, Logic Element viewport and GLB preview.
- Runtime checks cover gameplay boot, post-processing fallback, vehicles and Character/Soccer templates.
- Export checks verify that the ZIP manifest contains the local r185 bundle and no old addon files.

## Rollback boundary

The generated bundle, compatibility entry and API adaptations form one atomic migration. Do not publish a state that combines r185 core with r128 addons or vice versa.

## Completion report

- Pinned runtime: Three.js `0.185.1`, built from the official ESM package into one local compatibility bundle.
- Shared entry points: editor, gameplay, standalone editor harness and exported playables all load the same revision and addon set.
- Compatibility work: modern color spaces, post-processing output, shadows and TransformControls helper lifecycles are active without changing saved LKEP data.
- Offline/static-host support: Three.js, Cannon `0.6.2`, JSZip `3.10.1`, TextGeometry font and license notices are packaged locally with versioned cache keys.
- Product regressions found during sign-off were fixed: stable Logic Element root identity, persistent Function I/O ports, current v2 template roots, safe Vehicle Pawn collision defaults and a complete standalone editor runtime stack.
- Browser result: `38/38` Playwright scenarios pass (`19/19` desktop Chromium and `19/19` mobile Chromium).
- Core result: all Logic, Soccer, Character, video settings, music library and post-processing Node suites pass.
- Static result: the generated bundle rebuilds successfully; the migration gate passes; syntax checks pass for all `46` changed JavaScript files; `git diff --check` reports no whitespace errors.
- Visual smoke result: editor level rendering and the Logic Element viewport were inspected with the r185 renderer and modern gizmo helpers active.

The migration is ready for the remaining v0.7.0 feature work. Any future Three.js change must update the exact package version, bundle metadata, cache key, export manifest and this verification matrix together.
