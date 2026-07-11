/* =========================================================
   LOT KING - LIVE MESH EDITOR
   GLB sub-mesh selection, separation and persistent overrides.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const STORE = deps.STORE;
  const section = deps.section;
  const btnRow = deps.btnRow;
  const el = deps.el;
  const buildInspector = deps.buildInspector || function(){};
  const markDirty = deps.markDirty || function(){};
  const refreshOutliner = deps.refreshOutliner || function(){};
  const status = deps.status || function(){};
  const pushHistory = deps.pushHistory || function(){};
  const removeEntity = deps.removeEntity || function(){};
  const restoreEntity = deps.restoreEntity || function(){};
  const selectObject = deps.selectObject || function(){};
  const liveSelection = deps.liveSelection || {};
  let extractionPending = false;
  const tr = (en, it) => window.LOT_KING && LOT_KING.i18n && LOT_KING.i18n.lang === 'it' ? (it || en) : en;

  function editableRoot(object){
    if(object && object.userData && object.userData.editorType === 'player' && deps.GAME && deps.GAME.player && deps.GAME.player.getModel){
      return deps.GAME.player.getModel() || object;
    }
    return object;
  }
  function editsOf(object){
    const isPlayer = object.userData.editorType === 'player';
    const edits = STORE.normalizeMeshEdits(isPlayer
      ? (object.userData.playerMeshEdits || editableRoot(object).userData.meshEdits)
      : (object.userData.meshEdits || object.userData.addedEntry && object.userData.addedEntry.meshEdits));
    if(isPlayer) object.userData.playerMeshEdits = edits;
    else object.userData.meshEdits = edits;
    if(!isPlayer && object.userData.addedEntry) object.userData.addedEntry.meshEdits = JSON.parse(JSON.stringify(edits));
    return edits;
  }
  function meshEntries(object){
    const root = editableRoot(object);
    STORE.assignMeshEditIds(root);
    const rows = [];
    root.traverse(mesh => {
      if(!mesh.isMesh || !mesh.userData || !mesh.userData.lkMeshEditId) return;
      rows.push({
        id:mesh.userData.lkMeshEditId,
        mesh,
        name:mesh.name || mesh.userData.lkMeshEditId,
        generated:!!mesh.userData.lkMeshEditGenerated,
        joined:!!mesh.userData.lkMeshEditJoin,
        skinned:!!mesh.isSkinnedMesh,
        morph:!!(mesh.morphTargetInfluences || mesh.geometry && Object.keys(mesh.geometry.morphAttributes || {}).length),
      });
    });
    return rows;
  }
  function selectedIds(object){
    return liveSelection.ids ? liveSelection.ids(object) : [];
  }
  function selectIds(object, ids){
    if(liveSelection.selectIds) liveSelection.selectIds(object, ids || []);
  }
  function apply(object, edits, selected){
    const normalized = STORE.normalizeMeshEdits(edits);
    if(object.userData.editorType === 'player') object.userData.playerMeshEdits = normalized;
    else object.userData.meshEdits = normalized;
    if(object.userData.editorType !== 'player' && object.userData.addedEntry) object.userData.addedEntry.meshEdits = JSON.parse(JSON.stringify(normalized));
    STORE.applyMeshEdits(editableRoot(object), normalized);
    selectIds(object, selected || []);
    markDirty();
    refreshOutliner();
    buildInspector();
  }
  function edit(object, label, mutate, nextSelection){
    const before = JSON.parse(JSON.stringify(editsOf(object)));
    const after = JSON.parse(JSON.stringify(before));
    mutate(after);
    if(JSON.stringify(before) === JSON.stringify(after)) return;
    const selectedBefore = selectedIds(object).slice();
    apply(object, after, nextSelection == null ? selectedBefore : nextSelection);
    const selectedAfter = selectedIds(object).slice();
    pushHistory({
      label:label,
      undo:() => apply(object, before, selectedBefore),
      redo:() => apply(object, after, selectedAfter),
    });
  }
  function transformValue(mesh, kind, axis){
    if(kind === 'p') return mesh.position[axis];
    if(kind === 'r') return mesh.rotation[axis] * 180 / Math.PI;
    return mesh.scale[axis];
  }
  function transformRow(object, selected, kind, label){
    const row = el('<div class="lk-vec"><label>' + label + '</label></div>');
    ['x','y','z'].forEach(axis => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = kind === 'r' ? '1' : '.05';
      const values = selected.map(item => transformValue(item.mesh, kind, axis));
      const same = values.every(value => Math.abs(value - values[0]) < 1e-6);
      if(same) input.value = Number(values[0]).toFixed(3).replace(/\.?0+$/, '') || '0';
      else input.placeholder = 'mixed';
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if(!Number.isFinite(value)) return;
        edit(object, 'Edit GLB mesh transform', edits => {
          selected.forEach(item => {
            const current = edits.transforms[item.id] || {
              p:item.mesh.position.toArray(),
              r:[item.mesh.rotation.x, item.mesh.rotation.y, item.mesh.rotation.z],
              s:item.mesh.scale.toArray(),
            };
            if(kind === 'p') current.p['xyz'.indexOf(axis)] = value;
            else if(kind === 'r') current.r['xyz'.indexOf(axis)] = value * Math.PI / 180;
            else current.s['xyz'.indexOf(axis)] = value;
            edits.transforms[item.id] = current;
          });
        });
      });
      row.appendChild(input);
    });
    return row;
  }
  function propertyCheckbox(object, selected, key, label){
    const row = document.createElement('label'); row.className = 'lk-check';
    const input = document.createElement('input'); input.type = 'checkbox';
    const values = selected.map(item => !!item.mesh[key]);
    input.checked = values.every(Boolean); input.indeterminate = !values.every(v => v === values[0]);
    input.addEventListener('change', () => edit(object, 'Edit GLB mesh properties', edits => {
      selected.forEach(item => { edits.properties[item.id] = Object.assign({}, edits.properties[item.id], {[key]:input.checked}); });
    }));
    const text = document.createElement('span'); text.textContent = label;
    row.appendChild(input); row.appendChild(text); return row;
  }
  function propertiesPanel(object, selected){
    const wrap = el('<div class="lk-mesh-properties"></div>');
    if(selected.length === 1){
      const row = el('<div class="lk-field"><label>' + tr('Object name', 'Nome oggetto') + '</label></div>');
      const input = document.createElement('input'); input.type = 'text'; input.value = selected[0].mesh.name || '';
      input.addEventListener('change', () => edit(object, 'Rename GLB mesh part', edits => {
        const item = selected[0]; edits.properties[item.id] = Object.assign({}, edits.properties[item.id], {name:input.value.trim() || item.id});
      }));
      row.appendChild(input); wrap.appendChild(row);
    }
    wrap.appendChild(propertyCheckbox(object, selected, 'visible', tr('Visible', 'Visibile')));
    wrap.appendChild(propertyCheckbox(object, selected, 'castShadow', tr('Cast shadows', 'Proietta ombre')));
    wrap.appendChild(propertyCheckbox(object, selected, 'receiveShadow', tr('Receive shadows', 'Riceve ombre')));
    wrap.appendChild(propertyCheckbox(object, selected, 'frustumCulled', 'Frustum culling'));
    const order = el('<div class="lk-field"><label>Render order</label></div>');
    const input = document.createElement('input'); input.type = 'number'; input.step = '1';
    const values = selected.map(item => item.mesh.renderOrder || 0);
    if(values.every(v => v === values[0])) input.value = values[0]; else input.placeholder = 'mixed';
    input.addEventListener('change', () => { const value = Number(input.value); if(!Number.isFinite(value)) return; edit(object, 'Edit GLB render order', edits => {
      selected.forEach(item => { edits.properties[item.id] = Object.assign({}, edits.properties[item.id], {renderOrder:value}); });
    }); });
    order.appendChild(input); wrap.appendChild(order); return wrap;
  }
  function cloneData(value){
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }
  function worldTransform(object){
    object.updateMatrixWorld(true);
    const position = new deps.THREE.Vector3();
    const quaternion = new deps.THREE.Quaternion();
    const scale = new deps.THREE.Vector3();
    const rotation = new deps.THREE.Euler();
    object.matrixWorld.decompose(position, quaternion, scale);
    rotation.setFromQuaternion(quaternion, 'XYZ');
    return {p:position.toArray(), r:[rotation.x, rotation.y, rotation.z], s:scale.toArray(), v:true};
  }
  function extractionEntry(object, item, allIds, baseEdits){
    const source = cloneData(object.userData.addedEntry || {});
    const isolatedEdits = STORE.normalizeMeshEdits(cloneData(baseEdits));
    isolatedEdits.deleted = Array.from(new Set(allIds.filter(id => id !== item.id)));
    delete source.id;
    delete source.name;
    delete source.t;
    delete source.colliderShape;
    delete source.colliderDummyVisibility;
    source.id = STORE.nextId();
    source.kind = 'glb';
    source.name = (item.name || 'GLB Part') + ' · extracted';
    source.t = worldTransform(object);
    source.meshEdits = isolatedEdits;
    source.collide = true;
    source.physics = false;
    source.physicsMass = 1;
    source.physicsImpact = .25;
    source.props = cloneData(object.userData.matProps || source.props || null);
    return source;
  }
  function extractAsSceneObjects(object, selected, entries){
    if(extractionPending) return;
    if(object.userData.editorType === 'player') return status(tr('Player model parts cannot become level objects.', 'Le parti del modello player non possono diventare oggetti del livello.'));
    const valid = selected.filter(item => item.mesh.visible && !item.skinned && !item.morph);
    if(!valid.length) return status(tr('Select at least one visible non-skinned mesh part.', 'Seleziona almeno una parte mesh visibile non skinned.'));
    const before = cloneData(editsOf(object));
    const after = cloneData(before);
    valid.forEach(item => { if(!after.deleted.includes(item.id)) after.deleted.push(item.id); });
    const allIds = entries.map(item => item.id);
    const extractionEntries = valid.map(item => extractionEntry(object, item, allIds, before));
    const staged = [];
    extractionPending = true;
    status(tr('Extracting GLB parts as scene objects…', 'Estrazione parti GLB come oggetti scena…'));
    Promise.all(extractionEntries.map(entry => STORE.createFromEntry(entry, deps.GAME).then(created => {
      if(entry.props) STORE.applyMatProps(created, entry.props);
      STORE.registerAdded(deps.GAME, created, entry);
      staged.push(created);
      return created;
    }))).then(created => {
      apply(object, after, []);
      pushHistory({
        label:'Extract GLB parts as scene objects',
        undo:() => { created.forEach(removeEntity); apply(object, before, valid.map(item => item.id)); },
        redo:() => { created.forEach(restoreEntity); apply(object, after, []); },
      });
      if(deps.GAME.systems && deps.GAME.systems.physics) deps.GAME.systems.physics.rebuild();
      markDirty();
      refreshOutliner();
      if(created[0]) selectObject(created[0]);
      status(valid.length + ' ' + tr('GLB part(s) extracted with editable collision.', 'parti GLB estratte con collisione modificabile.'));
    }).catch(err => {
      staged.forEach(removeEntity);
      status(tr('GLB extraction failed: ', 'Estrazione GLB fallita: ') + (err && err.message ? err.message : err));
    }).finally(() => { extractionPending = false; });
  }
  function build(box, object){
    if(!object || !object.userData || !['mesh','player'].includes(object.userData.editorType)) return;
    if(object.userData.editorType === 'mesh' && (!object.userData.addedEntry || object.userData.addedEntry.kind !== 'glb')) return;
    const entries = meshEntries(object);
    if(!entries.length) return;
    const selectedSet = new Set(selectedIds(object));
    const selected = entries.filter(item => selectedSet.has(item.id));
    const live = !!(liveSelection.isActive && liveSelection.isActive(object));
    const panel = section(tr('EDIT MESH / GLB PARTS', 'MODIFICA MESH / PARTI GLB'), false);
    panel.body.appendChild(el('<div class="lk-hint">' + tr(
      'Select one or more GLB mesh nodes. Detach keeps parts inside the source GLB; Extract creates independent scene objects with their own editable collision. Decomposition can first split by materials or connected geometry.',
      'Seleziona uno o più nodi mesh del GLB. Scollega mantiene le parti nel GLB sorgente; Estrai crea oggetti scena indipendenti con collisione modificabile. Prima puoi scomporre per materiali o geometria connessa.'
    ) + '</div>'));
    panel.body.appendChild(btnRow([
      {label:live ? tr('Stop Live Mesh Editing', 'Ferma Live Mesh Editing') : tr('Start Live Mesh Editing', 'Avvia Live Mesh Editing'), action:() => { if(liveSelection.toggle) liveSelection.toggle(object); buildInspector(); }},
      {label:tr('Clear selection', 'Svuota selezione'), action:() => { selectIds(object, []); buildInspector(); }},
    ]));
    const list = el('<div class="lk-mesh-edit-list"></div>');
    entries.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lk-mesh-edit-item';
      button.classList.toggle('selected', selectedSet.has(item.id));
      button.classList.toggle('deleted', editsOf(object).deleted.includes(item.id));
      button.textContent = (item.joined ? '⇄ ' : (item.generated ? '↳ ' : '')) + item.name + (item.skinned ? ' · skinned' : (item.morph ? ' · morph' : ''));
      button.title = item.id;
      button.addEventListener('click', event => {
        const current = new Set(selectedIds(object));
        if(event.ctrlKey || event.metaKey || event.shiftKey){
          if(current.has(item.id)) current.delete(item.id); else current.add(item.id);
        } else { current.clear(); current.add(item.id); }
        selectIds(object, Array.from(current));
        buildInspector();
      });
      list.appendChild(button);
    });
    panel.body.appendChild(list);
    if(selected.length){
      panel.body.appendChild(el('<div class="lk-hint">' + selected.length + ' ' + tr('selected mesh part(s)', 'parti mesh selezionate') + '</div>'));
      panel.body.appendChild(transformRow(object, selected, 'p', 'Position'));
      panel.body.appendChild(transformRow(object, selected, 'r', 'Rotation°'));
      panel.body.appendChild(transformRow(object, selected, 's', 'Scale'));
      panel.body.appendChild(propertiesPanel(object, selected));
      panel.body.appendChild(btnRow([
        {label:tr('Detach inside GLB', 'Scollega nel GLB'), action:() => edit(object, 'Detach GLB mesh nodes', edits => {
          selected.forEach(item => { if(!edits.detached.includes(item.id)) edits.detached.push(item.id); });
        })},
        {label:tr('Extract as scene objects', 'Estrai come oggetti scena'), action:() => extractAsSceneObjects(object, selected, entries)},
        {label:tr('Join selected', 'Unisci selezionate'), action:() => {
          const valid = selected.filter(item => item.mesh.visible && !item.skinned && !item.morph);
          if(valid.length < 2) return status(tr('Select at least two visible non-skinned mesh parts.', 'Seleziona almeno due parti mesh visibili non skinned.'));
          const edits = editsOf(object);
          let index = 1;
          const used = new Set((edits.joins || []).map(join => join.id));
          while(used.has('join:' + index)) index++;
          const joinId = 'join:' + index;
          edit(object, 'Join GLB mesh parts', next => {
            next.joins.push({id:joinId, name:'Joined Mesh ' + index, parts:valid.map(item => item.id)});
          }, [joinId]);
        }},
        {label:tr('Unjoin selected', 'Separa join selezionato'), action:() => {
          const ids = new Set(selected.map(item => item.id));
          const joined = (editsOf(object).joins || []).filter(join => ids.has(join.id));
          if(!joined.length) return status(tr('Select a previously joined mesh.', 'Seleziona una mesh unita in precedenza.'));
          edit(object, 'Unjoin GLB mesh parts', edits => {
            edits.joins = edits.joins.filter(join => !ids.has(join.id));
          }, joined.flatMap(join => join.parts));
        }},
        {label:tr('Split by material', 'Scomponi per materiale'), action:() => {
          const valid = selected.filter(item => !item.generated && !item.skinned && !item.morph);
          if(!valid.length) return status(tr('Select a non-skinned original mesh.', 'Seleziona una mesh originale non skinned.'));
          edit(object, 'Split GLB mesh by material', edits => { valid.forEach(item => { edits.splits[item.id] = 'material'; }); }, []);
        }},
        {label:tr('Split connected parts', 'Scomponi parti connesse'), action:() => {
          const valid = selected.filter(item => !item.generated && !item.skinned && !item.morph);
          if(!valid.length) return status(tr('Select a non-skinned original mesh.', 'Seleziona una mesh originale non skinned.'));
          edit(object, 'Split GLB connected mesh parts', edits => { valid.forEach(item => { edits.splits[item.id] = 'connected'; }); }, []);
        }},
        {label:tr('Delete selected', 'Elimina selezionate'), danger:true, action:() => edit(object, 'Delete GLB mesh parts', edits => {
          selected.forEach(item => { if(!edits.deleted.includes(item.id)) edits.deleted.push(item.id); });
        }, [])},
        {label:tr('Restore selected', 'Ripristina selezionate'), action:() => edit(object, 'Restore GLB mesh parts', edits => {
          const ids = new Set(selected.map(item => item.id));
          edits.deleted = edits.deleted.filter(id => !ids.has(id));
        })},
      ]));
    }
    panel.body.appendChild(btnRow([{label:tr('Reset all mesh edits', 'Ripristina modifiche mesh'), action:() => edit(object, 'Reset GLB mesh edits', edits => {
      edits.deleted = []; edits.detached = []; edits.transforms = {}; edits.properties = {}; edits.splits = {}; edits.joins = [];
    }, [])}]));
    box.appendChild(panel.root);
  }
  return Object.freeze({build, meshEntries, editableRoot});
}

window.LK_EDITOR_MESH_EDITOR = Object.freeze({create});
})();
