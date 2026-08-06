'use strict';

const assert = require('node:assert/strict');

global.window = global;
global.THREE = require('three');
require('../js/runtime/character-placeholder-locomotion.js');
require('../js/runtime/mixamo-placeholder-clips.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-nodes-soccer.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-soccer.js');
require('../js/logic/logic-validator.js');
require('../js/logic/logic-runtime.js');
require('../js/runtime/pawn-core.js');
require('../js/runtime/vehicle-physics-backends.js');
require('../js/runtime/vehicle-pawns.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-animation-set.js');
require('../js/runtime/soccer-locomotion.js');
require('../js/runtime/character-pawn-base.js');
require('../js/runtime/character-pawns.js');
require('../js/runtime/gameplay-difficulty.js');
require('../js/runtime/soccer-pawns.js');
require('../js/runtime/soccer-ball.js');
require('../js/runtime/penalty-flow.js');
require('../js/runtime/soccer-stadium.js');
require('../js/runtime/penalty-shootout-level-template.js');

const registry = global.LK_LOGIC_NODES_MVP.createRegistry();

function test(name, run){
  try {
    run();
    console.log('ok - ' + name);
  } catch(error){
    console.error('not ok - ' + name);
    throw error;
  }
}

test('soccer node pack registers through LK_LOGIC_NODE_PACKS', () => {
  ['soccer.setMoveInput', 'soccer.playAction', 'soccer.kickBall', 'soccer.registerGoal', 'penalty.start', 'penalty.getState', 'event.onGoalScored', 'event.onShootoutFinished']
    .forEach(type => assert.ok(registry.get(type), 'missing node ' + type));
  const spawnInputs = registry.get('soccer.spawnBall').inputs.map(input => input.name);
  assert.ok(spawnInputs.includes('mode'), 'ball spawn must expose match/penalty mode');
  assert.ok(spawnInputs.includes('locked'), 'ball spawn must expose its initial lock state');
});

test('soccer templates are registered and validate cleanly', () => {
  const ids = global.LK_LOGIC_TEMPLATES.list().map(t => t.id);
  assert.ok(ids.includes('logic-template-player-soccer'));
  assert.ok(ids.includes('logic-template-soccer-ball'));
  assert.ok(ids.includes('logic-template-soccer-goal'));
  assert.ok(ids.includes('logic-template-penalty-shootout'));
  assert.equal(global.LK_LOGIC_TEMPLATES.get('logic-template-player-soccer').graph.logicScene.elements.some(element=>element.id==='camera_anchor'),false,'Soccer Pawn camera config must not enlarge its spatial dummy');
  const playerGraph=global.LK_LOGIC_TEMPLATES.get('logic-template-player-soccer').graph;
  assert.equal(playerGraph.nodes.some(node=>node.type==='event.onKeyDown'),false,'shipped Soccer gameplay must not listen to raw keys');
  assert.equal(playerGraph.nodes.some(node=>node.type==='soccer.jump'),false,'Soccer template must not install a duplicate player Jump');
  ['diveLeft','diveRight'].forEach(action=>assert.ok(playerGraph.nodes.some(node=>node.type==='event.onInputActionDown'&&node.data.action===action),'missing semantic '+action));
  ['logic-template-player-soccer', 'logic-template-soccer-ball', 'logic-template-soccer-goal', 'logic-template-penalty-shootout'].forEach(id => {
    const template = global.LK_LOGIC_TEMPLATES.get(id);
    const graph = global.LK_LOGIC_GRAPH.normalizeGraph(template.graph, template.name, 'element');
    const result = global.LK_LOGIC_VALIDATOR.validateGraph(graph, registry);
    assert.equal(result.ok, true, id + ' errors: ' + JSON.stringify(result.errors));
  });
  const ballPreview = global.LK_LOGIC_TEMPLATES.get('logic-template-soccer-ball').graph.logicScene.elements.find(element => element.id === 'ball_preview');
  assert.ok(ballPreview && ballPreview.type === 'mesh' && ballPreview.primitive === 'sphere', 'Soccer Ball needs a regulation editor marker');
  assert.equal(ballPreview.runtimeVisual, false, 'editor marker must not duplicate the physical Play ball');
  const managerScene = global.LK_LOGIC_TEMPLATES.get('logic-template-penalty-shootout').graph.logicScene;
  assert.equal((managerScene.elements || []).some(element => element.name === 'Default Mesh' || element.mesh === 'box'), false, 'Penalty referee must not render the legacy debug cube');
});

