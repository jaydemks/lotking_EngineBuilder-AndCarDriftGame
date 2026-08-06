/* =========================================================
   LOT KING - Procedural surface materials

   Editor primitives ship as flat untextured colour, which reads as a greybox
   no matter how carefully a level is dressed. This module gives any primitive a
   real PBR surface - albedo grain, normal relief and roughness variation -
   generated at runtime on a 2D canvas. No binary assets, no network, nothing to
   package: a level template only writes data.

     props:{color:0x535963, roughness:.92, surfaceTexture:'concrete'}
     props:{color:0x535963, surfaceTexture:{kind:'metalCorrugated', tile:2.4,
                                            seed:3, strength:.8, rotate:90}}

   WHY IT IS BUILT THIS WAY
   -----------------------------------------------------------------
   * The albedo map is NEUTRAL GREY DETAIL (roughly 0.55..1.0 luminance) that
     MULTIPLIES the authored `props.color`. Baking hue into the map would throw
     away the whole authored palette; keeping it grey means every existing
     colour still drives the read and only gains grain. The two kinds that are
     inherently multi-hue (brick mortar, rust) tint so weakly that `color` still
     wins.
   * Tiling is derived from the object's REAL WORLD SIZE, not from its UVs, so a
     52 m wall and a 0.6 m crate get the same texel density. That size only
     exists once the group scale from `createFromEntry` is applied, so the
     repeat is recomputed from the live scale (see `retile`) rather than frozen
     at build time.
   * One texture set per (kind, seed, strength, rotate). Per-object tiling rides
     on `texture.clone()`: clones share `source`, so the GPU upload is shared
     and 950 objects cost one set per kind, not 950.
   * THE CANVAS IS A TOOL, NOT THE PRODUCT. Every map is drawn through ONE
     reusable scratch canvas and handed to three as a DataTexture over its own
     pixel copy. The first cut kept a canvas alive per map; a 950-object level
     needs ~70 sets, that was ~300 live canvas backing stores, the browser
     stopped honouring the later ones, and the last map generated per set (the
     derived roughness map) ended up with no backing store - an INCOMPLETE GL
     texture that made every draw call using it fail with
     "GL_INVALID_OPERATION: Mismatch between texture format and sampler type"
     and silently dropped those objects from the image. Pixels are cheap and
     collectable; canvases are a scarce, browser-managed resource.
   * MEMORY IS PART OF THE CONTRACT. 256 px everywhere, at most SEED_VARIANTS
     variants per kind (a level handing out per-object seeds wraps instead of
     minting canvases), a hard cap on distinct sets, and a roughness map only
     for the kinds where roughness contrast is actually visible - on a matte
     dielectric a 0.74..1.0 roughness map is a megabyte nobody can see.
   * Every generated pattern is TILEABLE. The noise lattice wraps, grids divide
     the canvas evenly and stamped features are redrawn across the seam, so a
     fractional repeat (which is what world-space tiling produces) never shows a
     seam.
   * Generation is lazy. A kind that no object uses costs nothing.
   * `height()` is called with a fresh rng seeded identically to `draw()`, and
     both pull from NAMED sub-streams (`rng.stream('pebbles')`). A pebble in the
     albedo is therefore a bump in the relief without the two functions having
     to consume randoms in lockstep.

   The module owns no scene graph and no DOM of its own. Removing the script
   removes the surfaces and nothing else: `apply()` reports that it did nothing.
   ========================================================= */
