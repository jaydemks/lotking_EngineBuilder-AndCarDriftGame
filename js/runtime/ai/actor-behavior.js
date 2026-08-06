/* =========================================================
   LOT KING - Reusable Actor Behaviour runtime

   Explicit `behavior.enabled` descriptors drive unpossessed Character and
   Animal Pawns in every level. `enemyAi` remains a read-compatible legacy
   alias; a null playerId alone never enables AI.
   ========================================================= */
(function(root){
'use strict';

const VERSION=2;
// A bounded advance: push for this long, then hold and shoot for this long.
const BOUND_PUSH_SECONDS=.85;
const BOUND_HOLD_SECONDS=.6;
const PROFILE_IDS=Object.freeze(['observer','aggressive','tactical','defensive','flee','civilian','reactive']);
const PROFILE_OPTIONS=Object.freeze([
  {value:'observer',label:'Observer — scout from cover, then engage'},
  {value:'aggressive',label:'Aggressive — chase and pressure'},
  {value:'tactical',label:'Tactical — bursts, flank and cover'},
  {value:'defensive',label:'Defensive — hold the guard area'},
  {value:'flee',label:'Flee — avoid every hostile'},
  {value:'civilian',label:'Civilian — calm until frightened'},
  {value:'reactive',label:'Reactive — neutral until threatened'},
]);
const REACTION_OPTIONS=Object.freeze([
  {value:'attack',label:'Counterattack'}, {value:'cover',label:'Seek cover'},
  {value:'flee',label:'Flee'}, {value:'investigate',label:'Investigate'},
  {value:'freeze',label:'Freeze'}, {value:'ignore',label:'Ignore'},
]);
const PROFILE_PRESETS=Object.freeze({
  observer:{perception:{confirmSeconds:2.2},tactics:{preferredRange:15,attackRange:30,guardRadius:34,coverBias:.94,flankBias:.32,accuracy:.56,burstMin:1,burstMax:3,burstPause:1.15},fear:{enabled:true,threshold:.72},reactions:{onDamage:'cover',onWeaponFired:'investigate',onExplosion:'cover',onCharacterDied:'cover'},actionArea:{enabled:true,shape:'circle',radius:34,width:68,depth:68,height:10,offset:{x:0,y:0,z:0},action:'observe',exitAction:'return',showInEditor:true}},
  aggressive:{tactics:{preferredRange:9,attackRange:30,guardRadius:70,coverBias:.18,flankBias:.72,burstMin:4,burstMax:9},fear:{enabled:false},reactions:{onDamage:'attack',onWeaponFired:'attack',onExplosion:'attack',onCharacterDied:'attack'}},
  tactical:{tactics:{preferredRange:13,attackRange:38,guardRadius:55,coverBias:.82,flankBias:.68,burstMin:2,burstMax:5},fear:{enabled:true,threshold:.85},reactions:{onDamage:'cover',onWeaponFired:'investigate',onExplosion:'cover',onCharacterDied:'cover'}},
  defensive:{tactics:{preferredRange:15,attackRange:34,guardRadius:24,coverBias:.9,flankBias:.2,burstMin:2,burstMax:4},fear:{enabled:true,threshold:.75},reactions:{onDamage:'cover',onWeaponFired:'cover',onExplosion:'cover',onCharacterDied:'cover'}},
  flee:{tactics:{preferredRange:28,attackRange:0,guardRadius:90,coverBias:.35,flankBias:0,burstMin:0,burstMax:0},fear:{enabled:true,threshold:.15},reactions:{onDamage:'flee',onWeaponFired:'flee',onExplosion:'flee',onCharacterDied:'flee'}},
  civilian:{tactics:{preferredRange:24,attackRange:0,guardRadius:35,coverBias:.25,flankBias:0,burstMin:0,burstMax:0},fear:{enabled:true,threshold:.25},reactions:{onDamage:'flee',onWeaponFired:'flee',onExplosion:'flee',onCharacterDied:'flee'}},
  reactive:{tactics:{preferredRange:12,attackRange:28,guardRadius:35,coverBias:.58,flankBias:.25,burstMin:2,burstMax:4},fear:{enabled:true,threshold:.65},reactions:{onDamage:'attack',onWeaponFired:'investigate',onExplosion:'cover',onCharacterDied:'cover'}},
});
const BASELINE=Object.freeze({
  enabled:true,profile:'aggressive',faction:'neutral',hostileFactions:['player'],friendlyFactions:[],squadId:'',squadIndex:0,tag:'',
  perception:{sightRange:42,hearingRange:28,memorySeconds:4.5,confirmSeconds:0,fieldOfViewDeg:130,requireLineOfSight:true},
  tactics:{attackRange:30,preferredRange:12,guardRadius:45,coverBias:.5,flankBias:.4,accuracy:.62,burstMin:2,burstMax:4,burstPause:.75},
  equipment:{useMedkits:true,medkits:1,healBelow:.38,healAmount:45,useGrenades:true,grenades:2,grenadeMinRange:9,grenadeMaxRange:30,grenadeHiddenSeconds:1.25,grenadeCooldown:8},
  animalAttack:{enabled:true,damage:16,range:2.2,cooldown:1.35,force:5,action:''},
  fear:{enabled:true,threshold:.65,decay:.1},
  reactions:{onDamage:'attack',onWeaponFired:'investigate',onExplosion:'cover',onCharacterDied:'cover'},
  actionArea:{enabled:false,shape:'circle',radius:45,width:90,depth:90,height:12,offset:{x:0,y:0,z:0},action:'attack',exitAction:'return',showInEditor:true},patrol:[],
});

function finite(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,finite(value,min)));}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function object(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function compactDefined(value){
  if(Array.isArray(value))return value.filter(item=>item!==undefined).map(compactDefined);
  if(object(value)!==value)return value;
  const out={};Object.keys(value).forEach(key=>{if(value[key]!==undefined)out[key]=compactDefined(value[key]);});return out;
}
function merge(base,patch){
  const out=Object.assign({},object(base));
  Object.keys(object(patch)).forEach(key=>{const value=patch[key];if(value===undefined)return;out[key]=object(value)===value?merge(out[key],value):clone(value);});
  return out;
}
function stringList(value,fallback){
  const values=Array.isArray(value)?value:String(value==null?'':value).split(',');
  const list=values.map(item=>String(item||'').trim()).filter(Boolean);
  return list.length?Array.from(new Set(list)):clone(fallback||[]);
}
function point(value){
  if(!value)return null;
  const node=value.body&&value.body.position?value.body:(value.owner||value);
  const p=node&&node.position||value.position||value;
  return p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.z))?{x:finite(p.x,0),y:finite(p.y,0),z:finite(p.z,0)}:null;
}
function distanceSquared(a,b){const dx=a.x-b.x,dy=(a.y||0)-(b.y||0),dz=a.z-b.z;return dx*dx+dy*dy+dz*dz;}
function setPath(target,path,value){
  const keys=String(path||'').split('.').filter(Boolean);if(!keys.length)return target;
  let cursor=target;for(let i=0;i<keys.length-1;i++){const current=cursor[keys[i]];if(!current||typeof current!=='object'||Array.isArray(current))cursor[keys[i]]={};cursor=cursor[keys[i]];}
  cursor[keys[keys.length-1]]=value;return target;
}
function normalizeProfile(value){const id=String(value||'aggressive').toLowerCase();return PROFILE_IDS.includes(id)?id:'aggressive';}
function normalizeReaction(value,fallback){const id=String(value||fallback||'ignore').toLowerCase();return REACTION_OPTIONS.some(item=>item.value===id)?id:String(fallback||'ignore');}
function normalizeAreaAction(value){const id=String(value||'attack').toLowerCase();return ['observe','investigate','cover','attack','flee','ignore'].includes(id)?id:'attack';}
function normalizeAreaExit(value){const id=String(value||'return').toLowerCase();return ['return','forget','search','hold'].includes(id)?id:'return';}

