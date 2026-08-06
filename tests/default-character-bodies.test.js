'use strict';

/* =========================================================
   The two bundled default bodies, and the slots they fill.

   Before this there was one Character template with an empty Model field and a
   0.001-scaled placeholder cube, and no way to choose a body at all. There were
   also nine authorable animation slots while `character-abilities.js` played
   seventeen actions by name, so roll, slide, vault, mantle, climb, hang and both
   hard landings could never be bound to a clip by an author.

   Three facts about the bundled files drive the design here, and each one is
   asserted rather than assumed:

     1. Every motion file exports a single take named `mixamo.com`, so slots bind
        by ASSET and the stored label is cosmetic.
     2. A T-pose mannequin's longest axis is its ARM SPAN, not its height, and
        `fit` normalises the longest axis - so a shared `fit` gave a 1.67 m male
        beside a 1.80 m female. Each body carries its own fit.
     3. The files are FBX, and the export path only collected
        glb/gltf/wav/mp3/png/jpg/webp/hdr - so an exported game shipped with no
        character at all, silently.

   HOW THIS FILE IS ORGANISED
     01 harness    the template pack
     02 choice     both bodies exist and are selectable
     03 height     the per-body fit puts both at 1.8 m
     04 slots      every action the runtime plays is authorable
     05 files      every reference resolves on disk
     06 shipping   the export collects FBX and treats the bodies as required
   ========================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ================================================================= 01 harness

global.window = global;
require('../js/runtime/character-placeholder-locomotion.js');
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-templates.js');
require('../js/runtime/character-bodies.js');
require('../js/logic/logic-templates-character.js');

const TEMPLATES = global.LK_LOGIC_TEMPLATES;
const PACK = global.LK_LOGIC_TEMPLATES_CHARACTER;
const root = file => path.join(__dirname, '..', file);

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
const MALE = 'logic-template-player-character-normal';
const FEMALE = 'logic-template-player-character-female';
function graphOf(id){
  const template = TEMPLATES.get(id);
  assert.ok(template && template.graph, 'missing template ' + id);
  return template.graph;
}

// ================================================================== 02 choice

test('both default bodies ship as selectable templates', () => {
  assert.deepEqual(Object.keys(PACK.BODY_TYPES).sort(), ['female', 'male']);
  const male = graphOf(MALE), female = graphOf(FEMALE);
  assert.equal(male.characterPawn.bodyType, 'male');
  assert.equal(female.characterPawn.bodyType, 'female');
  // The male keeps the original template id, so saved projects still resolve and
  // the packs that read this one by position do not shift.
  assert.equal(TEMPLATES.get(MALE).name.includes('Male'), true);
  assert.equal(TEMPLATES.get(FEMALE).name.includes('Female'), true);
});

test('the body is an exposed choice on the Pawn, not a hidden constant', () => {
  [MALE, FEMALE].forEach(id => {
    const variable = graphOf(id).variables.find(item => item.binding === 'bodyType');
    assert.ok(variable, id + ' exposes the body');
    assert.equal(variable.ui, 'select');
    assert.deepEqual(variable.options.map(option => option.value).sort(), ['female', 'male']);
    assert.equal(variable.value, graphOf(id).characterPawn.bodyType);
  });
});

test('each body carries its own model, appearance and scene element', () => {
  [MALE, FEMALE].forEach(id => {
    const graph = graphOf(id), pawn = graph.characterPawn;
    assert.ok(pawn.model && pawn.model.src, id + ' has a model');
    assert.equal(pawn.model.kind, 'fbx');
    const element = graph.logicScene.elements.find(item => item.id === 'character_model');
    assert.ok(element && element.asset, 'the scene element carries the body too');
    assert.equal(element.asset.src, pawn.model.src, 'the Pawn and its visual agree on the body');
    assert.equal(element.linked, true);
  });
  const male = graphOf(MALE).characterPawn, female = graphOf(FEMALE).characterPawn;
  assert.notEqual(male.model.src, female.model.src);
  assert.notEqual(male.appearance.shirtColor, female.appearance.shirtColor,
    'the two bodies are distinguishable at a glance');
});

// ================================================================== 03 height

test('the per-body fit puts both mannequins at the same real height', () => {
  // Measured from the bundled files: male 180.473 tall with a 194.685 arm span,
  // female 180.923 both ways. `fit` normalises the LONGEST axis, so the fit has to
  // be scaled by longest/height or the wider body comes out shorter.
  const bounds = {male:{height:180.473, longest:194.685}, female:{height:180.923, longest:180.923}};
  Object.keys(bounds).forEach(id => {
    const body = PACK.BODY_TYPES[id], measured = bounds[id];
    const height = body.fit * measured.height / measured.longest;
    assert.ok(Math.abs(height - PACK.BODY_TARGET_HEIGHT) < .005,
      id + ' stands ' + height.toFixed(3) + ' m, expected ' + PACK.BODY_TARGET_HEIGHT);
  });
  assert.notEqual(PACK.BODY_TYPES.male.fit, PACK.BODY_TYPES.female.fit,
    'a shared fit is exactly the bug: it made one body shorter than the other');
});

// =================================================================== 04 slots

test('every action the runtime plays by name is authorable', () => {
  // The list the abilities and landing code actually calls playAction() with.
  const played = ['idle', 'walk', 'run', 'strafeLeft', 'strafeRight', 'jump', 'fall', 'land', 'landMoving', 'interact',
    'roll', 'slide', 'vault', 'mantle', 'climb', 'hang', 'landHeavy', 'landCrouch',
    'fireSingleIdle','fireSingleWalk','fireSingleRun','fireAutoIdle','fireAutoWalk','fireAutoRun'];
  const slots = PACK.ANIMATION_SLOTS.map(entry => entry[1]);
  played.forEach(slot => assert.ok(slots.includes(slot), 'no author-facing slot for playAction("' + slot + '")'));
  [MALE, FEMALE].forEach(id => {
    const bindings = graphOf(id).variables.filter(item => String(item.binding || '').indexOf('animations.') === 0)
      .map(item => item.binding.slice('animations.'.length));
    played.forEach(slot => assert.ok(bindings.includes(slot), id + ' cannot bind ' + slot));
  });
});

test('third-person traversal exposes synchronized roll distance and playback', () => {
  const graph=PACK.thirdPersonCombatGraph();
  const bindings=new Map(graph.variables.map(variable=>[variable.binding,variable]));
  assert.equal(bindings.get('abilities.slide.rollDistance').value,2.85);
  assert.equal(bindings.get('abilities.slide.rollPlaybackRate').value,1);
  assert.equal(graph.characterPawn.abilities.slide.rollDistance,2.85);
  assert.equal(graph.characterPawn.abilities.slide.rollPlaybackRate,1);
});

test('the bundled clips are bound by asset, because every take is called mixamo.com', () => {
  [MALE, FEMALE].forEach(id => {
    const animations = graphOf(id).characterPawn.animations;
    const bound = Object.keys(animations).filter(slot => animations[slot] && animations[slot].asset);
    // Locomotion plus the shared fall/roll/hard-landing actions.
    assert.ok(bound.length >= 9, id + ' binds the clips that exist, got ' + bound.length);
    bound.forEach(slot => {
      const asset = animations[slot].asset;
      assert.ok(asset.src && /\.fbx$/i.test(asset.src), slot + ' points at an FBX');
      assert.equal(asset.kind, 'fbx');
      assert.ok(asset.key, slot + ' has an asset key, which is what scopes the clip lookup');
    });
  });
});

test('the roll, fall and landing transitions are shared actions, and locomotion is not shared', () => {
  const male = graphOf(MALE).characterPawn.animations;
  const female = graphOf(FEMALE).characterPawn.animations;
  ['fall', 'roll', 'landMoving', 'landHeavy'].forEach(slot => {
    assert.equal(male[slot].asset.src, female[slot].asset.src, slot + ' is shared between the bodies');
    assert.ok(male[slot].asset.src.indexOf('models/characters/shared/') === 0, slot + ' lives in shared/');
  });
  ['idle', 'walk', 'run', 'strafeLeft', 'strafeRight', 'jump'].forEach(slot => {
    assert.notEqual(male[slot].asset.src, female[slot].asset.src, slot + ' is per body');
  });
  // The one that matters for the traversal work: a roll has a real clip now.
  assert.ok(/falling-to-roll\.fbx$/.test(male.roll.asset.src));
});

test('advanced traversal, melee and reaction clips are bundled in their exact slots', () => {
  const animations = graphOf(MALE).characterPawn.animations;
  const catalogue = global.LK_RUNTIME_CHARACTER_BODIES.motions('male');
  const advanced = ['slide','vault','mantle','climb','hang','climbUp','climbDown',
    'ledgeShimmyLeft','ledgeShimmyRight','punch','knifeAttack','hitReact'];
  advanced.forEach(slot=>{
    assert.ok(animations[slot]&&animations[slot].asset,slot+' must have its verified Advanced Animations FBX');
    assert.ok(catalogue[slot],slot+' must be discoverable in the motion catalogue');
  });
  assert.equal(animations.climbDown.asset.src,animations.climbUp.asset.src,'descent reuses the verified ascent source');
  assert.equal(animations.climbDown.asset.playbackRate,-1,'descent must play Climbing To Top in reverse');
  assert.equal(animations.climbUp.asset.playbackRate,undefined,'ascent keeps forward playback');
});

test('only landCrouch and interact remain honestly unbound', () => {
  const empty = ['landCrouch','interact'];
  const animations = graphOf(MALE).characterPawn.animations;
  const catalogue = global.LK_RUNTIME_CHARACTER_BODIES.motions('male');
  empty.forEach(slot => {
    assert.ok(!(animations[slot] && animations[slot].asset),
      slot + ' has no bundled clip and must stay unbound, not be given an approximation');
    assert.ok(!catalogue[slot], slot + ' must not be in the catalogue either');
  });
});

test('the two deaths are bound, shared, and fall the way their names claim', () => {
  // Six death takes ship and FOUR of them fall forward onto the face, so `death from
  // the front` and `death from the back` are the same outcome and cannot be a pair.
  // The one take in the pack that drops the body backward onto its back is the
  // headshot one, so that is the frontal death. Guarded by measurement rather than by
  // filename, because the filename is what was wrong.
  const BODIES = global.LK_RUNTIME_CHARACTER_BODIES;
  const male = BODIES.motions('male'), female = BODIES.motions('female');
  ['deathFront', 'deathBack'].forEach(slot => {
    assert.ok(male[slot] && male[slot].src, slot + ' is bound');
    assert.equal(male[slot].src, female[slot].src, slot + ' is shared between the bodies');
    assert.ok(male[slot].src.indexOf('models/characters/shared/') === 0, slot + ' lives in shared/');
  });
  assert.notEqual(male.deathFront.src, male.deathBack.src, 'a front and a back death are two clips');
  const {execFileSync} = require('node:child_process');
  const path = require('node:path');
  const output = execFileSync(process.execPath,
    ['scripts/measure-clip-direction.mjs', male.deathFront.src, male.deathBack.src],
    {cwd:path.join(__dirname, '..'), encoding:'utf8'});
  const line = name => output.split('\n').find(text => text.indexOf(name) >= 0) || '';
  // Hit from the front: the body goes BACKWARD and lands supine.
  assert.match(line('death-front.fbx'), /backward/,
    'a frontal death must fall away from the shot: ' + line('death-front.fbx'));
  // Hit from behind: it is pushed FORWARD and lands prone.
  assert.match(line('death-back.fbx'), /forward/,
    'a death from behind must fall away from the shot: ' + line('death-back.fbx'));
});

// =================================================================== 05 files

test('every asset the templates reference exists on disk', () => {
  const refs = new Set();
  [MALE, FEMALE].forEach(id => {
    const graph = graphOf(id), pawn = graph.characterPawn;
    refs.add(pawn.model.src);
    Object.keys(pawn.animations).forEach(slot => {
      const asset = pawn.animations[slot] && pawn.animations[slot].asset;
      if(asset && asset.src) refs.add(asset.src);
    });
    graph.logicScene.elements.forEach(element => { if(element.asset && element.asset.src) refs.add(element.asset.src); });
  });
  assert.ok(refs.size >= 14, 'the two bodies reference a real set of files, got ' + refs.size);
  refs.forEach(src => assert.ok(fs.existsSync(root(src)), 'missing bundled file: ' + src));
});

test('the provenance note ships with the bodies', () => {
  const note = root('models/characters/PROVENANCE.md');
  assert.ok(fs.existsSync(note));
  const text = fs.readFileSync(note, 'utf8');
  assert.match(text, /Mixamo/, 'the origin is stated');
  assert.match(text, /mixamo\.com/, 'the single-take naming is documented, because the binding depends on it');
});

// ================================================================ 06 shipping

test('the playable export collects FBX and treats bundled bodies as required', () => {
  const source = fs.readFileSync(root('js/editor/playable-export-zip.js'), 'utf8');
  // The walker gates on a file-extension list. The check reads the actual line
  // rather than trusting a comment: this is what stops an exported game from
  // shipping without its characters.
  const line = source.split('\n').find(text => text.indexOf('.test(node.trim())') >= 0);
  assert.ok(line, 'the asset walker still gates on a file extension');
  assert.ok(line.indexOf('fbx') >= 0,
    'FBX must be collectable or an exported game ships with no character: ' + line.trim());
  assert.ok(line.indexOf('glb') >= 0, 'and the existing formats are still collected');
  assert.match(source, /models\/characters\//,
    'the bundled bodies are marked required so a missing one is reported, not dropped');
  assert.match(source, /models\/characters\/PROVENANCE\.md/, 'the licence note travels with the export');
});

test('the editor lists bundled packs generically, not just the GLB one', () => {
  const source = fs.readFileSync(root('js/editor/asset-panel.js'), 'utf8');
  assert.match(source, /function bundledPacks\(/, 'the panel reads more than one bundled pack');
  assert.match(source, /LK_LOGIC_TEMPLATES_CHARACTER/, 'the character bodies are one of them');
  // Scoped to the listing itself. Elsewhere in the panel a `kind === 'glb'` test is
  // about scene entries and is none of this test's business.
  const from = source.indexOf('function bundledPacks');
  const to = source.indexOf('function levelItems');
  assert.ok(from > 0 && to > from, 'the bundled listing is still where it was');
  const listing = source.slice(from, to);
  assert.ok(!/kind === 'glb'/.test(listing),
    'the bundled listing must not hard-wire GLB, or an FBX body never appears');
  assert.match(listing, /asset\.kind/, 'it reads each asset own format instead');
  assert.match(listing, /motionAssets/, 'motion-only Character FBX files are visible as Engine Assets too');
});

test('the public motion catalogue includes the versioned ordinary landing', () => {
  const motions = PACK.motionAssets();
  const landing = Object.values(motions).find(asset => /run-to-stop\.fbx$/.test(asset.src));
  assert.ok(landing, 'Run To Stop is discoverable outside the nested Pawn config');
  assert.equal(landing.assetRole, 'animation');
  assert.ok(fs.existsSync(root(landing.src)), 'the discoverable asset is in the versioned/exported tree');
  const moving = Object.values(motions).find(asset => /falling-to-landing\.fbx$/.test(asset.src));
  assert.ok(moving, 'the Soccer Falling To Landing transition is discoverable too');
  assert.ok(fs.existsSync(root(moving.src)));
});

console.log('\ndefault character body tests passed');

// ============================================ every registered clip must PARSE

// The files THREE.FBXLoader rejects with "Unknown property type". They are readable
// as far as the filesystem is concerned - each one carries a valid binary FBX header
// - so nothing short of a real parse tells them apart from a good take. Recorded here
// because they stay on disk: they are the reason this section exists.
const UNREADABLE = ['jumping-up.fbx', 'stand-to-cover-low.fbx', 'cover-to-stand-a.fbx',
  'idle-alt-2.fbx'];

/** Every distinct file the catalogue binds, in `models/...` form.
 *
 *  The body ids come from `BODIES.BODIES`, and the name matters: this walk used to
 *  read `BODIES.BODY_TYPES` - which the runtime module does not export - behind a
 *  `|| {'mannequin-male':1, 'mannequin-female':1}` fallback. Neither of those is a
 *  body id, `resolveOrDefault` answered both with the male body, and the check ran
 *  twice over the male clips while never once looking at the female ones. */
