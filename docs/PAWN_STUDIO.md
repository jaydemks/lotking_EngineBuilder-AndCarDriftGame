# Pawn Studio

Pawn Studio is the common authoring workspace for every controllable or simulated Pawn category. It replaces category-specific walls of fields in the regular Inspector.

## Workspace layout

- Left: typed container hierarchy. Main mesh, collision, movement, animation sets, wheels, lights, audio and other category-owned systems live here.
- Center: isolated 3D preview. The main model is loaded without moving the scene instance; animation entries can be previewed directly on the model skeleton.
- Right: properties for the selected container. Changes save through the Logic Element persistence path and refresh the live scene representation.

Character and Soccer adapters expose Main Mesh, Skeleton, Collision, Movement, Motion Animation Set, Camera and Appearance. Vehicle exposes Main Vehicle Mesh, Driving, Body/Collision, Suspension, Wheels, Lights, Effects, Audio and Camera.

The default-enabled **Cloth Studio** plugin adds a dedicated container to Character and Soccer Pawns. It discovers separated skinned garment meshes, paints pin/free vertex masks in the isolated viewport, configures wind and solver quality, and authors automatic or explicit bone-sphere colliders. The same saved component runs after skeleton animation in Play Preview and export. See [CLOTH_STUDIO.md](CLOTH_STUDIO.md).

The center viewport is also an authoring surface. **Move**, **Rotate** and **Scale** attach the same Three.js axis-gizmo family used by the main editor; `W`, `E` and `R` switch tools. With Main Mesh selected, Character transforms write directly to `logicScene.character_model`, including per-axis scale. With a Motion slot selected, Move and Rotate instead author that entry's isolated `motionTransform`; they never alter Main Mesh or another animation state. Both paths remain identical in Pawn Studio, the scene editor, Play Preview and portable runtime. Numeric controls and reset remain available for precise entry.

Inside a Motion slot, **Edit Rig** pauses the isolated preview and exposes the Main Mesh skeleton. Choose a bone from the toolbar and rotate it with the local-axis gizmo; **Reset Bone** removes only that correction. Pawn Studio stores the result as a non-destructive per-slot `rigCorrections` pose layer, without rewriting FBX/GLB keyframes or adding position/scale tracks. Runtime blends these bone corrections with the same Motion Set weights used for Idle/Walk/Run/action transitions, so a crouched Idle can progressively straighten into Walk or Run instead of translating the whole character as one block.

Every Motion entry owns a separate `rigCorrections` map. Editing Spine in Idle never writes to Walk, Run, Jump or another action. During a live transition the Idle correction remains visible only while Idle itself still has blend weight, then reaches exactly zero with that state.

Every Motion entry also owns a separate whole-slot position and rotation layer. This is intended for an otherwise valid take whose complete pose is slightly off the floor or has a small orientation error. The viewport gizmo and the six numeric fields edit the same saved data; runtime blends the layer with the entry's Motion Set weight, so an Idle correction fades away as Walk or Run takes control.

The former `curveCorrection` metadata remains preserved in existing project data, but it is no longer applied to the runtime Main Mesh. Flying Curve is no longer exposed as an authoring workflow.

When a Character has no Main Mesh, the viewport renders the shared procedural humanoid in a clean jointed T-pose. Selecting a motion sample previews the built-in procedural approximation. Assigning a Main Mesh replaces this entire placeholder path; compatible animation clips then play on the imported skeleton.

The Motion Animation Set supports multi-file and folder import. Select several FBX/GLB files together with their sidecar textures; the enabled FBX plugin preserves every original FBX, compiles its linked runtime GLB and Pawn Studio creates one motion sample per imported clip. Pawn Studio loads the FBX source directly for authoring preview, while gameplay and portable exports resolve the GLB derivative. Filename/clip heuristics propose the initial state, direction, speed and loop mode (`idle`, `run`, `backward`, `jump`, `fall`, `landing`, common actions), but all proposed metadata remains editable.

