/* =========================================================
   LOT KING - EDITOR SELECTION MANAGER
   Selection, visibility/collider toggles, delete/duplicate, focus and gizmo sync.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const camE = deps.camE;
  const thumbCache = deps.thumbCache;

  function isBlueprintPart(o){
    return !o || o.userData.editorType === 'player' || o.userData.editorType === 'playerLight' ||
      o.userData.editorType === 'playerEffect' || o.userData.editorType === 'playerDataWidget';
  }

  function syncSelectedGizmo(o){
    const gizmo = deps.getGizmo();
    if(!gizmo) return;
    if(o && ED.tool !== 'select'){
      gizmo.setMode(ED.tool);
      deps.attachGizmoToSelection();
      return;
    }
    deps.setGizmoUsingZUpProxy(false);
    gizmo.detach();
  }

  function selectObject(o){
    if(ED.selected === o && ED.special === null) return;
    deps.clearHoverPickHelper();
    ED.special = null;
    ED.selected = o;
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
    syncSelectedGizmo(o);
    deps.refreshSelectionHelpers();
    deps.buildInspector();
    deps.refreshOutliner();
  }

  function selectSpecial(kind){
    deps.clearHoverPickHelper();
    ED.selected = null;
    ED.special = kind;
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(kind === 'hud');
    const gizmo = deps.getGizmo();
    if(gizmo){
      deps.setGizmoUsingZUpProxy(false);
      gizmo.detach();
    }
    deps.refreshSelectionHelpers();
    deps.buildInspector();
    deps.refreshOutliner();
  }

  function deselect(){
    selectObject(null);
  }

  function isPlayerCameraSelection(){
    const car = GAME.player && GAME.player.car;
    let o = ED.selected;
    while(o){
      if(o === car) return true;
      o = o.parent;
    }
    return false;
  }

  function toggleVisible(o){
    o.visible = !o.visible;
    deps.markDirty(); deps.refreshOutliner();
    if(ED.selected === o) deps.buildInspector();
  }

  function setColliderEnabled(o, enabled){
    if(!o || o.userData.editorType !== 'mesh') return;
    const old = o.userData.collider || null;
    if(enabled && !old){
      const col = {x:0, z:0, hx:1, hz:1};
      GAME.world.colliders.box.push(col);
      o.userData.collider = {kind:'box', ref:col};
      if(o.userData.addedEntry) o.userData.addedEntry.collide = true;
      STORE.syncCollider(o);
    } else if(!enabled && old){
      const arr = old.kind === 'circle' ? GAME.world.colliders.circle : GAME.world.colliders.box;
      const i = old.ref ? arr.indexOf(old.ref) : -1;
      if(i >= 0) arr.splice(i, 1);
      o.userData.collider = null;
      if(o.userData.addedEntry) o.userData.addedEntry.collide = false;
    }
    if(GAME.systems.physics) GAME.systems.physics.rebuild();
    deps.markDirty();
    deps.buildInspector();
    deps.refreshOutliner();
    deps.status(enabled ? 'Collider enabled' : 'Collider disabled');
  }

  function performDeleteEntity(o){
    if(isBlueprintPart(o)){ deps.status('Componente blueprint non eliminabile'); return; }
    const wasSelected = ED.selected === o;
    deps.removeEntity(o);
    if(wasSelected) deselect();
    thumbCache.delete(o.userData.editorId);
    deps.pushHistory({
      label: 'Delete ' + (o.userData.editorName || 'Entity'),
      undo: () => { deps.restoreEntity(o); selectObject(o); },
      redo: () => deps.removeEntity(o),
    });
    deps.markDirty(); deps.refreshOutliner();
    deps.status('Deleted: ' + (o.userData.editorName || ''));
  }

  function requestDeleteEntity(o){
    if(isBlueprintPart(o)){
      deps.status('Componente blueprint non eliminabile');
      return;
    }
    deps.confirmEditorAction({
      title: 'Delete scene object?',
      message: 'Delete "' + (o.userData.editorName || o.userData.editorId || 'Entity') + '" from the current level?',
      okText: 'Delete object',
    }).then(ok => { if(ok) performDeleteEntity(o); });
  }

  function cleanClone(o){
    const c = o.clone(true);
    c.userData = {};
    return c;
  }

  function duplicateEntity(o, offset){
    if(isBlueprintPart(o)) return;
    const id = STORE.nextId();
    let obj, entry;
    const src = o.userData.addedEntry;
    if(o.userData.effectParams){
      const params = Object.assign({}, o.userData.effectParams);
      obj = STORE.createEmitter(params.kind, params);
      entry = {id, kind:'effect', effect: params.kind, params, name: o.userData.editorName + ' copy', collide: false};
    } else if(src){
      entry = JSON.parse(JSON.stringify(src));
      entry.id = id; entry.name = o.userData.editorName + ' copy';
      obj = null;
    } else {
      entry = {id, kind:'clone', srcId: o.userData.editorId, name: o.userData.editorName + ' copy', collide: !!o.userData.collider};
      obj = cleanClone(o);
    }
    if(o.userData.assetKey) entry.asset = {key:o.userData.assetKey, name:o.userData.assetName, source:o.userData.assetSource};
    const place = created => {
      created.position.copy(o.position);
      if(offset) created.position.add(offset);
      else created.position.x += 3;
      created.rotation.copy(o.rotation);
      created.scale.copy(o.scale);
      entry.t = STORE.tOf(created);
      entry.t.name = entry.name;
      STORE.registerAdded(GAME, created, entry);
      if(o.userData.matProps) STORE.applyMatProps(created, o.userData.matProps);
      deps.pushHistory({
        label: 'Duplicate ' + (o.userData.editorName || 'Entity'),
        undo: () => deps.removeEntity(created),
        redo: () => { deps.restoreEntity(created); selectObject(created); },
      });
      deps.markDirty(); deps.refreshOutliner(); selectObject(created);
    };
    if(obj) place(obj);
    else STORE.createFromEntry(entry, GAME).then(place).catch(err => deps.status('Duplicazione fallita: ' + err.message));
  }

  function focusSelected(){
    const target = ED.selected || (ED.special === 'env' ? null : null);
    if(!target) return;
    const box = new THREE.Box3().setFromObject(target);
    const c = box.isEmpty() ? target.position.clone() : box.getCenter(new THREE.Vector3());
    const r = box.isEmpty() ? 4 : Math.max(2.5, box.getSize(new THREE.Vector3()).length() * .8);
    const dir = new THREE.Vector3().subVectors(camE.position, c).normalize();
    if(dir.lengthSq() < .01) dir.set(1, .6, 1).normalize();
    camE.position.copy(c).addScaledVector(dir, r * 1.6).add(new THREE.Vector3(0, r*.35, 0));
    camE.lookAt(c);
    const orbit = deps.getOrbit();
    if(orbit) orbit.target.copy(c);
  }

  function onGizmoChange(){
    const o = ED.selected;
    if(!o) return;
    deps.applyZUpProxyToSelected();
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
    STORE.syncCollider(o);
    deps.markDirty();
    deps.syncTransformFields();
  }

  return Object.freeze({
    selectObject,
    selectSpecial,
    deselect,
    isPlayerCameraSelection,
    toggleVisible,
    setColliderEnabled,
    performDeleteEntity,
    requestDeleteEntity,
    duplicateEntity,
    cleanClone,
    focusSelected,
    onGizmoChange,
  });
}

window.LK_EDITOR_SELECTION_MANAGER = Object.freeze({create});
})();
