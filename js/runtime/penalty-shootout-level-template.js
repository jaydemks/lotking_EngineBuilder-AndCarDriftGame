/* =========================================================
   LOT KING - Penalty Shootout Stadium level template
   Native reconstruction pattern (see character-level-template.js):
   turns the Soccer Stadium generator output into plain editable
   `scene.added` entries, then places a possessed kicker, an
   unpossessed goalkeeper, explicit Ball and Goal Frame elements,
   and the Penalty Shootout Manager linked by stable IDs.
   Everything stays editable afterward, exactly like a manually
   authored level, so this also serves as a worked example of
   "Add Soccer Stadium" + the soccer Logic Element templates.
   ========================================================= */
(function(){
'use strict';

const SOURCE = 'Penalty Shootout Stadium template';
function clone(v){ return v == null ? v : JSON.parse(JSON.stringify(v)); }

// Converts the Soccer Stadium generator's descriptors into the same
// scene.added JSON shape the editor writes for a hand-placed primitive or
// light (see engine/scene-store.js materializeAdded / registerAdded).
function addStadiumEntries(scene, origin, seq){
  const builder = window.LK_RUNTIME_SOCCER_STADIUM;
  if(!builder) return seq;
  builder.buildEntries(origin).forEach(item => {
    const id = 'penalty_stadium_' + String(++seq.n).padStart(3, '0');
    if(item.kind === 'light'){
      scene.added.push({
        id, kind:'light', light:item.light, name:item.name, collide:false,
        props:clone(item.lightProps) || {}, t:item.t,
        asset:{key:'light:' + item.light, name:item.name, source:SOURCE},
        templateGroup:'Stadium',
      });
      return;
    }
    const props = {color:item.color, roughness:item.roughness, metalness:item.metalness};
    if(item.surfaceTexture) props.surfaceTexture = clone(item.surfaceTexture);
    if(item.emissive){ props.emissive = item.emissive; props.emissiveIntensity = 1.2; }
    scene.added.push({
      id, kind:'primitive', prim:item.prim, name:item.name,
      collide:item.collide === true, driveSurface:item.driveSurface === true,
      props, t:item.t,
      asset:{key:'primitive:' + item.prim, name:item.name, source:SOURCE},
      templateGroup:'Stadium',
    });
  });
  return seq;
}

function setVar(graph, name, value){
  const target = (graph.variables || []).find(v => v && v.name === name);
  if(target) target.value = value;
}

function placeLogicElement(scene, seq, templateId, name, position, rotationY, configure){
  const templates = window.LK_LOGIC_TEMPLATES;
  const t = templates && templates.get && templates.get(templateId);
  if(!t || !t.graph) return;
  const graph = clone(t.graph);
  if(configure) configure(graph);
  scene.added.push({
    id:'penalty_actor_' + String(++seq.n).padStart(3, '0'), kind:'logicElement', name,
    collide:false, graph, enabled:true, runInEditorPreview:true,
    asset:{key:'logic:template:' + templateId, name, source:SOURCE},
    t:{p:position.slice(), r:[0, rotationY, 0], s:[1, 1, 1], v:true},
    templateGroup:templateId === 'logic-template-player-soccer' ? 'Characters' : 'Soccer Gameplay',
  });
}

/* ---------------------------------------------------------
   Shootout direction (added on top of the shipped manager)

   js/runtime/penalty-flow.js gained the kick sequence, the goalkeeper read
   model, pressure and presentation cameras. The shipped `penalty.configure`
   Logic node predates them, so the extra dials travel as exposed variables plus
   a `penaltyShootout` descriptor, and the runtime director below feeds them to
   the flow on Play. Same result, no change to the shared node pack.
   --------------------------------------------------------- */

const SHOOTOUT_DIRECTION = Object.freeze([
  ['KeeperSkill', 'string', 'pro', {binding:'penaltyShootout.keeperSkill', label:'Goalkeeper Skill', category:'Shootout / Goalkeeper', ui:'select',
    options:[{value:'rookie', label:'Rookie'}, {value:'amateur', label:'Amateur'}, {value:'pro', label:'Professional'}, {value:'worldClass', label:'World Class'}]}],
  ['RunUpSeconds', 'number', .95, {min:.45, max:1.6, step:.05, binding:'penaltyShootout.runUpSeconds', label:'Run-up Length (s)', category:'Shootout / Kick'}],
  ['PressureEnabled', 'boolean', true, {binding:'penaltyShootout.pressureEnabled', label:'Pressure Affects The Kick', category:'Shootout / Kick'}],
  ['PresentationCameras', 'boolean', true, {binding:'penaltyShootout.presentationCameras', label:'Presentation Cameras Between Kicks', category:'Shootout / Presentation'}],
  ['AutoAdvanceDelay', 'number', 2.2, {min:.2, max:10, step:.1, binding:'penaltyShootout.autoAdvanceDelay', label:'Delay Between Kicks (s)', category:'Shootout / Presentation'}],
]);

function addShootoutDirection(graph){
  SHOOTOUT_DIRECTION.forEach(([name, type, value, options]) => {
    graph.variables.push(Object.assign({name, type, value, exposed:true}, options));
  });
  graph.penaltyShootout = SHOOTOUT_DIRECTION.reduce((descriptor, [, , value, options]) => {
    descriptor[options.binding.slice('penaltyShootout.'.length)] = value;
    return descriptor;
  }, {schemaVersion:1});
  return graph;
}

/** Reads the authored dials back out of the live scene and applies them once. */
function createShootoutDirector(GAME){
  const state = {applied:false, descriptor:null};
  function collect(){
    const objects = GAME && GAME.world && Array.isArray(GAME.world.registry) ? GAME.world.registry : [];
    for(let index = 0; index < objects.length; index++){
      const graph = objects[index] && objects[index].userData && objects[index].userData.logicGraph;
      if(!graph || !graph.penaltyShootout) continue;
      (graph.variables || []).forEach(item => {
        const binding = item && typeof item.binding === 'string' ? item.binding : '';
        if(binding.indexOf('penaltyShootout.') !== 0) return;
        graph.penaltyShootout[binding.slice('penaltyShootout.'.length)] = item.value;
      });
      return graph.penaltyShootout;
    }
    return null;
  }
  function apply(){
    const descriptor = collect();
    if(!descriptor) return false;
    const flow = GAME && GAME.systems && GAME.systems.penaltyFlow;
    if(!flow || !flow.configure) return false;
    state.descriptor = descriptor;
    flow.configure(descriptor);
    state.applied = true;
    return true;
  }
  function update(){
    if(state.applied) return false;
    if(!(GAME && GAME.state && GAME.state.started)) return false;
    return apply();
  }
  return Object.freeze({apply, update, reset(){ state.applied = false; }, descriptor:() => state.descriptor, applied:() => state.applied});
}

function installDirector(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.penaltyShootoutDirector) return GAME.systems.penaltyShootoutDirector;
  const director = createShootoutDirector(GAME);
  GAME.systems.penaltyShootoutDirector = director;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkPenaltyShootoutDirectorFrame){
    GAME.hooks.__lkPenaltyShootoutDirectorFrame = true;
    GAME.hooks.frame.push(() => director.update());
  }
  return director;
}