test('player soccer template exposes role, animation slots and appearance bindings', () => {
  const template = global.LK_LOGIC_TEMPLATES.get('logic-template-player-soccer');
  const bindings = template.graph.variables.filter(v => v.exposed).map(v => v.binding);
  ['role', 'movement.runSpeed', 'movement.jumpHeight', 'movement.inputMode', 'movement.facingMode', 'locomotion.responsiveness', 'keeper.reach', 'keeper.aiEnabled', 'keeper.aiReaction', 'ball.autoControl', 'ball.controlRadius', 'ball.shootPower', 'ball.aimReticle', 'ball.passPower', 'animationLibrary', 'animations.shoot', 'animations.save', 'animations.diveLeft', 'animations.jump', 'appearance.shirtColor', 'appearance.hairColor', 'camera.mode', 'camera.view']
    .forEach(binding => assert.ok(bindings.includes(binding), 'missing binding ' + binding));
  assert.ok(template.graph.soccerPawn, 'graph.soccerPawn definition missing');
  assert.equal(template.graph.soccerPawn.playerId, 1);
});

test('soccer pawn config normalization: roles, defaults, goalkeeper set', () => {
  const soccer = global.LK_RUNTIME_SOCCER_PAWNS;
  assert.equal(soccer.normalizeRole('GOALKEEPER'), 'goalkeeper');
  assert.equal(soccer.normalizeRole('libero'), 'striker');
  const keeper = soccer.normalizeConfig({role:'goalkeeper', playerId:2});
  assert.equal(keeper.role, 'goalkeeper');
  assert.equal(keeper.playerId, 2);
  assert.ok(keeper.animations.diveLeft, 'goalkeeper needs a diveLeft clip slot');
  assert.ok(keeper.keeper.reach > 0);
  assert.equal(keeper.keeper.aiEnabled, true, 'unpossessed goalkeeper role must be ready to react by default');
  assert.equal(keeper.movement.facingMode,'heading');
  assert.equal(keeper.ball.autoControl, true);
  assert.ok(keeper.ball.shootPower > keeper.ball.passPower);
  const striker = soccer.normalizeConfig({});
  assert.ok(striker.animations.shoot, 'striker needs a shoot clip slot');
  assert.ok(striker.movement.runSpeed > striker.movement.walkSpeed);
});

test('Soccer Pawn does not overlay the legacy Jump when a Motion Set jump exists', () => {
  const GAME={systems:{}},registry=global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME),owner={position:{x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;}},rotation:{y:0},visible:true,userData:{},traverse(){}},pawn=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{animationSet:[{id:'jump-real',state:'jump',clip:'mixamo.com'}]},{});let oneShots=0;
  pawn.ensureLocomotion=()=>({playAction(){oneShots++;return true;}});
  assert.equal(pawn.jump(),true);
  assert.equal(oneShots,0,'the imported Motion Set Jump must own the airborne state');
  pawn.dispose();assert.equal(registry.get(pawn.id),null);
});

function mixamoTestRig(){
  const root=new global.THREE.Group(),names=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','LeftArm','LeftForeArm','LeftHand','RightShoulder','RightArm','RightForeArm','RightHand','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
  let parent=root;names.forEach((name,index)=>{const bone=new global.THREE.Bone();bone.name='mixamorig'+name;bone.position.y=index===0?1:.08;parent.add(bone);if(['Hips','Spine','Spine1'].includes(name))parent=bone;});
  return root;
}

test('Mixamo placeholder generator covers every Soccer slot without structural tracks', () => {
  const runtime=global.LK_RUNTIME_MIXAMO_PLACEHOLDER_CLIPS,root=mixamoTestRig(),slots=global.LK_RUNTIME_CHARACTER_LOCOMOTION.PROCEDURAL_FALLBACK_SLOTS;
  const clips=runtime.createSet(global.THREE,root,slots,{role:'goalkeeper'});
  slots.forEach(slot=>{
    const clip=clips[slot];assert.ok(clip,'missing generated '+slot);assert.ok(clip.tracks.length>=4,slot+' needs a readable full-body pose');
    assert.ok(clip.tracks.every(track=>/\.quaternion$/.test(track.name)),slot+' must not change Main Mesh position/scale');
    assert.equal(clip.userData.lkPlaceholderSlot,slot);
  });
  assert.notDeepEqual(Array.from(clips.diveLeft.tracks[0].values),Array.from(clips.diveRight.tracks[0].values),'keeper dives must be directional');
  assert.equal(clips.idle.tracks.some(track=>/UpLeg|Leg|Foot/i.test(track.name)),false,'idle fallback must preserve the authored rest-pose legs');
});

