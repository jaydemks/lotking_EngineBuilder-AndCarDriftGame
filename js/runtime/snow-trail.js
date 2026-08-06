/* =========================================================
   LOT KING - Persistent snow track

   The trench a snowboard leaves in the snow, and the berm of displaced snow
   along its edges. It STAYS carved for the whole descent: ride past a turn,
   look back up the hill, and your own line is still there.

   WHY IT IS BUILT THIS WAY
   -----------------------------------------------------------------
   The shipped AAA solutions to this problem all agree on the shape of the
   answer and disagree only on where they can afford to spend:

   * Batman: Arkham Origins (Barre-Brisebois, GDC 2014, "Deformable Snow
     Rendering") captures the deformers into a height field from a top-down
     orthographic pass and displaces the snow from it. Its DX11 path stores TWO
     channels - a minimum height field and a projected displacement - because
     snow pushed out of a footprint has to go somewhere, and the raised lip is
     most of what sells the print.
   * Rise of the Tomb Raider (Michels & Sikachev, GPU Pro 7, "Deferred Snow
     Deformation") keeps "a sort of height map that tracks Lara around, tiling
     at the edges so the sampling shader can wrap", and - the important part
     for our budget - applies it as a NORMAL MAP almost everywhere, promoting it
     to real geometric deformation only where the snow is deep enough to be
     worth tessellating.
   * Red Dead Redemption 2 and Horizon: The Frozen Wilds do the same thing again
     with a player-locked render target and hardware tessellation.

   Three things in that consensus do not survive contact with this project:
   compute shaders, hardware tessellation, and a per-frame render target - none
   of which a vanilla Three.js build targeting 60 FPS on an integrated GPU can
   spend. Three things change to make it fit, and each one is a deliberate
   trade:

   1. THE ATLAS IS IN PISTE SPACE, NOT WORLD SPACE. A world-space map covering a
      420 m mountain at any affordable resolution gives sub-metre texels at best
      - useless for a 42 cm trench. A map that tracks the rider like Lara's is
      high resolution but only remembers the last twenty metres, which is
      exactly the thing the committente asked NOT to happen. So the atlas is
      parameterised ALONG the run and ACROSS the corridor: U is distance from
      the summit, V is lateral position between the ropes. That is a far better
      fit for the shape of the data - a trench is long and thin, and it is
      always thin in V - and it covers the ENTIRE run permanently. At the `high`
      tier a texel is 41 cm along the fall line and 27 cm across it.
   2. DEFORMATION IS SPLIT THE WAY ROTTR SPLITS IT, one tier lower. The broad
      depression and the berm are real vertex displacement on the sector patches
      (js/runtime/snow-terrain.js already gives them a vertex grid). The trench
      EDGE - the part that is narrower than a vertex - is a fragment-side normal
      perturbation plus an albedo response. `low` drops the vertex half and
      keeps the fragment half, which still reads as a carved line.
   3. THE CAPTURE IS A CPU BRUSH, NOT A RENDER PASS. There is exactly one
      deformer (the board) and it moves a few metres per frame, so stamping a
      soft brush into a typed array costs microseconds, where an orthographic
      re-render would cost a whole extra pass. The array is uploaded to a
      DataTexture on a throttled clock, not every frame.

   WHAT STAYS AUTHORABLE
   Resolution tier, trench width and depth, berm height, carve response, spray
   rate and how long the snow takes to fill back in are all exposed variables on
   the Snow Mountain Controller, and `refillSeconds:0` - the shipped default -
   is what makes the track permanent.

   HOW THIS FILE IS ORGANISED
     00  identity and budget
     01  quality ladder   resolution per tier, and what each tier actually draws
     02  channels         what each byte of a texel means
     03  atlas model      pure: brush, berm, spray, refill  <- the tested core
     04  shader injection the sector material patch (THREE)
     05  spray            the pooled particle burst (THREE)
     06  install          rider tracking, upload throttle, terrain wiring
   ========================================================= */
