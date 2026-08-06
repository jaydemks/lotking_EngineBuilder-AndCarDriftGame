'use strict';

/* =========================================================
   Every camera preview can have its own shape, and one master can force them all.

   Reported as "when I go through any camera the aspect ratio does not change any
   more, I always see the same 16:9 preview". The PIP read
   `GAME.player.cameraAspectValue()` - the PLAYER camera's ratio - for WHICHEVER
   camera was selected, so a scene camera could never show its own shape. Scene
   cameras did not even have an aspect field to honour, and the same mapping existed
   three times (editor-runtime, floating-layout, player-camera), free to disagree.

   The precedence is deliberately different in the editor and in the game:

     EDITOR   master -> camera -> level -> viewport
     GAME     mobile -> level -> viewport

   In play there is no author to frame a shot, so the level's default answers and a
   per-camera choice does not get to fight it; a phone is forced to 9:16.

   HOW THIS FILE IS ORGANISED
     01 harness    the policy module
     02 table      named ratios, and what `auto` means
     03 editor     the authoring precedence
     04 game       the play precedence, including the phone
     05 rect       letterboxing
     06 wiring     the three old copies are gone and the field exists
   ========================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// ================================================================= 01 harness

global.window = global;
require('../js/runtime/aspect-policy.js');
const POLICY = global.LK_ASPECT_POLICY;
const root = file => path.join(__dirname, '..', file);
const source = file => fs.readFileSync(root(file), 'utf8');

function test(name, run){
  try { run(); console.log('ok - ' + name); }
  catch(error){ console.error('not ok - ' + name); throw error; }
}
const near = (value, expected, message) => assert.ok(Math.abs(value - expected) < 1e-9,
  message + ' (got ' + value + ', expected ' + expected + ')');

// =================================================================== 02 table

test('the named ratios are one table, and auto means no opinion', () => {
  near(POLICY.ratioOf('16:9'), 16 / 9, '16:9');
  near(POLICY.ratioOf('21:9'), 21 / 9, '21:9');
  near(POLICY.ratioOf('2.39:1'), 2.39, 'the scope ratio');
  near(POLICY.ratioOf('4:3'), 4 / 3, '4:3');
  near(POLICY.ratioOf('1:1'), 1, 'square');
  near(POLICY.ratioOf('9:16'), 9 / 16, 'portrait');
  assert.equal(POLICY.ratioOf('auto'), null, 'auto carries no number, so it can fall through');
  assert.equal(POLICY.ratioOf('nonsense'), null, 'an unknown name is not silently a ratio');
  assert.equal(POLICY.isNamed('auto'), false);
  assert.equal(POLICY.isNamed('16:9'), true);
  assert.ok(POLICY.OPTIONS.length >= 7, 'the inspector select is built from the same table');
});

// ================================================================== 03 editor

test('a camera own aspect is used, which is the whole bug', () => {
  const resolved = POLICY.resolve({mode:'editor', authored:'4:3', level:'16:9', width:1920, height:1080});
  near(resolved.ratio, 4 / 3, 'the SELECTED camera decides');
  assert.equal(resolved.source, 'camera');
});

test('the master override wins over every camera while framing', () => {
  const resolved = POLICY.resolve({mode:'editor', master:'2.39:1', authored:'4:3', level:'16:9', width:1920, height:1080});
  near(resolved.ratio, 2.39, 'the master is above the camera');
  assert.equal(resolved.source, 'master');
  // And turning it off gives each camera its own back, rather than sticking.
  const off = POLICY.resolve({mode:'editor', master:'auto', authored:'4:3', level:'16:9', width:1920, height:1080});
  near(off.ratio, 4 / 3, 'auto releases the override');
  assert.equal(off.source, 'camera');
});

test('a camera with no opinion falls through to the level, then the viewport', () => {
  const toLevel = POLICY.resolve({mode:'editor', authored:'auto', level:'21:9', width:1920, height:1080});
  near(toLevel.ratio, 21 / 9, 'the level default answers');
  assert.equal(toLevel.source, 'level');
  const toViewport = POLICY.resolve({mode:'editor', authored:'auto', level:'auto', width:1600, height:1000});
  near(toViewport.ratio, 1.6, 'nothing has an opinion, so the view fills');
  assert.equal(toViewport.source, 'viewport');
  assert.equal(toViewport.scoped, false, 'and nothing is letterboxed');
});

// ==================================================================== 04 game

test('in play the level default decides, not the camera', () => {
  const resolved = POLICY.resolve({mode:'game', authored:'1:1', level:'21:9', width:1920, height:1080, mobile:false});
  near(resolved.ratio, 21 / 9, 'the level wins in play');
  assert.equal(resolved.source, 'level');
});

test('in play the master override is ignored - it is an authoring aid', () => {
  const resolved = POLICY.resolve({mode:'game', master:'1:1', level:'16:9', width:1920, height:1080, mobile:false});
  near(resolved.ratio, 16 / 9, 'the editor override must not leak into the game');
  assert.equal(resolved.source, 'level');
});

test('a phone is forced to 9:16 whatever the level says', () => {
  const resolved = POLICY.resolve({mode:'game', level:'21:9', width:1920, height:1080, mobile:true});
  near(resolved.ratio, 9 / 16, 'portrait is forced');
  assert.equal(resolved.source, 'mobile');
  assert.equal(resolved.scoped, true);
  // Detected from the viewport when not stated: a narrow view is a phone.
  const detected = POLICY.resolve({mode:'game', level:'21:9', width:420, height:900});
  assert.equal(detected.source, 'mobile', 'a 420 px viewport is a phone without being told');
});

test('a level with no default fills the screen in play', () => {
  const resolved = POLICY.resolve({mode:'game', level:'auto', width:1920, height:1080, mobile:false});
  near(resolved.ratio, 1920 / 1080, 'the viewport answers');
  assert.equal(resolved.scoped, false);
});

// ==================================================================== 05 rect

test('a chosen shape is centred and letterboxed on the spare axis', () => {
  const wide = POLICY.fitRect(POLICY.resolve({mode:'editor', authored:'1:1', width:1920, height:1080}), 1920, 1080);
  assert.equal(wide.w, 1080, 'a square inside a wide box is limited by height');
  assert.equal(wide.h, 1080);
  assert.equal(wide.x, Math.round((1920 - 1080) / 2), 'centred horizontally');
  assert.equal(wide.y, 0);

  const tall = POLICY.fitRect(POLICY.resolve({mode:'editor', authored:'21:9', width:1000, height:1000}), 1000, 1000);
  assert.equal(tall.w, 1000, 'a wide shape inside a square is limited by width');
  assert.ok(tall.h < 1000 && tall.y > 0, 'and gets bars top and bottom');
});

test('a view with no opinion fills the box rather than cropping', () => {
  const rect = POLICY.fitRect(POLICY.resolve({mode:'editor', authored:'auto', level:'auto', width:1280, height:720}), 1280, 720);
  assert.deepEqual([rect.x, rect.y, rect.w, rect.h], [0, 0, 1280, 720]);
  assert.equal(rect.scoped, false);
});

// ================================================================== 06 wiring

test('the PIP asks for the selected camera aspect, not the player camera', () => {
  const runtime = source('js/editor/editor-runtime.js');
  assert.match(runtime, /editorPreviewAspect\(selectedCameraHolder, selectedPlayerCamera\)/,
    'the PIP resolves from the selection');
  const pip = runtime.slice(runtime.indexOf('function editorPreviewAspect'), runtime.indexOf('function cinemaFloatAspect'));
  assert.match(pip, /cameraProps/, 'it reads the scene camera own props');
  // The exact ASSIGNMENT that caused the bug must not come back. Matching the bare
  // name would also match the comment that explains it, which is not the same thing.
  assert.ok(!/const aspect = GAME\.player\.cameraAspectValue/.test(runtime),
    'the PIP must not take its shape from the PLAYER camera for an arbitrary selection again');
});

test('the three duplicated aspect mappings are gone', () => {
  // Each of these files used to map the same select with its own ternary chain.
  const layout = source('js/editor/floating-layout.js');
  assert.match(layout, /LK_ASPECT_POLICY/, 'the resize handle defers to the policy');
  assert.ok(!/=== '21:9' \? 21 \/ 9/.test(layout), 'its ternary chain is gone');
  const runtime = source('js/editor/editor-runtime.js');
  assert.ok(!/if\(spec === '21:9'\) return 21 \/ 9/.test(runtime), 'the cinema chain is gone');
  const camera = source('js/runtime/player-camera.js');
  assert.match(camera, /LK_ASPECT_POLICY/, 'the game camera defers to it too');
});

test('a scene camera has an aspect field to honour', () => {
  const store = source('js/engine/scene-store.js');
  const props = store.slice(store.indexOf('function normalizeCameraProps'), store.indexOf('function createCameraHelperMesh'));
  assert.match(props, /aspect:'auto'/, 'defaulting to auto, so existing levels are unchanged');
  const inspector = source('js/editor/object-inspector.js');
  assert.match(inspector, /Aspect ratio/, 'and the author can set it');
});

test('the master override exists, is editor-only and defaults to off', () => {
  assert.match(source('js/editor/editor-core.js'), /masterPreviewAspect: 'auto'/, 'off by default');
  assert.match(source('js/editor/editor-template.js'), /id="lkMasterAspect"/, 'it has a control');
  assert.match(source('js/editor/toolbar.js'), /ED\.masterPreviewAspect = masterAspect\.value/, 'wired to the state');
  // It must never reach a saved level or the game.
  assert.ok(!/masterPreviewAspect/.test(source('js/runtime/player-camera.js')),
    'the game camera must not know about the editor override');
  assert.ok(!/masterPreviewAspect/.test(source('js/engine/scene-store.js')),
    'and it must never be serialised into a level');
});

console.log('\naspect policy tests passed');
