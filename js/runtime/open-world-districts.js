/* =========================================================
   LOT KING - Open World districts

   The procedural ring that surrounds `models/sketchbook/world.glb`. The GLB
   stays byte-identical and keeps owning the centre cell; this module authors
   the EIGHT districts around it, their drivable ground, the road network that
   ties them back to the centre, and the curated points of interest that make
   each one recognisable from a distance.

   Layout, in reading order (the numbering below is that same order, so the
   outliner folders sort into the shape of the map). North is -Z, east is +X:

       01 Granite Spine   |  02 Windmark Ridge  |  03 Ochre Quarry
       04 Blackpine Forest|  05 DollBody Core   |  06 Meridian Downtown
       07 Saltglass Coast |  08 Ironport Docks  |  09 Cinder Flats

   05 is the untouched GLB. The other eight are generated from one seed and are
   editable end to end: every district owns a Logic Element whose exposed
   variables are its seed, size, density, theme, scatter budget and on/off
   switch, and every collidable surface it stands on is an ordinary editor
   entry in its own outliner folder.

   WHAT THE AAA REFERENCES CONTRIBUTED (see docs/OPEN_WORLD_DISTRICTS.md)
     - UE5 World Partition / "Streaming in Sunset Overdrive's Open World" (GDC):
       a fixed square cell grid, cell + neighbours resident, hierarchical LOD
       for everything beyond. CHUNK is that grid; DISTRICT_PITCH is a whole
       number of chunks so a district boundary is never mid-cell.
     - "GPU-Based Run-Time Procedural Placement in Horizon Zero Dawn"
       (J. van Muijden, GDC 2017): determinism and LOCAL STABILITY. Placement
       is a pure function of (seed, integer cell), never of traversal history,
       so a chunk that is unloaded and walked back into is identical and no
       placement state ever has to be saved.
     - "Fast Biome Blending, Without Squareness" (noiseposti.ng): normalised
       sparse convolution over JITTERED anchor points with a
       max(0, r^2 - d^2)^2 falloff. Blending district identity on the raw 3x3
       grid produces borders locked to 45/90 degrees - the exact "same terrain
       in nine squares" look this task exists to avoid. BIOME_ANCHOR_* below is
       that jittered lattice.
     - GTA V's Los Santos (48.15 km^2 land): districts read as different places
       because their PROGRAMME differs - hills, density, waterfront, industry -
       not because the ground texture changed.
     - Cameron Williams (GDC, open-world exploration): too many markers cause
       analysis paralysis. Each district therefore carries ONE silhouette
       landmark plus a small curated POI set, not a scattering of icons.

   HOW THIS FILE IS ORGANISED
     00  identity and extents
     01  districts        the ring, numbered in reading order
     02  palette          raw colours, named by what they are made of
     03  material classes every surface names a class, never a loose hex
     04  poi classes      what a point of interest is made of, per kind
     05  deterministic field  hash, noise, biome weights, height, roads
     06  scene authoring  entry factories and the per-district builders
     07  public registry
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;

// ====================================================== 00 identity and extents

const SCHEMA_VERSION = 1;
const SOURCE = 'Open World districts (native template)';

// The streaming grid. Every other extent below is a whole multiple of it, so a
// district edge, a road and a chunk boundary always coincide.
const CHUNK = 256;
// 11 chunks. The centre cell then measures 2816 m across, which covers the
// GLB's own ground plane (half-extent 1423.61) with 15.6 m to spare.
const DISTRICT_CHUNKS = 11;
const DISTRICT_PITCH = CHUNK * DISTRICT_CHUNKS;   // 2816
const DISTRICT_HALF = DISTRICT_PITCH / 2;         // 1408
const WORLD_HALF = DISTRICT_HALF * 3;             // 4224 -> 8448 m square
// Nothing generated may intrude on the GLB. Its ground plane reaches
// +/-1423.61; rounding up to 1424 keeps the generated apron strictly outside.
const CENTRE_KEEPOUT = 1424;
// The GLB is bottom-aligned by the editor loader, so its outer ground plane
// sits at y = 0 and its island rises to roughly y = 14.6. The ring therefore
// starts from 0 and reads as a continuation of that plain.
const CENTRE_APRON_Y = 0;

// Area headline used by the docs and by the manifest, in square metres.
const WORLD_AREA = (WORLD_HALF * 2) * (WORLD_HALF * 2);
const CENTRE_AREA = 2847.2265625 * 2847.2265625;

// ============================================================== 01 districts
//
// Declared and numbered in READING ORDER: north-west, north, north-east, then
// the middle row, then the south row. The outliner sorts folder labels as text,
// so the numbers are what keep the folders in map order rather than in
// whatever order a builder happened to run.
//
// `col`/`row` are grid coordinates with (1,1) at the centre. `base` is the
// district's ground plane above the GLB apron and `relief` is how far its
// terrain profile may climb above that. `terrain` names a profile in
// TERRAIN_PROFILES; an unknown name throws.

const GROUP = Object.freeze({
  network:    '00 Road Network',
  spine:      '01 Granite Spine',
  ridge:      '02 Windmark Ridge',
  quarry:     '03 Ochre Quarry',
  forest:     '04 Blackpine Forest',
  core:       '05 DollBody Core',
  downtown:   '06 Meridian Downtown',
  coast:      '07 Saltglass Coast',
  docks:      '08 Ironport Docks',
  flats:      '09 Cinder Flats',
  control:    '10 District Control',
});

function district(spec){ return Object.freeze(Object.assign({}, spec)); }

const DISTRICTS = Object.freeze([
  district({
    index:1, id:'granite-spine', name:'Granite Spine', nameIt:'Dorsale di Granito',
    group:GROUP.spine, col:0, row:0, native:false,
    terrain:'alpine', base:34, relief:210, seedSalt:10061,
    ground:'rock', ground2:'scree', weatherSurface:'rock',
    scatter:'alpine', scatterDensity:.72,
    fogTint:'#b7c6d2',
    summary:'Switchback pass, hanging snowfields and the highest lookout on the map.',
    pois:[
      {kind:'landmark', name:'Spine Summit Beacon', at:[-120, -260], height:74},
      {kind:'overlook', name:'Cold Saddle Overlook', at:[420, 160]},
      {kind:'helipad', name:'Spine Rescue Pad', at:[-540, 380]},
      {kind:'ramp', name:'Cornice Launch', at:[240, -560], heading:Math.PI},
      {kind:'depot', name:'Avalanche Station', at:[-680, -540]},
    ],
  }),
  district({
    index:2, id:'windmark-ridge', name:'Windmark Ridge', nameIt:'Cresta di Windmark',
    group:GROUP.ridge, col:1, row:0, native:false,
    terrain:'highland', base:22, relief:96, seedSalt:20147,
    ground:'moor', ground2:'moorDry', weatherSurface:'grass',
    scatter:'highland', scatterDensity:.55,
    fogTint:'#adbec6',
    summary:'A wind farm plateau with long gliding lines off the north escarpment.',
    pois:[
      {kind:'landmark', name:'Windmark Turbine Row', at:[0, -120], height:96},
      {kind:'overlook', name:'Escarpment Rail', at:[-360, -600]},
      {kind:'helipad', name:'Turbine Service Pad', at:[420, 120]},
      {kind:'circuit', name:'Ridge Loop', at:[-140, 520], radius:230},
      {kind:'shelter', name:'Windmark Bothy', at:[640, -300]},
    ],
  }),
  district({
    index:3, id:'ochre-quarry', name:'Ochre Quarry', nameIt:'Cava Ocra',
    group:GROUP.quarry, col:2, row:0, native:false,
    terrain:'terraced', base:12, relief:74, seedSalt:30211,
    ground:'gravelHaul', ground2:'gravelPale', weatherSurface:'rock',
    scatter:'quarry', scatterDensity:.34,
    fogTint:'#c0b0a0',
    summary:'Stepped haul benches around a flooded pit, with the crusher on the rim.',
    pois:[
      {kind:'landmark', name:'Crusher Tower', at:[380, 300], height:62},
      {kind:'overlook', name:'Bench Six Lookout', at:[-420, -420]},
      {kind:'helipad', name:'Quarry Survey Pad', at:[560, -520]},
      {kind:'ramp', name:'Spoil Heap Kicker', at:[-560, 460], heading:0},
      {kind:'depot', name:'Haul Road Depot', at:[-140, 620]},
    ],
  }),
  district({
    index:4, id:'blackpine-forest', name:'Blackpine Forest', nameIt:'Foresta di Blackpine',
    group:GROUP.forest, col:0, row:1, native:false,
    terrain:'rolling', base:8, relief:44, seedSalt:40277,
    ground:'turf', ground2:'forestFloor', weatherSurface:'grass',
    scatter:'forest', scatterDensity:1,
    fogTint:'#9fb0a4',
    summary:'The densest canopy on the map, a logging camp and a fire tower above it.',
    pois:[
      {kind:'landmark', name:'Blackpine Fire Tower', at:[-260, -180], height:44},
      {kind:'overlook', name:'Clearcut Vista', at:[380, -560]},
      {kind:'helipad', name:'Forestry Pad', at:[-560, 420]},
      {kind:'depot', name:'Blackpine Logging Camp', at:[220, 300]},
      {kind:'ramp', name:'Skid Trail Jump', at:[560, 560], heading:-Math.PI / 2},
    ],
  }),
  district({
    index:5, id:'dollbody-core', name:'DollBody Core', nameIt:'Nucleo DollBody',
    group:GROUP.core, col:1, row:1, native:true,
    terrain:'native', base:CENTRE_APRON_Y, relief:0, seedSalt:0,
    ground:'asphalt', ground2:'asphalt', weatherSurface:'asphalt',
    scatter:'none', scatterDensity:0,
    fogTint:'#a8bbc2',
    summary:'The unmodified source world. Nothing in this module writes inside it.',
    pois:[],
  }),
  district({
    index:6, id:'meridian-downtown', name:'Meridian Downtown', nameIt:'Centro Meridian',
    group:GROUP.downtown, col:2, row:1, native:false,
    terrain:'plateau', base:4, relief:12, seedSalt:60331,
    ground:'asphalt', ground2:'plaza', weatherSurface:'asphalt',
    scatter:'city', scatterDensity:.85,
    fogTint:'#9fb0bd',
    summary:'A block grid of towers with rooftop helipads and a lit central plaza.',
    pois:[
      {kind:'landmark', name:'Meridian Spire', at:[-40, -60], height:168},
      {kind:'overlook', name:'Plaza Terrace', at:[300, 240]},
      {kind:'helipad', name:'Spire Rooftop Pad', at:[-40, 220], elevated:64},
      {kind:'circuit', name:'Downtown Block Circuit', at:[420, -420], radius:280},
      {kind:'depot', name:'Meridian Transit Yard', at:[-520, 520]},
    ],
  }),
  district({
    index:7, id:'saltglass-coast', name:'Saltglass Coast', nameIt:'Costa di Saltglass',
    group:GROUP.coast, col:0, row:2, native:false,
    terrain:'shore', base:-3, relief:26, seedSalt:70369,
    ground:'beach', ground2:'turf', weatherSurface:'sand',
    scatter:'coast', scatterDensity:.42,
    fogTint:'#b4c6cc',
    summary:'Beach, low cliffs and a lighthouse that is visible from the whole south-west.',
    pois:[
      {kind:'landmark', name:'Saltglass Lighthouse', at:[-520, 300], height:58},
      {kind:'overlook', name:'Cliff Path Overlook', at:[-260, -420]},
      {kind:'helipad', name:'Coastguard Pad', at:[-420, 560]},
      {kind:'airstrip', name:'Saltglass Beach Strip', at:[380, 200], heading:0, length:640},
      {kind:'shelter', name:'Boardwalk Kiosk', at:[120, 520]},
    ],
  }),
  district({
    index:8, id:'ironport-docks', name:'Ironport Docks', nameIt:'Porto di Ironport',
    group:GROUP.docks, col:1, row:2, native:false,
    terrain:'flat', base:1, relief:6, seedSalt:80429,
    ground:'dockApron', ground2:'asphalt', weatherSurface:'concrete',
    scatter:'docks', scatterDensity:.6,
    fogTint:'#9aa8b0',
    summary:'Container stacks under gantry cranes, straight quays and a ferry ramp.',
    pois:[
      {kind:'landmark', name:'Ironport Gantry Crane', at:[-160, 60], height:78},
      {kind:'overlook', name:'Quay Head Platform', at:[420, 480]},
      {kind:'helipad', name:'Harbourmaster Pad', at:[-520, -360]},
      {kind:'depot', name:'Ironport Container Yard', at:[240, -300]},
      {kind:'ramp', name:'Ferry Ramp', at:[560, 140], heading:Math.PI / 2},
    ],
  }),
  district({
    index:9, id:'cinder-flats', name:'Cinder Flats', nameIt:'Distesa di Cinder',
    group:GROUP.flats, col:2, row:2, native:false,
    terrain:'dunes', base:6, relief:38, seedSalt:90487,
    ground:'dune', ground2:'saltPan', weatherSurface:'sand',
    scatter:'desert', scatterDensity:.3,
    fogTint:'#c9bda6',
    summary:'Salt pan and dunes around a mesa, with the longest runway on the map.',
    pois:[
      {kind:'landmark', name:'Cinder Mesa Mast', at:[-300, -260], height:86},
      {kind:'overlook', name:'Mesa Rim Overlook', at:[-300, 60]},
      {kind:'helipad', name:'Flats Fuel Pad', at:[520, 480]},
      {kind:'airstrip', name:'Cinder Flats Runway', at:[220, 300], heading:Math.PI / 2, length:840},
      {kind:'ramp', name:'Dune Kicker', at:[-560, 540], heading:Math.PI},
    ],
  }),
]);

const DISTRICT_IDS = Object.freeze(DISTRICTS.map(item => item.id));
const DISTRICT_BY_ID = new Map(DISTRICTS.map(item => [item.id, item]));
const RING_DISTRICTS = Object.freeze(DISTRICTS.filter(item => !item.native));

/** An unknown district name is a typo, and a typo that silently resolves to a
 *  default puts a forest in the desert. Every lookup in this module throws. */
