/* =========================================================
   LOT KING - Built-in Logic Element templates
   Small, editable starter graphs shown in the Assets panel.
   ========================================================= */
(function(){
'use strict';

function clone(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function node(id, type, x, y, data){
  return {id, type, x:x || 0, y:y || 0, data:Object.assign({}, data || {})};
}

function edge(id, fromNode, fromPin, toNode, toPin){
  return {id, from:{node:fromNode, pin:fromPin}, to:{node:toNode, pin:toPin}};
}

function sceneRoot(color){
  return {
    version:1,
    selected:'root',
    elements:[{
      id:'root',
      name:'Default Mesh',
      kind:'mesh',
      parent:null,
      mesh:'box',
      color:color || '#7dd3fc',
      t:{p:[0,0,0], r:[0,0,0], s:[1,1,1]},
      components:{render:true, collider:{enabled:false, shape:'box', size:[1,1,1], radius:.5, offset:[0,0,0], static:true}},
    }],
  };
}

function graph(name, variables, nodes, edges, comments, color){
  return {
    version:1,
    name:name,
    scope:'element',
    enabled:true,
    variables:variables || [],
    nodes:nodes || [],
    edges:edges || [],
    comments:comments || [],
    logicScene:sceneRoot(color),
  };
}

function playerCarTemplateGraph(){
  const g = graph('Template - Player Car Logic Element', [
    {name:'PawnEnabled', type:'boolean', value:true, exposed:true, label:'Pawn Enabled', category:'Pawn'},
    {name:'Hidden', type:'boolean', value:false, exposed:true, label:'Hidden', category:'Pawn'},
    {name:'ControllerPlayerId', type:'number', value:1, exposed:true, label:'Controller Player ID', category:'Input', ui:'player-id'},
    {name:'Horsepower', type:'number', value:450, exposed:true, label:'Horsepower', category:'Driving'},
    {name:'Torque', type:'number', value:5, exposed:true, label:'Torque', category:'Driving'},
    {name:'MaxSpeed', type:'number', value:7, exposed:true, label:'Max Speed', category:'Driving'},
    {name:'CameraMode', type:'string', value:'arcade', exposed:true, label:'Camera Mode', category:'Camera'},
    {name:'HeadlightsEnabled', type:'boolean', value:true, exposed:true, label:'Headlights', category:'Lights'},
    {name:'ExhaustEnabled', type:'boolean', value:true, exposed:true, label:'Exhaust', category:'Effects'},
    {name:'SkidsEnabled', type:'boolean', value:true, exposed:true, label:'Skids', category:'Effects'},
  ], [
    node('on_start', 'event.onStart', 80, 100),
    node('print_ready', 'debug.print', 360, 100, {message:'Player Car Logic Element ready — assign/import a vehicle model and connect Pawn runtime logic.', duration:3}),
    node('on_update', 'event.onUpdate', 80, 330),
    node('get_player_id', 'variable.get', 340, 250, {name:'ControllerPlayerId'}),
    node('player_drive', 'input.playerDrive', 590, 270),
    node('get_owner', 'scene.getOwner', 590, 480),
    node('get_speed', 'variable.get', 840, 540, {name:'MaxSpeed'}),
    node('speed_delta', 'math.multiply', 1070, 485),
    node('throttle_delta', 'math.multiply', 1300, 425),
    node('forward_vector', 'vector.make3', 1530, 400, {x:0, y:0}),
    node('move_vehicle', 'scene.translateObject', 1790, 330),
  ], [edge('e_start_ready', 'on_start', 'then', 'print_ready', 'exec')], [
    {id:'comment_pawn', title:'Editable Player Car authoring template. Use “Duplicate as Logic Element” on the built-in Player Car for an exact project snapshot.', x:42, y:42, w:930, h:210, color:'#38bdf8'},
  ], '#60a5fa');
  g.edges.push(
    edge('e_update_move', 'on_update', 'then', 'move_vehicle', 'exec'),
    edge('e_player_id_drive', 'get_player_id', 'value', 'player_drive', 'playerId'),
    edge('e_owner_move', 'get_owner', 'object', 'move_vehicle', 'object'),
    edge('e_speed_mul_a', 'get_speed', 'value', 'speed_delta', 'a'),
    edge('e_delta_mul_b', 'on_update', 'deltaTime', 'speed_delta', 'b'),
    edge('e_speed_throttle_a', 'speed_delta', 'value', 'throttle_delta', 'a'),
    edge('e_drive_throttle_b', 'player_drive', 'throttle', 'throttle_delta', 'b'),
    edge('e_mul_vector_z', 'throttle_delta', 'value', 'forward_vector', 'z'),
    edge('e_vector_move', 'forward_vector', 'vector', 'move_vehicle', 'delta')
  );
  const element = (id, name, primitive, parentId, position, rotation, scale, color) => ({
    id, name, type:'mesh', primitive, parentId:parentId || 'root', linked:true,
    position:position || [0,0,0], rotation:rotation || [0,0,0], scale:scale || [1,1,1], color:color || '#64748b',
  });
  g.logicScene = {
    root:{id:'root', name:'Player Car Root', type:'empty', linked:true, position:[0,0,0], rotation:[0,0,0], scale:[1,1,1], color:'#60a5fa'},
    elements:[
      element('vehicle_model', 'Vehicle Model / GLB Placeholder', 'cube', 'root', [0,.75,0], [0,0,0], [1.9,.65,4.1], '#2563eb'),
      element('wheel_front_left', 'Wheel Front Left', 'cylinder', 'root', [-1,.38,1.3], [0,0,Math.PI/2], [.42,.26,.42], '#111827'),
      element('wheel_front_right', 'Wheel Front Right', 'cylinder', 'root', [1,.38,1.3], [0,0,Math.PI/2], [.42,.26,.42], '#111827'),
      element('wheel_rear_left', 'Wheel Rear Left', 'cylinder', 'root', [-1,.38,-1.3], [0,0,Math.PI/2], [.42,.26,.42], '#111827'),
      element('wheel_rear_right', 'Wheel Rear Right', 'cylinder', 'root', [1,.38,-1.3], [0,0,Math.PI/2], [.42,.26,.42], '#111827'),
      {id:'camera_anchor', name:'Player Camera Anchor', type:'camera', parentId:'root', linked:true, position:[0,2.4,-5.5], rotation:[0,0,0], scale:[1,1,1], color:'#a78bfa'},
      {id:'headlight_left', name:'Headlight Left', type:'light', parentId:'root', linked:true, position:[-.62,.72,2.05], rotation:[0,0,0], scale:[1,1,1], color:'#fff7cc'},
      {id:'headlight_right', name:'Headlight Right', type:'light', parentId:'root', linked:true, position:[.62,.72,2.05], rotation:[0,0,0], scale:[1,1,1], color:'#fff7cc'},
      {id:'exhaust_left', name:'Exhaust Left', type:'empty', parentId:'root', linked:true, position:[-.55,.35,-2.05], rotation:[0,0,0], scale:[1,1,1], color:'#94a3b8'},
      {id:'exhaust_right', name:'Exhaust Right', type:'empty', parentId:'root', linked:true, position:[.55,.35,-2.05], rotation:[0,0,0], scale:[1,1,1], color:'#94a3b8'},
    ],
    components:[
      {id:'root_transform', elementId:'root', name:'Transform', type:'transform', linked:true},
      {id:'pawn_vehicle', elementId:'root', name:'Vehicle Pawn', type:'player-pawn', linked:true},
      {id:'pawn_collision', elementId:'root', name:'Vehicle Collision', type:'collider', linked:true, collider:{enabled:true, shape:'box', size:[1.9,1.1,4.1]}},
      {id:'model_render', elementId:'vehicle_model', name:'Imported Model / Placeholder', type:'render', linked:true},
    ],
  };
  g.playerPawnBlueprint = {template:true, version:1, controllerIndex:0, enabled:true, hidden:false};
  return g;
}

function makeTemplates(){
  return [
    {
      id:'logic-template-player-car',
      name:'Template - Player Car Logic Element',
      description:'Editable vehicle Pawn starter with organized model, wheel, camera, light, exhaust and collision hierarchy. Duplicate the built-in Player Car as Logic Element for an exact current-rig copy.',
      category:'Pawn / Vehicle',
      graph:playerCarTemplateGraph(),
    },
    {
      id:'logic-template-rotating-cube',
      name:'Template - Rotating Cube',
      description:'A local Logic Element that rotates its Default Mesh every frame.',
      category:'Gameplay',
      graph:graph('Template - Rotating Cube', [
        {name:'speedY', type:'number', value:45, exposed:true, label:'Y Speed'},
      ], [
        node('on_start', 'event.onStart', 80, 80),
        node('print_start', 'debug.print', 350, 80, {message:'Rotating Cube started', duration:2.5}),
        node('on_update', 'event.onUpdate', 80, 240),
        node('get_root', 'scene.getElement', 350, 200, {name:'Default Mesh'}),
        node('get_speed', 'variable.get', 350, 335, {name:'speedY'}),
        node('delta_speed', 'math.multiply', 610, 325),
        node('make_delta', 'vector.make3', 860, 285, {x:0, z:0}),
        node('rotate_root', 'scene.rotateObject', 1130, 240),
      ], [
        edge('e_start_print', 'on_start', 'then', 'print_start', 'exec'),
        edge('e_update_rotate', 'on_update', 'then', 'rotate_root', 'exec'),
        edge('e_root_rotate', 'get_root', 'object', 'rotate_root', 'object'),
        edge('e_speed_multiply_a', 'get_speed', 'value', 'delta_speed', 'a'),
        edge('e_delta_multiply_b', 'on_update', 'deltaTime', 'delta_speed', 'b'),
        edge('e_multiply_make_y', 'delta_speed', 'value', 'make_delta', 'y'),
        edge('e_delta_rotate', 'make_delta', 'vector', 'rotate_root', 'delta'),
      ], [
        {id:'comment_intro', title:'Every frame: deltaTime multiplied by exposed Y Speed', x:42, y:190, w:1360, h:260, color:'#38bdf8'},
      ], '#7dd3fc'),
    },
    {
      id:'logic-template-click-color-pulse',
      name:'Template - Click Color Pulse',
      description:'Click or tap to flash the Logic Element color, then restore it.',
      category:'Interaction',
      graph:graph('Template - Click Color Pulse', [], [
        node('on_pointer', 'event.onPointerDown', 80, 110, {button:'any'}),
        node('get_root_a', 'scene.getElement', 350, 70, {name:'Default Mesh'}),
        node('set_hot', 'material.setColor', 650, 110, {color:'#ff4d6d'}),
        node('delay', 'flow.delay', 930, 110, {seconds:.35}),
        node('get_root_b', 'scene.getElement', 1170, 70, {name:'Default Mesh'}),
        node('set_cool', 'material.setColor', 1450, 110, {color:'#7dd3fc'}),
      ], [
        edge('e_pointer_hot', 'on_pointer', 'then', 'set_hot', 'exec'),
        edge('e_root_hot', 'get_root_a', 'object', 'set_hot', 'target'),
        edge('e_hot_delay', 'set_hot', 'completed', 'delay', 'exec'),
        edge('e_delay_cool', 'delay', 'completed', 'set_cool', 'exec'),
        edge('e_root_cool', 'get_root_b', 'object', 'set_cool', 'target'),
      ], [
        {id:'comment_intro', title:'Pointer event -> visual feedback -> delayed restore', x:42, y:42, w:1680, h:230, color:'#fb7185'},
      ], '#7dd3fc'),
    },
    {
      id:'logic-template-debug-counter',
      name:'Template - Debug Counter',
      description:'Counts seconds in a variable and prints a readable heartbeat.',
      category:'Debug',
      graph:graph('Template - Debug Counter', [
        {name:'secondsAlive', type:'number', value:0, exposed:true, label:'Seconds Alive'},
      ], [
        node('on_start', 'event.onStart', 80, 80),
        node('print_start', 'debug.print', 350, 80, {message:'Debug Counter started', duration:2}),
        node('on_update', 'event.onUpdate', 80, 250),
        node('get_seconds', 'variable.get', 340, 230, {name:'secondsAlive'}),
        node('add_delta', 'math.add', 590, 230),
        node('set_seconds', 'variable.set', 850, 250, {name:'secondsAlive'}),
        node('tick_every', 'event.tickEvery', 80, 450, {seconds:1}),
        node('print_tick', 'debug.print', 350, 450, {message:'Debug Counter tick', duration:1.5}),
      ], [
        edge('e_start_print', 'on_start', 'then', 'print_start', 'exec'),
        edge('e_update_set', 'on_update', 'then', 'set_seconds', 'exec'),
        edge('e_get_add_a', 'get_seconds', 'value', 'add_delta', 'a'),
        edge('e_delta_add_b', 'on_update', 'deltaTime', 'add_delta', 'b'),
        edge('e_add_set', 'add_delta', 'value', 'set_seconds', 'value'),
        edge('e_tick_print', 'tick_every', 'then', 'print_tick', 'exec'),
      ], [
        {id:'comment_vars', title:'Variable exposed in the normal Inspector', x:40, y:190, w:1060, h:200, color:'#fbbf24'},
        {id:'comment_tick', title:'Tick Every avoids unreadable per-frame print spam', x:40, y:400, w:640, h:160, color:'#a78bfa'},
      ], '#fbbf24'),
    },
    {
      id:'logic-template-space-jump',
      name:'Template - Space Jump Body',
      description:'Creates a physics body and applies an upward impulse on Space.',
      category:'Physics',
      graph:graph('Template - Space Jump Body', [], [
        node('on_start', 'event.onStart', 80, 80),
        node('get_root_start', 'scene.getElement', 340, 40, {name:'Default Mesh'}),
        node('create_body', 'physics.createBody', 620, 80, {shape:'box', mass:1, position:[0,1,0], size:[1,1,1]}),
        node('attach_body', 'physics.attachBodyToObject', 940, 80),
        node('on_space', 'event.onKeyDown', 80, 330, {key:'Space'}),
        node('jump', 'physics.applyImpulse', 620, 330, {impulse:[0,6,0], point:[0,0,0]}),
      ], [
        edge('e_start_create', 'on_start', 'then', 'create_body', 'exec'),
        edge('e_create_attach', 'create_body', 'completed', 'attach_body', 'exec'),
        edge('e_root_attach', 'get_root_start', 'object', 'attach_body', 'object'),
        edge('e_body_attach', 'create_body', 'body', 'attach_body', 'body'),
        edge('e_space_jump', 'on_space', 'then', 'jump', 'exec'),
        edge('e_body_jump', 'create_body', 'body', 'jump', 'body'),
      ], [
        {id:'comment_setup', title:'On Start creates and attaches the body', x:42, y:30, w:1180, h:210, color:'#22c55e'},
        {id:'comment_input', title:'Space applies impulse to the stored body', x:42, y:280, w:900, h:190, color:'#60a5fa'},
      ], '#86efac'),
    },
    {
      id:'logic-template-patrol-mover',
      name:'Template - Patrol Mover',
      description:'Moves the Default Mesh every frame using exposed speed controls.',
      category:'Gameplay',
      graph:graph('Template - Patrol Mover', [
        {name:'speedX', type:'number', value:1.2, exposed:true, label:'X Speed'},
        {name:'spinY', type:'number', value:30, exposed:true, label:'Spin Y'},
      ], [
        node('on_start', 'event.onStart', 80, 80),
        node('print_start', 'debug.print', 350, 80, {message:'Patrol Mover started', duration:2}),
        node('on_update', 'event.onUpdate', 80, 250),
        node('get_root_move', 'scene.getElement', 350, 205, {name:'Default Mesh'}),
        node('get_speed_x', 'variable.get', 350, 340, {name:'speedX'}),
        node('mul_move', 'math.multiply', 610, 330),
        node('make_move', 'vector.make3', 860, 290, {y:0, z:0}),
        node('translate_root', 'scene.translateObject', 1130, 250),
        node('get_root_spin', 'scene.getElement', 350, 520, {name:'Default Mesh'}),
        node('get_spin_y', 'variable.get', 350, 650, {name:'spinY'}),
        node('mul_spin', 'math.multiply', 610, 640),
        node('make_spin', 'vector.make3', 860, 600, {x:0, z:0}),
        node('rotate_root', 'scene.rotateObject', 1130, 560),
      ], [
        edge('e_start_print', 'on_start', 'then', 'print_start', 'exec'),
        edge('e_update_translate', 'on_update', 'then', 'translate_root', 'exec'),
        edge('e_translate_rotate', 'translate_root', 'completed', 'rotate_root', 'exec'),
        edge('e_root_translate', 'get_root_move', 'object', 'translate_root', 'object'),
        edge('e_speed_move_a', 'get_speed_x', 'value', 'mul_move', 'a'),
        edge('e_delta_move_b', 'on_update', 'deltaTime', 'mul_move', 'b'),
        edge('e_move_x', 'mul_move', 'value', 'make_move', 'x'),
        edge('e_move_translate', 'make_move', 'vector', 'translate_root', 'delta'),
        edge('e_root_rotate', 'get_root_spin', 'object', 'rotate_root', 'object'),
        edge('e_spin_a', 'get_spin_y', 'value', 'mul_spin', 'a'),
        edge('e_delta_spin_b', 'on_update', 'deltaTime', 'mul_spin', 'b'),
        edge('e_spin_y', 'mul_spin', 'value', 'make_spin', 'y'),
        edge('e_spin_rotate', 'make_spin', 'vector', 'rotate_root', 'delta'),
      ], [
        {id:'comment_motion', title:'Expose speed values, then move and rotate every frame', x:42, y:190, w:1360, h:560, color:'#34d399'},
      ], '#34d399'),
    },
    {
      id:'logic-template-toggle-switch',
      name:'Template - Toggle Switch',
      description:'Press E to toggle a state variable and swap the Default Mesh color.',
      category:'Interaction',
      graph:graph('Template - Toggle Switch', [
        {name:'isOpen', type:'boolean', value:false, exposed:true, label:'Is Open'},
      ], [
        node('on_start', 'event.onStart', 80, 80),
        node('print_start', 'debug.print', 350, 80, {message:'Toggle Switch ready: press E', duration:3}),
        node('on_key', 'event.onKeyDown', 80, 280, {key:'e'}),
        node('toggle_open', 'variable.toggleBoolean', 350, 280, {name:'isOpen'}),
        node('branch_open', 'flow.branch', 620, 280),
        node('get_root_open', 'scene.getElement', 900, 190, {name:'Default Mesh'}),
        node('set_open_color', 'material.setColor', 1180, 210, {color:'#22c55e'}),
        node('get_root_closed', 'scene.getElement', 900, 390, {name:'Default Mesh'}),
        node('set_closed_color', 'material.setColor', 1180, 410, {color:'#ef4444'}),
      ], [
        edge('e_start_print', 'on_start', 'then', 'print_start', 'exec'),
        edge('e_key_toggle', 'on_key', 'then', 'toggle_open', 'exec'),
        edge('e_toggle_branch', 'toggle_open', 'completed', 'branch_open', 'exec'),
        edge('e_toggle_value', 'toggle_open', 'value', 'branch_open', 'condition'),
        edge('e_branch_open', 'branch_open', 'true', 'set_open_color', 'exec'),
        edge('e_branch_closed', 'branch_open', 'false', 'set_closed_color', 'exec'),
        edge('e_root_open', 'get_root_open', 'object', 'set_open_color', 'target'),
        edge('e_root_closed', 'get_root_closed', 'object', 'set_closed_color', 'target'),
      ], [
        {id:'comment_toggle', title:'Keyboard input -> exposed boolean -> Branch -> color feedback', x:42, y:230, w:1420, h:360, color:'#f97316'},
      ], '#ef4444'),
    },
    {
      id:'logic-template-distance-beacon',
      name:'Template - Distance Beacon',
      description:'Changes color when the Logic Element owner is within an exposed distance from world origin.',
      category:'Gameplay',
      graph:graph('Template - Distance Beacon', [
        {name:'radius', type:'number', value:4, exposed:true, label:'Beacon Radius'},
      ], [
        node('on_start', 'event.onStart', 80, 80),
        node('print_start', 'debug.print', 350, 80, {message:'Distance Beacon active', duration:2.5}),
        node('on_update', 'event.onUpdate', 80, 280),
        node('get_owner', 'scene.getOwner', 350, 220),
        node('get_position', 'scene.getPosition', 610, 220),
        node('distance_from_origin', 'vector.length', 860, 220),
        node('get_radius', 'variable.get', 860, 360, {name:'radius'}),
        node('compare_radius', 'math.compareNumber', 1120, 260, {operator:'<='}),
        node('branch_near', 'flow.branch', 1380, 280),
        node('get_root_near', 'scene.getElement', 1650, 190, {name:'Default Mesh'}),
        node('set_near', 'material.setColor', 1920, 210, {color:'#22c55e'}),
        node('get_root_far', 'scene.getElement', 1650, 420, {name:'Default Mesh'}),
        node('set_far', 'material.setColor', 1920, 440, {color:'#f59e0b'}),
      ], [
        edge('e_start_print', 'on_start', 'then', 'print_start', 'exec'),
        edge('e_update_branch', 'on_update', 'then', 'branch_near', 'exec'),
        edge('e_owner_position', 'get_owner', 'object', 'get_position', 'object'),
        edge('e_position_length', 'get_position', 'position', 'distance_from_origin', 'vector'),
        edge('e_distance_compare_a', 'distance_from_origin', 'value', 'compare_radius', 'a'),
        edge('e_radius_compare_b', 'get_radius', 'value', 'compare_radius', 'b'),
        edge('e_compare_branch', 'compare_radius', 'value', 'branch_near', 'condition'),
        edge('e_branch_near', 'branch_near', 'true', 'set_near', 'exec'),
        edge('e_branch_far', 'branch_near', 'false', 'set_far', 'exec'),
        edge('e_root_near', 'get_root_near', 'object', 'set_near', 'target'),
        edge('e_root_far', 'get_root_far', 'object', 'set_far', 'target'),
      ], [
        {id:'comment_distance', title:'Owner distance from world origin drives color feedback', x:42, y:180, w:2160, h:390, color:'#22d3ee'},
      ], '#f59e0b'),
    },
  ];
}

const templates = makeTemplates().map(t => Object.freeze(Object.assign({}, t, {
  template:true,
  graph:clone(t.graph),
})));

function list(){
  return templates.map(t => Object.assign({}, t, {graph:clone(t.graph)}));
}

function get(id){
  const item = templates.find(t => t.id === id);
  return item ? Object.assign({}, item, {graph:clone(item.graph)}) : null;
}

window.LK_LOGIC_TEMPLATES = Object.freeze({list, get});
})();
