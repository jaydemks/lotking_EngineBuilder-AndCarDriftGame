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
    pipeline.body.appendChild(deps.el('<div class="lk-hint">' + tr('Low and Medium reduce internal resolution and shadow maps for mobile. Ray lighting adds a visible indirect-light/reflection pass while retaining the WebGL compatibility path.', 'Low e Medium riducono risoluzione interna e shadow map per mobile. Ray lighting aggiunge un pass visibile di luce indiretta/riflessi mantenendo la compatibilita WebGL.') + '</div>'));
    defaultsPanel.appendChild(pipeline.root);

    const features = deps.section(tr('RENDER FEATURES', 'FUNZIONI RENDER'), true);
    [
      ['shadows', tr('Dynamic shadows', 'Ombre dinamiche')],
      ['reflections', tr('Material reflections', 'Riflessi materiali')],
      ['volumetricLighting', tr('Volumetric lighting', 'Illuminazione volumetrica')],
    ].forEach(item => features.body.appendChild(deps.checkRow(item[1], cfg.defaults[item[0]], value => updateDefault(item[0], value)).root));
    defaultsPanel.appendChild(features.root);

    exposedPanel.appendChild(deps.el('<div class="lk-hint lk-render-exposure-hint">' + tr('Choose what players can change in Video. Hidden controls keep the project default configured in the first tab.', 'Scegli cosa puo cambiare il giocatore in Video. I controlli nascosti mantengono il default progetto configurato nella prima tab.') + '</div>'));
    const expose = deps.section(tr('PLAYER VIDEO MENU', 'MENU VIDEO GIOCATORE'), true);
    [
      ['quality', tr('Quality presets', 'Preset qualita')],
      ['rendererMode', tr('Rendering pipeline', 'Pipeline rendering')],
      ['antialiasing', tr('Antialiasing', 'Antialiasing')],
      ['shadows', tr('Dynamic shadows', 'Ombre dinamiche')],
      ['reflections', tr('Material reflections', 'Riflessi materiali')],
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
