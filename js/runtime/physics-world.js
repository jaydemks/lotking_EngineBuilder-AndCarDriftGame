/* =========================================================
   LOT KING - Cannon physics world adapter
   Owns world creation, static collider rebuild, player body sync and teardown.
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts = options || {};
  const CANNONRef = opts.CANNONRef;
  const player = opts.playerState;
  const playerCollision = opts.playerCollision || {};
  const constants = opts.constants || {};
  const colliders = opts.colliders || {};
  const worldState = opts.worldState;
  const state = {
    available: !!CANNONRef,
    active: false,
    world: null,
    carBody: null,
    carMaterial: null,
    groundMaterial: null,
    staticBodies: [],
    mass: 1200,
    staticsSignature: '',
    lastImpact: 0,
  };

  function cannonVec(x, y, z){ return new CANNONRef.Vec3(x, y, z); }

  function colliderSignature(){
    return worldState.colliderSignature();
  }

  function addPlayerBody(){
    if(!state.world) return null;
    const carBody = new CANNONRef.Body({
      mass: state.mass,
      material: state.carMaterial,
      linearDamping: 0.04,
      angularDamping: 0.48,
    });
    const carHalfX = playerCollision.hx == null ? 0.92 : playerCollision.hx;
    const carHalfY = playerCollision.hy == null ? 0.42 : playerCollision.hy;
    const carHalfZ = playerCollision.hz == null ? 1.85 : playerCollision.hz;
    const carOffsetX = playerCollision.offsetX || 0;
    const carOffsetY = playerCollision.offsetY == null ? 0.45 : playerCollision.offsetY;
    const carOffsetZ = playerCollision.offsetZ || 0;
    const carBodyY = playerCollision.bodyY == null ? 0.55 : playerCollision.bodyY;
    let shapeQuat = null;
    if(playerCollision.rotX || playerCollision.rotY || playerCollision.rotZ){
      shapeQuat = new CANNONRef.Quaternion();
      shapeQuat.setFromEuler(playerCollision.rotX || 0, playerCollision.rotY || 0, playerCollision.rotZ || 0, 'XYZ');
    }
    carBody.addShape(new CANNONRef.Box(cannonVec(carHalfX, carHalfY, carHalfZ)), cannonVec(carOffsetX, carOffsetY, carOffsetZ), shapeQuat);
    carBody.position.set(player.pos.x, carBodyY, player.pos.z);
    carBody.quaternion.setFromAxisAngle(cannonVec(0,1,0), player.heading);
    if(carBody.angularFactor) carBody.angularFactor.set(0, 1, 0);
    if(carBody.linearFactor) carBody.linearFactor.set(1, 0, 1);
    carBody.addEventListener('collide', e => {
      const speed = e.contact && e.contact.getImpactVelocityAlongNormal ? Math.abs(e.contact.getImpactVelocityAlongNormal()) : 0;
      state.lastImpact = Math.max(state.lastImpact, speed);
    });
    state.world.addBody(carBody);
    state.carBody = carBody;
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
    world.addContactMaterial(new CANNONRef.ContactMaterial(state.carMaterial, state.groundMaterial, {
      friction: 0.35, restitution: 0.05, contactEquationStiffness: 1e7, contactEquationRelaxation: 4
    }));

    const groundBody = new CANNONRef.Body({mass: 0, material: state.groundMaterial});
    groundBody.addShape(new CANNONRef.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
    state.staticBodies.push(groundBody);

    addPlayerBody();
    state.active = true;
    rebuildStatics();
    return true;
  }

  function rebuildPlayer(){
    if(!state.world) return;
    if(state.carBody) state.world.removeBody(state.carBody);
    state.carBody = null;
    addPlayerBody();
  }

  function rebuildStatics(){
    if(!state.world) return;
    for(const body of state.staticBodies.slice(1)) state.world.removeBody(body);
    state.staticBodies.length = 1;

    const addStaticBox = (x, y, z, hx, hy, hz, rotX, rotY, rotZ) => {
      const body = new CANNONRef.Body({mass: 0, material: state.groundMaterial});
      body.addShape(new CANNONRef.Box(cannonVec(hx, hy, hz)));
      body.position.set(x, y, z);
      if(rotX || rotY || rotZ) body.quaternion.setFromEuler(rotX || 0, rotY || 0, rotZ || 0, 'XYZ');
      state.world.addBody(body);
      state.staticBodies.push(body);
    };
    const isDriveSurfaceCollider = col => {
      const owner = col && col.owner;
      const ud = owner && owner.userData;
      if(!ud) return false;
      if(ud.driveSurface === true) return true;
      const e = ud.addedEntry || {};
      const prim = e.primitive || e.prim;
      if(prim === 'ramp' || prim === 'plane') return true;
      const text = String(ud.editorName || ud.assetName || owner.name || '').toLowerCase();
      return /\b(ramp|curb|sidewalk|pavement|road|floor|ground|surface|asphalt|marciapiede|salita|rampa)\b/.test(text);
    };
    const driveSurfaceNormalY = col => {
      if(!col) return 1;
      if(window.THREE){
        const e = new THREE.Euler(col.rotX || 0, col.rotY != null ? col.rotY : (col.rot || 0), col.rotZ || 0, 'XYZ');
        return new THREE.Vector3(0, 1, 0).applyEuler(e).normalize().y;
      }
      const rx = col.rotX || 0;
      const rz = col.rotZ || 0;
      return Math.max(0, Math.min(1, Math.cos(rx) * Math.cos(rz)));
    };
    const driveSurfaceMinNormalY = Math.cos(Math.PI * 36 / 180);
    const isDriveableSurfaceCollider = col => isDriveSurfaceCollider(col) && driveSurfaceNormalY(col) >= driveSurfaceMinNormalY;
    for(const box of colliders.box || []){
      if(!box || box.enabled === false || box.compoundRoot || box.physics || isDriveableSurfaceCollider(box)) continue;
      addStaticBox(box.x, box.y != null ? box.y : Math.max(.1, box.hy || 1.1), box.z, box.hx || 1, box.hy || 1.1, box.hz || 1, box.rotX || 0, box.rotY != null ? box.rotY : (box.rot || 0), box.rotZ || 0);
    }
    for(const circle of colliders.circle || []){
      if(!circle || circle.enabled === false || circle.physics || isDriveSurfaceCollider(circle)) continue;
      const body = new CANNONRef.Body({mass: 0, material: state.groundMaterial});
      body.addShape(new CANNONRef.Sphere(circle.r));
      body.position.set(circle.x, circle.r, circle.z);
      state.world.addBody(body);
      state.staticBodies.push(body);
    }
    state.staticsSignature = colliderSignature();
  }

  function syncPlayer(){
    if(!state.carBody) return;
    state.carBody.position.set(player.pos.x, playerCollision.bodyY == null ? .55 : playerCollision.bodyY, player.pos.z);
    state.carBody.velocity.set(player.vel.x, 0, player.vel.z);
    state.carBody.angularVelocity.set(0, player.yawRate || 0, 0);
    state.carBody.force.set(0,0,0);
    state.carBody.torque.set(0,0,0);
    state.carBody.quaternion.setFromAxisAngle(cannonVec(0,1,0), player.heading);
  }

  function dispose(){
    if(!state.world) return;
    const bodies = state.world.bodies ? state.world.bodies.slice() : [];
    for(const body of bodies) state.world.removeBody(body);
    state.world = null;
    state.carBody = null;
    state.carMaterial = null;
    state.groundMaterial = null;
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
    dispose,
    colliderSignature,
    cannonVec,
  };
}

window.LK_RUNTIME_PHYSICS_WORLD = Object.freeze({create});
})();
