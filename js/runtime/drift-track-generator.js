/* =========================================================
   LOT KING - Drift Track generator ("Minami Drift Park")
   Faithful, parametric port of the standalone DriftTrack.js
   mini-game map, rebuilt with the engine THREE (r185) and the
   arcade collider model instead of cannon-es.

   build(THREE, params) returns:
     { group, colliders, spawn, length, points }
   - group     : THREE.Group with every visual (road, curbs, tire
                 walls, portal, grandstand, trees, light poles, cones)
   - colliders : array of local-space box specs {x,y,z,hx,hy,hz,rotY,kind}
                 the scene-store turns into arcade colliders so the
                 walls / cones collide perfectly when driving.
   - spawn     : { position:[x,y,z], yaw } (informational)

   The default parameters reproduce the exact "Minami Drift Park"
   layout; generatePoints(seed) yields brand-new random circuits.
   ========================================================= */
(function(){
'use strict';

// exact control points of the original mini-game map
const DEFAULT_POINTS = [
  [0, 0], [38, 0], [72, -4], [98, -22], [106, -52], [92, -82], [62, -96], [28, -92],
  [8, -70], [-6, -44], [-28, -32], [-58, -46], [-84, -36], [-94, -8], [-80, 18], [-48, 26], [-16, 16],
];

// small, fast, deterministic PRNG so tree scatter is reproducible/editable
function mulberry32(seed){
  let a = (seed >>> 0) || 1;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function defaultParams(){
  return {
    points: DEFAULT_POINTS.map(p => p.slice()),
    tension: 0.6,
    halfW: 5.5,          // semi-larghezza asfalto
    wallGap: 3.2,        // WALL_OFF = halfW + wallGap
    treeSeed: 1,
    treeCount: 70,
    bannerText: 'MINAMI DRIFT PARK',
    props: {
      grass: true, road: true, startLine: true, curbs: true, tireWalls: true,
      tireWallColliders: true, portal: true, grandstand: true, trees: true,
      lightPoles: true, cones: true, coneColliders: true,
    },
  };
}

// brand-new closed circuit from a seed (used by "Genera tracciato")
function generatePoints(seed, opts){
  opts = opts || {};
  const rng = mulberry32((seed >>> 0) || 1);
  const n = opts.count || (10 + Math.floor(rng() * 5)); // 10..14 control points
  const baseR = opts.radius || 92;
  const squash = opts.squash != null ? opts.squash : (0.72 + rng() * 0.24);
  const pts = [];
  for(let i = 0; i < n; i++){
    const a = i / n * Math.PI * 2;
    const r = baseR * (0.6 + rng() * 0.72);
    const jx = (rng() - 0.5) * 20, jz = (rng() - 0.5) * 20;
    pts.push([Math.cos(a) * r + jx, Math.sin(a) * r * squash + jz]);
  }
  return pts;
}

function normalizeParams(params){
  const d = defaultParams();
  const p = params || {};
  const pts = Array.isArray(p.points) && p.points.length >= 4
    ? p.points.map(pt => [Number(pt[0]) || 0, Number(pt[1]) || 0])
    : d.points;
  return {
    points: pts,
    tension: Number.isFinite(Number(p.tension)) ? Number(p.tension) : d.tension,
    halfW: Number.isFinite(Number(p.halfW)) && Number(p.halfW) > 0 ? Number(p.halfW) : d.halfW,
    wallGap: Number.isFinite(Number(p.wallGap)) ? Number(p.wallGap) : d.wallGap,
    treeSeed: (Number(p.treeSeed) >>> 0) || d.treeSeed,
    treeCount: Number.isFinite(Number(p.treeCount)) ? Math.max(0, Math.round(Number(p.treeCount))) : d.treeCount,
    bannerText: p.bannerText != null ? String(p.bannerText) : d.bannerText,
    props: Object.assign({}, d.props, p.props || {}),
  };
}

function build(THREE, params){
  if(!THREE) throw new Error('drift-track: THREE reference missing');
  const P = normalizeParams(params);
  const group = new THREE.Group();
  group.name = 'MinamiDriftPark';
  group.userData.driftTrack = true;
  const colliders = [];
  const up = new THREE.Vector3(0, 1, 0);
  const props = P.props;

  // ---------- layout (curva chiusa) ----------
  const controlPoints = P.points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', P.tension);
  const len = curve.getLength();
  const HALF_W = P.halfW;
  const WALL_OFF = HALF_W + P.wallGap;

  const RING = Math.max(300, Math.round(len / 0.8));
  const centers = [], tangents = [], sides = [];
  for(let i = 0; i < RING; i++){
    const t = i / RING;
    centers.push(curve.getPointAt(t));
    const tan = curve.getTangentAt(t); tan.y = 0; tan.normalize();
    tangents.push(tan);
    sides.push(new THREE.Vector3().crossVectors(up, tan));
  }
  const segLen = len / RING;
  const curv = [];
  for(let i = 0; i < RING; i++){
    const a = tangents[i], b = tangents[(i + 1) % RING];
    curv.push(Math.atan2(a.x * b.z - a.z * b.x, a.dot(b)) / segLen);
  }
  const yawAt = (i) => Math.atan2(tangents[i].x, tangents[i].z);

  // ---------- texture procedurali ----------
  const hasDoc = typeof document !== 'undefined';
  function canvasTex(draw, w, h){
    if(!hasDoc || !THREE.CanvasTexture) return null;
    w = w || 256; h = h || 256;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    if(THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const asphaltTex = canvasTex((g, w, h) => {
    g.fillStyle = '#26262b'; g.fillRect(0, 0, w, h);
    for(let i = 0; i < 1600; i++){
      const v = 130 + Math.random() * 70 | 0;
      g.fillStyle = `rgba(${v},${v},${v},0.07)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    g.fillStyle = '#e6e6e6'; g.fillRect(7, 0, 5, h); g.fillRect(w - 12, 0, 5, h);
  });
  if(asphaltTex) asphaltTex.repeat.set(1, Math.round(len / 10));
  const grassTex = canvasTex((g, w, h) => {
    g.fillStyle = '#37522b'; g.fillRect(0, 0, w, h);
    for(let i = 0; i < 2200; i++){
      g.fillStyle = Math.random() < 0.5 ? 'rgba(70,110,50,0.5)' : 'rgba(40,65,30,0.5)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
  if(grassTex) grassTex.repeat.set(70, 70);
  const checkerTex = canvasTex((g) => {
    for(let y = 0; y < 4; y++) for(let x = 0; x < 16; x++){
      g.fillStyle = (x + y) % 2 ? '#111' : '#eee'; g.fillRect(x * 16, y * 16, 16, 16);
    }
  }, 256, 64);

  // ---------- terreno ----------
  if(props.grass){
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 620),
      new THREE.MeshStandardMaterial({ map: grassTex || null, color: grassTex ? 0xffffff : 0x37522b, roughness: 1 })
    );
    grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true;
    grass.name = 'Grass';
    group.add(grass);
  }

  // ---------- nastro asfalto ----------
  if(props.road){
    const pos = new Float32Array(RING * 2 * 3), uvA = new Float32Array(RING * 2 * 2), idx = [];
    for(let i = 0; i < RING; i++){
      const L = centers[i].clone().addScaledVector(sides[i], HALF_W);
      const R = centers[i].clone().addScaledVector(sides[i], -HALF_W);
      pos.set([L.x, 0.02, L.z, R.x, 0.02, R.z], i * 6);
      const v = i / RING;
      uvA.set([0, v, 1, v], i * 4);
      const j = (i + 1) % RING;
      idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: asphaltTex || null, color: asphaltTex ? 0xffffff : 0x26262b, roughness: 0.95, side: THREE.DoubleSide,
    }));
    road.receiveShadow = true;
    road.name = 'Road';
    road.userData.driveSurface = true;
    group.add(road);
  }

  // linea partenza a scacchi
  if(props.startLine){
    const sl = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W * 2, 2.2),
      new THREE.MeshStandardMaterial({ map: checkerTex || null, color: checkerTex ? 0xffffff : 0xdddddd, roughness: 0.9 })
    );
    sl.rotation.x = -Math.PI / 2; sl.rotation.z = -yawAt(0);
    sl.position.copy(centers[0]).setY(0.035);
    sl.name = 'StartLine';
    group.add(sl);
  }

  // ---------- cordoli rosso/bianco nelle curve ----------
  if(props.curbs){
    const spots = [];
    for(let i = 0; i < RING; i += 2) if(Math.abs(curv[i]) > 0.022) spots.push(i);
    if(spots.length){
      const geo = new THREE.BoxGeometry(0.9, 0.13, segLen * 2.2);
      const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), spots.length * 2);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      const red = new THREE.Color(0xd23b2f), white = new THREE.Color(0xf2f2f2);
      spots.forEach((i, k) => {
        q.setFromEuler(e.set(0, yawAt(i), 0));
        for(const s of [1, -1]){
          const p = centers[i].clone().addScaledVector(sides[i], s * (HALF_W + 0.45));
          m.compose(new THREE.Vector3(p.x, 0.06, p.z), q, new THREE.Vector3(1, 1, 1));
          const id = k * 2 + (s > 0 ? 0 : 1);
          inst.setMatrixAt(id, m);
          inst.setColorAt(id, (i >> 1) % 2 ? red : white);
        }
      });
      if(inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.receiveShadow = true;
      inst.name = 'Curbs';
      group.add(inst);
    }
  }

  // ---------- muri di gomme (visual) + collisioni ----------
  {
    const WSEG = Math.round(len / 3.2), wLen = len / WSEG;
    for(let j = 0; j < WSEG; j++){
      const t = (j + 0.5) / WSEG;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t); tan.y = 0; tan.normalize();
      const side = new THREE.Vector3().crossVectors(up, tan);
      const yaw = Math.atan2(tan.x, tan.z);
      for(const s of [1, -1]){
        const wp = p.clone().addScaledVector(side, s * WALL_OFF);
        if(props.tireWallColliders){
          colliders.push({
            kind: 'wall',
            x: wp.x, y: 0.95, z: wp.z,
            hx: 0.38, hy: 0.95, hz: wLen / 2 + 0.25,
            rotY: yaw,
          });
        }
      }
    }
    // gomme istanziate lungo i muri
    if(props.tireWalls){
      const TSEG = Math.round(len / 0.82);
      const tireGeo = new THREE.TorusGeometry(0.36, 0.17, 6, 10); tireGeo.rotateX(Math.PI / 2);
      const inst = new THREE.InstancedMesh(tireGeo, new THREE.MeshStandardMaterial({ roughness: 0.95 }), TSEG * 4);
      const m = new THREE.Matrix4(), black = new THREE.Color(0x161616),
        red = new THREE.Color(0xb52a2a), white = new THREE.Color(0xd8d8d8);
      let id = 0;
      for(let j = 0; j < TSEG; j++){
        const t = j / TSEG;
        const p = curve.getPointAt(t);
        const tan = curve.getTangentAt(t); tan.y = 0; tan.normalize();
        const side = new THREE.Vector3().crossVectors(up, tan);
        for(const s of [1, -1]) for(const y of [0.18, 0.53]){
          const wp = p.clone().addScaledVector(side, s * WALL_OFF);
          m.makeTranslation(wp.x, y, wp.z);
          inst.setMatrixAt(id, m);
          inst.setColorAt(id, j % 7 === 0 ? red : j % 7 === 3 ? white : black);
          id++;
        }
      }
      if(inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.castShadow = true;
      inst.name = 'TireWalls';
      group.add(inst);
    }
  }

  // ---------- portale di partenza ----------
  if(props.portal){
    const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.6 });
    const bannerTex = canvasTex((g, w, h) => {
      g.fillStyle = '#101418'; g.fillRect(0, 0, w, h);
      for(let x = 0; x < 32; x++){ g.fillStyle = x % 2 ? '#eee' : '#111'; g.fillRect(x * 16, 0, 16, 12); g.fillRect(x * 16, h - 12, 16, 12); }
      g.fillStyle = '#ffd23f'; g.font = 'bold 52px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(P.bannerText, w / 2, h / 2);
    }, 512, 128);
    const span = HALF_W + 1.4;
    const portal = new THREE.Group(); portal.name = 'Portal';
    for(const s of [1, -1]){
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.6, 0.35), postMat);
      const p = centers[0].clone().addScaledVector(sides[0], s * span);
      post.position.set(p.x, 2.8, p.z); post.castShadow = true;
      portal.add(post);
    }
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 2, 1.6),
      new THREE.MeshStandardMaterial({ map: bannerTex || null, color: bannerTex ? 0xffffff : 0x101418, side: THREE.DoubleSide })
    );
    banner.position.copy(centers[0]).setY(4.9);
    banner.rotation.y = yawAt(0) + Math.PI / 2;
    portal.add(banner);
    group.add(portal);
  }

  // ---------- tribuna sul rettilineo ----------
  if(props.grandstand){
    const stand = new THREE.Group();
    stand.name = 'Grandstand';
    for(let s = 0; s < 3; s++){
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(26, 0.8 + s * 0.8, 1.6),
        new THREE.MeshStandardMaterial({ color: s % 2 ? 0x5f6a75 : 0x6d7883, roughness: 0.8 })
      );
      step.position.set(0, (0.8 + s * 0.8) / 2, -s * 1.6);
      step.castShadow = step.receiveShadow = true;
      stand.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(27, 0.15, 6.2),
      new THREE.MeshStandardMaterial({ color: 0xc23b30, roughness: 0.6 }));
    roof.position.set(0, 4.4, -1.6); roof.castShadow = true;
    stand.add(roof);
    for(const x of [-12.5, 12.5]) for(const z of [0.6, -3.8]){
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4), new THREE.MeshStandardMaterial({ color: 0x888888 }));
      pole.position.set(x, 2.2, z); stand.add(pole);
    }
    stand.position.set(20, 0, -13.5);
    group.add(stand);
  }

  // ---------- alberi ----------
  if(props.trees && P.treeCount > 0){
    const NTREE = P.treeCount;
    const rng = mulberry32(P.treeSeed);
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.4);
    const crownGeo = new THREE.IcosahedronGeometry(2, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 }), NTREE);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ roughness: 1 }), NTREE);
    const m = new THREE.Matrix4(), col = new THREE.Color();
    const coarse = centers.filter((_, i) => i % 6 === 0);
    let placed = 0, guard = 0;
    while(placed < NTREE && guard++ < 4000){
      const x = -150 + rng() * 300, z = -150 + rng() * 200;
      let d2 = 1e9;
      for(const c of coarse) d2 = Math.min(d2, (c.x - x) ** 2 + (c.z - z) ** 2);
      if(d2 < (WALL_OFF + 7) ** 2) continue;
      const sc = 0.8 + rng() * 0.7;
      m.makeScale(sc, sc, sc); m.setPosition(x, 1.2 * sc, z);
      trunks.setMatrixAt(placed, m);
      m.makeScale(sc, sc * (1.1 + rng() * 0.4), sc); m.setPosition(x, (2.4 + 1.6) * sc, z);
      crowns.setMatrixAt(placed, m);
      crowns.setColorAt(placed, col.setHSL(0.29 + rng() * 0.06, 0.5, 0.28 + rng() * 0.1));
      placed++;
    }
    trunks.count = crowns.count = placed;
    if(crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    trunks.castShadow = crowns.castShadow = true;
    trunks.name = 'TreeTrunks'; crowns.name = 'TreeCrowns';
    group.add(trunks, crowns);
  }

  // ---------- pali luce ----------
  if(props.lightPoles){
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a9099, roughness: 0.5, metalness: 0.5 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6cc, emissive: 0xfff0b0, emissiveIntensity: 1.4 });
    const poles = new THREE.Group(); poles.name = 'LightPoles';
    for(let k = 0; k < 6; k++){
      const i = Math.floor(k / 6 * RING);
      const p = centers[i].clone().addScaledVector(sides[i], WALL_OFF + 2.2);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.5), mat);
      pole.position.set(p.x, 3.75, p.z); pole.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), lampMat);
      lamp.position.set(p.x, 7.4, p.z);
      poles.add(pole, lamp);
    }
    group.add(poles);
  }

  // ---------- coni (slalom + apex) ----------
  if(props.cones){
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xe8641e, roughness: 0.7 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.7 });
    const conesGroup = new THREE.Group(); conesGroup.name = 'Cones';
    const addCone = (x, z) => {
      const mesh = new THREE.Group();
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), coneMat);
      c.position.y = 0.3; c.castShadow = true;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.175, 0.12, 12), bandMat);
      band.position.y = 0.32;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.42), coneMat);
      base.position.y = 0.025;
      mesh.add(c, band, base);
      mesh.position.set(x, 0, z);
      conesGroup.add(mesh);
      if(props.coneColliders){
        colliders.push({ kind: 'cone', x, y: 0.3, z, hx: 0.16, hy: 0.3, hz: 0.16, rotY: 0 });
      }
    };
    // slalom sul rettilineo di partenza
    for(let k = 0; k < 6; k++){
      const i = Math.round((0.045 + k * 0.014) * RING);
      const p = centers[i].clone().addScaledVector(sides[i], (k % 2 ? 1 : -1) * 2.2);
      addCone(p.x, p.z);
    }
    // coppie di coni ai punti di corda (curve più strette)
    const apexes = [];
    for(let i = 6; i < RING - 6; i++){
      if(Math.abs(curv[i]) > 0.033 && Math.abs(curv[i]) >= Math.abs(curv[i - 6]) && Math.abs(curv[i]) >= Math.abs(curv[i + 6])){
        if(!apexes.some((a) => Math.abs(a - i) < RING * 0.06)) apexes.push(i);
      }
    }
    for(const i of apexes.slice(0, 4)) for(const s of [1, -1]){
      const p = centers[i].clone().addScaledVector(sides[i], s * (HALF_W + 1.1));
      addCone(p.x, p.z);
    }
    group.add(conesGroup);
  }

  return {
    group,
    colliders,
    length: Math.round(len),
    spawn: { position: [centers[2].x, 0.9, centers[2].z], yaw: yawAt(2) },
    points: P.points.map(p => p.slice()),
  };
}

window.LK_RUNTIME_DRIFT_TRACK = Object.freeze({
  DEFAULT_POINTS,
  defaultParams,
  normalizeParams,
  generatePoints,
  build,
});
})();
