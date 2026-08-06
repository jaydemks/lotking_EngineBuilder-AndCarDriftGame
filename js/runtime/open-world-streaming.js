/* =========================================================
   LOT KING - Open World chunk streaming and LOD

   The technical half of the district ring. js/runtime/open-world-districts.js
   authors what is COLLIDABLE - terrain proxies, roads, POIs - once, into the
   ordinary editor scene, so the Cannon static set is built one time and never
   churns. This module owns everything VISUAL and transient: the terrain skin,
   the vegetation, the repeated buildings, and the level of detail each of them
   is drawn at right now.

   That split is the whole performance argument. A world 8.8x larger cannot
   rebuild its physics world every time the player crosses a cell line
   (physics-world.js rebuildStatics is one of the most expensive synchronous
   operations in the engine), so nothing this module creates ever registers a
   collider.

   WHAT THE AAA REFERENCES CONTRIBUTED
     - UE5 World Partition / "Streaming in Sunset Overdrive's Open World" (GDC):
       fixed square cells, resident set = cell + neighbours, and HIERARCHICAL
       LOD past the near ring. Streaming 350 m tiles out to a 4 km view would
       need ~460 draw calls for terrain alone; the far ring is therefore a
       coarser BLOCK grid of 1408 m, which is what keeps the total near 90.
     - "GPU-Based Run-Time Procedural Placement in Horizon Zero Dawn"
       (van Muijden, GDC 2017): determinism and local stability. Every scatter
       instance is a pure function of (seed, integer tile, index), so a tile
       thrown away and rebuilt later is bit-identical and no placement state is
       ever saved or restored.
     - Browser landscape streaming practice (three.js): 17x17 / 33x33 heightmap
       LODs, a per-frame terrain budget of a few milliseconds rather than a
       chunk count, and prefetch ahead along the velocity vector rather than
       around the current position.
     - Octahedral impostor practice (Simplygon / InstaLOD): past a threshold a
       tree is a camera-facing quad, not a mesh. LOD3 here is the cheap version
       of that idea - one shared cross-billboard instanced pool.

   NO ALLOCATION IN THE FRAME LOOP. Every array, matrix and vector below is
   created once at install time. `update` walks preallocated buffers and
   integer keys; it never builds a string key, never closes over a new
   function, and never allocates a Vector3.

   HOW THIS FILE IS ORGANISED
     00  identity and contract
     01  quality tiers     low / medium / high / ultra, and the auto fallback
     02  grids             tile grid, block grid, integer keys
     03  lod ladder        the four levels and the distance each starts at
     04  scatter classes   what a theme grows, and how dense
     05  slot allocator    the instanced-pool bookkeeping, pure and testable
     06  scheduler         resident-set planning and the per-frame budget
     07  three.js builders terrain meshes, scatter pools, impostors
     08  weather and time  throttled response to the shared directors
     09  system and install
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;

// ================================================== 00 identity and contract

const SCHEMA_VERSION = 1;

function districts(){ return root.LK_RUNTIME_OPEN_WORLD_DISTRICTS || null; }
function three(){ return root.THREE || null; }

function clamp(value, min, max){
  value = Number(value);
  if(!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

// ============================================================ 01 quality tiers
//
// Ordered cheapest first, because that is the order the fallback walks. A tier
// is the complete streaming contract: how far the world is drawn, how much of
// it may be built in one frame, and how many instances the scatter pools may
// hold. `autoTier` picks one from the pre-benchmark's own verdict rather than
// guessing from the user agent.

function tier(id, label, viewDistance, nearRadius, buildsPerFrame, buildMs, scatterCapacity, scatterScale){
  return Object.freeze({id, label, viewDistance, nearRadius, buildsPerFrame, buildMs, scatterCapacity, scatterScale});
}

const TIERS = Object.freeze({
  low:    tier('low',    'Low',    2100, 420,  1, 1.5, 2400,  .35),
  medium: tier('medium', 'Medium', 3200, 700,  2, 2.5, 6000,  .65),
  high:   tier('high',   'High',   4400, 1050, 3, 4.0, 12000, 1),
  ultra:  tier('ultra',  'Ultra',  5600, 1400, 4, 6.0, 20000, 1.35),
});
const TIER_IDS = Object.freeze(['low', 'medium', 'high', 'ultra']);

function tierOf(id){
  const found = TIERS[String(id)];
  if(!found) throw new Error('Open World streaming: unknown quality tier "' + id + '"');
  return found;
}

/** The tier a machine should start on. The engine already measures itself in
 *  js/runtime/pre-benchmark.js; this reads that verdict when it exists and
 *  otherwise stays in the middle rather than assuming a fast GPU. */
function autoTier(GAME){
  const benchmark = GAME && GAME.assets && GAME.assets.benchmark;
  const report = benchmark && benchmark.report ? benchmark.report() : null;
  const fps = report && Number(report.fps);
  if(!Number.isFinite(fps) || fps <= 0){
    const low = !!(GAME && GAME.state && GAME.state.adaptiveLow);
    return low ? 'low' : 'medium';
  }
  if(fps < 34) return 'low';
  if(fps < 52) return 'medium';
  if(fps < 88) return 'high';
  return 'ultra';
}

// ==================================================================== 02 grids
//
// Two grids, not one. The near grid carries relief and vegetation; the far grid
// carries silhouette. Both are whole divisions of the district pitch, so a tile
// edge, a block edge and a district edge always coincide and a seam can never
// fall inside a cell.
//
//   TILE  = DISTRICT_PITCH / 8   = 352 m   near terrain, scatter source
//   BLOCK = DISTRICT_PITCH / 2   = 1408 m  far terrain (hierarchical LOD)

const TILE_DIVISOR = 8;
const BLOCK_DIVISOR = 2;

