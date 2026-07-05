# Lot King Engine Builder v0.5.2 — Input system

## v0.5.2 — Input system (keyboard · gamepad · touch)

### Release Status

- Status: released.
- Tag target: `v0.5.2`.
- Scope: new multi-device input system and focused fixes after the `v0.5.1` refactor release.

### Highlights

- **New layered input system.** Driving no longer reads hardcoded keys: it goes through an
  abstract action layer (`steer / throttle / brake / handbrake / reset`) resolved per player from
  whatever device is assigned. Keyboard input is unchanged in feel; gamepad triggers and the touch
  UI feed the same actions with analog throttle/brake/steering.
- **Gamepad support.** Connected controllers are detected live (`gamepadconnected`), listed in the
  in-game Controls menu and assigned to players. Standard-mapping pads work out of the box
  (left stick steer, RT/LT throttle & brake, A handbrake).
- **Two-player ready.** Player 1 and Player 2 slots each resolve to a device based on availability
  (e.g. P1 keyboard, P2 gamepad). The player blueprint keeps only its lightweight `controllerIndex`;
  device assignment and bindings are a project/session concern, not baked into the car.
- **Mobile touch controls.** On coarse-pointer devices (or via the Controls menu) an on-screen
  steering pad plus gas / brake / e-brake buttons appear and drive the car.
- **In-game remapping.** From `ESC → Controlli` the player can see connected devices, pick a device
  per player, toggle touch, and rebind keyboard/gamepad actions. Remaps persist locally and are
  always clamped to what the project allows.
- **Editor project controls.** In `⚙ Settings → Controls` the creator chooses which device families
  a project/level supports (keyboard / gamepad / touch), the default device per player and the
  default bindings. This is stored per-project in `meta.input` (LKEP) and applied at play time and
  in Preview.

### Context-aware, instance-aware model (v2)

- **Input contexts** (à la Unreal Input Mapping Contexts): bindings live inside a named context
  (`vehicle` today) so a level/playable can later add other pawns (e.g. `aircraft`) with their own
  action set. The schema is future-proofed for this now.
- **Device instances**: keyboard and gamepad can be split into numbered instances (Keyboard 1/2,
  Gamepad 1/2) with their own bindings for local co-op; touch stays single-instance. The default is
  **keyboard for every player**; you then assign another instance to Player 2.
- **Shared scheme + per-instance override**: instances of a type share one base scheme by default;
  splitting only stores the differences (instance override), so most config stays identical across
  players — only the player id and device id change.
- **Xbox out of the box**: standard-mapping pads (Xbox, DualShock, most controllers) are read with the
  canonical layout, same as Steam; a `mapping === 'standard'` check keeps non-standard pads sane.

### Visual mapping + floating windows

- New **window manager** (`js/runtime/ui/window-manager.js`): centered, draggable, resizable overlays
  with gentle magnetic snapping (viewport + window-to-window), z-ordering and persisted geometry. It can
  also `attach` to an existing panel — the editor Settings overlay is now a centered, movable window.
- New **Mapping overlay** (`js/runtime/input/mapping-overlay.js` + `device-visuals.js`): a visual
  key/button mapper opened from a **Mapping** button in both the editor Settings and the in-game
  Controls menu. It shows schematic **keyboard / gamepad / touch** diagrams, paints which action is on
  each control, **lights inputs live** as you press them, warns on **conflicts**, and rebinds by
  "click an action or a control → press the input". The same overlay serves editor (edits the project)
  and game (edits the player override).

### Responsive HUD, camera frame & mobile

- **Framed HUD**: the game HUD (score, speedo, legend) and the Radio panel are now confined to the
  player-camera's actual rendered rectangle, so nothing spills outside a letterboxed / cropped frame
  (correct in real play and in editor Preview, WebGL→CSS coordinates handled).
- **Letterbox colour**: the area outside the camera frame is a configurable dark grey (default
  `#141518`) instead of the sky — editable from the camera inspector and from editor Settings → Viewport,
  saved per level.
- **Auto device detection**: Player 1 auto-follows the last device actually used (keyboard ↔ gamepad ↔
  touch); toggleable, on by default.
- **Touch modes**: touch UI has an Off / On / Auto setting (editor + in-game). Auto shows it on phones
  (both orientations, detected via UA / coarse pointer) and on portrait frames; the controls legend
  auto-hides in portrait. The user choice always wins.

### Architecture

- Runtime modules under `js/runtime/input/`:
  `input-actions.js` (context/instance schema, migration, effective-scheme + conflict logic, drive
  resolution — pure), `input-devices.js` (keyboard / gamepad / touch raw sources),
  `input-manager.js` (device registry, instances, player slots, assignment, override persistence →
  `GAME.input`), `device-visuals.js` (device diagrams), `mapping-overlay.js` (visual mapper),
  `touch-controls.js` (on-screen touch UI), `input-menu.js` (in-game Controls tab). Plus
  `js/runtime/ui/window-manager.js` (floating windows).
- Editor module `js/editor/input-settings.js` edits the per-project config (`meta.input`), round-tripped
  through `project-io.js`; the editor ignores the player override so authoring shows the pure project.

### Notes

- Previous cumulative history and the `v0.5.1` refactor release are archived in `docs/releases/v0.5.1.md`.
- The earlier Git-ready beta release note is in `docs/releases/v0.5.0-beta.md`.
