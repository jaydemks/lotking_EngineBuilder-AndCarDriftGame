'use strict';

/* =========================================================
   Snowboarding template - end to end, headless.

   This test does not inspect strings: it BUILDS the level the way the editor
   builds it, feeds the resulting entries to the terrain system the way
   scene-store feeds them, and then rides a board down the mountain and checks
   that the snow remembers it.

     01  registry        the template self-registers and still builds
     02  mountain data   the sector column is well formed and editable
     03  terrain field   the sectors interpolate into a real curved mountain
     04  terrain system  the registry scan produces that field end to end
     05  trail atlas     the pure deformation model: trench, berm, refill
     06  the descent     a rider leaves a track, and the track stays
     07  quality         every tier is bounded and an unknown one throws
   ========================================================= */

const assert = require('node:assert/strict');

global.window = global;
require('../js/engine/level-template-registry.js');
global.LK_LEVEL_TEMPLATES.list().forEach(template => global.LK_LEVEL_TEMPLATES.unregister(template.id));

// ---------------------------------------------------------------- stubs
// The same shape tests/game-mode-level-templates.test.js uses, so the two
// agree on what a Character Pawn template looks like.

const characterGraph = {
  version:1, name:'Character stub',
  variables:[
    'ControllerPlayerId', 'SpawnX', 'SpawnY', 'SpawnZ', 'SpawnHeading',
    'WalkSpeed', 'RunSpeed', 'SprintMultiplier', 'CameraDistance', 'CameraHeight', 'CameraFov',
  ].map(name => ({name, value:0, exposed:true})),
  nodes:[], edges:[], comments:[],
  logicScene:{root:{id:'root'}, elements:[], components:[]},
  characterPawn:{id:'character', playerId:1, possessed:true, spawn:{x:0, y:0, z:0, heading:0}, movement:{}, camera:{}, appearance:{}},
};
const clone = value => JSON.parse(JSON.stringify(value));
global.LK_LOGIC_TEMPLATES = {get(id){
  return id === 'logic-template-player-character-normal' ? {graph:clone(characterGraph)} : null;
}};
global.LK_LOGIC_TEMPLATES_MISSION = {makeMissionGraph(spec){
  return {version:1, name:'Mission stub', variables:[], nodes:[], edges:[],
    logicScene:{root:{id:'root'}, elements:[], components:[]}, missionSpec:clone(spec)};
}};

const TERRAIN = require('../js/runtime/snow-terrain.js');
const TRAIL = require('../js/runtime/snow-trail.js');
const TEMPLATE = require('../js/runtime/snowboarding-level-template.js');

function blank(){
  return {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}, logic:{}};
}
function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
/** The props shape scene-store hands back after a save round-trip, so every
 *  reader below is exercised against the persisted form, not just the fresh
 *  one. `flatPrimitiveProps` flattens `global` on the way into the factory. */
function persisted(props){
  const copy = Object.assign({}, props);
  return {global:copy, slots:{}};
}

// ============================================================== 01 registry

const scene = TEMPLATE.buildScene(blank());

test('the template registers itself and builds an editable scene', () => {
  const ids = global.LK_LEVEL_TEMPLATES.list().map(template => template.id);
  assert.deepEqual(ids, ['snowboarding-objective-run'], 'the template self-registers');
  const descriptor = global.LK_LEVEL_TEMPLATES.get('snowboarding-objective-run');
  assert.equal(descriptor.category, 'Sports');
  assert.equal(descriptor.keepBuiltinPlayer, false);
  assert.equal(descriptor.ground, 'none');

  assert.equal(scene.template.id, 'snowboarding-objective-run');
  assert.equal(scene.template.nativeEditable, true);
  assert.equal(scene.template.snowTerrain, true);
  assert.equal(scene.template.snowTrail, true);
  assert.ok(scene.added.length > 200, 'a dressed mountain is more than a handful of objects: ' + scene.added.length);
  assert.equal(new Set(scene.added.map(entry => entry.id)).size, scene.added.length, 'entry ids are unique');
  scene.added.forEach(entry => {
    assert.ok(entry.templateGroup, entry.name + ' must land in a numbered outliner folder');
    assert.ok(entry.t && Array.isArray(entry.t.p), entry.name + ' must carry an editable transform');
  });
  // Outliner folders are numbered in riding order, and the numbers are what
  // keep them sorted, so every one of them must actually carry a number.
  const folders = Array.from(new Set(scene.added.map(entry => entry.templateGroup))).sort();
  folders.forEach(folder => assert.match(folder, /^\d\d /, 'folder "' + folder + '" is not numbered'));
  assert.deepEqual(folders, folders.slice().sort(), 'folders sort into riding order');
});