function districtOf(id){
  const found = DISTRICT_BY_ID.get(String(id));
  if(!found) throw new Error('Open World districts: unknown district "' + id + '"');
  return found;
}

function districtCentreX(item){ return (item.col - 1) * DISTRICT_PITCH; }
function districtCentreZ(item){ return (item.row - 1) * DISTRICT_PITCH; }

// ================================================================ 02 palette
// Named by what the surface is made of, not by where it is used, so the same
// grey can be quarry gravel and dock apron without being copied twice.

const COLOR = Object.freeze({
  // rock and mountain
  granite:0x6d7480, graniteDark:0x525865, scree:0x7d8189, snowCap:0xdfe7ee,
  // highland and forest
  moor:0x5d6b4c, moorDry:0x77794f, pineCanopy:0x28402f, pineCanopyDark:0x1d3024,
  bark:0x453528, loam:0x4b4032,
  // quarry and industry
  ochre:0x8a6a44, ochrePale:0xa78a5f, crusherSteel:0x6b6f76, rustSteel:0x7a4b33,
  // city
  asphalt:0x393e45, kerb:0x9aa0a6, towerGlass:0x2c3a48, towerConcrete:0x6a6f77,
  plazaStone:0x878b90, signGlow:0xffd9a0,
  // coast and water
  beachSand:0xc4b189, seaShallow:0x2f5e6b, seaDeep:0x1d3d4c, cliffChalk:0x9a9a8f,
  // docks
  dockConcrete:0x7b8086, containerRed:0xa85a4a, containerBlue:0x6f9cba, containerSand:0xa48f5c,
  // desert
  duneSand:0xc9ac74, saltPan:0xd8d2c0, mesaRock:0x9a6f4d,
  // shared hardware
  steel:0x59616a, steelDark:0x363d48, steelPale:0x79828f, paintWhite:0xc9cfd6,
  paintYellow:0xc3a747, markerRed:0xb44239, lampGlow:0xffe6b0,
});

// ======================================================= 03 material classes
//
// One table, one entry per surface identity: colour, PBR response, which
// procedural surface it wears (js/engine/procedural-surfaces.js), how many
// metres one texture tile covers, the footstep material a body standing on it
// should play, and the weather-system surface family that decides how much
// grip it loses in the rain. Nothing below this table carries a loose hex
// except the handful of one-off accents that pass a raw number on purpose.

const SURFACE_VARIANTS = 3;

function material(color, roughness, metalness, surface, tile, foot, weather, strength){
  return Object.freeze({color, roughness, metalness, surface, tile, foot, weather, strength});
}