function migrateEnemyAi(source){
  const legacy=object(source),profile=normalizeProfile(legacy.profile||'aggressive');
  return compactDefined({
    enabled:legacy.enabled!==false,profile,faction:String(legacy.faction||'enemy'),
    hostileFactions:stringList(legacy.hostileFactions||legacy.targetFactions||legacy.targetFaction,['player']),
    squadId:String(legacy.squadId||legacy.squad||'enemy-squad'),squadIndex:Math.round(finite(legacy.squadIndex,0)),tag:String(legacy.tag||'enemy'),
    perception:{sightRange:legacy.sightRange,hearingRange:legacy.hearingRange,memorySeconds:legacy.memorySeconds},
    tactics:{attackRange:legacy.attackRange,preferredRange:legacy.preferredRange,guardRadius:legacy.guardRadius,flankBias:legacy.flankBias==null?legacy.flankStrength:legacy.flankBias,coverBias:legacy.coverBias,burstMin:legacy.burstMin,burstMax:legacy.burstMax},
    fear:legacy.fear,reactions:legacy.reactions,patrol:legacy.patrol,legacy:true,legacyWeaponDamage:legacy.damage,
  });
}
function graphOverrides(pawn){
  const graph=pawn&&pawn.owner&&pawn.owner.userData&&pawn.owner.userData.logicGraph;
  const patch={},legacy={};
  (graph&&Array.isArray(graph.variables)?graph.variables:[]).forEach(variable=>{
    const binding=variable&&variable.exposed&&String(variable.binding||'');
    if(binding==='faction')setPath(patch,'faction',variable.value);
    else if(binding.indexOf('behavior.')===0)setPath(patch,binding.slice(9),variable.value);
    else if(binding.indexOf('enemyAi.')===0)setPath(legacy,binding.slice(8),variable.value);
  });
  if(!Object.keys(legacy).length)return patch;
  const mapped={};
  ['enabled','profile','faction','hostileFactions','friendlyFactions','squadId','squadIndex','tag','patrol','fear','reactions'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(legacy,key))mapped[key]=clone(legacy[key]);});
  const perception={},tactics={};
  ['sightRange','hearingRange','memorySeconds','fieldOfViewDeg','requireLineOfSight'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(legacy,key))perception[key]=legacy[key];});
  ['attackRange','preferredRange','guardRadius','coverBias','flankBias','burstMin','burstMax','burstPause','accuracy'].forEach(key=>{if(Object.prototype.hasOwnProperty.call(legacy,key))tactics[key]=legacy[key];});
  if(Object.prototype.hasOwnProperty.call(legacy,'flankStrength'))tactics.flankBias=legacy.flankStrength;
  if(Object.keys(perception).length)mapped.perception=perception;if(Object.keys(tactics).length)mapped.tactics=tactics;
  if(Object.prototype.hasOwnProperty.call(legacy,'damage'))mapped.legacyWeaponDamage=legacy.damage;
  return merge(mapped,patch);
}
function descriptorSource(value){
  if(value&&value.config){
    const cfg=value.config,legacy=cfg.enemyAi?migrateEnemyAi(cfg.enemyAi):{};
    return merge(merge(legacy,object(cfg.behavior)),graphOverrides(value));
  }
  if(value&&Object.prototype.hasOwnProperty.call(value,'behavior'))return merge(value.enemyAi?migrateEnemyAi(value.enemyAi):{},object(value.behavior));
  if(value&&Object.prototype.hasOwnProperty.call(value,'enemyAi'))return migrateEnemyAi(value.enemyAi);
  return object(value);
}
function hasDescriptor(pawn){
  const cfg=pawn&&pawn.config;
  return !!(cfg&&(Object.prototype.hasOwnProperty.call(cfg,'behavior')||Object.prototype.hasOwnProperty.call(cfg,'enemyAi')));
}
function normalizeBehavior(value){
  const raw=descriptorSource(value),profile=normalizeProfile(raw.profile);
  const source=merge(merge(BASELINE,PROFILE_PRESETS[profile]),raw),perception=object(source.perception),tactics=object(source.tactics),equipment=object(source.equipment),animalAttack=object(source.animalAttack),fear=object(source.fear),reactions=object(source.reactions),area=object(source.actionArea),offset=object(area.offset);
  return {
    enabled:source.enabled!==false,profile,faction:String(source.faction||'neutral'),
    hostileFactions:stringList(source.hostileFactions,['player']),friendlyFactions:stringList(source.friendlyFactions,[]),
    squadId:String(source.squadId||''),squadIndex:Math.round(finite(source.squadIndex,0)),tag:String(source.tag||''),
    perception:{sightRange:clamp(perception.sightRange,1,250),hearingRange:clamp(perception.hearingRange,0,250),memorySeconds:clamp(perception.memorySeconds,0,60),confirmSeconds:clamp(perception.confirmSeconds,0,30),fieldOfViewDeg:clamp(perception.fieldOfViewDeg,10,360),requireLineOfSight:perception.requireLineOfSight!==false},
    tactics:{attackRange:clamp(tactics.attackRange,0,150),preferredRange:clamp(tactics.preferredRange,1,100),guardRadius:clamp(tactics.guardRadius,0,500),coverBias:clamp(tactics.coverBias,0,1),flankBias:clamp(tactics.flankBias,0,1),accuracy:clamp(tactics.accuracy,.05,1),burstMin:Math.round(clamp(tactics.burstMin,0,30)),burstMax:Math.round(clamp(tactics.burstMax,0,50)),burstPause:clamp(tactics.burstPause,.05,8)},
    equipment:{useMedkits:equipment.useMedkits!==false,medkits:Math.round(clamp(equipment.medkits,0,20)),healBelow:clamp(equipment.healBelow,.05,.95),healAmount:clamp(equipment.healAmount,1,1000),useGrenades:equipment.useGrenades!==false,grenades:Math.round(clamp(equipment.grenades,0,20)),grenadeMinRange:clamp(equipment.grenadeMinRange,1,100),grenadeMaxRange:clamp(equipment.grenadeMaxRange,2,200),grenadeHiddenSeconds:clamp(equipment.grenadeHiddenSeconds,.25,20),grenadeCooldown:clamp(equipment.grenadeCooldown,.5,60)},
    animalAttack:{enabled:animalAttack.enabled!==false,damage:clamp(animalAttack.damage,0,1000),range:clamp(animalAttack.range,.1,12),cooldown:clamp(animalAttack.cooldown,.1,12),force:clamp(animalAttack.force,0,100),action:String(animalAttack.action||'')},
    fear:{enabled:fear.enabled!==false,threshold:clamp(fear.threshold,0,1),decay:clamp(fear.decay,0,2)},
    reactions:{onDamage:normalizeReaction(reactions.onDamage,PROFILE_PRESETS[profile].reactions.onDamage),onWeaponFired:normalizeReaction(reactions.onWeaponFired,PROFILE_PRESETS[profile].reactions.onWeaponFired),onExplosion:normalizeReaction(reactions.onExplosion,PROFILE_PRESETS[profile].reactions.onExplosion),onCharacterDied:normalizeReaction(reactions.onCharacterDied,PROFILE_PRESETS[profile].reactions.onCharacterDied)},
    actionArea:{enabled:area.enabled===true,shape:String(area.shape||'circle').toLowerCase()==='box'?'box':'circle',radius:clamp(area.radius,1,500),width:clamp(area.width,1,1000),depth:clamp(area.depth,1,1000),height:clamp(area.height,.5,250),offset:{x:finite(offset.x,0),y:finite(offset.y,0),z:finite(offset.z,0)},action:normalizeAreaAction(area.action),exitAction:normalizeAreaExit(area.exitAction),showInEditor:area.showInEditor!==false},
    patrol:(Array.isArray(source.patrol)?source.patrol:[]).map(point).filter(Boolean),legacy:source.legacy===true,legacyWeaponDamage:Number.isFinite(Number(source.legacyWeaponDamage))?Number(source.legacyWeaponDamage):null,
  };
}

