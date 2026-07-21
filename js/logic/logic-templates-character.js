/* =========================================================
   LOT KING - Generic Character Logic Element template
   ========================================================= */
(function(){
'use strict';

function node(id,type,x,y,data){ return {id,type,x:x||0,y:y||0,data:Object.assign({},data||{})}; }
function edge(id,fromNode,fromPin,toNode,toPin){ return {id,from:{node:fromNode,pin:fromPin},to:{node:toNode,pin:toPin}}; }
function sceneElement(id,name,primitive,parentId,position,rotation,scale,color){ return {id,name,type:'mesh',primitive,parentId:parentId||'root',linked:true,position:position||[0,0,0],rotation:rotation||[0,0,0],scale:scale||[1,1,1],color:color||'#64748b'}; }

const PRESET_OPTIONS = [
  {value:'normal',label:'Normal (balanced)'},
  {value:'civil',label:'Civil (slower / grounded)'},
  {value:'police',label:'Police (responsive / athletic)'},
];
const ANIMATION_SLOTS = [
  ['AnimIdle','idle','Idle','Idle — looping, in-place, no root motion. Neutral standing pose with a stable first/last frame.'],
  ['AnimWalk','walk','Walking','Walk — looping, in-place, no root motion. Forward walk cycle; the controller supplies world translation.'],
  ['AnimRun','run','Running','Run — looping, in-place, no root motion. Forward run/jog cycle matched to Run Speed.'],
  ['AnimStrafeLeft','strafeLeft','Left Strafe','Strafe Left — looping, in-place, no root motion. Optional lateral cycle; Walk is used as fallback.'],
  ['AnimStrafeRight','strafeRight','Right Strafe','Strafe Right — looping, in-place, no root motion. Optional lateral cycle; Walk is used as fallback.'],
  ['AnimJump','jump','Jump','Jump — one-shot, in-place, no root translation. Prefer a complete take-off/air/landing clip; gameplay height comes from Jump Height.'],
  ['AnimFall','fall','Falling Idle','Fall — optional looping in-air pose, in-place and without root motion. Reserved for the expanded airborne state.'],
  ['AnimLand','land','Landing','Land — optional short one-shot, in-place and without root motion. Reserved for landing transitions.'],
  ['AnimInteract','interact','Interact','Interact — optional one-shot in-place action (talk, inspect, press button), without root motion. It must return to the locomotion pose.'],
];

function makeGraph(){
  const variables = [
    {name:'PawnEnabled',type:'boolean',value:true,exposed:true,binding:'enabled',label:'Pawn Enabled',category:'Pawn'},
    {name:'Hidden',type:'boolean',value:false,exposed:true,binding:'hidden',label:'Hidden',category:'Pawn'},
    {name:'ControllerPlayerId',type:'number',value:1,exposed:true,binding:'playerId',label:'Controller Player ID',category:'Input',ui:'player-id'},
    {name:'SpawnX',type:'number',value:0,step:.1,exposed:true,binding:'spawn.x',label:'Spawn X',category:'Pawn / Spawn'},
    {name:'SpawnY',type:'number',value:0,step:.1,exposed:true,binding:'spawn.y',label:'Spawn Y',category:'Pawn / Spawn'},
    {name:'SpawnZ',type:'number',value:8,step:.1,exposed:true,binding:'spawn.z',label:'Spawn Z',category:'Pawn / Spawn'},
    {name:'SpawnHeading',type:'number',value:Math.PI,step:.01,exposed:true,binding:'spawn.heading',label:'Spawn Heading',category:'Pawn / Spawn'},
    {name:'WalkSpeed',type:'number',value:1.8,min:.2,max:8,step:.1,exposed:true,binding:'movement.walkSpeed',label:'Walk Speed (m/s)',category:'Movement'},
    {name:'RunSpeed',type:'number',value:5.4,min:.5,max:14,step:.1,exposed:true,binding:'movement.runSpeed',label:'Run Speed (m/s)',category:'Movement'},
    {name:'SprintMultiplier',type:'number',value:1.3,min:1,max:2.5,step:.05,exposed:true,binding:'movement.sprintMultiplier',label:'Sprint Multiplier',category:'Movement'},
    {name:'Acceleration',type:'number',value:13,min:1,max:80,step:.5,exposed:true,binding:'movement.acceleration',label:'Acceleration',category:'Movement'},
    {name:'TurnRate',type:'number',value:10,min:.5,max:40,step:.5,exposed:true,binding:'movement.turnRate',label:'Turn Rate (rad/s)',category:'Movement'},
    {name:'JumpHeight',type:'number',value:1.05,min:0,max:5,step:.05,exposed:true,binding:'movement.jumpHeight',label:'Jump Height (m)',category:'Movement'},
    {name:'Gravity',type:'number',value:22,min:1,max:80,step:.5,exposed:true,binding:'movement.gravity',label:'Gravity (m/s²)',category:'Movement'},
    {name:'AirControl',type:'number',value:.32,min:0,max:1,step:.05,exposed:true,binding:'movement.airControl',label:'Air Control',category:'Movement'},
    {name:'InputMode',type:'string',value:'camera',exposed:true,binding:'movement.inputMode',label:'Input Mode',category:'Movement',ui:'select',options:[{value:'camera',label:'Camera relative (recommended)'},{value:'heading',label:'Character heading'}]},
    {name:'Preset',type:'string',value:'normal',exposed:true,binding:'preset',label:'Character Preset',category:'Character',ui:'select',options:PRESET_OPTIONS,description:'Starting behavior profile. Applying it sets the baseline movement values; tune individual Movement fields afterward for a custom subtype.'},
    {name:'BlendResponsiveness',type:'number',value:9,min:.5,max:30,step:.5,exposed:true,binding:'locomotion.responsiveness',label:'Motion Blend Responsiveness',category:'Movement / Motion Blend'},
    {name:'BlendPrediction',type:'number',value:.12,min:0,max:.6,step:.01,exposed:true,binding:'locomotion.predictionTime',label:'Motion Blend Prediction (s)',category:'Movement / Motion Blend'},
    {name:'CameraMode',type:'string',value:'arcade',exposed:true,binding:'camera.mode',label:'Camera Mode',category:'Camera',ui:'select',options:[{value:'free',label:'Free'},{value:'arcade',label:'Arcade follow'},{value:'cinematic',label:'Cinematic'}]},
    {name:'CameraView',type:'string',value:'third',exposed:true,binding:'camera.view',label:'View',category:'Camera',ui:'select',options:[{value:'third',label:'Third person'},{value:'close',label:'Close third person'},{value:'first',label:'First person (lite)'}]},
    {name:'CameraDistance',type:'number',value:6.8,min:.2,max:40,step:.1,exposed:true,binding:'camera.distance',label:'Distance',category:'Camera'},
    {name:'CameraHeight',type:'number',value:2.35,min:.2,max:20,step:.1,exposed:true,binding:'camera.height',label:'Height',category:'Camera'},
    {name:'CameraLag',type:'number',value:7,min:.1,max:30,step:.1,exposed:true,binding:'camera.lag',label:'Lag',category:'Camera'},
    {name:'CameraFov',type:'number',value:62,min:20,max:130,step:1,exposed:true,binding:'camera.fov',label:'FOV',category:'Camera'},
    {name:'ShirtColor',type:'string',value:'#4f8fbf',exposed:true,binding:'appearance.shirtColor',label:'Top Color',category:'Appearance',ui:'color'},
    {name:'PantsColor',type:'string',value:'#263445',exposed:true,binding:'appearance.shortsColor',label:'Pants Color',category:'Appearance',ui:'color'},
    {name:'HairColor',type:'string',value:'#2b2118',exposed:true,binding:'appearance.hairColor',label:'Hair Color',category:'Appearance',ui:'color'},
    {name:'SkinColor',type:'string',value:'#d8a184',exposed:true,binding:'appearance.skinColor',label:'Skin Color',category:'Appearance',ui:'color'},
    {name:'AnimationLibrary',type:'string',value:'',exposed:true,binding:'animationLibrary',ui:'model-asset',label:'Animation Library GLB (clips only)',category:'Animations',description:'Optional clips-only GLB. It must use the same skeleton/bone names as the character model (for example the same Mixamo rig). Locomotion clips should be in-place; do not enable root motion.'},
  ];
  ANIMATION_SLOTS.forEach(([name,slot,value,label]) => variables.push({name,type:'string',value,exposed:true,binding:'animations.'+slot,label:label.split(' — ')[0]+' Clip',category:'Animations',description:label}));
  const graph = {
    version:1,name:'Template - Player Character (Normal)',scope:'element',enabled:true,variables,
    nodes:[
      node('on_start','event.onStart',80,100),node('get_self','pawn.getSelf',330,25),node('get_player','variable.get',330,145,{name:'ControllerPlayerId'}),node('possess','pawn.possess',590,100,{force:true}),node('get_camera','variable.get',580,230,{name:'CameraMode'}),node('camera','pawn.setCamera',850,100,{possess:true}),node('ready','debug.print',1120,100,{message:'Normal Character Pawn ready. WASD move, Shift sprint, Space jump, F interact.',duration:4}),
      node('on_update','event.onUpdate',80,410),node('move_input','character.getMoveInput',340,390),node('set_move','character.setMoveInput',650,410),
      node('on_jump','event.onKeyDown',80,650,{key:' '}),node('jump','character.jump',380,650),node('on_interact','event.onKeyDown',80,810,{key:'f'}),node('interact','character.playAction',380,810,{action:'interact'}),
    ],
    edges:[
      edge('e_start','on_start','then','possess','exec'),edge('e_self','get_self','pawn','possess','pawn'),edge('e_player','get_player','value','possess','playerId'),edge('e_possess_camera','possess','completed','camera','exec'),edge('e_self_camera','get_self','pawn','camera','pawn'),edge('e_mode','get_camera','value','camera','mode'),edge('e_ready','camera','completed','ready','exec'),
      edge('e_update','on_update','then','set_move','exec'),edge('e_x','move_input','x','set_move','x'),edge('e_z','move_input','z','set_move','z'),edge('e_sprint','move_input','sprint','set_move','sprint'),edge('e_jump','on_jump','then','jump','exec'),edge('e_interact','on_interact','then','interact','exec'),
    ],
    comments:[
      {id:'movement_help',title:'Generic Character base. Camera-relative input drives movement; the animation graph only supplies in-place poses. Movement, collision and jump remain authoritative in runtime.',x:40,y:35,w:1320,h:510,color:'#38bdf8'},
      {id:'action_help',title:'Space jumps. F plays the optional Interact one-shot. Extend this graph for civil/police/game-specific actions without changing the shared movement controller.',x:40,y:590,w:820,h:340,color:'#fbbf24'},
    ],
  };
  graph.logicScene = {
    root:{id:'root',name:'Player Character Root',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#38bdf8'},
    elements:[
      sceneElement('character_model','Character Model / Rigged GLB Placeholder','cube','root',[0,1.05,0],[0,0,0],[.001,.001,.001],'#334155'),
      sceneElement('torso_shirt','Torso Shirt','cube','root',[0,1.25,0],[0,0,0],[.46,.58,.26],'#4f8fbf'),
      sceneElement('hips_shorts','Hips Pants','cube','root',[0,.76,0],[0,0,0],[.44,.42,.25],'#263445'),
      sceneElement('leg_sock_left','Leg Left','cylinder','root',[-.12,.3,0],[0,0,0],[.13,.58,.13],'#263445'),sceneElement('leg_sock_right','Leg Right','cylinder','root',[.12,.3,0],[0,0,0],[.13,.58,.13],'#263445'),
      sceneElement('arm_skin_left','Arm Skin Left','cylinder','root',[-.31,1.25,0],[0,0,15],[.09,.52,.09],'#d8a184'),sceneElement('arm_skin_right','Arm Skin Right','cylinder','root',[.31,1.25,0],[0,0,-15],[.09,.52,.09],'#d8a184'),
      sceneElement('head_skin','Head Skin','sphere','root',[0,1.74,0],[0,0,0],[.3,.32,.3],'#d8a184'),sceneElement('hair_top','Hair Top','sphere','root',[0,1.86,-.02],[0,0,0],[.3,.18,.3],'#2b2118'),
      {id:'camera_anchor',name:'Player Camera Anchor',type:'camera',parentId:'root',linked:true,position:[0,2.1,-4.2],rotation:[0,0,0],scale:[1,1,1],color:'#a78bfa'},
    ],
    components:[{id:'root_transform',elementId:'root',name:'Transform',type:'transform',linked:true},{id:'pawn_character',elementId:'root',name:'Character Pawn',type:'player-pawn',linked:true},{id:'pawn_collision',elementId:'root',name:'Character Collision',type:'collider',linked:true,collider:{enabled:true,shape:'box',size:[.7,1.9,.7],offset:[0,.95,0]}},{id:'model_render',elementId:'character_model',name:'Imported Model / Placeholder',type:'render',linked:true}],
  };
  graph.characterPawn = {template:true,schemaVersion:1,id:'player-character-normal',preset:'normal',playerId:1,enabled:true,hidden:false,possessed:true,spawn:{x:0,y:0,z:8,heading:Math.PI},movement:{walkSpeed:1.8,runSpeed:5.4,sprintMultiplier:1.3,acceleration:13,turnRate:10,jumpHeight:1.05,gravity:22,airControl:.32,inputMode:'camera'},animationLibrary:null,locomotion:{responsiveness:9,predictionTime:.12},animations:ANIMATION_SLOTS.reduce((out,item)=>{out[item[1]]=item[2];return out;},{}),appearance:{shirtColor:'#4f8fbf',shortsColor:'#263445',socksColor:'#20252b',hairColor:'#2b2118',skinColor:'#d8a184'},camera:{mode:'arcade',view:'third',distance:6.8,height:2.35,lag:7,fov:62}};
  return graph;
}

function talkableNpcGraph(){
  const g=makeGraph();
  g.name='Template - Talkable Civil NPC';
  g.variables=[
    {name:'DialogueRadius',type:'number',value:3.8,min:.5,max:20,step:.1,exposed:true,label:'Interaction Radius',category:'Dialogue'},
    {name:'Message1',type:'string',value:"Let's see... First I'll need to calculate the radius of the bike tire...",exposed:true,label:'First Message',category:'Dialogue'},
    {name:'Message2',type:'string',value:'Sorry, this is a one-file project. I made it for fun in literally 10 to 20 minutes — maybe less — just the time to grab some resources, put them together, and make everything work in a single session with Fable 5. Yes, this is a 4-prompt project. "My guy", the world has changed — and it\'s still changing. With love, Jaydemks.',exposed:true,label:'Second Message',category:'Dialogue'},
    {name:'SecondMessage',type:'boolean',value:false,exposed:false},
  ];
  g.nodes=[
    node('on_start','event.onStart',60,80),node('start_hint','debug.print',340,80,{message:'Talkable NPC ready. Approach and press F.',duration:3}),
    node('on_interact','event.onKeyDown',60,300,{key:'f'}),node('player_pawn','pawn.getPlayerPawn',310,210,{playerId:1}),node('player_owner','pawn.getOwner',560,210),node('player_position','scene.getPosition',810,210),
    node('npc_owner','scene.getOwner',310,410),node('npc_position','scene.getPosition',560,410),node('distance','vector.distance',1060,300),node('radius','variable.get',1060,450,{name:'DialogueRadius'}),node('near','math.compareNumber',1320,330,{operator:'<='}),node('near_branch','flow.branch',1580,300),
    node('message_state','variable.get',1840,430,{name:'SecondMessage'}),node('message_branch','flow.branch',2100,300),node('message1','variable.get',2100,480,{name:'Message1'}),node('message2','variable.get',2100,600,{name:'Message2'}),node('print1','debug.print',2380,430,{duration:7}),node('print2','debug.print',2380,570,{duration:10}),node('toggle_message','variable.toggleBoolean',2640,500,{name:'SecondMessage'}),
  ];
  g.edges=[
    edge('e_start','on_start','then','start_hint','exec'),edge('e_key','on_interact','then','near_branch','exec'),edge('e_player_owner','player_pawn','pawn','player_owner','pawn'),edge('e_player_pos','player_owner','object','player_position','object'),edge('e_npc_pos','npc_owner','object','npc_position','object'),edge('e_dist_a','player_position','position','distance','a'),edge('e_dist_b','npc_position','position','distance','b'),edge('e_dist_cmp','distance','value','near','a'),edge('e_radius_cmp','radius','value','near','b'),edge('e_near','near','value','near_branch','condition'),edge('e_near_branch','near_branch','true','message_branch','exec'),edge('e_message_state','message_state','value','message_branch','condition'),edge('e_true','message_branch','true','print2','exec'),edge('e_false','message_branch','false','print1','exec'),edge('e_msg1','message1','value','print1','message'),edge('e_msg2','message2','value','print2','message'),edge('e_print1_toggle','print1','completed','toggle_message','exec'),edge('e_print2_toggle','print2','completed','toggle_message','exec'),
  ];
  g.comments=[{id:'dialogue',title:'Reusable proximity dialogue: Player 1 distance + F alternates two editable messages. Replace Print Debug with a project HUD/dialogue widget later.',x:35,y:160,w:2860,h:560,color:'#f59e0b'}];
  g.logicScene.root.name='Talkable Civil NPC Root';
  g.characterPawn.preset='civil';g.characterPawn.playerId=null;g.characterPawn.possessed=false;g.characterPawn.id='talkable-civil-npc';g.characterPawn.movement=Object.assign({},g.characterPawn.movement,{walkSpeed:1.45,runSpeed:4.4});
  return g;
}
function makeCharacterTemplates(){ return [
  {id:'logic-template-player-character-normal',name:'Template - Player Character (Normal)',description:'Reusable third-person Character Pawn baseline with normal/civil/police presets, camera-relative walking, running, sprinting, jump, collision and explicit in-place animation slots.',category:'Pawn / Character',graph:makeGraph()},
  {id:'logic-template-talkable-civil-npc',name:'Template - Talkable Civil NPC',description:'Unpossessed civil Character Pawn with a reusable Player 1 proximity check and two-message F interaction.',category:'Pawn / Character',graph:talkableNpcGraph()},
]; }
if(window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.register) window.LK_LOGIC_TEMPLATES.register(makeCharacterTemplates());
window.LK_LOGIC_TEMPLATES_CHARACTER = Object.freeze({ANIMATION_SLOTS,makeCharacterTemplates,talkableNpcGraph});
})();