const MAT = Object.freeze({
  // -- ground, in the order the districts are numbered
  rock:          material(COLOR.granite,      .96, .02, 'snowRock',        7,   'rock',     'rock',     .6),
  rockDark:      material(COLOR.graniteDark,  .97, .02, 'snowRock',        6,   'rock',     'rock',     .55),
  scree:         material(COLOR.scree,        .97, 0,   'gravel',          4,   'gravel',   'rock',     .6),
  snowCap:       material(COLOR.snowCap,      .78, 0,   'snowPacked',      8,   'snow',     'snow',     .4),
  moor:          material(COLOR.moor,         .97, 0,   'turf',            6,   'grass',    'grass',    .5),
  moorDry:       material(COLOR.moorDry,      .97, 0,   'turf',            5,   'grass',    'grass'),
  gravelHaul:    material(COLOR.ochre,        .97, 0,   'gravel',          3,   'gravel',   'rock',     .65),
  gravelPale:    material(COLOR.ochrePale,    .96, 0,   'gravel',          4,   'gravel',   'rock'),
  forestFloor:   material(COLOR.loam,         .99, 0,   'dirt',            5,   'dirt',     'dirt',     .55),
  turf:          material(COLOR.moor,         .96, 0,   'turf',            6,   'grass',    'grass',    .5),
  asphalt:       material(COLOR.asphalt,      .92, .02, 'asphalt',         6,   'asphalt',  'asphalt',  .45),
  plaza:         material(COLOR.plazaStone,   .90, .02, 'concreteSmooth',  5,   'concrete', 'concrete'),
  beach:         material(COLOR.beachSand,    .98, 0,   'sand',            5,   'sand',     'sand',     .45),
  seaShallow:    material(COLOR.seaShallow,   .14, .18, null,              0,   'water',    'ice'),
  seaDeep:       material(COLOR.seaDeep,      .10, .22, null,              0,   'water',    'ice'),
  dockApron:     material(COLOR.dockConcrete, .93, .02, 'concrete',        6,   'concrete', 'concrete', .5),
  dune:          material(COLOR.duneSand,     .98, 0,   'sand',            6,   'sand',     'sand',     .5),
  saltPan:       material(COLOR.saltPan,      .88, 0,   'concreteSmooth',  8,   'concrete', 'concrete', .3),
  mesa:          material(COLOR.mesaRock,     .96, .02, 'snowRock',        6,   'rock',     'rock',     .55),
  // -- roads and markings
  roadTop:       material(COLOR.asphalt,      .90, .03, 'asphalt',         8,   'asphalt',  'asphalt',  .4),
  roadShoulder:  material(COLOR.ochrePale,    .97, 0,   'gravel',          3,   'gravel',   'dirt'),
  kerb:          material(COLOR.kerb,         .92, .02, 'concrete',        2,   'concrete', 'concrete'),
  laneWhite:     material(COLOR.paintWhite,   .62, 0,   null,              0,   'asphalt',  'asphalt'),
  laneYellow:    material(COLOR.paintYellow,  .62, 0,   null,              0,   'asphalt',  'asphalt'),
  // -- structure
  concrete:      material(COLOR.towerConcrete,.94, .02, 'concrete',        4,   'concrete', 'concrete'),
  brickWall:     material(COLOR.rustSteel,    .95, 0,   'brick',           2.4, 'concrete', 'concrete'),
  towerGlass:    material(COLOR.towerGlass,   .10, .18, null,              0,   'marble',   'concrete'),
  timber:        material(COLOR.bark,         .92, 0,   'wood',            1.8, 'wood',     'dirt'),
  plank:         material(0x7d6444,           .88, 0,   'plywood',         1.2, 'wood',     'dirt'),
  // -- metal. Paint is a dielectric: only bare or galvanised steel earns a
  //    high metalness, everything painted reads as steel through roughness.
  steel:         material(COLOR.steel,        .55, .12, 'metalPainted',    1.6, 'metal',    'concrete'),
  steelDark:     material(COLOR.steelDark,    .60, .15, 'metalPainted',    1.6, 'metal',    'concrete'),
  steelPale:     material(COLOR.steelPale,    .42, .55, 'metalPainted',    1.4, 'metal',    'concrete'),
  steelRust:     material(COLOR.rustSteel,    .90, .08, 'metalRusted',     1.4, 'metal',    'concrete'),
  tread:         material(COLOR.steel,        .52, .35, 'metalTread',       .6, 'metal',    'concrete'),
  corrugated:    material(COLOR.crusherSteel, .70, .10, 'metalCorrugated', 2.4, 'metal',    'concrete'),
  containerRed:  material(COLOR.containerRed, .62, .12, 'metalCorrugated', 2.4, 'metal',    'concrete'),
  containerBlue: material(COLOR.containerBlue,.62, .12, 'metalCorrugated', 2.4, 'metal',    'concrete'),
  containerSand: material(COLOR.containerSand,.64, .12, 'metalCorrugated', 2.4, 'metal',    'concrete'),
  // -- vegetation, used by the streamed scatter as well as by authored dressing
  canopy:        material(COLOR.pineCanopy,   .96, 0,   null,              0,   'grass',    'grass'),
  canopyDark:    material(COLOR.pineCanopyDark,.96, 0,  null,              0,   'grass',    'grass'),
  bark:          material(COLOR.bark,         .94, 0,   'wood',            1.4, 'wood',     'dirt'),
});

function materialOf(name){
  if(typeof name === 'number') return {color:name, roughness:.92, metalness:0, surface:null, tile:0, foot:'concrete', weather:'concrete'};
  const found = MAT[name];
  if(!found) throw new Error('Open World districts: unknown material class "' + name + '"');
  return found;
}

// The ground ladder each terrain profile paints with, resolved by class name so
// a district says "rock" and gets rock everywhere it is used.
function groundMaterialOf(item, secondary){
  return materialOf(secondary ? item.ground2 : item.ground);
}

// ============================================================ 04 poi classes
//
// A point of interest is a small named recipe, not a random cluster. The kinds
// are ordered by what they are FOR, because that is how an author picks one:
// something to see from far away, something to stand on, something to land on,
// something to drive at.

const POI_KINDS = Object.freeze({
  landmark: {label:'Landmark',  labelIt:'Punto di riferimento', silhouette:true,  pawns:'all',        marker:'primary'},
  overlook: {label:'Overlook',  labelIt:'Belvedere',            silhouette:false, pawns:'character',  marker:'secondary'},
  helipad:  {label:'Helipad',   labelIt:'Elisuperficie',        silhouette:false, pawns:'helicopter', marker:'secondary'},
  airstrip: {label:'Airstrip',  labelIt:'Pista',                silhouette:false, pawns:'airplane',   marker:'secondary'},
  ramp:     {label:'Ramp',      labelIt:'Rampa',                silhouette:false, pawns:'car',        marker:'secondary'},
  circuit:  {label:'Circuit',   labelIt:'Circuito',             silhouette:false, pawns:'car',        marker:'secondary'},
  depot:    {label:'Depot',     labelIt:'Deposito',             silhouette:false, pawns:'character',  marker:'secondary'},
  shelter:  {label:'Shelter',   labelIt:'Rifugio',              silhouette:false, pawns:'character',  marker:'secondary'},
});
const POI_IDS = Object.freeze(Object.keys(POI_KINDS));

function poiKindOf(kind){
  const found = POI_KINDS[String(kind)];
  if(!found) throw new Error('Open World districts: unknown POI kind "' + kind + '"');
  return found;
}

// ==================================================== 05 deterministic field
//
// Everything below is a pure function of (seed, position). No traversal state,
// no stored RNG cursor: this is the "local stability" rule from the Horizon
// Zero Dawn placement talk, and it is what lets the streaming system throw a
// chunk away and rebuild it bit-identical later.

function hash2i(seed, ix, iz){
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1274126177);
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function smoothstep(t){ return t * t * (3 - 2 * t); }

function valueNoise(seed, x, z){
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smoothstep(x - ix), fz = smoothstep(z - iz);
  const a = hash2i(seed, ix, iz);
  const b = hash2i(seed, ix + 1, iz);
  const c = hash2i(seed, ix, iz + 1);
  const d = hash2i(seed, ix + 1, iz + 1);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}

function fbm(seed, x, z, octaves){
  let amplitude = 1, frequency = 1, sum = 0, norm = 0;
  for(let octave = 0; octave < octaves; octave++){
    sum += valueNoise(seed + octave * 7919, x * frequency, z * frequency) * amplitude;
    norm += amplitude;
    amplitude *= .5;
    frequency *= 2.03;
  }
  return sum / norm;
}

function ridged(seed, x, z, octaves){
  return 1 - Math.abs(fbm(seed, x, z, octaves) * 2 - 1);
}

// -- terrain profiles -------------------------------------------------------
// One per district `terrain` value. Each returns a height ABOVE the district
// base, in the range [0, relief]. `u`/`v` are metres from the district centre,
// so a profile can build a pit, a mesa or a shoreline where it wants one.

const TERRAIN_PROFILES = Object.freeze({
  native(){ return 0; },
  flat(item, u, v, seed){
    return fbm(seed, u / 620, v / 620, 2) * item.relief;
  },
  plateau(item, u, v, seed){
    const rim = Math.min(1, Math.max(0, (Math.max(Math.abs(u), Math.abs(v)) - 700) / 620));
    return (fbm(seed, u / 540, v / 540, 3) * .35 + rim * .65) * item.relief;
  },
  rolling(item, u, v, seed){
    return (fbm(seed, u / 430, v / 430, 4) * .78 + fbm(seed + 31, u / 150, v / 150, 2) * .22) * item.relief;
  },
  highland(item, u, v, seed){
    // A plateau that falls away on its north edge, which is what makes the
    // escarpment worth gliding off.
    const fall = Math.min(1, Math.max(0, (-v - 420) / 720));
    const body = fbm(seed, u / 500, v / 500, 4);
    return (body * .7 + .3) * (1 - fall * .92) * item.relief;
  },
  alpine(item, u, v, seed){
    const spine = ridged(seed, u / 780, v / 780, 5);
    const detail = fbm(seed + 17, u / 210, v / 210, 3);
    const falloff = Math.max(0, 1 - Math.hypot(u, v) / (DISTRICT_HALF * 1.15));
    return Math.pow(spine * .82 + detail * .18, 1.35) * falloff * item.relief;
  },
  terraced(item, u, v, seed){
    // Benches: the pit is a cone cut into a noisy rim, quantised into steps.
    const pit = Math.min(1, Math.hypot(u - 40, v - 40) / 760);
    const raw = (pit * .8 + fbm(seed, u / 480, v / 480, 3) * .2);
    const steps = 6;
    return (Math.round(raw * steps) / steps) * item.relief - item.relief * .34;
  },
  shore(item, u, v, seed){
    // Water to the south-west, sand, then a low cliff inland. `shoreT` runs 0
    // at the wet edge to 1 at the cliff top along the district diagonal.
    const diagonal = (u + v) / (DISTRICT_HALF * 2);
    const shoreT = Math.min(1, Math.max(0, (diagonal + .55) / 1.1));
    const cliff = smoothstep(Math.min(1, Math.max(0, (shoreT - .52) / .3)));
    return (cliff * .86 + fbm(seed, u / 380, v / 380, 3) * .14) * item.relief - item.relief * .22;
  },
  dunes(item, u, v, seed){
    const mesa = Math.max(0, 1 - Math.hypot(u + 300, v + 160) / 300);
    const crest = Math.abs(Math.sin((u * .0062) + fbm(seed, u / 700, v / 700, 3) * 3.1));
    return (crest * .42 + smoothstep(Math.min(1, mesa * 1.6)) * .58) * item.relief;
  },
});

