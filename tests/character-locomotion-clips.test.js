'use strict';

/* =========================================================
   Locomotion resolves to a real clip, not just the roll.

   Reported as "the only animation that works is the roll, so the others should work
   too and you wired them wrong". Exactly right, and the roll was the clue.

   TWO systems play clips on a Character:

     animations.<slot>   one-shot actions, played by name through playAction()
     animationSet        the locomotion state machine

   Only the first was given assets. Every entry of the SET carried `asset: null` and
   a clip NAME - 'Idle', 'Walking', 'Running'. `findClip()` matches that name against
   the loaded takes, but every bundled Mixamo file exports a single take called
   `mixamo.com`, so no name could ever match. Its single-clip fallback - the thing
   that makes a Mixamo take usable at all - is guarded by `assetKey && length === 1`,
   so with no asset it never engaged and locomotion resolved to NOTHING.

   The roll is a one-shot slot, and slots did carry assets. Hence: only the roll.

   HOW THIS FILE IS ORGANISED
     01 harness    the body catalogue, the templates and the real findClip
     02 resolution findClip against a mixamo.com take, with and without an asset
     03 sets       every locomotion entry now carries its body's clip
     04 templates  the shipped graphs, and the combat set
     05 authored   a custom clip in the set survives a body change
   ========================================================= */

const assert = require('node:assert/strict');
const THREE = require('three');
const path = require('node:path');

// ================================================================= 01 harness

global.window = global;
global.THREE = THREE;
require('../js/runtime/character-bodies.js');
require('../js/runtime/character-placeholder-locomotion.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-templates.js');
require('../js/logic/logic-templates-character.js');
require('../js/runtime/character-movement.js');
require('../js/runtime/character-animation-set.js');
require('../js/runtime/soccer-locomotion.js');

const BODIES = global.LK_RUNTIME_CHARACTER_BODIES;
const PACK = global.LK_LOGIC_TEMPLATES_CHARACTER;
const LOCOMOTION = global.LK_RUNTIME_CHARACTER_LOCOMOTION;
const ANIMATIONS = global.LK_RUNTIME_CHARACTER_ANIMATION_SET;
const TEMPLATES = global.LK_LOGIC_TEMPLATES;

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
/** A loaded bundled take: one clip, named mixamo.com, scoped to its asset key. */
function bundledClip(asset){
  const clip = new THREE.AnimationClip('mixamo.com', 1, []);
  clip.userData = {lkAnimationAssetKey:asset.key, lkAnimationAssetSource:'fbx'};
  return clip;
}

// ============================================================== 02 resolution

test('findClip cannot match a bundled take by NAME - this is the whole bug', () => {
  const walk = BODIES.motions('male').walk;
  const clips = [bundledClip(walk)];
  // What the set used to ask for: a name, no asset.
  const byName = LOCOMOTION.findClip(clips, {clip:'Walking', asset:null}, 'Walk Forward');
  assert.equal(byName, null,
    'a take called mixamo.com can never be found by the name "Walking" - locomotion resolved to nothing');
  // What it asks for now: the asset. The single-clip fallback then engages.
  const byAsset = LOCOMOTION.findClip(clips, {clip:'Walking', asset:walk}, 'Walk Forward');
  assert.equal(byAsset, clips[0], 'with the asset, its sole take is the answer');
});

test('the roll worked because a one-shot slot did carry its asset', () => {
  // The asymmetry the user spotted, pinned so it cannot come back.
  const roll = BODIES.motions('male').roll;
  const clips = [bundledClip(roll)];
  assert.equal(LOCOMOTION.findClip(clips, {clip:'Falling To Roll', asset:roll}, 'roll'), clips[0]);
});

// ==================================================================== 03 sets

