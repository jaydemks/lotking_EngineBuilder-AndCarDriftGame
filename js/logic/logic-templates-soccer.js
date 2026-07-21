/* =========================================================
   LOT KING - Soccer Logic Element templates
   Template pack for the soccer game mode: the Player Soccer
   Element pawn starter and the Penalty Shootout Manager.
   Registers through LK_LOGIC_TEMPLATES.register so the pack
   stays independent from the built-in template file.
   ========================================================= */
(function(){
'use strict';

function node(id, type, x, y, data){
  return {id, type, x:x || 0, y:y || 0, data:Object.assign({}, data || {})};
}
function edge(id, fromNode, fromPin, toNode, toPin){
  return {id, from:{node:fromNode, pin:fromPin}, to:{node:toNode, pin:toPin}};
}
function graph(name, variables, nodes, edges, comments){
  return {
    version:1, name, scope:'element', enabled:true,
    variables:variables || [], nodes:nodes || [], edges:edges || [], comments:comments || [],
  };
}
function sceneElement(id, name, primitive, parentId, position, rotation, scale, color){
  return {
    id, name, type:'mesh', primitive, parentId:parentId || 'root', linked:true,
    position:position || [0,0,0], rotation:rotation || [0,0,0], scale:scale || [1,1,1], color:color || '#64748b',
  };
}

const ROLE_OPTIONS = [
  {value:'striker', label:'Striker (Attaccante)'},
  {value:'winger', label:'Winger (Ala)'},
  {value:'midfielder', label:'Midfielder (Centrocampista)'},
  {value:'defender', label:'Defender (Difensore)'},
  {value:'goalkeeper', label:'Goalkeeper (Portiere)'},
];

// Animation slots exposed per instance. Labels tell the author which kind of
// Mixamo clip each action expects; values are matched fuzzily against the
// clips inside the assigned GLB.
const ANIMATION_SLOTS = [
  ['AnimIdle', 'idle', 'Idle', 'Idle Clip (standing)', 'Looping in-place idle; no root motion. Use a neutral football-ready pose.'],
  ['AnimWalk', 'walk', 'Walking', 'Walk Clip (slow locomotion)', 'Looping forward walk, in-place and without root motion; runtime supplies translation.'],
  ['AnimRun', 'run', 'Running', 'Run Clip (fast locomotion)', 'Looping forward run/jog, in-place and without root motion.'],
  ['AnimStrafeLeft', 'strafeLeft', 'Left Strafe', 'Strafe Left Clip (lateral)', 'Optional looping left strafe, in-place and without root motion.'],
  ['AnimStrafeRight', 'strafeRight', 'Right Strafe', 'Strafe Right Clip (lateral)', 'Optional looping right strafe, in-place and without root motion.'],
  ['AnimJump', 'jump', 'Jump', 'Jump Clip (salto)', 'One-shot in-place jump; no root translation. Jump height and gravity are controlled by Movement.'],
  ['AnimShoot', 'shoot', 'Soccer Strike', 'Shoot Clip (tiro in porta)', 'One-shot in-place kick. Keep the support foot near the origin; ball impulse is handled by Soccer Logic.'],
  ['AnimPass', 'pass', 'Soccer Pass', 'Pass Clip (passaggio corto)', 'One-shot in-place short pass without root translation.'],
  ['AnimCross', 'cross', 'Soccer Pass', 'Cross Clip (traversone)', 'One-shot in-place cross without root translation.'],
  ['AnimSave', 'save', 'Goalkeeper Catch', 'Save Clip (parata portiere)', 'One-shot goalkeeper catch in-place; gameplay reach comes from Keeper settings.'],
  ['AnimDiveLeft', 'diveLeft', 'Goalkeeper Dive Left', 'Dive Left Clip (tuffo sinistro)', 'One-shot in-place left dive. Do not bake root translation; Keeper Dive moves the Pawn.'],
  ['AnimDiveRight', 'diveRight', 'Goalkeeper Dive Right', 'Dive Right Clip (tuffo destro)', 'One-shot in-place right dive. Do not bake root translation; Keeper Dive moves the Pawn.'],
  ['AnimCelebrate', 'celebrate', 'Victory', 'Celebrate Clip (esultanza)', 'One-shot or short loop in-place celebration without root translation.'],
  ['AnimDefeat', 'defeat', 'Defeated', 'Defeat Clip (delusione)', 'One-shot in-place defeat reaction without root translation.'],
];

function playerSoccerTemplateGraph(){
  const variables = [
    {name:'PawnEnabled', type:'boolean', value:true, exposed:true, binding:'enabled', label:'Pawn Enabled', category:'Pawn'},
    {name:'Hidden', type:'boolean', value:false, exposed:true, binding:'hidden', label:'Hidden', category:'Pawn'},
    {name:'ControllerPlayerId', type:'number', value:1, exposed:true, binding:'playerId', label:'Controller Player ID', category:'Input', ui:'player-id'},
    {name:'SpawnX', type:'number', value:0, step:.1, exposed:true, binding:'spawn.x', label:'Spawn X', category:'Pawn / Spawn'},
    {name:'SpawnY', type:'number', value:0, step:.1, exposed:true, binding:'spawn.y', label:'Spawn Y', category:'Pawn / Spawn'},
    {name:'SpawnZ', type:'number', value:0, step:.1, exposed:true, binding:'spawn.z', label:'Spawn Z', category:'Pawn / Spawn'},
    {name:'SpawnHeading', type:'number', value:0, step:.01, exposed:true, binding:'spawn.heading', label:'Spawn Heading', category:'Pawn / Spawn'},
    {name:'Role', type:'string', value:'striker', exposed:true, binding:'role', label:'Role', category:'Soccer / Role', ui:'select', options:ROLE_OPTIONS},
    {name:'WalkSpeed', type:'number', value:1.9, min:.2, max:6, step:.1, exposed:true, binding:'movement.walkSpeed', label:'Walk Speed (m/s)', category:'Movement'},
    {name:'RunSpeed', type:'number', value:6, min:.5, max:12, step:.1, exposed:true, binding:'movement.runSpeed', label:'Run Speed (m/s)', category:'Movement'},
    {name:'SprintMultiplier', type:'number', value:1.35, min:1, max:2.2, step:.05, exposed:true, binding:'movement.sprintMultiplier', label:'Sprint Multiplier', category:'Movement'},
    {name:'Acceleration', type:'number', value:14, min:1, max:60, step:.5, exposed:true, binding:'movement.acceleration', label:'Acceleration', category:'Movement'},
    {name:'TurnRate', type:'number', value:10, min:.5, max:30, step:.5, exposed:true, binding:'movement.turnRate', label:'Turn Rate (rad/s)', category:'Movement'},
    {name:'JumpHeight', type:'number', value:1.1, min:0, max:5, step:.1, exposed:true, binding:'movement.jumpHeight', label:'Jump Height (m)', category:'Movement'},
    {name:'Gravity', type:'number', value:22, min:1, max:80, step:.5, exposed:true, binding:'movement.gravity', label:'Gravity (m/s²)', category:'Movement'},
    {name:'InputMode', type:'string', value:'camera', exposed:true, binding:'movement.inputMode', label:'Input Mode', category:'Movement', ui:'select', options:[{value:'camera',label:'Camera relative (free)'},{value:'heading',label:'Character heading'}]},
    {name:'BlendResponsiveness', type:'number', value:9, min:.5, max:30, step:.5, exposed:true, binding:'locomotion.responsiveness', label:'Motion Blend Responsiveness', category:'Movement / Motion Blend'},
    {name:'BlendPrediction', type:'number', value:.12, min:0, max:.6, step:.01, exposed:true, binding:'locomotion.predictionTime', label:'Motion Blend Prediction (s)', category:'Movement / Motion Blend'},
    {name:'KeeperDiveDistance', type:'number', value:2.6, min:.5, max:5, step:.1, exposed:true, binding:'keeper.diveDistance', label:'Dive Distance (m)', category:'Goalkeeper'},
    {name:'KeeperDiveDuration', type:'number', value:.55, min:.2, max:1.5, step:.05, exposed:true, binding:'keeper.diveDuration', label:'Dive Duration (s)', category:'Goalkeeper'},
    {name:'KeeperReach', type:'number', value:1.1, min:.4, max:2.5, step:.05, exposed:true, binding:'keeper.reach', label:'Save Reach (m)', category:'Goalkeeper'},
    {name:'ShirtColor', type:'string', value:'#e11d48', exposed:true, binding:'appearance.shirtColor', label:'Shirt Color', category:'Appearance', ui:'color'},
    {name:'ShortsColor', type:'string', value:'#f8fafc', exposed:true, binding:'appearance.shortsColor', label:'Shorts Color', category:'Appearance', ui:'color'},
    {name:'SocksColor', type:'string', value:'#e11d48', exposed:true, binding:'appearance.socksColor', label:'Socks Color', category:'Appearance', ui:'color'},
    {name:'HairColor', type:'string', value:'#2b2118', exposed:true, binding:'appearance.hairColor', label:'Hair Color', category:'Appearance', ui:'color'},
    {name:'SkinColor', type:'string', value:'#d8a184', exposed:true, binding:'appearance.skinColor', label:'Skin Color', category:'Appearance', ui:'color'},
    {name:'CameraMode', type:'string', value:'arcade', exposed:true, binding:'camera.mode', label:'Camera Mode', category:'Camera', ui:'select', options:[{value:'free',label:'Free'},{value:'arcade',label:'Arcade'},{value:'cinematic',label:'Cinematic'}]},
    {name:'CameraView', type:'string', value:'third', exposed:true, binding:'camera.view', label:'View', category:'Camera', ui:'select', options:[{value:'third',label:'Third person'},{value:'close',label:'Close third person'},{value:'first',label:'First person (lite)'}]},
    {name:'CameraDistance', type:'number', value:7.5, min:1, max:40, step:.1, exposed:true, binding:'camera.distance', label:'Distance', category:'Camera'},
    {name:'CameraHeight', type:'number', value:2.6, min:.2, max:20, step:.1, exposed:true, binding:'camera.height', label:'Height', category:'Camera'},
    {name:'CameraLag', type:'number', value:6.5, min:.1, max:30, step:.1, exposed:true, binding:'camera.lag', label:'Lag', category:'Camera'},
    {name:'CameraFov', type:'number', value:60, min:20, max:130, step:1, exposed:true, binding:'camera.fov', label:'FOV', category:'Camera'},
  ];
  variables.push({name:'AnimationLibrary', type:'string', value:'', exposed:true, binding:'animationLibrary', ui:'model-asset', label:'Animation Library GLB (clips only)', category:'Animations (Mixamo clips)', description:'Optional GLB containing only animations on the same skeleton/bone names as the character model. Export locomotion in-place with root motion disabled.'});
  ANIMATION_SLOTS.forEach(([varName, slot, clip, label, description]) => {
    variables.push({name:varName, type:'string', value:clip, exposed:true, binding:'animations.' + slot, label, category:'Animations (Mixamo clips)', description});
  });

  const g = graph('Template - Player Soccer Element', variables, [
    node('on_start', 'event.onStart', 80, 100),
    node('get_self_start', 'pawn.getSelf', 330, 25),
    node('get_player_start', 'variable.get', 330, 145, {name:'ControllerPlayerId'}),
    node('possess_self', 'pawn.possess', 590, 100, {force:true}),
    node('get_camera_mode', 'variable.get', 580, 230, {name:'CameraMode'}),
    node('set_camera_start', 'pawn.setCamera', 850, 100, {possess:true}),
    node('print_ready', 'debug.print', 1120, 100, {message:'Player Soccer Pawn ready.', duration:3}),
    node('on_update', 'event.onUpdate', 80, 400),
    node('move_input', 'soccer.getMoveInput', 340, 380),
    node('set_move', 'soccer.setMoveInput', 640, 400),
    node('on_key_shoot', 'event.onKeyDown', 80, 620, {key:'f'}),
    node('play_shoot', 'soccer.playAction', 380, 620, {action:'shoot'}),
    node('on_key_dive_left', 'event.onKeyDown', 80, 780, {key:'q'}),
    node('play_dive_left', 'soccer.playAction', 380, 780, {action:'diveLeft'}),
    node('on_key_dive_right', 'event.onKeyDown', 80, 940, {key:'e'}),
    node('play_dive_right', 'soccer.playAction', 380, 940, {action:'diveRight'}),
    node('on_key_jump', 'event.onKeyDown', 80, 1100, {key:' '}),
    node('do_jump', 'soccer.jump', 380, 1100),
  ], [
    edge('e_start_possess', 'on_start', 'then', 'possess_self', 'exec'),
    edge('e_self_possess', 'get_self_start', 'pawn', 'possess_self', 'pawn'),
    edge('e_player_possess', 'get_player_start', 'value', 'possess_self', 'playerId'),
    edge('e_possess_camera', 'possess_self', 'completed', 'set_camera_start', 'exec'),
    edge('e_self_camera', 'get_self_start', 'pawn', 'set_camera_start', 'pawn'),
    edge('e_mode_camera', 'get_camera_mode', 'value', 'set_camera_start', 'mode'),
    edge('e_camera_ready', 'set_camera_start', 'completed', 'print_ready', 'exec'),
    edge('e_update_move', 'on_update', 'then', 'set_move', 'exec'),
    edge('e_input_x', 'move_input', 'x', 'set_move', 'x'),
    edge('e_input_z', 'move_input', 'z', 'set_move', 'z'),
    edge('e_input_sprint', 'move_input', 'sprint', 'set_move', 'sprint'),
    edge('e_key_shoot', 'on_key_shoot', 'then', 'play_shoot', 'exec'),
    edge('e_key_dive_left', 'on_key_dive_left', 'then', 'play_dive_left', 'exec'),
    edge('e_key_dive_right', 'on_key_dive_right', 'then', 'play_dive_right', 'exec'),
    edge('e_key_jump', 'on_key_jump', 'then', 'do_jump', 'exec'),
  ], [
    {id:'comment_pawn', title:'Soccer Pawn: possession + camera on start, camera-relative free movement with motion blending every update.', x:42, y:42, w:1330, h:460, color:'#4ade80'},
    {id:'comment_actions', title:'Role actions: F = shoot (kicker roles). Q/E = dive left/right (goalkeeper). Space = jump. Add Kick Soccer Ball after the shoot action to hit the ball.', x:42, y:560, w:900, h:640, color:'#fbbf24'},
  ]);

  // Placeholder humanoid rig. Element names intentionally match the
  // appearance live-edit rules (Shirt / Shorts / Sock / Hair / Skin) so color
  // variables work before a Mixamo GLB replaces the placeholder.
  g.logicScene = {
    root:{id:'root', name:'Player Soccer Root', type:'empty', linked:true, position:[0,0,0], rotation:[0,0,0], scale:[1,1,1], color:'#4ade80'},
    elements:[
      sceneElement('character_model', 'Character Model / Mixamo GLB Placeholder', 'cube', 'root', [0,1.05,0], [0,0,0], [.001,.001,.001], '#334155'),
      sceneElement('torso_shirt', 'Torso Shirt', 'cube', 'root', [0,1.25,0], [0,0,0], [.46,.58,.26], '#e11d48'),
      sceneElement('hips_shorts', 'Hips Shorts', 'cube', 'root', [0,.82,0], [0,0,0], [.44,.3,.25], '#f8fafc'),
      sceneElement('leg_sock_left', 'Leg Sock Left', 'cylinder', 'root', [-.12,.35,0], [0,0,0], [.13,.62,.13], '#e11d48'),
      sceneElement('leg_sock_right', 'Leg Sock Right', 'cylinder', 'root', [.12,.35,0], [0,0,0], [.13,.62,.13], '#e11d48'),
      sceneElement('arm_skin_left', 'Arm Skin Left', 'cylinder', 'root', [-.31,1.25,0], [0,0,15], [.09,.52,.09], '#d8a184'),
      sceneElement('arm_skin_right', 'Arm Skin Right', 'cylinder', 'root', [.31,1.25,0], [0,0,-15], [.09,.52,.09], '#d8a184'),
      sceneElement('head_skin', 'Head Skin', 'sphere', 'root', [0,1.74,0], [0,0,0], [.3,.32,.3], '#d8a184'),
      sceneElement('hair_top', 'Hair Top', 'sphere', 'root', [0,1.86,-.02], [0,0,0], [.3,.18,.3], '#2b2118'),
      {id:'camera_anchor', name:'Player Camera Anchor', type:'camera', parentId:'root', linked:true, position:[0,2.2,-4.5], rotation:[0,0,0], scale:[1,1,1], color:'#a78bfa'},
    ],
    components:[
      {id:'root_transform', elementId:'root', name:'Transform', type:'transform', linked:true},
      {id:'pawn_soccer', elementId:'root', name:'Soccer Pawn', type:'player-pawn', linked:true},
      {id:'pawn_collision', elementId:'root', name:'Character Collision', type:'collider', linked:true, collider:{enabled:true, shape:'box', size:[.6,1.9,.6], offset:[0,.95,0]}},
      {id:'model_render', elementId:'character_model', name:'Imported Model / Placeholder', type:'render', linked:true},
    ],
  };

  // Authoring definition consumed by LK_RUNTIME_SOCCER_PAWNS.createLogic.
  // Runtime state (speed, current action, dive timers) lives on the Pawn
  // instance and must never be written back into the graph.
  g.soccerPawn = {
    template:true, schemaVersion:1, id:'player-soccer-logic', playerId:1, enabled:true, hidden:false, possessed:true,
    role:'striker',
    movement:{walkSpeed:1.9, runSpeed:6, sprintMultiplier:1.35, acceleration:14, turnRate:10, jumpHeight:1.1, gravity:22, airControl:.35, inputMode:'camera'},
    animationLibrary:null,
    locomotion:{responsiveness:9, predictionTime:.12},
    keeper:{diveDistance:2.6, diveDuration:.55, reach:1.1},
    animations:ANIMATION_SLOTS.reduce((map, [, slot, clip]) => { map[slot] = clip; return map; }, {}),
    appearance:{shirtColor:'#e11d48', shortsColor:'#f8fafc', socksColor:'#e11d48', hairColor:'#2b2118', skinColor:'#d8a184', hairStyle:'short', number:9},
    camera:{mode:'arcade', view:'third', distance:7.5, height:2.6, lag:6.5, fov:60},
  };
  return g;
}

function penaltyShootoutTemplateGraph(){
  const g = graph('Template - Penalty Shootout Manager', [
    {name:'KicksPerTeam', type:'number', value:5, min:1, max:20, step:1, exposed:true, label:'Kicks Per Team', category:'Shootout'},
    {name:'TeamAName', type:'string', value:'Home', exposed:true, label:'Team A Name', category:'Shootout'},
    {name:'TeamBName', type:'string', value:'Away', exposed:true, label:'Team B Name', category:'Shootout'},
    {name:'BallId', type:'string', value:'penalty-ball', exposed:true, label:'Ball ID', category:'Ball'},
    {name:'SpotX', type:'number', value:0, step:.1, exposed:true, label:'Penalty Spot X', category:'Ball'},
    {name:'SpotZ', type:'number', value:0, step:.1, exposed:true, label:'Penalty Spot Z', category:'Ball'},
    {name:'GoalX', type:'number', value:0, step:.1, exposed:true, label:'Goal Center X', category:'Goal'},
    {name:'GoalZ', type:'number', value:11, step:.1, exposed:true, label:'Goal Center Z', category:'Goal'},
    {name:'GoalHeading', type:'number', value:3.1416, step:.01, exposed:true, label:'Goal Heading (rad)', category:'Goal'},
  ], [
    node('on_start', 'event.onStart', 80, 120),
    node('get_goal_x', 'variable.get', 320, 20, {name:'GoalX'}),
    node('get_goal_z', 'variable.get', 320, 90, {name:'GoalZ'}),
    node('make_goal_pos', 'vector.make3', 560, 40, {y:0}),
    node('get_goal_heading', 'variable.get', 560, 170, {name:'GoalHeading'}),
    node('register_goal', 'soccer.registerGoal', 820, 120, {team:'A'}),
    node('get_spot_x', 'variable.get', 820, 320, {name:'SpotX'}),
    node('get_spot_z', 'variable.get', 820, 390, {name:'SpotZ'}),
    node('make_spot_pos', 'vector.make3', 1060, 340, {y:0}),
    node('get_ball_id', 'variable.get', 1060, 470, {name:'BallId'}),
    node('spawn_ball', 'soccer.spawnBall', 1300, 120),
    node('get_kicks', 'variable.get', 1300, 320, {name:'KicksPerTeam'}),
    node('get_team_a', 'variable.get', 1300, 390, {name:'TeamAName'}),
    node('get_team_b', 'variable.get', 1300, 460, {name:'TeamBName'}),
    node('configure_penalty', 'penalty.configure', 1600, 120),
    node('start_penalty', 'penalty.start', 1900, 120),
    node('print_started', 'debug.print', 2160, 120, {message:'Penalty shootout started.', duration:3}),
    node('on_kick_ready', 'event.onPenaltyKickReady', 80, 620),
    node('begin_kick', 'penalty.beginKick', 380, 620),
    node('print_ready', 'debug.print', 660, 620, {message:'Next penalty: kicker in control (F to shoot).', duration:2.5}),
    node('on_result', 'event.onPenaltyResult', 80, 800),
    node('print_result', 'debug.print', 380, 800, {message:'Penalty resolved. Score updated.', duration:2.5}),
    node('on_finished', 'event.onShootoutFinished', 80, 980),
    node('print_finished', 'debug.print', 380, 980, {message:'Shootout finished!', duration:5}),
  ], [
    edge('e_start_goal', 'on_start', 'then', 'register_goal', 'exec'),
    edge('e_goal_x', 'get_goal_x', 'value', 'make_goal_pos', 'x'),
    edge('e_goal_z', 'get_goal_z', 'value', 'make_goal_pos', 'z'),
    edge('e_goal_pos', 'make_goal_pos', 'vector', 'register_goal', 'position'),
    edge('e_goal_heading', 'get_goal_heading', 'value', 'register_goal', 'heading'),
    edge('e_goal_ball', 'register_goal', 'completed', 'spawn_ball', 'exec'),
    edge('e_spot_x', 'get_spot_x', 'value', 'make_spot_pos', 'x'),
    edge('e_spot_z', 'get_spot_z', 'value', 'make_spot_pos', 'z'),
    edge('e_spot_pos', 'make_spot_pos', 'vector', 'spawn_ball', 'position'),
    edge('e_ball_id', 'get_ball_id', 'value', 'spawn_ball', 'ballId'),
    edge('e_ball_configure', 'spawn_ball', 'completed', 'configure_penalty', 'exec'),
    edge('e_ball_id_configure', 'spawn_ball', 'ballId', 'configure_penalty', 'ballId'),
    edge('e_kicks_configure', 'get_kicks', 'value', 'configure_penalty', 'kicksPerTeam'),
    edge('e_team_a_configure', 'get_team_a', 'value', 'configure_penalty', 'teamA'),
    edge('e_team_b_configure', 'get_team_b', 'value', 'configure_penalty', 'teamB'),
    edge('e_configure_start', 'configure_penalty', 'completed', 'start_penalty', 'exec'),
    edge('e_start_print', 'start_penalty', 'completed', 'print_started', 'exec'),
    edge('e_ready_begin', 'on_kick_ready', 'then', 'begin_kick', 'exec'),
    edge('e_begin_print', 'begin_kick', 'completed', 'print_ready', 'exec'),
    edge('e_result_print', 'on_result', 'then', 'print_result', 'exec'),
    edge('e_finished_print', 'on_finished', 'then', 'print_finished', 'exec'),
  ], [
    {id:'comment_setup', title:'On Start: register the goal line (7.32 x 2.44), spawn the ball on the penalty spot (11 m from goal), configure and start the shootout.', x:42, y:-40, w:2380, h:560, color:'#38bdf8'},
    {id:'comment_events', title:'Shootout events: kick ready -> aim phase; ball outcome (goal / saved / out) is detected automatically and advances the rounds. Replace the prints with your HUD.', x:42, y:560, w:1000, h:520, color:'#fbbf24'},
  ]);
  g.logicScene = {
    version:1,
    selected:'root',
    elements:[{
      id:'root', name:'Default Mesh', kind:'mesh', parent:null, mesh:'box', color:'#38bdf8',
      t:{p:[0,0,0], r:[0,0,0], s:[.4,.4,.4]},
      components:{render:true, collider:{enabled:false, shape:'box', size:[1,1,1], radius:.5, offset:[0,0,0], static:true}},
    }],
  };
  return g;
}

function makeSoccerTemplates(){
  return [
    {
      id:'logic-template-player-soccer',
      name:'Template - Player Soccer Element',
      description:'Editable Soccer Pawn starter: role up to goalkeeper, Mixamo GLB slot with per-action animation clips, motion-blended free movement, live-edit kit colors and camera. Duplicate per player and change role/kit per instance.',
      category:'Pawn / Soccer',
      graph:playerSoccerTemplateGraph(),
    },
    {
      id:'logic-template-penalty-shootout',
      name:'Template - Penalty Shootout Manager',
      description:'Referee Logic Element for a penalty shootout: registers the goal line, spawns the ball on the spot, runs alternating kicks with sudden death and emits score events.',
      category:'Gameplay / Soccer',
      graph:penaltyShootoutTemplateGraph(),
    },
  ];
}

if(window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.register){
  window.LK_LOGIC_TEMPLATES.register(makeSoccerTemplates());
}
window.LK_LOGIC_TEMPLATES_SOCCER = Object.freeze({makeSoccerTemplates});
})();
