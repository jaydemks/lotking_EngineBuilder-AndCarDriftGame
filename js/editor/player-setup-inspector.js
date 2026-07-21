/* =========================================================
   LOT KING — PLAYER SETUP INSPECTOR
   Driving tuning, model and engine sound set controls.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const STORE = deps.STORE;
  const GAME = deps.GAME;
  const markDirty = deps.markDirty;
  const status = deps.status;
  const promptEditorAction = deps.promptEditorAction;
  const buildInspector = deps.buildInspector;
  const openSoundDesigner = deps.openSoundDesigner;
  const openPlayerModelPicker = deps.openPlayerModelPicker;
  const modelAssets = deps.modelAssets || function(){ return []; };
  const replaceModelWithAsset = deps.replaceModelWithAsset || function(){};
  const focusSelected = deps.focusSelected;
  const section = deps.section;
  const sliderRow = deps.sliderRow;
  const selectRow = deps.selectRow;
  const checkRow = deps.checkRow;
  const btnRow = deps.btnRow;
  const el = deps.el;
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function buildPawnInput(box, player){
    const input = section(tr('PAWN / LOCAL PLAYER', 'PAWN / GIOCATORE LOCALE'), false);
    const index = player.controllerIndex == null ? null : Math.max(0, Math.min(3, Number(player.controllerIndex) | 0));
    input.body.appendChild(checkRow(tr('Pawn enabled', 'Pawn attivo'), player.enabled !== false, value => {
      if(player.setEnabled) player.setEnabled(value); else player.enabled = value;
      markDirty();
    }).root);
    input.body.appendChild(checkRow(tr('Hidden in scene/runtime', 'Nascosto in scena/runtime'), player.hidden === true, value => {
      if(player.setHidden) player.setHidden(value); else { player.hidden = value; if(player.car) player.car.visible = !value; }
      markDirty();
    }).root);
    input.body.appendChild(selectRow(tr('Controlled by', 'Controllato da'), index == null ? 'none' : String(index), [
      {value:'none', label:tr('None (external possession)', 'None (possesso esterno)')},
      {value:'0', label:'Player 1'}, {value:'1', label:'Player 2'},
      {value:'2', label:'Player 3'}, {value:'3', label:'Player 4'},
    ], value => {
      const next = value === 'none' ? null : Number(value);
      if(player.setControllerIndex) player.setControllerIndex(next);
      else player.controllerIndex = next;
      markDirty(); buildInspector();
    }).root);
    const snapshot = GAME.input && GAME.input.describe ? GAME.input.describe() : null;
    const assigned = index != null && snapshot && snapshot.players && snapshot.players[index];
    input.body.appendChild(el('<div class="lk-hint">' + (assigned && assigned.deviceLabel
      ? tr('Current automatic device: ', 'Dispositivo automatico attuale: ') + assigned.deviceLabel
      : tr('Waiting for an available device. Configure bindings in Game Input.', 'In attesa di un dispositivo disponibile. Configura le associazioni in Game Input.')) + '</div>'));
    input.body.appendChild(el('<div class="lk-hint">' + tr(
      'Up to 4 local Player IDs are supported. This Pawn consumes the selected profile; simultaneous cars require one Pawn, camera and HUD instance per player.',
      'Sono supportati fino a 4 Player ID locali. Questo Pawn usa il profilo selezionato; le auto simultanee richiedono un Pawn, una camera e un HUD per ogni giocatore.'
    ) + '</div>'));
    box.appendChild(input.root);
  }

  function buildDrivingTuning(box, player){
    const sg = section(tr('DRIVING (SETUP)', 'GUIDA (SETUP)'), false);
    const tun = player.tuning.values;
    const exposed = tun.exposed || {};
    const applyPreset = (name, label) => {
      const preset = player.tuning.presets && player.tuning.presets[name];
      if(!preset) return;
      player.setTuning({...preset});
      markDirty();
      if(status) status(tr('Driving preset: ', 'Preset guida: ') + label);
      buildInspector();
    };
    sg.body.appendChild(btnRow([
      {label:'Default', action:() => applyPreset('default', 'Default')},
      {label:'Race mode', action:() => applyPreset('race', 'Race mode')},
      {label:'Drift mode', action:() => applyPreset('drift', 'Drift mode')},
      {label:'Power curves', action:() => player.tuning.openCurves && player.tuning.openCurves()},
      {label:'Export tuning', action:() => {
        if(player.tuning.exportTuning){
          player.tuning.exportTuning();
          if(status) status(tr('Vehicle tuning exported as JSON; clipboard copy is attempted when the browser allows it.', 'Tuning veicolo esportato in JSON; copia negli appunti tentata se il browser la consente.'));
        }
      }},
    ]));
    const exportExpose = document.createElement('label');
    exportExpose.className = 'lk-tune-expose lk-tune-action-expose';
    const exportCb = document.createElement('input');
    exportCb.type = 'checkbox';
    exportCb.checked = exposed.exportTuning === true;
    exportCb.addEventListener('change', () => {
      if(player.tuning.setExposed) player.tuning.setExposed('exportTuning', exportCb.checked);
      else {
        const next = Object.assign({}, tun.exposed || {});
        next.exportTuning = exportCb.checked;
        player.setTuning({exposed:next});
      }
      markDirty();
    });
    exportExpose.appendChild(exportCb);
    exportExpose.appendChild(document.createElement('span'));
    exportExpose.querySelector('span').textContent = tr('Expose export in wrench', 'Esponi export nella chiave inglese');
    sg.body.appendChild(exportExpose);
    const exposeWrap = (key, root) => {
      const wrap = document.createElement('div');
      wrap.className = 'lk-tune-param';
      wrap.appendChild(root);
      const expose = document.createElement('label');
      expose.className = 'lk-tune-expose';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = exposed[key] !== false;
      cb.addEventListener('change', () => {
        if(player.tuning.setExposed) player.tuning.setExposed(key, cb.checked);
        else {
          const next = Object.assign({}, tun.exposed || {});
          next[key] = cb.checked;
          player.setTuning({exposed:next});
        }
        markDirty();
      });
      expose.appendChild(cb);
      expose.appendChild(document.createElement('span'));
      expose.querySelector('span').textContent = tr('Expose in wrench', 'Esponi chiave inglese');
      wrap.appendChild(expose);
      return wrap;
    };
    const tRow = (key, label, min, max) => exposeWrap(key, sliderRow(label, tun[key] == null ? 0 : tun[key], min, max, 1, v => {
      const patch = {}; patch[key] = v;
      player.setTuning(patch); markDirty();
    }).root);
    const tFloatRow = (key, label, min, max, step, fallback) => exposeWrap(key, sliderRow(label, tun[key] == null ? fallback : tun[key], min, max, step, v => {
      const patch = {}; patch[key] = v;
      player.setTuning(patch); markDirty();
    }, v => (+v).toFixed(2)).root);
    sg.body.appendChild(tRow('torque', tr('Torque', 'Coppia'), 0, 10));
    sg.body.appendChild(exposeWrap('horsepower', sliderRow('Horsepower', tun.horsepower == null ? 450 : tun.horsepower, 15, 1500, 5, v => {
      player.setTuning({horsepower:v}); markDirty();
    }, v => Math.round(+v) + ' hp').root));
    sg.body.appendChild(tRow('maxSpeed', tr('Top speed', 'Vel. massima'), 0, 10));
    sg.body.appendChild(tRow('oversteer', tr('Oversteer', 'Sovrasterzo'), -10, 10));
    sg.body.appendChild(tRow('handbrake', tr('Handbrake', 'Freno a mano'), -10, 10));
    sg.body.appendChild(tRow('steer', tr('Steering', 'Sterzo'), -10, 10));
    sg.body.appendChild(tRow('brake', tr('Braking', 'Frenata'), -10, 10));
    sg.body.appendChild(tRow('grip', tr('Grip', 'Aderenza'), -10, 10));
    sg.body.appendChild(tRow('suspension', tr('Suspension stiffness', 'Sospensioni (rigidita)'), -10, 10));
    sg.body.appendChild(tRow('damping', tr('Suspension damping', 'Sospensioni (damping)'), -10, 10));
    sg.body.appendChild(tRow('travel', tr('Suspension travel', 'Escursione sospensioni'), -10, 10));
    sg.body.appendChild(tRow('ride', tr('Wheel stance', 'Assetto ruote'), -10, 10));
    sg.body.appendChild(tRow('roll', tr('Chassis roll', 'Rollio telaio'), -10, 10));
    sg.body.appendChild(tFloatRow('chassisLift', 'Chassis lift (m)', -0.35, 0.9, .01, 0));
    sg.body.appendChild(tFloatRow('reverseDelay', 'Ritardo retro (s)', 0, 2, .05, .5));
    box.appendChild(sg.root);
  }

  function buildModel(box, player){
    const sm = section(tr('3D MODEL', 'MODELLO 3D'), false);
    sm.body.appendChild(el('<div class="lk-hint">' + (player.getModel && player.getModel() ? tr('GLB model loaded', 'Modello GLB caricato') : tr('Procedural body (no GLB)', 'Corpo procedurale (nessun GLB)')) + '</div>'));
    const available = (player.modelAssets ? player.modelAssets() : modelAssets()).filter(asset => asset && asset.kind === 'glb');
    if(available.length){
      const select = document.createElement('select');
      select.appendChild(new Option(tr('Choose imported GLB...', 'Scegli GLB importato...'), ''));
      available.forEach(asset => select.appendChild(new Option(asset.name || asset.source || asset.key || 'GLB', asset.id || asset.key || asset.dbKey || asset.src || '')));
      select.addEventListener('change', () => {
        const asset = available.find(item => [item.id, item.key, item.dbKey, item.src].filter(Boolean).includes(select.value));
        if(asset) (player.replaceModelWithAsset || replaceModelWithAsset)(asset);
      });
      sm.body.appendChild(select);
    }
    sm.body.appendChild(btnRow([{label:'📦 Replace / import GLB...', action:player.openModelPicker || openPlayerModelPicker}]));
    if(player.setModelShading || player.getModelShading){
      const shading = player.getModelShading ? player.getModelShading() : (player.modelShading || 'original');
      sm.body.appendChild(selectRow(tr('Surface shading', 'Ombreggiatura superficie'), shading, [
        {value:'original', label:tr('Original normals', 'Normali originali')},
        {value:'smooth', label:'Smooth'},
        {value:'flat', label:'Flat'},
      ], value => {
        if(player.setModelShading) player.setModelShading(value);
        else player.modelShading = value;
        markDirty();
      }).root);
      sm.body.appendChild(el('<div class="lk-hint">' + tr(
        'Smooth averages vertex normals across matching polygon positions; Flat keeps every polygon face visible. Geometry and polygon count are unchanged.',
        'Smooth media le normali dei vertici sulle posizioni poligonali coincidenti; Flat mantiene visibile ogni faccia. Geometria e numero di poligoni non cambiano.'
      ) + '</div>'));
    }
    sm.body.appendChild(el('<div class="lk-hint">' + tr(
      'The model is rebuilt through the vehicle rig pipeline; wheel pivots, collision, cameras, lights and attachment anchors remain part of the Pawn.',
      'Il modello viene ricostruito tramite la pipeline rig del veicolo; pivot ruote, collisione, camere, luci e anchor degli attachment restano nel Pawn.'
    ) + '</div>'));
    box.appendChild(sm.root);
  }

  function buildEngineSound(box, player){
    const snd = section('ENGINE SOUND', false);
    const SS = STORE.soundSets;
    if(!SS){
      snd.body.appendChild(el('<div class="lk-empty">' + tr('Sound sets unavailable.', 'Sound sets non disponibili.') + '</div>'));
    } else {
      const assigned = player.engineAudio && player.engineAudio.setId;
      const sets = SS.list();
      const sel = document.createElement('select');
      sel.className = 'lk-soundset-select';
      sel.appendChild(new Option(tr('— procedural synth (no set) —', '— synth procedurale (nessun set) —'), ''));
      for(const s of sets) sel.appendChild(new Option(s.name, s.id, false, s.id === assigned));
      sel.value = assigned || '';
      sel.addEventListener('change', () => {
        player.setEngineSound(sel.value || null);
        markDirty();
        status(sel.value ? tr('Sound set "', 'Sound set "') + sel.options[sel.selectedIndex].text + tr('" assigned to vehicle', '" assegnato al veicolo') : tr('Engine using synthetic fallback', 'Motore in fallback sintetico'));
        buildInspector();
      });
      snd.body.appendChild(sel);
      const eaStatus = GAME.systems.engineAudio ? GAME.systems.engineAudio.slotStatus() : null;
      if(assigned && eaStatus){
        const bad = [];
        const scan = (obj, prefix) => { for(const k in obj){ if(obj[k].status === 'error') bad.push(prefix + k); } };
        scan(eaStatus.layers || {}, 'layer ');
        scan(eaStatus.events || {}, tr('event ', 'evento '));
        for(const b of ['on', 'off']) (eaStatus.banks[b] || []).forEach((s, i) => { if(s.status === 'error') bad.push('loop ' + b.toUpperCase() + ' #' + (i + 1)); });
        snd.body.appendChild(el('<div class="lk-hint">' + (bad.length
          ? tr('⚠ ', '⚠ ') + bad.length + tr(' samples not loaded (', ' sample non caricati (') + bad.slice(0, 3).join(', ') + (bad.length > 3 ? '…' : '') + tr(') → synthetic fallback', ') → fallback sintetico')
          : (eaStatus.engineReady ? tr('● Set active, samples loaded', '● Set attivo, sample caricati') : tr('… loading samples', '… caricamento sample in corso'))) + '</div>'));
      } else {
        snd.body.appendChild(el('<div class="lk-hint">' + tr('No set assigned: the engine uses the procedural synth.', 'Nessun set assegnato: il motore usa il synth procedurale.') + '</div>'));
      }
      snd.body.appendChild(btnRow([
        {label:'🎛 Sound Designer', action:() => openSoundDesigner(assigned || null)},
        {label:tr('＋ New set', '＋ Nuovo set'), action:async () => {
          const name = await promptEditorAction({title:tr('New engine sound set', 'Nuovo sound set motore'), message:tr('Name of the new sound set:', 'Nome del nuovo sound set:'), value:'New Engine Sound', okText:tr('Create', 'Crea')});
          if(!name || !name.trim()) return;
          const id = SS.create(name.trim());
          if(!id){ status(tr('⚠ Set creation failed', '⚠ Creazione set fallita')); return; }
          player.setEngineSound(id);
          markDirty();
          buildInspector();
          openSoundDesigner(id);
        }},
      ]));
      snd.body.appendChild(el('<div class="lk-hint">' + tr('Sets are project assets: you can also find them in the Assets tab and reuse them on multiple vehicles/levels.', 'I set sono asset del progetto: li trovi anche nel tab Assets e li puoi riusare su piu veicoli/livelli.') + '</div>'));
    }
    box.appendChild(snd.root);
  }

  function build(box, targetPlayer){
    const player = targetPlayer || deps.player || GAME.player;
    buildPawnInput(box, player);
    buildModel(box, player);
    buildDrivingTuning(box, player);
    buildEngineSound(box, player);
    box.appendChild(btnRow([{label:'🔍 Focus', action: focusSelected}]));
  }

  return Object.freeze({build});
}

window.LK_EDITOR_PLAYER_SETUP_INSPECTOR = Object.freeze({create});
})();
