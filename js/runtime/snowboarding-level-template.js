/* =========================================================
   LOT KING - Snowboarding level template
   "Col des Larches - Summit to Base"

   A 420 m alpine descent: a summit cornice, banked traverses, a rock cliff
   band, a half-pipe, a rail garden and three kickers, with off-piste bowls and
   gullies outside the ropes and a conifer forest that is a real obstacle
   rather than scenery.

   WHAT THIS FILE IS AND IS NOT
   -----------------------------------------------------------------
   It is DATA. Every object below is an ordinary editor entry the outliner
   lists, the gizmo moves and the Inspector edits; every number a rider can
   feel is an exposed Logic variable with a label, a category and a range.
   Nothing here draws, simulates or allocates.

   The mountain's SHAPE lives in the sector slabs in section 05: each slab is
   one primitive whose transform IS a control point of the piste - its position
   gives the centre-line and the altitude, its X scale gives how wide the piste
   is there, its Z scale gives how long the sector is. js/runtime/snow-terrain.js
   reads those slabs back, interpolates them into a continuous heightfield and
   bakes that field into the slabs' own geometry, so dragging a slab sideways
   curves the run and raising one steepens the pitch above it. Without that
   module every slab is still a box and the level still opens.

   The BOARD TRACK - the trench the rider leaves behind, and the committente's
   first request - lives in js/runtime/snow-trail.js and is configured by the
   `snowTrail` block on the terrain controller in section 09.

   HOW THIS FILE IS ORGANISED
     00  identity and extents
     01  zones            outliner folders, numbered summit (01) to base (10)
     02  palette          raw colours, named by what they are made of
     03  material classes every surface names a class, never a loose hex
     04  helpers          primitive constructors and the entry factory
     05  mountain         the sector column: the terrain's source of truth
     06  piste furniture  ropes, gates, signage, cliff netting, lift line
     07  forest           tree stands - data only; snow-forest.js grows them
     08  features         kickers, rails and the half-pipe deck the tricks use
     09  logic elements   terrain controller, rider Pawn, Mission Director
     10  world data       bounds, environment, camera grade, manifest
   ========================================================= */
