/* =========================================================
   LOT KING - sample-based engine audio ("engine sound sets")
   Banchi loop ON/OFF throttle incrociati su RPM + gas, layer
   continui (limiter, turbo, trasmissione), eventi one-shot
   (accensione, pop cambiata, blow-off, backfire, rev).
   Ogni slot vuoto o non caricabile va in fallback sintetico;
   lo stato per-slot e' esposto all'editor (Sound Designer).
   ========================================================= */
(function(){
'use strict';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const ENGINE_DIR = 'media/sfx/engine/';

// file conosciuti nella cartella progetto (per i dropdown dell'editor)
const KNOWN_FILES = [
  'BAC_Mono_onlow.wav', 'BAC_Mono_onmid.wav', 'BAC_Mono_onhigh.wav',
  'BAC_Mono_offlow.wav', 'BAC_Mono_offmid.wav', 'BAC_Mono_offhigh.wav', 'BAC_Mono_offveryhigh.wav',
  'procar/on_low.wav', 'procar/on_midhigh.wav', 'procar/on_high.wav',
  'procar/off_lower.wav', 'procar/off_midhigh.wav',
  'limiter.wav', 'REV.wav', 'trany_power_high.wav',
  'tw_offverylow_4.wav', 'tw_offlow_4.wav', 'tw_offlowmid_4.wav', 'tw_offhigh_4.wav',
].map(f => ENGINE_DIR + f);

function defaultSet(){
  return {
    id: 'bac-mono',
    name: 'BAC Mono',
    master: {volume: .9, pitchShift: 1, reverb: .12, reverbDecay: 1.4, toneLow: 0, toneHigh: 16000},
    bankParams: {fadeWidth: .55, throttleSmooth: 7, offVolume: 1, pitchClampLo: .45, pitchClampHi: 2.2, rpmSmooth: 16},
    banks: {
      on: [
        {src: ENGINE_DIR + 'BAC_Mono_onlow.wav',  rpm: 2000, volume: 1},
        {src: ENGINE_DIR + 'BAC_Mono_onmid.wav',  rpm: 4200, volume: 1},
        {src: ENGINE_DIR + 'BAC_Mono_onhigh.wav', rpm: 6800, volume: 1},
      ],
      off: [
        {src: ENGINE_DIR + 'BAC_Mono_offlow.wav',      rpm: 2000, volume: 1},
        {src: ENGINE_DIR + 'BAC_Mono_offmid.wav',      rpm: 4200, volume: 1},
        {src: ENGINE_DIR + 'BAC_Mono_offhigh.wav',     rpm: 6300, volume: 1},
        {src: ENGINE_DIR + 'BAC_Mono_offveryhigh.wav', rpm: 7600, volume: 1},
      ],
    },
    layers: {
      limiter:        {src: ENGINE_DIR + 'limiter.wav', mode: 'generated', volume: .75, rate: .8, stutterRate: 10, stutterDepth: .62, pitchBounce: .34, tonePulse: .28, tone: 16000, enabled: true},
      turbo:          {src: '', volume: .5, pitchMin: .55, pitchMax: 1.6, attack: .3, release: .5, tone: 16000, wobbleRate: 0, wobbleDepth: 0, enabled: false},
      gearWhinePower: {src: ENGINE_DIR + 'trany_power_high.wav', volume: .16, tone: 16000, wobbleRate: 0, wobbleDepth: 0, enabled: true},
      gearWhineOff:   {src: ENGINE_DIR + 'tw_offlowmid_4.wav',   volume: .13, tone: 16000, wobbleRate: 0, wobbleDepth: 0, enabled: true},
    },
    skids: {
      drift: {src: '', volume: .8,  pitch: 1, tone: 16000, attack: .08, release: .3,  enabled: true},
      brake: {src: '', volume: .7,  pitch: 1, tone: 16000, attack: .05, release: .2,  enabled: true},
      accel: {src: '', volume: .75, pitch: 1, tone: 16000, attack: .07, release: .35, enabled: true},
    },
    events: {
      ignition: {src: '', volume: 1,  pitch: 1, tone: 16000, enabled: true},
      shiftPop: {src: '', volume: .8, pitch: 1, pitchRandom: .15, probability: .7, cooldown: .45, tone: 16000, enabled: true},
      blowoff:  {src: '', volume: .7, pitch: 1, pitchRandom: .1,  minBoost: .45, tone: 16000, enabled: true},
      backfire: {src: '', volume: .85, pitch: 1, pitchRandom: .2, probability: .5, cooldown: .8, tone: 16000, enabled: true},
      rev:      {src: ENGINE_DIR + 'REV.wav', volume: .9, pitch: 1, tone: 16000, enabled: true},
    },
  };
}

function create(deps){
  const audio = deps.audio;                 // SFX: getContext, getCarGain, setEngineSynthEnabled
  const engine = deps.engine;               // ENGINE state (rpm, gear, shiftPulse, limiterTimer, throttle, ...)
  const gearbox = deps.gearbox || {idle: 950, redline: 6900, limiter: 7600};
  const getSpeed = deps.getSpeed || (() => 0);
  const getTimescale = deps.getTimescale || (() => 1);
  const resolveSrc = deps.resolveSrc || (src => Promise.resolve(src));   // 'blob:...' → object URL
  const manageFallbackSynth = deps.manageFallbackSynth !== false;

  let cfg = null;
  let ctx = null, bus = null, dryGain = null, wetGain = null, convolver = null;
  let toneHP = null, toneLP = null;
  let built = false, running = false;
  const buffers = new Map();                // src → {status:'loading'|'ok'|'error', buffer}
  const bankVoices = {on: [], off: []};     // {sample, gain, node}
  const layerVoices = {};                   // key → {gain, node, sample}
  const skidVoices = {};                    // drift/brake/accel → voce loop continua
  const skidTargets = {drift: 0, brake: 0, accel: 0};   // livelli slip dal gioco (0..1)
  const skidCur = {drift: 0, brake: 0, accel: 0};       // livelli smussati (attack/release)
  let skidTest = {key: null, t: 0};         // test dal designer
  let skidNoiseBuf = null;                  // loop di rumore per il fallback sintetico
  let manual = null;                        // {rpm, throttle, limiter} → test mode editor
  let thr = 0, boost = 0, prevBoost = 0, prevThrottle = 0;
  let smRpm = gearbox.idle;                 // rpm smussati: doma l'oscillazione veloce del limiter fisico
  let prevShiftPulse = 0, prevLimiterPulse = 0;
  let limiterTest = 0;
  const cooldowns = {};
  let onStatusChange = null;
  let masterMute = 1;

  // ------------------------------------------------ buffers
  function loadBuffer(src){
    if(!src || buffers.has(src)) return;
    buffers.set(src, {status: 'loading', buffer: null});
    notifyStatus();
    resolveSrc(src)
      .then(url => fetch(url))
      .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(ab => ctx.decodeAudioData(ab))
      .then(buf => {
        buffers.set(src, {status: 'ok', buffer: buf});
        if(built) attachPendingVoices();
        notifyStatus();
      })
      .catch(err => {
        console.warn('LotKing engine audio: sample non caricato "' + src + '"', err);
        buffers.set(src, {status: 'error', buffer: null});
        notifyStatus();
      });
  }
  function bufferOf(src){
    const b = src && buffers.get(src);
    return b && b.status === 'ok' ? b.buffer : null;
  }
  function statusOf(src){
    if(!src) return 'empty';
    const b = buffers.get(src);
    return b ? b.status : 'empty';
  }

  // ------------------------------------------------ graph
  function makeImpulse(decay){
    const len = Math.max(1, (ctx.sampleRate * clamp(decay || 1.4, .2, 5)) | 0);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for(let ch = 0; ch < 2; ch++){
      const d = buf.getChannelData(ch);
      for(let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    return buf;
  }
  function ensureGraph(){
    if(bus || !ctx) return;
    bus = ctx.createGain();
    toneHP = ctx.createBiquadFilter();
    toneHP.type = 'highpass';
    toneHP.frequency.value = 10;
    toneLP = ctx.createBiquadFilter();
    toneLP.type = 'lowpass';
    toneLP.frequency.value = 16000;
    dryGain = ctx.createGain();
    wetGain = ctx.createGain();
    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(cfg ? cfg.master.reverbDecay : 1.4);
    bus.connect(toneHP);
    toneHP.connect(toneLP);
    toneLP.connect(dryGain);
    toneLP.connect(convolver);
    convolver.connect(wetGain);
    const out = audio.getCarGain ? audio.getCarGain() : ctx.destination;
    dryGain.connect(out);
    wetGain.connect(out);
    applyMasterMix();
  }
  function applyMasterMix(){
    if(!bus || !cfg) return;
    const wet = clamp(cfg.master.reverb == null ? .12 : cfg.master.reverb, 0, 1);
    dryGain.gain.value = 1 - wet * .5;
    wetGain.gain.value = wet;
    toneHP.frequency.value = Math.max(10, cfg.master.toneLow || 0);
    toneLP.frequency.value = clamp(cfg.master.toneHigh == null ? 16000 : cfg.master.toneHigh, 300, 20000);
  }
  function makeLoopVoice(sample, withFilter){
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(bus);
    let filter = null;
    if(withFilter){
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 16000;
      filter.connect(gain);
    }
    return {sample, gain, filter, node: null};
  }
  function attachVoiceNode(voice){
    if(!running) return;
    const sampleBuf = bufferOf(voice.sample.src);
    const buf = sampleBuf || voice.fallback || null;
    if(!buf) return;
    if(voice.node){
      // gia' attiva: sostituisci solo se il fallback puo' salire a sample vero
      if(!voice.usingFallback || !sampleBuf) return;
      try { voice.node.stop(); } catch(err){}
      voice.node.disconnect();
      voice.node = null;
    }
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.loop = true;
    node.connect(voice.filter || voice.gain);
    node.start();
    voice.node = node;
    voice.usingFallback = !sampleBuf;
  }
  function attachPendingVoices(){
    for(const k of ['on', 'off']) for(const v of bankVoices[k]) attachVoiceNode(v);
    for(const key in layerVoices) attachVoiceNode(layerVoices[key]);
    for(const key in skidVoices) attachVoiceNode(skidVoices[key]);
  }
  function teardownVoices(){
    const kill = v => {
      if(v.node){ try { v.node.stop(); } catch(err){} v.node.disconnect(); }
      if(v.filter) v.filter.disconnect();
      v.gain.disconnect();
    };
    for(const k of ['on', 'off']){ bankVoices[k].forEach(kill); bankVoices[k].length = 0; }
    for(const key in layerVoices){ kill(layerVoices[key]); delete layerVoices[key]; }
    for(const key in skidVoices){ kill(skidVoices[key]); delete skidVoices[key]; }
    built = false;
  }
  function skidFallbackBuffer(){
    if(skidNoiseBuf) return skidNoiseBuf;
    const len = ctx.sampleRate * 1.5 | 0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    skidNoiseBuf = buf;
    return buf;
  }
  function build(){
    if(!ctx || !cfg) return;
    ensureGraph();
    teardownVoices();
    for(const k of ['on', 'off']){
      const list = (cfg.banks[k] || []).filter(s => s && s.src);
      list.sort((a, b) => a.rpm - b.rpm);
      for(const sample of list){
        loadBuffer(sample.src);
        bankVoices[k].push(makeLoopVoice(sample));
      }
    }
    for(const key of ['limiter', 'turbo', 'gearWhinePower', 'gearWhineOff']){
      const l = cfg.layers[key];
      if(!l || !l.src) continue;
      loadBuffer(l.src);
      layerVoices[key] = makeLoopVoice({src: l.src, rpm: 0, volume: 1}, true);
    }
    // sgommate: la voce esiste sempre (col fallback di rumore), il sample e' opzionale
    for(const key of ['drift', 'brake', 'accel']){
      const s = (cfg.skids || {})[key];
      if(!s) continue;
      if(s.src) loadBuffer(s.src);
      const v = makeLoopVoice({src: s.src || '', rpm: 0, volume: 1}, true);
      v.fallback = skidFallbackBuffer();
      skidVoices[key] = v;
    }
    for(const key in cfg.events){
      const e = cfg.events[key];
      if(e && e.src) loadBuffer(e.src);
    }
    convolver.buffer = makeImpulse(cfg.master.reverbDecay);
    applyMasterMix();
    built = true;
    if(running) attachPendingVoices();
    notifyStatus();
  }

  // ------------------------------------------------ one-shots (sample o fallback sintetico)
  function playBuffer(buf, volume, rate, tone){
    const node = ctx.createBufferSource();
    node.buffer = buf;
    node.playbackRate.value = rate || 1;
    const g = ctx.createGain();
    g.gain.value = volume == null ? 1 : volume;
    let head = g;
    if(tone != null && tone < 15500){
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = Math.max(200, tone);
      node.connect(f);
      f.connect(g);
      head = f;
    } else {
      node.connect(g);
    }
    g.connect(bus);
    node.start();
    node.onended = () => { node.disconnect(); if(head !== g) head.disconnect(); g.disconnect(); };
  }
  function noiseBurst(opts){
    const o = opts || {};
    const dur = o.dur || .25;
    const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur | 0), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, o.shape == null ? 1.6 : o.shape);
    const node = ctx.createBufferSource();
    node.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'lowpass';
    f.frequency.value = o.freq || 500;
    if(o.freqEnd != null) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.freqEnd), ctx.currentTime + dur);
    if(o.q != null) f.Q.value = o.q;
    const g = ctx.createGain();
    g.gain.value = o.volume == null ? .5 : o.volume;
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
    node.connect(f); f.connect(g); g.connect(bus);
    node.start();
    node.onended = () => { node.disconnect(); f.disconnect(); g.disconnect(); };
  }
  function thump(freqA, freqB, dur, volume){
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freqA;
    osc.frequency.exponentialRampToValueAtTime(freqB, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.value = volume;
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
    osc.connect(g); g.connect(bus);
    osc.start(); osc.stop(ctx.currentTime + dur + .02);
  }
  const FALLBACK_SHOTS = {
    ignition(vol){
      thump(90, 32, .5, .8 * vol);
      noiseBurst({dur: .8, freq: 900, freqEnd: 220, volume: .3 * vol, shape: 1});
    },
    shiftPop(vol){
      noiseBurst({dur: .1, freq: 420, volume: .55 * vol, shape: 2.2});
      thump(160, 70, .09, .4 * vol);
    },
    blowoff(vol){
      noiseBurst({dur: .45, type: 'bandpass', freq: 2600, freqEnd: 700, q: 1.4, volume: .5 * vol, shape: 1.2});
    },
    backfire(vol){
      noiseBurst({dur: .2, freq: 340, volume: .85 * vol, shape: 2});
      setTimeout(() => { if(ctx) noiseBurst({dur: .12, freq: 300, volume: .4 * vol, shape: 2.4}); }, 70);
      thump(120, 45, .16, .5 * vol);
    },
    rev(vol){
      noiseBurst({dur: .5, type: 'bandpass', freq: 300, freqEnd: 1200, q: 2, volume: .4 * vol, shape: .8});
    },
  };
  function fireEvent(key, opts){
    if(!ctx || !cfg) return false;
    const e = cfg.events[key];
    if(!e || !e.enabled) return false;
    const now = performance.now() / 1000;
    const cd = e.cooldown || 0;
    if(cd && cooldowns[key] && now - cooldowns[key] < cd) return false;
    if(!(opts && opts.force) && e.probability != null && Math.random() > e.probability) return false;
    cooldowns[key] = now;
    const vol = (e.volume == null ? 1 : e.volume) * cfg.master.volume * masterMute;
    const rate = (e.pitch || 1) * (1 + (e.pitchRandom || 0) * (Math.random() * 2 - 1));
    const buf = bufferOf(e.src);
    if(buf) playBuffer(buf, vol, rate, e.tone);
    else if(FALLBACK_SHOTS[key]) FALLBACK_SHOTS[key](vol);
    return true;
  }

  // ------------------------------------------------ crossfade banchi
  function bankWeights(samples, rpm, fadeWidth){
    const w = new Array(samples.length).fill(0);
    if(!samples.length) return w;
    if(samples.length === 1 || rpm <= samples[0].sample.rpm){ w[0] = 1; return w; }
    const last = samples.length - 1;
    if(rpm >= samples[last].sample.rpm){ w[last] = 1; return w; }
    for(let i = 0; i < last; i++){
      const a = samples[i].sample.rpm, b = samples[i + 1].sample.rpm;
      if(rpm >= a && rpm <= b){
        let x = (rpm - a) / Math.max(1, b - a);
        const fw = clamp(fadeWidth == null ? .55 : fadeWidth, .05, 1);
        x = clamp((x - .5) / fw + .5, 0, 1);
        w[i] = Math.cos(x * Math.PI / 2);      // constant-power
        w[i + 1] = Math.sin(x * Math.PI / 2);
        break;
      }
    }
    return w;
  }
  function sampleEngineReady(){
    return built && bankVoices.on.some(v => statusOf(v.sample.src) === 'ok');
  }

  // ------------------------------------------------ frame update
  function readState(){
    if(manual) return {
      rpm: manual.rpm,
      throttle: manual.throttle,
      limiter: !!manual.limiter || limiterTest > 0,
      speed01: clamp((manual.rpm - gearbox.idle) / (gearbox.redline - gearbox.idle), 0, 1),
      shiftPulse: 0, limiterPulse: 0,
    };
    return {
      rpm: engine.rpm || gearbox.idle,
      throttle: engine.reverseActive ? .35 : (engine.throttle || 0),
      limiter: engine.limiterTimer > 0 || limiterTest > 0,
      speed01: clamp(getSpeed() / 160, 0, 1),
      shiftPulse: engine.shiftPulse || 0,
      limiterPulse: engine.limiterPulse || 0,
    };
  }
  function update(dt){
    limiterTest = Math.max(0, limiterTest - dt);
    const ready = sampleEngineReady();
    if(manageFallbackSynth && audio.setEngineSynthEnabled) audio.setEngineSynthEnabled(!cfg || !ready || !running);
    if(!ctx || !cfg || !built || !running) return;
    const t = ctx.currentTime;
    const st = readState();
    const p = cfg.bankParams;

    thr += (clamp(st.throttle, 0, 1) - thr) * Math.min(1, dt * (p.throttleSmooth || 7));
    smRpm += (st.rpm - smRpm) * Math.min(1, dt * (p.rpmSmooth == null ? 16 : p.rpmSmooth));
    const rpm = smRpm;
    const onMix = Math.sin(clamp(thr, 0, 1) * Math.PI / 2);
    const offMix = Math.cos(clamp(thr, 0, 1) * Math.PI / 2) * (p.offVolume == null ? 1 : p.offVolume);
    const shiftDuck = engine.shiftTimer > 0 && !manual ? .45 : 1;
    const master = cfg.master.volume * masterMute * shiftDuck;
    const tsRate = manual ? 1 : .5 + .5 * clamp(getTimescale(), 0, 1);   // slow-mo → motore giu' di tono
    applyMasterMix();   // reverb regolabile live dal designer

    const lim = cfg.layers.limiter || {};
    const limOn = st.limiter && lim.enabled !== false;
    const limMode = lim.mode || (lim.src ? 'sample' : 'generated');
    const limRate = lim.stutterRate ? lim.stutterRate : 10;
    const limDepth = clamp(lim.stutterDepth == null ? (limMode === 'generated' ? .62 : 0) : lim.stutterDepth, 0, 1);
    const limVol = clamp(lim.volume == null ? 1 : lim.volume, 0, 1.5);
    const limWave = limOn ? (.5 + .5 * Math.sin(t * Math.PI * 2 * limRate)) : 1;
    const generatedLimiter = limOn && limMode === 'generated';
    const limiterPitch = generatedLimiter ? 1 - limVol * limDepth * (lim.pitchBounce == null ? .34 : lim.pitchBounce) * (1 - limWave) * .16 : 1;

    for(const k of ['on', 'off']){
      const voices = bankVoices[k];
      const mix = k === 'on' ? onMix : offMix;
      const weights = bankWeights(voices, rpm, p.fadeWidth);
      for(let i = 0; i < voices.length; i++){
        const v = voices[i];
        if(!v.node){ attachVoiceNode(v); if(!v.node) continue; }
        const ratio = rpm / Math.max(200, v.sample.rpm);
        const track = v.sample.pitchTrack == null ? 1 : v.sample.pitchTrack;   // 0 = pitch fisso, 1 = segue gli RPM
        const rate = clamp(1 + (ratio - 1) * track, p.pitchClampLo || .45, p.pitchClampHi || 2.2) * (cfg.master.pitchShift || 1) * tsRate * limiterPitch;
        v.node.playbackRate.setTargetAtTime(rate, t, .03);
        v.gain.gain.setTargetAtTime(weights[i] * (v.sample.volume == null ? 1 : v.sample.volume) * mix * master, t, .04);
      }
    }

    // modulazione sinusoidale opzionale per i layer ("sin mod")
    const wobble = l => {
      if(!l || !l.wobbleDepth || !l.wobbleRate) return 1;
      return 1 - clamp(l.wobbleDepth, 0, 1) * .5 * (1 + Math.sin(t * Math.PI * 2 * l.wobbleRate));
    };
    const layerTone = (v, l) => {
      if(v.filter) v.filter.frequency.setTargetAtTime(clamp(l.tone == null ? 16000 : l.tone, 200, 20000), t, .05);
    };

    // limiter layer: sample con rate/stutter regolabili, o "stutter" del bus come fallback
    const limGate = depth => (Math.sin(t * Math.PI * 2 * limRate) > -.15) ? 1 : 1 - clamp(depth, 0, 1);
    if(layerVoices.limiter){
      const v = layerVoices.limiter;
      if(!v.node) attachVoiceNode(v);
      if(v.node){
        v.node.playbackRate.setTargetAtTime(lim.rate == null ? 1 : lim.rate, t, .03);
        layerTone(v, lim);
        v.gain.gain.setTargetAtTime(limOn && limMode === 'sample' ? lim.volume * master * limGate(lim.stutterDepth || 0) : 0, t, .015);
      }
    }
    let stutter = 1;
    if(generatedLimiter){
      stutter = 1 - limVol * limDepth * (.22 + .58 * (1 - limWave));
      const pulse = clamp(lim.tonePulse == null ? .28 : lim.tonePulse, 0, 1);
      const baseTone = clamp(lim.tone == null ? 16000 : lim.tone, 500, 20000);
      if(toneLP) toneLP.frequency.setTargetAtTime(baseTone * (1 - pulse * (1 - limWave) * .55), t, .018);
    } else if(limOn && !bufferOf(lim.src)){
      stutter = limGate(lim.stutterDepth == null ? .75 : Math.max(.4, lim.stutterDepth));
    }
    bus.gain.setTargetAtTime(stutter, t, generatedLimiter ? .018 : .01);

    // turbo: boost simulato + whine + blow-off al rilascio
    const turbo = cfg.layers.turbo;
    prevBoost = boost;
    if(turbo && turbo.enabled){
      const target = thr * clamp(st.rpm / gearbox.redline, 0, 1.1);
      const k = target > boost ? (1 / Math.max(.02, turbo.attack || .3)) : (1 / Math.max(.02, turbo.release || .5));
      boost += (target - boost) * Math.min(1, dt * k);
      const v = layerVoices.turbo;
      if(v){
        if(!v.node) attachVoiceNode(v);
        if(v.node){
          v.node.playbackRate.setTargetAtTime((turbo.pitchMin || .55) + ((turbo.pitchMax || 1.6) - (turbo.pitchMin || .55)) * boost, t, .05);
          layerTone(v, turbo);
          v.gain.gain.setTargetAtTime(boost * turbo.volume * master * wobble(turbo), t, .05);
        }
      }
      if(prevThrottle > .5 && st.throttle < .15 && boost > (cfg.events.blowoff.minBoost == null ? .45 : cfg.events.blowoff.minBoost)){
        fireEvent('blowoff', {force: true});
        boost *= .3;
      }
    } else boost = 0;

    // trasmissione
    const gwp = cfg.layers.gearWhinePower, gwo = cfg.layers.gearWhineOff;
    if(layerVoices.gearWhinePower && gwp){
      const v = layerVoices.gearWhinePower;
      if(!v.node) attachVoiceNode(v);
      if(v.node){
        v.node.playbackRate.setTargetAtTime(.6 + st.speed01 * .9, t, .06);
        layerTone(v, gwp);
        v.gain.gain.setTargetAtTime(gwp.enabled ? thr * st.speed01 * gwp.volume * master * wobble(gwp) : 0, t, .06);
      }
    }
    if(layerVoices.gearWhineOff && gwo){
      const v = layerVoices.gearWhineOff;
      if(!v.node) attachVoiceNode(v);
      if(v.node){
        v.node.playbackRate.setTargetAtTime(.6 + st.speed01 * .9, t, .06);
        layerTone(v, gwo);
        v.gain.gain.setTargetAtTime(gwo.enabled ? (1 - thr) * st.speed01 * gwo.volume * master * wobble(gwo) : 0, t, .06);
      }
    }

    // sgommate: tre canali continui che seguono la durata reale dello slittamento.
    // Il gioco spinge i livelli con setSkids(); attack/release danno l'inviluppo.
    skidTest.t = Math.max(0, skidTest.t - dt);
    const SKID_CHAR = {drift: {freq: 880, q: 5}, brake: {freq: 620, q: 4}, accel: {freq: 1050, q: 4.5}};
    for(const key of ['drift', 'brake', 'accel']){
      const s = (cfg.skids || {})[key];
      const v = skidVoices[key];
      if(!s || !v) continue;
      let target = clamp(skidTargets[key] || 0, 0, 1);
      if(skidTest.key === key && skidTest.t > 0) target = Math.max(target, .9);
      if(s.enabled === false) target = 0;
      const rate = target > skidCur[key]
        ? 1 / Math.max(.02, s.attack == null ? .06 : s.attack)
        : 1 / Math.max(.02, s.release == null ? .25 : s.release);
      skidCur[key] += (target - skidCur[key]) * Math.min(1, dt * rate);
      const lv = skidCur[key];
      if(!v.node && lv > .01) attachVoiceNode(v);
      if(!v.node) continue;
      if(v.filter){
        if(v.usingFallback){
          // fallback: bandpass col carattere del tipo di sgommata
          v.filter.type = 'bandpass';
          v.filter.Q.value = SKID_CHAR[key].q;
          v.filter.frequency.setTargetAtTime(SKID_CHAR[key].freq * (.9 + .25 * lv), t, .04);
        } else {
          v.filter.type = 'lowpass';
          v.filter.Q.value = .8;
          v.filter.frequency.setTargetAtTime(clamp(s.tone == null ? 16000 : s.tone, 200, 20000), t, .05);
        }
      }
      let g = lv * (s.volume == null ? 1 : s.volume) * master;
      if(key === 'brake') g *= 1 - .35 * lv * (.5 + .5 * Math.sin(t * Math.PI * 2 * 24));   // "judder" da frenata
      const pmul = key === 'accel' ? (.8 + .45 * lv) : key === 'drift' ? (.95 + .18 * lv) : 1;
      v.node.playbackRate.setTargetAtTime((s.pitch == null ? 1 : s.pitch) * pmul * tsRate, t, .05);
      v.gain.gain.setTargetAtTime(lv > .01 ? g : 0, t, .03);
    }

    // eventi guidati dal gioco (non in modalita' manuale)
    if(!manual){
      if(st.shiftPulse > 0 && prevShiftPulse <= 0){
        fireEvent('shiftPop');
        if(Math.random() < .5) fireEvent('backfire');
      }
      if(st.limiterPulse > 0 && prevLimiterPulse <= 0) fireEvent('backfire');
      prevShiftPulse = st.shiftPulse;
      prevLimiterPulse = st.limiterPulse;
    }
    prevThrottle = st.throttle;
  }

  // ------------------------------------------------ lifecycle
  function ensureContext(){
    if(ctx) return !!ctx;
    ctx = audio.getContext ? audio.getContext() : null;
    if(ctx && cfg) build();
    return !!ctx;
  }
  function start(opts){
    if(!ensureContext()) return false;
    if(ctx.state === 'suspended') ctx.resume().catch(() => {});
    if(!built && cfg) build();
    running = true;
    masterMute = 1;
    attachPendingVoices();
    if(!(opts && opts.silent)) fireEvent('ignition', {force: true});
    return true;
  }
  function stop(){
    running = false;
    if(!ctx || !built) return;
    const t = ctx.currentTime;
    for(const k of ['on', 'off']) for(const v of bankVoices[k]) v.gain.gain.setTargetAtTime(0, t, .08);
    for(const key in layerVoices) layerVoices[key].gain.gain.setTargetAtTime(0, t, .08);
    for(const key in skidVoices) skidVoices[key].gain.gain.setTargetAtTime(0, t, .08);
    if(manageFallbackSynth && audio.setEngineSynthEnabled) audio.setEngineSynthEnabled(true);
  }
  function setConfig(set){
    cfg = set ? JSON.parse(JSON.stringify(set)) : null;
    if(cfg && !cfg.skids) cfg.skids = defaultSet().skids;   // set salvati prima degli slot sgommata
    thr = 0; boost = 0; smRpm = gearbox.idle;
    skidCur.drift = skidCur.brake = skidCur.accel = 0;
    if(!cfg){
      teardownVoices();
      if(manageFallbackSynth && audio.setEngineSynthEnabled) audio.setEngineSynthEnabled(true);
      notifyStatus();
      return;
    }
    if(ensureContext()) build();
    notifyStatus();
  }
  function setManual(m){
    manual = m ? {rpm: m.rpm || gearbox.idle, throttle: m.throttle || 0, limiter: !!m.limiter} : null;
  }
  function trigger(name){
    if(!ensureContext() || !cfg) return false;
    if(ctx.state === 'suspended') ctx.resume().catch(() => {});
    if(!running) start({silent: true});
    if(name === 'limiter'){ limiterTest = 1.2; return true; }
    if(name.indexOf('skid') === 0){
      const key = name.slice(4).toLowerCase();          // skidDrift → drift
      if(skidCur[key] == null) return false;
      skidTest = {key, t: 1.4};
      return true;
    }
    return fireEvent(name, {force: true});
  }
  function setSkids(levels){
    if(!levels) return;
    for(const key of ['drift', 'brake', 'accel']) if(levels[key] != null) skidTargets[key] = clamp(levels[key], 0, 1);
  }
  function handlesSkids(){
    return running && !!cfg && !!cfg.skids &&
      ['drift', 'brake', 'accel'].some(k => cfg.skids[k] && cfg.skids[k].enabled !== false);
  }

  // ------------------------------------------------ stato per l'editor
  function slotStatus(){
    const bank = list => (list || []).map(s => ({src: s.src, rpm: s.rpm, status: statusOf(s.src)}));
    const one = e => ({src: e && e.src || '', status: e && e.src ? statusOf(e.src) : 'empty', fallback: !(e && e.src && statusOf(e.src) === 'ok')});
    return {
      active: !!cfg,
      engineReady: sampleEngineReady(),
      running,
      banks: cfg ? {on: bank(cfg.banks.on), off: bank(cfg.banks.off)} : {on: [], off: []},
      layers: cfg ? {
        limiter: one(cfg.layers.limiter),
        turbo: one(cfg.layers.turbo),
        gearWhinePower: one(cfg.layers.gearWhinePower),
        gearWhineOff: one(cfg.layers.gearWhineOff),
      } : {},
      events: cfg ? Object.keys(cfg.events).reduce((acc, k) => { acc[k] = one(cfg.events[k]); return acc; }, {}) : {},
      skids: cfg ? Object.keys(cfg.skids || {}).reduce((acc, k) => { acc[k] = one(cfg.skids[k]); return acc; }, {}) : {},
    };
  }
  function notifyStatus(){
    if(onStatusChange) try { onStatusChange(slotStatus()); } catch(err){}
  }

  return {
    setConfig,
    getConfig: () => cfg,
    liveConfig: () => cfg,   // riferimento vivo: il designer lo muta per i parametri continui
    update,
    start,
    stop,
    setMuted: v => { masterMute = v ? 0 : 1; },
    setManual,
    setSkids,
    handlesSkids,
    trigger,
    slotStatus,
    isActive: () => !!cfg && sampleEngineReady(),
    setStatusListener: fn => { onStatusChange = fn; },
    defaultSet,
    knownFiles: () => KNOWN_FILES.slice(),
    engineDir: ENGINE_DIR,
    gearbox,
  };
}

window.LK_RUNTIME_ENGINE_AUDIO = Object.freeze({create, defaultSet, KNOWN_FILES, ENGINE_DIR});
})();
