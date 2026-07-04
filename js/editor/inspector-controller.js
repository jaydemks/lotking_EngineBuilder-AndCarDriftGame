/* =========================================================
   LOT KING - EDITOR INSPECTOR CONTROLLER
   Routes the inspector panel and player blueprint inspector shell.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
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

  function buildInspector(){
    const box = deps.insp();
    box.innerHTML = '';
    tf.inputs = null;
    if(ED.special === 'env') return deps.environmentInspector.build(box);
    if(ED.special === 'hud') return deps.hudInspector.build(box);
    const o = ED.selected;
    if(!o){
      box.appendChild(deps.el('<div class="lk-empty">No selection.<br>Click an object in the scene<br>or in the list on the left.</div>'));
      return;
    }
    if(o.userData.editorType === 'player') return buildPlayerInspector(box, o);
    return deps.objectInspector.build(box, o);
  }

  function buildPlayerInspector(box, o){
    box.appendChild(deps.el('<div class="lk-head lk-bp"><span class="lk-head-ic">🚗</span><span class="lk-bp-title">BLUEPRINT · PLAYER</span><span class="lk-head-id">player vehicle</span></div>'));
    box.appendChild(deps.btnRow([
      {label:'◇ Copy blueprint', action: deps.copyPlayerBlueprintAsset},
      {label:'★ Promote current to Base', action:() => {
        const bp = deps.currentPlayerBlueprint();
        if(bp && STORE.playerBlueprints && STORE.playerBlueprints.setDefault){
          STORE.playerBlueprints.setDefault(bp, {levelId: ED.trackId, levelName: ED.trackName, copiedFrom: 'scene-player'});
          deps.applyPlayerBlueprintAsset(bp, {applySpawn:false, silent:true});
          deps.status('Current player blueprint promoted to Base');
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
