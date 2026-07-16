/* =========================================================
   LOT KING - Soccer Pawn contract and per-instance runtime
   Humanoid character Pawn for the soccer game mode (penalty
   shootout first). Built on pawn-core, registered inside the
   shared GAME.pawns registry so P1-P4 possession, logic nodes
   and Play Preview lifecycle behave exactly like Vehicle Pawns.
   ========================================================= */
(function(){
'use strict';

const SCHEMA_VERSION = 1;
let nextPawnId = 1;

const ROLES = ['striker', 'winger', 'midfielder', 'defender', 'goalkeeper'];

// Suggested Mixamo clip names per action. These are authoring hints: the
// locomotion controller matches clip names fuzzily, and every slot can be
// overridden per instance from the Inspector.
const ROLE_ANIMATION_DEFAULTS = {
  common:{
    idle:'Idle',
    walk:'Walking',
    run:'Running',
    strafeLeft:'Left Strafe',
    strafeRight:'Right Strafe',
    jump:'Jump',
    celebrate:'Victory',
    defeat:'Defeated',
  },
  striker:{shoot:'Soccer Strike', pass:'Soccer Pass', cross:'Soccer Pass'},
  winger:{shoot:'Soccer Strike', pass:'Soccer Pass', cross:'Soccer Pass'},
  midfielder:{shoot:'Soccer Strike', pass:'Soccer Pass', cross:'Soccer Pass'},
  defender:{shoot:'Soccer Strike', pass:'Soccer Pass', tackle:'Soccer Tackle'},
  goalkeeper:{save:'Goalkeeper Catch', diveLeft:'Goalkeeper Dive Left', diveRight:'Goalkeeper Dive Right', shoot:'Soccer Strike', pass:'Soccer Pass'},
};

// Which actions each role exposes; drives editor hints and Play Action guards.
const ROLE_ACTIONS = {
  striker:['shoot', 'pass', 'cross', 'celebrate', 'defeat'],
  winger:['shoot', 'pass', 'cross', 'celebrate', 'defeat'],
  midfielder:['shoot', 'pass', 'cross', 'celebrate', 'defeat'],
  defender:['shoot', 'pass', 'tackle', 'celebrate', 'defeat'],
  goalkeeper:['save', 'diveLeft', 'diveRight', 'pass', 'celebrate', 'defeat'],
};

function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

function normalizeRole(value){
  const role = String(value || '').trim().toLowerCase();
  return ROLES.indexOf(role) >= 0 ? role : 'striker';
}

function normalizePlayerId(value){
  if(window.LK_RUNTIME_PAWN_CORE) return window.LK_RUNTIME_PAWN_CORE.normalizePlayerId(value);
  if(value == null || value === '' || value === 'none' || Number(value) < 1) return null;
  return clamp(Number(value) | 0, 1, 4);
}

function roleAnimationDefaults(role){
  return Object.assign({}, ROLE_ANIMATION_DEFAULTS.common, ROLE_ANIMATION_DEFAULTS[normalizeRole(role)] || {});
}

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? clone(source) : {};
  const role = normalizeRole(src.role);
  const movement = src.movement || {};
  const locomotion = src.locomotion || {};
  const keeper = src.keeper || {};
  const spawn = src.spawn || {};
  const playerId = normalizePlayerId(src.playerId);
  return Object.assign({}, src, {
    schemaVersion:SCHEMA_VERSION,
    role,
    enabled:src.enabled !== false,
    hidden:src.hidden === true,
    possessed:src.possessed !== false && playerId != null,
    playerId,
    spawn:{x:finite(spawn.x, 0), y:finite(spawn.y, 0), z:finite(spawn.z, 0), heading:finite(spawn.heading, 0)},
    movement:{
      walkSpeed:clamp(finite(movement.walkSpeed, 1.9), .2, 6),
      runSpeed:clamp(finite(movement.runSpeed, 6), .5, 12),
      sprintMultiplier:clamp(finite(movement.sprintMultiplier, 1.35), 1, 2.2),
      acceleration:clamp(finite(movement.acceleration, 14), 1, 60),
      turnRate:clamp(finite(movement.turnRate, 10), .5, 30),
      jumpHeight:clamp(finite(movement.jumpHeight, 1.1), 0, 5),
      gravity:clamp(finite(movement.gravity, 22), 1, 80),
      airControl:clamp(finite(movement.airControl, .35), 0, 1),
      inputMode:movement.inputMode === 'heading' ? 'heading' : 'camera',
    },
    animationLibrary:src.animationLibrary && typeof src.animationLibrary === 'object' ? clone(src.animationLibrary) : null,
    locomotion:{
      responsiveness:clamp(finite(locomotion.responsiveness, 9), .5, 30),
      predictionTime:clamp(finite(locomotion.predictionTime, .12), 0, .6),
    },
    keeper:{
      diveDistance:clamp(finite(keeper.diveDistance, 2.6), .5, 5),
      diveDuration:clamp(finite(keeper.diveDuration, .55), .2, 1.5),
      reach:clamp(finite(keeper.reach, 1.1), .4, 2.5),
    },
    animations:Object.assign(roleAnimationDefaults(role), src.animations || {}),
    appearance:Object.assign({
      shirtColor:'#e11d48', shortsColor:'#f8fafc', socksColor:'#e11d48',
      hairColor:'#2b2118', skinColor:'#d8a184', hairStyle:'short', number:9,
    }, src.appearance || {}),
    camera:Object.assign({mode:'arcade', distance:7.5, height:2.6, lag:6.5, fov:60}, src.camera || {}),
  });
}

function neutralMove(){
  return {x:0, z:0, sprint:false, jump:false, action:false, device:null};
}

// ---- Shared animation-library GLB loader (clips-only Mixamo files) --------
// Clips from a library GLB play on the character mixer as long as the bone
// names match (standard Mixamo rig). Cached per asset reference.
const animationLibraryCache = new Map();
function animationLibraryKey(ref){
  return ref && typeof ref === 'object' ? String(ref.dbKey || ref.key || ref.id || ref.src || '') : '';
}
function resolveAssetUrl(ref){
  if(ref.dbKey && window.LK_ASSET_BLOBS) return window.LK_ASSET_BLOBS.getUrl(ref.dbKey);
  if(ref.src) return Promise.resolve(ref.src);
  return Promise.reject(new Error('Animation library source missing'));
}
function loadAnimationLibrary(ref){
  const key = animationLibraryKey(ref);
  if(!key) return Promise.resolve(null);
  let pending = animationLibraryCache.get(key);
  if(!pending){
    pending = resolveAssetUrl(ref).then(url => new Promise((resolve, reject) => {
      const THREE = window.THREE;
      if(!THREE || !THREE.GLTFLoader) return reject(new Error('GLTFLoader unavailable'));
      new THREE.GLTFLoader().load(url, gltf => {
        const clips = (gltf && gltf.animations || []).filter(Boolean);
        resolve({clips, names:clips.map(clip => clip.name || 'Animation')});
      }, undefined, reject);
    }));
    animationLibraryCache.set(key, pending);
    pending.catch(() => animationLibraryCache.delete(key));
  }
  return pending;
}

function emitPawnEvent(pawn, type, payload){
  if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
  window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type, pawn, pawnId:pawn && pawn.id || null}, payload || {})}));
}

