# Release Notes: v0.7.2

## Lot King Engine Builder v0.7.2 - Atomic DEMO Loading, Player Input Contexts and Safe Online Saving

### Release status

- Status: released.
- Tag: `v0.7.2`.
- Runtime baseline: Three.js `0.185.1` / revision `185`, Cannon.js `0.6.2`.
- Scope: make hosted projects deterministic on their first load, separate Character and Vehicle controls per Player, and give the read-only online DEMO a safe path into a writable local workspace.

### Highlights

- Rebuilt bundled-DEMO startup as a verified, fail-closed operation. A cold browser can no longer expose a partly hydrated scene and then appear correct only after a refresh.
- Added independent Character and Vehicle input contexts. Each possessed Pawn requests the mapping appropriate to its gameplay instead of sharing one global vehicle-oriented context.
- Fixed configured Player device ownership so Player 1 automatic selection cannot take a gamepad reserved for Player 2 or another configured Player.
- Made the hosted author DEMO explicitly non-persistent while keeping Play Preview and Simulate available.
- Added a guided **Select folder on this PC** handoff. The exact open project becomes a portable local workspace before normal Save and authoring commands are enabled.

### Deterministic first loading

- Portable DEMO assets are hydrated into IndexedDB, audited and retried before the scene or project catalog is exposed.
- Missing required blobs now fail the load instead of silently continuing with whichever models and textures happened to arrive first.
- Menu-background and gameplay scene application share one ordered application lane. A slow menu request can no longer race the active level and leave a mixed old/new scene.
- Published gameplay and menu-role applies use strict scene construction. Failed objects prevent `sceneReady` from advertising an incomplete world.
- JSON-encoded nested asset references are localized together with normal project objects.
- Legacy texture metadata is aligned with the hydrated runtime blob, removing obsolete aliases that could make a complete project look incomplete.
- Legacy cloned built-ins can recover their source through stable authored names when an older numeric source ID no longer matches the current registry.
- Cache versions were advanced across the landing page, editor, gameplay runtime, test entrypoint and lazy editor loader so a hosted update does not mix v0.7.1 scripts with v0.7.2 code.

### Player input and Pawn-specific controls

- Input configuration schema advanced to version 4 with independent `vehicle` and `character` contexts.
- Vehicle Pawns explicitly request the Vehicle mapping; Character and Soccer movement explicitly request the Character mapping.
- Character defaults use the left stick for planar movement, **A** for Jump, **L3** for Sprint and **X** for the primary interaction.
- Vehicle trigger, steering, reset, radio and tuning controls remain isolated from Character actions.
- Per-Player context memory replaces the previous single global active context.
- Configured devices for Players 2–4 are reserved before Player 1 automatic assignment runs.
- Gamepad connection snapshots remain usable during the short browser interval in which a `gamepadconnected` event has fired but `navigator.getGamepads()` has not yet exposed the device.

### Online DEMO and local persistence

- Choosing the author DEMO now stores an explicit `demo` workspace mode that survives startup-template consumption and reloads.
- Play Preview and Simulate recognize that mode and never attempt to save the hosted author project.
- Save remains visible in DEMO mode and opens a focused explanation instead of throwing a read-only or online-write error.
- Stopping Play Preview now releases Free Camera pointer lock before restoring editor controls, so Preview cannot retain the hidden cursor and block Simulate or toolbar interaction.
- On supported Chromium browsers over HTTPS, the user can select a writable local folder without leaving the hosted editor.
- The complete portable project is prepared only after the folder picker receives its required user gesture.
- Workspace manifest, project catalog, active project and versioned project copy are written before the session changes from DEMO to normal folder mode.
- An existing project with the same ID is not overwritten when a DEMO copy is promoted; a distinct workspace project ID is created.
- If a browser cannot persist a File System handle in IndexedDB, the authorized handle remains valid for the current session instead of discarding the requested save.
- Safari and other browsers without direct folder access receive a clear portable-LKEP fallback rather than a broken folder action.

### Documentation and diagnostics

- Updated the main README, technical README, architecture and runtime-module documentation for v0.7.2.
- The landing page and runtime diagnostic reports now identify version `0.7.2`.
- The v0.7.1 video remains labelled accurately as the v0.7.1 preview and links to the immutable historical release notes.

### Verification

- Added input coverage for schema migration, separate Character/Vehicle mappings, Player 1 keyboard plus Player 2 gamepad ownership and delayed gamepad enumeration.
- Added a cold-start browser regression that clears storage and IndexedDB, then verifies every published scene object on the first application without refreshing.
- Cold editor-menu and gameplay loading passed on desktop and mobile Chromium.
- Added browser coverage confirming that DEMO Save shows the local-persistence explanation while Play does not trigger saving.
- Added browser coverage that writes a DEMO session into a simulated folder workspace and verifies the manifest, catalog, active LKEP and project copy before normal Save is re-enabled.

### Known limitations

- Direct writable-folder integration depends on the File System Access API and therefore remains a Chromium/secure-context feature. Portable LKEP export is the cross-browser fallback.
- File and folder permissions can expire between browser sessions; the browser may ask the user to authorize the workspace again.
- Gamepad button labels and axis behavior can still vary between controller hardware, operating systems and browser mappings.
- Character, Soccer and Mixamo workflows remain experimental even though their input ownership is now independent from Vehicle controls.
- Real-project cold loads should still be checked when adding unusually large embedded assets or historical projects with custom metadata.
