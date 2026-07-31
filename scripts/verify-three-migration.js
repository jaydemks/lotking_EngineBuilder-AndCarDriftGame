'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const packageJson = JSON.parse(read('package.json'));

assert.equal(packageJson.dependencies && packageJson.dependencies.three, '0.185.1', 'Three.js must stay pinned to 0.185.1');
assert.equal(packageJson.dependencies && packageJson.dependencies.cannon, '0.6.2', 'Cannon must remain pinned to the existing physics version');
assert.equal(packageJson.dependencies && packageJson.dependencies.jszip, '3.10.1', 'JSZip must stay pinned for reproducible playable exports');
assert.equal(packageJson.dependencies && packageJson.dependencies['three-gpu-pathtracer'], '0.0.24', 'path tracer must stay pinned in the reproducible shared Three.js bundle');
assert.equal(packageJson.devDependencies && packageJson.devDependencies.esbuild, '0.28.1', 'esbuild must stay pinned for reproducible output');
assert.ok(exists('vendor/three-r185-compat.min.js'), 'generated Three.js browser bundle is missing');
assert.ok(fs.statSync(path.join(root, 'vendor/three-r185-compat.min.js')).size > 500000, 'Three.js browser bundle is unexpectedly small');
assert.ok(exists('vendor/helvetiker_regular.typeface.json'), 'local TextGeometry font is missing');
assert.ok(exists('vendor/cannon-0.6.2.min.js'), 'local Cannon compatibility runtime is missing');
assert.ok(exists('vendor/jszip-3.10.1.min.js'), 'local JSZip exporter runtime is missing');
assert.ok(exists('vendor/THIRD_PARTY_LICENSES.md'), 'third-party license notices are missing');

['engine_editor.html', 'gameplay.html', 'test-editor.html'].forEach(file => {
  const source = read(file);
  assert.match(source, /vendor\/three-r185-compat\.min\.js\?v=0\.185\.1-lk6/, `${file} does not load the pinned bundle`);
});
['engine_editor.html', 'gameplay.html'].forEach(file => {
  assert.match(read(file), /vendor\/cannon-0\.6\.2\.min\.js\?v=0\.6\.2-lk1/, `${file} does not load local Cannon`);
});
const assertVersionedScript = (file, script) => {
  const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(read(file), new RegExp(escaped + "\\?v=[^\"']+"), `${file} is missing a cache key for ${script}`);
};
[
  'js/runtime/post.js',
  'js/runtime/path-tracing-renderer.js',
  'js/runtime/settings-menu.js',
  'js/runtime/rendering-backend.js',
  'js/runtime/runtime-loader.js',
  'js/lot-king.js',
  'js/runtime/sky.js',
  'js/engine/scene-store.js',
  'js/runtime/player-light-rig.js',
  'js/runtime/player-model.js',
  'js/logic/logic-graph.js',
  'js/logic/logic-templates.js',
].forEach(script => {
  ['engine_editor.html', 'gameplay.html', 'test-editor.html'].forEach(file => assertVersionedScript(file, script));
});
['engine_editor.html', 'test-editor.html'].forEach(file => assertVersionedScript(file, 'js/editor/rendering-inspector.js'));
['engine_editor.html', 'test-editor.html'].forEach(file => assertVersionedScript(file, 'js/editor/pawn-studio.js'));
['engine_editor.html', 'gameplay.html'].forEach(file => assertVersionedScript(file, 'js/runtime/vehicle-pawns.js'));

