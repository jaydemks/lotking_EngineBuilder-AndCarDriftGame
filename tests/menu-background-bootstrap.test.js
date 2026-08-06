'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const manifest=JSON.parse(read('demo/menu-roles.json'));
const editorRef=manifest.levels.find(level=>level&&level.role==='editor-menu');
assert.ok(editorRef,'the landing has a dedicated editor-menu sidecar');
assert.ok(fs.existsSync(editorRef.sidecar),editorRef.sidecar+' is missing');
const sidecar=JSON.parse(read(editorRef.sidecar));
assert.equal(sidecar.meta&&sidecar.meta.levelRole,'editor-menu');
assert.ok(fs.statSync(editorRef.sidecar).size<7*1024*1024,'the role menu must stay lightweight while retaining its decorative player GLB');
const sidecarScene=sidecar.scene||sidecar;
assert.ok(sidecarScene.player&&sidecarScene.player.modelSrc,'a disabled but visible ROLE player must retain its authored model');
assert.equal(sidecarScene.player&&sidecarScene.player.menuDecorativeVisible,true,'the sidecar marks the disabled player as a decorative menu visual');

const store=read('js/engine/scene-store.js');
assert.ok(store.includes('loadBundledFullDemoProject({memoryOnly:true}).then(project => project || loadBundledMenuPreviewProject())'),
  'the landing must use the complete exported DEMO, with the sidecar only as fallback');
assert.ok(store.includes('if(!opts.memoryOnly)await installBundledDemoProject'),
  'the landing DEMO must remain in memory and never overwrite the author Local Workspace');
assert.match(store,/return !!project && isMenuLevelRole\(role\)/,
  'an orphan menu index entry cannot suppress the bundled fallback');
assert.ok(store.includes('{strict:true, menuBackground:true}'),
  'ROLE application must preserve a disabled decorative player without enabling gameplay');

const runtime=read('js/lot-king.js');
const index=read('index.html');
assert.ok(!runtime.includes("setMenuProgress(46, 'loading menu background')"),
  'real download steps must not be hidden behind an artificial 46% jump');
assert.ok(runtime.includes('releaseRendererContext,'),'the menu runtime exposes deterministic GPU teardown');
assert.ok(index.includes('childRuntime.actions.releaseRendererContext()'),
  'the landing releases the menu WebGL context before opening another runtime');
assert.ok(index.includes("targetFrame.src = 'about:blank'"),
  'the old iframe document is navigated away before another renderer is created');
assert.ok(index.includes('stopMenuBackground().then(function(){'),
  'Editor and Play wait for the menu iframe handoff');
const editorReveal=index.indexOf("document.body.classList.add('showing-editor')",index.indexOf('function openEditor()'));
const editorNavigate=index.indexOf("editorFrame.src = 'engine_editor.html'",index.indexOf('function preloadEditor()'));
assert.ok(editorReveal>=0&&editorNavigate>=0,
  'the Editor shell becomes visible during startup rather than after every module has loaded');
assert.ok(!index.includes("window.addEventListener('storage'"),
  'authoring DB writes cannot reload and exhaust the active landing renderer');
assert.doesNotMatch(runtime,/renderer\.forceContextLoss\s*\(/,
  'normal iframe handoff must not manufacture a WebGL context-lost event');

const backend=read('js/runtime/rendering-backend.js');
assert.ok(backend.includes("const menuPreview=typeof window!=='undefined'&&!!window.__LK_MENU_PREVIEW"),
  'the short-lived landing preview has an explicit renderer policy');
assert.ok(backend.includes("const wanted=menuPreview?'webgl':preference()"),
  'the landing preview cannot allocate a failed WebGPU provider plus WebGL fallback');

console.log('menu-background-bootstrap.test.js: all assertions passed');