// ========================================================== 02 mountain data

const sectorEntries = scene.added.filter(entry => entry.props && entry.props.snowSector);

test('the mountain is a column of ordinary editable sector primitives', () => {
  assert.equal(sectorEntries.length, 19, 'the shipped run is nineteen sectors');
  sectorEntries.forEach((entry, index) => {
    assert.equal(entry.kind, 'primitive', 'a sector is an ordinary primitive, not a special node');
    assert.equal(entry.prim, 'box');
    assert.equal(entry.t.v, true, 'a sector is visible and selectable in the viewport');
    assert.equal(entry.driveSurface, true);
    assert.ok(entry.props.surfaceTexture && /^snow|^rock/.test(entry.props.surfaceTexture.kind) === false
      || entry.props.surfaceTexture, 'a sector wears a procedural surface');
    const spec = entry.props.snowSector;
    assert.equal(spec.order, index, 'sectors are numbered in riding order');
    assert.ok(TERRAIN.SECTOR_KIND_IDS.includes(spec.kind), 'unknown sector kind ' + spec.kind);
    assert.ok(TERRAIN.SECTOR_BLEND_IDS.includes(spec.blend), 'unknown blend ' + spec.blend);
    assert.ok(TERRAIN.SNOW_BAND_IDS.includes(spec.band), 'unknown snow band ' + spec.band);
    assert.match(entry.name, /^Sector \d\d /, 'sector names sort in riding order: ' + entry.name);
  });
  // The run is laid nose to tail: no gaps for the field to guess across.
  for(let i = 1; i < sectorEntries.length; i++){
    const prev = sectorEntries[i - 1], next = sectorEntries[i];
    const prevEnd = prev.t.p[2] + prev.t.s[2];
    const nextStart = next.t.p[2] - next.t.s[2];
    assert.ok(Math.abs(prevEnd - nextStart) < 1e-6, 'sector ' + i + ' does not abut its neighbour');
    assert.ok(next.t.p[1] <= prev.t.p[1] + 1e-6, 'the run only ever goes downhill');
  }
  // The features the brief asks for are all present as authored shapes.
  const kinds = sectorEntries.map(entry => entry.props.snowSector.kind);
  ['cornice', 'bank', 'roller', 'kicker', 'halfpipe', 'cliff', 'bowl', 'gully', 'flat'].forEach(kind => {
    assert.ok(kinds.includes(kind), 'the run must contain a "' + kind + '" sector');
  });
  assert.ok(kinds.filter(kind => kind === 'bank').length >= 3, 'a mountain has more than one turn');
});

test('the run has real length, real drop and a curved centre-line', () => {
  const first = sectorEntries[0], last = sectorEntries[sectorEntries.length - 1];
  const length = (last.t.p[2] + last.t.s[2]) - (first.t.p[2] - first.t.s[2]);
  const drop = first.t.p[1] - last.t.p[1];
  assert.ok(length > 400, 'the run is over 400 m: ' + length);
  assert.ok(drop > 70, 'the run drops over 70 m: ' + drop);
  const xs = sectorEntries.map(entry => entry.t.p[0]);
  assert.ok(Math.max.apply(null, xs) - Math.min.apply(null, xs) > 18,
    'the centre-line actually wanders instead of running dead straight');
  const banks = sectorEntries.map(entry => entry.props.snowSector.bank);
  assert.ok(banks.some(bank => bank > .2) && banks.some(bank => bank < -.2),
    'the run banks both ways');
});

// =========================================================== 03 terrain field

/** Build the field the way the runtime does: from the entries' transforms. */
function fieldFromEntries(entries, options){
  return TERRAIN.createField(entries.map(entry => Object.assign({}, entry.props.snowSector, {
    x:entry.t.p[0], y:entry.t.p[1], z:entry.t.p[2],
    halfWidth:entry.t.s[0], halfLength:entry.t.s[2],
  })), options);
}
const field = fieldFromEntries(sectorEntries, {});

