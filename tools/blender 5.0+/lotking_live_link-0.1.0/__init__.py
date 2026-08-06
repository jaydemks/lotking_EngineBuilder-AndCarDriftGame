bl_info = {
    "name": "Lot King Live Link",
    "author": "Lot King Engine",
    "version": (0, 1, 9),
    "blender": (5, 0, 0),
    "location": "View3D > Sidebar (N) > Lot King > Live Link",
    "description": "Token-protected local scene and asset bridge for Lot King Editor",
    "category": "Import-Export",
}

import base64
import errno
import hashlib
import json
import os
import queue
import secrets
import socket
import struct
import tempfile
import threading
import time
import uuid
from urllib.parse import urlsplit

import bpy
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, IntProperty, StringProperty
from bpy.types import Operator, Panel, PropertyGroup
from mathutils import Matrix, Quaternion, Vector


PROTOCOL = "lotking.blender-live-link"
PROTOCOL_VERSION = 1
ADDON_VERSION = "0.1.9"
MAX_FRAME_BYTES = 3 * 1024 * 1024
MAX_ASSET_BYTES = 1024 * 1024 * 1024
CHUNK_BYTES = 192 * 1024
BINARY_CHUNK_BYTES = 2 * 1024 * 1024
BINARY_MAGIC = b"LKGLB1"
XOR_TABLES = tuple(bytes(value ^ key for value in range(256)) for key in range(256))
LOCAL_HOST = "127.0.0.1"
OFFICIAL_EDITOR_ORIGIN = "https://jaydemks.github.io"
DEFAULT_ALLOWED_ORIGINS = "http://localhost:*,http://127.0.0.1:*," + OFFICIAL_EDITOR_ORIGIN

_server = None
_apply_guard = 0
_last_signatures = {}
_incoming_assets = {}


def _settings(context=None):
    context = context or bpy.context
    return getattr(context.scene, "lotking_live_link", None) if context and context.scene else None


def _message(kind, payload=None, sender="blender"):
    return {
        "protocol": PROTOCOL,
        "version": PROTOCOL_VERSION,
        "type": str(kind),
        "messageId": "b-" + uuid.uuid4().hex,
        "senderId": sender,
        "sentAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "payload": payload or {},
    }


