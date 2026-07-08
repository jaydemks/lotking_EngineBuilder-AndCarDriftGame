# Published: 2026-07-08 23:18:07 +0200 (tag v0.6.2)

## v0.6.2 - Cinema Studio, timeline cinematics and browser-only scene sequencing

### Release Status

- Status: released.
- Tag target: `v0.6.2`.
- Scope: Cinema Studio authoring, scene camera cuts, timeline preview, timeline-triggered gameplay events, cinematic runtime triggers, asset integration, and editor workflow hardening after `v0.6.1`.

### Headline

`v0.6.2` turns Cinema Studio into a real browser-only cinematic authoring system inside the Engine Editor. Designers can create scene cameras, build camera-cut timelines, preview footage in-editor, animate objects and camera lens FOV, trigger timelines from gameplay Collision Boxes, and emit timeline events without leaving the browser or relying on external render/export tooling.

### Added

- Added `Cinema Studio` scene assets as timeline/director objects that can be created, selected, duplicated, placed from Assets, and stored per level/project.
- Added browser-only Cinema Studio timeline UI with separate rows for:
  - Time ruler and shared playhead.
  - Camera Cuts.
  - Markers.
  - Object Keys.
  - Lens Keys.
  - Events.
- Added Scene Camera binding for camera cuts. Timeline clips use real Scene Camera objects created in the scene, not private timeline-only cameras.
- Added camera cut authoring:
  - Add shot at playhead.
  - Insert cut at playhead.
  - Append cut after the last cut.
  - Rename, duplicate and delete cuts.
  - Move cuts by dragging.
  - Trim cut start/end from the clip edges.
  - Edit start, duration and end numerically.
  - Change the bound camera after creation.
  - Select, look through, or replace the bound camera from the cut details panel.
- Added timeline marker authoring with name, time and note fields.
- Added Object Key tracks for animating selected scene objects or cameras through timeline keyframes.
- Added Lens Key tracks for animating Scene Camera FOV over time.
- Added timeline Event Track with event name, time and payload fields.
- Added independent sub-lanes for object/camera key tracks so multiple animated targets no longer stack on the same visual row.
- Added selectable and draggable timeline markers.
- Added contextual timeline keyboard handling:
  - Space toggles timeline play/pause when the timeline is focused.
  - Delete/Backspace removes the selected timeline item instead of the selected scene object.
- Added outbound timeline event dispatch during playback:
  - Event name: `lotking:timelineevent`.
  - Payload exposed through `CustomEvent.detail`.
  - Includes studio id/name, event id/name, timeline time, payload, runtime flag and source.
- Added Collision Box -> Cinema Studio runtime trigger flow for Play Preview. Collision Boxes can start timelines configured with `Trigger = Runtime event`.
- Added internal Cinema Studio play/stop/runtime API so timelines can be started from editor UI, Play Preview, or gameplay/editor events.
- Added floating timeline preview rendered inside the existing WebGL canvas, with selectable aspect ratio.
- Added `Final / Normal` preview mode for Cinema Studio:
  - `Final` hides editor-only helpers, dummies, collider previews, gizmos and camera helper meshes.
  - `Normal` keeps editor helper visibility for authoring.
- Added viewport HUD for active Cinema Studio shot/camera/time while previewing.
- Added zoom/pan controls for the timeline:
  - Zoom out.
  - Zoom in.
  - Reset zoom.
  - Ctrl/Cmd wheel zoom.
  - Shift/horizontal wheel pan.
- Added direct playhead dragging, ruler click scrubbing, and timeline body deselection.
- Added timeline validation for missing cameras, missing targets, invalid FOV values, zero/invalid durations, out-of-range keys/events, gaps, overlaps and duplicate ids.
- Added `cinemaProps.version = 2` schema normalization with legacy `movieTrack` migration into `cameraCuts`.
- Added persistent `cameraCuts`, `objectTracks`, `lensTracks`, `eventTracks`, and `markers` schema support in scene-store normalization and editor defaults.
- Added undo/redo coverage for the base timeline workflow: add/edit/delete/duplicate, camera binding, cut trim/move, key move, lens key edits, event edits and marker edits.
- Added `roadmap_tmp.md` as a temporary implementation roadmap for Cinema Studio status tracking.
- Added `HOW_TO_START.md` as a focused startup guide for local server, LAN, WSL2, firewall and browser-storage/origin notes.

### Improved

- Improved Cinema Studio to stay fully browser-only for authoring, preview and playback. Export/video render tooling remains intentionally out of scope for this release.
- Improved Assets integration so Cinema Studio timelines behave like reusable scene assets instead of hidden editor-only state.
- Improved Scene Camera workflow with `Align to view`, `Look through`, and timeline-bound camera commands.
- Improved Camera Cut and keyframe organization so camera cuts, markers, object keys, camera parameter/FOV keys and events are visually separated instead of overlapping in one lane.
- Improved timeline detail editing by moving cut/key/marker/event-specific editing into the timeline details panel instead of relying only on the Cinema Studio object inspector.
- Improved Play Preview behavior so Cinema Studio camera cuts can drive the gameplay preview camera when started from runtime triggers.
- Improved final gameplay rendering so helper-only/editor-only/non-exportable objects are temporarily hidden during the gameplay camera render and restored immediately after.
- Improved floating Cinema Studio preview layering so it appears above quad-view split handles and editor dividers.
- Improved Play Preview cursor behavior:
  - Runtime camera look hides the cursor.
  - In-game overlays restore a usable cursor automatically.
  - `Shift + F1` toggles cursor visibility only during editor Play Preview.