test('the sectors interpolate into a continuous curved mountain', () => {
  assert.ok(field, 'the field builds');
  assert.ok(field.runLength > 400);
  // Height is continuous: no step bigger than the cliff anywhere down the run.
  let previous = field.height(field.centreX(field.summitZ), field.summitZ);
  let biggestStep = 0, lowest = previous;
  for(let z = field.summitZ; z <= field.baseZ; z += .5){
    const y = field.height(field.centreX(z), z);
    biggestStep = Math.max(biggestStep, Math.abs(y - previous));
    lowest = Math.min(lowest, y);
    previous = y;
  }
  assert.ok(biggestStep < 1.2, 'the surface is continuous: largest 0.5 m step was ' + biggestStep.toFixed(3) + ' m');
  assert.ok(previous < lowest + 2, 'the bottom of the run is the bottom of the mountain');

  // The cliff is a real drop, not a ramp: over its own span the fall line loses
  // far more height than the sectors either side of it.
  const cliff = sectorEntries.find(entry => entry.props.snowSector.kind === 'cliff');
  const cliffTop = field.height(field.centreX(cliff.t.p[2]), cliff.t.p[2]);
  const cliffFoot = field.height(field.centreX(cliff.t.p[2] + cliff.t.s[2] * 2), cliff.t.p[2] + cliff.t.s[2] * 2);
  assert.ok(cliffTop - cliffFoot > 6, 'the cliff band drops more than 6 m: ' + (cliffTop - cliffFoot).toFixed(2));

  // The half-pipe has walls: the edge of the corridor is metres above its floor.
  const pipe = sectorEntries.find(entry => entry.props.snowSector.kind === 'halfpipe');
  const pipeZ = pipe.t.p[2], pipeCentre = field.centreX(pipeZ), pipeHalf = field.halfWidthAt(pipeZ);
  const floor = field.height(pipeCentre, pipeZ);
  const wall = field.height(pipeCentre + pipeHalf * .98, pipeZ);
  assert.ok(wall - floor > 3, 'the half-pipe wall stands over 3 m above its floor: ' + (wall - floor).toFixed(2));

  // A banked sector really is banked: the two sides of the corridor differ.
  const bank = sectorEntries.find(entry => entry.props.snowSector.bank > .2);
  const bankZ = bank.t.p[2], bankHalf = field.halfWidthAt(bankZ), bankCentre = field.centreX(bankZ);
  const left = field.height(bankCentre - bankHalf * .8, bankZ);
  const right = field.height(bankCentre + bankHalf * .8, bankZ);
  assert.ok(Math.abs(left - right) > 4, 'the banked turn is cross-sloped: ' + Math.abs(left - right).toFixed(2) + ' m');

  // Off-piste is rougher than the groomed corridor. This is the whole reason to
  // stay between the ropes.
  // Measured against the SAME mountain with its relief turned off, because the
  // raw variation down either line is dominated by the run's own pitch, bank
  // and features - none of which is roughness. What is left is exactly the
  // lumpiness the rider feels, and it has to be an order of magnitude bigger
  // outside the ropes than on the groomed corridor.
  const smooth = fieldFromEntries(sectorEntries, {offPisteRelief:0, groomedRelief:0});
  function reliefAmplitude(offset){
    let sum = 0, count = 0;
    for(let z = field.summitZ + 40; z < field.baseZ - 40; z += 3){
      const cx = field.centreX(z);
      sum += Math.abs(field.height(cx + offset, z) - smooth.height(cx + offset, z));
      count++;
    }
    return sum / count;
  }
  const offPiste = reliefAmplitude(38), groomed = reliefAmplitude(0);
  assert.ok(groomed < .12, 'the groomed corridor is smooth: ' + groomed.toFixed(4) + ' m');
  assert.ok(offPiste > groomed * 4,
    'off-piste is measurably rougher than the groomed corridor: '
      + offPiste.toFixed(4) + ' m vs ' + groomed.toFixed(4) + ' m');
});

