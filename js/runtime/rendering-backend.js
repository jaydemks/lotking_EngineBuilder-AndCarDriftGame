/* =========================================================
   LOT KING — rendering backend policy and GPU capabilities
   One report shared by runtime, editor, previews and exports.
   ========================================================= */
(function(){
'use strict';

const PREF_KEY='lotking.renderBackend.v1';
const ADAPTER_SESSION_KEY='lotking.webgpu.adapter.v1';
const GPU_DIAGNOSTICS_KEY='lotking.webgpu.diagnostics.v1';
const GPU_QUARANTINE_KEY='lotking.webgpu.quarantine.v1';
const VALID=new Set(['auto','webgpu','webgl']);
const registry=new Set();
const warmups=new WeakMap();
const compileQueues=new WeakMap();
const initializations=new WeakMap();
const WEBGPU_MIGRATION_BLOCKERS=Object.freeze([
  Object.freeze({id:'legacy-shaders',label:'GLSL ShaderMaterial/RawShaderMaterial effects must move to TSL'}),
  Object.freeze({id:'material-patches',label:'onBeforeCompile material and snow-trail patches must move to node materials'}),
  Object.freeze({id:'legacy-post',label:'EffectComposer, GTAO, SSR, DoF, grading and lens-flare passes need the WebGPU node post stack'}),
  Object.freeze({id:'webgl-render-targets',label:'Path tracing, cinema export and WebGLRenderTarget utilities need backend-neutral paths'}),
  Object.freeze({id:'mobile-qualification',label:'Real Android and iOS device coverage has not reached release-gate parity'}),
]);
let sessionState={renderScale:1};
let asyncReport=null;
const gpuDiagnosticGroups=new Map();
let gpuDiagnosticTotal=0,gpuDiagnosticStartedAt=0,gpuStormPublished=false;

function normalize(value){const key=String(value||'auto').toLowerCase();return VALID.has(key)?key:'auto';}
function preference(){try{return normalize(localStorage.getItem(PREF_KEY));}catch(err){return 'auto';}}
function setPreference(value){
  const next=normalize(value);
  try{
    localStorage.setItem(PREF_KEY,next);
    // An explicit selection is a deliberate retry after code/driver changes.
    // Automatic storm recovery never calls setPreference, so quarantine still
    // protects the immediate reload without permanently taking WebGPU away.
    sessionStorage.removeItem(GPU_QUARANTINE_KEY);
    sessionStorage.removeItem(GPU_DIAGNOSTICS_KEY);
  }catch(err){}
  gpuDiagnosticGroups.clear();gpuDiagnosticTotal=0;gpuDiagnosticStartedAt=0;gpuStormPublished=false;
  return next;
}
function gpuQuarantined(){try{return !!sessionStorage.getItem(GPU_QUARANTINE_KEY);}catch(err){return false;}}
function gpuDiagnosticSignature(message){
  return String(message||'WebGPU validation error').split('\n')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/ig,'<uuid>')
    .replace(/\b0x[0-9a-f]+\b/ig,'<hex>')
    .replace(/\b\d+\b/g,'#').slice(0,320);
}
function persistGpuDiagnostics(){
  try{sessionStorage.setItem(GPU_DIAGNOSTICS_KEY,JSON.stringify(gpuDiagnostics()));}catch(err){}
}
function gpuDiagnostics(){
  const groups=Array.from(gpuDiagnosticGroups.values()).sort((a,b)=>b.count-a.count).slice(0,32);
  if(groups.length)return {total:gpuDiagnosticTotal,quarantined:gpuQuarantined(),groups};
  try{return JSON.parse(sessionStorage.getItem(GPU_DIAGNOSTICS_KEY)||'null')||{total:0,quarantined:gpuQuarantined(),groups:[]};}
  catch(err){return {total:0,quarantined:gpuQuarantined(),groups:[]};}
}
function recordGpuDiagnostic(renderer,message,echo){
  let sample=String(message||'WebGPU validation error');
  const signature=gpuDiagnosticSignature(sample);
  const current=gpuDiagnosticGroups.get(signature)||{signature,sample,count:0,firstAt:new Date().toISOString()};
  current.count++;current.lastAt=new Date().toISOString();gpuDiagnosticGroups.set(signature,current);
  gpuDiagnosticTotal++;if(!gpuDiagnosticStartedAt)gpuDiagnosticStartedAt=performance.now();
  if(echo!==false&&current.count===1&&gpuDiagnosticGroups.size<=12)console.error('LotKing WebGPU validation:',sample);
  if(current.count===1||gpuDiagnosticTotal%16===0)persistGpuDiagnostics();
  window.dispatchEvent(new CustomEvent('lotking:gpu-diagnostic',{detail:{signature,sample,count:current.count,total:gpuDiagnosticTotal}}));
  const storm=gpuDiagnosticTotal>=48&&performance.now()-gpuDiagnosticStartedAt<=15000;
  if(storm&&!gpuStormPublished){
    gpuStormPublished=true;
    try{sessionStorage.setItem(GPU_QUARANTINE_KEY,signature);}catch(err){}
    persistGpuDiagnostics();
    if(renderer&&renderer.userData)renderer.userData.lkGpuErrorStorm=true;
    window.dispatchEvent(new CustomEvent('lotking:gpu-error-storm',{detail:gpuDiagnostics()}));
  }
}
window.addEventListener('lotking:webgpu-console-error',event=>{
  const detail=event&&event.detail||{};
  recordGpuDiagnostic(null,detail.sample||detail.signature||'WebGPU console error',false);
});
function installGpuErrorMonitor(renderer){
  const device=renderer&&renderer.backend&&renderer.backend.device;
  if(!device||typeof device.addEventListener!=='function'||device.__lkErrorMonitor)return false;
  device.__lkErrorMonitor=true;
  device.addEventListener('uncapturederror',event=>{
    // Prevent Chromium from printing the same native validation failure once
    // per material/AI mesh. The grouped sample remains in Dev diagnostics.
    if(event&&event.preventDefault)event.preventDefault();
    const error=event&&event.error;
    recordGpuDiagnostic(renderer,error&&error.message||error||'Uncaptured WebGPU error');
  });
  return true;
}
function cachedAdapterAvailability(){
  try{const value=sessionStorage.getItem(ADAPTER_SESSION_KEY);return value==='available'?true:(value==='unavailable'?false:null);}
  catch(err){return null;}
}
function syncCapabilities(){
  const secure=typeof isSecureContext==='undefined'?true:!!isSecureContext;
  const gpuApi=typeof navigator!=='undefined'&&!!navigator.gpu;
  const webgpuClass=!!(window.THREE&&window.THREE.WebGPURenderer);
  return Object.freeze({
    revision:String(window.THREE&&window.THREE.REVISION||''),secureContext:secure,
    webgpuApi:gpuApi,webgpuRuntime:webgpuClass,
    webgpuPlatformCandidate:secure&&gpuApi,
    webgpuCandidate:secure&&gpuApi&&webgpuClass,webgl2:true,
  });
}
async function probe(){
  const base=syncCapabilities();let adapter=null,adapterInfo=null,error='';
  // Probe the browser/device independently of the engine bundle. This lets the
  // Inspector build a useful mobile qualification matrix before the TSL
  // renderer is allowed to become the application default.
  if(base.webgpuPlatformCandidate){
    try {adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});adapterInfo=adapter&&adapter.info?Object.assign({},adapter.info):null;if(!adapter)error='No compatible WebGPU adapter';}
    catch(err){error=String(err&&err.message||err);}
  } else if(!base.secureContext)error='WebGPU requires a secure context';
  else if(!base.webgpuApi)error='WebGPU API unavailable in this browser';
  else if(!base.webgpuRuntime)error='WebGPU runtime is not present in the active bundle';
  asyncReport=Object.freeze(Object.assign({},base,{adapterAvailable:!!adapter,adapterInfo,error}));
  try{sessionStorage.setItem(ADAPTER_SESSION_KEY,adapter?'available':'unavailable');}catch(err){}
  window.dispatchEvent(new CustomEvent('lotking:render-capabilities',{detail:asyncReport}));
  return asyncReport;
}
function migrationReadiness(capabilities){
  const caps=capabilities||asyncReport||syncCapabilities();
  const ua=typeof navigator!=='undefined'?String(navigator.userAgent||''):'';
  const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const adapterKnown=Object.prototype.hasOwnProperty.call(caps,'adapterAvailable');
  const platformAvailable=!!(caps.webgpuPlatformCandidate&&(!adapterKnown||caps.adapterAvailable));
  const blockers=WEBGPU_MIGRATION_BLOCKERS.map(item=>Object.freeze({id:item.id,label:item.label}));
  if(!caps.webgpuRuntime)blockers.unshift(Object.freeze({id:'runtime-bundle',label:'WebGPURenderer/TSL is not included in the production compatibility bundle'}));
  if(!platformAvailable)blockers.unshift(Object.freeze({id:'platform',label:caps.error||'WebGPU adapter is unavailable on this browser/device'}));
  return Object.freeze({
    platformAvailable,
    adapterAvailable:adapterKnown?!!caps.adapterAvailable:null,
    runtimeIncluded:!!caps.webgpuRuntime,
    mobile,
    mobileQualified:false,
    defaultSafe:false,
    blockers:Object.freeze(blockers),
  });
}
// Three.js validates every shader it links by calling `getProgramInfoLog` and
// `getShaderInfoLog`. Both force the driver to finish compiling synchronously,
// so each new material variant costs a blocking round-trip to the GPU instead of
// being compiled in the background. Measured on this engine, entering Play on
// the open world spent 82% of its CPU inside those two calls and the transition
// never finished: the scene builds hundreds of program variants (districts,
// weather, the illustrated-sketch pipeline, per-material sketch layers), and
// each one stalled the main thread.
//
// The check only ever produces console output, so it is off by default and
// turned back on with `?shaderErrors=1` or `LK_DEBUG_SHADER_ERRORS = true` when
// a shader is actually being debugged. Three's own guidance is the same.
function shaderErrorChecksEnabled(){
  if(typeof window==='undefined')return false;
  if(window.LK_DEBUG_SHADER_ERRORS===true)return true;
  try{ return new URLSearchParams(window.location.search||'').get('shaderErrors')==='1'; }
  catch(err){ return false; }
}
function applyShaderErrorPolicy(renderer){
  if(!renderer||!renderer.debug||typeof renderer.debug!=='object')return renderer;
  if(renderer.debug.checkShaderErrors===undefined)return renderer;
  const enabled=shaderErrorChecksEnabled();
  renderer.debug.checkShaderErrors=enabled;
  renderer.userData=renderer.userData||{};
  renderer.userData.lkShaderErrorChecks=enabled;
  return renderer;
}
function register(renderer,role){if(!renderer)return renderer;renderer.userData=renderer.userData||{};renderer.userData.lkRendererRole=role||'auxiliary';renderer.userData.lkBackendDisposed=false;applyShaderErrorPolicy(renderer);registry.add(renderer);if(renderer.dispose&&!renderer.userData.lkBackendDisposeWrapped){const raw=renderer.dispose.bind(renderer);renderer.dispose=function(){registry.delete(renderer);renderer.userData.lkBackendDisposed=true;flushGpuReleases();return raw();};renderer.userData.lkBackendDisposeWrapped=true;}return renderer;}
function unregister(renderer){registry.delete(renderer);}
function isActualWebGPU(renderer){return !!(renderer&&renderer.backend&&renderer.backend.isWebGPUBackend===true);}

