/* Shared RaycastVehicle wheel actuator used by native and Logic Pawns. */
(function(){
'use strict';

function create(){
  function apply(options){
    const opts = options || {};
    const vehicle = opts.vehicle;
    if(!vehicle || !vehicle.wheelInfos) return false;
    const wheels = vehicle.wheelInfos;
    const driven = Array.isArray(opts.driven) && opts.driven.length ? opts.driven : [2,3];
    const engineForce = Number(opts.engineForce) || 0;
    for(let index = 0; index < wheels.length; index++) vehicle.applyEngineForce(0, index);
    driven.forEach(index => { if(wheels[index]) vehicle.applyEngineForce(engineForce / driven.length, index); });
    const steer = Number(opts.steer) || 0;
    const steering = Array.isArray(opts.steering) ? opts.steering : [0,1];
    for(let index = 0; index < wheels.length; index++) vehicle.setSteeringValue(steering.includes(index) ? steer : 0, index);
    const brakes = Array.isArray(opts.brakes) ? opts.brakes : [];
    for(let index = 0; index < wheels.length; index++) vehicle.setBrake(Math.max(0, Number(brakes[index]) || 0), index);
    const grip = Array.isArray(opts.frictionSlip) ? opts.frictionSlip : [];
    grip.forEach((value, index) => { if(wheels[index] && Number.isFinite(Number(value))) wheels[index].frictionSlip = Number(value); });
    return true;
  }
  return Object.freeze({apply});
}

window.LK_RUNTIME_VEHICLE_RAYCAST_ACTUATOR = Object.freeze({create});
})();
