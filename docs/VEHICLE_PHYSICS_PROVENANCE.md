# Vehicle Physics Provenance

This audit covers every implementation currently exposed through the Vehicle Physics Backend API.

## Cannon RaycastVehicle

- Backend ID: `cannon-raycast`
- Upstream: Cannon.js 0.6.2
- Repository: `https://github.com/schteppe/cannon.js`
- Primary author: Stefan Hedman and Cannon.js contributors
- License: MIT
- Delivery: cdnjs script referenced by `engine_editor.html` and `gameplay.html`
- Local modifications to Cannon.js: none; Lot King owns only the adapter, per-Pawn configuration and lifecycle integration in `vehicle-pawns.js`.

## Arcade Fallback

- Backend ID: `arcade-fallback`
- Version: `0.6.7-core`
- Author: Lot King project
- License: project license
- Purpose: deterministic reduced locomotion when Cannon or a requested external backend is unavailable.

## External backend requirements

Third-party backends register through `LK_RUNTIME_VEHICLE_PHYSICS_BACKENDS.register`. They must declare a stable ID, implementation version, API version and license. Repository and attribution fields are retained in Logic Element dependency manifests and playable metadata when supplied. A backend factory must return the Raycast-compatible body/vehicle lifecycle contract consumed by `VehiclePawn`, optionally including `dispose(pawn)`.

This file must be updated whenever another physics backend is bundled or extracted.
