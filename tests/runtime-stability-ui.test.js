const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');
const benchmark = read('js/runtime/pre-benchmark.js');
const physics = read('js/runtime/physics-world.js');
const flow = read('js/runtime/game-flow.js');
const runner = read('js/runtime/logic-elements-runner.js');
const vehicle = read('js/runtime/vehicle-pawns.js');
const loader = read('js/runtime/runtime-loader.js');
const radar = read('js/runtime/vehicle-radar.js');
const hudInspector = read('js/editor/hud-inspector.js');
const store = read('js/engine/scene-store.js');
const uvEditor = read('js/editor/uv-editor.js');
const meshEditor = read('js/editor/mesh-editor.js');
const developerDebugger = read('js/editor/developer-debugger.js');
const developerDebuggerWorker = read('js/editor/developer-debugger-worker.js');
const editorHtml = read('engine_editor.html');
const editor = read('js/editor/editor.js');
const visualHelpers = read('js/editor/visual-helpers.js');
const thumbnails = read('js/editor/thumbnail-manager.js');
const materialEditor = read('js/editor/material-editor.js');
const assetImports = read('js/editor/asset-imports.js');
const lotKing = read('js/lot-king.js');

assert.match(benchmark, /Touring strategic map sectors/,
  'pre-benchmark visits distant map sectors before play');
assert.match(benchmark, /uploadTextures\(textures, gameplayWarmup \? textures\.length/,
  'slow profiles no longer defer most texture uploads into gameplay');
assert.match(physics, /state\.staticsSignature === nextSignature/,
  'unchanged static physics cannot be rebuilt twice at the play boundary');
assert.match(flow, /call\('primeAudio'\)/,
  'WebAudio and procedural buffers are primed in the Play user gesture');
assert.match(runner, /async function prewarm\(context\)/,
  'Logic Elements expose a pre-play Pawn preparation stage');
assert.match(vehicle, /pawn\.prepareRuntime = function/,
  'Logic vehicles materialise physics, wheel rig, widgets and audio before input');
assert.match(loader, /const requestedMode = mode \|\| 'game'/,
  'each runtime preparation request captures its own immutable mode');
assert.match(loader, /requestedMode === 'editor'[\s\S]{0,80}return null/,
  'editor bootstrap does not wait for the gameplay-only benchmark');
assert.doesNotMatch(editor, /visualHelpers\.refreshSelectionHelpers\(\);\s*visualHelpers\.rebuildColliderHelpers\(\)/,
  'ordinary selection changes do not rebuild every collider helper');
assert.match(visualHelpers, /if\(ED\.showCollisionDummies !== true\) return;/,
  'hidden collision previews cannot trigger a full scene collider traversal');
assert.match(thumbnails, /assetBytes > 8 \* 1024 \* 1024 \|\| assetMeshes > 32/,
  'automatic GLB thumbnails are limited to models proven safe for main-thread parsing');
assert.match(materialEditor, /storeMaterialTextureFile\(f\)/,
  'material map drops are persisted through the asset database');
assert.doesNotMatch(materialEditor, /readFileAsDataURL\(f\)/,
  'base, normal and roughness maps cannot be embedded as data URLs in scene LocalStorage');
assert.match(assetImports, /function storeMaterialTextureFile[\s\S]*LK_ASSET_BLOBS\.put\(dbKey, file\)/,
  'material texture files are written directly to IndexedDB');

assert.match(radar, /Canvas 2D overlay sourced from the live collider world/,
  'vehicle radar is a lightweight collider-driven overlay');
assert.match(radar, /left:0,\s*top:0,/,
  'vehicle radar defaults to the safe top-left corner');
assert.match(radar, /legacyDefaultLayout/,
  'the previous untouched 2.2/18 layout migrates without overwriting custom positions');
assert.match(radar, /projectedX = -finite\(dx,\s*0\) \* cos \+ finite\(dz,\s*0\) \* sin/,
  'vehicle radar respects the engine convention where driver-right is world -X at heading zero');
assert.ok(radar.includes('ctx.rotate(yaw - finite(col.rotY, finite(col.rot, 0)));'),
  'vehicle radar obstacle headings follow the corrected projection');
assert.match(radar, /function headingFromQuaternion[\s\S]*forwardX[\s\S]*forwardZ/,
  'vehicle radar derives heading from the full pitched and rolled chassis quaternion');
assert.match(hudInspector, /VEHICLE RADAR \/ MINIMAP/,
  'level UI Inspector exposes the vehicle radar');
assert.match(hudInspector, /Snap to top-left|Porta in alto a sinistra/,
  'the editable radar layout includes a top-left shortcut');
assert.match(store, /data\.ui\.vehicleRadar/,
  'radar settings restore with the level');
assert.match(store, /d\.ui\.vehicleRadar/,
  'radar settings save with the level');

assert.match(store, /uvMappings/,
  'mesh edit persistence includes compact procedural UV mappings');
assert.match(store, /function applyUvMapping/,
  'saved UV mappings are rebuilt on imported geometry');
assert.match(uvEditor, /Smart Atlas/,
  'UV Lab exposes Smart Atlas mapping');
assert.match(uvEditor, /planar-y[\s\S]*spherical[\s\S]*cylindrical|spherical[\s\S]*cylindrical[\s\S]*planar-y/,
  'UV Lab includes planar, spherical and cylindrical projections');
assert.match(meshEditor, /uvEditor\.build/,
  'UV Lab is attached to selected GLB mesh parts');
assert.match(editorHtml, /js\/editor\/uv-editor\.js/,
  'the editor loads UV Lab before the mesh editor');
assert.doesNotMatch(developerDebugger, /setFromObject\(/,
  'automatic debugger telemetry never performs an uninterruptible recursive bounds scan');
assert.match(developerDebugger, /processed<24&&performance\.now\(\)-started<1\.75/,
  'debugger scene capture yields at a strict sub-frame node budget');
assert.match(developerDebugger, /reportMode\(\)==='editor'&&time-lastAudit>30000/,
  'deep debugger audits do not run periodically during Play or Simulate');
assert.match(developerDebugger, /runWorkerTask\('aggregate'/,
  'debugger resource aggregation runs outside the main thread');
assert.match(developerDebugger, /runWorkerTask\('write-log'/,
  'debugger autolog serialization and transport run outside the main thread');
assert.match(developerDebuggerWorker, /self\.onmessage=async[\s\S]*aggregate[\s\S]*write-log/,
  'the dedicated debugger worker supports aggregation and local autolog writes');
assert.doesNotMatch(lotKing, /let look = new THREE\.Vector3|const behind = camFocus\.clone|wheelSuspVis\.map/,
  'the camera and vehicle suspension hot paths do not allocate Three.js objects or arrays every frame');
assert.doesNotMatch(lotKing, /position:P\.pos\.clone\(\)|\.map\(\(rig, i\) => \(\{rig/,
  'Logic camera snapshots and active skid enumeration reuse stable frame storage');
assert.match(lotKing, /const DRIVE_FRAME_TMP = \{[\s\S]*fwd: new THREE\.Vector3\(\)[\s\S]*right: new THREE\.Vector3\(\)/,
  'native vehicle physics reuses its body-space vector basis');

console.log('runtime-stability-ui.test.js: all assertions passed');