(function(){
'use strict';

// ================================================================ 00 identity

const root = typeof window !== 'undefined' ? window : globalThis;
const ID = 'snowboarding-objective-run';
const SOURCE = 'Snowboarding Objective Run template';

// The run is authored downhill: -Z is the summit, +Z is the base, which is the
// same axis convention every other character template in the project uses.
const SUMMIT_Z = -240;
// Lateral movement bound. Wide enough to let a rider go off-piste into the
// bowls and the gullies, tight enough that nobody rides off the mountain.
const RIDE_HALF_X = 62;

/** Ride physics variables, mapped from the exposed Logic variable name to the
 *  key the runtime reads. One table, so a rename cannot drift between the
 *  variable list, the binding string and the normalizer. */
const RIDE_VARIABLES = Object.freeze({
  DownhillAcceleration:'downhillAcceleration', MaxRideSpeed:'maxSpeed', CarveRate:'carveRate',
  MaxCarveAngle:'maxCarveAngle', BrakeStrength:'brakeStrength', RideDrag:'drag', AirDrag:'airDrag',
  TrickSpinRate:'trickSpinRate', LandingBaseScore:'landingBaseScore',
});

function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function finite(value, fallback){ value = Number(value); return Number.isFinite(value) ? value : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function setVar(graph, name, value){
  const item = (graph.variables || []).find(variable => variable && variable.name === name);
  if(item) item.value = value;
}

// =================================================================== 01 zones
// Declared in riding order and numbered to match: the outliner sorts these
// labels as text, so the numbers are what keep the folders in the order the
// rider actually meets them coming down the hill.

const GROUP = {
  mountain:  '01 Mountain Sectors',
  summit:    '02 Summit and Drop-in',
  upper:     '03 Upper Piste Furniture',
  cliff:     '04 Cliff Band',
  pipe:      '05 Half-pipe',
  rails:     '06 Rail Garden',
  kickers:   '07 Kickers and Airs',
  forest:    '08 Forest Stands',
  base:      '09 Base Area and Finish',
  gameplay:  '10 Gameplay',
};

// ================================================================= 02 palette
// A high-alpine morning: the snow is not white, it is a pale blue-grey that the
// sun turns white only where it faces the light. Everything man-made on the
// mountain is deliberately saturated, because a red gate pole against snow is
// the only thing the eye can use to read distance up here.

const COLOR = {
  // snow and ice. These read far brighter than they look here: the procedural
  // snow multiplies them and the sky environment lifts them again.
  snowFresh:0xe9f1fa,
  snowGroomed:0xdfe9f4,
  snowPacked:0xd3dfec,
  snowShadow:0xc2d2e4,
  ice:0xa8c2d8,
  // the mountain underneath
  rock:0x5a5f66,
  rockDark:0x44484e,
  // trees
  conifer:0x24402f,
  coniferDark:0x1a3024,
  bark:0x4a3a2c,
  // piste furniture. Saturated on purpose.
  gateBlue:0x2f7fd0,
  gateRed:0xc93b32,
  gateGold:0xe8b53a,
  ropeOrange:0xe07a2c,
  netOrange:0xd2691e,
  signYellow:0xd8b13c,
  // built features
  steel:0x707880,
  steelDark:0x454c55,
  railChrome:0x9aa4ae,
  // the lift and the base
  cabinRed:0xa8433a,
  cabinRoof:0x3c4048,
  glassDark:0x1f2833,
  lampGlow:0xffe6b0,
};

// ======================================================== 03 material classes
//
// Every piece of the mountain names a class here instead of carrying a loose
// hex. A class is the whole surface identity: colour, PBR response, which
// procedural surface it wears (js/engine/procedural-surfaces.js), how many
// metres one texture tile covers, and the footstep material a body standing on
// it should sound like.
//
// The snow classes are ordered the way the mountain is: what falls out of the
// sky first, what the machines make second, what the traffic leaves third,
// what is left when the snow is gone last.

const SURFACE_VARIANTS = 3;

function material(color, roughness, metalness, surface, tile, foot, strength){
  return {color, roughness, metalness, surface, tile, foot, strength};
}

const MAT = {
  // -- snow, top of the mountain down
  snowPowder:   material(COLOR.snowFresh,   .97, 0,   'snowPowder',   3.2, 'snow'),
  snowGroomed:  material(COLOR.snowGroomed, .94, 0,   'snowGroomed',  2.4, 'snow'),
  snowPacked:   material(COLOR.snowPacked,  .90, 0,   'snowPacked',   2.8, 'snow'),
  snowIce:      material(COLOR.ice,         .26, 0,   'snowIce',      3.4, 'ice'),
  snowShadow:   material(COLOR.snowShadow,  .95, 0,   'snowPowder',   3.6, 'snow', .7),
  // -- the mountain underneath
  rock:         material(COLOR.rock,        .96, 0,   'snowRock',     3.0, 'rock'),
  rockDark:     material(COLOR.rockDark,    .96, 0,   'snowRock',     2.4, 'rock'),
  // -- trees
  conifer:      material(COLOR.conifer,     .95, 0,   null,           0,   'grass'),
  coniferDark:  material(COLOR.coniferDark, .95, 0,   null,           0,   'grass'),
  bark:         material(COLOR.bark,        .93, 0,   'wood',         1.2, 'wood'),
  // -- piste furniture. Paint is a dielectric: none of these are metals.
  gateBlue:     material(COLOR.gateBlue,    .62, 0,   null,           0,   'metal'),
  gateRed:      material(COLOR.gateRed,     .62, 0,   null,           0,   'metal'),
  gateGold:     material(COLOR.gateGold,    .58, 0,   null,           0,   'metal'),
  ropeOrange:   material(COLOR.ropeOrange,  .82, 0,   null,           0,   'metal'),
  netOrange:    material(COLOR.netOrange,   .88, 0,   'tarp',         1.4, 'carpet'),
  signYellow:   material(COLOR.signYellow,  .60, 0,   null,           0,   'metal'),
  // -- built features. A rail IS bare polished steel; a painted post is not.
  steel:        material(COLOR.steel,       .55, .12, 'metalPainted', 1.4, 'metal'),
  steelDark:    material(COLOR.steelDark,   .60, .15, 'metalPainted', 1.4, 'metal'),
  railChrome:   material(COLOR.railChrome,  .18, .85, null,           0,   'metal'),
  // -- base area
  cabin:        material(COLOR.cabinRed,    .84, 0,   'wood',         1.8, 'wood'),
  cabinRoof:    material(COLOR.cabinRoof,   .70, .10, 'metalCorrugated', 2.2, 'metal'),
  glass:        material(COLOR.glassDark,   .08, .12, null,           0,   'marble'),
};

// ================================================================= 04 helpers

function buildScene(baseScene){
  const scene = baseScene || {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}, logic:{}};
  // The blank template ships a small default ground plane; the mountain
  // replaces it entirely.
  scene.added = (scene.added || []).filter(entry => !(entry && entry.name === 'Ground' && entry.asset && entry.asset.source === 'Editor primitive'));

  let seq = 0;
  function nextId(){ return 'snow_run_' + String(++seq).padStart(3, '0'); }

  // `spec` is a material class name, or a raw colour for the handful of one-off
  // accents that do not deserve a class. An unknown class name THROWS rather
  // than falling back: a silent fallback turns a typo into a piece of snow
  // somewhere in four hundred objects, and every caller here runs under the
  // node tests, so the throw is caught before it ships.
  function resolveMaterial(spec){
    if(typeof spec === 'number') return {color:spec, roughness:.92, metalness:0};
    if(typeof spec === 'string' && MAT[spec]) return MAT[spec];
    throw new Error('Snowboarding level template: unknown material class "' + spec + '"');
  }

  function add(name, prim, position, scale, spec, collide, options){
    const opts = options || {};
    const mat = resolveMaterial(spec);
    const props = Object.assign({
      color:mat.color,
      roughness:mat.roughness == null ? .92 : mat.roughness,
      metalness:mat.metalness == null ? 0 : mat.metalness,
      centered:true,
    }, opts.props || {});
    if(opts.castShadow === false) props.castShadow = false;
    if(mat.surface && props.materialModel !== 'unlit' && opts.surfaceTexture !== false){
      props.surfaceTexture = Object.assign({
        kind:mat.surface,
        tile:mat.tile || 2,
      }, mat.strength != null ? {strength:mat.strength} : null,
        opts.seed != null ? {seed:Math.abs(Math.round(opts.seed)) % SURFACE_VARIANTS} : null,
        opts.surfaceTexture || null);
    }
    const entry = {
      id:nextId(),
      kind:'primitive',
      prim,
      name,
      collide:collide === true,
      driveSurface:opts.driveSurface === true,
      surface:opts.surface || mat.foot || undefined,
      props,
      t:{p:position.slice(), r:(opts.rotation || [0, 0, 0]).slice(), s:scale.slice(), v:opts.visible !== false},
      asset:{key:'primitive:' + prim, name, source:SOURCE},
      templateGroup:opts.group || GROUP.mountain,
    };
    scene.added.push(entry);
    return entry;
  }
  // Primitive scales are half-extents; authoring in metres keeps the numbers
  // readable and matches what the Inspector shows as size.
  function box(name, position, size, spec, collide, options){
    return add(name, 'box', position, [size[0] / 2, size[1] / 2, size[2] / 2], spec, collide === true, options);
  }
  function cylinder(name, position, radius, height, spec, collide, options){
    return add(name, 'cylinder', position, [radius, height / 2, radius], spec, collide, options);
  }
  function glow(name, position, size, color, options){
    return box(name, position, size, color, false, Object.assign({}, options, {
      props:Object.assign({materialModel:'unlit'}, (options || {}).props || {}),
    }));
  }

  // ============================================================== 05 mountain
  //
  // THE SOURCE OF TRUTH FOR THE WHOLE RUN.
  //
  // One row of slabs from the summit to the base. Each is an ordinary editable
  // primitive whose transform is a control point:
  //
  //   position           the centre-line (x), the altitude (y), the station (z)
  //   scale.x            how wide the PISTE is here - the ropes, not the ground
  //   scale.z            how long this sector is
  //   props.snowSector   which shape it wears and how strongly
  //
  // `z` is not authored: sectors are laid nose to tail down the fall line by
  // the walker below, so inserting or resizing one never leaves a gap or an
  // overlap for the field to interpolate across.
  //
  // The kinds come from js/runtime/snow-terrain.js and an unknown one throws
  // there, so a typo here fails the node test rather than flattening a feature.

  const SECTORS = [
    // name                 kind        len  halfW    x     y   bank   amp  extra
    ['Summit Cornice',     'cornice',    18,   15,    0,   86,     0,  1.8, {band:'powder'}],
    ['Glacier Schuss',     'schuss',     24,   15,    0,   79,     0,    0, {}],
    ['Upper Traverse',     'bank',       26,   16,   -8,   71,   .26,  2.4, {}],
    ['Cirque Rollers',     'roller',     26,   16,  -11,   63,   .06,  1.3, {count:3}],
    ['North Face',         'schuss',     22,   13,   -4,   54,  -.08,    0, {band:'ice'}],
    ['Ridge Bowl',         'bowl',       24,   14,    2,   47,     0,  3.4, {}],
    ['Larch Bend',         'bank',       28,   15,   11,   40,  -.30,  2.8, {}],
    ['Kicker Knoll',       'kicker',     20,   15,    9,   34,  -.05,  2.6, {featureHalfWidth:7}],
    ['Half-pipe Entry',    'schuss',     18,   12,    3,   30,     0,    0, {}],
    ['Half-pipe',          'halfpipe',   34,   11,    0,   25,     0,  4.6, {band:'packed'}],
    ['Half-pipe Exit',     'schuss',     16,   13,    0,   21,     0,    0, {}],
    ['Cliff Band',         'cliff',      20,   16,   -3,   19,   .06,  1.1, {band:'rock'}],
    ['Cliff Landing',      'schuss',     22,   17,   -7,    9,   .10,    0, {blend:'sharp'}],
    ['Timber Gully',       'gully',      24,   15,   -5,    6,     0,  3.0, {}],
    ['Lower Traverse',     'bank',       26,   16,    4,    4,   .22,  2.2, {}],
    ['Rail Garden',        'schuss',     24,   18,    7,  2.4,     0,    0, {band:'packed'}],
    ['Boneyard Rollers',   'roller',     22,   18,    3,  1.4,     0,  1.1, {count:2}],
    ['Base Kicker',        'kicker',     20,   17,    0,   .7,     0,  2.2, {featureHalfWidth:8}],
    ['Finish Apron',       'flat',       30,   24,    0,    0,     0,    0, {band:'groomed'}],
  ];

  // Which snow class a sector SLAB wears. The terrain module decides the
  // per-point band analytically; the slab only needs a plausible base material
  // for the case where that module is absent, so this is the same table read
  // one step coarser.
  const SECTOR_MATERIAL = Object.freeze({
    powder:'snowPowder', groomed:'snowGroomed', packed:'snowPacked', ice:'snowIce', rock:'rock',
  });
  function sectorMaterial(band){
    const name = SECTOR_MATERIAL[band];
    if(!name) throw new Error('Snowboarding level template: unknown snow band "' + band + '"');
    return name;
  }

  const sectorStations = [];
  let walkZ = SUMMIT_Z;
  SECTORS.forEach((row, index) => {
    const name = row[0], kind = row[1], length = row[2], halfWidth = row[3];
    const x = row[4], y = row[5], bank = row[6], amplitude = row[7];
    const extra = row[8] || {};
    const halfLength = length / 2;
    const z = walkZ + halfLength;
    walkZ = z + halfLength;

    const band = extra.band || (kind === 'bowl' || kind === 'gully' ? 'powder' : 'groomed');
    const label = String(index + 1).padStart(2, '0') + ' ' + name;
    const entry = box('Sector ' + label, [x, y, z], [halfWidth * 2, .6, length], sectorMaterial(band), false, {
      group:GROUP.mountain,
      driveSurface:true,
      seed:index,
      // The sector contract. snow-terrain.js reads exactly these keys plus the
      // transform above; everything else about the shape is derived.
      props:{
        snowSector:Object.assign({order:index, kind, bank, amplitude, band, blend:'smooth'}, extra),
      },
    });
    sectorStations.push({index, name, kind, x, y, z, halfWidth, halfLength, band, id:entry.id});
  });

  const BASE_Z = walkZ;
  const summit = sectorStations[0];
  const finish = sectorStations[sectorStations.length - 1];

  /** Station lookup by name, so the furniture below is placed relative to the
   *  sectors instead of against hand-copied Z numbers that rot the moment a
   *  sector length changes. An unknown name throws for the same reason an
   *  unknown material class does. */
  function station(name){
    const found = sectorStations.find(item => item.name === name);
    if(!found) throw new Error('Snowboarding level template: unknown sector "' + name + '"');
    return found;
  }

  // ======================================================= 06 piste furniture

  function buildFurniture(){
    // --- summit -------------------------------------------------------------
    const g0 = GROUP.summit, top = station('Summit Cornice');
    box('Summit Start Beam', [top.x, top.y + 3.4, top.z - 6], [12, .4, .4], 'steelDark', false, {group:g0});
    [-5.6, 5.6].forEach((offset, index) => {
      cylinder('Summit Start Post ' + (index + 1), [top.x + offset, top.y + 1.7, top.z - 6], .16, 3.4, 'steelDark', true, {group:g0});
    });
    box('Summit Start Banner', [top.x, top.y + 3.4, top.z - 6], [11, .9, .12], 'gateGold', false, {group:g0});
    box('Summit Piste Map', [top.x - 8, top.y + 1.6, top.z - 7], [2.2, 1.5, .12], 'signYellow', false, {group:g0, rotation:[0, .5, 0]});
    // Wind-scoured rock either side of the drop-in, so the summit reads as a
    // ridge rather than as the top of a ramp.
    [[-22, -3, 5.5], [24, 2, 6.2], [-30, 9, 4.4]].forEach((spot, index) => {
      add('Summit Outcrop ' + (index + 1), 'sphere', [top.x + spot[0], top.y + spot[1] - 2, top.z + spot[2]],
        [4.5 + index, 2.4 + index * .5, 3.8 + index], 'rock', true, {group:g0, seed:index, rotation:[0, index * .8, 0]});
    });

    // --- piste edge ropes ---------------------------------------------------
    // The ropes are what make the corridor legible from inside it. One pair per
    // sector, following the centre-line, so a curve reads as a curve instead of
    // as a wall of identical posts.
    sectorStations.forEach(sector => {
      if(sector.kind === 'flat') return;
      const group = sector.z < station('Cliff Band').z ? GROUP.upper : GROUP.base;
      const tag = String(sector.index + 1).padStart(2, '0');
      [-1, 1].forEach(side => {
        const x = sector.x + side * sector.halfWidth;
        cylinder('Rope Post ' + tag + (side < 0 ? 'L' : 'R'), [x, sector.y + 1.2, sector.z], .09, 2.4, 'ropeOrange', false,
          {group, castShadow:false});
        box('Rope Span ' + tag + (side < 0 ? 'L' : 'R'), [x, sector.y + 1.9, sector.z], [.06, .06, sector.halfLength * 2],
          'ropeOrange', false, {group, castShadow:false});
      });
    });

    // --- cliff band ---------------------------------------------------------
    const cliff = station('Cliff Band');
    [-1, 1].forEach((side, index) => {
      box('Cliff Safety Net ' + (index + 1), [cliff.x + side * (cliff.halfWidth + 1.5), cliff.y + 1.6, cliff.z],
        [.18, 3.2, cliff.halfLength * 1.6], 'netOrange', true, {group:GROUP.cliff});
      cylinder('Cliff Net Post ' + (index + 1), [cliff.x + side * (cliff.halfWidth + 1.5), cliff.y + 1.6, cliff.z - cliff.halfLength * .8],
        .12, 3.2, 'steelDark', false, {group:GROUP.cliff});
    });
    box('Cliff Warning Sign', [cliff.x, cliff.y + 2.2, cliff.z - cliff.halfLength - 2], [3.2, 1.4, .14], 'signYellow', false, {group:GROUP.cliff});
    // Exposed rock in the face: the reason the band is called a band.
    for(let i = 0; i < 7; i++){
      box('Cliff Face Rock ' + (i + 1), [cliff.x - 12 + i * 4.1, cliff.y - 4 - (i % 3), cliff.z + cliff.halfLength * .55],
        [2.4 + (i % 3) * .8, 3.2, 1.6], i % 2 ? 'rock' : 'rockDark', true,
        {group:GROUP.cliff, rotation:[.24, i * .4, .12], seed:i});
    }

    // --- base area ----------------------------------------------------------
    const gBase = GROUP.base;
    box('Finish Arch Beam', [finish.x, finish.y + 5.2, finish.z], [22, .5, .6], 'steelDark', false, {group:gBase});
    [-10.5, 10.5].forEach((offset, index) => {
      cylinder('Finish Arch Post ' + (index + 1), [finish.x + offset, finish.y + 2.6, finish.z], .28, 5.2, 'steelDark', true, {group:gBase});
    });
    box('Finish Arch Banner', [finish.x, finish.y + 5.2, finish.z], [21, 1.4, .16], 'gateGold', false, {group:gBase});
    glow('Finish Line Beam', [finish.x, finish.y + 4.3, finish.z], [20.4, .12, .1], COLOR.gateGold, {group:gBase});

    // Lodge and timing hut, so the base is a place rather than a line.
    box('Base Lodge Body', [finish.x - 20, finish.y + 2.2, finish.z + 6], [11, 4.4, 8], 'cabin', true, {group:gBase, seed:1});
    box('Base Lodge Roof', [finish.x - 20, finish.y + 4.7, finish.z + 6], [12.4, .6, 9.4], 'cabinRoof', true, {group:gBase});
    box('Base Lodge Snow Load', [finish.x - 20, finish.y + 5.2, finish.z + 6], [12.6, .5, 9.6], 'snowPowder', false, {group:gBase});
    [-3.4, 0, 3.4].forEach((offset, index) => {
      box('Base Lodge Window ' + (index + 1), [finish.x - 20 + offset, finish.y + 2.6, finish.z + 2.05], [2.2, 1.5, .12], 'glass', false, {group:gBase});
    });
    box('Timing Hut', [finish.x + 14, finish.y + 1.4, finish.z - 2], [4, 2.8, 3.2], 'cabin', true, {group:gBase, seed:2});
    box('Timing Hut Roof', [finish.x + 14, finish.y + 2.9, finish.z - 2], [4.8, .4, 4], 'cabinRoof', false, {group:gBase});
    glow('Timing Hut Lamp', [finish.x + 14, finish.y + 3.2, finish.z - 2], [.5, .3, .5], COLOR.lampGlow, {group:gBase});

    // Lift line up the side of the run: four towers and the cable between them.
    const lift = [station('Lower Traverse'), station('Timber Gully'), station('Cliff Landing'), station('Larch Bend')];
    lift.forEach((sector, index) => {
      const x = sector.x + sector.halfWidth + 16;
      cylinder('Lift Tower ' + (index + 1), [x, sector.y + 8, sector.z], .5, 16, 'steel', true, {group:gBase, castShadow:false});
      box('Lift Tower Head ' + (index + 1), [x, sector.y + 16.2, sector.z], [3.2, .4, .5], 'steelDark', false, {group:gBase, castShadow:false});
      if(index > 0){
        const prev = lift[index - 1];
        const px = prev.x + prev.halfWidth + 16;
        const dz = sector.z - prev.z, dy = sector.y - prev.y;
        box('Lift Cable ' + index, [(x + px) / 2, (sector.y + prev.y) / 2 + 16.2, (sector.z + prev.z) / 2],
          [.12, .12, Math.hypot(dz, dy)], 'steelDark', false,
          {group:gBase, rotation:[Math.atan2(dy, dz), 0, 0], castShadow:false});
      }
    });
  }

  // ================================================================ 07 forest
  //
  // DATA ONLY. A stand is a rectangle with a species, a density and a seed;
  // js/runtime/snow-forest.js reads these entries and grows the actual trees as
  // instanced, level-of-detail geometry. The marker box is what the author
  // selects, moves and rescales to redraw the treeline, and it is invisible on
  // purpose - a stand is a region, not an object.

  const STANDS = [
    // name                 species    x     sector                width depth density
    ['Upper Larch West',   'larch',  -46, 'Upper Traverse',           34,  50,  .35],
    ['Upper Larch East',   'larch',   44, 'Cirque Rollers',           30,  46,  .30],
    ['Cirque Spruce',      'spruce', -52, 'Ridge Bowl',               36,  48,  .55],
    ['Larch Bend Belt',    'larch',   46, 'Larch Bend',               32,  54,  .50],
    ['Pipe Shoulder West', 'spruce', -40, 'Half-pipe',                30,  60,  .70],
    ['Pipe Shoulder East', 'spruce',  40, 'Half-pipe',                30,  60,  .70],
    ['Cliff Skirt',        'fir',    -48, 'Cliff Landing',            34,  50,  .60],
    ['Timber Gully West',  'fir',    -44, 'Timber Gully',             30,  52,  .85],
    ['Timber Gully East',  'fir',     42, 'Timber Gully',             30,  52,  .80],
    ['Rail Garden Belt',   'spruce',  52, 'Rail Garden',              34,  54,  .60],
    ['Base Shelter Belt',  'fir',    -52, 'Boneyard Rollers',         36,  56,  .65],
    ['Base Woods East',    'spruce',  54, 'Base Kicker',              34,  50,  .55],
  ];

  function buildForest(){
    STANDS.forEach((row, index) => {
      const name = row[0], species = row[1], x = row[2], sector = station(row[3]);
      const width = row[4], depth = row[5], density = row[6];
      box('Stand ' + String(index + 1).padStart(2, '0') + ' ' + name, [x, sector.y + 1, sector.z], [width, 2, depth],
        'conifer', false, {
          group:GROUP.forest,
          visible:false,
          castShadow:false,
          props:{
            // The stand contract read by snow-forest.js. Density is trees per
            // 100 square metres; the module clamps it to its own budget.
            snowStand:{species, density, seed:index + 1, snowLoad:.7, slopeLimit:.9},
          },
        });
    });
    // Hand-placed hero trees INSIDE the corridor: the obstacle the rider has to
    // actually avoid, as ordinary collidable objects rather than instanced
    // scenery, so they can be moved one at a time.
    [
      ['Gully Sentinel',    -9, 'Timber Gully', 7.5],
      ['Bend Sentinel',     14, 'Larch Bend',   8.5],
      ['Bowl Sentinel',    -13, 'Ridge Bowl',   6.5],
      ['Rail Garden Pine',  16, 'Rail Garden',  7],
    ].forEach((row, index) => {
      const name = row[0], x = row[1], sector = station(row[2]), height = row[3];
      const tag = 'Hero Tree ' + (index + 1) + ' ' + name;
      cylinder(tag + ' Trunk', [x, sector.y + height * .3, sector.z], .34, height * .6, 'bark', true, {group:GROUP.forest, seed:index});
      add(tag + ' Crown', 'cone', [x, sector.y + height * .62, sector.z], [height * .3, height * .45, height * .3],
        'coniferDark', false, {group:GROUP.forest});
      add(tag + ' Cap', 'cone', [x, sector.y + height * .95, sector.z], [height * .17, height * .26, height * .17],
        'snowPowder', false, {group:GROUP.forest});
    });
  }

  // ============================================================== 08 features
  //
  // The things the trick system scores against. Each carries the contract the
  // runtime reads - `props.snowRail` for a grind, `props.snowKicker` for a
  // takeoff - so a duplicated rail is a working rail with no further step.

  function buildFeatures(){
    // --- kickers ------------------------------------------------------------
    // Exactly three `ramp` primitives on the mountain, one per built takeoff:
    // the lip a rider pops off. The landing is the mountain's own pitch, which
    // is why none of them needs a matching landing object.
    const KICKERS = [
      ['Kicker Knoll Lip', 'Kicker Knoll',    0,  8, 1.9, 'medium'],
      ['Half-pipe Hip',    'Half-pipe Exit',  6,  6, 1.4, 'small'],
      ['Base Booter',      'Base Kicker',    -1, 10, 2.3, 'large'],
    ];
    KICKERS.forEach((row, index) => {
      const name = row[0], sector = station(row[1]), offsetX = row[2], width = row[3], height = row[4], size = row[5];
      add('Kicker ' + (index + 1) + ' ' + name, 'ramp', [sector.x + offsetX, sector.y + .1, sector.z - sector.halfLength * .2],
        [width / 2, height, 5], 'snowPacked', true, {
          group:GROUP.kickers,
          driveSurface:true,
          seed:index,
          props:{snowKicker:{size, popBonus:index === 2 ? 1.35 : 1, label:name}},
        });
    });

    // --- rail garden --------------------------------------------------------
    // Five features, ordered the way a rider hits them: low and flat first,
    // kinked and high last. The `snowRail` block is the whole gameplay
    // contract - the trick system needs the ride LINE, not the geometry.
    const rails = station('Rail Garden');
    const RAILS = [
      // name             kind         x  length height rotY score
      ['Flat Box',       'box',      -9,     10,   .55,    0, 120],
      ['Down Rail',      'rail',     -2,     12,   .95,    0, 180],
      ['Kinked Rail',    'kinked',    5,     14,   1.2,  .12, 260],
      ['Rainbow Rail',   'rainbow',  12,     11,   1.4,    0, 240],
      ['Wall Ride',      'wall',     19,      9,   2.4,  .35, 300],
    ];
    RAILS.forEach((row, index) => {
      const name = row[0], kind = row[1], x = row[2], length = row[3];
      const height = row[4], rotY = row[5], score = row[6];
      const z = rails.z - rails.halfLength * .55 + index * 4.2;
      const y = rails.y + height;
      const isWall = kind === 'wall';
      const surface = isWall ? 'snowPacked' : (kind === 'box' ? 'steel' : 'railChrome');
      box('Rail ' + (index + 1) + ' ' + name, [rails.x + x, y, z],
        isWall ? [.5, height * 2, length] : [kind === 'box' ? 1.1 : .16, .16, length], surface, true, {
          group:GROUP.rails,
          rotation:[0, rotY, 0],
          seed:index,
          props:{
            snowRail:{
              kind, score, length,
              // The world-space line the grind detector snaps to. Authored here
              // rather than derived from the transform, so a rail that is later
              // rotated by hand still declares where its ride line runs.
              from:[rails.x + x - Math.sin(rotY) * length / 2, y + .1, z - Math.cos(rotY) * length / 2],
              to:[rails.x + x + Math.sin(rotY) * length / 2, y + .1, z + Math.cos(rotY) * length / 2],
              catchRadius:kind === 'box' ? 1.3 : .8,
            },
          },
        });
      if(!isWall){
        [-1, 1].forEach((side, leg) => {
          cylinder('Rail ' + (index + 1) + ' Leg ' + (leg + 1), [rails.x + x, rails.y + height / 2, z + side * length * .38],
            .07, height, 'steelDark', false, {group:GROUP.rails});
        });
        box('Rail ' + (index + 1) + ' Ramp', [rails.x + x, rails.y + height * .35, z - length * .62],
          [2.4, height * .7, 3], 'snowPacked', true, {group:GROUP.rails, driveSurface:true, rotation:[-.3, rotY, 0]});
      }
    });

    // --- half-pipe deck -----------------------------------------------------
    // The pipe WALLS are the terrain's job (the `halfpipe` sector profile); what
    // geometry still owes the eye is the coping and the deck a rider lands back
    // onto, which is what makes the lip readable at speed.
    const pipe = station('Half-pipe');
    [-1, 1].forEach((side, index) => {
      const x = pipe.x + side * pipe.halfWidth;
      box('Pipe Deck ' + (index + 1), [x + side * 3.2, pipe.y + 4.7, pipe.z], [6.6, .5, pipe.halfLength * 2], 'snowPacked', true,
        {group:GROUP.pipe, driveSurface:true, seed:index});
      box('Pipe Coping ' + (index + 1), [x, pipe.y + 4.8, pipe.z], [.4, .4, pipe.halfLength * 2], 'snowGroomed', false, {group:GROUP.pipe});
      for(let i = 0; i < 5; i++){
        const z = pipe.z - pipe.halfLength + (i + .5) * (pipe.halfLength * 2 / 5);
        cylinder('Pipe Flag ' + (index + 1) + '-' + (i + 1), [x + side * 5.6, pipe.y + 6.2, z], .07, 3, 'steelDark', false,
          {group:GROUP.pipe, castShadow:false});
        box('Pipe Flag Cloth ' + (index + 1) + '-' + (i + 1), [x + side * 5.6, pipe.y + 7.3, z], [.06, .8, 1.2],
          index ? 'gateRed' : 'gateBlue', false, {group:GROUP.pipe, castShadow:false});
      }
    });
  }

  // ======================================================== 09 logic elements

  const templates = root.LK_LOGIC_TEMPLATES;

  /** The terrain controller. It has no behaviour of its own: it is the object
   *  that CARRIES the global mountain, track and forest dials as exposed Logic
   *  variables, so all three systems are tuned from one Inspector panel instead
   *  of from three scattered places. */
  function buildTerrainController(){
    const graph = {
      version:1,
      name:'Snow Mountain Controller',
      variables:[],
      nodes:[], edges:[], comments:[],
      logicScene:{root:{id:'root'}, elements:[], components:[]},
      // Read by js/runtime/snow-terrain.js.
      snowTerrain:{
        meshQuality:'high', seed:1337,
        groomedRelief:.09, offPisteRelief:1, reliefScale:11,
        edgeRise:.34, edgeRunout:26, apron:3.2,
        iceSlope:.42, rockSlope:.72, trailWidthScale:1.35,
      },
      // Read by js/runtime/snow-trail.js. The persistent board track.
      snowTrail:{
        enabled:true, quality:'high',
        // 0 keeps the track for the whole run, which is what "the snow must
        // remember the descent" means. Anything above 0 is how many seconds a
        // trench takes to fill back in, the way fresh snow does in a wind.
        refillSeconds:0,
        trenchWidth:.42, trenchDepth:.16, bermHeight:.1,
        carveBoost:1.8, sprayRate:1,
      },
      // Read by js/runtime/snow-forest.js.
      snowForest:{enabled:true, quality:'high', densityScale:1, snowLoad:.7},
    };
    const dial = (name, value, label, category, min, max, step, binding) => {
      graph.variables.push({
        name, type:typeof value === 'boolean' ? 'boolean' : 'number', value,
        exposed:true, binding, label, category, min, max, step,
      });
    };
    // -- mountain shape
    dial('TerrainMeshDetail', 3, 'Terrain Mesh Detail (1 low .. 4 ultra)', 'Snow Mountain', 1, 4, 1, 'snowTerrain.meshDetail');
    dial('OffPisteRelief', 1, 'Off-piste Relief', 'Snow Mountain', 0, 4, .05, 'snowTerrain.offPisteRelief');
    dial('GroomedRelief', .09, 'Groomed Relief', 'Snow Mountain', 0, 1, .01, 'snowTerrain.groomedRelief');
    dial('ReliefScale', 11, 'Relief Scale (m)', 'Snow Mountain', 3, 40, .5, 'snowTerrain.reliefScale');
    dial('PisteEdgeRise', .34, 'Piste Edge Rise', 'Snow Mountain', 0, 1.5, .01, 'snowTerrain.edgeRise');
    dial('MountainSeed', 1337, 'Mountain Seed', 'Snow Mountain', 0, 65535, 1, 'snowTerrain.seed');
    // -- the board track
    dial('SnowTrailEnabled', true, 'Snow Track Enabled', 'Snow Track', 0, 1, 1, 'snowTrail.enabled');
    dial('SnowTrailDetail', 3, 'Snow Track Detail (1 low .. 4 ultra)', 'Snow Track', 1, 4, 1, 'snowTrail.detail');
    dial('SnowTrailRefill', 0, 'Snow Track Refill (s, 0 = permanent)', 'Snow Track', 0, 300, 1, 'snowTrail.refillSeconds');
    dial('SnowTrenchWidth', .42, 'Trench Width (m)', 'Snow Track', .1, 2, .01, 'snowTrail.trenchWidth');
    dial('SnowTrenchDepth', .16, 'Trench Depth (m)', 'Snow Track', 0, .8, .01, 'snowTrail.trenchDepth');
    dial('SnowBermHeight', .1, 'Berm Height (m)', 'Snow Track', 0, .6, .01, 'snowTrail.bermHeight');
    dial('SnowCarveBoost', 1.8, 'Carve Trench Boost', 'Snow Track', 1, 4, .05, 'snowTrail.carveBoost');
    dial('SnowSprayRate', 1, 'Spray Rate', 'Snow Track', 0, 3, .05, 'snowTrail.sprayRate');
    // -- the forest
    dial('ForestEnabled', true, 'Forest Enabled', 'Snow Forest', 0, 1, 1, 'snowForest.enabled');
    dial('ForestDetail', 3, 'Forest Detail (1 low .. 4 ultra)', 'Snow Forest', 1, 4, 1, 'snowForest.detail');
    dial('ForestDensity', 1, 'Forest Density', 'Snow Forest', 0, 3, .05, 'snowForest.densityScale');
    dial('ForestSnowLoad', .7, 'Branch Snow Load', 'Snow Forest', 0, 1, .05, 'snowForest.snowLoad');

    scene.added.push({
      id:'snowboard_terrain', kind:'logicElement', name:'Snow Mountain Controller',
      collide:false, graph, enabled:true, runInEditorPreview:true,
      asset:{key:'logic:snow-mountain-controller', name:'Snow Mountain Controller', source:SOURCE},
      t:{p:[summit.x - 6, summit.y + 2, summit.z - 10], r:[0, 0, 0], s:[1, 1, 1], v:true},
      templateGroup:GROUP.gameplay,
    });
  }

  /** The rider. An ordinary Character Pawn Logic Element with a snowboard
   *  physics block; everything a rider can feel is an exposed variable. */
  function buildRider(){
    const playerTemplate = templates && templates.get && templates.get('logic-template-player-character-normal');
    if(!(playerTemplate && playerTemplate.graph)) return;
    const graph = clone(playerTemplate.graph);
    const spawn = {x:summit.x, y:summit.y + 1.4, z:summit.z - 2, heading:0};
    graph.name = 'Snowboard Rider';
    graph.characterPawn.id = 'snowboard-rider';
    graph.characterPawn.spawn = spawn;
    graph.characterPawn.movement = Object.assign({}, graph.characterPawn.movement, {
      walkSpeed:8.5, runSpeed:15, sprintMultiplier:1, acceleration:7, turnRate:7,
      jumpHeight:1.9, inputMode:'heading', facingMode:'heading',
    });
    graph.characterPawn.snowboardPhysics = {
      enabled:true, downhillAcceleration:8.6, maxSpeed:24, carveRate:1.75, maxCarveAngle:.78,
      brakeStrength:13, drag:.3, airDrag:.15, trickSpinRate:460, landingBaseScore:80,
    };
    graph.characterPawn.camera = Object.assign({}, graph.characterPawn.camera, {distance:8.4, height:3.3, fov:74});
    graph.logicScene.elements.push({
      id:'snowboard_visual', name:'Editable Snowboard', type:'mesh', primitive:'box', parentId:'root',
      linked:true, position:[0, .08, 0], rotation:[0, 0, 0], scale:[.34, .045, 1.28],
      color:'#ef4444', runtimeVisual:true,
    });
    setVar(graph, 'ControllerPlayerId', 1);
    setVar(graph, 'SpawnX', spawn.x); setVar(graph, 'SpawnY', spawn.y); setVar(graph, 'SpawnZ', spawn.z);
    setVar(graph, 'SpawnHeading', spawn.heading);
    setVar(graph, 'WalkSpeed', 8.5); setVar(graph, 'RunSpeed', 15); setVar(graph, 'SprintMultiplier', 1);
    setVar(graph, 'CameraDistance', 8.4); setVar(graph, 'CameraHeight', 3.3); setVar(graph, 'CameraFov', 74);
    [
      ['DownhillAcceleration', 8.6, 'Downhill Acceleration', 0, 30, .1],
      ['MaxRideSpeed', 24, 'Maximum Ride Speed', 2, 45, .5],
      ['CarveRate', 1.75, 'Carve Rate', .1, 8, .05],
      ['MaxCarveAngle', .78, 'Maximum Carve Angle', .1, 1.3, .01],
      ['BrakeStrength', 13, 'Brake Strength', 0, 40, .5],
      ['RideDrag', .3, 'Ride Drag', 0, 3, .01],
      ['AirDrag', .15, 'Air Drag', 0, 3, .05],
      ['TrickSpinRate', 460, 'Trick Spin Rate (deg/s)', 30, 1080, 10],
      ['LandingBaseScore', 80, 'Landing Base Score', 0, 5000, 10],
    ].forEach(item => graph.variables.push({
      name:item[0], type:'number', value:item[1], exposed:true,
      binding:'snowboardPhysics.' + RIDE_VARIABLES[item[0]],
      label:item[2], category:'Snowboard Physics', min:item[3], max:item[4], step:item[5],
    }));
    scene.added.push({
      id:'snowboard_player', kind:'logicElement', name:'Snowboard Rider',
      collide:false, graph, enabled:true, runInEditorPreview:true,
      asset:{key:'logic:template:logic-template-player-character-normal', name:'Snowboard Rider', source:SOURCE},
      t:{p:[spawn.x, spawn.y, spawn.z], r:[0, 0, 0], s:[1, 1, 1], v:true},
      templateGroup:GROUP.gameplay,
    });
  }

  /** The gates. Five `reach` objectives down the mountain, placed ON sectors
   *  rather than at hand-written coordinates. */
  const GATES = [
    {id:'gate_1', title:'Gate 1 - Upper Traverse', sector:'Upper Traverse', offset:-4, color:'gateBlue'},
    {id:'gate_2', title:'Gate 2 - Larch Bend',     sector:'Larch Bend',     offset:5,  color:'gateBlue'},
    {id:'gate_3', title:'Gate 3 - Half-pipe',      sector:'Half-pipe',      offset:0,  color:'gateBlue'},
    {id:'gate_4', title:'Gate 4 - Cliff Landing',  sector:'Cliff Landing',  offset:-3, color:'gateRed'},
    {id:'finish', title:'Cross the finish arch',   sector:'Finish Apron',   offset:0,  color:'gateGold'},
  ];

  function buildGates(){
    GATES.forEach((gate, index) => {
      const sector = station(gate.sector);
      const x = sector.x + gate.offset, y = sector.y, z = sector.z;
      const last = index === GATES.length - 1;
      if(!last){
        const group = z < station('Cliff Band').z ? GROUP.upper : GROUP.base;
        [-3.4, 3.4].forEach((side, poleIndex) => {
          cylinder(gate.title + ' Pole ' + (poleIndex + 1), [x + side, y + 2.1, z], .12, 4.2, gate.color, false, {group});
        });
        box(gate.title + ' Banner', [x, y + 4, z], [7.2, .5, .18], gate.color, false, {group});
      }
      gate.position = {x, y, z};
    });
  }

  function buildMission(){
    const missionFactory = root.LK_LOGIC_TEMPLATES_MISSION;
    if(!(missionFactory && missionFactory.makeMissionGraph)) return;
    const objectives = GATES.map((gate, index) => ({
      id:gate.id, title:gate.title, kind:'reach', order:index,
      points:index === GATES.length - 1 ? 600 : 150,
      target:{radius:index === GATES.length - 1 ? 6.5 : 5.2, position:gate.position},
    }));
    objectives.push({
      id:'trick_score', title:'Bonus - Land tricks for 1200 points', kind:'score',
      count:1200, order:20, points:600, optional:true, target:{tag:'snow-trick'},
    });
    const graph = missionFactory.makeMissionGraph({
      missionId:'snowboard-run', title:'Col des Larches',
      subtitle:'Thread every gate, ride the pipe and beat the mountain clock',
      mode:'sequence', timeLimit:150, failOnTimeout:true, objectives,
    });
    scene.added.push({
      id:'snowboard_mission', kind:'logicElement', name:'Snowboarding Mission Director',
      collide:false, graph, enabled:true, runInEditorPreview:true,
      asset:{key:'logic:template:logic-template-mission-director', name:'Snowboarding Mission Director', source:SOURCE},
      t:{p:[summit.x + 6, summit.y + 1, summit.z - 10], r:[0, 0, 0], s:[1, 1, 1], v:true},
      templateGroup:GROUP.gameplay,
    });
  }

  // ----------------------------------------------------------- build order
  // Furniture, forest and features all place themselves against the sector
  // stations built above, so the mountain has to exist first.

  buildFurniture();
  buildForest();
  buildFeatures();
  buildGates();
  buildTerrainController();
  buildRider();
  buildMission();

  // ============================================================ 10 world data

  // The analytic terrain answers `characterGroundHeight` as soon as
  // snow-terrain.js is loaded; this profile is the fallback for the case where
  // it is not, and it is where the lateral bounds live in both cases.
  scene.characterGround = {
    type:'slope-z',
    slopeStart:finish.z,
    crestZ:summit.z,
    slope:(summit.y - finish.y) / Math.max(1, finish.z - summit.z),
    baseY:finish.y,
    minX:-RIDE_HALF_X, maxX:RIDE_HALF_X,
    minZ:SUMMIT_Z - 6, maxZ:BASE_Z + 12,
  };
  scene.player = Object.assign({}, scene.player || {}, {
    // The level is owned by the Character Logic Pawn: the native singleton must
    // not keep physics, engine audio or exhaust alive at its old spawn.
    enabled:false, hidden:true, controllerIndex:null,
    cam:Object.assign({}, (scene.player || {}).cam || {}, {
      fogDensity:.009,
      // Snow blows out the top of the histogram and eats the shadow end. The
      // grade pulls exposure back and lifts contrast so the relief the terrain
      // and the board track carve is actually visible instead of one white
      // sheet.
      grade:{enabled:true, exposure:.95, brightness:-.02, contrast:1.16, saturation:.94, gamma:1},
    }),
  });
  scene.env = Object.assign({}, scene.env || {}, {
    // Mid-morning, sun low and to the east: it rakes ACROSS the slope, which is
    // the only lighting in which snow relief reads at all.
    skyTime:.16, dayLength:999999, dayNightCycleEnabled:false,
    procEnvEnabled:true, procEnvIntensity:1.15, procEnvWarmth:.42, procEnvContrast:.8,
    backgroundColor:'#b9dcf2',
    lighting:{daySun:1.6, dayAmbient:1.15, moonDirect:.16, moonIndirect:.2},
    sunBloom:{enabled:true, intensity:.75, size:1, radius:.18, threshold:.62},
    rain:{enabled:false, intensity:0, sound:0},
    volClouds:{enabled:true, coverage:.62, density:1.1, scale:1.5, detail:.55, speed:1.3,
      windAngle:18, altitude:150, thickness:120, quality:14, absorption:1.25, opacity:.88,
      anvil:.4, resolutionScale:.62},
    weather:{type:'snow', intensity:.5, wind:[.8, 0, .25], surface:'snow'},
  });
  scene.template = {
    id:ID,
    name:'Snowboarding Objective Run',
    version:3,
    nativeEditable:true,
    setting:'Col des Larches - Summit to Base',
    gameMode:'snowboarding',
    objectiveSystem:true,
    snowboardPhysics:true,
    snowTerrain:true,
    snowTrail:true,
    zones:Object.keys(GROUP).map(key => GROUP[key]),
    runLength:Math.round(BASE_Z - SUMMIT_Z),
    verticalDrop:Math.round(summit.y - finish.y),
    sectors:sectorStations.length,
    controls:{
      carve:'A/D or left stick',
      tuck:'W', brake:'S', jump:'Space',
      tricks:'Carve while airborne',
    },
    notes:'A 420 m alpine descent authored as nineteen piste sector slabs: each one is an ordinary editable primitive whose transform is a control point of the run, and js/runtime/snow-terrain.js interpolates them into a continuous banked heightfield and bakes it into those same slabs. The board leaves a persistent trench and berm in the snow for the whole descent (js/runtime/snow-trail.js). Forest stands are data rectangles grown into instanced level-of-detail conifers by js/runtime/snow-forest.js. Half-pipe, cliff band, rail garden and three kickers; gates, ropes, lift line and base lodge are ordinary dressing.',
  };
  return scene;
}

// ===================================================== runtime: ride physics
//
// Unchanged in contract from the version this file replaces: the snowboard
// system drives an ordinary Character Pawn downhill and hands landings to the
// shared Mission Director.

function rideOverrides(pawn){
  const variables = pawn && pawn.owner && pawn.owner.userData && pawn.owner.userData.logicGraph
    && pawn.owner.userData.logicGraph.variables || [];
  const out = {};
  variables.forEach(variable => {
    const key = variable && RIDE_VARIABLES[variable.name];
    if(key) out[key] = variable.value;
  });
  return out;
}
function normalizeRide(pawn){
  const source = Object.assign({}, pawn && pawn.config && pawn.config.snowboardPhysics || {}, rideOverrides(pawn));
  return {
    enabled:source.enabled !== false,
    downhillAcceleration:clamp(source.downhillAcceleration, 0, 30),
    maxSpeed:clamp(source.maxSpeed, 2, 45),
    carveRate:clamp(source.carveRate, .1, 8),
    maxCarveAngle:clamp(source.maxCarveAngle, .1, 1.3),
    brakeStrength:clamp(source.brakeStrength, 0, 40),
    drag:clamp(source.drag, 0, 3),
    airDrag:clamp(source.airDrag, 0, 3),
    trickSpinRate:clamp(source.trickSpinRate, 30, 1080),
    landingBaseScore:clamp(source.landingBaseScore, 0, 5000),
  };
}
function emitRide(type, detail){
  if(root.dispatchEvent && root.CustomEvent){
    root.dispatchEvent(new root.CustomEvent('lk-snowboard-event', {detail:Object.assign({type}, detail || {})}));
  }
}

function createSnowboardSystem(GAME){
  const records = new Map();
  function record(pawn){
    let state = records.get(pawn.id);
    if(!state){ state = {speed:4, heading:0, airborne:false, airTime:0, trickDegrees:0}; records.set(pawn.id, state); }
    return state;
  }
  function rewardLanding(pawn, state){
    const ride = normalizeRide(pawn);
    const points = Math.round(ride.landingBaseScore + state.airTime * 55 + state.trickDegrees * .72);
    if(points <= 0) return 0;
    const director = GAME && GAME.systems && GAME.systems.objectives;
    if(director && director.addScore) director.addScore(points);
    emitRide('OnSnowboardLanded', {pawn, pawnId:pawn.id, points, airTime:state.airTime, trickDegrees:state.trickDegrees});
    return points;
  }
  function stepRider(pawn, dt){
    const ride = normalizeRide(pawn), state = record(pawn);
    if(!ride.enabled || !pawn.setMoveInput) return;
    const live = pawn.readPlayerDrive ? pawn.readPlayerDrive() : {};
    const inputX = clamp(live.x, -1, 1), inputZ = clamp(live.z, -1, 1);
    const airborne = !!(pawn.state && pawn.state.airborne);
    if(airborne){
      state.airTime += dt;
      state.trickDegrees += Math.abs(inputX) * ride.trickSpinRate * dt;
      state.speed = Math.max(2, state.speed - ride.airDrag * dt);
    } else {
      if(state.airborne) rewardLanding(pawn, state);
      state.airTime = 0; state.trickDegrees = 0;
      const brake = Math.max(0, -inputZ), tuck = Math.max(0, inputZ);
      state.speed += ((ride.downhillAcceleration * (1 + tuck * .28) * Math.max(.25, Math.cos(state.heading)))
        - ride.drag * state.speed - ride.brakeStrength * brake) * dt;
      state.speed = clamp(state.speed, brake > .1 ? 1.2 : 3.2, ride.maxSpeed);
    }
    state.airborne = airborne;
    state.heading = clamp(state.heading + inputX * ride.carveRate * dt, -ride.maxCarveAngle, ride.maxCarveAngle);
    if(Math.abs(inputX) < .08) state.heading *= Math.max(0, 1 - dt * 1.25);
    if(pawn.owner && pawn.owner.rotation) pawn.owner.rotation.y = state.heading;
    if(pawn.setMovement && (state.configuredSpeed == null || Math.abs(state.configuredSpeed - state.speed) > .04)){
      pawn.setMovement({walkSpeed:state.speed, runSpeed:state.speed, sprintMultiplier:1, inputMode:'heading', facingMode:'heading'});
      state.configuredSpeed = state.speed;
    }
    pawn.setMoveInput({x:0, z:1, sprint:false, jump:live.jump === true});
    if(pawn.state){
      pawn.state.snowboardSpeed = state.speed;
      pawn.state.snowboardCarve = state.heading;
      pawn.state.snowboardAirTime = state.airTime;
      pawn.state.snowboardTrickDegrees = state.trickDegrees;
    }
  }
  function update(dt){
    if(!(GAME && GAME.state && GAME.state.started && GAME.pawns && GAME.pawns.list)){ records.clear(); return; }
    const live = new Set();
    GAME.pawns.list().forEach(pawn => {
      if(!(pawn && pawn.config && pawn.config.snowboardPhysics)) return;
      live.add(pawn.id);
      stepRider(pawn, clamp(dt, .001, .1));
    });
    records.forEach((value, key) => { if(!live.has(key)) records.delete(key); });
  }
  return Object.freeze({update, stepRider, rewardLanding, records, normalizeRide});
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.snowboarding) return GAME.systems.snowboarding;
  const system = createSnowboardSystem(GAME);
  GAME.systems.snowboarding = system;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkSnowboardFrame){
    GAME.hooks.__lkSnowboardFrame = true;
    GAME.hooks.frame.push(dt => system.update(dt));
  }
  return system;
}

root.LK_RUNTIME_SNOWBOARDING_LEVEL_TEMPLATE = Object.freeze({
  id:ID, name:'Snowboarding Objective Run',
  GROUPS:GROUP, MATERIALS:MAT,
  buildScene, normalizeRide, createSnowboardSystem, install,
});
if(root.LK_LEVEL_TEMPLATES && root.LK_LEVEL_TEMPLATES.register){
  root.LK_LEVEL_TEMPLATES.register({
    id:ID, name:'Snowboarding Objective Run', nameIt:'Snowboard - Discesa a obiettivi',
    category:'Sports', order:420, ground:'none', keepBuiltinPlayer:false,
    description:'A 420 m alpine descent with a curved banked heightfield, half-pipe, cliff band, rail garden and a board track that stays carved into the snow.',
    descriptionIt:'Discesa alpina di 420 m con terreno curvo e inclinato, half-pipe, salto di roccia, rail garden e una traccia dello snowboard che resta incisa nella neve.',
    build:buildScene,
  });
}
if(root.LOT_KING) install(root.LOT_KING);
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_SNOWBOARDING_LEVEL_TEMPLATE;
})();
