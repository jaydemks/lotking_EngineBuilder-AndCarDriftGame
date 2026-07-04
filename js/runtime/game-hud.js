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
  let popupTimer = null;

  function popup(txt, color){
    if(!popupEl) return;
    popupEl.textContent = txt;
    popupEl.style.color = color || '#fff';
    popupEl.classList.add('show');
    clearTimeout(popupTimer);
    popupTimer = setTimeout(() => popupEl.classList.remove('show'), 900);
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

  return {popup, setTotal, showDrift, hideDrift, setSpeedGear};
}

window.LK_RUNTIME_GAME_HUD = Object.freeze({create});
})();