function factionOf(pawn){
  if(!pawn)return 'neutral';
  const cfg=pawn.config||{},behavior=object(cfg.behavior),vitals=pawn.vitals&&typeof pawn.vitals.config==='function'?pawn.vitals.config():object(cfg.vitals);
  return String(behavior.faction||cfg.faction||vitals.team||'neutral');
}
function isDead(pawn){return !!(pawn&&pawn.vitals&&pawn.vitals.state&&pawn.vitals.state.dead||pawn&&pawn.state&&pawn.state.dead);}
function isAnimal(pawn){return !!(pawn&&(pawn.pawnType==='animal'||pawn.config&&pawn.config.species));}
function hash(value){let total=0;for(let i=0;i<String(value||'').length;i++)total=(total*31+String(value).charCodeAt(i))>>>0;return(total%1000)/1000;}

function create(GAME){
  const records=new Map(),stimuli=[],squadIntel=new Map(),coverRuntime=root.LK_RUNTIME_ACTOR_COVER_PLANNER;
  const coverPlanner=coverRuntime&&typeof coverRuntime.create==='function'?coverRuntime.create(GAME):null;
  let clock=0,nextStimulusId=1,disposed=false,frameHook=null,api=null;

  function pawns(){return GAME&&GAME.pawns&&typeof GAME.pawns.list==='function'?GAME.pawns.list():[];}
  function pawnById(id){
    if(!id)return null;
    if(GAME&&GAME.pawns&&typeof GAME.pawns.get==='function'){const found=GAME.pawns.get(id);if(found)return found;}
    return pawns().find(pawn=>pawn&&String(pawn.id)===String(id))||null;
  }
  function releaseCoverPlan(state,clearRejected){
    if(coverPlanner&&state&&state.coverPlan)coverPlanner.clear(state.coverPlan,clearRejected===true);
  }
  function releaseAnimalChase(pawn,state,reason){
    if(!state)return false;
    const released=!!(pawn&&typeof pawn.stopChase==='function'&&pawn.stopChase(reason||'behavior-release',{ownerToken:state}));
    state.animalChaseTargetId=null;
    return released;
  }
  function releaseState(state,clearRejected,reason){
    if(!state)return false;
    releaseAnimalChase(state.pawn,state,reason);
    releaseCoverPlan(state,clearRejected);
    return true;
  }
  function stateFor(pawn){
    let state=records.get(pawn.id);
    if(!state||state.pawn!==pawn){
      if(state)releaseState(state,true,'pawn-replaced');
      const at=point(pawn)||{x:0,y:0,z:0};
      state={
        pawn,origin:at,targetId:null,memory:0,patrolIndex:0,reaction:'ignore',reactionTimer:0,threat:null,fear:0,lastStimulusId:0,
        burstLeft:0,burstPause:0,aimSequence:0,animalActionCooldown:0,animalChaseTargetId:null,observedTargetId:null,observeTime:0,areaTargetId:null,
        targetVisible:false,hiddenTime:0,lastSeenPosition:null,grenadeCooldown:0,grenadesRemaining:null,medkitsRemaining:null,equipmentHydrated:false,
        // `pushHold` starts latched so the first toggle below begins with a PUSH:
        // entering a bound on the hold phase would stall an actor that has just
        // decided to close.
        pushTimer:0,pushHold:true,
        coverPlan:coverPlanner?coverPlanner.createState():null,
      };
      records.set(pawn.id,state);
    }
    return state;
  }
  function playerOwned(pawn){
    if(!pawn)return false;
    if(pawn.possessed===true||pawn.playerId!=null)return true;
    const cfg=object(pawn.config);
    // Authored player Pawns stay player-owned while temporarily unpossessed
    // (for example while driving). A stray behavior block can never promote
    // them into an AI actor during that transition.
    return cfg.possessed===true||cfg.playerId!=null;
  }
  function areaContains(candidate,cfg,state){
    const area=cfg.actionArea;if(!area.enabled)return true;if(area.action==='ignore')return false;
    const at=point(candidate),anchor=state&&state.origin;if(!at||!anchor)return false;
    const center={x:anchor.x+area.offset.x,y:anchor.y+area.offset.y,z:anchor.z+area.offset.z};
    if(Math.abs(at.y-center.y)>area.height*.5)return false;
    const dx=at.x-center.x,dz=at.z-center.z;
    return area.shape==='box'?Math.abs(dx)<=area.width*.5&&Math.abs(dz)<=area.depth*.5:dx*dx+dz*dz<=area.radius*area.radius;
  }
  function emitStimulus(source){
    const raw=object(source),at=point(raw.position||raw.at||raw.origin||pawnById(raw.sourcePawnId));
    if(!at)return null;
    const item={id:nextStimulusId++,type:String(raw.type||'event'),position:at,radius:Math.max(0,finite(raw.radius,20)),intensity:clamp(raw.intensity,0,2),sourcePawnId:raw.sourcePawnId||null,targetPawnId:raw.targetPawnId||null,faction:String(raw.faction||factionOf(pawnById(raw.sourcePawnId))),expires:clock+Math.max(.1,finite(raw.duration,3))};
    stimuli.push(item);return item;
  }
  function objectiveDeath(pawn){
    const director=GAME&&GAME.systems&&GAME.systems.objectives;
    if(!(director&&typeof director.notify==='function')||!pawn)return;
    if(hasDescriptor(pawn)){const cfg=normalizeBehavior(pawn);if(cfg.tag)director.notify('eliminate',{tag:cfg.tag});}
    if(pawn.playerId===1)director.notify('avoid',{tag:'player-down'});
  }
  function onPawnEvent(event){
    const detail=event&&event.detail||{},type=String(detail.type||''),sourcePawn=pawnById(detail.pawnId);
    if(type==='OnWeaponFired')emitStimulus({type:'weapon-fire',origin:detail.origin||sourcePawn,radius:48,intensity:.4,sourcePawnId:detail.pawnId,faction:factionOf(sourcePawn),duration:2.5});
    else if(type==='OnExplosion')emitStimulus({type:'explosion',at:detail.at||detail.origin,radius:Math.max(18,finite(detail.radius,8)*3),intensity:1,sourcePawnId:detail.pawnId,faction:factionOf(sourcePawn),duration:5});
    else if(type==='OnCharacterDamaged')emitStimulus({type:'damage',position:pawnById(detail.pawnId),radius:18,intensity:.8,sourcePawnId:detail.instigatorPawnId||detail.sourcePawnId||detail.attackerPawnId||null,targetPawnId:detail.pawnId,duration:5});
    else if(type==='OnCharacterDied'){const dead=pawnById(detail.pawnId);emitStimulus({type:'death',position:dead,radius:28,intensity:1,sourcePawnId:detail.instigatorPawnId||detail.sourcePawnId||detail.attackerPawnId||null,targetPawnId:detail.pawnId,duration:7});objectiveDeath(dead);}
  }
  if(root.addEventListener)root.addEventListener('lk-pawn-event',onPawnEvent);

  function hostile(cfg,candidate){return !!(candidate&&cfg.hostileFactions.some(id=>id==='*'||id===factionOf(candidate)));}
  function validTarget(actor,candidate,cfg,state){return !!(candidate&&candidate!==actor&&candidate.enabled!==false&&candidate.hidden!==true&&!isDead(candidate)&&hostile(cfg,candidate)&&point(candidate)&&areaContains(candidate,cfg,state));}
  function segmentHitsBox(from,to,box){
    let low=0,high=1;
    const axes=[['x','hx'],['y','hy'],['z','hz']];
    for(let i=0;i<axes.length;i++){
      const axis=axes[i][0],halfKey=axes[i][1];if(box[axis]==null||box[halfKey]==null)continue;
      const start=finite(from[axis],0),delta=finite(to[axis],0)-start,min=finite(box[axis],0)-Math.abs(finite(box[halfKey],0)),max=finite(box[axis],0)+Math.abs(finite(box[halfKey],0));
      if(Math.abs(delta)<1e-7){if(start<min||start>max)return false;continue;}
      let a=(min-start)/delta,b=(max-start)/delta;if(a>b){const swap=a;a=b;b=swap;}low=Math.max(low,a);high=Math.min(high,b);if(low>high)return false;
    }
    return high>.01&&low<.99;
  }
  function segmentHitsCircle(from,to,circle){
    const radius=Math.max(0,finite(circle&&circle.r,finite(circle&&circle.radius,0)));if(radius<=0)return false;
    const dx=finite(to.x,0)-finite(from.x,0),dz=finite(to.z,0)-finite(from.z,0),ox=finite(from.x,0)-finite(circle.x,0),oz=finite(from.z,0)-finite(circle.z,0),a=dx*dx+dz*dz;
    let low=0,high=1;
    if(a<1e-9){if(ox*ox+oz*oz>radius*radius)return false;}
    else {const b=2*(ox*dx+oz*dz),c=ox*ox+oz*oz-radius*radius,discriminant=b*b-4*a*c;if(discriminant<0)return false;const root=Math.sqrt(discriminant),first=(-b-root)/(2*a),second=(-b+root)/(2*a);low=Math.max(low,Math.min(first,second));high=Math.min(high,Math.max(first,second));if(low>high)return false;}
    const halfHeight=Math.max(0,finite(circle.hy,radius)),centerY=circle.y==null?halfHeight:finite(circle.y,halfHeight),dy=finite(to.y,0)-finite(from.y,0),minimum=centerY-halfHeight,maximum=centerY+halfHeight;
    if(Math.abs(dy)<1e-9){const y=finite(from.y,0);if(y<minimum||y>maximum)return false;}
    else {let entry=(minimum-finite(from.y,0))/dy,exit=(maximum-finite(from.y,0))/dy;if(entry>exit){const swap=entry;entry=exit;exit=swap;}low=Math.max(low,entry);high=Math.min(high,exit);if(low>high)return false;}
    return high>.01&&low<.99;
  }
  function belongsTo(node,owner){for(let current=node;current;current=current.parent||null)if(current===owner)return true;return false;}
  function colliderBelongsToPawn(collider,pawn){
    const owner=pawn&&pawn.owner;if(!collider||!owner)return false;
    return collider===owner||belongsTo(collider.owner,owner)||belongsTo(collider.logicElementOwner,owner);
  }
  function lineOfSight(actor,candidate,from,to){
    const colliders=GAME&&GAME.world&&GAME.world.colliders,boxes=colliders&&colliders.box,circles=colliders&&colliders.circle;
    if(Array.isArray(boxes)){
      for(let i=0;i<boxes.length;i++){const box=boxes[i];if(!box||box.enabled===false||box.compoundRoot||box.horizontalSurface||colliderBelongsToPawn(box,actor)||colliderBelongsToPawn(box,candidate))continue;if(segmentHitsBox(from,to,box))return false;}
    }
    if(Array.isArray(circles)){
      for(let i=0;i<circles.length;i++){const circle=circles[i];if(!circle||circle.enabled===false||colliderBelongsToPawn(circle,actor)||colliderBelongsToPawn(circle,candidate))continue;if(segmentHitsCircle(from,to,circle))return false;}
    }
    const THREE=root.THREE,registry=GAME&&GAME.world&&GAME.world.registry;
    if(THREE&&Array.isArray(registry)&&registry.length&&THREE.Raycaster&&THREE.Vector3){
      const start=new THREE.Vector3(from.x,from.y,from.z),end=new THREE.Vector3(to.x,to.y,to.z),direction=end.clone().sub(start),range=direction.length();
      if(range>.001){direction.normalize();const ray=new THREE.Raycaster(start,direction,.02,range-.02),hits=ray.intersectObjects(registry.filter(node=>node&&node.visible!==false&&!belongsTo(node,actor.owner)&&!(node.userData&&node.userData.editorOnly)),true);if(hits.length&&!belongsTo(hits[0].object,candidate.owner))return false;}
    }
    return true;
  }
  function perceivable(actor,candidate,cfg,origin,state){
    if(!validTarget(actor,candidate,cfg,state))return false;
    const at=point(candidate),dx=at.x-origin.x,dz=at.z-origin.z,distance=Math.sqrt(dx*dx+dz*dz);if(distance>cfg.perception.sightRange)return false;
    if(cfg.perception.fieldOfViewDeg<359&&distance>.001){const yaw=actor.owner&&actor.owner.rotation?finite(actor.owner.rotation.y,0):0,forwardX=Math.sin(yaw),forwardZ=Math.cos(yaw),dot=(forwardX*dx+forwardZ*dz)/distance,limit=Math.cos(cfg.perception.fieldOfViewDeg*Math.PI/360);if(dot<limit)return false;}
    if(cfg.perception.requireLineOfSight){const height=actor.config&&actor.config.movement&&finite(actor.config.movement.height,1.8)||1.8,targetHeight=candidate.config&&candidate.config.movement&&finite(candidate.config.movement.height,1.8)||1.8;const eye={x:origin.x,y:origin.y+height*.78,z:origin.z},focus={x:at.x,y:at.y+targetHeight*.62,z:at.z};if(!lineOfSight(actor,candidate,eye,focus))return false;}
    return true;
  }
  function nearestTarget(actor,cfg,origin,state){
    let best=null,bestD=cfg.perception.sightRange*cfg.perception.sightRange;
    pawns().forEach(candidate=>{if(!perceivable(actor,candidate,cfg,origin,state))return;const d=distanceSquared(origin,point(candidate));if(d<=bestD){best=candidate;bestD=d;}});
    return best;
  }
  function reactionFor(cfg,type){return type==='damage'?cfg.reactions.onDamage:(type==='weapon-fire'?cfg.reactions.onWeaponFired:(type==='explosion'?cfg.reactions.onExplosion:cfg.reactions.onCharacterDied));}
  function animalStimulus(pawn,state,stimulus){
    if(!isAnimal(pawn)||state.animalActionCooldown>0)return;
    const species=String(pawn.config&&pawn.config.species||'generic');
    if(species==='dog'&&typeof pawn.barkAlert==='function'){pawn.barkAlert();state.animalActionCooldown=2.5;}
    else if(species==='horse'&&typeof pawn.playAction==='function'&&(stimulus.type==='explosion'||stimulus.type==='damage')){pawn.playAction('rear',{duration:.8});state.animalActionCooldown=1;}
  }
  function consumeStimuli(pawn,cfg,state,origin){
    stimuli.forEach(stimulus=>{
      if(stimulus.id<=state.lastStimulusId)return;
      state.lastStimulusId=stimulus.id;
      const directed=String(stimulus.targetPawnId||'')===String(pawn.id),range=Math.max(stimulus.radius,cfg.perception.hearingRange);
      if(!directed&&distanceSquared(origin,stimulus.position)>range*range)return;
      if(String(stimulus.sourcePawnId||'')===String(pawn.id))return;
      const source=pawnById(stimulus.sourcePawnId),sourceHostile=source&&hostile(cfg,source);
      if(stimulus.type==='weapon-fire'&&!sourceHostile&&cfg.profile!=='civilian'&&cfg.profile!=='flee')return;
      const action=reactionFor(cfg,stimulus.type);if(action==='ignore')return;
      state.reaction=action;state.reactionTimer=Math.max(state.reactionTimer,cfg.perception.memorySeconds||2);state.threat=clone(stimulus.position);
      if(cfg.fear.enabled)state.fear=clamp(state.fear+stimulus.intensity*(directed?1:.7),0,1);
      if(sourceHostile){state.targetId=source.id;state.memory=cfg.perception.memorySeconds;}
      animalStimulus(pawn,state,stimulus);
    });
  }
  function stop(pawn){if(pawn&&typeof pawn.setMoveInput==='function')pawn.setMoveInput({x:0,z:0,sprint:false,aim:false,fire:false,reload:false});}
  function face(pawn,dx,dz){if(pawn&&pawn.owner&&pawn.owner.rotation)pawn.owner.rotation.y=Math.atan2(dx,dz);}
  function moveHeading(pawn,dx,dz,speed,sprint,strafe){face(pawn,dx,dz);if(pawn&&typeof pawn.setMoveInput==='function')pawn.setMoveInput({x:finite(strafe,0),z:clamp(speed,-1,1),sprint:sprint===true,aim:false,fire:false,reload:false});}
  function moveToward(pawn,from,to,speed,sprint,strafe){moveHeading(pawn,to.x-from.x,to.z-from.z,speed,sprint,strafe);}
  function moveAway(pawn,from,threat){moveHeading(pawn,from.x-threat.x,from.z-threat.z,1,true,0);}
  function combatFor(pawn,cfg){
    if(playerOwned(pawn))return null;
    if(isAnimal(pawn)&&!(pawn.firstPerson||pawn.config&&pawn.config.combat&&pawn.config.combat.enabled===true))return null;
    const runtime=root.LK_RUNTIME_ACTOR_COMBAT;if(!(runtime&&typeof runtime.forPawn==='function'))return null;
    const combat=object(pawn.config&&pawn.config.combat),autoAttach=!!(pawn.firstPerson||combat.enabled===true||cfg.legacy);
    const facade=runtime.forPawn(GAME,pawn,{autoAttach,weapon:combat.weapon||pawn.config&&pawn.config.firstPerson&&pawn.config.firstPerson.weapon});
    if(cfg.legacy&&cfg.legacyWeaponDamage!=null&&facade&&facade.state.legacyDamage!==cfg.legacyWeaponDamage){facade.applyBinding('combat.weapon.damage',cfg.legacyWeaponDamage);facade.state.legacyDamage=cfg.legacyWeaponDamage;}
    return facade;
  }
  function hydrateEquipment(pawn,cfg,state){
    if(state.equipmentHydrated)return pawn&&pawn.inventory||null;
    const combat=combatFor(pawn,cfg),inventory=pawn&&pawn.inventory;
    if(!(combat&&inventory))return null;
    if(cfg.equipment.useMedkits&&typeof inventory.store==='function'){
      const pack=typeof inventory.pack==='function'?inventory.pack():[],owned=pack.filter(item=>item&&item.kind==='health').length;
      for(let index=owned;index<cfg.equipment.medkits;index++)inventory.store({kind:'health',name:'AI Medkit',amount:cfg.equipment.healAmount});
    }
    state.medkitsRemaining=cfg.equipment.useMedkits?cfg.equipment.medkits:0;
    state.grenadesRemaining=cfg.equipment.useGrenades?cfg.equipment.grenades:0;
    state.equipmentHydrated=true;
    return inventory;
  }
  function tryMedkit(pawn,cfg,state){
    if(!cfg.equipment.useMedkits||isAnimal(pawn))return false;
    const vitals=pawn&&pawn.vitals,health=vitals&&vitals.state&&finite(vitals.state.health,0),vitalsCfg=vitals&&typeof vitals.config==='function'?vitals.config():null;
    if(!vitalsCfg||health/Math.max(1,finite(vitalsCfg.maxHealth,100))>cfg.equipment.healBelow)return false;
    const inventory=hydrateEquipment(pawn,cfg,state),pack=inventory&&typeof inventory.pack==='function'?inventory.pack():[];
    const at=pack.findIndex(item=>item&&item.kind==='health');
    if(at>=0&&inventory.useFromPack(at)){state.medkitsRemaining=Math.max(0,state.medkitsRemaining-1);return true;}
    // Legacy AI instances may still carry a pre-backpack `slots` inventory.
    // Keep their authored supply functional until the scene is resaved with
    // the new template, without ever replenishing it during the session.
    if(state.medkitsRemaining>0&&vitals&&typeof vitals.heal==='function'&&vitals.heal(cfg.equipment.healAmount,'health')>0){state.medkitsRemaining--;return true;}
    return false;
  }
  function tryGrenade(pawn,targetPoint,cfg,state,distance,visible){
    const equipment=cfg.equipment;
    if(visible||!equipment.useGrenades||state.hiddenTime<equipment.grenadeHiddenSeconds||state.grenadeCooldown>0||distance<equipment.grenadeMinRange||distance>equipment.grenadeMaxRange)return false;
    const inventory=hydrateEquipment(pawn,cfg,state),combat=combatFor(pawn,cfg);
    if(!(inventory&&combat&&state.grenadesRemaining>0&&typeof inventory.slots==='function'&&typeof inventory.equip==='function'))return false;
    const before=typeof inventory.current==='function'?inventory.current():null,slots=inventory.slots();
    const grenadeAt=slots.findIndex(entry=>entry&&entry.weapon&&entry.weapon.kind==='thrown'&&String(entry.weapon.preset||'').indexOf('grenade')>=0);
    if(grenadeAt<0||!inventory.equip(grenadeAt))return false;
    combat.aimAt(targetPoint,{targetHeight:.15});
    const payload=combat.fire();
    if(before){const restored=inventory.slots().findIndex(entry=>entry&&entry.weapon&&before.weapon&&(entry.weapon.id===before.weapon.id||entry.weapon.name===before.weapon.name));if(restored>=0)inventory.equip(restored);}
    if(!payload)return false;
    state.grenadesRemaining--;state.grenadeCooldown=equipment.grenadeCooldown;state.hiddenTime=0;
    return true;
  }
  function ownsAnimalChase(pawn,target,state){
    const targetId=String(target&&target.id||'');
    if(state.animalChaseTargetId!==targetId)return false;
    // Real Animal Pawns expose the token and live target. Small/custom Pawn
    // adapters may only implement the verb, so their Behavior state remains the
    // backwards-compatible source of truth.
    if(pawn&&('chaseOwnerToken' in pawn||'chaseTarget' in pawn))return pawn.chaseOwnerToken===state&&pawn.chaseTarget===target;
    return true;
  }
  function animalAttackAction(pawn,species,target,state,attack){
    if(species==='cat'&&typeof pawn.pounce==='function')return pawn.pounce({speed:6,duration:Math.min(.6,attack.cooldown*.45)})===true;
    if(species==='dog'){
      let chasing=ownsAnimalChase(pawn,target,state);
      if(!chasing&&typeof pawn.chase==='function'){
        chasing=pawn.chase(target,{stopDistance:Math.max(.45,attack.range*.62),speedMultiplier:1.05,ownerToken:state,source:'actor-behavior'})===true;
        if(chasing)state.animalChaseTargetId=String(target&&target.id||'');
      }
      return typeof pawn.playAction==='function'&&pawn.playAction(attack.action||'pounce',{duration:Math.min(.65,attack.cooldown*.5)})===true;
    }
    if(typeof pawn.playAction==='function')return pawn.playAction(attack.action||(species==='horse'?'rear':'attack'),{duration:Math.min(.8,attack.cooldown*.6)})===true;
    return false;
  }
  function applyAnimalDamage(pawn,target,species,attack){
    const contract=root.LK_RUNTIME_DAMAGE_CONTRACT,holder=target&&(target.owner||target.body||target),from=point(pawn),to=point(target);
    if(!(contract&&typeof contract.apply==='function'&&holder&&from&&to))return null;
    const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,length=Math.max(.0001,Math.sqrt(dx*dx+dy*dy+dz*dz));
    return contract.apply(holder,attack.damage,{
      source:'animal-melee',instigatorPawnId:pawn.id,origin:from,point:to,direction:{x:dx/length,y:dy/length,z:dz/length},
      force:attack.force,weapon:{kind:'natural',species,action:attack.action||null},
    });
  }
  function tryAnimalAttack(pawn,target,distance,state,cfg){
    if(!isAnimal(pawn)||state.animalActionCooldown>0||!cfg.animalAttack.enabled)return false;
    const species=String(pawn.config&&pawn.config.species||'generic'),attack=cfg.animalAttack;
    if(species==='dog'&&distance>attack.range){
      if(ownsAnimalChase(pawn,target,state))return false;
      if(typeof pawn.chase!=='function')return false;
      const chasing=pawn.chase(target,{stopDistance:Math.max(.45,attack.range*.62),speedMultiplier:1.05,ownerToken:state,source:'actor-behavior'})===true;
      if(chasing)state.animalChaseTargetId=String(target&&target.id||'');
      return false;
    }
    if(distance>attack.range)return false;
    const from=point(pawn),to=point(target);if(!from||!to)return false;
    const actorHeight=pawn.config&&pawn.config.movement&&finite(pawn.config.movement.height,1)||1,targetHeight=target.config&&target.config.movement&&finite(target.config.movement.height,1)||1;
    if(!lineOfSight(pawn,target,{x:from.x,y:from.y+actorHeight*.45,z:from.z},{x:to.x,y:to.y+targetHeight*.45,z:to.z}))return false;
    if(!animalAttackAction(pawn,species,target,state,attack))return false;
    applyAnimalDamage(pawn,target,species,attack);
    state.animalActionCooldown=attack.cooldown;
    return true;
  }
  function tryFire(pawn,target,cfg,state,distance){
    if(playerOwned(pawn))return false;
    if(isAnimal(pawn)&&tryAnimalAttack(pawn,target,distance,state,cfg))return true;
    if(distance>cfg.tactics.attackRange||cfg.tactics.attackRange<=0)return false;
    const combat=combatFor(pawn,cfg);if(!(combat&&combat.available()))return false;
    const aim=combat.aimAt(target);combat.setAimDownSights(true);
    if(aim&&cfg.tactics.accuracy<.999){const error=(1-cfg.tactics.accuracy)*.12,seed=pawn.id+':'+state.aimSequence++;combat.setViewAngles(aim.yaw+(hash(seed+':yaw')-.5)*2*error,aim.pitch+(hash(seed+':pitch')-.5)*2*error);}
    const ammo=combat.ammo();if(ammo.reloading)return false;
    if(ammo.armed!==false&&ammo.ammo<=0&&!ammo.infinite){
      if(ammo.reserve>0)return combat.reload();
      if(typeof combat.equipNextUsable==='function'&&combat.equipNextUsable()){state.burstLeft=0;state.burstPause=0;return false;}
      return false;
    }
    if(state.burstPause>0)return false;
    if(state.burstLeft<=0)state.burstLeft=Math.max(1,cfg.tactics.burstMin+Math.floor(hash(pawn.id+':'+Math.floor(clock))*Math.max(1,cfg.tactics.burstMax-cfg.tactics.burstMin+1)));
    const payload=combat.fire();
    if(payload){state.burstLeft--;if(state.burstLeft<=0)state.burstPause=cfg.tactics.burstPause;return true;}
    return false;
  }
  function patrol(pawn,cfg,state,origin){
    if(!cfg.patrol.length){stop(pawn);return 'idle';}
    const target=cfg.patrol[state.patrolIndex%cfg.patrol.length];if(distanceSquared(origin,target)<1.4){state.patrolIndex=(state.patrolIndex+1)%cfg.patrol.length;stop(pawn);return 'patrol-wait';}
    moveToward(pawn,origin,target,.55,false,0);return 'patrol';
  }
  function guardReturn(pawn,cfg,state,origin){
    const radius=cfg.tactics.guardRadius;if(radius<=0||distanceSquared(origin,state.origin)<=radius*radius)return false;
    moveToward(pawn,origin,state.origin,.8,false,0);return true;
  }
  function seekCover(pawn,cfg,state,origin,threat,dt){
    if(!(coverPlanner&&state.coverPlan))return null;
    return coverPlanner.seek({pawn,cfg,state:state.coverPlan,origin,threat,dt,now:clock,motion:{moveToward,face,stop}});
  }
  function engage(pawn,target,cfg,state,origin,dt,visible){
    const at=visible?point(target):(state.lastSeenPosition||point(target));if(!at){releaseAnimalChase(pawn,state,'target-missing');return patrol(pawn,cfg,state,origin);}
    const dx=at.x-origin.x,dz=at.z-origin.z,distance=Math.max(.001,Math.sqrt(dx*dx+dz*dz)),side=(cfg.squadIndex%2===0?1:-1);
    const combat=combatFor(pawn,cfg);if(combat)combat.aimAt(at,{targetHeight:visible?1.1:.15});
    if(tryGrenade(pawn,at,cfg,state,distance,visible))return 'grenade';
    if((cfg.profile==='observer'||cfg.profile==='tactical'||cfg.profile==='defensive'||state.reaction==='cover')&&cfg.tactics.coverBias>.5){const coverState=seekCover(pawn,cfg,state,origin,at,dt);if(coverState){releaseAnimalChase(pawn,state,'seek-cover');return coverState;}}
    // Closing is for getting the target INTO WEAPON REACH, not for reaching the
    // preferred range: an actor that advanced whenever it was beyond its
    // preferred distance ran in a straight line at a target it could already
    // shoot, which is what made a squad with no cover nearby charge blindly.
    const tactics=cfg.tactics;
    const retreat=distance<tactics.preferredRange*.58;
    const reach=tactics.attackRange>0?tactics.attackRange*.92:tactics.preferredRange*1.12;
    const outOfReach=!retreat&&distance>reach;
    let forward=0,sprint=false;
    if(retreat)forward=-.72;
    else if(outOfReach){
      // Bounded advance: a short push, then a stop to shoot from. Continuous
      // forward motion is what reads as a suicide run.
      state.pushTimer-=dt;
      if(state.pushTimer<=0){state.pushHold=!state.pushHold;state.pushTimer=state.pushHold?BOUND_HOLD_SECONDS:BOUND_PUSH_SECONDS;}
      forward=state.pushHold?0:.88;
      // Sprinting is for crossing ground the target cannot see, never for
      // running into its crosshair.
      sprint=!state.pushHold&&!visible&&distance>reach*1.6;
    } else { state.pushHold=true; state.pushTimer=0; }   // re-enter on a push
    // Always keep moving laterally while trading fire; a stationary silhouette
    // at mid range is the other half of "stupid".
    const strafe=forward===0?side*(.22+.45*tactics.flankBias):side*.18*tactics.flankBias;
    moveHeading(pawn,dx,dz,forward,sprint,strafe);
    if(visible)tryFire(pawn,target,cfg,state,distance);
    return retreat?'retreat':(outOfReach?(state.pushHold?'advance-hold':'advance'):'engage');
  }
  function observe(pawn,target,cfg,state,origin,dt){
    const at=point(target);if(!at)return 'idle';
    state.observeTime+=dt;
    if(cfg.tactics.coverBias>.5){const coverState=seekCover(pawn,cfg,state,origin,at,dt);if(coverState){releaseAnimalChase(pawn,state,'observe-cover');return 'observe-'+coverState;}}
    releaseAnimalChase(pawn,state,'observe');face(pawn,at.x-origin.x,at.z-origin.z);stop(pawn);return 'observe';
  }
  function stepActor(pawn,dt,forcedTarget){
    if(!pawn||pawn.disposed===true||!hasDescriptor(pawn))return null;
    const cfg=normalizeBehavior(pawn),state=stateFor(pawn),origin=point(pawn),h=clamp(dt,.001,.1);
    if(!origin)return null;
    state.burstPause=Math.max(0,state.burstPause-h);state.grenadeCooldown=Math.max(0,state.grenadeCooldown-h);state.animalActionCooldown=Math.max(0,state.animalActionCooldown-h);if(coverPlanner&&state.coverPlan)coverPlanner.tick(state.coverPlan,h);state.reactionTimer=Math.max(0,state.reactionTimer-h);state.fear=Math.max(0,state.fear-cfg.fear.decay*h);
    if(state.reactionTimer<=0){state.reaction='ignore';state.threat=null;}
    if(playerOwned(pawn)){
      releaseAnimalChase(pawn,state,'player-owned');
      if(typeof pawn.clearControl==='function')pawn.clearControl();else pawn.control=null;
      if(coverPlanner&&state.coverPlan)coverPlanner.clear(state.coverPlan,false);
      state.targetId=null;state.areaTargetId=null;state.observedTargetId=null;state.observeTime=0;
      return 'suspended';
    }
    if(!cfg.enabled||pawn.enabled===false||isDead(pawn)){releaseAnimalChase(pawn,state,'behavior-suspended');stop(pawn);if(coverPlanner&&state.coverPlan)coverPlanner.clear(state.coverPlan,false);const combat=combatFor(pawn,cfg);if(combat)combat.setAimDownSights(false);return 'suspended';}
    hydrateEquipment(pawn,cfg,state);tryMedkit(pawn,cfg,state);
    consumeStimuli(pawn,cfg,state,origin);

    let target=null,perceived=false;
    if(validTarget(pawn,forcedTarget,cfg,state)){target=forcedTarget;perceived=true;}
    const tracked=state.targetId&&pawnById(state.targetId);
    if(!target&&tracked&&perceivable(pawn,tracked,cfg,origin,state)){target=tracked;perceived=true;}
    const passive=cfg.profile==='civilian'||cfg.profile==='reactive';
    if(!target&&!passive){target=nearestTarget(pawn,cfg,origin,state);perceived=!!target;}
    if(!target&&state.reaction!=='ignore'){target=nearestTarget(pawn,cfg,origin,state);perceived=!!target;}
    if(target&&perceived){state.targetId=target.id;state.memory=cfg.perception.memorySeconds;state.lastSeenPosition=point(target);state.hiddenTime=0;if(cfg.squadId)squadIntel.set(cfg.squadId,{targetId:target.id,position:point(target),expires:clock+cfg.perception.memorySeconds});}
    else if(cfg.squadId){const intel=squadIntel.get(cfg.squadId);if(intel&&intel.expires>clock){const shared=pawnById(intel.targetId);if(validTarget(pawn,shared,cfg,state)){target=shared;state.targetId=shared.id;state.memory=Math.max(state.memory,intel.expires-clock);}}}
    if(!target&&state.memory>0&&state.targetId){state.memory=Math.max(0,state.memory-h);const remembered=pawnById(state.targetId);if(validTarget(pawn,remembered,cfg,state))target=remembered;}
    else if(target&&!perceived)state.memory=Math.max(0,state.memory-h);
    if(!target&&state.memory<=0)state.targetId=null;
    state.targetVisible=!!(target&&perceived);if(target&&!perceived)state.hiddenTime+=h;else if(!target)state.hiddenTime=0;

    const previousAreaTargetId=state.areaTargetId,targetId=target&&String(target.id||'')||null;
    if(targetId!==previousAreaTargetId){
      if(previousAreaTargetId&&!targetId){const previous=point(pawnById(previousAreaTargetId));if(previous)state.threat=previous;}
      state.areaTargetId=targetId;state.observedTargetId=targetId;state.observeTime=0;
    }

    if(cfg.actionArea.enabled&&previousAreaTargetId&&!targetId){
      if(cfg.actionArea.exitAction==='forget'){state.targetId=null;state.memory=0;state.threat=null;}
      else if(cfg.actionArea.exitAction==='hold'){releaseAnimalChase(pawn,state,'area-hold');stop(pawn);return 'area-hold';}
      else if(cfg.actionArea.exitAction==='search'&&state.threat){releaseAnimalChase(pawn,state,'area-search');if(distanceSquared(origin,state.threat)>2.25){moveToward(pawn,origin,state.threat,.5,false,0);return 'area-search';}stop(pawn);return 'area-alert';}
    }

    if(state.reaction==='freeze'){releaseAnimalChase(pawn,state,'freeze');stop(pawn);return 'freeze';}
    if(state.reaction==='flee'||cfg.profile==='flee'||cfg.profile==='civilian'&&cfg.fear.enabled&&state.fear>=cfg.fear.threshold){const threat=target&&point(target)||state.threat;if(threat){releaseAnimalChase(pawn,state,'flee');moveAway(pawn,origin,threat);return 'flee';}}
    if(state.reaction==='investigate'&&!target&&state.threat){releaseAnimalChase(pawn,state,'investigate');if(distanceSquared(origin,state.threat)>2.25){moveToward(pawn,origin,state.threat,.62,false,0);return 'investigate';}stop(pawn);return 'alert';}
    if(state.reaction==='cover'&&!target&&state.threat&&cfg.tactics.coverBias>.5){const coverState=seekCover(pawn,cfg,state,origin,state.threat,h);if(coverState){releaseAnimalChase(pawn,state,'seek-cover');return coverState;}}
    if(guardReturn(pawn,cfg,state,origin)&&(!target||cfg.profile==='defensive')){releaseAnimalChase(pawn,state,'return-guard');return 'return-guard';}
    if(target&&cfg.actionArea.enabled){
      const action=cfg.actionArea.action;
      if(action==='flee'){releaseAnimalChase(pawn,state,'area-flee');moveAway(pawn,origin,point(target));return 'area-flee';}
      if(action==='investigate'){const at=point(target);releaseAnimalChase(pawn,state,'area-investigate');if(distanceSquared(origin,at)>cfg.tactics.preferredRange*cfg.tactics.preferredRange){moveToward(pawn,origin,at,.52,false,0);return 'area-investigate';}face(pawn,at.x-origin.x,at.z-origin.z);stop(pawn);return 'area-alert';}
      if(action==='cover'&&cfg.tactics.coverBias>.5){const coverState=seekCover(pawn,cfg,state,origin,point(target),h);if(coverState){releaseAnimalChase(pawn,state,'area-cover');return 'area-'+coverState;}}
    }
    const shouldObserve=target&&(cfg.profile==='observer'||cfg.actionArea.enabled&&cfg.actionArea.action==='observe')&&state.observeTime<cfg.perception.confirmSeconds;
    if(shouldObserve)return observe(pawn,target,cfg,state,origin,h);
    if(target)return engage(pawn,target,cfg,state,origin,h,perceived);
    releaseAnimalChase(pawn,state,'no-target');
    const combat=combatFor(pawn,cfg);if(combat)combat.setAimDownSights(false);
    return patrol(pawn,cfg,state,origin);
  }
  function releasePawn(ref,reason){
    let key=null,state=null;
    records.forEach((candidate,candidateKey)=>{
      if(state)return;
      if(ref&&typeof ref==='object'?candidate.pawn===ref:String(candidateKey)===String(ref)){key=candidateKey;state=candidate;}
    });
    if(!state)return false;
    releaseState(state,true,reason||'pawn-release');records.delete(key);return true;
  }
  function update(dt){
    if(disposed)return false;
    if(GAME&&GAME.state&&GAME.state.started===false){
      records.forEach(state=>releaseState(state,true,'game-stopped'));records.clear();stimuli.length=0;squadIntel.clear();
      const stoppedCombat=GAME.systems&&GAME.systems.actorCombat;if(stoppedCombat&&typeof stoppedCombat.clear==='function')stoppedCombat.clear();
      return false;
    }
    const h=clamp(dt,.001,.1);clock+=h;
    for(let index=stimuli.length-1;index>=0;index--)if(stimuli[index].expires<=clock)stimuli.splice(index,1);
    squadIntel.forEach((intel,id)=>{if(intel.expires<=clock)squadIntel.delete(id);});
    const live=new Set();pawns().forEach(pawn=>{if(!pawn||pawn.disposed===true||!hasDescriptor(pawn))return;live.add(String(pawn.id));stepActor(pawn,h);});
    records.forEach((state,id)=>{if(!live.has(String(id)))releasePawn(state.pawn,'not-live');});
    const combat=GAME&&GAME.systems&&GAME.systems.actorCombat;
    if(combat&&typeof combat.list==='function')combat.list().forEach(facade=>{if(facade&&typeof facade.updateVisual==='function')facade.updateVisual(h);});
    if(combat&&typeof combat.prune==='function')combat.prune(new Set(pawns().map(pawn=>String(pawn&&pawn.id||''))));
    return true;
  }
  function bindFrameHook(callback){frameHook=typeof callback==='function'?callback:null;return !!frameHook;}
  function dispose(){
    if(disposed)return false;disposed=true;if(root.removeEventListener)root.removeEventListener('lk-pawn-event',onPawnEvent);
    records.forEach(state=>releaseState(state,true,'behavior-dispose'));records.clear();if(coverPlanner&&typeof coverPlanner.dispose==='function')coverPlanner.dispose();stimuli.length=0;squadIntel.clear();
    const hooks=GAME&&GAME.hooks;if(frameHook&&hooks&&Array.isArray(hooks.frame)){for(let index=hooks.frame.length-1;index>=0;index--)if(hooks.frame[index]===frameHook)hooks.frame.splice(index,1);if(hooks.__lkActorBehaviorFrame===frameHook)hooks.__lkActorBehaviorFrame=null;}
    if(GAME&&GAME.systems){if(GAME.systems.actorBehavior===api)GAME.systems.actorBehavior=null;if(GAME.systems.fpsEnemyAi===api)GAME.systems.fpsEnemyAi=null;}
    frameHook=null;return true;
  }
  api=Object.freeze({version:VERSION,update,stepActor,stepEnemy:(pawn,target,dt)=>stepActor(pawn,dt,target),normalizeAi:normalizeBehavior,emitStimulus,records,stimuli,squadIntel,releasePawn,bindFrameHook,isDisposed:()=>disposed,dispose});return api;
}

