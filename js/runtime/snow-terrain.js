/* =========================================================
   LOT KING - Snow mountain terrain

   The mountain the snowboarding template rides down. Replaces the fourteen flat
   tilted boxes the template used to ship with a real, curved, banked heightfield:
   turns, banked walls, a half-pipe, natural rollers, kickers, a cliff drop and
   off-piste bowls outside the ropes.

   WHAT MAKES THIS EDITABLE RATHER THAN GENERATED
   -----------------------------------------------------------------
   The mountain has ONE source of truth and it is ordinary editor geometry: a
   column of piste sector slabs, each an ordinary `primitive` entry that the
   outliner lists, the gizmo moves and the Inspector edits. A sector carries its
   shape in `props.snowSector` and its POSITION IS ITS SHAPE - the slab's world
   transform gives the sector's centre-line X, its altitude and its length, and
   its scale gives the corridor width.

   This module reads those slabs back out of `GAME.world.registry`, interpolates
   them into a continuous analytic field, and BAKES THAT FIELD INTO THE SLABS'
   OWN GEOMETRY. Nothing is added to the scene, nothing is hidden, no second
   representation exists to drift out of sync: the object the author selects is
   the object that renders. Drag a sector sideways and the mountain curves;
   raise one and the pitch above it steepens. Delete this script and every slab
   falls back to being the box it always was.

   The same field also answers `GAME.world.characterGroundHeight(x, z)`, which
   character-movement.js already consults before anything else, so the rider
   follows the smooth surface rather than the tops of the boxes.

   HOW THIS FILE IS ORGANISED
     00  identity and budget
     01  sector kinds     the shape vocabulary, in the order a rider meets them
     02  snow bands       which snow surface a point of the mountain wears
     03  field model      pure heightfield: spine interpolation, profiles, noise
     04  mesh builder     baking the field into a sector slab's geometry (THREE)
     05  install          registry scan, ground hook, rebuild policy
   ========================================================= */