test('every locomotion entry with a bundled clip now carries it', () => {
  ['male', 'female'].forEach(bodyId => {
    const set = PACK.defaultAnimationSet(bodyId);
    const byId = {};
    set.forEach(entry => { byId[entry.id] = entry; });
    const expected = {
      'idle':'idle', 'walk-forward':'walk', 'run-forward':'run',
      'strafe-left':'strafeLeft', 'strafe-right':'strafeRight',
      'jump-rise':'jump', 'fall-loop':'fall', 'landing-moving':'landMoving',
    };
    const available = BODIES.motions(bodyId);
    Object.keys(expected).forEach(id => {
      const entry = byId[id];
      assert.ok(entry, bodyId + ' set has an entry ' + id);
      assert.ok(entry.asset, id + ' must carry an asset or it resolves to nothing');
      assert.equal(entry.asset.src, available[expected[id]].src,
        id + ' points at the ' + expected[id] + ' clip for the ' + bodyId + ' body');
    });
    // And the resolution actually works end to end for each of them.
    Object.keys(expected).forEach(id => {
      const entry = byId[id];
      const clips = [bundledClip(entry.asset)];
      assert.ok(LOCOMOTION.findClip(clips, {clip:entry.clip, asset:entry.asset}, entry.name),
        id + ' must resolve through findClip');
    });
  });
});

test('an entry with no bundled clip is left unbound rather than approximated', () => {
  const set = PACK.defaultAnimationSet('male');
  const interact = set.find(entry => entry.id === 'interact');
  assert.ok(!interact.asset, 'interact has no bundled take and stays unbound');
  // The ordinary landing DOES have one now - `run-to-stop`, arriving on your feet at
  // speed. The hard landing stays reserved for a fall that hurts, and the roll keeps
  // handling a drop taken well; those are three different events.
  const landing = set.find(entry => entry.id === 'landing');
  assert.match(landing.asset.src, /run-to-stop\.fbx$/, 'landing is the run-to-stop clip');
  assert.notEqual(landing.asset.src, BODIES.motions('male').landHeavy.src,
    'and it is NOT the hard landing, which only plays when the fall hurts');

  const combatLanding = PACK.combatAnimationSet('male').find(entry => entry.id === 'landing');
  assert.equal(combatLanding.clip, 'Run To Stop', 'the FPS/TPS set must not restore the old generic Landing label');
  assert.match(combatLanding.asset.src, /run-to-stop\.fbx$/, 'combat uses the same ordinary running landing asset');
  const movingLanding = PACK.combatAnimationSet('male').find(entry => entry.id === 'landing-moving');
  assert.equal(movingLanding.clip, 'Falling To Landing');
  assert.match(movingLanding.asset.src, /falling-to-landing\.fbx$/,
    'running landings reuse the exact Soccer Game Pack transition');
});

test('landing speed chooses stop or Soccer Falling To Landing', () => {
  const set = PACK.combatAnimationSet('male').map(ANIMATIONS.normalizeEntry);
  const stopped = ANIMATIONS.select(set, {justLanded:true,grounded:true,speed:0,x:0,z:0}, 1)[0];
  const running = ANIMATIONS.select(set, {justLanded:true,grounded:true,speed:5.9,x:0,z:5.9}, 1)[0];
  assert.equal(stopped.entry.id, 'landing', 'landing without momentum may finish on the feet');
  assert.equal(running.entry.id, 'landing-moving', 'landing at run speed flows into locomotion');
});

test('per-slot pose timeline interpolates root and bone corrections without leaking', () => {
  const entry=ANIMATIONS.normalizeEntry({id:'roll-edit',state:'action',action:'roll',clip:'Roll',poseTimeline:{keyframes:[
    {time:0,motionTransform:{position:[0,0,0],rotation:[0,0,0]},rigCorrections:{spine:[0,0,0]}},
    {time:1,motionTransform:{position:[2,1,0],rotation:[0,90,0]},rigCorrections:{spine:[10,20,30]}},
  ]}});
  const middle=ANIMATIONS.samplePoseTimeline(entry.poseTimeline,.5);
  assert.deepEqual(middle.motionTransform.position,[1,.5,0]);
  assert.deepEqual(middle.motionTransform.rotation,[0,45,0]);
  assert.deepEqual(middle.rigCorrections.spine,[5,10,15]);
  const untouched=ANIMATIONS.normalizeEntry({id:'run',state:'grounded',clip:'Run'});
  assert.equal(ANIMATIONS.samplePoseTimeline(untouched.poseTimeline,.5),null,'another slot owns no copy of Roll edits');
});

