/* =========================================================
   LOT KING — ENVIRONMENT INSPECTOR
   Sky, fog, procedural environment, weather and global lights.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const markDirty = deps.markDirty;
  const buildInspector = deps.buildInspector;
  const selectObject = deps.selectObject;
  const section = deps.section;
  const sliderRow = deps.sliderRow;
  const checkRow = deps.checkRow;
  const btnRow = deps.btnRow;
  const el = deps.el;

  function build(box){
    box.appendChild(el('<div class="lk-head"><span class="lk-head-ic">🌍</span><span class="lk-bp-title">ENVIRONMENT</span><span class="lk-head-id">sky · fog · global lights</span></div>'));
    const sky = GAME.systems.sky;
    const cam = GAME.player.cameraCfg;

    const ss = section('SKY / DAY-NIGHT');
    ss.body.appendChild(sliderRow('Time of day', sky.getTime(), 0, 1, .005, v => { sky.setTime(v); if(GAME.player.updateLights) GAME.player.updateLights(); markDirty(); },
      v => { const names = ['dawn','day','dusk','night']; return names[Math.floor(((+v)+.125)%1*4 % 4)] + ' (' + (+v).toFixed(2) + ')'; }).root);
    ss.body.appendChild(sliderRow('Day length (s)', sky.getDayLength(), 30, 1200, 10, v => { sky.setDayLength(v); markDirty(); }).root);
    box.appendChild(ss.root);

    const sf = section('FOG / DISTANCE');
    sf.body.appendChild(sliderRow('Fog density', cam.fogDensity, 0, .03, .0005, v => { cam.fogDensity = v; GAME.player.applyCameraCfg(); markDirty(); }, v => (+v).toFixed(4)).root);
    sf.body.appendChild(sliderRow('View distance', cam.far, 100, 1500, 10, v => { cam.far = v; GAME.player.applyCameraCfg(); markDirty(); }).root);
    box.appendChild(sf.root);

    const spe = section('PROCEDURAL ENVIRONMENT');
    if(sky.proceduralEnv){
      spe.body.appendChild(checkRow('Enabled', sky.proceduralEnv.getEnabled(), v => { sky.proceduralEnv.setEnabled(v); markDirty(); }).root);
      spe.body.appendChild(sliderRow('Intensity', sky.proceduralEnv.getIntensity(), 0, 1, .01, v => { sky.proceduralEnv.setIntensity(v); markDirty(); }, v => (+v).toFixed(2)).root);
      spe.body.appendChild(sliderRow('Warmth', sky.proceduralEnv.getWarmth(), 0, 1, .01, v => { sky.proceduralEnv.setWarmth(v); markDirty(); }, v => (+v).toFixed(2)).root);
      spe.body.appendChild(sliderRow('Contrast', sky.proceduralEnv.getContrast(), 0, 1, .01, v => { sky.proceduralEnv.setContrast(v); markDirty(); }, v => (+v).toFixed(2)).root);
      spe.body.appendChild(el('<div class="lk-hint">Lightweight dynamic environment map generated in code. Use this instead of HDRI for faster iteration and lower memory cost.</div>'));
    }
    box.appendChild(spe.root);

    const ssb = section('SUN BLOOM');
    if(sky.sunBloom){
      const sb = sky.sunBloom.get();
      const sbset = patch => { sky.sunBloom.set(patch); markDirty(); };
      ssb.body.appendChild(checkRow('Attivo', sb.enabled, v => sbset({enabled:v})).root);
      ssb.body.appendChild(sliderRow('Intensita\'', sb.intensity, 0, 2, .01, v => sbset({intensity:v}), v => (+v).toFixed(2)).root);
      ssb.body.appendChild(sliderRow('Dimensione', sb.size, .2, 3, .05, v => sbset({size:v}), v => (+v).toFixed(2)).root);
      ssb.body.appendChild(el('<div class="lk-hint">Alone luminoso attorno al disco solare. Indipendente dal lens flare: qui regoli il "bagliore", sotto i riflessi di lente.</div>'));
    }
    box.appendChild(ssb.root);

    const sfl = section('LENS FLARE');
    if(sky.flare && sky.flare.get){
      const fl = sky.flare.get();
      const flset = patch => { sky.flare.set(patch); markDirty(); };
      sfl.body.appendChild(checkRow('Attivo', fl.enabled, v => flset({enabled:v})).root);
      sfl.body.appendChild(sliderRow('Intensita\'', fl.intensity, 0, 2, .01, v => flset({intensity:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow('Dimensione', fl.size, .2, 3, .05, v => flset({size:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow('Ghost (numero)', fl.ghosts, 0, 8, 1, v => flset({ghosts:Math.round(v)}), v => String(Math.round(v))).root);
      sfl.body.appendChild(sliderRow('Spaziatura ghost', fl.spacing, .1, 2, .05, v => flset({spacing:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow('Cromatismo', fl.chroma, 0, 1, .01, v => flset({chroma:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(sliderRow('Alone (halo)', fl.halo, 0, 1, .01, v => flset({halo:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(sliderRow('Dimensione halo', fl.haloSize, .2, 3, .05, v => flset({haloSize:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow('Streak orizzontale', fl.streak, 0, 1, .01, v => flset({streak:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(btnRow([{label:'↺ Default', action:() => { sky.flare.set(sky.flare.defaults()); markDirty(); buildInspector(); }}]));
      sfl.body.appendChild(el('<div class="lk-hint">Riflessi di lente veri: catena di ghost lungo l\'asse sole → centro schermo, ricalcolata con la camera attiva (guarda verso il sole e muovi la visuale). Sparisce quando il sole esce dall\'inquadratura.</div>'));
    }
    box.appendChild(sfl.root);

    const svc = section('NUVOLE VOLUMETRICHE', false);
    if(sky.volClouds && (!sky.volClouds.available || sky.volClouds.available()) && sky.volClouds.get()){
      const vc = sky.volClouds.get();
      const vset = patch => { sky.volClouds.set(patch); markDirty(); };
      svc.body.appendChild(checkRow('Attive (sostituiscono le sprite clouds)', vc.enabled, v => { vset({enabled:v}); buildInspector(); }).root);
      svc.body.appendChild(sliderRow('Copertura', vc.coverage, 0, 1, .01, v => vset({coverage:v}), v => Math.round(v*100) + '%').root);
      svc.body.appendChild(sliderRow('Densita\'', vc.density, 0, 3, .05, v => vset({density:v}), v => (+v).toFixed(2)).root);
      svc.body.appendChild(sliderRow('Scala rumore', vc.scale, .2, 6, .05, v => vset({scale:v}), v => (+v).toFixed(2)).root);
      svc.body.appendChild(sliderRow('Dettaglio bordi', vc.detail, 0, 1, .01, v => vset({detail:v}), v => Math.round(v*100) + '%').root);
      svc.body.appendChild(sliderRow('Vento', vc.speed, 0, 6, .05, v => vset({speed:v}), v => (+v).toFixed(2)).root);
      svc.body.appendChild(sliderRow('Direzione vento', vc.windAngle, 0, 360, 1, v => vset({windAngle:v}), v => Math.round(v) + '°').root);
      svc.body.appendChild(sliderRow('Quota strato', vc.altitude, 40, 400, 5, v => vset({altitude:v}), v => Math.round(v) + 'm').root);
      svc.body.appendChild(sliderRow('Spessore strato', vc.thickness, 10, 260, 5, v => vset({thickness:v}), v => Math.round(v) + 'm').root);
      svc.body.appendChild(sliderRow('Qualita\' (passi)', vc.quality, 6, 40, 1, v => vset({quality:Math.round(v)}), v => String(Math.round(v))).root);
      svc.body.appendChild(sliderRow('Assorbimento', vc.absorption, .2, 3, .05, v => vset({absorption:v}), v => (+v).toFixed(2)).root);
      svc.body.appendChild(sliderRow('Opacita\'', vc.opacity, 0, 1, .01, v => vset({opacity:v}), v => Math.round(v*100) + '%').root);
      svc.body.appendChild(btnRow([{label:'↺ Default', action:() => { sky.volClouds.set(sky.volClouds.defaults()); markDirty(); buildInspector(); }}]));
      svc.body.appendChild(el('<div class="lk-hint">Nuvole raymarched illuminate dal sole (seguono il ciclo giorno/notte). La "Qualita\'" e\' il costo GPU principale: 14-20 e\' un buon compromesso, alza solo se il frame rate regge.</div>'));
    } else {
      svc.body.appendChild(el('<div class="lk-empty">Modulo nuvole non caricato:<br>ricarica la pagina con Ctrl+F5<br>(cache del browser).</div>'));
    }
    box.appendChild(svc.root);

    const srn = section('PIOGGIA', false);
    const rain = GAME.systems.rain;
    if(rain){
      const rp = rain.get();
      const rset = patch => { rain.set(patch); markDirty(); };
      srn.body.appendChild(checkRow('Attiva', rp.enabled, v => { rset({enabled:v}); buildInspector(); }).root);
      srn.body.appendChild(sliderRow('Intensita\'', rp.intensity, 0, 1, .01, v => rset({intensity:v}), v => Math.round(v*100) + '%').root);
      srn.body.appendChild(sliderRow('Velocita\' caduta', rp.speed, 10, 160, 1, v => rset({speed:v}), v => Math.round(v) + ' m/s').root);
      srn.body.appendChild(sliderRow('Lunghezza gocce', rp.length, .05, 3, .05, v => rset({length:v}), v => (+v).toFixed(2) + 'm').root);
      srn.body.appendChild(sliderRow('Vento', rp.wind, 0, 1.5, .01, v => rset({wind:v}), v => (+v).toFixed(2)).root);
      srn.body.appendChild(sliderRow('Direzione vento', rp.windAngle, 0, 360, 1, v => rset({windAngle:v}), v => Math.round(v) + '°').root);
      srn.body.appendChild(sliderRow('Area (raggio)', rp.area, 20, 200, 5, v => rset({area:v}), v => Math.round(v) + 'm').root);
      srn.body.appendChild(sliderRow('Opacita\'', rp.opacity, 0, 1, .01, v => rset({opacity:v}), v => Math.round(v*100) + '%').root);
      srn.body.appendChild(sliderRow('Volume suono', rp.sound == null ? .6 : rp.sound, 0, 1, .01, v => rset({sound:v}), v => Math.round(v*100) + '%').root);
      srn.body.appendChild(btnRow([{label:'↺ Default', action:() => { rain.set(rain.defaults()); markDirty(); buildInspector(); }}]));
      srn.body.appendChild(el('<div class="lk-hint">Pioggia GPU che segue il veicolo: il costo e\' quasi nullo anche a intensita\' piena. Il suono e\' procedurale e segue l\'intensita\' (esce sul bus SFX, rispetta i volumi generali). Vento e direzione sono condivisi concettualmente con le nuvole: allineali per coerenza.</div>'));
    } else {
      srn.body.appendChild(el('<div class="lk-empty">Modulo pioggia non caricato.</div>'));
    }
    box.appendChild(srn.root);

    const lights = GAME.core.lights;
    const sl = section('LUCI GLOBALI');
    sl.body.appendChild(el('<div class="lk-hint">Sun and hemi are driven by the day/night cycle; select the light entities here for detailed edits.</div>'));
    sl.body.appendChild(btnRow([
      {label:'💡 Warm', action:() => selectObject(lights.pl1)},
      {label:'💡 Cool', action:() => selectObject(lights.pl2)},
      {label:'🌗 Hemi', action:() => selectObject(lights.hemi)},
      {label:'☀️ Sun', action:() => selectObject(lights.sun)},
    ]));
    box.appendChild(sl.root);
  }

  return Object.freeze({build});
}

window.LK_EDITOR_ENVIRONMENT_INSPECTOR = Object.freeze({create});
})();
