/* =========================================================
   LOT KING — Visible rounds (tracers and impacts)

   A hitscan resolves the whole shot in one frame: the bullet has already
   arrived before anything is drawn. That is correct for gameplay and wrong for
   the eye, which needs to SEE the round leave the barrel and reach the target.

   This module draws that round. It is purely cosmetic and it knows it: the hit
   was decided by `first-person-controller.js` before this file ever sees the
   event, so nothing here can change where a bullet lands. The streak flies from
   the muzzle to the point the shot actually reached, at whatever visual speed
   the weapon declares.

   WHAT A TRACER LOOKS LIKE IS THE CALIBRE, so its shape is weapon data
   (`weapon.tracer`), not an effects setting:

     speed     metres per second the streak travels toward the impact
     length    how long the streak is
     width     how thick
     color     numeric, like every other colour in the store
     everyNth  1 = every round leaves a streak, 3 = the classic ratio
     fade      seconds the impact flash lingers
     impact    whether a hit leaves a flash at all
     decal     whether a hit leaves a bullet hole, and for how long

   PERFORMANCE IS A FIXED COST, NOT A GROWING ONE. The pool is allocated once
   and never grows: the oldest streak is recycled when the pool is full, so a
   minute of sustained automatic fire costs exactly what the first shot did.
   Geometry is shared by every streak and materials are cached per colour, so a
   project with five weapons holds five materials, not five hundred.

   Removing this script removes the visible rounds and nothing else.
   ========================================================= */
