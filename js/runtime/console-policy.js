/* Targeted policy for third-party diagnostics the engine cannot act on. */
(function(){
'use strict';
const originalWarn = console.warn.bind(console);
console.warn = function(){
  const message = Array.from(arguments).map(value => String(value == null ? '' : value)).join(' ');
  if(message.indexOf('THREE.GLTFLoader: Custom UV set 1 for texture normalMap not yet supported.') >= 0) return;
  originalWarn.apply(console, arguments);
};
window.addEventListener('unhandledrejection', event => {
  const reason = event && event.reason;
  const message = String(reason && reason.message || reason || '');
  if(message.indexOf('A listener indicated an asynchronous response by returning true') >= 0 && message.indexOf('message channel closed') >= 0) event.preventDefault();
});
})();
