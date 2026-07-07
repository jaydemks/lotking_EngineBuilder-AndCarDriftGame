/* =========================================================
   LOT KING - EDITOR MATERIAL INSPECTOR
   Mesh/player material controls used by the editor inspector.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME || window.LOT_KING;
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
  const assetLibraryLoad = deps.assetLibraryLoad || function(){ return []; };
  const liveMaterialSelection = deps.liveMaterialSelection || null;
  const THREE = deps.THREE || window.THREE;
  const tr = (en, it) => window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en;

  function materialRoot(o){
    if(o && o.userData && o.userData.editorType === 'player' && GAME && GAME.player && GAME.player.getModel){
      return GAME.player.getModel() || o;
    }
    return o;
  }

  function meshLabel(mesh, meshIndex){
    return mesh.name || mesh.userData && (mesh.userData.editorName || mesh.userData.editorId) || ('Mesh ' + (meshIndex + 1));
  }

  function materialLabel(mat, materialIndex){
    return mat && mat.name ? mat.name : ('Material ' + (materialIndex + 1));
  }

  function collectMaterialSlots(o){
    const slots = [];
    let meshIndex = 0;
    o.traverse(n => {
      if(!n.isMesh || !n.material) return;
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach((mat, materialIndex) => {
        if(!mat) return;
        slots.push({
          key:meshIndex + ':' + materialIndex,
          mesh:n,
          meshIndex,
          materialIndex,
          material:mat,
          label:meshLabel(n, meshIndex) + ' / ' + materialLabel(mat, materialIndex),
        });
      });
      meshIndex++;
    });
    return slots;
  }

  function getFirstMaterial(o){
    const slot = collectMaterialSlots(materialRoot(o))[0];
    return slot ? slot.material : null;
  }

  function getActiveSlot(o, slots){
    const current = o.userData.materialEditorSlot || 'all';
    if(current === 'all') return 'all';
    return slots.some(slot => slot.key === current) ? current : 'all';
  }

  function getMaterialForTarget(o, slots, target){
    if(target && target !== 'all'){
      const slot = slots.find(item => item.key === target);
      if(slot) return slot.material;
    }
    return getFirstMaterial(o);
  }

  function scopedPatch(o, patch){
    const target = o.userData.materialEditorSlot || 'all';
    if(target === 'all') return Object.assign({allowGlobal:true}, patch);
    return Object.assign({materialSlot:target}, patch);
  }

  function applyMaterialPatch(o, patch){
    const root = materialRoot(o);
    STORE.applyMatProps(root, scopedPatch(o, patch));
    if(root !== o) o.userData.matProps = root.userData.matProps;
    thumbCache.delete(o.userData.editorId);
    if(patch && Object.prototype.hasOwnProperty.call(patch, 'castShadow')) requestWarmup(patch.castShadow ? 'Warm-up shadows...' : 'Warm-up render...');
    if(patch && (patch.transparent != null || patch.opacity != null || patch.depthWrite != null || patch.materialKind)) requestWarmup('Warm-up material...');
    markDirty();
    refreshOutliner();
  }

  function textureAssets(){
    return assetLibraryLoad().filter(asset => asset && asset.kind === 'texture');
  }

  function texturePatchFromAsset(asset, srcKey, dbKey){
    return {
      [srcKey]:asset.src || null,
      [dbKey]:asset.dbKey || null,
    };
  }

  function addTextureSlot(body, label, desc, srcKey, dbKey, o, patcher){
    const applyPatch = patcher || (patch => applyMaterialPatch(o, patch));
    body.appendChild(textureDrop(label, desc, f => {
      readFileAsDataURL(f).then(src => applyPatch({[srcKey]:src, [dbKey]:null}));
    }));
    const assets = textureAssets();
    if(assets.length){
      body.appendChild(selectRow(label + ' asset', '', [
        {value:'', label:tr('Choose imported texture...', 'Scegli texture importata...')},
        ...assets.map(asset => ({value:asset.id, label:asset.source || asset.name || asset.key})),
      ], id => {
        const asset = assets.find(item => item.id === id);
        if(asset) applyPatch(texturePatchFromAsset(asset, srcKey, dbKey));
      }).root);
    }
  }

  function updateMaterialPreview(preview, mat, targetLabel){
    const color = mat && mat.color ? '#' + mat.color.getHexString() : '#ffffff';
    const opacity = mat && mat.opacity != null ? mat.opacity : 1;
    const swatch = preview.querySelector('.lk-material-swatch');
    const text = preview.querySelector('span');
    const mapSrc = mat && mat.map && mat.map.image && (mat.map.image.currentSrc || mat.map.image.src) ? (mat.map.image.currentSrc || mat.map.image.src) : '';
    swatch.style.backgroundColor = color;
    if(mapSrc){
      swatch.style.backgroundImage = 'url(' + mapSrc + ')';
      swatch.style.backgroundSize = 'cover';
      swatch.style.backgroundPosition = 'center';
    } else {
      swatch.style.backgroundImage = '';
    }
    swatch.style.opacity = String(Math.max(.2, opacity));
    text.textContent = targetLabel + ' · ' +
      'color ' + color + ' · ' +
      'rough ' + ((mat && mat.roughness != null ? mat.roughness : 0).toFixed(2)) + ' · ' +
      'metal ' + ((mat && mat.metalness != null ? mat.metalness : 0).toFixed(2)) + ' · ' +
      'opacity ' + Math.round(opacity * 100) + '%';
  }

  function materialPreview(mat, targetLabel){
    const preview = el('<div class="lk-material-preview"><div class="lk-material-swatch"></div><span></span></div>');
    preview.lkRefresh = nextMat => updateMaterialPreview(preview, nextMat || mat, targetLabel);
    preview.lkRefresh(mat);
    return preview;
  }

  function build(box, o){
    const root = materialRoot(o);
    const slots = collectMaterialSlots(root);
    if(!slots.length) return;
    if(o.userData.editorType !== 'mesh' && o.userData.editorType !== 'player') return;
    const target = getActiveSlot(o, slots);
    o.userData.materialEditorSlot = target;
    const mat = getMaterialForTarget(o, slots, target);
    if(!mat) return;

    const sm = section(tr('EDIT MATERIAL', 'MODIFICA MATERIALE'));
    sm.body.appendChild(el('<div class="lk-hint">' + tr(
      'Choose All materials or a single GLB material slot. Transparent glass usually needs Blend alpha and Depth write off.',
      'Scegli Tutti i materiali o un singolo slot materiale del GLB. Per vetri trasparenti di solito servono alpha Blend e Depth write off.'
    ) + '</div>'));

    sm.body.appendChild(selectRow('Target', target, [
      {value:'all', label:tr('All materials', 'Tutti i materiali')},
      ...slots.map(slot => ({value:slot.key, label:slot.label})),
    ], v => {
      o.userData.materialEditorSlot = v;
      if(liveMaterialSelection && liveMaterialSelection.sync) liveMaterialSelection.sync(o);
      buildInspector();
    }).root);
    const activeLabel = target === 'all' ? tr('All materials', 'Tutti i materiali') : (slots.find(slot => slot.key === target) || {}).label || target;
    const preview = materialPreview(mat, activeLabel);
    const currentMaterial = () => getMaterialForTarget(o, collectMaterialSlots(materialRoot(o)), o.userData.materialEditorSlot);
    const patchMat = patch => {
      applyMaterialPatch(o, patch);
      if(preview.lkRefresh) preview.lkRefresh(currentMaterial());
    };
    sm.body.appendChild(preview);

    if(liveMaterialSelection){
      const live = liveMaterialSelection.isActive && liveMaterialSelection.isActive(o);
      sm.body.appendChild(btnRow([
        {label:live ? 'Stop Live Mat Selection' : 'Live Mat Selection', action:() => {
          if(liveMaterialSelection.toggle) liveMaterialSelection.toggle(o);
          buildInspector();
        }},
      ]));
      if(live){
        sm.body.appendChild(el('<div class="lk-hint">' + tr(
          'Live selection is active: click a visible part of this model to set the material target. Only the material border is highlighted.',
          'Selezione live attiva: clicca una parte visibile del modello per impostare il target materiale. Viene evidenziato solo il bordo del materiale.'
        ) + '</div>'));
      }
    }

    const preset = selectRow(tr('Preset', 'Preset'), 'custom', [
      {value:'custom', label:'Custom'},
      {value:'matte', label:'Matte paint'},
      {value:'plastic', label:'Plastic'},
      {value:'metal', label:'Metal'},
      {value:'glass', label:'Glass / transparent'},
      {value:'emissive', label:'Emissive glow'},
    ], v => {
      const presets = {
        matte: {materialKind:'standard', roughness:.92, metalness:0, opacity:1, transparent:false, depthWrite:true, alphaTest:0, emissiveIntensity:0},
        plastic: {materialKind:'standard', roughness:.45, metalness:.05, opacity:1, transparent:false, depthWrite:true, alphaTest:0, emissiveIntensity:0},
        metal: {materialKind:'standard', roughness:.22, metalness:1, opacity:1, transparent:false, depthWrite:true, alphaTest:0, emissiveIntensity:0},
        glass: {materialKind:'physical', roughness:.02, metalness:0, opacity:.28, transparent:true, depthWrite:false, alphaTest:0, transmission:.65, ior:1.45, thickness:.08, side:THREE.DoubleSide, renderOrder:12, emissiveIntensity:0},
        emissive: {materialKind:'standard', roughness:.35, metalness:0, opacity:1, transparent:false, depthWrite:true, alphaTest:0, emissiveIntensity:1.6},
      };
      if(presets[v]) patchMat(presets[v]);
      buildInspector();
    });
    sm.body.appendChild(preset.root);

    sm.body.appendChild(colorRow('Base color', mat.color ? mat.color.getHex() : 0xffffff, v => patchMat({color:v})).root);
    sm.body.appendChild(colorRow('Emission color', mat.emissive ? mat.emissive.getHex() : 0x000000, v => patchMat({emissive:v})).root);
    sm.body.appendChild(sliderRow('Emission', mat.emissiveIntensity != null ? mat.emissiveIntensity : 0, 0, 3, .05, v => patchMat({emissiveIntensity:v}), v => (+v).toFixed(2)).root);
    sm.body.appendChild(sliderRow('Roughness', mat.roughness != null ? mat.roughness : .7, 0, 1, .01, v => patchMat({roughness:v}), v => Math.round(v * 100) + '%').root);
    sm.body.appendChild(sliderRow('Metallic', mat.metalness != null ? mat.metalness : 0, 0, 1, .01, v => patchMat({metalness:v}), v => Math.round(v * 100) + '%').root);
    sm.body.appendChild(sliderRow('Opacity', mat.opacity != null ? mat.opacity : 1, 0, 1, .01, v => patchMat({opacity:v, transparent:v < 1, depthWrite:v >= 1}), v => Math.round(v * 100) + '%').root);
    sm.body.appendChild(sliderRow('Alpha cut', mat.alphaTest != null ? mat.alphaTest : 0, 0, .9, .01, v => patchMat({alphaTest:v}), v => (+v).toFixed(2)).root);
    sm.body.appendChild(selectRow('Alpha mode', mat.transparent ? 'blend' : (mat.alphaTest > 0 ? 'cutout' : 'opaque'), [
      {value:'opaque', label:'Opaque'},
      {value:'blend', label:'Blend transparent'},
      {value:'cutout', label:'Cutout / alpha test'},
    ], v => {
      if(v === 'blend') patchMat({transparent:true, depthWrite:false, alphaTest:0, materialKind:'standard'});
      if(v === 'cutout') patchMat({transparent:false, depthWrite:true, alphaTest:Math.max(.1, mat.alphaTest || .35), materialKind:'standard'});
      if(v === 'opaque') patchMat({transparent:false, depthWrite:true, opacity:1, alphaTest:0});
      buildInspector();
    }).root);
    sm.body.appendChild(selectRow('Side', String(mat.side == null ? THREE.FrontSide : mat.side), [
      {value:String(THREE.FrontSide), label:'Front'},
      {value:String(THREE.DoubleSide), label:'Double side'},
      {value:String(THREE.BackSide), label:'Back'},
    ], v => patchMat({side:Number(v)})).root);
    sm.body.appendChild(selectRow('Depth write', mat.depthWrite === false ? 'off' : 'on', [
      {value:'on', label:'On'},
      {value:'off', label:'Off'},
    ], v => patchMat({depthWrite:v === 'on'})).root);
    sm.body.appendChild(sliderRow('Normal str.', mat.normalScale ? mat.normalScale.x : 1, 0, 2, .05, v => patchMat({normalScale:v}), v => (+v).toFixed(2)).root);

    if(mat.transmission != null){
      sm.body.appendChild(sliderRow('Transmission', mat.transmission || 0, 0, 1, .01, v => patchMat({materialKind:'physical', transmission:v, transparent:v > 0 || mat.transparent, depthWrite:false}), v => Math.round(v * 100) + '%').root);
    }
    if(mat.ior != null){
      sm.body.appendChild(sliderRow('IOR', mat.ior || 1.45, 1, 2.4, .01, v => patchMat({materialKind:'physical', ior:v}), v => (+v).toFixed(2)).root);
    }

    addTextureSlot(sm.body, 'Base texture', tr('Albedo/base color map.', 'Mappa albedo/base color.'), 'mapSrc', 'mapDbKey', o, patchMat);
    addTextureSlot(sm.body, 'Normal map', tr('Tangent-space normal map.', 'Mappa normale tangent-space.'), 'normalMapSrc', 'normalMapDbKey', o, patchMat);
    addTextureSlot(sm.body, 'Roughness map', tr('Roughness channel map.', 'Mappa canale roughness.'), 'roughnessMapSrc', 'roughnessMapDbKey', o, patchMat);
    addTextureSlot(sm.body, 'Metallic map', tr('Metalness channel map.', 'Mappa canale metallico.'), 'metalnessMapSrc', 'metalnessMapDbKey', o, patchMat);
    addTextureSlot(sm.body, 'Alpha map', tr('Transparency/alpha channel map.', 'Mappa trasparenza/alpha.'), 'alphaMapSrc', 'alphaMapDbKey', o, patchMat);
    addTextureSlot(sm.body, 'Emission map', tr('Emissive channel map.', 'Mappa canale emissione.'), 'emissiveMapSrc', 'emissiveMapDbKey', o, patchMat);

    sm.body.appendChild(sliderRow('UV repeat X', mat.map ? mat.map.repeat.x : 1, .05, 12, .05, v => patchMat({repeatX:v}), v => (+v).toFixed(2)).root);
    sm.body.appendChild(sliderRow('UV repeat Y', mat.map ? mat.map.repeat.y : 1, .05, 12, .05, v => patchMat({repeatY:v}), v => (+v).toFixed(2)).root);
    sm.body.appendChild(sliderRow('UV offset X', mat.map ? mat.map.offset.x : 0, -2, 2, .01, v => patchMat({offsetX:v}), v => (+v).toFixed(2)).root);
    sm.body.appendChild(sliderRow('UV offset Y', mat.map ? mat.map.offset.y : 0, -2, 2, .01, v => patchMat({offsetY:v}), v => (+v).toFixed(2)).root);
    sm.body.appendChild(sliderRow('UV rotation', mat.map ? THREE.MathUtils.radToDeg(mat.map.rotation || 0) : 0, -180, 180, 1, v => patchMat({rotation:THREE.MathUtils.degToRad(v)}), v => Math.round(v) + '°').root);

    sm.body.appendChild(btnRow([
      {label:'Reset maps', action:() => patchMat({mapSrc:null, mapDbKey:null, normalMapSrc:null, normalMapDbKey:null, roughnessMapSrc:null, roughnessMapDbKey:null, metalnessMapSrc:null, metalnessMapDbKey:null, alphaMapSrc:null, alphaMapDbKey:null, emissiveMapSrc:null, emissiveMapDbKey:null})},
      {label:'Glass fix', action:() => { patchMat({materialKind:'physical', transparent:true, opacity:.28, depthWrite:false, alphaTest:0, roughness:.02, metalness:0, transmission:.65, ior:1.45, thickness:.08, side:THREE.DoubleSide, renderOrder:12}); buildInspector(); }},
      {label:'Shadows on', action:() => patchMat({castShadow:true})},
      {label:'Shadows off', action:() => patchMat({castShadow:false})},
    ]));
    box.appendChild(sm.root);
  }

  return Object.freeze({getFirstMaterial, applyMaterialPatch, build, collectMaterialSlots, materialRoot});
}

window.LK_EDITOR_MATERIAL_EDITOR = Object.freeze({create});
})();