(function(){
'use strict';

const MAX_TRACERS = 64;      // sustained automatic fire never exceeds this
const MAX_IMPACTS = 32;
// Bullet holes are the one thing here that is meant to LINGER, so they are the
// one thing that could accumulate without a hard cap. Sixty-four is generous on
// screen and still a single fixed allocation.
const MAX_DECALS = 64;
const DECAL_SECONDS = 14;

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

function create(GAME){
  const THREE = typeof window !== 'undefined' ? window.THREE : null;
  const tracers = [];
  const impacts = [];
  const decals = [];
  const materials = new Map();       // colour → shared material
  let root = null;
  let tracerGeometry = null;
  let impactGeometry = null;
  let cursor = 0;
  let impactCursor = 0;
  let decalCursor = 0;
  let decalGeometry = null;
  let decalMaterial = null;
  let shotCount = 0;

  const from = THREE ? new THREE.Vector3() : null;
  const to = THREE ? new THREE.Vector3() : null;
  const travel = THREE ? new THREE.Vector3() : null;
  const head = THREE ? new THREE.Vector3() : null;
  // Hoisted: the update loop must not allocate, and setFromUnitVectors needs a
  // reference axis every single frame for every live streak.
  const AXIS = THREE ? new THREE.Vector3(0, 0, 1) : null;
  const decalLook = THREE ? new THREE.Vector3() : null;

  function scene(){ return GAME && GAME.core && GAME.core.scene || null; }

  // Runtime-only: never saved, never exported, never picked in the editor, but
  // it must render during play — which is what `runtimeVisual` is for.
  function markRuntimeOnly(node){
    node.userData.nonExportable = true;
    node.userData.runtimeVisual = true;
    node.frustumCulled = false;
    return node;
  }

  function materialFor(color){
    const key = Math.round(finite(color, 0xffd9a0));
    let material = materials.get(key);
    if(material) return material;
    material = new THREE.MeshBasicMaterial({
      color:key, transparent:true, opacity:.9,
      depthWrite:false, toneMapped:false, blending:THREE.AdditiveBlending,
    });
    materials.set(key, material);
    return material;
  }

  function ensurePool(){
    if(root || !THREE) return root;
    root = markRuntimeOnly(new THREE.Group());
    root.name = 'Weapon Tracers';
    // One unit long along +Z and one unit wide, scaled per shot. Sharing the
    // geometry is what keeps a full pool to a single buffer upload.
    tracerGeometry = new THREE.BoxGeometry(1, 1, 1);
    impactGeometry = new THREE.SphereGeometry(1, 6, 4);
    // One shared circle and one shared material for every hole in the level.
    decalGeometry = new THREE.CircleGeometry(1, 10);
    decalMaterial = new THREE.MeshBasicMaterial({
      color:0x14161a, transparent:true, opacity:.85,
      depthWrite:false, toneMapped:false,
      // Lifted off the surface by polygon offset rather than by a position
      // nudge, so a hole never floats on a wall seen from an angle.
      polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4,
    });
    const target = scene();
    if(target) target.add(root);
    return root;
  }

  function takeTracer(color){
    ensurePool();
    if(!root) return null;
    let entry;
    if(tracers.length < MAX_TRACERS){
      const mesh = markRuntimeOnly(new THREE.Mesh(tracerGeometry, materialFor(color)));
      mesh.renderOrder = 950;
      mesh.visible = false;
      root.add(mesh);
      entry = {mesh, life:0};
      tracers.push(entry);
    } else {
      // Pool full: the oldest streak is the one that has been alive longest, and
      // recycling it is what makes the cost flat instead of unbounded.
      entry = tracers[cursor % tracers.length];
      cursor++;
    }
    entry.mesh.material = materialFor(color);
    return entry;
  }

  function takeImpact(color){
    ensurePool();
    if(!root) return null;
    let entry;
    if(impacts.length < MAX_IMPACTS){
      const mesh = markRuntimeOnly(new THREE.Mesh(impactGeometry, materialFor(color)));
      mesh.renderOrder = 951;
      mesh.visible = false;
      root.add(mesh);
      entry = {mesh, life:0, total:.1};
      impacts.push(entry);
    } else {
      entry = impacts[impactCursor % impacts.length];
      impactCursor++;
    }
    entry.mesh.material = materialFor(color);
    return entry;
  }

  // A bullet hole. It needs the surface normal to lie flat, which is why the
  // hitscan reports one: orienting from the shot direction instead puts the
  // hole visibly askew on anything not hit dead on.
  function addDecal(point, normal, seconds){
    ensurePool();
    if(!root || !normal) return null;
    let entry;
    if(decals.length < MAX_DECALS){
      const mesh = markRuntimeOnly(new THREE.Mesh(decalGeometry, decalMaterial));
      mesh.renderOrder = 949;
      mesh.visible = false;
      root.add(mesh);
      entry = {mesh, life:0, total:DECAL_SECONDS};
      decals.push(entry);
    } else {
      // The oldest hole is reused, so a long firefight replaces holes rather
      // than adding to them.
      entry = decals[decalCursor % decals.length];
      decalCursor++;
    }
    entry.mesh.position.set(point.x, point.y, point.z);
    decalLook.set(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    entry.mesh.lookAt(decalLook);
    entry.size = .035 + Math.random() * .02;
    entry.mesh.scale.setScalar(entry.size);
    entry.mesh.material = decalMaterial;
    entry.total = Math.max(.5, finite(seconds, DECAL_SECONDS));
    entry.life = entry.total;
    entry.mesh.visible = true;
    return entry;
  }

  // --- firing --------------------------------------------------------------

  function onFired(detail){
    if(!THREE || !detail || !detail.origin || !Array.isArray(detail.shots)) return 0;
    const tracer = detail.tracer;
    if(!tracer || tracer.enabled === false) return 0;
    shotCount++;
    if(shotCount % Math.max(1, tracer.everyNth) !== 0) return 0;

    let drawn = 0;
    detail.shots.forEach(shot => {
      const end = shot.end || shot.point;
      if(!end) return;
      const entry = takeTracer(tracer.color);
      if(!entry) return;
      from.set(detail.origin.x, detail.origin.y, detail.origin.z);
      to.set(end.x, end.y, end.z);
      travel.copy(to).sub(from);
      const distance = travel.length();
      if(distance < .05) return;
      entry.from = {x:from.x, y:from.y, z:from.z};
      entry.dir = {x:travel.x / distance, y:travel.y / distance, z:travel.z / distance};
      entry.distance = distance;
      entry.travelled = 0;
      entry.speed = tracer.speed;
      entry.length = Math.min(tracer.length, distance);
      entry.life = 0;
      entry.mesh.scale.set(tracer.width, tracer.width, entry.length);
      entry.mesh.material.opacity = .9;
      entry.mesh.visible = true;
      drawn++;
    });
    return drawn;
  }

  function onHit(detail){
    if(!THREE || !detail || !detail.point) return false;
    const tracer = detail.tracer || null;
    const color = tracer ? tracer.color : 0xffd9a0;
    if(tracer && tracer.impact === false) return false;
    const entry = takeImpact(color);
    if(!entry) return false;
    entry.mesh.position.set(detail.point.x, detail.point.y, detail.point.z);
    entry.mesh.scale.setScalar(.06);
    entry.mesh.material.opacity = .85;
    entry.mesh.visible = true;
    entry.life = tracer ? tracer.fade : .06;
    entry.total = entry.life;
    // The flash is gone in a frame or two; the hole stays. A hit on something
    // with a health pool leaves no hole — a body is not masonry.
    if((!tracer || tracer.decal !== false) && !detail.holder) addDecal(detail.point, detail.normal, tracer && tracer.decalSeconds);
    return true;
  }

  // --- frame ---------------------------------------------------------------

  function update(dt){
    const h = clamp(finite(dt, .016), .0001, .1);
    for(let i = 0; i < tracers.length; i++){
      const entry = tracers[i];
      if(!entry.mesh.visible) continue;
      entry.travelled += entry.speed * h;
      const reached = entry.travelled >= entry.distance;
      // The streak is a segment behind the nose of the round, clipped so it
      // never pokes out of the muzzle before the shot or past the impact.
      const nose = Math.min(entry.travelled, entry.distance);
      const tail = Math.max(0, nose - entry.length);
      const span = nose - tail;
      if(span <= .01 || (reached && entry.travelled > entry.distance + entry.length)){
        entry.mesh.visible = false;
        continue;
      }
      head.set(
        entry.from.x + entry.dir.x * (tail + span / 2),
        entry.from.y + entry.dir.y * (tail + span / 2),
        entry.from.z + entry.dir.z * (tail + span / 2));
      entry.mesh.position.copy(head);
      travel.set(entry.dir.x, entry.dir.y, entry.dir.z);
      entry.mesh.quaternion.setFromUnitVectors(AXIS, travel);
      entry.mesh.scale.z = span;
      // Fade only once the round has arrived, so the streak stays solid in
      // flight and does not blink out mid-air.
      if(reached) entry.mesh.material.opacity = Math.max(0, .9 * (1 - (entry.travelled - entry.distance) / Math.max(.01, entry.length)));
    }
    for(let i = 0; i < impacts.length; i++){
      const entry = impacts[i];
      if(!entry.mesh.visible) continue;
      entry.life -= h;
      const t = clamp(entry.life / Math.max(.01, entry.total), 0, 1);
      entry.mesh.scale.setScalar(.06 + (1 - t) * .1);
      entry.mesh.material.opacity = .85 * t;
      if(entry.life <= 0) entry.mesh.visible = false;
    }
    // Holes are all one shared material, which is the point: sixty-four holes
    // cost one material, not sixty-four. That rules out fading them by opacity
    // individually, so they SHRINK away over their last second instead — same
    // read, no hard pop, and still one material.
    for(let i = 0; i < decals.length; i++){
      const entry = decals[i];
      if(!entry.mesh.visible) continue;
      entry.life -= h;
      if(entry.life <= 0){ entry.mesh.visible = false; continue; }
      if(entry.life < 1) entry.mesh.scale.setScalar(entry.size * Math.max(.05, entry.life));
    }
    return true;
  }

  // The pool is built and drawn once before play so its shader compiles during
  // the benchmark rather than on the first shot fired in anger.
  function warmup(){
    ensurePool();
    if(!root) return {objects:[], dispose(){}};
    const entry = takeTracer(0xffd9a0);
    const flash = takeImpact(0xffd9a0);
    if(entry){ entry.mesh.visible = true; entry.mesh.scale.set(.02, .02, 1); }
    if(flash){ flash.mesh.visible = true; flash.life = .001; flash.total = .1; }
    return {
      objects:[entry && entry.mesh, flash && flash.mesh].filter(Boolean),
      dispose(){
        if(entry) entry.mesh.visible = false;
        if(flash) flash.mesh.visible = false;
      },
    };
  }

  function onPawnEvent(event){
    const detail = event && event.detail || {};
    if(detail.type === 'OnWeaponFired') onFired(detail);
    else if(detail.type === 'OnWeaponHit') onHit(detail);
  }
  if(typeof window !== 'undefined' && window.addEventListener) window.addEventListener('lk-pawn-event', onPawnEvent);

  function dispose(){
    if(typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('lk-pawn-event', onPawnEvent);
    if(root && root.parent) root.parent.remove(root);
    if(tracerGeometry) tracerGeometry.dispose();
    if(impactGeometry) impactGeometry.dispose();
    materials.forEach(material => material.dispose());
    materials.clear();
    if(decalGeometry) decalGeometry.dispose();
    if(decalMaterial) decalMaterial.dispose();
    tracers.length = 0;
    impacts.length = 0;
    decals.length = 0;
    root = null;
  }

  return Object.freeze({
    MAX_TRACERS,
    MAX_IMPACTS,
    update,
    warmup,
    dispose,
    addDecal,
    stats:() => ({tracers:tracers.length, impacts:impacts.length, decals:decals.length, materials:materials.size}),
  });
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.weaponTracers) return GAME.systems.weaponTracers;
  GAME.systems.weaponTracers = create(GAME);
  return GAME.systems.weaponTracers;
}

window.LK_RUNTIME_WEAPON_TRACERS = Object.freeze({MAX_TRACERS, MAX_IMPACTS, create, install});
})();
