# Blender Live Link architecture

Lot King Blender Live Link consists of two coordinated, optional plugins:

- `js/plugins/blender-live-link-core.js` defines the versioned wire protocol, stable serialization, chunking and per-entity revision journal.
- `js/plugins/blender-live-link-plugin.js` is the Lot King Editor client and user interface.
- `tools/blender 5.0+/lotking_live_link-0.1.0` is the Blender 5.0+ add-on and localhost WebSocket server.

The open Lot King level is the persistent source of truth. Blender is deliberately treated as an attached live authoring process: no `.blend` save or reload participates in the protocol.

## Installazione e avvio rapido

1. In Blender 5.0+, open **Edit → Preferences → Extensions → Install from
   Disk** and select `tools/blender 5.0+/lotking_live_link-0.1.9.zip`.
2. In the 3D View open the `N` sidebar, select **Lot King → Live Link**, keep the
   preferred port `5200` and press **Start local server**. If it is occupied,
   Blender selects the next free local port and the Editor discovers it.
3. Copy the generated session token. In Lot King Editor open
   **Plugins → Blender Live Link → Open Blender Live Link**, leave
   `ws://127.0.0.1:5200`, paste the token and press **Connect**.
4. Use **Push full scene to Blender** for hierarchy, meshes, materials,
   textures, skeletons and animations in responsive back-pressured binary batches,
   or
   **Pull scene from Blender** for the current Blender hierarchy. With Live
   transform sync enabled, subsequent position, rotation and scale edits are
   mirrored at authoring rate.
5. Geometry, materials, skeletons and animations use the explicit
   **Send selected asset** action on either side. This avoids re-exporting a
   large model on every transform or mesh-edit event while still importing the
   received GLB into the canonical Lot King project asset store.

Fast referenced full-scene transfer requires add-on 0.1.9 or newer. The Editor reads the add-on
version during the authenticated handshake and refuses a batched push against
an older listener, preventing an old add-on from retaining only the last batch.

The token changes every time Blender starts the server. It is intentionally not
stored in a `.blend` file. Only one Editor connection is accepted by a Blender
server instance in protocol v1.

The Editor retries the localhost connection while Blender finishes starting and
reports endpoint, attempt and authentication failures separately. The add-on
accepts browser origins on any `localhost` / `127.0.0.1` HTTP port and the
official `https://jaydemks.github.io` Editor by default; it still binds the
WebSocket listener only to `127.0.0.1` and still requires the fresh token. This
supports the private editor on `5700`, test/editor servers and the official
hosted build without opening the bridge to arbitrary internet or LAN origins.

## Data flow

```text
Lot King object editorId               Blender custom property lk_bridge_id
             │                                        │
             └──────── entity.upsert / snapshot ──────┘
                              │
                      per-object revision
                              │
                    explicit conflict queue

Lot King GLTFExporter ── chunked GLB ── Blender temporary import
Lot King asset import  ── chunked GLB ── Blender selected export
```

Transforms are sent as Three.js Y-up position/quaternion/scale and converted with a basis matrix in Blender. Sending quaternions avoids Euler-order ambiguity. Parent links are applied only after every object in a snapshot exists.

## Identity and conflicts

Names are labels and may change. `editorId` / `lk_bridge_id` is the authoritative identity. Each entity tracks `revision` and `baseRevision`. If a remote operation is based on an older revision while the receiving side has an unacknowledged local change, it is not silently applied: it appears in the conflict UI.

Scene deletion is not part of v1. This is intentional because a missing object in a partial snapshot must never delete authored project data. A future deletion protocol needs an explicit tombstone plus user-confirmed project transaction.

## Asset semantics

Transform synchronization does not continually re-export geometry. Geometry,
materials, textures, skeletons and animation are transferred explicitly as
binary GLB batches over back-pressured WebSocket binary frames. GLB is the
interchange format: FBX, GLTF/GLB and procedural assets already loaded into the
Editor scene are all collected from their live Three.js representation. Full Scene includes
built-in level construction, authored Logic Element visuals and the procedural
worldscape while omitting editor helpers, collider previews and transient
effects. The receiving editor uses its normal asset import service, so the GLB
enters project asset persistence rather than becoming an ephemeral object URL.
Blender uses an OS temporary GLB and removes it immediately after import.

For speed, an existing canonical project GLB bypasses Three.js export entirely.
This also covers FBX sources because the import pipeline already keeps their
compiled runtime GLB. The file is sent once per unique project asset and Blender
creates linked instances at the transforms carried by the scene references.
Only generated geometry without a canonical file is encoded by `GLTFExporter`.

## Security boundary

The Blender endpoint binds to `127.0.0.1`, accepts only configured local browser
`Origin` rules, and authenticates every new connection with a freshly generated
192-bit token. It uses no cloud signaling and accepts neither arbitrary file
paths nor remote Python execution. Frame and transfer limits prevent unbounded
allocation.

## Editor host integration

The Editor already loads the core before the plugin, registers
`LK_BLENDER_LIVE_LINK_PLUGIN` with the plugin manager, and exposes the canonical
asset import, dirty-state, viewport placement, outliner and asset-panel refresh
services. The bridge therefore stays outside editor internals while received
GLBs enter normal project persistence.