test('GLB locomotion binds generated rig clips only when authored takes are missing', () => {
  const node=new global.THREE.Group(),model=mixamoTestRig();model.userData.logicElementAssetVisual=true;node.add(model);
  const controller=global.LK_RUNTIME_CHARACTER_LOCOMOTION.createController({THREERef:global.THREE,role:'goalkeeper'});
  assert.equal(controller.bind(node,{idle:'Idle',walk:'Walking',run:'Running',save:'Goalkeeper Catch',diveLeft:'Goalkeeper Dive Left',diveRight:'Goalkeeper Dive Right'},[],[]),true);
  const names=controller.availableClips();assert.ok(names.includes('LK Placeholder · idle'));assert.ok(names.includes('LK Placeholder · diveLeft'));
  assert.equal(controller.playAction('Goalkeeper Dive Left',{slot:'diveLeft'}),true);
  controller.update({x:0,z:0},1/60);
  assert.equal(controller.holdActionAtProgress(.3),true);
  assert.ok(Math.abs(controller.actionProgress()-.3)<.02,'charged action must hold at its authored wind-up frame');
  assert.equal(controller.resumeAction(1.1),true);
  controller.dispose();
});

test('soccer pawn registers in the shared registry, moves and disposes', () => {
  const GAME = {systems:{}};
  const pawns = global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  assert.equal(GAME.pawns, pawns);
  const owner = {
    position:{x:1, y:0, z:2, set(x, y, z){ this.x = x; this.y = y; this.z = z; }},
    rotation:{y:0},
    visible:true,
    userData:{},
    traverse(){},
  };
  const pawn = global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME, owner, {role:'striker', playerId:1}, {});
  assert.ok(pawn, 'pawn created');
  assert.equal(pawn.pawnType, 'soccer');
  assert.equal(pawns.getByPlayerId(1), pawn);
  pawn.start();
  // No camera in the stub GAME: camera-relative input falls back to heading.
  pawn.setMoveInput({x:0, z:1, sprint:true});
  for(let i = 0; i < 60; i++) pawn.step(1 / 60);
  assert.ok(owner.position.z > 2.2, 'pawn moved forward, z=' + owner.position.z);
  assert.ok(pawn.state.speedKmh > 1);
  assert.equal(pawn.state.grounded, true);
  assert.equal(pawn.jump(), true, 'grounded pawn can jump');
  pawn.step(1 / 60);
  assert.ok(owner.position.y > 0, 'pawn left the ground, y=' + owner.position.y);
  assert.equal(pawn.jump(), false, 'no double jump while airborne');
  for(let i = 0; i < 120; i++) pawn.step(1 / 60);
  assert.equal(pawn.state.grounded, true, 'pawn landed');
  assert.ok(Math.abs(owner.position.y) < .001, 'pawn back on ground');
  assert.equal(pawn.applyBinding('movement.runSpeed', 8), true);
  assert.equal(pawn.config.movement.runSpeed, 8);
  assert.equal(pawn.applyBinding('role', 'goalkeeper'), true);
  assert.equal(pawn.config.role, 'goalkeeper');
  assert.equal(pawn.applyBinding('appearance.shirtColor', '#00ff00'), true);
  pawn.dispose();
  assert.equal(pawns.getByPlayerId(1), null);
});

test('Soccer possession release cannot leak a held shot into keeper or AI control', () => {
  const GAME={systems:{},core:{scene:new global.THREE.Scene()}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner=new global.THREE.Group();owner.userData={};
  const pawn=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{role:'striker',playerId:1},{});
  pawn.start();
  assert.equal(pawn.beginChargedShot({x:.5,z:.25}),true);
  pawn.state.shotChargeReadsDevice=true;
  pawn.state.actionButtonDown=true;
  assert.ok(pawn.state.shotCharge);
  assert.equal(pawn.unpossess(),true);
  assert.equal(pawn.playerId,null);
  assert.equal(pawn.possessed,false);
  assert.equal(pawn.control,null);
  assert.equal(pawn.state.shotCharge,null);
  assert.equal(pawn.state.shotChargeReadsDevice,false);
  assert.equal(pawn.state.actionButtonDown,false);
  pawn.dispose();
});

test('unpossessed goalkeeper AI predicts a penalty and commits to a directional dive', () => {
  global.LK_RUNTIME_GAMEPLAY_DIFFICULTY.set('normal',{persist:false});
  const GAME={systems:{},core:{scene:new global.THREE.Scene()}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner=new global.THREE.Group();
  owner.position.set(0,0,10);
  owner.rotation.y=0;
  owner.userData={};
  const shot={id:'penalty-ball',position:{x:2,y:.5,z:5},velocity:{x:0,y:0,z:10},inFlight:true,resolved:false};
  GAME.systems.soccerBall={list:()=>['penalty-ball'],state:()=>shot};
  const keeper=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{role:'goalkeeper',playerId:null,possessed:false,spawn:{x:0,y:0,z:10,heading:0},keeper:{aiEnabled:true,aiReaction:.02,aiPrediction:1.2,diveDistance:2.6,diveDuration:.55,reach:1.1}},{});
  keeper.start();
  keeper.step(.05);
  assert.equal(keeper.state.diving,true,'AI should commit before the ball reaches the goal line');
  assert.equal(keeper.state.diveDirection,1,'positive local target requires a right dive');
  assert.ok(owner.position.x>0,'dive must move the goalkeeper toward the predicted intercept');
  shot.inFlight=false;
  keeper.state.diving=false;
  keeper.dispose();
});

