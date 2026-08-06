'use strict';

const assert=require('node:assert/strict');
const THREE=require('three');

global.window=global;global.THREE=THREE;
const listeners=new Map();
global.CustomEvent=class CustomEvent{constructor(type,options){this.type=type;this.detail=options&&options.detail;}};
global.addEventListener=(type,listener)=>{const list=listeners.get(type)||[];list.push(listener);listeners.set(type,list);};
global.removeEventListener=(type,listener)=>{const list=listeners.get(type)||[];listeners.set(type,list.filter(item=>item!==listener));};
global.dispatchEvent=event=>{(listeners.get(event.type)||[]).slice().forEach(listener=>listener(event));return true;};

require('../js/runtime/first-person-controller.js');
require('../js/runtime/item-system.js');
const DAMAGE=require('../js/runtime/combat/damage-contract.js');
require('../js/runtime/character-combat-cover.js');
const COMBAT=require('../js/runtime/combat/actor-combat.js');
const COVER_PLANNER=require('../js/runtime/ai/actor-cover-planner.js');
const BEHAVIOR=require('../js/runtime/ai/actor-behavior.js');
require('../js/editor/visual-helpers.js');
const FP=global.LK_RUNTIME_FIRST_PERSON;

function test(name,run){try{run();console.log('ok - '+name);}catch(error){console.error('not ok - '+name);throw error;}}
function ownerAt(x,z){const owner=new THREE.Group();owner.position.set(x||0,0,z||0);owner.userData={};return owner;}
function pawn(id,x,z,config){
  const record={id,owner:ownerAt(x,z),config:Object.assign({movement:{height:1.8},vitals:{team:'neutral'}},config||{}),state:{},enabled:true,hidden:false,possessed:false,lastMove:null,moveCalls:0};
  record.setMoveInput=value=>{record.lastMove=Object.assign({},value);record.moveCalls++;};record.reset=()=>true;record.dispose=function(){if(this.disposed)return false;this.disposed=true;return true;};return record;
}
function gameWith(records){
  const game={state:{started:true},systems:{},hooks:{frame:[]},world:{registry:[],colliders:{box:[],circle:[]}},core:{scene:new THREE.Scene()}};
  game.pawns={list:()=>records,get:id=>records.find(item=>item.id===id)||null};records.forEach(item=>game.core.scene.add(item.owner));return game;
}
function armedRig(game,record,weapon){record.firstPerson=FP.create(game,record,{enabled:true,view:'third',hideOwnBody:false,weapon:Object.assign({preset:'rifle',spreadHip:0,spreadAds:0,fireRate:1000},weapon||{})});return record.firstPerson;}

test('actor combat keeps weapon state and weapon events independent per Pawn',()=>{
  const a=pawn('armed-a',0,0),b=pawn('armed-b',2,0),game=gameWith([a,b]);armedRig(game,a,{magazine:2,ammoReserve:4});armedRig(game,b,{magazine:5,ammoReserve:10});
  const fired=[];const onEvent=event=>{if(event.detail&&event.detail.type==='OnWeaponFired')fired.push(event.detail);};addEventListener('lk-pawn-event',onEvent);
  const registry=COMBAT.install(game),combatA=registry.forPawn(a),combatB=registry.forPawn(b);
  assert.equal(combatA.ammo().ammo,2);assert.equal(combatB.ammo().ammo,5);assert.equal(combatA.fire().pawnId,'armed-a');
  assert.equal(combatA.ammo().ammo,1);assert.equal(combatB.ammo().ammo,5);assert.equal(fired.at(-1).pawnId,'armed-a');
  combatB.equip('pistol');assert.equal(combatB.weapon().preset,'pistol');assert.equal(combatA.weapon().preset,'rifle');
  removeEventListener('lk-pawn-event',onEvent);registry.dispose();
});

test('Actor Behavior and Actor Combat dispose cleanly and reinstall without duplicate frame updates',()=>{
  const actor=pawn('lifecycle-ai',0,0,{behavior:{enabled:true,profile:'aggressive',faction:'enemy',hostileFactions:['player'],tactics:{attackRange:0,preferredRange:5}}}),game=gameWith([actor]);armedRig(game,actor,{preset:'rifle'});
  const combatA=COMBAT.install(game),facadeA=combatA.forPawn(actor);assert.equal(facadeA.available(),true);assert.equal(combatA.dispose(),true);assert.equal(game.systems.actorCombat,null);assert.equal(facadeA.available(),false,'disposed facades cannot keep driving their rig');
  const combatB=COMBAT.install(game);assert.notEqual(combatB,combatA);assert.equal(combatB.isDisposed(),false);
  const behaviorA=BEHAVIOR.install(game);assert.equal(game.hooks.frame.length,1);game.hooks.frame[0](.1);const afterFirstFrame=actor.moveCalls;
  assert.equal(behaviorA.dispose(),true);assert.equal(game.hooks.frame.length,0);assert.equal(game.systems.actorBehavior,null);assert.equal(game.systems.fpsEnemyAi,null);assert.equal(behaviorA.update(.1),false);
  const behaviorB=BEHAVIOR.install(game);assert.notEqual(behaviorB,behaviorA);assert.equal(game.hooks.frame.length,1);game.hooks.frame.slice().forEach(frame=>frame(.1));assert.equal(actor.moveCalls,afterFirstFrame+1,'reinstall owns exactly one frame callback');
  behaviorB.dispose();combatB.dispose();assert.equal(game.hooks.frame.length,0);
});

