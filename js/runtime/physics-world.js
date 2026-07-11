/* =========================================================
   LOT KING - Cannon physics world adapter
   Owns world creation, static collider rebuild and the raycast-vehicle
   player chassis (Sketchbook-style per-wheel suspension).
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts = options || {};
  const CANNONRef = opts.CANNONRef;
  const player = opts.playerState;
  const playerCollision = opts.playerCollision || {};
  const colliders = opts.colliders || {};
  const worldState = opts.worldState;
  const wheelLayout = opts.wheelLayout || [
    {x: -.92, z: 1.35, front: true}, {x: .92, z: 1.35, front: true},
    {x: -.92, z: -1.35, front: false}, {x: .92, z: -1.35, front: false},
  ];
  // Sketchbook-informed raycast suspension, adapted to a 1200 kg chassis
  const suspension = Object.assign({
    stiffness: 32, restLength: .34, travel: .28, radius: .38,
    compression: 4.4, relaxation: 2.6, maxForce: 250000, rollInfluence: .22,
  }, opts.suspension || {});
  const state = {
    available: !!CANNONRef,
    active: false,
    world: null,
    carBody: null,
    vehicle: null,
    carMaterial: null,
    groundMaterial: null,
    groundBody: null,
    surfaceWorldCollision: true,
    staticBodies: [],
    mass: 1200,
    staticsSignature: '',
    lastImpact: 0,
    suspension,
  };

  function cannonVec(x, y, z){ return new CANNONRef.Vec3(x, y, z); }
  function bodyBaseY(){ return playerCollision.bodyY == null ? .55 : playerCollision.bodyY; }

  function colliderSignature(){
    return worldState.colliderSignature() + '|surfaceWorld:' + (state.surfaceWorldCollision ? '1' : '0');
  }

  function ensureGroundBody(){
    if(!state.world || !state.groundMaterial) return;
    if(state.groundBody){
      if(!state.staticBodies.includes(state.groundBody)) state.staticBodies.unshift(state.groundBody);
      return;
    }
    const groundBody = new CANNONRef.Body({mass: 0, material: state.groundMaterial});
    groundBody.addShape(new CANNONRef.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    state.world.addBody(groundBody);
    state.groundBody = groundBody;
    if(!state.staticBodies.includes(groundBody)) state.staticBodies.unshift(groundBody);
  }

  function removeGroundBody(){
    if(!state.groundBody) return;
    if(state.world) state.world.removeBody(state.groundBody);
    const i = state.staticBodies.indexOf(state.groundBody);
    if(i >= 0) state.staticBodies.splice(i, 1);
    state.groundBody = null;
  }

  function setSurfaceWorldCollision(enabled){
    state.surfaceWorldCollision = enabled !== false;
    if(state.surfaceWorldCollision) ensureGroundBody();
    else removeGroundBody();
    state.staticsSignature = '';
  }

  function addPlayerBody(){
    if(!state.world) return null;
    const carBody = new CANNONRef.Body({
      mass: state.mass,
      material: state.carMaterial,
      linearDamping: .01,
      angularDamping: .4,
    });
    const carHalfX = playerCollision.hx == null ? 0.92 : playerCollision.hx;
    const carHalfY = playerCollision.hy == null ? 0.42 : playerCollision.hy;
    const carHalfZ = playerCollision.hz == null ? 1.85 : playerCollision.hz;
    const carOffsetX = playerCollision.offsetX || 0;
    const carOffsetY = playerCollision.offsetY == null ? 0.45 : playerCollision.offsetY;
    const carOffsetZ = playerCollision.offsetZ || 0;
    let shapeQuat = null;
    if(playerCollision.rotX || playerCollision.rotY || playerCollision.rotZ){
      shapeQuat = new CANNONRef.Quaternion();
      shapeQuat.setFromEuler(playerCollision.rotX || 0, playerCollision.rotY || 0, playerCollision.rotZ || 0, 'XYZ');
    }
    carBody.addShape(new CANNONRef.Box(cannonVec(carHalfX, carHalfY, carHalfZ)), cannonVec(carOffsetX, carOffsetY, carOffsetZ), shapeQuat);
    carBody.position.set(player.pos.x, (player.pos.y || 0) + bodyBaseY(), player.pos.z);
    carBody.quaternion.setFromAxisAngle(cannonVec(0,1,0), player.heading);
    carBody.allowSleep = false;
    carBody.addEventListener('collide', e => {
      const contact = e.contact;
      const ny = contact && contact.ni ? Math.abs(contact.ni.y) : 0;
      if(ny > .6) return;   // touching the ground / landing is not a crash
      const speed = contact && contact.getImpactVelocityAlongNormal ? Math.abs(contact.getImpactVelocityAlongNormal()) : 0;
      state.lastImpact = Math.max(state.lastImpact, speed);
    });
    state.world.addBody(carBody);
    state.carBody = carBody;

    const vehicle = new CANNONRef.RaycastVehicle({
      chassisBody: carBody, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2,
    });
    const connY = -bodyBaseY() + suspension.restLength + suspension.radius;
    for(const w of wheelLayout){
      vehicle.addWheel({
        radius: w.radius || suspension.radius,
        directionLocal: cannonVec(0, -1, 0),
        axleLocal: cannonVec(-1, 0, 0),
        suspensionStiffness: suspension.stiffness,
        suspensionRestLength: suspension.restLength,
        maxSuspensionTravel: suspension.travel,
        maxSuspensionForce: suspension.maxForce,
        dampingCompression: suspension.compression,
        dampingRelaxation: suspension.relaxation,
        frictionSlip: 1.9,
        rollInfluence: suspension.rollInfluence,
        chassisConnectionPointLocal: cannonVec(w.x, connY, w.z),
        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true,
      });
    }
    vehicle.addToWorld(state.world);
    state.vehicle = vehicle;
    return carBody;
  }

  function init(){
    if(!state.available || state.world) return !!state.world;
    const world = new CANNONRef.World();
    world.gravity.set(0, -9.82, 0);
    world.broadphase = CANNONRef.SAPBroadphase ? new CANNONRef.SAPBroadphase(world) : new CANNONRef.NaiveBroadphase();
    world.solver.iterations = 10;
    world.solver.tolerance = 0.001;
    state.world = world;
    state.carMaterial = new CANNONRef.Material('player-car');
    state.groundMaterial = new CANNONRef.Material('asphalt');
    // wheels get their grip from the raycast friction model; this only rules
    // chassis scrapes against walls, so keep it slippery
    world.addContactMaterial(new CANNONRef.ContactMaterial(state.carMaterial, state.groundMaterial, {
      friction: 0.08, restitution: 0.02, contactEquationStiffness: 1e7, contactEquationRelaxation: 4
    }));

    if(state.surfaceWorldCollision) ensureGroundBody();

    addPlayerBody();
    state.active = true;
    rebuildStatics();
    return true;
  }

  function removePlayer(){
    if(!state.world) return;
    if(state.vehicle && state.vehicle.removeFromWorld) state.vehicle.removeFromWorld(state.world);
    else if(state.carBody) state.world.removeBody(state.carBody);
    state.vehicle = null;
    state.carBody = null;
  }

  function rebuildPlayer(){
    if(!state.world) return;
    removePlayer();
    addPlayerBody();
  }

  function isDriveSurfaceCollider(col){
    const owner = col && col.owner;
    const ud = owner && owner.userData;
    if(!ud) return false;
    if(ud.driveSurface === true) return true;
    const e = ud.addedEntry || {};
    const prim = e.primitive || e.prim;
    if(prim === 'ramp' || prim === 'plane') return true;
    const text = String(ud.editorName || ud.assetName || owner.name || '').toLowerCase();
    return /\b(ramp|curb|sidewalk|pavement|road|floor|ground|surface|asphalt|marciapiede|salita|rampa)\b/.test(text);
  }

  function ownerWorldTransform(owner){
    if(!window.THREE || !owner || !owner.getWorldPosition) return null;
    owner.updateMatrixWorld(true);
    return {
      p: owner.getWorldPosition(new THREE.Vector3()),
      q: owner.getWorldQuaternion(new THREE.Quaternion()),
      s: owner.getWorldScale(new THREE.Vector3()),
    };
  }

  // editor 'ramp' primitive: extruded right triangle -> exact wedge collider
  const WEDGE_VERTS = [[-3,0,-2],[3,0,-2],[3,2.2,-2],[-3,0,2],[3,0,2],[3,2.2,2]];
  const WEDGE_FACES = [[0,2,1],[3,4,5],[0,1,4,3],[1,2,5,4],[0,3,5,2]];
  function addWedge(owner){
    if(!CANNONRef.ConvexPolyhedron) return false;
    const t = ownerWorldTransform(owner);
    if(!t) return false;
    const sx = Math.abs(t.s.x || 1), sy = Math.abs(t.s.y || 1), sz = Math.abs(t.s.z || 1);
    const verts = WEDGE_VERTS.map(v => cannonVec(v[0] * sx, v[1] * sy, v[2] * sz));
    const body = new CANNONRef.Body({mass: 0, material: state.groundMaterial});
    body.addShape(new CANNONRef.ConvexPolyhedron(verts, WEDGE_FACES.map(f => f.slice())));
    body.position.set(t.p.x, t.p.y, t.p.z);
    body.quaternion.set(t.q.x, t.q.y, t.q.z, t.q.w);
    state.world.addBody(body);
    state.staticBodies.push(body);
    return true;
  }

  // complex static models: exact triangle mesh so wheels and chassis follow
  // hard-surface details and curved primitives instead of their box proxy.
  function addTrimesh(owner, colliderRef){
    if(!CANNONRef.Trimesh || !window.THREE) return false;
    owner.updateMatrixWorld(true);
    const verts = [], indices = [];
    const v = new THREE.Vector3();
    const targetUuid = colliderRef && colliderRef.compoundPart ? colliderRef.partMeshUuid : null;
    const targetName = colliderRef && colliderRef.compoundPart ? colliderRef.partName : null;
    owner.traverse(m => {
      if(!m.isMesh || !m.geometry || (m.userData && m.userData.helperOnly)) return;
      if(targetUuid && m.uuid !== targetUuid) return;
      if(!targetUuid && targetName && m.name !== targetName) return;
      const pos = m.geometry.attributes && m.geometry.attributes.position;
      if(!pos) return;
      const base = verts.length / 3;
      for(let i = 0; i < pos.count; i++){
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        verts.push(v.x, v.y, v.z);
      }
      const idx = m.geometry.index;
      if(idx) for(let i = 0; i < idx.count; i++) indices.push(base + idx.getX(i));
      else for(let i = 0; i < pos.count; i++) indices.push(base + i);
    });
    if(!indices.length || verts.length > 300000) return false;
    const faceCount = indices.length;
    for(let i = 0; i + 2 < faceCount; i += 3) indices.push(indices[i + 2], indices[i + 1], indices[i]);
    const body = new CANNONRef.Body({mass: 0, material: state.groundMaterial});
    body.addShape(new CANNONRef.Trimesh(verts, indices));
    state.world.addBody(body);
    state.staticBodies.push(body);
    return true;
  }

  function ownerHasMeshGeometry(owner){
    if(!owner || !owner.traverse) return false;
    let found = false;
    owner.traverse(m => {
      if(found || !m.isMesh || !m.geometry || (m.userData && m.userData.helperOnly)) return;
      const pos = m.geometry.attributes && m.geometry.attributes.position;
      found = !!(pos && pos.count >= 3);
    });
    return found;
  }

  function isComplexMeshCollider(col){
    if(!col || col.physics || !col.owner) return false;
    if(col.compoundPart) return col.partMode === 'complex' || col.meshCollider === true || col.colliderMode === 'complex';
    return col.meshCollider === true || col.colliderMode === 'complex';
  }

  function staticShapeKind(col){
    const owner = col && col.owner;
    const ud = (owner && owner.userData) || {};
    const e = ud.addedEntry || {};
    const prim = e.primitive || e.prim;
    if(prim === 'ramp') return 'wedge';
    if(isComplexMeshCollider(col) && prim !== 'box' && prim !== 'plane' && ownerHasMeshGeometry(owner)) return 'trimesh';
    if(!isDriveSurfaceCollider(col) || prim === 'box' || prim === 'plane') return 'box';
    // models, sculpted meshes or legacy entries without metadata: use the
    // real triangle mesh so the wheel raycasts follow the actual geometry
    return 'trimesh';
  }

  function rebuildStatics(){
    if(!state.world) return;
    for(const body of state.staticBodies.slice()) if(body !== state.groundBody) state.world.removeBody(body);
    state.staticBodies.length = 0;
    if(state.surfaceWorldCollision) ensureGroundBody();
    else removeGroundBody();

    const bindLogicColliderBody = (body, colliderRef) => {
      if(!body || !colliderRef || !colliderRef.logicElementCollider) return body;
      body.logicObject = colliderRef.owner || null;
      colliderRef.cannonBody = body;
      body.userData = Object.assign({}, body.userData || {}, {logicElementCollider:true, logicElementId:colliderRef.logicElementId});
      body.addEventListener('collide', event => {
        if(!window.dispatchEvent || !window.CustomEvent) return;
        window.dispatchEvent(new CustomEvent('lk-logic-collision-begin', {detail:{
          body,
          otherBody:event && event.body || null,
          object:body.logicObject || null,
          otherObject:event && event.body && event.body.logicObject || null,
          contact:event && event.contact || null,
        }}));
      });
      return body;
    };
    const addStaticBox = (x, y, z, hx, hy, hz, rotX, rotY, rotZ, colliderRef) => {
      const body = new CANNONRef.Body({mass: 0, material: state.groundMaterial});
      body.addShape(new CANNONRef.Box(cannonVec(hx, hy, hz)));
      body.position.set(x, y, z);
      if(rotX || rotY || rotZ) body.quaternion.setFromEuler(rotX || 0, rotY || 0, rotZ || 0, 'XYZ');
      bindLogicColliderBody(body, colliderRef);
      state.world.addBody(body);
      state.staticBodies.push(body);
    };
    const specialStatics = new Set();
    for(const box of colliders.box || []){
      if(!box || box.enabled === false || box.compoundRoot || box.physics) continue;
      const kind = staticShapeKind(box);
      if(kind !== 'box' && box.owner){
        const key = kind + ':' + ((box.owner && box.owner.uuid) || box.owner) + ':' + (box.compoundPart ? ('part:' + (box.partMeshUuid || box.partName || box.partIndex)) : 'root');
        if(specialStatics.has(key)) continue;
        specialStatics.add(key);
        if(kind === 'wedge' ? addWedge(box.owner) : addTrimesh(box.owner, box)) continue;
      }
      addStaticBox(box.x, box.y != null ? box.y : Math.max(.1, box.hy || 1.1), box.z, box.hx || 1, box.hy || 1.1, box.hz || 1, box.rotX || 0, box.rotY != null ? box.rotY : (box.rot || 0), box.rotZ || 0, box);
    }
    for(const circle of colliders.circle || []){
      if(!circle || circle.enabled === false || circle.physics || isDriveSurfaceCollider(circle)) continue;
      const body = new CANNONRef.Body({mass: 0, material: state.groundMaterial});
      const radius = Math.max(.05, Number(circle.r) || .5);
      const halfHeight = Math.max(radius, Number(circle.hy) || radius);
      if(typeof CANNONRef.Cylinder === 'function'){
        const cylinder = new CANNONRef.Cylinder(radius, radius, halfHeight * 2, 12);
        const orientation = new CANNONRef.Quaternion();
        orientation.setFromEuler(-Math.PI / 2, 0, 0, 'XYZ');
        body.addShape(cylinder, cannonVec(0, 0, 0), orientation);
      } else {
        body.addShape(new CANNONRef.Box(cannonVec(radius, halfHeight, radius)));
      }
      body.position.set(circle.x, circle.y != null ? circle.y : halfHeight, circle.z);
      bindLogicColliderBody(body, circle);
      state.world.addBody(body);
      state.staticBodies.push(body);
    }
    state.staticsSignature = colliderSignature();
  }

  function syncPlayer(){
    if(!state.carBody) return;
    state.carBody.position.set(player.pos.x, (player.pos.y || 0) + bodyBaseY(), player.pos.z);
    state.carBody.velocity.set(player.vel.x, 0, player.vel.z);
    state.carBody.angularVelocity.set(0, player.yawRate || 0, 0);
    state.carBody.force.set(0,0,0);
    state.carBody.torque.set(0,0,0);
    state.carBody.quaternion.setFromAxisAngle(cannonVec(0,1,0), player.heading);
    if(state.vehicle){
      for(let i = 0; i < state.vehicle.wheelInfos.length; i++){
        state.vehicle.applyEngineForce(0, i);
        state.vehicle.setBrake(0, i);
        state.vehicle.setSteeringValue(0, i);
        state.vehicle.wheelInfos[i].suspensionLength = suspension.restLength;
      }
    }
  }

  // live-tune the raycast suspension on the existing wheels (no rebuild)
  function applySuspension(patch){
    if(patch) Object.assign(suspension, patch);
    if(!state.vehicle) return;
    for(const w of state.vehicle.wheelInfos){
      w.suspensionStiffness = suspension.stiffness;
      w.dampingCompression = suspension.compression;
      w.dampingRelaxation = suspension.relaxation;
      w.maxSuspensionTravel = suspension.travel;
      w.rollInfluence = suspension.rollInfluence;
      w.suspensionRestLength = suspension.restLength;
    }
  }

  function dispose(){
    if(!state.world) return;
    removePlayer();
    const bodies = state.world.bodies ? state.world.bodies.slice() : [];
    for(const body of bodies) state.world.removeBody(body);
    state.world = null;
    state.carMaterial = null;
    state.groundMaterial = null;
    state.groundBody = null;
    state.staticBodies.length = 0;
    state.staticsSignature = '';
    state.lastImpact = 0;
    state.active = false;
  }

  return {
    state,
    init,
    rebuildStatics,
    syncPlayer,
    rebuildPlayer,
    applySuspension,
    setSurfaceWorldCollision,
    dispose,
    colliderSignature,
    cannonVec,
  };
}

window.LK_RUNTIME_PHYSICS_WORLD = Object.freeze({create});
})();
