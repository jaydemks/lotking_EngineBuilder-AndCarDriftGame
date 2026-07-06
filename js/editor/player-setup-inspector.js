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
  const focusSelected = deps.focusSelected;
  const section = deps.section;
  const sliderRow = deps.sliderRow;
  const btnRow = deps.btnRow;
  const el = deps.el;

  function buildDrivingTuning(box){
    const sg = section('GUIDA (SETUP)', false);
    const tun = GAME.player.tuning.values;
    const tRow = (key, label, min, max) => sliderRow(label, tun[key], min, max, 1, v => {
      const patch = {}; patch[key] = v;
      GAME.player.setTuning(patch); markDirty();
    }).root;
    const tFloatRow = (key, label, min, max, step, fallback) => sliderRow(label, tun[key] == null ? fallback : tun[key], min, max, step, v => {
      const patch = {}; patch[key] = v;
      GAME.player.setTuning(patch); markDirty();
    }, v => (+v).toFixed(2)).root;
    sg.body.appendChild(tRow('torque', 'Coppia', 0, 10));
    sg.body.appendChild(tRow('maxSpeed', 'Vel. massima', 0, 10));
    sg.body.appendChild(tRow('oversteer', 'Sovrasterzo', -10, 10));
    sg.body.appendChild(tRow('handbrake', 'Freno a mano', -10, 10));
    sg.body.appendChild(tRow('steer', 'Sterzo', -10, 10));
    sg.body.appendChild(tRow('brake', 'Frenata', -10, 10));
    sg.body.appendChild(tRow('grip', 'Aderenza', -10, 10));
    sg.body.appendChild(tFloatRow('reverseDelay', 'Ritardo retro (s)', 0, 2, .05, .5));
    box.appendChild(sg.root);
  }

  function buildModel(box){
    const sm = section('MODELLO 3D', false);
    sm.body.appendChild(el('<div class="lk-hint">' + (GAME.player.getModel() ? 'Modello GLB caricato' : 'Corpo procedurale (nessun GLB)') + '</div>'));
    sm.body.appendChild(btnRow([{label:'📦 Replace GLB model...', action:openPlayerModelPicker}]));
    box.appendChild(sm.root);
  }

  function buildEngineSound(box){
    const snd = section('ENGINE SOUND', false);
    const SS = STORE.soundSets;
    if(!SS){
      snd.body.appendChild(el('<div class="lk-empty">Sound sets non disponibili.</div>'));
    } else {
      const assigned = GAME.player.engineAudio && GAME.player.engineAudio.setId;
      const sets = SS.list();
      const sel = document.createElement('select');
      sel.className = 'lk-soundset-select';
      sel.appendChild(new Option('— synth procedurale (nessun set) —', ''));
      for(const s of sets) sel.appendChild(new Option(s.name, s.id, false, s.id === assigned));
      sel.value = assigned || '';
      sel.addEventListener('change', () => {
        GAME.player.setEngineSound(sel.value || null);
        markDirty();
        status(sel.value ? 'Sound set "' + sel.options[sel.selectedIndex].text + '" assegnato al veicolo' : 'Motore in fallback sintetico');
        buildInspector();
      });
      snd.body.appendChild(sel);
      const eaStatus = GAME.systems.engineAudio ? GAME.systems.engineAudio.slotStatus() : null;
      if(assigned && eaStatus){
        const bad = [];
        const scan = (obj, prefix) => { for(const k in obj){ if(obj[k].status === 'error') bad.push(prefix + k); } };
        scan(eaStatus.layers || {}, 'layer ');
        scan(eaStatus.events || {}, 'evento ');
        for(const b of ['on', 'off']) (eaStatus.banks[b] || []).forEach((s, i) => { if(s.status === 'error') bad.push('loop ' + b.toUpperCase() + ' #' + (i + 1)); });
        snd.body.appendChild(el('<div class="lk-hint">' + (bad.length
          ? '⚠ ' + bad.length + ' sample non caricati (' + bad.slice(0, 3).join(', ') + (bad.length > 3 ? '…' : '') + ') → fallback sintetico'
          : (eaStatus.engineReady ? '● Set attivo, sample caricati' : '… caricamento sample in corso')) + '</div>'));
      } else {
        snd.body.appendChild(el('<div class="lk-hint">Nessun set assegnato: il motore usa il synth procedurale.</div>'));
      }
      snd.body.appendChild(btnRow([
        {label:'🎛 Sound Designer', action:() => openSoundDesigner(assigned || null)},
        {label:'＋ Nuovo set', action:async () => {
          const name = await promptEditorAction({title:'New engine sound set', message:'Nome del nuovo sound set:', value:'New Engine Sound', okText:'Create'});
          if(!name || !name.trim()) return;
          const id = SS.create(name.trim());
          if(!id){ status('⚠ Creazione set fallita'); return; }
          GAME.player.setEngineSound(id);
          markDirty();
          buildInspector();
          openSoundDesigner(id);
        }},
      ]));
      snd.body.appendChild(el('<div class="lk-hint">I set sono asset del progetto: li trovi anche nel tab Assets e li puoi riusare su piu veicoli/livelli.</div>'));
    }
    box.appendChild(snd.root);
  }

  function build(box){
    buildDrivingTuning(box);
    buildModel(box);
    buildEngineSound(box);
    box.appendChild(btnRow([{label:'🔍 Focus', action: focusSelected}]));
  }

  return Object.freeze({build});
}

window.LK_EDITOR_PLAYER_SETUP_INSPECTOR = Object.freeze({create});
})();
