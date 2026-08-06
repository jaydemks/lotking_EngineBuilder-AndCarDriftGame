/* =========================================================
   LOT KING — editor lazy loader
   Keeps the gameplay runtime light: editor CSS and the full editor are
   loaded only on demand. Three.js addons come from the pinned local bundle.
   ========================================================= */
(function(){
'use strict';

let loading = null;
const EDITOR_SCRIPT_STAGES = Object.freeze([
  // runtime input/UI modules — loaded here too so the editor works even if the
  // host page HTML was cached before these were added (skipped if already present)
  [.73, 'loading window manager', 'js/runtime/ui/window-manager.js?v=0.7.8-viewport-clamp-1'],
  [.7305, 'loading authorable UI Elements', 'js/runtime/ui-elements.js?v=0.7.8-authorable-ui-1'],
  [.731, 'loading gameplay difficulty', 'js/runtime/gameplay-difficulty.js?v=0.7.4-gameplay-difficulty-1'],
  [.735, 'loading input actions', 'js/runtime/input/input-actions.js?v=0.7.8-tow-action-1'],
  [.74, 'loading input devices', 'js/runtime/input/input-devices.js?v=0.7.8-input-context-v15-4'],
  [.745, 'loading input manager', 'js/runtime/input/input-manager.js?v=0.7.8-input-context-v15-4'],
  [.747, 'loading player action router', 'js/runtime/input/player-action-router.js?v=0.7.8-vehicle-exit-respawn-1'],
  [.748, 'loading Player output authority', 'js/runtime/player-output-resolver.js?v=0.7.8-player-output-authority-1'],
  [.75, 'loading device visuals', 'js/runtime/input/device-visuals.js?v=0.7.8-cache-sweep-1'],
	  [.755, 'loading mapping overlay', 'js/runtime/input/mapping-overlay.js?v=0.7.8-cache-sweep-1'],
  [.7555, 'loading P2P wire protocol', 'js/runtime/p2p-protocol.js?v=0.7.8-session-monitor-1'],
  [.75551, 'loading P2P session transport', 'js/runtime/p2p-session.js?v=0.7.8-session-monitor-1'],
  [.75552, 'loading P2P replication', 'js/runtime/p2p-replication.js?v=0.7.8-host-migration-1'],
  [.75553, 'loading P2P multiplayer director', 'js/runtime/p2p-multiplayer-director.js?v=0.7.8-session-lifetime-1'],
	  [.756, 'loading plugin api', 'js/plugins/plugin-api.js?v=0.7.8-asset-provider-1'],
	  [.757, 'loading plugin manager', 'js/plugins/plugin-manager.js?v=0.7.8-cache-sweep-1'],
	  [.758, 'loading logic element plugin', 'js/plugins/logic-element-plugin.js?v=0.7.8-cache-sweep-1'],
	  [.7582, 'loading shared damage contract', 'js/runtime/combat/damage-contract.js?v=0.7.8-actor-foundations-3'],
	  [.75825, 'loading vehicle energy and damage', 'js/runtime/vehicle-damage.js?v=0.7.8-vehicle-exit-prewarm-1'],
	  [.7583, 'loading Pawn death physics', 'js/runtime/physics/pawn-death-physics.js?v=0.7.8-horizontal-surface-1'],
	  [.7584, 'loading portable cloth runtime', 'js/runtime/cloth-system.js?v=0.7.4-cloth-studio-2'],
	  [.758405, 'loading Character skeletal blending', 'js/runtime/character-animation-blend.js?v=0.7.8-fire-loop-1'],
	  [.75841, 'loading procedural Animal Pawn', 'js/runtime/animal-placeholder-locomotion.js?v=0.7.8-stair-pose-1'],
	  [.75842, 'loading Animal Pawn runtime', 'js/runtime/animal-pawns.js?v=0.7.8-stair-pose-1'],
	  [.758423, 'loading first-person presentation Pawn', 'js/runtime/first-person-view-pawn.js?v=0.7.8-first-person-view-pawn-1'],
	  [.758425, 'loading Actor combat facade', 'js/runtime/combat/actor-combat.js?v=0.7.8-actor-foundations-3'],
	  [.758428, 'loading Actor cover planner', 'js/runtime/ai/actor-cover-planner.js?v=0.7.8-horizontal-surface-1'],
	  [.75843, 'loading Actor behaviour runtime', 'js/runtime/ai/actor-behavior.js?v=0.7.8-horizontal-surface-1'],
	  [.75844, 'loading per-vehicle Engine Sound', 'js/runtime/vehicle-engine-audio.js?v=0.7.8-vehicle-exit-prewarm-1'],
	  [.758455, 'loading character implementations', 'js/runtime/character-implementations.js?v=0.7.8-vehicle-mixer-wreck-1'],
	  [.758452, 'loading vehicle occupancy contract', 'js/runtime/vehicle-occupancy.js?v=0.7.8-high-poly-seat-default-1'],
	  [.758453, 'loading physical vehicle dismount policy', 'js/runtime/character-vehicle-dismount.js?v=0.7.8-physical-dismount-1'],
	  [.75845, 'loading DollBody pawn runtime', 'js/runtime/sketchbook-pawns.js?v=0.7.8-piloted-landing-1'],
	  [.7585, 'loading FBX import plugin', 'js/plugins/fbx-import-plugin.js?v=1.0.3-rig-repair'],
	  [.7586, 'loading Cloth Studio plugin', 'js/plugins/cloth-authoring-plugin.js?v=0.7.4-cloth-studio-2'],
	  [.75869, 'loading P2P cowork locks', 'js/plugins/p2p-cowork-locks.js?v=0.7.8-cowork-locks-1'],
	  [.7587, 'loading P2P collaboration plugin', 'js/plugins/p2p-collaboration-plugin.js?v=0.7.8-session-monitor-1'],
	  [.75871, 'loading Blender Live Link protocol', 'js/plugins/blender-live-link-core.js?v=0.7.8-blender-binary-scene-1'],
	  [.75872, 'loading Blender Live Link plugin', 'js/plugins/blender-live-link-plugin.js?v=0.7.8-live-link-experimental-1'],
	  [.76, 'loading logic graph', 'js/logic/logic-graph.js?v=0.7.8-crouch-pace-1'],
  [.7605, 'loading logic exporter', 'js/logic/logic-exporter.js?v=0.7.8-cache-sweep-1'],
  [.761, 'loading logic templates', 'js/logic/logic-templates.js?v=0.7.8-vehicle-damage-1'],
  [.76105, 'loading UI Element templates', 'js/logic/logic-templates-ui.js?v=0.7.8-authorable-ui-1'],
  [.7611, 'loading DollBody templates', 'js/logic/logic-templates-sketchbook.js?v=0.7.8-vehicle-mixer-wreck-1'],
  [.76111, 'loading extended vehicle templates', 'js/logic/logic-templates-vehicle-pack.js?v=0.7.8-extended-vehicle-pack-2'],
  [.76111, 'loading soccer tactics', 'js/runtime/soccer-tactics.js?v=0.7.8-soccer-11v11-1'],
  [.76112, 'loading soccer team AI', 'js/runtime/soccer-team-ai.js?v=0.7.8-soccer-11v11-1'],
  [.76115, 'loading soccer match flow', 'js/runtime/soccer-match-flow.js?v=0.7.8-soccer-match-1'],
  [.7612, 'loading soccer templates', 'js/logic/logic-templates-soccer.js?v=0.7.8-player-ownership-1'],
  [.76125, 'loading network templates', 'js/logic/logic-templates-network.js?v=0.7.8-session-lifetime-1'],
	  [.7614, 'loading character templates', 'js/logic/logic-templates-character.js?v=0.7.8-crouch-pace-1'],
	  [.761405, 'loading first-person templates', 'js/logic/logic-templates-fps.js?v=0.7.8-crouch-pace-1'],
  [.76141, 'loading Animal Pawn templates', 'js/logic/logic-templates-animal.js?v=0.7.8-player-ownership-1'],
  [.76142, 'loading Animal Pawn logic nodes', 'js/logic/logic-nodes-animal.js?v=0.7.8-animal-1'],
  [.7615, 'loading mission templates', 'js/logic/logic-templates-mission.js?v=0.7.8-objectives-1'],
  [.762, 'loading logic registry', 'js/logic/logic-registry.js?v=0.7.8-cache-sweep-1'],
  [.763, 'loading logic validator', 'js/logic/logic-validator.js?v=0.7.8-cache-sweep-1'],
  [.764, 'loading logic services', 'js/logic/logic-services.js?v=0.7.8-cinema-exit-blend-1'],
  [.765, 'loading logic runtime', 'js/logic/logic-runtime.js?v=0.7.8-authorable-ui-1'],
  [.766, 'loading logic nodes', 'js/logic/logic-nodes-mvp.js?v=0.7.8-cinema-exit-blend-1'],
  [.7661, 'loading UI Element logic nodes', 'js/logic/logic-nodes-ui.js?v=0.7.8-authorable-ui-1'],
  [.7662, 'loading soccer logic nodes', 'js/logic/logic-nodes-soccer.js?v=0.7.8-cache-sweep-1'],
  [.7664, 'loading character logic nodes', 'js/logic/logic-nodes-character.js?v=0.7.8-cache-sweep-1'],
  [.76645, 'loading weather logic nodes', 'js/logic/logic-nodes-weather.js?v=0.7.8-weather-1'],
  [.76648, 'loading weather director', 'js/runtime/weather-system.js?v=0.7.8-weather-1'],
  [.7665, 'loading objective logic nodes', 'js/logic/logic-nodes-objectives.js?v=0.7.8-objectives-1'],
  [.76655, 'loading objective HUD', 'js/runtime/objective-hud.js?v=0.7.8-objectives-1'],
  [.76656, 'loading objective director', 'js/runtime/objective-system.js?v=0.7.8-objectives-1'],
  [.7666, 'loading network logic nodes', 'js/logic/logic-nodes-network.js?v=0.7.8-p2p-session-2'],
  // The registry must exist before any level-template module runs: each one
  // self-registers, and a cached HTML shell may predate these entries.
  [.7667, 'loading level template registry', 'js/engine/level-template-registry.js?v=0.7.8-level-templates-1'],
  [.76672, 'loading character level template', 'js/runtime/character-level-template.js?v=0.7.8-wall-flip-run-tuning-1'],
  [.76674, 'loading penalty shootout template', 'js/runtime/penalty-shootout-level-template.js?v=0.7.8-level-templates-1'],
  [.76675, 'loading soccer 11v11 match template', 'js/runtime/soccer-match-level-template.js?v=0.7.8-soccer-11v11-1'],
  [.76676, 'loading FPS arena template', 'js/runtime/fps-arena-level-template.js?v=0.7.8-unified-body-camera-1'],
  [.76677, 'loading open world districts', 'js/runtime/open-world-districts.js?v=0.7.8-aaaa-1'],
  [.766775, 'loading open world streaming', 'js/runtime/open-world-streaming.js?v=0.7.8-aaaa-1'],
  [.7668, 'loading DollBody open world template', 'js/runtime/sketchbook-open-world-level-template.js?v=0.7.8-vehicle-mixer-wreck-1'],
  [.766815, 'loading snow terrain', 'js/runtime/snow-terrain.js?v=0.7.8-aaaa-1'],
  [.766818, 'loading snow trail', 'js/runtime/snow-trail.js?v=0.7.8-webgpu-safe-1'],
  [.76682, 'loading snowboarding objective template', 'js/runtime/snowboarding-level-template.js?v=0.7.8-game-mode-templates-1'],
  [.76684, 'loading jungle car escape template', 'js/runtime/jungle-car-escape-level-template.js?v=0.7.8-game-mode-templates-1'],
  [.76686, 'loading FPS enemy outpost template', 'js/runtime/fps-enemy-outpost-level-template.js?v=0.7.8-wall-flip-run-tuning-1'],
  [.76688, 'loading cat neighborhood template', 'js/runtime/cat-neighborhood-level-template.js?v=0.7.8-game-mode-templates-1'],
  [.766895, 'loading P2P multiplayer template', 'js/runtime/p2p-multiplayer-level-template.js?v=0.7.8-session-lifetime-1'],
  [.767, 'loading logic runner', 'js/runtime/logic-elements-runner.js?v=0.7.8-vehicle-exit-prewarm-1'],
  [.795, 'loading editor core', 'js/editor/editor-core.js?v=0.7.8-asset-focus-1'],
  [.797, 'loading editor layout', 'js/editor/editor-layout.js?v=0.7.8-cache-sweep-1'],
  [.80, 'loading editor viewport tools', 'js/editor/viewport-picking.js?v=0.7.8-gpu-release-1'],
  [.805, 'loading editor viewport events', 'js/editor/viewport-events.js?v=0.7.8-cinema-spline-1'],
  [.81, 'loading editor fly camera', 'js/editor/fly-camera.js?v=0.7.8-cache-sweep-1'],
  [.815, 'loading editor gizmo controls', 'js/editor/gizmo-controls.js?v=0.7.8-pointer-recovery-1'],
  [.817, 'loading editor visual helpers', 'js/editor/visual-helpers.js?v=0.7.8-main-thread-stalls-1'],
  [.84, 'loading editor asset library', 'js/editor/asset-library.js?v=0.7.8-asset-origins-1'],
  [.85, 'loading editor asset imports', 'js/editor/asset-imports.js?v=0.7.8-material-map-storage-1'],
  [.86, 'loading editor status UI', 'js/editor/status-ui.js?v=0.7.8-cache-sweep-1'],
  [.87, 'loading editor dialogs', 'js/editor/dialogs.js?v=0.7.8-cache-sweep-1'],
  [.875, 'loading context menu', 'js/editor/context-menu.js?v=0.7.8-cache-sweep-1'],
  [.88, 'loading level manager', 'js/editor/level-manager.js?v=0.7.8-level-templates-1'],
  [.89, 'loading player blueprints', 'js/editor/player-blueprints.js?v=0.7.8-steering-wheel-2'],
  [.90, 'loading folder manager', 'js/editor/folder-manager.js?v=0.7.8-cache-sweep-1'],
  [.91, 'loading keyboard shortcuts', 'js/editor/keyboard-shortcuts.js?v=0.7.8-asset-focus-1'],
  [.92, 'loading thumbnails', 'js/editor/thumbnail-manager.js?v=0.7.8-main-thread-stalls-1'],
  [.925, 'loading floating layout', 'js/editor/floating-layout.js?v=0.7.8-cache-sweep-1'],
  [.927, 'loading storage manager', 'js/editor/storage-manager.js?v=0.7.4-storage-assistant-2'],
  [.928, 'loading editor preferences', 'js/editor/preferences.js?v=0.7.8-split-project-1'],
  [.9285, 'loading editor welcome', 'js/editor/welcome-overlay.js?v=0.7.8-cache-sweep-1'],
  [.929, 'loading quick audio controls', 'js/editor/quick-audio.js?v=0.7.4-audio-collision-1'],
  [.9295, 'loading editor template', 'js/editor/editor-template.js?v=0.7.8-project-history-1'],
  [.9296, 'loading developer debugger', 'js/editor/developer-debugger.js?v=0.7.8-idle-teardown-1'],
  [.9297, 'loading editor toolbar', 'js/editor/toolbar.js?v=0.7.8-split-project-1'],
  [.9298, 'loading side panel controls', 'js/editor/side-panels.js?v=0.7.8-cache-sweep-1'],
	  [.92985, 'loading editor menus', 'js/editor/editor-menus.js?v=0.7.8-cache-sweep-1'],
	  [.92986, 'loading application menu bar', 'js/editor/editor-menu-bar.js?v=0.7.8-split-project-1'],
	  [.9299, 'loading asset panel helpers', 'js/editor/asset-panel.js?v=0.7.8-procedural-library-1'],
  [.92991, 'loading asset properties', 'js/editor/asset-properties.js?v=0.7.8-main-thread-stalls-1'],
  [.92992, 'loading asset catalog', 'js/editor/asset-catalog.js?v=0.7.8-procedural-library-1'],
  [.92993, 'loading asset drag and drop', 'js/editor/asset-dnd.js?v=0.7.4-fbx-import-1'],
  [.92995, 'loading scene outliner', 'js/editor/outliner.js?v=0.7.8-preview-reliability-1'],
  [.929952, 'loading selection manager', 'js/editor/selection-manager.js?v=0.7.8-camera-preview-1'],
  [.929955, 'loading history manager', 'js/editor/history-manager.js?v=0.7.8-cowork-structure-1'],
  [.92996, 'loading project io', 'js/editor/project-io.js?v=0.7.8-manual-save-target-1'],
  [.929961, 'loading input settings', 'js/editor/input-settings.js?v=0.7.8-cache-sweep-1'],
  [.929965, 'loading add actions', 'js/editor/add-actions.js?v=0.7.8-procedural-library-1'],
  [.929967, 'loading scene menu actions', 'js/editor/scene-menu-actions.js?v=0.7.8-cache-sweep-1'],
  [.92997, 'loading inspector ui', 'js/editor/inspector-ui.js?v=0.7.8-cache-sweep-1'],
  [.929975, 'loading music library panel', 'js/editor/music-library-panel.js?v=0.7.4-audio-collision-1'],
  [.92998, 'loading material editor', 'js/editor/material-editor.js?v=0.7.8-material-map-storage-1'],
  [.929982, 'loading mesh editor', 'js/editor/mesh-editor.js?v=0.7.8-material-ux-1'],
  [.929985, 'loading object inspector', 'js/editor/object-inspector.js?v=0.7.8-cinema-exit-blend-1'],
  [.92999, 'loading player camera inspector', 'js/editor/player-camera-inspector.js?v=0.7.8-cockpit-motion-2'],
  [.929991, 'loading player collider inspector', 'js/editor/player-collider-inspector.js?v=0.7.4-smart-collider-dummies-1'],
  [.929992, 'loading player lights inspector', 'js/editor/player-lights-inspector.js?v=0.7.8-headlight-lens-1'],
  [.929994, 'loading player attachments inspector', 'js/editor/player-attachments-inspector.js?v=0.7.8-cache-sweep-1'],
  [.929996, 'loading player setup inspector', 'js/editor/player-setup-inspector.js?v=0.7.8-vehicle-damage-1'],
  [.929998, 'loading hud inspector', 'js/editor/hud-inspector.js?v=0.7.8-radar-top-left-4'],
  [.929999, 'loading environment inspector', 'js/editor/environment-inspector.js?v=0.7.8-procedural-world-1'],
  [.9299991, 'loading rendering inspector', 'js/editor/rendering-inspector.js?v=0.7.8-sketch-controls-1'],
  [.9299992, 'loading Pawn Studio', 'js/editor/pawn-studio.js?v=0.7.8-seat-master-rigid-1'],
  [.92999925, 'loading Animal Pawn Studio', 'js/editor/animal-pawn-studio.js?v=0.7.8-stair-pose-1'],
  [.9299993, 'loading logic inspector', 'js/editor/logic-elements-inspector.js?v=0.7.8-vehicle-damage-1'],
  [.9299995, 'loading inspector controller', 'js/editor/inspector-controller.js?v=0.7.8-inspector-latency-1'],
  [.92999955, 'loading cinema motion presets', 'js/editor/cinema-motion-presets.js?v=0.7.8-cinema-motion-presets-1'],
  [.9299995, 'loading cinema sequence runtime', 'js/runtime/cinema-sequence.js?v=0.7.8-cinema-exit-blend-1'],
  [.9299996, 'loading cinema studio', 'js/editor/cinema-studio.js?v=0.7.8-cinema-exit-blend-1'],
  [.92999962, 'loading cinema video exporter', 'js/editor/cinema-video-export.js?v=0.7.8-cinema-export-1'],
  [.92999965, 'loading viewport layout', 'js/editor/viewport-layout.js?v=0.7.8-webgpu-viewport-origin-1'],
  [.9299997, 'loading editor runtime', 'js/editor/editor-runtime.js?v=0.7.8-no-preview-autosave-1'],
  [.9299998, 'loading playable export level picker', 'js/editor/playable-export-level-picker.js?v=0.7.8-cache-sweep-1'],
  [.92999985, 'loading playable export assets', 'js/editor/playable-export-assets.js?v=0.7.8-vehicle-transitions-audio-1'],
  [.9299999, 'loading playable export zip', 'js/editor/playable-export-zip.js?v=0.7.8-default-bodies-1'],
  [.93, 'loading playable export', 'js/editor/playable-export.js?v=0.7.4-persistence-audit-1'],
  [.95, 'starting editor', 'js/editor/editor.js?v=0.7.8-cowork-locks-1'],
]);

function loadCss(href){
  if(document.querySelector('link[data-lk-editor-css]')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.dataset.lkEditorCss = '1';
    l.onload = resolve;
    l.onerror = () => reject(new Error('CSS editor non caricato: ' + href));
    document.head.appendChild(l);
  });
}
function loadScript(src){
  const existing = document.querySelector('script[data-lk-src="' + src + '"], script[src="' + src + '"], script[src^="' + src + '?"], script[src^="' + src + '#"]');
  if(existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.dataset.lkSrc = src;
    s.src = src + (src.indexOf('js/editor/') === 0 ? (src.includes('?') ? '&' : '?') + 'v=' + Date.now() : '');
    s.onload = resolve;
    s.onerror = () => reject(new Error('Script editor non caricato: ' + src));
    document.body.appendChild(s);
  });
}
function waitForStore(){
  const ready = window.LK_STORE && window.LK_STORE.ready;
  return ready && ready.finally ? ready.catch(()=>{}) : Promise.resolve();
}
function waitRuntime(mode){
  const assets = window.LOT_KING && window.LOT_KING.assets;
  if(assets && assets.ensureReady) return assets.ensureReady(mode).catch(()=>{});
  return waitForStore();
}
function editorStage(value, label){
  const assets = window.LOT_KING && window.LOT_KING.assets;
  if(assets && assets.setLoadingStage) assets.setLoadingStage('editor', value, label);
}
function finishEditorLoading(){
  const assets = window.LOT_KING && window.LOT_KING.assets;
  if(assets && assets.finishLoading) assets.finishLoading();
}
function failEditorLoading(label){
  const assets = window.LOT_KING && window.LOT_KING.assets;
  if(assets && assets.failLoading) assets.failLoading(label);
}
function cleanupEditorScripts(){
  const selectors = ['script[data-lk-src^="js/editor/"]'];
  EDITOR_SCRIPT_STAGES.forEach(item => {
    const src = item[2];
    if(src.indexOf('js/editor/') === 0) selectors.push('script[src^="' + src + '"]');
  });
  document.querySelectorAll(selectors.join(', ')).forEach(s => s.remove());
}
function loadEditorScriptStages(){
  return EDITOR_SCRIPT_STAGES.reduce((chain, item) => {
    return chain.then(() => {
      editorStage(item[0], item[1]);
      return loadScript(item[2]).then(result=>{
        const systems=window.LOT_KING&&window.LOT_KING.systems;
        if(systems&&typeof systems.ensurePlayerInputRuntime==='function')systems.ensurePlayerInputRuntime();
        return result;
      });
    });
  }, Promise.resolve());
}
function ensureEditor(){
  if(window.LOT_KING && window.LOT_KING.editor) return Promise.resolve(window.LOT_KING.editor);
  if(loading) return loading;
  cleanupEditorScripts();
  loading = Promise.resolve()
    .then(() => waitRuntime('editor'))
    .then(() => { editorStage(.45, 'loading editor style'); return loadCss('css/editor.css?v=0.7.8-project-history-1'); })
    .then(loadEditorScriptStages)
    .then(() => {
      if(!window.LOT_KING || !window.LOT_KING.editor) throw new Error('Editor non inizializzato');
      finishEditorLoading();
      return window.LOT_KING.editor;
    })
    .catch(err => {
      loading = null;
      console.warn('LotKing editor loader:', err);
      const pop = window.LOT_KING && window.LOT_KING.ui && window.LOT_KING.ui.popup;
      if(pop) pop('EDITOR NON CARICATO', '#ff5566');
      failEditorLoading('editor loading failed');
      throw err;
    });
  return loading;
}
function openEditor(){
  const actions = window.LOT_KING && window.LOT_KING.actions;
  const state = window.LOT_KING && window.LOT_KING.state;
  if(actions && actions.unloadLevel && state && (state.started || state.levelLoaded || state.editorPreview)) actions.unloadLevel();
  if(actions && actions.prepareEditorLevel) actions.prepareEditorLevel();
  ensureEditor().then(editor => editor.enter()).catch(() => {
    const overlay = document.getElementById('overlay');
    if(overlay) overlay.classList.remove('hidden');
  });
}

const btn = document.getElementById('editorBtn');
if(btn) btn.addEventListener('click', openEditor);

// cambio livello dall'editor → reload → rientra direttamente in editor
try {
  if(sessionStorage.getItem('lk.reopenEditor')){
    sessionStorage.removeItem('lk.reopenEditor');
    setTimeout(openEditor, 120);
  }
} catch(err){}

window.LK_EDITOR_LOADER = {load: ensureEditor, open: openEditor};
})();