function buildScene(baseScene){
  const scene = baseScene || {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}, logic:{}};
  // The stadium pitch is its own ground; drop the generic template plane.
  scene.added = (scene.added || []).filter(entry => !(entry && entry.name === 'Ground' && entry.asset && entry.asset.source === 'Editor primitive'));

  const origin = {x:0, z:0};
  const seq = {n:0};
  addStadiumEntries(scene, origin, seq);

  const builder = window.LK_RUNTIME_SOCCER_STADIUM;
  const anchors = builder ? builder.gameplayAnchors(origin) : null;
  if(anchors){
    const spot = anchors.penaltySpotNorth, goal = anchors.goalNorth;
    // A few meters behind the spot, run-up room toward the goal at heading 0.
    const kickerStart = {x:spot.x, y:0, z:spot.z - 2.4};

    placeLogicElement(scene, seq, 'logic-template-player-soccer', 'Penalty Kicker (Player)', [kickerStart.x, 0, kickerStart.z], 0, g => {
      g.soccerPawn.role = 'striker';
      g.soccerPawn.playerId = 1;
      g.soccerPawn.possessed = true;
      g.soccerPawn.spawn = {x:kickerStart.x, y:0, z:kickerStart.z, heading:0};
      g.soccerPawn.camera = Object.assign({}, g.soccerPawn.camera, {distance:6.5, height:2.5, fov:58});
      setVar(g, 'ControllerPlayerId', 1);
      setVar(g, 'SpawnX', kickerStart.x); setVar(g, 'SpawnY', 0); setVar(g, 'SpawnZ', kickerStart.z); setVar(g, 'SpawnHeading', 0);
    });

    placeLogicElement(scene, seq, 'logic-template-player-soccer', 'Penalty Goalkeeper', [goal.x, 0, goal.z], goal.heading, g => {
      g.soccerPawn.role = 'goalkeeper';
      g.soccerPawn.playerId = null;
      g.soccerPawn.possessed = false;
      g.soccerPawn.spawn = {x:goal.x, y:0, z:goal.z, heading:goal.heading};
      g.soccerPawn.appearance = Object.assign({}, g.soccerPawn.appearance, {shirtColor:'#facc15', shortsColor:'#111827', socksColor:'#facc15'});
      // -1 ("None") stops the starter graph's own On Start possession, since
      // that graph logic runs after Pawn creation and would otherwise force
      // Player 1 onto both characters. Possess Player 2 to dive with Q/E.
      setVar(g, 'ControllerPlayerId', -1);
      // Exposed-variable bindings are applied after Pawn creation. Keep them
      // aligned with the authored preset or they would turn this yellow keeper
      // back into the starter graph's red striker as Play begins.
      setVar(g, 'Role', 'goalkeeper');
      // The Soccer Pawn template now defaults to the outfield control frame, so
      // the keeper has to ask for its fixed one: it is steered by the keeper AI
      // and the shootout director, and must stay square to the goal line.
      setVar(g, 'InputMode', 'heading');
      setVar(g, 'FacingMode', 'heading');
      setVar(g, 'ShirtColor', '#facc15');
      setVar(g, 'ShortsColor', '#111827');
      setVar(g, 'SocksColor', '#facc15');
      setVar(g, 'KeeperAI', true);
      setVar(g, 'KeeperAIReaction', .14);
      setVar(g, 'KeeperAIPrediction', 1.15);
      setVar(g, 'SpawnX', goal.x); setVar(g, 'SpawnY', 0); setVar(g, 'SpawnZ', goal.z); setVar(g, 'SpawnHeading', goal.heading);
    });

    placeLogicElement(scene, seq, 'logic-template-soccer-goal', 'Penalty Goal Sensor', [goal.x, 0, goal.z], goal.heading, g => {
      setVar(g, 'GoalId', 'penalty-goal');
      setVar(g, 'Team', 'A');
      setVar(g, 'Heading', goal.heading);
    });

    placeLogicElement(scene, seq, 'logic-template-soccer-ball', 'Penalty Ball', [spot.x, 0, spot.z], 0, g => {
      setVar(g, 'BallId', 'penalty-ball');
      setVar(g, 'BallMode', 'penalty');
      setVar(g, 'LockedAtStart', true);
    });

    placeLogicElement(scene, seq, 'logic-template-penalty-shootout', 'Penalty Shootout Manager', [0, .1, spot.z - 6], 0, g => {
      setVar(g, 'GoalId', 'penalty-goal'); setVar(g, 'BallId', 'penalty-ball');
      setVar(g, 'GoalX', goal.x); setVar(g, 'GoalZ', goal.z); setVar(g, 'GoalHeading', goal.heading);
      setVar(g, 'SpotX', spot.x); setVar(g, 'SpotZ', spot.z);
      addShootoutDirection(g);
    });
  }

  scene.env = Object.assign({}, scene.env || {}, {
    // Fixed noon. Sky time is sunrise-based: .25 = 12:00, while the former
    // .62 value was around 20:52 and made the stadium look unlit.
    skyTime:.25, dayLength:999999, dayNightCycleEnabled:false,
    procEnvEnabled:true, procEnvIntensity:1,
    procEnvWarmth:.48, procEnvContrast:.55,
    lighting:{daySun:1.45,dayAmbient:.95,moonDirect:.16,moonIndirect:.18},
    backgroundColor:'#16283f', fog:{enabled:false},
  });
  scene.template = {
    id:'penalty-shootout-stadium', name:'Penalty Shootout Stadium', version:5,
    nativeEditable:true,
    controls:{move:'WASD / arrows', sprint:'Shift', jump:'Space', shoot:'Hold F/X, aim with WASD, release'},
  };
  return scene;
}

window.LK_RUNTIME_PENALTY_SHOOTOUT_LEVEL_TEMPLATE = Object.freeze({
  id:'penalty-shootout-stadium', name:'Penalty Shootout Stadium',
  buildScene, addShootoutDirection, createShootoutDirector, install:installDirector,
});
if(window.LOT_KING) installDirector(window.LOT_KING);

if(window.LK_LEVEL_TEMPLATES && window.LK_LEVEL_TEMPLATES.register){
  window.LK_LEVEL_TEMPLATES.register({
    id:'penalty-shootout-stadium', name:'Penalty Shootout Stadium (Soccer)', nameIt:'Stadio Rigori (Calcio)',
    category:'Sports', order:400, ground:'plane', keepBuiltinPlayer:false,
    description:'Stadium, goal, keeper and shot flow for the Soccer Pawn.',
    descriptionIt:'Stadio, porta, portiere e flusso di tiro per il Pawn Calcio.',
    build:function(scene){ return buildScene(scene); },
  });
}
})();
