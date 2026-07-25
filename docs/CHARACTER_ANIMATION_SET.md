# Character Motion Animation Set

The Character Pawn separates the visual character from its motion database.

## Character model

`characterPawn.model` is the authoritative rigged GLB reference, including a linked runtime GLB produced from an FBX source. The Logic Scene mirrors it on `character_model` for editing and preview. `model.fit` normalizes the source to an authored height and the Logic Scene element scale is the final world multiplier. When a model is assigned, all primitive placeholder body parts are disabled during every scene synchronization; resetting Main Mesh restores the clean procedural T-pose without deleting the Motion Set.

## Motion entries

`characterPawn.animationSet` is an array. Every entry can reference a different GLB, or an FBX converted to GLB by the built-in importer.

```json
{
  "id": "run-forward",
  "name": "Run Forward",
  "state": "grounded",
  "direction": [0, 1],
  "speed": 5.4,
  "speedTolerance": 2.4,
  "asset": { "dbKey": "asset:run" },
  "clip": "mixamo.com",
  "loop": true,
  "priority": 1,
  "playbackRate": 1,
  "motionTransform": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0]
  }
}
```

States are `grounded`, `jump`, `fall`, `land`, and `action`. Grounded entries form a two-dimensional directional and speed blend space. Multiple entries may share the same state and direction at different speeds.

## Runtime selection

Each frame the selector evaluates local velocity, speed, grounded/airborne phase, vertical velocity, acceleration, the requested action, and author priority. It ranks compatible entries, applies a normalized confidence to the best candidates, and cross-blends them. Playback speed is stride-matched against the entry's nominal speed.

This is deterministic motion matching over authored metadata. It is deliberately not random probability: the same motion state produces the same selection and remains stable across frames.

Inside the stationary dead zone, the best Idle entry is selected exclusively at weight `1`. Walk and strafe tolerances cannot contribute a small hidden weight while the Pawn is stopped. The first runtime selection is also applied at its full target weight instead of fading from the imported bind pose; subsequent state changes use the normal smooth blend.

While moving, direction is resolved before speed. A straight Forward request therefore blends only Forward samples at the available walk/run speeds and cannot accidentally admit just one side of a tied Left/Right pair. Diagonal input still blends adjacent Forward and Strafe samples.

Forward/backward grounded locomotion also defaults to in-place root yaw. Progressive yaw stored on Hips/root by an FBX take is removed without deleting its pitch, roll or limb motion, preventing a visually straight Sprint from curving left or right. Every entry exposes `rootYawMode`: `auto` locks forward/back locomotion, `locked` forces the correction, and `authored` preserves the original turning animation.

Legacy `animations.*` slots and a shared `animationLibrary` are migrated into motion entries when an older Character or Soccer Pawn is opened. They remain readable for project compatibility but the Motion Animation Set is the primary authoring interface.

If an entry has no usable authored take, a compatible humanoid Main Mesh receives a runtime-generated, rotation-only placeholder clip for the inferred slot. The clip is built from the target skeleton's own rest quaternions, so it cannot import another file's centimetre scale, root offset or proportions. Pawn Studio uses the same generator for isolated preview. Generated clips are marked `lkProceduralPlaceholder` and are discarded automatically from selection whenever a real embedded or external clip binds.

Pawn Studio can populate the set from a multi-selection or directory containing FBX/GLB animation sources and textures. Each FBX is converted independently to the canonical GLB format, so the resulting entries use the same runtime and portable-export path as manually imported GLBs. Animation-only sources may omit rendered geometry, but must retain an armature and actual animation tracks.

The canonical GLB is also the authoritative Pawn Studio preview. The Main Mesh uses the same fitted and grounded hierarchy as the world, while an external animation source is loaded unfitted before retargeting, exactly like the runtime animation library. The linked original FBX is retained for rebuilding and diagnostics, but it is not silently substituted for the Studio viewport because its root hierarchy and bind-pose axes can differ from the generated glTF used by Play. If the canonical build is missing or unreadable, direct FBX preview is used only as an explicit fallback and the asset should be rebuilt before final alignment.

Compatible humanoid assets do not need byte-identical bone paths. Pawn Studio canonicalizes common namespaces such as `Armature|mixamorig:Hips`, compares captured bone metadata and, when both files expose real skeletons, rebuilds the take for the Main Mesh through Three.js r185 `SkeletonUtils.retargetClip()`. Hip translation is normalized from corresponding bone-segment ratios and rebased onto the target rest position; hip orientation is rebased onto the target rest axis, removing source FBX/glTF up-axis transforms. Locomotion takes are made in-place on X/Z while their vertical jump/fall delta is retained. When full retargeting cannot run, source bone positions/scales are rejected and only safe rotation tracks are rebound, preserving the Main Mesh proportions. Genuinely different hierarchies remain incompatible and require an authored retarget profile; FBX-to-GLB conversion alone does not invent one.

`sourceOrientation` is stored per entry and defaults to `y-up` for direct Mixamo FBX. `auto` derives per-bone corrections by comparing the complete bind poses. Other values are `z-up`, `z-up-inverted`, `x-up`, `x-up-inverted`, and `y-up-backward`; these are escape hatches for non-standard exporter axes and affect authoring preview and runtime equally. `previewScale` defaults to `1` and is an authoring-only multiplier for the isolated slot viewport; it never changes runtime character scale.

`rigCorrections` is the non-destructive pose layer authored with Pawn Studio **Edit Rig**. Keys are canonical bone names and values are local XYZ rotation offsets in degrees, for example `"hips": [8, 0, 0]`. The isolated viewport pauses on the current frame, displays the real skeleton and attaches a rotation gizmo to the selected bone. Corrections apply uniformly over that slot and are blended by the same motion weights as its animation, so pose differences progressively disappear while another state takes over. Source files, bone positions, scale and keyframes remain unchanged.

At runtime the previous Edit Rig delta is removed before `AnimationMixer` evaluates the next clip pose and reapplied only after mixer evaluation. This keeps the correction outside Three.js property accumulation and makes the rendered pose match Pawn Studio over the whole loop, not only on its first frame.

`motionTransform` is a non-destructive position (metres) and XYZ rotation (degrees) for the complete animation entry. It is authored with the normal viewport Move/Rotate gizmo or numeric slot controls. It follows the same blend weight as that entry, is applied in Pawn Studio and runtime, and is never written into Main Mesh or neighboring states. Runtime applies this layer to the Character Model holder outside the imported GLB and its `AnimationMixer`; exporter root orientation therefore cannot overwrite the authored slot correction.

Legacy `curveCorrection` spatial metadata remains preserved when existing projects are normalized, but it is no longer applied to the runtime Main Mesh.

## Preview diagnostics

Every slot can be tested independently in Pawn Studio. The status line separates:

- invalid keyframe data;
- a clip with no tracks;
- zero tracks bound to the target rig;
- bound but static tracks;
- name rebinding versus full skeleton retargeting;
- the armature scale factor used for retargeted hip movement.

Stop freezes the current pose and Play restarts the selected action. The temporary toolbar speed multiplies the entry's authored `playbackRate`; it does not modify saved motion metadata.