(function(){
'use strict';

// ================================================================ 00 identity

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;

// Mesh budget. A sector patch is one draw call; the whole mountain is however
// many sectors the level authored (the shipped run uses 22). The lateral counts
// are deliberately modest because the fine detail of the run - the board trench
// itself - is a FRAGMENT-side effect in snow-trail.js, not geometry. See the
// header of that module for why that split is the one the references make.
const MESH_QUALITY = Object.freeze({
  low:    {along:10, across:20, lateralBias:2.2},
  medium: {along:16, across:30, lateralBias:2.0},
  high:   {along:24, across:44, lateralBias:1.9},
  ultra:  {along:34, across:60, lateralBias:1.8},
});
const MESH_QUALITY_IDS = Object.freeze(Object.keys(MESH_QUALITY));

// How often the registry is re-scanned for sector edits. Reading 22 transforms
// is nothing; rebuilding 22 geometries is not, so the scan only compares a
// signature and the rebuild only happens when that signature actually moved.
const SCAN_INTERVAL = .25;

function finite(value, fallback){
  value = Number(value);
  return Number.isFinite(value) ? value : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return value < min ? min : value > max ? max : value; }
function lerp(a, b, t){ return a + (b - a) * t; }
function smoothstep(edge0, edge1, x){
  const t = clamp((x - edge0) / (edge1 - edge0 || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

// ============================================================ 01 sector kinds
//
// The shape vocabulary. Every sector slab names one of these, and an unknown
// name THROWS: a silent fallback to "straight piste" would quietly flatten a
// half-pipe somewhere in the middle of the mountain and nobody would find out
// until they rode it.
//
// Listed in the order a rider meets them coming down: the summit cornice first,
// the runout last. A profile answers ONE question - how many metres does this
// sector add to the interpolated spine at lateral offset `d` metres from the
// centre-line and local progress `s` along its own length - and it must return 0
// at |s| >= 1 so a sector never leaks shape into its neighbours.
//
//   d   metres from the centre-line, signed (negative = rider's left)
//   s   position inside this sector along the fall line, -1 at its uphill edge,
//       0 at its centre, +1 at its downhill edge
//   sec the resolved sector record (halfWidth, amplitude, feature...)

// Lateral gate: a feature that only occupies the middle of the corridor (a
// kicker, a cornice lip) fades out before the ropes instead of ending on an
// edge the rider can catch.
function gate(d, halfWidth){
  return 1 - smoothstep(halfWidth * .55, halfWidth * 1.02, Math.abs(d));
}
// Along-sector envelope, zero at both ends by construction.
function envelope(s){
  const a = clamp(Math.abs(s), 0, 1);
  return 1 - a * a * (3 - 2 * a);
}

const SECTOR_KINDS = Object.freeze({
  // Convex lip at the very top: the rider drops off it rather than rolling over.
  cornice:{
    label:'Summit cornice', labelIt:'Cornice di vetta',
    profile(d, s, sec){ return sec.amplitude * (1 - smoothstep(-.35, .45, s)) * gate(d, sec.halfWidth); },
  },
  // Straight fall-line piste. The default, and the only kind that adds nothing:
  // its shape is entirely the spine's pitch.
  schuss:{
    label:'Straight schuss', labelIt:'Dritto di massima pendenza',
    profile(){ return 0; },
  },
  // Banked turn. The linear cross-slope comes from the sector's `bank` angle;
  // this adds the parabolic berm on top of it, which is what actually holds an
  // edge at speed instead of just tilting the ground.
  bank:{
    label:'Banked turn', labelIt:'Curva paraboliaca',
    profile(d, s, sec){
      const t = clamp(d / (sec.halfWidth || 1), -1, 1);
      return sec.amplitude * t * t * envelope(s);
    },
  },
  // Natural rollers down the fall line: the compressions that unweight a board
  // and give the run its rhythm between the built features.
  roller:{
    label:'Rollers', labelIt:'Dossi naturali',
    profile(d, s, sec){
      return sec.amplitude * Math.sin(s * Math.PI * (sec.count || 2)) * envelope(s) * gate(d, sec.halfWidth * 1.4);
    },
  },
  // Built kicker: a takeoff lip with a knuckle behind it. The landing is the
  // spine's own pitch, so a kicker never invents a flat to land on.
  kicker:{
    label:'Kicker', labelIt:'Salto costruito',
    profile(d, s, sec){
      const up = smoothstep(-1, -.05, s);
      const down = 1 - smoothstep(0, .4, s);
      return sec.amplitude * up * down * gate(d, sec.featureHalfWidth || sec.halfWidth * .6);
    },
  },
  // Half-pipe: flat bottom, transition, vert. Authored as ONE profile rather
  // than as two wall objects, so the transition is continuous and a board
  // carries speed through it instead of catching a seam.
  halfpipe:{
    label:'Half-pipe', labelIt:'Half-pipe',
    profile(d, s, sec){
      const flat = sec.halfWidth * .42;
      const t = clamp((Math.abs(d) - flat) / (sec.halfWidth - flat || 1), 0, 1);
      return sec.amplitude * t * t * (3 - 2 * t) * envelope(s * .55);
    },
  },
  // Cliff drop. The step itself lives in the spine's altitude knots with a
  // `sharp` blend; the profile only rolls the takeoff lip over so the rider
  // leaves the ground cleanly rather than scraping down the face.
  cliff:{
    label:'Cliff drop', labelIt:'Salto di roccia',
    profile(d, s, sec){ return sec.amplitude * (1 - smoothstep(-.5, .1, s)) * gate(d, sec.halfWidth * 1.2); },
  },
  // Off-piste bowl: a concave scoop OUTSIDE the ropes, which is what makes
  // leaving the corridor worth doing instead of merely legal.
  bowl:{
    label:'Off-piste bowl', labelIt:'Conca fuoripista',
    profile(d, s, sec){
      const outside = smoothstep(sec.halfWidth * .9, sec.halfWidth * 1.5, Math.abs(d));
      const across = 1 - smoothstep(sec.halfWidth * 1.5, sec.halfWidth * 3.2, Math.abs(d));
      return -sec.amplitude * outside * across * envelope(s);
    },
  },
  // Natural gully carved between two ridges outside the corridor.
  gully:{
    label:'Off-piste gully', labelIt:'Canale fuoripista',
    profile(d, s, sec){
      const side = d < 0 ? -1 : 1;
      const centre = side * sec.halfWidth * 1.9;
      const t = clamp(Math.abs(d - centre) / (sec.halfWidth * .8 || 1), 0, 1);
      return -sec.amplitude * (1 - t) * (1 - t) * envelope(s);
    },
  },
  // Runout / finish apron. Flat by construction: the author zeroes the bank and
  // the spine stops dropping.
  flat:{
    label:'Runout apron', labelIt:'Piano di arrivo',
    profile(){ return 0; },
  },
});
const SECTOR_KIND_IDS = Object.freeze(Object.keys(SECTOR_KINDS));

function kindOf(name){
  const kind = SECTOR_KINDS[name];
  if(!kind) throw new Error('Snow terrain: unknown sector kind "' + name + '"');
  return kind;
}

// How the altitude of one sector eases into the next. `sharp` is what turns a
// pair of altitude knots into a cliff instead of a ramp.
const SECTOR_BLENDS = Object.freeze({
  smooth:t => t * t * (3 - 2 * t),
  linear:t => t,
  sharp:t => { const e = clamp((t - .62) / .3, 0, 1); return e * e * (3 - 2 * e); },
});
const SECTOR_BLEND_IDS = Object.freeze(Object.keys(SECTOR_BLENDS));

function blendOf(name){
  const blend = SECTOR_BLENDS[name];
  if(!blend) throw new Error('Snow terrain: unknown sector blend "' + name + '"');
  return blend;
}

// ============================================================== 02 snow bands
//
// A mountain is not one snow. The band a point wears is decided by three
// readings the field already has - altitude, steepness and how far outside the
// ropes it is - and the answer names a procedural surface kind from
// js/engine/procedural-surfaces.js. Ordered from the top of the mountain down,
// which is also the order of decreasing snow quality.

const SNOW_BANDS = Object.freeze({
  // Above the treeline and outside the corridor: nothing has touched it.
  powder:{surface:'snowPowder', foot:'snow', grip:.78, spray:1, label:'Fresh powder', labelIt:'Neve fresca'},
  // The groomed corridor: what the piste basher left overnight.
  groomed:{surface:'snowGroomed', foot:'snow', grip:1, spray:.7, label:'Groomed piste', labelIt:'Pista battuta'},
  // The middle third of the run by mid-morning.
  packed:{surface:'snowPacked', foot:'snow', grip:.92, spray:.45, label:'Skied-out hardpack', labelIt:'Neve dura'},
  // Scraped off in the fall line of anything steep. Where a run is lost.
  ice:{surface:'snowIce', foot:'ice', grip:.42, spray:.12, label:'Boilerplate ice', labelIt:'Lastra di ghiaccio'},
  // Cover too thin to hide what is underneath.
  rock:{surface:'snowRock', foot:'rock', grip:.6, spray:0, label:'Rock outcrop', labelIt:'Roccia affiorante'},
});
const SNOW_BAND_IDS = Object.freeze(Object.keys(SNOW_BANDS));

function bandOf(name){
  const band = SNOW_BANDS[name];
  if(!band) throw new Error('Snow terrain: unknown snow band "' + name + '"');
  return band;
}

// =============================================================== 03 field model
//
// Everything from here to the end of the section is PURE: no THREE, no DOM, no
// GAME. It is the part the node tests exercise, and the part the mesh builder,
// the character ground hook and the trail atlas all read from.

// Deterministic 2D value noise. Written out rather than imported so the field
// stays a self-contained pure model, and written allocation-free because
// `height()` is called tens of thousands of times while a mesh is baked and
// once per frame per pawn afterwards.
function hash2(ix, iz, seed){
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, z, seed){
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

/** Normalize one authored sector. Called once per rebuild, never per sample. */
function normalizeSector(source, index){
  const src = source && typeof source === 'object' ? source : {};
  const kind = typeof src.kind === 'string' && src.kind ? src.kind : 'schuss';
  kindOf(kind);
  const blend = typeof src.blend === 'string' && src.blend ? src.blend : 'smooth';
  blendOf(blend);
  const band = typeof src.band === 'string' && src.band ? src.band : null;
  if(band) bandOf(band);
  const halfWidth = Math.max(1.5, finite(src.halfWidth, 12));
  return {
    order:finite(src.order, index),
    id:typeof src.id === 'string' && src.id ? src.id : 'sector_' + index,
    name:typeof src.name === 'string' ? src.name : '',
    kind, blend, band,
    x:finite(src.x, 0),
    y:finite(src.y, 0),
    z:finite(src.z, 0),
    halfLength:Math.max(1, finite(src.halfLength, 8)),
    halfWidth,
    // Cross-slope, radians. Positive rolls the surface down toward -X, which is
    // what banks a left-hand turn.
    bank:clamp(finite(src.bank, 0), -1.1, 1.1),
    amplitude:finite(src.amplitude, 0),
    featureHalfWidth:Math.max(.5, finite(src.featureHalfWidth, halfWidth * .6)),
    count:Math.max(1, Math.round(finite(src.count, 2))),
  };
}

const FIELD_DEFAULTS = Object.freeze({
  seed:1337,
  // Relief added on top of the spine. The corridor is groomed, so it gets
  // almost none; everything outside the ropes gets all of it, and that
  // difference is the whole reason to stay on the piste or deliberately leave.
  groomedRelief:.09,
  offPisteRelief:1,
  reliefScale:11,
  // How fast the ground climbs once past the ropes. The piste is a corridor cut
  // into a mountainside, not a ribbon floating in the air.
  edgeRise:.34,
  edgeRunout:26,
  // How far past the ropes a sector slab actually draws ground, as a multiple
  // of its corridor half-width. The slab's scale.x is the PISTE width - that is
  // the number an author wants to edit - and the mountainside beyond it is
  // drawn by extending the patch rather than by asking the author to think in
  // terms of a bounding box they cannot see.
  apron:3.2,
  // Band thresholds.
  powderAltitude:46,
  iceSlope:.42,
  rockSlope:.72,
  packedHalfWidth:.55,
  // Lateral scale of the trail atlas relative to the corridor: the atlas has to
  // cover a little more than the ropes so a trail laid just off-piste is still
  // recorded. See snow-trail.js.
  trailWidthScale:1.35,
});

/**
 * Build the analytic mountain from a list of authored sectors.
 * Pure: the returned field holds no scene references and allocates nothing per
 * sample. Sectors may arrive in any order; they are sorted along the fall line.
 */
function createField(sectors, options){
  const opts = Object.assign({}, FIELD_DEFAULTS, options || {});
  const list = (Array.isArray(sectors) ? sectors : [])
    .map(normalizeSector)
    .sort((a, b) => a.order - b.order || a.z - b.z);
  if(list.length < 2) return null;

  const count = list.length;
  const summitZ = list[0].z;
  const baseZ = list[count - 1].z;
  const runLength = baseZ - summitZ;
  if(!(Math.abs(runLength) > 1)) return null;

  const seed = Math.abs(Math.round(finite(opts.seed, 1337))) % 65536;
  const reliefScale = Math.max(2, finite(opts.reliefScale, 11));
  const edgeRise = clamp(finite(opts.edgeRise, .34), 0, 2);
  const edgeRunout = Math.max(2, finite(opts.edgeRunout, 26));
  const groomedRelief = clamp(finite(opts.groomedRelief, .09), 0, 3);
  const offPisteRelief = clamp(finite(opts.offPisteRelief, 1), 0, 6);
  const trailWidthScale = clamp(finite(opts.trailWidthScale, 1.35), 1, 4);

  let widestHalf = 0, highestY = -Infinity, lowestY = Infinity;
  for(let i = 0; i < count; i++){
    if(list[i].halfWidth > widestHalf) widestHalf = list[i].halfWidth;
    if(list[i].y > highestY) highestY = list[i].y;
    if(list[i].y < lowestY) lowestY = list[i].y;
  }

  // Locate the segment bracketing a fall-line position. Sectors are few and the
  // query is monotonic in practice, so a linear walk from a cached index beats
  // a binary search and never allocates.
  let cursor = 0;
  function bracket(z){
    const forward = runLength > 0;
    const inside = i => forward ? (z >= list[i].z && z <= list[i + 1].z) : (z <= list[i].z && z >= list[i + 1].z);
    if(cursor < count - 1 && inside(cursor)) return cursor;
    for(let i = 0; i < count - 1; i++){
      if(inside(i)){ cursor = i; return i; }
    }
    return forward ? (z < list[0].z ? 0 : count - 2) : (z > list[0].z ? 0 : count - 2);
  }

  // --- spine -----------------------------------------------------------------
  // Scratch record reused by every sample. `height()` runs inside the mesh bake
  // loop tens of thousands of times; minting an object per sample there is what
  // turns a level load into a garbage-collection stall.
  const spine = {x:0, y:0, halfWidth:0, bank:0, index:0, t:0};
  function sampleSpine(z){
    const i = bracket(z);
    const a = list[i], b = list[i + 1];
    const span = b.z - a.z;
    const raw = clamp(span === 0 ? 0 : (z - a.z) / span, 0, 1);
    // The altitude uses the DOWNHILL sector's blend, because the blend
    // describes how the rider arrives at that sector - a cliff is sharp on the
    // way in, not on the way out.
    const eY = blendOf(b.blend)(raw);
    const eS = raw * raw * (3 - 2 * raw);
    spine.index = i;
    spine.t = raw;
    spine.x = lerp(a.x, b.x, eS);
    spine.y = lerp(a.y, b.y, eY);
    spine.halfWidth = lerp(a.halfWidth, b.halfWidth, eS);
    spine.bank = lerp(a.bank, b.bank, eS);
    return spine;
  }

  function centreX(z){ return sampleSpine(z).x; }
  function halfWidthAt(z){ return sampleSpine(z).halfWidth; }
  function bankAt(z){ return sampleSpine(z).bank; }

  // --- profiles --------------------------------------------------------------
  // Every sector whose own length reaches this z contributes, weighted by how
  // far into it we are. Two neighbours can overlap, which is exactly what makes
  // a kicker fade into the rollers below it instead of appearing at a seam.
  function profileAt(x, z, hw){
    let sum = 0;
    for(let i = 0; i < count; i++){
      const sec = list[i];
      const s = (z - sec.z) / sec.halfLength;
      if(s <= -1 || s >= 1) continue;
      if(sec.amplitude === 0) continue;
      sum += kindOf(sec.kind).profile(x - sec.x, s, sec);
    }
    return sum;
  }

  // --- relief ----------------------------------------------------------------
  function relief(x, z, inside){
    const weight = inside ? groomedRelief : offPisteRelief;
    if(weight <= 0) return 0;
    const a = valueNoise(x / reliefScale, z / reliefScale, seed);
    const b = valueNoise(x / (reliefScale * .37), z / (reliefScale * .37), seed + 7);
    return ((a - .5) * 1.6 + (b - .5) * .55) * weight;
  }

  // --- the field itself ------------------------------------------------------
  function height(x, z){
    const s = sampleSpine(z);
    const d = x - s.x;
    const hw = s.halfWidth;
    // Banked cross-section. tan() of a clamped angle, so a 60-degree bank is
    // steep rather than infinite.
    let y = s.y + d * Math.tan(s.bank);
    const over = Math.abs(d) - hw;
    if(over > 0){
      // The ropes are the edge of a cut, so the ground climbs away from them and
      // then levels off into the mountainside.
      const run = clamp(over / edgeRunout, 0, 1);
      y += edgeRise * edgeRunout * (run - .5 * run * run) * 2 * .5;
    }
    y += profileAt(x, z, hw);
    y += relief(x, z, over <= 0);
    return y;
  }

  // Central differences. The step is a metre-ish because the features that
  // matter to a rider (bank, roller, lip) are metres wide; sampling tighter
  // would return the noise instead of the shape.
  const NORMAL_STEP = .75;
  function normalInto(x, z, out){
    const target = out || {x:0, y:1, z:0};
    const dx = (height(x + NORMAL_STEP, z) - height(x - NORMAL_STEP, z)) / (2 * NORMAL_STEP);
    const dz = (height(x, z + NORMAL_STEP) - height(x, z - NORMAL_STEP)) / (2 * NORMAL_STEP);
    const len = Math.sqrt(dx * dx + dz * dz + 1) || 1;
    target.x = -dx / len;
    target.y = 1 / len;
    target.z = -dz / len;
    return target;
  }
  /** Steepness at a point, 0 flat .. 1 vertical-ish. Drives the snow band. */
  function slopeAt(x, z){
    const dx = (height(x + NORMAL_STEP, z) - height(x - NORMAL_STEP, z)) / (2 * NORMAL_STEP);
    const dz = (height(x, z + NORMAL_STEP) - height(x, z - NORMAL_STEP)) / (2 * NORMAL_STEP);
    return Math.sqrt(dx * dx + dz * dz);
  }

  /** Which snow band a point wears. An authored sector `band` wins outright. */
  function bandAt(x, z){
    const s = sampleSpine(z);
    const authored = list[s.index].band || (s.t > .5 ? list[Math.min(count - 1, s.index + 1)].band : null);
    if(authored) return authored;
    const d = Math.abs(x - s.x);
    const slope = slopeAt(x, z);
    if(slope > opts.rockSlope) return 'rock';
    if(d > s.halfWidth) return height(x, z) > opts.powderAltitude ? 'powder' : 'powder';
    if(slope > opts.iceSlope) return 'ice';
    if(d < s.halfWidth * opts.packedHalfWidth) return 'packed';
    return 'groomed';
  }
  function surfaceAt(x, z){ return bandOf(bandAt(x, z)).surface; }
  function gripAt(x, z){ return bandOf(bandAt(x, z)).grip; }

  // --- piste space -----------------------------------------------------------
  // The coordinate system the persistent trail atlas lives in. See snow-trail.js
  // for why the trail is stored along the run rather than over world XZ.
  function pisteU(z){ return clamp((z - summitZ) / runLength, 0, 1); }
  function pisteZ(u){ return summitZ + clamp(u, 0, 1) * runLength; }
  function trailHalfWidth(z){ return halfWidthAt(z) * trailWidthScale; }
  function pisteV(x, z){
    const s = sampleSpine(z);
    return .5 + (x - s.x) / (2 * s.halfWidth * trailWidthScale);
  }

  return Object.freeze({
    schemaVersion:SCHEMA_VERSION,
    sectors:list,
    options:opts,
    summitZ, baseZ, runLength,
    widestHalfWidth:widestHalf,
    summitY:highestY, baseY:lowestY,
    bounds:Object.freeze({
      minX:Math.min.apply(null, list.map(s => s.x - s.halfWidth * 3.4)),
      maxX:Math.max.apply(null, list.map(s => s.x + s.halfWidth * 3.4)),
      minZ:Math.min(summitZ, baseZ) - list[0].halfLength,
      maxZ:Math.max(summitZ, baseZ) + list[count - 1].halfLength,
    }),
    height, normalInto, slopeAt,
    centreX, halfWidthAt, bankAt, trailHalfWidth,
    bandAt, surfaceAt, gripAt,
    pisteU, pisteZ, pisteV,
  });
}

// ============================================================ 04 mesh builder
//
// Baking the field into a sector slab's own geometry. Everything here needs
// THREE and is skipped entirely under node, which is why the model above is a
// separate, pure section.

/** Lateral vertex distribution. The corridor is a fraction of the slab's width
 *  but it is where every trench, berm and edge lives, so columns are pulled
 *  toward the middle: a bias of 2 spends four times as many vertices per metre
 *  on the piste as on the mountainside beyond the ropes. */
function lateralParam(t, bias){
  return t < 0 ? -Math.pow(-t, bias) : Math.pow(t, bias);
}

/** Build (or rebuild) the heightfield patch for one sector slab.
 *  The patch is authored in the MESH's local space so the group transform, the
 *  gizmo and the Inspector all keep working untouched: local (-1..1) maps onto
 *  the box footprint the slab already had. */
function bakeSlab(THREE, mesh, group, field, quality){
  const q = MESH_QUALITY[quality] || MESH_QUALITY.high;
  const px = group.position.x, py = group.position.y, pz = group.position.z;
  const sx = Math.abs(group.scale.x) || 1, sy = Math.abs(group.scale.y) || 1, sz = Math.abs(group.scale.z) || 1;
  const apron = clamp(finite(field.options && field.options.apron, 3.2), 1, 8);
  const cols = q.across, rows = q.along;
  const vertexCount = (cols + 1) * (rows + 1);

  let geometry = mesh.geometry;
  const reusable = geometry && geometry.userData && geometry.userData.lkSnowPatch
    && geometry.userData.lkSnowPatch.cols === cols && geometry.userData.lkSnowPatch.rows === rows;
  if(!reusable){
    if(geometry && geometry.dispose) geometry.dispose();
    geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2));
    const indices = new Uint32Array(cols * rows * 6);
    let n = 0;
    for(let r = 0; r < rows; r++){
      for(let c = 0; c < cols; c++){
        const a = r * (cols + 1) + c, b = a + 1, cIdx = a + cols + 1, d = cIdx + 1;
        indices[n++] = a; indices[n++] = cIdx; indices[n++] = b;
        indices[n++] = b; indices[n++] = cIdx; indices[n++] = d;
      }
    }
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.userData = geometry.userData || {};
    geometry.userData.lkSnowPatch = {cols, rows};
    mesh.geometry = geometry;
  }

  const position = geometry.attributes.position.array;
  const normal = geometry.attributes.normal.array;
  const uv = geometry.attributes.uv.array;
  const scratch = {x:0, y:1, z:0};
  let v = 0, t = 0;
  for(let r = 0; r <= rows; r++){
    const lz = -1 + 2 * r / rows;
    const wz = pz + lz * sz;
    for(let c = 0; c <= cols; c++){
      // Local X runs past the box's own +-1 out to +-apron: the slab draws the
      // mountainside it sits on, not just the piste it measures.
      const lx = lateralParam(-1 + 2 * c / cols, q.lateralBias) * apron;
      const wx = px + lx * sx;
      const wy = field.height(wx, wz);
      position[v] = lx;
      position[v + 1] = (wy - py) / sy;
      position[v + 2] = lz;
      field.normalInto(wx, wz, scratch);
      // The group is scaled non-uniformly, so a world normal has to be divided
      // by the scale to survive the transform back out. Skipping this is what
      // makes a stretched patch light as if it were flat.
      const nx = scratch.x / sx, ny = scratch.y / sy, nz = scratch.z / sz;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      normal[v] = nx / len;
      normal[v + 1] = ny / len;
      normal[v + 2] = nz / len;
      // UVs are the patch's own 0..1 span, NOT world metres: the procedural
      // surface cache multiplies UVs by a repeat it derives from the object's
      // real world size, so metres here would be applied twice. `retile` below
      // is handed the patch's true metre span so that derivation is right even
      // though the patch is `apron` times wider than its box.
      uv[t] = (lx / apron + 1) * .5;
      uv[t + 1] = (lz + 1) * .5;
      v += 3;
      t += 2;
    }
  }
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.normal.needsUpdate = true;
  geometry.attributes.uv.needsUpdate = true;
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();

  // The authored `surfaceTexture` prop already picked the snow kind and its
  // metres-per-repeat; only the object's apparent SIZE changed when the patch
  // grew past its box, so re-deriving the repeat from the true patch span is
  // all that is needed to keep texel density constant across the mountain.
  const surfaces = root.LK_ENGINE_PROCEDURAL_SURFACES;
  if(surfaces && surfaces.retile && mesh.material){
    surfaces.retile(mesh.material, {worldSize:{u:2 * sx * apron, v:2 * sz}});
  }
  return geometry;
}

// ================================================================ 05 install

/** Primitive props survive a save as `{global, slots}`; the factory flattens
 *  them the same way. Mirrored here so a sector still reads its own shape after
 *  the level has been saved and reopened once. */
function flatProps(props){
  if(!props || typeof props !== 'object') return null;
  if(!props.global && !props.slots) return props;
  return Object.assign({}, props, props.global || {});
}

function sectorSpecOf(object){
  const entry = object && object.userData && object.userData.addedEntry;
  if(!entry || entry.kind !== 'primitive') return null;
  const props = flatProps(entry.props);
  const spec = props && props.snowSector;
  return spec && typeof spec === 'object' ? spec : null;
}

/** The mesh a sector slab actually renders. `createPrimitive` wraps every
 *  primitive in a group with exactly one mesh in it. */
function slabMesh(group){
  if(!group || !group.children) return null;
  for(let i = 0; i < group.children.length; i++){
    const child = group.children[i];
    if(child && child.isMesh && !(child.userData && child.userData.editorLightHandle)) return child;
  }
  return null;
}

function create(GAME){
  const state = {
    field:null,
    signature:'',
    quality:'high',
    timer:SCAN_INTERVAL,
    slabs:[],
    listeners:[],
    builds:0,
  };

  function three(){ return root.THREE || null; }

  /** Global dials live on the terrain Logic Element, so they are exposed graph
   *  variables the Inspector edits like any other. Absent one, the defaults
   *  above apply and the mountain still builds. */
  function readOptions(){
    const registry = GAME && GAME.world && GAME.world.registry;
    if(!Array.isArray(registry)) return null;
    for(let i = 0; i < registry.length; i++){
      const graph = registry[i] && registry[i].userData && registry[i].userData.logicGraph;
      if(graph && graph.snowTerrain && typeof graph.snowTerrain === 'object') return graph.snowTerrain;
    }
    return null;
  }

  function collect(){
    const registry = GAME && GAME.world && GAME.world.registry;
    const out = [];
    if(!Array.isArray(registry)) return out;
    for(let i = 0; i < registry.length; i++){
      const group = registry[i];
      const spec = sectorSpecOf(group);
      if(!spec) continue;
      out.push({group, spec});
    }
    return out;
  }

  /** What a rebuild depends on: every sector's transform, its authored shape,
   *  and the global dials. Cheap enough to recompute four times a second. */
  function signatureOf(found, options){
    let sig = state.quality + '|' + found.length + '|';
    for(let i = 0; i < found.length; i++){
      const g = found[i].group, s = found[i].spec;
      sig += (g.position.x.toFixed(2) + ',' + g.position.y.toFixed(2) + ',' + g.position.z.toFixed(2) + ',' +
        g.scale.x.toFixed(2) + ',' + g.scale.y.toFixed(3) + ',' + g.scale.z.toFixed(2) + ',' +
        s.kind + ',' + s.order + ',' + finite(s.bank, 0).toFixed(3) + ',' + finite(s.amplitude, 0).toFixed(2) + ',' +
        (s.blend || 'smooth') + ',' + (s.band || '-') + ';');
    }
    if(options) sig += '|' + JSON.stringify(options);
    return sig;
  }

  /** Turn the live slabs into field sectors. The slab's transform IS the shape:
   *  position gives the centre-line and altitude, scale gives width and length. */
  function toSectors(found){
    return found.map((item, index) => Object.assign({}, item.spec, {
      order:finite(item.spec.order, index),
      x:item.group.position.x,
      y:item.group.position.y,
      z:item.group.position.z,
      halfWidth:Math.abs(item.group.scale.x) || 12,
      halfLength:Math.abs(item.group.scale.z) || 8,
    }));
  }

  function rebuild(force){
    const found = collect();
    const options = readOptions();
    if(options && typeof options.meshQuality === 'string' && MESH_QUALITY[options.meshQuality]) state.quality = options.meshQuality;
    const signature = signatureOf(found, options);
    if(!force && signature === state.signature) return false;
    state.signature = signature;

    if(found.length < 2){
      state.field = null;
      state.slabs.length = 0;
      if(GAME && GAME.world && GAME.world.characterGroundHeight && GAME.world.characterGroundHeight.__lkSnowTerrain){
        delete GAME.world.characterGroundHeight;
      }
      return true;
    }

    const field = createField(toSectors(found), options);
    if(!field) return false;
    state.field = field;
    state.slabs = found;
    state.builds++;

    const THREE = three();
    if(THREE){
      for(let i = 0; i < found.length; i++){
        const mesh = slabMesh(found[i].group);
        if(!mesh) continue;
        try { bakeSlab(THREE, mesh, found[i].group, field, state.quality); }
        catch(err){ if(root.console && console.warn) console.warn('Snow terrain: sector bake failed', err); }
      }
    }

    // The character solver asks the world first and only falls back to the
    // `slope-z` profile when nobody answers, so this one assignment is what
    // moves the rider off the box tops and onto the real surface.
    if(GAME && GAME.world){
      const hook = (x, z) => field.height(x, z);
      hook.__lkSnowTerrain = true;
      GAME.world.characterGroundHeight = hook;
    }
    state.listeners.forEach(listener => { try { listener(field); } catch(err){} });
    return true;
  }

  function update(dt){
    state.timer -= clamp(finite(dt, .016), 0, .25);
    if(state.timer > 0) return;
    state.timer = SCAN_INTERVAL;
    rebuild(false);
  }

  function onRebuild(listener){
    if(typeof listener !== 'function') return function(){};
    state.listeners.push(listener);
    if(state.field){ try { listener(state.field); } catch(err){} }
    return function(){
      const index = state.listeners.indexOf(listener);
      if(index >= 0) state.listeners.splice(index, 1);
    };
  }

  return Object.freeze({
    SCHEMA_VERSION,
    update, rebuild, onRebuild,
    field:() => state.field,
    slabs:() => state.slabs.slice(),
    quality:() => state.quality,
    setQuality(value){
      if(!MESH_QUALITY[value]) throw new Error('Snow terrain: unknown mesh quality "' + value + '"');
      state.quality = value;
      return rebuild(true);
    },
    stats:() => ({builds:state.builds, sectors:state.slabs.length, quality:state.quality, hasField:!!state.field}),
  });
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.snowTerrain && GAME.systems.snowTerrain.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.snowTerrain;
  const system = create(GAME);
  GAME.systems.snowTerrain = system;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkSnowTerrainFrame){
    GAME.hooks.__lkSnowTerrainFrame = true;
    GAME.hooks.frame.push(dt => system.update(dt));
  }
  return system;
}

root.LK_RUNTIME_SNOW_TERRAIN = Object.freeze({
  SCHEMA_VERSION,
  SECTOR_KINDS, SECTOR_KIND_IDS, SECTOR_BLENDS, SECTOR_BLEND_IDS,
  SNOW_BANDS, SNOW_BAND_IDS,
  MESH_QUALITY, MESH_QUALITY_IDS, FIELD_DEFAULTS,
  createField, normalizeSector, kindOf, blendOf, bandOf,
  lateralParam, valueNoise,
  create, install,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_SNOW_TERRAIN;
if(root.LOT_KING) install(root.LOT_KING);
})();
