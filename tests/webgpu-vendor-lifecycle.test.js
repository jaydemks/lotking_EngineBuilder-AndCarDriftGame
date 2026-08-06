'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {
  patchWebGPUTextureOwnership,
  patchWebGPUUtilsRetirement,
  patchWebGPUAttributeRetirement,
  patchWebGPUTextureRetirement,
  patchWebGPUBackendRetirement,
}=require('../scripts/build-three-compat.js');

const root=path.resolve(__dirname,'..');
const three=file=>fs.readFileSync(path.join(root,'node_modules','three','src',file),'utf8');

const textures=patchWebGPUTextureOwnership(three('renderers/common/Textures.js'));
assert.match(textures,/if \( depthTexture && depthTexture\.renderTarget === renderTarget \)/,
  'an externally supplied ShadowDepthTexture must not be resized or destroyed with a temporary target');
assert.equal((textures.match(/depthTexture && depthTexture\.renderTarget === renderTarget/g)||[]).length,3,
  'resize, sample-count change and teardown must share the upstream ownership rule');

const attributes=patchWebGPUAttributeRetirement(three('renderers/webgpu/utils/WebGPUAttributeUtils.js'));
assert.match(attributes,/retireResource\( backend\.device, data\.buffer \);[\s\S]*backend\.delete\( attribute \);/,
  'attribute bookkeeping is deleted now while its GPUBuffer retires after submit');

const textureUtils=patchWebGPUTextureRetirement(three('renderers/webgpu/utils/WebGPUTextureUtils.js'));
assert.match(textureUtils,/retireResource\( backend\.device, textureData\.texture \)/,
  'color and depth GPUTexture handles use the submit retirement queue');
assert.match(textureUtils,/retireResource\( backend\.device, textureData\.msaaTexture \)/,
  'MSAA attachments use the same lifetime contract');

const backend=patchWebGPUBackendRetirement(three('renderers/webgpu/WebGPUBackend.js'));
assert.match(backend,/retireResource\( this\.device, uniformBufferData\.buffer \);[\s\S]*this\.delete\( uniformBuffer \);/,
  'uniform buffers keep synchronous Three data-map invalidation');

// Exercise the exact injected retirement implementation with a tiny copy of
// Three's submit helper. This is behavioral: merely grepping for the helper
// would not catch an early destroy or a missing queue fence.
const fixture=`const _commandList = [];
export function submit( device, command ) {

\t_commandList[ 0 ] = command;

\tdevice.queue.submit( _commandList );

\t_commandList[ 0 ] = null;

}`;
const patched=patchWebGPUUtilsRetirement(fixture)
  .replace(/export function /g,'function ')+
  '\nthis.lifecycle={retireResource,submit};';
const sandbox={Promise,WeakMap,WeakSet};
vm.runInNewContext(patched,sandbox,{filename:'patched-WebGPUUtils.js'});

let finish;
const log=[];
const device={queue:{
  submit(list){log.push('submit:'+list[0]);},
  onSubmittedWorkDone(){log.push('fence');return new Promise(resolve=>{finish=resolve;});},
}};
const resource={destroy(){log.push('destroy');}};
assert.equal(sandbox.lifecycle.retireResource(device,resource),true);
assert.equal(sandbox.lifecycle.retireResource(device,resource),true,'duplicate retire requests are coalesced');
assert.deepEqual(log,[],'retirement alone never destroys before the encoded frame is submitted');
sandbox.lifecycle.submit(device,'frame');
assert.deepEqual(log,['submit:frame','fence'],'the queue fence is created after submit');
finish();

Promise.resolve().then(()=>{
  assert.deepEqual(log,['submit:frame','fence','destroy'],'the native resource is destroyed only after submitted work completes');

  const runtime=fs.readFileSync(path.join(root,'js/runtime/rendering-backend.js'),'utf8');
  assert.ok(!runtime.includes('Object.getPrototypeOf(buffer)')&&!runtime.includes('renderer._textures')&&!runtime.includes('_getBufferAttribute'),
    'runtime no longer mutates browser prototypes or Three private renderer fields');
  console.log('webgpu vendor lifecycle tests passed');
}).catch(error=>{console.error(error);process.exitCode=1;});
