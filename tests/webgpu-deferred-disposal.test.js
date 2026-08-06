'use strict';

/* =========================================================
   Freeing GPU resources waits for the frame, but only on WebGPU.

   The editor viewport under WebGPU went dark, with the console repeating
   `[Buffer (unlabeled)] used in submit while destroyed` and then
   `THREE.WebGPURenderer: Async render pipeline creation failed`. The cause is a
   lifetime difference between the two backends, not a drawing bug:

     WebGL   dispose() hands the allocation back to the driver, which keeps it
             alive until the commands referencing it have drained.
     WebGPU  destroy() takes effect at once. A command buffer that already
             recorded the buffer is now invalid, the device reports it, and the
             pipeline being built is abandoned - so nothing draws.

   The store disposes from inside a frame all over the place: deleting an object,
   rebuilding a Logic Element, releasing what a previous scene apply added. So the
   release is queued and run once the device queue reports the work in flight has
   finished. WebGL keeps its immediate path, which is proven and costs nothing to
   keep.

   HOW THIS FILE IS ORGANISED
     01 harness    the backend module in a vm, and the store's disposal helpers
     02 webgl      an immediate free, unchanged
     03 webgpu     queued past the submit, and drained after it
     04 batching   many disposals share one wait, and one failure strands nothing
     05 store      disposeObject3D reads the graph now and frees later
   ========================================================= */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// ================================================================= 01 harness

const root = file => path.join(__dirname, '..', file);
const source = file => fs.readFileSync(root(file), 'utf8');

// Cases are collected and run one after another. Half of them are async, and
// letting them start together would interleave both the output and the
// `global.window` the store harness installs.
const cases = [];
function test(name, run){ cases.push({name, run}); }

// Each case gets its own module instance: the release queue and the renderer
// registry are module state, and a leftover renderer would decide the backend for
// the next case.
function loadBackend(){
  const store = new Map();
  const session = new Map();
  const window = {THREE:{REVISION:'185'}, dispatchEvent(){}, addEventListener(){}};
  const sandbox = {
    window, navigator:{}, isSecureContext:true, console, performance,
    localStorage:{getItem:key => store.get(key) || null, setItem:(key, value) => store.set(key, value)},
    sessionStorage:{getItem:key => session.get(key) || null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)},
    CustomEvent:function(type, init){ this.type = type; this.detail = init && init.detail; },
    setTimeout(){},
  };
  vm.runInNewContext(source('js/runtime/rendering-backend.js'), sandbox, {filename:'rendering-backend.js'});
  return window.LK_RUNTIME_RENDERING_BACKEND;
}

// A WebGPU renderer whose queue reports submitted work on demand, so the test
// decides when the frame is over.
function webgpuRenderer(){
  let release = null;
  const renderer = {
    isWebGPURenderer:true, userData:{},
    backend:{
      isWebGPUBackend:true,
      device:{queue:{onSubmittedWorkDone(){ return new Promise(resolve => { release = resolve; }); }}},
    },
  };
  return {renderer, finishFrame(){ const resolve = release; release = null; if(resolve) resolve(); }};
}
function webglRenderer(){ return {userData:{}, backend:null}; }

// Promises chained inside the module need a few turns to settle once the queue
// has resolved; a real timer tick is well past all of them.
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

// The store is a browser IIFE with a very large dependency surface, so the
// disposal helpers are lifted out and evaluated on their own, as in
// scene-reload-release.test.js.
function loadStoreDisposal(){
  const SOURCE = source('js/engine/scene-store.js');
  const wanted = ['isSharedSurfaceTexture', 'DISPOSABLE_TEXTURE_SLOTS', 'disposeMaterialTextures', 'releaseGpuResources', 'disposeObject3D'];
  const parts = wanted.map(name => {
    const start = SOURCE.indexOf((name === 'DISPOSABLE_TEXTURE_SLOTS' ? 'const ' : 'function ') + name);
    assert.ok(start >= 0, 'missing ' + name + ' in scene-store.js');
    const rest = SOURCE.slice(start + 1);
    const next = rest.search(/\n(?:function |const )/);
    return SOURCE.slice(start, next >= 0 ? start + 1 + next : SOURCE.length);
  });
  // eslint-disable-next-line no-new-func
  return new Function(parts.join('\n') + '\nreturn {disposeObject3D};')();
}

// ================================================================== 02 webgl

