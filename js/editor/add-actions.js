/* =========================================================
   LOT KING — EDITOR ADD / REPLACE ACTIONS
   Primitive/light/effect creation and GLB replacement inputs.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const $ = deps.$;
  const pushHistory = deps.pushHistory;
  const removeEntity = deps.removeEntity;
  const restoreEntity = deps.restoreEntity;
  const markDirty = deps.markDirty;
  const refreshOutliner = deps.refreshOutliner;
  const selectObject = deps.selectObject;
  const setTool = deps.setTool;
  const status = deps.status;
  const spawnPointAhead = deps.spawnPointAhead;
  const importAssetFiles = deps.importAssetFiles;
  const replaceObjectWithFile = deps.replaceObjectWithFile;
  const replacePlayerModelWithFile = deps.replacePlayerModelWithFile || function(){};
  const readFileAsDataURL = deps.readFileAsDataURL;
  const buildInspector = deps.buildInspector;
  const refreshAssetsPanel = deps.refreshAssetsPanel || function(){};
  const tr = (en, it) => GAME && GAME.i18n && GAME.i18n.lang === 'it' ? (it || en) : en;
  const requestWarmup = label => {
    if(GAME && GAME.editor && GAME.editor.requestWarmup) GAME.editor.requestWarmup(label || 'Warm-up lights...');
  };
  const revealLightHandle = obj => {
    if(!obj || !obj.traverse) return;
    obj.traverse(n => {
      if(!(n.userData && n.userData.editorLightHandle) || !n.material) return;
      n.visible = true;
      n.material.opacity = .42;
      n.material.needsUpdate = true;
    });
  };

  let pendingGlbPoint = null;
  let replaceTarget = null;

  function addPrimitive(prim, at){
    const id = STORE.nextId();
    const colliderOnly = prim === 'collisionBox';
    const realPrim = colliderOnly ? 'box' : prim;
    const obj = STORE.createPrimitive(realPrim);
    if(colliderOnly){
      obj.traverse(n => {
        if(!n.isMesh || !n.material) return;
        n.material = new THREE.MeshBasicMaterial({color:0x4be3a0, wireframe:true, transparent:true, opacity:.28, depthTest:false});
        n.renderOrder = 997;
      });
      obj.userData.colliderOnly = true;
    }
    const entry = {id, kind:'primitive', prim: realPrim, name: colliderOnly ? 'Collision Box' : prim[0].toUpperCase()+prim.slice(1), collide: colliderOnly || prim !== 'plane',
      colliderOnly,
      cinemaTrigger: colliderOnly ? {enabled:false, eventName:'', mode:'once'} : undefined,
      physics: prim === 'cone',
      physicsMass: prim === 'cone' ? .005 : undefined,
      physicsImpact: prim === 'cone' ? .18 : undefined,
      driveSurface: prim === 'ramp' || prim === 'plane',
      asset:{key: colliderOnly ? 'collision:box' : 'primitive:' + prim, name: colliderOnly ? 'Collision Box' : 'Primitive ' + prim[0].toUpperCase() + prim.slice(1), source: colliderOnly ? 'Editor collision' : 'Editor primitive'},
      t:{p:[at.x, 0, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = 'primitive:' + prim;
    obj.userData.assetName = 'Primitive ' + prim[0].toUpperCase() + prim.slice(1);
    obj.userData.assetSource = 'Editor primitive';
    finishAdd(obj);
  }

  function addLight(kind, at){
    const id = STORE.nextId();
    const obj = STORE.createLight(kind);
    const y = obj.position.y;
    const entry = {id, kind:'light', light: kind, name: kind[0].toUpperCase()+kind.slice(1)+' Light', collide:false,
      asset:{key:'light:' + kind, name:kind[0].toUpperCase() + kind.slice(1) + ' Light', source:'Editor light'},
      t:{p:[at.x, y, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = 'light:' + kind;
    obj.userData.assetName = kind[0].toUpperCase() + kind.slice(1) + ' Light';
    obj.userData.assetSource = 'Editor light';
    finishAdd(obj);
    revealLightHandle(obj);
    requestWarmup('Warm-up light...');
  }

  function addEffect(kind, at){
    const id = STORE.nextId();
    const obj = STORE.createEmitter(kind);
    const entry = {id, kind:'effect', effect: kind, params: Object.assign({}, obj.userData.effectParams), name: 'FX ' + kind, collide:false,
      asset:{key:'effect:' + kind, name:'FX ' + kind, source:'Editor effect'},
      t:{p:[at.x, .3, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = 'effect:' + kind;
    obj.userData.assetName = 'FX ' + kind;
    obj.userData.assetSource = 'Editor effect';
    finishAdd(obj);
  }

  function addText(kind, at){
    const id = STORE.nextId();
    const textKind = kind === '3d' ? '3d' : '2d';
    const textProps = {
      text:textKind === '3d' ? '3D Text' : '2D Text',
      width:4.8,
      height:1.6,
      fontSize:96,
      fontFamily:'Arial',
      weight:'900',
      align:'center',
      valign:'middle',
      lineHeight:1.15,
      padding:.12,
      size:1,
      depth:textKind === '3d' ? .18 : .02,
    };
    const obj = STORE.createText(textKind, textProps);
    const entry = {id, kind:'text', textKind, name:textKind === '3d' ? 'Text 3D' : 'Text 2D', collide:false,
      props:Object.assign({}, obj.userData.textProps),
      asset:{key:'text:' + textKind, name:textKind === '3d' ? 'Text 3D' : 'Text 2D', source:'Editor text'},
      t:{p:[at.x, textKind === '3d' ? 1.2 : 2.2, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = 'text:' + textKind;
    obj.userData.assetName = entry.asset.name;
    obj.userData.assetSource = entry.asset.source;
    finishAdd(obj);
  }

  function addTexture(kind, at, asset){
    const id = STORE.nextId();
    const textureKind = kind === 'image' ? 'image' : 'decal';
    const props = {
      mode:textureKind,
      src: asset && asset.src || null,
      dbKey: asset && asset.dbKey || null,
      asset: asset ? {key:asset.key, dbKey:asset.dbKey || null, name:asset.name, source:asset.source || 'Imported texture'} : null,
      width:2,
      height:2,
      opacity:1,
      color:0xffffff,
      alphaTest:.01,
      blending:'normal',
      depthBias:.012,
      doubleSide:true,
      animated: !!(asset && (/\.gif$/i.test(asset.source || '') || /gif/i.test(asset.mime || ''))),
      materialModel:'unlit',
      roughness:.65,
      metalness:0,
      specular:.35,
      emissive:0x000000,
      emissiveIntensity:0,
    };
    const obj = STORE.createTexture(textureKind, props);
    const entry = {id, kind:'texture', textureKind, name:textureKind === 'image' ? 'Free Texture Image' : 'Free Texture Decal', collide:false,
      props:Object.assign({}, obj.userData.textureProps),
      asset: asset ? {key:asset.key, dbKey:asset.dbKey || null, name:asset.name, source:asset.source || 'Imported texture'} : {key:'texture:free', name:'Free Texture / Decal', source:'Editor texture'},
      t:{p:[at.x, textureKind === 'image' ? 1.2 : .025, at.z], r:[textureKind === 'image' ? 0 : -Math.PI/2,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = entry.asset.key;
    obj.userData.assetName = entry.asset.name;
    obj.userData.assetSource = entry.asset.source;
    finishAdd(obj);
    return obj;
  }

  function addCamera(at){
    const id = STORE.nextId();
    const props = {fov:50, near:.05, far:800, helperSize:1.2, preview:true};
    const obj = STORE.createSceneCamera(props);
    const entry = {id, kind:'camera', name:'Scene Camera', collide:false,
      props:Object.assign({}, obj.userData.cameraProps),
      asset:{key:'camera:scene', name:'Scene Camera', source:'Editor camera'},
      t:{p:[at.x, 2.2, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = entry.asset.key;
    obj.userData.assetName = entry.asset.name;
    obj.userData.assetSource = entry.asset.source;
    finishAdd(obj);
    return obj;
  }

  function addCinemaStudio(at){
    const id = STORE.nextId();
    const props = {version:2, duration:6, fps:24, playback:'one-shot', trigger:'manual', eventName:'', previewCamera:'', cameraCuts:[], movieTrack:[], cameras:[], keyframes:[], objectTracks:[], lensTracks:[], eventTracks:[], markers:[]};
    const obj = STORE.createCinemaStudio(props);
    const entry = {id, kind:'cinemaStudio', name:'Cinema Studio', collide:false,
      props:Object.assign({}, obj.userData.cinemaProps),
      asset:{key:'cinema:studio:' + id, name:'Cinema Studio', source:'Editor cinema'},
      t:{p:[at.x, .05, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = entry.asset.key;
    obj.userData.assetName = entry.asset.name;
    obj.userData.assetSource = entry.asset.source;
    finishAdd(obj);
    return obj;
  }

  function addLogicElement(at, reusableAsset){
    const id = STORE.nextId();
    const template = reusableAsset && reusableAsset.template === true && reusableAsset.graph ? reusableAsset : null;
    const asset = !template && reusableAsset && reusableAsset.graph ? reusableAsset : null;
    const graph = asset ? window.LK_LOGIC_GRAPH.clone(asset.graph) : template ? window.LK_LOGIC_GRAPH.clone(template.graph) : window.LK_LOGIC_GRAPH
      ? window.LK_LOGIC_GRAPH.createStarterGraph('Logic Element ' + id, 'element')
      : {version:1, name:'Logic Element ' + id, scope:'element', enabled:true, variables:[], nodes:[], edges:[]};
    const name = asset && asset.name || template && template.name || 'Logic Element';
    const variableOverrides = {};
    (graph.variables || []).forEach(variable => {
      if(variable.binding === 'spawn.x') variableOverrides[variable.name] = Number(at.x) || 0;
      else if(variable.binding === 'spawn.y') variableOverrides[variable.name] = Number(at.y) || .15;
      else if(variable.binding === 'spawn.z') variableOverrides[variable.name] = Number(at.z) || 0;
      else if(variable.binding === 'spawn.heading') variableOverrides[variable.name] = 0;
    });
    const obj = STORE.createLogicElement({
      graph,
      name,
      logicAssetId:asset && asset.id,
      logicLinked:!!asset,
      logicAsset:asset,
      variableOverrides,
    });
    const entry = {id, kind:'logicElement', name, collide:false,
      graph,
      enabled:true,
      runInEditorPreview:true,
      asset:{key:asset ? ('logic:asset:' + asset.id) : template ? ('logic:template:' + template.id) : ('logic:element:' + id), name, source:asset ? 'Reusable Logic Element' : template ? 'Logic Element template' : 'Editor logic'},
      t:{p:[at.x, .15, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    if(asset){
      entry.logicAssetId = asset.id;
      entry.logicLinked = true;
      entry.variableOverrides = Object.assign({}, variableOverrides);
      entry.logicAsset = window.LK_LOGIC_GRAPH.clone(asset);
    }
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.logicVariableOverrides = Object.assign({}, variableOverrides);
    obj.userData.assetKey = entry.asset.key;
    obj.userData.assetName = entry.asset.name;
    obj.userData.assetSource = entry.asset.source;
    finishAdd(obj);
    return obj;
  }

  function addSoccerStadium(at){
    const builder = window.LK_RUNTIME_SOCCER_STADIUM;
    if(!builder){
      status(tr('Soccer stadium builder unavailable', 'Generatore stadio calcio non disponibile'));
      return null;
    }
    const origin = at || spawnPointAhead();
    const descriptors = builder.buildEntries({x:origin.x, z:origin.z});
    const created = [];
    descriptors.forEach(item => {
      const id = STORE.nextId();
      let obj;
      if(item.kind === 'light'){
        obj = STORE.createLight(item.light);
        const entry = {id, kind:'light', light:item.light, name:item.name, collide:false,
          asset:{key:'light:' + item.light, name:item.name, source:'Soccer Stadium generator'},
          t:item.t};
        STORE.registerAdded(GAME, obj, entry);
        let lightRef = obj.userData.light || null;
        if(!lightRef && obj.traverse) obj.traverse(n => { if(!lightRef && n.isLight) lightRef = n; });
        if(lightRef && item.lightProps && STORE.applyLightProps) STORE.applyLightProps(lightRef, item.lightProps);
        revealLightHandle(obj);
      } else {
        obj = STORE.createPrimitive(item.prim);
        const entry = {id, kind:'primitive', prim:item.prim, name:item.name,
          collide:item.collide === true, driveSurface:item.driveSurface === true,
          asset:{key:'primitive:' + item.prim, name:item.name, source:'Soccer Stadium generator'},
          t:item.t};
        STORE.registerAdded(GAME, obj, entry);
        if(STORE.applyMatProps){
          const props = {color:item.color, roughness:item.roughness, metalness:item.metalness};
          if(item.emissive){ props.emissive = item.emissive; props.emissiveIntensity = 1.2; }
          STORE.applyMatProps(obj, props);
        }
      }
      obj.userData.assetKey = 'stadium:' + (item.prim || item.light);
      obj.userData.assetName = item.name;
      obj.userData.assetSource = 'Soccer Stadium generator';
      created.push(obj);
    });
    pushHistory({
      label:'Add Soccer Stadium',
      undo:() => created.forEach(obj => removeEntity(obj)),
      redo:() => created.forEach(obj => restoreEntity(obj)),
    });
    markDirty(); refreshOutliner(); refreshAssetsPanel();
    if(created.length) selectObject(created[0]);
    requestWarmup(tr('Warm-up stadium lights...', 'Riscaldamento luci stadio...'));
    status(tr('Added: Soccer Stadium (', 'Aggiunto: Stadio Calcio (') + created.length + tr(' objects). Penalty spots at Z ±', ' oggetti). Dischetti a Z ±') + (window.LK_RUNTIME_SOCCER_STADIUM.SPEC.fieldLength / 2 - window.LK_RUNTIME_SOCCER_STADIUM.SPEC.penaltySpot).toFixed(1));
    return created;
  }

  function finishAdd(obj){
    pushHistory({
      label: 'Add ' + (obj.userData.editorName || 'Entity'),
      undo: () => removeEntity(obj),
      redo: () => { restoreEntity(obj); selectObject(obj); },
    });
    markDirty(); refreshOutliner(); refreshAssetsPanel(); selectObject(obj);
    if(ED.tool === 'select') setTool('translate');
    status(tr('Added: ', 'Aggiunto: ') + obj.userData.editorName);
  }

  function openGlbImportAt(point){
    pendingGlbPoint = point || null;
    $('#lkGlbInput').click();
  }

  function beginReplaceObject(target){
    replaceTarget = target || null;
    $('#lkReplaceInput').click();
  }

  function bindInputs(){
    const glbInput = $('#lkGlbInput');
    if(glbInput){
      glbInput.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if(!f) return;
        const at = pendingGlbPoint || spawnPointAhead();
        pendingGlbPoint = null;
        importAssetFiles([f], {placePoint: at}).then(() => {
          if(/\.(glb|gltf)$/i.test(f.name || '') && f.size > 4.5e6) status(tr('⚠ Large GLB (', '⚠ GLB grande (') + (f.size/1e6).toFixed(1) + tr(' MB): permanent save may fail', ' MB): il salvataggio permanente puo fallire'));
        });
      });
    }

    const replaceInput = $('#lkReplaceInput');
    if(replaceInput){
      replaceInput.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if(!f || !replaceTarget) return;
        const target = replaceTarget; replaceTarget = null;
        replaceObjectWithFile(target, f);
      });
    }

    const playerInput = $('#lkPlayerModelInput');
    if(playerInput){
      playerInput.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if(!f) return;
        Promise.resolve(replacePlayerModelWithFile(f)).then(changed => {
          if(!changed) return;
          markDirty();
          buildInspector();
        });
      });
    }
  }

  bindInputs();

  return Object.freeze({addPrimitive, addLight, addEffect, addText, addTexture, addCamera, addCinemaStudio, addLogicElement, addSoccerStadium, finishAdd, openGlbImportAt, beginReplaceObject});
}

window.LK_EDITOR_ADD_ACTIONS = Object.freeze({create});
})();
