bl_info = {
    "name": "Lot King Vehicle GLB Rigger",
    "author": "CodesAndTips",
    "version": (0, 3, 0),
    "blender": (5, 0, 0),
    "location": "View3D > Sidebar (N) > Vehicle Rig",
    "description": "Guided Normal and Sketchbook-compatible car, airplane, and helicopter GLB rigging.",
    "category": "Object",
}

import bpy
from pathlib import Path
from bpy.props import BoolProperty, EnumProperty, FloatProperty, PointerProperty
from bpy.types import AddonPreferences, Panel, Operator, PropertyGroup
from mathutils import Vector


ADDON_VERSION = "0.3.0"
STEERING_PIVOT_NAME = "steering_wheel_pivot"
STEERING_MESH_NAME = "steering_wheel_mesh"
STEERING_ALIASES = (
    "steering_wheel",
    "steeringwheel",
    "steering wheel",
    "volante",
    "steer_wheel",
)


def addon_module_name():
    return __package__ or __name__


def addon_install_folder():
    return str(Path(__file__).resolve().parent)


class CarRigProps(PropertyGroup):
    workflow: EnumProperty(
        name="Rig Profile",
        description="Normal keeps the native Lot King hierarchy; Sketchbook writes the exact glTF extras consumed by its vehicle runtime",
        items=(
            ("NORMAL", "Normal", "Native Lot King hierarchy and metadata"),
            ("SKETCHBOOK", "Sketchbook", "DollBody/Sketchbook-compatible glTF extras and hierarchy"),
        ),
        default="NORMAL",
    )
    vehicle_type: EnumProperty(
        name="Vehicle",
        items=(
            ("CAR", "Car", "Four-wheel road vehicle"),
            ("AIRPLANE", "Airplane", "Propeller aircraft with optional wheels and control surfaces"),
            ("HELICOPTER", "Helicopter", "Main/tail rotor aircraft"),
        ),
        default="CAR",
    )
    body: PointerProperty(name="Body", type=bpy.types.Object)
    wheel_fl: PointerProperty(name="Front Left Wheel", type=bpy.types.Object)
    wheel_fr: PointerProperty(name="Front Right Wheel", type=bpy.types.Object)
    wheel_rl: PointerProperty(name="Rear Left Wheel", type=bpy.types.Object)
    wheel_rr: PointerProperty(name="Rear Right Wheel", type=bpy.types.Object)
    disc_fl: PointerProperty(name="Front Left Brake Disc", type=bpy.types.Object)
    disc_fr: PointerProperty(name="Front Right Brake Disc", type=bpy.types.Object)
    disc_rl: PointerProperty(name="Rear Left Brake Disc", type=bpy.types.Object)
    disc_rr: PointerProperty(name="Rear Right Brake Disc", type=bpy.types.Object)
    caliper_fl: PointerProperty(name="Front Left Brake Caliper", type=bpy.types.Object)
    caliper_fr: PointerProperty(name="Front Right Brake Caliper", type=bpy.types.Object)
    caliper_rl: PointerProperty(name="Rear Left Brake Caliper", type=bpy.types.Object)
    caliper_rr: PointerProperty(name="Rear Right Brake Caliper", type=bpy.types.Object)
    steering_wheel: PointerProperty(
        name="Interior Steering Wheel",
        description="Optional steering-wheel mesh. If empty, Build searches common names automatically",
        type=bpy.types.Object,
    )
    auto_detect_steering: BoolProperty(
        name="Auto-detect if unassigned",
        description="Find steering_wheel, SteeringWheel, volante, or steer_wheel automatically",
        default=True,
    )
    steering_pivot_source: EnumProperty(
        name="Pivot Position",
        description="Use the steering object's authored origin, or replace it with the geometry bounds centre",
        items=(
            ("ORIGIN", "Authored object origin", "Respect the origin and local axes prepared on the steering wheel"),
            ("BOUNDS", "Geometry bounds centre", "Move the steering object origin to the centre of its bounds"),
        ),
        default="ORIGIN",
    )
    driver_side: EnumProperty(
        name="Driver Side",
        description="Cabin side metadata exported for the engine and future camera/hand rigs",
        items=(
            ("AUTO", "Auto from position", "Detect left/right from the steering wheel position"),
            ("LEFT", "Left-hand drive", "Steering wheel is on the vehicle's left"),
            ("RIGHT", "Right-hand drive", "Steering wheel is on the vehicle's right"),
        ),
        default="AUTO",
    )
    steering_axis: EnumProperty(
        name="Local Rotation Axis",
        description="Local steering-wheel axle used by the runtime",
        items=(
            ("X", "Local X", "Rotate around the steering-wheel pivot local X axis"),
            ("Y", "Local Y", "Rotate around the steering-wheel pivot local Y axis"),
            ("Z", "Local Z (common)", "Rotate around the steering-wheel pivot local Z axis"),
        ),
        default="Z",
    )
    steering_direction: EnumProperty(
        name="Left/Right Direction",
        description="Invert if a left steering input turns the cockpit wheel to the wrong side",
        items=(
            ("-1", "Common / inverted", "Positive engine steering rotates around the negative local axis"),
            ("1", "Normal", "Positive engine steering rotates around the positive local axis"),
        ),
        default="-1",
    )
    steering_lock_degrees: FloatProperty(
        name="Input Lock-to-lock",
        description="Physical steering range reserved for future steering-wheel controllers",
        default=900.0,
        min=180.0,
        max=2160.0,
        soft_min=540.0,
        soft_max=1080.0,
    )
    steering_visual_degrees: FloatProperty(
        name="Visible Lock-to-lock",
        description="Shortened cockpit animation range; normalized input still preserves full left/right mapping",
        default=540.0,
        min=90.0,
        max=2160.0,
        soft_min=270.0,
        soft_max=900.0,
    )
    propeller: PointerProperty(name="Propeller", type=bpy.types.Object)
    main_rotor: PointerProperty(name="Main Rotor", type=bpy.types.Object)
    tail_rotor: PointerProperty(name="Tail Rotor", type=bpy.types.Object)
    aileron_left: PointerProperty(name="Left Aileron", type=bpy.types.Object)
    aileron_right: PointerProperty(name="Right Aileron", type=bpy.types.Object)
    elevator: PointerProperty(name="Elevator", type=bpy.types.Object)
    rudder: PointerProperty(name="Rudder", type=bpy.types.Object)
    driver_seat: PointerProperty(name="Driver Seat Marker", type=bpy.types.Object)
    passenger_seat: PointerProperty(name="Passenger Seat Marker", type=bpy.types.Object)
    driver_door: PointerProperty(name="Driver Door", type=bpy.types.Object)
    passenger_door: PointerProperty(name="Passenger Door", type=bpy.types.Object)
    driver_entry: PointerProperty(name="Driver Entry Marker", type=bpy.types.Object)
    passenger_entry: PointerProperty(name="Passenger Entry Marker", type=bpy.types.Object)
    collision: PointerProperty(name="Collision Marker", type=bpy.types.Object)
    collision_shape: EnumProperty(
        name="Collision Shape",
        items=(("box", "Box", "Box collider from marker transform"), ("sphere", "Sphere", "Sphere collider from marker transform")),
        default="box",
    )
    rotor_axis: EnumProperty(
        name="Spin Axis",
        description="Local shaft axis. Auto lets the runtime measure the thinnest geometry axis",
        items=(("AUTO", "Auto", "Measure from local geometry"), ("X", "Local X", "Local X shaft"), ("Y", "Local Y", "Local Y shaft"), ("Z", "Local Z", "Local Z shaft")),
        default="AUTO",
    )
    hinge_axis: EnumProperty(
        name="Hinge Axis",
        description="Local hinge axis. Auto lets the runtime measure the longest geometry axis",
        items=(("AUTO", "Auto", "Measure from local geometry"), ("X", "Local X", "Local X hinge"), ("Y", "Local Y", "Local Y hinge"), ("Z", "Local Z", "Local Z hinge")),
        default="AUTO",
    )


