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
    const props = {duration:6, fps:24, playback:'one-shot', trigger:'manual', previewCamera:'', movieTrack:[], cameras:[], keyframes:[], objectTracks:[]};
    const obj = STORE.createCinemaStudio(props);
    const entry = {id, kind:'cinemaStudio', name:'Cinema Studio', collide:false,
      props:Object.assign({}, obj.userData.cinemaProps),
      asset:{key:'cinema:studio', name:'Cinema Studio', source:'Editor cinema'},
      t:{p:[at.x, .05, at.z], r:[0,0,0], s:[1,1,1], v:true}};
    STORE.registerAdded(GAME, obj, entry);
    obj.userData.assetKey = entry.asset.key;
    obj.userData.assetName = entry.asset.name;
    obj.userData.assetSource = entry.asset.source;
    finishAdd(obj);
    return obj;
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
        replacePlayerModelWithFile(f);
        markDirty();
        buildInspector();
      });
    }
  }

  bindInputs();

  return Object.freeze({addPrimitive, addLight, addEffect, addText, addTexture, addCamera, addCinemaStudio, finishAdd, openGlbImportAt, beginReplaceObject});
}

window.LK_EDITOR_ADD_ACTIONS = Object.freeze({create});
})();
