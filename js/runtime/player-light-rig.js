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
    glow:true, bloom:true, bloomIntensity:.55, flare:true, flareIntensity:.24, flareBloomIntensity:.19, flareOcclusion:true, glowSize:.62, flareSize:.42},
  rear: {enabled:true, color:0xc91410, brakeColor:0xff2418, baseIntensity:.45, brakeIntensity:2.8, reverseColor:0xf3f4ff, reverseIntensity:2.2,
    glow:true, bloom:true, bloomIntensity:.55, flare:true, flareIntensity:.16, flareBloomIntensity:.12, flareOcclusion:true, glowSize:.55, flareSize:.34},
  neon: {enabled:false, dummyVisible:true, layout:'all', colorA:0x19f7ff, colorB:0xff3df2, intensity:1.25, spill:2.8, shadows:false, animation:'pulse', speed:1.0},
  aux: [
    {enabled:false, condition:'always', color:0xffd166, intensity:1.0, glow:true, flare:false, size:.42},
    {enabled:false, condition:'brake', color:0xff3030, intensity:1.4, glow:true, flare:false, size:.42},
  ],
  dummies: {visible:false},
});
// Vehicle authoring keeps its compact legacy 0-6 scale; Three r185 expects
// spot intensity in candela, so convert only at the renderer boundary.
const PUNCTUAL_INTENSITY_TO_CANDELA = 400;
// RectAreaLight uses luminance rather than the compact 0-4 authoring scale.
const NEON_INTENSITY_TO_LUMINANCE = 8;

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
  const anchorMatrix = new THREE.Matrix4();
  const inverseCarMatrix = new THREE.Matrix4();
  let highBeams = false;
  let headlight = null;
  let built = false;

  function configureCinematicFlare(light, enabled, intensity, size, bloomIntensity, occlusion){
    if(!light) return;
    const flare = light.userData.cinematicLensFlare || (light.userData.cinematicLensFlare = {});
    flare.enabled = enabled === true;
    const authoredIntensity = Number(intensity);
    const authoredSize = Number(size);
    flare.intensity = Math.max(0, Math.min(2, Number.isFinite(authoredIntensity) ? authoredIntensity : .65));
    flare.size = Math.max(.2, Math.min(3, Number.isFinite(authoredSize) ? authoredSize : .7));
    const authoredBloom = Number(bloomIntensity);
    flare.bloomIntensity = Math.max(0, Math.min(3, Number.isFinite(authoredBloom) ? authoredBloom : flare.intensity * .78));
    flare.occlusion = occlusion !== false;
  }

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
    const hour = sky && sky.getClockHour
      ? sky.getClockHour()
      : ((((Number(t) || 0) % 1) + 1) % 1 * 24 + 6) % 24;
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
    tx.colorSpace = THREE.SRGBColorSpace;
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

  function pinEmitterToAnchor(item){
    if(!item) return;
    [item.light, item.point, item.glow, item.flare].forEach(node => {
      if(node && node.position) node.position.set(0, 0, 0);
    });
  }

  function syncDummyColor(anchor, color){
    if(!anchor) return;
    anchor.traverse(node => {
      if(node.userData && node.userData.helperOnly && node.material && node.material.color) node.material.color.setHex(color);
    });
  }

  function syncAnchorTransforms(resolveSource){
    if(typeof resolveSource !== 'function' || !car) return;
    const bindings = [];
    rig.front.forEach((item, index) => bindings.push(['player_front_light_' + index, item]));
    Object.keys(rig.rear).forEach(role => rig.rear[role].forEach((item, index) => bindings.push(['player_rear_' + role + '_' + index, item])));
    rig.aux.forEach((item, index) => bindings.push(['player_aux_light_' + index, item]));
    rig.neon.forEach(item => bindings.push(['player_neon_' + item.side, item]));
    car.updateWorldMatrix(true, false);
    inverseCarMatrix.copy(car.matrixWorld).invert();
    bindings.forEach(binding => {
      const source = resolveSource(binding[0]);
      const item = binding[1];
      const anchor = item && item.anchor;
      if(!source || !anchor || source === anchor) return;
      source.updateWorldMatrix(true, false);
      anchorMatrix.multiplyMatrices(inverseCarMatrix, source.matrixWorld);
      anchorMatrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
      anchor.updateMatrixWorld(true);
      pinEmitterToAnchor(item);
    });
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
    point.position.set(0,0,0); glow.position.set(0,0,0); flare.position.set(0,0,0);
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
      const sp = new THREE.SpotLight(config.front.color, config.front.intensity * PUNCTUAL_INTENSITY_TO_CANDELA, config.front.distance, config.front.angle, config.front.penumbra, 2);
      const tg = new THREE.Object3D(); tg.position.set(x * -.35, -.12, 14);
      anchor.add(sp); anchor.add(tg); sp.target = tg;
      const glow = makeLightSprite(config.front.color, config.front.glowSize, .7); glow.position.set(0,0,0); anchor.add(glow);
      const flare = makeLightSprite(config.front.color, config.front.flareSize, .95); flare.position.set(0,0,0); anchor.add(flare);
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
        point.position.set(0,0,0); glow.position.set(0,0,0); flare.position.set(0,0,0);
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
      // A vehicle neon is a luminous strip, not a punctual/spot source. The
      // area plane is local XY; rotate its +Z emission normal toward -Y so it
      // lights the road beneath the car.
      const glow = typeof THREE.RectAreaLight === 'function'
        ? new THREE.RectAreaLight(config.neon.colorA, 0, sx, sz)
        : new THREE.PointLight(config.neon.colorA, 0, 6, 2);
      if(glow.isRectAreaLight) glow.rotation.x = Math.PI / 2;
      glow.userData.vehicleNeonAreaLight = !!glow.isRectAreaLight;
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
      pinEmitterToAnchor(item);
      syncDummyColor(item.anchor, f.color);
      sp.color.setHex(f.color);
      const frontActive = !!f.enabled && i < Math.max(1, Math.min(2, f.count)) && (highBeams || !f.auto || isNightTime());
      sp.intensity = frontActive ? f.intensity * PUNCTUAL_INTENSITY_TO_CANDELA * (1 + highBeamBoost * 1.65) : 0;
      sp.distance = f.distance * (1 + highBeamBoost * .55);
      sp.angle = Math.min(1.1, f.angle * (1 + highBeamBoost * .58));
      sp.penumbra = Math.min(1, f.penumbra + highBeamBoost * .18);
      sp.visible = true;
      item.glow.material.color.setHex(f.color);
      item.glow.material.opacity = frontActive && f.glow ? Math.min(1, (.42 + (f.bloom ? f.bloomIntensity * .45 : 0)) * (1 + highBeamBoost * .55)) : 0;
      // High beams must never alter the authored marker/fixture footprint.
      // Changing child sprite scale also changes the selected anchor bounds and
      // made its editor dummy appear to move even though its origin was fixed.
      item.glow.scale.setScalar(f.glowSize);
      item.flare.material.color.setHex(f.color);
      item.flare.material.opacity = 0;
      item.flare.scale.setScalar(f.flareSize);
      // One authored value drives both members of the front pair. Headlight
      // candela and high-beam boost no longer alter photographic flare power.
      configureCinematicFlare(sp, !!f.flare, f.flareIntensity == null ? .24 : f.flareIntensity, f.flareSize * 1.55, f.flareBloomIntensity, f.flareOcclusion);
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
      if(item.glow.isRectAreaLight){
        const coverage = Math.max(.4, Math.min(8, Number(n.spill) || 2.8));
        const areaScale = .65 + coverage * .125; // 2.8 keeps the strip's real size.
        item.glow.width = item.strip.geometry.parameters.width * areaScale;
        item.glow.height = item.strip.geometry.parameters.depth * areaScale;
        item.glow.intensity = k * n.intensity * NEON_INTENSITY_TO_LUMINANCE;
      } else {
        // Compatibility fallback for unusual Three builds without RectAreaLight.
        item.glow.intensity = k * n.intensity;
        item.glow.distance = n.spill == null ? 2.8 : n.spill;
        item.glow.decay = 2.8;
      }
      item.glow.castShadow = false; // RectAreaLight does not support shadow maps.
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
    const applyRear = (group, color, intensity, cinematicPair) => {
      for(const item of group){
        pinEmitterToAnchor(item);
        syncDummyColor(item.anchor, color);
        item.point.color.setHex(color); item.point.intensity = intensity; item.point.visible = true;
        item.glow.material.color.setHex(color);
        item.glow.material.opacity = r.enabled && r.glow ? Math.min(1, .16 + intensity * .14 + (r.bloom ? r.bloomIntensity * .42 : 0)) : 0;
        item.glow.scale.setScalar(r.glowSize);
        item.flare.material.color.setHex(color);
        item.flare.material.opacity = 0;
        item.flare.scale.setScalar(r.flareSize);
        configureCinematicFlare(item.point, !!r.flare && cinematicPair === true, r.flareIntensity == null ? .16 : r.flareIntensity, r.flareSize * 1.55, r.flareBloomIntensity, r.flareOcclusion);
      }
    };
    // Only the left/right position pair owns the rear optical flare. Brake and
    // reverse sources retain their light/glow without stacking extra passes.
    applyRear(rig.rear.position, r.color, r.enabled ? r.baseIntensity : 0, true);
    applyRear(rig.rear.brake, r.brakeColor == null ? r.color : r.brakeColor, r.enabled && braking ? r.brakeIntensity : 0, false);
    applyRear(rig.rear.reverse, r.reverseColor, r.enabled && reversing ? r.reverseIntensity : 0, false);
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
      pinEmitterToAnchor(item);
      syncDummyColor(item.anchor, cfg.color);
      const on = !!cfg.enabled && auxOn(cfg.condition);
      item.point.color.setHex(cfg.color); item.point.intensity = on ? cfg.intensity : 0; item.point.visible = true;
      item.glow.material.color.setHex(cfg.color); item.glow.material.opacity = on && cfg.glow ? Math.min(1, .2 + cfg.intensity * .22) : 0; item.glow.scale.setScalar(cfg.size);
      item.flare.material.color.setHex(cfg.color); item.flare.material.opacity = 0; item.flare.scale.setScalar(cfg.size);
      configureCinematicFlare(item.point, !!cfg.flare, .4 + cfg.intensity * .2, cfg.size * 1.45);
    }
    updateNeon();
  }

  function setConfig(patch){
    if(!patch) return;
    if(patch.front) Object.assign(config.front, patch.front);
    const onHour = Number(config.front.autoOnHour);
    const offHour = Number(config.front.autoOffHour);
    const frontFlareIntensity = Number(config.front.flareIntensity);
    const frontFlareBloomIntensity = Number(config.front.flareBloomIntensity);
    config.front.autoOnHour = Number.isFinite(onHour) ? ((onHour % 24) + 24) % 24 : 18;
    config.front.autoOffHour = Number.isFinite(offHour) ? ((offHour % 24) + 24) % 24 : 7;
    config.front.flareIntensity = Number.isFinite(frontFlareIntensity) ? Math.max(0, Math.min(2, frontFlareIntensity)) : .24;
    config.front.flareBloomIntensity = Number.isFinite(frontFlareBloomIntensity) ? Math.max(0, Math.min(3, frontFlareBloomIntensity)) : config.front.flareIntensity * .78;
    if(patch.rear) Object.assign(config.rear, patch.rear);
    const rearFlareIntensity = Number(config.rear.flareIntensity);
    const rearFlareBloomIntensity = Number(config.rear.flareBloomIntensity);
    config.rear.flareIntensity = Number.isFinite(rearFlareIntensity) ? Math.max(0, Math.min(2, rearFlareIntensity)) : .16;
    config.rear.flareBloomIntensity = Number.isFinite(rearFlareBloomIntensity) ? Math.max(0, Math.min(3, rearFlareBloomIntensity)) : config.rear.flareIntensity * .78;
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
    syncAnchorTransforms,
    syncTimeOfDay,
    headlight: () => headlight,
  };
}

window.LK_RUNTIME_PLAYER_LIGHT_RIG = Object.freeze({create});
})();
