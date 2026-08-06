'use strict';

const path=require('path');
const fs=require('fs');
const esbuild=require('esbuild');

const root=path.resolve(__dirname,'..');
const sharedThreeSource=path.join(root,'node_modules','three','src','Three.js');
const commonTexturesSource=path.join(root,'node_modules','three','src','renderers','common','Textures.js');
const outputFile=path.join(root,'vendor','three-r185-compat.min.js');

function patchWebGPUTextureOwnership(source){
  let output=source;
  const replacements=[
    [
      'if ( depthTexture ) {\n\n\t\t\t\tdepthTexture.needsUpdate = true;\n\t\t\t\tdepthTexture.image.width = mipWidth;',
      'if ( depthTexture && depthTexture.renderTarget === renderTarget ) {\n\n\t\t\t\tdepthTexture.needsUpdate = true;\n\t\t\t\tdepthTexture.image.width = mipWidth;',
    ],
    [
      'if ( depthTexture ) {\n\n\t\t\t\tdepthTexture.needsUpdate = true;\n\n\t\t\t}',
      'if ( depthTexture && depthTexture.renderTarget === renderTarget ) {\n\n\t\t\t\tdepthTexture.needsUpdate = true;\n\n\t\t\t}',
    ],
    [
      'if ( depthTexture ) {\n\n\t\t\t\tthis._destroyTexture( depthTexture );',
      'if ( depthTexture && depthTexture.renderTarget === renderTarget ) {\n\n\t\t\t\tthis._destroyTexture( depthTexture );',
    ],
  ];
  replacements.forEach(([before,after])=>{
    if(!output.includes(before))throw new Error('Three.js r185 WebGPU ownership patch no longer matches Textures.js');
    output=output.replace(before,after);
  });
  return output;
}

function replaceRequired(source,before,after,label){
  if(!source.includes(before))throw new Error('Three.js r185 WebGPU patch no longer matches '+label);
  return source.replace(before,after);
}

// GPUBuffer/GPUTexture.destroy() is immediate. If Three invalidates a resource
// after encoding a pass but before that pass is submitted, Chrome rejects the
// entire command buffer (`used in submit while destroyed`). Keep Three's cache
// deletion synchronous, but retire the native handle after the *next* submit
// that can contain the already encoded resource has completed.
//
// This is injected into the pinned Three source at build time. It deliberately
// replaces the old runtime patches of GPUDevice/GPUBuffer prototypes and
// renderer private fields: the policy now lives beside Three's submit boundary,
// has one owner and fails the build if an upstream upgrade changes that boundary.
function patchWebGPUUtilsRetirement(source){
  const anchor='export function submit( device, command ) {\n\n\t_commandList[ 0 ] = command;';
  const replacement=`const _retirementStates = new WeakMap();

/**
 * Retires a native WebGPU resource after the next submission using it drains.
 * @private
 */
export function retireResource( device, resource ) {

\tif ( resource === undefined || resource === null || typeof resource.destroy !== 'function' ) return false;

\tconst queue = device && device.queue;

\tif ( queue === undefined || typeof queue.onSubmittedWorkDone !== 'function' ) {

\t\tresource.destroy();
\t\treturn false;

\t}

\tlet state = _retirementStates.get( device );

\tif ( state === undefined ) {

\t\tstate = { pending: [], queued: new WeakSet() };
\t\t_retirementStates.set( device, state );

\t}

\tif ( state.queued.has( resource ) ) return true;

\tstate.queued.add( resource );
\tstate.pending.push( resource );

\treturn true;

}

function drainRetiredResources( device ) {

\tconst state = _retirementStates.get( device );

\tif ( state === undefined || state.pending.length === 0 ) return;

\tconst batch = state.pending.splice( 0, state.pending.length );
\tconst release = () => {

\t\tfor ( const resource of batch ) {

\t\t\tstate.queued.delete( resource );
\t\t\ttry { resource.destroy(); } catch ( error ) { /* device loss already reclaimed it */ }

\t\t}

\t};

\tconst discard = () => {

\t\tfor ( const resource of batch ) state.queued.delete( resource );

\t};

\tPromise.resolve( device.queue.onSubmittedWorkDone() ).then( release, discard );

}

export function submit( device, command ) {

\t_commandList[ 0 ] = command;`;
  let output=replaceRequired(source,anchor,replacement,'WebGPUUtils.submit');
  output=replaceRequired(output,
    '\tdevice.queue.submit( _commandList );\n\n\t_commandList[ 0 ] = null;',
    '\tdevice.queue.submit( _commandList );\n\n\t_commandList[ 0 ] = null;\n\n\tdrainRetiredResources( device );',
    'WebGPUUtils queue submission');
  return output;
}