test('with no WebGPU renderer the release is immediate, as it always was', () => {
  const api = loadBackend();
  api.register(webglRenderer(), 'main');
  const log = [];
  const deferred = api.deferGpuRelease(() => log.push('freed'));
  assert.deepEqual(log, ['freed'], 'WebGL must not wait for anything');
  assert.equal(deferred, false, 'and reports that it did not defer');
  assert.equal(api.pendingGpuReleases(), 0);
});

test('a WebGPU renderer that has been disposed no longer holds releases back', () => {
  const api = loadBackend();
  const gpu = webgpuRenderer();
  api.register(gpu.renderer, 'main');
  gpu.renderer.userData.lkBackendDisposed = true;
  const log = [];
  api.deferGpuRelease(() => log.push('freed'));
  assert.deepEqual(log, ['freed'], 'nothing is in flight on a device that is gone');
});

// ================================================================= 03 webgpu

test('on WebGPU nothing is freed inside the frame, and everything is freed after it', async () => {
  const api = loadBackend();
  const gpu = webgpuRenderer();
  api.register(gpu.renderer, 'main');
  const log = [];
  const deferred = api.deferGpuRelease(() => log.push('freed'));
  assert.equal(deferred, true, 'the caller is told the free was queued');
  assert.deepEqual(log, [], 'destroying a buffer the current submit recorded is the whole bug');
  assert.equal(api.pendingGpuReleases(), 1);
  await settle();
  assert.deepEqual(log, [], 'and it keeps waiting until the queue says the work is done');
  gpu.finishFrame();
  await settle();
  assert.deepEqual(log, ['freed'], 'once the submit has drained the buffer is safe to destroy');
  assert.equal(api.pendingGpuReleases(), 0);
});

test('the queue fence is taken at the frame tail, after the editor submit', () => {
  const SOURCE = source('js/runtime/rendering-backend.js');
  const frameTail = SOURCE.slice(SOURCE.indexOf('function nextPaint'), SOURCE.indexOf('function compileScene'));
  assert.match(frameTail, /requestAnimationFrame\(\(\)=>\{[\s\S]*setTimeout\(resolve,0\)/,
    'a bare animation-frame callback may run before the editor render callback');
});

test('a release queued while the batch is waiting is drained by the next one', async () => {
  const api = loadBackend();
  const gpu = webgpuRenderer();
  api.register(gpu.renderer, 'main');
  const log = [];
  api.deferGpuRelease(() => log.push('first'));
  await settle();
  gpu.finishFrame();
  api.deferGpuRelease(() => log.push('second'));
  await settle();
  // The second one may join the batch in flight or start a fresh wait; either
  // way it must not be forgotten, and it must not run before its own frame.
  if(log.indexOf('second') < 0){
    gpu.finishFrame();
    await settle();
  }
  assert.deepEqual(log, ['first', 'second'], 'nothing queued is ever dropped');
  assert.equal(api.pendingGpuReleases(), 0);
});

test('a WebGPU renderer still initializing has no device, and one frame is enough', async () => {
  // Before init() resolves there is no queue to ask, and nothing has been
  // submitted that could reference the resource either.
  const api = loadBackend();
  const renderer = {isWebGPURenderer:true, userData:{}, backend:{isWebGPUBackend:true}};
  api.register(renderer, 'main');
  const log = [];
  assert.equal(api.deferGpuRelease(() => log.push('freed')), true);
  assert.deepEqual(log, []);
  await settle();
  assert.deepEqual(log, ['freed'], 'the queue must not strand releases when there is no device');
});

// =============================================================== 04 batching

test('several disposals in one frame share a single wait', async () => {
  const api = loadBackend();
  const gpu = webgpuRenderer();
  api.register(gpu.renderer, 'main');
  const log = [];
  ['a', 'b', 'c'].forEach(tag => api.deferGpuRelease(() => log.push(tag)));
  assert.equal(api.pendingGpuReleases(), 3);
  await settle();
  gpu.finishFrame();
  await settle();
  assert.deepEqual(log, ['a', 'b', 'c'], 'in the order they were disposed');
});

test('one release that throws does not strand the ones queued behind it', async () => {
  const api = loadBackend();
  const gpu = webgpuRenderer();
  api.register(gpu.renderer, 'main');
  const log = [];
  const warn = console.warn;
  console.warn = () => {};
  try {
    api.deferGpuRelease(() => { throw new Error('synthetic dispose failure'); });
    api.deferGpuRelease(() => log.push('survivor'));
    await settle();
    gpu.finishFrame();
    await settle();
  } finally { console.warn = warn; }
  assert.deepEqual(log, ['survivor'], 'a leak of everything else is a worse outcome than one warning');
  assert.equal(api.pendingGpuReleases(), 0);
});

test('flushing by hand is available for teardown, and reports what it freed', () => {
  const api = loadBackend();
  const gpu = webgpuRenderer();
  api.register(gpu.renderer, 'main');
  api.deferGpuRelease(() => {});
  api.deferGpuRelease(() => {});
  assert.equal(api.flushGpuReleases(), 2);
  assert.equal(api.pendingGpuReleases(), 0);
});

test('the rendering policy does not monkey-patch Three public prototypes', () => {
  let disposed=0;
  class BufferGeometry{dispose(){disposed++;}}
  const store = new Map(),session = new Map();
  const window = {THREE:{REVISION:'185',BufferGeometry},dispatchEvent(){},addEventListener(){}};
  const sandbox={window,navigator:{},isSecureContext:true,console,performance,
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    sessionStorage:{getItem:key=>session.get(key)||null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)},
    CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail;},setTimeout(){}};
  vm.runInNewContext(source('js/runtime/rendering-backend.js'),sandbox,{filename:'rendering-backend.js'});
  const api=window.LK_RUNTIME_RENDERING_BACKEND,gpu=webgpuRenderer();api.register(gpu.renderer,'main');
  const geometry=new BufferGeometry();geometry.dispose();
  assert.equal(disposed,1,'public Three APIs retain their upstream identity and timing');
  assert.equal(api.installDeferredDisposalPolicy(),0,'native retirement belongs to the pinned Three bundle');
});

