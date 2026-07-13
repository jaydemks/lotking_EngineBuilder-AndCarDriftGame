/* =========================================================
   LOT KING - Generic Pawn Core
   Reusable identity, lifecycle, flags, possession and components.
   Vehicle, Human and Animal Pawns build on this contract.
   ========================================================= */
(function(){
'use strict';

const VERSION = 1;

function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function normalizePlayerId(value){
  if(value == null || value === '' || value === 'none' || Number(value) < 1) return null;
  return Math.max(1, Math.min(4, Number(value) | 0));
}
function normalizeFlags(source){
  const src = source || {};
  const playerId = normalizePlayerId(src.playerId);
  return {
    enabled:src.enabled !== false,
    hidden:src.hidden === true,
    possessed:src.possessed !== false && playerId != null,
    editorOnly:src.editorOnly === true,
    runtimeOnly:src.runtimeOnly === true,
    playerId,
  };
}

function createRecord(options){
  const opts = options || {};
  const config = opts.config || {};
  const flags = normalizeFlags(config);
  const record = {
    id:String(opts.id || ''),
    kind:String(opts.kind || 'pawn'),
    config,
    state:opts.state || {},
    enabled:flags.enabled,
    hidden:flags.hidden,
    possessed:flags.possessed,
    editorOnly:flags.editorOnly,
    runtimeOnly:flags.runtimeOnly,
    playerId:flags.playerId,
    started:false,
    sleeping:false,
    disposed:false,
    start(){ this.started = true; this.sleeping = false; if(opts.onStart) opts.onStart(this); return this; },
    step(dt){ if(this.started && !this.sleeping && !this.disposed && opts.onStep) opts.onStep(this, dt); },
    reset(){ return opts.onReset ? opts.onReset(this) : true; },
    possess(playerId, force){ return opts.onPossess ? opts.onPossess(this, normalizePlayerId(playerId), force === true) : false; },
    unpossess(){ return opts.onUnpossess ? opts.onUnpossess(this) : false; },
    setEnabled(value){ this.enabled = value !== false; this.config.enabled = this.enabled; if(opts.onEnabled) opts.onEnabled(this, this.enabled); return this.enabled; },
    setHidden(value){ this.hidden = value === true; this.config.hidden = this.hidden; if(opts.onHidden) opts.onHidden(this, this.hidden); return this.hidden; },
    sleep(){ this.sleeping = true; if(opts.onSleep) opts.onSleep(this); return true; },
    wake(){ this.sleeping = false; if(opts.onWake) opts.onWake(this); return true; },
    dispose(){ if(this.disposed) return false; this.disposed = true; this.started = false; if(opts.onDispose) opts.onDispose(this); return true; },
    snapshot(){ return {id:this.id, kind:this.kind, config:clone(this.config), state:clone(this.state)}; },
  };
  return record;
}

function createComponentRegistry(){
  const factories = new Map();
  return Object.freeze({
    register(type, factory){
      const key = String(type || '').trim().toLowerCase();
      if(!key || typeof factory !== 'function') throw new Error('Pawn component requires type and factory');
      factories.set(key, factory); return key;
    },
    unregister(type){ return factories.delete(String(type || '').toLowerCase()); },
    has(type){ return factories.has(String(type || '').toLowerCase()); },
    create(type, options){ const factory = factories.get(String(type || '').toLowerCase()); return factory ? factory(options || {}) : null; },
    list(){ return Array.from(factories.keys()).sort(); },
  });
}

function install(GAME){
  if(!GAME) return null;
  if(GAME.pawnCore && GAME.pawnCore.version === VERSION) return GAME.pawnCore;
  const api = Object.freeze({version:VERSION, normalizePlayerId, normalizeFlags, createRecord, components:createComponentRegistry()});
  GAME.pawnCore = api;
  if(GAME.systems) GAME.systems.pawnCore = api;
  return api;
}

window.LK_RUNTIME_PAWN_CORE = Object.freeze({VERSION, normalizePlayerId, normalizeFlags, createRecord, createComponentRegistry, install});
})();
