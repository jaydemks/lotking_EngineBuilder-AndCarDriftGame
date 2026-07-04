/* =========================================================
   LOT KING - ENGINE SOUND DESIGNER (editor overlay)
   Illustrazione interattiva del motore: contagiri SVG con i
   loop ON/OFF trascinabili sugli RPM, hotspot sul motore per
   layer/eventi, parametri live e tester (rpm, gas, rampa).
   Caricato on-demand da editor.js (openSoundDesigner).
   ========================================================= */
(function(){
'use strict';

if(window.LK_SOUND_DESIGNER) return;

const GAME = window.LOT_KING;
const STORE = window.LK_STORE;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const RPM_MIN = 500, RPM_MAX = 8200;
const ARC_A0 = -215, ARC_A1 = 35;   // gradi: arco del contagiri
const CX = 210, CY = 205, R_ON = 168, R_OFF = 128;

// ------------------------------------------------ CSS (self-contained)
const css = document.createElement('style');
css.textContent = `
#lksd { position:fixed; inset:0; z-index:300; display:none; align-items:center; justify-content:center;
  background:rgba(4,7,12,.78); backdrop-filter:blur(5px); font-family:'Segoe UI',Arial,sans-serif; color:#cfd6e4; font-size:13px; }
#lksd.open { display:flex; }
.lksd-panel { width:min(1180px, calc(100vw - 30px)); height:min(92vh, 860px); display:flex; flex-direction:column;
  border-radius:14px; overflow:hidden; border:1px solid #2b3446;
  background:
    radial-gradient(1100px 420px at 75% -10%, rgba(52,74,110,.35), rgba(0,0,0,0) 60%),
    linear-gradient(180deg, #121723, #0a0e16);
  background-color:#0c111b; box-shadow:0 30px 80px rgba(0,0,0,.7); }
.lksd-head { display:flex; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid #232c3c; flex:none; }
.lksd-title { font-weight:900; letter-spacing:2px; color:#ffd166; font-size:13px; white-space:nowrap; }
.lksd-head select, .lksd-head input[type=text] { height:28px; background:#12161f; color:#dfe5f1;
  border:1px solid #2b3446; border-radius:6px; padding:0 8px; font-size:12px; font-weight:700; }
.lksd-head input[type=text] { width:170px; }
.lksd-head button { height:28px; padding:0 12px; border-radius:6px; border:1px solid #2b3446;
  background:#1b2130; color:#cfd6e4; cursor:pointer; font-size:12px; font-weight:700; white-space:nowrap; }
.lksd-head button:hover { border-color:#ffd166; color:#ffd166; }
.lksd-head button.lksd-save { border-color:#2f9e5f; color:#4be3a0; }
.lksd-head button.lksd-save:hover { background:rgba(75,227,160,.12); }
.lksd-head .lksd-x { width:30px; padding:0; font-size:15px; }
.lksd-head .lksd-x:hover { border-color:#ff6b7a; color:#ff6b7a; }
.lksd-spacer { flex:1; }
.lksd-dirty { color:#ffd166; font-size:17px; display:none; }
.lksd-dirty.show { display:inline; }
.lksd-body { flex:1; display:grid; grid-template-columns:440px 1fr; gap:0; min-height:0; }
.lksd-left { padding:10px 6px 10px 14px; overflow-y:auto; border-right:1px solid #1d2431; }
.lksd-right { padding:10px 14px; overflow-y:auto; }
.lksd-sec { margin:0 0 10px; }
.lksd-sec-title { font-size:11px; font-weight:900; letter-spacing:2px; color:#7f8aa1; padding:6px 2px; border-bottom:1px solid #232c3c; margin-bottom:8px; }
#lksdTach { display:block; margin:0 auto; user-select:none; touch-action:none; }
#lksdTach .lksd-dot { cursor:grab; }
#lksdTach .lksd-dot.drag { cursor:grabbing; }
#lksdTach text { pointer-events:none; }
.lksd-legend { display:flex; gap:16px; justify-content:center; font-size:11px; color:#8b93a7; margin-top:2px; }
.lksd-legend b { font-weight:900; }
.lksd-legend .on b { color:#ffb054; } .lksd-legend .off b { color:#5fd7ff; }
#lksdEngine { display:block; margin:6px auto 0; user-select:none; }
#lksdEngine .lksd-hot { cursor:pointer; }
#lksdEngine .lksd-hot circle.ring { fill:rgba(20,26,38,.9); stroke:#3a4666; stroke-width:1.5; transition:all .15s; }
#lksdEngine .lksd-hot:hover circle.ring { stroke:#ffd166; }
#lksdEngine .lksd-hot.sel circle.ring { stroke:#ffd166; stroke-width:2.5; filter:drop-shadow(0 0 6px rgba(255,209,102,.7)); }
#lksdEngine .lksd-hot text { pointer-events:none; }
#lksdEngine .lksd-hot .led { transition:fill .2s; }
.lksd-slotpanel { background:#131926; border:1px solid #232c3c; border-radius:10px; padding:10px 12px; }
.lksd-slot-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.lksd-slot-title { font-weight:900; letter-spacing:1px; color:#fff; font-size:13px; flex:1; }
.lksd-led { width:9px; height:9px; border-radius:50%; background:#4a5468; flex:none; }
.lksd-led.ok { background:#4be3a0; box-shadow:0 0 7px rgba(75,227,160,.8); }
.lksd-led.generated { background:#5fd7ff; box-shadow:0 0 7px rgba(95,215,255,.75); }
.lksd-led.loading { background:#ffd166; box-shadow:0 0 7px rgba(255,209,102,.7); }
.lksd-led.error { background:#ff5566; box-shadow:0 0 7px rgba(255,85,102,.8); }
.lksd-led.empty { background:#4a5468; }
.lksd-led-label { font-size:10px; color:#8b93a7; letter-spacing:1px; }
.lksd-row { display:grid; grid-template-columns:110px 1fr 52px; gap:8px; align-items:center; padding:4px 0; }
.lksd-row label { font-size:11px; color:#9aa3b8; font-weight:700; letter-spacing:.5px; }
.lksd-row input[type=range] { width:100%; accent-color:#4be3a0; cursor:pointer; height:5px; }
.lksd-row output { font-size:11px; color:#4be3a0; font-weight:800; text-align:right; font-variant-numeric:tabular-nums; }
.lksd-row select, .lksd-row input[type=number] { grid-column:2 / 4; height:26px; background:#12161f; color:#dfe5f1;
  border:1px solid #2b3446; border-radius:5px; padding:0 6px; font-size:12px; min-width:0; }
.lksd-check { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:12px; font-weight:700; color:#cfd6e4; cursor:pointer; }
.lksd-check input { width:14px; height:14px; accent-color:#4be3a0; }
.lksd-btnrow { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
.lksd-btnrow button { height:27px; padding:0 10px; border-radius:6px; border:1px solid #2b3446;
  background:#1b2130; color:#cfd6e4; cursor:pointer; font-size:12px; font-weight:700; }
.lksd-btnrow button:hover { border-color:#4be3a0; color:#4be3a0; }
.lksd-btnrow button.warn:hover { border-color:#ff6b7a; color:#ff6b7a; }
.lksd-hint { font-size:11px; color:#69758d; line-height:1.5; margin-top:6px; }
.lksd-test { flex:none; display:flex; align-items:center; gap:12px; padding:10px 16px; border-top:1px solid #232c3c;
  background:linear-gradient(180deg, #10151f, #0b0f18); }
.lksd-test .lksd-rpmread { min-width:96px; text-align:center; }
.lksd-test .lksd-rpmread b { display:block; font-size:22px; color:#fff; font-variant-numeric:tabular-nums; line-height:1; }
.lksd-test .lksd-rpmread span { font-size:9px; letter-spacing:2px; color:#8b93a7; }
.lksd-test input[type=range] { flex:1; accent-color:#ffb054; cursor:pointer; }
.lksd-test button { height:34px; padding:0 14px; border-radius:7px; border:1px solid #2b3446;
  background:#1b2130; color:#cfd6e4; cursor:pointer; font-size:12px; font-weight:800; letter-spacing:1px; white-space:nowrap; }
.lksd-test button:hover { border-color:#ffd166; color:#ffd166; }
.lksd-test button.hold { background:linear-gradient(90deg,#2f9e5f,#27b371); border:none; color:#fff; }
.lksd-test button.hold:active, .lksd-test button.hold.on { filter:brightness(1.35); transform:scale(.97); }
.lksd-boost { width:70px; height:8px; border-radius:4px; background:#1a2030; overflow:hidden; }
.lksd-boost i { display:block; height:100%; width:0%; background:linear-gradient(90deg,#5fd7ff,#ff7d54); transition:width .08s; }
`;
document.head.appendChild(css);

// ------------------------------------------------ DOM
const root = document.createElement('div');
root.id = 'lksd';
root.innerHTML = `
  <div class="lksd-panel">
    <div class="lksd-head">
      <span class="lksd-title">🎛 ENGINE SOUND DESIGNER</span>
      <select id="lksdSet" title="Sound set"></select>
      <input id="lksdName" type="text" title="Nome del set">
      <span id="lksdDirty" class="lksd-dirty" title="Modifiche non salvate">●</span>
      <span class="lksd-spacer"></span>
      <button id="lksdAssign" title="Assegna questo set al veicolo player">🚗 Assegna al veicolo</button>
      <button id="lksdDup" title="Duplica set">⧉</button>
      <button id="lksdSave" class="lksd-save" title="Salva il set [Ctrl+S]">💾 Salva set</button>
      <button id="lksdClose" class="lksd-x" title="Chiudi [Esc]">×</button>
    </div>
    <div class="lksd-body">
      <div class="lksd-left">
        <div class="lksd-sec">
          <div class="lksd-sec-title">BANCHI LOOP RPM · trascina i punti sull'arco</div>
          <svg id="lksdTach" width="420" height="300" viewBox="0 0 420 300"></svg>
          <div class="lksd-legend">
            <span class="on"><b>●</b> ON throttle (sotto gas)</span>
            <span class="off"><b>●</b> OFF throttle (rilascio)</span>
          </div>
        </div>
        <div class="lksd-sec">
          <div class="lksd-sec-title">MOTORE · clicca un punto caldo</div>
          <svg id="lksdEngine" width="420" height="312" viewBox="0 0 420 312"></svg>
        </div>
      </div>
      <div class="lksd-right">
        <div class="lksd-sec">
          <div class="lksd-sec-title" id="lksdSlotSecTitle">SLOT SELEZIONATO</div>
          <div id="lksdSlot" class="lksd-slotpanel"></div>
        </div>
        <div class="lksd-sec">
          <div class="lksd-sec-title">MASTER / MIX</div>
          <div id="lksdMaster" class="lksd-slotpanel"></div>
        </div>
      </div>
    </div>
    <div class="lksd-test">
      <div class="lksd-rpmread"><b id="lksdRpmVal">950</b><span>RPM TEST</span></div>
      <input id="lksdRpm" type="range" min="${RPM_MIN}" max="${RPM_MAX}" step="10" value="950">
      <button id="lksdAuto" title="AUTO RPM: col GAS i giri salgono da soli, al rilascio scendono (per testare anche la decelerazione)">⛭ AUTO</button>
      <button id="lksdGas" class="hold" title="Tieni premuto: gas aperto (banco ON)">⛽ GAS</button>
      <button id="lksdRamp" title="Rampa automatica idle → limitatore → rilascio">▶ RAMPA</button>
      <button id="lksdDecel" title="Solo rilascio: giri alti → idle senza gas (banco OFF)">▼ RILASCIO</button>
      <button id="lksdLim" title="Test fuorigiri / limitatore">🟥 LIMITER</button>
      <button data-ev="ignition" title="Test accensione">🔑</button>
      <button data-ev="shiftPop" title="Test pop cambiata">⚙💥</button>
      <button data-ev="blowoff" title="Test blow-off turbina">💨</button>
      <button data-ev="backfire" title="Test scoppio">🔥</button>
      <button data-ev="rev" title="Test sgasata">🗲 REV</button>
      <button data-ev="skidDrift" title="Test sgommata drift">🛞</button>
      <button data-ev="skidBrake" title="Test sgommata frenata">🛞🛑</button>
      <button data-ev="skidAccel" title="Test wheelspin">🛞🌪</button>
      <div class="lksd-boost" title="Boost turbina simulato"><i id="lksdBoost"></i></div>
    </div>
  </div>`;
document.body.appendChild(root);
const $ = sel => root.querySelector(sel);

// ------------------------------------------------ state
let work = null;              // copia di lavoro del set
let dirty = false;
let selected = {kind: 'bank', bank: 'on', index: 0};   // oppure {kind:'layer'|'event', key}
let testRpm = 950, gasHeld = false, ramp = null, rafId = null, lastT = 0, boostVis = 0, autoRpm = false;
let dragDot = null;
const EA = () => GAME.systems.engineAudio;

function markDirty(){ dirty = true; $('#lksdDirty').classList.add('show'); }
function clearDirty(){ dirty = false; $('#lksdDirty').classList.remove('show'); }

function fileOptions(current){
  const known = EA().knownFiles();
  const opts = [{v: '', l: '— vuoto (fallback sintetico) —'}];
  for(const f of known) opts.push({v: f, l: f.replace(EA().engineDir, '')});
  if(current && !known.includes(current) && current !== ''){
    opts.push({v: current, l: (current.indexOf('blob:') === 0 ? '(custom) ' : '') + current.split('/').pop()});
  }
  opts.push({v: '__upload__', l: '📁 Carica file audio…'});
  return opts;
}

// applica la copia di lavoro al motore audio (structural = ricostruisce i nodi)
function applyLive(structural){
  if(!work) return;
  if(structural){ EA().setConfig(work); return; }
  const live = EA().liveConfig();
  if(!live) { EA().setConfig(work); return; }
  live.master = JSON.parse(JSON.stringify(work.master));
  live.bankParams = JSON.parse(JSON.stringify(work.bankParams));
  const copyMeta = (dst, src) => { for(const k in src){ if(k !== 'src') dst[k] = src[k]; } };
  for(const b of ['on', 'off']) (work.banks[b] || []).forEach((s, i) => { if(live.banks[b][i]) copyMeta(live.banks[b][i], s); });
  for(const k in work.layers) if(live.layers[k]) copyMeta(live.layers[k], work.layers[k]);
  for(const k in work.events) if(live.events[k]) copyMeta(live.events[k], work.events[k]);
  for(const k in work.skids || {}) if(live.skids && live.skids[k]) copyMeta(live.skids[k], work.skids[k]);
}

// ------------------------------------------------ tachimetro SVG
function rpmToAngle(rpm){
  const t = clamp((rpm - RPM_MIN) / (RPM_MAX - RPM_MIN), 0, 1);
  return (ARC_A0 + t * (ARC_A1 - ARC_A0)) * Math.PI / 180;
}
function angleToRpm(a){
  let deg = a * 180 / Math.PI;
  while(deg > ARC_A1 + 180) deg -= 360;
  while(deg < ARC_A0 - 180) deg += 360;
  const t = clamp((deg - ARC_A0) / (ARC_A1 - ARC_A0), 0, 1);
  return RPM_MIN + t * (RPM_MAX - RPM_MIN);
}
function arcPoint(r, a){ return [CX + r * Math.cos(a), CY + r * Math.sin(a)]; }
function arcPath(r, a0, a1){
  const [x0, y0] = arcPoint(r, a0), [x1, y1] = arcPoint(r, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
function statusColor(st){
  return st === 'ok' ? '#4be3a0' : st === 'loading' ? '#ffd166' : st === 'error' ? '#ff5566' : '#6b7590';
}
function renderTach(){
  const svg = $('#lksdTach');
  const status = EA().slotStatus();
  const gb = EA().gearbox;
  let s = '';
  // arco base + zona rossa
  s += `<path d="${arcPath(R_ON + 14, rpmToAngle(RPM_MIN), rpmToAngle(RPM_MAX))}" fill="none" stroke="#232c3c" stroke-width="3"/>`;
  s += `<path d="${arcPath(R_ON + 14, rpmToAngle(gb.redline), rpmToAngle(RPM_MAX))}" fill="none" stroke="#ff5566" stroke-width="5" opacity=".8"/>`;
  // tacche + numeri
  for(let r = 1000; r <= 8000; r += 1000){
    const a = rpmToAngle(r);
    const [x0, y0] = arcPoint(R_ON + 8, a), [x1, y1] = arcPoint(R_ON + 20, a);
    s += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#4a5468" stroke-width="2"/>`;
    const [tx, ty] = arcPoint(R_ON + 34, a);
    s += `<text x="${tx}" y="${ty}" fill="#8b93a7" font-size="11" font-weight="800" text-anchor="middle" dominant-baseline="middle">${r / 1000}</text>`;
  }
  // bande crossfade + punti per banco
  const bandFor = (list, r, color) => {
    const sorted = list.map((smp, i) => ({smp, i})).sort((a, b) => a.smp.rpm - b.smp.rpm);
    for(let k = 0; k < sorted.length - 1; k++){
      const a0 = rpmToAngle(sorted[k].smp.rpm), a1 = rpmToAngle(sorted[k + 1].smp.rpm);
      s += `<path d="${arcPath(r, a0, a1)}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" opacity="${.16 + (work.bankParams.fadeWidth || .55) * .3}"/>`;
    }
  };
  bandFor(work.banks.on, R_ON, '#ffb054');
  bandFor(work.banks.off, R_OFF, '#5fd7ff');
  // needle
  const na = rpmToAngle(testRpm);
  const [nx, ny] = arcPoint(R_OFF - 26, na);
  s += `<line x1="${CX}" y1="${CY}" x2="${nx}" y2="${ny}" stroke="#ff7d54" stroke-width="3" stroke-linecap="round"/>`;
  s += `<circle cx="${CX}" cy="${CY}" r="7" fill="#1b2130" stroke="#ff7d54" stroke-width="2"/>`;
  // dots (dopo la needle, per il drag)
  const dots = (list, r, color, bank, stList) => {
    list.forEach((smp, i) => {
      const a = rpmToAngle(smp.rpm);
      const [x, y] = arcPoint(r, a);
      const isSel = selected.kind === 'bank' && selected.bank === bank && selected.index === i;
      const st = (stList || [])[i] ? stList[i].status : 'empty';
      s += `<g class="lksd-dot" data-bank="${bank}" data-i="${i}">` +
        `<circle cx="${x}" cy="${y}" r="${isSel ? 13 : 10}" fill="#141a26" stroke="${isSel ? '#ffd166' : color}" stroke-width="${isSel ? 3 : 2}"/>` +
        `<circle cx="${x}" cy="${y}" r="4" fill="${statusColor(st)}"/>` +
        `<text x="${x}" y="${y - (isSel ? 20 : 17)}" fill="${color}" font-size="10" font-weight="900" text-anchor="middle">${Math.round(smp.rpm / 100) / 10}k</text>` +
        `</g>`;
    });
  };
  dots(work.banks.on, R_ON, '#ffb054', 'on', status.banks.on);
  dots(work.banks.off, R_OFF, '#5fd7ff', 'off', status.banks.off);
  svg.innerHTML = s;
  // drag + select
  svg.querySelectorAll('.lksd-dot').forEach(g => {
    g.addEventListener('pointerdown', e => {
      e.preventDefault();
      const bank = g.dataset.bank, i = +g.dataset.i;
      selected = {kind: 'bank', bank, index: i};
      dragDot = {bank, i, moved: false};
      g.classList.add('drag');
      renderSlotPanel();
      renderTach();
    });
  });
}
addEventListener('pointermove', e => {
  if(!dragDot || !work) return;
  const svg = $('#lksdTach');
  const rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (420 / rect.width) - CX;
  const y = (e.clientY - rect.top) * (300 / rect.height) - CY;
  const rpm = Math.round(angleToRpm(Math.atan2(y, x)) / 50) * 50;
  const smp = work.banks[dragDot.bank][dragDot.i];
  if(smp && smp.rpm !== rpm){
    smp.rpm = rpm;
    dragDot.moved = true;
    markDirty();
    applyLive(false);
    renderTach();
    renderSlotPanel();
  }
});
addEventListener('pointerup', () => {
  if(dragDot && dragDot.moved) applyLive(true);   // riordina i crossfade
  dragDot = null;
});

// ------------------------------------------------ illustrazione motore
const HOTSPOTS = [
  {key: 'ignition',       kind: 'event', x: 352, y: 42,  icon: '🔑', label: 'ACCENSIONE'},
  {key: 'turbo',          kind: 'layer', x: 66,  y: 60,  icon: '🌀', label: 'TURBINA'},
  {key: 'blowoff',        kind: 'event', x: 130, y: 42,  icon: '💨', label: 'BLOW-OFF'},
  {key: 'limiter',        kind: 'layer', x: 352, y: 120, icon: '🟥', label: 'FUORIGIRI'},
  {key: 'shiftPop',       kind: 'event', x: 210, y: 208, icon: '⚙', label: 'POP CAMBIATA'},
  {key: 'gearWhinePower', kind: 'layer', x: 130, y: 208, icon: '🔩', label: 'TRASM. ON'},
  {key: 'gearWhineOff',   kind: 'layer', x: 290, y: 208, icon: '🔩', label: 'TRASM. OFF'},
  {key: 'backfire',       kind: 'event', x: 66,  y: 150, icon: '🔥', label: 'SCOPPIO'},
  {key: 'rev',            kind: 'event', x: 352, y: 178, icon: '🗲', label: 'REV'},
  // riga "asfalto": sgommate continue, sincronizzate con le skid mark del gioco
  {key: 'drift', kind: 'skid', x: 110, y: 262, icon: '🛞', label: 'DRIFT'},
  {key: 'brake', kind: 'skid', x: 210, y: 262, icon: '🛑', label: 'FRENATA'},
  {key: 'accel', kind: 'skid', x: 310, y: 262, icon: '🌪', label: 'WHEELSPIN'},
];
function hotspotSlot(work, kind, key){
  return kind === 'layer' ? work.layers[key] : kind === 'skid' ? (work.skids || {})[key] : work.events[key];
}
function hotspotStatus(status, kind, key){
  const pool = kind === 'layer' ? status.layers : kind === 'skid' ? status.skids : status.events;
  return (pool || {})[key];
}
function renderEngine(){
  const svg = $('#lksdEngine');
  const status = EA().slotStatus();
  let s = '';
  // blocco motore stilizzato
  s += `<rect x="150" y="60" width="140" height="120" rx="12" fill="#161d2c" stroke="#33405a" stroke-width="2"/>`;
  for(let i = 0; i < 4; i++) s += `<circle cx="${178 + i * 28}" cy="96" r="10" fill="#0d1220" stroke="#3a4666" stroke-width="2"/>`;
  s += `<rect x="162" y="126" width="116" height="38" rx="6" fill="#101726" stroke="#2b3446"/>`;
  s += `<text x="220" y="150" fill="#5c6a86" font-size="10" font-weight="900" text-anchor="middle" letter-spacing="2">ENGINE</text>`;
  // condotto turbo → motore, scarico motore → backfire
  s += `<path d="M 92 60 C 120 60 130 80 150 88" fill="none" stroke="#33405a" stroke-width="5" stroke-linecap="round"/>`;
  s += `<path d="M 150 150 C 120 150 110 150 92 150" fill="none" stroke="#33405a" stroke-width="6" stroke-linecap="round"/>`;
  s += `<path d="M 290 120 C 320 120 330 120 340 120" fill="none" stroke="#33405a" stroke-width="4" stroke-linecap="round" stroke-dasharray="3 5"/>`;
  s += `<path d="M 220 180 L 220 196" fill="none" stroke="#33405a" stroke-width="5" stroke-linecap="round"/>`;
  // asfalto con strisciate (riga sgommate)
  s += `<line x1="34" y1="302" x2="386" y2="302" stroke="#33405a" stroke-width="3" stroke-linecap="round"/>`;
  s += `<path d="M 62 302 C 80 296 96 300 118 297" fill="none" stroke="#20293c" stroke-width="4" stroke-linecap="round"/>`;
  s += `<path d="M 250 300 L 292 300" fill="none" stroke="#20293c" stroke-width="4" stroke-linecap="round" stroke-dasharray="9 6"/>`;
  s += `<text x="386" y="292" fill="#5c6a86" font-size="8.5" font-weight="900" text-anchor="end" letter-spacing="2">SGOMMATE</text>`;
  // hotspots
  for(const h of HOTSPOTS){
    const slot = hotspotStatus(status, h.kind, h.key);
    const st = slot ? slot.status : 'empty';
    const cfgSlot = hotspotSlot(work, h.kind, h.key);
    const enabled = cfgSlot && cfgSlot.enabled !== false;
    const isSel = selected.kind !== 'bank' && selected.key === h.key;
    s += `<g class="lksd-hot${isSel ? ' sel' : ''}" data-key="${h.key}" data-kind="${h.kind}" opacity="${enabled ? 1 : .45}">` +
      `<circle class="ring" cx="${h.x}" cy="${h.y}" r="22"/>` +
      `<text x="${h.x}" y="${h.y + 1}" font-size="16" text-anchor="middle" dominant-baseline="middle">${h.icon}</text>` +
      `<circle class="led" cx="${h.x + 15}" cy="${h.y - 15}" r="4.5" fill="${statusColor(st)}"/>` +
      `<text x="${h.x}" y="${h.y + 36}" fill="#8b93a7" font-size="8.5" font-weight="900" text-anchor="middle" letter-spacing="1">${h.label}</text>` +
      `</g>`;
  }
  svg.innerHTML = s;
  svg.querySelectorAll('.lksd-hot').forEach(g => {
    g.addEventListener('click', () => {
      selected = {kind: g.dataset.kind, key: g.dataset.key};
      renderSlotPanel();
      renderEngine();
      renderTach();
    });
  });
}

// ------------------------------------------------ pannelli parametri
function rowSlider(label, value, min, max, step, fmt, onChange){
  const row = document.createElement('div');
  row.className = 'lksd-row';
  row.innerHTML = `<label></label><input type="range"><output></output>`;
  row.querySelector('label').textContent = label;
  const inp = row.querySelector('input');
  const out = row.querySelector('output');
  inp.min = min; inp.max = max; inp.step = step; inp.value = value;
  out.value = fmt(value);
  inp.addEventListener('input', () => {
    const v = +inp.value;
    out.value = fmt(v);
    onChange(v);
    markDirty();
    applyLive(false);
    renderTach();
  });
  return row;
}
function rowFile(slot, structuralRefresh){
  const row = document.createElement('div');
  row.className = 'lksd-row';
  row.innerHTML = `<label>Sample</label><select></select>`;
  const sel = row.querySelector('select');
  for(const o of fileOptions(slot.src)) sel.appendChild(new Option(o.l, o.v, false, o.v === (slot.src || '')));
  sel.value = slot.src || '';
  sel.addEventListener('change', () => {
    if(sel.value === '__upload__'){
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'audio/*,.wav,.ogg,.mp3';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if(!f){ sel.value = slot.src || ''; return; }
        if(!window.LK_ASSET_BLOBS){ sel.value = slot.src || ''; return; }
        const key = 'sfx_' + Date.now().toString(36) + '_' + f.name.replace(/[^a-z0-9.]+/gi, '_');
        window.LK_ASSET_BLOBS.put(key, f).then(() => {
          slot.src = 'blob:' + key;
          markDirty();
          applyLive(true);
          renderAll();
        }).catch(() => { sel.value = slot.src || ''; });
      });
      inp.click();
      return;
    }
    slot.src = sel.value;
    markDirty();
    applyLive(true);
    if(structuralRefresh) structuralRefresh();
    renderAll();
  });
  return row;
}
function rowCheck(label, value, onChange){
  const l = document.createElement('label');
  l.className = 'lksd-check';
  l.innerHTML = `<input type="checkbox"><span></span>`;
  l.querySelector('span').textContent = label;
  const c = l.querySelector('input');
  c.checked = !!value;
  c.addEventListener('change', () => { onChange(c.checked); markDirty(); applyLive(false); renderEngine(); });
  return l;
}
function rowSelect(label, value, options, onChange){
  const row = document.createElement('div');
  row.className = 'lksd-row';
  row.innerHTML = `<label></label><select></select>`;
  row.querySelector('label').textContent = label;
  const sel = row.querySelector('select');
  for(const o of options) sel.appendChild(new Option(o.label, o.value, false, o.value === value));
  sel.value = value;
  sel.addEventListener('change', () => {
    onChange(sel.value);
    markDirty();
    applyLive(true);
    renderAll();
  });
  return row;
}
function ledRow(status){
  const wrap = document.createElement('div');
  wrap.className = 'lksd-slot-head';
  const texts = {ok: 'sample caricato', loading: 'caricamento…', error: 'ERRORE: file non caricabile → fallback sintetico', empty: 'slot vuoto → fallback sintetico', generated: 'fuorigiri generato dal motore'};
  wrap.innerHTML = `<span class="lksd-led ${status}"></span><span class="lksd-led-label">${texts[status] || status}</span>`;
  return wrap;
}
const pct = v => Math.round(v * 100) + '%';
const flt = d => v => (+v).toFixed(d);
const hz = v => v >= 15500 ? 'off' : (v >= 1000 ? (v / 1000).toFixed(1) + 'kHz' : Math.round(v) + 'Hz');

function renderSlotPanel(){
  const box = $('#lksdSlot');
  box.innerHTML = '';
  const status = EA().slotStatus();
  if(selected.kind === 'bank'){
    const bank = selected.bank;
    const list = work.banks[bank];
    const i = clamp(selected.index, 0, Math.max(0, list.length - 1));
    selected.index = i;
    const smp = list[i];
    $('#lksdSlotSecTitle').textContent = 'LOOP ' + bank.toUpperCase() + '-THROTTLE · #' + (i + 1);
    if(!smp){
      box.appendChild(Object.assign(document.createElement('div'), {className: 'lksd-hint', textContent: 'Nessun loop in questo banco. Aggiungine uno.'}));
    } else {
      const st = (status.banks[bank][i] || {}).status || 'empty';
      box.appendChild(ledRow(st));
      box.appendChild(rowFile(smp));
      const rpmRow = document.createElement('div');
      rpmRow.className = 'lksd-row';
      rpmRow.innerHTML = `<label>RPM registrazione</label><input type="number" min="500" max="9000" step="50">`;
      const rpmInp = rpmRow.querySelector('input');
      rpmInp.value = smp.rpm;
      rpmInp.addEventListener('change', () => {
        smp.rpm = clamp(+rpmInp.value || 2000, 500, 9000);
        markDirty(); applyLive(true); renderTach();
      });
      box.appendChild(rpmRow);
      box.appendChild(rowSlider('Volume', smp.volume == null ? 1 : smp.volume, 0, 1.5, .01, pct, v => { smp.volume = v; }));
      box.appendChild(rowSlider('Pitch track', smp.pitchTrack == null ? 1 : smp.pitchTrack, 0, 1, .01, pct, v => { smp.pitchTrack = v; }));
    }
    const btns = document.createElement('div');
    btns.className = 'lksd-btnrow';
    const addB = document.createElement('button');
    addB.textContent = '＋ Aggiungi loop ' + bank.toUpperCase();
    addB.addEventListener('click', () => {
      if(list.length >= 6) return;
      list.push({src: '', rpm: 3500, volume: 1});
      selected.index = list.length - 1;
      markDirty(); applyLive(true); renderAll();
    });
    btns.appendChild(addB);
    if(smp){
      const delB = document.createElement('button');
      delB.className = 'warn';
      delB.textContent = '🗑 Rimuovi questo loop';
      delB.addEventListener('click', () => {
        list.splice(i, 1);
        selected.index = Math.max(0, i - 1);
        markDirty(); applyLive(true); renderAll();
      });
      btns.appendChild(delB);
      const testB = document.createElement('button');
      testB.textContent = '▶ Porta il tester qui';
      testB.addEventListener('click', () => { testRpm = smp.rpm; $('#lksdRpm').value = testRpm; });
      btns.appendChild(testB);
    }
    box.appendChild(btns);
    const hint = document.createElement('div');
    hint.className = 'lksd-hint';
    hint.textContent = 'Il banco ON suona col gas aperto, il banco OFF in rilascio: il mix segue il pedale. Tra un punto e il vicino il suono e\' un crossfade constant-power.';
    box.appendChild(hint);
    return;
  }
  // sgommate (canali continui, la durata segue lo slittamento reale)
  if(selected.kind === 'skid'){
    const key = selected.key;
    const hs = HOTSPOTS.find(h => h.kind === 'skid' && h.key === key) || {label: key};
    const slot = (work.skids || {})[key];
    $('#lksdSlotSecTitle').textContent = 'SGOMMATA · ' + hs.label;
    if(!slot){ box.appendChild(Object.assign(document.createElement('div'), {className: 'lksd-hint', textContent: 'Slot non presente nel set.'})); return; }
    box.appendChild(ledRow(((status.skids || {})[key] || {}).status || 'empty'));
    box.appendChild(rowCheck('Attivo', slot.enabled !== false, v => { slot.enabled = v; }));
    box.appendChild(rowFile(slot));
    box.appendChild(rowSlider('Volume', slot.volume == null ? 1 : slot.volume, 0, 1.5, .01, pct, v => { slot.volume = v; }));
    box.appendChild(rowSlider('Pitch', slot.pitch == null ? 1 : slot.pitch, .5, 2, .01, flt(2), v => { slot.pitch = v; }));
    box.appendChild(rowSlider('Filtro lowpass', slot.tone == null ? 16000 : slot.tone, 500, 16000, 100, hz, v => { slot.tone = v; }));
    box.appendChild(rowSlider('Attack (s)', slot.attack == null ? .06 : slot.attack, .02, .5, .01, flt(2), v => { slot.attack = v; }));
    box.appendChild(rowSlider('Release (s)', slot.release == null ? .25 : slot.release, .02, 1.5, .01, flt(2), v => { slot.release = v; }));
    const btns = document.createElement('div');
    btns.className = 'lksd-btnrow';
    const testB = document.createElement('button');
    testB.textContent = '▶ Test (1.4s)';
    testB.addEventListener('click', () => EA().trigger('skid' + key.charAt(0).toUpperCase() + key.slice(1)));
    btns.appendChild(testB);
    box.appendChild(btns);
    const skidHints = {
      drift: 'Suona in derapata e col freno a mano: parte e finisce con le skid mark. Attack/release regolano quanto e\' reattivo l\'inviluppo.',
      brake: 'Staccata violenta a ruote bloccate: il volume ha un leggero "judder" ritmico da frenata. Sincronizzato con le strisciate anche delle anteriori.',
      accel: 'Wheelspin in accelerazione da fermo: il pitch sale col livello di slittamento (le gomme che "urlano" alla partenza).',
    };
    const h = document.createElement('div');
    h.className = 'lksd-hint';
    h.textContent = skidHints[key] || '';
    box.appendChild(h);
    return;
  }
  // layer / evento
  const key = selected.key;
  const hs = HOTSPOTS.find(h => h.key === key) || {label: key};
  const isLayer = selected.kind === 'layer';
  const slot = isLayer ? work.layers[key] : work.events[key];
  $('#lksdSlotSecTitle').textContent = (isLayer ? 'LAYER · ' : 'EVENTO · ') + hs.label;
  if(!slot){ box.appendChild(Object.assign(document.createElement('div'), {className: 'lksd-hint', textContent: 'Slot non presente nel set.'})); return; }
  const stMap = isLayer ? status.layers : status.events;
  const limiterGenerated = key === 'limiter' && (slot.mode || (slot.src ? 'sample' : 'generated')) === 'generated';
  box.appendChild(ledRow(limiterGenerated ? 'generated' : ((stMap[key] || {}).status || 'empty')));
  box.appendChild(rowCheck('Attivo', slot.enabled !== false, v => { slot.enabled = v; }));
  if(key === 'limiter'){
    const mode = slot.mode || (slot.src ? 'sample' : 'generated');
    slot.mode = mode;
    box.appendChild(rowSelect('Tipo fuorigiri', mode, [
      {value: 'generated', label: 'Generato dal motore'},
      {value: 'sample', label: 'Sample WAV'},
    ], v => { slot.mode = v; }));
    if(mode === 'sample') box.appendChild(rowFile(slot));
  } else {
    box.appendChild(rowFile(slot));
  }
  box.appendChild(rowSlider('Volume', slot.volume == null ? 1 : slot.volume, 0, 1.5, .01, pct, v => { slot.volume = v; }));
  box.appendChild(rowSlider('Filtro lowpass', slot.tone == null ? 16000 : slot.tone, 500, 16000, 100, hz, v => { slot.tone = v; }));
  if(isLayer && key !== 'limiter'){
    box.appendChild(rowSlider('Sin mod (Hz)', slot.wobbleRate || 0, 0, 20, .1, flt(1), v => { slot.wobbleRate = v; }));
    box.appendChild(rowSlider('Sin mod depth', slot.wobbleDepth || 0, 0, 1, .01, pct, v => { slot.wobbleDepth = v; }));
  }
  if(key === 'limiter'){
    if((slot.mode || 'generated') === 'sample'){
      box.appendChild(rowSlider('Velocita\' sample', slot.rate == null ? 1 : slot.rate, .4, 1.6, .01, flt(2), v => { slot.rate = v; }));
    }
    box.appendChild(rowSlider('Stutter (Hz)', slot.stutterRate == null ? 10 : slot.stutterRate, 3, 20, .5, flt(1), v => { slot.stutterRate = v; }));
    box.appendChild(rowSlider('Stutter depth', slot.stutterDepth == null ? ((slot.mode || 'generated') === 'generated' ? .62 : 0) : slot.stutterDepth, 0, 1, .01, pct, v => { slot.stutterDepth = v; }));
    if((slot.mode || 'generated') === 'generated'){
      box.appendChild(rowSlider('Pitch bounce', slot.pitchBounce == null ? .34 : slot.pitchBounce, 0, 1, .01, pct, v => { slot.pitchBounce = v; }));
      box.appendChild(rowSlider('Filtro pulse', slot.tonePulse == null ? .28 : slot.tonePulse, 0, 1, .01, pct, v => { slot.tonePulse = v; }));
    }
  }
  if(!isLayer){
    box.appendChild(rowSlider('Pitch', slot.pitch == null ? 1 : slot.pitch, .5, 2, .01, flt(2), v => { slot.pitch = v; }));
    if(slot.pitchRandom != null || ['shiftPop', 'backfire', 'blowoff'].includes(key))
      box.appendChild(rowSlider('Pitch random ±', slot.pitchRandom || 0, 0, .5, .01, pct, v => { slot.pitchRandom = v; }));
    if(slot.probability != null)
      box.appendChild(rowSlider('Probabilita\'', slot.probability, 0, 1, .05, pct, v => { slot.probability = v; }));
    if(slot.cooldown != null)
      box.appendChild(rowSlider('Cooldown (s)', slot.cooldown, 0, 3, .05, flt(2), v => { slot.cooldown = v; }));
    if(key === 'blowoff')
      box.appendChild(rowSlider('Boost minimo', slot.minBoost == null ? .45 : slot.minBoost, 0, 1, .05, pct, v => { slot.minBoost = v; }));
  } else if(key === 'turbo'){
    box.appendChild(rowSlider('Pitch min', slot.pitchMin == null ? .55 : slot.pitchMin, .2, 1.5, .01, flt(2), v => { slot.pitchMin = v; }));
    box.appendChild(rowSlider('Pitch max', slot.pitchMax == null ? 1.6 : slot.pitchMax, .5, 3, .01, flt(2), v => { slot.pitchMax = v; }));
    box.appendChild(rowSlider('Attack (s)', slot.attack == null ? .3 : slot.attack, .02, 1.5, .01, flt(2), v => { slot.attack = v; }));
    box.appendChild(rowSlider('Release (s)', slot.release == null ? .5 : slot.release, .02, 2, .01, flt(2), v => { slot.release = v; }));
  }
  const btns = document.createElement('div');
  btns.className = 'lksd-btnrow';
  if(!isLayer || key === 'limiter' || key === 'turbo'){
    const testB = document.createElement('button');
    testB.textContent = '▶ Test';
    const evName = isLayer ? (key === 'limiter' ? 'limiter' : null) : key;
    testB.addEventListener('click', () => {
      if(key === 'turbo'){ gasPulse(); return; }
      if(key === 'limiter'){ limiterPulse(); return; }
      if(evName) EA().trigger(evName);
    });
    btns.appendChild(testB);
  }
  box.appendChild(btns);
  const hints = {
    turbo: 'Il fischio segue il boost (gas x giri). Attack = quanto in fretta carica, release = quanto canta al rilascio. Tieni GAS e rilascia per sentire anche il blow-off.',
    limiter: 'Sample WAV usa un file dedicato. Generato dal motore usa invece i loop del motore al massimo dei giri e aggiunge taglio ritmico, micro pitch bounce e filtro pulse per simulare il fuorigiri senza caricare un audio extra.',
    shiftPop: 'Triggherato a ogni cambiata (con probabilita\'). Il pitch random evita che due pop siano identici.',
    backfire: 'Scoppio allo scarico: cambiata e fuorigiri. Coordinato con l\'effetto fuoco del veicolo.',
    blowoff: 'Sfiato turbina al rilascio del gas sopra il boost minimo. Attivo solo se la turbina e\' abilitata.',
    ignition: 'Suona all\'avvio della sessione, prima che i loop entrino.',
    rev: 'Sgasata one-shot, utile anche come suono "showoff".',
    gearWhinePower: 'Fischio trasmissione sotto carico: volume legato a gas + velocita\'.',
    gearWhineOff: 'Fischio trasmissione in rilascio: volume legato a velocita\' senza gas.',
  };
  if(hints[key]){
    const h = document.createElement('div');
    h.className = 'lksd-hint';
    h.textContent = hints[key];
    box.appendChild(h);
  }
}
function renderMasterPanel(){
  const box = $('#lksdMaster');
  box.innerHTML = '';
  box.appendChild(rowSlider('Volume set', work.master.volume, 0, 1.5, .01, pct, v => { work.master.volume = v; }));
  box.appendChild(rowSlider('Pitch globale', work.master.pitchShift == null ? 1 : work.master.pitchShift, .6, 1.6, .01, flt(2), v => { work.master.pitchShift = v; }));
  box.appendChild(rowSlider('Riverbero', work.master.reverb == null ? .12 : work.master.reverb, 0, .6, .01, pct, v => { work.master.reverb = v; }));
  const decayRow = rowSlider('Coda riverbero (s)', work.master.reverbDecay == null ? 1.4 : work.master.reverbDecay, .3, 4, .1, flt(1), v => { work.master.reverbDecay = v; });
  decayRow.querySelector('input').addEventListener('change', () => applyLive(true));   // nuova impulse response
  box.appendChild(decayRow);
  box.appendChild(rowSlider('Taglio bassi', work.master.toneLow == null ? 0 : work.master.toneLow, 0, 400, 5, v => v < 15 ? 'off' : Math.round(v) + 'Hz', v => { work.master.toneLow = v; }));
  box.appendChild(rowSlider('Taglio alti', work.master.toneHigh == null ? 16000 : work.master.toneHigh, 1000, 16000, 100, hz, v => { work.master.toneHigh = v; }));
  box.appendChild(rowSlider('Fade tra loop', work.bankParams.fadeWidth == null ? .55 : work.bankParams.fadeWidth, .1, 1, .01, pct, v => { work.bankParams.fadeWidth = v; }));
  box.appendChild(rowSlider('Risposta gas', work.bankParams.throttleSmooth == null ? 7 : work.bankParams.throttleSmooth, 2, 16, .5, flt(1), v => { work.bankParams.throttleSmooth = v; }));
  box.appendChild(rowSlider('Fluidita\' giri', work.bankParams.rpmSmooth == null ? 16 : work.bankParams.rpmSmooth, 4, 40, 1, flt(0), v => { work.bankParams.rpmSmooth = v; }));
  box.appendChild(rowSlider('Volume rilascio', work.bankParams.offVolume == null ? 1 : work.bankParams.offVolume, 0, 1.3, .01, pct, v => { work.bankParams.offVolume = v; }));
}
function renderAll(){
  renderTach();
  renderEngine();
  renderSlotPanel();
  renderMasterPanel();
}

// ------------------------------------------------ tester loop
function gasPulse(){
  gasHeld = true;
  setTimeout(() => { gasHeld = false; }, 900);
}
function limiterPulse(){
  const gb = EA().gearbox;
  testRpm = gb.limiter;
  $('#lksdRpm').value = testRpm;
  gasHeld = true;
  ramp = {t: 0, mode: 'limiter'};
  EA().trigger('limiter');
}
function testerFrame(now){
  rafId = requestAnimationFrame(testerFrame);
  const dt = Math.min(.05, (now - lastT) / 1000 || .016);
  lastT = now;
  const gb = EA().gearbox;
  if(ramp && ramp.mode === 'decel'){
    ramp.t += dt;
    gasHeld = false;
    testRpm = Math.max(gb.idle, ramp.from - (ramp.from - gb.idle) * (ramp.t / 3));
    if(testRpm <= gb.idle + 5) ramp = null;
    $('#lksdRpm').value = testRpm;
  } else if(ramp && ramp.mode === 'limiter'){
    ramp.t += dt;
    gasHeld = ramp.t < 1.35;
    const pulse = Math.max(0, 1 - ramp.t / 1.35);
    testRpm = gb.limiter - 120 * (1 - Math.sin(ramp.t * Math.PI * 16) * .5 - .5) * pulse;
    if(ramp.t >= 1.35){ ramp = null; gasHeld = false; }
    $('#lksdRpm').value = testRpm;
  } else if(ramp){
    ramp.t += dt;
    if(ramp.t < 3){ testRpm = gb.idle + (gb.limiter - gb.idle) * (ramp.t / 3); gasHeld = true; }
    else if(ramp.t < 4){ gasHeld = true; EA().setManual({rpm: testRpm, throttle: 1, limiter: true}); }
    else if(ramp.t < 6.5){ gasHeld = false; testRpm = Math.max(gb.idle, testRpm - (gb.limiter - gb.idle) * dt / 2.2); }
    else { ramp = null; }
    $('#lksdRpm').value = testRpm;
  } else if(autoRpm){
    // mini-fisica del tester: gas = salgono, rilascio = scendono (freno motore)
    if(gasHeld) testRpm = Math.min(gb.limiter, testRpm + (gb.limiter - gb.idle) * dt / 2.6);
    else testRpm = Math.max(gb.idle, testRpm - (gb.limiter - gb.idle) * dt / 3.2);
    $('#lksdRpm').value = testRpm;
  }
  const onLimiter = autoRpm && gasHeld && testRpm >= gb.limiter - 60;
  if(ramp && ramp.mode === 'limiter'){
    EA().setManual({rpm: testRpm, throttle: gasHeld ? 1 : 0, limiter: gasHeld});
  } else if(!ramp || ramp.mode === 'decel' || ramp.t >= 4 || ramp.t < 3){
    EA().setManual({rpm: testRpm, throttle: gasHeld ? 1 : 0, limiter: onLimiter});
  }
  EA().update(dt);
  $('#lksdRpmVal').textContent = String(Math.round(testRpm));
  const boostTarget = work && work.layers.turbo && work.layers.turbo.enabled
    ? clamp((gasHeld ? 1 : 0) * (testRpm / gb.redline), 0, 1) : 0;
  boostVis += (boostTarget - boostVis) * Math.min(1, dt * 3);
  $('#lksdBoost').style.width = Math.round(boostVis * 100) + '%';
  // needle live
  const svg = $('#lksdTach');
  if(svg.isConnected && !dragDot) renderNeedleOnly();
}
let needleTick = 0;
function renderNeedleOnly(){
  if(++needleTick % 3) return;   // 20fps bastano per la lancetta
  renderTach();
}

// ------------------------------------------------ header wiring
function refreshSetSelect(){
  const sel = $('#lksdSet');
  sel.innerHTML = '';
  for(const s of STORE.soundSets.list()) sel.appendChild(new Option(s.name, s.id, false, work && s.id === work.id));
}
function confirmDesignerAction(opts){
  return window.LK_EDITOR_CONFIRM ? window.LK_EDITOR_CONFIRM(opts) : Promise.resolve(false);
}
function loadSet(id){
  const set = STORE.soundSets.get(id) || EA().defaultSet();
  work = JSON.parse(JSON.stringify(set));
  if(!work.skids) work.skids = JSON.parse(JSON.stringify(EA().defaultSet().skids));   // set salvati prima degli slot sgommata
  selected = {kind: 'bank', bank: 'on', index: 0};
  clearDirty();
  $('#lksdName').value = work.name || '';
  refreshSetSelect();
  EA().setConfig(work);
  EA().start({silent: true});
  renderAll();
}
$('#lksdSet').addEventListener('change', async e => {
  if(dirty){
    const ok = await confirmDesignerAction({
      title:'Discard sound changes?',
      message:'Modifiche non salvate al set corrente: verranno perse. Continuare?',
      okText:'Continue',
      danger:false,
    });
    if(!ok){
      refreshSetSelect();
      return;
    }
  }
  loadSet(e.target.value);
});
$('#lksdName').addEventListener('change', e => {
  if(!work) return;
  work.name = e.target.value.trim() || work.name;
  markDirty();
});
$('#lksdSave').addEventListener('click', saveSet);
function saveSet(){
  if(!work) return;
  work.name = $('#lksdName').value.trim() || work.name;
  if(!STORE.soundSets.save(work)) return;
  clearDirty();
  refreshSetSelect();
  // se e' il set del veicolo, riapplica la versione salvata
  if(GAME.player.engineAudio && GAME.player.engineAudio.setId === work.id) GAME.player.setEngineSound(work.id);
  EA().setConfig(work);
}
$('#lksdDup').addEventListener('click', () => {
  if(!work) return;
  const id = STORE.soundSets.duplicate(work.id);
  if(id) loadSet(id);
});
$('#lksdAssign').addEventListener('click', () => {
  if(!work) return;
  saveSet();
  GAME.player.setEngineSound(work.id);
  EA().setConfig(work);   // il designer resta in preview sul set aperto
  $('#lksdAssign').textContent = '✓ Assegnato';
  setTimeout(() => { $('#lksdAssign').textContent = '🚗 Assegna al veicolo'; }, 1200);
});
$('#lksdClose').addEventListener('click', close);
root.addEventListener('pointerdown', e => { if(e.target === root) close(); });
addEventListener('keydown', e => {
  if(!root.classList.contains('open')) return;
  if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); close(); }
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); e.stopPropagation(); saveSet(); }
}, true);