// ---- deferred GPU release ------------------------------------------------
// WebGL frees a geometry or a texture whenever it is asked: the driver keeps the
// allocation alive until the commands referencing it have drained. WebGPU does
// not. `buffer.destroy()` takes effect at once, so disposing a mesh from inside
// a frame - deleting an object, rebuilding a Logic Element, releasing what a
// previous scene apply added - destroys buffers a command buffer has already
// recorded. Chrome reports `[Buffer (unlabeled)] used in submit while destroyed`
// for every one, and then abandons the render pipeline it was building, which is
// why the viewport went dark instead of merely losing the one object.
//
// So on WebGPU the release is queued and run once the device queue reports the
// work in flight has finished. Callers detach the object before disposing it, so
// nothing waiting here can be drawn again. WebGL keeps its immediate path: it is
// proven, and delaying it would only postpone the reclaim.
const pendingReleases=[];
const inflightReleases=[];
let releaseDrain=null;
function activeWebGPURenderer(){
  for(const renderer of registry){
    if(isActualWebGPU(renderer)&&!(renderer.userData&&renderer.userData.lkBackendDisposed))return renderer;
  }
  return null;
}
function webgpuQueue(){
  const renderer=activeWebGPURenderer();
  const queue=renderer&&renderer.backend&&renderer.backend.device&&renderer.backend.device.queue;
  return queue&&typeof queue.onSubmittedWorkDone==='function'?queue:null;
}
function runRelease(release){
  // One resource that throws must not strand every resource queued behind it.
  try{if(typeof release==='function')release();}
  catch(error){if(typeof console!=='undefined'&&console.warn)console.warn('LotKing: deferred GPU release failed',error);}
}
function flushGpuReleases(){
  const batch=inflightReleases.splice(0,inflightReleases.length).concat(pendingReleases.splice(0,pendingReleases.length));
  batch.forEach(runRelease);
  return batch.length;
}
function scheduleGpuFlush(){
  if(releaseDrain)return releaseDrain;
  // Disposal is frequently requested while the current frame is still being
  // recorded. Asking onSubmittedWorkDone() here can resolve before that command
  // buffer is submitted. Cross one complete animation frame first, including
  // its task tail, then snapshot the queue. A plain requestAnimationFrame is
  // not sufficient: our callback can run before the editor's render callback
  // in that same frame, producing an empty fence followed by a stale submit.
  const settled=nextPaint().then(()=>{
    // Snapshot and fence at the SAME moment. Everything requested up to here has
    // crossed a whole frame, so one fence covers the batch - taking the snapshot
    // earlier, at schedule time, let only the first release of each frame travel
    // and made a scene apply drain one resource per frame. Anything arriving after
    // this point belongs to the next frame's work and gets its own fence in done().
    inflightReleases.push.apply(inflightReleases,pendingReleases.splice(0,pendingReleases.length));
    const queue=webgpuQueue();
    return queue?queue.onSubmittedWorkDone():null;
  });
  const done=()=>{releaseDrain=null;if(pendingReleases.length)scheduleGpuFlush();};
  releaseDrain=Promise.resolve(settled).catch(()=>null).then(()=>{
    // Only the batch that existed before the paint/queue fence may be freed.
    // Anything disposed while waiting remains pending and receives its own
    // frame boundary plus queue fence in done().
    const batch=inflightReleases.splice(0,inflightReleases.length);
    batch.forEach(runRelease);
  }).then(done,done);
  return releaseDrain;
}
function deferGpuRelease(release){
  if(typeof release!=='function')return false;
  if(!activeWebGPURenderer()){runRelease(release);return false;}
  pendingReleases.push(release);
  scheduleGpuFlush();
  return true;
}
function pendingGpuReleases(){return pendingReleases.length+inflightReleases.length;}

