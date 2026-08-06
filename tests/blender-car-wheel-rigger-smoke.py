"""Headless Blender smoke test for Lot King Vehicle GLB Rigger 0.3.0."""

import importlib.util
import json
import math
from pathlib import Path
import tempfile

import bpy
from mathutils import Matrix, Vector


REPO = Path(__file__).resolve().parents[1]
ADDON_DIR = REPO / "tools" / "blender 5.0+" / "car_wheel_glb_rigger-0.3.0"
SPEC = importlib.util.spec_from_file_location(
    "car_wheel_glb_rigger",
    ADDON_DIR / "__init__.py",
    submodule_search_locations=[str(ADDON_DIR)],
)
ADDON = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ADDON)
ADDON.register()

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def cube(name, location, scale=(1.0, 1.0, 1.0)):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


props = bpy.context.scene.car_rig
props.workflow = "NORMAL"
props.vehicle_type = "CAR"
props.body = cube("BodySource", (0.0, 0.0, 0.8), (1.0, 2.1, 0.35))
props.wheel_fl = cube("WheelFrontLeft", (-1.0, -1.45, 0.35), (0.22, 0.42, 0.42))
props.wheel_fr = cube("WheelFrontRight", (1.0, -1.45, 0.35), (0.22, 0.42, 0.42))
props.wheel_rl = cube("WheelRearLeft", (-1.0, 1.45, 0.35), (0.22, 0.42, 0.42))
props.wheel_rr = cube("WheelRearRight", (1.0, 1.45, 0.35), (0.22, 0.42, 0.42))
steering = cube("SteeringWheel", (-0.42, -0.45, 1.12), (0.24, 0.05, 0.24))
# Keep the geometry in place while authoring an intentionally off-centre
# object origin, then tilt its local axes like a real cockpit steering wheel.
origin_offset = Vector((.08, 0.0, 0.0))
steering.data.transform(Matrix.Translation(-origin_offset))
steering.location += origin_offset
steering.rotation_euler = (math.radians(14), math.radians(-5), math.radians(7))
bpy.context.view_layer.update()
steering_world_before = steering.matrix_world.translation.copy()
steering_rotation_before = steering.matrix_world.to_quaternion()

props.steering_wheel = None
props.auto_detect_steering = True
props.steering_pivot_source = "ORIGIN"
props.driver_side = "AUTO"
props.steering_axis = "Z"
props.steering_direction = "-1"
props.steering_lock_degrees = 1080
props.steering_visual_degrees = 540
assert ADDON.driver_side_for(props, steering) == "left"
steering.location.x = .42
bpy.context.view_layer.update()
assert ADDON.driver_side_for(props, steering) == "right"
steering.location.x = steering_world_before.x
bpy.context.view_layer.update()

result = bpy.ops.carrig.build()
assert result == {"FINISHED"}, result

root = bpy.data.objects["Car"]
pivot = bpy.data.objects["steering_wheel_pivot"]
mesh = bpy.data.objects["steering_wheel_mesh"]
assert pivot.parent == root
assert mesh.parent == pivot
assert (mesh.matrix_world.translation - steering_world_before).length < 1e-5
assert pivot.matrix_world.to_quaternion().rotation_difference(steering_rotation_before).angle < 1e-5
assert root["lkVehicleRigVersion"] == "0.3.0"
assert root["lkRigProfile"] == "normal"
assert root["lkVehicleType"] == "car"
assert root["lkSteeringWheelRig"] is True
assert root["lkDriverSide"] == "left"
assert pivot["lkSteeringAxis"] == "z"
assert pivot["lkSteeringDirection"] == -1
assert pivot["lkSteeringLockDegrees"] == 1080.0
assert pivot["lkSteeringVisualDegrees"] == 540.0

# Rebuilding a file previously processed by the faulty 0.2.2 hierarchy must
# replace generated empties without duplicating or moving authored meshes.
result = bpy.ops.carrig.build()
assert result == {"FINISHED"}, result
generated_roots = [
    obj for obj in bpy.context.scene.objects
    if obj.type == "EMPTY" and obj.get("lkVehicleRigVersion")
]
assert len(generated_roots) == 1
root = generated_roots[0]
pivot = bpy.data.objects["steering_wheel_pivot"]
mesh = bpy.data.objects["steering_wheel_mesh"]
assert (mesh.matrix_world.translation - steering_world_before).length < 1e-5
assert pivot.matrix_world.to_quaternion().rotation_difference(steering_rotation_before).angle < 1e-5

