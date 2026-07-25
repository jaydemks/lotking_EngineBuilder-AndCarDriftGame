# Cloth Studio

Cloth Studio is the default-enabled Character and Soccer Pawn plugin for garments, capes and other skinned fabric. It lives inside Pawn Studio so cloth is authored beside the Main Mesh, skeleton and animation set, then uses the same saved configuration in the isolated viewport, editor Play Preview and playable export.

## Preparing a garment

For predictable performance, make the garment a **separate `SkinnedMesh`** under the same armature as the body. A cape, skirt or coat tail should not be merged into the body mesh. Give every garment a unique mesh name; names containing `cloth`, `fabric`, `cape`, `cloak`, `skirt`, `dress`, `robe` or `scarf` can be detected automatically.

The preferred pin mask uses vertex colors:

- White pins a vertex to the animated skeleton.
- Red frees a vertex for simulation.
- Intermediate colors create a soft transition.

This follows the practical convention demonstrated by `three-simplecloth`. If the source has no vertex colors, choose **Top** to pin a configurable upper band, or paint a sparse override directly in Pawn Studio.

## Authoring workflow

1. Open a Character or Soccer Logic Element in Pawn Studio.
2. Assign the rigged character and garment through **Main Mesh**.
3. Open **Cloth Studio** and use **Auto Detect**, or add a Cloth Piece and select its mesh.
4. Choose the pin source. Use **Paint Cloth** or **Paint Pin** in the viewport for local corrections.
5. Adjust stiffness, damping, gravity, wind, substeps and constraint iterations.
6. Keep automatic bone colliders enabled, or add explicit per-piece bone spheres with radius and local XYZ offset.
7. Rebuild and reset the isolated preview, then verify the same Pawn in Play Preview.

Painted values, pieces and collider definitions are saved in the Pawn graph. Each piece remains independent. Custom colliders replace the automatic collider set only for that piece.

## Backends and portability

The component has a renderer-independent backend boundary. The current release executes a deterministic CPU Verlet solver (`cpu-portable`) in WebGL, Safari, the editor and playable exports. Selecting WebGPU is preserved as an author preference but deliberately reports the CPU parity backend until the engine-wide WebGPU/TSL renderer passes the existing post-processing, export and macOS compatibility gates.

This is intentional: the official Three.js example uses `WebGPURenderer`, TSL compute nodes and storage buffers, while Lot King currently guarantees a WebGL release path. The authoring schema does not depend on either implementation, so a future GPU backend can consume the same garment masks, forces and colliders without changing projects.

## Performance and safety

- Use a low- or medium-density garment and let the character body remain a normal skinned mesh.
- Start with Medium quality. Raise substeps for fast movement and iterations for stiff fabric only when required.
- Cloth Studio reports vertex count, indexing and mask availability for the selected garment.
- The default safety limit is 50,000 simulated vertices per piece. A piece above the limit is rejected instead of freezing the editor; raising the limit is an explicit author choice.
- The solver clamps large frame deltas, updates after skeleton animation and restores the authored garment when the component or plugin is disabled.

## Source references

The authoring workflow and separated-garment approach are inspired by [bandinopla/three-simplecloth](https://github.com/bandinopla/three-simplecloth), MIT licensed, Copyright 2026 bandinopla.

The GPU architecture reference is the official [Three.js WebGPU compute-cloth example](https://github.com/mrdoob/three.js/blob/a58e9ecf225b50e4a28a934442e854878bc2a959/examples/webgpu_compute_cloth.html). Lot King does not claim that example's WebGPU backend is active while the effective backend reports `cpu-portable`.
