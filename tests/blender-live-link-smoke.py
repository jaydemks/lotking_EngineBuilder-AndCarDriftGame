"""Blender 5.0 headless smoke test for the Lot King Live Link add-on."""

import importlib.util
import json
import os
import socket
import struct
import time
from pathlib import Path

import bpy


REPO = Path(__file__).resolve().parents[1]
ADDON_PATH = REPO / "tools" / "blender 5.0+" / "lotking_live_link-0.1.0" / "__init__.py"
SPEC = importlib.util.spec_from_file_location("lotking_live_link_smoke", ADDON_PATH)
ADDON = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ADDON)
ADDON.register()


def recv_exact(connection, count):
    data = bytearray()
    while len(data) < count:
        part = connection.recv(count - len(data))
        if not part:
            raise ConnectionError("WebSocket closed")
        data.extend(part)
    return bytes(data)


def send_masked_json(connection, value):
    payload = json.dumps(value, separators=(",", ":")).encode("utf-8")
    mask = os.urandom(4)
    size = len(payload)
    header = bytearray([0x81])
    if size < 126:
        header.append(0x80 | size)
    elif size <= 0xFFFF:
        header.append(0x80 | 126)
        header.extend(struct.pack("!H", size))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack("!Q", size))
    encoded = bytes(value ^ mask[index % 4] for index, value in enumerate(payload))
    connection.sendall(bytes(header) + mask + encoded)


def receive_json(connection):
    first, second = recv_exact(connection, 2)
    size = second & 0x7F
    if size == 126:
        size = struct.unpack("!H", recv_exact(connection, 2))[0]
    elif size == 127:
        size = struct.unpack("!Q", recv_exact(connection, 8))[0]
    assert first & 0x0F == 1
    return json.loads(recv_exact(connection, size).decode("utf-8"))


def envelope(kind, payload):
    return {
        "protocol": ADDON.PROTOCOL,
        "version": ADDON.PROTOCOL_VERSION,
        "type": kind,
        "messageId": "smoke-" + kind,
        "senderId": "editor-smoke",
        "sentAt": "2026-08-05T00:00:00Z",
        "payload": payload,
    }

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_cube_add(location=(1.0, 2.0, 3.0))
parent = bpy.context.active_object
parent.name = "Live Parent"
bpy.ops.mesh.primitive_cube_add(location=(2.0, 2.5, 3.5))
child = bpy.context.active_object
child.name = "Live Child"
child.parent = parent

snapshot = ADDON._scene_snapshot()
assert len(snapshot) == 2
by_name = {item["name"]: item for item in snapshot}
assert by_name["Live Parent"]["id"] == parent["lk_bridge_id"]
assert by_name["Live Child"]["parentId"] == parent["lk_bridge_id"]
assert len(parent["lk_bridge_id"]) >= 32

settings = bpy.context.scene.lotking_live_link
settings.port = 18765
result = bpy.ops.lotking.live_link_start()
assert result == {"FINISHED"}
assert len(settings.token) >= 32
deadline = time.monotonic() + 2.0
while ADDON._server.status == "Starting" and time.monotonic() < deadline:
    time.sleep(0.02)
assert ADDON._server.listener is not None, ADDON._server.status
assert ADDON._server.listener.getsockname()[0] == "127.0.0.1"
assert "127.0.0.1" in ADDON._server.status
assert ADDON._origin_allowed("http://localhost:4173", settings.allowed_origins)
assert ADDON._origin_allowed("https://jaydemks.github.io", settings.allowed_origins)
assert not ADDON._origin_allowed("https://remote.example", settings.allowed_origins)

# Real browser-compatible WebSocket upgrade, token authentication and both
# directions of scene exchange. This catches Origin, masking and server-timer
# failures that a simple listener-bind smoke test cannot see.
connection = socket.create_connection(("127.0.0.1", settings.port), timeout=2.0)
connection.settimeout(2.0)
connection.sendall(
    b"GET / HTTP/1.1\r\n"
    b"Host: 127.0.0.1:18765\r\n"
    b"Upgrade: websocket\r\n"
    b"Connection: Upgrade\r\n"
    b"Origin: https://jaydemks.github.io\r\n"
    b"Sec-WebSocket-Version: 13\r\n"
    b"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n"
)
response = bytearray()
while b"\r\n\r\n" not in response:
    response.extend(connection.recv(4096))
assert response.startswith(b"HTTP/1.1 101"), response

send_masked_json(connection, envelope("hello", {"token": settings.token, "role": "editor"}))
accepted = receive_json(connection)
assert accepted["type"] == "hello.accepted", accepted
assert accepted["payload"]["addonVersion"] == "0.1.9", accepted
assert "scene-batches-v1" in accepted["payload"]["capabilities"], accepted
assert "canonical-assets-v1" in accepted["payload"]["capabilities"], accepted
assert "linked-instances-v1" in accepted["payload"]["capabilities"], accepted
assert ADDON._server.authenticated

send_masked_json(connection, envelope("scene.request", {}))
deadline = time.monotonic() + 2.0
while ADDON._server.incoming.empty() and time.monotonic() < deadline:
    time.sleep(0.01)
ADDON._timer()
remote_snapshot = receive_json(connection)
assert remote_snapshot["type"] == "scene.snapshot", remote_snapshot
assert len(remote_snapshot["payload"]["entities"]) == 2

parent_entity = by_name["Live Parent"].copy()
parent_entity["name"] = "Live Parent Synced"
send_masked_json(connection, envelope("entity.upsert", {"entity": parent_entity, "revision": 1, "baseRevision": 0}))
deadline = time.monotonic() + 2.0
while ADDON._server.incoming.empty() and time.monotonic() < deadline:
    time.sleep(0.01)
ADDON._timer()
assert parent.name == "Live Parent Synced"
ack = receive_json(connection)
assert ack["type"] == "entity.ack", ack
connection.close()

result = bpy.ops.lotking.live_link_stop()
assert result == {"FINISHED"}
assert ADDON._server is None
assert settings.status == "Stopped"

ADDON.unregister()
print("Blender Lot King Live Link 0.1.9 authenticated bidirectional smoke test passed")