test('the FPS-authored action corrections are shared Character defaults', () => {
  ['defaultAnimationSet','combatAnimationSet'].forEach(factory=>{
    const set=PACK[factory]('male'),roll=set.find(entry=>entry.id==='action-slot-roll'),slide=set.find(entry=>entry.id==='action-slot-slide'),vault=set.find(entry=>entry.id==='action-slot-vault'),wallFlip=set.find(entry=>entry.id==='action-slot-wallFlip');
    assert.ok(roll,factory+' persists Roll before Pawn Studio is opened');
    assert.deepEqual(roll.motionTransform.position,[0,-.118,0]);
    assert.deepEqual(roll.poseTimeline.keyframes,[]);
    assert.match(roll.asset.src,/falling-to-roll\.fbx$/,'the lowered pivot belongs to the bundled Roll take');
    assert.ok(slide,factory+' persists Slide before Pawn Studio is opened');
    assert.deepEqual(slide.motionTransform.position,[0,-.118,0]);
    assert.equal(slide.poseTimeline.keyframes.length,10);
    assert.deepEqual(slide.poseTimeline.keyframes.at(-1).motionTransform.position,[0,-.023,-.015]);
    assert.match(slide.asset.src,/slide\.fbx$/,'the correction follows the bundled Slide take it was authored against');
    assert.equal(vault.playbackRate,2,'the FPS-authored Vault tempo is shared');
    assert.match(vault.asset.src,/front-flip-vault\.fbx$/,'the stale FPS label cannot replace the asset actually played');
    assert.equal(wallFlip.playbackRate,.65,'the FPS-authored Wall Flip tempo is shared');
  });
});

test('saved Characters inherit an untouched Slide default but keep authored work', () => {
  const untouched={bodyType:'male',animations:{roll:{asset:BODIES.motions('male').roll},slide:{asset:BODIES.motions('male').slide},vault:{asset:BODIES.motions('male').vault},wallFlip:{asset:BODIES.motions('male').wallFlip}},animationSet:[
    {id:'action-slot-roll',state:'action',action:'roll',motionTransform:{position:[0,0,0],rotation:[0,0,0]},poseTimeline:{version:1,keyframes:[]}},
    {id:'action-slot-slide',state:'action',action:'slide',motionTransform:{position:[0,0,0],rotation:[0,0,0]},poseTimeline:{version:1,keyframes:[]}},
    {id:'action-slot-vault',state:'action',action:'vault',playbackRate:1,motionTransform:{position:[0,0,0],rotation:[0,0,0]},poseTimeline:{version:1,keyframes:[]}},
    {id:'action-slot-wallFlip',state:'action',action:'wallFlip',playbackRate:1,motionTransform:{position:[0,0,0],rotation:[0,0,0]},poseTimeline:{version:1,keyframes:[]}},
  ]};
  assert.equal(PACK.applyPawnStudioAuthoringDefaults(untouched),true);
  assert.deepEqual(untouched.animationSet[0].motionTransform.position,[0,-.118,0]);
  assert.deepEqual(untouched.animationSet[1].motionTransform.position,[0,-.118,0]);
  assert.equal(untouched.animationSet[1].poseTimeline.keyframes.length,10);
  assert.equal(untouched.animationSet[2].playbackRate,2);
  assert.equal(untouched.animationSet[3].playbackRate,.65);
  assert.equal(PACK.applyPawnStudioAuthoringDefaults(untouched),false,'the versioned migration runs once');

  const custom={bodyType:'male',animations:{slide:{asset:{src:'user/custom-slide.fbx',key:'imported:slide'}}},animationSet:[
    {id:'action-slot-slide',state:'action',action:'slide',asset:{src:'user/custom-slide.fbx',key:'imported:slide'},motionTransform:{position:[.2,0,0],rotation:[0,4,0]},poseTimeline:{version:1,keyframes:[{time:.5}]}}
  ]};
  PACK.applyPawnStudioAuthoringDefaults(custom);
  assert.deepEqual(custom.animationSet[0].motionTransform.position,[.2,0,0],'a custom imported take keeps its own correction');
  assert.equal(custom.animationSet[0].poseTimeline.keyframes.length,1);
});

