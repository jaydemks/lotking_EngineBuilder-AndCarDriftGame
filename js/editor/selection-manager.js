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
  const colliderProxy = deps.colliderProxy;
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  const isOnlineDemo = () => window.LK_PROJECT_WORKSPACE && window.LK_PROJECT_WORKSPACE.isOnlineDemoMode && window.LK_PROJECT_WORKSPACE.isOnlineDemoMode();
  function blockOnlineDemoAction(){
    deps.status(tr('Online demo only. Run the project locally to edit this scene.', 'Demo online: avvia il progetto in locale per modificare la scena.'));
    return true;
  }

  function logicElementOwnerOf(o){
    let n = o;
    while(n){
      if(n.userData && (n.userData.editorType === 'logicElement' || n.userData.addedEntry && n.userData.addedEntry.kind === 'logicElement')) return n;
      n = n.parent;
    }
    return null;
  }

  function selectableObject(o){
    if(o && o.userData && o.userData.logicElementInternal) return logicElementOwnerOf(o) || o;
    return o;
  }

  function isBlueprintPart(o){
    return !o || !o.userData || o.userData.logicElementInternal || o.userData.editorType === 'player' || o.userData.editorType === 'playerLight' ||
      o.userData.editorType === 'playerEffect' || o.userData.editorType === 'playerSkid' ||
      o.userData.editorType === 'playerDataWidget';
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

  function syncOutlinerSelection(){
    if(deps.syncOutlinerSelection) deps.syncOutlinerSelection();
    else deps.refreshOutliner();
  }
  function rebuildPhysics(){
    if(deps.requestPhysicsRebuild) deps.requestPhysicsRebuild();
    else if(GAME.systems && GAME.systems.physics) GAME.systems.physics.rebuild();
  }

  function selectedObjects(){
    const multi = Array.isArray(ED.multiSelected) ? ED.multiSelected.filter(o => o && !isBlueprintPart(o)) : [];
    if(multi.length) return multi;
    return ED.selected && !isBlueprintPart(ED.selected) ? [ED.selected] : [];
  }

  function selectObjectRange(target, rangeObjects){
    if(!target || !Array.isArray(rangeObjects) || !rangeObjects.length || !ED.lastSceneSelectedId) return false;
    const targetId = target.userData && target.userData.editorId;
    const start = rangeObjects.findIndex(o => o && o.userData && o.userData.editorId === ED.lastSceneSelectedId);
    const end = rangeObjects.findIndex(o => o && o.userData && o.userData.editorId === targetId);
    if(start < 0 || end < 0) return false;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    selectMultiObjects(rangeObjects.slice(lo, hi + 1));
    ED.lastSceneSelectedId = targetId || ED.lastSceneSelectedId;
    return true;
  }

  function revealSelectedInSceneOutliner(){
    const o = ED.selected;
    if(!o || !o.userData || !o.userData.editorId) return;
    requestAnimationFrame(() => {
      const box = document.getElementById('lkOutliner');
      if(!box) return;
      const id = o.userData.editorId;
      const selector = '.lk-item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/["\\\\]/g, '\\\\$&')) + '"]';
      const row = box.querySelector(selector);
      if(!row) return;
      const rowHeight = row.getBoundingClientRect().height || 24;
      const offset = Math.max(0, row.offsetTop - (box.clientHeight - rowHeight) / 2);
      box.scrollTo({ top: offset, behavior: 'auto' });
    });
  }

  function selectObject(o, opts){
    opts = opts || {};
    o = selectableObject(o);
    if(ED.selected === o && ED.special === null && !ED.colliderEdit && !ED.playerColliderEdit && !(ED.multiSelected && ED.multiSelected.length)) return;
    deps.clearHoverPickHelper();
    ED.multiSelected = null;
    ED.special = null;
    ED.colliderEdit = false;
    ED.colliderPartIndex = null;
    ED.playerColliderEdit = false;
    ED.selected = o;
    ED.lastSceneSelectedId = o && o.userData ? o.userData.editorId || ED.lastSceneSelectedId : ED.lastSceneSelectedId;
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
    syncSelectedGizmo(o);
    deps.refreshSelectionHelpers();
    deps.buildInspector();
    syncOutlinerSelection();
    if(opts.reveal !== false) revealSelectedInSceneOutliner();
  }

  function selectSpecial(kind){
    deps.clearHoverPickHelper();
    ED.multiSelected = null;
    ED.colliderEdit = false;
    ED.colliderPartIndex = null;
    ED.playerColliderEdit = false;
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
    syncOutlinerSelection();
  }

  function deselect(){
    ED.multiSelected = null;
    ED.colliderEdit = false;
    ED.colliderPartIndex = null;
    ED.playerColliderEdit = false;
    selectObject(null);
  }

  function selectCollider(o){
    if(!o || !(o.userData && o.userData.collider && o.userData.collider.ref)) return selectObject(o);
    deps.clearHoverPickHelper();
    ED.multiSelected = null;
    ED.special = null;
    ED.playerColliderEdit = false;
    ED.selected = o;
    ED.colliderEdit = true;
    ED.colliderPartIndex = null;
    if(ED.tool === 'select') ED.tool = 'translate';
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
    syncSelectedGizmo(o);
    deps.refreshSelectionHelpers();
    deps.buildInspector();
    syncOutlinerSelection();
    deps.status('Collider edit: ' + (o.userData.editorName || 'object'));
  }

  function selectColliderPart(o, index){
    if(!o || !(o.userData && o.userData.collider && o.userData.collider.ref)) return selectObject(o);
    STORE.syncCollider(o);
    const parts = o.userData.collider.ref.parts || [];
    if(!parts[index]) return selectCollider(o);
    deps.clearHoverPickHelper();
    ED.multiSelected = null;
    ED.special = null;
    ED.playerColliderEdit = false;
    ED.selected = o;
    ED.colliderEdit = true;
    ED.colliderPartIndex = index;
    if(ED.tool === 'select') ED.tool = 'translate';
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
    syncSelectedGizmo(o);
    deps.refreshSelectionHelpers();
    deps.buildInspector();
    syncOutlinerSelection();
    deps.status('Collider part: ' + (parts[index].partName || ('Collider ' + (index + 1))));
  }

  function similarityKey(o){
    if(!o || !o.userData) return '';
    const ud = o.userData;
    if(ud.assetKey) return 'asset:' + ud.assetKey;
    if(ud.addedEntry && ud.addedEntry.asset && ud.addedEntry.asset.key) return 'asset:' + ud.addedEntry.asset.key;
    if(ud.assetSource) return 'asset-src:' + ud.assetSource;
    if(ud.addedEntry && ud.addedEntry.asset && ud.addedEntry.asset.source) return 'asset-src:' + ud.addedEntry.asset.source;
    if(ud.assetName) return 'asset-name:' + String(ud.assetName).toLowerCase();
    if(ud.addedEntry && ud.addedEntry.asset && ud.addedEntry.asset.name) return 'asset-name:' + String(ud.addedEntry.asset.name).toLowerCase();
    if(ud.addedEntry && ud.addedEntry.primitive) return 'prim:' + ud.addedEntry.primitive;
    if(ud.isCone || String(ud.editorName || o.name || '').toLowerCase().includes('cone')) return 'kind:cone';
    if(ud.addedEntry && ud.addedEntry.kind) return 'kind:' + ud.addedEntry.kind;
    let geometryType = '';
    if(o.traverse){
      o.traverse(n => {
        if(!geometryType && n && n.isMesh && n.geometry && n.geometry.type) geometryType = n.geometry.type;
      });
    }
    if(geometryType) return 'geo:' + geometryType;
    const rawName = String(ud.editorName || o.name || '').toLowerCase()
      .replace(/\s+copy\b/g, '')
      .replace(/[\s._-]*\d+$/g, '')
      .trim();
    return (ud.editorType || 'object') + ':' + rawName;
  }

  function selectMultiObjects(objects){
    const list = (objects || []).map(selectableObject).filter(o => o && !isBlueprintPart(o));
    const unique = [];
    list.forEach(o => { if(!unique.includes(o)) unique.push(o); });
    if(!unique.length) return;
    deps.clearHoverPickHelper();
    ED.special = null;
    ED.selected = unique[0];
    ED.lastSceneSelectedId = unique[unique.length - 1] && unique[unique.length - 1].userData ? unique[unique.length - 1].userData.editorId : ED.lastSceneSelectedId;
    ED.colliderEdit = false;
    ED.colliderPartIndex = null;
    ED.playerColliderEdit = false;
    ED.multiSelected = unique.length > 1 ? unique : null;
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
    syncSelectedGizmo(ED.selected);
    deps.refreshSelectionHelpers();
    deps.buildInspector();
    syncOutlinerSelection();
    deps.status(unique.length > 1 ? ('Selected ' + unique.length + ' objects') : 'Selected object');
  }

  function selectObjectWithModifiers(o, opts){
    opts = opts || {};
    if(!o || isBlueprintPart(o)) return selectObject(o, {reveal:opts.reveal !== false});
    if(opts.range && selectObjectRange(o, opts.rangeObjects)) return;
    const list = selectedObjects();
    const toggle = !!opts.toggle;
    const add = !!opts.add || toggle;
    if(add){
      let next = list.slice();
      const idx = next.indexOf(o);
      if(idx >= 0 && toggle) next.splice(idx, 1);
      else if(idx < 0) next.push(o);
      if(!next.length) return deselect();
      return selectMultiObjects(next);
    }
    return selectObject(o, {reveal:opts.reveal !== false});
  }

  function selectSimilarObjects(o){
    const key = similarityKey(o);
    if(!key) return selectObject(o);
    const matches = GAME.world.registry.filter(item => item && item.userData && similarityKey(item) === key && !isBlueprintPart(item));
    const list = [o].concat(matches.filter(item => item !== o));
    selectMultiObjects(list.length ? list : [o]);
  }

  function isPlayerCameraSelection(){
    const car = GAME.player && GAME.player.car;
    let o = ED.selected;
    while(o){
      if(o === car || (o.userData && o.userData.editorType === 'camera' && o.userData.sceneCamera)) return true;
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
    const storedMass = Number(o.userData.physicsMass);
    const storedImpact = Number(o.userData.physicsImpact);
    const oldRefMass = old && old.ref && old.ref.mass;
    const oldRefImpact = old && old.ref && old.ref.impact;
    const defaultMass = Number.isFinite(storedMass) && storedMass > 0 ? storedMass
      : Number.isFinite(Number(oldRefMass)) && Number(oldRefMass) > 0 ? Number(oldRefMass) : 1;
    const defaultImpact = Number.isFinite(storedImpact) ? Math.max(0, Math.min(1, storedImpact))
      : Number.isFinite(Number(oldRefImpact)) ? Math.max(0, Math.min(1, Number(oldRefImpact))) : .25;
    const oldKind = old && old.kind ? old.kind : 'box';
    const asKind = kind => kind === 'circle' ? 'circle' : 'box';
    const ensureRefInWorld = (kind, ref) => {
      if(!ref) return;
      const k = asKind(kind);
      const list = k === 'circle' ? GAME.world.colliders.circle : GAME.world.colliders.box;
      if(!list.includes(ref)) list.push(ref);
    };

    const createCollider = kind => {
      const kindKey = asKind(kind);
      const base = kindKey === 'circle'
        ? {x:0, z:0, r:1, mass: defaultMass, impact: defaultImpact, physics: false, enabled: true, owner: o}
        : {x:0, z:0, hx:1, hz:1, mass: defaultMass, impact: defaultImpact, physics: false, enabled: true, owner: o};
      if(kindKey !== 'circle') base._boxList = GAME.world.colliders.box;
      if(kindKey === 'circle') GAME.world.colliders.circle.push(base);
      else GAME.world.colliders.box.push(base);
      o.userData.collider = {kind: kindKey, ref: base};
      o.userData.physicsMass = defaultMass;
      o.userData.physicsImpact = defaultImpact;
      o.userData.physicsEnabled = false;
      if(o.userData.addedEntry) o.userData.addedEntry.collide = true;
      if(o.userData.addedEntry) o.userData.addedEntry.physics = false;
      if(o.userData.addedEntry) o.userData.addedEntry.physicsMass = defaultMass;
      if(o.userData.addedEntry) o.userData.addedEntry.physicsImpact = defaultImpact;
      STORE.syncCollider(o);
      return base;
    };

    if(enabled){
      if(old && old.ref){
        if(old.ref.physics) old.ref.physics = false;
        if(old.ref.mass == null) old.ref.mass = defaultMass;
        if(old.ref.impact == null) old.ref.impact = defaultImpact;
        old.ref.enabled = true;
        if(old.ref) old.ref.physics = false;
        old.ref.owner = o;
        ensureRefInWorld(old.kind || oldKind, old.ref);
        o.userData.physicsMass = old.ref.mass;
        o.userData.physicsImpact = old.ref.impact;
      } else {
        createCollider(oldKind);
      }
      o.userData.physicsEnabled = false;
      if(o.userData.addedEntry){
        o.userData.addedEntry.physics = false;
        o.userData.addedEntry.collide = true;
        o.userData.addedEntry.physicsMass = o.userData.physicsMass;
        o.userData.addedEntry.physicsImpact = o.userData.physicsImpact;
      }
      rebuildPhysics();
      STORE.syncCollider(o);
      deps.markDirty();
      deps.buildInspector();
      deps.refreshOutliner();
      deps.status('Collider enabled');
      return;
    }

    if(!enabled && old){
      if(old.ref){
        if(old.ref.mass != null) o.userData.physicsMass = old.ref.mass;
        else o.userData.physicsMass = defaultMass;
        if(old.ref.impact != null) o.userData.physicsImpact = old.ref.impact;
        else o.userData.physicsImpact = defaultImpact;
        old.ref.enabled = false;
        old.ref.physics = false;
      }
      if(o.userData.addedEntry){
        o.userData.addedEntry.physics = false;
        o.userData.addedEntry.physicsMass = o.userData.physicsMass;
        o.userData.addedEntry.physicsImpact = o.userData.physicsImpact;
        o.userData.addedEntry.collide = false;
      }
      o.userData.physicsEnabled = false;
      rebuildPhysics();
      deps.markDirty();
      deps.buildInspector();
      deps.refreshOutliner();
      deps.status('Collider disabled');
      return;
    }

    rebuildPhysics();
    deps.markDirty();
    deps.buildInspector();
    deps.refreshOutliner();
    deps.status('Collider state unchanged');
  }

  function setPhysicsEnabled(o, enabled){
    if(!o || o.userData.editorType !== 'mesh') return;
    const old = o.userData.collider || null;
    const storedMass = Number(o.userData.physicsMass);
    const storedImpact = Number(o.userData.physicsImpact);
    const oldRefMass = old && old.ref && old.ref.mass;
    const oldRefImpact = old && old.ref && old.ref.impact;
    const defaultMass = Number.isFinite(storedMass) && storedMass > 0 ? storedMass
      : Number.isFinite(Number(oldRefMass)) && Number(oldRefMass) > 0 ? Number(oldRefMass) : 1;
    const defaultImpact = Number.isFinite(storedImpact) ? Math.max(0, Math.min(1, storedImpact))
      : Number.isFinite(Number(oldRefImpact)) ? Math.max(0, Math.min(1, Number(oldRefImpact))) : .25;
    const oldKind = old && old.kind ? old.kind : 'box';
    const asKind = kind => kind === 'circle' ? 'circle' : 'box';
    const ensureRefInWorld = (kind, ref) => {
      if(!ref) return;
      const k = asKind(kind);
      const list = k === 'circle' ? GAME.world.colliders.circle : GAME.world.colliders.box;
      if(!list.includes(ref)) list.push(ref);
    };
    const createCollider = kind => {
      const kindKey = asKind(kind);
      const base = kindKey === 'circle'
        ? {x:0, z:0, r:1, mass: defaultMass, impact: defaultImpact, physics: true, enabled: true, owner: o}
        : {x:0, z:0, hx:1, hz:1, mass: defaultMass, impact: defaultImpact, physics: true, enabled: true, owner: o};
      if(kindKey !== 'circle') base._boxList = GAME.world.colliders.box;
      if(kindKey === 'circle') GAME.world.colliders.circle.push(base);
      else GAME.world.colliders.box.push(base);
      o.userData.collider = {kind: kindKey, ref: base};
      o.userData.physicsMass = defaultMass;
      o.userData.physicsImpact = defaultImpact;
      o.userData.physicsEnabled = true;
      if(o.userData.addedEntry){
        o.userData.addedEntry.physics = true;
        o.userData.addedEntry.physicsMass = defaultMass;
        o.userData.addedEntry.physicsImpact = defaultImpact;
        o.userData.addedEntry.collide = true;
      }
      STORE.syncCollider(o);
      return base;
    };

    if(enabled){
      if(old && old.ref){
        old.ref.physics = true;
        old.ref.enabled = true;
        old.ref.owner = o;
        if(old.ref.mass == null) old.ref.mass = defaultMass;
        if(old.ref.impact == null) old.ref.impact = defaultImpact;
        o.userData.physicsMass = old.ref.mass;
        o.userData.physicsImpact = old.ref.impact;
        o.userData.physicsEnabled = true;
        ensureRefInWorld(old.kind || oldKind, old.ref);
        if(o.userData.addedEntry){
          o.userData.addedEntry.physics = true;
          o.userData.addedEntry.physicsMass = o.userData.physicsMass;
          o.userData.addedEntry.physicsImpact = o.userData.physicsImpact;
          o.userData.addedEntry.collide = true;
        }
      } else {
        createCollider(oldKind);
      }
      rebuildPhysics();
      deps.markDirty();
      deps.buildInspector();
      deps.refreshOutliner();
      deps.status('Physics enabled');
      return;
    }

    if(old && old.ref){
      old.ref.physics = false;
      old.ref.enabled = true;
      o.userData.physicsEnabled = false;
      if(o.userData.addedEntry) o.userData.addedEntry.physics = false;
      o.userData.physicsMass = old.ref.mass || defaultMass;
      o.userData.physicsImpact = old.ref.impact == null ? defaultImpact : old.ref.impact;
      if(o.userData.addedEntry) o.userData.addedEntry.physicsMass = o.userData.physicsMass;
      if(o.userData.addedEntry) o.userData.addedEntry.physicsImpact = o.userData.physicsImpact;
      if(o.userData.addedEntry) o.userData.addedEntry.collide = true;
      rebuildPhysics();
      deps.markDirty();
      deps.buildInspector();
      deps.refreshOutliner();
      deps.status('Physics disabled');
      return;
    }

    o.userData.physicsEnabled = false;
    if(o.userData.addedEntry) o.userData.addedEntry.physics = false;
    rebuildPhysics();
    deps.markDirty();
    deps.status('Physics state unchanged');
  }

  function performDeleteEntity(o){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    if(isBlueprintPart(o)){ deps.status(tr('Blueprint component cannot be deleted', 'Componente blueprint non eliminabile')); return; }
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
    deps.status(tr('Deleted: ', 'Eliminato: ') + (o.userData.editorName || ''));
  }

  function performDeleteEntities(list){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    const removable = (list || []).filter(o => o && !isBlueprintPart(o));
    const unique = [];
    removable.forEach(o => { if(!unique.includes(o)) unique.push(o); });
    if(!unique.length) return;
    const beforeSelection = unique.slice();
    unique.forEach(o => {
      deps.removeEntity(o);
      if(o.userData && o.userData.editorId) thumbCache.delete(o.userData.editorId);
    });
    ED.multiSelected = null;
    ED.selected = null;
    deps.pushHistory({
      label: 'Delete ' + unique.length + ' objects',
      undo: () => { unique.forEach(o => deps.restoreEntity(o)); selectMultiObjects(beforeSelection); },
      redo: () => { unique.forEach(o => deps.removeEntity(o)); deselect(); },
    });
    deps.markDirty();
    deps.refreshOutliner();
    deps.buildInspector();
    deps.status(tr('Deleted ', 'Eliminati ') + unique.length + tr(' objects', ' oggetti'));
  }

  function requestDeleteEntity(o){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    if(!o) return;
    if(isBlueprintPart(o)){
      deps.status(tr('Blueprint component cannot be deleted', 'Componente blueprint non eliminabile'));
      return;
    }
    deps.confirmEditorAction({
      title: tr('Delete scene object?', 'Eliminare oggetto scena?'),
      message: tr('Delete "', 'Eliminare "') + (o.userData.editorName || o.userData.editorId || 'Entity') + tr('" from the current level?', '" dal livello corrente?'),
      okText: tr('Delete object', 'Elimina oggetto'),
    }).then(ok => { if(ok) performDeleteEntity(o); });
  }

  function requestDeleteSelection(){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    const list = selectedObjects();
    if(list.length <= 1) return requestDeleteEntity(list[0] || ED.selected);
    deps.confirmEditorAction({
      title: tr('Delete selected objects?', 'Eliminare oggetti selezionati?'),
      message: tr('Delete ', 'Eliminare ') + list.length + tr(' selected object(s) from the current level?', ' oggetti selezionati dal livello corrente?'),
      okText: tr('Delete objects', 'Elimina oggetti'),
    }).then(ok => { if(ok) performDeleteEntities(list); });
  }

  function cloneSafeUserData(value){
    if(!value || typeof value !== 'object') return {};
    const seen = new WeakSet();
    try {
      return JSON.parse(JSON.stringify(value, (key, item) => {
        if(typeof item === 'function') return undefined;
        // Runtime collider links point back to the Object3D and collider list.
        // They must be rebuilt for the duplicate, never serialized by clone().
        if(key === 'owner' || key === '_boxList' || item && item.isObject3D) return undefined;
        if(item && typeof item === 'object'){
          if(seen.has(item)) return undefined;
          seen.add(item);
        }
        return item;
      }));
    } catch(err){ return {}; }
  }

  function cleanClone(o){
    const savedUserData = [];
    o.traverse(node => {
      savedUserData.push([node, node.userData]);
      node.userData = node === o ? {} : cloneSafeUserData(node.userData);
    });
    try {
      const c = o.clone(true);
      c.userData = {};
      c.traverse(node => {
        if(!node || !node.isMesh) return;
        if(node.userData && node.userData.editorLightHandle) return;
        if(node.geometry && node.geometry.clone) node.geometry = node.geometry.clone();
        if(Array.isArray(node.material)) node.material = node.material.map(material => material && material.clone ? material.clone() : material);
        else if(node.material && node.material.clone) node.material = node.material.clone();
      });
      return c;
    } finally {
      savedUserData.forEach(item => { item[0].userData = item[1]; });
    }
  }

  function duplicateEntity(o, offset){
    if(isOnlineDemo()){ blockOnlineDemoAction(); return; }
    if(isBlueprintPart(o)) return;
    const id = STORE.nextId();
    const sourceParent = o.parent && o.parent !== GAME.core.scene && o.parent.userData && o.parent.userData.editorId ? o.parent : null;
    const sourceParentId = o.userData.linkParentId || sourceParent && sourceParent.userData.editorId || null;
    let obj, entry;
    const src = o.userData.addedEntry;
    if(o.userData.effectParams){
      const params = Object.assign({}, o.userData.effectParams);
      obj = STORE.createEmitter(params.kind, params);
      entry = {id, kind:'effect', effect: params.kind, params, name: o.userData.editorName + ' copy', collide: false};
    } else if(src){
      entry = STORE.snapshotAddedEntry ? STORE.snapshotAddedEntry(o, src) : JSON.parse(JSON.stringify(src));
      entry.id = id; entry.name = o.userData.editorName + ' copy';
      if(src.kind === 'cinemaStudio' && o.userData.cinemaProps){
        entry.props = JSON.parse(JSON.stringify(o.userData.cinemaProps));
        if(entry.asset){
          entry.asset.key = 'cinema:studio:' + id;
          entry.asset.name = entry.name;
        }
      }
      obj = null;
    } else {
      entry = {id, kind:'clone', srcId: o.userData.editorId, name: o.userData.editorName + ' copy', collide: !!o.userData.collider};
      if(STORE.snapshotAddedEntry) entry = STORE.snapshotAddedEntry(o, entry);
      entry.id = id;
      entry.name = o.userData.editorName + ' copy';
      try { obj = cleanClone(o); }
      catch(err){
        deps.status(tr('Duplicate failed: ', 'Duplicazione fallita: ') + (err && err.message || err));
        return;
      }
    }
    const sourceCollider = o.userData.collider && o.userData.collider.ref;
    if(sourceCollider){
      entry.collide = sourceCollider.enabled !== false;
      entry.colliderKind = o.userData.collider.kind === 'circle' ? 'circle' : 'box';
      if(o.userData.colliderShape) entry.colliderShape = cloneSafeUserData(o.userData.colliderShape);
      entry.physics = !!(o.userData.physicsEnabled || sourceCollider.physics);
      entry.physicsMass = sourceCollider.mass != null ? sourceCollider.mass : o.userData.physicsMass;
      entry.physicsImpact = sourceCollider.impact != null ? sourceCollider.impact : o.userData.physicsImpact;
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
      if(sourceParentId) entry.t.parent = sourceParentId;
      STORE.registerAdded(GAME, created, entry);
      if(sourceParent){
        sourceParent.add(created);
        created.userData.linkParentId = sourceParentId;
        entry.t = STORE.tOf(created);
        entry.t.name = entry.name;
      }
      if(o.userData.matProps) STORE.applyMatProps(created, o.userData.matProps);
      deps.pushHistory({
        label: 'Duplicate ' + (o.userData.editorName || 'Entity'),
        undo: () => deps.removeEntity(created),
        redo: () => { deps.restoreEntity(created); selectObject(created); },
      });
      deps.markDirty(); deps.refreshOutliner(); selectObject(created);
      if(deps.setAssetLoading && entry && (entry.kind === 'glb' || entry.kind === 'logicElement')){
        deps.setAssetLoading(true, entry.name, 100, tr('Duplicated', 'Duplicato'));
        setTimeout(() => deps.setAssetLoading(false), 260);
      }
    };
    if(obj){
      try { place(obj); }
      catch(err){
        deps.status(tr('Duplicate failed: ', 'Duplicazione fallita: ') + (err && err.message || err));
      }
    }
    else {
      const heavy = entry.kind === 'glb' || entry.kind === 'logicElement';
      if(heavy && deps.setAssetLoading) deps.setAssetLoading(true, entry.name, 12, tr('Duplicating object', 'Duplicazione oggetto'));
      else if(entry.kind === 'light' && deps.requestWarmup) deps.requestWarmup(tr('Warm-up light...', 'Preparazione luce...'));
      const create = () => STORE.createFromEntry(entry, GAME).then(place).catch(err => {
        if(heavy && deps.setAssetLoading) deps.setAssetLoading(false);
        const it = GAME && GAME.i18n && GAME.i18n.lang === 'it';
        deps.status((it ? 'Duplicazione fallita: ' : 'Duplicate failed: ') + err.message);
      });
      if(heavy) requestAnimationFrame(() => requestAnimationFrame(create));
      else create();
    }
  }

  function focusSelected(){
    const multi = Array.isArray(ED.multiSelected) ? ED.multiSelected.filter(Boolean) : [];
    const target = multi.length > 1 ? null : (ED.selected || (ED.special === 'env' ? null : null));
    if(multi.length > 1){
      const box = new THREE.Box3();
      multi.forEach(item => box.union(new THREE.Box3().setFromObject(item)));
      if(box.isEmpty()) return;
      const c = box.getCenter(new THREE.Vector3());
      const r = Math.max(2.5, box.getSize(new THREE.Vector3()).length() * .8);
      const dir = new THREE.Vector3().subVectors(camE.position, c).normalize();
      if(dir.lengthSq() < .01) dir.set(1, .6, 1).normalize();
      camE.position.copy(c).addScaledVector(dir, r * 1.6).add(new THREE.Vector3(0, r*.35, 0));
      camE.lookAt(c);
      const orbit = deps.getOrbit();
      if(orbit) orbit.target.copy(c);
      return;
    }
    if(!target) return;
    if(deps.focusViewportTarget && deps.focusViewportTarget(target)) return;
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
    if(ED.playerColliderEdit && colliderProxy && GAME.player && GAME.player.car === o && GAME.player.collision){
      const base = colliderProxy.userData.colliderBase || {};
      const yaw = o.rotation ? (o.rotation.y || 0) : 0;
      const wx = colliderProxy.position.x - o.position.x;
      const wz = colliderProxy.position.z - o.position.z;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const offsetX = wx * cos - wz * sin;
      const offsetZ = wx * sin + wz * cos;
      const bodyY = GAME.player.collision.bodyY == null ? .55 : GAME.player.collision.bodyY;
      const patch = {
        hx: Math.max(.05, (base.hx || .92) * Math.abs(colliderProxy.scale.x || 1)),
        hy: Math.max(.05, (base.hy || .42) * Math.abs(colliderProxy.scale.y || 1)),
        hz: Math.max(.05, (base.hz || 1.85) * Math.abs(colliderProxy.scale.z || 1)),
        offsetX,
        offsetY: colliderProxy.position.y - bodyY,
        offsetZ,
        rotX: colliderProxy.rotation.x || 0,
        rotY: (colliderProxy.rotation.y || 0) - yaw,
        rotZ: colliderProxy.rotation.z || 0,
      };
      if(GAME.player.setCollision) GAME.player.setCollision(patch);
      else Object.assign(GAME.player.collision, patch);
      deps.markDirty();
      deps.syncTransformFields();
      return;
    }
    if(ED.colliderEdit && colliderProxy && o.userData && o.userData.collider && o.userData.collider.ref){
      const partIndex = Number.isInteger(ED.colliderPartIndex) ? ED.colliderPartIndex : null;
      if(partIndex != null && o.userData.collider.ref.parts && o.userData.collider.ref.parts[partIndex]){
        const part = o.userData.collider.ref.parts[partIndex];
        const shape = o.userData.colliderShape || (o.userData.colliderShape = {});
        if(!Array.isArray(shape.parts)) shape.parts = [];
        const partShape = shape.parts[partIndex] || (shape.parts[partIndex] = {});
        const base = colliderProxy.userData.colliderBase || {};
        partShape.mode = 'solid';
        partShape.name = part.partName || partShape.name;
        partShape.offsetX = (Number(partShape.offsetX) || 0) + (colliderProxy.position.x - (base.x || part.x || 0));
        partShape.offsetY = (Number(partShape.offsetY) || 0) + (colliderProxy.position.y - (base.y || part.y || 0));
        partShape.offsetZ = (Number(partShape.offsetZ) || 0) + (colliderProxy.position.z - (base.z || part.z || 0));
        partShape.hx = Math.max(.05, (base.hx || part.hx || 1) * Math.abs(colliderProxy.scale.x || 1));
        partShape.hy = Math.max(.05, (base.hy || part.hy || .5) * Math.abs(colliderProxy.scale.y || 1));
        partShape.hz = Math.max(.05, (base.hz || part.hz || 1) * Math.abs(colliderProxy.scale.z || 1));
        partShape.rotX = colliderProxy.rotation.x || 0;
        partShape.rotY = colliderProxy.rotation.y || 0;
        partShape.rotZ = colliderProxy.rotation.z || 0;
        partShape.rot = partShape.rotY;
        if(o.userData.addedEntry) o.userData.addedEntry.colliderShape = Object.assign({}, shape);
        STORE.syncCollider(o);
        rebuildPhysics();
        deps.markDirty();
        return;
      }
      const box = new THREE.Box3().setFromObject(o);
      const center = box.isEmpty() ? o.position.clone() : box.getCenter(new THREE.Vector3());
      const shape = o.userData.colliderShape || (o.userData.colliderShape = {});
      const base = colliderProxy.userData.colliderBase || {};
      shape.offsetX = colliderProxy.position.x - center.x;
      shape.offsetY = colliderProxy.position.y - center.y;
      shape.offsetZ = colliderProxy.position.z - center.z;
      shape.hy = Math.max(.05, (base.hy || .5) * Math.abs(colliderProxy.scale.y || 1));
      if(o.userData.collider.kind === 'circle'){
        shape.r = Math.max(.05, (base.r || 1) * Math.max(Math.abs(colliderProxy.scale.x || 1), Math.abs(colliderProxy.scale.z || 1)));
      } else {
        shape.hx = Math.max(.05, (base.hx || 1) * Math.abs(colliderProxy.scale.x || 1));
        shape.hz = Math.max(.05, (base.hz || 1) * Math.abs(colliderProxy.scale.z || 1));
        shape.rotX = colliderProxy.rotation.x || 0;
        shape.rotY = colliderProxy.rotation.y || 0;
        shape.rotZ = colliderProxy.rotation.z || 0;
        shape.rot = shape.rotY;
      }
      if(o.userData.addedEntry) o.userData.addedEntry.colliderShape = Object.assign({}, shape);
      STORE.syncCollider(o);
      rebuildPhysics();
      deps.markDirty();
      return;
    }
    if(Array.isArray(ED.multiSelected) && ED.multiSelected.length > 1 && deps.applyMultiGizmoProxyToSelection){
      deps.applyMultiGizmoProxyToSelection();
      ED.multiSelected.forEach(item => {
        if(!item || !item.userData) return;
        if(item.userData.editorType === 'playerSkid' && GAME.player.syncSkid) GAME.player.syncSkid(item);
        if(item.userData.editorType === 'playerDataWidget' && GAME.player.syncDataWidget) GAME.player.syncDataWidget(item);
        STORE.syncCollider(item);
      });
      deps.markDirty();
      deps.syncTransformFields();
      return;
    }
    deps.applyZUpProxyToSelected();
    if(o.userData.editorType === 'player'){
      if(GAME.player.syncSpawnFromVisibleTransform) GAME.player.syncSpawnFromVisibleTransform();
      else {
        const heading = GAME.player.visibleHeading ? GAME.player.visibleHeading() : o.rotation.y;
        GAME.player.physics.pos.copy(o.position);
        GAME.player.physics.heading = heading;
        if(GAME.player.spawn){
          GAME.player.spawn.x = o.position.x;
          GAME.player.spawn.z = o.position.z;
          GAME.player.spawn.heading = heading;
        }
        if(GAME.systems.physics) GAME.systems.physics.syncPlayer();
      }
    }
    if(o.userData.editorType === 'playerSkid' && GAME.player.syncSkid) GAME.player.syncSkid(o);
    if(o.userData.editorType === 'playerDataWidget' && GAME.player.syncDataWidget) GAME.player.syncDataWidget(o);
    STORE.syncCollider(o);
    deps.markDirty();
    deps.syncTransformFields();
  }

  return Object.freeze({
    selectObject,
    selectCollider,
    selectColliderPart,
    selectMultiObjects,
    selectObjectWithModifiers,
    selectSimilarObjects,
    selectSpecial,
    deselect,
    isPlayerCameraSelection,
    toggleVisible,
    setColliderEnabled,
    setPhysicsEnabled,
    performDeleteEntity,
    performDeleteEntities,
    requestDeleteEntity,
    requestDeleteSelection,
    duplicateEntity,
    cleanClone,
    focusSelected,
    onGizmoChange,
  });
}

window.LK_EDITOR_SELECTION_MANAGER = Object.freeze({create});
})();