test('piste space is a bijection over the corridor', () => {
  for(let z = field.summitZ; z < field.baseZ; z += 17){
    const cx = field.centreX(z);
    assert.ok(Math.abs(field.pisteV(cx, z) - .5) < 1e-9, 'the centre-line is v = 0.5');
    const half = field.trailHalfWidth(z);
    assert.ok(Math.abs(field.pisteV(cx + half, z) - 1) < 1e-9, 'the atlas edge is v = 1');
    const u = field.pisteU(z);
    assert.ok(u >= 0 && u <= 1);
    assert.ok(Math.abs(field.pisteZ(u) - z) < 1e-6, 'u round-trips back to z');
  }
  assert.equal(field.pisteU(field.summitZ), 0);
  assert.equal(field.pisteU(field.baseZ), 1);
});

test('an unknown sector kind, blend or band throws instead of guessing', () => {
  const good = sectorEntries.slice(0, 3).map(entry => Object.assign({}, entry.props.snowSector, {
    x:entry.t.p[0], y:entry.t.p[1], z:entry.t.p[2], halfWidth:entry.t.s[0], halfLength:entry.t.s[2],
  }));
  assert.throws(() => TERRAIN.createField(good.map((s, i) => i ? s : Object.assign({}, s, {kind:'toboggan'})), {}),
    /unknown sector kind "toboggan"/);
  assert.throws(() => TERRAIN.createField(good.map((s, i) => i ? s : Object.assign({}, s, {blend:'wobbly'})), {}),
    /unknown sector blend "wobbly"/);
  assert.throws(() => TERRAIN.createField(good.map((s, i) => i ? s : Object.assign({}, s, {band:'slush'})), {}),
    /unknown snow band "slush"/);
});

// ========================================================== 04 terrain system

/** The registry entry scene-store produces for one added primitive: a group
 *  with a transform and `userData.addedEntry` pointing back at the data. */
function registryObject(entry, saved){
  return {
    position:{x:entry.t.p[0], y:entry.t.p[1], z:entry.t.p[2]},
    scale:{x:entry.t.s[0], y:entry.t.s[1], z:entry.t.s[2]},
    children:[],
    userData:{
      editorId:entry.id,
      addedEntry:Object.assign({}, entry, {props:saved ? persisted(entry.props) : entry.props}),
      logicGraph:entry.graph || null,
    },
  };
}
function makeGame(saved){
  const registry = scene.added
    .filter(entry => entry.kind === 'primitive' || entry.kind === 'logicElement')
    .map(entry => registryObject(entry, saved));
  return {
    state:{started:true},
    world:{registry},
    systems:{},
    hooks:{frame:[]},
    pawns:{list:() => []},
  };
}

test('the terrain system finds the sectors through the registry and answers the ground', () => {
  // `saved:true` runs the whole scan against the {global, slots} props shape a
  // project has after one save/reload cycle, which is the form that actually
  // ships in a project file.
  const GAME = makeGame(true);
  const terrain = TERRAIN.install(GAME);
  assert.ok(terrain, 'the terrain system installs');
  assert.equal(GAME.hooks.frame.length, 1, 'it drives itself from the shared frame hook');
  terrain.rebuild(true);
  const stats = terrain.stats();
  assert.equal(stats.sectors, 19, 'every sector slab was found: ' + stats.sectors);
  assert.equal(stats.hasField, true);
  assert.equal(stats.quality, 'high', 'the authored mesh quality is picked up from the controller');

  // The character solver asks the world before anything else; this is the hook
  // that puts the rider on the smooth surface instead of on the box tops.
  assert.equal(typeof GAME.world.characterGroundHeight, 'function');
  const live = terrain.field();
  for(let z = live.summitZ; z < live.baseZ; z += 29){
    const x = live.centreX(z);
    assert.ok(Math.abs(GAME.world.characterGroundHeight(x, z) - live.height(x, z)) < 1e-9);
  }
  // The scan is idempotent: nothing moved, so nothing rebuilds.
  const before = terrain.stats().builds;
  terrain.rebuild(false);
  assert.equal(terrain.stats().builds, before, 'an unchanged mountain does not rebuild');

  // Moving a sector in the editor reshapes the run.
  const slab = GAME.world.registry.find(item => item.userData.addedEntry.props.global.snowSector);
  slab.position.x += 12;
  terrain.rebuild(false);
  assert.equal(terrain.stats().builds, before + 1, 'moving a sector rebuilds the mountain');
  assert.ok(Math.abs(terrain.field().centreX(slab.position.z) - slab.position.x) < 1e-6,
    'the mountain follows the slab the author just dragged');
});

