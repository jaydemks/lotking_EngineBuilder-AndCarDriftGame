/* =========================================================
   LOT KING — dynamic sky runtime module
   Day/night cycle, stars, moon, clouds, procedural environment and sun flare.
   ========================================================= */
(function(){
'use strict';

function createSky(deps){
  const scene = deps.scene;
  const renderer = deps.renderer;
  const paths = deps.paths;
  const isFileMode = deps.isFileMode;
  const sun = deps.sun;
  const hemi = deps.hemi;
  const lampMat = deps.lampMat;
  const pl1 = deps.pl1;
  const pl2 = deps.pl2;
  const clamp01 = v => Math.max(0, Math.min(1, v));

  let DAY_LEN = 900;
  let t = 0.10;

  const N = 900, sp = new Float32Array(N * 3);
  for(let i = 0; i < N; i++){
    const a = Math.random() * Math.PI * 2, u = 0.06 + Math.random() * 0.92, r = 380;
    const h = Math.sqrt(1 - u * u);
    sp[i*3] = Math.cos(a) * h * r;
    sp[i*3+1] = u * r;
    sp[i*3+2] = Math.sin(a) * h * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({color:0xcfe0ff, size:1.7, transparent:true, opacity:0, fog:false, sizeAttenuation:false});
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -2;
  scene.add(stars);

  function moonTexture(){
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#cfd3dc'; g.fillRect(0,0,256,256);
    for(let i=0;i<3500;i++){ const v=180+Math.random()*60|0; g.fillStyle=`rgba(${v},${v},${v+6},.25)`; g.fillRect(Math.random()*256,Math.random()*256,2,2); }
    for(let i=0;i<26;i++){
      const x=Math.random()*256, y=Math.random()*256, r=4+Math.random()*16;
      const gr=g.createRadialGradient(x,y,r*.2,x,y,r);
      gr.addColorStop(0,'rgba(120,124,138,.55)'); gr.addColorStop(.8,'rgba(150,154,168,.25)'); gr.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
      g.strokeStyle='rgba(225,228,238,.35)'; g.lineWidth=1.5; g.beginPath(); g.arc(x,y,r*.95,Math.PI*1.1,Math.PI*1.9); g.stroke();
    }
    const tx=new THREE.CanvasTexture(c); tx.encoding=THREE.sRGBEncoding; return tx;
  }
  const moon = new THREE.Mesh(new THREE.SphereGeometry(11, 24, 18),
    new THREE.MeshBasicMaterial({map:moonTexture(), fog:false, transparent:true, opacity:0}));
  moon.renderOrder = -1; scene.add(moon);

  function glowTexture(inner, outer){
    const c=document.createElement('canvas'); c.width=c.height=128;
    const g=c.getContext('2d');
    const gr=g.createRadialGradient(64,64,4,64,64,62);
    gr.addColorStop(0,inner); gr.addColorStop(.35,outer); gr.addColorStop(1,'rgba(255,200,90,0)');
    g.fillStyle=gr; g.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({map:glowTexture('rgba(255,252,235,1)','rgba(255,206,110,.75)'), fog:false, transparent:true, depthWrite:false}));
  sunSprite.scale.set(70,70,1); sunSprite.renderOrder=-1; scene.add(sunSprite);

  function cloudTexture(){
    const c=document.createElement('canvas'); c.width=128; c.height=128;
    const g=c.getContext('2d');
    const gr=g.createRadialGradient(64,70,6,64,70,58);
    gr.addColorStop(0,'rgba(255,255,255,.95)'); gr.addColorStop(.55,'rgba(255,255,255,.45)'); gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.beginPath(); g.ellipse(64,70,58,40,0,0,7); g.fill();
    return new THREE.CanvasTexture(c);
  }
  const cloudTex = cloudTexture();
  const clouds = [];
  for(let i=0;i<9;i++){
    const g = new THREE.Group();
    const puffs = 6 + (Math.random()*4|0);
    for(let j=0;j<puffs;j++){
      const s = new THREE.Sprite(new THREE.SpriteMaterial({map:cloudTex, transparent:true, opacity:.7, depthWrite:false, fog:false}));
      const sc = 20 + Math.random()*28;
      s.scale.set(sc, sc*(.4+Math.random()*.2), 1);
      s.position.set((Math.random()-.5)*46, (Math.random()-.5)*7, (Math.random()-.5)*20);
      g.add(s);
    }
    g.position.set((Math.random()-.5)*520, 70+Math.random()*45, (Math.random()-.5)*520);
    g.userData.speed = 1.2 + Math.random()*2.2;
    scene.add(g); clouds.push(g);
  }

  const HDRI = {
    enabled: false,
    ready: false,
    loading: false,
    states: [
      {key:'dawn',  file:paths.hdri('dawn.hdr'),  time:0.03, texture:null, env:null},
      {key:'day',   file:paths.hdri('day.hdr'),   time:0.25, texture:null, env:null},
      {key:'dusk',  file:paths.hdri('dusk.hdr'),  time:0.50, texture:null, env:null},
      {key:'night', file:paths.hdri('night.hdr'), time:0.75, texture:null, env:null},
    ],
    activeA: null,
    activeB: null,
    mix: 0,
    intensity: 1,
    envState: null,
  };
  const PROC_ENV = {
    enabled: true,
    intensity: .65,
    warmth: .55,
    contrast: .62,
    env: null,
    tex: null,
    pmrem: null,
    bucket: -1,
  };
  const hdriGroup = new THREE.Group();
  hdriGroup.name = 'LK_HDRI_SkyBlend';
  hdriGroup.renderOrder = -20;
  scene.add(hdriGroup);
  const hdriSphereGeo = new THREE.SphereGeometry(480, 64, 32);
  hdriSphereGeo.scale(-1, 1, 1);
  const hdriSkyA = new THREE.Mesh(hdriSphereGeo, new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false, fog:false, side:THREE.DoubleSide}));
  const hdriSkyB = new THREE.Mesh(hdriSphereGeo, new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false, fog:false, side:THREE.DoubleSide}));
  hdriGroup.add(hdriSkyA, hdriSkyB);

  function loadHDRI(){
    return false;
  }
  function initProceduralEnv(){
    if(PROC_ENV.pmrem || !renderer) return;
    PROC_ENV.pmrem = new THREE.PMREMGenerator(renderer);
    PROC_ENV.pmrem.compileEquirectangularShader();
  }
  function rebuildProceduralEnv(v, force){
    if(!PROC_ENV.enabled) return false;
    initProceduralEnv();
    if(!PROC_ENV.pmrem) return false;
    if(!force && PROC_ENV.env) return true;
    const bucket = Math.round(v * 96);
    if(!force && PROC_ENV.bucket === bucket && PROC_ENV.env) return true;
    PROC_ENV.bucket = bucket;

    const th = v * Math.PI * 2;
    const sy = Math.sin(th);
    const dayF = clamp01(sy * 2.2);
    const nightF = clamp01(-sy * 2.4);
    const duskF = clamp01(1 - Math.abs(sy) * 3.1);
    const w = 128, h = 64;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const top = new THREE.Color(0x08101d).lerp(new THREE.Color(0x7fb5e8), dayF).lerp(new THREE.Color(0x5a2d58), duskF * .55);
    const mid = new THREE.Color(0x172032).lerp(new THREE.Color(0xc5d9ee), dayF).lerp(new THREE.Color(0xff8b4a), duskF * .38);
    const low = new THREE.Color(0x1a1515).lerp(new THREE.Color(0x667079), dayF).lerp(new THREE.Color(0x3a2432), nightF * .45);
    const boost = PROC_ENV.intensity;
    const grad = g.createLinearGradient(0, 0, 0, h);
    const css = col => '#' + col.getHexString();
    grad.addColorStop(0, css(top.multiplyScalar(.65 + boost * .55)));
    grad.addColorStop(.48, css(mid.multiplyScalar(.55 + boost * .65)));
    grad.addColorStop(1, css(low.multiplyScalar(.45 + boost * .45)));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    const sunX = ((Math.cos(th) * .5 + .5) * w) | 0;
    const sunY = ((.50 - sy * .34) * h) | 0;
    const warm = new THREE.Color(0xffffff).lerp(new THREE.Color(0xff9f4a), PROC_ENV.warmth * (.25 + duskF * .75));
    const r = 10 + PROC_ENV.contrast * 20 + duskF * 16;
    const sg = g.createRadialGradient(sunX, sunY, 1, sunX, sunY, r);
    sg.addColorStop(0, 'rgba(' + ((warm.r*255)|0) + ',' + ((warm.g*255)|0) + ',' + ((warm.b*255)|0) + ',' + (.55 + boost * .32) + ')');
    sg.addColorStop(.28, 'rgba(255,205,125,' + (.22 + duskF * .18) + ')');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg;
    g.fillRect(0, 0, w, h);

    if(nightF > .15){
      g.fillStyle = 'rgba(190,215,255,' + (nightF * .5) + ')';
      for(let i=0;i<70;i++) g.fillRect(Math.random()*w, Math.random()*h*.58, 1, 1);
    }

    if(PROC_ENV.env) PROC_ENV.env.dispose();
    if(PROC_ENV.tex) PROC_ENV.tex.dispose();
    PROC_ENV.tex = new THREE.CanvasTexture(c);
    PROC_ENV.tex.encoding = THREE.sRGBEncoding;
    PROC_ENV.tex.mapping = THREE.EquirectangularReflectionMapping;
    PROC_ENV.env = PROC_ENV.pmrem.fromEquirectangular(PROC_ENV.tex).texture;
    return true;
  }
  function hdriPairAt(v){
    const states = HDRI.states.filter(s => s.texture);
    if(states.length < 2) return null;
    states.sort((a,b) => a.time - b.time);
    let a = states[states.length - 1], b = states[0];
    for(let i=0;i<states.length;i++){
      const cur = states[i], nxt = states[(i+1) % states.length];
      const end = nxt.time > cur.time ? nxt.time : nxt.time + 1;
      const vv = v >= cur.time ? v : v + 1;
      if(vv >= cur.time && vv <= end){ a = cur; b = nxt; break; }
    }
    const span = (b.time > a.time ? b.time : b.time + 1) - a.time;
    const vv = v >= a.time ? v : v + 1;
    const mix = clamp01((vv - a.time) / Math.max(.0001, span));
    return {a, b, mix};
  }
  function applyHDRI(v){
    if(!HDRI.enabled || !HDRI.ready){
      hdriSkyA.material.opacity = 0;
      hdriSkyB.material.opacity = 0;
      scene.environment = null;
      return false;
    }
    const pair = hdriPairAt(v);
    if(!pair) return false;
    if(HDRI.activeA !== pair.a){
      hdriSkyA.material.map = pair.a.texture;
      hdriSkyA.material.needsUpdate = true;
      HDRI.activeA = pair.a;
    }
    if(HDRI.activeB !== pair.b){
      hdriSkyB.material.map = pair.b.texture;
      hdriSkyB.material.needsUpdate = true;
      HDRI.activeB = pair.b;
    }
    HDRI.mix = pair.mix;
    hdriSkyA.material.opacity = HDRI.intensity * (1 - pair.mix);
    hdriSkyB.material.opacity = HDRI.intensity * pair.mix;
    scene.background = null;
    scene.environment = (pair.mix < .5 ? pair.a.env : pair.b.env) || null;
    return true;
  }
  function applyProceduralEnv(v){
    if(!PROC_ENV.enabled){
      if(scene.environment === PROC_ENV.env) scene.environment = null;
      return false;
    }
    if(!rebuildProceduralEnv(v, false)) return false;
    scene.environment = PROC_ENV.env || null;
    return !!PROC_ENV.env;
  }

  // ---------- sun bloom: alone luminoso attorno al disco solare ----------
  const SUN_BLOOM_DEFAULTS = {enabled:true, intensity:1, size:1};
  const SUN_BLOOM = Object.assign({}, SUN_BLOOM_DEFAULTS);

  // ---------- lens flare parametrico ----------
  // Catena di ghost calcolata in spazio camera a ogni render (onBeforeRender
  // del glow riceve la camera attiva: funziona in gioco, editor e PIP).
  // Un ghost a parametro t sta sul segmento sole → centro schermo:
  // pos camera-space = (sx*(1-t), sy*(1-t), sz), con t>1 oltre il centro.
  const clampf = (v, a, b) => Math.min(b, Math.max(a, v));
  const FLARE_DEFAULTS = {enabled:true, intensity:.85, size:1, ghosts:5, spacing:.9, chroma:.7, halo:.45, haloSize:1, streak:.5};
  const FLARE = Object.assign({}, FLARE_DEFAULTS);
  const FLARE_MAX_GHOSTS = 8;
  const FLARE_PALETTE = [0xffb066, 0x7fd0ff, 0xff8fb0, 0xa8ffd8, 0xffe6a0, 0x9fa8ff, 0xffc8e8, 0xc8f0ff];

  function flareDiscTex(hard){
    const c=document.createElement('canvas'); c.width=c.height=128;
    const g=c.getContext('2d');
    const gr=g.createRadialGradient(64,64,0,64,64,62);
    gr.addColorStop(0,'rgba(255,255,255,1)');
    gr.addColorStop(hard ? .22 : .45, 'rgba(255,255,255,.4)');
    gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(c);
  }
  function flareRingTex(){
    const c=document.createElement('canvas'); c.width=c.height=256;
    const g=c.getContext('2d');
    const gr=g.createRadialGradient(128,128,60,128,128,126);
    gr.addColorStop(0,'rgba(255,255,255,0)');
    gr.addColorStop(.72,'rgba(255,255,255,0)');
    gr.addColorStop(.86,'rgba(255,255,255,.55)');
    gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.fillRect(0,0,256,256);
    return new THREE.CanvasTexture(c);
  }
  function flareStreakTex(){
    const c=document.createElement('canvas'); c.width=256; c.height=64;
    const g=c.getContext('2d');
    const gr=g.createLinearGradient(0,0,256,0);
    gr.addColorStop(0,'rgba(255,255,255,0)');
    gr.addColorStop(.5,'rgba(255,255,255,.9)');
    gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr; g.fillRect(0,0,256,64);
    const gv=g.createLinearGradient(0,0,0,64);
    gv.addColorStop(0,'rgba(0,0,0,1)'); gv.addColorStop(.5,'rgba(0,0,0,0)'); gv.addColorStop(1,'rgba(0,0,0,1)');
    g.globalCompositeOperation='destination-out';
    g.fillStyle=gv; g.fillRect(0,0,256,64);
    return new THREE.CanvasTexture(c);
  }
  function flareSprite(map, colorHex){
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map, transparent:true, opacity:0, depthWrite:false, depthTest:false,
      fog:false, blending:THREE.AdditiveBlending, color:new THREE.Color(colorHex == null ? 0xffffff : colorHex),
    }));
    s.frustumCulled = false;
    s.renderOrder = 991;
    return s;
  }
  const flare = {sunPos:new THREE.Vector3(), vis:0, group:new THREE.Group(), ghosts:[]};
  flare.glow = flareSprite(flareDiscTex(true), 0xffe7b0);
  flare.glow.renderOrder = 990;               // primo del gruppo: fa da "probe" per il layout
  flare.streak = flareSprite(flareStreakTex(), 0xffe0c0);
  flare.halo = flareSprite(flareRingTex(), 0xbfd8ff);
  const ghostTex = flareDiscTex(false);
  for(let i = 0; i < FLARE_MAX_GHOSTS; i++) flare.ghosts.push(flareSprite(ghostTex));
  flare.group.add(flare.glow, flare.streak, flare.halo);
  for(const g of flare.ghosts) flare.group.add(g);
  scene.add(flare.group);

  function applyFlareColors(){
    const white = new THREE.Color(0xffffff);
    flare.ghosts.forEach((g, i) => {
      g.material.color.setHex(FLARE_PALETTE[i % FLARE_PALETTE.length]).lerp(white, 1 - clampf(FLARE.chroma, 0, 1));
    });
  }
  applyFlareColors();

  const _fv = new THREE.Vector3(), _fn = new THREE.Vector3();
  function layoutFlare(camera){
    if(!camera || !camera.matrixWorldInverse) return;
    _fv.copy(flare.sunPos).applyMatrix4(camera.matrixWorldInverse);
    const behind = _fv.z > -1;
    _fn.copy(flare.sunPos).project(camera);
    const edge = behind ? 99 : Math.max(Math.abs(_fn.x), Math.abs(_fn.y));
    const fade = clamp01(1.35 - edge * .85) * flare.vis * clampf(FLARE.intensity, 0, 2);
    const dist = Math.max(1, _fv.length());
    const k = dist * .06 * clampf(FLARE.size, .1, 4);
    const place = (spr, t, sx, sy, op) => {
      spr.position.set(_fv.x * (1 - t), _fv.y * (1 - t), _fv.z).applyMatrix4(camera.matrixWorld);
      spr.scale.set(sx, sy, 1);
      spr.material.opacity = clamp01(op);
      spr.updateMatrixWorld();
    };
    place(flare.glow, 0, k * 2.4, k * 2.4, fade * .7);
    const stW = k * 9 * (.4 + clampf(FLARE.streak, 0, 1));
    place(flare.streak, 0, stW, stW * .12, fade * FLARE.streak * .5);
    const haloS = k * (2.2 * clampf(FLARE.haloSize, .2, 3) + .6);
    place(flare.halo, 1, haloS, haloS, fade * FLARE.halo * .55);
    const n = Math.round(clampf(FLARE.ghosts, 0, FLARE_MAX_GHOSTS));
    for(let i = 0; i < flare.ghosts.length; i++){
      const g = flare.ghosts[i];
      if(i >= n || fade <= 0){ g.material.opacity = 0; continue; }
      const t = clampf(FLARE.spacing, .1, 2) * (.45 + 1.55 * (i + 1) / (n + 1));
      const gs = k * (.35 + ((i * 2.7 + .7) % 1) * .9);
      place(g, t, gs, gs, fade * (.34 - .022 * i));
    }
  }
  flare.glow.onBeforeRender = (rnd, scn, camera) => layoutFlare(camera);

  const skyDay=new THREE.Color(0x86b4e2), skyDusk=new THREE.Color(0x53365a), skyNight=new THREE.Color(0x060a14);
  const sunDay=new THREE.Color(0xfff2dd), sunDusk=new THREE.Color(0xff8b4a), moonLight=new THREE.Color(0x9db4ff);
  const bg = new THREE.Color(), cl = new THREE.Color();
  const sunV = new THREE.Vector3();
  const lightDir = new THREE.Vector3();

  // nuvole volumetriche (modulo opzionale, sostituisce le sprite clouds quando
  // attivo). Creazione lazy: se lo script arriva dopo, si aggancia comunque.
  let VC = null;
  function ensureVC(){
    if(!VC && window.LK_RUNTIME_VOL_CLOUDS) VC = window.LK_RUNTIME_VOL_CLOUDS.create({scene});
    return VC;
  }
  ensureVC();

  function update(dt){
    t = (t + dt/DAY_LEN) % 1;
    const th = t*Math.PI*2;
    sunV.set(Math.cos(th), Math.sin(th), 0.35).normalize();
    const dayF   = clamp01(sunV.y*2.2);
    const nightF = clamp01(-sunV.y*2.6);
    const duskF  = clamp01(1 - Math.abs(sunV.y)*3.2);

    if(sunV.y >= 0) bg.copy(skyDusk).lerp(skyDay, dayF);
    else            bg.copy(skyDusk).lerp(skyNight, nightF);
    const hdriActive = applyHDRI(t);
    const procEnvActive = !hdriActive && applyProceduralEnv(t);
    if(!hdriActive){
      if(!(scene.background && scene.background.isColor)) scene.background = new THREE.Color();
      scene.background.copy(bg);
    }
    if(renderer && renderer.setClearColor) renderer.setClearColor(bg, 1);
    if(!hdriActive && !procEnvActive && scene.environment === PROC_ENV.env) scene.environment = null;
    scene.fog.color.copy(bg);

    if(sunV.y > -0.04){
      sun.position.copy(sunV).multiplyScalar(130);
      sun.intensity = 0.15 + 0.8*dayF;
      sun.color.copy(sunDusk).lerp(sunDay, dayF);
    } else {
      sun.position.set(-sunV.x, -sunV.y, -sunV.z).multiplyScalar(130);
      sun.intensity = 0.14;
      sun.color.copy(moonLight);
    }
    hemi.intensity = 0.14 + 0.5*dayF;

    sunSprite.position.copy(sunV).multiplyScalar(330);
    sunSprite.visible = SUN_BLOOM.enabled;
    sunSprite.material.opacity = clamp01(sunV.y*4 + .15) * (0.85 + duskF*.3) * clampf(SUN_BLOOM.intensity, 0, 2);
    sunSprite.scale.setScalar((70 + duskF*45) * clampf(SUN_BLOOM.size, .2, 3));
    flare.sunPos.copy(sunV).multiplyScalar(250);
    flare.vis = clamp01(sunV.y*3 + .2);
    flare.group.visible = FLARE.enabled && flare.vis > 0.01 && FLARE.intensity > 0.01;
    moon.position.set(-sunV.x, -sunV.y, -sunV.z).multiplyScalar(340);
    moon.material.opacity = clamp01(-sunV.y*5);
    moon.rotation.y += dt*.01;
    starMat.opacity = nightF * .95;
    stars.rotation.y += dt*.004;

    lampMat.emissiveIntensity = 0.5 + nightF*2.4;
    pl1.intensity = 0.15 + nightF*0.95;
    pl2.intensity = 0.1  + nightF*0.6;

    const volCloudsOn = VC && VC.isEnabled();
    cl.set(0xffffff).lerp(sunDusk, duskF*.7);
    for(const g of clouds){
      g.visible = !volCloudsOn;
      if(volCloudsOn) continue;
      g.position.x += g.userData.speed * dt;
      if(g.position.x > 300) g.position.x = -300;
      for(const s of g.children){
        s.material.opacity = 0.12 + dayF*0.6;
        s.material.color.copy(cl);
      }
    }
    if(ensureVC()){
      lightDir.copy(sun.position).normalize();
      VC.sync({sunDir: lightDir, sunColor: sun.color, ambient: bg, dayF, duskF, nightF});
      VC.tick(dt);
    }
  }
  update(0);

  return {update,
    getTime: () => t,
    setTime: v => { t = ((v % 1) + 1) % 1; update(0); },
    getDayLength: () => DAY_LEN,
    setDayLength: v => { DAY_LEN = Math.max(10, v); },
    hdri: {
      state: HDRI,
      setEnabled: () => { HDRI.enabled = false; update(0); },
      getEnabled: () => false,
      setIntensity: v => { HDRI.intensity = clamp01(v); update(0); },
      getIntensity: () => HDRI.intensity,
      files: () => [],
      isReady: () => false,
    },
    proceduralEnv: {
      state: PROC_ENV,
      setEnabled: v => { PROC_ENV.enabled = !!v; if(!PROC_ENV.enabled && scene.environment === PROC_ENV.env) scene.environment = null; update(0); },
      getEnabled: () => PROC_ENV.enabled,
      setIntensity: v => { PROC_ENV.intensity = clamp01(v); rebuildProceduralEnv(t, true); update(0); },
      getIntensity: () => PROC_ENV.intensity,
      setWarmth: v => { PROC_ENV.warmth = clamp01(v); rebuildProceduralEnv(t, true); update(0); },
      getWarmth: () => PROC_ENV.warmth,
      setContrast: v => { PROC_ENV.contrast = clamp01(v); rebuildProceduralEnv(t, true); update(0); },
      getContrast: () => PROC_ENV.contrast,
      isReady: () => !!PROC_ENV.env,
    },
    flare: {
      state: FLARE,
      get: () => Object.assign({}, FLARE),
      set: patch => {
        Object.assign(FLARE, patch || {});
        FLARE.enabled = FLARE.enabled === true;
        FLARE.intensity = clampf(Number(FLARE.intensity) || 0, 0, 2);
        FLARE.size = clampf(Number(FLARE.size) || FLARE_DEFAULTS.size, .2, 3);
        FLARE.ghosts = Math.round(clampf(Number(FLARE.ghosts) || 0, 0, FLARE_MAX_GHOSTS));
        FLARE.spacing = clampf(Number(FLARE.spacing) || FLARE_DEFAULTS.spacing, .1, 2);
        FLARE.chroma = clampf(Number(FLARE.chroma) || 0, 0, 1);
        FLARE.halo = clampf(Number(FLARE.halo) || 0, 0, 1);
        FLARE.haloSize = clampf(Number(FLARE.haloSize) || FLARE_DEFAULTS.haloSize, .2, 3);
        FLARE.streak = clampf(Number(FLARE.streak) || 0, 0, 1);
        applyFlareColors();
        update(0);
      },
      defaults: () => Object.assign({}, FLARE_DEFAULTS),
      // compat con le vecchie chiavi di persistenza (flareEnabled/Opacity/Size)
      setEnabled: v => { FLARE.enabled = !!v; update(0); },
      getEnabled: () => FLARE.enabled,
      setOpacity: v => { FLARE.intensity = clampf(v, 0, 2); update(0); },
      getOpacity: () => FLARE.intensity,
      setSize: v => { FLARE.size = clampf(v, .2, 3); update(0); },
      getSize: () => FLARE.size,
    },
    sunBloom: {
      get: () => Object.assign({}, SUN_BLOOM),
      set: patch => {
        Object.assign(SUN_BLOOM, patch || {});
        SUN_BLOOM.enabled = SUN_BLOOM.enabled === true;
        SUN_BLOOM.intensity = clampf(Number(SUN_BLOOM.intensity) || 0, 0, 2);
        SUN_BLOOM.size = clampf(Number(SUN_BLOOM.size) || SUN_BLOOM_DEFAULTS.size, .2, 3);
        update(0);
      },
      defaults: () => Object.assign({}, SUN_BLOOM_DEFAULTS),
    },
    volClouds: {
      available: () => !!ensureVC(),
      get: () => ensureVC() ? VC.get() : null,
      set: patch => { if(ensureVC()){ VC.set(patch); update(0); } },
      isEnabled: () => !!VC && VC.isEnabled(),
      defaults: () => ensureVC() ? VC.defaults() : {},
      tick: dt => { if(VC) VC.tick(dt); },
    },
  };
}

window.LK_RUNTIME_SKY = Object.freeze({createSky});
})();
