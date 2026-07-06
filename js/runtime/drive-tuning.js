/* =========================================================
   LOT KING - drive tuning UI and value application
   Owns setup panel bindings and applies tuning values to drive config.
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts = options || {};
  const clamp = opts.clamp;
  const cfg = opts.config;
  const baseCfg = opts.baseConfig;
  const drive = opts.drive;
  const baseDrive = opts.baseDrive;
  const values = Object.assign({torque:0, maxSpeed:0, oversteer:0, handbrake:0, steer:0, brake:0, grip:0, reverseDelay:.5}, opts.values || {});
  let setOpen = () => {};
  let toggle = () => {};

  function apply(nextValues){
    if(nextValues) Object.assign(values, nextValues);
    const torque = values.torque / 10;
    const maxSpeed = values.maxSpeed / 10;
    const over = values.oversteer / 10;
    const hand = values.handbrake / 10;
    const steer = values.steer / 10;
    const brake = values.brake / 10;
    const grip = values.grip / 10;
    drive.reverseDelay = clamp(values.reverseDelay == null ? .5 : Number(values.reverseDelay), 0, 2);

    cfg.accel = baseCfg.accel * (1 + torque * .75);
    cfg.revAccel = baseCfg.revAccel * (1 + torque * .45);
    cfg.maxSpeed = baseCfg.maxSpeed * (1 + maxSpeed * .45);
    cfg.brake = baseCfg.brake * clamp(1 + brake * .55, 0.55, 1.65);
    drive.brakeBias = clamp(baseDrive.brakeBias + brake * .06, 0.5, 0.72);
    drive.brakeDriveLock = clamp((baseDrive.brakeDriveLock == null ? 1 : baseDrive.brakeDriveLock) * (1 + brake * .38), 0.55, 1.65);
    drive.wheelspin = clamp(baseDrive.wheelspin * (1 + torque * .32), 1.2, 2.8);

    cfg.steerMax = baseCfg.steerMax * clamp(1 + steer * .35, 0.65, 1.45);
    cfg.steerHiSpeed = clamp(baseCfg.steerHiSpeed * (1 + steer * .30), 0.22, 0.55);
    drive.steerResponse = clamp(baseDrive.steerResponse * (1 + steer * .45), 2.8, 10);

    const gScale = clamp(1 + grip * .32, 0.55, 1.5);
    cfg.muF = baseCfg.muF * gScale * clamp(1 + over * .08, 0.8, 1.2);
    cfg.muR = baseCfg.muR * gScale * clamp(1 - over * .16, 0.6, 1.3);
    cfg.stiffF = baseCfg.stiffF * clamp(1 + grip * .18, 0.7, 1.35);
    cfg.stiffR = baseCfg.stiffR * clamp(1 + grip * .18 - over * .10, 0.65, 1.4);
    cfg.rearFalloff = clamp(baseCfg.rearFalloff * (1 + over * .8), 0.06, 0.55);
    cfg.powerOver = clamp(baseCfg.powerOver * (1 + over * .55 + torque * .15), 0.35, 1.6);
    cfg.hbMuR = clamp(baseCfg.hbMuR * (1 - hand * .45), 0.12, 0.6);
    cfg.driftAssist = clamp(baseCfg.driftAssist * (1 + over * .35 + steer * .2), 0.5, 1.9);
    cfg.driftGasPush = clamp(baseCfg.driftGasPush * (1 + over * .45 + torque * .14), 0.8, 5.0);
    cfg.driftThrottlePull = clamp(baseCfg.driftThrottlePull * (1 - over * .25 + torque * .08 + grip * .08), 0.35, 2.4);
    cfg.yawDamp = clamp(baseCfg.yawDamp * (1 - over * .35), 0.25, 1.2);
    cfg.driftEnterSlip = clamp(baseCfg.driftEnterSlip * (1 - over * .25 - Math.max(0, hand) * .15), 0.2, 0.5);
    cfg.driftEnterVy = clamp(baseCfg.driftEnterVy * (1 - over * .25), 1.8, 4.6);
  }

  function bind(){
    const dock = document.getElementById('tuneDock');
    const btn = document.getElementById('tuneBtn');
    const panel = document.getElementById('tunePanel');
    if(!dock || !btn || !panel) return;
    setOpen = open => {
      dock.classList.toggle('open', open);
      btn.textContent = open ? '×' : '🔧';
      btn.title = open ? 'Chiudi setup guida' : 'Setup guida';
    };
    toggle = () => setOpen(!dock.classList.contains('open'));
    btn.addEventListener('click', toggle);
    panel.querySelectorAll('input[type="range"]').forEach(input => {
      const out = panel.querySelector('output[for="' + input.id + '"]');
      const update = () => {
        values[input.dataset.tune] = Number(input.value);
        if(out) out.value = input.value;
        apply();
      };
      input.addEventListener('input', update);
      update();
    });
  }

  function syncInputs(nextValues){
    if(nextValues) Object.assign(values, nextValues);
    apply();
    document.querySelectorAll('#tunePanel input[type="range"]').forEach(input => {
      const value = values[input.dataset.tune];
      if(value == null) return;
      input.value = value;
      const out = document.querySelector('#tunePanel output[for="' + input.id + '"]');
      if(out) out.value = String(value);
    });
  }

  bind();

  return {
    values,
    apply,
    setOpen: open => setOpen(open),
    toggle: () => toggle(),
    syncInputs,
  };
}

window.LK_RUNTIME_DRIVE_TUNING = Object.freeze({create});
})();
