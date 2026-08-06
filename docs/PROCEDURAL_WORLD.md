# Procedural World: terrain, water and archipelago

The Procedural World is a saved per-level world envelope. It surrounds authored
content with a deterministic island field, ocean, optional lakes/rivers and an
instanced distant archipelago. Editor, Play, menu backgrounds and playable ZIPs
run the same modules and schema.

## Coordinate contract

Existing level content is never batch-translated. Mesh transforms, Pawn spawns,
colliders, triggers, cameras, Cinema keyframes and network state all use absolute
world coordinates, so a physical `+20 m` migration would break their shared
relationships. The authored work plane therefore remains exactly `Y=0` and is
the protected island plateau. Coast and relief begin outside the automatically
measured level footprint; sea and seabed descend below it. This produces the
requested elevated-island composition while old projects remain compatible.

`procedural-terrain.js` owns the one deterministic height field used by visual
vertices, Character ground queries and Cannon Heightfield samples. The rendered
plateau is offset downward by only 3.5 cm to avoid z-fighting with an authored
ground mesh; the authoritative terrain/collision height remains exactly zero.

## Modules and ownership

- `procedural-world-schema.js` normalizes versioned settings without depending
  on Three.js. Missing settings migrate to the cinematic-island default and an
  explicit `enabled:false` remains a permanent per-level opt-out.
- `procedural-terrain.js` builds the protected plateau, continuous coast,
  deterministic relief and underwater terrain from a rounded-rectangle field.
- `procedural-water.js` builds single-pass PBR ocean, lakes and river ribbons.
  The near ocean geometry follows the camera on a snapped grid and evaluates a
  bounded directional wave set with analytic normals and crest foam.
- `procedural-archipelago.js` places seeded large/small horizon islands through
  one `InstancedMesh` draw call.
- `procedural-world-system.js` owns configuration, scene-bound calculation,
  rebuilds, ground-query delegation and WebGPU-safe deferred GPU disposal.

The system root is runtime-owned and is not an authorable Scene object. Its
configuration is stored once as `scene.proceduralWorld`; Save, LKEP, menu roles
and playable export therefore retain the same world without serializing generated
vertices.

## Rendering and performance

Water deliberately does not use planar reflection/refraction render targets.
Those double scene cost, are unsuitable as a mobile default and add transient GPU
resources to the same submit lifecycle that previously exposed WebGPU destroyed-
resource failures. The default uses standard/physical Three.js materials,
environment lighting, animated geometry and normals, so WebGL and WebGPU share
one path.

`auto` quality resolves to Low for mobile/menu previews, Medium for constrained
or high-pixel-density displays and High for desktop. Terrain is one mesh, the
ocean is a static horizon plus one animated near field, and all far islands use
one instance draw. Rebuilds happen only after level/config changes and retire GPU
resources through the rendering backend's deferred release queue.

## Editor controls

Environment → **Procedural World / Terrain / Water** exposes enable/opt-out,
preset, deterministic seed, protected margin, terrain and water quality, relief,
coast width, sea/fondale levels, wave shape/foam and distant island count. It can
also add a persisted lake or three-point river at the current camera position.
The panel reports current draw-call and vertex budgets.

## Technical references

The implementation follows the renderer-neutral Three.js material/geometry
contracts documented for `WebGPURenderer`, `MeshPhysicalMaterial`,
`InstancedMesh`, `BufferGeometry` and the official Water object. The visual ideas
are reproduced through an original single-pass implementation; no Water Pro or
other commercial source/code/assets are copied.
