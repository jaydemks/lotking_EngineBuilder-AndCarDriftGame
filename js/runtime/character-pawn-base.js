/* =========================================================
   LOT KING - Shared humanoid Character Pawn runtime
   Owns possession, input, movement, camera, animation library,
   motion blending, appearance and lifecycle. Game modes add
   data and hooks; this module never depends on Soccer.
   ========================================================= */
(function(){
'use strict';

let nextPawnId = 1;
const animationLibraryCache = new Map();
const APPEARANCE_RULES = [
  {key:'shirtColor',match:/shirt|jersey|maglia|torso|top|chest|body(?!suit)/i},
  {key:'shortsColor',match:/short|pant|legs?\b|pantalon/i},
  {key:'socksColor',match:/sock|shoe|boot|feet|foot|calz/i},
  {key:'hairColor',match:/hair|capell|beard|barba/i},
  {key:'skinColor',match:/skin|face|head|arm|hand|pelle/i},
];

function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function finite(value,fallback){ const n=Number(value); return Number.isFinite(n)?n:fallback; }
function clamp(value,min,max){ return Math.max(min,Math.min(max,value)); }
function normalizePlayerId(value){
  if(window.LK_RUNTIME_PAWN_CORE) return window.LK_RUNTIME_PAWN_CORE.normalizePlayerId(value);
  if(value==null||value===''||value==='none'||Number(value)<1) return null;
  return clamp(Number(value)|0,1,4);
}
function neutralMove(){ return {x:0,z:0,sprint:false,jump:false,action:false,lookX:0,lookY:0,fire:false,aim:false,reload:false,crouch:false,slowWalk:false,interact:false,pickup:false,dropItem:false,nextWeapon:false,useItem:false,dodge:false,swapShoulder:false,leanLeft:false,leanRight:false,slot1:false,slot2:false,slot3:false,slot4:false,slot5:false,slot6:false,slot7:false,inventory:false,viewToggle:false,device:null}; }
function normalizeCommonConfig(source, defaults){
  const src=source&&typeof source==='object'?clone(source):{};
  const base=defaults||{};
  const movement=Object.assign({},base.movement||{},src.movement||{});
  const normalizedMovement=window.LK_RUNTIME_CHARACTER_MOVEMENT
    ? window.LK_RUNTIME_CHARACTER_MOVEMENT.normalizeOptions(movement)
    : movement;
  const locomotion=Object.assign({responsiveness:9,predictionTime:.12},base.locomotion||{},src.locomotion||{});
  const spawn=Object.assign({x:0,y:0,z:0,heading:0},base.spawn||{},src.spawn||{});
  const playerId=normalizePlayerId(src.playerId==null?base.playerId:src.playerId);
  return Object.assign({},base,src,{
    enabled:src.enabled!==false,
    hidden:src.hidden===true,
    possessed:src.possessed!==false&&playerId!=null,
    playerId,
    spawn:{x:finite(spawn.x,0),y:finite(spawn.y,0),z:finite(spawn.z,0),heading:finite(spawn.heading,0)},
    movement:normalizedMovement,
    model:src.model&&typeof src.model==='object'?clone(src.model):null,
    animationLibrary:src.animationLibrary&&typeof src.animationLibrary==='object'?clone(src.animationLibrary):null,
    animationSet:Array.isArray(src.animationSet)?clone(src.animationSet):(src.animationSet&&Array.isArray(src.animationSet.entries)?clone(src.animationSet.entries):[]),
    locomotion:{responsiveness:clamp(finite(locomotion.responsiveness,9),.5,30),predictionTime:clamp(finite(locomotion.predictionTime,.12),0,.6)},
    animations:Object.assign({},base.animations||{},src.animations||{}),
    appearance:Object.assign({},base.appearance||{},src.appearance||{}),
    cloth:window.LK_RUNTIME_CLOTH?window.LK_RUNTIME_CLOTH.normalizeConfig(src.cloth||base.cloth||{}):Object.assign({enabled:true,pieces:[]},base.cloth||{},src.cloth||{}),
    camera:Object.assign({mode:'free',view:'third',distance:7.5,height:2.6,lag:6.5,fov:60},base.camera||{},src.camera||{}),
  });
}
function animationLibraryKey(ref){ return ref&&typeof ref==='object'?String(ref.dbKey||ref.key||ref.id||ref.src||''):''; }
function animationBindingSpec(value){
  let parsed=value;
  if(typeof parsed==='string'){
    const text=parsed.trim();
    if(text.charAt(0)==='{')try{parsed=JSON.parse(text);}catch(err){parsed=text;}
    else parsed=text;
  }
  if(parsed&&typeof parsed==='object'){
    const asset=parsed.asset&&typeof parsed.asset==='object'?clone(parsed.asset):null;
    return {clip:String(parsed.clip||parsed.name||'').trim(),asset};
  }
  return {clip:String(parsed||'').trim(),asset:null};
}
function animationClipName(value){return animationBindingSpec(value).clip;}
function animationAssetRef(value){return animationBindingSpec(value).asset;}
function resolveAssetUrl(ref){
  if(ref.dbKey&&window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(ref.dbKey);
  if(ref.src) return Promise.resolve(ref.src);
  return Promise.reject(new Error('Animation library source missing'));
}
function loadAnimationContainer(ref){
  const THREE=window.THREE;
  const canonical=resolveAssetUrl(ref).then(url=>new Promise((resolve,reject)=>{
    if(!THREE||!THREE.GLTFLoader)return reject(new Error('GLTFLoader unavailable'));
    new THREE.GLTFLoader().load(url,gltf=>resolve({root:gltf&&gltf.scene||null,animations:gltf&&gltf.animations||[],source:'glb'}),undefined,reject);
  }));
  return canonical.catch(canonicalError=>{
    const plugin=window.LK_FBX_IMPORT_PLUGIN;
    if(!ref||ref.sourceFormat!=='fbx'||(!ref.sourceDbKey&&!ref.sourceSrc)||!plugin||typeof plugin.loadSource!=='function')throw canonicalError;
    return Promise.resolve(plugin.loadSource(ref,{THREE,assetBlobs:window.LK_ASSET_BLOBS})).then(root=>({root,animations:root&&root.animations||[],source:'fbx'})).catch(fallbackError=>{throw new Error('Animation GLB failed ('+String(canonicalError&&canonicalError.message||canonicalError)+'); FBX fallback failed ('+String(fallbackError&&fallbackError.message||fallbackError)+')');});
  });
}
function loadAnimationLibrary(ref){
  const key=animationLibraryKey(ref);
  if(!key) return Promise.resolve(null);
  let pending=animationLibraryCache.get(key);
  if(!pending){
    pending=loadAnimationContainer(ref).then(container=>{
        const clips=(container.animations||[]).filter(Boolean).map(clip=>{
          const tagged=clip&&clip.clone?clip.clone():clip;
          if(tagged){tagged.userData=Object.assign({},tagged.userData||{},{lkAnimationAssetKey:key,lkAnimationAssetSource:container.source});Object.defineProperty(tagged,'__lkAnimationSourceRoot',{value:container.root||null,configurable:true});}
          return tagged;
        });
        return {clips,names:clips.map(clip=>clip.name||'Animation'),source:container.source};
    });
    animationLibraryCache.set(key,pending);
    pending.catch(()=>animationLibraryCache.delete(key));
  }
  return pending;
}
function emitPawnEvent(pawn,type,payload){
  if(typeof window==='undefined'||!window.dispatchEvent||!window.CustomEvent) return;
  window.dispatchEvent(new CustomEvent('lk-pawn-event',{detail:Object.assign({type,pawn,pawnId:pawn&&pawn.id||null},payload||{})}));
}
function applyAppearanceToNode(root,appearance){
  if(!root||!root.traverse) return 0;
  let applied=0;
  root.traverse(node=>{
    if(!node.isMesh||!node.material) return;
    const label=[node.name,node.material.name,node.parent&&node.parent.name].join(' ');
    const rule=APPEARANCE_RULES.find(item=>item.match.test(label));
    if(!rule||!appearance[rule.key]) return;
    if(!node.userData.characterTintOwned){ node.material=node.material.clone(); node.userData.characterTintOwned=true; }
    if(node.material.color&&node.material.color.set){ node.material.color.set(appearance[rule.key]); node.material.needsUpdate=true; applied++; }
  });
  return applied;
}

function create(GAME,owner,config,services,options){
  if(!owner) throw new Error('Character Pawn requires an owner');
  const opts=options||{};
  const registry=GAME&&GAME.pawns;
  if(!registry||!registry.register) return null;
  const ownerKey=opts.ownerKey||'characterPawnId';
  const existingId=owner.userData&&owner.userData[ownerKey];
  if(existingId&&registry.get(existingId)) return registry.get(existingId);
  const cfg=config;
  if(owner.position&&cfg.spawn.x===0&&cfg.spawn.y===0&&cfg.spawn.z===0){
    cfg.spawn={x:finite(owner.position.x,0),y:finite(owner.position.y,0),z:finite(owner.position.z,0),heading:owner.rotation?finite(owner.rotation.y,0):0};
  }
  const preferred=owner.userData&&(owner.userData.logicInstanceId||owner.userData.editorId)||cfg.id||((opts.idPrefix||'character-pawn-')+nextPawnId++);
  const state=Object.assign({speed:0,speedKmh:0,moving:false,sprinting:false,grounded:true,airborne:false,action:null,actionTime:0,velocityX:0,velocityY:0,velocityZ:0,heading:cfg.spawn.heading},opts.state||{});
  const core=window.LK_RUNTIME_PAWN_CORE;
  const pawn=core?core.createRecord({
    id:String(preferred),kind:'logic-element',config:cfg,state,
    onPossess:(record,playerId,force)=>registry.claimPlayerSlot?registry.claimPlayerSlot(record,playerId,force):false,
    onUnpossess:record=>{ const playerId=record.playerId; if(registry.releasePlayerSlot) registry.releasePlayerSlot(record); record.playerId=null; record.possessed=false; if(playerId!=null) emitPawnEvent(record,'OnPawnUnpossessed',{playerId}); return true; },
  }):null;
  if(!pawn) return null;
  pawn.pawnType=opts.pawnType||'character';
  pawn.owner=owner;
  pawn.services=services||{};
  pawn.control=null;
  pawn.locomotion=null;
  pawn.locomotionNode=null;
  pawn.clothController=null;
  pawn.clothNode=null;
  pawn.locomotionKind=null; // 'model' (GLB-driven) or 'placeholder' (procedural)
  pawn.placeholderAttempted=false;
  pawn.appearanceApplied=false;
  pawn.libraryClips=null;
  pawn.libraryLoadKey=null;
  pawn.movementController=window.LK_RUNTIME_CHARACTER_MOVEMENT?window.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME,cfg.movement):null;
  pawn.actionStartedEvent=opts.actionStartedEvent||'OnCharacterActionStarted';
  pawn.actionFinishedEvent=opts.actionFinishedEvent||'OnCharacterActionFinished';
  pawn.actionPayload=typeof opts.actionPayload==='function'?opts.actionPayload:()=>({});

  pawn.readPlayerDrive=function(){
    if(!this.possessed||this.playerId==null||!GAME||!GAME.input||!GAME.input.player) return neutralMove();
    if(GAME.input.ensurePlayerSlot) GAME.input.ensurePlayerSlot(this.playerId-1);
    const view=GAME.input.player(this.playerId-1),drive=view&&view.drive?view.drive('character'):null;
    if(!drive) return neutralMove();
    return {x:clamp(finite(drive.steer,0),-1,1),z:clamp(finite(drive.throttle,0)-finite(drive.brake,0),-1,1),sprint:drive.sprint===true,jump:drive.reset===true,action:drive.highBeams===true,lookX:clamp(finite(drive.cameraLookX,0),-1,1),lookY:clamp(finite(drive.cameraLookY,0),-1,1),fire:drive.fire===true,aim:drive.aim===true,reload:drive.reload===true,crouch:drive.crouch===true,slowWalk:drive.slowWalk===true,interact:drive.interact===true,pickup:drive.pickup===true,dropItem:drive.dropItem===true,nextWeapon:drive.nextWeapon===true,useItem:drive.useItem===true,dodge:drive.dodge===true,swapShoulder:drive.swapShoulder===true,leanLeft:drive.leanLeft===true,leanRight:drive.leanRight===true,slot1:drive.slot1===true,slot2:drive.slot2===true,slot3:drive.slot3===true,slot4:drive.slot4===true,slot5:drive.slot5===true,slot6:drive.slot6===true,slot7:drive.slot7===true,inventory:drive.inventory===true,viewToggle:drive.cameraMode===true,device:view&&view.device?view.device():null};
  };
  // A graph authors MOVEMENT; look, fire, aim and reload come from the device
  // and no movement node has pins for them. Replacing the whole command with a
  // movement-only object therefore zeroed the combat channels every frame, so
  // any Pawn driven from its own graph — which is every character template —
  // silently could not shoot or aim. Unmentioned device channels pass through;
  // a graph that really wants to suppress firing still just passes fire:false.
  const DEVICE_CHANNELS=['lookX','lookY','fire','aim','reload','crouch','slowWalk','interact','pickup','dropItem','nextWeapon','useItem','dodge','swapShoulder','leanLeft','leanRight','slot1','slot2','slot3','slot4','slot5','slot6','slot7','inventory','viewToggle','device'];
  pawn.setMoveInput=function(input){
    const authored=input||{},command=Object.assign(neutralMove(),authored);
    const live=this.possessed?this.readPlayerDrive():null;
    if(live) DEVICE_CHANNELS.forEach(channel=>{ if(!(channel in authored)) command[channel]=live[channel]; });
    this.control=command;
    return this.control;
  };
  pawn.clearControl=function(){ this.control=null; };
  pawn.setMovement=function(patch){ Object.assign(this.config.movement,patch||{}); this.config.movement=window.LK_RUNTIME_CHARACTER_MOVEMENT?window.LK_RUNTIME_CHARACTER_MOVEMENT.normalizeOptions(this.config.movement):this.config.movement; if(this.locomotion)this.locomotion.configure({walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed}); if(this.movementController)this.movementController.configure(this.config.movement); return this.config.movement; };
  pawn.setAnimationLibrary=function(ref){
    let value=ref;
    if(typeof value==='string'){ const text=value.trim(); if(!text)value=null; else try{value=JSON.parse(text);}catch(err){value={src:text,name:text};} }
    this.config.animationLibrary=value&&typeof value==='object'?value:null; this.libraryClips=null; this.libraryLoadKey=null; if(this.rebindLocomotion)this.rebindLocomotion(); this.ensureAnimationLibraries(); return this.config.animationLibrary;
  };
  pawn.ensureAnimationLibraries=function(){
    const refs=[];
    if(animationLibraryKey(this.config.animationLibrary))refs.push(this.config.animationLibrary);
    Object.keys(this.config.animations||{}).forEach(slot=>{const ref=animationAssetRef(this.config.animations[slot]);if(animationLibraryKey(ref))refs.push(ref);});
    (this.config.animationSet||[]).forEach(entry=>{const ref=entry&&entry.asset;if(animationLibraryKey(ref))refs.push(ref);});
    const unique=[];const seen=new Set();refs.forEach(ref=>{const key=animationLibraryKey(ref);if(key&&!seen.has(key)){seen.add(key);unique.push(ref);}});
    const key=unique.map(animationLibraryKey).join('|');
    if(this.libraryLoadKey===key)return;
    this.libraryLoadKey=key;
    if(!key){this.libraryClips=[];return;}
    const self=this;
    Promise.all(unique.map(ref=>loadAnimationLibrary(ref).then(library=>({library})).catch(error=>({error})))).then(results=>{
      if(self.disposed||self.libraryLoadKey!==key)return;
      const libraries=results.map(result=>result.library).filter(Boolean);
      self.libraryClips=libraries.reduce((clips,library)=>clips.concat(library.clips||[]),[]);
      const names=libraries.reduce((list,library)=>list.concat(library.names||[]),[]);
      if(self.owner&&self.owner.userData){self.owner.userData.characterLibraryClipNames=names.slice();const errors=results.map(result=>result.error).filter(Boolean);if(errors.length)self.owner.userData.characterLibraryClipError=errors.map(error=>String(error&&error.message||error)).join(' | ');else delete self.owner.userData.characterLibraryClipError;}
      self.rebindLocomotion(); emitPawnEvent(self,'OnPawnAnimationsBound',{clips:names,source:'libraries'});
    });
  };
  pawn.ensureAnimationLibrary=function(){return this.ensureAnimationLibraries();};
  pawn.setLocomotion=function(patch){ Object.assign(this.config.locomotion,patch||{}); this.config.locomotion={responsiveness:clamp(finite(this.config.locomotion.responsiveness,9),.5,30),predictionTime:clamp(finite(this.config.locomotion.predictionTime,.12),0,.6)}; if(this.locomotion)this.locomotion.configure(this.config.locomotion); return this.config.locomotion; };
  pawn.setAnimations=function(patch){ this.config.animationOverrides=Object.assign({},this.config.animationOverrides||{},patch||{}); Object.assign(this.config.animations,patch||{}); this.libraryClips=null;this.libraryLoadKey=null;this.rebindLocomotion();this.ensureAnimationLibraries();return this.config.animations; };
  pawn.setAnimationSet=function(entries){this.config.animationSet=Array.isArray(entries)?clone(entries):[];this.libraryClips=null;this.libraryLoadKey=null;this.rebindLocomotion();this.ensureAnimationLibraries();return this.config.animationSet;};
  pawn.setAppearance=function(patch){ Object.assign(this.config.appearance,patch||{}); this.appearanceApplied=false; return this.config.appearance; };
  pawn.setCloth=function(patch){
    const next=Object.assign({},this.config.cloth||{},patch||{});
    this.config.cloth=window.LK_RUNTIME_CLOTH?window.LK_RUNTIME_CLOTH.normalizeConfig(next):next;
    if(this.clothController)this.clothController.dispose();this.clothController=null;this.clothNode=null;
    return this.config.cloth;
  };
  pawn.setCamera=function(patch){ const next=Object.assign({},patch||{}),presets=window.LK_RUNTIME_CHARACTER_MOVEMENT&&window.LK_RUNTIME_CHARACTER_MOVEMENT.VIEW_PRESETS; if(next.view&&presets&&presets[next.view])Object.assign(next,presets[next.view]); this.config.camera=Object.assign({},this.config.camera||{},next); this.config.camera.arcadeDistance=finite(this.config.camera.distance,7.5); this.config.camera.arcadeHeight=finite(this.config.camera.height,2.6); this.config.camera.arcadeLag=finite(this.config.camera.lag,6.5); this.cameraRuntime=null; return this.config.camera; };
  pawn.possessCamera=function(value){
    if(!GAME||!GAME.state)return false;
    const playerId=normalizePlayerId(this.playerId),outputs=GAME.state.runtimeVehicleCameraPawnIds||(GAME.state.runtimeVehicleCameraPawnIds={});
    if(value===false){Object.keys(outputs).forEach(key=>{if(outputs[key]===this.id)delete outputs[key];});if(GAME.state.runtimeVehicleCameraPawnId===this.id)GAME.state.runtimeVehicleCameraPawnId=null;return true;}
    if(playerId==null)return false; outputs[playerId]=this.id;if(playerId===1)GAME.state.runtimeVehicleCameraPawnId=this.id;return true;
  };
  pawn.setHidden=function(value){this.hidden=value===true;this.config.hidden=this.hidden;if(this.owner)this.owner.visible=!this.hidden;return this.hidden;};
  pawn.findLocomotionNode=function(){let modelHolder=null,mixer=null,genericHolder=null;if(this.owner&&this.owner.traverse)this.owner.traverse(node=>{const data=node.userData||{};if(!modelHolder&&data.logicElementSceneId==='character_model'&&data.logicElementAssetKey)modelHolder=node;if(!mixer&&data.logicAnimationMixer)mixer=node;if(!genericHolder&&data.logicElementAssetKey)genericHolder=node;});const hasVisual=root=>{let found=false;if(root&&root.traverse)root.traverse(node=>{if(node&&node.userData&&node.userData.logicElementAssetVisual)found=true;});return found;};if(modelHolder&&hasVisual(modelHolder))return modelHolder;if(mixer&&hasVisual(mixer))return mixer;if(genericHolder&&hasVisual(genericHolder))return genericHolder;return null;};
  pawn.rebindLocomotion=function(){if(this.locomotion)this.locomotion.dispose();if(this.clothController)this.clothController.dispose();this.locomotion=null;this.locomotionNode=null;this.locomotionKind=null;this.clothController=null;this.clothNode=null;this.placeholderAttempted=false;this.appearanceApplied=false;};
  // Locomotion prefers a bound GLB (model) and re-checks for one every call
  // while unbound, matching the pre-existing per-frame check cost for the
  // no-GLB case. Once a GLB successfully binds it "locks in" and skips the
  // traversal. Until then — or if no model is ever assigned — the procedural
  // placeholder animator (character-placeholder-locomotion.js) takes over so
  // movement always reads visually, even before a rigged model exists.
  pawn.ensureLocomotion=function(){
    const currentNode=this.findLocomotionNode();
    if(this.locomotionKind==='model'&&this.locomotion&&this.locomotion.isBound()&&this.locomotionNode===currentNode&&currentNode&&currentNode.parent)return this.locomotion;
    this.ensureAnimationLibraries();
    const runtime=window.LK_RUNTIME_CHARACTER_LOCOMOTION||window.LK_RUNTIME_SOCCER_LOCOMOTION;
    const node=currentNode;
    if(runtime&&node&&node!==this.locomotionNode){
      const controller=runtime.createController({THREERef:window.THREE,walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed,responsiveness:this.config.locomotion.responsiveness,predictionTime:this.config.locomotion.predictionTime,animationSet:this.config.animationSet,role:this.config.role||opts.pawnType||'character'});
      if(controller.bind(node,this.config.animations,this.libraryClips,this.config.animationSet)){
        if(this.locomotion)this.locomotion.dispose();
        this.locomotion=controller;this.locomotionNode=node;this.locomotionKind='model';
        this.owner.userData.characterAnimationClips=controller.availableClips();
        this.owner.userData.characterAnimationBinding=node.userData&&node.userData.characterAnimationBinding||null;
        emitPawnEvent(this,'OnPawnAnimationsBound',{clips:controller.availableClips()});
        return this.locomotion;
      }
    }
    if(!node){
      if(this.locomotionKind==='placeholder'&&this.locomotion)return this.locomotion;
      const placeholderRuntime=window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
      if(!this.placeholderAttempted&&placeholderRuntime){
        this.placeholderAttempted=true;
        const controller=placeholderRuntime.createController({walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed,responsiveness:this.config.locomotion.responsiveness,predictionTime:this.config.locomotion.predictionTime});
        if(controller.bind(this.owner)){
          if(this.locomotion)this.locomotion.dispose();
          this.locomotion=controller;this.locomotionNode=null;this.locomotionKind='placeholder';
          return this.locomotion;
        }
      }
    }
    return this.locomotion&&this.locomotion.isBound()?this.locomotion:null;
  };
  pawn.ensureCloth=function(){
    const runtime=window.LK_RUNTIME_CLOTH,node=this.findLocomotionNode();
    if(!runtime||!node||!this.config.cloth||this.config.cloth.enabled===false){if(this.clothController)this.clothController.dispose();this.clothController=null;this.clothNode=null;return null;}
    if(this.clothController&&this.clothNode===node)return this.clothController;
    if(this.clothController)this.clothController.dispose();
    this.clothController=runtime.create(node,this.config.cloth,{pawn:this});this.clothNode=node;
    if(this.owner&&this.owner.userData)this.owner.userData.characterCloth=this.clothController.stats();
    return this.clothController;
  };
  pawn.playAction=function(name,actionOptions){
    const action=String(name||'').trim();if(!action)return false;
    const actionOpts=actionOptions||{},clip=this.config.animations[action]||action,locomotion=this.ensureLocomotion();
    this.state.action=action;this.state.actionTime=0;emitPawnEvent(this,this.actionStartedEvent,Object.assign({action},this.actionPayload(this,action)));
    const finish=()=>{if(this.state.action===action)this.state.action=null;emitPawnEvent(this,this.actionFinishedEvent,Object.assign({action},this.actionPayload(this,action)));};
    const playableClip=this.locomotionKind==='placeholder'?animationClipName(clip):clip;
    if(!(locomotion&&locomotion.playAction(playableClip,Object.assign({onDone:finish,slot:action},actionOpts)))){this.state.actionFallbackTimer=clamp(finite(actionOpts.duration,.8),.1,5);this.state.actionFallbackFinish=finish;}
    return true;
  };
  pawn.jump=function(){if(!this.movementController||this.state.diving)return false;if(!this.movementController.jump())return false;if(this.possessed&&GAME.systems&&GAME.systems.characterAudio)GAME.systems.characterAudio.jump(this);const locomotion=this.ensureLocomotion(),hasMotionJump=(this.config.animationSet||[]).some(entry=>entry&&entry.state==='jump');if(locomotion&&this.config.animations.jump&&!hasMotionJump){const clip=this.locomotionKind==='placeholder'?animationClipName(this.config.animations.jump):this.config.animations.jump;locomotion.playAction(clip,{fadeIn:.06,fadeOut:.14,slot:'jump'});}emitPawnEvent(this,this.actionStartedEvent,Object.assign({action:'jump'},this.actionPayload(this,'jump')));return true;};
  // What the body should be DOING with the weapon this frame. It is read by the
  // procedural placeholder directly, and is the same signal a Motion Set uses to
  // pick a real carry/aim clip once one is bound.
  pawn.weaponPose=function(){
    const rig=this.firstPerson;
    if(!rig||!rig.armed||!rig.armed())return null;
    const weapon=rig.config().weapon;
    return {
      carry:1,
      // Firing counts as aiming for the body even when the sights are not up:
      // the arms come to the weapon, which is what "shooting on the move" looks
      // like from outside.
      aim:Math.max(Math.max(0,Math.min(1,Number(rig.state.ads)||0)), rig.state.cooldown>0?.75:0),
      pitch:(rig.aimAngles?rig.aimAngles():rig.viewAngles()).pitch,
      side:rig.weaponSide?rig.weaponSide():1,
      // A sidearm is held in one hand; everything else is shouldered.
      twoHanded:weapon.preset!=='pistol'&&weapon.kind!=='unarmed'&&weapon.kind!=='thrown',
      // Where the support hand should land, reported by the view model from the
      // weapon it is actually drawing. Absent while in first person, which is
      // correct: there is no third-person body to solve for.
      supportTarget:rig.state.supportGrip||null,
      firing:rig.state.cooldown>0,
      reloading:rig.state.reloading===true,
    };
  };
  pawn.applyAppearance=function(){const applied=applyAppearanceToNode(this.owner,this.config.appearance);this.appearanceApplied=true;return applied;};
  pawn.applyBinding=function(path,value){const key=String(path||'');if(key.indexOf('firstPerson.')===0){return !!(this.firstPerson&&this.firstPerson.applyBinding(key,value));}if(key.indexOf('abilities.')===0){return !!(this.abilities&&this.abilities.applyBinding(key,value));}if(key.indexOf('vitals.')===0){return !!(this.vitals&&this.vitals.applyBinding(key,value));}if(key==='animationLibrary'){this.setAnimationLibrary(value);return true;}if(key==='animationSet'){this.setAnimationSet(value);return true;}if(key.indexOf('movement.')===0){this.setMovement({[key.slice(9)]:value});return true;}if(key.indexOf('locomotion.')===0){this.setLocomotion({[key.slice(11)]:value});return true;}if(key.indexOf('animations.')===0){this.setAnimations({[key.slice(11)]:value});return true;}if(key.indexOf('appearance.')===0){this.setAppearance({[key.slice(11)]:value});return true;}if(key.indexOf('cloth.')===0){this.setCloth({[key.slice(6)]:value});return true;}if(key.indexOf('camera.')===0){this.setCamera({[key.slice(7)]:value});return true;}return false;};
  pawn.reset=function(){const spawn=this.config.spawn;if(this.owner&&this.owner.position)this.owner.position.set(spawn.x,spawn.y,spawn.z);if(this.owner&&this.owner.rotation)this.owner.rotation.y=spawn.heading;Object.assign(this.state,{velocityX:0,velocityY:0,velocityZ:0,heading:spawn.heading,action:null});if(this.movementController)this.movementController.reset(spawn.heading);emitPawnEvent(this,'OnPawnReset',{});return true;};
  // Interact / pick up / drop are edge-triggered verbs, not movement, and they
  // work identically in first and third person. They live on the Pawn rather
  // than in the first-person rig for exactly that reason.
  // `interactHeld` is what turns one key into two verbs: a tap uses whatever is
  // in front, a hold picks it up. `pickupProgress` is published for the HUD ring
  // so the bar the player watches and the timer that fires are the same number.
  pawn.verbs={interact:false,pickup:false,dropItem:false,nextWeapon:false,useItem:false,
    dropHeld:0,interactHeld:0,pickupProgress:0,pickupDone:false,
    inventory:false,inventoryHeld:0,inventoryView:'none'};
  // How long Use has to be held to take an item. Long enough to be deliberate,
  // short enough not to feel like a punishment.
  const PICKUP_HOLD_SECONDS=.55;
  // Long enough that a quick tap is never mistaken for a hold, short enough that
  // reaching for the backpack does not feel like waiting.
  const INVENTORY_HOLD_SECONDS=.35;
  pawn.stepWorldVerbs=function(dt,move){
    const input=move||{},systems=GAME&&GAME.systems||{};
    const pressed=(name)=>{const now=input[name]===true,was=this.verbs[name]===true;this.verbs[name]=now;return now&&!was;};
    // --- Use: tap versus hold ------------------------------------------------
    // With an item in front, holding fills a ring and takes it; a tap lifts it
    // and carries it instead. With no item in front the key acts on press, so a
    // door or a ladder never waits for a timer it does not need.
    const takeable=systems.items&&systems.items.focus?systems.items.focus(this):null;
    const holding=input.interact===true;
    const justPressed=holding&&this.verbs.interact!==true;
    if(justPressed&&!takeable){
      const used=systems.interactions?systems.interactions.trigger(this):null;
      if(!used&&this.abilities&&this.abilities.tryTraversal)this.abilities.tryTraversal();
      this.verbs.pickupDone=true;
    } else if(justPressed){
      this.verbs.interactHeld=0;
      this.verbs.pickupDone=false;
    }
    if(holding&&takeable&&!this.verbs.pickupDone){
      this.verbs.interactHeld+=dt;
      this.verbs.pickupProgress=Math.min(1,this.verbs.interactHeld/PICKUP_HOLD_SECONDS);
      if(this.verbs.pickupProgress>=1){
        if(systems.items)systems.items.pickup(this);
        this.verbs.pickupDone=true;
        this.verbs.pickupProgress=0;
      }
    } else if(!holding){
      // Released early over an item: that was a tap, so it means "lift it".
      if(this.verbs.interact===true&&!this.verbs.pickupDone&&this.verbs.interactHeld>0){
        const used=systems.interactions?systems.interactions.trigger(this):null;
        if(!used&&this.abilities&&this.abilities.tryTraversal)this.abilities.tryTraversal();
      }
      this.verbs.interactHeld=0;
      this.verbs.pickupProgress=0;
      this.verbs.pickupDone=false;
    }
    this.verbs.interact=holding;
    // The dedicated pickup key stays functional for projects that bind one.
    if(pressed('pickup')&&systems.items)systems.items.pickup(this);
    if(pressed('nextWeapon')&&this.inventory)this.inventory.cycle(1);

    // --- Inventory: tap opens the weapon wheel, hold opens the backpack ------
    // Same shape as Use: the hold threshold separates the two, and the wheel
    // closes on the next tap so it can never trap the player in a menu.
    const invDown=input.inventory===true;
    if(invDown&&this.verbs.inventory!==true)this.verbs.inventoryHeld=0;
    if(invDown){
      this.verbs.inventoryHeld+=dt;
      if(this.verbs.inventoryHeld>=INVENTORY_HOLD_SECONDS)this.verbs.inventoryView='pack';
    } else if(this.verbs.inventory===true){
      // Released: a short press toggles the wheel, and letting go of a long one
      // puts the backpack away.
      if(this.verbs.inventoryHeld<INVENTORY_HOLD_SECONDS){
        this.verbs.inventoryView=this.verbs.inventoryView==='wheel'?'none':'wheel';
      } else this.verbs.inventoryView='none';
      this.verbs.inventoryHeld=0;
    }
    this.verbs.inventory=invDown;

    // The number row selects a ROLE, not a position: 1 is always the fists and
    // 7 always the grenades, whatever order things were picked up in. Choosing
    // one closes the wheel, because the player has already chosen.
    for(let slot=1;slot<=7;slot++){
      if(!pressed('slot'+slot))continue;
      if(this.inventory&&this.inventory.equipSlotIndex)this.inventory.equipSlotIndex(slot-1);
      if(this.verbs.inventoryView==='wheel')this.verbs.inventoryView='none';
    }
    // Only a backpack inventory stores anything; in the other modes this is inert.
    if(pressed('useItem')&&this.inventory&&this.inventory.useFromPack)this.inventory.useFromPack(0);
    // Holding Drop winds up a throw; releasing it lets go. A tap therefore
    // places the weapon at your feet and a hold hurls it.
    if(input.dropItem===true){this.verbs.dropHeld=Math.min(1,this.verbs.dropHeld+dt/.6);}
    else if(this.verbs.dropHeld>0){
      if(systems.items)systems.items.dropWeapon(this,this.verbs.dropHeld);
      this.verbs.dropHeld=0;
    }
    this.verbs.dropItem=input.dropItem===true;
  };
  const coreStart=pawn.start.bind(pawn);
  pawn.start=function(){coreStart();this.setHidden(this.hidden);return this;};
  pawn.step=function(dt){
    if(!this.started||this.sleeping||this.disposed||!this.enabled)return;
    const h=clamp(finite(dt,.016),.0001,.1),move=this.control?this.control:this.readPlayerDrive();
    if(this.state.actionFallbackTimer>0){this.state.actionFallbackTimer-=h;if(this.state.actionFallbackTimer<=0&&this.state.actionFallbackFinish){const finish=this.state.actionFallbackFinish;this.state.actionFallbackFinish=null;finish();}}
    this.state.actionTime+=h;
    if(this.possessed)this.stepWorldVerbs(h,move);
    if(typeof this.beforeMovementStep==='function'&&this.beforeMovementStep(h,move)===true)return;
    if(move.jump===true)this.jump();
    const scale=typeof this.movementScale==='function'?clamp(finite(this.movementScale(move),1),0,1):1;
    const snapshot=this.movementController?this.movementController.step(this.owner,{x:clamp(finite(move.x,0),-1,1)*scale,z:clamp(finite(move.z,0),-1,1)*scale,sprint:move.sprint===true},h,this.config.spawn.y):{speed:0,speedKmh:0,moving:false,sprinting:false,grounded:true,airborne:false,velocityX:0,velocityY:0,velocityZ:0};
    Object.assign(this.state,{velocityX:snapshot.velocityX,velocityY:snapshot.velocityY,velocityZ:snapshot.velocityZ,heading:this.owner&&this.owner.rotation?this.owner.rotation.y:this.state.heading,speed:snapshot.speed,speedKmh:snapshot.speedKmh,moving:snapshot.moving,sprinting:snapshot.sprinting,grounded:snapshot.grounded,airborne:snapshot.airborne});
    const locomotion=this.ensureLocomotion();if(locomotion){const facing=this.owner&&this.owner.rotation?this.owner.rotation.y:0,localX=Math.cos(facing)*this.state.velocityX-Math.sin(facing)*this.state.velocityZ,localZ=Math.sin(facing)*this.state.velocityX+Math.cos(facing)*this.state.velocityZ;const previousSpeed=finite(this.state.animationPreviousSpeed,this.state.speed);locomotion.update({x:localX,z:localZ,speed:this.state.speed,velocityY:this.state.velocityY,grounded:this.state.grounded,justLanded:snapshot.justLanded===true,sprinting:this.state.sprinting,acceleration:(this.state.speed-previousSpeed)/h,action:this.state.action,weapon:this.weaponPose(),lean:this.firstPerson&&this.firstPerson.leanAmount?this.firstPerson.leanAmount():0},h);this.state.animationPreviousSpeed=this.state.speed;}
    this.state.surface=snapshot.surface||null;
    // Footsteps, landings and breathing belong to the Pawn, not to any one
    // camera mode, so first and third person get them from the same place.
    // Only a possessed Pawn is audible: remote and AI characters would need
    // spatialisation, which the set does not model yet.
    if(this.possessed&&GAME.systems&&GAME.systems.characterAudio)GAME.systems.characterAudio.pawnFrame(this,h,snapshot);
    if(!this.appearanceApplied)this.applyAppearance();
    const cloth=this.ensureCloth();if(cloth)cloth.update(h);
    if(typeof this.afterMovementStep==='function')this.afterMovementStep(h,move,snapshot);
  };
  pawn.dispose=function(){if(this.disposed)return false;this.disposed=true;this.started=false;this.control=null;this.possessCamera(false);if(this.locomotion)this.locomotion.dispose();if(this.clothController)this.clothController.dispose();this.locomotion=null;this.clothController=null;this.clothNode=null;registry.unregister(this);if(this.owner&&this.owner.userData){delete this.owner.userData[ownerKey];delete this.owner.userData.vehiclePawnId;delete this.owner.userData.characterCloth;}return true;};
  // Traversal, vitals and the first-person rig all compose onto the same movement
  // hooks. Order matters and is fixed here, not by whoever attaches last:
  //
  //   vitals     runs after movement; never suppresses it
  //   abilities  may TAKE OVER the frame (vault, mantle, climb)
  //   firstPerson runs its view/weapon step FIRST so aiming keeps working while
  //              a traversal owns the body — it wraps the abilities hook.
  //
  // Every block is opt-in: a Pawn config without them keeps the untouched
  // third-person path.
  pawn.vitals=cfg.vitals&&window.LK_RUNTIME_CHARACTER_VITALS
    ?window.LK_RUNTIME_CHARACTER_VITALS.attach(GAME,pawn,cfg.vitals)
    :null;
  pawn.abilities=cfg.abilities&&window.LK_RUNTIME_CHARACTER_ABILITIES
    ?window.LK_RUNTIME_CHARACTER_ABILITIES.attach(GAME,pawn,cfg.abilities)
    :null;
  pawn.firstPerson=cfg.firstPerson&&window.LK_RUNTIME_FIRST_PERSON
    ?window.LK_RUNTIME_FIRST_PERSON.attach(GAME,pawn,cfg.firstPerson)
    :null;
  // The inventory is what makes a weapon a droppable, swappable object rather
  // than a fixed field of the rig. It only exists where a rig can hold one.
  pawn.inventory=pawn.firstPerson&&window.LK_RUNTIME_ITEMS
    ?window.LK_RUNTIME_ITEMS.createInventory(pawn,cfg.inventory||{},{
      // A full loadout swaps rather than refusing a pickup; the weapon that
      // leaves goes back into the level instead of being destroyed.
      onOverflow:entry=>{
        const items=GAME&&GAME.systems&&GAME.systems.items;
        if(!items||!pawn.owner)return;
        // Tossed forward and to the side, never onto the player's own feet: a
        // weapon spawned inside the pickup radius is picked straight back up.
        const yaw=pawn.owner.rotation?pawn.owner.rotation.y:0;
        const fx=Math.sin(yaw),fz=Math.cos(yaw);
        items.spawnItem({kind:'weapon',name:entry.weapon.name,weapon:entry.weapon,radius:1.6},
          {x:pawn.owner.position.x+fx*1.1,y:pawn.owner.position.y+1.1,z:pawn.owner.position.z+fz*1.1},
          {velocity:{x:fx*2.6,y:1.4,z:fz*2.6}});
      },
    })
    :null;
  if(pawn.inventory&&pawn.firstPerson&&!pawn.firstPerson.config().startUnarmed){
    // The configured loadout becomes inventory slot 0, so the weapon the Pawn
    // spawns with can be dropped and picked back up like any other.
    pawn.inventory.add(pawn.firstPerson.config().weapon);
  }
  (Array.isArray(cfg.loadout)?cfg.loadout:[]).forEach(entry=>{ if(pawn.inventory)pawn.inventory.add(entry); });
  if(!owner.userData)owner.userData={};owner.userData[ownerKey]=pawn.id;owner.userData.vehiclePawnId=pawn.id;registry.register(pawn);return pawn;
}

window.LK_RUNTIME_CHARACTER_PAWN_BASE=Object.freeze({normalizeCommonConfig,normalizePlayerId,neutralMove,loadAnimationLibrary,animationLibraryKey,animationBindingSpec,animationClipName,animationAssetRef,emitPawnEvent,applyAppearanceToNode,finite,clamp,clone,create});
})();
