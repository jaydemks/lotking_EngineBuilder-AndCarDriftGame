/* Targeted policy for third-party diagnostics the engine cannot act on. */
(function(){
'use strict';
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
const gpuConsoleGroups = new Map();
let gpuConsoleUniquePrinted = 0;
console.warn = function(){
  const message = Array.from(arguments).map(value => String(value == null ? '' : value)).join(' ');
  if(message.indexOf('THREE.GLTFLoader: Custom UV set 1 for texture normalMap not yet supported.') >= 0) return;
  // Pinned three-gpu-pathtracer 0.0.24 still instantiates Clock internally and
  // passes the legacy BVH option name. Both are upstream compatibility notices,
  // not project failures; keep actionable renderer warnings visible.
  if(message.indexOf('THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.') >= 0) return;
  if(message.indexOf('MeshBVH: "maxLeafTris" option has been deprecated. Use "targetLeafSize", instead.') >= 0) return;
  originalWarn.apply(console, arguments);
};
function gpuConsoleSignature(message){
  return String(message||'').split('\n')[0]
    .replace(/[0-9a-f]{8}-[0-9a-f-]{20,}/ig,'<uuid>')
    .replace(/\b0x[0-9a-f]+\b/ig,'<hex>')
    .replace(/\b\d+\b/g,'#').slice(0,320);
}
function isGpuValidationMessage(message){
  const text=String(message||'');
  if(text.indexOf('LotKing WebGPU validation:')===0)return false;
  return /WebGPU|WGSL|GPUValidationError|validation error|render pipeline creation failed|used in submit while destroyed/i.test(text);
}
console.error = function(){
  const args=Array.from(arguments),message=args.map(value=>String(value==null?'':value&&value.message||value)).join(' ');
  if(!isGpuValidationMessage(message)){originalError.apply(console,args);return;}
  const signature=gpuConsoleSignature(message),count=(gpuConsoleGroups.get(signature)||0)+1;
  gpuConsoleGroups.set(signature,count);
  if(count===1&&gpuConsoleUniquePrinted<12){gpuConsoleUniquePrinted++;originalError.apply(console,args);}
  else if(count===10||count===100||count===1000)originalError('LotKing: repeated WebGPU diagnostic ×'+count,signature);
  window.dispatchEvent(new CustomEvent('lotking:webgpu-console-error',{detail:{signature,sample:message,count}}));
};
function isClosedExtensionChannel(message){
  const text=String(message||'');
  // Chrome extensions commonly leave a runtime messaging Promise behind when
  // their content script is replaced during iframe navigation. It is not an
  // application error and there is no LotKing listener that can answer it.
  return /listener indicated an asynchronous response/i.test(text)&&/message channel closed/i.test(text);
}
window.addEventListener('unhandledrejection', event => {
  const reason=event&&event.reason,message=String(reason&&reason.message||reason||'');
  if(!isClosedExtensionChannel(message))return;
  event.preventDefault();
  if(event.stopImmediatePropagation)event.stopImmediatePropagation();
},true);
window.addEventListener('error',event=>{
  const error=event&&event.error,message=String(event&&event.message||error&&error.message||error||'');
  if(!isClosedExtensionChannel(message))return;
  event.preventDefault();
  if(event.stopImmediatePropagation)event.stopImmediatePropagation();
},true);
})();
