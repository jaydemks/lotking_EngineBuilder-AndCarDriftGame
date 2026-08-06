const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const settingsSource = read('js/runtime/settings-menu.js');
const sandbox = {window:{}, console};
vm.runInNewContext(settingsSource, sandbox, {filename:'settings-menu.js'});
const settings = sandbox.window.LK_RUNTIME_SETTINGS_MENU;

assert(settings, 'video settings API is available');
const illustrated = settings.normalizeValues({
  visualStyle:'illustrated-sketch', sketchStrength:2, sketchDetail:-1,
  sketchMedium:'paper-pencil', sketchHatching:0, sketchLineNoise:.77,
  sketchPigment:.91, sketchColorNoise:.66, sketchSaturation:1.7, sketchLightGain:2.8,
  sketchAtmosphere:.73, sketchPaper:.64, monochrome:true,
});
assert(illustrated.visualStyle === 'illustrated-sketch', 'illustrated scene style survives project normalization');
assert(illustrated.sketchMedium === 'paper-pencil', 'organic Paper Pencil medium survives normalization');
assert(settings.normalizeValues({sketchMedium:'illustrated-ink'}).sketchMedium === 'illustrated-ink', 'graphic Illustrated Ink remains selectable');
assert(illustrated.sketchStrength === 1 && illustrated.sketchDetail === 0, 'sketch controls are clamped');
assert(illustrated.sketchPigment === .91 && illustrated.sketchAtmosphere === .73, 'pigment and atmospheric treatment persist independently');
assert(illustrated.sketchHatching === 0 && illustrated.sketchLineNoise === .77, 'outlines keep independent hatching and drawn-line noise controls');
assert(illustrated.sketchColorNoise === .66 && illustrated.sketchSaturation === 1.7, 'pigment noise and colour amount persist independently');
assert(illustrated.sketchLightGain === 2.8, 'the illustrated light gain supports deliberate high-key output');
assert(settings.normalizeValues({sketchSaturation:9,sketchLightGain:9}).sketchSaturation === 2, 'sketch colour has a bounded extended range');
assert(settings.normalizeValues({sketchSaturation:9,sketchLightGain:9}).sketchLightGain === 3, 'sketch light gain is clamped before reaching the shader');
assert(settings.normalizeValues({}).sketchMedium === 'painted-storybook', 'full-colour Painted Storybook is the new automatic material/FX medium');
assert(illustrated.sketchPaper === .64 && illustrated.monochrome === true, 'paper and independent monochrome settings persist');
assert(settings.normalizeValues({visualStyle:'unknown'}).visualStyle === 'natural', 'unknown visual styles safely restore natural rendering');
const authorProject=settings.normalizeProject({defaults:illustrated,authority:{visualStyle:'author',monochrome:'player'}});
assert(authorProject.version === 8, 'author rendering authority uses the version 8 project-video schema');
assert(authorProject.authority.visualStyle === 'author' && authorProject.authority.monochrome === 'player', 'sketch and monochrome authority are independent');
const forced=settings.authorEffectiveValues({visualStyle:'natural',sketchMedium:'illustrated-ink',monochrome:false},authorProject);
assert(forced.visualStyle === 'illustrated-sketch' && forced.sketchMedium === 'paper-pencil', 'author can force the complete authored sketch appearance');
assert(forced.sketchHatching === 0 && forced.sketchLineNoise === .77 && forced.sketchColorNoise === .66, 'author override includes every line and pigment control');
assert(forced.sketchSaturation === 1.7 && forced.sketchLightGain === 2.8, 'author override includes extended colour and light gain');
assert(forced.monochrome === false, 'an unlocked monochrome preference remains controlled by the player');
const forcedBoth=settings.authorEffectiveValues({visualStyle:'natural',monochrome:false},settings.normalizeProject({defaults:illustrated,authority:{visualStyle:'author',monochrome:'author'}}));
assert(forcedBoth.monochrome === true, 'the author can independently force black and white together with sketch');

