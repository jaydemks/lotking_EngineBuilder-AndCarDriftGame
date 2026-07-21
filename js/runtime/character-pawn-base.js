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
function neutralMove(){ return {x:0,z:0,sprint:false,jump:false,action:false,device:null}; }
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
    animationLibrary:src.animationLibrary&&typeof src.animationLibrary==='object'?clone(src.animationLibrary):null,
    locomotion:{responsiveness:clamp(finite(locomotion.responsiveness,9),.5,30),predictionTime:clamp(finite(locomotion.predictionTime,.12),0,.6)},
    animations:Object.assign({},base.animations||{},src.animations||{}),
    appearance:Object.assign({},base.appearance||{},src.appearance||{}),
    camera:Object.assign({mode:'arcade',view:'third',distance:7.5,height:2.6,lag:6.5,fov:60},base.camera||{},src.camera||{}),
  });
}
function animationLibraryKey(ref){ return ref&&typeof ref==='object'?String(ref.dbKey||ref.key||ref.id||ref.src||''):''; }
function resolveAssetUrl(ref){
  if(ref.dbKey&&window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(ref.dbKey);
  if(ref.src) return Promise.resolve(ref.src);
  return Promise.reject(new Error('Animation library source missing'));
}
function loadAnimationLibrary(ref){
  const key=animationLibraryKey(ref);
  if(!key) return Promise.resolve(null);
  let pending=animationLibraryCache.get(key);
  if(!pending){
    pending=resolveAssetUrl(ref).then(url=>new Promise((resolve,reject)=>{
      const THREE=window.THREE;
      if(!THREE||!THREE.GLTFLoader) return reject(new Error('GLTFLoader unavailable'));
      new THREE.GLTFLoader().load(url,gltf=>{
        const clips=(gltf&&gltf.animations||[]).filter(Boolean);
        resolve({clips,names:clips.map(clip=>clip.name||'Animation')});
      },undefined,reject);
    }));
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
    const view=GAME.input.player(this.playerId-1),drive=view&&view.drive?view.drive():null;
    if(!drive) return neutralMove();
    return {x:clamp(finite(drive.steer,0),-1,1),z:clamp(finite(drive.throttle,0)-finite(drive.brake,0),-1,1),sprint:drive.handbrake===true,jump:drive.reset===true,action:drive.highBeams===true,device:view&&view.device?view.device():null};
  };
  pawn.setMoveInput=function(input){ this.control=Object.assign(neutralMove(),input||{}); return this.control; };
  pawn.clearControl=function(){ this.control=null; };
  pawn.setMovement=function(patch){ Object.assign(this.config.movement,patch||{}); this.config.movement=window.LK_RUNTIME_CHARACTER_MOVEMENT?window.LK_RUNTIME_CHARACTER_MOVEMENT.normalizeOptions(this.config.movement):this.config.movement; if(this.locomotion)this.locomotion.configure({walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed}); if(this.movementController)this.movementController.configure(this.config.movement); return this.config.movement; };
  pawn.setAnimationLibrary=function(ref){
    let value=ref;
    if(typeof value==='string'){ const text=value.trim(); if(!text)value=null; else try{value=JSON.parse(text);}catch(err){value={src:text,name:text};} }
    this.config.animationLibrary=value&&typeof value==='object'?value:null; this.libraryClips=null; this.libraryLoadKey=null; this.ensureAnimationLibrary(); return this.config.animationLibrary;
  };
  pawn.ensureAnimationLibrary=function(){
    const key=animationLibraryKey(this.config.animationLibrary);
    if(!key||this.libraryLoadKey===key) return;
    this.libraryLoadKey=key;
    const self=this;
    loadAnimationLibrary(this.config.animationLibrary).then(library=>{
      if(!library||self.disposed||self.libraryLoadKey!==key)return;
      self.libraryClips=library.clips;
      if(self.owner&&self.owner.userData) self.owner.userData.characterLibraryClipNames=library.names.slice();
      self.rebindLocomotion(); emitPawnEvent(self,'OnPawnAnimationsBound',{clips:library.names,source:'library'});
    }).catch(err=>{ if(self.owner&&self.owner.userData)self.owner.userData.characterLibraryClipError=String(err&&err.message||err); });
  };
  pawn.setLocomotion=function(patch){ Object.assign(this.config.locomotion,patch||{}); this.config.locomotion={responsiveness:clamp(finite(this.config.locomotion.responsiveness,9),.5,30),predictionTime:clamp(finite(this.config.locomotion.predictionTime,.12),0,.6)}; if(this.locomotion)this.locomotion.configure(this.config.locomotion); return this.config.locomotion; };
  pawn.setAnimations=function(patch){ this.config.animationOverrides=Object.assign({},this.config.animationOverrides||{},patch||{}); Object.assign(this.config.animations,patch||{}); this.rebindLocomotion(); return this.config.animations; };
  pawn.setAppearance=function(patch){ Object.assign(this.config.appearance,patch||{}); this.appearanceApplied=false; return this.config.appearance; };
  pawn.setCamera=function(patch){ const next=Object.assign({},patch||{}),presets=window.LK_RUNTIME_CHARACTER_MOVEMENT&&window.LK_RUNTIME_CHARACTER_MOVEMENT.VIEW_PRESETS; if(next.view&&presets&&presets[next.view])Object.assign(next,presets[next.view]); this.config.camera=Object.assign({},this.config.camera||{},next); this.config.camera.arcadeDistance=finite(this.config.camera.distance,7.5); this.config.camera.arcadeHeight=finite(this.config.camera.height,2.6); this.config.camera.arcadeLag=finite(this.config.camera.lag,6.5); this.cameraRuntime=null; return this.config.camera; };
  pawn.possessCamera=function(value){
    if(!GAME||!GAME.state)return false;
    const playerId=normalizePlayerId(this.playerId),outputs=GAME.state.runtimeVehicleCameraPawnIds||(GAME.state.runtimeVehicleCameraPawnIds={});
    if(value===false){Object.keys(outputs).forEach(key=>{if(outputs[key]===this.id)delete outputs[key];});if(GAME.state.runtimeVehicleCameraPawnId===this.id)GAME.state.runtimeVehicleCameraPawnId=null;return true;}
    if(playerId==null)return false; outputs[playerId]=this.id;if(playerId===1)GAME.state.runtimeVehicleCameraPawnId=this.id;return true;
  };
  pawn.setHidden=function(value){this.hidden=value===true;this.config.hidden=this.hidden;if(this.owner)this.owner.visible=!this.hidden;return this.hidden;};
  pawn.findLocomotionNode=function(){let mixer=null,holder=null;if(this.owner&&this.owner.traverse)this.owner.traverse(node=>{if(!mixer&&node.userData&&node.userData.logicAnimationMixer)mixer=node;if(!holder&&node.userData&&node.userData.logicElementAssetKey)holder=node;});return mixer||holder;};
  pawn.rebindLocomotion=function(){if(this.locomotion)this.locomotion.dispose();this.locomotion=null;this.locomotionNode=null;this.appearanceApplied=false;};
  pawn.ensureLocomotion=function(){
    if(this.locomotion&&this.locomotion.isBound())return this.locomotion;
    const runtime=window.LK_RUNTIME_CHARACTER_LOCOMOTION||window.LK_RUNTIME_SOCCER_LOCOMOTION;
    if(!runtime)return null;
    this.ensureAnimationLibrary();const node=this.findLocomotionNode();if(!node||node===this.locomotionNode)return null;
    const controller=runtime.createController({THREERef:window.THREE,walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed,responsiveness:this.config.locomotion.responsiveness,predictionTime:this.config.locomotion.predictionTime});
    if(controller.bind(node,this.config.animations,this.libraryClips)){this.locomotion=controller;this.locomotionNode=node;this.owner.userData.characterAnimationClips=controller.availableClips();emitPawnEvent(this,'OnPawnAnimationsBound',{clips:controller.availableClips()});}
    return this.locomotion;
  };
  pawn.playAction=function(name,actionOptions){
    const action=String(name||'').trim();if(!action)return false;
    const actionOpts=actionOptions||{},clip=this.config.animations[action]||action,locomotion=this.ensureLocomotion();
    this.state.action=action;this.state.actionTime=0;emitPawnEvent(this,this.actionStartedEvent,Object.assign({action},this.actionPayload(this,action)));
    const finish=()=>{if(this.state.action===action)this.state.action=null;emitPawnEvent(this,this.actionFinishedEvent,Object.assign({action},this.actionPayload(this,action)));};
    if(!(locomotion&&locomotion.playAction(clip,Object.assign({onDone:finish},actionOpts)))){this.state.actionFallbackTimer=clamp(finite(actionOpts.duration,.8),.1,5);this.state.actionFallbackFinish=finish;}
    return true;
  };
  pawn.jump=function(){if(!this.movementController||this.state.diving)return false;if(!this.movementController.jump())return false;const locomotion=this.ensureLocomotion();if(locomotion&&this.config.animations.jump)locomotion.playAction(this.config.animations.jump,{fadeIn:.06,fadeOut:.14});emitPawnEvent(this,this.actionStartedEvent,Object.assign({action:'jump'},this.actionPayload(this,'jump')));return true;};
  pawn.applyAppearance=function(){const applied=applyAppearanceToNode(this.owner,this.config.appearance);this.appearanceApplied=true;return applied;};
  pawn.applyBinding=function(path,value){const key=String(path||'');if(key==='animationLibrary'){this.setAnimationLibrary(value);return true;}if(key.indexOf('movement.')===0){this.setMovement({[key.slice(9)]:value});return true;}if(key.indexOf('locomotion.')===0){this.setLocomotion({[key.slice(11)]:value});return true;}if(key.indexOf('animations.')===0){this.setAnimations({[key.slice(11)]:value});return true;}if(key.indexOf('appearance.')===0){this.setAppearance({[key.slice(11)]:value});return true;}if(key.indexOf('camera.')===0){this.setCamera({[key.slice(7)]:value});return true;}return false;};
  pawn.reset=function(){const spawn=this.config.spawn;if(this.owner&&this.owner.position)this.owner.position.set(spawn.x,spawn.y,spawn.z);if(this.owner&&this.owner.rotation)this.owner.rotation.y=spawn.heading;Object.assign(this.state,{velocityX:0,velocityY:0,velocityZ:0,heading:spawn.heading,action:null});if(this.movementController)this.movementController.reset(spawn.heading);emitPawnEvent(this,'OnPawnReset',{});return true;};
  const coreStart=pawn.start.bind(pawn);
  pawn.start=function(){coreStart();this.setHidden(this.hidden);return this;};
  pawn.step=function(dt){
    if(!this.started||this.sleeping||this.disposed||!this.enabled)return;
    const h=clamp(finite(dt,.016),.0001,.1),move=this.control?this.control:this.readPlayerDrive();
    if(this.state.actionFallbackTimer>0){this.state.actionFallbackTimer-=h;if(this.state.actionFallbackTimer<=0&&this.state.actionFallbackFinish){const finish=this.state.actionFallbackFinish;this.state.actionFallbackFinish=null;finish();}}
    this.state.actionTime+=h;
    if(typeof this.beforeMovementStep==='function'&&this.beforeMovementStep(h,move)===true)return;
    if(move.jump===true)this.jump();
    const scale=typeof this.movementScale==='function'?clamp(finite(this.movementScale(move),1),0,1):1;
    const snapshot=this.movementController?this.movementController.step(this.owner,{x:clamp(finite(move.x,0),-1,1)*scale,z:clamp(finite(move.z,0),-1,1)*scale,sprint:move.sprint===true},h,this.config.spawn.y):{speed:0,speedKmh:0,moving:false,sprinting:false,grounded:true,airborne:false,velocityX:0,velocityY:0,velocityZ:0};
    Object.assign(this.state,{velocityX:snapshot.velocityX,velocityY:snapshot.velocityY,velocityZ:snapshot.velocityZ,heading:this.owner&&this.owner.rotation?this.owner.rotation.y:this.state.heading,speed:snapshot.speed,speedKmh:snapshot.speedKmh,moving:snapshot.moving,sprinting:snapshot.sprinting,grounded:snapshot.grounded,airborne:snapshot.airborne});
    const locomotion=this.ensureLocomotion();if(locomotion){const facing=this.owner&&this.owner.rotation?this.owner.rotation.y:0;locomotion.update({x:Math.cos(facing)*this.state.velocityX-Math.sin(facing)*this.state.velocityZ,z:Math.sin(facing)*this.state.velocityX+Math.cos(facing)*this.state.velocityZ},h);}
    if(!this.appearanceApplied)this.applyAppearance();
    if(typeof this.afterMovementStep==='function')this.afterMovementStep(h,move,snapshot);
  };
  pawn.dispose=function(){if(this.disposed)return false;this.disposed=true;this.started=false;this.control=null;this.possessCamera(false);if(this.locomotion)this.locomotion.dispose();this.locomotion=null;registry.unregister(this);if(this.owner&&this.owner.userData){delete this.owner.userData[ownerKey];delete this.owner.userData.vehiclePawnId;}return true;};
  if(!owner.userData)owner.userData={};owner.userData[ownerKey]=pawn.id;owner.userData.vehiclePawnId=pawn.id;registry.register(pawn);return pawn;
}

window.LK_RUNTIME_CHARACTER_PAWN_BASE=Object.freeze({normalizeCommonConfig,normalizePlayerId,neutralMove,loadAnimationLibrary,animationLibraryKey,emitPawnEvent,applyAppearanceToNode,finite,clamp,clone,create});
})();