test('Actor Combat release is identity-safe, idempotent and clears stopped-session visuals',()=>{
  const actor=pawn('released-ai',0,0,{behavior:{enabled:true,profile:'aggressive',faction:'enemy',hostileFactions:['player'],tactics:{attackRange:0}}}),game=gameWith([actor]);armedRig(game,actor,{preset:'rifle'});
  const previous=global.LK_RUNTIME_FPS_VIEW_MODEL;global.LK_RUNTIME_FPS_VIEW_MODEL={buildWorldModel(){const visual=new THREE.Group();visual.userData.materials=[];return visual;}};
  const registry=COMBAT.install(game),facade=registry.forPawn(actor);assert.equal(facade.updateVisual(.016),true);const visual=facade.state.visual;
  assert.equal(registry.releasePawn(actor),true);assert.equal(registry.releasePawn(actor),false,'release is idempotent');assert.equal(registry.list().length,0);assert.equal(visual.parent,null);assert.equal(actor.actorCombat,null);
  const replacement=pawn('released-ai',2,0),replacementFacade=registry.forPawn(replacement);assert.equal(registry.releasePawn(actor),false,'an old object cannot release a newer Pawn reusing its ID');assert.equal(registry.get('released-ai'),replacementFacade);
  registry.releasePawn(replacement);const stoppedFacade=registry.forPawn(actor);assert.equal(stoppedFacade.updateVisual(.016),true);const stoppedVisual=stoppedFacade.state.visual,behavior=BEHAVIOR.create(game);behavior.stepActor(actor,.1);game.state.started=false;assert.equal(behavior.update(.1),false);assert.equal(behavior.records.size,0);assert.equal(registry.list().length,0);assert.equal(stoppedVisual.parent,null,'Stop Preview clears the floating carried visual immediately');
  behavior.dispose();registry.dispose();global.LK_RUNTIME_FPS_VIEW_MODEL=previous;
});

test('combat-only lazy attachment hydrates each Pawn loadout exactly once',()=>{
  const actor=pawn('lazy-loadout-ai',0,0,{combat:{enabled:true,weapon:{preset:'rifle'}},inventory:{mode:'slots',weaponSlots:7,autoEquip:false},loadout:[{preset:'pistol'},{preset:'knife'},{preset:'grenade'}]}),game=gameWith([actor]),registry=COMBAT.install(game),facade=registry.forPawn(actor,{autoAttach:true});
  assert.equal(facade.available(),true);assert.ok(actor.firstPerson);assert.ok(actor.inventory);assert.deepEqual(actor.inventory.slots().map(entry=>entry.weapon.preset),['pistol','rifle','knife','grenade']);assert.equal(actor.inventory.current().weapon.preset,'rifle');
  const before=actor.inventory.slots().map(entry=>({preset:entry.weapon.preset,ammo:entry.ammo,reserve:entry.reserve}));assert.equal(facade.available(),true);assert.deepEqual(actor.inventory.slots().map(entry=>({preset:entry.weapon.preset,ammo:entry.ammo,reserve:entry.reserve})),before,'resolving the facade again must not duplicate or top up loadout state');
  registry.dispose();actor.dispose();
});

test('removed descriptors and disposed or removed Pawns release cover reservations immediately',()=>{
  const descriptor={enabled:true,profile:'tactical',faction:'enemy',hostileFactions:['player'],perception:{sightRange:30},tactics:{attackRange:0,preferredRange:7,coverBias:1}};
  const actor=pawn('retired-cover-ai',0,0,{movement:{height:1.8,radius:.35},behavior:descriptor}),target=pawn('retired-cover-target',0,10,{faction:'player',vitals:{team:'player'}}),roster=[actor,target],game=gameWith(roster),system=BEHAVIOR.create(game);
  actor.cover={config:()=>({hugDistance:.42}),inCover:()=>false,attach:()=>true};game.world.colliders.box.push({enabled:true,cover:true,x:0,y:1,z:4,hx:2,hy:1,hz:.4});
  assert.equal(system.stepEnemy(actor,target,.1),'seek-cover');const descriptorState=system.records.get(actor.id),descriptorPlan=descriptorState.coverPlan;assert.ok(descriptorPlan.reservationKey);
  delete actor.config.behavior;system.update(.1);assert.equal(system.records.has(actor.id),false);assert.equal(descriptorPlan.reservationKey,null,'descriptor removal releases in the same update');
  actor.config.behavior=descriptor;assert.equal(system.stepEnemy(actor,target,.1),'seek-cover');const disposedPlan=system.records.get(actor.id).coverPlan;assert.ok(disposedPlan.reservationKey,'the released slot can be reserved again immediately');
  actor.disposed=true;system.update(.1);assert.equal(system.records.has(actor.id),false);assert.equal(disposedPlan.reservationKey,null,'a disposed Pawn is not kept live');
  actor.disposed=false;assert.equal(system.stepEnemy(actor,target,.1),'seek-cover');const removedPlan=system.records.get(actor.id).coverPlan;assert.ok(removedPlan.reservationKey);
  roster.splice(roster.indexOf(actor),1);system.update(.1);assert.equal(system.records.has(actor.id),false);assert.equal(removedPlan.reservationKey,null,'registry removal releases without waiting for reservation TTL');system.dispose();
});

