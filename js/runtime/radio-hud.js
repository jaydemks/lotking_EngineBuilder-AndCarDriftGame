/* =========================================================
   LOT KING — radio HUD runtime module
   Soundhud UI, TAB slow-motion radio, player volume and bass boost.
   ========================================================= */
(function(){
'use strict';

function createRadioHud(deps){
  const paths = deps.paths;
  const canvas = deps.canvas;
  const clamp = deps.clamp;
  const popup = deps.popup;
  const telemetry = deps.telemetry;
  const isRuntimeUiSuppressed = typeof deps.isRuntimeUiSuppressed === 'function'
    ? deps.isRuntimeUiSuppressed
    : function(){ return false; };
  const musicLib = window.LK_RUNTIME_MUSIC_LIBRARY;

  const cfg = {
    enabled:true,
    frameX:50,
    frameY:2,
    width:880,
    pngScaleX:1,
    pngScaleY:1,
    screenLeft:5.5,
    screenTop:7,
    screenWidth:89,
    screenHeight:84,
    imageLayer:1,
    screenLayer:2,
    buttonLayer:8,
    editTarget:'screen',
    buttons: {
      volDown: {x:14, y:82, size:5.5},
      volUp:   {x:22, y:82, size:5.5},
      bass:    {x:30, y:82, size:5.5},
    },
    buttonOpacity:.22,
  };

  const library = musicLib.create([
    {url: paths.music('01 - Num0 - Block Road.mp3'),          title:'BLOCK ROAD',           artist:'NUM0'},
    {url: paths.music('02 - Num0 - Getting serious.mp3'),     title:'GETTING SERIOUS',      artist:'NUM0'},
    {url: paths.music('03 - Num0 - Look into the mirror.mp3'),title:'LOOK INTO THE MIRROR', artist:'NUM0'},
  ]);
  const audio = new Audio();
  audio.volume = .65;
  audio.preload = 'auto';

  let idx = 0, shuffle = false, open = false, started = false;
  let frameRect = null;
  const $ = id => document.getElementById(id);
  const el = {radio:$('radio'), img:$('radioImg'), screen:$('radioScreen'), title:$('rsTitle'), artist:$('rsArtist'),
    play:$('btnPlay'), prev:$('btnPrev'), next:$('btnNext'), shuf:$('btnShuffle'),
    tCur:$('tCur'), tTot:$('tTot'), tFill:$('tFill'), tBar:$('tBar'),
    clock:$('rsClock'), date:$('rsDate'), oil:$('rsOil'), speed:$('rsSpeed'), g:$('rsG'), boost:$('rsBoost'),
    vol:$('rsVol'), volVal:$('rsVolVal'),
    art:$('albumArt'), gGraph:$('gGraph')};
  const viewport = document.getElementById('radioViewport') || document.createElement('div');
  if(!viewport.id) viewport.id = 'radioViewport';
  if(el.radio && el.radio.parentNode !== viewport){
    el.radio.parentNode.insertBefore(viewport, el.radio);
    viewport.appendChild(el.radio);
  }
  el.img.src = paths.media('soundhud.png');

  const edit = {
    frame: document.createElement('div'),
    screen: document.createElement('div'),
  };
  edit.frame.id = 'radioFrameEdit';
  edit.frame.className = 'radioEditBox';
  edit.frame.dataset.label = 'FRAME PNG';
  edit.frame.innerHTML = '<span class="radioEditHandle"></span>';
  edit.screen.id = 'radioScreenEdit';
  edit.screen.className = 'radioEditBox';
  edit.screen.dataset.label = 'INTERFACCIA';
  edit.screen.innerHTML = '<span class="radioEditHandle"></span>';
  el.radio.append(edit.frame, edit.screen);

  const KNOB_DEFS = [
    {key:'volDown', label:'VOL −', title:'Volume −'},
    {key:'volUp',   label:'VOL +', title:'Volume +'},
    {key:'bass',    label:'BASS BOOST', title:'Bass boost'},
  ];
  const knobWrap = document.createElement('div');
  knobWrap.id = 'radioKnobs';
  const playerHitWrap = document.createElement('div');
  playerHitWrap.id = 'radioPlayerHits';
  const knobs = {};
  for(const d of KNOB_DEFS){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'radioKnob';
    b.title = d.title;
    b.dataset.label = d.label;
    b.innerHTML = '<span class="radioKnobHandle"></span>';
    knobWrap.appendChild(b);
    knobs[d.key] = b;
  }
  const playerHits = {};
  for(const key of ['prev', 'play', 'next', 'shuffle']){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'radioPlayerHit';
    b.dataset.hit = key;
    b.setAttribute('aria-hidden', 'true');
    playerHitWrap.appendChild(b);
    playerHits[key] = b;
  }
  el.radio.append(knobWrap, playerHitWrap);
  let editorPreview = false;

  function getFrameInfo(){
    if(!frameRect) return {x:0, y:0, w:innerWidth, h:innerHeight};
    return {
      x: frameRect.x,
      y: frameRect.y,
      w: frameRect.w,
      h: frameRect.h,
    };
  }

  function setFrameRect(rect){
    if(rect && isFinite(rect.x) && isFinite(rect.y) && isFinite(rect.w) && isFinite(rect.h)){
      frameRect = {
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
      };
    } else {
      frameRect = null;
    }
    applyConfig();
  }

  function applyConfig(){
    el.radio.classList.toggle('disabled', !cfg.enabled);
    el.radio.classList.toggle('hud-edit-frame', editorPreview && cfg.editTarget === 'frame');
    el.radio.classList.toggle('hud-edit-screen', editorPreview && cfg.editTarget === 'screen');
    el.radio.classList.toggle('hud-edit-buttons', editorPreview && cfg.editTarget === 'buttons');
    viewport.classList.toggle('editor-preview', editorPreview);
    viewport.classList.toggle('interactive', (open || editorPreview) && !isRuntimeUiSuppressed());
    knobWrap.style.setProperty('--knob-alpha', String(cfg.buttonOpacity == null ? .22 : clamp(cfg.buttonOpacity, 0, 1)));
    for(const k in knobs){
      const b = cfg.buttons && cfg.buttons[k];
      if(!b) continue;
      knobs[k].style.left = clamp(b.x, 0, 100) + '%';
      knobs[k].style.top = clamp(b.y, 0, 100) + '%';
      knobs[k].style.width = clamp(b.size, 2, 25) + '%';
    }
    const scoped = frameRect != null && !editorPreview;
    const targetW = frameRect ? frameRect.w : innerWidth;
    const targetH = frameRect ? frameRect.h : innerHeight;
    const baseX = scoped ? (frameRect.w / 2) : null;
    const baseBottom = scoped ? 0 : null;
    const width = Math.max(220, cfg.width|0);
    const scopedWidth = Math.max(220, Math.min(width, Math.round(targetW * .92)));

    if(scoped){
      viewport.style.left = Math.round(frameRect.x) + 'px';
      viewport.style.top = Math.round(frameRect.y) + 'px';
      viewport.style.width = Math.round(frameRect.w) + 'px';
      viewport.style.height = Math.round(frameRect.h) + 'px';
      viewport.style.right = 'auto';
      viewport.style.bottom = 'auto';
    } else {
      viewport.style.left = viewport.style.top = viewport.style.width = viewport.style.height = viewport.style.right = viewport.style.bottom = '';
    }

    el.radio.style.setProperty('--radio-x', scoped ? baseX + 'px' : clamp(cfg.frameX, 5, 95) + '%');
    el.radio.style.setProperty('--radio-y', scoped ? Math.round(targetH * clamp(cfg.frameY, 0, 60) / 100) + 'px' : clamp(cfg.frameY, 0, 60) + 'vh');
    el.radio.style.setProperty('--radio-width', scoped ? scopedWidth + 'px' : 'min(92vw, ' + width + 'px)');
    if(scoped){
      el.radio.style.setProperty('--radio-bottom', Math.round(baseBottom) + 'px');
    } else {
      el.radio.style.removeProperty('--radio-bottom');
    }
    el.radio.style.setProperty('--radio-scale-x', String(Math.max(.2, Math.min(2.5, cfg.pngScaleX))));
    el.radio.style.setProperty('--radio-scale-y', String(Math.max(.2, Math.min(2.5, cfg.pngScaleY))));
    el.radio.style.setProperty('--scr-left', cfg.screenLeft + '%');
    el.radio.style.setProperty('--scr-top', cfg.screenTop + '%');
    el.radio.style.setProperty('--scr-w', cfg.screenWidth + '%');
    el.radio.style.setProperty('--scr-h', cfg.screenHeight + '%');
    el.screen.style.setProperty('--scr-left', cfg.screenLeft + '%');
    el.screen.style.setProperty('--scr-top', cfg.screenTop + '%');
    el.screen.style.setProperty('--scr-w', cfg.screenWidth + '%');
    el.screen.style.setProperty('--scr-h', cfg.screenHeight + '%');
    const imageLayer = cfg.imageLayer|0;
    const screenLayer = cfg.screenLayer|0;
    const buttonLayer = cfg.buttonLayer == null ? 8 : cfg.buttonLayer|0;
    const buttonHitLayer = Math.max(buttonLayer, imageLayer, screenLayer) + 10;
    el.radio.style.setProperty('--radio-img-z', String(imageLayer));
    el.radio.style.setProperty('--radio-screen-z', String(screenLayer));
    el.radio.style.setProperty('--radio-buttons-z', String(buttonHitLayer));
    el.radio.style.setProperty('--radio-player-z', String(buttonHitLayer + 1));
    syncPlayerHitboxes();
    if(!cfg.enabled && open && !editorPreview) toggleOpen(false);
  }

  function setConfig(patch, meta){
    const before = JSON.parse(JSON.stringify(cfg));
    patch = Object.assign({}, patch || {});
    const requestedPatch = JSON.parse(JSON.stringify(patch));
    if(patch.buttons){
      for(const k in patch.buttons) cfg.buttons[k] = Object.assign({}, cfg.buttons[k], patch.buttons[k]);
      delete patch.buttons;
    }
    Object.assign(cfg, patch);
    applyConfig();
    window.dispatchEvent(new CustomEvent('lotking:radiohudchange', {
      detail: {
        before,
        after: JSON.parse(JSON.stringify(cfg)),
        patch: requestedPatch,
        meta: meta || null,
      }
    }));
  }

  function setEditorPreview(v){
    editorPreview = !!v;
    el.radio.classList.toggle('editor-preview', editorPreview);
    applyConfig();
    if(editorPreview) updateHUD(.016, .45, .3);
  }

  function bindEditBox(box, target){
    box.addEventListener('pointerdown', e => {
      if(!editorPreview) return;
      e.preventDefault();
      e.stopPropagation();
      const resize = e.target.classList.contains('radioEditHandle');
      const sx = e.clientX, sy = e.clientY;
      const start = Object.assign({}, cfg);
      const getFrame = () => getFrameInfo();
      box.setPointerCapture(e.pointerId);
      const move = ev => {
        const frame = getFrame();
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if(target === 'frame'){
          if(resize){
            setConfig({width: clamp(start.width + dx * 2, 280, 1400)});
          } else {
            setConfig({
              frameX: clamp(start.frameX + dx / Math.max(1, frame.w) * 100, 5, 95),
              frameY: clamp(start.frameY - dy / Math.max(1, frame.h) * 100, 0, 60),
            });
          }
        } else {
          const r = el.radio.getBoundingClientRect();
          if(resize){
            setConfig({
              screenWidth: clamp(start.screenWidth + dx / Math.max(1, r.width) * 100, 10, 150),
              screenHeight: clamp(start.screenHeight + dy / Math.max(1, r.height) * 100, 10, 150),
            });
          } else {
            setConfig({
              screenLeft: clamp(start.screenLeft + dx / Math.max(1, r.width) * 100, -50, 120),
              screenTop: clamp(start.screenTop + dy / Math.max(1, r.height) * 100, -50, 120),
            });
          }
        }
      };
      const up = ev => {
        box.releasePointerCapture(ev.pointerId);
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    });
  }
  bindEditBox(edit.frame, 'frame');
  bindEditBox(edit.screen, 'screen');

  function bindKnob(btn, key){
    let dragged = false;
    btn.addEventListener('pointerdown', e => {
      if(!(editorPreview && cfg.editTarget === 'buttons')) return;
      e.preventDefault();
      e.stopPropagation();
      dragged = false;
      const resize = e.target.classList.contains('radioKnobHandle');
      const sx = e.clientX, sy = e.clientY;
      const start = Object.assign({}, cfg.buttons[key]);
      const r = el.radio.getBoundingClientRect();
      btn.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if(Math.abs(dx) + Math.abs(dy) > 2) dragged = true;
        if(resize){
          setConfig({buttons:{[key]:{size: clamp(start.size + dx / Math.max(1, r.width) * 100, 2, 25)}}});
        } else {
          setConfig({buttons:{[key]:{
            x: clamp(start.x + dx / Math.max(1, r.width) * 100, 0, 100),
            y: clamp(start.y + dy / Math.max(1, r.height) * 100, 0, 100),
          }}});
        }
      };
      const up = ev => {
        btn.releasePointerCapture(ev.pointerId);
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', up, true);
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', up, true);
    });
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if(editorPreview && cfg.editTarget === 'buttons'){ dragged = false; return; }
      if(key === 'volDown') setPlayerVol(playerVol - 1);
      else if(key === 'volUp') setPlayerVol(playerVol + 1);
      else cycleBass();
    });
  }
  for(const d of KNOB_DEFS) bindKnob(knobs[d.key], d.key);

  let playerVol = 10, bass = 0, extVol = 1;
  function applyVolume(){ audio.volume = clamp(.65 * extVol * (playerVol / 10), 0, 1); }
  function setPlayerVol(v, silent){
    playerVol = clamp(Math.round(v), 0, 10);
    applyVolume();
    if(el.vol) el.vol.value = playerVol;
    if(el.volVal) el.volVal.textContent = playerVol;
    if(!silent) popup('VOLUME ' + playerVol + '/10', '#4be3a0');
  }

  const BASS_STEPS = [0, 6, 11, 16];
  let actx = null, bassFilter = null, bassLimiter = null, bassBroken = false;
  function ensureBassGraph(){
    if(bassFilter) return true;
    if(bassBroken) return false;
    if(location.protocol === 'file:'){
      bassBroken = true;
      popup('BASS BOOST richiede http(s)', '#ff5566');
      return false;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      const src = actx.createMediaElementSource(audio);
      bassFilter = actx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 105;
      bassFilter.Q.value = .85;
      bassLimiter = actx.createDynamicsCompressor();
      bassLimiter.threshold.value = -10;
      bassLimiter.knee.value = 18;
      bassLimiter.ratio.value = 4;
      bassLimiter.attack.value = .006;
      bassLimiter.release.value = .18;
      src.connect(bassFilter);
      bassFilter.connect(bassLimiter);
      bassLimiter.connect(actx.destination);
      return true;
    } catch(err){
      bassBroken = true;
      const it = window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it';
      popup(it ? 'BASS BOOST non disponibile' : 'BASS BOOST unavailable', '#ff5566');
      return false;
    }
  }

  function setBass(v, silent){
    const nv = clamp(Math.round(v), 0, 3);
    if(nv > 0 && !ensureBassGraph()) return;
    bass = nv;
    if(bassFilter) bassFilter.gain.value = BASS_STEPS[bass];
    if(actx && actx.state === 'suspended') actx.resume().catch(()=>{});
    knobs.bass.style.setProperty('--k-on', String(bass / 3));
    if(!silent) popup('BASS BOOST ' + bass + '/3', '#ff7d54');
  }
  function cycleBass(){ setBass((bass + 1) % 4); }

  if(el.vol){
    el.vol.addEventListener('input', () => setPlayerVol(+el.vol.value, true));
    el.vol.addEventListener('change', () => popup('VOLUME ' + playerVol + '/10', '#4be3a0'));
  }
  setPlayerVol(10, true);

  function fmt(s){ if(!isFinite(s)) return '0:00'; s=Math.max(0,s|0); return (s/60|0)+':'+String(s%60).padStart(2,'0'); }
  function load(i, autoplay){
    const count = library.count();
    if(!count) return;
    idx = (i + count) % count;
    const track = library.at(idx);
    audio.src = musicLib.audioSrc(track.url);
    el.title.textContent = track.title;
    el.artist.textContent = track.artist;
    if(autoplay) audio.play().catch(()=>{});
    popup('♪ ' + track.title, '#4be3a0');
  }
  function pickNext(){
    const count = library.count();
    return shuffle && count > 1 ? (idx + 1 + Math.floor(Math.random()*(count-1))) % count : idx+1;
  }
  function next(){ load(pickNext(), true); }
  function prev(){ load(idx-1, true); }
  function togglePlay(){ audio.paused ? audio.play().catch(()=>{}) : audio.pause(); }
  function toggleShuffle(){ shuffle = !shuffle; el.shuf.classList.toggle('on', shuffle); popup(shuffle?'SHUFFLE ON':'SHUFFLE OFF','#4be3a0'); }
  let suppressPlayerClickUntil = 0;
  function suppressPlayerClick(){
    suppressPlayerClickUntil = performance.now() + 320;
  }
  function isPlayerClickSuppressed(){
    return performance.now() < suppressPlayerClickUntil;
  }
  function consumeSuppressedPlayerClick(e){
    if(!isPlayerClickSuppressed()) return false;
    if(e){
      e.preventDefault();
      e.stopPropagation();
    }
    return true;
  }
  function controlFromPoint(x, y){
    const buttons = [
      {el: el.prev, action: prev},
      {el: el.play, action: togglePlay},
      {el: el.next, action: next},
      {el: el.shuf, action: toggleShuffle},
    ];
    const pad = 8;
    for(const b of buttons){
      if(!b.el) continue;
      const r = b.el.getBoundingClientRect();
      if(x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad) return b;
    }
    return null;
  }
  function setPlayerControlHover(hit){
    for(const b of [el.prev, el.play, el.next, el.shuf]){
      if(b) b.classList.toggle('radio-hover', !!hit && hit.el === b);
    }
    viewport.classList.toggle('player-hover', !!hit);
  }
  function syncPlayerHitboxes(){
    const radioRect = el.radio.getBoundingClientRect();
    if(!radioRect.width || !radioRect.height) return;
    const pairs = [
      [playerHits.prev, el.prev],
      [playerHits.play, el.play],
      [playerHits.next, el.next],
      [playerHits.shuffle, el.shuf],
    ];
    for(const pair of pairs){
      const hit = pair[0];
      const source = pair[1];
      if(!hit || !source) continue;
      const r = source.getBoundingClientRect();
      hit.style.left = ((r.left - radioRect.left) / radioRect.width * 100) + '%';
      hit.style.top = ((r.top - radioRect.top) / radioRect.height * 100) + '%';
      hit.style.width = (r.width / radioRect.width * 100) + '%';
      hit.style.height = (r.height / radioRect.height * 100) + '%';
    }
  }
  function toggleOpen(force){
    if(isRuntimeUiSuppressed() && force !== false) force = false;
    if(!cfg.enabled && !editorPreview && force !== false) return;
    open = force == null ? !open : !!force;
    el.radio.classList.toggle('open', open);
    viewport.classList.toggle('interactive', (open || editorPreview) && !isRuntimeUiSuppressed());
    requestAnimationFrame(syncPlayerHitboxes);
    canvas.classList.toggle('slowmo', open && !editorPreview);
  }
  function begin(){ if(started) return; started = true; load(0, true); }
  async function addTracks(files){
    const added = await library.addFiles(files, 'Game radio project audio');
    if(added.length) popup('RADIO TRACKS ADDED: ' + added.length, '#4be3a0');
    return added;
  }
  function setVolume(v){ extVol = clamp(v, 0, 2); applyVolume(); }
  audio.addEventListener('ended', next);

  el.play.addEventListener('click', e => { if(consumeSuppressedPlayerClick(e)) return; togglePlay(); });
  el.prev.addEventListener('click', e => { if(consumeSuppressedPlayerClick(e)) return; prev(); });
  el.next.addEventListener('click', e => { if(consumeSuppressedPlayerClick(e)) return; next(); });
  el.shuf.addEventListener('click', e => { if(consumeSuppressedPlayerClick(e)) return; toggleShuffle(); });
  function bindPlayerHit(hit, visual, action){
    hit.addEventListener('pointerenter', () => { if(visual) visual.classList.add('radio-hover'); });
    hit.addEventListener('pointerleave', () => { if(visual) visual.classList.remove('radio-hover'); });
    hit.addEventListener('click', e => {
      if(isRuntimeUiSuppressed()) return;
      e.preventDefault();
      e.stopPropagation();
      if(consumeSuppressedPlayerClick(e)) return;
      if(visual) visual.classList.remove('radio-hover');
      action();
    });
  }
  bindPlayerHit(playerHits.prev, el.prev, prev);
  bindPlayerHit(playerHits.play, el.play, togglePlay);
  bindPlayerHit(playerHits.next, el.next, next);
  bindPlayerHit(playerHits.shuffle, el.shuf, toggleShuffle);
  window.addEventListener('pointerdown', e => {
    if(isRuntimeUiSuppressed()) return;
    if(!(open || editorPreview) || e.button > 0) return;
    const hit = controlFromPoint(e.clientX, e.clientY);
    if(!hit) return;
    e.preventDefault();
    e.stopPropagation();
    suppressPlayerClick();
    hit.action();
  }, true);
  window.addEventListener('pointermove', e => {
    if(isRuntimeUiSuppressed()){
      setPlayerControlHover(null);
      return;
    }
    if(!(open || editorPreview)){
      setPlayerControlHover(null);
      return;
    }
    setPlayerControlHover(controlFromPoint(e.clientX, e.clientY));
  }, true);
  window.addEventListener('pointerup', () => setPlayerControlHover(null), true);
  viewport.addEventListener('click', e => {
    if(isRuntimeUiSuppressed()) return;
    if(!(open || editorPreview) || (e.target && e.target.closest && e.target.closest('.rs-controls button'))) return;
    if(consumeSuppressedPlayerClick(e)) return;
    const hit = controlFromPoint(e.clientX, e.clientY);
    if(!hit) return;
    e.preventDefault();
    e.stopPropagation();
    suppressPlayerClick();
    hit.action();
  }, true);
  el.tBar.addEventListener('click', e => {
    const r = el.tBar.getBoundingClientRect();
    if(isFinite(audio.duration)) audio.currentTime = (e.clientX - r.left)/r.width * audio.duration;
  });

  let oilT = 90, gHist = new Array(60).fill(0), gPtr = 0;
  const artCtx = el.art.getContext('2d'), gCtx = el.gGraph.getContext('2d');
  let artT = 0;
  function updateHUD(dt, rpm01, throttle){
    const t = telemetry ? telemetry() : {};
    el.play.textContent = audio.paused ? '▶' : '⏸';
    el.shuf.classList.toggle('on', shuffle);
    el.tCur.textContent = fmt(audio.currentTime);
    el.tTot.textContent = '/ ' + fmt(audio.duration);
    el.tFill.style.width = (isFinite(audio.duration) && audio.duration>0 ? audio.currentTime/audio.duration*100 : 0) + '%';
    if(!open && !editorPreview) return;
    const d = new Date();
    el.clock.textContent = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    if(el.date){
      const DAYS = ['DOM','LUN','MAR','MER','GIO','VEN','SAB'];
      const MONTHS = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'];
      el.date.textContent = DAYS[d.getDay()] + ' ' + String(d.getDate()).padStart(2,'0') + ' ' + MONTHS[d.getMonth()];
    }
    oilT += ((90 + rpm01*22) - oilT) * Math.min(1, dt*.3);
    el.oil.textContent = Math.round(oilT) + '°C';
    el.speed.textContent = Math.round(t.speedKmh || 0);
    el.g.textContent = (t.lastLatG || 0).toFixed(1) + 'G';
    el.boost.textContent = (throttle * (0.4 + rpm01*1.2)).toFixed(1) + ' BAR';

    gHist[gPtr++ % gHist.length] = t.lastLatG || 0;
    const W = el.gGraph.width, H = el.gGraph.height;
    gCtx.clearRect(0,0,W,H);
    gCtx.strokeStyle = 'rgba(255,255,255,.12)';
    for(let x=0; x<W; x+=W/8){ gCtx.beginPath(); gCtx.moveTo(x,0); gCtx.lineTo(x,H); gCtx.stroke(); }
    gCtx.strokeStyle = '#ff7d54'; gCtx.lineWidth = 2; gCtx.beginPath();
    for(let i=0;i<gHist.length;i++){
      const v = gHist[(gPtr+i) % gHist.length];
      const x = i/(gHist.length-1)*W, y = H - Math.min(1, v/2)*H*.9 - 2;
      i ? gCtx.lineTo(x,y) : gCtx.moveTo(x,y);
    }
    gCtx.stroke();

    artT += dt * (audio.paused ? .2 : 1);
    const A = el.art.width;
    artCtx.fillStyle = '#0a0e16'; artCtx.fillRect(0,0,A,A);
    const grad = artCtx.createLinearGradient(0,0,A,A);
    grad.addColorStop(0,'#1b2a4a'); grad.addColorStop(1,'#0a0e16');
    artCtx.fillStyle = grad; artCtx.fillRect(0,0,A,A);
    artCtx.fillStyle = '#070a10';
    for(let i=0;i<7;i++){ const w=A/9, h=A*.2+((i*37)%40); artCtx.fillRect(6+i*(w+3), A*.5-h*.5, w, h); }
    const bars = 12;
    for(let i=0;i<bars;i++){
      const v = audio.paused ? .08 : (.25 + .75*Math.abs(Math.sin(artT*3 + i*1.7)) * (0.4+0.6*Math.abs(Math.sin(artT*.7+i))));
      const bw = A/(bars*1.5);
      const hh = v * A * .32;
      artCtx.fillStyle = `hsl(${160 + i*8}, 80%, ${45+v*20}%)`;
      artCtx.fillRect(A*.08 + i*bw*1.4, A*.92 - hh, bw, hh);
    }
    artCtx.strokeStyle = '#ff4fd8'; artCtx.lineWidth = 2.5; artCtx.shadowColor = '#ff4fd8'; artCtx.shadowBlur = 8;
    artCtx.beginPath();
    const cy = A*.62, cw = A*.6, cx = A*.2;
    artCtx.moveTo(cx, cy); artCtx.lineTo(cx+cw*.12, cy-A*.09); artCtx.lineTo(cx+cw*.42, cy-A*.13);
    artCtx.lineTo(cx+cw*.72, cy-A*.09); artCtx.lineTo(cx+cw, cy); artCtx.closePath(); artCtx.stroke();
    artCtx.shadowBlur = 0;
    syncPlayerHitboxes();
  }

  applyConfig();
  return {toggleOpen, next, prev, togglePlay, toggleShuffle, updateHUD, begin, setVolume,
    setPlayerVol, setBass, getPlayerVol: () => playerVol, getBass: () => bass,
    isOpen: () => open, audio, config: cfg, setConfig, setEditorPreview,
    setFrameRect,
    getTracks: options => library.list(options),
    addTracks,
    restoreTracks: tracks => library.restoreTracks(tracks),
    getStoredTracks: () => library.storedTracks(),
    loadTrack: i => load(i, true),
    getTrackIndex: () => idx};
}

window.LK_RUNTIME_RADIO_HUD = Object.freeze({create: createRadioHud});
})();
