/* =========================================================
   LOT KING - EDITOR VIEWPORT EVENTS
   Pointer, context-menu and wheel wiring for the editor canvas.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const ED = deps.ED;
  const GAME = deps.GAME || window.LOT_KING || {};
  const canvas = deps.canvas || (GAME.core && GAME.core.canvas) || (GAME.core && GAME.core.renderer && GAME.core.renderer.domElement) || null;
  let downX = 0;
  let downY = 0;
  let downBtn = -1;
  let pointerInteractionActive = false;

  function resetPointerInteraction(e){
    if(deps.setNavigationActive) deps.setNavigationActive(false);
    if(deps.isFlyActive && deps.isFlyActive()) deps.flyEnd(e);
    if(deps.recoverPointerState) deps.recoverPointerState(e);
    downBtn = -1;
    pointerInteractionActive = false;
  }

  function updateViewportHover(e){
    if(!ED.active || e.target !== canvas){
      deps.clearHoverPickHelper();
      return;
    }
    // Raycasting every object while the same pointer is rotating/panning the
    // camera is wasted work and creates visible long frames on large scenes.
    if(pointerInteractionActive || e.buttons !== 0 || deps.isFlyActive && deps.isFlyActive()){
      deps.clearHoverPickHelper();
      return;
    }
    if(deps.isLiveMaterialSelectionActive && deps.isLiveMaterialSelectionActive()){
      deps.updateLiveMaterialSelection(e);
      return;
    }
    deps.updateHover(e);
  }

  if(!canvas || !canvas.addEventListener) return Object.freeze({});

  canvas.addEventListener('pointerdown', e => {
    if(!ED.active || ED.playPreview || ED.levelsOpen || ED.projectsOpen) return;
    if(deps.setActiveViewportAt) deps.setActiveViewportAt(e.clientX, e.clientY);
    downX = e.clientX; downY = e.clientY; downBtn = e.button;
    pointerInteractionActive = true;
    if(deps.setNavigationActive) deps.setNavigationActive(true);
    deps.clearHoverPickHelper();
    const navigationLocked = deps.isActiveViewportNavigationLocked && deps.isActiveViewportNavigationLocked();
    if(e.button === 1){
      e.preventDefault();
      e.stopImmediatePropagation();
      if(!navigationLocked) deps.flyStart(e, {button:1, panOnly:true});
    }
    else if(e.button === 2 && !navigationLocked) deps.flyStart(e);
    else if(e.button === 0 && deps.isActiveViewportPerspectiveSecondary && deps.isActiveViewportPerspectiveSecondary()){
      e.preventDefault();
      e.stopImmediatePropagation();
      deps.flyStart(e, {button:0, orbitOnly:true});
    }
    else if(e.button === 0 && deps.isActiveViewportCameraDriven && deps.isActiveViewportCameraDriven()){
      deps.flyStart(e, {button:0, rotateOnly:true});
    }
  }, true);

  addEventListener('pointermove', e => {
    if(ED.active && !ED.playPreview && !ED.levelsOpen && !ED.projectsOpen){
      // Recover from a pointer-up that was lost while focus/capture changed.
      const controlsPending = deps.hasPendingPointerState && deps.hasPendingPointerState();
      if(e.buttons === 0 && document.pointerLockElement !== canvas &&
        (pointerInteractionActive || controlsPending)) resetPointerInteraction(e);
      deps.flyMove(e);
      updateViewportHover(e);
    }
  });

  addEventListener('pointerup', e => {
    pointerInteractionActive = false;
    if(deps.setNavigationActive) deps.setNavigationActive(false);
    // Run after Three.js' document/canvas listeners, including paths below
    // that intentionally return early (pointer released outside the canvas).
    setTimeout(() => {
      if(deps.hasPendingPointerState && deps.hasPendingPointerState()) deps.recoverPointerState(e);
    }, 0);
    if(!ED.active || ED.playPreview || ED.levelsOpen || ED.projectsOpen) return;
    const dist = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    const wasFlying = deps.isFlyActive() && deps.flyMoved() > 6;
    const suppressSceneClick = deps.shouldSuppressSceneClick();
    if(deps.isFlyActive()) deps.flyEnd(e);
    if(e.target !== canvas) return;
    if(e.button === 0 && downBtn === 0 && dist < 5){
      if(suppressSceneClick) return;
      if(deps.isLiveMaterialSelectionActive && deps.isLiveMaterialSelectionActive()){
        deps.commitLiveMaterialSelection(e);
        return;
      }
      const hit = deps.pickAt(e.clientX, e.clientY);
      if(hit && hit.collider){
        if(hit.logicElementCollider || hit.logicVehicleCollider) deps.selectObject(hit.entity);
        else if(hit.playerCollider && deps.selectPlayerCollider) deps.selectPlayerCollider();
        else if(Number.isInteger(hit.colliderPartIndex) && deps.selectColliderPart) deps.selectColliderPart(hit.entity, hit.colliderPartIndex);
        else if(deps.selectCollider) deps.selectCollider(hit.entity);
        else deps.selectObject(hit.entity);
      } else if(hit && deps.selectObjectWithModifiers){
        deps.selectObjectWithModifiers(hit.entity, {toggle:e.ctrlKey || e.metaKey, add:e.shiftKey});
      } else if(hit) deps.selectObject(hit.entity);
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
        if(hit.entity.userData.editorType !== 'cinemaStudio') deps.selectObject(hit.entity);
        deps.openMenu(deps.objectMenuItems(hit.entity, false, gp), e.clientX, e.clientY);
      } else if(hit && hit.entity.userData.editorType === 'player'){
        deps.selectObject(hit.entity);
        deps.openMenu(deps.playerMenuItems(), e.clientX, e.clientY);
      } else {
        deps.openMenu(deps.canvasMenuItems(gp), e.clientX, e.clientY);
      }
    }
  });
  addEventListener('pointercancel', resetPointerInteraction, true);
  addEventListener('blur', resetPointerInteraction);
  document.addEventListener('visibilitychange', () => {
    if(document.hidden) resetPointerInteraction();
  });
  canvas.addEventListener('lostpointercapture', e => {
    // A normal pointer-up releases capture at the canvas before OrbitControls'
    // document listener has finished. Defer the check so that release is not
    // mistaken for a cancelled click (which would suppress scene selection).
    setTimeout(() => {
      const controlsPending = deps.hasPendingPointerState && deps.hasPendingPointerState();
      if(document.pointerLockElement !== canvas && (pointerInteractionActive || controlsPending)){
        resetPointerInteraction(e);
      }
    }, 0);
  });

  canvas.addEventListener('contextmenu', e => { if(ED.active && !ED.levelsOpen && !ED.projectsOpen) e.preventDefault(); });
  addEventListener('contextmenu', e => {
    if(!ED.active || ED.levelsOpen || ED.projectsOpen) return;
    e.preventDefault();
  }, true);

  canvas.addEventListener('wheel', e => {
    if(ED.levelsOpen || ED.projectsOpen) return;
    if(ED.active && !ED.playPreview){
      e.preventDefault();
      if(deps.markWheelNavigation) deps.markWheelNavigation();
      if(deps.isFlyActive()) deps.adjustFlySpeed(e.deltaY);
      else if(deps.zoomActiveViewport && deps.zoomActiveViewport(e.deltaY, e.clientX, e.clientY)) e.stopImmediatePropagation();
    }
  }, {passive:false, capture:true});

  return Object.freeze({updateViewportHover});
}

window.LK_EDITOR_VIEWPORT_EVENTS = Object.freeze({create});
})();
