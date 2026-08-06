/* =========================================================
   LOT KING - gameplay HUD runtime module
   DOM-only HUD helpers for score, drift popup, speed and gear.
   ========================================================= */
(function(){
'use strict';

// Charge window where the strike is cleanest; the meter marks it and the
// sweet-spot tick is positioned from the same two numbers.
const SWEET_MIN = .62, SWEET_MAX = .88;

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
  const soccer = byId('soccerHud');
  const soccerMode = byId('soccerModeHud');
  const soccerScoreA = byId('soccerScoreA');
  const soccerScoreB = byId('soccerScoreB');
  const soccerRound = byId('soccerRoundHud');
  const soccerPhase = byId('soccerPhaseHud');
  const soccerResult = byId('soccerResultHud');
  const soccerKicksA = byId('soccerKicksA');
  const soccerKicksB = byId('soccerKicksB');
  const soccerShotMeter = byId('soccerShotMeter');
  const soccerShotPower = byId('soccerShotPower');
  const soccerShotAim = byId('soccerShotAim');
  const soccerShotHeight = byId('soccerShotHeight');
  const soccerShotCurve = byId('soccerShotCurve');
  const soccerAimReticle = byId('soccerAimReticle');
  const legendTitle = byId('legendTitle');
  const legendBody = byId('legendBody');
  const tuneDock = byId('tuneDock');
  const tuneOpen = byId('openGameplayTune');
  let popupTimer = null;
  let activePlayerId = 1;
  let activeContext = '';
  let lastPenaltyResultSequence = 0;
  const vehicleByPlayer = new Map();
  const VEHICLE_CONTROLS = '<b>W A S D / arrows</b> drive · <b>SPACE</b> handbrake (drift)<br><b>Mouse / RS</b> free look · <b>Scroll</b> zoom · <b>V / B</b> look back · <b>C / R3</b> camera · <b>R / L3</b> reset<br><b>TAB / View</b> radio · <b>U / D-pad up</b> driving setup · <b>ESC / Start</b> menu · <b>H</b> help';
  const SOCCER_CONTROLS = '<b>W A S D / arrows</b> move · <b>Shift</b> sprint · <b>Space</b> jump<br><b>Hold F / LMB / X</b> charge (slow motion) · <b>Mouse / right stick</b> aim height and corner<br><b>Q / E</b> curve left / right while charging · <b>release</b> to strike · <b>G</b> pass · <b>C</b> tackle<br><b>B / R3</b> camera · <b>H</b> help';
  const CHARACTER_CONTROLS = '<b>W A S D / arrows</b> move · <b>Shift</b> sprint · <b>Space</b> jump · <b>F / X</b> interact<br><b>Mouse / RS</b> look around · <b>Scroll</b> zoom · <b>C / R3</b> camera<br><b>ESC / Start</b> menu · <b>H</b> help';

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

  function setContext(value){
    const context = value === 'soccer'
      ? 'soccer'
      : (value === 'character' ? 'character' : (value === 'vehicle' ? 'vehicle' : 'none'));
    if(context === activeContext) return context;
    activeContext = context;
    if(root) root.dataset.context = context;
    if(tuneDock && context !== 'vehicle') tuneDock.classList.remove('open');
    if(tuneOpen) tuneOpen.hidden = context !== 'vehicle';
    if(legendTitle) legendTitle.textContent = (context === 'soccer' ? 'FOOTBALL CONTROLS' : (context === 'character' ? 'CHARACTER CONTROLS' : 'DRIVING CONTROLS')) + ' · [H]';
    if(legendBody) legendBody.innerHTML = context === 'soccer' ? SOCCER_CONTROLS : (context === 'character' ? CHARACTER_CONTROLS : VEHICLE_CONTROLS);
    return context;
  }

  function setSoccerData(data){
    const value = data || {};
    const shootout = value.shootout === true;
    if(soccerMode) soccerMode.textContent = shootout ? 'PENALTY SHOOTOUT' : 'FOOTBALL';
    if(soccerScoreA) soccerScoreA.textContent = String(Math.max(0, Number(value.scoreA) || 0));
    if(soccerScoreB) soccerScoreB.textContent = String(Math.max(0, Number(value.scoreB) || 0));
    if(soccerRound) soccerRound.textContent = shootout ? ('ROUND ' + Math.max(1, Number(value.round) || 1)) : String(value.role || 'PLAYER').toUpperCase();
    if(soccerPhase) soccerPhase.textContent = shootout ? String(value.phase || 'ready').toUpperCase() : String(value.action || 'PLAY').toUpperCase();
    const result=String(value.lastResult||'');
    const resultLabel=result==='goal'?'GOAL!':(result==='saved'?'SAVED!':(result==='miss'?'MISSED':''));
    if(soccerResult){soccerResult.textContent=resultLabel;soccerResult.dataset.result=result;}
    const renderKicks=(node,values)=>{
      if(!node)return;node.innerHTML='';
      (Array.isArray(values)?values:[]).forEach(outcome=>{const mark=document.createElement('i');mark.dataset.result=String(outcome);mark.textContent=outcome==='goal'?'●':'×';mark.title=outcome==='goal'?'Goal':(outcome==='saved'?'Saved':'Missed');node.appendChild(mark);});
    };
    renderKicks(soccerKicksA,value.kicksA);renderKicks(soccerKicksB,value.kicksB);
    const sequence=Math.max(0,Number(value.resultSequence)||0);
    if(shootout&&resultLabel&&sequence>lastPenaltyResultSequence){
      lastPenaltyResultSequence=sequence;
      popup(resultLabel,result==='goal'?'#7bf0b3':(result==='saved'?'#ffd166':'#ff667d'),1650);
    }
    if(soccer) soccer.dataset.phase = String(value.phase || '');
    const charging=value.charge!=null,showReticle=(charging||value.aiming===true)&&value.aimReticle!==false;
    const charge01=Math.max(0,Math.min(1,Number(value.charge)||0));
    if(soccerShotMeter){
      soccerShotMeter.classList.toggle('on',charging);
      // The bar turns as it fills so power reads at a glance without looking
      // away from the goal, and marks when the strike is at its cleanest.
      soccerShotMeter.dataset.power=charge01>=SWEET_MIN&&charge01<=SWEET_MAX?'sweet':(charge01>SWEET_MAX?'over':'low');
      soccerShotMeter.classList.toggle('slowmo',value.slowMotion===true);
    }
    if(soccerShotPower)soccerShotPower.style.width=(charge01*100).toFixed(1)+'%';
    if(soccerShotAim)soccerShotAim.style.left=((Math.max(-1,Math.min(1,Number(value.aimX)||0))*.5+.5)*100).toFixed(1)+'%';
    if(soccerShotHeight)soccerShotHeight.style.height=((Math.max(-1,Math.min(1,Number(value.aimY)||0))*.5+.5)*100).toFixed(1)+'%';
    if(soccerShotCurve){
      const curve=Math.max(-1,Math.min(1,Number(value.curve)||0));
      // Grows from the centre in the direction the ball will bend.
      soccerShotCurve.style.left=(curve<0?(50+curve*50):50).toFixed(1)+'%';
      soccerShotCurve.style.width=(Math.abs(curve)*50).toFixed(1)+'%';
    }
    if(soccerAimReticle){
      soccerAimReticle.classList.toggle('on',showReticle);
      soccerAimReticle.style.left=Number.isFinite(Number(value.reticleX))?Number(value.reticleX).toFixed(1)+'px':(50+Math.max(-1,Math.min(1,Number(value.aimX)||0))*22).toFixed(2)+'%';
      soccerAimReticle.style.top=Number.isFinite(Number(value.reticleY))?Number(value.reticleY).toFixed(1)+'px':(46-Math.max(-1,Math.min(1,Number(value.aimY)||0))*20).toFixed(2)+'%';
      soccerAimReticle.style.setProperty('--shot-charge',String(Math.max(0,Math.min(1,Number(value.charge)||0))));
    }
  }

  // A gameplay level is not implicitly a driving level. Vehicle UI becomes
  // visible only after the runtime resolves an enabled, visible vehicle Pawn.
  setContext('none');
  setActivePlayer(1);
  return {popup, setTotal, showDrift, hideDrift, setSpeedGear, setActivePlayer, setVehicleData, setContext, setSoccerData, activePlayer:() => activePlayerId, context:() => activeContext};
}

window.LK_RUNTIME_GAME_HUD = Object.freeze({create});
})();
