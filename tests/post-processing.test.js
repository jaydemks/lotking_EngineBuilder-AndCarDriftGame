const fs = require('fs');
const path = require('path');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'runtime', 'post.js'), 'utf8');

assert(source.includes('smokeGain'), 'volumetric pass exposes smoke-aware scattering gain');
assert(source.includes('transmittance *= exp(-absorption'), 'volumetric pass applies Beer-Lambert style transmittance');
assert(source.includes('smokeDensity = smoothstep'), 'volumetric pass derives density from smoke-like samples');
assert(source.includes('new THREE.SSRPass'), 'ray reflections use the official Three.js SSR pass when available');
assert(source.includes('ssrPass.isSelective = true'), 'SSR is restricted to reflective metallic meshes');
assert(source.includes('low:{contrast:1, saturation:1, brightness:0'), 'quality presets keep color and illumination neutral');
assert(source.includes('videoOnly'), 'editor cameras can render the shared video pipeline without player-camera grading');
assert(source.includes('renderPass.camera = activeCamera'), 'the shared post pipeline accepts editor and gameplay cameras');
assert(source.includes('new THREE.ShaderPass(THREE.FXAAShader)'), 'FXAA uses the Three.js post-process shader');
assert(source.includes("video.antialiasing === 'fxaa'"), 'FXAA pass follows the shared video setting');

console.log('post-processing.test.js: all assertions passed');