test('AI inventory keeps the authored starting weapon equipped while loading extra slots',()=>{
  const actor=pawn('loadout-ai',0,0),game=gameWith([actor]),rig=armedRig(game,actor,{preset:'rifle'});
  const inventory=global.LK_RUNTIME_ITEMS.createInventory(actor,{mode:'slots',weaponSlots:7,autoEquip:false});actor.inventory=inventory;
  inventory.add(rig.config().weapon);inventory.add({preset:'pistol'});inventory.add({preset:'knife'});inventory.add({preset:'grenade'});
  assert.equal(inventory.current().weapon.preset,'rifle');assert.equal(rig.weapon().preset,'rifle','loadout additions must not replace WeaponPreset in hand');
});

test('unpossessed carried visuals are per actor, hidden on possession and disposed',()=>{
  const actor=pawn('visual-enemy',1,2),game=gameWith([actor]);armedRig(game,actor,{preset:'smg'});
  const previous=global.LK_RUNTIME_FPS_VIEW_MODEL;
  global.LK_RUNTIME_FPS_VIEW_MODEL={buildWorldModel(){const visual=new THREE.Group(),flash=new THREE.Object3D();flash.material={opacity:0};visual.userData.flash=flash;visual.userData.materials=[];visual.add(flash);return visual;}};
  const combat=COMBAT.install(game).forPawn(actor);assert.equal(combat.updateVisual(.016),true);assert.match(combat.state.visual.name,/visual-enemy/);assert.equal(combat.state.visual.visible,true);
  actor.possessed=true;assert.equal(combat.updateVisual(.016),false);assert.equal(combat.state.visual.visible,false);
  const visual=combat.state.visual;combat.dispose();assert.equal(visual.parent,null);global.LK_RUNTIME_FPS_VIEW_MODEL=previous;
});

test('behavior requires an explicit descriptor and normalizes every profile with sane baselines',()=>{
  const ordinary=pawn('ordinary-null-player',0,0,{playerId:null}),game=gameWith([ordinary]),system=BEHAVIOR.create(game);system.update(.1);assert.equal(ordinary.moveCalls,0,'playerId null must not imply AI');system.dispose();
  BEHAVIOR.PROFILE_IDS.forEach(profile=>{const cfg=BEHAVIOR.normalizeBehavior({profile});assert.equal(cfg.profile,profile);assert.ok(cfg.perception.sightRange>1);assert.ok(cfg.perception.memorySeconds>0);assert.ok(cfg.tactics.accuracy>.05);assert.ok(cfg.tactics.burstPause>.05);});
  const migrated=BEHAVIOR.normalizeBehavior({enemyAi:{enabled:true,sightRange:77,flankStrength:.9,tag:'legacy'}});assert.equal(migrated.perception.sightRange,77);assert.equal(migrated.tactics.flankBias,.9);assert.equal(migrated.tag,'legacy');
  const partial=BEHAVIOR.migrateEnemyAi({profile:'tactical',sightRange:undefined});
  assert.equal(Object.prototype.hasOwnProperty.call(partial.perception,'sightRange'),false,'legacy migration removes undefined leaves');
  const partialCfg=BEHAVIOR.normalizeBehavior({enemyAi:{profile:'tactical',sightRange:undefined,burstPause:undefined}});
  assert.equal(partialCfg.perception.sightRange,42);assert.equal(partialCfg.perception.memorySeconds,4.5);assert.equal(partialCfg.tactics.accuracy,.62);assert.equal(partialCfg.tactics.burstPause,.75);
});

test('a player-authored Pawn can never inherit AI movement or autonomous fire',()=>{
  const player=pawn('player-with-stray-behavior',0,0,{playerId:1,possessed:true,behavior:{enabled:true,profile:'aggressive',faction:'player',hostileFactions:['enemy'],perception:{sightRange:30},tactics:{attackRange:20,preferredRange:5}}}),enemy=pawn('hostile-nearby',0,5,{faction:'enemy',vitals:{team:'enemy'}}),game=gameWith([player,enemy]);
  player.playerId=1;player.possessed=false;player.control={fire:true,z:1};let cleared=0;player.clearControl=()=>{cleared++;player.control=null;};armedRig(game,player,{preset:'rifle',magazine:5,ammoReserve:0,spreadHip:0,spreadAds:0,fireRate:20});
  const fired=[];const onFire=event=>{if(event.detail&&event.detail.type==='OnWeaponFired')fired.push(event.detail);};addEventListener('lk-pawn-event',onFire);
  const system=BEHAVIOR.create(game);assert.equal(system.stepActor(player,.1),'suspended');assert.equal(cleared,1);assert.equal(player.control,null);assert.equal(player.moveCalls,0);assert.equal(fired.some(event=>event.pawnId===player.id),false);
  removeEventListener('lk-pawn-event',onFire);system.dispose();
});

