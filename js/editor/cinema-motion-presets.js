/* =========================================================
   LOT KING - CINEMA STUDIO MOTION PRESETS
   Target-specific, editable spatial path templates.
   ========================================================= */
(function(){
'use strict';

const presets = Object.freeze([
  {id:'camera-dolly-in', kind:'camera', label:'Dolly in', path:[[0,0,0],[0,0,.45],[0,0,1]]},
  {id:'camera-dolly-out', kind:'camera', label:'Dolly out', path:[[0,0,0],[0,0,-.45],[0,0,-1]]},
  {id:'camera-curve-left', kind:'camera', label:'Curve left', straightTail:true, path:[[0,0,0],[-.35,.08,.32],[-.72,.03,.7],[-.82,0,1.22]]},
  {id:'camera-curve-right', kind:'camera', label:'Curve right', straightTail:true, path:[[0,0,0],[.35,.08,.32],[.72,.03,.7],[.82,0,1.22]]},
  {id:'camera-crane-up', kind:'camera', label:'Crane up', path:[[0,0,0],[0,.38,.25],[0,.82,.62],[0,1,.95]]},
  {id:'camera-dive-level', kind:'camera', label:'Dive then level', straightTail:true, path:[[0,0,0],[0,-.42,.3],[0,-.78,.68],[0,-.78,1.28]], pitch:[0,.16,.08,0]},
  {id:'object-straight', kind:'object', label:'Smooth forward', path:[[0,0,0],[0,0,.45],[0,0,1]]},
  {id:'object-curve-left', kind:'object', label:'Curve then straight · left', straightTail:true, path:[[0,0,0],[-.35,0,.3],[-.72,0,.68],[-.72,0,1.28]]},
  {id:'object-curve-right', kind:'object', label:'Curve then straight · right', straightTail:true, path:[[0,0,0],[.35,0,.3],[.72,0,.68],[.72,0,1.28]]},
  {id:'object-arc', kind:'object', label:'Arc / jump', path:[[0,0,0],[0,.62,.3],[0,.72,.62],[0,0,1.05]]},
  {id:'object-dive-level', kind:'object', label:'Dive then straight', straightTail:true, path:[[0,0,0],[0,-.42,.3],[0,-.72,.68],[0,-.72,1.28]], pitch:[0,.18,.08,0]},
  {id:'object-rise-level', kind:'object', label:'Rise then straight', straightTail:true, path:[[0,0,0],[0,.42,.3],[0,.72,.68],[0,.72,1.28]], pitch:[0,-.14,-.06,0]},
]);

function vec3(value, fallback){
  const source = Array.isArray(value) ? value : (fallback || [0,0,0]);
  return [Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0];
}

function presetById(id){
  return presets.find(preset => preset.id === id) || null;
}

function normalizedBasisVector(value, fallback){
  const result = vec3(value, fallback);
  const length = Math.hypot(result[0], result[1], result[2]);
  return length > .000001 ? result.map(component => component / length) : vec3(fallback);
}

function build(presetId, pose, startTime, duration, basis, distance){
  const preset = presetById(presetId);
  if(!preset) return [];
  const source = pose || {};
  const origin = vec3(source.position);
  const rotation = vec3(source.rotation);
  const scale = vec3(source.scale, [1,1,1]);
  const right = normalizedBasisVector(basis && basis.right, [1,0,0]);
  const up = normalizedBasisVector(basis && basis.up, [0,1,0]);
  const forward = normalizedBasisVector(basis && basis.forward, [0,0,1]);
  const start = Math.max(0, Number(startTime) || 0);
  const span = Math.max(.1, Number(duration) || 6);
  const range = Math.max(.1, Number(distance) || 8);
  const count = Math.max(2, preset.path.length);
  const keys = preset.path.map((offset, index) => {
    const fraction = index / (count - 1);
    const position = [0,1,2].map(axis => origin[axis] + range * (
      right[axis] * offset[0] + up[axis] * offset[1] + forward[axis] * offset[2]
    ));
    const pitch = preset.pitch && Number(preset.pitch[index]) || 0;
    return {
      time:start + span * fraction,
      position,
      rotation:[rotation[0] + pitch, rotation[1], rotation[2]],
      scale:scale.slice(),
      curve:index === count - 1 ? 'linear' : 'ease-in-out',
      spatialMode:'auto',
    };
  });
  if(preset.straightTail && keys.length >= 2){
    const current = keys[keys.length - 2];
    const next = keys[keys.length - 1];
    const delta = next.position.map((value, axis) => value - current.position[axis]);
    current.spatialMode = 'broken';
    current.tangentOut = delta.map(value => value / 3);
    next.spatialMode = 'broken';
    next.tangentIn = delta.map(value => -value / 3);
  }
  return keys;
}

const api = Object.freeze({build, presetById, presets});
if(typeof module !== 'undefined' && module.exports) module.exports = api;
if(typeof window !== 'undefined') window.LK_EDITOR_CINEMA_MOTION_PRESETS = api;
})();
