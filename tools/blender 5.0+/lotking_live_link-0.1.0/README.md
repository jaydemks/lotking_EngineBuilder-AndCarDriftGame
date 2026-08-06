# Lot King Live Link for Blender 5.0+

This add-on turns the open Blender scene into a live authoring surface for Lot King Editor. It does **not** save or require a `.blend` project. Persistence remains in the Lot King level/project.

## Install and connect

1. Install `lotking_live_link-0.1.9.zip`, or choose **Install from Disk** in Blender and select this folder's `blender_manifest.toml`.
2. In Blender open **3D View → N sidebar → Lot King → Live Link**.
3. Press **Start local server**. Port `5200` is preferred; if occupied, Blender selects the next free port through `5219`. Copy the generated session token.
4. In Lot King Editor enable/open **Plugins → Blender Live Link** and paste the token. The Editor discovers the active local port automatically.
5. Use **Push full scene** to send identities plus responsive binary batches containing all renderable roots, meshes, materials, textures, skeletons and animations. Imported FBX and GLTF/GLB assets are included from their live Editor scene representation; binary GLB is only the interchange format. Afterwards transforms synchronize automatically. Use **Send selected asset** for an individual refresh.

Version 0.1.9 receives each canonical project asset once and creates linked
Blender instances from Lot King scene references. Only generated geometry with
no stored source file passes through the Editor-side GLTF exporter.

Blender objects receive a custom `lk_bridge_id`; Lot King objects retain their existing `editorId`. These IDs, not display names, identify objects across renames.

## Conflict behavior

Each object has an independent revision. If both applications change the same object before they acknowledge the same base revision, the remote edit is paused as a conflict. Choose **Use Editor version** or **Keep Blender version** in the Blender panel, or the matching choice in the editor plugin. Remote deletion is intentionally not automatic.

## Security and limits

- The server binds only to `127.0.0.1`; it cannot listen on the LAN.
- A fresh random token is required before any scene message is accepted.
- Browser origins are checked against **Allowed browser origins**. Localhost and
  127.0.0.1 are allowed on every local HTTP port by default; remote/LAN origins
  remain rejected.
- JSON messages are capped at 3 MiB per WebSocket frame. Full-scene GLBs use 2 MiB binary frames with back-pressure and are capped at 1 GiB per transfer.
- Imported files are written to the operating system temporary directory and deleted immediately after Blender imports them.
- No Python package installation and no cloud service are required.

## Coordinate system

The protocol labels transforms as Three.js Y-up. The add-on converts them to and from Blender Z-up using a basis matrix, including quaternion rotation and non-uniform scale.
