'use strict';

/* =========================================================
   First person is presented one of two ways, and the author chooses which.

   Switching a Character from third to first person built a whole second rig in
   front of the camera - arms plus a duplicate weapon mesh - on top of the body
   already on screen. Reported as a large frame-rate drop, and the weapon appeared
   twice. The classic shooter look is still wanted, just not implicitly, and a level
   authored entirely in first person has to stay possible.

   So `firstPerson.presentation` is a single explicit choice:

     'body'  the character's own mesh seen from its eyes. Nothing extra is built:
             the camera moves to eye height and the held weapon stays on the body.
     'arms'  the dedicated first-person arms and weapon, with the body culled.

   Keeping them coupled is the point. Previously `hideOwnBody` decided the body and
   the view model decided itself, so two of the four combinations were broken: body
   culled with no arms showed NOTHING, and body kept with arms showed the weapon
   TWICE - and only the author could tell which they had.

   HOW THIS FILE IS ORGANISED
     01 harness    the controller config normaliser
     02 default    what an unset and a legacy config resolve to
     03 body       'body' keeps the mesh and builds nothing
     04 arms       'arms' still culls, and still supports legs
     05 templates  which shipped Pawn uses which
     06 sketchbook a character is offered the eye, not a driver's seat
   ========================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ================================================================= 01 harness

const root = file => path.join(__dirname, '..', file);
const source = file => fs.readFileSync(root(file), 'utf8');

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}

// The controller normalises its own config; drive that rather than a copy of it.
global.window = global;
require('../js/runtime/first-person-view-pawn.js');
require('../js/runtime/first-person-controller.js');
const FP = global.LK_RUNTIME_FIRST_PERSON;
const config = patch => FP.normalizeConfig
  ? FP.normalizeConfig(patch)
  : (function(){ throw new Error('the controller must expose its config normaliser'); })();

// ================================================================== 02 default

test('an unset config presents the body, because that is the cheap default', () => {
  assert.equal(config({}).presentation, 'body');
});

test('a project saved before this existed keeps the look it asked for', () => {
  // `hideOwnBody: true` was only ever set by someone who wanted the arms view.
  assert.equal(config({hideOwnBody:true}).presentation, 'arms',
    'a level that culled its body was asking for arms and must still get them');
  assert.equal(config({hideOwnBody:false}).presentation, 'body');
});

test('an explicit choice wins over the legacy flag', () => {
  assert.equal(config({presentation:'body', hideOwnBody:true}).presentation, 'body');
  assert.equal(config({presentation:'arms', hideOwnBody:false}).presentation, 'arms');
  assert.equal(config({presentation:'nonsense'}).presentation, 'body', 'an unknown value is not honoured');
});

// ===================================================================== 03 body

test('the body presentation keeps the complete shared skeleton untouched', () => {
  const controller = source('js/runtime/first-person-controller.js');
  const mode = controller.slice(controller.indexOf('function bodyMode()'), controller.indexOf('function syncBodyVisibility'));
  assert.match(mode, /!armsPresentation\(\)/, 'the autonomous component decides, not a legacy flag');
  assert.match(mode, /!armsPresentation\(\)\) return 'visible'/,
    'the unified eye keeps the exact same full body used in third person');
  assert.doesNotMatch(controller,/head\.scale|headCull|updateWorldMatrix\(false,true\)/,
    'camera switching cannot scale the Head bone or recursively update its descendants');
  assert.match(controller,/bodyEyeForward/,'the face is cleared by the camera transform instead');
  // The old expression must not come back: it culled whenever hideOwnBody was set,
  // regardless of whether anything existed to replace the body with.
  assert.ok(!/return config\.hideOwnBody \? 'hidden' : 'visible'/.test(mode));
});

test('the view model builds nothing unless arms were asked for', () => {
  const viewModel = source('js/runtime/fps-view-model.js');
  const guard = viewModel.slice(viewModel.indexOf('const pawn = activePawn()'), viewModel.indexOf('const transform = rig.cameraTransform()'));
  assert.match(guard, /if\(!arms\)/, 'the arms rig is gated on the component');
  assert.match(guard, /disposeModel\(\)/, 'body mode tears the extra rig down instead of only hiding it');
  assert.match(guard, /updateHeld/,
    'and the weapon held on the BODY keeps updating, so the character is still armed');
  // It must return before ensure() runs, or the cost is paid anyway.
  const before = viewModel.indexOf('if(!arms)');
  const ensure = viewModel.indexOf('ensure(weapon);');
  assert.ok(before > 0 && before < ensure, 'the gate is before the model is built, not after');
});

// ===================================================================== 04 arms

test('arms still culls the body and still supports the legs look', () => {
  const controller = source('js/runtime/first-person-controller.js');
  const mode = controller.slice(controller.indexOf('function bodyMode()'), controller.indexOf('function syncBodyVisibility'));
  assert.match(mode, /showLegs/, 'the middle ground survives');
  assert.match(mode, /return 'hidden'/, 'and full culling is still reachable');
  assert.equal(config({presentation:'arms', showLegs:true}).showLegs, true);
});

// ================================================================ 05 templates

test('the shooter template uses the complete Character body and keeps arms optional', () => {
  const fps = source('js/logic/logic-templates-fps.js');
  const assignment=fps.slice(fps.indexOf('base.characterPawn.firstPerson ='),fps.indexOf('base.characterPawn.abilities ='));
  assert.match(fps,/characterApi\.makeGraph\('male'\)/,'the FPS graph clones the shared animated Character base without duplicating the complete Normal preset');
  assert.match(assignment,/unifiedBodyCameraVersion:1/);
  assert.match(assignment,/kind:'none',enabled:false/,'the default does not create a second arms Pawn');
  assert.match(fps,/Separate arms visual \(optional\)/,'the classic shooter visual remains an explicit author option');
  assert.match(fps, /binding:'firstPerson\.viewPawn\.kind'/, 'with the component choice exposed');
  const character = source('js/logic/logic-templates-character.js');
  assert.match(character, /kind:'none',enabled:false/, 'the Character templates keep their own mesh');
  assert.ok(!/kind:'first-person-arms'/.test(character), 'and never build a second rig');
});

test('the Character asset loader keeps hidden procedural parts hidden across camera changes', () => {
  const store=source('js/engine/scene-store.js');
  const start=store.indexOf('function setCharacterPlaceholderVisibility');
  const end=store.indexOf('function removeCharacterAssetFallback',start);
  const visibility=store.slice(start,end);
  assert.match(visibility,/characterPlaceholderSuppressedByAsset/,
    'successful Main Mesh loading must stamp the placeholder as asset-suppressed');
  assert.match(visibility,/firstPersonBaseVisible/,
    'the camera visibility cache must be updated with the loader decision');
});

test('legacy engine FPS levels migrate from duplicate arms to the same body', () => {
  global.window = global;
  require('../js/logic/logic-graph.js');
  const GRAPH = global.LK_LOGIC_GRAPH;

  const legacy = {
    variables:[{name:'FirstPersonPresentation',binding:'firstPerson.presentation',value:'arms'},
      {name:'FirstPersonViewPawn',binding:'firstPerson.viewPawn.kind',value:'first-person-arms'}],
    characterPawn:{id:'player-character-first-person',template:true,firstPersonPresentationVersion:1,
      firstPerson:{presentation:'arms',hideOwnBody:true,showLegs:true,viewPawn:{schemaVersion:1,kind:'first-person-arms',enabled:true,showLegs:true}}},
  };
  assert.equal(GRAPH.migrateUnifiedFirstPersonBody(legacy),1);
  assert.equal(legacy.characterPawn.firstPerson.presentation,'body');
  assert.equal(legacy.characterPawn.firstPerson.hideOwnBody,false);
  assert.deepEqual(legacy.characterPawn.firstPerson.viewPawn,{schemaVersion:1,kind:'none',enabled:false,showLegs:false});
  assert.equal(legacy.variables[0].value,'body');
  assert.equal(legacy.variables[1].value,'none');
  assert.equal(GRAPH.migrateUnifiedFirstPersonBody(legacy),0,'the migration is idempotent');

  const savedInEye={variables:[{binding:'firstPerson.viewPawn.kind',value:'first-person-arms'}],characterPawn:{id:'switchable-character',firstPerson:{
    view:'first',allowViewToggle:true,unifiedBodyCamera:true,unifiedBodyCameraVersion:1,
    presentation:'arms',hideOwnBody:true,viewPawn:{schemaVersion:1,kind:'first-person-arms',enabled:true},
  }}};
  assert.equal(GRAPH.migrateUnifiedFirstPersonBody(savedInEye),1,'a switchable body saved in eye view is repaired even after the old version stamp');
  assert.equal(savedInEye.characterPawn.firstPerson.presentation,'body');
  assert.deepEqual(savedInEye.characterPawn.firstPerson.viewPawn,{schemaVersion:1,kind:'none',enabled:false,showLegs:false});
  assert.equal(savedInEye.variables[0].value,'none','the Inspector mirror cannot recreate the dormant arms rig');

  const authored={characterPawn:{id:'custom-fps',template:true,firstPerson:{presentation:'arms',viewPawn:{schemaVersion:1,kind:'first-person-arms',enabled:true}}}};
  assert.equal(GRAPH.migrateUnifiedFirstPersonBody(authored),0,'a custom author-selected arms presentation is preserved');
  assert.equal(authored.characterPawn.firstPerson.presentation,'arms');
});

test('the unified body migration runs while a saved graph loads', () => {
  global.window = global;
  require('../js/logic/logic-graph.js');
  const graph = global.LK_LOGIC_GRAPH.normalizeGraph({
    name:'Damaged Level', kind:'element',
    characterPawn:{id:'player-character-first-person',template:true,firstPersonPresentationVersion:1,
      firstPerson:{presentation:'arms',viewPawn:{schemaVersion:1,kind:'first-person-arms',enabled:true}}},
  });
  assert.equal(graph.characterPawn.firstPerson.presentation,'body');
  assert.equal(graph.characterPawn.firstPerson.viewPawn.kind,'none');
  assert.equal(graph.characterPawn.firstPerson.unifiedBodyCameraVersion,1);
});

test('saved Character graphs gain head-camera controls without losing author values', () => {
  const GRAPH=global.LK_LOGIC_GRAPH;
  const saved={variables:[],characterPawn:{firstPerson:{eyeHeight:1.7}}};
  assert.equal(GRAPH.migrateFirstPersonHeadCamera(saved),1);
  assert.equal(saved.characterPawn.firstPerson.autoEyeHeight,true);
  assert.equal(saved.characterPawn.firstPerson.eyeBoneOffset,.08);
  assert.equal(saved.characterPawn.firstPerson.headCameraVersion,3);
  assert.equal(saved.characterPawn.firstPerson.bodyEyeForward,.28);
  assert.equal(saved.characterPawn.firstPerson.bodyEyeSide,0);
  assert.equal(saved.variables.filter(variable=>variable.binding==='firstPerson.autoEyeHeight').length,1);
  assert.equal(saved.variables.filter(variable=>variable.binding==='firstPerson.eyeBoneOffset').length,1);
  assert.equal(GRAPH.migrateFirstPersonHeadCamera(saved),0,'the Inspector migration is idempotent');
  assert.equal(saved.variables.length,4,'controls are not duplicated on subsequent loads');

  const authored={variables:[{name:'CustomAutoEye',type:'boolean',value:false,exposed:true,
    binding:'firstPerson.autoEyeHeight'}],characterPawn:{firstPerson:{autoEyeHeight:false,eyeBoneOffset:.21}}};
  assert.equal(GRAPH.migrateFirstPersonHeadCamera(authored),1);
  assert.equal(authored.characterPawn.firstPerson.autoEyeHeight,false,'manual camera mode survives');
  assert.equal(authored.characterPawn.firstPerson.eyeBoneOffset,.21,'the authored eye offset survives');
  assert.equal(authored.variables.find(variable=>variable.binding==='firstPerson.autoEyeHeight').value,false,
    'an existing exposed variable is not replaced');
  assert.equal(authored.variables.find(variable=>variable.binding==='firstPerson.eyeBoneOffset').value,.21,
    'a newly exposed variable starts from the authored rig value');
  assert.equal(authored.variables.find(variable=>variable.binding==='firstPerson.bodyEyeForward').value,.28,
    'old saved graphs receive the safe camera-only face clearance');
});

test('head-camera migration runs automatically when an old saved graph loads', () => {
  const graph=global.LK_LOGIC_GRAPH.normalizeGraph({
    name:'Existing FPS Level',variables:[],characterPawn:{firstPerson:{eyeHeight:1.64}},
  });
  assert.equal(graph.characterPawn.firstPerson.autoEyeHeight,true);
  assert.equal(graph.characterPawn.firstPerson.eyeBoneOffset,.08);
  assert.ok(graph.variables.some(variable=>variable.binding==='firstPerson.autoEyeHeight'));
  assert.ok(graph.variables.some(variable=>variable.binding==='firstPerson.eyeBoneOffset'));
});

test('both shipped shooter levels use the same Character in first person', () => {
  const arena = source('js/runtime/fps-arena-level-template.js');
  const player = arena.slice(arena.indexOf("placeLogic('logic-template-player-first-person'"), arena.indexOf('// Target ring'));
  assert.match(player,/kind:'none',enabled:false/,'the FPS arena does not create a second arms Pawn');
  assert.match(player,/presentation = 'body'/,'its eye camera sees the full Character body');
  assert.match(player, /binding === 'firstPerson\.viewPawn\.kind'/, 'with the Inspector variable following');
  const outpost = source('js/runtime/fps-enemy-outpost-level-template.js');
  assert.match(outpost, /kind:'none',enabled:false/, 'the third-person showcase keeps its own mesh');
  assert.match(outpost, /view\.view='third'/, 'and starts in third person');
});

test('the optional arms-plus-legs mode never culls lower-body pieces', () => {
  const controller = source('js/runtime/first-person-controller.js');
  const parts = /const HEAD_PARTS = \/([^/]+)\//.exec(controller);
  assert.ok(parts, 'the culled parts are named by a single pattern');
  ['leg', 'thigh', 'calf', 'shin', 'foot', 'knee', 'toe', 'hip'].forEach(part => {
    assert.ok(!new RegExp('\\b' + part).test(parts[1]),
      part + ' must not be culled: looking down at your own body is the point of this mode');
  });
  ['head', 'neck', 'hair'].forEach(part => {
    assert.ok(parts[1].indexOf(part) >= 0, part + ' is what sits inside the eye and has to go');
  });
});

test('the presentation Pawn owns only its visual and releases it in body mode', () => {
  const VIEW_PAWN = global.LK_RUNTIME_FIRST_PERSON_VIEW_PAWN;
  const pawn = {possessed:true,enabled:true,hidden:false};
  const component = VIEW_PAWN.create(pawn,{kind:'first-person-arms',enabled:true});
  assert.deepEqual(component.ownership,{camera:false,input:false,mixer:false,body:false,visual:true});
  let released = 0;
  assert.equal(component.claimVisual({},() => { released++; }),true);
  component.configure({kind:'none',enabled:false});
  assert.equal(released,1,'switching to the Character body destroys the extra visual');
  assert.equal(component.active(),false);
});

test('attaching the presentation component twice reuses one owner and one dispose hook', () => {
  const VIEW_PAWN = global.LK_RUNTIME_FIRST_PERSON_VIEW_PAWN;
  let baseDisposals = 0;
  const pawn = {possessed:true,enabled:true,hidden:false,dispose(){ baseDisposals++; return true; }};
  const first = VIEW_PAWN.attach(pawn,{kind:'first-person-arms',enabled:true});
  const second = VIEW_PAWN.attach(pawn,{kind:'none',enabled:false});
  assert.equal(second,first,'reload-time attachment must not stack another component');
  assert.equal(second.active(),false,'the existing component still receives the new config');
  pawn.dispose();
  assert.equal(baseDisposals,1,'the underlying Pawn teardown runs exactly once');
  assert.equal(first.isDisposed(),true,'the single presentation owner is released');
});

test('saved presentation data migrates once into the versioned component schema', () => {
  const GRAPH = global.LK_LOGIC_GRAPH;
  const saved={characterPawn:{firstPerson:{view:'first',presentation:'arms',hideOwnBody:true,showLegs:true}}};
  assert.equal(GRAPH.migrateFirstPersonViewPawn(saved),1);
  assert.deepEqual(saved.characterPawn.firstPerson.viewPawn,
    {schemaVersion:1,kind:'first-person-arms',enabled:true,showLegs:true});
  assert.equal(GRAPH.migrateFirstPersonViewPawn(saved),0,'schema migration is idempotent');
});

// =============================================================== 06 sketchbook

test('a Sketchbook character is offered the eye, never a driver seat', () => {
  const pack = source('js/logic/logic-templates-sketchbook.js');
  const line = pack.split('\n').find(text => text.indexOf("selectVar('CameraMode'") >= 0);
  assert.ok(line, 'the camera mode is still a select');
  const block = pack.slice(pack.indexOf("selectVar('CameraMode'"), pack.indexOf("numberVar('CameraDistance'"));
  assert.match(block, /advanced-character/, 'the options depend on the Pawn kind');
  assert.match(block, /First person \(eye height\)/, 'a character gets first person');
  assert.match(block, /Interior \(driver seat\)/, 'a vehicle keeps its seat, and says what it is');
});

test('the Sketchbook first person resolves to a real camera, not a dead option', () => {
  // Offering a mode the runtime ignores is how a control ends up silently behaving
  // as Free. It maps onto the interior geometry, which already works, with body
  // offsets instead of a driver's.
  const pawns = source('js/runtime/sketchbook-pawns.js');
  const block = pawns.slice(pawns.indexOf("cfg.camera.mode||'').toLowerCase()==='first'"));
  assert.ok(block, 'the first-person mode is handled');
  const mapping = block.slice(0, 700);
  assert.match(mapping, /cfg\.camera\.mode='interior'/, 'it reuses the eye geometry that exists');
  assert.match(mapping, /interiorForward=0/, 'with no forward shift - a body is not sitting in a seat');
  assert.match(mapping, /interiorLateral=0/, 'and no lateral shift');
  assert.match(mapping, /interiorHeight=eyeHeight/, 'at eye height');
  assert.match(mapping, /interiorLag=Math\.max\(14/, 'and tight, or the view swims when the body turns');
});

console.log('\nfirst person presentation tests passed');