class CARRIG_OT_assign(Operator):
    """Assign the active selected object to this rig slot."""

    bl_idname = "carrig.assign"
    bl_label = "Assign Selection"
    bl_options = {"REGISTER", "UNDO"}

    slot: bpy.props.StringProperty()

    def execute(self, context):
        obj = context.active_object
        if obj is None:
            self.report({"WARNING"}, "No active object selected")
            return {"CANCELLED"}

        setattr(context.scene.car_rig, self.slot, obj)
        self.report({"INFO"}, f"Assigned '{obj.name}'")
        return {"FINISHED"}


def set_origin_to_center(obj, context):
    context.view_layer.objects.active = obj
    for selected in context.selected_objects:
        selected.select_set(False)
    obj.select_set(True)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")


def parent_keep_transform(obj, parent):
    # Newly created empties do not always have an evaluated matrix_world yet.
    # Evaluate before capturing it or their freshly assigned location is read
    # as the identity and exported at the vehicle origin.
    bpy.context.view_layer.update()
    world_matrix = obj.matrix_world.copy()
    local_matrix = parent.matrix_world.inverted_safe() @ world_matrix
    obj.parent = parent
    # Bake the preserved world transform into the child's real local matrix.
    # Keeping a non-identity matrix_parent_inverse looks correct in Blender,
    # but glTF exports the empty at its parent's origin and moves the mesh
    # instead, making wheels/steering rotate around the vehicle centre.
    obj.matrix_parent_inverse.identity()
    obj.matrix_basis = local_matrix
    bpy.context.view_layer.update()


