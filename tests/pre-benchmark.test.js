const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'pre-benchmark.js'), 'utf8');
const gameFlowSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'game-flow.js'), 'utf8');
const lotKingSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'lot-king.js'), 'utf8');
const pathTracingSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'path-tracing-renderer.js'), 'utf8');
const renderingInspectorSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'editor', 'rendering-inspector.js'), 'utf8');
const editorRuntimeSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'editor', 'editor-runtime.js'), 'utf8');
const engineAudioSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'engine-audio.js'), 'utf8');
const vehiclePawnsSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'vehicle-pawns.js'), 'utf8');
const characterPawnSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'character-pawn-base.js'), 'utf8');
const occupancySource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'vehicle-occupancy.js'), 'utf8');
const sketchbookSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'sketchbook-pawns.js'), 'utf8');
const vehicleAudioSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'vehicle-engine-audio.js'), 'utf8');
const vehicleDamageSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'vehicle-damage.js'), 'utf8');
const logicRunnerSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'logic-elements-runner.js'), 'utf8');
const sandbox = {window:{}, console};
vm.runInNewContext(source, sandbox, {filename:'pre-benchmark.js'});
const api = sandbox.window.LK_RUNTIME_PRE_BENCHMARK;

assert(api && typeof api.create === 'function', 'pre-benchmark factory is registered');
assert(api.shouldUseLowProfile(24.9, 25) === true, 'a sustained sample below 25 FPS selects Low');
assert(api.shouldUseLowProfile(25, 25) === false, 'the 25 FPS boundary does not select Low');
assert(api.shouldUseLowProfile(60, 25) === false, 'healthy frame rates keep the authored video profile');
assert(api.shouldUseLowProfile(null, 25) === false, 'missing or background-tab samples do not select Low');
assert(source.includes('Preparing hidden objects'), 'benchmark exercises hidden object paths');
assert(source.includes('Exercising lights and colors'), 'benchmark exercises light and color paths');
assert(source.includes('Preparing dynamic shadows'), 'benchmark exercises authored shadow paths');
assert(source.includes('Preparing runtime physics'), 'game benchmark prepares physics paths');
assert(source.includes('Compiling scene shaders'), 'benchmark compiles Three.js scene shaders');
assert(source.includes('Uploading authored textures'), 'benchmark uploads authored textures before interactive camera movement');
assert(source.includes('warmedState = collectSceneState()') && source.includes('textures = collectTextures(warmedState)'),
  'benchmark recollects assets created by runtime hooks before GPU texture upload');
assert(source.includes('hiddenResourceRepresentatives') && source.includes('await warmHiddenResources(warmedState)'),
  'benchmark renders one representative of deferred hidden geometry and materials before Play');