Animation-only GLBs do not replace the Main Mesh. Their clips are applied to the Main Mesh skeleton in preview and runtime. Selecting a new motion asset updates an obsolete clip selection automatically; when an explicitly assigned asset contains exactly one generically named take (for example `mixamo.com`), that take is used without requiring the user to rename it.

Every motion slot has explicit **Test this animation slot** and **Stop slot preview** controls, mirrored by the center-toolbar Play and Stop buttons. Stop pauses on the current pose; Play restarts the same `AnimationAction` immediately without rebuilding the Main Mesh or reloading either GLB. The toolbar speed control composes with the slot's authored Playback Rate through `AnimationAction.setEffectiveTimeScale()`. Animation simulation uses its own `THREE.Timer` tick, independent from viewport redraw rate, so a busy editor render loop cannot silently prevent the mixer from advancing. The status line reports the selected clip and the exact number of tracks bound to the Main Mesh skeleton.

Main Mesh exposes both **Normalized character height (m)** and **Uniform world scale**. New humanoid assignments default to `1.9 m` instead of inheriting the generic Asset Browser preview size. Height compensates for FBX/GLB unit differences; world scale is the final authored multiplier shared by the Logic Element viewport, main editor, Play Preview and export.

A motion entry's **Clip** field is a picker over the clip names actually present in whichever GLB it will play from — the entry's own asset, or the Main Mesh when no per-entry asset is assigned — instead of free text to type by hand. It only falls back to a text field when clip names are not yet known for that source (older assets imported before clip capture). This is also why a converted source with no matching clip still shows its mesh in the preview rather than an empty panel: the clip name is a pick list, not a typo-prone guess, and a mesh with no matching clip is data worth seeing, not a reason to hide it.

New imports also capture normalized bone names. Pawn Studio compares each independent Motion source with the Main Mesh and reports compatible, partial, incompatible or unknown skeleton state before gameplay use. Compatible naming variants and exporter namespaces are rebound automatically (`Armature|mixamorig:Hips`, `mixamorig:Hips` and `Hips` resolve to the target bone); genuinely different rigs remain blocked with retargeting diagnostics. Older assets without metadata can be rebuilt from Asset Properties when their FBX source was preserved, or reimported.

When both assets expose skeleton hierarchies, separate Blender/Mixamo clips are retargeted through Three.js `SkeletonUtils.retargetClip`: the source take is sampled against its own armature and rebuilt for the Main Mesh rest pose. The preview reports both bound-track count and animated-track count, so a static take, an incompatible rig and a working moving clip are three distinct results rather than the same misleading “loaded” state.

The r185 preview path follows the official animation lifecycle: it validates and optimizes a prepared `AnimationClip`, owns one `AnimationMixer` for the visible animated root, and uncaches that root before replacing the model. Only a real source `Skeleton`/`SkinnedMesh` enters skeleton retargeting. Scale is estimated from the median of corresponding target/source bone-segment ratios in each armature's local space (armature span is only the fallback), so the Main Mesh outer world scale is not counted twice. The generated hip track is then rebased onto the Main Mesh rest position and orientation: FBX/glTF up-axis rotations are removed, horizontal root motion is made in-place because the Pawn controller owns X/Z movement, and useful vertical motion is retained for jumps and falls. Therefore an independently normalized Mixamo take cannot override Main Mesh height, facing, proportions or authored world scale. If full retargeting is unavailable, the safe fallback discards source bone-position and scale tracks and applies rotations only; it never deforms the target rig with foreign rest-pose transforms. Animated skinned meshes have preview frustum culling disabled and their bounds recomputed when using Frame, preventing limbs or an animation pose from being clipped by stale bind-pose bounds.

Every Motion slot has a persisted **Source orientation** selector. `Y-up` is the default for direct Mixamo FBX imports. `Auto` compares the complete source bind pose with the Main Mesh bind pose; explicit `Z-up → Y-up` (both X rotation signs), `X-up → Y-up` (both Z rotation signs), and `Y-up · turn 180°` presets are available for exporters with non-standard armature transforms. The selected correction is shared by isolated Pawn Studio preview and Play Preview; it is not a preview-only camera adjustment.

