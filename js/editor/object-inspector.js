/* =========================================================
   LOT KING — EDITOR OBJECT INSPECTOR
   Inspector sections for regular scene objects.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const scene = deps.scene;
  const tf = deps.tf;
  const el = deps.el;
  const section = deps.section;
  const btnRow = deps.btnRow;
  const checkRow = deps.checkRow;
  const colorRow = deps.colorRow;
  const sliderRow = deps.sliderRow;
  const entityIcon = deps.entityIcon;
  const markDirty = deps.markDirty;
  const refreshOutliner = deps.refreshOutliner;
  const selectObject = deps.selectObject;
  const focusSelected = deps.focusSelected;
  const beginTransformHistory = deps.beginTransformHistory;
  const commitTransformHistory = deps.commitTransformHistory;
  const resetTransform = deps.resetTransform;
  const syncTransformFields = deps.syncTransformFields;
  const onGizmoChange = deps.onGizmoChange;
  const setColliderEnabled = deps.setColliderEnabled;
  const setPhysicsEnabled = deps.setPhysicsEnabled;
  const buildMaterialEditor = deps.buildMaterialEditor;
  const duplicateEntity = deps.duplicateEntity;
  const requestDeleteEntity = deps.requestDeleteEntity;
  const replaceSelectedGlb = deps.replaceSelectedGlb;
  const requestWarmup = deps.requestWarmup || function(){};
  const importTextureFile = deps.importTextureFile || function(){ return Promise.resolve(null); };
  const beginColliderHistory = deps.beginColliderHistory || function(){};
  const commitColliderHistory = deps.commitColliderHistory || function(){};

  function transformContextInfo(o){
    const parent = o && o.parent && o.parent !== scene ? o.parent : null;
    const parentName = parent ? (parent.userData.editorName || parent.name || parent.userData.editorId || 'parent') : 'Scene';
    const inputSpace = parent ? 'LOCAL' : 'GLOBAL';
    const origin = o && o.userData.builtin ? 'Originale' : 'Aggiunto';
    return {parent, parentName, inputSpace, origin};
  }

  function worldTransformSummary(o){
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    o.updateMatrixWorld(true);
    o.matrixWorld.decompose(wp, wq, ws);
    const wr = new THREE.Euler().setFromQuaternion(wq, 'XYZ');
    const f = v => (+v.toFixed(2)).toString();
    const d = v => (+THREE.MathUtils.radToDeg(v).toFixed(1)).toString();
    if(ED.space !== 'engine'){
      return {
        p: 'X ' + f(wp.x) + ' · Y ' + f(wp.z) + ' · Z ' + f(wp.y),
        r: 'X ' + d(wr.x) + '° · Y ' + d(wr.z) + '° · Z ' + d(wr.y) + '°',
      };
    }
    return {
      p: 'X ' + f(wp.x) + ' · Y ' + f(wp.y) + ' · Z ' + f(wp.z),
      r: 'X ' + d(wr.x) + '° · Y ' + d(wr.y) + '° · Z ' + d(wr.z) + '°',
    };
  }

  function transformAxes(){
    if(ED.space !== 'engine') return [
      {label:'X', prop:'x'},
      {label:'Y', prop:'z'},
      {label:'Z', prop:'y'},
    ];
    return [
      {label:'X', prop:'x'},
      {label:'Y', prop:'y'},
      {label:'Z', prop:'z'},
    ];
  }

  function transformSpaceText(){
    if(ED.space === 'world') return 'World Z-up';
    if(ED.space === 'local') return 'Local Z-up';
    return 'Engine Y-up';
  }

  function isConeObject(obj){
    if(!obj || !obj.userData) return false;
    if(obj.userData.isCone) return true;
    const name = (obj.userData.editorName || obj.name || '').toLowerCase();
    return name.includes('cone');
  }

  function resetConeToOriginalRotation(obj){
    const reset = obj.userData && Array.isArray(obj.userData.coneResetRotation) ? obj.userData.coneResetRotation : null;
    const x = reset && Number.isFinite(reset[0]) ? reset[0] : 0;
    const y = reset && Number.isFinite(reset[1]) ? reset[1] : obj.rotation.y;
    const z = reset && Number.isFinite(reset[2]) ? reset[2] : 0;
    beginTransformHistory();
    obj.rotation.set(x, y, z);
    STORE.syncCollider(obj);
    syncTransformFields();
    commitTransformHistory('Reset cone upright');
    markDirty();
  }

  function build(box, o){
    const lang = GAME && GAME.i18n && GAME.i18n.lang === 'it' ? 'it' : 'en';
    const tr = (en, it) => lang === 'it' ? (it || en) : en;
    const head = el('<div class="lk-head"><span class="lk-head-ic">' + entityIcon(o) + '</span><input class="lk-head-name"><span class="lk-head-id">' + o.userData.editorId + (o.userData.builtin ? ' · originale' : ' · aggiunto') + '</span></div>');
    const nameI = head.querySelector('input');
    nameI.value = o.userData.editorName || '';
    nameI.addEventListener('change', () => { o.userData.editorName = nameI.value; markDirty(); refreshOutliner(); });
    box.appendChild(head);
    if(o.userData.editorType === 'playerLight' || o.userData.editorType === 'playerEffect' ||
      o.userData.editorType === 'playerSkid' || o.userData.editorType === 'playerDataWidget'){
      box.appendChild(btnRow([
        {label:'← player_car Logic', action:() => selectObject(GAME.player.car)},
        {label:'Focus componente', action: focusSelected},
      ]));
      box.appendChild(el('<div class="lk-hint">This component belongs to the player vehicle. Go back to player_car Logic to edit global settings, presets and sources.</div>'));
    }
    if(o.userData.linkParentId){
      const parent = GAME.world.registry.find(p => p.userData.editorId === o.userData.linkParentId);
      box.appendChild(el('<div class="lk-hint">Linked parent: ' + (parent ? (parent.userData.editorName || parent.userData.editorId) : o.userData.linkParentId) + '</div>'));
    }

    const st = section('TRASFORMAZIONE');
    const ctx = transformContextInfo(o);
    const wt = worldTransformSummary(o);
    st.body.appendChild(el(
      '<div class="lk-transform-context">' +
        '<span>' + ctx.origin + '</span>' +
        '<span>Campi ' + ctx.inputSpace + '</span>' +
        '<span>Gizmo ' + transformSpaceText() + '</span>' +
      '</div>'
    ));
    st.body.appendChild(el('<div class="lk-hint">Parent: ' + ctx.parentName + (ED.space !== 'engine' ? '<br>Display convention: Z is vertical; engine still stores Y-up internally.' : '') + '</div>'));
    if(ctx.parent){
      st.body.appendChild(el('<div class="lk-hint">World pos: ' + wt.p + '<br>World rot: ' + wt.r + '</div>'));
    }
    const mk = (label, kind, get, set, isDeg) => {
      const row = el('<div class="lk-vec"><label>' + label + '</label></div>');
      const ins = [];
      transformAxes().forEach(axis => {
        const ax = axis.prop;
        const i = el('<input type="number" step="' + (isDeg ? 1 : .1) + '" title="' + axis.label + '">');
        i.value = +get(ax).toFixed(3);
        i.addEventListener('focus', beginTransformHistory);
        i.addEventListener('input', () => { set(ax, parseFloat(i.value) || 0); STORE.syncCollider(o); markDirty(); if(o.userData.editorType==='player' || o.userData.editorType==='playerDataWidget' || o.userData.editorType==='playerSkid') onGizmoChange(); });
        i.addEventListener('change', () => commitTransformHistory(label));
        row.appendChild(i); ins.push({input:i, prop:ax, kind});
      });
      st.body.appendChild(row);
      return ins;
    };
    const pI = mk('Posizione', 'p', ax => o.position[ax], (ax,v) => o.position[ax] = v);
    const rI = mk('Rotazione°', 'r', ax => THREE.MathUtils.radToDeg(o.rotation[ax]), (ax,v) => o.rotation[ax] = THREE.MathUtils.degToRad(v), true);
    let uniform = false;
    const sI = mk('Scale', 's', ax => o.scale[ax], (ax,v) => {
      if(uniform) o.scale.set(v,v,v); else o.scale[ax] = v;
      if(uniform) syncTransformFields();
    });
    tf.inputs = [...pI, ...rI, ...sI];
    st.body.appendChild(checkRow('Uniform scale', false, v => uniform = v).root);
    st.body.appendChild(btnRow([{label:'↺ Reset', action:() => { resetTransform(o); syncTransformFields(); }}]));
    box.appendChild(st.root);

    const sd = section('VISIBILITÀ');
    sd.body.appendChild(checkRow('Visibile', o.visible, v => { o.visible = v; markDirty(); refreshOutliner(); }).root);
    if(o.userData.editorType === 'mesh'){
      let anyCast = false;
      o.traverse(n => { if(n.isMesh && n.castShadow) anyCast = true; });
      sd.body.appendChild(checkRow('Proietta ombre', anyCast, v => {
        o.traverse(n => { if(n.isMesh) n.castShadow = v; });
        o.userData.matProps = Object.assign({}, o.userData.matProps, {castShadow: v});
        requestWarmup(v ? 'Warm-up shadows...' : 'Warm-up render...');
        markDirty();
      }).root);
    }
    box.appendChild(sd.root);

    if(o.userData.editorType === 'text'){
      const tx = section('TEXT');
      const props = Object.assign({
        text:'Text', color:0xffffff, background:0x000000, opacity:0, size:1, width:4, height:1.4,
        fontSize:96, fontFamily:'Arial', weight:'900', italic:false, align:'center', valign:'middle',
        lineHeight:1.15, padding:.12, wrap:false, depth:.16, bevel:false,
      }, o.userData.textProps || {});
      o.userData.textProps = props;
      const updateText = patch => {
        Object.assign(props, patch || {});
        o.userData.textProps = props;
        if(o.userData.addedEntry) o.userData.addedEntry.props = Object.assign({}, props);
        if(STORE.updateTextObject) STORE.updateTextObject(o);
        markDirty();
      };
      const row = el('<div class="lk-row"><label>Text</label><textarea rows="5"></textarea></div>');
      const input = row.querySelector('textarea');
      input.value = props.text || '';
      input.addEventListener('input', () => updateText({text:input.value}));
      tx.body.appendChild(row);
      tx.body.appendChild(colorRow('Color', props.color, v => updateText({color:v})).root);
      tx.body.appendChild(colorRow('Background', props.background, v => updateText({background:v})).root);
      tx.body.appendChild(sliderRow('Background alpha', props.opacity || 0, 0, 1, .01, v => updateText({opacity:v}), v => Math.round(v * 100) + '%').root);
      tx.body.appendChild(sliderRow('Object size', props.size || 1, .2, 8, .05, v => updateText({size:v}), v => (+v).toFixed(2)).root);
      tx.body.appendChild(sliderRow('Crop width', props.width || 4, .4, 24, .05, v => updateText({width:v}), v => (+v).toFixed(2) + 'm').root);
      tx.body.appendChild(sliderRow('Crop height', props.height || 1.4, .2, 12, .05, v => updateText({height:v}), v => (+v).toFixed(2) + 'm').root);
      tx.body.appendChild(sliderRow('Font size', props.fontSize || 96, 12, 220, 1, v => updateText({fontSize:Math.round(v)}), v => Math.round(v) + 'px').root);
      const fontRow = el('<div class="lk-row"><label>Font</label><select><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option><option value="Courier New">Courier New</option><option value="Impact">Impact</option></select></div>');
      const fontSelect = fontRow.querySelector('select');
      fontSelect.value = props.fontFamily || 'Arial';
      fontSelect.addEventListener('change', () => updateText({fontFamily:fontSelect.value}));
      tx.body.appendChild(fontRow);
      const weightRow = el('<div class="lk-row"><label>Weight</label><select><option value="400">Regular</option><option value="700">Bold</option><option value="900">Black</option></select></div>');
      const weightSelect = weightRow.querySelector('select');
      weightSelect.value = String(props.weight || '900');
      weightSelect.addEventListener('change', () => updateText({weight:weightSelect.value}));
      tx.body.appendChild(weightRow);
      tx.body.appendChild(checkRow('Italic', !!props.italic, v => updateText({italic:v})).root);
      tx.body.appendChild(checkRow('Auto wrap', !!props.wrap, v => updateText({wrap:v})).root);
      const alignRow = el('<div class="lk-row"><label>Align</label><select><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>');
      const alignSelect = alignRow.querySelector('select');
      alignSelect.value = props.align || 'center';
      alignSelect.addEventListener('change', () => updateText({align:alignSelect.value}));
      tx.body.appendChild(alignRow);
      const valignRow = el('<div class="lk-row"><label>Vertical</label><select><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></div>');
      const valignSelect = valignRow.querySelector('select');
      valignSelect.value = props.valign || 'middle';
      valignSelect.addEventListener('change', () => updateText({valign:valignSelect.value}));
      tx.body.appendChild(valignRow);
      tx.body.appendChild(sliderRow('Line height', props.lineHeight || 1.15, .7, 2.4, .01, v => updateText({lineHeight:v}), v => (+v).toFixed(2)).root);
      tx.body.appendChild(sliderRow('Padding', props.padding || 0, 0, 2, .01, v => updateText({padding:v}), v => (+v).toFixed(2) + 'm').root);
      if(o.userData.textKind === '3d'){
        tx.body.appendChild(sliderRow('Depth', props.depth || .16, .01, 1.2, .01, v => updateText({depth:v}), v => (+v).toFixed(2) + 'm').root);
        tx.body.appendChild(checkRow('Bevel', !!props.bevel, v => updateText({bevel:v})).root);
      }
      tx.body.appendChild(btnRow([{label:'Fit crop to lines', action:() => {
        const lines = String(props.text || '').split(/\r\n|\r|\n/).length || 1;
        updateText({height:Math.max(.35, lines * (props.fontSize || 96) / 120 * (props.lineHeight || 1.15) + (props.padding || 0) * 2)});
      }}]));
      box.appendChild(tx.root);
    }

    if(o.userData.editorType === 'texture'){
      const tex = section('FREE TEXTURE / DECAL');
      const props = Object.assign({
        mode:'decal', src:null, dbKey:null, asset:null, width:2, height:2, opacity:1, color:0xffffff,
        alphaTest:.01, blending:'normal', depthBias:.012, doubleSide:true, animated:false,
      }, o.userData.textureProps || {});
      o.userData.textureProps = props;
      const updateTexture = patch => {
        Object.assign(props, patch || {});
        o.userData.textureProps = props;
        if(o.userData.addedEntry){
          o.userData.addedEntry.textureKind = props.mode === 'image' ? 'image' : 'decal';
          o.userData.addedEntry.props = Object.assign({}, props);
          if(props.asset) o.userData.addedEntry.asset = Object.assign({}, props.asset);
        }
        if(STORE.updateTextureObject) STORE.updateTextureObject(o);
        markDirty();
        refreshOutliner();
      };
      const preview = el('<div class="lk-texture-preview"><div></div><span>' + tr('No texture loaded', 'Nessuna texture caricata') + '</span></div>');
      const previewBox = preview.querySelector('div');
      const previewText = preview.querySelector('span');
      const previewSrc = props.src || null;
      if(previewSrc){
        previewBox.style.backgroundImage = 'url(' + previewSrc + ')';
        previewBox.style.backgroundSize = 'cover';
        previewBox.style.backgroundPosition = 'center';
        previewText.textContent = props.asset && (props.asset.name || props.asset.source) || tr('Inline texture', 'Texture inline');
      } else if(props.dbKey && props.asset){
        previewText.textContent = props.asset.name || props.asset.source || tr('Texture from asset DB', 'Texture da asset DB');
      }
      tex.body.appendChild(preview);
      const fileRow = el('<div class="lk-drop"><strong>' + tr('Load texture / decal', 'Carica texture / decal') + '</strong><span>' + tr('PNG, JPG, WEBP, AVIF or GIF. The file is also saved in Assets.', 'PNG, JPG, WEBP, AVIF o GIF. Il file viene salvato anche in Assets.') + '</span></div>');
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
      input.hidden = true;
      fileRow.appendChild(input);
      fileRow.addEventListener('click', () => input.click());
      fileRow.addEventListener('dragover', e => { e.preventDefault(); fileRow.classList.add('drag'); });
      fileRow.addEventListener('dragleave', () => fileRow.classList.remove('drag'));
      fileRow.addEventListener('drop', e => {
        e.preventDefault();
        fileRow.classList.remove('drag');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if(f) handleTextureFile(f);
      });
      input.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if(f) handleTextureFile(f);
      });
      const handlePatchFromAsset = asset => {
        if(!asset) return;
        if(asset.src){
          previewBox.style.backgroundImage = 'url(' + asset.src + ')';
          previewBox.style.backgroundSize = 'cover';
          previewBox.style.backgroundPosition = 'center';
        }
        previewText.textContent = asset.name || asset.source || tr('Imported texture', 'Texture importata');
        updateTexture({
          src:asset.src || null,
          dbKey:asset.dbKey || null,
          asset:{key:asset.key, dbKey:asset.dbKey || null, name:asset.name, source:asset.source || 'Imported texture'},
          animated:/\.gif$/i.test(asset.source || '') || /gif/i.test(asset.mime || ''),
        });
      };
      function handleTextureFile(file){
        importTextureFile(file).then(handlePatchFromAsset).catch(err => {
          console.warn('Texture import failed', err);
        });
      }
      tex.body.appendChild(fileRow);
      tex.body.appendChild(selectRow(tr('Type', 'Tipo'), props.mode || 'decal', [
        {value:'decal', label:tr('Surface decal', 'Decal su superficie')},
        {value:'image', label:tr('Free image', 'Immagine libera')},
      ], v => {
        beginTransformHistory();
        updateTexture({mode:v});
        o.rotation.x = v === 'decal' ? -Math.PI / 2 : 0;
        o.position.y = v === 'decal' ? Math.max(o.position.y, .025) : Math.max(o.position.y, 1.2);
        commitTransformHistory('Texture mode');
        syncTransformFields();
      }).root);
      tex.body.appendChild(selectRow(tr('Blending', 'Fusione'), props.blending || 'normal', [
        {value:'normal', label:'Normal alpha'},
        {value:'additive', label:'Additive'},
        {value:'multiply', label:'Multiply'},
        {value:'subtractive', label:'Subtractive'},
      ], v => updateTexture({blending:v})).root);
      tex.body.appendChild(colorRow(tr('Tint', 'Tint'), props.color == null ? 0xffffff : props.color, v => updateTexture({color:v})).root);
      tex.body.appendChild(sliderRow(tr('Width', 'Larghezza'), props.width || 2, .05, 24, .05, v => updateTexture({width:v}), v => (+v).toFixed(2) + 'm').root);
      tex.body.appendChild(sliderRow(tr('Height', 'Altezza'), props.height || 2, .05, 24, .05, v => updateTexture({height:v}), v => (+v).toFixed(2) + 'm').root);
      tex.body.appendChild(sliderRow(tr('Opacity', 'Opacità'), props.opacity == null ? 1 : props.opacity, 0, 1, .01, v => updateTexture({opacity:v}), v => Math.round(v * 100) + '%').root);
      tex.body.appendChild(sliderRow('Alpha cut', props.alphaTest == null ? .01 : props.alphaTest, 0, .8, .01, v => updateTexture({alphaTest:v}), v => (+v).toFixed(2)).root);
      tex.body.appendChild(sliderRow('Depth bias', props.depthBias == null ? .012 : props.depthBias, 0, .08, .001, v => updateTexture({depthBias:v}), v => (+v).toFixed(3) + 'm').root);
      tex.body.appendChild(checkRow(tr('Double side', 'Doppio lato'), props.doubleSide !== false, v => updateTexture({doubleSide:v})).root);
      tex.body.appendChild(checkRow(tr('Animated / GIF refresh', 'Animata / refresh GIF'), !!props.animated, v => updateTexture({animated:v})).root);
      box.appendChild(tex.root);
    }

    if(o.userData.editorType === 'mesh'){
      const sc = section('PHYSICS');
      const c = o.userData && o.userData.collider;
      if(c && c.ref) STORE.syncCollider(o);
      const hasCollider = !!(c && c.ref && c.ref.enabled !== false);
      const hasPhysics = !!(o.userData.physicsEnabled || (c && c.ref && c.ref.physics));
      const mass = (() => {
        const storedMass = Number(o.userData && o.userData.physicsMass);
        if(Number.isFinite(storedMass) && storedMass > 0) return storedMass;
        const refMass = c && c.ref && c.ref.mass;
        const parsed = Number(refMass);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      })();
      const impactForce = (() => {
        const stored = Number(o.userData && o.userData.physicsImpact);
        if(Number.isFinite(stored)) return Math.max(0, Math.min(1, stored));
        const refImpact = c && c.ref && c.ref.impact;
        const parsed = Number(refImpact);
        return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : .25;
      })();
      const physicsMassRow = sliderRow('Mass', mass, .001, 1000, .001, v => {
        const m = Math.max(.001, v);
        if(o.userData.collider && o.userData.collider.ref) o.userData.collider.ref.mass = m;
        o.userData.physicsMass = m;
        if(o.userData.addedEntry) o.userData.addedEntry.physicsMass = m;
        if(c && c.ref) STORE.syncCollider(o);
        if(GAME.systems && GAME.systems.physics) GAME.systems.physics.rebuild();
        markDirty();
      });
      const impactRow = sliderRow('Impact force', impactForce, 0, 1, .01, v => {
        const force = Math.max(0, Math.min(1, v));
        if(o.userData.collider && o.userData.collider.ref) o.userData.collider.ref.impact = force;
        o.userData.physicsImpact = force;
        if(o.userData.addedEntry) o.userData.addedEntry.physicsImpact = force;
        markDirty();
      });
      if(physicsMassRow.input) physicsMassRow.input.disabled = !hasPhysics;
      if(physicsMassRow.valueInput) physicsMassRow.valueInput.disabled = !hasPhysics;
      if(impactRow.input) impactRow.input.disabled = !hasPhysics;
      if(impactRow.valueInput) impactRow.valueInput.disabled = !hasPhysics;
      const collisionRow = checkRow('Collision', hasCollider, v => setColliderEnabled(o, v));
      sc.body.appendChild(collisionRow.root);
      sc.body.appendChild(checkRow('Physics', hasPhysics, v => setPhysicsEnabled(o, v)).root);
      sc.body.appendChild(checkRow('Drive surface', !!o.userData.driveSurface, v => {
        o.userData.driveSurface = v;
        if(o.userData.addedEntry) o.userData.addedEntry.driveSurface = v;
        if(GAME.systems && GAME.systems.physics) GAME.systems.physics.rebuild();
        markDirty();
      }).root);
      sc.body.appendChild(physicsMassRow.root);
      sc.body.appendChild(impactRow.root);
      const hint = hasCollider
        ? 'Collision uses one axis-aligned box around this object. Disable it for full maps, floors or visual-only GLB assets.'
        : 'No collision. Recommended for large track/map GLB files; add smaller collision primitives where the car must hit something.';
      sc.body.appendChild(el('<div class="lk-hint">' + hint + '</div>'));
      if(hasCollider && c && c.ref){
        const shape = o.userData.colliderShape || (o.userData.colliderShape = {});
        const applyColliderShape = patch => {
          Object.assign(shape, patch || {});
          o.userData.colliderShape = shape;
          if(o.userData.addedEntry) o.userData.addedEntry.colliderShape = Object.assign({}, shape);
          STORE.syncCollider(o);
          if(GAME.systems && GAME.systems.physics) GAME.systems.physics.rebuild();
          markDirty();
        };
        sc.body.appendChild(el('<div class="lk-hint">Collider dummy: edit the collision shape independently from the visible mesh.</div>'));
        const modeRow = el('<div class="lk-row"><label>Collider mode</label><select><option value="simple">Simple</option><option value="complex">Complex</option></select></div>');
        const modeSelect = modeRow.querySelector('select');
        modeSelect.value = shape.mode === 'complex' ? 'complex' : 'simple';
        modeSelect.addEventListener('change', () => {
          beginColliderHistory(o);
          applyColliderShape({mode: modeSelect.value === 'complex' ? 'complex' : 'simple'});
          commitColliderHistory('Collider mode');
          deps.rebuildColliderHelpers && deps.rebuildColliderHelpers();
        });
        sc.body.appendChild(modeRow);
        const colliderSlider = row => {
          row.root.addEventListener('lk-slider-edit-start', () => beginColliderHistory(o));
          row.root.addEventListener('lk-slider-edit-end', () => commitColliderHistory('Collider edit'));
          return row.root;
        };
        sc.body.appendChild(colliderSlider(sliderRow('Collider offset X', Number.isFinite(Number(shape.offsetX)) ? Number(shape.offsetX) : 0, -50, 50, .05, v => applyColliderShape({offsetX:v}), v => (+v).toFixed(2))));
        sc.body.appendChild(colliderSlider(sliderRow('Collider offset Y', Number.isFinite(Number(shape.offsetY)) ? Number(shape.offsetY) : 0, -50, 50, .05, v => applyColliderShape({offsetY:v}), v => (+v).toFixed(2))));
        sc.body.appendChild(colliderSlider(sliderRow('Collider offset Z', Number.isFinite(Number(shape.offsetZ)) ? Number(shape.offsetZ) : 0, -50, 50, .05, v => applyColliderShape({offsetZ:v}), v => (+v).toFixed(2))));
        if(c.kind === 'circle'){
          sc.body.appendChild(colliderSlider(sliderRow('Collider radius', c.ref.r || 1, .05, 100, .05, v => applyColliderShape({r:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Collider half Y', c.ref.hy || .5, .05, 100, .05, v => applyColliderShape({hy:Math.max(.05, v)}), v => (+v).toFixed(2))));
        } else {
          sc.body.appendChild(colliderSlider(sliderRow('Collider half X', c.ref.hx || 1, .05, 250, .05, v => applyColliderShape({hx:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Collider half Y', c.ref.hy || .5, .05, 250, .05, v => applyColliderShape({hy:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Collider half Z', c.ref.hz || 1, .05, 250, .05, v => applyColliderShape({hz:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Collider rot X°', THREE.MathUtils.radToDeg(c.ref.rotX || 0), -180, 180, .5, v => applyColliderShape({rotX:THREE.MathUtils.degToRad(v)}), v => (+v).toFixed(1) + '°')));
          sc.body.appendChild(colliderSlider(sliderRow('Collider rot Y°', THREE.MathUtils.radToDeg(c.ref.rotY != null ? c.ref.rotY : (c.ref.rot || 0)), -180, 180, .5, v => applyColliderShape({rotY:THREE.MathUtils.degToRad(v), rot:THREE.MathUtils.degToRad(v)}), v => (+v).toFixed(1) + '°')));
          sc.body.appendChild(colliderSlider(sliderRow('Collider rot Z°', THREE.MathUtils.radToDeg(c.ref.rotZ || 0), -180, 180, .5, v => applyColliderShape({rotZ:THREE.MathUtils.degToRad(v)}), v => (+v).toFixed(1) + '°')));
        }
      }
      if(isConeObject(o)){
        sc.body.appendChild(btnRow([{
          label:'↺ Reset cono eretto',
          action: () => resetConeToOriginalRotation(o),
        }]));
      }
      if(hasCollider){
        const b = new THREE.Box3().setFromObject(o);
        const s = b.getSize(new THREE.Vector3());
        sc.body.appendChild(el('<div class="lk-hint">Box approx: X ' + s.x.toFixed(1) + ' · Z ' + s.z.toFixed(1) + '</div>'));
      }
      box.appendChild(sc.root);
    }

    const light = o.isLight ? o : o.userData.light;
    if(light){
      const sl = section('LUCE');
      sl.body.appendChild(colorRow('Colore', light.color ? light.color.getHex() : 0xffffff, v => { light.color.setHex(v); requestWarmup('Warm-up light...'); markDirty(); }).root);
      if(light.groundColor) sl.body.appendChild(colorRow('Colore terreno', light.groundColor.getHex(), v => { light.groundColor.setHex(v); requestWarmup('Warm-up light...'); markDirty(); }).root);
      sl.body.appendChild(sliderRow('Intensità', light.intensity, 0, 6, .05, v => { light.intensity = v; requestWarmup('Warm-up light...'); markDirty(); }).root);
      if(light.distance != null && !light.isDirectionalLight && !light.isHemisphereLight && !light.isAmbientLight)
        sl.body.appendChild(sliderRow('Distanza', light.distance, 0, 200, 1, v => { light.distance = v; requestWarmup('Warm-up light...'); markDirty(); }).root);
      if(light.isSpotLight){
        sl.body.appendChild(sliderRow('Angolo°', THREE.MathUtils.radToDeg(light.angle), 5, 89, 1, v => { light.angle = THREE.MathUtils.degToRad(v); requestWarmup('Warm-up light...'); markDirty(); }).root);
        sl.body.appendChild(sliderRow('Penombra', light.penumbra, 0, 1, .01, v => { light.penumbra = v; requestWarmup('Warm-up light...'); markDirty(); }).root);
      }
      if(!light.isAmbientLight && !light.isHemisphereLight)
        sl.body.appendChild(checkRow('Proietta ombre', light.castShadow, v => { light.castShadow = v; requestWarmup(v ? 'Warm-up shadows...' : 'Warm-up light...'); markDirty(); }).root);
      box.appendChild(sl.root);
    }

    buildMaterialEditor(box, o);

    if(o.userData.effectParams){
      const p = o.userData.effectParams;
      const se = section('EFFETTO (' + p.kind + ')');
      se.body.appendChild(colorRow('Colore', p.color, v => { o.userData.effectSetColor(v); markDirty(); }).root);
      se.body.appendChild(sliderRow('Frequenza', p.rate, 1, 80, 1, v => { p.rate = v; markDirty(); }).root);
      se.body.appendChild(sliderRow('Dimensione', p.size, .1, 8, .05, v => { p.size = v; markDirty(); }).root);
      se.body.appendChild(sliderRow('Vita (s)', p.life, .2, 6, .05, v => { p.life = v; markDirty(); }).root);
      se.body.appendChild(sliderRow('Spinta ↑', p.rise, 0, 8, .1, v => { p.rise = v; markDirty(); }).root);
      se.body.appendChild(sliderRow('Dispersione', p.spread, 0, 6, .05, v => { p.spread = v; markDirty(); }).root);
      se.body.appendChild(sliderRow('Opacità', p.opacity, .05, 1, .01, v => { p.opacity = v; markDirty(); }).root);
      box.appendChild(se.root);
    }

    box.appendChild(btnRow([
      {label:'🔍 Focus', action: focusSelected},
      {label:'⧉ Duplica', action:() => duplicateEntity(o)},
      {label:'📦 Replace GLB', action:() => replaceSelectedGlb(o)},
      {label:'🗑 Elimina', danger:true, action:() => requestDeleteEntity(o)},
    ]));
  }

  return Object.freeze({build});
}

window.LK_EDITOR_OBJECT_INSPECTOR = Object.freeze({create});
})();