// Three's pinned compatibility bundle owns native retirement at its queue.submit
// boundary. Runtime code must not patch browser GPU prototypes or renderer
// internals: those hooks are global, browser-dependent and caused resources from
// unrelated renderers to share one lifetime policy. Engine systems may still use
// deferGpuRelease() to gather scene resources after detaching them; when their
// normal Three dispose events finally fire, Three invalidates its caches at once
// and retires only GPUBuffer/GPUTexture handles after the next safe submit.
function installDeferredDisposalPolicy(){
  return 0;
}

// The legacy engine layout uses WebGL's lower-left viewport origin. Three's
// common WebGPU renderer accepts logical viewport/scissor coordinates from the
// upper-left, including when it selected its internal WebGL 2 backend. Convert
// only at engine call sites; wrapping renderer.setViewport itself would also
// alter Three's internal render-target operations.
function viewportOriginY(renderer,bottomY,height,totalHeight){
  const y=Number(bottomY)||0,h=Math.max(0,Number(height)||0),total=Math.max(h,Number(totalHeight)||h);
  return renderer&&renderer.isWebGPURenderer?Math.max(0,total-y-h):y;
}
function describe(renderer){
  const caps=asyncReport||syncCapabilities(),isWebGPU=isActualWebGPU(renderer),gl=!isWebGPU&&renderer&&renderer.getContext&&renderer.getContext();
  let gpu='Unavailable',vendor='Unavailable',maxTextureSize=0,maxSamples=0;
  try {if(gl){const ext=gl.getExtension('WEBGL_debug_renderer_info');gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);vendor=ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR);maxTextureSize=Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||0;maxSamples=Number(gl.getParameter(gl.MAX_SAMPLES))||0;}}catch(err){}
  const requested=renderer&&renderer.userData&&renderer.userData.lkRequestedBackend||preference(),effective=isWebGPU?'webgpu':'webgl',readiness=migrationReadiness(caps);
  const fallbackReason=requested==='webgpu'&&effective!=='webgpu'?(gpuQuarantined()?'WebGPU was quarantined for this session after a validation-error storm; grouped diagnostics are available in Dev → Performance Debugger':(renderer&&renderer.isWebGPURenderer?'WebGPU initialization failed or no compatible adapter was available; Three.js continued with its WebGL 2 fallback':(readiness.platformAvailable?'WebGPU could not be started; using WebGL 2':'WebGPU is unavailable on this browser/device; using WebGL 2'))):'';
  return Object.freeze({requested,effective,fallbackReason,role:renderer&&renderer.userData&&renderer.userData.lkRendererRole||'unregistered',gpu,vendor,maxTextureSize,maxSamples,registeredRenderers:registry.size,capabilities:caps,readiness});
}
function compatibilityProfile(renderer){
  // The common renderer's canvas target does not exist until async init has
  // completed. Its WebGPU and WebGL-fallback backends also do not expose the
  // WebGL extension contract used by this legacy compatibility audit.
  const report=describe(renderer),gl=renderer&&!renderer.isWebGPURenderer&&renderer.getContext&&renderer.getContext();
  const ua=typeof navigator!=='undefined'?String(navigator.userAgent||''):'';
  const webkit=/AppleWebKit/i.test(ua)&&!/Chrom(?:e|ium)|Edg/i.test(ua);
  const appleGpu=/\bApple\b|\bMetal\b/i.test(String(report.gpu||'')+' '+String(report.vendor||''));
  let colorBufferFloat=true,floatLinear=true;
  try{if(gl&&typeof gl.getExtension==='function'){colorBufferFloat=!!gl.getExtension('EXT_color_buffer_float');floatLinear=!!(gl.getExtension('OES_texture_float_linear')||gl.getExtension('OES_texture_half_float_linear'));}}catch(err){colorBufferFloat=false;floatLinear=false;}
  const limitedTextures=!!(report.maxTextureSize&&report.maxTextureSize<8192);
  const conservativePost=appleGpu||webkit||!colorBufferFloat||limitedTextures;
  return Object.freeze({webkit,appleGpu,colorBufferFloat,floatLinear,limitedTextures,conservativePost,gtao:!conservativePost,ssr:!conservativePost,maxPixelRatio:conservativePost?2:4,reason:appleGpu?'Apple Metal WebGL compatibility profile':(webkit?'WebKit compatibility profile':(!colorBufferFloat?'HDR color-buffer extension unavailable':(limitedTextures?'Limited texture size':'full'))) });
}
function createWebGL(options,role){if(!window.THREE||!window.THREE.WebGLRenderer)throw new Error('Three.js WebGLRenderer unavailable');return register(new window.THREE.WebGLRenderer(options||{}),role||'main');}
function createRenderer(options,role){
  // The short-lived landing ROLE iframe gains nothing from probing WebGPU. A
  // failed common-renderer provider may keep an internal WebGL fallback alive
  // until navigation, consuming the context the Editor is about to request.
  // Main Editor, Play and exports still honour the user's preference.
  const menuPreview=typeof window!=='undefined'&&!!window.__LK_MENU_PREVIEW;
  const wanted=menuPreview?'webgl':preference(),caps=syncCapabilities();
  // Auto deliberately remains on the qualified backend. An explicit WebGPU
  // preference opts into the common renderer; it owns an internal WebGL 2
  // fallback when adapter/device initialization fails.
  // Unknown adapter state boots once on proven WebGL while the asynchronous
  // probe records capability for the next renderer. This avoids constructing a
  // common renderer merely to discover that its Context Provider cannot exist.
  if(wanted==='webgpu'&&!gpuQuarantined()&&caps.webgpuCandidate&&cachedAdapterAvailability()===true){
    const renderer=register(new window.THREE.WebGPURenderer(options||{}),role||'main');
    renderer.userData.lkRequestedBackend='webgpu';
    return renderer;
  }
  const renderer=createWebGL(options,role||'main');
  renderer.userData.lkRequestedBackend=wanted;
  return renderer;
}
function initialize(renderer){
  if(!renderer)return Promise.reject(new Error('Renderer unavailable'));
  if(initializations.has(renderer))return initializations.get(renderer);
  const promise=Promise.resolve().then(async()=>{
    if(renderer.isWebGPURenderer&&typeof renderer.init==='function')await renderer.init();
    if(isActualWebGPU(renderer)){
      installGpuErrorMonitor(renderer);
    }
    const report=describe(renderer);
    renderer.userData=renderer.userData||{};
    renderer.userData.lkEffectiveBackend=report.effective;
    renderer.userData.lkBackendReady=true;
    window.dispatchEvent(new CustomEvent('lotking:renderer-ready',{detail:report}));
    return report;
  }).catch(error=>{
    renderer.userData=renderer.userData||{};
    renderer.userData.lkBackendReady=false;
    renderer.userData.lkBackendError=String(error&&error.message||error);
    window.dispatchEvent(new CustomEvent('lotking:renderer-error',{detail:{error:renderer.userData.lkBackendError,requested:preference()}}));
    throw error;
  });
  initializations.set(renderer,promise);
  return promise;
}
function featureSupport(renderer){const report=describe(renderer),compat=compatibilityProfile(renderer);return Object.freeze({webgpu:report.effective==='webgpu',gtao:compat.gtao&&!!(window.THREE&&window.THREE.GTAOPass),ssr:compat.ssr&&!!(window.THREE&&window.THREE.SSRPass),legacyPost:report.effective==='webgl',compute:report.effective==='webgpu'&&!!(window.THREE&&window.THREE.TSL),lightProbeGrid:!!(window.THREE&&window.THREE.LightProbeGrid),compatibility:compat});}
function metrics(renderer){
  const info=renderer&&renderer.info||{},render=info.render||{},memory=info.memory||{},size=renderer&&renderer.getSize?renderer.getSize(window.THREE&&window.THREE.Vector2?new window.THREE.Vector2():{set(){}}):null;
  const width=Number(size&&size.x)||0,height=Number(size&&size.y)||0,pixelRatio=renderer&&renderer.getPixelRatio?Number(renderer.getPixelRatio())||1:1;
  const framebufferBytes=Math.round(width*height*pixelRatio*pixelRatio*8);
  return Object.freeze({calls:Number(render.calls)||0,triangles:Number(render.triangles)||0,points:Number(render.points)||0,lines:Number(render.lines)||0,geometries:Number(memory.geometries)||0,textures:Number(memory.textures)||0,programs:Array.isArray(info.programs)?info.programs.length:0,width,height,pixelRatio,estimatedFramebufferBytes:framebufferBytes});
}
function sessionOverrides(){return Object.freeze(Object.assign({},sessionState));}
function setSessionOverrides(patch){const next=Object.assign({},sessionState,patch||{});next.renderScale=Math.max(.5,Math.min(2,Number(next.renderScale)||1));sessionState=next;return sessionOverrides();}
function clearSessionOverrides(){sessionState={renderScale:1};return sessionOverrides();}
function warmupStatus(renderer){return warmups.get(renderer)||Object.freeze({state:'idle',error:'',startedAt:null,finishedAt:null});}
function supportsAsyncCompile(renderer){
  if(!renderer||typeof renderer.compileAsync!=='function')return false;
  const gl=renderer.getContext&&renderer.getContext();
  // A null context is useful for lightweight test doubles. Real WebGL
  // renderers must expose KHR_parallel_shader_compile before compileAsync is
  // called; Three otherwise emits a warning and falls back to sync work.
  if(!gl)return true;
  try{return typeof gl.getExtension==='function'&&!!gl.getExtension('KHR_parallel_shader_compile');}catch(error){return false;}
}
function nextPaint(){
  return new Promise(resolve=>{
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{
      // Timers run after all requestAnimationFrame callbacks for this refresh.
      // Three's WebGPU render/queue.submit path is synchronous, so the fence
      // taken after this task now includes the editor/play frame.
      if(typeof setTimeout==='function')setTimeout(resolve,0);
      else resolve();
    });
    else resolve();
  });
}
function compileScene(renderer,scene,camera,options){
  const opts=options||{};
  if(!renderer||!scene||!camera)return Promise.resolve({state:'skipped',mode:'none',error:'',startedAt:null,finishedAt:Date.now()});
  const previous=compileQueues.get(renderer)||Promise.resolve();
  const job=previous.catch(()=>null).then(async()=>{
    const record={state:'warming',mode:'none',error:'',startedAt:Date.now(),finishedAt:null};
    try{
      if(renderer.userData&&renderer.userData.lkBackendDisposed){
        record.state='skipped';record.mode='disposed';
      }else if(isActualWebGPU(renderer)){
        // Three r185 compileAsync() snapshots render objects, then yields while
        // compiling them one by one. That is safe for a frozen export scene but
        // not for the live Editor/Play graph: scene apply and visual-helper
        // rebuilds can dispose a captured geometry before compilation resumes,
        // leading to "Buffer used in submit while destroyed". Real frames use
        // the synchronous render pipeline and are the authoritative warm-up for
        // a mutable engine scene.
        record.mode='live-frame-webgpu';
        if(opts.settleFrames!==0)await nextPaint();
        record.state='ready';
      }else if(typeof renderer.compile==='function'){
        // Three r185.1 WebGLRenderer.compileAsync() polls each material's
        // private currentProgram from a timer. A material disposed or replaced
        // while that poll is alive leaves currentProgram undefined; the timer
        // then throws at program.isReady() and its Promise remains pending.
        // Synchronous compile starts the same KHR parallel shader jobs without
        // creating that unowned polling loop. Real rendered frames below let
        // the driver finish them while the loading overlay still owns input.
        record.mode='sync-webgl-r185-safe';
        renderer.compile(scene,camera);
        if(opts.settleFrames!==0)await nextPaint();
        record.state='ready';
      }else{
        record.state='skipped';record.mode='unsupported';
      }
    }catch(error){
      record.state='failed';
      record.error=String(error&&error.message||error);
      if(opts.warn!==false&&typeof console!=='undefined'&&console.warn)console.warn('LotKing: shader warm-up degraded safely',error);
    }
    record.finishedAt=Date.now();
    return record;
  });
  compileQueues.set(renderer,job);
  job.finally(()=>{if(compileQueues.get(renderer)===job)compileQueues.delete(renderer);});
  return job;
}
function scheduleWarmup(renderer,scene,camera,options){
  if(!renderer||!scene||!camera)return Promise.resolve(warmupStatus(renderer));
  const current=warmups.get(renderer);if(current&&(current.state==='scheduled'||current.state==='warming'||current.state==='ready'))return current.promise||Promise.resolve(current);
  const opts=options||{},record={state:'scheduled',error:'',startedAt:null,finishedAt:null,promise:null};
  const run=()=>{record.state='warming';record.startedAt=Date.now();return compileScene(renderer,scene,camera,opts).then(result=>{record.state=result.state;record.error=result.error;record.mode=result.mode;record.finishedAt=result.finishedAt;return record;});};
  record.promise=new Promise(resolve=>{const start=()=>run().then(resolve);if(typeof requestIdleCallback==='function')requestIdleCallback(start,{timeout:Number(opts.timeout)||1800});else setTimeout(start,Math.max(0,Number(opts.delay)||0));});
  warmups.set(renderer,record);return record.promise;
}

const api=Object.freeze({normalize,preference,setPreference,cachedAdapterAvailability,syncCapabilities,probe,migrationReadiness,register,unregister,isActualWebGPU,gpuDiagnostics,gpuQuarantined,deferGpuRelease,flushGpuReleases,pendingGpuReleases,installDeferredDisposalPolicy,viewportOriginY,describe,compatibilityProfile,createWebGL,createRenderer,initialize,featureSupport,metrics,sessionOverrides,setSessionOverrides,clearSessionOverrides,warmupStatus,supportsAsyncCompile,compileScene,scheduleWarmup});
window.LK_RUNTIME_RENDERING_BACKEND=api;
installDeferredDisposalPolicy();
setTimeout(()=>probe().catch(()=>{}),0);
})();