function patchWebGPUAttributeRetirement(source){
  let output=replaceRequired(source,
    "import { submit } from './WebGPUUtils.js';",
    "import { submit, retireResource } from './WebGPUUtils.js';",
    'WebGPUAttributeUtils import');
  output=replaceRequired(output,
    '\t\tdata.buffer.destroy();\n\n\t\tbackend.delete( attribute );',
    '\t\tretireResource( backend.device, data.buffer );\n\n\t\tbackend.delete( attribute );',
    'WebGPUAttributeUtils.destroyAttribute');
  return output;
}

function patchWebGPUTextureRetirement(source){
  let output=replaceRequired(source,
    "import { submit } from './WebGPUUtils.js';",
    "import { submit, retireResource } from './WebGPUUtils.js';",
    'WebGPUTextureUtils import');
  output=replaceRequired(output,
    "if ( textureData.texture !== undefined && isDefaultTexture === false && texture.isExternalTexture !== true ) textureData.texture.destroy();",
    "if ( textureData.texture !== undefined && isDefaultTexture === false && texture.isExternalTexture !== true ) retireResource( backend.device, textureData.texture );",
    'WebGPUTextureUtils color/depth destroy');
  output=replaceRequired(output,
    'if ( textureData.msaaTexture !== undefined ) textureData.msaaTexture.destroy();',
    'if ( textureData.msaaTexture !== undefined ) retireResource( backend.device, textureData.msaaTexture );',
    'WebGPUTextureUtils MSAA destroy');
  return output;
}

function patchWebGPUBackendRetirement(source){
  let output=replaceRequired(source,
    "import WebGPUUtils, { submit } from './utils/WebGPUUtils.js';",
    "import WebGPUUtils, { submit, retireResource } from './utils/WebGPUUtils.js';",
    'WebGPUBackend import');
  output=replaceRequired(output,
    '\t\tuniformBufferData.buffer.destroy();\n\n\t\tthis.delete( uniformBuffer );',
    '\t\tretireResource( this.device, uniformBufferData.buffer );\n\n\t\tthis.delete( uniformBuffer );',
    'WebGPUBackend.destroyUniformBuffer');
  return output;
}

function patchWebGPUSource(file,source){
  if(file.endsWith('/WebGPUUtils.js'))return patchWebGPUUtilsRetirement(source);
  if(file.endsWith('/WebGPUAttributeUtils.js'))return patchWebGPUAttributeRetirement(source);
  if(file.endsWith('/WebGPUTextureUtils.js'))return patchWebGPUTextureRetirement(source);
  if(file.endsWith('/WebGPUBackend.js'))return patchWebGPUBackendRetirement(source);
  return source;
}

function buildThreeCompat(){
return esbuild.build({
  entryPoints:[path.join(root,'js','vendor','three-r185-compat.entry.js')],
  bundle:true,
  format:'iife',
  platform:'browser',
  target:'es2020',
  minify:true,
  legalComments:'none',
  outfile:outputFile,
  plugins:[{
    name:'lotking-shared-three-source',
    setup(build){
      // Three's WebGPU entry is source-based. Resolve every exact bare
      // `three` import used by addons and three-gpu-pathtracer to that same
      // source graph, otherwise Color/Material instanceof checks split across
      // two copies of the library.
      build.onResolve({filter:/^three$/},()=>({path:sharedThreeSource}));
      // r185.1 treats an externally supplied render-target depth texture as if
      // the target owned it. ShadowNode supplies ShadowDepthTexture externally,
      // so a target resize/retirement can destroy a texture still referenced by
      // the lighting bind group. These are the three ownership guards present
      // in current upstream Three.js: resize, sample-count change and teardown.
      // Applying them while bundling keeps the checked-in artifact reproducible
      // without editing ignored node_modules files.
      build.onLoad({filter:/[\\/]three[\\/]src[\\/]renderers[\\/]common[\\/]Textures\.js$/},args=>({
        contents:patchWebGPUTextureOwnership(fs.readFileSync(args.path,'utf8')),
        loader:'js',
      }));
      build.onLoad({filter:/[\\/]three[\\/]src[\\/]renderers[\\/]webgpu[\\/](?:WebGPUBackend|utils[\\/]WebGPU(?:Utils|AttributeUtils|TextureUtils))\.js$/},args=>({
        contents:patchWebGPUSource(args.path.replace(/\\/g,'/'),fs.readFileSync(args.path,'utf8')),
        loader:'js',
      }));
    },
  }],
}).then(()=>{
  // Some upstream WGSL/GLSL template literals contain spaces immediately
  // before a newline. Removing only end-of-line whitespace keeps the generated
  // artifact reproducible and lets repository whitespace validation stay clean.
  const output=fs.readFileSync(outputFile,'utf8').replace(/[ \t]+(?=\r?$)/gm,'');
  fs.writeFileSync(outputFile,output);
});
}

if(require.main===module){
  buildThreeCompat().catch(error=>{
    console.error(error);
    process.exitCode=1;
  });
}

module.exports={buildThreeCompat,patchWebGPUTextureOwnership,patchWebGPUUtilsRetirement,patchWebGPUAttributeRetirement,patchWebGPUTextureRetirement,patchWebGPUBackendRetirement,patchWebGPUSource};
