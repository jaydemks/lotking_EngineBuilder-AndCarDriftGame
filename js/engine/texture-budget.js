/* =========================================================
   LOT KING - texture budget

   One ceiling for how large a texture is allowed to be on the GPU, applied
   wherever a texture enters the engine: an imported image, a decal, a GLB's
   embedded maps.

   WHY THIS EXISTS
   Nothing limited texture size before. A 4K PBR set is 4096 x 4096 x 4 bytes =
   67 MB per map, x5 maps for a full material, x mipmaps - a third of a GPU's
   texture memory for ONE material - and an 8K source is four times that again.
   The engine would happily upload it, and the first sign of trouble is a stutter
   nobody can trace back to the import that caused it.

   The cap is a downscale, not a rejection: the source file is untouched on disk
   and in the project, only the GPU copy is smaller. Raise the cap and the next
   load comes back at full size.

   The procedural surfaces (js/engine/procedural-surfaces.js) are generated at
   256 px and never pass through here - they are already inside any sane budget,
   and they are DataTextures with no decodable image to resample.
   ========================================================= */
(function(){
'use strict';

const SIZES = Object.freeze([256, 512, 1024, 2048, 4096, 8192]);
const DEFAULT_MAX = 1024;
const MIN_MAX = 256;
const MAX_MAX = 8192;

let maxSize = DEFAULT_MAX;
let resized = 0;
let inspected = 0;
let savedBytes = 0;

function clampSize(value){
  const number = Math.round(Number(value) || 0);
  if(!Number.isFinite(number) || number <= 0) return DEFAULT_MAX;
  return Math.max(MIN_MAX, Math.min(MAX_MAX, number));
}

// Nearest allowed step at or below the request, so a cap is always a real
// texture size rather than an arbitrary number the GPU has to round anyway.
function normalizeSize(value){
  const wanted = clampSize(value);
  let best = SIZES[0];
  for(let i = 0; i < SIZES.length; i++){ if(SIZES[i] <= wanted) best = SIZES[i]; }
  return best;
}

function imageOf(texture){
  const image = texture && (texture.image || (texture.source && texture.source.data));
  if(!image) return null;
  const width = image.naturalWidth || image.videoWidth || image.width || 0;
  const height = image.naturalHeight || image.videoHeight || image.height || 0;
  if(!width || !height) return null;
  return {image, width, height};
}

// Only bitmap-like sources can be resampled by drawing them. A DataTexture's
// typed array, a compressed texture and a video are all left exactly as they
// are: shrinking them here would be wrong, not just unsupported.
function isResizable(image){
  if(typeof document === 'undefined' || !image) return false;
  if(image.data) return false;
  const bitmap = (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
    || (typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement)
    || (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement);
  return !!bitmap;
}

function fit(texture, options){
  const cap = normalizeSize(options && options.maxSize != null ? options.maxSize : maxSize);
  const source = imageOf(texture);
  if(!source) return null;
  inspected++;
  const longest = Math.max(source.width, source.height);
  if(longest <= cap) return {resized:false, width:source.width, height:source.height, cap};
  if(!isResizable(source.image)) return {resized:false, width:source.width, height:source.height, cap, skipped:'not-resizable'};

  const scale = cap / longest;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if(!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  if('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  try { ctx.drawImage(source.image, 0, 0, width, height); }
  catch(error){ return {resized:false, width:source.width, height:source.height, cap, skipped:'draw-failed'}; }

  texture.image = canvas;
  if(texture.source) texture.source.data = canvas;
  texture.needsUpdate = true;
  resized++;
  savedBytes += (source.width * source.height - width * height) * 4;
  return {resized:true, from:[source.width, source.height], width, height, cap};
}

function eachMaterial(root, fn){
  if(!root || !root.traverse) return;
  root.traverse(node => {
    if(!node || !node.material) return;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    list.forEach(material => { if(material) fn(material); });
  });
}

const SLOTS = Object.freeze(['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap',
  'emissiveMap', 'aoMap', 'lightMap', 'bumpMap', 'displacementMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap', 'specularMap', 'transmissionMap']);

function fitMaterial(material, options){
  if(!material) return 0;
  let count = 0;
  SLOTS.forEach(slot => {
    const texture = material[slot];
    if(!texture) return;
    const result = fit(texture, options);
    if(result && result.resized) count++;
  });
  return count;
}

function fitObject(root, options){
  let count = 0;
  eachMaterial(root, material => { count += fitMaterial(material, options); });
  return count;
}

// A texture that is still loading has no image yet, so the cap has to wait for
// it. Callers that hand over a freshly created TextureLoader texture use this.
function fitWhenReady(texture, options){
  if(!texture) return texture;
  if(imageOf(texture)){ fit(texture, options); return texture; }
  const previous = texture.onUpdate;
  const source = texture.source;
  let done = false;
  const attempt = () => {
    if(done || !imageOf(texture)) return;
    done = true;
    fit(texture, options);
  };
  if(source && typeof Object.getOwnPropertyDescriptor === 'function'){
    // TextureLoader assigns `image` when the decode finishes; that assignment is
    // the only reliable moment, because it has no completion callback of its own
    // once the caller has taken the texture.
    let stored = texture.image;
    try {
      Object.defineProperty(texture, 'image', {
        configurable:true,
        get(){ return stored; },
        set(value){ stored = value; if(source) source.data = value; attempt(); },
      });
    } catch(error){}
  }
  texture.onUpdate = function(){
    attempt();
    if(typeof previous === 'function') previous.apply(this, arguments);
  };
  return texture;
}

window.LK_ENGINE_TEXTURE_BUDGET = Object.freeze({
  SIZES,
  DEFAULT_MAX,
  normalizeSize,
  maxSize:() => maxSize,
  setMaxSize(value){ maxSize = normalizeSize(value); return maxSize; },
  fit,
  fitWhenReady,
  fitMaterial,
  fitObject,
  stats:() => ({maxSize, inspected, resized, savedMegabytes:+(savedBytes / 1048576).toFixed(1)}),
});
})();
