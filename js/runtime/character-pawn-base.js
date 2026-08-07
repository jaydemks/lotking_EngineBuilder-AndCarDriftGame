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
// ADDITIVE: `takeCover` joins the command object as one more always-present
// false channel. Nothing reads it unless a Pawn carries a `cover` block, and no
// existing channel, default or consumer changes shape because of it.
function neutralMove(){ return {x:0,z:0,sprint:false,sprintAmount:0,jump:false,action:false,shoot:false,pass:false,tackle:false,lookX:0,lookY:0,fire:false,aim:false,reload:false,crouch:false,crouchAmount:0,slowWalk:false,interact:false,pickup:false,dropItem:false,nextWeapon:false,useItem:false,dodge:false,swapShoulder:false,leanLeft:false,leanRight:false,takeCover:false,slot1:false,slot2:false,slot3:false,slot4:false,slot5:false,slot6:false,slot7:false,inventory:false,viewToggle:false,device:null}; }
function semanticDrive(pawn,drive){
  const router=window.LK_RUNTIME_PLAYER_ACTION_ROUTER;
  return router&&typeof router.filterDriveForPawn==='function'?router.filterDriveForPawn(pawn,drive):drive;
}
/** Resolve `bodyType` into a real model, motion set and palette.
 *
 *  Without this the Inspector's Body select was decorative: it wrote a string and
 *  the Pawn kept whichever mannequin its template was built with. Applied BEFORE
 *  the merge below so an author's own model or clip - which `applyBody` refuses to
 *  touch - still wins, and so a saved project that predates the select is simply
 *  left alone (no `bodyType`, nothing to apply). */