const scanFiles = [
  'engine_editor.html',
  'gameplay.html',
  'test-editor.html',
  'js/lot-king.js',
  'js/engine/scene-store.js',
  'js/runtime/player-light-rig.js',
  'js/runtime/world-generation.js',
  'js/runtime/player-data-widgets.js',
  'js/runtime/soccer-ball.js',
  'js/runtime/sky.js',
  'js/editor/loader.js',
  'js/editor/thumbnail-manager.js',
  'js/editor/playable-export-zip.js',
];
function sourceFiles(directory){
  const absolute=path.join(root,directory),result=[];
  fs.readdirSync(absolute,{withFileTypes:true}).forEach(entry=>{
    const relative=path.join(directory,entry.name).replace(/\\/g,'/');
    if(entry.isDirectory())result.push(...sourceFiles(relative));
    else if(entry.isFile()&&/\.(?:js|html)$/.test(entry.name)&&!/\.min\.js$/.test(entry.name))result.push(relative);
  });
  return result;
}
const auditedFiles=Array.from(new Set(scanFiles.concat(sourceFiles('js'),['engine_editor.html','gameplay.html','test-editor.html'])));
const joined = auditedFiles.map(file => `\n/* ${file} */\n${read(file)}`).join('');
[
  [/three(?:\.js)?\/r128|three@0\.128\.0|three\.js\/r128/i, 'r128 URL'],
  [/examples\/js\//, 'removed examples/js addon'],
  [/\.outputEncoding\b/, 'removed WebGLRenderer.outputEncoding'],
  [/\.encoding\s*=\s*THREE\./, 'removed Texture.encoding assignment'],
  [/THREE\.sRGBEncoding\b/, 'removed sRGBEncoding constant'],
  [/THREE\.PCFSoftShadowMap\b/, 'deprecated PCFSoftShadowMap constant'],
  [/\b(?:THREE\.)?Clock\s*\(/, 'deprecated Clock constructor (use Timer.update before getDelta)'],
  [/\btruncateDrawRange\s*:/, 'removed GLTFExporter truncateDrawRange option'],
  [/DRACOLoader\s*\.\s*setDecoderConfig\b/, 'deprecated DRACOLoader.setDecoderConfig'],
].forEach(([pattern, label]) => assert.doesNotMatch(joined, pattern, label));
assert.doesNotMatch(read('js/runtime/runtime-loader.js'), /trackedModel\(['"]player['"]/, 'retired player model fallback must not be requested');

const exportSource = read('js/editor/playable-export-zip.js');
assert.match(exportSource, /source:'vendor\/three-r185-compat\.min\.js'/, 'playable export must package local r185 bundle');
assert.doesNotMatch(exportSource, /source:'vendor\/path-tracing-r185\.min\.js'/, 'playable export must not package a second Three.js module graph');
assert.match(exportSource, /source:'vendor\/helvetiker_regular\.typeface\.json'/, 'playable export must package local text font');
assert.match(exportSource, /source:'vendor\/THIRD_PARTY_LICENSES\.md'/, 'playable export must package third-party notices');
assert.doesNotMatch(exportSource, /GLTFLoader\.js|EffectComposer\.js|BokehPass\.js/, 'playable export still packages split legacy addons');
assert.match(exportSource, /vendor\/jszip-3\.10\.1\.min\.js/, 'editor exporter must load local JSZip');

const threeEntry = read('js/vendor/three-r185-compat.entry.js');
assert.match(threeEntry, /FBXLoader/, 'Three.js compatibility bundle must expose FBXLoader for the importer plugin');
assert.match(threeEntry, /TGALoader/, 'Three.js compatibility bundle must expose TGALoader for common FBX textures');
assert.match(threeEntry, /GLTFExporter/, 'Three.js compatibility bundle must expose GLTFExporter for browser conversion');
assert.match(threeEntry, /GTAOPass/, 'Three.js compatibility bundle must expose r185 GTAO for the stable WebGL pipeline');
assert.match(threeEntry, /WebGLPathTracer/, 'path tracing must share the primary Three.js module graph');
assert.ok(exists('js/runtime/rendering-backend.js'), 'central rendering backend service is missing');
const fbxPlugin = read('js/plugins/fbx-import-plugin.js');
assert.match(fbxPlugin, /enabledByDefault:true/, 'FBX importer plugin must be enabled by default');
assert.match(fbxPlugin, /api\.assetImporter\('fbx'/, 'FBX plugin must use the public assetImporter extension point');

console.log('Three.js migration verification passed: pinned r185 bundle, modern APIs and offline export assets.');