// Material tint heuristics for appearance live-edit. Works both on the
// primitive placeholder rig and on imported Mixamo GLB material names.
const APPEARANCE_RULES = [
  {key:'shirtColor', match:/shirt|jersey|maglia|torso|top|chest|body(?!suit)/i},
  {key:'shortsColor', match:/short|pant|legs?\b|pantalon/i},
  {key:'socksColor', match:/sock|shoe|boot|feet|foot|calz/i},
  {key:'hairColor', match:/hair|capell|beard|barba/i},
  {key:'skinColor', match:/skin|face|head|arm|hand|pelle/i},
];

function applyAppearanceToNode(root, appearance){
  if(!root || !root.traverse) return 0;
  let applied = 0;
  root.traverse(node => {
    if(!node.isMesh || !node.material) return;
    const label = [node.name, node.material.name, node.parent && node.parent.name].join(' ');
    const rule = APPEARANCE_RULES.find(item => item.match.test(label));
    if(!rule || !appearance[rule.key]) return;
    if(!node.userData.soccerTintOwned){
      node.material = node.material.clone();
      node.userData.soccerTintOwned = true;
    }
    if(node.material.color && node.material.color.set){
      node.material.color.set(appearance[rule.key]);
      node.material.needsUpdate = true;
      applied++;
    }
  });
  return applied;
}