def clear_parent_keep_transform(obj):
    bpy.context.view_layer.update()
    world_matrix = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_parent_inverse.identity()
    obj.matrix_world = world_matrix
    bpy.context.view_layer.update()


def generated_rig_node(obj, root):
    if obj == root:
        return True
    if obj.type == "EMPTY" and obj.get("lkGeneratedRigNode"):
        return True
    name = str(getattr(obj, "name", "")).lower()
    prefixes = (
        "wheel_fl_steer",
        "wheel_fr_steer",
        "wheel_fl_spin",
        "wheel_fr_spin",
        "wheel_rl_spin",
        "wheel_rr_spin",
        "steering_wheel_pivot",
    )
    return obj.type == "EMPTY" and any(name.startswith(prefix) for prefix in prefixes)


def object_parent_depth(obj):
    depth = 0
    parent = obj.parent
    while parent is not None:
        depth += 1
        parent = parent.parent
    return depth


def remove_existing_generated_rig(context):
    roots = [
        obj for obj in list(context.scene.objects)
        if obj.type == "EMPTY" and obj.get("lkVehicleRigVersion")
    ]
    for root in roots:
        descendants = list(root.children_recursive)
        generated = {obj for obj in descendants if generated_rig_node(obj, root)}
        generated.add(root)
        # Preserve every authored mesh, caliper, custom attachment or helper in
        # world space before removing only the hierarchy nodes generated here.
        for obj in descendants:
            if obj not in generated:
                clear_parent_keep_transform(obj)
        for obj in sorted(generated, key=object_parent_depth, reverse=True):
            if obj.name in bpy.data.objects:
                bpy.data.objects.remove(obj, do_unlink=True)
        context.view_layer.update()
    return len(roots)


def make_empty(name, location, collection, parent=None, size=0.15, rotation=None):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "PLAIN_AXES"
    empty.empty_display_size = size
    collection.objects.link(empty)
    empty.location = location
    if rotation is not None:
        empty.rotation_mode = "QUATERNION"
        empty.rotation_quaternion = rotation
    if parent:
        parent_keep_transform(empty, parent)
    empty["lkGeneratedRigNode"] = True
    return empty


def tag_root(root, props):
    """Write profile metadata without changing the legacy car node names."""
    root["lkVehicleRigVersion"] = ADDON_VERSION
    root["lkVehicleType"] = props.vehicle_type.lower()
    root["lkRigProfile"] = props.workflow.lower()
    root["lkForwardAxis"] = "-Z"
    root["lkUpAxis"] = "Y"


def axis_extra(value):
    return None if value == "AUTO" else value.lower()


def tag_part(obj, role, props, side=None, axis=None):
    obj["lkRigRole"] = role
    if side:
        obj["lkSide"] = side
    if axis:
        obj["lkAxis"] = axis
    if props.workflow == "SKETCHBOOK":
        obj["data"] = role
        if side:
            obj["side"] = side
        if axis:
            obj["axis"] = axis


