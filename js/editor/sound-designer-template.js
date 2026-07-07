/* =========================================================
   LOT KING - SOUND DESIGNER TEMPLATE
   Static styles and DOM shell for the engine sound designer.
   ========================================================= */
(function(){
'use strict';

if(window.LK_SOUND_DESIGNER_TEMPLATE) return;

const CSS = `
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

function installStyles(){
  if(document.querySelector('style[data-lksd-template]')) return;
  const css = document.createElement('style');
  css.dataset.lksdTemplate = '1';
  css.textContent = CSS;
  document.head.appendChild(css);
}

function createRoot(rpmMin, rpmMax){
  const root = document.createElement('div');
  root.id = 'lksd';
  root.innerHTML = `
  <div class="lksd-panel">
    <div class="lksd-head">
      <span class="lksd-title">🎛 ENGINE SOUND DESIGNER</span>
      <select id="lksdSet" title="Sound set"></select>
      <input id="lksdName" type="text" title="Set name">
      <span id="lksdDirty" class="lksd-dirty" title="Unsaved changes">●</span>
      <span class="lksd-spacer"></span>
      <button id="lksdAssign" title="Assign this set to the player vehicle">🚗 Assign to vehicle</button>
      <button id="lksdDup" title="Duplicate set">⧉</button>
      <button id="lksdSave" class="lksd-save" title="Save set [Ctrl+S]">💾 Save set</button>
      <button id="lksdClose" class="lksd-x" title="Close [Esc]">×</button>
    </div>
    <div class="lksd-body">
      <div class="lksd-left">
        <div class="lksd-sec">
          <div class="lksd-sec-title">RPM LOOP BANKS · drag points on the arc</div>
          <svg id="lksdTach" width="420" height="300" viewBox="0 0 420 300"></svg>
          <div class="lksd-legend">
            <span class="on"><b>●</b> ON throttle</span>
            <span class="off"><b>●</b> OFF throttle</span>
          </div>
        </div>
        <div class="lksd-sec">
          <div class="lksd-sec-title">ENGINE · click a hotspot</div>
          <svg id="lksdEngine" width="420" height="312" viewBox="0 0 420 312"></svg>
        </div>
      </div>
      <div class="lksd-right">
        <div class="lksd-sec">
          <div class="lksd-sec-title" id="lksdSlotSecTitle">SELECTED SLOT</div>
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
      <input id="lksdRpm" type="range" min="${rpmMin}" max="${rpmMax}" step="10" value="950">
      <button id="lksdAuto" title="AUTO RPM: with GAS, revs climb automatically; on release they drop">⛭ AUTO</button>
      <button id="lksdGas" class="hold" title="Hold: open throttle (ON bank)">⛽ GAS</button>
      <button id="lksdRamp" title="Automatic ramp idle → limiter → release">▶ RAMP</button>
      <button id="lksdDecel" title="Release only: high revs → idle without gas (OFF bank)">▼ RELEASE</button>
      <button id="lksdLim" title="Test fuorigiri / limitatore">🟥 LIMITER</button>
      <button data-ev="ignition" title="Test ignition">🔑</button>
      <button data-ev="shiftPop" title="Test shift pop">⚙💥</button>
      <button data-ev="blowoff" title="Test turbo blow-off">💨</button>
      <button data-ev="backfire" title="Test backfire">🔥</button>
      <button data-ev="rev" title="Test rev">🗲 REV</button>
      <button data-ev="skidDrift" title="Test drift skid">🛞</button>
      <button data-ev="skidBrake" title="Test brake skid">🛞🛑</button>
      <button data-ev="skidAccel" title="Test wheelspin">🛞🌪</button>
      <div class="lksd-boost" title="Simulated turbo boost"><i id="lksdBoost"></i></div>
    </div>
  </div>`;
  return root;
}

window.LK_SOUND_DESIGNER_TEMPLATE = Object.freeze({
  installStyles,
  createRoot,
});
})();