test('Observer AI is gated by its smart action area and confirms before engaging',()=>{
  const actor=pawn('observer-ai',0,0,{behavior:{enabled:true,profile:'observer',faction:'enemy',hostileFactions:['player'],perception:{sightRange:30,confirmSeconds:.25,fieldOfViewDeg:120,requireLineOfSight:false},tactics:{attackRange:0,preferredRange:5,coverBias:0},actionArea:{enabled:true,shape:'circle',radius:8,height:6,action:'observe',exitAction:'forget'}}}),target=pawn('observer-target',0,12,{faction:'player',vitals:{team:'player'}}),game=gameWith([actor,target]),system=BEHAVIOR.create(game);
  assert.equal(system.stepActor(actor,.1),'idle');assert.equal(system.records.get(actor.id).targetId,null,'outside the authored area cannot be acquired');
  target.owner.position.z=6;assert.equal(system.stepActor(actor,.1),'observe');assert.equal(actor.lastMove.fire,false);assert.equal(actor.lastMove.z,0,'observation holds fire and position while confirming');
  // A confirmed target is engaged. Closing is BOUNDED - a push, then a stop to
  // shoot from - so the state alternates between `advance` and `advance-hold`
  // instead of being a continuous run at the target.
  system.stepActor(actor,.1);system.stepActor(actor,.1);
  const promoted=system.stepActor(actor,.1);
  assert.ok(/^(?:advance|advance-hold|engage)$/.test(promoted),'confirmation promotes the target into normal tactical engagement, got '+promoted);
  const closing=new Set([promoted]);
  for(let i=0;i<24;i++)closing.add(system.stepActor(actor,.1));
  assert.ok(closing.has('advance')&&closing.has('advance-hold'),
    'the advance is bounded, not a continuous charge; saw '+Array.from(closing).join(', '));
  target.owner.position.z=12;system.stepActor(actor,.1);const state=system.records.get(actor.id);assert.equal(state.targetId,null);assert.equal(state.memory,0,'Forget on exit clears target memory immediately');system.dispose();
});

test('selecting an AI Logic Element draws non-exportable action-area and FOV helpers',()=>{
  const selected=ownerAt(3,4);selected.userData.logicGraph={variables:[
    {exposed:true,binding:'behavior.actionArea.radius',value:12},
    {exposed:true,binding:'behavior.perception.fieldOfViewDeg',value:90},
  ],characterPawn:{behavior:{enabled:true,perception:{sightRange:18,fieldOfViewDeg:120},actionArea:{enabled:true,shape:'circle',radius:8,height:6,action:'observe',showInEditor:true}}}};
  const helperGroup=new THREE.Group(),ED={selected,multiSelected:null,active:true},helpers=global.LK_EDITOR_VISUAL_HELPERS.create({THREE,GAME:{},ED,helperGroup,registry:()=>[]});
  helpers.refreshSelectionHelpers();const areaHelper=helperGroup.children.find(child=>child.userData&&child.userData.aiActionAreaHelper);assert.ok(areaHelper);
  assert.equal(areaHelper.children.some(child=>child.userData&&child.userData.aiArea),true);assert.equal(areaHelper.children.some(child=>child.userData&&child.userData.aiFov),true);
  areaHelper.traverse(node=>{if(node!==areaHelper)assert.equal(node.userData.nonExportable,true);});
  ED.selected=null;helpers.updateSelectionAndDropHelpers();assert.equal(helperGroup.children.some(child=>child.userData&&child.userData.aiActionAreaHelper),false);
});

test('faction acquisition respects FOV, LOS and retains only bounded target memory',()=>{
  const actor=pawn('sentinel',0,0,{behavior:{enabled:true,profile:'aggressive',faction:'enemy',hostileFactions:['player'],perception:{sightRange:20,hearingRange:10,memorySeconds:.25,fieldOfViewDeg:100,requireLineOfSight:true},tactics:{attackRange:0,preferredRange:5,guardRadius:30}}}),target=pawn('target',0,-6,{faction:'player',vitals:{team:'player'}}),game=gameWith([actor,target]),system=BEHAVIOR.create(game);
  system.update(.1);assert.equal(actor.lastMove.z,0,'a target behind the authored FOV is not acquired');
  target.owner.position.z=6;game.world.colliders.box.push({enabled:true,x:0,y:1,z:3,hx:2,hy:2,hz:.4});system.update(.1);assert.equal(actor.lastMove.z,0,'solid world cover blocks initial acquisition');
  game.world.colliders.box.length=0;system.update(.1);assert.notEqual(actor.lastMove.z,0,'visible hostile faction is acquired');
  game.world.colliders.box.push({enabled:true,x:0,y:1,z:3,hx:2,hy:2,hz:.4});system.update(.1);assert.notEqual(actor.lastMove.z,0,'recent target survives a brief LOS loss');
  for(let frame=0;frame<5;frame++)system.update(.1);assert.equal(actor.lastMove.z,0,'target memory expires instead of seeing through walls forever');system.dispose();
});