function terrainProfileOf(name){
  const found = TERRAIN_PROFILES[String(name)];
  if(!found) throw new Error('Open World districts: unknown terrain profile "' + name + '"');
  return found;
}

// -- jittered biome anchors -------------------------------------------------
//
// Blending district identity straight off the 3x3 grid gives borders locked to
// 45 and 90 degrees. The fix (noiseposti.ng, "Fast Biome Blending, Without
// Squareness") is normalised sparse convolution over jittered anchor points:
// each district contributes ANCHOR_SUBDIV^2 anchors, each pushed off its lattice
// slot by a hash, and the weight of an anchor falls off as
// max(0, r^2 - d^2)^2. Only the 3x3 anchor cells around a sample can reach it,
// so the whole thing costs nine hashes and never allocates.

const ANCHOR_SUBDIV = 3;
const ANCHOR_PITCH = DISTRICT_PITCH / ANCHOR_SUBDIV;         // 938.67
const ANCHOR_RADIUS = ANCHOR_PITCH * 1.34;
const ANCHOR_RADIUS2 = ANCHOR_RADIUS * ANCHOR_RADIUS;
const ANCHOR_JITTER = ANCHOR_PITCH * .34;
const ANCHOR_MIN = -ANCHOR_SUBDIV;                            // grid index range
const ANCHOR_MAX = ANCHOR_SUBDIV * 2 - 1;

// Shared scratch. `weights[i]` is the blend weight of DISTRICTS[i] at the last
// sampled position. Callers read it immediately; nothing here allocates.
const WEIGHT_SCRATCH = new Float64Array(DISTRICTS.length);

function anchorDistrictIndex(ai, aj){
  const col = Math.min(2, Math.max(0, Math.floor((ai + ANCHOR_SUBDIV) / ANCHOR_SUBDIV) - 1 + 1));
  const row = Math.min(2, Math.max(0, Math.floor((aj + ANCHOR_SUBDIV) / ANCHOR_SUBDIV) - 1 + 1));
  for(let index = 0; index < DISTRICTS.length; index++){
    const item = DISTRICTS[index];
    if(item.col === col && item.row === row) return index;
  }
  throw new Error('Open World districts: no district at grid ' + col + ',' + row);
}

// The anchor grid is small and fixed, so its district lookup is resolved once
// instead of on every terrain vertex.
const ANCHOR_INDEX = (function(){
  const span = ANCHOR_MAX - ANCHOR_MIN + 1;
  const table = new Int32Array(span * span);
  for(let aj = ANCHOR_MIN; aj <= ANCHOR_MAX; aj++){
    for(let ai = ANCHOR_MIN; ai <= ANCHOR_MAX; ai++){
      table[(aj - ANCHOR_MIN) * span + (ai - ANCHOR_MIN)] = anchorDistrictIndex(ai, aj);
    }
  }
  table.span = span;
  return table;
})();

function anchorIndexAt(ai, aj){
  const span = ANCHOR_MAX - ANCHOR_MIN + 1;
  const ci = Math.min(ANCHOR_MAX, Math.max(ANCHOR_MIN, ai));
  const cj = Math.min(ANCHOR_MAX, Math.max(ANCHOR_MIN, aj));
  return ANCHOR_INDEX[(cj - ANCHOR_MIN) * span + (ci - ANCHOR_MIN)];
}

/** Normalised district weights at (x,z), written into the shared scratch.
 *  Returns the scratch so a caller can read it in the same expression. */
function biomeWeightsAt(x, z, seed){
  const weights = WEIGHT_SCRATCH;
  for(let index = 0; index < weights.length; index++) weights[index] = 0;
  const gx = Math.floor((x + WORLD_HALF) / ANCHOR_PITCH);
  const gz = Math.floor((z + WORLD_HALF) / ANCHOR_PITCH);
  let total = 0;
  for(let dj = -1; dj <= 1; dj++){
    for(let di = -1; di <= 1; di++){
      const ai = gx + di, aj = gz + dj;
      const jx = (hash2i(seed | 0, ai, aj) - .5) * 2 * ANCHOR_JITTER;
      const jz = (hash2i((seed | 0) + 4241, ai, aj) - .5) * 2 * ANCHOR_JITTER;
      const ax = (ai + .5) * ANCHOR_PITCH - WORLD_HALF + jx;
      const az = (aj + .5) * ANCHOR_PITCH - WORLD_HALF + jz;
      const dx = x - ax, dz = z - az;
      const d2 = dx * dx + dz * dz;
      if(d2 >= ANCHOR_RADIUS2) continue;
      const falloff = ANCHOR_RADIUS2 - d2;
      const weight = falloff * falloff;
      weights[anchorIndexAt(ai - ANCHOR_SUBDIV, aj - ANCHOR_SUBDIV)] += weight;
      total += weight;
    }
  }
  if(total <= 0){
    // Outside every anchor's reach only happens past the world edge; fall back
    // to the nearest district cell rather than inventing a tenth biome.
    weights[nearestDistrictIndex(x, z)] = 1;
    return weights;
  }
  const inverse = 1 / total;
  for(let index = 0; index < weights.length; index++) weights[index] *= inverse;
  return weights;
}

function nearestDistrictIndex(x, z){
  const col = Math.min(2, Math.max(0, Math.round(x / DISTRICT_PITCH) + 1));
  const row = Math.min(2, Math.max(0, Math.round(z / DISTRICT_PITCH) + 1));
  for(let index = 0; index < DISTRICTS.length; index++){
    if(DISTRICTS[index].col === col && DISTRICTS[index].row === row) return index;
  }
  throw new Error('Open World districts: no district at grid ' + col + ',' + row);
}

/** The district a position belongs to, by cell. Used for markers and for the
 *  "which folder does this entry live in" question, never for blending. */
function districtAt(x, z){ return DISTRICTS[nearestDistrictIndex(x, z)]; }

// -- road network -----------------------------------------------------------
//
// One orbital loop and four radial spokes. The loop is the square of half-size
// DISTRICT_PITCH, which passes exactly through all eight ring district centres,
// so every district hub is ON the ring road and the map reads at a glance. The
// spokes run along x=0 and z=0 from the centre keepout out to the loop.

const ROAD_HALF_WIDTH = 9;          // 18 m carriageway
const ROAD_CORRIDOR = 34;           // metres of graded shoulder either side
const ROAD_LOOP_RADIUS = DISTRICT_PITCH;

/** Chebyshev-style distance from the road centre line, in metres.
 *  Negative results are clamped to 0 by the caller. */
function roadDistance(x, z){
  const ax = Math.abs(x), az = Math.abs(z);
  // orbital loop: the square |x| = R or |z| = R, bounded by the other axis
  let best = Infinity;
  if(az <= ROAD_LOOP_RADIUS) best = Math.min(best, Math.abs(ax - ROAD_LOOP_RADIUS));
  if(ax <= ROAD_LOOP_RADIUS) best = Math.min(best, Math.abs(az - ROAD_LOOP_RADIUS));
  if(ax > ROAD_LOOP_RADIUS && az > ROAD_LOOP_RADIUS){
    best = Math.min(best, Math.hypot(ax - ROAD_LOOP_RADIUS, az - ROAD_LOOP_RADIUS));
  }
  // radial spokes, from the GLB keepout out to the loop
  if(ax <= ROAD_LOOP_RADIUS && az >= CENTRE_KEEPOUT - ROAD_CORRIDOR) best = Math.min(best, ax);
  if(az <= ROAD_LOOP_RADIUS && ax >= CENTRE_KEEPOUT - ROAD_CORRIDOR) best = Math.min(best, az);
  return best;
}

/** How strongly the road grade owns the terrain here: 1 on the carriageway,
 *  easing to 0 at the edge of the graded corridor. */
function roadCorridorWeight(x, z){
  const distance = roadDistance(x, z);
  if(distance >= ROAD_CORRIDOR) return 0;
  if(distance <= ROAD_HALF_WIDTH) return 1;
  return 1 - smoothstep((distance - ROAD_HALF_WIDTH) / (ROAD_CORRIDOR - ROAD_HALF_WIDTH));
}

/** The graded road surface height: the blended district BASE elevations with
 *  no relief at all, so the carriageway is smooth wherever it runs and the
 *  gradient between two districts is the difference of their bases spread over
 *  a whole cell (34 m over 2816 m at the very worst - about 1.2%). */