def _json_bytes(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def _read_exact(connection, count):
    data = bytearray()
    while len(data) < count:
        chunk = connection.recv(count - len(data))
        if not chunk:
            raise ConnectionError("WebSocket connection closed")
        data.extend(chunk)
    return bytes(data)


def _read_frame(connection):
    head = _read_exact(connection, 2)
    original_timeout = connection.gettimeout()
    connection.settimeout(5.0)
    try:
        first, second = head
        opcode = first & 0x0F
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            length = struct.unpack("!H", _read_exact(connection, 2))[0]
        elif length == 127:
            length = struct.unpack("!Q", _read_exact(connection, 8))[0]
        if length > MAX_FRAME_BYTES:
            raise ValueError("WebSocket frame exceeds 3 MiB")
        if not masked:
            raise ValueError("Browser WebSocket frames must be masked")
        mask = _read_exact(connection, 4)
        payload = bytearray(_read_exact(connection, length))
        for offset, key in enumerate(mask):
            payload[offset::4] = payload[offset::4].translate(XOR_TABLES[key])
        return opcode, bytes(payload)
    finally:
        connection.settimeout(original_timeout)


def _send_frame(connection, payload, opcode=1):
    payload = bytes(payload)
    size = len(payload)
    header = bytearray([0x80 | opcode])
    if size < 126:
        header.append(size)
    elif size <= 0xFFFF:
        header.append(126)
        header.extend(struct.pack("!H", size))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", size))
    connection.sendall(bytes(header) + payload)


def _binary_asset_chunk(payload):
    if len(payload) < 12 or payload[:6] != BINARY_MAGIC:
        raise ValueError("Invalid binary asset frame")
    id_length, index = struct.unpack("!HI", payload[6:12])
    if id_length <= 0 or 12 + id_length > len(payload):
        raise ValueError("Invalid binary asset header")
    transfer_id = payload[12:12 + id_length].decode("ascii")
    return transfer_id, index, payload[12 + id_length:]


def _origin_allowed(origin, allowed_origins):
    origin = str(origin or "").strip().rstrip("/")
    rules = {item.strip().rstrip("/") for item in str(allowed_origins or "").split(",") if item.strip()}
    if not rules:
        return True
    if origin in rules:
        return True
    try:
        parsed = urlsplit(origin)
    except ValueError:
        return False
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        return False
    host = "[::1]" if parsed.hostname == "::1" else parsed.hostname
    wildcard = f"{parsed.scheme}://{host}:*"
    return wildcard in rules


def _websocket_handshake(connection, allowed_origins):
    request = bytearray()
    while b"\r\n\r\n" not in request:
        part = connection.recv(4096)
        if not part or len(request) + len(part) > 16384:
            raise ValueError("Invalid WebSocket handshake")
        request.extend(part)
    lines = request.decode("iso-8859-1").split("\r\n")
    headers = {}
    for line in lines[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            headers[key.strip().lower()] = value.strip()
    origin = headers.get("origin", "")
    if not _origin_allowed(origin, allowed_origins):
        connection.sendall(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n")
        raise PermissionError("Browser origin is not allowed: " + (origin or "(missing)"))
    key = headers.get("sec-websocket-key")
    if not key:
        raise ValueError("Missing Sec-WebSocket-Key")
    accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode("ascii")).digest()).decode("ascii")
    response = (
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
    )
    connection.sendall(response.encode("ascii"))


class LocalWebSocketServer:
    def __init__(self, port, token, allowed_origins):
        self.port = int(port)
        self.token = str(token)
        self.allowed_origins = str(allowed_origins)
        self.incoming = queue.Queue()
        self.outgoing = queue.Queue()
        self.stop_event = threading.Event()
        self.thread = None
        self.listener = None
        self.connection = None
        self.authenticated = False
        self.status = "Starting"

    def start(self):
        self.stop_event.clear()
        listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            listener.bind((LOCAL_HOST, self.port))
            listener.listen(1)
            listener.settimeout(0.25)
        except Exception:
            listener.close()
            raise
        self.listener = listener
        self.status = f"Listening on ws://{LOCAL_HOST}:{self.port}"
        self.thread = threading.Thread(target=self._run, name="LotKingLiveLink", daemon=True)
        self.thread.start()

    def stop(self):
        self.stop_event.set()
        for sock in (self.connection, self.listener):
            if sock:
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                try:
                    sock.close()
                except OSError:
                    pass
        self.connection = None
        self.listener = None
        self.authenticated = False
        thread = self.thread
        if thread and thread is not threading.current_thread() and thread.is_alive():
            thread.join(timeout=1.0)
        self.thread = None
        self.status = "Stopped"

    def send(self, kind, payload=None):
        self.outgoing.put(_message(kind, payload))

    def _run(self):
        try:
            while not self.stop_event.is_set():
                if self.connection is None:
                    try:
                        connection, _address = self.listener.accept()
                    except socket.timeout:
                        continue
                    try:
                        connection.settimeout(2.0)
                        _websocket_handshake(connection, self.allowed_origins)
                        connection.settimeout(0.08)
                        self.connection = connection
                        self.authenticated = False
                        self.status = "Editor connected; waiting for token"
                    except Exception as error:
                        self.status = "Handshake rejected: " + str(error)
                        connection.close()
                    continue
                self._service_connection()
        except Exception as error:
            if not self.stop_event.is_set():
                self.status = "Server error: " + str(error)
        finally:
            for sock in (self.connection, self.listener):
                if sock:
                    try:
                        sock.close()
                    except OSError:
                        pass
            self.connection = None
            self.listener = None
            self.authenticated = False
            if self.stop_event.is_set():
                self.status = "Stopped"

    def _service_connection(self):
        try:
            while True:
                packet = self.outgoing.get_nowait()
                _send_frame(self.connection, _json_bytes(packet))
        except queue.Empty:
            pass
        try:
            opcode, payload = _read_frame(self.connection)
        except socket.timeout:
            return
        except Exception as error:
            self.status = "Disconnected: " + str(error)
            try:
                self.connection.close()
            except OSError:
                pass
            self.connection = None
            self.authenticated = False
            return
        if opcode == 8:
            self.connection.close()
            self.connection = None
            self.authenticated = False
            self.status = "Editor disconnected"
            return
        if opcode == 9:
            _send_frame(self.connection, payload, opcode=10)
            return
        if opcode == 2:
            if not self.authenticated:
                self.status = "Binary transfer rejected: authenticate first"
                return
            try:
                transfer_id, index, data = _binary_asset_chunk(payload)
                self.incoming.put({"type": "asset.binary.chunk", "payload": {"transferId": transfer_id, "index": index, "data": data}})
            except (ValueError, UnicodeDecodeError) as error:
                self.status = "Binary transfer rejected: " + str(error)
            return
        if opcode != 1:
            return
        try:
            packet = json.loads(payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        if packet.get("protocol") != PROTOCOL or packet.get("version") != PROTOCOL_VERSION:
            self.send("error", {"message": "Protocol/version mismatch"})
            return
        if not self.authenticated:
            if packet.get("type") != "hello" or not secrets.compare_digest(str(packet.get("payload", {}).get("token", "")), self.token):
                self.send("error", {"message": "Invalid Live Link token"})
                return
            self.authenticated = True
            self.status = "Live sync connected"
            self.send("hello.accepted", {"role": "blender", "addonVersion": ADDON_VERSION, "capabilities": ["scene-transforms", "scene-snapshot", "glb-assets", "scene-batches-v1", "canonical-assets-v1", "linked-instances-v1", "conflicts"]})
            return
        self.incoming.put(packet)


_THREE_TO_BLENDER = Matrix(((1.0, 0.0, 0.0, 0.0), (0.0, 0.0, -1.0, 0.0), (0.0, 1.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0)))


def _ensure_id(obj):
    value = str(obj.get("lk_bridge_id", "")).strip()
    if not value:
        value = "blender-" + uuid.uuid4().hex
        obj["lk_bridge_id"] = value
    return value


def _three_matrix(transform):
    position = transform.get("position", (0.0, 0.0, 0.0))
    quaternion = transform.get("quaternion", (0.0, 0.0, 0.0, 1.0))
    scale = transform.get("scale", (1.0, 1.0, 1.0))
    rotation = Quaternion((float(quaternion[3]), float(quaternion[0]), float(quaternion[1]), float(quaternion[2])))
    return Matrix.LocRotScale(
        Vector(tuple(float(value) for value in position)),
        rotation,
        Vector(tuple(float(value) for value in scale[:3])),
    )


def _apply_three_transform(obj, transform):
    obj.matrix_world = _THREE_TO_BLENDER @ _three_matrix(transform) @ _THREE_TO_BLENDER.inverted_safe()
    obj.hide_viewport = not bool(transform.get("visible", True))


def _entity(obj):
    matrix = _THREE_TO_BLENDER.inverted_safe() @ obj.matrix_world @ _THREE_TO_BLENDER
    position, rotation, scale = matrix.decompose()
    parent_id = _ensure_id(obj.parent) if obj.parent else ""
    return {
        "id": _ensure_id(obj),
        "name": obj.name,
        "type": obj.type.lower(),
        "parentId": parent_id,
        "transform": {
            "position": list(position),
            "quaternion": [rotation.x, rotation.y, rotation.z, rotation.w],
            "scale": list(scale),
            "visible": not obj.hide_viewport,
        },
    }


def _entity_signature(entity):
    return json.dumps(entity, sort_keys=True, separators=(",", ":"))


def _find_object(entity_id):
    return next((obj for obj in bpy.context.scene.objects if str(obj.get("lk_bridge_id", "")) == entity_id), None)


def _apply_entity(payload, sender_id):
    global _apply_guard
    entity = payload.get("entity") or payload
    entity_id = str(entity.get("id", ""))[:160]
    if not entity_id:
        return None, "missing-id"
    obj = _find_object(entity_id)
    if obj is None:
        obj = bpy.data.objects.new(str(entity.get("name") or "Lot King Object")[:240], None)
        bpy.context.scene.collection.objects.link(obj)
        obj["lk_bridge_id"] = entity_id
    local_revision = int(obj.get("lk_link_revision", 0))
    base_revision = int(payload.get("baseRevision", 0))
    remote_revision = int(payload.get("revision", 0))
    if obj.get("lk_link_dirty", False) and base_revision < local_revision:
        obj["lk_link_conflict_remote"] = json.dumps({"payload": payload, "senderId": sender_id})
        return obj, "conflict"
    _apply_guard += 1
    try:
        obj.name = str(entity.get("name") or obj.name)[:240]
        _apply_three_transform(obj, entity.get("transform") or {})
        obj["lk_link_revision"] = max(local_revision, remote_revision)
        obj["lk_link_dirty"] = False
        if "lk_link_conflict_remote" in obj:
            del obj["lk_link_conflict_remote"]
        _last_signatures[entity_id] = _entity_signature(_entity(obj))
    finally:
        _apply_guard -= 1
    return obj, "applied"


def _apply_parent_links(entities):
    global _apply_guard
    _apply_guard += 1
    try:
        for entity in entities:
            obj = _find_object(str(entity.get("id", "")))
            parent = _find_object(str(entity.get("parentId", ""))) if entity.get("parentId") else None
            if obj and obj.parent != parent:
                world = obj.matrix_world.copy()
                obj.parent = parent
                obj.matrix_world = world
    finally:
        _apply_guard -= 1


def _scene_snapshot():
    entities = []
    for obj in bpy.context.scene.objects:
        if obj.get("lk_bridge_exclude", False) or obj.type not in {"MESH", "EMPTY", "LIGHT", "CAMERA", "ARMATURE"}:
            continue
        entity = _entity(obj)
        entity["revision"] = int(obj.get("lk_link_revision", 0))
        entity["baseRevision"] = entity["revision"]
        entities.append(entity)
        _last_signatures[entity["id"]] = _entity_signature(_entity(obj))
    return entities


def _duplicate_imported_objects(objects):
    mapping = {}
    for source in objects:
        copy = source.copy()
        bpy.context.scene.collection.objects.link(copy)
        mapping[source] = copy
    for source, copy in mapping.items():
        copy.parent = mapping.get(source.parent)
        copy.matrix_parent_inverse = source.matrix_parent_inverse.copy()
        copy.matrix_basis = source.matrix_basis.copy()
        for modifier in copy.modifiers:
            target = getattr(modifier, "object", None)
            if target in mapping:
                modifier.object = mapping[target]
        for constraint in copy.constraints:
            target = getattr(constraint, "target", None)
            if target in mapping:
                constraint.target = mapping[target]
    return list(mapping.values())


def _place_imported_instances(imported, instances):
    if not imported or not instances:
        return imported
    placed = []
    for index, instance in enumerate(instances):
        objects = imported if index == 0 else _duplicate_imported_objects(imported)
        object_set = set(objects)
        roots = [obj for obj in objects if obj.parent not in object_set]
        anchor = bpy.data.objects.new(str(instance.get("name") or "Lot King Asset")[:240], None)
        bpy.context.scene.collection.objects.link(anchor)
        anchor["lk_bridge_id"] = str(instance.get("id") or "")[:160]
        parent = _find_object(str(instance.get("parentId") or ""))
        if parent:
            anchor.parent = parent
        _apply_three_transform(anchor, instance.get("transform") or {})
        for root_object in roots:
            raw_matrix = root_object.matrix_world.copy()
            root_object.parent = anchor
            root_object.matrix_parent_inverse = Matrix.Identity(4)
            root_object.matrix_basis = raw_matrix
        placed.extend(objects)
        placed.append(anchor)
    return placed


def _import_received_asset(item):
    chunks = [chunk if isinstance(chunk, bytes) else base64.b64decode(chunk, validate=True) for chunk in item["chunks"]]
    total_bytes = sum(len(chunk) for chunk in chunks)
    if total_bytes != item["totalBytes"] or total_bytes > MAX_ASSET_BYTES:
        raise ValueError("GLB transfer size mismatch")
    handle, path = tempfile.mkstemp(prefix="lotking-live-", suffix=".glb")
    try:
        with os.fdopen(handle, "wb") as stream:
            for chunk in chunks:
                stream.write(chunk)
        entity_id = str(item.get("entityId") or "")
        entity_ids = [str(value) for value in item.get("entityIds", []) if str(value)]
        placeholders = {value: _find_object(value) for value in entity_ids}
        existing = _find_object(entity_id) if entity_id and not item.get("fullScene") else None
        full_scene = bool(item.get("fullScene"))
        scene_batch_id = str(item.get("sceneBatchId") or "")
        batch_index = max(0, int(item.get("batchIndex", 0)))
        batch_count = max(1, int(item.get("batchCount", 1)))
        canonical_owner = "__lotking_full_scene__"
        asset_owner = (("__lotking_full_scene_batch__:" + scene_batch_id) if full_scene and scene_batch_id else canonical_owner) if full_scene else entity_id
        # A multi-part push keeps the last complete scene alive until every new
        # part has imported. Starting the same batch again discards only its
        # interrupted staging objects; legacy/single-GLB pushes retain the old
        # immediate replacement contract.
        clear_owner = asset_owner if (not full_scene or not scene_batch_id or batch_index == 0) else ""
        old_asset_parts = [obj for obj in bpy.context.scene.objects if clear_owner and str(obj.get("lk_bridge_asset_owner", "")) == clear_owner]
        for bridge_id, placeholder in list(placeholders.items()):
            if placeholder in old_asset_parts:
                placeholders[bridge_id] = None
        for old in old_asset_parts:
            bpy.data.objects.remove(old, do_unlink=True)
        if existing in old_asset_parts:
            existing = None
        before = set(bpy.context.scene.objects)
        try:
            bpy.ops.import_scene.gltf(filepath=path)
        except Exception:
            for partial in [obj for obj in bpy.context.scene.objects if obj not in before]:
                bpy.data.objects.remove(partial, do_unlink=True)
            raise
        created = [obj for obj in bpy.context.scene.objects if obj not in before]
        if item.get("passthrough") and item.get("instances"):
            created = _place_imported_instances(created, item.get("instances") or [])
        if full_scene and created:
            for obj in created:
                obj["lk_bridge_asset_owner"] = asset_owner
                bridge_id = str(obj.get("editorId") or obj.get("lkBridgeId") or obj.get("lk_bridge_id") or "")
                if not bridge_id or bridge_id not in placeholders:
                    continue
                placeholder = placeholders[bridge_id]
                obj["lk_bridge_id"] = bridge_id
                if placeholder and placeholder not in created and placeholder.type == "EMPTY":
                    for child in list(placeholder.children):
                        world = child.matrix_world.copy()
                        child.parent = obj
                        child.matrix_world = world
                    bpy.data.objects.remove(placeholder, do_unlink=True)
            if scene_batch_id and batch_index == batch_count - 1:
                staged = [obj for obj in bpy.context.scene.objects if str(obj.get("lk_bridge_asset_owner", "")) == asset_owner]
                previous = [obj for obj in bpy.context.scene.objects if str(obj.get("lk_bridge_asset_owner", "")) == canonical_owner]
                for obj in previous:
                    bpy.data.objects.remove(obj, do_unlink=True)
                for obj in staged:
                    obj["lk_bridge_asset_owner"] = canonical_owner
        elif entity_id and created:
            roots = [obj for obj in created if obj.parent not in created]
            root = roots[0] if roots else created[0]
            for obj in created:
                obj["lk_bridge_asset_owner"] = entity_id
            root["lk_bridge_id"] = entity_id
            if existing and existing not in created and existing.type == "EMPTY":
                for child in list(existing.children):
                    world = child.matrix_world.copy()
                    child.parent = root
                    child.matrix_world = world
                bpy.data.objects.remove(existing, do_unlink=True)
        return created
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _process_packet(packet):
    settings = _settings()
    kind = packet.get("type")
    payload = packet.get("payload") or {}
    sender_id = str(packet.get("senderId", "editor"))
    if kind == "entity.upsert":
        obj, result = _apply_entity(payload, sender_id)
        if result == "applied" and _server:
            _server.send("entity.ack", {"id": payload.get("entity", {}).get("id"), "revision": payload.get("revision", 0)})
        if result == "conflict" and settings:
            settings.status = "Conflict paused: " + obj.name
    elif kind == "scene.snapshot":
        entities = payload.get("entities") or []
        for entity in entities:
            _apply_entity({"entity": entity, "revision": entity.get("revision", 0), "baseRevision": entity.get("baseRevision", 0)}, sender_id)
        _apply_parent_links(entities)
    elif kind == "scene.request" and _server:
        _server.send("scene.snapshot", {"entities": _scene_snapshot()})
    elif kind == "asset.begin":
        transfer_id = str(payload.get("transferId"))
        if not settings or not settings.accept_assets:
            if _server:
                _server.send("asset.reject", {"transferId": transfer_id, "reason": "Blender asset import is disabled"})
            return
        total = int(payload.get("totalBytes", 0))
        if 0 <= total <= MAX_ASSET_BYTES:
            _incoming_assets[transfer_id] = {"name": str(payload.get("name") or "Lot King Asset.glb"), "totalBytes": total, "totalChunks": int(payload.get("totalChunks", 0)), "entityId": str(payload.get("entityId", "")), "entityIds": list(payload.get("entityIds") or []), "fullScene": bool(payload.get("fullScene")), "sceneBatchId": str(payload.get("sceneBatchId") or ""), "batchIndex": int(payload.get("batchIndex", 0)), "batchCount": max(1, int(payload.get("batchCount", 1))), "passthrough": bool(payload.get("passthrough")), "instances": list(payload.get("instances") or []), "binary": bool(payload.get("binary")), "chunks": []}
        elif _server:
            _server.send("asset.reject", {"transferId": transfer_id, "reason": "Asset exceeds Live Link size limit"})
    elif kind == "asset.chunk":
        item = _incoming_assets.get(str(payload.get("transferId")))
        if item and int(payload.get("index", -1)) == len(item["chunks"]):
            item["chunks"].append(str(payload.get("data", "")))
    elif kind == "asset.binary.chunk":
        item = _incoming_assets.get(str(payload.get("transferId")))
        data = payload.get("data")
        if item and item.get("binary") and isinstance(data, bytes) and int(payload.get("index", -1)) == len(item["chunks"]):
            item["chunks"].append(data)
    elif kind == "asset.commit":
        transfer_id = str(payload.get("transferId"))
        item = _incoming_assets.pop(transfer_id, None)
        if not item or len(item["chunks"]) != item["totalChunks"]:
            if _server:
                _server.send("asset.reject", {"transferId": transfer_id, "reason": "Incomplete or unknown asset transfer"})
        else:
            try:
                _import_received_asset(item)
                if _server:
                    _server.send("asset.accept", {"transferId": transfer_id})
            except Exception as error:
                scene_batch_id = str(item.get("sceneBatchId") or "")
                if item.get("fullScene") and scene_batch_id:
                    staged_owner = "__lotking_full_scene_batch__:" + scene_batch_id
                    for obj in [candidate for candidate in bpy.context.scene.objects if str(candidate.get("lk_bridge_asset_owner", "")) == staged_owner]:
                        bpy.data.objects.remove(obj, do_unlink=True)
                if _server:
                    _server.send("asset.reject", {"transferId": transfer_id, "reason": str(error)})


def _timer():
    settings = _settings()
    if settings and _server:
        settings.status = _server.status
        for _index in range(80):
            try:
                _process_packet(_server.incoming.get_nowait())
            except queue.Empty:
                break
            except Exception as error:
                settings.status = "Apply error: " + str(error)
    return 0.08


@persistent
def _depsgraph_update(_scene, depsgraph):
    if _apply_guard or not _server or not _server.authenticated:
        return
    settings = _settings()
    if not settings or not settings.auto_sync:
        return
    seen = set()
    for update in depsgraph.updates:
        obj = getattr(update, "id", None)
        if not isinstance(obj, bpy.types.Object) or obj.name in seen or obj.get("lk_bridge_exclude", False):
            continue
        seen.add(obj.name)
        entity = _entity(obj)
        signature = _entity_signature(entity)
        if _last_signatures.get(entity["id"]) == signature:
            continue
        _last_signatures[entity["id"]] = signature
        revision = int(obj.get("lk_link_revision", 0)) + 1
        obj["lk_link_revision"] = revision
        obj["lk_link_dirty"] = True
        _server.send("entity.upsert", {"entity": entity, "revision": revision, "baseRevision": revision - 1, "author": "blender"})


class LotKingLiveLinkSettings(PropertyGroup):
    port: IntProperty(name="Preferred port", default=5200, min=1024, max=65535)
    token: StringProperty(name="Session token", default="", options={"SKIP_SAVE"})
    allowed_origins: StringProperty(name="Allowed browser origins", default=DEFAULT_ALLOWED_ORIGINS)
    auto_sync: BoolProperty(name="Live transform sync", default=True)
    accept_assets: BoolProperty(name="Accept scene assets (GLB transport)", default=True)
    status: StringProperty(name="Status", default="Stopped")


class LOTKING_OT_live_start(Operator):
    bl_idname = "lotking.live_link_start"
    bl_label = "Start local server"

    def execute(self, context):
        global _server
        settings = _settings(context)
        if _server:
            _server.stop()
            _server = None
        legacy_origins = {
            "http://localhost:5700,http://127.0.0.1:5700",
            "http://localhost:*,http://127.0.0.1:*",
        }
        if settings.allowed_origins.strip() in legacy_origins:
            settings.allowed_origins = DEFAULT_ALLOWED_ORIGINS
        if settings.port == 8765:
            settings.port = 5200
        settings.token = secrets.token_urlsafe(24)
        preferred_port = int(settings.port)
        server = None
        last_error = None
        for candidate_port in range(preferred_port, min(65536, preferred_port + 20)):
            candidate = LocalWebSocketServer(candidate_port, settings.token, settings.allowed_origins)
            try:
                candidate.start()
                server = candidate
                break
            except OSError as error:
                last_error = error
                if error.errno not in {errno.EADDRINUSE, 10048}:
                    break
            except Exception as error:
                last_error = error
                break
        if server is None:
            settings.status = "Server start failed: " + str(last_error or "no free localhost port")
            self.report({"ERROR"}, settings.status)
            return {"CANCELLED"}
        settings.port = server.port
        _server = server
        settings.status = server.status
        self.report({"INFO"}, "Lot King Live Link started on localhost")
        return {"FINISHED"}


class LOTKING_OT_live_stop(Operator):
    bl_idname = "lotking.live_link_stop"
    bl_label = "Stop server"

    def execute(self, context):
        global _server
        if _server:
            _server.stop()
            _server = None
        _settings(context).status = "Stopped"
        return {"FINISHED"}


class LOTKING_OT_live_push_scene(Operator):
    bl_idname = "lotking.live_link_push_scene"
    bl_label = "Push scene to editor"

    def execute(self, _context):
        if not _server or not _server.authenticated:
            self.report({"WARNING"}, "Connect Lot King Editor first")
            return {"CANCELLED"}
        _server.send("scene.snapshot", {"entities": _scene_snapshot()})
        self.report({"INFO"}, "Scene snapshot queued")
        return {"FINISHED"}


class LOTKING_OT_live_send_glb(Operator):
    bl_idname = "lotking.live_link_send_glb"
    bl_label = "Send selected asset"

    def execute(self, context):
        if not _server or not _server.authenticated:
            self.report({"WARNING"}, "Connect Lot King Editor first")
            return {"CANCELLED"}
        selected = list(context.selected_objects)
        if not selected:
            self.report({"WARNING"}, "Select at least one object")
            return {"CANCELLED"}
        handle, path = tempfile.mkstemp(prefix="lotking-send-", suffix=".glb")
        os.close(handle)
        try:
            bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_extras=True)
            with open(path, "rb") as stream:
                raw = stream.read(MAX_ASSET_BYTES + 1)
        finally:
            try:
                os.unlink(path)
            except OSError:
                pass
        if len(raw) > MAX_ASSET_BYTES:
            self.report({"ERROR"}, "Selected GLB exceeds 1 GiB live-link limit")
            return {"CANCELLED"}
        transfer_id = "asset-" + uuid.uuid4().hex
        chunks = [base64.b64encode(raw[offset:offset + CHUNK_BYTES]).decode("ascii") for offset in range(0, len(raw), CHUNK_BYTES)]
        _server.send("asset.begin", {"transferId": transfer_id, "name": selected[0].name + ".glb", "totalBytes": len(raw), "totalChunks": len(chunks), "entityId": _ensure_id(selected[0])})
        for index, data in enumerate(chunks):
            _server.send("asset.chunk", {"transferId": transfer_id, "index": index, "data": data})
        _server.send("asset.commit", {"transferId": transfer_id})
        self.report({"INFO"}, "Selected asset queued for Lot King Editor")
        return {"FINISHED"}


class LOTKING_OT_live_resolve(Operator):
    bl_idname = "lotking.live_link_resolve"
    bl_label = "Resolve Live Link conflict"

    choice: StringProperty(default="local")

    def execute(self, context):
        obj = context.active_object
        raw = obj and obj.get("lk_link_conflict_remote")
        if not raw:
            self.report({"WARNING"}, "Active object has no Live Link conflict")
            return {"CANCELLED"}
        conflict = json.loads(raw)
        if self.choice == "remote":
            obj["lk_link_dirty"] = False
            _apply_entity(conflict["payload"], conflict.get("senderId", "editor"))
        else:
            if "lk_link_conflict_remote" in obj:
                del obj["lk_link_conflict_remote"]
            obj["lk_link_dirty"] = True
            if _server:
                entity = _entity(obj)
                revision = int(obj.get("lk_link_revision", 0)) + 1
                obj["lk_link_revision"] = revision
                _server.send("entity.upsert", {"entity": entity, "revision": revision, "baseRevision": revision - 1, "author": "blender"})
        return {"FINISHED"}


class LOTKING_PT_live_link(Panel):
    bl_label = "Live Link"
    bl_idname = "LOTKING_PT_live_link"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Lot King"

    def draw(self, context):
        layout = self.layout
        settings = _settings(context)
        running = _server is not None
        layout.label(text="Lot King Live Link " + ADDON_VERSION, icon="PLUGIN")
        warning = layout.box()
        warning.alert = True
        warning.label(text="EXPERIMENTAL", icon="ERROR")
        warning.label(text="Coverage and round-trip fidelity may vary")
        layout.label(text=settings.status, icon="LINKED" if running and _server.authenticated else "UNLINKED")
        layout.prop(settings, "port")
        layout.label(text="Recommended automatic range: 5200-5219", icon="INFO")
        layout.prop(settings, "allowed_origins")
        row = layout.row(align=True)
        row.operator("lotking.live_link_start", icon="PLAY")
        row.operator("lotking.live_link_stop", icon="PAUSE")
        if settings.token:
            box = layout.box()
            box.label(text="Copy this token into Lot King Editor")
            box.prop(settings, "token", text="Token")
        layout.prop(settings, "auto_sync")
        layout.prop(settings, "accept_assets")
        layout.separator()
        row = layout.row(align=True)
        row.enabled = running and _server.authenticated
        row.operator("lotking.live_link_push_scene", icon="EXPORT")
        row.operator("lotking.live_link_send_glb", icon="FILE_3D")
        obj = context.active_object
        if obj and obj.get("lk_link_conflict_remote"):
            box = layout.box()
            box.alert = True
            box.label(text="Conflict: " + obj.name, icon="ERROR")
            remote = box.operator("lotking.live_link_resolve", text="Use Editor version")
            remote.choice = "remote"
            local = box.operator("lotking.live_link_resolve", text="Keep Blender version")
            local.choice = "local"
        layout.label(text="No .blend save required", icon="INFO")


CLASSES = (
    LotKingLiveLinkSettings,
    LOTKING_OT_live_start,
    LOTKING_OT_live_stop,
    LOTKING_OT_live_push_scene,
    LOTKING_OT_live_send_glb,
    LOTKING_OT_live_resolve,
    LOTKING_PT_live_link,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.lotking_live_link = bpy.props.PointerProperty(type=LotKingLiveLinkSettings)
    if _depsgraph_update not in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.append(_depsgraph_update)
    if not bpy.app.timers.is_registered(_timer):
        bpy.app.timers.register(_timer, persistent=True)


def unregister():
    global _server
    if _server:
        _server.stop()
        _server = None
    if _depsgraph_update in bpy.app.handlers.depsgraph_update_post:
        bpy.app.handlers.depsgraph_update_post.remove(_depsgraph_update)
    if bpy.app.timers.is_registered(_timer):
        bpy.app.timers.unregister(_timer)
    if hasattr(bpy.types.Scene, "lotking_live_link"):
        del bpy.types.Scene.lotking_live_link
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)