test('penalty setup aim rotates the player before shot charge begins', () => {
  const goal={id:'goal',x:0,y:0,z:11,heading:Math.PI,width:7.32,height:2.44};
  const GAME={systems:{soccerBall:{goals:()=>[goal]},penaltyFlow:{state:()=>({phase:'ready',round:1,kickingTeam:'A'})}},core:{scene:new global.THREE.Scene()}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner=new global.THREE.Group();owner.userData={};
  const pawn=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{role:'striker',playerId:1,movement:{turnRate:20}},{});
  pawn.start();
  assert.equal(pawn.wantsShotAimInput(),true);
  assert.equal(pawn.adjustShotAim(120,0),true);
  pawn.step(.05);
  assert.ok(pawn.state.setupAim&&pawn.state.setupAim.aimX>0,'mouse input must persist before charge');
  assert.ok(owner.rotation.y<-.01,'screen-right preparation must visibly rotate the body toward the selected goal side');
  pawn.beginChargedShot({});
  assert.equal(pawn.state.shotCharge.aimX,pawn.state.setupAim.aimX,'charge must inherit pre-shot mouse aim');
  pawn.dispose();
});

test('gameplay difficulty makes Easy goalkeeper slower and less capable than Hard', () => {
  const makeKeeper=()=>{
    const GAME={systems:{},core:{scene:new global.THREE.Scene()}};
    global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
    const owner=new global.THREE.Group();owner.position.set(0,0,10);owner.userData={};
    const shot={id:'difficulty-ball',position:{x:2,y:.5,z:5},velocity:{x:0,y:0,z:10},inFlight:true,resolved:false};
    GAME.systems.soccerBall={list:()=>['difficulty-ball'],state:()=>shot};
    const pawn=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{role:'goalkeeper',playerId:null,possessed:false,spawn:{x:0,y:0,z:10,heading:0},keeper:{aiReaction:.1,aiPrediction:1.2,diveDistance:2.6,diveDuration:.55,reach:1.1}},{});
    pawn.start();return {pawn,owner};
  };
  global.LK_RUNTIME_GAMEPLAY_DIFFICULTY.set('easy',{persist:false});
  const easy=makeKeeper();easy.pawn.step(.15);
  assert.equal(easy.pawn.state.diving,false,'Easy keeper must still be reacting');
  easy.pawn.dispose();
  global.LK_RUNTIME_GAMEPLAY_DIFFICULTY.set('hard',{persist:false});
  const hard=makeKeeper();hard.pawn.step(.15);
  assert.equal(hard.pawn.state.diving,true,'Hard keeper should commit inside the same time window');
  hard.pawn.dispose();
  global.LK_RUNTIME_GAMEPLAY_DIFFICULTY.set('normal',{persist:false});
});

test('gameplay difficulty scales unpossessed field-player opponent AI', () => {
  const GAME={systems:{},core:{scene:new global.THREE.Scene()}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  GAME.systems.soccerBall={list:()=>['field-ball'],state:()=>({id:'field-ball',position:{x:4,y:.11,z:4},resolved:false})};
  const owner=new global.THREE.Group();owner.userData={};
  const pawn=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{role:'defender',playerId:null,possessed:false,fieldAI:{enabled:true,reaction:.05}},{});
  pawn.start();
  global.LK_RUNTIME_GAMEPLAY_DIFFICULTY.set('easy',{persist:false});
  const easy={x:0,z:0,sprint:false};pawn.updateFieldAI(.2,easy);
  pawn.state.fieldAI.reaction=0;pawn.state.fieldAI.ballId=null;
  global.LK_RUNTIME_GAMEPLAY_DIFFICULTY.set('hard',{persist:false});
  const hard={x:0,z:0,sprint:false};pawn.updateFieldAI(.2,hard);
  assert.ok(Math.hypot(hard.x,hard.z)>Math.hypot(easy.x,easy.z),'Hard field opponent must close down faster than Easy');
  assert.equal(hard.sprint,true);
  pawn.dispose();
  global.LK_RUNTIME_GAMEPLAY_DIFFICULTY.set('normal',{persist:false});
});