test('renderer initialization does not replace Three backend internals', async () => {
  const api=loadBackend(),gpu=webgpuRenderer(),log=[];
  const buffer={destroy(){log.push('native-buffer');}};
  gpu.renderer.backend.attributeUtils={_getBufferAttribute:attribute=>attribute};
  gpu.renderer.backend.get=()=>({buffer});
  gpu.renderer.backend.delete=attribute=>log.push('cache:'+attribute);
  gpu.renderer.backend.destroyAttribute=()=>log.push('raw-destroy');
  const original=gpu.renderer.backend.destroyAttribute;
  api.register(gpu.renderer,'main');
  await api.initialize(gpu.renderer);
  gpu.renderer.backend.destroyAttribute('position-buffer');
  assert.equal(gpu.renderer.backend.destroyAttribute,original,'version-private backend methods remain untouched');
  assert.deepEqual(log,['raw-destroy']);
  assert.equal(gpu.renderer.userData.lkDeferredBackendDestroyers,undefined);
});

test('live WebGPU scenes warm from real frames instead of stale async snapshots', () => {
  const SOURCE=source('js/runtime/rendering-backend.js');
  const compile=SOURCE.slice(SOURCE.indexOf('function compileScene'),SOURCE.indexOf('function scheduleWarmup'));
  assert.match(compile,/isActualWebGPU\(renderer\)[\s\S]*record\.mode='live-frame-webgpu'/);
  // Assert on the CALL, not on the surrounding text: the branch explains itself in
  // a comment that names compileAsync, and a window-based regex matched that prose
  // rather than any code, so this failed while the code was already correct.
  assert.ok(!/renderer\.compileAsync\s*\(/.test(compile),
    'compileAsync may resume after a mutable editor scene has disposed its captured geometry');
});

test('the rendering policy does not patch browser GPUDevice or GPUBuffer prototypes', () => {
  const store=new Map(),session=new Map(),log=[];
  class NativeBuffer{
    constructor(){this.label='';}
    destroy(){log.push('native-destroy');}
  }
  class GPUDevice{
    createBuffer(){return new NativeBuffer();}
  }
  const window={THREE:{REVISION:'185'},GPUDevice,dispatchEvent(){},addEventListener(){}};
  const sandbox={window,navigator:{},isSecureContext:true,console,performance,
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    sessionStorage:{getItem:key=>session.get(key)||null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)},
    CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail;},setTimeout(){}};
  vm.runInNewContext(source('js/runtime/rendering-backend.js'),sandbox,{filename:'rendering-backend.js'});
  const api=window.LK_RUNTIME_RENDERING_BACKEND,gpu=webgpuRenderer();
  api.register(gpu.renderer,'main');
  const device=new GPUDevice(),buffer=device.createBuffer({size:64,usage:4});
  assert.equal(buffer.label,'','browser-native labels are not rewritten globally');
  buffer.destroy();
  assert.deepEqual(log,['native-destroy'],'native methods keep their browser semantics');
});

