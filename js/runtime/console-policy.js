/* Targeted policy for third-party diagnostics the engine cannot act on. */
(function(){
'use strict';
const originalWarn = console.warn.bind(console);
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
function isClosedExtensionChannel(message){
  const text=String(message||'');
  return text.indexOf('A listener indicated an asynchronous response by returning true')>=0&&text.indexOf('message channel closed')>=0;
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
