/* =========================================================
   LOT KING - FPS Shooter Test level template
   "Blackpine Urban Training Facility"

   A dressed, fully editable training facility used to exercise the
   first-person Pawn end to end: movement, cover, verticality, interiors,
   sightlines and ranged targets.

   Everything here is ordinary editor geometry and Logic Element instances, so
   the level can be opened, re-arranged and saved like any authored scene.
   Behaviour lives in the templates (First Person player, Shooting Target);
   only the environment lives here.

   Layout, south (spawn) to north (long range):

     ZONE 1  Staging bay      covered armoury: lockers, racks, crates, lamps
     ZONE 2  Firing line      sandbag emplacements and lane markings
     ZONE 3  CQB village      containers, a two-room block house, wrecked car
     ZONE 4  Long range       berms, target frames, watchtower
     ZONE 5  Perimeter        fence, floodlight masts, signage, boundary wall

   Every entry carries a `templateGroup` so the outliner reads as those zones
   instead of one flat list, numbered in the order they appear on the ground.

   HOW THIS FILE IS ORGANISED
     00  identity and extents
     01  zones            outliner folders, numbered south to north
     02  palette          raw colours, named by what they are made of
     03  material classes every surface names a class, never a loose hex
     04  helpers          primitive constructors, decals, lights
     05  zone builders    one function per outliner folder, in zone order
     06  logic elements   the player Pawn and the shooting targets
     07  world data       bounds, environment, camera grade, manifest
   ========================================================= */
