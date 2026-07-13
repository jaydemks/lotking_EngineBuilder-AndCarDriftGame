/* Shared per-instance vehicle visual controller. */
(function(){
'use strict';

function finite(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

function create(){
  function updateWheel(options){
    const opts = options || {};
    const visual = opts.visual;
    if(!visual || !visual.pivot) return null;
    const info = opts.wheelInfo || null;
    const suspension = opts.suspension || {};
    const dt = Math.max(0, finite(opts.dt, 0));
    const restLength = finite(suspension.restLength, .34);
    const travel = Math.max(.001, finite(suspension.travel, .28));
    const compression = info ? clamp(restLength - finite(info.suspensionLength, restLength), -travel, travel) : 0;
    const alpha = 1 - Math.exp(-18 * dt);
    visual.suspensionVisual = finite(visual.suspensionVisual, 0) + (compression - finite(visual.suspensionVisual, 0)) * alpha;
    const radius = Math.max(.05, finite(opts.radius, finite(suspension.radius, .38)));
    if(info && Number.isFinite(info.rotation) && Math.abs(info.rotation) > .000001) visual.spin = -info.rotation;
    else visual.spin = finite(visual.spin, 0) + finite(opts.forwardSpeed, 0) * dt / radius;
    const steer = opts.front ? finite(opts.steerAngle, 0) * finite(opts.steerVisualScale, 1.25) : 0;
    visual.pivot.rotation.y = steer;
    visual.pivot.position.y = finite(opts.baseY, .38) - finite(opts.chassisLift, 0) + visual.suspensionVisual;
    (visual.spinTargets || []).forEach(node => { if(node && node.rotation) node.rotation.x = visual.spin; });
    return {spin:visual.spin, steer, suspension:visual.suspensionVisual, contact:!!(info && info.isInContact)};
  }
  return Object.freeze({updateWheel});
}

window.LK_RUNTIME_VEHICLE_VISUAL_CONTROLLER = Object.freeze({create});
})();
