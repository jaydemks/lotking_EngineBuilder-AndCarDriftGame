# Blender 5.0+ tools

## Car Wheel GLB Rigger

- `car_wheel_glb_rigger-0.2.1.zip` — preserved previous release.
- `car_wheel_glb_rigger-0.2.2/` — complete editable source, README, manifest
  and GPL license.
- `car_wheel_glb_rigger-0.2.2.zip` — installable Blender Extension package,
  built and validated with Blender 5.0.1.
- `car_wheel_glb_rigger-0.3.0/` — guided Normal/Sketchbook car, airplane and
  helicopter source, manifest, documentation and GPL license.
- `car_wheel_glb_rigger-0.3.0.zip` — current installable package.

Install `0.3.0` from `Edit > Preferences > Extensions > Install from Disk`.
The source and package are distributed under GPL-3.0-or-later; models exported
through the add-on do not become GPL merely because the tool processed them.

## Lot King Live Link

- `lotking_live_link-0.1.0/` — editable Blender 5.0+ add-on source.
- `lotking_live_link-0.1.9.zip` — current installable Blender Extension package.

Live Link is experimental. It mirrors scene transforms and explicitly transferred GLB assets between
the open Lot King level and Blender through an authenticated localhost WebSocket.
The Lot King project remains the persistent source of truth, so saving a `.blend`
file is optional. See `docs/BLENDER_LIVE_LINK.md` for setup, identity, conflict
and security details.
