# LOT KING ENGINE EDITOR v0.5.4

## v0.5.4

### Release Status

- Status: ready.
- Tag target: `v0.5.4`.
- Scope: landing/gameplay/editor split, editor stabilization, gameplay flow, audio flow, playable export, and vehicle physics fixes.

### Highlights

- Added a dedicated landing/menu entrypoint with project signature, version label, GitHub link, and persistent landing music mute control.
- Split the experience into separate pages:
  - `index.html` for the landing/menu.
  - `gameplay.html` for the playable runtime.
  - `engine_editor.html` for the standalone editor.
- Kept `drift-parking-lot.html` as a compatibility redirect to the new landing page.
- Restored the editor page with the complete runtime DOM/HUD/settings/radio structure required by the existing editor modules.
- Improved menu-to-gameplay flow with embedded gameplay transition while keeping the editor as a full standalone page.

### Gameplay and navigation

- Replaced the old `Choose Track` landing action with a clearer `Play Game` flow.
- Added `Quick Play`, `Choose Track`, and back navigation inside the gameplay page.
- Added iframe-based gameplay embedding from the landing page so the landing shell can keep music and transitions alive.
- Added seamless return-to-menu handling from embedded gameplay.
- Updated playable/export runtime references to use `gameplay.html`.

### Editor stabilization

- Moved the editor to `engine_editor.html` as a complete standalone page.
- Ensured the editor loads the active project/level assets before entering the editor.
- Fixed editor close/exit behavior so the standalone editor returns to the landing page instead of the loading overlay.
- Fixed play preview stop behavior so the editor does not fall back into the loading/menu overlay.
- Restored full HUD/settings/radio DOM in the editor page so editor preview controls, overlays, and radio UI work correctly.
- Preserved the created project levels/assets flow so levels created in the editor remain available to gameplay/export.
- Added an explicit drag/drop choice when dropping assets over scene objects: `Put here` or `Replace with <object name>`, preventing accidental replacements.

### Audio and music

- Added landing music on the main menu with a persistent mute button.
- Prevented gameplay embedded inside the landing from starting its own menu music.
- Added fade-out from landing music when launching gameplay, quick play, selected tracks, or entering the editor.
- Kept engine/radio audio behavior separated from landing music.

### Vehicle physics

- Fixed reverse behavior so automatic reverse no longer engages immediately during drift.
- Added explicit reverse gear latch state instead of inferring reverse from local velocity, avoiding false reverse entry while sliding sideways.
- Reverse now enters immediately only when already stopped.
- When braking from movement, reverse requires a sustained braking phase and a near-stop/stabilized vehicle state before engaging.
- Tuned the moving-to-reverse engagement delay down to `0.5s` so reverse remains protected during movement/drift but feels responsive once the car has stopped.
- Restored handbrake behavior to the previous rear-axle drift feel.
- Reworked normal brake behavior so it no longer acts like the handbrake.
- Added progressive brake pressure ramp: braking starts softer and builds over time.
- Tuned service braking to mainly reduce front grip, producing mild front slip/understeer instead of spinning the car.
- Reduced excessive instant braking and refined the service brake to feel longer and more progressive during drift recovery.

### UI polish

- Added styled `Play Game`, `Quick Play`, and back buttons.
- Moved gameplay shortcuts/controls hints to gameplay only.
- Made controls/shortcuts expandable by the user.
- Renamed visible project/editor branding from `LOT KING ENGINE BUILDER` to `LOT KING ENGINE EDITOR`.

### Radio HUD fixes

- Fixed radio player controls double-triggering through overlapping HUD hit layers.
- Fixed pause immediately returning to play after clicking the radio pause button.
- Fixed shuffle toggling itself back off immediately after being enabled.
- Kept shuffle visual state synchronized during HUD updates.

### Playable export

- Reviewed playable ZIP export flow for the new split architecture.
- Playable ZIP now targets the gameplay runtime, not the editor page.
- Fixed playable ZIP level selection so the package includes all levels selected from the export overlay, not only the currently active editor level.
- Stabilized the export level picker with an explicit internal selection state for multi-level exports.
- Added fallback loading for stored level projects during export so selected levels can be pulled from `lotking.level.<id>` when needed.
- Fixed exported gameplay level lists so the playable package shows only the levels intentionally included in the ZIP.
- Fixed playable vehicle audio consistency by making embedded Sound Designer engine sound sets override stale local sound sets with the same id.
- Added an export manifest to the ZIP with included levels, active level, runtime files, asset files, and warnings.
- Added an editor-only exclusion guard so editor scripts/styles/pages are not accidentally packaged into playable ZIP builds.

### Notes

- Release notes closed for `v0.5.4`.
