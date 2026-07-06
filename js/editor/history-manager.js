/* =========================================================
   LOT KING — EDITOR HISTORY MANAGER
   Undo/redo, transform repeat, HUD history and entity restore/remove.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const scene = deps.scene;
  const $ = deps.$;
  const status = deps.status;
  const markDirty = deps.markDirty;
  const selectObject = deps.selectObject;
  const refreshSelectionHelpers = deps.refreshSelectionHelpers;
  const attachGizmoToSelection = deps.attachGizmoToSelection;
  const syncTransformFields = deps.syncTransformFields;
  const refreshOutliner = deps.refreshOutliner;
  const refreshAssetsPanel = deps.refreshAssetsPanel || function(){};
  const buildInspector = deps.buildInspector;
  const getGizmo = deps.getGizmo;

  const undoStack = [];
  const redoStack = [];
  let transformBefore = null;
  let lastTransformRepeat = null;
  let colliderBefore = null;
  let hudHistoryPending = null;
  let hudHistoryTimer = null;
  let hudHistorySuppress = false;

  function sameT(a, b){
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function transformMask(before, after){
    const eq = (aa, bb) => aa.length === bb.length && aa.every((v, i) => Math.abs(v - bb[i]) < 1e-5);
    return {
      p: before && after && !eq(before.p, after.p),
      r: before && after && !eq(before.r, after.r),
      s: before && after && !eq(before.s, after.s),
    };
  }

  function historyChanged(){
    $('#lkUndo').classList.toggle('disabled', !undoStack.length);
    $('#lkRedo').classList.toggle('disabled', !redoStack.length);
  }

  function pushHistory(cmd){
    if(!cmd) return;
    undoStack.push(cmd);
    if(undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    historyChanged();
  }

  function undo(){
    flushHudHistory();
    const cmd = undoStack.pop();
    if(!cmd){ status('Niente da annullare'); return; }
    cmd.undo();
    redoStack.push(cmd);
    historyChanged();
    markDirty();
    refreshOutliner();
    refreshAssetsPanel();
    status('Undo: ' + cmd.label);
  }

  function redo(){
    flushHudHistory();
    const cmd = redoStack.pop();
    if(!cmd){ status('Niente da rifare'); return; }
    cmd.redo();
    undoStack.push(cmd);
    historyChanged();
    markDirty();
    refreshOutliner();
    refreshAssetsPanel();
    status('Redo: ' + cmd.label);
  }

  function cloneHudConfig(v){
    return JSON.parse(JSON.stringify(v || {}));
  }

  function sameHudConfig(a, b){
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  }

  function hudPatchLabel(patch){
    if(!patch) return 'HUD radio';
    if(patch.buttons) return 'HUD radio pulsanti';
    if('editTarget' in patch) return 'HUD radio modalità edit';
    if('buttonLayer' in patch || 'imageLayer' in patch || 'screenLayer' in patch) return 'HUD radio layer';
    if('frameX' in patch || 'frameY' in patch || 'width' in patch || 'pngScaleX' in patch || 'pngScaleY' in patch) return 'HUD radio frame';
    if('screenLeft' in patch || 'screenTop' in patch || 'screenWidth' in patch || 'screenHeight' in patch) return 'HUD radio interfaccia';
    return 'HUD radio';
  }

  function applyHudSnapshot(snapshot){
    const setHud = GAME.ui && GAME.ui.setRadioHud;
    if(!setHud || !snapshot) return;
    hudHistorySuppress = true;
    setHud(cloneHudConfig(snapshot));
    hudHistorySuppress = false;
    if(GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(true);
    if(ED.active && ED.special === 'hud') buildInspector();
  }

  function queueHudHistory(before, after, label){
    if(!before || !after || sameHudConfig(before, after)) return;
    if(!hudHistoryPending){
      hudHistoryPending = {before: cloneHudConfig(before), after: cloneHudConfig(after), label: label || 'HUD radio'};
    } else {
      hudHistoryPending.after = cloneHudConfig(after);
      hudHistoryPending.label = label || hudHistoryPending.label;
    }
    clearTimeout(hudHistoryTimer);
    hudHistoryTimer = setTimeout(flushHudHistory, 260);
  }

  function flushHudHistory(){
    if(!hudHistoryPending) return;
    clearTimeout(hudHistoryTimer);
    const pending = hudHistoryPending;
    hudHistoryPending = null;
    if(sameHudConfig(pending.before, pending.after)) return;
    pushHistory({
      label: pending.label,
      undo: () => applyHudSnapshot(pending.before),
      redo: () => applyHudSnapshot(pending.after),
    });
    historyChanged();
  }

  function restoreEntity(o){
    if(!o) return;
    if(!GAME.world.registry.includes(o)){
      const col = o.userData.collider;
      const isBuiltin = !!o.userData.builtin && !o.userData.addedEntry;
      if(col && col.ref){
        col.ref.owner = o;
        col.ref.enabled = col.ref.enabled !== false;
        const arr = col.kind === 'circle' ? GAME.world.colliders.circle : GAME.world.colliders.box;
        if(!arr.includes(col.ref)) arr.push(col.ref);
      }
      GAME.world.register(o, o.userData.editorName || 'Entity', o.userData.editorType || 'mesh', {
        id: o.userData.editorId,
        builtin: isBuiltin,
        collider: col || null,
      });
    }
    if(!o.parent) scene.add(o);
    STORE.syncCollider(o);
    if(GAME.systems && GAME.systems.physics) GAME.systems.physics.rebuild();
    deps.refreshSelectionHelpers();
    refreshOutliner();
    refreshAssetsPanel();
  }

  function removeEntity(o){
    if(!o || o.userData.editorType === 'player') return;
    GAME.world.unregister(o);
    if(o.parent) o.parent.remove(o);
    if(ED.selected === o) selectObject(null);
    if(GAME.systems && GAME.systems.physics) GAME.systems.physics.rebuild();
    deps.refreshSelectionHelpers();
    refreshOutliner();
    refreshAssetsPanel();
  }

  function applyTransform(o, t){
    if(!o || !t) return;
    restoreEntity(o);
    STORE.applyT(o, t);
    if(o.userData.editorType === 'player'){
      GAME.player.physics.pos.copy(o.position);
      GAME.player.physics.heading = o.rotation.y;
      if(GAME.player.spawn){
        GAME.player.spawn.x = o.position.x;
        GAME.player.spawn.z = o.position.z;
        GAME.player.spawn.heading = o.rotation.y;
      }
      if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
    }
    if(o.userData.editorType === 'playerDataWidget' && GAME.player.syncDataWidget) GAME.player.syncDataWidget(o);
    STORE.syncCollider(o);
    refreshSelectionHelpers();
    const gizmo = getGizmo();
    if(ED.selected === o && gizmo && !gizmo.dragging) attachGizmoToSelection();
    syncTransformFields();
    refreshOutliner();
  }

  function setLinkParent(o){
    ED.linkParent = o || null;
    status(o ? 'Parent pronto: ' + (o.userData.editorName || o.userData.editorId) : 'Parent link svuotato');
  }

  function linkToParent(child, parent){
    if(!child || !parent || child === parent) return;
    let n = parent;
    while(n){
      if(n === child){ status('Link non valido: creerebbe un ciclo'); return; }
      n = n.parent;
    }
    parent.attach(child);
    child.userData.linkParentId = parent.userData.editorId;
    STORE.syncCollider(child);
    markDirty();
    buildInspector();
    status('Link: ' + (child.userData.editorName || 'object') + ' → ' + (parent.userData.editorName || 'parent'));
  }

  function unlinkObject(child){
    if(!child || !child.parent || child.parent === scene) return;
    scene.attach(child);
    delete child.userData.linkParentId;
    STORE.syncCollider(child);
    markDirty();
    buildInspector();
    status('Link rimosso');
  }

  function beginTransformHistory(){
    transformBefore = ED.selected ? {obj: ED.selected, t: STORE.tOf(ED.selected)} : null;
  }

  function commitTransformHistory(label){
    if(!transformBefore || !transformBefore.obj) return;
    const obj = transformBefore.obj;
    const before = transformBefore.t;
    const after = STORE.tOf(obj);
    transformBefore = null;
    if(sameT(before, after)) return;
    const mask = transformMask(before, after);
    lastTransformRepeat = {label: label || 'Transform', t: after, mask};
    pushHistory({
      label: label || 'Transform',
      undo: () => applyTransform(obj, before),
      redo: () => applyTransform(obj, after),
    });
  }

  function withTransformHistory(label, fn){
    const obj = ED.selected;
    if(!obj) return;
    const before = STORE.tOf(obj);
    fn(obj);
    const after = STORE.tOf(obj);
    if(sameT(before, after)) return;
    const mask = transformMask(before, after);
    lastTransformRepeat = {label, t: after, mask};
    pushHistory({
      label,
      undo: () => applyTransform(obj, before),
      redo: () => applyTransform(obj, after),
    });
  }

  function colliderSnapshot(o){
    if(!o || !o.userData) return null;
    const ref = o.userData.collider && o.userData.collider.ref;
    return {
      shape: o.userData.colliderShape ? JSON.parse(JSON.stringify(o.userData.colliderShape)) : null,
      physicsMass: o.userData.physicsMass,
      physicsImpact: o.userData.physicsImpact,
      physicsEnabled: !!o.userData.physicsEnabled,
      ref: ref ? {
        enabled: ref.enabled !== false,
        physics: !!ref.physics,
        mass: ref.mass,
        impact: ref.impact,
        x: ref.x,
        y: ref.y,
        z: ref.z,
        hx: ref.hx,
        hy: ref.hy,
        hz: ref.hz,
        r: ref.r,
        rotX: ref.rotX,
        rotY: ref.rotY,
        rotZ: ref.rotZ,
        rot: ref.rot,
      } : null,
    };
  }

  function applyColliderSnapshot(o, snap){
    if(!o || !snap) return;
    if(snap.shape) o.userData.colliderShape = JSON.parse(JSON.stringify(snap.shape));
    else delete o.userData.colliderShape;
    o.userData.physicsMass = snap.physicsMass;
    o.userData.physicsImpact = snap.physicsImpact;
    o.userData.physicsEnabled = !!snap.physicsEnabled;
    const ref = o.userData.collider && o.userData.collider.ref;
    if(ref && snap.ref){
      Object.assign(ref, snap.ref);
      ref.owner = o;
    }
    if(o.userData.addedEntry){
      if(snap.shape) o.userData.addedEntry.colliderShape = JSON.parse(JSON.stringify(snap.shape));
      else delete o.userData.addedEntry.colliderShape;
      o.userData.addedEntry.physicsMass = snap.physicsMass;
      o.userData.addedEntry.physicsImpact = snap.physicsImpact;
      o.userData.addedEntry.physics = !!snap.physicsEnabled;
      o.userData.addedEntry.collide = !!(snap.ref && snap.ref.enabled);
    }
    STORE.syncCollider(o);
    if(GAME.systems && GAME.systems.physics) GAME.systems.physics.rebuild();
    refreshSelectionHelpers();
    buildInspector();
    refreshOutliner();
    markDirty();
  }

  function beginColliderHistory(o){
    colliderBefore = o ? {obj:o, snap:colliderSnapshot(o)} : null;
  }

  function commitColliderHistory(label){
    if(!colliderBefore || !colliderBefore.obj) return;
    const obj = colliderBefore.obj;
    const before = colliderBefore.snap;
    const after = colliderSnapshot(obj);
    colliderBefore = null;
    if(sameT(before, after)) return;
    pushHistory({
      label: label || 'Collider edit',
      undo: () => applyColliderSnapshot(obj, before),
      redo: () => applyColliderSnapshot(obj, after),
    });
  }

  function applyLastTransform(){
    const obj = ED.selected;
    if(!obj || !lastTransformRepeat){ status('No transform to repeat'); return; }
    if(obj.userData.editorType === 'player'){ status('Il player non usa Ctrl+R rapido'); return; }
    const before = STORE.tOf(obj);
    const next = STORE.tOf(obj);
    if(lastTransformRepeat.mask.p) next.p = lastTransformRepeat.t.p.slice();
    if(lastTransformRepeat.mask.r) next.r = lastTransformRepeat.t.r.slice();
    if(lastTransformRepeat.mask.s) next.s = lastTransformRepeat.t.s.slice();
    applyTransform(obj, next);
    if(sameT(before, next)){ status('Trasformazione gia applicata'); return; }
    pushHistory({
      label: 'Repeat ' + lastTransformRepeat.label,
      undo: () => applyTransform(obj, before),
      redo: () => applyTransform(obj, next),
    });
    markDirty();
    status('Repeated transform on ' + (obj.userData.editorName || 'object'));
  }

  function hasLastTransformRepeat(){
    return !!lastTransformRepeat;
  }

  function isHudHistorySuppress(){
    return !!hudHistorySuppress;
  }

  historyChanged();

  return Object.freeze({
    pushHistory,
    undo,
    redo,
    hudPatchLabel,
    queueHudHistory,
    flushHudHistory,
    restoreEntity,
    removeEntity,
    applyTransform,
    setLinkParent,
    linkToParent,
    unlinkObject,
    beginTransformHistory,
    commitTransformHistory,
    withTransformHistory,
    beginColliderHistory,
    commitColliderHistory,
    applyLastTransform,
    hasLastTransformRepeat,
    isHudHistorySuppress,
  });
}

window.LK_EDITOR_HISTORY_MANAGER = Object.freeze({create});
})();
