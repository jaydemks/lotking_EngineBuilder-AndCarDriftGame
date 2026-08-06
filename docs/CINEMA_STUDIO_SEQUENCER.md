# Cinema Studio Sequencer

Cinema Studio sequences are stored with the level and can also be saved as
reusable `.lkcinema.json` assets. A sequence asset contains timing and track
data, never copies or overwrites scene objects.

## Duration and output

Set the complete duration directly in the Sequencer header. The accepted range
is 0.1 seconds to 24 hours. Shortening a sequence clamps cuts, transform/lens
keys, markers and events to the new end time.

`Render video` produces a normal frame-accurate WebM. It is suitable for a
player, social media or editing software, but it cannot remain interactive.

`Web player ZIP` exports the current project/level and its Three.js runtime. Use
this when the result must run on a site with live 3D, input, UI, camera cuts and
gameplay. Set the Cinema Studio trigger to `On Preview/Simulate` when that
sequence should start automatically in the exported player; use a runtime event
when gameplay or Logic should start it.

## Reusable sequences and bindings

`Save sequence` downloads all cuts, tracks, markers, events, temporal curves and
spatial paths. `Load sequence` replaces only the active Cinema Studio sequence
and creates an undo step.

Bindings are restored in this order:

1. The original scene object or camera ID.
2. One unique object with the same author name and compatible type.
3. An explicit missing binding that the author can reassign in track details.

Select an object/lens track or one of its keys to change `Target binding` or
`Camera binding`. Camera cuts retain their existing camera selector.

## Time curves and spatial paths

The two controls solve different problems:

- `Time curve` controls speed along a segment: linear, ease-in, ease-out or
  ease-in/out.
- `Spatial path` controls the shape travelled in 3D: linear segments, smooth
  automatic spline or editable Bezier.

For editable Bezier motion, select a transform key in the timeline. Blue dummies
are keyed positions; magenta dummies are incoming/outgoing tangents. Click a
dummy in the viewport and move it with the translate gizmo. `Automatic` derives
smooth tangents, `Aligned handles` preserves a continuous direction, and
`Broken handles` allows independent incoming/outgoing shapes.

Motion-path geometry is placed in the Editor helper layer with `editorOnly` and
`nonExportable` flags. It does not become scene content and does not ship in the
interactive player.

## Movement presets

Choose an animated target in the Sequencer header. The movement bar switches
automatically between `Camera motion` and `Object motion`, so camera moves are
not offered to ordinary objects and vice versa. Set `Motion` to the desired
number of seconds, `Distance` to the approximate travel in scene units, and
apply a preset at the current playhead.

Camera presets include dolly, curved sweep, crane and dive-then-level moves.
Object presets include smooth forward travel, left/right curve-then-straight,
arc, dive-then-straight and rise-then-straight moves. A preset creates normal
transform keys on an editable Bezier track; it is a starting shape, not a baked
animation. The sequence duration expands when the move runs past its previous
end, and only keys inside the preset time range are replaced. Undo restores the
previous track.

After applying a preset, drag the blue position dummies and magenta tangent
handles in the viewport. Move keys horizontally in the timeline to decide how
long each part of the motion lasts. This allows, for example, a slow curved dive
followed by a longer straight segment without confusing spatial shape with
time easing.

For a track made manually, select its target and press `Edit path`. Cinema
Studio converts the track to editable Bezier motion, makes the path visible and
opens the key nearest the playhead; no preset is required.
