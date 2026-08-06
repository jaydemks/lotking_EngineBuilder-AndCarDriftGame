/* =========================================================
   LOT KING — EDITOR OBJECT INSPECTOR
   Inspector sections for regular scene objects.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const THREE = deps.THREE;
  const GAME = deps.GAME;
  const STORE = deps.STORE;
  const ED = deps.ED;
  const scene = deps.scene;
  const tf = deps.tf;
  const el = deps.el;
  const section = deps.section;
  const btnRow = deps.btnRow;
  const checkRow = deps.checkRow;
  const colorRow = deps.colorRow;
  const selectRow = deps.selectRow;
  const sliderRow = deps.sliderRow;
  const entityIcon = deps.entityIcon;
  const markDirty = deps.markDirty;
  const refreshOutliner = deps.refreshOutliner;
  const selectObject = deps.selectObject;
  const focusSelected = deps.focusSelected;
  const toggleVisible = deps.toggleVisible;
  const activeViewportCamera = deps.activeViewportCamera || function(){ return null; };
  const setCameraViewSlot = deps.setCameraViewSlot || function(){};
  const beginTransformHistory = deps.beginTransformHistory;
  const commitTransformHistory = deps.commitTransformHistory;
  const resetTransform = deps.resetTransform;
  const syncTransformFields = deps.syncTransformFields;
  const onGizmoChange = deps.onGizmoChange;
  const setColliderEnabled = deps.setColliderEnabled;
  const setPhysicsEnabled = deps.setPhysicsEnabled;
  const buildMaterialEditor = deps.buildMaterialEditor;
  const buildMeshEditor = deps.buildMeshEditor || function(){};
  const duplicateEntity = deps.duplicateEntity;
  const requestDeleteEntity = deps.requestDeleteEntity;
  const replaceSelectedGlb = deps.replaceSelectedGlb;
  const requestWarmup = deps.requestWarmup || function(){};
  const requestPhysicsRebuild = deps.requestPhysicsRebuild || function(){ if(GAME.systems && GAME.systems.physics) GAME.systems.physics.rebuild(); };
  const importTextureFile = deps.importTextureFile || function(){ return Promise.resolve(null); };
  const assetLibraryLoad = deps.assetLibraryLoad || function(){ return []; };
  const resolveImportedAssetUrl = deps.resolveImportedAssetUrl || function(asset){ return asset && asset.src ? Promise.resolve(asset.src) : Promise.reject(new Error('asset source missing')); };
  const beginColliderHistory = deps.beginColliderHistory || function(){};
  const commitColliderHistory = deps.commitColliderHistory || function(){};
  const beginInspectorHistory = deps.beginInspectorHistory || function(){};
  const commitInspectorHistory = deps.commitInspectorHistory || function(){};

  function bindInspectorHistory(box, object){
    // buildInspector reuses the same panel element. Without disposing these
    // delegated listeners every rebuild stacked another complete set, so one
    // click could serialize the selected asset tens of times.
    if(box._lkInspectorHistoryAbort) box._lkInspectorHistoryAbort.abort();
    const historyAbort = new AbortController();
    box._lkInspectorHistoryAbort = historyAbort;
    const listenerOptions = capture => ({capture:!!capture, signal:historyAbort.signal});
    const isControl = target => !!(target && target.matches && target.matches('input, select, textarea'));
    const isManaged = target => !!(target && target.closest && target.closest('[data-history-managed]'));
    const isTransform = target => !!(tf.inputs || []).find(item => item && item.input === target);
    const shouldTrack = target => isControl(target) && !isManaged(target) && !isTransform(target);
    let historyControl = null;
    const beginFor = target => {
      if(!shouldTrack(target) || historyControl === target) return;
      historyControl = target;
      beginInspectorHistory(object);
    };
    const commitFor = target => {
      if(!shouldTrack(target)) return;
      commitInspectorHistory('Inspector parameter');
      historyControl = null;
    };
    box.addEventListener('focusin', event => {
      beginFor(event.target);
    }, listenerOptions(true));
    box.addEventListener('pointerdown', event => {
      beginFor(event.target);
    }, listenerOptions(true));
    box.addEventListener('change', event => {
      commitFor(event.target);
    }, listenerOptions(false));
    box.addEventListener('pointerup', event => {
      if(shouldTrack(event.target) && event.target.matches('input[type="range"], input[type="color"]')) commitFor(event.target);
    }, listenerOptions(false));
  }

  function transformContextInfo(o){
    const parent = o && o.parent && o.parent !== scene ? o.parent : null;
    const parentName = parent ? (parent.userData.editorName || parent.name || parent.userData.editorId || 'parent') : 'Scene';
    const inputSpace = parent ? 'LOCAL' : 'GLOBAL';
    const origin = o && o.userData.builtin ? 'Original' : 'Added';
    return {parent, parentName, inputSpace, origin};
  }

  function worldTransformSummary(o){
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    o.updateMatrixWorld(true);
    o.matrixWorld.decompose(wp, wq, ws);
    const wr = new THREE.Euler().setFromQuaternion(wq, 'XYZ');
    const f = v => (+v.toFixed(2)).toString();
    const d = v => (+THREE.MathUtils.radToDeg(v).toFixed(1)).toString();
    if(ED.space !== 'engine'){
      return {
        p: 'X ' + f(wp.x) + ' · Y ' + f(wp.z) + ' · Z ' + f(wp.y),
        r: 'X ' + d(wr.x) + '° · Y ' + d(wr.z) + '° · Z ' + d(wr.y) + '°',
      };
    }
    return {
      p: 'X ' + f(wp.x) + ' · Y ' + f(wp.y) + ' · Z ' + f(wp.z),
      r: 'X ' + d(wr.x) + '° · Y ' + d(wr.y) + '° · Z ' + d(wr.z) + '°',
    };
  }

  function clearPlayerOutputs(playerIndex, except){
    const wanted = Number(playerIndex);
    let clearedCinema = false;
    GAME.world.registry.forEach(item => {
      if(item === except || !item || !item.userData) return;
      if(item.userData.editorType === 'camera'){
        const current = item.userData.cameraProps || {};
        if(Number(current.outputPlayerIndex) !== wanted && !(wanted === 0 && current.activeLevelCamera === true)) return;
        item.userData.cameraProps = Object.assign({}, current, {activeLevelCamera:false, outputPlayerIndex:null});
        if(item.userData.addedEntry) item.userData.addedEntry.props = Object.assign({}, item.userData.addedEntry.props || {}, {activeLevelCamera:false, outputPlayerIndex:null});
      } else if(item.userData.editorType === 'cinemaStudio'){
        const current = item.userData.cinemaProps || {};
        if(Number(current.outputPlayerIndex) !== wanted) return;
        item.userData.cinemaProps = Object.assign({}, current, {outputPlayerIndex:null});
        if(item.userData.addedEntry) item.userData.addedEntry.props = Object.assign({}, item.userData.addedEntry.props || {}, {outputPlayerIndex:null});
        clearedCinema = true;
      }
    });
    if(clearedCinema) window.dispatchEvent(new CustomEvent('lotking:cinemastop', {detail:{playerId:wanted + 1, reason:'player-output-reassigned'}}));
    return clearedCinema;
  }

  function transformAxes(){
    if(ED.space !== 'engine') return [
      {label:'X', prop:'x'},
      {label:'Y', prop:'z'},
      {label:'Z', prop:'y'},
    ];
    return [
      {label:'X', prop:'x'},
      {label:'Y', prop:'y'},
      {label:'Z', prop:'z'},
    ];
  }

  function transformSpaceText(){
    if(ED.space === 'world') return 'World Z-up';
    if(ED.space === 'local') return 'Local Z-up';
    return 'Engine Y-up';
  }

  function isConeObject(obj){
    if(!obj || !obj.userData) return false;
    if(obj.userData.isCone) return true;
    const name = (obj.userData.editorName || obj.name || '').toLowerCase();
    return name.includes('cone');
  }

  function resetConeToOriginalRotation(obj){
    const reset = obj.userData && Array.isArray(obj.userData.coneResetRotation) ? obj.userData.coneResetRotation : null;
    const x = reset && Number.isFinite(reset[0]) ? reset[0] : 0;
    const y = reset && Number.isFinite(reset[1]) ? reset[1] : obj.rotation.y;
    const z = reset && Number.isFinite(reset[2]) ? reset[2] : 0;
    beginTransformHistory();
    obj.rotation.set(x, y, z);
    STORE.syncCollider(obj);
    syncTransformFields();
    commitTransformHistory('Reset cone upright');
    markDirty();
  }

  function build(box, o){
    const lang = GAME && GAME.i18n && GAME.i18n.lang === 'it' ? 'it' : 'en';
    const tr = (en, it) => lang === 'it' ? (it || en) : en;
    bindInspectorHistory(box, o);
    const pawnCameraDummy=o.userData&&o.userData.pawnCameraDummy===true;
    const syncPawnCamera=()=>{if(pawnCameraDummy&&window.LK_LOGIC_GRAPH&&window.LK_LOGIC_GRAPH.syncPawnCameraNode)window.LK_LOGIC_GRAPH.syncPawnCameraNode(o);};
    const head = el('<div class="lk-head"><span class="lk-head-ic">' + entityIcon(o) + '</span><input class="lk-head-name"><span class="lk-head-id">' + o.userData.editorId + (o.userData.builtin ? ' · ' + tr('original', 'originale') : ' · ' + tr('added', 'aggiunto')) + '</span></div>');
    const nameI = head.querySelector('input');
    nameI.value = o.userData.editorName || '';
    nameI.addEventListener('change', () => { o.userData.editorName = nameI.value; markDirty(); refreshOutliner(); });
    box.appendChild(head);
    if(o.userData.editorType === 'playerLight' || o.userData.editorType === 'playerEffect' ||
      o.userData.editorType === 'playerSkid' || o.userData.editorType === 'playerDataWidget' ||
      o.userData.editorType === 'playerCamera' || pawnCameraDummy){
      let cameraOwner=o;while(cameraOwner&&!(cameraOwner.userData&&cameraOwner.userData.editorType==='logicElement'))cameraOwner=cameraOwner.parent;
      box.appendChild(btnRow([
        {label:pawnCameraDummy?tr('← Pawn Logic Element','← Logic Element Pawn'):'← player_car Logic', action:() => selectObject(pawnCameraDummy&&cameraOwner||GAME.player.car)},
        {label:tr('Focus component', 'Focus componente'), action: focusSelected},
      ]));
      box.appendChild(el('<div class="lk-hint">'+(pawnCameraDummy?tr('This is a persistent gameplay camera mount. Its local gizmo transform is saved into the Pawn and used unchanged by Play.','Questo è un mount camera gameplay persistente. La trasformazione locale del gizmo viene salvata nel Pawn e usata invariata in Play.'):'This component belongs to the player vehicle. Go back to player_car Logic to edit global settings, presets and sources.')+'</div>'));
    }
    if(o.userData.linkParentId){
      const parent = GAME.world.registry.find(p => p.userData.editorId === o.userData.linkParentId);
      box.appendChild(el('<div class="lk-hint">Linked parent: ' + (parent ? (parent.userData.editorName || parent.userData.editorId) : o.userData.linkParentId) + '</div>'));
    }

    const st = section(tr('TRANSFORM', 'TRASFORMAZIONE'));
    const ctx = transformContextInfo(o);
    const wt = worldTransformSummary(o);
    st.body.appendChild(el(
      '<div class="lk-transform-context">' +
        '<span>' + ctx.origin + '</span>' +
        '<span>' + tr('Fields', 'Campi') + ' ' + ctx.inputSpace + '</span>' +
        '<span>Gizmo ' + transformSpaceText() + '</span>' +
      '</div>'
    ));
    st.body.appendChild(el('<div class="lk-hint">Parent: ' + ctx.parentName + (ED.space !== 'engine' ? '<br>Display convention: Z is vertical; engine still stores Y-up internally.' : '') + '</div>'));
    if(ctx.parent){
      st.body.appendChild(el('<div class="lk-hint">World pos: ' + wt.p + '<br>World rot: ' + wt.r + '</div>'));
    }
    const mk = (label, kind, get, set, isDeg) => {
      const row = el('<div class="lk-vec"><label>' + label + '</label></div>');
      const ins = [];
      transformAxes().forEach(axis => {
        const ax = axis.prop;
        const i = el('<input type="number" step="' + (isDeg ? 1 : .1) + '" title="' + axis.label + '">');
        i.value = +get(ax).toFixed(3);
        i.addEventListener('focus', beginTransformHistory);
        i.addEventListener('input', () => { set(ax, parseFloat(i.value) || 0); STORE.syncCollider(o); markDirty(); if(o.userData.editorType==='player' || o.userData.editorType==='playerDataWidget' || o.userData.editorType==='playerSkid' || o.userData.editorType==='playerCamera' || pawnCameraDummy){syncPawnCamera();onGizmoChange();} });
        i.addEventListener('change', () => commitTransformHistory(label));
        row.appendChild(i); ins.push({input:i, prop:ax, kind});
      });
      st.body.appendChild(row);
      return ins;
    };
    const pI = mk(tr('Position', 'Posizione'), 'p', ax => o.position[ax], (ax,v) => o.position[ax] = v);
    const rI = mk(tr('Rotation°', 'Rotazione°'), 'r', ax => THREE.MathUtils.radToDeg(o.rotation[ax]), (ax,v) => o.rotation[ax] = THREE.MathUtils.degToRad(v), true);
    let uniform = false;
    const sI = mk('Scale', 's', ax => o.scale[ax], (ax,v) => {
      if(uniform) o.scale.set(v,v,v); else o.scale[ax] = v;
      if(uniform) syncTransformFields();
    });
    tf.inputs = [...pI, ...rI, ...sI];
    st.body.appendChild(checkRow('Uniform scale', false, v => uniform = v).root);
    st.body.appendChild(btnRow([{label:'↺ Reset', action:() => { resetTransform(o);syncPawnCamera();syncTransformFields(); }}]));
    box.appendChild(st.root);

    if(pawnCameraDummy){
      let owner=o;while(owner&&!(owner.userData&&owner.userData.logicGraph))owner=owner.parent;
      const graph=owner&&owner.userData&&owner.userData.logicGraph,role=String(o.userData.pawnCameraRole||''),pawn=graph&&(graph.characterPawn||graph.soccerPawn||graph.vehiclePawn||graph.sketchbookPawn),character=/^character-/.test(role),camera=pawn&&(character?pawn.firstPerson:pawn.camera);
      if(camera){
        const target=role==='character-third'?(camera.thirdPerson||(camera.thirdPerson={})):camera;
        const keys=role==='vehicle-interior'?{fov:'interiorFov',near:'interiorNear',focus:'interiorFocusDistance'}:{fov:'fov',near:'near',focus:'focusDistance'};
        const defaults=role==='character-first'?{fov:78,near:.14,focus:9}:role==='character-third'?{fov:68,near:.1,focus:9}:role==='vehicle-interior'?{fov:72,near:.1,focus:9}:{fov:70,near:.1,focus:12};
        const opticBinding=key=>{
          if(role==='character-first')return 'firstPerson.'+key;
          if(role==='character-third')return 'firstPerson.thirdPerson.'+key;
          if(role==='vehicle-interior')return 'camera.'+key;
          return 'camera.'+key;
        };
        const saveOptic=(key,value)=>{
          target[key]=value;
          // Exposed graph variables are applied when Play starts. Keep their
          // value in lockstep with the spatial dummy, otherwise a perfectly
          // saved camera would jump back to the old Inspector value on Start.
          const binding=opticBinding(key);
          const variable=(graph.variables||[]).find(item=>item&&item.binding===binding);
          if(variable)variable.value=value;
          if(owner.userData.addedEntry)owner.userData.addedEntry.graph=window.LK_LOGIC_GRAPH.clone(graph);
          markDirty();
        };
        const optics=section(tr('GAMEPLAY CAMERA OPTICS','OTTICA CAMERA GAMEPLAY'));
        optics.body.appendChild(sliderRow('FOV',Number(target[keys.fov])||defaults.fov,20,130,1,value=>saveOptic(keys.fov,value),value=>Math.round(value)+'°').root);
        optics.body.appendChild(sliderRow(tr('Near clipping plane','Piano clipping vicino'),Number(target[keys.near])||defaults.near,.02,.5,.01,value=>saveOptic(keys.near,value),value=>(+value).toFixed(2)+' m').root);
        optics.body.appendChild(sliderRow(tr('Focus distance','Distanza messa a fuoco'),Number(target[keys.focus])||defaults.focus,.25,200,.25,value=>saveOptic(keys.focus,value),value=>(+value).toFixed(2)+' m').root);
        optics.body.appendChild(el('<div class="lk-hint">'+tr('Position, rotation and lens values belong to this Pawn camera only and persist with the Logic Element.','Posizione, rotazione e valori ottici appartengono solo a questa camera Pawn e persistono nel Logic Element.')+'</div>'));
        box.appendChild(optics.root);
      }
    }

    const sd = section(tr('VISIBILITY', 'VISIBILITA'));
    sd.body.appendChild(checkRow(tr('Visible', 'Visibile'), o.visible, v => { if(toggleVisible&&o.visible!==v)toggleVisible(o);else {o.visible=v;markDirty();refreshOutliner();} }).root);
    if(o.userData.editorType === 'mesh'){
      let anyCast = false;
      o.traverse(n => { if(n.isMesh && n.castShadow) anyCast = true; });
      sd.body.appendChild(checkRow(tr('Cast shadows', 'Proietta ombre'), anyCast, v => {
        requestWarmup(v ? 'Warm-up shadows...' : 'Warm-up render...');
        o.userData.matProps = Object.assign({}, o.userData.matProps, {castShadow: v});
        markDirty();
        requestAnimationFrame(() => {
          o.traverse(n => { if(n.isMesh) n.castShadow = v; });
        });
      }).root);
    }
    box.appendChild(sd.root);

    const proceduralEntry=o.userData&&o.userData.addedEntry;
    const proceduralApi=window.LK_ENGINE_PROCEDURAL_ASSETS;
    if(proceduralEntry&&proceduralEntry.kind==='proceduralAsset'&&proceduralApi&&STORE.rebuildProceduralAsset){
      let recipe=proceduralApi.normalize(proceduralEntry.procedural);
      const ps=section(tr('PROCEDURAL ASSET','ASSET PROCEDURALE'),true);
      const rebuild=change=>{
        change(recipe);recipe=proceduralApi.normalize(recipe);
        proceduralEntry.procedural=JSON.parse(JSON.stringify(recipe));
        proceduralEntry.props=Object.assign({},proceduralEntry.props||{},proceduralApi.materialProps(recipe));
        STORE.rebuildProceduralAsset(o,recipe);markDirty();requestWarmup('Rebuild procedural asset...');
      };
      ps.body.appendChild(el('<div class="lk-hint">Serializable Engine Asset recipe. The same factory rebuilds this object in Editor, Play and exported gameplay.</div>'));
      const dimensionLabels={width:tr('Width','Larghezza'),height:tr('Height','Altezza'),depth:tr('Depth','Profondità'),radius:tr('Radius','Raggio'),openingWidth:tr('Opening width','Larghezza apertura'),openingHeight:tr('Opening height','Altezza apertura'),steps:tr('Steps','Gradini')};
      Object.keys(recipe.dimensions).forEach(key=>{
        const integer=key==='steps',maximum=integer?128:200;
        ps.body.appendChild(sliderRow(dimensionLabels[key]||key,recipe.dimensions[key],integer?1:.01,maximum,integer?1:.05,v=>rebuild(next=>{next.dimensions[key]=integer?Math.round(v):v;}),v=>integer?String(Math.round(v)):(+v).toFixed(2)+'m').root);
      });
      const segmentKeys=recipe.type==='sphere'?['radial','height']:recipe.type==='cylinder'||recipe.type==='pipe'?['radial','height']:recipe.type==='box'?['width','height','depth']:recipe.type==='plane'?['width','depth']:[];
      segmentKeys.forEach(key=>ps.body.appendChild(sliderRow((key[0].toUpperCase()+key.slice(1))+' segments',recipe.segments[key],1,128,1,v=>rebuild(next=>{next.segments[key]=Math.round(v);}),v=>String(Math.round(v))).root));
      ps.body.appendChild(colorRow(tr('Material color','Colore materiale'),recipe.material.color,v=>rebuild(next=>{next.material.color=v;})).root);
      ps.body.appendChild(sliderRow(tr('Roughness','Ruvidità'),recipe.material.roughness,0,1,.01,v=>rebuild(next=>{next.material.roughness=v;}),v=>Math.round(v*100)+'%').root);
      ps.body.appendChild(sliderRow(tr('Metallic','Metallico'),recipe.material.metalness,0,1,.01,v=>rebuild(next=>{next.material.metalness=v;}),v=>Math.round(v*100)+'%').root);
      ps.body.appendChild(selectRow(tr('Material model','Modello materiale'),recipe.material.model,[{value:'standard',label:'PBR Standard'},{value:'toon',label:'Toon'},{value:'unlit',label:'Unlit'}],v=>rebuild(next=>{next.material.model=v;})).root);
      const surfaceApi=window.LK_ENGINE_PROCEDURAL_SURFACES,surfaceValue=typeof recipe.material.surfaceTexture==='string'?recipe.material.surfaceTexture:'';
      const surfaceOptions=[{value:'',label:tr('None / flat','Nessuna / piatta')}].concat(surfaceApi&&surfaceApi.list?surfaceApi.list().map(item=>({value:item.id,label:lang==='it'?item.labelIt:item.label})):[]);
      ps.body.appendChild(selectRow(tr('Procedural surface','Superficie procedurale'),surfaceValue,surfaceOptions,v=>rebuild(next=>{next.material.surfaceTexture=v||null;})).root);
      ['scale','offset'].forEach(field=>[0,1].forEach(axis=>ps.body.appendChild(sliderRow('UV '+field+' '+(axis?'V':'U'),recipe.uv[field][axis],field==='scale'?.01:-10,field==='scale'?20:10,.01,v=>rebuild(next=>{next.uv[field][axis]=v;}),v=>(+v).toFixed(2)).root)));
      ps.body.appendChild(sliderRow(tr('UV rotation','Rotazione UV'),THREE.MathUtils.radToDeg(recipe.uv.rotation),-360,360,1,v=>rebuild(next=>{next.uv.rotation=THREE.MathUtils.degToRad(v);}),v=>(+v).toFixed(0)+'°').root);
      box.appendChild(ps.root);
    }

    if(o.userData.driftTrack && STORE.rebuildDriftTrack){
      const gen = window.LK_RUNTIME_DRIFT_TRACK;
      const base = gen ? gen.defaultParams() : {halfW:5.5, wallGap:3.2, treeCount:70, treeSeed:1, points:[], props:{}};
      const stored = o.userData.driftTrackParams || {};
      const params = Object.assign({}, base, stored);
      params.props = Object.assign({}, base.props, stored.props || {});
      params.points = Array.isArray(stored.points) && stored.points.length >= 4
        ? stored.points.map(p => [Number(p[0]) || 0, Number(p[1]) || 0])
        : (base.points || []);

      const dt = section(tr('DRIFT TRACK', 'TRACCIATO DRIFT'));
      const info = o.userData.driftTrackInfo;
      const note = el('<div class="lk-hint"></div>');
      const showInfo = () => {
        const inf = o.userData.driftTrackInfo;
        note.innerHTML = tr('Length', 'Lunghezza') + ': ' + (inf ? inf.length : (info ? info.length : '?')) + ' m · ' +
          (Array.isArray(params.points) ? params.points.length : 0) + ' ' + tr('points', 'punti');
      };
      showInfo();
      dt.body.appendChild(note);

      const apply = () => {
        STORE.rebuildDriftTrack(GAME, o, params);
        if(o.userData.addedEntry){
          try { o.userData.addedEntry.props = JSON.parse(JSON.stringify(o.userData.driftTrackParams)); } catch(err){}
        }
        markDirty();
        requestPhysicsRebuild();
        requestWarmup('Warm-up track lights...');
        refreshOutliner();
        selectObject(o);
      };

      const seedRow = el('<div class="lk-row"><label>Seed</label><input type="number" step="1" style="width:120px"></div>');
      const seedInput = seedRow.querySelector('input');
      seedInput.value = params.treeSeed || 1;
      seedInput.addEventListener('change', () => { params.treeSeed = (parseInt(seedInput.value, 10) >>> 0) || 1; apply(); });
      dt.body.appendChild(seedRow);

      dt.body.appendChild(sliderRow(tr('Road half-width', 'Semi-largh. strada'), params.halfW, 2, 12, .1, v => { params.halfW = v; }));
      dt.body.appendChild(sliderRow(tr('Wall gap', 'Distanza muri'), params.wallGap, 0, 10, .1, v => { params.wallGap = v; }));
      dt.body.appendChild(sliderRow(tr('Tree count', 'Numero alberi'), params.treeCount, 0, 200, 1, v => { params.treeCount = Math.round(v); }));

      [
        ['curbs', 'Curbs', 'Cordoli'], ['tireWalls', 'Tire walls', 'Muri gomme'],
        ['portal', 'Portal', 'Portale'], ['grandstand', 'Grandstand', 'Tribuna'],
        ['trees', 'Trees', 'Alberi'], ['lightPoles', 'Light poles', 'Pali luce'],
        ['cones', 'Cones', 'Coni'], ['startLine', 'Start line', 'Linea partenza'], ['grass', 'Grass', 'Erba'],
      ].forEach(def => {
        dt.body.appendChild(checkRow(tr(def[1], def[2]), params.props[def[0]] !== false, v => { params.props[def[0]] = v; }).root);
      });
      dt.body.appendChild(checkRow(tr('Wall collisions', 'Collisioni muri'), params.props.tireWallColliders !== false, v => { params.props.tireWallColliders = v; }).root);
      dt.body.appendChild(checkRow(tr('Cone collisions', 'Collisioni coni'), params.props.coneColliders !== false, v => { params.props.coneColliders = v; }).root);

      dt.body.appendChild(btnRow([
        {label:tr('Apply / Regenerate', 'Applica / Rigenera'), action: apply},
        {label:tr('Random layout', 'Layout casuale'), action:() => {
          if(!gen){ apply(); return; }
          const seed = (Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff);
          params.points = gen.generatePoints(seed);
          params.treeSeed = seed >>> 0;
          apply();
        }},
      ]));

      const ptsWrap = el('<div class="lk-row" style="flex-direction:column;align-items:stretch"><label>' + tr('Track points [x,z] (JSON)', 'Punti tracciato [x,z] (JSON)') + '</label><textarea rows="5" style="width:100%;box-sizing:border-box;font-family:monospace;font-size:11px"></textarea></div>');
      const ptsArea = ptsWrap.querySelector('textarea');
      ptsArea.value = JSON.stringify(params.points);
      ptsArea.addEventListener('change', () => {
        try {
          const parsed = JSON.parse(ptsArea.value);
          if(Array.isArray(parsed) && parsed.length >= 4){
            params.points = parsed.map(p => [Number(p[0]) || 0, Number(p[1]) || 0]);
            note.textContent = '';
            apply();
          } else {
            note.textContent = tr('Need at least 4 points', 'Servono almeno 4 punti');
          }
        } catch(err){
          note.textContent = tr('Invalid points JSON', 'JSON punti non valido');
        }
      });
      dt.body.appendChild(ptsWrap);

      box.appendChild(dt.root);
    }

    const sceneCameraOptions = () => {
      const opts = [{value:'', label:'None'}];
      GAME.world.registry.forEach(item => {
        if(item && item.userData && item.userData.editorType === 'camera'){
          opts.push({value:item.userData.editorId, label:item.userData.editorName || item.userData.editorId});
        }
      });
      return opts;
    };
    const cinemaPawnOptions = () => {
      const opts=[{value:'',label:tr('Current/automatic possessed Pawn','Pawn posseduto corrente/automatico')}],seen=new Set();
      const add=(id,label)=>{
        const value=String(id||'').trim();
        if(!value||seen.has(value))return;
        seen.add(value);opts.push({value,label:label||value});
      };
      if(GAME.pawns&&GAME.pawns.list){
        GAME.pawns.list().forEach(pawn=>add(pawn&&pawn.id,(pawn&&pawn.owner&&(pawn.owner.userData.editorName||pawn.owner.name))||pawn&&pawn.id));
      }
      GAME.world.registry.forEach(item=>{
        const graph=item&&item.userData&&item.userData.logicGraph;
        const pawn=graph&&(graph.characterPawn||graph.animalPawn||graph.soccerPawn||graph.sketchbookPawn||graph.vehiclePawn||graph.playerPawnBlueprint);
        if(pawn)add(pawn.id||item.userData.vehiclePawnId||item.userData.logicInstanceId,(item.userData.editorName||item.name||'Pawn')+' · '+(pawn.id||'auto'));
      });
      return opts;
    };

    if(o.userData.editorType === 'camera'){
      const camSec = section('SCENE CAMERA');
      const props = Object.assign({fov:50, near:.05, far:800, helperSize:1.2, preview:true, aspect:'auto'}, o.userData.cameraProps || {});
      o.userData.cameraProps = props;
      const updateCamera = patch => {
        Object.assign(props, patch || {});
        o.userData.cameraProps = props;
        if(o.userData.addedEntry) o.userData.addedEntry.props = Object.assign({}, props);
        if(STORE.updateSceneCameraObject) STORE.updateSceneCameraObject(o, props);
        markDirty();
      };
      const alignCameraToView = () => {
        const cam = activeViewportCamera();
        if(!cam) return;
        beginTransformHistory(o);
        cam.updateMatrixWorld(true);
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        cam.matrixWorld.decompose(pos, quat, scale);
        const parent = o.parent && o.parent !== scene ? o.parent : null;
        if(parent){
          parent.updateMatrixWorld(true);
          parent.worldToLocal(pos);
          const parentQuat = new THREE.Quaternion();
          parent.getWorldQuaternion(parentQuat);
          quat.premultiply(parentQuat.invert());
        }
        o.position.copy(pos);
        o.quaternion.copy(quat);
        o.updateMatrixWorld(true);
        if(o.userData.addedEntry) o.userData.addedEntry.t = STORE.tOf(o);
        commitTransformHistory('Align camera to view');
        syncTransformFields();
        markDirty();
      };
      camSec.body.appendChild(sliderRow('FOV', props.fov || 50, 10, 140, 1, v => updateCamera({fov:Math.round(v)}), v => Math.round(v) + '°').root);
      camSec.body.appendChild(sliderRow('Near clip', props.near || .05, .01, 5, .01, v => updateCamera({near:Math.max(.01, v)}), v => (+v).toFixed(2) + 'm').root);
      camSec.body.appendChild(sliderRow('Far clip', props.far || 800, 10, 3000, 10, v => updateCamera({far:Math.max(10, v)}), v => Math.round(v) + 'm').root);
      camSec.body.appendChild(sliderRow('Helper size', props.helperSize || 1.2, .25, 8, .05, v => updateCamera({helperSize:v}), v => (+v).toFixed(2) + 'm').root);
      camSec.body.appendChild(checkRow('Show helper', props.preview !== false, v => updateCamera({preview:v})).root);
      // Its OWN shape. A scene camera had no aspect field at all, so every preview
      // fell back to the player camera's ratio and looked identical whichever camera
      // you picked. `Auto` defers to the level default, then to the viewport; the
      // editor-wide master in View settings overrides all of them while framing.
      const aspectPolicy = window.LK_ASPECT_POLICY;
      if(aspectPolicy){
        camSec.body.appendChild(selectRow(tr('Aspect ratio', 'Rapporto d\'aspetto'), props.aspect || 'auto',
          aspectPolicy.OPTIONS.map(option => ({value:option.value,
            label:option.value === 'auto' ? tr('Auto (level default)', 'Auto (default del livello)') : option.label})),
          v => updateCamera({aspect:v})).root);
      }
      const cameraOutput = props.activeLevelCamera === true ? 0 : props.outputPlayerIndex;
      camSec.body.appendChild(selectRow(tr('Player output', 'Uscita giocatore'), cameraOutput == null ? 'none' : String(cameraOutput), [
        {value:'none', label:tr('None', 'Nessuna')},
        {value:'0', label:'Player 1'},
        {value:'1', label:'Player 2'},
        {value:'2', label:'Player 3'},
        {value:'3', label:'Player 4'},
      ], v => {
        const output = v === 'none' ? null : Number(v);
        if(output != null) clearPlayerOutputs(output, o);
        updateCamera({activeLevelCamera:output === 0, outputPlayerIndex:output});
      }).root);
      camSec.body.appendChild(btnRow([
        {label:'Align to view', action:alignCameraToView},
        {label:'Look through', action:() => setCameraViewSlot(o.userData.editorId)},
      ]));
      box.appendChild(camSec.root);
    }

    if(o.userData.editorType === 'cinemaStudio'){
      const cinemaSec = section('CINEMA STUDIO', true);
      const props = Object.assign({version:4, duration:6, fps:24, playback:'one-shot', trigger:'manual', eventName:'', outputPlayerIndex:null, previewCamera:'', cameraCuts:[], movieTrack:[], cameras:[], keyframes:[], objectTracks:[], lensTracks:[], eventTracks:[], markers:[], completion:{mode:'cut',duration:1,curve:'ease-in-out',playerId:null,pawnId:''}}, o.userData.cinemaProps || {});
      props.version = Math.max(4, Number(props.version) || 1);
      props.completion=Object.assign({mode:'cut',duration:1,curve:'ease-in-out',playerId:null,pawnId:''},props.completion||{});
      if(!Array.isArray(props.cameraCuts)) props.cameraCuts = Array.isArray(props.movieTrack) ? props.movieTrack : [];
      props.movieTrack = props.cameraCuts;
      if(!Array.isArray(props.cameras)) props.cameras = [];
      if(!Array.isArray(props.keyframes)) props.keyframes = [];
      if(!Array.isArray(props.objectTracks)) props.objectTracks = [];
      if(!Array.isArray(props.lensTracks)) props.lensTracks = [];
      if(!Array.isArray(props.eventTracks)) props.eventTracks = [];
      if(!Array.isArray(props.markers)) props.markers = [];
      o.userData.cinemaProps = props;
      const saveCinema = patch => {
        if(patch && patch.movieTrack && !patch.cameraCuts) patch.cameraCuts = patch.movieTrack;
        if(patch && patch.cameraCuts) patch.movieTrack = patch.cameraCuts;
        Object.assign(props, patch || {});
        props.movieTrack = props.cameraCuts;
        o.userData.cinemaProps = props;
        if(o.userData.addedEntry) o.userData.addedEntry.props = Object.assign({}, props);
        markDirty();
        refreshOutliner();
      };
      cinemaSec.body.appendChild(sliderRow('Duration', props.duration || 6, .1, 86400, .1, v => saveCinema({duration:v}), v => (+v).toFixed(1) + 's').root);
      cinemaSec.body.appendChild(sliderRow('FPS', props.fps || 24, 12, 120, 1, v => saveCinema({fps:Math.round(v)}), v => Math.round(v)).root);
      cinemaSec.body.appendChild(selectRow('Playback', props.playback || 'one-shot', [
        {value:'one-shot', label:'One-shot'},
        {value:'loop', label:'Loop'},
      ], v => saveCinema({playback:v})).root);
      cinemaSec.body.appendChild(selectRow('Trigger', props.trigger || 'manual', [
        {value:'manual', label:'Manual'},
        {value:'on-play', label:'On Preview/Simulate'},
        {value:'runtime-event', label:'Runtime event'},
      ], v => saveCinema({trigger:v})).root);
      cinemaSec.body.appendChild(selectRow(tr('Player output', 'Uscita giocatore'), props.outputPlayerIndex == null ? 'none' : String(props.outputPlayerIndex), [
        {value:'none', label:tr('None', 'Nessuna')},
        {value:'0', label:'Player 1'},
        {value:'1', label:'Player 2'},
        {value:'2', label:'Player 3'},
        {value:'3', label:'Player 4'},
      ], v => {
        const output = v === 'none' ? null : Number(v);
        const previousOutput = props.outputPlayerIndex == null ? null : Number(props.outputPlayerIndex);
        if(output != null) clearPlayerOutputs(output, o);
        saveCinema({outputPlayerIndex:output});
        if(previousOutput != null && previousOutput !== output){
          window.dispatchEvent(new CustomEvent('lotking:cinemastop', {detail:{playerId:previousOutput + 1, reason:'cinema-output-changed'}}));
        }
      }).root);
      const saveCompletion=patch=>saveCinema({completion:Object.assign({},props.completion,patch||{})});
      cinemaSec.body.appendChild(selectRow(tr('End transition','Transizione finale'),props.completion.mode||'cut',[
        {value:'cut',label:tr('Cut (instant)','Cut (istantaneo)')},
        {value:'blend',label:tr('Smooth camera blend','Blend camera fluido')},
      ],v=>saveCompletion({mode:v})).root);
      cinemaSec.body.appendChild(sliderRow(tr('Blend duration','Durata blend'),Number.isFinite(Number(props.completion.duration))?Number(props.completion.duration):1,0,10,.05,v=>saveCompletion({duration:v}),v=>(+v).toFixed(2)+'s').root);
      cinemaSec.body.appendChild(selectRow(tr('Blend curve','Curva blend'),props.completion.curve||'ease-in-out',[
        {value:'ease-in-out',label:'Ease in/out'},
        {value:'ease-in',label:'Ease in'},
        {value:'ease-out',label:'Ease out'},
        {value:'linear',label:'Linear'},
      ],v=>saveCompletion({curve:v})).root);
      cinemaSec.body.appendChild(selectRow(tr('Return controller','Controller finale'),props.completion.playerId==null?'auto':String(props.completion.playerId),[
        {value:'auto',label:tr('Cinema output / automatic','Uscita Cinema / automatico')},
        {value:'1',label:'Player 1'},{value:'2',label:'Player 2'},{value:'3',label:'Player 3'},{value:'4',label:'Player 4'},
      ],v=>saveCompletion({playerId:v==='auto'?null:Number(v)})).root);
      const returnPawnOptions=cinemaPawnOptions();
      if(props.completion.pawnId&&!returnPawnOptions.some(option=>option.value===props.completion.pawnId)){
        returnPawnOptions.push({value:props.completion.pawnId,label:props.completion.pawnId+' · '+tr('unavailable now','non disponibile ora')});
      }
      cinemaSec.body.appendChild(selectRow(tr('Return Pawn','Pawn finale'),props.completion.pawnId||'',returnPawnOptions,v=>saveCompletion({pawnId:v})).root);
      cinemaSec.body.appendChild(el('<div class="lk-hint">'+tr('The selected Pawn is possessed before a Blend; Logic Completed fires only after the camera handoff.','Il Pawn scelto viene posseduto prima del Blend; Completed della Logic scatta solo dopo il passaggio camera.')+'</div>'));
      const eventRow = el('<div class="lk-row"><label>Event name</label><input type="text"></div>');
      const eventInput = eventRow.querySelector('input');
      eventInput.value = props.eventName || '';
      eventInput.placeholder = 'garage_entry';
      eventInput.addEventListener('change', () => saveCinema({eventName:eventInput.value.trim()}));
      cinemaSec.body.appendChild(eventRow);
      cinemaSec.body.appendChild(selectRow('Default shot camera', props.previewCamera || '', sceneCameraOptions(), v => saveCinema({previewCamera:v})).root);
      const trackList = el('<div class="lk-cinema-track"></div>');
      const renderTrack = () => {
        trackList.innerHTML = '';
        const items = props.movieTrack.slice().sort((a,b) => (a.time || 0) - (b.time || 0));
        if(!items.length) trackList.appendChild(el('<div class="lk-hint">Movie track is empty. Add cuts from the selected preview camera.</div>'));
        items.forEach((cut, index) => {
          const camera = GAME.world.registry.find(item => item.userData && item.userData.editorId === cut.cameraId);
          const row = el('<div class="lk-cinema-cut"><span></span><button type="button">×</button></div>');
          row.querySelector('span').textContent = (+cut.time || 0).toFixed(2) + 's - ' + ((+cut.time || 0) + (Number(cut.duration) || 1)).toFixed(2) + 's  |  ' + (camera && (camera.userData.editorName || camera.userData.editorId) || cut.cameraId || 'Camera');
          row.querySelector('button').addEventListener('click', () => {
            props.movieTrack.splice(index, 1);
            saveCinema({movieTrack:props.movieTrack});
            renderTrack();
          });
          trackList.appendChild(row);
        });
      };
      cinemaSec.body.appendChild(trackList);
      cinemaSec.body.appendChild(btnRow([
        {label:'Add cut', action:() => {
          const cameraId = props.previewCamera || (sceneCameraOptions()[1] && sceneCameraOptions()[1].value) || '';
          if(!cameraId) return;
          const previewTime = ED.cinemaPreview && ED.cinemaPreview.id === o.userData.editorId ? ED.cinemaPreview.time : null;
          const lastTime = props.movieTrack.reduce((max, item) => Math.max(max, Number(item.time) || 0), -1);
          const time = previewTime != null ? previewTime : Math.max(0, Math.min(props.duration || 6, lastTime + 1));
          props.movieTrack.push({id:'shot_' + Date.now().toString(36), type:'shot', time, duration:Math.min(2, Math.max(.25, (props.duration || 6) - time)), cameraId});
          saveCinema({movieTrack:props.movieTrack});
          renderTrack();
        }},
        {label:'Add keyframe', action:() => {
          props.keyframes.push({time:Math.min(props.duration || 6, props.keyframes.length), position:[o.position.x, o.position.y, o.position.z]});
          saveCinema({keyframes:props.keyframes});
          selectObject(o);
        }},
      ]));
      cinemaSec.body.appendChild(btnRow([
        {label:'Preview in quad', action:() => {
          ED.viewportMode = 'quad';
          ED.cinemaPreview = {id:o.userData.editorId, time:0, playing:false};
          ED.viewportSlots[1] = 'timeline:' + o.userData.editorId;
        }},
        {label:'▶ Play movie', action:() => {
          ED.viewportMode = 'quad';
          ED.cinemaPreview = {id:o.userData.editorId, time:0, playing:true};
          ED.viewportSlots[1] = 'timeline:' + o.userData.editorId;
        }},
        {label:'■ Stop', action:() => {
          ED.cinemaPreview = null;
        }},
      ]));
      cinemaSec.body.appendChild(el('<div class="lk-hint">Cinema Studio data is saved with this element: cameras, movie cuts, keyframes, trigger and playback mode. Runtime event playback can build on this structure.</div>'));
      renderTrack();
      box.appendChild(cinemaSec.root);
    }

    if(o.userData.editorType === 'text'){
      const tx = section('TEXT');
      const props = Object.assign({
        text:'Text', color:0xffffff, background:0x000000, opacity:0, size:1, width:4, height:1.4,
        fontSize:96, fontFamily:'Arial', weight:'900', italic:false, align:'center', valign:'middle',
        lineHeight:1.15, padding:.12, wrap:false, depth:.16, bevel:false,
      }, o.userData.textProps || {});
      o.userData.textProps = props;
      const updateText = patch => {
        Object.assign(props, patch || {});
        o.userData.textProps = props;
        if(o.userData.addedEntry) o.userData.addedEntry.props = Object.assign({}, props);
        if(STORE.updateTextObject) STORE.updateTextObject(o);
        markDirty();
      };
      const row = el('<div class="lk-row"><label>Text</label><textarea rows="5"></textarea></div>');
      const input = row.querySelector('textarea');
      input.value = props.text || '';
      input.addEventListener('input', () => updateText({text:input.value}));
      tx.body.appendChild(row);
      tx.body.appendChild(colorRow('Color', props.color, v => updateText({color:v})).root);
      tx.body.appendChild(colorRow('Background', props.background, v => updateText({background:v})).root);
      tx.body.appendChild(sliderRow('Background alpha', props.opacity || 0, 0, 1, .01, v => updateText({opacity:v}), v => Math.round(v * 100) + '%').root);
      tx.body.appendChild(sliderRow('Object size', props.size || 1, .2, 8, .05, v => updateText({size:v}), v => (+v).toFixed(2)).root);
      tx.body.appendChild(sliderRow('Crop width', props.width || 4, .4, 24, .05, v => updateText({width:v}), v => (+v).toFixed(2) + 'm').root);
      tx.body.appendChild(sliderRow('Crop height', props.height || 1.4, .2, 12, .05, v => updateText({height:v}), v => (+v).toFixed(2) + 'm').root);
      tx.body.appendChild(sliderRow('Font size', props.fontSize || 96, 12, 220, 1, v => updateText({fontSize:Math.round(v)}), v => Math.round(v) + 'px').root);
      const fontRow = el('<div class="lk-row"><label>Font</label><select><option value="Arial">Arial</option><option value="Georgia">Georgia</option><option value="Verdana">Verdana</option><option value="Tahoma">Tahoma</option><option value="Courier New">Courier New</option><option value="Impact">Impact</option></select></div>');
      const fontSelect = fontRow.querySelector('select');
      fontSelect.value = props.fontFamily || 'Arial';
      fontSelect.addEventListener('change', () => updateText({fontFamily:fontSelect.value}));
      tx.body.appendChild(fontRow);
      const weightRow = el('<div class="lk-row"><label>Weight</label><select><option value="400">Regular</option><option value="700">Bold</option><option value="900">Black</option></select></div>');
      const weightSelect = weightRow.querySelector('select');
      weightSelect.value = String(props.weight || '900');
      weightSelect.addEventListener('change', () => updateText({weight:weightSelect.value}));
      tx.body.appendChild(weightRow);
      tx.body.appendChild(checkRow('Italic', !!props.italic, v => updateText({italic:v})).root);
      tx.body.appendChild(checkRow('Auto wrap', !!props.wrap, v => updateText({wrap:v})).root);
      const alignRow = el('<div class="lk-row"><label>Align</label><select><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>');
      const alignSelect = alignRow.querySelector('select');
      alignSelect.value = props.align || 'center';
      alignSelect.addEventListener('change', () => updateText({align:alignSelect.value}));
      tx.body.appendChild(alignRow);
      const valignRow = el('<div class="lk-row"><label>Vertical</label><select><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></div>');
      const valignSelect = valignRow.querySelector('select');
      valignSelect.value = props.valign || 'middle';
      valignSelect.addEventListener('change', () => updateText({valign:valignSelect.value}));
      tx.body.appendChild(valignRow);
      tx.body.appendChild(sliderRow('Line height', props.lineHeight || 1.15, .7, 2.4, .01, v => updateText({lineHeight:v}), v => (+v).toFixed(2)).root);
      tx.body.appendChild(sliderRow('Padding', props.padding || 0, 0, 2, .01, v => updateText({padding:v}), v => (+v).toFixed(2) + 'm').root);
      if(o.userData.textKind === '3d'){
        tx.body.appendChild(sliderRow('Depth', props.depth || .16, .01, 1.2, .01, v => updateText({depth:v}), v => (+v).toFixed(2) + 'm').root);
        tx.body.appendChild(checkRow('Bevel', !!props.bevel, v => updateText({bevel:v})).root);
      }
      tx.body.appendChild(btnRow([{label:'Fit crop to lines', action:() => {
        const lines = String(props.text || '').split(/\r\n|\r|\n/).length || 1;
        updateText({height:Math.max(.35, lines * (props.fontSize || 96) / 120 * (props.lineHeight || 1.15) + (props.padding || 0) * 2)});
      }}]));
      box.appendChild(tx.root);
    }

    if(o.userData.editorType === 'texture'){
      const tex = section('FREE TEXTURE / DECAL');
      const props = Object.assign({
        mode:'decal', src:null, dbKey:null, asset:null, width:2, height:2, opacity:1, color:0xffffff,
        alphaTest:.01, blending:'normal', depthBias:.012, doubleSide:true, animated:false,
        materialModel:'unlit', roughness:.65, metalness:0, specular:.35, emissive:0x000000, emissiveIntensity:0,
        surfaceInfluence:0, surfaceProbeDistance:1.5, surfaceReceiverId:null, surfaceReceiverName:'',
      }, o.userData.textureProps || {});
      o.userData.textureProps = props;
      const updateTexture = patch => {
        Object.assign(props, patch || {});
        o.userData.textureProps = props;
        if(o.userData.addedEntry){
          o.userData.addedEntry.textureKind = props.mode === 'image' ? 'image' : 'decal';
          o.userData.addedEntry.props = Object.assign({}, props);
          if(props.asset) o.userData.addedEntry.asset = Object.assign({}, props.asset);
        }
        if(STORE.updateTextureObject) STORE.updateTextureObject(o);
        markDirty();
        refreshOutliner();
      };
      const preview = el('<div class="lk-texture-preview"><div></div><span>' + tr('No texture loaded', 'Nessuna texture caricata') + '</span></div>');
      const previewBox = preview.querySelector('div');
      const previewText = preview.querySelector('span');
      const applyTexturePreview = (asset, label) => {
        if(!asset) return;
        const previewUrl = asset.src ? Promise.resolve(asset.src) : resolveImportedAssetUrl(asset).catch(() => null);
        previewText.textContent = label || asset.name || asset.source || tr('Imported texture', 'Texture importata');
        previewUrl.then(url => {
          if(!url) return;
          previewBox.style.backgroundImage = 'url(' + url + ')';
          previewBox.style.backgroundSize = 'cover';
          previewBox.style.backgroundPosition = 'center';
        });
      };
      const previewDbKey = props.dbKey || props.asset && props.asset.dbKey || null;
      if(props.src || previewDbKey){
        applyTexturePreview({
          src:props.src || null,
          dbKey:previewDbKey,
          name:props.asset && props.asset.name,
          source:props.asset && props.asset.source,
        }, props.asset && (props.asset.name || props.asset.source) || (props.src ? tr('Inline texture', 'Texture inline') : tr('Texture from asset DB', 'Texture da asset DB')));
      }
      tex.body.appendChild(preview);
      const fileRow = el('<div class="lk-drop"><strong>' + tr('Load texture / decal', 'Carica texture / decal') + '</strong><span>' + tr('PNG, JPG, WEBP, AVIF or GIF. The file is also saved in Assets.', 'PNG, JPG, WEBP, AVIF o GIF. Il file viene salvato anche in Assets.') + '</span></div>');
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
      input.hidden = true;
      fileRow.appendChild(input);
      fileRow.addEventListener('click', () => input.click());
      fileRow.addEventListener('dragover', e => { e.preventDefault(); fileRow.classList.add('drag'); });
      fileRow.addEventListener('dragleave', () => fileRow.classList.remove('drag'));
      fileRow.addEventListener('drop', e => {
        e.preventDefault();
        fileRow.classList.remove('drag');
        const ref = e.dataTransfer && e.dataTransfer.getData && e.dataTransfer.getData('application/x-lotking-asset');
        if(ref && ref.indexOf('imported:') === 0){
          const assetId = ref.slice(9);
          const asset = assetLibraryLoad().find(item => item && item.id === assetId && item.kind === 'texture');
          if(asset){
            handlePatchFromAsset(asset);
            return;
          }
        }
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if(f) handleTextureFile(f);
      });
      input.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if(f) handleTextureFile(f);
      });
      const handlePatchFromAsset = asset => {
        if(!asset) return;
        applyTexturePreview(asset);
        updateTexture({
          src:asset.src || null,
          dbKey:asset.dbKey || null,
          asset:{key:asset.key, dbKey:asset.dbKey || null, name:asset.name, source:asset.source || 'Imported texture'},
          animated:/\.gif$/i.test(asset.source || '') || /gif/i.test(asset.mime || ''),
        });
      };
      function handleTextureFile(file){
        importTextureFile(file).then(handlePatchFromAsset).catch(err => {
          console.warn('Texture import failed', err);
        });
      }
      tex.body.appendChild(fileRow);
      const textureAssets = assetLibraryLoad().filter(asset => asset && asset.kind === 'texture');
      if(textureAssets.length){
        tex.body.appendChild(selectRow('Use from Assets', '', [
          {value:'', label:tr('Choose imported texture...', 'Scegli texture importata...')},
          ...textureAssets.map(asset => ({value:asset.id, label:asset.source || asset.name || asset.key})),
        ], id => {
          const asset = textureAssets.find(item => item.id === id);
          if(asset) handlePatchFromAsset(asset);
        }).root);
      }
      tex.body.appendChild(selectRow(tr('Type', 'Tipo'), props.mode || 'decal', [
        {value:'decal', label:tr('Surface decal', 'Decal su superficie')},
        {value:'image', label:tr('Free image', 'Immagine libera')},
      ], v => {
        beginTransformHistory();
        updateTexture({mode:v});
        o.rotation.x = v === 'decal' ? -Math.PI / 2 : 0;
        o.position.y = v === 'decal' ? Math.max(o.position.y, .025) : Math.max(o.position.y, 1.2);
        commitTransformHistory('Texture mode');
        syncTransformFields();
      }).root);
      let surfacePanel = null;
      let pbrPanel = null;
      let lightingSelect = null;
      tex.body.appendChild(selectRow(tr('Blending', 'Fusione'), props.blending || 'normal', [
        {value:'normal', label:'Normal alpha'},
        {value:'surface', label:tr('Surface Layer · preserve PBR', 'Livello superficie · preserva PBR')},
        {value:'additive', label:'Additive'},
        {value:'multiply', label:'Multiply'},
        {value:'subtractive', label:'Subtractive'},
      ], v => {
        updateTexture({
          blending:v,
          materialModel:v === 'surface' ? 'lit' : props.materialModel,
          surfaceReceiverId:v === 'surface' ? null : props.surfaceReceiverId,
          surfaceReceiverName:v === 'surface' ? '' : props.surfaceReceiverName,
        });
        if(v === 'surface' && STORE.matchTextureSurface) STORE.matchTextureSurface(o, true);
        if(surfacePanel) surfacePanel.hidden = v !== 'surface';
        if(lightingSelect && v === 'surface'){
          lightingSelect.value = 'lit';
          lightingSelect.disabled = true;
        } else if(lightingSelect) lightingSelect.disabled = false;
        if(pbrPanel) pbrPanel.hidden = v !== 'surface' && props.materialModel !== 'lit';
      }).root);
      surfacePanel = el('<div class="lk-material-preserve"></div>');
      surfacePanel.hidden = props.blending !== 'surface';
      const surfaceHint = el('<div class="lk-hint"></div>');
      const updateSurfaceHint = () => {
        const current = o.userData.textureProps || props;
        surfaceHint.textContent = current.surfaceReceiverName
          ? tr('Matched surface: ', 'Superficie associata: ') + current.surfaceReceiverName
          : tr('Move the decal onto a surface, then use Match surface. The engine also rematches it automatically after a transform.', 'Sposta il decal su una superficie, poi usa Associa superficie. Il motore lo riassocia anche automaticamente dopo una trasformazione.');
      };
      surfacePanel.appendChild(el('<div class="lk-hint"><b>' +
        tr('Material-preserving color decal', 'Decal colore che preserva il materiale') +
        '</b><br>' +
        tr('Uses normal alpha instead of Multiply and reuses the receiver’s normal, roughness, metallic, AO and environment maps. A controlled amount of the base texture can pass through the decal without cloning GPU textures.', 'Usa alpha normale al posto di Multiply e riutilizza normal, roughness, metallic, AO ed environment map della superficie. Una quantità controllata della texture base può attraversare il decal senza clonare texture GPU.') +
        '</div>'));
      surfacePanel.appendChild(surfaceHint);
      surfacePanel.appendChild(sliderRow(
        tr('Material override', 'Sovrascrivi materiale'),
        props.surfaceInfluence == null ? 0 : props.surfaceInfluence,
        0, 1, .01,
        v => updateTexture({surfaceInfluence:v}),
        v => Math.round(v * 100) + '%'
      ).root);
      surfacePanel.appendChild(sliderRow(
        tr('Receiver base texture', 'Texture base ricevente'),
        props.surfaceBaseInfluence == null ? .18 : props.surfaceBaseInfluence,
        0, 1, .01,
        v => updateTexture({surfaceBaseInfluence:v}),
        v => Math.round(v * 100) + '%'
      ).root);
      surfacePanel.appendChild(sliderRow(
        tr('Surface probe', 'Raggio superficie'),
        props.surfaceProbeDistance == null ? 1.5 : props.surfaceProbeDistance,
        .05, 5, .05,
        v => updateTexture({surfaceProbeDistance:v, surfaceReceiverId:null, surfaceReceiverName:''}),
        v => (+v).toFixed(2) + 'm'
      ).root);
      surfacePanel.appendChild(btnRow([{label:tr('Match surface now', 'Associa superficie ora'), action:() => {
        updateTexture({surfaceReceiverId:null, surfaceReceiverName:''});
        if(STORE.matchTextureSurface) STORE.matchTextureSurface(o, true);
        Object.assign(props, o.userData.textureProps || {});
        if(o.userData.addedEntry) o.userData.addedEntry.props = Object.assign({}, props);
        updateSurfaceHint();
      }}]));
      updateSurfaceHint();
      tex.body.appendChild(surfacePanel);
      tex.body.appendChild(colorRow(tr('Base color', 'Colore base'), props.color == null ? 0xffffff : props.color, v => updateTexture({color:v})).root);
      tex.body.appendChild(sliderRow(tr('Width', 'Larghezza'), props.width || 2, .05, 24, .05, v => updateTexture({width:v}), v => (+v).toFixed(2) + 'm').root);
      tex.body.appendChild(sliderRow(tr('Height', 'Altezza'), props.height || 2, .05, 24, .05, v => updateTexture({height:v}), v => (+v).toFixed(2) + 'm').root);
      tex.body.appendChild(sliderRow(tr('Opacity', 'Opacità'), props.opacity == null ? 1 : props.opacity, 0, 1, .01, v => updateTexture({opacity:v}), v => Math.round(v * 100) + '%').root);
      tex.body.appendChild(sliderRow('Alpha cut', props.alphaTest == null ? .01 : props.alphaTest, 0, .8, .01, v => updateTexture({alphaTest:v}), v => (+v).toFixed(2)).root);
      tex.body.appendChild(sliderRow('Depth bias', props.depthBias == null ? .012 : props.depthBias, 0, .08, .001, v => updateTexture({depthBias:v}), v => (+v).toFixed(3) + 'm').root);
      const lightingRow = selectRow(tr('Lighting', 'Illuminazione'), props.materialModel || 'unlit', [
        {value:'unlit', label:tr('Unlit / flat', 'Non illuminato / piatto')},
        {value:'lit', label:tr('Lit / PBR', 'Illuminato / PBR')},
      ], v => {
        updateTexture({materialModel:v});
        if(pbrPanel) pbrPanel.hidden = v !== 'lit' && props.blending !== 'surface';
      });
      lightingSelect = lightingRow.input;
      if(props.blending === 'surface') lightingSelect.disabled = true;
      tex.body.appendChild(lightingRow.root);
      pbrPanel = el('<div class="lk-decal-pbr"></div>');
      pbrPanel.hidden = (props.materialModel || 'unlit') !== 'lit' && props.blending !== 'surface';
      pbrPanel.appendChild(sliderRow(tr('Roughness', 'Ruvidità'), props.roughness == null ? .65 : props.roughness, 0, 1, .01, v => updateTexture({roughness:v}), v => Math.round(v * 100) + '%').root);
      pbrPanel.appendChild(sliderRow(tr('Metallic', 'Metallico'), props.metalness == null ? 0 : props.metalness, 0, 1, .01, v => updateTexture({metalness:v}), v => Math.round(v * 100) + '%').root);
      pbrPanel.appendChild(sliderRow(tr('Specular', 'Speculare'), props.specular == null ? .35 : props.specular, 0, 1, .01, v => updateTexture({specular:v}), v => Math.round(v * 100) + '%').root);
      pbrPanel.appendChild(colorRow(tr('Emission color', 'Colore emissione'), props.emissive == null ? 0x000000 : props.emissive, v => updateTexture({emissive:v})).root);
      pbrPanel.appendChild(sliderRow(tr('Emission', 'Emissione'), props.emissiveIntensity == null ? 0 : props.emissiveIntensity, 0, 3, .01, v => updateTexture({emissiveIntensity:v}), v => (+v).toFixed(2)).root);
      tex.body.appendChild(pbrPanel);
      tex.body.appendChild(checkRow(tr('Double side', 'Doppio lato'), props.doubleSide !== false, v => updateTexture({doubleSide:v})).root);
      tex.body.appendChild(checkRow(tr('Animated / GIF refresh', 'Animata / refresh GIF'), !!props.animated, v => updateTexture({animated:v})).root);
      box.appendChild(tex.root);
    }

    if(o.userData.editorType === 'mesh'){
      const sc = section('PHYSICS');
      sc.root.dataset.historyManaged = 'collider';
      const c = o.userData && o.userData.collider;
      const syncProceduralCollision=patch=>{
        const entry=o.userData&&o.userData.addedEntry,api=window.LK_ENGINE_PROCEDURAL_ASSETS;
        if(!entry||entry.kind!=='proceduralAsset'||!api)return;
        const value=api.normalize(entry.procedural);Object.assign(value.collision,patch||{});entry.procedural=api.normalize(value);
      };
      if(c && c.ref) STORE.syncCollider(o);
      const hasCollider = !!(c && c.ref && c.ref.enabled !== false);
      const hasPhysics = !!(o.userData.physicsEnabled || (c && c.ref && c.ref.physics));
      const mass = (() => {
        const storedMass = Number(o.userData && o.userData.physicsMass);
        if(Number.isFinite(storedMass) && storedMass > 0) return storedMass;
        const refMass = c && c.ref && c.ref.mass;
        const parsed = Number(refMass);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      })();
      const impactForce = (() => {
        const stored = Number(o.userData && o.userData.physicsImpact);
        if(Number.isFinite(stored)) return Math.max(0, Math.min(1, stored));
        const refImpact = c && c.ref && c.ref.impact;
        const parsed = Number(refImpact);
        return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : .25;
      })();
      const physicsMassRow = sliderRow('Mass', mass, .001, 1000, .001, v => {
        const m = Math.max(.001, v);
        if(o.userData.collider && o.userData.collider.ref) o.userData.collider.ref.mass = m;
        o.userData.physicsMass = m;
        if(o.userData.addedEntry) o.userData.addedEntry.physicsMass = m;
        syncProceduralCollision({mass:m});
        if(c && c.ref) STORE.syncCollider(o);
        markDirty();
      });
      const impactRow = sliderRow('Impact force', impactForce, 0, 1, .01, v => {
        const force = Math.max(0, Math.min(1, v));
        if(o.userData.collider && o.userData.collider.ref) o.userData.collider.ref.impact = force;
        o.userData.physicsImpact = force;
        if(o.userData.addedEntry) o.userData.addedEntry.physicsImpact = force;
        syncProceduralCollision({impact:force});
        markDirty();
      });
      if(physicsMassRow.input) physicsMassRow.input.disabled = !hasPhysics;
      if(physicsMassRow.valueInput) physicsMassRow.valueInput.disabled = !hasPhysics;
      if(impactRow.input) impactRow.input.disabled = !hasPhysics;
      if(impactRow.valueInput) impactRow.valueInput.disabled = !hasPhysics;
      const collisionRow = checkRow('Collision', hasCollider, v => {
        beginColliderHistory(o);
        if(!v && o.userData.driveSurface === true){
          o.userData.driveSurface = false;
          if(o.userData.addedEntry) o.userData.addedEntry.driveSurface = false;
          syncProceduralCollision({driveSurface:false});
        }
        setColliderEnabled(o, v);
        syncProceduralCollision({enabled:v});
        commitColliderHistory('Collision enabled');
      });
      sc.body.appendChild(collisionRow.root);
      sc.body.appendChild(checkRow('Physics', hasPhysics, v => {
        beginColliderHistory(o);
        setPhysicsEnabled(o, v);
        syncProceduralCollision({physics:v});
        commitColliderHistory('Physics enabled');
      }).root);
      sc.body.appendChild(checkRow('Drive surface', !!o.userData.driveSurface, v => {
        beginColliderHistory(o);
        o.userData.driveSurface = v;
        if(o.userData.addedEntry) o.userData.addedEntry.driveSurface = v;
        syncProceduralCollision({driveSurface:v});
        if(v && !(o.userData.collider && o.userData.collider.ref && o.userData.collider.ref.enabled !== false)){
          setColliderEnabled(o, true);
          syncProceduralCollision({enabled:true});
        }
        requestPhysicsRebuild();
        markDirty();
        commitColliderHistory('Drive surface');
      }).root);
      const colliderSlider = row => {
        row.root.addEventListener('lk-slider-edit-start', () => beginColliderHistory(o));
        row.root.addEventListener('lk-slider-edit-end', () => {
          commitColliderHistory('Collider edit');
          requestPhysicsRebuild();
          if(deps.rebuildColliderHelpers) deps.rebuildColliderHelpers();
        });
        return row.root;
      };
      sc.body.appendChild(colliderSlider(physicsMassRow));
      sc.body.appendChild(colliderSlider(impactRow));
      const hint = hasCollider
        ? ((o.userData.colliderShape && o.userData.colliderShape.mode === 'complex')
          ? 'Complex static collision follows the visible mesh. Select a child dummy in Scene to tune, force solid, or disable that single collider.'
          : 'Collision uses one solid box around this object. Switch to Complex for mesh-based static collision.')
        : 'No collision. Recommended for large track/map GLB files; add smaller collision primitives where the car must hit something.';
      sc.body.appendChild(el('<div class="lk-hint">' + hint + '</div>'));
      if(hasCollider && c && c.ref){
        const shape = o.userData.colliderShape || (o.userData.colliderShape = {});
        if(o.userData.colliderOnly){
          const trigger = Object.assign({enabled:false, eventName:'', mode:'once'}, o.userData.cinemaTrigger || {});
          o.userData.cinemaTrigger = trigger;
          const saveTrigger = patch => {
            Object.assign(trigger, patch || {});
            trigger.mode = trigger.mode === 'repeat' ? 'repeat' : 'once';
            trigger.eventName = String(trigger.eventName || '').trim();
            o.userData.cinemaTrigger = trigger;
            if(o.userData.addedEntry) o.userData.addedEntry.cinemaTrigger = Object.assign({}, trigger);
            markDirty();
            refreshOutliner();
          };
          const trigSec = section('CINEMA TRIGGER');
          trigSec.body.appendChild(checkRow('Enabled', !!trigger.enabled, v => saveTrigger({enabled:v})).root);
          const eventRow = el('<div class="lk-row"><label>Event name</label><input type="text"></div>');
          const eventInput = eventRow.querySelector('input');
          eventInput.value = trigger.eventName || '';
          eventInput.placeholder = 'garage_entry';
          eventInput.addEventListener('change', () => saveTrigger({eventName:eventInput.value}));
          trigSec.body.appendChild(eventRow);
          trigSec.body.appendChild(selectRow('Mode', trigger.mode || 'once', [
            {value:'once', label:'Once per preview'},
            {value:'repeat', label:'Repeat on enter'},
          ], v => saveTrigger({mode:v})).root);
          trigSec.body.appendChild(el('<div class="lk-hint">Starts Cinema Studio timelines set to Runtime event with the same Event name when the player car enters this box.</div>'));
          box.appendChild(trigSec.root);
        }
        const applyDummyVisibility = value => {
          const mode = value === 'show' || value === 'hide' ? value : 'auto';
          if(mode === 'auto') delete o.userData.colliderDummyVisibility;
          else o.userData.colliderDummyVisibility = mode;
          if(o.userData.addedEntry){
            if(mode === 'auto') delete o.userData.addedEntry.colliderDummyVisibility;
            else o.userData.addedEntry.colliderDummyVisibility = mode;
          }
          if(deps.rebuildColliderHelpers) deps.rebuildColliderHelpers();
          markDirty();
        };
        const applyColliderShape = patch => {
          Object.assign(shape, patch || {});
          o.userData.colliderShape = shape;
          if(o.userData.addedEntry) o.userData.addedEntry.colliderShape = Object.assign({}, shape);
          STORE.syncCollider(o);
          markDirty();
        };
        sc.body.appendChild(el('<div class="lk-hint">Collider dummy: edit the collision shape independently from the visible mesh.</div>'));
        const dummyVisibilityRow = el('<div class="lk-row"><label>Dummy visibility</label><select><option value="auto">Auto</option><option value="show">Always show</option><option value="hide">Always hide</option></select></div>');
        const dummyVisibilitySelect = dummyVisibilityRow.querySelector('select');
        dummyVisibilitySelect.value = o.userData.colliderDummyVisibility === 'show' || o.userData.colliderDummyVisibility === 'hide' ? o.userData.colliderDummyVisibility : 'auto';
        dummyVisibilitySelect.addEventListener('change', () => {
          beginColliderHistory(o);
          applyDummyVisibility(dummyVisibilitySelect.value);
          commitColliderHistory('Collider visibility');
        });
        sc.body.appendChild(dummyVisibilityRow);
        const modeRow = el('<div class="lk-row"><label>Collider mode</label><select><option value="simple">Simple</option><option value="complex">Complex</option></select></div>');
        const modeSelect = modeRow.querySelector('select');
        modeSelect.value = shape.mode === 'complex' ? 'complex' : 'simple';
        modeSelect.addEventListener('change', () => {
          beginColliderHistory(o);
          applyColliderShape({mode: modeSelect.value === 'complex' ? 'complex' : 'simple'});
          requestPhysicsRebuild();
          commitColliderHistory('Collider mode');
          deps.rebuildColliderHelpers && deps.rebuildColliderHelpers();
          refreshOutliner();
        });
        sc.body.appendChild(modeRow);
        const selectedPartIndex = Number.isInteger(ED.colliderPartIndex) ? ED.colliderPartIndex : null;
        if(shape.mode === 'complex' && selectedPartIndex != null && c.ref.parts && c.ref.parts[selectedPartIndex]){
          const part = c.ref.parts[selectedPartIndex];
          if(!Array.isArray(shape.parts)) shape.parts = [];
          const partShape = shape.parts[selectedPartIndex] || (shape.parts[selectedPartIndex] = {});
          if(part.partName && !partShape.name) partShape.name = part.partName;
          const applyPartShape = patch => {
            Object.assign(partShape, patch || {});
            if(patch && patch.mode !== 'off' && patch.mode !== 'complex') partShape.mode = 'solid';
            shape.parts[selectedPartIndex] = partShape;
            o.userData.colliderShape = shape;
            if(o.userData.addedEntry) o.userData.addedEntry.colliderShape = Object.assign({}, shape);
            STORE.syncCollider(o);
            markDirty();
            refreshOutliner();
          };
          sc.body.appendChild(el('<div class="lk-hint">Selected complex dummy: ' + (part.partName || ('Collider ' + (selectedPartIndex + 1))) + '. Complex follows the GLB mesh; Solid keeps your manual box; Off disables only this part.</div>'));
          const partModeRow = el('<div class="lk-row"><label>Dummy mode</label><select><option value="complex">Complex mesh</option><option value="solid">Solid box</option><option value="off">Off</option></select></div>');
          const partModeSelect = partModeRow.querySelector('select');
          partModeSelect.value = partShape.mode === 'solid' ? 'solid' : (partShape.mode === 'off' ? 'off' : 'complex');
          partModeSelect.addEventListener('change', () => {
            beginColliderHistory(o);
            applyPartShape({mode: partModeSelect.value});
            requestPhysicsRebuild();
            deps.rebuildColliderHelpers && deps.rebuildColliderHelpers();
            commitColliderHistory('Collider part mode');
          });
          sc.body.appendChild(partModeRow);
          sc.body.appendChild(colliderSlider(sliderRow('Dummy offset X', Number.isFinite(Number(partShape.offsetX)) ? Number(partShape.offsetX) : 0, -50, 50, .05, v => applyPartShape({offsetX:v}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Dummy offset Y', Number.isFinite(Number(partShape.offsetY)) ? Number(partShape.offsetY) : 0, -50, 50, .05, v => applyPartShape({offsetY:v}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Dummy offset Z', Number.isFinite(Number(partShape.offsetZ)) ? Number(partShape.offsetZ) : 0, -50, 50, .05, v => applyPartShape({offsetZ:v}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Dummy half X', part.hx || 1, .05, 250, .05, v => applyPartShape({hx:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Dummy half Y', part.hy || .5, .05, 250, .05, v => applyPartShape({hy:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Dummy half Z', part.hz || 1, .05, 250, .05, v => applyPartShape({hz:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Dummy rot X°', THREE.MathUtils.radToDeg(part.rotX || 0), -180, 180, .5, v => applyPartShape({rotX:THREE.MathUtils.degToRad(v)}), v => (+v).toFixed(1) + '°')));
          sc.body.appendChild(colliderSlider(sliderRow('Dummy rot Y°', THREE.MathUtils.radToDeg(part.rotY != null ? part.rotY : (part.rot || 0)), -180, 180, .5, v => applyPartShape({rotY:THREE.MathUtils.degToRad(v), rot:THREE.MathUtils.degToRad(v)}), v => (+v).toFixed(1) + '°')));
          sc.body.appendChild(colliderSlider(sliderRow('Dummy rot Z°', THREE.MathUtils.radToDeg(part.rotZ || 0), -180, 180, .5, v => applyPartShape({rotZ:THREE.MathUtils.degToRad(v)}), v => (+v).toFixed(1) + '°')));
        }
        sc.body.appendChild(colliderSlider(sliderRow('Collider offset X', Number.isFinite(Number(shape.offsetX)) ? Number(shape.offsetX) : 0, -50, 50, .05, v => applyColliderShape({offsetX:v}), v => (+v).toFixed(2))));
        sc.body.appendChild(colliderSlider(sliderRow('Collider offset Y', Number.isFinite(Number(shape.offsetY)) ? Number(shape.offsetY) : 0, -50, 50, .05, v => applyColliderShape({offsetY:v}), v => (+v).toFixed(2))));
        sc.body.appendChild(colliderSlider(sliderRow('Collider offset Z', Number.isFinite(Number(shape.offsetZ)) ? Number(shape.offsetZ) : 0, -50, 50, .05, v => applyColliderShape({offsetZ:v}), v => (+v).toFixed(2))));
        if(c.kind === 'circle'){
          sc.body.appendChild(colliderSlider(sliderRow('Collider radius', c.ref.r || 1, .05, 100, .05, v => applyColliderShape({r:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Collider half Y', c.ref.hy || .5, .05, 100, .05, v => applyColliderShape({hy:Math.max(.05, v)}), v => (+v).toFixed(2))));
        } else {
          sc.body.appendChild(colliderSlider(sliderRow('Collider half X', c.ref.hx || 1, .05, 250, .05, v => applyColliderShape({hx:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Collider half Y', c.ref.hy || .5, .05, 250, .05, v => applyColliderShape({hy:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Collider half Z', c.ref.hz || 1, .05, 250, .05, v => applyColliderShape({hz:Math.max(.05, v)}), v => (+v).toFixed(2))));
          sc.body.appendChild(colliderSlider(sliderRow('Collider rot X°', THREE.MathUtils.radToDeg(c.ref.rotX || 0), -180, 180, .5, v => applyColliderShape({rotX:THREE.MathUtils.degToRad(v)}), v => (+v).toFixed(1) + '°')));
          sc.body.appendChild(colliderSlider(sliderRow('Collider rot Y°', THREE.MathUtils.radToDeg(c.ref.rotY != null ? c.ref.rotY : (c.ref.rot || 0)), -180, 180, .5, v => applyColliderShape({rotY:THREE.MathUtils.degToRad(v), rot:THREE.MathUtils.degToRad(v)}), v => (+v).toFixed(1) + '°')));
          sc.body.appendChild(colliderSlider(sliderRow('Collider rot Z°', THREE.MathUtils.radToDeg(c.ref.rotZ || 0), -180, 180, .5, v => applyColliderShape({rotZ:THREE.MathUtils.degToRad(v)}), v => (+v).toFixed(1) + '°')));
        }
      }
      if(isConeObject(o)){
        sc.body.appendChild(btnRow([{
          label:tr('↺ Reset cone upright', '↺ Reset cono eretto'),
          action: () => resetConeToOriginalRotation(o),
        }]));
      }
      if(hasCollider){
        const b = new THREE.Box3().setFromObject(o);
        const s = b.getSize(new THREE.Vector3());
        sc.body.appendChild(el('<div class="lk-hint">Box approx: X ' + s.x.toFixed(1) + ' · Z ' + s.z.toFixed(1) + '</div>'));
      }
      box.appendChild(sc.root);
    }

    let light = o.isLight ? o : o.userData.light;
    if(!light && o.traverse) o.traverse(node => { if(!light && node && node.isLight) light = node; });
    if(light){
      const playerLightId = String(o.userData && o.userData.editorId || '');
      const playerFlarePair = playerLightId.indexOf('player_front_light_') === 0
        ? 'front'
        : (playerLightId.indexOf('player_rear_') === 0 ? 'rear' : null);
      const playerFlareConfig = playerFlarePair && GAME.player && GAME.player.lights && GAME.player.lights[playerFlarePair];
      const isVehicleRigLight = o.userData && o.userData.editorType === 'playerLight';
      const isEnvironmentKey = GAME && GAME.core && GAME.core.lights && (light === GAME.core.lights.sun || light === GAME.core.lights.hemi);
      const sl = section(tr('LIGHT', 'LUCE'));
      if(isVehicleRigLight || isEnvironmentKey){
        sl.body.appendChild(el('<div class="lk-hint">' + (isVehicleRigLight
          ? tr('This is a generated Player Car rig component. Physical light, timing and dummy settings are edited and saved from Player Car Logic; transient runtime values are intentionally not exposed here.', 'Questo e un componente generato dal rig Player Car. Luce fisica, orari e dummy si modificano e salvano da Player Car Logic; i valori runtime temporanei non vengono esposti qui.')
          : tr('This light is generated by the Environment system. Edit its persistent sun, moon and ambient parameters from Environment; transient calculated light values are intentionally not exposed here.', 'Questa luce e generata dal sistema Environment. Modifica i parametri persistenti di sole, luna e ambiente da Environment; i valori luminosi calcolati temporanei non vengono esposti qui.')) + '</div>'));
      } else {
        sl.body.appendChild(colorRow(tr('Color', 'Colore'), light.color ? light.color.getHex() : 0xffffff, v => { light.color.setHex(v); markDirty(); }).root);
        if(light.groundColor) sl.body.appendChild(colorRow(tr('Ground color', 'Colore terreno'), light.groundColor.getHex(), v => { light.groundColor.setHex(v); markDirty(); }).root);
        if((light.isPointLight || light.isSpotLight) && Number.isFinite(light.power)){
          sl.body.appendChild(sliderRow(tr('Luminous power (lm)', 'Potenza luminosa (lm)'), light.power, 0, 50000, 50, v => { light.power = v; markDirty(); }, v => Math.round(v) + ' lm').root);
        } else {
          sl.body.appendChild(sliderRow(tr('Intensity', 'Intensita'), light.intensity, 0, 6, .05, v => { light.intensity = v; markDirty(); }).root);
        }
        if(light.distance != null && !light.isDirectionalLight && !light.isHemisphereLight && !light.isAmbientLight)
          sl.body.appendChild(sliderRow(tr('Distance', 'Distanza'), light.distance, 0, 200, 1, v => { light.distance = v; markDirty(); }).root);
        if(light.isSpotLight){
          sl.body.appendChild(sliderRow(tr('Angle°', 'Angolo°'), THREE.MathUtils.radToDeg(light.angle), 5, 89, 1, v => { light.angle = THREE.MathUtils.degToRad(v); markDirty(); }).root);
          sl.body.appendChild(sliderRow(tr('Penumbra', 'Penombra'), light.penumbra, 0, 1, .01, v => { light.penumbra = v; markDirty(); }).root);
        }
        if(light.isPointLight || light.isSpotLight){
          sl.body.appendChild(sliderRow(tr('Decay', 'Decadimento'), light.decay, 0, 4, .05, v => { light.decay = v; markDirty(); }, v => (+v).toFixed(2)).root);
          sl.body.appendChild(el('<div class="lk-hint">' + tr('Punctual lights use r185 photometric units. Power is in lumens; decay 2 is the physically correct inverse-square falloff.', 'Le luci puntiformi usano le unita fotometriche r185. La potenza e in lumen; decadimento 2 e la caduta fisica secondo l\'inverso del quadrato.') + '</div>'));
        }
        if(!light.isAmbientLight && !light.isHemisphereLight)
          sl.body.appendChild(checkRow(tr('Cast shadows', 'Proietta ombre'), light.castShadow, v => {
            requestWarmup(v ? 'Warm-up shadows...' : 'Warm-up light...');
            light.castShadow = v;
            markDirty();
          }).root);
      }
      if(!isEnvironmentKey && (!isVehicleRigLight || !!playerFlareConfig)){
        const flare = playerFlareConfig
          ? {
            enabled:playerFlareConfig.flare === true,
            intensity:playerFlareConfig.flareIntensity == null ? (playerFlarePair === 'front' ? .24 : .16) : playerFlareConfig.flareIntensity,
            size:playerFlareConfig.flareSize == null ? (playerFlarePair === 'front' ? .42 : .34) : playerFlareConfig.flareSize,
            bloomIntensity:playerFlareConfig.flareBloomIntensity == null ? (playerFlarePair === 'front' ? .19 : .12) : playerFlareConfig.flareBloomIntensity,
            occlusion:playerFlareConfig.flareOcclusion !== false,
          }
          : Object.assign({enabled:false,intensity:.65,size:.7,bloomIntensity:.52,occlusion:true}, light.userData.cinematicLensFlare || {});
        const updateFlare = patch => {
          Object.assign(flare,patch||{});
          if(playerFlareConfig && GAME.player && GAME.player.setLights){
            const pairPatch = {};
            if(Object.prototype.hasOwnProperty.call(patch, 'enabled')) pairPatch.flare = patch.enabled === true;
            if(Object.prototype.hasOwnProperty.call(patch, 'intensity')) pairPatch.flareIntensity = patch.intensity;
            if(Object.prototype.hasOwnProperty.call(patch, 'size')) pairPatch.flareSize = patch.size;
            if(Object.prototype.hasOwnProperty.call(patch, 'bloomIntensity')) pairPatch.flareBloomIntensity = patch.bloomIntensity;
            if(Object.prototype.hasOwnProperty.call(patch, 'occlusion')) pairPatch.flareOcclusion = patch.occlusion !== false;
            Object.assign(playerFlareConfig, pairPatch);
            GAME.player.setLights({[playerFlarePair]:pairPatch});
          } else light.userData.cinematicLensFlare=Object.assign({},flare);
          markDirty();
        };
        if(playerFlareConfig) sl.body.appendChild(el('<div class="lk-hint">' + tr('This dummy edits the complete vehicle light pair and is saved with Player Car Logic.', 'Questo dummy modifica l’intera coppia di luci del veicolo e viene salvato con Player Car Logic.') + '</div>'));
        sl.body.appendChild(el('<div class="lk-hint"><b>' + tr('Cinematic lens flare', 'Lens flare cinematico') + '</b><br>' + tr('Uses the same realistic optical effect as the sun. It is rendered only while this light is active, in frame and visible.', 'Usa lo stesso effetto ottico realistico del sole. Viene renderizzato solo quando questa luce e attiva, inquadrata e visibile.') + '</div>'));
        const intensityRow=sliderRow(tr('Flare intensity', 'Intensita flare'), flare.intensity, 0, 2, .05, v => updateFlare({intensity:v}));
        const sizeRow=sliderRow(tr('Flare size', 'Dimensione flare'), flare.size, .2, 3, .05, v => updateFlare({size:v}));
        const bloomRow=sliderRow(tr('Flare bloom/glow', 'Bloom/glow flare'), flare.bloomIntensity, 0, 3, .05, v => updateFlare({bloomIntensity:v}));
        const occlusionRow=checkRow(tr('Occluded by meshes/glass/smoke', 'Occluso da mesh/vetri/fumo'), flare.occlusion!==false, v => updateFlare({occlusion:v}));
        const setFlareRowsEnabled=enabled => {
          [intensityRow.input,intensityRow.valueInput,sizeRow.input,sizeRow.valueInput,bloomRow.input,bloomRow.valueInput,occlusionRow.input].forEach(input=>{ if(input) input.disabled=!enabled; });
        };
        sl.body.appendChild(checkRow(tr('Realistic lens flare', 'Lens flare realistico'), flare.enabled===true, v => {
          if(v){
            requestWarmup(tr('Warm-up cinematic lens flare...', 'Preparazione lens flare cinematico...'));
            updateFlare({enabled:true});
          } else updateFlare({enabled:false});
          setFlareRowsEnabled(v);
        }).root);
        sl.body.appendChild(intensityRow.root);
        sl.body.appendChild(sizeRow.root);
        sl.body.appendChild(bloomRow.root);
        sl.body.appendChild(occlusionRow.root);
        setFlareRowsEnabled(flare.enabled===true);
      }
      if(!isVehicleRigLight && !isEnvironmentKey) sl.body.appendChild(checkRow(tr('Show editor dummy', 'Mostra dummy editor'), light.userData.editorDummyVisible !== false, v => {
        light.userData.editorDummyVisible = v;
        o.userData.lightDummyVisible = v;
        o.traverse(node => {
          if(node.userData && node.userData.editorLightHandle) node.visible = v && ED.active && !ED.playPreview && !ED.simulatePreview;
        });
        markDirty();
      }).root);
      box.appendChild(sl.root);

      const sky = GAME && GAME.systems && GAME.systems.sky;
      if(!isEnvironmentKey && !isVehicleRigLight){
        const schedule = Object.assign({enabled:false, onHour:18, offHour:7}, light.userData.dayNightSchedule || {});
        const automation = section(tr('TIME OF DAY AUTOMATION', 'AUTOMAZIONE TIME OF DAY'), true);
        const refreshSchedule = patch => {
          Object.assign(schedule, patch || {});
          light.userData.dayNightSchedule = Object.assign({}, schedule);
          if(light.userData.dayNightManualVisible == null) light.userData.dayNightManualVisible = light.visible !== false;
          if(sky && sky.refreshLightSchedules) sky.refreshLightSchedules();
          markDirty();
        };
        const clock = value => {
          const total = Math.round(((Number(value) % 24) + 24) % 24 * 60) % 1440;
          return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
        };
        const onRow = sliderRow(tr('Turn on at', 'Accendi alle'), schedule.onHour, 0, 23.75, .25, v => refreshSchedule({onHour:v}), clock);
        const offRow = sliderRow(tr('Turn off at', 'Spegni alle'), schedule.offHour, 0, 23.75, .25, v => refreshSchedule({offHour:v}), clock);
        const setRowsEnabled = enabled => {
          [onRow.input, onRow.valueInput, offRow.input, offRow.valueInput].forEach(input => { if(input) input.disabled = !enabled; });
        };
        automation.body.appendChild(checkRow(tr('Automatic with environment clock', 'Automatica con orologio ambiente'), schedule.enabled, v => {
          refreshSchedule({enabled:v});
          setRowsEnabled(v);
        }).root);
        automation.body.appendChild(onRow.root);
        automation.body.appendChild(offRow.root);
        setRowsEnabled(schedule.enabled);
        automation.body.appendChild(el('<div class="lk-hint">' + tr('Uses the same 24-hour Environment clock as vehicle lights. 18:00–07:00 wraps across midnight; equal times keep the light on all day.', 'Usa lo stesso orologio a 24 ore dell’Environment e delle luci veicolo. 18:00–07:00 attraversa la mezzanotte; orari uguali mantengono la luce accesa tutto il giorno.') + '</div>'));
        box.appendChild(automation.root);
      }
    }

    buildMaterialEditor(box, o);
    buildMeshEditor(box, o);

    if(o.userData.effectParams){
      const p = o.userData.effectParams;
      const se = section(tr('EFFECT', 'EFFETTO') + ' (' + p.kind + ')');
      se.body.appendChild(colorRow(tr('Color', 'Colore'), p.color, v => { o.userData.effectSetColor(v); markDirty(); }).root);
      se.body.appendChild(sliderRow(tr('Rate', 'Frequenza'), p.rate, 1, 80, 1, v => { p.rate = v; markDirty(); }).root);
      se.body.appendChild(sliderRow(tr('Size', 'Dimensione'), p.size, .1, 8, .05, v => { p.size = v; markDirty(); }).root);
      se.body.appendChild(sliderRow(tr('Life (s)', 'Vita (s)'), p.life, .2, 6, .05, v => { p.life = v; markDirty(); }).root);
      se.body.appendChild(sliderRow(tr('Rise ↑', 'Spinta ↑'), p.rise, 0, 8, .1, v => { p.rise = v; markDirty(); }).root);
      se.body.appendChild(sliderRow(tr('Spread', 'Dispersione'), p.spread, 0, 6, .05, v => { p.spread = v; markDirty(); }).root);
      se.body.appendChild(sliderRow(tr('Opacity', 'Opacita'), p.opacity, .05, 1, .01, v => { p.opacity = v; markDirty(); }).root);
      se.body.appendChild(sliderRow(tr('Render priority', 'Priorita render'), p.renderOrder == null ? 60 : p.renderOrder, -20, 120, 1, v => {
        if(o.userData.effectSetRenderOrder) o.userData.effectSetRenderOrder(v);
        else p.renderOrder = v;
        markDirty();
      }, v => String(Math.round(v))).root);
      box.appendChild(se.root);
    }

    const footerButtons = [
      {label:'🔍 Focus', action: focusSelected},
      {label:tr('⧉ Duplicate', '⧉ Duplica'), action:() => duplicateEntity(o)},
    ];
    if(o.userData.editorType === 'mesh') footerButtons.push({label:'📦 Replace GLB', action:() => replaceSelectedGlb(o)});
    footerButtons.push({label:tr('🗑 Delete', '🗑 Elimina'), danger:true, action:() => requestDeleteEntity(o)});
    box.appendChild(btnRow(footerButtons));
  }

  return Object.freeze({build});
}

window.LK_EDITOR_OBJECT_INSPECTOR = Object.freeze({create});
})();
