/* =========================================================
   LOT KING - Shared Character locomotion blend controller
   Blendspace-lite over GLB clips: predicts the character
   velocity curve and cross-blends idle/walk/run/strafe clips,
   with a one-shot action layer (interact, shoot, save, dive...).
   Inspired by Unreal-style motion blending, kept data-driven:
   missing clips degrade to the nearest available one.
   ========================================================= */
(function(){
'use strict';

const LOCOMOTION_SLOTS = ['idle', 'walk', 'run', 'strafeLeft', 'strafeRight'];
const PROCEDURAL_FALLBACK_SLOTS = ['idle','walk','run','strafeLeft','strafeRight','jump','land','shoot','pass','cross','tackle','save','diveLeft','diveRight','celebrate','defeat','interact','fireSingleIdle','fireSingleWalk','fireSingleRun','fireAutoIdle','fireAutoWalk','fireAutoRun'];

function finite(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function positiveModulo(value, divisor){
  const d = Math.max(.0001, finite(divisor, 1));
  return ((finite(value, 0) % d) + d) % d;
}

// Blend-space clips must agree on WHERE they are inside a gait cycle, not on
// their raw time in seconds. A 0.8 s Run and a 1.1 s Walk left free-running are
// smooth individually but periodically oppose their planted feet; the blend
// then reads as two tiny steps before returning to normal. Locking normalized
// phase once per update removes that beat without touching weights, playback
// rate or non-looping Jump/Land/Action clips.
function synchronizeLoopPhases(selected, actions){
  const loops = (selected || []).map(item => {
    const entry = item && item.entry;
    const action = entry && actions && actions[entry.id];
    const clip = action && action.getClip && action.getClip();
    const duration = Math.max(.0001, finite(clip && clip.duration, 0));
    return entry && entry.state === 'grounded' && entry.loop !== false && entry.speed > .08 && action && clip
      ? {entry, action, duration, weight:Math.max(0, finite(item.weight, 0))} : null;
  }).filter(Boolean);
  if(loops.length < 2) return false;
  loops.sort((a, b) => b.weight - a.weight);
  const anchor = loops[0];
  const phase = positiveModulo(anchor.action.time, anchor.duration) / anchor.duration;
  for(let index = 1; index < loops.length; index++){
    loops[index].action.time = phase * loops[index].duration;
  }
  return true;
}

function normalizeName(name){
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function animationSpec(value){
  let parsed=value;
  if(typeof parsed==='string'&&parsed.trim().charAt(0)==='{')try{parsed=JSON.parse(parsed);}catch(err){}
  if(parsed&&typeof parsed==='object'){
    const asset=parsed.asset&&typeof parsed.asset==='object'?parsed.asset:null;
    return {clip:String(parsed.clip||parsed.name||''),asset,playbackRate:finite(parsed.playbackRate,finite(asset&&asset.playbackRate,1))};
  }
  return {clip:String(parsed||''),asset:null,playbackRate:1};
}
function animationAssetKey(ref){return ref&&typeof ref==='object'?String(ref.dbKey||ref.key||ref.id||ref.src||''):'';}
function motionCurveCorrection(entry,phase){
  const correction=entry&&entry.curveCorrection||{},offset=Array.isArray(correction.offset)?correction.offset:[0,0,0],t=Math.max(0,Math.min(1,finite(phase,0))),influence=Math.max(0,Math.min(1,finite(correction.influence,1))),weight=t<=0||t>=1?0:Math.sin(Math.PI*t)**2*influence;
  return {x:finite(offset[0],0)*weight||0,y:finite(offset[1],0)*weight||0,z:finite(offset[2],0)*weight||0,weight};
}
function sourceOrientationValue(value){const key=String(value||'y-up').toLowerCase();return ['auto','y-up','z-up','z-up-inverted','x-up','x-up-inverted','y-up-backward'].includes(key)?key:'y-up';}
function sourceOrientationQuaternion(THREE,value){
  const q=new THREE.Quaternion(),axis=sourceOrientationValue(value),half=Math.PI*.5;
  if(axis==='z-up')q.setFromAxisAngle(new THREE.Vector3(1,0,0),-half);
  else if(axis==='z-up-inverted')q.setFromAxisAngle(new THREE.Vector3(1,0,0),half);
  else if(axis==='x-up')q.setFromAxisAngle(new THREE.Vector3(0,0,1),half);
  else if(axis==='x-up-inverted')q.setFromAxisAngle(new THREE.Vector3(0,0,1),-half);
  else if(axis==='y-up-backward')q.setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
  return q;
}
function lockQuaternionYawDrift(track,THREE){
  if(!track||!track.values||track.values.length<8||!THREE)return track;
  const base=new THREE.Quaternion().fromArray(track.values,0).normalize(),inverseBase=base.clone().invert(),sample=new THREE.Quaternion(),relative=new THREE.Quaternion(),twist=new THREE.Quaternion(),swing=new THREE.Quaternion(),corrected=new THREE.Quaternion();
  for(let i=0;i<track.values.length;i+=4){
    sample.fromArray(track.values,i).normalize();
    relative.copy(inverseBase).multiply(sample).normalize();
    twist.set(0,relative.y,0,relative.w);
    if(twist.lengthSq()<1e-10)twist.identity();else twist.normalize();
    swing.copy(relative).multiply(twist.invert()).normalize();
    corrected.copy(base).multiply(swing).normalize().toArray(track.values,i);
  }
  track.userData=Object.assign({},track.userData||{},{lkRootYawLocked:true});
  return track;
}
function lockClipRootYaw(clip,targetRoot,THREE){
  if(!clip||!Array.isArray(clip.tracks)||!targetRoot||!THREE)return clip;
  const bones=[];if(targetRoot.traverse)targetRoot.traverse(node=>{if(node&&node.isBone)bones.push(node);});
  const hip=bones.find(bone=>/^(?:hips?|pelvis|root)$/i.test(normalizedTrackNode(bone.name)))||bones.find(bone=>!bone.parent||!bone.parent.isBone)||bones[0];
  if(!hip)return clip;
  const hipKey=normalizedTrackNode(hip.name),result=clip.clone?clip.clone():clip;
  (result.tracks||[]).forEach(track=>{const name=String(track&&track.name||''),binding=trackNodeBinding(name),property=(name.match(/\.([^.\]]+)$/)||[])[1]||'';if(property==='quaternion'&&normalizedTrackNode(binding.source)===hipKey)lockQuaternionYawDrift(track,THREE);});
  result.userData=Object.assign({},clip.userData||{},result.userData||{},{lkRootYawLocked:true});
  return result;
}
function normalizedTrackNode(name){
  let value=String(name||'').trim();
  // Mixamo/Blender exporters use several equivalent node paths:
  // Armature|mixamorig:Hips, Armature/Hips and mixamorigHips.  PropertyBinding
  // needs the authored target name, while matching needs one canonical key.
  value=value.split(/[\\/|:]/).pop()||value;
  // Three PropertyBinding removes ':' from FBX names. A source namespace such
  // as `mixamorig5:Hips` therefore arrives as `mixamorig5Hips`, not as the
  // target mannequin's `mixamorigHips`. Strip exporter-added numeric namespace
  // suffixes together with the rig prefix so both canonicalize to `hips`.
  // `RightArm` starts with the letters "rig" too. Do not mistake that side
  // name for a generic Rig namespace or the complete right arm disappears
  // from retargeting and post-animation weapon posing.
  value=value.replace(/^(?:mixamorig|armature|skeleton|rig(?!ht))(?:[_\-\s]*\d+)?[_\-\s]*/i,'');
  return value.replace(/[^a-z0-9]/gi,'').toLowerCase();
}
function trackNodeBinding(name){
  const value=String(name||'');
  const boneMatch=value.match(/^\.bones\[([^\]]+)\]/);
  if(boneMatch)return {source:boneMatch[1],replace:target=>value.replace(boneMatch[1],target)};
  const dot=value.indexOf('.');
  if(dot===0)return {source:'',replace:null};
  if(dot>0)return {source:value.slice(0,dot),replace:target=>target+value.slice(dot)};
  return {source:value,replace:target=>target};
}
function analyzeClipBinding(clip,node){
  const exact=new Set(),canonical=new Set();
  if(node&&node.traverse)node.traverse(child=>{if(!child)return;if(child.name){exact.add(child.name);const key=normalizedTrackNode(child.name);if(key)canonical.add(key);}});
  let matched=0;const unmatched=[];const tracks=clip&&Array.isArray(clip.tracks)?clip.tracks:[];
  tracks.forEach(track=>{
    const binding=trackNodeBinding(track&&track.name);
    const ok=binding.source===''||exact.has(binding.source)||canonical.has(normalizedTrackNode(binding.source));
    if(ok)matched++;else if(unmatched.length<8)unmatched.push(binding.source||String(track&&track.name||''));
  });
  return {total:tracks.length,matched,unmatched,compatible:tracks.length>0&&matched>0,complete:tracks.length>0&&matched===tracks.length};
}
function analyzeClipMotion(clip){
  const tracks=clip&&Array.isArray(clip.tracks)?clip.tracks:[];let animated=0;
  tracks.forEach(track=>{
    const times=track&&track.times||[],values=track&&track.values||[];
    if(times.length<2||!values.length)return;
    const stride=Math.max(1,Math.floor(values.length/times.length));let varying=false;
    for(let frame=1;frame<times.length&&!varying;frame++)for(let part=0;part<stride;part++)if(Math.abs(Number(values[frame*stride+part])-Number(values[part]))>1e-6){varying=true;break;}
    if(varying)animated++;
  });
  return {total:tracks.length,animated,hasMotion:animated>0};
}
function skeletonRigSpan(THREE,bones,root){
  if(!THREE||!bones||!bones.length)return 0;
  if(root&&root.updateMatrixWorld)root.updateMatrixWorld(true);
  const box=new THREE.Box3(),point=new THREE.Vector3();
  bones.forEach(bone=>{if(bone&&bone.getWorldPosition){bone.getWorldPosition(point);if(root&&root.worldToLocal)root.worldToLocal(point);box.expandByPoint(point);}});
  if(box.isEmpty())return 0;
  return box.getSize(point).length();
}
function matchedRigScale(THREE,pairs,targetRoot,sourceRoot,targetBones,sourceBones){
  if(targetRoot&&targetRoot.updateMatrixWorld)targetRoot.updateMatrixWorld(true);
  if(sourceRoot&&sourceRoot.updateMatrixWorld)sourceRoot.updateMatrixWorld(true);
  const ratios=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),d=new THREE.Vector3();
  (pairs||[]).forEach(pair=>{
    const targetParent=pair.target&&pair.target.parent,sourceParent=pair.source&&pair.source.parent;
    if(!targetParent||!sourceParent||!targetParent.isBone||!sourceParent.isBone)return;
    pair.target.getWorldPosition(a);targetParent.getWorldPosition(b);pair.source.getWorldPosition(c);sourceParent.getWorldPosition(d);
    // Compare the authored rigs in their respective root spaces. The Main
    // Mesh world scale (for example 0.4) is applied by its outer Object3D
    // and must not leak into the retarget ratio or it would be counted twice.
    if(targetRoot&&targetRoot.worldToLocal){targetRoot.worldToLocal(a);targetRoot.worldToLocal(b);}
    if(sourceRoot&&sourceRoot.worldToLocal){sourceRoot.worldToLocal(c);sourceRoot.worldToLocal(d);}
    const targetLength=a.distanceTo(b),sourceLength=c.distanceTo(d);
    if(targetLength>1e-6&&sourceLength>1e-6){const ratio=targetLength/sourceLength;if(Number.isFinite(ratio)&&ratio>.001&&ratio<100)ratios.push(ratio);}
  });
  if(ratios.length){ratios.sort((x,y)=>x-y);const middle=Math.floor(ratios.length/2);return ratios.length%2?ratios[middle]:(ratios[middle-1]+ratios[middle])*.5;}
  const targetSpan=skeletonRigSpan(THREE,targetBones,targetRoot),sourceSpan=skeletonRigSpan(THREE,sourceBones,sourceRoot);
  return targetSpan>1e-6&&sourceSpan>1e-6?Math.max(.001,Math.min(100,targetSpan/sourceSpan)):1;
}
function protectTargetRigClip(clip,targetRoot,THREE,options){
  if(!clip||!Array.isArray(clip.tracks))return clip;
  const boneKeys=new Set(),bones=[];if(targetRoot&&targetRoot.traverse)targetRoot.traverse(node=>{if(node&&node.isBone){bones.push(node);boneKeys.add(normalizedTrackNode(node.name));}});
  const targetHip=bones.find(bone=>/^(?:hips?|pelvis|root)$/i.test(normalizedTrackNode(bone.name)))||bones.find(bone=>!bone.parent||!bone.parent.isBone)||bones[0],targetHipKey=targetHip&&normalizedTrackNode(targetHip.name);
  const result=clip.clone?clip.clone():clip,removed=[];
  result.tracks=(result.tracks||[]).filter(track=>{
    const name=String(track&&track.name||''),binding=trackNodeBinding(name),property=(name.match(/\.([^.\]]+)$/)||[])[1]||'';
    const destructive=property==='scale'||(property==='position'&&boneKeys.has(normalizedTrackNode(binding.source)));
    if(destructive)removed.push(name);return !destructive;
  });
  if(THREE&&targetHip&&targetHip.quaternion)result.tracks.forEach(track=>{
    const name=String(track&&track.name||''),binding=trackNodeBinding(name),property=(name.match(/\.([^.\]]+)$/)||[])[1]||'';
    if(property!=='quaternion'||normalizedTrackNode(binding.source)!==targetHipKey||!track.values||track.values.length<4)return;
    const first=new THREE.Quaternion().fromArray(track.values,0).normalize(),correction=targetHip.quaternion.clone().multiply(first.invert()),manual=sourceOrientationQuaternion(THREE,options&&options.sourceOrientation),sample=new THREE.Quaternion(),aligned=new THREE.Quaternion();
    for(let i=0;i<track.values.length;i+=4){sample.fromArray(track.values,i).normalize();aligned.copy(correction).multiply(sample);if(sourceOrientationValue(options&&options.sourceOrientation)!=='auto'&&sourceOrientationValue(options&&options.sourceOrientation)!=='y-up')aligned.premultiply(manual);aligned.normalize().toArray(track.values,i);}
    if(options&&options.lockRootYaw)lockQuaternionYawDrift(track,THREE);
  });
  result.userData=Object.assign({},clip.userData||{},result.userData||{},{lkTargetRigProtected:true,lkRemovedTransformTracks:removed});
  result.userData.lkBinding=analyzeClipBinding(result,targetRoot);result.userData.lkMotion=analyzeClipMotion(result);
  return result;
}
function protectRuntimeMainMeshProportions(clip){
  if(!clip||!Array.isArray(clip.tracks))return clip;
  const result=clip.clone?clip.clone():clip,removed=[];
  result.tracks=(result.tracks||[]).filter(track=>{
    const name=String(track&&track.name||''),property=(name.match(/\.([^\.\]]+)(?:\[[^\]]+\])?$/)||[])[1]||'';
    const structural=property==='scale'||property==='position'||property==='visible';
    if(structural)removed.push(name);
    return !structural;
  });
  result.userData=Object.assign({},clip.userData||{},result.userData||{},{lkRuntimeMainMeshProtected:true,lkRuntimeRemovedStructuralTracks:removed});
  return result;
}
function retargetClipNames(clip,node){
  if(!clip||!Array.isArray(clip.tracks)||!node||!node.traverse)return clip;
  const targets=new Map();node.traverse(child=>{if(child&&child.name){const key=normalizedTrackNode(child.name);if(key&&!targets.has(key))targets.set(key,child.name);}});
  let changed=false;const result=clip.clone?clip.clone():clip;
  (result.tracks||[]).forEach(track=>{
    const binding=trackNodeBinding(track&&track.name),source=binding.source,replace=binding.replace;
    const target=targets.get(normalizedTrackNode(source));if(target&&target!==source&&replace){track.name=replace(target);changed=true;}
  });
  if(result){result.userData=Object.assign({},clip.userData||{},result.userData||{});if(changed)result.userData.lkBoneNamesRetargeted=true;result.userData.lkBinding=analyzeClipBinding(result,node);}
  return result;
}
function retargetClipToSkeleton(clip,targetRoot,sourceRoot,options){
  options=options||{};
  const direct=retargetClipNames(clip,targetRoot),THREE=typeof window!=='undefined'?window.THREE:null;
  let targetMesh=null,sourceMesh=null;const targetBones=[],sourceBones=[];
  if(targetRoot&&targetRoot.traverse)targetRoot.traverse(node=>{if(!targetMesh&&node&&node.isSkinnedMesh&&node.skeleton)targetMesh=node;if(node&&node.isBone)targetBones.push(node);});
  if(sourceRoot&&sourceRoot.traverse)sourceRoot.traverse(node=>{if(!sourceMesh&&node&&node.isSkinnedMesh&&node.skeleton)sourceMesh=node;if(node&&node.isBone)sourceBones.push(node);});
  // Establish the authoritative target rest pose before both the full and
  // rotation-only paths calculate their orientation correction.
  if(targetMesh&&targetMesh.skeleton&&targetMesh.skeleton.pose)targetMesh.skeleton.pose();
  if(sourceMesh&&sourceMesh.skeleton&&sourceMesh.skeleton.pose)sourceMesh.skeleton.pose();
  if(targetRoot&&targetRoot.updateMatrixWorld)targetRoot.updateMatrixWorld(true);if(sourceRoot&&sourceRoot.updateMatrixWorld)sourceRoot.updateMatrixWorld(true);
  // A separate take is not allowed to overwrite the Main Mesh rest-pose
  // positions or scales when full skeleton retargeting is unavailable.
  // Quaternion-only name rebinding still gives a useful safe preview.
  const protectedDirect=sourceRoot&&(sourceRoot!==targetRoot||options.protectSourceRig===true)?protectTargetRigClip(direct,targetRoot,THREE,options):direct;
  const fallback={clip:protectedDirect,mode:protectedDirect&&protectedDirect.userData&&protectedDirect.userData.lkTargetRigProtected?'protected':(direct&&direct.userData&&direct.userData.lkBoneNamesRetargeted?'names':'direct'),binding:analyzeClipBinding(protectedDirect,targetRoot),motion:analyzeClipMotion(protectedDirect)};
  if(options.protectSourceRig===true&&sourceRoot===targetRoot)return fallback;
  if(!THREE||!THREE.SkeletonUtils||!THREE.SkeletonUtils.retargetClip||!sourceRoot||!targetRoot)return fallback;
  // r185 SkeletonUtils accepts a SkinnedMesh (an Object3D with .skeleton)
  // or a real Skeleton. Generic animated Object3Ds are deliberately not
  // promoted to skeleton bones: doing so can appear to work for one clip,
  // but produces undefined retargeting for animation-only exports.
  const targetList=targetMesh&&targetMesh.skeleton?targetMesh.skeleton.bones:targetBones,sourceList=sourceMesh&&sourceMesh.skeleton?sourceMesh.skeleton.bones:sourceBones;
  if(!targetMesh||!targetList.length||!sourceList.length||!THREE.Skeleton)return fallback;
  const sourceByKey=new Map();sourceList.forEach(bone=>{const key=normalizedTrackNode(bone&&bone.name);if(key&&!sourceByKey.has(key))sourceByKey.set(key,bone);});
  const names={},matched=[],pairs=[];targetList.forEach(bone=>{const source=sourceByKey.get(normalizedTrackNode(bone&&bone.name));names[bone.name]=source?source.name:bone.name;if(source){matched.push(source);pairs.push({target:bone,source});}});
  if(matched.length<Math.min(3,targetList.length))return fallback;
  const sourcePrepared=retargetClipNames(clip,sourceRoot),sourceSkeleton=sourceMesh||new THREE.Skeleton(sourceList);
  const hip=matched.find(bone=>/^(?:hips?|pelvis|root)$/i.test(normalizedTrackNode(bone.name)))||matched[0],hipPair=pairs.find(pair=>pair.source===hip)||pairs[0],targetHip=hipPair&&hipPair.target,targetHipRest=targetHip&&targetHip.position&&targetHip.position.clone?targetHip.position.clone():null,targetHipRestQuaternion=targetHip&&targetHip.quaternion&&targetHip.quaternion.clone?targetHip.quaternion.clone():null;
  // Animation assets and the Main Mesh can use different authoring units
  // and different `fit` wrappers. SkeletonUtils exposes `scale` precisely
  // for the hip translation; derive it from the median corresponding-bone
  // segment ratio (with whole-armature span only as fallback) so outlier
  // helpers cannot cancel or exaggerate the Main Mesh's authored scale.
  const retargetScale=matchedRigScale(THREE,pairs,targetRoot,sourceRoot,targetList,sourceList);
  try{
    const retargetOptions={names,hip:hip&&hip.name,scale:retargetScale,useFirstFramePosition:false,preserveBonePositions:true,preserveBoneMatrix:true},targetRest=new Map(),restCorrections=new Map();
    targetList.forEach(bone=>{if(bone&&bone.quaternion)targetRest.set(bone.name,bone.quaternion.clone());});
    // Compare source and target bind poses once. This removes FBX armature
    // axis wrappers per bone without erasing the authored first-frame pose.
    if(THREE.SkeletonUtils.retarget){
      THREE.SkeletonUtils.retarget(targetMesh,sourceSkeleton,retargetOptions);
      targetList.forEach(bone=>{const rest=targetRest.get(bone.name);if(rest&&bone.quaternion)restCorrections.set(bone.name,rest.clone().multiply(bone.quaternion.clone().invert()));});
      if(targetMesh.skeleton&&targetMesh.skeleton.pose)targetMesh.skeleton.pose();
      if(targetRoot.updateMatrixWorld)targetRoot.updateMatrixWorld(true);
    }
    const generated=THREE.SkeletonUtils.retargetClip(targetMesh,sourceSkeleton,sourcePrepared,retargetOptions);
    if(!generated||!generated.tracks||!generated.tracks.length)return fallback;
    generated.tracks.forEach(track=>{
      const original=String(track.name||''),positionMatch=original.match(/^\.bones\[([^\]]+)\]\.position$/),quaternionMatch=original.match(/^\.bones\[([^\]]+)\]\.quaternion$/);
      if(positionMatch&&targetHipRest&&positionMatch[1]===targetHip.name&&track.values&&track.values.length>=3){const oy=Number(track.values[1])||0;for(let i=0;i<track.values.length;i+=3){
        // Character locomotion is in-place: the Pawn controller owns world
        // X/Z motion. Keep only the take's vertical delta (jump/fall) and
        // anchor it to the Main Mesh rest pose.
        track.values[i]=targetHipRest.x;track.values[i+1]=targetHipRest.y+(Number(track.values[i+1])||0)-oy;track.values[i+2]=targetHipRest.z;
      }}
      if(quaternionMatch&&track.values&&track.values.length>=4){
        const boneName=quaternionMatch[1],restCorrection=restCorrections.get(boneName),isHip=targetHip&&boneName===targetHip.name,first=!restCorrection&&isHip&&targetHipRestQuaternion?new THREE.Quaternion().fromArray(track.values,0).normalize():null,correction=restCorrection||(first?targetHipRestQuaternion.clone().multiply(first.invert()):null),manual=isHip?sourceOrientationQuaternion(THREE,options.sourceOrientation):null,sample=new THREE.Quaternion(),aligned=new THREE.Quaternion();
        if(correction||manual)for(let i=0;i<track.values.length;i+=4){sample.fromArray(track.values,i).normalize();aligned.copy(correction||new THREE.Quaternion()).multiply(sample);if(manual&&sourceOrientationValue(options.sourceOrientation)!=='auto'&&sourceOrientationValue(options.sourceOrientation)!=='y-up')aligned.premultiply(manual);aligned.normalize().toArray(track.values,i);}
        if(isHip&&options.lockRootYaw)lockQuaternionYawDrift(track,THREE);
      }
      track.name=original.replace(/^\.bones\[([^\]]+)\](\..+)$/,(_all,bone,suffix)=>bone+suffix);
    });
    generated.name=clip.name||generated.name;generated.userData=Object.assign({},clip.userData||{},{lkSkeletonRetargeted:true,lkRetargetedBoneCount:matched.length,lkRetargetScale:retargetScale,lkSourceOrientation:sourceOrientationValue(options.sourceOrientation)});
    generated.userData.lkBinding=analyzeClipBinding(generated,targetRoot);generated.userData.lkMotion=analyzeClipMotion(generated);
    return {clip:generated,mode:'skeleton',binding:generated.userData.lkBinding,motion:generated.userData.lkMotion,retargetScale};
  }catch(error){fallback.error=String(error&&error.message||error);return fallback;}
}

// Clip lookup is forgiving on purpose: Mixamo exports rarely match slot ids
// exactly ("mixamo.com", "Slow Run", "Soccer Idle"...).
const SLOT_HINTS = {
  idle:['idle', 'stand', 'breathing'],
  walk:['walk'],
  run:['run', 'jog', 'sprint'],
  strafeLeft:['strafeleft', 'leftstrafe', 'strafel'],
  strafeRight:['straferight', 'rightstrafe', 'strafer'],
};

function findClip(clips, wanted, slot){
  const spec = animationSpec(wanted);
  const assetKey = animationAssetKey(spec.asset);
  const all = Array.isArray(clips) ? clips.filter(Boolean) : [];
  const scoped = assetKey ? all.filter(clip => clip.userData && clip.userData.lkAnimationAssetKey === assetKey) : all;
  const list = scoped.length ? scoped : (assetKey ? [] : all);
  if(!list.length) return null;
  const target = normalizeName(spec.clip);
  if(target){
    const exact = list.find(clip => normalizeName(clip.name) === target);
    if(exact) return exact;
    const partial = list.find(clip => normalizeName(clip.name).indexOf(target) >= 0);
    if(partial) return partial;
  }
  const hints = SLOT_HINTS[slot] || [normalizeName(slot)];
  for(const hint of hints){
    const hit = list.find(clip => normalizeName(clip.name).indexOf(hint) >= 0);
    if(hit) return hit;
  }
  // An explicitly assigned animation-only asset commonly exports one clip
  // named "mixamo.com" (or another generic take name). The asset selection is
  // already unambiguous, so its sole clip is the professional least-surprise
  // fallback even when an older slot label such as "Idle" remains stored.
  if(assetKey && list.length === 1) return list[0];
  return null;
}

function createController(options){
  const opts = options || {};
  const THREE = opts.THREERef || window.THREE;
  const state = {
    mixer:null,
    node:null,
    clips:[],
    actions:{},            // slot -> AnimationAction
    motionActions:{},      // animation-set entry id -> AnimationAction
    motionWeights:{},
    motionSet:[],
    motionSelectionInitialized:false,
    weights:{},            // slot -> smoothed weight
    oneShot:null,          // {name, action, restore, onDone}
    velocity:{x:0, z:0},   // smoothed local-space velocity (m/s)
    predicted:{x:0, z:0},
    walkSpeed:Math.max(.1, finite(opts.walkSpeed, 1.9)),
    runSpeed:Math.max(.2, finite(opts.runSpeed, 6)),
    responsiveness:Math.max(.5, finite(opts.responsiveness, 9)),
    predictionTime:Math.max(0, finite(opts.predictionTime, .12)),
    stepPoseStrength:Math.max(0,Math.min(2,finite(opts.stepPoseStrength,1))),
    stair:{amount:0,side:1,rise:0},
    bound:false,
    finishedHandler:null,
    modelRoot:null,
    motionRoot:null,
    motionRootRest:null,
    rigGuard:null,
    postUpdateGuard:null,
    fallbackClips:{},
    rigBones:new Map(),
    stairBones:{},
    lastStairDeltas:new Map(),
    lastStairMixerTime:null,
    lastRigCorrections:new Map(),
    lastRigMixerTime:null,
    weaponPose:null,
    lastWeaponPoseMixerTime:null,
    weaponPoseFaulted:false,
    traversalPose:null,
    lastTraversalPoseMixerTime:null,
    traversalPoseFaulted:false,
    oneShotBlend:null,
    // Runtime Character locomotion must advance its own mixer. Imported
    // Logic Element mixers are also known by scene-store, so use an identity
    // token to transfer ownership without ever updating the same mixer twice.
    mixerOwnerToken:{},
    ownsMixerUpdate:false,
  };

  function restoreMotionRoot(){
    const root=state.motionRoot,rest=state.motionRootRest;if(!root||!rest)return;
    root.position.copy(rest.position);root.quaternion.copy(rest.quaternion);root.scale.copy(rest.scale);root.updateMatrixWorld(true);
  }
  function dispose(preserveMixerActions,preservePresentationRoot){
    if(state.node&&state.node.userData&&state.node.userData.logicCharacterRigPostUpdate===state.postUpdateGuard)delete state.node.userData.logicCharacterRigPostUpdate;
    if(state.node&&state.node.userData&&state.node.userData.logicCharacterLocomotionMixerOwner===state.mixerOwnerToken)delete state.node.userData.logicCharacterLocomotionMixerOwner;
    if(state.mixer && state.finishedHandler) state.mixer.removeEventListener('finished', state.finishedHandler);
    clearAppliedRigCorrections();
    clearAppliedStairPose();
    // A replacement controller snapshots the clean root before this controller
    // is retired. Restoring the old root after that bind can overwrite/rebase
    // the new baseline, so replacement disposal explicitly leaves it alone.
    if(preservePresentationRoot!==true)restoreMotionRoot();
    if(preserveMixerActions!==true){
      const managed=new Set(Object.values(state.actions).concat(Object.values(state.motionActions)).filter(Boolean));
      managed.forEach(action=>action.stop&&action.stop());
    }
    state.actions = {};
    state.motionActions = {};
    state.motionWeights = {};
    state.motionSet = [];
    state.motionSelectionInitialized = false;
    state.weights = {};
    state.oneShot = null;
    state.bound = false;
    state.mixer = null;
    state.node = null;
    state.modelRoot = null;
    state.motionRoot = null;
    state.motionRootRest = null;
    state.rigGuard = null;
    state.postUpdateGuard = null;
    state.clips = [];
    state.fallbackClips = {};
    state.rigBones = new Map();
    state.stairBones = {};
    state.lastStairDeltas = new Map();
    state.lastStairMixerTime = null;
    state.stair = {amount:0,side:1,rise:0};
    state.lastRigCorrections = new Map();
    state.lastRigMixerTime = null;
    state.weaponPose = null;
    state.lastWeaponPoseMixerTime = null;
    state.weaponPoseFaulted = false;
    state.traversalPose = null;
    state.lastTraversalPoseMixerTime = null;
    state.traversalPoseFaulted = false;
    state.oneShotBlend = null;
    state.ownsMixerUpdate = false;
  }

  function oneShotWeight(){
    return state.oneShot ? Math.max(0,Math.min(1,finite(state.oneShot.blendWeight,1))) : 0;
  }
  function oneShotSharesMotionAction(){
    const action=state.oneShot&&state.oneShot.action;
    return !!action&&Object.keys(state.motionActions).some(key=>state.motionActions[key]===action);
  }

  function captureRigGuard(root){
    if(!root||!root.traverse||!THREE)return null;
    const rest=new Map(),bones=[];root.traverse(object=>{if(!object)return;if(object.position&&object.quaternion&&object.scale)rest.set(object,{position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()});if(object.isBone)bones.push(object);});
    if(!bones.length)return {rest,bones,span:0,center:new THREE.Vector3()};
    root.updateMatrixWorld(true);const box=new THREE.Box3(),point=new THREE.Vector3();bones.forEach(bone=>{bone.getWorldPosition(point);root.worldToLocal(point);box.expandByPoint(point);});
    const size=box.getSize(new THREE.Vector3());return {rest,bones,span:Math.max(.0001,size.length()),center:box.getCenter(new THREE.Vector3())};
  }
  function restoreRigGuard(reason){
    const guard=state.rigGuard;if(!guard)return false;
    if(state.mixer)state.mixer.stopAllAction();
    restoreMotionRoot();
    guard.rest.forEach((value,object)=>{object.position.copy(value.position);object.quaternion.copy(value.quaternion);object.scale.copy(value.scale);});
    if(state.modelRoot){state.modelRoot.visible=true;state.modelRoot.traverse(object=>{if(object&&object.isSkinnedMesh&&object.skeleton&&object.skeleton.pose)object.skeleton.pose();});state.modelRoot.updateMatrixWorld(true);}
    state.bound=false;
    if(state.node&&state.node.userData){state.node.userData.characterAnimationPoseError=reason;if(state.node.userData.characterAnimationBinding)state.node.userData.characterAnimationBinding.bound=false;}
    return false;
  }
  function restoreRigRest(){
    const guard=state.rigGuard;if(!guard)return false;
    clearAppliedRigCorrections();clearAppliedStairPose();
    guard.rest.forEach((value,object)=>{if(!object||!object.position||!object.quaternion||!object.scale)return;object.position.copy(value.position);object.quaternion.copy(value.quaternion);object.scale.copy(value.scale);});
    if(state.modelRoot)state.modelRoot.updateMatrixWorld(true);return true;
  }
  function enforceRigProportions(){
    const guard=state.rigGuard;if(!guard)return;
    guard.rest.forEach((value,object)=>{object.position.copy(value.position);object.scale.copy(value.scale);if(object===state.modelRoot&&!object.isBone)object.quaternion.copy(value.quaternion);});
    if(state.modelRoot)state.modelRoot.updateMatrixWorld(true);
  }
  function applyMotionTransformCorrections(){
    // Whole-slot authoring belongs above the imported GLB, exactly like Pawn
    // Studio's outer preview root. Applying it to the GLB scene itself lets
    // exporter root transforms and AnimationMixer evaluation compete with the
    // correction, so Play can fall back to the original imported inclination.
    const root=state.motionRoot,rest=state.motionRootRest,setRuntime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET;if(!root||!rest||!setRuntime)return;
    const position=[0,0,0],rotation=[0,0,0];let total=0;
    const add=(entry,action,weight)=>{if(!entry||weight<=.0001)return;const clip=action&&action.getClip&&action.getClip(),duration=Math.max(.0001,finite(clip&&clip.duration,1)),phase=action?(((finite(action.time,0)%duration)+duration)%duration/duration):0,sample=setRuntime.samplePoseTimeline&&setRuntime.samplePoseTimeline(entry.poseTimeline,phase),base=setRuntime.motionTransform?setRuntime.motionTransform(entry.motionTransform):entry.motionTransform,animated=sample&&sample.motionTransform;for(let i=0;i<3;i++){position[i]+=(finite(base&&base.position&&base.position[i],0)+finite(animated&&animated.position&&animated.position[i],0))*weight;rotation[i]+=(finite(base&&base.rotation&&base.rotation[i],0)+finite(animated&&animated.rotation&&animated.rotation[i],0))*weight;}total+=weight;};
    state.motionSet.forEach(entry=>add(entry,state.motionActions[entry.id],Math.max(0,finite(state.motionWeights[entry.id],0))));
    if(state.oneShot&&state.oneShot.entry&&!oneShotSharesMotionAction())add(state.oneShot.entry,state.oneShot.action,oneShotWeight());
    if(total>1){for(let i=0;i<3;i++){position[i]/=total;rotation[i]/=total;}}
    const transform={position,rotation};
    if(setRuntime.applyMotionTransform)setRuntime.applyMotionTransform(THREE,root,rest,transform);
    else {
      root.position.copy(rest.position).add(new THREE.Vector3(position[0],position[1],position[2]));
      const delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(rotation[0]),THREE.MathUtils.degToRad(rotation[1]),THREE.MathUtils.degToRad(rotation[2]),'XYZ'));
      root.quaternion.copy(rest.quaternion).multiply(delta).normalize();root.scale.copy(rest.scale);root.updateMatrixWorld(true);
    }
  }
  function applyMotionCurveCorrections(){
    const root=state.modelRoot,guard=state.rigGuard;if(!root||!guard)return;
    const rest=guard.rest.get(root);if(!rest)return;
    let x=0,y=0,z=0,total=0;
    const add=(entry,action,blend)=>{if(!entry||!action||!action.getClip)return;const clip=action.getClip(),duration=Math.max(.0001,Number(clip&&clip.duration)||1),phase=((Number(action.time)||0)%duration+duration)%duration/duration,point=motionCurveCorrection(entry,phase),weight=Math.max(0,Number(blend)||0);x+=point.x*weight;y+=point.y*weight;z+=point.z*weight;total+=weight;};
    state.motionSet.forEach(entry=>{const action=state.motionActions[entry.id];if(action)add(entry,action,state.motionWeights[entry.id]);});
    if(state.oneShot&&state.oneShot.entry&&!oneShotSharesMotionAction())add(state.oneShot.entry,state.oneShot.action,oneShotWeight());
    if(total>1){x/=total;y/=total;z/=total;}
    // The correction is authored in Pawn/world metres. modelRoot normally
    // lives below the fitted Character holder, so compensate its parent scale
    // to keep Pawn Studio and runtime visually identical.
    const parentScale=root.parent&&root.parent.getWorldScale?root.parent.getWorldScale(new THREE.Vector3(1,1,1)):new THREE.Vector3(1,1,1);
    root.position.copy(rest.position).add(new THREE.Vector3(x/(Math.abs(parentScale.x)||1),y/(Math.abs(parentScale.y)||1),z/(Math.abs(parentScale.z)||1)));
    root.updateMatrixWorld(true);
  }
  function applyRigCorrections(){
    if(!state.mixer||!THREE||!state.rigBones.size)return;
    const mixerTime=finite(state.mixer.time,0),sameFrame=state.lastRigMixerTime===mixerTime;
    if(sameFrame)state.lastRigCorrections.forEach((delta,bone)=>{if(bone&&bone.quaternion)bone.quaternion.multiply(delta.clone().invert()).normalize();});
    state.lastRigCorrections.clear();state.lastRigMixerTime=mixerTime;
    const totals={};
    const add=(entry,action,weight)=>{if(!entry||weight<=.0001)return;const clip=action&&action.getClip&&action.getClip(),duration=Math.max(.0001,finite(clip&&clip.duration,1)),phase=action?(((finite(action.time,0)%duration)+duration)%duration/duration):0,sample=window.LK_RUNTIME_CHARACTER_ANIMATION_SET&&window.LK_RUNTIME_CHARACTER_ANIMATION_SET.samplePoseTimeline&&window.LK_RUNTIME_CHARACTER_ANIMATION_SET.samplePoseTimeline(entry.poseTimeline,phase),sources=[entry.rigCorrections,sample&&sample.rigCorrections];sources.forEach(corrections=>{if(!corrections)return;Object.keys(corrections).forEach(key=>{const angles=corrections[key];if(!Array.isArray(angles))return;const sum=totals[key]||(totals[key]=[0,0,0]);sum[0]+=finite(angles[0],0)*weight;sum[1]+=finite(angles[1],0)*weight;sum[2]+=finite(angles[2],0)*weight;});});};
    state.motionSet.forEach(entry=>add(entry,state.motionActions[entry.id],Math.max(0,finite(state.motionWeights[entry.id],0))));
    if(state.oneShot&&state.oneShot.entry&&!oneShotSharesMotionAction())add(state.oneShot.entry,state.oneShot.action,oneShotWeight());
    Object.keys(totals).forEach(key=>{const bone=state.rigBones.get(key);if(!bone||!bone.quaternion)return;const angles=totals[key],delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(angles[0]),THREE.MathUtils.degToRad(angles[1]),THREE.MathUtils.degToRad(angles[2]),'XYZ'));bone.quaternion.multiply(delta).normalize();state.lastRigCorrections.set(bone,delta);});
    if(state.modelRoot)state.modelRoot.updateMatrixWorld(true);
  }
  function resolveStairBones(){
    const candidates={
      kneeLeft:['leftleg','leftlowerleg','leftcalf','leftshin'],kneeRight:['rightleg','rightlowerleg','rightcalf','rightshin'],
      footLeft:['leftfoot','leftankle'],footRight:['rightfoot','rightankle'],
    },out={};
    Object.keys(candidates).forEach(role=>{
      const keys=candidates[role];
      for(let index=0;index<keys.length&&!out[role];index++)out[role]=state.rigBones.get(keys[index])||null;
      if(!out[role])for(const [key,bone] of state.rigBones){if(keys.some(candidate=>key.endsWith(candidate))){out[role]=bone;break;}}
    });
    state.stairBones=out;return out;
  }
  function applyStairPose(want,dt){
    if(!state.mixer||!THREE)return;
    const grounded=want.groundContact!==false&&want.grounded!==false,rise=Math.max(0,finite(want.stepRise,0));
    if(grounded&&rise>.001){
      const maxRise=Math.max(.02,finite(want.stepHeight,.55));
      const speed=Math.max(finite(want.speed,0),Math.hypot(finite(want.x,0),finite(want.z,0)));
      const speedScale=.45+.55*Math.max(0,Math.min(1,speed/Math.max(.1,state.walkSpeed)));
      state.stair.amount=Math.max(state.stair.amount,Math.max(0,Math.min(1,rise/maxRise))*speedScale*state.stepPoseStrength);
      state.stair.side=finite(want.stepSide,state.stair.side)>=0?1:-1;state.stair.rise=rise;
    } else state.stair.amount*=Math.exp(-8*Math.max(.0001,dt));
    const mixerTime=finite(state.mixer.time,0),sameFrame=state.lastStairMixerTime===mixerTime;
    if(sameFrame)state.lastStairDeltas.forEach((delta,bone)=>{if(bone&&bone.quaternion)bone.quaternion.multiply(delta.clone().invert()).normalize();});
    state.lastStairDeltas.clear();state.lastStairMixerTime=mixerTime;
    const amount=Math.max(0,Math.min(1.5,state.stair.amount));if(amount<.002)return;
    const left=state.stair.side<0,angles={
      kneeLeft:(left?.82:.22)*amount,kneeRight:(left?.22:.82)*amount,
      footLeft:(left?-.34:-.08)*amount,footRight:(left?-.08:-.34)*amount,
    };
    Object.keys(angles).forEach(role=>{const bone=state.stairBones[role];if(!bone||!bone.quaternion)return;const delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(angles[role],0,0,'XYZ'));bone.quaternion.multiply(delta).normalize();state.lastStairDeltas.set(bone,delta);});
    if(state.modelRoot)state.modelRoot.updateMatrixWorld(true);
  }
  function clearAppliedStairPose(){
    state.lastStairDeltas.forEach((delta,bone)=>{if(bone&&bone.quaternion)bone.quaternion.multiply(delta.clone().invert()).normalize();});
    state.lastStairDeltas.clear();state.lastStairMixerTime=null;
  }
  function applyWeaponPose(){
    const runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE,pose=state.weaponPose;
    if(state.weaponPoseFaulted||!runtime||!runtime.apply||!pose||!state.modelRoot||!state.mixer)return false;
    const blend=state.oneShotBlend;
    const shot=state.oneShot,shotClip=shot&&shot.action&&shot.action.getClip&&shot.action.getClip(),slot=String(shot&&shot.slot||'').toLowerCase().replace(/[^a-z0-9]+/g,''),authoredFire=pose.kind==='firearm'&&/^(?:fire|firing)/.test(slot)&&shotClip&&!(shotClip.userData&&shotClip.userData.lkProceduralPlaceholder);
    // A real authored Fire take owns its arm chains; the weapon now follows its
    // trigger hand, so forcing full grip IK over that take would erase exactly
    // the recoil/hand motion the artist supplied. Procedural Fire still needs
    // full IK, as do held Aim/Reload poses. Body-locked actions fade it with the
    // locomotion complement as before.
    const layer=authoredFire
      ?Math.max(0,Math.min(1,finite(blend&&blend.locomotionWeight,0)))
      :(blend&&blend.category!=='upper-body'&&blend.category!=='generic'
        ?Math.max(0,Math.min(1,finite(blend.locomotionWeight,0))):1);
    if(layer<=.002)return false;
    const mixerTime=finite(state.mixer.time,0);
    if(state.lastWeaponPoseMixerTime===mixerTime)return false;
    state.lastWeaponPoseMixerTime=mixerTime;
    try{return runtime.apply(THREE,state.modelRoot,pose,pose.kind==='unarmed'?.9:.84,layer);}
    catch(error){
      // A cosmetic post-animation layer must never abort movement, camera,
      // input, HUD or the remaining Pawns in the shared frame.
      state.weaponPoseFaulted=true;
      console.error('LotKing Character: disabled weapon pose for an incompatible rig; gameplay continues.',error);
      return false;
    }
  }
  function applyTraversalPose(){
    const runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE,pose=state.traversalPose;
    if(state.traversalPoseFaulted||!runtime||!runtime.applyTraversal||!pose||!state.modelRoot||!state.mixer)return false;
    const mixerTime=finite(state.mixer.time,0);
    if(state.lastTraversalPoseMixerTime===mixerTime)return false;
    state.lastTraversalPoseMixerTime=mixerTime;
    try{return runtime.applyTraversal(THREE,state.modelRoot,pose,1);}
    catch(error){
      state.traversalPoseFaulted=true;
      console.error('LotKing Character: disabled traversal contact IK for an incompatible rig; gameplay continues.',error);
      return false;
    }
  }
  function clearAppliedRigCorrections(){
    // AnimationMixer must always evaluate the uncorrected clip pose. Leaving
    // the previous Edit Rig delta on a bone makes PropertyMixer progressively
    // absorb and counter-rotate it, so Studio and Play drift apart even while
    // the selected Idle weight remains exactly one.
    state.lastRigCorrections.forEach((delta,bone)=>{if(bone&&bone.quaternion)bone.quaternion.multiply(delta.clone().invert()).normalize();});
    state.lastRigCorrections.clear();
  }
  function rigPoseIsSane(){
    const guard=state.rigGuard,root=state.modelRoot;if(!guard||!root||!guard.bones.length)return true;
    root.updateMatrixWorld(true);const box=new THREE.Box3(),point=new THREE.Vector3();
    for(const bone of guard.bones){
      const values=[bone.position.x,bone.position.y,bone.position.z,bone.quaternion.x,bone.quaternion.y,bone.quaternion.z,bone.quaternion.w,bone.scale.x,bone.scale.y,bone.scale.z];
      if(values.some(value=>!Number.isFinite(value)))return restoreRigGuard('Animation produced non-finite rig transforms');
      bone.getWorldPosition(point);root.worldToLocal(point);if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z))return restoreRigGuard('Animation produced a non-finite rig pose');box.expandByPoint(point);
    }
    const size=box.getSize(new THREE.Vector3()),span=size.length(),center=box.getCenter(new THREE.Vector3()),limit=Math.max(2,guard.span*8);
    if(!Number.isFinite(span)||span>limit||center.distanceTo(guard.center)>limit)return restoreRigGuard('Animation moved the rig outside the Main Mesh bounds');
    return true;
  }

  // node is the internal Logic Element node holding the GLB mixer/clips
  // produced by scene-store (userData.logicAnimationMixer / ...Clips).
  // extraClips: clips from a separate animation-library GLB; they play on the
  // same mixer as long as the skeleton bone names match (Mixamo standard).
  function bind(node, clipMap, extraClips, animationSet){
    dispose();
    if(!node || !node.userData || !THREE) return false;
    // Animated character bounds can differ radically from the imported bind
    // pose (especially after an FBX axis conversion). Do not let stale skin
    // bounds make the Main Mesh disappear from Play Preview.
    if(node.traverse)node.traverse(child=>{if(child&&child.isSkinnedMesh)child.frustumCulled=false;});
    // Retarget against the actual normalized Main Mesh root, exactly like
    // Pawn Studio does. The holder carries authored world scale/position and
    // is not the armature root; using it here made independently imported FBX
    // takes calculate a different rig space in runtime than in the Studio.
    let modelRoot=null;
    (node.children||[]).some(child=>{if(child&&child.userData&&child.userData.logicElementAssetVisual){modelRoot=child;return true;}return false;});
    if(!modelRoot&&node.traverse)node.traverse(child=>{if(!modelRoot&&child!==node&&child.userData&&child.userData.logicElementAssetVisual)modelRoot=child;});
    if(!modelRoot)modelRoot=node;
    state.modelRoot=modelRoot;
    // The Character Model holder carries Main Mesh alignment and sits outside
    // the imported asset's AnimationMixer. Keeping slot correction here
    // reproduces Pawn Studio's transform order exactly.
    state.motionRoot=node.position&&node.quaternion&&node.scale?node:null;
    state.motionRootRest=state.motionRoot?{position:state.motionRoot.position.clone(),quaternion:state.motionRoot.quaternion.clone(),scale:state.motionRoot.scale.clone()}:null;
    if(modelRoot.traverse)modelRoot.traverse(object=>{if(object&&object.isBone&&object.name){const key=normalizedTrackNode(object.name);if(key&&!state.rigBones.has(key))state.rigBones.set(key,object);}});
    resolveStairBones();
    const authoredRig=captureRigGuard(modelRoot);
    const setRuntime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET,normalizedSet=setRuntime?setRuntime.normalize(animationSet||opts.animationSet,clipMap||{}):[];
    const entryForClip=clip=>{const key=clip&&clip.userData&&clip.userData.lkAnimationAssetKey;return normalizedSet.find(entry=>entry&&(!key||animationAssetKey(entry.asset)===key)&&(!entry.clip||entry.clip===clip.name))||normalizedSet.find(entry=>entry&&key&&animationAssetKey(entry.asset)===key)||null;};
    const embedded=(node.userData.logicAnimationClips||[]).filter(Boolean),external=Array.isArray(extraClips)?extraClips.filter(Boolean).map(clip=>{const entry=entryForClip(clip),prepared=retargetClipToSkeleton(clip,modelRoot,clip.__lkAnimationSourceRoot,{sourceOrientation:entry&&entry.sourceOrientation,lockRootYaw:!!(entry&&setRuntime&&setRuntime.lockRootYaw&&setRuntime.lockRootYaw(entry))});if(prepared&&prepared.clip){prepared.clip=protectRuntimeMainMeshProportions(prepared.clip);prepared.clip.userData=Object.assign({},prepared.clip.userData||{},{lkRuntimeRetargetMode:prepared.mode,lkRuntimeRetargetScale:prepared.retargetScale});}return prepared&&prepared.clip;}).filter(Boolean):[];
    // SkeletonUtils may temporarily pose target bones while deriving a clip.
    // The authored Main Mesh rest transforms remain authoritative before the
    // runtime mixer evaluates its first frame.
    if(authoredRig){authoredRig.rest.forEach((value,object)=>{object.position.copy(value.position);object.quaternion.copy(value.quaternion);object.scale.copy(value.scale);});modelRoot.updateMatrixWorld(true);}
    const merged=embedded.concat(external);
    // A real humanoid Main Mesh must remain usable even before the author
    // imports every animation take. Generate missing clips on that exact rest
    // skeleton; authored embedded/external clips are looked up first and are
    // therefore never replaced by these placeholders.
    const fallbackRuntime=window.LK_RUNTIME_MIXAMO_PLACEHOLDER_CLIPS;
    if(fallbackRuntime&&fallbackRuntime.createClip){
      PROCEDURAL_FALLBACK_SLOTS.forEach(slot=>{
        const wanted=(clipMap||{})[slot],authored=findClip(merged,wanted,slot);
        if(authored)return;
        const spec=animationSpec(wanted),clip=fallbackRuntime.createClip(THREE,modelRoot,slot,{role:opts.role||'character',assetKey:animationAssetKey(spec.asset)});
        if(clip){state.fallbackClips[slot]=clip;merged.push(clip);}
      });
    }
    if(!merged.length) return false;
    let mixer = node.userData.logicAnimationMixer;
    if(!mixer){
      // Mesh-only GLB + separate animation library: create a mixer on the
      // model root. Runtime locomotion drives both this mixer and imported
      // scene-store mixers while the Character Pawn is active.
      if(!modelRoot) return false;
      mixer = new THREE.AnimationMixer(modelRoot);
    }
    state.node = node;
    state.mixer = mixer;
    state.clips = merged;
    // Locomotion owns the mixer from now on; stop the single autoplay action.
    state.mixer.stopAllAction();
    node.userData.logicAnimationAction = null;
    const map = clipMap || {},selectedClips=[];
    const bindLegacyActions=()=>LOCOMOTION_SLOTS.forEach(slot => {
      const clip = findClip(state.clips.filter(item=>!(item.userData&&item.userData.lkProceduralPlaceholder)), map[slot], slot)||state.fallbackClips[slot];
      if(!clip) return;
      const action = state.mixer.clipAction(clip);
      selectedClips.push(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.setEffectiveWeight(slot === 'idle' ? 1 : 0);
      action.play();
      state.actions[slot] = action;
      state.weights[slot] = slot === 'idle' ? 1 : 0;
    });
    state.clipMap = map;
    state.motionSet=normalizedSet;
    state.motionSet.forEach((entry,index)=>{
      if(entry.state==='action')return;
      const fallbackSlot=entry.action||entry.slot||entry.name||entry.state;
      let clip=findClip(state.clips.filter(item=>!(item.userData&&item.userData.lkProceduralPlaceholder)),{clip:entry.clip,asset:entry.asset},entry.name||entry.state)||state.fallbackClips[fallbackSlot]||state.fallbackClips[normalizeName(fallbackSlot)];
      if(!clip)return;
      if(setRuntime&&setRuntime.lockRootYaw&&setRuntime.lockRootYaw(entry))clip=lockClipRootYaw(clip,modelRoot,THREE);
      const key=entry.id||('motion-'+index),action=state.mixer.clipAction(clip);
      selectedClips.push(clip);
      action.setLoop(entry.loop===false?THREE.LoopOnce:THREE.LoopRepeat,entry.loop===false?1:Infinity);
      action.clampWhenFinished=entry.loop===false;
      action.enabled=true;action.setEffectiveWeight(0);action.play();
      state.motionActions[key]=action;
      state.motionWeights[key]=0;
    });
    // Motion Set and fixed legacy slots are alternative controllers, never
    // concurrent animation layers. Previously legacy Idle stayed at weight 1
    // while Motion Set Walk/Run/Strafe blended on top, so two poses fought
    // during turns and an Idle Edit Rig correction appeared to leak into the
    // Main Mesh and every other state. Keep the fixed map only as a fallback
    // when no usable Motion Set entry could actually bind.
    if(!Object.keys(state.motionActions).length)bindLegacyActions();
    state.finishedHandler = event => {
      if(!state.oneShot || event.action !== state.oneShot.action)return;
      if(state.oneShot.holdLastFrame){
        const clip=event.action.getClip&&event.action.getClip();
        event.action.time=Math.max(0,finite(clip&&clip.duration,1));
        event.action.paused=true;
        state.oneShot.held=true;
        return;
      }
      finishOneShot();
    };
    state.mixer.addEventListener('finished', state.finishedHandler);
    state.bound = Object.keys(state.motionActions).length > 0||Object.keys(state.actions).length > 0;
    // Transfer update ownership only after at least one locomotion action is
    // truly bound. A failed bind must leave ordinary scene animation intact.
    state.ownsMixerUpdate = state.bound;
    if(state.bound)node.userData.logicCharacterLocomotionMixerOwner = state.mixerOwnerToken;
    state.rigGuard=authoredRig||captureRigGuard(modelRoot);
    state.postUpdateGuard=()=>{enforceRigProportions();applyMotionTransformCorrections();applyRigCorrections();applyStairPose(state.lastDesired||{},0);applyTraversalPose();applyWeaponPose();rigPoseIsSane();};
    node.userData.logicCharacterRigPostUpdate=state.postUpdateGuard;
    const diagnostics=selectedClips.map(clip=>({name:clip.name||'Animation',binding:clip.userData&&clip.userData.lkBinding||analyzeClipBinding(clip,node)}));
    node.userData.characterAnimationBinding={bound:state.bound,clips:diagnostics};
    return state.bound;
  }

  function finishOneShot(){
    const shot = state.oneShot;
    state.oneShot = null;
    state.oneShotBlend = null;
    if(shot && shot.action){
      // Weight is crossfaded explicitly against locomotion below. Leaving a
      // second AnimationAction fade running multiplies both weights and exposes
      // the bind/T-pose in the missing remainder.
      shot.action.stop();
    }
    if(shot && typeof shot.onDone === 'function'){
      try { shot.onDone(shot.name); } catch(err){ /* author callback */ }
    }
  }

  // One-shot layer: shoot, pass, cross, save, dive, celebrate...
  function playAction(clipName, actionOptions){
    if(!state.mixer) return false;
    const o = actionOptions || {};
    let spec = animationSpec(clipName);
    const requested=String(spec.clip||clipName||'');
    const slot=String(o.slot||''),motionEntry=state.motionSet.find(entry=>entry.state==='action'&&(entry.action===slot||entry.id===slot||entry.action===requested||entry.name===requested||entry.id===requested));
    if(motionEntry)spec={clip:motionEntry.clip,asset:motionEntry.asset,playbackRate:finite(motionEntry.playbackRate,finite(motionEntry.asset&&motionEntry.asset.playbackRate,spec.playbackRate))};
    const authored=state.clips.filter(item=>!(item.userData&&item.userData.lkProceduralPlaceholder));
    const fallbackSlot=String(o.slot||requested||'');
    const clip = findClip(authored, spec, normalizeName(spec.clip))||state.fallbackClips[fallbackSlot]||state.fallbackClips[normalizeName(fallbackSlot)];
    if(!clip) return false;
    if(state.oneShot && state.oneShot.action) state.oneShot.action.stop();
    const action = state.mixer.clipAction(clip);
    action.reset();
    action.setLoop(o.loop === true ? THREE.LoopRepeat : THREE.LoopOnce, o.loop === true ? Infinity : 1);
    action.clampWhenFinished = o.loop !== true;
    // `speedScale` composes a gameplay move's tempo with the author-owned
    // Motion Set Playback Rate. `speed` remains the explicit absolute override
    // used by existing callers. A traversal may also fit an unusually long take
    // inside a maximum duration without making shorter/faster authored takes
    // slower again.
    const authoredRate=finite(spec.playbackRate,1),requestedRate=o.speed!=null
      ?finite(o.speed,1)
      :authoredRate*finite(o.speedScale,1);
    let playbackRate=Math.abs(requestedRate)<.05?(requestedRate<0?-.05:.05):requestedRate;
    const fitDuration=Math.max(0,finite(o.fitDuration,0));
    if(fitDuration>0){
      const minimumRate=Math.max(.05,finite(clip.duration,1)/fitDuration),sign=playbackRate<0?-1:1;
      if(Math.abs(playbackRate)<minimumRate)playbackRate=sign*minimumRate;
    }
    if(playbackRate<0)action.time=Math.max(.001,finite(clip.duration,1));
    action.setEffectiveTimeScale(playbackRate);
    action.setEffectiveWeight(1);
    action.play();
    state.oneShot = {
      name:clip.name,
      slot:String(o.slot||requested||clip.name||''),
      action,
      entry:motionEntry||null,
      fadeOut:Math.max(.02, finite(o.fadeOut, .18)),
      fadeIn:Math.max(0, finite(o.fadeIn, .12)),
      elapsed:0,
      onDone:o.onDone,
      loop:o.loop === true,
      holdLastFrame:o.holdLastFrame === true,
      held:false,
      releaseStart:o.releaseStart,
      releaseEnd:o.releaseEnd,
      locomotionFloor:o.locomotionFloor,
      blendWeight:1,
    };
    return true;
  }

  function stopAction(){
    if(state.oneShot) finishOneShot();
  }

  function isActionPlaying(){
    return !!state.oneShot;
  }

  // A charged football strike needs to show the approach before contact.
  // Hold the authored clip at a normalized frame while aim/power is edited,
  // then resume the same action on release instead of restarting it.
  function holdActionAtProgress(progress){
    const shot=state.oneShot,action=shot&&shot.action;
    if(!action)return false;
    const clip=action.getClip?action.getClip():null,duration=Math.max(.001,finite(clip&&clip.duration,1));
    action.time=Math.max(0,Math.min(duration*.94,duration*Math.max(0,Math.min(.94,finite(progress,.3)))));
    action.paused=true;
    shot.held=true;
    if(state.mixer)state.mixer.update(0);
    return true;
  }

  function resumeAction(speed){
    const action=state.oneShot&&state.oneShot.action;
    if(!action)return false;
    action.paused=false;
    state.oneShot.held=false;
    const requested=speed==null?finite(action.timeScale,1):finite(speed,1);
    action.setEffectiveTimeScale(Math.abs(requested)<.05?(requested<0?-.05:.05):requested);
    return true;
  }

  function actionProgress(){
    const action=state.oneShot&&state.oneShot.action;
    if(!action)return 0;
    const clip=action.getClip?action.getClip():null,duration=Math.max(.001,finite(clip&&clip.duration,1));
    return Math.max(0,Math.min(1,finite(action.time,0)/duration));
  }

  function actionDuration(){
    const action=state.oneShot&&state.oneShot.action;
    if(!action)return 0;
    const clip=action.getClip?action.getClip():null,duration=Math.max(.001,finite(clip&&clip.duration,0));
    const scale=Math.max(.05,Math.abs(finite(action.getEffectiveTimeScale?action.getEffectiveTimeScale():action.timeScale,1)));
    return Math.max(0,duration-finite(action.time,0))/scale;
  }

  function updateOneShotBlend(want,dt){
    const shot=state.oneShot;
    if(!shot){state.oneShotBlend=null;return {actionWeight:0,locomotionWeight:1};}
    const blendRuntime=window.LK_RUNTIME_CHARACTER_ANIMATION_BLEND;
    const progress=actionProgress();
    // A held/paused take still has to blend IN; only its clip time is frozen.
    // Tying the envelope clock to `held` would leave a pose held on frame zero
    // permanently at zero weight.
    shot.elapsed+=Math.max(0,finite(dt,0));
    const baseBlend=blendRuntime&&blendRuntime.profile?blendRuntime.profile({
      slot:shot.slot||shot.name,
      progress,
      desired:want,
      loop:shot.loop,
      held:shot.held,
      releaseStart:shot.releaseStart,
      releaseEnd:shot.releaseEnd,
      locomotionFloor:shot.locomotionFloor,
    }):{slot:shot.slot||shot.name,category:'legacy',progress,actionWeight:1,locomotionWeight:0,releaseStart:1};
    // One complementing crossfade owns the skeleton. Three's fadeIn/fadeOut
    // interpolant used to multiply `actionWeight` a second time, so the action
    // plus gait could total far below one and reveal the bind pose after landing.
    const linear=shot.fadeIn>0?Math.max(0,Math.min(1,shot.elapsed/shot.fadeIn)):1;
    const fadeIn=linear*linear*(3-2*linear);
    const actionWeight=Math.max(0,Math.min(1,baseBlend.actionWeight*fadeIn));
    const blend=Object.freeze(Object.assign({},baseBlend,{actionWeight,locomotionWeight:1-actionWeight,fadeIn}));
    shot.blendWeight=blend.actionWeight;
    if(shot.action&&shot.action.setEffectiveWeight)shot.action.setEffectiveWeight(blend.actionWeight);
    state.oneShotBlend=blend;
    return blend;
  }

  // desired: local-space target velocity {x (lateral, +right), z (forward)} in m/s.
  function update(desired, dt){
    if(!state.bound) return;
    const h = Math.max(.0001, finite(dt, .016));
    const want = desired || {x:0, z:0};
    const blendRuntime=window.LK_RUNTIME_CHARACTER_ANIMATION_BLEND;
    // Keep this fact for the whole frame. `mixer.update()` can synchronously
    // dispatch `finished`, clear state.oneShot and call back into the Pawn, but
    // `want` is already this frame's snapshot and can still contain the stale
    // action name. A repeated jump on that exact frame must select Jump/Fall,
    // not an empty action phase.
    const hadLayeredOneShot=!!state.oneShot;
    if(state.oneShot&&blendRuntime&&blendRuntime.shouldInterrupt&&blendRuntime.shouldInterrupt(state.oneShot.slot||state.oneShot.name,want))finishOneShot();
    clearAppliedRigCorrections();
    clearAppliedStairPose();
    if(state.ownsMixerUpdate && state.mixer) state.mixer.update(h);
    enforceRigProportions();
    state.lastDesired=want;
    state.weaponPose=want.weapon||null;
    state.traversalPose=want.traversalTargets||null;
    // Exponential damping toward the desired velocity approximates the
    // character acceleration curve...
    const k = 1 - Math.exp(-state.responsiveness * h);
    state.velocity.x += (finite(want.x, 0) - state.velocity.x) * k;
    state.velocity.z += (finite(want.z, 0) - state.velocity.z) * k;
    // ...and the short look-ahead predicts where that curve is heading, so
    // blends start slightly before the pose is needed (motion-matching-lite).
    state.predicted.x = state.velocity.x + (finite(want.x, 0) - state.velocity.x) * state.predictionTime * state.responsiveness;
    state.predicted.z = state.velocity.z + (finite(want.z, 0) - state.velocity.z) * state.predictionTime * state.responsiveness;
    const oneShotBlend=updateOneShotBlend(want,h);

    const setRuntime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET;
    if(setRuntime&&state.motionSet.length&&Object.keys(state.motionActions).length){
      const context=Object.assign({},want,{x:state.predicted.x,z:state.predicted.z,speed:finite(want.speed,Math.hypot(state.predicted.x,state.predicted.z))});
      // `pawn.state.action` describes the one-shot layer that is already owned
      // by `state.oneShot`; it must not also replace the base motion phase.
      // In particular, a moving landing sets action=landMoving. Passing that to
      // the Motion Set asks for state=action entries, finds none, and leaves the
      // complementing locomotionWeight with no clip behind it: the uncovered
      // skeleton is the bind/T-pose until the landing take finishes. Select the
      // base from grounded/jump/fall telemetry while the one-shot is active;
      // its complementary weight below still decides how much of that gait is
      // visible, so body-locked actions remain fully locked.
      const baseContext=(hadLayeredOneShot||state.oneShot)&&context.action?Object.assign({},context,{action:null}):context;
      const selected=setRuntime.select(state.motionSet,baseContext,3),targets={};
      selected.forEach(item=>{targets[item.entry.id]=item.weight;});
      const suppress=state.oneShot ? oneShotBlend.locomotionWeight : 1;
      const blendK=1-Math.exp(-state.responsiveness*1.4*h);
      Object.keys(state.motionActions).forEach(key=>{
        const action=state.motionActions[key],entry=state.motionSet.find(item=>item.id===key),wanted=(targets[key]||0)*suppress;
        // Motion Set and Character Abilities can address the same landing
        // AnimationAction. Keep one owner and crossfade that action against the
        // selected gait; assigning both independently caused bind-pose gaps.
        if(state.oneShot&&state.oneShot.action===action){
          state.motionWeights[key]=oneShotBlend.actionWeight;
          action.setEffectiveWeight(oneShotBlend.actionWeight);
          return;
        }
        const current=finite(state.motionWeights[key],0);
        if(wanted>.001&&current<=.001&&entry&&entry.loop===false)action.reset().play();
        // The one-shot envelope already IS the crossfade. Applying the normal
        // gait smoothing on top leaves old gait weight behind when the landing
        // rises (pose amplification), or delays the requested gait when it
        // releases (an uncovered bind/T-pose). During the whole layered frame,
        // including the exact frame where the mixer finishes/interruption
        // clears it, assign the complementary target directly. Ordinary gait
        // changes keep their acceleration smoothing outside one-shots.
        const layeredCrossfade=hadLayeredOneShot||!!state.oneShot;
        const weight=layeredCrossfade?wanted:(state.motionSelectionInitialized?current+(wanted-current)*blendK:wanted);state.motionWeights[key]=weight;
        action.setEffectiveWeight(Math.max(0,Math.min(1,weight)));
        if(entry&&entry.state==='grounded'&&entry.speed>.1){
          // Stick/trigger magnitude is allowed to reach the animation. The old
          // .45 floor made a barely tilted stick play almost half-speed strides,
          // while 1.8 made full input exceed the authored clip. Zero..one keeps
          // the feet proportional and caps at the animation's natural rate.
          const rate=Math.max(.02,Math.min(1,context.speed/entry.speed))*entry.playbackRate;
          action.setEffectiveTimeScale(rate);
        }
      });
      synchronizeLoopPhases(selected, state.motionActions);
      state.motionSelectionInitialized=true;
      state.motionSelection=selected.map(item=>({id:item.entry.id,name:item.entry.name,weight:item.weight,score:item.score}));
      applyMotionTransformCorrections();
      // Scene-store owns imported GLB mixers and applies the correction in its
      // post-update hook. Locally-owned mixers have already advanced above.
      if(state.ownsMixerUpdate){applyRigCorrections();applyStairPose(want,h);applyTraversalPose();applyWeaponPose();}
      rigPoseIsSane();
      return;
    }

    const speed = Math.sqrt(state.predicted.x * state.predicted.x + state.predicted.z * state.predicted.z);
    const lateral = speed > .05 ? state.predicted.x / Math.max(speed, .0001) : 0;

    // 1D speed blend: idle -> walk -> run.
    const walkT = Math.max(0, Math.min(1, speed / state.walkSpeed));
    const runT = Math.max(0, Math.min(1, (speed - state.walkSpeed) / Math.max(.1, state.runSpeed - state.walkSpeed)));
    const strafeAmount = Math.min(1, Math.abs(lateral)) * Math.max(0, Math.min(1, speed / state.walkSpeed));
    const target = {
      idle:(1 - walkT),
      walk:walkT * (1 - runT) * (1 - strafeAmount),
      run:runT * (1 - strafeAmount * .6),
      strafeLeft:lateral < 0 ? strafeAmount : 0,
      strafeRight:lateral > 0 ? strafeAmount : 0,
    };
    // Missing clips push their weight to the nearest neighbour.
    if(!state.actions.walk && state.actions.run) target.run = Math.max(target.run, walkT * (1 - strafeAmount));
    if(!state.actions.run && state.actions.walk) target.walk = Math.max(target.walk, runT);
    if(!state.actions.strafeLeft) target.walk = Math.max(target.walk, lateral < 0 ? strafeAmount : 0);
    if(!state.actions.strafeRight) target.walk = Math.max(target.walk, lateral > 0 ? strafeAmount : 0);

    const oneShotSuppression = state.oneShot ? oneShotBlend.locomotionWeight : 1;
    const blendK = 1 - Math.exp(-12 * h);
    LOCOMOTION_SLOTS.forEach(slot => {
      const action = state.actions[slot];
      if(!action) return;
      const wanted = (target[slot] || 0) * oneShotSuppression;
      if(hadLayeredOneShot||state.oneShot)state.weights[slot]=wanted;
      else state.weights[slot] += (wanted - state.weights[slot]) * blendK;
      action.setEffectiveWeight(Math.max(0, Math.min(1, state.weights[slot])));
      // Stride matching-lite: scale walk/run playback with real speed.
      if(slot === 'walk') action.setEffectiveTimeScale(Math.max(.02, Math.min(1, speed / Math.max(.5, state.walkSpeed))));
      if(slot === 'run') action.setEffectiveTimeScale(Math.max(.02, Math.min(1, speed / Math.max(1, state.runSpeed))));
    });
    synchronizeLoopPhases(LOCOMOTION_SLOTS.map(slot => ({
      entry:{id:slot,state:'grounded',loop:true,speed:slot === 'idle' ? 0 : 1},
      weight:state.weights[slot] || 0,
    })), state.actions);
    applyMotionTransformCorrections();if(state.ownsMixerUpdate){applyRigCorrections();applyStairPose(want,h);applyTraversalPose();applyWeaponPose();}rigPoseIsSane();
  }

  function configure(patch){
    const p = patch || {};
    if(p.walkSpeed != null) state.walkSpeed = Math.max(.1, finite(p.walkSpeed, state.walkSpeed));
    if(p.runSpeed != null) state.runSpeed = Math.max(.2, finite(p.runSpeed, state.runSpeed));
    if(p.responsiveness != null) state.responsiveness = Math.max(.5, finite(p.responsiveness, state.responsiveness));
    if(p.predictionTime != null) state.predictionTime = Math.max(0, finite(p.predictionTime, state.predictionTime));
    if(p.stepPoseStrength != null) state.stepPoseStrength = Math.max(0,Math.min(2,finite(p.stepPoseStrength,state.stepPoseStrength)));
  }

  // Vehicle seating, traversal contact and weapon IK are post-mixer layers.
  // At an ownership boundary they must all be forgotten before a saved clean
  // skeleton is restored; otherwise their cached inverse can be applied to the
  // restored pose on the next frame and make otherwise valid clips look rigid.
  function releaseExternalPose(){
    // Older Sketchbook seating started a Scene Store `driving` action on this
    // Character-owned mixer. It is not in actions/motionActions, so locomotion
    // never changes its weight and it keeps fighting every clip after exit.
    // Stop only that foreign action, then re-arm the managed actions (the
    // foreign clip can resolve to the same AnimationAction as a managed slot).
    const data=state.node&&state.node.userData,foreign=data&&data.logicAnimationAction;
    if(foreign){
      foreign.stop&&foreign.stop();
      data.logicAnimationAction=null;
      delete data.logicAnimationClipName;
      const managed=new Set(Object.values(state.actions).concat(Object.values(state.motionActions)).filter(Boolean));
      managed.forEach(action=>{action.enabled=true;action.paused=false;action.play&&action.play();});
      state.motionSelectionInitialized=false;
    }
    clearAppliedRigCorrections();
    clearAppliedStairPose();
    const poseRuntime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE;
    if(poseRuntime&&poseRuntime.release&&state.modelRoot)poseRuntime.release(state.modelRoot);
    state.weaponPose=null;state.traversalPose=null;
    state.lastWeaponPoseMixerTime=null;state.lastTraversalPoseMixerTime=null;
    state.lastRigMixerTime=null;state.lastStairMixerTime=null;
    // Motion Set transforms and timeline offsets are animation output on the
    // Character Model holder, not structural/bind transforms. Ownership
    // boundaries must remove them before another controller takes a baseline.
    restoreMotionRoot();
    if(state.modelRoot)state.modelRoot.updateMatrixWorld(true);
    return true;
  }

  // Reset the already-bound controller instead of retargeting and binding the
  // same live skeleton again. Rebinding at pre-benchmark/vehicle exit promoted
  // the current animation frame into a new rig rest pose; repeated exits then
  // accumulated holder offsets and bone rotations until the mesh was inverted.
  function resetPresentation(){
    if(!state.bound)return false;
    releaseExternalPose();
    if(state.oneShot&&state.oneShot.action)state.oneShot.action.stop();
    state.oneShot=null;state.oneShotBlend=null;
    if(state.mixer)state.mixer.stopAllAction();
    restoreRigRest();restoreMotionRoot();
    const managed=new Set(Object.values(state.actions).concat(Object.values(state.motionActions)).filter(Boolean));
    managed.forEach(action=>{action.reset();action.enabled=true;action.paused=false;action.setEffectiveWeight(0);action.play();});
    Object.keys(state.weights).forEach(key=>state.weights[key]=key==='idle'?1:0);
    Object.keys(state.actions).forEach(key=>state.actions[key].setEffectiveWeight(key==='idle'?1:0));
    Object.keys(state.motionWeights).forEach(key=>state.motionWeights[key]=0);
    const neutral=state.motionSet.filter(entry=>entry&&entry.state==='grounded').sort((a,b)=>Math.abs(finite(a.speed,0))-Math.abs(finite(b.speed,0)))[0];
    if(neutral&&state.motionActions[neutral.id]){state.motionWeights[neutral.id]=1;state.motionActions[neutral.id].setEffectiveWeight(1);}
    state.velocity.x=0;state.velocity.z=0;state.predicted.x=0;state.predicted.z=0;
    state.motionSelectionInitialized=false;state.motionSelection=[];state.lastDesired=null;
    if(state.mixer)state.mixer.update(0);
    restoreMotionRoot();
    if(state.modelRoot)state.modelRoot.updateMatrixWorld(true);
    return true;
  }

  return Object.freeze({
    bind,
    update,
    playAction,
    stopAction,
    isActionPlaying,
    holdActionAtProgress,
    resumeAction,
    actionProgress,
    actionDuration,
    releaseExternalPose,
    resetPresentation,
    prepareForReplacement:()=>{releaseExternalPose();restoreRigRest();restoreMotionRoot();return true;},
    restorePresentationRoot:()=>{restoreMotionRoot();return true;},
    configure,
    dispose,
    // A replacement controller has already armed its actions on this same
    // mixer. Retire listeners/caches without stopping those shared actions.
    disposeForReplacement:()=>dispose(true,true),
    isBound:() => state.bound,
    availableClips:() => state.clips.map(clip => clip.name || 'Animation'),
    debugState:() => ({velocity:Object.assign({}, state.velocity), weights:Object.assign({}, state.weights), motionWeights:Object.assign({},state.motionWeights), selection:(state.motionSelection||[]).slice(), stair:Object.assign({},state.stair),stairBones:Object.keys(state.stairBones).filter(key=>!!state.stairBones[key]),oneShot:state.oneShot ? state.oneShot.name : null,oneShotBlend:state.oneShotBlend?Object.assign({},state.oneShotBlend):null}),
  });
}

window.LK_RUNTIME_CHARACTER_LOCOMOTION = Object.freeze({createController, findClip, retargetClipNames, retargetClipToSkeleton, protectRuntimeMainMeshProportions, analyzeClipBinding, analyzeClipMotion, motionCurveCorrection, synchronizeLoopPhases, lockQuaternionYawDrift, lockClipRootYaw, normalizedTrackNode, LOCOMOTION_SLOTS, PROCEDURAL_FALLBACK_SLOTS});
window.LK_RUNTIME_SOCCER_LOCOMOTION = window.LK_RUNTIME_CHARACTER_LOCOMOTION;
})();