with tempfile.TemporaryDirectory(prefix="lotking-rigger-") as export_dir:
    export_path = Path(export_dir) / "car.gltf"
    bpy.ops.export_scene.gltf(
        filepath=str(export_path),
        export_format="GLTF_SEPARATE",
        export_yup=True,
        export_apply=True,
        export_extras=True,
        use_selection=False,
    )
    gltf = json.loads(export_path.read_text(encoding="utf-8"))
    nodes = {node.get("name"): node for node in gltf.get("nodes", [])}
    exported_pivot = nodes["steering_wheel_pivot"]
    exported_mesh = nodes["steering_wheel_mesh"]
    print("Exported steering pivot:", exported_pivot)
    print("Exported steering mesh:", exported_mesh)
    pivot_translation = exported_pivot.get("translation", [0.0, 0.0, 0.0])
    assert sum(component * component for component in pivot_translation) > .01
    mesh_translation = exported_mesh.get("translation", [0.0, 0.0, 0.0])
    assert sum(component * component for component in mesh_translation) < 1e-6
    assert "rotation" in exported_pivot
    assert "rotation" not in exported_mesh
    for pivot_name in ("Wheel_FL_steer", "Wheel_FR_steer", "Wheel_RL_spin", "Wheel_RR_spin"):
        translation = nodes[pivot_name].get("translation", [0.0, 0.0, 0.0])
        assert sum(component * component for component in translation) > .01, pivot_name
    for local_name in (
        "Wheel_FL_spin",
        "Wheel_FR_spin",
        "Wheel_FL_mesh",
        "Wheel_FR_mesh",
        "Wheel_RL_mesh",
        "Wheel_RR_mesh",
    ):
        translation = nodes[local_name].get("translation", [0.0, 0.0, 0.0])
        assert sum(component * component for component in translation) < 1e-6, local_name

# Switching profile reuses the exact proven car hierarchy and only adds the
# semantic Sketchbook contract. Authored objects must survive that rebuild.
props.workflow = "SKETCHBOOK"
result = bpy.ops.carrig.build()
assert result == {"FINISHED"}, result
root = bpy.data.objects["Car"]
assert root["lkRigProfile"] == "sketchbook"
assert bpy.data.objects["Wheel_FL_spin"]["data"] == "wheel"
assert bpy.data.objects["Wheel_FL_spin"]["steering"] == "true"
assert bpy.data.objects["Wheel_RL_spin"]["steering"] == "false"
assert (bpy.data.objects["steering_wheel_mesh"].matrix_world.translation - steering_world_before).length < 1e-5

# The guided Sketchbook airplane tab must emit the exact metadata consumed by
# scanSourceParts(), without relying on names or silently tagging mount parents.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
props.workflow = "SKETCHBOOK"
props.vehicle_type = "AIRPLANE"
props.rotor_axis = "X"
props.hinge_axis = "Z"
props.body = cube("PlaneBodySource", (0, 0, .9), (1.4, 2.4, .3))
props.propeller = cube("PlanePropellerSource", (0, -2.55, .9), (.05, .8, .08))
props.aileron_left = cube("PlaneAileronLeft", (-1.2, .3, .9), (.6, .2, .05))
props.aileron_right = cube("PlaneAileronRight", (1.2, .3, .9), (.6, .2, .05))
props.elevator = cube("PlaneElevator", (0, 2.0, .9), (.9, .15, .05))
props.rudder = cube("PlaneRudder", (0, 2.0, 1.35), (.05, .2, .45))
props.wheel_fl = cube("PlaneNoseWheel", (0, -1.4, .25), (.12, .3, .3))
props.wheel_rl = cube("PlaneLeftWheel", (-.8, .5, .25), (.12, .3, .3))
props.wheel_rr = cube("PlaneRightWheel", (.8, .5, .25), (.12, .3, .3))
props.driver_seat = cube("PlaneSeat", (0, -.25, 1.0), (.15, .15, .15))
props.driver_door = cube("PlaneDoor", (-.7, -.25, 1.0), (.05, .35, .5))
props.driver_entry = cube("PlaneEntry", (-1.0, -.25, .5), (.05, .05, .05))
props.collision = cube("PlaneCollision", (0, 0, .8), (1.3, 2.2, .3))
props.collision_shape = "box"