test('penalty flow: alternating kicks, early decision and winner', () => {
  const flow = global.LK_RUNTIME_PENALTY_FLOW.create({systems:{}});
  flow.configure({kicksPerTeam:2, teamA:'Rossi', teamB:'Blu', autoAdvanceDelay:.2});
  flow.start();
  assert.equal(flow.state().phase, 'ready');
  assert.equal(flow.state().kickingTeam, 'A');
  flow.recordResult('goal');   // A 1-0
  assert.equal(flow.state().lastResult,'goal');
  assert.equal(flow.state().resultSequence,1);
  flow.advance();
  assert.equal(flow.state().kickingTeam, 'B');
  flow.recordResult('saved');  // A 1-0 B miss
  assert.equal(flow.state().lastResult,'saved');
  flow.advance();
  flow.recordResult('goal');   // A 2-0
  flow.advance();
  // B can reach at most 1 < 2: mathematically decided.
  assert.equal(flow.state().finished, true);
  assert.equal(flow.state().winner, 'A');
  assert.equal(flow.state().winnerName, 'Rossi');
  assert.equal(flow.state().scoreA, 2);
  assert.equal(flow.state().scoreB, 0);
});

test('penalty flow: sudden death resolves on difference', () => {
  const flow = global.LK_RUNTIME_PENALTY_FLOW.create({systems:{}});
  flow.configure({kicksPerTeam:1, autoAdvanceDelay:.2});
  flow.start();
  flow.recordResult('goal'); flow.advance();   // A 1
  flow.recordResult('goal'); flow.advance();   // B 1 -> sudden death
  assert.equal(flow.state().finished, false);
  assert.equal(flow.state().suddenDeath, true);
  flow.recordResult('goal'); flow.advance();   // A 2
  flow.recordResult('miss'); flow.advance();   // B 1 -> decided
  assert.equal(flow.state().finished, true);
  assert.equal(flow.state().winner, 'A');
});

test('soccer ball goal registry uses regulation frame defaults', () => {
  const ball = global.LK_RUNTIME_SOCCER_BALL.create({systems:{}});
  const goalId = ball.registerGoal({x:0, z:52.5, heading:Math.PI, team:'A'});
  const goal = ball.goals().find(g => g.id === goalId);
  assert.equal(goal.width, 7.32);
  assert.equal(goal.height, 2.44);
  assert.equal(global.LK_RUNTIME_SOCCER_BALL.BALL_RADIUS, .11);
});

test('shared ball supports soft match control, timed strikes and penalty locking', () => {
  const GAME={systems:{},core:{scene:new global.THREE.Scene()}},ball=global.LK_RUNTIME_SOCCER_BALL.create(GAME),id=ball.spawn({id:'test-ball',x:0,y:.11,z:.65,mode:'match'}),owner=new global.THREE.Group();
  owner.position.set(0,0,0);owner.rotation.y=0;const pawn={id:'player-1',owner};
  assert.equal(ball.controlNearest(pawn,{},1/60),true);
  assert.equal(ball.strikeNearest(pawn,{action:'shoot'}),true);
  assert.ok(ball.state(id).speedKmh>20,'shoot should create a real ball impulse');
  ball.reset(id);ball.setMode(id,'penalty',true);
  assert.equal(ball.controlNearest(pawn,{},1/60),false,'penalty ball stays on its mark');
  assert.equal(ball.state(id).locked,true);
  assert.equal(ball.strikeNearest(pawn,{action:'shoot'}),true,'foot contact unlocks the penalty ball');
  assert.equal(ball.state(id).locked,false);
});

test('shot preview and live flight expose the same visible physical trajectory', () => {
  const scene=new global.THREE.Scene(),GAME={systems:{},core:{scene}},ball=global.LK_RUNTIME_SOCCER_BALL.create(GAME);
  const id=ball.spawn({id:'trajectory-ball',x:0,y:.11,z:.4,mode:'penalty',locked:true});
  const owner=new global.THREE.Group();owner.position.set(0,0,0);
  assert.equal(ball.previewNearest({id:'kicker',owner},{target:{x:1.5,y:1.2,z:12},power:24,lift:.15,curve:.2}),true);
  const line=scene.children.find(node=>node.userData&&node.userData.soccerTrajectory);
  assert.ok(line&&line.visible&&line.geometry.drawRange.count>8,'charge must show a useful trajectory');
  assert.equal(ball.kick(id,{target:{x:1.5,y:1.2,z:12},power:24,lift:.15,curve:.2}),true);
  assert.equal(line.visible,true,'trajectory remains live after foot contact');
});

