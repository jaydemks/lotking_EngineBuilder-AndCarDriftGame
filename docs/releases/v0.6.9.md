# Release Notes: v0.6.9

## v0.6.9 - Reliable Return-to-Menu Lifecycle

### Release Status

- Status: in development.
- Tag target: `v0.6.9`.
- Scope: stabilize navigation back to the initial 3D landing menu from both Play Game and the embedded engine editor.

### Fixed

#### Critical menu return regression

- Fixed the landing menu remaining stuck in its destination-loading state after returning from a level or from the editor. Menu boot state, progress and readiness are now reset before the 3D menu background is loaded again.
- Added one shared return-to-menu lifecycle for embedded gameplay and editor sessions. Both destinations now notify the parent landing instead of starting a second, competing menu flow inside their own iframe.
- Pause-menu **Back to menu** now returns directly to the main landing when gameplay is embedded, while standalone gameplay keeps its existing internal-menu behavior.
- Exiting the embedded editor now restores the parent landing instead of navigating the editor iframe to a nested `index.html`.
- Editor pause-menu exit is now exclusive: it no longer also invokes the gameplay return path during the same click.
- Added navigation epochs and stale-callback guards so delayed iframe loads or menu-background messages cannot reopen or overwrite a newer destination.
- The previous gameplay/editor iframe is unloaded only after the return transition, and exactly one fresh menu-background load owns the restored landing.
- Updated runtime cache keys so GitHub Pages and other static hosts fetch the corrected navigation code.

### Testing

- Added Playwright regressions for return from embedded Play Game and from the embedded editor.
- Both tests verify that destination classes are cleared, the old iframe is unloaded, a fresh role-menu background is requested and the landing loading overlay completes without a page refresh.
- JavaScript syntax checks pass for the modified editor and runtime modules.

### Known Limitations / Next Steps

- This is a focused stabilization release. Additional fixes discovered before publication can be documented here under the same `v0.6.9` milestone.
- The editor remains experimental; save frequently and validate exported builds on the intended static host.