function applyBodyType(src){
  const bodies=window.LK_RUNTIME_CHARACTER_BODIES;
  if(!bodies||!src||src.bodyType==null||src.bodyType==='') return src;
  return bodies.applyBody(src,src.bodyType);
}
function normalizeCommonConfig(source, defaults){
  const src=applyBodyType(source&&typeof source==='object'?clone(source):{});
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
    locomotion:{responsiveness:clamp(finite(locomotion.responsiveness,9),.5,30),predictionTime:clamp(finite(locomotion.predictionTime,.12),0,.6),stepPoseStrength:clamp(finite(locomotion.stepPoseStrength,1),0,2)},
    animations:Object.assign({},base.animations||{},src.animations||{}),
    appearance:Object.assign({},base.appearance||{},src.appearance||{}),
    cloth:window.LK_RUNTIME_CLOTH?window.LK_RUNTIME_CLOTH.normalizeConfig(src.cloth||base.cloth||{}):Object.assign({enabled:true,pieces:[]},base.cloth||{},src.cloth||{}),
    camera:Object.assign({mode:'free',view:'third',distance:7.5,height:2.6,lag:6.5,fov:60},base.camera||{},src.camera||{}),
    entry:Object.assign({enabled:true,radius:3,exitOffset:1.65,cooldown:.65},base.entry||{},src.entry||{}),
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
  // Same short-circuit the store uses for a body: a motion library that declares
  // itself FBX must not be handed to GLTFLoader first. Nine bundled clips meant
  // nine guaranteed-failing fetches and nine GLTF errors in the console for files
  // that were never GLBs.
  // ONLY when there is no canonical GLB to try. An IMPORTED asset keeps its
  // converted GLB in `dbKey` and the original FBX in `sourceDbKey`: for that one the
  // GLB-first order is deliberate and the FBX is the fallback. A bundled asset has
  // no converted GLB at all - its `src` IS the .fbx - so trying GLTFLoader first is
  // pure waste and a misleading error.
  const canonicalGlb=!!(ref&&(ref.dbKey||(ref.src&&!/\.fbx$/i.test(String(ref.src)))));
  const declaresFbx=!canonicalGlb&&ref&&(String(ref.sourceFormat||'').toLowerCase()==='fbx'||/\.fbx$/i.test(String(ref.src||'')));
  if(declaresFbx){
    const plugin=window.LK_FBX_IMPORT_PLUGIN;
    if(plugin&&typeof plugin.loadSource==='function'&&(ref.sourceDbKey||ref.sourceSrc||ref.src)){
      const source=Object.assign({},ref,{sourceFormat:'fbx',sourceSrc:ref.sourceSrc||ref.src});
      return Promise.resolve(plugin.loadSource(source,{THREE,assetBlobs:window.LK_ASSET_BLOBS}))
        .then(root=>({root,animations:root&&root.animations||[],source:'fbx'}));
    }
  }
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
        const repair=window.LK_SKINNED_RIG_REPAIR;
        const clips=(container.animations||[]).filter(Boolean).map(clip=>{
          const tagged=clip&&clip.clone?clip.clone():clip;
          if(tagged){tagged.userData=Object.assign({},tagged.userData||{},{lkAnimationAssetKey:key,lkAnimationAssetSource:container.source});Object.defineProperty(tagged,'__lkAnimationSourceRoot',{value:container.root||null,configurable:true});}
          // Every slot is documented as in-place, because the controller supplies
          // world translation. A clip that also travels - `walking.fbx` covers
          // 1.74 m per cycle - adds its motion on top, so the character slides
          // forward and snaps back on every loop. The clone is flattened
          // horizontally; the vertical stays, being weight shift and jump lift.
          if(tagged&&repair){
            const flattened=repair.makeClipInPlace(tagged);
            if(flattened.changed)tagged.userData.lkRootMotionRemoved=flattened.drift;
          }
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
function setOwnerWorldPosition(owner,position){
  if(!owner||!owner.position||!position)return false;
  const THREE=window.THREE,parent=owner.parent;
  if(THREE&&parent&&typeof parent.worldToLocal==='function'){
    parent.updateMatrixWorld&&parent.updateMatrixWorld(true);
    owner.position.copy(parent.worldToLocal(new THREE.Vector3(position.x,position.y,position.z)));
  } else if(typeof owner.position.set==='function')owner.position.set(position.x,position.y,position.z);
  else {owner.position.x=position.x;owner.position.y=position.y;owner.position.z=position.z;}
  owner.updateMatrixWorld&&owner.updateMatrixWorld(true);
  return true;
}
function setOwnerWorldHeading(owner,heading){
  if(!owner)return false;
  const THREE=window.THREE,parent=owner.parent;
  if(THREE&&owner.quaternion){
    const worldRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),finite(heading,0));
    if(parent&&typeof parent.getWorldQuaternion==='function'){
      parent.updateMatrixWorld&&parent.updateMatrixWorld(true);
      owner.quaternion.copy(parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldRotation));
    } else owner.quaternion.copy(worldRotation);
  } else if(owner.rotation){
    owner.rotation.x=0;owner.rotation.y=finite(heading,0);owner.rotation.z=0;
  }
  owner.updateMatrixWorld&&owner.updateMatrixWorld(true);
  return true;
}
function ownerWorldHeading(owner){
  const occupancy=window.LK_RUNTIME_VEHICLE_OCCUPANCY;
  if(occupancy&&typeof occupancy.worldHeading==='function')return finite(occupancy.worldHeading(owner),0);
  return finite(owner&&owner.rotation&&owner.rotation.y,0);
}
function characterExitGroundY(GAME,vehicle,x,z,fallback,maxSurfaceY){
  const world=GAME&&GAME.world||{};let ground=finite(fallback,0);
  if(typeof world.characterGroundHeight==='function')ground=finite(world.characterGroundHeight(x,z),ground);
  const boxes=world.colliders&&Array.isArray(world.colliders.box)?world.colliders.box:[];
  boxes.forEach(collider=>{
    // A complex imported scene owns one broad bookkeeping box plus its actual
    // mesh parts. The broad box can span roads and buildings at once; its top
    // is not a floor and using it here launched a dismount to roof/sky height.
    if(!collider||collider.enabled===false||collider.walkable===false||collider.compoundRoot||collider.y==null||collider.hy==null)return;
    let node=collider.logicElementOwner||collider.owner||null,belongs=false;while(node){if(node===vehicle.owner){belongs=true;break;}node=node.parent||null;}if(belongs)return;
    const hx=Math.max(0,finite(collider.hx,0)),hz=Math.max(0,finite(collider.hz,0));if(Math.abs(x-finite(collider.x,0))>hx||Math.abs(z-finite(collider.z,0))>hz)return;
    const top=finite(collider.y,0)+Math.max(0,finite(collider.hy,0));
    // A roof/bridge above the live seat is not the floor below the vehicle.
    // For aircraft this still selects the highest real surface beneath it.
    if(Number.isFinite(Number(maxSurfaceY))&&top>Number(maxSurfaceY))return;
    ground=Math.max(ground,top);
  });
  return ground;
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
    onPossess:(record,playerId,force)=>{
      const claimed=registry.claimPlayerSlot?registry.claimPlayerSlot(record,playerId,force):false;
      // Possession is an ownership boundary. An unpossessed Character may have
      // received an authored/AI command through setMoveInput; carrying that
      // object into the player frame lets stale aim/fire channels survive the
      // hand-off. Player input must start from a clean, device-owned command.
      if(claimed){
        if(typeof record.clearPlayerControlState==='function')record.clearPlayerControlState('possess');
        else if(typeof record.clearControl==='function')record.clearControl();
        else record.control=null;
        if(record.started&&record.enabled!==false&&record.hidden!==true&&typeof record.possessCamera==='function')record.possessCamera(true);
      }
      return claimed;
    },
    onUnpossess:record=>{
      const playerId=record.playerId;
      if(typeof record.possessCamera==='function')record.possessCamera(false);
      if(typeof record.clearPlayerControlState==='function')record.clearPlayerControlState('unpossess');
      if(registry.releasePlayerSlot)registry.releasePlayerSlot(record);
      record.playerId=null;
      record.possessed=false;
      if(playerId!=null)emitPawnEvent(record,'OnPawnUnpossessed',{playerId});
      return true;
    },
  }):null;
  if(!pawn) return null;
  pawn.pawnType=opts.pawnType||'character';
  // Possession owns the mapping context. Character, Animal and Soccer Pawns
  // share the on-foot action family. A live Character deliberately exposes no
  // Reset keybind; `restart` is a separate dead-only action so R can remain
  // Reload throughout ordinary FPS play.
  pawn.inputContextId='character';
  pawn.inputCapabilities=Object.assign({},pawn.inputCapabilities||{}, {
    jump:pawn.pawnType!=='soccer',
    restart:function(){
      if(!(this.vitals&&this.vitals.state&&this.vitals.state.dead)||typeof this.reset!=='function')return false;
      return this.reset()!==false;
    },
  });
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

  // `null` means there is no live input source (headless test, server-side AI,
  // or an input service still booting). It is different from a connected
  // device whose current axes are neutral: only the latter may overwrite graph
  // movement with zeroes.
  pawn.livePlayerDrive=function(){
    if(!this.possessed||this.playerId==null||!GAME||!GAME.input||!GAME.input.player) return null;
    if(GAME.input.ensurePlayerSlot) GAME.input.ensurePlayerSlot(this.playerId-1);
    const view=GAME.input.player(this.playerId-1),rawDrive=view&&view.drive?view.drive('character'):null,drive=semanticDrive(this,rawDrive);
    if(!drive) return null;
    return {x:clamp(finite(drive.steer,0),-1,1),z:clamp(finite(drive.throttle,0)-finite(drive.brake,0),-1,1),sprint:drive.sprint===true,sprintAmount:clamp(finite(drive.sprintAmount,drive.sprint===true?1:0),0,1),jump:drive.jump===true,action:drive.shoot===true||drive.fire===true,shoot:drive.shoot===true,pass:drive.pass===true,tackle:drive.tackle===true,lookX:clamp(finite(drive.cameraLookX,0),-1,1),lookY:clamp(finite(drive.cameraLookY,0),-1,1),fire:drive.fire===true,aim:drive.aim===true,reload:drive.reload===true,crouch:drive.crouch===true,crouchAmount:clamp(finite(drive.crouchAmount,drive.crouch===true?1:0),0,1),slowWalk:drive.slowWalk===true,interact:drive.interact===true,pickup:drive.pickup===true,dropItem:drive.dropItem===true,nextWeapon:drive.nextWeapon===true,useItem:drive.useItem===true,dodge:drive.dodge===true,swapShoulder:drive.swapShoulder===true,leanLeft:drive.leanLeft===true,leanRight:drive.leanRight===true,takeCover:drive.takeCover===true,slot1:drive.slot1===true,slot2:drive.slot2===true,slot3:drive.slot3===true,slot4:drive.slot4===true,slot5:drive.slot5===true,slot6:drive.slot6===true,slot7:drive.slot7===true,inventory:drive.inventory===true,viewToggle:drive.cameraMode===true,device:view&&view.device?view.device():null};
  };
  pawn.readPlayerDrive=function(){return this.livePlayerDrive()||neutralMove();};
  // A graph authors movement for an AI / unpossessed Pawn. Once a real Player
  // owns it, the whole movement vector belongs to that Player too. Older saved
  // graphs can have only one of the X/Z data edges (or update a frame late):
  // trusting those pins constrained an otherwise possessed Character to one
  // axis. This is intentionally an overwrite rather than a merge, so movement,
  // verbs, look and weapons all share the same current device snapshot.
  const DEVICE_CHANNELS=['x','z','sprint','jump','sprintAmount','lookX','lookY','fire','aim','reload','shoot','pass','tackle','crouch','crouchAmount','slowWalk','interact','pickup','dropItem','nextWeapon','useItem','dodge','swapShoulder','leanLeft','leanRight','takeCover','slot1','slot2','slot3','slot4','slot5','slot6','slot7','inventory','viewToggle','device'];
  pawn.setMoveInput=function(input){
    const authored=input||{},command=Object.assign(neutralMove(),authored);
    const live=this.possessed?this.livePlayerDrive():null;
    if(live) DEVICE_CHANNELS.forEach(channel=>{ command[channel]=live[channel]; });
    this.control=semanticDrive(this,command);
    return this.control;
  };
  pawn.clearControl=function(){ this.control=null; };
  pawn.clearPlayerControlState=function(){
    this.clearControl();
    if(this.firstPerson&&typeof this.firstPerson.releaseInput==='function')this.firstPerson.releaseInput();
    return true;
  };
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
    if(this.libraryLoadKey===key)return this.libraryLoadPromise||Promise.resolve(this.libraryClips||[]);
    this.libraryLoadKey=key;
    if(!key){this.libraryClips=[];this.libraryLoadPromise=Promise.resolve(this.libraryClips);return this.libraryLoadPromise;}
    const self=this;
    this.libraryLoadPromise=Promise.all(unique.map(ref=>loadAnimationLibrary(ref).then(library=>({library})).catch(error=>({error})))).then(results=>{
      if(self.disposed||self.libraryLoadKey!==key)return self.libraryClips||[];
      const libraries=results.map(result=>result.library).filter(Boolean);
      self.libraryClips=libraries.reduce((clips,library)=>clips.concat(library.clips||[]),[]);
      const names=libraries.reduce((list,library)=>list.concat(library.names||[]),[]);
      if(self.owner&&self.owner.userData){self.owner.userData.characterLibraryClipNames=names.slice();const errors=results.map(result=>result.error).filter(Boolean);if(errors.length)self.owner.userData.characterLibraryClipError=errors.map(error=>String(error&&error.message||error)).join(' | ');else delete self.owner.userData.characterLibraryClipError;}
      // Library hydration can finish on any microtask: immediately after the
      // Play pre-benchmark, between two Pawn frames, or while a seat owns the
      // presentation. Leaving `rebindLocomotion()` on its own exposed the FBX
      // bind pose until some later frame happened to call ensureLocomotion().
      // Dispose and bind the now-complete clip set in this same transaction so
      // rendering can never observe a live Character with no controller.
      self.rebindLocomotion();
      if(!self.disposed&&typeof self.ensureLocomotion==='function')self.ensureLocomotion();
      emitPawnEvent(self,'OnPawnAnimationsBound',{clips:names,source:'libraries'});return self.libraryClips;
    });
    return this.libraryLoadPromise;
  };
  pawn.ensureAnimationLibrary=function(){return this.ensureAnimationLibraries();};
  pawn.setLocomotion=function(patch){ Object.assign(this.config.locomotion,patch||{}); this.config.locomotion={responsiveness:clamp(finite(this.config.locomotion.responsiveness,9),.5,30),predictionTime:clamp(finite(this.config.locomotion.predictionTime,.12),0,.6),stepPoseStrength:clamp(finite(this.config.locomotion.stepPoseStrength,1),0,2)}; if(this.locomotion)this.locomotion.configure(this.config.locomotion); return this.config.locomotion; };
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
  const coreSetEnabled=pawn.setEnabled.bind(pawn);
  pawn.setEnabled=function(value){
    const enabled=coreSetEnabled(value);
    if(!enabled)this.possessCamera(false);
    else if(this.started&&this.possessed&&this.hidden!==true)this.possessCamera(true);
    return enabled;
  };
  pawn.setHidden=function(value){
    this.hidden=value===true;
    this.config.hidden=this.hidden;
    if(this.owner)this.owner.visible=!this.hidden;
    if(this.hidden)this.possessCamera(false);
    else if(this.started&&this.possessed&&this.enabled!==false)this.possessCamera(true);
    return this.hidden;
  };
  pawn.findLocomotionNode=function(){let modelHolder=null,mixer=null,genericHolder=null;if(this.owner&&this.owner.traverse)this.owner.traverse(node=>{const data=node.userData||{};if(!modelHolder&&data.logicElementSceneId==='character_model'&&data.logicElementAssetKey)modelHolder=node;if(!mixer&&data.logicAnimationMixer)mixer=node;if(!genericHolder&&data.logicElementAssetKey)genericHolder=node;});const hasVisual=root=>{let found=false;if(root&&root.traverse)root.traverse(node=>{if(node&&node.userData&&node.userData.logicElementAssetVisual)found=true;});return found;};if(modelHolder&&hasVisual(modelHolder))return modelHolder;if(mixer&&hasVisual(mixer))return mixer;if(genericHolder&&hasVisual(genericHolder))return genericHolder;return null;};
  // The held weapon stance belongs to the controller that is playing it, so a
  // rebind forgets it: the next frame asks for it again against whatever clips the
  // new controller actually bound.
  pawn.rebindLocomotion=function(){if(this.locomotion)this.locomotion.dispose();if(this.clothController)this.clothController.dispose();this.locomotion=null;this.locomotionNode=null;this.locomotionKind=null;this.clothController=null;this.clothNode=null;this.placeholderAttempted=false;this.appearanceApplied=false;this.state.weaponStance=null;this.state.weaponStanceClip=null;};
  // Recreate the presentation controller from the already loaded model/clips,
  // exactly as the first Play bind does, without touching gameplay state or
  // fetching the asset again. Vehicle exit uses this stronger boundary instead
  // of trying to infer every action/cache a plugin may have left behind.
  pawn.restartLocomotionPresentation=function(reason){
    const node=this.findLocomotionNode(),previous=this.locomotion,previousKind=this.locomotionKind;
    this.ensureAnimationLibraries();
    // The real controller can return to a clean idle transactionally. Keeping
    // it bound avoids repeating retarget work and, critically, avoids capturing
    // a live animation/seat pose as a new rest skeleton.
    if(previous&&typeof previous.resetPresentation==='function'&&previous.resetPresentation()){
      this.state.weaponStance=null;this.state.weaponStanceClip=null;
      if(this.owner&&this.owner.userData)this.owner.userData.vehicleExitPresentationRestart={reason:String(reason||'vehicle-exit'),kind:previousKind||'model',replaced:false,reset:true,at:Date.now()};
      return true;
    }
    // The previous controller owns the live Motion Set correction on `node`.
    // Clean it before bind: cleaning it after bind makes the new controller
    // memorize an already-offset/rotated root and compounds every restart.
    if(previous){
      if(typeof previous.prepareForReplacement==='function')previous.prepareForReplacement();
      else if(typeof previous.releaseExternalPose==='function')previous.releaseExternalPose();
      if(typeof previous.restorePresentationRoot==='function')previous.restorePresentationRoot();
    }
    let controller=null,kind=null;
    if(node){
      const runtime=window.LK_RUNTIME_CHARACTER_LOCOMOTION||window.LK_RUNTIME_SOCCER_LOCOMOTION;
      if(!runtime||!runtime.createController)return false;
      controller=runtime.createController({THREERef:window.THREE,walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed,responsiveness:this.config.locomotion.responsiveness,predictionTime:this.config.locomotion.predictionTime,stepPoseStrength:this.config.locomotion.stepPoseStrength,animationSet:this.config.animationSet,role:this.config.role||opts.pawnType||'character'});
      if(!controller.bind(node,this.config.animations,this.libraryClips,this.config.animationSet)){controller.dispose&&controller.dispose();return false;}
      // Both controllers refer to the same Three AnimationMixer. The new bind
      // has just stopped all old actions and armed the Play baseline; retiring
      // the previous controller must remove only its listeners and caches.
      if(previous){if(previousKind==='model'&&previous.disposeForReplacement)previous.disposeForReplacement();else previous.dispose&&previous.dispose();}
      kind='model';
    } else {
      const runtime=window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
      if(!runtime||!runtime.createController)return false;
      // Placeholder rest transforms are owned by the old controller, so reset
      // them before the replacement captures its own baseline.
      if(previous&&previous.dispose)previous.dispose();
      controller=runtime.createController({walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed,responsiveness:this.config.locomotion.responsiveness,predictionTime:this.config.locomotion.predictionTime,stepPoseStrength:this.config.locomotion.stepPoseStrength});
      if(!controller.bind(this.owner)){controller.dispose&&controller.dispose();this.locomotion=null;this.locomotionNode=null;this.locomotionKind=null;return false;}
      kind='placeholder';
    }
    this.locomotion=controller;this.locomotionNode=kind==='model'?node:null;this.locomotionKind=kind;this.placeholderAttempted=kind==='placeholder';
    this.state.weaponStance=null;this.state.weaponStanceClip=null;
    if(kind==='model'&&this.owner&&this.owner.userData){this.owner.userData.characterAnimationClips=controller.availableClips();this.owner.userData.characterAnimationBinding=node.userData&&node.userData.characterAnimationBinding||null;}
    if(this.owner&&this.owner.userData)this.owner.userData.vehicleExitPresentationRestart={reason:String(reason||'vehicle-exit'),kind,replaced:!!previous,at:Date.now()};
    return true;
  };
  // Locomotion prefers a bound GLB (model) and re-checks for one every call
  // while unbound, matching the pre-existing per-frame check cost for the
  // no-GLB case. Once a GLB successfully binds it "locks in" and skips the
  // traversal. Until then — or if no model is ever assigned — the procedural
  // placeholder animator (character-placeholder-locomotion.js) takes over so
  // movement always reads visually, even before a rigged model exists.
  pawn.ensureLocomotion=function(){
    const currentNode=this.findLocomotionNode();
    if(this.locomotionKind==='model'&&this.locomotion&&this.locomotion.isBound()&&this.locomotionNode===currentNode&&currentNode&&currentNode.parent)return this.locomotion;
    // The procedural placeholder is already a complete bound controller. Skip
    // rebuilding animation-library ref arrays until an actual GLB appears.
    if(!currentNode&&this.locomotionKind==='placeholder'&&this.locomotion&&this.locomotion.isBound())return this.locomotion;
    this.ensureAnimationLibraries();
    const runtime=window.LK_RUNTIME_CHARACTER_LOCOMOTION||window.LK_RUNTIME_SOCCER_LOCOMOTION;
    const node=currentNode;
    if(runtime&&node&&node!==this.locomotionNode){
      const controller=runtime.createController({THREERef:window.THREE,walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed,responsiveness:this.config.locomotion.responsiveness,predictionTime:this.config.locomotion.predictionTime,stepPoseStrength:this.config.locomotion.stepPoseStrength,animationSet:this.config.animationSet,role:this.config.role||opts.pawnType||'character'});
      if(controller.bind(node,this.config.animations,this.libraryClips,this.config.animationSet)){
        if(this.locomotion)this.locomotion.dispose();
        this.locomotion=controller;this.locomotionNode=node;this.locomotionKind='model';
        // A GLB and its animation controller can finish hydration while the
        // Character is already inside a vehicle. Capture the newly authoritative
        // skeleton before the first seat IK pass touches it.
        if(this.inVehicle&&this.captureVehicleSkeletonState)this.captureVehicleSkeletonState(node);
        this.owner.userData.characterAnimationClips=controller.availableClips();
        this.owner.userData.characterAnimationBinding=node.userData&&node.userData.characterAnimationBinding||null;
        emitPawnEvent(this,'OnPawnAnimationsBound',{clips:controller.availableClips()});
        return this.locomotion;
      }
    }
    if(!node){
      const placeholderRuntime=window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
      if(!this.placeholderAttempted&&placeholderRuntime){
        this.placeholderAttempted=true;
        const controller=placeholderRuntime.createController({walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed,responsiveness:this.config.locomotion.responsiveness,predictionTime:this.config.locomotion.predictionTime,stepPoseStrength:this.config.locomotion.stepPoseStrength});
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
    // A STANCE is a pose the body holds, not an act it performs: aiming has no
    // beginning and no end to report, and latching `state.action` on it would tell
    // every consumer the body is busy for as long as the player holds the sights -
    // including this Pawn's own stance driver, which reads that field to know when
    // to keep out of the way. It travels the same clip-resolution path as an
    // action, which is the whole point of routing it through here, and reports
    // whether a clip was actually found instead of the unconditional accepted-command
    // `true` a Logic graph expects from an action.
    const stance=actionOpts.hold===true||actionOpts.holdLastFrame===true;
    if(!stance){this.state.action=action;this.state.actionTime=0;emitPawnEvent(this,this.actionStartedEvent,Object.assign({action},this.actionPayload(this,action)));}
    const finish=()=>{if(this.state.action===action){this.state.action=null;this.state.actionClipPlaying=false;this.state.actionClipName=null;this.state.actionClipDuration=0;}emitPawnEvent(this,this.actionFinishedEvent,Object.assign({action},this.actionPayload(this,action)));};
    const playableClip=this.locomotionKind==='placeholder'?animationClipName(clip):clip;
    const played=!!(locomotion&&locomotion.playAction(playableClip,Object.assign({onDone:stance?null:finish,slot:action},actionOpts)));
    this.state.actionClipPlaying=played;this.state.actionClipName=played?action:null;
    this.state.actionClipDuration=played&&locomotion.actionDuration?locomotion.actionDuration():0;
    if(stance)return played;
    if(!played&&actionOpts.requireClip===true){
      finish();
      return false;
    }
    if(!played){this.state.actionFallbackTimer=clamp(finite(actionOpts.duration,.8),.1,5);this.state.actionFallbackFinish=finish;}
    return true;
  };
  pawn.jump=function(){if(!this.movementController||this.state.diving)return false;if(!this.movementController.jump())return false;if(this.possessed&&GAME.systems&&GAME.systems.characterAudio)GAME.systems.characterAudio.jump(this);const locomotion=this.ensureLocomotion(),hasMotionJump=(this.config.animationSet||[]).some(entry=>entry&&entry.state==='jump');if(locomotion&&this.config.animations.jump&&!hasMotionJump){const clip=this.locomotionKind==='placeholder'?animationClipName(this.config.animations.jump):this.config.animations.jump;locomotion.playAction(clip,{fadeIn:.06,fadeOut:.14,slot:'jump'});}emitPawnEvent(this,this.actionStartedEvent,Object.assign({action:'jump'},this.actionPayload(this,'jump')));return true;};
  // What the body should be DOING with the weapon this frame. It is read by the
  // procedural placeholder directly, and is the same signal a Motion Set uses to
  // pick a real carry/aim clip once one is bound.
  // Grip authoring is a PAWN-level block on purpose. The view rig rebuilds
  // `config.weapon` through its own normalizer, which keeps only the fields it
  // knows, so a `firstPerson.weapon.grip.*` binding is reported as handled and
  // then silently dropped - a dead Inspector control that looks alive. `weaponGrip`
  // is owned here, where it survives an equip and a save.
  pawn.setWeaponGrip=function(patch){
    this.config.weaponGrip=Object.assign({},this.config.weaponGrip||{},patch||{});
    return this.config.weaponGrip;
  };
  pawn.bodyAnimationSlot=function(){
    if(this.state.abilityPose)return String(this.state.abilityPose);
    if(this.state.traversal)return String(this.state.traversal);
    if(this.state.sliding===true)return 'slide';
    if(finite(this.state.rolling,0)>0)return 'roll';
    return String(this.state.action||'');
  };
  pawn.bodyAnimationCategory=function(){
    const blend=window.LK_RUNTIME_CHARACTER_ANIMATION_BLEND;
    return blend&&blend.categoryOf?blend.categoryOf(this.bodyAnimationSlot()):'generic';
  };
  pawn.weaponActionState=function(){
    const rig=this.firstPerson,weapon=rig&&rig.config?rig.config().weapon:null;
    const blend=window.LK_RUNTIME_CHARACTER_ANIMATION_BLEND,slot=this.bodyAnimationSlot();
    const normalized=blend&&blend.normalizeSlot?blend.normalizeSlot(slot):String(slot||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
    const bodyLocked=this.bodyAnimationCategory()==='body-locked';
    const kind=String(weapon&&weapon.kind||'firearm').toLowerCase();
    // Full-body clips own their arm chains. A clip that actually USES the held
    // item keeps it visible and lets the world model follow the animated hand;
    // unrelated traversal/roll/death/etc. temporarily holsters only the visual.
    const usesWeapon=kind==='firearm'
      ?/^(?:fire|firing|shoot|reload|aim)/.test(normalized)
      :(kind==='melee'?/(?:melee|knife|stab|slash|attack)/.test(normalized)
        :(kind==='thrown'?/(?:throw|grenade)/.test(normalized):false));
    return {slot:normalized,bodyLocked,usesWeapon,hide:bodyLocked&&!usesWeapon};
  };
  pawn.weaponPose=function(){
    // A seat owns the limbs while occupied. Immediately after an exit the mixer
    // gets a couple of clean frames to restore its clip pose before weapon IK is
    // allowed to target the newly re-possessed camera.
    if(this.inVehicle||finite(this.postVehiclePoseReset,0)>0){if(this.firstPerson&&this.firstPerson.state)this.firstPerson.state.weaponGripRotation=null;return null;}
    const rig=this.firstPerson;
    if(!rig||!rig.armed||!rig.armed()){if(rig&&rig.state)rig.state.weaponGripRotation=null;return null;}
    const actionState=this.weaponActionState();
    if(rig.state)rig.state.weaponHolstered=actionState.hide;
    // Do not solve weapon IK over a full-body take. Returning null releases the
    // post-mixer arm layer while the inventory/equipped weapon remains intact.
    if(actionState.bodyLocked){if(rig.state)rig.state.weaponGripRotation=null;return null;}
    const weapon=rig.config().weapon;
    // Merely carrying an equipped inventory item must not turn the arms into a
    // permanent world-space IK layer. This was especially visible after a
    // vehicle exit: possession restored the equipped weapon and both hands
    // immediately pointed at its fallback targets over idle, walk and run.
    // Authored locomotion owns the limbs until the player actually aims or
    // fires; authored reload/full-body actions continue to own themselves.
    const combatPoseActive=clamp(finite(rig.state.ads,0),0,1)>.015||finite(rig.state.sinceShot,9)<.18||rig.state.reloading===true;
    if(!combatPoseActive){
      if(rig.state)rig.state.weaponGripRotation=null;
      return null;
    }
    const poses=window.LK_RUNTIME_CHARACTER_WEAPON_POSE;
    // Where the hands go, resolved from authored data instead of literals. Two
    // sparse sources are read, least specific first: this Pawn's own `weaponGrip`
    // block, which is what the Inspector and a Logic graph write, then whatever
    // the weapon itself declares. The authored `firstPerson.weapon` copy is
    // consulted for the per-weapon one as well, because it is the copy that
    // survives the rig's normalizer.
    const authoredWeapon=this.config.firstPerson&&this.config.firstPerson.weapon;
    const gripSources=[
      this.config.weaponGrip,
      authoredWeapon&&authoredWeapon.grip,
      weapon&&weapon.grip,
    ];
    const fullBodyEye=rig.firstPersonView&&rig.firstPersonView()&&
      !(rig.armsPresentation&&rig.armsPresentation());
    const eye=rig.eyeTransform&&rig.eyeTransform();
    const side=rig.weaponSide?rig.weaponSide():1;
    const ads=clamp(finite(rig.state.ads,0),0,1);
    const gaitSpeed=Math.max(0,finite(this.state.speed,0)),walkSpeed=Math.max(.1,finite(this.config.movement&&this.config.movement.walkSpeed,2.4)),runSpeed=Math.max(walkSpeed,finite(this.config.movement&&this.config.movement.runSpeed,5.4));
    const gait=gaitSpeed<=.35?'idle':((this.state.sprinting===true||gaitSpeed>(walkSpeed+runSpeed)*.5)?'run':'walk');
    // Player and AI Pawns both enter through this function. Context therefore
    // selects one authored grip profile for either controller without copying
    // pose logic into Actor Combat or making AI hands behave differently.
    const grip=poses&&(poses.resolveContextGrip||poses.resolveGrip)
      ?(poses.resolveContextGrip?poses.resolveContextGrip(weapon,gripSources,{gait,side:side<0?'left':'right',aim:ads}):poses.resolveGrip(weapon,gripSources))
      :null;
    // Recoil is a short impulse, never the whole weapon cadence. With a slow
    // shotgun the old cooldown test held both arms backwards for over half a
    // second and then snapped them forward at the next allowed shot.
    const fireAmount=clamp(1-finite(rig.state.sinceShot,9)/.14,0,1);
    const firing=fireAmount>0;
    // Carry follows the BODY, not the camera. The old eye-only frame made the
    // arms keep pointing at the crosshair while the Character walked toward the
    // camera. A shot commits fully to the sight line; ADS contributes only a
    // partial preview so recoil has room without replacing ordinary arm motion.
    const crosshairBlend=clamp(Math.max(fireAmount,ads*.35),0,1);
    const ownerYaw=finite(this.owner&&this.owner.rotation&&this.owner.rotation.y,finite(eye&&eye.yaw,0));
    const bodyForward={x:Math.sin(ownerYaw),y:0,z:Math.cos(ownerYaw)};
    const bodyRight={x:-Math.cos(ownerYaw),y:0,z:Math.sin(ownerYaw)};
    const frameForward=eye?{
      x:bodyForward.x+(eye.forward.x-bodyForward.x)*crosshairBlend,
      y:eye.forward.y*crosshairBlend,
      z:bodyForward.z+(eye.forward.z-bodyForward.z)*crosshairBlend,
    }:bodyForward;
    const frameRight=eye?{
      x:bodyRight.x+(eye.right.x-bodyRight.x)*crosshairBlend,
      y:eye.right.y*crosshairBlend,
      z:bodyRight.z+(eye.right.z-bodyRight.z)*crosshairBlend,
    }:bodyRight;
    // `base` lets this blended body/aim frame nudge a point the view model
    // already solved.
    const worldTarget=(offset,base)=>{
      if(!eye||!offset)return null;
      const origin=base||eye.position;
      return {
        x:origin.x+frameForward.x*offset[2]+frameRight.x*offset[0]*side,
        y:origin.y+frameForward.y*offset[2]+frameRight.y*offset[0]*side+offset[1],
        z:origin.z+frameForward.z*offset[2]+frameRight.z*offset[0]*side,
      };
    };
    // Aiming is HELD and eases in with the sights; firing is an instant. Gating
    // the two layers differently is what makes them tell apart from outside -
    // pulling the trigger from the hip must not look like raising the sights.
    const layered=(base,aim,fire)=>[
      base[0]+aim[0]*ads+fire[0]*fireAmount,
      base[1]+aim[1]*ads+fire[1]*fireAmount,
      base[2]+aim[2]*ads+fire[2]*fireAmount,
    ];
    let triggerTarget=null,supportTarget=null;
    if(grip&&eye){
      triggerTarget=worldTarget(layered(grip.trigger.position,grip.aim.trigger,grip.fire.trigger));
      if(grip.support.enabled){
        // The view model publishes where the foregrip of the weapon it is really
        // drawing sits, and a solved point beats any offset: it is how the hand
        // lands ON the weapon instead of near it. Only a weapon held in both
        // hands has one - the point reported for a fist guard or a cocked grenade
        // is the middle of the model - and an authored offset outranks it, or the
        // author's own field would be the one control that does nothing.
        const solved=grip.hands==='double'&&!grip.authored.support?rig.state.supportGrip:null;
        // A solved point already travels with the weapon, its own aim-down-sights
        // shift included, so adding the DEFAULT aim/fire layer on top would double
        // the travel. An authored layer is still applied: it is the only way to
        // move a hand the view model placed.
        const aimOffset=solved?(grip.solvedAimSupport||(!grip.authored.aimSupport?[0,0,0]:grip.aim.support)):grip.aim.support;
        const fireOffset=solved&&!grip.authored.fireSupport?[0,0,0]:grip.fire.support;
        supportTarget=solved
          ?worldTarget(layered([0,0,0],aimOffset,fireOffset),solved)
          :worldTarget(layered(grip.support.position,aimOffset,fireOffset));
      }
    }
    // Degrees are what an author types and radians are what every consumer of a
    // pose works in, so the conversion happens once, here.
    const radians=triple=>triple?[triple[0]*Math.PI/180,triple[1]*Math.PI/180,triple[2]*Math.PI/180]:null;
    const moving=this.state.moving===true||finite(this.state.speed,0)>.35;
    const contextual=grip&&grip.contextual,contextAuthored=!!(contextual&&(contextual.hipProfile||contextual.aimProfile));
    // Pawn Studio shows authored targets at full influence. Play used to dilute
    // them to 46–66% while moving, so the hand never reached the dummy and the
    // hand-owned weapon visibly moved away from its Studio socket. Exact authored
    // targets own the chain; only automatic fallbacks retain animation softness.
    const exactTrigger=!!(grip&&(contextAuthored||grip.authored&&grip.authored.trigger));
    const exactSupport=!!(grip&&(contextAuthored||grip.authored&&grip.authored.support));
    const triggerWeight=exactTrigger?1:(fullBodyEye ? .94 : (moving ? .46 : .56)+ads*(moving ? .34 : .28));
    const supportWeight=exactSupport?1:(fullBodyEye ? .96 : (moving ? .56 : .66)+ads*(moving ? .30 : .22));
    const triggerRotation=grip?radians(grip.trigger.rotation):null;
    // The world weapon is updated after locomotion. Publish the exact authored
    // wrist frame so its first trigger-hand calibration is identical to the
    // weapon preview shown by Pawn Studio.
    rig.state.weaponGripRotation=triggerRotation?triggerRotation.slice():null;
    return {
      carry:1,
      kind:weapon.kind,
      // The resolved descriptor travels with the pose so a consumer never has to
      // re-derive any part of it.
      grip,
      // Crosshair ownership is explicit: full only for the recoil/fire impulse,
      // partial while ADS is held, zero during ordinary locomotion/carry.
      aim:crosshairBlend,
      crosshairBlend,
      // RAW sights remain separate because authored aim clips use the user's
      // actual button blend rather than this procedural correction strength.
      ads,
      pitch:(rig.aimAngles?rig.aimAngles():rig.viewAngles()).pitch*crosshairBlend,
      side,
      // A MIRROR of the authored hand count, never a second derivation. With no
      // pose module loaded there is no arm layer to feed at all, so the pose
      // reports no hands rather than inventing a different answer here.
      twoHanded:!!(grip&&grip.twoHanded),
      // Where each hand should land, in world space.
      triggerTarget,
      supportTarget,
      triggerRotation,
      supportRotation:grip?radians(grip.support.rotation):null,
      triggerFingers:grip&&grip.fingers?grip.fingers.trigger:null,
      supportFingers:grip&&grip.fingers?grip.fingers.support:null,
      gripContext:grip&&grip.contextual?grip.contextual:{gait,side:side<0?'left':'right',aim:ads},
      // Separate gains matter: forcing both arms to the same strength made a
      // pistol shoulder look locked and a rifle foregrip look loose. Authored
      // clips keep part of their shoulder/elbow motion at the hip; ADS converges
      // more firmly onto the real grip points.
      triggerWeight:clamp(triggerWeight+fireAmount*.08,0,1),
      supportWeight:clamp((supportWeight+fireAmount*.06)*finite(grip&&grip.supportBlend,1),0,1),
      fireAmount,
      firing,
      reloading:rig.state.reloading===true,
    };
  };
  // Which held clip the body should be in for the weapon it is carrying, or null.
  // Every one of these slots shipped bound to a real clip and nothing ever asked
  // for one, which is why aiming showed on the weapon and never on the character.
  // A body that lacks the exact slot falls back along its own chain rather than
  // showing the plain unarmed idle while the sights are up.
  pawn.weaponStanceSlot=function(pose){
    if(!pose||!(finite(pose.ads,0)>=.35))return null;
    if(clamp(finite(this.state.crouch,0),0,1)>.5)return 'crouchAimIdle';
    if(this.state.moving===true&&finite(this.state.speed,0)>.6)return 'runAiming';
    // The hand count is the authored one, read straight off the resolved grip, so
    // the clip and the arms can never disagree about how the weapon is held.
    return pose.grip&&pose.grip.hands==='double'?'aimRifleIdle':'aimIdle';
  };
  const WEAPON_STANCE_CHAINS={
    crouchAimIdle:['crouchAimIdle','aimRifleIdle','aimIdle'],
    runAiming:['runAiming','aimRifleIdle','aimIdle'],
    aimRifleIdle:['aimRifleIdle','aimIdle'],
    aimIdle:['aimIdle'],
  };
  pawn.updateWeaponStance=function(pose){
    const locomotion=this.locomotion;
    const bodyCategory=this.bodyAnimationCategory();
    if(bodyCategory==='body-locked'){
      // Traversal has already replaced any held aim action. Forget the stance
      // bookkeeping without stopping the action slot, otherwise stopAction()
      // would stop the climb/vault/roll that just took ownership of the body.
      this.state.weaponStance=null;this.state.weaponStanceClip=null;
      return null;
    }
    // Clips only. The procedural placeholder poses the arms itself, has no clip to
    // hold, and accepts every action name it is handed - a stance there would
    // replace the pose it already draws with a gesture that expires.
    const wanted=locomotion&&this.locomotionKind==='model'?this.weaponStanceSlot(pose):null;
    if(!wanted){
      if(this.state.weaponStanceClip&&locomotion&&locomotion.stopAction)locomotion.stopAction();
      this.state.weaponStance=null;this.state.weaponStanceClip=null;
      return null;
    }
    // A shot, a reload or a traversal owns the single action slot while it lasts.
    // The stance waits for it and is re-asserted when it ends rather than cutting
    // it short - which is how a shot fired from the shoulder returns to the
    // shoulder instead of dropping back to the hip.
    if(this.state.action||pose.firing===true||pose.reloading===true)return this.state.weaponStance;
    if(this.state.weaponStance===wanted){
      // Already held, or already known to have no clip behind it. Retrying a
      // missing clip every frame would search the whole library every frame.
      if(!this.state.weaponStanceClip)return this.state.weaponStance;
      if(locomotion.isActionPlaying&&locomotion.isActionPlaying()===true)return this.state.weaponStance;
    }
    this.state.weaponStance=wanted;
    this.state.weaponStanceClip=null;
    const chain=WEAPON_STANCE_CHAINS[wanted]||[wanted];
    for(let index=0;index<chain.length;index++){
      // Looping, because a stance is held for as long as the sights are up, and
      // through playAction so the authored slot, the Motion Set and the bundled
      // fallback are all consulted exactly as they are for a roll.
      if(this.playAction(chain[index],{hold:true,loop:true,fadeIn:.16,fadeOut:.22})===true){
        this.state.weaponStanceClip=chain[index];
        break;
      }
    }
    return this.state.weaponStance;
  };
  pawn.applyAppearance=function(){const applied=applyAppearanceToNode(this.owner,this.config.appearance);this.appearanceApplied=true;return applied;};
  pawn.applyBinding=function(path,value){const key=String(path||'');if(key.indexOf('weaponGrip.')===0){this.setWeaponGrip({[key.slice(11)]:value});return true;}if(key.indexOf('firstPerson.')===0){return !!(this.firstPerson&&this.firstPerson.applyBinding(key,value));}if(key.indexOf('abilities.')===0){return !!(this.abilities&&this.abilities.applyBinding(key,value));}if(key.indexOf('cover.')===0){return !!(this.cover&&this.cover.applyBinding(key,value));}if(key.indexOf('vitals.')===0){return !!(this.vitals&&this.vitals.applyBinding(key,value));}if(key.indexOf('entry.')===0){const parts=key.slice(6).split('.').filter(Boolean);let target=this.config.entry||(this.config.entry={});for(let index=0;index<parts.length-1;index++){const name=parts[index];target=target[name]=target[name]&&typeof target[name]==='object'?target[name]:{};}if(parts.length)target[parts[parts.length-1]]=clone(value);return parts.length>0;}if(key==='animationLibrary'){this.setAnimationLibrary(value);return true;}if(key==='animationSet'){this.setAnimationSet(value);return true;}if(key.indexOf('movement.')===0){this.setMovement({[key.slice(9)]:value});return true;}if(key.indexOf('locomotion.')===0){this.setLocomotion({[key.slice(11)]:value});return true;}if(key.indexOf('animations.')===0){this.setAnimations({[key.slice(11)]:value});return true;}if(key.indexOf('appearance.')===0){this.setAppearance({[key.slice(11)]:value});return true;}if(key.indexOf('cloth.')===0){this.setCloth({[key.slice(6)]:value});return true;}if(key.indexOf('camera.')===0){this.setCamera({[key.slice(7)]:value});return true;}return false;};
  // A reset has to leave the Pawn STANDING, not merely repositioned. Death
  // physics tips the root over on X and Z, so restoring only the yaw left a
  // revived Character walking at an angle; and the authored spawn Y is not
  // necessarily the ground under it, which is how a respawn ends up below the
  // floor. Both are corrected here, so every revive path - the respawn timer, a
  // Logic reset, Stop/Play, a heal - lands the same way.
  pawn.groundHeightAt=function(x,z,fallback){
    const world=GAME&&GAME.world;
    const height=world&&typeof world.characterGroundHeight==='function'?Number(world.characterGroundHeight(x,z)):NaN;
    if(Number.isFinite(height))return height;
    // A caller passing NaN is ASKING whether a ground is known, so it is told.
    return Number.isFinite(Number(fallback))?Number(fallback):0;
  };
  pawn.reset=function(){
    const spawn=this.config.spawn;
    if(this.owner&&this.owner.position)this.owner.position.set(spawn.x,this.groundHeightAt(spawn.x,spawn.z,spawn.y),spawn.z);
    // A test/host owner may carry a plain rotation object rather than a THREE
    // Euler, so the tilt is cleared component-wise when there is no set().
    if(this.owner&&this.owner.rotation){
      if(typeof this.owner.rotation.set==='function')this.owner.rotation.set(0,spawn.heading,0);
      else {this.owner.rotation.x=0;this.owner.rotation.y=spawn.heading;this.owner.rotation.z=0;}
    }
    if(this.owner&&this.owner.scale&&this.owner.scale.set&&this.owner.userData&&this.owner.userData.characterResetScale)this.owner.scale.copy(this.owner.userData.characterResetScale);
    Object.assign(this.state,{velocityX:0,velocityY:0,velocityZ:0,heading:spawn.heading,action:null,airborne:false,grounded:true,speed:0,speedKmh:0,moving:false,sprinting:false,weaponStance:null,weaponStanceClip:null});
    if(this.movementController)this.movementController.reset(spawn.heading);
    if(this.abilities&&typeof this.abilities.reset==='function')this.abilities.reset();
    if(this.locomotion&&typeof this.locomotion.stopAction==='function')this.locomotion.stopAction();
    if(this.syncRuntimeColliders)this.syncRuntimeColliders();
    emitPawnEvent(this,'OnPawnReset',{});
    return true;
  };
  // Vehicle boarding is a capability shared by every on-foot Character. The
  // vehicle keeps its own driving runtime (native, Logic Pawn, Sketchbook or a
  // plugin provider); this bridge transfers only seat occupancy and Player
  // ownership, so adding a Character to a driving level never replaces either
  // controller with a special hardcoded level implementation.
  pawn.entryCooldown=0;
  pawn.inVehicle=null;
  pawn.occupyingSeat=null;
  pawn.captureVehicleSkeletonState=function(node){
    const target=node||this.locomotionNode||(this.findLocomotionNode&&this.findLocomotionNode())||this.owner;
    if(!target||!target.traverse)return null;
    const bones=[];target.traverse(bone=>{if(!bone||!bone.isBone)return;bones.push({bone,position:bone.position&&bone.position.clone?bone.position.clone():null,quaternion:bone.quaternion&&bone.quaternion.clone?bone.quaternion.clone():null,scale:bone.scale&&bone.scale.clone?bone.scale.clone():null});});
    this.preVehicleSkeleton={node:target,bones};return this.preVehicleSkeleton;
  };
  pawn.restoreVehicleSkeletonState=function(){
    const saved=this.preVehicleSkeleton;if(!saved)return false;let restored=0;
    saved.bones.forEach(entry=>{const bone=entry.bone;if(!bone)return;if(entry.position&&bone.position)bone.position.copy(entry.position);if(entry.quaternion&&bone.quaternion)bone.quaternion.copy(entry.quaternion);if(entry.scale&&bone.scale)bone.scale.copy(entry.scale);restored++;});
    if(saved.node&&saved.node.updateMatrixWorld)saved.node.updateMatrixWorld(true);
    if(this.owner&&this.owner.userData)this.owner.userData.vehicleExitPoseRestore={bones:restored,nodeChanged:saved.node!==(this.locomotionNode||this.owner),at:Date.now()};
    this.preVehicleSkeleton=null;return restored>0;
  };
  pawn.captureVehiclePresentationState=function(){
    // A per-frame motionTransform must never become the structural state saved
    // for dismount. Seating replaces the presentation immediately, so this
    // cleanup is atomic from the player's point of view.
    if(this.locomotion&&typeof this.locomotion.restorePresentationRoot==='function')this.locomotion.restorePresentationRoot();
    const node=this.locomotionNode||this.findLocomotionNode&&this.findLocomotionNode(),copy=value=>value&&value.clone?value.clone():null;
    const view=this.firstPerson&&typeof this.firstPerson.viewAngles==='function'?this.firstPerson.viewAngles():null;
    this.preVehiclePresentation={ownerScale:copy(this.owner&&this.owner.scale),ownerHeading:ownerWorldHeading(this.owner),viewYaw:finite(view&&view.yaw,NaN),viewPitch:finite(view&&view.pitch,NaN),node:node&&node!==this.owner?node:null,nodePosition:copy(node&&node.position),nodeQuaternion:copy(node&&node.quaternion),nodeScale:copy(node&&node.scale)};this.captureVehicleSkeletonState(node||this.owner);return this.preVehiclePresentation;
  };
  pawn.restoreVehiclePresentationState=function(){
    const saved=this.preVehiclePresentation;if(!saved)return false;
    // Keep the holder structural here; restartLocomotionPresentation performs
    // the single post-pose/controller reset after the saved skeleton is back.
    if(this.locomotion&&this.locomotion.restorePresentationRoot)this.locomotion.restorePresentationRoot();
    if(saved.ownerScale&&this.owner&&this.owner.scale)this.owner.scale.copy(saved.ownerScale);
    const node=saved.node;if(node&&node.parent){if(saved.nodePosition&&node.position)node.position.copy(saved.nodePosition);if(saved.nodeQuaternion&&node.quaternion)node.quaternion.copy(saved.nodeQuaternion);if(saved.nodeScale&&node.scale)node.scale.copy(saved.nodeScale);node.updateMatrixWorld&&node.updateMatrixWorld(true);if(this.locomotion&&typeof this.locomotion.setPresentationRootRest==='function')this.locomotion.setPresentationRootRest(node);}
    this.restoreVehicleSkeletonState();this.preVehiclePresentation=null;return true;
  };
  pawn.tryEnterNearestVehicle=function(role){
    const occupancy=window.LK_RUNTIME_VEHICLE_OCCUPANCY;
    // Ordinary Character Pawns currently author one driving seat. Sketchbook's
    // advanced Character keeps its richer passenger/choreography implementation;
    // do not expose a half-supported passenger camera path here.
    if(role==='passenger')return false;
    if(!occupancy||this.inVehicle||this.entryCooldown>0||this.config.entry&&this.config.entry.enabled===false)return false;
    const match=occupancy.nearestSeat(GAME,this,'driver',this.config.entry&&this.config.entry.radius);
    return !!(match&&this.enterVehicle(match.vehicle,'driver',match.seat));
  };
  pawn.enterVehicle=function(vehicle,role,seat){
    const occupancy=window.LK_RUNTIME_VEHICLE_OCCUPANCY;
    if(role==='passenger')return false;
    role='driver';
    if(!occupancy||!vehicle||this.inVehicle||this.entryCooldown>0||this.playerId==null)return false;
    seat=seat||(occupancy.availableSeats(vehicle,role,this)[0]||null);
    if(!seat||!occupancy.isFree(seat,this)||role==='driver'&&vehicle.driverPawn&&vehicle.driverPawn!==this)return false;
    // Root visibility can be temporarily changed by camera presentation,
    // pre-benchmarking or asset hydration. The authored `hidden` flag is the
    // durable source of truth for what must be visible again after dismount.
    const playerId=this.playerId,wasVisible=this.hidden!==true;
    seat.reservedBy=null;seat.occupiedBy=this;
    if(role==='driver'){
      this.possessCamera(false);
      this.unpossess();
      if(!vehicle.possess||!vehicle.possess(playerId,true)){
        seat.occupiedBy=null;this.possess(playerId,true);this.possessCamera(true);return false;
      }
      vehicle.driverPawn=this;
      if(vehicle.possessCamera)vehicle.possessCamera(true);
    }
    this.inVehicle=vehicle;this.occupyingSeat=seat;this.previousOwnerVisible=wasVisible;
    this.captureVehiclePresentationState();
    if(occupancy.syncSeatOccupant)occupancy.syncSeatOccupant(this,vehicle,seat);
    else if(this.owner)this.owner.visible=wasVisible;
    this.clearPlayerControlState('vehicle-entry');
    if(occupancy.requireExitInputRelease)occupancy.requireExitInputRelease(vehicle);
    const cooldown=Math.max(.1,finite(this.config.entry&&this.config.entry.cooldown,.65));
    this.entryCooldown=cooldown;vehicle.entryCooldown=cooldown;
    emitPawnEvent(this,'OnCharacterEnteredVehicle',{vehicle,seat:seat.name||seat.id,role});
    emitPawnEvent(vehicle,role==='driver'?'OnVehicleDriverEntered':'OnVehiclePassengerEntered',{character:this,seat:seat.name||seat.id});
    return true;
  };
  pawn.exitVehicle=function(force){
    const vehicle=this.inVehicle,seat=this.occupyingSeat;
    if(!vehicle||!seat||(!force&&this.entryCooldown>0))return false;
    const driver=seat.type==='driver',playerId=driver?vehicle.playerId:this.playerId;
    const occupancy=window.LK_RUNTIME_VEHICLE_OCCUPANCY,footprint=occupancy.collisionFootprint(vehicle),center=footprint.center,characterRadius=Math.max(.1,finite(this.config.movement&&this.config.movement.radius,.35));
    const presentation=this.preVehiclePresentation||{},exitView=this.firstPerson&&typeof this.firstPerson.viewAngles==='function'?this.firstPerson.viewAngles():null;
    const dismountRuntime=window.LK_RUNTIME_CHARACTER_VEHICLE_DISMOUNT;
    const dismount=dismountRuntime&&dismountRuntime.plan
      ?dismountRuntime.plan(vehicle,this.config.entry&&this.config.entry.dismount)
      :{kind:'land',mode:'normal',velocity:{x:0,y:0,z:0},horizontalMps:0,speedKmh:0,roll:false,damage:0,lethal:false,config:{}};
    const offset=Math.max(footprint.hx+characterRadius+.18,finite(vehicle.config&&vehicle.config.entry&&vehicle.config.entry.exitOffset,finite(this.config.entry&&this.config.entry.exitOffset,1.65)));
    // The vehicle's forward axis determines only which side is clear. Body and
    // view are restored independently from their last valid on-foot frame: a
    // third-person camera may legitimately orbit away from the body, and an
    // imported rig may carry a 180-degree visual-forward correction. Collapsing
    // both frames onto the vehicle heading inverted W/S after custom-car exits.
    const vehicleHeading=footprint.heading;
    const heading=finite(presentation.ownerHeading,finite(this.state&&this.state.heading,vehicleHeading));
    const viewHeading=finite(presentation.viewYaw,finite(exitView&&exitView.yaw,heading));
    const viewPitch=finite(presentation.viewPitch,finite(exitView&&exitView.pitch,0));
    const exitX=center.x+Math.cos(vehicleHeading)*offset,exitZ=center.z-Math.sin(vehicleHeading)*offset;
    const seatedWorld=occupancy.worldPosition(this.owner);
    const groundY=characterExitGroundY(GAME,vehicle,exitX,exitZ,this.config.spawn&&this.config.spawn.y,
      finite(seatedWorld&&seatedWorld.y,finite(center&&center.y,0))+Math.max(1,finite(footprint.hy,.75)+.5));
    // A flying vehicle returns the Character at the live seat altitude. Ground
    // vehicles still use the measured floor: sharing one Y rule was the old
    // teleport-to-road bug. A parked aircraft close to the floor exits normally.
    const airborne=dismount.kind==='air'&&finite(seatedWorld&&seatedWorld.y,groundY)>groundY+.18;
    const exit={x:exitX,y:airborne?finite(seatedWorld&&seatedWorld.y,finite(center&&center.y,groundY)):groundY,z:exitZ};
    if(driver){
      if(vehicle.possessCamera)vehicle.possessCamera(false);
      vehicle.unpossess&&vehicle.unpossess();vehicle.driverPawn=null;
      if(!this.possess(playerId,true)){
        if(vehicle.possess)vehicle.possess(playerId,true);
        vehicle.driverPawn=this;if(vehicle.possessCamera)vehicle.possessCamera(true);return false;
      }
    }
    if(occupancy&&occupancy.releaseSeatOccupant)occupancy.releaseSeatOccupant(this);
    seat.occupiedBy=null;seat.reservedBy=null;this.inVehicle=null;this.occupyingSeat=null;
    // Restore the structural Character/IK pose before publishing the world
    // transform. A custom vehicle seat can carry pitch or roll (including a
    // 180-degree rig correction); restoring presentation after the upright
    // reset allowed that seat transform to win again and spawned the Character
    // upside down with its visual body below the floor.
    this.restoreVehiclePresentationState();
    setOwnerWorldPosition(this.owner,exit);
    setOwnerWorldHeading(this.owner,heading);
    if(this.movementController)this.movementController.reset(heading);
    if(this.abilities&&typeof this.abilities.reset==='function')this.abilities.reset();
    this.clearPlayerControlState('vehicle-exit');
    if(this.firstPerson&&typeof this.firstPerson.setViewAngles==='function'){
      this.firstPerson.setViewAngles(viewHeading,viewPitch);
    }
    // Publish the ownership mapping immediately. Explicit Character reads are
    // already deterministic, while this also protects HUD/plugin consumers
    // that intentionally read the possessed Player's current context.
    if(GAME&&GAME.input&&GAME.input.player&&playerId!=null){
      const inputView=GAME.input.player(playerId-1);
      if(inputView&&typeof inputView.setContext==='function')inputView.setContext('character');
    }
    this.postVehiclePoseReset=.08;
    this.vehicleExitThirdPersonFacing=true;
    if(this.locomotion&&typeof this.locomotion.stopAction==='function')this.locomotion.stopAction();
    const inherited=airborne?dismount.velocity:{x:0,y:0,z:0},exitSpeed=airborne?Math.hypot(finite(inherited.x,0),finite(inherited.z,0)):0;
    if(airborne&&this.movementController&&typeof this.movementController.launch==='function')this.movementController.launch(inherited);
    Object.assign(this.state,{velocityX:finite(inherited.x,0),velocityY:finite(inherited.y,0),velocityZ:finite(inherited.z,0),heading,speed:exitSpeed,speedKmh:exitSpeed*3.6,moving:exitSpeed>.15,sprinting:false,sprintAmount:0,inputMagnitude:0,animationPreviousSpeed:0,grounded:!airborne,airborne,action:null,abilityPose:null,traversal:null,traversalTargets:null,weaponStance:null,weaponStanceClip:null,seated:false});
    // Re-evaluate the idle mixer once while still hidden. This removes the
    // full-body seat solve before the first on-foot render, rather than relying
    // on the following RAF and briefly showing seated arms at the exit point.
    if(this.owner)this.owner.visible=false;
    const exitSnapshot={speed:exitSpeed,speedKmh:exitSpeed*3.6,moving:exitSpeed>.15,sprinting:false,sprintAmount:0,inputMagnitude:0,grounded:!airborne,groundContact:!airborne,airborne,velocityX:finite(inherited.x,0),velocityY:finite(inherited.y,0),velocityZ:finite(inherited.z,0)};
    try{this.restartLocomotionPresentation('vehicle-exit');this.updateLocomotionFrame(.0001,neutralMove(),exitSnapshot);}
    finally{
      // Animation/IK teardown is allowed to repair local bones, never the
      // Character's world root. Reassert a yaw-only root after every teardown
      // path so all native, Logic and custom vehicles share one dismount frame.
      setOwnerWorldPosition(this.owner,exit);
      setOwnerWorldHeading(this.owner,heading);
      if(this.owner)this.owner.visible=this.hidden!==true;
      if(this.firstPerson&&typeof this.firstPerson.syncBodyVisibility==='function')this.firstPerson.syncBodyVisibility(true);
      this.previousOwnerVisible=null;
    }
    this.possessCamera(true);
    let impactResult=null;
    if(!airborne&&(dismount.damage>0||dismount.lethal)&&this.vitals&&typeof this.vitals.applyDamage==='function'){
      const amount=dismount.lethal?1000000:dismount.damage;
      impactResult=this.vitals.applyDamage(amount,{source:'vehicle-dismount',direction:{x:finite(dismount.velocity.x,0),y:0,z:finite(dismount.velocity.z,0)},force:dismount.horizontalMps,point:{x:exit.x,y:exit.y,z:exit.z}});
      emitPawnEvent(this,'OnCharacterVehicleExitDamage',{vehicle,speedKmh:dismount.speedKmh,damage:amount,killed:!!(impactResult&&(impactResult.killed||impactResult.dead))});
    }
    const dead=!!(impactResult&&(impactResult.killed||impactResult.dead))||!!(this.vitals&&this.vitals.state&&this.vitals.state.dead);
    if(!airborne&&!dead&&dismount.roll&&this.abilities&&typeof this.abilities.beginRoll==='function'){
      this.abilities.beginRoll(dismount.horizontalMps,{force:true,reason:'vehicle-exit',impact:dismount.speedKmh,dirX:dismount.velocity.x,dirZ:dismount.velocity.z});
    }
    const cooldown=Math.max(.1,finite(this.config.entry&&this.config.entry.cooldown,.65));
    this.entryCooldown=cooldown;vehicle.entryCooldown=cooldown;
    emitPawnEvent(vehicle,driver?'OnVehicleDriverExited':'OnVehiclePassengerExited',{character:this,seat:seat.name||seat.id});
    emitPawnEvent(this,'OnCharacterExitedVehicle',{vehicle,seat:seat.name||seat.id,role:driver?'driver':'passenger',dismountMode:airborne?'free-fall':dismount.mode,speedKmh:dismount.speedKmh});
    return true;
  };
  pawn.exitSeat=pawn.exitVehicle;
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
      const entered=!used&&this.tryEnterNearestVehicle('driver');
      if(!used&&!entered&&this.abilities&&this.abilities.tryTraversal)this.abilities.tryTraversal();
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
        const entered=!used&&this.tryEnterNearestVehicle('driver');
        if(!used&&!entered&&this.abilities&&this.abilities.tryTraversal)this.abilities.tryTraversal();
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
  // Logic Element colliders are authored under the Pawn root. Scene Store
  // synchronizes them after editor transforms/load, while runtime locomotion
  // moves that root every frame. Keep the shared collider refs attached to the
  // live Character/Animal instead of leaving a blocking/LOS ghost at spawn.
  pawn.syncRuntimeColliders=function(){
    const owner=this.owner,refs=owner&&owner.userData&&owner.userData.logicElementColliderRefs;
    if(!Array.isArray(refs)||!refs.length)return false;
    const store=window.LK_STORE;
    if(store&&typeof store.updateLogicElementColliderRefs==='function'){store.updateLogicElementColliderRefs(owner);return true;}
    if(store&&typeof store.syncCollider==='function'){store.syncCollider(owner);return true;}
    return false;
  };
  pawn.updateLocomotionFrame=function(h,move,snapshot){
    const locomotion=this.ensureLocomotion();if(!locomotion)return false;
    const facing=ownerWorldHeading(this.owner);
    let velocityX=snapshot?finite(snapshot.velocityX,0):finite(this.state.velocityX,0),velocityZ=snapshot?finite(snapshot.velocityZ,0):finite(this.state.velocityZ,0);
    // Traversal owns world translation and can bypass MovementController. Give
    // its current forward speed to the animation selector while still letting
    // the one-shot mixer advance on every frame it owns.
    if(!snapshot&&(this.state.rolling>0||this.state.sliding===true||this.state.traversal)){
      velocityX=Math.sin(facing)*finite(this.state.speed,0);velocityZ=Math.cos(facing)*finite(this.state.speed,0);
    }
    const localX=Math.cos(facing)*velocityX-Math.sin(facing)*velocityZ,localZ=Math.sin(facing)*velocityX+Math.cos(facing)*velocityZ;
    const previousSpeed=finite(this.state.animationPreviousSpeed,this.state.speed);
    const weapon=this.weaponPose();
    locomotion.update({x:localX,z:localZ,speed:this.state.speed,inputMagnitude:this.state.inputMagnitude,sprintAmount:this.state.sprintAmount,velocityY:this.state.velocityY,grounded:this.state.grounded,groundContact:snapshot?snapshot.groundContact:this.state.grounded,stepRise:snapshot?finite(snapshot.stepRise,0):0,stepHeight:snapshot?finite(snapshot.stepHeight,this.config.movement.stepHeight):this.config.movement.stepHeight,stepSide:snapshot?finite(snapshot.stepSide,1):1,justLanded:snapshot&&snapshot.justLanded===true,sprinting:this.state.sprinting,crouch:clamp(finite(this.state.crouch,0),0,1),acceleration:(this.state.speed-previousSpeed)/h,action:this.state.action,ability:this.state.ability,abilityPose:this.state.abilityPose,traversalTargets:this.state.traversalTargets||null,weapon,lean:this.firstPerson&&this.firstPerson.leanAmount?this.firstPerson.leanAmount():0},h);
    // The stance reads the SAME pose the arm layer is about to refine, resolved
    // once per frame, so the clip the body plays and the points the hands are sent
    // to can never disagree about what the weapon is doing.
    this.updateWeaponStance(weapon);
    this.state.animationPreviousSpeed=this.state.speed;
    return true;
  };
  pawn.prepareRuntime=async function(context){
    // This Pawn is adopted by Play after the benchmark, so preparing it here
    // removes first-use work without creating a disposable duplicate. Wait for
    // its authored GLB and animation libraries, then bind the same locomotion,
    // cloth, collider and seating paths that gameplay will use.
    const assetReady=this.owner&&this.owner.userData&&this.owner.userData.logicElementAssetReady;
    if(assetReady&&typeof assetReady.then==='function')try{await assetReady;}catch(error){}
    await Promise.resolve(this.ensureAnimationLibraries());
    let locomotion=this.ensureLocomotion();
    const neutral={speed:0,speedKmh:0,moving:false,sprinting:false,sprintAmount:0,inputMagnitude:0,grounded:true,groundContact:true,airborne:false,velocityX:0,velocityY:0,velocityZ:0};
    if(locomotion)this.updateLocomotionFrame(.0001,neutralMove(),neutral);
    const cloth=this.ensureCloth();
    this.syncRuntimeColliders();
    const occupancy=window.LK_RUNTIME_VEHICLE_OCCUPANCY,vehicles=GAME&&GAME.pawns&&GAME.pawns.list?GAME.pawns.list():[];
    const seating=occupancy&&occupancy.prewarmCharacter?occupancy.prewarmCharacter(this,vehicles,{maximumProfiles:12}):null;
    // Seat IK is warmed on the adopted live Pawn, then the existing controller
    // is reset once and evaluated in neutral. Never rebind/retarget the same
    // skeleton during a benchmark: doing so promoted a sampled pose into rest.
    const presentationRestart=!!locomotion&&typeof locomotion.resetPresentation==='function'&&locomotion.resetPresentation();
    if(presentationRestart)this.updateLocomotionFrame(.0001,neutralMove(),neutral);
    if(this.firstPerson&&typeof this.firstPerson.syncBodyVisibility==='function')this.firstPerson.syncBodyVisibility(true);
    return {pawnId:this.id,type:'character',locomotion:!!locomotion,presentationRestart,cloth:!!cloth,seating};
  };
  const coreStart=pawn.start.bind(pawn);
  pawn.start=function(){
    coreStart();
    // Play must enter through the same clean animation ownership boundary as
    // vehicle exit. The Logic runner intentionally starts generic element
    // autoplay before Pawn.start(); reset that already-bound presentation once
    // and sample neutral immediately so the first visible frame is never the
    // imported/T-pose or a competing autoplay action.
    const locomotion=this.ensureLocomotion();
    if(locomotion&&typeof locomotion.resetPresentation==='function'&&locomotion.resetPresentation()){
      const neutral={speed:0,speedKmh:0,moving:false,sprinting:false,sprintAmount:0,inputMagnitude:0,grounded:true,groundContact:true,airborne:false,velocityX:0,velocityY:0,velocityZ:0};
      this.updateLocomotionFrame(.0001,neutralMove(),neutral);
    }
    this.setHidden(this.hidden);this.syncRuntimeColliders();return this;
  };
  pawn.step=function(dt){
    if(!this.started||this.sleeping||this.disposed||!this.enabled)return;
    const h=clamp(finite(dt,.016),.0001,.1),move=Object.assign(neutralMove(),this.control||{});
    this.entryCooldown=Math.max(0,finite(this.entryCooldown,0)-h);
    this.postVehiclePoseReset=Math.max(0,finite(this.postVehiclePoseReset,0)-h);
    // The vehicle owns translation and camera while this Character occupies a
    // seat. Continuing the arcade controller behind the hidden mesh caused the
    // old body to walk away from the car and collide with it as a ghost.
    if(this.inVehicle){
      const occupancy=window.LK_RUNTIME_VEHICLE_OCCUPANCY,seat=this.occupyingSeat,vehicle=this.inVehicle;
      if(occupancy&&occupancy.syncSeatOccupant)occupancy.syncSeatOccupant(this,vehicle,seat);
      const seatedSnapshot={speed:0,speedKmh:0,moving:false,sprinting:false,sprintAmount:0,inputMagnitude:0,grounded:true,groundContact:true,airborne:false,velocityX:0,velocityY:0,velocityZ:0};
      Object.assign(this.state,seatedSnapshot,{animationPreviousSpeed:0,action:null,abilityPose:null,traversal:null,traversalTargets:null});
      // Keep AnimationMixer advancing: freezing it on the final pre-entry frame
      // was why a visible occupant could inherit a run/aim pose indefinitely.
      this.updateLocomotionFrame(h,neutralMove(),seatedSnapshot);
      if(occupancy&&occupancy.syncSeatOccupant)occupancy.syncSeatOccupant(this,vehicle,seat);
      if(occupancy&&occupancy.applySeatPose)occupancy.applySeatPose(this,vehicle,seat);
      if(!this.appearanceApplied)this.applyAppearance();
      const cloth=this.ensureCloth();if(cloth)cloth.update(h);
      return;
    }
    // Input may change between Logic updates. Refresh device-owned channels on
    // every simulation frame so a released trigger cannot remain cached.
    if(this.possessed){const live=this.livePlayerDrive();if(live)DEVICE_CHANNELS.forEach(channel=>{move[channel]=live[channel];});}
    if(this.state.actionFallbackTimer>0){this.state.actionFallbackTimer-=h;if(this.state.actionFallbackTimer<=0&&this.state.actionFallbackFinish){const finish=this.state.actionFallbackFinish;this.state.actionFallbackFinish=null;finish();}}
    this.state.actionTime+=h;
    if(this.possessed)this.stepWorldVerbs(h,move);
    if(typeof this.beforeMovementStep==='function'&&this.beforeMovementStep(h,move)===true){this.updateLocomotionFrame(h,move,null);this.syncRuntimeColliders();return;}
    if(move.jump===true)this.jump();
    // A vehicle hand-off must not leave the saved heading/heading fallback in
    // charge of ordinary third-person locomotion. Travel remains camera-relative
    // and the rendered body follows that travel on every frame, not only on the
    // first step after dismount. ADS/fire/first-person keep their strafe-facing
    // policy from the view rig.
    if(this.vehicleExitThirdPersonFacing===true){
      const rigState=this.firstPerson&&this.firstPerson.state||{},hipTravel=rigState.viewMode!=='first'&&finite(rigState.ads,0)<.18&&move.fire!==true&&rigState.reloading!==true;
      if(hipTravel){move.inputMode='camera';move.facingMode='movement';}
    }
    const scale=typeof this.movementScale==='function'?clamp(finite(this.movementScale(move),1),0,1):1;
    const snapshot=this.movementController?this.movementController.step(this.owner,{x:clamp(finite(move.x,0),-1,1)*scale,z:clamp(finite(move.z,0),-1,1)*scale,sprint:move.sprint===true,sprintAmount:clamp(finite(move.sprintAmount,move.sprint===true?1:0),0,1),inputMode:move.inputMode,facingMode:move.facingMode},h,this.config.spawn.y):{speed:0,speedKmh:0,moving:false,sprinting:false,sprintAmount:0,inputMagnitude:0,grounded:true,airborne:false,velocityX:0,velocityY:0,velocityZ:0};
    // Keep the visible on-foot root aligned in WORLD space for the whole
    // post-vehicle session. A one-frame repair appeared correct near spawn but
    // a later local/root update could reintroduce the cockpit heading after the
    // vehicle had travelled farther through the level.
    if(this.vehicleExitThirdPersonFacing===true&&snapshot.moving&&Math.hypot(finite(snapshot.velocityX,0),finite(snapshot.velocityZ,0))>.15){
      const rigState=this.firstPerson&&this.firstPerson.state||{},hipTravel=rigState.viewMode!=='first'&&finite(rigState.ads,0)<.18&&move.fire!==true&&rigState.reloading!==true;
      if(hipTravel)setOwnerWorldHeading(this.owner,Math.atan2(snapshot.velocityX,snapshot.velocityZ));
    }
    Object.assign(this.state,{velocityX:snapshot.velocityX,velocityY:snapshot.velocityY,velocityZ:snapshot.velocityZ,heading:ownerWorldHeading(this.owner),speed:snapshot.speed,speedKmh:snapshot.speedKmh,moving:snapshot.moving,sprinting:snapshot.sprinting,sprintAmount:snapshot.sprintAmount,inputMagnitude:snapshot.inputMagnitude,grounded:snapshot.grounded,airborne:snapshot.airborne});
    this.updateLocomotionFrame(h,move,snapshot);
    this.state.surface=snapshot.surface||null;
    // Footsteps, landings and breathing belong to the Pawn, not to any one
    // camera mode, so first and third person get them from the same place.
    // Only a possessed Pawn is audible: remote and AI characters would need
    // spatialisation, which the set does not model yet.
    if(this.possessed&&GAME.systems&&GAME.systems.characterAudio)GAME.systems.characterAudio.pawnFrame(this,h,snapshot);
    if(!this.appearanceApplied)this.applyAppearance();
    const cloth=this.ensureCloth();if(cloth)cloth.update(h);
    if(typeof this.afterMovementStep==='function')this.afterMovementStep(h,move,snapshot);
    this.syncRuntimeColliders();
  };
  pawn.dispose=function(){if(this.disposed)return false;if(this.inVehicle){this.entryCooldown=0;this.exitVehicle(true);}const systems=GAME&&GAME.systems||{};if(systems.actorBehavior&&typeof systems.actorBehavior.releasePawn==='function')systems.actorBehavior.releasePawn(this,'pawn-dispose');if(systems.actorCombat&&typeof systems.actorCombat.releasePawn==='function')systems.actorCombat.releasePawn(this);this.disposed=true;this.started=false;this.control=null;this.possessCamera(false);if(this.locomotion)this.locomotion.dispose();if(this.clothController)this.clothController.dispose();this.locomotion=null;this.clothController=null;this.clothNode=null;registry.unregister(this);if(this.owner&&this.owner.userData){delete this.owner.userData[ownerKey];delete this.owner.userData.vehiclePawnId;delete this.owner.userData.characterCloth;}return true;};
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
  // ADDITIVE: cover sits BETWEEN traversal and the view rig, so the composed
  // frame order becomes rig (view/weapon, always) -> cover (may own the body)
  // -> abilities (may own the body). A Pawn with no `cover` block, or a build
  // without the module, is byte-for-byte the previous behaviour.
  pawn.cover=cfg.cover&&window.LK_RUNTIME_CHARACTER_COVER
    ?window.LK_RUNTIME_CHARACTER_COVER.attach(GAME,pawn,cfg.cover)
    :null;
  pawn.firstPerson=cfg.firstPerson&&window.LK_RUNTIME_FIRST_PERSON
    ?window.LK_RUNTIME_FIRST_PERSON.attach(GAME,pawn,cfg.firstPerson)
    :null;
  // The classic arms+weapon visual is a presentation component, never a second
  // Character. Camera, input and AnimationMixer remain on this Pawn in both
  // views; the component owns only its extra visual and its teardown.
  const firstPersonConfig=pawn.firstPerson&&pawn.firstPerson.config(),viewPawnConfig=firstPersonConfig&&firstPersonConfig.viewPawn,
    wantsSeparateViewPawn=!!(firstPersonConfig&&firstPersonConfig.allowViewToggle!==true&&viewPawnConfig&&viewPawnConfig.enabled===true&&viewPawnConfig.kind==='first-person-arms');
  pawn.firstPersonViewPawn=wantsSeparateViewPawn&&window.LK_RUNTIME_FIRST_PERSON_VIEW_PAWN
    ?window.LK_RUNTIME_FIRST_PERSON_VIEW_PAWN.attach(pawn,viewPawnConfig,firstPersonConfig)
    :null;
  // Item Runtime owns the single hydration path shared with Actor Combat's
  // lazy AI-only rig attachment, so starting weapon and loadout cannot diverge.
  pawn.inventory=pawn.firstPerson&&window.LK_RUNTIME_ITEMS&&typeof window.LK_RUNTIME_ITEMS.attachInventory==='function'
    ?window.LK_RUNTIME_ITEMS.attachInventory(GAME,pawn,cfg.inventory||{},cfg.loadout||[])
    :null;
  if(!owner.userData)owner.userData={};owner.userData[ownerKey]=pawn.id;owner.userData.vehiclePawnId=pawn.id;registry.register(pawn);return pawn;
}

window.LK_RUNTIME_CHARACTER_PAWN_BASE=Object.freeze({normalizeCommonConfig,normalizePlayerId,neutralMove,loadAnimationLibrary,animationLibraryKey,animationBindingSpec,animationClipName,animationAssetRef,emitPawnEvent,applyAppearanceToNode,finite,clamp,clone,create});
})();