test('goalkeeper contact catches controlled shots and physically parries hard ones', () => {
  const scene=new global.THREE.Scene(),GAME={systems:{},core:{scene}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const system=global.LK_RUNTIME_SOCCER_BALL.create(GAME);GAME.systems.soccerBall=system;
  const keeperOwner=new global.THREE.Group();keeperOwner.position.set(0,0,2);keeperOwner.rotation.y=Math.PI;keeperOwner.userData={};
  const keeper=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,keeperOwner,{role:'goalkeeper',playerId:null,possessed:false,keeper:{aiEnabled:false,reach:1.25}},{});
  keeper.start();
  const id=system.spawn({id:'save-ball',x:0,y:.8,z:0,mode:'penalty'});
  system.kick(id,{target:{x:0,y:1.05,z:2},power:10,lift:0});
  for(let i=0;i<40&&!system.state(id).resolved;i++)GAME.pawns.stepAll(1/120);
  assert.equal(system.state(id).outcome,'OnBallSaved');
  const before=system.state(id).position.x;keeperOwner.position.x+=.6;GAME.pawns.stepAll(1/60);
  assert.ok(system.state(id).position.x>before+.3,'caught ball must follow the keeper instead of disappearing');
  keeperOwner.position.x=0;system.reset(id);
  system.kick(id,{target:{x:0,y:1.05,z:2},power:30,lift:0});
  for(let i=0;i<40&&!system.state(id).resolved;i++)GAME.pawns.stepAll(1/120);
  assert.equal(system.state(id).outcome,'OnBallSaved');
  assert.ok(system.state(id).speedKmh>5,'hard save must retain a visible rebound velocity');
  keeper.dispose();
});

test('charged shot preserves authored aim, power and curve until foot contact', () => {
  const GAME={systems:{soccerBall:{goals:()=>[{id:'goal',x:0,y:0,z:11,heading:Math.PI,width:7.32,height:2.44}]}},core:{scene:new global.THREE.Scene()}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner=new global.THREE.Group();owner.userData={};owner.position.set(0,0,0);owner.rotation.y=0;
  const pawn=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{role:'striker',playerId:1,ball:{shootPower:28,shotMinPower:10,shotChargeTime:1,shotCurve:.7}},{});
  pawn.start();
  assert.equal(pawn.beginChargedShot({x:.75,z:.5}),true);
  Object.assign(pawn.state.shotCharge,{normalized:.8,aimX:.75,aimY:.5,curve:true});
  assert.equal(pawn.releaseChargedShot(),true);
  assert.ok(pawn.state.pendingBallContact,'shot waits for the authored animation contact frame');
  assert.ok(pawn.state.pendingBallContact.options.power>20,'charge controls physical power');
  assert.ok(pawn.state.pendingBallContact.options.target.x<0,'positive screen aim must use the north goal camera-right side');
  assert.ok(Math.abs(pawn.state.pendingBallContact.options.curve)>.2,'sprint modifier adds curve');
  pawn.dispose();
});

test('penalty run-up and charged aim rotate the player toward the physical target', () => {
  const goal={id:'goal',x:0,y:0,z:11,heading:Math.PI,width:7.32,height:2.44};
  const GAME={systems:{soccerBall:{goals:()=>[goal],previewNearest:()=>true},penaltyFlow:{state:()=>({phase:'ready'})}},core:{scene:new global.THREE.Scene()}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner=new global.THREE.Group();owner.userData={};owner.position.set(2,0,0);owner.rotation.y=0;
  const pawn=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{role:'striker',playerId:1},{});
  pawn.start();pawn.beforeMovementStep(.1,{x:-1,z:0,action:false,sprint:false});
  assert.ok(owner.rotation.y<0,'moving during the run-up must keep the body oriented toward goal');
  owner.rotation.y=0;pawn.beginChargedShot({x:0,z:0});
  Object.assign(pawn.state.shotCharge,{aimX:.8,aimY:0,pointerAim:true});
  pawn.beforeMovementStep(.1,{x:0,z:0,action:true,sprint:false});
  assert.ok(owner.rotation.y<-.05,'screen-right target must rotate the body toward that same shot line');
  pawn.dispose();
});

test('mouse-right always moves the physical target right in the active camera', () => {
  const camera=new global.THREE.PerspectiveCamera(60,16/9,.1,100);camera.position.set(0,3,-5);camera.lookAt(0,1,11);camera.updateMatrixWorld(true);
  const goal={id:'goal',x:0,y:0,z:11,heading:Math.PI,width:7.32,height:2.44},GAME={systems:{soccerBall:{goals:()=>[goal]}},core:{scene:new global.THREE.Scene(),camera}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner=new global.THREE.Group();owner.userData={};owner.position.set(0,0,0);
  const pawn=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{role:'striker',playerId:1},{});
  pawn.start();pawn.beginChargedShot({x:0,z:0});
  const before=pawn.buildShotPlan(pawn.state.shotCharge,false),a=new global.THREE.Vector3(before.target.x,before.target.y,before.target.z).project(camera);
  pawn.adjustShotAim(80,0);
  const after=pawn.buildShotPlan(pawn.state.shotCharge,false),b=new global.THREE.Vector3(after.target.x,after.target.y,after.target.z).project(camera);
  assert.ok(b.x>a.x,'mouse-right target and projected reticle must travel together');
  pawn.dispose();
});

