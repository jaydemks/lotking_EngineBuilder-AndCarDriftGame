/* =========================================================
   LOT KING — ENVIRONMENT INSPECTOR
   Sky, fog, procedural environment, weather and global lights.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const markDirty = function(){
    if(GAME && GAME.state && GAME.state.editorPreview && STORE && STORE.collectEnvironment){
      GAME.state.editorPreviewManualEnvironment = STORE.collectEnvironment(GAME);
    }
    if(deps.markDirty) deps.markDirty();
  };
  const buildInspector = deps.buildInspector;
  const selectObject = deps.selectObject;
  const section = deps.section;
  const selectRow = deps.selectRow;
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
    if(sky.getCycleEnabled && sky.setCycleEnabled){
      ss.body.appendChild(checkRow(tr('Day / night cycle', 'Ciclo giorno / notte'), sky.getCycleEnabled(), v => {
        sky.setCycleEnabled(v);
        if(GAME.player.updateLights) GAME.player.updateLights();
        markDirty();
        buildInspector();
      }).root);
    }
    const clockHour = sky.getClockHour ? sky.getClockHour() : (sky.getTime()*24+6)%24;
    const clockLabel = value => {
      const total=Math.round((((Number(value)||0)%24)+24)%24*60)%1440;
      const hour=Math.floor(total/60), minute=total%60;
      const phase=hour>=5&&hour<8?tr('Dawn','Alba'):hour>=8&&hour<17?tr('Day','Giorno'):hour>=17&&hour<20?tr('Dusk','Tramonto'):tr('Night','Notte');
      return String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')+' · '+phase;
    };
    ss.body.appendChild(sliderRow(tr('Time of day (24 h)', 'Ora del giorno (24 h)'), clockHour, 0, 23.75, .25, v => {
      if(sky.setClockHour) sky.setClockHour(v);
      else sky.setTime((((v-6)/24)%1+1)%1);
      if(GAME.player.updateLights) GAME.player.updateLights();
      markDirty();
    }, clockLabel).root);
    if(!sky.getCycleEnabled || sky.getCycleEnabled()) ss.body.appendChild(sliderRow('Day length (s)', sky.getDayLength(), 30, 1200, 10, v => { sky.setDayLength(v); markDirty(); }).root);
    ss.body.appendChild(el('<div class="lk-hint">' + tr('One shared 24-hour clock drives the sky and every scheduled light: 06:00 dawn, 12:00 noon, 18:00 sunset and 00:00 midnight. Disable the cycle to keep the selected time fixed.', 'Un unico orologio a 24 ore controlla cielo e luci programmate: 06:00 alba, 12:00 mezzogiorno, 18:00 tramonto e 00:00 mezzanotte. Disattiva il ciclo per mantenere fisso l\'orario selezionato.') + '</div>'));
    box.appendChild(ss.root);

    const sf = section('FOG / DISTANCE');
    sf.body.appendChild(sliderRow('Fog density', cam.fogDensity, 0, .03, .0005, v => { cam.fogDensity = v; GAME.player.applyCameraCfg(); markDirty(); }, v => (+v).toFixed(4)).root);
    sf.body.appendChild(sliderRow('View distance', cam.far, 100, 1500, 10, v => { cam.far = v; GAME.player.applyCameraCfg(); markDirty(); }).root);
    box.appendChild(sf.root);

    const swc = section('WORLD SURFACE COLLISION');
    const physics = GAME.systems && GAME.systems.physics;
    if(physics && physics.getSurfaceWorldCollision && physics.setSurfaceWorldCollision){
      swc.body.appendChild(checkRow('Surface world collision', physics.getSurfaceWorldCollision(), v => {
        physics.setSurfaceWorldCollision(v);
        markDirty();
      }).root);
      swc.body.appendChild(el('<div class="lk-hint">Invisible fallback physics plane at world Y=0. Disable it for underground tracks, floating levels, or when your road meshes provide their own Complex collision.</div>'));
    } else {
      swc.body.appendChild(el('<div class="lk-empty">Physics world unavailable.</div>'));
    }
    box.appendChild(swc.root);

    const spe = section('PROCEDURAL ENVIRONMENT');
    if(sky.proceduralEnv){
      spe.body.appendChild(checkRow('Enabled', sky.proceduralEnv.getEnabled(), v => { sky.proceduralEnv.setEnabled(v); markDirty(); }).root);
      spe.body.appendChild(sliderRow('Intensity', sky.proceduralEnv.getIntensity(), 0, 1, .01, v => { sky.proceduralEnv.setIntensity(v); markDirty(); }, v => (+v).toFixed(2)).root);
      spe.body.appendChild(sliderRow('Warmth', sky.proceduralEnv.getWarmth(), 0, 1, .01, v => { sky.proceduralEnv.setWarmth(v); markDirty(); }, v => (+v).toFixed(2)).root);
      spe.body.appendChild(sliderRow('Contrast', sky.proceduralEnv.getContrast(), 0, 1, .01, v => { sky.proceduralEnv.setContrast(v); markDirty(); }, v => (+v).toFixed(2)).root);
      spe.body.appendChild(el('<div class="lk-hint">Lightweight dynamic environment map generated in code. Use this instead of HDRI for faster iteration and lower memory cost.</div>'));
    }
    box.appendChild(spe.root);

    const sli = section(tr('DAY / NIGHT LIGHTING', 'ILLUMINAZIONE GIORNO / NOTTE'));
    if(sky.lighting){
      const lighting = sky.lighting.get();
      const lset = patch => { sky.lighting.set(patch); markDirty(); };
      sli.body.appendChild(sliderRow(tr('Day sun', 'Sole diurno'), lighting.daySun, 0, 3, .02, v => lset({daySun:v}), v => (+v).toFixed(2)).root);
      sli.body.appendChild(sliderRow(tr('Day ambient fill', 'Riempimento ambiente giorno'), lighting.dayAmbient, 0, 2, .02, v => lset({dayAmbient:v}), v => (+v).toFixed(2)).root);
      sli.body.appendChild(sliderRow(tr('Moon direct light', 'Luce lunare diretta'), lighting.moonDirect, 0, 1, .01, v => lset({moonDirect:v}), v => (+v).toFixed(2)).root);
      sli.body.appendChild(sliderRow(tr('Moon indirect light', 'Luce lunare indiretta'), lighting.moonIndirect, 0, 1, .01, v => lset({moonIndirect:v}), v => (+v).toFixed(2)).root);
      sli.body.appendChild(btnRow([{label:'↺ Default r185', action:() => { sky.lighting.set(sky.lighting.defaults()); markDirty(); buildInspector(); }}]));
      sli.body.appendChild(el('<div class="lk-hint">' + tr('Moon direct light casts the night shadow; moon indirect light controls blue diffuse fill and follows moon visibility. Exposure is configured under Rendering / Video.', 'La luce lunare diretta proietta l\'ombra notturna; la luce lunare indiretta controlla il riempimento diffuso blu e segue la visibilita della luna. L\'esposizione si configura in Rendering / Video.') + '</div>'));
    }
    box.appendChild(sli.root);

    const ssb = section('SUN BLOOM');
    if(sky.sunBloom){
      const sb = sky.sunBloom.get();
      const sbset = patch => { sky.sunBloom.set(patch); markDirty(); };
      ssb.body.appendChild(checkRow(tr('Enabled', 'Attivo'), sb.enabled, v => sbset({enabled:v})).root);
      ssb.body.appendChild(sliderRow(tr('Intensity', 'Intensita'), sb.intensity, 0, 3, .01, v => sbset({intensity:v}), v => (+v).toFixed(2)).root);
      ssb.body.appendChild(sliderRow(tr('Size', 'Dimensione'), sb.size, .2, 3, .05, v => sbset({size:v}), v => (+v).toFixed(2)).root);
      ssb.body.appendChild(sliderRow(tr('Bloom radius', 'Raggio bloom'), sb.radius == null ? .14 : sb.radius, .02, 1, .01, v => sbset({radius:v}), v => (+v).toFixed(2)).root);
      ssb.body.appendChild(sliderRow(tr('Bloom threshold', 'Soglia bloom'), sb.threshold == null ? .52 : sb.threshold, 0, 1, .01, v => sbset({threshold:v}), v => Math.round(v*100) + '%').root);
      ssb.body.appendChild(el('<div class="lk-hint">' + tr('Bright halo around the sun disc. Independent from lens flare: this controls the glow; flare reflections are below.', 'Alone luminoso attorno al disco solare. Indipendente dal lens flare: qui regoli il bagliore, sotto i riflessi di lente.') + '</div>'));
    }
    box.appendChild(ssb.root);

    const sfl = section('LENS FLARE');
    if(sky.flare && sky.flare.get){
      const fl = sky.flare.get();
      const flset = patch => { sky.flare.set(patch); markDirty(); };
      sfl.body.appendChild(checkRow(tr('Enabled', 'Attivo'), fl.enabled, v => flset({enabled:v})).root);
      sfl.body.appendChild(selectRow(tr('Flare type', 'Tipo di flare'), fl.mode || 'classic', [
        {value:'classic', label:tr('Classic', 'Classico')},
        {value:'cinematic', label:tr('Cinematic / realistic', 'Cinematografico / realistico')},
      ], v => { flset({mode:v}); buildInspector(); }).root);
      sfl.body.appendChild(sliderRow(tr('Intensity', 'Intensita'), fl.intensity, 0, 2, .01, v => flset({intensity:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow(tr('Size', 'Dimensione'), fl.size, .2, 3, .05, v => flset({size:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow(tr('Ghost count', 'Ghost (numero)'), fl.ghosts, 0, 8, 1, v => flset({ghosts:Math.round(v)}), v => String(Math.round(v))).root);
      sfl.body.appendChild(sliderRow(tr('Ghost spacing', 'Spaziatura ghost'), fl.spacing, .1, 2, .05, v => flset({spacing:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow(tr('Chromatic split', 'Cromatismo'), fl.chroma, 0, 1, .01, v => flset({chroma:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(sliderRow(tr('Halo', 'Alone (halo)'), fl.halo, 0, 1, .01, v => flset({halo:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(sliderRow(tr('Halo size', 'Dimensione halo'), fl.haloSize, .2, 3, .05, v => flset({haloSize:v}), v => (+v).toFixed(2)).root);
      sfl.body.appendChild(sliderRow(tr('Horizontal streak', 'Streak orizzontale'), fl.streak, 0, 1, .01, v => flset({streak:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(sliderRow(tr('Starburst', 'Raggi diaframma'), fl.starburst, 0, 1, .01, v => flset({starburst:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(sliderRow(tr('Ghost opacity', 'Opacita ghost'), fl.ghostOpacity, 0, 1, .01, v => flset({ghostOpacity:v}), v => Math.round(v*100) + '%').root);
      sfl.body.appendChild(checkRow(tr('Anamorphic lens', 'Lente anamorfica'), fl.anamorphic, v => flset({anamorphic:v})).root);
      sfl.body.appendChild(checkRow(tr('Scene occlusion', 'Occlusione scena'), fl.occlusion, v => flset({occlusion:v})).root);
      sfl.body.appendChild(btnRow([{label:'↺ Default', action:() => { sky.flare.set(sky.flare.defaults()); markDirty(); buildInspector(); }}]));
      sfl.body.appendChild(el('<div class="lk-hint">' + tr('Camera-space optical response with aperture rays, chromatic ghosts and source occlusion. The whole flare fades when geometry covers the sun; anamorphic mode stretches the glare horizontally.', 'Risposta ottica in camera-space con raggi del diaframma, ghost cromatici e occlusione della sorgente. L\'intero flare sfuma quando la geometria copre il sole; la modalita anamorfica allunga il glare orizzontalmente.') + '</div>'));
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
      srn.body.appendChild(sliderRow(tr('Drop thickness', 'Spessore gocce'), rp.width == null ? .035 : rp.width, .008, .12, .002, v => rset({width:v}), v => (+v).toFixed(3) + 'm').root);
      srn.body.appendChild(sliderRow(tr('Wind', 'Vento'), rp.wind, 0, 1.5, .01, v => rset({wind:v}), v => (+v).toFixed(2)).root);
      srn.body.appendChild(sliderRow(tr('Wind direction', 'Direzione vento'), rp.windAngle, 0, 360, 1, v => rset({windAngle:v}), v => Math.round(v) + '°').root);
      srn.body.appendChild(sliderRow(tr('Area radius', 'Area (raggio)'), rp.area, 20, 200, 5, v => rset({area:v}), v => Math.round(v) + 'm').root);
      srn.body.appendChild(sliderRow(tr('Opacity', 'Opacita'), rp.opacity, 0, 1, .01, v => rset({opacity:v}), v => Math.round(v*100) + '%').root);
      srn.body.appendChild(sliderRow(tr('Sound volume', 'Volume suono'), rp.sound == null ? .6 : rp.sound, 0, 1, .01, v => rset({sound:v}), v => Math.round(v*100) + '%').root);
      srn.body.appendChild(btnRow([{label:'↺ Default', action:() => { rain.set(rain.defaults()); markDirty(); buildInspector(); }}]));
      srn.body.appendChild(el('<div class="lk-hint">' + tr('GPU rain follows the camera in every viewport while retaining the level/player ground height. Procedural sound follows intensity and uses the SFX bus. Align wind and direction with clouds for coherent weather.', 'La pioggia GPU segue la camera in ogni viewport mantenendo la quota del terreno/livello del player. Il suono procedurale segue l\'intensita e usa il bus SFX. Allinea vento e direzione con le nuvole per un meteo coerente.') + '</div>'));
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
