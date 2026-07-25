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

    const updateDefault = (key, value, message) => {
      const next = config();
      next.defaults[key] = value;
      commit(next, message);
    };
    const pipeline = deps.section(tr('OUTPUT & PIPELINE', 'OUTPUT E PIPELINE'), true);
    if(backend){
      pipeline.body.appendChild(deps.selectRow(tr('GPU backend preference','Preferenza backend GPU'),backend.preference(),[
        {value:'auto',label:tr('Auto · recommended','Auto · consigliato')},{value:'webgpu',label:'WebGPU · experimental'},{value:'webgl',label:'WebGL 2 · stable'},
      ],value=>{backend.setPreference(value);if(deps.status)deps.status(tr('Backend preference saved. Reopen the editor to rebuild the GPU device.','Preferenza backend salvata. Riapri l’editor per ricostruire il dispositivo GPU.'));}).root);
      const caps=backendReport&&backendReport.capabilities||backend.syncCapabilities();
      const info=deps.el('<div class="lk-ps-summary lk-render-backend-summary"></div>');
      [[tr('Active','Attivo'),backendReport&&backendReport.effective||'webgl'],['WebGPU API',caps.webgpuApi?'ready':'unavailable'],['Three r185',caps.revision||'unknown'],[tr('GPU','GPU'),backendReport&&backendReport.gpu||tr('probing…','rilevamento…')]].forEach(item=>{const card=deps.el('<div><small></small><b></b></div>');card.querySelector('small').textContent=item[0];card.querySelector('b').textContent=item[1];info.appendChild(card);});
      pipeline.body.appendChild(info);
      const support=backend.featureSupport?backend.featureSupport(GAME&&GAME.core&&GAME.core.renderer):{};
      const limits=deps.el('<div class="lk-ps-summary lk-render-capability-summary"></div>');
      [[tr('Vendor','Produttore'),backendReport&&backendReport.vendor||'—'],[tr('Max texture','Texture massima'),backendReport&&backendReport.maxTextureSize?backendReport.maxTextureSize+' px':'—'],['MSAA',backendReport&&backendReport.maxSamples?backendReport.maxSamples+'×':'—'],['GTAO',support.gtao?'ready':'unavailable'],['Compute',support.compute?'ready':'unavailable'],['LightProbeGrid',support.lightProbeGrid?'ready':'unavailable']].forEach(item=>{const card=deps.el('<div><small></small><b></b></div>');card.querySelector('small').textContent=item[0];card.querySelector('b').textContent=item[1];limits.appendChild(card);});
      pipeline.body.appendChild(limits);
      if(backendReport&&backendReport.fallbackReason)pipeline.body.appendChild(deps.el('<div class="lk-hint lk-render-backend-warning">'+backendReport.fallbackReason+'</div>'));
    }
    pipeline.body.appendChild(deps.selectRow(tr('Renderer', 'Renderer'), cfg.defaults.rendererMode, [
      {value:'webgl', label:tr('Normal (WebGL)', 'Normale (WebGL)')},
      {value:'raytracing', label:tr('Ray lighting', 'Ray lighting')},
    ], value => updateDefault('rendererMode', value, tr('Switching project rendering pipeline…', 'Cambio pipeline rendering progetto…'))).root);
    pipeline.body.appendChild(deps.selectRow(tr('Default quality', 'Qualita predefinita'), cfg.defaults.quality, [
      {value:'low',label:'Low'}, {value:'medium',label:'Medium'}, {value:'high',label:'High'},
      {value:'superhigh',label:'Super High'}, {value:'extreme',label:'Extreme'},
    ], value => updateDefault('quality', value, tr('Applying project quality preset…', 'Applicazione preset qualita progetto…'))).root);
    pipeline.body.appendChild(deps.selectRow(tr('Antialiasing', 'Antialiasing'), cfg.defaults.antialiasing, [
      {value:'off',label:tr('Off', 'Disattivato')}, {value:'fxaa',label:'FXAA (mobile)'},
      {value:'ssaa2x',label:'Supersampling 2×'}, {value:'ssaa4x',label:'Supersampling 4×'},
    ], value => updateDefault('antialiasing', value, tr('Rebuilding the render surface…', 'Ricostruzione superficie di rendering…'))).root);
    pipeline.body.appendChild(deps.sliderRow(tr('Exposure', 'Esposizione'), cfg.defaults.exposure, .7, 1.6, .01, value => updateDefault('exposure', value, tr('Updating scene exposure…', 'Aggiornamento esposizione scena…')), value => (+value).toFixed(2) + '×').root);
    pipeline.body.appendChild(deps.el('<div class="lk-hint">' + tr('Backend selects the GPU API and requires a renderer restart. Rendering mode controls the visual pipeline inside that backend. Auto always keeps a validated WebGL fallback.', 'Backend seleziona l’API GPU e richiede il riavvio del renderer. La modalità rendering controlla la pipeline visiva nel backend. Auto mantiene sempre un fallback WebGL verificato.') + '</div>'));
    defaultsPanel.appendChild(pipeline.root);

    const features = deps.section(tr('LIGHTING FEATURES', 'FUNZIONI ILLUMINAZIONE'), true);
    [
      ['shadows', tr('Dynamic shadows', 'Ombre dinamiche')],
      ['reflections', tr('Material reflections', 'Riflessi materiali')],
      ['volumetricLighting', tr('Volumetric lighting', 'Illuminazione volumetrica')],
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
      ['shadows', tr('Dynamic shadows', 'Ombre dinamiche')],
      ['shadowQuality', tr('Shadow quality', 'Qualita ombre')],
      ['ambientOcclusion',tr('Ambient occlusion','Occlusione ambientale')],
      ['aoQuality',tr('AO quality','Qualità AO')],
      ['reflections', tr('Material reflections', 'Riflessi materiali')],
      ['reflectionQuality', tr('Reflection quality', 'Qualita riflessi')],
      ['reflectionDistance', tr('Reflection ray reach', 'Portata raggi riflessi')],
      ['volumetricLighting', tr('Volumetric lighting', 'Illuminazione volumetrica')],
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
