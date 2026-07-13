/* =========================================================
   LOT KING - drive tuning UI and value application
   Owns setup panel bindings and applies tuning values to drive config.
   ========================================================= */
(function(){
'use strict';

const PRESETS = Object.freeze({
  default: Object.freeze({
    torque:3, horsepower:360, maxSpeed:4, oversteer:1, handbrake:2, steer:2, brake:0, grip:1,
    reverseDelay:.5, suspension:2, damping:4, travel:0, ride:0, roll:-4, chassisLift:0,
  }),
  race: Object.freeze({
    torque:3, horsepower:430, maxSpeed:6, oversteer:-2, handbrake:0, steer:4, brake:1, grip:4,
    reverseDelay:.5, suspension:5, damping:6, travel:-2, ride:-1, roll:-6, chassisLift:0,
  }),
  drift: Object.freeze({
    torque:5, horsepower:400, maxSpeed:4, oversteer:7, handbrake:7, steer:5, brake:0, grip:-5,
    reverseDelay:.45, suspension:2, damping:4, travel:1, ride:-1, roll:-5, chassisLift:0,
  }),
});
const TUNE_PARAMS = Object.freeze([
  {key:'torque', label:'Vehicle torque', it:'Coppia veicolo', min:0, max:10, step:1, fallback:0},
  {key:'horsepower', label:'Horsepower', it:'Cavalli', min:15, max:1500, step:5, fallback:450, format:v => Math.round(Number(v)) + ' hp'},
  {key:'maxSpeed', label:'Top speed', it:'Vel. massima', min:0, max:10, step:1, fallback:0},
  {key:'oversteer', label:'Oversteer', it:'Sovrasterzo', min:-10, max:10, step:1, fallback:0},
  {key:'handbrake', label:'Handbrake', it:'Freno a mano', min:-10, max:10, step:1, fallback:0},
  {key:'steer', label:'Steering', it:'Sterzo', min:-10, max:10, step:1, fallback:0},
  {key:'brake', label:'Braking', it:'Frenata', min:-10, max:10, step:1, fallback:0},
  {key:'grip', label:'Tire grip', it:'Aderenza gomme', min:-10, max:10, step:1, fallback:0},
  {key:'suspension', label:'Suspension stiffness', it:'Rigidita sospensioni', min:-10, max:10, step:1, fallback:0},
  {key:'damping', label:'Suspension damping', it:'Damping sospensioni', min:-10, max:10, step:1, fallback:0},
  {key:'travel', label:'Suspension travel', it:'Escursione sospensioni', min:-10, max:10, step:1, fallback:0},
  {key:'ride', label:'Wheel stance', it:'Assetto ruote', min:-10, max:10, step:1, fallback:0},
  {key:'roll', label:'Chassis roll', it:'Rollio telaio', min:-10, max:10, step:1, fallback:0},
  {key:'chassisLift', label:'Chassis lift', it:'Altezza telaio', min:-.35, max:.9, step:.01, fallback:0, format:v => (+v).toFixed(2) + ' m'},
  {key:'reverseDelay', label:'Reverse delay', it:'Ritardo retro', min:0, max:2, step:.05, fallback:.5, format:v => (+v).toFixed(2) + ' s'},
]);
const DEFAULT_EXPOSED = Object.freeze({
  torque:true, horsepower:true, maxSpeed:true, oversteer:true, handbrake:true, steer:true, brake:true, grip:true,
  exportTuning:false,
});
const CURVE_DEFS = Object.freeze({
  torque: {label:'Engine torque', it:'Coppia motore', desc:'Power multiplier across RPM.', low:.72, mid:1.08, high:.90},
  driftTorque: {label:'Drift torque hold', it:'Tenuta coppia drift', desc:'Extra torque support while sliding.', low:.86, mid:1.08, high:1.02},
  gearPull: {label:'Gear pull', it:'Tiro marce', desc:'How strongly high RPM keeps pulling before shift.', low:.92, mid:1, high:.96},
  wheelspin: {label:'Wheelspin window', it:'Finestra wheelspin', desc:'Rear tire power allowance across RPM.', low:.82, mid:1, high:1.18},
});

function create(options){
  const opts = options || {};
  const clamp = opts.clamp;
  const cfg = opts.config;
  const baseCfg = opts.baseConfig;
  const drive = opts.drive;
  const baseDrive = opts.baseDrive;
  const values = Object.assign({...PRESETS.default}, opts.values || {});
  values.curves = normalizeCurves(values.curves);
  values.exposed = normalizeExposed(values.exposed);
  const susp = opts.suspension || null;
  const baseSusp = susp ? Object.freeze({...susp}) : null;
  const collision = opts.collision || null;
  const baseCollision = opts.baseCollision || null;
  let lastCollisionLift = null;
  let setOpen = () => {};
  let toggle = () => {};
  let activePreset = 'default';
  let curveOverlay = null;
  let curveSelect = null;
  let curveCanvas = null;
  let curveCtx = null;
  let activeCurve = 'torque';

  function notifyChange(reason){
    if(typeof opts.onChange === 'function') opts.onChange(reason || 'tuning');
  }
  function normalizeCurves(raw){
    const out = {};
    Object.keys(CURVE_DEFS).forEach(key => {
      const def = CURVE_DEFS[key];
      const v = raw && raw[key] || {};
      out[key] = {
        low: clamp(Number(v.low == null ? def.low : v.low), .2, 1.8),
        mid: clamp(Number(v.mid == null ? def.mid : v.mid), .2, 1.8),
        high: clamp(Number(v.high == null ? def.high : v.high), .2, 1.8),
      };
    });
    return out;
  }
  function normalizeExposed(raw){
    const out = {};
    TUNE_PARAMS.forEach(p => { out[p.key] = raw && raw[p.key] != null ? raw[p.key] !== false : !!DEFAULT_EXPOSED[p.key]; });
    out.exportTuning = raw && raw.exportTuning != null ? raw.exportTuning !== false : !!DEFAULT_EXPOSED.exportTuning;
    return out;
  }
  function curveValue(curve, rpm01){
    const x = clamp(rpm01, 0, 1);
    if(x < .5) return curve.low + (curve.mid - curve.low) * (x / .5);
    return curve.mid + (curve.high - curve.mid) * ((x - .5) / .5);
  }
  function setCurvePoint(curveKey, point, value){
    values.curves = normalizeCurves(values.curves);
    if(values.curves[curveKey] && Object.prototype.hasOwnProperty.call(values.curves[curveKey], point)){
      values.curves[curveKey][point] = clamp(Number(value), .2, 1.8);
      apply();
      drawCurve();
      notifyChange('curves');
    }
  }
  function setExposed(key, exposed){
    values.exposed = normalizeExposed(values.exposed);
    if(Object.prototype.hasOwnProperty.call(values.exposed, key)){
      values.exposed[key] = exposed !== false;
      refreshExposure();
      notifyChange('exposed');
    }
  }
  function tuningSnapshot(){
    values.curves = normalizeCurves(values.curves);
    values.exposed = normalizeExposed(values.exposed);
    const tuning = {};
    TUNE_PARAMS.forEach(p => { tuning[p.key] = values[p.key] == null ? p.fallback : values[p.key]; });
    tuning.curves = JSON.parse(JSON.stringify(values.curves));
    tuning.exposed = Object.assign({}, values.exposed);
    return {
      kind: 'lotking.vehicleTuning',
      version: 1,
      mode: detectPreset(),
      exportedAt: new Date().toISOString(),
      tuning,
    };
  }
  function exportTuning(){
    const snapshot = tuningSnapshot();
    const text = JSON.stringify(snapshot, null, 2);
    const stamp = snapshot.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
    const filename = 'lotking-vehicle-tuning-' + stamp + '.json';
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).catch(() => {});
    }
    if(typeof Blob !== 'undefined' && window.URL && URL.createObjectURL){
      const url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 500);
    }
    if(typeof opts.onExport === 'function') opts.onExport(snapshot, text);
    return snapshot;
  }

  function detectPreset(){
    for(const name of Object.keys(PRESETS)){
      const preset = PRESETS[name];
      const same = Object.keys(preset).every(key => Number(values[key] || 0) === Number(preset[key] || 0));
      if(same) return name;
    }
    return 'custom';
  }

  function updatePresetButtons(){
    activePreset = detectPreset();
    document.querySelectorAll('[data-tune-preset]').forEach(button => {
      button.classList.toggle('active', button.dataset.tunePreset === activePreset);
    });
  }

  function tuneParam(key){
    return TUNE_PARAMS.find(p => p.key === key) || null;
  }
  function tuneFormat(key, value){
    const p = tuneParam(key);
    if(p && p.format) return p.format(value);
    return String(value);
  }
  function tuneId(key){
    return 'tune' + key.charAt(0).toUpperCase() + key.slice(1);
  }
  function ensureTuneRows(panel){
    const it = window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it';
    TUNE_PARAMS.forEach(p => {
      if(panel.querySelector('[data-tune="' + p.key + '"]')) return;
      const id = tuneId(p.key);
      const row = document.createElement('div');
      row.className = 'tuneRow';
      row.innerHTML =
        '<div class="tuneMeta">' +
          '<div class="tuneName">' + (it ? p.it : p.label) + '</div><output class="tuneVal" for="' + id + '">' + tuneFormat(p.key, p.fallback) + '</output>' +
          '<div class="tuneDesc">' + (it ? 'Parametro avanzato esposto dall editor.' : 'Advanced parameter exposed by the editor.') + '</div>' +
        '</div>' +
        '<div class="tuneControl"><span class="tuneMin">' + p.min + '</span><input id="' + id + '" data-tune="' + p.key + '" type="range" min="' + p.min + '" max="' + p.max + '" step="' + p.step + '" value="' + p.fallback + '"><span class="tuneMax">' + p.max + '</span></div>';
      panel.appendChild(row);
    });
  }

  function apply(nextValues){
    if(nextValues) Object.assign(values, nextValues);
    const externalTarget = typeof opts.resolveTarget === 'function' ? opts.resolveTarget() : null;
    if(externalTarget && typeof opts.applyTarget === 'function'){
      values.horsepower = clamp(values.horsepower == null ? 450 : Number(values.horsepower), 15, 1500);
      values.curves = normalizeCurves(values.curves);
      values.exposed = normalizeExposed(values.exposed);
      opts.applyTarget(externalTarget, JSON.parse(JSON.stringify(values)));
      updatePresetButtons();
      drawCurve();
      return;
    }
    const torque = values.torque / 10;
    const maxSpeed = values.maxSpeed / 10;
    const over = values.oversteer / 10;
    const hand = values.handbrake / 10;
    const steer = values.steer / 10;
    const brake = values.brake / 10;
    const grip = values.grip / 10;
    const horsepower = clamp(values.horsepower == null ? 450 : Number(values.horsepower), 15, 1500);
    const hpScale = horsepower / 450;
    const hpAccel = clamp(Math.pow(hpScale, .86), .16, 3.05);
    const hpWheelspin = clamp(Math.pow(hpScale, .56), .28, 1.95);
    const chassisLift = clamp(values.chassisLift == null ? 0 : Number(values.chassisLift), -0.35, 0.9);
    drive.reverseDelay = clamp(values.reverseDelay == null ? .5 : Number(values.reverseDelay), 0, 2);
    values.horsepower = horsepower;
    drive.horsepower = horsepower;
    drive.powerScale = hpScale;
    values.curves = normalizeCurves(values.curves);
    values.exposed = normalizeExposed(values.exposed);
    drive.curves = {
      torque: Object.assign({}, values.curves.torque),
      driftTorque: Object.assign({}, values.curves.driftTorque),
      gearPull: Object.assign({}, values.curves.gearPull),
      wheelspin: Object.assign({}, values.curves.wheelspin),
      sample: curveValue,
    };

    cfg.accel = baseCfg.accel * (1 + torque * .95) * hpAccel;
    cfg.revAccel = baseCfg.revAccel * (1 + torque * .55) * clamp(Math.pow(hpScale, .72), .20, 2.55);
    cfg.maxSpeed = baseCfg.maxSpeed * (1 + maxSpeed * .45);
    cfg.brake = baseCfg.brake * clamp(1 + brake * .28, 0.5, 1.15);
    drive.brakeBias = clamp(baseDrive.brakeBias + brake * .035, 0.48, 0.62);
    drive.brakeDriveLock = clamp((baseDrive.brakeDriveLock == null ? 1 : baseDrive.brakeDriveLock) * (1 + brake * .22), 0.45, 1.15);
    drive.brakeWheelScale = clamp((baseDrive.brakeWheelScale == null ? .14 : baseDrive.brakeWheelScale) * (1 + brake * .18), .07, .22);
    const wheelspinCurveAvg = (values.curves.wheelspin.low + values.curves.wheelspin.mid + values.curves.wheelspin.high) / 3;
    drive.wheelspin = clamp(baseDrive.wheelspin * (1 + torque * .55 + over * .10) * hpWheelspin * clamp(wheelspinCurveAvg, .55, 1.45), 1.0, 5.8);
    drive.driftDrive = clamp((baseDrive.driftDrive == null ? .5 : baseDrive.driftDrive) * (1 + torque * 1.05 + over * .48 + (hpScale - 1) * .18), .28, 2.25);
    drive.shiftOverrun = clamp((Math.max(0, over) * .22) + (Math.max(0, torque) * .16), 0, .42);

    cfg.steerMax = baseCfg.steerMax * clamp(1 + steer * .38, 0.65, 1.5);
    cfg.steerHiSpeed = clamp(baseCfg.steerHiSpeed * (1 + steer * .55), 0.24, 0.68);
    drive.steerResponse = clamp(baseDrive.steerResponse * (1 + steer * .45), 2.8, 10);

    const gScale = clamp(1 + grip * .32, 0.55, 1.5);
    cfg.muF = baseCfg.muF * gScale * clamp(1 + over * .08, 0.8, 1.2);
    cfg.muR = baseCfg.muR * gScale * clamp(1 - over * .16, 0.6, 1.3);
    cfg.stiffF = baseCfg.stiffF * clamp(1 + grip * .18, 0.7, 1.35);
    cfg.stiffR = baseCfg.stiffR * clamp(1 + grip * .18 - over * .10, 0.65, 1.4);
    cfg.rearFalloff = clamp(baseCfg.rearFalloff * (1 + over * .8), 0.06, 0.55);
    cfg.powerOver = clamp(baseCfg.powerOver * (1 + over * .58 + torque * .18), 0.35, 2.0);
    cfg.hbMuR = clamp(baseCfg.hbMuR * (1 - hand * .30), 0.24, 0.72);
    drive.handbrakeWheelScale = clamp((baseDrive.handbrakeWheelScale == null ? .18 : baseDrive.handbrakeWheelScale) * (1 + hand * .35), .08, .26);
    cfg.driftAssist = clamp(baseCfg.driftAssist * (1 + over * .42 + steer * .24), 0.5, 2.35);
    cfg.driftGasPush = clamp(baseCfg.driftGasPush * (1 + over * .58 + torque * .18), 0.8, 6.2);
    cfg.driftThrottlePull = clamp(baseCfg.driftThrottlePull * (1 - over * .36 + torque * .03 + grip * .08), 0.22, 2.4);
    cfg.yawDamp = clamp(baseCfg.yawDamp * (1 - over * .35), 0.25, 1.2);
    cfg.driftEnterSlip = clamp(baseCfg.driftEnterSlip * (1 - over * .42 - torque * .10 - Math.max(0, hand) * .12), 0.12, 0.5);
    cfg.driftEnterVy = clamp(baseCfg.driftEnterVy * (1 - over * .42 - torque * .08), 0.85, 4.6);
    cfg.driftMinSpeed = clamp(baseCfg.driftMinSpeed * (1 - over * .45 - torque * .18), 2.2, 10);

    // raycast suspension: stiffness/damping and ride height + travel
    if(susp){
      const s = (values.suspension || 0) / 10;
      const d = (values.damping || 0) / 10;
      const t = (values.travel || 0) / 10;
      const h = (values.ride || 0) / 10;
      const r = (values.roll || 0) / 10;
      susp.stiffness = baseSusp.stiffness * clamp(1 + s * .6, .45, 1.8);
      susp.compression = baseSusp.compression * clamp(1 + d * .75, .35, 2.0);
      susp.relaxation = baseSusp.relaxation * clamp(1 + d * .75, .35, 2.0);
      susp.restLength = baseSusp.restLength * clamp(1 + h * .35, .6, 1.4);
      susp.travel = baseSusp.travel * clamp(1 + t * .75 + h * .25, .45, 1.9);
      susp.rollInfluence = clamp(baseSusp.rollInfluence * (1 + r * .8), .04, .42);
      if(opts.onSuspensionChange) opts.onSuspensionChange();
    }
    drive.chassisLift = chassisLift;
    if(collision && baseCollision && lastCollisionLift !== chassisLift){
      collision.offsetY = clamp((baseCollision.offsetY == null ? .45 : baseCollision.offsetY) + chassisLift, -2, 4);
      lastCollisionLift = chassisLift;
      if(opts.onCollisionChange) opts.onCollisionChange();
    }
    updatePresetButtons();
    drawCurve();
  }

  function applyPreset(name){
    const preset = PRESETS[name];
    if(!preset) return false;
    activePreset = name;
    syncInputs({...preset});
    notifyChange('preset');
    return true;
  }

  function bind(){
    const dock = document.getElementById('tuneDock');
    const btn = document.getElementById('tuneBtn');
    const panel = document.getElementById('tunePanel');
    if(!dock || !btn || !panel) return;
    ensureTuneRows(panel);
    setOpen = open => {
      dock.classList.toggle('open', open);
      btn.textContent = open ? '×' : '🔧';
      const it = window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it';
      btn.title = open ? (it ? 'Chiudi setup guida' : 'Close driving setup') : (it ? 'Setup guida' : 'Driving setup');
    };
    toggle = () => setOpen(!dock.classList.contains('open'));
    btn.addEventListener('click', toggle);
    panel.querySelectorAll('input[type="range"]').forEach(input => {
      const out = panel.querySelector('output[for="' + input.id + '"]');
      const format = () => tuneFormat(input.dataset.tune, input.value);
      const update = () => {
        values[input.dataset.tune] = Number(input.value);
        if(out) out.value = format();
        apply();
        notifyChange(input.dataset.tune);
      };
      input.addEventListener('input', update);
      const value = values[input.dataset.tune];
      if(value != null) input.value = value;
      if(out) out.value = format();
    });
    panel.querySelectorAll('[data-tune-preset]').forEach(button => {
      button.addEventListener('click', () => applyPreset(button.dataset.tunePreset));
    });
    const curveBtn = document.getElementById('tuneCurveBtn');
    if(curveBtn) curveBtn.addEventListener('click', () => setCurveOverlay(true));
    const exportBtn = document.getElementById('tuneExportBtn');
    if(exportBtn) exportBtn.addEventListener('click', exportTuning);
    buildCurveOverlay();
    apply();
    refreshExposure();
  }

  function syncInputs(nextValues){
    if(nextValues){
      Object.assign(values, nextValues);
      values.curves = normalizeCurves(nextValues.curves || values.curves);
      values.exposed = normalizeExposed(nextValues.exposed || values.exposed);
    }
    apply();
    document.querySelectorAll('#tunePanel input[type="range"]').forEach(input => {
      const value = values[input.dataset.tune];
      if(value == null) return;
      input.value = value;
      const out = document.querySelector('#tunePanel output[for="' + input.id + '"]');
      if(out) out.value = tuneFormat(input.dataset.tune, value);
    });
    updatePresetButtons();
    refreshExposure();
    drawCurve();
  }

  function refreshExposure(){
    values.exposed = normalizeExposed(values.exposed);
    document.querySelectorAll('#tunePanel [data-tune]').forEach(input => {
      const row = input.closest && input.closest('.tuneRow');
      if(row) row.hidden = values.exposed[input.dataset.tune] === false;
    });
    const exportBtn = document.getElementById('tuneExportBtn');
    if(exportBtn) exportBtn.hidden = values.exposed.exportTuning === false;
  }

  function curveLabel(key){
    const def = CURVE_DEFS[key] || CURVE_DEFS.torque;
    const it = window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it';
    return it ? def.it : def.label;
  }
  function buildCurveOverlay(){
    if(curveOverlay || !document.body) return;
    curveOverlay = document.createElement('div');
    curveOverlay.id = 'tuneCurveOverlay';
    curveOverlay.innerHTML =
      '<div class="tuneCurvePanel">' +
        '<div class="tuneCurveTop"><div><b>POWER CURVES</b><span>RPM / gear response</span></div><button type="button" data-curve-close>×</button></div>' +
        '<label class="tuneCurveSelect"><span>Curve</span><select data-curve-select></select></label>' +
        '<canvas width="640" height="260"></canvas>' +
        '<div class="tuneCurveSliders">' +
          ['low','mid','high'].map(p => '<label><span>' + p.toUpperCase() + '</span><input type="range" min="0.2" max="1.8" step="0.01" data-curve-point="' + p + '"><output></output></label>').join('') +
        '</div>' +
      '</div>';
    document.body.appendChild(curveOverlay);
    curveSelect = curveOverlay.querySelector('[data-curve-select]');
    curveCanvas = curveOverlay.querySelector('canvas');
    curveCtx = curveCanvas && curveCanvas.getContext('2d');
    Object.keys(CURVE_DEFS).forEach(key => curveSelect.appendChild(new Option(curveLabel(key), key)));
    curveSelect.addEventListener('change', () => { activeCurve = curveSelect.value; syncCurveInputs(); drawCurve(); });
    curveOverlay.querySelector('[data-curve-close]').addEventListener('click', () => setCurveOverlay(false));
    curveOverlay.addEventListener('click', e => { if(e.target === curveOverlay) setCurveOverlay(false); });
    curveOverlay.querySelectorAll('[data-curve-point]').forEach(input => {
      input.addEventListener('input', () => setCurvePoint(activeCurve, input.dataset.curvePoint, input.value));
    });
    syncCurveInputs();
  }
  function setCurveOverlay(open){
    buildCurveOverlay();
    if(curveOverlay) curveOverlay.classList.toggle('open', !!open);
    if(open){ syncCurveInputs(); drawCurve(); }
  }
  function syncCurveInputs(){
    if(!curveOverlay) return;
    values.curves = normalizeCurves(values.curves);
    if(curveSelect) curveSelect.value = activeCurve;
    const curve = values.curves[activeCurve] || values.curves.torque;
    curveOverlay.querySelectorAll('[data-curve-point]').forEach(input => {
      const v = curve[input.dataset.curvePoint];
      input.value = v;
      const out = input.parentNode && input.parentNode.querySelector('output');
      if(out) out.value = (+v).toFixed(2) + 'x';
    });
  }
  function drawCurve(){
    if(!curveCtx || !curveCanvas) return;
    syncCurveInputs();
    const ctx = curveCtx;
    const w = curveCanvas.width, h = curveCanvas.height;
    const pad = 32;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#091019'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
    for(let i=0;i<=4;i++){
      const y = pad + (h - pad*2) * i / 4;
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w-pad, y); ctx.stroke();
    }
    const tops = (opts.gearbox && opts.gearbox.tops) || [];
    ctx.fillStyle = 'rgba(255,209,102,.55)';
    tops.forEach((_, i) => {
      const x = pad + (w - pad*2) * (i + 1) / tops.length;
      ctx.fillRect(x, pad, 1, h - pad*2);
      ctx.fillText('G' + (i + 1), x + 4, h - 10);
    });
    const curve = values.curves && values.curves[activeCurve] || normalizeCurves()[activeCurve];
    ctx.strokeStyle = '#4be3a0'; ctx.lineWidth = 3; ctx.beginPath();
    for(let i=0;i<=80;i++){
      const t = i / 80;
      const v = curveValue(curve, t);
      const x = pad + (w - pad*2) * t;
      const y = h - pad - (h - pad*2) * clamp((v - .2) / 1.6, 0, 1);
      if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#dfe8ff';
    ctx.fillText('RPM', w - 58, h - 10);
    ctx.fillText('1.8x', 6, pad + 4);
    ctx.fillText('0.2x', 6, h - pad);
    ctx.fillStyle = '#ffd166';
    ctx.fillText(curveLabel(activeCurve), pad, 20);
  }

  bind();

  return {
    values,
    presets: PRESETS,
    getMode: () => detectPreset(),
    apply,
    applyPreset,
    setExposed,
    setCurvePoint,
    openCurves: () => setCurveOverlay(true),
    exportTuning,
    curveDefs: CURVE_DEFS,
    params: TUNE_PARAMS,
    setOpen: open => setOpen(open),
    toggle: () => toggle(),
    syncInputs,
  };
}

window.LK_RUNTIME_DRIVE_TUNING = Object.freeze({create, PRESETS, TUNE_PARAMS, CURVE_DEFS, DEFAULT_EXPOSED});
})();
