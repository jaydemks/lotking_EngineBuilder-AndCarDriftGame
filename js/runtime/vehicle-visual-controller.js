/* Shared per-instance vehicle visual controller. */
(function(){
'use strict';

function finite(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

const ZERO_PIVOT = Object.freeze({x:0, y:0, z:0});
/** Move a wheel's steering axis without moving the wheel. The pivot shifts by
 *  the offset and everything inside it shifts back by the same amount, so only
 *  the centre of rotation changes. Re-applied only when the offset changes, so
 *  this costs nothing on a frame where the author is not dragging a slider. */
function applySteerPivot(visual, source){
  const next = source && typeof source === 'object'
    ? {x:finite(source.x, 0), y:finite(source.y, 0), z:finite(source.z, 0)}
    : ZERO_PIVOT;
  const applied = visual.steerPivotApplied || (visual.steerPivotApplied = {x:0, y:0, z:0});
  const dx = next.x - applied.x, dy = next.y - applied.y, dz = next.z - applied.z;
  if(!dx && !dy && !dz) return applied;
  if(visual.pivotBaseX == null){
    visual.pivotBaseX = finite(visual.pivot.position.x, 0);
    visual.pivotBaseZ = finite(visual.pivot.position.z, 0);
  }
  visual.pivot.position.x = visual.pivotBaseX + next.x;
  visual.pivot.position.z = visual.pivotBaseZ + next.z;
  (visual.pivot.children || []).forEach(child => {
    if(!child || !child.position) return;
    child.position.x -= dx;
    child.position.y -= dy;
    child.position.z -= dz;
  });
  applied.x = next.x; applied.y = next.y; applied.z = next.z;
  return applied;
}

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
    // A wheel steers about its kingpin axis, not about the centre of its mesh.
    // When the rig's pivot does not sit on that axis the wheel swings through an
    // arc instead of turning in place, which reads as "the steering is wrong".
    // The offset relocates the rotation centre and counter-translates the wheel
    // so the wheel itself does not move — only what it rotates around.
    applySteerPivot(visual, opts.steerPivot);
    const offset = visual.steerPivotApplied;
    visual.pivot.rotation.y = steer;
    visual.pivot.position.y = finite(opts.baseY, .38) - finite(opts.chassisLift, 0) + visual.suspensionVisual + offset.y;
    (visual.spinTargets || []).forEach(node => { if(node && node.rotation) node.rotation.x = visual.spin; });
    return {spin:visual.spin, steer, suspension:visual.suspensionVisual, contact:!!(info && info.isInContact), steerPivot:{x:offset.x, y:offset.y, z:offset.z}};
  }
  return Object.freeze({updateWheel});
}

window.LK_RUNTIME_VEHICLE_VISUAL_CONTROLLER = Object.freeze({create});
})();
