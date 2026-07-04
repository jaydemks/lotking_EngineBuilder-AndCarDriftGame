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

    const carBody = new CANNONRef.Body({
      mass: state.mass,
      material: state.carMaterial,
      linearDamping: 0.04,
      angularDamping: 0.48,
    });
    carBody.addShape(new CANNONRef.Box(cannonVec(0.92, 0.42, 1.85)), cannonVec(0, .45, 0));
    carBody.position.set(player.pos.x, .55, player.pos.z);
    carBody.quaternion.setFromAxisAngle(cannonVec(0,1,0), player.heading);
    if(carBody.angularFactor) carBody.angularFactor.set(0, 1, 0);
    if(carBody.linearFactor) carBody.linearFactor.set(1, 0, 1);
    carBody.addEventListener('collide', e => {
      const speed = e.contact && e.contact.getImpactVelocityAlongNormal ? Math.abs(e.contact.getImpactVelocityAlongNormal()) : 0;
      state.lastImpact = Math.max(state.lastImpact, speed);
    });
    world.addBody(carBody);
    state.carBody = carBody;
    state.active = true;
    rebuildStatics();
    return true;
  }

  function rebuildStatics(){
    if(!state.world) return;
    for(const body of state.staticBodies.slice(1)) state.world.removeBody(body);
    state.staticBodies.length = 1;

    const addStaticBox = (x, z, hx, hz, h) => {
      const body = new CANNONRef.Body({mass: 0, material: state.groundMaterial});
      body.addShape(new CANNONRef.Box(cannonVec(hx, h * .5, hz)));
      body.position.set(x, h * .5, z);
      state.world.addBody(body);
      state.staticBodies.push(body);
    };
    const lot = constants.LOT;
    const wallH = constants.WALL_H;
    const wallT = 1.2;
    addStaticBox(0, lot + wallT * .5, lot + wallT, wallT * .5, wallH);
    addStaticBox(0, -lot - wallT * .5, lot + wallT, wallT * .5, wallH);
    addStaticBox(lot + wallT * .5, 0, wallT * .5, lot + wallT, wallH);
    addStaticBox(-lot - wallT * .5, 0, wallT * .5, lot + wallT, wallH);
    for(const box of colliders.box || []) addStaticBox(box.x, box.z, box.hx, box.hz, 2.2);
    for(const circle of colliders.circle || []){
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
    state.carBody.position.set(player.pos.x, .55, player.pos.z);
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
    dispose,
    colliderSignature,
    cannonVec,
  };
}

window.LK_RUNTIME_PHYSICS_WORLD = Object.freeze({create});
})();
