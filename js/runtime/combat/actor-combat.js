/* =========================================================
   LOT KING - Actor Combat facade

   A small per-Pawn boundary around the current first-person weapon controller.
   Player cameras and weapon simulation deliberately remain where they are for
   now; AI, Logic and future actor types no longer need to know that location.
   ========================================================= */
(function(root){
'use strict';

const VERSION=1;

function finite(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function plainPoint(value){
  if(!value)return null;
  const node=value.owner||value.body||value;
  const point=node&&node.position||value.position||value;
  if(point&&Number.isFinite(Number(point.x))&&Number.isFinite(Number(point.z))){
    return {x:finite(point.x,0),y:finite(point.y,0),z:finite(point.z,0)};
  }
  return null;
}
function weaponSource(value){
  if(typeof value==='string')return {preset:value};
  return value&&typeof value==='object'?value:null;
}
function normalizedPayload(pawn,payload){
  if(!payload||typeof payload!=='object')return payload;
  if(payload.pawnId===pawn.id)return payload;
  return Object.assign({},payload,{pawnId:pawn.id});
}

function createFacade(GAME,pawn,source,onDispose){
  if(!pawn)throw new Error('Actor Combat requires a Pawn');
  let options=Object.assign({},source||{}),disposed=false;
  const state={lastFire:null,lastReload:false,lastEquip:null,visual:null,visualKey:'',visualHand:null,visualHost:null,flashTimer:0};
  const scratch={position:null,euler:null,offset:null};

  function configuredRig(){return pawn&&pawn.firstPerson||null;}
  function hydrateInventory(){
    const runtime=root.LK_RUNTIME_ITEMS,pawnConfig=pawn.config||{};
    if(!(pawn.firstPerson&&runtime&&typeof runtime.attachInventory==='function'))return pawn.inventory||null;
    return runtime.attachInventory(GAME,pawn,options.inventory||pawnConfig.inventory||{},options.loadout||pawnConfig.loadout||[]);
  }
  function attachController(){
    let rig=configuredRig();
    if(rig){hydrateInventory();return rig;}
    if(disposed||options.autoAttach!==true)return null;
    const runtime=root.LK_RUNTIME_FIRST_PERSON;
    if(!(runtime&&typeof runtime.attach==='function'))return null;
    const pawnConfig=pawn.config||{};
    const combat=pawnConfig.combat&&typeof pawnConfig.combat==='object'?pawnConfig.combat:{};
    const config=Object.assign({enabled:true,view:'third',allowViewToggle:false,hideOwnBody:false,showLegs:false},
      pawnConfig.firstPerson||{},options.firstPerson||{});
    const selected=weaponSource(options.weapon||combat.weapon);
    if(selected)config.weapon=selected;
    pawn.firstPerson=runtime.attach(GAME,pawn,config);
    hydrateInventory();
    return pawn.firstPerson;
  }
  function controller(){return disposed?null:attachController();}
  function weapon(){
    const rig=controller();
    if(rig&&typeof rig.weapon==='function')return rig.weapon();
    const config=rig&&typeof rig.config==='function'?rig.config():null;
    return config&&config.weapon||weaponSource(options.weapon)||null;
  }
  function ammo(){
    const rig=controller();
    if(rig&&typeof rig.ammo==='function')return Object.assign({},rig.ammo(),{pawnId:pawn.id});
    return {pawnId:pawn.id,ammo:0,reserve:0,magazine:0,reloading:false,infinite:false,armed:false,name:''};
  }
  function setViewAngles(yaw,pitch){
    const rig=controller();
    return rig&&typeof rig.setViewAngles==='function'?rig.setViewAngles(yaw,pitch):null;
  }
  function setAimDownSights(enabled){
    const rig=controller();
    return !!(rig&&typeof rig.setAimDownSights==='function'&&rig.setAimDownSights(enabled===true));
  }
  function aimAt(target,aimOptions){
    const point=plainPoint(target),owner=plainPoint(pawn);
    if(!point||!owner)return null;
    const cfg=aimOptions||{},rig=controller();
    const eye=rig&&typeof rig.eyePosition==='function'&&rig.eyePosition();
    const from=eye||{x:owner.x,y:owner.y+finite(cfg.eyeHeight,1.55),z:owner.z};
    const configuredHeight=target&&target.config&&target.config.movement&&Number(target.config.movement.height);
    const targetHeight=finite(cfg.targetHeight,Number.isFinite(configuredHeight)?configuredHeight*.62:1.1);
    const dx=point.x-from.x,dy=point.y+targetHeight-from.y,dz=point.z-from.z;
    const horizontal=Math.max(.0001,Math.sqrt(dx*dx+dz*dz));
    const yaw=Math.atan2(dx,dz),pitch=Math.atan2(dy,horizontal);
    setViewAngles(yaw,pitch);
    if(pawn.owner&&pawn.owner.rotation)pawn.owner.rotation.y=yaw;
    return {yaw,pitch,distance:Math.sqrt(dx*dx+dy*dy+dz*dz)};
  }
  function fire(){
    const rig=controller();
    const payload=rig&&typeof rig.fire==='function'?rig.fire():null;
    state.lastFire=normalizedPayload(pawn,payload);
    if(state.lastFire)state.flashTimer=.065;
    return state.lastFire;
  }
  function reload(){
    const rig=controller();
    state.lastReload=!!(rig&&typeof rig.reload==='function'&&rig.reload());
    return state.lastReload;
  }
  function equip(value,ammoState){
    const rig=controller(),selected=weaponSource(value);
    disposeVisual();
    state.lastEquip=rig&&typeof rig.equipWeapon==='function'?rig.equipWeapon(selected,ammoState):null;
    return state.lastEquip;
  }
  function equipNextUsable(){
    const inventory=pawn&&pawn.inventory;
    if(!(inventory&&typeof inventory.slots==='function'&&typeof inventory.index==='function'&&typeof inventory.equip==='function'))return null;
    const slots=inventory.slots().slice(0,12),current=inventory.index();let selected=null;
    for(let offset=1;offset<=slots.length;offset++){
      const index=(current+offset+slots.length)%slots.length,entry=slots[index],candidate=entry&&entry.weapon||{};
      const usable=candidate.infiniteAmmo===true||candidate.kind==='unarmed'||candidate.kind==='melee'||finite(entry&&entry.ammo,0)>0||finite(entry&&entry.reserve,0)>0;
      if(index===current||!usable)continue;
      const sidearm=candidate.kind==='firearm'&&(candidate.weight==='light'||candidate.slot==='primary'||candidate.assignedSlot==='primary');
      const priority=sidearm?0:(candidate.kind==='firearm'?1:(candidate.kind==='thrown'?3:2));
      if(!selected||priority<selected.priority)selected={index,priority};
    }
    if(!selected||!inventory.equip(selected.index))return null;
    disposeVisual();state.lastEquip=weapon();return state.lastEquip;
  }
  function command(value){
    if(!pawn||typeof pawn.setMoveInput!=='function')return false;
    pawn.setMoveInput(Object.assign({},value||{}));
    return true;
  }
  function applyBinding(path,value){
    const rig=controller();
    if(!(rig&&typeof rig.applyBinding==='function'))return false;
    let key=String(path||'');
    if(key==='combat.weaponPreset')key='firstPerson.weapon.preset';
    else if(key.indexOf('combat.weapon.')===0)key='firstPerson.weapon.'+key.slice(14);
    else if(key.indexOf('combat.')===0)key='firstPerson.'+key.slice(7);
    return rig.applyBinding(key,value)===true;
  }
  function findRightHand(owner){
    if(!(owner&&typeof owner.traverse==='function'))return null;
    const matches=[];owner.traverse(node=>{const name=String(node&&node.name||'').toLowerCase();if(name.indexOf('hand')<0||name.indexOf('left')>=0)return;if(name.indexOf('right')>=0||/(^|[^a-z])r([^a-z]|$)/.test(name))matches.push(node);});
    return matches.find(node=>node&&node.isBone)||matches[0]||null;
  }
  function disposeVisual(){
    const visual=state.visual;if(!visual)return false;
    if(visual.parent&&typeof visual.parent.remove==='function')visual.parent.remove(visual);
    if(typeof visual.traverse==='function')visual.traverse(node=>{if(node&&node.geometry&&typeof node.geometry.dispose==='function')node.geometry.dispose();});
    const materials=visual.userData&&visual.userData.materials||[];materials.forEach(material=>{if(material&&typeof material.dispose==='function')material.dispose();});
    state.visual=null;state.visualKey='';state.visualHand=null;state.visualHost=null;return true;
  }
  function ensureVisual(){
    const current=weapon(),key=current?String(current.id||'')+':'+String(current.preset||current.name||''):'';
    if(state.visual&&state.visualKey===key)return state.visual;
    disposeVisual();
    const runtime=root.LK_RUNTIME_FPS_VIEW_MODEL,THREE=root.THREE;
    if(!key||!(runtime&&typeof runtime.buildWorldModel==='function'))return null;
    const visual=runtime.buildWorldModel(THREE,current);if(!visual)return null;
    visual.name='AI Carried Weapon ['+pawn.id+']';if(visual.rotation&&typeof visual.rotation.set==='function')visual.rotation.set(0,0,0);
    const target=GAME&&GAME.core&&GAME.core.scene;if(target&&typeof target.add==='function')target.add(visual);
    state.visual=visual;state.visualKey=key;return visual;
  }
  function updateVisual(dt){
    const rig=controller(),info=ammo(),owner=pawn&&pawn.owner;
    if(disposed||pawn.possessed===true||pawn.enabled===false||pawn.hidden===true||!owner||info.armed===false){if(state.visual)state.visual.visible=false;return false;}
    const visual=ensureVisual();if(!visual)return false;visual.visible=true;
    if(state.visualHost!==owner){state.visualHost=owner;state.visualHand=findRightHand(owner);}
    else if(!state.visualHand)state.visualHand=findRightHand(owner);
    const THREE=root.THREE,angles=rig&&typeof rig.aimAngles==='function'?rig.aimAngles():(rig&&typeof rig.viewAngles==='function'?rig.viewAngles():{yaw:owner.rotation&&finite(owner.rotation.y,0),pitch:0});
    const yaw=finite(angles&&angles.yaw,owner.rotation&&finite(owner.rotation.y,0)),pitch=finite(angles&&angles.pitch,0);
    if(THREE&&visual.quaternion&&typeof visual.quaternion.setFromEuler==='function'){
      scratch.euler=scratch.euler||new THREE.Euler(0,0,0,'YXZ');scratch.euler.set(pitch,yaw+Math.PI,0,'YXZ');visual.quaternion.setFromEuler(scratch.euler);
    }else if(visual.rotation){visual.rotation.x=pitch;visual.rotation.y=yaw+Math.PI;visual.rotation.z=0;}
    if(state.visualHand&&typeof state.visualHand.getWorldPosition==='function'&&visual.position){
      if(THREE){scratch.position=scratch.position||new THREE.Vector3();state.visualHand.getWorldPosition(scratch.position);if(typeof visual.position.copy==='function')visual.position.copy(scratch.position);else Object.assign(visual.position,scratch.position);}
    }else if(visual.position){
      let at=plainPoint(owner)||{x:0,y:0,z:0};
      if(typeof owner.getWorldPosition==='function'&&THREE){scratch.position=scratch.position||new THREE.Vector3();owner.getWorldPosition(scratch.position);at=scratch.position;}
      const rightX=Math.cos(yaw),rightZ=-Math.sin(yaw),forwardX=Math.sin(yaw),forwardZ=Math.cos(yaw);
      const x=at.x+rightX*.22+forwardX*.18,y=at.y+1.25,z=at.z+rightZ*.22+forwardZ*.18;
      if(typeof visual.position.set==='function')visual.position.set(x,y,z);else Object.assign(visual.position,{x,y,z});
    }
    const config=rig&&typeof rig.config==='function'?rig.config():{},socket=config&&config.weaponSocket||{};
    const offset=Array.isArray(socket.offset)?socket.offset:[0,0,0],rotation=Array.isArray(socket.rotation)?socket.rotation:[0,0,0];
    if(visual.position&&(offset[0]||offset[1]||offset[2])){
      if(THREE&&visual.quaternion){scratch.offset=scratch.offset||new THREE.Vector3();scratch.offset.set(finite(offset[0],0),finite(offset[1],0),finite(offset[2],0)).applyQuaternion(visual.quaternion);if(typeof visual.position.add==='function')visual.position.add(scratch.offset);}
      else {visual.position.x+=finite(offset[0],0);visual.position.y+=finite(offset[1],0);visual.position.z+=finite(offset[2],0);}
    }
    if(visual.rotateX)visual.rotateX(finite(rotation[0],0));if(visual.rotateY)visual.rotateY(finite(rotation[1],0));if(visual.rotateZ)visual.rotateZ(finite(rotation[2],0));
    if(visual.scale){const scale=Math.max(.01,finite(socket.scale,1));if(typeof visual.scale.setScalar==='function')visual.scale.setScalar(scale);}
    state.flashTimer=Math.max(0,state.flashTimer-Math.max(0,finite(dt,0)));
    const flash=visual.userData&&visual.userData.flash;if(flash){flash.visible=state.flashTimer>0;if(flash.material)flash.material.opacity=Math.min(1,state.flashTimer/.065);}
    return true;
  }
  function configure(next){options=Object.assign({},options,next||{});return options;}
  function dispose(){if(disposed)return false;disposed=true;disposeVisual();if(pawn.actorCombat===facade)pawn.actorCombat=null;if(typeof onDispose==='function')onDispose(facade);return true;}

  const facade=Object.freeze({
    version:VERSION,pawn:()=>pawn,pawnId:()=>pawn.id,controller,weapon,ammo,aimAt,setViewAngles,
    setAimDownSights,fire,reload,equip,equipNextUsable,command,applyBinding,configure,updateVisual,disposeVisual,state,dispose,
    available:()=>!!controller(),armed:()=>{const info=ammo();return info.armed!==false&&!!weapon();},
  });
  pawn.actorCombat=facade;
  return facade;
}

function createRegistry(GAME){
  const records=new Map();let disposed=false,api=null;
  function forPawn(pawn,source){
    if(disposed||!pawn)return null;
    const id=String(pawn.id||'');
    const previous=records.get(id);
    if(previous&&previous.pawn()===pawn){if(source)previous.configure(source);return previous;}
    if(previous)previous.dispose();
    const facade=createFacade(GAME,pawn,source,released=>{if(records.get(id)===released)records.delete(id);});records.set(id,facade);return facade;
  }
  function get(ref){
    if(disposed)return null;
    if(ref&&typeof ref==='object')return forPawn(ref);
    return records.get(String(ref||''))||null;
  }
  function prune(live){
    if(disposed)return 0;
    const keep=live instanceof Set?live:new Set((live||[]).map(item=>String(item&&item.id||item)));
    records.forEach((facade,id)=>{if(!keep.has(id)){facade.dispose();records.delete(id);}});
    return records.size;
  }
  function releasePawn(ref){
    if(disposed||ref==null)return false;
    const objectRef=ref&&typeof ref==='object',id=String(objectRef?ref.id:ref||''),facade=records.get(id);
    if(!facade||objectRef&&facade.pawn()!==ref)return false;
    return facade.dispose();
  }
  function clear(){
    if(disposed)return 0;
    const facades=Array.from(records.values()),count=facades.length;facades.forEach(facade=>facade.dispose());records.clear();return count;
  }
  function dispose(){
    if(disposed)return false;clear();disposed=true;
    if(GAME&&GAME.systems&&GAME.systems.actorCombat===api)GAME.systems.actorCombat=null;
    return true;
  }
  api=Object.freeze({version:VERSION,forPawn,get,list:()=>disposed?[]:Array.from(records.values()),releasePawn,clear,prune,dispose,isDisposed:()=>disposed});return api;
}

function install(GAME){
  if(!GAME)return null;
  GAME.systems=GAME.systems||{};
  if(GAME.systems.actorCombat&&GAME.systems.actorCombat.version===VERSION&&!(typeof GAME.systems.actorCombat.isDisposed==='function'&&GAME.systems.actorCombat.isDisposed()))return GAME.systems.actorCombat;
  const registry=createRegistry(GAME);GAME.systems.actorCombat=registry;return registry;
}
function forPawn(GAME,pawn,source){
  const registry=GAME&&install(GAME);
  return registry?registry.forPawn(pawn,source):createFacade(null,pawn,source);
}

root.LK_RUNTIME_ACTOR_COMBAT=Object.freeze({VERSION,plainPoint,create:createFacade,createRegistry,install,forPawn});
if(root.LOT_KING)install(root.LOT_KING);
if(typeof module!=='undefined'&&module.exports)module.exports=root.LK_RUNTIME_ACTOR_COMBAT;
})(typeof window!=='undefined'?window:globalThis);