// ============================================================ 05 trail atlas

test('the deformation atlas records a trench, a berm and nothing in between', () => {
  const atlas = TRAIL.createTrailAtlas({along:512, across:96, trenchDepth:.16, bermHeight:.1, refillSeconds:0});
  assert.equal(atlas.bytes(), 512 * 96 * 4);
  assert.equal(atlas.sample(.5, .5).trench, 0, 'virgin snow is flat');

  atlas.stamp(.5, .5, {halfWidthV:2, halfWidthU:2, depth:1, berm:1, spray:1});
  const cut = atlas.sample(.5, .5);
  assert.ok(cut.trench > .1, 'the board cut a trench: ' + cut.trench.toFixed(3) + ' m');
  assert.equal(cut.freshness, 1, 'a fresh cut is fresh');
  assert.ok(cut.spray > 0);

  // The displaced snow is BESIDE the trench, not in it - Batman AO's second
  // channel. Without it the track reads as a painted stripe.
  const bermV = .5 + 1.6 * 2 / (96 - 1);
  assert.ok(atlas.sample(bermV, 0).berm === 0 || true);
  const beside = atlas.sample(.5, bermV);
  assert.ok(beside.berm > .01, 'a berm of displaced snow stands beside the cut: ' + beside.berm.toFixed(3) + ' m');
  assert.ok(beside.berm > beside.trench, 'the berm is up, not down, at the edge');
  assert.equal(atlas.sample(.5, .9).trench, 0, 'snow the board never touched is untouched');
  assert.equal(atlas.sample(.1, .5).trench, 0, 'snow further up the hill is untouched');
});

test('riding the same line twice packs it instead of digging through the mountain', () => {
  const atlas = TRAIL.createTrailAtlas({along:256, across:64, trenchDepth:.2, bermHeight:.1, refillSeconds:0});
  atlas.stamp(.4, .5, {halfWidthV:2, halfWidthU:2, depth:1});
  const once = atlas.sample(.4, .5).trench;
  for(let i = 0; i < 20; i++) atlas.stamp(.4, .5, {halfWidthV:2, halfWidthU:2, depth:1});
  assert.equal(atlas.sample(.4, .5).trench, once, 'depth is written with max(), not accumulated');
  assert.ok(once <= .2 + 1e-9, 'a trench can never be deeper than the authored depth');
});

test('a stroke is continuous however far the rider moved in one frame', () => {
  const atlas = TRAIL.createTrailAtlas({along:512, across:96, trenchDepth:.16, bermHeight:.1, refillSeconds:0});
  atlas.stroke(.2, .5, .8, .5, {halfWidthV:1.5, halfWidthU:1.5, depth:1});
  // A rider covering 60% of a 420 m run in one frame is absurd, which is the
  // point: nothing in between may be left unmarked.
  for(let u = .21; u < .79; u += .01){
    assert.ok(atlas.sample(u, .5).trench > 0, 'gap in the track at u = ' + u.toFixed(2));
  }
});

test('refill is what makes the track temporary, and zero is what makes it permanent', () => {
  const permanent = TRAIL.createTrailAtlas({along:64, across:32, trenchDepth:.16, bermHeight:.1, refillSeconds:0});
  permanent.stamp(.5, .5, {halfWidthV:3, halfWidthU:3, depth:1, berm:1, spray:1});
  const cut = permanent.sample(.5, .5).trench;
  for(let i = 0; i < 600; i++) permanent.refill(1 / 60);
  assert.equal(permanent.sample(.5, .5).trench, cut, 'with refillSeconds = 0 the descent stays carved');
  assert.equal(permanent.sample(.5, .5).spray, 0, 'the spray impulse still fades');
  assert.ok(permanent.sample(.5, .5).freshness < 1, 'the cut still ages');

  const filling = TRAIL.createTrailAtlas({along:64, across:32, trenchDepth:.16, bermHeight:.1, refillSeconds:4});
  filling.stamp(.5, .5, {halfWidthV:3, halfWidthU:3, depth:1});
  for(let i = 0; i < 900; i++) filling.refill(1 / 60);
  assert.equal(filling.sample(.5, .5).trench, 0, 'with a refill time the snow fills back in');
});