test('AI heals from its authored pack and throws grenades only after a hidden-target delay',()=>{
  const actor=pawn('equipped-tactical-ai',0,0,{behavior:{enabled:true,profile:'aggressive',faction:'enemy',hostileFactions:['player'],perception:{sightRange:30,memorySeconds:2,fieldOfViewDeg:140,requireLineOfSight:true},tactics:{attackRange:18,preferredRange:10,coverBias:0,accuracy:1,burstMin:1,burstMax:1},equipment:{medkits:1,healBelow:.4,healAmount:45,grenades:1,grenadeMinRange:5,grenadeMaxRange:20,grenadeHiddenSeconds:.2,grenadeCooldown:5}}}),target=pawn('hidden-grenade-target',0,10,{faction:'player',vitals:{team:'player'}}),game=gameWith([actor,target]);
  let health=20;actor.vitals={state:{dead:false,get health(){return health;}},config:()=>({maxHealth:100}),heal(amount){health=Math.min(100,health+amount);return amount;}};
  armedRig(game,actor,{preset:'rifle',magazine:20,ammoReserve:0,spreadHip:0,spreadAds:0,fireRate:20});
  actor.inventory=global.LK_RUNTIME_ITEMS.createInventory(actor,{mode:'backpack',weaponSlots:7,packSize:4,autoEquip:false});actor.inventory.add(actor.firstPerson.config().weapon);actor.inventory.add({preset:'grenade',ammoReserve:1});
  const fired=[],thrown=[],onEvent=event=>{const detail=event.detail||{};if(detail.type==='OnWeaponFired')fired.push(detail);if(detail.type==='OnWeaponThrown')thrown.push(detail);};addEventListener('lk-pawn-event',onEvent);
  const system=BEHAVIOR.create(game);system.stepActor(actor,.1);assert.equal(health,65,'low-health AI spends one real medkit from its backpack');assert.equal(actor.inventory.pack().length,0);
  const visibleShots=fired.length;game.world.colliders.box.push({enabled:true,x:0,y:1,z:5,hx:2,hy:2,hz:.4});
  system.stepActor(actor,.1);assert.equal(thrown.length,0,'a momentary LOS loss is not enough to throw');system.stepActor(actor,.1);system.stepActor(actor,.1);
  assert.equal(fired.length,visibleShots,'AI never keeps firing its gun through cover from target memory');assert.equal(thrown.length,1,'the remembered distant target receives one tactical grenade after the authored delay');assert.equal(system.records.get(actor.id).grenadesRemaining,0);
  removeEventListener('lk-pawn-event',onEvent);system.dispose();
});

test('vertical circle colliders block line of sight like cylindrical world geometry',()=>{
  const actor=pawn('circle-los-actor',0,0,{behavior:{enabled:true,profile:'aggressive',faction:'enemy',hostileFactions:['player'],perception:{sightRange:20,fieldOfViewDeg:140,requireLineOfSight:true},tactics:{attackRange:0,preferredRange:5}}}),target=pawn('circle-los-target',0,6,{faction:'player',vitals:{team:'player'}}),game=gameWith([actor,target]),system=BEHAVIOR.create(game);
  game.world.colliders.circle.push({enabled:true,x:0,y:1,z:3,r:.75,hy:1});system.update(.1);assert.equal(system.records.get(actor.id).targetId,null,'a circle/cylinder between eye and target blocks acquisition');
  game.world.colliders.circle.length=0;system.update(.1);assert.equal(system.records.get(actor.id).targetId,target.id,'removing the circle restores acquisition');system.dispose();
});

test('civilian and reactive profiles respond differently to shared stimuli',()=>{
  const civilian=pawn('civilian',0,0,{behavior:{enabled:true,profile:'civilian',faction:'civilian',hostileFactions:['enemy'],perception:{sightRange:20,hearingRange:30,memorySeconds:3},fear:{threshold:.2},reactions:{onExplosion:'flee'}}}),reactive=pawn('reactive',3,0,{behavior:{enabled:true,profile:'reactive',faction:'civilian',hostileFactions:['enemy'],perception:{sightRange:20,hearingRange:30,memorySeconds:3},reactions:{onDamage:'attack'}}}),brave=pawn('fear-disabled',-3,0,{behavior:{enabled:true,profile:'civilian',faction:'civilian',hostileFactions:['enemy'],perception:{hearingRange:30},fear:{enabled:false},reactions:{onExplosion:'investigate'}}}),enemy=pawn('stimulus-enemy',0,7,{faction:'enemy',vitals:{team:'enemy'}}),game=gameWith([civilian,reactive,brave,enemy]),system=BEHAVIOR.create(game);
  system.update(.1);assert.equal(civilian.lastMove.z,0);assert.equal(reactive.lastMove.z,0,'reactive stays neutral before a threat');
  system.emitStimulus({type:'explosion',position:{x:0,y:0,z:2},radius:20,intensity:1,sourcePawnId:'stimulus-enemy'});system.update(.1);assert.equal(civilian.lastMove.sprint,true);assert.equal(civilian.lastMove.z,1,'civilian flees a large event');
  assert.equal(system.records.get('fear-disabled').fear,0,'fear.enabled=false prevents fear accumulation');
  dispatchEvent(new CustomEvent('lk-pawn-event',{detail:{type:'OnCharacterDamaged',pawnId:'reactive',instigatorPawnId:'stimulus-enemy',damage:10}}));system.update(.1);assert.equal(system.records.get('reactive').targetId,'stimulus-enemy','reactive identifies the damage instigator');system.dispose();
});