test('legacy OnKeyDown shoot starts charge and releases toward the authored aim', () => {
  const GAME={systems:{soccerBall:{goals:()=>[{id:'goal',x:0,y:0,z:11,heading:Math.PI,width:7.32,height:2.44}]}},core:{scene:new global.THREE.Scene()}};
  global.LK_RUNTIME_VEHICLE_PAWNS.install(GAME);
  const owner=new global.THREE.Group();owner.userData={};owner.position.set(0,0,0);owner.rotation.y=0;
  const pawn=global.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME,owner,{role:'striker',playerId:1},{});
  let drive={x:-.8,z:.65,sprint:true,action:true};
  pawn.readPlayerDrive=()=>Object.assign({},drive);
  pawn.start();
  assert.equal(pawn.playAction('shoot',{speed:1}),true,'old key-down node must be accepted');
  assert.ok(pawn.state.shotCharge,'old graph must begin charge instead of firing centrally');
  assert.ok(!pawn.state.pendingBallContact);
  pawn.step(.5);
  drive={x:-.8,z:.65,sprint:true,action:false};
  pawn.step(1/60);
  assert.ok(pawn.state.pendingBallContact,'release must commit the animation-synchronized kick');
  assert.ok(pawn.state.pendingBallContact.options.target.x>0,'negative legacy aim must reach the north goal camera-left side');
  assert.ok(pawn.state.pendingBallContact.options.power>10);
  pawn.dispose();
});

test('touching a locked penalty ball physically moves it and resolves a miss', () => {
  const GAME={systems:{},core:{scene:new global.THREE.Scene()}},ball=global.LK_RUNTIME_SOCCER_BALL.create(GAME);
  const id=ball.spawn({id:'penalty-touch',x:0,y:.11,z:.2,mode:'penalty',locked:true});
  const owner=new global.THREE.Group();owner.position.set(0,0,0);owner.rotation.y=0;
  const pawn={id:'kicker',owner,state:{velocityX:0,velocityY:0,velocityZ:2}};
  assert.equal(ball.touchNearest(pawn,{radius:1},1/60),true);
  const state=ball.state(id);
  assert.equal(state.locked,false);
  assert.equal(state.resolved,true);
  assert.equal(state.outcome,'OnBallOut');
  assert.ok(state.speedKmh>1,'illegal touch must still move the physical ball');
});

test('soccer stadium builder produces a regulation penalty level', () => {
  const stadium = global.LK_RUNTIME_SOCCER_STADIUM;
  const entries = stadium.buildEntries({x:0, z:0});
  assert.ok(entries.length > 100, 'stadium entries: ' + entries.length);
  const names = entries.map(e => e.name);
  ['Stadium - Pitch Grass', 'Stadium - Penalty Spot North', 'Stadium - Goal Crossbar South', 'Stadium - Players Tunnel Frame', 'Stadium - Corner Flag NE', 'Stadium - Floodlight 4']
    .forEach(name => assert.ok(names.includes(name), 'missing ' + name));
  assert.ok(names.some(n => n.indexOf('Stadium - Fans ') === 0), 'fans placeholder missing');
  assert.equal(names.filter(n => n.indexOf('Stadium - Penalty Arc North') === 0).length,1,'penalty D must be one smooth primitive');
  assert.ok(entries.some(e=>e.name==='Stadium - Goal Net North'&&e.prim==='goalNet'),'goal must use one open net grid');
  assert.ok(entries.find(e=>e.name==='Stadium - Goal Top Rail West North').t.r[0]>0,'north upper rails must slope toward the rear frame');
  const postWest = entries.find(e => e.name === 'Stadium - Goal Post West North');
  const postEast = entries.find(e => e.name === 'Stadium - Goal Post East North');
  const span = Math.abs(postEast.t.p[0] - postWest.t.p[0]);
  assert.ok(Math.abs(span - (7.32 + .12)) < .01, 'goal post span: ' + span);
  const anchors = stadium.gameplayAnchors({x:0, z:0});
  assert.equal(anchors.penaltySpotNorth.z, 52.5 - 11);
  assert.equal(anchors.goalNorth.heading, Math.PI);
});