assert(source.includes('Preparing camera surroundings'), 'benchmark warms multiple camera orientations before interaction');
assert(source.includes('restoreCamera(cameraState)'), 'benchmark restores the authored camera after panoramic warm-up');
assert(source.includes('Measuring sustained performance'), 'benchmark measures sustained rendered frames');
assert(source.includes('preBenchmarkRunning'), 'benchmark explicitly owns the render loop while running');
assert(source.includes('backend.compileScene(renderer, scene, camera'), 'shader compilation is delegated to the shared safe backend queue');
assert(!source.includes('renderer.compileAsync(scene, camera)'), 'the benchmark does not start Three r185 WebGL polling that can remain pending');
assert((gameFlowSource.match(/prepareRuntimeForSession\('game'/g) || []).length >= 2, 'gameplay and editor preview both run the session pre-benchmark');
assert(!gameFlowSource.includes("if(!call('isRuntimeReady'))"), 'an already loaded scene does not skip the next Play pre-benchmark');
assert(lotKingSource.includes('PATH_TRACING.prepare(VIDEO,camera)'), 'path tracing library, BVH and first sample are prepared by a game warm-up hook');
assert(pathTracingSource.includes('warmFirstSample'), 'path tracing warm-up renders its first progressive sample before Play');
assert(pathTracingSource.includes('Shared path-tracing renderer is unavailable') && !pathTracingSource.includes("script.src='vendor/path-tracing"), 'path tracing cannot import a second incompatible Three.js module graph');
assert(pathTracingSource.includes('material&&material.color&&!material.isShaderMaterial'), 'unsupported custom materials stay in the raster overlay instead of crashing path material packing');
assert(pathTracingSource.includes('tracer.rasterizeScene=false') && pathTracingSource.includes('renderDynamicOverlay(camera)'), 'the selected mode shows the progressive path buffer while preserving a responsive dynamic overlay');
assert(lotKingSource.includes("reason:'renderer-change:'"), 'changing renderer mode explicitly schedules a new pre-benchmark');
assert(source.includes('runOptions.adaptive !== false'), 'renderer-switch pre-benchmarks can prepare a requested heavy pipeline without silently replacing it with Low/WebGL');
assert(renderingInspectorSource.includes("value:'pathtracing'"), 'the project Rendering inspector exposes progressive path tracing');
assert(editorRuntimeSource.includes("video.rendererMode==='pathtracing'") && editorRuntimeSource.includes('pathTracing.render(camera,video'),
  'the normal editor viewport renders through the selected path tracer instead of silently staying on WebGL');
assert(engineAudioSource.includes('async function prewarm()') && engineAudioSource.includes('await Promise.all(pending)'),
  'Sound Designer banks finish fetch and decode before the benchmark releases Play');
assert(engineAudioSource.includes('const fallbackNoiseBuffers = new Map()'),
  'procedural vehicle one-shot buffers are allocated once during preparation instead of on first acceleration');
assert(lotKingSource.includes('Preparing vehicle Sound Designer banks') && lotKingSource.includes('await ENGINE_AUDIO.prewarm()'),
  'the native Player Car audio prewarm is visible and awaited by the shared preparation overlay');
assert(vehiclePawnsSource.includes('audio.manager.prewarm()'),
  'Logic Element vehicle audio banks use the same awaited prewarm path');
assert(vehiclePawnsSource.includes('async function prewarmAll(context)') && lotKingSource.includes('pawns.prewarmAll(context)'),
  'the benchmark inventories every registered Pawn instead of hardcoding only the original car');
assert(logicRunnerSource.includes('context.preparedPawns') && vehiclePawnsSource.includes('!prepared.has(pawn)'),
  'Logic preparation and the global inventory share one transaction and never warm the same Pawn twice');
assert(characterPawnSource.includes('pawn.prepareRuntime=async function(context)') && characterPawnSource.includes('occupancy.prewarmCharacter'),
  'Character animation, cloth, colliders and vehicle seating are prepared before possession');
assert(characterPawnSource.includes("typeof locomotion.resetPresentation==='function'")&&!characterPawnSource.includes("restartLocomotionPresentation('prebenchmark')"),
  'pre-benchmark resets the already-bound controller without retargeting a live animation pose as rest');
assert(characterPawnSource.includes('Play must enter through the same clean animation ownership boundary as') && characterPawnSource.includes('this.updateLocomotionFrame(.0001,neutralMove(),neutral)'),
  'Pawn start must publish the same clean neutral presentation used after vehicle exit before its first visible frame');
const sceneStoreSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine', 'scene-store.js'), 'utf8');
assert(sceneStoreSource.includes('if(node.userData && node.userData.logicCharacterLocomotionMixerOwner) return;'),
  'generic Logic Element autoplay must never compete with an active Character-owned mixer');
assert(occupancySource.includes('function prewarmCharacter') && occupancySource.includes('bones.forEach(entry=>'),
  'seat IK warm-up restores the complete skeleton transactionally');
assert(sketchbookSource.includes('engineAudioController.prewarm') && sketchbookSource.includes('damageRuntime.prewarm'),
  'Sketchbook vehicles prepare their own audio and damage resources');
assert(vehicleAudioSource.includes('async function prewarm()') && vehicleDamageSource.includes('function prewarm()'),
  'per-vehicle audio decoding and damage particle pools expose explicit warm-up contracts');

// The hidden-resource warm pass used to hold the loading screen open forever on
// the Sketchbook Open World: 1502 hidden representatives, 427 of them physics
// collision descriptors, each batch un-hiding ancestors and re-rendering a
// 26 MB scene. Play never started because warming never finished.
assert(source.includes('HIDDEN_WARM_BUDGET_MS'),
  'the hidden-resource warm pass must be bounded so a heavy world cannot stall Play');
assert(/performance\.now\(\) - started > HIDDEN_WARM_BUDGET_MS/.test(source),
  'the warm budget must actually break the batch loop');
assert(/tag === 'physics' \|\| tag === 'collision' \|\| tag === 'navmesh'/.test(source),
  'collision and navigation descriptors are never rendered in play and must be excluded from warming');
assert(source.includes('data.lkSketchbookMetadataHidden'),
  'Sketchbook metadata hidden by the engine must be excluded from warming');
const warmBudget = Number((source.match(/HIDDEN_WARM_BUDGET_MS\s*=\s*(\d+)/) || [])[1]);
assert(Number.isFinite(warmBudget) && warmBudget > 0 && warmBudget <= 15000,
  'the warm budget must be a finite, sane upper bound, got ' + warmBudget);

console.log('pre-benchmark.test.js: all assertions passed');
