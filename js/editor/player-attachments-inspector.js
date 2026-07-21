/* =========================================================
   LOT KING — PLAYER ATTACHMENTS INSPECTOR
   Exhaust sources and 3D data widgets controls.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const ED = deps.ED;
  const markDirty = deps.markDirty;
  const refreshOutliner = deps.refreshOutliner;
  const selectObject = deps.selectObject;
  const setTool = deps.setTool;
  const section = deps.section;
  const btnRow = deps.btnRow;
  const checkRow = deps.checkRow;
  const sliderRow = deps.sliderRow;
  const selectRow = deps.selectRow;
  const colorRow = deps.colorRow;
  const el = deps.el;
  const pushHistory = deps.pushHistory || function(){};
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function buildExhaust(box, player){
    if(!player.exhaust || !player.setExhaust) return;
    const sx = section(tr('EXHAUST / SMOKE', 'SCARICO / FUMO'), false);
    const ex = player.exhaust;
    let replayEx = false;
    const restoreEx = value => { replayEx=true; player.setExhaust(JSON.parse(JSON.stringify(value))); Object.keys(ex).forEach(key=>delete ex[key]); Object.assign(ex,JSON.parse(JSON.stringify(value))); markDirty(); replayEx=false; };
    const updEx = patch => { const before=JSON.parse(JSON.stringify(ex)); player.setExhaust(patch); markDirty(); const after=JSON.parse(JSON.stringify(ex)); if(!replayEx&&JSON.stringify(before)!==JSON.stringify(after)) pushHistory({label:'Vehicle Pawn exhaust',undo:()=>restoreEx(before),redo:()=>restoreEx(after)}); };
    const selectExhaust = id => {
      const anchor = player.findAnchor ? player.findAnchor(id) : GAME.world.registry.find(x => x.userData.editorId === id);
      if(!anchor) return;
      player.setExhaust({dummyVisible:true});
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    const addExhaust = () => {
      if(!player.addExhaust) return;
      const anchor = player.addExhaust({enabled:true});
      player.setExhaust({dummyVisible:true});
      markDirty();
      refreshOutliner();
      if(anchor){
        selectObject(anchor);
        if(ED.tool === 'select') setTool('translate');
      }
    };
    sx.body.appendChild(el('<div class="lk-hint">Sources attached to the vehicle: place them on the exhaust. Smoke follows throttle, shifting and limiter.</div>'));
    sx.body.appendChild(btnRow([
      {label:tr('+ Exhaust source', '+ Sorgente scarico'), action:addExhaust},
      {label:tr('Test smoke/fire', 'Prova fumo/fuoco'), action:() => { if(player.testExhaust) player.testExhaust(); }},
    ]));
    sx.body.appendChild(checkRow(tr('Exhaust enabled', 'Scarico attivo'), ex.enabled, v => updEx({enabled:v})).root);
    sx.body.appendChild(checkRow(tr('Show exhaust dummies', 'Mostra dummy scarico'), ex.dummyVisible !== false, v => updEx({dummyVisible:v})).root);
    sx.body.appendChild(checkRow(tr('Throttle smoke', 'Fumo accelerazione'), ex.smoke !== false, v => updEx({smoke:v})).root);
    sx.body.appendChild(checkRow(tr('Idle smoke while stopped', 'Fumo minimo da fermo'), ex.idleSmoke !== false, v => updEx({idleSmoke:v})).root);
    sx.body.appendChild(sliderRow(tr('Intensity', 'Intensita'), ex.intensity, 0, 4, .05, v => updEx({intensity:v})).root);
    sx.body.appendChild(sliderRow(tr('Throttle threshold', 'Soglia acceleratore'), ex.smokeThrottle, 0, 1, .01, v => updEx({smokeThrottle:v}), v => Math.round(v * 100) + '%').root);
    sx.body.appendChild(checkRow(tr('Fire burst', 'Sparo fuoco'), ex.fire !== false, v => updEx({fire:v})).root);
    sx.body.appendChild(sliderRow(tr('Fire RPM', 'Giri fuoco'), ex.fireRpm, .55, 1.08, .01, v => updEx({fireRpm:v}), v => Math.round(v * 100) + '%').root);
    sx.body.appendChild(checkRow(tr('Shift fire', 'Fuoco al cambio'), ex.shiftFire !== false, v => updEx({shiftFire:v})).root);
    sx.body.appendChild(checkRow(tr('Limiter fire', 'Fuoco limitatore'), ex.limiterFire !== false, v => updEx({limiterFire:v})).root);
    (ex.sources || []).forEach((src, idx) => {
      const ss = section(tr('EXHAUST SOURCE ', 'SORGENTE SCARICO ') + (idx + 1), false);
      const patch = p => { const a = []; a[idx] = p; updEx({sources:a}); };
      ss.body.appendChild(btnRow([
        {label:'Select dummy', action:() => selectExhaust('player_exhaust_' + idx)},
        {label:tr('Test from here', 'Prova da qui'), action:() => {
          const anchor = GAME.world.registry.find(x => x.userData.editorId === 'player_exhaust_' + idx);
          if(anchor) selectExhaust('player_exhaust_' + idx);
          if(player.testExhaust) player.testExhaust(anchor);
        }},
        {label:tr('Duplicate', 'Duplica'), action:() => { if(player.duplicateExhaust && player.duplicateExhaust(idx) !== false){ markDirty(); refreshOutliner(); } }},
        {label:'↑', action:() => { if(player.moveExhaust && player.moveExhaust(idx, -1)){ markDirty(); refreshOutliner(); } }},
        {label:'↓', action:() => { if(player.moveExhaust && player.moveExhaust(idx, 1)){ markDirty(); refreshOutliner(); } }},
        {label:tr('Remove', 'Rimuovi'), action:() => { if(player.removeExhaust && player.removeExhaust(idx)){ markDirty(); refreshOutliner(); } }},
      ]));
      ss.body.appendChild(checkRow(tr('Source enabled', 'Attiva sorgente'), src.enabled !== false, v => patch({enabled:v, userDisabled:!v})).root);
      sx.body.appendChild(ss.root);
    });
    box.appendChild(sx.root);
  }

  function buildSkids(box, player){
    if(!player.skids || !player.setSkids) return;
    const sk = player.skids;
    const skidLabel = (src, idx) => {
      const labels = {
        rearLeft:tr('Rear L', 'Posteriore L'),
        rearRight:tr('Rear R', 'Posteriore R'),
        frontLeft:tr('Front L', 'Anteriore L'),
        frontRight:tr('Front R', 'Anteriore R'),
      };
      return labels[(src && src.wheel) || ''] || (tr('Source ', 'Sorgente ') + (idx + 1));
    };
    const ss = section(tr('TIRE EFFECTS', 'EFFETTI GOMME'), false);
    let replaySk = false;
    const restoreSk = value => { replaySk=true; player.setSkids(JSON.parse(JSON.stringify(value))); Object.keys(sk).forEach(key=>delete sk[key]); Object.assign(sk,JSON.parse(JSON.stringify(value))); markDirty(); replaySk=false; };
    const updSk = patch => { const before=JSON.parse(JSON.stringify(sk)); player.setSkids(patch); markDirty(); const after=JSON.parse(JSON.stringify(sk)); if(!replaySk&&JSON.stringify(before)!==JSON.stringify(after)) pushHistory({label:'Vehicle Pawn skids',undo:()=>restoreSk(before),redo:()=>restoreSk(after)}); };
    const selectSkid = id => {
      const anchor = player.findAnchor ? player.findAnchor(id) : GAME.world.registry.find(x => x.userData.editorId === id);
      if(!anchor) return;
      player.setSkids({dummyVisible:true});
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    const addSkid = () => {
      if(!player.addSkid) return;
      const anchor = player.addSkid({enabled:true});
      player.setSkids({dummyVisible:true});
      markDirty();
      refreshOutliner();
      if(anchor){
        selectObject(anchor);
        if(ED.tool === 'select') setTool('translate');
      }
    };
    ss.body.appendChild(el('<div class="lk-hint">' + tr('Controls tire smoke and skid marks separately. The smoke threshold is the minimum wheel slip required before smoke can appear.', 'Controlla separatamente fumo gomme e segni. La soglia fumo indica lo slittamento minimo necessario prima che il fumo possa comparire.') + '</div>'));
    ss.body.appendChild(btnRow([
      {label:tr('+ Skid source', '+ Sorgente sgommata'), action:addSkid},
      {label:tr('Rear L', 'Post L'), action:() => selectSkid('player_skid_0')},
      {label:tr('Rear R', 'Post R'), action:() => selectSkid('player_skid_1')},
      {label:tr('Front L', 'Ant L'), action:() => selectSkid('player_skid_2')},
      {label:tr('Front R', 'Ant R'), action:() => selectSkid('player_skid_3')},
    ]));
    ss.body.appendChild(checkRow(tr('Skids enabled', 'Sgommate attive'), sk.enabled !== false, v => updSk({enabled:v})).root);
    ss.body.appendChild(checkRow(tr('Show skid dummies', 'Mostra dummy sgommate'), sk.dummyVisible !== false, v => updSk({dummyVisible:v})).root);
    ss.body.appendChild(checkRow(tr('Tire smoke enabled', 'Fumo gomme attivo'), sk.smokeEnabled !== false, v => updSk({smokeEnabled:v})).root);
    ss.body.appendChild(sliderRow(tr('Smoke amount', 'Quantita fumo'), sk.smokeAmount == null ? .28 : sk.smokeAmount, 0, 2, .02, v => updSk({smokeAmount:v,smokeModelVersion:3}), v => (+v).toFixed(2) + 'x').root);
    ss.body.appendChild(sliderRow(tr('Smoke slip threshold', 'Soglia slittamento fumo'), sk.smokeThreshold == null ? .35 : sk.smokeThreshold, 0, 1, .01, v => updSk({smokeThreshold:v,smokeModelVersion:3}), v => Math.round(v * 100) + '%').root);
    ss.body.appendChild(sliderRow(tr('Minimum tire heat', 'Temperatura minima gomme'), sk.smokeMinHeat == null ? .3 : sk.smokeMinHeat, 0, 1, .01, v => updSk({smokeMinHeat:v,smokeModelVersion:3}), v => Math.round(v * 100) + '%').root);
    ss.body.appendChild(sliderRow(tr('Tire heating rate', 'Velocita riscaldamento gomme'), sk.smokeHeatRate == null ? .75 : sk.smokeHeatRate, 0, 3, .05, v => updSk({smokeHeatRate:v,smokeModelVersion:3}), v => (+v).toFixed(2) + 'x').root);
    ss.body.appendChild(sliderRow(tr('Tire cooling rate', 'Velocita raffreddamento gomme'), sk.smokeCoolRate == null ? .4 : sk.smokeCoolRate, 0, 2, .05, v => updSk({smokeCoolRate:v,smokeModelVersion:3}), v => (+v).toFixed(2) + 'x').root);
    ss.body.appendChild(checkRow(tr('Smoke while drifting', 'Fumo durante il drift'), sk.smokeOnDrift !== false, v => updSk({smokeOnDrift:v})).root);
    ss.body.appendChild(checkRow(tr('Smoke while braking', 'Fumo in frenata'), sk.smokeOnBrake !== false, v => updSk({smokeOnBrake:v})).root);
    ss.body.appendChild(checkRow(tr('Smoke on wheelspin / burnout', 'Fumo in sgommata / burnout'), sk.smokeOnAcceleration !== false, v => updSk({smokeOnAcceleration:v})).root);
    ss.body.appendChild(sliderRow(tr('Base width', 'Larghezza base'), sk.width == null ? .24 : sk.width, .04, 1.2, .01, v => updSk({width:v}), v => (+v).toFixed(2)).root);
    ss.body.appendChild(sliderRow(tr('Base length', 'Lunghezza base'), sk.length == null ? .7 : sk.length, .08, 3.0, .01, v => updSk({length:v}), v => (+v).toFixed(2)).root);
    ss.body.appendChild(sliderRow(tr('Opacity', 'Opacita'), sk.opacity == null ? .55 : sk.opacity, .05, 1, .01, v => updSk({opacity:v}), v => Math.round(v * 100) + '%').root);
    ss.body.appendChild(sliderRow(tr('Mark life', 'Durata segno'), sk.life == null ? 14 : sk.life, 1, 40, .5, v => updSk({life:v}), v => (+v).toFixed(1) + 's').root);
    (sk.sources || []).forEach((src, idx) => {
      const row = section(tr('SKID ', 'SGOMMATA ') + skidLabel(src, idx), false);
      const patch = p => { const a = []; a[idx] = p; updSk({sources:a}); };
      row.body.appendChild(btnRow([
        {label:'Select dummy', action:() => selectSkid('player_skid_' + idx)},
        {label:tr('Duplicate', 'Duplica'), action:() => { if(player.duplicateSkid && player.duplicateSkid(idx) !== false){ markDirty(); refreshOutliner(); } }},
        {label:'↑', action:() => { if(player.moveSkid && player.moveSkid(idx, -1)){ markDirty(); refreshOutliner(); } }},
        {label:'↓', action:() => { if(player.moveSkid && player.moveSkid(idx, 1)){ markDirty(); refreshOutliner(); } }},
        {label:tr('Remove', 'Rimuovi'), action:() => { if(player.removeSkid && player.removeSkid(idx)){ markDirty(); refreshOutliner(); } }},
      ]));
      row.body.appendChild(checkRow(tr('Source enabled', 'Attiva sorgente'), src.enabled !== false, v => patch({enabled:v})).root);
      ss.body.appendChild(row.root);
    });
    box.appendChild(ss.root);
  }

  function buildDataWidgets(box, player){
    if(!player.dataWidgets || !player.setDataWidgets) return;
    const dw = player.dataWidgets;
    const sw = section('3D DATA WIDGETS', false);
    let replayWidgets = false;
    const restoreWidgets = value => { replayWidgets=true; player.setDataWidgets(JSON.parse(JSON.stringify(value))); Object.keys(dw).forEach(key=>delete dw[key]); Object.assign(dw,JSON.parse(JSON.stringify(value))); markDirty(); replayWidgets=false; };
    const updateWidgets = patch => { const before=JSON.parse(JSON.stringify(dw)); player.setDataWidgets(patch); markDirty(); const after=JSON.parse(JSON.stringify(dw)); if(!replayWidgets&&JSON.stringify(before)!==JSON.stringify(after)) pushHistory({label:'Vehicle Pawn data widgets',undo:()=>restoreWidgets(before),redo:()=>restoreWidgets(after)}); };
    sw.body.appendChild(btnRow([{label:'+ Data Widget', action:() => {
      if(!player.addDataWidget) return;
      const anchor = player.addDataWidget({key:'data' + ((dw.items || []).length + 1), label:'DATA', metric:'speed', enabled:true});
      markDirty(); refreshOutliner();
      if(anchor){ selectObject(anchor); if(ED.tool === 'select') setTool('translate'); }
    }}]));
    const updWidget = (idx, patch) => {
      const items = [];
      items[idx] = patch;
      updateWidgets({items});
    };
    const selectWidget = key => {
      const id = 'player_data_' + key;
      const anchor = player.findAnchor ? player.findAnchor(id) : GAME.world.registry.find(x => x.userData.editorId === id);
      if(!anchor) return;
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    sw.body.appendChild(el('<div class="lk-hint">Floating data text attached to the player. Move each widget with the gizmo, like vehicle lights.</div>'));
    sw.body.appendChild(checkRow('Show helpers in editor', dw.visibleInEditor !== false, v => {
      updateWidgets({visibleInEditor:v});
    }).root);
    (dw.items || []).forEach((item, idx) => {
      const ws = section('WIDGET ' + (item.label || item.key), false);
      ws.body.appendChild(btnRow([
        {label:'Select widget', action:() => selectWidget(item.key)},
        {label:tr('Duplicate', 'Duplica'), action:() => { if(player.duplicateDataWidget && player.duplicateDataWidget(idx) !== false){ markDirty(); refreshOutliner(); } }},
        {label:'↑', action:() => { if(player.moveDataWidget && player.moveDataWidget(idx, -1)){ markDirty(); refreshOutliner(); } }},
        {label:'↓', action:() => { if(player.moveDataWidget && player.moveDataWidget(idx, 1)){ markDirty(); refreshOutliner(); } }},
        {label:tr('Remove', 'Rimuovi'), action:() => { if(player.removeDataWidget && player.removeDataWidget(idx)){ markDirty(); refreshOutliner(); } }},
      ]));
      ws.body.appendChild(checkRow('Enabled', !!item.enabled, v => updWidget(idx, {enabled:v})).root);
      ws.body.appendChild(selectRow('Metric', item.metric, [
        {value:'driftPoints', label:'Drift points'},
        {value:'gForce', label:'G-force'},
        {value:'speed', label:'Speed KM/H'},
        {value:'rpm', label:'RPM'},
      ], v => updWidget(idx, {metric:v})).root);
      ws.body.appendChild(checkRow('Dynamic drift side', !!item.dynamicSide, v => updWidget(idx, {dynamicSide:v})).root);
      ws.body.appendChild(sliderRow('Mirror center X', item.mirrorCenterX || 0, -1.5, 1.5, .01, v => updWidget(idx, {mirrorCenterX:v}), v => (+v).toFixed(2)).root);
      ws.body.appendChild(sliderRow('Scale', item.scale == null ? 1 : item.scale, .25, 2.5, .05, v => updWidget(idx, {scale:v}), v => (+v).toFixed(2)).root);
      ws.body.appendChild(sliderRow('Opacity', item.opacity == null ? .95 : item.opacity, .1, 1, .01, v => updWidget(idx, {opacity:v}), v => Math.round(v*100) + '%').root);
      const color = item.color && item.color[0] === '#' ? parseInt(item.color.slice(1), 16) : 0xffd166;
      ws.body.appendChild(colorRow('Color', color, v => updWidget(idx, {color:'#' + ('000000' + v.toString(16)).slice(-6)})).root);
      sw.body.appendChild(ws.root);
    });
    box.appendChild(sw.root);
  }

  function build(box, targetPlayer){
    const player = targetPlayer || deps.player || GAME.player;
    buildExhaust(box, player);
    buildSkids(box, player);
    buildDataWidgets(box, player);
  }

  return Object.freeze({build});
}

window.LK_EDITOR_PLAYER_ATTACHMENTS_INSPECTOR = Object.freeze({create});
})();
