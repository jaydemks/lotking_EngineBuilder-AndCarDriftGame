/* =========================================================
   LOT KING - Animal Pawn Logic Element templates
   ========================================================= */
(function(){
'use strict';

function node(id,type,x,y,data){return {id,type,x:x||0,y:y||0,data:Object.assign({},data||{})};}
function edge(id,fromNode,fromPin,toNode,toPin){return {id,from:{node:fromNode,pin:fromPin},to:{node:toNode,pin:toPin}};}
const LABELS=Object.freeze({cat:'Cat',dog:'Dog',horse:'Horse',generic:'Generic Animal'});
const VOICES=Object.freeze({cat:'Meow',dog:'Bark',horse:'Neigh',generic:'Call'});
const SPECIES_OPTIONS=Object.freeze([{value:'cat',label:'Cat'},{value:'dog',label:'Dog'},{value:'horse',label:'Horse'},{value:'generic',label:'Generic / custom quadruped'}]);
const BEHAVIOR_PROFILE_OPTIONS=Object.freeze([
  {value:'observer',label:'Observer / stalking'},
  {value:'aggressive',label:'Aggressive / territorial'},{value:'tactical',label:'Tactical / trained'},
  {value:'defensive',label:'Defensive / guard'},{value:'flee',label:'Flee'},
  {value:'civilian',label:'Civilian / ambient'},{value:'reactive',label:'Reactive'},
]);
const BEHAVIOR_REACTION_OPTIONS=Object.freeze([
  {value:'attack',label:'Defend / attack'},{value:'cover',label:'Seek shelter'},
  {value:'flee',label:'Flee'},{value:'investigate',label:'Investigate'},
  {value:'freeze',label:'Freeze'},{value:'ignore',label:'Ignore'},
]);
const ACTION_SLOTS=Object.freeze([
  ['AnimIdle','idle','Idle','Looping in-place idle.'],['AnimWalk','walk','Walk','Looping in-place walk.'],['AnimTrot','trot','Trot','Looping in-place trot.'],['AnimRun','run','Run','Looping in-place run or gallop.'],
  ['AnimCrouch','crouch','Crouch','Looping in-place crouch or stalking gait.'],['AnimJump','jump','Jump','One-shot in-place jump; gameplay owns translation.'],['AnimFall','fall','Fall','Looping in-air pose.'],['AnimLand','land','Land','One-shot in-place landing.'],
  ['AnimPounce','pounce','Pounce','One-shot pounce/attack without root translation.'],['AnimVoice','voice','Voice','One-shot meow, bark, neigh or custom call.'],['AnimDig','dig','Dig','One-shot or short looping dig/scratch action.'],['AnimFetch','fetch','Fetch','One-shot fetch/pick-up gesture.'],['AnimRear','rear','Rear','One-shot rear/buck gesture, especially useful for horses.'],
]);
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function animalRuntime(){return window.LK_RUNTIME_ANIMAL_PAWNS;}
function placeholderRuntime(){return window.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION;}
function makeAnimalGraph(species){
  species=animalRuntime()?animalRuntime().normalizeSpecies(species):String(species||'generic');
  const runtime=animalRuntime(),cfg=runtime?runtime.normalizeConfig({species}):{movement:{walkSpeed:1.6,runSpeed:6.2,sprintMultiplier:1.25,acceleration:14,turnRate:10,jumpHeight:.9,gravity:23,airControl:.32,radius:.3,height:1.05,stepHeight:.42},trotSpeed:3.1,locomotion:{responsiveness:10,predictionTime:.1},appearance:{furColor:'#7c8b93',bellyColor:'#c4ccd1',accentColor:'#33403f',eyeColor:'#1f2a2e'},camera:{mode:'free',distance:6.2,height:2.15,lag:7,fov:64},animations:{},animationSet:[]};
  cfg.animations.voice=VOICES[species]||'Call';
  const variables=[
    {name:'PawnEnabled',type:'boolean',value:true,exposed:true,binding:'enabled',label:'Pawn Enabled',category:'Pawn'},
    {name:'Hidden',type:'boolean',value:false,exposed:true,binding:'hidden',label:'Hidden',category:'Pawn'},
    {name:'ControllerPlayerId',type:'number',value:1,exposed:true,binding:'playerId',label:'Controller Player ID',category:'Input',ui:'player-id'},
    {name:'MaxHealth',type:'number',value:60,min:1,max:1000,step:5,exposed:true,binding:'vitals.maxHealth',label:'Max Health',category:'Animal / Vitals'},
    {name:'MaxArmor',type:'number',value:0,min:0,max:1000,step:5,exposed:true,binding:'vitals.maxArmor',label:'Max Armour',category:'Animal / Vitals'},
    {name:'RespawnMode',type:'string',value:'none',exposed:true,binding:'vitals.respawnMode',label:'Respawn After Death',category:'Animal / Vitals',ui:'select',options:[{value:'none',label:'Never (default)'},{value:'death',label:'At death position'},{value:'spawn',label:'At original spawn'},{value:'random',label:'Random playable position'}]},
    {name:'RespawnDelay',type:'number',value:2.5,min:0,max:60,step:.1,exposed:true,binding:'vitals.respawnDelay',label:'Respawn Delay (s)',category:'Animal / Vitals'},
    {name:'DeathPhysicsEnabled',type:'boolean',value:true,exposed:true,binding:'vitals.deathPhysics.enabled',label:'Physical Death / Ragdoll',category:'Animal / Vitals'},
    {name:'DeathPhysicsMode',type:'string',value:'auto',exposed:true,binding:'vitals.deathPhysics.mode',label:'Death Physics Mode',category:'Animal / Vitals',ui:'select',options:[{value:'auto',label:'Auto — ragdoll or physical fallback'},{value:'ragdoll',label:'Ragdoll'},{value:'rigid',label:'Physical fallback'}]},
    {name:'Species',type:'string',value:species,exposed:true,binding:'species',label:'Species / Body Profile',category:'Animal',ui:'select',options:SPECIES_OPTIONS},
    {name:'SpawnX',type:'number',value:0,step:.1,exposed:true,binding:'spawn.x',label:'Spawn X',category:'Pawn / Spawn'},
    {name:'SpawnY',type:'number',value:0,step:.1,exposed:true,binding:'spawn.y',label:'Spawn Y',category:'Pawn / Spawn'},
    {name:'SpawnZ',type:'number',value:5,step:.1,exposed:true,binding:'spawn.z',label:'Spawn Z',category:'Pawn / Spawn'},
    {name:'SpawnHeading',type:'number',value:Math.PI,step:.01,exposed:true,binding:'spawn.heading',label:'Spawn Heading',category:'Pawn / Spawn'},
    {name:'WalkSpeed',type:'number',value:cfg.movement.walkSpeed,min:.2,max:12,step:.1,exposed:true,binding:'movement.walkSpeed',label:'Walk Speed (m/s)',category:'Movement'},
    {name:'TrotSpeed',type:'number',value:cfg.trotSpeed,min:.2,max:18,step:.1,exposed:true,binding:'trotSpeed',label:'Trot Speed (m/s)',category:'Movement'},
    {name:'RunSpeed',type:'number',value:cfg.movement.runSpeed,min:.5,max:20,step:.1,exposed:true,binding:'movement.runSpeed',label:species==='horse'?'Gallop Speed (m/s)':'Run Speed (m/s)',category:'Movement'},
    {name:'SprintMultiplier',type:'number',value:cfg.movement.sprintMultiplier,min:1,max:2.5,step:.05,exposed:true,binding:'movement.sprintMultiplier',label:'Sprint Multiplier',category:'Movement'},
    {name:'Acceleration',type:'number',value:cfg.movement.acceleration,min:1,max:80,step:.5,exposed:true,binding:'movement.acceleration',label:'Acceleration',category:'Movement'},
    {name:'TurnRate',type:'number',value:cfg.movement.turnRate,min:.5,max:40,step:.5,exposed:true,binding:'movement.turnRate',label:'Turn Rate',category:'Movement'},
    {name:'JumpHeight',type:'number',value:cfg.movement.jumpHeight,min:0,max:5,step:.05,exposed:true,binding:'movement.jumpHeight',label:'Jump Height',category:'Movement'},
    {name:'StepHeight',type:'number',value:cfg.movement.stepHeight,min:0,max:3,step:.02,exposed:true,binding:'movement.stepHeight',label:'Step Height',category:'Movement'},
    {name:'BodyRadius',type:'number',value:cfg.movement.radius,min:.08,max:2,step:.02,exposed:true,binding:'movement.radius',label:'Collision Radius',category:'Movement / Collision'},
    {name:'BodyHeight',type:'number',value:cfg.movement.height,min:.2,max:4,step:.05,exposed:true,binding:'movement.height',label:'Collision Height',category:'Movement / Collision'},
    {name:'BlendResponsiveness',type:'number',value:cfg.locomotion.responsiveness,min:.5,max:30,step:.5,exposed:true,binding:'locomotion.responsiveness',label:'Motion Blend Responsiveness',category:'Movement / Motion Blend'},
    {name:'BlendPrediction',type:'number',value:cfg.locomotion.predictionTime,min:0,max:.6,step:.01,exposed:true,binding:'locomotion.predictionTime',label:'Motion Blend Prediction',category:'Movement / Motion Blend'},
    {name:'StepPoseStrength',type:'number',value:cfg.locomotion.stepPoseStrength,min:0,max:2,step:.05,exposed:true,binding:'locomotion.stepPoseStrength',label:'Stair Pose Strength',category:'Movement / Motion Blend'},
    {name:'CatClimbMaxHeight',type:'number',value:cfg.abilities.cat.climbMaxHeight,min:.1,max:8,step:.1,exposed:true,binding:'abilities.cat.climbMaxHeight',label:'Cat Climb Max Height',category:'Abilities / Cat'},
    {name:'CatPounceSpeed',type:'number',value:cfg.abilities.cat.pounceSpeed,min:.5,max:20,step:.1,exposed:true,binding:'abilities.cat.pounceSpeed',label:'Cat Pounce Speed',category:'Abilities / Cat'},
    {name:'CatStealthMultiplier',type:'number',value:cfg.abilities.cat.stealthMultiplier,min:.1,max:1,step:.05,exposed:true,binding:'abilities.cat.stealthMultiplier',label:'Cat Stealth Speed',category:'Abilities / Cat'},
    {name:'DogAlertRadius',type:'number',value:cfg.abilities.dog.alertRadius,min:.1,max:100,step:.5,exposed:true,binding:'abilities.dog.alertRadius',label:'Dog Bark Alert Radius',category:'Abilities / Dog'},
    {name:'DogDigDuration',type:'number',value:cfg.abilities.dog.digDuration,min:.1,max:10,step:.1,exposed:true,binding:'abilities.dog.digDuration',label:'Dog Dig Duration',category:'Abilities / Dog'},
    {name:'DogChaseStopDistance',type:'number',value:cfg.abilities.dog.chaseStopDistance,min:.1,max:20,step:.1,exposed:true,binding:'abilities.dog.chaseStopDistance',label:'Dog Chase Stop Distance',category:'Abilities / Dog'},
    {name:'HorseRideable',type:'boolean',value:cfg.abilities.horse.rideable,exposed:true,binding:'abilities.horse.rideable',label:'Horse Rideable',category:'Abilities / Horse'},
    {name:'HorseSeatHeight',type:'number',value:cfg.abilities.horse.seatOffset.y,min:.1,max:5,step:.05,exposed:true,binding:'abilities.horse.seatOffset.y',label:'Horse Seat Height',category:'Abilities / Horse'},
    {name:'FurColor',type:'string',value:cfg.appearance.furColor,exposed:true,binding:'appearance.furColor',label:'Fur / Main Color',category:'Appearance',ui:'color'},
    {name:'BellyColor',type:'string',value:cfg.appearance.bellyColor,exposed:true,binding:'appearance.bellyColor',label:'Belly / Secondary Color',category:'Appearance',ui:'color'},
    {name:'AccentColor',type:'string',value:cfg.appearance.accentColor,exposed:true,binding:'appearance.accentColor',label:'Paws / Muzzle / Tail Accent',category:'Appearance',ui:'color'},
    {name:'EyeColor',type:'string',value:cfg.appearance.eyeColor,exposed:true,binding:'appearance.eyeColor',label:'Eye Color',category:'Appearance',ui:'color'},
    {name:'CameraMode',type:'string',value:'free',exposed:true,binding:'camera.mode',label:'Camera Mode',category:'Camera',ui:'select',options:[{value:'free',label:'Free'},{value:'arcade',label:'Arcade follow'},{value:'cinematic',label:'Cinematic'}]},
    {name:'CameraDistance',type:'number',value:cfg.camera.distance,min:.5,max:40,step:.1,exposed:true,binding:'camera.distance',label:'Distance',category:'Camera'},
    {name:'CameraHeight',type:'number',value:cfg.camera.height,min:.1,max:20,step:.1,exposed:true,binding:'camera.height',label:'Height',category:'Camera'},
    {name:'CameraLag',type:'number',value:cfg.camera.lag,min:.1,max:30,step:.1,exposed:true,binding:'camera.lag',label:'Lag',category:'Camera'},
    {name:'CameraFov',type:'number',value:cfg.camera.fov,min:20,max:130,step:1,exposed:true,binding:'camera.fov',label:'FOV',category:'Camera'},
    {name:'AnimationLibrary',type:'string',value:'',exposed:true,binding:'animationLibrary',ui:'model-asset',label:'Animation Library GLB (clips only)',category:'Animations',description:'Optional quadruped animation GLB using the same skeleton/bone names as the main animal model. Locomotion must be in-place.'},
  ];
  ACTION_SLOTS.forEach(slot=>variables.push({name:slot[0],type:'string',value:slot[1]==='voice'?cfg.animations.voice:slot[2],exposed:true,binding:'animations.'+slot[1],label:slot[2]+' Clip',category:'Animations',description:slot[3]+' Use the Main Mesh skeleton and keep locomotion in-place without root motion.'}));
  const primaryType=species==='dog'?'animal.dogBarkAlert':(species==='horse'?'animal.playAction':'animal.pounce'),primaryData=species==='horse'?{action:'rear'}:{},secondaryType=species==='cat'?'animal.catClimb':(species==='dog'?'animal.dogDig':null);
  const graph={
    version:1,name:'Template - Player Animal ('+LABELS[species]+')',scope:'element',enabled:true,variables,
    nodes:[
      node('on_start','event.onStart',80,100),node('get_self','pawn.getSelf',330,25),node('get_player','variable.get',330,145,{name:'ControllerPlayerId'}),node('possess','pawn.possess',590,100,{force:false}),node('get_camera','variable.get',580,230,{name:'CameraMode'}),node('camera','pawn.setCamera',850,100,{possess:true}),node('ready','debug.print',1120,100,{message:LABELS[species]+' Animal Pawn ready. WASD move, Shift run, Ctrl crouch, Space jump, F action.',duration:4}),
      node('on_update','event.onUpdate',80,410),node('move_input','animal.getMoveInput',340,390),node('set_move','animal.setMoveInput',650,410),
      node('on_action','event.onInputActionDown',80,850,{action:'primaryAbility'}),node('action',primaryType,380,850,primaryData),node('on_voice','event.onInputActionDown',80,1010,{action:'voice'}),node('voice','animal.playAction',380,1010,{action:'voice'}),
    ],
    edges:[
      edge('e_start','on_start','then','possess','exec'),edge('e_self','get_self','pawn','possess','pawn'),edge('e_player','get_player','value','possess','playerId'),edge('e_possess_camera','possess','completed','camera','exec'),edge('e_self_camera','get_self','pawn','camera','pawn'),edge('e_mode','get_camera','value','camera','mode'),edge('e_ready','camera','completed','ready','exec'),
      edge('e_update','on_update','then','set_move','exec'),edge('e_x','move_input','x','set_move','x'),edge('e_z','move_input','z','set_move','z'),edge('e_sprint','move_input','sprint','set_move','sprint'),edge('e_crouch','move_input','crouch','set_move','crouch'),edge('e_action','on_action','then','action','exec'),edge('e_voice','on_voice','then','voice','exec'),
    ],
    comments:[
      {id:'animal_move_help',title:'Animal locomotion is fully playable with the procedural quadruped. Assign a rigged GLB in Pawn Studio to replace only the visual/animation source; movement, collision and camera remain authoritative.',x:40,y:35,w:1370,h:520,color:'#84cc16'},
      {id:'animal_action_help',title:'Mapped Jump is owned by locomotion. Primary Ability, Voice and Secondary Ability are distinct remappable actions (F/Q/E defaults), so they never double-fire human Interact or Lean.',x:40,y:620,w:900,h:500,color:'#f59e0b'},
    ],
  };
  if(secondaryType){graph.nodes.push(node('on_secondary','event.onInputActionDown',720,850,{action:'secondaryAbility'}),node('secondary',secondaryType,1020,850,{}));graph.edges.push(edge('e_secondary','on_secondary','then','secondary','exec'));}
  const profile=placeholderRuntime()?placeholderRuntime().profile(species):{bodyRadius:.2,bodyLength:.8,standHeight:.72,headSize:.17};
  const placeholder=placeholderRuntime()?placeholderRuntime().sceneElements(species,cfg.appearance,cfg.proportions):[];
  graph.logicScene={
    root:{id:'root',name:LABELS[species]+' Animal Root',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#84cc16'},
    elements:[{id:'animal_model',name:'Animal Model / Rigged GLB Placeholder',type:'mesh',primitive:'cube',parentId:'root',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[.001,.001,.001],color:'#334155'}].concat(placeholder),
    components:[
      {id:'root_transform',elementId:'root',name:'Transform',type:'transform',linked:true},
      {id:'pawn_animal',elementId:'root',name:'Animal Pawn',type:'player-pawn',linked:true},
      {id:'pawn_collision',elementId:'root',name:'Animal Collision',type:'collider',linked:true,collider:{enabled:true,shape:'box',size:[Math.max(.2,profile.bodyRadius*2),Math.max(.25,cfg.movement.height),Math.max(.3,profile.bodyLength)],offset:[0,cfg.movement.height*.5,0]}},
      {id:'model_render',elementId:'animal_model',name:'Imported Animal GLB / Procedural Placeholder',type:'render',linked:true},
    ],
  };
  graph.animalPawn={template:true,schemaVersion:1,cameraDefaultVersion:1,id:'player-animal-'+species,species,playerId:1,enabled:true,hidden:false,possessed:true,model:null,spawn:{x:0,y:0,z:5,heading:Math.PI},movement:clone(cfg.movement),trotSpeed:cfg.trotSpeed,locomotion:clone(cfg.locomotion),animationLibrary:null,animationSet:clone(cfg.animationSet),animations:clone(cfg.animations),appearance:clone(cfg.appearance),proportions:{},abilities:clone(cfg.abilities),cloth:{enabled:false,pieces:[]},camera:Object.assign({},cfg.camera,{mode:'free',view:'third'}),vitals:{enabled:true,maxHealth:60,maxArmor:0,armor:0,armorAbsorb:0,regen:0,regenDelay:8,respawnMode:'none',respawnOnDeath:false,respawnDelay:2.5,team:'player',deathPhysics:{enabled:true,mode:'auto',profile:'quadruped'}}};
  return graph;
}
function aiAnimalVariables(defaults){
  const source=Object.assign({profile:'reactive',faction:'wildlife',hostileFactions:'enemy',squadId:'',sightRange:28,hearingRange:38,memorySeconds:5,fieldOfViewDeg:150,confirmSeconds:1.5,guardRadius:35,fearThreshold:.45,onDamage:'flee',onExplosion:'flee',attackEnabled:true,attackDamage:16,attackRange:2.2,attackCooldown:1.35,attackForce:5,attackAction:'attack',areaEnabled:false,areaRadius:35,areaHeight:8,areaAction:'observe',areaExitAction:'return',areaShowInEditor:true},defaults||{});
  return [
    {name:'BehaviorEnabled',type:'boolean',value:true,exposed:true,binding:'behavior.enabled',label:'AI Enabled',category:'AI / Behavior'},
    {name:'BehaviorProfile',type:'string',value:source.profile,exposed:true,binding:'behavior.profile',label:'Behavior Profile',category:'AI / Behavior',ui:'select',options:BEHAVIOR_PROFILE_OPTIONS},
    {name:'Faction',type:'string',value:source.faction,exposed:true,binding:'behavior.faction',label:'Faction',category:'AI / Allegiance'},
    {name:'HostileFactions',type:'string',value:source.hostileFactions,exposed:true,binding:'behavior.hostileFactions',label:'Hostile Factions (comma separated)',category:'AI / Allegiance'},
    {name:'SquadId',type:'string',value:source.squadId,exposed:true,binding:'behavior.squadId',label:'Pack / Herd ID',category:'AI / Allegiance'},
    {name:'SightRange',type:'number',value:source.sightRange,min:1,max:250,step:.5,exposed:true,binding:'behavior.perception.sightRange',label:'Sight Range',category:'AI / Perception'},
    {name:'HearingRange',type:'number',value:source.hearingRange,min:0,max:250,step:.5,exposed:true,binding:'behavior.perception.hearingRange',label:'Hearing Range',category:'AI / Perception'},
    {name:'MemorySeconds',type:'number',value:source.memorySeconds,min:0,max:60,step:.1,exposed:true,binding:'behavior.perception.memorySeconds',label:'Threat Memory (s)',category:'AI / Perception'},
    {name:'FieldOfViewDeg',type:'number',value:source.fieldOfViewDeg,min:10,max:360,step:1,exposed:true,binding:'behavior.perception.fieldOfViewDeg',label:'Field of View (deg)',category:'AI / Perception'},
    {name:'ConfirmSeconds',type:'number',value:source.confirmSeconds,min:0,max:30,step:.1,exposed:true,binding:'behavior.perception.confirmSeconds',label:'Observe Before Engage (s)',category:'AI / Perception'},
    {name:'GuardRadius',type:'number',value:source.guardRadius,min:0,max:500,step:1,exposed:true,binding:'behavior.tactics.guardRadius',label:'Territory Radius',category:'AI / Tactics'},
    {name:'ActionAreaEnabled',type:'boolean',value:source.areaEnabled,exposed:true,binding:'behavior.actionArea.enabled',label:'Smart Action Area',category:'AI / Action Area'},
    {name:'ActionAreaRadius',type:'number',value:source.areaRadius,min:1,max:500,step:.5,exposed:true,binding:'behavior.actionArea.radius',label:'Area Radius',category:'AI / Action Area'},
    {name:'ActionAreaHeight',type:'number',value:source.areaHeight,min:.5,max:250,step:.5,exposed:true,binding:'behavior.actionArea.height',label:'Area Height',category:'AI / Action Area'},
    {name:'ActionAreaAction',type:'string',value:source.areaAction,exposed:true,binding:'behavior.actionArea.action',label:'When Target Enters',category:'AI / Action Area',ui:'select',options:[{value:'observe',label:'Observe, hide, then engage'},{value:'investigate',label:'Investigate without attacking'},{value:'cover',label:'Seek shelter, then engage'},{value:'attack',label:'Attack immediately'},{value:'flee',label:'Flee'},{value:'ignore',label:'Ignore'}]},
    {name:'ActionAreaExitAction',type:'string',value:source.areaExitAction,exposed:true,binding:'behavior.actionArea.exitAction',label:'When Target Exits',category:'AI / Action Area',ui:'select',options:[{value:'return',label:'Return to territory'},{value:'forget',label:'Forget target'},{value:'search',label:'Search last position'},{value:'hold',label:'Hold position'}]},
    {name:'ActionAreaShowInEditor',type:'boolean',value:source.areaShowInEditor,exposed:true,binding:'behavior.actionArea.showInEditor',label:'Show Area + FOV in Editor',category:'AI / Action Area'},
    {name:'NaturalAttackEnabled',type:'boolean',value:source.attackEnabled,exposed:true,binding:'behavior.animalAttack.enabled',label:'Natural Attack Enabled',category:'AI / Natural Attack'},
    {name:'NaturalAttackDamage',type:'number',value:source.attackDamage,min:0,max:1000,step:1,exposed:true,binding:'behavior.animalAttack.damage',label:'Bite / Pounce Damage',category:'AI / Natural Attack'},
    {name:'NaturalAttackRange',type:'number',value:source.attackRange,min:.1,max:12,step:.1,exposed:true,binding:'behavior.animalAttack.range',label:'Attack Contact Range',category:'AI / Natural Attack'},
    {name:'NaturalAttackCooldown',type:'number',value:source.attackCooldown,min:.1,max:12,step:.05,exposed:true,binding:'behavior.animalAttack.cooldown',label:'Attack Cooldown (s)',category:'AI / Natural Attack'},
    {name:'NaturalAttackForce',type:'number',value:source.attackForce,min:0,max:100,step:.5,exposed:true,binding:'behavior.animalAttack.force',label:'Attack Impact Force',category:'AI / Natural Attack'},
    {name:'NaturalAttackAction',type:'string',value:source.attackAction,exposed:true,binding:'behavior.animalAttack.action',label:'Attack Animation / Action',category:'AI / Natural Attack'},
    {name:'FearThreshold',type:'number',value:source.fearThreshold,min:0,max:1,step:.05,exposed:true,binding:'behavior.fear.threshold',label:'Fear Threshold',category:'AI / Reactions'},
    {name:'DamageReaction',type:'string',value:source.onDamage,exposed:true,binding:'behavior.reactions.onDamage',label:'When Damaged',category:'AI / Reactions',ui:'select',options:BEHAVIOR_REACTION_OPTIONS},
    {name:'ExplosionReaction',type:'string',value:source.onExplosion,exposed:true,binding:'behavior.reactions.onExplosion',label:'On Explosion',category:'AI / Reactions',ui:'select',options:BEHAVIOR_REACTION_OPTIONS},
  ];
}
function makeAiAnimalGraph(species){
  const graph=makeAnimalGraph(species),pawn=graph.animalPawn;
  graph.name='Template - AI Animal ('+LABELS[species]+')';
  const naturalAttack=species==='cat'?{enabled:true,damage:14,range:2.4,cooldown:1.25,force:4,action:'pounce'}:species==='dog'?{enabled:true,damage:20,range:1.9,cooldown:1.1,force:6,action:'pounce'}:{enabled:false,damage:18,range:2.2,cooldown:1.5,force:7,action:species==='horse'?'rear':'attack'};
  graph.variables=graph.variables.concat(aiAnimalVariables({attackEnabled:naturalAttack.enabled,attackDamage:naturalAttack.damage,attackRange:naturalAttack.range,attackCooldown:naturalAttack.cooldown,attackForce:naturalAttack.force,attackAction:naturalAttack.action}));
  const player=graph.variables.find(variable=>variable.binding==='playerId');if(player)player.value=-1;
  const respawn=graph.variables.find(variable=>variable.binding==='vitals.respawnMode');if(respawn)respawn.value='none';
  graph.nodes=[node('on_start','event.onStart',80,100),node('ready','debug.print',360,100,{message:LABELS[species]+' AI ready. Profile, territory, pack and reactions are editable.',duration:2})];
  graph.edges=[edge('ai_ready','on_start','then','ready','exec')];
  graph.comments=[{id:'ai_animal_help',title:'Reusable Animal AI. The shared behavior core maps danger and target states onto species actions: cats pounce, dogs alert/chase and horses startle/flee when those verbs are available.',x:40,y:35,w:1080,h:260,color:'#84cc16'}];
  graph.logicScene.root.name=LABELS[species]+' AI Root';
  pawn.id='ai-animal-'+species;pawn.playerId=null;pawn.possessed=false;pawn.faction='wildlife';
  pawn.behavior={schemaVersion:2,enabled:true,profile:'reactive',faction:'wildlife',hostileFactions:['enemy'],squadId:'',squadIndex:0,tag:'',perception:{sightRange:28,hearingRange:38,memorySeconds:5,confirmSeconds:1.5,fieldOfViewDeg:150,requireLineOfSight:true},tactics:{attackRange:species==='cat'||species==='dog'?3:0,preferredRange:species==='horse'?24:2,guardRadius:35,coverBias:.2,flankBias:.15,accuracy:.6,burstMin:1,burstMax:1,burstPause:1},animalAttack:naturalAttack,fear:{enabled:true,threshold:.45,decay:.1},reactions:{onDamage:'flee',onWeaponFired:'flee',onExplosion:'flee',onCharacterDied:'flee'},actionArea:{enabled:false,shape:'circle',radius:35,width:70,depth:70,height:8,offset:{x:0,y:0,z:0},action:'observe',exitAction:'return',showInEditor:true},patrol:[]};
  pawn.vitals={enabled:true,maxHealth:60,maxArmor:0,armor:0,armorAbsorb:0,regen:0,regenDelay:8,respawnMode:'none',respawnOnDeath:false,team:'wildlife',deathPhysics:{enabled:true,mode:'auto',profile:'quadruped'}};
  return graph;
}
function makeAnimalTemplates(){
  const speciesList=['cat','dog','horse','generic'];
  const player=speciesList.map(species=>({id:'logic-template-player-animal-'+species,name:'Template - Player Animal ('+LABELS[species]+')',description:'Editable '+LABELS[species]+' Animal Pawn with procedural quadruped fallback, walk/trot/run, crouch, jump, actions, camera and replaceable rigged GLB/Motion Set.',category:'Pawn / Animal',graph:makeAnimalGraph(species)}));
  const ai=speciesList.map(species=>({id:'logic-template-ai-animal-'+species,name:'Template - AI Animal ('+LABELS[species]+')',description:'Unpossessed '+LABELS[species]+' using the shared explicit behavior, faction, pack, fear, vitals and quadruped death-physics descriptors.',category:'Pawn / Animal',graph:makeAiAnimalGraph(species)}));
  return player.concat(ai);
}

if(window.LK_LOGIC_TEMPLATES&&window.LK_LOGIC_TEMPLATES.register)window.LK_LOGIC_TEMPLATES.register(makeAnimalTemplates());
window.LK_LOGIC_TEMPLATES_ANIMAL=Object.freeze({LABELS,SPECIES_OPTIONS,ACTION_SLOTS,BEHAVIOR_PROFILE_OPTIONS,BEHAVIOR_REACTION_OPTIONS,aiAnimalVariables,makeAnimalGraph,makeAiAnimalGraph,makeAnimalTemplates});
})();