test('an exclusively owned native vertex buffer is released after its fence', async () => {
  const store=new Map(),session=new Map(),log=[];
  class NativeBuffer{constructor(){this.label='';}destroy(){log.push('native-destroy');}}
  class GPUDevice{createBuffer(){return new NativeBuffer();}}
  const window={THREE:{REVISION:'185'},GPUDevice,dispatchEvent(){},addEventListener(){}};
  const sandbox={window,navigator:{},isSecureContext:true,console,performance,
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    sessionStorage:{getItem:key=>session.get(key)||null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)},
    CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail;},setTimeout(){}};
  vm.runInNewContext(source('js/runtime/rendering-backend.js'),sandbox,{filename:'rendering-backend.js'});
  const api=window.LK_RUNTIME_RENDERING_BACKEND,gpu=webgpuRenderer();
  gpu.renderer.dispose=()=>log.push('renderer-dispose');
  api.register(gpu.renderer,'main');
  const buffer=new GPUDevice().createBuffer({size:96,usage:32}); // VERTEX
  api.deferGpuRelease(()=>buffer.destroy());
  await settle();gpu.finishFrame();await settle();
  assert.deepEqual(log,['native-destroy'],'exclusive resources do not accumulate for the renderer lifetime');
  gpu.renderer.dispose();
  assert.deepEqual(log,['native-destroy','renderer-dispose']);
});

test('the rendering policy does not patch browser GPUTexture prototypes', () => {
  const store=new Map(),session=new Map(),log=[];
  class NativeTexture{constructor(){this.label='';}destroy(){log.push('texture-destroy');}}
  class GPUDevice{createTexture(){return new NativeTexture();}}
  const window={THREE:{REVISION:'185'},GPUDevice,dispatchEvent(){},addEventListener(){}};
  const sandbox={window,navigator:{},isSecureContext:true,console,performance,
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    sessionStorage:{getItem:key=>session.get(key)||null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)},
    CustomEvent:function(type,init){this.type=type;this.detail=init&&init.detail;},setTimeout(){}};
  vm.runInNewContext(source('js/runtime/rendering-backend.js'),sandbox,{filename:'rendering-backend.js'});
  const api=window.LK_RUNTIME_RENDERING_BACKEND,gpu=webgpuRenderer();
  gpu.renderer.dispose=()=>log.push('renderer-dispose');api.register(gpu.renderer,'main');
  const texture=new GPUDevice().createTexture({label:'RenderTexture',size:{width:1024,height:1024},format:'rgba8unorm',usage:20});
  assert.equal(texture.label,'','runtime policy leaves native objects alone');
  texture.destroy();
  assert.deepEqual(log,['texture-destroy']);
  gpu.renderer.dispose();assert.deepEqual(log,['texture-destroy','renderer-dispose']);
});

test('all Three disposal bookkeeping remains synchronous', () => {
  const store = new Map(), session = new Map(), log = [];
  class Texture { dispose(){ log.push('texture'); } }
  class RenderTarget { dispose(){ log.push('target'); } }
  class Material { dispose(){ log.push('material'); } }
  class BufferGeometry { dispose(){ log.push('geometry'); } }
  const window = {THREE:{REVISION:'185', Texture, RenderTarget, Material, BufferGeometry}, dispatchEvent(){}, addEventListener(){}};
  const sandbox = {window, navigator:{}, isSecureContext:true, console, performance,
    localStorage:{getItem:key => store.get(key) || null, setItem:(key, value) => store.set(key, value)},
    sessionStorage:{getItem:key => session.get(key) || null, setItem:(key, value) => session.set(key, value), removeItem:key => session.delete(key)},
    CustomEvent:function(type, init){ this.type = type; this.detail = init && init.detail; }, setTimeout(){}};
  vm.runInNewContext(source('js/runtime/rendering-backend.js'), sandbox, {filename:'rendering-backend.js'});
  const api = window.LK_RUNTIME_RENDERING_BACKEND, gpu = webgpuRenderer();
  api.register(gpu.renderer, 'main');
  new Texture().dispose();
  new RenderTarget().dispose();
  new Material().dispose();
  new BufferGeometry().dispose();
  assert.deepEqual(log, ['texture', 'target', 'material', 'geometry'],
    'Three cache invalidation is immediate; only native bundle handles retire later');
});