function registeredSources(){
  const BODIES = global.LK_RUNTIME_CHARACTER_BODIES;
  const seen = new Set();
  Object.keys(BODIES.BODIES).forEach(bodyId => {
    const motions = BODIES.motions(bodyId);
    Object.keys(motions).forEach(slot => {
      const asset = motions[slot];
      if(asset && asset.src) seen.add(asset.src);
    });
  });
  return Array.from(seen);
}

test('every clip the catalogue registers can actually be parsed', () => {
  // A file that cannot be parsed does not cost you one animation, it costs you ALL of
  // them: it goes into the animation library's load list, the library never completes,
  // `bind()` never succeeds and the character stands still. Three such files shipped
  // in models/characters/shared, were harmless while unreferenced, and emptied a
  // brand-new level the moment they were registered.
  //
  // This used to assert on the FBX header and on a list of the three known bad names,
  // which is the one thing that cannot catch the NEXT bad file: all four of them have
  // a perfectly good header, and a name list only knows what already went wrong. So
  // the check now PARSES every registered take, through the same loader the runtime
  // uses, by running the measuring script the import workflow already depends on.
  const {execFileSync} = require('node:child_process');
  const path = require('node:path');
  const repo = path.join(__dirname, '..');
  const sources = registeredSources();
  assert.ok(sources.length >= 30, 'the catalogue should be registering the full set, not a handful');
  const output = execFileSync(process.execPath,
    ['scripts/measure-clip-direction.mjs'].concat(sources), {cwd:repo, encoding:'utf8'});
  // The script reports a failure as a line rather than a throw, so that measuring a
  // whole directory does not stop at the first bad file. Both halves matter: a file it
  // could not read, and a file it never mentioned (a silent skip would pass).
  const broken = output.split('\n').filter(line => /could not be parsed|no clips/.test(line));
  assert.deepEqual(broken, [], 'registered takes THREE.FBXLoader cannot use:\n' + broken.join('\n'));
  sources.forEach(src => assert.ok(output.indexOf(path.basename(src)) >= 0,
    src + ' was never measured, so nothing here proves it loads'));
});

