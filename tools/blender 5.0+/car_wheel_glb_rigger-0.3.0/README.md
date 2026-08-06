# Lot King Vehicle GLB Rigger

Version: `0.3.0`

GPL-3.0-or-later Blender extension for preparing cars, airplanes and
helicopters for Lot King Engine GLB workflows. The panel has two explicit
profiles: **Normal** preserves the engine's native hierarchy, while
**Sketchbook** writes the exact glTF extras consumed by the DollBody vehicle
runtime.

## 0.3.0

- Adds a guided `Normal / Sketchbook` profile switch and `Car / Airplane /
  Helicopter` vehicle selector.
- Preserves the complete 0.2.2 Normal car workflow: four wheels, discs,
  calipers, steering pivots and cockpit steering-wheel metadata.
- Adds airplane propeller, left/right aileron, elevator, rudder and optional
  three-wheel landing-gear assignments.
- Adds helicopter main-rotor and optional tail-rotor assignments.
- Adds optional driver/passenger seats, doors, entry markers and collision
  marker sections shared by every vehicle type.
- Sketchbook exports the runtime contract through glTF extras:
  `data=wheel|rotor|aileron|elevator|rudder|seat|collision`, plus steering,
  side, seat type, door, entry, connected-seat and local-axis metadata.
- Moving parts are wrapped at their authored origins. Put each Blender object
  origin on its physical shaft or hinge before Build; the visible mesh does
  not move.
- Build/Rebuild removes only generated pivots and keeps authored meshes and
  markers in world space.

## Install

1. Open Blender 5.0 or newer.
2. Go to `Edit > Preferences > Extensions`.
3. Choose `Install from Disk...`.
4. Select `car_wheel_glb_rigger-0.3.0.zip`.
5. Enable `Lot King Vehicle GLB Rigger`.

The panel appears in `View3D > Sidebar (N) > Vehicle Rig`.

## Guided workflow

1. Choose `Normal` or `Sketchbook`.
2. Choose `Car`, `Airplane`, or `Helicopter`.
3. Select an authored object, then use `Use Selected` beside its semantic
   slot. At minimum assign Body and the required wheels, propeller or main
   rotor.
4. For moving aircraft parts, place each object origin on the real hinge or
   shaft. Keep `Auto` axis when the mesh is clearly disc/plate-shaped; choose a
   local X/Y/Z override for ambiguous geometry.
5. Optionally assign seats, doors, entry points, and a box/sphere collision
   marker. These become functional metadata in the Sketchbook profile.
6. Build/Rebuild and Export GLB. glTF extras are enabled automatically.

`Normal` aircraft output deliberately provides a stable hierarchy and native
`lkRigRole` metadata. `Sketchbook` output additionally provides the current
runtime's `data` contract and can be used immediately by Sketchbook-compatible
Logic Elements.

## Normal car hierarchy

```text
Car
+ Body
+ Wheel_FL_steer
  + Wheel_FL_spin
    + Wheel_FL_mesh
    + BrakeDisc_FL_mesh
  + BrakeCaliper_FL_mesh
+ Wheel_FR_steer
  + Wheel_FR_spin
    + Wheel_FR_mesh
    + BrakeDisc_FR_mesh
  + BrakeCaliper_FR_mesh
+ Wheel_RL_spin
  + Wheel_RL_mesh
  + BrakeDisc_RL_mesh
+ BrakeCaliper_RL_mesh
+ Wheel_RR_spin
  + Wheel_RR_mesh
  + BrakeDisc_RR_mesh
+ BrakeCaliper_RR_mesh
+ steering_wheel_pivot
  + steering_wheel_mesh
```

Front wheels get steering pivots. Wheels and brake discs are parented to spin
nodes. Brake calipers do not spin. The optional cockpit steering wheel retains
axis, direction, driver-side, 900° input and independently shortened visible
range metadata from 0.2.2.

## Sketchbook metadata contract

The add-on does not rely on object-name guesses. It exports semantic extras on
the actual moving pivot/marker:

- wheels: `data=wheel`, `steering`, `drive`;
- propellers and rotors: `data=rotor`, optional local `axis`;
- surfaces: `data=aileron|elevator|rudder`, `side`, optional local `axis`;
- seats: `data=seat`, `seat_type`, `door_object`, `entry_points`,
  `connected_seats`;
- colliders: `data=collision`, `shape`.

The runtime measures a rotor's thinnest local geometry axis and a surface's
longest local axis when Auto is selected. Explicit X/Y/Z remains available for
ambiguous meshes.

## Rebuild and uninstall

Rebuild recognizes only add-on-generated roots/pivots, detaches authored
objects while preserving world transforms, then replaces the generated
hierarchy. It is safe to refine origins and assignments and build again.

Uninstall through Blender Extensions. The add-on preferences also provide
`Uninstall This Add-on` and `Open Install Folder` fallbacks.

## License

Copyright 2026 CodesAndTips.

The extension is free and open source under GNU GPL v3 or later. Distributions
and modified versions must keep the source available under the GPL and include
`LICENSE.txt`. Models and artwork exported with the extension are not covered
by the extension's GPL merely because this tool processed them.