result = bpy.ops.carrig.build()
assert result == {"FINISHED"}, result
plane = bpy.data.objects["Airplane"]
assert plane["lkRigProfile"] == "sketchbook"
assert plane["lkVehicleType"] == "airplane"
assert bpy.data.objects["Propeller_spin"]["data"] == "rotor"
assert bpy.data.objects["Propeller_spin"]["axis"] == "x"
assert bpy.data.objects["Propeller_spin"]["lkRigRole"] == "rotor"
assert bpy.data.objects["Propeller_spin"]["lkAxis"] == "x"
assert bpy.data.objects["Aileron_L_hinge"]["data"] == "aileron"
assert bpy.data.objects["Aileron_L_hinge"]["side"] == "left"
assert bpy.data.objects["Aileron_R_hinge"]["side"] == "right"
assert bpy.data.objects["Aileron_L_hinge"]["lkSide"] == "left"
assert bpy.data.objects["Aileron_R_hinge"]["lkSide"] == "right"
assert bpy.data.objects["Elevator_hinge"]["data"] == "elevator"
assert bpy.data.objects["Rudder_hinge"]["data"] == "rudder"
assert bpy.data.objects["Wheel_Nose_spin"]["data"] == "wheel"
assert bpy.data.objects["Wheel_Nose_spin"]["steering"] == "true"
assert bpy.data.objects["Wheel_Nose_spin"]["lkSteering"] is True
assert bpy.data.objects["seat_driver"]["lkDoorObject"] == "door_driver"
assert bpy.data.objects["seat_driver"]["lkEntryPoints"] == "entry_driver"
assert bpy.data.objects["seat_driver"]["data"] == "seat"
assert bpy.data.objects["seat_driver"]["seat_type"] == "driver"
assert bpy.data.objects["seat_driver"]["door_object"] == "door_driver"
assert bpy.data.objects["seat_driver"]["entry_points"] == "entry_driver"
assert bpy.data.objects["collision_body"]["data"] == "collision"
assert bpy.data.objects["collision_body"]["shape"] == "box"

with tempfile.TemporaryDirectory(prefix="lotking-aircraft-rigger-") as export_dir:
    export_path = Path(export_dir) / "airplane.gltf"
    bpy.ops.export_scene.gltf(
        filepath=str(export_path), export_format="GLTF_SEPARATE", export_yup=True,
        export_apply=True, export_extras=True, use_selection=False,
    )
    gltf = json.loads(export_path.read_text(encoding="utf-8"))
    nodes = {node.get("name"): node for node in gltf.get("nodes", [])}
    assert nodes["Propeller_spin"]["extras"]["data"] == "rotor"
    assert nodes["Aileron_L_hinge"]["extras"]["side"] == "left"
    assert nodes["seat_driver"]["extras"]["door_object"] == "door_driver"
    assert nodes["collision_body"]["extras"]["shape"] == "box"

# Helicopter is a separate guided assignment, not an airplane renamed after
# export. Both rotor shafts retain their own authored local frames.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
props.vehicle_type = "HELICOPTER"
props.rotor_axis = "AUTO"
props.body = cube("HelicopterBodySource", (0, 0, .9), (.8, 1.6, .55))
props.main_rotor = cube("HelicopterMainRotor", (0, 0, 1.8), (2.1, .03, .12))
props.tail_rotor = cube("HelicopterTailRotor", (.12, 1.8, 1.0), (.03, .5, .5))
props.driver_seat = None
props.driver_door = None
props.driver_entry = None
props.collision = None
result = bpy.ops.carrig.build()
assert result == {"FINISHED"}, result
helicopter = bpy.data.objects["Helicopter"]
assert helicopter["lkVehicleType"] == "helicopter"
assert bpy.data.objects["MainRotor_spin"]["data"] == "rotor"
assert bpy.data.objects["TailRotor_spin"]["data"] == "rotor"

print("Blender Lot King vehicle rigger 0.3.0 smoke test passed")