def authored_part(context, props, root, obj, role, name, side=None, axis=None, size=0.18):
    """Wrap one authored moving mesh in a pivot located on its authored origin.

    The tagged pivot is the moving part. Its child mesh remains visually fixed
    and gives the runtime geometry with which it can verify/measure the axis.
    """
    if obj is None:
        return None
    context.view_layer.update()
    world_loc, world_rotation, _world_scale = obj.matrix_world.decompose()
    pivot = make_empty(name, world_loc, context.collection, parent=root, size=size, rotation=world_rotation)
    tag_part(pivot, role, props, side=side, axis=axis)
    reserve_object_name(pivot, name)
    reserve_object_name(obj, name + "_mesh")
    parent_keep_transform(obj, pivot)
    return pivot


def aircraft_wheel(context, props, root, obj, name, steering):
    pivot = authored_part(context, props, root, obj, "wheel", name)
    if pivot is None:
        return None
    pivot["lkSteering"] = bool(steering)
    if props.workflow == "SKETCHBOOK":
        pivot["steering"] = "true" if steering else "false"
    return pivot


def attach_vehicle_markers(context, props, root):
    """Attach seat/entry/door/collision authoring markers to the exported rig."""
    entries = ((props.driver_entry, "entry_driver"), (props.passenger_entry, "entry_passenger"))
    for obj, name in entries:
        if obj is None:
            continue
        reserve_object_name(obj, name)
        parent_keep_transform(obj, root)
        obj["lkRigRole"] = "entry-point"

    doors = ((props.driver_door, "door_driver"), (props.passenger_door, "door_passenger"))
    for obj, name in doors:
        if obj is None:
            continue
        reserve_object_name(obj, name)
        parent_keep_transform(obj, root)
        obj["lkRigRole"] = "door"

    seats = (
        (props.driver_seat, "seat_driver", "driver", props.driver_door, props.driver_entry, props.passenger_seat),
        (props.passenger_seat, "seat_passenger", "passenger", props.passenger_door, props.passenger_entry, props.driver_seat),
    )
    for obj, name, seat_type, door, entry, connected in seats:
        if obj is None:
            continue
        reserve_object_name(obj, name)
        parent_keep_transform(obj, root)
        obj["lkRigRole"] = "seat"
        obj["lkSeatType"] = seat_type
        if door is not None:
            obj["lkDoorObject"] = door.name
        if entry is not None:
            obj["lkEntryPoints"] = entry.name
        if connected is not None:
            obj["lkConnectedSeats"] = connected.name
        if props.workflow == "SKETCHBOOK":
            obj["data"] = "seat"
            obj["seat_type"] = seat_type
            if door is not None:
                obj["door_object"] = door.name
            if entry is not None:
                obj["entry_points"] = entry.name
            if connected is not None:
                obj["connected_seats"] = connected.name

    if props.collision is not None:
        collision = props.collision
        reserve_object_name(collision, "collision_body")
        parent_keep_transform(collision, root)
        collision["lkRigRole"] = "collision"
        collision["shape"] = props.collision_shape
        if props.workflow == "SKETCHBOOK":
            collision["data"] = "collision"


def annotate_car_parts(context, props, root):
    for key, steering, drive in (
        ("FL", True, "fwd"), ("FR", True, "fwd"),
        ("RL", False, "rwd"), ("RR", False, "rwd"),
    ):
        spin = bpy.data.objects.get(f"Wheel_{key}_spin")
        if spin is None:
            continue
        spin["lkRigRole"] = "wheel"
        spin["lkSteering"] = steering
        spin["lkDrive"] = drive
        if props.workflow == "SKETCHBOOK":
            spin["data"] = "wheel"
            spin["steering"] = "true" if steering else "false"
            spin["drive"] = drive
    attach_vehicle_markers(context, props, root)


