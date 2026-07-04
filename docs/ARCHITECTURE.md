# LOT KING Architecture

## Current layout

- `drift-parking-lot.html` contains the DOM structure and external script/style links.
- `css/lot-king.css` contains HUD, radio, setup, and menu styling.
- `js/lot-king.js` contains the runtime: world creation, physics, loading, audio, UI wiring, and loop.
- `models/`, `musics/`, and `media/` are loaded with relative paths from the local server.

## Runtime bridge

`js/lot-king.js` exposes a small editor-ready bridge at `window.LOT_KING`.

Useful entry points:

- `LOT_KING.core.scene`
- `LOT_KING.core.camera`
- `LOT_KING.core.renderer`
- `LOT_KING.player.car`
- `LOT_KING.player.physics`
- `LOT_KING.player.config`
- `LOT_KING.world.colliders`
- `LOT_KING.world.entities`
- `LOT_KING.systems.audio`
- `LOT_KING.systems.radio`
- `LOT_KING.settings.toggleAudio()`
- `LOT_KING.settings.toggleTuning()`

## Engine editor

The 3D engine editor lives outside the runtime loop and talks to the game only
through `window.LOT_KING` and `window.LK_STORE`:

- `js/editor/editor.js` — editor UI: free camera (orbit + RMB fly), selection,
  transform gizmo (move/rotate/scale, world/local, grid snap), outliner with
  thumbnails (grid/list, search, filters), inspector, right-click context menus,
  add primitives/lights/effects/GLB, player blueprint, player-camera frustum
  helper and picture-in-picture preview.
- `js/engine/scene-store.js` — scene serialization (localStorage key
  `lotking.scene.v1`) plus the shared factories (primitives, lights, sprite
  emitters, GLB import). It self-applies the saved scene at boot, so editor
  changes show up in the game.
- Level library (`LK_STORE.levels`): multiple levels stored as LKEP projects
  under `lotking.level.<id>` with the index in `lotking.levels.v1`;
  `lotking.scene.v1` stays the "active level" slot the runtime applies at boot.
  The editor manages levels (new/load/save-as/rename/duplicate/delete/import,
  toolbar `🗀 Levels` overlay + Ctrl+O / Ctrl+Shift+S / Ctrl+Alt+N) and lists
  them in the Assets tab; the game level select is fed from the same library
  (`GAME.levels.setTracks`). Switching level reloads the page: sessionStorage
  `lk.reopenEditor` re-enters the editor, `lk.autolaunch` re-launches a track
  picked from the menu when the scene diff was already applied.
- `css/editor.css` — editor panels styling.

Runtime bridge additions in `js/lot-king.js`:

- `LOT_KING.world.registry` / `register()` / `unregister()` — every editable
  entity is tagged with a stable `editorId` (world layout is seeded, so ids are
  deterministic across reloads).
- `LOT_KING.hooks.frameOverride` — the editor takes over the frame loop;
  `LOT_KING.hooks.frame` — per-frame hooks (effect emitters) run in both loops.
- `LOT_KING.player.cameraCfg` + `applyCameraCfg()` — FOV, draw distance, fog,
  shake and DOF (BokehPass via the post-processing scripts).
- `LOT_KING.player.spawn`, `setModel()`, `setTuning()`, `headlight()`.
- `LOT_KING.state.editorActive` guards game input while editing.

Entry points: the ⚙ ENGINE EDITOR button in the start menu, or F1 anywhere.
`test-editor.html` is a two-phase headless smoke test (edit+save, reload,
verify the scene is re-applied).
