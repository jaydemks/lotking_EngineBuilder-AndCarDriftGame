# Three.js Version Tracker

This is the permanent upgrade ledger for Three.js in Lot King. Update it in the same change that updates the `three` package, compatibility bundle, entry-point cache keys, exported playable manifest or renderer policy.

## Current baseline

| Item | Value |
| --- | --- |
| Lot King version | `0.7.1` |
| Three.js package | `0.185.1` |
| Runtime revision | `THREE.REVISION === "185"` |
| Bundle source | `js/vendor/three-r185-compat.entry.js` |
| Generated bundle | `vendor/three-r185-compat.min.js` |
| Last documentation audit | 2026-07-21 |
| Previous audited revision | r183 |

Official sources that must be read for every upgrade:

- [Three.js migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- [Three.js API documentation](https://threejs.org/docs/)
- [Three.js releases](https://github.com/mrdoob/three.js/releases)
- The installed package source and addon source under `node_modules/three/`

## r183 → r185 audit

### Timing

- `Clock` is deprecated since r183. Lot King must use `Timer`.
- `Timer.update(timestamp)` must run once at the beginning of every animation frame before `getDelta()` or `getElapsed()`.
- Call `timer.connect(document)` when Page Visibility handling is desired and `timer.dispose()` with the owning viewport.
- Status: Pawn Studio migrated on 2026-07-21. Static regression checks must reject new `THREE.Clock` usage.

### Character animation and Mixamo

- Prefer glTF/GLB as the authored runtime format. `GLTFLoader` exposes animation takes as `gltf.animations`; an animation-only take still needs a real armature to be retargetable.
- Use one `AnimationMixer` per animated preview root, advance it with the `Timer` delta, and release it with `stopAllAction()` plus `uncacheRoot()` when replacing the model.
- Clone skinned characters with `SkeletonUtils.clone()`. A plain `Object3D.clone()` does not correctly preserve the independent bone relationships of a skinned hierarchy.
- `SkeletonUtils.retargetClip()` accepts a target with a skeleton and a source `SkinnedMesh` or `Skeleton`. Never manufacture a `Skeleton` from arbitrary named `Object3D` nodes.
- Pass its hip `scale` from the target/source armature span ratio. Main Mesh fit/world scale and an independently imported Mixamo take must not leak their separate normalization wrappers into the generated root motion.
- Validate imported/retargeted clips with `AnimationClip.validate()` and optimize valid preview clips before binding them. Report zero bound tracks and static tracks as distinct authoring errors.
- `SkinnedMesh` animated bounds are not maintained automatically. Pawn Studio disables frustum culling for its isolated preview and recomputes bounds when framing the character.
- Preview speed is applied with `AnimationAction.setEffectiveTimeScale()` and composes with the per-slot playback rate.

### r183 → r184

- Environment/background rotation semantics changed and require visual comparison for sky/environment tools.
- `FBXLoader` converts +Z-up input to +Y-up automatically. Do not add a second generic FBX axis correction in the importer or preview.
- `FileLoader.load()` and `ImageBitmapLoader.load()` no longer return the loaded resource. Consumers must use callbacks or async APIs.
- `FirstPersonControls` behavior changed; currently not part of the compatibility bundle.
- Raw WebGL pixel-store mutations must go through `renderer.state.pixelStorei()`.

### r184 → r185

- `WebGLRenderer.compileAsync()` in `0.185.1` polls private material programs from a timer. If an editor/runtime material is replaced or disposed during that polling window, `currentProgram` can be missing and the callback throws at `program.isReady()` without settling the returned Promise. Lot King serializes shader preparation through `rendering-backend.js`, uses `renderer.compile()` plus real settling frames for WebGL, and permits native asynchronous compilation only on the future WebGPU renderer path.
- WebGPU premultiplied-alpha behavior changed. When WebGPU becomes active, opaque editor viewports should use an opaque scene background or clear color.
- `GTAONode` output is darker/wider; compare radius and scale when the WebGPU render pipeline is enabled. This is distinct from the current WebGL `GTAOPass` path.
- `SSAAPassNode.clearColor` and `clearAlpha` were removed; configure clear color on the renderer.
- `SVGLoader.createShapes()` is deprecated; use `shapePaths.toShapes()` if SVG importing is introduced.
- `DRACOLoader.setDecoderConfig()` is deprecated; do not add new use.
- `Object3D.updateWorldMatrix()` now honors `matrixWorldNeedsUpdate`. Code that disables `matrixAutoUpdate` and edits matrices directly must set that flag.
- `Matrix3.translate()`, `scale()` and `rotate()` are deprecated.
- `DRACOExporter.parse()` was replaced by `parseAsync()`.

## Upgrade procedure

For every Three.js release:

1. Record the target package and revision here before changing code.
2. Read every migration-guide section between the current and target revisions.
3. Search the repository for each removed, renamed or deprecated API, including editor-only and export-only paths.
4. Audit loader coordinate-system changes separately from rendering changes.
5. Rebuild the compatibility bundle from one exact Three.js package version; never mix core and addon revisions.
6. Update cache keys in editor, gameplay, tests and generated playables.
7. Run the static migration gate, Node suites, browser editor/runtime tests and playable-export tests.
8. Perform visual comparisons for lighting, environment rotation, transparency, tone mapping, shadows and post-processing.
9. Add the results and any intentional deferrals below. A warning-free console is part of completion.

## Verification matrix

| Area | Required check | r185 status |
| --- | --- | --- |
| Core/addons | One exact revision | Complete |
| Deprecated APIs | Static scan plus runtime console | `Clock` removed from Pawn Studio; static migration gate maintained |
| GLB/animations | Main mesh, separate clips, retarget, scale and mixer | Automated coverage present; real imported-asset acceptance pending |
| FBX | +Z-up conversion, animation export, source preview | Complete; no manual global axis correction |
| Editor timing | Preview Play, Stop, hidden-tab delta | Timer migration complete |
| WebGL rendering | Color space, tone mapping, shadows | Complete |
| WebGPU/TSL | Alpha, GTAONode, render pipeline | Deferred until backend activation |
| Exported playable | Local bundle and no retired fallback assets | Complete |

## Next upgrade entry template

### r___ → r___ — YYYY-MM-DD

- Package:
- Migration-guide changes reviewed:
- Repository API matches:
- Rendering differences:
- Loader/asset differences:
- Compatibility bundle changes:
- Cache/export changes:
- Automated tests:
- Visual checks:
- Deferred work and owner:
