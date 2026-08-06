/* =========================================================
   LOT KING - Pawn Studio
   Reusable, schema-driven authoring overlay for Character,
   Vehicle and plugin-provided Pawn categories.
   ========================================================= */
(function(){
'use strict';

const adapters=[];
function registerType(adapter){
  if(!adapter||!adapter.id||typeof adapter.match!=='function'||typeof adapter.containers!=='function')throw new Error('Pawn Studio adapter requires id, match and containers');
  const index=adapters.findIndex(item=>item.id===adapter.id);if(index>=0)adapters.splice(index,1);
  adapters.push(adapter);return adapter;
}
function unregisterType(id){const index=adapters.findIndex(item=>item.id===id);if(index<0)return false;adapters.splice(index,1);return true;}
function resolveType(graph){return adapters.find(adapter=>{try{return adapter.match(graph||{});}catch(err){return false;}})||null;}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function createAuthoringHistory(initial,limit){
  const capacity=Math.max(2,Number(limit)||80),entries=[clone(initial)],signatures=[JSON.stringify(initial)],state={index:0};
  return Object.freeze({
    push(value){const signature=JSON.stringify(value);if(signature===signatures[state.index])return false;entries.splice(state.index+1);signatures.splice(state.index+1);entries.push(clone(value));signatures.push(signature);if(entries.length>capacity){entries.shift();signatures.shift();}state.index=entries.length-1;return true;},
    undo(){if(state.index<=0)return null;state.index--;return clone(entries[state.index]);},
    redo(){if(state.index>=entries.length-1)return null;state.index++;return clone(entries[state.index]);},
    canUndo:()=>state.index>0,canRedo:()=>state.index<entries.length-1,index:()=>state.index,size:()=>entries.length,
  });
}
function restoreObject(target,snapshot){if(!target||!snapshot)return false;Object.keys(target).forEach(key=>delete target[key]);Object.assign(target,clone(snapshot));return true;}
function pathGet(root,path){return String(path||'').split('.').filter(Boolean).reduce((value,key)=>value&&value[key],root);}
function pathSet(root,path,value){const keys=String(path||'').split('.').filter(Boolean);let cursor=root;keys.slice(0,-1).forEach(key=>{if(!cursor[key]||typeof cursor[key]!=='object')cursor[key]={};cursor=cursor[key];});if(keys.length)cursor[keys[keys.length-1]]=value;}
function assetId(ref){return String(ref&&ref.id||ref&&ref.key||ref&&ref.dbKey||ref&&ref.src||'');}
function storableAssetRef(asset){return asset?{id:asset.id||asset.modelId||null,key:asset.key||asset.modelKey||null,dbKey:asset.dbKey||asset.modelDbKey||null,src:asset.src||asset.url||asset.modelSrc||null,name:asset.name||asset.modelName||asset.source||'GLB Asset',source:asset.source||asset.name||asset.modelName||'Asset Library',kind:'glb',mime:asset.mime||null,fit:Number(asset.fit)||null,clips:Array.isArray(asset.clips)?asset.clips.slice():[],boneNames:Array.isArray(asset.boneNames)?asset.boneNames.slice():[],skeletonSignature:asset.skeletonSignature||'',sourceFormat:asset.sourceFormat||null,sourceDbKey:asset.sourceDbKey||null,sourceSrc:asset.sourceSrc||null,sourceDependencies:Array.isArray(asset.sourceDependencies)?clone(asset.sourceDependencies):[],compileState:asset.compileState||null,compiledAt:asset.compiledAt||null}:null;}
function normalizedBoneName(name){return String(name||'').replace(/^.*[:|]/,'').replace(/[^a-z0-9]/gi,'').toLowerCase();}
function skeletonCompatibility(main,motion){
  if(!main||!motion)return {status:'unknown',ratio:0,matched:0,total:0};
  if(assetId(main)&&assetId(main)===assetId(motion))return {status:'compatible',ratio:1,matched:0,total:0,sameAsset:true};
  const a=new Set((main.boneNames||[]).map(normalizedBoneName).filter(Boolean)),b=new Set((motion.boneNames||[]).map(normalizedBoneName).filter(Boolean));
  if(!a.size||!b.size)return {status:'unknown',ratio:0,matched:0,total:Math.min(a.size,b.size)};
  let matched=0;a.forEach(name=>{if(b.has(name))matched++;});const total=Math.min(a.size,b.size),ratio=total?matched/total:0;
  return {status:ratio>=.8?'compatible':(ratio>=.5?'warning':'incompatible'),ratio,matched,total};
}
function inferMotionMetadata(asset,clip,index){
  const source=String((asset&&asset.name)||'')+' '+String(clip||''),key=source.toLowerCase().replace(/[^a-z0-9]+/g,' '),has=words=>words.some(word=>key.includes(word));
  let state='grounded',direction=[0,1],speed=1.8,loop=true,action=null;
  if(has(['idle','stand','breath'])){direction=[0,0];speed=0;}
  if(has(['run','jog']))speed=5.4;
  if(has(['sprint']))speed=7;
  if(has(['back','reverse']))direction=[0,-1];
  else if(has(['strafe left','left strafe','walk left','run left']))direction=[-1,0];
  else if(has(['strafe right','right strafe','walk right','run right']))direction=[1,0];
  if(has(['jump','takeoff','take off'])){state='jump';loop=false;speed=Math.max(speed,2);}
  else if(has(['fall','airborne','in air'])){state='fall';loop=true;speed=Math.max(speed,2);}
  else if(has(['land','landing'])){state='land';loop=false;direction=[0,0];speed=0;}
  else if(has(['attack','shoot','kick','punch','hit','interact','use','dive','save','celebrate','death','die'])){state='action';loop=false;direction=[0,0];speed=0;action=has(['shoot','kick'])?'shoot':(has(['dive','save'])?'dive':(has(['interact','use'])?'interact':'action'));}
  const base=String((asset&&asset.name)||clip||('Motion '+(index+1))).replace(/\.(?:glb|gltf|fbx)$/i,'').replace(/[_-]+/g,' ').trim();
  return {id:'motion-'+Date.now()+'-'+index,name:base||('Motion '+(index+1)),state,action,direction,speed,speedTolerance:state==='grounded'?(speed>3?2.5:1.6):2,asset:storableAssetRef(asset),clip:String(clip||''),loop,priority:1,playbackRate:1,sourceOrientation:'y-up',previewScale:1,motionTransform:{position:[0,0,0],rotation:[0,0,0]},rigCorrections:{},curveCorrection:{offset:[0,0,0],influence:1,falloff:'smooth-midpoint'}};
}
function actionSlotCatalog(){
  const source=window.LK_LOGIC_TEMPLATES_CHARACTER&&window.LK_LOGIC_TEMPLATES_CHARACTER.ANIMATION_SLOTS;
  return (Array.isArray(source)?source:[]).map(item=>({key:String(item[1]||''),label:String(item[2]||item[1]||''),description:String(item[3]||'')})).filter(item=>item.key);
}
function ensurePawnStudioActionSlots(definition){
  if(!definition)return [];
  definition.animations=definition.animations&&typeof definition.animations==='object'?definition.animations:{};
  definition.animationSet=Array.isArray(definition.animationSet)?definition.animationSet:[];
  const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET,catalog=actionSlotCatalog(),stateOwned=new Set(['idle','walk','run','strafeLeft','strafeRight','jump','fall','land','landMoving']);
  catalog.forEach((slot,index)=>{
    if(stateOwned.has(slot.key))return;
    const exists=definition.animationSet.some(entry=>entry&&entry.state==='action'&&(entry.action===slot.key||entry.id==='action-slot-'+slot.key));if(exists)return;
    const spec=runtime&&runtime.binding?runtime.binding(definition.animations[slot.key]):{clip:String(definition.animations[slot.key]||''),asset:null},loop=/^(?:climb|hang|runAiming|crouchIdle|crouchAimIdle|coverSneakLeft|coverSneakRight|climbUp|climbDown|ledgeShimmyLeft|ledgeShimmyRight)$/.test(slot.key);
    definition.animationSet.push({id:'action-slot-'+slot.key,name:slot.label||slot.key,state:'action',action:slot.key,direction:[0,0],speed:0,speedTolerance:1,asset:spec.asset||null,clip:spec.clip||'',loop,priority:1,playbackRate:1,sourceOrientation:'y-up',previewScale:1,motionTransform:{position:[0,0,0],rotation:[0,0,0]},rigCorrections:{},poseTimeline:{version:1,keyframes:[]},curveCorrection:{offset:[0,0,0],influence:1,falloff:'smooth-midpoint'},slotDescription:slot.description,slotOrder:index});
  });
  return definition.animationSet;
}
function signedPlaybackRate(value){const number=Number(value),rate=Number.isFinite(number)?number:1,sign=rate<0?-1:1;return sign*Math.max(.1,Math.min(4,Math.abs(rate)));}
function combinedPlaybackRate(authored,preview){return signedPlaybackRate(authored)*Math.max(.01,Number(preview)||1);}
function motionTimelineMetrics(entry,clipDuration,actionTime){const sourceDuration=Math.max(.001,Number(clipDuration)||1),rate=signedPlaybackRate(entry&&entry.playbackRate),absoluteRate=Math.max(.01,Math.abs(rate)),slotDuration=sourceDuration/absoluteRate,sourcePhase=Math.max(0,Math.min(1,(Number(actionTime)||0)/sourceDuration)),playPhase=rate<0?1-sourcePhase:sourcePhase;return {sourceDuration,rate,slotDuration,sourcePhase,playPhase,seconds:playPhase*slotDuration};}
function sceneModel(graph,preferred){const scene=graph&&graph.logicScene||{},all=[scene.root].concat(scene.elements||[]).filter(Boolean);return all.find(element=>element.id===preferred&&element.asset)||all.find(element=>element.asset)||null;}
function characterModelElement(graph){const scene=graph&&graph.logicScene||{};return (scene.elements||[]).find(element=>element&&element.id==='character_model')||null;}
function characterModelAlignment(graph){
  const element=characterModelElement(graph)||{},position=Array.isArray(element.position)?element.position:[0,0,0],rotation=Array.isArray(element.rotation)?element.rotation:[0,0,0],scale=Array.isArray(element.scale)?element.scale:[1,1,1];
  return {element,position:[Number(position[0])||0,Number(position[1])||0,Number(position[2])||0],rotation:[Number(rotation[0])||0,Number(rotation[1])||0,Number(rotation[2])||0],scale:[Math.max(.01,Number(scale[0])||1),Math.max(.01,Number(scale[1])||1),Math.max(.01,Number(scale[2])||1)]};
}
const SEATING_VEHICLES=Object.freeze([
  Object.freeze({key:'family:native-and-logic-vehicles',label:'Native / Logic Vehicle',assetKind:'car',asset:{key:'builtin:sketchbook/car',src:'models/sketchbook/car.glb',name:'Native / Logic vehicle reference',kind:'glb'}}),
  Object.freeze({key:'family:sketchbook-car',label:'DollBody / Sketchbook Car',assetKind:'car',asset:{key:'builtin:sketchbook/car',src:'models/sketchbook/car.glb',name:'DollBody Car',kind:'glb'}}),
  Object.freeze({key:'family:sketchbook-airplane',label:'DollBody / Sketchbook Airplane',assetKind:'airplane',asset:{key:'builtin:sketchbook/airplane',src:'models/sketchbook/airplane.glb',name:'DollBody Airplane',kind:'glb'}}),
  Object.freeze({key:'family:sketchbook-helicopter',label:'DollBody / Sketchbook Helicopter',assetKind:'helicopter',asset:{key:'builtin:sketchbook/helicopter',src:'models/sketchbook/heli.glb',name:'DollBody Helicopter',kind:'glb'}}),
]);
// Pawn Studio must preview the same metre-normalized vehicles as Play. Keeping
// only src/name here silently loaded the raw 2.49-unit car beside a 1.8 m Pawn,
// while the runtime expands that car to 4.4 m. The fallback mirrors the bundled
// catalog so tests and minimal editor shells retain the same scale contract.
const SEATING_SOURCE_SIZE=Object.freeze({car:2.4926951,airplane:3.5621045,helicopter:3.9225264}),SEATING_VEHICLE_SCALE=4.4/SEATING_SOURCE_SIZE.car;
function seatingVehicleAsset(itemOrKey){
  const item=typeof itemOrKey==='string'?SEATING_VEHICLES.find(entry=>entry.key===itemOrKey):itemOrKey;if(!item)return null;
  const kind=item.assetKind||'car',sourceFit=SEATING_SOURCE_SIZE[kind]||SEATING_SOURCE_SIZE.car,fit=Number((sourceFit*SEATING_VEHICLE_SCALE).toFixed(6)),catalog=window.LK_LOGIC_TEMPLATES_SKETCHBOOK&&window.LK_LOGIC_TEMPLATES_SKETCHBOOK.ASSETS,authoritative=catalog&&catalog[kind];
  return clone(Object.assign({},item.asset,{fit,sourceFit},authoritative||{}));
}
function seatingSettings(definition){const value=definition.vehicleSeating=definition.vehicleSeating&&typeof definition.vehicleSeating==='object'?definition.vehicleSeating:{};value.profiles=value.profiles&&typeof value.profiles==='object'?value.profiles:{};if(value.enabled==null)value.enabled=true;if(value.editorProfile==null)value.editorProfile='family:sketchbook-car';return value;}
function seatingProfile(definition,key,asset){
  const settings=seatingSettings(definition),runtime=window.LK_RUNTIME_VEHICLE_OCCUPANCY,synthetic=key==='family:native-and-logic-vehicles',source=settings.profiles[key];
  // A complete v5 profile is already normalized. Keep that same object while
  // authoring: rebuilding it on every Properties refresh made a subsequent
  // dummy edit continue against a replacement profile and appear to reset the
  // previous target. Older/incomplete saves still pass through migration.
  const complete=source&&Number(source.schemaVersion)>=5&&Array.isArray(source.position)&&Array.isArray(source.rotation)&&source.ik&&Array.isArray(source.ik.leftHand)&&Array.isArray(source.ik.rightHand)&&Array.isArray(source.ik.leftFoot)&&Array.isArray(source.ik.rightFoot),value=complete?source:(runtime&&runtime.normalizeSeatProfile?runtime.normalizeSeatProfile(source,key,synthetic):(source||{schemaVersion:5,position:synthetic?[-.34,-.42,.08]:[0,-.56,0],rotation:[0,0,0],visible:true,ik:{enabled:true,weight:1,headWeight:.65,torsoWeight:0,shoulderWeight:0,toeWeight:0,pelvis:[0,.58,.14],spine:[0,.86,.2],chest:[0,1.05,.26],leftShoulder:[.45,.78,.22],rightShoulder:[-.45,.78,.22],head:[0,1.12,.55],leftHand:[.27,.18,.42],rightHand:[-.27,.18,.42],leftFoot:[.2,-.5,.42],rightFoot:[-.2,-.5,.42],leftToe:[.2,-.5,.72],rightToe:[-.2,-.5,.72],leftElbowPole:[.58,.05,.12],rightElbowPole:[-.58,.05,.12],leftKneePole:[.28,-.32,.7],rightKneePole:[-.28,-.32,.7],pelvisRotation:[0,0,0],spineRotation:[0,0,0],chestRotation:[0,0,0],leftShoulderRotation:[0,0,0],rightShoulderRotation:[0,0,0],leftHandRotation:[0,0,0],rightHandRotation:[0,0,0],leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftToeRotation:[0,0,0],rightToeRotation:[0,0,0],fingers:{left:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62},right:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62}}}}));
  if(asset)value.asset=clone(asset);settings.profiles[key]=value;settings.editorProfile=key;return value;
}
function seatingNeutralMotion(definition){
  const motions=Array.isArray(definition&&definition.animationSet)?definition.animationSet:[],grounded=motions.filter(entry=>entry&&entry.state==='grounded'&&entry.loop!==false);
  if(!grounded.length){const source=definition&&definition.animations&&definition.animations.idle;if(!source)return null;const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET,binding=runtime&&runtime.binding?runtime.binding(source):{clip:String(source||''),asset:null};return {id:'seat-preview-idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,loop:true,priority:1,playbackRate:1,sourceOrientation:'y-up',previewScale:1,motionTransform:{position:[0,0,0],rotation:[0,0,0]},rigCorrections:{},asset:binding.asset||null,clip:binding.clip||String(source||'')};}
  const score=entry=>{const direction=Array.isArray(entry.direction)?entry.direction:[0,0],speed=Math.abs(Number(entry.speed)||0),motion=Math.hypot(Number(direction[0])||0,Number(direction[1])||0);return speed*10+motion-(Number(entry.priority)||0)*.001;};
  return grounded.slice().sort((a,b)=>score(a)-score(b))[0]||null;
}
function hideSeatingVehicleMetadata(model){
  let hidden=0;if(!model||!model.traverse)return hidden;
  model.traverse(node=>{if(node===model)return;const data=node&&node.userData||{},tag=String(data.data||data.kind||data.sketchbookPart||'').toLowerCase();if(!/^(?:collision|physics|navmesh)$/.test(tag)&&data.sketchbookPhysics!==true)return;node.visible=false;data.lkPawnStudioVehicleMetadataHidden=true;hidden++;});
  model.userData=model.userData||{};model.userData.lkPawnStudioHiddenVehicleMetadataCount=hidden;return hidden;
}
function ensureSeatingVehicleVisible(model){
  if(!model||!model.traverse)return 0;model.visible=true;let visibleMeshes=0;
  model.traverse(node=>{if(!node||!node.isMesh)return;const data=node.userData||{};if(data.lkPawnStudioVehicleMetadataHidden||data.lkMeshEditDeleted||data.lkMeshEditSplitHidden)return;node.visible=true;let current=node.parent;while(current){const parentData=current.userData||{};if(parentData.lkPawnStudioVehicleMetadataHidden)break;current.visible=true;if(current===model)break;current=current.parent;}visibleMeshes++;});
  return visibleMeshes;
}
function alignUntouchedExactSeatProfile(profile,key,graph){
  const runtime=window.LK_RUNTIME_VEHICLE_OCCUPANCY;if(!runtime||!runtime.defaultSeatProfile||!profile||String(key||'').indexOf('asset:')!==0||!window.THREE)return false;
  const base=runtime.defaultSeatProfile(key,false),same=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length>=3&&b.every((number,index)=>Math.abs((Number(a[index])||0)-number)<.0001),targets=['pelvis','spine','chest','leftShoulder','rightShoulder','head','leftHand','rightHand','leftFoot','rightFoot','leftToe','rightToe','leftElbowPole','rightElbowPole','leftKneePole','rightKneePole'];
  if(!profile.ik||!base.ik||!targets.every(name=>same(profile.ik[name],base.ik[name])))return false;
  const alignment=characterModelAlignment(graph),degrees=alignment.rotation;if(!degrees.some(value=>Math.abs(Number(value)||0)>.0001))return false;
  const THREE=window.THREE,origin=new THREE.Vector3().fromArray(profile.position||[0,0,0]),quaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(...degrees.map(value=>THREE.MathUtils.degToRad(Number(value)||0)),'XYZ'));
  targets.forEach(name=>{const point=new THREE.Vector3().fromArray(profile.ik[name]).sub(origin).applyQuaternion(quaternion).add(origin),values=[point.x,point.y,point.z].map(value=>Math.abs(value)<.0001?0:Number(value.toFixed(4)));profile.ik[name].splice(0,3,...values);});
  profile.characterAlignment=degrees.slice();return true;
}
function activeLevelPlayerAsset(STORE){
  let scene=null;try{scene=STORE&&typeof STORE.load==='function'?STORE.load():null;}catch(error){}
  const player=scene&&scene.player;if(!player||(!player.modelDbKey&&!player.modelSrc))return null;
  return storableAssetRef(Object.assign({fit:5.6,source:'Active Level Player Car'},player));
}
function activeNativeVehicleAsset(storedAsset){
  const game=window.LOT_KING,player=game&&game.player,owner=player&&player.car,data=owner&&owner.userData||{},model=player&&typeof player.getModel==='function'?player.getModel():null,modelData=model&&model.userData||{};
  const stored=storedAsset||{},ref=storableAssetRef({id:data.modelId||modelData.modelId||stored.id,key:data.modelKey||modelData.modelKey||stored.key,modelDbKey:data.modelDbKey||modelData.modelDbKey||stored.dbKey,modelSrc:data.modelSrc||modelData.modelSrc||stored.src,modelName:data.modelName||modelData.modelName||stored.name||model&&model.name,fit:data.modelFit||modelData.modelFit||stored.fit||5.6,source:'Active Player Car'});
  return ref&&(ref.dbKey||ref.key||ref.id||ref.src)?ref:null;
}
function seatingPreviewAsset(asset,storedAsset){
  const source=storableAssetRef(asset),active=storableAssetRef(storedAsset);if(!source||!active)return source||active;
  const identities=ref=>new Set([ref.dbKey,ref.key,ref.id,ref.src,ref.name].filter(Boolean).map(String)),wanted=identities(source),same=Array.from(identities(active)).some(value=>wanted.has(value));
  if(!same)return source;
  // The exact profile owns identity/metadata; the active Player descriptor owns
  // runtime fit. High Poly Car is authored as a native Player at 5.6 m even when
  // its older Asset Library row still says 5 m. Loading that stale row directly
  // made the seat preview disagree with the model that Play actually drives.
  const merged=Object.assign({},source,active);
  ['id','key','dbKey','src','name'].forEach(field=>{merged[field]=active[field]||source[field]||null;});
  return merged;
}
function seatingAssetRows(definition,assets,translate,storedAsset){
  const settings=seatingSettings(definition),candidates=(Array.isArray(assets)?assets:[]).filter(asset=>asset&&asset.kind==='glb').slice(),activeAsset=activeNativeVehicleAsset(storedAsset);
  Object.keys(settings.profiles||{}).forEach(key=>{const asset=settings.profiles[key]&&settings.profiles[key].asset;if(asset)candidates.push(asset);});if(activeAsset)candidates.push(activeAsset);
  const seen=new Set(),tr=typeof translate==='function'?translate:(english=>english),rows=[];
  candidates.forEach(asset=>{const ref=storableAssetRef(asset),identity=String(ref&&ref.dbKey||ref&&ref.key||ref&&ref.id||ref&&ref.src||ref&&ref.name||'');if(!identity||seen.has(identity))return;seen.add(identity);rows.push({key:'asset:'+identity,asset:ref,label:(ref.name||identity)+' · '+tr('exact asset','asset esatto')});});
  return rows;
}
function pawnDefinition(graph){return graph.characterPawn||graph.soccerPawn||graph.vehiclePawn||graph.playerPawnBlueprint||null;}
function worldCharacterModelNode(object){let found=null;if(object&&object.traverse)object.traverse(node=>{if(!found&&node&&node.userData&&node.userData.logicElementSceneId==='character_model'&&node.userData.logicElementAssetKey)found=node;});return found;}
function worldAlignmentMatches(object,graph){
  const node=worldCharacterModelNode(object);if(!node||!window.THREE)return null;const alignment=characterModelAlignment(graph),epsilon=1e-4,rotation=[window.THREE.MathUtils.radToDeg(node.rotation.x),window.THREE.MathUtils.radToDeg(node.rotation.y),window.THREE.MathUtils.radToDeg(node.rotation.z)],values=[node.position.x-alignment.position[0],node.position.y-alignment.position[1],node.position.z-alignment.position[2],rotation[0]-alignment.rotation[0],rotation[1]-alignment.rotation[1],rotation[2]-alignment.rotation[2],node.scale.x-alignment.scale[0],node.scale.y-alignment.scale[1],node.scale.z-alignment.scale[2]];return values.every(value=>Math.abs(value)<epsilon);
}

/* ---------------------------------------------------------------
   Weapon grip authoring — the hands on the weapon

   A grip belongs to the WEAPON, not to one clip. Every motion that holds the
   same weapon has to put the hands on the same point, otherwise the hands jump
   as the character changes state, so the authored values live once on the
   weapon config (`firstPerson.weapon.grip`) and every motion previews the same
   numbers. The author still reaches this from the clip they are looking at,
   because "this animation holds the weapon" is how the need presents itself.

   The frame is the one `pawn.weaponPose()` resolves against: eye-relative
   metres, +x towards the weapon hand (the right shoulder until the player
   swaps), +y world up, +z straight ahead, degrees for rotation. `aim` and
   `fire` are ADDITIVE on top of the hold, which is why an untouched layer is
   all zeros and means "nothing changes while aiming/firing".
   --------------------------------------------------------------- */
const GRIP_HANDS=['single','double','thrown','unarmed'];
const GRIP_LAYERS=['hold','aim','fire'];
const GRIP_SUPPORT_MODES=['auto','on','off'];
const GRIP_GAITS=['idle','walk','run'];
const GRIP_AIM_MODES=['hip','aim'];
const GRIP_SIDES=['right','left'];
const GRIP_FINGERS=['thumb','index','middle','ring','pinky'];
// Starting points, not opinions: each one is a plausible hold for that grip so
// the first dummy appears near the body instead of at the eye, and the author
// drags from there.
const GRIP_PRESETS={
  single:{trigger:{position:[.15,-.18,.40],rotation:[0,0,0]},support:{position:[-.10,-.22,.62],rotation:[0,0,0]}},
  double:{trigger:{position:[.15,-.18,.40],rotation:[0,0,0]},support:{position:[-.08,-.24,.72],rotation:[0,0,0]}},
  thrown:{trigger:{position:[.30,-.02,-.04],rotation:[0,0,0]},support:{position:[-.16,-.28,.20],rotation:[0,0,0]}},
  unarmed:{trigger:{position:[.20,-.26,.34],rotation:[0,0,0]},support:{position:[-.20,-.24,.30],rotation:[0,0,0]}},
};
// An author who drags an additive hand back onto the hold means "nothing changes
// while aiming / firing", and that answer has to survive the trip to the game.
// The runtime reads an all-zero vector as "inherit the default for this weapon
// kind", so storing a true zero would silently reinstate the weapon's own aim
// shift — the arms moving when the player aims is the exact complaint this mode
// exists to fix. A tenth of a millimetre is unambiguously authored, is below the
// panel's own display precision and is invisible in the viewport.
const GRIP_AUTHORED_EPSILON=.0001;
function authoredAdditive(vector){return vector[0]||vector[1]||vector[2]?vector:[0,0,GRIP_AUTHORED_EPSILON];}
function gripNumber(value){const number=Number(value);return Number.isFinite(number)?number:0;}
function gripVector(value,fallback){const source=Array.isArray(value)?value:null,base=Array.isArray(fallback)?fallback:[0,0,0];return [0,1,2].map(index=>gripNumber(source&&source[index]!=null?source[index]:base[index]));}
function gripHandPose(source,fallback){const raw=source&&typeof source==='object'?source:{};return {position:gripVector(raw.position,fallback.position),rotation:gripVector(raw.rotation,fallback.rotation)};}
function normalizedFingerHand(source){const raw=source&&typeof source==='object'?source:{};return GRIP_FINGERS.reduce((out,name)=>{out[name]=Math.max(0,Math.min(1,gripNumber(raw[name])));return out;},{});}
function normalizedGripFingers(source){const raw=source&&typeof source==='object'?source:{};return {trigger:normalizedFingerHand(raw.trigger),support:normalizedFingerHand(raw.support)};}
function runtimeWeaponDescriptor(weapon){
  const runtime=window.LK_RUNTIME_FIRST_PERSON;
  if(runtime&&typeof runtime.normalizeWeapon==='function')try{return runtime.normalizeWeapon(weapon||{});}catch(error){}
  return weapon;
}
// With nothing authored the grip follows what the weapon already is, so a
// sidearm does not open as a two-handed rifle and fists do not open holding air.
function defaultGripHands(weapon){
  const runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE;
  const resolved=runtimeWeaponDescriptor(weapon);
  if(runtime&&typeof runtime.defaultHands==='function')try{return runtime.defaultHands(resolved);}catch(error){}
  const kind=String(resolved&&resolved.kind||'').toLowerCase(),preset=String(resolved&&resolved.preset||'').toLowerCase();
  if(kind==='unarmed')return 'unarmed';
  if(kind==='thrown')return 'thrown';
  if(preset==='pistol'||preset==='sidearm')return 'single';
  return 'double';
}
function gripPreset(weapon,hands){
  const runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE;
  if(runtime&&typeof runtime.resolveGrip==='function')try{
    const resolved=runtime.resolveGrip(runtimeWeaponDescriptor(weapon),[{hands}]);
    if(resolved)return {trigger:{position:resolved.trigger.position.slice(),rotation:resolved.trigger.rotation.slice()},support:{position:resolved.support.position.slice(),rotation:resolved.support.rotation.slice()}};
  }catch(error){}
  return GRIP_PRESETS[hands]||GRIP_PRESETS.double;
}
function normalizedSupportMode(raw){
  const value=raw&&raw.supportHand!==undefined?raw.supportHand:(raw&&raw.support&&raw.support.enabled);
  if(value===true)return'on';if(value===false)return'off';
  return GRIP_SUPPORT_MODES.includes(String(value))?String(value):'auto';
}
function normalizedGrip(source,fallbackHands,weapon){
  const raw=source&&typeof source==='object'?source:{};
  const fallback=GRIP_HANDS.includes(String(fallbackHands))?String(fallbackHands):'double';
  const hands=GRIP_HANDS.includes(String(raw.hands))?String(raw.hands):fallback,preset=gripPreset(weapon,hands);
  const aim=raw.aim&&typeof raw.aim==='object'?raw.aim:{},fire=raw.fire&&typeof raw.fire==='object'?raw.fire:{};
  const legacyTrigger=raw.trigger&&raw.trigger.position,legacySupport=raw.support&&raw.support.position,legacyDefault=Array.isArray(legacyTrigger)&&Array.isArray(legacySupport)&&[.15,-.18,.40].every((number,index)=>Math.abs(gripNumber(legacyTrigger[index])-number)<.0001)&&[.18,-.26,.90].every((number,index)=>Math.abs(gripNumber(legacySupport[index])-number)<.0001);
  const result={
    hands,
    supportHand:normalizedSupportMode(raw),
    trigger:gripHandPose(raw.trigger,preset.trigger),
    support:gripHandPose(legacyDefault?null:raw.support,preset.support),
    aim:{trigger:gripVector(aim.trigger,[0,0,0]),support:gripVector(aim.support,[0,0,0])},
    fire:{trigger:gripVector(fire.trigger,[0,0,0]),support:gripVector(fire.support,[0,0,0])},
  };
  if(raw.fingers&&typeof raw.fingers==='object')result.fingers=normalizedGripFingers(raw.fingers);
  if(raw.profiles&&typeof raw.profiles==='object')result.profiles=clone(raw.profiles);
  return result;
}
// Whether the game will actually pose the off hand, asked of the layer that does
// it rather than decided here. `character-weapon-pose` enables the support arm
// per weapon KIND, and a guard stance or a grenade brace uses the off hand even
// though neither is a two-handed grip — hiding the dummy for those would leave
// the author unable to place a hand the game moves anyway, which is the same
// class of bug as not being able to place the trigger hand. The
// `hands==='double'` fallback covers a shell that loaded the editor without the
// runtime, and is exactly the old behaviour.
function gripSupportActive(definition,grip,weaponOverride){
  const value=grip&&typeof grip==='object'&&grip.support?grip:normalizedGrip(grip);
  const runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE;
  if(!runtime||typeof runtime.resolveGrip!=='function')return value.supportHand==='on'?true:(value.supportHand==='off'?false:value.hands==='double');
  try{
    const resolved=runtime.resolveGrip(runtimeWeaponDescriptor(weaponOverride||weaponConfigFor(definition,false)),[value]);
    return !!(resolved&&resolved.support&&resolved.support.enabled);
  } catch(error){return value.supportHand==='on'?true:(value.supportHand==='off'?false:value.hands==='double');}
}
// What the game applies for an additive layer the author has NOT touched. The
// runtime reads an all-zero vector as "inherit the default for this weapon kind",
// so a panel that showed only the stored zeros would be telling the author
// "nothing happens while aiming" while the game moves the hands by the weapon's
// own aim shift. Returns null when the layer is authored, or when there is
// nothing inherited to disclose.
function inheritedGripLayer(definition,grip,layer,hand,weaponOverride){
  if(!GRIP_LAYERS.includes(String(layer))||layer==='hold')return null;
  const value=grip&&typeof grip==='object'&&grip[layer]?grip:normalizedGrip(grip),side=hand==='support'?'support':'trigger';
  const authored=value[layer][side];
  if(authored[0]||authored[1]||authored[2])return null;
  const runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE;
  if(!runtime||typeof runtime.resolveGrip!=='function')return null;
  try{
    const resolved=runtime.resolveGrip(runtimeWeaponDescriptor(weaponOverride||weaponConfigFor(definition,false)),[value]),offset=resolved&&resolved[layer]&&resolved[layer][side];
    return Array.isArray(offset)&&(offset[0]||offset[1]||offset[2])?offset.slice():null;
  } catch(error){return null;}
}

// Every weapon already configured on the Pawn is an authoring target. The
// entries point at the original descriptors: selecting a loadout weapon edits
// that weapon's own grip instead of copying it into the starting weapon.
function gripWeaponEntries(definition){
  if(!definition||typeof definition!=='object')return [];
  const result=[],seen=new Set(),append=(key,weapon,fallback)=>{
    if(!weapon||typeof weapon!=='object'||seen.has(weapon))return;
    seen.add(weapon);const runtime=window.LK_RUNTIME_FIRST_PERSON;
    let normalized=null;try{normalized=runtime&&runtime.normalizeWeapon?runtime.normalizeWeapon(weapon):null;}catch(error){}
    result.push({key,weapon,label:String(weapon.name||normalized&&normalized.name||weapon.preset||fallback)});
  };
  append('primary',weaponConfigFor(definition,false),'Starting weapon');
  (Array.isArray(definition.loadout)?definition.loadout:[]).forEach((weapon,index)=>append('loadout:'+index,weapon,'Loadout '+(index+1)));
  return result;
}
function gripWeaponForState(state,create){
  const entries=gripWeaponEntries(state&&state.definition),selected=entries.find(entry=>entry.key===state.gripWeaponKey)||entries[0];
  if(selected){state.gripWeaponKey=selected.key;return selected.weapon;}
  return weaponConfigFor(state&&state.definition,create===true);
}
function gripContextKey(value){const raw=String(value||'base').toLowerCase();if(raw==='base')return'base';const parts=raw.split('.');return GRIP_AIM_MODES.includes(parts[0])&&GRIP_GAITS.includes(parts[1])&&GRIP_SIDES.includes(parts[2])?parts.join('.'):'base';}
function gripContextSpec(value){const key=gripContextKey(value),parts=key.split('.');return key==='base'?null:{key,aim:parts[0]==='aim'?1:0,mode:parts[0],gait:parts[1],side:parts[2]};}
function gripContextOptions(){const out=['base'];GRIP_AIM_MODES.forEach(mode=>GRIP_GAITS.forEach(gait=>GRIP_SIDES.forEach(side=>out.push(mode+'.'+gait+'.'+side))));return out;}
function gripProfileSeed(weapon,base,spec){
  const runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE;let resolved=null;
  try{resolved=runtime&&runtime.resolveContextGrip?runtime.resolveContextGrip(runtimeWeaponDescriptor(weapon),[base],spec):null;}catch(error){}
  const source=resolved||base,fingers=normalizedGripFingers(source.fingers);
  return {hands:source.hands,supportHand:source.support&&source.support.enabled?'on':'off',trigger:{position:source.trigger.position.slice(),rotation:source.trigger.rotation.slice()},support:{position:source.support.position.slice(),rotation:source.support.rotation.slice()},aim:{trigger:[0,0,0],support:[0,0,0]},fire:{trigger:source.fire.trigger.slice(),support:source.fire.support.slice()},fingers};
}
function stateWeaponGripConfig(state,create){
  const weapon=gripWeaponForState(state,create),base=normalizedGrip(weapon&&weapon.grip,defaultGripHands(weapon),weapon),spec=gripContextSpec(state&&state.gripContextKey);
  if(create===true&&weapon)weapon.grip=base;
  if(!spec)return base;
  const profiles=base.profiles||(create===true?(base.profiles={}):null),stored=profiles&&profiles[spec.key];
  if(stored){const value=normalizedGrip(stored,base.hands,weapon);value.fingers=normalizedGripFingers(stored.fingers||base.fingers);if(create===true)profiles[spec.key]=value;return value;}
  if(create===true&&profiles){const seeded=gripProfileSeed(weapon,base,spec);profiles[spec.key]=seeded;return seeded;}
  return gripProfileSeed(weapon,base,spec);
}
// Where a dummy stands for the layer being edited: the hold is absolute, an
// additive layer is drawn on top of the hold so the author sees the pose the
// game will actually reach while aiming or recoiling.
function gripHandOffset(grip,hand,layer){
  const value=normalizedGrip(grip),side=hand==='support'?'support':'trigger',base=value[side].position;
  const key=GRIP_LAYERS.includes(String(layer))?String(layer):'hold';
  if(key==='hold')return base.slice();
  const additive=value[key][side];
  return [0,1,2].map(index=>base[index]+additive[index]);
}
function weaponConfigFor(definition,create){
  if(!definition||typeof definition!=='object')return null;
  let firstPerson=definition.firstPerson;
  if(!firstPerson||typeof firstPerson!=='object'){if(!create)return null;firstPerson=definition.firstPerson={};}
  let weapon=firstPerson.weapon;
  if(!weapon||typeof weapon!=='object'){if(!create)return null;weapon=firstPerson.weapon={id:'primary',preset:'rifle'};}
  return weapon;
}
// The carried-weapon socket belongs to the Pawn rig rather than to one weapon.
// Pawn Studio edits the same block consumed by first-person-controller and Play;
// rotations remain radians in storage even though the author sees degrees.
function weaponSocketConfig(definition,create){
  if(!definition||typeof definition!=='object')return {bone:'',offset:[0,0,0],rotation:[0,0,0],scale:1,followHandRotation:true,showHelper:false};
  let firstPerson=definition.firstPerson;
  if(!firstPerson||typeof firstPerson!=='object'){if(!create)return weaponSocketConfig(null,false);firstPerson=definition.firstPerson={};}
  const raw=firstPerson.weaponSocket&&typeof firstPerson.weaponSocket==='object'?firstPerson.weaponSocket:{};
  const vector=value=>{const source=Array.isArray(value)?value:[0,0,0];return [0,1,2].map(index=>Math.max(-20,Math.min(20,Number(source[index])||0)));};
  const socket={bone:typeof raw.bone==='string'?raw.bone.trim():'',offset:vector(raw.offset),rotation:vector(raw.rotation),scale:Math.max(.05,Math.min(20,Number(raw.scale)||1)),followHandRotation:raw.followHandRotation!==false,showHelper:raw.showHelper===true};
  if(create===true)firstPerson.weaponSocket=socket;
  return socket;
}
// Reading never writes: the Pawn tree shows the grip badge for every character,
// including the ones that were never armed, and browsing must not invent a
// weapon on them. Authoring passes create=true and gets the object that is
// stored, so the panel and the dummies mutate the saved value in place.
function weaponGripConfig(definition,create){
  const weapon=weaponConfigFor(definition,create===true),grip=normalizedGrip(weapon&&weapon.grip,defaultGripHands(weapon),weapon);
  if(create===true&&weapon)weapon.grip=grip;
  return grip;
}
function gripEyeHeight(definition){const value=Number(definition&&definition.firstPerson&&definition.firstPerson.eyeHeight);return Number.isFinite(value)?Math.max(.2,Math.min(4,value)):1.62;}
// The runtime eye is the Pawn root plus `firstPerson.eyeHeight`, so the editor
// frame is built the same way instead of guessing at a head bone: authored
// metres then mean the same thing here and in Play. Yaw only — inheriting an
// authored mesh pitch or roll would tilt the frame and silently change what
// the same numbers mean from Pawn to Pawn.
function gripEyeAnchor(state){
  const THREE=window.THREE,model=state&&state.model;if(!THREE||!model||!model.getWorldPosition)return null;
  model.updateMatrixWorld(true);
  const position=model.getWorldPosition(new THREE.Vector3());position.y+=gripEyeHeight(state.definition);
  const quaternion=model.getWorldQuaternion(new THREE.Quaternion()),euler=new THREE.Euler().setFromQuaternion(quaternion,'YXZ');
  quaternion.setFromEuler(new THREE.Euler(0,euler.y,0,'YXZ'));
  return {position,quaternion};
}
function activeGripDummy(state){if(!state)return null;return state.gripHand==='support'?state.gripSupportDummy||null:state.gripTriggerDummy||null;}
// The viewport itself is part of the hand selector. Requiring the author to
// notice a small toolbar dropdown while two coloured handles are in front of
// them made the support hand look locked: TransformControls simply remained on
// the trigger dummy. Raycast only the two authoring spheres (never the weapon or
// skeleton), and let the normal selectGripHand path reattach the gizmo.
function gripHandFromPointer(state,event){
  const THREE=window.THREE,canvas=state&&state.renderer&&state.renderer.domElement,camera=state&&state.camera;
  if(!THREE||!canvas||!camera||!event||!state.gripMode)return null;
  const rect=canvas.getBoundingClientRect&&canvas.getBoundingClientRect();if(!rect||!rect.width||!rect.height)return null;
  const pointer=state.gripPointer||(state.gripPointer=new THREE.Vector2()),raycaster=state.gripRaycaster||(state.gripRaycaster=new THREE.Raycaster());
  pointer.set(((Number(event.clientX)-rect.left)/rect.width)*2-1,-((Number(event.clientY)-rect.top)/rect.height)*2+1);
  if(state.gripGroup&&state.gripGroup.updateMatrixWorld)state.gripGroup.updateMatrixWorld(true);
  raycaster.setFromCamera(pointer,camera);
  const candidates=[state.gripTriggerDummy,state.gripSupportDummy].filter(Boolean),hits=raycaster.intersectObjects(candidates,false);
  const object=hits.length&&hits[0].object;return object&&object.userData&&object.userData.lkPawnStudioGripHand||null;
}
function seatingTargetFromPointer(state,event){
  const THREE=window.THREE,canvas=state&&state.renderer&&state.renderer.domElement,camera=state&&state.camera;
  if(!THREE||!canvas||!camera||!event||!state.seatingMode||!state.seatingTargets)return null;
  const rect=canvas.getBoundingClientRect&&canvas.getBoundingClientRect();if(!rect||!rect.width||!rect.height)return null;
  const pointer=state.seatingPointer||(state.seatingPointer=new THREE.Vector2()),raycaster=state.seatingRaycaster||(state.seatingRaycaster=new THREE.Raycaster());
  pointer.set(((Number(event.clientX)-rect.left)/rect.width)*2-1,-((Number(event.clientY)-rect.top)/rect.height)*2+1);
  if(state.seatingTargetGroup&&state.seatingTargetGroup.updateMatrixWorld)state.seatingTargetGroup.updateMatrixWorld(true);
  raycaster.setFromCamera(pointer,camera);const candidates=[state.seatingMasterDummy,state.seatingRootDummy].concat(Object.values(state.seatingTargets)).filter(target=>target&&target.visible!==false),hits=raycaster.intersectObjects(candidates,false),object=hits.length&&hits[0].object;
  return object&&object.userData&&object.userData.lkSeatingTarget||null;
}
function cameraTargetFromPointer(state,event){
  const THREE=window.THREE,canvas=state&&state.renderer&&state.renderer.domElement,camera=state&&state.camera;
  if(!THREE||!canvas||!camera||!event||!state.cameraEditMode||!state.cameraDummies)return null;
  const rect=canvas.getBoundingClientRect&&canvas.getBoundingClientRect();if(!rect||!rect.width||!rect.height)return null;
  const pointer=state.cameraPointer||(state.cameraPointer=new THREE.Vector2()),raycaster=state.cameraRaycaster||(state.cameraRaycaster=new THREE.Raycaster());
  pointer.set(((Number(event.clientX)-rect.left)/rect.width)*2-1,-((Number(event.clientY)-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);
  const hits=raycaster.intersectObjects(Object.values(state.cameraDummies).map(entry=>entry&&entry.pick).filter(Boolean),false),object=hits.length&&hits[0].object;
  return object&&object.userData&&object.userData.lkPawnStudioCamera||null;
}
function gripDummyMesh(THREE,color,emissive,hand){
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(.045,18,12),new THREE.MeshStandardMaterial({color,emissive,depthTest:false,transparent:true,opacity:.95}));
  mesh.renderOrder=31;mesh.userData.lkPawnStudioGripHand=hand;
  const axes=new THREE.AxesHelper(.14);if(axes.material){axes.material.depthTest=false;axes.material.transparent=true;}axes.renderOrder=32;mesh.add(axes);
  return mesh;
}
function gripReachLine(THREE,color){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
  const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.75}));line.renderOrder=30;return line;
}
function updateGripLines(state){
  if(!state||!state.gripGroup)return false;
  [[state.gripTriggerLine,state.gripTriggerDummy],[state.gripSupportLine,state.gripSupportDummy]].forEach(pair=>{
    const line=pair[0],dummy=pair[1];if(!line||!dummy||!line.geometry||!line.geometry.attributes.position)return;
    const array=line.geometry.attributes.position.array;
    array[0]=0;array[1]=0;array[2]=0;array[3]=dummy.position.x;array[4]=dummy.position.y;array[5]=dummy.position.z;
    line.geometry.attributes.position.needsUpdate=true;if(line.geometry.computeBoundingSphere)line.geometry.computeBoundingSphere();
    line.visible=dummy.visible;
  });
  return true;
}
function syncGripFrame(state){
  const anchor=gripEyeAnchor(state);if(!anchor||!state||!state.gripGroup)return false;
  state.gripGroup.position.copy(anchor.position);state.gripGroup.quaternion.copy(anchor.quaternion);state.gripGroup.updateMatrixWorld(true);
  syncGripWeaponPreview(state);return updateGripLines(state);
}
function syncGripDummies(state){
  const THREE=window.THREE;if(!THREE||!state||!state.gripGroup)return false;
  const weapon=gripWeaponForState(state,true),grip=stateWeaponGripConfig(state,true),layer=GRIP_LAYERS.includes(state.gripLayer)?state.gripLayer:'hold',supportActive=gripSupportActive(state.definition,grip,weapon),context=gripContextSpec(state.gripContextKey),mirror=context&&context.side==='left'?-1:1;
  [['trigger',state.gripTriggerDummy],['support',state.gripSupportDummy]].forEach(pair=>{
    const hand=pair[0],dummy=pair[1];if(!dummy)return;
    const offset=gripHandOffset(grip,hand,layer),rotation=(hand==='support'?grip.support:grip.trigger).rotation;
    dummy.position.set(offset[0]*mirror,offset[1],offset[2]);
    dummy.rotation.set(THREE.MathUtils.degToRad(rotation[0]),THREE.MathUtils.degToRad(rotation[1]),THREE.MathUtils.degToRad(rotation[2]));
    // Both dummies remain authorable. A disabled support arm is dimmed, not
    // removed: the author can place it first and enable it afterwards.
    dummy.visible=true;
    if(dummy.material)dummy.material.opacity=hand==='support'&&!supportActive ? .38 : .95;
    dummy.scale.setScalar(state.gripHand===hand?1.3:1);
  });
  state.gripGroup.updateMatrixWorld(true);syncGripWeaponPreview(state);updateGripLines(state);return true;
}
function buildGripDummies(state){
  clearGripDummies(state);
  const THREE=window.THREE;if(!THREE||!state||!state.scene)return null;
  stateWeaponGripConfig(state,true);
  const group=new THREE.Group();group.name='Pawn Studio · Weapon Grip';group.userData.lkPawnStudioGrip=true;
  const eye=new THREE.Mesh(new THREE.OctahedronGeometry(.028),new THREE.MeshBasicMaterial({color:0x94a3b8,depthTest:false,transparent:true,opacity:.7}));eye.renderOrder=30;
  const trigger=gripDummyMesh(THREE,0xffd166,0x5a3b00,'trigger'),support=gripDummyMesh(THREE,0x38bdf8,0x03354a,'support');
  const triggerLine=gripReachLine(THREE,0xffd166),supportLine=gripReachLine(THREE,0x38bdf8);
  group.add(eye,triggerLine,supportLine,trigger,support);state.scene.add(group);
  state.gripGroup=group;state.gripEyeMarker=eye;state.gripTriggerDummy=trigger;state.gripSupportDummy=support;state.gripTriggerLine=triggerLine;state.gripSupportLine=supportLine;
  state.gripHand=state.gripHand==='support'?'support':'trigger';state.gripLayer=GRIP_LAYERS.includes(state.gripLayer)?state.gripLayer:'hold';
  buildGripWeaponPreview(state);syncGripDummies(state);syncGripFrame(state);
  return group;
}

function clearGripWeaponPreview(state){
  const visual=state&&state.gripWeaponPreview;if(!visual)return false;
  if(state.transformControls&&state.transformControls.object===visual)state.transformControls.detach();
  if(visual.parent)visual.parent.remove(visual);
  if(visual.traverse)visual.traverse(node=>{if(node.geometry&&node.geometry.dispose)node.geometry.dispose();});
  (visual.userData&&visual.userData.materials||[]).forEach(material=>{if(material&&material.dispose)material.dispose();});
  state.gripWeaponPreview=null;return true;
}
function buildGripWeaponPreview(state){
  clearGripWeaponPreview(state);
  const runtime=window.LK_RUNTIME_FPS_VIEW_MODEL,THREE=window.THREE,weapon=gripWeaponForState(state,false);
  if(!runtime||typeof runtime.buildWorldModel!=='function'||!THREE||!weapon||!state.gripGroup)return null;
  const visual=runtime.buildWorldModel(THREE,weapon);if(!visual)return null;
  visual.name='Pawn Studio · Equipped Weapon Preview';visual.userData.lkPawnStudioWeaponPreview=true;
  state.gripGroup.add(visual);state.gripWeaponPreview=visual;syncGripWeaponPreview(state);return visual;
}
// Show the actual contract used in Play: the trigger hand is the weapon's sole
// transform owner. The support hand may solve towards the foregrip, but never
// contributes to weapon position or rotation. buildWorldModel points down -Z
// while the hand frame calls +Z forward, hence the half-turn.
function syncGripWeaponPreview(state){
  const THREE=window.THREE,visual=state&&state.gripWeaponPreview,hand=state&&state.gripTriggerDummy;
  if(!THREE||!visual||!hand)return false;
  const socket=weaponSocketConfig(state.definition,true),nudge=state.gripWeaponSocketNudge||(state.gripWeaponSocketNudge=new THREE.Vector3()),base=state.gripWeaponBaseQuaternion||(state.gripWeaponBaseQuaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI)),anchor=state.gripWeaponAnchorQuaternion||(state.gripWeaponAnchorQuaternion=new THREE.Quaternion()),delta=state.gripWeaponSocketQuaternion||(state.gripWeaponSocketQuaternion=new THREE.Quaternion());
  delta.setFromEuler(new THREE.Euler(socket.rotation[0],socket.rotation[1],socket.rotation[2],'XYZ'));
  anchor.copy(hand.quaternion).multiply(base).normalize();visual.position.copy(hand.position);visual.quaternion.copy(anchor).multiply(delta).normalize();
  if(socket.offset[0]||socket.offset[1]||socket.offset[2]){nudge.fromArray(socket.offset).applyQuaternion(visual.quaternion);visual.position.add(nudge);}
  visual.scale.setScalar(socket.scale);visual.updateMatrixWorld(true);return true;
}
function syncWeaponSocketFromPreview(state){
  const THREE=window.THREE,visual=state&&state.gripWeaponPreview,hand=state&&state.gripTriggerDummy;if(!THREE||!visual||!hand)return false;
  const socket=weaponSocketConfig(state.definition,true),base=state.gripWeaponBaseQuaternion||(state.gripWeaponBaseQuaternion=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI)),anchor=state.gripWeaponAnchorQuaternion||(state.gripWeaponAnchorQuaternion=new THREE.Quaternion()),delta=state.gripWeaponSocketQuaternion||(state.gripWeaponSocketQuaternion=new THREE.Quaternion()),offset=state.gripWeaponSocketNudge||(state.gripWeaponSocketNudge=new THREE.Vector3()),euler=state.gripWeaponSocketEuler||(state.gripWeaponSocketEuler=new THREE.Euler(0,0,0,'XYZ'));
  anchor.copy(hand.quaternion).multiply(base).normalize();delta.copy(anchor).invert().multiply(visual.quaternion).normalize();euler.setFromQuaternion(delta,'XYZ');
  socket.rotation=[euler.x,euler.y,euler.z].map(value=>Math.abs(value)<1e-5?0:Number(value.toFixed(5)));
  offset.copy(visual.position).sub(hand.position).applyQuaternion(visual.quaternion.clone().invert());socket.offset=[offset.x,offset.y,offset.z].map(value=>Math.abs(value)<1e-5?0:Number(value.toFixed(4)));
  socket.scale=Math.max(.05,Math.min(20,Number(visual.scale.x)||1));return true;
}
// Dragging a dummy is the authoring gesture, so this is where the contract is
// written. In an additive layer the stored value is the DIFFERENCE from the
// hold, which is what makes an untouched aim/fire layer read as zero.
function readGripFromDummy(state){
  const THREE=window.THREE,dummy=activeGripDummy(state);if(!THREE||!dummy)return null;
  const weapon=gripWeaponForState(state,true);if(!weapon)return null;
  const grip=stateWeaponGripConfig(state,true),hand=state.gripHand==='support'?'support':'trigger';
  const layer=GRIP_LAYERS.includes(state.gripLayer)?state.gripLayer:'hold';
  const clean=value=>Math.abs(value)<.0001?0:Number(value.toFixed(4));
  const context=gripContextSpec(state.gripContextKey),mirror=context&&context.side==='left'?-1:1,local=[clean(dummy.position.x*mirror),clean(dummy.position.y),clean(dummy.position.z)];
  if(layer==='hold'){
    const euler=new THREE.Euler().setFromQuaternion(dummy.quaternion,'XYZ');
    grip[hand].position=local;
    grip[hand].rotation=[euler.x,euler.y,euler.z].map(value=>clean(THREE.MathUtils.radToDeg(value)));
  } else {
    const base=grip[hand].position;
    grip[layer][hand]=authoredAdditive([0,1,2].map(index=>clean(local[index]-base[index])));
  }
  // A contextual object already lives below weapon.grip.profiles[key]. Replacing
  // weapon.grip with it here would erase the base and every sibling state after
  // the first dummy drag.
  if(!gripContextSpec(state.gripContextKey))weapon.grip=grip;return grip;
}
function gripPoseTargets(state){
  const THREE=window.THREE;if(!THREE||!state||!state.gripGroup)return null;
  state.gripGroup.updateMatrixWorld(true);
  const weapon=gripWeaponForState(state,false),grip=stateWeaponGripConfig(state,false),trigger=state.gripTriggerDummy,support=state.gripSupportDummy;
  const context=gripContextSpec(state.gripContextKey);
  return {
    triggerTarget:trigger?trigger.getWorldPosition(new THREE.Vector3()):null,
    supportTarget:gripSupportActive(state.definition,grip,weapon)&&support?support.getWorldPosition(new THREE.Vector3()):null,
    grip,
    triggerFingers:normalizedGripFingers(grip.fingers).trigger,
    supportFingers:normalizedGripFingers(grip.fingers).support,
    side:context&&context.side==='left'?-1:1,
  };
}
// The dummies are only worth dragging if the arms actually reach them, so the
// preview runs the SAME layer the game runs (character-weapon-pose) instead of
// an editor-only approximation.
function applyGripPose(state){
  const runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE,THREE=window.THREE;
  if(!THREE||!state||!state.model||!runtime||typeof runtime.apply!=='function'||typeof runtime.classifyBones!=='function')return false;
  const targets=gripPoseTargets(state);if(!targets||!targets.triggerTarget)return false;
  const grip=targets.grip,radians=value=>(Array.isArray(value)?value:[0,0,0]).map(angle=>THREE.MathUtils.degToRad(Number(angle)||0));
  const applied=state.previewGripPose||(state.previewGripPose=new Map()),bones=runtime.classifyBones(state.model);
  ['left','right'].forEach(side=>['upper','lower','hand'].forEach(part=>{
    const bone=bones&&bones[side]&&bones[side][part];
    if(bone&&bone.quaternion&&!applied.has(bone))applied.set(bone,bone.quaternion.clone());
  }));
  ['left','right'].forEach(side=>{const fingers=bones&&bones[side]&&bones[side].fingers||{};GRIP_FINGERS.forEach(name=>(fingers[name]||[]).forEach(bone=>{if(bone&&bone.quaternion&&!applied.has(bone))applied.set(bone,bone.quaternion.clone());}));});
  if(!applied.size)return false;
  return runtime.apply(THREE,state.model,{side:targets.side,triggerTarget:targets.triggerTarget,supportTarget:targets.supportTarget,
    triggerRotation:radians(grip.trigger.rotation),supportRotation:radians(grip.support.rotation),triggerFingers:targets.triggerFingers,supportFingers:targets.supportFingers},1)===true;
}
// The layer bends the arm chains in place. Without restoring the snapshot the
// bend would survive leaving the mode on a paused preview, and would stack
// frame after frame while the preview plays.
function restoreGripPose(state){
  if(!state||!state.previewGripPose||!state.previewGripPose.size)return false;
  state.previewGripPose.forEach((quaternion,bone)=>{if(bone&&bone.quaternion)bone.quaternion.copy(quaternion);});
  state.previewGripPose.clear();
  if(state.model&&state.model.updateMatrixWorld)state.model.updateMatrixWorld(true);
  return true;
}
// Same disposal discipline as clearRigEditor: detach the gizmo, drop the group
// from its parent and dispose every geometry and material it owns. This editor
// leaked GPU memory before, and dummies are rebuilt on every motion change.
function clearGripDummies(state){
  if(!state)return false;
  restoreGripPose(state);state.previewGripPose=null;
  const transform=state.transformControls,attached=transform&&transform.object;
  if(transform&&attached&&(attached===state.gripTriggerDummy||attached===state.gripSupportDummy||attached===state.gripWeaponPreview))transform.detach();
  clearGripWeaponPreview(state);
  if(state.gripGroup){
    state.gripGroup.traverse(node=>{
      if(node.geometry&&node.geometry.dispose)node.geometry.dispose();
      const materials=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];
      materials.forEach(material=>{if(material&&material.dispose)material.dispose();});
    });
    if(state.gripGroup.parent)state.gripGroup.parent.remove(state.gripGroup);
  }
  state.gripGroup=null;state.gripEyeMarker=null;state.gripTriggerDummy=null;state.gripSupportDummy=null;state.gripTriggerLine=null;state.gripSupportLine=null;
  return true;
}

function characterContainers(context){
  const graph=context.graph,definition=graph.characterPawn||graph.soccerPawn;
  definition.movement=definition.movement||{};
  definition.abilities=definition.abilities&&typeof definition.abilities==='object'?definition.abilities:{};
  definition.abilities.wallFlip=Object.assign({enabled:true,minSpeed:4.2,minHeight:1.35,reach:.72,duration:.72,playbackRate:1.15,lift:.72,pushback:.62,settleDuration:.55,settleSpeedScale:.42},definition.abilities.wallFlip||{});
  if(definition.movement.facingMode==null)definition.movement.facingMode=graph.soccerPawn?'heading':'movement';
  if(definition.movement.inputMode==null)definition.movement.inputMode=graph.soccerPawn?'heading':'camera';
  if(!Array.isArray(definition.animationSet)){
    const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET;
    definition.animationSet=runtime?runtime.fromLegacy(definition.animations||{}):[];
  }
  // Play runs the Character definition through applyBody(), which hydrates old
  // action entries whose persisted asset was empty (or still pointed at an old
  // bundled take). Pawn Studio used the raw saved animationSet instead, so a
  // Wall Flip / Vault Box row could display and preview nothing while the exact
  // same Pawn played correctly in game. Use the same body catalogue here before
  // creating missing action rows. applyBodyToAnimationSet deliberately preserves
  // every non-bundled asset an author imported, so preview parity cannot overwrite
  // a custom slot.
  const bodies=window.LK_RUNTIME_CHARACTER_BODIES;
  if(bodies&&typeof bodies.applyBodyToAnimationSet==='function'){
    definition.animationSet=bodies.applyBodyToAnimationSet(definition.animationSet,definition.bodyType);
  }
  ensurePawnStudioActionSlots(definition);
  const motionChildren=definition.animationSet.map((entry,index)=>({id:'motion:'+index,label:entry.name||entry.clip||('Motion '+(index+1)),icon:entry.state==='action'?'⚡':'▶',badge:entry.state==='action'?(entry.action||'action'):(entry.state||'grounded'),kind:'motion',index}));
  return [
    {id:'overview',label:'Pawn Overview',icon:'◇',kind:'overview'},
    {id:'model',label:'Main Mesh',icon:'◆',badge:definition.model?'GLB':'missing',kind:'model'},
    {id:'skeleton',label:'Skeleton & Rig',icon:'⌘',kind:'skeleton'},
    {id:'collision',label:'Collision Capsule',icon:'⬡',kind:'fields',fields:[
      {label:'Radius',path:'movement.radius',type:'number',min:.1,max:2,step:.05},
      {label:'Step Height',path:'movement.stepHeight',type:'number',min:0,max:3,step:.02},
      {label:'Jump Height',path:'movement.jumpHeight',type:'number',min:0,max:5,step:.05},
      {label:'Gravity',path:'movement.gravity',type:'number',min:1,max:80,step:.5},
    ]},
    {id:'movement',label:'Movement Model',icon:'↗',kind:'fields',fields:[
      {label:'Walk Speed',path:'movement.walkSpeed',type:'number',min:.2,max:8,step:.1},
      {label:'Run Movement Speed (m/s)',path:'movement.runSpeed',type:'number',min:.5,max:14,step:.1},
      {label:'Extra Sprint Multiplier',path:'movement.sprintMultiplier',type:'number',min:1,max:2.5,step:.05},
      {label:'Acceleration',path:'movement.acceleration',type:'number',min:1,max:80,step:.5},
      {label:'Turn Rate',path:'movement.turnRate',type:'number',min:.5,max:40,step:.5},
      {label:'Air Control',path:'movement.airControl',type:'number',min:0,max:1,step:.05},
      {label:'Stair Pose Strength',path:'locomotion.stepPoseStrength',type:'number',min:0,max:2,step:.05},
      {label:'Movement Space',path:'movement.inputMode',type:'select',options:['camera','heading']},
      {label:'Facing Behaviour',path:'movement.facingMode',type:'select',options:['movement','heading']},
    ]},
    {id:'motion-set',label:'Motion Animation Set',icon:'⧉',badge:String(motionChildren.length),kind:'motion-set',children:motionChildren},
    {id:'vault-rules',label:'Vault Animation Rules',icon:'↥',badge:String(definition.abilities&&definition.abilities.vault&&definition.abilities.vault.variants&&definition.abilities.vault.variants.length||0),kind:'vault-rules'},
    {id:'wall-flip',label:'Wall Flip · Motion & Rebound',icon:'↶',kind:'wall-flip'},
    // The badge is the answer to the question that starts this workflow: is the
    // weapon held with one hand or two?
    {id:'weapon-grip',label:'Weapon Grip & Hands',icon:'✊',badge:weaponGripConfig(definition,false).hands,kind:'weapon-grip'},
    {id:'vehicle-seating',label:'Vehicle Seating & Full Body IK',icon:'♿',badge:Object.keys(seatingSettings(definition).profiles).length,kind:'vehicle-seating'},
    {id:'camera',label:'First / Third Person Cameras',icon:'◉',kind:'camera-rig'},
    {id:'appearance',label:'Appearance',icon:'◈',kind:'fields',fields:[
      {label:'Top Color',path:'appearance.shirtColor',type:'color'},
      {label:'Pants Color',path:'appearance.shortsColor',type:'color'},
      {label:'Hair Color',path:'appearance.hairColor',type:'color'},
      {label:'Skin Color',path:'appearance.skinColor',type:'color'},
    ]},
  ];
}

function vehicleContainers(context){
  const definition=context.graph.vehiclePawn||context.graph.playerPawnBlueprint;
  const wheels=Array.isArray(definition.wheels)?definition.wheels:[];
  return [
    {id:'overview',label:'Pawn Overview',icon:'◇',kind:'overview'},
    {id:'model',label:'Main Vehicle Mesh',icon:'◆',badge:sceneModel(context.graph,'vehicle_model')?'GLB':'missing',kind:'model'},
    {id:'driving',label:'Driving Model',icon:'↗',kind:'fields',fields:[
      {label:'Top Speed',path:'tuning.maxSpeed',type:'number',min:1,max:120,step:.5},{label:'Acceleration',path:'tuning.acceleration',type:'number',min:1,max:80,step:.5},{label:'Brake Force',path:'tuning.brake',type:'number',min:1,max:100,step:.5},{label:'Steering',path:'tuning.steer',type:'number',min:.1,max:6,step:.05},{label:'Grip',path:'tuning.grip',type:'number',min:.1,max:1,step:.01},{label:'Drag',path:'tuning.drag',type:'number',min:0,max:10,step:.05},
    ]},
    {id:'collision',label:'Body & Collision',icon:'⬡',kind:'fields',fields:[
      {label:'Mass (kg)',path:'collision.mass',type:'number',min:100,max:5000,step:10},{label:'Half Width',path:'collision.hx',type:'number',min:.1,max:5,step:.05},{label:'Half Height',path:'collision.hy',type:'number',min:.1,max:5,step:.05},{label:'Half Length',path:'collision.hz',type:'number',min:.1,max:10,step:.05},
    ]},
    {id:'suspension',label:'Suspension',icon:'≋',kind:'fields',fields:[
      {label:'Stiffness',path:'suspension.stiffness',type:'number',min:1,max:100,step:.5},{label:'Rest Length',path:'suspension.restLength',type:'number',min:.05,max:1.5,step:.01},{label:'Travel',path:'suspension.travel',type:'number',min:.02,max:1,step:.01},{label:'Wheel Radius',path:'suspension.radius',type:'number',min:.05,max:1.5,step:.01},{label:'Compression',path:'suspension.compression',type:'number',min:.1,max:20,step:.1},{label:'Relaxation',path:'suspension.relaxation',type:'number',min:.1,max:20,step:.1},
    ]},
    {id:'wheels',label:'Wheels',icon:'⊙',badge:String(wheels.length),kind:'group',children:wheels.map((wheel,index)=>({id:'wheel:'+index,label:wheel.visualId||('Wheel '+(index+1)),icon:'○',badge:wheel.front?'front':'rear',kind:'object',path:'wheels.'+index}))},
    {id:'lights',label:'Lights',icon:'✦',kind:'object',path:'lights'},
    {id:'effects',label:'Effects',icon:'✺',kind:'object',path:'effects'},
    {id:'audio',label:'Engine Audio',icon:'♪',kind:'object',path:'engineAudio'},
    {id:'camera',label:'Camera',icon:'◉',kind:'object',path:'camera'},
  ];
}

registerType({id:'character',label:'Character Pawn',match:graph=>!!graph.characterPawn,definition:graph=>graph.characterPawn,model:graph=>(graph.characterPawn&&graph.characterPawn.model)||(sceneModel(graph,'character_model')||{}).asset,containers:characterContainers});
registerType({id:'soccer',label:'Soccer Pawn',match:graph=>!!graph.soccerPawn,definition:graph=>graph.soccerPawn,model:graph=>(graph.soccerPawn&&graph.soccerPawn.model)||(sceneModel(graph,'character_model')||{}).asset,containers:characterContainers});
registerType({id:'vehicle',label:'Vehicle Pawn',match:graph=>!!graph.vehiclePawn||!!graph.playerPawnBlueprint,definition:graph=>graph.vehiclePawn||graph.playerPawnBlueprint,model:graph=>(graph.vehiclePawn&&graph.vehiclePawn.modelAsset)||(sceneModel(graph,'vehicle_model')||sceneModel(graph)||{}).asset,containers:vehicleContainers});

function create(deps){
  deps=deps||{};const STORE=deps.STORE,status=deps.status||function(){},assetLibraryLoad=deps.assetLibraryLoad||(()=>[]),importAssetFiles=deps.importAssetFiles||(()=>Promise.resolve([])),onSave=deps.onSave||function(){},pluginManager=deps.pluginManager||null,tr=(en,it)=>deps.GAME&&deps.GAME.i18n&&deps.GAME.i18n.lang==='it'?(it||en):en;
  let active=null;
  function syncPluginAdapters(){if(!pluginManager||!pluginManager.extensions)return;(pluginManager.extensions('pawnStudioType')||[]).forEach(extension=>{const id=String(extension.id||'');if(!id)return;registerType(Object.assign({},extension,{id:'plugin:'+extension.pluginId+':'+id,match:graph=>pluginManager.isEnabled(extension.pluginId)&&extension.match(graph)}));});}
  function studioContainers(state){
    const base=state.adapter.containers(state.context)||[];
    if(!pluginManager||!pluginManager.extensions)return base;
    const extra=[];
    (pluginManager.extensions('pawnStudioAugment')||[]).forEach(extension=>{
      try {
        if(typeof extension.match==='function'&&!extension.match(state.graph))return;
        const containers=typeof extension.containers==='function'?extension.containers(state.context):(extension.containers||[]);
        extra.push.apply(extra,containers||[]);
      } catch(error){console.warn('Pawn Studio augment failed:',extension.id,error);}
    });
    return base.concat(extra);
  }
  function close(){if(!active)return;commitStudioAuthoring(active);if(active.keyHandler)removeEventListener('keydown',active.keyHandler);if(active.gripPointerHandler&&active.renderer&&active.renderer.domElement)active.renderer.domElement.removeEventListener('pointerdown',active.gripPointerHandler,true);if(active.raf)cancelAnimationFrame(active.raf);if(active.previewInterval)clearInterval(active.previewInterval);if(active.timer&&active.timer.dispose)active.timer.dispose();if(active.resizeObserver)active.resizeObserver.disconnect();if(active.controls&&active.controls.dispose)active.controls.dispose();clearRigEditor(active);clearCurveEditor(active);clearGripDummies(active);clearCameraEditor(active);if(active.transformControls){active.transformControls.detach();if(active.transformControls.dispose)active.transformControls.dispose();}if(active.transformHelper&&active.transformHelper.parent)active.transformHelper.parent.remove(active.transformHelper);clearPreviewModel(active);if(active.renderer)active.renderer.dispose();if(active.overlay)active.overlay.remove();active=null;}
  function open(object,inputGraph){
    close();syncPluginAdapters();const graph=inputGraph||object&&object.userData&&object.userData.logicGraph;if(!graph)return false;const adapter=resolveType(graph);if(!adapter){status(tr('No Pawn Studio adapter is registered for this Logic Element.','Nessun adapter Pawn Studio registrato per questo Logic Element.'));return false;}
    const definition=adapter.definition?adapter.definition(graph):pawnDefinition(graph),context={object,graph,definition,adapter};
    const overlay=document.createElement('div');overlay.className='lk-logic-modal lk-pawn-studio-modal';
    const panel=document.createElement('div');panel.className='lk-logic-modal-panel lk-pawn-studio-panel';
    const head=document.createElement('div');head.className='lk-logic-modal-head';const title=document.createElement('b');title.textContent=(object&&object.userData&&object.userData.editorName||adapter.label)+' · Pawn Studio';
    const saveState=document.createElement('span');saveState.className='lk-ps-save-state';saveState.textContent=tr('Ready','Pronto');const closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='×';closeButton.addEventListener('click',close);head.append(title,saveState,closeButton);
    const body=document.createElement('div');body.className='lk-pawn-studio';body.innerHTML='<aside class="lk-ps-tree"><div class="lk-ps-pane-title">Pawn Containers</div><div class="lk-ps-tree-list"></div></aside><main class="lk-ps-preview"><div class="lk-ps-preview-mount"></div><div class="lk-ps-preview-toolbar"><button type="button" data-action="undo" title="Undo (Ctrl+Z)">↶ Undo</button><button type="button" data-action="redo" title="Redo (Ctrl+Y / Ctrl+Shift+Z)">↷ Redo</button><button type="button" data-action="frame">Frame</button><span class="lk-ps-tool-group"><button type="button" data-transform="translate" title="Move (W)">Move</button><button type="button" data-transform="rotate" title="Rotate (E)">Rotate</button><button type="button" data-transform="scale" title="Scale (R)">Scale</button></span><button type="button" data-action="rig" title="Edit the selected animation pose on its skeleton">✣ Edit Rig</button><label class="lk-ps-rig-bone" hidden>Bone <select data-action="rig-bone"></select></label><button type="button" data-action="rig-reset" hidden>Reset Bone</button><button type="button" data-action="grip" title="Place the trigger and support hands on the weapon with draggable dummies">✊ Hands</button><button type="button" data-action="grip-weapon" hidden title="Move, rotate or scale the weapon socket directly">🔫 Weapon</button><label class="lk-ps-rig-bone lk-ps-grip-hand" hidden>Hand <select data-action="grip-hand"></select></label><label class="lk-ps-rig-bone lk-ps-grip-layer" hidden>Layer <select data-action="grip-layer"></select></label><button type="button" data-action="grip-reset" hidden>Reset Grip</button><button type="button" data-action="play">▶ Preview</button><button type="button" data-action="stop">■ Stop</button><label class="lk-ps-preview-speed">Speed <select data-action="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label></div><div class="lk-ps-timeline" hidden><label class="lk-ps-auto-key"><input type="checkbox" data-action="timeline-auto"><b>● Auto Key</b></label><span class="lk-ps-timeline-track"><input type="range" min="0" max="1" step="0.001" value="0" data-action="timeline-range"><span data-action="timeline-keys"></span></span><output data-action="timeline-time">0.000</output><label class="lk-ps-key-time" hidden>Key s <input type="number" min="0" step="0.001" data-action="timeline-key-time"></label><button type="button" data-action="timeline-root">＋ Root Key</button><button type="button" data-action="timeline-bone">＋ Bone Key</button><button type="button" data-action="timeline-delete">Delete Key</button><button type="button" class="danger" data-action="timeline-reset">Reset all keys</button><small data-action="timeline-count">0 keys</small></div><div class="lk-ps-preview-status"></div></main><aside class="lk-ps-properties"><div class="lk-ps-pane-title">Properties</div><div class="lk-ps-properties-body"></div></aside>';
    panel.append(head,body);overlay.appendChild(panel);document.body.appendChild(overlay);
    active={overlay,panel,graph,definition,adapter,object,context,selected:null,model:null,mixer:null,raf:0};
    setupPreview(active,body.querySelector('.lk-ps-preview-mount'),body.querySelector('.lk-ps-preview-status'));
    const updateHistoryButtons=()=>{if(!active||!active.history)return;active.undoButton.disabled=!active.history.canUndo();active.redoButton.disabled=!active.history.canRedo();};
    const persist=options=>{saveState.textContent=tr('Saving into project…','Salvataggio nel progetto…');saveState.dataset.state='saving';if(window.LK_LOGIC_GRAPH&&window.LK_LOGIC_GRAPH.syncPawnCameraElementsFromConfig)window.LK_LOGIC_GRAPH.syncPawnCameraElementsFromConfig(graph);const saved=onSave(object,graph),parity=worldAlignmentMatches(object,graph),context=authoringSaveContext(active),time=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});if(saved===false){saveState.textContent=tr('Save failed','Salvataggio fallito');saveState.title=saveState.textContent;saveState.dataset.state='error';}else if(parity===false){saveState.textContent='✓ '+tr('Saved in project · world sync pending','Salvato nel progetto · sincronizzazione mondo in attesa')+(context?' · '+context:'')+' · '+time;saveState.title=tr('Saved · world sync pending','Salvato · sincronizzazione mondo in attesa');saveState.dataset.state='pending';}else{saveState.textContent='✓ '+tr('Saved in project','Salvato nel progetto')+(context?' · '+context:'')+' · '+time;saveState.title=tr('Saved · editor synced','Salvato · editor sincronizzato');saveState.dataset.state='saved';if(active.history&&(!options||options.history!==false))active.history.push(definition);}renderTree();updateHistoryButtons();return saved;};
    active.persist=persist;active.saveState=saveState;active.properties=body.querySelector('.lk-ps-properties-body');active.tree=body.querySelector('.lk-ps-tree-list');active.previewStatus=body.querySelector('.lk-ps-preview-status');
    // Dragging a dummy changes numbers the panel is showing, so the panel has to
    // be able to redraw itself from outside the render pass that built it.
    active.refreshProperties=()=>{if(active&&active.selected)renderProperties(active,active.selected,persist,assetLibraryLoad,importAssetFiles,tr);};
    function renderTree(){
      active.tree.innerHTML='';active.containers=studioContainers(active);
      const append=(container,depth)=>{const row=document.createElement('button');row.type='button';row.className='lk-ps-tree-item';row.style.paddingLeft=(10+depth*17)+'px';row.dataset.id=container.id;const icon=document.createElement('span');icon.className='lk-ps-tree-icon';icon.textContent=container.icon||'◇';const label=document.createElement('b');label.textContent=container.label||container.id;row.append(icon,label);if(container.badge!=null){const badge=document.createElement('small');badge.textContent=container.badge;row.appendChild(badge);}row.classList.toggle('on',!!(active.selected&&active.selected.id===container.id));row.addEventListener('click',()=>select(container));active.tree.appendChild(row);(container.children||[]).forEach(child=>append(child,depth+1));};active.containers.forEach(container=>append(container,0));
    }
    // Weapon Grip keeps whichever motion is on screen: the point of the
    // container is to place the hands ON the holding animation the author was
    // just previewing, not to reset the preview to the bind pose.
    function select(container){active.selected=container;const keepsMotion=container.kind==='motion'||container.kind==='weapon-grip';if((container.kind==='motion'||container.kind==='vehicle-seating'||container.kind==='camera-rig')&&active.transformMode==='scale'){active.transformMode='translate';(active.transformButtons||[]).forEach(button=>button.classList.toggle('on',button.dataset.transform==='translate'));}if(!keepsMotion)active.currentMotion=null;if(container.kind!=='motion'&&active.rigEditMode)setRigEditMode(active,false);if(!keepsMotion&&active.gripMode)setGripMode(active,false);if(container.kind!=='camera-rig')clearCameraEditor(active);renderTree();renderProperties(active,container,persist,assetLibraryLoad,importAssetFiles,tr);updateRigButton(active);updateGripButton(active);updateTimelineUi(active);if(container.kind==='motion')previewMotion(active,definition.animationSet[container.index]).then(()=>{updateTimelineUi(active);if(active&&active.rigEditMode)buildRigEditor(active,definition.animationSet[container.index]);if(active&&active.gripMode)buildGripEditor(active);});else if(container.kind==='weapon-grip'){if(active.currentMotion){if(active.gripMode)buildGripEditor(active);}else Promise.resolve(previewMainModel(active)).then(()=>{if(active&&active.gripMode)buildGripEditor(active);});}else if(container.kind==='vehicle-seating')previewVehicleSeating(active);else if(container.kind==='camera-rig')Promise.resolve(previewMainModel(active)).then(()=>{if(active&&active.selected&&active.selected.kind==='camera-rig')buildCameraEditor(active);});else if(container.kind==='model'||container.kind==='overview'||container.kind==='skeleton')previewMainModel(active);}
    active.selectContainer=select;
    function findContainer(id){let found=null;const visit=list=>(list||[]).some(item=>{if(item.id===id){found=item;return true;}return visit(item.children);});visit(active.containers);return found;}
    function restoreHistory(direction){commitStudioAuthoring(active);const snapshot=active.history&&active.history[direction]();if(!snapshot)return false;const selectedId=active.selected&&active.selected.id;restoreObject(definition,snapshot);onSave(object,graph);renderTree();select(findContainer(selectedId)||active.containers[0]);saveState.textContent='✓ '+tr(direction==='undo'?'Undo saved in project':'Redo saved in project',direction==='undo'?'Annullamento salvato nel progetto':'Ripristino salvato nel progetto');saveState.dataset.state='saved';updateHistoryButtons();return true;}
    active.playButton=body.querySelector('[data-action="play"]');active.stopButton=body.querySelector('[data-action="stop"]');active.speedInput=body.querySelector('[data-action="speed"]');
    body.querySelector('[data-action="frame"]').addEventListener('click',()=>framePreview(active));active.playButton.addEventListener('click',()=>{const entry=active.selected&&active.selected.kind==='motion'?definition.animationSet[active.selected.index]:active.currentMotion||definition.animationSet&&definition.animationSet[0];if(entry)startMotionPreview(active,entry);else if(active.previewStatus)active.previewStatus.textContent=tr('No animation slot is configured. Add or select one first.','Nessuno slot animazione configurato. Aggiungine o selezionane uno.');});active.stopButton.addEventListener('click',()=>stopMotionPreview(active));
    active.speedInput.addEventListener('change',()=>applyPreviewRate(active));
    active.timeline=body.querySelector('.lk-ps-timeline');active.timelineRange=body.querySelector('[data-action="timeline-range"]');active.timelineTime=body.querySelector('[data-action="timeline-time"]');active.timelineKeys=body.querySelector('[data-action="timeline-keys"]');active.timelineKeyTime=body.querySelector('[data-action="timeline-key-time"]');active.timelineKeyTimeLabel=active.timelineKeyTime.parentElement;active.timelineCount=body.querySelector('[data-action="timeline-count"]');active.timelineAuto=body.querySelector('[data-action="timeline-auto"]');active.timelineAutoLabel=active.timelineAuto.closest('.lk-ps-auto-key');active.timelineAuto.addEventListener('change',()=>{active.timelineAutoKey=active.timelineAuto.checked;if(active.timelineAutoLabel)active.timelineAutoLabel.classList.toggle('on',active.timelineAutoKey);if(active.previewStatus)active.previewStatus.textContent=active.timelineAutoKey?tr('Auto Key armed · gizmo edits create keys at the current playhead','Auto Key attivo · le modifiche col gizmo creano chiavi alla posizione corrente'):tr('Auto Key off · edits affect the whole animation slot','Auto Key disattivato · le modifiche agiscono su tutto lo slot');});active.timelineRange.addEventListener('input',()=>scrubTimeline(active,active.timelineRange.value));active.timelineKeyTime.addEventListener('change',()=>moveSelectedTimelineKey(active,active.timelineKeyTime.value));body.querySelector('[data-action="timeline-root"]').addEventListener('click',()=>addTimelineRootKey(active));body.querySelector('[data-action="timeline-bone"]').addEventListener('click',()=>addTimelineBoneKey(active));body.querySelector('[data-action="timeline-delete"]').addEventListener('click',()=>deleteTimelineKey(active));body.querySelector('[data-action="timeline-reset"]').addEventListener('click',()=>resetTimelineKeys(active));
    active.rigButton=body.querySelector('[data-action="rig"]');active.rigBoneSelect=body.querySelector('[data-action="rig-bone"]');active.rigBoneLabel=active.rigBoneSelect.parentElement;active.rigResetButton=body.querySelector('[data-action="rig-reset"]');active.rigButton.addEventListener('click',()=>setRigEditMode(active,!active.rigEditMode));active.rigBoneSelect.addEventListener('change',()=>selectRigBone(active,active.rigBoneSelect.value));active.rigResetButton.addEventListener('click',()=>resetRigBone(active));
    active.gripButton=body.querySelector('[data-action="grip"]');active.gripHandSelect=body.querySelector('[data-action="grip-hand"]');active.gripHandLabel=active.gripHandSelect.parentElement;active.gripLayerSelect=body.querySelector('[data-action="grip-layer"]');active.gripLayerLabel=active.gripLayerSelect.parentElement;active.gripResetButton=body.querySelector('[data-action="grip-reset"]');
    active.gripWeaponButton=body.querySelector('[data-action="grip-weapon"]');
    active.gripButton.addEventListener('click',()=>{setGripMode(active,!active.gripMode);active.refreshProperties();});
    active.gripHandSelect.addEventListener('change',()=>selectGripHand(active,active.gripHandSelect.value));
    active.gripLayerSelect.addEventListener('change',()=>selectGripLayer(active,active.gripLayerSelect.value));
    active.gripResetButton.addEventListener('click',()=>resetGripToPreset(active));
    active.gripWeaponButton.addEventListener('click',()=>{active.gripWeaponEditMode=!active.gripWeaponEditMode;refreshStudioTransformTarget(active);updateGripButton(active);if(active.previewStatus)active.previewStatus.textContent=active.gripWeaponEditMode?tr('Weapon socket selected: Move, Rotate and Scale edit the weapon directly.','Socket arma selezionato: Muovi, Ruota e Scala modificano direttamente l’arma.'):gripStatusText(active);});
    active.undoButton=body.querySelector('[data-action="undo"]');active.redoButton=body.querySelector('[data-action="redo"]');active.undoButton.addEventListener('click',()=>restoreHistory('undo'));active.redoButton.addEventListener('click',()=>restoreHistory('redo'));
    active.transformButtons=Array.from(body.querySelectorAll('[data-transform]'));active.transformButtons.forEach(button=>button.addEventListener('click',()=>setStudioTransformMode(active,button.dataset.transform)));setStudioTransformMode(active,'translate');active.keyHandler=event=>{if(!active)return;const key=String(event.key||'').toLowerCase();if((event.ctrlKey||event.metaKey)&&key==='z'){event.preventDefault();restoreHistory(event.shiftKey?'redo':'undo');return;}if((event.ctrlKey||event.metaKey)&&key==='y'){event.preventDefault();restoreHistory('redo');return;}if(/input|select|textarea/i.test(String(event.target&&event.target.tagName||'')))return;const mode={w:'translate',e:'rotate',r:'scale'}[key];if(mode){event.preventDefault();setStudioTransformMode(active,mode);}};addEventListener('keydown',active.keyHandler);
    renderTree();active.history=createAuthoringHistory(definition);updateHistoryButtons();select(active.containers[0]);return true;
  }

  function setupPreview(state,mount,statusEl){
    const THREE=window.THREE;if(!THREE){statusEl.textContent='Three.js unavailable';return;}
    const backend=window.LK_RUNTIME_RENDERING_BACKEND,renderer=backend?backend.createWebGL({antialias:true,alpha:false},'pawn-studio'):new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.setClearColor(0x080d14,1);mount.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.01,1000);camera.position.set(3,2.3,4.8);scene.add(new THREE.HemisphereLight(0xdbeafe,0x182033,2.2));const key=new THREE.DirectionalLight(0xffffff,2.6);key.position.set(4,7,5);scene.add(key);scene.add(new THREE.GridHelper(20,20,0x334155,0x1e293b));
    const controls=THREE.OrbitControls?new THREE.OrbitControls(camera,renderer.domElement):null;if(controls){controls.enableDamping=true;controls.target.set(0,1,0);}
    const resize=()=>{const rect=mount.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(mount);resize();
    const timer=new THREE.Timer();if(timer.connect&&typeof document!=='undefined')timer.connect(document);
    state.renderer=renderer;state.scene=scene;state.camera=camera;state.controls=controls;state.resizeObserver=observer;state.timer=timer;state.previewStatus=statusEl;state.previewPlaying=true;state.transformMode='translate';state.activePreviewScale=1;
    // Capture runs before TransformControls' normal pointer listener. Selecting
    // the blue/gold sphere therefore reattaches the gizmo in time for the same
    // pointer gesture, while clicks outside the dummies remain orbit controls.
    state.gripPointerHandler=event=>{if(state.gizmoDragging||Number(event.button)!==0)return;if(state.gripMode){const hand=gripHandFromPointer(state,event);if(hand)selectGripHand(state,hand);return;}if(state.seatingMode){const target=seatingTargetFromPointer(state,event);if(target)selectSeatingTarget(state,target);return;}if(state.cameraEditMode){const target=cameraTargetFromPointer(state,event);if(target)selectCameraTarget(state,target);}};
    renderer.domElement.addEventListener('pointerdown',state.gripPointerHandler,true);
    if(THREE.TransformControls){
      const transform=new THREE.TransformControls(camera,renderer.domElement),helper=transform.getHelper?transform.getHelper():transform;state.transformControls=transform;state.transformHelper=helper;scene.add(helper);transform.setMode('translate');transform.setSpace('world');
      transform.addEventListener('dragging-changed',event=>{state.gizmoDragging=!!event.value;if(controls)controls.enabled=!event.value;if(!event.value&&state.rigEditMode&&transform.object&&transform.object.isBone)syncRigCorrectionFromBone(state);else if(!event.value&&state.gripMode&&transform.object===activeGripDummy(state)){syncGripFromDummy(state);if(state.refreshProperties)state.refreshProperties();}else if(!event.value&&state.gripMode&&transform.object===state.gripWeaponPreview){syncWeaponSocketFromPreview(state);if(state.refreshProperties)state.refreshProperties();}else if(!event.value&&state.seatingMode&&isSeatingTransformObject(state,transform.object)){syncSeatingFromTransform(state);if(state.refreshProperties)state.refreshProperties();}else if(!event.value&&state.cameraEditMode&&isCameraTransformObject(state,transform.object)){syncCameraFromDummy(state);if(state.refreshProperties)state.refreshProperties();}else if(!event.value&&transform.object===state.model){if(state.currentMotion&&state.previewRootLock)syncMotionTransformFromModel(state);else lockPreviewRoot(state,state.model);}});
      transform.addEventListener('objectChange',()=>{if(state.rigEditMode&&transform.object&&transform.object.isBone)syncRigCorrectionFromBone(state);else if(state.gripMode&&transform.object===activeGripDummy(state))syncGripFromDummy(state);else if(state.gripMode&&transform.object===state.gripWeaponPreview)syncWeaponSocketFromPreview(state);else if(state.seatingMode&&isSeatingTransformObject(state,transform.object))syncSeatingFromTransform(state);else if(state.cameraEditMode&&isCameraTransformObject(state,transform.object))syncCameraFromDummy(state);else if(state.curveMode&&transform.object===state.curveHandle)syncCurveFromHandle(state);else syncAlignmentFromTransform(state);scheduleStudioAuthoringCommit(state);});
      transform.addEventListener('mouseUp',()=>commitStudioAuthoring(state));
    }
    renderer.domElement.dataset.pawnPreviewTicks='0';
    const advance=()=>{if(active!==state)return;renderer.domElement.dataset.pawnPreviewTicks=String((Number(renderer.domElement.dataset.pawnPreviewTicks)||0)+1);state.timer.update();const dt=Math.min(.05,state.timer.getDelta()),editingRoot=state.gizmoDragging&&state.transformControls&&state.transformControls.object===state.model;if(state.gripMode)restoreGripPose(state);if(!((state.rigEditMode&&state.gizmoDragging)||editingRoot)){clearPreviewRigCorrections(state);if(state.previewPlaying!==false&&state.mixer)state.mixer.update(dt);applyPreviewRigLock(state);applyPreviewRigCorrections(state);}
    // After the mixer, and deliberately also while the gizmo is being dragged:
    // watching the arms travel to the dummy is the whole feedback loop.
    if(state.gripMode){syncGripFrame(state);applyGripPose(state);}if(state.seatingMode)applySeatingPreviewPose(state);if(state.previewPlaying!==false&&state.placeholderController&&state.placeholderMotion){const entry=state.placeholderMotion,dir=entry.direction||[0,0],airborne=entry.state==='jump'||entry.state==='fall';state.placeholderController.update({x:(Number(dir[0])||0)*(Number(entry.speed)||0),z:(Number(dir[1])||0)*(Number(entry.speed)||0),speed:Number(entry.speed)||0,grounded:!airborne,velocityY:entry.state==='jump'?2:(entry.state==='fall'?-2:0)},dt);}if(state.clothPreview)state.clothPreview.update(dt);updateTimelineUi(state);};
    state.previewInterval=setInterval(advance,1000/60);
    const loop=()=>{if(active!==state)return;state.raf=requestAnimationFrame(loop);if(controls)controls.update();renderer.render(scene,camera);};state.raf=requestAnimationFrame(loop);previewMainModel(state);
  }
  function authoringSaveContext(state){
    if(!state)return'';
    if(state.selected&&state.selected.kind==='weapon-grip')return tr('Weapon grip & socket','Impugnatura e socket arma');
    const motion=state.selected&&state.selected.kind==='motion'&&state.definition&&state.definition.animationSet&&state.definition.animationSet[state.selected.index];
    if(motion)return tr('Slot: ','Slot: ')+String(motion.name||motion.action||motion.clip||motion.id||'Animation');
    return state.selected&&state.selected.label?String(state.selected.label):'';
  }
  function scheduleStudioAuthoringCommit(state){if(!state)return;state.authoringDirty=true;if(state.saveState){state.saveState.textContent='● '+tr('Unsaved changes','Modifiche non salvate')+(authoringSaveContext(state)?' · '+authoringSaveContext(state):'');state.saveState.dataset.state='dirty';}if(state.authoringCommitTimer)clearTimeout(state.authoringCommitTimer);state.authoringCommitTimer=setTimeout(()=>commitStudioAuthoring(state),180);}
  function commitStudioAuthoring(state){if(!state)return false;if(state.authoringCommitTimer){clearTimeout(state.authoringCommitTimer);state.authoringCommitTimer=0;}if(!state.authoringDirty)return false;state.authoringDirty=false;if(state.persist)state.persist();return true;}
  function alignmentScaleWithoutPreview(state){const factor=Math.max(.0001,Number(state&&state.activePreviewScale)||1),scale=state&&state.model&&state.model.scale;return scale?[Math.max(.01,scale.x/factor),Math.max(.01,scale.y/factor),Math.max(.01,scale.z/factor)]:[1,1,1];}
  function syncAlignmentFromTransform(state){
    const model=state&&state.model;if(!model)return false;
    if(state.currentMotion&&state.previewRootLock)return syncMotionTransformFromModel(state);
    const element=characterModelElement(state&&state.graph);if(!element||!model.userData.lkPawnStudioAlignmentRoot)return false;
    element.position=[model.position.x,model.position.y,model.position.z];element.rotation=[window.THREE.MathUtils.radToDeg(model.rotation.x),window.THREE.MathUtils.radToDeg(model.rotation.y),window.THREE.MathUtils.radToDeg(model.rotation.z)];element.scale=alignmentScaleWithoutPreview(state);return true;
  }
  function refreshStudioTransformTarget(state){
    const transform=state&&state.transformControls;if(!transform)return;
    if(state.rigEditMode&&state.rigEditBone){transform.setMode('rotate');transform.setSpace('local');transform.attach(state.rigEditBone);return;}
    // A hand dummy takes Move and Rotate, but only the hold layer stores a
    // rotation, so an additive layer quietly degrades to Move instead of
    // letting the author author something that cannot be saved.
    if(state.gripMode&&state.gripWeaponEditMode&&state.gripWeaponPreview){transform.setMode(state.transformMode||'translate');transform.setSpace('local');transform.attach(state.gripWeaponPreview);return;}
    if(state.gripMode&&activeGripDummy(state)){const rotate=state.transformMode==='rotate'&&(state.gripLayer||'hold')==='hold';transform.setMode(rotate?'rotate':'translate');transform.setSpace(rotate?'local':'world');transform.attach(activeGripDummy(state));return;}
    if(state.curveMode&&state.curveHandle){transform.setMode('translate');transform.setSpace('world');transform.attach(state.curveHandle);return;}
    if(state.seatingMode){const target=activeSeatingTransformObject(state);if(target){const isRoot=target===state.seatingOccupantRoot||target===state.seatingMasterDummy,rotationField=!isRoot&&SEATING_ROTATION_FIELDS[state.seatingEditTarget],requested=state.transformMode||'translate',mode=requested==='scale'?'translate':(requested==='rotate'&&(isRoot||rotationField)?'rotate':'translate');transform.setMode(mode);transform.setSpace(mode==='rotate'?'local':'world');transform.attach(target);return;}}
    if(state.cameraEditMode){const entry=state.cameraDummies&&state.cameraDummies[state.cameraEditTarget||'third'];if(entry&&entry.camera){transform.setMode('translate');transform.setSpace('world');transform.attach(entry.camera);return;}}
    if(state.model&&((state.currentMotion&&state.previewRootLock)||(state.model.userData&&state.model.userData.lkPawnStudioAlignmentRoot))){transform.setMode(state.transformMode||'translate');transform.setSpace(state.transformMode==='translate'?'world':'local');transform.attach(state.model);}else transform.detach();
  }
  function setStudioTransformMode(state,mode){
    if(!['translate','rotate','scale'].includes(mode))return;
    // Scaling a hand dummy means nothing: the grip is a point and an angle.
    if(mode==='scale'&&state.gripMode&&!state.gripWeaponEditMode){if(state.previewStatus)state.previewStatus.textContent=tr('Hand dummies are Move and Rotate only. Select Weapon to edit its scale.','I dummy delle mani accettano solo Muovi e Ruota. Seleziona Arma per modificarne la scala.');return;}
    if(mode==='scale'&&state.selected&&state.selected.kind==='motion'){if(state.previewStatus)state.previewStatus.textContent='Animation slots inherit Main Mesh scale. Use Move or Rotate for an isolated slot correction.';return;}if(mode==='scale'&&state.seatingMode){if(state.previewStatus)state.previewStatus.textContent=tr('Seat profiles use real metres; scale remains owned by Main Mesh.','I profili seduta usano metri reali; la scala resta della Mesh principale.');return;}if(state.cameraEditMode&&mode!=='translate'){if(state.previewStatus)state.previewStatus.textContent=tr('Character cameras use Move for position; look rotation remains controlled by the player.','Le camere Character usano Muovi per la posizione; la rotazione dello sguardo resta controllata dal giocatore.');return;}commitStudioAuthoring(state);state.transformMode=mode;if(state.rigEditMode)setRigEditMode(state,false);if(state.curveMode)setCurveMode(state,false);refreshStudioTransformTarget(state);(state.transformButtons||[]).forEach(button=>button.classList.toggle('on',button.dataset.transform===mode));
  }
  function rigBoneKey(name){const runtime=window.LK_RUNTIME_CHARACTER_LOCOMOTION||window.LK_RUNTIME_SOCCER_LOCOMOTION;return runtime&&runtime.normalizedTrackNode?runtime.normalizedTrackNode(name):String(name||'').toLowerCase().replace(/^(?:mixamorig|armature|skeleton|rig)(?:[_\-\s]*\d+)?[_\-\s]*/,'').replace(/[^a-z0-9]/g,'');}
  function normalizedRigCorrections(entry){const source=entry&&entry.rigCorrections&&typeof entry.rigCorrections==='object'?entry.rigCorrections:{},result={};Object.keys(source).forEach(key=>{const value=source[key];if(Array.isArray(value))result[rigBoneKey(key)]=[Number(value[0])||0,Number(value[1])||0,Number(value[2])||0];});return result;}
  function normalizedMotionTransform(entry){const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET;if(runtime&&runtime.motionTransform)return runtime.motionTransform(entry&&entry.motionTransform);const source=entry&&entry.motionTransform||{},vector=value=>{value=Array.isArray(value)?value:[0,0,0];return [Number(value[0])||0,Number(value[1])||0,Number(value[2])||0];};return {position:vector(source.position),rotation:vector(source.rotation)};}
  function previewPhase(state){const action=state&&state.previewAction,clip=action&&action.getClip&&action.getClip(),duration=Math.max(.0001,Number(clip&&clip.duration)||1);return action?Math.max(0,Math.min(1,Number(action.time)||0)/duration):Math.max(0,Math.min(1,Number(state&&state.timelinePhase)||0));}
  function timelineMetrics(state){const action=state&&state.previewAction,clip=action&&action.getClip&&action.getClip();return motionTimelineMetrics(state&&state.currentMotion,clip&&clip.duration,action?Number(action.time)||0:(Number(state&&state.timelinePhase)||0)*(Number(clip&&clip.duration)||1));}
  function normalizedPoseTimeline(entry){const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET;if(runtime&&runtime.poseTimeline)return runtime.poseTimeline(entry&&entry.poseTimeline);return {version:1,keyframes:[]};}
  function sampledPose(state,entry){const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET;return runtime&&runtime.samplePoseTimeline?runtime.samplePoseTimeline(entry&&entry.poseTimeline,previewPhase(state)):null;}
  function combinedMotionTransform(state,entry){const base=normalizedMotionTransform(entry),sample=sampledPose(state,entry),extra=sample&&sample.motionTransform||{position:[0,0,0],rotation:[0,0,0]};return {position:[0,1,2].map(i=>base.position[i]+extra.position[i]),rotation:[0,1,2].map(i=>base.rotation[i]+extra.rotation[i])};}
  function combinedRigCorrections(state,entry){const result=normalizedRigCorrections(entry),sample=sampledPose(state,entry),extra=sample&&sample.rigCorrections||{};Object.keys(extra).forEach(key=>{const base=result[key]||[0,0,0];result[key]=[0,1,2].map(i=>base[i]+(Number(extra[key][i])||0));});return result;}
  function timelineFrame(state,create){const entry=state&&state.currentMotion;if(!entry)return null;entry.poseTimeline=normalizedPoseTimeline(entry);const time=Number(previewPhase(state).toFixed(4));let frame=entry.poseTimeline.keyframes.find(item=>Math.abs(item.time-time)<.0025);if(!frame&&create){frame={time,motionTransform:{position:[0,0,0],rotation:[0,0,0]},rigCorrections:{}};entry.poseTimeline.keyframes.push(frame);entry.poseTimeline.keyframes.sort((a,b)=>a.time-b.time);}if(frame)state.selectedTimelineKeyTime=frame.time;return frame;}
  function applyPreviewMotionTransform(state){if(!state||!state.model||!state.previewRootLock||!state.currentMotion||!window.THREE)return false;const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET,value=combinedMotionTransform(state,state.currentMotion);if(runtime&&runtime.applyMotionTransform)return runtime.applyMotionTransform(window.THREE,state.model,state.previewRootLock,value);const THREE=window.THREE,delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(value.rotation[0]),THREE.MathUtils.degToRad(value.rotation[1]),THREE.MathUtils.degToRad(value.rotation[2]),'XYZ'));state.model.position.copy(state.previewRootLock.position).add(new THREE.Vector3().fromArray(value.position));state.model.quaternion.copy(state.previewRootLock.quaternion).multiply(delta).normalize();state.model.scale.copy(state.previewRootLock.scale);return true;}
  function syncMotionTransformFromModel(state){if(!state||!state.model||!state.previewRootLock||!state.currentMotion||!window.THREE)return false;const THREE=window.THREE,offset=state.model.position.clone().sub(state.previewRootLock.position),delta=state.previewRootLock.quaternion.clone().invert().multiply(state.model.quaternion).normalize(),euler=new THREE.Euler().setFromQuaternion(delta,'XYZ'),clean=value=>Math.abs(value)<.0001?0:Number(value.toFixed(3)),total={position:[offset.x,offset.y,offset.z].map(clean),rotation:[euler.x,euler.y,euler.z].map(value=>clean(THREE.MathUtils.radToDeg(value)))};if(state.timelineAutoKey){const frame=timelineFrame(state,true),base=normalizedMotionTransform(state.currentMotion);frame.motionTransform={position:[0,1,2].map(i=>clean(total.position[i]-base.position[i])),rotation:[0,1,2].map(i=>clean(total.rotation[i]-base.rotation[i]))};updateTimelineUi(state);}else state.currentMotion.motionTransform=total;return true;}
  function rigCorrectionQuaternion(angles){const THREE=window.THREE,value=Array.isArray(angles)?angles:[0,0,0];return new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(Number(value[0])||0),THREE.MathUtils.degToRad(Number(value[1])||0),THREE.MathUtils.degToRad(Number(value[2])||0),'XYZ'));}
  function editableRigBones(state){const bones=[];if(state&&state.model&&state.model.traverse)state.model.traverse(node=>{if(node&&node.isBone&&node.name)bones.push(node);});return bones;}
  function clearPreviewRigCorrections(state){if(!state||!state.previewAppliedRigCorrections)return;state.previewAppliedRigCorrections.forEach((delta,bone)=>{if(bone&&bone.quaternion)bone.quaternion.multiply(delta.clone().invert()).normalize();});state.previewAppliedRigCorrections.clear();}
  function applyPreviewRigCorrections(state){if(!state||!state.currentMotion||!state.model)return;const corrections=combinedRigCorrections(state,state.currentMotion),applied=state.previewAppliedRigCorrections||(state.previewAppliedRigCorrections=new Map());editableRigBones(state).forEach(bone=>{const angles=corrections[rigBoneKey(bone.name)];if(!angles)return;const delta=rigCorrectionQuaternion(angles);bone.quaternion.multiply(delta).normalize();applied.set(bone,delta);});state.model.updateMatrixWorld(true);}
  function clearRigEditor(state){if(!state)return;clearPreviewRigCorrections(state);if(state.transformControls&&state.rigEditBone&&state.transformControls.object===state.rigEditBone)state.transformControls.detach();if(state.rigHelper&&state.rigHelper.parent)state.rigHelper.parent.remove(state.rigHelper);if(state.rigHelper&&state.rigHelper.geometry&&state.rigHelper.geometry.dispose)state.rigHelper.geometry.dispose();if(state.rigHelper&&state.rigHelper.material&&state.rigHelper.material.dispose)state.rigHelper.material.dispose();state.rigHelper=null;state.rigEditBone=null;state.rigEditBaseQuaternion=null;if(state.rigBoneLabel)state.rigBoneLabel.hidden=true;if(state.rigResetButton)state.rigResetButton.hidden=true;}
  function selectRigBone(state,key){
    if(!state||!state.rigEditMode)return;clearPreviewRigCorrections(state);applyPreviewRigCorrections(state);const bone=editableRigBones(state).find(item=>rigBoneKey(item.name)===key)||editableRigBones(state)[0];if(!bone)return;const correction=combinedRigCorrections(state,state.currentMotion)[rigBoneKey(bone.name)]||[0,0,0],delta=rigCorrectionQuaternion(correction);state.rigEditBone=bone;state.rigEditBaseQuaternion=bone.quaternion.clone().multiply(delta.clone().invert()).normalize();if(state.rigBoneSelect)state.rigBoneSelect.value=rigBoneKey(bone.name);refreshStudioTransformTarget(state);if(state.previewStatus)state.previewStatus.textContent=(state.currentMotion.name||state.currentMotion.clip||'Animation')+' · '+tr('Edit Rig: rotate ','Edit Rig: ruota ')+bone.name;
  }
  function syncRigCorrectionFromBone(state){const bone=state&&state.rigEditBone,entry=state&&state.currentMotion,base=state&&state.rigEditBaseQuaternion;if(!bone||!entry||!base||!window.THREE)return false;const delta=base.clone().invert().multiply(bone.quaternion).normalize(),euler=new window.THREE.Euler().setFromQuaternion(delta,'XYZ'),toDeg=window.THREE.MathUtils.radToDeg,key=rigBoneKey(bone.name),clean=value=>Math.abs(value)<.0001?0:Number(value.toFixed(3)),total=[toDeg(euler.x),toDeg(euler.y),toDeg(euler.z)].map(clean);if(state.timelineAutoKey){const frame=timelineFrame(state,true),staticCorrections=normalizedRigCorrections(entry),baseAngles=staticCorrections[key]||[0,0,0];frame.rigCorrections=frame.rigCorrections||{};frame.rigCorrections[key]=[0,1,2].map(i=>clean(total[i]-baseAngles[i]));updateTimelineUi(state);}else {entry.rigCorrections=normalizedRigCorrections(entry);entry.rigCorrections[key]=total;}if(state.previewAppliedRigCorrections)state.previewAppliedRigCorrections.set(bone,delta.clone());return true;}
  function resetRigBone(state){const bone=state&&state.rigEditBone,entry=state&&state.currentMotion;if(!bone||!entry)return false;const key=rigBoneKey(bone.name);if(state.timelineAutoKey){const frame=timelineFrame(state,false);if(frame&&frame.rigCorrections)delete frame.rigCorrections[key];}else {entry.rigCorrections=normalizedRigCorrections(entry);delete entry.rigCorrections[key];}bone.quaternion.copy(state.rigEditBaseQuaternion);if(state.previewAppliedRigCorrections)state.previewAppliedRigCorrections.delete(bone);scheduleStudioAuthoringCommit(state);commitStudioAuthoring(state);updateTimelineUi(state);return true;}
  function buildRigEditor(state,entry){clearRigEditor(state);if(!state||!entry||!state.model||!window.THREE)return;const bones=editableRigBones(state);if(!bones.length){state.rigEditMode=false;updateRigButton(state);if(state.previewStatus)state.previewStatus.textContent=tr('Edit Rig unavailable: the Main Mesh has no editable bones.','Edit Rig non disponibile: la Main Mesh non contiene bone modificabili.');return;}entry.rigCorrections=normalizedRigCorrections(entry);state.previewPlaying=false;if(state.previewAction)state.previewAction.paused=true;clearPreviewRigCorrections(state);applyPreviewRigCorrections(state);state.rigHelper=new window.THREE.SkeletonHelper(state.model);state.rigHelper.material.depthTest=false;state.rigHelper.material.transparent=true;state.rigHelper.material.opacity=.9;state.rigHelper.renderOrder=30;state.scene.add(state.rigHelper);state.rigBoneSelect.innerHTML='';bones.forEach(bone=>state.rigBoneSelect.appendChild(new Option(bone.name,rigBoneKey(bone.name))));state.rigBoneLabel.hidden=false;state.rigResetButton.hidden=false;const preferred=bones.find(bone=>/hips|pelvis/i.test(rigBoneKey(bone.name)))||bones.find(bone=>/spine/i.test(rigBoneKey(bone.name)))||bones[0];selectRigBone(state,rigBoneKey(preferred.name));}
  function setRigEditMode(state,enabled){commitStudioAuthoring(state);state.rigEditMode=enabled===true&&!!(state.selected&&state.selected.kind==='motion');if(state.rigEditMode){if(state.gripMode)setGripMode(state,false);buildRigEditor(state,state.definition.animationSet[state.selected.index]);}else {clearRigEditor(state);refreshStudioTransformTarget(state);}updateRigButton(state);}
  function updateRigButton(state){if(!state||!state.rigButton)return;const available=!!(state.selected&&state.selected.kind==='motion');state.rigButton.disabled=!available;state.rigButton.classList.toggle('on',available&&state.rigEditMode===true);}
  // ---- Weapon grip mode -----------------------------------------------------
  // Available from a Motion slot and from the Weapon Grip container, because the
  // author arrives from both directions: "this clip holds the rifle" and "how is
  // the rifle held".
  function gripModeAvailable(state){return !!(state&&state.selected&&(state.selected.kind==='motion'||state.selected.kind==='weapon-grip')&&(state.graph.characterPawn||state.graph.soccerPawn));}
  function updateGripButton(state){
    if(!state||!state.gripButton)return;const available=gripModeAvailable(state),on=available&&state.gripMode===true;
    state.gripButton.disabled=!available;state.gripButton.classList.toggle('on',on);
    if(state.gripHandLabel)state.gripHandLabel.hidden=!on;if(state.gripLayerLabel)state.gripLayerLabel.hidden=!on;if(state.gripResetButton)state.gripResetButton.hidden=!on;
    if(state.gripWeaponButton){state.gripWeaponButton.hidden=!on;state.gripWeaponButton.classList.toggle('on',on&&state.gripWeaponEditMode===true);}
  }
  function populateGripSelects(state){
    state.gripContextKey=gripContextKey(state.gripContextKey);
    const grip=stateWeaponGripConfig(state,true);
    if(state.gripHandSelect){
      state.gripHandSelect.innerHTML='';
      const hands=[['trigger',tr('Trigger hand','Mano sul grilletto')],['support',tr('Support hand','Mano di supporto')]];
      hands.forEach(item=>state.gripHandSelect.appendChild(new Option(item[1],item[0])));
      state.gripHandSelect.value=state.gripHand==='support'?'support':'trigger';
    }
    if(state.gripLayerSelect){
      state.gripLayerSelect.innerHTML='';const contextual=!!gripContextSpec(state.gripContextKey),layers=contextual?[['hold',tr('State hold','Presa stato')],['fire',tr('Firing +','Fuoco +')]]:[['hold',tr('Hold','Presa')],['aim',tr('Aiming +','Mira +')],['fire',tr('Firing +','Fuoco +')]];
      layers.forEach(item=>state.gripLayerSelect.appendChild(new Option(item[1],item[0])));if(contextual&&state.gripLayer==='aim')state.gripLayer='hold';state.gripLayerSelect.value=GRIP_LAYERS.includes(state.gripLayer)?state.gripLayer:'hold';
    }
  }
  function gripStatusText(state){
    const weapon=gripWeaponForState(state,false),grip=stateWeaponGripConfig(state,false),hand=state.gripHand==='support'?tr('support hand','mano di supporto'):tr('trigger hand','mano sul grilletto');
    const layers={hold:tr('hold','presa'),aim:tr('aiming offset','offset di mira'),fire:tr('firing offset','offset di fuoco')};
    const layer=GRIP_LAYERS.includes(state.gripLayer)?state.gripLayer:'hold',offset=inheritedGripLayer(state.definition,grip,layer,state.gripHand,weapon);
    // The same disclosure the panel makes, where the author's eyes actually are
    // while they drag: an untouched layer is the weapon's default, not zero.
    const inherited=offset?' · '+tr('inheriting the weapon default ','eredita il valore predefinito dell\'arma ')+offset.map(value=>Number(value).toFixed(2)).join(', ')+' m':'';
    return tr('Hands: ','Mani: ')+grip.hands+' · '+hand+' · '+(layers[layer]||layers.hold)+inherited+' · '+tr('drag the dummy, the arms follow','trascina il dummy, le braccia seguono');
  }
  function buildGripEditor(state){
    if(!state)return;
    const group=buildGripDummies(state);
    if(!group){state.gripMode=false;updateGripButton(state);if(state.previewStatus)state.previewStatus.textContent=tr('Hand dummies unavailable: the preview scene is not ready.','Dummy delle mani non disponibili: la scena di preview non è pronta.');return;}
    // Same contract as Edit Rig: authoring a pose pauses playback, so the dummy
    // and the arms hold still while the hands are being placed. Preview stays
    // available from ▶ for checking the grip against the moving clip.
    state.previewPlaying=false;if(state.previewAction)state.previewAction.paused=true;
    populateGripSelects(state);updateGripButton(state);refreshStudioTransformTarget(state);
    const runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE,bones=runtime&&runtime.classifyBones?runtime.classifyBones(state.model):null,armed=!!(bones&&((bones.right&&bones.right.upper)||(bones.left&&bones.left.upper)));
    if(state.previewStatus)state.previewStatus.textContent=armed?gripStatusText(state):tr('Hand dummies placed. This preview mesh exposes no arm bones, so the arms cannot follow here — the authored values are still saved and used in Play.','Dummy posizionati. Questa mesh di preview non espone ossa delle braccia, quindi qui le braccia non possono seguire — i valori vengono comunque salvati e usati in Play.');
  }
  function setGripMode(state,enabled){
    commitStudioAuthoring(state);state.gripMode=enabled===true&&gripModeAvailable(state);
    if(state.gripMode){if(state.rigEditMode)setRigEditMode(state,false);if(state.curveMode)setCurveMode(state,false);buildGripEditor(state);}
    else {state.gripWeaponEditMode=false;clearGripDummies(state);refreshStudioTransformTarget(state);updateGripButton(state);}
    return state.gripMode===true;
  }
  function selectGripHand(state,hand){state.gripWeaponEditMode=false;state.gripHand=hand==='support'?'support':'trigger';if(state.gripHandSelect)state.gripHandSelect.value=state.gripHand;syncGripDummies(state);refreshStudioTransformTarget(state);updateGripButton(state);if(state.previewStatus)state.previewStatus.textContent=gripStatusText(state);}
  function selectGripLayer(state,layer){state.gripWeaponEditMode=false;state.gripLayer=GRIP_LAYERS.includes(layer)&&!(layer==='aim'&&gripContextSpec(state.gripContextKey))?layer:'hold';syncGripDummies(state);refreshStudioTransformTarget(state);updateGripButton(state);if(state.previewStatus)state.previewStatus.textContent=gripStatusText(state);}
  function syncGripFromDummy(state){const grip=readGripFromDummy(state);if(!grip)return false;updateGripLines(state);return true;}
  function setGripHands(state,hands){
    const grip=stateWeaponGripConfig(state,true);if(!grip)return false;
    grip.hands=GRIP_HANDS.includes(hands)?hands:'double';
    if(state.gripMode){populateGripSelects(state);syncGripDummies(state);refreshStudioTransformTarget(state);if(state.previewStatus)state.previewStatus.textContent=gripStatusText(state);}
    return true;
  }
  function setGripSupportHand(state,mode){
    const grip=stateWeaponGripConfig(state,true);if(!grip)return false;
    grip.supportHand=GRIP_SUPPORT_MODES.includes(mode)?mode:'auto';
    if(state.gripMode){populateGripSelects(state);syncGripDummies(state);refreshStudioTransformTarget(state);if(state.previewStatus)state.previewStatus.textContent=gripStatusText(state);}
    return true;
  }
  function selectGripWeapon(state,key){
    const entry=gripWeaponEntries(state&&state.definition).find(item=>item.key===key);if(!entry)return false;
    commitStudioAuthoring(state);state.gripWeaponKey=entry.key;state.gripHand='trigger';
    if(state.gripMode){buildGripWeaponPreview(state);populateGripSelects(state);syncGripDummies(state);refreshStudioTransformTarget(state);}
    if(state.refreshProperties)state.refreshProperties();return true;
  }
  function selectGripContext(state,value){
    if(!state)return false;commitStudioAuthoring(state);state.gripContextKey=gripContextKey(value);
    // Selecting a concrete state creates one explicit snapshot from the current
    // fallback. From then on every edit is isolated to that state and the save
    // receipt makes the authoring boundary visible.
    if(state.gripContextKey!=='base')stateWeaponGripConfig(state,true);if(gripContextSpec(state.gripContextKey)&&state.gripLayer==='aim')state.gripLayer='hold';
    if(state.gripMode){populateGripSelects(state);syncGripDummies(state);refreshStudioTransformTarget(state);}
    return true;
  }
  function resetGripToPreset(state){
    const weapon=gripWeaponForState(state,true),spec=gripContextSpec(state&&state.gripContextKey);
    if(spec){const base=normalizedGrip(weapon&&weapon.grip,defaultGripHands(weapon),weapon);if(base.profiles&&base.profiles[spec.key])delete base.profiles[spec.key];if(weapon)weapon.grip=base;if(state.gripMode)syncGripDummies(state);scheduleStudioAuthoringCommit(state);commitStudioAuthoring(state);if(state.refreshProperties)state.refreshProperties();return true;}
    const grip=stateWeaponGripConfig(state,true);if(!grip)return false;
    const preset=gripPreset(gripWeaponForState(state,false),grip.hands);
    grip.trigger={position:preset.trigger.position.slice(),rotation:preset.trigger.rotation.slice()};
    grip.support={position:preset.support.position.slice(),rotation:preset.support.rotation.slice()};
    grip.aim={trigger:[0,0,0],support:[0,0,0]};grip.fire={trigger:[0,0,0],support:[0,0,0]};
    if(state.gripMode)syncGripDummies(state);
    scheduleStudioAuthoringCommit(state);commitStudioAuthoring(state);
    if(state.refreshProperties)state.refreshProperties();
    return true;
  }
  function updateCurveButton(state){if(!state||!state.curveButton)return;const available=!!(state.selected&&state.selected.kind==='motion');state.curveButton.disabled=!available;state.curveButton.classList.toggle('on',available&&state.curveMode===true);}
  function normalizedCurve(entry){const source=entry&&entry.curveCorrection||{},offset=Array.isArray(source.offset)?source.offset:[0,0,0],influence=source.influence==null?1:Number(source.influence);return {offset:[Number(offset[0])||0,Number(offset[1])||0,Number(offset[2])||0],influence:Math.max(0,Math.min(1,Number.isFinite(influence)?influence:1)),falloff:'smooth-midpoint'};}
  function curveWeight(t,influence){return Math.sin(Math.PI*Math.max(0,Math.min(1,t)))**2*Math.max(0,Math.min(1,Number(influence)||0));}
  function updateCurveLine(state){
    if(!state||!state.curveLine||!state.currentMotion)return;const correction=normalizedCurve(state.currentMotion),positions=state.curveLine.geometry.attributes.position.array,count=positions.length/3;
    for(let i=0;i<count;i++){const t=i/(count-1),weight=curveWeight(t,correction.influence),baseZ=(t-.5)*2.4;positions[i*3]=correction.offset[0]*weight;positions[i*3+1]=.035+correction.offset[1]*weight;positions[i*3+2]=baseZ+correction.offset[2]*weight;}
    state.curveLine.geometry.attributes.position.needsUpdate=true;state.curveLine.geometry.computeBoundingSphere();
  }
  function clearCurveEditor(state){
    if(!state)return;if(state.transformControls&&state.curveHandle&&state.transformControls.object===state.curveHandle)state.transformControls.detach();
    if(state.curveGroup){state.curveGroup.traverse(node=>{if(node.geometry&&node.geometry.dispose)node.geometry.dispose();if(node.material&&node.material.dispose)node.material.dispose();});if(state.curveGroup.parent)state.curveGroup.parent.remove(state.curveGroup);}state.curveGroup=null;state.curveLine=null;state.curveHandle=null;
  }
  function buildCurveEditor(state,entry){
    clearCurveEditor(state);if(!state||!state.scene||!entry||!window.THREE)return;const THREE=window.THREE,correction=normalizedCurve(entry);entry.curveCorrection=correction;
    const group=new THREE.Group();group.name='Flying Curve editor';const baselineGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.02,-1.2),new THREE.Vector3(0,.02,1.2)]),baseline=new THREE.Line(baselineGeometry,new THREE.LineBasicMaterial({color:0x64748b,transparent:true,opacity:.65}));group.add(baseline);
    const geometry=new THREE.BufferGeometry(),points=new Float32Array(33*3);geometry.setAttribute('position',new THREE.BufferAttribute(points,3));const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x38bdf8,depthTest:false,transparent:true,opacity:.95}));line.renderOrder=20;group.add(line);
    const handle=new THREE.Mesh(new THREE.SphereGeometry(.075,18,12),new THREE.MeshStandardMaterial({color:0xffd166,emissive:0x5a3b00,depthTest:false}));handle.position.set(correction.offset[0],.035+correction.offset[1],correction.offset[2]);handle.renderOrder=21;handle.userData.lkFlyingCurveHandle=true;group.add(handle);state.scene.add(group);state.curveGroup=group;state.curveLine=line;state.curveHandle=handle;updateCurveLine(state);refreshStudioTransformTarget(state);
    if(state.previewStatus)state.previewStatus.textContent=(entry.name||entry.clip||'Animation')+' · '+tr('Flying Curve active: drag the gold point to reshape the broad middle of the motion','Flying Curve attiva: trascina il punto dorato per correggere in modo morbido la parte centrale del movimento');
  }
  function syncCurveFromHandle(state){if(!state||!state.curveHandle||!state.currentMotion)return;const handle=state.curveHandle,correction=normalizedCurve(state.currentMotion);correction.offset=[handle.position.x,handle.position.y-.035,handle.position.z];state.currentMotion.curveCorrection=correction;updateCurveLine(state);}
  function setCurveMode(state,enabled){commitStudioAuthoring(state);state.curveMode=enabled===true&&!!(state.selected&&state.selected.kind==='motion');if(state.curveMode)buildCurveEditor(state,state.definition.animationSet[state.selected.index]);else {clearCurveEditor(state);refreshStudioTransformTarget(state);}updateCurveButton(state);}
  function applyPreviewCurveCorrection(state){
    if(!state||!state.model||!state.previewRootLock||!state.currentMotion||!state.previewAction)return;const clip=state.previewAction.getClip&&state.previewAction.getClip(),duration=Math.max(.0001,Number(clip&&clip.duration)||1),phase=((Number(state.previewAction.time)||0)%duration+duration)%duration/duration,correction=normalizedCurve(state.currentMotion),weight=curveWeight(phase,correction.influence);
    state.model.position.copy(state.previewRootLock.position);state.model.position.x+=correction.offset[0]*weight;state.model.position.y+=correction.offset[1]*weight;state.model.position.z+=correction.offset[2]*weight;state.model.updateMatrixWorld(true);
  }
  function startMotionPreview(state,entry){
    if(state&&state.rigEditMode)setRigEditMode(state,false);
    state.currentMotion=entry;state.previewPlaying=true;if(state.timer&&state.timer.reset)state.timer.reset();if(state.playButton)state.playButton.classList.add('on');if(state.stopButton)state.stopButton.classList.remove('on');
    if(state.previewEntryReady===entry&&state.previewAction){state.previewAction.paused=false;state.previewAction.reset();if((Number(entry.playbackRate)||1)<0){const clip=state.previewAction.getClip&&state.previewAction.getClip();state.previewAction.time=Math.max(.001,Number(clip&&clip.duration)||1);}state.previewAction.play();applyPreviewRate(state);if(state.previewStatus)state.previewStatus.textContent=(entry.name||entry.clip||'Animation')+' · '+tr('preview playing','preview in riproduzione');return Promise.resolve(state.model);}
    if(state.previewEntryReady===entry&&state.placeholderController){if(state.previewStatus)state.previewStatus.textContent=(entry.name||entry.clip||'Animation')+' · '+tr('procedural preview playing','preview procedurale in riproduzione');return Promise.resolve(state.model);}
    return previewMotion(state,entry);
  }
  function stopMotionPreview(state){state.previewPlaying=false;if(state.previewAction)state.previewAction.paused=true;if(state.playButton)state.playButton.classList.remove('on');if(state.stopButton)state.stopButton.classList.add('on');if(state.previewStatus)state.previewStatus.textContent=tr('Preview stopped on the current pose','Preview arrestata sulla posa corrente');return true;}
  function applyPreviewRate(state){if(!state||!state.previewAction)return;state.previewAction.setEffectiveTimeScale(combinedPlaybackRate(state.currentMotion&&state.currentMotion.playbackRate,state.speedInput&&state.speedInput.value));}
  function configurePreviewAction(state,action,entry){const THREE=window.THREE;action.setLoop(entry.loop===false?THREE.LoopOnce:THREE.LoopRepeat,entry.loop===false?1:Infinity);action.clampWhenFinished=entry.loop===false;if((Number(entry.playbackRate)||1)<0){const clip=action.getClip&&action.getClip();action.time=Math.max(.001,Number(clip&&clip.duration)||1);}action.play();state.previewAction=action;state.previewEntryReady=entry;applyPreviewRate(state);return action;}
  function updateTimelineUi(state){
    if(!state||!state.timeline)return;const available=!!(state.selected&&state.selected.kind==='motion'&&state.currentMotion);state.timeline.hidden=!available;if(!available)return;
    const metrics=timelineMetrics(state),timeline=normalizedPoseTimeline(state.currentMotion);state.timelineRange.min='0';state.timelineRange.max=String(metrics.slotDuration);state.timelineRange.step=String(Math.max(.001,metrics.slotDuration/1000));state.timelineRange.value=String(metrics.seconds);const timing=metrics.seconds.toFixed(3)+' / '+metrics.slotDuration.toFixed(3)+' s';state.timelineTime.value=timing;state.timelineTime.textContent=timing;state.timelineCount.textContent=timeline.keyframes.length+' '+(timeline.keyframes.length===1?'key':'keys');state.timelineAuto.checked=state.timelineAutoKey===true;if(state.timelineAutoLabel)state.timelineAutoLabel.classList.toggle('on',state.timelineAutoKey===true);
    if(state.timelineKeys){state.timelineKeys.innerHTML='';timeline.keyframes.forEach((frame,index)=>{const playPhase=metrics.rate<0?1-frame.time:frame.time,seconds=playPhase*metrics.slotDuration,button=document.createElement('button');button.type='button';button.className='lk-ps-key-marker';button.style.left=(Math.max(0,Math.min(1,playPhase))*100)+'%';button.classList.toggle('on',Math.abs(finiteNumber(state.selectedTimelineKeyTime,-2)-frame.time)<.0001);button.title='Key '+(index+1)+' · '+seconds.toFixed(3)+' s';button.addEventListener('click',event=>{event.preventDefault();selectTimelineKey(state,frame.time);});state.timelineKeys.appendChild(button);});}
    const selected=timeline.keyframes.find(frame=>Math.abs(frame.time-finiteNumber(state.selectedTimelineKeyTime,-2))<.0001);state.timelineKeyTimeLabel.hidden=!selected;if(selected){const playPhase=metrics.rate<0?1-selected.time:selected.time;state.timelineKeyTime.min='0';state.timelineKeyTime.max=String(metrics.slotDuration);state.timelineKeyTime.value=String(Number((playPhase*metrics.slotDuration).toFixed(4)));}
  }
  function finiteNumber(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback;}
  function selectTimelineKey(state,sourceTime){if(!state||!state.currentMotion)return false;const metrics=timelineMetrics(state),phase=Math.max(0,Math.min(1,finiteNumber(sourceTime,0)));state.selectedTimelineKeyTime=phase;return scrubTimeline(state,(metrics.rate<0?1-phase:phase)*metrics.slotDuration);}
  function moveSelectedTimelineKey(state,value){if(!state||!state.currentMotion)return false;const metrics=timelineMetrics(state),timeline=normalizedPoseTimeline(state.currentMotion),selected=timeline.keyframes.find(frame=>Math.abs(frame.time-finiteNumber(state.selectedTimelineKeyTime,-2))<.0001);if(!selected)return false;const seconds=Math.max(0,Math.min(metrics.slotDuration,finiteNumber(value,0))),playPhase=seconds/metrics.slotDuration;selected.time=Number((metrics.rate<0?1-playPhase:playPhase).toFixed(4));timeline.keyframes.sort((a,b)=>a.time-b.time);state.currentMotion.poseTimeline=timeline;state.selectedTimelineKeyTime=selected.time;scheduleStudioAuthoringCommit(state);commitStudioAuthoring(state);selectTimelineKey(state,selected.time);return true;}
  function scrubTimeline(state,value){
    if(!state||!state.currentMotion)return false;const metrics=timelineMetrics(state),seconds=Math.max(0,Math.min(metrics.slotDuration,Number(value)||0)),playPhase=seconds/metrics.slotDuration,sourcePhase=metrics.rate<0?1-playPhase:playPhase;state.timelinePhase=sourcePhase;state.previewPlaying=false;if(state.previewAction){state.previewAction.paused=true;state.previewAction.time=sourcePhase*metrics.sourceDuration;if(state.mixer)state.mixer.update(0);}clearPreviewRigCorrections(state);applyPreviewRigLock(state);applyPreviewRigCorrections(state);if(state.rigEditMode&&state.rigEditBone)selectRigBone(state,rigBoneKey(state.rigEditBone.name));updateTimelineUi(state);return true;
  }
  function addTimelineRootKey(state){const frame=timelineFrame(state,true);if(!frame)return false;const current=combinedMotionTransform(state,state.currentMotion),base=normalizedMotionTransform(state.currentMotion);frame.motionTransform={position:[0,1,2].map(i=>current.position[i]-base.position[i]),rotation:[0,1,2].map(i=>current.rotation[i]-base.rotation[i])};state.timelineAutoKey=true;scheduleStudioAuthoringCommit(state);commitStudioAuthoring(state);updateTimelineUi(state);return true;}
  function addTimelineBoneKey(state){if(!state||!state.rigEditBone){if(state&&state.previewStatus)state.previewStatus.textContent=tr('Enable Edit Rig and select a bone before adding a bone key.','Attiva Edit Rig e seleziona un bone prima di aggiungere una chiave bone.');return false;}const frame=timelineFrame(state,true),key=rigBoneKey(state.rigEditBone.name),current=combinedRigCorrections(state,state.currentMotion)[key]||[0,0,0],base=normalizedRigCorrections(state.currentMotion)[key]||[0,0,0];frame.rigCorrections[key]=[0,1,2].map(i=>current[i]-base[i]);state.timelineAutoKey=true;scheduleStudioAuthoringCommit(state);commitStudioAuthoring(state);updateTimelineUi(state);return true;}
  function deleteTimelineKey(state){if(!state||!state.currentMotion)return false;const timeline=normalizedPoseTimeline(state.currentMotion),phase=finiteNumber(state.selectedTimelineKeyTime,previewPhase(state)),before=timeline.keyframes.length;timeline.keyframes=timeline.keyframes.filter(frame=>Math.abs(frame.time-phase)>=.0025);state.currentMotion.poseTimeline=timeline;if(before===timeline.keyframes.length)return false;state.selectedTimelineKeyTime=null;scheduleStudioAuthoringCommit(state);commitStudioAuthoring(state);clearPreviewRigCorrections(state);applyPreviewRigLock(state);applyPreviewRigCorrections(state);updateTimelineUi(state);return true;}
  function resetTimelineKeys(state){if(!state||!state.currentMotion)return false;const timeline=normalizedPoseTimeline(state.currentMotion);if(!timeline.keyframes.length)return false;if(!window.confirm(tr('Reset every keyframe in this animation slot? This can be undone with Ctrl+Z.','Azzerare tutti i keyframe di questo slot animazione? Puoi annullare con Ctrl+Z.')))return false;timeline.keyframes=[];state.currentMotion.poseTimeline=timeline;state.selectedTimelineKeyTime=null;scheduleStudioAuthoringCommit(state);commitStudioAuthoring(state);clearPreviewRigCorrections(state);applyPreviewRigLock(state);applyPreviewRigCorrections(state);updateTimelineUi(state);return true;}
  function disposeModel(model){if(!model||!model.traverse)return;model.traverse(node=>{if(node.geometry&&node.geometry.dispose)node.geometry.dispose();const materials=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];materials.forEach(material=>{if(material&&material.dispose)material.dispose();});});}
  function studioCameraConfig(definition){
    const fp=definition.firstPerson=definition.firstPerson&&typeof definition.firstPerson==='object'?definition.firstPerson:{};
    if(Number(fp.cameraSafetyVersion||0)<1){if(!Number.isFinite(Number(fp.bodyEyeForward))||Math.abs(Number(fp.bodyEyeForward)-.22)<.0001)fp.bodyEyeForward=.28;fp.cameraSafetyVersion=1;}
    Object.assign(fp,{eyeHeight:Number.isFinite(Number(fp.eyeHeight))?Number(fp.eyeHeight):1.62,autoEyeHeight:fp.autoEyeHeight!==false,eyeBoneOffset:Number.isFinite(Number(fp.eyeBoneOffset))?Number(fp.eyeBoneOffset):.08,bodyEyeForward:Number.isFinite(Number(fp.bodyEyeForward))?Number(fp.bodyEyeForward):.28,bodyEyeSide:Number.isFinite(Number(fp.bodyEyeSide))?Number(fp.bodyEyeSide):0,fov:Number.isFinite(Number(fp.fov))?Number(fp.fov):78,fovAds:Number.isFinite(Number(fp.fovAds))?Number(fp.fovAds):52,fovSprint:Number.isFinite(Number(fp.fovSprint))?Number(fp.fovSprint):84,focusDistance:Number.isFinite(Number(fp.focusDistance))?Number(fp.focusDistance):9,near:Number.isFinite(Number(fp.near))?Number(fp.near):.14});
    const tp=fp.thirdPerson=fp.thirdPerson&&typeof fp.thirdPerson==='object'?fp.thirdPerson:{};
    const defaults={distance:3.3,height:1.5,shoulder:.62,pivotForward:.18,fov:68,fovAds:52,focusDistance:9,near:.1,collisionMode:'fixed',collisionRadius:.34,minimumBodyDistance:.55};Object.keys(defaults).forEach(key=>{if(tp[key]==null||typeof defaults[key]==='number'&&!Number.isFinite(Number(tp[key])))tp[key]=defaults[key];});
    return fp;
  }
  function isCameraTransformObject(state,object){return !!(state&&object&&Object.values(state.cameraDummies||{}).some(entry=>entry&&entry.camera===object));}
  function activeCameraDummy(state){return state&&state.cameraDummies&&state.cameraDummies[state.cameraEditTarget||'third']||null;}
  function clearCameraEditor(state){
    if(!state)return false;if(state.transformControls&&isCameraTransformObject(state,state.transformControls.object))state.transformControls.detach();
    Object.values(state.cameraDummies||{}).forEach(entry=>{if(!entry)return;if(entry.helper&&entry.helper.dispose)entry.helper.dispose();if(entry.helper&&entry.helper.parent)entry.helper.parent.remove(entry.helper);if(entry.camera&&entry.camera.parent)entry.camera.parent.remove(entry.camera);if(entry.pick&&entry.pick.geometry)entry.pick.geometry.dispose();if(entry.pick&&entry.pick.material)entry.pick.material.dispose();if(entry.target&&entry.target.geometry)entry.target.geometry.dispose();if(entry.target&&entry.target.material)entry.target.material.dispose();if(entry.line&&entry.line.geometry)entry.line.geometry.dispose();if(entry.line&&entry.line.material)entry.line.material.dispose();});
    if(state.cameraTargetGroup&&state.cameraTargetGroup.parent)state.cameraTargetGroup.parent.remove(state.cameraTargetGroup);state.cameraTargetGroup=null;state.cameraDummies=null;state.cameraEditMode=false;return true;
  }
  function cameraDummyEntry(state,name,color){
    const THREE=window.THREE,fp=studioCameraConfig(state.definition),source=name==='first'?fp:fp.thirdPerson,fov=Number(source.fov)||60,near=Math.max(.02,Number(source.near)||.1),camera=new THREE.PerspectiveCamera(fov,16/9,near,Math.max(25,(Number(source.focusDistance)||9)*2));camera.name='Pawn Studio · '+(name==='first'?'First Person Camera':'Third Person Camera');camera.rotation.set(0,Math.PI,0);camera.userData.lkPawnStudioCamera=name;
    const pick=new THREE.Mesh(new THREE.BoxGeometry(.16,.1,.22),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.45,depthTest:false,transparent:true,opacity:.92}));pick.renderOrder=40;pick.userData.lkPawnStudioCamera=name;camera.add(pick);
    const helper=new THREE.CameraHelper(camera);helper.name=camera.name+' Frustum';helper.renderOrder=38;if(helper.material){helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.72;}
    const target=new THREE.Mesh(new THREE.SphereGeometry(.055,14,10),new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.85}));target.renderOrder=39;target.name=camera.name+' Focus';
    const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(0,0,1)]),line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.65}));line.renderOrder=37;line.name=camera.name+' Focus Line';
    state.scene.add(camera,helper);state.cameraTargetGroup.add(target,line);return {camera,pick,helper,target,line};
  }
  function studioPreviewEyeHeight(state,fp){
    if(!fp||fp.autoEyeHeight===false||!state||!state.model||!window.THREE)return Number(fp&&fp.eyeHeight)||1.62;let head=null;state.model.traverse&&state.model.traverse(node=>{if(head||!node||!node.isBone)return;const key=String(node.name||'').split(/[\\/|:]/).pop().replace(/[^a-z0-9]/gi,'').toLowerCase();if(/head$/.test(key)&&!/headtop|headend/.test(key))head=node;});if(!head||!head.getWorldPosition)return Number(fp.eyeHeight)||1.62;state.model.updateMatrixWorld(true);const origin=state.model.getWorldPosition(new window.THREE.Vector3()),point=head.getWorldPosition(new window.THREE.Vector3()),height=point.y-origin.y+(Number(fp.eyeBoneOffset)||0);return Number.isFinite(height)?Math.max(Number(fp.eyeHeight)||.2,height):Number(fp.eyeHeight)||1.62;
  }
  function syncCameraDummies(state){
    const THREE=window.THREE,fp=state&&studioCameraConfig(state.definition),dummies=state&&state.cameraDummies;if(!THREE||!fp||!dummies)return false;const clean=(entry,source,position,focus)=>{entry.camera.position.set(position[0],position[1],position[2]);entry.camera.rotation.set(0,Math.PI,0);entry.camera.fov=Number(source.fov)||60;entry.camera.near=Math.max(.02,Number(source.near)||.1);entry.camera.far=Math.max(25,focus*2);entry.camera.updateProjectionMatrix();entry.camera.updateMatrixWorld(true);entry.helper.update();entry.target.position.set(position[0],position[1],position[2]+focus);entry.line.geometry.setFromPoints([entry.camera.position.clone(),entry.target.position.clone()]);entry.line.geometry.attributes.position.needsUpdate=true;};
    clean(dummies.first,fp,[Number(fp.bodyEyeSide)||0,studioPreviewEyeHeight(state,fp),Number(fp.bodyEyeForward)||.28],Math.max(.25,Number(fp.focusDistance)||9));
    const tp=fp.thirdPerson,pivot=Number(tp.pivotForward)||0;clean(dummies.third,tp,[Number(tp.shoulder)||0,Number(tp.height)||1.5,pivot-Math.max(.4,Number(tp.distance)||3.3)],Math.max(.25,Number(tp.focusDistance)||9));return true;
  }
  function buildCameraEditor(state){
    if(!state||!state.scene||!window.THREE)return null;clearCameraEditor(state);state.cameraEditMode=true;state.cameraEditTarget=state.cameraEditTarget==='first'?'first':'third';state.cameraTargetGroup=new window.THREE.Group();state.cameraTargetGroup.name='Pawn Studio · Character Camera Targets';state.scene.add(state.cameraTargetGroup);state.cameraDummies={first:cameraDummyEntry(state,'first',0x38bdf8),third:cameraDummyEntry(state,'third',0xffd166)};syncCameraDummies(state);refreshStudioTransformTarget(state);if(state.previewStatus)state.previewStatus.textContent=tr('Camera dummies match the saved Play transforms · click blue First Person or gold Third Person, then Move','I dummy camera corrispondono alle trasformazioni salvate in Play · clicca Prima Persona blu o Terza Persona dorata, poi Muovi');return state.cameraTargetGroup;
  }
  function selectCameraTarget(state,name){if(!state||!state.cameraDummies||!state.cameraDummies[name])return false;commitStudioAuthoring(state);state.cameraEditTarget=name;if(state.cameraTargetSelect)state.cameraTargetSelect.value=name;refreshStudioTransformTarget(state);if(state.refreshProperties)state.refreshProperties();return true;}
  function syncCameraFromDummy(state){
    const entry=activeCameraDummy(state),fp=state&&studioCameraConfig(state.definition);if(!entry||!fp)return false;const clean=value=>Math.abs(value)<.0001?0:Number(value.toFixed(3)),position=entry.camera.position;
    if(state.cameraEditTarget==='first'){fp.bodyEyeSide=clean(position.x);fp.eyeHeight=Math.max(.2,clean(position.y));fp.autoEyeHeight=false;fp.bodyEyeForward=Math.max(.18,clean(position.z));}
    else {const tp=fp.thirdPerson;tp.shoulder=clean(position.x);tp.height=Math.max(.1,clean(position.y));tp.distance=Math.max(.4,clean((Number(tp.pivotForward)||0)-position.z));}
    syncCameraDummies(state);return true;
  }
  const SEATING_IK_TARGETS=Object.freeze(['pelvis','spine','chest','leftShoulder','rightShoulder','head','leftHand','rightHand','leftFoot','rightFoot','leftToe','rightToe','leftElbowPole','rightElbowPole','leftKneePole','rightKneePole']);
  const SEATING_ROTATION_FIELDS=Object.freeze({pelvis:'pelvisRotation',spine:'spineRotation',chest:'chestRotation',leftShoulder:'leftShoulderRotation',rightShoulder:'rightShoulderRotation',leftHand:'leftHandRotation',rightHand:'rightHandRotation',leftFoot:'leftFootRotation',rightFoot:'rightFootRotation',leftToe:'leftToeRotation',rightToe:'rightToeRotation'});
  const SEATING_WEIGHT_FIELDS=Object.freeze({pelvis:'torsoWeight',spine:'torsoWeight',chest:'torsoWeight',leftShoulder:'shoulderWeight',rightShoulder:'shoulderWeight',leftToe:'toeWeight',rightToe:'toeWeight'});
  function clearSeatingPreview(state){
    if(!state)return false;if(state.transformControls&&isSeatingTransformObject(state,state.transformControls.object))state.transformControls.detach();
    if(state.seatingVehicle){if(state.seatingVehicle.parent)state.seatingVehicle.parent.remove(state.seatingVehicle);disposeModel(state.seatingVehicle);}
    if(state.seatingTargetGroup){state.seatingTargetGroup.traverse(node=>{if(node.geometry&&node.geometry.dispose)node.geometry.dispose();const materials=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];materials.forEach(material=>material&&material.dispose&&material.dispose());});if(state.seatingTargetGroup.parent)state.seatingTargetGroup.parent.remove(state.seatingTargetGroup);}
    if(state.seatingOccupantRoot&&state.model&&state.model.parent===state.seatingOccupantRoot){state.seatingOccupantRoot.remove(state.model);state.scene&&state.scene.add(state.model);}if(state.seatingOccupantRoot&&state.seatingOccupantRoot.parent)state.seatingOccupantRoot.parent.remove(state.seatingOccupantRoot);
    if(state.seatingAnchorFrame&&state.seatingAnchorFrame.parent)state.seatingAnchorFrame.parent.remove(state.seatingAnchorFrame);
    state.seatingVehicle=null;state.seatingTargetGroup=null;state.seatingTargets=null;state.seatingTargetLines=null;state.seatingBoneCache=null;state.seatingRootDummy=null;state.seatingMasterDummy=null;state.seatingMasterMatrix=null;state.seatingOccupantRoot=null;state.seatingAnchorFrame=null;state.seatingAnchorNode=null;state.seatingSeat=null;state.seatingMode=false;state.seatingProfile=null;return true;
  }
  function isSeatingTransformObject(state,object){return !!(state&&object&&(object===state.seatingOccupantRoot||object===state.seatingMasterDummy||Object.values(state.seatingTargets||{}).includes(object)));}
  function activeSeatingTransformObject(state){if(!state||!state.seatingMode)return null;if(state.seatingEditTarget==='masterRig')return state.seatingMasterDummy||null;if(!state.seatingEditTarget||state.seatingEditTarget==='seatRoot')return state.seatingOccupantRoot||null;return state.seatingTargets&&state.seatingTargets[state.seatingEditTarget]||state.seatingOccupantRoot||null;}
  function selectSeatingTarget(state,name){
    if(!state||name!=='seatRoot'&&name!=='masterRig'&&(!state.seatingTargets||!state.seatingTargets[name]))return false;commitStudioAuthoring(state);state.seatingEditTarget=name;if(state.seatingTargetSelect)state.seatingTargetSelect.value=name;updateSeatingHelperVisibility(state);if(name==='masterRig'&&state.seatingMasterDummy)state.seatingMasterMatrix=seatingMasterRigidMatrix(state.seatingMasterDummy);refreshStudioTransformTarget(state);if(state.previewStatus)state.previewStatus.textContent=name==='masterRig'?tr('Master Rig selected · Move or Rotate carries the Character root and every IK target together','Master Rig selezionato · Muovi o Ruota trascina insieme root Character e tutti i target IK'):(name==='seatRoot'?tr('Character Root selected · Move or Rotate changes only the seated Character root','Root Character selezionata · Muovi o Ruota modifica solo la root del Character seduto'):(tr('Seat IK target selected: ','Target IK seduta selezionato: ')+name+' · '+tr('drag the gizmo to pose the skeleton','trascina il gizmo per posizionare lo skeleton')));return true;
  }
  function seatingMasterRigidMatrix(dummy){const THREE=window.THREE;if(!THREE||!dummy)return null;return new THREE.Matrix4().compose(dummy.position,dummy.quaternion,new THREE.Vector3(1,1,1));}
  function syncSeatingRootDummy(state){const dummy=state&&state.seatingRootDummy,root=state&&state.seatingOccupantRoot;if(!dummy||!root)return false;dummy.position.copy(root.position);dummy.quaternion.copy(root.quaternion);dummy.scale.setScalar(state.seatingEditTarget==='seatRoot'?1.22:1);dummy.updateMatrixWorld(true);return true;}
  function applySeatingProfileToPreview(state){
    const THREE=window.THREE,profile=state&&state.seatingProfile,root=state&&state.seatingOccupantRoot;if(!THREE||!profile||!root)return false;
    root.position.fromArray(profile.position||[0,0,0]);root.rotation.set(...(profile.rotation||[0,0,0]).map(value=>THREE.MathUtils.degToRad(Number(value)||0)));
    SEATING_IK_TARGETS.forEach(name=>{const marker=state.seatingTargets&&state.seatingTargets[name],value=profile.ik&&profile.ik[name],rotation=profile.ik&&profile.ik[SEATING_ROTATION_FIELDS[name]];if(marker&&Array.isArray(value))marker.position.fromArray(value);if(marker&&Array.isArray(rotation))marker.rotation.set(...rotation.map(number=>THREE.MathUtils.degToRad(Number(number)||0)));});
    root.updateMatrixWorld(true);syncSeatingRootDummy(state);state.seatingTargetGroup&&state.seatingTargetGroup.updateMatrixWorld(true);return true;
  }
  function syncSeatingFromTransform(state){
    const THREE=window.THREE,profile=state&&state.seatingProfile,target=state&&state.transformControls&&state.transformControls.object;if(!THREE||!profile||!target)return false;
    const clean=value=>Math.abs(value)<.0001?0:Number(value.toFixed(4));
    if(target===state.seatingMasterDummy){const currentMatrix=seatingMasterRigidMatrix(target),previous=state.seatingMasterMatrix||new THREE.Matrix4().identity(),delta=currentMatrix.clone().multiply(previous.clone().invert()),deltaRotation=new THREE.Quaternion(),unusedPosition=new THREE.Vector3(),unusedScale=new THREE.Vector3();delta.decompose(unusedPosition,deltaRotation,unusedScale);const movePoint=value=>new THREE.Vector3().fromArray(value||[0,0,0]).applyMatrix4(delta).toArray().map(clean),rotateValue=value=>{const current=new THREE.Quaternion().setFromEuler(new THREE.Euler(...(value||[0,0,0]).map(number=>THREE.MathUtils.degToRad(Number(number)||0)),'XYZ')),euler=new THREE.Euler().setFromQuaternion(deltaRotation.clone().multiply(current),'XYZ');return[euler.x,euler.y,euler.z].map(number=>clean(THREE.MathUtils.radToDeg(number)));};profile.position=movePoint(profile.position);profile.rotation=rotateValue(profile.rotation);SEATING_IK_TARGETS.forEach(name=>{if(Array.isArray(profile.ik&&profile.ik[name]))profile.ik[name]=movePoint(profile.ik[name]);const rotationField=SEATING_ROTATION_FIELDS[name];if(rotationField&&Array.isArray(profile.ik&&profile.ik[rotationField]))profile.ik[rotationField]=rotateValue(profile.ik[rotationField]);});state.seatingMasterMatrix=currentMatrix;applySeatingProfileToPreview(state);applySeatingPreviewPose(state);}
    else if(target===state.seatingOccupantRoot){profile.position=[target.position.x,target.position.y,target.position.z].map(clean);profile.rotation=[target.rotation.x,target.rotation.y,target.rotation.z].map(value=>clean(THREE.MathUtils.radToDeg(value)));syncSeatingRootDummy(state);}
    else {const name=Object.keys(state.seatingTargets||{}).find(key=>state.seatingTargets[key]===target),rotationField=name&&SEATING_ROTATION_FIELDS[name];if(name&&state.transformMode==='rotate'&&rotationField)profile.ik[rotationField]=[target.rotation.x,target.rotation.y,target.rotation.z].map(value=>clean(THREE.MathUtils.radToDeg(value)));else if(name)profile.ik[name]=[target.position.x,target.position.y,target.position.z].map(clean);const weightField=name&&SEATING_WEIGHT_FIELDS[name];if(weightField)profile.ik[weightField]=Math.max(Number(profile.ik[weightField])||0,1);}
    return true;
  }
  function updateSeatingHelperVisibility(state){
    if(!state||!state.seatingTargets)return false;const selected=state.seatingEditTarget;
    Object.keys(state.seatingTargets).forEach(name=>{state.seatingTargets[name].visible=state.seatingShowHelpers===true||selected===name;});if(state.seatingRootDummy){state.seatingRootDummy.visible=true;state.seatingRootDummy.scale.setScalar(selected==='seatRoot'?1.22:1);}if(state.seatingMasterDummy){state.seatingMasterDummy.visible=true;state.seatingMasterDummy.scale.setScalar(1);const material=state.seatingMasterDummy.material;if(material){material.opacity=selected==='masterRig'?1:.78;material.emissiveIntensity=selected==='masterRig'?.9:.45;}}return true;
  }
  function buildSeatingTargets(state){
    const THREE=window.THREE;if(!THREE||!state||!state.scene)return null;const group=new THREE.Group();group.name='Pawn Studio · Vehicle Full Body IK';
    const masterGeometry=new THREE.BoxGeometry(.18,.18,.18),masterMaterial=new THREE.MeshStandardMaterial({color:0xf59e0b,emissive:0x7c2d12,emissiveIntensity:.65,depthTest:false,transparent:true,opacity:.96,wireframe:true}),masterDummy=new THREE.Mesh(masterGeometry,masterMaterial);masterDummy.name='Seat IK · Master Rig';masterDummy.renderOrder=39;masterDummy.userData.lkSeatingTarget='masterRig';masterDummy.position.fromArray(state.seatingProfile&&state.seatingProfile.ik&&state.seatingProfile.ik.pelvis||[0,0,0]);const masterAxes=new THREE.AxesHelper(.32);masterAxes.renderOrder=40;if(masterAxes.material){masterAxes.material.depthTest=false;masterAxes.material.transparent=true;masterAxes.material.opacity=.95;}masterDummy.add(masterAxes);group.add(masterDummy);state.seatingMasterDummy=masterDummy;state.seatingMasterMatrix=seatingMasterRigidMatrix(masterDummy);
    const rootGeometry=new THREE.OctahedronGeometry(.105),rootMaterial=new THREE.MeshStandardMaterial({color:0xf8fafc,emissive:0x475569,emissiveIntensity:.55,depthTest:false,transparent:true,opacity:.96,wireframe:true}),rootDummy=new THREE.Mesh(rootGeometry,rootMaterial);rootDummy.name='Seat IK · Whole Character Root';rootDummy.renderOrder=37;rootDummy.userData.lkSeatingTarget='seatRoot';const rootAxes=new THREE.AxesHelper(.24);rootAxes.renderOrder=38;if(rootAxes.material){rootAxes.material.depthTest=false;rootAxes.material.transparent=true;rootAxes.material.opacity=.9;}rootDummy.add(rootAxes);group.add(rootDummy);state.seatingRootDummy=rootDummy;
    const targets={},lines={};SEATING_IK_TARGETS.forEach(name=>{const contact=/Hand|Foot|Toe/.test(name),pole=/Pole/.test(name),torso=/^(?:pelvis|spine|chest)$/.test(name),shoulder=/Shoulder/.test(name),color=contact?(/left/i.test(name)?0x38bdf8:0xffd166):(pole?0xa78bfa:(torso?0x34d399:(shoulder?0xfb7185:0x22c55e))),geometry=pole?new THREE.OctahedronGeometry(.035):(torso?new THREE.TetrahedronGeometry(.055):new THREE.SphereGeometry(.045,14,10)),marker=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.3,depthTest:false,transparent:true,opacity:pole?.68:.94})),line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.58}));marker.name='Seat IK · '+name;marker.renderOrder=35;marker.userData.lkSeatingTarget=name;line.name='Seat IK link · '+name;line.renderOrder=34;if(SEATING_ROTATION_FIELDS[name]){const axes=new THREE.AxesHelper(.11);axes.renderOrder=36;if(axes.material){axes.material.depthTest=false;axes.material.transparent=true;axes.material.opacity=.8;}marker.add(axes);}group.add(line,marker);targets[name]=marker;lines[name]=line;});
    state.scene.add(group);state.seatingTargetGroup=group;state.seatingTargets=targets;state.seatingTargetLines=lines;state.seatingBoneCache={};updateSeatingHelperVisibility(state);return group;
  }
  function seatingBoneForTarget(state,name){
    if(!state||!state.model)return null;const cache=state.seatingBoneCache||(state.seatingBoneCache={});if(Object.prototype.hasOwnProperty.call(cache,name))return cache[name];const keys={pelvis:['hips','pelvis'],spine:['spine'],chest:['spine2','chest','upperchest'],head:['head'],leftShoulder:['leftshoulder'],rightShoulder:['rightshoulder'],leftHand:['lefthand'],rightHand:['righthand'],leftFoot:['leftfoot'],rightFoot:['rightfoot'],leftToe:['lefttoebase','lefttoe'],rightToe:['righttoebase','righttoe'],leftElbowPole:['leftforearm','leftlowerarm'],rightElbowPole:['rightforearm','rightlowerarm'],leftKneePole:['leftleg','leftlowerleg'],rightKneePole:['rightleg','rightlowerleg']}[name]||[],bones=[];state.model.traverse&&state.model.traverse(node=>{if(node&&node.isBone)bones.push(node);});cache[name]=keys.map(key=>bones.find(bone=>rigBoneKey(bone.name)===key)||bones.find(bone=>rigBoneKey(bone.name).endsWith(key))).find(Boolean)||null;return cache[name];
  }
  function updateSeatingTargetLinks(state){
    const THREE=window.THREE,group=state&&state.seatingTargetGroup;if(!THREE||!group||!state.seatingTargets||!state.seatingTargetLines)return false;group.updateMatrixWorld(true);Object.keys(state.seatingTargets).forEach(name=>{const marker=state.seatingTargets[name],line=state.seatingTargetLines[name],bone=seatingBoneForTarget(state,name);if(!line)return;line.visible=marker.visible!==false&&!!bone;if(!bone)return;const target=marker.getWorldPosition(new THREE.Vector3()),joint=bone.getWorldPosition(new THREE.Vector3());group.worldToLocal(target);group.worldToLocal(joint);line.geometry.setFromPoints([joint,target]);line.geometry.attributes.position.needsUpdate=true;});return true;
  }
  function applySeatingPreviewPose(state){
    const THREE=window.THREE,runtime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE,profile=state&&state.seatingProfile,targets=state&&state.seatingTargets,model=state&&state.model;if(!THREE||!runtime||!runtime.applySeated||!profile||!profile.ik||profile.ik.enabled===false||!targets||!model)return false;
    const point=name=>{const value=targets[name].getWorldPosition(new THREE.Vector3());return{x:value.x,y:value.y,z:value.z};},rad=value=>(value||[0,0,0]).map(number=>(Number(number)||0)*Math.PI/180);
    const changed=runtime.applySeated(THREE,model,{pelvis:point('pelvis'),spine:point('spine'),chest:point('chest'),leftShoulder:point('leftShoulder'),rightShoulder:point('rightShoulder'),head:point('head'),leftHand:point('leftHand'),rightHand:point('rightHand'),leftFoot:point('leftFoot'),rightFoot:point('rightFoot'),leftToe:point('leftToe'),rightToe:point('rightToe'),leftElbowPole:point('leftElbowPole'),rightElbowPole:point('rightElbowPole'),leftKneePole:point('leftKneePole'),rightKneePole:point('rightKneePole'),pelvisRotation:rad(profile.ik.pelvisRotation),spineRotation:rad(profile.ik.spineRotation),chestRotation:rad(profile.ik.chestRotation),leftShoulderRotation:rad(profile.ik.leftShoulderRotation),rightShoulderRotation:rad(profile.ik.rightShoulderRotation),leftHandRotation:rad(profile.ik.leftHandRotation),rightHandRotation:rad(profile.ik.rightHandRotation),leftFootRotation:rad(profile.ik.leftFootRotation),rightFootRotation:rad(profile.ik.rightFootRotation),leftToeRotation:rad(profile.ik.leftToeRotation),rightToeRotation:rad(profile.ik.rightToeRotation),fingers:profile.ik.fingers,handWeight:profile.ik.weight,footWeight:profile.ik.weight,headWeight:profile.ik.headWeight,torsoWeight:profile.ik.torsoWeight,shoulderWeight:profile.ik.shoulderWeight,toeWeight:profile.ik.toeWeight},profile.ik.weight);updateSeatingTargetLinks(state);return changed;
  }
  function frameSeatingPreview(state){
    const THREE=window.THREE;if(!THREE||!state||!state.model)return;const box=visiblePreviewBounds(THREE,[state.model,state.seatingVehicle].filter(Boolean));if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),radius=Math.max(.7,size.length()*.55),direction=new THREE.Vector3(1,.55,1).normalize();state.camera.position.copy(center).addScaledVector(direction,radius*1.7);state.camera.near=Math.max(.01,radius/150);state.camera.far=Math.max(100,radius*25);state.camera.updateProjectionMatrix();if(state.controls){state.controls.target.copy(center);state.controls.update();}
  }
  function visiblePreviewBounds(THREE,roots){
    const result=new THREE.Box3();result.makeEmpty();(roots||[]).forEach(root=>{if(!root||!root.traverse)return;root.updateWorldMatrix&&root.updateWorldMatrix(true,true);root.traverse(node=>{if(!node||!node.isMesh||node.visible===false||!node.geometry)return;let ancestor=node.parent;while(ancestor&&ancestor!==root){if(ancestor.visible===false)return;ancestor=ancestor.parent;}const data=node.userData||{};if(data.lkPawnStudioVehicleMetadataHidden||data.lkMeshEditDeleted||data.lkMeshEditSplitHidden)return;if(node.isSkinnedMesh&&node.computeBoundingBox)node.computeBoundingBox();else if(!node.geometry.boundingBox&&node.geometry.computeBoundingBox)node.geometry.computeBoundingBox();const local=node.boundingBox||node.geometry.boundingBox;if(local&&!local.isEmpty()){const worldBox=local.clone().applyMatrix4(node.matrixWorld);result.union(worldBox);}});});
    return result;
  }
  function resolveSeatingPreviewAnchor(state,vehicle){
    const THREE=window.THREE,sketchbook=window.LK_RUNTIME_SKETCHBOOK_PAWNS;if(!THREE||!state||!vehicle)return null;
    let seat=null;try{const parts=sketchbook&&sketchbook.scanSourceParts?sketchbook.scanSourceParts({owner:vehicle,config:{interaction:{}}}):null,seats=parts&&Array.isArray(parts.seats)?parts.seats:[];seat=seats.find(item=>item&&item.type==='driver')||seats[0]||null;}catch(error){}
    const occupancy=window.LK_RUNTIME_VEHICLE_OCCUPANCY,previewPawn={owner:vehicle,assetRoot:()=>vehicle},synthetic=seat||{node:vehicle,synthetic:true},anchor=occupancy&&occupancy.seatAnchor?occupancy.seatAnchor(previewPawn,synthetic):(seat&&seat.node||vehicle),frame=new THREE.Group();frame.name='Pawn Studio · Runtime Seat Frame';anchor.updateMatrixWorld&&anchor.updateMatrixWorld(true);anchor.getWorldPosition(frame.position);anchor.getWorldQuaternion(frame.quaternion);frame.scale.set(1,1,1);state.scene.add(frame);
    if(state.seatingOccupantRoot)frame.add(state.seatingOccupantRoot);if(state.seatingTargetGroup)frame.add(state.seatingTargetGroup);
    state.seatingAnchorFrame=frame;state.seatingAnchorNode=anchor;state.seatingSeat=seat;applySeatingProfileToPreview(state);updateSeatingHelperVisibility(state);return frame;
  }
  function autoAlignHighPolySeatFromSteering(state,vehicle,profile,key){
    const THREE=window.THREE,identity=[key,profile&&profile.asset&&profile.asset.dbKey,profile&&profile.asset&&profile.asset.name].filter(Boolean).join(' ').toLowerCase();if(!THREE||!state||!vehicle||!profile||!profile.ik||profile.steeringAutoLayoutVersion>=3||!/high[_ -]?poly[_ -]?car[_ -]?v3/.test(identity))return false;
    let wheel=null;vehicle.traverse(node=>{if(wheel||!node)return;const data=node.userData||{},name=String(node.name||'').toLowerCase(),role=String(data.lkRigRole||'').toLowerCase();if(name==='steering_wheel_mesh'||role==='steering-wheel-mesh')wheel=node;});if(!wheel||!state.seatingAnchorFrame)return false;
    vehicle.updateMatrixWorld&&vehicle.updateMatrixWorld(true);state.seatingAnchorFrame.updateMatrixWorld&&state.seatingAnchorFrame.updateMatrixWorld(true);const point=wheel.getWorldPosition(new THREE.Vector3());state.seatingAnchorFrame.worldToLocal(point);const clean=value=>Math.abs(value)<.0001?0:Number(value.toFixed(4)),x=point.x,wheelY=point.y,wheelZ=point.z,pelvisY=wheelY-.46,pelvisZ=wheelZ-.43,set=(name,a,b,c)=>{profile.ik[name]=[a,b,c].map(clean);};
    profile.position=[x,Math.max(0,wheelY-1.04),wheelZ-.68].map(clean);profile.rotation=[0,0,0];
    set('pelvis',x,pelvisY,pelvisZ);set('spine',x,pelvisY+.23,pelvisZ-.05);set('chest',x,pelvisY+.45,pelvisZ-.01);set('head',x,pelvisY+.76,pelvisZ+.08);
    // Seating targets use Character anatomical space: +X is left. The Main
    // Mesh alignment already owns the model's 180-degree visual correction, so
    // mirroring the targets again would send every right dummy to the left limb.
    set('leftShoulder',x+.23,pelvisY+.43,pelvisZ);set('rightShoulder',x-.23,pelvisY+.43,pelvisZ);set('leftHand',x+.17,wheelY+.015,wheelZ);set('rightHand',x-.17,wheelY+.015,wheelZ);
    set('leftFoot',x+.15,Math.max(.12,pelvisY-.39),pelvisZ+.72);set('rightFoot',x-.15,Math.max(.12,pelvisY-.39),pelvisZ+.72);set('leftToe',x+.15,Math.max(.08,pelvisY-.43),pelvisZ+.98);set('rightToe',x-.15,Math.max(.08,pelvisY-.43),pelvisZ+.98);
    set('leftElbowPole',x+.42,wheelY-.15,wheelZ-.16);set('rightElbowPole',x-.42,wheelY-.15,wheelZ-.16);set('leftKneePole',x+.22,pelvisY-.24,pelvisZ+.45);set('rightKneePole',x-.22,pelvisY-.24,pelvisZ+.45);
    profile.ik.torsoWeight=1;profile.ik.shoulderWeight=1;profile.ik.toeWeight=1;profile.steeringAutoLayoutVersion=3;profile.steeringReference={node:wheel.name||'steering_wheel_mesh',position:[point.x,point.y,point.z].map(clean)};if(state.seatingMasterDummy){state.seatingMasterDummy.position.fromArray(profile.ik.pelvis);state.seatingMasterDummy.rotation.set(0,0,0);state.seatingMasterDummy.scale.setScalar(1);state.seatingMasterMatrix=seatingMasterRigidMatrix(state.seatingMasterDummy);}applySeatingProfileToPreview(state);applySeatingPreviewPose(state);return true;
  }
  function activeNativeVehiclePreview(asset){
    const THREE=window.THREE,GAME=window.LOT_KING,runtime=window.LK_RUNTIME_VEHICLE_OCCUPANCY,player=GAME&&GAME.player,source=player&&typeof player.getModel==='function'?player.getModel():null;
    if(!THREE||!runtime||!player||!player.car)return null;
    const stored=activeLevelPlayerAsset(STORE),wanted=runtime.assetIdentities?runtime.assetIdentities(asset):[],actual=runtime.vehicleAssetIdentities?runtime.vehicleAssetIdentities({id:'native-player-car',kind:'native-adapter',owner:player.car,config:{asset:stored}}):[];
    if(stored&&runtime.assetIdentities)runtime.assetIdentities(stored).forEach(value=>{if(actual.indexOf(value)<0)actual.push(value);});
    if(!wanted.some(value=>actual.indexOf(value)>=0))return null;
    // Normally getModel() is the exact fitted GLB. During an editor ownership
    // transition it may temporarily be null even though the active Player Car
    // already owns the visual hierarchy; cloning the Pawn root keeps the custom
    // car available instead of silently falling through to Character-only.
    const visual=source||player.car,swapped=[],seenOwners=new Set(),safeUserData=value=>{const seen=new WeakSet();try{return JSON.parse(JSON.stringify(value||{},(key,item)=>{if(typeof item==='function')return undefined;if(item&&typeof item==='object'){if(item.isObject3D||item.isMaterial||item.isBufferGeometry||item.isTexture||seen.has(item))return undefined;seen.add(item);}return item;}));}catch(error){return {};}};
    // Three.js Object3D.clone() JSON-serializes userData. Runtime-only fields
    // such as lkDynamicSurfaceController point back to the owning Object3D and
    // therefore form a cycle. Swap in a serializable authoring snapshot only
    // for the synchronous clone, then restore every live runtime object.
    const prepare=owner=>{if(!owner||seenOwners.has(owner)||!owner.userData)return;seenOwners.add(owner);swapped.push([owner,owner.userData]);owner.userData=safeUserData(owner.userData);};
    visual.traverse(node=>{prepare(node);prepare(node.geometry);(Array.isArray(node.material)?node.material:[node.material]).forEach(prepare);});
    let clone;try{clone=THREE.SkeletonUtils&&THREE.SkeletonUtils.clone?THREE.SkeletonUtils.clone(visual):visual.clone(true);}finally{swapped.forEach(entry=>{entry[0].userData=entry[1];});}
    clone.animations=(visual.animations||[]).map(clip=>clip&&clip.clone?clip.clone():clip);
    clone.traverse(node=>{if(node.geometry&&node.geometry.clone)node.geometry=node.geometry.clone();if(node.material)node.material=Array.isArray(node.material)?node.material.map(material=>material&&material.clone?material.clone():material):(node.material.clone?node.material.clone():node.material);});
    // getModel() may sit below one or more normalization/pivot nodes. A plain
    // clone preserves only its immediate local transform, so the standalone
    // authoring scene could lose a parent correction and display both the car
    // and its seat frame mirrored or offset. Rebuild the exact model transform
    // relative to the Player Car Pawn root, which is the neutral frame used by
    // Play, and explicitly revive the cloned visual root (the live root may be
    // hidden merely because editor ownership is inactive).
    try{player.car.updateWorldMatrix&&player.car.updateWorldMatrix(true,true);visual.updateWorldMatrix&&visual.updateWorldMatrix(true,true);const relative=new THREE.Matrix4().copy(player.car.matrixWorld).invert().multiply(visual.matrixWorld);relative.decompose(clone.position,clone.quaternion,clone.scale);}catch(error){}
    clone.visible=true;clone.userData=Object.assign({},clone.userData,{lkPreviewSource:'active-native-player-model',lkPreviewTransform:'player-car-relative'});return clone;
  }
  function previewSeatingCharacter(state){
    const neutral=seatingNeutralMotion(state&&state.definition);
    if(!neutral)return previewMainModel(state);
    return previewMotion(state,neutral).then(model=>{state.currentMotion=null;updateTimelineUi(state);return model||state.model||null;});
  }
  function previewVehicleSeating(state){
    const request=state.seatingPreviewToken=(state.seatingPreviewToken||0)+1,settings=seatingSettings(state.definition),key=settings.editorProfile||'family:sketchbook-car',builtin=SEATING_VEHICLES.find(item=>item.key===key),builtinAsset=builtin&&seatingVehicleAsset(builtin),profile=seatingProfile(state.definition,key,builtinAsset),asset=profile.asset||builtinAsset;
    return previewSeatingCharacter(state).then(model=>{if(!model||state.seatingPreviewToken!==request)return null;state.seatingMode=true;state.seatingProfile=profile;state.seatingProfileKey=key;state.seatingEditTarget=state.seatingEditTarget||'seatRoot';if(state.seatingShowHelpers==null)state.seatingShowHelpers=true;if(alignUntouchedExactSeatProfile(profile,key,state.graph))scheduleStudioAuthoringCommit(state);const root=new window.THREE.Group();root.name='Pawn Studio · Seated Character Root';state.scene.add(root);root.add(model);state.seatingOccupantRoot=root;buildSeatingTargets(state);applySeatingProfileToPreview(state);refreshStudioTransformTarget(state);
      if(!asset){frameSeatingPreview(state);state.previewStatus.textContent=tr('Seat profile ready · select a vehicle asset for visual reference.','Profilo seduta pronto · seleziona un asset veicolo come riferimento.');return model;}
      const storedAsset=activeLevelPlayerAsset(STORE),canonicalAsset=seatingPreviewAsset(asset,storedAsset);
      // Prefer the persistent GLB: unlike the live Player Car it cannot contain
      // runtime controllers with circular userData. The fitted runtime clone is
      // retained only as a protected fallback when the stored asset is missing.
      const runtimeFallback=canonicalError=>{const activePreview=activeNativeVehiclePreview(asset);if(activePreview)return activePreview;throw canonicalError||new Error('Persistent vehicle GLB unavailable');},vehicleRequest=loadPreviewAsset(canonicalAsset).then(vehicle=>vehicle||runtimeFallback(new Error('Persistent vehicle GLB returned no scene')),runtimeFallback);
      return vehicleRequest.then(vehicle=>{if(!state.seatingMode||state.seatingPreviewToken!==request){disposeModel(vehicle);return model;}hideSeatingVehicleMetadata(vehicle);const visibleMeshes=ensureSeatingVehicleVisible(vehicle);if(!visibleMeshes)throw new Error('vehicle loaded but contains no visible render meshes');state.seatingVehicle=vehicle;vehicle.name='Pawn Studio · Vehicle Preview';state.scene.add(vehicle);vehicle.updateMatrixWorld&&vehicle.updateMatrixWorld(true);resolveSeatingPreviewAnchor(state,vehicle);const autoAligned=autoAlignHighPolySeatFromSteering(state,vehicle,profile,key);if(autoAligned)scheduleStudioAuthoringCommit(state);refreshStudioTransformTarget(state);frameSeatingPreview(state);const anchorName=state.seatingSeat&&state.seatingSeat.name||tr('synthetic vehicle root','root veicolo sintetica');state.previewStatus.textContent=autoAligned?tr('High Poly Car driver pose aligned from steering wheel · Master Rig moves the complete setup','Posa guidatore High Poly Car allineata dal volante · Master Rig muove l’intero setup'):(tr('Runtime-parity seat preview · anchor: ','Anteprima seduta identica al runtime · anchor: ')+anchorName);return model;}).catch(error=>{state.previewStatus.textContent=tr('Character seat loaded; vehicle preview error: ','Seduta Character caricata; errore anteprima veicolo: ')+String(error&&error.message||error);frameSeatingPreview(state);return model;});});
  }
  // The dummies hold references to the model's arm bones for the pose snapshot,
  // so they must go before the model does; grip mode itself survives and the
  // caller rebuilds them once the new preview model is in place.
  function clearPreviewModel(state){clearRigEditor(state);clearGripDummies(state);if(state.clothBrushCleanup)state.clothBrushCleanup();state.clothBrushCleanup=null;if(state.clothPreview)state.clothPreview.dispose();state.clothPreview=null;if(state.transformControls&&state.model&&state.transformControls.object===state.model)state.transformControls.detach();if(state.mixer){const root=state.mixer.getRoot&&state.mixer.getRoot();state.mixer.stopAllAction();if(root&&state.mixer.uncacheRoot)state.mixer.uncacheRoot(root);}state.mixer=null;state.previewAction=null;state.previewEntryReady=null;state.previewRootLock=null;state.previewRigLock=null;state.previewAppliedRigCorrections=null;state.activePreviewScale=1;if(state.placeholderController)state.placeholderController.dispose();state.placeholderController=null;state.placeholderMotion=null;state.modelIsPlaceholder=false;if(state.previewHelper&&state.previewHelper.parent)state.previewHelper.parent.remove(state.previewHelper);if(state.previewHelper&&state.previewHelper.geometry&&state.previewHelper.geometry.dispose)state.previewHelper.geometry.dispose();if(state.previewHelper&&state.previewHelper.material&&state.previewHelper.material.dispose)state.previewHelper.material.dispose();state.previewHelper=null;if(state.model&&state.model.parent)state.model.parent.remove(state.model);disposeModel(state.model);state.model=null;state.skinnedMeshes=[];clearSeatingPreview(state);}
  function prepareModelBounds(state,model){state.skinnedMeshes=[];if(!model||!model.traverse)return;model.traverse(node=>{if(node&&node.isSkinnedMesh){state.skinnedMeshes.push(node);node.frustumCulled=false;}});}
  // Every top-level preview request (selecting Main Mesh/Overview/Skeleton,
  // or a Motion entry) bumps state.previewToken once and threads that same
  // token through its whole async chain. Clicking through several motion
  // entries quickly starts overlapping GLB/FBX loads that do not resolve in
  // request order; without this guard a stale, out-of-order response could
  // still win the race, clear the model the latest click just set up, and
  // leave the preview empty — the "converted FBX disappears" symptom.
  function nextPreviewToken(state){ state.previewToken=(state.previewToken||0)+1; return state.previewToken; }
  function previewStale(state,token){ return active!==state||state.previewToken!==token; }
  function libraryAssetForRef(ref){
    if(!ref)return null;const candidates=[ref.id,ref.key,ref.dbKey,ref.sourceDbKey].filter(Boolean);
    return assetLibraryLoad().find(asset=>asset&&candidates.some(value=>value===asset.id||value===asset.key||value===asset.dbKey||value===asset.sourceDbKey))||null;
  }
  function loadCanonicalAnimationSource(asset){
    const THREE=window.THREE;
    if(!THREE||!THREE.GLTFLoader)return Promise.reject(new Error('Canonical GLB animation loader unavailable'));
    const url=asset&&asset.dbKey&&window.LK_ASSET_BLOBS
      ?window.LK_ASSET_BLOBS.getUrl(asset.dbKey)
      :(asset&&asset.src?Promise.resolve(asset.src):Promise.reject(new Error('Canonical GLB animation source missing')));
    // Match character-pawn-base.loadAnimationContainer(): external motion
    // sources stay raw until retargeting. Fitting/grounding this source before
    // comparing its bones changes the armature ratio and creates a different
    // result from Play.
    return url.then(src=>new Promise((resolve,reject)=>{
      new THREE.GLTFLoader().load(src,gltf=>{
        const model=gltf&&gltf.scene;if(!model){reject(new Error('Canonical GLB animation scene missing'));return;}
        model.animations=(gltf.animations||[]).map(clip=>clip&&clip.clone?clip.clone():clip);
        model.userData=Object.assign({},model.userData,{lkPreviewSource:'canonical-glb-raw'});
        resolve(model);
      },undefined,reject);
    }));
  }
  function loadPreviewAsset(ref,options){
    const libraryAsset=libraryAssetForRef(ref),asset=Object.assign({},libraryAsset||{},ref||{});
    const loaders=pluginManager&&pluginManager.extensions?pluginManager.extensions('assetPreviewLoader'):[];
    const loader=loaders.find(item=>item&&typeof item.load==='function'&&typeof item.accepts==='function'&&item.accepts(asset));
    // Pawn Studio and Play must evaluate the same canonical object hierarchy.
    // An imported FBX remains useful as a rebuildable source, but previewing
    // it directly while Play loads its generated GLB produces different root
    // axes/bind poses on imperfect exports and makes authored slot transforms
    // appear offset. Prefer the exact GLB runtime path and use the source
    // loader only when that canonical build is unavailable.
    const hasCanonicalSource=!!(asset.dbKey||asset.src);
    const canonical=options&&options.animationSource&&hasCanonicalSource
      ?loadCanonicalAnimationSource(asset)
      :(STORE&&STORE.loadLogicElementAsset
        ?Promise.resolve(STORE.loadLogicElementAsset(asset)).then(model=>{if(model)model.userData=Object.assign({},model.userData,{lkPreviewSource:options&&options.animationSource?'canonical-glb-store-fallback':'canonical-glb'});return model;})
        :null);
    if(canonical)return canonical.catch(error=>{
      if(!loader)throw error;
      return Promise.resolve(loader.load(asset,{THREE:window.THREE,assetBlobs:window.LK_ASSET_BLOBS,STORE})).then(model=>{if(model)model.userData=Object.assign({},model.userData,{lkPreviewSource:loader.type||asset.sourceFormat||'source-fallback',lkCanonicalPreviewError:String(error&&error.message||error)});return model;});
    });
    if(loader)return Promise.resolve(loader.load(asset,{THREE:window.THREE,assetBlobs:window.LK_ASSET_BLOBS,STORE})).then(model=>{if(model)model.userData=Object.assign({},model.userData,{lkPreviewSource:loader.type||asset.sourceFormat||'source-fallback'});return model;});
    return Promise.reject(new Error('Asset preview loader unavailable'));
  }
  function applyCharacterPreviewAlignment(state){
    const model=state&&state.model;if(!model||!model.userData||!model.userData.lkPawnStudioAlignmentRoot||!window.THREE)return model;
    const alignment=characterModelAlignment(state.graph),rotation=alignment.rotation;
    model.position.set(alignment.position[0],alignment.position[1],alignment.position[2]);
    model.rotation.set(window.THREE.MathUtils.degToRad(rotation[0]),window.THREE.MathUtils.degToRad(rotation[1]),window.THREE.MathUtils.degToRad(rotation[2]));
    model.scale.set(alignment.scale[0],alignment.scale[1],alignment.scale[2]);model.updateMatrixWorld(true);return model;
  }
  function wrapCharacterPreviewModel(state,model){
    if(!model||!window.THREE||!(state.graph.characterPawn||state.graph.soccerPawn))return model;
    const root=new window.THREE.Group();root.name='Pawn Studio · Main Mesh Alignment';root.userData.lkPawnStudioAlignmentRoot=true;root.animations=Array.isArray(model.animations)?model.animations:[];root.add(model);state.model=root;applyCharacterPreviewAlignment(state);return root;
  }
  function loadMainModel(state,token){
    const ref=state.adapter.model?state.adapter.model(state.graph):null;
    clearPreviewModel(state);
    if(!ref){
      const isCharacter=state.adapter.id==='character'||state.adapter.id==='soccer';
      const placeholderRuntime=isCharacter&&window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
      const customVisual=typeof state.adapter.createPlaceholder==='function'?state.adapter.createPlaceholder({THREE:window.THREE,graph:state.graph,definition:state.definition}):null;
      const visual=customVisual||(placeholderRuntime&&placeholderRuntime.createVisual?placeholderRuntime.createVisual(window.THREE,state.definition&&state.definition.appearance):null);
      if(visual){
        state.model=visual;state.modelIsPlaceholder=true;state.scene.add(visual);
        const customController=customVisual&&typeof state.adapter.createPlaceholderController==='function'?state.adapter.createPlaceholderController({THREE:window.THREE,graph:state.graph,definition:state.definition,visual}):null;
        state.placeholderController=customController||(placeholderRuntime&&!customVisual?placeholderRuntime.createController({walkSpeed:state.definition&&state.definition.movement&&state.definition.movement.walkSpeed,runSpeed:state.definition&&state.definition.movement&&state.definition.movement.runSpeed}):null);
        if(state.placeholderController&&!state.placeholderController.bind(visual)){state.placeholderController.dispose();state.placeholderController=null;}
        if(state.currentMotion){lockPreviewRoot(state,visual);applyPreviewRigLock(state);refreshStudioTransformTarget(state);}
        state.previewStatus.textContent=isCharacter?tr('Procedural T-pose placeholder · assign Main Mesh to replace it','Placeholder procedurale in T-pose · assegna la Mesh principale per sostituirlo'):tr('Category placeholder · assign Main Mesh to replace it','Placeholder di categoria · assegna la Mesh principale per sostituirlo');
        framePreview(state);
        return Promise.resolve(visual);
      }
      state.previewStatus.textContent=tr('No main mesh assigned. Select Main Mesh to choose or import one.','Nessuna mesh principale assegnata. Seleziona Mesh principale per sceglierla o importarla.');
      return Promise.resolve(null);
    }
    state.previewStatus.textContent=tr('Loading main mesh…','Caricamento mesh principale…');
    return loadPreviewAsset(ref).then(model=>{
      if(previewStale(state,token)){disposeModel(model);return null;}
      const direct=model.userData&&model.userData.lkPreviewSource==='fbx-source';
      if(direct){const box=new window.THREE.Box3().setFromObject(model),size=box.getSize(new window.THREE.Vector3()),maxDim=Math.max(size.x,size.y,size.z),fit=Math.max(.1,Number(ref.fit)||1.9);if(maxDim>.0001){model.scale.multiplyScalar(fit/maxDim);const fitted=new window.THREE.Box3().setFromObject(model),center=fitted.getCenter(new window.THREE.Vector3());model.position.set(-center.x,-fitted.min.y,-center.z);}}
      const clips=model.animations||[],previewModel=wrapCharacterPreviewModel(state,model);
      state.model=previewModel;prepareModelBounds(state,previewModel);state.scene.add(previewModel);refreshStudioTransformTarget(state);state.previewStatus.textContent=(ref.name||'GLB')+' · '+clips.length+' clips'+(direct?' · '+tr('direct FBX source','sorgente FBX diretta'):'');framePreview(state);return previewModel;
    }).catch(error=>{
      if(previewStale(state,token))return null;
      state.previewStatus.textContent=tr('Model error: ','Errore modello: ')+String(error&&error.message||error);return null;
    });
  }
  function previewMainModel(state){ return loadMainModel(state,nextPreviewToken(state)); }
  function localeNumber(value,fallback){const text=String(value==null?'':value).trim().replace(',','.');if(!text)return fallback;const parsed=Number(text);return Number.isFinite(parsed)?parsed:fallback;}
  // TEMP DIAGNOSTIC — remove after scale investigation. Enable with window.LK_PAWN_STUDIO_DEBUG=true in the console.
  function psDebug(){if(typeof window!=='undefined'&&window.LK_PAWN_STUDIO_DEBUG)console.log.apply(console,['[PawnStudio]'].concat([].slice.call(arguments)));}
  function psBox(model){if(!model||!window.THREE)return null;model.updateMatrixWorld(true);const b=new window.THREE.Box3().setFromObject(model);if(b.isEmpty())return{empty:true};const s=b.getSize(new window.THREE.Vector3());return{sx:+s.x.toFixed(3),sy:+s.y.toFixed(3),sz:+s.z.toFixed(3),maxDim:+Math.max(s.x,s.y,s.z).toFixed(3)};}
  function psScale(model){return model&&model.scale?[+model.scale.x.toFixed(4),+model.scale.y.toFixed(4),+model.scale.z.toFixed(4)]:null;}
  function motionPreviewScale(entry){return Math.max(.0001,Math.min(100,localeNumber(entry&&entry.previewScale,1)));}
  function lockPreviewRoot(state,model){if(!state||!model)return;state.previewRootLock={position:model.position.clone(),quaternion:model.quaternion.clone(),scale:model.scale.clone()};const rig=new Map();if(model.traverse)model.traverse(node=>{if(node&&node.position&&node.scale)rig.set(node,{position:node.position.clone(),scale:node.scale.clone()});});state.previewRigLock=rig;}
  function applyPreviewRigLock(state){if(!state||!state.model)return;if(state.previewRigLock)state.previewRigLock.forEach((value,node)=>{node.position.copy(value.position);node.scale.copy(value.scale);});if(state.previewRootLock){state.model.position.copy(state.previewRootLock.position);state.model.quaternion.copy(state.previewRootLock.quaternion);state.model.scale.copy(state.previewRootLock.scale);applyPreviewMotionTransform(state);}state.model.updateMatrixWorld(true);}
  function applyMainMotionPreviewScale(model,entry,state){const factor=motionPreviewScale(entry);if(state)state.activePreviewScale=factor;if(model&&model.scale&&Math.abs(factor-1)>.000001)model.scale.multiplyScalar(factor);return factor;}
  function fitStandaloneMotionModel(state,model,entry){
    if(!model||!window.THREE)return 1;
    const THREE=window.THREE,main=state.adapter.model?state.adapter.model(state.graph):null,authored=characterModelElement(state.graph),uniform=main&&authored&&Array.isArray(authored.scale)?Math.max(.01,Number(authored.scale[0])||1):1,targetHeight=Math.max(.1,Number(main&&main.fit)||1.9)*uniform*motionPreviewScale(entry);
    model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),sourceHeight=Math.max(size.x,size.y,size.z);
    psDebug('fitStandaloneMotionModel',{targetHeight:+targetHeight.toFixed(3),sourceHeight:+sourceHeight.toFixed(3),boxSize:[+size.x.toFixed(3),+size.y.toFixed(3),+size.z.toFixed(3)],scaleBefore:psScale(model),willScaleBy:sourceHeight>1e-5?+(targetHeight/sourceHeight).toFixed(4):'SKIPPED(sourceHeight<=1e-5)'});
    if(sourceHeight>1e-5)model.scale.multiplyScalar(targetHeight/sourceHeight);
    model.updateMatrixWorld(true);const fitted=new THREE.Box3().setFromObject(model),center=fitted.getCenter(new THREE.Vector3());model.position.x-=center.x;model.position.y-=fitted.min.y;model.position.z-=center.z;psDebug('fitStandaloneMotionModel done',{scaleAfter:psScale(model),fittedBox:psBox(model)});return targetHeight;
  }
  function preparePreviewClip(clip,model,sourceModel,entry,previewOptions){
    const runtime=window.LK_RUNTIME_CHARACTER_LOCOMOTION||window.LK_RUNTIME_SOCCER_LOCOMOTION;
    const sourceValid=!clip||!clip.validate||clip.validate();
    if(!sourceValid)return {clip,binding:runtime&&runtime.analyzeClipBinding?runtime.analyzeClipBinding(clip,model):null,motion:runtime&&runtime.analyzeClipMotion?runtime.analyzeClipMotion(clip):null,mode:'direct',valid:false};
    if(runtime&&runtime.retargetClipToSkeleton){const setRuntime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET,lockRootYaw=!!(setRuntime&&setRuntime.lockRootYaw&&setRuntime.lockRootYaw(entry)),result=runtime.retargetClipToSkeleton(clip,model,sourceModel,{sourceOrientation:entry&&entry.sourceOrientation,protectSourceRig:previewOptions&&previewOptions.protectSourceRig===true,lockRootYaw});if(result){if(runtime.protectRuntimeMainMeshProportions)result.clip=runtime.protectRuntimeMainMeshProportions(result.clip);if(lockRootYaw&&runtime.lockClipRootYaw)result.clip=runtime.lockClipRootYaw(result.clip,model,window.THREE);result.valid=!result.clip||!result.clip.validate||result.clip.validate();if(result.valid&&result.clip&&result.clip.optimize)result.clip.optimize();return result;}}
    const prepared=runtime&&runtime.retargetClipNames?runtime.retargetClipNames(clip,model):clip;
    const binding=prepared&&prepared.userData&&prepared.userData.lkBinding||(runtime&&runtime.analyzeClipBinding?runtime.analyzeClipBinding(prepared,model):null),motion=runtime&&runtime.analyzeClipMotion?runtime.analyzeClipMotion(prepared):null;
    const valid=!prepared||!prepared.validate||prepared.validate();if(valid&&prepared&&prepared.optimize)prepared.optimize();return {clip:prepared,binding,motion,mode:'names',valid};
  }
  function findAnimationClip(clips,wanted,allowSoleFallback){const THREE=window.THREE,list=Array.isArray(clips)?clips:[],name=String(wanted||''),normalized=name.toLowerCase().replace(/[^a-z0-9]/g,''),exact=(THREE&&THREE.AnimationClip&&THREE.AnimationClip.findByName?THREE.AnimationClip.findByName(list,name):list.find(item=>item&&item.name===name)),partial=normalized&&list.find(item=>String(item&&item.name||'').toLowerCase().replace(/[^a-z0-9]/g,'').indexOf(normalized)>=0);return exact||partial||(allowSoleFallback&&list.length===1?list[0]:null)||null;}
  function proceduralMotionSlot(entry){
    const value=String(entry&&entry.action||entry&&entry.name||entry&&entry.clip||entry&&entry.state||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const slots=['strafeLeft','strafeRight','diveLeft','diveRight','celebrate','defeat','tackle','cross','shoot','pass','save','interact','jump','land','run','walk','idle'];
    const exact=slots.find(slot=>value.indexOf(slot.toLowerCase())>=0);if(exact)return exact;
    if(entry&&entry.state==='jump')return'jump';if(entry&&entry.state==='land')return'land';
    if(entry&&entry.state==='grounded'){const direction=Array.isArray(entry.direction)?entry.direction:[0,0],speed=Number(entry.speed)||0;if(Math.abs(direction[0])>.65)return direction[0]<0?'strafeLeft':'strafeRight';return speed<.15?'idle':(speed>3.2?'run':'walk');}
    return entry&&entry.state==='action'?'interact':'idle';
  }
  function bindingStatus(binding,motion,mode,retargetScale){
    if(!binding)return '';
    if(!binding.total)return ' · '+tr('clip has no animation tracks','la clip non contiene tracce di animazione');
    if(!binding.matched)return ' · '+tr('0/'+binding.total+' tracks bound: incompatible skeleton','0/'+binding.total+' tracce collegate: skeleton incompatibile');
    const movement=motion&&!motion.hasMotion?' · '+tr('tracks are static: no pose change in the clip','tracce statiche: la clip non cambia posa'):(motion?' · '+motion.animated+' '+tr('animated','animate'):'');
    const protectedRig=mode==='protected'?' · '+tr('Main Mesh proportions protected (rotation-only fallback)','proporzioni Main Mesh protette (fallback solo rotazioni)'):'';
    const scale=mode==='skeleton'&&Number.isFinite(Number(retargetScale))?' · '+tr('rig scale ','scala rig ')+Number(retargetScale).toFixed(3)+'×':'';
    const retargeted=mode==='skeleton'?' · '+tr('skeleton retargeted','skeleton retargetizzato')+scale:'';
    return ' · '+binding.matched+'/'+binding.total+' '+tr('tracks bound','tracce collegate')+movement+retargeted+protectedRig;
  }
  function previewMotion(state,entry){
    state.currentMotion=entry;if(state.playButton)state.playButton.classList.toggle('on',state.previewPlaying!==false);if(state.stopButton)state.stopButton.classList.toggle('on',state.previewPlaying===false);
    const token=nextPreviewToken(state);
    return loadMainModel(state,token).then(model=>{
      if(previewStale(state,token)||!model||!entry)return null;
      psDebug('previewMotion branch',{modelIsPlaceholder:state.modelIsPlaceholder,hasEntryAsset:!!entry.asset,mainModelScale:psScale(model),mainModelBox:psBox(model)});
      if(state.modelIsPlaceholder&&entry.asset){
        return loadPreviewAsset(entry.asset,{animationSource:true}).then(animationModel=>{
          if(previewStale(state,token)){disposeModel(animationModel);return null;}
          let hasMesh=false,hasBones=false;animationModel.traverse(node=>{if(node&&node.isMesh)hasMesh=true;if(node&&node.isBone)hasBones=true;});
          psDebug('previewMotion PATH B (standalone animation asset)',{hasMesh,hasBones,rawSourceBox:psBox(animationModel),rawSourceScale:psScale(animationModel)});
          if(hasMesh){
            clearPreviewModel(state);
            fitStandaloneMotionModel(state,animationModel,entry);state.model=animationModel;lockPreviewRoot(state,animationModel);applyPreviewRigLock(state);prepareModelBounds(state,animationModel);state.scene.add(animationModel);refreshStudioTransformTarget(state);
            const clips=animationModel.animations||[],wanted=String(entry.clip||''),clip=findAnimationClip(clips,wanted,true);
            if(clip){
              const THREE=window.THREE,prepared=preparePreviewClip(clip,animationModel,animationModel,entry,{protectSourceRig:true});
              if(prepared.valid===false)state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('invalid animation keyframes','keyframe animazione non validi');
              else {state.mixer=new THREE.AnimationMixer(animationModel);configurePreviewAction(state,state.mixer.clipAction(prepared.clip),entry);state.previewStatus.textContent=(entry.name||entry.clip)+' · '+clip.name+' · '+tr('source FBX/GLB preview','preview sorgente FBX/GLB')+bindingStatus(prepared.binding,prepared.motion,prepared.mode,prepared.retargetScale);}
            } else {
              // The converted file has a mesh but no matching (or no) clip.
              // Keep showing it in its bind pose instead of disposing it —
              // this is the only way to confirm an FBX->GLB conversion
              // actually produced a correct mesh/skeleton before chasing a
              // clip-name mismatch separately.
              state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('source FBX/GLB preview (no matching animation clip in this file)','preview sorgente FBX/GLB (nessuna clip di animazione corrispondente in questo file)');
            }
            framePreview(state);return animationModel;
          }
          if(hasBones&&window.THREE&&window.THREE.SkeletonHelper){
            clearPreviewModel(state);state.model=animationModel;lockPreviewRoot(state,animationModel);applyPreviewRigLock(state);state.scene.add(animationModel);refreshStudioTransformTarget(state);
            state.previewHelper=new window.THREE.SkeletonHelper(animationModel);state.previewHelper.material.depthTest=false;state.previewHelper.material.transparent=true;state.previewHelper.material.opacity=.92;state.scene.add(state.previewHelper);
            const clips=animationModel.animations||[],wanted=String(entry.clip||''),clip=findAnimationClip(clips,wanted,true);
            let binding=null,motion=null,mode='direct';if(clip){const prepared=preparePreviewClip(clip,animationModel,animationModel,entry,{protectSourceRig:true});binding=prepared.binding;motion=prepared.motion;mode=prepared.mode;if(prepared.valid!==false){state.mixer=new window.THREE.AnimationMixer(animationModel);configurePreviewAction(state,state.mixer.clipAction(prepared.clip),entry);}}
            state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('animation-only FBX/GLB · skeleton preview','FBX/GLB solo animazione · preview skeleton')+bindingStatus(binding,motion,mode);framePreview(state);return animationModel;
          }
          disposeModel(animationModel);
          state.placeholderMotion=entry;
          if(state.placeholderController)state.previewEntryReady=entry;
          if(entry.state==='action'&&state.placeholderController)state.placeholderController.playAction(entry.clip||entry.name,{loop:entry.loop===true});
          state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('animation source has no render mesh; procedural preview used','la sorgente animazione non contiene una mesh; uso preview procedurale');
          return null;
        });
      }
      if(state.modelIsPlaceholder&&state.placeholderController){
        state.placeholderMotion=entry;state.previewEntryReady=entry;
        if(entry.state==='action')state.placeholderController.playAction(entry.clip||entry.name,{loop:entry.loop===true});
        state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('procedural placeholder preview','preview placeholder procedurale');
        return null;
      }
      const external=!!entry.asset;
      const compatibility=external?skeletonCompatibility(libraryAssetForRef(state.adapter.model(state.graph))||state.adapter.model(state.graph),libraryAssetForRef(entry.asset)||entry.asset):null;
      const source=external?loadPreviewAsset(entry.asset,{animationSource:true}):Promise.resolve(model);
      return source.then(animationModel=>{
        if(previewStale(state,token)){if(external)disposeModel(animationModel);return null;}
        const clips=animationModel.animations||[],wanted=String(entry.clip||''),clip=findAnimationClip(clips,wanted,external);
        if(!clip){
          const fallback=window.LK_RUNTIME_MIXAMO_PLACEHOLDER_CLIPS,slot=proceduralMotionSlot(entry),generated=fallback&&fallback.createClip?fallback.createClip(window.THREE,model,slot,{role:state.definition&&state.definition.role||'character'}):null;
          if(generated){applyMainMotionPreviewScale(model,entry,state);lockPreviewRoot(state,model);state.mixer=new window.THREE.AnimationMixer(model);configurePreviewAction(state,state.mixer.clipAction(generated),entry);state.previewStatus.textContent=(entry.name||entry.clip||slot)+' · '+tr('generated humanoid placeholder on Main Mesh','placeholder umanoide generato sulla Main Mesh');if(external)disposeModel(animationModel);return model;}
          state.previewStatus.textContent=tr('Clip not found: ','Clip non trovata: ')+(wanted||'—');
          if(external)disposeModel(animationModel);return null;
        }
        psDebug('previewMotion PATH A (retarget onto main mesh)',{external,scaleBeforePreviewScale:psScale(model),previewScaleFactor:motionPreviewScale(entry),sourceBox:external?psBox(animationModel):'(main)'});
        applyMainMotionPreviewScale(model,entry,state);lockPreviewRoot(state,model);const THREE=window.THREE,prepared=preparePreviewClip(clip,model,external?animationModel:model,entry);applyPreviewRigLock(state);
        psDebug('PATH A retarget result',{mode:prepared.mode,retargetScale:prepared.retargetScale,scaleAfterPreviewScale:psScale(model),mainModelBoxAfter:psBox(model)});
        if(prepared.valid===false){state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('invalid animation keyframes','keyframe animazione non validi');if(external)disposeModel(animationModel);return model;}
        state.mixer=new THREE.AnimationMixer(model);configurePreviewAction(state,state.mixer.clipAction(prepared.clip),entry);
        state.previewStatus.textContent=(entry.name||entry.clip)+' · '+clip.name+bindingStatus(prepared.binding,prepared.motion,prepared.mode,prepared.retargetScale)+(compatibility&&compatibility.status==='incompatible'&&prepared.mode!=='skeleton'?' · '+tr('incompatible skeleton','skeleton incompatibile'):'');
        if(external)disposeModel(animationModel);
        return model;
      });
    });
  }
  function framePreview(state){if(!state.model||!window.THREE)return;state.model.updateMatrixWorld(true);(state.skinnedMeshes||[]).forEach(mesh=>{if(mesh.computeBoundingBox)mesh.computeBoundingBox();if(mesh.computeBoundingSphere)mesh.computeBoundingSphere();});const THREE=window.THREE,box=new THREE.Box3().setFromObject(state.model);if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),radius=Math.max(.5,size.length()*.55),direction=new THREE.Vector3(1,.55,1).normalize();state.camera.position.copy(center).addScaledVector(direction,radius*2.15);state.camera.near=Math.max(.01,radius/100);state.camera.far=Math.max(100,radius*20);state.camera.updateProjectionMatrix();if(state.controls){state.controls.target.copy(center);state.controls.update();}else state.camera.lookAt(center);}

  // The grip panel is rendered from two places (the Weapon Grip container and
  // every Motion slot) so the numbers and the dummies are never two different
  // stories about the same weapon.
  function renderGripEditor(state,root,persist,translate,field,note){
    if(!(state.graph.characterPawn||state.graph.soccerPawn)){note(translate('Weapon grip authoring applies to character Pawns.','L’impugnatura arma si applica ai Pawn character.'));return null;}
    if(!gripWeaponEntries(state.definition).length)weaponConfigFor(state.definition,true);
    const entries=gripWeaponEntries(state.definition),selected=entries.find(entry=>entry.key===state.gripWeaponKey)||entries[0];
    if(selected)state.gripWeaponKey=selected.key;
    const grip=stateWeaponGripConfig(state,true);
    if(entries.length){
      const weaponSelect=field(translate('Weapon to test','Arma da provare'),state.gripWeaponKey,'select',value=>selectGripWeapon(state,value),entries.map(entry=>entry.key));
      Array.from(weaponSelect.options).forEach(option=>{const entry=entries.find(item=>item.key===option.value);if(entry)option.textContent=entry.label+(entry.key==='primary'?translate(' · starting',' · iniziale'):translate(' · loadout',' · equipaggiamento'));});
    }
    const contextValues=gripContextOptions(),contextSelect=field(translate('Grip state to author','Stato impugnatura da modificare'),state.gripContextKey,'select',value=>{selectGripContext(state,value);persist();if(state.refreshProperties)state.refreshProperties();},contextValues);
    const gaitNames={idle:translate('Idle','Fermo'),walk:translate('Walk','Cammino'),run:translate('Run','Corsa')},modeNames={hip:translate('Hip / not aiming','Senza mira'),aim:translate('Aiming','Mirando')},sideNames={right:translate('right side','lato destro'),left:translate('left side','lato sinistro')};
    Array.from(contextSelect.options).forEach(option=>{const spec=gripContextSpec(option.value);option.textContent=spec?modeNames[spec.mode]+' · '+gaitNames[spec.gait]+' · '+sideNames[spec.side]:translate('Base fallback · all unspecified states','Presa base · fallback per gli stati non impostati');});
    note(state.gripContextKey==='base'?translate('You are editing the fallback inherited by every state that has no override.','Stai modificando il fallback ereditato da ogni stato senza override.'):translate('This state override is isolated. Hip and Aim blend with the live trigger value in Play.','Questo override di stato è isolato. Senza mira e Mira si fondono usando il valore reale del trigger in Play.'));
    const handsLabels={
      single:translate('Single hand · sidearm, one-handed','Una mano · pistola, a una mano'),
      double:translate('Double hand · rifle with foregrip','Due mani · fucile con impugnatura anteriore'),
      thrown:translate('Thrown · grenade in the active hand','Da lancio · granata nella mano attiva'),
      unarmed:translate('Unarmed · fists','Disarmato · pugni'),
    };
    const handsSelect=field(translate('Hands on the weapon','Mani sull’arma'),grip.hands,'select',value=>{setGripHands(state,value);persist();if(state.refreshProperties)state.refreshProperties();},GRIP_HANDS.slice());
    Array.from(handsSelect.options).forEach(option=>{option.textContent=handsLabels[option.value]||option.value;});
    const supportLabels={auto:translate('Automatic · follow weapon type','Automatico · segue il tipo di arma'),on:translate('Enabled · pose the support arm','Attiva · posa il braccio di supporto'),off:translate('Disabled · keep the arm free','Disattiva · lascia libero il braccio')};
    const supportSelect=field(translate('Support hand','Mano di supporto'),grip.supportHand,'select',value=>{setGripSupportHand(state,value);persist();if(state.refreshProperties)state.refreshProperties();},GRIP_SUPPORT_MODES.slice());
    Array.from(supportSelect.options).forEach(option=>{option.textContent=supportLabels[option.value]||option.value;});
    const dummyButton=document.createElement('button');dummyButton.type='button';dummyButton.className='lk-ps-action'+(state.gripMode?' primary':'');
    dummyButton.textContent=state.gripMode?translate('✊ Hand dummies active · click to finish','✊ Dummy delle mani attivi · clic per terminare'):translate('✊ Place the hands with dummies','✊ Posiziona le mani con i dummy');
    dummyButton.addEventListener('click',()=>{setGripMode(state,!state.gripMode);if(state.refreshProperties)state.refreshProperties();});root.appendChild(dummyButton);
    const weaponGizmo=document.createElement('button');weaponGizmo.type='button';weaponGizmo.className='lk-ps-action'+(state.gripWeaponEditMode?' primary':'');weaponGizmo.disabled=!state.gripMode;weaponGizmo.textContent=state.gripWeaponEditMode?translate('🔫 Weapon gizmo active','🔫 Gizmo arma attivo'):translate('🔫 Edit weapon position / rotation','🔫 Modifica posizione / rotazione arma');weaponGizmo.addEventListener('click',()=>{state.gripWeaponEditMode=!state.gripWeaponEditMode;refreshStudioTransformTarget(state);updateGripButton(state);renderProperties(state,state.selected,persist,assetLibraryLoad,importAssetFiles,translate);});root.appendChild(weaponGizmo);
    const vector=(label,array,step,suffix)=>['X','Y','Z'].forEach((axis,index)=>{
      const input=field(label+' '+axis+(suffix||''),array[index],'number',value=>{array[index]=localeNumber(value,0);persist();if(state.gripMode)syncGripDummies(state);});
      input.step=step;
    });
    const activeWeapon=gripWeaponForState(state,false),double=gripSupportActive(state.definition,grip,activeWeapon);
    // An unauthored additive layer is not "no movement" — the runtime substitutes
    // the weapon's own offset for it. Say so with the actual numbers, or the
    // author reads a row of zeros as a promise the game does not keep and starts
    // compensating in the hold, which breaks the pose they had right.
    const inherited=(label,layer,hand)=>{
      const offset=inheritedGripLayer(state.definition,grip,layer,hand,activeWeapon);if(!offset)return;
      const metres=offset.map(value=>Number(value).toFixed(2)).join(', ');
      note(translate(label+' is not authored, so the game applies this weapon\'s own default: '+metres+' m. Drag the dummy in this layer to take it over.',
        label+' non è impostato, quindi il gioco applica il valore predefinito di quest\'arma: '+metres+' m. Trascina il dummy in questo layer per sostituirlo.'));
    };
    vector(translate('Trigger hand · position','Mano grilletto · posizione'),grip.trigger.position,.01,' m');
    vector(translate('Trigger hand · rotation','Mano grilletto · rotazione'),grip.trigger.rotation,1,'°');
    vector(translate('Support hand · position','Mano supporto · posizione'),grip.support.position,.01,' m');
    vector(translate('Support hand · rotation','Mano supporto · rotazione'),grip.support.rotation,1,'°');
    vector(translate('Aiming offset · trigger','Offset mira · grilletto'),grip.aim.trigger,.01,' m');
    vector(translate('Aiming offset · support','Offset mira · supporto'),grip.aim.support,.01,' m');
    vector(translate('Firing offset · trigger','Offset fuoco · grilletto'),grip.fire.trigger,.01,' m');
    vector(translate('Firing offset · support','Offset fuoco · supporto'),grip.fire.support,.01,' m');
    const fingers=grip.fingers||(grip.fingers=normalizedGripFingers(null)),fingerNames={thumb:translate('Thumb','Pollice'),index:translate('Index','Indice'),middle:translate('Middle','Medio'),ring:translate('Ring','Anulare'),pinky:translate('Pinky','Mignolo')};
    ['trigger','support'].forEach(hand=>{
      const fingerHeading=document.createElement('div');fingerHeading.className='lk-ps-property-head';fingerHeading.innerHTML='<b></b><span></span>';fingerHeading.querySelector('b').textContent=hand==='trigger'?translate('Trigger-hand fingers','Dita mano grilletto'):translate('Support-hand fingers','Dita mano supporto');fingerHeading.querySelector('span').textContent=translate('0 open · 1 wrapped','0 aperte · 1 chiuse');root.appendChild(fingerHeading);
      GRIP_FINGERS.forEach(name=>{const input=field(fingerNames[name],fingers[hand][name],'range',value=>{fingers[hand][name]=Math.max(0,Math.min(1,Number(value)||0));persist();if(state.gripMode){restoreGripPose(state);applyGripPose(state);}});input.min=0;input.max=1;input.step=.01;});
    });
    const fingerRuntime=window.LK_RUNTIME_CHARACTER_WEAPON_POSE,fingerRig=fingerRuntime&&fingerRuntime.classifyBones&&state.model?fingerRuntime.classifyBones(state.model):null,fingerBoneCount=['left','right'].reduce((total,side)=>total+GRIP_FINGERS.reduce((sum,name)=>sum+((fingerRig&&fingerRig[side]&&fingerRig[side].fingers&&fingerRig[side].fingers[name]||[]).length),0),0);
    if(state.model&&fingerBoneCount===0)note(translate('This rig exposes no recognized finger chains. Values remain saved and degrade safely, but live finger preview needs Mixamo/common Blender finger names or a compatible mapped rig.','Questo rig non espone catene dita riconosciute. I valori restano salvati e degradano senza errori, ma la preview live richiede nomi dita Mixamo/Blender comuni o un rig mappato compatibile.'));
    const socketHeading=document.createElement('div');socketHeading.className='lk-ps-property-head';socketHeading.innerHTML='<b></b><span></span>';
    socketHeading.querySelector('b').textContent=translate('Weapon → Trigger Hand Socket','Socket arma → mano grilletto');
    socketHeading.querySelector('span').textContent=translate('Pawn rig · saved','Rig Pawn · salvato');root.appendChild(socketHeading);
    const socket=weaponSocketConfig(state.definition,true),handBones=editableRigBones(state).filter(bone=>/hand/i.test(String(bone.name||''))).map(bone=>bone.name),boneOptions=[''].concat(Array.from(new Set(handBones)));
    if(socket.bone&&!boneOptions.includes(socket.bone))boneOptions.push(socket.bone);
    const boneSelect=field(translate('Trigger attachment bone','Bone di aggancio grilletto'),socket.bone,'select',value=>{socket.bone=value;persist();},boneOptions);
    Array.from(boneSelect.options).forEach(option=>{if(!option.value)option.textContent=translate('Auto · actual trigger hand','Automatico · vera mano grilletto');});
    field(translate('Follow animated hand rotation','Segui rotazione animata della mano'),socket.followHandRotation,'checkbox',value=>{socket.followHandRotation=value;persist();syncGripWeaponPreview(state);});
    ['X','Y','Z'].forEach((axis,index)=>{const input=field(translate('Weapon socket offset '+axis+' (m)','Offset socket arma '+axis+' (m)'),socket.offset[index],'number',value=>{socket.offset[index]=localeNumber(value,0);persist();syncGripWeaponPreview(state);});input.step=.01;});
    ['X','Y','Z'].forEach((axis,index)=>{const degrees=window.THREE?window.THREE.MathUtils.radToDeg(socket.rotation[index]):socket.rotation[index]*180/Math.PI,input=field(translate('Weapon socket rotation '+axis+' (deg)','Rotazione socket arma '+axis+' (gradi)'),Number(degrees.toFixed(3)),'number',value=>{socket.rotation[index]=(Number(value)||0)*Math.PI/180;persist();syncGripWeaponPreview(state);});input.step=1;});
    const socketScale=field(translate('Carried weapon scale','Scala arma impugnata'),socket.scale,'number',value=>{socket.scale=Math.max(.05,Math.min(20,Number(value)||1));persist();syncGripWeaponPreview(state);});socketScale.min=.05;socketScale.max=20;socketScale.step=.01;
    field(translate('Show socket axes in Play','Mostra assi socket in Play'),socket.showHelper,'checkbox',value=>{socket.showHelper=value;persist();});
    const resetSocket=document.createElement('button');resetSocket.type='button';resetSocket.className='lk-ps-action';resetSocket.textContent=translate('Reset trigger-hand socket','Ripristina socket mano grilletto');resetSocket.addEventListener('click',()=>{state.definition.firstPerson.weaponSocket={bone:'',offset:[0,0,0],rotation:[0,0,0],scale:1,followHandRotation:true,showHelper:false};persist();syncGripWeaponPreview(state);if(state.refreshProperties)state.refreshProperties();});root.appendChild(resetSocket);
    inherited(translate('The aiming offset for the trigger hand','L\'offset di mira della mano sul grilletto'),'aim','trigger');
    inherited(translate('The aiming offset for the support hand','L\'offset di mira della mano di supporto'),'aim','support');
    inherited(translate('The firing offset for the trigger hand','L\'offset di fuoco della mano sul grilletto'),'fire','trigger');
    inherited(translate('The firing offset for the support hand','L\'offset di fuoco della mano di supporto'),'fire','support');
    if(!double)note(translate('The support hand is currently inactive in Play, but it remains editable. Set Support hand to Enabled to preview that arm on this weapon.','La mano di supporto al momento è inattiva in Play, ma resta modificabile. Imposta Mano di supporto su Attiva per vedere anche quel braccio su quest’arma.'));
    const reset=document.createElement('button');reset.type='button';reset.className='lk-ps-action';reset.textContent=gripContextSpec(state.gripContextKey)?translate('Remove this state override','Rimuovi override di questo stato'):translate('Reset grip to preset','Ripristina impugnatura predefinita');
    reset.addEventListener('click',()=>{resetGripToPreset(state);persist();});root.appendChild(reset);
    note(translate('Values are metres from the eye, in the character\'s own frame: X towards the weapon hand, Y up, Z straight ahead. Rotation is in degrees. The eye sits at '+gripEyeHeight(state.definition).toFixed(2)+' m, the same height the game uses.','I valori sono metri dall’occhio, nel sistema del personaggio: X verso la mano dell’arma, Y in alto, Z avanti. La rotazione è in gradi. L’occhio è a '+gripEyeHeight(state.definition).toFixed(2)+' m, la stessa altezza usata dal gioco.'));
    note(translate('Aiming and firing offsets are ADDED to the hold. An untouched offset inherits this weapon\'s default instead of meaning "no movement" — to author no movement at all, drag that layer\'s dummy back onto the hold, which stores the answer explicitly. The hold also carries the hand rotation; the additive layers are position only.','Gli offset di mira e fuoco vengono SOMMATI alla presa. Un offset non toccato eredita il valore predefinito di quest\'arma, non significa "nessun movimento" — per impostare nessun movimento, trascina il dummy di quel layer di nuovo sulla presa: la risposta viene salvata esplicitamente. La presa porta anche la rotazione della mano; i layer additivi sono solo posizione.'));
    note(translate('The grip belongs to the weapon, so every motion that holds it uses these same hands. Play reads it through the same layer this preview runs.','L’impugnatura appartiene all’arma, quindi ogni movimento che la tiene usa le stesse mani. Play la legge tramite lo stesso layer usato da questa preview.'));
    note(translate('The weapon preview is owned only by the gold trigger-hand dummy and points along that hand. The blue support hand is an IK contact and can never move or rotate the weapon. In Play the real trigger hand is copied without inheriting skeleton scale; the editable socket fields above are applied afterwards and saved in the Pawn.','L’anteprima dell’arma appartiene soltanto al dummy dorato della mano sul grilletto e punta secondo quella mano. La mano blu di supporto è solo un contatto IK e non può mai muovere o ruotare l’arma. In Play viene copiata la vera mano sul grilletto senza ereditare la scala dello skeleton; i valori socket modificabili sopra vengono applicati dopo e salvati nel Pawn.'));
    return grip;
  }
  function renderProperties(state,container,persist,loadAssets,importFiles,translate){
    const root=state.properties,definition=state.definition;root.innerHTML='';const heading=document.createElement('div');heading.className='lk-ps-property-head';heading.innerHTML='<b></b><span></span>';heading.querySelector('b').textContent=container.label||container.id;heading.querySelector('span').textContent=container.badge||container.kind||'';root.appendChild(heading);
    const note=text=>{const item=document.createElement('div');item.className='lk-ps-note';item.textContent=text;root.appendChild(item);};
    const field=(label,value,type,onChange,options)=>{const row=document.createElement('label');row.className='lk-ps-field';const caption=document.createElement('span');caption.textContent=label;let input;if(type==='select'){input=document.createElement('select');(options||[]).forEach(option=>input.appendChild(new Option(String(option),String(option))));input.value=value==null?'':String(value);}else{input=document.createElement('input');input.type=type||'text';input.value=value==null?'':value;}const read=()=>type==='number'||type==='range'?Number(input.value):(type==='checkbox'?input.checked:input.value);input.addEventListener('change',()=>onChange(read()));if(type==='range')input.addEventListener('input',()=>onChange(read()));if(type==='checkbox')input.checked=value===true;row.append(caption,input);root.appendChild(row);return input;};
    if(typeof container.render==='function'){container.render({root,state,definition,graph:state.graph,persist,field,note,assetLibraryLoad:loadAssets,importAssetFiles:importFiles,tr:translate,previewMainModel:()=>previewMainModel(state)});return;}
    if(container.kind==='overview'){
      note(translate('One authoritative workspace for this Pawn: asset hierarchy, physical configuration and preview are saved back into the Logic Element.','Un unico workspace autorevole per questo Pawn: gerarchia asset, configurazione fisica e preview vengono salvati nel Logic Element.'));
      const cards=document.createElement('div');cards.className='lk-ps-summary';[['Type',state.adapter.label],['Main mesh',state.adapter.model(state.graph)?'assigned':'missing'],['Containers',String((state.containers||[]).length)],['Schema',String(definition.schemaVersion||1)]].forEach(item=>{const card=document.createElement('div');card.innerHTML='<small></small><b></b>';card.querySelector('small').textContent=item[0];card.querySelector('b').textContent=item[1];cards.appendChild(card);});root.appendChild(cards);return;
    }
    if(container.kind==='model'){
      const assets=loadAssets().filter(asset=>asset&&asset.kind==='glb'),current=state.adapter.model(state.graph),currentId=assetId(current),modelOptions=[''].concat(assets.map(asset=>assetId(asset)));if(currentId&&!modelOptions.includes(currentId))modelOptions.push(currentId);const select=field(translate('Main mesh asset','Asset mesh principale'),currentId,'select',value=>{if(!value){resetPawnModel(state);persist();previewMainModel(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);return;}const asset=assets.find(item=>assetId(item)===value);if(!asset)return;assignPawnModel(state,asset);persist();previewMainModel(state);},modelOptions);
      Array.from(select.options).forEach(option=>{if(!option.value){option.textContent=translate('Built-in T-pose placeholder','Placeholder T-pose integrato');return;}const asset=assets.find(item=>assetId(item)===option.value);option.textContent=asset?(asset.name||asset.source||option.value)+(asset.sourceFormat==='fbx'?' · FBX → GLB':''):(current&&current.name||option.value);});
      if(current&&current.sourceFormat==='fbx')note(translate('Pawn Studio, Play and portable export use the same canonical GLB build. The original FBX remains linked for rebuilding and source diagnostics.','Pawn Studio, Play ed export portabile usano la stessa build GLB canonica. L’FBX originale resta collegato per ricompilazione e diagnostica della sorgente.'));
      if(current&&(state.graph.characterPawn||state.graph.soccerPawn)){
        const modelElement=characterModelElement(state.graph),targetHeight=Math.max(.1,Number(current.fit)||1.9),uniform=modelElement&&Array.isArray(modelElement.scale)?Math.max(.01,Number(modelElement.scale[0])||1):1;
        const heightInput=field(translate('Normalized character height (m)','Altezza normalizzata personaggio (m)'),targetHeight,'number',value=>{const fit=Math.max(.1,Math.min(20,Number(value)||1.9));state.definition.model.fit=fit;if(modelElement){modelElement.asset=clone(state.definition.model);modelElement.asset.fit=fit;}persist();previewMainModel(state);});heightInput.min=.1;heightInput.max=20;heightInput.step=.05;
        const scaleInput=field(translate('Uniform world scale','Scala uniforme nel mondo'),uniform,'number',value=>{const scale=Math.max(.01,Math.min(20,Number(value)||1));if(modelElement)modelElement.scale=[scale,scale,scale];persist();previewMainModel(state);});scaleInput.min=.01;scaleInput.max=20;scaleInput.step=.01;
        note(translate('Height normalizes differently authored files to metres. World scale is the final multiplier used in the editor, Play Preview and export.','L’altezza normalizza in metri file creati con scale differenti. La scala nel mondo è il moltiplicatore finale usato in editor, Play Preview ed export.'));
        if(modelElement){
          const alignment=characterModelAlignment(state.graph);modelElement.position=alignment.position.slice();modelElement.rotation=alignment.rotation.slice();
          const slider=(label,array,index,min,max,step,suffix)=>{const row=document.createElement('label');row.className='lk-ps-field lk-ps-slider-field';const caption=document.createElement('span');caption.textContent=label;const controls=document.createElement('span');controls.className='lk-ps-slider-control';const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=array[index];const output=document.createElement('output');const show=()=>{output.textContent=Number(input.value).toFixed(step<1?1:0)+(suffix||'');};input.addEventListener('input',()=>{array[index]=Number(input.value)||0;show();applyCharacterPreviewAlignment(state);});input.addEventListener('change',()=>persist());show();controls.append(input,output);row.append(caption,controls);root.appendChild(row);return input;};
          note(translate('Global Main Mesh alignment is applied outside the skeleton. Use it to correct a consistently leaning or floating rig without editing every animation.','L’allineamento globale della Mesh principale viene applicato fuori dallo skeleton. Usalo per correggere un rig sempre inclinato o sospeso senza modificare ogni animazione.'));
          slider(translate('Ground offset Y','Offset da terra Y'),modelElement.position,1,-2,2,.01,' m');
          slider(translate('Forward/back tilt (Pitch X)','Inclinazione avanti/indietro (Pitch X)'),modelElement.rotation,0,-45,45,.1,'°');
          slider(translate('Facing direction (Yaw Y)','Direzione frontale (Yaw Y)'),modelElement.rotation,1,-180,180,.5,'°');
          slider(translate('Side tilt (Roll Z)','Inclinazione laterale (Roll Z)'),modelElement.rotation,2,-45,45,.1,'°');
          const alignmentActions=document.createElement('div');alignmentActions.className='lk-ps-actions';const resetAlignment=document.createElement('button');resetAlignment.type='button';resetAlignment.textContent=translate('Reset mesh alignment','Ripristina allineamento mesh');resetAlignment.addEventListener('click',()=>{modelElement.position=[0,0,0];modelElement.rotation=[0,0,0];persist();previewMainModel(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);});alignmentActions.appendChild(resetAlignment);root.appendChild(alignmentActions);
        }
      }
      const actions=document.createElement('div');actions.className='lk-ps-actions';const button=document.createElement('button');button.type='button';button.textContent=translate('Import GLB / FBX…','Importa GLB / FBX…');button.addEventListener('click',()=>{const input=document.createElement('input');input.type='file';input.accept='.glb,.gltf,.fbx,image/*,.tga';input.multiple=true;input.addEventListener('change',()=>{importFiles(Array.from(input.files||[])).then(imported=>{const asset=(imported||[]).find(item=>item&&item.kind==='glb');if(asset){assignPawnModel(state,asset);persist();previewMainModel(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);}});},{once:true});input.click();});const reset=document.createElement('button');reset.type='button';reset.className='danger';reset.disabled=!current;reset.textContent=translate('Reset to T-pose','Ripristina T-pose');reset.addEventListener('click',()=>{resetPawnModel(state);persist();previewMainModel(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);status(translate('Main mesh reset. Motion Set preserved.','Mesh principale ripristinata. Motion Set conservato.'));});actions.append(button,reset);root.appendChild(actions);note(translate('Choose the authoritative render mesh, or return to the built-in T-pose at any time. Resetting the mesh preserves the complete Motion Animation Set.','Scegli la mesh di rendering autorevole oppure torna in qualsiasi momento alla T-pose integrata. Il ripristino della mesh conserva l’intero Motion Animation Set.'));return;
    }
    if(container.kind==='skeleton'){const main=libraryAssetForRef(state.adapter.model(state.graph))||state.adapter.model(state.graph);note(translate('Main Mesh skeleton: ','Skeleton Mesh principale: ')+(main&&Array.isArray(main.boneNames)&&main.boneNames.length?main.boneNames.length+translate(' named bones',' ossa nominate'):translate('metadata unavailable','metadati non disponibili')));note(translate('Each Motion source is compared by normalized bone names. When both files contain real skeletons, Pawn Studio retargets the take through Three.js and reports it explicitly; unknown or incompatible rigs remain visible as diagnostics.','Ogni sorgente Motion viene confrontata tramite i nomi normalizzati delle ossa. Quando entrambi i file contengono skeleton reali, Pawn Studio retargetizza la take tramite Three.js e lo segnala esplicitamente; rig sconosciuti o incompatibili restano visibili come diagnostica.'));return;}
    if(container.kind==='weapon-grip'){
      note(translate('Choose how the weapon is held and place the two hands. ✊ Hands opens draggable dummies in the viewport: the gold dummy is the trigger hand, the blue one the support hand, and the arms follow them live.','Scegli come viene impugnata l’arma e posiziona le due mani. ✊ Mani apre i dummy trascinabili nel viewport: il dummy dorato è la mano sul grilletto, quello blu la mano di supporto, e le braccia li seguono in tempo reale.'));
      renderGripEditor(state,root,persist,translate,field,note);
      return;
    }
    if(container.kind==='camera-rig'){
      const fp=studioCameraConfig(definition);state.cameraEditTarget=state.cameraEditTarget==='first'?'first':'third';const target=state.cameraEditTarget==='first'?fp:fp.thirdPerson;
      const targetSelect=field(translate('Camera dummy','Dummy camera'),state.cameraEditTarget,'select',value=>selectCameraTarget(state,value),['third','first']);state.cameraTargetSelect=targetSelect;Array.from(targetSelect.options).forEach(option=>{option.textContent=option.value==='first'?translate('First Person · blue','Prima Persona · blu'):translate('Third Person · gold','Terza Persona · dorata');});
      const number=(label,object,key,min,max,step)=>{const input=field(label,object[key],'number',value=>{object[key]=Math.max(min,Math.min(max,Number(value)||0));input.value=object[key];persist();syncCameraDummies(state);});input.min=min;input.max=max;input.step=step;return input;};
      if(state.cameraEditTarget==='first'){
        field(translate('Automatic Head-bone height','Altezza automatica dal bone testa'),fp.autoEyeHeight!==false,'checkbox',value=>{fp.autoEyeHeight=value;persist();syncCameraDummies(state);});
        number(translate('Camera height / eye height (m)','Altezza camera / occhi (m)'),fp,'eyeHeight',.2,4,.01);
        number(translate('Head bone → eyes offset (m)','Offset bone testa → occhi (m)'),fp,'eyeBoneOffset',-.3,.5,.01);
        number(translate('Forward face clearance (m)','Distanza avanti dal viso (m)'),fp,'bodyEyeForward',.18,.6,.01);
        number(translate('Lateral eye offset (m)','Offset laterale camera (m)'),fp,'bodyEyeSide',-.5,.5,.01);
        number(translate('FOV','FOV'),fp,'fov',20,130,1);number(translate('Aim FOV','FOV mira'),fp,'fovAds',20,130,1);number(translate('Sprint FOV','FOV corsa'),fp,'fovSprint',20,130,1);
        number(translate('Manual focus distance (m)','Distanza focus manuale (m)'),fp,'focusDistance',.25,200,.25);number(translate('Near clipping plane (m)','Piano clipping vicino (m)'),fp,'near',.02,.5,.01);
        note(translate('Moving the blue dummy authors the exact eye height, lateral offset and forward face clearance used in Play. A manual Move disables automatic Head-bone height so the saved dummy remains authoritative.','Muovere il dummy blu salva l’altezza occhi, l’offset laterale e la distanza avanti dal viso esatti usati in Play. Un movimento manuale disattiva l’altezza automatica dal bone testa, così il dummy salvato resta autorevole.'));
      }else{
        number(translate('Camera distance (m)','Distanza camera (m)'),target,'distance',.4,14,.05);number(translate('Camera height (m)','Altezza camera (m)'),target,'height',.1,4,.01);number(translate('Shoulder offset (m)','Offset spalla (m)'),target,'shoulder',-3,3,.01);number(translate('Pivot forward (m)','Pivot in avanti (m)'),target,'pivotForward',-2,2,.01);
        number('FOV',target,'fov',20,130,1);number(translate('Aim FOV','FOV mira'),target,'fovAds',20,130,1);number(translate('Manual focus distance (m)','Distanza focus manuale (m)'),target,'focusDistance',.25,200,.25);number(translate('Near clipping plane (m)','Piano clipping vicino (m)'),target,'near',.02,.5,.01);
        number(translate('Camera collision radius (m)','Raggio collisione camera (m)'),target,'collisionRadius',.05,2,.01);number(translate('Minimum distance from body (m)','Distanza minima dal corpo (m)'),target,'minimumBodyDistance',.25,1.5,.01);
        const collision=field(translate('Collision response','Risposta collisione'),target.collisionMode||'fixed','select',value=>{target.collisionMode=value==='pull-in'?'pull-in':'fixed';persist();},['fixed','pull-in']);Array.from(collision.options).forEach(option=>{option.textContent=option.value==='fixed'?translate('Collision-safe snap · no breathing','Scatto anti-collisione · nessun respiro'):translate('Spring pull-in / ease-out','Rientro elastico / uscita morbida');});
        note(translate('The gold dummy is the neutral Play camera. Fixed keeps the authored framing whenever clear but now snaps to a collision-safe distance instead of entering geometry. If a wall leaves less room than the Character body, output uses the safe forward eye point until the arm clears.','Il dummy dorato è la camera neutra di Play. Fissa mantiene l’inquadratura salvata quando libera, ma ora scatta a una distanza anti-collisione invece di entrare nella geometria. Se un muro lascia meno spazio del corpo del Character, l’output usa temporaneamente il punto occhi sicuro davanti al viso finché il braccio camera torna libero.'));
      }
      const actions=document.createElement('div');actions.className='lk-ps-actions';const selectDummy=document.createElement('button');selectDummy.type='button';selectDummy.className='lk-ps-action primary';selectDummy.textContent=translate('◉ Select camera dummy','◉ Seleziona dummy camera');selectDummy.addEventListener('click',()=>selectCameraTarget(state,state.cameraEditTarget));const reset=document.createElement('button');reset.type='button';reset.className='lk-ps-action';reset.textContent=translate('Reset selected camera','Ripristina camera selezionata');reset.addEventListener('click',()=>{if(state.cameraEditTarget==='first'){Object.assign(fp,{eyeHeight:1.62,autoEyeHeight:true,eyeBoneOffset:.08,bodyEyeForward:.28,bodyEyeSide:0,fov:78,fovAds:52,fovSprint:84,focusDistance:9,near:.14,cameraSafetyVersion:1});}else Object.assign(fp.thirdPerson,{distance:3.3,height:1.5,shoulder:.62,pivotForward:.18,fov:68,fovAds:52,focusDistance:9,near:.1,collisionMode:'fixed',collisionRadius:.34,minimumBodyDistance:.55});persist();syncCameraDummies(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);});actions.append(selectDummy,reset);root.appendChild(actions);
      return;
    }
    if(container.kind==='vehicle-seating'){
      if(state.seatingShowHelpers==null)state.seatingShowHelpers=true;const settings=seatingSettings(definition),assets=loadAssets(),builtinOptions=SEATING_VEHICLES.map(item=>item.key),assetRows=seatingAssetRows(definition,assets,translate,activeLevelPlayerAsset(STORE)),options=builtinOptions.concat(assetRows.map(item=>item.key));
      if(settings.editorProfile&&!options.includes(settings.editorProfile))options.push(settings.editorProfile);
      field(translate('Show Character while occupied','Mostra Character quando occupato'),settings.enabled!==false,'checkbox',value=>{settings.enabled=value;persist();});
      const vehicleSelect=field(translate('Vehicle profile to author','Profilo veicolo da modificare'),settings.editorProfile,'select',value=>{const builtin=SEATING_VEHICLES.find(item=>item.key===value),custom=assetRows.find(item=>item.key===value);settings.editorProfile=value;seatingProfile(definition,value,builtin&&seatingVehicleAsset(builtin)||custom&&custom.asset);persist();renderProperties(state,container,persist,loadAssets,importFiles,translate);previewVehicleSeating(state);},options);
      Array.from(vehicleSelect.options).forEach(option=>{const builtin=SEATING_VEHICLES.find(item=>item.key===option.value),custom=assetRows.find(item=>item.key===option.value);option.textContent=builtin?builtin.label:(custom?custom.label:option.value);});
      const builtin=SEATING_VEHICLES.find(item=>item.key===settings.editorProfile),custom=assetRows.find(item=>item.key===settings.editorProfile),profile=seatingProfile(definition,settings.editorProfile,builtin&&seatingVehicleAsset(builtin)||custom&&custom.asset);state.seatingProfile=profile;state.seatingProfileKey=settings.editorProfile;
      note(translate('Family profiles cover every current and future vehicle of that type. An exact-asset profile overrides only the selected imported GLB, so a correction for one cockpit cannot alter another vehicle.','I profili famiglia coprono tutti i veicoli attuali e futuri di quel tipo. Un profilo asset esatto sovrascrive solo il GLB importato scelto, quindi la correzione di un abitacolo non può alterare un altro veicolo.'));
      const targetOptions=['masterRig','seatRoot'].concat(SEATING_IK_TARGETS),targetSelect=field(translate('Gizmo target','Target gizmo'),state.seatingEditTarget||'seatRoot','select',value=>selectSeatingTarget(state,value),targetOptions),targetLabels={masterRig:translate('Master Rig / move everything','Master Rig / muovi tutto'),seatRoot:translate('Character only / seat root','Solo Character / root seduta'),pelvis:translate('Pelvis / lower-back target','Target bacino / schiena bassa'),spine:translate('Middle-spine target','Target centro schiena'),chest:translate('Chest / upper-back target','Target torace / schiena alta'),leftShoulder:translate('Left shoulder target','Target spalla sinistra'),rightShoulder:translate('Right shoulder target','Target spalla destra'),head:translate('Head look target','Target testa'),leftHand:translate('Left hand contact','Contatto mano sinistra'),rightHand:translate('Right hand contact','Contatto mano destra'),leftFoot:translate('Left ankle contact','Contatto caviglia sinistra'),rightFoot:translate('Right ankle contact','Contatto caviglia destra'),leftToe:translate('Left toe contact','Contatto punta piede sinistro'),rightToe:translate('Right toe contact','Contatto punta piede destro'),leftElbowPole:translate('Left elbow pole','Pole gomito sinistro'),rightElbowPole:translate('Right elbow pole','Pole gomito destro'),leftKneePole:translate('Left knee pole','Pole ginocchio sinistro'),rightKneePole:translate('Right knee pole','Pole ginocchio destro')};state.seatingTargetSelect=targetSelect;Array.from(targetSelect.options).forEach(option=>option.textContent=targetLabels[option.value]||option.value);
      field(translate('Show every IK helper','Mostra tutti i dummy IK'),state.seatingShowHelpers===true,'checkbox',value=>{state.seatingShowHelpers=value===true;updateSeatingHelperVisibility(state);});
      const vector=(label,array,step,suffix,onUpdate)=>['X','Y','Z'].forEach((axis,index)=>{const input=field(label+' '+axis+(suffix||''),array[index],'number',value=>{array[index]=localeNumber(value,0);persist();if(onUpdate)onUpdate();});input.step=step;});
      vector(translate('Character seat position','Posizione Character sul sedile'),profile.position,.01,' m',()=>applySeatingProfileToPreview(state));
      vector(translate('Character seat rotation','Rotazione Character sul sedile'),profile.rotation,.5,'°',()=>applySeatingProfileToPreview(state));
      field(translate('Full Body IK enabled','Full Body IK attivo'),profile.ik.enabled!==false,'checkbox',value=>{profile.ik.enabled=value;persist();});
      const ikWeight=field(translate('Full Body IK weight','Peso Full Body IK'),profile.ik.weight,'range',value=>{profile.ik.weight=Math.max(0,Math.min(1,Number(value)||0));persist();});ikWeight.min=0;ikWeight.max=1;ikWeight.step=.01;
      const headWeight=field(translate('Head alignment weight','Peso allineamento testa'),profile.ik.headWeight,'range',value=>{profile.ik.headWeight=Math.max(0,Math.min(1,Number(value)||0));persist();});headWeight.min=0;headWeight.max=1;headWeight.step=.01;
      const torsoWeight=field(translate('Back / torso IK weight','Peso IK schiena / torso'),profile.ik.torsoWeight,'range',value=>{profile.ik.torsoWeight=Math.max(0,Math.min(1,Number(value)||0));persist();applySeatingPreviewPose(state);});torsoWeight.min=0;torsoWeight.max=1;torsoWeight.step=.01;
      const shoulderWeight=field(translate('Shoulder IK weight','Peso IK spalle'),profile.ik.shoulderWeight,'range',value=>{profile.ik.shoulderWeight=Math.max(0,Math.min(1,Number(value)||0));persist();applySeatingPreviewPose(state);});shoulderWeight.min=0;shoulderWeight.max=1;shoulderWeight.step=.01;
      const toeWeight=field(translate('Toe IK weight','Peso IK punte piedi'),profile.ik.toeWeight,'range',value=>{profile.ik.toeWeight=Math.max(0,Math.min(1,Number(value)||0));persist();applySeatingPreviewPose(state);});toeWeight.min=0;toeWeight.max=1;toeWeight.step=.01;
      const contactHead=document.createElement('div');contactHead.className='lk-ps-property-head';contactHead.innerHTML='<b></b><span></span>';contactHead.querySelector('b').textContent=translate('Full-body contact points','Punti di contatto full-body');contactHead.querySelector('span').textContent=translate('metres from vehicle seat','metri dal sedile veicolo');root.appendChild(contactHead);
      const activateTarget=name=>{const weightField=SEATING_WEIGHT_FIELDS[name];if(weightField)profile.ik[weightField]=1;applySeatingProfileToPreview(state);applySeatingPreviewPose(state);};
      SEATING_IK_TARGETS.forEach(name=>vector(targetLabels[name]||name,profile.ik[name],.01,' m',()=>activateTarget(name)));
      Object.keys(SEATING_ROTATION_FIELDS).forEach(name=>vector((targetLabels[name]||name)+' · '+translate('rotation','rotazione'),profile.ik[SEATING_ROTATION_FIELDS[name]],.5,'°',()=>activateTarget(name)));
      const fingerLabels={thumb:translate('Thumb','Pollice'),index:translate('Index / trigger','Indice / grilletto'),middle:translate('Middle','Medio'),ring:translate('Ring','Anulare'),pinky:translate('Pinky','Mignolo')};['left','right'].forEach(side=>{const head=document.createElement('div');head.className='lk-ps-property-head';head.innerHTML='<b></b><span></span>';head.querySelector('b').textContent=(side==='left'?translate('Left-hand fingers','Dita mano sinistra'):translate('Right-hand fingers','Dita mano destra'));head.querySelector('span').textContent='0 '+translate('open','aperte')+' · 1 '+translate('wrapped','chiuse');root.appendChild(head);GRIP_FINGERS.forEach(name=>{const input=field(fingerLabels[name],profile.ik.fingers[side][name],'range',value=>{profile.ik.fingers[side][name]=Math.max(0,Math.min(1,Number(value)||0));persist();applySeatingPreviewPose(state);});input.min=0;input.max=1;input.step=.01;});});
      const actions=document.createElement('div');actions.className='lk-ps-actions';const preview=document.createElement('button');preview.type='button';preview.className='lk-ps-action primary';preview.textContent=translate('▶ Reload vehicle preview','▶ Ricarica anteprima veicolo');preview.addEventListener('click',()=>previewVehicleSeating(state));const reset=document.createElement('button');reset.type='button';reset.className='lk-ps-action';reset.textContent=translate('Reset this seat profile','Ripristina questo profilo seduta');reset.addEventListener('click',()=>{const runtime=window.LK_RUNTIME_VEHICLE_OCCUPANCY,asset=profile.asset||null;settings.profiles[settings.editorProfile]=runtime&&runtime.defaultSeatProfile?runtime.defaultSeatProfile(settings.editorProfile,settings.editorProfile==='family:native-and-logic-vehicles'):seatingProfile(definition,settings.editorProfile,asset);if(asset)settings.profiles[settings.editorProfile].asset=asset;persist();renderProperties(state,container,persist,loadAssets,importFiles,translate);previewVehicleSeating(state);});actions.append(preview,reset);root.appendChild(actions);
      note(translate('The preview resolves the same driver-seat node, metre normalization, neutral animation and post-mixer Full Body IK used in Play. Collision/physics meshes stay in the GLB for runtime scanning but are hidden here. The coloured IK targets are visible and clickable directly in the viewport; the selected target receives the gizmo.','La preview risolve lo stesso nodo driver-seat, normalizzazione in metri, animazione neutra e Full Body IK post-mixer usati in Play. Le mesh collision/physics restano nel GLB per la scansione runtime ma qui sono nascoste. I target IK colorati sono visibili e cliccabili direttamente nel viewport; il target selezionato riceve il gizmo.'));
      note(translate('Master Rig moves or rotates the Character root and every independent IK dummy as one setup, preserving all relative offsets. Character Root moves only the body. Select a hand, foot, elbow, knee or head target for individual correction; Play uses the same saved targets after the animation mixer.','Master Rig muove o ruota insieme la root del Character e tutti i dummy IK indipendenti, mantenendo le distanze relative. Root Character muove soltanto il corpo. Seleziona mano, piede, gomito, ginocchio o testa per una correzione individuale; Play usa gli stessi target salvati dopo il mixer animazioni.'));
      return;
    }
    if(container.kind==='wall-flip'){
      definition.abilities=definition.abilities&&typeof definition.abilities==='object'?definition.abilities:{};
      const flip=definition.abilities.wallFlip=Object.assign({enabled:true,minSpeed:4.2,minHeight:1.35,reach:.72,duration:.72,playbackRate:1.15,lift:.72,pushback:.62,settleDuration:.55,settleSpeedScale:.42},definition.abilities.wallFlip||{});
      field(translate('Enabled while sprinting','Attivo durante la corsa'),flip.enabled!==false,'checkbox',value=>{flip.enabled=value;persist();});
      const numeric=(label,key,min,max,step)=>{const input=field(label,flip[key],'number',value=>{flip[key]=Math.max(min,Math.min(max,Number(value)||0));input.value=flip[key];persist();});input.min=min;input.max=max;input.step=step;return input;};
      numeric(translate('Maximum move duration (s)','Durata massima movimento (s)'),'duration',.2,2,.01);
      numeric(translate('Gameplay playback multiplier','Moltiplicatore playback gameplay'),'playbackRate',.25,4,.05);
      numeric(translate('Upward rebound height (m)','Altezza spinta verso l’alto (m)'),'lift',0,3,.02);
      numeric(translate('Push away from wall (m)','Spinta indietro dal muro (m)'),'pushback',0,3,.02);
      numeric(translate('Walk-to-idle duration (s)','Durata cammino verso idle (s)'),'settleDuration',.05,2,.01);
      numeric(translate('Walk-to-idle speed scale','Scala velocità verso idle'),'settleSpeedScale',.05,1,.01);
      numeric(translate('Minimum sprint speed (m/s)','Velocità minima di corsa (m/s)'),'minSpeed',.5,20,.1);
      numeric(translate('Minimum wall height (m)','Altezza minima muro (m)'),'minHeight',.5,6,.05);
      numeric(translate('Wall detection reach (m)','Distanza rilevamento muro (m)'),'reach',.2,2,.02);
      note(translate('The authored Wall Flip slot Playback Rate is multiplied by Gameplay playback. If the source take is still longer than Maximum duration, runtime fits it inside that duration. The rebound root arc is synchronized to the resulting clip time.','La Velocità riproduzione dello slot Wall Flip viene moltiplicata per il playback gameplay. Se la take sorgente resta più lunga della Durata massima, il runtime la adatta entro quella durata. L’arco della root è sincronizzato al tempo risultante della clip.'));
      note(translate('Wall Flip is used only when the detected top is too high for Vault, Mantle or Climb. After landing, held Forward becomes a short slow walk into idle; release and press Run again to arm another flip.','Il Wall Flip viene usato solo quando la sommità rilevata è troppo alta per Vault, Mantle o Climb. Dopo l’atterraggio, Avanti mantenuto diventa un breve cammino lento verso idle; rilascia e ripremi Corsa per armare un altro flip.'));
      const motionSet=(state.containers||[]).find(item=>item&&item.id==='motion-set'),target=motionSet&&(motionSet.children||[]).find(item=>{const entry=definition.animationSet&&definition.animationSet[item.index];return entry&&entry.state==='action'&&entry.action==='wallFlip';});
      const actions=document.createElement('div');actions.className='lk-ps-actions';const edit=document.createElement('button');edit.type='button';edit.className='lk-ps-action primary';edit.textContent=translate('✦ Edit Wall Flip animation + Auto Key','✦ Modifica animazione Wall Flip + Auto Key');edit.disabled=!target;edit.addEventListener('click',()=>{if(target&&state.selectContainer)state.selectContainer(target);});actions.appendChild(edit);root.appendChild(actions);
      note(translate('The button opens the real action slot and its proportional timeline. Auto Key is highlighted while armed: scrub, move the character root or rotate a bone, and the key is saved in this Wall Flip slot only.','Il pulsante apre lo slot azione reale e la sua timeline proporzionata. Auto Key viene evidenziato quando è attivo: sposta il cursore, muovi la root del personaggio o ruota un bone; la chiave viene salvata soltanto in questo slot Wall Flip.'));
      return;
    }
    if(container.kind==='vault-rules'){
      definition.abilities=definition.abilities&&typeof definition.abilities==='object'?definition.abilities:{};
      const runtime=window.LK_RUNTIME_CHARACTER_ABILITIES,vault=definition.abilities.vault=definition.abilities.vault&&typeof definition.abilities.vault==='object'?definition.abilities.vault:{};
      if(!Array.isArray(vault.variants)||!vault.variants.length)vault.variants=runtime&&runtime.normalizeVaultVariants?runtime.normalizeVaultVariants(vault):[{id:'front-flip',label:'Front Flip Vault',slot:'vault',enabled:true,weight:1,override:false,minHeight:.5,maxHeight:1.25,minDepth:0,maxDepth:4},{id:'box-vault',label:'Vault Over Box',slot:'vaultBox',enabled:true,weight:1,override:false,minHeight:.5,maxHeight:1.25,minDepth:.7,maxDepth:4}];
      const mode=field(translate('Selection method','Metodo di selezione'),vault.selectionMode||'primary','select',value=>{vault.selectionMode=value;persist();renderProperties(state,container,persist,loadAssets,importFiles,translate);},['primary','random','conditions']);
      const modeLabels={primary:translate('Primary only','Solo primaria'),random:translate('Random enabled variant','Variante attiva casuale'),conditions:translate('Obstacle height / depth rules','Regole altezza / profondità ostacolo')};Array.from(mode.options).forEach(option=>option.textContent=modeLabels[option.value]||option.value);
      const slotOptions=Array.from(new Set(['vault','vaultBox'].concat(actionSlotCatalog().map(item=>item.key),vault.variants.map(item=>item.slot)).filter(Boolean)));
      field(translate('Fallback animation slot','Slot animazione di fallback'),vault.defaultSlot||'vault','select',value=>{vault.defaultSlot=value;persist();},slotOptions);
      note(translate('Primary always uses the fallback slot. Random uses Weight. Conditions compares the measured obstacle height and depth; an Override rule wins over every ordinary matching rule. If no rule matches, fallback is used.','Primaria usa sempre lo slot di fallback. Casuale usa il Peso. Condizioni confronta altezza e profondità misurate dell’ostacolo; una regola Override vince sulle altre regole compatibili. Se nessuna combacia, viene usato il fallback.'));
      vault.variants.forEach((variant,index)=>{
        const card=document.createElement('div');card.className='lk-ps-rule-card';root.appendChild(card);const cardField=(label,value,type,onChange,options)=>{const row=document.createElement('label');row.className='lk-ps-field';const caption=document.createElement('span');caption.textContent=label;let input;if(type==='select'){input=document.createElement('select');(options||[]).forEach(option=>input.appendChild(new Option(String(option),String(option))));input.value=value==null?'':String(value);}else{input=document.createElement('input');input.type=type||'text';input.value=value==null?'':value;if(type==='checkbox')input.checked=value===true;}input.addEventListener('change',()=>onChange(type==='number'?Number(input.value):(type==='checkbox'?input.checked:input.value)));row.append(caption,input);card.appendChild(row);return input;};
        const title=document.createElement('div');title.className='lk-ps-property-head';title.innerHTML='<b></b><span></span>';title.querySelector('b').textContent=variant.label||variant.id||('Vault '+(index+1));title.querySelector('span').textContent='#'+(index+1);card.appendChild(title);
        cardField(translate('Enabled','Attiva'),variant.enabled!==false,'checkbox',value=>{variant.enabled=value;persist();});
        cardField(translate('Name','Nome'),variant.label||variant.id,'text',value=>{variant.label=value;persist();renderProperties(state,container,persist,loadAssets,importFiles,translate);});
        cardField(translate('Animation slot','Slot animazione'),variant.slot||'vault','select',value=>{variant.slot=value;persist();},slotOptions);
        cardField(translate('Weight (Random)','Peso (Casuale)'),variant.weight==null?1:variant.weight,'number',value=>{variant.weight=Math.max(.01,Number(value)||1);persist();});
        cardField(translate('Override matching rules','Override regole compatibili'),variant.override===true,'checkbox',value=>{variant.override=value;persist();});
        cardField(translate('Priority','Priorità'),variant.priority||0,'number',value=>{variant.priority=Number(value)||0;persist();});
        [['Min height (m)','Altezza minima (m)','minHeight',8],['Max height (m)','Altezza massima (m)','maxHeight',8],['Min depth (m)','Profondità minima (m)','minDepth',20],['Max depth (m)','Profondità massima (m)','maxDepth',20]].forEach(spec=>{const input=cardField(translate(spec[0],spec[1]),variant[spec[2]],'number',value=>{variant[spec[2]]=Math.max(0,Number(value)||0);persist();});input.min=0;input.max=spec[3];input.step=.05;});
        const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.textContent=translate('Remove variant','Rimuovi variante');remove.disabled=vault.variants.length<=1;remove.addEventListener('click',()=>{vault.variants.splice(index,1);persist();renderProperties(state,container,persist,loadAssets,importFiles,translate);});card.appendChild(remove);
      });
      const add=document.createElement('button');add.type='button';add.className='lk-ps-action';add.textContent=translate('＋ Add vault variant','＋ Aggiungi variante vault');add.addEventListener('click',()=>{vault.variants.push({id:'vault-'+Date.now(),label:'New Vault',slot:'vault',enabled:true,weight:1,override:false,priority:0,minHeight:.5,maxHeight:1.25,minDepth:0,maxDepth:4});persist();renderProperties(state,container,persist,loadAssets,importFiles,translate);});root.appendChild(add);return;
    }
    if(container.kind==='fields'){
      (container.fields||[]).forEach(spec=>{const input=field(spec.label,pathGet(definition,spec.path),spec.type,value=>{pathSet(definition,spec.path,value);persist();},spec.options);if(spec.min!=null)input.min=spec.min;if(spec.max!=null)input.max=spec.max;if(spec.step!=null)input.step=spec.step;});return;
    }
    if(container.kind==='motion-set'){
      note(translate('Each child is a motion sample with its own asset and metadata. Import an FBX batch to create the complete set in one operation; filename and clip names are used only as editable initial suggestions.','Ogni figlio è un campione di movimento con asset e metadati propri. Importa un gruppo di FBX per creare l’intero set in una sola operazione; nomi file e clip vengono usati soltanto come suggerimenti iniziali modificabili.'));
      const importBatch=folder=>{const input=document.createElement('input');input.type='file';input.accept='.fbx,.glb,.gltf,image/*,.tga';input.multiple=true;if(folder){input.webkitdirectory=true;input.setAttribute('webkitdirectory','');}input.addEventListener('change',()=>{const files=Array.from(input.files||[]);if(!files.length)return;state.previewStatus.textContent=translate('Converting animation batch…','Conversione gruppo animazioni…');importFiles(files).then(imported=>{const animations=(imported||[]).filter(asset=>asset&&asset.kind==='glb');let added=0;animations.forEach(asset=>{const clips=Array.isArray(asset.clips)&&asset.clips.length?asset.clips:[''];clips.forEach(clip=>{definition.animationSet.push(inferMotionMetadata(asset,clip,added));added++;});});persist();state.previewStatus.textContent=added+translate(added===1?' motion sample imported':' motion samples imported',added===1?' campione movimento importato':' campioni movimento importati');renderProperties(state,container,persist,loadAssets,importFiles,translate);});},{once:true});input.click();};
      const batch=document.createElement('button');batch.className='lk-ps-action';batch.textContent=translate('⇄ Import FBX / GLB animation batch…','⇄ Importa gruppo animazioni FBX / GLB…');batch.addEventListener('click',()=>importBatch(false));root.appendChild(batch);
      const folder=document.createElement('button');folder.className='lk-ps-action';folder.textContent=translate('📁 Import animation folder…','📁 Importa cartella animazioni…');folder.addEventListener('click',()=>importBatch(true));root.appendChild(folder);
      const add=document.createElement('button');add.className='lk-ps-action';add.textContent=translate('＋ Add empty motion sample','＋ Aggiungi campione vuoto');add.addEventListener('click',()=>{definition.animationSet.push({id:'motion-'+Date.now(),name:'New Motion',state:'grounded',direction:[0,1],speed:1.8,speedTolerance:2.2,asset:null,clip:'',loop:true,priority:1,playbackRate:1,sourceOrientation:'y-up',previewScale:1,motionTransform:{position:[0,0,0],rotation:[0,0,0]},rigCorrections:{},curveCorrection:{offset:[0,0,0],influence:1,falloff:'smooth-midpoint'}});persist();});root.appendChild(add);return;
    }
    if(container.kind==='motion'){
      const entry=definition.animationSet[container.index];if(!entry)return;entry.playbackRate=signedPlaybackRate(entry.playbackRate);field(translate('Display name','Nome'),entry.name,'text',value=>{entry.name=value;persist();});field(translate('Physical state','Stato fisico'),entry.state,'select',value=>{entry.state=value;persist();},['grounded','jump','fall','land','action']);
      if(entry.state==='action'){
        const slots=actionSlotCatalog(),keys=slots.map(item=>item.key);if(entry.action&&!keys.includes(entry.action))keys.unshift(entry.action);
        const actionSelect=field(translate('Gameplay action slot','Slot azione gameplay'),entry.action||'interact','select',value=>{entry.action=value;entry.id='action-slot-'+value;const meta=slots.find(item=>item.key===value);if(meta&&(!entry.name||/^New Motion|^Motion /i.test(entry.name)))entry.name=meta.label||value;persist();renderProperties(state,container,persist,loadAssets,importFiles,translate);},keys);
        Array.from(actionSelect.options).forEach(option=>{const meta=slots.find(item=>item.key===option.value);option.textContent=meta?(meta.label||meta.key)+' · '+meta.key:option.value;});
        const meta=slots.find(item=>item.key===entry.action);if(meta&&meta.description)note(translate('This slot is invoked by the mapped gameplay action; physical keys remain in Input Mapping, so editor and game bindings never overlap. ','Questo slot viene invocato dall’azione gameplay mappata; i tasti fisici restano in Input Mapping, così i binding editor e gioco non si sovrappongono. ')+meta.description);
      }
      const directions={Idle:[0,0],Forward:[0,1],Backward:[0,-1],Left:[-1,0],Right:[1,0]},directionName=Object.keys(directions).find(key=>directions[key][0]===(entry.direction||[])[0]&&directions[key][1]===(entry.direction||[])[1])||'Forward';field(translate('Direction','Direzione'),directionName,'select',value=>{entry.direction=directions[value].slice();persist();},Object.keys(directions));
      field(translate('Nominal speed (m/s)','Velocità nominale (m/s)'),entry.speed,'number',value=>{entry.speed=Math.max(0,value||0);persist();});field(translate('Speed tolerance','Tolleranza velocità'),entry.speedTolerance,'number',value=>{entry.speedTolerance=Math.max(.1,value||.1);persist();});field(translate('Priority','Priorità'),entry.priority,'number',value=>{entry.priority=Math.max(.05,value||1);persist();});let playbackInput;playbackInput=field(translate('Playback rate','Velocità riproduzione'),entry.playbackRate,'number',value=>{entry.playbackRate=signedPlaybackRate(value);playbackInput.value=entry.playbackRate;persist();applyPreviewRate(state);updateTimelineUi(state);if(state.previewPlaying&&state.previewAction&&state.previewAction.isRunning&&!state.previewAction.isRunning()){state.previewAction.reset();state.previewAction.play();applyPreviewRate(state);}if(state.previewStatus){const metrics=timelineMetrics(state);state.previewStatus.textContent=(entry.name||entry.clip||'Animation')+' · '+entry.playbackRate.toFixed(2)+'× · '+metrics.slotDuration.toFixed(3)+' s';}});playbackInput.min=-4;playbackInput.max=4;playbackInput.step=.05;field(translate('Loop','Loop'),entry.loop,'checkbox',value=>{entry.loop=value;persist();});
      const assets=loadAssets().filter(asset=>asset&&asset.kind==='glb'),currentId=assetId(entry.asset),motionOptions=[''].concat(assets.map(asset=>assetId(asset)));if(currentId&&!motionOptions.includes(currentId))motionOptions.push(currentId);const assetSelect=field(translate('Animation GLB / FBX','GLB / FBX animazione'),currentId,'select',value=>{const asset=assets.find(item=>assetId(item)===value);if(!value)entry.asset=null;else if(asset)entry.asset=storableAssetRef(asset);if(asset&&Array.isArray(asset.clips)&&asset.clips.length&&!asset.clips.includes(entry.clip))entry.clip=asset.clips[0];persist();previewMotion(state,entry);},motionOptions);Array.from(assetSelect.options).forEach(option=>{if(!option.value){option.textContent=translate('Main mesh clips','Clip della mesh principale');return;}const asset=assets.find(item=>assetId(item)===option.value);option.textContent=asset?(asset.name||option.value)+(asset.sourceFormat==='fbx'?' · FBX source':''):(entry.asset&&entry.asset.name||option.value);});
      // The Clip source is whichever GLB actually holds it: the entry's own
      // asset when one is assigned, otherwise the Main Mesh's own embedded
      // clips. Free text remains the fallback for assets imported before
      // clip names were captured, but a known list turns "type the exact
      // Mixamo clip name by hand" into a pick list, which is also what stops
      // a mistyped/blank name from silently rendering nothing.
      const clipSource=entry.asset||state.adapter.model(state.graph),knownClips=Array.isArray(clipSource&&clipSource.clips)?clipSource.clips.filter(Boolean):[];
      if(knownClips.length){
        const clipOptions=knownClips.slice();if(entry.clip&&!clipOptions.includes(entry.clip))clipOptions.unshift(entry.clip);
        field('Clip',entry.clip,'select',value=>{entry.clip=value;persist();previewMotion(state,entry);},clipOptions);
      } else {
        field('Clip',entry.clip,'text',value=>{entry.clip=value;persist();previewMotion(state,entry);});
      }
      const orientationOptions=['y-up','auto','z-up','z-up-inverted','x-up','x-up-inverted','y-up-backward'],orientationSelect=field(translate('Source orientation','Orientamento sorgente'),entry.sourceOrientation||'y-up','select',value=>{entry.sourceOrientation=value;persist();previewMotion(state,entry);},orientationOptions),orientationLabels={auto:translate('Auto bind-pose detection','Rilevamento automatico bind pose'),'y-up':translate('Y-up (Mixamo default)','Y-up (predefinito Mixamo)'),'z-up':translate('Z-up → Y-up (−90° X)','Z-up → Y-up (−90° X)'),'z-up-inverted':translate('Z-up → Y-up (+90° X)','Z-up → Y-up (+90° X)'),'x-up':translate('X-up → Y-up (+90° Z)','X-up → Y-up (+90° Z)'),'x-up-inverted':translate('X-up → Y-up (−90° Z)','X-up → Y-up (−90° Z)'),'y-up-backward':translate('Y-up · turn 180°','Y-up · ruota 180°')};Array.from(orientationSelect.options).forEach(option=>{option.textContent=orientationLabels[option.value]||option.value;});
      const yawOptions=['auto','locked','authored'],yawSelect=field(translate('Root yaw','Yaw della root'),entry.rootYawMode||'auto','select',value=>{entry.rootYawMode=value;persist();previewMotion(state,entry);},yawOptions),yawLabels={auto:translate('Auto · lock forward locomotion','Automatico · blocca locomozione frontale'),locked:translate('Locked · always in-place','Bloccato · sempre in-place'),authored:translate('Authored · preserve animation','Originale · conserva animazione')};Array.from(yawSelect.options).forEach(option=>{option.textContent=yawLabels[option.value]||option.value;});
      const applyPreviewScale=value=>{const next=Math.max(.0001,Math.min(100,localeNumber(value,1)));if(Math.abs(motionPreviewScale(entry)-next)<1e-9)return;entry.previewScale=next;persist();previewMotion(state,entry);},previewScaleInput=field(translate('Animation preview scale (×)','Scala anteprima animazione (×)'),motionPreviewScale(entry),'text',applyPreviewScale);previewScaleInput.inputMode='decimal';previewScaleInput.autocomplete='off';let previewScaleTimer=0;previewScaleInput.addEventListener('input',()=>{clearTimeout(previewScaleTimer);previewScaleTimer=setTimeout(()=>applyPreviewScale(previewScaleInput.value),250);});previewScaleInput.addEventListener('keydown',event=>{if(event.key==='Enter'){clearTimeout(previewScaleTimer);applyPreviewScale(previewScaleInput.value);}});
      entry.motionTransform=normalizedMotionTransform(entry);
      const transformValue=(kind,index,value)=>{const next=normalizedMotionTransform(entry);next[kind][index]=localeNumber(value,0);entry.motionTransform=next;persist();applyPreviewRigLock(state);};
      const positionLabels=[translate('Visual offset X · this slot','Offset visivo X · questo slot'),translate('Floor / pivot offset Y · this slot','Offset pavimento / pivot Y · questo slot'),translate('Visual offset Z · this slot','Offset visivo Z · questo slot')];
      positionLabels.forEach((label,index)=>{const input=field(label,entry.motionTransform.position[index],'number',value=>transformValue('position',index,value));input.step=.01;});
      ['X','Y','Z'].forEach((axis,index)=>{const input=field(translate('Visual rotation '+axis+' · this slot (deg)','Rotazione visiva '+axis+' · questo slot (gradi)'),entry.motionTransform.rotation[index],'number',value=>transformValue('rotation',index,value));input.step=.1;});
      const resetTransform=document.createElement('button');resetTransform.type='button';resetTransform.className='lk-ps-action';resetTransform.textContent=translate('Reset slot transform','Ripristina trasformazione slot');resetTransform.addEventListener('click',()=>{entry.motionTransform={position:[0,0,0],rotation:[0,0,0]};persist();applyPreviewRigLock(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);});root.appendChild(resetTransform);
      const saveSlot=document.createElement('button');saveSlot.type='button';saveSlot.className='lk-ps-action primary';saveSlot.textContent=translate('✓ Save this slot now','✓ Salva ora questo slot');saveSlot.addEventListener('click',persist);root.appendChild(saveSlot);
      entry.rigCorrections=normalizedRigCorrections(entry);
      note(translate('The Pawn/collider pivot stays fixed. These saved values move only the visible Main Mesh for this animation slot; use Floor / pivot Y to correct a take that floats or sinks. For a correction that changes during the clip, enable Auto Key and add Root Keys on the timeline.','Il pivot del Pawn/collider resta fisso. Questi valori salvati spostano soltanto la Mesh principale visibile per questo slot animazione; usa Pavimento / pivot Y per correggere una take che galleggia o affonda. Per una correzione che cambia durante la clip, attiva Auto Key e aggiungi Root Key nella timeline.'));
      note(translate('Edit Rig pauses this slot, shows its skeleton and lets you rotate one bone at a time. Corrections affect the complete clip as a non-destructive pose layer and blend into the next movement state. Reset Bone removes only the selected correction.','Edit Rig mette in pausa lo slot, mostra lo skeleton e permette di ruotare un bone alla volta. Le correzioni agiscono sull’intera clip come layer di posa non distruttivo e si fondono con lo stato di movimento successivo. Reset Bone rimuove solo la correzione selezionata.'));
      note(translate('The timeline below the viewport is isolated to this slot. Scrub to a pose, enable Auto Key, then move the whole character or rotate a selected bone with the gizmo. Runtime interpolates these non-destructive keys over the original clip.','La timeline sotto il viewport è isolata a questo slot. Vai su una posa, attiva Auto Key, poi muovi l’intero personaggio o ruota un bone selezionato col gizmo. Il runtime interpola queste chiavi non distruttive sopra la clip originale.'));
      note(translate('Y-up is the default for direct Mixamo FBX. Preview scale 1× inherits the exact Main Mesh scale; an override affects only this isolated slot preview, never Play Preview or export.','Y-up è il valore predefinito per gli FBX Mixamo diretti. La scala preview 1× eredita esattamente la Main Mesh; l’override modifica solo questa anteprima isolata, mai Play Preview o export.'));
      if(entry.asset){const main=libraryAssetForRef(state.adapter.model(state.graph))||state.adapter.model(state.graph),motion=libraryAssetForRef(entry.asset)||entry.asset,compatibility=skeletonCompatibility(main,motion);if(compatibility.status==='compatible')note(translate('Skeleton check: compatible','Controllo skeleton: compatibile')+(compatibility.total?' · '+Math.round(compatibility.ratio*100)+'%':''));else if(compatibility.status==='warning')note(translate('Skeleton check: partial match — verify the preview before publishing.','Controllo skeleton: corrispondenza parziale — verifica la preview prima della pubblicazione.'));else if(compatibility.status==='incompatible')note(translate('Skeleton check: incompatible bone hierarchy. Retarget this animation before gameplay use.','Controllo skeleton: gerarchia ossa incompatibile. Esegui il retargeting prima di usarla nel gameplay.'));else note(translate('Skeleton check unavailable: this older asset has no captured bone metadata. Rebuild or reimport it.','Controllo skeleton non disponibile: questo asset precedente non contiene i metadati delle ossa. Ricompilalo o reimportalo.'));}
      const previewActions=document.createElement('div');previewActions.className='lk-ps-actions lk-ps-slot-preview-actions';const testSlot=document.createElement('button');testSlot.className='lk-ps-action primary';testSlot.textContent=translate('▶ Test this animation slot','▶ Prova questo slot animazione');testSlot.addEventListener('click',()=>startMotionPreview(state,entry));const stopSlot=document.createElement('button');stopSlot.textContent=translate('■ Stop slot preview','■ Ferma preview slot');stopSlot.addEventListener('click',()=>stopMotionPreview(state));previewActions.append(testSlot,stopSlot);root.appendChild(previewActions);
      // Reached from the clip the author is looking at: an animation that holds a
      // weapon is the moment the question "one hand or two, and where exactly"
      // comes up, so the weapon's grip is editable right here instead of being
      // hidden in another container. The values are the weapon's, not the clip's,
      // which is why the heading says so.
      const gripHeading=document.createElement('div');gripHeading.className='lk-ps-property-head';gripHeading.innerHTML='<b></b><span></span>';
      gripHeading.querySelector('b').textContent=translate('Weapon Grip & Hands','Impugnatura arma e mani');
      gripHeading.querySelector('span').textContent=translate('shared by every motion','condivisa da tutti i movimenti');
      root.appendChild(gripHeading);
      renderGripEditor(state,root,persist,translate,field,note);
      const actions=document.createElement('div');actions.className='lk-ps-actions';const importButton=document.createElement('button');importButton.textContent=translate('Import animation…','Importa animazione…');importButton.addEventListener('click',()=>{const input=document.createElement('input');input.type='file';input.accept='.glb,.gltf,.fbx,image/*,.tga';input.multiple=true;input.addEventListener('change',()=>{importFiles(Array.from(input.files||[])).then(imported=>{const asset=(imported||[]).find(item=>item&&item.kind==='glb');if(asset){entry.asset=storableAssetRef(asset);if(asset.clips&&asset.clips[0])entry.clip=asset.clips[0];persist();startMotionPreview(state,entry);renderProperties(state,container,persist,loadAssets,importFiles,translate);}});},{once:true});input.click();});const duplicate=document.createElement('button');duplicate.textContent=translate('Duplicate','Duplica');duplicate.addEventListener('click',()=>{const copy=clone(entry);copy.id=entry.id+'-copy-'+Date.now();copy.name=entry.name+' Copy';definition.animationSet.splice(container.index+1,0,copy);persist();});const remove=document.createElement('button');remove.className='danger';remove.textContent=translate('Remove','Rimuovi');remove.addEventListener('click',()=>{definition.animationSet.splice(container.index,1);persist();state.selected=state.containers.find(item=>item.id==='motion-set');renderProperties(state,state.selected,persist,loadAssets,importFiles,translate);});actions.append(importButton,duplicate,remove);root.appendChild(actions);return;
    }
    if(container.kind==='object'){
      const object=pathGet(definition,container.path)||{};Object.keys(object).filter(key=>['string','number','boolean'].includes(typeof object[key])).forEach(key=>field(key,object[key],typeof object[key]==='number'?'number':(typeof object[key]==='boolean'?'checkbox':'text'),value=>{object[key]=value;pathSet(definition,container.path,object);persist();}));if(!Object.keys(object).length)note(translate('No editable scalar properties in this container. A category plugin can provide a richer custom renderer.','Nessuna proprietà scalare modificabile in questo container. Un plugin di categoria può fornire un renderer più ricco.'));return;
    }
    note(translate('Select a child container to edit it.','Seleziona un container figlio per modificarlo.'));
  }
  function assignPawnModel(state,asset){
    const previous=state.adapter&&state.adapter.model?state.adapter.model(state.graph):null,ref=storableAssetRef(asset);ref.fit=Math.max(.1,Number(previous&&previous.fit)||1.9);
    if(state.graph.characterPawn||state.graph.soccerPawn){state.definition.model=ref;const scene=state.graph.logicScene||{},elements=scene.elements||[],model=elements.find(item=>item&&item.id==='character_model');if(model){const scale=Array.isArray(model.scale)?model.scale:[1,1,1],wasPlaceholderScale=Math.max.apply(Math,scale.map(value=>Math.abs(Number(value)||0)))<.01;model.asset=clone(ref);model.linked=true;if(wasPlaceholderScale){model.position=[0,0,0];model.rotation=[0,0,0];model.scale=[1,1,1];}}const placeholder=/^(torso_|hips_|leg_sock_|arm_skin_|hand_skin_|head_skin|hair_top)/;elements.forEach(item=>{if(item&&placeholder.test(String(item.id||'')))item.linked=false;});}
    else {state.definition.modelAsset=ref;const model=sceneModel(state.graph,'vehicle_model')||sceneModel(state.graph);if(model)model.asset=clone(ref);}
  }
  function resetPawnModel(state){
    if(!(state&&state.definition&&(state.graph.characterPawn||state.graph.soccerPawn)))return false;
    state.definition.model=null;
    const scene=state.graph.logicScene||(state.graph.logicScene={root:{id:'root',name:'Character Root',type:'empty',linked:true},elements:[],components:[]});
    const elements=scene.elements||(scene.elements=[]),model=elements.find(item=>item&&item.id==='character_model');
    if(model){delete model.asset;model.linked=true;model.position=[0,1.05,0];model.rotation=[0,0,0];model.scale=[.001,.001,.001];}
    const runtime=window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION,pose=runtime&&runtime.sceneElements?runtime.sceneElements(state.definition.appearance||{}):[];
    pose.forEach(spec=>{let element=elements.find(item=>item&&item.id===spec.id);if(!element){element={};elements.push(element);}Object.assign(element,clone(spec),{linked:true});});
    if(state.object&&state.object.userData)delete state.object.userData.characterModelError;
    return true;
  }
  syncPluginAdapters();
  const resolveRegisteredType=graph=>{syncPluginAdapters();return resolveType(graph);};
  return Object.freeze({open,close,supports:graph=>!!resolveRegisteredType(graph),resolveType:resolveRegisteredType,assignPawnModel,resetPawnModel});
}

// `gripAuthoring` is the seam the tests drive: the dummies, the read-back and the
// arm layer are pure state+THREE work, so they can be exercised for real instead
// of being asserted on as source text.
window.LK_EDITOR_PAWN_STUDIO=Object.freeze({registerType,unregisterType,resolveType,listTypes:()=>adapters.slice(),inferMotionMetadata,skeletonCompatibility,create,
  timelineMetrics:motionTimelineMetrics,
  playbackRate:signedPlaybackRate,
  combinedPlaybackRate,
  storableAssetRef,activeLevelPlayerAsset,seatingAssetRows,
  seatingPreviewAsset,
  seatingVehicleAsset,
  seatingNeutralMotion,hideSeatingVehicleMetadata,ensureSeatingVehicleVisible,alignUntouchedExactSeatProfile,
  createAuthoringHistory,restoreObject,
  weaponGrip:normalizedGrip,weaponGripConfig,stateWeaponGripConfig,weaponSocketConfig,defaultGripHands,gripHandOffset,gripHands:()=>GRIP_HANDS.slice(),gripLayers:()=>GRIP_LAYERS.slice(),gripContexts:gripContextOptions,gripContext:gripContextSpec,gripFingers:normalizedGripFingers,
  gripSupportActive,inheritedGripLayer,gripWeaponEntries,
  seatingAuthoring:Object.freeze({targetFromPointer:seatingTargetFromPointer}),
  gripAuthoring:Object.freeze({build:buildGripDummies,clear:clearGripDummies,syncDummies:syncGripDummies,syncFrame:syncGripFrame,syncWeapon:syncGripWeaponPreview,readWeaponSocket:syncWeaponSocketFromPreview,read:readGripFromDummy,targets:gripPoseTargets,pose:applyGripPose,restore:restoreGripPose,eyeAnchor:gripEyeAnchor,activeDummy:activeGripDummy,handFromPointer:gripHandFromPointer})});
})();
