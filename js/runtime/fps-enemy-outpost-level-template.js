/* =========================================================
   LOT KING - FPS Enemy Outpost editable level template

   This file only composes the arena, ordinary reusable AI Character Logic
   Elements and the mission. Runtime decisions live in actor-behavior.js and
   weapon state lives behind actor-combat.js.
   ========================================================= */
(function(){
'use strict';

const root=typeof window!=='undefined'?window:globalThis;
const ID='fps-enemy-outpost',SOURCE='FPS Enemy Outpost template';
const PROFILE_OPTIONS=[
  {value:'observer',label:'Observer — scout from cover, then engage'},
  {value:'aggressive',label:'Aggressive — chase and pressure'},{value:'tactical',label:'Tactical — flank and cover'},
  {value:'defensive',label:'Defensive — hold the area'},{value:'flee',label:'Flee'},
  {value:'civilian',label:'Civilian'},{value:'reactive',label:'Reactive'},
];
const REACTION_OPTIONS=[
  {value:'attack',label:'Counterattack'},{value:'cover',label:'Seek cover'},{value:'flee',label:'Flee'},
  {value:'investigate',label:'Investigate'},{value:'freeze',label:'Freeze'},{value:'ignore',label:'Ignore'},
];
const WEAPON_OPTIONS=[
  {value:'rifle',label:'Assault Rifle'},{value:'marksman',label:'Marksman Rifle'},
  {value:'shotgun',label:'Shotgun'},{value:'smg',label:'SMG'},{value:'pistol',label:'Sidearm'},
];
const RESPAWN_OPTIONS=[{value:'none',label:'Never (default)'},{value:'death',label:'At death position'},{value:'spawn',label:'At original spawn'},{value:'random',label:'Random playable position'}];

// ------------------------------------------------------------------ geography
// The facility is the FPS arena. Two more sectors are appended north of it, so
// the mission is a fight THROUGH a place rather than a skirmish in one yard.
//
//   sector 1  z  16 .. -74   the arena: staging, firing line, CQB village, range
//   sector 2  z -78 .. -140  fuel depot: tanks to sabotage, pipe runs, revetments
//   sector 3  z -144 .. -206 command post: two-storey block, courtyard, intel room
const GROUND_Y=0;
const OUTPOST_HALF_X=58;
const DEPOT_Z=-108, DEPOT_MIN_Z=-78, DEPOT_MAX_Z=-140;
const POST_Z=-172, POST_MIN_Z=-144, POST_MAX_Z=-206;
const EXTRACT=Object.freeze({x:0, y:GROUND_Y, z:-198});
const OUTPOST_GROUPS=Object.freeze({
  depot:'14 Fuel Depot', post:'15 Command Post', link:'16 Access Road',
  objectives:'13 Mission Objectives', squads:'11 Characters / Enemy Squad',
});
// Three fuel tanks: the sabotage objective. Damageable, tagged, and placed so
// none of them can be shot from the arena - the player has to enter the depot.
const FUEL_TANKS=Object.freeze([
  {id:'a', x:-22, z:DEPOT_Z+10},
  {id:'b', x:0,   z:DEPOT_Z-6},
  {id:'c', x:23,  z:DEPOT_Z+12},
]);
// Squads, each with its own posture, sector and patrol. This is the authored
// default the user gets: an outpost that is garrisoned rather than a line of
// identical guards.
const SQUADS=Object.freeze([
  {
    id:'outpost-perimeter', name:'Perimeter Watch', profile:'observer',
    // The arena end: they scout and confirm before committing, which is what
    // gives the player the first contact at range.
    area:{x:0, z:-34, radius:38}, weapons:['rifle','smg','marksman','shotgun'],
    members:[
      {p:[-14,GROUND_Y,-18], heading:0,       patrol:[{x:-14,z:-18},{x:-4,z:-27},{x:-18,z:-35}]},
      {p:[14,GROUND_Y,-24],  heading:Math.PI, patrol:[{x:14,z:-24},{x:6,z:-38},{x:19,z:-43}]},
      {p:[-8,GROUND_Y,-48],  heading:0,       patrol:[{x:-8,z:-48},{x:-20,z:-57},{x:-3,z:-64}]},
      {p:[17,GROUND_Y,-57],  heading:Math.PI, patrol:[{x:17,z:-57},{x:7,z:-65},{x:21,z:-69}]},
    ],
  },
  {
    id:'outpost-depot', name:'Depot Guard', profile:'defensive',
    // They hold the tanks. A defensive posture keeps them on the objective
    // instead of following the player back into the arena.
    // Four roles per squad, so each sector has its own close-in, mid and overwatch
    // answer rather than four copies of one guard.
    area:{x:0, z:DEPOT_Z, radius:34}, weapons:['smg','shotgun','rifle','marksman'],
    members:[
      {p:[-20,GROUND_Y,DEPOT_Z+18], heading:Math.PI, patrol:[{x:-20,z:DEPOT_Z+18},{x:-26,z:DEPOT_Z+2},{x:-12,z:DEPOT_Z+8}]},
      {p:[19,GROUND_Y,DEPOT_Z+20],  heading:Math.PI, patrol:[{x:19,z:DEPOT_Z+20},{x:27,z:DEPOT_Z+4},{x:13,z:DEPOT_Z+10}]},
      {p:[-3,GROUND_Y,DEPOT_Z-14],  heading:0,       patrol:[{x:-3,z:DEPOT_Z-14},{x:-15,z:DEPOT_Z-22},{x:9,z:DEPOT_Z-20}]},
      {p:[10,GROUND_Y,DEPOT_Z-2],   heading:-Math.PI/2, patrol:[{x:10,z:DEPOT_Z-2},{x:22,z:DEPOT_Z-10},{x:2,z:DEPOT_Z+2}]},
    ],
  },
  {
    id:'outpost-command', name:'Command Detail', profile:'tactical',
    // The last stand: they flank and use the courtyard cover, and one of them
    // holds the roof with a marksman rifle.
    area:{x:0, z:POST_Z, radius:36}, weapons:['marksman','rifle','smg','shotgun'],
    members:[
      {p:[0,GROUND_Y+4.6,POST_Z+2], heading:0, roof:true, patrol:[{x:0,z:POST_Z+2}]},
      {p:[-16,GROUND_Y,POST_Z+16],  heading:Math.PI, patrol:[{x:-16,z:POST_Z+16},{x:-24,z:POST_Z-2},{x:-8,z:POST_Z+6}]},
      {p:[17,GROUND_Y,POST_Z+14],   heading:Math.PI, patrol:[{x:17,z:POST_Z+14},{x:25,z:POST_Z-4},{x:9,z:POST_Z+4}]},
      {p:[2,GROUND_Y,POST_Z-18],    heading:0, patrol:[{x:2,z:POST_Z-18},{x:-12,z:POST_Z-24},{x:14,z:POST_Z-22}]},
    ],
  },
]);
function squadMemberCount(){ return SQUADS.reduce((total,squad)=>total+squad.members.length,0); }
const ENEMY_PALETTES=[
  {shirt:'#556b2f',shorts:'#252c23',hair:'#211b16',skin:'#d19a72'},
  {shirt:'#9a4f32',shorts:'#302724',hair:'#4b2d20',skin:'#b97855'},
  {shirt:'#315b75',shorts:'#202b35',hair:'#1c1715',skin:'#e0ad82'},
  {shirt:'#a27b28',shorts:'#353024',hair:'#5b3c24',skin:'#9f674b'},
];
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function behaviorRuntime(){return root.LK_RUNTIME_ACTOR_BEHAVIOR||null;}
function normalizeAi(pawn){
  const runtime=behaviorRuntime(),normalized=runtime&&runtime.normalizeBehavior?runtime.normalizeBehavior(pawn):clone(pawn&&pawn.config&&(pawn.config.behavior||pawn.config.enemyAi)||pawn&&pawn.behavior||pawn&&pawn.enemyAi||{});
  const perception=normalized&&normalized.perception||{},tactics=normalized&&normalized.tactics||{};
  return Object.assign({},normalized,perception,tactics,{flankStrength:tactics.flankBias==null?normalized&&normalized.flankStrength:tactics.flankBias});
}
function createEnemyAi(GAME){
  const runtime=behaviorRuntime();
  if(runtime&&runtime.create)return runtime.create(GAME);
  return Object.freeze({update:()=>false,stepEnemy:()=>null,normalizeAi,records:new Map()});
}
function install(GAME){
  const runtime=behaviorRuntime(),system=runtime&&runtime.install?runtime.install(GAME):createEnemyAi(GAME);
  if(GAME){GAME.systems=GAME.systems||{};GAME.systems.fpsEnemyAi=system;}
  return system;
}
function variable(graph,name,binding,value,type,label,category,extra){
  graph.variables=Array.isArray(graph.variables)?graph.variables:[];
  let item=graph.variables.find(entry=>entry&&(entry.name===name||entry.binding===binding));
  if(!item){item={name,type,value,exposed:true,binding,label,category};graph.variables.push(item);}
  Object.assign(item,{name,type,value,exposed:true,binding,label,category},extra||{});return item;
}
// `spec.squad` carries the posture, the sector and the weapon table. A member
// with no squad falls back to the original perimeter defaults, so an old saved
// project that calls this with two arguments still builds the same enemy.
function enemyGraph(index,spec){
  const templates=root.LK_LOGIC_TEMPLATES;
  const template=templates&&templates.get&&(templates.get('logic-template-ai-character')||templates.get('logic-template-player-character-third-person')||templates.get('logic-template-player-character-normal'));
  if(!(template&&template.graph))return null;
  const squad=spec&&spec.squad||null;
  const weapons=squad&&Array.isArray(squad.weapons)&&squad.weapons.length?squad.weapons:['rifle','smg','marksman','shotgun'];
  const seat=Number.isFinite(Number(spec&&spec.memberIndex))?Number(spec.memberIndex):index;
  const graph=clone(template.graph),weaponPreset=weapons[seat%weapons.length],palette=ENEMY_PALETTES[seat%ENEMY_PALETTES.length];
  // This squad authors pure presets. The reusable TPS template also exposes
  // rifle-tuned per-stat bindings; leaving those in an instance would replay
  // them after the preset and silently turn SMG/marksman/shotgun into hybrids.
  graph.variables=(Array.isArray(graph.variables)?graph.variables:[]).filter(item=>{
    const binding=String(item&&item.binding||'');
    return binding.indexOf('firstPerson.weapon.')!==0||binding==='firstPerson.weapon.preset';
  });
  const profile=squad&&squad.profile||'observer';
  const area=squad&&squad.area||{x:0,z:-34,radius:34};
  // The action area is authored around the SECTOR the squad garrisons, expressed
  // as an offset from the member's own spawn, so a guard defends the depot rather
  // than a circle centred on wherever it happens to stand.
  const offset={x:Number((area.x-spec.p[0]).toFixed(3)),y:0,z:Number((area.z-spec.p[2]).toFixed(3))};
  const marksman=weaponPreset==='marksman', shotgun=weaponPreset==='shotgun';
  const behavior={
    schemaVersion:2,enabled:true,profile,faction:'enemy',hostileFactions:['player'],
    squadId:squad&&squad.id||'outpost-squad',squadIndex:index,tag:'enemy',
    perception:{sightRange:marksman?52:34,hearingRange:24,memorySeconds:4,confirmSeconds:2.4+index*.25,fieldOfViewDeg:marksman?86:108,requireLineOfSight:true},
    // Reach is what the weapon can actually do; the preferred range is where the
    // actor wants to stand. Both matter now that closing only happens when the
    // target is out of reach.
    tactics:{attackRange:shotgun?18:(marksman?60:34),preferredRange:shotgun?10:(marksman?30:16),
      guardRadius:Math.max(18,Number(area.radius)||34),coverBias:profile==='defensive'?.96:.94,
      flankBias:profile==='tactical'?.62:.32,accuracy:marksman?.7:.56,
      burstMin:marksman?1:1,burstMax:marksman?1:3,burstPause:marksman?1.9:1.15},
    equipment:{useMedkits:true,medkits:1,healBelow:.38,healAmount:45,useGrenades:!marksman,grenades:marksman?0:2,grenadeMinRange:9,grenadeMaxRange:30,grenadeHiddenSeconds:1.4,grenadeCooldown:8},
    fear:{enabled:true,threshold:.72,decay:.1},reactions:{onDamage:'cover',onWeaponFired:'investigate',onExplosion:'cover',onCharacterDied:'cover'},
    actionArea:{enabled:true,shape:'circle',radius:Math.max(12,Number(area.radius)||34),
      width:68,depth:68,height:12,offset,
      // A garrison holds its ground: it observes, engages, and returns rather
      // than being drawn out of its sector one body at a time.
      action:profile==='observer'?'observe':'cover',exitAction:'return',showInEditor:true},
    patrol:clone(spec.patrol),
  };
  graph.name=(squad&&squad.name||'Outpost Enemy')+' '+(index+1);
  graph.characterPawn=graph.characterPawn||{};
  const pawn=graph.characterPawn;
  pawn.id=(squad&&squad.id||'outpost-enemy')+'-'+(index+1);pawn.playerId=null;pawn.possessed=false;pawn.faction='enemy';
  pawn.spawn={x:spec.p[0],y:spec.p[1],z:spec.p[2],heading:spec.heading};
  pawn.movement=Object.assign({},pawn.movement||{},{walkSpeed:2.2,runSpeed:4.8,sprintMultiplier:1,acceleration:15,turnRate:12,inputMode:'heading',facingMode:'heading'});
  pawn.vitals=Object.assign({},pawn.vitals||{},{enabled:true,maxHealth:100,maxArmor:30,armor:15,armorAbsorb:.35,regen:0,regenDelay:999,respawnMode:'none',respawnOnDeath:false,respawnDelay:2.5,respawnRandomRadius:35,team:'enemy',deathPhysics:{enabled:true,mode:'auto',profile:'humanoid'}});
  pawn.behavior=behavior;
  // Serialized alias for old projects/plugins. The global runtime always prefers
  // `behavior` when both are present, so there is still one authoritative config.
  pawn.enemyAi={enabled:true,profile:behavior.profile,faction:'enemy',hostileFactions:['player'],squadId:behavior.squadId,squadIndex:index,tag:'enemy',sightRange:behavior.perception.sightRange,hearingRange:behavior.perception.hearingRange,attackRange:behavior.tactics.attackRange,preferredRange:behavior.tactics.preferredRange,guardRadius:behavior.tactics.guardRadius,memorySeconds:behavior.perception.memorySeconds,coverBias:behavior.tactics.coverBias,flankStrength:behavior.tactics.flankBias,patrol:clone(spec.patrol)};
  pawn.firstPerson=Object.assign({enabled:true,eyeHeight:1.62,pitchMinDeg:-80,pitchMaxDeg:80,fov:68,thirdPerson:{distance:3.3,height:1.5,shoulder:.62}},pawn.firstPerson||{},{enabled:true,view:'third',allowViewToggle:false,hideOwnBody:false,showLegs:false,weapon:Object.assign({},pawn.firstPerson&&pawn.firstPerson.weapon||{},{id:'primary',preset:weaponPreset})});
  pawn.combat={enabled:true,weapon:{preset:weaponPreset}};
  pawn.inventory=Object.assign({mode:'backpack',weaponSlots:7,packSize:8,allowDrop:true},pawn.inventory||{},{mode:'backpack',autoEquip:false,items:[{kind:'health',name:'AI Medkit',amount:45}]});
  pawn.loadout=[{preset:index%2?'pistol':'knife'},{preset:'grenade'}];
  pawn.cover=Object.assign({enabled:true,button:'takeCover',reach:1.1,hugDistance:.42,toggle:true,autoAttach:false,slideSpeed:.78,blend:12,detachThreshold:.6,autoShoulder:true,fire:{exposure:1,blindEnabled:true,blindSpreadScale:3.2,popTime:.55}},pawn.cover||{});
  pawn.appearance=Object.assign({},pawn.appearance||{},{shirtColor:palette.shirt,shortsColor:palette.shorts,hairColor:palette.hair,skinColor:palette.skin});

  variable(graph,'ControllerPlayerId','playerId',-1,'number','Controller Player ID','Input',{ui:'player-id'});
  variable(graph,'BehaviorEnabled','behavior.enabled',true,'boolean','AI Enabled','AI / Behavior');
  variable(graph,'BehaviorProfile','behavior.profile',behavior.profile,'string','Behavior Profile','AI / Behavior',{ui:'select',options:PROFILE_OPTIONS});
  variable(graph,'Faction','behavior.faction','enemy','string','Faction','AI / Allegiance');
  variable(graph,'HostileFactions','behavior.hostileFactions','player','string','Hostile Factions','AI / Allegiance');
  variable(graph,'SquadId','behavior.squadId',behavior.squadId,'string','Squad ID','AI / Allegiance');
  variable(graph,'BehaviorTag','behavior.tag','enemy','string','Mission Tag','AI / Allegiance');
  variable(graph,'SightRange','behavior.perception.sightRange',behavior.perception.sightRange,'number','Sight Range','AI / Perception',{min:1,max:250,step:.5});
  variable(graph,'HearingRange','behavior.perception.hearingRange',behavior.perception.hearingRange,'number','Hearing Range','AI / Perception',{min:0,max:250,step:.5});
  variable(graph,'MemorySeconds','behavior.perception.memorySeconds',behavior.perception.memorySeconds,'number','Target Memory','AI / Perception',{min:0,max:60,step:.1});
  variable(graph,'FieldOfViewDeg','behavior.perception.fieldOfViewDeg',behavior.perception.fieldOfViewDeg,'number','Field of View (deg)','AI / Perception',{min:10,max:360,step:1});
  variable(graph,'ConfirmSeconds','behavior.perception.confirmSeconds',behavior.perception.confirmSeconds,'number','Observe Before Engage (s)','AI / Perception',{min:0,max:30,step:.1});
  variable(graph,'AttackRange','behavior.tactics.attackRange',behavior.tactics.attackRange,'number','Attack Range','AI / Tactics',{min:0,max:150,step:.5});
  variable(graph,'PreferredRange','behavior.tactics.preferredRange',behavior.tactics.preferredRange,'number','Preferred Range','AI / Tactics',{min:1,max:100,step:.5});
  variable(graph,'GuardRadius','behavior.tactics.guardRadius',behavior.tactics.guardRadius,'number','Guard Radius','AI / Tactics',{min:0,max:500,step:1});
  variable(graph,'CoverBias','behavior.tactics.coverBias',behavior.tactics.coverBias,'number','Cover Bias','AI / Tactics',{min:0,max:1,step:.05});
  variable(graph,'FlankBias','behavior.tactics.flankBias',behavior.tactics.flankBias,'number','Flank Bias','AI / Tactics',{min:0,max:1,step:.05});
  variable(graph,'AiMedkits','behavior.equipment.medkits',1,'number','Starting Medkits','AI / Equipment',{min:0,max:20,step:1});
  variable(graph,'AiHealBelow','behavior.equipment.healBelow',.38,'number','Use Medkit Below Health','AI / Equipment',{min:.05,max:.95,step:.05});
  variable(graph,'AiGrenades','behavior.equipment.grenades',behavior.equipment.grenades,'number','Starting Grenades','AI / Equipment',{min:0,max:20,step:1});
  variable(graph,'AiGrenadeMinRange','behavior.equipment.grenadeMinRange',9,'number','Grenade Minimum Range','AI / Equipment',{min:1,max:100,step:.5});
  variable(graph,'AiGrenadeMaxRange','behavior.equipment.grenadeMaxRange',30,'number','Grenade Maximum Range','AI / Equipment',{min:2,max:200,step:.5});
  variable(graph,'AiGrenadeHiddenSeconds','behavior.equipment.grenadeHiddenSeconds',1.4,'number','Target Hidden Before Grenade','AI / Equipment',{min:.25,max:20,step:.1});
  variable(graph,'ActionAreaEnabled','behavior.actionArea.enabled',true,'boolean','Smart Action Area','AI / Action Area');
  variable(graph,'ActionAreaShape','behavior.actionArea.shape','circle','string','Area Shape','AI / Action Area',{ui:'select',options:[{value:'circle',label:'Circle'},{value:'box',label:'Box'}]});
  variable(graph,'ActionAreaRadius','behavior.actionArea.radius',behavior.actionArea.radius,'number','Circle Radius','AI / Action Area',{min:1,max:500,step:.5});
  variable(graph,'ActionAreaWidth','behavior.actionArea.width',68,'number','Box Width','AI / Action Area',{min:1,max:1000,step:.5});
  variable(graph,'ActionAreaDepth','behavior.actionArea.depth',68,'number','Box Depth','AI / Action Area',{min:1,max:1000,step:.5});
  variable(graph,'ActionAreaHeight','behavior.actionArea.height',behavior.actionArea.height,'number','Area Height','AI / Action Area',{min:.5,max:250,step:.5});
  variable(graph,'ActionAreaOffsetX','behavior.actionArea.offset.x',behavior.actionArea.offset.x,'number','Area Offset X','AI / Action Area',{min:-500,max:500,step:.5});
  variable(graph,'ActionAreaOffsetY','behavior.actionArea.offset.y',0,'number','Area Offset Y','AI / Action Area',{min:-250,max:250,step:.5});
  variable(graph,'ActionAreaOffsetZ','behavior.actionArea.offset.z',behavior.actionArea.offset.z,'number','Area Offset Z','AI / Action Area',{min:-500,max:500,step:.5});
  variable(graph,'ActionAreaAction','behavior.actionArea.action',behavior.actionArea.action,'string','When Target Enters','AI / Action Area',{ui:'select',options:[{value:'observe',label:'Observe, hide, then engage'},{value:'investigate',label:'Investigate without firing'},{value:'cover',label:'Seek cover, then engage'},{value:'attack',label:'Attack immediately'},{value:'flee',label:'Flee'},{value:'ignore',label:'Ignore'}]});
  variable(graph,'ActionAreaExitAction','behavior.actionArea.exitAction','return','string','When Target Exits','AI / Action Area',{ui:'select',options:[{value:'return',label:'Return to guard origin'},{value:'forget',label:'Forget target'},{value:'search',label:'Search last position'},{value:'hold',label:'Hold position'}]});
  variable(graph,'ActionAreaShowInEditor','behavior.actionArea.showInEditor',true,'boolean','Show Area + FOV in Editor','AI / Action Area');
  variable(graph,'DamageReaction','behavior.reactions.onDamage','cover','string','When Damaged','AI / Reactions',{ui:'select',options:REACTION_OPTIONS});
  variable(graph,'ExplosionReaction','behavior.reactions.onExplosion','cover','string','On Explosion','AI / Reactions',{ui:'select',options:REACTION_OPTIONS});
  variable(graph,'RespawnMode','vitals.respawnMode','none','string','Respawn After Death','Character / Vitals',{ui:'select',options:RESPAWN_OPTIONS});
  variable(graph,'RespawnDelay','vitals.respawnDelay',2.5,'number','Respawn Delay (s)','Character / Vitals',{min:0,max:60,step:.1});
  variable(graph,'WeaponPreset','firstPerson.weapon.preset',weaponPreset,'string','Starting Weapon','Combat / Weapon',{ui:'select',options:WEAPON_OPTIONS});
  variable(graph,'SecondaryWeaponPreset','loadout.0.preset',index%2?'pistol':'knife','string','Secondary Weapon','Combat / Equipment',{ui:'select',options:WEAPON_OPTIONS.concat([{value:'knife',label:'Combat Knife'}])});
  variable(graph,'ShirtColor','appearance.shirtColor',palette.shirt,'string','Top Color','Appearance',{ui:'color'});
  variable(graph,'PantsColor','appearance.shortsColor',palette.shorts,'string','Pants Color','Appearance',{ui:'color'});
  variable(graph,'HairColor','appearance.hairColor',palette.hair,'string','Hair Color','Appearance',{ui:'color'});
  variable(graph,'SkinColor','appearance.skinColor',palette.skin,'string','Skin Color','Appearance',{ui:'color'});
  graph.nodes=[{id:'on_start',type:'event.onStart',x:80,y:100,data:{}},{id:'ready',type:'debug.print',x:360,y:100,data:{message:'Reusable AI Character active: '+behavior.profile+', '+weaponPreset+'.',duration:1.5}}];
  graph.edges=[{id:'ready_edge',from:{node:'on_start',pin:'then'},to:{node:'ready',pin:'exec'}}];
  graph.comments=[{id:'ai_help',title:'Reusable AI Character. Profile, faction, squad, patrol and independent weapon/loadout are ordinary per-instance data; assign any compatible rigged GLB or Motion Set.',x:40,y:35,w:980,h:240,color:'#ef4444'}];
  return graph;
}

// ================================================================ 02 sectors
// Built with the arena's own builder, so the depot and the command post wear the
// same material classes and the same procedural grain as the facility they
// extend, rather than being a second visual language bolted onto it.
function buildDepot(build){
  const g=OUTPOST_GROUPS.depot;
  // Apron and the access road that links it back to the arena.
  build.box('Depot Apron',[0,GROUND_Y-.05,DEPOT_Z],[92,.1,64],'concreteFloor',true,{group:g,castShadow:false});
  build.box('Access Road',[0,GROUND_Y-.04,-76],[16,.08,10],'asphalt',false,{group:g,castShadow:false});
  // Revetment walls: the cover that makes the depot a fight instead of a field.
  [[-34,DEPOT_Z+22],[34,DEPOT_Z+22],[-34,DEPOT_Z-20],[34,DEPOT_Z-20]].forEach((at,index)=>{
    build.box('Depot Revetment '+(index+1),[at[0],GROUND_Y+1.1,at[1]],[16,2.2,1.2],'sandbag',true,{group:g,seed:index});
  });
  [[-12,DEPOT_Z+24],[13,DEPOT_Z+24],[-8,DEPOT_Z-24],[9,DEPOT_Z-24]].forEach((at,index)=>{
    build.box('Depot Barricade '+(index+1),[at[0],GROUND_Y+.7,at[1]],[4.4,1.4,1],'sandbag',true,{group:g,seed:index+8});
  });
  // Containers, staggered so no single sightline crosses the whole depot.
  [[-27,DEPOT_Z+6,0],[26,DEPOT_Z-2,0],[-14,DEPOT_Z-18,Math.PI/2],[15,DEPOT_Z+16,Math.PI/2]].forEach((at,index)=>{
    build.box('Depot Container '+(index+1),[at[0],GROUND_Y+1.3,at[1]],[6.1,2.6,2.44],index%2?'containerRed':'containerBlue',true,{group:g,rotation:[0,at[2],0],seed:index});
  });
  // The tanks themselves, plus their gantries and pipe runs.
  FUEL_TANKS.forEach((tank,index)=>{
    build.cylinder('Fuel Tank '+tank.id.toUpperCase(),[tank.x,GROUND_Y+3.2,tank.z],3.4,6.4,'steelPale',true,{group:g,seed:index});
    build.cylinder('Tank Cap '+tank.id.toUpperCase(),[tank.x,GROUND_Y+6.6,tank.z],1.1,.5,'steelDark',false,{group:g});
    build.box('Tank Bund '+tank.id.toUpperCase(),[tank.x,GROUND_Y+.35,tank.z],[9.4,.7,9.4],'concreteFloor',true,{group:g,seed:index+3});
    build.box('Tank Gantry '+tank.id.toUpperCase(),[tank.x,GROUND_Y+2.2,tank.z+4.6],[3.4,.2,1.2],'tread',true,{group:g});
  });
  build.box('Depot Pipe Run North',[0,GROUND_Y+1.6,DEPOT_Z-13],[48,.5,.5],'steelDark',false,{group:g});
  build.box('Depot Pipe Run South',[0,GROUND_Y+1.6,DEPOT_Z+19],[48,.5,.5],'steelDark',false,{group:g});
  // Pump house: an interior to clear, with a doorway rather than a solid box.
  build.box("Pump House West Wall",[-31,GROUND_Y+1.7,DEPOT_Z-32],[.4,3.4,9],'concreteWall',true,{group:g});
  build.box("Pump House East Wall",[-21,GROUND_Y+1.7,DEPOT_Z-32],[.4,3.4,9],'concreteWall',true,{group:g});
  build.box("Pump House Back Wall",[-26,GROUND_Y+1.7,DEPOT_Z-36.5],[10,3.4,.4],'concreteWall',true,{group:g});
  build.box("Pump House Front Left",[-29.4,GROUND_Y+1.7,DEPOT_Z-27.5],[3.2,3.4,.4],'concreteWall',true,{group:g});
  build.box("Pump House Front Right",[-22.6,GROUND_Y+1.7,DEPOT_Z-27.5],[3.2,3.4,.4],'concreteWall',true,{group:g});
  build.box('Pump House Roof',[-26,GROUND_Y+3.5,DEPOT_Z-32],[10.4,.35,9.4],'corrugatedRoof',true,{group:g});
  // Floodlight masts, so the sector reads at the level's late-afternoon sun.
  [[-40,DEPOT_Z+12],[40,DEPOT_Z+12],[-40,DEPOT_Z-16],[40,DEPOT_Z-16]].forEach((at,index)=>{
    build.cylinder('Depot Mast '+(index+1),[at[0],GROUND_Y+4.5,at[1]],.22,9,'steelDark',true,{group:g});
    build.box('Depot Lamp '+(index+1),[at[0],GROUND_Y+8.9,at[1]],[1.5,.4,.6],'steelPale',false,{group:g});
  });
}
function buildCommandPost(build){
  const g=OUTPOST_GROUPS.post;
  build.box('Post Apron',[0,GROUND_Y-.05,POST_Z],[86,.1,62],'concreteFloor',true,{group:g,castShadow:false});
  build.box('Depot Link Road',[0,GROUND_Y-.04,-142],[14,.08,8],'asphalt',false,{group:g,castShadow:false});
  // The block house: two storeys, a doorway, window openings and a roof deck the
  // marksman holds. Walls are separate so the openings are real.
  const cx=0, cz=POST_Z+2, halfW=11, halfD=8, wallH=2.6;
  build.box('Block House Floor',[cx,GROUND_Y+.1,cz],[halfW*2,.2,halfD*2],'concreteFloor',true,{group:g});
  build.box('Block House West Wall',[cx-halfW,GROUND_Y+wallH/2+.2,cz],[.5,wallH,halfD*2],'block',true,{group:g,seed:1});
  build.box('Block House East Wall',[cx+halfW,GROUND_Y+wallH/2+.2,cz],[.5,wallH,halfD*2],'block',true,{group:g,seed:2});
  build.box('Block House Back Wall',[cx,GROUND_Y+wallH/2+.2,cz-halfD],[halfW*2,wallH,.5],'block',true,{group:g,seed:3});
  build.box('Block House Front Left',[cx-7.2,GROUND_Y+wallH/2+.2,cz+halfD],[7.6,wallH,.5],'block',true,{group:g,seed:4});
  build.box('Block House Front Right',[cx+7.2,GROUND_Y+wallH/2+.2,cz+halfD],[7.6,wallH,.5],'block',true,{group:g,seed:5});
  build.box('Block House Lintel',[cx,GROUND_Y+2.6,cz+halfD],[3.2,.6,.5],'block',true,{group:g,seed:6});
  build.box('Block House Interior Wall',[cx-3,GROUND_Y+wallH/2+.2,cz-3],[.4,wallH,10],'block',true,{group:g,seed:7});
  build.box('Block House Deck',[cx,GROUND_Y+3.1,cz],[halfW*2+.6,.4,halfD*2+.6],'concreteSlab',true,{group:g});
  // Roof parapet: the marksman has cover up there, and it stops a fall.
  [[0,cz-halfD-.1,halfW*2+.6,.5],[0,cz+halfD+.1,halfW*2+.6,.5]].forEach((at,index)=>{
    build.box('Deck Parapet '+(index+1),[at[0],GROUND_Y+3.75,at[1]],[at[2],.9,at[3]],'concreteWall',true,{group:g});
  });
  [[cx-halfW-.1,cz],[cx+halfW+.1,cz]].forEach((at,index)=>{
    build.box('Deck Parapet Side '+(index+1),[at[0],GROUND_Y+3.75,at[1]],[.5,.9,halfD*2+.6],'concreteWall',true,{group:g});
  });
  // The stair up to the deck, as a run of steps a character can actually climb.
  for(let step=0;step<7;step++){
    build.box('Post Stair '+(step+1),[cx+halfW+2.2,GROUND_Y+.2+step*.45,cz-halfD+1.2+step*.9],[3,.45,.9],'tread',true,{group:g});
  }
  // Courtyard cover, so the approach is not an open run at a doorway.
  [[-19,POST_Z+20],[18,POST_Z+21],[-9,POST_Z+14],[11,POST_Z+15]].forEach((at,index)=>{
    build.box('Post Cover '+(index+1),[at[0],GROUND_Y+.75,at[1]],[3.6,1.5,1.1],index%2?'sandbag':'concreteWall',true,{group:g,seed:index});
  });
  [[-24,POST_Z-10,0],[24,POST_Z-12,0],[-6,POST_Z-22,Math.PI/2]].forEach((at,index)=>{
    build.box('Post Container '+(index+1),[at[0],GROUND_Y+1.3,at[1]],[6.1,2.6,2.44],'containerRed',true,{group:g,rotation:[0,at[2],0],seed:index+4});
  });
  build.cylinder('Command Mast',[0,GROUND_Y+8,POST_Z-24],.3,16,'steelDark',true,{group:g});
  // The extraction pad at the far north.
  build.box('Extraction Pad',[EXTRACT.x,GROUND_Y+.06,EXTRACT.z],[16,.12,16],'asphalt',true,{group:OUTPOST_GROUPS.objectives,castShadow:false});
}

function buildScene(baseScene){
  const arena=root.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE;
  const scene=arena&&arena.buildScene?arena.buildScene(baseScene):(baseScene||{version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}});
  // Enemy Outpost is the default full Character demonstration, not the
  // dedicated arms-only FPS sample. It reuses the arena geometry but starts
  // with the same TPS body, weapon and animation rig that remains visible when
  // Camera Mode moves to eye height. `fps-shooter-test` intentionally keeps the
  // classic arms presentation as the explicit single-purpose FPS example.
  const playerEntry=(scene.added||[]).find(entry=>entry&&entry.graph&&entry.graph.characterPawn&&entry.graph.characterPawn.firstPerson&&entry.graph.characterPawn.playerId!==null);
  if(playerEntry){
    const view=playerEntry.graph.characterPawn.firstPerson;
    view.view='third';
    view.viewPawn={schemaVersion:1,kind:'none',enabled:false,showLegs:false};
    // Keep the legacy mirrors coherent for older exported runtimes and tools
    // that still inspect the v0 presentation fields directly.
    view.presentation='body';view.hideOwnBody=false;view.showLegs=false;
    view.thirdPerson=Object.assign({},view.thirdPerson||{},{autoDistance:false,collisionMode:'fixed'});
    const presentation=(playerEntry.graph.variables||[]).find(variable=>variable&&variable.binding==='firstPerson.viewPawn.kind');
    if(presentation)presentation.value='none';
    playerEntry.name='Player Character (Third Person / Full Body Eye)';
  }
  // The two new sectors, in the facility's own material language.
  if(arena&&arena.createBuilder){
    const build=arena.createBuilder(scene,{prefix:'fps_outpost',source:SOURCE});
    buildDepot(build);
    buildCommandPost(build);
  }

  // -------------------------------------------------------------- 03 garrison
  let placed=0;
  SQUADS.forEach(squad=>{
    squad.members.forEach(member=>{
      const index=placed++;
      const graph=enemyGraph(index,Object.assign({},member,{squad,memberIndex:squad.members.indexOf(member)}));
      if(!graph)return;
      const label=squad.name+' '+(index+1);
      scene.added.push({id:'fps_outpost_enemy_'+(index+1),kind:'logicElement',name:label,collide:false,graph,enabled:true,runInEditorPreview:true,
        asset:{key:'logic:template:logic-template-ai-character',name:label,source:SOURCE},
        t:{p:member.p.slice(),r:[0,member.heading,0],s:[1,1,1],v:true},templateGroup:OUTPOST_GROUPS.squads});
    });
  });

  // ------------------------------------------------------------ 04 objectives
  // The three tanks are damageable mission targets, tagged so the objective
  // counts them without naming them one by one.
  FUEL_TANKS.forEach((tank,index)=>{
    scene.added.push({id:'fps_outpost_tank_target_'+tank.id,kind:'primitive',prim:'box',name:'Fuel Tank Valve '+tank.id.toUpperCase(),collide:true,
      props:{color:0xd94f2b,roughness:.5,metalness:.35,emissive:0xd94f2b,emissiveIntensity:.25,centered:true},
      damageable:{enabled:true,health:120,tag:'fuel-tank',points:400,explodeRadius:7,explodeDamage:90},
      t:{p:[tank.x,GROUND_Y+1.5,tank.z+3.5],r:[0,0,0],s:[.6,.6,.35],v:true},
      asset:{key:'primitive:box',name:'Fuel Tank Valve '+tank.id.toUpperCase(),source:SOURCE},templateGroup:OUTPOST_GROUPS.objectives});
  });
  // The intel: an ordinary item pickup in the command post, tagged for the
  // objective, so it is collected with the same verb as any other pickup.
  scene.added.push({id:'fps_outpost_intel',kind:'primitive',prim:'box',name:'Outpost Intel Case',collide:false,
    props:{color:0x38bdf8,roughness:.4,metalness:.2,emissive:0x38bdf8,emissiveIntensity:.5,centered:true},
    item:{kind:'objective',name:'Outpost Intel',tag:'intel',radius:1.6,respawn:0},
    t:{p:[-6,GROUND_Y+1.05,POST_Z-2],r:[0,.5,0],s:[.5,.35,.7],v:true},
    asset:{key:'primitive:box',name:'Outpost Intel Case',source:SOURCE},templateGroup:OUTPOST_GROUPS.objectives});
  scene.added.push({id:'fps_outpost_extract',kind:'primitive',prim:'torus',name:'Extraction Zone',collide:false,props:{color:0x22c55e,roughness:.35,metalness:.05,emissive:0x22c55e,emissiveIntensity:.65,centered:true},t:{p:[EXTRACT.x,.12,EXTRACT.z],r:[Math.PI/2,0,0],s:[2.8,.18,2.8],v:true},asset:{key:'primitive:torus',name:'Extraction Zone',source:SOURCE},templateGroup:OUTPOST_GROUPS.objectives});
  const missions=root.LK_LOGIC_TEMPLATES_MISSION;
  if(missions&&missions.makeMissionGraph){
    // A phased mission: fight through the perimeter, cripple the depot, take the
    // intel out of the command post, then leave. `sequence` is what makes the
    // HUD read as a briefing rather than as four unrelated counters.
    const graph=missions.makeMissionGraph({missionId:ID,title:'Blackpine Outpost',subtitle:'Sabotage the depot, recover the intel, then extract north',mode:'sequence',timeLimit:600,failOnTimeout:true,objectives:[
      {id:'breach_perimeter',title:'Break the perimeter watch',kind:'eliminate',count:SQUADS[0].members.length,order:0,points:400,target:{tag:'enemy'}},
      {id:'sabotage_depot',title:'Destroy the three fuel tanks',kind:'eliminate',count:FUEL_TANKS.length,order:1,points:700,target:{tag:'fuel-tank'}},
      {id:'recover_intel',title:'Recover the intel from the command post',kind:'collect',count:1,order:2,points:600,target:{tag:'intel'}},
      {id:'extract',title:'Reach the north extraction zone',kind:'reach',order:3,points:500,target:{radius:5.5,position:{x:EXTRACT.x,y:GROUND_Y,z:EXTRACT.z}}},
      {id:'stay_alive',title:'Do not get taken down',kind:'avoid',order:4,points:300,target:{tag:'player-down'}},
    ]});
    scene.added.push({id:'fps_outpost_mission',kind:'logicElement',name:'FPS Outpost Mission Director',collide:false,graph,enabled:true,runInEditorPreview:true,asset:{key:'logic:template:logic-template-mission-director',name:'FPS Outpost Mission Director',source:SOURCE},t:{p:[0,0,10],r:[0,0,0],s:[1,1,1],v:true},templateGroup:OUTPOST_GROUPS.objectives});
  }
  // The playable area now reaches the command post, or movement would stop the
  // player at the arena wall and the mission would be unfinishable.
  scene.characterGround=Object.assign({},scene.characterGround||{},{
    type:'flat',baseY:GROUND_Y,
    minX:-OUTPOST_HALF_X+1,maxX:OUTPOST_HALF_X-1,
    minZ:POST_MAX_Z+1,maxZ:(arena&&arena.ARENA_MAX_Z!=null?arena.ARENA_MAX_Z:16)-1,
  });
  scene.env=Object.assign({},scene.env||{},{rain:Object.assign({},scene.env&&scene.env.rain||{},{enabled:false,intensity:0,sound:0}),volClouds:Object.assign({enabled:false},scene.env&&scene.env.volClouds||{}),weather:{type:'clear',intensity:0,surface:'concrete'}});
  scene.template=Object.assign({},scene.template||{},{id:ID,name:'FPS Enemy Outpost',version:5,nativeEditable:true,gameMode:ID,objectiveSystem:true,actorBehavior:true,enemyAi:true,
    sectors:['staging and firing line','fuel depot','command post'],
    extent:{x:OUTPOST_HALF_X*2,z:Math.abs(POST_MAX_Z-((arena&&arena.ARENA_MAX_Z!=null?arena.ARENA_MAX_Z:16)))},
    notes:'Three sectors: the arena facility, a fuel depot to sabotage and a command post holding the intel. Twelve reusable AI Characters in three squads - a scouting perimeter watch, a defensive depot guard and a flanking command detail with a marksman on the roof deck - each garrisoning its own editable smart action area and owning independent weapon, inventory, faction, squad, vitals and death physics. Every prop, enemy and objective is an ordinary editable scene object.'});
  return scene;
}

root.LK_RUNTIME_FPS_ENEMY_OUTPOST_LEVEL_TEMPLATE=Object.freeze({id:ID,name:'FPS Enemy Outpost',buildScene,enemyGraph,normalizeAi,createEnemyAi,install,
  SQUADS,FUEL_TANKS,EXTRACT,OUTPOST_HALF_X,OUTPOST_GROUPS,DEPOT_Z,POST_Z,squadMemberCount});
if(root.LK_LEVEL_TEMPLATES&&root.LK_LEVEL_TEMPLATES.register)root.LK_LEVEL_TEMPLATES.register({id:ID,name:'FPS Enemy Outpost',nameIt:'FPS - Avamposto con nemici intelligenti',category:'Shooter',order:330,ground:'plane',keepBuiltinPlayer:false,description:'Three-sector full-character shooter outpost: third person by default, unified full-body eye view on toggle, and twelve armed AI Characters.',descriptionIt:'Avamposto shooter a personaggio completo su tre settori: terza persona predefinita, visuale occhi full-body unificata al cambio camera e dodici Character AI armati.',build:buildScene});
if(root.LOT_KING)install(root.LOT_KING);
if(typeof module!=='undefined'&&module.exports)module.exports=root.LK_RUNTIME_FPS_ENEMY_OUTPOST_LEVEL_TEMPLATE;
})();