function install(GAME){
  if(!GAME)return null;GAME.systems=GAME.systems||{};
  const previous=GAME.systems.actorBehavior;
  if(previous&&previous.version===VERSION&&!(typeof previous.isDisposed==='function'&&previous.isDisposed()))return previous;
  if(previous&&typeof previous.dispose==='function'&&!(typeof previous.isDisposed==='function'&&previous.isDisposed()))previous.dispose();
  if(root.LK_RUNTIME_ACTOR_COMBAT&&root.LK_RUNTIME_ACTOR_COMBAT.install)root.LK_RUNTIME_ACTOR_COMBAT.install(GAME);
  const system=create(GAME);GAME.systems.actorBehavior=system;GAME.systems.fpsEnemyAi=system;
  if(GAME.hooks&&Array.isArray(GAME.hooks.frame)){
    const stale=GAME.hooks.__lkActorBehaviorFrame;if(typeof stale==='function'){for(let index=GAME.hooks.frame.length-1;index>=0;index--)if(GAME.hooks.frame[index]===stale)GAME.hooks.frame.splice(index,1);}
    const hook=dt=>system.update(dt);GAME.hooks.frame.push(hook);GAME.hooks.__lkActorBehaviorFrame=hook;system.bindFrameHook(hook);
  }
  return system;
}

root.LK_RUNTIME_ACTOR_BEHAVIOR=Object.freeze({VERSION,PROFILE_IDS,PROFILE_OPTIONS,REACTION_OPTIONS,PROFILE_PRESETS,migrateEnemyAi,normalizeProfile,normalizeBehavior,hasDescriptor,factionOf,create,install});
if(root.LOT_KING)install(root.LOT_KING);
if(typeof module!=='undefined'&&module.exports)module.exports=root.LK_RUNTIME_ACTOR_BEHAVIOR;
})(typeof window!=='undefined'?window:globalThis);
