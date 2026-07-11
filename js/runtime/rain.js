/* =========================================================
   LOT KING - rain runtime module (environment weather)
   Pioggia GPU: LineSegments con caduta calcolata interamente
   nel vertex shader (wrap 3D attorno al target), quindi zero
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
  wind: .25,          // inclinazione laterale 0..1.5
  windAngle: 25,      // direzione del vento (gradi)
  area: 70,           // raggio della zona di pioggia attorno al target (m)
  height: 42,         // altezza da cui cadono (m)
  opacity: .32,
  sound: .6,          // volume del suono procedurale (0 = muto)
};

const VERT = `
attribute vec3 aSeed;
attribute float aTip;
uniform float uFall, uArea, uHeight, uLen;
uniform vec2 uWind;
uniform vec3 uCenter;
varying float vFade;
float wrap(float s, float c){
  return c + (s * 2.0 - 1.0) * uArea;
}
void main(){
  float y = mod(aSeed.y * uHeight * 7.0 - uFall, uHeight);
  vec3 dir = normalize(vec3(uWind.x, -1.0, uWind.y));
  vec3 p = vec3(
    wrap(aSeed.x, uCenter.x) + dir.x * y,
    uCenter.y + y,
    wrap(aSeed.z, uCenter.z) + dir.z * y
  );
  p += dir * (uLen * aTip);
  vFade = 1.0 - aTip * .75;                       // coda piu' tenue della testa
  vFade *= smoothstep(0.0, 2.5, y);               // sfuma vicino a terra
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main(){
  gl_FragColor = vec4(uColor, uOpacity * vFade);
}`;

function create(deps){
  const scene = deps.scene;
  const audio = deps.audio || null;          // SFX runtime: getContext / getSfxGain
  const P = Object.assign({}, DEFAULTS);
  let fall = 0;

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_DROPS * 2 * 3);   // dummy, la posizione vera e' nello shader
  const seed = new Float32Array(MAX_DROPS * 2 * 3);
  const tip = new Float32Array(MAX_DROPS * 2);
  for(let i = 0; i < MAX_DROPS; i++){
    const sx = Math.random(), sy = Math.random(), sz = Math.random();
    for(const k of [0, 1]){
      const v = i * 2 + k;
      seed[v * 3] = sx; seed[v * 3 + 1] = sy; seed[v * 3 + 2] = sz;
      tip[v] = k;
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  geo.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));

  const uniforms = {
    uFall:    {value: 0},
    uArea:    {value: P.area},
    uHeight:  {value: P.height},
    uLen:     {value: P.length},
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
    fog: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 54;
  lines.visible = P.enabled;
  lines.onBeforeRender = (rnd, scn, camera) => {
    if(!camera || !camera.getWorldPosition) return;
    camera.getWorldPosition(_cameraPosition);
    uniforms.uCenter.value.x = _cameraPosition.x;
    uniforms.uCenter.value.z = _cameraPosition.z;
  };
  scene.add(lines);
  const _cameraPosition = new THREE.Vector3();

  function normalizeParams(){
    P.enabled = P.enabled === true;
    P.intensity = clamp(Number(P.intensity) || 0, 0, 1);
    P.speed = clamp(Number(P.speed) || DEFAULTS.speed, 5, 200);
    P.length = clamp(Number(P.length) || DEFAULTS.length, .05, 3);
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
    uniforms.uOpacity.value = clamp(P.opacity, 0, 1);
    const a = (P.windAngle || 0) * Math.PI / 180;
    uniforms.uWind.value.set(Math.cos(a), Math.sin(a)).multiplyScalar(clamp(P.wind, 0, 1.5));
    const drops = Math.round(clamp(P.intensity, 0, 1) * MAX_DROPS);
    geo.setDrawRange(0, drops * 2);
    lines.visible = !!P.enabled && drops > 0 && P.opacity > 0;
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
    const on = !!P.enabled && lines.visible;
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
      if(!lines.visible) return;
      fall += dt * clamp(P.speed, 5, 200);
      uniforms.uFall.value = fall;
      if(target) uniforms.uCenter.value.copy(target);
    },
    get: () => Object.assign({}, P),
    set(patch){
      Object.assign(P, patch || {});
      applyParams();
    },
    isEnabled: () => lines.visible,
    defaults: () => Object.assign({}, DEFAULTS),
    mesh: lines,
  };
}

window.LK_RUNTIME_RAIN = Object.freeze({create, DEFAULTS});
})();
