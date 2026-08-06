/* =========================================================
   LOT KING - progressive path tracing backend
   Optional and isolated: static world geometry is path traced while vehicles,
   characters and transient effects remain a responsive raster overlay.
   Unsupported conditions fall back to the normal WebGL renderer.
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts=options||{};
  const THREE=opts.THREERef||window.THREE;
  const renderer=opts.renderer;
  const scene=opts.scene;
  const dynamicRoots=typeof opts.dynamicRoots==='function'?opts.dynamicRoots:()=>[];
  const staticEditorMode=typeof opts.staticEditorMode==='function'?opts.staticEditorMode:()=>false;
  const unsupported=reason=>({
    supported:false,
    prepare:()=>Promise.resolve(false),
    render:()=>false,
    invalidate(){},
    dispose(){},
    status:()=>({ready:false,building:false,invalidated:false,failure:reason||'Path tracing unavailable',samples:0}),
  });
  if(!THREE||!renderer||!scene){
    return unsupported('Renderer or scene unavailable');
  }
  if(renderer.isWebGPURenderer)return unsupported('Path tracing currently requires the stable WebGLRenderer backend');
  const gl=renderer.getContext&&renderer.getContext();
  const webgl2=!!(renderer.capabilities&&renderer.capabilities.isWebGL2)||
    (typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext);
  if(!webgl2)return unsupported('WebGL 2 is required by the path tracer');

  let tracer=null;
  function loadLibrary(){
    if(window.LK_PATH_TRACING_VENDOR&&window.LK_PATH_TRACING_VENDOR.WebGLPathTracer){
      return Promise.resolve(window.LK_PATH_TRACING_VENDOR);
    }
    // Loading a second standalone bundle would also import a second Three.js
    // module graph. That is unsafe for instanceof checks and was the source of
    // the "Multiple instances of Three.js" warning, so path tracing now fails
    // closed unless it is exported by the primary compatibility bundle.
    return Promise.reject(new Error('Shared path-tracing renderer is unavailable; reload the current engine bundle'));
  }
  function createTracer(){
    if(tracer)return tracer;
    const VendorTracer=window.LK_PATH_TRACING_VENDOR&&window.LK_PATH_TRACING_VENDOR.WebGLPathTracer;
    if(!VendorTracer)throw new Error('Path-tracing renderer is not loaded');
    tracer=new VendorTracer(renderer);
    tracer.tiles.set(2,2);
    tracer.bounces=4;
    tracer.transmissiveBounces=2;
    tracer.filterGlossyFactor=.35;
    tracer.multipleImportanceSampling=true;
    tracer.dynamicLowRes=true;
    tracer.lowResScale=.5;
    tracer.renderScale=.7;
    tracer.renderDelay=0;
    tracer.minSamples=1;
    tracer.fadeDuration=0;
    tracer.rasterizeScene=false;
    tracer.textureSize.set(1024,1024);
    return tracer;
  }

  let ready=false,building=false,invalidated=true,disposed=false;
  let lastCameraKey='',lastLightingKey='',nextLightingPoll=0,buildTimer=0,failure='',buildPromise=null;
  let builtSceneKey='',builtDynamicRoots=[],materialProxies=[];
  const roots=()=>(dynamicRoots()||[]).filter(Boolean);
  function sceneModeKey(currentRoots){
    return (staticEditorMode()?'editor-static':'runtime-dynamic')+'|'+
      currentRoots.map(root=>root.uuid||root.id||root.name||'root').join(',');
  }
  function emitStatus(state){
    if(typeof window==='undefined'||!window.dispatchEvent||typeof CustomEvent==='undefined')return;
    window.dispatchEvent(new CustomEvent('lotking:pathtracing-status',{detail:Object.assign({
      supported:true,ready,building,invalidated,failure,samples:tracer?tracer.samples:0,
    },state||{})}));
  }
  function belowRoot(node,root){for(let current=node;current;current=current.parent)if(current===root)return true;return false;}
  function isNativeMaterial(material){
    return !!(material&&(material.isMeshStandardMaterial||material.isMeshPhysicalMaterial));
  }
  function canProxyMaterial(material){
    return !!(material&&material.color&&!material.isShaderMaterial&&!material.isRawShaderMaterial&&
      !material.lkDynamicTextureController&&!(material.map&&material.map.isVideoTexture));
  }
  function rasterOnlyMaterial(material){
    return !isNativeMaterial(material)&&!canProxyMaterial(material);
  }
  function authoredDynamic(node,editorStatic){
    for(let current=node;current&&current!==scene;current=current.parent){
      const data=current.userData||{};
      const authoredLogicVisual=editorStatic&&data.logicElementInternal&&data.logicElementRuntimeVisual!==false;
      if(!editorStatic&&(data.runtimeVisual||data.logicElementRuntimeVisual||data.pawnId!=null||data.playerId!=null||data.vehiclePawnId!=null))return true;
      if(data.editorOnly||data.helperOnly||(data.nonExportable&&!authoredLogicVisual)||data.colliderPreview||data.editorCameraHelper||
        data.editorLightHandle||data.lkFlareIgnore||data.lkPathTracingIgnore)return true;
      if((current.isSkinnedMesh&&!editorStatic)||current.isInstancedMesh||current.isSprite||current.isPoints||current.isLine)return true;
    }
    if(node&&node.isMesh&&node.material){
      const materials=Array.isArray(node.material)?node.material:[node.material];
      if(materials.some(rasterOnlyMaterial))return true;
    }
    return false;
  }
  function isDynamic(node,currentRoots,editorStatic){
    return authoredDynamic(node,editorStatic)||currentRoots.some(root=>belowRoot(node,root));
  }
  function restoreVisibility(hidden){hidden.forEach(entry=>{entry[0].visible=entry[1];});}
  function proxyMaterial(source){
    if(isNativeMaterial(source))return source;
    const shininess=Number(source.shininess);
    const proxy=new THREE.MeshStandardMaterial({
      name:(source.name||source.type||'Material')+' · path tracing proxy',
      color:source.color?source.color.clone():new THREE.Color(0xffffff),
      map:source.map||null,
      metalness:Number.isFinite(Number(source.metalness))?Number(source.metalness):0,
      roughness:Number.isFinite(Number(source.roughness))?Number(source.roughness):
        (Number.isFinite(shininess)?Math.max(.04,1-Math.sqrt(Math.max(0,Math.min(100,shininess))/100)):.72),
      normalMap:source.normalMap||null,
      alphaMap:source.alphaMap||null,
      aoMap:source.aoMap||null,
      emissiveMap:source.emissiveMap||null,
      emissive:source.emissive?source.emissive.clone():new THREE.Color(0x000000),
      emissiveIntensity:Number.isFinite(Number(source.emissiveIntensity))?Number(source.emissiveIntensity):1,
      transparent:!!source.transparent,
      opacity:Number.isFinite(Number(source.opacity))?Number(source.opacity):1,
      alphaTest:Number(source.alphaTest)||0,
      side:source.side,
      vertexColors:!!source.vertexColors,
      flatShading:!!source.flatShading,
    });
    if(source.normalScale&&proxy.normalScale)proxy.normalScale.copy(source.normalScale);
    proxy.userData.lkPathTracingProxyFor=source.uuid||source.name||source.type;
    materialProxies.push(proxy);
    return proxy;
  }
  function hideDynamicForBuild(currentRoots,editorStatic){
    const hidden=[],replaced=[];
    scene.traverse(node=>{
      if(!node||node===scene||node.visible===false)return;
      if(isDynamic(node,currentRoots,editorStatic)){hidden.push([node,node.visible]);node.visible=false;return;}
      if(node.isMesh&&node.material){
        const original=node.material;
        const next=Array.isArray(original)?original.map(proxyMaterial):proxyMaterial(original);
        if(next!==original){replaced.push([node,original]);node.material=next;}
      }
    });
    return {hidden,replaced};
  }
  function restoreBuildScene(state){
    (state.replaced||[]).forEach(entry=>{entry[0].material=entry[1];});
    restoreVisibility(state.hidden||[]);
  }
  function pathTracingEnvironment(){
    const environment=scene.environment;
    return environment&&environment.userData&&environment.userData.lkPathTracingEnvironmentSource||environment;
  }
  function withPathTracingEnvironment(callback){
    const original=scene.environment;
    const resolved=pathTracingEnvironment();
    if(resolved!==original)scene.environment=resolved;
    try{return callback();}
    finally{scene.environment=original;}
  }
  function qualityProfile(video){
    const profiles={
      low:{scale:.5,bounces:2,transmissive:1,texture:512,movingScale:.35},
      medium:{scale:.65,bounces:3,transmissive:2,texture:768,movingScale:.42},
      high:{scale:.8,bounces:5,transmissive:3,texture:1024,movingScale:.5},
      superhigh:{scale:.9,bounces:6,transmissive:4,texture:1024,movingScale:.6},
      extreme:{scale:1,bounces:8,transmissive:5,texture:2048,movingScale:.7},
    };
    return profiles[video&&video.quality]||profiles.high;
  }
  function applyProfile(video){
    const activeTracer=createTracer();
    const profile=qualityProfile(video);
    activeTracer.renderScale=profile.scale;
    activeTracer.bounces=profile.bounces;
    activeTracer.transmissiveBounces=profile.transmissive;
    activeTracer.lowResScale=profile.movingScale;
    activeTracer.textureSize.set(profile.texture,profile.texture);
  }
  function build(video){
    if(disposed)return;
    buildTimer=0;
    const editorStatic=!!staticEditorMode();
    const currentRoots=editorStatic?[]:roots();
    const previousProxies=materialProxies;
    materialProxies=[];
    const buildState=hideDynamicForBuild(currentRoots,editorStatic);
    try{
      applyProfile(video);
      withPathTracingEnvironment(()=>tracer.setScene(scene,opts.camera));
      previousProxies.forEach(material=>material.dispose());
      builtDynamicRoots=currentRoots.slice();
      builtSceneKey=sceneModeKey(currentRoots);
      ready=true;invalidated=false;failure='';lastCameraKey='';
      lastLightingKey=lightingKey();nextLightingPoll=performance.now()+1600;
      window.dispatchEvent(new CustomEvent('lotking:pathtracing-ready'));
      emitStatus({stage:'scene-ready'});
    }catch(error){
      materialProxies.forEach(material=>material.dispose());
      materialProxies=previousProxies;
      ready=false;failure=String(error&&error.message||error);
      console.warn('Lot King path tracing: fallback WebGL',error);
      emitStatus({stage:'failed'});
    }finally{restoreBuildScene(buildState);}
  }
  function nextFrame(){return new Promise(resolve=>requestAnimationFrame(resolve));}
  async function warmFirstSample(camera){
    if(!tracer||!ready||!camera)return false;
    tracer.setCamera(camera);
    lastCameraKey=cameraKey(camera);
    const started=performance.now();
    while(tracer.samples<1&&performance.now()-started<5000){
      tracer.renderSample();
      await nextFrame();
    }
    return tracer.samples>=1;
  }
  function prepare(video,camera){
    if(disposed||failure)return Promise.resolve(false);
    if(ready&&!invalidated&&tracer&&tracer.samples>=1)return Promise.resolve(true);
    if(buildPromise)return buildPromise;
    building=true;
    emitStatus({stage:'loading'});
    buildPromise=loadLibrary().then(()=>{
      if(invalidated||!ready)build(video);
      return warmFirstSample(camera||opts.camera);
    }).then(prepared=>{
      emitStatus({stage:prepared?'ready':'waiting-first-sample'});
      return prepared;
    }).catch(error=>{
        failure=String(error&&error.message||error);
        console.warn('Lot King path tracing: optional renderer unavailable',error);
        emitStatus({stage:'failed'});
        return false;
      }).finally(()=>{building=false;buildPromise=null;});
    return buildPromise;
  }
  function scheduleBuild(video){
    if(building||buildTimer||disposed)return;
    const run=()=>{
      buildTimer=0;
      prepare(video,opts.camera);
    };
    buildTimer=typeof requestIdleCallback==='function'?requestIdleCallback(run,{timeout:700}):setTimeout(run,50);
  }
  function cameraKey(camera,viewport){
    camera.updateMatrixWorld();
    return camera.matrixWorld.elements.map(value=>Math.round(value*10000)).join(',')+'|'+
      [camera.fov,camera.aspect,camera.near,camera.far,viewport&&viewport.width,viewport&&viewport.height]
        .map(value=>Math.round((Number(value)||0)*1000)).join(',');
  }
  const lightWorldPosition=new THREE.Vector3();
  function colorKey(color){
    return color&&color.isColor
      ? [Math.round(color.r*15),Math.round(color.g*15),Math.round(color.b*15)].join(',')
      : 'none';
  }
  function lightingKey(){
    const values=[
      scene.environment&&scene.environment.uuid||'none',
      Math.round((Number(scene.environmentIntensity)||0)*10),
      scene.background&&scene.background.isColor?colorKey(scene.background):'map',
    ];
    scene.traverse(node=>{
      if(!node||!node.isLight||node.visible===false)return;
      node.getWorldPosition(lightWorldPosition);
      values.push(node.uuid,Math.round((Number(node.intensity)||0)*20),colorKey(node.color),
        Math.round((Number(lightWorldPosition.x)||0)/5),
        Math.round((Number(lightWorldPosition.y)||0)/5),
        Math.round((Number(lightWorldPosition.z)||0)/5));
    });
    return values.join('|');
  }
  function refreshAnimatedLighting(){
    const now=performance.now();
    if(now<nextLightingPoll||!tracer||!ready)return;
    nextLightingPoll=now+1600;
    const key=lightingKey();
    if(key===lastLightingKey)return;
    lastLightingKey=key;
    withPathTracingEnvironment(()=>tracer.updateEnvironment());
    tracer.updateLights();
  }
  function applyViewportSize(viewport,video){
    if(!tracer)return;
    const width=Number(viewport&&viewport.width),height=Number(viewport&&viewport.height);
    if(!(width>0&&height>0)){
      tracer.synchronizeRenderSize=true;
      return;
    }
    const profile=qualityProfile(video),ratio=renderer.getPixelRatio?renderer.getPixelRatio():1;
    const w=Math.max(1,Math.floor(width*ratio*profile.scale));
    const h=Math.max(1,Math.floor(height*ratio*profile.scale));
    if(tracer._pathTracer&&tracer._lowResPathTracer){
      tracer.synchronizeRenderSize=false;
      tracer._pathTracer.setSize(w,h);
      tracer._lowResPathTracer.setSize(Math.max(1,Math.floor(w*tracer.lowResScale)),Math.max(1,Math.floor(h*tracer.lowResScale)));
    }else{
      tracer.synchronizeRenderSize=true;
    }
  }
  function renderDynamicOverlay(camera){
    const staticNodes=[],dynamicNodes=[],materialState=[],materialSet=new Set();
    const editorStatic=!!staticEditorMode(),currentRoots=builtDynamicRoots;
    scene.traverse(node=>{
      if(!node||node===scene||node.visible===false||node.isLight)return;
      const renderable=node.isMesh||node.isSprite||node.isPoints||node.isLine;
      if(!renderable)return;
      (isDynamic(node,currentRoots,editorStatic)?dynamicNodes:staticNodes).push(node);
    });
    const oldBackground=scene.background,oldAutoClear=renderer.autoClear;
    scene.background=null;renderer.autoClear=false;
    try{
      // Rebuild only the raster depth of the path-traced static scene so
      // vehicles, animated pawns and shader effects remain correctly occluded.
      dynamicNodes.forEach(node=>{node.visible=false;});
      staticNodes.forEach(node=>{
        const materials=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];
        materials.forEach(material=>{
          if(!material||materialSet.has(material))return;
          materialSet.add(material);materialState.push([material,material.colorWrite]);
          material.colorWrite=false;
        });
      });
      renderer.clearDepth();
      renderer.render(scene,camera);
      materialState.forEach(pair=>{pair[0].colorWrite=pair[1];});
      staticNodes.forEach(node=>{node.visible=false;});
      dynamicNodes.forEach(node=>{node.visible=true;});
      renderer.render(scene,camera);
    }finally{
      materialState.forEach(pair=>{pair[0].colorWrite=pair[1];});
      staticNodes.forEach(node=>{node.visible=true;});
      dynamicNodes.forEach(node=>{node.visible=true;});
      renderer.autoClear=oldAutoClear;scene.background=oldBackground;
    }
  }
  function render(camera,video,viewport){
    if(disposed||failure||!camera)return false;
    const desiredRoots=staticEditorMode()?[]:roots();
    if(ready&&sceneModeKey(desiredRoots)!==builtSceneKey){
      invalidate();
      scheduleBuild(video);
      return false;
    }
    if(invalidated||!ready){scheduleBuild(video);return false;}
    applyProfile(video);
    applyViewportSize(viewport,video);
    refreshAnimatedLighting();
    const key=cameraKey(camera,viewport);
    if(key!==lastCameraKey){tracer.setCamera(camera);lastCameraKey=key;}
    try{tracer.renderSample();renderDynamicOverlay(camera);return true;}
    catch(error){
      failure=String(error&&error.message||error);ready=false;
      console.warn('Lot King path tracing frame failed; using WebGL',error);
      return false;
    }
  }
  function invalidate(){
    invalidated=true;ready=false;failure='';lastCameraKey='';
    builtSceneKey='';
    if(tracer)tracer.reset();
    emitStatus({stage:'invalidated'});
  }
  function refreshLighting(){
    if(!tracer||!ready)return false;
    try{
      withPathTracingEnvironment(()=>tracer.updateEnvironment());
      tracer.updateLights();
      lastLightingKey=lightingKey();
      nextLightingPoll=performance.now()+1600;
      lastCameraKey='';
      emitStatus({stage:'lighting-updated'});
      return true;
    }catch(error){
      failure=String(error&&error.message||error);
      emitStatus({stage:'failed'});
      return false;
    }
  }
  function dispose(){
    disposed=true;
    if(buildTimer){
      if(typeof cancelIdleCallback==='function')cancelIdleCallback(buildTimer);else clearTimeout(buildTimer);
    }
    if(tracer)tracer.dispose();
    materialProxies.forEach(material=>material.dispose());
    materialProxies=[];
  }
  return {supported:true,prepare,render,invalidate,refreshLighting,dispose,status:()=>({supported:true,ready,building,invalidated,failure,samples:tracer?tracer.samples:0})};
}

window.LK_RUNTIME_PATH_TRACING=Object.freeze({create});
})();
