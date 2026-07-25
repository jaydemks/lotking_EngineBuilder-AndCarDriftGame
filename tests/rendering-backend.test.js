'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const store=new Map();
class Renderer{constructor(options){this.options=options;this.userData={};this.disposed=false;this.compiled=false;this.info={render:{calls:7,triangles:1234},memory:{textures:5,geometries:6},programs:[{}]};}dispose(){this.disposed=true;}getContext(){return null;}getSize(target){target.x=800;target.y=450;return target;}getPixelRatio(){return 2;}compile(){this.compiled='sync';}compileAsync(){this.compiled='async';return Promise.resolve();}}
class Vector2{constructor(){this.x=0;this.y=0;}}
const window={THREE:{REVISION:'185',WebGLRenderer:Renderer,Vector2,GTAOPass:function(){}},dispatchEvent(){}};
const sandbox={window,navigator:{},localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},isSecureContext:true,CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail;},setTimeout(){},requestIdleCallback:fn=>fn(),console};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/runtime/rendering-backend.js'),'utf8'),sandbox,{filename:'rendering-backend.js'});
const api=window.LK_RUNTIME_RENDERING_BACKEND;
assert.ok(api);
assert.equal(api.normalize('garbage'),'auto');
assert.equal(api.setPreference('webgpu'),'webgpu');
assert.equal(api.preference(),'webgpu');
assert.equal(api.syncCapabilities().revision,'185');
assert.equal(api.syncCapabilities().webgpuCandidate,false);
const renderer=api.createWebGL({antialias:true},'test-preview');
assert.equal(api.describe(renderer).effective,'webgl');
assert.equal(api.describe(renderer).role,'test-preview');
assert.match(api.describe(renderer).fallbackReason,/using (?:the validated )?WebGL/);
assert.equal(api.describe(renderer).registeredRenderers,1);
assert.equal(api.metrics(renderer).triangles,1234);
assert.equal(api.metrics(renderer).estimatedFramebufferBytes,800*450*4*8);
assert.equal(api.compatibilityProfile(renderer).conservativePost,false);
const appleRenderer=new Renderer();
appleRenderer.getContext=()=>({RENDERER:1,VENDOR:2,MAX_TEXTURE_SIZE:3,MAX_SAMPLES:4,getExtension:name=>name==='WEBGL_debug_renderer_info'?{UNMASKED_RENDERER_WEBGL:5,UNMASKED_VENDOR_WEBGL:6}:name==='EXT_color_buffer_float'?{}:null,getParameter:key=>key===5?'ANGLE (Apple, Apple M2, Metal)':key===6?'Apple':key===3?16384:key===4?4:'WebGL'});
const appleProfile=api.compatibilityProfile(appleRenderer);
assert.equal(appleProfile.appleGpu,true);
assert.equal(appleProfile.gtao,false);
assert.equal(appleProfile.ssr,false);
assert.equal(appleProfile.maxPixelRatio,2);
assert.equal(api.setSessionOverrides({renderScale:3}).renderScale,2);
assert.equal(api.clearSessionOverrides().renderScale,1);
assert.equal(api.supportsAsyncCompile(renderer),true);
const syncRenderer=new Renderer();
syncRenderer.getContext=()=>({getExtension:()=>null});
assert.equal(api.supportsAsyncCompile(syncRenderer),false);
api.scheduleWarmup(renderer,{},{}).then(status=>{
  assert.equal(status.state,'ready');
  assert.equal(status.mode,'sync-webgl-r185-safe');
  assert.equal(renderer.compiled,'sync');
  return api.scheduleWarmup(syncRenderer,{},{});
}).then(status=>{
  assert.equal(status.state,'ready');
  assert.equal(syncRenderer.compiled,'sync');
  const failedRenderer=new Renderer();
  failedRenderer.compile=()=>{throw new Error('synthetic compile failure');};
  return api.compileScene(failedRenderer,{}, {}, {warn:false});
}).then(status=>{
  assert.equal(status.state,'failed');
  assert.match(status.error,/synthetic compile failure/);
  renderer.dispose();
  assert.equal(api.describe(renderer).registeredRenderers,0);
  console.log('rendering-backend.test.js: all assertions passed');
}).catch(error=>{console.error(error);process.exitCode=1;});