// tester wiring
$('#lksdRpm').addEventListener('input', e => { testRpm = +e.target.value; ramp = null; });
const gasBtn = $('#lksdGas');
gasBtn.addEventListener('pointerdown', () => { gasHeld = true; gasBtn.classList.add('on'); });
addEventListener('pointerup', () => { gasHeld = false; gasBtn.classList.remove('on'); });
$('#lksdRamp').addEventListener('click', () => { ramp = {t: 0}; });
$('#lksdDecel').addEventListener('click', () => {
  const gb = EA().gearbox;
  ramp = {t: 0, mode: 'decel', from: Math.max(testRpm, gb.redline * .92)};
});
$('#lksdAuto').addEventListener('click', () => {
  autoRpm = !autoRpm;
  $('#lksdAuto').style.borderColor = autoRpm ? '#4be3a0' : '';
  $('#lksdAuto').style.color = autoRpm ? '#4be3a0' : '';
});
$('#lksdLim').addEventListener('click', limiterPulse);
root.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => EA().trigger(b.dataset.ev)));

// ------------------------------------------------ open / close
function open(setId){
  if(GAME.systems.audio && GAME.systems.audio.init) GAME.systems.audio.init();
  const list = STORE.soundSets.list();
  const id = setId || (GAME.player.engineAudio && GAME.player.engineAudio.setId) || (list[0] && list[0].id);
  root.classList.add('open');
  testRpm = EA().gearbox.idle;
  $('#lksdRpm').value = testRpm;
  loadSet(id);
  EA().setStatusListener(() => { if(root.classList.contains('open')){ renderTach(); renderEngine(); renderSlotPanel(); } });
  lastT = performance.now();
  if(!rafId) rafId = requestAnimationFrame(testerFrame);
}
async function close(){
  if(dirty){
    const ok = await confirmDesignerAction({
      title:'Close Sound Designer?',
      message:'Chiudere senza salvare le modifiche al sound set?',
      okText:'Close',
      danger:false,
    });
    if(!ok) return;
  }
  root.classList.remove('open');
  if(rafId){ cancelAnimationFrame(rafId); rafId = null; }
  EA().setManual(null);
  EA().setStatusListener(null);
  // ripristina il set assegnato al veicolo (o nessuno)
  const assigned = GAME.player.engineAudio && GAME.player.engineAudio.setId;
  GAME.player.setEngineSound(assigned || null);
  if(!GAME.state.started) EA().stop();
}

window.LK_SOUND_DESIGNER = {open, close};
})();