test('right really is right: the lateral direction matches the engine frame', () => {
  // Reported as "going right runs left and vice versa". With forward +Z and up +Y in
  // a right-handed frame, right = forward x up = (-1,0,0). The set used [1,0] for
  // right, so every lateral and diagonal entry was mirrored. Forward was unaffected,
  // which is exactly why only the strafes looked wrong.
  const set = PACK.defaultAnimationSet('male');
  const dir = id => set.find(entry => entry.id === id).direction;
  assert.deepEqual(dir('strafe-right'), [-1, 0], 'right is -X in this frame');
  assert.deepEqual(dir('strafe-left'), [1, 0]);
  assert.deepEqual(dir('walk-forward'), [0, 1], 'forward was always correct');
  assert.deepEqual(dir('walk-backward'), [0, -1]);
  // The combat set shares the frame, so it had the same mirror.
  const combat = PACK.combatAnimationSet('male');
  assert.deepEqual(combat.find(entry => entry.id === 'walk-right').direction, [-1, 0]);
  assert.deepEqual(combat.find(entry => entry.id === 'walk-left').direction, [1, 0]);
});

test('straight combat locomotion cannot inherit a diagonal lean', () => {
  const set = PACK.combatAnimationSet('male').map(ANIMATIONS.normalizeEntry);
  const selected = ANIMATIONS.select(set,{x:0,z:5.9,speed:5.9,grounded:true},3);
  assert.ok(selected.every(item=>/forward$/.test(item.entry.id)),
    'forward input may blend forward gait speeds, but never diagonal/side clips that make the body crooked: '+selected.map(item=>item.entry.id));
});

test('a sideways step walks, and only running sideways runs', () => {
  // "if I go right or left the RUN appears": the strafe slots were bound to
  // `strafe-left/right.fbx`, which are the RUNNING strafes. The sources ship the
  // walking pair too; it had been copied and left unused.
  const motions = BODIES.motions('male');
  assert.match(motions.strafeLeft.src, /strafe-walk-left\.fbx$/, 'the walk slot is the WALK strafe');
  assert.match(motions.runStrafeLeft.src, /strafe-left\.fbx$/, 'and the run strafe is its own clip');
  const set = PACK.defaultAnimationSet('male');
  const walkStrafe = set.find(entry => entry.id === 'strafe-left');
  const runStrafe = set.find(entry => entry.id === 'run-strafe-left');
  assert.equal(walkStrafe.speed, 1.8, 'the walk strafe sits at walk speed');
  assert.equal(runStrafe.speed, 5.4, 'the run strafe at run speed');
  assert.match(walkStrafe.asset.src, /strafe-walk-left\.fbx$/);
  assert.match(runStrafe.asset.src, /strafe-left\.fbx$/);
});

test('a backstep is the forward walk played backwards', () => {
  const back = PACK.defaultAnimationSet('male').find(entry => entry.id === 'walk-backward');
  assert.equal(back.playbackRate, -1, 'negative rate reverses the cycle - no second asset needed');
  assert.match(back.asset.src, /walking\.fbx$/, 'and it reuses the forward walk');
  // The normaliser used to clamp the rate to a 0.1 floor, which silently turned -1
  // into a forward walk crawling at a tenth speed.
  const SET = global.LK_RUNTIME_CHARACTER_ANIMATION_SET;
  assert.equal(SET.normalizeEntry({id:'x', clip:'Walking', playbackRate:-1}).playbackRate, -1);
  assert.equal(SET.normalizeEntry({id:'x', clip:'Walking', playbackRate:-99}).playbackRate, -4, 'magnitude still clamps');
  assert.equal(SET.normalizeEntry({id:'x', clip:'Walking', playbackRate:-0.01}).playbackRate, -0.1);
});

test('the two bodies get different locomotion, and share the fall', () => {
  const male = PACK.defaultAnimationSet('male');
  const female = PACK.defaultAnimationSet('female');
  const srcOf = (set, id) => (set.find(entry => entry.id === id).asset || {}).src;
  assert.notEqual(srcOf(male, 'walk-forward'), srcOf(female, 'walk-forward'), 'the walk is per body');
  assert.equal(srcOf(male, 'fall-loop'), srcOf(female, 'fall-loop'), 'the fall is authored once');
});

// =============================================================== 04 templates

