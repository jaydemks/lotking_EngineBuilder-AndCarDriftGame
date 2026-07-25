/* =========================================================
   LOT KING — rendering backend policy and GPU capabilities
   One report shared by runtime, editor, previews and exports.
   ========================================================= */
(function(){
'use strict';

const PREF_KEY='lotking.renderBackend.v1';
const VALID=new Set(['auto','webgpu','webgl']);
const registry=new Set();
const warmups=new WeakMap();
const compileQueues=new WeakMap();
let sessionState={renderScale:1};
let asyncReport=null;

function normalize(value){const key=String(value||'auto').toLowerCase();return VALID.has(key)?key:'auto';}
function preference(){try{return normalize(localStorage.getItem(PREF_KEY));}catch(err){return 'auto';}}
function setPreference(value){const next=normalize(value);try{localStorage.setItem(PREF_KEY,next);}catch(err){}return next;}
function syncCapabilities(){
  const secure=typeof isSecureContext==='undefined'?true:!!isSecureContext;
  const gpuApi=typeof navigator!=='undefined'&&!!navigator.gpu;
  const webgpuClass=!!(window.THREE&&window.THREE.WebGPURenderer);
  return Object.freeze({
    revision:String(window.THREE&&window.THREE.REVISION||''),secureContext:secure,
    webgpuApi:gpuApi,webgpuRuntime:webgpuClass,
    webgpuCandidate:secure&&gpuApi&&webgpuClass,webgl2:true,
  });
}
async function probe(){
  const base=syncCapabilities();let adapter=null,adapterInfo=null,error='';
  if(base.webgpuCandidate){
    try {adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});adapterInfo=adapter&&adapter.info?Object.assign({},adapter.info):null;if(!adapter)error='No compatible WebGPU adapter';}
    catch(err){error=String(err&&err.message||err);}
  } else if(!base.secureContext)error='WebGPU requires a secure context';
  else if(!base.webgpuApi)error='WebGPU API unavailable in this browser';
  else if(!base.webgpuRuntime)error='WebGPU runtime is not present in the active bundle';
  asyncReport=Object.freeze(Object.assign({},base,{adapterAvailable:!!adapter,adapterInfo,error}));
  window.dispatchEvent(new CustomEvent('lotking:render-capabilities',{detail:asyncReport}));
  return asyncReport;
}
function register(renderer,role){if(!renderer)return renderer;renderer.userData=renderer.userData||{};renderer.userData.lkRendererRole=role||'auxiliary';renderer.userData.lkBackendDisposed=false;registry.add(renderer);if(renderer.dispose&&!renderer.userData.lkBackendDisposeWrapped){const raw=renderer.dispose.bind(renderer);renderer.dispose=function(){registry.delete(renderer);renderer.userData.lkBackendDisposed=true;return raw();};renderer.userData.lkBackendDisposeWrapped=true;}return renderer;}
function unregister(renderer){registry.delete(renderer);}
function describe(renderer){
  const caps=asyncReport||syncCapabilities(),isWebGPU=!!(renderer&&renderer.isWebGPURenderer),gl=renderer&&renderer.getContext&&renderer.getContext();
  let gpu='Unavailable',vendor='Unavailable',maxTextureSize=0,maxSamples=0;
  try {if(gl){const ext=gl.getExtension('WEBGL_debug_renderer_info');gpu=ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);vendor=ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR);maxTextureSize=Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))||0;maxSamples=Number(gl.getParameter(gl.MAX_SAMPLES))||0;}}catch(err){}
  const requested=preference(),effective=isWebGPU?'webgpu':'webgl';
  const fallbackReason=requested==='webgpu'&&effective!=='webgpu'?(caps.webgpuCandidate?'WebGPU/TSL pipeline is not activated yet; using the validated WebGL path':'WebGPU is unavailable on this browser/device; using WebGL'):'';
  return Object.freeze({requested,effective,fallbackReason,role:renderer&&renderer.userData&&renderer.userData.lkRendererRole||'unregistered',gpu,vendor,maxTextureSize,maxSamples,registeredRenderers:registry.size,capabilities:caps});
}
function compatibilityProfile(renderer){
  const report=describe(renderer),gl=renderer&&renderer.getContext&&renderer.getContext();
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
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>resolve());
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
      }else if(renderer.isWebGPURenderer&&typeof renderer.compileAsync==='function'){
        record.mode='async-webgpu';
        await renderer.compileAsync(scene,camera);
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

const api=Object.freeze({normalize,preference,setPreference,syncCapabilities,probe,register,unregister,describe,compatibilityProfile,createWebGL,featureSupport,metrics,sessionOverrides,setSessionOverrides,clearSessionOverrides,warmupStatus,supportsAsyncCompile,compileScene,scheduleWarmup});
window.LK_RUNTIME_RENDERING_BACKEND=api;
setTimeout(()=>probe().catch(()=>{}),0);
})();
