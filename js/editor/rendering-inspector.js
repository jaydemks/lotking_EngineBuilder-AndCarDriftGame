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
    const pipeline = deps.section(tr('PIPELINE', 'PIPELINE'), true);
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
    pipeline.body.appendChild(deps.el('<div class="lk-hint">' + tr('Low and Medium reduce internal resolution and shadow maps for mobile. Ray lighting adds a visible indirect-light/reflection pass while retaining the WebGL compatibility path.', 'Low e Medium riducono risoluzione interna e shadow map per mobile. Ray lighting aggiunge un pass visibile di luce indiretta/riflessi mantenendo la compatibilita WebGL.') + '</div>'));
    defaultsPanel.appendChild(pipeline.root);

    const features = deps.section(tr('RENDER FEATURES', 'FUNZIONI RENDER'), true);
    [
      ['shadows', tr('Dynamic shadows', 'Ombre dinamiche')],
      ['reflections', tr('Material reflections', 'Riflessi materiali')],
      ['volumetricLighting', tr('Volumetric lighting', 'Illuminazione volumetrica')],
    ].forEach(item => features.body.appendChild(deps.checkRow(item[1], cfg.defaults[item[0]], value => updateDefault(item[0], value)).root));
    defaultsPanel.appendChild(features.root);

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

    exposedPanel.appendChild(deps.el('<div class="lk-hint lk-render-exposure-hint">' + tr('Choose what players can change in Video. Hidden controls keep the project default configured in the first tab.', 'Scegli cosa puo cambiare il giocatore in Video. I controlli nascosti mantengono il default progetto configurato nella prima tab.') + '</div>'));
    const expose = deps.section(tr('PLAYER VIDEO MENU', 'MENU VIDEO GIOCATORE'), true);
    [
      ['quality', tr('Quality presets', 'Preset qualita')],
      ['rendererMode', tr('Rendering pipeline', 'Pipeline rendering')],
      ['antialiasing', tr('Antialiasing', 'Antialiasing')],
      ['exposure', tr('Exposure / brightness', 'Esposizione / luminosita')],
      ['shadows', tr('Dynamic shadows', 'Ombre dinamiche')],
      ['shadowQuality', tr('Shadow quality', 'Qualita ombre')],
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