// Integer keys. A string key per cell would allocate on every plan pass and
// hand the collector a few hundred short-lived strings per second.
const KEY_BIAS = 64;
const KEY_STRIDE = 256;
function cellKey(ix, iz){ return (ix + KEY_BIAS) * KEY_STRIDE + (iz + KEY_BIAS); }
function keyToIx(key){ return Math.floor(key / KEY_STRIDE) - KEY_BIAS; }
function keyToIz(key){ return (key % KEY_STRIDE) - KEY_BIAS; }

// =============================================================== 03 lod ladder
//
// Four levels, listed in the order the eye meets them. `verts` is the heightmap
// resolution of one cell at that level; `until` is the distance in metres at
// which the level stops being used, scaled by the tier's view distance so the
// same ladder describes a 2.1 km low-end world and a 5.6 km ultra one.

const LOD = Object.freeze([
  Object.freeze({level:0, grid:'tile',  verts:33, untilFraction:.45, scatter:'mesh',     label:'Near mesh'}),
  Object.freeze({level:1, grid:'tile',  verts:17, untilFraction:1,   scatter:'mesh',     label:'Mid mesh'}),
  Object.freeze({level:2, grid:'block', verts:17, untilFraction:.62, scatter:'impostor', label:'Far block'}),
  Object.freeze({level:3, grid:'block', verts:5,  untilFraction:1,   scatter:'none',     label:'Silhouette block'}),
]);
const LOD_TILE = Object.freeze([LOD[0], LOD[1]]);
const LOD_BLOCK = Object.freeze([LOD[2], LOD[3]]);

/** The LOD level for a cell centre at `distance` metres. The two grids each own
 *  two levels and are selected by which grid the caller is planning, because a
 *  1408 m block and a 352 m tile must never be picked by the same threshold -
 *  that is what used to let a far block draw over near tiles. Returns -1 when
 *  the cell is past that grid's radius and must not be resident. */
function lodForDistance(distance, quality, grid){
  if(grid === 'block'){
    if(distance > quality.viewDistance) return -1;
    return distance <= quality.viewDistance * LOD_BLOCK[0].untilFraction ? 2 : 3;
  }
  if(distance > quality.nearRadius) return -1;
  return distance <= quality.nearRadius * LOD_TILE[0].untilFraction ? 0 : 1;
}

// ========================================================== 04 scatter classes
//
// What a district theme grows, in the order it is read on the ground: the thing
// that makes the silhouette first, then what fills between it, then the litter.
// `perHectare` is instances per 10 000 m^2 at density 1; a tile of 352 m is
// 12.4 hectares, so a forest tile at 34/ha is about 420 instances.

function scatterClass(spec){ return Object.freeze(Object.assign({impostor:true, tilt:.06}, spec)); }

const SCATTER = Object.freeze({
  // -- trees and canopy
  pine:        scatterClass({prim:'cone',     color:0x28402f, radius:3.4, height:17, perHectare:26, scaleMin:.7,  scaleMax:1.5,  trunk:0x453528}),
  pineDark:    scatterClass({prim:'cone',     color:0x1d3024, radius:3.9, height:22, perHectare:18, scaleMin:.75, scaleMax:1.7,  trunk:0x3a2d22}),
  palm:        scatterClass({prim:'cone',     color:0x3f6b45, radius:3.0, height:13, perHectare:9,  scaleMin:.8,  scaleMax:1.3,  trunk:0x6a5a3c}),
  cactus:      scatterClass({prim:'cylinder', color:0x4d6b46, radius:.9,  height:5.4, perHectare:5, scaleMin:.7,  scaleMax:1.4,  trunk:null}),
  shrub:       scatterClass({prim:'sphere',   color:0x46603c, radius:1.9, height:2.4, perHectare:22, scaleMin:.6, scaleMax:1.5,  trunk:null, impostor:false}),
  // -- rock and ground furniture
  boulder:     scatterClass({prim:'sphere',   color:0x6d7480, radius:2.6, height:3.2, perHectare:11, scaleMin:.5, scaleMax:2.4,  trunk:null, impostor:false, tilt:.5}),
  duneRock:    scatterClass({prim:'sphere',   color:0x9a6f4d, radius:2.2, height:2.2, perHectare:6,  scaleMin:.5, scaleMax:2,    trunk:null, impostor:false, tilt:.5}),
  driftRock:   scatterClass({prim:'box',      color:0x8b8676, radius:2.1, height:1.6, perHectare:7,  scaleMin:.5, scaleMax:1.8,  trunk:null, impostor:false, tilt:.35}),
  spoilPile:   scatterClass({prim:'cone',     color:0x8a6a44, radius:5.5, height:6,   perHectare:4,  scaleMin:.7, scaleMax:2.2,  trunk:null, impostor:false, tilt:.05}),
  // -- built silhouette
  tower:       scatterClass({prim:'box',      color:0x6a6f77, radius:11,  height:64,  perHectare:2.4, scaleMin:.6, scaleMax:2.3, trunk:null, tilt:0}),
  block:       scatterClass({prim:'box',      color:0x7b8086, radius:14,  height:18,  perHectare:3.6, scaleMin:.7, scaleMax:1.6, trunk:null, tilt:0}),
  stack:       scatterClass({prim:'box',      color:0x6f9cba, radius:6.1,  height:5.2, perHectare:5,  scaleMin:.8, scaleMax:1.2, trunk:null, tilt:0}),
  crate:       scatterClass({prim:'box',      color:0xa48f5c, radius:2.4,  height:2.4, perHectare:7,  scaleMin:.7, scaleMax:1.4, trunk:null, tilt:0}),
});
const SCATTER_IDS = Object.freeze(Object.keys(SCATTER));

