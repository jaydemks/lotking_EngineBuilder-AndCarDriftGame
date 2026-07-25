/* =========================================================
   LOT KING - Humanoid/Mixamo procedural fallback clips
   Generates animation-only clips directly against the Main
   Mesh rest skeleton. These clips are deliberately fallback
   content: an authored GLB/FBX take always wins when it binds.
   No position or scale track is produced, so Pawn Studio Main
   Mesh fitting remains authoritative in editor and Play.
   ========================================================= */
(function(){
'use strict';

const SLOT_DURATIONS=Object.freeze({idle:2.8,walk:1.05,run:.72,strafeLeft:.92,strafeRight:.92,jump:.72,land:.48,shoot:.86,pass:.7,cross:.94,tackle:.82,save:.72,diveLeft:.9,diveRight:.9,celebrate:1.65,defeat:1.45,interact:.9});
const LOOP_SLOTS=new Set(['idle','walk','run','strafeLeft','strafeRight']);
const BONE_ALIASES=Object.freeze({
  hips:['hips','pelvis'],spine:['spine'],spine1:['spine1'],spine2:['spine2','chest'],neck:['neck'],head:['head'],
  shoulderL:['leftshoulder','shoulderl'],armL:['leftarm','upperarml'],forearmL:['leftforearm','lowerarml'],handL:['lefthand','handl'],
  shoulderR:['rightshoulder','shoulderr'],armR:['rightarm','upperarmr'],forearmR:['rightforearm','lowerarmr'],handR:['righthand','handr'],
  thighL:['leftupleg','leftthigh','thighl'],legL:['leftleg','leftlowerleg','calfl'],footL:['leftfoot','footl'],toeL:['lefttoebase','toel'],
  thighR:['rightupleg','rightthigh','thighr'],legR:['rightleg','rightlowerleg','calfr'],footR:['rightfoot','footr'],toeR:['righttoebase','toer'],
});

function canonical(value){return String(value||'').toLowerCase().replace(/^(?:mixamorig|armature|skeleton|rig)/,'').replace(/[^a-z0-9]/g,'');}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function add(pose,key,x,y,z){const current=pose[key]||(pose[key]=[0,0,0]);current[0]+=(x||0);current[1]+=(y||0);current[2]+=(z||0);return pose;}
function readyPose(pose,keeper){
  add(pose,'armL',4,0,keeper?48:58);add(pose,'armR',4,0,keeper?-48:-58);
  add(pose,'forearmL',0,keeper?-20:-7,keeper?-18:-10);add(pose,'forearmR',0,keeper?20:7,keeper?18:10);
  // Never bake a permanent crouch or hip spread into the fallback. Rest-pose
  // legs are the safest neutral stance across Mixamo FBX/glTF conversions;
  // locomotion/action samples add only temporary, symmetric movement.
  add(pose,'spine',keeper?4:2,0,0);add(pose,'spine2',keeper?2:1,0,0);
  return pose;
}
function samplePose(slot,phase,role){
  const p=clamp(Number(phase)||0,0,1),cycle=Math.sin(p*Math.PI*2),cycle2=Math.cos(p*Math.PI*2),pulse=Math.sin(p*Math.PI),keeper=role==='goalkeeper';
  const pose={};
  if(slot==='idle'){
    readyPose(pose,keeper);add(pose,'spine2',Math.sin(p*Math.PI*2)*1.25,Math.sin(p*Math.PI)*.7,cycle*.45);add(pose,'head',-cycle*.7,cycle2*.7,0);
    add(pose,'forearmL',0,cycle*1.8,0);add(pose,'forearmR',0,-cycle*1.8,0);add(pose,'hips',0,cycle*.7,cycle*.45);return pose;
  }
  if(slot==='walk'||slot==='run'){
    const run=slot==='run',leg=run?46:28,arm=run?39:24,bend=run?16:8;
    readyPose(pose,false);add(pose,'armL',-cycle*arm,0,0);add(pose,'armR',cycle*arm,0,0);add(pose,'forearmL',-Math.max(0,-cycle)*35,0,0);add(pose,'forearmR',-Math.max(0,cycle)*35,0,0);
    add(pose,'thighL',cycle*leg,0,0);add(pose,'thighR',-cycle*leg,0,0);add(pose,'legL',Math.max(0,-cycle)*55+bend,0,0);add(pose,'legR',Math.max(0,cycle)*55+bend,0,0);
    add(pose,'footL',-Math.max(0,cycle)*15+Math.max(0,-cycle)*10,0,0);add(pose,'footR',-Math.max(0,-cycle)*15+Math.max(0,cycle)*10,0,0);
    add(pose,'spine',run?12:4,cycle*(run?5:3),-cycle*2.2);add(pose,'spine2',run?6:2,-cycle*(run?5:3),0);add(pose,'hips',0,cycle*3,cycle*2.5);add(pose,'head',run?-6:-2,0,cycle*1.2);return pose;
  }
  if(slot==='strafeLeft'||slot==='strafeRight'){
    const dir=slot==='strafeLeft'?-1:1;readyPose(pose,keeper);add(pose,'hips',0,dir*5,dir*cycle*4);add(pose,'spine',5,-dir*7,-dir*5);add(pose,'thighL',cycle*15,0,dir*18*cycle2);add(pose,'thighR',-cycle*15,0,-dir*18*cycle2);add(pose,'legL',16+Math.max(0,-cycle)*20,0,0);add(pose,'legR',16+Math.max(0,cycle)*20,0,0);add(pose,'armL',-cycle*12,0,0);add(pose,'armR',cycle*12,0,0);return pose;
  }
  if(slot==='jump'){
    readyPose(pose,keeper);const rise=Math.sin(Math.min(1,p/.55)*Math.PI*.5),fall=p>.55?(p-.55)/.45:0;add(pose,'spine',-8*rise+12*fall,0,0);add(pose,'thighL',-32*rise+18*fall,0,4);add(pose,'thighR',-32*rise+18*fall,0,-4);add(pose,'legL',55*rise-20*fall,0,0);add(pose,'legR',55*rise-20*fall,0,0);add(pose,'armL',-70*rise,0,-24*rise);add(pose,'armR',-70*rise,0,24*rise);return pose;
  }
  if(slot==='land'){
    readyPose(pose,keeper);add(pose,'spine',18*pulse,0,0);add(pose,'thighL',24*pulse,0,4);add(pose,'thighR',24*pulse,0,-4);add(pose,'legL',-38*pulse,0,0);add(pose,'legR',-38*pulse,0,0);add(pose,'armL',22*pulse,0,0);add(pose,'armR',22*pulse,0,0);return pose;
  }
  if(slot==='shoot'||slot==='pass'||slot==='cross'){
    const power=slot==='shoot'?1:(slot==='cross'?.82:.62),wind=Math.sin(Math.min(1,p/.48)*Math.PI),strike=Math.sin(clamp((p-.32)/.68,0,1)*Math.PI);
    readyPose(pose,false);add(pose,'hips',0,-18*wind+28*strike,0);add(pose,'spine',8*wind,16*wind-22*strike,-4*wind);add(pose,'thighR',-52*wind+78*strike*power,0,-5);add(pose,'legR',65*wind-72*strike*power,0,0);add(pose,'footR',-18*wind+30*strike,0,0);add(pose,'thighL',12*pulse,0,4);add(pose,'legL',-18*pulse,0,0);add(pose,'armL',-12*wind,0,-35*wind);add(pose,'armR',25*wind,0,38*wind);add(pose,'head',-5*pulse,-10*wind,0);return pose;
  }
  if(slot==='tackle'){
    readyPose(pose,false);add(pose,'spine',22*pulse,-10*pulse,0);add(pose,'thighR',-55*pulse,0,-12*pulse);add(pose,'legR',70*pulse,0,0);add(pose,'thighL',22*pulse,0,9*pulse);add(pose,'legL',-32*pulse,0,0);add(pose,'armL',-15*pulse,0,-42*pulse);add(pose,'armR',20*pulse,0,45*pulse);return pose;
  }
  if(slot==='save'){
    readyPose(pose,true);add(pose,'spine',-10*pulse,0,0);add(pose,'armL',-78*pulse,0,-34*pulse);add(pose,'armR',-78*pulse,0,34*pulse);add(pose,'forearmL',-18*pulse,0,0);add(pose,'forearmR',-18*pulse,0,0);add(pose,'head',-8*pulse,0,0);add(pose,'legL',22*pulse,0,0);add(pose,'legR',22*pulse,0,0);return pose;
  }
  if(slot==='diveLeft'||slot==='diveRight'){
    const dir=slot==='diveLeft'?-1:1,reach=Math.sin(Math.min(1,p/.72)*Math.PI*.5),recover=p>.72?(p-.72)/.28:0,k=reach*(1-recover);
    readyPose(pose,true);add(pose,'hips',0,dir*12*k,dir*34*k);add(pose,'spine',-8*k,dir*8*k,dir*44*k);add(pose,'spine2',-5*k,dir*8*k,dir*18*k);add(pose,'head',5*k,-dir*9*k,-dir*16*k);
    add(pose,'armL',-55*k,0,dir<0?-72*k:-30*k);add(pose,'armR',-55*k,0,dir>0?72*k:30*k);add(pose,'forearmL',-20*k,0,-dir*12*k);add(pose,'forearmR',-20*k,0,dir*12*k);add(pose,'thighL',-16*k,0,dir*16*k);add(pose,'thighR',22*k,0,-dir*18*k);add(pose,'legL',24*k,0,0);add(pose,'legR',-20*k,0,0);return pose;
  }
  if(slot==='celebrate'){
    readyPose(pose,false);add(pose,'armL',-132*pulse,0,-30*pulse);add(pose,'armR',-132*pulse,0,30*pulse);add(pose,'forearmL',-22*pulse,0,0);add(pose,'forearmR',-22*pulse,0,0);add(pose,'spine',-10*pulse,cycle*8,0);add(pose,'head',-12*pulse,-cycle*10,0);add(pose,'thighL',-12*Math.max(0,cycle),0,0);add(pose,'thighR',-12*Math.max(0,-cycle),0,0);return pose;
  }
  if(slot==='defeat'){
    readyPose(pose,false);const settle=Math.sin(p*Math.PI*.5);add(pose,'spine',24*settle,0,0);add(pose,'spine2',18*settle,0,0);add(pose,'neck',18*settle,0,0);add(pose,'head',24*settle,0,0);add(pose,'armL',18*settle,0,18*settle);add(pose,'armR',18*settle,0,-18*settle);add(pose,'forearmL',20*settle,0,0);add(pose,'forearmR',20*settle,0,0);return pose;
  }
  readyPose(pose,keeper);add(pose,'armR',-85*pulse,0,20*pulse);add(pose,'forearmR',-38*pulse,0,0);add(pose,'spine',0,-12*pulse,0);add(pose,'hips',0,5*pulse,0);add(pose,'head',0,10*pulse,0);return pose;
}

function findRig(root){
  const bones=[];if(root&&root.traverse)root.traverse(node=>{if(node&&node.isBone&&node.quaternion)bones.push(node);});
  const byKey=new Map();bones.forEach(bone=>byKey.set(canonical(bone.name),bone));const rig={};
  Object.keys(BONE_ALIASES).forEach(role=>{for(const alias of BONE_ALIASES[role]){const exact=byKey.get(alias),suffix=!exact&&bones.find(bone=>canonical(bone.name).endsWith(alias));if(exact||suffix){rig[role]=exact||suffix;break;}}});
  return {bones,rig,compatible:!!(rig.hips&&(rig.spine||rig.spine1||rig.spine2)&&rig.thighL&&rig.thighR&&rig.armL&&rig.armR)};
}
function createClip(THREE,root,slot,options){
  if(!THREE||!THREE.AnimationClip||!THREE.QuaternionKeyframeTrack)return null;
  const found=findRig(root);if(!found.compatible)return null;
  const opts=options||{},duration=SLOT_DURATIONS[slot]||.9,frames=LOOP_SLOTS.has(slot)?9:8,times=[];for(let i=0;i<frames;i++)times.push(duration*i/(frames-1));
  if(root.updateMatrixWorld)root.updateMatrixWorld(true);
  const tracks=[],deg=Math.PI/180,rootWorld=new THREE.Quaternion();if(root.getWorldQuaternion)root.getWorldQuaternion(rootWorld);
  Object.keys(found.rig).forEach(role=>{
    const bone=found.rig[role],values=[];let varied=false,first=null;
    // Pose values are authored in character space (X pitch, Y turn, Z lean),
    // not in arbitrary exporter bone axes. Convert those three axes into this
    // bone's rest-local space before composing its quaternion. This avoids a
    // knee bend becoming a leg twist on Mixamo FBX -> glTF rigs.
    const boneWorld=new THREE.Quaternion(),inverseBone=new THREE.Quaternion();if(bone.getWorldQuaternion)bone.getWorldQuaternion(boneWorld);inverseBone.copy(boneWorld).invert();
    const axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)].map(axis=>axis.applyQuaternion(rootWorld).applyQuaternion(inverseBone).normalize());
    times.forEach((time,index)=>{const angles=samplePose(slot,time/duration,opts.role)[role]||[0,0,0],delta=new THREE.Quaternion(),turn=new THREE.Quaternion();for(let axis=0;axis<3;axis++)if(Math.abs(angles[axis])>.00001)delta.multiply(turn.setFromAxisAngle(axes[axis],angles[axis]*deg));const value=bone.quaternion.clone().multiply(delta).normalize();if(!first)first=value.clone();else if(Math.abs(first.dot(value))<.999999)varied=true;values.push(value.x,value.y,value.z,value.w);});
    // Bind by the real Object3D name. `.bones[name]` only works when the
    // AnimationMixer root itself is a SkinnedMesh; imported GLBs normally use
    // a Group root containing one or more SkinnedMeshes.
    if(varied)tracks.push(new THREE.QuaternionKeyframeTrack(bone.name+'.quaternion',times,values));
  });
  if(!tracks.length)return null;
  const clip=new THREE.AnimationClip('LK Placeholder · '+slot,duration,tracks);clip.userData={lkProceduralPlaceholder:true,lkPlaceholderSlot:slot,lkTargetRig:'humanoid',lkLoop:LOOP_SLOTS.has(slot)};
  if(opts.assetKey)clip.userData.lkAnimationAssetKey=String(opts.assetKey);
  return clip;
}
function createSet(THREE,root,slots,options){const result={};(slots||[]).forEach(slot=>{const clip=createClip(THREE,root,slot,options);if(clip)result[slot]=clip;});return result;}

window.LK_RUNTIME_MIXAMO_PLACEHOLDER_CLIPS=Object.freeze({SLOT_DURATIONS,LOOP_SLOTS,BONE_ALIASES,canonical,findRig,samplePose,createClip,createSet});
})();