function roadPlaneY(x, z, seed){
  const weights = biomeWeightsAt(x, z, seed);
  let y = 0;
  for(let index = 0; index < weights.length; index++){
    if(weights[index] > 0) y += weights[index] * DISTRICTS[index].base;
  }
  return y;
}

// -- height field -----------------------------------------------------------

/** Ground height at (x,z) for the generated ring. Inside the GLB keepout this
 *  returns the apron level and generates nothing: the source world owns that
 *  ground and this module never writes over it. */
function heightAt(x, z, seed){
  if(Math.max(Math.abs(x), Math.abs(z)) < CENTRE_KEEPOUT) return CENTRE_APRON_Y;
  const weights = biomeWeightsAt(x, z, seed);
  let height = 0;
  for(let index = 0; index < weights.length; index++){
    const weight = weights[index];
    if(weight <= 0) continue;
    const item = DISTRICTS[index];
    const profile = terrainProfileOf(item.terrain);
    const u = x - districtCentreX(item);
    const v = z - districtCentreZ(item);
    height += weight * (item.base + profile(item, u, v, (seed | 0) + item.seedSalt));
  }
  const corridor = roadCorridorWeight(x, z);
  if(corridor > 0) height += (roadPlaneY(x, z, seed) - height) * corridor;
  return height;
}

/** The dominant district at (x,z) by blend weight, plus its weight. Written
 *  into a caller-owned two-slot array to keep the hot path allocation-free. */
const DOMINANT_SCRATCH = [0, 0];
function dominantAt(x, z, seed){
  const weights = biomeWeightsAt(x, z, seed);
  let best = 0, bestWeight = -1;
  for(let index = 0; index < weights.length; index++){
    if(weights[index] > bestWeight){ bestWeight = weights[index]; best = index; }
  }
  DOMINANT_SCRATCH[0] = best;
  DOMINANT_SCRATCH[1] = bestWeight;
  return DOMINANT_SCRATCH;
}

// ========================================================= 06 scene authoring
//
// From here down everything produces ordinary editor entries. The rule is that
// a surface a pawn can stand on, drive on or land on is AUTHORED here, so it
// enters the Cannon static set exactly once and never churns it; the visual
// density on top of it is streamed (js/runtime/open-world-streaming.js) and
// carries no collision at all. That split is what keeps a nine-times-larger
// world from rebuilding its physics world every time the player crosses a
// chunk line.

const TERRAIN_TILES = 6;                    // per district edge -> 36 proxies
const TERRAIN_TILE_SIZE = DISTRICT_PITCH / TERRAIN_TILES;

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  const enabled = src.enabled && typeof src.enabled === 'object' ? src.enabled : null;
  const config = {
    schemaVersion:SCHEMA_VERSION,
    seed:Number.isFinite(Number(src.seed)) ? (Number(src.seed) | 0) : 1337,
    // Global multipliers an author can pull down on a weak machine without
    // editing a single district.
    density:clamp01(src.density == null ? 1 : src.density),
    poiDensity:clamp01(src.poiDensity == null ? 1 : src.poiDensity),
    roads:src.roads !== false,
    terrainProxies:src.terrainProxies !== false,
    districts:{},
  };
  RING_DISTRICTS.forEach(item => {
    const patch = src.districts && src.districts[item.id] ? src.districts[item.id] : {};
    config.districts[item.id] = {
      enabled:enabled ? enabled[item.id] !== false : patch.enabled !== false,
      seed:Number.isFinite(Number(patch.seed)) ? (Number(patch.seed) | 0) : config.seed + item.seedSalt,
      density:clamp01(patch.density == null ? item.scatterDensity : patch.density),
      theme:patch.theme ? String(patch.theme) : item.scatter,
    };
  });
  return config;
}