test('the takes FBXLoader cannot read stay out of the catalogue', () => {
  // Belt and braces beside the parse above, and the place the four names are written
  // down. The parse is the guard; this says WHICH files taught us to have one.
  const fs = require('node:fs');
  const path = require('node:path');
  registeredSources().forEach(src => {
    assert.ok(!UNREADABLE.includes(path.basename(src)),
      path.basename(src) + ' is one of the takes THREE.FBXLoader cannot read; '
      + 'registering it empties every animation on the character');
    const file = path.join(__dirname, '..', src);
    assert.ok(fs.existsSync(file), src + ' is registered but not on disk');
  });
  // And they are still on disk, unreferenced: deleting them would lose the example,
  // and re-exports live in the source zip rather than on top of these names.
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'models/characters/shared/jumping-up.fbx')));
});

test('low cover has its own entry pose, from the readable re-export', () => {
  // character-combat-cover.js classifies cover as low or high; only high could be
  // bound while the low take was one of the unreadable files. The Action Adventure
  // Pack zip in models_sources turned out to hold a second, readable export of it.
  const motions = global.LK_RUNTIME_CHARACTER_BODIES.motions('male');
  assert.match(motions.coverLow.src, /cover-low-enter\.fbx$/);
  assert.notEqual(motions.coverLow.src, motions.coverHigh.src, 'low and high are different poses');
  assert.ok(!/stand-to-cover-low/.test(motions.coverLow.src),
    'it must not be given the name of the file that cannot be read');
});

