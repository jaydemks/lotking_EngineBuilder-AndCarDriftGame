/* LOT KING — public Vehicle Pawn physics backend registry. */
(function(){
'use strict';
const API_VERSION = 1;
const backends = new Map();
function normalize(definition){
  if(!definition || !String(definition.id || '').trim()) throw new Error('Vehicle physics backend requires an id');
  return Object.freeze({id:String(definition.id), name:String(definition.name || definition.id), version:String(definition.version || '0.0.0'), apiVersion:Number(definition.apiVersion || API_VERSION), license:String(definition.license || 'unspecified'), repository:definition.repository || null, attribution:definition.attribution || null, managedByCore:definition.managedByCore === true, available:typeof definition.available === 'function' ? definition.available : () => true, create:typeof definition.create === 'function' ? definition.create : null});
}
function register(definition){ const backend = normalize(definition); if(backend.apiVersion !== API_VERSION) throw new Error('Unsupported Vehicle physics API version: ' + backend.apiVersion); backends.set(backend.id, backend); return backend; }
function get(id){ return backends.get(String(id || '')) || null; }
function list(){ return Array.from(backends.values()); }
function isAvailable(backend, context){ try { return !!(backend && backend.available(context || {})); } catch(err){ return false; } }
function resolve(id, context){
  const requested = String(id || 'auto');
  if(requested !== 'auto'){
    const exact = get(requested);
    if(isAvailable(exact, context)) return {backend:exact, requested, fallback:false, reason:null};
    return {backend:get('arcade-fallback'), requested, fallback:true, reason:exact ? 'Backend unavailable: ' + requested : 'Backend not installed: ' + requested};
  }
  const cannon = get('cannon-raycast');
  if(isAvailable(cannon, context)) return {backend:cannon, requested, fallback:false, reason:null};
  return {backend:get('arcade-fallback'), requested, fallback:true, reason:'Cannon RaycastVehicle unavailable'};
}
function manifest(id, context){ const selected = resolve(id, context), backend = selected.backend; return backend ? {type:'vehicle-physics-backend', id:backend.id, version:backend.version, apiVersion:backend.apiVersion, license:backend.license, repository:backend.repository, attribution:backend.attribution, requested:selected.requested, fallback:selected.fallback} : null; }
register({id:'cannon-raycast', name:'Cannon RaycastVehicle', version:'0.6.7-core', license:'MIT', managedByCore:true, available:() => !!(window.CANNON && window.CANNON.RaycastVehicle)});
register({id:'arcade-fallback', name:'Arcade Fallback', version:'0.6.7-core', license:'project', managedByCore:true});
window.LK_RUNTIME_VEHICLE_PHYSICS_BACKENDS = Object.freeze({API_VERSION, register, get, list, resolve, manifest});
})();
