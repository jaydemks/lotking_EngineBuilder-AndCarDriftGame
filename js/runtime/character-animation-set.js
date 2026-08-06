/* =========================================================
   LOT KING - Data-driven Character Animation Set
   A small motion database used by the runtime selector. Each
   entry describes what a clip represents instead of wiring a
   clip directly to a hard-coded state-machine branch.
   ========================================================= */
(function(){
'use strict';

/* Direction is [x, z] in the CHARACTER's own frame, where forward is +Z. In that
   frame +X is the body's own LEFT, so `left` is [1,0] and `right` is [-1,0]. The
   table used to say the opposite, which mirrored every strafe that named its side
   as a string - the legacy presets below, and with them the soccer and animal sets.
   Measured rather than derived, at both ends of the chain:
     * the bundled Mixamo clips carry root motion, and `left strafe` displaces the
       hips by dx = +179 cm while `right strafe` displaces them by -179
       (scripts/measure-clip-direction.mjs reports it for any clip);
     * pressing A/Left produces steer = +1 (input-actions.js), which arrives here
       as x = +1 - the movement controller's world/local pair cancels out to the
       identity, so the selector's x IS the lateral input. */
const DIRECTIONS=Object.freeze({idle:[0,0],forward:[0,1],backward:[0,-1],left:[1,0],right:[-1,0]});
const LEGACY_PRESETS=Object.freeze({
  idle:{state:'grounded',direction:'idle',speed:0,loop:true},
  walk:{state:'grounded',direction:'forward',speed:1.8,loop:true},
  run:{state:'grounded',direction:'forward',speed:5.4,loop:true},
  sprint:{state:'grounded',direction:'forward',speed:7,loop:true},
  strafeLeft:{state:'grounded',direction:'left',speed:1.8,loop:true},
  strafeRight:{state:'grounded',direction:'right',speed:1.8,loop:true},
  walkBackward:{state:'grounded',direction:'backward',speed:1.6,loop:true},
  jump:{state:'jump',direction:'forward',speed:2,loop:false},
  fall:{state:'fall',direction:'forward',speed:2,loop:true},
  land:{state:'land',direction:'idle',speed:0,loop:false},
});

function finite(value,fallback){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function assetKey(ref){return ref&&typeof ref==='object'?String(ref.dbKey||ref.key||ref.id||ref.src||''):'';}
function binding(value){
  let parsed=value;
  if(typeof parsed==='string'&&parsed.trim().charAt(0)==='{')try{parsed=JSON.parse(parsed);}catch(err){}
  if(parsed&&typeof parsed==='object')return {clip:String(parsed.clip||parsed.name||'').trim(),asset:parsed.asset&&typeof parsed.asset==='object'?clone(parsed.asset):null};
  return {clip:String(parsed||'').trim(),asset:null};
}
/** Playback rate that may run the clip backwards. Magnitude is clamped to the same
 *  0.1 .. 4 window as before; only the sign is now allowed through. */
function signedRate(value){
  const rate=finite(value,1);
  const sign=rate<0?-1:1;
  return sign*clamp(Math.abs(rate),.1,4);
}
function directionVector(value){
  if(Array.isArray(value)){
    const x=finite(value[0],0),z=finite(value[1],0),length=Math.hypot(x,z);
    return length>.0001?[x/length,z/length]:[0,0];
  }
  return (DIRECTIONS[String(value||'').toLowerCase()]||DIRECTIONS.forward).slice();
}
function curveCorrection(value){
  const source=value&&typeof value==='object'?value:{},offset=Array.isArray(source.offset)?source.offset:[0,0,0];
  return {offset:[clamp(finite(offset[0],0),-20,20),clamp(finite(offset[1],0),-20,20),clamp(finite(offset[2],0),-20,20)],influence:clamp(finite(source.influence,1),0,1),falloff:'smooth-midpoint'};
}
function rigCorrections(value){
  const source=value&&typeof value==='object'?value:{},result={};
  Object.keys(source).forEach(key=>{const angles=Array.isArray(source[key])?source[key]:null,clean=String(key||'').toLowerCase().replace(/^(?:mixamorig|armature|skeleton|rig)(?:[_\-\s]*\d+)?[_\-\s]*/,'').replace(/[^a-z0-9]/g,'');if(!angles||!clean)return;result[clean]=[clamp(finite(angles[0],0),-180,180),clamp(finite(angles[1],0),-180,180),clamp(finite(angles[2],0),-180,180)];});
  return result;
}
function motionTransform(value){
  const source=value&&typeof value==='object'?value:{},position=Array.isArray(source.position)?source.position:[0,0,0],rotation=Array.isArray(source.rotation)?source.rotation:[0,0,0];
  return {
    position:[clamp(finite(position[0],0),-20,20),clamp(finite(position[1],0),-20,20),clamp(finite(position[2],0),-20,20)],
    rotation:[clamp(finite(rotation[0],0),-180,180),clamp(finite(rotation[1],0),-180,180),clamp(finite(rotation[2],0),-180,180)],
  };
}
function poseTimeline(value){
  const source=value&&typeof value==='object'?value:{},frames=Array.isArray(source.keyframes)?source.keyframes:[];
  const keyframes=frames.map(frame=>({
    time:clamp(finite(frame&&frame.time,0),0,1),
    motionTransform:motionTransform(frame&&frame.motionTransform),
    rigCorrections:rigCorrections(frame&&frame.rigCorrections),
  })).sort((a,b)=>a.time-b.time);
  return {version:1,keyframes};
}
function samplePoseTimeline(value,phase){
  const timeline=poseTimeline(value),frames=timeline.keyframes;if(!frames.length)return null;
  const time=clamp(finite(phase,0),0,1);let left=frames[0],right=frames[frames.length-1];
  for(let index=0;index<frames.length;index++){if(frames[index].time<=time)left=frames[index];if(frames[index].time>=time){right=frames[index];break;}}
  const span=Math.max(.000001,right.time-left.time),alpha=left===right?0:clamp((time-left.time)/span,0,1),mix=(a,b)=>a+(b-a)*alpha;
  const root={position:[0,1,2].map(i=>mix(left.motionTransform.position[i],right.motionTransform.position[i])),rotation:[0,1,2].map(i=>mix(left.motionTransform.rotation[i],right.motionTransform.rotation[i]))};
  const bones={},keys=new Set(Object.keys(left.rigCorrections).concat(Object.keys(right.rigCorrections)));
  keys.forEach(key=>{const a=left.rigCorrections[key]||right.rigCorrections[key]||[0,0,0],b=right.rigCorrections[key]||left.rigCorrections[key]||a;bones[key]=[0,1,2].map(i=>mix(a[i],b[i]));});
  return {motionTransform:root,rigCorrections:bones};
}
function rootYawMode(value){
  const mode=String(value||'auto').toLowerCase();
  return ['auto','locked','authored'].includes(mode)?mode:'auto';
}
function lockRootYaw(entry){
  const mode=rootYawMode(entry&&entry.rootYawMode);
  if(mode==='locked')return true;
  if(mode==='authored')return false;
  const direction=directionVector(entry&&entry.direction);
  return !!(entry&&entry.state==='grounded'&&Math.abs(direction[0])<.25&&Math.abs(direction[1])>.5);
}
function applyMotionTransform(THREE,object,rest,value){
  if(!THREE||!object||!rest||!object.position||!object.quaternion)return false;
  const transform=motionTransform(value);
  object.position.copy(rest.position).add(new THREE.Vector3().fromArray(transform.position));
  const delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(transform.rotation[0]),
    THREE.MathUtils.degToRad(transform.rotation[1]),
    THREE.MathUtils.degToRad(transform.rotation[2]),
    'XYZ'
  ));
  object.quaternion.copy(rest.quaternion).multiply(delta).normalize();
  if(rest.scale&&object.scale)object.scale.copy(rest.scale);
  if(object.updateMatrixWorld)object.updateMatrixWorld(true);
  return true;
}
function normalizeEntry(source,index){
  const src=source&&typeof source==='object'?source:{};
  const spec=binding(src.binding||{clip:src.clip,asset:src.asset});
  const state=['grounded','jump','fall','land','action'].includes(String(src.state||''))?String(src.state):'grounded';
  return {
    id:String(src.id||('motion-'+(index+1))),name:String(src.name||src.label||spec.clip||('Motion '+(index+1))),
    state,action:state==='action'?String(src.action||src.name||spec.clip||'action'):null,
    direction:directionVector(src.direction),speed:Math.max(0,finite(src.speed,state==='grounded'?1.8:0)),
    speedTolerance:Math.max(.1,finite(src.speedTolerance,state==='grounded'?2.2:1)),
    asset:spec.asset,clip:spec.clip,loop:src.loop==null?!['jump','land','action'].includes(state):src.loop===true,
    priority:clamp(finite(src.priority,1),.05,10),
    // A NEGATIVE rate plays the clip backwards, which is how a backstep reuses the
    // forward walk instead of shipping a second cycle. The old `.1` floor silently
    // turned -1 into 0.1: a walk crawling forwards at a tenth speed.
    playbackRate:signedRate(src.playbackRate),
    sourceOrientation:['auto','y-up','z-up','z-up-inverted','x-up','x-up-inverted','y-up-backward'].includes(String(src.sourceOrientation||''))?String(src.sourceOrientation):'y-up',
    rootYawMode:rootYawMode(src.rootYawMode),
    previewScale:clamp(finite(src.previewScale,1),.0001,100),
    curveCorrection:curveCorrection(src.curveCorrection),
    motionTransform:motionTransform(src.motionTransform),
    rigCorrections:rigCorrections(src.rigCorrections),
    poseTimeline:poseTimeline(src.poseTimeline),
    tags:Array.isArray(src.tags)?src.tags.map(String):[],
  };
}
function fromLegacy(map){
  const source=map&&typeof map==='object'?map:{};
  return Object.keys(source).filter(key=>source[key]!=null&&source[key]!=='').map((key,index)=>{
    const preset=LEGACY_PRESETS[key]||{state:'action',direction:'idle',speed:0,loop:false};
    const spec=binding(source[key]);
    return normalizeEntry(Object.assign({id:'legacy-'+key,name:key,action:preset.state==='action'?key:null,clip:spec.clip,asset:spec.asset},preset),index);
  });
}
function normalize(set,legacy){
  const entries=Array.isArray(set)?set:(set&&Array.isArray(set.entries)?set.entries:null);
  return (entries&&entries.length?entries:fromLegacy(legacy)).map(normalizeEntry).filter(entry=>entry.clip||assetKey(entry.asset));
}
function phaseOf(context){
  const c=context||{};
  if(c.action)return 'action';
  if(c.justLanded)return 'land';
  if(c.grounded===false)return finite(c.velocityY,0)>.15?'jump':'fall';
  return 'grounded';
}
function score(entry,context){
  const c=context||{},phase=phaseOf(c);
  if(entry.state!==phase)return -Infinity;
  if(phase==='action'&&entry.action&&String(entry.action)!==String(c.action))return -Infinity;
  if(phase==='jump'||phase==='fall'||phase==='action')return entry.priority;
  const x=finite(c.x,0),z=finite(c.z,0),speed=Math.max(0,finite(c.speed,Math.hypot(x,z)));
  const length=Math.hypot(x,z),dir=length>.0001?[x/length,z/length]:[0,0];
  const idle=entry.speed<.08&&Math.hypot(entry.direction[0],entry.direction[1])<.08;
  const speedError=Math.abs(speed-entry.speed)/entry.speedTolerance;
  const directionDot=idle?(speed<.12?1:-1):(dir[0]*entry.direction[0]+dir[1]*entry.direction[1]);
  const directionError=(1-directionDot)*1.35;
  // Landing is a one-frame transition choice, but it still needs velocity:
  // standing/slow uses Run To Stop; arriving at running speed uses Soccer's
  // Falling To Landing and flows straight back into the run cycle.
  if(phase==='land')return Math.log(entry.priority)-speedError*speedError-directionError;
  const accelError=Math.max(0,finite(c.acceleration,0)-12)*.006;
  return Math.log(entry.priority)-speedError*speedError-directionError-accelError;
}
function select(set,context,limit){
  const c=context||{},x=finite(c.x,0),z=finite(c.z,0),speed=Math.max(0,finite(c.speed,Math.hypot(x,z))),length=Math.hypot(x,z),all=(set||[]).map(entry=>({entry,score:score(entry,c)})).filter(item=>Number.isFinite(item.score));
  // Pawn Studio previews one selected entry at full influence. At rest, Play
  // must do the same: broad Walk/Strafe tolerances previously retained a few
  // percent of locomotion weight and proportionally weakened Idle's authored
  // whole-slot rotation. Keep blending once movement really starts.
  // A tiny analogue tilt must be allowed to enter Walk at a tiny playback rate.
  // Keep only a hardware-noise-sized dead band here; the input mapper already
  // applies the user's real stick deadzone before this point.
  const exactIdle=speed<.02&&phaseOf(c)==='grounded'?all.filter(item=>item.entry.speed<.08&&Math.hypot(item.entry.direction[0],item.entry.direction[1])<.08):[];
  let candidates=exactIdle.length?exactIdle:all;
  if(!exactIdle.length&&phaseOf(c)==='grounded'&&length>.0001){
    const dir=[x/length,z/length],moving=candidates.filter(item=>item.entry.speed>=.08&&Math.hypot(item.entry.direction[0],item.entry.direction[1])>.08);
    if(moving.length){
      moving.forEach(item=>{item.directionAffinity=dir[0]*item.entry.direction[0]+dir[1]*item.entry.direction[1];});
      const bestDirection=Math.max.apply(Math,moving.map(item=>item.directionAffinity));
      // Direction is the first gate, speed the second. Without this gate an
      // exact Forward request could admit just one side of a tied Left/Right
      // pair into the top-N set, making a straight Run visibly drift sideways.
      // An EXACT cardinal request must stay cardinal. The previous .45 band
      // admitted both forward diagonals into a straight Run (dot=.707); real
      // left/right takes are never perfectly mirrored, so their residual blend
      // made the body walk slightly crooked toward the shoulder crosshair.
      // A genuinely diagonal stick still gets the wider neighbourhood and can
      // blend its adjacent cardinal samples smoothly.
      const cardinal=Math.abs(dir[0])<.08||Math.abs(dir[1])<.08;
      const directionBand=cardinal?.08:.45;
      candidates=moving.filter(item=>item.directionAffinity>=bestDirection-directionBand);
    }
  }
  const ranked=candidates.sort((a,b)=>b.score-a.score).slice(0,exactIdle.length?1:Math.max(1,limit||3));
  if(!ranked.length)return [];
  const peak=ranked[0].score,weighted=ranked.map(item=>Object.assign(item,{weight:Math.exp((item.score-peak)*2.4)}));
  const total=weighted.reduce((sum,item)=>sum+item.weight,0)||1;
  return weighted.map(item=>({entry:item.entry,score:item.score,weight:item.weight/total}));
}

window.LK_RUNTIME_CHARACTER_ANIMATION_SET=Object.freeze({DIRECTIONS,LEGACY_PRESETS,assetKey,binding,directionVector,curveCorrection,motionTransform,poseTimeline,samplePoseTimeline,applyMotionTransform,rootYawMode,lockRootYaw,rigCorrections,normalizeEntry,fromLegacy,normalize,phaseOf,score,select});
})();