test('every sneak take travels the way its name claims', () => {
  // Both sneak pairs came out of Mixamo named the wrong way round - the "left" file
  // moved the hips to the body's own RIGHT - while the crouch WALK pair beside them
  // was honest. They were renamed to their measured direction on import. Measured
  // values, from scripts/measure-clip-direction.mjs; dx > 0 is the body's own left.
  const motions = global.LK_RUNTIME_CHARACTER_BODIES.motions('male');
  assert.match(motions.crouchSneakLeft.src, /crouch-sneak-left\.fbx$/);
  assert.match(motions.coverSneakLeft.src, /cover-sneak-left\.fbx$/);
  const {execFileSync} = require('node:child_process');
  const path = require('node:path');
  const files = ['crouchSneakLeft', 'crouchSneakRight', 'coverSneakLeft', 'coverSneakRight',
    'crouchWalkLeft', 'crouchWalkRight'].map(slot => motions[slot].src);
  const output = execFileSync(process.execPath,
    ['scripts/measure-clip-direction.mjs'].concat(files),
    {cwd:path.join(__dirname, '..'), encoding:'utf8'});
  output.split('\n').filter(Boolean).forEach(line => {
    const file = line.split('|')[0].trim();
    if(/-left\.fbx$/.test(file)) assert.match(line, /-> LEFT/, file + ' must travel to the body own left: ' + line);
    if(/-right\.fbx$/.test(file)) assert.match(line, /-> RIGHT/, file + ' must travel to the body own right: ' + line);
  });
});
