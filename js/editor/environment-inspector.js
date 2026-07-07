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
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

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
      ssb.body.appendChild(checkRow(tr('Enabled', 'Attivo'), sb.enabled, v => sbset({enabled:v})).root);
      ssb.body.appendChild(sliderRow(tr('Intensity', 'Intensita'), sb.intensity, 0, 2, .01, v => sbset({intensity:v}), v => (+v).toFixed(2)).root);
      ssb.body.appendChild(sliderRow(tr('Size', 'Dimensione'), sb.size, .2, 3, .05, v => sbset({size:v}), v => (+v).toFixed(2)).root);
      ssb.body.appendChild(el('<div class="lk-hint">' + tr('Bright halo around the sun disc. Independent from lens flare: this controls the glow; flare reflections are below.', 'Alone luminoso attorno al disco solare. Indipendente dal lens flare: qui regoli il bagliore, sotto i riflessi di lente.') + '</div>'));
    }
    box.appendChild(ssb.root);

    const sfl = section('LENS FLARE');
    if(sky.flare && sky.flare.get){
      const fl = sky.flare.get();
      const flset = patch => { sky.flare.set(patch); markDirty(); };
      sfl.body.appendChild(checkRow(tr('Enabled', 'Attivo'), fl.enabled, v => flset({enabled:v})).root);
      sfl.body.appendChild(sliderRow(tr('Intensity', 'Intensita'), fl.intensity, 0, 2, .01, v => flset({intensity:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow(tr('Size', 'Dimensione'), fl.size, .2, 3, .05, v => flset({size:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow(tr('Ghost count', 'Ghost (numero)'), fl.ghosts, 0, 8, 1, v => flset({ghosts:Math.round(v)}), v => String(Math.round(v))).root);
      sfl.body.appendChild(sliderRow(tr('Ghost spacing', 'Spaziatura ghost'), fl.spacing, .1, 2, .05, v => flset({spacing:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow(tr('Chromatic split', 'Cromatismo'), fl.chroma, 0, 1, .01, v => flset({chroma:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(sliderRow(tr('Halo', 'Alone (halo)'), fl.halo, 0, 1, .01, v => flset({halo:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(sliderRow(tr('Halo size', 'Dimensione halo'), fl.haloSize, .2, 3, .05, v => flset({haloSize:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow(tr('Horizontal streak', 'Streak orizzontale'), fl.streak, 0, 1, .01, v => flset({streak:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(btnRow([{label:'↺ Default', action:() => { sky.flare.set(sky.flare.defaults()); markDirty(); buildInspector(); }}]));
      sfl.body.appendChild(el('<div class="lk-hint">' + tr('Real lens reflections: ghost chain along the sun-to-screen-center axis, recalculated with the active camera. It disappears when the sun leaves the frame.', 'Riflessi di lente veri: catena di ghost lungo l\'asse sole -> centro schermo, ricalcolata con la camera attiva. Sparisce quando il sole esce dall\'inquadratura.') + '</div>'));
    }
    box.appendChild(sfl.root);

    const svc = section(tr('VOLUMETRIC CLOUDS', 'NUVOLE VOLUMETRICHE'), false);
    if(sky.volClouds && (!sky.volClouds.available || sky.volClouds.available()) && sky.volClouds.get()){
      const vc = sky.volClouds.get();
      const vset = patch => { sky.volClouds.set(patch); markDirty(); };
      svc.body.appendChild(checkRow(tr('Enabled (replaces sprite clouds)', 'Attive (sostituiscono le sprite clouds)'), vc.enabled, v => { vset({enabled:v}); buildInspector(); }).root);
      svc.body.appendChild(sliderRow(tr('Coverage', 'Copertura'), vc.coverage, 0, 1, .01, v => vset({coverage:v}), v => Math.round(v*100) + '%').root);
      svc.body.appendChild(sliderRow(tr('Density', 'Densita'), vc.density, 0, 3, .05, v => vset({density:v}), v => (+v).toFixed(2)).root);
      svc.body.appendChild(sliderRow(tr('Noise scale', 'Scala rumore'), vc.scale, .2, 6, .05, v => vset({scale:v}), v => (+v).toFixed(2)).root);
      svc.body.appendChild(sliderRow(tr('Edge detail', 'Dettaglio bordi'), vc.detail, 0, 1, .01, v => vset({detail:v}), v => Math.round(v*100) + '%').root);
      svc.body.appendChild(sliderRow(tr('Wind', 'Vento'), vc.speed, 0, 6, .05, v => vset({speed:v}), v => (+v).toFixed(2)).root);
      svc.body.appendChild(sliderRow(tr('Wind direction', 'Direzione vento'), vc.windAngle, 0, 360, 1, v => vset({windAngle:v}), v => Math.round(v) + '°').root);
      svc.body.appendChild(sliderRow(tr('Layer altitude', 'Quota strato'), vc.altitude, 40, 400, 5, v => vset({altitude:v}), v => Math.round(v) + 'm').root);
      svc.body.appendChild(sliderRow(tr('Layer thickness', 'Spessore strato'), vc.thickness, 10, 260, 5, v => vset({thickness:v}), v => Math.round(v) + 'm').root);
      svc.body.appendChild(sliderRow(tr('Quality (steps)', 'Qualita (passi)'), vc.quality, 6, 40, 1, v => vset({quality:Math.round(v)}), v => String(Math.round(v))).root);
      svc.body.appendChild(sliderRow(tr('Absorption', 'Assorbimento'), vc.absorption, .2, 3, .05, v => vset({absorption:v}), v => (+v).toFixed(2)).root);
      svc.body.appendChild(sliderRow(tr('Opacity', 'Opacita'), vc.opacity, 0, 1, .01, v => vset({opacity:v}), v => Math.round(v*100) + '%').root);
      svc.body.appendChild(btnRow([{label:'↺ Default', action:() => { sky.volClouds.set(sky.volClouds.defaults()); markDirty(); buildInspector(); }}]));
      svc.body.appendChild(el('<div class="lk-hint">' + tr('Raymarched clouds lit by the sun and synced to the day/night cycle. Quality is the main GPU cost: 14-20 is a good compromise; raise it only if the frame rate holds.', 'Nuvole raymarched illuminate dal sole e sincronizzate col ciclo giorno/notte. La qualita e il costo GPU principale: 14-20 e un buon compromesso, alza solo se il frame rate regge.') + '</div>'));
    } else {
      svc.body.appendChild(el('<div class="lk-empty">' + tr('Cloud module not loaded:<br>reload the page with Ctrl+F5<br>(browser cache).', 'Modulo nuvole non caricato:<br>ricarica la pagina con Ctrl+F5<br>(cache del browser).') + '</div>'));
    }
    box.appendChild(svc.root);

    const srn = section(tr('RAIN', 'PIOGGIA'), false);
    const rain = GAME.systems.rain;
    if(rain){
      const rp = rain.get();
      const rset = patch => { rain.set(patch); markDirty(); };
      srn.body.appendChild(checkRow(tr('Enabled', 'Attiva'), rp.enabled, v => { rset({enabled:v}); buildInspector(); }).root);
      srn.body.appendChild(sliderRow(tr('Intensity', 'Intensita'), rp.intensity, 0, 1, .01, v => rset({intensity:v}), v => Math.round(v*100) + '%').root);
      srn.body.appendChild(sliderRow(tr('Fall speed', 'Velocita caduta'), rp.speed, 10, 160, 1, v => rset({speed:v}), v => Math.round(v) + ' m/s').root);
      srn.body.appendChild(sliderRow(tr('Drop length', 'Lunghezza gocce'), rp.length, .05, 3, .05, v => rset({length:v}), v => (+v).toFixed(2) + 'm').root);
      srn.body.appendChild(sliderRow(tr('Wind', 'Vento'), rp.wind, 0, 1.5, .01, v => rset({wind:v}), v => (+v).toFixed(2)).root);
      srn.body.appendChild(sliderRow(tr('Wind direction', 'Direzione vento'), rp.windAngle, 0, 360, 1, v => rset({windAngle:v}), v => Math.round(v) + '°').root);
      srn.body.appendChild(sliderRow(tr('Area radius', 'Area (raggio)'), rp.area, 20, 200, 5, v => rset({area:v}), v => Math.round(v) + 'm').root);
      srn.body.appendChild(sliderRow(tr('Opacity', 'Opacita'), rp.opacity, 0, 1, .01, v => rset({opacity:v}), v => Math.round(v*100) + '%').root);
      srn.body.appendChild(sliderRow(tr('Sound volume', 'Volume suono'), rp.sound == null ? .6 : rp.sound, 0, 1, .01, v => rset({sound:v}), v => Math.round(v*100) + '%').root);
      srn.body.appendChild(btnRow([{label:'↺ Default', action:() => { rain.set(rain.defaults()); markDirty(); buildInspector(); }}]));
      srn.body.appendChild(el('<div class="lk-hint">' + tr('GPU rain follows the vehicle: cost is almost negligible even at full intensity. Procedural sound follows intensity and uses the SFX bus. Wind and direction conceptually match clouds: align them for coherence.', 'Pioggia GPU che segue il veicolo: il costo e quasi nullo anche a intensita piena. Il suono procedurale segue l\'intensita e usa il bus SFX. Vento e direzione sono condivisi concettualmente con le nuvole: allineali per coerenza.') + '</div>'));
    } else {
      srn.body.appendChild(el('<div class="lk-empty">' + tr('Rain module not loaded.', 'Modulo pioggia non caricato.') + '</div>'));
    }
    box.appendChild(srn.root);

    const lights = GAME.core.lights;
    const sl = section(tr('GLOBAL LIGHTS', 'LUCI GLOBALI'));
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