test('animal AI releases only its own chase on possession, disable and death',()=>{
  const dog=pawn('guard-dog',0,0,{species:'dog',behavior:{enabled:true,profile:'aggressive',faction:'animal',hostileFactions:['enemy'],perception:{sightRange:20},tactics:{attackRange:10,preferredRange:2}}}),enemy=pawn('dog-target',0,4,{faction:'enemy',vitals:{team:'enemy'}}),game=gameWith([dog,enemy]);let chased=0,released=0;
  dog.chase=(target,options)=>{chased++;assert.equal(target,enemy);dog.chaseTarget=target;dog.chaseOwnerToken=options&&Object.prototype.hasOwnProperty.call(options,'ownerToken')?options.ownerToken:null;return true;};
  dog.stopChase=(reason,guard)=>{if(!dog.chaseTarget||guard&&guard.ownerToken!==dog.chaseOwnerToken)return false;dog.chaseTarget=null;dog.chaseOwnerToken=null;released++;return true;};dog.barkAlert=()=>[];
  const system=BEHAVIOR.create(game);system.update(.1);assert.equal(chased,1,'dog combat state maps to the existing chase verb');assert.ok(dog.chaseOwnerToken);
  dog.possessed=true;assert.equal(system.stepActor(dog,.1),'suspended');assert.equal(dog.chaseTarget,null);assert.equal(released,1);
  dog.possessed=false;system.stepActor(dog,.1);dog.config.behavior.enabled=false;assert.equal(system.stepActor(dog,.1),'suspended');assert.equal(dog.chaseTarget,null);assert.equal(released,2);
  dog.config.behavior.enabled=true;system.stepActor(dog,.1);dog.vitals={state:{dead:true}};assert.equal(system.stepActor(dog,.1),'suspended');assert.equal(dog.chaseTarget,null);assert.equal(released,3);
  dog.vitals={state:{dead:false}};system.stepActor(dog,.1);dog.chase(enemy,{source:'author'});dog.possessed=true;assert.equal(system.stepActor(dog,.1),'suspended');assert.equal(dog.chaseTarget,enemy,'a newer author-owned chase survives the AI ownership guard');assert.equal(released,3);dog.stopChase('test-cleanup');system.dispose();
});

test('cat and dog natural attacks use DamageContract even when ranged attackRange is zero',()=>{
  const dog=pawn('damage-dog',0,0,{species:'dog',behavior:{enabled:true,profile:'aggressive',faction:'animal',hostileFactions:['enemy'],tactics:{attackRange:0,preferredRange:2},animalAttack:{enabled:true,damage:20,range:2,cooldown:1.1,force:6,action:'pounce'}}});
  const dogTarget=pawn('dog-victim',0,1.5,{faction:'enemy',vitals:{team:'enemy'}}),cat=pawn('damage-cat',5,0,{species:'cat',behavior:{enabled:true,profile:'aggressive',faction:'animal',hostileFactions:['enemy'],tactics:{attackRange:0,preferredRange:2},animalAttack:{enabled:true,damage:13,range:2.4,cooldown:1.2,force:4,action:'pounce'}}});
  const catTarget=pawn('cat-victim',5,1.6,{faction:'enemy',vitals:{team:'enemy'}}),game=gameWith([dog,dogTarget,cat,catTarget]);let dogHealth=100,catHealth=100,directDamage=0,dogInfo=null,catInfo=null;
  dog.chase=()=>true;dog.playAction=()=>true;cat.pounce=()=>true;dogTarget.vitals={state:{dead:false},applyDamage(){directDamage++;}};catTarget.vitals={state:{dead:false},applyDamage(){directDamage++;}};
  DAMAGE.bind(dogTarget.owner,{apply(amount,info){dogInfo=info;dogHealth-=amount;return {health:dogHealth,maxHealth:100,damage:amount};}},{health:100,maxHealth:100,team:'enemy',pawnId:dogTarget.id});
  DAMAGE.bind(catTarget.owner,{apply(amount,info){catInfo=info;catHealth-=amount;return {health:catHealth,maxHealth:100,damage:amount};}},{health:100,maxHealth:100,team:'enemy',pawnId:catTarget.id});
  const system=BEHAVIOR.create(game);assert.equal(system.stepEnemy(dog,dogTarget,.1),'engage');assert.equal(system.stepEnemy(cat,catTarget,.1),'engage');
  assert.equal(dogHealth,80);assert.equal(catHealth,87);assert.equal(dogInfo.instigatorPawnId,'damage-dog');assert.equal(catInfo.instigatorPawnId,'damage-cat');assert.equal(dogInfo.source,'animal-melee');assert.equal(directDamage,0,'natural attacks never bypass DamageContract');
  system.stepEnemy(dog,dogTarget,.1);assert.equal(dogHealth,80,'the authored natural-attack cooldown prevents repeated contact damage');
  const disabled=BEHAVIOR.normalizeBehavior({profile:'aggressive',animalAttack:{enabled:false,damage:99,range:7,cooldown:.4}});assert.equal(disabled.animalAttack.enabled,false);assert.equal(disabled.animalAttack.damage,99);system.dispose();
});

