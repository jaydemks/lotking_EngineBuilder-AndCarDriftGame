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
    if(ED.selected === o && ED.special === null && !(ED.multiSelected && ED.multiSelected.length)) return;
    deps.clearHoverPickHelper();
    ED.multiSelected = null;
    ED.special = null;
    ED.colliderEdit = false;
    ED.playerColliderEdit = false;
    ED.selected = o;
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
    syncSelectedGizmo(o);
    deps.refreshSelectionHelpers();
    deps.buildInspector();
    deps.refreshOutliner();
  }

  function selectSpecial(kind){
    deps.clearHoverPickHelper();
    ED.multiSelected = null;
    ED.colliderEdit = false;
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
    deps.refreshOutliner();
  }

  function deselect(){
    ED.multiSelected = null;
    ED.colliderEdit = false;
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
    if(ED.tool === 'select') ED.tool = 'translate';
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
    syncSelectedGizmo(o);
    deps.refreshSelectionHelpers();
    deps.buildInspector();
    deps.refreshOutliner();
    deps.status('Collider edit: ' + (o.userData.editorName || 'object'));
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
    const list = (objects || []).filter(o => o && !isBlueprintPart(o));
    const unique = [];
    list.forEach(o => { if(!unique.includes(o)) unique.push(o); });
    if(!unique.length) return;
    deps.clearHoverPickHelper();
    ED.special = null;
    ED.selected = unique[0];
    ED.multiSelected = unique.length > 1 ? unique : null;
    if(GAME.ui && GAME.ui.previewRadioHud) GAME.ui.previewRadioHud(false);
    syncSelectedGizmo(ED.selected);
    deps.refreshSelectionHelpers();
    deps.buildInspector();
    deps.refreshOutliner();
    deps.status(unique.length > 1 ? ('Selected ' + unique.length + ' similar objects') : 'Selected object');
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
      if(GAME.systems.physics) GAME.systems.physics.rebuild();
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
      if(GAME.systems.physics) GAME.systems.physics.rebuild();
      deps.markDirty();
      deps.buildInspector();
      deps.refreshOutliner();
      deps.status('Collider disabled');
      return;
    }

    if(GAME.systems.physics) GAME.systems.physics.rebuild();
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
      if(GAME.systems.physics) GAME.systems.physics.rebuild();
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
      if(GAME.systems.physics) GAME.systems.physics.rebuild();
      deps.markDirty();
      deps.buildInspector();
      deps.refreshOutliner();
      deps.status('Physics disabled');
      return;
    }

    o.userData.physicsEnabled = false;
    if(o.userData.addedEntry) o.userData.addedEntry.physics = false;
    if(GAME.systems.physics) GAME.systems.physics.rebuild();
    deps.markDirty();
    deps.status('Physics state unchanged');
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
      if(GAME.systems && GAME.systems.physics) GAME.systems.physics.rebuild();
      deps.markDirty();
      return;
    }
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
    selectCollider,
    selectMultiObjects,
    selectSimilarObjects,
    selectSpecial,
    deselect,
    isPlayerCameraSelection,
    toggleVisible,
    setColliderEnabled,
    setPhysicsEnabled,
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
