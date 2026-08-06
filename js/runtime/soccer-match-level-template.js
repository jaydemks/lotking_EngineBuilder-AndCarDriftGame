/* =========================================================
   LOT KING - Soccer Match 11 v 11 level template

   A full eleven-a-side match assembled entirely from ordinary editable
   `scene.added` entries, following the native reconstruction pattern of
   js/runtime/penalty-shootout-level-template.js and the "template module also
   owns its runtime system" pattern of js/runtime/cat-neighborhood-level-template.js.

   Nothing here is hard-coded gameplay: the two Team Manager Logic Elements own
   formation, tactics, kit colours and difficulty; the Match Director Logic
   Element owns the rules and the clock; each of the 22 players is its own
   Soccer Pawn Logic Element with its own role, attributes and spawn. Every one
   of those is an exposed graph variable, so the whole match is authorable from
   the editor without touching a line of code.

   Positional model: js/runtime/soccer-tactics.js
   Team/player AI  : js/runtime/soccer-team-ai.js
   Rules and clock : js/runtime/soccer-match-flow.js
   Stadium geometry: js/runtime/soccer-stadium.js

   Reading order: identifiers -> helpers -> authored graphs -> scene sections
   (stadium, goals & ball, match director, home team, away team) -> runtime
   director -> registration.
   ========================================================= */
