const assert = require('node:assert/strict');
const fs = require('node:fs');

const store = fs.readFileSync('js/engine/scene-store.js', 'utf8');
const inspector = fs.readFileSync('js/editor/object-inspector.js', 'utf8');
const notes = fs.readFileSync('RELEASE_NOTES_v0.7.7.md', 'utf8');

assert.match(inspector, /value:'surface'.*Surface Layer/s,
  'the decal Inspector exposes the material-preserving Surface Layer mode');
assert.match(inspector, /surfaceInfluence/,
  'Surface Layer exposes a persisted material-override range');
assert.match(inspector, /surfaceBaseInfluence/,
  'Surface Layer exposes receiver base-texture influence');
assert.match(inspector, /Match surface now|Associa superficie ora/,
  'authors can explicitly refresh the receiving surface');

assert.match(store, /props\.blending === 'surface'/,
  'scene-store recognizes Surface Layer decals');
assert.match(store, /textureBlending\(surfaceLayer \? 'normal' : props\.blending\)/,
  'Surface Layer never falls through to darkening Multiply blending');
assert.match(store, /surfaceRoughness/,
  'receiver roughness is persisted with the decal');
assert.match(store, /surfaceMetalness/,
  'receiver metallic response is persisted with the decal');
assert.match(store, /surfaceSpecular/,
  'receiver specular response is persisted with the decal');
assert.match(store, /mat\.normalMap = receiverMat\.normalMap/,
  'receiver normal maps shade the decal without texture copies');
assert.match(store, /mat\.roughnessMap = receiverMat\.roughnessMap/,
  'receiver roughness maps shade the decal');
assert.match(store, /lkSurfaceBaseMap/,
  'the receiver base texture can influence decal color in the PBR shader');
assert.match(store, /textureSurfaceTransformSignature/,
  'moving a decal invalidates and refreshes its surface match');
assert.match(store, /matchTextureSurface,/,
  'surface matching is available to the Inspector API');

assert.match(notes, /Surface Layer · preserve PBR/,
  'the v0.7.7 release notes document the new decal mode');

console.log('decal surface-layer tests passed');