(function(){
'use strict';

const VERSION = 2;
// 256 px is the whole budget story: 256 RGBA + mip chain is ~0.35 MB per map,
// which keeps a fully dressed level's surface set inside a few dozen megabytes.
const DEFAULT_SIZE = 256;
// A level may hand out one seed per object; only this many distinct variants
// per kind are ever generated and the rest wrap onto them.
const SEED_VARIANTS = 4;
// Hard ceiling on distinct generated sets. Past it, new specs fall back to the
// kind's seed-0 variant instead of growing GPU memory without bound.
const MAX_SETS = 48;
const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap'];
// Tagged onto every generated texture. scene-store reads it to know a map is
// owned by this cache and must NOT be disposed with the object that shows it.
const TAG = 'lkSurface';

// ------------------------------------------------ tiny numeric helpers

function num(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp01(v){ return v < 0 ? 0 : v > 1 ? 1 : v; }
function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t){ return a + (b - a) * t; }
function fade(t){ return t * t * (3 - 2 * t); }
function grey(v){ const n = Math.round(clamp01(v) * 255); return 'rgb(' + n + ',' + n + ',' + n + ')'; }
function greyA(v, a){ const n = Math.round(clamp01(v) * 255); return 'rgba(' + n + ',' + n + ',' + n + ',' + clamp01(a) + ')'; }
function rgba(r, g, b, a){
  return 'rgba(' + Math.round(clamp01(r) * 255) + ',' + Math.round(clamp01(g) * 255) + ',' + Math.round(clamp01(b) * 255) + ',' + clamp01(a) + ')';
}
// Feature counts are authored per 256 px so a kind keeps its density if its
// texture size ever changes.
function density(size, count){ return Math.max(1, Math.round(count * size * size / 65536)); }

function hash32(text){
  let h = 2166136261 >>> 0;
  const str = String(text);
  for(let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A callable rng that can also mint named, independently seeded sub-streams.
// Named streams are what let albedo and relief agree on where the features are.
function makeRng(key){
  const rng = mulberry32(hash32(key));
  rng.stream = name => mulberry32(hash32(key + '#' + name));
  return rng;
}

// ------------------------------------------------ tileable value noise

// A lattice of random values sampled with smoothstep interpolation and integer
// wraparound. Independent lattice counts per axis are how directional detail
// (wood grain, rust drips, wind ripples) stays seamless: stretching UVs would
// not tile, stretching the LATTICE does.
function noiseField(rng, nx, ny){
  const values = new Float32Array(nx * ny);
  for(let i = 0; i < values.length; i++) values[i] = rng();
  return function(u, v){
    const x = u * nx, y = v * ny;
    let x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = fade(x - x0), fy = fade(y - y0);
    x0 = ((x0 % nx) + nx) % nx;
    y0 = ((y0 % ny) + ny) % ny;
    const x1 = (x0 + 1) % nx, y1 = (y0 + 1) % ny;
    const a = values[y0 * nx + x0], b = values[y0 * nx + x1];
    const c = values[y1 * nx + x0], d = values[y1 * nx + x1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  };
}

function fbm(rng, nx, ny, octaves, gain){
  const layers = [];
  let amp = 1, total = 0;
  for(let i = 0; i < (octaves || 4); i++){
    layers.push({field:noiseField(rng, Math.max(1, nx << i), Math.max(1, ny << i)), amp});
    total += amp;
    amp *= gain == null ? .5 : gain;
  }
  return function(u, v){
    let sum = 0;
    for(let i = 0; i < layers.length; i++) sum += layers[i].field(u, v) * layers[i].amp;
    return sum / total;
  };
}

// ------------------------------------------------ the scratch canvas

let canvasesBuilt = 0;
let texturesBuilt = 0;
let clonesHandedOut = 0;
let setsBuilt = 0;

const SCRATCH = new Map();

function makeCanvas(size){
  if(typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return null;
  const canvas = document.createElement('canvas');
  if(!canvas) return null;
  canvas.width = size;
  canvas.height = size;
  canvasesBuilt++;
  return canvas;
}

function context2d(canvas){
  if(!canvas || typeof canvas.getContext !== 'function') return null;
  // Every map is read straight back out with getImageData, which is exactly the
  // access pattern this hint exists for.
  let ctx = null;
  try { ctx = canvas.getContext('2d', {willReadFrequently:true}); } catch(err){ ctx = null; }
  if(!ctx) ctx = canvas.getContext('2d');
  if(!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function' || typeof ctx.getImageData !== 'function') return null;
  return ctx;
}

// One canvas per texture size for the lifetime of the page. See the header:
// holding a canvas per generated map is what broke the GL textures.
function scratchPad(size){
  let pad = SCRATCH.get(size);
  if(pad !== undefined) return pad;
  const canvas = makeCanvas(size);
  const ctx = context2d(canvas);
  pad = ctx ? {canvas, ctx} : null;
  SCRATCH.set(size, pad);
  return pad;
}

// Draw one map and hand back a private copy of its pixels. The canvas is reset,
// never retained, and reused by the next map.
function render(size, run){
  const pad = scratchPad(size);
  if(!pad) return null;
  const ctx = pad.ctx;
  if(ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  run(ctx);
  ctx.restore();
  const img = ctx.getImageData(0, 0, size, size);
  if(!img || !img.data) return new Uint8Array(size * size * 4);
  return new Uint8Array(img.data.buffer.slice(0));
}

// Whole-canvas analytic pass. Cheaper and far more controllable than stacking
// half a dozen composited noise layers, and it is where every kind starts.
function paint(ctx, size, sampler){
  const img = ctx.createImageData(size, size);
  if(!img || !img.data) return;
  const data = img.data;
  for(let y = 0; y < size; y++){
    const v = y / size;
    for(let x = 0; x < size; x++){
      const out = sampler(x / size, v, x, y);
      const i = (y * size + x) * 4;
      if(typeof out === 'number'){
        const n = clamp01(out) * 255;
        data[i] = data[i + 1] = data[i + 2] = n;
      } else {
        data[i] = clamp01(out[0]) * 255;
        data[i + 1] = clamp01(out[1]) * 255;
        data[i + 2] = clamp01(out[2]) * 255;
      }
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Stamp a shape and repeat it across whichever seam it straddles, so the
// texture keeps tiling however close to the edge the feature landed.
function stamp(ctx, size, x, y, radius, draw){
  const dx = x < radius ? size : (x > size - radius ? -size : 0);
  const dy = y < radius ? size : (y > size - radius ? -size : 0);
  draw(x, y);
  if(dx) draw(x + dx, y);
  if(dy) draw(x, y + dy);
  if(dx && dy) draw(x + dx, y + dy);
}

function dot(ctx, size, x, y, radius, fill){
  ctx.fillStyle = fill;
  stamp(ctx, size, x, y, radius + 1, (px, py) => {
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function blob(ctx, size, x, y, rx, ry, rot, fill){
  ctx.fillStyle = fill;
  stamp(ctx, size, x, y, Math.max(rx, ry) + 1, (px, py) => {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// Polylines (cracks, scratches, grain) can span the whole canvas, so they are
// redrawn at all nine wrap offsets. There are only ever a handful of them.
function wrapStroke(ctx, size, points, style, width){
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  for(let ox = -1; ox <= 1; ox++){
    for(let oy = -1; oy <= 1; oy++){
      ctx.save();
      ctx.translate(ox * size, oy * size);
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for(let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// A wandering polyline: cracks, scratches and wood grain all come from this.
function walk(rng, x, y, angle, length, steps, wobble){
  const points = [x, y];
  let a = angle;
  const step = length / steps;
  for(let i = 0; i < steps; i++){
    a += (rng() - .5) * wobble;
    x += Math.cos(a) * step;
    y += Math.sin(a) * step;
    points.push(x, y);
  }
  return points;
}

function crackNetwork(ctx, size, rng, count, style, width, lengthScale){
  for(let i = 0; i < count; i++){
    const points = walk(rng, rng() * size, rng() * size, rng() * Math.PI * 2, size * (lengthScale || .5) * (.4 + rng()), 10, .9);
    wrapStroke(ctx, size, points, style, width * (.5 + rng()));
    if(rng() < .45){
      const branchAt = 2 * (2 + Math.floor(rng() * 5));
      const branch = walk(rng, points[branchAt], points[branchAt + 1], rng() * Math.PI * 2, size * .12 * (.5 + rng()), 4, 1.1);
      wrapStroke(ctx, size, branch, style, width * .6);
    }
  }
}

function speckle(ctx, size, rng, count, minR, maxR, colorFor){
  const total = density(size, count);
  for(let i = 0; i < total; i++){
    const x = rng() * size, y = rng() * size;
    const r = minR + rng() * (maxR - minR);
    const t = rng();
    dot(ctx, size, x, y, r, colorFor(t, rng));
  }
}

// ------------------------------------------------ pixel operations
//
// Everything past generation works on plain Uint8Array RGBA buffers: no second
// canvas, no readback, and the results are ordinary collectable memory.

function luminanceAt(data, size, x, y){
  const xi = ((x % size) + size) % size;
  const yi = ((y % size) + size) % size;
  const i = (yi * size + xi) * 4;
  return (data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114) / 255;
}

function rotateData90(data, size){
  const out = new Uint8Array(data.length);
  for(let y = 0; y < size; y++){
    for(let x = 0; x < size; x++){
      const src = (y * size + x) * 4;
      // (x, y) -> (size-1-y, x): a quarter turn, exact and lossless.
      const dst = (x * size + (size - 1 - y)) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = data[src + 3];
    }
  }
  return out;
}

// Canvas row 0 is the top; a DataTexture's row 0 is v=0, i.e. the bottom. The
// rows are flipped here once instead of relying on UNPACK_FLIP_Y so the normal
// map's green channel keeps the OpenGL (+Y up) convention it was built for.
function flipRows(data, size){
  const out = new Uint8Array(data.length);
  const stride = size * 4;
  for(let y = 0; y < size; y++){
    out.set(data.subarray(y * stride, y * stride + stride), (size - 1 - y) * stride);
  }
  return out;
}

// `strength` is a single authoring dial, so it has to touch both halves of the
// look: it scales the Sobel gain (relief) and pulls the albedo back toward its
// own mean (grain contrast).
function flattenContrast(data, amount){
  const pixels = data.length / 4;
  let mr = 0, mg = 0, mb = 0;
  for(let i = 0; i < data.length; i += 4){ mr += data[i]; mg += data[i + 1]; mb += data[i + 2]; }
  mr /= pixels; mg /= pixels; mb /= pixels;
  for(let i = 0; i < data.length; i += 4){
    data[i] = clamp(mr + (data[i] - mr) * amount, 0, 255);
    data[i + 1] = clamp(mg + (data[i + 1] - mg) * amount, 0, 255);
    data[i + 2] = clamp(mb + (data[i + 2] - mb) * amount, 0, 255);
  }
  return data;
}

function normalFromHeight(height, size, gain){
  const out = new Uint8Array(size * size * 4);
  const scale = gain * size / 128;
  for(let y = 0; y < size; y++){
    for(let x = 0; x < size; x++){
      const dx = (luminanceAt(height, size, x + 1, y - 1) + 2 * luminanceAt(height, size, x + 1, y) + luminanceAt(height, size, x + 1, y + 1))
               - (luminanceAt(height, size, x - 1, y - 1) + 2 * luminanceAt(height, size, x - 1, y) + luminanceAt(height, size, x - 1, y + 1));
      const dy = (luminanceAt(height, size, x - 1, y + 1) + 2 * luminanceAt(height, size, x, y + 1) + luminanceAt(height, size, x + 1, y + 1))
               - (luminanceAt(height, size, x - 1, y - 1) + 2 * luminanceAt(height, size, x, y - 1) + luminanceAt(height, size, x + 1, y - 1));
      // Canvas Y runs down while the rows are flipped on the way to the GPU, so
      // BOTH gradients are negated to land on the OpenGL (+Y up) convention.
      let nx = -dx * scale, ny = -dy * scale, nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const i = (y * size + x) * 4;
      out[i] = (nx / len * .5 + .5) * 255;
      out[i + 1] = (ny / len * .5 + .5) * 255;
      out[i + 2] = (nz / len * .5 + .5) * 255;
      out[i + 3] = 255;
    }
  }
  return out;
}

// Derived roughness stays in [lo..1]: roughnessMap MULTIPLIES material.roughness,
// so a map centred well below 1 would quietly turn every surface glossy and make
// the per-kind roughness hint a lie.
function roughFromHeight(height, size, lo){
  const out = new Uint8Array(size * size * 4);
  const span = 1 - lo;
  for(let i = 0; i < out.length; i += 4){
    const h = (height[i] * .299 + height[i + 1] * .587 + height[i + 2] * .114) / 255;
    const v = clamp01(1 - h * span) * 255;
    out[i] = out[i + 1] = out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

// ------------------------------------------------ surface definitions
//
// Every `draw` paints NEUTRAL grey albedo detail, every `height` paints a
// grayscale relief with the same feature layout, and a kind may add its own
// `rough`/`metal`. `roughDetail:true` asks for a roughness map derived from the
// relief; it is only worth the memory where roughness contrast is visible,
// which in practice means specular surfaces.

const DEFS = {};

function define(id, def){ DEFS[id] = Object.assign({id}, def); }

// ---------------- concrete family

define('concrete', {
  label:'Concrete (weathered)', labelIt:'Cemento (invecchiato)', group:'concrete',
  tile:3, roughness:.94, metalness:0, normal:.8,
  draw(ctx, size, rng){
    const blotch = fbm(rng.stream('blotch'), 3, 3, 5, .55);
    const grain = fbm(rng.stream('grain'), 24, 24, 3, .5);
    const stain = fbm(rng.stream('stain'), 2, 7, 4, .6);
    paint(ctx, size, (u, v) => .90
      + (blotch(u, v) - .5) * .17
      + (grain(u, v) - .5) * .10
      - Math.pow(clamp01(stain(u, v)), 1.7) * .17);
    speckle(ctx, size, rng.stream('aggregate'), 420, .5, 1.8, (t, r) => greyA(t < .5 ? .99 : .60, .22 + r() * .28));
    speckle(ctx, size, rng.stream('pits'), 60, .8, 2.2, (t, r) => greyA(.46, .25 + r() * .25));
    crackNetwork(ctx, size, rng.stream('cracks'), 5, 'rgba(58,58,58,.3)', .8, .55);
  },
  height(ctx, size, rng){
    const blotch = fbm(rng.stream('blotch'), 3, 3, 5, .55);
    const grain = fbm(rng.stream('grain'), 24, 24, 3, .5);
    paint(ctx, size, (u, v) => .58 + (blotch(u, v) - .5) * .30 + (grain(u, v) - .5) * .22);
    speckle(ctx, size, rng.stream('aggregate'), 420, .5, 1.8, (t, r) => greyA(t < .5 ? .82 : .38, .25 + r() * .3));
    speckle(ctx, size, rng.stream('pits'), 60, .8, 2.2, () => 'rgba(10,10,10,.55)');
    crackNetwork(ctx, size, rng.stream('cracks'), 5, 'rgba(0,0,0,.75)', 1, .55);
  },
});

define('concreteSmooth', {
  label:'Concrete (poured, smooth)', labelIt:'Cemento (liscio)', group:'concrete',
  tile:4, roughness:.78, metalness:0, normal:.5, roughDetail:true,
  draw(ctx, size, rng){
    const wide = fbm(rng.stream('wide'), 2, 2, 4, .5);
    const fine = fbm(rng.stream('fine'), 40, 40, 2, .5);
    paint(ctx, size, (u, v) => .93 + (wide(u, v) - .5) * .09 + (fine(u, v) - .5) * .045);
    // Trowel sweeps: broad, very soft arcs, the only feature that reads on a
    // poured slab from a metre away.
    const r = rng.stream('trowel');
    for(let i = 0; i < 14; i++){
      const points = walk(r, r() * size, r() * size, r() * Math.PI * 2, size * .9, 8, .35);
      wrapStroke(ctx, size, points, r() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(90,90,90,.05)', 4 + r() * 10);
    }
    speckle(ctx, size, rng.stream('pinholes'), 110, .4, 1.2, (t, rr) => greyA(.58, .2 + rr() * .25));
  },
  height(ctx, size, rng){
    const wide = fbm(rng.stream('wide'), 2, 2, 4, .5);
    paint(ctx, size, (u, v) => .55 + (wide(u, v) - .5) * .16);
    const r = rng.stream('trowel');
    for(let i = 0; i < 14; i++){
      const points = walk(r, r() * size, r() * size, r() * Math.PI * 2, size * .9, 8, .35);
      wrapStroke(ctx, size, points, r() < .5 ? 'rgba(230,230,230,.10)' : 'rgba(40,40,40,.10)', 4 + r() * 10);
    }
    speckle(ctx, size, rng.stream('pinholes'), 110, .4, 1.2, () => 'rgba(0,0,0,.7)');
  },
});

define('plaster', {
  label:'Plaster / render', labelIt:'Intonaco', group:'concrete',
  tile:3, roughness:.88, metalness:0, normal:.65,
  draw(ctx, size, rng){
    const wide = fbm(rng.stream('wide'), 3, 3, 4, .5);
    const skin = fbm(rng.stream('skin'), 30, 30, 3, .55);
    paint(ctx, size, (u, v) => .92 + (wide(u, v) - .5) * .10 + (skin(u, v) - .5) * .08);
    const r = rng.stream('trowel');
    for(let i = 0; i < 22; i++){
      const points = walk(r, r() * size, r() * size, r() * Math.PI * 2, size * .5, 5, .5);
      wrapStroke(ctx, size, points, r() < .5 ? 'rgba(255,255,255,.08)' : 'rgba(120,120,120,.07)', 3 + r() * 9);
    }
    // Patched repairs: slightly different render, the thing that stops a wall
    // looking machine-made.
    const p = rng.stream('patch');
    for(let i = 0; i < 5; i++) blob(ctx, size, p() * size, p() * size, size * (.05 + p() * .1), size * (.05 + p() * .09), p() * 3, greyA(p() < .5 ? 1 : .78, .1));
    crackNetwork(ctx, size, rng.stream('cracks'), 4, 'rgba(70,70,70,.26)', .8, .45);
    speckle(ctx, size, rng.stream('pinholes'), 90, .4, 1.1, () => 'rgba(120,120,120,.35)');
  },
  height(ctx, size, rng){
    const wide = fbm(rng.stream('wide'), 3, 3, 4, .5);
    const skin = fbm(rng.stream('skin'), 30, 30, 3, .55);
    paint(ctx, size, (u, v) => .55 + (wide(u, v) - .5) * .28 + (skin(u, v) - .5) * .18);
    const r = rng.stream('trowel');
    for(let i = 0; i < 22; i++){
      const points = walk(r, r() * size, r() * size, r() * Math.PI * 2, size * .5, 5, .5);
      wrapStroke(ctx, size, points, r() < .5 ? 'rgba(255,255,255,.14)' : 'rgba(30,30,30,.12)', 3 + r() * 9);
    }
    const p = rng.stream('patch');
    for(let i = 0; i < 5; i++) blob(ctx, size, p() * size, p() * size, size * (.05 + p() * .1), size * (.05 + p() * .09), p() * 3, greyA(p() < .5 ? .8 : .35, .18));
    crackNetwork(ctx, size, rng.stream('cracks'), 4, 'rgba(0,0,0,.75)', 1, .45);
    speckle(ctx, size, rng.stream('pinholes'), 90, .4, 1.1, () => 'rgba(0,0,0,.6)');
  },
});

// ---------------- ground family

define('asphalt', {
  label:'Asphalt', labelIt:'Asfalto', group:'ground',
  tile:3.5, roughness:.96, metalness:0, normal:.9,
  draw(ctx, size, rng){
    const wide = fbm(rng.stream('wide'), 3, 3, 4, .55);
    paint(ctx, size, (u, v) => .84 + (wide(u, v) - .5) * .13);
    // Dense two-tone aggregate is what separates asphalt from generic noise.
    speckle(ctx, size, rng.stream('aggregate'), 1200, .4, 1.6, (t, r) => greyA(t < .35 ? 1 : t < .7 ? .74 : .52, .26 + r() * .4));
    const p = rng.stream('patch');
    for(let i = 0; i < 7; i++) blob(ctx, size, p() * size, p() * size, size * (.05 + p() * .13), size * (.05 + p() * .11), p() * 3, greyA(.66, .14));
    crackNetwork(ctx, size, rng.stream('cracks'), 7, 'rgba(52,52,52,.42)', 1.1, .6);
  },
  height(ctx, size, rng){
    const wide = fbm(rng.stream('wide'), 3, 3, 4, .55);
    paint(ctx, size, (u, v) => .55 + (wide(u, v) - .5) * .18);
    speckle(ctx, size, rng.stream('aggregate'), 1200, .4, 1.6, (t, r) => greyA(t < .35 ? .9 : t < .7 ? .6 : .28, .3 + r() * .4));
    const p = rng.stream('patch');
    for(let i = 0; i < 7; i++) blob(ctx, size, p() * size, p() * size, size * (.05 + p() * .13), size * (.05 + p() * .11), p() * 3, greyA(.35, .22));
    crackNetwork(ctx, size, rng.stream('cracks'), 7, 'rgba(0,0,0,.8)', 1.4, .6);
  },
});

define('dirt', {
  label:'Dirt / packed earth', labelIt:'Terra battuta', group:'ground',
  tile:2.5, roughness:.98, metalness:0, normal:1,
  draw(ctx, size, rng){
    const clod = fbm(rng.stream('clod'), 4, 4, 5, .55);
    const dust = fbm(rng.stream('dust'), 18, 12, 3, .5);
    const drift = fbm(rng.stream('drift'), 12, 2, 3, .55);
    paint(ctx, size, (u, v) => .86
      + (clod(u, v) - .5) * .22
      + (dust(u, v) - .5) * .11
      + (drift(u, v) - .5) * .07);
    speckle(ctx, size, rng.stream('stones'), 200, .7, 2.4, (t, r) => greyA(t < .45 ? .99 : .55, .25 + r() * .35));
    speckle(ctx, size, rng.stream('grit'), 700, .35, 1, (t, r) => greyA(t < .5 ? .95 : .6, .15 + r() * .25));
    const s = rng.stream('scuff');
    for(let i = 0; i < 12; i++){
      const points = walk(s, s() * size, s() * size, (s() - .5) * .8, size * .8, 6, .5);
      wrapStroke(ctx, size, points, s() < .5 ? 'rgba(255,255,255,.06)' : 'rgba(70,70,70,.08)', 2 + s() * 7);
    }
  },
  height(ctx, size, rng){
    const clod = fbm(rng.stream('clod'), 4, 4, 5, .55);
    const dust = fbm(rng.stream('dust'), 18, 12, 3, .5);
    paint(ctx, size, (u, v) => .52 + (clod(u, v) - .5) * .42 + (dust(u, v) - .5) * .2);
    speckle(ctx, size, rng.stream('stones'), 200, .7, 2.4, (t, r) => greyA(t < .45 ? .9 : .3, .35 + r() * .35));
    speckle(ctx, size, rng.stream('grit'), 700, .35, 1, (t, r) => greyA(t < .5 ? .85 : .35, .18 + r() * .25));
  },
});

define('gravel', {
  label:'Gravel', labelIt:'Ghiaia', group:'ground',
  tile:1.6, roughness:.95, metalness:0, normal:1.25,
  draw(ctx, size, rng){
    const bed = fbm(rng.stream('bed'), 6, 6, 4, .5);
    paint(ctx, size, (u, v) => .60 + (bed(u, v) - .5) * .1);
    // Pebbles are stamped largest-first so smaller stones settle into the gaps
    // instead of forming a uniform confetti field.
    const r = rng.stream('pebbles');
    const passes = [{count:150, min:.024, max:.05}, {count:300, min:.013, max:.026}, {count:640, min:.005, max:.013}];
    passes.forEach(pass => {
      for(let i = 0; i < pass.count; i++){
        const x = r() * size, y = r() * size;
        const rx = (pass.min + r() * (pass.max - pass.min)) * size;
        const ry = rx * (.62 + r() * .38);
        const rot = r() * Math.PI;
        const tone = .66 + r() * .34;
        blob(ctx, size, x, y, rx, ry, rot, greyA(tone * .72, .85));
        blob(ctx, size, x - rx * .16, y - ry * .16, rx * .84, ry * .84, rot, greyA(tone, .95));
      }
    });
    speckle(ctx, size, rng.stream('grit'), 700, .35, .9, (t, rr) => greyA(t < .5 ? .95 : .5, .18 + rr() * .25));
  },
  height(ctx, size, rng){
    paint(ctx, size, () => .18);
    const r = rng.stream('pebbles');
    const passes = [{count:150, min:.024, max:.05}, {count:300, min:.013, max:.026}, {count:640, min:.005, max:.013}];
    passes.forEach(pass => {
      for(let i = 0; i < pass.count; i++){
        const x = r() * size, y = r() * size;
        const rx = (pass.min + r() * (pass.max - pass.min)) * size;
        const ry = rx * (.62 + r() * .38);
        const rot = r() * Math.PI;
        const tone = .66 + r() * .34;
        blob(ctx, size, x, y, rx, ry, rot, 'rgba(0,0,0,.55)');
        blob(ctx, size, x - rx * .16, y - ry * .16, rx * .82, ry * .82, rot, greyA(.55 + tone * .45, 1));
      }
    });
  },
});

define('sand', {
  label:'Sand', labelIt:'Sabbia', group:'ground',
  tile:2, roughness:1, metalness:0, normal:.75,
  draw(ctx, size, rng){
    const grain = fbm(rng.stream('grain'), 64, 64, 2, .5);
    const dune = fbm(rng.stream('dune'), 3, 3, 3, .5);
    const wave = fbm(rng.stream('wave'), 2, 10, 2, .5);
    // Wind ripples: a wrapping sine whose phase is pushed around by noise, so
    // the bands curve like real ripples instead of reading as a stripe pattern.
    paint(ctx, size, (u, v) => {
      const ripple = Math.sin((v * 14 + wave(u, v) * 2.2) * Math.PI * 2) * .5 + .5;
      return .90 + (dune(u, v) - .5) * .09 + (grain(u, v) - .5) * .07 + (ripple - .5) * .055;
    });
    speckle(ctx, size, rng.stream('shell'), 260, .35, 1.2, (t, r) => greyA(t < .5 ? 1 : .66, .18 + r() * .25));
  },
  height(ctx, size, rng){
    const grain = fbm(rng.stream('grain'), 64, 64, 2, .5);
    const dune = fbm(rng.stream('dune'), 3, 3, 3, .5);
    const wave = fbm(rng.stream('wave'), 2, 10, 2, .5);
    paint(ctx, size, (u, v) => {
      const ripple = Math.sin((v * 14 + wave(u, v) * 2.2) * Math.PI * 2) * .5 + .5;
      return .5 + (dune(u, v) - .5) * .3 + (grain(u, v) - .5) * .16 + (ripple - .5) * .28;
    });
  },
});

// ---------------- sport / stadium family

// Grass blades. Short wrapping strokes leaning off vertical read as turf far
// better than noise alone, which stays flat once the camera drops to head
// height. Shared by both turf kinds so plain and mown pitches match.
function grassBlades(ctx, size, rng, count, style, width){
  const total = density(size, count);
  for(let i = 0; i < total; i++){
    const x = rng() * size, y = rng() * size;
    const lean = (rng() - .5) * .55;
    const length = size * (.012 + rng() * .022);
    wrapStroke(ctx, size, walk(rng, x, y, -Math.PI / 2 + lean, length, 2, .35), style(rng), width * (.6 + rng() * .8));
  }
}
function turfBase(ctx, size, rng, brightness){
  const clump = fbm(rng.stream('clump'), 5, 5, 4, .55);
  const wear = fbm(rng.stream('wear'), 2, 3, 3, .6);
  const fine = fbm(rng.stream('fine'), 40, 40, 2, .5);
  paint(ctx, size, (u, v) => brightness
    + (clump(u, v) - .5) * .14
    + (fine(u, v) - .5) * .10
    - Math.pow(clamp01(wear(u, v)), 2.2) * .10);
}

define('turf', {
  label:'Pitch turf', labelIt:'Erba del campo', group:'sport',
  tile:2.2, roughness:.93, metalness:0, normal:.85,
  draw(ctx, size, rng){
    turfBase(ctx, size, rng, .92);
    grassBlades(ctx, size, rng.stream('blades'), 1500, r => greyA(r() < .5 ? 1 : .74, .16 + r() * .2), 1.1);
    speckle(ctx, size, rng.stream('divot'), 40, .8, 2.4, (t, r) => greyA(.62, .1 + r() * .16));
  },
  height(ctx, size, rng){
    turfBase(ctx, size, rng, .52);
    grassBlades(ctx, size, rng.stream('blades'), 1500, r => greyA(r() < .5 ? .85 : .3, .22 + r() * .26), 1.1);
  },
});

// A mown pitch is the single strongest "this is a real stadium" cue. The tile
// is the full light+dark period so a 68 m pitch lands on ~5 m stripes; authors
// change the mowing direction with the surface `rotate` option.
define('turfStriped', {
  label:'Pitch turf (mown stripes)', labelIt:'Erba del campo (strisce)', group:'sport',
  tile:10, roughness:.93, metalness:0, normal:.8,
  draw(ctx, size, rng){
    turfBase(ctx, size, rng, .90);
    // Soft-edged banding: a hard edge aliases badly at grazing angles.
    const edge = fbm(rng.stream('edge'), 1, 6, 2, .5);
    ctx.globalCompositeOperation = 'source-over';
    for(let y = 0; y < size; y++){
      const band = Math.sin((y / size + (edge(0, y / size) - .5) * .012) * Math.PI * 2) * .5 + .5;
      ctx.fillStyle = greyA(band > .5 ? 1 : .55, Math.abs(band - .5) * .34);
      ctx.fillRect(0, y, size, 1);
    }
    grassBlades(ctx, size, rng.stream('blades'), 900, r => greyA(r() < .5 ? 1 : .76, .13 + r() * .16), 1);
    speckle(ctx, size, rng.stream('divot'), 30, .8, 2.4, (t, r) => greyA(.64, .09 + r() * .14));
  },
  height(ctx, size, rng){
    // Stripes are mown nap, not relief: height stays plain turf so the bands
    // never carve fake ridges into the pitch normal map.
    turfBase(ctx, size, rng, .52);
    grassBlades(ctx, size, rng.stream('blades'), 900, r => greyA(r() < .5 ? .82 : .32, .2 + r() * .24), 1);
  },
});

define('stadiumSeat', {
  label:'Stadium seating', labelIt:'Sedute dello stadio', group:'sport',
  tile:1.1, roughness:.62, metalness:.04, normal:1.15,
  draw(ctx, size, rng){
    paint(ctx, size, () => .9);
    // Moulded plastic shells in rows: a bright crown, a shaded gap between
    // seats and a dark rail line so a stand reads as seating, not a slab.
    const cols = 6, rows = 4;
    for(let r = 0; r < rows; r++){
      for(let c = 0; c < cols; c++){
        const x = size * (c + .5) / cols, y = size * (r + .58) / rows;
        blob(ctx, size, x, y, size * .38 / cols, size * .3 / rows, 0, greyA(1, .5));
        blob(ctx, size, x, y - size * .06 / rows, size * .3 / cols, size * .16 / rows, 0, greyA(1, .35));
      }
      const railY = size * r / rows;
      ctx.fillStyle = 'rgba(0,0,0,.42)';
      ctx.fillRect(0, railY, size, Math.max(1, size * .022));
    }
    speckle(ctx, size, rng.stream('grime'), 220, .4, 1.4, (t, r) => greyA(.6, .1 + r() * .18));
  },
  height(ctx, size, rng){
    paint(ctx, size, () => .42);
    const cols = 6, rows = 4;
    for(let r = 0; r < rows; r++){
      for(let c = 0; c < cols; c++){
        blob(ctx, size, size * (c + .5) / cols, size * (r + .58) / rows, size * .38 / cols, size * .3 / rows, 0, greyA(.9, .7));
      }
      ctx.fillStyle = 'rgba(0,0,0,.85)';
      ctx.fillRect(0, size * r / rows, size, Math.max(1, size * .03));
    }
  },
});

define('runningTrack', {
  label:'Running track', labelIt:'Pista di atletica', group:'sport',
  tile:2.4, roughness:.88, metalness:0, normal:.7,
  draw(ctx, size, rng){
    const base = fbm(rng.stream('base'), 5, 5, 3, .5);
    paint(ctx, size, (u, v) => .88 + (base(u, v) - .5) * .08);
    // Vulcanised rubber granulate: dense, rounded, tightly packed.
    speckle(ctx, size, rng.stream('granule'), 2200, .5, 1.5, (t, r) => greyA(t < .4 ? 1 : t < .75 ? .8 : .62, .3 + r() * .34));
  },
  height(ctx, size, rng){
    const base = fbm(rng.stream('base'), 5, 5, 3, .5);
    paint(ctx, size, (u, v) => .5 + (base(u, v) - .5) * .12);
    speckle(ctx, size, rng.stream('granule'), 2200, .5, 1.5, (t, r) => greyA(t < .5 ? .82 : .34, .32 + r() * .3));
  },
});

define('advertBoard', {
  label:'Advertising board', labelIt:'Cartellone pubblicitario', group:'sport',
  tile:3.2, roughness:.32, metalness:.05, normal:.25,
  draw(ctx, size, rng){
    // Perimeter boards are glossy panels: the read is the seam and a broad
    // diagonal sheen, not surface grain, so keep detail low and let the
    // authored colour carry. The sheen is baked into the single paint pass —
    // every kind here stays inside the shared drawing vocabulary.
    const haze = fbm(rng.stream('haze'), 2, 4, 2, .5);
    paint(ctx, size, (u, v) => {
      const sweep = Math.sin((u * .5 + v * .5) * Math.PI);
      return .93 + sweep * .07 + (haze(u, v) - .5) * .04;
    });
    panelSeams(ctx, size, {line:'rgba(0,0,0,.3)', width:Math.max(1, size * .012), cols:2, rows:1});
    speckle(ctx, size, rng.stream('dust'), 120, .3, .9, (t, r) => greyA(.7, .06 + r() * .1));
  },
  height(ctx, size){
    paint(ctx, size, () => .5);
    panelSeams(ctx, size, {line:'rgba(0,0,0,.8)', width:Math.max(1, size * .014), cols:2, rows:1});
  },
});

// ---------------- metal family

// Rivets and panel seams are shared by several metal kinds.
function panelSeams(ctx, size, opts){
  ctx.strokeStyle = opts.line;
  ctx.lineWidth = opts.width;
  for(let i = 0; i < opts.cols; i++){
    const x = Math.round(size * i / opts.cols) + .5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
  }
  for(let i = 0; i < opts.rows; i++){
    const y = Math.round(size * i / opts.rows) + .5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
  }
}

function rivets(ctx, size, cols, rows, step, body, highlight){
  for(let i = 0; i < cols; i++){
    const x = size * i / cols;
    for(let y = step / 2; y < size; y += step){
      dot(ctx, size, x, y, size * .009, body);
      if(highlight) dot(ctx, size, x - size * .004, y - size * .004, size * .005, highlight);
    }
  }
  for(let j = 0; j < rows; j++){
    const y = size * j / rows;
    for(let x = step / 2; x < size; x += step){
      dot(ctx, size, x, y, size * .009, body);
      if(highlight) dot(ctx, size, x - size * .004, y - size * .004, size * .005, highlight);
    }
  }
}

define('metalPainted', {
  label:'Painted metal panel', labelIt:'Lamiera verniciata', group:'metal',
  tile:2.2, roughness:.55, metalness:.35, normal:.8, roughDetail:true,
  draw(ctx, size, rng){
    const coat = fbm(rng.stream('coat'), 4, 4, 4, .5);
    const orange = fbm(rng.stream('orange'), 26, 26, 2, .5);
    paint(ctx, size, (u, v) => .95 + (coat(u, v) - .5) * .07 + (orange(u, v) - .5) * .035);
    panelSeams(ctx, size, {cols:2, rows:2, line:'rgba(70,70,70,.5)', width:size * .006});
    rivets(ctx, size, 2, 2, size * .11, 'rgba(120,120,120,.55)', 'rgba(255,255,255,.4)');
    // Chipped paint: a dark bite with a bright lip, which is what actually
    // sells "painted metal" rather than "grey plastic".
    const c = rng.stream('chips');
    for(let i = 0; i < 70; i++){
      const x = c() * size, y = c() * size, r = size * (.004 + c() * .012);
      blob(ctx, size, x, y, r * (.7 + c() * .7), r, c() * 3, 'rgba(255,255,255,.26)');
      blob(ctx, size, x, y, r * .7, r * .7, c() * 3, 'rgba(96,96,96,.5)');
    }
    const s = rng.stream('scratch');
    for(let i = 0; i < 34; i++){
      const points = walk(s, s() * size, s() * size, (s() - .5) * .5 + (s() < .5 ? 0 : Math.PI / 2), size * (.1 + s() * .4), 4, .18);
      wrapStroke(ctx, size, points, s() < .6 ? 'rgba(255,255,255,.12)' : 'rgba(90,90,90,.12)', .6 + s() * 1);
    }
  },
  height(ctx, size, rng){
    const coat = fbm(rng.stream('coat'), 4, 4, 4, .5);
    paint(ctx, size, (u, v) => .62 + (coat(u, v) - .5) * .1);
    panelSeams(ctx, size, {cols:2, rows:2, line:'rgba(0,0,0,.85)', width:size * .008});
    rivets(ctx, size, 2, 2, size * .11, 'rgba(255,255,255,.9)', null);
    const c = rng.stream('chips');
    for(let i = 0; i < 70; i++){
      const x = c() * size, y = c() * size, r = size * (.004 + c() * .012);
      blob(ctx, size, x, y, r * (.7 + c() * .7), r, c() * 3, 'rgba(255,255,255,.18)');
      blob(ctx, size, x, y, r * .7, r * .7, c() * 3, 'rgba(20,20,20,.55)');
    }
  },
  metal(ctx, size, rng){
    // Paint is a dielectric, the chips underneath are not.
    paint(ctx, size, () => .18);
    const c = rng.stream('chips');
    for(let i = 0; i < 70; i++){
      const x = c() * size, y = c() * size, r = size * (.004 + c() * .012);
      c(); c();
      blob(ctx, size, x, y, r * .7, r * .7, c() * 3, 'rgba(255,255,255,.9)');
    }
  },
});

define('metalCorrugated', {
  label:'Corrugated metal', labelIt:'Lamiera ondulata', group:'metal',
  tile:1.6, roughness:.48, metalness:.6, normal:1.4, roughDetail:true,
  draw(ctx, size, rng){
    const dirt = fbm(rng.stream('dirt'), 3, 14, 3, .55);
    const fine = fbm(rng.stream('fine'), 30, 30, 2, .5);
    // 8 ribs per tile: an integer count is what keeps the sheet seamless.
    paint(ctx, size, (u, v) => {
      const rib = Math.sin(u * Math.PI * 2 * 8) * .5 + .5;
      return .70 + rib * .28 + (fine(u, v) - .5) * .05 - Math.pow(clamp01(dirt(u, v)), 2) * .16;
    });
    const s = rng.stream('streak');
    for(let i = 0; i < 24; i++){
      const x = s() * size;
      wrapStroke(ctx, size, [x, -size * .1, x + (s() - .5) * size * .04, size * 1.1], s() < .5 ? 'rgba(60,60,60,.15)' : 'rgba(255,255,255,.07)', 1 + s() * 4);
    }
    speckle(ctx, size, rng.stream('pits'), 120, .5, 1.5, (t, r) => greyA(t < .5 ? .5 : 1, .15 + r() * .25));
  },
  height(ctx, size, rng){
    const fine = fbm(rng.stream('fine'), 30, 30, 2, .5);
    paint(ctx, size, (u, v) => {
      const rib = Math.sin(u * Math.PI * 2 * 8) * .5 + .5;
      return .12 + rib * .8 + (fine(u, v) - .5) * .05;
    });
    speckle(ctx, size, rng.stream('pits'), 120, .5, 1.5, () => 'rgba(0,0,0,.45)');
  },
});

define('metalRusted', {
  label:'Rusted metal', labelIt:'Metallo arrugginito', group:'metal',
  tile:2.4, roughness:.78, metalness:.35, normal:1,
  draw(ctx, size, rng){
    const patch = fbm(rng.stream('rust'), 4, 4, 5, .55);
    const drip = fbm(rng.stream('drip'), 16, 2, 3, .6);
    const grain = fbm(rng.stream('grain'), 40, 40, 2, .5);
    // The only hue in the module besides brick mortar, and deliberately weak:
    // it has to survive being multiplied by any authored colour.
    paint(ctx, size, (u, v) => {
      const rust = clamp01(Math.pow(clamp01(patch(u, v) * .75 + drip(u, v) * .45), 2.1));
      const base = .93 + (grain(u, v) - .5) * .07;
      const value = base - rust * .3;
      return [value * (1 + rust * .16), value * (1 - rust * .04), value * (1 - rust * .2)];
    });
    const s = rng.stream('streak');
    for(let i = 0; i < 30; i++){
      const x = s() * size, len = size * (.2 + s() * .8);
      const y = s() * size;
      wrapStroke(ctx, size, [x, y, x + (s() - .5) * size * .05, y + len], rgba(.42, .26, .16, .1 + s() * .14), 1 + s() * 5);
    }
    speckle(ctx, size, rng.stream('pits'), 340, .4, 1.9, (t, r) => t < .55 ? rgba(.3, .19, .12, .28 + r() * .35) : greyA(1, .14 + r() * .18));
  },
  height(ctx, size, rng){
    const patch = fbm(rng.stream('rust'), 4, 4, 5, .55);
    const drip = fbm(rng.stream('drip'), 16, 2, 3, .6);
    paint(ctx, size, (u, v) => {
      const rust = clamp01(Math.pow(clamp01(patch(u, v) * .75 + drip(u, v) * .45), 2.1));
      return .72 - rust * .42;
    });
    speckle(ctx, size, rng.stream('pits'), 340, .4, 1.9, (t, r) => t < .55 ? 'rgba(0,0,0,.5)' : greyA(1, .18 + r() * .22));
  },
  metal(ctx, size, rng){
    const patch = fbm(rng.stream('rust'), 4, 4, 5, .55);
    const drip = fbm(rng.stream('drip'), 16, 2, 3, .6);
    paint(ctx, size, (u, v) => {
      const rust = clamp01(Math.pow(clamp01(patch(u, v) * .75 + drip(u, v) * .45), 2.1));
      return clamp01(1 - rust * 1.35);
    });
  },
  rough(ctx, size, rng){
    const patch = fbm(rng.stream('rust'), 4, 4, 5, .55);
    const drip = fbm(rng.stream('drip'), 16, 2, 3, .6);
    paint(ctx, size, (u, v) => {
      const rust = clamp01(Math.pow(clamp01(patch(u, v) * .75 + drip(u, v) * .45), 2.1));
      return clamp01(.62 + rust * .38);
    });
  },
});

define('metalTread', {
  label:'Tread plate', labelIt:'Lamiera mandorlata', group:'metal',
  tile:1.2, roughness:.42, metalness:.75, normal:1.3, roughDetail:true,
  draw(ctx, size, rng){
    const brush = fbm(rng.stream('brush'), 60, 6, 2, .5);
    paint(ctx, size, (u, v) => .80 + (brush(u, v) - .5) * .08);
    // 4x4 cells, two bars per cell in alternating directions: the standard
    // "durbar" pattern, and an integer grid so it tiles.
    treadBars(ctx, size, 'rgba(255,255,255,.30)', 'rgba(40,40,40,.35)');
    speckle(ctx, size, rng.stream('wear'), 200, .5, 1.8, (t, r) => greyA(t < .5 ? 1 : .6, .1 + r() * .18));
  },
  height(ctx, size, rng){
    paint(ctx, size, () => .22);
    treadBars(ctx, size, 'rgba(255,255,255,.95)', null);
  },
});

function treadBars(ctx, size, top, shade){
  const cells = 4, step = size / cells;
  const bar = (cx, cy, angle) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = top;
    ctx.beginPath(); ctx.ellipse(0, 0, step * .30, step * .085, 0, 0, Math.PI * 2); ctx.fill();
    if(shade){
      ctx.fillStyle = shade;
      ctx.beginPath(); ctx.ellipse(0, step * .05, step * .30, step * .05, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  };
  for(let j = 0; j < cells; j++){
    for(let i = 0; i < cells; i++){
      const cx = (i + .5) * step, cy = (j + .5) * step;
      for(let ox = -1; ox <= 1; ox++) for(let oy = -1; oy <= 1; oy++){
        bar(cx + ox * size - step * .18, cy + oy * size - step * .18, .7);
        bar(cx + ox * size + step * .18, cy + oy * size + step * .18, -.7);
      }
    }
  }
}

// ---------------- wood family

define('wood', {
  label:'Wood planks', labelIt:'Assi di legno', group:'wood',
  tile:1.8, roughness:.82, metalness:0, normal:.85,
  draw(ctx, size, rng){
    // Grain runs along U with a long, thin lattice; planks are separated by
    // real gaps so the boards read individually at any distance.
    const grain = fbm(rng.stream('grain'), 3, 60, 4, .55);
    const fibre = fbm(rng.stream('fibre'), 6, 160, 2, .5);
    const planks = 4;
    const r = rng.stream('planks');
    const tone = [];
    for(let i = 0; i < planks; i++) tone.push(.80 + r() * .2);
    paint(ctx, size, (u, v) => {
      const idx = Math.min(planks - 1, Math.floor(v * planks));
      const local = v * planks - idx;
      const ring = Math.abs(Math.sin((grain(u, v) * 6 + local * 1.7) * Math.PI));
      const edge = Math.min(local, 1 - local);
      const bevel = edge < .04 ? .55 + edge / .04 * .45 : 1;
      return tone[idx] * (.86 + ring * .18) * bevel + (fibre(u, v) - .5) * .06;
    });
    const k = rng.stream('knots');
    for(let i = 0; i < 6; i++){
      const x = k() * size;
      const idx = Math.floor(k() * planks);
      const y = (idx + .3 + k() * .4) * size / planks;
      const rr = size * (.01 + k() * .022);
      for(let ring = 5; ring >= 1; ring--) blob(ctx, size, x, y, rr * ring * .5, rr * ring * .32, 0, greyA(ring % 2 ? .58 : .9, .3));
    }
    const s = rng.stream('wear');
    for(let i = 0; i < 30; i++){
      const points = walk(s, s() * size, s() * size, (s() - .5) * .12, size * (.1 + s() * .5), 4, .06);
      wrapStroke(ctx, size, points, s() < .5 ? 'rgba(255,255,255,.09)' : 'rgba(70,70,70,.11)', .6 + s() * 1.1);
    }
  },
  height(ctx, size, rng){
    const grain = fbm(rng.stream('grain'), 3, 60, 4, .55);
    const planks = 4;
    paint(ctx, size, (u, v) => {
      const idx = Math.min(planks - 1, Math.floor(v * planks));
      const local = v * planks - idx;
      const ring = Math.abs(Math.sin((grain(u, v) * 6 + local * 1.7) * Math.PI));
      const edge = Math.min(local, 1 - local);
      const bevel = edge < .045 ? edge / .045 : 1;
      return (.5 + ring * .14) * bevel;
    });
    const k = rng.stream('knots');
    for(let i = 0; i < 6; i++){
      const x = k() * size;
      const idx = Math.floor(k() * planks);
      const y = (idx + .3 + k() * .4) * size / planks;
      const rr = size * (.01 + k() * .022);
      for(let ring = 5; ring >= 1; ring--) blob(ctx, size, x, y, rr * ring * .5, rr * ring * .32, 0, greyA(ring % 2 ? .25 : .8, .35));
    }
  },
});

define('plywood', {
  label:'Plywood sheet', labelIt:'Compensato', group:'wood',
  tile:2.4, roughness:.86, metalness:0, normal:.5,
  draw(ctx, size, rng){
    // One continuous veneer: broad sweeping grain, no plank gaps, plus the
    // oval repair patches every real sheet has.
    const sweep = fbm(rng.stream('sweep'), 2, 20, 4, .55);
    const fibre = fbm(rng.stream('fibre'), 5, 120, 2, .5);
    paint(ctx, size, (u, v) => {
      const ring = Math.abs(Math.sin((sweep(u, v) * 7 + v * 2.2) * Math.PI));
      return .88 * (.9 + ring * .14) + (fibre(u, v) - .5) * .07;
    });
    const p = rng.stream('patch');
    for(let i = 0; i < 4; i++){
      const x = p() * size, y = p() * size, rx = size * (.035 + p() * .045), ry = rx * .5;
      blob(ctx, size, x, y, rx, ry, p() * 3, 'rgba(80,80,80,.18)');
      blob(ctx, size, x, y, rx * .93, ry * .93, p() * 3, 'rgba(255,255,255,.12)');
    }
    speckle(ctx, size, rng.stream('knots'), 18, size * .004, size * .012, (t, r) => greyA(.5, .28 + r() * .28));
  },
  height(ctx, size, rng){
    const sweep = fbm(rng.stream('sweep'), 2, 20, 4, .55);
    paint(ctx, size, (u, v) => {
      const ring = Math.abs(Math.sin((sweep(u, v) * 7 + v * 2.2) * Math.PI));
      return .48 + ring * .12;
    });
    const p = rng.stream('patch');
    for(let i = 0; i < 4; i++){
      const x = p() * size, y = p() * size, rx = size * (.035 + p() * .045), ry = rx * .5;
      blob(ctx, size, x, y, rx, ry, p() * 3, 'rgba(0,0,0,.5)');
      blob(ctx, size, x, y, rx * .9, ry * .9, p() * 3, 'rgba(160,160,160,.6)');
    }
    speckle(ctx, size, rng.stream('knots'), 18, size * .004, size * .012, () => 'rgba(0,0,0,.5)');
  },
});

// ---------------- masonry family

// Running-bond course generator shared by brick and cinder block.
function courses(size, cols, rows, joint, drawUnit){
  const w = size / cols, h = size / rows;
  for(let row = -1; row <= rows; row++){
    const offset = (row % 2 === 0 ? 0 : w * .5);
    for(let col = -1; col <= cols; col++){
      drawUnit(col * w + offset + joint * .5, row * h + joint * .5, w - joint, h - joint, row, col);
    }
  }
}

define('brick', {
  label:'Brick', labelIt:'Mattoni', group:'masonry',
  tile:.9, roughness:.9, metalness:0, normal:1.15,
  draw(ctx, size, rng){
    const mortarNoise = fbm(rng.stream('mortar'), 30, 30, 3, .5);
    // Mortar first, bricks stamped on top. Mortar is LIGHTER than the brick so
    // the authored brick colour keeps driving the read.
    paint(ctx, size, (u, v) => .96 + (mortarNoise(u, v) - .5) * .13);
    const r = rng.stream('bricks');
    const joint = Math.max(2, size * .014);
    courses(size, 4, 12, joint, (x, y, w, h) => {
      const tone = .70 + r() * .22;
      // A whisper of warmth: enough to stop 48 identical grey slabs, not enough
      // to fight `props.color`.
      const warm = r() * .05;
      ctx.fillStyle = rgba(tone + warm, tone, tone - warm * .6, 1);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = greyA(1, .07 + r() * .06);
      ctx.fillRect(x, y, w, h * .3);
      ctx.fillStyle = greyA(0, .07 + r() * .06);
      ctx.fillRect(x, y + h * .78, w, h * .22);
      if(r() < .35){
        const cx = r() < .5 ? x : x + w, cy = r() < .5 ? y : y + h;
        ctx.fillStyle = greyA(.98, .5);
        ctx.beginPath();
        ctx.arc(cx, cy, h * (.12 + r() * .2), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    speckle(ctx, size, rng.stream('grit'), 400, .35, 1.1, (t, rr) => greyA(t < .5 ? 1 : .55, .1 + rr() * .2));
  },
  height(ctx, size, rng){
    paint(ctx, size, () => .18);
    const r = rng.stream('bricks');
    const joint = Math.max(2, size * .014);
    courses(size, 4, 12, joint, (x, y, w, h) => {
      const tone = .72 + r() * .2;
      ctx.fillStyle = greyA(tone, 1);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = greyA(0, .18);
      ctx.fillRect(x, y + h * .84, w, h * .16);
      r(); r();
      if(r() < .35){
        const cx = r() < .5 ? x : x + w, cy = r() < .5 ? y : y + h;
        ctx.fillStyle = greyA(.2, .8);
        ctx.beginPath();
        ctx.arc(cx, cy, h * (.12 + r() * .2), 0, Math.PI * 2);
        ctx.fill();
      }
    });
  },
});

define('cinderblock', {
  label:'Cinder block', labelIt:'Blocchi di cemento', group:'masonry',
  tile:1.2, roughness:.93, metalness:0, normal:1.1,
  draw(ctx, size, rng){
    const mortarNoise = fbm(rng.stream('mortar'), 26, 26, 3, .5);
    paint(ctx, size, (u, v) => .95 + (mortarNoise(u, v) - .5) * .12);
    const r = rng.stream('blocks');
    const joint = Math.max(2, size * .018);
    // 3 x 6 units on a 1.2 m tile = 40 x 20 cm blocks, the real thing.
    courses(size, 3, 6, joint, (x, y, w, h) => {
      const tone = .78 + r() * .14;
      ctx.fillStyle = greyA(tone, 1);
      ctx.fillRect(x, y, w, h);
      // The moulded web line down the middle of every block face.
      ctx.fillStyle = greyA(tone * .93, .55);
      ctx.fillRect(x + w * .48, y, w * .04, h);
      ctx.fillStyle = greyA(1, .06);
      ctx.fillRect(x, y, w, h * .12);
      ctx.fillStyle = greyA(0, .08);
      ctx.fillRect(x, y + h * .86, w, h * .14);
    });
    speckle(ctx, size, rng.stream('grit'), 650, .35, 1.4, (t, rr) => greyA(t < .5 ? 1 : .58, .12 + rr() * .22));
    crackNetwork(ctx, size, rng.stream('cracks'), 3, 'rgba(70,70,70,.22)', .8, .3);
  },
  height(ctx, size, rng){
    paint(ctx, size, () => .16);
    const r = rng.stream('blocks');
    const joint = Math.max(2, size * .018);
    courses(size, 3, 6, joint, (x, y, w, h) => {
      const tone = .74 + r() * .16;
      ctx.fillStyle = greyA(tone, 1);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = greyA(tone * .6, .8);
      ctx.fillRect(x + w * .48, y, w * .04, h);
    });
    speckle(ctx, size, rng.stream('grit'), 650, .35, 1.4, (t, rr) => greyA(t < .5 ? .9 : .3, .18 + rr() * .25));
  },
});

// ---------------- fabric / misc

define('sandbag', {
  label:'Sandbag burlap', labelIt:'Tela di juta (sacchi)', group:'fabric',
  tile:.9, roughness:.96, metalness:0, normal:1.25,
  draw(ctx, size, rng){
    // Over/under weave: 18 threads each way, sampled analytically so the
    // interlace is exact and seamless.
    const fuzz = fbm(rng.stream('fuzz'), 50, 50, 3, .55);
    const sag = fbm(rng.stream('sag'), 3, 3, 3, .5);
    const threads = 18;
    paint(ctx, size, (u, v) => {
      const tu = u * threads, tv = v * threads;
      const fu = tu - Math.floor(tu), fv = tv - Math.floor(tv);
      const overWarp = (Math.floor(tu) + Math.floor(tv)) % 2 === 0;
      const warp = Math.sin(fu * Math.PI);
      const weft = Math.sin(fv * Math.PI);
      const value = overWarp ? .72 + warp * .3 - weft * .05 : .72 + weft * .3 - warp * .05;
      return clamp01(value * (.9 + sag(u, v) * .2) + (fuzz(u, v) - .5) * .12);
    });
    // Loose fibres round off the machine-perfect weave.
    const f = rng.stream('fibre');
    for(let i = 0; i < 90; i++){
      const points = walk(f, f() * size, f() * size, f() * Math.PI * 2, size * (.02 + f() * .06), 3, .6);
      wrapStroke(ctx, size, points, f() < .5 ? 'rgba(255,255,255,.16)' : 'rgba(80,80,80,.16)', .7);
    }
    speckle(ctx, size, rng.stream('dirt'), 240, .5, 2, (t, r) => greyA(.6, .08 + r() * .16));
  },
  height(ctx, size, rng){
    const threads = 18;
    const sag = fbm(rng.stream('sag'), 3, 3, 3, .5);
    paint(ctx, size, (u, v) => {
      const tu = u * threads, tv = v * threads;
      const fu = tu - Math.floor(tu), fv = tv - Math.floor(tv);
      const overWarp = (Math.floor(tu) + Math.floor(tv)) % 2 === 0;
      const warp = Math.sin(fu * Math.PI);
      const weft = Math.sin(fv * Math.PI);
      const value = overWarp ? .3 + warp * .68 : .3 + weft * .68;
      return clamp01(value * (.85 + sag(u, v) * .3));
    });
  },
});

define('tarp', {
  label:'Tarpaulin', labelIt:'Telone', group:'fabric',
  tile:2, roughness:.84, metalness:0, normal:.9,
  draw(ctx, size, rng){
    const weave = 30;
    const dirt = fbm(rng.stream('dirt'), 4, 4, 4, .55);
    paint(ctx, size, (u, v) => {
      const wu = Math.abs(Math.sin(u * Math.PI * weave));
      const wv = Math.abs(Math.sin(v * Math.PI * weave));
      const cross = Math.max(wu, wv) * .5 + Math.min(wu, wv) * .2;
      return .86 + cross * .12 - Math.pow(clamp01(dirt(u, v)), 2) * .18;
    });
    // Creases: a folded tarp is mostly creases, and they are what makes the
    // material read as cloth instead of painted board.
    const c = rng.stream('crease');
    for(let i = 0; i < 12; i++){
      const points = walk(c, c() * size, c() * size, c() * Math.PI * 2, size * (.5 + c()), 6, .3);
      wrapStroke(ctx, size, points, 'rgba(60,60,60,.13)', 2 + c() * 5);
      wrapStroke(ctx, size, points.map(value => value + 3), 'rgba(255,255,255,.11)', 1.5 + c() * 3);
    }
  },
  height(ctx, size, rng){
    const weave = 30;
    paint(ctx, size, (u, v) => {
      const wu = Math.abs(Math.sin(u * Math.PI * weave));
      const wv = Math.abs(Math.sin(v * Math.PI * weave));
      return .5 + (Math.max(wu, wv) - .5) * .2;
    });
    const c = rng.stream('crease');
    for(let i = 0; i < 12; i++){
      const points = walk(c, c() * size, c() * size, c() * Math.PI * 2, size * (.5 + c()), 6, .3);
      wrapStroke(ctx, size, points, 'rgba(0,0,0,.32)', 2 + c() * 5);
      wrapStroke(ctx, size, points.map(value => value + 3), 'rgba(255,255,255,.32)', 1.5 + c() * 3);
    }
  },
});

define('rubber', {
  label:'Rubber', labelIt:'Gomma', group:'misc',
  tile:1, roughness:.88, metalness:0, normal:.8,
  draw(ctx, size, rng){
    const pebble = fbm(rng.stream('pebble'), 34, 34, 3, .5);
    const wide = fbm(rng.stream('wide'), 4, 4, 3, .5);
    paint(ctx, size, (u, v) => .88 + (pebble(u, v) - .5) * .12 + (wide(u, v) - .5) * .05);
    speckle(ctx, size, rng.stream('grain'), 600, .4, 1.3, (t, r) => greyA(t < .5 ? 1 : .68, .1 + r() * .18));
    // Mould parting lines
    const m = rng.stream('mould');
    for(let i = 0; i < 3; i++){
      const y = m() * size;
      wrapStroke(ctx, size, [0, y, size, y + (m() - .5) * size * .05], 'rgba(255,255,255,.09)', 1 + m() * 1.5);
    }
    const s = rng.stream('scuff');
    for(let i = 0; i < 20; i++){
      const points = walk(s, s() * size, s() * size, s() * Math.PI * 2, size * (.05 + s() * .3), 3, .4);
      wrapStroke(ctx, size, points, 'rgba(255,255,255,.08)', .8 + s() * 1.2);
    }
  },
  height(ctx, size, rng){
    const pebble = fbm(rng.stream('pebble'), 34, 34, 3, .5);
    const wide = fbm(rng.stream('wide'), 4, 4, 3, .5);
    paint(ctx, size, (u, v) => .5 + (pebble(u, v) - .5) * .5 + (wide(u, v) - .5) * .12);
    speckle(ctx, size, rng.stream('grain'), 600, .4, 1.3, (t, r) => greyA(t < .5 ? .9 : .3, .15 + r() * .2));
  },
});

// ---------------- snow family
//
// ADDITIVE BLOCK. Nothing above this comment changed; the snowboarding level
// template (js/runtime/snowboarding-level-template.js) needs a snow that is not
// one flat blue-white, and a flat colour is exactly what made the old run read
// as a paper cut-out.
//
// The five kinds below are ONE material ladder, ordered the way the mountain
// itself is ordered - from what falls out of the sky to what the mountain is
// made of - and the terrain picks between them by altitude and by how much
// traffic a sector has taken:
//
//   snowPowder   untouched off-piste, above the tree line and outside the ropes
//   snowGroomed  the corduroy a piste basher leaves overnight, on the piste
//   snowPacked   skied-out hardpack: scallops and chatter, the middle of the run
//   snowIce      boilerplate: scraped-off, refrozen, in the fall line of a steep
//   snowRock     the schist that shows through where the cover is too thin
//
// WHY SNOW IS DRAWN THE WAY IT IS
// Snow is the hardest surface in this module because it is almost white: the
// usual trick of separating features by VALUE has almost no range left to work
// with. So every kind here separates by RELIEF and by SPARKLE instead.
//  * The albedo stays in a narrow 0.90..1.0 band. Anything darker reads as dirty
//    snow the moment the sun hits it.
//  * The relief carries the whole read - sastrugi, corduroy ribs, scallops - and
//    it is authored much stronger than on any other kind (`normal` >= 1.2).
//  * SPARKLE is a two-scale feature, not one: a dense field of sub-pixel grains
//    that survives into the mip chain as a faint shimmer, plus a sparse field of
//    big bright specular flakes. That is the CPU half of the glint model the
//    literature describes (stochastic microfacet glints, evaluated as an
//    additive term inside direct specular); the view-dependent half - the flake
//    that only flares at one angle - cannot live in a static texture and is done
//    in the shell shader injection in js/runtime/snow-trail.js.
//  * Snow is a DIELECTRIC. metalness stays 0 on every kind here, including ice:
//    ice reads as ice through low roughness, not through metalness.

// Sparkle for a snow albedo: a dense grain field the mips average into a
// shimmer, plus sparse hot flakes that survive as individual glints up close.
// Shared by every snow kind so a groomed piste and the powder beside it sparkle
// as the same material in the same light.
function snowSparkle(ctx, size, rng, grains, flakes){
  speckle(ctx, size, rng.stream('grain'), grains, .3, .8, (t, r) => greyA(t < .5 ? 1 : .84, .18 + r() * .3));
  speckle(ctx, size, rng.stream('flake'), flakes, .5, 1.5, (t, r) => greyA(1, .45 + r() * .55));
}
// The same flakes as relief, so a glint sits on a facet that is actually tilted
// toward the light rather than on flat ground.
function snowSparkleHeight(ctx, size, rng, grains, flakes){
  speckle(ctx, size, rng.stream('grain'), grains, .3, .8, (t, r) => greyA(t < .5 ? .9 : .35, .2 + r() * .3));
  speckle(ctx, size, rng.stream('flake'), flakes, .5, 1.5, (t, r) => greyA(1, .5 + r() * .5));
}

define('snowPowder', {
  label:'Snow (fresh powder)', labelIt:'Neve (fresca)', group:'snow',
  tile:2.6, roughness:.97, metalness:0, normal:1.2,
  draw(ctx, size, rng){
    const drift = fbm(rng.stream('drift'), 3, 3, 5, .55);
    const settle = fbm(rng.stream('settle'), 26, 26, 3, .5);
    // Sastrugi: wind-carved ridges. Same wrapping-sine-pushed-by-noise trick the
    // sand kind uses for ripples, but longer wavelength and softer, because wind
    // packs snow into dunes rather than into corrugation.
    const wind = fbm(rng.stream('wind'), 2, 8, 2, .5);
    paint(ctx, size, (u, v) => {
      const sastrugi = Math.sin((v * 5 + wind(u, v) * 2.6) * Math.PI * 2) * .5 + .5;
      return .965 + (drift(u, v) - .5) * .05 + (settle(u, v) - .5) * .03 + (sastrugi - .5) * .022;
    });
    snowSparkle(ctx, size, rng, 2600, 90);
  },
  height(ctx, size, rng){
    const drift = fbm(rng.stream('drift'), 3, 3, 5, .55);
    const settle = fbm(rng.stream('settle'), 26, 26, 3, .5);
    const wind = fbm(rng.stream('wind'), 2, 8, 2, .5);
    paint(ctx, size, (u, v) => {
      const sastrugi = Math.sin((v * 5 + wind(u, v) * 2.6) * Math.PI * 2) * .5 + .5;
      return .5 + (drift(u, v) - .5) * .42 + (settle(u, v) - .5) * .2 + (sastrugi - .5) * .3;
    });
    snowSparkleHeight(ctx, size, rng, 2600, 90);
  },
});

define('snowGroomed', {
  label:'Snow (groomed corduroy)', labelIt:'Neve (battuta a corduroy)', group:'snow',
  // The tile is the width of ONE pass of the tiller so a 24 m piste lands on
  // ribs the eye can count; authors turn the grooming direction with `rotate`.
  tile:1.8, roughness:.94, metalness:0, normal:1.35,
  draw(ctx, size, rng){
    const bed = fbm(rng.stream('bed'), 4, 4, 4, .5);
    const fine = fbm(rng.stream('fine'), 34, 34, 2, .5);
    // 12 ribs per tile: an integer count is what keeps the corduroy seamless.
    paint(ctx, size, (u, v) => {
      const rib = Math.sin(u * Math.PI * 2 * 12) * .5 + .5;
      return .955 + rib * .04 + (bed(u, v) - .5) * .035 + (fine(u, v) - .5) * .02;
    });
    // Track marks the cat leaves between passes: faint, and only every few ribs.
    const t = rng.stream('track');
    for(let i = 0; i < 6; i++){
      const x = Math.round(t() * 12) / 12 * size;
      wrapStroke(ctx, size, [x, -size * .1, x + (t() - .5) * size * .02, size * 1.1], greyA(.86, .1 + t() * .1), 1 + t() * 2);
    }
    snowSparkle(ctx, size, rng, 1800, 60);
  },
  height(ctx, size, rng){
    const bed = fbm(rng.stream('bed'), 4, 4, 4, .5);
    paint(ctx, size, (u, v) => {
      const rib = Math.sin(u * Math.PI * 2 * 12) * .5 + .5;
      return .3 + rib * .55 + (bed(u, v) - .5) * .16;
    });
    snowSparkleHeight(ctx, size, rng, 1800, 60);
  },
});

define('snowPacked', {
  label:'Snow (skied-out hardpack)', labelIt:'Neve (battuta dura)', group:'snow',
  tile:2.2, roughness:.9, metalness:0, normal:1.3, roughDetail:true,
  draw(ctx, size, rng){
    const bed = fbm(rng.stream('bed'), 5, 5, 4, .55);
    const grit = fbm(rng.stream('grit'), 40, 40, 2, .5);
    paint(ctx, size, (u, v) => .945 + (bed(u, v) - .5) * .07 + (grit(u, v) - .5) * .03);
    // Scallops: the shallow dishes an edge leaves. Drawn as an overlapping pair
    // of blobs - a bright pushed-up lip and the darker dish inside it - which is
    // the same two-part read a chip in painted metal gets.
    const s = rng.stream('scallop');
    for(let i = 0; i < 70; i++){
      const x = s() * size, y = s() * size, r = size * (.02 + s() * .05);
      blob(ctx, size, x, y, r * 1.25, r * .7, s() * 3, greyA(1, .16));
      blob(ctx, size, x, y + r * .2, r, r * .55, s() * 3, greyA(.86, .14));
    }
    // Chatter: the short parallel scrapes an edge chatters across hardpack.
    const c = rng.stream('chatter');
    for(let i = 0; i < 40; i++){
      const points = walk(c, c() * size, c() * size, Math.PI / 2 + (c() - .5) * .3, size * (.04 + c() * .1), 3, .12);
      wrapStroke(ctx, size, points, c() < .5 ? greyA(1, .2) : greyA(.82, .16), .8 + c() * 1.4);
    }
    snowSparkle(ctx, size, rng, 1200, 34);
  },
  height(ctx, size, rng){
    const bed = fbm(rng.stream('bed'), 5, 5, 4, .55);
    paint(ctx, size, (u, v) => .58 + (bed(u, v) - .5) * .2);
    const s = rng.stream('scallop');
    for(let i = 0; i < 70; i++){
      const x = s() * size, y = s() * size, r = size * (.02 + s() * .05);
      blob(ctx, size, x, y, r * 1.25, r * .7, s() * 3, greyA(1, .28));
      blob(ctx, size, x, y + r * .2, r, r * .55, s() * 3, 'rgba(0,0,0,.3)');
    }
    const c = rng.stream('chatter');
    for(let i = 0; i < 40; i++){
      const points = walk(c, c() * size, c() * size, Math.PI / 2 + (c() - .5) * .3, size * (.04 + c() * .1), 3, .12);
      wrapStroke(ctx, size, points, 'rgba(0,0,0,.35)', .8 + c() * 1.4);
    }
    snowSparkleHeight(ctx, size, rng, 1200, 34);
  },
});

define('snowIce', {
  label:'Snow (boilerplate ice)', labelIt:'Neve (lastra di ghiaccio)', group:'snow',
  // Ice is the one place a snow kind may leave the near-white band: refrozen
  // scrape holds the sky rather than scattering it, so it reads darker and
  // glossier, and its roughness map is what tells the two apart at a glance.
  tile:3, roughness:.26, metalness:0, normal:.75, roughDetail:true,
  draw(ctx, size, rng){
    const sheet = fbm(rng.stream('sheet'), 3, 3, 4, .55);
    const cloud = fbm(rng.stream('cloud'), 12, 12, 3, .5);
    paint(ctx, size, (u, v) => .90 + (sheet(u, v) - .5) * .1 + (cloud(u, v) - .5) * .05);
    // Long edge scrapes down the fall line, plus the crazing a refreeze leaves.
    const s = rng.stream('scrape');
    for(let i = 0; i < 26; i++){
      const x = s() * size;
      wrapStroke(ctx, size, [x, -size * .1, x + (s() - .5) * size * .06, size * 1.1], s() < .5 ? greyA(1, .16) : greyA(.8, .12), .6 + s() * 2.2);
    }
    crackNetwork(ctx, size, rng.stream('craze'), 6, 'rgba(255,255,255,.22)', .9, .5);
    speckle(ctx, size, rng.stream('bubble'), 220, .4, 1.4, (t, r) => greyA(t < .5 ? 1 : .74, .12 + r() * .2));
  },
  height(ctx, size, rng){
    const sheet = fbm(rng.stream('sheet'), 3, 3, 4, .55);
    paint(ctx, size, (u, v) => .62 + (sheet(u, v) - .5) * .22);
    const s = rng.stream('scrape');
    for(let i = 0; i < 26; i++){
      const x = s() * size;
      wrapStroke(ctx, size, [x, -size * .1, x + (s() - .5) * size * .06, size * 1.1], 'rgba(0,0,0,.4)', .6 + s() * 2.2);
    }
    crackNetwork(ctx, size, rng.stream('craze'), 6, 'rgba(0,0,0,.6)', 1, .5);
  },
  rough(ctx, size, rng){
    // Wet-looking polished lanes where an edge has scraped, matte where the
    // snow survived. This contrast IS the ice, so it gets a hand-authored map
    // rather than one derived from the relief.
    const sheet = fbm(rng.stream('sheet'), 3, 3, 4, .55);
    paint(ctx, size, (u, v) => clamp01(.55 + (sheet(u, v) - .5) * .7));
    const s = rng.stream('scrape');
    for(let i = 0; i < 26; i++){
      const x = s() * size;
      wrapStroke(ctx, size, [x, -size * .1, x + (s() - .5) * size * .06, size * 1.1], 'rgba(20,20,20,.55)', .6 + s() * 2.2);
    }
  },
});

define('snowRock', {
  label:'Snow (rock outcrop)', labelIt:'Neve (roccia affiorante)', group:'snow',
  tile:2.8, roughness:.96, metalness:0, normal:1.45,
  draw(ctx, size, rng){
    const strata = fbm(rng.stream('strata'), 2, 16, 4, .55);
    const face = fbm(rng.stream('face'), 7, 7, 5, .55);
    // Schist: bedding planes running one way, broken by fracture. Authored dark
    // so it survives being multiplied by the pale authored rock colour.
    paint(ctx, size, (u, v) => .72 + (strata(u, v) - .5) * .3 + (face(u, v) - .5) * .16);
    crackNetwork(ctx, size, rng.stream('fracture'), 9, 'rgba(30,30,30,.5)', 1.3, .7);
    // Snow caught in the ledges: bright, only ever in the flat-lying cracks, and
    // the single feature that says "rock in winter" rather than "rock".
    const w = rng.stream('windblown');
    for(let i = 0; i < 26; i++){
      const y = w() * size;
      wrapStroke(ctx, size, walk(w, 0, y, (w() - .5) * .25, size * 1.2, 6, .18), greyA(1, .3 + w() * .35), 1.5 + w() * 4);
    }
    speckle(ctx, size, rng.stream('quartz'), 320, .4, 1.6, (t, r) => greyA(t < .4 ? 1 : .5, .18 + r() * .3));
  },
  height(ctx, size, rng){
    const strata = fbm(rng.stream('strata'), 2, 16, 4, .55);
    const face = fbm(rng.stream('face'), 7, 7, 5, .55);
    paint(ctx, size, (u, v) => .5 + (strata(u, v) - .5) * .5 + (face(u, v) - .5) * .3);
    crackNetwork(ctx, size, rng.stream('fracture'), 9, 'rgba(0,0,0,.85)', 1.6, .7);
    const w = rng.stream('windblown');
    for(let i = 0; i < 26; i++){
      const y = w() * size;
      wrapStroke(ctx, size, walk(w, 0, y, (w() - .5) * .25, size * 1.2, 6, .18), greyA(1, .3 + w() * .3), 1.5 + w() * 4);
    }
  },
});

const KINDS = Object.freeze(Object.keys(DEFS));

// ------------------------------------------------ public data helpers

function has(kind){ return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(DEFS, kind); }
function sizeOf(def){ return def.size || DEFAULT_SIZE; }
function hasRoughnessMap(def){ return !!(def.rough || def.roughDetail); }

function list(){
  return KINDS.map(id => {
    const def = DEFS[id];
    return {
      id,
      label:def.label,
      labelIt:def.labelIt || def.label,
      group:def.group,
      tile:def.tile,
      roughness:def.roughness,
      metalness:def.metalness,
      size:sizeOf(def),
      roughnessMap:hasRoughnessMap(def),
      metalnessMap:!!def.metal,
    };
  });
}

function defaults(kind){
  if(!has(kind)) return null;
  const def = DEFS[kind];
  return {
    kind,
    label:def.label,
    labelIt:def.labelIt || def.label,
    group:def.group,
    tile:def.tile,
    seed:0,
    strength:1,
    rotate:0,
    roughness:def.roughness,
    metalness:def.metalness,
    size:sizeOf(def),
    seedVariants:SEED_VARIANTS,
  };
}

// A surfaceTexture prop is authored data that has to survive save -> reload
// unchanged, so normalization is total: everything gets a canonical value and
// an unknown kind collapses to null instead of half-applying. `seed` is wrapped
// into the variant pool here rather than at build time, so what a project saves
// is exactly what it renders.
function normalize(spec){
  if(spec == null || spec === false) return null;
  let source = spec;
  if(typeof source === 'string') source = {kind:source};
  if(typeof source !== 'object') return null;
  const kind = typeof source.kind === 'string' ? source.kind : null;
  if(!has(kind)) return null;
  const def = DEFS[kind];
  const rotate = Math.abs(Math.round(num(source.rotate, 0))) % 180;
  const out = {
    kind,
    tile:Math.max(.02, num(source.tile, def.tile)),
    seed:Math.max(0, Math.floor(num(source.seed, 0))) % SEED_VARIANTS,
    strength:clamp(num(source.strength, 1), 0, 1),
    rotate:rotate === 90 ? 90 : 0,
  };
  if(source.roughness != null && Number.isFinite(Number(source.roughness))) out.roughness = clamp(Number(source.roughness), 0, 1);
  if(source.metalness != null && Number.isFinite(Number(source.metalness))) out.metalness = clamp(Number(source.metalness), 0, 1);
  return out;
}

// ------------------------------------------------ world-space tiling

// The UV span of one primitive in metres. Box faces disagree with each other by
// construction (one repeat, three face orientations), so the two axes are
// AREA-WEIGHTED: the biggest face - the one the player actually looks at - wins,
// and thin faces only stretch where nobody can tell.
function boxWorldSize(x, y, z){
  const ax = y * z, ay = x * z, az = x * y;
  const total = ax + ay + az;
  if(!(total > 0)) return {u:Math.max(x, .001), v:Math.max(y, .001)};
  return {
    u:(ax * z + ay * x + az * x) / total,
    v:(ax * y + ay * z + az * y) / total,
  };
}

function worldSize(options){
  const opts = options || {};
  if(opts.worldSize && Number.isFinite(Number(opts.worldSize.u))) return {u:Math.abs(Number(opts.worldSize.u)) || 1, v:Math.abs(Number(opts.worldSize.v)) || 1};
  const scale = Array.isArray(opts.scale) ? opts.scale : [1, 1, 1];
  const sx = Math.abs(num(scale[0], 1)) || 1;
  const sy = Math.abs(num(scale[1], 1)) || 1;
  const sz = Math.abs(num(scale[2], 1)) || 1;
  switch(opts.prim){
    // PlaneGeometry(4,4) laid flat: the group's X and Z scales are the ones the
    // 4x4 sheet is stretched by.
    case 'plane': return {u:4 * sx, v:4 * sz};
    case 'arc': return {u:4 * sx, v:4 * sz};
    // CylinderGeometry(1,1,2,20): U wraps the circumference, V spans the height.
    case 'cylinder': return {u:2 * Math.PI * (sx + sz) / 2, v:2 * sy};
    case 'cone': return {u:2 * Math.PI * (sx + sz) / 2, v:2 * sy};
    case 'sphere': return {u:2 * Math.PI * 1.2 * (sx + sz) / 2, v:Math.PI * 1.2 * sy};
    case 'torus': return {u:2 * Math.PI * 1.4 * Math.max(sx, sz), v:2 * Math.PI * .4 * sy};
    case 'triangle': return {u:2 * sx, v:2 * sy};
    // ExtrudeGeometry's default UV generator emits GEOMETRY units, not 0..1, so
    // one UV unit is already one local metre and only the scale is left.
    case 'ramp': return {u:sx, v:(sy + sz) / 2};
    default: return boxWorldSize(2 * sx, 2 * sy, 2 * sz);
  }
}

function repeatFor(spec, options){
  const normalized = normalize(spec);
  if(!normalized) return {x:1, y:1};
  const size = worldSize(options);
  const tile = normalized.tile > 0 ? normalized.tile : DEFS[normalized.kind].tile;
  return {
    x:clamp(size.u / tile, .02, 256),
    y:clamp(size.v / tile, .02, 256),
  };
}

// ------------------------------------------------ generation + cache

const CACHE = new Map();
let anisotropyOverride = null;

function cacheKey(spec){
  return spec.kind + '|' + spec.seed + '|' + spec.strength.toFixed(3) + '|' + spec.rotate;
}

function three(){
  if(typeof window !== 'undefined' && window.THREE) return window.THREE;
  return typeof THREE !== 'undefined' ? THREE : null;
}

function maxAnisotropy(){
  if(anisotropyOverride != null) return anisotropyOverride;
  try {
    const renderer = window.LOT_KING && window.LOT_KING.core && window.LOT_KING.core.renderer;
    const cap = renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy && renderer.capabilities.getMaxAnisotropy();
    if(Number.isFinite(cap) && cap > 0) return Math.min(8, cap);
  } catch(err){}
  return 4;
}

// One texture, one private pixel buffer, no canvas kept alive. RGBA /
// UnsignedByte is the only shape MeshStandardMaterial's samplers want: three
// reads roughness from GREEN and metalness from BLUE of an ordinary colour
// texture, so single-channel formats would be both wrong and unsupported here.
function makeTexture(data, size, colorData){
  const T = three();
  if(!T || !data || !T.DataTexture) return null;
  const texture = new T.DataTexture(data, size, size, T.RGBAFormat, T.UnsignedByteType);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  // Albedo carries authored colour and must be decoded from sRGB; relief and
  // roughness are DATA and are destroyed by that decode, so they stay linear.
  if(colorData) texture.colorSpace = T.SRGBColorSpace;
  else if(T.NoColorSpace !== undefined) texture.colorSpace = T.NoColorSpace;
  else if(T.LinearSRGBColorSpace !== undefined) texture.colorSpace = T.LinearSRGBColorSpace;
  texture.anisotropy = maxAnisotropy();
  texture.generateMipmaps = true;
  if(T.LinearMipmapLinearFilter !== undefined) texture.minFilter = T.LinearMipmapLinearFilter;
  if(T.LinearFilter !== undefined) texture.magFilter = T.LinearFilter;
  // Rows were flipped on the CPU (see flipRows), so the GPU must not flip again.
  texture.flipY = false;
  texture.needsUpdate = true;
  texture.name = 'lk-surface';
  texturesBuilt++;
  return texture;
}

function build(spec){
  const def = DEFS[spec.kind];
  const size = sizeOf(def);
  const seedKey = spec.kind + ':' + spec.seed;

  let albedo = render(size, ctx => def.draw(ctx, size, makeRng(seedKey), spec));
  if(!albedo) return null;
  let height = render(size, ctx => def.height(ctx, size, makeRng(seedKey), spec));
  let rough = def.rough ? render(size, ctx => def.rough(ctx, size, makeRng(seedKey), spec)) : null;
  let metal = def.metal ? render(size, ctx => def.metal(ctx, size, makeRng(seedKey), spec)) : null;

  if(spec.rotate === 90){
    // Rotating the SOURCE pixels (rather than the texture) keeps the normal map
    // consistent: the Sobel below runs on the already-rotated relief, so the
    // tangent-space X/Y channels come out right without a channel swap.
    albedo = rotateData90(albedo, size);
    if(height) height = rotateData90(height, size);
    if(rough) rough = rotateData90(rough, size);
    if(metal) metal = rotateData90(metal, size);
  }
  if(spec.strength < .999) flattenContrast(albedo, .35 + spec.strength * .65);

  const normal = height ? normalFromHeight(height, size, 2.2 * (def.normal == null ? 1 : def.normal) * spec.strength) : null;
  // A derived roughness map only earns its megabyte on surfaces where roughness
  // contrast is visible; matte dielectrics get the scalar hint and the relief.
  if(!rough && height && def.roughDetail) rough = roughFromHeight(height, size, .74);

  const entry = {
    key:cacheKey(spec),
    spec,
    size,
    map:makeTexture(flipRows(albedo, size), size, true),
    normalMap:normal ? makeTexture(flipRows(normal, size), size, false) : null,
    roughnessMap:rough ? makeTexture(flipRows(rough, size), size, false) : null,
    metalnessMap:metal ? makeTexture(flipRows(metal, size), size, false) : null,
    normalScale:.85 * (def.normal == null ? 1 : def.normal) * spec.strength,
    clones:0,
  };
  if(!entry.map) return null;
  setsBuilt++;
  return entry;
}

function anySetForKind(kind){
  let found = null;
  CACHE.forEach(entry => { if(!found && entry.spec.kind === kind) found = entry; });
  return found;
}

function ensureSet(spec){
  const cached = CACHE.get(cacheKey(spec));
  if(cached) return cached;
  // Ceiling: at most MAX_SETS variant sets, PLUS a guaranteed first set per
  // kind so no kind is ever unrenderable. Past the ceiling a new variant reuses
  // whatever set that kind already has instead of growing GPU memory: losing
  // some seed variety is invisible, running out of texture memory is not.
  if(CACHE.size >= MAX_SETS){
    const reuse = CACHE.get(cacheKey(Object.assign({}, spec, {seed:0, strength:1}))) || anySetForKind(spec.kind);
    if(reuse) return reuse;
  }
  const built = build(spec);
  if(built) CACHE.set(built.key, built);
  return built;
}

// ------------------------------------------------ material application

function tagOf(texture){ return texture && texture.userData ? texture.userData[TAG] : null; }
function isProcedural(texture){ return !!tagOf(texture); }

function cloneFor(entry, source, slot, spec){
  if(!source) return null;
  const texture = source.clone ? source.clone() : source;
  texture.userData = texture.userData || {};
  // The tag is what tells scene-store's disposal path to keep its hands off:
  // clones share `source` with every other user of this kind, and duplicated
  // objects share the very same clone with the object they were copied from.
  texture.userData[TAG] = {key:entry.key, kind:spec.kind, slot, spec, shared:true};
  texture.needsUpdate = true;
  entry.clones++;
  clonesHandedOut++;
  return texture;
}

function assignSlot(material, slot, entry, source, spec){
  const current = material[slot];
  const tag = tagOf(current);
  if(tag && tag.key !== entry.key && current.dispose) current.dispose();
  material[slot] = cloneFor(entry, source, slot, spec);
}

function applyHints(material, spec){
  const def = DEFS[spec.kind];
  const roughness = spec.roughness != null ? spec.roughness : def.roughness;
  const metalness = spec.metalness != null ? spec.metalness : def.metalness;
  if(material.roughness != null && roughness != null) material.roughness = roughness;
  if(material.metalness != null && metalness != null) material.metalness = metalness;
}

function apply(material, spec, options){
  const normalized = normalize(spec);
  if(!material || !normalized) return null;
  // Standard/Physical only. Unlit (MeshBasicMaterial) glow panels must stay
  // flat, and a toon material has no roughness channel to speak of.
  if(!(material.isMeshStandardMaterial || material.isMeshPhysicalMaterial)) return null;
  const entry = ensureSet(normalized);
  if(!entry) return null;
  const existing = tagOf(material.map);
  if(!existing || existing.key !== entry.key){
    assignSlot(material, 'map', entry, entry.map, normalized);
    assignSlot(material, 'normalMap', entry, entry.normalMap, normalized);
    assignSlot(material, 'roughnessMap', entry, entry.roughnessMap, normalized);
    assignSlot(material, 'metalnessMap', entry, entry.metalnessMap, normalized);
    if(material.normalScale && material.normalScale.set) material.normalScale.set(entry.normalScale, entry.normalScale);
    if(!options || options.hints !== false) applyHints(material, normalized);
    material.needsUpdate = true;
  }
  retile(material, options);
  return normalized;
}

// Repeat is recomputed from the LIVE scale rather than baked at creation: the
// group scale only exists after createFromEntry applies the transform, and the
// editor keeps changing it afterwards.
function retile(material, options){
  if(!material) return false;
  let changed = false;
  for(let i = 0; i < MAP_SLOTS.length; i++){
    const texture = material[MAP_SLOTS[i]];
    const tag = tagOf(texture);
    if(!tag || !texture.repeat) continue;
    const repeat = repeatFor(tag.spec, options);
    if(texture.repeat.x !== repeat.x || texture.repeat.y !== repeat.y){
      texture.repeat.set(repeat.x, repeat.y);
      changed = true;
    }
  }
  return changed;
}

function clear(material){
  if(!material) return false;
  let changed = false;
  MAP_SLOTS.forEach(slot => {
    const texture = material[slot];
    if(!isProcedural(texture)) return;
    if(texture.dispose) texture.dispose();
    material[slot] = null;
    changed = true;
  });
  if(changed) material.needsUpdate = true;
  return changed;
}

// Material.clone() copies texture REFERENCES, so a duplicated object would
// share one texture instance - and therefore one repeat - with its source.
// Re-cloning the tagged maps gives the copy its own tiling while still sharing
// the GPU upload.
function adopt(material){
  if(!material) return false;
  let changed = false;
  MAP_SLOTS.forEach(slot => {
    const texture = material[slot];
    const tag = tagOf(texture);
    if(!tag) return;
    const entry = CACHE.get(tag.key);
    if(!entry) return;
    material[slot] = cloneFor(entry, entry[slot] || texture, slot, tag.spec);
    changed = true;
  });
  return changed;
}

// ------------------------------------------------ lifecycle

// Bytes a texture occupies on the GPU: RGBA8 plus the mip chain (+1/3).
function textureBytes(size){ return Math.round(size * size * 4 * 4 / 3); }

function stats(){
  let textures = 0, bytes = 0;
  CACHE.forEach(entry => {
    MAP_SLOTS.forEach(slot => {
      if(!entry[slot]) return;
      textures++;
      bytes += textureBytes(entry.size);
    });
  });
  return {
    sets:CACHE.size,
    kinds:KINDS.length,
    maxSets:MAX_SETS,
    seedVariants:SEED_VARIANTS,
    canvases:canvasesBuilt,
    liveCanvases:SCRATCH.size,
    textures,
    texturesBuilt,
    setsBuilt,
    clones:clonesHandedOut,
    bytes,
    megabytes:Math.round(bytes / 1048576 * 10) / 10,
    keys:Array.from(CACHE.keys()),
  };
}

// Frees every generated set. Only safe when nothing is still rendering them
// (level teardown), which is exactly why the per-object disposal path does NOT
// call it.
function dispose(){
  CACHE.forEach(entry => {
    MAP_SLOTS.forEach(slot => { if(entry[slot] && entry[slot].dispose) entry[slot].dispose(); });
  });
  CACHE.clear();
  return true;
}

function configure(options){
  const opts = options || {};
  if(opts.anisotropy != null) anisotropyOverride = Math.max(1, Math.floor(Number(opts.anisotropy) || 1));
  return {anisotropy:anisotropyOverride};
}

window.LK_ENGINE_PROCEDURAL_SURFACES = Object.freeze({
  VERSION,
  TAG,
  KINDS,
  SEED_VARIANTS,
  MAX_SETS,
  list, has, defaults, normalize,
  worldSize, repeatFor,
  apply, retile, clear, adopt, isProcedural,
  stats, dispose, configure,
});
})();
