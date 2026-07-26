# Release Notes: v0.7.3

## Lot King Engine Builder v0.7.3 - Private Browser DEMO Workspaces

### Release status

- Status: released.
- Tag: `v0.7.3`.
- Three.js baseline: pinned local r185 compatibility bundle.

### Private hosted DEMO

- The hosted Author DEMO is no longer a read-only editor session.
- Opening it creates a private writable copy for the current browser profile.
- Normal editing, asset import, project and level management, Save, Play Preview, Simulate and portable export remain available.
- Project metadata and levels persist through LocalStorage; large imported assets continue to use IndexedDB.
- Reloading the page reopens the visitor's saved copy instead of reinstalling the shared GitHub snapshot.
- Existing v0.7.2 `mode: demo` browser state migrates automatically to the new private workspace.

### Isolation and publishing safety

- Browser storage remains isolated by origin and browser profile, so visitors do not share projects or overwrite one another.
- Hosted saves never write to the repository, GitHub Pages or another server-side project.
- `Publish as Author DEMO` is hidden and rejected outside the local author installation.
- Opening the Author DEMO again explicitly creates a fresh private project copy while preserving other browser projects.

### Optional local files

- Selecting a writable folder remains available as an optional portable mirror.
- LKEP import/export continues to support browsers without direct folder APIs.
- Moving to a linked folder preserves the exact current DEMO state before normal mirrored saves continue.

### Loading correctness

- The landing menu-preview iframe no longer changes the user's workspace mode while it loads the 3D background.
- An explicitly requested bundled DEMO resets only the origin-scoped level snapshot before installation; private browser project records remain independent.
- Cache identities, runtime diagnostics, landing text and package metadata identify v0.7.3.

### Verification

- Syntax and persistence checks cover legacy DEMO migration, writable browser saving, reload recovery, Play/Simulate availability and optional folder mirroring.
- The existing atomic first-load, macOS compatibility, input-context and export regression coverage remains part of the release suite.

### Known limitations

- Clearing site data or using a different browser/profile removes access to that browser's private copy unless an LKEP or folder mirror was created.
- Browser storage quotas vary by browser and device; persistent-storage requests reduce eviction risk but cannot override browser policy.
- Private workspaces are device-local. P2P snapshot exchange is explicit and does not silently synchronize them.
