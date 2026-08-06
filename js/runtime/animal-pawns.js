/* =========================================================
   LOT KING - Animal Pawn runtime
   Cat, dog, horse and generic quadruped gameplay built on the
   shared Character movement/animation contract. A rigged user
   GLB is authoritative when assigned; otherwise the procedural
   animal placeholder remains fully animated and playable.
   ========================================================= */
(function(){
'use strict';

const SCHEMA_VERSION=1;
const SPECIES=Object.freeze(['cat','dog','horse','generic']);
const PRESETS=Object.freeze({
  cat:{movement:{walkSpeed:1.25,runSpeed:6.8,sprintMultiplier:1.25,acceleration:17,turnRate:13,jumpHeight:1.05,gravity:23,airControl:.42,radius:.18,height:.52,stepHeight:.28},trotSpeed:2.8,camera:{distance:4.8,height:1.55,lag:8,fov:64}},
  dog:{movement:{walkSpeed:1.75,runSpeed:7.4,sprintMultiplier:1.25,acceleration:16,turnRate:12,jumpHeight:.9,gravity:23,airControl:.36,radius:.26,height:.86,stepHeight:.38},trotSpeed:3.4,camera:{distance:5.8,height:1.9,lag:7.5,fov:64}},
  horse:{movement:{walkSpeed:2.2,runSpeed:11.5,sprintMultiplier:1.3,acceleration:12,turnRate:7.5,jumpHeight:.82,gravity:24,airControl:.2,radius:.48,height:2.05,stepHeight:.6},trotSpeed:5.2,camera:{distance:8.8,height:3.1,lag:6,fov:68}},
  generic:{movement:{walkSpeed:1.6,runSpeed:6.2,sprintMultiplier:1.25,acceleration:14,turnRate:10,jumpHeight:.9,gravity:23,airControl:.32,radius:.3,height:1.05,stepHeight:.42},trotSpeed:3.1,camera:{distance:6.2,height:2.15,lag:7,fov:64}},
});
const ANIMATION_DEFAULTS=Object.freeze({
  idle:'Idle',walk:'Walk',trot:'Trot',run:'Run',crouch:'Crouch',jump:'Jump',fall:'Fall',land:'Land',
  pounce:'Pounce',voice:'Bark',dig:'Dig',fetch:'Fetch',rear:'Rear',interact:'Fetch',
});
const APPEARANCE_DEFAULTS=Object.freeze({furColor:'#7c8b93',bellyColor:'#c4ccd1',accentColor:'#33403f',eyeColor:'#1f2a2e'});
const ABILITY_DEFAULTS=Object.freeze({
  cat:{climbSpeed:1.8,climbMaxHeight:2.4,climbReach:.48,ledgeBalanceDuration:.8,pounceSpeed:7.8,pounceDuration:.58,stealthMultiplier:.42,fallRecoveryDrop:1.15,fallRecoveryDuration:.32},
  dog:{alertRadius:12,digDuration:1.2,chaseSpeedMultiplier:1.05,chaseStopDistance:1.15},
  horse:{rideable:true,seatOffset:{x:0,y:1.55,z:-.08},dismountOffset:1.25},
});

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function finite(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function normalizeSpecies(value){const key=String(value||'').trim().toLowerCase();return SPECIES.includes(key)?key:'generic';}
function defaultAnimationSet(species){
  const preset=PRESETS[normalizeSpecies(species)],walk=preset.movement.walkSpeed,run=preset.movement.runSpeed,trot=preset.trotSpeed;
  return [
    {id:'animal-idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,speedTolerance:.6,clip:'Idle',asset:null,loop:true,priority:1},
    {id:'animal-walk',name:'Walk',state:'grounded',direction:[0,1],speed:walk,speedTolerance:Math.max(.8,trot-walk),clip:'Walk',asset:null,loop:true,priority:1},
    {id:'animal-trot',name:'Trot',state:'grounded',direction:[0,1],speed:trot,speedTolerance:Math.max(1,run-trot),clip:'Trot',asset:null,loop:true,priority:1.1},
    {id:'animal-run',name:'Run / Gallop',state:'grounded',direction:[0,1],speed:run,speedTolerance:Math.max(1.5,run*.35),clip:'Run',asset:null,loop:true,priority:1.2},
    {id:'animal-crouch',name:'Crouch / Stalk',state:'grounded',direction:[0,1],speed:walk*.45,speedTolerance:1,clip:'Crouch',asset:null,loop:true,priority:1.3},
    {id:'animal-jump',name:'Jump',state:'jump',direction:[0,1],speed:run*.45,speedTolerance:3,clip:'Jump',asset:null,loop:false,priority:1.5},
    {id:'animal-fall',name:'Fall',state:'fall',direction:[0,1],speed:run*.45,speedTolerance:4,clip:'Fall',asset:null,loop:true,priority:1.4},
    {id:'animal-land',name:'Land',state:'land',direction:[0,0],speed:0,speedTolerance:1,clip:'Land',asset:null,loop:false,priority:1.5},
    {id:'animal-pounce',name:'Pounce',state:'action',action:'pounce',direction:[0,1],speed:0,speedTolerance:1,clip:'Pounce',asset:null,loop:false,priority:2},
  ];
}
function profilePalette(species){
  const runtime=window.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION,profile=runtime&&runtime.profile?runtime.profile(species):null,colors=profile&&profile.colors||{};
  return {furColor:colors.fur||APPEARANCE_DEFAULTS.furColor,bellyColor:colors.belly||APPEARANCE_DEFAULTS.bellyColor,accentColor:colors.accent||APPEARANCE_DEFAULTS.accentColor,eyeColor:colors.eye||APPEARANCE_DEFAULTS.eyeColor};
}
function normalizeConfig(source){
  const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE,src=source&&typeof source==='object'?base.clone(source):{},species=normalizeSpecies(src.species),preset=PRESETS[species];
  const cfg=base.normalizeCommonConfig(src,{
    schemaVersion:SCHEMA_VERSION,species,playerId:1,spawn:{x:0,y:0,z:0,heading:0},movement:Object.assign({inputMode:'camera',facingMode:'movement'},preset.movement),
    animations:ANIMATION_DEFAULTS,animationSet:defaultAnimationSet(species),locomotion:{responsiveness:10,predictionTime:.1},
    appearance:profilePalette(species),camera:Object.assign({mode:'free',view:'third'},preset.camera),cloth:{enabled:false,pieces:[]},
  });
  cfg.species=species;
  cfg.trotSpeed=clamp(finite(src.trotSpeed,preset.trotSpeed),.2,20);
  cfg.proportions=src.proportions&&typeof src.proportions==='object'?clone(src.proportions):{};
  cfg.appearance=Object.assign(profilePalette(species),src.appearance||{});
  cfg.animations=Object.assign({},ANIMATION_DEFAULTS,src.animations||{});
  cfg.animationSet=Array.isArray(src.animationSet)?clone(src.animationSet):defaultAnimationSet(species);
  cfg.abilities={
    cat:Object.assign({},ABILITY_DEFAULTS.cat,src.abilities&&src.abilities.cat||{}),
    dog:Object.assign({},ABILITY_DEFAULTS.dog,src.abilities&&src.abilities.dog||{}),
    horse:Object.assign({},ABILITY_DEFAULTS.horse,src.abilities&&src.abilities.horse||{}),
  };
  cfg.abilities.horse.seatOffset=Object.assign({},ABILITY_DEFAULTS.horse.seatOffset,src.abilities&&src.abilities.horse&&src.abilities.horse.seatOffset||{});
  return cfg;
}
function findSceneNode(owner,id){let found=null;if(owner&&owner.traverse)owner.traverse(node=>{if(!found&&node&&node.userData&&node.userData.logicElementSceneId===id)found=node;});return found;}
function hasAssetVisual(node){let found=false;if(node&&node.traverse)node.traverse(child=>{if(child&&child.userData&&child.userData.logicElementAssetVisual)found=true;});return found;}
function applyPlaceholderProfile(owner,config){
  const runtime=window.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION;
  if(!owner||!runtime||!runtime.poseParts)return false;
  const spec=runtime.profile(config.species,config.proportions),parts=runtime.poseParts(spec),appearance=config.appearance||{};
  const colors={fur:appearance.furColor||spec.colors.fur,belly:appearance.bellyColor||spec.colors.belly,accent:appearance.accentColor||spec.colors.accent,eye:appearance.eyeColor||spec.colors.eye};
  let applied=0;
  parts.forEach(part=>{
    const node=findSceneNode(owner,part.id);if(!node)return;
    if(node.position&&node.position.fromArray)node.position.fromArray(part.position);else if(node.position&&node.position.set)node.position.set(part.position[0],part.position[1],part.position[2]);
    if(node.rotation&&node.rotation.set){const toRad=window.THREE&&window.THREE.MathUtils?window.THREE.MathUtils.degToRad:value=>value*Math.PI/180;node.rotation.set(toRad(part.rotation[0]),toRad(part.rotation[1]),toRad(part.rotation[2]));}
    if(node.scale&&node.scale.fromArray)node.scale.fromArray(part.scale);else if(node.scale&&node.scale.set)node.scale.set(part.scale[0],part.scale[1],part.scale[2]);
    if(part.colorKey&&node.material){const materials=Array.isArray(node.material)?node.material:[node.material];materials.forEach((material,index)=>{if(!material||!material.color||!material.color.set)return;if(!node.userData.animalTintOwned&&material.clone){const next=material.clone();if(Array.isArray(node.material))node.material[index]=next;else node.material=next;material=next;}material.color.set(colors[part.colorKey]);material.needsUpdate=true;});node.userData.animalTintOwned=true;}
    applied++;
  });
  owner.updateMatrixWorld&&owner.updateMatrixWorld(true);
  return applied>0;
}
function placeholderController(pawn){
  const runtime=window.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION;if(!runtime||!runtime.createController)return null;
  const controller=runtime.createController({species:pawn.config.species,walkSpeed:pawn.config.movement.walkSpeed,trotSpeed:pawn.config.trotSpeed,runSpeed:pawn.config.movement.runSpeed,responsiveness:pawn.config.locomotion.responsiveness,predictionTime:pawn.config.locomotion.predictionTime,stepPoseStrength:pawn.config.locomotion.stepPoseStrength});
  if(!controller.bind(pawn.owner)){controller.dispose();return null;}
  const frame={};
  return Object.freeze({
    bind:controller.bind,
    update(desired,dt){Object.assign(frame,desired||{});frame.crouch=pawn.state.crouching?1:0;frame.gait=pawn.state.gait;controller.update(frame,dt);},
    playAction:controller.playAction,stopAction:controller.stopAction,isActionPlaying:controller.isActionPlaying,
    holdActionAtProgress:controller.holdActionAtProgress,resumeAction:controller.resumeAction,actionProgress:controller.actionProgress,
    configure:controller.configure,dispose:controller.dispose,isBound:controller.isBound,availableClips:controller.availableClips,debugState:controller.debugState,
  });
}
function allows(pawn,species){return pawn&&pawn.config&&(pawn.config.species===species||pawn.config.species==='generic');}
function pawnOwner(value){return value&&value.owner||value&&value.position&&value||null;}
function plainAbilityPayload(pawn,extra){return Object.assign({ability:pawn.state.ability||'',species:pawn.config.species},extra||{});}
function beginAbility(pawn,name,duration,data){
  if(pawn.state.ability&&pawn.state.ability!==name)pawn.finishAbility('interrupted');
  pawn.state.ability=String(name||'');pawn.state.abilityTime=0;pawn.animalAbility=Object.assign({name:pawn.state.ability,duration:Math.max(0,finite(duration,0))},data||{});
  window.LK_RUNTIME_CHARACTER_PAWN_BASE.emitPawnEvent(pawn,'OnAnimalAbilityStarted',plainAbilityPayload(pawn));return true;
}
function finishAbility(pawn,reason){
  if(!pawn.state.ability)return false;const ability=pawn.state.ability;
  pawn.state.ability='';pawn.state.abilityTime=0;pawn.animalAbility=null;
  if(pawn.configureMovementRuntime)pawn.configureMovementRuntime('base');
  window.LK_RUNTIME_CHARACTER_PAWN_BASE.emitPawnEvent(pawn,'OnAnimalAbilityFinished',{ability,species:pawn.config.species,reason:reason||'completed'});return true;
}
function findClimbSurface(pawn,options){
  const owner=pawn.owner,colliders=pawn.GAME&&pawn.GAME.world&&pawn.GAME.world.colliders,boxes=colliders&&colliders.box;if(!owner||!owner.position||!boxes)return null;
  const cfg=pawn.config.abilities.cat,heading=owner.rotation?finite(owner.rotation.y,0):0,fx=Math.sin(heading),fz=Math.cos(heading),reach=Math.max(.1,finite(options&&options.reach,cfg.climbReach)),maxHeight=Math.max(.1,finite(options&&options.maxHeight,cfg.climbMaxHeight)),probeX=owner.position.x+fx*reach,probeZ=owner.position.z+fz*reach;
  let best=null;boxes.forEach(col=>{if(!col||col.enabled===false||col.walkable===false||col.hx==null||col.hy==null||col.x==null||col.y==null||col.z==null)return;const top=Number(col.y)+Number(col.hy),rise=top-owner.position.y;if(rise<=.08||rise>maxHeight)return;if(Math.abs(probeX-Number(col.x))>Number(col.hx)+pawn.config.movement.radius||Math.abs(probeZ-Number(col.z))>Number(col.hz)+pawn.config.movement.radius)return;if(!best||rise<best.rise)best={top,rise,fx,fz,advance:Math.max(.14,pawn.config.movement.radius*1.2),collider:col};});return best;
}
function resolvePawn(pawn,value){const registry=pawn.GAME&&pawn.GAME.pawns;if(value&&value.id&&value.owner)return value;if(registry&&registry.get){const found=registry.get(value);if(found)return found;}return value&&value.position?{id:value.userData&&value.userData.logicInstanceId||'',owner:value}:null;}
function syncRider(pawn){
  const rider=pawn.riderPawn,horse=pawn.owner,target=rider&&rider.owner;if(!rider||!horse||!horse.position||!target||!target.position)return false;
  const offset=pawn.config.abilities.horse.seatOffset,heading=horse.rotation?finite(horse.rotation.y,0):0,rightX=Math.cos(heading),rightZ=-Math.sin(heading),forwardX=Math.sin(heading),forwardZ=Math.cos(heading);
  target.position.set(horse.position.x+rightX*finite(offset.x,0)+forwardX*finite(offset.z,0),horse.position.y+finite(offset.y,1.55),horse.position.z+rightZ*finite(offset.x,0)+forwardZ*finite(offset.z,0));if(target.rotation)target.rotation.y=heading;target.updateMatrixWorld&&target.updateMatrixWorld(true);return true;
}
function createLogic(GAME,owner,source,services){
  const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE,cfg=normalizeConfig(source),pawn=base.create(GAME,owner,cfg,services,{pawnType:'animal',ownerKey:'animalPawnId',idPrefix:'animal-pawn-',actionStartedEvent:'OnAnimalActionStarted',actionFinishedEvent:'OnAnimalActionFinished',actionPayload:record=>({species:record.config.species,gait:record.state.gait})});
  if(!pawn)return null;
  pawn.inputCapabilities=Object.assign({},pawn.inputCapabilities||{}, {primaryAbility:true,secondaryAbility:true,voice:true});
  pawn.GAME=GAME;pawn.state.species=cfg.species;pawn.state.gait='idle';pawn.state.requestedGait='auto';pawn.state.crouching=false;pawn.state.stealth=false;pawn.state.ability='';pawn.state.abilityTime=0;pawn.state.alertTargets=[];pawn.state.chaseTargetId=null;pawn.state.chaseSource=null;pawn.state.riderPawnId=null;pawn.animalAbility=null;pawn.chaseTarget=null;pawn.chaseOwnerToken=null;pawn.chaseSource=null;pawn.riderPawn=null;pawn.movementRuntimeKey='base';pawn.locomotionFailedNode=null;pawn.locomotionBindRetryFrames=0;
  pawn.configureMovementRuntime=function(key,patch){if(!this.movementController)return null;const token=String(key||'base');if(this.movementRuntimeKey===token)return null;this.movementRuntimeKey=token;return this.movementController.configure(patch?Object.assign({},this.config.movement,patch):this.config.movement);};
  pawn.findLocomotionNode=function(){const holder=findSceneNode(this.owner,'animal_model');return holder&&holder.userData&&holder.userData.logicElementAssetKey&&hasAssetVisual(holder)?holder:null;};
  pawn.ensureLocomotion=function(){
    const currentNode=this.findLocomotionNode();
    if(this.locomotionKind==='model'&&this.locomotion&&this.locomotion.isBound()&&this.locomotionNode===currentNode&&currentNode&&currentNode.parent)return this.locomotion;
    if(!currentNode){this.locomotionFailedNode=null;this.locomotionBindRetryFrames=0;if(this.locomotionKind==='placeholder'&&this.locomotion&&this.locomotion.isBound())return this.locomotion;}
    this.ensureAnimationLibraries();
    const runtime=window.LK_RUNTIME_CHARACTER_LOCOMOTION||window.LK_RUNTIME_SOCCER_LOCOMOTION;
    const retryBlocked=currentNode&&currentNode===this.locomotionFailedNode&&this.locomotionBindRetryFrames>0;
    if(retryBlocked)this.locomotionBindRetryFrames--;
    if(runtime&&currentNode&&currentNode!==this.locomotionNode&&!retryBlocked){
      const controller=runtime.createController({THREERef:window.THREE,walkSpeed:this.config.movement.walkSpeed,runSpeed:this.config.movement.runSpeed,responsiveness:this.config.locomotion.responsiveness,predictionTime:this.config.locomotion.predictionTime,stepPoseStrength:this.config.locomotion.stepPoseStrength,animationSet:this.config.animationSet,role:'animal-'+this.config.species});
      if(controller.bind(currentNode,this.config.animations,this.libraryClips,this.config.animationSet)){
        if(this.locomotion)this.locomotion.dispose();this.locomotion=controller;this.locomotionNode=currentNode;this.locomotionKind='model';this.placeholderAttempted=false;this.locomotionFailedNode=null;this.locomotionBindRetryFrames=0;
        this.owner.userData.animalAnimationClips=controller.availableClips();base.emitPawnEvent(this,'OnPawnAnimationsBound',{clips:controller.availableClips(),species:this.config.species});return controller;
      }
      controller.dispose();this.locomotionFailedNode=currentNode;this.locomotionBindRetryFrames=30;
    }
    if(!currentNode){
      if(!this.placeholderAttempted){this.placeholderAttempted=true;applyPlaceholderProfile(this.owner,this.config);const controller=placeholderController(this);if(controller){if(this.locomotion)this.locomotion.dispose();this.locomotion=controller;this.locomotionNode=null;this.locomotionKind='placeholder';return controller;}}
    }
    return this.locomotion&&this.locomotion.isBound()?this.locomotion:null;
  };
  const baseSetMovement=pawn.setMovement.bind(pawn);
  pawn.setMovement=function(patch){const result=baseSetMovement(patch);this.movementRuntimeKey='base';if(this.locomotion)this.locomotion.configure({walkSpeed:result.walkSpeed,trotSpeed:this.config.trotSpeed,runSpeed:result.runSpeed});return result;};
  pawn.setSpecies=function(value){const species=normalizeSpecies(value);if(species!=='horse'&&this.riderPawn)this.dismountRider();this.config.species=species;this.state.species=species;this.locomotionFailedNode=null;this.locomotionBindRetryFrames=0;applyPlaceholderProfile(this.owner,this.config);this.rebindLocomotion();return species;};
  pawn.setProportions=function(patch){Object.assign(this.config.proportions,patch||{});applyPlaceholderProfile(this.owner,this.config);this.rebindLocomotion();return this.config.proportions;};
  const baseSetAppearance=pawn.setAppearance.bind(pawn);
  pawn.setAppearance=function(patch){const appearance=baseSetAppearance(patch);applyPlaceholderProfile(this.owner,this.config);return appearance;};
  pawn.applyAppearance=function(){applyPlaceholderProfile(this.owner,this.config);this.appearanceApplied=true;return true;};
  const baseBinding=pawn.applyBinding.bind(pawn);
  pawn.applyBinding=function(path,value){const key=String(path||'');if(key==='species'){this.setSpecies(value);return true;}if(key==='trotSpeed'){this.config.trotSpeed=clamp(finite(value,this.config.trotSpeed),.2,20);if(this.locomotion)this.locomotion.configure({trotSpeed:this.config.trotSpeed});return true;}if(key.indexOf('proportions.')===0){this.setProportions({[key.slice(12)]:value});return true;}if(key.indexOf('abilities.')===0){const keys=key.split('.');let cursor=this.config;for(let index=0;index<keys.length-1;index++){const part=keys[index];if(!cursor[part]||typeof cursor[part]!=='object')cursor[part]={};cursor=cursor[part];}cursor[keys[keys.length-1]]=value;return true;}return baseBinding(path,value);};
  pawn.beginAbility=function(name,duration,data){return beginAbility(this,name,duration,data);};
  pawn.finishAbility=function(reason){return finishAbility(this,reason);};
  pawn.setGait=function(value){const gait=String(value||'auto').toLowerCase();this.state.requestedGait=['auto','walk','trot','run'].includes(gait)?gait:'auto';return this.state.requestedGait;};
  pawn.setStealth=function(enabled,multiplier){if(!allows(this,'cat'))return false;this.state.stealth=enabled!==false;if(Number.isFinite(Number(multiplier)))this.config.abilities.cat.stealthMultiplier=clamp(Number(multiplier),.1,1);if(this.state.stealth)this.playAction('crouch',{loop:true});else if(this.locomotion)this.locomotion.stopAction();base.emitPawnEvent(this,'OnAnimalStealthChanged',{enabled:this.state.stealth,species:this.config.species});return this.state.stealth;};
  pawn.pounce=function(options){if(!allows(this,'cat')||this.state.ability)return false;const ability=this.config.abilities.cat,speed=Math.max(.5,finite(options&&options.speed,ability.pounceSpeed)),duration=clamp(finite(options&&options.duration,ability.pounceDuration),.1,2);if(!this.jump())return false;beginAbility(this,'pounce',duration,{speed});this.playAction('pounce',{duration});return true;};
  pawn.climb=function(options){if(!allows(this,'cat')||this.state.ability)return false;const surface=findClimbSurface(this,options);if(!surface)return false;const duration=clamp(finite(options&&options.duration,surface.rise/Math.max(.1,this.config.abilities.cat.climbSpeed)),.15,4);beginAbility(this,'climb',duration,{surface,startY:this.owner.position.y,targetY:surface.top,elapsed:0});this.playAction('climb',{duration});return true;};
  pawn.balanceLedge=function(duration){if(!allows(this,'cat'))return false;const time=clamp(finite(duration,this.config.abilities.cat.ledgeBalanceDuration),.1,8);beginAbility(this,'ledge-balance',time,{});this.playAction('idle',{duration:time});return true;};
  pawn.barkAlert=function(radius){if(!allows(this,'dog'))return [];const range=Math.max(.1,finite(radius,this.config.abilities.dog.alertRadius)),origin=this.owner&&this.owner.position,targets=[];if(origin&&GAME.pawns&&GAME.pawns.list)GAME.pawns.list().forEach(candidate=>{const target=candidate!==this&&pawnOwner(candidate);if(!target)return;const dx=target.position.x-origin.x,dy=target.position.y-origin.y,dz=target.position.z-origin.z;if(dx*dx+dy*dy+dz*dz<=range*range)targets.push(candidate.id);});this.state.alertTargets=targets;this.playAction('voice');base.emitPawnEvent(this,'OnAnimalAlert',{species:this.config.species,radius:range,targets:targets.slice()});return targets;};
  pawn.dig=function(duration){if(!allows(this,'dog')||this.state.ability)return false;const time=clamp(finite(duration,this.config.abilities.dog.digDuration),.1,10);beginAbility(this,'dig',time,{});this.playAction('dig',{duration:time});return true;};
  // Chase can be authored explicitly or borrowed temporarily by an AI system.
  // The opaque owner token lets that system release only the chase it started:
  // possession/disable must never cancel a newer author or player command.
  pawn.chase=function(targetRef,options){if(!allows(this,'dog'))return false;const target=resolvePawn(this,targetRef);if(!target||!pawnOwner(target)||target===this)return false;const settings=options&&typeof options==='object'?options:{};this.chaseTarget=target;this.chaseOwnerToken=Object.prototype.hasOwnProperty.call(settings,'ownerToken')?settings.ownerToken:null;this.chaseSource=String(settings.source||(this.chaseOwnerToken!=null?'runtime':'author'));this.state.chaseTargetId=target.id||null;this.state.chaseSource=this.chaseSource;this.chaseOptions={stopDistance:Math.max(.1,finite(settings.stopDistance,this.config.abilities.dog.chaseStopDistance)),speedMultiplier:clamp(finite(settings.speedMultiplier,this.config.abilities.dog.chaseSpeedMultiplier),.2,2)};base.emitPawnEvent(this,'OnAnimalChaseStarted',{species:this.config.species,target:target.id||null,source:this.chaseSource});return true;};
  pawn.stopChase=function(reason,ownership){if(!this.chaseTarget)return false;if(ownership&&Object.prototype.hasOwnProperty.call(ownership,'ownerToken')&&ownership.ownerToken!==this.chaseOwnerToken)return false;const target=this.state.chaseTargetId,source=this.chaseSource;this.chaseTarget=null;this.chaseOwnerToken=null;this.chaseSource=null;this.state.chaseTargetId=null;this.state.chaseSource=null;this.chaseOptions=null;this.configureMovementRuntime('base');base.emitPawnEvent(this,'OnAnimalChaseFinished',{species:this.config.species,target,reason:reason||'stopped',source});return true;};
  pawn.mountRider=function(riderRef){if(!allows(this,'horse')||this.config.abilities.horse.rideable===false||this.riderPawn)return false;const rider=resolvePawn(this,riderRef);if(!rider||rider===this||!rider.owner)return false;const playerId=rider.playerId;rider.possessCamera&&rider.possessCamera(false);rider.unpossess&&rider.unpossess();rider.sleep&&rider.sleep();this.riderPawn=rider;this.riderPlayerId=playerId;this.state.riderPawnId=rider.id||null;if(playerId!=null){this.possess(playerId,true);this.possessCamera(true);}syncRider(this);base.emitPawnEvent(this,'OnAnimalMounted',{species:this.config.species,rider:rider.id||null,playerId});return true;};
  pawn.dismountRider=function(){const rider=this.riderPawn;if(!rider)return false;const playerId=this.riderPlayerId,offset=Math.max(.3,finite(this.config.abilities.horse.dismountOffset,1.25)),heading=this.owner&&this.owner.rotation?finite(this.owner.rotation.y,0):0;if(rider.owner&&rider.owner.position&&this.owner&&this.owner.position)rider.owner.position.set(this.owner.position.x+Math.cos(heading)*offset,this.owner.position.y,this.owner.position.z-Math.sin(heading)*offset);if(playerId!=null){this.possessCamera(false);this.unpossess();}rider.wake&&rider.wake();if(playerId!=null){rider.possess&&rider.possess(playerId,true);rider.possessCamera&&rider.possessCamera(true);}this.riderPawn=null;this.riderPlayerId=null;this.state.riderPawnId=null;base.emitPawnEvent(this,'OnAnimalDismounted',{species:this.config.species,rider:rider.id||null,playerId});return true;};
  pawn.movementScale=function(move){this.state.crouching=move&&move.crouch===true||this.state.stealth===true;let scale=this.state.crouching?finite(this.config.abilities.cat.stealthMultiplier,.42):1;if(this.state.ability==='dig'||this.state.ability==='ledge-balance'||this.state.ability==='fall-recovery')scale=0;return scale;};
  // The base may already have installed vitals, first-person, cover or ability
  // hooks. Animal behaviour composes with that chain; replacing it made animal
  // vitals stop ticking and silently detached other character features.
  const inheritedBeforeMovementStep=pawn.beforeMovementStep;
  const inheritedAfterMovementStep=pawn.afterMovementStep;
  pawn.beforeMovementStep=function(dt,move){
    if(typeof inheritedBeforeMovementStep==='function'&&inheritedBeforeMovementStep.call(this,dt,move)===true)return true;
    const ability=this.animalAbility;if(ability){ability.elapsed=finite(ability.elapsed,0)+dt;this.state.abilityTime=ability.elapsed;
      if(ability.name==='climb'){
        const t=Math.min(1,ability.elapsed/Math.max(.001,ability.duration)),smooth=t*t*(3-2*t),surface=ability.surface;this.owner.position.y=ability.startY+(ability.targetY-ability.startY)*smooth;this.state.speed=finite(this.config.abilities.cat.climbSpeed,1.8);this.state.speedKmh=this.state.speed*3.6;this.state.moving=true;this.state.grounded=false;this.state.airborne=true;const locomotion=this.ensureLocomotion();if(locomotion)locomotion.update({x:0,z:0,speed:0,velocityY:this.state.speed,grounded:false,action:'climb'},dt);if(t>=1){this.owner.position.x+=surface.fx*surface.advance;this.owner.position.z+=surface.fz*surface.advance;if(this.movementController)this.movementController.reset(this.owner.rotation&&this.owner.rotation.y);finishAbility(this,'completed');this.balanceLedge(this.config.abilities.cat.ledgeBalanceDuration);}return true;
      }
      if(ability.name==='pounce'){move.x=0;move.z=1;move.sprint=true;const runSpeed=clamp(ability.speed/Math.max(1,this.config.movement.sprintMultiplier),.5,14);this.configureMovementRuntime('pounce:'+runSpeed,{inputMode:'heading',runSpeed});if(ability.elapsed>=ability.duration&&this.state.grounded)finishAbility(this,'landed');}
      else if(ability.name==='dig'||ability.name==='ledge-balance'||ability.name==='fall-recovery'){move.x=0;move.z=0;move.sprint=false;if(ability.elapsed>=ability.duration)finishAbility(this,'completed');}
    }
    if(this.chaseTarget&&!this.state.ability){const target=pawnOwner(this.chaseTarget),here=this.owner&&this.owner.position;if(!target||!target.position||!here)this.stopChase('target-missing');else {const dx=target.position.x-here.x,dz=target.position.z-here.z,distance=Math.sqrt(dx*dx+dz*dz);if(distance<=this.chaseOptions.stopDistance)this.stopChase('reached');else {if(this.owner.rotation)this.owner.rotation.y=Math.atan2(dx,dz);move.x=0;move.z=1;move.sprint=false;const walkSpeed=clamp(this.config.movement.runSpeed*this.chaseOptions.speedMultiplier,.2,8);this.configureMovementRuntime('chase:'+walkSpeed,{inputMode:'heading',walkSpeed});}}}
    else if(!ability&&this.movementController){const gait=this.state.requestedGait;if(gait==='trot'){move.sprint=false;const walkSpeed=clamp(this.config.trotSpeed,.2,8);this.configureMovementRuntime('trot:'+walkSpeed,{walkSpeed});}else {if(gait==='walk')move.sprint=false;else if(gait==='run')move.sprint=true;this.configureMovementRuntime('base');}}
    return false;
  };
  pawn.afterMovementStep=function(dt,move,snapshot){const speed=finite(this.state.speed,0),requested=this.state.requestedGait;this.state.gait=this.state.crouching?'crouch':(speed<this.config.movement.walkSpeed*.18?'idle':(requested!=='auto'&&speed>.15?requested:(speed<this.config.trotSpeed?'walk':(speed<this.config.movement.runSpeed*.8?'trot':'run'))));if(snapshot&&snapshot.airborne){if(this.state.fallOriginY==null)this.state.fallOriginY=this.owner.position.y;else this.state.fallOriginY=Math.max(this.state.fallOriginY,this.owner.position.y);}if(snapshot&&snapshot.justLanded){const drop=finite(this.state.fallOriginY,this.owner.position.y)-this.owner.position.y;this.state.lastFallDrop=Math.max(0,drop);this.state.fallOriginY=null;if(allows(this,'cat')&&drop>=this.config.abilities.cat.fallRecoveryDrop&&!this.state.ability){beginAbility(this,'fall-recovery',this.config.abilities.cat.fallRecoveryDuration,{drop});this.playAction('land',{duration:this.config.abilities.cat.fallRecoveryDuration});}}syncRider(this);if(typeof inheritedAfterMovementStep==='function')inheritedAfterMovementStep.call(this,dt,move,snapshot);};
  pawn.prepareRuntime=function(){
    const ready=this.owner&&this.owner.userData&&this.owner.userData.logicElementAssetReady,self=this;
    return Promise.resolve(ready).catch(()=>null).then(()=>{if(self.disposed)return {ready:false,disposed:true};self.ensureAnimationLibraries();self.ensureLocomotion();return {ready:true,pawnId:self.id,species:self.config.species,visual:self.locomotionKind||'pending'};});
  };
  const baseDispose=pawn.dispose.bind(pawn);pawn.dispose=function(){if(this.riderPawn)this.dismountRider();this.stopChase('disposed');return baseDispose();};
  applyPlaceholderProfile(owner,cfg);
  return pawn;
}
function install(GAME){if(!GAME)return null;const core=window.LK_RUNTIME_PAWN_CORE&&window.LK_RUNTIME_PAWN_CORE.install(GAME);if(core&&core.components&&!core.components.has('animal'))core.components.register('animal',options=>createLogic(GAME,options.owner,options.config,options.services));return true;}

window.LK_RUNTIME_ANIMAL_PAWNS=Object.freeze({SCHEMA_VERSION,SPECIES,PRESETS,ANIMATION_DEFAULTS,ABILITY_DEFAULTS,normalizeSpecies,normalizeConfig,defaultAnimationSet,applyPlaceholderProfile,createLogic,install});
if(window.LOT_KING)install(window.LOT_KING);
})();
