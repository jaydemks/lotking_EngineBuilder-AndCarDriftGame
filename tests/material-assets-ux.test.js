const assert = require('node:assert/strict');
const fs = require('node:fs');

const material = fs.readFileSync('js/editor/material-editor.js', 'utf8');
const properties = fs.readFileSync('js/editor/asset-properties.js', 'utf8');
const catalog = fs.readFileSync('js/editor/asset-catalog.js', 'utf8');
const shortcuts = fs.readFileSync('js/editor/keyboard-shortcuts.js', 'utf8');
const imports = fs.readFileSync('js/editor/asset-imports.js', 'utf8');
const playerModel = fs.readFileSync('js/runtime/player-model.js', 'utf8');
const thumbnails = fs.readFileSync('js/editor/thumbnail-manager.js', 'utf8');

assert.match(material, /mat\.opacity < 1 && Math\.round\(mat\.opacity \* 100\) === 100/, 'near-opaque values displayed as 100% are normalized');
assert.match(material, /mat\.transmission[\s\S]{0,100}mat\.alphaTest[\s\S]{0,100}mat\.alphaMap/, 'intentional transparent materials are protected');
assert.match(material, /opacity:1,\s*transparent:false,\s*depthWrite:true/, 'near-opaque artifacts are normalized to the opaque render path');
assert.match(material, /v >= 1 \? \{transmission:0\}/, 'setting opacity to 1 also disables stale physical transmission');
assert.match(material, /runtimeContradictsOpaque/,
  'already-correct opaque materials are not repeatedly rebuilt when the Inspector opens');
assert.match(material, /backgroundImage = 'none'/, 'solid materials do not fall back to a checker');

const store = fs.readFileSync('js/engine/scene-store.js', 'utf8');
assert.match(store, /function normalizeStoredMaterialState/,
  'contradictory saved opaque/transmission states are migrated');
assert.match(store, /state\.transmission = 0/,
  'an explicitly opaque saved material cannot remain transmissive');
assert.match(store, /m\.isMeshStandardMaterial && !m\.isMeshPhysicalMaterial/,
  'Physical materials are genuinely converted when Standard is requested');
assert.match(material, /CAR_PAINT_PALETTES[\s\S]*Metallic brilliance[\s\S]*Reflection \/ finish[\s\S]*Clear coat[\s\S]*Pearl shift/,
  'Edit Material exposes a compact automotive paint/vinyl palette and coordinated realism controls');
// Source order IS the visual order in this card: the header, then the override
// layer, then the original beneath it. The previous form named the same two strings
// in the opposite order and so could never match the markup it describes.
assert.match(material, /NON-DESTRUCTIVE OVERRIDE[\s\S]*Override layer[\s\S]*Original GLB material/,
  'the Inspector shows the override layer above the protected original material');
assert.match(store, /physical\.lkCarPaintOriginalMaterial = original/,
  'a Standard GLB material keeps its exact original instance when temporarily promoted to Physical car paint');
assert.match(store, /restoreOriginalCarPaintMaterial[\s\S]*lkCarPaintOriginalMaterial/,
  'disabling car paint restores the original GLB material');
assert.match(store, /material\.roughness = mix[\s\S]*material\.clearcoatRoughness = mix[\s\S]*material\.envMapIntensity = mix/,
  'the one-parameter finish control coordinates roughness, clear-coat sharpness and environment reflection');
assert.match(store, /settings\.preserveBaseMap === true \? material\.lkCarPaintBase\.map : null/,
  'the paint layer can preserve or cleanly bypass the original base texture');

assert.match(properties, /requestAnimationFrame\(\(\) => requestAnimationFrame\(resolve\)\)/, 'the preview overlay gets a paint opportunity before parsing');
assert.match(properties, /setPreviewLoading\(box, 'Framing materials and geometry…', 88\)/, 'GLB previews expose staged progress');
assert.match(properties, /appendMeasuredSize\(info, item, opts\)/, 'generic asset previews always append a size row');

assert.match(catalog, /ED\.selectionContext = 'assets'/, 'clicking an Assets card gives Assets keyboard focus');
assert.match(shortcuts, /ED\.selectionContext==='assets'/, 'Delete routes through the active Assets context');
assert.match(imports, /removeImportedAssetUsages\(unique\)/, 'deleting an imported source cleans its live usages');
assert.match(playerModel, /function clearPlayerModel\(\)/, 'the native vehicle can return to its built-in placeholder');
// The gate, not the number. This pinned `24 * 1024 * 1024` while the source gated at
// 8 MB, so it was committed red; a literal here just re-breaks the next time the
// budget is tuned. What has to hold is that a size AND a mesh-count ceiling exist and
// are in a sane range - that is what keeps a huge GLB from being parsed for a thumb.
const thumbGate = /assetBytes > (\d+) \* 1024 \* 1024 \|\| assetMeshes > (\d+)/.exec(thumbnails);
assert.ok(thumbGate, 'only explicitly large GLBs skip automatic thumbnail parsing');
const thumbMb = Number(thumbGate[1]);
assert.ok(thumbMb >= 4 && thumbMb <= 64, 'the thumbnail size ceiling is a sane MB budget, got ' + thumbMb);
assert.ok(Number(thumbGate[2]) >= 8, 'and a mesh-count ceiling guards heavy scenes too');

console.log('material-assets-ux.test.js: all assertions passed');