function scatterClassOf(id){
  const found = SCATTER[String(id)];
  if(!found) throw new Error('Open World streaming: unknown scatter class "' + id + '"');
  return found;
}

/** Theme -> the classes it grows, silhouette first. Keyed by the `scatter`
 *  field of a district; an unknown theme throws rather than growing pines in
 *  the desert because somebody mistyped a name. */
const THEMES = Object.freeze({
  none:     Object.freeze([]),
  alpine:   Object.freeze(['pineDark', 'boulder']),
  highland: Object.freeze(['boulder', 'shrub']),
  quarry:   Object.freeze(['spoilPile', 'boulder']),
  forest:   Object.freeze(['pine', 'pineDark', 'shrub']),
  city:     Object.freeze(['tower', 'block']),
  coast:    Object.freeze(['palm', 'driftRock']),
  docks:    Object.freeze(['stack', 'crate']),
  desert:   Object.freeze(['cactus', 'duneRock']),
});
const THEME_IDS = Object.freeze(Object.keys(THEMES));

function themeOf(id){
  const found = THEMES[String(id)];
  if(!found) throw new Error('Open World streaming: unknown scatter theme "' + id + '"');
  return found;
}

/** Every class any theme can ask for, in a stable order. One instanced pool is
 *  created per entry, once, at install. */
const POOL_CLASSES = Object.freeze(SCATTER_IDS.filter(id => THEME_IDS.some(theme => THEMES[theme].indexOf(id) >= 0)));

// ========================================================== 05 slot allocator
//
// One InstancedMesh per scatter class for the WHOLE resident ring, not one per
// tile: 50 resident tiles times three classes would be 150 draw calls, and the
// entire point of instancing is that it is one. Tiles claim a contiguous run of
// instance slots and release it on unload; the last run is swapped into the
// hole so the buffer stays dense and `count` is always the live total.
//
// Pure integer bookkeeping, deliberately free of THREE so it can be exercised
// headless.

function createSlotAllocator(capacity){
  const runs = [];              // {owner, start, length}
  const byOwner = new Map();    // owner key -> run
  let used = 0;

  function allocate(owner, length){
    if(length <= 0) return null;
    if(byOwner.has(owner)) return byOwner.get(owner);
    if(used + length > capacity) return null;
    const run = {owner, start:used, length};
    used += length;
    runs.push(run);
    byOwner.set(owner, run);
    return run;
  }

  /** Release `owner`'s run. Returns the move descriptor the caller must apply
   *  to the instance buffer - {from, to, length} - or null when the run was
   *  already last and nothing has to move. */
  function release(owner){
    const run = byOwner.get(owner);
    if(!run) return null;
    byOwner.delete(owner);
    const index = runs.indexOf(run);
    runs.splice(index, 1);
    used -= run.length;
    const last = runs.length ? runs[runs.length - 1] : null;
    // The run being freed is the tail: nothing to compact.
    if(!last || last.start < run.start) return null;
    const move = {from:last.start, to:run.start, length:last.length, owner:last.owner};
    last.start = run.start;
    return move;
  }

  return {
    allocate, release,
    capacity:() => capacity,
    used:() => used,
    runs:() => runs.slice(),
    has:owner => byOwner.has(owner),
    runOf:owner => byOwner.get(owner) || null,
    clear(){ runs.length = 0; byOwner.clear(); used = 0; },
  };
}

// =============================================================== 06 scheduler
//
// The resident set is planned from position AND velocity: prefetching along the
// travel direction is what stops an aeroplane at 90 m/s from outrunning the
// loader. The plan is a pure function of those inputs and writes into buffers
// the caller owns, so a plan pass allocates nothing.

const PREFETCH_SECONDS = 2.2;
const PREFETCH_MAX = 900;

