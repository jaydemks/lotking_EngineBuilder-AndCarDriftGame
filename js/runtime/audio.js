/* =========================================================
   LOT KING — procedural runtime audio
   Engine, tire screech, ambient hum, crash and thud SFX.
   ========================================================= */
(function(){
'use strict';

function createSfx(deps){
  const getVolumes = deps.getVolumes;
  let ctx = null, muted = false;
  let masterGain, carGain, sfxGain;
  let engineOsc, engineOsc2, engineGain, engineFilter;
  let screechSrc, screechGain, screechFilter;
  let ambGain;

  function noiseBuffer(seconds){
    const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = b.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function init(){
    if(ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    carGain = ctx.createGain();
    carGain.connect(masterGain);
    sfxGain = ctx.createGain();
    sfxGain.connect(masterGain);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'square';
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 500;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = .35;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(g2);
    g2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(carGain);
    engineOsc.start();
    engineOsc2.start();

    screechSrc = ctx.createBufferSource();
    screechSrc.buffer = noiseBuffer(2);
    screechSrc.loop = true;
    screechFilter = ctx.createBiquadFilter();
    screechFilter.type = 'bandpass';
    screechFilter.frequency.value = 950;
    screechFilter.Q.value = 4;
    screechGain = ctx.createGain();
    screechGain.gain.value = 0;
    screechSrc.connect(screechFilter);
    screechFilter.connect(screechGain);
    screechGain.connect(carGain);
    screechSrc.start();

    const amb = ctx.createBufferSource();
    amb.buffer = noiseBuffer(3);
    amb.loop = true;
    const ambF = ctx.createBiquadFilter();
    ambF.type = 'lowpass';
    ambF.frequency.value = 220;
    ambGain = ctx.createGain();
    ambGain.gain.value = .045;
    amb.connect(ambF);
    ambF.connect(ambGain);
    ambGain.connect(sfxGain);
    amb.start();
    setVolumes(getVolumes());
  }

  function setVolumes(v){
    if(!ctx || !masterGain || !v) return;
    masterGain.gain.value = muted ? 0 : .8 * v.master;
    if(carGain) carGain.gain.value = v.car;
    if(sfxGain) sfxGain.gain.value = v.sfx;
  }

  // il motore sintetico e' il fallback: viene muto quando l'engine audio
  // a campioni (engine-audio.js) e' attivo e caricato
  let engineSynthEnabled = true;
  function setEngineSynthEnabled(v){ engineSynthEnabled = !!v; }
  function stopEngineSynth(){
    if(!ctx || !engineGain) return;
    engineGain.gain.cancelScheduledValues(ctx.currentTime);
    engineGain.gain.setTargetAtTime(0, ctx.currentTime, .025);
  }

  function update(rpm01, throttle, screech01){
    if(!ctx || muted) return;
    const t = ctx.currentTime;
    const over = Math.max(0, rpm01 - .92);
    const f = 58 + rpm01 * 330 + over * 90;
    engineOsc.frequency.setTargetAtTime(f, t, .045);
    engineOsc2.frequency.setTargetAtTime(f * 1.36 + 8 + over * 55, t, .045);
    engineFilter.frequency.setTargetAtTime(320 + rpm01 * 2100 + throttle * 520, t, .07);
    const engineLevel = engineSynthEnabled ? (.045 + throttle * .14 + rpm01 * .06 + over * .06) : 0;
    engineGain.gain.setTargetAtTime(engineLevel, t, .06);
    screechGain.gain.setTargetAtTime(screech01 * .22, t, .05);
    screechFilter.frequency.setTargetAtTime(750 + screech01 * 600 + Math.random() * 120, t, .05);
  }

  function crash(v){
    if(!ctx || muted) return;
    const s = ctx.createBufferSource();
    s.buffer = noiseBuffer(.35);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 350;
    const g = ctx.createGain();
    g.gain.value = .5 * v;
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .32);
    s.connect(f);
    f.connect(g);
    g.connect(sfxGain || masterGain);
    s.start();
  }

  function thud(v){
    if(!ctx || muted) return;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 140;
    o.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + .15);
    const g = ctx.createGain();
    g.gain.value = v;
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18);
    o.connect(g);
    g.connect(sfxGain || masterGain);
    o.start();
    o.stop(ctx.currentTime + .2);
  }

  function toggleMute(){
    muted = !muted;
    setVolumes(getVolumes());
    return muted;
  }

  function resume(){
    if(ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{});
  }

  return {init, update, crash, thud, toggleMute, setVolumes, resume,
    stopEngineSynth,
    setEngineSynthEnabled,
    getContext: () => ctx,
    getCarGain: () => carGain,
    getSfxGain: () => sfxGain};
}

window.LK_RUNTIME_AUDIO = Object.freeze({createSfx});
})();