(function(){
'use strict';

// ================================================================ 00 identity

const SOURCE = 'FPS Shooter Test (native template)';
const GROUND_Y = 0;
const ARENA_HALF_X = 26;      // playable half-width
const ARENA_MIN_Z = -74;      // far end of the long range
const ARENA_MAX_Z = 16;       // behind the staging bay

// =================================================================== 01 zones
// Declared in walking order and numbered to match: the outliner sorts these
// labels as text, so the numbers are what keep the folders in ground order.

const GROUP = {
  terrain:    '01 Terrain and Markings',
  staging:    '02 Staging Bay',
  firing:     '03 Firing Line',
  village:    '04 CQB Village',
  range:      '05 Long Range',
  perimeter:  '06 Perimeter and Lighting',
  targets:    '07 Targets',
  yard:       '08 Practice Yard',
  traversal:  '09 Traversal Course',
  pickups:    '10 Pickups and Interactables',
  characters: '11 Characters',
  skyline:    '12 Outside the Wire',
};

// ================================================================= 02 palette
// Weathered concrete, rust and faded paint under a low afternoon sun: dark
// enough that the emissive lamp and sign accents actually register, and spread
// far enough in value that the eye can separate ground from cover from wall.

const COLOR = {
  // ground. These read darker than they look here: the procedural grain
  // multiplies them, so a value picked "correct" on a swatch lands almost
  // black on the ground plane once it is also in shadow.
  dirt:0x6a6050,
  dirtDark:0x554d40,
  dirtPale:0x7b7160,
  gravel:0x6a6660,
  concrete:0x565c64,
  concreteDark:0x474d55,
  concreteLight:0x646a72,
  asphalt:0x393e45,
  puddle:0x2a323b,
  // paint
  paintWhite:0xc9cfd6,
  paintYellow:0xc3a747,
  paintRed:0xa8433a,
  markerNear:0x5c9b74,
  markerMid:0xc0913b,
  markerFar:0xb85f4a,
  // structure
  wall:0x565a58,
  wallTrim:0x5a605d,
  brick:0x6f6053,
  block:0x6b6d72,
  plaster:0x7b7364,
  // metal
  steel:0x59616a,
  steelDark:0x363d48,
  steelPale:0x79828f,
  rust:0x74452f,
  containerRed:0xa85a4a,
  containerBlue:0x6f9cba,
  containerSand:0xa48f5c,
  // organics and cloth
  wood:0x63523a,
  plywood:0x7d6444,
  crate:0x6a5740,
  sandbag:0x847a56,
  tarp:0x454e3c,
  tyre:0x212428,
  // glass and light
  glassDark:0x1b242f,
  lampGlow:0xffe6b0,
  signRed:0xb44239,
  signYellow:0xd2a93b,
  // beyond the wire
  pine:0x27352b,
  pineDark:0x1d2822,
  distantSteel:0x39424e,
};

// ======================================================== 03 material classes
//
// Every piece of dressing names a class here instead of carrying a loose hex.
// A class is the whole surface identity: colour, PBR response, which
// procedural surface it wears (js/engine/procedural-surfaces.js) and how many
// metres one texture tile covers, plus the footstep material the Character
// Sound Set should play when a body stands on it.
//
// The surface entry is inert when the procedural module is absent - the
// primitive factory ignores props it does not know - so the level still builds
// and still looks like the palette above, just without the grain.

// Each (kind, seed) pair costs a generated texture set, so callers may ask for
// as much variation as reads well and the seed is folded into this many
// variants per kind. Three is enough to break a row of sandbags without paying
// for seventy of them.
const SURFACE_VARIANTS = 3;

function material(color, roughness, metalness, surface, tile, foot, strength){
  return {color, roughness, metalness, surface, tile, foot, strength};
}

const MAT = {
  // -- ground
  dirt:          material(COLOR.dirt,          .99, 0,   'dirt',            5,   'dirt',     .55),
  dirtDark:      material(COLOR.dirtDark,      .99, 0,   'dirt',            4,   'dirt',     .5),
  dirtPale:      material(COLOR.dirtPale,      .98, 0,   'sand',            4,   'sand'),
  gravel:        material(COLOR.gravel,        .97, 0,   'gravel',          2,   'gravel',   .6),
  concreteFloor: material(COLOR.concrete,      .93, .02, 'concrete',        5,   'concrete', .5),
  concreteWorn:  material(COLOR.concreteDark,  .95, .02, 'concrete',        3.5, 'concrete'),
  asphalt:       material(COLOR.asphalt,       .92, .02, 'asphalt',         4,   'concrete', .45),
  puddle:        material(COLOR.puddle,        .10, .30, null,              0,   'water'),
  // -- paint on the ground: lit, not unlit. Painted lines take the sun like
  //    everything else; making them unlit was what left the range looking like
  //    a diagram with glowing stripes.
  paintWhite:    material(COLOR.paintWhite,    .62, 0,   null,              0,   'concrete'),
  paintYellow:   material(COLOR.paintYellow,   .62, 0,   null,              0,   'concrete'),
  paintRed:      material(COLOR.paintRed,      .62, 0,   null,              0,   'concrete'),
  // -- structure
  concreteWall:  material(COLOR.concreteLight, .94, .02, 'concrete',        4,   'concrete'),
  concreteSlab:  material(COLOR.concrete,      .94, .02, 'concrete',        5,   'concrete'),
  brick:         material(COLOR.brick,         .95, 0,   'brick',           2.4, 'concrete'),
  block:         material(COLOR.block,         .94, 0,   'cinderblock',     2.2, 'concrete'),
  plaster:       material(COLOR.plaster,       .92, 0,   'plaster',         3,   'concrete'),
  // -- metal. PAINT IS NOT A METAL: a painted or primed surface is a dielectric
  //    and only bare, galvanised or polished steel earns a high metalness. The
  //    facility is almost entirely painted, so most of these sit near zero and
  //    read as steel through their roughness and relief instead of by turning
  //    into mirrors under the sky environment.
  steel:         material(COLOR.steel,         .55, .12, 'metalPainted',    1.4, 'metal'),
  steelDark:     material(COLOR.steelDark,     .60, .15, 'metalPainted',    1.4, 'metal'),
  steelPale:     material(COLOR.steelPale,     .42, .55, 'metalPainted',    1.2, 'metal'),
  steelRust:     material(COLOR.rust,          .90, .08, 'metalRusted',     1.2, 'metal'),
  tread:         material(COLOR.steel,         .52, .35, 'metalTread',       .5, 'metal'),
  corrugated:    material(COLOR.wall,          .70, .10, 'metalCorrugated', 2.2, 'metal'),
  corrugatedRoof:material(COLOR.wallTrim,      .70, .10, 'metalCorrugated', 3.2, 'metal'),
  containerRed:  material(COLOR.containerRed,  .62, .12, 'metalCorrugated', 2.4, 'metal'),
  containerBlue: material(COLOR.containerBlue, .62, .12, 'metalCorrugated', 2.4, 'metal'),
  containerSand: material(COLOR.containerSand, .64, .12, 'metalCorrugated', 2.4, 'metal'),
  // -- organics and cloth
  wood:          material(COLOR.wood,          .90, 0,   'wood',            1.6, 'wood'),
  plywood:       material(COLOR.plywood,       .88, 0,   'plywood',         1.2, 'wood'),
  crate:         material(COLOR.crate,         .89, 0,   'plywood',         1.0, 'wood'),
  sandbag:       material(COLOR.sandbag,       .96, 0,   'sandbag',          .6, 'sand'),
  tarp:          material(COLOR.tarp,          .86, 0,   'tarp',            2.2, 'carpet'),
  rubber:        material(COLOR.tyre,          .88, 0,   'rubber',           .5, 'carpet'),
  // -- glass and distance
  glass:         material(COLOR.glassDark,     .08, .12, null,              0,   'marble'),
  pine:          material(COLOR.pine,          .96, 0,   null,              0,   'grass'),
  pineDark:      material(COLOR.pineDark,      .96, 0,   null,              0,   'grass'),
  distantSteel:  material(COLOR.distantSteel,  .70, .30, null,              0,   'metal'),
};

function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }

// ================================================================= 04 helpers

// A prop builder bound to one scene. Extracted from `buildScene` so a level that
// EXTENDS this facility - the Enemy Outpost adds two more sectors to it - can
// author in the same material classes, the same surface grain and the same entry
// shape instead of copying the material table and drifting from it.
//
//   prefix   id namespace, so two builders on one scene cannot collide
//   source   what the editor shows as the asset source for these props
function createBuilder(scene, options){
  const opts = options || {};
  const prefix = String(opts.prefix || 'fps_range');
  const source = String(opts.source || SOURCE);
  let seq = 0;
  function nextId(){ return prefix + '_' + String(++seq).padStart(3, '0'); }

  // `spec` is a material class name, or a raw colour for the handful of
  // one-off accents that do not deserve a class of their own. An unknown class
  // name throws rather than falling back: a silent fallback turns a typo into
  // a piece of concrete somewhere in nine hundred objects, and every caller
  // here runs under the node tests, so the throw is caught before it ships.
  function resolveMaterial(spec){
    if(typeof spec === 'number') return {color:spec, roughness:.92, metalness:0};
    if(typeof spec === 'string' && MAT[spec]) return MAT[spec];
    throw new Error('FPS level template: unknown material class "' + spec + '"');
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
    // Procedural surface: the grain, relief and roughness break-up that make a
    // primitive read as a material. Keyed by class so every crate in the level
    // wears the same plywood, and seeded per object where identical neighbours
    // would otherwise tile visibly.
    // Geometry that cannot contribute a visible shadow says so, and stops
    // being redrawn into the shadow map every frame.
    if(opts.castShadow === false) props.castShadow = false;
    if(mat.surface && props.materialModel !== 'unlit' && opts.surfaceTexture !== false){
      props.surfaceTexture = Object.assign({
        kind:mat.surface,
        tile:mat.tile || 2,
      }, mat.strength != null ? {strength:mat.strength} : null, opts.seed != null ? {seed:Math.abs(Math.round(opts.seed)) % SURFACE_VARIANTS} : null, opts.surfaceTexture || null);
    }
    scene.added.push({
      id:nextId(),
      kind:'primitive',
      prim,
      name,
      collide:collide === true,
      // Material underfoot, read by the Character Sound Set for footsteps.
      // Derived from the material class, so a body standing on a container
      // sounds like steel without anyone remembering to say so per object.
      surface:opts.surface || mat.foot || undefined,
      // Gameplay contracts. scene-store.js copies these onto userData, where the
      // interaction and item systems read them, and writes them back on save.
      interact:opts.interact || undefined,
      item:opts.item || undefined,
      props,
      t:{p:position.slice(), r:(opts.rotation || [0, 0, 0]).slice(), s:scale.slice(), v:opts.visible !== false},
      asset:{key:'primitive:' + prim, name, source},
      templateGroup:opts.group || GROUP.terrain,
    });
  }
  // Primitive scales are half-extents. Authoring in metres keeps the numbers
  // readable and matches what the inspector shows as size.
  //
  // Overhead geometry stays collidable: character-movement.js is now height
  // aware, so it lets the character pass under a roof and stand on a deck
  // rather than treating either as a full-height wall.
  function box(name, position, size, spec, collide, options){
    add(name, 'box', position, [size[0] / 2, size[1] / 2, size[2] / 2], spec, collide === true, options);
  }
  function plane(name, position, width, depth, spec, options){
    add(name, 'plane', position, [width / 4, 1, depth / 4], spec, false, options);
  }
  function cylinder(name, position, radius, height, spec, collide, options){
    add(name, 'cylinder', position, [radius, height / 2, radius], spec, collide, options);
  }
  // A torus primitive is TorusGeometry(1.4, .4) scaled uniformly, so the
  // visible OUTER radius is 1.8x the scale and the tube is .4x it. Authoring
  // the outer radius is what keeps a tyre the size of a tyre: passing the tyre
  // radius straight in as scale drew a two-metre donut, which is why the tyre
  // stacks used to read as black scribbles.
  function ring(name, position, outerRadius, spec, options){
    const s = outerRadius / 1.8;
    add(name, 'torus', position, [s, s, s], spec, false, options);
  }
  return {scene, nextId, resolveMaterial, add, box, plane, cylinder, ring, MAT, COLOR, GROUP};
}

function buildScene(baseScene){
  const scene = baseScene || {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}, logic:{}};
  // The blank template ships a small default ground plane; the facility floor
  // below replaces it entirely.
  scene.added = (scene.added || []).filter(entry => !(entry && entry.name === 'Ground' && entry.asset && entry.asset.source === 'Editor primitive'));

  const builder = createBuilder(scene, {prefix:'fps_range', source:SOURCE});
  const nextId = builder.nextId, add = builder.add, box = builder.box;
  const plane = builder.plane, cylinder = builder.cylinder, ring = builder.ring;
  // Emissive-looking surfaces (lamp lenses, lit signs, screens) use the unlit
  // material so they stay bright regardless of the scene lighting.
  function glow(name, position, size, color, options){
    box(name, position, size, color, false, Object.assign({}, options, {
      props:Object.assign({materialModel:'unlit'}, (options || {}).props || {}),
    }));
  }
  // Ground decals: stains, tracks and wear. Every flat thing on the floor
  // takes its height from this ladder rather than from a hand-picked epsilon,
  // which is the only way a level with forty overlapping ground planes does
  // not z-fight somewhere. Later in the list means higher, so it wins.
  const DECAL_LAYER = {wear:.004, apron:.008, lane:.012, divider:.016, stain:.02, marking:.024};
  const weaponPickupPlacements = [];
  function decal(name, x, z, width, depth, spec, layer, options){
    // A decal lies flat on the surface it stains, so its shadow falls on the
    // geometry it is already touching: invisible, but redrawn into the shadow
    // map every frame like any other caster.
    const opts = Object.assign({castShadow:false}, options);
    plane(name, [x, GROUND_Y + (DECAL_LAYER[layer] || DECAL_LAYER.wear), z], width, depth, spec, opts);
  }
  function light(name, position, props, group){
    scene.added.push({
      id:nextId(),
      kind:'light',
      light:'point',
      name,
      // Light colours are numeric: the store applies them with Color.setHex,
      // so a CSS string floors to NaN and every fixture renders black.
      props:Object.assign({color:0xffdcae, intensity:900, intensityUnit:'candela', distance:52}, props || {}),
      t:{p:position.slice(), r:[0, 0, 0], s:[1, 1, 1], v:true},
      templateGroup:group || GROUP.perimeter,
    });
  }

  // ============================================================ 05 zone build

  buildTerrain();
  buildStagingBay();
  buildFiringLine();
  buildVillage();
  buildLongRange();
  buildPerimeter();
  buildPracticeYard();
  buildTraversalCourse();
  buildPickups();
  buildSkyline();

  // ------------------------------------------------------------ 01 terrain

  function buildTerrain(){
    const g = GROUP.terrain;
    // The floor itself casts onto the floor: nothing, at the price of a full
    // shadow-map draw. Same for the course floor below.
    plane('Range Floor', [0, GROUND_Y, -28], 56, 96, 'dirt', {group:g, driveSurface:true, castShadow:false});
    // Concrete apron under the staging bay and firing line; the rest is dirt.
    decal('Concrete Apron', 0, 4, 52, 26, 'concreteFloor', 'apron', {group:g});
    // The apron does not end on a knife edge: a gravel shoulder carries it into
    // the dirt, which is what stops the join reading as a printed rectangle.
    decal('Apron Shoulder North', 0, -9.6, 52, 4.5, 'gravel', 'wear', {group:g});
    [-25.4, 25.4].forEach((x, index) => {
      decal('Apron Shoulder ' + (index ? 'East' : 'West'), x, -20, 4, 74, 'gravel', 'wear', {group:g});
    });

    // Four shooting lanes: visual guides that make distance readable.
    [-15, -5, 5, 15].forEach((x, index) => {
      decal('Lane ' + (index + 1) + ' Strip', x, -30, 7.4, 88, 'asphalt', 'lane', {group:g});
    });
    [-19.6, -9.8, 0, 9.8, 19.6].forEach((x, index) => {
      decal('Lane Divider ' + (index + 1), x, -30, .18, 88, 'paintWhite', 'divider', {group:g});
    });
    decal('Firing Line Marking', 0, 4, 52, .3, 'paintYellow', 'marking', {group:g});

    // Distance bands, one per target ring.
    [
      {z:-12, color:COLOR.markerNear, label:'10 m'},
      {z:-26, color:COLOR.markerMid, label:'25 m'},
      {z:-44, color:COLOR.markerFar, label:'45 m'},
      {z:-62, color:COLOR.markerFar, label:'65 m'},
    ].forEach(marker => {
      decal('Distance Marker ' + marker.label, 0, marker.z, 50, .22, marker.color, 'marking', {group:g, props:{roughness:.6}});
    });

    // Cracked-earth patches and puddles break up the flat dirt plane.
    [[-21, -18, 7, 5], [18, -34, 9, 6], [-9, -52, 11, 7], [13, -60, 8, 5], [-19, -66, 6, 4]].forEach((patch, index) => {
      decal('Ground Patch ' + (index + 1), patch[0], patch[1], patch[2], patch[3], 'dirtDark', 'wear', {group:g, seed:index + 1});
    });
    [[-16, -24, 3.2], [11, -47, 2.6], [-6, -63, 2.2], [21, -12, 2.4]].forEach((puddle, index) => {
      decal('Puddle ' + (index + 1) + ' Rim', puddle[0], puddle[1], puddle[2] * 1.5, puddle[2], 'dirtDark', 'wear', {group:g});
      decal('Puddle ' + (index + 1), puddle[0], puddle[1], puddle[2], puddle[2] * .7, 'puddle', 'stain', {group:g});
    });

    // Wear the facility has earned: vehicle tracks off the gate, oil under the
    // bay, scorch where something burned, drag marks by the containers.
    [
      ['Tyre Track West', -8.6, 6, 1.6, 30, 'dirtDark'],
      ['Tyre Track East', -6.2, 6, 1.6, 30, 'dirtDark'],
      ['Drag Mark Village', -19, -20, 3.4, 9, 'dirtDark'],
      ['Scorch Mark', 7.5, -24, 4.5, 4, 0x22201d],
      ['Oil Stain Bay', -16.4, 11, 2.4, 2, 0x1e2126],
      ['Oil Stain Village', 9.5, -9.4, 2.2, 1.8, 0x1e2126],
      ['Sand Drift North', 0, -71, 46, 5, 'dirtPale'],
    ].forEach((mark, index) => {
      decal(mark[0], mark[1], mark[2], mark[3], mark[4], mark[5], 'stain', {group:g, seed:index + 3});
    });
    // Dirt piles against the boundary wall: nothing meets a wall cleanly.
    [-1, 1].forEach((side, index) => {
      decal('Wall Drift ' + (index ? 'East' : 'West'), side * 24.4, -30, 3.2, 78, 'dirtPale', 'wear', {group:g});
    });
  }

  // -------------------------------------------------------- 02 staging bay

  function buildStagingBay(){
    const g = GROUP.staging;
    const BAY_H = 7;

    box('Staging Bay Roof', [0, GROUND_Y + BAY_H, 8], [52, .4, 16], 'corrugatedRoof', true, {group:g});
    // Purlins under the deck, not ribs on top of it: the corrugation is in the
    // roof surface itself now, so the geometry only has to carry the structure
    // the eye reads from below.
    [-6, 0, 6].forEach((z, index) => {
      box('Bay Purlin ' + (index + 1), [0, GROUND_Y + BAY_H - .34, 8 + z], [52, .28, .3], 'steelDark', false, {group:g});
    });
    [-20, -10, 10, 20].forEach((x, index) => {
      box('Bay Truss ' + (index + 1), [x, GROUND_Y + BAY_H - .34, 8], [.26, .26, 16], 'steelDark', false, {group:g});
    });
    // Pillars stand clear of the centre lane: one used to sit at x=0, dead in
    // the crosshair of a player who has not moved yet.
    [-22, -11, 11, 22].forEach((x, index) => {
      cylinder('Bay Pillar ' + (index + 1), [x, GROUND_Y + BAY_H / 2, 1], .32, BAY_H, 'steelDark', true, {group:g});
      box('Bay Pillar Base ' + (index + 1), [x, GROUND_Y + .12, 1], [.9, .24, .9], 'concreteSlab', false, {group:g});
      box('Bay Pillar Brace ' + (index + 1), [x, GROUND_Y + BAY_H - 1.1, 1 + (x > 0 ? -.9 : .9)], [.16, 1.6, 1.8], 'steelDark', false,
        {group:g, rotation:[x > 0 ? .5 : -.5, 0, 0]});
    });
    // Camo netting slung under the front edge of the roof. It hangs from the
    // roof line rather than across the opening: at eye height it cut the whole
    // frame in half and hid the range from the spawn.
    [-16, 0, 16].forEach((x, index) => {
      box('Bay Netting ' + (index + 1), [x, GROUND_Y + BAY_H - .45, .2], [15, .7, .06], 'tarp', false, {group:g, seed:index + 1});
    });

    // Weapon lockers along the back wall.
    for(let i = 0; i < 6; i++){
      const x = -13 + i * 5.2;
      box('Locker Bank ' + (i + 1), [x, GROUND_Y + 1.1, 14.4], [2.2, 2.2, .7], 'steel', true, {group:g, seed:i + 1});
      box('Locker Bank ' + (i + 1) + ' Split', [x, GROUND_Y + 1.1, 14.03], [.05, 2.2, .04], 'steelDark', false, {group:g});
      box('Locker Bank ' + (i + 1) + ' Handle L', [x - .55, GROUND_Y + 1.1, 14.02], [.08, .3, .06], 'steelDark', false, {group:g});
      box('Locker Bank ' + (i + 1) + ' Handle R', [x + .55, GROUND_Y + 1.1, 14.02], [.08, .3, .06], 'steelDark', false, {group:g});
      box('Locker Bank ' + (i + 1) + ' Vent', [x, GROUND_Y + 2.0, 14.02], [1.6, .18, .04], 'steelDark', false, {group:g});
      box('Locker Bank ' + (i + 1) + ' Plinth', [x, GROUND_Y + .06, 14.4], [2.3, .12, .8], 'concreteWorn', false, {group:g});
      if(i % 2 === 0) box('Locker Bank ' + (i + 1) + ' Kit Bag', [x - .4, GROUND_Y + 2.42, 14.4], [1.3, .44, .6], 'tarp', false, {group:g, seed:i});
    }
    // Conduit run feeding the bay lamps, dropping into a breaker box.
    box('Bay Conduit', [0, GROUND_Y + 3.4, 14.68], [44, .1, .1], 'steelPale', false, {group:g});
    [-13, 0, 13].forEach((x, index) => {
      box('Bay Conduit Drop ' + (index + 1), [x, GROUND_Y + 4.9, 14.68], [.08, 3, .08], 'steelPale', false, {group:g});
    });
    box('Bay Breaker Box', [-19, GROUND_Y + 2.4, 14.5], [.9, 1.2, .35], 'steelDark', false, {group:g});

    // Prep benches with ammo crates and magazines.
    [-16, -6, 6, 16].forEach((x, index) => {
      const bench = 'Prep Bench ' + (index + 1);
      box(bench + ' Top', [x, GROUND_Y + .92, 11.5], [3.6, .12, 1.1], 'wood', true, {group:g, seed:index + 1});
      [[-1.6, -.45], [1.6, -.45], [-1.6, .45], [1.6, .45]].forEach((leg, i) => {
        box(bench + ' Leg ' + (i + 1), [x + leg[0], GROUND_Y + .45, 11.5 + leg[1]], [.1, .9, .1], 'steelDark', false, {group:g});
      });
      box(bench + ' Ammo Crate', [x - 1, GROUND_Y + 1.16, 11.5], [1.1, .36, .7], 'crate', false, {group:g, seed:index + 5});
      box(bench + ' Ammo Crate Lid', [x - 1, GROUND_Y + 1.36, 11.5], [1.16, .06, .76], 'plywood', false, {group:g});
      for(let m = 0; m < 4; m++){
        box(bench + ' Magazine ' + (m + 1), [x + .5 + m * .26, GROUND_Y + 1.06, 11.5], [.09, .16, .34], 'steelDark', false, {group:g});
      }
      box(bench + ' Cleaning Mat', [x + 1.4, GROUND_Y + .99, 11.5], [1.2, .02, .8], 'tarp', false, {group:g});
    });

    // Briefing board with a lit panel.
    box('Briefing Board Frame', [0, GROUND_Y + 2.3, 14.2], [5.2, 2.6, .16], 'steelDark', true, {group:g});
    glow('Briefing Board Panel', [0, GROUND_Y + 2.3, 14.08], [4.8, 2.2, .04], 0xb9c3cd, {group:g});
    [-1.6, 0, 1.6].forEach((x, index) => {
      box('Briefing Note ' + (index + 1), [x, GROUND_Y + 2.5, 14.04], [1.1, 1.4, .02], 0xd8d4c6, false, {group:g});
    });
    box('Briefing Board Hood', [0, GROUND_Y + 3.68, 14.0], [5.4, .12, .5], 'steelDark', false, {group:g, rotation:[.28, 0, 0]});

    // Hanging bay lamps. Every fixture gets a glowing lens, but only the inner
    // pair carries a real light: point lights are per-fragment cost on every
    // material in the level, so the count is kept near the four the soccer
    // stadium establishes as the project norm.
    [-16, -5.3, 5.3, 16].forEach((x, index) => {
      cylinder('Bay Lamp Stem ' + (index + 1), [x, GROUND_Y + BAY_H - .5, 8], .05, 1, 'steelDark', false, {group:g});
      add('Bay Lamp Shade ' + (index + 1), 'cone', [x, GROUND_Y + BAY_H - 1.15, 8], [.62, .34, .62], 'steel', false, {group:g, rotation:[Math.PI, 0, 0]});
      glow('Bay Lamp Lens ' + (index + 1), [x, GROUND_Y + BAY_H - 1.42, 8], [.62, .07, .62], COLOR.lampGlow, {group:g});
      if(index === 1 || index === 2) light('Bay Lamp ' + (index + 1), [x, GROUND_Y + BAY_H - 1.7, 8], {intensity:640, distance:30}, g);
    });

    // Stacked spare crates, pallets and drums in the corners.
    [[-23, 12, 0], [-23, 12, 1], [-21.4, 10.6, 0], [23, 12, 0], [23, 12, 1], [21.4, 10.6, 0]].forEach((slot, index) => {
      box('Staging Crate ' + (index + 1), [slot[0], GROUND_Y + .6 + slot[2] * 1.22, slot[1]], [1.2, 1.2, 1.2], 'crate', true, {group:g, seed:index + 1});
      box('Staging Crate ' + (index + 1) + ' Band', [slot[0], GROUND_Y + .6 + slot[2] * 1.22, slot[1]], [1.26, .1, 1.26], 'steelDark', false, {group:g});
    });
    [[-19.5, 13.4], [19.5, 13.4]].forEach((spot, index) => {
      for(let i = 0; i < 3; i++){
        box('Pallet Stack ' + (index + 1) + ' Board ' + (i + 1), [spot[0], GROUND_Y + .07 + i * .16, spot[1]], [1.2, .1, 1], 'plywood', i === 0, {group:g, seed:i + 1});
      }
      cylinder('Jerrycan Drum ' + (index + 1), [spot[0] + (index ? -1.5 : 1.5), GROUND_Y + .42, spot[1]], .32, .84, 'steelRust', true, {group:g, seed:index + 1});
    });
    box('Fire Point Board', [-24.6, GROUND_Y + 1.3, 8], [.12, 1.6, 2.2], COLOR.signRed, false, {group:g});
    cylinder('Fire Extinguisher', [-24.3, GROUND_Y + .95, 7.4], .13, .7, 0x9b3a30, false, {group:g});

    // Loadout table: the pickups in zone 10 sit ON something. They used to
    // hover in the middle of the bay with nothing under them, which is the
    // first thing a player sees when the level opens.
    box('Loadout Table Top', [0, GROUND_Y + .92, 9.4], [9, .12, 1.5], 'wood', true, {group:g, seed:2});
    [-4.2, 0, 4.2].forEach((x, index) => {
      box('Loadout Table Frame ' + (index + 1), [x, GROUND_Y + .45, 9.4], [.16, .9, 1.4], 'steelDark', false, {group:g});
    });
    box('Loadout Table Shelf', [0, GROUND_Y + .3, 9.4], [8.6, .08, 1.1], 'steelDark', false, {group:g});
    box('Loadout Table Rack', [0, GROUND_Y + 1.6, 10.0], [8.6, 1.2, .12], 'steelDark', false, {group:g});
  }

  // -------------------------------------------------------- 03 firing line

  function buildFiringLine(){
    const g = GROUP.firing;
    // Sandbag emplacements, one per lane. Each bag is offset so the stack
    // reads as bags rather than a solid block.
    [-15, -5, 5, 15].forEach((laneX, lane) => {
      const name = 'Emplacement ' + (lane + 1);
      for(let row = 0; row < 3; row++){
        const count = 7 - row;
        for(let i = 0; i < count; i++){
          const x = laneX + (i - (count - 1) / 2) * .78 + (row % 2 ? .18 : -.18);
          box(name + ' Sandbag R' + (row + 1) + 'B' + (i + 1),
            [x, GROUND_Y + .17 + row * .3, 2.2 + (row % 2 ? .05 : -.05)],
            [.74, .3, .5], 'sandbag', true, {group:g, rotation:[0, (i % 3 - 1) * .08, 0], seed:(row * 7 + i) % 6 + 1});
        }
      }
      box(name + ' Rest Plank', [laneX, GROUND_Y + 1.0, 2.2], [3.2, .1, .7], 'wood', true, {group:g});
      decal(name + ' Lane Number', laneX, 3.4, .8, .8, 'paintWhite', 'marking', {group:g});
      // Brass under the firing point, and the mat a shooter lies on.
      decal(name + ' Brass Litter', laneX + .9, 3.1, 1.6, 1.2, COLOR.markerMid, 'stain', {group:g});
      box(name + ' Shooting Mat', [laneX, GROUND_Y + .03, 3.9], [2.2, .06, 1.4], 'tarp', false, {group:g, seed:lane + 1});
      // Lane placard on a post, readable from the line.
      cylinder(name + ' Placard Post', [laneX + 3.6, GROUND_Y + .8, 2.4], .05, 1.6, 'steel', false, {group:g});
      box(name + ' Placard', [laneX + 3.6, GROUND_Y + 1.68, 2.4], [.6, .4, .05], 'steelDark', false, {group:g});
      glow(name + ' Placard Number', [laneX + 3.6, GROUND_Y + 1.68, 2.36], [.34, .22, .02], 0xd6c48c, {group:g});
    });

    // Shell buckets between the lanes.
    [-10, 0, 10].forEach((x, index) => {
      cylinder('Shell Bucket ' + (index + 1), [x, GROUND_Y + .28, 3.1], .34, .56, 'steel', true, {group:g});
      ring('Shell Bucket ' + (index + 1) + ' Rim', [x, GROUND_Y + .56, 3.1], .36, 'steelDark', {group:g, rotation:[Math.PI / 2, 0, 0]});
    });

    // Range control desk on the east end of the line.
    box('Range Control Desk', [20.5, GROUND_Y + .5, 3.2], [2.4, 1, 1], 'steel', true, {group:g});
    box('Range Control Top', [20.5, GROUND_Y + 1.04, 3.2], [2.6, .08, 1.2], 'wood', false, {group:g});
    glow('Range Control Screen', [20.5, GROUND_Y + 1.42, 3.5], [1.1, .6, .04], 0x2f6f5e, {group:g, rotation:[-.3, 0, 0]});
    cylinder('Range Control Lamp Post', [21.6, GROUND_Y + 1.5, 3.2], .04, 1, 'steelDark', false, {group:g});
    glow('Range Control Lamp', [21.6, GROUND_Y + 2.02, 3.2], [.22, .1, .22], COLOR.lampGlow, {group:g});
  }

  // -------------------------------------------------------- 04 CQB village

  function buildVillage(){
    const g = GROUP.village;

    // --- shipping containers ------------------------------------------------
    // The corrugation lives in the surface now rather than in a rib per panel:
    // 22 rib boxes per container looked like stripes stuck on a flat side and
    // cost 66 objects. What geometry still owes the eye is the hardware -
    // corner castings, door bars, roof rails - which is what actually reads as
    // a container.
    // Authored on an explicit axis rather than with a rotation, because the
    // character collider (character-movement.js) ignores `rotY` and uses the
    // box's LOCAL extents: a container turned 90 degrees would look right and
    // collide sideways, blocking a lane it visually leaves clear.
    function container(name, center, axis, spec, seed){
      const L = 6.1, W = 2.44, H = 2.6;
      const alongZ = axis === 'z';
      const span = (long, short) => (alongZ ? [short, H, long] : [long, H, short]);

      box(name + ' Shell', [center[0], center[1] + H / 2, center[2]], span(L, W), spec, true,
        {group:g, surface:'metal', seed:seed});
      // Corner castings: eight blocks at the corners of the box.
      [-1, 1].forEach(sx => [-1, 1].forEach(sz => [0, 1].forEach(level => {
        const p = alongZ
          ? [center[0] + sx * (W / 2 - .12), center[1] + (level ? H - .13 : .13), center[2] + sz * (L / 2 - .12)]
          : [center[0] + sz * (L / 2 - .12), center[1] + (level ? H - .13 : .13), center[2] + sx * (W / 2 - .12)];
        box(name + ' Casting ' + (sx > 0 ? 'E' : 'W') + (sz > 0 ? 'N' : 'S') + (level ? 'U' : 'D'), p, [.3, .26, .3], 'steelDark', false, {group:g});
      })));
      // One end carries the doors and their lever bars.
      const doorCentre = alongZ
        ? [center[0], center[1] + H / 2, center[2] + L / 2 + .04]
        : [center[0] + L / 2 + .04, center[1] + H / 2, center[2]];
      box(name + ' Door', doorCentre, alongZ ? [W - .16, H - .2, .08] : [.08, H - .2, W - .16], 'steelDark', false, {group:g});
      [-.55, .55].forEach((offset, index) => {
        const p = alongZ
          ? [doorCentre[0] + offset, doorCentre[1], doorCentre[2]]
          : [doorCentre[0], doorCentre[1], doorCentre[2] + offset];
        box(name + ' Door Bar ' + (index + 1), p, alongZ ? [.09, H - .5, .06] : [.06, H - .5, .09], 'steelPale', false, {group:g});
        box(name + ' Door Latch ' + (index + 1), [p[0], p[1] - .1, p[2] + (alongZ ? .04 : 0)], alongZ ? [.22, .16, .08] : [.08, .16, .22], 'steelPale', false, {group:g});
      });
      // Stencilled owner panel and a rust streak below the roof line.
      const panelP = alongZ
        ? [center[0] - W / 2 - .03, center[1] + H - .55, center[2] - 1.2]
        : [center[0] - 1.2, center[1] + H - .55, center[2] - W / 2 - .03];
      box(name + ' Stencil', panelP, alongZ ? [.02, .5, 1.8] : [1.8, .5, .02], 0xd6d2c4, false, {group:g});
      // The roof rail is the lip around the top of the container, not another
      // container: `span` puts the shell HEIGHT in the y slot, so reusing it
      // here built a second 2.6 m block on the roof - a black slab the size of
      // the container itself, sitting between the two stacked ones.
      box(name + ' Roof Rail', [center[0], center[1] + H + .06, center[2]],
        alongZ ? [W + .1, .12, L + .1] : [L + .1, .12, W + .1], 'steelDark', true, {group:g, surface:'metal'});
    }
    container('Container A', [-22.2, GROUND_Y, -18], 'z', 'containerRed', 1);
    container('Container B', [-22.2, GROUND_Y + 2.72, -18], 'z', 'containerBlue', 2);
    container('Container C', [22.2, GROUND_Y, -22], 'z', 'containerSand', 3);
    // Grime where a heavy thing has stood for years. Screen-space AO gives the
    // contact edge; this gives the metre around it, which AO never reaches.
    [[-22.2, -18], [22.2, -22]].forEach((spot, index) => {
      decal('Container Ground Grime ' + (index + 1), spot[0], spot[1], 5.5, 9, 'dirtDark', 'wear', {group:g, seed:index + 1});
    });
    // Ladder welded to the stack, so the top container reads as reachable.
    box('Container Stack Ladder', [-20.9, GROUND_Y + 2.6, -20.6], [.06, 5.2, .5], 'steelPale', false, {group:g});

    // --- block house --------------------------------------------------------
    // Two rooms with real doorway and window openings, built from wall
    // segments so the player can actually move through and shoot out.
    // The block house closes the north end of the range. Standing mid-field it
    // swallowed the centre target and blocked every long shot down that lane.
    const HOUSE = {x:0, z:-70, w:12, d:9, h:3.4, t:.35};
    const hx = HOUSE.x, hz = HOUSE.z, hw = HOUSE.w, hd = HOUSE.d, hh = HOUSE.h, ht = HOUSE.t;

    // South face: two window openings and a central doorway.
    box('Block House South Pier L', [hx - hw / 2 + 1, GROUND_Y + hh / 2, hz + hd / 2], [2, hh, ht], 'block', true, {group:g, seed:1});
    box('Block House South Pier R', [hx + hw / 2 - 1, GROUND_Y + hh / 2, hz + hd / 2], [2, hh, ht], 'block', true, {group:g, seed:2});
    box('Block House South Pier C', [hx, GROUND_Y + hh / 2, hz + hd / 2], [1.6, hh, ht], 'block', true, {group:g, seed:3});
    [-3.3, 3.3].forEach((x, i) => {
      box('Block House South Sill ' + (i + 1), [hx + x, GROUND_Y + .5, hz + hd / 2], [2.6, 1, ht], 'block', true, {group:g});
      box('Block House South Header ' + (i + 1), [hx + x, GROUND_Y + 2.8, hz + hd / 2], [2.6, 1.2, ht], 'block', true, {group:g});
      box('Block House South Window Frame ' + (i + 1), [hx + x, GROUND_Y + 1.65, hz + hd / 2], [2.7, 1.4, .1], 'steelDark', false, {group:g});
      box('Block House South Window Ledge ' + (i + 1), [hx + x, GROUND_Y + 1.0, hz + hd / 2 + .12], [2.7, .1, .3], 'concreteWorn', false, {group:g});
    });
    box('Block House South Door Header', [hx, GROUND_Y + 3.05, hz + hd / 2], [1.6, .7, ht], 'block', true, {group:g});

    // North face: solid with one high window.
    box('Block House North Wall L', [hx - 3.4, GROUND_Y + hh / 2, hz - hd / 2], [5.2, hh, ht], 'block', true, {group:g, seed:4});
    box('Block House North Wall R', [hx + 3.4, GROUND_Y + hh / 2, hz - hd / 2], [5.2, hh, ht], 'block', true, {group:g, seed:5});
    box('Block House North Sill', [hx, GROUND_Y + .85, hz - hd / 2], [1.6, 1.7, ht], 'block', true, {group:g});
    box('Block House North Header', [hx, GROUND_Y + 3.05, hz - hd / 2], [1.6, .7, ht], 'block', true, {group:g});

    // Side walls, one with a breach hole.
    box('Block House West Wall', [hx - hw / 2, GROUND_Y + hh / 2, hz], [ht, hh, hd], 'block', true, {group:g, seed:6});
    box('Block House East Wall Front', [hx + hw / 2, GROUND_Y + hh / 2, hz + 2.6], [ht, hh, 3.8], 'block', true, {group:g});
    box('Block House East Wall Back', [hx + hw / 2, GROUND_Y + hh / 2, hz - 3.2], [ht, hh, 2.6], 'block', true, {group:g});
    box('Block House East Breach Header', [hx + hw / 2, GROUND_Y + 3.0, hz - .3], [ht, .8, 2.2], 'block', true, {group:g});
    // Rubble spilling from the breach.
    [[.5, .1], [1.1, -.4], [.3, -.9], [1.5, .5]].forEach((r, i) => {
      box('Block House Rubble ' + (i + 1), [hx + hw / 2 + r[0], GROUND_Y + .16, hz - .3 + r[1]], [.6, .32, .5], 'concreteWorn', false, {group:g, rotation:[0, i * .7, 0], seed:i + 1});
    });
    decal('Block House Breach Dust', hx + hw / 2 + 1.4, hz - .3, 4, 3.4, 'dirtPale', 'stain', {group:g});

    // Interior dividing wall with a doorway, and the roof slab.
    box('Block House Divider L', [hx - 3.6, GROUND_Y + hh / 2, hz], [4.4, hh, ht], 'plaster', true, {group:g});
    box('Block House Divider Header', [hx + 1.2, GROUND_Y + 3.05, hz], [5, .7, ht], 'plaster', true, {group:g});
    box('Block House Roof', [hx, GROUND_Y + hh + .18, hz], [hw + .6, .36, hd + .6], 'concreteSlab', true, {group:g});
    box('Block House Roof Lip', [hx, GROUND_Y + hh + .5, hz], [hw + .8, .28, hd + .8], 'concreteWorn', true, {group:g});
    decal('Block House Ground Grime', hx, hz, 15, 12, 'dirtDark', 'wear', {group:g, seed:2});
    box('Block House Roof Vent', [hx - 3.2, GROUND_Y + hh + .95, hz - 2], [1.2, .7, 1.2], 'steelRust', false, {group:g});
    cylinder('Block House Chimney', [hx + 4, GROUND_Y + hh + 1.1, hz - 2.6], .28, 1.6, 'brick', false, {group:g});
    // Sandbagged doorway: the room reads as fought over rather than furnished.
    [-1.1, 1.1].forEach((x, i) => {
      for(let row = 0; row < 2; row++){
        box('Block House Door Sandbag ' + (i + 1) + '-' + (row + 1), [hx + x, GROUND_Y + .17 + row * .3, hz + hd / 2 + .9],
          [.9, .3, .55], 'sandbag', true, {group:g, seed:row + 2});
      }
    });

    // Interior clutter.
    box('Block House Table', [hx - 3.5, GROUND_Y + .75, hz + 2.4], [1.8, .1, 1], 'wood', true, {group:g});
    [[-.8, -.4], [.8, -.4], [-.8, .4], [.8, .4]].forEach((leg, i) => {
      box('Block House Table Leg ' + (i + 1), [hx - 3.5 + leg[0], GROUND_Y + .37, hz + 2.4 + leg[1]], [.09, .74, .09], 'steelDark', false, {group:g});
    });
    box('Block House Crate', [hx + 3.6, GROUND_Y + .55, hz - 2.4], [1.1, 1.1, 1.1], 'crate', true, {group:g, seed:4});
    cylinder('Block House Drum', [hx + 3.2, GROUND_Y + .44, hz + 2.6], .34, .88, 'steelRust', true, {group:g});
    box('Block House Mattress', [hx - 4.4, GROUND_Y + .12, hz - 2.6], [1.9, .24, .9], 'tarp', false, {group:g, rotation:[0, .2, 0]});
    box('Block House Shelf', [hx - 5.5, GROUND_Y + 1.6, hz - 1], [.4, .08, 2.4], 'wood', false, {group:g});

    // --- wrecked car --------------------------------------------------------
    {
      const cx = -6.5, cz = -14.5, cy = GROUND_Y, rot = .42, name = 'Wrecked Car';
      // The wreck sits at an angle for looks, but the character collider would
      // ignore that rotation and block an axis-aligned box in the wrong place.
      // The visible parts are therefore decoration and one hidden proxy, sized
      // to the ROTATED footprint, does the colliding.
      box(name + ' Chassis', [cx, cy + .52, cz], [4.3, .5, 1.85], 'steelRust', false, {group:g, rotation:[0, rot, 0], seed:1});
      // The wreck already carries a Collision proxy; the cabin is tall enough
      // to need its own, or the player walks through the roof line.
      box(name + ' Cabin Collision', [cx - .25, cy + 1.1, cz], [2.3, .72, 1.7], 'steelRust', true, {group:g, visible:false});
      box(name + ' Cabin', [cx - .25, cy + 1.1, cz], [2.3, .72, 1.7], 'steelRust', false, {group:g, rotation:[0, rot, 0], seed:2});
      const spanX = 4.3 * Math.abs(Math.cos(rot)) + 1.85 * Math.abs(Math.sin(rot));
      const spanZ = 4.3 * Math.abs(Math.sin(rot)) + 1.85 * Math.abs(Math.cos(rot));
      box(name + ' Collision', [cx, cy + .75, cz], [spanX, 1.5, spanZ], 'steelRust', true, {group:g, visible:false});
      box(name + ' Bonnet', [cx + 1.7, cy + .82, cz], [1.4, .18, 1.7], 'steelRust', false, {group:g, rotation:[0, rot, 0], seed:3});
      box(name + ' Windscreen', [cx + .95, cy + 1.16, cz], [.14, .6, 1.5], 'glass', false, {group:g, rotation:[0, rot, 0]});
      box(name + ' Bumper', [cx + 2.3, cy + .5, cz], [.24, .3, 1.7], 'steelDark', false, {group:g, rotation:[0, rot, 0]});
      [[1.45, .95], [1.45, -.95], [-1.45, .95], [-1.45, -.95]].forEach((w, i) => {
        const wx = cx + Math.cos(rot) * w[0] - Math.sin(rot) * w[1];
        const wz = cz + Math.sin(rot) * w[0] + Math.cos(rot) * w[1];
        // One corner rests on its rim: the wreck should not look parked.
        if(i === 1) cylinder(name + ' Rim ' + (i + 1), [wx, cy + .18, wz], .26, .2, 'steelPale', false, {group:g, rotation:[0, 0, Math.PI / 2]});
        else ring(name + ' Wheel ' + (i + 1), [wx, cy + .34, wz], .35, 'rubber', {group:g, rotation:[0, rot, Math.PI / 2]});
      });
      box(name + ' Door Open', [cx - 1.1, cy + .95, cz + 1.5], [1.5, .95, .12], 'steelRust', false, {group:g, rotation:[0, rot + .9, 0]});
      decal(name + ' Oil Pool', cx, cz, 4.4, 3, 0x1c1e21, 'stain', {group:g});
      decal(name + ' Glass Scatter', cx + 1.6, cz + 1.4, 2.2, 1.8, 'dirtPale', 'wear', {group:g});
    }

    // --- tyre stacks and drums ---------------------------------------------
    [[-19, -28], [8, -18], [17, -30], [-4, -40]].forEach((spot, index) => {
      const tyres = 3 + (index % 2);
      for(let i = 0; i < tyres; i++){
        ring('Tyre Stack ' + (index + 1) + ' Tyre ' + (i + 1), [spot[0], GROUND_Y + .13 + i * .24, spot[1]], .38, 'rubber',
          {group:g, rotation:[Math.PI / 2, i * .5, 0]});
      }
      // A torus is decoration and never collides, so the stack needs a solid
      // core or the player walks through it. Low enough to be vaulted.
      cylinder('Tyre Stack ' + (index + 1) + ' Core', [spot[0], GROUND_Y + tyres * .12, spot[1]],
        .3, tyres * .24, 'rubber', true, {group:g, surface:'carpet'});
    });
    [[-9.5, -22, 'steelRust'], [-8.6, -23.2, 'steelRust'], [15, -36, 'steelRust'], [16.1, -35.1, 'steel'], [-17, -40, 'steel']].forEach((drum, index) => {
      cylinder('Oil Drum ' + (index + 1), [drum[0], GROUND_Y + .45, drum[1]], .42, .9, drum[2], true, {group:g, seed:index + 1});
      ring('Oil Drum ' + (index + 1) + ' Band', [drum[0], GROUND_Y + .62, drum[1]], .44, 'steelDark', {group:g, rotation:[Math.PI / 2, 0, 0]});
      ring('Oil Drum ' + (index + 1) + ' Band Low', [drum[0], GROUND_Y + .28, drum[1]], .44, 'steelDark', {group:g, rotation:[Math.PI / 2, 0, 0]});
      box('Oil Drum ' + (index + 1) + ' Lid', [drum[0], GROUND_Y + .91, drum[1]], [.86, .04, .86], 'steelDark', false, {group:g});
    });
    // A burnt-out drum with the scorch it left.
    cylinder('Burn Barrel', [7.4, GROUND_Y + .45, -24], .42, .9, 0x2b2723, true, {group:g});
    ring('Burn Barrel Rim', [7.4, GROUND_Y + .89, -24], .44, 0x2b2723, {group:g, rotation:[Math.PI / 2, 0, 0]});

    // --- cover crates, spools and barriers ----------------------------------
    [
      {p:[-9, .6, -8], s:[1.4, 1.2, 1.4]},
      {p:[-9, 1.75, -8], s:[1.1, 1.1, 1.1]},
      {p:[-7.3, .6, -9.6], s:[1.4, 1.2, 1.4]},
      {p:[9.2, .6, -8.6], s:[1.4, 1.2, 1.4]},
      {p:[10.8, .9, -10.2], s:[1.6, 1.8, 1.6]},
      {p:[0, .6, -18], s:[1.6, 1.2, 1.6]},
      {p:[-16, .9, -22], s:[1.8, 1.8, 1.8]},
      {p:[16, .9, -22], s:[1.8, 1.8, 1.8]},
      {p:[-4.5, .6, -40], s:[1.5, 1.2, 1.5]},
      {p:[5.2, .6, -40], s:[1.5, 1.2, 1.5]},
    ].forEach((item, index) => {
      const name = 'Cover Crate ' + (index + 1);
      box(name, item.p, item.s, 'crate', true, {group:g, seed:index % 6 + 1});
      box(name + ' Trim', [item.p[0], item.p[1] + item.s[1] / 2 + .04, item.p[2]], [item.s[0] + .06, .08, item.s[2] + .06], 'plywood', false, {group:g});
    });
    // Cable spool on its side: a silhouette the eye has not already seen twice.
    [[-13.5, -12], [12.5, -33]].forEach((spot, index) => {
      cylinder('Cable Spool ' + (index + 1) + ' Core', [spot[0], GROUND_Y + .55, spot[1]], .34, 1.1, 'wood', true, {group:g, rotation:[0, 0, Math.PI / 2]});
      [-.52, .52].forEach((offset, side) => {
        cylinder('Cable Spool ' + (index + 1) + ' Cheek ' + (side + 1), [spot[0] + offset, GROUND_Y + .55, spot[1]], .55, .1, 'plywood', false,
          {group:g, rotation:[0, 0, Math.PI / 2], seed:index + 1});
      });
    });
    [-20, -13, 13, 20].forEach((x, index) => {
      box('Jersey Barrier ' + (index + 1), [x, GROUND_Y + .55, -30], [3.6, 1.1, .45], 'concreteWall', true, {group:g, seed:index + 1});
      box('Jersey Barrier ' + (index + 1) + ' Foot', [x, GROUND_Y + .12, -30], [3.7, .24, .8], 'concreteWorn', false, {group:g});
      box('Jersey Barrier ' + (index + 1) + ' Stripe', [x, GROUND_Y + .95, -30 + .24], [3.4, .18, .04], COLOR.signYellow, false, {group:g, props:{roughness:.55}});
    });
  }

  // -------------------------------------------------------- 05 long range

  function buildLongRange(){
    const g = GROUP.range;

    // Earth berms run ALONG the flanks. Crossing the range they sat in front of
    // the very targets they were meant to back, making four of them unhittable.
    [[-25, -34, 34, 2.4], [25, -34, 34, 2.4], [-25, -62, 18, 3], [25, -62, 18, 3]].forEach((berm, index) => {
      box('Berm ' + (index + 1), [berm[0], GROUND_Y + berm[3] / 2, berm[1]], [3, berm[3], berm[2]], 'dirt', true, {group:g, surface:'dirt', seed:index + 1});
      box('Berm ' + (index + 1) + ' Crest', [berm[0], GROUND_Y + berm[3], berm[1]], [2, .5, berm[2] - 1.2], 'dirtPale', true, {group:g, surface:'dirt'});
      box('Berm ' + (index + 1) + ' Revetment', [berm[0] + (berm[0] < 0 ? 1.6 : -1.6), GROUND_Y + .45, berm[1]], [.3, .9, berm[2] - 2], 'wood', false, {group:g});
    });

    // Target frames: the wooden A-frames the Logic Element targets stand in.
    function frame(name, x, z){
      box(name + ' Post L', [x - 1.1, GROUND_Y + 1.2, z], [.16, 2.4, .16], 'wood', true, {group:g});
      box(name + ' Post R', [x + 1.1, GROUND_Y + 1.2, z], [.16, 2.4, .16], 'wood', true, {group:g});
      box(name + ' Header', [x, GROUND_Y + 2.35, z], [2.5, .16, .16], 'wood', false, {group:g});
      box(name + ' Brace', [x, GROUND_Y + .5, z + .5], [2.4, .12, .12], 'wood', false, {group:g, rotation:[.5, 0, 0]});
      box(name + ' Base Bags', [x, GROUND_Y + .16, z + .1], [2.4, .32, .5], 'sandbag', false, {group:g});
    }
    [[-15, -12], [-5, -12], [5, -12], [15, -12], [-15, -26], [15, -26], [0, -30], [-9.8, -44], [9.8, -44], [0, -62]]
      .forEach((spot, index) => frame('Target Frame ' + String(index + 1).padStart(2, '0'), spot[0], spot[1]));

    // --- watchtower ---------------------------------------------------------
    // Raised firing position: verticality changes both the pitch clamp and the
    // target angles the rig has to handle.
    // Deck and stair. Treads are climbed automatically: the movement controller
    // lifts the character onto any surface within step height, so a flight of
    // 0.29 m steps walks up with no dedicated stair logic.
    decal('Watchtower Ground Grime', -18, -46, 15, 15, 'dirtDark', 'wear', {group:g, seed:3});
    box('Overwatch Platform', [-18, GROUND_Y + 2.9, -46], [12, .5, 12], 'tread', true, {group:g, surface:'metal'});
    box('Overwatch Deck Skirt', [-18, GROUND_Y + 2.52, -46], [12.2, .26, 12.2], 'steelDark', false, {group:g});
    const STEPS = 11, RISE = 3.15 / STEPS, RUN = .42;
    // The flight climbs as z DECREASES: the top tread is flush with the deck
    // edge and the bottom one meets the ground furthest south. Every railing
    // piece below is derived from that, because hand-placing them is how the
    // rails ended up sloping against the stairs.
    const STAIR_TOP_Z = -40.1;
    const STAIR_BOTTOM_Z = STAIR_TOP_Z + (STEPS - 1) * RUN;
    const STAIR_SLOPE = -RISE / RUN;                 // rise per metre of +z
    const RAIL_HEIGHT = 1;
    function treadTopAt(z){ return GROUND_Y + 3.15 + STAIR_SLOPE * (z - STAIR_TOP_Z); }

    for(let i = 0; i < STEPS; i++){
      const top = GROUND_Y + RISE * (i + 1);
      box('Overwatch Stair ' + String(i + 1).padStart(2, '0'), [-18, top - RISE / 2, STAIR_TOP_Z + (STEPS - 1 - i) * RUN], [3.4, RISE, RUN + .02], 'tread', true, {group:g, surface:'metal'});
    }
    const railMidZ = (STAIR_TOP_Z + STAIR_BOTTOM_Z) / 2;
    const railLength = Math.hypot(STAIR_BOTTOM_Z - STAIR_TOP_Z, RISE * (STEPS - 1)) + .3;
    // A box rotated by +x about X tips its local +Z downward, which is the way
    // the treads fall. The opposite sign is what made the rails climb backwards.
    const railPitch = Math.atan(RISE / RUN);
    const POSTS = 5, postSpan = (STAIR_BOTTOM_Z - STAIR_TOP_Z - 1) / (POSTS - 1);
    [-1.75, 1.75].forEach((offset, index) => {
      box('Stair Rail ' + (index + 1), [-18 + offset, treadTopAt(railMidZ) + RAIL_HEIGHT, railMidZ],
        [.08, .08, railLength], 'steel', false, {group:g, rotation:[railPitch, 0, 0]});
      for(let i = 0; i < POSTS; i++){
        const z = STAIR_TOP_Z + .5 + i * postSpan;
        box('Stair Rail Post ' + (index + 1) + '-' + (i + 1), [-18 + offset, treadTopAt(z) + RAIL_HEIGHT / 2, z],
          [.07, RAIL_HEIGHT + .1, .07], 'steel', false, {group:g});
      }
    });
    [[-24, -52], [-12, -52], [-24, -40], [-12, -40]].forEach((leg, index) => {
      cylinder('Platform Leg ' + (index + 1), [leg[0], GROUND_Y + 1.45, leg[1]], .22, 2.9, 'steelDark', true, {group:g});
      box('Platform Footing ' + (index + 1), [leg[0], GROUND_Y + .1, leg[1]], [.8, .2, .8], 'concreteSlab', false, {group:g});
      box('Platform Brace ' + (index + 1), [leg[0], GROUND_Y + 1.9, leg[1] + (leg[1] < -46 ? 3 : -3)], [.14, .14, 6.2], 'steelDark', false,
        {group:g, rotation:[leg[1] < -46 ? .42 : -.42, 0, 0]});
    });
    // Railing: posts plus two rails, open toward the range.
    box('Overwatch Rail North', [-18, GROUND_Y + 3.7, -52], [12, .1, .1], 'steel', true, {group:g, surface:'metal'});
    box('Overwatch Rail North Low', [-18, GROUND_Y + 3.4, -52], [12, .08, .08], 'steel', false, {group:g});
    [-24, -21, -18, -15, -12].forEach((x, index) => {
      box('Overwatch Rail Post ' + (index + 1), [x, GROUND_Y + 3.45, -52], [.1, 1.1, .1], 'steel', true, {group:g, surface:'metal'});
    });
    box('Overwatch Sandbag Rest', [-17.6, GROUND_Y + 3.45, -41], [3.2, .6, .8], 'sandbag', true, {group:g});
    box('Overwatch Ammo Box', [-21.5, GROUND_Y + 3.35, -42.4], [1, .4, .6], 'crate', false, {group:g, seed:2});
    box('Overwatch Spotting Scope', [-14.6, GROUND_Y + 3.9, -42], [.14, .14, .9], 'steelDark', false, {group:g, rotation:[.2, 0, 0]});
    cylinder('Overwatch Scope Stand', [-14.6, GROUND_Y + 3.5, -42], .05, .8, 'steelDark', false, {group:g});
    // Tower roof on four posts.
    [[-23.4, -51.4], [-12.6, -51.4], [-23.4, -41], [-12.6, -41]].forEach((post, index) => {
      box('Tower Post ' + (index + 1), [post[0], GROUND_Y + 4.6, post[1]], [.18, 2.9, .18], 'wood', true, {group:g, surface:'wood'});
    });
    box('Tower Roof', [-18, GROUND_Y + 6.2, -46.2], [12.4, .24, 11.4], 'corrugatedRoof', false, {group:g});
    box('Tower Roof Ridge', [-18, GROUND_Y + 6.4, -46.2], [12.6, .18, .5], 'steelDark', false, {group:g});
    box('Tower Tarp Skirt', [-18, GROUND_Y + 5.7, -51.6], [12.4, .9, .06], 'tarp', false, {group:g});
    glow('Tower Lamp', [-18, GROUND_Y + 5.9, -46.2], [.7, .12, .7], COLOR.lampGlow, {group:g});
    light('Tower Light', [-18, GROUND_Y + 5.6, -46.2], {intensity:600, distance:30}, g);

    // Elevated target posts on the far flanks.
    [[-20, -56], [20, -56]].forEach((post, index) => {
      box('Elevated Target Post ' + (index + 1), [post[0], GROUND_Y + 1.45, post[1]], [1.4, 2.9, 1.4], 'concreteWall', true, {group:GROUP.targets});
      box('Elevated Target Cap ' + (index + 1), [post[0], GROUND_Y + 2.95, post[1]], [1.7, .16, 1.7], 'concreteWorn', false, {group:GROUP.targets});
    });

    // Steel gongs hung off the flanks: something that reads as shot at, without
    // standing in a lane.
    [[-22.5, -20], [22.5, -20], [-22.5, -48], [22.5, -48]].forEach((spot, index) => {
      box('Gong Frame ' + (index + 1) + ' Post L', [spot[0] - .8, GROUND_Y + 1.1, spot[1]], [.12, 2.2, .12], 'steelDark', false, {group:g});
      box('Gong Frame ' + (index + 1) + ' Post R', [spot[0] + .8, GROUND_Y + 1.1, spot[1]], [.12, 2.2, .12], 'steelDark', false, {group:g});
      box('Gong Frame ' + (index + 1) + ' Header', [spot[0], GROUND_Y + 2.15, spot[1]], [1.9, .12, .12], 'steelDark', false, {group:g});
      box('Gong Plate ' + (index + 1), [spot[0], GROUND_Y + 1.5, spot[1]], [.9, .9, .06], 'steelPale', false, {group:g, seed:index + 1});
    });
  }

  // --------------------------------------------------- 06 perimeter + light

  function buildPerimeter(){
    const g = GROUP.perimeter;
    const WALL_H = 7;

    // Corrugated boundary wall on all four sides. The ribbing is in the
    // surface, not in 48 separate rib boxes stuck to the outside of it.
    box('Wall North', [0, GROUND_Y + WALL_H / 2, ARENA_MIN_Z - 1], [56, WALL_H, 1], 'corrugated', true, {group:g, seed:1});
    box('Wall South', [0, GROUND_Y + WALL_H / 2, ARENA_MAX_Z + 1], [56, WALL_H, 1], 'corrugated', true, {group:g, seed:2});
    box('Wall West', [-ARENA_HALF_X - 1, GROUND_Y + WALL_H / 2, -29], [1, WALL_H, 92], 'corrugated', true, {group:g, seed:3});
    box('Wall East', [ARENA_HALF_X + 1, GROUND_Y + WALL_H / 2, -29], [1, WALL_H, 92], 'corrugated', true, {group:g, seed:4});
    [[-ARENA_HALF_X - 1, -29, 1, 92], [ARENA_HALF_X + 1, -29, 1, 92], [0, ARENA_MIN_Z - 1, 56, 1], [0, ARENA_MAX_Z + 1, 56, 1]].forEach((wall, index) => {
      box('Wall Trim ' + (index + 1), [wall[0], GROUND_Y + WALL_H + .12, wall[1]], [wall[2] + .2, .24, wall[3] + .2], 'steelDark', false, {group:g});
      // Concrete plinth: the wall is founded on something instead of growing
      // out of the dirt.
      box('Wall Plinth ' + (index + 1), [wall[0], GROUND_Y + .35, wall[1]], [wall[2] + .5, .7, wall[3] + .5], 'concreteWorn', false, {group:g});
    });
    // Structural posts every 8 m on the two long walls, which is what makes a
    // 92 m corrugated run read as built rather than extruded.
    for(let i = 0; i < 12; i++){
      const z = -72 + i * 8;
      box('Wall Post W ' + (i + 1), [-ARENA_HALF_X - .42, GROUND_Y + WALL_H / 2, z], [.22, WALL_H, .34], 'steelDark', false, {group:g});
      box('Wall Post E ' + (i + 1), [ARENA_HALF_X + .42, GROUND_Y + WALL_H / 2, z], [.22, WALL_H, .34], 'steelDark', false, {group:g});
    }
    // Razor wire along the top of the long walls. A torus lies in its own XY
    // plane, so an untouched ring already threads a run along z; the two
    // strands are what tie the hoops together into a coil instead of leaving
    // a row of loose hoops floating over the wall.
    [-1, 1].forEach(side => {
      const tag = side < 0 ? 'W' : 'E', x = side * (ARENA_HALF_X + .9);
      for(let i = 0; i < 15; i++){
        ring('Razor Coil ' + tag + ' ' + (i + 1), [x, GROUND_Y + WALL_H + .62, -70 + i * 6.2], .5, 'steelPale',
          {group:g, rotation:[0, 0, i * .4]});
      }
      [.42, -.42].forEach((offset, index) => {
        box('Razor Strand ' + tag + ' ' + (index + 1), [x, GROUND_Y + WALL_H + .62 + offset, -29], [.05, .05, 88], 'steelPale', false, {group:g});
      });
      box('Razor Bracket ' + tag, [x - side * .4, GROUND_Y + WALL_H + .3, -29], [.06, .8, 88], 'steelDark', false, {group:g, rotation:[0, 0, side * .4]});
    });

    // Chain-link inner fence framing the village, posts plus top rail.
    [-22, 22].forEach((side, sideIndex) => {
      for(let i = 0; i < 9; i++){
        const z = -14 - i * 4;
        cylinder('Fence Post ' + (sideIndex ? 'E' : 'W') + (i + 1), [side, GROUND_Y + 1.1, z], .07, 2.2, 'steel', false, {group:g});
      }
      box('Fence Top Rail ' + (sideIndex ? 'E' : 'W'), [side, GROUND_Y + 2.15, -30], [.07, .07, 33], 'steel', false, {group:g});
      box('Fence Mid Rail ' + (sideIndex ? 'E' : 'W'), [side, GROUND_Y + 1.1, -30], [.05, .05, 33], 'steel', false, {group:g});
      box('Fence Mesh ' + (sideIndex ? 'E' : 'W'), [side, GROUND_Y + 1.6, -30], [.03, 1.1, 33], 'steelDark', false,
        {group:g, props:{roughness:.7}});
    });

    // Floodlight masts. Four fixtures, two real lights: the pair flanking the
    // CQB village, where the player actually fights. The far pair stays
    // geometry plus a glowing lens.
    [[-23, -6], [23, -6], [-23, -50], [23, -50]].forEach((mast, index) => {
      cylinder('Floodlight Mast ' + (index + 1), [mast[0], GROUND_Y + 5, mast[1]], .18, 10, 'steelDark', true, {group:g});
      box('Floodlight Mast ' + (index + 1) + ' Base', [mast[0], GROUND_Y + .18, mast[1]], [.9, .36, .9], 'concreteSlab', false, {group:g});
      box('Floodlight Mast ' + (index + 1) + ' Ladder', [mast[0] + .26, GROUND_Y + 3, mast[1]], [.06, 6, .34], 'steelPale', false, {group:g});
      box('Floodlight Head ' + (index + 1), [mast[0], GROUND_Y + 10.2, mast[1]], [1.9, .8, .45], 'steel', false, {group:g});
      box('Floodlight Hood ' + (index + 1), [mast[0], GROUND_Y + 10.66, mast[1] + (mast[1] > -28 ? -.16 : .16)], [2, .18, .5], 'steelDark', false, {group:g});
      glow('Floodlight Lens ' + (index + 1), [mast[0], GROUND_Y + 10.2, mast[1] + (mast[1] > -28 ? -.26 : .26)], [1.7, .62, .06], COLOR.lampGlow, {group:g});
      if(index < 2) light('Floodlight ' + (index + 1), [mast[0], GROUND_Y + 9.6, mast[1]], {intensity:1600, distance:76}, g);
    });

    // Signage: the facility should tell you where you are and what is lethal.
    function sign(name, position, rotationY, color){
      cylinder(name + ' Post', [position[0], GROUND_Y + .9, position[2]], .05, 1.8, 'steel', false, {group:g});
      box(name + ' Plate', [position[0], GROUND_Y + 1.9, position[2]], [1.5, .85, .05], color, false, {group:g, rotation:[0, rotationY, 0], props:{roughness:.6}});
      glow(name + ' Text', [position[0], GROUND_Y + 1.9, position[2] + .04], [1.2, .18, .02], 0xe6e2d6, {group:g, rotation:[0, rotationY, 0]});
    }
    sign('Sign Live Fire', [-8, 0, 5.4], 0, COLOR.signRed);
    sign('Sign Eye Protection', [8, 0, 5.4], 0, COLOR.signYellow);
    sign('Sign No Entry North', [-20, 0, -68], 0, COLOR.signRed);
    sign('Sign Range Limit', [20, 0, -68], 0, COLOR.signRed);

    // Wall-mounted facility name behind the spawn.
    box('Facility Sign Panel', [0, GROUND_Y + 5.2, ARENA_MAX_Z + .45], [14, 1.5, .08], 'steelDark', false, {group:g});
    glow('Facility Sign Text', [0, GROUND_Y + 5.2, ARENA_MAX_Z + .38], [11, .5, .04], 0xd9c48a, {group:g});
    [-6.4, 6.4].forEach((x, index) => {
      box('Facility Sign Light ' + (index + 1), [x, GROUND_Y + 6.1, ARENA_MAX_Z + .1], [.5, .2, .4], 'steelDark', false, {group:g, rotation:[.5, 0, 0]});
    });
  }

  // ------------------------------------------- 08 practice yard
  //
  // The traversal course is at the far end of the range, which is the wrong
  // place to LEARN the verbs. This is the same vocabulary within sight of the
  // spawn: a door, a crate to carry to a marked pad, a ladder, and a ledge too
  // high to mantle so the only way up is to jump, catch it and pull up.
  //
  // It sits behind the firing line (z > 2), so none of it can ever cross a
  // target lane no matter how wide it grows.

  function buildPracticeYard(){
    const g = GROUP.yard;
    const sign = (name, position, text) => {
      glow(name, position, [2.6, .5, .06], 0xd9c48a, {group:g});
      return text;
    };

    // --- carry and deliver -------------------------------------------------
    box('Yard Crate Table', [-9, GROUND_Y + .35, 10.6], [1.6, .7, 1], 'steel', true, {group:g, surface:'metal'});
    box('Supply Crate (F to carry)', [-9, GROUND_Y + .92, 10.6], [.62, .62, .62], 'plywood', true, {
      group:g, surface:'wood', seed:3,
      interact:{type:'carry', range:2.4, holdDistance:1.5, holdHeight:1.05, label:'Pick up crate'},
    });
    glow('Yard Delivery Pad', [-9, GROUND_Y + .06, 6.4], [1.9, .08, 1.9], 0x4be3a0, {
      group:g, interact:{type:'dropZone', range:3, label:'Deliver crate'},
    });
    sign('Yard Sign - Carry', [-9, GROUND_Y + 2.4, 12.2]);

    // --- a door that actually opens ----------------------------------------
    box('Yard Door Frame West', [-14.4, GROUND_Y + 1.4, 12], [.3, 2.8, 1.2], 'concreteWorn', true, {group:g});
    box('Yard Door Frame East', [-11.6, GROUND_Y + 1.4, 12], [.3, 2.8, 1.2], 'concreteWorn', true, {group:g});
    box('Yard Door (F)', [-13, GROUND_Y + 1.3, 12], [2.4, 2.6, .22], 'steel', true, {
      group:g, interact:{type:'door', mode:'swing', hinge:'left', openAngle:-1.5, speed:2.8, autoClose:8, range:3, label:'Open door'},
    });

    // --- ledge hang: 2.9 m, too tall to mantle from the ground -------------
    box('Ledge Wall', [8.5, GROUND_Y + 1.45, 11.4], [5, 2.9, .7], 'concreteWall', true, {group:g, surface:'concrete'});
    box('Ledge Deck', [8.5, GROUND_Y + 2.95, 13], [5, .3, 3.2], 'concreteSlab', true, {group:g, surface:'concrete'});
    box('Ledge Step', [8.5, GROUND_Y + .3, 9.6], [3, .6, .8], 'concreteWorn', true, {group:g, surface:'concrete'});
    sign('Yard Sign - Ledge', [8.5, GROUND_Y + 3.9, 13]);

    // --- ladder to the same deck, the other way up -------------------------
    box('Yard Ladder (F)', [12.6, GROUND_Y + 1.5, 12.4], [.5, 3, .32], 'steelPale', true, {
      group:g, interact:{type:'ladder', range:2.4, label:'Climb ladder'},
    });

    // --- vault rail, the easy one ------------------------------------------
    box('Yard Vault Rail', [3.5, GROUND_Y + .45, 9.2], [3.4, .9, .4], 'steel', true, {group:g, surface:'metal'});
  }

  // ------------------------------------------- 09 traversal course
  //
  // A worked example of every traversal the character can do, in the order a
  // player would learn them. Nothing here is special-cased: each obstacle is an
  // ordinary collidable box whose HEIGHT is what decides the move, plus a few
  // objects carrying an `interact` contract.

  function buildTraversalCourse(){
    const g = GROUP.traversal;
    // The course runs down the east wall, OUTSIDE every target lane. Targets sit
    // at |x| <= 20 and the range test walks each lane straight down its target's
    // x, so nothing solid here may reach back past x = 20.6.
    const baseX = 23.2;
    plane('Course Floor', [baseX, GROUND_Y + .01, -22], 5, 46, 'concreteWorn', {group:g, surface:'concrete', driveSurface:true, castShadow:false});

    // 1. Vault: low enough to go over, with clear floor on the far side.
    box('Vault Wall 01', [baseX, GROUND_Y + .45, -4], [4.4, .9, .5], 'concreteWall', true, {group:g, surface:'concrete'});
    box('Vault Crate 02', [baseX - 1.1, GROUND_Y + .35, -8.5], [1.6, .7, 1.2], 'crate', true, {group:g, surface:'wood'});
    box('Vault Rail 03', [baseX + 1.4, GROUND_Y + .5, -8.5], [2.2, 1, .28], 'steel', true, {group:g});

    // 2. Mantle: too tall to clear, but the top is a real standing surface.
    box('Mantle Ledge 01', [baseX - 1.2, GROUND_Y + .8, -13.5], [2.2, 1.6, 2.2], 'concreteWall', true, {group:g, surface:'concrete'});
    box('Mantle Ledge 02', [baseX + 1.4, GROUND_Y + 1.15, -13.5], [1.8, 2.3, 2.2], 'concreteWorn', true, {group:g, surface:'concrete'});
    box('Mantle Platform', [baseX, GROUND_Y + 1.6, -17.5], [4.4, 3.2, 3.4], 'tread', true, {group:g, surface:'metal'});

    // 3. Slide: sprint into a gap only a crouched body fits through. The deck is
    //    collidable overhead geometry, which the height-aware movement
    //    controller already lets a short body pass under.
    box('Slide Beam Deck', [baseX, GROUND_Y + 1.55, -23.5], [4.4, .5, 2.4], 'steelDark', true, {group:g});
    box('Slide Wall West', [baseX - 1.75, GROUND_Y + .9, -23.5], [.9, 1.8, 2.4], 'concreteWall', true, {group:g});
    box('Slide Wall East', [baseX + 1.75, GROUND_Y + .9, -23.5], [.9, 1.8, 2.4], 'concreteWall', true, {group:g});

    // 4. Climbable face: a mesh panel tagged with the climb contract, which the
    //    abilities module reads off the collider.
    box('Climb Net Frame', [baseX, GROUND_Y + 2.4, -29], [4.4, 4.8, .3], 'steelDark', true, {
      group:g, interact:{type:'climb'},
    });
    box('Climb Net Landing', [baseX, GROUND_Y + 4.7, -30.8], [4.4, .3, 3], 'tread', true, {group:g, surface:'metal'});

    // 5. Ladder: the Use key mounts it and rides it to the deck.
    box('Service Ladder', [baseX + 1.9, GROUND_Y + 2.6, -35], [.5, 5.2, .35], 'steelPale', true, {
      group:g, interact:{type:'ladder', range:2.2},
    });
    box('Ladder Deck', [baseX, GROUND_Y + 5.2, -36.6], [4.4, .3, 4], 'tread', true, {group:g, surface:'metal'});
    box('Ladder Deck Rail', [baseX, GROUND_Y + 5.8, -38.5], [4.4, 1, .16], 'steel', true, {group:g});

    // 6. Door plus a carry-and-deliver task: lift the crate, open the door, put
    //    the crate down on the pad.
    box('Course Door Frame West', [baseX - 2.3, GROUND_Y + 1.4, -41], [.36, 2.8, 1.4], 'concreteWorn', true, {group:g});
    box('Course Door Frame East', [baseX + 2.3, GROUND_Y + 1.4, -41], [.36, 2.8, 1.4], 'concreteWorn', true, {group:g});
    box('Sliding Door', [baseX, GROUND_Y + 1.4, -41], [4.2, 2.8, .3], 'steel', true, {
      group:g, interact:{type:'door', mode:'slide', slide:[4, 0, 0], speed:2.2, range:3},
    });
    box('Supply Crate', [baseX - 1, GROUND_Y + .35, -38], [.7, .7, .7], 'plywood', true, {
      group:g, surface:'wood', interact:{type:'carry', range:2.2, holdDistance:1.5, holdHeight:1.05},
    });
    glow('Delivery Pad', [baseX + 1, GROUND_Y + .06, -45], [1.8, .08, 1.8], 0x4be3a0, {
      group:g, interact:{type:'dropZone', range:2.8},
    });
    // A swing door back into the range proper, so the course is a loop rather
    // than a dead end.
    box('Range Access Door', [baseX - 2.5, GROUND_Y + 1.3, -48], [.28, 2.6, 2.4], 'steel', true, {
      group:g, interact:{type:'door', mode:'swing', hinge:'left', openAngle:-1.4, speed:2.6, autoClose:6},
    });
  }

  // ------------------------------------------- 10 pickups & interactables
  //
  // Every entry is data: a box that happens to carry an `item` contract. Swap
  // the primitive for an imported GLB and the pickup keeps working, because the
  // contract lives on the object rather than on the geometry.

  function buildPickups(){
    const g = GROUP.pickups;
    // `visual:'auto'` dresses each placeholder with the same model the item
    // system gives a DROPPED item, so a rifle on the table is the rifle you
    // would see if you threw it there instead of a white box. The placeholder
    // box stays as the editable object - transform, contract and save all live
    // on it - and simply stops drawing itself.
    const pickup = (name, position, size, spec, item) => box(name, position, size, spec, false, {
      group:g, item:Object.assign({name, visual:'auto'}, item),
    });
    // Weapons are full Logic Elements. Their placeholder, imported animated
    // model, ammo, respawn and Character action mapping all travel together.
    // Consumables remain ordinary item contracts because they have no equip or
    // animation behaviour to author.
    const weapon = (name, position, preset, respawn) => weaponPickupPlacements.push({
      name, position:position.slice(), preset, respawn:respawn || 20,
    });
    const medkit = (name, position, amount) =>
      pickup(name, position, [.42, .26, .3], 0xe8e8ea, {kind:'health', amount:amount || 35, respawn:25, radius:1.5});
    const armour = (name, position) =>
      pickup(name, position, [.4, .34, .22], 0x4a8fd9, {kind:'armor', amount:50, respawn:35, radius:1.5});
    const ammo = (name, position) =>
      pickup(name, position, [.42, .24, .3], 'crate', {kind:'ammo', amount:90, respawn:18, radius:1.5});

    // Staging bay: laid out on the loadout table in zone 02, so every height
    // here is the table top (0.98 m) plus the item's own half height.
    weapon('Sidearm', [-3.2, GROUND_Y + 1.07, 9.4], 'pistol', 15);
    weapon('SMG', [-1.6, GROUND_Y + 1.07, 9.4], 'smg', 20);
    ammo('Ammo Crate - Bay', [1.8, GROUND_Y + 1.1, 9.4]);
    medkit('Medkit - Bay', [3.2, GROUND_Y + 1.11, 9.4], 50);

    // Firing line and village: the reason to leave cover.
    weapon('Shotgun', [-11.5, GROUND_Y + .35, -18], 'shotgun', 25);
    weapon('Marksman Rifle', [11.5, GROUND_Y + .35, -18], 'marksman', 30);
    medkit('Medkit - Village', [0, GROUND_Y + .3, -27], 35);
    armour('Armour Plate - Village', [-6.5, GROUND_Y + .3, -31]);
    ammo('Ammo Crate - Village', [6.5, GROUND_Y + .3, -31]);

    // Long range: worth the walk.
    medkit('Medkit - Berm', [-14, GROUND_Y + .3, -48], 60);
    ammo('Ammo Crate - Berm', [14, GROUND_Y + .3, -48]);
    armour('Armour Plate - Tower', [20, GROUND_Y + 3.2, -56]);

    // Traversal course reward: only reachable after the climb.
    medkit('Medkit - Net Landing', [19.5, GROUND_Y + 5.05, -30.6], 75);
    weapon('Assault Rifle - Cache', [22.3, GROUND_Y + 5.6, -36.5], 'rifle', 40);
  }

  // ------------------------------------------- 12 outside the wire
  //
  // A 7 m wall with nothing behind it makes the facility read as a box on a
  // table. These are silhouettes only: no collision, no lanes crossed, far
  // enough out that the fog does most of the work. Blackpine gets its pines.

  function buildSkyline(){
    // Everything beyond the wire is a silhouette: no collision, and no shadow
    // either. It stands 40 to 110 m outside the play area, well past the sun
    // shadow camera, so every one of these was a caster that could never put a
    // shadow anywhere the player can stand. `flat` is that opt-out, spread into
    // every call below.
    const g = GROUP.skyline;
    const flat = {group:g, castShadow:false};

    // Three parts a tree, not four: at 50 m and behind haze the silhouette is
    // the whole job, and 28 trees pay for it 28 times.
    function pine(name, x, z, height, spread){
      cylinder(name + ' Trunk', [x, GROUND_Y + height * .18, z], spread * .12, height * .36, 'pineDark', false, flat);
      add(name + ' Crown 1', 'cone', [x, GROUND_Y + height * .34, z], [spread, height * .26, spread], 'pine', false, flat);
      add(name + ' Crown 2', 'cone', [x, GROUND_Y + height * .62, z], [spread * .66, height * .24, spread * .66], 'pineDark', false, flat);
    }
    // Two treelines, staggered in depth so the wall does not end on one flat
    // band of trees.
    for(let i = 0; i < 14; i++){
      const x = -46 + i * 7.1;
      pine('Pine W ' + (i + 1), x, ARENA_MIN_Z - 12 - (i % 3) * 6, 16 + (i % 4) * 3.5, 3 + (i % 3) * .7);
    }
    for(let i = 0; i < 8; i++){
      pine('Pine E ' + (i + 1), ARENA_HALF_X + 14 + (i % 3) * 8, -18 - i * 9, 15 + (i % 3) * 4, 3.2 + (i % 2));
    }
    for(let i = 0; i < 6; i++){
      pine('Pine S ' + (i + 1), -ARENA_HALF_X - 16 - (i % 2) * 9, 4 - i * 11, 17 + (i % 3) * 3, 3.4);
    }

    // Water tower: the one object that tells you the facility belongs to a
    // place, and the only tall vertical the eye can measure the range against.
    const tx = -40, tz = -58;
    [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach((leg, index) => {
      box('Water Tower Leg ' + (index + 1), [tx + leg[0], GROUND_Y + 9, tz + leg[1]], [.5, 18, .5], 'distantSteel', false,
        Object.assign({rotation:[leg[1] > 0 ? .05 : -.05, 0, leg[0] > 0 ? -.05 : .05]}, flat));
    });
    cylinder('Water Tower Tank', [tx, GROUND_Y + 21, tz], 4.6, 7, 'distantSteel', false, flat);
    add('Water Tower Cap', 'cone', [tx, GROUND_Y + 25.6, tz], [4.7, 1.4, 4.7], 'distantSteel', false, flat);
    box('Water Tower Walkway', [tx, GROUND_Y + 17.4, tz], [11, .2, 11], 'distantSteel', false, flat);

    // Radio mast with a beacon, and a pair of warehouse blocks behind the
    // south wall so the spawn view has depth when the player turns around.
    cylinder('Radio Mast', [34, GROUND_Y + 16, -62], .35, 32, 'distantSteel', false, flat);
    [8, 16, 24].forEach((y, index) => {
      box('Radio Mast Stay ' + (index + 1), [34, GROUND_Y + y, -62], [3.4, .12, 3.4], 'distantSteel', false, Object.assign({rotation:[0, index * .4, 0]}, flat));
    });
    glow('Radio Mast Beacon', [34, GROUND_Y + 32.4, -62], [.7, .7, .7], 0xd8402f, flat);
    [[-30, 30, 22, 9, 16], [16, 34, 30, 8, 20], [44, 8, 18, 7, 14]].forEach((block, index) => {
      box('Outlying Block ' + (index + 1), [block[0], GROUND_Y + block[3] / 2, block[1]], [block[2], block[3], block[4]], 'distantSteel', false, flat);
      box('Outlying Block ' + (index + 1) + ' Roof', [block[0], GROUND_Y + block[3] + .3, block[1]], [block[2] + 1, .6, block[4] + 1], 'steelDark', false, flat);
    });
    // A ridge line closing the horizon to the north.
    [[-30, -110, 90, 14], [40, -104, 70, 11]].forEach((ridge, index) => {
      box('North Ridge ' + (index + 1), [ridge[0], GROUND_Y + ridge[3] / 2 - 2, ridge[1]], [ridge[2], ridge[3], 26], 'pineDark', false, flat);
    });
  }

  // ------------------------------------------------------------ 06 logic

  const templates = window.LK_LOGIC_TEMPLATES;
  function placeLogic(templateId, name, position, rotationY, group, configure, options){
    const template = templates && templates.get && templates.get(templateId);
    if(!template || !template.graph) return null;
    const graph = clone(template.graph);
    if(configure) configure(graph);
    const entry = {
      id:nextId(),
      kind:'logicElement',
      name,
      // Logic Elements are not decoration: a shooting target is a board on a
      // frame and has to stop a body walking into it, and one day has to be a
      // physics object. `collide` is opted into per placement.
      collide:options && options.collide === true,
      graph,
      enabled:true,
      runInEditorPreview:true,
      asset:{key:'logic:template:' + templateId, name, source:SOURCE},
      t:{p:position.slice(), r:[0, rotationY || 0, 0], s:[1, 1, 1], v:true},
      templateGroup:group || GROUP.targets,
    };
    scene.added.push(entry);
    return entry;
  }

  weaponPickupPlacements.forEach(spec => {
    const templateId = 'logic-template-weapon-pickup-' + spec.preset;
    const entry = placeLogic(templateId, spec.name, spec.position, 0, GROUP.pickups, graph => {
      const set = (name, value) => {
        const variable = (graph.variables || []).find(item => item && item.name === name);
        if(variable) variable.value = value;
      };
      set('WeaponName', spec.name);
      set('WeaponPreset', spec.preset);
      set('RespawnSeconds', spec.respawn);
    });
    // A missing core template must not silently turn an authored gun into an
    // invisible/non-interactive prop. Failing the level build names the exact
    // dependency that is absent and is caught by the template test gate.
    if(!entry) throw new Error('FPS level template: missing ' + templateId);
  });

  const SPAWN = {x:0, y:GROUND_Y, z:8, heading:Math.PI};
  placeLogic('logic-template-player-first-person', 'Player (First Person)', [SPAWN.x, SPAWN.y, SPAWN.z], SPAWN.heading, GROUP.characters, graph => {
    graph.characterPawn.spawn = {x:SPAWN.x, y:SPAWN.y, z:SPAWN.z, heading:SPAWN.heading};
    graph.characterPawn.firstPerson.weapon = Object.assign({}, graph.characterPawn.firstPerson.weapon, {ammoReserve:600});
    const reserve = (graph.variables || []).find(variable => variable.name === 'ReserveAmmo');
    if(reserve) reserve.value = 600;
    // First person is the eye camera of this SAME complete Character. Keep the
    // world weapon on its real hand and the full-body mixer alive; no duplicate
    // arms Pawn or second weapon is built in front of the lens.
    const view = graph.characterPawn.firstPerson;
    view.unifiedBodyCameraVersion=1;
    view.viewPawn = {schemaVersion:1,kind:'none',enabled:false,showLegs:false};
    view.presentation = 'body';view.hideOwnBody = false;view.showLegs = false;
    const presentation = (graph.variables || []).find(variable => variable && variable.binding === 'firstPerson.viewPawn.kind');
    if(presentation) presentation.value = 'none';
  });

  // Target ring: near practice, mid village targets, long range, and two
  // elevated ones only visible from the watchtower.
  const TARGETS = [
    {name:'Target 01 - Near Left', p:[-15, GROUND_Y, -12], health:60, respawn:3, points:50},
    {name:'Target 02 - Near Centre', p:[-5, GROUND_Y, -12], health:60, respawn:3, points:50},
    {name:'Target 03 - Near Right', p:[5, GROUND_Y, -12], health:60, respawn:3, points:50},
    {name:'Target 04 - Near Far Right', p:[15, GROUND_Y, -12], health:60, respawn:3, points:50},
    {name:'Target 05 - Mid Left', p:[-15, GROUND_Y, -26], health:100, respawn:4, points:100},
    {name:'Target 06 - Mid Right', p:[15, GROUND_Y, -26], health:100, respawn:4, points:100},
    {name:'Target 07 - Mid Centre', p:[0, GROUND_Y, -30], health:100, respawn:4, points:100},
    {name:'Target 08 - Long Left', p:[-9.8, GROUND_Y, -44], health:140, respawn:6, points:200},
    {name:'Target 09 - Long Right', p:[9.8, GROUND_Y, -44], health:140, respawn:6, points:200},
    {name:'Target 10 - Extreme Range', p:[0, GROUND_Y, -62], health:180, respawn:8, points:400},
    {name:'Target 11 - Elevated Left', p:[-20, GROUND_Y + 2.9, -56], health:120, respawn:6, points:250},
    {name:'Target 12 - Elevated Right', p:[20, GROUND_Y + 2.9, -56], health:120, respawn:6, points:250},
  ];
  TARGETS.forEach(target => {
    placeLogic('logic-template-shooting-target', target.name, target.p, Math.PI, GROUP.targets, graph => {
      const variables = graph.variables || [];
      const set = (name, value) => { const variable = variables.find(item => item.name === name); if(variable) variable.value = value; };
      set('TargetHealth', target.health);
      set('RespawnSeconds', target.respawn);
      set('PointsValue', target.points);
    }, {collide:true});
  });

  // ============================================================ 07 world data

  // Movement bounds keep the character inside the shell even where a collider
  // is missing, matching how the other character templates constrain play.
  scene.characterGround = {
    type:'flat',
    baseY:GROUND_Y,
    minX:-ARENA_HALF_X + .8,
    maxX:ARENA_HALF_X - .8,
    minZ:ARENA_MIN_Z + .8,
    maxZ:ARENA_MAX_Z - .8,
  };
  // Late afternoon, sun low in the west. skyTime maps 0 -> 06:00 and .25 ->
  // 12:00, so .455 is about 16:55: the sun rakes ACROSS the range instead of
  // standing over it, which is what gives every crate, berm and container a
  // long shadow and the level its depth. Everything else here follows from
  // that choice - a warmer, dimmer key with more ambient lift so the shaded
  // sides stay readable, and a haze that separates the firing line from the
  // 65 m target.
  scene.env = Object.assign({}, scene.env || {}, {
    skyTime:.435,
    dayLength:999999,
    dayNightCycleEnabled:false,
    // The procedural environment values are all 0..1 and clamp silently, so
    // they are authored inside that range rather than as multipliers.
    procEnvEnabled:true,
    procEnvIntensity:.92,
    procEnvWarmth:.68,
    procEnvContrast:.74,
    // The hemisphere fill has to carry every surface the sun cannot reach, and
    // a range full of container walls has a lot of them: the sun rakes from the
    // west, so every east-facing face is lit by this value alone. Authored high
    // on purpose - at 0.7 the shaded side of a container went black.
    lighting:{daySun:1.5, dayAmbient:1.05, moonDirect:.16, moonIndirect:.2},
    sunBloom:{enabled:true, intensity:.9, size:1.05, radius:.16, threshold:.5},
    lensFlare:{mode:'classic', enabled:true, intensity:.42, size:.85, ghosts:4, spacing:.9,
      chroma:.34, halo:.3, haloSize:1, streak:.26, starburst:.2, ghostOpacity:.55,
      anamorphic:false, occlusion:true},
    volClouds:{enabled:false},
  });
  // Fog and grade are camera-side, not environment-side: the sky writes
  // scene.fog.color every frame, so the only fog value a level can own is the
  // density, and the grade is what carries the cool-shadow, warm-highlight
  // look the palette is mixed for.
  scene.player = Object.assign({}, scene.player || {}, {
    // This level is owned by the Character Logic Pawn. The native singleton
    // must not keep physics, engine audio or exhaust alive at its old spawn.
    enabled:false,
    hidden:true,
    controllerIndex:null,
    cam:Object.assign({}, (scene.player || {}).cam || {}, {
      fogDensity:.0115,
      grade:{enabled:true, exposure:1.04, brightness:0, contrast:1.12, saturation:.97, gamma:1},
    }),
  });
  scene.template = {
    id:'fps-shooter-test',
    name:'FPS Shooter Test',
    version:6,
    nativeEditable:true,
    setting:'Blackpine Urban Training Facility',
    zones:Object.keys(GROUP).map(key => GROUP[key]),
    controls:{
      move:'WASD / left stick',
      sprint:'Shift / L3',
      jump:'Space / A',
      look:'Mouse / right stick',
      fire:'Left Mouse / RT',
      aim:'Right Mouse / LT',
      reload:'R / Y',
      crouch:'C toggles crouch  ·  Sprint stands you back up',
      walk:'X',
      dodge:'Double-tap Alt — slide when running, roll when walking',
      vaultMantle:'Space facing an obstacle',
      interact:'F tap  (doors, ladders, carry, deliver, climb a ledge)',
      ledgeHang:'Jump at a high ledge to catch it; A/D shuffle, W or Space pull up, Z drop',
      pickup:'Hold F to take  ·  drop / throw: hold G',
      swapWeapon:'Z or mouse wheel'  ,
      lean:'Q / E lean left and right around cover',
      viewToggle:'B  (first / third person)'  ,
      shoulderSwap:'V',
    },
    notes:'A practice yard behind the firing line teaches every Use verb within sight of the spawn: a crate to carry to a marked pad, a swing door, a ladder, a vault rail and a 2.9 m ledge that can only be taken by jumping, catching it and pulling up. Traversal course on the east side teaches vault, mantle, slide, climbable net, ladder, sliding door and a carry-and-deliver task; every weapon is an editable Logic Element with its own replaceable/animated model, ammo, respawn and Character action mapping, while medkits, armour and ammo remain lightweight item contracts. Covered staging bay with lockers, benches and lit briefing board; sandbag firing line; CQB village with stacked shipping containers, a walk-in two-room block house with window and breach openings, a wrecked car, tyre stacks and oil drums; long range with earth berms, target frames and a roofed watchtower; fenced perimeter with floodlight masts, razor wire and signage; a pine treeline, water tower and radio mast beyond the wall. Every surface names a material class, so colour, roughness and the procedural grain it wears are edited in one place. Twelve damageable targets from 10 m to 65 m. Player, targets and weapons are ordinary Logic Elements: duplicate, move or retune them like any other scene object.',
  };
  return scene;
}

window.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE = Object.freeze({
  id:'fps-shooter-test',
  name:'FPS Shooter Test',
  GROUPS:GROUP,
  MATERIALS:MAT,
  buildScene,
  // A level that extends this facility builds its own sectors through the same
  // builder, so one material language covers the whole map.
  createBuilder,
  GROUND_Y,
  ARENA_HALF_X,
  ARENA_MIN_Z,
  ARENA_MAX_Z,
});

if(window.LK_LEVEL_TEMPLATES && window.LK_LEVEL_TEMPLATES.register){
  window.LK_LEVEL_TEMPLATES.register({
    id:'fps-shooter-test', name:'FPS Shooter Test (First Person)', nameIt:'FPS Shooter Test (Prima persona)',
    category:'Shooter', order:300, ground:'plane', keepBuiltinPlayer:false,
    description:'First-person arena with cover, weapons, targets and the FPS HUD.',
    descriptionIt:'Arena in prima persona con coperture, armi, bersagli e HUD FPS.',
    build:function(scene){ return buildScene(scene); },
  });
}
})();