test('natural attacks require an accepted action and dog chase does not suppress an equipped firearm',()=>{
  const rejectingDog=pawn('rejecting-dog',0,0,{species:'dog',behavior:{enabled:true,profile:'aggressive',faction:'animal',hostileFactions:['player'],tactics:{attackRange:0,preferredRange:2},animalAttack:{enabled:true,damage:25,range:2,cooldown:1}}}),nearTarget=pawn('near-dog-target',0,1.5,{faction:'player',vitals:{team:'player'}}),rejectGame=gameWith([rejectingDog,nearTarget]);let health=100;
  rejectingDog.chase=()=>true;rejectingDog.playAction=()=>false;DAMAGE.bind(nearTarget.owner,{apply(amount){health-=amount;return {health,maxHealth:100,damage:amount};}},{health:100,maxHealth:100,team:'player',pawnId:nearTarget.id});
  const rejectSystem=BEHAVIOR.create(rejectGame);rejectSystem.stepEnemy(rejectingDog,nearTarget,.1);assert.equal(health,100,'a rejected attack animation cannot produce contact damage');assert.equal(rejectSystem.records.get(rejectingDog.id).animalActionCooldown,0);rejectSystem.dispose();

  const armedDog=pawn('armed-dog',0,0,{species:'dog',behavior:{enabled:true,profile:'aggressive',faction:'animal',hostileFactions:['player'],perception:{sightRange:20},tactics:{attackRange:12,preferredRange:6,accuracy:1,burstMin:1,burstMax:1},animalAttack:{enabled:true,damage:20,range:2,cooldown:1}}}),farTarget=pawn('far-dog-target',0,6,{faction:'player',vitals:{team:'player'}}),armedGame=gameWith([armedDog,farTarget]);let chased=0;
  armedDog.chase=()=>{chased++;return true;};armedRig(armedGame,armedDog,{preset:'rifle',magazine:3,ammoReserve:0,spreadHip:0,spreadAds:0,fireRate:20});const fired=[];const onFire=event=>{if(event.detail&&event.detail.type==='OnWeaponFired')fired.push(event.detail);};addEventListener('lk-pawn-event',onFire);
  const armedSystem=BEHAVIOR.create(armedGame);armedSystem.stepEnemy(armedDog,farTarget,.1);assert.equal(chased,1);assert.equal(fired.at(-1).pawnId,'armed-dog','chase locomotion outside bite range must not suppress the equipped firearm');removeEventListener('lk-pawn-event',onFire);armedSystem.dispose();
});

test('cover planner searches world colliders, retries boundedly and never attaches remotely',()=>{
  const actor=pawn('cover-actor',0,0,{movement:{height:1.8,radius:.35},behavior:{enabled:true,profile:'tactical',faction:'enemy',hostileFactions:['player'],perception:{sightRange:30},tactics:{attackRange:0,preferredRange:7,coverBias:1}}}),target=pawn('cover-threat',0,10,{faction:'player',vitals:{team:'player'}}),game=gameWith([actor,target]);let attached=null,attachCalls=0;
  actor.cover={config:()=>({hugDistance:.42}),inCover:()=>!!attached,attach:found=>{attachCalls++;attached=found;return true;}};
  const system=BEHAVIOR.create(game);system.stepEnemy(actor,target,.1);const plan=system.records.get(actor.id).coverPlan;assert.equal(plan.searches,1);assert.equal(plan.target,null);
  const wall={enabled:true,cover:true,x:0,y:1,z:4,hx:2,hy:1,hz:.4};game.world.colliders.box.push(wall);
  for(let frame=0;frame<10&&!plan.target;frame++)system.stepEnemy(actor,target,.1);
  assert.ok(plan.target&&plan.target.collider===wall,'retry discovers a collider added after the first failed search');assert.equal(attachCalls,0,'remote cover is approached, never attached');assert.ok(plan.searches<=3,'failed searches are rate-limited rather than repeated every frame');
  actor.owner.position.set(plan.target.position.x,plan.target.position.y,plan.target.position.z);assert.equal(system.stepEnemy(actor,target,.1),'cover');assert.equal(attached.collider,wall);assert.equal(plan.target,null);system.dispose();
});

