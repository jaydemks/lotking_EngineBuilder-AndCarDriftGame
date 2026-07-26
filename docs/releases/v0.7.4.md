# Release Notes: v0.7.4

## Lot King Engine Builder v0.7.4 - Browser Storage Control and Recovery

### Release status

- Status: released.
- Tag: `v0.7.4`.
- Three.js baseline: pinned local r185 compatibility bundle.

### Browser Storage Manager

- Added a dedicated Storage section under Editor Settings.
- The editor now inventories Lot King LocalStorage and SessionStorage entries individually.
- Known IndexedDB stores expose imported asset blobs and local workspace handles with item counts and approximate sizes.
- Explicit Lot King Cache Storage entries and named same-origin service workers can be inspected separately.
- Storage API quota, current origin usage and persistent-storage status are shown in the same interface.
- Known project and level records receive readable labels while their exact storage keys remain visible.
- A Cleanup Assistant classifies entries as active, valid saved data, current preferences/system data, review candidates or rebuildable temporary/cache data.
- Active and catalogued projects/levels are derived from the real project marker and project/level indexes instead of guessing from key names.
- Embedded `savedAt`, `updatedAt` and `createdAt` values provide the most reliable available date; missing dates are labelled honestly because Web Storage has no native modification timestamp.
- The interface explains that suffixes such as `.v1` and `.v2` identify a data schema, not chronological duplicate files.
- Filters separate active/valid data, review candidates and rebuildable entries.

### Diagnostics and recovery

- Project and level catalogs are checked for entries whose saved data is missing.
- Saved project and level records that are no longer present in their catalog are reported without being removed.
- Imported asset references are compared with the IndexedDB blob store to report missing binary data.
- Apparently unreferenced asset blobs are reported as a cautious heuristic because plugins or unopened exports may still need them.
- The current project can be exported directly from the Storage panel before maintenance.
- Lot King LocalStorage can be downloaded as a versioned JSON backup and restored by merging only owned keys.
- A metadata-only inventory report can be downloaded for troubleshooting without exposing stored project contents.
- Persistent browser storage can be requested where the browser supports it.

### Protected granular cleanup

- Cleanup works per key, IndexedDB store, explicit cache or service-worker registration instead of clearing the entire browser origin.
- Only `lotking.*` and `lk.*` web-storage keys are considered owned by the editor.
- Unrelated LocalStorage and SessionStorage entries remain hidden and untouched.
- Cache names and service-worker scripts require an explicit Lot King identity before they are listed.
- The assisted safe selection includes only temporary SessionStorage and explicit rebuildable caches; current preferences are no longer presented as generic cleanup candidates.
- A separate review selection collects out-of-catalog records and heuristic orphan candidates without deleting them automatically.
- Deleting projects, levels or imported assets requires both a backup acknowledgement and typing `DELETE`.
- After cleanup or restore, the editor recommends an immediate reload so an older in-memory snapshot cannot be written back.

### Editor interface

- Storage opens in a larger settings workspace with responsive summary cards, diagnostics, risk labels and a modern scrollbar.
- The movable Settings panel is constrained back inside the browser viewport when the larger Storage tab opens.
- English and Italian labels are available through the existing editor-language setting.
- Cache identities for the landing page, gameplay, editor and lazy editor loader identify v0.7.4.

### Documentation

- The main README now links to the v0.7.4 notes and mentions browser-storage maintenance among the editor capabilities.
- The technical README explains the storage ownership boundary, recovery tools and difference between LocalStorage backups and portable LKEP exports.
- Architecture and runtime-module documentation include the new isolated storage-manager module.

### Verification

- A focused Chromium end-to-end regression verifies the complete Editor Settings integration.
- The regression distinguishes an active project, another valid saved project and an out-of-catalog review candidate, then verifies the review filter.
- The regression confirms that high-impact project cleanup exposes the stronger safeguards.
- It deletes a selected low-risk Lot King entry and verifies that an unrelated origin key and protected project record survive unchanged.
- Static diff checks confirm clean cache/version references and documentation formatting.

### Browser limitation

- A normal web page cannot enumerate or selectively delete the browser's opaque HTTP cache.
- The Storage panel therefore manages only explicit web-platform storage owned by Lot King and explains when a hard reload or browser site-data controls are required.
- LocalStorage backup does not contain IndexedDB asset blobs. Portable LKEP project export remains the correct backup when imported assets must travel with the project.
