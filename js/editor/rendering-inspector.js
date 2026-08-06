/* =========================================================
   LOT KING — RENDERING INSPECTOR
   Project-owned defaults and player-facing video exposure.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const api = window.LK_RUNTIME_SETTINGS_MENU;
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;

  function config(){
    const current = GAME.settings && GAME.settings.getVideoProject ? GAME.settings.getVideoProject() : null;
    return api.normalizeProject(current);
  }

  function commit(next, message, heavy){
    if(GAME.settings && GAME.settings.setVideoProject){
      GAME.settings.setVideoProject(next, {heavy:heavy !== false, message:message || tr('Updating project rendering…', 'Aggiornamento rendering progetto…')});
    }
    if(deps.markDirty) deps.markDirty();
  }

  function build(box){
    const cfg = config();
    const backend=window.LK_RUNTIME_RENDERING_BACKEND,backendReport=backend&&backend.describe?backend.describe(GAME&&GAME.core&&GAME.core.renderer):null;
    box.appendChild(deps.el('<div class="lk-head"><span class="lk-head-ic">◈</span><span class="lk-bp-title">RENDERING / VIDEO</span><span class="lk-head-id">project pipeline</span></div>'));
    const tabs = deps.el('<div class="lk-render-tabs"><button class="on" data-render-tab="defaults" type="button">' + tr('Rendering defaults', 'Default rendering') + '</button><button data-render-tab="exposed" type="button">' + tr('Exposed video settings', 'Impostazioni video esposte') + '</button></div>');
    const defaultsPanel = deps.el('<div class="lk-render-tab-panel on" data-render-panel="defaults"></div>');
    const exposedPanel = deps.el('<div class="lk-render-tab-panel" data-render-panel="exposed"></div>');
    tabs.querySelectorAll('[data-render-tab]').forEach(button => button.addEventListener('click', () => {
      tabs.querySelectorAll('[data-render-tab]').forEach(item => item.classList.toggle('on', item === button));
      [defaultsPanel, exposedPanel].forEach(panel => panel.classList.toggle('on', panel.dataset.renderPanel === button.dataset.renderTab));
    }));
    box.appendChild(tabs);
    box.appendChild(defaultsPanel);
    box.appendChild(exposedPanel);

    const updateDefault = (key, value, message, heavy) => {
      const next = config();
      next.defaults[key] = value;
      commit(next, message, heavy);
    };
    const pipeline = deps.section(tr('OUTPUT & PIPELINE', 'OUTPUT E PIPELINE'), true);
    if(backend){
      const readiness=backendReport&&backendReport.readiness||(backend.migrationReadiness?backend.migrationReadiness():null);
      const displayedBackend=backend.gpuQuarantined&&backend.gpuQuarantined()?'webgl':backend.preference();
      pipeline.body.appendChild(deps.selectRow(tr('GPU backend preference','Preferenza backend GPU'),displayedBackend,[
        {value:'auto',label:tr('Auto · guarded WebGL 2','Auto · WebGL 2 protetto')},{value:'webgpu',label:tr('WebGPU · experimental full engine','WebGPU · sperimentale intero motore')},{value:'webgl',label:'WebGL 2 · stable'},
      ],value=>{backend.setPreference(value);if(deps.status)deps.status(tr('Rebuilding the editor on the selected GPU backend…','Ricostruzione editor sul backend GPU selezionato…'));setTimeout(()=>location.reload(),60);}).root);
      const caps=backendReport&&backendReport.capabilities||backend.syncCapabilities();
      const info=deps.el('<div class="lk-ps-summary lk-render-backend-summary"></div>');
      [[tr('Active','Attivo'),backendReport&&backendReport.effective||'webgl'],['WebGPU API',caps.webgpuApi?'ready':'unavailable'],[tr('WebGPU default','Default WebGPU'),readiness&&readiness.defaultSafe?'qualified':'blocked'],[tr('Mobile parity','Parità mobile'),readiness&&readiness.mobileQualified?'qualified':'not qualified'],['Three r185',caps.revision||'unknown'],[tr('GPU','GPU'),backendReport&&backendReport.gpu||tr('probing…','rilevamento…')]].forEach(item=>{const card=deps.el('<div><small></small><b></b></div>');card.querySelector('small').textContent=item[0];card.querySelector('b').textContent=item[1];info.appendChild(card);});
      pipeline.body.appendChild(info);
      const support=backend.featureSupport?backend.featureSupport(GAME&&GAME.core&&GAME.core.renderer):{};
      const limits=deps.el('<div class="lk-ps-summary lk-render-capability-summary"></div>');
      [[tr('Vendor','Produttore'),backendReport&&backendReport.vendor||'—'],[tr('Max texture','Texture massima'),backendReport&&backendReport.maxTextureSize?backendReport.maxTextureSize+' px':'—'],['MSAA',backendReport&&backendReport.maxSamples?backendReport.maxSamples+'×':'—'],['GTAO',support.gtao?'ready':'unavailable'],['Compute',support.compute?'ready':'unavailable'],['LightProbeGrid',support.lightProbeGrid?'ready':'unavailable']].forEach(item=>{const card=deps.el('<div><small></small><b></b></div>');card.querySelector('small').textContent=item[0];card.querySelector('b').textContent=item[1];limits.appendChild(card);});
      pipeline.body.appendChild(limits);
      if(readiness&&!readiness.defaultSafe){
        const gate=deps.el('<div class="lk-hint lk-render-backend-warning"><b></b><ul></ul></div>');
        gate.querySelector('b').textContent=tr('WebGPU is explicitly testable; automatic promotion still awaits full parity','WebGPU è provabile esplicitamente; la promozione automatica attende ancora la parità completa');
        (readiness.blockers||[]).forEach(blocker=>{const item=document.createElement('li');item.textContent=blocker.label||blocker.id;gate.querySelector('ul').appendChild(item);});
        pipeline.body.appendChild(gate);
      }
      if(backendReport&&backendReport.fallbackReason)pipeline.body.appendChild(deps.el('<div class="lk-hint lk-render-backend-warning">'+backendReport.fallbackReason+'</div>'));
    }
    pipeline.body.appendChild(deps.selectRow(tr('Renderer', 'Renderer'), cfg.defaults.rendererMode, [
      {value:'webgl', label:tr('Real-time raster (active GPU backend)', 'Raster real-time (backend GPU attivo)')},
      {value:'raytracing', label:tr('Ray lighting', 'Ray lighting')},
      {value:'pathtracing', label:tr(
        'Progressive path tracing (Experimental - Not stable)',
        'Path tracing progressivo (Sperimentale - Non stabile)'
      )},
    ], value => updateDefault('rendererMode', value, tr('Switching project rendering pipeline…', 'Cambio pipeline rendering progetto…'))).root);
    const pathTracer=GAME&&GAME.systems&&GAME.systems.pathTracing;
    if(cfg.defaults.rendererMode==='pathtracing'){
      const state=pathTracer&&pathTracer.status?pathTracer.status():{supported:false,failure:tr('Path tracer module unavailable','Modulo path tracer non disponibile')};
      const label=!state.supported?tr('Unavailable','Non disponibile'):
        state.failure?tr('WebGL fallback','Fallback WebGL'):
        state.building?tr('Preparing BVH…','Preparazione BVH…'):
        state.ready?tr('Active','Attivo'):tr('Waiting for pre-benchmark','In attesa del pre-benchmark');
      const detail=state.failure||((Number(state.samples)||0)+tr(' progressive samples',' sample progressivi'));
      pipeline.body.appendChild(deps.el('<div class="lk-hint lk-render-backend-warning"><b>Path tracing: '+label+'</b><br>'+detail+'</div>'));
    }
    pipeline.body.appendChild(deps.selectRow(tr('Default quality', 'Qualita predefinita'), cfg.defaults.quality, [
      {value:'low',label:'Low'}, {value:'medium',label:'Medium'}, {value:'high',label:'High'},
      {value:'superhigh',label:'Super High'}, {value:'extreme',label:'Extreme'},
    ], value => updateDefault('quality', value, tr('Applying project quality preset…', 'Applicazione preset qualita progetto…'))).root);
    pipeline.body.appendChild(deps.selectRow(tr('Antialiasing', 'Antialiasing'), cfg.defaults.antialiasing, [
      {value:'off',label:tr('Off', 'Disattivato')}, {value:'fxaa',label:'FXAA (mobile)'},
      {value:'ssaa2x',label:'Supersampling 2×'}, {value:'ssaa4x',label:'Supersampling 4×'},
    ], value => updateDefault('antialiasing', value, tr('Rebuilding the render surface…', 'Ricostruzione superficie di rendering…'))).root);
    pipeline.body.appendChild(deps.sliderRow(tr('Exposure', 'Esposizione'), cfg.defaults.exposure, .7, 1.6, .01, value => updateDefault('exposure', value, tr('Updating scene exposure…', 'Aggiornamento esposizione scena…')), value => (+value).toFixed(2) + '×').root);
    pipeline.body.appendChild(deps.el('<div class="lk-hint">' + tr('Backend selects the GPU API and requires a renderer restart. Auto remains on validated WebGL 2 until WebGPU passes engine-feature and real-device mobile parity.', 'Backend seleziona l’API GPU e richiede il riavvio del renderer. Auto resta su WebGL 2 verificato finché WebGPU non supera la parità delle funzioni del motore e i test su dispositivi mobili reali.') + '</div>'));
    defaultsPanel.appendChild(pipeline.root);

    const illustration = deps.section(tr('ILLUSTRATED SKETCH', 'SKETCH ILLUSTRATO'), true);
    illustration.body.appendChild(deps.selectRow(tr('Automatic scene style', 'Stile automatico scena'), cfg.defaults.visualStyle, [
      {value:'natural', label:tr('Natural rendering', 'Rendering naturale')},
      {value:'illustrated-sketch', label:tr('Detailed illustrated sketch', 'Sketch illustrato dettagliato')},
    ], value => updateDefault('visualStyle', value, tr('Applying the illustrated scene pipeline…', 'Applicazione pipeline scena illustrata…'))).root);
    illustration.body.appendChild(deps.selectRow(tr('Sketch medium', 'Supporto sketch'), cfg.defaults.sketchMedium, [
      {value:'painted-storybook', label:tr('Painted Storybook · full colour', 'Racconto dipinto · colore completo')},
      {value:'paper-pencil', label:tr('Paper pencil · organic', 'Matita su carta · organica')},
      {value:'illustrated-ink', label:tr('Illustrated ink · graphic', 'Inchiostro illustrato · grafico')},
    ], value => updateDefault('sketchMedium', value, tr('Changing the sketch medium…', 'Cambio supporto sketch…'), false)).root);
    illustration.body.appendChild(deps.sliderRow(tr('Ink strength', 'Forza inchiostro'), cfg.defaults.sketchStrength, 0, 1, .01,
      value => updateDefault('sketchStrength', value, null, false), value => Math.round(value * 100) + '%').root);
    illustration.body.appendChild(deps.sliderRow(tr('Line / hatch detail', 'Dettaglio linee / tratteggio'), cfg.defaults.sketchDetail, 0, 1, .01,
      value => updateDefault('sketchDetail', value, null, false), value => Math.round(value * 100) + '%').root);
    illustration.body.appendChild(deps.sliderRow(tr('Hatching / grid', 'Tratteggio / griglia'), cfg.defaults.sketchHatching, 0, 1, .01,
      value => updateDefault('sketchHatching', value, null, false), value => Math.round(value * 100) + '%').root);
    illustration.body.appendChild(deps.sliderRow(tr('Drawn-line noise', 'Noise linea disegnata'), cfg.defaults.sketchLineNoise, 0, 1, .01,
      value => updateDefault('sketchLineNoise', value, null, false), value => Math.round(value * 100) + '%').root);
    illustration.body.appendChild(deps.sliderRow(tr('Pigment & palette', 'Pigmento e palette'), cfg.defaults.sketchPigment, 0, 1, .01,
      value => updateDefault('sketchPigment', value, null, false), value => Math.round(value * 100) + '%').root);
    illustration.body.appendChild(deps.sliderRow(tr('Pigment colour noise', 'Noise colore pigmento'), cfg.defaults.sketchColorNoise, 0, 1, .01,
      value => updateDefault('sketchColorNoise', value, null, false), value => Math.round(value * 100) + '%').root);
    illustration.body.appendChild(deps.sliderRow(tr('Sketch colour', 'Colore sketch'), cfg.defaults.sketchSaturation, 0, 2, .01,
      value => updateDefault('sketchSaturation', value, null, false), value => (+value).toFixed(2) + '×').root);
    illustration.body.appendChild(deps.sliderRow(tr('Sketch light gain', 'Gain luce sketch'), cfg.defaults.sketchLightGain, .25, 3, .01,
      value => updateDefault('sketchLightGain', value, null, false), value => (+value).toFixed(2) + '×').root);
    illustration.body.appendChild(deps.sliderRow(tr('Atmosphere & transparent FX', 'Atmosfera ed effetti trasparenti'), cfg.defaults.sketchAtmosphere, 0, 1, .01,
      value => updateDefault('sketchAtmosphere', value, null, false), value => Math.round(value * 100) + '%').root);
    illustration.body.appendChild(deps.sliderRow(tr('Paper grain', 'Grana carta'), cfg.defaults.sketchPaper, 0, 1, .01,
      value => updateDefault('sketchPaper', value, null, false), value => Math.round(value * 100) + '%').root);
    illustration.body.appendChild(deps.checkRow(tr('Global black & white filter', 'Filtro globale bianco e nero'), cfg.defaults.monochrome === true,
      value => updateDefault('monochrome', value, tr('Updating the global monochrome filter…', 'Aggiornamento filtro monocromatico globale…'), false)).root);
    illustration.body.appendChild(deps.el('<div class="lk-hint">' + tr(
      'Painted Storybook filters surface colour, shadow bands, highlights and every composited atmospheric pixel. Paper Pencil is high-key and graphite-led; Illustrated Ink is the stronger graphic treatment. Black & white remains independent and each material can still define its own pigment response.',
      'Racconto dipinto filtra colore delle superfici, fasce d’ombra, luci e ogni pixel atmosferico compositato. Matita su carta è chiara e guidata dalla grafite; Inchiostro illustrato è il trattamento più grafico. Il bianco e nero resta indipendente e ogni materiale può ancora definire la propria risposta del pigmento.'
    ) + '</div>'));
    defaultsPanel.appendChild(illustration.root);

    const authorOutput=deps.section(tr('AUTHOR OUTPUT OVERRIDE', 'OVERRIDE OUTPUT AUTORE'), true);
    authorOutput.body.appendChild(deps.checkRow(
      tr('Force authored sketch appearance', 'Forza aspetto sketch dell’autore'),
      cfg.authority.visualStyle==='author',
      value=>{const next=config();next.authority.visualStyle=value?'author':'player';commit(next,tr('Updating author sketch authority…','Aggiornamento autorità sketch autore…'),false);}
    ).root);
    authorOutput.body.appendChild(deps.checkRow(
      tr('Force authored black & white', 'Forza bianco e nero dell’autore'),
      cfg.authority.monochrome==='author',
      value=>{const next=config();next.authority.monochrome=value?'author':'player';commit(next,tr('Updating author monochrome authority…','Aggiornamento autorità monocromatica autore…'),false);}
    ).root);
    authorOutput.body.appendChild(deps.el('<div class="lk-hint">'+tr(
      'The two locks are independent. The first forces style, medium, ink, detail, pigment, atmosphere and paper values; the second forces the authored black & white value (on or off). Enable either one or both. Players can still change every unlocked setting.',
      'I due blocchi sono indipendenti. Il primo forza stile, supporto, inchiostro, dettaglio, pigmento, atmosfera e carta; il secondo forza il valore bianco e nero scelto dall’autore (attivo o disattivo). Puoi abilitarne uno o entrambi. Il giocatore può ancora cambiare tutte le impostazioni non bloccate.'
    )+'</div>'));
    defaultsPanel.appendChild(authorOutput.root);

    const features = deps.section(tr('LIGHTING FEATURES', 'FUNZIONI ILLUMINAZIONE'), true);
    [
      ['shadows', tr('Dynamic shadows', 'Ombre dinamiche')],
      ['reflections', tr('Material reflections', 'Riflessi materiali')],
      ['volumetricLighting', tr('Volumetric lighting', 'Illuminazione volumetrica')],
      ['cinematicLensFlares', tr('Cinematic lens flares', 'Lens flare cinematici')],
    ].forEach(item => features.body.appendChild(deps.checkRow(item[1], cfg.defaults[item[0]], value => updateDefault(item[0], value)).root));
    defaultsPanel.appendChild(features.root);

    const ao = deps.section(tr('AMBIENT OCCLUSION · r185 GTAO','OCCLUSIONE AMBIENTALE · GTAO r185'), false);
    ao.body.appendChild(deps.checkRow(tr('Ground-truth ambient occlusion','Occlusione ambientale ground-truth'),cfg.defaults.ambientOcclusion!==false,value=>updateDefault('ambientOcclusion',value,tr('Updating GTAO…','Aggiornamento GTAO…'))).root);
    ao.body.appendChild(deps.selectRow(tr('AO quality','Qualità AO'),cfg.defaults.aoQuality,[{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'},{value:'ultra',label:'Ultra'}],value=>updateDefault('aoQuality',value,tr('Rebuilding GTAO buffers…','Ricostruzione buffer GTAO…'))).root);
    ao.body.appendChild(deps.el('<div class="lk-hint">'+tr('r185 GTAO adds contact depth without rewriting authored materials. Higher profiles increase samples and denoising cost; Medium is the guided default.','Il GTAO r185 aggiunge profondità di contatto senza modificare i materiali creati. I profili superiori aumentano campioni e costo del denoise; Medium è il default consigliato.')+'</div>'));
    defaultsPanel.appendChild(ao.root);

    const reflections = deps.section(tr('SCREEN-SPACE REFLECTIONS', 'RIFLESSI SCREEN-SPACE'), false);
    reflections.body.appendChild(deps.selectRow(tr('Reflection quality', 'Qualita riflessi'), cfg.defaults.reflectionQuality, [
      {value:'low',label:tr('Low', 'Bassa')}, {value:'medium',label:tr('Medium', 'Media')},
      {value:'high',label:tr('High', 'Alta')}, {value:'ultra',label:'Ultra'},
    ], value => updateDefault('reflectionQuality', value, tr('Rebuilding screen-space reflections…', 'Ricostruzione riflessi screen-space…'))).root);
    reflections.body.appendChild(deps.sliderRow(tr('Ray reach', 'Portata raggi'), cfg.defaults.reflectionDistance, 5, 120, 1, value => updateDefault('reflectionDistance', value), value => Math.round(value) + ' m').root);
    reflections.body.appendChild(deps.el('<div class="lk-hint">' + tr('Quality controls the SSR buffer resolution and hit precision. Ray reach is the maximum reflected distance; use the shortest value that covers the scene. Screen-space reflections can only reproduce objects currently visible by the camera.', 'La qualita controlla la risoluzione del buffer SSR e la precisione degli impatti. La portata raggi e la distanza massima riflessa: usa il valore minimo che copre la scena. I riflessi screen-space possono riprodurre solo oggetti attualmente visibili dalla camera.') + '</div>'));
    defaultsPanel.appendChild(reflections.root);

    const shadow = deps.section(tr('SUN SHADOWS', 'OMBRE DEL SOLE'), false);
    shadow.body.appendChild(deps.selectRow(tr('Shadow quality', 'Qualita ombre'), cfg.defaults.shadowQuality, [
      {value:'auto',label:tr('Automatic from quality', 'Automatica dalla qualita')},
      {value:'low',label:'Low · 512'}, {value:'medium',label:'Medium · 1024'},
      {value:'high',label:'High · 2048'}, {value:'ultra',label:'Ultra · 4096'},
    ], value => updateDefault('shadowQuality', value, tr('Rebuilding shadow maps…', 'Ricostruzione shadow map…'))).root);
    shadow.body.appendChild(deps.sliderRow(tr('Coverage distance', 'Distanza copertura'), cfg.defaults.shadowDistance, 15, 180, 1, value => updateDefault('shadowDistance', value), value => Math.round(value) + ' m').root);
    shadow.body.appendChild(deps.sliderRow('Bias', cfg.defaults.shadowBias, -.01, .01, .00005, value => updateDefault('shadowBias', value), value => (+value).toFixed(5)).root);
    shadow.body.appendChild(deps.sliderRow('Normal bias', cfg.defaults.shadowNormalBias, 0, .2, .001, value => updateDefault('shadowNormalBias', value), value => (+value).toFixed(3)).root);
    shadow.body.appendChild(deps.sliderRow(tr('Softness', 'Morbidezza'), cfg.defaults.shadowSoftness, 0, 2, .05, value => updateDefault('shadowSoftness', value), value => (+value).toFixed(2)).root);
    shadow.body.appendChild(deps.el('<div class="lk-hint">' + tr('Use the smallest coverage that contains gameplay. Normal bias removes surface acne; excessive values detach shadows from objects.', 'Usa la copertura minima che contiene il gameplay. Normal bias elimina l\'acne sulle superfici; valori eccessivi staccano le ombre dagli oggetti.') + '</div>'));
    defaultsPanel.appendChild(shadow.root);

    if(backend){
      const performance=deps.section(tr('PERFORMANCE & DIAGNOSTICS','PRESTAZIONI E DIAGNOSTICA'),false),renderer=GAME&&GAME.core&&GAME.core.renderer;
      const telemetry=deps.el('<div class="lk-ps-summary lk-render-telemetry"></div>');
      const drawTelemetry=()=>{const data=backend.metrics?backend.metrics(renderer):{};telemetry.innerHTML='';[[tr('Draw calls','Draw call'),data.calls||0],[tr('Triangles','Triangoli'),data.triangles||0],[tr('Textures','Texture'),data.textures||0],[tr('Geometries','Geometrie'),data.geometries||0],[tr('Programs','Programmi'),data.programs||0],[tr('Framebuffer est.','Framebuffer stimato'),data.estimatedFramebufferBytes?(data.estimatedFramebufferBytes/1048576).toFixed(1)+' MB':'—']].forEach(item=>{const card=deps.el('<div><small></small><b></b></div>');card.querySelector('small').textContent=item[0];card.querySelector('b').textContent=item[1];telemetry.appendChild(card);});};drawTelemetry();performance.body.appendChild(telemetry);
      const refresh=deps.el('<button type="button" class="lk-ps-action">↻ '+tr('Refresh GPU counters','Aggiorna contatori GPU')+'</button>');refresh.addEventListener('click',drawTelemetry);performance.body.appendChild(refresh);
      const session=backend.sessionOverrides?backend.sessionOverrides():{renderScale:1};performance.body.appendChild(deps.sliderRow(tr('Session render scale','Scala rendering sessione'),session.renderScale,.5,2,.05,value=>{backend.setSessionOverrides({renderScale:value});if(GAME.settings&&GAME.settings.setVideoProject)GAME.settings.setVideoProject(config(),{heavy:true,message:tr('Applying session render scale…','Applicazione scala rendering sessione…')});drawTelemetry();},value=>Math.round(Number(value)*100)+'%').root);
      const reset=deps.el('<button type="button" class="lk-ps-action">'+tr('Reset session diagnostics','Ripristina diagnostica sessione')+'</button>');reset.addEventListener('click',()=>{backend.clearSessionOverrides();if(GAME.settings&&GAME.settings.setVideoProject)GAME.settings.setVideoProject(config(),{heavy:true,message:tr('Resetting session diagnostics…','Ripristino diagnostica sessione…')});if(deps.status)deps.status(tr('Session-only rendering overrides reset.','Override rendering della sessione ripristinati.'));});performance.body.appendChild(reset);
      const warm=backend.warmupStatus?backend.warmupStatus(renderer):null;performance.body.appendChild(deps.el('<div class="lk-hint">'+tr('Pipeline warm-up: ','Warm-up pipeline: ')+(warm&&warm.state||'idle')+' · '+tr('Session scale is never saved into the project.','La scala sessione non viene mai salvata nel progetto.')+'</div>'));
      defaultsPanel.appendChild(performance.root);
    }

    const warnings=[];
    if(cfg.defaults.quality==='extreme'&&cfg.defaults.antialiasing==='ssaa4x')warnings.push(tr('Extreme + SSAA 4× can exceed the fill-rate budget even on high-end GPUs.','Extreme + SSAA 4× può superare il budget fill-rate anche su GPU di fascia alta.'));
    if(cfg.defaults.shadowQuality==='ultra'&&cfg.defaults.shadowDistance>100)warnings.push(tr('Ultra shadows over 100 m consume substantial shadow memory; reduce coverage first.','Le ombre Ultra oltre 100 m consumano molta memoria; riduci prima la copertura.'));
    if(backendReport&&backendReport.fallbackReason)warnings.push(backendReport.fallbackReason);
    if(warnings.length){const guided=deps.section(tr('GUIDED WARNINGS','AVVISI GUIDATI'),true);warnings.forEach(message=>guided.body.appendChild(deps.el('<div class="lk-hint lk-render-backend-warning"></div>')));Array.from(guided.body.children).forEach((node,index)=>{node.textContent=warnings[index];});defaultsPanel.appendChild(guided.root);}

    exposedPanel.appendChild(deps.el('<div class="lk-hint lk-render-exposure-hint">' + tr('Choose what players can change in Video. Hidden controls keep the project default configured in the first tab.', 'Scegli cosa puo cambiare il giocatore in Video. I controlli nascosti mantengono il default progetto configurato nella prima tab.') + '</div>'));
    const expose = deps.section(tr('PLAYER VIDEO MENU', 'MENU VIDEO GIOCATORE'), true);
    [
      ['quality', tr('Quality presets', 'Preset qualita')],
      ['rendererMode', tr('Rendering pipeline', 'Pipeline rendering')],
      ['antialiasing', tr('Antialiasing', 'Antialiasing')],
      ['exposure', tr('Exposure / brightness', 'Esposizione / luminosita')],
      ['visualStyle', tr('Illustrated scene style', 'Stile scena illustrato')],
      ['sketchMedium', tr('Sketch medium', 'Supporto sketch')],
      ['sketchStrength', tr('Sketch ink strength', 'Forza inchiostro sketch')],
      ['sketchDetail', tr('Sketch line detail', 'Dettaglio linee sketch')],
      ['sketchHatching', tr('Sketch hatching / grid', 'Tratteggio / griglia sketch')],
      ['sketchLineNoise', tr('Drawn-line noise', 'Noise linea disegnata')],
      ['sketchPigment', tr('Sketch pigment & palette', 'Pigmento e palette sketch')],
      ['sketchColorNoise', tr('Sketch pigment noise', 'Noise pigmento sketch')],
      ['sketchSaturation', tr('Sketch colour amount', 'Quantità colore sketch')],
      ['sketchLightGain', tr('Sketch light gain', 'Gain luce sketch')],
      ['sketchAtmosphere', tr('Sketch atmosphere & FX', 'Atmosfera ed effetti sketch')],
      ['sketchPaper', tr('Sketch paper grain', 'Grana carta sketch')],
      ['monochrome', tr('Global black & white', 'Bianco e nero globale')],
      ['shadows', tr('Dynamic shadows', 'Ombre dinamiche')],
      ['shadowQuality', tr('Shadow quality', 'Qualita ombre')],
      ['ambientOcclusion',tr('Ambient occlusion','Occlusione ambientale')],
      ['aoQuality',tr('AO quality','Qualità AO')],
      ['reflections', tr('Material reflections', 'Riflessi materiali')],
      ['reflectionQuality', tr('Reflection quality', 'Qualita riflessi')],
      ['reflectionDistance', tr('Reflection ray reach', 'Portata raggi riflessi')],
      ['volumetricLighting', tr('Volumetric lighting', 'Illuminazione volumetrica')],
      ['cinematicLensFlares', tr('Cinematic lens flares', 'Lens flare cinematici')],
    ].forEach(item => expose.body.appendChild(deps.checkRow(item[1], cfg.exposed[item[0]], value => {
      const next = config();
      next.exposed[item[0]] = value;
      commit(next, tr('Updating the player video menu…', 'Aggiornamento menu video giocatore…'), false);
    }).root));
    exposedPanel.appendChild(expose.root);
  }

  return Object.freeze({build});
}

window.LK_EDITOR_RENDERING_INSPECTOR = Object.freeze({create});
})();