test('Logic Element child colliders owned by actor or target do not block perception',()=>{
  const actor=pawn('los-owner',0,0,{behavior:{enabled:true,profile:'aggressive',faction:'enemy',hostileFactions:['player'],perception:{sightRange:20,fieldOfViewDeg:140,requireLineOfSight:true},tactics:{attackRange:0,preferredRange:5}}}),target=pawn('los-target',0,6,{faction:'player',vitals:{team:'player'}}),game=gameWith([actor,target]);
  const actorChild=new THREE.Object3D(),targetChild=new THREE.Object3D();actor.owner.add(actorChild);target.owner.add(targetChild);
  game.world.colliders.box.push({enabled:true,x:0,y:.9,z:.15,hx:.4,hy:.9,hz:.4,owner:actorChild,logicElementOwner:actor.owner},{enabled:true,x:0,y:.9,z:5.85,hx:.4,hy:.9,hz:.4,owner:targetChild,logicElementOwner:target.owner});
  const system=BEHAVIOR.create(game);system.update(.1);assert.equal(system.records.get(actor.id).targetId,target.id,'self/target Logic Element collision children are excluded from LOS');system.dispose();
});

test('AI switches only its own inventory to a usable sidearm when primary ammo is exhausted',()=>{
  const actor=pawn('switching-ai',0,0,{behavior:{enabled:true,profile:'aggressive',faction:'enemy',hostileFactions:['player'],perception:{sightRange:20},tactics:{attackRange:12,preferredRange:6,accuracy:1,burstMin:1,burstMax:1}}}),other=pawn('other-ai',3,0),target=pawn('switch-target',0,6,{faction:'player',vitals:{team:'player'}}),game=gameWith([actor,other,target]);
  armedRig(game,actor,{preset:'rifle',magazine:1,ammoReserve:0,spreadHip:0,spreadAds:0});armedRig(game,other,{preset:'rifle',magazine:5,ammoReserve:10,spreadHip:0,spreadAds:0});
  actor.inventory=global.LK_RUNTIME_ITEMS.createInventory(actor,{mode:'slots',weaponSlots:7,autoEquip:false});other.inventory=global.LK_RUNTIME_ITEMS.createInventory(other,{mode:'slots',weaponSlots:7,autoEquip:false});
  actor.inventory.add({preset:'rifle',magazine:1,ammoReserve:0});actor.inventory.add({preset:'pistol',magazine:3,ammoReserve:9});actor.inventory.add({preset:'grenade',magazine:1,ammoReserve:3});other.inventory.add({preset:'rifle',magazine:5,ammoReserve:10});other.inventory.add({preset:'pistol',magazine:7,ammoReserve:21});other.inventory.add({preset:'grenade',magazine:1,ammoReserve:3});
  actor.firstPerson.equipWeapon(actor.inventory.current().weapon,{ammo:0,reserve:0});const otherBefore=other.firstPerson.ammo();
  const system=BEHAVIOR.create(game);system.stepEnemy(actor,target,.1);
  assert.equal(actor.firstPerson.weapon().preset,'pistol','a usable sidearm must win over the later grenade slot');assert.equal(actor.firstPerson.ammo().ammo,3);assert.equal(other.firstPerson.weapon().preset,'rifle');assert.deepEqual(other.firstPerson.ammo(),otherBefore,'another AI inventory/ammo state is untouched');system.dispose();
});

test('Outpost-style AI damages through the real weapon controller, never direct vitals damage',()=>{
  const enemy=pawn('real-shooter',0,0,{behavior:{enabled:true,profile:'aggressive',faction:'enemy',hostileFactions:['player'],perception:{sightRange:30,fieldOfViewDeg:120,requireLineOfSight:true},tactics:{attackRange:15,preferredRange:6,accuracy:1,burstMin:1,burstMax:1}},combat:{enabled:true,weapon:{preset:'rifle'}},vitals:{team:'enemy'}});
  const player=pawn('real-target',0,6,{faction:'player',vitals:{team:'player'}}),game=gameWith([enemy,player]);let directDamage=0;player.vitals={state:{dead:false},applyDamage(){directDamage++;}};
  const body=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshBasicMaterial());body.position.y=1;player.owner.add(body);player.owner.userData.damageable={health:100,maxHealth:100,team:'player',pawnId:player.id};game.world.registry=[player.owner];game.core.scene.updateMatrixWorld(true);
  armedRig(game,enemy,{preset:'rifle',damage:24,magazine:30,spreadHip:0,spreadAds:0,fireRate:20});
  const fired=[];const onEvent=event=>{if(event.detail&&event.detail.type==='OnWeaponFired')fired.push(event.detail);};addEventListener('lk-pawn-event',onEvent);
  const system=BEHAVIOR.create(game);system.update(.1);
  assert.ok(player.owner.userData.damageable.health<100,'hitscan weapon owns the damage path');assert.equal(directDamage,0,'AI must never call target vitals directly');assert.equal(fired.at(-1).pawnId,'real-shooter');
  removeEventListener('lk-pawn-event',onEvent);system.dispose();body.geometry.dispose();body.material.dispose();
});

console.log('Actor Combat / Behavior tests passed.');
