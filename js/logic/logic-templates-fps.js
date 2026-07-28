/* =========================================================
   LOT KING - First Person Logic Element templates

   Two reusable pieces for shooter-style levels:

     · Template - Player Character (First Person)
         Character Pawn with the first-person rig enabled: eye camera, mouse
         look, aim down sights, hitscan weapon and ammo handling.
     · Template - Shooting Target
         Unpossessed damageable prop with a scoring/respawn graph. Used by the
         FPS Shooter Test level and reusable anywhere else.

   The player template deliberately reuses the generic Character Pawn contract
   (movement, collision, animation slots) instead of forking it, so anything
   authored in Pawn Studio for a third-person character keeps working here.
   ========================================================= */
(function(){
'use strict';

function node(id,type,x,y,data){ return {id,type,x:x||0,y:y||0,data:Object.assign({},data||{})}; }
function edge(id,fromNode,fromPin,toNode,toPin){ return {id,from:{node:fromNode,pin:fromPin},to:{node:toNode,pin:toPin}}; }
function sceneElement(id,name,primitive,parentId,position,rotation,scale,color){ return {id,name,type:'mesh',primitive,parentId:parentId||'root',linked:true,position:position||[0,0,0],rotation:rotation||[0,0,0],scale:scale||[1,1,1],color:color||'#64748b'}; }

// Preset values live in the runtime controller: the graph only needs the
// selectable labels, and the `preset` binding resolves at runtime.
const WEAPON_PRESET_OPTIONS = [
  {value:'rifle',label:'Assault Rifle (automatic)'},
  {value:'marksman',label:'Marksman Rifle (semi-automatic)'},
  {value:'shotgun',label:'Shotgun (spread pellets)'},
];
function presetValues(name){
  const runtime = window.LK_RUNTIME_FIRST_PERSON;
  const preset = runtime && runtime.weaponPreset ? runtime.weaponPreset(name) : null;
  return preset ? Object.assign({}, preset.values) : {};
}

function characterTemplates(){
  return window.LK_LOGIC_TEMPLATES_CHARACTER || null;
}

// ------------------------------------------------ player (first person)

function makePlayerGraph(){
  const characterApi = characterTemplates();
  const base = characterApi && characterApi.makeCharacterTemplates
    ? JSON.parse(JSON.stringify(characterApi.makeCharacterTemplates()[0].graph))
    : null;
  if(!base) return null;

  base.name = 'Template - Player Character (First Person)';

  // Camera variables from the third-person base are replaced: a first-person
  // Pawn has no follow distance, and exposing one would be a dead control.
  base.variables = base.variables.filter(variable => !/^camera\./.test(String(variable.binding || '')));
  base.variables = base.variables.concat([
    {name:'EyeHeight',type:'number',value:1.62,min:.4,max:2.6,step:.01,exposed:true,binding:'firstPerson.eyeHeight',label:'Eye Height (m)',category:'First Person / View',description:'Camera height above the Pawn origin. Match it to the head bone of the Main Mesh.'},
    {name:'LookSensitivity',type:'number',value:1,min:.1,max:5,step:.05,exposed:true,binding:'firstPerson.sensitivity',label:'Look Sensitivity',category:'First Person / View'},
    {name:'AdsSensitivityScale',type:'number',value:.55,min:.1,max:1,step:.05,exposed:true,binding:'firstPerson.adsSensitivityScale',label:'ADS Sensitivity Scale',category:'First Person / View',description:'Multiplier applied while aiming down sights, so a zoomed view is not twitchy.'},
    {name:'InvertLookY',type:'boolean',value:false,exposed:true,binding:'firstPerson.invertY',label:'Invert Look Y',category:'First Person / View'},
    {name:'PitchMin',type:'number',value:-85,min:-89,max:0,step:1,exposed:true,binding:'firstPerson.pitchMinDeg',label:'Pitch Min (deg)',category:'First Person / View'},
    {name:'PitchMax',type:'number',value:85,min:0,max:89,step:1,exposed:true,binding:'firstPerson.pitchMaxDeg',label:'Pitch Max (deg)',category:'First Person / View'},
    {name:'HipFov',type:'number',value:78,min:40,max:120,step:1,exposed:true,binding:'firstPerson.fov',label:'Hip FOV',category:'First Person / View'},
    {name:'AdsFov',type:'number',value:52,min:20,max:110,step:1,exposed:true,binding:'firstPerson.fovAds',label:'Aim FOV',category:'First Person / View'},
    {name:'SprintFov',type:'number',value:84,min:40,max:130,step:1,exposed:true,binding:'firstPerson.fovSprint',label:'Sprint FOV',category:'First Person / View'},
    {name:'HideOwnBody',type:'boolean',value:true,exposed:true,binding:'firstPerson.hideOwnBody',label:'Hide Own Body',category:'First Person / View',description:'Hides the character mesh for the owning player. Turn it off once a dedicated first-person arms mesh exists.'},
    {name:'ViewBobEnabled',type:'boolean',value:true,exposed:true,binding:'firstPerson.viewBob.enabled',label:'View Bob',category:'First Person / View'},
    {name:'ViewBobAmplitude',type:'number',value:.035,min:0,max:.2,step:.005,exposed:true,binding:'firstPerson.viewBob.amplitude',label:'View Bob Amplitude',category:'First Person / View'},

    {name:'WeaponPreset',type:'string',value:'rifle',exposed:true,binding:'firstPerson.weapon.preset',label:'Weapon Preset',category:'First Person / Weapon',ui:'select',options:WEAPON_PRESET_OPTIONS,description:'Starting weapon profile. It seeds the individual weapon values below; tune them afterwards for a custom weapon.'},
    {name:'WeaponName',type:'string',value:'Assault Rifle',exposed:true,binding:'firstPerson.weapon.name',label:'Weapon Name',category:'First Person / Weapon'},
    {name:'FireMode',type:'string',value:'auto',exposed:true,binding:'firstPerson.weapon.mode',label:'Fire Mode',category:'First Person / Weapon',ui:'select',options:[{value:'auto',label:'Automatic'},{value:'semi',label:'Semi-automatic'},{value:'burst',label:'Burst'}]},
    {name:'WeaponDamage',type:'number',value:22,min:0,max:500,step:1,exposed:true,binding:'firstPerson.weapon.damage',label:'Damage per Hit',category:'First Person / Weapon'},
    {name:'HeadshotMultiplier',type:'number',value:2,min:1,max:8,step:.1,exposed:true,binding:'firstPerson.weapon.headshotMultiplier',label:'Headshot Multiplier',category:'First Person / Weapon',description:'Applied when the hit mesh is marked as a head hit zone.'},
    {name:'FireRate',type:'number',value:9.5,min:.5,max:30,step:.1,exposed:true,binding:'firstPerson.weapon.fireRate',label:'Fire Rate (shots/s)',category:'First Person / Weapon'},
    {name:'WeaponRange',type:'number',value:140,min:5,max:1000,step:5,exposed:true,binding:'firstPerson.weapon.range',label:'Range (m)',category:'First Person / Weapon'},
    {name:'MagazineSize',type:'number',value:30,min:1,max:200,step:1,exposed:true,binding:'firstPerson.weapon.magazine',label:'Magazine Size',category:'First Person / Weapon'},
    {name:'ReserveAmmo',type:'number',value:180,min:0,max:5000,step:10,exposed:true,binding:'firstPerson.weapon.ammoReserve',label:'Reserve Ammo',category:'First Person / Weapon'},
    {name:'InfiniteAmmo',type:'boolean',value:false,exposed:true,binding:'firstPerson.weapon.infiniteAmmo',label:'Infinite Reserve',category:'First Person / Weapon'},
    {name:'ReloadTime',type:'number',value:1.9,min:.1,max:8,step:.1,exposed:true,binding:'firstPerson.weapon.reloadTime',label:'Reload Time (s)',category:'First Person / Weapon'},
    {name:'Pellets',type:'number',value:1,min:1,max:24,step:1,exposed:true,binding:'firstPerson.weapon.pellets',label:'Pellets per Shot',category:'First Person / Weapon',description:'Greater than 1 turns the weapon into a shotgun: each pellet is an independent hitscan.'},
    {name:'SpreadHip',type:'number',value:.026,min:0,max:.3,step:.002,exposed:true,binding:'firstPerson.weapon.spreadHip',label:'Hip Spread',category:'First Person / Weapon'},
    {name:'SpreadAds',type:'number',value:.005,min:0,max:.3,step:.001,exposed:true,binding:'firstPerson.weapon.spreadAds',label:'Aim Spread',category:'First Person / Weapon'},
    {name:'RecoilPitch',type:'number',value:.018,min:0,max:.3,step:.002,exposed:true,binding:'firstPerson.weapon.recoilPitch',label:'Recoil Kick',category:'First Person / Weapon'},
    {name:'RecoilRecovery',type:'number',value:8.5,min:.5,max:40,step:.5,exposed:true,binding:'firstPerson.weapon.recoilRecovery',label:'Recoil Recovery',category:'First Person / Weapon'},
  ]);

  // Movement defaults tuned for a shooter: the body follows the view instead of
  // turning toward its velocity, so strafing stays perpendicular to the aim.
  const movement = base.variables.find(variable => variable.binding === 'movement.inputMode');
  if(movement){
    movement.value = 'heading';
    movement.description = 'First-person Pawns keep this on Character heading: the rig already aligns the body with the view every frame.';
  }
  const walk = base.variables.find(variable => variable.binding === 'movement.walkSpeed');
  if(walk) walk.value = 3.1;
  const run = base.variables.find(variable => variable.binding === 'movement.runSpeed');
  if(run) run.value = 5.9;
  const turn = base.variables.find(variable => variable.binding === 'movement.turnRate');
  if(turn) turn.value = 22;

  base.nodes = [
    node('on_start','event.onStart',80,110),
    node('get_self','pawn.getSelf',340,30),
    node('get_player','variable.get',340,160,{name:'ControllerPlayerId'}),
    node('possess','pawn.possess',610,110,{force:true}),
    // The first-person rig owns the eye transform; setCamera is only used here
    // to claim camera output for this player.
    node('camera','pawn.setCamera',880,110,{mode:'free',possess:true,fov:78}),
    node('ready','debug.print',1150,110,{message:'First Person Pawn ready. WASD move, Shift sprint, Space jump, Mouse aim, Left Mouse fire, Right Mouse ADS, R reload.',duration:5}),

    node('on_update','event.onUpdate',80,420),
    node('move_input','character.getMoveInput',340,400),
    node('set_move','character.setMoveInput',650,420),

    node('on_jump','event.onKeyDown',80,660,{key:' '}),
    node('jump','character.jump',380,660),

    node('on_down','event.onTargetDown',80,860),
    node('score','variable.incrementNumber',380,860,{name:'Score',amount:100}),
    node('score_print','debug.print',680,860,{message:'Target down',duration:1.4}),
  ];
  base.edges = [
    edge('e_start','on_start','then','possess','exec'),
    edge('e_self','get_self','pawn','possess','pawn'),
    edge('e_player','get_player','value','possess','playerId'),
    edge('e_possess_camera','possess','completed','camera','exec'),
    edge('e_self_camera','get_self','pawn','camera','pawn'),
    edge('e_ready','camera','completed','ready','exec'),
    edge('e_update','on_update','then','set_move','exec'),
    edge('e_x','move_input','x','set_move','x'),
    edge('e_z','move_input','z','set_move','z'),
    edge('e_sprint','move_input','sprint','set_move','sprint'),
    edge('e_jump','on_jump','then','jump','exec'),
    edge('e_down','on_down','then','score','exec'),
    edge('e_score_print','score','completed','score_print','exec'),
  ];
  base.comments = [
    {id:'fp_view',title:'First Person base. The runtime rig owns the eye camera, mouse/stick look, aim down sights and recoil. Fire, aim and reload are input actions on the Character context — no graph wiring needed for basic shooting.',x:40,y:40,w:1360,h:520,color:'#38bdf8'},
    {id:'fp_combat',title:'Weapon events are available for scoring, HUD and objectives. On Weapon Fired / On Weapon Hit / On Target Down come from the Pawn event channel; the nodes below are an example scoring hook you can replace.',x:40,y:800,w:900,h:190,color:'#f472b6'},
  ];

  base.variables.push({name:'Score',type:'number',value:0,exposed:true,label:'Score',category:'Gameplay',description:'Incremented by the example On Target Down hook. Replace it with your own objective logic.'});

  base.logicScene = {
    root:{id:'root',name:'First Person Player Root',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#38bdf8'},
    elements:[sceneElement('character_model','Character Model / Rigged GLB Placeholder','cube','root',[0,1.05,0],[0,0,0],[.001,.001,.001],'#334155')]
      .concat(window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION?window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION.sceneElements({shirtColor:'#3d4a5c',shortsColor:'#232b36',socksColor:'#232b36',hairColor:'#241d16',skinColor:'#d8a184'}):[]),
    components:[
      {id:'root_transform',elementId:'root',name:'Transform',type:'transform',linked:true},
      {id:'pawn_character',elementId:'root',name:'Character Pawn',type:'player-pawn',linked:true},
      {id:'pawn_collision',elementId:'root',name:'Character Collision',type:'collider',linked:true,collider:{enabled:true,shape:'box',size:[.7,1.9,.7],offset:[0,.95,0]}},
      {id:'model_render',elementId:'character_model',name:'Imported Model / Placeholder',type:'render',linked:true},
    ],
  };

  base.characterPawn.id = 'player-character-first-person';
  base.characterPawn.spawn = {x:0,y:0,z:0,heading:0};
  // Character Sound Set for THIS Pawn, by id, the way a vehicle names its engine
  // set. Empty means "use the level's set". Two characters on the same floor can
  // therefore sound like two different people.
  base.characterPawn.soundSet = '';
  base.characterPawn.movement = Object.assign({}, base.characterPawn.movement, {
    walkSpeed:3.1, runSpeed:5.9, sprintMultiplier:1.28, acceleration:18, turnRate:22,
    jumpHeight:1.05, gravity:22, airControl:.4, inputMode:'heading', facingMode:'heading',
  });
  // The follow camera is never consulted while the rig is active; the block is
  // kept so switching Hide First Person off still yields a sane third person.
  base.characterPawn.camera = {mode:'free',view:'first',distance:3.2,height:1.75,lag:14,fov:78};
  base.characterPawn.firstPerson = {
    enabled:true,
    eyeHeight:1.62,
    pitchMinDeg:-85,
    pitchMaxDeg:85,
    sensitivity:1,
    adsSensitivityScale:.55,
    invertY:false,
    fov:78,
    fovAds:52,
    fovSprint:84,
    hideOwnBody:true,
    // Where the weapon sits on the character in third person. Leave `bone` empty
    // to auto-detect a right hand; name it, nudge the offset and turn the helper
    // on to place it by eye on a rig the detector does not recognise.
    weaponSocket:{bone:'', offset:[0, 0, 0], rotation:[0, 0, 0], scale:1, showHelper:false},
    // Every socket field is bindable one component at a time
    // (`firstPerson.weaponSocket.offsetY`, `.rotationX`, `.bone`, `.scale`,
    // `.showHelper`), so a graph or an inspector slider can place the weapon on
    // an imported character without rebuilding the block.

    // Turn this on to keep the body and cull only the head, so looking down
    // shows real legs. It costs one skinned draw the hidden path does not pay.
    showLegs:false,
    // C swaps between the eye and the rig's own over-the-shoulder camera at
    // runtime. Set view:'third' to START behind the shoulder instead; the
    // weapon, the crosshair and every world verb work the same in both.
    view:'first',
    allowViewToggle:true,
    thirdPerson:{
      distance:3.3,
      distanceAds:1.9,
      height:1.5,
      shoulder:.62,
      shoulderAds:.48,
      fov:68,
      fovAds:52,
      collisionRadius:.34,
    },
    viewBob:{enabled:true,amplitude:.035,frequency:9.4,sway:.022},
    weapon:Object.assign({id:'primary',preset:'rifle'}, presetValues('rifle')),
  };
  // GASP-style traversal: crouch, slow walk, slide, vault, mantle and climb.
  // Every number is the tuning knob for one move, and the whole block can be
  // deleted to get plain walk/run/jump back.
  base.characterPawn.abilities = {
    enabled:true,
    crouch:{enabled:true,toggle:false,heightScale:.55,speedScale:.42},
    walk:{enabled:true,speedScale:.33},
    slide:{enabled:true,minSpeed:4.2,duration:.85,boost:1.35,cooldown:.6},
    vault:{enabled:true,minHeight:.5,maxHeight:1.25,duration:.52},
    mantle:{enabled:true,maxHeight:2.35,duration:.78},
    climb:{enabled:true,speed:2.4,strafe:1.4},
  };
  // Health, armour and regeneration. Medkits and armour plates in the level
  // write into this block through the item system.
  base.characterPawn.vitals = {
    enabled:true,
    maxHealth:100,
    maxArmor:100,
    armorAbsorb:.6,
    regen:6,
    regenDelay:6,
    respawnOnDeath:true,
    respawnDelay:2.5,
    team:'player',
  };
  // The SHAPE of the inventory is a project decision, so it is authored here
  // rather than hard-coded in the runtime:
  //
  //   'none'      one weapon, no carrying; a pickup replaces what is in hand and
  //               consumables are used where they lie (arena shooter)
  //   'slots'     N weapon slots cycled with Q, consumables used on pickup
  //   'backpack'  slots PLUS a pack that stores consumables for later, spent
  //               with the Use Item key (survival / RPG shaped)
  // Seven roles on the number row: fists, sidearm, primary, melee, bonus,
  // flashbang, grenade. `loadout` is what the character SPAWNS with; the rest
  // are picked up from the world.
  base.characterPawn.loadout = [
    {preset:'fists'},
    {preset:'pistol'},
    {preset:'knife'},
    {preset:'grenade'},
  ];
  base.characterPawn.inventory = {
    mode:'slots',
    weaponSlots:7,
    packSize:12,
    allowDrop:true,
    autoEquip:true,
  };
  return base;
}

// ------------------------------------------------ shooting target

function makeTargetGraph(){
  return {
    version:1,name:'Template - Shooting Target',scope:'element',enabled:true,
    variables:[
      {name:'TargetHealth',type:'number',value:100,min:1,max:2000,step:5,exposed:true,label:'Health',category:'Target',description:'Health pool restored on spawn and on every respawn.'},
      {name:'RespawnSeconds',type:'number',value:4,min:0,max:60,step:.5,exposed:true,label:'Respawn Delay (s)',category:'Target',description:'Zero keeps the target down permanently.'},
      {name:'PointsValue',type:'number',value:100,min:0,max:10000,step:10,exposed:true,label:'Points',category:'Target'},
      {name:'Team',type:'string',value:'enemy',exposed:true,label:'Team Tag',category:'Target',ui:'select',options:[{value:'enemy',label:'Enemy'},{value:'neutral',label:'Neutral / practice'},{value:'friendly',label:'Friendly (penalty)'}]},
      {name:'IsDown',type:'boolean',value:false,exposed:false},
    ],
    nodes:[
      node('on_start','event.onStart',80,110),
      node('owner','scene.getOwner',340,30),
      node('health','variable.get',340,190,{name:'TargetHealth'}),
      node('team','variable.get',340,300,{name:'Team'}),
      node('register','firstPerson.setDamageable',640,110),
      node('ready','debug.print',960,110,{message:'Shooting target armed.',duration:1.2}),

      // The down/respawn chain is driven by the hit event itself. Polling it
      // from On Update would queue one delay per frame while the target is
      // down, which is the classic way this graph goes wrong.
      node('on_down','event.onTargetDown',80,500),
      node('state','firstPerson.getDamageableState',380,690),
      node('alive_branch','flow.branch',660,500),
      node('down_flag','variable.set',940,500,{name:'IsDown',value:true}),
      // Down, not gone. The killing shot hands the board to the ballistic body,
      // which topples it; this only tips it past its balance point so the fall
      // has somewhere to go. Hiding it removed it from the scene entirely, which
      // is wrong for something that is going to be a physics object.
      node('down_pose','scene.rotateObject',1220,500,{x:-24,y:0,z:0}),

      node('respawn_seconds','variable.get',1220,700,{name:'RespawnSeconds'}),
      node('respawn_enabled','math.compareNumber',1480,760,{operator:'>',b:0}),
      node('respawn_branch','flow.branch',1740,500),
      node('delay','flow.delay',2000,500,{seconds:4}),
      node('respawn','firstPerson.setDamageable',2260,500),
      node('up_pose','scene.setRotation',2540,500,{x:0,y:180,z:0}),
      node('clear_flag','variable.set',2820,500,{name:'IsDown',value:false}),
    ],
    edges:[
      edge('t_start','on_start','then','register','exec'),
      edge('t_owner','owner','object','register','object'),
      edge('t_health','health','value','register','health'),
      edge('t_team','team','value','register','team'),
      edge('t_ready','register','completed','ready','exec'),

      edge('t_down','on_down','then','alive_branch','exec'),
      edge('t_owner_state','owner','object','state','object'),
      edge('t_alive','state','alive','alive_branch','condition'),
      edge('t_down_flag','alive_branch','false','down_flag','exec'),
      edge('t_hide','down_flag','completed','down_pose','exec'),
      edge('t_owner_hide','owner','object','down_pose','object'),

      edge('t_respawn_check','down_pose','completed','respawn_branch','exec'),
      edge('t_respawn_value','respawn_seconds','value','respawn_enabled','a'),
      edge('t_respawn_cond','respawn_enabled','value','respawn_branch','condition'),
      edge('t_delay','respawn_branch','true','delay','exec'),
      edge('t_delay_seconds','respawn_seconds','value','delay','seconds'),
      edge('t_respawn','delay','completed','respawn','exec'),
      edge('t_respawn_owner','owner','object','respawn','object'),
      edge('t_respawn_health','health','value','respawn','health'),
      edge('t_respawn_team','team','value','respawn','team'),
      edge('t_show','respawn','completed','up_pose','exec'),
      edge('t_show_owner','owner','object','up_pose','object'),
      edge('t_clear','up_pose','completed','clear_flag','exec'),
    ],
    comments:[
      {id:'target_setup',title:'Registers this Logic Element as a shootable target. Every mesh under the root inherits the health pool; mark a child with damageableHitZone = head for headshot damage.',x:40,y:40,w:1120,h:330,color:'#34d399'},
      {id:'target_cycle',title:'Down and respawn cycle, driven once per knock-down. Respawn Delay 0 leaves the target down permanently. Replace the visibility toggle with an animation or a destruction effect when the level has one.',x:40,y:440,w:2960,h:400,color:'#fbbf24'},
    ],
    logicScene:{
      root:{id:'root',name:'Shooting Target Root',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#34d399'},
      elements:[
        sceneElement('target_stand','Target Stand','cylinder','root',[0,.45,0],[0,0,0],[.06,.45,.06],'#4b5563'),
        sceneElement('target_body','Target Body','box','root',[0,1.35,0],[0,0,0],[.32,.45,.09],'#e2603f'),
        sceneElement('target_head','Target Head','sphere','root',[0,1.95,0],[0,0,0],[.16,.16,.16],'#f8b76b'),
      ],
      components:[
        {id:'target_transform',elementId:'root',name:'Transform',type:'transform',linked:true},
        {id:'target_collider',elementId:'root',name:'Target Collision',type:'collider',linked:true,collider:{enabled:true,shape:'box',size:[.7,2.1,.35],offset:[0,1.05,0]}},
      ],
    },
  };
}

function makeFirstPersonTemplates(){
  const player = makePlayerGraph();
  const list = [];
  if(player){
    list.push({
      id:'logic-template-player-first-person',
      name:'Template - Player Character (First Person)',
      description:'Possessed first-person Character Pawn: eye camera, mouse/stick look with pitch clamp, aim down sights, view bob, recoil and a configurable hitscan weapon with magazine, reload and reserve ammo.',
      category:'Pawn / Character',
      graph:player,
    });
  }
  list.push({
    id:'logic-template-shooting-target',
    name:'Template - Shooting Target',
    description:'Unpossessed damageable target with health, head hit zone, points value and an optional respawn delay. Reacts to any first-person weapon hitscan.',
    category:'Gameplay / Shooter',
    graph:makeTargetGraph(),
  });
  return list;
}

if(window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.register) window.LK_LOGIC_TEMPLATES.register(makeFirstPersonTemplates());
window.LK_LOGIC_TEMPLATES_FPS = Object.freeze({WEAPON_PRESET_OPTIONS,presetValues,makePlayerGraph,makeTargetGraph,makeFirstPersonTemplates});
})();