def build_aircraft_rig(operator, context, props):
    if props.body is None:
        operator.report({"ERROR"}, "Assign the aircraft body first")
        return {"CANCELLED"}
    if props.vehicle_type == "AIRPLANE" and props.propeller is None:
        operator.report({"ERROR"}, "Assign the airplane propeller first")
        return {"CANCELLED"}
    if props.vehicle_type == "HELICOPTER" and props.main_rotor is None:
        operator.report({"ERROR"}, "Assign the helicopter main rotor first")
        return {"CANCELLED"}

    rebuilt = remove_existing_generated_rig(context)
    root_name = "Airplane" if props.vehicle_type == "AIRPLANE" else "Helicopter"
    root = make_empty(root_name, (0, 0, 0), context.collection, size=1.0)
    tag_root(root, props)
    reserve_object_name(props.body, "Body")
    parent_keep_transform(props.body, root)

    spin_axis = axis_extra(props.rotor_axis)
    hinge_axis = axis_extra(props.hinge_axis)
    if props.vehicle_type == "AIRPLANE":
        authored_part(context, props, root, props.propeller, "rotor", "Propeller_spin", axis=spin_axis)
        authored_part(context, props, root, props.aileron_left, "aileron", "Aileron_L_hinge", side="left", axis=hinge_axis)
        authored_part(context, props, root, props.aileron_right, "aileron", "Aileron_R_hinge", side="right", axis=hinge_axis)
        authored_part(context, props, root, props.elevator, "elevator", "Elevator_hinge", axis=hinge_axis)
        authored_part(context, props, root, props.rudder, "rudder", "Rudder_hinge", axis=hinge_axis)
        aircraft_wheel(context, props, root, props.wheel_fl, "Wheel_Nose_spin", True)
        aircraft_wheel(context, props, root, props.wheel_rl, "Wheel_Left_spin", False)
        aircraft_wheel(context, props, root, props.wheel_rr, "Wheel_Right_spin", False)
    else:
        authored_part(context, props, root, props.main_rotor, "rotor", "MainRotor_spin", axis=spin_axis, size=.35)
        authored_part(context, props, root, props.tail_rotor, "rotor", "TailRotor_spin", axis=spin_axis)

    attach_vehicle_markers(context, props, root)
    for selected in context.selected_objects:
        selected.select_set(False)
    root.select_set(True)
    context.view_layer.objects.active = root
    action = "Hierarchy rebuilt" if rebuilt else "Hierarchy created"
    operator.report({"INFO"}, f"{action}: {props.workflow.title()} {root_name}. Ready for GLB export.")
    return {"FINISHED"}


def normalized_name(obj):
    return " ".join(
        str(getattr(obj, "name", "")).lower().replace("-", " ").replace("_", " ").split()
    )


def object_world_center(obj):
    if obj is None:
        return None
    if getattr(obj, "bound_box", None):
        center = sum((obj.matrix_world @ Vector(corner) for corner in obj.bound_box), Vector()) / 8.0
        return center
    return obj.matrix_world.translation.copy()


def find_steering_wheel(context, props):
    if props.steering_wheel:
        return props.steering_wheel
    if not props.auto_detect_steering:
        return None
    ranked = []
    for obj in context.scene.objects:
        if obj == props.body or obj.type not in {"MESH", "CURVE", "SURFACE", "META"}:
            continue
        name = normalized_name(obj)
        if "pivot" in name or "dummy" in name:
            continue
        compact = name.replace(" ", "")
        score = 0
        for index, alias in enumerate(STEERING_ALIASES):
            alias_words = alias.replace("_", " ")
            if name == alias_words or compact == alias_words.replace(" ", ""):
                score = max(score, 100 - index)
            elif alias_words in name or alias_words.replace(" ", "") in compact:
                score = max(score, 50 - index)
        if score:
            ranked.append((score, obj.name.lower(), obj))
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked[0][2] if ranked else None


def driver_side_for(props, steering_wheel):
    if props.driver_side in {"LEFT", "RIGHT"}:
        return props.driver_side.lower()
    steering_center = object_world_center(steering_wheel)
    if steering_center is None:
        return "left"
    # Prefer semantic wheel assignments over an assumed Blender axis. Vehicle
    # assets can face +Y, -Y, +X or -X; Front Left/Right remains unambiguous.
    for left_wheel, right_wheel in (
        (props.wheel_fl, props.wheel_fr),
        (props.wheel_rl, props.wheel_rr),
    ):
        left_center = object_world_center(left_wheel)
        right_center = object_world_center(right_wheel)
        if left_center is not None and right_center is not None:
            left_distance = (steering_center - left_center).length_squared
            right_distance = (steering_center - right_center).length_squared
            if abs(left_distance - right_distance) > 1e-8:
                return "left" if left_distance < right_distance else "right"
    body_center = object_world_center(props.body)
    if body_center is None:
        return "left"
    return "left" if steering_center.x <= body_center.x else "right"


