# Car Wheel GLB Rigger

Version: `0.2.2`

GPL-3.0-or-later Blender extension for preparing a car body, road wheels, brake
discs, brake calipers, and an optional interior steering wheel for GLB export
workflows, especially Lot King Engine and three.js.

## 0.2.2

- Detects an interior steering-wheel mesh from common names, or accepts an
  explicitly assigned object.
- Generates the stable
  `steering_wheel_pivot > steering_wheel_mesh` hierarchy consumed by Lot King.
- Exports local rotation axis, left/right direction, driver side, physical
  lock-to-lock range and shortened visible animation range as glTF extras.
- Defaults to a common 900° input range and a shorter 540° visible animation.
  Both accept up to 2160° for future steering-wheel controllers.
- Exports custom properties with `export_extras=True`.
- Bakes generated pivot positions into real local transforms instead of
  `matrix_parent_inverse`, so steering and wheels rotate around their own
  exported centres rather than the vehicle origin.
- Safely rebuilds a hierarchy created by an earlier 0.2.2 package while
  preserving authored meshes and attachments in world space.
- Includes the complete GPL v3 license required for public redistribution.

## Install

Install the generated ZIP from Blender. The `0.2.2` ZIP is stored alongside
this source folder in `tools/blender 5.0+/`.

1. Open Blender.
2. Go to `Edit > Preferences > Extensions`.
3. Choose `Install from Disk...`.
4. Select `car_wheel_glb_rigger-0.2.2.zip`.
5. Enable `Car Wheel GLB Rigger`.

The panel appears in `View3D > Sidebar (N) > Car Rig`.

## Uninstall

Remove it from Blender like a regular extension:

1. Open `Edit > Preferences > Extensions`.
2. Search for `Car Wheel GLB Rigger`.
3. Open the add-on options menu.
4. Choose `Uninstall`.

If Blender does not show its own uninstall command, expand the add-on preferences and use `Uninstall This Add-on`. The fallback button `Open Install Folder` shows exactly where Blender installed the files.

## Generated hierarchy

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

Front wheels get steering pivots. Wheels and brake discs are parented to spin nodes. Brake calipers do not spin: front calipers follow steering, rear calipers stay fixed under the car root.

The cockpit steering wheel is optional. If its slot is empty, the add-on can
detect names such as `steering_wheel`, `SteeringWheel`, `steer_wheel`, or
`volante`. By default the pivot preserves the steering object's authored
origin and local orientation exactly. `Geometry bounds centre` remains
available for unprepared meshes; neither mode moves the visible geometry.

## Steering convention

Lot King uses normalized steering where positive means a left turn. The common
mapping rotates the cockpit wheel around negative local Z. If a model was
authored with a different axle, choose Local X/Y/Z and Normal/Inverted before
building.

- **Input Lock-to-lock** describes the physical controller range. It does not
  reduce steering precision and is reserved for future 900°/1080°/2160° wheel
  input.
- **Visible Lock-to-lock** is the shorter cockpit animation. A 540° default
  keeps the motion believable without forcing the mesh through several full
  revolutions.
- **Driver Side** can be Left, Right, or inferred from the steering-wheel
  distance to the wheels already assigned as Left/Right, without assuming a
  particular vehicle forward axis.

All of these values are defaults only. Lot King's native Player Car and Vehicle
Logic Element Inspector can override pivot name, mesh name, driver side, local
axis, direction, input range, and visible range per vehicle.

## License

Copyright 2026 CodesAndTips.

The extension is free and open source under GNU GPL v3 or later. Distributions
and modified versions must keep the source available under the GPL and include
`LICENSE.txt`. Models and other artwork exported with the extension are not
covered by the extension's GPL merely because this tool processed them.