function createPlanner(options){
  const opts = options || {};
  const tileSize = opts.tileSize;
  const blockSize = opts.blockSize;
  const worldHalf = opts.worldHalf;
  const keepout = opts.keepout;

  // Preallocated. `wanted` maps key -> lod level for the current pass.
  const wantedTiles = new Map();
  const wantedBlocks = new Map();
  const toLoad = [];
  const toUnload = [];

  function focusX(x, vx){ return clamp(x + clamp(vx * PREFETCH_SECONDS, -PREFETCH_MAX, PREFETCH_MAX), -worldHalf * 2, worldHalf * 2); }

  /** Fill `wantedTiles` / `wantedBlocks` for a camera at (x,z) moving at
   *  (vx,vz). Cells inside the GLB keepout are never wanted: the source world
   *  owns that ground and this module must not draw over it. */
  // How many tiles fit along one block edge. The two grids are whole divisions
  // of the same district pitch, so this is an integer and a block's footprint
  // is always exactly TILES_PER_BLOCK^2 tiles.
  const TILES_PER_BLOCK = Math.round(blockSize / tileSize);

  function plan(x, z, vx, vz, quality){
    wantedTiles.clear();
    wantedBlocks.clear();
    const fx = focusX(x, vx), fz = focusX(z, vz);
    planGrid(wantedTiles, tileSize, fx, fz, x, z, quality, 'tile');
    planGrid(wantedBlocks, blockSize, fx, fz, x, z, quality, 'block');
    // Exact hand-off, no gap and no overlap: a block is dropped as soon as ONE
    // of the tiles inside it is resident, so the near grid owns its footprint
    // outright and the far grid picks up from the first whole block outside it.
    // Testing radii against each other instead leaves either a ring of missing
    // ground or a ring of z-fighting, depending on which way it is rounded.
    wantedBlocks.forEach((level, key) => {
      const bx = keyToIx(key) * TILES_PER_BLOCK;
      const bz = keyToIz(key) * TILES_PER_BLOCK;
      for(let dj = 0; dj < TILES_PER_BLOCK; dj++){
        for(let di = 0; di < TILES_PER_BLOCK; di++){
          if(wantedTiles.has(cellKey(bx + di, bz + dj))){ wantedBlocks.delete(key); return; }
        }
      }
    });
    return {tiles:wantedTiles, blocks:wantedBlocks};
  }

  function planGrid(target, size, fx, fz, camX, camZ, quality, grid){
    const radius = grid === 'tile' ? quality.nearRadius : quality.viewDistance;
    const span = Math.ceil(radius / size) + 1;
    const ci = Math.floor(fx / size);
    const cj = Math.floor(fz / size);
    const limit = Math.ceil(worldHalf / size);
    for(let dj = -span; dj <= span; dj++){
      for(let di = -span; di <= span; di++){
        const ix = ci + di, iz = cj + dj;
        if(ix < -limit || ix >= limit || iz < -limit || iz >= limit) continue;
        const cx = (ix + .5) * size;
        const cz = (iz + .5) * size;
        // Whole cell inside the source world's footprint: skip it entirely.
        if(Math.max(Math.abs(cx), Math.abs(cz)) + size * .5 <= keepout) continue;
        // Two distances, two jobs. RESIDENCY is measured from the prefetch
        // focus, so the set leans along the travel vector and an aeroplane at
        // 90 m/s arrives at ground that is already built. DETAIL is measured
        // from the camera, because that is what the eye is actually judging.
        // Using one distance for both is what makes a fast vehicle either
        // outrun the loader or drag a high-detail bubble behind itself.
        const fdx = cx - fx, fdz = cz - fz;
        if(Math.sqrt(fdx * fdx + fdz * fdz) > radius) continue;
        const dx = cx - camX, dz = cz - camZ;
        const level = lodForDistance(Math.sqrt(dx * dx + dz * dz), quality, grid);
        // Prefetched ground that the camera has not reached yet is still
        // resident, just at this grid's coarsest level until it comes into
        // range and the next plan pass promotes it.
        target.set(cellKey(ix, iz), level < 0 ? (grid === 'tile' ? 1 : 3) : level);
      }
    }
  }

  /** Difference the wanted set against what is resident, into the reusable
   *  `toLoad` / `toUnload` buffers. `resident` is a Map of key -> {lod}. */
  function diff(wanted, resident){
    toLoad.length = 0;
    toUnload.length = 0;
    wanted.forEach((level, key) => {
      const live = resident.get(key);
      if(!live || live.lod !== level) toLoad.push(key);
    });
    resident.forEach((live, key) => {
      if(!wanted.has(key)) toUnload.push(key);
    });
    return {toLoad, toUnload};
  }

  return {plan, diff, wantedTiles, wantedBlocks, toLoad, toUnload};
}

// ========================================================== 07 three.js builders
//
// Everything below needs THREE. When it is absent - the Node tests, a headless
// export - the system still plans, budgets and reports; it simply builds no
// geometry. That is what lets the scheduler above be tested for real.

const PRIM_BUILDERS = Object.freeze({
  box(T, spec){ return new T.BoxGeometry(spec.radius * 2, spec.height, spec.radius * 2); },
  sphere(T, spec){ return new T.SphereGeometry(spec.radius, 8, 6); },
  cone(T, spec){ return new T.ConeGeometry(spec.radius, spec.height, 7); },
  cylinder(T, spec){ return new T.CylinderGeometry(spec.radius, spec.radius * 1.15, spec.height, 7); },
});

function primBuilderOf(prim){
  const found = PRIM_BUILDERS[String(prim)];
  if(!found) throw new Error('Open World streaming: unknown scatter primitive "' + prim + '"');
  return found;
}

// ============================================================= 08 system core

