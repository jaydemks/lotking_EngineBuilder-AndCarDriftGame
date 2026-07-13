/* =========================================================
   LOT KING - gameplay HUD runtime module
   DOM-only HUD helpers for score, drift popup, speed and gear.
   ========================================================= */
(function(){
'use strict';

function byId(id){ return document.getElementById(id); }

function create(){
  const total = byId('totalScore');
  const driftBox = byId('driftBox');
  const driftPts = byId('driftPts');
  const driftMult = byId('driftMult');
  const popupEl = byId('popup');
  const kmh = byId('kmh');
  const gear = byId('gearHud');
  const root = byId('hud');
  const vehicle = byId('vehicleHud');
  const kmh2 = byId('kmh2');
  const gear2 = byId('gearHud2');
  const rpmHud = byId('rpmHud');
  const rpmBar = byId('rpmBar');
  const driveType = byId('driveTypeHud');
  let popupTimer = null;
  let activePlayerId = 1;
  const vehicleByPlayer = new Map();

  function popup(txt, color, duration){
    if(!popupEl) return;
    popupEl.textContent = txt;
    popupEl.style.color = color || '#fff';
    popupEl.classList.add('show');
    clearTimeout(popupTimer);
    popupTimer = setTimeout(() => popupEl.classList.remove('show'), Math.max(250, Number(duration) || 900));
  }

  function setTotal(value){
    if(total) total.textContent = Math.round(value || 0).toLocaleString();
  }

  function showDrift(score, mult){
    if(driftBox) driftBox.classList.add('on');
    if(driftPts) driftPts.textContent = '+' + Math.round(score || 0);
    if(driftMult) driftMult.textContent = 'x' + (mult || 1);
  }

  function hideDrift(){
    if(driftBox) driftBox.classList.remove('on');
  }

  function setSpeedGear(speed, gearLabel){
    if(kmh) kmh.textContent = Math.round(speed || 0);
    if(gear) gear.textContent = gearLabel == null ? '1' : String(gearLabel);
  }

  function setActivePlayer(playerId){
    activePlayerId = Math.max(1, Math.min(4, Number(playerId) || 1));
    if(root) root.dataset.playerId = String(activePlayerId);
    renderVehicleData();
  }

  function renderVehicleData(){
    const data = vehicleByPlayer.get(activePlayerId);
    if(!data) return;
    const mode = String(data.mode || 'custom').toLowerCase();
    setSpeedGear(data.speedKmh, data.gearLabel);
    if(vehicle){
      vehicle.dataset.playerId = String(activePlayerId);
      vehicle.classList.toggle('race', mode === 'race');
      vehicle.classList.toggle('custom', mode !== 'race' && mode !== 'drift');
    }
    if(kmh2) kmh2.textContent = String(Math.max(0, Math.round(data.speedKmh || 0)));
    if(gear2) gear2.textContent = data.gearLabel == null ? '1' : String(data.gearLabel);
    if(rpmHud) rpmHud.textContent = String(Math.round(data.rpm || 0));
    if(rpmBar) rpmBar.style.width = (Math.max(0, Math.min(1, Number(data.rpm01) || 0)) * 100).toFixed(1) + '%';
    if(driveType) driveType.textContent = mode === 'race' ? 'RACE' : (mode === 'drift' ? 'DRIFT' : 'CUSTOM');
  }

  function setVehicleData(playerId, data){
    const id = Math.max(1, Math.min(4, Number(playerId) || 1));
    vehicleByPlayer.set(id, Object.assign({}, data));
    if(id === activePlayerId) renderVehicleData();
  }

  setActivePlayer(1);
  return {popup, setTotal, showDrift, hideDrift, setSpeedGear, setActivePlayer, setVehicleData, activePlayer:() => activePlayerId};
}

window.LK_RUNTIME_GAME_HUD = Object.freeze({create});
})();
