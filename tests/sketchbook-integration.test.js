'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const CANNON = require('cannon');
const THREE = require('three');

const ROOT = path.join(__dirname, '..');
const REPOSITORY = 'https://github.com/swift502/Sketchbook';
const SOURCE_COMMIT = '62f4b7986fd1ce1e4f91daba89ef032c20a6ce55';
const PAWN_TYPES = ['advanced-character', 'car', 'airplane', 'helicopter'];
const TEMPLATE_IDS = PAWN_TYPES.map(type => 'logic-template-sketchbook-' + type);
const ASSET_HASHES = Object.freeze({
  'models/sketchbook/world.glb':'2f38a76c0c954ff30d06aeca8bc0f0555cdfd70b5cc665f98514017008524e58',
  'models/sketchbook/boxman.glb':'3540a3dc0dcab22982be12a7f4f6132822f2abaac6f140dc4c08a312af49f8a9',
  'models/sketchbook/car.glb':'697672a989130ce4bde31cd31185c1c4edae816920cb6e61b4705ace99b28422',
  'models/sketchbook/airplane.glb':'ea62746672ae2b423e9a36b2abb72243b2e58338c6bc5e101545eea5a67db873',
  'models/sketchbook/heli.glb':'1fe2a67a8881d493dbe99e1dd5319f5c958d71491161aa89dbde90c4a3d04bd7',
});

