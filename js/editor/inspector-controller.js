/* =========================================================
   LOT KING - EDITOR INSPECTOR CONTROLLER
   Routes the inspector panel and player blueprint inspector shell.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME || window.LOT_KING;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const tf = deps.tf;

  function syncTransformFields(){
    const o = ED.selected;
    if(!o || !tf.inputs) return;
    const f = v => +v.toFixed(3);
    tf.inputs.forEach(item => {
      if(item.kind === 'p') item.input.value = f(o.position[item.prop]);
      else if(item.kind === 'r') item.input.value = f(THREE.MathUtils.radToDeg(o.rotation[item.prop]));
      else if(item.kind === 's') item.input.value = f(o.scale[item.prop]);
    });
  }

  function selectedList(){
    return (ED.multiSelected || []).filter(o => o && o.userData);
  }

  function sameValue(list, getter, epsilon){
    if(!list.length) return {same:false, value:null};
    const first = getter(list[0]);
    const eps = epsilon == null ? 1e-6 : epsilon;
    for(let i = 1; i < list.length; i++){
      const v = getter(list[i]);
      if(typeof first === 'number' && typeof v === 'number'){
        if(Math.abs(first - v) > eps) return {same:false, value:first};
      } else if(first !== v) return {same:false, value:first};
    }
    return {same:true, value:first};
  }

  function applyToMany(list, label, action){
    if(!list.length) return;
    if(deps.beginTransformHistory) deps.beginTransformHistory();
    list.forEach(action);
    if(deps.commitTransformHistory) deps.commitTransformHistory(label);
    list.forEach(o => STORE.syncCollider(o));
    if(deps.markDirty) deps.markDirty();
    if(deps.refreshOutliner) deps.refreshOutliner();
    syncTransformFields();
  }

  function multiNumberRow(title, list, getter, setter, step, isDeg){
    const row = deps.el('<div class="lk-vec"><label>' + title + '</label></div>');
    const info = sameValue(list, getter);
    const i = deps.el('<input type="number" step="' + step + '">');
    if(info.same) i.value = +info.value.toFixed(3);
    else i.placeholder = 'mixed';
    i.addEventListener('change', () => {
      if(i.value === '') return;
      const raw = parseFloat(i.value);
      if(!Number.isFinite(raw)) return;
      applyToMany(list, 'Multi ' + title, o => setter(o, isDeg ? THREE.MathUtils.degToRad(raw) : raw));
    });
    row.appendChild(i);
    return row;
  }

  function setMass(o, value){
    const m = Math.max(.001, Number(value) || .001);
    if(o.userData.collider && o.userData.collider.ref) o.userData.collider.ref.mass = m;
    o.userData.physicsMass = m;
    if(o.userData.addedEntry) o.userData.addedEntry.physicsMass = m;
  }

  function setImpactForce(o, value){
    const force = Math.max(0, Math.min(1, Number(value) || 0));
    if(o.userData.collider && o.userData.collider.ref) o.userData.collider.ref.impact = force;
    o.userData.physicsImpact = force;
    if(o.userData.addedEntry) o.userData.addedEntry.physicsImpact = force;
  }

  function resetManyRotation(list){
    applyToMany(list, 'Multi reset rotation', o => o.rotation.set(0, 0, 0));
  }

  function resetManyScale(list){
    applyToMany(list, 'Multi reset scale', o => o.scale.set(1, 1, 1));
  }

  function resetManyTransform(list){
    applyToMany(list, 'Multi reset transform', o => {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
    });
  }

  function buildMultiInspector(box, list){
    box.appendChild(deps.el('<div class="lk-head"><span class="lk-head-ic">☑</span><span class="lk-bp-title">MULTI SELECT</span><span class="lk-head-id">' + list.length + ' objects</span></div>'));
    box.appendChild(deps.el('<div class="lk-hint">Only the field you edit is applied to every selected object. Mixed or untouched values stay exactly as they are.</div>'));

    const st = deps.section('TRASFORMAZIONE');
    ['x','y','z'].forEach(ax => st.body.appendChild(multiNumberRow('Pos ' + ax.toUpperCase(), list, o => o.position[ax], (o,v) => { o.position[ax] = v; }, .1)));
    ['x','y','z'].forEach(ax => st.body.appendChild(multiNumberRow('Rot ' + ax.toUpperCase() + '°', list, o => THREE.MathUtils.radToDeg(o.rotation[ax]), (o,v) => { o.rotation[ax] = v; }, 1, true)));
    ['x','y','z'].forEach(ax => st.body.appendChild(multiNumberRow('Scale ' + ax.toUpperCase(), list, o => o.scale[ax], (o,v) => { o.scale[ax] = v; }, .1)));
    st.body.appendChild(deps.btnRow([
      {label:'Reset rotation', action:() => resetManyRotation(list)},
      {label:'Reset scale', action:() => resetManyScale(list)},
      {label:'Reset transform', action:() => resetManyTransform(list)},
    ]));
    box.appendChild(st.root);

    const sv = deps.section('VISIBILITÀ');
    const vis = sameValue(list, o => !!o.visible);
    const visRow = deps.checkRow('Visibile', vis.same ? vis.value : false, v => {
      list.forEach(o => { o.visible = v; });
      if(deps.markDirty) deps.markDirty();
      if(deps.refreshOutliner) deps.refreshOutliner();
    });
    if(visRow.input) visRow.input.indeterminate = !vis.same;
    sv.body.appendChild(visRow.root);
    box.appendChild(sv.root);

    const meshes = list.filter(o => o.userData.editorType === 'mesh');
    if(meshes.length){
      const sp = deps.section('PHYSICS');
      const hasCollider = o => !!(o.userData.collider && o.userData.collider.ref && o.userData.collider.ref.enabled !== false);
      const hasPhysics = o => !!(o.userData.physicsEnabled || (o.userData.collider && o.userData.collider.ref && o.userData.collider.ref.physics));
      const col = sameValue(meshes, hasCollider);
      const phy = sameValue(meshes, hasPhysics);
      const cRow = deps.checkRow('Collision', col.same ? col.value : false, v => meshes.forEach(o => deps.setColliderEnabled(o, v)));
      const pRow = deps.checkRow('Physics', phy.same ? phy.value : false, v => meshes.forEach(o => deps.setPhysicsEnabled(o, v)));
      if(cRow.input) cRow.input.indeterminate = !col.same;
      if(pRow.input) pRow.input.indeterminate = !phy.same;
      sp.body.appendChild(cRow.root);
      sp.body.appendChild(pRow.root);
      sp.body.appendChild(multiNumberRow('Mass', meshes, o => {
        const ref = o.userData.collider && o.userData.collider.ref;
        const m = Number(o.userData.physicsMass || (ref && ref.mass));
        return Number.isFinite(m) && m > 0 ? m : 1;
      }, setMass, .001));
      sp.body.appendChild(multiNumberRow('Impact force', meshes, o => {
        const ref = o.userData.collider && o.userData.collider.ref;
        const force = Number(o.userData.physicsImpact != null ? o.userData.physicsImpact : (ref && ref.impact));
        return Number.isFinite(force) ? Math.max(0, Math.min(1, force)) : .25;
      }, setImpactForce, .01));
      sp.body.appendChild(deps.el('<div class="lk-hint">Mass controls how easily the object moves. Impact force controls how much the player vehicle slows down on hit.</div>'));
      box.appendChild(sp.root);
    }
  }

  function buildInspector(){
    const box = deps.insp();
    box.innerHTML = '';
    tf.inputs = null;
    if(ED.special === 'env') return deps.environmentInspector.build(box);
    if(ED.special === 'hud') return deps.hudInspector.build(box);
    const multi = selectedList();
    if(multi.length > 1) return buildMultiInspector(box, multi);
    const o = ED.selected;
    if(!o){
      box.appendChild(deps.el('<div class="lk-empty">No selection.<br>Click an object in the scene<br>or in the list on the left.</div>'));
      return;
    }
    if(o.userData.editorType === 'player') return buildPlayerInspector(box, o);
    return deps.objectInspector.build(box, o);
  }

  function buildPlayerInspector(box, o){
    const selectedCollider = !!ED.playerColliderEdit;
    box.appendChild(deps.el('<div class="lk-head lk-bp"><span class="lk-head-ic">' + (selectedCollider ? '▧' : '🚗') + '</span><span class="lk-bp-title">' + (selectedCollider ? 'PLAYER_CAR · COLLIDER' : 'PLAYER_CAR · LOGIC') + '</span><span class="lk-head-id">player vehicle</span></div>'));
    box.appendChild(deps.btnRow([
      {label:'◇ Copy car logic', action: deps.copyPlayerBlueprintAsset},
      {label:'★ Promote current to Base', action:() => {
        const bp = deps.currentPlayerBlueprint();
        if(bp && STORE.playerBlueprints && STORE.playerBlueprints.setDefault){
          STORE.playerBlueprints.setDefault(bp, {levelId: ED.trackId, levelName: ED.trackName, copiedFrom: 'scene-player'});
          deps.applyPlayerBlueprintAsset(bp, {applySpawn:false, silent:true});
          deps.status('Current player_car logic promoted to Base');
        }
      }},
    ]));

    const st = deps.section('POSIZIONE / SPAWN');
    st.body.appendChild(deps.el('<div class="lk-hint">Move the car with the gizmo: its position becomes the spawn.</div>'));
    const row = deps.el('<div class="lk-vec"><label>Posizione</label></div>');
    const ins = [];
    ['x','y','z'].forEach(ax => {
      const i = deps.el('<input type="number" step="0.5">');
      i.value = +o.position[ax].toFixed(2);
      i.addEventListener('focus', deps.beginTransformHistory);
      i.addEventListener('input', () => { o.position[ax] = parseFloat(i.value) || 0; deps.onGizmoChange(); });
      i.addEventListener('change', () => deps.commitTransformHistory('Player spawn'));
      row.appendChild(i);
      ins.push(i);
    });
    st.body.appendChild(row);

    const rowR = deps.el('<div class="lk-vec"><label>Direzione°</label></div>');
    const rI = deps.el('<input type="number" step="5">');
    rI.value = +THREE.MathUtils.radToDeg(o.rotation.y).toFixed(1);
    rI.addEventListener('focus', deps.beginTransformHistory);
    rI.addEventListener('input', () => { o.rotation.y = THREE.MathUtils.degToRad(parseFloat(rI.value) || 0); deps.onGizmoChange(); });
    rI.addEventListener('change', () => deps.commitTransformHistory('Player direction'));
    rowR.appendChild(rI);
    st.body.appendChild(rowR);

    tf.inputs = [ins[0], ins[1], ins[2], {set value(v){}, get value(){return 0;}}, rI, {set value(v){}, get value(){return 0;}}, {set value(v){}}, {set value(v){}}, {set value(v){}}];
    st.body.appendChild(deps.btnRow([{label:'📍 Spawn qui', action: deps.setSpawnHere}, {label:'↺ Spawn default', action:() => {
      o.position.set(0,0,55);
      o.rotation.y = Math.PI;
      deps.onGizmoChange();
      buildInspector();
    }}]));
    box.appendChild(st.root);

    const pc = deps.section(selectedCollider ? 'PLAYER COLLIDER · SELECTED' : 'PLAYER COLLIDER');
    const collision = GAME.player.collision || {};
    const setCollision = patch => {
      if(GAME.player.setCollision) GAME.player.setCollision(patch);
      Object.assign(collision, patch || {});
      if(deps.updateSelectionAndDropHelpers) deps.updateSelectionAndDropHelpers();
      if(deps.markDirty) deps.markDirty();
    };
    pc.body.appendChild(deps.el('<div class="lk-hint">' + (selectedCollider ? 'Collider selection active. Edit this dummy here; it is separate from the player_car object transform.' : 'Dedicated player_car collision. This controls the car body used by physics and the lightweight arcade impact radius.') + '</div>'));
    pc.body.appendChild(deps.sliderRow('Half X', collision.hx == null ? .92 : collision.hx, .1, 4, .01, v => setCollision({hx:v}), v => (+v).toFixed(2)).root);
    pc.body.appendChild(deps.sliderRow('Half Y', collision.hy == null ? .42 : collision.hy, .05, 2, .01, v => setCollision({hy:v}), v => (+v).toFixed(2)).root);
    pc.body.appendChild(deps.sliderRow('Half Z', collision.hz == null ? 1.85 : collision.hz, .1, 6, .01, v => setCollision({hz:v}), v => (+v).toFixed(2)).root);
    pc.body.appendChild(deps.sliderRow('Shape offset Y', collision.offsetY == null ? .45 : collision.offsetY, -1, 3, .01, v => setCollision({offsetY:v}), v => (+v).toFixed(2)).root);
    pc.body.appendChild(deps.sliderRow('Body height Y', collision.bodyY == null ? .55 : collision.bodyY, .05, 3, .01, v => setCollision({bodyY:v}), v => (+v).toFixed(2)).root);
    pc.body.appendChild(deps.sliderRow('Arcade radius', collision.radius == null ? 1.4 : collision.radius, .2, 5, .01, v => setCollision({radius:v}), v => (+v).toFixed(2)).root);
    box.appendChild(pc.root);

    deps.playerCameraInspector.build(box);
    deps.playerLightsInspector.build(box);
    deps.playerAttachmentsInspector.build(box);
    deps.playerSetupInspector.build(box);
  }

  function openSoundDesigner(setId){
    const open = () => {
      if(window.LK_SOUND_DESIGNER) window.LK_SOUND_DESIGNER.open(setId);
      else deps.status('⚠ Sound Designer non disponibile');
    };
    if(window.LK_SOUND_DESIGNER) return open();
    const loadScript = src => new Promise((resolve, reject) => {
      if(document.querySelector('script[data-lk-src="' + src + '"], script[src^="' + src + '"]')) return resolve();
      const s = document.createElement('script');
      s.dataset.lkSrc = src;
      s.src = src + '?v=' + Date.now();
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
    Promise.resolve()
      .then(() => window.LK_SOUND_DESIGNER_TEMPLATE ? null : loadScript('js/editor/sound-designer-template.js'))
      .then(() => window.LK_SOUND_DESIGNER_FORM ? null : loadScript('js/editor/sound-designer-form.js'))
      .then(() => loadScript('js/editor/sound-designer.js'))
      .then(open)
      .catch(() => deps.status('⚠ Sound Designer non caricato'));
  }

  return Object.freeze({
    buildInspector,
    syncTransformFields,
    openSoundDesigner,
  });
}

window.LK_EDITOR_INSPECTOR_CONTROLLER = Object.freeze({create});
})();
