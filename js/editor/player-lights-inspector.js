/* =========================================================
   LOT KING — PLAYER LIGHTS INSPECTOR
   Vehicle lights, auxiliary lights and underglow neon controls.
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
  const colorRow = deps.colorRow;
  const sliderRow = deps.sliderRow;
  const selectRow = deps.selectRow;
  const el = deps.el;
  const requestWarmup = deps.requestWarmup || function(){};
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function build(box){
    if(!GAME.player.lights || !GAME.player.setLights) return;
    const sh = section(tr('VEHICLE LIGHTS', 'LUCI VEICOLO'), false);
    const lights = GAME.player.lights;
    const upd = patch => { GAME.player.setLights(patch); requestWarmup(tr('Warm-up lights...', 'Preparazione luci...')); markDirty(); };
    const hourLabel = value => {
      const total = Math.round(Math.max(0, Math.min(24, Number(value) || 0)) * 60) % (24 * 60);
      return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
    };
    sh.body.appendChild(el('<div class="lk-hint">' + tr('Spot headlights and reactive rear lights for position, brake and reverse.', 'Fari anteriori spot e luci posteriori reattive per posizione, freno e retromarcia.') + '</div>'));
    sh.body.appendChild(checkRow(tr('Show light dummies', 'Mostra dummy luci'), lights.dummies && lights.dummies.visible, v => { upd({dummies:{visible:v}}); refreshOutliner(); }).root);
    const addVehicleLight = preset => {
      if(!GAME.player.addLight) return;
      const anchor = GAME.player.addLight(preset);
      GAME.player.setLights({dummies:{visible:true}});
      requestWarmup('Warm-up light...');
      markDirty();
      refreshOutliner();
      if(anchor){
        selectObject(anchor);
        if(ED.tool === 'select') setTool('translate');
      }
    };
    const selectVehicleLight = id => {
      const anchor = GAME.world.registry.find(x => x.userData.editorId === id);
      if(!anchor) return;
      GAME.player.setLights({dummies:{visible:true}});
      selectObject(anchor);
      if(ED.tool === 'select') setTool('translate');
    };
    sh.body.appendChild(btnRow([
      {label:'Front L', action:() => selectVehicleLight('player_front_light_0')},
      {label:'Front R', action:() => selectVehicleLight('player_front_light_1')},
      {label:'Pos L', action:() => selectVehicleLight('player_rear_position_0')},
      {label:'Pos R', action:() => selectVehicleLight('player_rear_position_1')},
    ]));
    sh.body.appendChild(btnRow([
      {label:'Brake L', action:() => selectVehicleLight('player_rear_brake_0')},
      {label:'Brake R', action:() => selectVehicleLight('player_rear_brake_1')},
      {label:'Rev L', action:() => selectVehicleLight('player_rear_reverse_0')},
      {label:'Rev R', action:() => selectVehicleLight('player_rear_reverse_1')},
    ]));
    sh.body.appendChild(btnRow([
      {label:'Aux 1', action:() => selectVehicleLight('player_aux_light_0')},
      {label:'Aux 2', action:() => selectVehicleLight('player_aux_light_1')},
    ]));
    sh.body.appendChild(btnRow([
      {label:tr('+ Brake', '+ Freno'), action:() => addVehicleLight({condition:'brake', color:0xff2020, intensity:1.6, enabled:true})},
      {label:tr('+ Reverse', '+ Retro'), action:() => addVehicleLight({condition:'reverse', color:0xf3f4ff, intensity:1.4, enabled:true})},
      {label:tr('+ Turn', '+ Freccia'), action:() => addVehicleLight({condition:'left', color:0xffaa18, intensity:1.2, enabled:true})},
      {label:tr('+ Auxiliary', '+ Ausiliaria'), action:() => addVehicleLight({condition:'always', color:0xffd166, intensity:1.1, enabled:true})},
    ]));
    sh.body.appendChild(checkRow(tr('Headlights', 'Fari anteriori'), lights.front.enabled, v => upd({front:{enabled:v}})).root);
    sh.body.appendChild(checkRow(tr('Auto day/night', 'Auto giorno/notte'), lights.front.auto, v => upd({front:{auto:v}})).root);
    sh.body.appendChild(sliderRow(tr('Automatic switch-on time', 'Ora accensione automatica'), lights.front.autoOnHour == null ? 18 : lights.front.autoOnHour, 0, 24, .25, v => upd({front:{autoOnHour:v}}), hourLabel).root);
    sh.body.appendChild(sliderRow(tr('Automatic switch-off time', 'Ora spegnimento automatico'), lights.front.autoOffHour == null ? 7 : lights.front.autoOffHour, 0, 24, .25, v => upd({front:{autoOffHour:v}}), hourLabel).root);
    sh.body.appendChild(el('<div class="lk-hint">' + tr('The schedule follows the authored day/night clock and also drives auxiliary lights set to Night. Equal times keep the automatic window active all day.', 'La programmazione segue l’orologio del ciclo giorno/notte e controlla anche le luci ausiliarie impostate su Notte. Orari uguali mantengono la finestra automatica attiva tutto il giorno.') + '</div>'));
    sh.body.appendChild(sliderRow(tr('Headlight count', 'Numero fari anteriori'), lights.front.count, 1, 2, 1, v => upd({front:{count:Math.round(v)}})).root);
    sh.body.appendChild(colorRow(tr('Headlight color', 'Colore fari'), lights.front.color, v => upd({front:{color:v}})).root);
    sh.body.appendChild(sliderRow(tr('Headlight intensity', 'Intensita fari'), lights.front.intensity, 0, 6, .05, v => upd({front:{intensity:v}})).root);
    sh.body.appendChild(sliderRow(tr('Headlight distance', 'Distanza fari'), lights.front.distance, 5, 80, 1, v => upd({front:{distance:v}})).root);
    sh.body.appendChild(sliderRow(tr('Headlight cone', 'Cono fari'), lights.front.angle, .15, 1.1, .01, v => upd({front:{angle:v}}), v => (+v).toFixed(2)).root);
    sh.body.appendChild(checkRow(tr('Headlight glow', 'Glow fari'), lights.front.glow, v => upd({front:{glow:v}})).root);
    sh.body.appendChild(checkRow(tr('Headlight bloom', 'Bloom fari'), lights.front.bloom, v => upd({front:{bloom:v}})).root);
    sh.body.appendChild(sliderRow(tr('Headlight bloom intensity', 'Intensita bloom fari'), lights.front.bloomIntensity, 0, 1.5, .05, v => upd({front:{bloomIntensity:v}})).root);
    sh.body.appendChild(checkRow(tr('Headlight lens flare', 'Lens flare fari'), lights.front.flare, v => upd({front:{flare:v}})).root);
    sh.body.appendChild(sliderRow('Front glow scale', lights.front.glowSize, .1, 2.2, .05, v => upd({front:{glowSize:v}})).root);
    sh.body.appendChild(sliderRow('Front flare scale', lights.front.flareSize, .1, 2.2, .05, v => upd({front:{flareSize:v}})).root);
    sh.body.appendChild(checkRow(tr('Rear lights', 'Luci posteriori'), lights.rear.enabled, v => upd({rear:{enabled:v}})).root);
    sh.body.appendChild(colorRow(tr('Position/brake color', 'Colore posizione/freno'), lights.rear.color, v => upd({rear:{color:v}})).root);
    sh.body.appendChild(sliderRow(tr('Rear position', 'Posizione posteriore'), lights.rear.baseIntensity, 0, 2, .05, v => upd({rear:{baseIntensity:v}})).root);
    sh.body.appendChild(sliderRow(tr('Rear brake', 'Freno posteriore'), lights.rear.brakeIntensity, 0, 6, .05, v => upd({rear:{brakeIntensity:v}})).root);
    sh.body.appendChild(colorRow(tr('Reverse color', 'Colore retromarcia'), lights.rear.reverseColor, v => upd({rear:{reverseColor:v}})).root);
    sh.body.appendChild(sliderRow(tr('Reverse', 'Retromarcia'), lights.rear.reverseIntensity, 0, 5, .05, v => upd({rear:{reverseIntensity:v}})).root);
    sh.body.appendChild(checkRow(tr('Rear glow', 'Glow posteriori'), lights.rear.glow, v => upd({rear:{glow:v}})).root);
    sh.body.appendChild(checkRow(tr('Rear bloom', 'Bloom posteriori'), lights.rear.bloom, v => upd({rear:{bloom:v}})).root);
    sh.body.appendChild(sliderRow(tr('Rear bloom intensity', 'Intensita bloom posteriori'), lights.rear.bloomIntensity, 0, 1.5, .05, v => upd({rear:{bloomIntensity:v}})).root);
    sh.body.appendChild(checkRow(tr('Rear lens flare', 'Lens flare posteriori'), lights.rear.flare, v => upd({rear:{flare:v}})).root);
    sh.body.appendChild(sliderRow('Rear glow scale', lights.rear.glowSize, .1, 2.2, .05, v => upd({rear:{glowSize:v}})).root);
    sh.body.appendChild(sliderRow('Rear flare scale', lights.rear.flareSize, .1, 2.2, .05, v => upd({rear:{flareSize:v}})).root);
    (lights.aux || []).forEach((aux, idx) => {
      const sa = section(tr('EXTRA LIGHT ', 'LUCE EXTRA ') + (idx + 1), false);
      const patch = p => { const a = []; a[idx] = p; upd({aux:a}); };
      sa.body.appendChild(btnRow([{label:'Select dummy', action:() => selectVehicleLight('player_aux_light_' + idx)}]));
      sa.body.appendChild(checkRow(tr('Enabled', 'Attiva'), aux.enabled, v => patch({enabled:v})).root);
      sa.body.appendChild(selectRow(tr('Action', 'Azione'), aux.condition, [
        {value:'always', label:tr('Always', 'Sempre')},
        {value:'night', label:tr('Night', 'Notte')},
        {value:'brake', label:tr('Brake', 'Freno')},
        {value:'reverse', label:tr('Reverse', 'Retromarcia')},
        {value:'left', label:tr('Turn/steer left', 'Freccia/Sterzo SX')},
        {value:'right', label:tr('Turn/steer right', 'Freccia/Sterzo DX')},
      ], v => patch({condition:v})).root);
      sa.body.appendChild(colorRow(tr('Color', 'Colore'), aux.color, v => patch({color:v})).root);
      sa.body.appendChild(sliderRow(tr('Intensity', 'Intensita'), aux.intensity, 0, 6, .05, v => patch({intensity:v})).root);
      sa.body.appendChild(checkRow('Glow', aux.glow, v => patch({glow:v})).root);
      sa.body.appendChild(checkRow('Lens flare', aux.flare, v => patch({flare:v})).root);
      sa.body.appendChild(sliderRow('Effect scale', aux.size, .1, 2.2, .05, v => patch({size:v})).root);
      sh.body.appendChild(sa.root);
    });
    box.appendChild(sh.root);

    const sn = section(tr('UNDERGLOW NEON', 'NEON SOTTO-SCOCCA'), false);
    sn.body.appendChild(el('<div class="lk-hint">Neon tuning presets linked to the vehicle. These sets can be exposed in the game later.</div>'));
    sn.body.appendChild(btnRow([
      {label:'Neon L', action:() => selectVehicleLight('player_neon_left')},
      {label:'Neon R', action:() => selectVehicleLight('player_neon_right')},
      {label:'Neon Front', action:() => selectVehicleLight('player_neon_front')},
      {label:'Neon Rear', action:() => selectVehicleLight('player_neon_rear')},
    ]));
    sn.body.appendChild(checkRow(tr('Neon enabled', 'Neon attivo'), lights.neon.enabled, v => upd({neon:{enabled:v}})).root);
    sn.body.appendChild(checkRow(tr('Show neon dummies', 'Mostra dummy neon'), lights.neon.dummyVisible !== false, v => upd({neon:{dummyVisible:v}})).root);
    sn.body.appendChild(selectRow(tr('Neon set', 'Set neon'), lights.neon.layout, [
      {value:'none', label:tr('None', 'Nessuno')},
      {value:'sides', label:tr('Sides only', 'Solo lati')},
      {value:'frontRear', label:tr('Front/rear only', 'Solo avanti/dietro')},
      {value:'all', label:tr('All 4 sides', 'Tutti e 4 i lati')},
    ], v => upd({neon:{layout:v}})).root);
    sn.body.appendChild(colorRow(tr('Neon color A', 'Neon colore A'), lights.neon.colorA, v => upd({neon:{colorA:v}})).root);
    sn.body.appendChild(colorRow(tr('Neon color B', 'Neon colore B'), lights.neon.colorB, v => upd({neon:{colorB:v}})).root);
    sn.body.appendChild(sliderRow(tr('Neon intensity', 'Intensita neon'), lights.neon.intensity, 0, 4, .05, v => upd({neon:{intensity:v}})).root);
    sn.body.appendChild(sliderRow(tr('Neon light spill', 'Spill luce neon'), lights.neon.spill == null ? 2.8 : lights.neon.spill, .4, 8, .1, v => upd({neon:{spill:v}}), v => (+v).toFixed(1) + 'm').root);
    sn.body.appendChild(checkRow(tr('Neon shadows', 'Ombre neon'), !!lights.neon.shadows, v => upd({neon:{shadows:v}})).root);
    sn.body.appendChild(selectRow(tr('Neon animation', 'Animazione neon'), lights.neon.animation, [
      {value:'static', label:tr('Static', 'Statico')},
      {value:'pulse', label:'Pulse'},
      {value:'alternate', label:tr('Alternate', 'Alternato')},
      {value:'chase', label:'Chase'},
    ], v => upd({neon:{animation:v}})).root);
    sn.body.appendChild(sliderRow(tr('Animation speed', 'Velocita animazione'), lights.neon.speed, .1, 4, .05, v => upd({neon:{speed:v}})).root);
    box.appendChild(sn.root);
  }

  return Object.freeze({build});
}

window.LK_EDITOR_PLAYER_LIGHTS_INSPECTOR = Object.freeze({create});
})();