const post = read('js/runtime/post.js');
const editorRuntime = read('js/editor/editor-runtime.js');
const gameRuntime = read('js/lot-king.js');
assert(post.includes("video.visualStyle==='illustrated-sketch'"), 'the shared post pipeline follows the project style');
assert(post.includes('const sketchPass =') && post.includes('float hatchA='), 'WebGL has bounded contour and cross-hatch processing');
assert(post.includes('mul(sketchHatching)') && post.includes('*hatching*.105'), 'both backends can remove hatching without removing contour ink');
assert(post.includes('sketchLineNoise') && post.includes('lineInk=edge*strength'), 'both backends vary drawn contour weight independently');
assert(post.includes('sketchColorNoise') && post.includes('colorNoise*.052'), 'both backends expose independent pigment noise');
assert(post.includes('sketchSaturation') && post.includes('outColor,saturation'), 'both backends expose extended illustrated colour');
assert(post.includes('sketchLightGain') && post.includes('lightGain,strength'), 'both backends apply bounded illustrated light gain');
assert(post.includes('const postUv=TSL.viewportUV') && post.includes('const postSize=TSL.viewportSize'), 'WebGPU samples the local 3D viewport instead of stretching it across the editor canvas');
assert(post.includes('const sceneSample=sceneColor.sample(postUv)') && !post.includes('sceneColor.sample(TSL.screenUV'), 'WebGPU scene color and neighbouring pixels share the camera viewport aspect');
assert(post.includes('function render(cameraOverride,options)') && post.includes('setScopedSize(requested.width,requested.height)'), 'WebGPU sizes its intermediate scene target to the requested Editor or Play viewport');
assert(post.includes('const rawScenePassSetSize=scenePass.setSize.bind(scenePass)') && post.includes('scenePass.setSize=function()'), 'WebGPU pins PassNode auto-sizing to the local viewport instead of the full editor drawing buffer');
assert(post.includes('const paperSketch=') && post.includes('paperSketch=mix(paperColor,pencilPigment'), 'both backends implement the organic Paper Pencil medium');
assert(post.includes('const storybook=') && post.includes('vec3 storybook='), 'both backends filter colour, shadows, highlights and atmosphere through Painted Storybook');
assert(post.includes('softAtmosphere') && post.includes('brightFx'), 'the final scene pass explicitly treats low-chroma atmosphere and emissive transparent effects');
assert(post.includes('sketchMonochrome') && post.includes('uniform float monochrome;'), 'both backends implement the independent monochrome filter');
assert(post.indexOf('const sketchPass =') < post.indexOf('new THREE.OutputPass()'), 'sketch processing runs before final display conversion');
assert(post.includes('supportsScoped:true'), 'WebGPU illustrated output participates in scoped Editor and Play viewports');
assert(post.includes('needsPost') && editorRuntime.includes('post.webgpu && post.needsPost'), 'Natural WebGPU bypasses the illustrated pipeline while authored sketch still requests it');

const store = read('js/engine/scene-store.js');
const materialEditor = read('js/editor/material-editor.js');
assert(store.includes('convertToSketchMaterial') && store.includes('restoreOriginalSketchMaterial'), 'material sketch overrides can be applied and exactly restored');
assert(store.includes('lkSketchOriginalMaterial') && store.includes('new THREE.MeshToonMaterial'), 'material overrides protect their original and use backend-neutral toon shading');
assert(store.includes('monochromeSketchMap') && store.includes("context.filter = 'grayscale(1) contrast(1.08)'"), 'monochrome material texture detail is derived non-destructively');
assert(store.includes('colorSketchMap') && store.includes('color pigment sketch'), 'Color Sketch derives a palette-filtered pigment texture for each material');
assert(store.includes('emissiveIntensity:material.emissiveIntensity') && store.includes('alphaTest:material.alphaTest'), 'material sketch layers preserve authored light and transparency response');
assert(materialEditor.includes("value:'color'") && materialEditor.includes("value:'monochrome'"), 'each material exposes Color Sketch and Monochrome Ink');
assert(materialEditor.includes('NON-DESTRUCTIVE TOON LAYER'), 'the Inspector explains the material layering contract');

assert(editorRuntime.includes("video.visualStyle === 'illustrated-sketch'") && editorRuntime.includes('video.monochrome === true'), 'Editor viewport requests the visual pipeline');
assert(gameRuntime.includes("VIDEO.visualStyle === 'illustrated-sketch'") && gameRuntime.includes('VIDEO.monochrome === true'), 'Play and game request the visual pipeline');

for(const html of ['engine_editor.html', 'gameplay.html']){
  const source = read(html);
  ['videoVisualStyle','videoSketchMedium','videoSketchStrength','videoSketchDetail','videoSketchHatching','videoSketchLineNoise','videoSketchPigment','videoSketchColorNoise','videoSketchSaturation','videoSketchLightGain','videoSketchAtmosphere','videoSketchPaper','videoMonochrome'].forEach(id => {
    assert(source.includes('id="' + id + '"'), html + ' exposes ' + id);
  });
}

console.log('illustrated-sketch-rendering.test.js: all assertions passed');
