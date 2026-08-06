/* =========================================================
   LOT KING — DEVELOPER DEBUGGER
   Low-overhead frame/error telemetry and on-demand scene resource audit.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps=deps||{};
  const GAME=deps.GAME;
  const ED=deps.ED;
  const root=deps.root;
  const renderer=deps.renderer;
  const scene=deps.scene;
  const THREERef=deps.THREE||window.THREE;
  const selectObject=typeof deps.selectObject==='function'?deps.selectObject:null;
  const focusSelected=typeof deps.focusSelected==='function'?deps.focusSelected:null;
  const panel=root&&root.querySelector('#lkDeveloperDebugger');
  if(!panel||!renderer||!scene) return null;
  const $=selector=>panel.querySelector(selector);
  const summary=$('#lkDbgSummary'),hardware=$('#lkDbgHardware'),eventsBox=$('#lkDbgEvents');
  const rows=$('#lkDbgSceneRows'),chart=$('#lkDbgFrameChart'),saturation=$('#lkDbgSaturation');
  const mode=$('#lkDbgMode'),health=$('#lkDbgHealth'),frameLabel=$('#lkDbgFrameLabel');
  const eventCount=$('#lkDbgEventCount'),sceneTotal=$('#lkDbgSceneTotal');
  const autoLog=$('#lkDbgAutoLog');
  const shortLogUrl='/__lotking/developer-performance';
  const samples=[];
  const diagnostics=[];
  const maxSamples=240,maxDiagnostics=120;
  let open=false,lastFrame=0,lastUi=0,lastAudit=0,raf=0,auditPending=false,disposed=false;
  let lastShortLog=0,shortLogPending=false;
  let auditGeneration=0,telemetryWorker=null,workerSequence=0;
  const workerJobs=new Map();
  let frameAverage=0,frameP95=0,fps=0,maxFrame=0,stutterCount=0;
  let diagnosticsRevision=0,renderedDiagnosticsRevision=-1;
  let gpuLogTimer=0;
  let inventory=[];
  let cleanInventoryCache=[];
  let renderedInventoryMarkup='';
  let sceneStats={objects:0,meshes:0,lights:0,particleSystems:0,particleCapacity:0,liveParticles:0,sprites:0,visibleSprites:0,shadowCasters:0,transparentMaterials:0};
  const auditBounds=THREERef&&THREERef.Box3?new THREERef.Box3():null;
  const auditSize=THREERef&&THREERef.Vector3?new THREERef.Vector3():null;
  const auditNodeBounds=THREERef&&THREERef.Box3?new THREERef.Box3():null;

  function ensureTelemetryWorker(){
    if(telemetryWorker) return telemetryWorker;
    if(typeof Worker!=='function') return null;
    try {
      const url=new URL('js/editor/developer-debugger-worker.js?v=0.7.8-overlay-worker-3',document.baseURI);
      telemetryWorker=new Worker(url);
      telemetryWorker.addEventListener('message',event=>{
        const message=event&&event.data||{};
        if(message.type==='ready'){ panel.dataset.telemetryWorker='active';return; }
        const job=workerJobs.get(message.id);
        if(!job) return;
        workerJobs.delete(message.id);
        clearTimeout(job.timer);
        if(message.ok) job.resolve(message.result);
        else job.reject(new Error(message.error||'Debugger worker task failed'));
      });
      telemetryWorker.addEventListener('error',()=>{
        const failed=Array.from(workerJobs.values());
        workerJobs.clear();
        failed.forEach(job=>{ clearTimeout(job.timer);job.reject(new Error('Debugger worker unavailable')); });
        try { telemetryWorker.terminate(); } catch(error){}
        telemetryWorker=null;
        panel.dataset.telemetryWorker='fallback';
      });
      panel.dataset.telemetryWorker='loading';
      return telemetryWorker;
    } catch(error){
      panel.dataset.telemetryWorker='fallback';
      return null;
    }
  }
  function runWorkerTask(type,payload){
    const worker=ensureTelemetryWorker();
    if(!worker) return Promise.reject(new Error('Debugger worker unavailable'));
    const id=++workerSequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        if(!workerJobs.has(id)) return;
        workerJobs.delete(id);
        reject(new Error('Debugger worker task timed out'));
      },2500);
      workerJobs.set(id,{resolve,reject,timer});
      worker.postMessage({id,type,payload});
    });
  }

  const escapeHtml=value=>String(value==null?'':value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const bytes=value=>{
    const n=Math.max(0,Number(value)||0);
    if(n<1024) return Math.round(n)+' B';
    if(n<1048576) return (n/1024).toFixed(n<10240?1:0)+' KB';
    if(n<1073741824) return (n/1048576).toFixed(n<10485760?1:0)+' MB';
    return (n/1073741824).toFixed(2)+' GB';
  };
  const clock=()=>new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const number=value=>Number(value||0).toLocaleString();
  function effectivelyVisible(node){
    let current=node;
    while(current){ if(current.visible===false) return false;current=current.parent; }
    const materials=Array.isArray(node&&node.material)?node.material:[node&&node.material];
    return !materials.filter(Boolean).length||materials.some(material=>Number(material.opacity)!==0);
  }

  function record(kind,message,detail){
    diagnostics.unshift({kind,time:clock(),message:String(message||kind),detail:String(detail||'')});
    if(diagnostics.length>maxDiagnostics) diagnostics.length=maxDiagnostics;
    diagnosticsRevision++;
  }
  function onError(event){
    record('error',event&&event.message||'Uncaught editor error',event&&event.filename?event.filename+':'+(event.lineno||0):'');
  }
  function onRejection(event){
    const reason=event&&event.reason;
    record('error','Unhandled promise rejection',reason&&reason.message||reason||'Unknown rejection');
  }
  window.addEventListener('error',onError);
  window.addEventListener('unhandledrejection',onRejection);
  function onGpuDiagnostic(event){
    const detail=event&&event.detail||{};
    const count=Number(detail.count)||1;
    if(count===1||count===10||count===100||count===1000){
      record('error','WebGPU ×'+count,detail.sample||detail.signature||'GPU validation error');
    }
    clearTimeout(gpuLogTimer);
    gpuLogTimer=setTimeout(()=>writeShortLog(true),700);
  }
  window.addEventListener('lotking:gpu-diagnostic',onGpuDiagnostic);
  const initialGpuDiagnostics=window.LK_RUNTIME_RENDERING_BACKEND&&window.LK_RUNTIME_RENDERING_BACKEND.gpuDiagnostics
    ? window.LK_RUNTIME_RENDERING_BACKEND.gpuDiagnostics():null;
  if(initialGpuDiagnostics&&initialGpuDiagnostics.total){
    (initialGpuDiagnostics.groups||[]).slice(0,12).forEach(item=>record('error','WebGPU ×'+item.count,item.sample||item.signature));
    gpuLogTimer=setTimeout(()=>writeShortLog(true),700);
  }
  let longTaskObserver=null;
  if(typeof PerformanceObserver==='function'){
    try {
      longTaskObserver=new PerformanceObserver(list=>list.getEntries().forEach(entry=>{
        if(entry.duration>=50) record('long task','Main-thread long task',entry.duration.toFixed(1)+' ms');
      }));
      longTaskObserver.observe({entryTypes:['longtask']});
    } catch(err){}
  }

  function frame(time){
    if(disposed) return;
    if(lastFrame){
      const delta=Math.min(1000,time-lastFrame);
      samples.push(delta);
      // Trimming in batches avoids shifting a full telemetry array on every
      // frame forever once the buffer reaches capacity.
      if(samples.length>maxSamples+60) samples.splice(0,samples.length-maxSamples);
      if(delta>=50&&document.visibilityState==='visible'){
        stutterCount++;
        record('stutter','Frame hitch',delta.toFixed(1)+' ms · '+Math.max(1,Math.round(1000/delta))+' FPS');
      }
    }
    lastFrame=time;
    if(open&&time-lastUi>250){ updateMetrics(); drawChart(); renderEvents(); lastUi=time; }
    // Deep resource audits are editor authoring work. In Play/Simulate the last
    // completed snapshot remains visible and only realtime frame telemetry runs.
    if(open&&!auditPending&&reportMode()==='editor'&&time-lastAudit>30000) scheduleAuditScene();
    if(open&&!shortLogPending&&time-lastShortLog>5000) writeShortLog();
    raf=requestAnimationFrame(frame);
  }
  raf=requestAnimationFrame(frame);

  function rendererStats(){
    const info=renderer.info||{};
    const render=info.render||{},memory=info.memory||{};
    return {
      calls:Number(render.calls)||0,triangles:Number(render.triangles)||0,
      points:Number(render.points)||0,lines:Number(render.lines)||0,
      geometries:Number(memory.geometries)||0,textures:Number(memory.textures)||0,
      programs:Array.isArray(info.programs)?info.programs.length:0,
    };
  }
  function gpuDetails(){
    const backend=window.LK_RUNTIME_RENDERING_BACKEND;if(backend&&backend.describe){const report=backend.describe(renderer);return {renderer:report.gpu,vendor:report.vendor,maxTextureSize:report.maxTextureSize,maxSamples:report.maxSamples,webgl:report.effective.toUpperCase(),backend:report};}
    const gl=renderer.getContext&&renderer.getContext();
    const result={renderer:'Unavailable',vendor:'Unavailable',maxTextureSize:0,maxSamples:0,webgl:renderer.capabilities&&renderer.capabilities.isWebGL2?'WebGL 2':'WebGL 1'};
    try {
      const ext=gl.getExtension('WEBGL_debug_renderer_info');
      result.renderer=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
      result.vendor=ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR);
      result.maxTextureSize=Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||0;
      result.maxSamples=Number(gl.getParameter(gl.MAX_SAMPLES))||0;
    } catch(err){}
    return result;
  }
  function computeFrames(){
    if(!samples.length) return;
    const recent=samples.slice(-120);
    frameAverage=recent.reduce((sum,value)=>sum+value,0)/recent.length;
    const sorted=recent.slice().sort((a,b)=>a-b);
    frameP95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))]||0;
    maxFrame=Math.max.apply(Math,recent);
    fps=frameAverage>0?1000/frameAverage:0;
  }
  function metric(label,value,state){
    return '<div class="lk-dbg-metric '+(state||'')+'"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(value)+'</strong></div>';
  }
  function bar(label,value,display){
    const pct=clamp(Number(value)||0,0,200);
    return '<div class="lk-dbg-bar"><label><span>'+escapeHtml(label)+'</span><b>'+escapeHtml(display==null?Math.round(pct)+'%':display)+'</b></label><div class="lk-dbg-bar-track"><i style="width:'+Math.min(100,pct)+'%"></i></div></div>';
  }
  function updateMetrics(){
    computeFrames();
    const rs=rendererStats();
    const memory=performance.memory;
    const heapPct=memory&&memory.jsHeapSizeLimit?memory.usedJSHeapSize/memory.jsHeapSizeLimit*100:0;
    const state=frameP95>50?'bad':(frameP95>25?'warn':'');
    summary.innerHTML=
      metric('FPS',fps.toFixed(1),state)+metric('FRAME AVG',frameAverage.toFixed(1)+' ms',state)+
      metric('FRAME P95',frameP95.toFixed(1)+' ms',state)+metric('WORST / 2s',maxFrame.toFixed(1)+' ms',maxFrame>50?'bad':'')+
      metric('DRAW CALLS',number(rs.calls),rs.calls>1000?'warn':'')+metric('TRIANGLES',number(rs.triangles),rs.triangles>2000000?'warn':'')+
      metric('PARTICLES LIVE',number(sceneStats.liveParticles),sceneStats.liveParticles>50000?'warn':'')+
      metric('PARTICLE SYSTEMS',number(sceneStats.particleSystems),sceneStats.particleSystems>80?'warn':'');
    saturation.innerHTML=
      bar('16.67 ms frame budget',frameAverage/16.67*100)+bar('Draw-call budget',rs.calls/1000*100,number(rs.calls)+' / 1,000')+
      bar('Triangle budget',rs.triangles/2000000*100,number(rs.triangles)+' / 2M')+
      bar('Particle budget',sceneStats.liveParticles/100000*100,number(sceneStats.liveParticles)+' / 100K')+
      bar('JS heap',heapPct,memory?bytes(memory.usedJSHeapSize)+' / '+bytes(memory.jsHeapSizeLimit):'Unavailable');
    frameLabel.textContent=Math.round(fps)+' FPS · '+stutterCount+' hitches';
    mode.textContent=ED&&ED.playPreview?'PLAY PREVIEW':(ED&&ED.simulatePreview?'SIMULATE':'EDITOR');
    panel.dataset.deepAudit=reportMode()==='editor'?(auditPending?'running':'idle'):'paused';
    const errors=diagnostics.filter(item=>item.kind==='error').length;
    health.className='lk-dbg-health '+(errors?'bad':(frameP95>32?'warn':''));
    health.textContent=errors?errors+' ERRORS':(frameP95>32?'FRAME PRESSURE':'HEALTHY');
    eventCount.textContent=diagnostics.length+' captured';
  }

  function drawChart(){
    if(!chart) return;
    const rect=chart.getBoundingClientRect();
    const dpr=Math.min(devicePixelRatio||1,2),width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));
    if(chart.width!==width||chart.height!==height){ chart.width=width; chart.height=height; }
    const ctx=chart.getContext('2d');
    ctx.clearRect(0,0,width,height);
    const scale=dpr,maxMs=66.67;
    ctx.lineWidth=1*scale;ctx.font=(11*scale)+'px monospace';
    [16.67,33.33,50].forEach(ms=>{
      const y=height-ms/maxMs*height;
      ctx.strokeStyle=ms<20?'rgba(75,227,160,.22)':(ms<40?'rgba(255,209,102,.18)':'rgba(239,71,111,.2)');
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();
      ctx.fillStyle='rgba(170,184,204,.62)';ctx.fillText(ms.toFixed(0)+'ms',4*scale,y-3*scale);
    });
    if(samples.length<2) return;
    const shown=samples.slice(-Math.max(2,Math.floor(rect.width/2)));
    ctx.strokeStyle='#66d9ff';ctx.lineWidth=1.35*scale;ctx.beginPath();
    shown.forEach((ms,index)=>{
      const x=index/Math.max(1,shown.length-1)*width;
      const y=height-clamp(ms,0,maxMs)/maxMs*height;
      if(index===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
  }

  function hardwareRows(){
    const gpu=gpuDetails();
    const rs=rendererStats();
    const memory=performance.memory;
    const values=[
      ['GPU',gpu.renderer],['CPU logical cores',navigator.hardwareConcurrency||'Unavailable'],
      ['Device memory',navigator.deviceMemory?navigator.deviceMemory+' GB':'Unavailable'],
      ['Viewport',renderer.domElement.width+' × '+renderer.domElement.height],['Pixel ratio',(renderer.getPixelRatio?renderer.getPixelRatio():devicePixelRatio||1).toFixed(2)],
      ['WebGL',gpu.webgl],['Max texture',gpu.maxTextureSize?number(gpu.maxTextureSize)+' px':'—'],['MSAA samples',String(gpu.maxSamples)],
      ['GPU geometries',number(rs.geometries)],['GPU textures',number(rs.textures)],['Shader programs',number(rs.programs)],
      ['Rendered points',number(rs.points)],['Rendered lines',number(rs.lines)],
      ['Scene objects',number(sceneStats.objects)],['Meshes / lights',number(sceneStats.meshes)+' / '+number(sceneStats.lights)],
      ['Particle systems',number(sceneStats.particleSystems)],['Particle pool / live',number(sceneStats.particleCapacity)+' / '+number(sceneStats.liveParticles)],
      ['Sprites visible / total',number(sceneStats.visibleSprites)+' / '+number(sceneStats.sprites)],
      ['Shadow casters',number(sceneStats.shadowCasters)],['Transparent materials',number(sceneStats.transparentMaterials)],
      ['JS heap',memory?bytes(memory.usedJSHeapSize):'Unavailable'],
    ];
    hardware.innerHTML=values.map(item=>'<div><span>'+escapeHtml(item[0])+'</span><b title="'+escapeHtml(item[1])+'">'+escapeHtml(item[1])+'</b></div>').join('');
  }

  function geometryBytes(geometry){
    if(!geometry||!geometry.attributes) return 0;
    let total=0;
    Object.keys(geometry.attributes).forEach(key=>{ const attr=geometry.attributes[key]; if(attr&&attr.array) total+=attr.array.byteLength||0; });
    if(geometry.index&&geometry.index.array) total+=geometry.index.array.byteLength||0;
    return total;
  }
  function textureInfo(texture){
    const image=texture&&texture.image;
    const width=Number(image&&image.videoWidth||image&&image.naturalWidth||image&&image.width)||0;
    const height=Number(image&&image.videoHeight||image&&image.naturalHeight||image&&image.height)||0;
    return {width,height,bytes:width*height*4*(texture&&texture.generateMipmaps===false?1:1.333)};
  }
  function collectTextures(material,set){
    if(!material) return;
    const list=Array.isArray(material)?material:[material];
    list.forEach(mat=>Object.keys(mat||{}).forEach(key=>{ const value=mat[key]; if(value&&value.isTexture) set.add(value); }));
  }
  function beginElementAnalysis(object){
    const bounds=auditBounds&&THREERef&&THREERef.Box3?new THREERef.Box3().makeEmpty():null;
    return {
      object,stack:[object],geometries:new Set(),textures:new Set(),materials:new Set(),bounds,hasBounds:false,
      meshes:0,lights:0,triangles:0,vertices:0,audioSeconds:0,videoSeconds:0,
      points:0,sprites:0,visibleSprites:0,shadowCasters:0,
    };
  }
  function visitElementNode(state,node){
    if(!node) return;
    if(node.isMesh||node.isLine||node.isPoints){
      if(node.isMesh) state.meshes++;
      if(node.geometry){
        state.geometries.add(node.geometry);
        const position=node.geometry.attributes&&node.geometry.attributes.position;
        const count=node.geometry.index?node.geometry.index.count:(position&&position.count||0);
        state.vertices+=position&&position.count||0;
        if(node.isMesh) state.triangles+=Math.floor(count/3);
        if(node.isPoints) state.points+=position&&position.count||0;
        // Never call Box3.setFromObject during telemetry: it recursively walks
        // the same subtree and may synchronously scan hundreds of thousands of
        // vertices. Reuse already-authored geometry bounds one node at a time.
        const geometryBounds=node.geometry.boundingBox;
        if(state.bounds&&auditNodeBounds&&geometryBounds&&node.matrixWorld){
          auditNodeBounds.copy(geometryBounds).applyMatrix4(node.matrixWorld);
          state.bounds.union(auditNodeBounds);state.hasBounds=true;
        }
      }
      const mats=Array.isArray(node.material)?node.material:[node.material];
      mats.filter(Boolean).forEach(mat=>state.materials.add(mat));
      collectTextures(node.material,state.textures);
    }
    if(node.isSprite){ state.sprites++;if(effectivelyVisible(node)) state.visibleSprites++; }
    if(node.isLight) state.lights++;
    if(node.castShadow) state.shadowCasters++;
    const media=node.userData&&node.userData.mediaElement;
    if(media&&Number.isFinite(media.duration)){
      if(String(media.tagName).toLowerCase()==='video') state.videoSeconds+=media.duration;
      else state.audioSeconds+=media.duration;
    }
    const children=Array.isArray(node.children)?node.children:[];
    for(let index=children.length-1;index>=0;index--) state.stack.push(children[index]);
  }
  function finishElementAnalysis(state){
    const object=state.object||{};
    let geoBytes=0,textureBytes=0,maxResolution='—',maxResolutionPixels=0;
    state.geometries.forEach(geometry=>{ geoBytes+=geometryBytes(geometry); });
    state.textures.forEach(texture=>{
      const info=textureInfo(texture);textureBytes+=info.bytes;
      if(info.width&&info.height&&info.width*info.height>maxResolutionPixels){
        maxResolutionPixels=info.width*info.height;maxResolution=info.width+'×'+info.height;
      }
      const image=texture&&texture.image;
      if(image&&Number.isFinite(image.duration)){
        if(String(image.tagName).toLowerCase()==='video') state.videoSeconds+=image.duration;
        else state.audioSeconds+=image.duration;
      }
    });
    const data=object.userData||{};
    const type=data.editorType||data.type||object.type||'Object';
    const effectParams=data.effectParams;
    const rainInstances=object.name==='LK_GPU_Rain'&&object.geometry?Number(object.geometry.instanceCount)||0:0;
    const particleCapacity=rainInstances||((effectParams||data.particleSystem)?Math.max(state.points,state.sprites,1):state.points);
    const particleSystems=(effectParams||data.particleSystem||rainInstances||state.points)?1:0;
    const transparentMaterials=Array.from(state.materials).filter(mat=>mat.transparent===true||Number(mat.opacity)<1).length;
    const detail=[];
    if(state.vertices) detail.push(number(state.vertices)+' verts');
    if(state.materials.size) detail.push(state.materials.size+' mat');
    if(state.lights) detail.push(state.lights+' lights');
    if(particleSystems) detail.push(number(particleCapacity)+' particles');
    if(effectParams){
      if(effectParams.kind) detail.push(String(effectParams.kind)+' emitter');
      if(Number.isFinite(Number(effectParams.rate))) detail.push(number(effectParams.rate)+'/s');
      if(Number.isFinite(Number(effectParams.life))) detail.push(Number(effectParams.life).toFixed(2)+'s life');
    }
    if(data.editorType==='playerEffect'||data.editorType==='playerSkid') detail.push('particle source');
    if(state.shadowCasters) detail.push(state.shadowCasters+' shadow casters');
    if(transparentMaterials) detail.push(transparentMaterials+' transparent mat');
    if(state.hasBounds&&state.bounds&&auditSize){
      const size=state.bounds.getSize(auditSize);
      if(Number.isFinite(size.x)&&Number.isFinite(size.y)&&Number.isFinite(size.z)&&size.length()>0){
        detail.push(size.x.toFixed(1)+'×'+size.y.toFixed(1)+'×'+size.z.toFixed(1)+' m');
      }
    }
    if(maxResolution!=='—') detail.push('max '+maxResolution);
    if(state.audioSeconds) detail.push('audio '+state.audioSeconds.toFixed(1)+'s');
    if(state.videoSeconds) detail.push('video '+state.videoSeconds.toFixed(1)+'s');
    if(data.logicGraph&&Array.isArray(data.logicGraph.nodes)) detail.push(data.logicGraph.nodes.length+' nodes');
    const sourceBytes=Number(data.fileSize||data.sourceSize||data.addedEntry&&data.addedEntry.size)||0;
    if(sourceBytes) detail.push('source '+bytes(sourceBytes));
    return {
      object,name:data.editorName||object.name||'(unnamed)',type,geoBytes,textureBytes,triangles:state.triangles,
      meshes:state.meshes,lights:state.lights,points:state.points,sprites:state.sprites,visibleSprites:state.visibleSprites,
      particleSystems,particleCapacity,shadowCasters:state.shadowCasters,transparentMaterials,
      detail:detail.join(' · '),total:Math.max(sourceBytes,geoBytes+textureBytes),
    };
  }
  function sceneElements(){
    const registry=GAME&&GAME.world&&Array.isArray(GAME.world.registry)?GAME.world.registry:[];
    const seen=new Set(),result=[];
    registry.forEach(object=>{
      if(!object||seen.has(object)||object.userData&&object.userData.editorHelper) return;
      seen.add(object);result.push(object);
    });
    scene.children.forEach(object=>{
      if(!object||seen.has(object)||object.userData&&object.userData.editorHelper) return;
      if(object.userData&&(object.userData.editorId||object.userData.editorType)){ seen.add(object);result.push(object); }
    });
    return result;
  }
  function beginSceneStatsScan(){
    return {
      stack:[{node:scene,effectSystem:null}],
      stats:{objects:0,meshes:0,lights:0,particleSystems:0,particleCapacity:0,liveParticles:0,sprites:0,visibleSprites:0,shadowCasters:0,transparentMaterials:0},
      systems:new Set(),transparentMaterials:new Set(),
    };
  }
  function visitSceneStatsNode(scan,entry){
    const node=entry&&entry.node;
    if(!node) return;
    const stats=scan.stats,data=node.userData||{};
    stats.objects++;
    if(node.isMesh) stats.meshes++;
    if(node.isLight) stats.lights++;
    if(node.castShadow) stats.shadowCasters++;
    const mats=Array.isArray(node.material)?node.material:[node.material];
    mats.filter(mat=>mat&&(mat.transparent===true||Number(mat.opacity)<1)).forEach(mat=>scan.transparentMaterials.add(mat));
    if(node.isSprite){ stats.sprites++;if(effectivelyVisible(node)) stats.visibleSprites++; }

    let effectSystem=entry.effectSystem;
    if(data.effectParams) effectSystem='emitter-'+(node.uuid||stats.objects);
    let systemKey=data.particleSystem||data.logicVehicleEffect&&'logic-vehicle-effects'||effectSystem||null;
    let capacity=0,live=0;
    if(node.name==='LK_GPU_Rain'&&node.geometry){
      systemKey='environment-rain';capacity=Number(node.geometry.instanceCount)||0;live=effectivelyVisible(node)?capacity:0;
    } else if(node.isPoints){
      const position=node.geometry&&node.geometry.attributes&&node.geometry.attributes.position;
      capacity=position&&position.count||0;live=effectivelyVisible(node)?capacity:0;
      systemKey=systemKey||('points-'+(node.uuid||stats.objects));
    } else if(systemKey&&node.isSprite){
      capacity=1;live=effectivelyVisible(node)?1:0;
    }
    if(systemKey){
      scan.systems.add(systemKey);stats.particleCapacity+=capacity;stats.liveParticles+=live;
    }
    const children=Array.isArray(node.children)?node.children:[];
    for(let index=children.length-1;index>=0;index--) scan.stack.push({node:children[index],effectSystem});
  }
  function finishSceneStatsScan(scan){
    scan.stats.particleSystems=scan.systems.size;
    scan.stats.transparentMaterials=scan.transparentMaterials.size;
    return scan.stats;
  }
  function plainInventoryItem(item,index){
    const object=item&&item.object,data=object&&object.userData||{};
    return {
      token:object&&object.uuid||data.editorId||('audit-'+index),
      name:item.name,type:item.type,total:item.total,geoBytes:item.geoBytes,textureBytes:item.textureBytes,
      triangles:item.triangles,meshes:item.meshes,lights:item.lights,points:item.points,sprites:item.sprites,
      visibleSprites:item.visibleSprites,particleSystems:item.particleSystems,particleCapacity:item.particleCapacity,
      shadowCasters:item.shadowCasters,transparentMaterials:item.transparentMaterials,detail:item.detail,
      id:data.editorId||null,uuid:object&&object.uuid||null,
    };
  }
  function aggregateLocally(items){
    const sorted=items.slice().sort((a,b)=>b.total-a.total||b.triangles-a.triangles);
    const totals=sorted.reduce((out,item)=>{
      out.geometryBytes+=Number(item.geoBytes)||0;out.textureBytes+=Number(item.textureBytes)||0;out.triangles+=Number(item.triangles)||0;return out;
    },{geometryBytes:0,textureBytes:0,triangles:0});
    return {items:sorted,totals};
  }
  function finishAudit(nextInventory,nextSceneStats,generation){
    const objectByToken=new Map(),plain=(nextInventory||[]).map((item,index)=>{
      const value=plainInventoryItem(item,index);objectByToken.set(value.token,item.object);return value;
    });
    return runWorkerTask('aggregate',{items:plain}).catch(()=>aggregateLocally(plain)).then(result=>{
      if(generation!==auditGeneration) return false;
      inventory=(result.items||[]).map(item=>Object.assign({},item,{object:objectByToken.get(item.token)||null}));
      sceneStats=nextSceneStats||sceneStats;
      cleanInventoryCache=inventory.map(item=>({
        id:item.id,uuid:item.uuid,name:item.name,type:item.type,residentBytes:item.total,
        geometryBytes:item.geoBytes,textureBytes:item.textureBytes,triangles:item.triangles,meshes:item.meshes,
        lights:item.lights,points:item.points,sprites:item.sprites,particleSystems:item.particleSystems,
        particleCapacity:item.particleCapacity,shadowCasters:item.shadowCasters,
        transparentMaterials:item.transparentMaterials,details:item.detail,
      }));
      const totals=result.totals||{geometryBytes:0,textureBytes:0,triangles:0};
      sceneTotal.textContent=inventory.length+' elements · '+bytes(totals.geometryBytes+totals.textureBytes)+' resident estimate · '+number(totals.triangles)+' tris · '+number(sceneStats.particleSystems)+' particle systems';
      const selected=ED&&ED.selected;
      const markup=inventory.length?inventory.map((item,index)=>
        '<tr role="button" tabindex="0" data-debug-index="'+index+'" class="'+(item.object===selected?'selected':'')+'" title="Select and focus '+escapeHtml(item.name)+'"><td title="'+escapeHtml(item.name)+'">'+escapeHtml(item.name)+'</td><td>'+escapeHtml(item.type)+'</td><td>'+bytes(item.geoBytes)+'</td><td>'+bytes(item.textureBytes)+'</td><td>'+number(item.triangles)+' tris</td><td title="'+escapeHtml(item.detail)+'">'+escapeHtml(item.detail||'—')+'</td></tr>'
      ).join(''):'<tr><td colspan="6" class="lk-dbg-empty">No authored scene elements detected.</td></tr>';
      if(markup!==renderedInventoryMarkup){ rows.innerHTML=markup;renderedInventoryMarkup=markup; }
      hardwareRows();
      return true;
    }).finally(()=>{ if(generation===auditGeneration) auditPending=false; });
  }
  function scheduleAuditScene(){
    if(auditPending||!open) return false;
    auditPending=true;
    const generation=++auditGeneration;
    const startedMode=reportMode();
    lastAudit=performance.now();
    const elements=sceneElements(),nextInventory=[];
    let elementIndex=0,currentElement=null,sceneScan=null,phase='elements';
    // Neither requestIdleCallback (starved by a continuously-rendering editor)
    // nor requestAnimationFrame (very slow under a saturated GPU) is a reliable
    // scheduler here. Short timer tasks keep progressing independently of FPS
    // and yield back to input/rendering between every strictly-budgeted slice.
    const schedule=callback=>setTimeout(()=>callback(null),0);
    const step=deadline=>{
      if(!open||generation!==auditGeneration||(startedMode==='editor'&&reportMode()!=='editor')){
        if(generation===auditGeneration) auditPending=false;
        return;
      }
      const started=performance.now();
      let processed=0;
      try {
        while(processed<24&&performance.now()-started<1.75){
          if(phase==='elements'){
            if(!currentElement){
              if(elementIndex>=elements.length){ phase='scene';sceneScan=beginSceneStatsScan();continue; }
              currentElement=beginElementAnalysis(elements[elementIndex++]);
            }
            const node=currentElement.stack.pop();
            if(node) visitElementNode(currentElement,node);
            processed++;
            if(!currentElement.stack.length){
              nextInventory.push(finishElementAnalysis(currentElement));currentElement=null;
            }
          } else {
            const entry=sceneScan.stack.pop();
            if(entry) visitSceneStatsNode(sceneScan,entry);
            processed++;
            if(!sceneScan.stack.length){
              const nextSceneStats=finishSceneStatsScan(sceneScan);
              finishAudit(nextInventory,nextSceneStats,generation);
              return;
            }
          }
          if(processed&&deadline&&typeof deadline.timeRemaining==='function'&&deadline.timeRemaining()<1) break;
        }
      } catch(error){
        auditPending=false;record('error','Developer audit failed',error&&error.message||error);return;
      }
      schedule(step);
    };
    schedule(step);
    return true;
  }

  function revealInOutliner(object){
    const id=object&&object.userData&&object.userData.editorId;
    if(!id) return;
    requestAnimationFrame(()=>{
      const outliner=document.getElementById('lkOutliner');
      if(!outliner) return;
      const escaped=window.CSS&&CSS.escape?CSS.escape(id):String(id).replace(/["\\]/g,'\\$&');
      const row=outliner.querySelector('.lk-item[data-id="'+escaped+'"]');
      if(row) row.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
    });
  }
  function activateInventoryRow(row){
    const item=inventory[Number(row&&row.dataset.debugIndex)];
    if(!item||!item.object) return;
    if(selectObject) selectObject(item.object,{reveal:true});
    revealInOutliner(item.object);
    rows.querySelectorAll('tr.selected').forEach(other=>other.classList.remove('selected'));
    row.classList.add('selected');
    if(focusSelected&&item.object.isObject3D&&item.object.parent&&!(ED&&ED.playPreview)&&!(ED&&ED.simulatePreview)) requestAnimationFrame(()=>focusSelected());
  }

  function renderEvents(force){
    if(!force&&renderedDiagnosticsRevision===diagnosticsRevision) return;
    renderedDiagnosticsRevision=diagnosticsRevision;
    eventsBox.innerHTML=diagnostics.length?diagnostics.slice(0,60).map(item=>
      '<div class="lk-dbg-event '+(item.kind==='error'?'error':'')+'"><time>'+escapeHtml(item.time)+'</time><b>'+escapeHtml(item.kind.toUpperCase())+'</b><span>'+escapeHtml(item.message)+(item.detail?' · '+escapeHtml(item.detail):'')+'</span></div>'
    ).join(''):'<div class="lk-dbg-empty">No errors, long tasks or frame hitches captured.</div>';
  }
  function cleanInventory(){
    return cleanInventoryCache.slice();
  }
  function reportMode(){ return ED&&ED.playPreview?'play-preview':(ED&&ED.simulatePreview?'simulate':'editor'); }
  function projectContext(){
    return {
      title:document.title,
      url:location.href,
      activeLevel:GAME&&GAME.state&&GAME.state.activeLevel||null,
    };
  }
  function fullReport(){
    computeFrames();
    const rs=rendererStats(),gpu=gpuDetails(),memory=performance.memory;
    return {
      schema:'lotking.developer-performance.v1',generatedAt:new Date().toISOString(),version:GAME&&GAME.version||'0.7.8',mode:reportMode(),
      project:projectContext(),
      performance:{fps,frameAverageMs:frameAverage,frameP95Ms:frameP95,worstRecentFrameMs:maxFrame,stutterCount,sampleCount:samples.length,frameSamplesMs:samples.slice()},
      renderer:Object.assign({},rs,{pixelRatio:renderer.getPixelRatio?renderer.getPixelRatio():devicePixelRatio||1,width:renderer.domElement.width,height:renderer.domElement.height}),
      hardware:{gpu:gpu.renderer,gpuVendor:gpu.vendor,webgl:gpu.webgl,renderBackend:gpu.backend||null,maxTextureSize:gpu.maxTextureSize,maxSamples:gpu.maxSamples,logicalCores:navigator.hardwareConcurrency||null,deviceMemoryGb:navigator.deviceMemory||null,userAgent:navigator.userAgent,jsHeap:memory?{usedBytes:memory.usedJSHeapSize,totalBytes:memory.totalJSHeapSize,limitBytes:memory.jsHeapSizeLimit}:null},
      gpuDiagnostics:window.LK_RUNTIME_RENDERING_BACKEND&&window.LK_RUNTIME_RENDERING_BACKEND.gpuDiagnostics?window.LK_RUNTIME_RENDERING_BACKEND.gpuDiagnostics():null,
      scene:Object.assign({authoredElements:inventory.length},sceneStats),
      diagnostics:diagnostics.slice(),
      elements:cleanInventory(),
    };
  }
  function briefReport(){
    const report=fullReport();
    return {
      schema:report.schema,generatedAt:report.generatedAt,version:report.version,mode:report.mode,project:report.project,
      performance:Object.assign({},report.performance,{frameSamplesMs:undefined}),renderer:report.renderer,scene:report.scene,
      diagnostics:report.diagnostics.slice(0,12),heaviestElements:report.elements.slice(0,12),
    };
  }
  function setAutoLogState(state,label){
    if(!autoLog) return;
    autoLog.className='lk-dbg-auto-log '+state;
    autoLog.textContent=label;
  }
  function writeShortLog(force){
    if(shortLogPending||(!force&&performance.now()-lastShortLog<5000)) return Promise.resolve(false);
    shortLogPending=true;
    if(panel.dataset.autoLogPhase!=='saved') setAutoLogState('','AUTO LOG…');
    panel.dataset.autoLogPhase='worker';
    const report=briefReport();
    const fallback=()=>fetch(shortLogUrl,{method:'PUT',headers:{'Content-Type':'application/json'},cache:'no-store',body:JSON.stringify(report)})
      .then(response=>{ if(!response.ok) throw new Error('HTTP '+response.status);return response.json(); });
    return runWorkerTask('write-log',{url:shortLogUrl,report}).catch(()=>{
      panel.dataset.autoLogPhase='fallback';return fallback();
    })
      .then(result=>{ panel.dataset.autoLogPhase='saved';setAutoLogState('saved','AUTO LOG · SAVED');if(autoLog) autoLog.title=result.file||'.lotking-local/developer-performance-latest.md';return true; })
      .catch(()=>{ panel.dataset.autoLogPhase='unavailable';setAutoLogState('unavailable','AUTO LOG · LOCAL ONLY');return false; })
      .finally(()=>{ shortLogPending=false;lastShortLog=performance.now(); });
  }
  function exportFullReport(){
    refreshIncremental();
    const report=fullReport();
    runWorkerTask('stringify',{value:report,pretty:true}).then(result=>result.text)
      .catch(()=>JSON.stringify(report,null,2))
      .then(payload=>{
        const blob=new Blob([payload],{type:'application/json'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
        anchor.href=url;anchor.download='lotking-performance-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
        document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      });
    writeShortLog(true);
  }
  function refresh(){ hardwareRows();updateMetrics();drawChart();renderEvents(true);scheduleAuditScene(); }
  function refreshIncremental(){
    hardwareRows();updateMetrics();drawChart();renderEvents(true);
    scheduleAuditScene();
  }
  function setOpen(value){
    open=value!==false;
    panel.classList.toggle('open',open);panel.setAttribute('aria-hidden',open?'false':'true');
    const toggle=root.querySelector('#lkDevToolsToggle');if(toggle) toggle.classList.toggle('on',open);
    if(open){
      // Worker startup is non-blocking and must not depend on the next render
      // frame, which can be delayed by a hidden/minimized editor window.
      ensureTelemetryWorker();
      requestAnimationFrame(()=>{
      hardwareRows();updateMetrics();drawChart();renderEvents(true);
      if(reportMode()==='editor') scheduleAuditScene();
      else if(!inventory.length) sceneTotal.textContent='Deep scene audit paused during Play · use Refresh for an incremental snapshot';
      writeShortLog(true);
      });
    } else {
      auditGeneration++;auditPending=false;
    }
  }
  function clear(){ diagnostics.length=0;diagnosticsRevision++;stutterCount=0;samples.length=0;renderEvents(true);updateMetrics();drawChart(); }

  function dispose(){
    if(disposed) return false;
    disposed=true;
    cancelAnimationFrame(raf);
    clearTimeout(gpuLogTimer);
    if(longTaskObserver){ try { longTaskObserver.disconnect(); } catch(error){} longTaskObserver=null; }
    window.removeEventListener('error',onError);
    window.removeEventListener('unhandledrejection',onRejection);
    window.removeEventListener('lotking:gpu-diagnostic',onGpuDiagnostic);
    window.removeEventListener('lotking:runtime-dispose',dispose);
    workerJobs.forEach(job=>clearTimeout(job.timer));
    workerJobs.clear();
    if(telemetryWorker){ try { telemetryWorker.terminate(); } catch(error){} telemetryWorker=null; }
    return true;
  }
  window.addEventListener('lotking:runtime-dispose',dispose,{once:true});

  $('#lkDbgClose').addEventListener('click',()=>setOpen(false));
  $('#lkDbgClear').addEventListener('click',clear);
  $('#lkDbgRefresh').addEventListener('click',refreshIncremental);
  $('#lkDbgExport').addEventListener('click',exportFullReport);
  rows.addEventListener('click',event=>{ const row=event.target.closest('tr[data-debug-index]');if(row) activateInventoryRow(row); });
  rows.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ') return;
    const row=event.target.closest('tr[data-debug-index]');
    if(row){ event.preventDefault();activateInventoryRow(row); }
  });
  panel.addEventListener('pointerdown',event=>event.stopPropagation());
  panel.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
  const header=$('#lkDeveloperDebuggerHeader');
  header.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button')) return;
    const rect=panel.getBoundingClientRect(),dx=event.clientX-rect.left,dy=event.clientY-rect.top;
    header.setPointerCapture(event.pointerId);
    const move=moveEvent=>{
      panel.style.left=clamp(moveEvent.clientX-dx,4,innerWidth-panel.offsetWidth-4)+'px';
      panel.style.top=clamp(moveEvent.clientY-dy,4,innerHeight-panel.offsetHeight-4)+'px';
      panel.style.right='auto';
    };
    const up=()=>{ header.removeEventListener('pointermove',move);header.removeEventListener('pointerup',up);header.removeEventListener('pointercancel',up); };
    header.addEventListener('pointermove',move);header.addEventListener('pointerup',up);header.addEventListener('pointercancel',up);
  });

  return Object.freeze({open:()=>setOpen(true),close:()=>setOpen(false),toggle:()=>setOpen(!open),refresh,isOpen:()=>open,record,dispose});
}

window.LK_EDITOR_DEVELOPER_DEBUGGER=Object.freeze({create});
})();
