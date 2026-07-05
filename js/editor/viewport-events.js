/* =========================================================
   LOT KING - EDITOR VIEWPORT EVENTS
   Pointer, context-menu and wheel wiring for the editor canvas.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const ED = deps.ED;
  const canvas = deps.canvas;
  let downX = 0;
  let downY = 0;
  let downBtn = -1;

  function updateViewportHover(e){
    if(!ED.active || e.target !== canvas){
      deps.clearHoverPickHelper();
      return;
    }
    deps.updateHover(e);
  }

  canvas.addEventListener('pointerdown', e => {
    if(!ED.active || ED.playPreview || ED.levelsOpen) return;
    downX = e.clientX; downY = e.clientY; downBtn = e.button;
    deps.clearHoverPickHelper();
    if(e.button === 2) deps.flyStart(e);
  });

  addEventListener('pointermove', e => {
    if(ED.active && !ED.playPreview && !ED.levelsOpen){
      deps.flyMove(e);
      updateViewportHover(e);
    }
  });

  addEventListener('pointerup', e => {
    if(!ED.active || ED.playPreview || ED.levelsOpen) return;
    const dist = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    const wasFlying = deps.isFlyActive() && deps.flyMoved() > 6;
    const suppressSceneClick = deps.shouldSuppressSceneClick();
    if(e.button === 2) deps.flyEnd(e);
    if(e.target !== canvas) return;
    if(e.button === 0 && downBtn === 0 && dist < 5){
      if(suppressSceneClick) return;
      const hit = deps.pickAt(e.clientX, e.clientY);
      if(hit) deps.selectObject(hit.entity);
      else deps.deselect();
    }
    if(e.button === 2 && !wasFlying && dist < 5){
      const g = deps.getGizmo && deps.getGizmo();
      if(g && g.axis && deps.setTool && deps.openMenu){
        deps.openMenu([
          {label:'Move  W', icon:'✥', disabled: ED.tool === 'translate', action: () => deps.setTool('translate')},
          {label:'Rotate  E', icon:'⟳', disabled: ED.tool === 'rotate', action: () => deps.setTool('rotate')},
          {label:'Scale  R', icon:'⤢', disabled: ED.tool === 'scale', action: () => deps.setTool('scale')},
        ], e.clientX, e.clientY);
        return;
      }
      if(suppressSceneClick) return;
      const hit = deps.pickAt(e.clientX, e.clientY);
      const gp = hit ? hit.point.clone().setY(0) : deps.groundPointAt(e.clientX, e.clientY);
      const isGround = hit && deps.isGroundLikeEntity(hit.entity);
      if(hit && !isGround && hit.entity.userData.editorType !== 'player'){
        deps.selectObject(hit.entity);
        deps.openMenu(deps.objectMenuItems(hit.entity, false, gp), e.clientX, e.clientY);
      } else if(hit && hit.entity.userData.editorType === 'player'){
        deps.selectObject(hit.entity);
        deps.openMenu(deps.playerMenuItems(), e.clientX, e.clientY);
      } else {
        deps.openMenu(deps.canvasMenuItems(gp), e.clientX, e.clientY);
      }
    }
  });

  canvas.addEventListener('contextmenu', e => { if(ED.active && !ED.levelsOpen) e.preventDefault(); });
  addEventListener('contextmenu', e => {
    if(!ED.active || ED.levelsOpen) return;
    e.preventDefault();
  }, true);

  canvas.addEventListener('wheel', e => {
    if(ED.levelsOpen) return;
    if(ED.active && !ED.playPreview){
      e.preventDefault();
      if(deps.isFlyActive()) deps.adjustFlySpeed(e.deltaY);
    }
  }, {passive:false});

  return Object.freeze({updateViewportHover});
}

window.LK_EDITOR_VIEWPORT_EVENTS = Object.freeze({create});
})();
