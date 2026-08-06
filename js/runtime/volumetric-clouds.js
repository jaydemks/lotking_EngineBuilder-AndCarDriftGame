/* =========================================================
   LOT KING - volumetric clouds runtime module
   Nuvole volumetriche raymarched su un dome, tecnica Nubis /
   Horizon: shape Perlin-Worley in una 3D texture generata una
   volta sola, erosione ad alta frequenza, Beer-Lambert con
   doppio lobo Henyey-Greenstein, multiple-scattering a ottave
   e ambiente agganciato al ciclo giorno-notte.
   Budget performance: march solo sui pixel di cielo, passi
   limitati e adattivi, salto degli spazi vuoti, early-exit su
   trasmittanza, dither interleaved al posto del banding.
   Ordine del file: 1) config e funzioni pure  2) rumore
   3) shader  4) create()  5) export.
   ========================================================= */
(function(){
'use strict';

/* ---------- 1. config e funzioni pure (testabili senza WebGL) ---------- */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const finiteOr = (value, fallback) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const remap01 = (v, lo, hi) => clamp((v - lo) / Math.max(hi - lo, 1e-4), 0, 1);

const MIN_STEPS = 6;
const MAX_STEPS = 40;          // deve restare uguale al bound del loop nel frag
const MAX_LIGHT_STEPS = 8;
const MAX_SCATTER_OCTAVES = 4;

const DEFAULTS = {
  enabled: false,
  coverage: .48,        // 0 cielo pulito → 1 coperto
  density: 1,           // spessore ottico
  scale: 1.2,           // scala del rumore (piu' alto = nuvole piu' piccole)
  detail: .5,           // erosione dei bordi (rumore fine)
  speed: 1,             // velocita' del vento
  windAngle: 25,        // direzione del vento (gradi)
  altitude: 120,        // quota base dello strato
  thickness: 70,        // spessore dello strato
  quality: 20,          // passi di raymarch (6..40)
  absorption: 1.1,      // Beer's law: quanto la nuvola si auto-ombreggia
  opacity: .95,
  anvil: .3,            // profilo verticale: cumulo → incudine
  detailScale: 2.8,     // frequenza dell'erosione rispetto alla shape
  detailSpeed: 1.8,     // parallasse: l'erosione scorre piu' della shape
  anisotropy: .62,      // lobo HG in avanti (silver lining)
  backScatter: .26,     // secondo lobo HG all'indietro
  silverLining: .9,     // rinforzo del bordo controluce
  powder: .55,          // dark-edge / powder di Horizon
  multiScatter: 3,      // ottave di Beer per il multiple scattering
  lightSteps: 5,        // tap verso il sole per l'auto-ombra
  ambient: .85,         // peso della luce di cielo
  skyTint: .7,          // quanto il colore del cielo tinge l'ambiente
  resolutionScale: .8,  // scala del lavoro per pixel (non del framebuffer)
};

// Authoring shortcuts, deliberately expressed through the same public
// settings as the inspector. They are starting points, never opaque modes:
// after applying one, every value remains independently editable and saved.
const PRESETS = Object.freeze({
  clear:Object.freeze({enabled:false, coverage:.12, density:.55, scale:1.1, detail:.45, speed:.55, anvil:.08, thickness:42, absorption:.8, ambient:1.05}),
  cumulus:Object.freeze({enabled:true, coverage:.43, density:1.05, scale:1.15, detail:.62, speed:.85, anvil:.26, thickness:76, absorption:1.08, ambient:.9, silverLining:1.05}),
  overcast:Object.freeze({enabled:true, coverage:.78, density:1.28, scale:1.55, detail:.38, speed:1.2, anvil:.48, thickness:105, absorption:1.38, ambient:.72, silverLining:.5}),
  storm:Object.freeze({enabled:true, coverage:.9, density:1.72, scale:1.9, detail:.72, speed:2.25, anvil:.82, altitude:85, thickness:155, absorption:1.85, ambient:.48, silverLining:1.35, powder:.72}),
});

// Ogni chiave numerica non angolare vive qui: e' la sola fonte di verita' per
// clamp, UI e round-trip di salvataggio.
const RANGES = {
  coverage: [0, 1], density: [0, 3], scale: [.2, 6], detail: [0, 1], speed: [0, 6],
  altitude: [40, 400], thickness: [10, 260], quality: [MIN_STEPS, MAX_STEPS],
  absorption: [.2, 3], opacity: [0, 1], anvil: [0, 1], detailScale: [.5, 8],
  detailSpeed: [0, 4], anisotropy: [0, .95], backScatter: [0, .9], silverLining: [0, 3],
  powder: [0, 1], multiScatter: [1, MAX_SCATTER_OCTAVES], lightSteps: [1, MAX_LIGHT_STEPS],
  ambient: [0, 2], skyTint: [0, 1], resolutionScale: [.35, 1],
};
const INTEGER_KEYS = {quality: true, multiScatter: true, lightSteps: true};

function normalize(patch, base){
  const merged = Object.assign({}, DEFAULTS, base || null, patch || null);
  const out = {enabled: merged.enabled === true};
  for(const key in RANGES){
    const range = RANGES[key];
    let value = finiteOr(merged[key], DEFAULTS[key]);
    if(INTEGER_KEYS[key]) value = Math.round(value);
    out[key] = clamp(value, range[0], range[1]);
  }
  out.windAngle = ((finiteOr(merged.windAngle, DEFAULTS.windAngle) % 360) + 360) % 360;
  return out;
}

function preset(id, base){
  const values = PRESETS[String(id || '').toLowerCase()] || PRESETS.cumulus;
  return normalize(values, base);
}

// Il costo GPU e' passi x pixel: resolutionScale e' l'unica leva reale su una
// mesh dome (nessun framebuffer separato), quindi scala passi, tap di luce,
// erosione e portata del march invece della risoluzione.
function stepBudget(config){
  const p = normalize(config);
  const load = .4 + p.resolutionScale * .6;
  return {
    steps: clamp(Math.round(p.quality * load), MIN_STEPS, MAX_STEPS),
    lightSteps: clamp(Math.round(p.lightSteps * (.5 + p.resolutionScale * .5)), 1, MAX_LIGHT_STEPS),
    scatterOctaves: clamp(Math.round(p.multiScatter), 1, MAX_SCATTER_OCTAVES),
    detail: p.detail * (p.resolutionScale < .5 ? .5 : 1),
    range: 3.5 + p.resolutionScale * 5.5,
    maxSteps: MAX_STEPS,
  };
}

function capabilities(renderer, three){
  const T = three || (typeof THREE !== 'undefined' ? THREE : null);
  if(!T || typeof T.Data3DTexture !== 'function') return {volumeTextures: false, reason: 'Data3DTexture unavailable'};
  if(renderer && renderer.isWebGPURenderer === true) return {volumeTextures: false, reason: 'WebGPU backend'};
  const caps = renderer && renderer.capabilities;
  if(caps && caps.isWebGL2 === false) return {volumeTextures: false, reason: 'WebGL 1 context'};
  return {volumeTextures: true, reason: 'ok'};
}

/* ---------- 2. rumore: generato una volta, mai per frame ---------- */

const NOISE = {shapeSize: 32, detailSize: 24, shape: null, detail: null};

function hash01(x, y, z, seed){
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function fade(t){ return t * t * t * (t * (t * 6 - 15) + 10); }
function wrap(v, period){ return ((v % period) + period) % period; }

// Perlin classico ma con reticolo ripiegato sul periodo: senza questo la 3D
// texture non e' tileable e il cielo mostra le cuciture del volume.
function gradDot(hx, hy, hz, seed, dx, dy, dz){
  const h = Math.floor(hash01(hx, hy, hz, seed) * 16) & 15;
  const u = h < 8 ? dx : dy;
  const v = h < 4 ? dy : (h === 12 || h === 14 ? dx : dz);
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
function perlin(x, y, z, period, seed){
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const fx = x - X, fy = y - Y, fz = z - Z;
  const u = fade(fx), v = fade(fy), w = fade(fz);
  const x0 = wrap(X, period), x1 = wrap(X + 1, period);
  const y0 = wrap(Y, period), y1 = wrap(Y + 1, period);
  const z0 = wrap(Z, period), z1 = wrap(Z + 1, period);
  const n000 = gradDot(x0, y0, z0, seed, fx, fy, fz);
  const n100 = gradDot(x1, y0, z0, seed, fx - 1, fy, fz);
  const n010 = gradDot(x0, y1, z0, seed, fx, fy - 1, fz);
  const n110 = gradDot(x1, y1, z0, seed, fx - 1, fy - 1, fz);
  const n001 = gradDot(x0, y0, z1, seed, fx, fy, fz - 1);
  const n101 = gradDot(x1, y0, z1, seed, fx - 1, fy, fz - 1);
  const n011 = gradDot(x0, y1, z1, seed, fx, fy - 1, fz - 1);
  const n111 = gradDot(x1, y1, z1, seed, fx - 1, fy - 1, fz - 1);
  return mix(
    mix(mix(n000, n100, u), mix(n010, n110, u), v),
    mix(mix(n001, n101, u), mix(n011, n111, u), v), w);
}
function perlinFbm(x, y, z, freq, octaves, seed){
  let value = 0, amplitude = .5, total = 0, f = freq;
  for(let i = 0; i < octaves; i++){
    value += amplitude * perlin(x * f, y * f, z * f, f, seed + i * 17);
    total += amplitude; amplitude *= .5; f *= 2;
  }
  return clamp(value / Math.max(total, 1e-5) * .5 + .5, 0, 1);
}
function worley(x, y, z, freq, seed){
  const fx = x * freq, fy = y * freq, fz = z * freq;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  let best = 8;
  for(let dz = -1; dz <= 1; dz++) for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){
    const cx = ix + dx, cy = iy + dy, cz = iz + dz;
    const wx = wrap(cx, freq), wy = wrap(cy, freq), wz = wrap(cz, freq);
    const ex = cx + hash01(wx, wy, wz, seed) - fx;
    const ey = cy + hash01(wx, wy, wz, seed + 101) - fy;
    const ez = cz + hash01(wx, wy, wz, seed + 211) - fz;
    const d = ex * ex + ey * ey + ez * ez;
    if(d < best) best = d;
  }
  return 1 - Math.min(1, Math.sqrt(best));
}

// R = Perlin-Worley (shape), GBA = tre ottave Worley usate come erosione
// progressiva nello shader: e' il layout Nubis, un solo fetch per campione.
function buildShapeVolume(size){
  const n = Math.max(8, Math.round(finiteOr(size, NOISE.shapeSize)));
  const count = n * n * n;
  const data = new Uint8Array(count * 4);
  const shape = new Float32Array(count);
  const inv = 1 / n;
  let lo = Infinity, hi = -Infinity, i = 0;
  for(let z = 0; z < n; z++) for(let y = 0; y < n; y++) for(let x = 0; x < n; x++){
    const px = x * inv, py = y * inv, pz = z * inv;
    const w1 = worley(px, py, pz, 3, 7), w2 = worley(px, py, pz, 6, 13), w3 = worley(px, py, pz, 12, 29);
    const wfbm = w1 * .625 + w2 * .25 + w3 * .125;
    const pw = remap01(perlinFbm(px, py, pz, 3, 4, 101), wfbm - 1, 1);
    shape[i] = pw;
    if(pw < lo) lo = pw;
    if(pw > hi) hi = pw;
    data[i * 4 + 1] = w1 * 255 | 0;
    data[i * 4 + 2] = w2 * 255 | 0;
    data[i * 4 + 3] = w3 * 255 | 0;
    i++;
  }
  // Il Perlin-Worley grezzo occupa solo la fascia centrale: senza questo
  // riallineamento la soglia di copertura non apre mai squarci di cielo e
  // ogni impostazione produce lo stesso grigio uniforme.
  const span = Math.max(hi - lo, 1e-4);
  for(let k = 0; k < count; k++) data[k * 4] = Math.pow((shape[k] - lo) / span, 1.35) * 255 | 0;
  return {data, size: n};
}
function buildDetailVolume(size){
  const n = Math.max(8, Math.round(finiteOr(size, NOISE.detailSize)));
  const data = new Uint8Array(n * n * n * 4);
  const inv = 1 / n;
  let i = 0;
  for(let z = 0; z < n; z++) for(let y = 0; y < n; y++) for(let x = 0; x < n; x++){
    const px = x * inv, py = y * inv, pz = z * inv;
    data[i++] = worley(px, py, pz, 2, 331) * 255 | 0;
    data[i++] = worley(px, py, pz, 4, 337) * 255 | 0;
    data[i++] = worley(px, py, pz, 8, 347) * 255 | 0;
    data[i++] = 255;
  }
  return {data, size: n};
}

// Lettura trilineare del volume dal lato CPU: la trasmittanza del sole per il
// lens flare legge esattamente lo stesso campo della GPU, senza rifare fbm.
function sampleVolume(volume, x, y, z, out){
  const n = volume.size, data = volume.data;
  const fx = x * n - .5, fy = y * n - .5, fz = z * n - .5;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const x0 = wrap(ix, n), x1 = wrap(ix + 1, n);
  const y0 = wrap(iy, n) * n, y1 = wrap(iy + 1, n) * n;
  const z0 = wrap(iz, n) * n * n, z1 = wrap(iz + 1, n) * n * n;
  const i000 = (z0 + y0 + x0) * 4, i100 = (z0 + y0 + x1) * 4;
  const i010 = (z0 + y1 + x0) * 4, i110 = (z0 + y1 + x1) * 4;
  const i001 = (z1 + y0 + x0) * 4, i101 = (z1 + y0 + x1) * 4;
  const i011 = (z1 + y1 + x0) * 4, i111 = (z1 + y1 + x1) * 4;
  for(let c = 0; c < 4; c++){
    const a = mix(mix(data[i000 + c], data[i100 + c], tx), mix(data[i010 + c], data[i110 + c], tx), ty);
    const b = mix(mix(data[i001 + c], data[i101 + c], tx), mix(data[i011 + c], data[i111 + c], tx), ty);
    out[c] = mix(a, b, tz) / 255;
  }
  return out;
}

/* ---------- 3. shader ---------- */

const VERT = `
varying vec3 vWorld;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = `
varying vec3 vWorld;
uniform float uTime, uCoverage, uDensity, uScale, uDetail, uAltitude, uThickness;
uniform float uSteps, uAbsorption, uOpacity, uAnvil, uDetailScale, uDetailSpeed;
uniform float uAnisotropy, uBackScatter, uSilver, uPowder, uScatterOctaves, uLightSteps;
uniform float uRange, uAmbientPower;
uniform vec2 uWind;
uniform vec3 uSunDir, uSunColor, uAmbientLow, uAmbientHigh;
#ifdef LK_VOLUME_NOISE
uniform sampler3D tShape;
uniform sampler3D tDetail;
#endif

float remap01(float v, float lo, float hi){ return clamp((v - lo) / max(hi - lo, 1e-4), 0.0, 1.0); }

#ifdef LK_VOLUME_NOISE
vec4 shapeNoise(vec3 q){ return texture(tShape, q); }
vec3 detailNoise(vec3 q){ return texture(tDetail, q).rgb; }
#else
// Fallback senza texture 3D: stesso impianto, rumore hash procedurale.
float hash(vec3 p){
  p = fract(p * .3183099 + .1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x){
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){
  float v = 0.0, a = .52;
  for(int i = 0; i < 4; i++){
    v += a * noise3(p);
    p = p * 2.13 + vec3(11.3, 5.1, 7.7);
    a *= .5;
  }
  return v;
}
float fbm2(vec3 p){ return .62 * noise3(p) + .38 * noise3(p * 2.13); }
vec4 shapeNoise(vec3 q){
  q *= 8.0;
  return vec4(fbm(q), fbm2(q * 1.7), fbm2(q * 3.4), fbm2(q * 6.8));
}
vec3 detailNoise(vec3 q){
  q *= 8.0;
  return vec3(fbm2(q), fbm2(q * 2.1), fbm2(q * 4.3));
}
#endif

float heightFraction(vec3 p){ return clamp((p.y - uAltitude) / max(uThickness, 1.0), 0.0, 1.0); }
float heightGradient(float h){
  float cumulus = smoothstep(0.0, .14, h) * (1.0 - smoothstep(.58, 1.0, h));
  float anvil = smoothstep(0.0, .06, h) * (1.0 - smoothstep(.88, 1.0, h)) * (.55 + .45 * smoothstep(.5, 1.0, h));
  return mix(cumulus, anvil, uAnvil);
}
vec3 shapeCoord(vec3 p, float h){
  vec3 wind = vec3(uWind.x, 0.0, uWind.y);
  // lo strato e' inclinato con la quota: le torri pendono sottovento invece
  // di restare colonne verticali.
  return p * (uScale * .0034) + wind * uTime * .0075 + wind * h * .045;
}
vec3 detailCoord(vec3 p){
  vec3 wind = vec3(uWind.x, 0.0, uWind.y);
  return p * (uScale * .0034 * uDetailScale) + wind * uTime * .0075 * uDetailSpeed + vec3(0.0, uTime * .02 * uDetailSpeed, 0.0);
}
float baseDensity(vec3 p, float h){
  vec4 n = shapeNoise(shapeCoord(p, h));
  float w = n.g * .625 + n.b * .25 + n.a * .125;
  float shape = remap01(n.r, w - 1.0, 1.0);
  return remap01(shape * heightGradient(h), 1.0 - uCoverage, 1.0) * uCoverage;
}
float erodeDensity(vec3 p, float h, float base, float amount){
  if(amount <= .002) return base;
  vec3 d = detailNoise(detailCoord(p));
  float f = d.r * .625 + d.g * .25 + d.b * .125;
  // filamenti alla base, cavolfiore in cima: e' il segno visivo dei cumuli
  f = mix(f, 1.0 - f, clamp(h * 4.0, 0.0, 1.0));
  return remap01(base, f * amount * .55, 1.0);
}

// Stessa costante di estinzione del march primario (.06 per unita' di mondo):
// se le due direzioni non condividono la scala, le nuvole diventano nere.
float sunOpticalDepth(vec3 p, float stepLength){
  float acc = 0.0, t = stepLength * .55, dt = stepLength;
  for(int i = 0; i < 8; i++){
    if(float(i) >= uLightSteps) break;
    vec3 sp = p + uSunDir * t;
    float h = heightFraction(sp);
    if(h > 0.0 && h < 1.0) acc += baseDensity(sp, h) * uDensity * dt * .06;
    t += dt;
    dt *= 1.45;
  }
  return acc;
}
float hg(float c, float g){
  float g2 = g * g;
  return (1.0 - g2) / pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5);
}
float dualPhase(float c, float e){
  return mix(hg(c, uAnisotropy * e), hg(c, -uBackScatter * e), .28);
}
vec3 cloudRadiance(float d, float shadow, float mu, float h){
  // multiple scattering economico: ottave di Beer con estinzione, peso e
  // eccentricita' decrescenti (approssimazione Frostbite / Horizon).
  float a = 1.0, b = 1.0, e = 1.0, energy = 0.0;
  for(int o = 0; o < 4; o++){
    if(float(o) >= uScatterOctaves) break;
    energy += b * exp(-shadow * uAbsorption * a) * dualPhase(mu, e);
    a *= .45; b *= .52; e *= .62;
  }
  float powder = 1.0 - exp(-d * 7.0);
  energy *= mix(1.0, powder, uPowder * clamp(.5 - mu * .5, 0.0, 1.0));
  energy += uSilver * pow(clamp(mu, 0.0, 1.0), 9.0) * exp(-shadow * uAbsorption * .28);
  vec3 ambient = mix(uAmbientLow, uAmbientHigh, h) * uAmbientPower * (.45 + .55 * h);
  return uSunColor * energy + ambient;
}

// Interleaved gradient noise: dither statico in screen space. Senza buffer
// temporale un jitter che cambia per frame farebbe sfarfallare i bordi.
float interleaved(vec2 c){ return fract(52.9829189 * fract(dot(c, vec2(.06711056, .00583715)))); }

void main(){
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  float horizon = smoothstep(.015, .10, rd.y);
  if(horizon <= 0.0 || uOpacity <= 0.0 || uCoverage <= 0.0){ gl_FragColor = vec4(0.0); return; }

  float t0 = (uAltitude - ro.y) / rd.y;
  float t1 = (uAltitude + uThickness - ro.y) / rd.y;
  if(t1 <= 0.0){ gl_FragColor = vec4(0.0); return; }
  t0 = max(t0, 0.0);
  // limita i percorsi radenti (nuvole lontane costano e non si vedono)
  t1 = min(t1, t0 + uThickness * uRange / max(rd.y, .10));
  if(t1 <= t0){ gl_FragColor = vec4(0.0); return; }

  float steps = clamp(uSteps, 6.0, 40.0);
  float dt = (t1 - t0) / steps;
  float dtSkip = dt * 1.85;
  float lightStep = max(uThickness, 1.0) * .08;
  float t = t0 + dt * interleaved(gl_FragCoord.xy);
  float trans = 1.0;
  vec3 acc = vec3(0.0);
  float mu = dot(rd, uSunDir);

  for(int i = 0; i < 40; i++){
    if(float(i) >= steps || trans < .02 || t > t1) break;
    vec3 p = ro + rd * t;
    float h = heightFraction(p);
    float base = (h <= 0.0 || h >= 1.0) ? 0.0 : baseDensity(p, h);
    // spazio vuoto: passo lungo e nessun tap di luce, e' il risparmio grosso
    if(base <= .001){ t += dtSkip; continue; }
    float detailFade = 1.0 - smoothstep(uThickness * 3.5, uThickness * 8.5, t - t0);
    float d = erodeDensity(p, h, base, uDetail * detailFade) * uDensity;
    if(d > .002){
      float shadow = sunOpticalDepth(p, lightStep);
      vec3 lum = cloudRadiance(d, shadow, mu, h);
      float sampleTrans = exp(-d * uAbsorption * dt * .06);
      acc += trans * lum * (1.0 - sampleTrans);
      trans *= sampleTrans;
    }
    t += dt;
  }
  float fade = uOpacity * horizon;
  gl_FragColor = vec4(acc * fade, (1.0 - trans) * fade);
}`;

/* ---------- 4. istanza runtime ---------- */

function create(deps){
  deps = deps || {};
  const scene = deps.scene;
  const renderer = deps.renderer || null;
  const commonRenderer = !!(renderer && renderer.isWebGPURenderer);
  const caps = capabilities(renderer);
  const P = normalize(null);
  const budget = stepBudget(P);

  const uniforms = {
    uTime:            {value: 0},
    uCoverage:        {value: P.coverage},
    uDensity:         {value: P.density},
    uScale:           {value: P.scale},
    uDetail:          {value: P.detail},
    uAltitude:        {value: P.altitude},
    uThickness:       {value: P.thickness},
    uSteps:           {value: budget.steps},
    uAbsorption:      {value: P.absorption},
    uOpacity:         {value: P.opacity},
    uAnvil:           {value: P.anvil},
    uDetailScale:     {value: P.detailScale},
    uDetailSpeed:     {value: P.detailSpeed},
    uAnisotropy:      {value: P.anisotropy},
    uBackScatter:     {value: P.backScatter},
    uSilver:          {value: P.silverLining},
    uPowder:          {value: P.powder},
    uScatterOctaves:  {value: budget.scatterOctaves},
    uLightSteps:      {value: budget.lightSteps},
    uRange:           {value: budget.range},
    uAmbientPower:    {value: P.ambient},
    uWind:            {value: new THREE.Vector2(1, .4)},
    uSunDir:          {value: new THREE.Vector3(0, 1, 0)},
    uSunColor:        {value: new THREE.Color(0xfff2dd)},
    uAmbientLow:      {value: new THREE.Color(0x6f8399)},
    uAmbientHigh:     {value: new THREE.Color(0x8fb6dd)},
    tShape:           {value: null},
    tDetail:          {value: null},
  };

  function buildMaterial(){
    if(commonRenderer){
      // The authored volumetric GLSL remains available to WebGLRenderer. The
      // common WebGPU renderer must never even compile it (compileAsync also
      // visits hidden scene resources), so keep a neutral node-compatible
      // placeholder while the effect is explicitly degraded.
      return new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,side:THREE.BackSide,fog:false});
    }
    const defines = caps.volumeTextures ? {LK_VOLUME_NOISE: ''} : {};
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      defines,
      transparent: true,
      // acc e' gia' integrata sul percorso: senza premoltiplicazione il colore
      // verrebbe moltiplicato per alpha due volte e i bordi controluce
      // perderebbero il silver lining.
      premultipliedAlpha: true,
      depthWrite: false,
      side: THREE.BackSide,
      fog: false,
    });
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 20), buildMaterial());
  dome.renderOrder = -0.5;           // dopo stelle(-2) e luna(-1), prima di fumo/particelle (0)
  dome.frustumCulled = false;
  dome.visible = P.enabled && !commonRenderer;

  function makeVolumeTexture(volume){
    const tex = new THREE.Data3DTexture(volume.data, volume.size, volume.size, volume.size);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
    tex.generateMipmaps = false;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return tex;
  }
  let volumesReady = false;
  // Generazione pigra: ~4M campioni di rumore, si paga una volta e solo quando
  // le nuvole vengono davvero accese.
  function ensureVolumes(){
    if(volumesReady || !caps.volumeTextures) return volumesReady;
    try {
      if(!NOISE.shape) NOISE.shape = buildShapeVolume(NOISE.shapeSize);
      if(!NOISE.detail) NOISE.detail = buildDetailVolume(NOISE.detailSize);
      uniforms.tShape.value = makeVolumeTexture(NOISE.shape);
      uniforms.tDetail.value = makeVolumeTexture(NOISE.detail);
      volumesReady = true;
    } catch(err){
      caps.volumeTextures = false;
      caps.reason = 'volume upload failed';
      uniforms.tShape.value = null;
      uniforms.tDetail.value = null;
      const previous = dome.material;
      dome.material = buildMaterial();
      if(previous && previous.dispose) previous.dispose();
    }
    return volumesReady;
  }

  const flareOrigin = new THREE.Vector3();
  const flareDirection = new THREE.Vector3();
  const skyMix = new THREE.Color();
  const NEUTRAL_AMBIENT = new THREE.Color(0x9aa7b4);
  const NIGHT_AMBIENT = new THREE.Color(0x0d1626);
  const sample4 = [0, 0, 0, 0];
  const fract = value => value - Math.floor(value);
  const smoothstep = (a, b, value) => {
    const delta = b - a;
    const t = clamp((value - a) / (Math.abs(delta) < 1e-6 ? (delta < 0 ? -1e-6 : 1e-6) : delta), 0, 1);
    return t * t * (3 - 2 * t);
  };
  function hash3(x, y, z){
    x = fract(x * .3183099 + .1) * 17;
    y = fract(y * .3183099 + .1) * 17;
    z = fract(z * .3183099 + .1) * 17;
    return fract(x * y * z * (x + y + z));
  }
  function noise3(x, y, z){
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = fract(x), fy = fract(y), fz = fract(z);
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const x00 = mix(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx);
    const x10 = mix(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx);
    const x01 = mix(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx);
    const x11 = mix(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx);
    return mix(mix(x00, x10, fy), mix(x01, x11, fy), fz);
  }
  function fbm3(x, y, z){
    let value = 0, amplitude = .52;
    for(let i = 0; i < 4; i++){
      value += amplitude * noise3(x, y, z);
      x = x * 2.13 + 11.3; y = y * 2.13 + 5.1; z = z * 2.13 + 7.7; amplitude *= .5;
    }
    return value;
  }
  function fbmCheap(x, y, z){ return .62 * noise3(x, y, z) + .38 * noise3(x * 2.13, y * 2.13, z * 2.13); }
  function heightGradientAt(h){
    const cumulus = smoothstep(0, .14, h) * (1 - smoothstep(.58, 1, h));
    const anvil = smoothstep(0, .06, h) * (1 - smoothstep(.88, 1, h)) * (.55 + .45 * smoothstep(.5, 1, h));
    return mix(cumulus, anvil, P.anvil);
  }
  function flareDensity(x, y, z, time){
    const h = clamp((y - P.altitude) / Math.max(1, P.thickness), 0, 1);
    if(h <= 0 || h >= 1) return 0;
    const gradient = heightGradientAt(h);
    if(gradient <= 0) return 0;
    const s = P.scale * .0034;
    const windX = Math.cos(P.windAngle * Math.PI / 180) * P.speed;
    const windZ = Math.sin(P.windAngle * Math.PI / 180) * P.speed;
    const qx = x * s + windX * time * .0075 + windX * h * .045;
    const qy = y * s;
    const qz = z * s + windZ * time * .0075 + windZ * h * .045;
    let r, w;
    if(volumesReady && NOISE.shape){
      sampleVolume(NOISE.shape, qx, qy, qz, sample4);
      r = sample4[0];
      w = sample4[1] * .625 + sample4[2] * .25 + sample4[3] * .125;
    } else {
      r = fbm3(qx * 8, qy * 8, qz * 8);
      w = fbmCheap(qx * 13.6, qy * 13.6, qz * 13.6) * .625 + fbmCheap(qx * 27.2, qy * 27.2, qz * 27.2) * .375;
    }
    const shape = remap01(r, w - 1, 1);
    return remap01(shape * gradient, 1 - P.coverage, 1) * P.coverage * P.density;
  }
  function sunTransmission(camera, direction){
    if(!camera || !P.enabled || P.opacity <= 0 || P.coverage <= .01) return 1;
    camera.getWorldPosition(flareOrigin);
    flareDirection.copy(direction).normalize();
    const horizon = smoothstep(.015, .10, flareDirection.y);
    if(horizon <= 0) return 1;
    let t0 = (P.altitude - flareOrigin.y) / flareDirection.y;
    let t1 = (P.altitude + P.thickness - flareOrigin.y) / flareDirection.y;
    if(t1 <= 0) return 1;
    t0 = Math.max(t0, 0);
    t1 = Math.min(t1, t0 + P.thickness * uniforms.uRange.value / Math.max(flareDirection.y, .1));
    if(t1 <= t0) return 1;
    const steps = clamp(Math.round(uniforms.uSteps.value) || MIN_STEPS, MIN_STEPS, 28);
    const stepLength = (t1 - t0) / steps;
    const time = uniforms.uTime.value;
    let transmission = 1;
    for(let i = 0; i < steps && transmission > .03; i++){
      const distance = t0 + (i + .5) * stepLength;
      const density = flareDensity(
        flareOrigin.x + flareDirection.x * distance,
        flareOrigin.y + flareDirection.y * distance,
        flareOrigin.z + flareDirection.z * distance,
        time
      );
      if(density > .003) transmission *= Math.exp(-density * P.absorption * stepLength * .06);
    }
    const alpha = (1 - transmission) * P.opacity * horizon;
    return clamp(1 - alpha, .02, 1);
  }
  dome.userData.lkFlareTransmission = (hit, camera, direction) => sunTransmission(camera, direction);
  if(scene && scene.add) scene.add(dome);

  function applyParams(){
    const b = stepBudget(P);
    uniforms.uCoverage.value = P.coverage;
    uniforms.uDensity.value = P.density;
    uniforms.uScale.value = P.scale;
    uniforms.uDetail.value = b.detail;
    uniforms.uAltitude.value = P.altitude;
    uniforms.uThickness.value = P.thickness;
    uniforms.uSteps.value = b.steps;
    uniforms.uAbsorption.value = P.absorption;
    uniforms.uOpacity.value = P.opacity;
    uniforms.uAnvil.value = P.anvil;
    uniforms.uDetailScale.value = P.detailScale;
    uniforms.uDetailSpeed.value = P.detailSpeed;
    uniforms.uAnisotropy.value = P.anisotropy;
    uniforms.uBackScatter.value = P.backScatter;
    uniforms.uSilver.value = P.silverLining;
    uniforms.uPowder.value = P.powder;
    uniforms.uScatterOctaves.value = b.scatterOctaves;
    uniforms.uLightSteps.value = b.lightSteps;
    uniforms.uRange.value = b.range;
    uniforms.uAmbientPower.value = P.ambient;
    const a = P.windAngle * Math.PI / 180;
    uniforms.uWind.value.set(Math.cos(a), Math.sin(a)).multiplyScalar(P.speed);
    if(P.enabled && !commonRenderer) ensureVolumes();
    dome.visible = !commonRenderer && !!P.enabled && P.opacity > 0 && P.coverage > .01;
  }
  applyParams();

  return {
    // chiamato da sky.update: aggancia sole/ambiente al ciclo giorno-notte
    sync(info){
      const dayF = finiteOr(info.dayF, 0), duskF = finiteOr(info.duskF, 0), nightF = finiteOr(info.nightF, 0);
      uniforms.uSunDir.value.copy(info.sunDir);
      uniforms.uSunColor.value.copy(info.sunColor).multiplyScalar(.55 + dayF * .75);
      skyMix.copy(info.ambient).lerp(NEUTRAL_AMBIENT, 1 - P.skyTint);
      uniforms.uAmbientHigh.value.copy(skyMix).multiplyScalar(.55 + dayF * .65).lerp(NIGHT_AMBIENT, nightF * .8);
      // la base resta piu' scura e al tramonto raccoglie il rosso del sole
      uniforms.uAmbientLow.value.copy(skyMix).lerp(info.sunColor, duskF * .45)
        .multiplyScalar(.26 + dayF * .44).lerp(NIGHT_AMBIENT, nightF * .85);
    },
    tick(dt){ uniforms.uTime.value += dt; },
    get: () => Object.assign({}, P),
    set(patch){
      Object.assign(P, normalize(patch, P));
      applyParams();
    },
    isEnabled: () => !!P.enabled && dome.visible,
    sunTransmission,
    defaults: () => Object.assign({}, DEFAULTS),
    ranges: () => JSON.parse(JSON.stringify(RANGES)),
    budget: () => stepBudget(P),
    capabilities: () => Object.assign({}, caps, {volumesReady}),
    mesh: dome,
  };
}

/* ---------- 5. export ---------- */

window.LK_RUNTIME_VOL_CLOUDS = Object.freeze({
  create, DEFAULTS, PRESETS, RANGES,
  MIN_STEPS, MAX_STEPS, MAX_LIGHT_STEPS, MAX_SCATTER_OCTAVES,
  normalize, preset, stepBudget, capabilities,
  buildShapeVolume, buildDetailVolume, sampleVolume,
});
})();
