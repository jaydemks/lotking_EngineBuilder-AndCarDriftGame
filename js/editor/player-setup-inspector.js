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
    input.body.appendChild(checkRow(tr('Native Player Car active', 'Player Car nativa attiva'), player.enabled !== false && player.hidden !== true, value => {
      if(player.setEnabled) player.setEnabled(value); else { player.enabled = value; player.hidden = !value; if(player.car) player.car.visible = value; }
      markDirty();
    }).root);
    input.body.appendChild(el('<div class="lk-hint">' + tr(
      'Inactive removes the native compatibility car from rendering, physics, input, camera, audio and effects. The Scene sidebar eye uses the same activation state.',
      'Disattivata rimuove l’auto nativa di compatibilità da rendering, fisica, input, camera, audio ed effetti. L’occhio nella sidebar Scene usa lo stesso stato.'
    ) + '</div>'));
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
    sg.body.appendChild(exposeWrap('frontDriveBias', sliderRow(
      tr('Front drive share (0 = RWD)', 'Quota trazione anteriore (0 = RWD)'),
      tun.frontDriveBias == null ? 0 : tun.frontDriveBias, 0, 1, .05,
      v => { player.setTuning({frontDriveBias:v}); markDirty(); },
      v => Math.round(Number(v) * 100) + '%'
    ).root));
    sg.body.appendChild(exposeWrap('turboStrength', sliderRow(
      tr('Progressive turbo contribution', 'Contributo turbo progressivo'),
      tun.turboStrength == null ? .28 : tun.turboStrength, 0, 1, .01,
      v => { player.setTuning({turboStrength:v}); markDirty(); },
      v => Math.round(Number(v) * 100) + '%'
    ).root));
    sg.body.appendChild(exposeWrap('turboThreshold', sliderRow(
      tr('Turbo spool start', 'Inizio spool turbo'),
      tun.turboThreshold == null ? 2400 : tun.turboThreshold, 1200, 5000, 100,
      v => { player.setTuning({turboThreshold:v}); markDirty(); },
      v => Math.round(Number(v)) + ' rpm'
    ).root));
    sg.body.appendChild(tFloatRow('turboSpool', tr('Turbo response time', 'Tempo risposta turbo'), .1, 2.5, .05, .8));
    sg.body.appendChild(tRow('suspension', tr('Suspension stiffness', 'Sospensioni (rigidita)'), -10, 10));
    sg.body.appendChild(tRow('frontSuspension', tr('Front suspension offset', 'Sospensioni anteriori'), -10, 10));
    sg.body.appendChild(tRow('rearSuspension', tr('Rear suspension offset', 'Sospensioni posteriori'), -10, 10));
    sg.body.appendChild(tRow('damping', tr('Suspension damping', 'Sospensioni (damping)'), -10, 10));
    sg.body.appendChild(tRow('frontDamping', tr('Front damping offset', 'Damping anteriore'), -10, 10));
    sg.body.appendChild(tRow('rearDamping', tr('Rear damping offset', 'Damping posteriore'), -10, 10));
    sg.body.appendChild(tRow('travel', tr('Suspension travel', 'Escursione sospensioni'), -10, 10));
    sg.body.appendChild(tRow('ride', tr('Wheel stance', 'Assetto ruote'), -10, 10));
    sg.body.appendChild(tRow('roll', tr('Chassis roll', 'Rollio telaio'), -10, 10));
    sg.body.appendChild(tFloatRow('chassisLift', 'Chassis lift (m)', -0.35, 0.9, .01, 0));
    // Steering pivot. An imported wheel almost never has its origin on the
    // kingpin axis, so the wheel swings through an arc when it should turn in
    // place. These nudge the rotation centre only; the wheel does not move.
    // Stored as tuning so they persist with the blueprint like Chassis lift.
    sg.body.appendChild(tFloatRow('steerPivotX', tr('Steer pivot X (lateral)', 'Pivot sterzo X (laterale)'), -.6, .6, .005, 0));
    sg.body.appendChild(tFloatRow('steerPivotY', tr('Steer pivot Y (height)', 'Pivot sterzo Y (altezza)'), -.6, .6, .005, 0));
    sg.body.appendChild(tFloatRow('steerPivotZ', tr('Steer pivot Z (fore/aft)', 'Pivot sterzo Z (avanti/dietro)'), -.6, .6, .005, 0));

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
      available.forEach(asset => {
        const classification=asset.vehicleRigged?tr('Vehicle rig','Rig veicolo'):asset.skeletonRigged?'Skeleton':asset.rigged?'Rigged':tr('Static','Statico');
        select.appendChild(new Option((asset.name || asset.source || asset.key || 'GLB')+' · '+classification, asset.id || asset.key || asset.dbKey || asset.src || ''));
      });
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
    if(player.setSteeringWheelConfig || player.getSteeringWheelConfig){
      const api = window.LK_RUNTIME_MODEL_ASSETS;
      const defaults = api && api.steeringWheelDefaults ? api.steeringWheelDefaults() : {};
      const cfg = api && api.normalizeSteeringWheelConfig
        ? api.normalizeSteeringWheelConfig(player.getSteeringWheelConfig ? player.getSteeringWheelConfig() : player.steeringWheel)
        : Object.assign({}, defaults, player.steeringWheel || {});
      const saveSteering = patch => {
        if(player.setSteeringWheelConfig) player.setSteeringWheelConfig(patch);
        else Object.assign(player.steeringWheel || (player.steeringWheel = {}), patch);
        markDirty();
      };
      const textSetting = (label, key, value) => {
        const row = el('<div class="lk-row"><label>' + label + '</label><input type="text"></div>');
        const input = row.querySelector('input');
        input.value = value;
        input.spellcheck = false;
        input.addEventListener('change', () => saveSteering({[key]:input.value.trim()}));
        return row;
      };
      sm.body.appendChild(el('<div class="lk-subtitle">' + tr('COCKPIT STEERING WHEEL', 'VOLANTE ABITACOLO') + '</div>'));
      sm.body.appendChild(checkRow(tr('Animate interior steering wheel', 'Anima volante interno'), cfg.enabled !== false, value => saveSteering({enabled:value})).root);
      sm.body.appendChild(textSetting(tr('Pivot node', 'Nodo pivot'), 'pivotName', cfg.pivotName || 'steering_wheel_pivot'));
      sm.body.appendChild(textSetting(tr('Mesh node', 'Nodo mesh'), 'meshName', cfg.meshName || 'steering_wheel_mesh'));
      sm.body.appendChild(selectRow(tr('Driver side', 'Lato guida'), cfg.driverSide || 'auto', [
        {value:'auto', label:tr('Auto / GLB metadata', 'Auto / metadati GLB')},
        {value:'left', label:tr('Left-hand drive', 'Guida a sinistra')},
        {value:'right', label:tr('Right-hand drive', 'Guida a destra')},
      ], value => saveSteering({driverSide:value})).root);
      sm.body.appendChild(selectRow(tr('Local rotation axis', 'Asse rotazione locale'), cfg.axis || 'auto', [
        {value:'auto', label:tr('Auto (GLB metadata)', 'Auto (metadati GLB)')},
        {value:'x', label:'Local X'}, {value:'y', label:'Local Y'}, {value:'z', label:'Local Z'},
      ], value => saveSteering({axis:value})).root);
      sm.body.appendChild(selectRow(tr('Left/right direction', 'Direzione sinistra/destra'), String(cfg.direction || 0), [
        {value:'0', label:tr('Auto / GLB metadata', 'Auto / metadati GLB')},
        {value:'-1', label:tr('Common (inverted local axis)', 'Comune (asse locale invertito)')},
        {value:'1', label:tr('Normal local axis', 'Asse locale normale')},
      ], value => saveSteering({direction:Number(value)})).root);
      sm.body.appendChild(sliderRow(tr('Controller lock-to-lock', 'Corsa controller'), cfg.inputLockDegrees || 900, 180, 2160, 10, value => saveSteering({inputLockDegrees:value}), value => Math.round(value) + '°').root);
      sm.body.appendChild(sliderRow(tr('Visible lock-to-lock', 'Corsa visibile'), cfg.visualLockDegrees || 540, 90, 2160, 10, value => saveSteering({visualLockDegrees:value}), value => Math.round(value) + '°').root);
      sm.body.appendChild(sliderRow(tr('Animation response', 'Risposta animazione'), cfg.response == null ? 12 : cfg.response, .1, 40, .1, value => saveSteering({response:value}), value => Number(value).toFixed(1)).root);
      const rigStatus = player.getSteeringWheelRigStatus ? player.getSteeringWheelRigStatus() : null;
      sm.body.appendChild(el('<div class="lk-hint">' + (rigStatus && rigStatus.ready
        ? tr('Rig detected: ', 'Rig rilevato: ') + (rigStatus.pivot || 'steering_wheel_pivot') + ' · ' + (rigStatus.visualLockDegrees || cfg.visualLockDegrees || 540) + '°'
        : tr('Waiting for steering_wheel_pivot. The Blender 0.2.2 add-on creates it and exports axis, direction and lock metadata.', 'In attesa di steering_wheel_pivot. L’add-on Blender 0.2.2 lo crea ed esporta asse, direzione e corsa.')) + '</div>'));
      sm.body.appendChild(el('<div class="lk-hint">' + tr(
        'Keyboard and gamepad use the common normalized steering mapping. High-rotation wheels remain compatible up to 2160°, while Visible lock can stay shorter to avoid exaggerated cockpit animation.',
        'Tastiera e gamepad usano il mapping sterzo normalizzato comune. I volanti ad alta rotazione restano compatibili fino a 2160°, mentre la corsa visibile può restare più corta per evitare animazioni esagerate.'
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

  function buildVehicleDamage(box, player, options){
    if(!player || (!player.damage && !player.setDamageConfig)) return;
    const api=window.LK_RUNTIME_VEHICLE_DAMAGE,opts=options||{},type=opts.type||player.pawnType||player.kind||'car';
    const cfg=api&&api.normalizeConfig?api.normalizeConfig(player.damage||{},type):player.damage;
    player.damage=cfg;
    const damage=section(tr('VEHICLE ENERGY / DAMAGE','ENERGIA / DANNI VEICOLO'),false);
    const commit=()=>{
      const normalized=api&&api.normalizeConfig?api.normalizeConfig(cfg,type):cfg;
      Object.keys(cfg).forEach(key=>delete cfg[key]);Object.assign(cfg,normalized);
      if(player.setDamageConfig)player.damage=player.setDamageConfig(cfg)||cfg;
      if(opts.onChange)opts.onChange(player.damage||cfg);
      markDirty();
    };
    const number=(label,target,key,min,max,step)=>sliderRow(label,Number(target[key]),min,max,step,value=>{target[key]=Number(value);commit();},value=>step<1?Number(value).toFixed(step<=.01?2:1):Math.round(Number(value))).root;
    const vector=(label,target)=>{
      const row=el('<div class="lk-vec"></div>'),caption=document.createElement('label'),values=Array.isArray(target.position)?target.position.slice():[0,0,0];caption.textContent=label;row.appendChild(caption);
      ['X','Y','Z'].forEach((axis,index)=>{const input=el('<input type="number" step=".05">');input.title=axis;input.value=Number(values[index]||0);input.addEventListener('change',()=>{const value=Number(input.value);if(Number.isFinite(value))values[index]=value;target.position=values.slice();commit();});row.appendChild(input);});return row;
    };
    damage.body.appendChild(el('<div class="lk-hint">'+tr('The fallback dummies are vehicle-local and remain editable. GLB nodes named fuel_tank/serbatoio, engine_smoke/motore and exhaust/marmitta take precedence automatically.','I dummy fallback sono locali al veicolo e restano modificabili. I nodi GLB fuel_tank/serbatoio, engine_smoke/motore ed exhaust/marmitta hanno automaticamente la precedenza.')+'</div>'));
    damage.body.appendChild(checkRow(tr('Damage enabled','Danni abilitati'),cfg.enabled!==false,value=>{cfg.enabled=value;commit();}).root);
    damage.body.appendChild(number(tr('Maximum energy','Energia massima'),cfg,'maxEnergy',1,100000,10));
    damage.body.appendChild(vector(tr('Fuel Tank dummy','Dummy serbatoio'),cfg.fuelTank));
    damage.body.appendChild(number(tr('Fuel Tank radius','Raggio serbatoio'),cfg.fuelTank,'radius',.08,5,.01));
    damage.body.appendChild(number(tr('Fuel Tank damage multiplier','Moltiplicatore danno serbatoio'),cfg.fuelTank,'damageMultiplier',1,20,.1));
    damage.body.appendChild(checkRow(tr('Show Fuel Tank dummy','Mostra dummy serbatoio'),cfg.fuelTank.dummyVisible!==false,value=>{cfg.fuelTank.dummyVisible=value;commit();}).root);
    damage.body.appendChild(vector(tr('Engine smoke dummy','Dummy fumo motore'),cfg.engineSmoke));
    damage.body.appendChild(vector(tr('Exhaust / muffler dummy','Dummy scarico / marmitta'),cfg.exhaust));
    damage.body.appendChild(number(tr('Smoke energy threshold','Soglia energia fumo'),cfg,'smokeThreshold',0,1,.01));
    damage.body.appendChild(number(tr('Fire energy threshold','Soglia energia fuoco'),cfg,'fireThreshold',0,1,.01));
    damage.body.appendChild(number(tr('Explosion delay (s)','Ritardo esplosione (s)'),cfg.explosion,'delay',0,10,.05));
    damage.body.appendChild(number(tr('Explosion radius','Raggio esplosione'),cfg.explosion,'radius',.5,40,.1));
    damage.body.appendChild(number(tr('Explosion force','Forza esplosione'),cfg.explosion,'force',0,2000,5));
    damage.body.appendChild(checkRow(tr('Detach wheels','Stacca ruote'),cfg.explosion.detachWheels!==false,value=>{cfg.explosion.detachWheels=value;commit();}).root);
    damage.body.appendChild(checkRow(tr('Blacken destroyed body','Annerisci carrozzeria distrutta'),cfg.explosion.blacken!==false,value=>{cfg.explosion.blacken=value;commit();}).root);
    const runtime=player.damageRuntime&&player.damageRuntime.snapshot?player.damageRuntime.snapshot():null;
    if(runtime)damage.body.appendChild(el('<div class="lk-hint">'+tr('Runtime energy: ','Energia runtime: ')+Math.ceil(runtime.energy)+' / '+Math.ceil(runtime.maxEnergy)+(runtime.destroyed?' · '+tr('DESTROYED','DISTRUTTO'):'')+'</div>'));
    box.appendChild(damage.root);
  }

  function build(box, targetPlayer){
    const player = targetPlayer || deps.player || GAME.player;
    buildPawnInput(box, player);
    buildModel(box, player);
    buildDrivingTuning(box, player);
    buildVehicleDamage(box, player);
    buildEngineSound(box, player);
    box.appendChild(btnRow([{label:'🔍 Focus', action: focusSelected}]));
  }

  return Object.freeze({build,buildEngineSound,buildVehicleDamage});
}

window.LK_EDITOR_PLAYER_SETUP_INSPECTOR = Object.freeze({create});
})();
