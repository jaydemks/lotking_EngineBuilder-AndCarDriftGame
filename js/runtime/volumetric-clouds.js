/* =========================================================
   LOT KING - volumetric clouds runtime module
   Nuvole volumetriche raymarched (fbm value-noise 3D) su un
   dome, ispirate alla tecnica Nubis/Horizon (slab di quota,
   Beer's law, phase function verso il sole). Parametri live
   regolabili dall'editor: copertura, densita', rumore, vento,
   quota, spessore, qualita' (passi), assorbimento.
   Budget performance: march solo sui pixel di cielo, passi
   limitati, early-exit su trasmittanza, fade all'orizzonte.
   ========================================================= */
(function(){
'use strict';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const DEFAULTS = {
  enabled: false,
  coverage: .48,      // 0 cielo pulito → 1 coperto
  density: 1,         // spessore ottico
  scale: 1.2,         // scala del rumore (piu' alto = nuvole piu' piccole)
  detail: .5,         // erosione dei bordi (rumore fine)
  speed: 1,           // velocita' del vento
  windAngle: 25,      // direzione del vento (gradi)
  altitude: 120,      // quota base dello strato
  thickness: 70,      // spessore dello strato
  quality: 20,        // passi di raymarch (8..36)
  absorption: 1.1,    // Beer's law: quanto la nuvola si auto-ombreggia
  opacity: .95,
};

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
uniform float uSteps, uAbsorption, uOpacity;
uniform vec2 uWind;
uniform vec3 uSunDir, uSunColor, uAmbient;

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
float fbm2(vec3 p){       // versione economica per i light-tap
  return .62 * noise3(p) + .38 * noise3(p * 2.13);
}

float heightProfile(float y){
  float h = clamp((y - uAltitude) / uThickness, 0.0, 1.0);
  return smoothstep(0.0, .18, h) * smoothstep(1.0, .55, h);
}
vec3 warp(vec3 p){
  return p * (uScale * .004) + vec3(uWind.x, 0.0, uWind.y) * uTime * .012;
}
float densityAt(vec3 p){
  float prof = heightProfile(p.y);
  if(prof <= 0.0) return 0.0;
  vec3 q = warp(p);
  float base = fbm(q);
  float thr = 1.0 - uCoverage;
  float d = smoothstep(thr, thr + .3, base) * prof;
  if(d <= 0.002) return 0.0;
  float det = fbm2(q * 3.3 + vec3(0.0, uTime * .02, 0.0));
  d -= det * uDetail * (1.0 - d) * .55;
  return clamp(d, 0.0, 1.0) * uDensity;
}
float densityCheap(vec3 p){
  float prof = heightProfile(p.y);
  if(prof <= 0.0) return 0.0;
  float thr = 1.0 - uCoverage;
  return clamp(smoothstep(thr, thr + .3, fbm2(warp(p))) * prof, 0.0, 1.0) * uDensity;
}

void main(){
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  float horizon = smoothstep(.015, .10, rd.y);
  if(horizon <= 0.0 || uOpacity <= 0.0){ gl_FragColor = vec4(0.0); return; }

  float t0 = (uAltitude - ro.y) / rd.y;
  float t1 = (uAltitude + uThickness - ro.y) / rd.y;
  if(t1 <= 0.0){ gl_FragColor = vec4(0.0); return; }
  t0 = max(t0, 0.0);
  // limita i percorsi radenti (nuvole lontane costano e non si vedono)
  t1 = min(t1, t0 + uThickness * 7.0 / max(rd.y, .1));

  float steps = clamp(uSteps, 6.0, 40.0);
  float dt = (t1 - t0) / steps;
  float trans = 1.0;
  vec3 acc = vec3(0.0);
  float mu = max(dot(rd, uSunDir), 0.0);
  float phase = .58 + .9 * pow(mu, 6.0);      // forward scattering + silver lining
  float jitter = hash(vec3(gl_FragCoord.xy, uTime)) - .5;

  for(int i = 0; i < 40; i++){
    if(float(i) >= steps || trans < .05) break;
    vec3 p = ro + rd * (t0 + (float(i) + .5 + jitter * .8) * dt);
    float d = densityAt(p);
    if(d > .003){
      float shadow = densityCheap(p + uSunDir * (uThickness * .3)) * .65
                   + densityCheap(p + uSunDir * (uThickness * .7)) * .35;
      float light = exp(-shadow * uAbsorption * 1.9);
      // powder: schiarisce i bordi sottili
      float powder = 1.0 - exp(-d * 2.2);
      vec3 c = uAmbient * (.55 + .45 * light) + uSunColor * light * phase * powder;
      float a = 1.0 - exp(-d * uAbsorption * dt * .06);
      acc += c * a * trans;
      trans *= 1.0 - a;
    }
  }
  float alpha = (1.0 - trans) * uOpacity * horizon;
  gl_FragColor = vec4(acc, alpha);
}`;

function create(deps){
  const scene = deps.scene;
  const P = Object.assign({}, DEFAULTS);

  const uniforms = {
    uTime:       {value: 0},
    uCoverage:   {value: P.coverage},
    uDensity:    {value: P.density},
    uScale:      {value: P.scale},
    uDetail:     {value: P.detail},
    uAltitude:   {value: P.altitude},
    uThickness:  {value: P.thickness},
    uSteps:      {value: P.quality},
    uAbsorption: {value: P.absorption},
    uOpacity:    {value: P.opacity},
    uWind:       {value: new THREE.Vector2(1, .4)},
    uSunDir:     {value: new THREE.Vector3(0, 1, 0)},
    uSunColor:   {value: new THREE.Color(0xfff2dd)},
    uAmbient:    {value: new THREE.Color(0x8fb6dd)},
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(470, 32, 20), mat);
  dome.renderOrder = -0.5;           // dopo stelle(-2) e luna(-1), prima di fumo/particelle (0)
  dome.frustumCulled = false;
  dome.visible = P.enabled;
  const flareOrigin = new THREE.Vector3();
  const flareDirection = new THREE.Vector3();
  const fract = value => value - Math.floor(value);
  const mix = (a,b,t) => a+(b-a)*t;
  const smoothstep = (a,b,value) => {
    const delta=b-a;
    const t=clamp((value-a)/(Math.abs(delta)<1e-6?(delta<0?-1e-6:1e-6):delta),0,1);
    return t*t*(3-2*t);
  };
  function hash3(x,y,z){
    x=fract(x*.3183099+.1)*17;
    y=fract(y*.3183099+.1)*17;
    z=fract(z*.3183099+.1)*17;
    return fract(x*y*z*(x+y+z));
  }
  function noise3(x,y,z){
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);
    let fx=fract(x),fy=fract(y),fz=fract(z);
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz);
    const x00=mix(hash3(ix,iy,iz),hash3(ix+1,iy,iz),fx);
    const x10=mix(hash3(ix,iy+1,iz),hash3(ix+1,iy+1,iz),fx);
    const x01=mix(hash3(ix,iy,iz+1),hash3(ix+1,iy,iz+1),fx);
    const x11=mix(hash3(ix,iy+1,iz+1),hash3(ix+1,iy+1,iz+1),fx);
    return mix(mix(x00,x10,fy),mix(x01,x11,fy),fz);
  }
  function fbm3(x,y,z){
    let value=0,amplitude=.52;
    for(let i=0;i<4;i++){
      value+=amplitude*noise3(x,y,z);
      x=x*2.13+11.3;y=y*2.13+5.1;z=z*2.13+7.7;amplitude*=.5;
    }
    return value;
  }
  function fbmCheap(x,y,z){ return .62*noise3(x,y,z)+.38*noise3(x*2.13,y*2.13,z*2.13); }
  function flareDensity(x,y,z,time){
    const h=clamp((y-P.altitude)/Math.max(1,P.thickness),0,1);
    const profile=smoothstep(0,.18,h)*smoothstep(1,.55,h);
    if(profile<=0) return 0;
    const scale=P.scale*.004;
    const windX=Math.cos((P.windAngle||0)*Math.PI/180)*P.speed;
    const windZ=Math.sin((P.windAngle||0)*Math.PI/180)*P.speed;
    const qx=x*scale+windX*time*.012;
    const qy=y*scale;
    const qz=z*scale+windZ*time*.012;
    const threshold=1-P.coverage;
    let density=smoothstep(threshold,threshold+.3,fbm3(qx,qy,qz))*profile;
    if(density<=.002) return 0;
    const detail=fbmCheap(qx*3.3,qy*3.3+time*.02,qz*3.3);
    density-=detail*P.detail*(1-density)*.55;
    return clamp(density,0,1)*P.density;
  }
  function sunTransmission(camera,direction){
    if(!camera||!P.enabled||P.opacity<=0||P.coverage<=.01) return 1;
    camera.getWorldPosition(flareOrigin);
    flareDirection.copy(direction).normalize();
    const horizon=smoothstep(.015,.10,flareDirection.y);
    if(horizon<=0) return 1;
    let t0=(P.altitude-flareOrigin.y)/flareDirection.y;
    let t1=(P.altitude+P.thickness-flareOrigin.y)/flareDirection.y;
    if(t1<=0) return 1;
    t0=Math.max(t0,0);
    t1=Math.min(t1,t0+P.thickness*7/Math.max(flareDirection.y,.1));
    const steps=Math.max(8,Math.min(28,Math.round(P.quality)||20));
    const stepLength=(t1-t0)/steps;
    const time=uniforms.uTime.value;
    let transmission=1;
    for(let i=0;i<steps&&transmission>.03;i++){
      const distance=t0+(i+.5)*stepLength;
      const density=flareDensity(
        flareOrigin.x+flareDirection.x*distance,
        flareOrigin.y+flareDirection.y*distance,
        flareOrigin.z+flareDirection.z*distance,
        time
      );
      if(density>.003) transmission*=Math.exp(-density*P.absorption*stepLength*.06);
    }
    const alpha=(1-transmission)*P.opacity*horizon;
    return clamp(1-alpha,.02,1);
  }
  dome.userData.lkFlareTransmission=(hit,camera,direction) => sunTransmission(camera,direction);
  scene.add(dome);

  function normalizeParams(){
    P.enabled = P.enabled === true;
    P.coverage = clamp(Number(P.coverage) || 0, 0, 1);
    P.density = clamp(Number(P.density) || 0, 0, 3);
    P.scale = clamp(Number(P.scale) || DEFAULTS.scale, .2, 6);
    P.detail = clamp(Number(P.detail) || 0, 0, 1);
    P.speed = clamp(Number(P.speed) || 0, 0, 6);
    P.windAngle = ((Number(P.windAngle) || 0) % 360 + 360) % 360;
    P.altitude = clamp(Number(P.altitude) || DEFAULTS.altitude, 40, 400);
    P.thickness = clamp(Number(P.thickness) || DEFAULTS.thickness, 10, 260);
    P.quality = clamp(Math.round(Number(P.quality) || DEFAULTS.quality), 6, 40);
    P.absorption = clamp(Number(P.absorption) || DEFAULTS.absorption, .2, 3);
    P.opacity = clamp(Number(P.opacity) || 0, 0, 1);
  }

  function applyParams(){
    normalizeParams();
    uniforms.uCoverage.value = clamp(P.coverage, 0, 1);
    uniforms.uDensity.value = clamp(P.density, 0, 3);
    uniforms.uScale.value = clamp(P.scale, .2, 6);
    uniforms.uDetail.value = clamp(P.detail, 0, 1);
    uniforms.uAltitude.value = clamp(P.altitude, 40, 400);
    uniforms.uThickness.value = clamp(P.thickness, 10, 260);
    uniforms.uSteps.value = clamp(Math.round(P.quality), 6, 40);
    uniforms.uAbsorption.value = clamp(P.absorption, .2, 3);
    uniforms.uOpacity.value = clamp(P.opacity, 0, 1);
    const a = (P.windAngle || 0) * Math.PI / 180;
    uniforms.uWind.value.set(Math.cos(a), Math.sin(a)).multiplyScalar(clamp(P.speed, 0, 6));
    dome.visible = !!P.enabled && P.opacity > 0 && P.coverage > .01;
  }
  applyParams();

  return {
    // chiamato da sky.update: aggancia sole/ambiente al ciclo giorno-notte
    sync(info){
      uniforms.uSunDir.value.copy(info.sunDir);
      uniforms.uSunColor.value.copy(info.sunColor).multiplyScalar(.55 + info.dayF * .75);
      uniforms.uAmbient.value.copy(info.ambient).multiplyScalar(.5 + info.dayF * .6)
        .lerp(new THREE.Color(0x131b2c), info.nightF * .8);
    },
    tick(dt){ uniforms.uTime.value += dt; },
    get: () => Object.assign({}, P),
    set(patch){
      Object.assign(P, patch || {});
      applyParams();
    },
    isEnabled: () => !!P.enabled && dome.visible,
    sunTransmission,
    defaults: () => Object.assign({}, DEFAULTS),
    mesh: dome,
  };
}

window.LK_RUNTIME_VOL_CLOUDS = Object.freeze({create, DEFAULTS});
})();
