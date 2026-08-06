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
  const storeMaterialTextureFile = deps.storeMaterialTextureFile;
  const status = deps.status || function(){};
  const section = deps.section;
  const selectRow = deps.selectRow;
  const colorRow = deps.colorRow;
  const checkRow = deps.checkRow;
  const sliderRow = deps.sliderRow;
  const textureDrop = deps.textureDrop;
  const btnRow = deps.btnRow;
  const el = deps.el;
  const requestWarmup = deps.requestWarmup || function(){};
  const assetLibraryLoad = deps.assetLibraryLoad || function(){ return []; };
  const liveMaterialSelection = deps.liveMaterialSelection || null;
  const THREE = deps.THREE || window.THREE;
  const tr = (en, it) => window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en;
  const CAR_PAINT_PALETTES = Object.freeze({
    paint:[
      {name:'Rosso Corsa', color:0xc20d19},
      {name:'Competition Red', color:0x6e0714},
      {name:'British Racing Green', color:0x073c2e},
      {name:'Miami Blue', color:0x00a6d6},
      {name:'Midnight Blue', color:0x071a3d},
      {name:'Nardo Grey', color:0x777b7f},
      {name:'Pearl White', color:0xe8edf2},
      {name:'Piano Black', color:0x050609},
      {name:'Solar Orange', color:0xd64a0c},
      {name:'Champagne', color:0xa7895b},
    ],
    vinyl:[
      {name:'Satin Black', color:0x111317},
      {name:'Matte Charcoal', color:0x303238},
      {name:'Gloss White', color:0xf0f1ed},
      {name:'Acid Lime', color:0x8cd600},
      {name:'Electric Blue', color:0x075be8},
      {name:'Signal Yellow', color:0xf2c500},
      {name:'Magenta', color:0xb00063},
      {name:'Copper', color:0x9c4c27},
    ],
  });

  function normalizedCarPaint(value, material){
    const source = value && typeof value === 'object' ? value : {};
    return {
      enabled:source.enabled === true,
      kind:source.kind === 'vinyl' ? 'vinyl' : 'paint',
      color:source.color == null ? (material && material.color ? material.color.getHex() : 0xc20d19) : source.color,
      metallic:source.metallic == null ? .58 : Number(source.metallic),
      finish:source.finish == null ? .82 : Number(source.finish),
      clearcoat:source.clearcoat == null ? .9 : Number(source.clearcoat),
      pearl:source.pearl == null ? 0 : Number(source.pearl),
      preserveBaseMap:source.preserveBaseMap === true,
    };
  }

  function normalizedSketchMaterial(value){
    const source = value && typeof value === 'object' ? value : {};
    const mode = source.mode === 'monochrome' ? 'monochrome' : (source.mode === 'color' ? 'color' : 'off');
    return {
      enabled:source.enabled === true && mode !== 'off',
      mode,
      toneBands:Math.max(3, Math.min(8, Math.round(Number(source.toneBands) || 5))),
      preserveTexture:source.preserveTexture !== false,
      paperTint:Math.max(0, Math.min(1, Number.isFinite(Number(source.paperTint)) ? Number(source.paperTint) : .12)),
      pigmentStrength:Math.max(0, Math.min(1, Number.isFinite(Number(source.pigmentStrength)) ? Number(source.pigmentStrength) : .82)),
    };
  }

  function materialRoot(o){
    if(o && o.userData && o.userData.editorType === 'player' && GAME && GAME.player && GAME.player.getModel){
      return GAME.player.getModel() || o;
    }
    if(o && o.userData && o.userData.playerCarLogicElement && o.traverse){
      let model = null;
      o.traverse(node => {
        if(model || !node.userData) return;
        const id = String(node.userData.logicElementSceneId || '').toLowerCase();
        if(id === 'vehicle_model' || id === 'model' || node.userData.logicVehicleModel === true) model = node;
      });
      if(model) return model;
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
    const worldVisible = mesh => {
      for(let node = mesh; node; node = node.parent) if(node.visible === false) return false;
      return true;
    };
    o.traverse(n => {
      if(!n.isMesh || !n.material) return;
      if(!worldVisible(n)){ meshIndex++; return; }
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach((mat, materialIndex) => {
        if(!mat) return;
        slots.push({
          key:n.userData && n.userData.lkMeshEditId ? ('id|' + n.userData.lkMeshEditId + '|' + materialIndex) : (meshIndex + ':' + materialIndex),
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

  function getActiveTargets(o, slots){
    const wanted = Array.isArray(o.userData.materialEditorSlots) ? o.userData.materialEditorSlots : [];
    const valid = wanted.filter(key => key === 'all' || slots.some(slot => slot.key === key));
    if(valid.length) return valid.includes('all') ? ['all'] : Array.from(new Set(valid));
    return [getActiveSlot(o, slots)];
  }

  function getMaterialForTarget(o, slots, target){
    if(target && target !== 'all'){
      const slot = slots.find(item => item.key === target);
      if(slot) return slot.material;
    }
    return slots && slots[0] ? slots[0].material : getFirstMaterial(o);
  }

  function applyMaterialPatch(o, patch, warmed){
    const root = materialRoot(o);
    const slots = collectMaterialSlots(root);
    const targets = getActiveTargets(o, slots);
    const current = getMaterialForTarget(o, slots, targets[0]);
    const materialKindChanges = !!(patch && patch.materialKind && current && (
      patch.materialKind === 'physical' ? !current.isMeshPhysicalMaterial : (current.isMeshPhysicalMaterial || !current.isMeshStandardMaterial)
    ));
    const carPaintKindChanges = !!(patch && patch.carPaintOverride && current && (
      patch.carPaintOverride.enabled === true && !current.isMeshPhysicalMaterial ||
      patch.carPaintOverride.enabled === false && !!current.lkCarPaintOriginalMaterial
    ));
    const sketchKindChanges = !!(patch && patch.sketchMaterial && current && (
      patch.sketchMaterial.enabled === true && !current.lkSketchOriginalMaterial ||
      patch.sketchMaterial.enabled === false && !!current.lkSketchOriginalMaterial
    ));
    const dynamicShaderChanges = !!(patch && Object.prototype.hasOwnProperty.call(patch, 'dynamicMapType') && current && (
      (patch.dynamicMapType !== 'none' && patch.dynamicMapEnabled !== false) !== !!current.lkDynamicTextureController
    ));
    const dynamicUvShaderChanges = !!(patch && Object.prototype.hasOwnProperty.call(patch, 'dynamicAutoUv') &&
      current && current.lkDynamicTextureController &&
      (patch.dynamicAutoUv !== false) !== (current.lkDynamicTextureController.props.dynamicAutoUv !== false));
    const transparencyChanges = !!(patch && patch.transparent != null && current && !!patch.transparent !== !!current.transparent);
    const changesShader = !!(patch && (
      Object.prototype.hasOwnProperty.call(patch, 'castShadow') ||
      transparencyChanges ||
      materialKindChanges ||
      carPaintKindChanges ||
      sketchKindChanges ||
      dynamicShaderChanges ||
      dynamicUvShaderChanges
    ));
    if(changesShader && !warmed){
      const label = Object.prototype.hasOwnProperty.call(patch, 'castShadow')
        ? (patch.castShadow ? tr('Warm-up shadows...', 'Preparazione ombre...') : tr('Warm-up render...', 'Preparazione rendering...'))
        : tr('Warm-up material...', 'Preparazione materiale...');
      requestWarmup(label);
      if(targets.includes('all')) STORE.stageMatProps(root, Object.assign({allowGlobal:true}, patch));
      else targets.forEach(target => STORE.stageMatProps(root, Object.assign({materialSlot:target}, patch)));
      if(root !== o) o.userData.matProps = root.userData.matProps;
      markDirty();
      requestAnimationFrame(() => applyMaterialPatch(o, patch, true));
      return;
    }
    if(targets.includes('all')) STORE.applyMatProps(root, Object.assign({allowGlobal:true}, patch));
    else targets.forEach(target => STORE.applyMatProps(root, Object.assign({materialSlot:target}, patch)));
    if(root !== o) o.userData.matProps = root.userData.matProps;
    thumbCache.delete(o.userData.editorId);
    markDirty();
  }

  function normalizeDisplayedOpaqueSlots(o, root, slots){
    const fixed = [];
    const stored = STORE.normalizeStoredMatProps
      ? STORE.normalizeStoredMatProps(root && root.userData && root.userData.matProps)
      : {global:{}, slots:{}};
    slots.forEach(slot => {
      const mat = slot && slot.material;
      if(!mat || mat.opacity == null) return;
      const authored = Object.assign({}, stored.global || {}, stored.slots && stored.slots[slot.key] || {});
      const authoredOpaque = Number(authored.opacity) >= 1 &&
        authored.transparent === false &&
        authored.depthWrite !== false;
      const displayedAsOpaque = mat.opacity < 1 && Math.round(mat.opacity * 100) === 100;
      const runtimeContradictsOpaque = mat.opacity < 1 ||
        mat.transparent === true ||
        mat.depthWrite === false ||
        Number(mat.transmission) > 0;
      if(authoredOpaque && !runtimeContradictsOpaque) return;
      if(!authoredOpaque && !displayedAsOpaque) return;
      if(!authoredOpaque && ((mat.transmission || 0) > 0 || (mat.alphaTest || 0) > 0 || mat.alphaMap)) return;
      STORE.applyMatProps(root, {
        materialSlot:slot.key,
        ...(authored.materialKind ? {materialKind:authored.materialKind} : {}),
        opacity:1,
        transparent:false,
        depthWrite:true,
        transmission:0,
      });
      fixed.push(slot.key);
    });
    if(!fixed.length) return 0;
    if(root !== o) o.userData.matProps = root.userData.matProps;
    thumbCache.delete(o.userData.editorId);
    markDirty();
    return fixed.length;
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
      if(!storeMaterialTextureFile){
        status(tr('Texture storage unavailable', 'Storage texture non disponibile'));
        return;
      }
      status(tr('Storing material texture…', 'Salvataggio texture materiale…'));
      storeMaterialTextureFile(f).then(asset => {
        applyPatch(texturePatchFromAsset(asset, srcKey, dbKey));
        status(tr('Material texture stored in project assets ✓', 'Texture materiale salvata negli asset del progetto ✓'));
      }).catch(error => {
        console.warn('LotKing material texture storage failed', error);
        status(tr('Material texture failed: ', 'Texture materiale non salvata: ') + (error && error.message || error));
      });
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
      // The checker belongs to texture previews, not to a valid solid-color
      // material. An empty inline value would re-enable the shared CSS checker.
      swatch.style.backgroundImage = 'none';
    }
    swatch.style.opacity = String(Math.max(.2, opacity));
    const title = preview.querySelector('strong');
    const facts = preview.querySelector('small');
    title.textContent = targetLabel;
    facts.textContent =
      'COLOR ' + color.toUpperCase() + '  ·  ' +
      'ROUGH ' + ((mat && mat.roughness != null ? mat.roughness : 0).toFixed(2)) + '  ·  ' +
      'METAL ' + ((mat && mat.metalness != null ? mat.metalness : 0).toFixed(2)) + '  ·  ' +
      'OPACITY ' + Number(opacity).toFixed(3).replace(/0+$/,'').replace(/\.$/,'') +
      (mat && mat.userData && mat.userData.lkCarPaintActive ? '  ·  PAINT OVERRIDE' : '') +
      (mat && mat.userData && mat.userData.lkSketchMaterialActive ? '  ·  SKETCH MATERIAL' : '');
    text.textContent = '';
    text.append(title, facts);
  }

  function materialPreview(mat, targetLabel){
    const preview = el('<div class="lk-material-preview"><div class="lk-material-swatch"></div><span><strong></strong><small></small></span></div>');
    preview.lkRefresh = nextMat => updateMaterialPreview(preview, nextMat || mat, targetLabel);
    preview.lkRefresh(mat);
    return preview;
  }

  function build(box, o){
    if(o.userData.editorType !== 'mesh' && o.userData.editorType !== 'player') return;
    const root = materialRoot(o);
    const sm = section(tr('EDIT MATERIAL', 'MODIFICA MATERIALE'));
    sm.root.classList.add('lk-material-editor');
    if(sm.root.classList.contains('closed')){
      sm.body.appendChild(el('<div class="lk-hint">' + tr('Open this section to inspect material slots.', 'Apri questa sezione per analizzare gli slot materiale.') + '</div>'));
      const header = sm.root.querySelector('.lk-sec-h');
      if(header) header.addEventListener('click', () => requestAnimationFrame(buildInspector), {once:true});
      box.appendChild(sm.root);
      return;
    }
    if(STORE.assignMeshEditIds && (o.userData.editorType === 'mesh' || o.userData.editorType === 'player')) STORE.assignMeshEditIds(root);
    const slots = collectMaterialSlots(root);
    if(!slots.length) return;
    const normalizedOpaque = normalizeDisplayedOpaqueSlots(o, root, slots);
    const targets = getActiveTargets(o, slots);
    const target = targets.length > 1 ? '__multi__' : targets[0];
    o.userData.materialEditorSlots = targets.slice();
    o.userData.materialEditorSlot = target;
    const mat = getMaterialForTarget(o, slots, targets[0]);
    if(!mat) return;
    const authoredMat = mat.lkSketchOriginalMaterial || mat;
    const activeSlot = targets[0] === 'all' ? slots[0] : slots.find(slot => slot.key === targets[0]);

    sm.body.appendChild(el('<div class="lk-hint">' + tr(
      'Choose All materials or a single GLB material slot. Transparent glass usually needs Blend alpha and Depth write off.',
      'Scegli Tutti i materiali o un singolo slot materiale del GLB. Per vetri trasparenti di solito servono alpha Blend e Depth write off.'
    ) + '</div>'));
    if(normalizedOpaque){
      sm.body.appendChild(el('<div class="lk-material-repair">✓ ' + normalizedOpaque + ' ' + tr(
        normalizedOpaque === 1 ? 'material normalized to the true opaque path' : 'materials normalized to the true opaque path',
        normalizedOpaque === 1 ? 'materiale normalizzato sul percorso realmente opaco' : 'materiali normalizzati sul percorso realmente opaco'
      ) + '</div>'));
    }

    sm.body.appendChild(selectRow('Target', target, [
      {value:'all', label:tr('All materials', 'Tutti i materiali')},
      ...(targets.length > 1 ? [{value:'__multi__', label:targets.length + tr(' selected materials', ' materiali selezionati')}] : []),
      ...slots.map(slot => ({value:slot.key, label:slot.label})),
    ], v => {
      if(v === '__multi__') return;
      o.userData.materialEditorSlot = v;
      o.userData.materialEditorSlots = [v];
      if(liveMaterialSelection && liveMaterialSelection.setIds) liveMaterialSelection.setIds(o, [v]);
      if(liveMaterialSelection && liveMaterialSelection.sync) liveMaterialSelection.sync(o);
      buildInspector();
    }).root);
    const activeLabel = targets.length > 1 ? (targets.length + tr(' selected materials', ' materiali selezionati')) : (target === 'all' ? tr('All materials', 'Tutti i materiali') : (slots.find(slot => slot.key === target) || {}).label || target);
    const preview = materialPreview(mat, activeLabel);
    const currentMaterial = () => {
      const wanted = (o.userData.materialEditorSlots || [o.userData.materialEditorSlot])[0];
      const slot = wanted === 'all' || !wanted ? slots[0] : slots.find(item => item.key === wanted) || slots[0];
      if(!slot || !slot.mesh) return slot && slot.material;
      const materials = Array.isArray(slot.mesh.material) ? slot.mesh.material : [slot.mesh.material];
      return materials[slot.materialIndex] || materials[0] || slot.material;
    };
    const patchMat = patch => {
      applyMaterialPatch(o, patch);
      if(preview.lkRefresh) preview.lkRefresh(currentMaterial());
    };
    const storedProps = STORE.normalizeStoredMatProps
      ? STORE.normalizeStoredMatProps(root.userData.matProps)
      : (root.userData.matProps || {});
    const activeStored = target !== 'all' && storedProps.slots
      ? (storedProps.slots[target] || {})
      : (storedProps.global || storedProps);
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
          'Live selection is active: click for one material, Ctrl/Shift-click to add or remove material slots. All selected slots receive the same edits.',
          'Selezione live attiva: clicca per un materiale, Ctrl/Shift-clic per aggiungere o rimuovere slot. Tutti gli slot selezionati ricevono le stesse modifiche.'
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
        matte: {materialKind:'standard', roughness:.92, metalness:0, opacity:1, transparent:false, depthWrite:true, alphaTest:0, transmission:0, emissiveIntensity:0},
        plastic: {materialKind:'standard', roughness:.45, metalness:.05, opacity:1, transparent:false, depthWrite:true, alphaTest:0, transmission:0, emissiveIntensity:0},
        metal: {materialKind:'standard', roughness:.22, metalness:1, opacity:1, transparent:false, depthWrite:true, alphaTest:0, transmission:0, emissiveIntensity:0},
        glass: {materialKind:'physical', roughness:.02, metalness:0, opacity:.28, transparent:true, depthWrite:false, alphaTest:0, transmission:.65, ior:1.45, thickness:.08, side:THREE.DoubleSide, renderOrder:12, emissiveIntensity:0},
        emissive: {materialKind:'standard', roughness:.35, metalness:0, opacity:1, transparent:false, depthWrite:true, alphaTest:0, transmission:0, emissiveIntensity:1.6},
      };
      if(presets[v]){
        const nextPreset = Object.assign({}, presets[v]);
        if(activeStored.carPaintOverride && activeStored.carPaintOverride.enabled){
          nextPreset.carPaintOverride = Object.assign({}, activeStored.carPaintOverride, {enabled:false});
        }
        patchMat(nextPreset);
      }
      buildInspector();
    });
    sm.body.appendChild(preset.root);

    const sketch = normalizedSketchMaterial(activeStored.sketchMaterial);
    const sketchCard = el('<div class="lk-car-paint-card lk-sketch-material-card"><div class="lk-car-paint-head"><span><b>SKETCH MATERIAL</b><small>NON-DESTRUCTIVE TOON LAYER</small></span></div><div class="lk-car-paint-controls"></div></div>');
    sketchCard.classList.toggle('on', sketch.enabled);
    const sketchControls = sketchCard.querySelector('.lk-car-paint-controls');
    const applySketch = patch => {
      Object.assign(sketch, patch || {});
      sketch.enabled = sketch.mode !== 'off';
      patchMat({sketchMaterial:Object.assign({}, sketch)});
    };
    sketchControls.appendChild(selectRow(tr('Material visual style', 'Stile visivo materiale'), sketch.mode, [
      {value:'off', label:tr('Original material', 'Materiale originale')},
      {value:'color', label:tr('Color Sketch', 'Sketch a colori')},
      {value:'monochrome', label:tr('Monochrome Ink', 'Inchiostro monocromatico')},
    ], value => {
      applySketch({mode:value, enabled:value !== 'off'});
      buildInspector();
    }).root);
    sketchControls.appendChild(sliderRow(tr('Tonal drawing bands', 'Fasce tonali disegno'), sketch.toneBands, 3, 8, 1,
      value => applySketch({toneBands:Math.round(value)}), value => Math.round(value) + tr(' bands', ' fasce')).root);
    sketchControls.appendChild(sliderRow(tr('Warm paper tint', 'Tinta carta calda'), sketch.paperTint, 0, 1, .01,
      value => applySketch({paperTint:value}), value => Math.round(value * 100) + '%').root);
    sketchControls.appendChild(sliderRow(tr('Color pigment response', 'Risposta pigmento colore'), sketch.pigmentStrength, 0, 1, .01,
      value => applySketch({pigmentStrength:value}), value => Math.round(value * 100) + '%').root);
    if(checkRow){
      sketchControls.appendChild(checkRow(tr('Preserve texture detail', 'Mantieni dettaglio texture'), sketch.preserveTexture,
        value => applySketch({preserveTexture:value})).root);
    }
    sketchControls.appendChild(el('<div class="lk-hint">' + tr(
      'This affects only the selected material slots and keeps the exact original instance underneath. Color Sketch derives an illustrated pigment texture and toon-lit shadow bands; Monochrome Ink derives a grayscale texture. Transparency, alpha, emission, normals and authored texture transforms are preserved.',
      'Questo agisce solo sugli slot selezionati e mantiene sotto l’istanza originale esatta. Sketch a colori deriva una texture a pigmento illustrato e fasce d’ombra toon; Inchiostro monocromatico deriva una texture in scala di grigi. Trasparenza, alpha, emissione, normali e trasformazioni della texture vengono preservate.'
    ) + '</div>'));
    sm.body.appendChild(sketchCard);

    const paint = normalizedCarPaint(activeStored.carPaintOverride, authoredMat);
    const paintCard = el('<div class="lk-car-paint-card"><div class="lk-car-paint-head"><span><b>CAR PAINT / VINYL</b><small>NON-DESTRUCTIVE OVERRIDE</small></span><label class="lk-car-paint-toggle"><input type="checkbox"><i></i></label></div><div class="lk-car-paint-stack"><div class="lk-car-paint-layer override"><i></i><span><b>Override layer</b><small></small></span></div><div class="lk-car-paint-connector">↓</div><div class="lk-car-paint-layer original"><i></i><span><b>Original GLB material</b><small>Protected · restored when override is off</small></span></div></div><div class="lk-car-paint-controls"></div></div>');
    paintCard.classList.toggle('on', paint.enabled);
    const paintToggle = paintCard.querySelector('input');
    const overrideSwatch = paintCard.querySelector('.lk-car-paint-layer.override > i');
    const originalSwatch = paintCard.querySelector('.lk-car-paint-layer.original > i');
    const overrideInfo = paintCard.querySelector('.lk-car-paint-layer.override small');
    const originalMaterial = authoredMat.lkCarPaintOriginalMaterial || authoredMat;
    const originalBase = authoredMat.lkCarPaintBase || null;
    const originalColor = originalBase && originalBase.color || originalMaterial.color;
    const originalMap = originalBase && originalBase.map || originalMaterial.map;
    paintToggle.checked = paint.enabled;
    overrideSwatch.style.backgroundColor = '#' + ('000000' + (Number(paint.color) >>> 0).toString(16)).slice(-6);
    originalSwatch.style.backgroundColor = originalColor ? '#' + originalColor.getHexString() : '#ffffff';
    if(originalMap && originalMap.image){
      const originalSrc = originalMap.image.currentSrc || originalMap.image.src || '';
      if(originalSrc) originalSwatch.style.backgroundImage = 'url(' + originalSrc + ')';
    }
    overrideInfo.textContent = paint.enabled
      ? ((paint.kind === 'vinyl' ? 'VINYL' : 'PAINT') + ' · ' + Math.round(paint.finish * 100) + '% FINISH')
      : 'OFF · original material is rendering';
    const applyPaint = patch => {
      Object.assign(paint, patch || {});
      patchMat({carPaintOverride:Object.assign({}, paint)});
    };
    paintToggle.addEventListener('change', () => {
      applyPaint({enabled:paintToggle.checked});
      buildInspector();
    });
    const paintControls = paintCard.querySelector('.lk-car-paint-controls');
    paintControls.appendChild(selectRow(tr('Surface family', 'Tipo superficie'), paint.kind, [
      {value:'paint', label:tr('Automotive paint', 'Vernice automobilistica')},
      {value:'vinyl', label:tr('Vinyl wrap', 'Pellicola vinile')},
    ], value => {
      const vinyl = value === 'vinyl';
      applyPaint({
        enabled:true,
        kind:value,
        metallic:vinyl ? .05 : .58,
        finish:vinyl ? .62 : .82,
        clearcoat:vinyl ? .5 : .9,
        pearl:0,
      });
      buildInspector();
    }).root);
    const palette = el('<div class="lk-car-paint-palette"><label>' + tr('Quick manufacturer-style palette', 'Palette rapida stile costruttore') + '</label><div></div></div>');
    const paletteGrid = palette.querySelector('div');
    (CAR_PAINT_PALETTES[paint.kind] || CAR_PAINT_PALETTES.paint).forEach(entry => {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = entry.name;
      button.setAttribute('aria-label', entry.name);
      button.style.setProperty('--paint-color', '#' + ('000000' + entry.color.toString(16)).slice(-6));
      button.classList.toggle('selected', Number(paint.color) === entry.color);
      button.addEventListener('click', () => {
        applyPaint({enabled:true, color:entry.color});
        buildInspector();
      });
      paletteGrid.appendChild(button);
    });
    paintControls.appendChild(palette);
    paintControls.appendChild(colorRow(tr('Custom override color', 'Colore override personalizzato'), Number(paint.color), value => applyPaint({enabled:true, color:value})).root);
    paintControls.appendChild(sliderRow(tr('Metallic brilliance', 'Brillantezza metallizzata'), paint.metallic, 0, 1, .01,
      value => applyPaint({enabled:true, metallic:value}), value => Math.round(value * 100) + '%').root);
    paintControls.appendChild(sliderRow(tr('Reflection / finish', 'Riflessione / finitura'), paint.finish, 0, 1, .01,
      value => applyPaint({enabled:true, finish:value}), value => {
        if(value < .3) return tr('Matte ', 'Opaca ') + Math.round(value * 100) + '%';
        if(value < .72) return tr('Satin ', 'Satinata ') + Math.round(value * 100) + '%';
        return tr('Gloss ', 'Lucida ') + Math.round(value * 100) + '%';
      }).root);
    paintControls.appendChild(sliderRow(tr('Clear coat', 'Trasparente protettivo'), paint.clearcoat, 0, 1, .01,
      value => applyPaint({enabled:true, clearcoat:value}), value => Math.round(value * 100) + '%').root);
    paintControls.appendChild(sliderRow(tr('Pearl shift', 'Riflesso perlato'), paint.pearl, 0, 1, .01,
      value => applyPaint({enabled:true, pearl:value}), value => Math.round(value * 100) + '%').root);
    if(checkRow){
      paintControls.appendChild(checkRow(
        tr('Preserve original base texture detail', 'Mantieni i dettagli della texture base originale'),
        paint.preserveBaseMap,
        value => applyPaint({enabled:true, preserveBaseMap:value})
      ).root);
    }
    paintControls.appendChild(el('<div class="lk-hint">' + tr(
      'Finish is the fast realism control: it coordinates roughness, reflection strength and clear-coat sharpness. Pearl is intentionally restrained for believable automotive paint.',
      'Finitura è il controllo rapido del realismo: coordina roughness, forza dei riflessi e nitidezza del trasparente. Il perlato è volutamente contenuto per una vernice credibile.'
    ) + '</div>'));
    paintControls.appendChild(btnRow([
      {label:tr('Disable · restore original', 'Disattiva · ripristina originale'), action:() => {
        applyPaint({enabled:false});
        buildInspector();
      }},
    ]));
    sm.body.appendChild(paintCard);
    let dynamicType = activeStored.dynamicMapType || 'none';
    if(dynamicType === 'video' && /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(String(activeStored.dynamicVideoUrl || ''))){
      dynamicType = 'youtube';
    }
    const dynamicOverrideEnabled = dynamicType !== 'none' && activeStored.dynamicMapEnabled !== false;
    sm.body.appendChild(el('<div class="lk-material-underlay-title"><span>BASE MATERIAL</span><b>' + tr(
      paint.enabled || dynamicOverrideEnabled || sketch.enabled ? 'Original controls below the active override' : 'Direct material controls',
      paint.enabled || dynamicOverrideEnabled || sketch.enabled ? 'Controlli originali sotto l’override attivo' : 'Controlli diretti del materiale'
    ) + '</b></div>'));
    const underlayControls = el('<div class="lk-material-underlay-controls"></div>');
    if(paint.enabled || dynamicOverrideEnabled || sketch.enabled){
      underlayControls.classList.add('locked');
      underlayControls.appendChild(el('<div class="lk-hint">' + tr(
        sketch.enabled
          ? 'Disable the Sketch Material layer to edit the exact original material underneath.'
          : dynamicOverrideEnabled
          ? 'Disable the media Base Color override to edit the protected material below it.'
          : 'Disable the paint override to edit the original scalar material. Its textures remain available to the Preserve detail option above.',
        sketch.enabled
          ? 'Disattiva il livello Sketch Material per modificare il materiale originale esatto sottostante.'
          : dynamicOverrideEnabled
          ? 'Disattiva l’override media Base Color per modificare il materiale protetto sottostante.'
          : 'Disattiva l’override vernice per modificare i valori originali del materiale. Le sue texture restano disponibili tramite Mantieni dettagli qui sopra.'
      ) + '</div>'));
    }
    underlayControls.appendChild(colorRow('Base color', authoredMat.color ? authoredMat.color.getHex() : 0xffffff, v => patchMat({color:v})).root);
    underlayControls.appendChild(colorRow('Emission color', authoredMat.emissive ? authoredMat.emissive.getHex() : 0x000000, v => patchMat({emissive:v})).root);
    underlayControls.appendChild(sliderRow('Emission', authoredMat.emissiveIntensity != null ? authoredMat.emissiveIntensity : 0, 0, 3, .05, v => patchMat({emissiveIntensity:v}), v => (+v).toFixed(2)).root);
    underlayControls.appendChild(sliderRow('Roughness', authoredMat.roughness != null ? authoredMat.roughness : .7, 0, 1, .01, v => patchMat({roughness:v}), v => Math.round(v * 100) + '%').root);
    underlayControls.appendChild(sliderRow('Metallic', authoredMat.metalness != null ? authoredMat.metalness : 0, 0, 1, .01, v => patchMat({metalness:v}), v => Math.round(v * 100) + '%').root);
    underlayControls.appendChild(sliderRow('Opacity', authoredMat.opacity != null ? authoredMat.opacity : 1, 0, 1, .01, v => patchMat({
      opacity:v,
      transparent:v < 1,
      depthWrite:v >= 1,
      ...(v >= 1 ? {transmission:0} : {}),
    }), v => {
      const exact = Number(v);
      return Math.round(exact * 100) + '% · ' + exact.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
    }).root);
    underlayControls.appendChild(sliderRow('Alpha cut', authoredMat.alphaTest != null ? authoredMat.alphaTest : 0, 0, .9, .01, v => patchMat({alphaTest:v}), v => (+v).toFixed(2)).root);
    underlayControls.appendChild(selectRow('Alpha mode', authoredMat.transparent ? 'blend' : (authoredMat.alphaTest > 0 ? 'cutout' : 'opaque'), [
      {value:'opaque', label:'Opaque'},
      {value:'blend', label:'Blend transparent'},
      {value:'cutout', label:'Cutout / alpha test'},
    ], v => {
      if(v === 'blend') patchMat({transparent:true, depthWrite:false, alphaTest:0, materialKind:'standard'});
      if(v === 'cutout') patchMat({transparent:false, depthWrite:true, alphaTest:Math.max(.1, authoredMat.alphaTest || .35), materialKind:'standard'});
      if(v === 'opaque') patchMat({materialKind:'standard', transparent:false, depthWrite:true, opacity:1, alphaTest:0, transmission:0});
      buildInspector();
    }).root);
    underlayControls.appendChild(selectRow('Side', String(authoredMat.side == null ? THREE.FrontSide : authoredMat.side), [
      {value:String(THREE.FrontSide), label:'Front'},
      {value:String(THREE.DoubleSide), label:'Double side'},
      {value:String(THREE.BackSide), label:'Back'},
    ], v => patchMat({side:Number(v)})).root);
    underlayControls.appendChild(selectRow('Depth write', authoredMat.depthWrite === false ? 'off' : 'on', [
      {value:'on', label:'On'},
      {value:'off', label:'Off'},
    ], v => patchMat({depthWrite:v === 'on'})).root);
    underlayControls.appendChild(sliderRow(tr('Render priority', 'Priorita render'), activeSlot && activeSlot.mesh ? (activeSlot.mesh.renderOrder || 0) : (o.renderOrder || 0), -20, 120, 1, v => patchMat({renderOrder:v}), v => String(Math.round(v))).root);
    underlayControls.appendChild(sliderRow('Normal str.', authoredMat.normalScale ? authoredMat.normalScale.x : 1, 0, 2, .05, v => patchMat({normalScale:v}), v => (+v).toFixed(2)).root);

    if(authoredMat.transmission != null){
      underlayControls.appendChild(sliderRow('Transmission', authoredMat.transmission || 0, 0, 1, .01, v => patchMat({materialKind:'physical', transmission:v, transparent:v > 0 || authoredMat.transparent, depthWrite:false}), v => Math.round(v * 100) + '%').root);
    }
    if(authoredMat.ior != null){
      underlayControls.appendChild(sliderRow('IOR', authoredMat.ior || 1.45, 1, 2.4, .01, v => patchMat({materialKind:'physical', ior:v}), v => (+v).toFixed(2)).root);
    }

    addTextureSlot(underlayControls, 'Base texture', tr('Albedo/base color map.', 'Mappa albedo/base color.'), 'mapSrc', 'mapDbKey', o, patch => patchMat(Object.assign({dynamicMapType:'none'}, patch)));
    addTextureSlot(underlayControls, 'Normal map', tr('Tangent-space normal map.', 'Mappa normale tangent-space.'), 'normalMapSrc', 'normalMapDbKey', o, patchMat);
    addTextureSlot(underlayControls, 'Roughness map', tr('Roughness channel map.', 'Mappa canale roughness.'), 'roughnessMapSrc', 'roughnessMapDbKey', o, patchMat);
    addTextureSlot(underlayControls, 'Metallic map', tr('Metalness channel map.', 'Mappa canale metallico.'), 'metalnessMapSrc', 'metalnessMapDbKey', o, patchMat);
    addTextureSlot(underlayControls, 'Alpha map', tr('Transparency/alpha channel map.', 'Mappa trasparenza/alpha.'), 'alphaMapSrc', 'alphaMapDbKey', o, patchMat);
    addTextureSlot(underlayControls, 'Emission map', tr('Emissive channel map.', 'Mappa canale emissione.'), 'emissiveMapSrc', 'emissiveMapDbKey', o, patchMat);
    if(paint.enabled || dynamicOverrideEnabled || sketch.enabled) underlayControls.querySelectorAll('input,select,button,.lk-drop').forEach(control => {
      if('disabled' in control) control.disabled = true;
      control.setAttribute('aria-disabled', 'true');
      if(control.classList && control.classList.contains('lk-drop')) control.style.pointerEvents = 'none';
    });
    sm.body.appendChild(underlayControls);

    const dynamicDraft = {
      dynamicMapType:dynamicType,
      dynamicMapEnabled:dynamicOverrideEnabled,
      dynamicResolution:Number(activeStored.dynamicResolution) || 1024,
      dynamicRefreshHz:Number(activeStored.dynamicRefreshHz) || 15,
      dynamicHudStyle:activeStored.dynamicHudStyle || 'sport',
      dynamicVideoUrl:activeStored.dynamicVideoUrl || activeStored.dynamicYoutubeUrl || '',
      dynamicVideoMuted:activeStored.dynamicVideoMuted !== false,
      dynamicVideoLoop:activeStored.dynamicVideoLoop !== false,
      dynamicAutoUv:activeStored.dynamicAutoUv !== false,
      dynamicRepeatX:activeStored.dynamicRepeatX == null ? 1 : Number(activeStored.dynamicRepeatX),
      dynamicRepeatY:activeStored.dynamicRepeatY == null ? 1 : Number(activeStored.dynamicRepeatY),
      dynamicOffsetX:activeStored.dynamicOffsetX == null ? 0 : Number(activeStored.dynamicOffsetX),
      dynamicOffsetY:activeStored.dynamicOffsetY == null ? 0 : Number(activeStored.dynamicOffsetY),
      dynamicRotation:activeStored.dynamicRotation == null ? 0 : Number(activeStored.dynamicRotation),
      dynamicRoughness:activeStored.dynamicRoughness == null ? .72 : Number(activeStored.dynamicRoughness),
      dynamicMetalness:activeStored.dynamicMetalness == null ? 0 : Number(activeStored.dynamicMetalness),
      dynamicSaturation:activeStored.dynamicSaturation == null ? 1 : Number(activeStored.dynamicSaturation),
      dynamicScreenEmission:activeStored.dynamicScreenEmission == null ? 1 : Number(activeStored.dynamicScreenEmission),
    };
    const dynamicIdentity = extra => {
      Object.assign(dynamicDraft, extra || {});
      return Object.assign({}, dynamicDraft);
    };
    sm.body.appendChild(selectRow(tr('Dynamic texture', 'Texture dinamica'), dynamicType, [
      {value:'none', label:tr('Off / static texture', 'Off / texture statica')},
      {value:'vehicle-hud', label:tr('Vehicle dashboard HUD', 'HUD cruscotto veicolo')},
      {value:'radio-hud', label:tr('HUD / Radio TAB surface', 'Superficie HUD / Radio TAB')},
      {value:'youtube', label:tr('Interactive YouTube player', 'Player YouTube interattivo')},
      {value:'video', label:tr('Direct video URL', 'URL video diretto')},
    ], v => {
      patchMat(dynamicIdentity({dynamicMapType:v, dynamicMapEnabled:v !== 'none'}));
      buildInspector();
    }).root);
    if(dynamicType !== 'none' && checkRow){
      sm.body.appendChild(checkRow(
        tr('Override Base Color with this screen', 'Sovrascrivi Base Color con questo schermo'),
        dynamicOverrideEnabled,
        value => {
          patchMat(dynamicIdentity({dynamicMapEnabled:value}));
          buildInspector();
        }
      ).root);
      sm.body.appendChild(el('<div class="lk-hint">' + tr(
        dynamicOverrideEnabled
          ? 'ON · the dynamic screen is the visible top layer; the original GLB color and texture are protected underneath.'
          : 'OFF · the original GLB material is visible; the configured screen remains saved and can be restored with one click.',
        dynamicOverrideEnabled
          ? 'ON · lo schermo dinamico è il livello visibile superiore; colore e texture GLB originali sono protetti sotto.'
          : 'OFF · è visibile il materiale GLB originale; lo schermo configurato resta salvato e si riattiva con un clic.'
      ) + '</div>'));
      sm.body.appendChild(checkRow(
        tr('Auto-fit screen UV · separate channel', 'Adatta UV schermo · canale separato'),
        activeStored.dynamicAutoUv !== false,
        value => patchMat(dynamicIdentity({dynamicAutoUv:value}))
      ).root);
      sm.body.appendChild(el('<div class="lk-hint">' + tr(
        'Recommended for imported GLB screens. It projects the complete display through a spare UV channel without changing the model’s original UV map. Turn it off to use authored UVs.',
        'Consigliato per gli schermi GLB importati. Proietta l’intero display tramite un canale UV libero senza modificare la UV originale del modello. Disattivalo per usare le UV create manualmente.'
      ) + '</div>'));
    }
    if(dynamicType === 'vehicle-hud'){
      sm.body.appendChild(selectRow(tr('Dashboard style', 'Stile cruscotto'), activeStored.dynamicHudStyle || 'sport', [
        {value:'sport', label:tr('Sport cinematic', 'Sport cinematografico')},
        {value:'minimal', label:'Minimal'},
        {value:'telemetry', label:tr('Track telemetry', 'Telemetria pista')},
      ], v => {
        patchMat(dynamicIdentity({dynamicHudStyle:v}));
        buildInspector();
      }).root);
      sm.body.appendChild(selectRow(tr('Texture resolution', 'Risoluzione texture'), String(activeStored.dynamicResolution || 1024), [
        {value:'512', label:'512 × 256'},
        {value:'1024', label:'1024 × 512'},
        {value:'2048', label:'2048 × 1024'},
      ], v => {
        patchMat(dynamicIdentity({dynamicResolution:Number(v)}));
        buildInspector();
      }).root);
      sm.body.appendChild(sliderRow(tr('HUD refresh', 'Aggiornamento HUD'), Number(activeStored.dynamicRefreshHz) || 15, 5, 30, 1,
        v => patchMat(dynamicIdentity({dynamicRefreshHz:v})),
        v => Math.round(v) + ' Hz').root);
      sm.body.appendChild(el('<div class="lk-hint">' + tr(
        'Uses the possessed vehicle telemetry. Canvas redraw is throttled and skipped when displayed values do not change.',
        'Usa la telemetria del veicolo posseduto. Il ridisegno Canvas è limitato e viene saltato quando i valori mostrati non cambiano.'
      ) + '</div>'));
    }
    if(dynamicType === 'radio-hud'){
      sm.body.appendChild(selectRow(tr('Texture resolution', 'Risoluzione texture'), String(activeStored.dynamicResolution || 1024), [
        {value:'512', label:'512 × 256'},
        {value:'1024', label:'1024 × 512'},
        {value:'2048', label:'2048 × 1024'},
      ], v => {
        patchMat(dynamicIdentity({dynamicResolution:Number(v)}));
        buildInspector();
      }).root);
      sm.body.appendChild(sliderRow(tr('UI refresh', 'Aggiornamento UI'), Number(activeStored.dynamicRefreshHz) || 15, 5, 30, 1,
        v => patchMat(dynamicIdentity({dynamicRefreshHz:v})),
        v => Math.round(v) + ' Hz').root);
      sm.body.appendChild(el('<div class="lk-hint">' + tr(
        'Mirrors the project Radio TAB state on this material. Click its playback, shuffle, volume or bass controls directly on the mesh; use the UV controls below to fit the screen.',
        'Replica lo stato della Radio TAB del progetto su questo materiale. Clicca riproduzione, shuffle, volume o bass direttamente sulla mesh; usa i controlli UV sotto per adattare lo schermo.'
      ) + '</div>'));
    }
    if(dynamicType === 'youtube'){
      const youtubeRow = el('<div class="lk-row"><label>' + tr('YouTube URL', 'URL YouTube') + '</label><input type="url" placeholder="https://youtu.be/…"></div>');
      const youtubeInput = youtubeRow.querySelector('input');
      youtubeInput.value = activeStored.dynamicVideoUrl || activeStored.dynamicYoutubeUrl || '';
      youtubeInput.addEventListener('change', () => patchMat(dynamicIdentity({
        dynamicVideoUrl:youtubeInput.value.trim(),
      })));
      sm.body.appendChild(youtubeRow);
      sm.body.appendChild(el('<div class="lk-hint">' + tr(
        'The mesh displays an interactive launcher; clicking it opens the official privacy-enhanced player with real controls. Browser cross-origin security does not permit copying live YouTube iframe frames into WebGL. Use a direct CORS-enabled MP4/WebM when the moving video itself must render on the mesh.',
        'La mesh mostra un lanciatore interattivo; cliccandola si apre il player ufficiale in modalità privacy avanzata con i controlli reali. La sicurezza cross-origin del browser non consente di copiare i frame live dell’iframe YouTube dentro WebGL. Usa un MP4/WebM diretto con CORS quando il video in movimento deve apparire sulla mesh.'
      ) + '</div>'));
    }
    if(dynamicType === 'video'){
      const videoRow = el('<div class="lk-row"><label>' + tr('Video URL', 'URL video') + '</label><input type="url" placeholder="https://…/video.mp4"></div>');
      const videoInput = videoRow.querySelector('input');
      videoInput.value = activeStored.dynamicVideoUrl || '';
      videoInput.addEventListener('change', () => {
        const value = videoInput.value.trim();
        patchMat(dynamicIdentity({
          dynamicMapType:/(?:youtube\.com|youtu\.be|youtube-nocookie\.com)/i.test(value) ? 'youtube' : 'video',
          dynamicVideoUrl:value,
        }));
        buildInspector();
      });
      sm.body.appendChild(videoRow);
      if(checkRow){
        sm.body.appendChild(checkRow(
          tr('Mute video audio', 'Disattiva audio video'),
          activeStored.dynamicVideoMuted !== false,
          value => patchMat(dynamicIdentity({dynamicVideoMuted:value}))
        ).root);
      }
      sm.body.appendChild(el('<div class="lk-hint">' + tr(
        'Use a direct CORS-enabled MP4/WebM URL. Pasting a YouTube URL automatically switches to the interactive official player. An unmuted direct video may require clicking the mesh once before browser autoplay permits sound.',
        'Usa un URL diretto MP4/WebM con CORS. Incollando un URL YouTube si passa automaticamente al player ufficiale interattivo. Un video diretto con audio può richiedere un clic sulla mesh prima che il browser ne consenta la riproduzione.'
      ) + '</div>'));
    }
    if(dynamicType !== 'none'){
      sm.body.appendChild(sliderRow(tr('Screen emission', 'Emissione schermo'), activeStored.dynamicScreenEmission == null ? 1 : Number(activeStored.dynamicScreenEmission), 0, 4, .05, v => {
        patchMat(dynamicIdentity({dynamicScreenEmission:v}));
      }, v => (+v).toFixed(2) + '×').root);
      sm.body.appendChild(sliderRow(tr('Screen roughness', 'Roughness schermo'), activeStored.dynamicRoughness == null ? .72 : Number(activeStored.dynamicRoughness), 0, 1, .01,
        v => patchMat(dynamicIdentity({dynamicRoughness:v})), v => Math.round(v * 100) + '%').root);
      sm.body.appendChild(sliderRow(tr('Screen metalness', 'Metalness schermo'), activeStored.dynamicMetalness == null ? 0 : Number(activeStored.dynamicMetalness), 0, 1, .01,
        v => patchMat(dynamicIdentity({dynamicMetalness:v})), v => Math.round(v * 100) + '%').root);
      sm.body.appendChild(sliderRow(tr('Screen saturation', 'Saturazione schermo'), activeStored.dynamicSaturation == null ? 1 : Number(activeStored.dynamicSaturation), 0, 2, .01,
        v => patchMat(dynamicIdentity({dynamicSaturation:v})), v => Math.round(v * 100) + '%').root);
      sm.body.appendChild(el('<div class="lk-hint">' + tr(
        'For a readable dashboard with minimal reflections, start around Roughness 85%, Metalness 0%, Saturation 100%. These values affect only the screen override.',
        'Per un cruscotto leggibile con riflessi minimi, parti da Roughness 85%, Metalness 0%, Saturazione 100%. Questi valori agiscono soltanto sull’override dello schermo.'
      ) + '</div>'));
    }

    if(dynamicType !== 'none'){
      sm.body.appendChild(sliderRow(tr('Screen UV scale X', 'Scala UV schermo X'), activeStored.dynamicRepeatX == null ? 1 : Number(activeStored.dynamicRepeatX), .05, 12, .05,
        v => patchMat(dynamicIdentity({dynamicRepeatX:v})), v => (+v).toFixed(2)).root);
      sm.body.appendChild(sliderRow(tr('Screen UV scale Y', 'Scala UV schermo Y'), activeStored.dynamicRepeatY == null ? 1 : Number(activeStored.dynamicRepeatY), .05, 12, .05,
        v => patchMat(dynamicIdentity({dynamicRepeatY:v})), v => (+v).toFixed(2)).root);
      sm.body.appendChild(sliderRow(tr('Screen UV offset X', 'Offset UV schermo X'), activeStored.dynamicOffsetX == null ? 0 : Number(activeStored.dynamicOffsetX), -2, 2, .01,
        v => patchMat(dynamicIdentity({dynamicOffsetX:v})), v => (+v).toFixed(2)).root);
      sm.body.appendChild(sliderRow(tr('Screen UV offset Y', 'Offset UV schermo Y'), activeStored.dynamicOffsetY == null ? 0 : Number(activeStored.dynamicOffsetY), -2, 2, .01,
        v => patchMat(dynamicIdentity({dynamicOffsetY:v})), v => (+v).toFixed(2)).root);
      sm.body.appendChild(sliderRow(tr('Screen UV rotation', 'Rotazione UV schermo'), THREE.MathUtils.radToDeg(activeStored.dynamicRotation || 0), -180, 180, 1,
        v => patchMat(dynamicIdentity({dynamicRotation:THREE.MathUtils.degToRad(v)})), v => Math.round(v) + '°').root);
      sm.body.appendChild(btnRow([
        {label:tr('Fit screen UV 1:1', 'Adatta UV schermo 1:1'), action:() => {
          patchMat(dynamicIdentity({
            dynamicAutoUv:true,
            dynamicRepeatX:1,
            dynamicRepeatY:1,
            dynamicOffsetX:0,
            dynamicOffsetY:0,
            dynamicRotation:0,
          }));
          buildInspector();
        }},
      ]));
    } else {
      sm.body.appendChild(sliderRow('UV repeat X', mat.map ? mat.map.repeat.x : 1, .05, 12, .05, v => patchMat({repeatX:v}), v => (+v).toFixed(2)).root);
      sm.body.appendChild(sliderRow('UV repeat Y', mat.map ? mat.map.repeat.y : 1, .05, 12, .05, v => patchMat({repeatY:v}), v => (+v).toFixed(2)).root);
      sm.body.appendChild(sliderRow('UV offset X', mat.map ? mat.map.offset.x : 0, -2, 2, .01, v => patchMat({offsetX:v}), v => (+v).toFixed(2)).root);
      sm.body.appendChild(sliderRow('UV offset Y', mat.map ? mat.map.offset.y : 0, -2, 2, .01, v => patchMat({offsetY:v}), v => (+v).toFixed(2)).root);
      sm.body.appendChild(sliderRow('UV rotation', mat.map ? THREE.MathUtils.radToDeg(mat.map.rotation || 0) : 0, -180, 180, 1, v => patchMat({rotation:THREE.MathUtils.degToRad(v)}), v => Math.round(v) + '°').root);
    }

    sm.body.appendChild(btnRow([
      {label:'Reset maps', action:() => patchMat({dynamicMapType:'none', mapSrc:null, mapDbKey:null, normalMapSrc:null, normalMapDbKey:null, roughnessMapSrc:null, roughnessMapDbKey:null, metalnessMapSrc:null, metalnessMapDbKey:null, alphaMapSrc:null, alphaMapDbKey:null, emissiveMapSrc:null, emissiveMapDbKey:null})},
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