function create(GAME, options){
  const opts = options || {};
  const pack = districts();
  const T = three();
  if(!pack) return null;

  const TILE = pack.DISTRICT_PITCH / TILE_DIVISOR;
  const BLOCK = pack.DISTRICT_PITCH / BLOCK_DIVISOR;

  const state = {
    enabled:opts.enabled !== false,
    quality:tierOf(opts.quality || autoTier(GAME)),
    seed:Number.isFinite(Number(opts.seed)) ? (Number(opts.seed) | 0) : 1337,
    // District id -> {enabled, seed, theme, density}. Written by the level's
    // district control Logic Elements, read here every plan pass.
    districts:new Map(),
    residentTiles:new Map(),
    residentBlocks:new Map(),
    pendingTiles:[],
    pendingBlocks:[],
    stats:{tiles:0, blocks:0, scatter:0, drawCalls:0, builtThisFrame:0, buildMs:0, lastPlanMs:0, planCount:0},
    // Throttles. Planning the resident set every frame is pointless: a cell is
    // 352 m across and nothing in this engine crosses one in under a second.
    planTimer:0,
    weatherTimer:0,
    disposed:false,
  };

  pack.RING_DISTRICTS.forEach(item => {
    state.districts.set(item.id, {enabled:true, seed:state.seed + item.seedSalt, theme:item.scatter, density:item.scatterDensity});
  });

  const planner = createPlanner({tileSize:TILE, blockSize:BLOCK, worldHalf:pack.WORLD_HALF, keepout:pack.CENTRE_KEEPOUT});

  // ---- scene attachment --------------------------------------------------
  const group = T ? new T.Group() : null;
  if(group){
    group.name = 'Open World Stream';
    group.userData.lkStreamRoot = true;
    // Never picked, never saved, never listed: this is renderer-only content.
    group.userData.editorHidden = true;
    if(GAME && GAME.scene) GAME.scene.add(group);
  }

  // ---- scatter pools -----------------------------------------------------
  // One pool per class. Capacity is split by the class's share of the total
  // per-hectare density so a forest does not starve the boulders.
  const pools = new Map();
  const totalWeight = POOL_CLASSES.reduce((sum, id) => sum + scatterClassOf(id).perHectare, 0);
  POOL_CLASSES.forEach(id => {
    const spec = scatterClassOf(id);
    const capacity = Math.max(64, Math.round(state.quality.scatterCapacity * (spec.perHectare / totalWeight)));
    const pool = {
      id, spec, capacity,
      allocator:createSlotAllocator(capacity),
      mesh:null,
    };
    if(T){
      const geometry = primBuilderOf(spec.prim)(T, spec);
      const material = new T.MeshStandardMaterial({color:spec.color, roughness:.94, metalness:0});
      const mesh = new T.InstancedMesh(geometry, material, capacity);
      mesh.name = 'Open World Scatter ' + id;
      mesh.count = 0;
      mesh.castShadow = false;      // a 4 km forest may not enter the shadow map
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;   // the pool spans the whole ring; per-instance
                                    // culling is what the LOD ring already does
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      pool.mesh = mesh;
      group.add(mesh);
    }
    pools.set(id, pool);
  });

  // ---- frame scratch -----------------------------------------------------
  // Allocated once. Nothing in `update` may create one of these.
  const scratch = T ? {
    matrix:new T.Matrix4(),
    position:new T.Vector3(),
    quaternion:new T.Quaternion(),
    scale:new T.Vector3(),
    euler:new T.Euler(),
    color:new T.Color(),
  } : null;
  const geometryCache = new Map();   // verts -> shared PlaneGeometry template
  const terrainMaterials = new Map();// district index -> material

  // ------------------------------------------------------ district settings
  function districtSettingsFor(x, z){
    const item = pack.districtAt(x, z);
    if(item.native) return null;
    return state.districts.get(item.id) || null;
  }

  /** Read the level's district control Logic Elements back into `state`. The
   *  editor writes their exposed variables; this is how an author turning a
   *  district off in the inspector reaches the streamer. Runs on the plan
   *  throttle, not per frame. */
  function syncDistrictControls(){
    const registry = GAME && GAME.world && GAME.world.registry;
    if(!Array.isArray(registry)) return;
    for(let index = 0; index < registry.length; index++){
      const object = registry[index];
      const graph = object && object.userData && object.userData.logicGraph;
      const descriptor = graph && graph.openWorldDistrict;
      if(!descriptor) continue;
      const settings = state.districts.get(descriptor.id);
      if(!settings) continue;
      settings.enabled = readVariable(graph, 'Enabled', descriptor.enabled) !== false;
      settings.seed = Number(readVariable(graph, 'Seed', descriptor.seed)) | 0;
      settings.theme = String(readVariable(graph, 'Theme', descriptor.theme));
      settings.density = clamp(readVariable(graph, 'ScatterDensity', descriptor.density), 0, 4);
    }
  }

  function readVariable(graph, name, fallback){
    const list = graph && Array.isArray(graph.variables) ? graph.variables : null;
    if(!list) return fallback;
    for(let index = 0; index < list.length; index++){
      if(list[index] && list[index].name === name) return list[index].value;
    }
    return fallback;
  }

  // ------------------------------------------------------------ scatter fill
  //
  // Deterministic placement for one tile. Returns the number of instances the
  // class placed. Reads the district blend weight as a PROBABILITY rather than
  // a hard boundary, so a forest thins into the moor across the border instead
  // of stopping on a line - the practical half of the biome-blending reference.
  function scatterCountFor(spec, density){
    const hectares = (TILE * TILE) / 10000;
    return Math.max(0, Math.round(spec.perHectare * hectares * density * state.quality.scatterScale));
  }

  function fillTileScatter(ix, iz){
    if(!T) return 0;
    const originX = ix * TILE, originZ = iz * TILE;
    const owner = cellKey(ix, iz);
    let placed = 0;
    const settings = districtSettingsFor(originX + TILE * .5, originZ + TILE * .5);
    if(!settings || !settings.enabled) return 0;
    const classes = themeOf(settings.theme);
    for(let classIndex = 0; classIndex < classes.length; classIndex++){
      const id = classes[classIndex];
      const spec = scatterClassOf(id);
      const pool = pools.get(id);
      if(!pool) continue;
      const wanted = scatterCountFor(spec, settings.density);
      if(wanted <= 0) continue;
      const run = pool.allocator.allocate(owner, wanted);
      if(!run) continue;   // pool full: the budget is a hard cap, not a hint
      let written = 0;
      for(let i = 0; i < wanted; i++){
        const h1 = pack.hash2i(settings.seed + classIndex * 7717, ix * 131 + i, iz * 17);
        const h2 = pack.hash2i(settings.seed + classIndex * 7717 + 5171, ix, iz * 131 + i);
        const h3 = pack.hash2i(settings.seed + classIndex * 7717 + 9209, ix + i, iz + i);
        const x = originX + h1 * TILE;
        const z = originZ + h2 * TILE;
        // Never inside the source world, never on the carriageway.
        if(Math.max(Math.abs(x), Math.abs(z)) < pack.CENTRE_KEEPOUT) continue;
        if(pack.roadCorridorWeight(x, z) > .12) continue;
        // Blend weight as probability: this is where a border stops being a line.
        const weights = pack.biomeWeightsAt(x, z, settings.seed);
        const item = pack.districtAt(originX + TILE * .5, originZ + TILE * .5);
        if(weights[item.index - 1] < h3) continue;
        const y = pack.heightAt(x, z, settings.seed);
        const scale = spec.scaleMin + (spec.scaleMax - spec.scaleMin) * h3;
        scratch.position.set(x, y + spec.height * scale * .5, z);
        scratch.euler.set((h1 - .5) * spec.tilt, h2 * Math.PI * 2, (h2 - .5) * spec.tilt);
        scratch.quaternion.setFromEuler(scratch.euler);
        scratch.scale.set(scale, scale, scale);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        pool.mesh.setMatrixAt(run.start + written, scratch.matrix);
        written++;
      }
      // The run was sized for the worst case; collapse the unused tail so the
      // pool never draws stale matrices.
      for(let i = written; i < wanted; i++){
        scratch.matrix.makeScale(0, 0, 0);
        pool.mesh.setMatrixAt(run.start + i, scratch.matrix);
      }
      pool.mesh.count = Math.max(pool.mesh.count, run.start + wanted);
      pool.mesh.instanceMatrix.needsUpdate = true;
      placed += written;
    }
    return placed;
  }

  function releaseTileScatter(ix, iz){
    if(!T) return;
    const owner = cellKey(ix, iz);
    pools.forEach(pool => {
      const move = pool.allocator.release(owner);
      if(move){
        // Swap-remove: copy the tail run down into the hole so the buffer stays
        // dense and `count` keeps meaning "live instances".
        for(let i = 0; i < move.length; i++){
          pool.mesh.getMatrixAt(move.from + i, scratch.matrix);
          pool.mesh.setMatrixAt(move.to + i, scratch.matrix);
        }
        pool.mesh.instanceMatrix.needsUpdate = true;
      }
      pool.mesh.count = pool.allocator.used();
    });
  }

  // ------------------------------------------------------------ terrain mesh
  function terrainGeometryTemplate(verts){
    let geometry = geometryCache.get(verts);
    if(!geometry){
      geometry = new T.PlaneGeometry(1, 1, verts - 1, verts - 1);
      geometry.rotateX(-Math.PI / 2);
      geometryCache.set(verts, geometry);
    }
    return geometry;
  }

  function terrainMaterialFor(item){
    let material = terrainMaterials.get(item.index);
    if(!material){
      const spec = pack.materialOf(item.ground);
      material = new T.MeshStandardMaterial({color:spec.color, roughness:spec.roughness, metalness:spec.metalness});
      material.name = 'Open World Terrain ' + item.id;
      terrainMaterials.set(item.index, material);
    }
    return material;
  }

  function buildTerrainCell(ix, iz, size, lod){
    if(!T) return null;
    const definition = LOD[lod];
    const verts = definition.verts;
    const originX = ix * size, originZ = iz * size;
    const centreX = originX + size * .5, centreZ = originZ + size * .5;
    const item = pack.districtAt(centreX, centreZ);
    const settings = state.districts.get(item.id);
    if(item.native || !settings || !settings.enabled) return null;
    const geometry = terrainGeometryTemplate(verts).clone();
    const position = geometry.attributes.position;
    for(let vi = 0; vi < position.count; vi++){
      const localX = position.getX(vi) * size;
      const localZ = position.getZ(vi) * size;
      const worldX = centreX + localX;
      const worldZ = centreZ + localZ;
      position.setY(vi, pack.heightAt(worldX, worldZ, settings.seed) - item.base);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    const mesh = new T.Mesh(geometry, terrainMaterialFor(item));
    mesh.name = 'Open World ' + (definition.grid === 'tile' ? 'Tile' : 'Block') + ' ' + ix + ',' + iz;
    mesh.position.set(centreX, item.base, centreZ);
    mesh.scale.set(size, 1, size);
    mesh.castShadow = false;
    mesh.receiveShadow = lod <= 1;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.lkStreamed = true;
    group.add(mesh);
    return mesh;
  }

  function disposeCell(record){
    if(!T || !record || !record.mesh) return;
    group.remove(record.mesh);
    if(record.mesh.geometry) record.mesh.geometry.dispose();
    record.mesh = null;
  }

  // ----------------------------------------------------------- build queue
  //
  // A bounded, time-sliced worker. `pump` returns the number of cells it built
  // and ALWAYS terminates: the historic warm-pass hang (docs/TODO_IMPROVING.md
  // note 4.4) came from a loop whose exit condition depended on work that the
  // loop itself kept creating. Both limits here are constants read before the
  // loop starts, so no amount of queued work can extend one call.
  function pump(budgetMs, maxBuilds){
    const started = now();
    let built = 0;
    // Iteration cap as well as a build cap. A queued key can be superseded
    // between planning and building, and those skips must not be free passes
    // through the `built < maxBuilds` test - that is precisely the shape of
    // loop that used to leave the warm pass running forever.
    let iterations = 0;
    const maxIterations = state.pendingTiles.length + state.pendingBlocks.length + maxBuilds;
    while(built < maxBuilds && iterations++ < maxIterations){
      const job = state.pendingTiles.length ? state.pendingTiles : (state.pendingBlocks.length ? state.pendingBlocks : null);
      if(!job) break;
      const key = job.shift();
      const isTile = job === state.pendingTiles;
      const resident = isTile ? state.residentTiles : state.residentBlocks;
      const wanted = isTile ? planner.wantedTiles : planner.wantedBlocks;
      const lod = wanted.get(key);
      if(lod == null) continue;               // superseded before it was built
      const ix = keyToIx(key), iz = keyToIz(key);
      const previous = resident.get(key);
      if(previous){
        disposeCell(previous);
        if(isTile) releaseTileScatter(ix, iz);
      }
      const mesh = buildTerrainCell(ix, iz, isTile ? TILE : BLOCK, lod);
      const record = previous || {mesh:null, lod:-1, scatter:0};
      record.mesh = mesh;
      record.lod = lod;
      record.scatter = isTile && LOD[lod].scatter === 'mesh' ? fillTileScatter(ix, iz) : 0;
      resident.set(key, record);
      built++;
      if(now() - started >= budgetMs) break;
    }
    state.stats.builtThisFrame = built;
    state.stats.buildMs = now() - started;
    return built;
  }

  function now(){
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function unloadCells(resident, keys, isTile){
    for(let index = 0; index < keys.length; index++){
      const key = keys[index];
      const record = resident.get(key);
      if(!record) continue;
      disposeCell(record);
      if(isTile) releaseTileScatter(keyToIx(key), keyToIz(key));
      resident.delete(key);
    }
  }

  // ------------------------------------------------------- 08 weather and time
  //
  // Districts react to the shared directors rather than owning any weather of
  // their own. Throttled hard: this walks every terrain material, and there is
  // no visible difference between doing it at 60 Hz and doing it at 4 Hz.
  const WEATHER_INTERVAL = .25;
  function pushWeather(){
    if(!T) return;
    const weather = GAME && GAME.systems && GAME.systems.weather;
    const surface = weather && weather.surface ? weather.surface() : null;
    if(!surface) return;
    const snow = clamp(surface.snow, 0, 1);
    const wetness = clamp(surface.wetness, 0, 1);
    terrainMaterials.forEach((material, index) => {
      const item = pack.DISTRICTS[index - 1];
      if(!item) return;
      const spec = pack.materialOf(item.ground);
      scratch.color.setHex(spec.color);
      // Snow settles by altitude: the alpine district whitens first because its
      // base elevation is the highest, which is also how the eye expects it.
      const altitudeBias = clamp((item.base + item.relief * .5) / 220, 0, 1);
      const cover = clamp(snow * (.35 + altitudeBias), 0, 1);
      if(cover > 0) scratch.color.lerp(SNOW_COLOR, cover);
      material.color.copy(scratch.color);
      // Wet ground is darker and glossier, not bluer.
      material.roughness = clamp(spec.roughness - wetness * .45, .06, 1);
      material.metalness = clamp(spec.metalness + wetness * .12, 0, 1);
      material.needsUpdate = false;   // colour/roughness are uniforms, not defines
    });
  }
  const SNOW_COLOR = T ? new T.Color(0xdfe7ee) : null;

  // ----------------------------------------------------------- public update
  const PLAN_INTERVAL = .35;

  function cameraPosition(out){
    const camera = GAME && GAME.camera;
    if(camera && camera.position){ out[0] = camera.position.x; out[1] = camera.position.y; out[2] = camera.position.z; return out; }
    const player = GAME && GAME.player && GAME.player.car;
    if(player && player.position){ out[0] = player.position.x; out[1] = player.position.y; out[2] = player.position.z; return out; }
    out[0] = out[1] = out[2] = 0;
    return out;
  }

  const focus = [0, 0, 0];
  const previousFocus = [0, 0, 0];
  let havePrevious = false;

  function update(dt){
    if(!state.enabled || state.disposed) return;
    const step = clamp(dt, 0, .25);
    state.planTimer -= step;
    state.weatherTimer -= step;
    if(state.weatherTimer <= 0){ state.weatherTimer = WEATHER_INTERVAL; pushWeather(); }
    if(state.planTimer <= 0){
      state.planTimer = PLAN_INTERVAL;
      cameraPosition(focus);
      let vx = 0, vz = 0;
      if(havePrevious){
        vx = (focus[0] - previousFocus[0]) / PLAN_INTERVAL;
        vz = (focus[2] - previousFocus[2]) / PLAN_INTERVAL;
      }
      previousFocus[0] = focus[0]; previousFocus[2] = focus[2];
      havePrevious = true;
      replan(focus[0], focus[2], vx, vz);
    }
    pump(state.quality.buildMs, state.quality.buildsPerFrame);
    refreshStats();
  }

  function replan(x, z, vx, vz){
    const started = now();
    syncDistrictControls();
    planner.plan(x, z, vx, vz, state.quality);
    const tiles = planner.diff(planner.wantedTiles, state.residentTiles);
    // The diff buffers are reused by the next call, so both halves are copied
    // into the pending queues before the block pass overwrites them.
    state.pendingTiles.length = 0;
    for(let index = 0; index < tiles.toLoad.length; index++) state.pendingTiles.push(tiles.toLoad[index]);
    unloadCells(state.residentTiles, tiles.toUnload, true);
    const blocks = planner.diff(planner.wantedBlocks, state.residentBlocks);
    state.pendingBlocks.length = 0;
    for(let index = 0; index < blocks.toLoad.length; index++) state.pendingBlocks.push(blocks.toLoad[index]);
    unloadCells(state.residentBlocks, blocks.toUnload, false);
    // Nearest first: the cell under the player must never be the last built.
    sortByDistance(state.pendingTiles, x, z, TILE);
    sortByDistance(state.pendingBlocks, x, z, BLOCK);
    state.stats.lastPlanMs = now() - started;
    state.stats.planCount++;
  }

  const sortScratch = [];
  function sortByDistance(keys, x, z, size){
    if(keys.length < 2) return;
    sortScratch.length = 0;
    for(let index = 0; index < keys.length; index++){
      const key = keys[index];
      const dx = (keyToIx(key) + .5) * size - x;
      const dz = (keyToIz(key) + .5) * size - z;
      sortScratch.push(dx * dx + dz * dz, key);
    }
    // Insertion sort over a small, nearly-sorted list: the plan set changes by
    // a handful of cells per pass, and this avoids the comparator closure a
    // .sort() would allocate on every replan.
    for(let i = 2; i < sortScratch.length; i += 2){
      const distance = sortScratch[i], key = sortScratch[i + 1];
      let j = i - 2;
      while(j >= 0 && sortScratch[j] > distance){
        sortScratch[j + 2] = sortScratch[j];
        sortScratch[j + 3] = sortScratch[j + 1];
        j -= 2;
      }
      sortScratch[j + 2] = distance;
      sortScratch[j + 3] = key;
    }
    for(let i = 0; i < keys.length; i++) keys[i] = sortScratch[i * 2 + 1];
  }

  function refreshStats(){
    let scatter = 0;
    pools.forEach(pool => { scatter += pool.allocator.used(); });
    state.stats.tiles = state.residentTiles.size;
    state.stats.blocks = state.residentBlocks.size;
    state.stats.scatter = scatter;
    // One draw call per resident terrain cell plus one per non-empty pool.
    let poolCalls = 0;
    pools.forEach(pool => { if(pool.allocator.used() > 0) poolCalls++; });
    state.stats.drawCalls = state.residentTiles.size + state.residentBlocks.size + poolCalls;
  }

  /** Build the resident set out to a bounded number of cells, for the warm
   *  pass. HARD CAP on both time and iterations, and it never re-plans: the
   *  pending queue can only shrink, so this always returns. */
  function settle(maxMs, maxCells){
    const budget = clamp(maxMs == null ? 120 : maxMs, 1, 2000);
    const cells = clamp(maxCells == null ? 96 : maxCells, 1, 4096);
    cameraPosition(focus);
    replan(focus[0], focus[2], 0, 0);
    const started = now();
    let built = 0;
    // One `pump` per iteration, each with its own small slice, so a single
    // pathological cell cannot hold the whole budget.
    while(built < cells && (state.pendingTiles.length || state.pendingBlocks.length)){
      const done = pump(Math.min(12, budget), 4);
      if(done <= 0) break;                 // nothing buildable left: stop, do not spin
      built += done;
      if(now() - started >= budget) break;
    }
    refreshStats();
    return built;
  }

  function setQuality(id){
    const next = tierOf(id);
    if(next === state.quality) return state.quality;
    state.quality = next;
    // The pools are sized per tier, so a change rebuilds the resident set from
    // scratch rather than trying to migrate instance runs across capacities.
    clearResident();
    state.planTimer = 0;
    return state.quality;
  }

  function clearResident(){
    state.residentTiles.forEach(record => disposeCell(record));
    state.residentBlocks.forEach(record => disposeCell(record));
    state.residentTiles.clear();
    state.residentBlocks.clear();
    state.pendingTiles.length = 0;
    state.pendingBlocks.length = 0;
    pools.forEach(pool => {
      pool.allocator.clear();
      if(pool.mesh) pool.mesh.count = 0;
    });
    havePrevious = false;
  }

  function setDistrict(id, patch){
    const settings = state.districts.get(String(id));
    if(!settings) throw new Error('Open World streaming: unknown district "' + id + '"');
    if(patch && patch.enabled != null) settings.enabled = patch.enabled !== false;
    if(patch && patch.seed != null) settings.seed = Number(patch.seed) | 0;
    if(patch && patch.theme != null){ themeOf(patch.theme); settings.theme = String(patch.theme); }
    if(patch && patch.density != null) settings.density = clamp(patch.density, 0, 4);
    clearResident();
    state.planTimer = 0;
    return Object.assign({}, settings);
  }

  function dispose(){
    clearResident();
    if(T){
      pools.forEach(pool => {
        if(!pool.mesh) return;
        group.remove(pool.mesh);
        pool.mesh.geometry.dispose();
        pool.mesh.material.dispose();
        pool.mesh = null;
      });
      geometryCache.forEach(geometry => geometry.dispose());
      geometryCache.clear();
      terrainMaterials.forEach(material => material.dispose());
      terrainMaterials.clear();
      if(group.parent) group.parent.remove(group);
    }
    state.disposed = true;
  }

  return {
    SCHEMA_VERSION,
    TILE, BLOCK, LOD, TIERS, TIER_IDS, THEMES, SCATTER,
    update, settle, replan, pump, dispose,
    setQuality, setDistrict, clearResident,
    quality:() => state.quality,
    stats:() => Object.assign({}, state.stats, {quality:state.quality.id}),
    districtSettings:id => Object.assign({}, state.districts.get(String(id)) || {}),
    planner, pools,
    isEnabled:() => state.enabled === true,
    setEnabled(value){ state.enabled = value !== false; if(!state.enabled) clearResident(); return state.enabled; },
  };
}

// ========================================================= 09 system + install

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.openWorldStreaming && GAME.systems.openWorldStreaming.SCHEMA_VERSION === SCHEMA_VERSION){
    return GAME.systems.openWorldStreaming;
  }
  const system = create(GAME, null);
  if(!system) return null;
  GAME.systems.openWorldStreaming = system;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkOpenWorldStreamFrame){
    GAME.hooks.__lkOpenWorldStreamFrame = true;
    GAME.hooks.frame.push(dt => system.update(dt));
  }
  return system;
}

function boot(){
  const GAME = root.LOT_KING;
  if(GAME) install(GAME);
}

const API = Object.freeze({
  SCHEMA_VERSION,
  TIERS, TIER_IDS, LOD, SCATTER, SCATTER_IDS, THEMES, THEME_IDS, POOL_CLASSES,
  TILE_DIVISOR, BLOCK_DIVISOR, PREFETCH_SECONDS,
  tierOf, autoTier, scatterClassOf, themeOf, lodForDistance,
  cellKey, keyToIx, keyToIz,
  createSlotAllocator, createPlanner,
  create, install, boot,
});

root.LK_RUNTIME_OPEN_WORLD_STREAMING = API;
if(typeof module !== 'undefined' && module.exports) module.exports = API;
if(root.LOT_KING) boot();
else if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
})();
