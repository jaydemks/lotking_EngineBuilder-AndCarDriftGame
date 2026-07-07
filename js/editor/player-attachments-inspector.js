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

  function buildExhaust(box){
    if(!GAME.player.exhaust || !GAME.player.setExhaust) return;
    const sx = section('SCARICO / FUMO', false);
    const ex = GAME.player.exhaust;
    const updEx = patch => { GAME.player.setExhaust(patch); markDirty(); };
    const selectExhaust = id => {
      const anchor = GAME.world.registry.find(x => x.userData.editorId === id);
      if(!anchor) return;
      GAME.player.setExhaust({dummyVisible:true});
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    const addExhaust = () => {
      if(!GAME.player.addExhaust) return;
      const anchor = GAME.player.addExhaust({enabled:true});
      GAME.player.setExhaust({dummyVisible:true});
      markDirty();
      refreshOutliner();
      if(anchor){
        selectObject(anchor);
        if(ED.tool === 'select') setTool('translate');
      }
    };
    sx.body.appendChild(el('<div class="lk-hint">Sources attached to the vehicle: place them on the exhaust. Smoke follows throttle, shifting and limiter.</div>'));
    sx.body.appendChild(btnRow([
      {label:'+ Sorgente scarico', action:addExhaust},
      {label:'Prova fumo/fuoco', action:() => { if(GAME.player.testExhaust) GAME.player.testExhaust(); }},
    ]));
    sx.body.appendChild(checkRow('Scarico attivo', ex.enabled, v => updEx({enabled:v})).root);
    sx.body.appendChild(checkRow('Mostra dummy scarico', ex.dummyVisible !== false, v => updEx({dummyVisible:v})).root);
    sx.body.appendChild(checkRow('Fumo accelerazione', ex.smoke !== false, v => updEx({smoke:v})).root);
    sx.body.appendChild(checkRow('Fumo minimo da fermo', ex.idleSmoke !== false, v => updEx({idleSmoke:v})).root);
    sx.body.appendChild(sliderRow('Intensità', ex.intensity, 0, 4, .05, v => updEx({intensity:v})).root);
    sx.body.appendChild(sliderRow('Soglia acceleratore', ex.smokeThrottle, 0, 1, .01, v => updEx({smokeThrottle:v}), v => Math.round(v * 100) + '%').root);
    sx.body.appendChild(checkRow('Sparo fuoco', ex.fire !== false, v => updEx({fire:v})).root);
    sx.body.appendChild(sliderRow('Giri fuoco', ex.fireRpm, .55, 1.08, .01, v => updEx({fireRpm:v}), v => Math.round(v * 100) + '%').root);
    sx.body.appendChild(checkRow('Fuoco al cambio', ex.shiftFire !== false, v => updEx({shiftFire:v})).root);
    sx.body.appendChild(checkRow('Fuoco limitatore', ex.limiterFire !== false, v => updEx({limiterFire:v})).root);
    (ex.sources || []).forEach((src, idx) => {
      const ss = section('SORGENTE SCARICO ' + (idx + 1), false);
      const patch = p => { const a = []; a[idx] = p; updEx({sources:a}); };
      ss.body.appendChild(btnRow([
        {label:'Select dummy', action:() => selectExhaust('player_exhaust_' + idx)},
        {label:'Prova da qui', action:() => {
          const anchor = GAME.world.registry.find(x => x.userData.editorId === 'player_exhaust_' + idx);
          if(anchor) selectExhaust('player_exhaust_' + idx);
          if(GAME.player.testExhaust) GAME.player.testExhaust(anchor);
        }},
      ]));
      ss.body.appendChild(checkRow('Attiva sorgente', src.enabled !== false, v => patch({enabled:v, userDisabled:!v})).root);
      sx.body.appendChild(ss.root);
    });
    box.appendChild(sx.root);
  }

  function buildSkids(box){
    if(!GAME.player.skids || !GAME.player.setSkids) return;
    const sk = GAME.player.skids;
    const skidLabel = (src, idx) => {
      const labels = {
        rearLeft:'Posteriore L',
        rearRight:'Posteriore R',
        frontLeft:'Anteriore L',
        frontRight:'Anteriore R',
      };
      return labels[(src && src.wheel) || ''] || ('Sorgente ' + (idx + 1));
    };
    const ss = section('SKID MARKS', false);
    const updSk = patch => { GAME.player.setSkids(patch); markDirty(); };
    const selectSkid = id => {
      const anchor = GAME.world.registry.find(x => x.userData.editorId === id);
      if(!anchor) return;
      GAME.player.setSkids({dummyVisible:true});
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    const addSkid = () => {
      if(!GAME.player.addSkid) return;
      const anchor = GAME.player.addSkid({enabled:true});
      GAME.player.setSkids({dummyVisible:true});
      markDirty();
      refreshOutliner();
      if(anchor){
        selectObject(anchor);
        if(ED.tool === 'select') setTool('translate');
      }
    };
    ss.body.appendChild(el('<div class="lk-hint">Skid mark sources attached to the vehicle. Move and scale each dummy to align tire marks with the car.</div>'));
    ss.body.appendChild(btnRow([
      {label:'+ Sorgente sgommata', action:addSkid},
      {label:'Post L', action:() => selectSkid('player_skid_0')},
      {label:'Post R', action:() => selectSkid('player_skid_1')},
      {label:'Ant L', action:() => selectSkid('player_skid_2')},
      {label:'Ant R', action:() => selectSkid('player_skid_3')},
    ]));
    ss.body.appendChild(checkRow('Sgommate attive', sk.enabled !== false, v => updSk({enabled:v})).root);
    ss.body.appendChild(checkRow('Mostra dummy sgommate', sk.dummyVisible !== false, v => updSk({dummyVisible:v})).root);
    ss.body.appendChild(sliderRow('Larghezza base', sk.width == null ? .24 : sk.width, .04, 1.2, .01, v => updSk({width:v}), v => (+v).toFixed(2)).root);
    ss.body.appendChild(sliderRow('Lunghezza base', sk.length == null ? .7 : sk.length, .08, 3.0, .01, v => updSk({length:v}), v => (+v).toFixed(2)).root);
    ss.body.appendChild(sliderRow('Opacità', sk.opacity == null ? .55 : sk.opacity, .05, 1, .01, v => updSk({opacity:v}), v => Math.round(v * 100) + '%').root);
    ss.body.appendChild(sliderRow('Durata segno', sk.life == null ? 14 : sk.life, 1, 40, .5, v => updSk({life:v}), v => (+v).toFixed(1) + 's').root);
    (sk.sources || []).forEach((src, idx) => {
      const row = section('SGOMMATA ' + skidLabel(src, idx), false);
      const patch = p => { const a = []; a[idx] = p; updSk({sources:a}); };
      row.body.appendChild(btnRow([{label:'Select dummy', action:() => selectSkid('player_skid_' + idx)}]));
      row.body.appendChild(checkRow('Attiva sorgente', src.enabled !== false, v => patch({enabled:v})).root);
      ss.body.appendChild(row.root);
    });
    box.appendChild(ss.root);
  }

  function buildDataWidgets(box){
    if(!GAME.player.dataWidgets || !GAME.player.setDataWidgets) return;
    const dw = GAME.player.dataWidgets;
    const sw = section('3D DATA WIDGETS', false);
    const updWidget = (idx, patch) => {
      const items = [];
      items[idx] = patch;
      GAME.player.setDataWidgets({items});
      markDirty();
    };
    const selectWidget = key => {
      const anchor = GAME.world.registry.find(x => x.userData.editorId === 'player_data_' + key);
      if(!anchor) return;
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    sw.body.appendChild(el('<div class="lk-hint">Floating data text attached to the player. Move each widget with the gizmo, like vehicle lights.</div>'));
    sw.body.appendChild(checkRow('Show helpers in editor', dw.visibleInEditor !== false, v => {
      GAME.player.setDataWidgets({visibleInEditor:v});
      markDirty();
    }).root);
    (dw.items || []).forEach((item, idx) => {
      const ws = section('WIDGET ' + (item.label || item.key), false);
      ws.body.appendChild(btnRow([{label:'Select widget', action:() => selectWidget(item.key)}]));
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

  function build(box){
    buildExhaust(box);
    buildSkids(box);
    buildDataWidgets(box);
  }

  return Object.freeze({build});
}

window.LK_EDITOR_PLAYER_ATTACHMENTS_INSPECTOR = Object.freeze({create});
})();