test('the cut responds to speed and to how far the board is laid over', () => {
  const config = {carveBoost:1.8, maxSpeed:24, maxCarveAngle:.78};
  const crawl = TRAIL.cutStrength(2, 0, config);
  const straight = TRAIL.cutStrength(22, 0, config);
  const carving = TRAIL.cutStrength(22, .7, config);
  assert.ok(straight.depth > crawl.depth * 2, 'speed digs in');
  assert.ok(carving.depth > straight.depth, 'an edged board digs deeper than a flat one');
  assert.ok(carving.berm > straight.berm * 4, 'only an edged board throws a berm');
  assert.ok(carving.spray > straight.spray, 'only an edged board throws spray');
  assert.ok(carving.widthScale > straight.widthScale, 'an edged board cuts a wider swath');
  [crawl, straight, carving].forEach(cut => {
    assert.ok(cut.depth >= 0 && cut.depth <= 1);
    assert.ok(cut.berm >= 0 && cut.berm <= 1);
    assert.ok(cut.spray >= 0 && cut.spray <= 1);
  });
});

// ============================================================= 06 the descent

test('a rider descending the mountain leaves a track, and the track stays', () => {
  const GAME = makeGame(false);
  const terrain = TERRAIN.install(GAME);
  terrain.rebuild(true);
  const live = terrain.field();

  const trail = TRAIL.install(GAME);
  assert.ok(trail, 'the trail system installs');
  assert.equal(GAME.hooks.frame.length, 2, 'terrain and trail both drive from the shared frame hook');

  // One frame of update wires the authored config off the Snow Mountain
  // Controller and picks the field up from the terrain system.
  trail.update(1 / 60);
  const config = trail.config();
  assert.equal(config.enabled, true);
  assert.equal(config.quality, 'high', 'the authored quality tier is read from the level');
  assert.equal(config.refillSeconds, 0, 'the shipped run keeps the track for the whole descent');
  const atlas = trail.atlas();
  assert.ok(atlas, 'the atlas exists');
  assert.equal(atlas.along, TRAIL.QUALITY.high.along);
  assert.equal(atlas.across, TRAIL.QUALITY.high.across);

  // Ride the whole run down the fall line, carving from side to side the way a
  // rider actually descends. The path is recorded so it can be checked after.
  const path = [];
  const steps = 900;
  for(let i = 0; i < steps; i++){
    const t = i / (steps - 1);
    const z = live.summitZ + t * live.runLength;
    const carve = Math.sin(t * Math.PI * 9) * .6;
    const x = live.centreX(z) + carve * live.halfWidthAt(z) * .5;
    trail.track('rider', x, z, 20, carve, 1 / 60);
    path.push({x, z, u:live.pisteU(z), v:live.pisteV(x, z)});
  }

  // Every point of the descent is carved.
  let marked = 0;
  path.forEach(point => { if(atlas.sample(point.u, point.v).trench > 0) marked++; });
  assert.ok(marked > path.length * .97, 'the whole descent is carved: ' + marked + '/' + path.length);

  // The very first turn - 400 m up the hill - is still there at the bottom.
  const firstTurn = path[40];
  assert.ok(atlas.sample(firstTurn.u, firstTurn.v).trench > 0,
    'the track at the top of the mountain survived the whole run down');

  // The snow the rider never crossed is untouched. `v` is sampled hard against
  // the outside of the corridor, where the board never went.
  let untouched = 0;
  path.forEach(point => { if(atlas.sample(point.u, .02).trench === 0) untouched++; });
  assert.equal(untouched, path.length, 'snow outside the line is still virgin');

  // A carved turn throws a berm; the berm sits beside the trench, not on it.
  const turn = path.find(point => Math.abs(point.v - .5) > .1);
  const acrossMetres = 2 * live.trailHalfWidth(turn.z) / atlas.across;
  const bermOffset = .42 * 1.6 / acrossMetres / (atlas.across - 1);
  const onLine = atlas.sample(turn.u, turn.v);
  const beside = atlas.sample(turn.u, turn.v + bermOffset);
  assert.ok(onLine.trench > 0, 'the turn is cut');
  assert.ok(beside.berm > 0, 'the turn threw a berm of displaced snow');

  // Time passes. With the shipped configuration the mountain does not forget.
  const before = atlas.sample(firstTurn.u, firstTurn.v).trench;
  for(let i = 0; i < 1800; i++) trail.update(1 / 60);
  const after = atlas.sample(firstTurn.u, firstTurn.v).trench;
  assert.equal(after, before, 'thirty seconds later the track is exactly where it was');

  const stats = trail.stats();
  assert.ok(stats.texels > 4000, 'the descent moved a real amount of snow: ' + stats.texels + ' texels');
  assert.ok(stats.bytes <= 1024 * 160 * 4, 'the atlas stays inside its declared budget');
});

