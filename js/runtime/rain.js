/* =========================================================
   LOT KING - rain runtime module (environment weather)
   Pioggia GPU: ribbon instanziati con caduta calcolata interamente
   nel vertex shader (wrap 3D attorno al target), quindi minimo
   costo CPU per goccia. Parametri live per l'editor:
   intensita', velocita', vento, lunghezza, area, opacita'.
   ========================================================= */
(function(){
'use strict';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MAX_DROPS = 4000;

const DEFAULTS = {
  enabled: false,
  intensity: .5,      // 0..1 → numero di gocce attive
  speed: 55,          // m/s di caduta
  length: .55,        // lunghezza della scia (m)
  width: .035,        // spessore visibile della goccia (m)
  wind: .25,          // inclinazione laterale 0..1.5
  windAngle: 25,      // direzione del vento (gradi)
  area: 70,           // raggio della zona di pioggia attorno al target (m)
  height: 42,         // altezza da cui cadono (m)
  opacity: .32,
  sound: .6,          // volume del suono procedurale (0 = muto)
};

const VERT = `
attribute vec3 aSeed;
uniform float uFall, uArea, uHeight, uLen, uWidth;
uniform vec2 uWind;
uniform vec3 uCenter;
varying float vFade;
varying float vSide;
float wrap(float s, float c){
  return c + (s * 2.0 - 1.0) * uArea;
}
void main(){
  float y = mod(aSeed.y * uHeight * 7.0 - uFall * (.84 + aSeed.z * .32), uHeight);
  vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
  vec3 p = vec3(
    wrap(aSeed.x, uCenter.x) + dir.x * y,
    uCenter.y + y,
    wrap(aSeed.z, uCenter.z) + dir.z * y
  );
  float tip = position.y;
  float cameraDistance = length(cameraPosition - p);
  vec3 side = cross(dir, normalize(cameraPosition - p));
  if(length(side) < .001) side = vec3(1.0, 0.0, 0.0);
  else side = normalize(side);
  float distanceWidth = clamp(cameraDistance / 16.0, 1.0, 3.0);
  p -= dir * (uLen * (.72 + aSeed.x * .56) * tip);
  p += side * (uWidth * .5 * distanceWidth * position.x);
  float radial = length(p.xz - uCenter.xz) / max(uArea, 1.0);
  vFade = mix(1.0, .3, tip);                       // coda piu' tenue della testa
  vFade *= smoothstep(0.0, 2.5, y);                // sfuma vicino a terra
  vFade *= 1.0 - smoothstep(.72, 1.12, radial);    // bordo del volume invisibile
  vFade *= smoothstep(.15, 1.2, cameraDistance);   // niente tagli sulla camera
  vSide = position.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
varying float vSide;
void main(){
  float edge = 1.0 - smoothstep(.45, 1.0, abs(vSide));
  float alpha = uOpacity * vFade * edge;
  if(alpha < .004) discard;
  gl_FragColor = vec4(uColor, alpha);
}`;

function create(deps){
  const scene = deps.scene;
  const audio = deps.audio || null;          // SFX runtime: getContext / getSfxGain
  const P = Object.assign({}, DEFAULTS);
  let fall = 0;

  const geo = new THREE.InstancedBufferGeometry();
  // Due triangoli per goccia. position.x e' il lato del ribbon e position.y
  // distingue testa/coda; la posizione nel mondo viene costruita nello shader.
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -1,0,0,  1,0,0,  1,1,0,
    -1,0,0,  1,1,0, -1,1,0,
  ]), 3));
  const seed = new Float32Array(MAX_DROPS * 3);
  for(let i = 0; i < MAX_DROPS; i++){
    const sx = Math.random(), sy = Math.random(), sz = Math.random();
    seed[i * 3] = sx; seed[i * 3 + 1] = sy; seed[i * 3 + 2] = sz;
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 3));

  const uniforms = {
    uFall:    {value: 0},
    uArea:    {value: P.area},
    uHeight:  {value: P.height},
    uLen:     {value: P.length},
    uWidth:   {value: P.width},
    uWind:    {value: new THREE.Vector2(0, 0)},
    uCenter:  {value: new THREE.Vector3()},
    uColor:   {value: new THREE.Color(0xbdd2e8)},
    uOpacity: {value: P.opacity},
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    fog: false,
    side: THREE.DoubleSide,
  });
  const rainMesh = new THREE.Mesh(geo, mat);
  rainMesh.name = 'LK_GPU_Rain';
  rainMesh.userData.lkSkipSsrOverride = true;
  rainMesh.frustumCulled = false;
  rainMesh.renderOrder = 54;
  rainMesh.visible = P.enabled;
  rainMesh.onBeforeRender = (rnd, scn, camera) => {
    if(!camera || !camera.getWorldPosition) return;
    camera.getWorldPosition(_cameraPosition);
    uniforms.uCenter.value.x = _cameraPosition.x;
    uniforms.uCenter.value.z = _cameraPosition.z;
  };
  scene.add(rainMesh);
  const _cameraPosition = new THREE.Vector3();

  function normalizeParams(){
    P.enabled = P.enabled === true;
    P.intensity = clamp(Number(P.intensity) || 0, 0, 1);
    P.speed = clamp(Number(P.speed) || DEFAULTS.speed, 5, 200);
    P.length = clamp(Number(P.length) || DEFAULTS.length, .05, 3);
    P.width = clamp(Number(P.width) || DEFAULTS.width, .008, .12);
    P.wind = clamp(Number(P.wind) || 0, 0, 1.5);
    P.windAngle = ((Number(P.windAngle) || 0) % 360 + 360) % 360;
    P.area = clamp(Number(P.area) || DEFAULTS.area, 20, 200);
    P.height = clamp(Number(P.height) || DEFAULTS.height, 10, 120);
    P.opacity = clamp(Number(P.opacity) || 0, 0, 1);
    P.sound = clamp(Number(P.sound) || 0, 0, 1);
  }

  function applyParams(){
    normalizeParams();
    uniforms.uArea.value = clamp(P.area, 20, 200);
    uniforms.uHeight.value = clamp(P.height, 10, 120);
    uniforms.uLen.value = clamp(P.length, .05, 3);
    uniforms.uWidth.value = clamp(P.width, .008, .12);
    uniforms.uOpacity.value = clamp(P.opacity, 0, 1);
    const a = (P.windAngle || 0) * Math.PI / 180;
    uniforms.uWind.value.set(Math.cos(a), Math.sin(a)).multiplyScalar(clamp(P.wind, 0, 1.5));
    const drops = Math.round(clamp(P.intensity, 0, 1) * MAX_DROPS);
    geo.instanceCount = drops;
    rainMesh.visible = !!P.enabled && drops > 0 && P.opacity > 0;
    updateSound();
  }

  // ------------------------------------------------ suono procedurale
  // Due strati di rumore filtrato dallo stesso loop: "hiss" acuto (le gocce)
  // e corpo basso (il rovescio). Il gain segue intensita' e volume impostato;
  // esce sul bus SFX cosi' rispetta i volumi generali del gioco.
  const SND = {gain: null, hiss: null, body: null, ready: false, cur: -1};
  function ensureSound(){
    if(SND.ready) return true;
    if(!audio || !audio.getContext) return false;
    const ctx = audio.getContext();
    const out = audio.getSfxGain ? audio.getSfxGain() : null;
    if(!ctx || !out) return false;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    SND.gain = ctx.createGain();
    SND.gain.gain.value = 0;
    SND.hiss = ctx.createBiquadFilter();
    SND.hiss.type = 'bandpass';
    SND.hiss.frequency.value = 5200;
    SND.hiss.Q.value = .6;
    SND.body = ctx.createBiquadFilter();
    SND.body.type = 'lowpass';
    SND.body.frequency.value = 650;
    const hg = ctx.createGain(); hg.gain.value = 1;
    const bg = ctx.createGain(); bg.gain.value = .55;
    src.connect(SND.hiss); SND.hiss.connect(hg); hg.connect(SND.gain);
    src.connect(SND.body); SND.body.connect(bg); bg.connect(SND.gain);
    SND.gain.connect(out);
    src.start();
    SND.ready = true;
    return true;
  }
  function updateSound(){
    const on = !!P.enabled && rainMesh.visible;
    const target = (on ? 1 : 0) * clamp(P.sound == null ? .6 : P.sound, 0, 1) * (.25 + .75 * clamp(P.intensity, 0, 1)) * .5;
    if(!SND.ready && (target <= 0 || !ensureSound())) return;
    if(Math.abs(target - SND.cur) < .003) return;
    SND.cur = target;
    const ctx = audio.getContext();
    SND.gain.gain.setTargetAtTime(target, ctx.currentTime, .25);
    SND.hiss.frequency.setTargetAtTime(3800 + 2600 * clamp(P.intensity, 0, 1), ctx.currentTime, .3);   // fitta = piu' brillante
  }
  applyParams();

  return {
    update(dt, target){
      updateSound();   // riprova finche' l'AudioContext non e' pronto (gesto utente)
      if(!rainMesh.visible) return;
      fall += dt * clamp(P.speed, 5, 200);
      uniforms.uFall.value = fall;
      if(target) uniforms.uCenter.value.copy(target);
    },
    get: () => Object.assign({}, P),
    set(patch){
      Object.assign(P, patch || {});
      applyParams();
    },
    isEnabled: () => rainMesh.visible,
    defaults: () => Object.assign({}, DEFAULTS),
    mesh: rainMesh,
  };
}

window.LK_RUNTIME_RAIN = Object.freeze({create, DEFAULTS});
})();