test('the shipped graphs ship a set that resolves', () => {
  ['logic-template-player-character-normal', 'logic-template-player-character-female'].forEach(id => {
    const pawn = TEMPLATES.get(id).graph.characterPawn;
    const bound = pawn.animationSet.filter(entry => entry.asset);
    assert.ok(bound.length >= 7, id + ' ships a bound locomotion set, got ' + bound.length);
    const walk = pawn.animationSet.find(entry => entry.id === 'walk-forward');
    assert.ok(walk.asset && walk.asset.src.indexOf('models/characters/') === 0, id + ' walk points at a bundled clip');
  });
});

test('the combat set is bound too, including its lateral entries', () => {
  const set = PACK.combatAnimationSet('male');
  const byId = {};
  set.forEach(entry => { byId[entry.id] = entry; });
  const motions = BODIES.motions('male');
  assert.equal(byId['walk-forward'].asset.src, motions.walk.src);
  assert.equal(byId['run-forward'].asset.src, motions.run.src);
  assert.equal(byId['walk-left'].asset.src, motions.strafeLeft.src, 'the combat set names its strafes differently');
  assert.equal(byId['walk-right'].asset.src, motions.strafeRight.src);
  // The straight backstep reuses the forward walk in REVERSE, like the default set.
  assert.match(byId['walk-backward'].asset.src, /walking\.fbx$/);
  assert.equal(byId['walk-backward'].playbackRate, -1, 'played backwards');
  // The diagonals ARE bound now, and to real diagonal takes rather than an
  // approximation. Nine of this set's twenty-one entries used to carry a clip name
  // and no asset - every diagonal and the straight run backward - so a character
  // moving that way had no pose at all. The clips were in the shoot pack sources the
  // whole time. Each was measured before being bound
  // (scripts/measure-clip-direction.mjs): walk-forward-left moves the hips dx +137
  // dz +137, which is the direction the entry declares.
  assert.equal(byId['walk-forward-left'].asset.src, motions.walkForwardLeft.src);
  assert.equal(byId['walk-forward-right'].asset.src, motions.walkForwardRight.src);
  assert.equal(byId['walk-back-left'].asset.src, motions.walkBackLeft.src);
  assert.equal(byId['walk-back-right'].asset.src, motions.walkBackRight.src);
  assert.equal(byId['run-forward-left'].asset.src, motions.runForwardLeft.src);
  assert.equal(byId['run-forward-right'].asset.src, motions.runForwardRight.src);
  assert.equal(byId['run-back-left'].asset.src, motions.runBackLeft.src);
  assert.equal(byId['run-back-right'].asset.src, motions.runBackRight.src);
  assert.equal(byId['run-backward'].asset.src, motions.runBackward.src,
    'and the straight run backward is its own take, not the forward run reversed');
  assert.equal(set.filter(entry => !entry.asset).length, 0,
    'no entry of this set may resolve to nothing - that is what made it look broken');
  // A diagonal keeps a forward rate: reversing one reads as a stumble.
  assert.notEqual(byId['walk-back-left'].playbackRate, -1);
  assert.equal(byId['walk-back-left'].playbackRate, 1, 'a diagonal is not reversed');
});

