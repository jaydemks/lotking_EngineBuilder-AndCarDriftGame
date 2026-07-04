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
  const buildMaterialEditor = deps.buildMaterialEditor;
  const duplicateEntity = deps.duplicateEntity;
  const requestDeleteEntity = deps.requestDeleteEntity;
  const replaceSelectedGlb = deps.replaceSelectedGlb;

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

  function build(box, o){
    const head = el('<div class="lk-head"><span class="lk-head-ic">' + entityIcon(o) + '</span><input class="lk-head-name"><span class="lk-head-id">' + o.userData.editorId + (o.userData.builtin ? ' · originale' : ' · aggiunto') + '</span></div>');
    const nameI = head.querySelector('input');
    nameI.value = o.userData.editorName || '';
    nameI.addEventListener('change', () => { o.userData.editorName = nameI.value; markDirty(); refreshOutliner(); });
    box.appendChild(head);
    if(o.userData.editorType === 'playerLight' || o.userData.editorType === 'playerEffect' || o.userData.editorType === 'playerDataWidget'){
      box.appendChild(btnRow([
        {label:'← Player Blueprint', action:() => selectObject(GAME.player.car)},
        {label:'Focus componente', action: focusSelected},
      ]));
      box.appendChild(el('<div class="lk-hint">This component belongs to the player vehicle. Go back to the blueprint to edit global settings, presets and sources.</div>'));
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
        i.addEventListener('input', () => { set(ax, parseFloat(i.value) || 0); STORE.syncCollider(o); markDirty(); if(o.userData.editorType==='player' || o.userData.editorType==='playerDataWidget') onGizmoChange(); });
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
        markDirty();
      }).root);
    }
    box.appendChild(sd.root);

    if(o.userData.editorType === 'mesh'){
      const sc = section('COLLISION');
      const hasCollider = !!(o.userData.collider && o.userData.collider.ref);
      sc.body.appendChild(checkRow('Arcade box collider', hasCollider, v => setColliderEnabled(o, v)).root);
      const hint = hasCollider
        ? 'Collision uses one axis-aligned box around this object. Disable it for full maps, floors or visual-only GLB assets.'
        : 'No physics blocker. Recommended for large track/map GLB files; add smaller collider primitives where the car must hit something.';
      sc.body.appendChild(el('<div class="lk-hint">' + hint + '</div>'));
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
      sl.body.appendChild(colorRow('Colore', light.color ? light.color.getHex() : 0xffffff, v => { light.color.setHex(v); markDirty(); }).root);
      if(light.groundColor) sl.body.appendChild(colorRow('Colore terreno', light.groundColor.getHex(), v => { light.groundColor.setHex(v); markDirty(); }).root);
      sl.body.appendChild(sliderRow('Intensità', light.intensity, 0, 6, .05, v => { light.intensity = v; markDirty(); }).root);
      if(light.distance != null && !light.isDirectionalLight && !light.isHemisphereLight && !light.isAmbientLight)
        sl.body.appendChild(sliderRow('Distanza', light.distance, 0, 200, 1, v => { light.distance = v; markDirty(); }).root);
      if(light.isSpotLight){
        sl.body.appendChild(sliderRow('Angolo°', THREE.MathUtils.radToDeg(light.angle), 5, 89, 1, v => { light.angle = THREE.MathUtils.degToRad(v); markDirty(); }).root);
        sl.body.appendChild(sliderRow('Penombra', light.penumbra, 0, 1, .01, v => { light.penumbra = v; markDirty(); }).root);
      }
      if(!light.isAmbientLight && !light.isHemisphereLight)
        sl.body.appendChild(checkRow('Proietta ombre', light.castShadow, v => { light.castShadow = v; markDirty(); }).root);
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