test('ShadowDepthTexture ownership is not patched through renderer private fields', async () => {
  const api=loadBackend(),gpu=webgpuRenderer(),log=[];
  const externalDepth={name:'ShadowDepthTexture'};
  const target={},targetData={textures:[],depthTexture:externalDepth};
  const textures={
    has:value=>value===target,
    get:value=>value===target?targetData:null,
    _destroyRenderTarget(value){log.push(this.get(value).depthTexture||null);},
  };
  const original=textures._destroyRenderTarget;
  gpu.renderer._textures=textures;api.register(gpu.renderer,'main');await api.initialize(gpu.renderer);
  assert.equal(textures._destroyRenderTarget,original,'the reproducible vendor patch owns this rule');
  assert.equal(gpu.renderer.userData.lkExternalDepthTextureOwnership,undefined);
});

// ================================================================== 05 store

test('disposeObject3D hands its frees to the backend instead of calling dispose itself', () => {
  const SOURCE = source('js/engine/scene-store.js');
  const block = SOURCE.slice(SOURCE.indexOf('function disposeObject3D'), SOURCE.indexOf('function logicElementElementPosition'));
  assert.match(block, /releaseGpuResources\(\(\) => \{/, 'the frees are wrapped, not immediate');
  const adapter = SOURCE.slice(SOURCE.indexOf('function releaseGpuResources'), SOURCE.indexOf('function disposeObject3D'));
  assert.match(adapter, /deferGpuRelease/, 'and the backend decides the timing');
  assert.match(adapter, /release\(\);/, 'with an immediate fallback when the backend is absent');
  // The traverse must not be inside the closure: by the time it runs the caller
  // has already detached and may have cleared the object.
  const traverse = block.indexOf('node.traverse(');
  const wrap = block.indexOf('releaseGpuResources(');
  assert.ok(traverse > 0 && traverse < wrap, 'the graph is read before the release is queued, not inside it');
});

test('the graph is read at once, so a caller may drop the object immediately', () => {
  // Held back for a frame and reading `node.children` late, the sweep would free
  // whatever the object happened to have left - which is nothing.
  const {disposeObject3D} = loadStoreDisposal();
  const log = [];
  const mesh = tag => {
    const node = {
      isMesh:true, children:[], geometry:{dispose(){ log.push('geometry:' + tag); }},
      material:{dispose(){ log.push('material:' + tag); }},
      traverse(fn){ fn(node); node.children.forEach(child => child.traverse(fn)); },
    };
    return node;
  };
  const queued = [];
  global.window = {LK_RUNTIME_RENDERING_BACKEND:{deferGpuRelease(release){ queued.push(release); return true; }}};
  try {
    const parent = mesh('parent');
    parent.children.push(mesh('child'));
    disposeObject3D(parent);
    assert.deepEqual(log, [], 'the deferred path frees nothing yet');
    parent.children.length = 0;
    parent.geometry = null;
    parent.material = null;
    queued.forEach(release => release());
  } finally { delete global.window; }
  ['geometry:parent', 'geometry:child', 'material:parent', 'material:child'].forEach(entry => {
    assert.ok(log.includes(entry), 'missing ' + entry + ' - it was gathered too late');
  });
});

test('scene-store never disposes geometry or material still shared by a live scene object', () => {
  const {disposeObject3D}=loadStoreDisposal(),log=[],queued=[];
  const geometry={dispose(){log.push('geometry');}},material={dispose(){log.push('material');}};
  const node=(geo,mat)=>{const item={geometry:geo,material:mat,children:[],traverse(fn){fn(item);item.children.forEach(child=>child.traverse(fn));}};return item;};
  const removed=node(geometry,material),live=node(geometry,material),scene=node(null,null);scene.children.push(live);
  global.window={LOT_KING:{core:{scene},world:{registry:[live]}},LK_RUNTIME_RENDERING_BACKEND:{deferGpuRelease(release){queued.push(release);return true;}}};
  try{disposeObject3D(removed);queued.forEach(release=>release());}
  finally{delete global.window;}
  assert.deepEqual(log,[],'shared GPU ownership remains with the live object');
});

(async () => {
  for(const item of cases){
    try { await item.run(); console.log('ok - ' + item.name); }
    catch(error){
      console.error('not ok - ' + item.name);
      console.error(error);
      process.exitCode = 1;
      return;
    }
  }
  console.log('\nwebgpu deferred disposal tests passed');
})();