function createLogic(GAME, owner, config, services){
  if(!owner) throw new Error('Soccer Pawn requires an owner');
  const registry = GAME && GAME.pawns;
  if(!registry || !registry.register) return null;
  const existingId = owner.userData && owner.userData.soccerPawnId;
  if(existingId && registry.get(existingId)) return registry.get(existingId);

  const cfg = normalizeConfig(config);
  if(owner.position && cfg.spawn.x === 0 && cfg.spawn.y === 0 && cfg.spawn.z === 0){
    cfg.spawn = {
      x:finite(owner.position.x, 0), y:finite(owner.position.y, 0), z:finite(owner.position.z, 0),
      heading:owner.rotation ? finite(owner.rotation.y, 0) : 0,
    };
  }
  const preferred = owner.userData && (owner.userData.logicInstanceId || owner.userData.editorId) || cfg.id || ('soccer-pawn-' + nextPawnId++);
  const state = {
    role:cfg.role, speed:0, speedKmh:0, moving:false, sprinting:false,
    action:null, actionTime:0, diving:false, diveDirection:0,
    velocityX:0, velocityZ:0, heading:cfg.spawn.heading,
  };

  const core = window.LK_RUNTIME_PAWN_CORE;
  const pawn = core ? core.createRecord({
    id:String(preferred), kind:'logic-element', config:cfg, state,
    onPossess:(record, playerId, force) => registry.claimPlayerSlot ? registry.claimPlayerSlot(record, playerId, force) : false,
    onUnpossess:record => {
      const playerId = record.playerId;
      if(registry.releasePlayerSlot) registry.releasePlayerSlot(record);
      record.playerId = null; record.possessed = false;
      if(playerId != null) emitPawnEvent(record, 'OnPawnUnpossessed', {playerId});
      return true;
    },
  }) : null;
  if(!pawn) return null;
  pawn.pawnType = 'soccer';
  pawn.owner = owner;
  pawn.services = services || {};
  pawn.control = null;
  pawn.locomotion = null;
  pawn.locomotionNode = null;
  pawn.appearanceApplied = false;
  pawn.libraryClips = null;
  pawn.libraryLoadKey = null;
  pawn.movementController = window.LK_RUNTIME_CHARACTER_MOVEMENT
    ? window.LK_RUNTIME_CHARACTER_MOVEMENT.create(GAME, cfg.movement)
    : null;

  pawn.readPlayerDrive = function(){
    if(!this.possessed || this.playerId == null || !GAME || !GAME.input || !GAME.input.player) return neutralMove();
    if(GAME.input.ensurePlayerSlot) GAME.input.ensurePlayerSlot(this.playerId - 1);
    const view = GAME.input.player(this.playerId - 1);
    const drive = view && view.drive ? view.drive() : null;
    if(!drive) return neutralMove();
    // Shared input map: steer -> lateral, throttle/brake -> forward/back,
    // handbrake -> sprint. Keeps keyboard/gamepad profiles reusable.
    return {
      x:clamp(finite(drive.steer, 0), -1, 1),
      z:clamp(finite(drive.throttle, 0) - finite(drive.brake, 0), -1, 1),
      sprint:drive.handbrake === true,
      jump:drive.reset === true,
      action:drive.highBeams === true,
      device:view && view.device ? view.device() : null,
    };
  };

  pawn.setMoveInput = function(input){
    this.control = Object.assign(neutralMove(), input || {});
    return this.control;
  };
  pawn.clearControl = function(){ this.control = null; };

  pawn.setRole = function(role){
    const next = normalizeRole(role);
    if(next === this.config.role) return next;
    this.config.role = next;
    this.state.role = next;
    // Re-seed animation slots the author did not override explicitly.
    this.config.animations = Object.assign(roleAnimationDefaults(next), this.config.animationOverrides || {});
    this.rebindLocomotion();
    emitPawnEvent(this, 'OnPawnRoleChanged', {role:next});
    return next;
  };
  pawn.setMovement = function(patch){
    Object.assign(this.config.movement, patch || {});
    this.config.movement = normalizeConfig(this.config).movement;
    if(this.locomotion) this.locomotion.configure({walkSpeed:this.config.movement.walkSpeed, runSpeed:this.config.movement.runSpeed});
    if(this.movementController) this.movementController.configure(this.config.movement);
    return this.config.movement;
  };
  pawn.setAnimationLibrary = function(ref){
    let value = ref;
    if(typeof value === 'string'){
      const text = value.trim();
      if(!text){ value = null; }
      else { try { value = JSON.parse(text); } catch(err){ value = {src:text, name:text}; } }
    }
    this.config.animationLibrary = value && typeof value === 'object' ? value : null;
    this.libraryClips = null;
    this.libraryLoadKey = null;
    this.ensureAnimationLibrary();
    return this.config.animationLibrary;
  };
  pawn.ensureAnimationLibrary = function(){
    const ref = this.config.animationLibrary;
    const key = animationLibraryKey(ref);
    if(!key || this.libraryLoadKey === key) return;
    this.libraryLoadKey = key;
    const self = this;
    loadAnimationLibrary(ref).then(library => {
      if(!library || self.disposed || self.libraryLoadKey !== key) return;
      self.libraryClips = library.clips;
      if(self.owner && self.owner.userData) self.owner.userData.soccerLibraryClipNames = library.names.slice();
      self.rebindLocomotion();
      emitPawnEvent(self, 'OnPawnAnimationsBound', {clips:library.names, source:'library'});
    }).catch(err => {
      if(self.owner && self.owner.userData) self.owner.userData.soccerLibraryClipError = String(err && err.message || err);
    });
  };
  pawn.jump = function(){
    if(!this.movementController || this.state.diving) return false;
    if(!this.movementController.jump()) return false;
    const locomotion = this.ensureLocomotion();
    if(locomotion && this.config.animations.jump) locomotion.playAction(this.config.animations.jump, {fadeIn:.06, fadeOut:.14});
    emitPawnEvent(this, 'OnSoccerActionStarted', {action:'jump', role:this.config.role});
    return true;
  };
  pawn.setLocomotion = function(patch){
    Object.assign(this.config.locomotion, patch || {});
    this.config.locomotion = normalizeConfig(this.config).locomotion;
    if(this.locomotion) this.locomotion.configure(this.config.locomotion);
    return this.config.locomotion;
  };
  pawn.setKeeper = function(patch){
    Object.assign(this.config.keeper, patch || {});
    this.config.keeper = normalizeConfig(this.config).keeper;
    return this.config.keeper;
  };
  pawn.setAnimations = function(patch){
    this.config.animationOverrides = Object.assign({}, this.config.animationOverrides || {}, patch || {});
    Object.assign(this.config.animations, patch || {});
    this.rebindLocomotion();
    return this.config.animations;
  };
  pawn.setAppearance = function(patch){
    Object.assign(this.config.appearance, patch || {});
    this.appearanceApplied = false;
    return this.config.appearance;
  };
  pawn.setCamera = function(patch){
    const next = Object.assign({}, patch || {});
    // View presets (third / close / first-person lite) from the shared
    // character movement module map onto the follow-camera parameters.
    const presets = window.LK_RUNTIME_CHARACTER_MOVEMENT && window.LK_RUNTIME_CHARACTER_MOVEMENT.VIEW_PRESETS;
    if(next.view && presets && presets[next.view]) Object.assign(next, presets[next.view]);
    this.config.camera = Object.assign({}, this.config.camera || {}, next);
    // Mirror onto the arcade camera keys the shared follow camera reads.
    this.config.camera.arcadeDistance = finite(this.config.camera.distance, 7.5);
    this.config.camera.arcadeHeight = finite(this.config.camera.height, 2.6);
    this.config.camera.arcadeLag = finite(this.config.camera.lag, 6.5);
    this.cameraRuntime = null;
    return this.config.camera;
  };
  pawn.possessCamera = function(value){
    if(!GAME || !GAME.state) return false;
    const playerId = normalizePlayerId(this.playerId);
    const outputs = GAME.state.runtimeVehicleCameraPawnIds || (GAME.state.runtimeVehicleCameraPawnIds = {});
    if(value === false){
      Object.keys(outputs).forEach(key => { if(outputs[key] === this.id) delete outputs[key]; });
      if(GAME.state.runtimeVehicleCameraPawnId === this.id) GAME.state.runtimeVehicleCameraPawnId = null;
      return true;
    }
    if(playerId == null) return false;
    outputs[playerId] = this.id;
    if(playerId === 1) GAME.state.runtimeVehicleCameraPawnId = this.id;
    return true;
  };
  pawn.setHidden = function(value){
    this.hidden = value === true; this.config.hidden = this.hidden;
    if(this.owner) this.owner.visible = !this.hidden;
    return this.hidden;
  };

  pawn.findLocomotionNode = function(){
    let withMixer = null, assetHolder = null;
    if(this.owner && this.owner.traverse) this.owner.traverse(node => {
      if(!withMixer && node.userData && node.userData.logicAnimationMixer) withMixer = node;
      // Mesh-only GLB holder: still bindable when a separate animation
      // library provides the clips.
      if(!assetHolder && node.userData && node.userData.logicElementAssetKey) assetHolder = node;
    });
    return withMixer || assetHolder;
  };
  pawn.rebindLocomotion = function(){
    if(this.locomotion) this.locomotion.dispose();
    this.locomotion = null;
    this.locomotionNode = null;
    this.appearanceApplied = false;
  };
  pawn.ensureLocomotion = function(){
    if(this.locomotion && this.locomotion.isBound()) return this.locomotion;
    if(!window.LK_RUNTIME_SOCCER_LOCOMOTION) return null;
    this.ensureAnimationLibrary();
    const node = this.findLocomotionNode();
    if(!node || node === this.locomotionNode) return null;
    const controller = window.LK_RUNTIME_SOCCER_LOCOMOTION.createController({
      THREERef:window.THREE,
      walkSpeed:this.config.movement.walkSpeed,
      runSpeed:this.config.movement.runSpeed,
      responsiveness:this.config.locomotion.responsiveness,
      predictionTime:this.config.locomotion.predictionTime,
    });
    if(controller.bind(node, this.config.animations, this.libraryClips)){
      this.locomotion = controller;
      this.locomotionNode = node;
      this.owner.userData.soccerAnimationClips = controller.availableClips();
      emitPawnEvent(this, 'OnPawnAnimationsBound', {clips:controller.availableClips()});
    }
    return this.locomotion;
  };

  pawn.availableActions = function(){
    return (ROLE_ACTIONS[this.config.role] || ROLE_ACTIONS.striker).slice();
  };
  pawn.playAction = function(name, options){
    const action = String(name || '').trim();
    if(!action) return false;
    const opts = options || {};
    const clip = this.config.animations[action] || action;
    const locomotion = this.ensureLocomotion();
    this.state.action = action;
    this.state.actionTime = 0;
    if(this.config.role === 'goalkeeper' && (action === 'diveLeft' || action === 'diveRight')){
      this.state.diving = true;
      this.state.diveDirection = action === 'diveLeft' ? -1 : 1;
      this.state.diveElapsed = 0;
    }
    emitPawnEvent(this, 'OnSoccerActionStarted', {action, role:this.config.role});
    const finish = () => {
      if(this.state.action === action) this.state.action = null;
      emitPawnEvent(this, 'OnSoccerActionFinished', {action, role:this.config.role});
    };
    if(!(locomotion && locomotion.playAction(clip, Object.assign({onDone:finish}, opts)))){
      // No usable clip: keep gameplay timing alive with a fixed-length fallback.
      this.state.actionFallbackTimer = clamp(finite(opts.duration, .8), .1, 5);
      this.state.actionFallbackFinish = finish;
    }
    return true;
  };

  pawn.applyAppearance = function(){
    const applied = applyAppearanceToNode(this.owner, this.config.appearance);
    this.appearanceApplied = true;
    return applied;
  };

  // Generic exposed-variable binding entry point used by the logic runner for
  // non-vehicle Pawns (binding paths like "movement.runSpeed").
  pawn.applyBinding = function(path, value){
    const key = String(path || '');
    if(key === 'role'){ this.setRole(value); return true; }
    if(key === 'animationLibrary'){ this.setAnimationLibrary(value); return true; }
    if(key.indexOf('movement.') === 0){ this.setMovement({[key.slice(9)]:value}); return true; }
    if(key.indexOf('locomotion.') === 0){ this.setLocomotion({[key.slice(11)]:value}); return true; }
    if(key.indexOf('keeper.') === 0){ this.setKeeper({[key.slice(7)]:value}); return true; }
    if(key.indexOf('animations.') === 0){ this.setAnimations({[key.slice(11)]:value}); return true; }
    if(key.indexOf('appearance.') === 0){ this.setAppearance({[key.slice(11)]:value}); return true; }
    if(key.indexOf('camera.') === 0){ this.setCamera({[key.slice(7)]:value}); return true; }
    return false;
  };

  pawn.reset = function(){
    const spawn = this.config.spawn;
    if(this.owner && this.owner.position) this.owner.position.set(spawn.x, spawn.y, spawn.z);
    if(this.owner && this.owner.rotation) this.owner.rotation.y = spawn.heading;
    this.state.velocityX = 0; this.state.velocityZ = 0;
    this.state.heading = spawn.heading;
    this.state.action = null; this.state.diving = false;
    if(this.movementController) this.movementController.reset(spawn.heading);
    emitPawnEvent(this, 'OnPawnReset', {});
    return true;
  };

  const baseStart = pawn.start.bind(pawn);
  pawn.start = function(){
    baseStart();
    this.setHidden(this.hidden);
    return this;
  };

  pawn.step = function(dt){
    if(!this.started || this.sleeping || this.disposed || !this.enabled) return;
    const h = clamp(finite(dt, .016), .0001, .1);
    const move = this.control ? this.control : this.readPlayerDrive();

    // Fallback action timing when no clip could be played.
    if(this.state.actionFallbackTimer > 0){
      this.state.actionFallbackTimer -= h;
      if(this.state.actionFallbackTimer <= 0 && this.state.actionFallbackFinish){
        const finish = this.state.actionFallbackFinish;
        this.state.actionFallbackFinish = null;
        finish();
      }
    }
    this.state.actionTime += h;

    // Goalkeeper dive: scripted lateral displacement, input suppressed.
    if(this.state.diving){
      const keeper = this.config.keeper;
      this.state.diveElapsed = (this.state.diveElapsed || 0) + h;
      const t = clamp(this.state.diveElapsed / keeper.diveDuration, 0, 1);
      const speed = (keeper.diveDistance / keeper.diveDuration) * (1 - t * .55);
      if(this.owner && this.owner.position){
        const heading = this.owner.rotation ? this.owner.rotation.y : 0;
        this.owner.position.x += Math.cos(heading) * this.state.diveDirection * speed * h;
        this.owner.position.z -= Math.sin(heading) * this.state.diveDirection * speed * h;
      }
      if(t >= 1){ this.state.diving = false; }
      if(this.locomotion) this.locomotion.update({x:0, z:0}, h);
      return;
    }

    const suppressed = this.state.action && this.state.action !== 'celebrate' ? .25 : 1;
    if(move.jump === true) this.jump();
    const snapshot = this.movementController ? this.movementController.step(this.owner, {
      x:clamp(finite(move.x, 0), -1, 1) * suppressed,
      z:clamp(finite(move.z, 0), -1, 1) * suppressed,
      sprint:move.sprint === true,
    }, h, this.config.spawn.y) : {speed:0, speedKmh:0, moving:false, sprinting:false, grounded:true, airborne:false, velocityX:0, velocityY:0, velocityZ:0};

    this.state.velocityX = snapshot.velocityX;
    this.state.velocityZ = snapshot.velocityZ;
    this.state.heading = this.owner && this.owner.rotation ? this.owner.rotation.y : this.state.heading;
    this.state.speed = snapshot.speed;
    this.state.speedKmh = snapshot.speedKmh;
    this.state.moving = snapshot.moving;
    this.state.sprinting = snapshot.sprinting;
    this.state.grounded = snapshot.grounded;
    this.state.airborne = snapshot.airborne;

    const locomotion = this.ensureLocomotion();
    if(locomotion){
      // Feed the blend controller local-space velocity (heading-relative).
      const facing = this.owner && this.owner.rotation ? this.owner.rotation.y : 0;
      const localX = Math.cos(facing) * this.state.velocityX - Math.sin(facing) * this.state.velocityZ;
      const localZ = Math.sin(facing) * this.state.velocityX + Math.cos(facing) * this.state.velocityZ;
      locomotion.update({x:localX, z:localZ}, h);
    }
    if(!this.appearanceApplied) this.applyAppearance();
  };

  pawn.dispose = function(){
    if(this.disposed) return false;
    this.disposed = true;
    this.started = false;
    this.control = null;
    this.possessCamera(false);
    if(this.locomotion) this.locomotion.dispose();
    this.locomotion = null;
    registry.unregister(this);
    if(this.owner && this.owner.userData){
      delete this.owner.userData.soccerPawnId;
      delete this.owner.userData.vehiclePawnId;
    }
    return true;
  };

  if(!owner.userData) owner.userData = {};
  owner.userData.soccerPawnId = pawn.id;
  // Shared registry resolution key (registry.get(ownerObject) reads it).
  owner.userData.vehiclePawnId = pawn.id;
  registry.register(pawn);
  return pawn;
}

function install(GAME){
  if(!GAME) return null;
  const pawnCore = window.LK_RUNTIME_PAWN_CORE && window.LK_RUNTIME_PAWN_CORE.install(GAME);
  if(pawnCore && pawnCore.components && !pawnCore.components.has('soccer')){
    pawnCore.components.register('soccer', options => createLogic(GAME, options.owner, options.config, options.services));
  }
  return true;
}

window.LK_RUNTIME_SOCCER_PAWNS = Object.freeze({
  SCHEMA_VERSION, ROLES, ROLE_ACTIONS,
  normalizeConfig, normalizeRole, roleAnimationDefaults, createLogic, install,
  loadAnimationLibrary, animationLibraryKey,
});
if(window.LOT_KING) install(window.LOT_KING);
})();
