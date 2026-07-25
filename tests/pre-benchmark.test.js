const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'pre-benchmark.js'), 'utf8');
const gameFlowSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'game-flow.js'), 'utf8');
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
assert(source.includes('Preparing camera surroundings'), 'benchmark warms multiple camera orientations before interaction');
assert(source.includes('restoreCamera(cameraState)'), 'benchmark restores the authored camera after panoramic warm-up');
assert(source.includes('Measuring sustained performance'), 'benchmark measures sustained rendered frames');
assert(source.includes('preBenchmarkRunning'), 'benchmark explicitly owns the render loop while running');
assert(source.includes('backend.compileScene(renderer, scene, camera'), 'shader compilation is delegated to the shared safe backend queue');
assert(!source.includes('renderer.compileAsync(scene, camera)'), 'the benchmark does not start Three r185 WebGL polling that can remain pending');
assert((gameFlowSource.match(/prepareRuntimeForSession\('game'/g) || []).length >= 2, 'gameplay and editor preview both run the session pre-benchmark');
assert(!gameFlowSource.includes("if(!call('isRuntimeReady'))"), 'an already loaded scene does not skip the next Play pre-benchmark');

console.log('pre-benchmark.test.js: all assertions passed');