(function(){
'use strict';

// ================================================================ 00 identity

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;

function finite(value, fallback){
  value = Number(value);
  return Number.isFinite(value) ? value : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return value < min ? min : value > max ? max : value; }
function clamp01(value){ return value < 0 ? 0 : value > 1 ? 1 : value; }

// ========================================================== 01 quality ladder
//
// Ordered cheapest first. `along` x `across` is the atlas; `vertex` is whether
// the sector patches are displaced at all or whether the track is fragment-only;
// `uploadHz` is how often the typed array is pushed to the GPU.
//
// The memory number that matters: an atlas is along * across * 4 bytes, and it
// is ONE texture for the whole mountain. `high` is 1024 x 160 x 4 = 640 KB,
// which is two ordinary 256px procedural surface sets. `ultra` is 1.3 MB.
//
// An unknown tier THROWS. A silent fallback here would quietly hand a low-end
// machine the ultra atlas and blame the frame rate on something else.

const QUALITY = Object.freeze({
  off:    {along:0,    across:0,   vertex:false, uploadHz:0,  spray:0,   label:'Off',    labelIt:'Disattivata'},
  low:    {along:256,  across:48,  vertex:false, uploadHz:12, spray:0,   label:'Low',    labelIt:'Bassa'},
  medium: {along:512,  across:96,  vertex:true,  uploadHz:15, spray:64,  label:'Medium', labelIt:'Media'},
  high:   {along:1024, across:160, vertex:true,  uploadHz:20, spray:128, label:'High',   labelIt:'Alta'},
  ultra:  {along:1536, across:224, vertex:true,  uploadHz:30, spray:224, label:'Ultra',  labelIt:'Massima'},
});
const QUALITY_IDS = Object.freeze(Object.keys(QUALITY));
// The Inspector exposes an integer 1..4 because a slider is the control an
// author reaches for; this is the one place that mapping is written down.
const QUALITY_BY_DETAIL = Object.freeze(['off', 'low', 'medium', 'high', 'ultra']);

function qualityOf(name){
  const tier = QUALITY[name];
  if(!tier) throw new Error('Snow trail: unknown quality tier "' + name + '"');
  return tier;
}
function qualityForDetail(detail){
  const index = Math.round(clamp(finite(detail, 3), 0, 4));
  return QUALITY_BY_DETAIL[index];
}

// ================================================================ 02 channels
//
// One texel is four bytes and each one answers a different question. They are
// listed in the order the shader reads them.
//
//   R  TRENCH    how far the board pushed the snow DOWN, 0..1 of trenchDepth.
//                Written with max(), never with +=: riding the same line twice
//                packs it, it does not dig a hole to the centre of the earth.
//   G  BERM      how much snow was displaced UP alongside, 0..1 of bermHeight.
//                This is Batman AO's second channel, and it is what stops the
//                track reading as a painted stripe.
//   B  FRESHNESS 255 the instant it is cut, decaying over `freshSeconds`. Fresh
//                snow scatters and sparkles; a cut that has sat in the sun is
//                packed and duller, and the shader uses this to tell them apart.
//   A  SPRAY     the impulse of the carve that made it. Feeds the particle
//                burst and a brief bright rim, and fades fastest of the four.

const CHANNEL = Object.freeze({trench:0, berm:1, freshness:2, spray:3});
// Seconds for each transient channel to return to zero. Trench and berm are
// governed by the authored `refillSeconds` instead, because they are the ones
// that are supposed to be permanent.
const FRESH_SECONDS = 26;
const SPRAY_SECONDS = 1.6;
// The refill sweep touches this fraction of the atlas per call, round-robin, so
// a 1536-row atlas never costs a whole decay pass in one frame.
const REFILL_SLICE = .08;

// ============================================================= 03 atlas model
//
// PURE. No THREE, no DOM, no GAME: this is the part the node tests drive, and
// it is the whole of the deformation model. Everything below section 03 only
// moves these bytes onto the GPU or reacts to them.

/**
 * @param {object} spec
 *   along, across        atlas resolution, from the quality tier
 *   trenchDepth          metres the R channel means at full scale
 *   bermHeight           metres the G channel means at full scale
 *   refillSeconds        0 = permanent (the default), else seconds to fill in
 */
function createTrailAtlas(spec){
  const src = spec && typeof spec === 'object' ? spec : {};
  const along = Math.max(8, Math.round(finite(src.along, 1024)));
  const across = Math.max(4, Math.round(finite(src.across, 160)));
  const data = new Uint8Array(along * across * 4);
  const state = {
    trenchDepth:Math.max(.01, finite(src.trenchDepth, .16)),
    bermHeight:Math.max(0, finite(src.bermHeight, .1)),
    refillSeconds:Math.max(0, finite(src.refillSeconds, 0)),
    dirty:false,
    stamps:0,
    texelsTouched:0,
    sweep:0,
  };

  function index(iu, iv){ return (iu * across + iv) * 4; }

  /** Write one channel with max(): the deepest pass over a texel wins. */
  function writeMax(offset, channel, value){
    const byte = value <= 0 ? 0 : value >= 1 ? 255 : (value * 255) | 0;
    if(data[offset + channel] >= byte) return false;
    data[offset + channel] = byte;
    return true;
  }

  /**
   * Stamp one brush footprint at a piste coordinate.
   *
   * `halfWidthV` and `halfWidthU` are the brush radii expressed in ATLAS
   * TEXELS, not metres: the caller owns the conversion because the corridor
   * width - and therefore metres-per-texel across - changes down the run.
   *
   * The berm is not a separate stamp. It is the same footprint sampled one
   * trench-width further out, which is what keeps the lip glued to the trench
   * however sharply the rider is turning.
   */
  function stamp(u, v, options){
    const opts = options || {};
    if(!(u >= 0 && u <= 1) || !(v >= -.2 && v <= 1.2)) return 0;
    const halfV = Math.max(.5, finite(opts.halfWidthV, 1.5));
    const halfU = Math.max(.5, finite(opts.halfWidthU, halfV));
    const depth = clamp01(finite(opts.depth, 1));
    const berm = clamp01(finite(opts.berm, 0));
    const spray = clamp01(finite(opts.spray, 0));
    const cu = u * (along - 1), cv = v * (across - 1);
    const u0 = Math.max(0, Math.floor(cu - halfU)), u1 = Math.min(along - 1, Math.ceil(cu + halfU));
    const v0 = Math.max(0, Math.floor(cv - halfV * 3)), v1 = Math.min(across - 1, Math.ceil(cv + halfV * 3));
    let touched = 0;
    for(let iu = u0; iu <= u1; iu++){
      const du = (iu - cu) / halfU;
      if(du < -1 || du > 1) continue;
      const alongFall = 1 - du * du;
      for(let iv = v0; iv <= v1; iv++){
        const dv = (iv - cv) / halfV;
        const abs = dv < 0 ? -dv : dv;
        const offset = index(iu, iv);
        let wrote = false;
        // -- the trench: a smooth dish, deepest on the line the board rode.
        if(abs <= 1){
          const dish = (1 - abs * abs) * alongFall;
          if(writeMax(offset, CHANNEL.trench, depth * dish)) wrote = true;
          if(spray > 0 && writeMax(offset, CHANNEL.spray, spray * dish)) wrote = true;
        }
        // -- the berm: the displaced snow, in a ring just outside the trench.
        // Peaks at 1.6 trench half-widths and is gone by 3.
        if(berm > 0 && abs > .75 && abs < 3){
          const ring = 1 - Math.abs(abs - 1.6) / 1.4;
          if(ring > 0 && writeMax(offset, CHANNEL.berm, berm * ring * ring * alongFall)) wrote = true;
        }
        if(wrote){
          data[offset + CHANNEL.freshness] = 255;
          touched++;
        }
      }
    }
    if(touched){ state.dirty = true; state.texelsTouched += touched; }
    state.stamps++;
    return touched;
  }

  /**
   * Stamp a continuous stroke between two piste coordinates.
   * A rider at 24 m/s covers 40 cm per frame at 60 FPS and several metres at 15,
   * so stamping only at the sample points leaves a dashed line. The literature's
   * answer for the render-target version is to emit particles over DISTANCE
   * rather than over time; this is the same fix on the CPU.
   */
  function stroke(fromU, fromV, toU, toV, options){
    const opts = options || {};
    const du = (toU - fromU) * (along - 1), dv = (toV - fromV) * (across - 1);
    const span = Math.sqrt(du * du + dv * dv);
    const halfV = Math.max(.5, finite(opts.halfWidthV, 1.5));
    // Half a brush radius between stamps: closer wastes work, further leaves
    // scallops in what should be a continuous cut.
    const steps = Math.max(1, Math.min(512, Math.ceil(span / Math.max(.35, halfV * .5))));
    let touched = 0;
    for(let i = 1; i <= steps; i++){
      const t = i / steps;
      touched += stamp(fromU + (toU - fromU) * t, fromV + (toV - fromV) * t, opts);
    }
    return touched;
  }

  /** Read a texel back in metres. Nearest sample: this is the gameplay-side
   *  query (how deep is the snow here), not the rendering one. */
  function sample(u, v){
    const iu = Math.round(clamp01(u) * (along - 1));
    const iv = Math.round(clamp01(v) * (across - 1));
    const offset = index(iu, iv);
    return {
      trench:data[offset + CHANNEL.trench] / 255 * state.trenchDepth,
      berm:data[offset + CHANNEL.berm] / 255 * state.bermHeight,
      freshness:data[offset + CHANNEL.freshness] / 255,
      spray:data[offset + CHANNEL.spray] / 255,
    };
  }

  /** Advance the transient channels, and the permanent ones only if the level
   *  asked for the snow to fill back in. Works on a rolling slice of the atlas
   *  so the per-frame cost is bounded no matter how big the tier is. */
  function refill(dt){
    const step = clamp(finite(dt, .016), 0, .25);
    if(step <= 0) return 0;
    // The sweep is round-robin, so a cell is reached once per full pass and not
    // once per call. Each visit therefore has to account for the whole time
    // since the previous one; charging it only `step` would silently stretch
    // every authored decay by the sweep period (1 / REFILL_SLICE calls).
    const rows = Math.max(1, Math.round(along * REFILL_SLICE));
    const visitStep = step * (along / rows);
    const freshDrop = Math.max(1, Math.round(255 * visitStep / FRESH_SECONDS));
    const sprayDrop = Math.max(1, Math.round(255 * visitStep / SPRAY_SECONDS));
    const fillDrop = state.refillSeconds > 0 ? Math.max(1, Math.round(255 * visitStep / state.refillSeconds)) : 0;
    let changed = 0;
    for(let r = 0; r < rows; r++){
      const iu = (state.sweep + r) % along;
      for(let iv = 0; iv < across; iv++){
        const offset = index(iu, iv);
        const fresh = data[offset + CHANNEL.freshness];
        if(fresh > 0){ data[offset + CHANNEL.freshness] = fresh > freshDrop ? fresh - freshDrop : 0; changed++; }
        const spray = data[offset + CHANNEL.spray];
        if(spray > 0){ data[offset + CHANNEL.spray] = spray > sprayDrop ? spray - sprayDrop : 0; changed++; }
        if(fillDrop > 0){
          const trench = data[offset + CHANNEL.trench];
          if(trench > 0){ data[offset + CHANNEL.trench] = trench > fillDrop ? trench - fillDrop : 0; changed++; }
          const berm = data[offset + CHANNEL.berm];
          if(berm > 0){ data[offset + CHANNEL.berm] = berm > fillDrop ? berm - fillDrop : 0; changed++; }
        }
      }
    }
    state.sweep = (state.sweep + rows) % along;
    if(changed) state.dirty = true;
    return changed;
  }

  function clear(){
    data.fill(0);
    state.dirty = true;
    state.stamps = 0;
    state.texelsTouched = 0;
    return true;
  }

  return Object.freeze({
    along, across, data,
    get dirty(){ return state.dirty; },
    markClean(){ state.dirty = false; return true; },
    get trenchDepth(){ return state.trenchDepth; },
    get bermHeight(){ return state.bermHeight; },
    get refillSeconds(){ return state.refillSeconds; },
    configure(patch){
      const src = patch || {};
      if(src.trenchDepth != null) state.trenchDepth = Math.max(.01, finite(src.trenchDepth, state.trenchDepth));
      if(src.bermHeight != null) state.bermHeight = Math.max(0, finite(src.bermHeight, state.bermHeight));
      if(src.refillSeconds != null) state.refillSeconds = Math.max(0, finite(src.refillSeconds, state.refillSeconds));
      return true;
    },
    stamp, stroke, sample, refill, clear,
    bytes:() => data.length,
    stats:() => ({along, across, bytes:data.length, stamps:state.stamps, texels:state.texelsTouched,
      trenchDepth:state.trenchDepth, bermHeight:state.bermHeight, refillSeconds:state.refillSeconds}),
  });
}

/**
 * The rider-side half of the model, also pure: how hard the board is cutting
 * right now, from its speed and how far it is laid over. Separated from the
 * atlas so the tests can assert the RESPONSE curve without touching pixels.
 *
 * A board carving on edge at speed throws a wall of snow; the same board
 * running flat and slow barely marks it. `carveBoost` is the authored multiplier
 * between those two states.
 */
function cutStrength(speed, carve, config){
  const cfg = config || {};
  const maxSpeed = Math.max(1, finite(cfg.maxSpeed, 24));
  const boost = clamp(finite(cfg.carveBoost, 1.8), 1, 4);
  const lean = clamp01(Math.abs(finite(carve, 0)) / Math.max(.05, finite(cfg.maxCarveAngle, .78)));
  // Speed contributes on a curve, not linearly: the difference between crawling
  // and moving is most of the effect, and the top end saturates.
  const drive = Math.pow(clamp01(Math.abs(finite(speed, 0)) / maxSpeed), .65);
  const edge = 1 + (boost - 1) * lean;
  return {
    depth:clamp01(drive * edge * .8),
    berm:clamp01(drive * lean * edge * .75),
    spray:clamp01(drive * lean * lean * edge * .9),
    // A board on edge cuts a wider swath than one running flat.
    widthScale:1 + lean * .55,
  };
}

// ========================================================= 04 shader injection
//
// The sector patches are ordinary MeshStandardMaterials that snow-terrain.js
// already gave a vertex grid and a procedural snow surface. This adds the atlas
// on top of them without replacing either.
//
// Chaining matters: scene-store.js and procedural-surfaces.js may already have
// installed an `onBeforeCompile`, so the previous one is captured and called
// first rather than overwritten.

const TRAIL_UNIFORM = 'lkSnowTrailMap';

const VERTEX_PARS = [
  'uniform sampler2D lkSnowTrailMap;',
  'uniform vec4 lkSnowRun;',       // x: summit Z, y: 1/run length, z: width scale, w: vertex enable
  'uniform vec4 lkSnowDeform;',    // x: trench depth (m), y: berm height (m), z: unused, w: unused
  'uniform vec3 lkSnowKnotA;',     // (z, centreX, halfWidth) uphill knot
  'uniform vec3 lkSnowKnotB;',     // (z, centreX, halfWidth) this sector
  'uniform vec3 lkSnowKnotC;',     // (z, centreX, halfWidth) downhill knot
  'varying vec2 lkSnowUv;',
  'varying float lkSnowInside;',
  // Piste space from world XZ. The slab only ever spans its own sector, so the
  // three knots bracketing it are all the spine this shader needs - no loop, no
  // lookup texture, and the interpolation matches the CPU field exactly.
  'vec3 lkSnowSpine(float wz){',
  '  vec3 lo = wz < lkSnowKnotB.x ? lkSnowKnotA : lkSnowKnotB;',
  '  vec3 hi = wz < lkSnowKnotB.x ? lkSnowKnotB : lkSnowKnotC;',
  '  float span = hi.x - lo.x;',
  '  float t = span == 0.0 ? 0.0 : clamp((wz - lo.x) / span, 0.0, 1.0);',
  '  float e = t * t * (3.0 - 2.0 * t);',
  '  return vec3(wz, mix(lo.y, hi.y, e), mix(lo.z, hi.z, e));',
  '}',
  'vec2 lkSnowPiste(vec3 world){',
  '  vec3 spine = lkSnowSpine(world.z);',
  '  float u = clamp((world.z - lkSnowRun.x) * lkSnowRun.y, 0.0, 1.0);',
  '  float v = 0.5 + (world.x - spine.y) / max(0.001, 2.0 * spine.z * lkSnowRun.z);',
  '  return vec2(u, v);',
  '}',
].join('\n');

const VERTEX_MAIN = [
  '#include <begin_vertex>',
  '{',
  '  vec3 lkSnowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
  '  lkSnowUv = lkSnowPiste(lkSnowWorld);',
  '  lkSnowInside = step(0.0, lkSnowUv.y) * step(lkSnowUv.y, 1.0);',
  '  if(lkSnowRun.w > 0.5 && lkSnowInside > 0.5){',
  '    vec4 lkSnowTexel = texture2D(lkSnowTrailMap, lkSnowUv);',
  '    float lkSnowDrop = lkSnowTexel.r * lkSnowDeform.x - lkSnowTexel.g * lkSnowDeform.y;',
  // The displacement is along WORLD up, not along the normal: snow settles
  // downward under gravity, and displacing along a banked normal would slide
  // the trench sideways out of its own painted line.
  '    vec3 lkSnowUp = normalize((inverse(mat3(modelMatrix)) * vec3(0.0, 1.0, 0.0)));',
  '    transformed -= lkSnowUp * lkSnowDrop;',
  '  }',
  '}',
].join('\n');

const FRAGMENT_PARS = [
  'uniform sampler2D lkSnowTrailMap;',
  'uniform vec4 lkSnowDeform;',
  'uniform vec4 lkSnowLook;',   // x: normal strength, y: sparkle, z: unused, w: unused
  'varying vec2 lkSnowUv;',
  'varying float lkSnowInside;',
].join('\n');

// Runs after the normal has been resolved so it can perturb the real one, and
// before lighting so the perturbation is actually lit.
const FRAGMENT_MAIN = [
  '#include <normal_fragment_maps>',
  'if(lkSnowInside > 0.5){',
  '  vec2 lkSnowStep = vec2(1.0) / vec2(textureSize(lkSnowTrailMap, 0));',
  '  vec4 lkSnowC = texture2D(lkSnowTrailMap, lkSnowUv);',
  '  float lkSnowL = texture2D(lkSnowTrailMap, lkSnowUv - vec2(0.0, lkSnowStep.y)).r;',
  '  float lkSnowR = texture2D(lkSnowTrailMap, lkSnowUv + vec2(0.0, lkSnowStep.y)).r;',
  '  float lkSnowD = texture2D(lkSnowTrailMap, lkSnowUv - vec2(lkSnowStep.x, 0.0)).r;',
  '  float lkSnowU = texture2D(lkSnowTrailMap, lkSnowUv + vec2(lkSnowStep.x, 0.0)).r;',
  // The trench WALL is narrower than a vertex at every tier, so the edge of the
  // cut lives here: the lateral gradient of the depth channel bent into the
  // shading normal. This is the RotTR "normal map almost everywhere" half.
  '  vec3 lkSnowBend = vec3((lkSnowL - lkSnowR) * lkSnowLook.x, 0.0, (lkSnowD - lkSnowU) * lkSnowLook.x * 0.35);',
  '  normal = normalize(normal + lkSnowBend);',
  '  float lkSnowCut = lkSnowC.r;',
  '  float lkSnowBerm = lkSnowC.g;',
  // Inside the cut the snow is compacted and shaded by its own walls; the berm
  // lip is loose, fresh crystal and catches the light.
  '  diffuseColor.rgb *= 1.0 - lkSnowCut * 0.16;',
  '  diffuseColor.rgb += lkSnowBerm * 0.09 * lkSnowC.b;',
  // Fresh spray: a brief bright rim on the snow that was thrown a moment ago.
  '  diffuseColor.rgb += lkSnowC.a * 0.12;',
  // View-dependent glint. A static texture cannot do the flake that only flares
  // at one angle, so the high-frequency half of the sparkle is done here: a
  // cheap hash gated on the view-normal alignment, additive because glitter is
  // not energy conserving.
  '  if(lkSnowLook.y > 0.0){',
  '    vec2 lkSnowGrain = floor(lkSnowUv * 2048.0);',
  '    float lkSnowHash = fract(sin(dot(lkSnowGrain, vec2(12.9898, 78.233))) * 43758.5453);',
  '    float lkSnowFacing = pow(clamp(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 6.0);',
  '    float lkSnowFlake = step(0.9975, lkSnowHash) * lkSnowFacing;',
  '    diffuseColor.rgb += lkSnowFlake * lkSnowLook.y * (0.4 + 0.6 * lkSnowC.b);',
  '  }',
  '}',
].join('\n');

/** Build the uniform block one sector material needs. Values are patched in
 *  place afterwards, so the object identity survives a terrain rebuild. */
function makeUniforms(THREE, texture, tier){
  return {
    [TRAIL_UNIFORM]:{value:texture},
    lkSnowRun:{value:new THREE.Vector4(0, 1, 1.35, tier.vertex ? 1 : 0)},
    lkSnowDeform:{value:new THREE.Vector4(.16, .1, 0, 0)},
    lkSnowLook:{value:new THREE.Vector4(2.6, tier.spray > 0 ? .35 : 0, 0, 0)},
    lkSnowKnotA:{value:new THREE.Vector3(-1, 0, 12)},
    lkSnowKnotB:{value:new THREE.Vector3(0, 0, 12)},
    lkSnowKnotC:{value:new THREE.Vector3(1, 0, 12)},
  };
}

/** Install the injection on one material, chaining whatever was already there.
 *  Returns the uniform block, which the caller keeps and mutates. */
function patchMaterial(THREE, material, texture, tier){
  if(!material || !(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) return null;
  const activeRenderer=typeof window!=='undefined'&&window.LOT_KING&&window.LOT_KING.core&&window.LOT_KING.core.renderer;
  if(activeRenderer&&activeRenderer.isWebGPURenderer) return null;
  material.userData = material.userData || {};
  if(material.userData.lkSnowTrail) return material.userData.lkSnowTrail;
  const uniforms = makeUniforms(THREE, texture, tier);
  const previous = typeof material.onBeforeCompile === 'function' ? material.onBeforeCompile : null;
  material.onBeforeCompile = function(shader, renderer){
    if(previous) previous.call(this, shader, renderer);
    Object.keys(uniforms).forEach(key => { shader.uniforms[key] = uniforms[key]; });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERTEX_PARS)
      .replace('#include <begin_vertex>', VERTEX_MAIN);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAGMENT_PARS)
      .replace('#include <normal_fragment_maps>', FRAGMENT_MAIN);
  };
  // Two materials that differ only in their uniform VALUES must still share a
  // compiled program; two that differ in whether they carry the injection at
  // all must not.
  material.customProgramCacheKey = function(){ return 'lk-snow-trail-1'; };
  material.userData.lkSnowTrail = uniforms;
  material.needsUpdate = true;
  return uniforms;
}

// ==================================================================== 05 spray
//
// The snow that leaves the trench rather than piling beside it. One pooled
// Points cloud for the whole mountain, one geometry, one material, and a fixed
// particle count from the quality tier: nothing is allocated after the pool is
// built, which is the only way a per-frame effect stays free.

function createSpray(THREE, scene, count){
  if(!THREE || !scene || count <= 0) return null;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const velocity = new Float32Array(count * 3);
  const life = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.PointsMaterial({
    color:0xf2f8ff, size:.34, sizeAttenuation:true,
    transparent:true, opacity:.75, depthWrite:false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = 'Snow Spray';
  points.renderOrder = 3;
  scene.add(points);
  let cursor = 0;

  /** Throw `amount` particles from a point, biased backwards along the board. */
  function burst(x, y, z, dirX, dirZ, amount, energy){
    const n = Math.max(0, Math.min(count, Math.round(amount)));
    for(let i = 0; i < n; i++){
      const slot = cursor = (cursor + 1) % count;
      const p = slot * 3;
      positions[p] = x + (Math.random() - .5) * .5;
      positions[p + 1] = y + .05 + Math.random() * .2;
      positions[p + 2] = z + (Math.random() - .5) * .5;
      const spread = (Math.random() - .5) * 2.2;
      velocity[p] = -dirX * energy * (.4 + Math.random() * .7) + spread;
      velocity[p + 1] = 1.2 + Math.random() * 2.4 * energy;
      velocity[p + 2] = -dirZ * energy * (.4 + Math.random() * .7) + spread;
      life[slot] = .45 + Math.random() * .55;
      sizes[slot] = .2 + Math.random() * .35;
    }
    if(n) geometry.attributes.position.needsUpdate = true;
  }

  function update(dt){
    const step = clamp(finite(dt, .016), 0, .1);
    let live = 0;
    for(let i = 0; i < count; i++){
      if(life[i] <= 0) continue;
      life[i] -= step;
      const p = i * 3;
      if(life[i] <= 0){
        // Parked far below the mountain rather than removed: a Points cloud has
        // a fixed vertex count and hiding a particle is cheaper than resizing.
        positions[p + 1] = -9999;
        continue;
      }
      velocity[p + 1] -= 9.4 * step;
      positions[p] += velocity[p] * step;
      positions[p + 1] += velocity[p + 1] * step;
      positions[p + 2] += velocity[p + 2] * step;
      live++;
    }
    geometry.attributes.position.needsUpdate = true;
    material.opacity = .75;
    points.visible = live > 0;
    return live;
  }

  function dispose(){
    if(points.parent) points.parent.remove(points);
    geometry.dispose();
    material.dispose();
  }

  return {points, burst, update, dispose, capacity:count};
}

// ================================================================== 06 install

/** Read the authored `snowTrail` block off whichever Logic Element carries it.
 *  Same contract snow-terrain.js uses for `snowTerrain`. */
function readConfig(GAME){
  const registry = GAME && GAME.world && GAME.world.registry;
  if(!Array.isArray(registry)) return null;
  for(let i = 0; i < registry.length; i++){
    const graph = registry[i] && registry[i].userData && registry[i].userData.logicGraph;
    if(graph && graph.snowTrail && typeof graph.snowTrail === 'object') return graph.snowTrail;
  }
  return null;
}

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  // A named tier is authoritative. An unknown name is an authoring mistake, so
  // it throws here rather than quietly falling back to the detail slider and
  // shipping a quality the author never asked for.
  const quality = typeof src.quality === 'string'
    ? src.quality
    : qualityForDetail(src.detail == null ? 3 : src.detail);
  qualityOf(quality);
  return {
    enabled:src.enabled !== false,
    quality,
    refillSeconds:Math.max(0, finite(src.refillSeconds, 0)),
    trenchWidth:clamp(finite(src.trenchWidth, .42), .1, 2),
    trenchDepth:clamp(finite(src.trenchDepth, .16), 0, .8),
    bermHeight:clamp(finite(src.bermHeight, .1), 0, .6),
    carveBoost:clamp(finite(src.carveBoost, 1.8), 1, 4),
    sprayRate:clamp(finite(src.sprayRate, 1), 0, 3),
  };
}

function create(GAME){
  const state = {
    config:normalizeConfig(null),
    atlas:null,
    texture:null,
    tier:QUALITY.high,
    field:null,
    spray:null,
    materials:[],
    riders:new Map(),
    uploadTimer:0,
    scanTimer:0,
    stamps:0,
    signature:'',
  };

  function three(){ return root.THREE || null; }

  // --- atlas lifecycle -------------------------------------------------------

  function rebuildAtlas(){
    const tier = qualityOf(state.config.quality);
    state.tier = tier;
    if(!state.config.enabled || tier.along === 0){
      state.atlas = null;
      disposeTexture();
      return false;
    }
    state.atlas = createTrailAtlas({
      along:tier.along, across:tier.across,
      trenchDepth:state.config.trenchDepth,
      bermHeight:state.config.bermHeight,
      refillSeconds:state.config.refillSeconds,
    });
    disposeTexture();
    const THREE = three();
    if(THREE && THREE.DataTexture){
      const texture = new THREE.DataTexture(state.atlas.data, tier.along, tier.across, THREE.RGBAFormat, THREE.UnsignedByteType);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      // The atlas is DATA. Decoding it as sRGB would bend the depth curve.
      if(THREE.NoColorSpace !== undefined) texture.colorSpace = THREE.NoColorSpace;
      texture.generateMipmaps = false;
      texture.flipY = false;
      texture.needsUpdate = true;
      texture.name = 'lk-snow-trail';
      state.texture = texture;
    }
    state.materials.length = 0;
    return true;
  }

  function disposeTexture(){
    if(state.texture && state.texture.dispose) state.texture.dispose();
    state.texture = null;
  }

  // --- sector materials ------------------------------------------------------

  /** Attach the injection to every sector patch and point its knot uniforms at
   *  the right piece of the spine. Re-run whenever the terrain rebuilds, since
   *  a rebuild can change both the sector list and the material identities. */
  function attach(field){
    state.field = field;
    const THREE = three();
    const terrain = GAME && GAME.systems && GAME.systems.snowTerrain;
    if(!THREE || !field || !terrain || !state.texture) return 0;
    const slabs = terrain.slabs ? terrain.slabs() : [];
    const sectors = field.sectors;
    state.materials.length = 0;
    let attached = 0;
    for(let i = 0; i < slabs.length; i++){
      const group = slabs[i].group;
      let mesh = null;
      for(let c = 0; c < (group.children || []).length; c++){
        if(group.children[c] && group.children[c].isMesh){ mesh = group.children[c]; break; }
      }
      if(!mesh || !mesh.material) continue;
      const uniforms = patchMaterial(THREE, mesh.material, state.texture, state.tier);
      if(!uniforms) continue;
      // Which spine knots bracket this slab. `sectors` is sorted along the fall
      // line by createField, so the neighbours are simply the adjacent entries.
      const order = Math.max(0, Math.min(sectors.length - 1, i));
      const a = sectors[Math.max(0, order - 1)];
      const b = sectors[order];
      const c = sectors[Math.min(sectors.length - 1, order + 1)];
      uniforms.lkSnowKnotA.value.set(a.z, a.x, a.halfWidth);
      uniforms.lkSnowKnotB.value.set(b.z, b.x, b.halfWidth);
      uniforms.lkSnowKnotC.value.set(c.z, c.x, c.halfWidth);
      uniforms.lkSnowRun.value.set(field.summitZ, 1 / (field.runLength || 1),
        finite(field.options.trailWidthScale, 1.35), state.tier.vertex ? 1 : 0);
      uniforms.lkSnowDeform.value.set(state.config.trenchDepth, state.config.bermHeight, 0, 0);
      uniforms[TRAIL_UNIFORM].value = state.texture;
      state.materials.push(uniforms);
      attached++;
    }
    return attached;
  }

  // --- rider tracking --------------------------------------------------------

  function riderRecord(id){
    let record = state.riders.get(id);
    if(!record){ record = {u:-1, v:-1, sprayCarry:0}; state.riders.set(id, record); }
    return record;
  }

  /**
   * Record one rider's board for this frame. World position in, atlas texels
   * out. Exposed on the system so a test - and any other Pawn that wants to
   * leave a mark - can drive it without a scene.
   */
  function track(id, x, z, speed, carve, dt){
    const atlas = state.atlas, field = state.field;
    if(!atlas || !field) return 0;
    const u = field.pisteU(z);
    const v = field.pisteV(x, z);
    if(!(v > -.15 && v < 1.15)) return 0;
    const cut = cutStrength(speed, carve, {
      carveBoost:state.config.carveBoost,
      maxSpeed:24,
      maxCarveAngle:.78,
    });
    // Metres per texel across the corridor, at THIS point of the run: the
    // corridor narrows and widens, so a fixed texel width would make the trench
    // fatten out on the wide sectors.
    const corridorMetres = 2 * field.trailHalfWidth(z);
    const metresPerTexel = corridorMetres / atlas.across;
    const halfWidthV = Math.max(.6, state.config.trenchWidth * cut.widthScale * .5 / Math.max(.001, metresPerTexel));
    const runMetresPerTexel = Math.abs(field.runLength) / atlas.along;
    const halfWidthU = Math.max(.6, state.config.trenchWidth * .5 / Math.max(.001, runMetresPerTexel));
    const options = {
      halfWidthV, halfWidthU,
      depth:cut.depth, berm:cut.berm, spray:cut.spray,
    };
    const record = riderRecord(id);
    let touched;
    if(record.u < 0){ touched = atlas.stamp(u, v, options); }
    else { touched = atlas.stroke(record.u, record.v, u, v, options); }
    record.u = u; record.v = v;
    state.stamps++;

    // Spray follows the same cut strength, emitted over distance rather than
    // over time so it does not thin out at low frame rates.
    if(state.spray && state.config.sprayRate > 0 && cut.spray > .12){
      record.sprayCarry += cut.spray * state.config.sprayRate * Math.abs(finite(speed, 0)) * clamp(finite(dt, .016), 0, .1) * 2.4;
      if(record.sprayCarry >= 1){
        const amount = Math.min(12, Math.floor(record.sprayCarry));
        record.sprayCarry -= amount;
        const y = field.height(x, z);
        const heading = Math.sin(finite(carve, 0));
        state.spray.burst(x, y, z, heading, 1, amount, .6 + cut.spray);
      }
    }
    return touched;
  }

  function forget(id){ return state.riders.delete(id); }

  // --- frame -----------------------------------------------------------------

  function pullConfig(){
    const authored = readConfig(GAME);
    const next = normalizeConfig(authored);
    const signature = JSON.stringify(next);
    if(signature === state.signature) return false;
    const resized = !state.atlas || next.quality !== state.config.quality || next.enabled !== state.config.enabled;
    state.config = next;
    state.signature = signature;
    if(resized) rebuildAtlas();
    else if(state.atlas) state.atlas.configure(next);
    // Sector materials hold the metre scales as uniforms, so a dial change has
    // to be pushed even when the atlas itself did not change size.
    state.materials.forEach(uniforms => {
      uniforms.lkSnowDeform.value.set(next.trenchDepth, next.bermHeight, 0, 0);
      uniforms.lkSnowRun.value.w = qualityOf(next.quality).vertex ? 1 : 0;
    });
    if(resized) attach(state.field);
    return true;
  }

  function ensureSpray(){
    const THREE = three();
    const scene = GAME && GAME.core && GAME.core.scene;
    const want = state.config.enabled ? state.tier.spray : 0;
    if(state.spray && state.spray.capacity === want) return state.spray;
    if(state.spray){ state.spray.dispose(); state.spray = null; }
    if(THREE && scene && want > 0) state.spray = createSpray(THREE, scene, want);
    return state.spray;
  }

  /** Find every rider whose Pawn carries snowboard physics and record its board.
   *  Reads the state the ride system already publishes rather than re-deriving
   *  speed and lean from the transform. */
  function trackPawns(dt){
    if(!(GAME && GAME.state && GAME.state.started && GAME.pawns && GAME.pawns.list)){
      if(state.riders.size) state.riders.clear();
      return 0;
    }
    let tracked = 0;
    GAME.pawns.list().forEach(pawn => {
      if(!(pawn && pawn.config && pawn.config.snowboardPhysics)) return;
      const owner = pawn.owner;
      if(!(owner && owner.position)) return;
      const airborne = !!(pawn.state && pawn.state.airborne);
      if(airborne){ riderRecord(pawn.id).u = -1; return; }
      const speed = pawn.state ? finite(pawn.state.snowboardSpeed, 0) : 0;
      const carve = pawn.state ? finite(pawn.state.snowboardCarve, 0) : 0;
      track(pawn.id, owner.position.x, owner.position.z, speed, carve, dt);
      tracked++;
    });
    return tracked;
  }

  function update(dt){
    const step = clamp(finite(dt, .016), 0, .25);
    state.scanTimer -= step;
    if(state.scanTimer <= 0){ state.scanTimer = .5; pullConfig(); }
    if(!state.config.enabled || !state.atlas) return;
    ensureSpray();
    // The terrain owns the field; picking it up here rather than subscribing
    // keeps the two modules independent - snow-trail works with any field.
    const terrain = GAME && GAME.systems && GAME.systems.snowTerrain;
    const field = terrain && terrain.field ? terrain.field() : null;
    if(field && field !== state.field) attach(field);
    if(!state.field) return;

    trackPawns(step);
    state.atlas.refill(step);
    if(state.spray) state.spray.update(step);

    // Upload on the tier's clock, not per frame: a 640 KB texture pushed 60
    // times a second is 38 MB/s of bus traffic for detail nobody can see move.
    const period = state.tier.uploadHz > 0 ? 1 / state.tier.uploadHz : 0;
    state.uploadTimer -= step;
    if(period > 0 && state.uploadTimer <= 0){
      state.uploadTimer = period;
      if(state.atlas.dirty && state.texture){
        state.texture.needsUpdate = true;
        state.atlas.markClean();
      }
    }
  }

  return Object.freeze({
    SCHEMA_VERSION,
    update, track, forget, attach,
    atlas:() => state.atlas,
    texture:() => state.texture,
    config:() => Object.assign({}, state.config),
    setConfig(patch){
      state.signature = '';
      const next = normalizeConfig(Object.assign({}, state.config, patch || {}));
      const resized = !state.atlas || next.quality !== state.config.quality || next.enabled !== state.config.enabled;
      state.config = next;
      if(resized){ rebuildAtlas(); attach(state.field); }
      else if(state.atlas) state.atlas.configure(next);
      return Object.assign({}, state.config);
    },
    clear(){ return state.atlas ? state.atlas.clear() : false; },
    stats:() => Object.assign({
      quality:state.config.quality,
      enabled:state.config.enabled,
      materials:state.materials.length,
      riders:state.riders.size,
      spray:state.spray ? state.spray.capacity : 0,
    }, state.atlas ? state.atlas.stats() : {along:0, across:0, bytes:0}),
  });
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.snowTrail && GAME.systems.snowTrail.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.snowTrail;
  const system = create(GAME);
  GAME.systems.snowTrail = system;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkSnowTrailFrame){
    GAME.hooks.__lkSnowTrailFrame = true;
    GAME.hooks.frame.push(dt => system.update(dt));
  }
  return system;
}

root.LK_RUNTIME_SNOW_TRAIL = Object.freeze({
  SCHEMA_VERSION,
  QUALITY, QUALITY_IDS, QUALITY_BY_DETAIL, CHANNEL,
  FRESH_SECONDS, SPRAY_SECONDS,
  qualityOf, qualityForDetail, normalizeConfig,
  createTrailAtlas, cutStrength,
  patchMaterial, createSpray,
  create, install,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_SNOW_TRAIL;
if(root.LOT_KING) install(root.LOT_KING);
})();
