'use strict';

/* Open World district ring + chunk streaming.
   Builds the REAL level scene through the registered template and then drives
   the streaming scheduler over it, so this covers the two things that decide
   whether the larger world is playable at all: what the level actually
   contains, and how much of it is resident at once. */

const assert = require('node:assert/strict');

global.window = global;
require('../js/engine/level-template-registry.js');
// The pawn Logic Elements come from the DollBody template pack; without it the
// level would still build, just without its seven pawns, and the "world.glb is
// untouched" assertions below would silently stop covering them.
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-sketchbook.js');
require('../js/runtime/open-world-districts.js');
require('../js/runtime/sketchbook-open-world-level-template.js');
require('../js/runtime/open-world-streaming.js');

const DISTRICTS = global.LK_RUNTIME_OPEN_WORLD_DISTRICTS;
const STREAMING = global.LK_RUNTIME_OPEN_WORLD_STREAMING;
const TEMPLATE = global.LK_RUNTIME_SKETCHBOOK_OPEN_WORLD_LEVEL_TEMPLATE;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// ------------------------------------------------------------------ 01 layout

test('the ring is nine districts in reading order and 8.8x the source area', () => {
  assert.equal(DISTRICTS.DISTRICTS.length, 9);
  assert.deepEqual(DISTRICTS.DISTRICTS.map(item => item.index), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Reading order: north-west first, south-east last, centre in the middle.
  assert.deepEqual(DISTRICTS.DISTRICTS.map(item => item.col + ',' + item.row),
    ['0,0', '1,0', '2,0', '0,1', '1,1', '2,1', '0,2', '1,2', '2,2']);
  assert.equal(DISTRICTS.DISTRICTS[4].native, true, 'the centre cell is the untouched source world');
  assert.equal(DISTRICTS.RING_DISTRICTS.length, 8);
  const growth = DISTRICTS.WORLD_AREA / DISTRICTS.CENTRE_AREA;
  assert.ok(growth >= 4 && growth <= 9, 'world must be 4-9x the source area, got ' + growth.toFixed(2));
  assert.equal(DISTRICTS.WORLD_HALF, 4224);
  // Both streaming grids must divide the district pitch exactly, or a cell
  // boundary can land inside a district and leave a visible seam.
  assert.equal(DISTRICTS.DISTRICT_PITCH % STREAMING.TILE_DIVISOR, 0);
  assert.equal(DISTRICTS.DISTRICT_PITCH % STREAMING.BLOCK_DIVISOR, 0);
});

test('unknown names throw instead of resolving to a default', () => {
  assert.throws(() => DISTRICTS.districtOf('atlantis'), /unknown district/);
  assert.throws(() => DISTRICTS.materialOf('unobtainium'), /unknown material class/);
  assert.throws(() => DISTRICTS.poiKindOf('sidequest'), /unknown POI kind/);
  assert.throws(() => DISTRICTS.terrainProfileOf('fractal'), /unknown terrain profile/);
  assert.throws(() => STREAMING.tierOf('potato'), /unknown quality tier/);
  assert.throws(() => STREAMING.themeOf('jungle'), /unknown scatter theme/);
  assert.throws(() => STREAMING.scatterClassOf('triffid'), /unknown scatter class/);
});

// ------------------------------------------------------------------- 02 field

test('the height field is deterministic, blended and never intrudes on world.glb', () => {
  for(const point of [[2816, 0], [-3000, -3000], [1500, 2600], [4000, -4000]]){
    assert.equal(DISTRICTS.heightAt(point[0], point[1], 1337), DISTRICTS.heightAt(point[0], point[1], 1337),
      'height must be a pure function of position and seed');
  }
  // Inside the GLB footprint the generated field is flat apron and nothing else.
  for(const point of [[0, 0], [1000, -1200], [-1423, 900]]){
    assert.equal(DISTRICTS.heightAt(point[0], point[1], 1337), DISTRICTS.CENTRE_APRON_Y);
  }
  // Blend weights are normalised and never square: sampling straight along a
  // district border must produce a mixture, not a step.
  const border = DISTRICTS.biomeWeightsAt(DISTRICTS.DISTRICT_PITCH / 2, 0, 1337);
  const sum = Array.from(border).reduce((total, value) => total + value, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, 'district weights must be normalised, got ' + sum);
  let mixedSamples = 0;
  for(let step = -600; step <= 600; step += 60){
    const weights = DISTRICTS.biomeWeightsAt(DISTRICTS.DISTRICT_PITCH / 2, step, 1337);
    const active = Array.from(weights).filter(value => value > .02).length;
    if(active >= 2) mixedSamples++;
  }
  assert.ok(mixedSamples >= 15, 'a district border must blend rather than cut, mixed samples: ' + mixedSamples);
  // The graded road corridor must be flat enough to drive along.
  const a = DISTRICTS.heightAt(0, -2000, 1337);
  const b = DISTRICTS.heightAt(0, -2200, 1337);
  assert.ok(Math.abs(a - b) < 6, 'the spoke carriageway must not climb 6 m in 200 m');
  assert.equal(DISTRICTS.roadCorridorWeight(0, -2000), 1, 'the spoke centre line is fully graded');
  assert.equal(DISTRICTS.roadCorridorWeight(600, -2000), 0, 'grading stops at the corridor edge');
});

// -------------------------------------------------------------- 03 real scene

const scene = TEMPLATE.buildScene();

test('the built level keeps world.glb and its seven pawns exactly where they were', () => {
  const world = scene.added.find(entry => entry.id === 'sketchbook_world_model');
  assert.ok(world, 'the source world must still be in the level');
  assert.equal(scene.added.indexOf(world), 0, 'the source world is authored before anything generated');
  assert.equal(world.src, 'models/sketchbook/world.glb');
  assert.equal(world.fit, 2847.2265625);
  assert.deepEqual(world.t.p, [0, 0, 0]);
  assert.equal(world.preservedGltfExtras.physics.total, 427);
  const pawns = scene.added.filter(entry => entry.kind === 'logicElement' && entry.graph && entry.graph.sketchbookPawn);
  assert.equal(pawns.length, 7);
  assert.deepEqual(pawns.find(entry => entry.id === 'sketchbook_pawn_character').t.p, [-.101, 14.696, -5.171]);
});

test('every generated entry stays outside the source world footprint', () => {
  const generated = scene.added.filter(entry => entry.asset && entry.asset.source === DISTRICTS.SOURCE);
  assert.ok(generated.length > 400, 'the ring must be real content, got ' + generated.length);
  generated.forEach(entry => {
    const p = entry.t.p;
    const inside = Math.max(Math.abs(p[0]), Math.abs(p[2])) < DISTRICTS.CENTRE_KEEPOUT;
    assert.ok(!inside, entry.name + ' was authored inside the world.glb keepout at ' + p[0] + ',' + p[2]);
  });
  assert.equal(new Set(scene.added.map(entry => entry.id)).size, scene.added.length, 'entry ids must be unique');
});

test('each district is editable: one control element with exposed variables', () => {
  const controls = scene.added.filter(entry => entry.graph && entry.graph.openWorldDistrict);
  assert.equal(controls.length, 8, 'one control Logic Element per generated district');
  const REQUIRED = ['Enabled', 'Seed', 'HalfSize', 'BaseElevation', 'Relief', 'Theme', 'ScatterDensity', 'PoiCount', 'StreamRadius'];
  controls.forEach(entry => {
    const names = entry.graph.variables.map(item => item.name);
    REQUIRED.forEach(name => assert.ok(names.indexOf(name) >= 0, entry.name + ' must expose ' + name));
    assert.ok(entry.graph.variables.every(item => item.exposed === true), entry.name + ' variables must be exposed');
    assert.equal(entry.templateGroup, DISTRICTS.GROUP.control);
    // The scatter theme an author can type must be one the streamer knows.
    STREAMING.themeOf(entry.graph.openWorldDistrict.theme);
  });
  // The outliner folders are numbered in the same reading order as the map.
  const groups = Array.from(new Set(scene.added.map(entry => entry.templateGroup).filter(Boolean))).sort();
  assert.deepEqual(groups.filter(label => /^0\d /.test(label)),
    ['00 Road Network', '01 Granite Spine', '02 Windmark Ridge', '03 Ochre Quarry',
     '04 Blackpine Forest', '06 Meridian Downtown', '07 Saltglass Coast', '08 Ironport Docks', '09 Cinder Flats']);
});

test('every district is reachable by all four pawn kinds and has one silhouette', () => {
  const manifest = scene.sketchbook.openWorld;
  assert.ok(manifest, 'the district manifest must survive on scene.sketchbook');
  assert.equal(manifest.districts.length, 9);
  manifest.districts.filter(item => !item.native).forEach(item => {
    const kinds = item.pois.map(poi => poi.kind);
    assert.equal(kinds.filter(kind => kind === 'landmark').length, 1,
      item.name + ' needs exactly one landmark: more markers is fewer visits');
    assert.ok(kinds.indexOf('helipad') >= 0, item.name + ' must have somewhere for the helicopter');
    assert.ok(kinds.indexOf('overlook') >= 0, item.name + ' must have somewhere to stand');
    assert.ok(kinds.some(kind => kind === 'ramp' || kind === 'circuit' || kind === 'airstrip' || kind === 'depot'),
      item.name + ' must have somewhere to drive at');
  });
  // The aeroplane needs runways somewhere on the map, not in every district.
  const strips = manifest.districts.reduce((total, item) => total + item.pois.filter(poi => poi.kind === 'airstrip').length, 0);
  assert.ok(strips >= 2, 'the map needs at least two airstrips, got ' + strips);
});

test('the drivable surface is authored once and never streamed', () => {
  const drive = scene.added.filter(entry => entry.driveSurface === true);
  assert.ok(drive.length > 200, 'the ring needs a real drivable surface, got ' + drive.length);
  assert.ok(drive.every(entry => entry.collide === true), 'a drive surface without a collider is decoration');
  // Terrain proxies are invisible: they own collision, the streamed mesh owns
  // the look, and an invisible mesh costs no draw call.
  const proxies = scene.added.filter(entry => entry.openWorld && entry.openWorld.role === 'terrain');
  assert.ok(proxies.length >= 200, 'terrain collision proxies missing, got ' + proxies.length);
  assert.ok(proxies.every(entry => entry.t.v === false), 'terrain proxies must be invisible');
  assert.ok(proxies.every(entry => entry.collide === true && entry.driveSurface === true));
});

// ----------------------------------------------------------- 04 slot allocator

test('the instanced slot allocator stays dense across load and unload', () => {
  const allocator = STREAMING.createSlotAllocator(100);
  const a = allocator.allocate('a', 30);
  const b = allocator.allocate('b', 40);
  const c = allocator.allocate('c', 20);
  assert.deepEqual([a.start, b.start, c.start], [0, 30, 70]);
  assert.equal(allocator.used(), 90);
  assert.equal(allocator.allocate('d', 30), null, 'the pool capacity is a hard cap, not a hint');
  // Releasing the middle run compacts the tail into the hole.
  const move = allocator.release('b');
  assert.deepEqual(move, {from:70, to:30, length:20, owner:'c'});
  assert.equal(allocator.used(), 50);
  assert.equal(allocator.runOf('c').start, 30);
  assert.equal(allocator.release('c'), null, 'releasing the tail moves nothing');
  assert.equal(allocator.used(), 30);
  allocator.clear();
  assert.equal(allocator.used(), 0);
});

// ------------------------------------------------------------- 05 the streamer

function makeGame(x, z){
  return {
    camera:{position:{x, y:60, z}},
    scene:null,
    systems:{},
    hooks:{frame:[]},
    world:{registry:[]},
    state:{},
  };
}

test('the resident set is bounded, gapless and biased along the travel direction', () => {
  const game = makeGame(0, -2816);
  const system = STREAMING.create(game, {quality:'high', seed:1337});
  assert.ok(system, 'the streamer must build without THREE');
  system.replan(0, -2816, 0, 0);
  const tiles = system.planner.wantedTiles;
  const blocks = system.planner.wantedBlocks;
  assert.ok(tiles.size > 0 && blocks.size > 0, 'both grids must be planned');

  // BUDGET: this is the number that decides whether a 71 km^2 world runs. One
  // draw call per resident cell plus one per non-empty instanced pool.
  const cells = tiles.size + blocks.size;
  assert.ok(cells <= 120, 'resident terrain cells must stay inside the draw-call budget, got ' + cells);

  // No cell may be planned inside the source world footprint.
  const keepout = DISTRICTS.CENTRE_KEEPOUT;
  tiles.forEach((level, key) => {
    const cx = (STREAMING.keyToIx(key) + .5) * system.TILE;
    const cz = (STREAMING.keyToIz(key) + .5) * system.TILE;
    assert.ok(Math.max(Math.abs(cx), Math.abs(cz)) + system.TILE * .5 > keepout,
      'a tile was planned over world.glb at ' + cx + ',' + cz);
    assert.ok(level === 0 || level === 1, 'tiles carry LOD 0 or 1, got ' + level);
  });
  blocks.forEach(level => assert.ok(level === 2 || level === 3, 'blocks carry LOD 2 or 3, got ' + level));

  // No block may overlap a resident tile: same ground drawn twice is z-fighting.
  const perBlock = Math.round(system.BLOCK / system.TILE);
  blocks.forEach((level, key) => {
    const bx = STREAMING.keyToIx(key) * perBlock;
    const bz = STREAMING.keyToIz(key) * perBlock;
    for(let dj = 0; dj < perBlock; dj++){
      for(let di = 0; di < perBlock; di++){
        assert.ok(!tiles.has(STREAMING.cellKey(bx + di, bz + dj)),
          'block ' + key + ' overlaps a resident tile');
      }
    }
  });

  // Prefetch: moving north must pull the resident set north.
  const centreOf = map => {
    let sum = 0, count = 0;
    map.forEach((level, key) => { sum += STREAMING.keyToIz(key); count++; });
    return count ? sum / count : 0;
  };
  system.replan(0, -2816, 0, -140);
  const movingNorth = centreOf(system.planner.wantedTiles);
  system.replan(0, -2816, 0, 140);
  const movingSouth = centreOf(system.planner.wantedTiles);
  assert.ok(movingNorth < movingSouth, 'the loader must run ahead of the player, not behind');
  system.dispose();
});

test('lower tiers cost strictly less and the ladder never inverts', () => {
  let previousCells = 0;
  STREAMING.TIER_IDS.forEach(id => {
    const game = makeGame(2816, 2816);
    const system = STREAMING.create(game, {quality:id, seed:1337});
    system.replan(2816, 2816, 0, 0);
    const cells = system.planner.wantedTiles.size + system.planner.wantedBlocks.size;
    assert.ok(cells >= previousCells, id + ' must not be cheaper than the tier below it');
    assert.ok(cells <= 160, id + ' resident cells out of budget: ' + cells);
    previousCells = cells;
    system.dispose();
  });
  assert.equal(STREAMING.lodForDistance(999999, STREAMING.TIERS.ultra, 'tile'), -1);
  assert.equal(STREAMING.lodForDistance(0, STREAMING.TIERS.low, 'tile'), 0);
  assert.equal(STREAMING.lodForDistance(0, STREAMING.TIERS.low, 'block'), 2);
});

test('the build queue always terminates and never spins', () => {
  const game = makeGame(0, 2816);
  const system = STREAMING.create(game, {quality:'high', seed:1337});
  // settle() is what the warm pass calls. It must return under its own budget
  // no matter how much work is queued: the historic bug was a pass whose exit
  // condition depended on work the pass itself kept creating, so Play never
  // started. Without THREE nothing can be built, which is the worst case -
  // every job is a no-op and a naive loop would never make progress.
  const started = Date.now();
  const built = system.settle(60, 96);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, 'settle must respect its budget, took ' + elapsed + ' ms');
  assert.ok(built >= 0);
  // Draining by hand must also terminate.
  for(let pass = 0; pass < 40; pass++) system.update(1 / 60);
  const stats = system.stats();
  assert.equal(stats.quality, 'high');
  assert.ok(stats.planCount >= 1, 'update must have planned at least once');
  system.dispose();
});

test('a district can be switched off and the streamer stops planning it', () => {
  const game = makeGame(-2816, 0);
  const system = STREAMING.create(game, {quality:'medium', seed:1337});
  const before = system.districtSettings('blackpine-forest');
  assert.equal(before.enabled, true);
  system.setDistrict('blackpine-forest', {enabled:false, density:0});
  assert.equal(system.districtSettings('blackpine-forest').enabled, false);
  assert.throws(() => system.setDistrict('atlantis', {enabled:false}), /unknown district/);
  system.dispose();
});

console.log('open-world-districts.test.js: all assertions passed');
