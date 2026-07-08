/* =========================================================
   LOT KING - EDITOR LAYOUT
   Floating panels, editor viewport rectangle and resize restoration.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const root = deps.root;
  const ED = deps.ED;
  const camE = deps.camE;
  let floatingLayout = null;
  let ready = false;

  function restoreFloatingPanels(){
    if(ready && floatingLayout) floatingLayout.restoreFloatingPanels();
  }

  function panelWidth(side){
    return floatingLayout
      ? floatingLayout.panelWidth(side)
      : (parseFloat(getComputedStyle(root).getPropertyValue(side === 'left' ? '--lk-left-w' : '--lk-right-w')) || 280);
  }

  function editorViewportRect(){
    const timelineH = ED.cinemaTimelineOpen && ED.cinemaTimelineDocked ? (ED.cinemaTimelineH || 136) : 0;
    return floatingLayout
      ? floatingLayout.editorViewportRect()
      : {
        x: panelWidth('left') + 10,
        y: 46 + (ED.viewportToolbarCollapsed ? 28 : 36),
        w: Math.max(220, innerWidth - panelWidth('left') - panelWidth('right') - 20),
        h: Math.max(160, innerHeight - 46 - (ED.viewportToolbarCollapsed ? 28 : 36) - 40 - ED.assetsH - timelineH),
      };
  }

  function clampPanelPos(pos, w, h){
    return floatingLayout ? floatingLayout.clampPanelPos(pos, w, h) : pos;
  }

  function init(){
    floatingLayout = window.LK_EDITOR_FLOATING_LAYOUT && window.LK_EDITOR_FLOATING_LAYOUT.create({
      root,
      ED,
      $: deps.$,
      status: deps.status,
      cameraAspect: deps.cameraAspect,
    });
    if(floatingLayout){
      floatingLayout.wirePanelResize();
      floatingLayout.wireAssetsResize();
      floatingLayout.wirePipResize();
      floatingLayout.wireCinemaPreviewResize();
      floatingLayout.wireFloatingPanels();
    }
    ready = true;
    requestAnimationFrame(restoreFloatingPanels);
    return floatingLayout;
  }

  addEventListener('resize', () => {
    if(camE && camE.aspect != null && camE.updateProjectionMatrix){
      camE.aspect = innerWidth / innerHeight;
      camE.updateProjectionMatrix();
    }
    if(!ready) return;
    try {
      restoreFloatingPanels();
    } catch(err) {
      console.warn('LotKing: restoreFloatingPanels (resize) skipped', err);
    }
  });

  return Object.freeze({
    init,
    restoreFloatingPanels,
    panelWidth,
    editorViewportRect,
    clampPanelPos,
    getFloatingLayout: () => floatingLayout,
  });
}

window.LK_EDITOR_LAYOUT = Object.freeze({create});
})();