(function(){
'use strict';

/* ---------------------------------------------------------
   01 Identifiers, dependencies and shared tables
   --------------------------------------------------------- */

const root = typeof window !== 'undefined' ? window : globalThis;
const ID = 'soccer-match-11v11';
const SOURCE = 'Soccer Match 11 v 11 template';
const SCHEMA_VERSION = 1;

// Stable ids the runtime director and the Logic Elements agree on.
const KEYS = Object.freeze({
  ball:'match-ball',
  goalNorth:'match-goal-north',
  goalSouth:'match-goal-south',
});

// Scene groups, numbered in the order the level is read in the outliner.
const GROUPS = Object.freeze({
  stadium:'01 Stadium',
  field:'02 Goals & Ball',
  director:'03 Match Director',
  home:'04 Home Team',
  away:'05 Away Team',
});

// Kit table: one row per team, so a colour never appears twice in this file.
const KITS = Object.freeze({
  home:Object.freeze({name:'Lot King FC', shortName:'LKF', shirt:'#e11d48', shorts:'#f8fafc', socks:'#e11d48', keeperShirt:'#22d3ee', keeperShorts:'#0f172a'}),
  away:Object.freeze({name:'Fable United', shortName:'FBU', shirt:'#2563eb', shorts:'#e2e8f0', socks:'#2563eb', keeperShirt:'#facc15', keeperShorts:'#111827'}),
});

const DEFAULTS = Object.freeze({
  formationHome:'4-3-3', formationAway:'4-4-2',
  tacticHome:'possession', tacticAway:'balanced',
  // The human plays the home side; slot 9 in 4-3-3 is the centre forward.
  controlledSlot:9, controllerPlayerId:1,
  halfMinutes:45, secondsPerMinute:2, halves:2, stoppageMinutes:2, restartDelay:2.5,
  difficultyHome:.5, difficultyAway:.5,
});

function tactics(){
  const module = root.LK_RUNTIME_SOCCER_TACTICS;
  if(!module) throw new Error(SOURCE + ' requires js/runtime/soccer-tactics.js to be loaded first');
  return module;
}
function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function finite(value, fallback){
  const number = Number(value);
  return Number.isFinite(number) ? number : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function clamp01(value){ return clamp(value, 0, 1); }
function setVar(graph, name, value){
  const target = (graph.variables || []).find(item => item && item.name === name);
  if(target) target.value = value;
  return target != null;
}

/* ---------------------------------------------------------
   02 Authoring helpers
   Graph and scene-entry factories shared by every section
   below. Everything an author can change is a graph variable.
   --------------------------------------------------------- */

function variable(name, type, value, options){
  return Object.assign({name, type, value, exposed:true}, options || {});
}

function managerGraph(name, color, variables, descriptorKey, descriptor){
  const graph = {
    version:1, name, scope:'element', enabled:true,
    variables,
    nodes:[
      {id:'on_start', type:'event.onStart', x:80, y:100, data:{}},
      {id:'ready', type:'debug.print', x:360, y:100, data:{message:name + ' ready.', duration:2}},
    ],
    edges:[{id:'e_ready', from:{node:'on_start', pin:'then'}, to:{node:'ready', pin:'exec'}}],
    comments:[{id:'help', title:name + ': every value below is an exposed variable. Change it in the editor and Play again — no code involved.', x:40, y:30, w:900, h:210, color}],
    logicScene:{
      root:{id:'root', name, type:'empty', linked:true, position:[0,0,0], rotation:[0,0,0], scale:[1,1,1], color},
      elements:[],
      components:[{id:'root_transform', elementId:'root', name:'Transform', type:'transform', linked:true}],
    },
  };
  graph[descriptorKey] = Object.assign({schemaVersion:SCHEMA_VERSION}, descriptor);
  return graph;
}

function addEntry(scene, seq, entry){
  scene.added.push(Object.assign({id:ID.replace(/-/g, '_') + '_' + String(++seq.n).padStart(3, '0')}, entry));
  return scene.added[scene.added.length - 1];
}

function addLogicElement(scene, seq, options){
  return addEntry(scene, seq, {
    kind:'logicElement', name:options.name, collide:false, graph:options.graph,
    enabled:true, runInEditorPreview:true,
    asset:{key:options.assetKey, name:options.name, source:SOURCE},
    t:{p:options.position.slice(), r:[0, finite(options.heading, 0), 0], s:[1,1,1], v:true},
    templateGroup:options.group,
  });
}

/* ---------------------------------------------------------
   03 Section 01 - Stadium
   The Soccer Stadium generator's descriptors converted into
   plain editable primitives and lights, exactly as the penalty
   template does, so the pitch stays hand-editable afterwards.
   --------------------------------------------------------- */

function addStadium(scene, seq, origin){
  const builder = root.LK_RUNTIME_SOCCER_STADIUM;
  if(!builder) return 0;
  const entries = builder.buildEntries(origin);
  entries.forEach(item => {
    if(item.kind === 'light'){
      addEntry(scene, seq, {
        kind:'light', light:item.light, name:item.name, collide:false,
        props:clone(item.lightProps) || {}, t:item.t,
        asset:{key:'light:' + item.light, name:item.name, source:SOURCE},
        templateGroup:GROUPS.stadium,
      });
      return;
    }
    const props = {color:item.color, roughness:item.roughness, metalness:item.metalness};
    if(item.surfaceTexture) props.surfaceTexture = clone(item.surfaceTexture);
    if(item.emissive){ props.emissive = item.emissive; props.emissiveIntensity = 1.2; }
    addEntry(scene, seq, {
      kind:'primitive', prim:item.prim, name:item.name,
      collide:item.collide === true, driveSurface:item.driveSurface === true,
      props, t:item.t,
      asset:{key:'primitive:' + item.prim, name:item.name, source:SOURCE},
      templateGroup:GROUPS.stadium,
    });
  });
  return entries.length;
}

/* ---------------------------------------------------------
   04 Section 02 - Goals and ball
   Reuses the shipped Soccer Goal Frame and Soccer Ball Logic
   Element templates so the sensors stay independent from the
   visible posts and can be moved by the author.
   --------------------------------------------------------- */

function logicTemplateGraph(templateId){
  const templates = root.LK_LOGIC_TEMPLATES;
  const template = templates && templates.get && templates.get(templateId);
  if(!template || !template.graph) throw new Error(SOURCE + ' requires the Logic Element template "' + templateId + '"');
  return clone(template.graph);
}

function addGoalsAndBall(scene, seq, anchors){
  const north = anchors.goalNorth, south = anchors.goalSouth;
  // `team` on a goal frame names the side that SCORES in it. Home attacks north.
  [
    {key:KEYS.goalNorth, name:'Goal Sensor North (Home scores)', goal:north, team:'home'},
    {key:KEYS.goalSouth, name:'Goal Sensor South (Away scores)', goal:south, team:'away'},
  ].forEach(entry => {
    const graph = logicTemplateGraph('logic-template-soccer-goal');
    setVar(graph, 'GoalId', entry.key);
    setVar(graph, 'Team', entry.team);
    setVar(graph, 'Heading', entry.goal.heading);
    addLogicElement(scene, seq, {
      name:entry.name, graph, group:GROUPS.field,
      assetKey:'logic:template:logic-template-soccer-goal',
      position:[entry.goal.x, 0, entry.goal.z], heading:entry.goal.heading,
    });
  });

  const ball = logicTemplateGraph('logic-template-soccer-ball');
  setVar(ball, 'BallId', KEYS.ball);
  setVar(ball, 'BallMode', 'match');
  setVar(ball, 'LockedAtStart', false);
  addLogicElement(scene, seq, {
    name:'Match Ball', graph:ball, group:GROUPS.field,
    assetKey:'logic:template:logic-template-soccer-ball',
    position:[anchors.kickoff.x, 0, anchors.kickoff.z],
  });
}

/* ---------------------------------------------------------
   05 Section 03 - Match Director
   Owns the rules spine consumed by js/runtime/soccer-match-flow.js:
   duration, halves, stoppage, restarts, offside, fouls, cards,
   substitutions and the tie-break policy.
   --------------------------------------------------------- */

function matchDirectorGraph(){
  const variables = [
    variable('MatchEnabled', 'boolean', true, {binding:'soccerMatchDirector.enabled', label:'Match Enabled', category:'Match'}),
    variable('Halves', 'number', DEFAULTS.halves, {min:1, max:4, step:1, binding:'soccerMatchDirector.halves', label:'Number of Halves', category:'Match / Clock'}),
    variable('HalfMinutes', 'number', DEFAULTS.halfMinutes, {min:1, max:60, step:1, binding:'soccerMatchDirector.halfMinutes', label:'Minutes Per Half', category:'Match / Clock'}),
    variable('SecondsPerMinute', 'number', DEFAULTS.secondsPerMinute, {min:.05, max:60, step:.05, binding:'soccerMatchDirector.secondsPerMinute', label:'Real Seconds Per Match Minute', category:'Match / Clock'}),
    variable('StoppageMinutes', 'number', DEFAULTS.stoppageMinutes, {min:0, max:15, step:1, binding:'soccerMatchDirector.stoppageMinutes', label:'Stoppage Time (min)', category:'Match / Clock'}),
    variable('RestartDelay', 'number', DEFAULTS.restartDelay, {min:0, max:30, step:.1, binding:'soccerMatchDirector.restartDelay', label:'Restart Delay (s)', category:'Match / Clock'}),
    variable('KickoffTeam', 'string', 'home', {binding:'soccerMatchDirector.kickoffTeam', label:'Kickoff Team', category:'Match', ui:'select', options:[{value:'home', label:'Home'}, {value:'away', label:'Away'}, {value:'random', label:'Random'}]}),
    variable('RuleThrowIns', 'boolean', true, {binding:'soccerMatchDirector.rules.throwIns', label:'Throw-ins', category:'Match / Rules'}),
    variable('RuleGoalKicks', 'boolean', true, {binding:'soccerMatchDirector.rules.goalKicks', label:'Goal Kicks', category:'Match / Rules'}),
    variable('RuleCorners', 'boolean', true, {binding:'soccerMatchDirector.rules.corners', label:'Corners', category:'Match / Rules'}),
    variable('RuleOffside', 'boolean', true, {binding:'soccerMatchDirector.rules.offside', label:'Offside', category:'Match / Rules'}),
    variable('RuleFouls', 'boolean', true, {binding:'soccerMatchDirector.rules.fouls', label:'Fouls & Free Kicks', category:'Match / Rules'}),
    variable('RuleCards', 'boolean', true, {binding:'soccerMatchDirector.rules.cards', label:'Yellow / Red Cards', category:'Match / Rules'}),
    variable('Substitutions', 'number', 5, {min:0, max:11, step:1, binding:'soccerMatchDirector.substitutions', label:'Substitutions Per Team', category:'Match / Rules'}),
    variable('ExtraTime', 'boolean', false, {binding:'soccerMatchDirector.extraTime', label:'Extra Time On Draw', category:'Match / Tie Break'}),
    variable('PenaltiesOnDraw', 'boolean', true, {binding:'soccerMatchDirector.penaltiesOnDraw', label:'Penalty Shootout On Draw', category:'Match / Tie Break'}),
    variable('BallId', 'string', KEYS.ball, {binding:'soccerMatchDirector.ballId', label:'Match Ball ID', category:'Match / Links'}),
    variable('PitchLength', 'number', tactics().PITCH.length, {min:40, max:140, step:.5, binding:'soccerMatchDirector.pitch.length', label:'Pitch Length (m)', category:'Match / Pitch'}),
    variable('PitchWidth', 'number', tactics().PITCH.width, {min:30, max:100, step:.5, binding:'soccerMatchDirector.pitch.width', label:'Pitch Width (m)', category:'Match / Pitch'}),
    variable('AiTickHz', 'number', 12, {min:2, max:60, step:1, binding:'soccerMatchDirector.ai.tickHz', label:'Team AI Tick Rate (Hz)', category:'Match / Performance'}),
    variable('AiPlayersPerTick', 'number', 6, {min:1, max:22, step:1, binding:'soccerMatchDirector.ai.playersPerTick', label:'Players Decided Per Tick', category:'Match / Performance'}),
    variable('AiBehaviourLod', 'boolean', true, {binding:'soccerMatchDirector.ai.lod', label:'Behaviour LOD Far From Ball', category:'Match / Performance'}),
  ];
  return managerGraph('Soccer Match Director', '#38bdf8', variables, 'soccerMatchDirector', {
    enabled:true, ballId:KEYS.ball,
    halves:DEFAULTS.halves, halfMinutes:DEFAULTS.halfMinutes, secondsPerMinute:DEFAULTS.secondsPerMinute,
    stoppageMinutes:DEFAULTS.stoppageMinutes, restartDelay:DEFAULTS.restartDelay, kickoffTeam:'home',
    rules:{throwIns:true, goalKicks:true, corners:true, offside:true, fouls:true, cards:true},
    substitutions:5, extraTime:false, penaltiesOnDraw:true,
    pitch:{length:tactics().PITCH.length, width:tactics().PITCH.width, originX:0, originZ:0},
    ai:{tickHz:12, playersPerTick:6, lod:true},
  });
}

/* ---------------------------------------------------------
   06 Section 04/05 - Team Managers
   One per side. Formation, tactical dials, kit and difficulty
   all live here, so re-shaping a team never means re-placing
   the eleven Logic Elements.
   --------------------------------------------------------- */

function teamManagerGraph(team, setup){
  const model = tactics();
  const kit = KITS[team];
  const variables = [
    variable('TeamEnabled', 'boolean', true, {binding:'soccerTeamSetup.enabled', label:'Team Enabled', category:'Team'}),
    variable('TeamName', 'string', kit.name, {binding:'soccerTeamSetup.name', label:'Team Name', category:'Team'}),
    variable('TeamShortName', 'string', kit.shortName, {binding:'soccerTeamSetup.shortName', label:'Short Name (scoreboard)', category:'Team'}),
    variable('Formation', 'string', setup.formation, {binding:'soccerTeamSetup.formation', label:'Formation', category:'Team / Shape',
      ui:'select', options:model.FORMATION_IDS.map(id => ({value:id, label:model.FORMATIONS[id].label}))}),
    variable('TacticPreset', 'string', setup.tactic, {binding:'soccerTeamSetup.tactics.preset', label:'Tactical Preset', category:'Team / Tactics',
      ui:'select', options:model.TACTIC_IDS.map(id => ({value:id, label:model.TACTICS[id].label}))}),
    variable('Mentality', 'number', model.TACTICS[setup.tactic].mentality, {min:0, max:1, step:.02, binding:'soccerTeamSetup.tactics.mentality', label:'Mentality (defensive - attacking)', category:'Team / Tactics'}),
    variable('DefensiveLine', 'number', model.TACTICS[setup.tactic].lineHeight, {min:0, max:1, step:.02, binding:'soccerTeamSetup.tactics.lineHeight', label:'Defensive Line Height', category:'Team / Tactics'}),
    variable('TeamWidth', 'number', model.TACTICS[setup.tactic].width, {min:0, max:1, step:.02, binding:'soccerTeamSetup.tactics.width', label:'Width', category:'Team / Tactics'}),
    variable('Compactness', 'number', model.TACTICS[setup.tactic].compactness, {min:0, max:1, step:.02, binding:'soccerTeamSetup.tactics.compactness', label:'Compactness', category:'Team / Tactics'}),
    variable('Pressing', 'number', model.TACTICS[setup.tactic].pressing, {min:0, max:1, step:.02, binding:'soccerTeamSetup.tactics.pressing', label:'Pressing Intensity', category:'Team / Tactics'}),
    variable('Tempo', 'number', model.TACTICS[setup.tactic].tempo, {min:0, max:1, step:.02, binding:'soccerTeamSetup.tactics.tempo', label:'Tempo', category:'Team / Tactics'}),
    variable('SupportRuns', 'number', model.TACTICS[setup.tactic].support, {min:0, max:1, step:.02, binding:'soccerTeamSetup.tactics.support', label:'Support Runs', category:'Team / Tactics'}),
    variable('OffsideTrap', 'boolean', model.TACTICS[setup.tactic].offsideTrap === true, {binding:'soccerTeamSetup.tactics.offsideTrap', label:'Offside Trap', category:'Team / Tactics'}),
    variable('AiDifficulty', 'number', setup.difficulty, {min:0, max:1, step:.05, binding:'soccerTeamSetup.difficulty', label:'AI Difficulty', category:'Team / AI'}),
    variable('ControllerPlayerId', 'number', setup.controllerPlayerId == null ? -1 : setup.controllerPlayerId, {binding:'soccerTeamSetup.controllerPlayerId', label:'Controller Player ID (-1 = full AI)', category:'Team / Control', ui:'player-id'}),
    variable('ControlledSlot', 'number', setup.controlledSlot == null ? -1 : setup.controlledSlot, {min:-1, max:10, step:1, binding:'soccerTeamSetup.controlledSlot', label:'Starting Controlled Slot (-1 = none)', category:'Team / Control'}),
    variable('AutoSwitch', 'boolean', true, {binding:'soccerTeamSetup.autoSwitch', label:'Automatic Player Switching', category:'Team / Control'}),
    variable('ShirtColor', 'string', kit.shirt, {binding:'soccerTeamSetup.kit.shirt', label:'Shirt Color', category:'Team / Kit', ui:'color'}),
    variable('ShortsColor', 'string', kit.shorts, {binding:'soccerTeamSetup.kit.shorts', label:'Shorts Color', category:'Team / Kit', ui:'color'}),
    variable('SocksColor', 'string', kit.socks, {binding:'soccerTeamSetup.kit.socks', label:'Socks Color', category:'Team / Kit', ui:'color'}),
    variable('KeeperShirtColor', 'string', kit.keeperShirt, {binding:'soccerTeamSetup.kit.keeperShirt', label:'Goalkeeper Shirt Color', category:'Team / Kit', ui:'color'}),
  ];
  return managerGraph('Team Manager - ' + kit.name, team === 'home' ? '#f97316' : '#a855f7', variables, 'soccerTeamSetup', {
    team, enabled:true, name:kit.name, shortName:kit.shortName,
    formation:setup.formation,
    tactics:Object.assign({}, model.normalizeTactics({preset:setup.tactic})),
    difficulty:setup.difficulty,
    controllerPlayerId:setup.controllerPlayerId == null ? -1 : setup.controllerPlayerId,
    controlledSlot:setup.controlledSlot == null ? -1 : setup.controlledSlot,
    autoSwitch:true,
    kit:{shirt:kit.shirt, shorts:kit.shorts, socks:kit.socks, keeperShirt:kit.keeperShirt, keeperShorts:kit.keeperShorts},
  });
}

/* ---------------------------------------------------------
   07 Section 04/05 - The eleven players
   One Soccer Pawn Logic Element per slot, cloned from the
   shipped Player Soccer template so it keeps every animation,
   appearance and camera setting an author already knows.
   --------------------------------------------------------- */

function shirtNumberFor(slotIndex, roleId){
  // Classic numbering: keeper 1, then defence/midfield/attack in slot order.
  return roleId === 'GK' ? 1 : slotIndex + 1;
}

function playerGraph(team, slotIndex, slot, spawn, setup){
  const model = tactics(), kit = KITS[team], roleDef = model.role(slot.role);
  const keeper = roleDef.id === 'GK';
  const controlled = setup.controlledSlot === slotIndex && setup.controllerPlayerId != null && setup.controllerPlayerId > 0;
  const graph = logicTemplateGraph('logic-template-player-soccer');

  // --- authored Pawn definition -----------------------------------------
  graph.soccerPawn.role = roleDef.pawnRole;
  graph.soccerPawn.playerId = controlled ? setup.controllerPlayerId : null;
  graph.soccerPawn.possessed = controlled;
  graph.soccerPawn.spawn = {x:spawn.x, y:0, z:spawn.z, heading:spawn.heading};
  graph.soccerPawn.appearance = Object.assign({}, graph.soccerPawn.appearance, {
    shirtColor:keeper ? kit.keeperShirt : kit.shirt,
    shortsColor:keeper ? kit.keeperShorts : kit.shorts,
    socksColor:keeper ? kit.keeperShirt : kit.socks,
    number:shirtNumberFor(slotIndex, roleDef.id),
  });
  // The team AI owns outfield movement; the legacy single-pawn chase AI would
  // fight it, and the keeper's shot-stopping AI is the only one kept alive.
  graph.soccerPawn.fieldAI = {enabled:false, reaction:.32, shootDistance:1.05};
  graph.soccerPawn.keeper = Object.assign({}, graph.soccerPawn.keeper, {aiEnabled:keeper});
  graph.soccerPawn.movement = Object.assign({}, graph.soccerPawn.movement, {
    runSpeed:4.6 + roleDef.pace * 3.2,
    sprintMultiplier:1.2 + roleDef.pace * .28,
    turnRate:8 + roleDef.positioning * 5,
  });

  // --- graph variables the editor shows ----------------------------------
  setVar(graph, 'ControllerPlayerId', controlled ? setup.controllerPlayerId : -1);
  setVar(graph, 'Role', roleDef.pawnRole);
  setVar(graph, 'SpawnX', spawn.x); setVar(graph, 'SpawnY', 0); setVar(graph, 'SpawnZ', spawn.z);
  setVar(graph, 'SpawnHeading', spawn.heading);
  setVar(graph, 'ShirtColor', keeper ? kit.keeperShirt : kit.shirt);
  setVar(graph, 'ShortsColor', keeper ? kit.keeperShorts : kit.shorts);
  setVar(graph, 'SocksColor', keeper ? kit.keeperShirt : kit.socks);
  setVar(graph, 'KeeperAI', keeper);
  setVar(graph, 'FieldOpponentAI', false);
  setVar(graph, 'RunSpeed', graph.soccerPawn.movement.runSpeed);
  setVar(graph, 'SprintMultiplier', graph.soccerPawn.movement.sprintMultiplier);
  setVar(graph, 'TurnRate', graph.soccerPawn.movement.turnRate);

  // --- team-AI descriptor and its own exposed variables -------------------
  graph.soccerTeamPlayer = {
    schemaVersion:SCHEMA_VERSION, enabled:true, team, slot:slotIndex,
    role:roleDef.id, line:roleDef.line, number:shirtNumberFor(slotIndex, roleDef.id),
    attributes:model.ATTRIBUTE_KEYS.reduce((map, key) => { map[key] = roleDef[key]; return map; }, {}),
  };
  graph.variables.push(
    variable('TeamSide', 'string', team, {binding:'soccerTeamPlayer.team', label:'Team', category:'Soccer / Team AI', ui:'select', options:[{value:'home', label:'Home'}, {value:'away', label:'Away'}]}),
    variable('FormationSlot', 'number', slotIndex, {min:0, max:10, step:1, binding:'soccerTeamPlayer.slot', label:'Formation Slot (0 = goalkeeper)', category:'Soccer / Team AI'}),
    variable('TacticalRole', 'string', roleDef.id, {binding:'soccerTeamPlayer.role', label:'Tactical Role', category:'Soccer / Team AI',
      ui:'select', options:model.ROLE_IDS.map(id => ({value:id, label:model.ROLES[id].label}))}),
    variable('ShirtNumber', 'number', shirtNumberFor(slotIndex, roleDef.id), {min:1, max:99, step:1, binding:'soccerTeamPlayer.number', label:'Shirt Number', category:'Soccer / Team AI'}),
    variable('TeamAiEnabled', 'boolean', true, {binding:'soccerTeamPlayer.enabled', label:'Driven By Team AI', category:'Soccer / Team AI'})
  );
  model.ATTRIBUTE_KEYS.forEach(key => {
    graph.variables.push(variable('Attr' + key.charAt(0).toUpperCase() + key.slice(1), 'number', roleDef[key], {
      min:0, max:1, step:.02, binding:'soccerTeamPlayer.attributes.' + key,
      label:key.charAt(0).toUpperCase() + key.slice(1), category:'Soccer / Attributes',
    }));
  });
  return graph;
}

function addTeam(scene, seq, team, setup, pitch){
  const model = tactics();
  const slots = model.kickoffSlots(setup.formation);
  const group = team === 'home' ? GROUPS.home : GROUPS.away;

  addLogicElement(scene, seq, {
    name:'Team Manager - ' + KITS[team].name,
    graph:teamManagerGraph(team, setup), group,
    assetKey:'logic:soccer-team-setup:' + team,
    position:[team === 'home' ? -pitch.width / 2 - 12 : pitch.width / 2 + 12, .1, 0],
  });

  const spawn = {x:0, y:0, z:0, heading:0};
  slots.forEach((slot, slotIndex) => {
    model.toWorld(slot.spread, slot.depth, team, pitch, spawn);
    const roleDef = model.role(slot.role);
    const controlled = setup.controlledSlot === slotIndex && setup.controllerPlayerId > 0;
    addLogicElement(scene, seq, {
      name:KITS[team].shortName + ' ' + shirtNumberFor(slotIndex, roleDef.id) + ' ' + roleDef.label + (controlled ? ' (Player)' : ''),
      graph:playerGraph(team, slotIndex, slot, spawn, setup), group,
      assetKey:'logic:template:logic-template-player-soccer',
      position:[spawn.x, 0, spawn.z], heading:spawn.heading,
    });
  });
}

/* ---------------------------------------------------------
   08 Scene builder
   --------------------------------------------------------- */

function blankScene(){
  return {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}, logic:{}};
}

function buildScene(baseScene){
  const model = tactics();
  const scene = baseScene || blankScene();
  scene.added = (scene.added || []).filter(entry => !(entry && entry.name === 'Ground' && entry.asset && entry.asset.source === 'Editor primitive'));
  const seq = {n:0};
  const origin = {x:0, z:0};
  const pitch = model.normalizePitch({length:model.PITCH.length, width:model.PITCH.width, originX:origin.x, originZ:origin.z});

  addStadium(scene, seq, origin);

  const builder = root.LK_RUNTIME_SOCCER_STADIUM;
  const anchors = builder ? builder.gameplayAnchors(origin) : {
    goalNorth:{x:0, y:0, z:pitch.length / 2, heading:Math.PI},
    goalSouth:{x:0, y:0, z:-pitch.length / 2, heading:0},
    kickoff:{x:0, y:0, z:0},
  };
  addGoalsAndBall(scene, seq, anchors);

  addLogicElement(scene, seq, {
    name:'Soccer Match Director', graph:matchDirectorGraph(), group:GROUPS.director,
    assetKey:'logic:soccer-match-director', position:[0, .1, -pitch.length / 2 - 10],
  });

  addTeam(scene, seq, 'home', {
    formation:DEFAULTS.formationHome, tactic:DEFAULTS.tacticHome, difficulty:DEFAULTS.difficultyHome,
    controllerPlayerId:DEFAULTS.controllerPlayerId, controlledSlot:DEFAULTS.controlledSlot,
  }, pitch);
  addTeam(scene, seq, 'away', {
    formation:DEFAULTS.formationAway, tactic:DEFAULTS.tacticAway, difficulty:DEFAULTS.difficultyAway,
    controllerPlayerId:-1, controlledSlot:-1,
  }, pitch);

  scene.player = Object.assign({}, scene.player || {}, {enabled:false});
  scene.env = Object.assign({}, scene.env || {}, {
    skyTime:.25, dayLength:999999, dayNightCycleEnabled:false,
    procEnvEnabled:true, procEnvIntensity:1, procEnvWarmth:.48, procEnvContrast:.55,
    lighting:{daySun:1.45, dayAmbient:.95, moonDirect:.16, moonIndirect:.18},
    backgroundColor:'#16283f', fog:{enabled:false},
  });
  scene.template = {
    id:ID, name:'Soccer Match 11 v 11', version:1, nativeEditable:true,
    controls:{
      move:'WASD / arrows', sprint:'Shift', switchPlayer:'Tab / Q',
      shoot:'Hold F/X, aim with mouse or WASD, release', pass:'E', tackle:'C',
    },
  };
  return scene;
}

/* ---------------------------------------------------------
   09 Runtime director
   Reads the authored descriptors back out of the live scene and
   configures the shared systems. It never stores gameplay state
   of its own: the team AI and the match flow own that.
   --------------------------------------------------------- */

// Every descriptor key this director understands, in the order it applies them.
const DESCRIPTOR_KEYS = Object.freeze(['soccerMatchDirector', 'soccerTeamSetup', 'soccerTeamPlayer']);

/** Overlays live exposed-variable values onto a descriptor via their bindings. */
function overlayBindings(graph, key, target){
  const variables = graph && Array.isArray(graph.variables) ? graph.variables : [];
  const prefix = key + '.';
  for(let index = 0; index < variables.length; index++){
    const item = variables[index];
    const binding = item && typeof item.binding === 'string' ? item.binding : '';
    if(binding.indexOf(prefix) !== 0) continue;
    const path = binding.slice(prefix.length).split('.');
    let node = target;
    for(let step = 0; step < path.length - 1; step++){
      if(!node[path[step]] || typeof node[path[step]] !== 'object') node[path[step]] = {};
      node = node[path[step]];
    }
    node[path[path.length - 1]] = item.value;
  }
  return target;
}

function collectDescriptors(GAME){
  const found = {soccerMatchDirector:null, soccerTeamSetup:{home:null, away:null}, players:0};
  const objects = GAME && GAME.world && Array.isArray(GAME.world.registry) ? GAME.world.registry : [];
  for(let index = 0; index < objects.length; index++){
    const graph = objects[index] && objects[index].userData && objects[index].userData.logicGraph;
    if(!graph) continue;
    for(let k = 0; k < DESCRIPTOR_KEYS.length; k++){
      const key = DESCRIPTOR_KEYS[k];
      const descriptor = graph[key];
      if(!descriptor) continue;
      overlayBindings(graph, key, descriptor);
      if(key === 'soccerMatchDirector') found.soccerMatchDirector = descriptor;
      else if(key === 'soccerTeamSetup') found.soccerTeamSetup[tactics().side(descriptor.team)] = descriptor;
      else found.players++;
    }
  }
  return found;
}

function teamAiConfig(setup){
  const model = tactics();
  if(!setup) return {};
  return {
    formation:model.hasFormation(setup.formation) ? setup.formation : model.DEFAULT_FORMATION_ID,
    tactics:setup.tactics,
    difficulty:clamp01(setup.difficulty),
    controllerPlayerId:finite(setup.controllerPlayerId, -1) > 0 ? Math.round(setup.controllerPlayerId) : null,
    autoSwitch:setup.autoSwitch !== false,
  };
}

function matchFlowConfig(director, setups){
  const model = tactics();
  const rules = director && director.rules || {};
  const pitch = model.normalizePitch(director && director.pitch);
  const teamConfig = team => {
    const setup = setups[team] || {};
    return {
      name:setup.name, shortName:setup.shortName,
      color:setup.kit && setup.kit.shirt,
      keeperColor:setup.kit && setup.kit.keeperShirt,
      formation:model.hasFormation(setup.formation) ? setup.formation : model.DEFAULT_FORMATION_ID,
      aiDifficulty:clamp01(setup.difficulty == null ? .5 : setup.difficulty),
      playerSlot:finite(setup.controlledSlot, -1),
      controllerPlayerId:finite(setup.controllerPlayerId, -1),
    };
  };
  return {
    enabled:director ? director.enabled !== false : true,
    halves:finite(director && director.halves, DEFAULTS.halves),
    halfMinutes:finite(director && director.halfMinutes, DEFAULTS.halfMinutes),
    secondsPerMinute:finite(director && director.secondsPerMinute, DEFAULTS.secondsPerMinute),
    stoppageMinutes:finite(director && director.stoppageMinutes, DEFAULTS.stoppageMinutes),
    restartDelay:finite(director && director.restartDelay, DEFAULTS.restartDelay),
    kickoffTeam:director && director.kickoffTeam || 'home',
    extraTime:!!(director && director.extraTime),
    penaltiesOnDraw:director ? director.penaltiesOnDraw !== false : true,
    rules:{
      throwIns:rules.throwIns !== false, corners:rules.corners !== false, goalKicks:rules.goalKicks !== false,
      offside:rules.offside === true, fouls:rules.fouls === true,
    },
    pitch:{fieldLength:pitch.length, fieldWidth:pitch.width, originX:pitch.originX, originZ:pitch.originZ},
    teams:{home:teamConfig('home'), away:teamConfig('away')},
  };
}

function createMatchDirector(GAME){
  const state = {applied:false, descriptors:null};

  function apply(){
    const descriptors = collectDescriptors(GAME);
    if(!descriptors.soccerMatchDirector) return false;
    state.descriptors = descriptors;
    const model = tactics();
    const director = descriptors.soccerMatchDirector;
    const pitch = model.normalizePitch(director.pitch);
    const ai = director.ai || {};

    const teamAI = root.LK_RUNTIME_SOCCER_TEAM_AI && root.LK_RUNTIME_SOCCER_TEAM_AI.install(GAME);
    if(teamAI) teamAI.configure({
      enabled:director.enabled !== false,
      tickHz:finite(ai.tickHz, 12),
      playersPerTick:finite(ai.playersPerTick, 6),
      lod:ai.lod !== false,
      pitch,
      teams:{
        home:teamAiConfig(descriptors.soccerTeamSetup.home),
        away:teamAiConfig(descriptors.soccerTeamSetup.away),
      },
    });

    const match = root.LK_RUNTIME_SOCCER_MATCH && root.LK_RUNTIME_SOCCER_MATCH.install(GAME);
    if(match){
      match.configure(matchFlowConfig(director, descriptors.soccerTeamSetup));
      match.start();
    }
    state.applied = true;
    return true;
  }

  function update(){
    if(state.applied) return false;
    if(!(GAME && GAME.state && GAME.state.started)) return false;
    return apply();
  }
  function reset(){ state.applied = false; state.descriptors = null; }

  return Object.freeze({apply, update, reset, descriptors:() => state.descriptors, applied:() => state.applied});
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.soccerMatchDirector) return GAME.systems.soccerMatchDirector;
  const director = createMatchDirector(GAME);
  GAME.systems.soccerMatchDirector = director;
  if(GAME.hooks && Array.isArray(GAME.hooks.frame) && !GAME.hooks.__lkSoccerMatchDirectorFrame){
    GAME.hooks.__lkSoccerMatchDirectorFrame = true;
    GAME.hooks.frame.push(() => director.update());
  }
  return director;
}

/* ---------------------------------------------------------
   10 Registration
   --------------------------------------------------------- */

const API = Object.freeze({
  SCHEMA_VERSION, ID, KEYS, GROUPS, KITS, DEFAULTS,
  buildScene, createMatchDirector, install,
  overlayBindings, collectDescriptors, matchFlowConfig, teamAiConfig,
});

root.LK_RUNTIME_SOCCER_MATCH_LEVEL_TEMPLATE = API;
if(typeof module !== 'undefined' && module.exports) module.exports = API;

if(root.LK_LEVEL_TEMPLATES && root.LK_LEVEL_TEMPLATES.register){
  root.LK_LEVEL_TEMPLATES.register({
    id:ID, name:'Soccer Match 11 v 11', nameIt:'Partita di Calcio 11 contro 11',
    category:'Sports', order:390, ground:'plane', keepBuiltinPlayer:false,
    description:'Full eleven-a-side match: stadium, 22 editable Soccer Pawns, formations, tactics, team AI and match rules.',
    descriptionIt:'Partita completa 11 contro 11: stadio, 22 Pawn calcio editabili, formazioni, tattiche, AI di squadra e regole di gara.',
    build:function(scene){ return buildScene(scene); },
  });
}
if(root.LOT_KING) install(root.LOT_KING);
})();