**Animation preview scale** defaults to `1×`, meaning that the slot inherits the exact normalized height and uniform world scale of Main Mesh. Its optional per-slot override affects only the isolated Pawn Studio preview, never runtime, Play Preview or export. If there is no assigned Main Mesh and an imported FBX contains its own render mesh, Pawn Studio automatically fits that source preview to the character target height instead of displaying raw FBX centimetre units.

When that standalone FBX mesh is previewed, Pawn Studio removes animation-authored scale tracks and bone-position tracks that would overwrite the bind-pose proportions as soon as Play starts. The fitted outer position, orientation and scale are locked after every mixer update, so the T-pose and animated pose obey the same preview scale. The scale field accepts both decimal point and decimal comma (`0.001` and `0,001`) down to `0.0001×`.

Play Preview keeps a procedural Character fallback visible while the canonical Main Mesh GLB is loading. The fallback is removed only after a renderable asset has been attached. If the canonical build fails, the fallback remains usable and the Logic Element records `characterModelError`; for locally stored FBX assets the editor also attempts the preserved authoring source before declaring failure. This prevents a configured-but-empty asset holder from suppressing both the Main Mesh and the procedural Pawn.

The same recovery rule applies to every Motion slot. Runtime prefers the canonical GLB, but if that derivative is missing or stale and the original FBX is still preserved locally, Play Preview loads the FBX animation source and binds its clips to the Main Mesh. This keeps Pawn Studio and Play Preview consistent without weakening portable exports, which still require the canonical GLB derivative.

Character and Soccer Pawn spatial contents are deliberately minimal: body/rig, collision and Pawn controller only. Camera behavior is Pawn configuration and no longer creates a helper several metres behind the character. Balls, goals, penalty managers, dialogue triggers, weapons and other interactions are separate modular Logic Elements connected through graph nodes/events; they must not enlarge the Character dummy or become implicit Pawn children.

The Logic Element Viewport has its own **Play Isolated** mode. Character and Vehicle Pawns can be driven with WASD/arrows or the on-screen touch pad while the editor world and its normal Play Preview remain stopped. Stop restores the authored root transform, so test movement never becomes an accidental scene edit.

Preview loading is request-ordered: selecting Main Mesh, Overview, Skeleton or a Motion entry starts one tracked preview request, and only the most recently started request is allowed to update the visible model. Clicking through several motion entries quickly — the normal way to review a freshly imported batch — no longer risks an earlier, slower-to-resolve load clearing what a later click just displayed.

## Registering another Pawn category

Plugins can add Animal, Aircraft, Boat or other categories without editing Pawn Studio. Inside a Lot King plugin's `register(api)` use the dedicated extension point:

```js
api.pawnStudioType('animal', {
  label: 'Animal Pawn',
  match: graph => !!graph.animalPawn,
  definition: graph => graph.animalPawn,
  model: graph => graph.animalPawn.model,
  containers: context => [
    { id:'overview', label:'Animal Overview', kind:'overview' },
    {
      id:'movement', label:'Gait', kind:'fields',
      fields:[
        { label:'Walk Speed', path:'movement.walkSpeed', type:'number', min:0, max:20, step:.1 }
      ]
    },
    {
      id:'custom', label:'Species Setup', kind:'custom',
      render(api) {
        api.note('A plugin-owned custom property renderer.');
      }
    }
  ]
});
```

Supported built-in container renderers are `overview`, `model`, `skeleton`, `fields`, `motion-set`, `motion`, `group` and `object`. Any container may provide `render(api)` for a completely category-specific property editor while retaining the shared hierarchy, preview and persistence shell.

Plugins that augment an existing Pawn rather than defining a new Pawn family can register `api.pawnStudioAugment(...)`. Cloth Studio uses this extension point to add its own container without changing the Character or Soccer adapter.

An adapter may also implement `createPlaceholder({ THREE, graph, definition })` and return an `Object3D`. This gives Animal, Aircraft or other plugins their own asset-free preview instead of inheriting a humanoid or vehicle-specific fallback.

The adapter owns only authoring metadata and presentation. Runtime Pawn registration remains independent, so editor plugins do not become runtime dependencies unless their Pawn implementation requires it.