function source(relativePath){
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function load(relativePath){
  const absolutePath = path.join(ROOT, relativePath);
  assert.ok(fs.existsSync(absolutePath), 'missing integration module ' + relativePath);
  require(absolutePath);
}

function copy(value){
  return JSON.parse(JSON.stringify(value));
}

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

function collectAssetPaths(value, out, seen){
  out = out || new Set();
  seen = seen || new Set();
  if(typeof value === 'string'){
    if(/\.(?:glb|gltf|png|jpe?g|webp|wav|mp3)$/i.test(value)) out.add(value);
    return out;
  }
  if(!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  if(Array.isArray(value)) value.forEach(item => collectAssetPaths(item, out, seen));
  else Object.keys(value).forEach(key => collectAssetPaths(value[key], out, seen));
  return out;
}

global.window = global;
global.CANNON = CANNON;
global.THREE = THREE;

load('js/logic/logic-templates.js');
const originalPlayerCarTemplate = copy(global.LK_LOGIC_TEMPLATES.get('logic-template-player-car'));
load('js/logic/logic-templates-sketchbook.js');
load('js/runtime/vehicle-occupancy.js');
load('js/runtime/vehicle-engine-audio.js');
load('js/runtime/sketchbook-pawns.js');
// The district ring must be loaded BEFORE the level template builds a scene:
// the template resolves the pack at build time and degrades to the 0.7.7 world
// when it is absent, so loading it late would silently test the old level.
load('js/runtime/open-world-districts.js');
load('js/runtime/sketchbook-open-world-level-template.js');
load('js/logic/logic-services.js');
load('js/editor/asset-catalog.js');

test('Sketchbook Logic Elements register additively without changing player_car', () => {
  TEMPLATE_IDS.forEach((id, index) => {
    const template = global.LK_LOGIC_TEMPLATES.get(id);
    assert.ok(template, 'missing template ' + id);
    assert.ok(template.graph && template.graph.sketchbookPawn, id + ' must own graph.sketchbookPawn');
    assert.equal(template.graph.sketchbookPawn.kind || template.graph.sketchbookPawn.type, PAWN_TYPES[index]);
    if(PAWN_TYPES[index] !== 'advanced-character')assert.deepEqual(template.graph.sketchbookPawn.engineAudio,{enabled:true,volume:.28,pitch:1,setId:null},id+' owns an independent Engine Sound assignment');
    if(PAWN_TYPES[index] === 'advanced-character'){
      assert.equal(template.graph.sketchbookPawn.camera.mode, 'free', 'the bundled character must not inherit vehicle chase-camera feedback');
      assert.equal(template.graph.sketchbookPawn.cameraDefaultVersion, 1);
      assert.equal(template.graph.sketchbookPawn.animationDefaultVersion, 1);
      const modelElement=template.graph.logicScene.elements.find(element=>element&&element.id==='advanced-character_model');
      assert.deepEqual(modelElement.animation,{enabled:true,clip:'idle',autoplay:false,loop:'repeat',speed:1,playInEditor:false},
        'boxman stays in its authored rest pose in the editor and locomotion is its only runtime animation authority');
      assert.equal(template.graph.variables.find(variable => variable.name === 'CameraMode').value, 'free');
    }
    ['MaximumExitSpeed','InteractionCooldown','ExitOffset','AllowAirExit'].forEach(name => {
      assert.ok(template.graph.variables.some(variable => variable.name === name), id + ' must expose ' + name);
    });
    const modelAsset = template.graph.variables.find(variable => variable.name === 'ModelAsset');
    assert.equal(modelAsset.type, 'asset');
    assert.equal(modelAsset.binding, 'modelAsset');
    assert.equal(modelAsset.ui, 'sketchbook-model-asset');
    assert.deepEqual(modelAsset.value, template.graph.sketchbookPawn.modelAsset, id + ' stores a portable full GLB descriptor');
    assert.ok(template.graph.variables.some(variable => variable.name === 'ModelFit' && variable.binding === 'modelAsset.fit'));
    const playerId = template.graph.variables.find(variable => variable.name === 'ControllerPlayerId');
    assert.equal(playerId.ui, 'player-id'); assert.equal(playerId.max, 4);
    assert.equal(template.graph.sketchbookPawn.runtimeCapabilities.proceduralTransitionFallback, true);
  });
  const characterTemplate = global.LK_LOGIC_TEMPLATES.get('logic-template-sketchbook-advanced-character');
  ['EntryChoreography','ApproachSpeed','ApproachStopDistance','ApproachTimeout','EnterTransitionDuration','ExitTransitionDuration','DriverEnterClipLeft','DriverEnterClipRight','PassengerEnterClipLeft','PassengerEnterClipRight','AirplaneEnterClipLeft','AirplaneEnterClipRight','DriverExitClipLeft','DriverExitClipRight','PassengerExitClipLeft','PassengerExitClipRight','DrivingClip','PassengerSeatedClip','IdleClip','WalkClip','SprintClip','JumpClip','FallClip']
    .forEach(name => assert.ok(characterTemplate.graph.variables.some(variable => variable.name === name), 'character must expose ' + name));
  const characterValues = new Map(characterTemplate.graph.variables.map(variable => [variable.name, variable.value]));
  assert.equal(characterValues.get('DriverEnterClipLeft'), 'sit_down_left'); assert.equal(characterValues.get('DriverEnterClipRight'), 'sit_down_right');
  assert.equal(characterValues.get('DriverExitClipLeft'), 'stand_up_left'); assert.equal(characterValues.get('AirplaneEnterClipRight'), 'enter_airplane_right');
  const carTemplate = global.LK_LOGIC_TEMPLATES.get('logic-template-sketchbook-car');
  assert.ok(carTemplate.graph.variables.some(variable => variable.name === 'BrakeForce' && variable.binding === 'tuning.brakes.brakeForce'));
  assert.ok(carTemplate.graph.variables.some(variable => variable.name === 'ShiftTime' && variable.binding === 'tuning.drive.shiftTime'));
  assert.deepEqual(global.LK_LOGIC_TEMPLATES.get('logic-template-player-car'), originalPlayerCarTemplate,
    'the existing editable player_car template is an invariant');
  assert.ok(global.LK_LOGIC_TEMPLATES_SKETCHBOOK, 'the external Sketchbook template pack must expose its manifest');
});

test('Sketchbook pawn runtime exposes a pinned, normalized public contract', () => {
  const runtime = global.LK_RUNTIME_SKETCHBOOK_PAWNS;
  assert.ok(runtime);
  ['normalizeConfig', 'createCoordinator', 'parseWorldPhysicsExtras', 'parseWorldMetadata', 'metadataRegistry', 'createLogic', 'install', 'manifest']
    .forEach(name => assert.equal(typeof runtime[name], 'function', 'missing runtime API ' + name));
  assert.equal(runtime.SCHEMA_VERSION, 1);
  PAWN_TYPES.forEach(type => {
    const fromKind = runtime.normalizeConfig({kind:type});
    const fromType = runtime.normalizeConfig({type});
    assert.equal(fromKind.type || fromKind.kind, type);
    assert.equal(fromType.type || fromType.kind, type);
    assert.deepEqual(runtime.normalizeConfig(fromKind), fromKind, type + ' normalization must be idempotent');
  });
  const manifest = runtime.manifest();
  const manifestText = JSON.stringify(manifest);
  assert.ok(manifestText.includes(REPOSITORY));
  assert.ok(manifestText.includes(SOURCE_COMMIT));
  assert.match(manifestText, /MIT/);
  const editableCar = runtime.normalizeConfig({type:'car', tuning:{drive:{shiftTime:.37}, brakes:{brakeForce:3210}}});
  assert.equal(editableCar.tuning.shiftTime, .37); assert.equal(editableCar.tuning.brakeForce, 3210);
  const editablePlane = runtime.normalizeConfig({type:'airplane', tuning:{engine:{spoolUp:.72, spoolDown:.31}}});
  assert.equal(editablePlane.flight.spoolUp, .72); assert.equal(editablePlane.flight.spoolDown, .31);
});

test('Sketchbook Pawn GLBs use a dedicated all-model inspector and remain scene/export assets', () => {
  const inspector = source('js/editor/logic-elements-inspector.js'), store = source('js/engine/scene-store.js');
  assert.match(inspector, /function buildSketchbookModelAssetControl\(/);
  assert.match(inspector, /assetLibraryLoad\(\)\.filter\(asset => asset && asset\.kind === 'glb'\)/,
    'the Pawn picker accepts vehicle and aircraft GLBs instead of the Soccer animation filter');
  assert.match(inspector, /variable\.ui === 'sketchbook-model-asset'/);
  assert.match(store, /function syncSketchbookModelAsset\(/);
  assert.match(store, /modelElement\.asset=cloneData\(descriptor\)/,
    'the selected asset is mirrored into logicScene where persistence and playable export discover it');
});

test('Sketchbook physics coordinator steps the active family once and degrades headlessly', () => {
  const runtime = global.LK_RUNTIME_SKETCHBOOK_PAWNS;
  const GAME = {};
  const coordinator = runtime.createCoordinator(GAME);
  assert.equal(runtime.createCoordinator(GAME), coordinator, 'one GAME must own one shared physics coordinator');
  const calls = [];
  const first = {id:'first', started:true, enabled:true, sleeping:false, physicsReady:true, afterPhysics:dt => calls.push(['first', dt])};
  const second = {id:'second', started:true, enabled:true, sleeping:false, physicsReady:true, afterPhysics:dt => calls.push(['second', dt])};
  coordinator.register(first);
  coordinator.register(first);
  coordinator.register(second);
  assert.equal(coordinator.records.length, 2, 'register must be idempotent');
  assert.equal(coordinator.drive(first, 1), false, 'only the final active pawn coordinates the shared world step');
  assert.equal(coordinator.drive(second, 1), true);
  assert.deepEqual(calls, [['first', 1/30], ['second', 1/30]], 'dt follows Sketchbook\'s 30 fps safety cap and every active family member receives one post-step');
  coordinator.unregister(first);
  assert.deepEqual(coordinator.active(), [second]);

  const unsupported = runtime.parseWorldPhysicsExtras({}, [{type:'box', halfExtents:[1, 1, 1]}]);
  assert.equal(unsupported.supported, false);
  assert.deepEqual(unsupported.bodies, []);
  assert.doesNotThrow(() => unsupported.dispose());

  const physicsCalls = [];
  const physicsWorld = {allowSleep:false, step:(fixed, elapsed, substeps) => physicsCalls.push([fixed, elapsed, substeps])};
  const physicsGame = {systems:{physics:{raw:{world:physicsWorld}}}, world:{registry:[]}};
  const physicsCoordinator = runtime.createCoordinator(physicsGame);
  const physicsPawn = {id:'physics', started:true, enabled:true, sleeping:false, physicsReady:true, afterPhysics(){}};
  physicsCoordinator.register(physicsPawn);
  assert.equal(physicsCoordinator.drive(physicsPawn, 1), true);
  assert.deepEqual(physicsCalls, [[1/60, 1/30, 3]], 'runtime matches upstream 60 Hz physics without the previous double-rate workload');
  assert.equal(physicsWorld.allowSleep, true, 'parked Sketchbook bodies may sleep after startup');
});

test('scene-store hot reload replaces its global animation frame hook instead of doubling mixers', () => {
  const text=source('js/engine/scene-store.js'),begin=text.indexOf('const sceneStoreEffectHookToken = {}'),end=text.indexOf('// ------------------------------------------------ apply the whole saved scene at boot');
  assert.ok(begin>=0&&end>begin,'scene-store effect-hook lifecycle section must remain testable');
  const section=text.slice(begin,end),updates={effect:0,animation:0,warmup:0};
  const makeEnsure=()=>new Function('dynamicMaterialTextures','drawDynamicVehicleHud','drawDynamicRadioHud','document','runSurfaceWarmup',section+'\nreturn ensureEffectHook;')(
    new Set(),()=>{},()=>{},{hidden:false},()=>{updates.warmup++;}
  );
  const object={userData:{effectUpdate(){updates.effect++;},logicAnimationUpdate(){updates.animation++;}}},GAME={hooks:{frame:[]},world:{registry:[object]}};
  const firstEnsure=makeEnsure();firstEnsure(GAME);firstEnsure(GAME);assert.equal(GAME.hooks.frame.length,1,'ordinary repeated apply is idempotent');
  const firstHook=GAME.hooks.frame[0],reloadedEnsure=makeEnsure();reloadedEnsure(GAME);
  assert.equal(GAME.hooks.frame.length,1,'a fresh module closure must replace the previous shared hook');assert.notEqual(GAME.hooks.frame[0],firstHook);
  GAME.hooks.frame[0](1/60);assert.deepEqual(updates,{effect:1,animation:1,warmup:1},'effects and animation mixers advance exactly once after reload');
});

test('nested far-origin pawns convert implicit local spawns once and keep skin, owner and body coincident', () => {
  const runtime=global.LK_RUNTIME_SKETCHBOOK_PAWNS,records=[];
  const registry={
    register(pawn){records.push(pawn);return pawn;},unregister(){},get(){return null;},list(){return records;},getByPlayerId(){return null;},
    claimPlayerSlot(pawn,id){pawn.playerId=id;pawn.possessed=true;return true;},releasePlayerSlot(){return true;},firstAvailablePlayerId(){return 1;},
  };
  const world=new CANNON.World(),GAME={pawns:registry,systems:{physics:{raw:{world}}},state:{},world:{registry:[]}};
  const levelRoot=new THREE.Group();levelRoot.position.set(83,7,-41);levelRoot.rotation.y=.37;levelRoot.scale.set(1.25,1,1.25);
  const localSpawns=[new THREE.Vector3(152,15,-92),new THREE.Vector3(-185,80,3)];
  const pawns=localSpawns.map((local,index)=>{
    const owner=new THREE.Group();owner.name='far-owner-'+index;owner.userData.logicInstanceId='far-character-'+index;owner.position.copy(local);
    const skinOrigin=new THREE.Group();skinOrigin.name='skin-origin';owner.add(skinOrigin);levelRoot.add(owner);levelRoot.updateMatrixWorld(true);
    const expected=owner.getWorldPosition(new THREE.Vector3()),pawn=runtime.createLogic(GAME,owner,{type:'advanced-character',playerId:null,possessed:false,spawn:{x:local.x,y:local.y,z:local.z,heading:0}},{});
    pawn.start();
    assert.ok(new THREE.Vector3(pawn.config.spawn.x,pawn.config.spawn.y,pawn.config.spawn.z).distanceTo(expected)<1e-6,
      'implicit local spawn must become one world-space body spawn at distance '+local.length());
    assert.ok(new THREE.Vector3(pawn.body.position.x,pawn.body.position.y-.5,pawn.body.position.z).distanceTo(expected)<1e-6);
    pawn.afterPhysics(1/60);
    assert.ok(owner.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-6, 'owner transform cannot apply the level parent twice');
    assert.ok(skinOrigin.getWorldPosition(new THREE.Vector3()).distanceTo(expected)<1e-6, 'skin origin must inherit the corrected owner transform exactly once');
    const delta=new THREE.Vector3(index?-.75:.75,0,index?.5:-.5);pawn.body.position.x+=delta.x;pawn.body.position.z+=delta.z;pawn.body.interpolatedPosition.copy(pawn.body.position);pawn.afterPhysics(1/60);
    const moved=expected.clone().add(delta);
    assert.ok(owner.getWorldPosition(new THREE.Vector3()).distanceTo(moved)<1e-6, 'visual owner must follow world-space physics without origin-dependent separation');
    assert.ok(skinOrigin.getWorldPosition(new THREE.Vector3()).distanceTo(moved)<1e-6, 'nested skin cannot receive the world displacement twice');
    return pawn;
  });
  pawns.forEach(pawn=>pawn.dispose());
});

test('Spawn.024 metadata ground remains coherent for 600 parented character frames in four directions', () => {
  const runtime=global.LK_RUNTIME_SKETCHBOOK_PAWNS,records=[];
  const registry={
    register(pawn){records.push(pawn);return pawn;},unregister(){},get(){return null;},list(){return records;},getByPlayerId(){return null;},
    claimPlayerSlot(pawn,id){pawn.playerId=id;pawn.possessed=true;return true;},releasePlayerSlot(pawn){pawn.playerId=null;pawn.possessed=false;return true;},firstAvailablePlayerId(){return 1;},
  };
  const world=new CANNON.World();world.gravity.set(0,-9.82,0);
  const camera={getWorldDirection(out){return out.set(0,0,1);}};
  const GAME={pawns:registry,systems:{physics:{raw:{world}}},state:{},world:{registry:[]},core:{camera}};
  const levelRoot=new THREE.Group();levelRoot.position.set(41,0,-27);levelRoot.rotation.y=.23;
  // Exact source Cube.082 metadata after the editor's -0.1075983047 bottom alignment.
  const collider=new THREE.Group();collider.name='Cube.082';collider.position.set(0,10.412163734436035-.1075983047,-46.788421630859375);collider.scale.set(29.622772216796875,4.3916168212890625,42.595462799072266);collider.userData={data:'physics',type:'box'};levelRoot.add(collider);
  const owner=new THREE.Group();owner.userData.logicInstanceId='spawn-024-600-frame';owner.position.set(-.101,14.696,-5.171);
  const skinOrigin=new THREE.Group();skinOrigin.name='boxman-skin-origin';owner.add(skinOrigin);levelRoot.add(owner);levelRoot.updateMatrixWorld(true);
  const physics=runtime.parseWorldPhysicsExtras(GAME,levelRoot);
  const pawn=runtime.createLogic(GAME,owner,{type:'advanced-character',playerId:1,possessed:true,spawn:{x:owner.position.x,y:owner.position.y,z:owner.position.z,heading:0}},{});pawn.start();
  const controls=[{throttle:.05,brake:0,steer:0},{throttle:0,brake:0,steer:.05},{throttle:0,brake:.05,steer:0},{throttle:0,brake:0,steer:-.05}];
  const metrics={bodyOwner:0,liveInterpolation:0,skinOwner:0,cameraTarget:0,visualStep:0};let previous=null;
  controls.forEach(control=>{
    pawn.setControl(Object.assign({sprint:false},control));
    for(let frame=0;frame<150;frame++){
      pawn.step(1/60);
      const ownerWorld=owner.getWorldPosition(new THREE.Vector3()),skinWorld=skinOrigin.getWorldPosition(new THREE.Vector3()),render=pawn.body.position,live=pawn.body.position;
      const renderRoot=new THREE.Vector3(render.x,live.y-.5,render.z),liveRoot=new THREE.Vector3(live.x,live.y-.5,live.z),cameraTarget=owner.getWorldPosition(new THREE.Vector3());
      metrics.bodyOwner=Math.max(metrics.bodyOwner,ownerWorld.distanceTo(renderRoot));metrics.liveInterpolation=Math.max(metrics.liveInterpolation,ownerWorld.distanceTo(liveRoot));
      metrics.skinOwner=Math.max(metrics.skinOwner,skinWorld.distanceTo(ownerWorld));metrics.cameraTarget=Math.max(metrics.cameraTarget,cameraTarget.distanceTo(renderRoot));
      if(previous)metrics.visualStep=Math.max(metrics.visualStep,ownerWorld.distanceTo(previous));previous=ownerWorld;
    }
  });
  assert.ok(metrics.bodyOwner<1e-6,'render/body divergence='+JSON.stringify(metrics));
  assert.ok(metrics.skinOwner<1e-6,'skin/owner divergence='+JSON.stringify(metrics));
  assert.ok(metrics.cameraTarget<1e-6,'camera target/body divergence='+JSON.stringify(metrics));
  assert.ok(metrics.liveInterpolation<.08,'physics interpolation lag must stay sub-frame, metrics='+JSON.stringify(metrics));
  assert.ok(metrics.visualStep<.08,'no one-frame teleport across cardinal motion, metrics='+JSON.stringify(metrics));
  assert.equal(pawn.state.grounded,true);pawn.dispose();physics.dispose();
});

test('parented car, airplane and helicopter wake and move in world space', () => {
  const runtime=global.LK_RUNTIME_SKETCHBOOK_PAWNS;
  ['car','airplane','helicopter'].forEach((type,index)=>{
    const records=[];
    const registry={register(p){records.push(p);return p;},unregister(){},get(){return null;},list(){return records;},getByPlayerId(){return null;},claimPlayerSlot(){return false;},releasePlayerSlot(){return true;},firstAvailablePlayerId(){return 1;}};
    const world=new CANNON.World();world.gravity.set(0,type==='car'?-9.82:0,0);const GAME={pawns:registry,systems:{physics:{raw:{world}}},state:{},world:{registry:[]}};
    const levelRoot=new THREE.Group();levelRoot.position.set(60,0,-35);levelRoot.rotation.y=.31;
    const owner=new THREE.Group();owner.userData.logicInstanceId='parented-moving-'+type;owner.position.set(100+index*35,type==='car'?0:8,-70-index*20);const visualOrigin=new THREE.Group();owner.add(visualOrigin);levelRoot.add(owner);levelRoot.updateMatrixWorld(true);
    const expected=owner.getWorldPosition(new THREE.Vector3());
    if(type==='car'){const ground=new CANNON.Body({mass:0});ground.addShape(new CANNON.Plane());ground.position.y=expected.y;ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);}
    const pawn=runtime.createLogic(GAME,owner,{type,playerId:null,possessed:false,spawn:{x:owner.position.x,y:owner.position.y,z:owner.position.z,heading:owner.rotation.y}},{});pawn.start();
    const start=pawn.body.position.clone();pawn.setControl(type==='helicopter'?{collective:1,throttle:1}:{throttle:1,brake:0,steer:0});
    for(let frame=0;frame<240;frame++)pawn.step(1/60);
    const displacement=pawn.body.position.distanceTo(start),ownerWorld=owner.getWorldPosition(new THREE.Vector3()),render=pawn.body.position,renderRoot=new THREE.Vector3(render.x,render.y-pawn.physicsOriginY,render.z);
    assert.ok(displacement>.1,type+' must not remain immobile after explicit control (displacement='+displacement+')');
    assert.equal(pawn.body.sleepState,CANNON.Body.AWAKE,type+' controlled body must stay awake');
    assert.ok(ownerWorld.distanceTo(renderRoot)<1e-6,type+' owner/body world transform diverged at a remote parented spawn');
    assert.ok(visualOrigin.getWorldPosition(new THREE.Vector3()).distanceTo(ownerWorld)<1e-6,type+' visual hierarchy received the world transform twice');
    pawn.dispose();
  });
});

test('a cold unoccupied helicopter settles its skids and sleeps without idle bounce', () => {
  const runtime=global.LK_RUNTIME_SKETCHBOOK_PAWNS,records=[];
  const registry={register(p){records.push(p);return p;},unregister(){},get(){return null;},list(){return records;},getByPlayerId(){return null;},claimPlayerSlot(){return false;},releasePlayerSlot(){return true;},firstAvailablePlayerId(){return 1;}};
  const world=new CANNON.World();world.gravity.set(0,-9.82,0);world.allowSleep=true;
  const ground=new CANNON.Body({mass:0});ground.addShape(new CANNON.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
  const GAME={pawns:registry,systems:{physics:{raw:{world}}},state:{},world:{registry:[]}},owner=new THREE.Group();owner.userData.logicInstanceId='parked-helicopter';
  const helicopter=runtime.createLogic(GAME,owner,{type:'helicopter',playerId:null,possessed:false,spawn:{x:0,y:3,z:0,heading:0}},{});helicopter.start();
  const tail=[];let airborneFrames=0;
  for(let frame=0;frame<240;frame++){helicopter.step(1/60);if(helicopter.body.sleepState===CANNON.Body.SLEEPING)tail.push(helicopter.body.position.y);else airborneFrames++;}
  assert.ok(airborneFrames>5,'an unsupported helicopter still falls instead of freezing at its authored transform');
  assert.equal(helicopter.body.sleepState,CANNON.Body.SLEEPING,'quiet skid contact parks the cold helicopter');
  assert.ok(Math.max(...tail)-Math.min(...tail)<1e-8,'the parked chassis cannot keep rocking on contact impulses');
  helicopter.setControl({collective:1,throttle:1});
  assert.equal(helicopter.body.sleepState,CANNON.Body.AWAKE,'taking control wakes the parked helicopter immediately');
  helicopter.dispose();
});

test('a piloted helicopter stays planted after a neutral landing without blocking takeoff', () => {
  const runtime=global.LK_RUNTIME_SKETCHBOOK_PAWNS,records=[];
  const registry={register(p){records.push(p);return p;},unregister(){},get(){return null;},list(){return records;},getByPlayerId(){return null;},claimPlayerSlot(){return false;},releasePlayerSlot(){return true;},firstAvailablePlayerId(){return 1;}};
  const world=new CANNON.World();world.gravity.set(0,-9.82,0);world.allowSleep=true;
  const ground=new CANNON.Body({mass:0});ground.addShape(new CANNON.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
  const GAME={pawns:registry,systems:{physics:{raw:{world}}},state:{},world:{registry:[]}},owner=new THREE.Group();owner.userData.logicInstanceId='piloted-landing-helicopter';
  const helicopter=runtime.createLogic(GAME,owner,{type:'helicopter',playerId:null,possessed:false,spawn:{x:0,y:3,z:0,heading:0}},{});helicopter.start();
  helicopter.setControl({collective:0,throttle:0,brake:0,roll:0,pitch:0,yaw:0});
  const tail=[];for(let frame=0;frame<420;frame++){helicopter.step(1/60);if(frame>=300)tail.push(helicopter.body.position.y);}
  assert.equal(helicopter.state.airborne,false,'neutral skid contact is reported as grounded while piloted');
  assert.ok(Math.max(...tail)-Math.min(...tail)<.01,'a spooled rotor cannot repeatedly relaunch the landed chassis');
  const landedY=helicopter.body.position.y;helicopter.setControl({collective:1,throttle:1,brake:0,roll:0,pitch:0,yaw:0});
  for(let frame=0;frame<90;frame++)helicopter.step(1/60);
  assert.ok(helicopter.body.position.y>landedY+.25,'positive collective releases landing stabilization and takes off');
  helicopter.dispose();
});

test('asset hydration origin transition preserves vehicle root and wheel contact height', () => {
  const runtime=global.LK_RUNTIME_SKETCHBOOK_PAWNS,records=[];
  const registry={register(p){records.push(p);return p;},unregister(){},get(){return null;},list(){return records;},getByPlayerId(){return null;},claimPlayerSlot(){return false;},releasePlayerSlot(){return true;},firstAvailablePlayerId(){return 1;}};
  const world=new CANNON.World(),GAME={pawns:registry,systems:{physics:{raw:{world}}},state:{},world:{registry:[]}},owner=new THREE.Group();owner.userData.logicInstanceId='hydration-origin-car';
  const car=runtime.createLogic(GAME,owner,{type:'car',playerId:null,possessed:false,spawn:{x:0,y:0,z:0}},{});car.start();
  assert.equal(car.physicsOriginY,.62);const visualBefore=car.body.position.y-car.physicsOriginY;
  const metadataCollider=new THREE.Group();metadataCollider.userData={data:'collision',shape:'box'};metadataCollider.scale.set(.7,.3,1.4);owner.add(metadataCollider);car.parts.colliders.push(metadataCollider);
  assert.equal(car.rebuildPhysics(),true);assert.equal(car.physicsOriginY,0);
  assert.ok(Math.abs((car.body.position.y-car.physicsOriginY)-visualBefore)<1e-9,'hydration cannot lift the rendered chassis by the fallback bodyY');
  car.afterPhysics(1/60);assert.ok(Math.abs(owner.position.y-visualBefore)<1e-9);car.dispose();
});

test('world extras materialize physics plus read-only path/scenario/spawn registries', () => {
  const world = new CANNON.World();
  const GAME = {systems:{physics:{raw:{world}}}};
  const rootNode = new THREE.Group(); rootNode.name = 'world-root';
  const collider = new THREE.Group(); collider.name = 'ground-box'; collider.scale.set(2, .5, 3); collider.userData = {data:'physics', type:'box'};
  const pathNode = new THREE.Group(); pathNode.name = 'route'; pathNode.userData = {data:'path', name:'route'};
  const waypoint = new THREE.Group(); waypoint.name = 'route_0'; waypoint.userData = {data:'pathNode', nextNode:'route_0', previousNode:'route_0'}; pathNode.add(waypoint);
  const scenario = new THREE.Group(); scenario.name = 'free-roam'; scenario.userData = {data:'scenario', name:'Free roam', default:'true'};
  const spawn = new THREE.Group(); spawn.name = 'Spawn.001'; spawn.userData = {data:'spawn', type:'player'}; scenario.add(spawn);
  rootNode.add(collider, pathNode, scenario);

  const runtime = global.LK_RUNTIME_SKETCHBOOK_PAWNS;
  const physics = runtime.parseWorldPhysicsExtras(GAME, rootNode);
  assert.equal(physics.supported, true);
  assert.equal(physics.bodies.length, 1);
  assert.equal(world.bodies.includes(physics.bodies[0]), true);
  const metadata = runtime.parseWorldMetadata(GAME, rootNode, 'mock-world');
  assert.equal(metadata.paths.length, 1);
  assert.equal(metadata.paths[0].nodes.length, 1);
  assert.equal(metadata.scenarios[0].spawnIds[0], 'Spawn.001');
  assert.equal(metadata.spawns[0].type, 'player');
  assert.equal(Object.isFrozen(metadata.scenarios), true);
  metadata.dispose(); physics.dispose();
  assert.equal(world.bodies.includes(physics.bodies[0]), false);
  assert.deepEqual(runtime.metadataRegistry(GAME).stats(), {sources:0, paths:0, scenarios:0, spawns:0});

  const lateWorld = new CANNON.World();
  const lateGame = {systems:{}, world:{registry:[rootNode]}};
  rootNode.userData.addedEntry = {id:'late-world', physicsBackend:'sketchbook-metadata', metadataMode:'gltf-extras'};
  const lateCoordinator = runtime.createCoordinator(lateGame);
  let lateRecord = lateCoordinator.refreshWorldPhysicsExtras(true).get('late-world');
  assert.equal(lateRecord.physics.supported, false, 'metadata may register before the native physics world exists');
  lateGame.systems.physics = {raw:{world:lateWorld}};
  lateRecord = lateCoordinator.refreshWorldPhysicsExtras(false).get('late-world');
  assert.equal(lateRecord.physics.supported, true, 'a late physics world must trigger reparsing without replacing the scene node');
  assert.equal(lateRecord.physics.bodies.length, 1);
  assert.equal(lateWorld.bodies.includes(lateRecord.physics.bodies[0]), true);
  lateGame.world.registry.length = 0;
  lateCoordinator.refreshWorldPhysicsExtras(false);
  assert.equal(lateWorld.bodies.length, 0, 'unregistering a metadata source disposes its static bodies');
});

test('advanced character finds ordinary Cannon ground, runs and owns a stable orbit handoff', () => {
  const runtime = global.LK_RUNTIME_SKETCHBOOK_PAWNS;
  assert.equal(runtime.normalizeConfig({type:'advanced-character', template:true, cameraDefaultVersion:0, camera:{mode:'arcade'}}).camera.mode, 'free',
    'old bundled characters migrate away from the vehicle chase-camera feedback loop');
  assert.equal(runtime.normalizeConfig({type:'advanced-character', template:true, cameraDefaultVersion:1, camera:{mode:'arcade'}}).camera.mode, 'arcade',
    'an author can still explicitly choose Arcade on the corrected adapter');

  const records = [];
  const registry = {
    register(pawn){ records.push(pawn); return pawn; }, unregister(){}, get(){ return null; }, list(){ return records; },
    getByPlayerId(){ return null; }, firstAvailablePlayerId(){ return 1; },
    claimPlayerSlot(pawn, playerId){ pawn.playerId=playerId; pawn.possessed=true; return true; },
    releasePlayerSlot(pawn){ pawn.playerId=null; pawn.possessed=false; return true; },
  };
  const world = new CANNON.World(); world.gravity.set(0, -9.82, 0);
  const ground = new CANNON.Body({mass:0});
  ground.addShape(new CANNON.Box(new CANNON.Vec3(10, .1, 10))); ground.position.y=-.1; world.addBody(ground);
  assert.equal(ground.collisionFilterMask, 1, 'regression harness uses Cannon default filters');
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 3, -5); camera.lookAt(0, 0, 0);
  const GAME = {
    pawns:registry, systems:{physics:{raw:{world}}}, state:{}, world:{registry:[]}, core:{camera},
    input:{ensurePlayerSlot(){}, player(){ return {drive(){ return {steer:0, throttle:1, brake:0, sprint:false}; }, device(){ return 'keyboard-1'; }, deviceType(){ return 'keyboard'; }}; }},
  };
  const owner = new THREE.Group(); owner.userData.logicInstanceId='grounded-character';
  const played = [], previousStore = global.LK_STORE;
  global.LK_STORE = {playLogicElementAnimation(target, clip){ played.push(clip); return {}; }};
  try {
    const pawn = runtime.createLogic(GAME, owner, {type:'advanced-character', playerId:1, possessed:true, spawn:{x:0,y:0,z:0}}, {});
    pawn.start(); pawn.beforePhysics(1/60); pawn.afterPhysics(1/60);
    assert.equal(pawn.body.allowSleep, false, 'the velocity-driven character capsule must remain awake like upstream Sketchbook');
    assert.equal(pawn.physicsOriginY, .5, 'the .5-high capsule plus .25 end spheres places its bottom exactly at the authored spawn');
    const capsuleBottom=Math.min(...pawn.body.shapeOffsets.map((offset,index)=>offset.y-pawn.body.shapes[index].radius));
    assert.equal(capsuleBottom, -.5, 'the character collider is centered around its physics origin without a second owner offset');
    assert.equal(pawn.state.grounded, true);
    // A standing start plays the source's start step first, then settles into
    // the run cycle. Five flat states (idle/walk/sprint/jump/fall) is what made
    // the character read as stiff; boxman.glb ships all of these clips.
    assert.equal(pawn.state.locomotion, 'start_forward', 'moving off from a standstill plays a start step');
    assert.equal(played.at(-1), 'start_forward');
    for(let frame=0;frame<40;frame++){ pawn.beforePhysics(1/60); pawn.afterPhysics(1/60); }
    assert.equal(pawn.state.locomotion, 'walk', 'the start step resolves into the run cycle');
    assert.equal(played.at(-1), 'run', 'ground locomotion selects the authored run clip instead of falling');

    pawn.setControl({steer:0, throttle:0, brake:0, sprint:false});
    const restingY=[];
    for(let frame=0;frame<90;frame++){
      pawn.step(1/60);
      if(frame>=15)restingY.push(owner.position.y);
    }
    const restingRange=Math.max(...restingY)-Math.min(...restingY);
    assert.ok(restingRange<1e-6, 'the grounded owner/camera target must not bounce at rest (vertical range='+restingRange+')');
    assert.ok(Math.abs(owner.position.y-.07)<1e-6, 'Sketchbook ray length keeps the visual root at the authored .07 ground clearance (y='+owner.position.y+')');

    pawn.setControl({steer:0, throttle:1, brake:0, sprint:false});
    const startPosition=pawn.body.position.clone();
    const walkingY=[],walkingPositions=[];
    for(let frame=0;frame<120;frame++){
      pawn.step(1/60);walkingY.push(owner.position.y);walkingPositions.push(owner.position.clone());
    }
    const movedDistance=pawn.body.position.distanceTo(startPosition);
    assert.ok(movedDistance>1, 'movement input must translate the physics capsule, not animate in place (distance='+movedDistance+', from='+startPosition.toString()+', to='+pawn.body.position.toString()+', velocity='+pawn.body.velocity.toString()+')');
    const walkingRange=Math.max(...walkingY)-Math.min(...walkingY);
    const largestVisualStep=walkingPositions.slice(1).reduce((largest,position,index)=>Math.max(largest,position.distanceTo(walkingPositions[index])),0);
    assert.ok(walkingRange<1e-6, 'walking on a flat world collider cannot reintroduce vertical flicker/camera bounce (range='+walkingRange+')');
    assert.ok(largestVisualStep<.2, 'interpolated walking cannot produce a visible one-frame teleport (largest step='+largestVisualStep+')');
    pawn.body.interpolatedPosition.set(pawn.body.position.x+12,pawn.body.position.y,pawn.body.position.z-9);
    pawn.afterPhysics(1/60);
    assert.ok(Math.abs(owner.position.x-pawn.body.position.x)<1e-6&&Math.abs(owner.position.z-pawn.body.position.z)<1e-6,
      'Cannon 0.6 extrapolation cannot pull the character owner/camera away from the authoritative body');
    const beforeMissY=owner.position.y;
    world.removeBody(ground);pawn.beforePhysics(1/60);
    assert.equal(pawn.state.locomotion, 'walk', 'one missed ground ray cannot alternate the rig between run and falling');
    world.step(1/60,1/60,3);pawn.afterPhysics(1/60);
    assert.ok(Math.abs(owner.position.y-beforeMissY)<1e-6, 'one collider seam/missed ray cannot pulse the owner or its camera target');
    world.addBody(ground);
    pawn.setControl({steer:0, throttle:0, brake:0, jump:true});pawn.step(1/60);
    assert.equal(pawn.state.grounded, false, 'the post-step ground constraint releases immediately for a jump');
    assert.ok(pawn.body.velocity.y>0, 'jump velocity cannot be flattened by the ground grace window');
    assert.equal(pawn.cameraSnapRequested, true, 'character possession requests one clean camera handoff');
    pawn.dispose();
  } finally { global.LK_STORE = previousStore; }
  const cameraSource = source('js/lot-king.js');
  assert.ok(cameraSource.includes("return updateAdvancedCharacterCameraOverride(dt, pawn, logicPawnCameraPosition)"),
    'the on-foot Pawn must bypass the native vehicle-camera state machine');
  const dedicatedCamera=cameraSource.slice(cameraSource.indexOf('function updateAdvancedCharacterCameraOverride'),cameraSource.indexOf('// A first-person Pawn owns'));
  assert.ok(dedicatedCamera.length>0);
  assert.doesNotMatch(dedicatedCamera,/\bupdateCamera\s*\(/, 'the dedicated character orbit must not recurse into the native vehicle camera');
});

test('vehicle seat metadata supports atomic passenger, driver switch and safe exit', () => {
  const records = new Map();
  const registry = {
    register(pawn){ records.set(pawn.id, pawn); return pawn; },
    unregister(pawn){ records.delete(pawn.id); return true; },
    get(id){ return records.get(id) || null; },
    list(){ return Array.from(records.values()); },
    getByPlayerId(playerId){ return this.list().find(pawn => pawn.possessed && pawn.playerId === playerId) || null; },
    firstAvailablePlayerId(){ return 1; },
    claimPlayerSlot(pawn, playerId, force){
      const current = this.getByPlayerId(playerId);
      if(current && current !== pawn){ if(!force) return false; current.playerId = null; current.possessed = false; }
      pawn.playerId = playerId; pawn.possessed = true; return true;
    },
    releasePlayerSlot(pawn){ pawn.playerId = null; pawn.possessed = false; return true; },
  };
  const world = new CANNON.World();
  world.gravity.set(0, -9.82, 0);
  const GAME = {pawns:registry, systems:{physics:{raw:{world}}}, state:{}, world:{registry:[]}};
  const characterOwner = new THREE.Group();
  characterOwner.userData.logicInstanceId = 'seat-test-character';
  const vehicleOwner = new THREE.Group();
  vehicleOwner.userData.logicInstanceId = 'seat-test-car';
  const driver = new THREE.Group(); driver.name = 'seat_driver'; driver.position.set(-.35, .5, .1);
  driver.userData = {data:'seat', seat_type:'driver', connected_seats:'seat_passenger', entry_points:'entry_driver', door_object:'door_driver'};
  const passenger = new THREE.Group(); passenger.name = 'seat_passenger'; passenger.position.set(.35, .5, .1);
  passenger.userData = {data:'seat', seat_type:'passenger', connected_seats:'seat_driver', entry_points:'entry_passenger', door_object:'door_passenger'};
  const entryDriver = new THREE.Group(); entryDriver.name = 'entry_driver'; entryDriver.position.set(-1.1, 0, .1);
  const entryPassenger = new THREE.Group(); entryPassenger.name = 'entry_passenger'; entryPassenger.position.set(1.1, 0, .1);
  const doorDriver = new THREE.Group(); doorDriver.name = 'door_driver'; doorDriver.position.set(-.8, .45, .1);
  const doorPassenger = new THREE.Group(); doorPassenger.name = 'door_passenger'; doorPassenger.position.set(.8, .45, .1);
  vehicleOwner.add(driver, passenger, entryDriver, entryPassenger, doorDriver, doorPassenger);

  const runtime = global.LK_RUNTIME_SKETCHBOOK_PAWNS;
  const character = runtime.createLogic(GAME, characterOwner, {type:'advanced-character', playerId:1, possessed:true, spawn:{x:0,y:1,z:0}}, {});
  const car = runtime.createLogic(GAME, vehicleOwner, {type:'car', playerId:null, possessed:false, spawn:{x:1,y:1,z:0}, interaction:{doorAnimations:true}}, {});
  character.start(); car.start();
  assert.equal(car.physicsOriginY,.62, 'a primitive Sketchbook fallback retains its authored bodyY');
  assert.ok(car.vehicle.wheelInfos.every(wheel => wheel.radius === .25), 'null wheel radius inherits the authored Sketchbook suspension radius');
  car.body.sleep();
  car.setControl({throttle:1});
  assert.equal(car.body.allowSleep, false, 'an explicitly controlled vehicle cannot stay parked asleep');
  assert.equal(car.body.sleepState, CANNON.Body.AWAKE, 'control wakes the sleeping chassis before force is applied');
  car.beforePhysics(1/60);
  assert.ok(car.vehicle.wheelInfos.every(wheel => wheel.engineForce === -500), 'source engineForce is applied per driven wheel');
  car.state.gear = 2;
  car.body.velocity.set(0, 0, 5);
  car.beforePhysics(1/60);
  assert.ok(car.vehicle.wheelInfos.every(wheel => wheel.engineForce === -250), 'source transmission applies engineForce / gear inside each speed band');
  car.setControl({throttle:0, brake:1, steer:0});
  car.beforePhysics(1/60);
  assert.ok(car.vehicle.wheelInfos.every(wheel => wheel.brake === 14500), 'the exposed service brake is distinct from reverse and the rear handbrake');
  car.state.gear = 1;
  car.body.velocity.set(0, 0, 0);
  car.clearControl();
  assert.equal(car.parts.seats.length, 2);
  assert.equal(character.enterVehicle(car, 'passenger'), true);
  assert.equal(character.possessed, true, 'a passenger keeps the player slot and camera');
  assert.equal(car.possessed, false);
  assert.equal(character.occupyingSeat.type, 'passenger');
  assert.equal(character.bodyInWorld, false);
  assert.equal(GAME.state.runtimeVehicleCameraPawnId, character.id);
  assert.equal(character.rebuildPhysics(), true);
  assert.equal(character.bodyInWorld, false, 'rebuilding a seated character must not put its capsule back into the world');
  assert.equal(world.bodies.includes(character.body), false);
  car.afterPhysics(.1);
  assert.notEqual(doorPassenger.rotation.y, 0, 'the GLB-linked passenger door animates');

  character.entryCooldown = car.entryCooldown = 0;
  car.body.sleep();
  assert.equal(character.switchSeat(), true);
  assert.equal(character.occupyingSeat.type, 'driver');
  assert.equal(car.driverPawn, character);
  assert.equal(car.possessed, true);
  assert.equal(car.body.allowSleep, false, 'entering the driver seat keeps the active vehicle awake like upstream Sketchbook');
  assert.equal(car.body.sleepState, CANNON.Body.AWAKE, 'driver possession wakes a previously parked chassis');
  assert.equal(character.possessed, false);
  assert.equal(GAME.state.runtimeVehicleCameraPawnId, car.id);
  character.entryCooldown = car.entryCooldown = 0;
  assert.equal(car.exitDriver(true), true);
  assert.equal(character.inVehicle, null);
  assert.equal(car.driverPawn, null);
  assert.equal(character.possessed, true);
  assert.equal(character.bodyInWorld, true);
  assert.equal(GAME.state.runtimeVehicleCameraPawnId, character.id);
  car.beforePhysics(1/60);
  assert.equal(car.body.allowSleep, true, 'an unoccupied parked vehicle may sleep again after exit');
  assert.equal(driver.userData.data, 'seat', 'source GLB metadata remains untouched');

  const wall = new CANNON.Body({mass:0});
  wall.addShape(new CANNON.Box(new CANNON.Vec3(.5, .75, .5)));
  wall.position.set(-1.1, .75, .1);
  world.addBody(wall);
  character.config.entry.radius = .5;
  car.config.entry.radius = 5;
  car.config.entry.cooldown = 1.25;
  character.body.position.set(4, .5, 0);
  character.entryCooldown = car.entryCooldown = 0;
  character.config.entry.choreography.enabled = false;
  assert.equal(character.tryEnterNearestVehicle('driver'), true, 'the editable vehicle radius participates in entry selection');
  assert.equal(character.entryCooldown, 1.25, 'the selected vehicle owns its interaction cooldown');
  character.entryCooldown = car.entryCooldown = 0;
  assert.equal(car.exitDriver(true), true);
  assert.ok(Math.abs(character.body.position.x + 1.1) > .5, 'safe exit rejects the authored door point when a static wall occupies it');
  world.removeBody(wall);

  character.entryCooldown = car.entryCooldown = 0;
  car.config.entry.enabled = false;
  assert.equal(character.tryEnterNearestVehicle('driver'), false, 'a vehicle can disable entry from its editable contract');
  character.dispose(); car.dispose();
});

test('editable entry choreography reserves the seat, walks to its door, and completes without matching clips', () => {
  const runtime=global.LK_RUNTIME_SKETCHBOOK_PAWNS,records=[];
  const registry={
    register(pawn){records.push(pawn);return pawn;},unregister(){},get(){return null;},list(){return records;},
    getByPlayerId(id){return records.find(pawn=>pawn.possessed&&pawn.playerId===id)||null;},firstAvailablePlayerId(){return 1;},
    claimPlayerSlot(pawn,id,force){const current=this.getByPlayerId(id);if(current&&current!==pawn){if(!force)return false;current.playerId=null;current.possessed=false;}pawn.playerId=id;pawn.possessed=true;return true;},
    releasePlayerSlot(pawn){pawn.playerId=null;pawn.possessed=false;return true;},
  };
  const world=new CANNON.World();world.gravity.set(0,-9.82,0);const ground=new CANNON.Body({mass:0});ground.addShape(new CANNON.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
  const GAME={pawns:registry,systems:{physics:{raw:{world}}},state:{},world:{registry:[]}},characterOwner=new THREE.Group(),carOwner=new THREE.Group();
  characterOwner.userData.logicInstanceId='choreography-character';carOwner.userData.logicInstanceId='choreography-car';
  const seat=new THREE.Group();seat.name='driver_seat';seat.position.set(0,.5,0);seat.userData={data:'seat',seat_type:'driver',entry_points:'driver_entry',door_object:'driver_door'};
  const entry=new THREE.Group();entry.name='driver_entry';entry.position.set(-1,0,0);const door=new THREE.Group();door.name='driver_door';door.position.set(-.7,.5,0);carOwner.add(seat,entry,door);
  const character=runtime.createLogic(GAME,characterOwner,{type:'advanced-character',playerId:1,possessed:true,spawn:{x:-2,y:0,z:0},entry:{cooldown:.1,choreography:{enabled:true,approachSpeed:5,stopDistance:.12,approachTimeout:2,enterDuration:.1,exitDuration:.1},animations:{driverEnterLeft:'missing_custom_enter',driverExitLeft:'missing_custom_exit'}}},{});
  const car=runtime.createLogic(GAME,carOwner,{type:'car',playerId:null,possessed:false,spawn:{x:0,y:0,z:0},entry:{radius:4,cooldown:.1}},{});character.start();car.start();
  const oldStore=global.LK_STORE,attempted=[];global.LK_STORE={playLogicElementAnimation(owner,clip){attempted.push(clip);return null;}};
  assert.equal(character.tryEnterNearestVehicle('driver'),true);assert.equal(character.inVehicle,undefined);assert.equal(car.parts.seats[0].reservedBy,character,'reservation is atomic during the walk');
  for(let frame=0;frame<240&&!character.inVehicle;frame++){character.beforePhysics(1/60);world.step(1/60);character.afterPhysics(1/60);car.afterPhysics(1/60);}
  assert.equal(character.inVehicle,car,'procedural interpolation completes even when the authored clip is absent');assert.equal(car.parts.seats[0].reservedBy,null);assert.ok(attempted.includes('missing_custom_enter'));
  character.entryCooldown=car.entryCooldown=0;assert.equal(car.requestExit(),true);assert.equal(character.entryTransition.phase,'exit');assert.equal(characterOwner.visible,true,'the full body becomes visible for the exit transition');
  for(let frame=0;frame<60&&character.inVehicle;frame++){character.beforePhysics(1/60);world.step(1/60);character.afterPhysics(1/60);car.afterPhysics(1/60);}
  assert.equal(character.inVehicle,null);assert.equal(character.bodyInWorld,true);assert.ok(attempted.includes('missing_custom_exit'));assert.equal(registry.getByPlayerId(1),character);
  global.LK_STORE=oldStore;character.dispose();car.dispose();
});

test('driver entry transfers one controller, moves the car, then restores the character atomically', () => {
  const runtime=global.LK_RUNTIME_SKETCHBOOK_PAWNS,records=new Map();
  const registry={
    register(p){records.set(p.id,p);return p;},unregister(p){records.delete(p.id);},get(id){return records.get(id)||null;},list(){return Array.from(records.values());},
    getByPlayerId(id){return this.list().find(p=>p.possessed&&p.playerId===id)||null;},firstAvailablePlayerId(){return 1;},
    claimPlayerSlot(pawn,id,force){const current=this.getByPlayerId(id);if(current&&current!==pawn){if(!force)return false;current.playerId=null;current.possessed=false;}pawn.playerId=id;pawn.possessed=true;return true;},
    releasePlayerSlot(pawn){pawn.playerId=null;pawn.possessed=false;return true;},
  };
  const world=new CANNON.World();world.gravity.set(0,-9.82,0);const ground=new CANNON.Body({mass:0});ground.addShape(new CANNON.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
  const GAME={pawns:registry,systems:{physics:{raw:{world}}},state:{},world:{registry:[]}},characterOwner=new THREE.Group(),carOwner=new THREE.Group();characterOwner.userData.logicInstanceId='moving-driver';carOwner.userData.logicInstanceId='entered-moving-car';
  const character=runtime.createLogic(GAME,characterOwner,{type:'advanced-character',playerId:1,possessed:true,spawn:{x:1,y:0,z:0}},{}),car=runtime.createLogic(GAME,carOwner,{type:'car',playerId:null,possessed:false,spawn:{x:0,y:0,z:0}},{});character.start();car.start();
  assert.equal(character.enterVehicle(car,'driver'),true);assert.equal(registry.getByPlayerId(1),car);assert.equal(character.bodyInWorld,false);assert.equal(car.driverPawn,character);
  const start=car.body.position.clone();car.setControl({throttle:1,brake:0,steer:0});
  for(let frame=0;frame<300;frame++){character.step(1/60);car.step(1/60);}
  assert.ok(car.body.position.distanceTo(start)>.25,'entered driver must move the RaycastVehicle instead of leaving it inert');
  assert.equal(GAME.state.runtimeVehicleCameraPawnId,car.id,'the vehicle is the sole camera authority while driving');
  character.entryCooldown=car.entryCooldown=0;assert.equal(car.exitDriver(true),true);
  assert.equal(registry.getByPlayerId(1),character);assert.equal(character.bodyInWorld,true);assert.equal(characterOwner.visible,true);assert.equal(car.driverPawn,null);
  const exitOwner=characterOwner.getWorldPosition(new THREE.Vector3()),exitBodyRoot=new THREE.Vector3(character.body.position.x,character.body.position.y-.5,character.body.position.z);
  assert.ok(exitOwner.distanceTo(exitBodyRoot)<1e-6,'exit must publish the restored capsule pose before making the character visible');
  assert.equal(character.groundSupport,null,'exit cannot retain the pre-entry ground support');assert.equal(character.groundGrace,0);
  assert.equal(GAME.state.runtimeVehicleCameraPawnId,character.id,'camera ownership returns atomically to the visible character');
  character.dispose();car.dispose();
});

test('bottom-aligned vehicle metadata keeps chassis and RaycastVehicle wheels in one frame', () => {
  const records=[];
  const registry={
    register(pawn){records.push(pawn);return pawn;},unregister(){},get(){return null;},list(){return records;},getByPlayerId(){return null;},
    claimPlayerSlot(){return false;},releasePlayerSlot(){return true;},firstAvailablePlayerId(){return 1;},
  };
  const world=new CANNON.World();world.gravity.set(0,-9.82,0);
  const ground=new CANNON.Body({mass:0});ground.addShape(new CANNON.Plane());ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
  const GAME={pawns:registry,systems:{physics:{raw:{world}}},state:{},world:{registry:[]}};
  const owner=new THREE.Group();owner.userData.logicInstanceId='metadata-frame-car';
  const collider=new THREE.Group();collider.userData={data:'collision',shape:'box'};collider.position.set(0,.4,0);collider.scale.set(.6,.25,1.2);owner.add(collider);
  [[-.5,.25,.8],[.5,.25,.8],[-.5,.25,-.8],[.5,.25,-.8]].forEach((position,index)=>{
    const wheel=new THREE.Group();wheel.name='metadata-wheel-'+index;wheel.userData={data:'wheel'};wheel.position.fromArray(position);owner.add(wheel);
  });
  const car=global.LK_RUNTIME_SKETCHBOOK_PAWNS.createLogic(GAME,owner,{type:'car',playerId:null,possessed:false,spawn:{x:0,y:0,z:0}},{});
  car.start();
  assert.equal(car.physicsOriginY,0, 'bottom-aligned metadata must not receive the primitive bodyY offset');
  assert.equal(car.body.position.y,0);
  assert.ok(car.vehicle.wheelInfos.every(wheel => wheel.radius===.25));
  for(let frame=0;frame<180;frame++){world.step(1/60);car.afterPhysics(1/60);}
  // Poison Cannon's extrapolated pose. The runtime must ignore it: 0.6 can
  // overshoot after a long frame and its dynamic interpolated quaternion is stale.
  car.body.interpolatedPosition.copy(car.body.position);car.body.interpolatedPosition.y-=.125;car.afterPhysics(1/60);
  assert.ok(Math.abs(owner.position.y-car.body.position.y)<1e-6, 'rendered chassis must stay on the authoritative metadata physics origin');
  assert.ok(Math.abs(owner.position.y-car.body.interpolatedPosition.y)>.1, 'stale Cannon extrapolation must not move the chassis');
  const currentBodyPosition=new THREE.Vector3(car.body.position.x,car.body.position.y,car.body.position.z),renderBodyPosition=currentBodyPosition.clone(),currentBodyRotation=new THREE.Quaternion(car.body.quaternion.x,car.body.quaternion.y,car.body.quaternion.z,car.body.quaternion.w),renderBodyRotation=currentBodyRotation.clone();
  car.parts.wheels.forEach((wheel,index)=>{
    const visualLocal=wheel.getWorldPosition(new THREE.Vector3()).sub(renderBodyPosition).applyQuaternion(renderBodyRotation.clone().invert()),physics=car.vehicle.wheelInfos[index].worldTransform.position,physicsLocal=new THREE.Vector3(physics.x,physics.y,physics.z).sub(currentBodyPosition).applyQuaternion(currentBodyRotation.clone().invert());
    assert.ok(visualLocal.distanceTo(physicsLocal)<1e-6, 'wheel visual and chassis must use the same authoritative physics frame');
  });
  car.reset();assert.equal(car.body.position.y,0, 'reset preserves the metadata physics origin');
  car.dispose();
});

test('airplane and helicopter consume their source keyboard bindings', () => {
  function createHarness(type, possessed){
    const records = new Map();
    const pressed = new Set();
    const mapped = {};
    const registry = {
      register(pawn){ records.set(pawn.id, pawn); return pawn; }, unregister(pawn){ records.delete(pawn.id); },
      get(id){ return records.get(id) || null; }, list(){ return Array.from(records.values()); },
      getByPlayerId(playerId){ return this.list().find(pawn => pawn.possessed && pawn.playerId === playerId) || null; },
      claimPlayerSlot(pawn, playerId){ pawn.playerId = playerId; pawn.possessed = true; return true; },
      releasePlayerSlot(pawn){ pawn.playerId = null; pawn.possessed = false; return true; }, firstAvailablePlayerId(){ return 1; },
    };
    const world = new CANNON.World(); world.gravity.set(0, -9.82, 0);
    const GAME = {
      pawns:registry, systems:{physics:{raw:{world}}}, state:{}, world:{registry:[]},
      input:{ensurePlayerSlot(){}, liveKeyboardDown:code => pressed.has(code), player(){ return {deviceType:() => 'keyboard', device:() => 'keyboard', drive:() => Object.assign({wheelBrake:pressed.has('KeyK'),radioPrev:pressed.has('KeyB')},mapped)}; }},
    };
    const owner = new THREE.Group(); owner.userData.logicInstanceId = 'binding-test-' + type;
    const pawn = global.LK_RUNTIME_SKETCHBOOK_PAWNS.createLogic(GAME, owner, {type, playerId:1, possessed:possessed !== false, spawn:{x:0,y:2,z:0}}, {});
    pawn.start(); return {pawn, pressed, mapped};
  }
  const parkedAirplane = createHarness('airplane');
  parkedAirplane.pawn.vehicle.wheelInfos.forEach(wheel => { wheel.isInContact = true; });
  parkedAirplane.pawn.beforePhysics(1/60);
  assert.equal(parkedAirplane.pawn.body.force.length(), 0, 'an occupied airplane has no idle thrust while parked on its wheels');
  parkedAirplane.pawn.dispose();

  const airplane = createHarness('airplane');
  ['ShiftLeft','KeyS','KeyD','KeyE','KeyB'].forEach(code => airplane.pressed.add(code));
  airplane.pawn.body.velocity.z = 12;
  airplane.pawn.beforePhysics(1/60);
  assert.equal(airplane.pawn.state.throttle, 1);
  assert.equal(airplane.pawn.state.pitch, 1);
  assert.equal(airplane.pawn.state.roll, 1);
  assert.equal(airplane.pawn.state.yaw, 1);
  assert.ok(airplane.pawn.body.angularVelocity.x < 0, 'S applies the source pitch-up angular velocity');
  assert.ok(airplane.pawn.body.angularVelocity.y < 0, 'E applies the source yaw-right angular velocity');
  assert.ok(airplane.pawn.body.angularVelocity.z > 0, 'D applies the source roll-right angular velocity');
  assert.ok(airplane.pawn.body.mass < 50 && airplane.pawn.body.mass >= 20, 'source flight speed dynamically reduces mass from 50 toward 20');
  assert.ok(airplane.pawn.vehicle.wheelInfos.every(wheel => wheel.brake === 0), 'B/Radio Previous must not apply aircraft wheel brakes');
  airplane.pressed.delete('KeyB');airplane.pressed.add('KeyK');airplane.pawn.beforePhysics(1/60);
  assert.ok(airplane.pawn.vehicle.wheelInfos.every(wheel => wheel.brake === 100), 'mapped Vehicle Wheel Brake must apply the authored brake force');
  airplane.pressed.delete('KeyK');airplane.mapped.cameraMode=true;airplane.pawn.beforePhysics(1/60);
  assert.ok(airplane.pawn.vehicle.wheelInfos.every(wheel => wheel.brake === 0), 'R3/Camera Mode must not double as aircraft wheel brakes');
  airplane.pawn.dispose();

  const helicopter = createHarness('helicopter');
  ['ShiftLeft','KeyS','KeyD','KeyE'].forEach(code => helicopter.pressed.add(code));
  helicopter.pawn.beforePhysics(1/60);
  assert.equal(helicopter.pawn.state.throttle, 1);
  assert.equal(helicopter.pawn.state.pitch, 1);
  assert.equal(helicopter.pawn.state.roll, 1);
  assert.equal(helicopter.pawn.state.yaw, 1);
  assert.ok(helicopter.pawn.body.angularVelocity.x < 0, 'S applies the source helicopter pitch-up angular velocity');
  assert.ok(helicopter.pawn.body.angularVelocity.y < 0, 'E applies the source helicopter yaw-right angular velocity');
  assert.ok(helicopter.pawn.body.angularVelocity.z > 0, 'D applies the source helicopter roll-right angular velocity');
  helicopter.pawn.dispose();

  const unpossessed = createHarness('airplane', false);
  ['ShiftLeft','KeyS','KeyD','KeyE'].forEach(code => unpossessed.pressed.add(code));
  unpossessed.pawn.body.velocity.z = 12;
  unpossessed.pawn.beforePhysics(1/60);
  assert.deepEqual(
    [unpossessed.pawn.state.throttle, unpossessed.pawn.state.pitch, unpossessed.pawn.state.roll, unpossessed.pawn.state.yaw],
    [0, 0, 0, 0],
    'raw keyboard state must never drive a pawn that does not own the player slot'
  );
  unpossessed.pawn.dispose();
});

test('logic services dispatch sketchbookPawn before the vehicle compatibility fallback', () => {
  const actualRuntime = global.LK_RUNTIME_SKETCHBOOK_PAWNS;
  let sketchbookCall = null;
  let vehicleFallbackCalls = 0;
  const createdPawn = {id:'sketchbook-test-pawn'};
  global.LK_RUNTIME_SKETCHBOOK_PAWNS = {
    createLogic(GAME, owner, config, services){
      sketchbookCall = {GAME, owner, config, services};
      return createdPawn;
    },
  };
  const registry = {
    createLogic(){ vehicleFallbackCalls += 1; return {id:'vehicle-fallback'}; },
    get(){ return null; }, getByPlayerId(){ return null; }, firstAvailablePlayerId(){ return 1; }, list(){ return []; },
  };
  const GAME = {pawns:registry};
  const owner = {position:{x:4, y:5, z:6}, rotation:{y:.75}, userData:{logicVariableOverrides:{}}};
  const graph = {
    sketchbookPawn:{kind:'car', tuning:{maxSpeed:80}, spawn:{x:0, y:0, z:0, heading:0}},
    characterPawn:{preset:'normal'},
    vehiclePawn:{tuning:{maxSpeed:20}},
    variables:[{name:'TopSpeed', exposed:true, binding:'tuning.maxSpeed', value:123}],
  };
  const service = global.LK_LOGIC_SERVICES.createPawnService(GAME, {}, owner, graph, {});
  global.LK_RUNTIME_SKETCHBOOK_PAWNS = actualRuntime;
  assert.equal(service.self(), createdPawn);
  assert.equal(vehicleFallbackCalls, 0);
  assert.ok(sketchbookCall);
  assert.equal(sketchbookCall.config.tuning.maxSpeed, 123);
  assert.deepEqual(sketchbookCall.config.spawn, {x:4, y:5, z:6, heading:.75});
  assert.equal(sketchbookCall.services.graph, graph);
});

test('Open World template output is deterministic, portable and attributed', () => {
  const builder = global.LK_RUNTIME_SKETCHBOOK_OPEN_WORLD_LEVEL_TEMPLATE;
  assert.ok(builder && typeof builder.buildScene === 'function');
  assert.equal(builder.id, 'sketchbook-open-world');
  const first = builder.buildScene();
  const second = builder.buildScene();
  assert.deepEqual(second, first, 'template output and authored IDs must not depend on time or randomness');
  assert.deepEqual(first.template, {
    id:'sketchbook-open-world',
    name:'DollBody Open World',
    version:2,
    nativeEditable:true,
    sourceRepository:REPOSITORY,
    sourceCommit:SOURCE_COMMIT,
    sourceLicense:'MIT',
    attribution:'Sketchbook by Jan Bláha (swift502)',
    preservedMetadata:{
      container:'models/sketchbook/world.glb',
      format:'glTF extras',
      scenarios:true,
      paths:true,
      spawnPoints:true,
      physicsMarkers:true,
    },
  });
  assert.equal(first.player.enabled, false);
  assert.equal(first.player.hidden, true);
  assert.equal(first.player.controllerIndex, null);

  const entries = new Map(first.added.map(entry => [entry.id, entry]));
  [
    'sketchbook_world_model',
    'sketchbook_pawn_character',
    'sketchbook_pawn_car',
    'sketchbook_pawn_car_2',
    'sketchbook_pawn_airplane',
    'sketchbook_pawn_airplane_2',
    'sketchbook_pawn_helicopter',
    'sketchbook_pawn_helicopter_2',
  ].forEach(id => assert.ok(entries.has(id), 'missing deterministic scene entry ' + id));
  // Pawns only: the district ring adds one control Logic Element per generated
  // district beside these, and those are counted in the district test below.
  assert.equal(first.added.filter(entry => entry.kind === 'logicElement' && entry.graph && entry.graph.sketchbookPawn).length, 7,
    'Free roam default plus the six spawn_always vehicles must be materialized');
  assert.deepEqual(first.sketchbook.materializedScenario.alwaysSpawnNodes,
    ['Spawn.010','Spawn.011','Spawn.025','Spawn.026','Spawn.028','Spawn.029']);
  const expectedSpawns = {
    sketchbook_pawn_character:{kind:'advanced-character',node:'Spawn.024',position:[-.101,14.696,-5.171],sourcePosition:[-.101,14.804,-5.171],heading:0},
    sketchbook_pawn_car:{kind:'car',node:'Spawn.025',position:[-4.178,14.696,-5.610],sourcePosition:[-4.178,14.804,-5.610],heading:.41686},
    sketchbook_pawn_car_2:{kind:'car',node:'Spawn.026',position:[5.122,14.696,5.476],sourcePosition:[5.122,14.804,5.476],heading:-2.44811},
    sketchbook_pawn_airplane:{kind:'airplane',node:'Spawn.011',position:[152.545,15.067,-92.107],sourcePosition:[152.545,15.175,-92.107],heading:-.06316},
    sketchbook_pawn_airplane_2:{kind:'airplane',node:'Spawn.028',position:[-134.261,40.170,-39.518],sourcePosition:[-134.261,40.278,-39.518],heading:2.36309},
    sketchbook_pawn_helicopter:{kind:'helicopter',node:'Spawn.010',position:[101.363,16.330,-83.082],sourcePosition:[101.363,16.438,-83.082],heading:1.50763},
    sketchbook_pawn_helicopter_2:{kind:'helicopter',node:'Spawn.029',position:[-184.767,80.327,-.043],sourcePosition:[-184.767,80.435,-.043],heading:Math.PI/2},
  };
  const sourceVehicleMaxDimension = {car:2.4926951,airplane:3.5621045,helicopter:3.9225264};
  Object.entries(expectedSpawns).forEach(([id, expected]) => {
    const entry = entries.get(id);
    assert.equal(entry.graph.sketchbookPawn.kind, expected.kind, id + ' pawn kind');
    assert.equal(entry.sourceSpawn.node, expected.node, id + ' source node');
    assert.deepEqual(entry.sourceSpawn.worldPosition, expected.sourcePosition, id + ' upstream world position');
    assert.deepEqual(entry.t.p, expected.position, id + ' editor position');
    assert.deepEqual(entry.t.s, [1,1,1], id + ' authored scale');
    assert.equal(entry.t.r[1], expected.heading, id + ' source yaw');
    assert.deepEqual(entry.graph.sketchbookPawn.spawn,
      {x:expected.position[0],y:expected.position[1],z:expected.position[2],heading:expected.heading},
      id + ' graph spawn must match its editor transform');
    if(sourceVehicleMaxDimension[expected.kind]){
      // Vehicles are scaled up so they read correctly beside a 1.8 m character:
      // the car lands on a real 4.4 m hatchback and every other vehicle travels
      // by the same factor, which preserves the set's internal proportions. The
      // untouched source dimension stays recorded on the asset so provenance and
      // a reset back to source scale remain possible.
      const source = sourceVehicleMaxDimension[expected.kind];
      const scale = 4.4 / sourceVehicleMaxDimension.car;
      const asset = entry.graph.sketchbookPawn.modelAsset;
      assert.equal(asset.sourceFit, source, id + ' must record the bundled GLB source scale');
      assert.ok(asset.fit > source, id + ' playable fit must be larger than the small source scale');
      assert.equal(asset.fit, Number((source * scale).toFixed(6)), id + ' fit uses the shared presentation scale');
      if(expected.kind === 'car') assert.equal(asset.fit, 4.4, 'a DollBody car is a 4.4 m car');
      const element = entry.graph.logicScene.elements.find(item => item && item.asset);
      assert.equal(element.asset.fit, asset.fit, id + ' the Logic Scene model must match the Pawn model scale');
      const fitVariable = entry.graph.variables.find(item => item && item.binding === 'modelAsset.fit');
      assert.equal(fitVariable.value, asset.fit, id + ' the exposed Model Fit must not disagree with the Pawn');
    }
  });
  const playerPosition = expectedSpawns.sketchbook_pawn_character.position;
  const carPosition = expectedSpawns.sketchbook_pawn_car.position;
  assert.deepEqual(carPosition.map((value, index) => Number((value-playerPosition[index]).toFixed(3))),
    [-4.077,0,-.439], 'the nearest car keeps its source-node offset relative to the player');
  assert.equal(first.sketchbook.materializedScenario.upstreamVehiclePhysicsRootLift, 1);
  assert.equal(first.sketchbook.materializedScenario.editorVehiclePlacement, 'bottom-aligned');
  ['sketchbook_pawn_airplane','sketchbook_pawn_airplane_2','sketchbook_pawn_helicopter','sketchbook_pawn_helicopter_2'].forEach(id => {
    const position = expectedSpawns[id].position;
    assert.ok(Math.hypot(position[0]-playerPosition[0],position[2]-playerPosition[2]) > 100,
      id + ' is intentionally remote in the upstream spawn_always scenario');
  });
  assert.equal(entries.get('sketchbook_world_model').kind, 'glb');
  assert.equal(entries.get('sketchbook_world_model').src, 'models/sketchbook/world.glb');
  assert.equal(entries.get('sketchbook_world_model').fit, 2847.2265625);

  const expectedAssets = [
    'models/sketchbook/world.glb',
    'models/sketchbook/boxman.glb',
    'models/sketchbook/car.glb',
    'models/sketchbook/airplane.glb',
    'models/sketchbook/heli.glb',
  ];
  assert.equal(global.LK_LOGIC_TEMPLATES_SKETCHBOOK.ASSETS.world.metadataMode, 'gltf-extras');
  assert.equal(global.LK_LOGIC_TEMPLATES_SKETCHBOOK.ASSETS.world.physicsBackend, 'sketchbook-metadata');
  ['character','car','airplane','helicopter'].forEach(id => {
    assert.equal(global.LK_LOGIC_TEMPLATES_SKETCHBOOK.ASSETS[id].metadataMode, undefined,
      id + ' must remain an ordinary renderable GLB');
  });
  const assetPaths = collectAssetPaths(first);
  expectedAssets.forEach(assetPath => {
    assert.ok(assetPaths.has(assetPath), 'template does not reference ' + assetPath);
    assert.ok(fs.existsSync(path.join(ROOT, assetPath)), 'missing portable asset ' + assetPath);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, assetPath))).digest('hex'), ASSET_HASHES[assetPath],
      'bundled asset must remain byte-identical to the pinned upstream snapshot: ' + assetPath);
  });
  assetPaths.forEach(assetPath => {
    assert.ok(assetPath.startsWith('models/') || assetPath.startsWith('media/') || assetPath.startsWith('musics/'),
      'playable export cannot discover asset path ' + assetPath);
    assert.doesNotMatch(assetPath, /^(?:data:|blob:|https?:)/i);
  });
  assert.ok(fs.existsSync(path.join(ROOT, 'models/sketchbook/LICENSE-Sketchbook-MIT.txt')));
});

test('all five bundled GLBs resolve and can be placed from an Empty scene', () => {
  const placed = [];
  let metadataRefreshes = 0;
  const fakePromise = object => ({
    then(onFulfilled){
      const result = onFulfilled(object);
      return {catch(){ return result; }};
    },
  });
  const catalog = global.LK_EDITOR_ASSET_CATALOG.create({
    GAME:{world:{registry:[]}, systems:{sketchbookPawns:{coordinator:{refreshWorldPhysicsExtras(force){ assert.equal(force, true); metadataRefreshes += 1; }}}}},
    STORE:{},
    ED:{assetFilters:{}, selectedAsset:null, selectedAssets:null},
    root:{querySelectorAll(){ return []; }},
    $(){ return null; },
    levelsApi(){ return null; },
    assetLibraryLoad(){ return []; },
    setAssetLoading(){},
    spawnPointAhead(){ return {x:0, y:0, z:0}; },
    status(message){ throw new Error(message); },
    placeImportedAsset(asset){
      const object = {userData:{addedEntry:{
        id:'placed-' + asset.id,
        kind:'glb',
        src:asset.src,
        fit:asset.fit,
        asset:{key:asset.key, name:asset.name, source:asset.source},
      }}};
      placed.push({asset, object});
      return fakePromise(object);
    },
  });
  const bundled = catalog.bundledAssets();
  assert.deepEqual(bundled.map(asset => asset.src).sort(), [
    'models/sketchbook/airplane.glb',
    'models/sketchbook/boxman.glb',
    'models/sketchbook/car.glb',
    'models/sketchbook/heli.glb',
    'models/sketchbook/world.glb',
  ]);
  bundled.forEach(asset => {
    const item = catalog.getAssetByRef('bundled:' + asset.id);
    assert.ok(item && item.kind === 'bundled-glb', 'unresolved bundled ref for ' + asset.id);
    const object = catalog.placeAssetRef(item, {x:1, y:2, z:3});
    const entry = object.userData.addedEntry;
    assert.equal(entry.kind, 'glb');
    assert.equal(entry.src, asset.src);
    assert.equal(entry.dbKey, null);
    assert.equal(entry.asset.id, asset.id);
    assert.equal(entry.asset.ref, 'bundled:' + asset.id);
    assert.equal(entry.asset.key, asset.key);
    assert.equal(entry.asset.src, asset.src);
    assert.equal(entry.asset.bundled, true);
    assert.equal(entry.asset.license, 'MIT');
    assert.equal(entry.asset.source, REPOSITORY);
    assert.equal(entry.asset.sourceCommit, SOURCE_COMMIT);
    if(asset.id === 'sketchbook-world'){
      assert.equal(entry.metadataMode, 'gltf-extras');
      assert.equal(entry.physicsBackend, 'sketchbook-metadata');
      assert.equal(entry.collide, false);
      assert.equal(entry.physics, false);
    }
  });
  assert.equal(placed.length, 5);
  assert.equal(metadataRefreshes, 1, 'placing the bundled world from Empty refreshes metadata after its entry flags are stamped');
});

test('bundled asset panel and playable ZIP keep discoverable paths and the MIT license', () => {
  const panel = source('js/editor/asset-panel.js');
  const catalog = source('js/editor/asset-catalog.js');
  const playable = source('js/editor/playable-export.js');
  const zip = source('js/editor/playable-export-zip.js');
  // The listing moved under the Engine Assets origin header when the panel was split
  // into Engine/User/Plugin sections. What this test cares about is unchanged: the
  // bundled packs are shown as one group whose name does not claim a single pack.
  assert.match(panel, /addGroup\(box,'BUILT-IN MODELS & PACKS',bundled/,
    'the bundled packs are listed as one group');
  assert.match(panel, /addOriginHeader\(box,'ENGINE ASSETS'/,
    'under the Engine origin, because they ship with the engine');
  // The listing must stay GENERIC. It used to filter on `asset.kind === 'glb'`,
  // which silently hid the FBX default character bodies; what matters is that the
  // DollBody pack is still one of the packs it reads.
  assert.ok(panel.includes('function bundledPacks('), 'the panel reads a list of bundled packs');
  assert.ok(panel.includes('LK_LOGIC_TEMPLATES_SKETCHBOOK'), 'DollBody is still one of them');
  assert.ok(panel.includes("label:'DollBody', licence:'MIT'"), 'and it is still labelled MIT');
  assert.ok(panel.includes('asset.id && asset.src'), 'an asset still needs an id and a source to be listed');
  assert.ok(catalog.includes("ref.indexOf('bundled:') === 0"));
  assert.ok(catalog.includes("item.kind === 'bundled-glb'"));
  assert.ok(catalog.includes('entry.asset = Object.assign({}, entry.asset || {}, {'));
  assert.ok(playable.includes('return playableExportAssets.preparePlayableProject(project);'));
  assert.ok(playable.includes('return playableExportZip.buildPlayableProjectZip(bundle, onProgress);'));
  assert.ok(zip.includes("'models/sketchbook/LICENSE-Sketchbook-MIT.txt'"));
  assert.ok(zip.includes('STATIC_FILES.forEach(p => paths.add(p));'));
  assert.ok(zip.includes("path.indexOf('models/') === 0"));
  assert.ok(zip.includes('collectAssetPathsFromObject(level, paths, new Set())'));
  assert.ok(zip.includes("asset.indexOf('models/sketchbook/') === 0"), 'Sketchbook models and their MIT license are mandatory ZIP inputs');
  const sceneStore = source('js/engine/scene-store.js');
  const selection = source('js/editor/selection-manager.js');
  assert.ok(sceneStore.includes('entry.asset = Object.assign({}, entry.asset || {}'), 'snapshot duplication preserves bundled provenance');
  assert.ok(selection.includes('entry.asset = Object.assign({}, entry.asset || {}'), 'interactive duplication preserves bundled provenance');
  assert.ok(sceneStore.includes('normalized.sketchbookPawn ? assetReady.then'), 'Sketchbook Logic Element hydration rejects missing required models');
  assert.ok(sceneStore.includes('Number(sketchbookDefinition.animationDefaultVersion||0)<1'), 'embedded advanced characters receive the animation-authority migration');
  assert.ok(sceneStore.includes("clip:'idle',autoplay:false,loop:'repeat',speed:1,playInEditor:false"), 'legacy Boxman models cannot autoplay the first seated hand clip in the editor');
});

test('scene store registry dispatch and editor creation keep an explicit Empty escape hatch', () => {
  const store = source('js/engine/scene-store.js');
  const levels = store.slice(store.indexOf('templateScene(GAME, templateId){'), store.indexOf('// dal menu del gioco:', store.indexOf('templateScene(GAME, templateId){')));
  assert.ok(levels.includes('registry && registry.resolve ? registry.resolve(templateId) : null'));
  assert.ok(levels.includes("applyTemplateGround(d, template ? template.ground : 'plane')"), 'template metadata owns the baseline ground policy');
  assert.ok(levels.includes('return registry.build(template.id, d'), 'scene construction dispatches through the self-registering template registry');
  assert.ok(levels.includes("type === 'player' || type.indexOf('player') === 0"), 'native player retention/deletion policy must remain explicit');
  assert.ok(store.includes('if(old && old.template != null) d.template = cloneData(old.template);'), 'template attribution must survive collect/save');
  assert.ok(store.includes('if(old && old.sketchbook != null) d.sketchbook = cloneData(old.sketchbook);'), 'Sketchbook world provenance and GLB metadata counts must survive collect/save');

  const levelManager = source('js/editor/level-manager.js');
  assert.ok(levelManager.includes('templateRegistry.options(tr)'), 'the New Level dialog discovers registered templates');
  assert.ok(levelManager.includes('value:templateRegistry.defaultId()'), 'the registry owns the default Open World selection');
  const registry = source('js/engine/level-template-registry.js');
  assert.ok(registry.includes("const DEFAULT_ID = 'open-world-sketchbook'"));
  assert.ok(store.includes("id:'empty'"), 'Empty remains a separately registered template');
  const projectIo = source('js/editor/project-io.js');
  assert.ok(projectIo.includes("options.empty ? STORE.blank() : (LV && LV.templateScene ? LV.templateScene(GAME, 'open-world-sketchbook') : STORE.blank())"));
  assert.ok(projectIo.includes("createBrowserProject({empty:true, name:'New Project'})"), 'workspace Empty startup must remain empty');
});

test('existing player car service fallback remains present and separate', () => {
  const services = source('js/logic/logic-services.js');
  assert.ok(services.includes('graph && (graph.vehiclePawn || graph.playerPawnBlueprint)'));
  assert.ok(services.includes('self = registry.createLogic(owner, definition, {input:inputService, graph, STORE});'));
  assert.ok(services.indexOf('LK_RUNTIME_SKETCHBOOK_PAWNS.createLogic') < services.indexOf('self = registry.createLogic(owner, definition'),
    'Sketchbook dispatch must be additive and ordered before the existing vehicle fallback');
test('the character state machine drives the source clips, including the landing roll', () => {
  const fs2 = require('node:fs');
  const source = fs2.readFileSync(require('node:path').join(__dirname, '..', 'js/runtime/sketchbook-pawns.js'), 'utf8');

  // boxman.glb ships 34 clips. The adapter used five of them, which is why the
  // character felt stiff: no landing, no roll, no start/stop steps, no turn.
  ['drop_idle', 'drop_running', 'drop_running_roll', 'stop',
   'start_forward', 'start_left', 'start_right', 'start_back_left', 'start_back_right',
   'rotate_left', 'rotate_right', 'jump_idle', 'jump_running', 'falling']
    .forEach(clip => assert.ok(source.includes("'" + clip + "'"), 'the state machine must use the ' + clip + ' clip'));

  assert.ok(source.includes('function advanceLocomotionState'), 'state derivation must be its own function');
  assert.ok(source.includes('function startStepFor'), 'start steps must be chosen from the movement direction');
  assert.ok(source.includes("emit(pawn,'OnCharacterRoll'"), 'a roll must be observable by gameplay');
  assert.ok(/roll=speed>2\.6&&impact>7\.5/.test(source),
    'a roll needs both speed and impact; a slow drop should absorb, not roll');
  assert.ok(source.includes('pawn.state.turnRate=dt>0'), 'turning on the spot needs a real angular speed');

  // Transient clips must play once, not loop.
  assert.ok(source.includes("transient?'once':'repeat'"), 'start/stop/landing clips must not loop');

  // Every state in the clip table must name a clip that actually exists in the
  // bundled model, or the character silently falls back to idle in play.
  const glb = fs2.readFileSync(require('node:path').join(__dirname, '..', 'models/sketchbook/boxman.glb'));
  const json = JSON.parse(glb.slice(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  const available = new Set((json.animations || []).map(a => a.name));
  assert.equal(available.size, 34, 'boxman.glb should still ship its full clip set');
  const table = source.slice(source.indexOf('const LOCOMOTION_CLIPS'), source.indexOf('const TRANSIENT_STATES'));
  (table.match(/'([a-z_]+)'/g) || []).map(m => m.slice(1, -1)).forEach(name => {
    if(['idle'].includes(name)) return;
    assert.ok(available.has(name) || !/^(drop|start|stop|rotate|jump|fall|run|sprint)/.test(name),
      'LOCOMOTION_CLIPS names a clip missing from boxman.glb: ' + name);
  });
});

});
