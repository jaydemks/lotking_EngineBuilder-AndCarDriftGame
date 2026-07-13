/* =========================================================
   LOT KING - PLAYER LIGHT RIG
   Vehicle-mounted runtime lights only: front/rear lights, aux lights,
   neon and hold-to-flash high beams. World lights and scene light
   entities stay in their own systems.
   ========================================================= */
(function(){
'use strict';

const DEFAULT_CONFIG = Object.freeze({
  front: {enabled:true, auto:true, autoOnHour:18, autoOffHour:7, count:2, color:0xfff0c8, intensity:1.55, distance:42, angle:.50, penumbra:.55,
    glow:true, bloom:true, bloomIntensity:.55, flare:true, glowSize:.62, flareSize:.42},
  rear: {enabled:true, color:0xff1f18, baseIntensity:.45, brakeIntensity:2.8, reverseColor:0xf3f4ff, reverseIntensity:2.2,
    glow:true, bloom:true, bloomIntensity:.55, flare:true, glowSize:.55, flareSize:.34},
  neon: {enabled:false, dummyVisible:true, layout:'all', colorA:0x19f7ff, colorB:0xff3df2, intensity:1.25, spill:2.8, shadows:false, animation:'pulse', speed:1.0},
  aux: [
    {enabled:false, condition:'always', color:0xffd166, intensity:1.0, glow:true, flare:false, size:.42},
    {enabled:false, condition:'brake', color:0xff3030, intensity:1.4, glow:true, flare:false, size:.42},
  ],
  dummies: {visible:false},
});

function cloneConfig(){
  return {
    front: Object.assign({}, DEFAULT_CONFIG.front),
    rear: Object.assign({}, DEFAULT_CONFIG.rear),
    neon: Object.assign({}, DEFAULT_CONFIG.neon),
    aux: DEFAULT_CONFIG.aux.map(v => Object.assign({}, v)),
    dummies: Object.assign({}, DEFAULT_CONFIG.dummies),
  };
}

function create(opts){
  opts = opts || {};
  const THREE = opts.THREERef || window.THREE;
  const car = opts.car;
  const tagEntity = opts.tagEntity || function(){ return null; };
  const getSky = opts.getSky || (() => null);
  const getKeys = opts.getKeys || (() => ({}));
  const getEngine = opts.getEngine || (() => ({}));
  const getSpeed = opts.getSpeed || (() => 0);
  const isEditorActive = opts.isEditorActive || (() => false);
  const config = cloneConfig();
  const rig = {front:[], rear:{position:[], brake:[], reverse:[]}, aux:[], neon:[], glowTex:null};
  let highBeams = false;
  let headlight = null;
  let built = false;

  function defaultAuxLightConfig(index){
    const presets = [
      {condition:'always', color:0xffd166, intensity:1.0},
      {condition:'brake', color:0xff3030, intensity:1.4},
      {condition:'reverse', color:0xf3f4ff, intensity:1.2},
      {condition:'left', color:0xffaa18, intensity:1.1},
      {condition:'right', color:0xffaa18, intensity:1.1},
    ];
    const p = presets[index % presets.length];
    return {enabled:false, condition:p.condition, color:p.color, intensity:p.intensity, glow:true, flare:false, size:.42};
  }

  function isNightTime(){
    const sky = getSky();
    const t = sky && sky.getTime ? sky.getTime() : .5;
    const hour = (((Number(t) || 0) % 1) + 1) % 1 * 24;
    const normalizeHour = (value, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(0, Math.min(24, n)) : fallback;
    };
    const on = normalizeHour(config.front.autoOnHour, 18);
    const off = normalizeHour(config.front.autoOffHour, 7);
    if(Math.abs(on - off) < .001) return true;
    return on > off ? (hour >= on || hour < off) : (hour >= on && hour < off);
  }

  function syncTimeOfDay(){
    update();
  }

  function makeGlowTexture(){
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(64,64,0,64,64,64);
    r.addColorStop(0,'rgba(255,255,255,1)');
    r.addColorStop(.22,'rgba(255,255,255,.72)');
    r.addColorStop(.55,'rgba(255,255,255,.22)');
    r.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0,0,128,128);
    const tx = new THREE.CanvasTexture(c);
    tx.encoding = THREE.sRGBEncoding;
    return tx;
  }

  function makeLightSprite(color, size, opacity){
    const mat = new THREE.SpriteMaterial({
      map: rig.glowTex || (rig.glowTex = makeGlowTexture()),
      color, transparent:true, opacity, depthWrite:false, blending:THREE.AdditiveBlending,
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(size, size, 1);
    return s;
  }

  function makeLightDummy(name, color){
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(.34, 18, 12),
      new THREE.MeshBasicMaterial({color, wireframe:true, depthTest:false, depthWrite:false})
    );
    body.userData.helperOnly = true;
    body.renderOrder = 999;
    g.add(body);
    g.userData.editorType = 'playerLight';
    g.userData.builtin = true;
    g.userData.editorName = name;
    return g;
  }

  function createAuxLightRig(idx, cfg){
    const side = idx % 2 === 0 ? -1 : 1;
    const row = Math.floor(idx / 2);
    const anchor = makeLightDummy('Aux Vehicle Light ' + (idx + 1), cfg.color);
    anchor.position.set(side * (.9 + row * .14), .78, 1.4 - row * .48);
    const point = new THREE.PointLight(cfg.color, 0, 10, 1.7);
    const glow = makeLightSprite(cfg.color, cfg.size, .5);
    const flare = makeLightSprite(cfg.color, cfg.size, .65);
    anchor.add(point); anchor.add(glow); anchor.add(flare);
    point.position.set(0,0,0); glow.position.set(0,0,0); flare.position.set(0,0,.04);
    car.add(anchor);
    tagEntity(anchor, anchor.userData.editorName, 'playerLight', {id:'player_aux_light_' + idx});
    rig.aux[idx] = {anchor, point, glow, flare};
    return rig.aux[idx];
  }

  function ensureAuxLightRigs(){
    for(let i=0;i<config.aux.length;i++){
      if(!config.aux[i]) config.aux[i] = defaultAuxLightConfig(i);
      if(!rig.aux[i]) createAuxLightRig(i, config.aux[i]);
    }
  }

  function build(){
    if(built || !car) return;
    built = true;
    for(const [idx, x] of [[0,-.58],[1,.58]]){
      const anchor = makeLightDummy(idx === 0 ? 'Front Headlight L' : 'Front Headlight R', 0xfff0c8);
      anchor.position.set(x, .78, 1.98);
      const sp = new THREE.SpotLight(config.front.color, config.front.intensity, config.front.distance, config.front.angle, config.front.penumbra, 1.25);
      const tg = new THREE.Object3D(); tg.position.set(x * -.35, -.12, 14);
      anchor.add(sp); anchor.add(tg); sp.target = tg;
      const glow = makeLightSprite(config.front.color, config.front.glowSize, .7); glow.position.set(0,0,.08); anchor.add(glow);
      const flare = makeLightSprite(config.front.color, config.front.flareSize, .95); flare.position.set(0,0,.12); anchor.add(flare);
      car.add(anchor);
      tagEntity(anchor, anchor.userData.editorName, 'playerLight', {id:'player_front_light_' + idx});
      rig.front.push({anchor, light:sp, target:tg, glow, flare});
    }
    headlight = rig.front[0].light;
    const rearDefs = [
      ['position', 'Rear Position', 0xff2020, [[-.72,.64,-2.18],[.72,.64,-2.18]]],
      ['brake', 'Rear Brake', 0xff1010, [[-.48,.68,-2.2],[.48,.68,-2.2]]],
      ['reverse', 'Rear Reverse', 0xf3f4ff, [[-.22,.68,-2.22],[.22,.68,-2.22]]],
    ];
    for(const [role, label, color, pts] of rearDefs){
      pts.forEach((pnt, idx) => {
        const anchor = makeLightDummy(label + (idx === 0 ? ' L' : ' R'), color);
        anchor.position.set(pnt[0], pnt[1], pnt[2]);
        const point = new THREE.PointLight(color, 0, 7, 1.8);
        const glow = makeLightSprite(color, config.rear.glowSize, .55);
        const flare = makeLightSprite(color, config.rear.flareSize, .72);
        anchor.add(point); anchor.add(glow); anchor.add(flare);
        point.position.set(0,0,-.08); glow.position.set(0,0,-.1); flare.position.set(0,0,-.12);
        car.add(anchor);
        tagEntity(anchor, anchor.userData.editorName, 'playerLight', {id:'player_rear_' + role + '_' + idx});
        rig.rear[role].push({anchor, point, glow, flare});
      });
    }
    ensureAuxLightRigs();
    const neonDefs = [
      ['left',  -1.05, .18, 0, .08, 2.7],
      ['right',  1.05, .18, 0, .08, 2.7],
      ['front', 0, .18, 1.75, 1.9, .08],
      ['rear',  0, .18, -1.75, 1.9, .08],
    ];
    for(const [side,x,y,z,sx,sz] of neonDefs){
      const anchor = new THREE.Group();
      anchor.position.set(x,y,z);
      anchor.userData.editorType = 'playerLight';
      anchor.userData.builtin = true;
      anchor.userData.editorName = 'Neon ' + side.charAt(0).toUpperCase() + side.slice(1);
      const helper = new THREE.Mesh(
        new THREE.BoxGeometry(sx, .12, sz),
        new THREE.MeshBasicMaterial({color:config.neon.colorA, wireframe:true, transparent:true, opacity:.85, depthTest:false, depthWrite:false})
      );
      helper.userData.helperOnly = true;
      helper.renderOrder = 999;
      const mat = new THREE.MeshBasicMaterial({color:config.neon.colorA, transparent:true, opacity:.65, depthWrite:false, blending:THREE.AdditiveBlending});
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sx,.035,sz), mat);
      const glow = new THREE.PointLight(config.neon.colorA, 0, 6, 2);
      glow.shadow.mapSize.set(256, 256);
      glow.shadow.bias = -.003;
      anchor.add(helper, strip, glow);
      car.add(anchor);
      tagEntity(anchor, anchor.userData.editorName, 'playerLight', {id:'player_neon_' + side});
      rig.neon.push({side, anchor, helper, strip, mat, glow});
    }
  }

  function apply(){
    ensureAuxLightRigs();
    const dummyVisible = !!config.dummies.visible && !!isEditorActive();
    for(const item of rig.front) item.anchor.children.forEach(c => { if(c.userData.helperOnly) c.visible = dummyVisible; });
    for(const group of Object.values(rig.rear)) for(const item of group) item.anchor.children.forEach(c => { if(c.userData.helperOnly) c.visible = dummyVisible; });
    for(const item of rig.aux) item.anchor.children.forEach(c => { if(c.userData.helperOnly) c.visible = dummyVisible; });
    const neonDummyVisible = !!config.neon.dummyVisible && !!isEditorActive();
    for(const item of rig.neon) if(item.helper) item.helper.visible = neonDummyVisible;
    const f = config.front;
    const highBeamBoost = highBeams ? 1 : 0;
    for(let i=0;i<rig.front.length;i++){
      const item = rig.front[i], sp = item.light;
      sp.color.setHex(f.color);
      const frontActive = !!f.enabled && i < Math.max(1, Math.min(2, f.count)) && (highBeams || !f.auto || isNightTime());
      sp.intensity = frontActive ? f.intensity * (1 + highBeamBoost * 1.65) : 0;
      sp.distance = f.distance * (1 + highBeamBoost * .55);
      sp.angle = Math.min(1.1, f.angle * (1 + highBeamBoost * .58));
      sp.penumbra = Math.min(1, f.penumbra + highBeamBoost * .18);
      sp.visible = true;
      item.glow.material.color.setHex(f.color);
      item.glow.material.opacity = frontActive && f.glow ? Math.min(1, (.42 + (f.bloom ? f.bloomIntensity * .45 : 0)) * (1 + highBeamBoost * .55)) : 0;
      item.glow.scale.setScalar(f.glowSize * (1 + highBeamBoost * .35));
      item.flare.material.color.setHex(f.color);
      item.flare.material.opacity = frontActive && f.flare ? Math.min(1, .88 * (1 + highBeamBoost * .25)) : 0;
      item.flare.scale.setScalar(f.flareSize * (1 + highBeamBoost * .42));
    }
  }

  function updateNeon(){
    const n = config.neon;
    const t = performance.now() * .001 * n.speed;
    const pulse = n.animation === 'pulse' ? .55 + .45 * Math.sin(t * 4) : 1;
    const chasePhase = Math.floor(t * 6) % 4;
    const active = side => {
      if(!n.enabled || n.layout === 'none') return false;
      if(n.layout === 'all') return true;
      if(n.layout === 'sides') return side === 'left' || side === 'right';
      if(n.layout === 'frontRear') return side === 'front' || side === 'rear';
      return true;
    };
    const order = ['left','front','right','rear'];
    for(const item of rig.neon){
      let k = active(item.side) ? pulse : 0;
      if(n.animation === 'chase') k *= order[chasePhase] === item.side ? 1 : .28;
      const c = (n.animation === 'alternate' && (item.side === 'right' || item.side === 'rear')) ? n.colorB : n.colorA;
      const editorPreview = !!isEditorActive();
      item.mat.color.setHex(c);
      item.mat.opacity = editorPreview ? Math.max(k * .72, .18) : k * .72;
      item.strip.visible = true;
      if(item.helper){
        item.helper.material.color.setHex(c);
        item.helper.visible = editorPreview && !!n.dummyVisible;
      }
      item.glow.color.setHex(c);
      item.glow.intensity = k * n.intensity;
      item.glow.distance = n.spill == null ? 2.8 : n.spill;
      item.glow.decay = 2.8;
      item.glow.castShadow = !!n.shadows;
      item.glow.visible = true;
    }
  }

  function update(){
    apply();
    const keys = getKeys() || {};
    const engine = getEngine() || {};
    const braking = !!(keys['s'] || keys['arrowdown'] || engine.brake === true || Number(engine.brake) > .08) && !engine.reverseActive && getSpeed() > 2;
    const reversing = !!engine.reverseActive;
    const r = config.rear;
    const applyRear = (group, color, intensity) => {
      for(const item of group){
        item.point.color.setHex(color); item.point.intensity = intensity; item.point.visible = true;
        item.glow.material.color.setHex(color);
        item.glow.material.opacity = r.enabled && r.glow ? Math.min(1, .16 + intensity * .14 + (r.bloom ? r.bloomIntensity * .42 : 0)) : 0;
        item.glow.scale.setScalar(r.glowSize);
        item.flare.material.color.setHex(color);
        item.flare.material.opacity = r.enabled && r.flare ? Math.min(1, .22 + intensity * .2) : 0;
        item.flare.scale.setScalar(r.flareSize);
      }
    };
    applyRear(rig.rear.position, r.color, r.enabled ? r.baseIntensity : 0);
    applyRear(rig.rear.brake, r.color, r.enabled && braking ? r.brakeIntensity : 0);
    applyRear(rig.rear.reverse, r.reverseColor, r.enabled && reversing ? r.reverseIntensity : 0);
    const auxOn = condition => {
      if(condition === 'always') return true;
      if(condition === 'night') return isNightTime();
      if(condition === 'brake') return braking;
      if(condition === 'reverse') return reversing;
      if(condition === 'left') return keys['a'] || keys['arrowleft'];
      if(condition === 'right') return keys['d'] || keys['arrowright'];
      return false;
    };
    for(let i=0;i<rig.aux.length;i++){
      const item = rig.aux[i], cfg = config.aux[i];
      const on = !!cfg.enabled && auxOn(cfg.condition);
      item.point.color.setHex(cfg.color); item.point.intensity = on ? cfg.intensity : 0; item.point.visible = true;
      item.glow.material.color.setHex(cfg.color); item.glow.material.opacity = on && cfg.glow ? Math.min(1, .2 + cfg.intensity * .22) : 0; item.glow.scale.setScalar(cfg.size);
      item.flare.material.color.setHex(cfg.color); item.flare.material.opacity = on && cfg.flare ? Math.min(1, .35 + cfg.intensity * .18) : 0; item.flare.scale.setScalar(cfg.size);
    }
    updateNeon();
  }

  function setConfig(patch){
    if(!patch) return;
    if(patch.front) Object.assign(config.front, patch.front);
    const onHour = Number(config.front.autoOnHour);
    const offHour = Number(config.front.autoOffHour);
    config.front.autoOnHour = Number.isFinite(onHour) ? Math.max(0, Math.min(24, onHour)) : 18;
    config.front.autoOffHour = Number.isFinite(offHour) ? Math.max(0, Math.min(24, offHour)) : 7;
    if(patch.rear) Object.assign(config.rear, patch.rear);
    if(patch.neon) Object.assign(config.neon, patch.neon);
    if(patch.aux) patch.aux.forEach((v, i) => {
      if(!v) return;
      if(!config.aux[i]) config.aux[i] = defaultAuxLightConfig(i);
      Object.assign(config.aux[i], v);
    });
    if(patch.dummies) Object.assign(config.dummies, patch.dummies);
    ensureAuxLightRigs();
    apply();
    update();
  }

  function addAux(preset){
    const idx = config.aux.length;
    config.aux.push(Object.assign(defaultAuxLightConfig(idx), preset || {}));
    ensureAuxLightRigs();
    apply();
    update();
    return rig.aux[idx] && rig.aux[idx].anchor;
  }

  function rebuildAux(){
    rig.aux.forEach(item => {
      if(!item || !item.anchor) return;
      if(item.anchor.parent) item.anchor.parent.remove(item.anchor);
      item.anchor.traverse(child => {
        if(child.geometry && child.geometry.dispose) child.geometry.dispose();
        if(child.material){
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(material => { if(material && material.dispose) material.dispose(); });
        }
      });
    });
    rig.aux.length = 0;
    ensureAuxLightRigs();
    apply(); update();
  }

  function removeAux(index){
    const i = Number(index) | 0;
    if(i < 0 || i >= config.aux.length) return false;
    config.aux.splice(i, 1); rebuildAux(); return true;
  }

  function duplicateAux(index){
    const i = Number(index) | 0;
    if(i < 0 || i >= config.aux.length) return null;
    return addAux(JSON.parse(JSON.stringify(config.aux[i])));
  }

  function moveAux(index, direction){
    const from = Number(index) | 0, to = from + (Number(direction) < 0 ? -1 : 1);
    if(from < 0 || from >= config.aux.length || to < 0 || to >= config.aux.length) return false;
    const item = config.aux.splice(from, 1)[0]; config.aux.splice(to, 0, item); rebuildAux(); return true;
  }

  function setHighBeams(v){
    highBeams = !!v;
    update();
  }

  return {
    config,
    rig,
    build,
    apply,
    update,
    setConfig,
    addAux,
    removeAux,
    duplicateAux,
    moveAux,
    setHighBeams,
    syncTimeOfDay,
    headlight: () => headlight,
  };
}

window.LK_RUNTIME_PLAYER_LIGHT_RIG = Object.freeze({create});
})();
