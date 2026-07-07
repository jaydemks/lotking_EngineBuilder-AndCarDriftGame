/* =========================================================
   LOT KING - drive tuning UI and value application
   Owns setup panel bindings and applies tuning values to drive config.
   ========================================================= */
(function(){
'use strict';

const PRESETS = Object.freeze({
  race: Object.freeze({
    torque:1, horsepower:420, maxSpeed:2, oversteer:-1, handbrake:0, steer:4, brake:0, grip:1,
    reverseDelay:.5, suspension:0, damping:0, travel:0, ride:0, roll:0, chassisLift:0,
  }),
  drift: Object.freeze({
    torque:10, horsepower:700, maxSpeed:2, oversteer:-8, handbrake:2, steer:0, brake:-3, grip:-10,
    reverseDelay:.45, suspension:-1, damping:0, travel:3, ride:-1, roll:-3, chassisLift:0,
  }),
});

function create(options){
  const opts = options || {};
  const clamp = opts.clamp;
  const cfg = opts.config;
  const baseCfg = opts.baseConfig;
  const drive = opts.drive;
  const baseDrive = opts.baseDrive;
  const values = Object.assign({...PRESETS.drift}, opts.values || {});
  const susp = opts.suspension || null;
  const baseSusp = susp ? Object.freeze({...susp}) : null;
  const collision = opts.collision || null;
  const baseCollision = opts.baseCollision || null;
  let lastCollisionLift = null;
  let setOpen = () => {};
  let toggle = () => {};
  let activePreset = 'drift';

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

  function apply(nextValues){
    if(nextValues) Object.assign(values, nextValues);
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

    cfg.accel = baseCfg.accel * (1 + torque * .95) * hpAccel;
    cfg.revAccel = baseCfg.revAccel * (1 + torque * .55) * clamp(Math.pow(hpScale, .72), .20, 2.55);
    cfg.maxSpeed = baseCfg.maxSpeed * (1 + maxSpeed * .45);
    cfg.brake = baseCfg.brake * clamp(1 + brake * .28, 0.5, 1.15);
    drive.brakeBias = clamp(baseDrive.brakeBias + brake * .035, 0.48, 0.62);
    drive.brakeDriveLock = clamp((baseDrive.brakeDriveLock == null ? 1 : baseDrive.brakeDriveLock) * (1 + brake * .22), 0.45, 1.15);
    drive.brakeWheelScale = clamp((baseDrive.brakeWheelScale == null ? .14 : baseDrive.brakeWheelScale) * (1 + brake * .18), .07, .22);
    drive.wheelspin = clamp(baseDrive.wheelspin * (1 + torque * .55 + over * .10) * hpWheelspin, 1.0, 5.4);
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
  }

  function applyPreset(name){
    const preset = PRESETS[name];
    if(!preset) return false;
    activePreset = name;
    syncInputs({...preset});
    return true;
  }

  function bind(){
    const dock = document.getElementById('tuneDock');
    const btn = document.getElementById('tuneBtn');
    const panel = document.getElementById('tunePanel');
    if(!dock || !btn || !panel) return;
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
      const format = () => input.dataset.tune === 'horsepower' ? Math.round(Number(input.value)) + ' hp' : input.value;
      const update = () => {
        values[input.dataset.tune] = Number(input.value);
        if(out) out.value = format();
        apply();
      };
      input.addEventListener('input', update);
      const value = values[input.dataset.tune];
      if(value != null) input.value = value;
      if(out) out.value = format();
    });
    panel.querySelectorAll('[data-tune-preset]').forEach(button => {
      button.addEventListener('click', () => applyPreset(button.dataset.tunePreset));
    });
    apply();
  }

  function syncInputs(nextValues){
    if(nextValues) Object.assign(values, nextValues);
    apply();
    document.querySelectorAll('#tunePanel input[type="range"]').forEach(input => {
      const value = values[input.dataset.tune];
      if(value == null) return;
      input.value = value;
      const out = document.querySelector('#tunePanel output[for="' + input.id + '"]');
      if(out) out.value = input.dataset.tune === 'horsepower' ? Math.round(Number(value)) + ' hp' : String(value);
    });
    updatePresetButtons();
  }

  bind();

  return {
    values,
    presets: PRESETS,
    getMode: () => detectPreset(),
    apply,
    applyPreset,
    setOpen: open => setOpen(open),
    toggle: () => toggle(),
    syncInputs,
  };
}

window.LK_RUNTIME_DRIVE_TUNING = Object.freeze({create, PRESETS});
})();