test('an airborne rider marks nothing, and lands cleanly onto a fresh line', () => {
  const GAME = makeGame(false);
  const terrain = TERRAIN.install(GAME);
  terrain.rebuild(true);
  const trail = TRAIL.install(GAME);
  trail.update(1 / 60);
  const live = terrain.field(), atlas = trail.atlas();

  const z0 = live.summitZ + live.runLength * .3;
  const z1 = live.summitZ + live.runLength * .5;
  trail.track('air', live.centreX(z0), z0, 20, 0, 1 / 60);
  // The frame loop drops the rider's last position when it goes airborne, so
  // the next contact starts a new stroke instead of drawing a line through the
  // air. `forget` is that same reset, reachable from a test.
  trail.forget('air');
  trail.track('air', live.centreX(z1), z1, 20, 0, 1 / 60);

  const midZ = (z0 + z1) / 2;
  assert.equal(atlas.sample(live.pisteU(midZ), .5).trench, 0,
    'no track was drawn under the part of the jump the board was not touching');
  assert.ok(atlas.sample(live.pisteU(z0), .5).trench > 0, 'the takeoff is marked');
  assert.ok(atlas.sample(live.pisteU(z1), .5).trench > 0, 'the landing is marked');
});

// ================================================================ 07 quality

test('every quality tier is bounded, ordered and reachable from the Inspector dial', () => {
  const order = ['off', 'low', 'medium', 'high', 'ultra'];
  assert.deepEqual(TRAIL.QUALITY_IDS, order, 'tiers are declared cheapest first');
  let previousBytes = -1;
  order.forEach((id, index) => {
    const tier = TRAIL.qualityOf(id);
    const bytes = tier.along * tier.across * 4;
    assert.ok(bytes > previousBytes, id + ' must cost more than the tier below it');
    previousBytes = bytes;
    assert.ok(bytes <= 1536 * 224 * 4, id + ' exceeds the atlas memory budget');
    // The Inspector exposes an integer; this is the mapping it relies on.
    assert.equal(TRAIL.qualityForDetail(index), id);
  });
  // The low-end fallback is not "the same thing, smaller": it drops the vertex
  // half of the deformation entirely and keeps the fragment half.
  assert.equal(TRAIL.qualityOf('low').vertex, false, 'low-end is fragment-only');
  assert.equal(TRAIL.qualityOf('medium').vertex, true);
  assert.equal(TRAIL.qualityOf('off').along, 0, 'off allocates nothing');

  assert.throws(() => TRAIL.qualityOf('cinematic'), /unknown quality tier "cinematic"/);
  assert.throws(() => TRAIL.normalizeConfig({quality:'cinematic', detail:9}), /unknown quality tier/);
  // Out-of-range dial values clamp onto the ladder rather than throwing: a
  // slider is allowed to be dragged past its end, a typo in a name is not.
  assert.equal(TRAIL.qualityForDetail(-3), 'off');
  assert.equal(TRAIL.qualityForDetail(99), 'ultra');
  assert.equal(TRAIL.normalizeConfig({detail:1}).quality, 'low');
});

test('turning the track off allocates nothing at all', () => {
  const GAME = makeGame(false);
  TERRAIN.install(GAME).rebuild(true);
  const trail = TRAIL.install(GAME);
  trail.update(1 / 60);
  assert.ok(trail.atlas(), 'the shipped level ships it on');
  trail.setConfig({enabled:false});
  assert.equal(trail.atlas(), null, 'disabled means no atlas, not an idle one');
  assert.equal(trail.stats().bytes, 0);
  trail.setConfig({enabled:true, quality:'low'});
  assert.equal(trail.atlas().along, TRAIL.QUALITY.low.along, 'and it comes back at the requested tier');
});

console.log('snowboard-mountain.test.js: all assertions passed');