function clamp01(value){
  value = Number(value);
  if(!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Author every generated entry into `scene.added` and return the manifest the
 *  level template stores under `scene.openWorld`. */
function buildEntries(scene, rawConfig){
  const config = normalizeConfig(rawConfig);
  const added = scene.added || (scene.added = []);
  const manifest = {
    schemaVersion:SCHEMA_VERSION,
    seed:config.seed,
    chunk:CHUNK,
    pitch:DISTRICT_PITCH,
    worldHalf:WORLD_HALF,
    centreKeepout:CENTRE_KEEPOUT,
    areaSquareMetres:WORLD_AREA,
    centreAreaSquareMetres:CENTRE_AREA,
    growthFactor:Number((WORLD_AREA / CENTRE_AREA).toFixed(2)),
    districts:[],
    entries:0,
  };

  let seq = 0;
  function nextId(){ return 'ow_' + String(++seq).padStart(4, '0'); }

  // ---- entry factories --------------------------------------------------
  // `spec` is a material class name from MAT, or a raw colour for a one-off.
  function add(name, prim, position, scale, spec, collide, options){
    const opts = options || {};
    const mat = materialOf(spec);
    const props = Object.assign({
      color:mat.color,
      roughness:mat.roughness == null ? .92 : mat.roughness,
      metalness:mat.metalness == null ? 0 : mat.metalness,
      centered:true,
    }, opts.props || {});
    if(opts.castShadow === false) props.castShadow = false;
    if(mat.surface && props.materialModel !== 'unlit' && opts.surfaceTexture !== false){
      props.surfaceTexture = Object.assign(
        {kind:mat.surface, tile:mat.tile || 2},
        mat.strength != null ? {strength:mat.strength} : null,
        opts.seed != null ? {seed:Math.abs(Math.round(opts.seed)) % SURFACE_VARIANTS} : null,
        opts.surfaceTexture || null);
    }
    added.push({
      id:nextId(),
      kind:'primitive',
      prim,
      name,
      collide:collide === true,
      driveSurface:opts.driveSurface === true,
      surface:opts.surface || mat.foot || undefined,
      weatherSurface:opts.weatherSurface || mat.weather || undefined,
      props,
      t:{p:position.slice(), r:(opts.rotation || [0, 0, 0]).slice(), s:scale.slice(), v:opts.visible !== false},
      asset:{key:'primitive:' + prim, name, source:SOURCE},
      templateGroup:opts.group,
      openWorld:opts.meta || undefined,
    });
    manifest.entries++;
  }
  // Primitive scales are half-extents; authoring in metres keeps the numbers
  // readable and matches what the inspector shows as size.
  function box(name, position, size, spec, collide, options){
    add(name, 'box', position, [size[0] / 2, size[1] / 2, size[2] / 2], spec, collide === true, options);
  }
  function slab(name, position, size, spec, options){
    box(name, position, size, spec, true, Object.assign({driveSurface:true, castShadow:false}, options));
  }
  function cylinder(name, position, radius, height, spec, collide, options){
    add(name, 'cylinder', position, [radius, height / 2, radius], spec, collide, options);
  }
  function cone(name, position, radius, height, spec, collide, options){
    add(name, 'cone', position, [radius, height / 2, radius], spec, collide, options);
  }
  function glow(name, position, size, color, options){
    box(name, position, size, color, false, Object.assign({}, options, {
      castShadow:false,
      props:Object.assign({materialModel:'unlit'}, (options || {}).props || {}),
    }));
  }
  function light(name, position, props, group){
    added.push({
      id:nextId(),
      kind:'light',
      light:'point',
      name,
      props:Object.assign({color:0xffdcae, intensity:1400, intensityUnit:'candela', distance:180}, props || {}),
      t:{p:position.slice(), r:[0, 0, 0], s:[1, 1, 1], v:true},
      templateGroup:group,
    });
    manifest.entries++;
  }

  // ---- 00 road network ---------------------------------------------------
  if(config.roads) buildRoadNetwork();

  // ---- 01..09 districts, in reading order --------------------------------
  DISTRICTS.forEach(item => {
    if(item.native){
      manifest.districts.push(describeDistrict(item, config, true));
      return;
    }
    const settings = config.districts[item.id];
    buildDistrictControl(item, settings);
    if(settings.enabled){
      if(config.terrainProxies) buildTerrainProxies(item, settings);
      buildDistrictHub(item, settings);
      buildPois(item, settings, config);
    }
    manifest.districts.push(describeDistrict(item, config, false));
  });

  // ---- world edge --------------------------------------------------------
  buildWorldEdge();

  return manifest;

  // -------------------------------------------------------- road network
  function buildRoadNetwork(){
    const g = GROUP.network;
    const SEGMENT = 352;                       // 1.375 chunks, 16 per loop side
    const seed = config.seed;

    function carriageway(name, cx, cz, alongX, length, index){
      const y = roadPlaneY(cx, cz, seed);
      const size = alongX ? [length, 1.2, ROAD_HALF_WIDTH * 2] : [ROAD_HALF_WIDTH * 2, 1.2, length];
      slab(name, [cx, y, cz], size, 'roadTop', {group:g, seed:index, surface:'asphalt'});
      // Painted centre line, lit like everything else rather than emissive.
      const line = alongX ? [length - 6, .06, .34] : [.34, .06, length - 6];
      box(name + ' Centre Line', [cx, y + .64, cz], line, 'laneWhite', false, {group:g, castShadow:false});
      // One gravel roadbed wider than the carriageway rather than two separate
      // shoulder strips: the join between tarmac and terrain is never a knife
      // edge, this is the band the terrain grade eases across, and it costs one
      // entry per segment instead of two across eighty-eight segments.
      const bedWidth = ROAD_HALF_WIDTH * 2 + 18;
      const bedSize = alongX ? [length, .8, bedWidth] : [bedWidth, .8, length];
      box(name + ' Roadbed', [cx, y - .35, cz], bedSize, 'roadShoulder', false, {group:g, castShadow:false, seed:index});
    }

    // Orbital loop, walked clockwise from the north-west corner so the segment
    // numbering follows the road rather than the array order.
    const R = ROAD_LOOP_RADIUS;
    const sideSegments = Math.round((R * 2) / SEGMENT);
    const sideLength = (R * 2) / sideSegments;
    const SIDES = [
      {label:'North', alongX:true,  fixed:-R, sign:1},
      {label:'East',  alongX:false, fixed:R,  sign:1},
      {label:'South', alongX:true,  fixed:R,  sign:-1},
      {label:'West',  alongX:false, fixed:-R, sign:-1},
    ];
    SIDES.forEach(side => {
      for(let i = 0; i < sideSegments; i++){
        const t = -R + sideLength * (i + .5);
        const cx = side.alongX ? t * side.sign : side.fixed;
        const cz = side.alongX ? side.fixed : t * side.sign;
        carriageway('Orbital ' + side.label + ' ' + String(i + 1).padStart(2, '0'), cx, cz, side.alongX, sideLength, i);
      }
    });

    // Four radial spokes into the GLB keepout.
    const spokeInner = CENTRE_KEEPOUT;
    const spokeSegments = Math.max(1, Math.round((R - spokeInner) / SEGMENT));
    const spokeLength = (R - spokeInner) / spokeSegments;
    const SPOKES = [
      {label:'North', alongX:false, axis:'z', sign:-1},
      {label:'East',  alongX:true,  axis:'x', sign:1},
      {label:'South', alongX:false, axis:'z', sign:1},
      {label:'West',  alongX:true,  axis:'x', sign:-1},
    ];
    SPOKES.forEach(spoke => {
      for(let i = 0; i < spokeSegments; i++){
        const t = (spokeInner + spokeLength * (i + .5)) * spoke.sign;
        const cx = spoke.axis === 'x' ? t : 0;
        const cz = spoke.axis === 'z' ? t : 0;
        carriageway('Spoke ' + spoke.label + ' ' + String(i + 1).padStart(2, '0'), cx, cz, spoke.alongX, spokeLength, i);
      }
    });

    // Junction pads where a spoke meets the loop and at the four loop corners:
    // without them the two carriageways cross at different grades and a car
    // clips the corner.
    const JUNCTIONS = [
      ['North Gate', 0, -R], ['East Gate', R, 0], ['South Gate', 0, R], ['West Gate', -R, 0],
      ['North West Corner', -R, -R], ['North East Corner', R, -R],
      ['South West Corner', -R, R], ['South East Corner', R, R],
    ];
    JUNCTIONS.forEach((junction, index) => {
      const y = roadPlaneY(junction[1], junction[2], seed);
      slab('Junction ' + junction[0], [junction[1], y, junction[2]], [ROAD_HALF_WIDTH * 4, 1.2, ROAD_HALF_WIDTH * 4], 'roadTop', {group:g, seed:index, surface:'asphalt'});
      // A mast at every junction: the ring road stays legible at night and the
      // masts double as the coarse orientation cue between districts.
      cylinder('Junction ' + junction[0] + ' Mast', [junction[1] + 26, y + 9, junction[2] + 26], .5, 18, 'steelDark', true, {group:g});
      glow('Junction ' + junction[0] + ' Lamp', [junction[1] + 26, y + 18.2, junction[2] + 26], [3.2, .5, 1.4], COLOR.lampGlow, {group:g});
      if(index < 4) light('Junction ' + junction[0] + ' Light', [junction[1] + 26, y + 17, junction[2] + 26], {intensity:2600, distance:220}, g);
    });
  }

  // ---------------------------------------------------- terrain proxies
  //
  // The collidable ground. One invisible, drivable box per terrain tile,
  // tilted to the tile's own gradient so a car climbing the ridge is on the
  // surface it can see. Invisible geometry costs no draw call but still owns
  // its collider, which is exactly the same trick the FPS template uses for
  // its rotated wreck.
  function buildTerrainProxies(item, settings){
    const g = item.group;
    const cx = districtCentreX(item), cz = districtCentreZ(item);
    const half = TERRAIN_TILE_SIZE / 2;
    for(let row = 0; row < TERRAIN_TILES; row++){
      for(let col = 0; col < TERRAIN_TILES; col++){
        const tx = cx - DISTRICT_HALF + TERRAIN_TILE_SIZE * (col + .5);
        const tz = cz - DISTRICT_HALF + TERRAIN_TILE_SIZE * (row + .5);
        // A tile that lies inside the GLB keepout is skipped entirely: the
        // source world already owns that ground.
        if(Math.max(Math.abs(tx), Math.abs(tz)) < CENTRE_KEEPOUT - half) continue;
        const centreY = heightAt(tx, tz, settings.seed);
        const east = heightAt(tx + half, tz, settings.seed);
        const west = heightAt(tx - half, tz, settings.seed);
        const north = heightAt(tx, tz - half, settings.seed);
        const south = heightAt(tx, tz + half, settings.seed);
        // Gradients, converted to the small XZ rotations the drive-surface
        // sampler in world-state.js reads off the collider.
        const rotZ = -Math.atan2(east - west, TERRAIN_TILE_SIZE);
        const rotX = Math.atan2(south - north, TERRAIN_TILE_SIZE);
        const label = 'Terrain ' + String(row + 1) + '-' + String(col + 1);
        slab(item.name + ' ' + label,
          [tx, centreY, tz],
          [TERRAIN_TILE_SIZE, 6, TERRAIN_TILE_SIZE],
          item.ground,
          {group:g, visible:false, rotation:[rotX, 0, rotZ], surface:materialOf(item.ground).foot,
            weatherSurface:item.weatherSurface, meta:{district:item.id, role:'terrain'}});
      }
    }
  }

  // ------------------------------------------------------- district hub
  //
  // The place the ring road drops you. Every district gets the same three
  // things so a player always knows what a hub is: a graded apron, a name
  // pylon that reads from the road, and a lit shelter.
  function buildDistrictHub(item, settings){
    const g = item.group;
    const cx = districtCentreX(item), cz = districtCentreZ(item);
    const y = roadPlaneY(cx, cz, settings.seed);
    slab(item.name + ' Hub Apron', [cx, y, cz], [220, 1.4, 220], 'plaza', {group:g, seed:item.index, meta:{district:item.id, role:'hub'}});
    box(item.name + ' Hub Kerb', [cx, y + 1.1, cz], [226, .5, 226], 'kerb', false, {group:g, castShadow:false});
    // Name pylon: the silhouette that says which district this is.
    cylinder(item.name + ' Pylon', [cx - 84, y + 11, cz - 84], 1.1, 22, 'steelDark', true, {group:g});
    box(item.name + ' Pylon Board', [cx - 84, y + 22.4, cz - 84], [16, 4.4, .7], 'steel', false, {group:g});
    glow(item.name + ' Pylon Sign', [cx - 84, y + 22.4, cz - 83.6], [14.4, 3.2, .12], COLOR.signGlow, {group:g});
    light(item.name + ' Hub Light', [cx - 84, y + 20, cz - 84], {intensity:2200, distance:200}, g);
    // Shelter: cover, a roof to stand under, and something with an interior.
    box(item.name + ' Hub Shelter Roof', [cx + 62, y + 5.2, cz + 46], [30, .6, 16], 'corrugated', true, {group:g});
    [-13, 13].forEach((offset, index) => {
      cylinder(item.name + ' Hub Shelter Post ' + (index + 1), [cx + 62 + offset, y + 2.6, cz + 39], .34, 5.2, 'steelDark', true, {group:g});
      cylinder(item.name + ' Hub Shelter Post ' + (index + 3), [cx + 62 + offset, y + 2.6, cz + 53], .34, 5.2, 'steelDark', true, {group:g});
    });
    box(item.name + ' Hub Shelter Wall', [cx + 62, y + 2.6, cz + 54], [30, 5.2, .5], 'concrete', true, {group:g, seed:item.index});
    box(item.name + ' Hub Bench', [cx + 62, y + 1.0, cz + 44], [12, .4, 1.4], 'plank', true, {group:g});
  }

  // -------------------------------------------------------------- POIs
  function buildPois(item, settings, cfg){
    const budget = Math.max(1, Math.round(item.pois.length * clamp01(cfg.poiDensity)));
    item.pois.slice(0, budget).forEach((poi, index) => {
      const kind = poiKindOf(poi.kind);
      const cx = districtCentreX(item) + poi.at[0];
      const cz = districtCentreZ(item) + poi.at[1];
      const groundY = heightAt(cx, cz, settings.seed);
      const meta = {district:item.id, role:'poi', poi:poi.kind, marker:kind.marker, pawns:kind.pawns};
      POI_BUILDERS[poi.kind]({
        item, poi, index, cx, cz, groundY, meta, seed:settings.seed,
        g:item.group, box, slab, cylinder, cone, glow, light, add,
      });
    });
  }

  // ------------------------------------------------------ world edge
  //
  // Four low invisible walls at the outer boundary. Without them the first
  // thing a helicopter does is fly off a nine-square-kilometre plate.
  function buildWorldEdge(){
    const g = GROUP.network;
    const span = WORLD_HALF * 2 + 40;
    const EDGES = [
      ['North', 0, -WORLD_HALF - 10, span, 20],
      ['South', 0, WORLD_HALF + 10, span, 20],
      ['West', -WORLD_HALF - 10, 0, 20, span],
      ['East', WORLD_HALF + 10, 0, 20, span],
    ];
    EDGES.forEach(edge => {
      box('World Edge ' + edge[0], [edge[1], 120, edge[2]], [edge[3], 400, edge[4]], 'steelDark', true,
        {group:g, visible:false, meta:{role:'edge'}});
    });
  }

  // --------------------------------------------- district control element
  //
  // The editable face of a procedural district. Everything an author is
  // expected to change lives here as an exposed variable, in the order the
  // question is usually asked: is it on, what seed, how big, how dense, which
  // theme, how many POIs, and how hard may it push the streaming budget.
  function buildDistrictControl(item, settings){
    const cx = districtCentreX(item), cz = districtCentreZ(item);
    const graph = {
      version:1,
      name:item.name + ' District',
      variables:[
        variable('Enabled', 'boolean', settings.enabled, 'District enabled'),
        variable('Seed', 'number', settings.seed, 'Seed'),
        variable('HalfSize', 'number', DISTRICT_HALF, 'Half size (m)'),
        variable('BaseElevation', 'number', item.base, 'Base elevation (m)'),
        variable('Relief', 'number', item.relief, 'Relief (m)'),
        variable('Theme', 'string', settings.theme, 'Scatter theme'),
        variable('ScatterDensity', 'number', settings.density, 'Scatter density'),
        variable('PoiCount', 'number', item.pois.length, 'Points of interest'),
        variable('StreamRadius', 'number', 1, 'Stream radius multiplier'),
      ],
      nodes:[], edges:[], comments:[],
      logicScene:{root:{id:'root'}, elements:[], components:[]},
      // The descriptor the runtime systems read. Kept beside the variables so
      // the Logic Element inspector edits one object and the streaming system
      // observes the same one.
      openWorldDistrict:{
        schemaVersion:SCHEMA_VERSION,
        id:item.id,
        index:item.index,
        name:item.name,
        nameIt:item.nameIt,
        summary:item.summary,
        group:item.group,
        centre:[cx, 0, cz],
        halfSize:DISTRICT_HALF,
        base:item.base,
        relief:item.relief,
        terrain:item.terrain,
        ground:item.ground,
        ground2:item.ground2,
        weatherSurface:item.weatherSurface,
        fogTint:item.fogTint,
        enabled:settings.enabled,
        seed:settings.seed,
        theme:settings.theme,
        density:settings.density,
        streamRadius:1,
        pois:item.pois.map(poi => ({
          kind:poi.kind, name:poi.name,
          position:[cx + poi.at[0], heightAt(cx + poi.at[0], cz + poi.at[1], settings.seed), cz + poi.at[1]],
          marker:poiKindOf(poi.kind).marker, pawns:poiKindOf(poi.kind).pawns,
        })),
      },
    };
    added.push({
      id:'ow_district_' + item.id,
      kind:'logicElement',
      name:item.name + ' District',
      collide:false,
      graph,
      enabled:true,
      runInEditorPreview:true,
      asset:{key:'logic:open-world-district:' + item.id, name:item.name + ' District', source:SOURCE},
      t:{p:[cx, item.base + 2, cz], r:[0, 0, 0], s:[1, 1, 1], v:true},
      templateGroup:GROUP.control,
    });
    manifest.entries++;
  }

  function variable(name, type, value, label){
    return {name, type, value, label, parentId:'root', linked:true, exposed:true};
  }

  function describeDistrict(item, cfg, native){
    const settings = native ? null : cfg.districts[item.id];
    return {
      index:item.index, id:item.id, name:item.name, nameIt:item.nameIt,
      group:item.group, native:!!native, summary:item.summary,
      centre:[districtCentreX(item), item.base, districtCentreZ(item)],
      halfSize:DISTRICT_HALF,
      enabled:native ? true : settings.enabled,
      seed:native ? 0 : settings.seed,
      theme:native ? 'none' : settings.theme,
      density:native ? 0 : settings.density,
      terrain:item.terrain,
      weatherSurface:item.weatherSurface,
      fogTint:item.fogTint,
      pois:item.pois.map(poi => ({
        kind:poi.kind, name:poi.name,
        position:[districtCentreX(item) + poi.at[0],
          native ? 0 : heightAt(districtCentreX(item) + poi.at[0], districtCentreZ(item) + poi.at[1], settings.seed),
          districtCentreZ(item) + poi.at[1]],
        marker:poiKindOf(poi.kind).marker,
        pawns:poiKindOf(poi.kind).pawns,
      })),
    };
  }
}

// -- POI builders -----------------------------------------------------------
//
// Ordered exactly like POI_KINDS: see it, stand on it, land on it, drive at it.

const POI_BUILDERS = Object.freeze({
  landmark(ctx){
    const {poi, cx, cz, groundY, g, meta} = ctx;
    const height = poi.height || 60;
    ctx.slab(poi.name + ' Pad', [cx, groundY, cz], [46, 1.4, 46], 'concrete', {group:g, meta});
    ctx.box(poi.name + ' Base', [cx, groundY + 4, cz], [16, 8, 16], 'concrete', true, {group:g, seed:ctx.index});
    // The silhouette itself: a tapered mast with a lit crown, so the district
    // is identifiable from the ring road on the far side of the map.
    ctx.cylinder(poi.name + ' Mast', [cx, groundY + 8 + height / 2, cz], 3.4, height, 'steel', true, {group:g});
    ctx.box(poi.name + ' Crown', [cx, groundY + 8 + height, cz], [14, 3.2, 14], 'steelDark', false, {group:g});
    ctx.glow(poi.name + ' Beacon', [cx, groundY + 10 + height, cz], [6, 2.4, 6], COLOR.markerRed, {group:g});
    ctx.light(poi.name + ' Beacon Light', [cx, groundY + 10 + height, cz], {color:0xff6a5c, intensity:3200, distance:400}, g);
    [-1, 1].forEach((side, index) => {
      ctx.box(poi.name + ' Stay ' + (index + 1), [cx + side * 11, groundY + 8 + height * .3, cz], [1, height * .6, 1], 'steelPale', false,
        {group:g, rotation:[0, 0, side * .32]});
    });
  },
  overlook(ctx){
    const {poi, cx, cz, groundY, g, meta} = ctx;
    ctx.slab(poi.name + ' Deck', [cx, groundY + 3.2, cz], [26, 1, 18], 'plank', {group:g, meta, visible:true});
    [-12.5, 12.5].forEach((offset, index) => {
      ctx.cylinder(poi.name + ' Pile ' + (index + 1), [cx + offset, groundY + 1.6, cz], .5, 3.4, 'timber', true, {group:g});
    });
    ctx.box(poi.name + ' Rail', [cx, groundY + 4.6, cz - 8.6], [26, 1.1, .3], 'steelPale', true, {group:g});
    ctx.box(poi.name + ' Rail West', [cx - 12.8, groundY + 4.6, cz], [.3, 1.1, 18], 'steelPale', true, {group:g});
    ctx.box(poi.name + ' Rail East', [cx + 12.8, groundY + 4.6, cz], [.3, 1.1, 18], 'steelPale', true, {group:g});
    ctx.box(poi.name + ' Board', [cx, groundY + 4.9, cz + 7], [4.4, 1.6, .18], 'steelDark', false, {group:g, rotation:[-.5, 0, 0]});
  },
  helipad(ctx){
    const {poi, cx, cz, groundY, g, meta} = ctx;
    const y = groundY + (poi.elevated || 0);
    if(poi.elevated){
      ctx.cylinder(poi.name + ' Column', [cx, groundY + poi.elevated / 2, cz], 5, poi.elevated, 'concrete', true, {group:g});
    }
    ctx.slab(poi.name, [cx, y, cz], [34, 1.2, 34], 'concrete', {group:g, meta, seed:ctx.index});
    ctx.box(poi.name + ' Circle', [cx, y + .68, cz], [24, .06, 24], 'laneWhite', false, {group:g, castShadow:false});
    ctx.box(poi.name + ' H Bar', [cx, y + .72, cz], [3, .06, 12], 'laneWhite', false, {group:g, castShadow:false});
    ctx.box(poi.name + ' H Left', [cx - 4.5, y + .72, cz], [1.6, .06, 12], 'laneWhite', false, {group:g, castShadow:false});
    ctx.box(poi.name + ' H Right', [cx + 4.5, y + .72, cz], [1.6, .06, 12], 'laneWhite', false, {group:g, castShadow:false});
    [[-15, -15], [15, -15], [-15, 15], [15, 15]].forEach((corner, index) => {
      ctx.glow(poi.name + ' Corner Light ' + (index + 1), [cx + corner[0], y + .9, cz + corner[1]], [1.2, .5, 1.2], 0x6fe0a8, {group:g});
    });
    // A windsock, because a helicopter pad that does not say which way the
    // wind blows is a texture.
    ctx.cylinder(poi.name + ' Windsock Post', [cx + 21, y + 4, cz], .22, 8, 'steelPale', true, {group:g});
    ctx.cone(poi.name + ' Windsock', [cx + 23.4, y + 7.6, cz], 1, 4, 0xd8642f, false, {group:g, rotation:[0, 0, -Math.PI / 2]});
  },
  airstrip(ctx){
    const {poi, cx, cz, groundY, g, meta} = ctx;
    const length = poi.length || 640;
    const heading = poi.heading || 0;
    const alongX = Math.abs(Math.sin(heading)) > .5;
    const size = alongX ? [length, 1.4, 44] : [44, 1.4, length];
    ctx.slab(poi.name, [cx, groundY, cz], size, 'concrete', {group:g, meta, surface:'concrete', seed:ctx.index});
    // Threshold bars and a dashed centre line, so a pilot can line up.
    const half = length / 2;
    [-1, 1].forEach((end, index) => {
      const ex = alongX ? cx + end * (half - 14) : cx;
      const ez = alongX ? cz : cz + end * (half - 14);
      ctx.box(poi.name + ' Threshold ' + (index + 1), [ex, groundY + .78, ez],
        alongX ? [10, .06, 34] : [34, .06, 10], 'laneWhite', false, {group:g, castShadow:false});
    });
    const dashes = Math.max(4, Math.round(length / 60));
    for(let i = 0; i < dashes; i++){
      const t = -half + (half * 2) * ((i + .5) / dashes);
      ctx.box(poi.name + ' Centre Dash ' + (i + 1),
        [alongX ? cx + t : cx, groundY + .78, alongX ? cz : cz + t],
        alongX ? [22, .06, 1] : [1, .06, 22], 'laneWhite', false, {group:g, castShadow:false});
    }
    // Hangar and fuel drums at the near threshold.
    const hx = alongX ? cx - half + 40 : cx + 44;
    const hz = alongX ? cz + 44 : cz - half + 40;
    ctx.box(poi.name + ' Hangar', [hx, groundY + 7, hz], [42, 14, 30], 'corrugated', true, {group:g, seed:ctx.index + 1});
    ctx.box(poi.name + ' Hangar Door', [hx, groundY + 6, hz - 15.2], [30, 12, .6], 'steelDark', false, {group:g});
    ctx.glow(poi.name + ' Hangar Lamp', [hx, groundY + 14.6, hz - 15], [8, .5, 1], COLOR.lampGlow, {group:g});
    ctx.light(poi.name + ' Apron Light', [hx, groundY + 15, hz - 20], {intensity:2400, distance:220}, g);
  },
  ramp(ctx){
    const {poi, cx, cz, groundY, g, meta} = ctx;
    const heading = poi.heading || 0;
    ctx.slab(poi.name + ' Run Up', [cx, groundY, cz], [26, 1.2, 90], 'roadTop', {group:g, meta, rotation:[0, heading, 0]});
    ctx.add(poi.name, 'ramp', [cx - Math.sin(heading) * 62, groundY + .6, cz - Math.cos(heading) * 62],
      [3.4, 3.4, 3.4], 'concrete', true, {group:g, driveSurface:true, rotation:[0, heading - Math.PI / 2, 0], surface:'concrete'});
    [-1, 1].forEach((side, index) => {
      ctx.box(poi.name + ' Marker ' + (index + 1),
        [cx + Math.cos(heading) * side * 15, groundY + 2, cz - Math.sin(heading) * side * 15],
        [1.4, 4, 1.4], COLOR.markerRed, false, {group:g});
    });
    ctx.box(poi.name + ' Landing Strip', [cx - Math.sin(heading) * 150, groundY, cz - Math.cos(heading) * 150],
      [30, 1.2, 120], 'roadTop', true, {group:g, driveSurface:true, rotation:[0, heading, 0], castShadow:false});
  },
  circuit(ctx){
    const {poi, cx, cz, groundY, g, meta} = ctx;
    const radius = poi.radius || 240;
    const segments = 16;
    // A closed loop of straight pads. Straight segments keep every collider
    // axis-friendly, which is what the character collider actually reads.
    for(let i = 0; i < segments; i++){
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const mx = cx + Math.cos((a0 + a1) / 2) * radius;
      const mz = cz + Math.sin((a0 + a1) / 2) * radius;
      const length = Math.hypot(Math.cos(a1) - Math.cos(a0), Math.sin(a1) - Math.sin(a0)) * radius + 6;
      const heading = -(a0 + a1) / 2;
      ctx.slab(poi.name + ' Sector ' + String(i + 1).padStart(2, '0'),
        [mx, ctx.groundY, mz], [16, 1.2, length], 'roadTop',
        {group:g, meta:i === 0 ? meta : undefined, rotation:[0, heading, 0], seed:i, surface:'asphalt'});
      if(i % 4 === 0){
        ctx.box(poi.name + ' Marker ' + (i / 4 + 1), [mx, groundY + 3, mz], [1.2, 6, 1.2], 'steelPale', false, {group:g});
      }
    }
    ctx.slab(poi.name + ' Paddock', [cx, groundY, cz], [70, 1.2, 70], 'plaza', {group:g, seed:ctx.index});
  },
  depot(ctx){
    const {poi, cx, cz, groundY, g, meta, seed} = ctx;
    ctx.slab(poi.name + ' Yard', [cx, groundY, cz], [130, 1.4, 110], 'dockApron', {group:g, meta, seed:ctx.index});
    const CONTAINERS = ['containerRed', 'containerBlue', 'containerSand'];
    for(let i = 0; i < 9; i++){
      const jitter = hash2i(seed + 991, i, ctx.index);
      const gx = cx - 45 + (i % 3) * 34;
      const gz = cz - 30 + Math.floor(i / 3) * 30;
      const stack = jitter > .62 ? 2 : 1;
      for(let level = 0; level < stack; level++){
        ctx.box(poi.name + ' Container ' + (i + 1) + '-' + (level + 1),
          [gx, groundY + 2 + level * 5.3, gz], [12.2, 5.2, 4.9], CONTAINERS[(i + level) % 3], true,
          {group:g, seed:i + level});
      }
    }
    ctx.box(poi.name + ' Office', [cx + 48, groundY + 4.4, cz + 40], [22, 8, 14], 'concrete', true, {group:g, seed:ctx.index + 2});
    ctx.glow(poi.name + ' Office Window', [cx + 48, groundY + 5.4, cz + 33], [16, 2.6, .2], 0xbcd0dd, {group:g});
    ctx.cylinder(poi.name + ' Mast', [cx - 58, groundY + 9, cz + 46], .4, 18, 'steelPale', true, {group:g});
    ctx.glow(poi.name + ' Mast Lamp', [cx - 58, groundY + 18.2, cz + 46], [2.6, .5, 1.2], COLOR.lampGlow, {group:g});
    ctx.light(poi.name + ' Yard Light', [cx - 58, groundY + 17, cz + 46], {intensity:2000, distance:190}, g);
  },
  shelter(ctx){
    const {poi, cx, cz, groundY, g, meta} = ctx;
    ctx.slab(poi.name + ' Terrace', [cx, groundY, cz], [30, 1.2, 26], 'plaza', {group:g, meta});
    ctx.box(poi.name + ' Walls', [cx, groundY + 3, cz], [16, 5.4, 12], 'brickWall', true, {group:g, seed:ctx.index});
    ctx.box(poi.name + ' Roof', [cx, groundY + 6.2, cz], [19, 1, 15], 'timber', true, {group:g, rotation:[.12, 0, 0]});
    ctx.glow(poi.name + ' Window', [cx, groundY + 3.4, cz - 6.2], [4.4, 2.2, .2], 0xffd8a0, {group:g});
    ctx.cylinder(poi.name + ' Chimney', [cx + 6, groundY + 8.2, cz + 3], .9, 4.4, 'brickWall', false, {group:g});
    ctx.light(poi.name + ' Lamp', [cx, groundY + 4, cz - 8], {intensity:900, distance:70}, g);
  },
});

// ========================================================= 07 public registry

const API = Object.freeze({
  SCHEMA_VERSION, SOURCE, GROUP,
  CHUNK, DISTRICT_CHUNKS, DISTRICT_PITCH, DISTRICT_HALF, WORLD_HALF,
  CENTRE_KEEPOUT, CENTRE_APRON_Y, WORLD_AREA, CENTRE_AREA,
  TERRAIN_TILES, TERRAIN_TILE_SIZE,
  ROAD_HALF_WIDTH, ROAD_CORRIDOR, ROAD_LOOP_RADIUS,
  DISTRICTS, DISTRICT_IDS, RING_DISTRICTS,
  MAT, COLOR, POI_KINDS, POI_IDS, TERRAIN_PROFILES,
  districtOf, poiKindOf, materialOf, groundMaterialOf, terrainProfileOf,
  districtCentreX, districtCentreZ, districtAt,
  hash2i, valueNoise, fbm, ridged,
  biomeWeightsAt, dominantAt, heightAt, roadDistance, roadCorridorWeight, roadPlaneY,
  normalizeConfig, buildEntries,
});

root.LK_RUNTIME_OPEN_WORLD_DISTRICTS = API;
if(typeof module !== 'undefined' && module.exports) module.exports = API;
})();