- Improved Play Preview wheel behavior so scrolling over editor/timeline/overlay UI scrolls that UI instead of zooming the gameplay camera.
- Improved timeline feedback with selected, invalid, warning and dragging states for cuts and key/event markers.
- Improved camera preview clarity with floating preview framing and active-shot HUD metadata.
- Improved timeline rendering performance by avoiding unnecessary DOM rebuilds when the timeline signature has not changed.
- Improved save normalization so Cinema Studio props are normalized when collected for persistence.
- Improved roadmap tracking so completed Cinema Studio items are marked explicitly instead of remaining as stale TODOs.
- Improved player car spawn/direction handling so `Direction = 0` is the canonical forward heading used by editor, save/load, physics sync and Play Preview.
- Improved player car inspector editing so manual Position/Direction field changes update the scene player, spawn data, physics state and helper refresh path directly.
- Improved README tone and structure to be shorter, more project-authored, and less like generated long-form documentation while keeping the AI-assisted development note transparent.
- Improved local startup documentation by keeping the README quick and moving detailed server/LAN/WSL2 guidance into `HOW_TO_START.md`.
- Improved architecture/runtime docs to describe the current Cinema Studio runtime trigger flow, timeline data model and canonical player spawn heading.

### Fixed

- Fixed a `validation is not defined` runtime error in Cinema Studio timeline sync that could spam the console and prevent keyframes from appearing.
- Fixed Cinema Studio camera cuts being too shallow to edit as real timeline clips; cuts can now be moved, trimmed, selected, rebound and inspected.
- Fixed the timeline using camera choices that were not clearly tied to actual scene cameras.
- Fixed timeline object/camera key tracks overlapping visually when multiple cameras or targets were added.
- Fixed secondary timeline-bound cameras not evaluating reliably after being added to the sequence.
- Fixed timeline-bound cameras and objects becoming effectively locked while trying to move them with the editor gizmo.
- Fixed missing/invalid camera references being hard to spot by adding validation warnings and invalid clip states.
- Fixed marker items being add-only; they can now be selected, inspected and moved.
- Fixed drag operations producing noisy undo histories; continuous drags now commit as one undo operation at drag end.
- Fixed timeline preview ambiguity by adding active shot/camera HUD and a browser-only floating preview.
- Fixed floating timeline preview appearing under quad-view dividers.
- Fixed editor helper/dummy objects appearing in final preview/play output.
- Fixed runtime/editor scroll conflicts during Play Preview.
- Fixed transform virtual-cursor wrapping so continuing a drag at the screen edge no longer reverses the edited object/parameter.
- Fixed Cinema Studio asset duplication/placement gaps so duplicated timelines keep their cinematic properties.
- Fixed schema drift between `movieTrack` and `cameraCuts` by keeping a normalized alias during migration.
- Fixed player car spawning with the wrong reversed heading after save/load or Play Preview reset.
- Fixed player car camera/forward direction drift caused by using visual model orientation as the authoritative spawn heading.
- Fixed `Spawn here` and player save collection so editor saves capture the current player car position and canonical heading reliably.
- Fixed manual Position/Direction edits under player `POSITION / SPAWN` showing changed numbers without moving/rotating the actual player car.
- Fixed numpad Enter / active numeric inputs not always committing before scene save.

### Known Limitations / Follow-up

- Manual browser round-trip save/reload testing is still required before tagging the final release.
- Timeline track controls are still minimal. Lock/mute/visibility per track are planned.
- Event Track emits browser events, but project-specific gameplay listeners still need to be authored on top.
- Blend/continuous camera cut modes are not complete yet. Hard cuts/free placement are the current base.
- FOV camera parameter keys are implemented; near/far, roll, DOF and color grading tracks remain future work.
- Curve modes are available, but there is no full graphical curve/tangent editor yet.
- Context menus for timeline clips/keys/tracks are still future workflow polish.
- Very large timelines still need real browser stress testing before claiming final performance guarantees.

### Testing Checklist

- Create several Scene Cameras and a Cinema Studio.
- Add, insert, append, rename, duplicate, move and trim camera cuts.
- Rebind cuts to different Scene Cameras and use `Look through`.
- Scrub and play the timeline in editor preview and floating preview.
- Toggle `Final / Normal` preview mode and confirm final output hides editor helpers/dummies.
- Add Object Keys, Lens Keys, Markers and Events.
- Select and delete timeline items with Delete/Backspace without deleting the Cinema Studio scene object.
- Listen for timeline events in the browser console:

```js
window.addEventListener('lotking:timelineevent', e => console.log(e.detail));
```

- Configure a Cinema Studio as `runtime-event`, connect a Collision Box with the same event name, and trigger it in Play Preview.
- In Play Preview, confirm helper/dummy/camera helper objects are hidden in final output, overlay UI restores the cursor, and scrolling over UI does not zoom the gameplay camera.
- Save/reload the project and confirm cuts, keys, events, markers, timeline assets and Collision Box triggers survive unchanged.

### Notes

- `v0.6.1` release notes are archived in `docs/releases/v0.6.1.md`.
- Cinema Studio is intended as an in-engine/browser cinematic workflow, not a clone of any external sequencer UI or export pipeline.