def reserve_object_name(obj, name):
    existing = bpy.data.objects.get(name)
    if existing and existing != obj:
        existing.name = name + "_previous"
    obj.name = name


def build_steering_wheel_rig(context, props, root):
    steering_wheel = find_steering_wheel(context, props)
    if steering_wheel is None:
        root["lkSteeringWheelRig"] = False
        return None

    props.steering_wheel = steering_wheel
    if props.steering_pivot_source == "BOUNDS":
        set_origin_to_center(steering_wheel, context)
    context.view_layer.update()
    world_loc, world_rotation, _world_scale = steering_wheel.matrix_world.decompose()
    pivot = make_empty(
        STEERING_PIVOT_NAME,
        world_loc,
        context.collection,
        parent=root,
        size=0.12,
        rotation=world_rotation,
    )
    reserve_object_name(pivot, STEERING_PIVOT_NAME)
    reserve_object_name(steering_wheel, STEERING_MESH_NAME)
    parent_keep_transform(steering_wheel, pivot)

    direction = -1 if props.steering_direction == "-1" else 1
    driver_side = driver_side_for(props, steering_wheel)
    pivot["lkRigRole"] = "steering-wheel"
    pivot["lkSteeringAxis"] = props.steering_axis.lower()
    pivot["lkSteeringDirection"] = direction
    pivot["lkSteeringLockDegrees"] = float(props.steering_lock_degrees)
    pivot["lkSteeringVisualDegrees"] = min(
        float(props.steering_visual_degrees),
        float(props.steering_lock_degrees),
    )
    pivot["lkDriverSide"] = driver_side
    steering_wheel["lkRigRole"] = "steering-wheel-mesh"
    root["lkSteeringWheelRig"] = True
    root["lkDriverSide"] = driver_side
    return pivot


class CARRIG_OT_detect_steering(Operator):
    """Find an interior steering wheel by common object names."""

    bl_idname = "carrig.detect_steering"
    bl_label = "Detect Steering Wheel"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        props = context.scene.car_rig
        previous = props.steering_wheel
        props.steering_wheel = None
        found = find_steering_wheel(context, props)
        if found is None:
            props.steering_wheel = previous
            self.report({"WARNING"}, "No steering wheel found by common names")
            return {"CANCELLED"}
        props.steering_wheel = found
        self.report({"INFO"}, f"Detected '{found.name}'")
        return {"FINISHED"}


class CARRIG_OT_build(Operator):
    """Build the selected Normal or Sketchbook-compatible vehicle hierarchy."""

    bl_idname = "carrig.build"
    bl_label = "Build Vehicle Hierarchy"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        props = context.scene.car_rig

        if props.vehicle_type != "CAR":
            return build_aircraft_rig(self, context, props)

        if not props.body:
            self.report({"ERROR"}, "Assign the body object first")
            return {"CANCELLED"}

        corners = {
            "FL": {
                "wheel": props.wheel_fl,
                "disc": props.disc_fl,
                "caliper": props.caliper_fl,
                "steers": True,
            },
            "FR": {
                "wheel": props.wheel_fr,
                "disc": props.disc_fr,
                "caliper": props.caliper_fr,
                "steers": True,
            },
            "RL": {
                "wheel": props.wheel_rl,
                "disc": props.disc_rl,
                "caliper": props.caliper_rl,
                "steers": False,
            },
            "RR": {
                "wheel": props.wheel_rr,
                "disc": props.disc_rr,
                "caliper": props.caliper_rr,
                "steers": False,
            },
        }

        for key, corner in corners.items():
            if corner["wheel"] is None:
                self.report({"ERROR"}, f"Wheel {key} is not assigned")
                return {"CANCELLED"}

        rebuilt = remove_existing_generated_rig(context)
        root = make_empty("Car", (0, 0, 0), context.collection, size=1.0)
        tag_root(root, props)

        props.body.name = "Body"
        parent_keep_transform(props.body, root)

        for key, corner in corners.items():
            wheel = corner["wheel"]
            disc = corner["disc"]
            caliper = corner["caliper"]
            steers = corner["steers"]

            set_origin_to_center(wheel, context)
            world_loc = wheel.matrix_world.translation.copy()
            steer_parent = root

            if steers:
                steer_parent = make_empty(
                    f"Wheel_{key}_steer",
                    world_loc,
                    context.collection,
                    parent=root,
                )

            spin = make_empty(
                f"Wheel_{key}_spin",
                world_loc,
                context.collection,
                parent=steer_parent,
            )

            wheel.name = f"Wheel_{key}_mesh"
            parent_keep_transform(wheel, spin)

            if disc:
                set_origin_to_center(disc, context)
                disc.name = f"BrakeDisc_{key}_mesh"
                parent_keep_transform(disc, spin)

            if caliper:
                caliper.name = f"BrakeCaliper_{key}_mesh"
                parent_keep_transform(caliper, steer_parent)

        steering_pivot = build_steering_wheel_rig(context, props, root)
        annotate_car_parts(context, props, root)

        for selected in context.selected_objects:
            selected.select_set(False)
        root.select_set(True)
        context.view_layer.objects.active = root

        steering_note = " with cockpit steering rig" if steering_pivot else " (no steering wheel found)"
        action = "Hierarchy rebuilt" if rebuilt else "Hierarchy created"
        self.report({"INFO"}, action + steering_note + ". Ready for GLB export.")
        return {"FINISHED"}


