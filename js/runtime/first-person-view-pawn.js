/* =========================================================
   LOT KING — Optional first-person presentation Pawn

   A Character Pawn always owns the real animated body, its AnimationMixer,
   input and camera. This component owns only the optional classic shooter
   presentation (arms + weapon) and the lifetime of that extra visual.

   Keeping this boundary executable matters: an arms presentation can be
   switched off or removed without handing camera/input state between Pawns,
   and body mode cannot accidentally leave a second rig resident.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;
const KIND_ARMS = 'first-person-arms';
const KIND_NONE = 'none';
const OWNERSHIP = Object.freeze({camera:false, input:false, mixer:false, body:false, visual:true});

function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }

function legacyKind(legacy){
  const src = legacy && typeof legacy === 'object' ? legacy : {};
  if(src.presentation === 'arms') return KIND_ARMS;
  if(src.presentation === 'body') return KIND_NONE;
  return src.hideOwnBody === true ? KIND_ARMS : KIND_NONE;
}

function normalizeConfig(source, legacy){
  const src = source && typeof source === 'object' ? clone(source) : {};
  const fallback = legacyKind(legacy);
  const requested = String(src.kind || fallback).toLowerCase();
  const kind = requested === KIND_ARMS || requested === 'arms' ? KIND_ARMS : KIND_NONE;
  return {
    schemaVersion:SCHEMA_VERSION,
    kind,
    enabled:src.enabled == null ? kind === KIND_ARMS : src.enabled === true && kind === KIND_ARMS,
    showLegs:src.showLegs == null
      ? !!(legacy && legacy.showLegs === true)
      : src.showLegs === true,
  };
}

function create(pawn, source, legacy){
  let config = normalizeConfig(source, legacy);
  let visualOwner = null;
  let visualRelease = null;
  let disposed = false;

  function releaseVisual(owner){
    if(owner != null && owner !== visualOwner) return false;
    const release = visualRelease;
    visualOwner = null;
    visualRelease = null;
    if(typeof release === 'function') release();
    return !!release;
  }
  function active(){
    return !disposed && config.enabled && config.kind === KIND_ARMS &&
      !!(pawn && pawn.possessed && pawn.enabled !== false && pawn.hidden !== true);
  }
  function configure(patch){
    const next = Object.assign({}, config, patch && typeof patch === 'object' ? patch : {});
    if(patch && Object.prototype.hasOwnProperty.call(patch,'kind') &&
      !Object.prototype.hasOwnProperty.call(patch,'enabled')){
      next.enabled = patch.kind === KIND_ARMS || patch.kind === 'arms';
    }
    config = normalizeConfig(next, next);
    if(!active()) releaseVisual();
    return clone(config);
  }
  function claimVisual(owner, release){
    if(!active() || owner == null || typeof release !== 'function') return false;
    if(visualOwner !== owner) releaseVisual();
    visualOwner = owner;
    visualRelease = release;
    return true;
  }
  function dispose(){
    if(disposed) return false;
    disposed = true;
    releaseVisual();
    return true;
  }

  return Object.freeze({
    ownership:OWNERSHIP,
    config:() => clone(config),
    kind:() => config.kind,
    active,
    configure,
    claimVisual,
    releaseVisual,
    dispose,
    isDisposed:() => disposed,
  });
}

function attach(pawn, source, legacy){
  if(!pawn) return null;
  const existing = pawn.firstPersonViewPawn;
  if(existing && typeof existing.configure === 'function' &&
    !(typeof existing.isDisposed === 'function' && existing.isDisposed())){
    existing.configure(normalizeConfig(source, legacy));
    return existing;
  }
  const component = create(pawn, source, legacy);
  const previousDispose = pawn.dispose && pawn.dispose.bind(pawn);
  if(previousDispose){
    pawn.dispose = function(){ component.dispose(); return previousDispose(); };
  }
  pawn.firstPersonViewPawn = component;
  return component;
}

root.LK_RUNTIME_FIRST_PERSON_VIEW_PAWN = Object.freeze({
  SCHEMA_VERSION,
  KIND_ARMS,
  KIND_NONE,
  OWNERSHIP,
  normalizeConfig,
  create,
  attach,
});
})();