test('penalty shootout stadium level template places a ready-to-play penalty setup', () => {
  const scene = global.LK_RUNTIME_PENALTY_SHOOTOUT_LEVEL_TEMPLATE.buildScene({version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, ui:{}, logic:{}});
  const primitives = scene.added.filter(entry => entry.kind === 'primitive');
  const lights = scene.added.filter(entry => entry.kind === 'light');
  const logicElements = scene.added.filter(entry => entry.kind === 'logicElement');
  assert.ok(primitives.length > 100, 'stadium primitives: ' + primitives.length);
  assert.ok(lights.length >= 4, 'stadium floodlights: ' + lights.length);
  assert.equal(logicElements.length, 5, 'expected kicker, goalkeeper, ball, goal sensor and shootout manager');

  const kicker = logicElements.find(entry => entry.name === 'Penalty Kicker (Player)');
  assert.ok(kicker && kicker.graph.soccerPawn, 'kicker Logic Element missing');
  assert.equal(kicker.graph.soccerPawn.role, 'striker');
  assert.equal(kicker.graph.soccerPawn.playerId, 1);
  assert.equal(kicker.graph.soccerPawn.possessed, true);

  const keeper = logicElements.find(entry => entry.name === 'Penalty Goalkeeper');
  assert.ok(keeper && keeper.graph.soccerPawn, 'goalkeeper Logic Element missing');
  assert.equal(keeper.graph.soccerPawn.role, 'goalkeeper');
  assert.equal(keeper.graph.soccerPawn.possessed, false);
  assert.equal(keeper.graph.soccerPawn.keeper.aiEnabled, true);
  const keeperController = keeper.graph.variables.find(v => v.name === 'ControllerPlayerId');
  assert.equal(keeperController.value, -1, 'goalkeeper must not auto-possess Player 1 from its own On Start graph');
  assert.equal(keeper.graph.variables.find(v => v.name === 'Role').value, 'goalkeeper', 'Play binding must preserve the keeper role');
  assert.equal(keeper.graph.variables.find(v => v.name === 'ShirtColor').value, '#facc15', 'Play binding must preserve the yellow keeper kit');
  assert.equal(keeper.graph.variables.find(v => v.name === 'KeeperAI').value, true);

  const manager = logicElements.find(entry => entry.name === 'Penalty Shootout Manager');
  assert.ok(manager, 'shootout manager Logic Element missing');
  const varValue = name => manager.graph.variables.find(v => v.name === name).value;
  assert.equal(varValue('GoalZ'), 52.5);
  assert.equal(varValue('SpotZ'), 52.5 - 11);
  assert.equal(varValue('GoalHeading'), Math.PI);
  assert.equal(varValue('GoalId'), 'penalty-goal');
  assert.equal(varValue('BallId'), 'penalty-ball');

  const ball = logicElements.find(entry => entry.name === 'Penalty Ball');
  const ballVar = name => ball.graph.variables.find(v => v.name === name).value;
  assert.ok(ball, 'explicit Penalty Ball Logic Element missing');
  assert.equal(ballVar('BallMode'), 'penalty');
  assert.equal(ballVar('LockedAtStart'), true);
  const goalSensor = logicElements.find(entry => entry.name === 'Penalty Goal Sensor');
  assert.ok(goalSensor, 'explicit Goal Frame Logic Element missing');
  assert.equal(goalSensor.graph.variables.find(v => v.name === 'GoalId').value, 'penalty-goal');

  assert.equal(scene.template.id, 'penalty-shootout-stadium');
  assert.equal(scene.template.version, 5);
  // The shipped penalty.configure node predates the v2 shootout dials, so the
  // extra direction travels as exposed variables plus a runtime descriptor.
  assert.ok(manager.graph.penaltyShootout, 'shootout direction descriptor missing');
  const managerBindings = manager.graph.variables.map(v => v.binding);
  ['penaltyShootout.keeperSkill', 'penaltyShootout.runUpSeconds', 'penaltyShootout.pressureEnabled',
   'penaltyShootout.presentationCameras', 'penaltyShootout.autoAdvanceDelay']
    .forEach(binding => assert.ok(managerBindings.includes(binding), 'missing ' + binding));
  assert.equal(scene.env.skyTime, .25, 'penalty preset must start at noon');
  assert.equal(scene.env.dayNightCycleEnabled, false, 'authored noon must stay stable while editing');
  assert.ok(scene.env.lighting.daySun >= 1.4 && scene.env.lighting.dayAmbient >= .9, 'stadium daylight must remain readable');
  assert.ok(scene.added.every(entry => !(entry.name === 'Ground' && entry.asset && entry.asset.source === 'Editor primitive')), 'generic Ground plane should be replaced by the pitch');
});

console.log('All soccer core tests passed.');