class CARRIG_OT_export(Operator):
    """Export the scene as GLB with settings suitable for three.js."""

    bl_idname = "carrig.export"
    bl_label = "Export GLB"

    filepath: bpy.props.StringProperty(subtype="FILE_PATH")

    def execute(self, context):
        if not self.filepath.lower().endswith(".glb"):
            self.filepath += ".glb"

        bpy.ops.export_scene.gltf(
            filepath=self.filepath,
            export_format="GLB",
            export_yup=True,
            export_apply=True,
            export_extras=True,
            use_selection=False,
        )

        self.report({"INFO"}, f"Exported: {self.filepath}")
        return {"FINISHED"}

    def invoke(self, context, event):
        kind = getattr(context.scene.car_rig, "vehicle_type", "CAR").lower()
        self.filepath = kind + ".glb"
        context.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}


class CARRIG_OT_open_install_folder(Operator):
    """Open the folder where this add-on is installed."""

    bl_idname = "carrig.open_install_folder"
    bl_label = "Open Install Folder"

    def execute(self, context):
        bpy.ops.wm.path_open(filepath=addon_install_folder())
        return {"FINISHED"}


class CARRIG_OT_uninstall_self(Operator):
    """Disable and remove this add-on through Blender preferences."""

    bl_idname = "carrig.uninstall_self"
    bl_label = "Uninstall This Add-on"

    def execute(self, context):
        module_name = addon_module_name()

        try:
            bpy.ops.preferences.addon_disable(module=module_name)
            bpy.ops.preferences.addon_remove(module=module_name)
        except Exception as exc:
            self.report({"ERROR"}, f"Could not uninstall automatically: {exc}")
            return {"CANCELLED"}

        self.report({"INFO"}, "Add-on uninstall requested")
        return {"FINISHED"}


class CarRigPreferences(AddonPreferences):
    bl_idname = addon_module_name()

    def draw(self, context):
        layout = self.layout
        layout.label(text=f"Version {ADDON_VERSION}")
        layout.label(text=f"Installed in: {addon_install_folder()}")

        row = layout.row(align=True)
        row.operator("carrig.uninstall_self", text="Uninstall This Add-on")
        row.operator("carrig.open_install_folder", text="Open Install Folder")


