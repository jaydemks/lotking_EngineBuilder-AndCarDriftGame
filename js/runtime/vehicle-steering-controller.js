/* Shared native steering response and high-speed reduction. */
(function(){
'use strict';
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function update(options){
  const o = options || {};
  const target = clamp(Number(o.target) || 0,-1,1);
  const current = Number(o.current) || 0;
  const dt = Math.max(0,Number(o.dt) || 0);
  const response = Math.max(.01,Number(o.response) || 6.5);
  const rate = response * (target === 0 || target * current < 0 ? 1.6 : 1);
  const value = current + (target-current) * Math.min(1,dt*rate);
  const highSpeed = clamp(Number(o.highSpeed) || .34,0,1);
  const scale = highSpeed + (1-highSpeed) * Math.exp(-Math.abs(Number(o.speed) || 0)/20);
  return {value,angle:value*(Number(o.maxAngle) || .60)*scale,scale};
}
window.LK_RUNTIME_VEHICLE_STEERING_CONTROLLER = Object.freeze({update});
})();