test('changing the body moves the locomotion set with it', () => {
  const graph = JSON.parse(JSON.stringify(TEMPLATES.get('logic-template-player-character-normal').graph));
  PACK.applyGraphBody(graph, 'female');
  const walk = graph.characterPawn.animationSet.find(entry => entry.id === 'walk-forward');
  assert.match(walk.asset.src, /mannequin-female\//, 'the set followed the body, not just the slots');
});

// ================================================================ 05 authored

test('a clip the author put in the set survives a body change', () => {
  const set = PACK.defaultAnimationSet('male').map(entry => entry.id === 'walk-forward'
    ? Object.assign({}, entry, {asset:{src:'user/my-walk.fbx', key:'imported:my-walk'}})
    : entry);
  const moved = BODIES.applyBodyToAnimationSet(set, 'female');
  const walk = moved.find(entry => entry.id === 'walk-forward');
  assert.equal(walk.asset.src, 'user/my-walk.fbx', 'an imported clip is authored work and is kept');
  const run = moved.find(entry => entry.id === 'run-forward');
  assert.match(run.asset.src, /mannequin-female\//, 'while the bundled ones still follow the body');
});

test('blended locomotion loops share gait phase even when clip durations differ', () => {
  const action=(duration,time)=>({time,getClip:()=>({duration})});
  const actions={walk:action(1.1,.275),run:action(.8,.63),land:action(.7,.4)};
  const selected=[
    {entry:{id:'walk',state:'grounded',loop:true,speed:1.8},weight:.7},
    {entry:{id:'run',state:'grounded',loop:true,speed:5.4},weight:.3},
    {entry:{id:'land',state:'land',loop:false,speed:4},weight:1},
  ];
  assert.equal(LOCOMOTION.synchronizeLoopPhases(selected,actions),true);
  assert.ok(Math.abs(actions.run.time/.8-actions.walk.time/1.1)<1e-9,
    'Walk and Run use the same normalized footfall instead of periodically beating');
  assert.equal(actions.land.time,.4,'a one-shot landing is never phase-locked as a locomotion loop');
});

// ============================================================== 06 saved levels

test('a level saved with the mirrored vectors is repaired on load', () => {
  // Fixing the shipped template reaches NEW characters only: the pawn keeps its own
  // copy of the set, so a level authored before the fix strafes the wrong way for
  // ever. The rule is self-consistency - the id names the side, so the vector is
  // made to agree with the id - which also repairs a hand-made set that named its
  // sides while the old direction table was still in place.
  const graph = {
    characterPawn:{
      template:true,
      animationSet:[
        {id:'strafe-left', direction:[-1, 0]},
        {id:'strafe-right', direction:[1, 0]},
        {id:'run-strafe-left', direction:[-1, 0]},
        {id:'walk-forward-right', direction:[.7, .7]},
        {id:'walk-forward', direction:[0, 1]},
        {id:'landing', direction:[0, 0]},
      ],
    },
  };
  const repaired = global.LK_LOGIC_GRAPH.migrateLocomotionSides(graph);
  const dir = id => graph.characterPawn.animationSet.find(entry => entry.id === id).direction;
  assert.equal(repaired, 4, 'the four entries whose lateral sign contradicted their id');
  assert.deepEqual(dir('strafe-left'), [1, 0], '+X is the body own left, measured from the clip root motion');
  assert.deepEqual(dir('strafe-right'), [-1, 0]);
  assert.deepEqual(dir('run-strafe-left'), [1, 0]);
  assert.deepEqual(dir('walk-forward-right'), [-.7, .7], 'a diagonal is repaired on its lateral half only');
  assert.deepEqual(dir('walk-forward'), [0, 1], 'forward was never mirrored and must not be touched');
  assert.deepEqual(dir('landing'), [0, 0], 'nor an entry with no lateral component');
  assert.equal(graph.characterPawn.locomotionSideVersion, 1, 'and it is versioned, so it runs once');
});

test('the migration never runs twice, so an author can mirror a side on purpose', () => {
  const graph = {characterPawn:{template:true, locomotionSideVersion:1,
    animationSet:[{id:'strafe-left', direction:[-1, 0]}]}};
  assert.equal(global.LK_LOGIC_GRAPH.migrateLocomotionSides(graph), 0);
  assert.deepEqual(graph.characterPawn.animationSet[0].direction, [-1, 0],
    'a deliberate choice made after the repair survives');
});

test('normalizeGraph applies it, or a saved level never sees the fix', () => {
  const graph = global.LK_LOGIC_GRAPH.normalizeGraph({
    name:'Saved Level', kind:'element',
    characterPawn:{template:true, animationSet:[{id:'strafe-left', direction:[-1, 0]}]},
  });
  assert.deepEqual(graph.characterPawn.animationSet[0].direction, [1, 0]);
});

console.log('\ncharacter locomotion clip tests passed');

// ======================================== 07 weapon, crouch and cover slots

test('the weapon, crouch and cover clips are bound and authorable', () => {
  // These takes shipped in the pack and nothing referenced them: aiming and firing
  // had no body pose at all, and character-combat-cover.js moved the character into
  // cover while playing nothing, so it read as sliding into place. A slot here is
  // what gives them BOTH a bundled asset and a field an author can rebind.
  const pawn = PACK.characterGraph ? PACK.characterGraph().characterPawn
    : global.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal').graph.characterPawn;
  const motions = BODIES.motions('mannequin-male');
  [
    ['aimIdle', 'aimIdle'], ['aimRifleIdle', 'aimRifleIdle'], ['fire', 'fire'],
    ['runAiming', 'runAiming'], ['crouchIdle', 'crouchIdle'], ['crouchAimIdle', 'crouchAimIdle'],
    ['coverHigh', 'coverHigh'], ['coverToStand', 'coverToStand'],
    ['coverSneakLeft', 'coverSneakLeft'], ['coverSneakRight', 'coverSneakRight'],
  ].forEach(([slot, motion]) => {
    const entry = pawn.animations[slot];
    assert.ok(entry && entry.asset, slot + ' must carry a bundled clip, or nothing can play it');
    assert.equal(entry.asset.src, motions[motion].src, slot + ' must point at its own take');
  });
  // The cover takes FBXLoader cannot read must never be reachable from a slot: one
  // unreadable file in the load list costs the character every animation, not one.
  const unreadable = /jumping-up|stand-to-cover-low|cover-to-stand-a/;
  Object.keys(pawn.animations).forEach(slot => {
    const asset = pawn.animations[slot] && pawn.animations[slot].asset;
    assert.ok(!asset || !unreadable.test(String(asset.src)),
      slot + ' points at an unreadable take: ' + (asset && asset.src));
  });
});

// ============================= 08 the ordinary Character walks in eight directions

test('the plain Character has the diagonals too, not just forward and two strafes', () => {
  // The ordinary Character only ever had forward, the two strafes and a reversed
  // walk. Moving diagonally blended two cardinal poses and moving backward at speed
  // had no take at all, so the body slid. Only the COMBAT set declared the eight-way
  // entries - and even there they carried a clip name with no asset, so they resolved
  // to nothing. The takes exist for both bodies and both gaits.
  ['male', 'female'].forEach(bodyId => {
    const set = PACK.defaultAnimationSet(bodyId);
    const byId = {};
    set.forEach(entry => { byId[entry.id] = entry; });
    const motions = BODIES.motions(bodyId);
    const wanted = {
      'run-backward':'runBackward',
      'walk-forward-left':'walkForwardLeft', 'walk-forward-right':'walkForwardRight',
      'walk-back-left':'walkBackLeft', 'walk-back-right':'walkBackRight',
      'run-forward-left':'runForwardLeft', 'run-forward-right':'runForwardRight',
      'run-back-left':'runBackLeft', 'run-back-right':'runBackRight',
    };
    Object.keys(wanted).forEach(id => {
      assert.ok(byId[id], bodyId + ' is missing the ' + id + ' entry');
      assert.ok(byId[id].asset, id + ' must carry an asset or it resolves to nothing');
      assert.equal(byId[id].asset.src, motions[wanted[id]].src, id + ' must point at its own take');
    });
    // Only `interact` may still be unbound: there is no bundled take for it, and
    // pointing it at an approximation would be worse than leaving it empty.
    assert.deepEqual(set.filter(entry => !entry.asset).map(entry => entry.id), ['interact']);
  });
});

test('moving diagonally selects the diagonal clip instead of blending two cardinals', () => {
  // Drives the real selector. `x` is the lateral input in the character's own frame,
  // where +X is its LEFT - measured from both the input chain and the clips' own root
  // motion, not derived from the frame convention.
  const set = PACK.defaultAnimationSet('male').map(ANIMATIONS.normalizeEntry);
  const pick = (x, z, speed) => ANIMATIONS.select(set, {x, z, speed, grounded:true}, 1)[0].entry.id;
  assert.equal(pick(1.27, 1.27, 1.8), 'walk-forward-left');
  assert.equal(pick(-1.27, 1.27, 1.8), 'walk-forward-right');
  assert.equal(pick(1.13, -1.13, 1.6), 'walk-back-left');
  assert.equal(pick(-3.4, -3.4, 4.8), 'run-back-right');
  assert.equal(pick(0, -4.8, 4.8), 'run-backward', 'a real backward run, not the forward run reversed');
  // And the cardinals must not have been disturbed by the new neighbours.
  assert.equal(pick(0, 1.8, 1.8), 'walk-forward');
  assert.equal(pick(0, 5.4, 5.4), 'run-forward');
  assert.equal(pick(1.8, 0, 1.8), 'strafe-left');
  assert.equal(pick(-1.8, 0, 1.8), 'strafe-right');
});