class CARRIG_PT_panel(Panel):
    bl_label = "Lot King Vehicle Rigger"
    bl_idname = "CARRIG_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Vehicle Rig"

    def draw(self, context):
        layout = self.layout
        props = context.scene.car_rig

        def slot_row(parent, label, prop_name):
            row = parent.row(align=True)
            row.prop(props, prop_name, text=label)
            op = row.operator("carrig.assign", text="Use Selected")
            op.slot = prop_name

        def corner_box(parent, title, wheel_prop, disc_prop, caliper_prop):
            box = parent.box()
            box.label(text=title)
            slot_row(box, "Wheel", wheel_prop)
            slot_row(box, "Disc", disc_prop)
            slot_row(box, "Caliper", caliper_prop)

        col = layout.column()
        col.label(text=f"Version {ADDON_VERSION}", icon="PLUGIN")
        tabs = col.row(align=True)
        tabs.prop(props, "workflow", expand=True)
        col.prop(props, "vehicle_type", expand=True)
        info = col.box()
        if props.workflow == "SKETCHBOOK":
            info.label(text="Exports runtime-readable glTF extras", icon="CHECKMARK")
            info.label(text="Moving-part origins must sit on their real shafts/hinges")
        else:
            info.label(text="Native Lot King names; existing car workflow is preserved", icon="INFO")
        col.separator()
        slot_row(col, "Body", "body")

        if props.vehicle_type == "CAR":
            col.label(text="1. Assign four wheel corners", icon="MOD_ARRAY")
            corner_box(col, "Front Left", "wheel_fl", "disc_fl", "caliper_fl")
            corner_box(col, "Front Right", "wheel_fr", "disc_fr", "caliper_fr")
            corner_box(col, "Rear Left", "wheel_rl", "disc_rl", "caliper_rl")
            corner_box(col, "Rear Right", "wheel_rr", "disc_rr", "caliper_rr")

            steering = col.box()
            steering.label(text="2. Interior steering wheel (optional)", icon="ORIENTATION_GIMBAL")
            slot_row(steering, "Mesh", "steering_wheel")
            steering.prop(props, "auto_detect_steering")
            steering.operator("carrig.detect_steering", text="Detect Common Name")
            steering.prop(props, "steering_pivot_source")
            steering.prop(props, "driver_side")
            steering.prop(props, "steering_axis")
            steering.prop(props, "steering_direction")
            steering.prop(props, "steering_lock_degrees")
            steering.prop(props, "steering_visual_degrees")
        elif props.vehicle_type == "AIRPLANE":
            moving = col.box()
            moving.label(text="1. Propulsion and control surfaces", icon="ORIENTATION_GIMBAL")
            slot_row(moving, "Propeller", "propeller")
            slot_row(moving, "Left Aileron", "aileron_left")
            slot_row(moving, "Right Aileron", "aileron_right")
            slot_row(moving, "Elevator", "elevator")
            slot_row(moving, "Rudder", "rudder")
            moving.prop(props, "rotor_axis")
            moving.prop(props, "hinge_axis")
            wheels = col.box()
            wheels.label(text="Landing wheels (optional)")
            slot_row(wheels, "Front / Nose", "wheel_fl")
            slot_row(wheels, "Rear Left", "wheel_rl")
            slot_row(wheels, "Rear Right", "wheel_rr")
        else:
            moving = col.box()
            moving.label(text="1. Rotor system", icon="ORIENTATION_GIMBAL")
            slot_row(moving, "Main Rotor", "main_rotor")
            slot_row(moving, "Tail Rotor", "tail_rotor")
            moving.prop(props, "rotor_axis")

        markers = col.box()
        markers.label(text="2. Gameplay markers (optional)", icon="EMPTY_AXIS")
        slot_row(markers, "Driver Seat", "driver_seat")
        slot_row(markers, "Passenger Seat", "passenger_seat")
        slot_row(markers, "Driver Door", "driver_door")
        slot_row(markers, "Passenger Door", "passenger_door")
        slot_row(markers, "Driver Entry", "driver_entry")
        slot_row(markers, "Passenger Entry", "passenger_entry")
        slot_row(markers, "Collision", "collision")
        markers.prop(props, "collision_shape")

        layout.separator()
        layout.operator("carrig.build", text="3. Build / Rebuild Hierarchy", icon="MODIFIER")
        layout.operator("carrig.export", text="4. Export GLB", icon="EXPORT")

        layout.separator()
        box = layout.box()
        box.label(text="Safe rebuild", icon="FILE_REFRESH")
        box.label(text="Generated pivots are replaced; authored meshes stay in place")


classes = (
    CarRigProps,
    CARRIG_OT_assign,
    CARRIG_OT_detect_steering,
    CARRIG_OT_build,
    CARRIG_OT_export,
    CARRIG_OT_open_install_folder,
    CARRIG_OT_uninstall_self,
    CarRigPreferences,
    CARRIG_PT_panel,
)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.car_rig = PointerProperty(type=CarRigProps)


def unregister():
    if hasattr(bpy.types.Scene, "car_rig"):
        del bpy.types.Scene.car_rig
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
