/* =========================================================
   LOT KING — EDITOR MATERIAL INSPECTOR
   Mesh material controls used by the editor inspector.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const STORE = deps.STORE;
  const thumbCache = deps.thumbCache;
  const markDirty = deps.markDirty;
  const refreshOutliner = deps.refreshOutliner;
  const buildInspector = deps.buildInspector;
  const readFileAsDataURL = deps.readFileAsDataURL;
  const section = deps.section;
  const selectRow = deps.selectRow;
  const colorRow = deps.colorRow;
  const sliderRow = deps.sliderRow;
  const textureDrop = deps.textureDrop;
  const btnRow = deps.btnRow;
  const el = deps.el;
  const requestWarmup = deps.requestWarmup || function(){};

  function getFirstMaterial(o){
    let mat = null;
    o.traverse(n => {
      if(mat || !n.isMesh || !n.material) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mat = mats.find(m => m && (m.color || m.roughness != null || m.metalness != null)) || mats[0];
    });
    return mat;
  }

  function applyMaterialPatch(o, patch){
    STORE.applyMatProps(o, patch);
    thumbCache.delete(o.userData.editorId);
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'castShadow')) requestWarmup(patch.castShadow ? 'Warm-up shadows...' : 'Warm-up render...');
    markDirty();
    refreshOutliner();
  }

  function build(box, o){
    if(o.userData.editorType !== 'mesh') return;
    const mat = getFirstMaterial(o);
    if(!mat) return;
    const sm = section('EDIT MATERIAL');
    sm.body.appendChild(el('<div class="lk-hint">Modifica il materiale delle mesh selezionate. Texture: trascina PNG/JPG negli slot oppure clicca lo slot.</div>'));
    const preset = selectRow('Materiale', 'custom', [
      {value:'custom', label:'Custom'},
      {value:'matte', label:'Matte paint'},
      {value:'plastic', label:'Plastic'},
      {value:'metal', label:'Metal'},
      {value:'glass', label:'Glass / transparent'},
      {value:'emissive', label:'Emissive glow'},
    ], v => {
      const presets = {
        matte: {materialKind:'standard', roughness:.92, metalness:0, opacity:1, transparent:false, emissiveIntensity:0},
        plastic: {materialKind:'standard', roughness:.45, metalness:.05, opacity:1, transparent:false, emissiveIntensity:0},
        metal: {materialKind:'standard', roughness:.22, metalness:1, opacity:1, transparent:false, emissiveIntensity:0},
        glass: {materialKind:'standard', roughness:.04, metalness:0, opacity:.38, transparent:true, emissiveIntensity:0},
        emissive: {materialKind:'standard', roughness:.35, metalness:0, opacity:1, transparent:false, emissiveIntensity:1.6},
      };
      if(presets[v]) applyMaterialPatch(o, presets[v]);
      buildInspector();
    });
    sm.body.appendChild(preset.root);
    sm.body.appendChild(colorRow('Base color', mat.color ? mat.color.getHex() : 0xffffff, v => applyMaterialPatch(o, {color:v})).root);
    sm.body.appendChild(colorRow('Tint glow', mat.emissive ? mat.emissive.getHex() : 0x000000, v => applyMaterialPatch(o, {emissive:v})).root);
    sm.body.appendChild(sliderRow('Tint power', mat.emissiveIntensity != null ? mat.emissiveIntensity : 0, 0, 3, .05, v => applyMaterialPatch(o, {emissiveIntensity:v})).root);
    sm.body.appendChild(sliderRow('Roughness', mat.roughness != null ? mat.roughness : .7, 0, 1, .01, v => applyMaterialPatch(o, {roughness:v})).root);
    sm.body.appendChild(sliderRow('Metallic', mat.metalness != null ? mat.metalness : 0, 0, 1, .01, v => applyMaterialPatch(o, {metalness:v})).root);
    sm.body.appendChild(sliderRow('Opacity', mat.opacity != null ? mat.opacity : 1, .05, 1, .01, v => applyMaterialPatch(o, {opacity:v, transparent:v < 1})).root);
    sm.body.appendChild(sliderRow('Normal str.', mat.normalScale ? mat.normalScale.x : 1, 0, 2, .05, v => applyMaterialPatch(o, {normalScale:v})).root);
    sm.body.appendChild(textureDrop('Base texture', 'Albedo/base color map. Accetta immagini PNG/JPG/WebP.', f => {
      readFileAsDataURL(f).then(src => applyMaterialPatch(o, {mapSrc:src}));
    }));
    sm.body.appendChild(textureDrop('Normal map', 'Mappa normale tangent-space. Usa Normal str. per dosarne l\'effetto.', f => {
      readFileAsDataURL(f).then(src => applyMaterialPatch(o, {normalMapSrc:src}));
    }));
    sm.body.appendChild(btnRow([
      {label:'Reset maps', action:() => applyMaterialPatch(o, {mapSrc:null, normalMapSrc:null})},
      {label:'Shadows on', action:() => applyMaterialPatch(o, {castShadow:true})},
      {label:'Shadows off', action:() => applyMaterialPatch(o, {castShadow:false})},
    ]));
    box.appendChild(sm.root);
  }

  return Object.freeze({getFirstMaterial, applyMaterialPatch, build});
}

window.LK_EDITOR_MATERIAL_EDITOR = Object.freeze({create});
})();
