/* =========================================================
   LOT KING - Vehicle Pawn contract and per-instance registry
   Shared by the native Player Car and Logic Element vehicles.
   ========================================================= */
(function(){
'use strict';

const SCHEMA_VERSION = 2;
let nextPawnId = 1;
let smokeTexture = null;
let flameTexture = null;

function clone(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function finite(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function mergeConfig(base, patch){
  const out = clone(base || {}) || {};
  Object.keys(patch || {}).forEach(key => {
    const value = patch[key];
    if(value && typeof value === 'object' && !Array.isArray(value)) out[key] = mergeConfig(out[key], value);
    else out[key] = clone(value);
  });
  return out;
}

function effectTexture(THREE, fire){
  if(fire && flameTexture) return flameTexture;
  if(!fire && smokeTexture) return smokeTexture;
  if(typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32,32,2,32,32,30);
  if(fire){
    gradient.addColorStop(0,'rgba(255,255,235,1)'); gradient.addColorStop(.22,'rgba(255,205,55,.98)');
    gradient.addColorStop(.55,'rgba(255,76,10,.82)'); gradient.addColorStop(1,'rgba(80,0,0,0)');
  } else {
    gradient.addColorStop(0,'rgba(210,215,225,.68)'); gradient.addColorStop(.45,'rgba(125,132,145,.42)');
    gradient.addColorStop(1,'rgba(65,70,80,0)');
  }
  ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64);
  const texture = new THREE.CanvasTexture(canvas); texture.needsUpdate = true;
  if(fire) flameTexture = texture; else smokeTexture = texture;
  return texture;
}

function normalizePlayerId(value){
  if(window.LK_RUNTIME_PAWN_CORE) return window.LK_RUNTIME_PAWN_CORE.normalizePlayerId(value);
  if(value == null || value === '' || value === 'none' || Number(value) < 1) return null;
  return clamp(Number(value) | 0, 1, 4);
}

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? clone(source) : {};
  const tuning = src.tuning || {};
  const spawn = src.spawn || {};
  const playerId = Object.prototype.hasOwnProperty.call(src, 'playerId')
    ? normalizePlayerId(src.playerId)
    : (src.controllerIndex == null ? null : normalizePlayerId(Number(src.controllerIndex) + 1));
  return Object.assign({}, src, {
    schemaVersion:SCHEMA_VERSION,
    enabled:src.enabled !== false,
    hidden:src.hidden === true,
    possessed:src.possessed !== false && playerId != null,
    editorOnly:src.editorOnly === true,
    runtimeOnly:src.runtimeOnly === true,
    physicsBackend:String(src.physicsBackend || 'auto'),
    playerId,
    spawn:{
      x:finite(spawn.x, 0), y:finite(spawn.y, 0), z:finite(spawn.z, 0),
      heading:finite(spawn.heading, 0),
    },
    tuning:Object.assign({}, tuning, {
      horsepower:Math.max(1, finite(tuning.horsepower, finite(src.horsepower, 450))),
      torque:finite(tuning.torque, finite(src.torque, 5)),
      maxSpeed:Math.max(.1, finite(tuning.maxSpeed, finite(src.maxSpeed, 38))),
      acceleration:Math.max(.1, finite(tuning.acceleration, 16)),
      brake:Math.max(.1, finite(tuning.brake, 24)),
      reverseSpeed:Math.max(.1, finite(tuning.reverseSpeed, 12)),
      steer:Math.max(.05, finite(tuning.steer, 2.2)),
      grip:clamp(finite(tuning.grip, .84), 0, 1),
      drag:Math.max(0, finite(tuning.drag, 1.8)),
    }),
    effects:Object.assign({exhaustEnabled:true, skidEnabled:true, neonEnabled:true, smokeIntensity:1, skidLife:12}, src.effects || {}),
    camera:Object.assign({mode:'arcade', arcadeDistance:9, arcadeHeight:3.1, arcadeLag:5.8, fov:70}, src.camera || src.cam || {}),
    engineAudio:Object.assign({enabled:true, volume:.28, pitch:1, setId:null}, src.engineAudio || {}),
    dataWidgets:src.dataWidgets ? clone(src.dataWidgets) : null,
  });
}

function neutralDrive(){
  return {throttle:0, brake:0, steer:0, handbrake:false, highBeams:false, reset:false, device:null};
}

function emitPawnEvent(pawn, type, payload){
  if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
  window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type, pawn, pawnId:pawn && pawn.id || null}, payload || {})}));
}

function createRegistry(GAME, options){
  const opts = options || {};
  const pawns = new Map();
  const playerSlots = new Map();

  function uniqueId(preferred){
    const base = String(preferred || ('vehicle-pawn-' + nextPawnId++)).trim() || ('vehicle-pawn-' + nextPawnId++);
    if(!pawns.has(base)) return base;
    let suffix = 2;
    while(pawns.has(base + '-' + suffix)) suffix++;
    return base + '-' + suffix;
  }

  function releaseSlot(pawn){
    if(!pawn || pawn.playerId == null) return;
    if(playerSlots.get(pawn.playerId) === pawn.id) playerSlots.delete(pawn.playerId);
  }

  function claimSlot(pawn, requested, force){
    const playerId = normalizePlayerId(requested);
    const previousPlayerId = pawn && pawn.playerId;
    releaseSlot(pawn);
    if(playerId == null){
      pawn.playerId = null; pawn.possessed = false;
      if(previousPlayerId != null) emitPawnEvent(pawn, 'OnPawnUnpossessed', {playerId:previousPlayerId});
      return true;
    }
    const occupied = playerSlots.get(playerId);
    if(occupied && occupied !== pawn.id && force !== true) return false;
    if(occupied && occupied !== pawn.id){
      const previous = pawns.get(occupied);
      if(previous){
        previous.playerId = null; previous.possessed = false;
        if(Object.prototype.hasOwnProperty.call(previous, 'control')) previous.control = null;
        if(previous.onPossessionChanged) previous.onPossessionChanged(null);
        emitPawnEvent(previous, 'OnPawnUnpossessed', {playerId});
      }
    }
    pawn.playerId = playerId;
    pawn.possessed = true;
    if(Object.prototype.hasOwnProperty.call(pawn, 'control')) pawn.control = null;
    playerSlots.set(playerId, pawn.id);
    emitPawnEvent(pawn, 'OnPawnPossessed', {playerId});
    return true;
  }

  function register(pawn){
    if(!pawn || !pawn.id) throw new Error('VehiclePawn requires a stable id');
    if(pawns.has(pawn.id) && pawns.get(pawn.id) !== pawn) throw new Error('VehiclePawn id already registered: ' + pawn.id);
    pawns.set(pawn.id, pawn);
    if(pawn.playerId != null && pawn.possessed !== false && !claimSlot(pawn, pawn.playerId, false)){
      pawn.playerId = null;
      pawn.possessed = false;
    }
    return pawn;
  }

  function unregister(ref){
    const pawn = typeof ref === 'string' ? pawns.get(ref) : ref;
    if(!pawn) return false;
    releaseSlot(pawn);
    pawns.delete(pawn.id);
    return true;
  }

  function makeBase(kind, id, config){
    const cfg = normalizeConfig(config);
    const state = {
      speed:0, speedKmh:0, rpm:900, gear:1, reverse:false, drift:false, oversteer:false, burnout:false, limiter:false,
      groundedWheels:4, steer:0, throttle:0, brake:0, handbrake:false, physicsMode:'none',
    };
    const fallback = {
      id:uniqueId(id), kind, config:cfg, state,
      enabled:cfg.enabled, hidden:cfg.hidden, possessed:cfg.possessed,
      editorOnly:cfg.editorOnly, runtimeOnly:cfg.runtimeOnly, playerId:cfg.playerId,
      started:false, sleeping:false, disposed:false,
      possess(playerId, force){ return claimSlot(this, playerId, force); },
      unpossess(){ releaseSlot(this); this.playerId = null; this.possessed = false; return true; },
      setEnabled(value){ this.enabled = value !== false; this.config.enabled = this.enabled; return this.enabled; },
      setHidden(value){ this.hidden = value === true; this.config.hidden = this.hidden; return this.hidden; },
      sleep(){ this.sleeping = true; return true; },
      wake(){ this.sleeping = false; return true; },
      snapshot(){ return {id:this.id, kind:this.kind, config:clone(this.config), state:clone(this.state)}; },
    };
    if(!window.LK_RUNTIME_PAWN_CORE) return fallback;
    return window.LK_RUNTIME_PAWN_CORE.createRecord({
      id:fallback.id, kind, config:cfg, state,
      onPossess:(pawn, playerId, force) => claimSlot(pawn, playerId, force),
      onUnpossess:pawn => {
        const playerId = pawn.playerId;
        releaseSlot(pawn); pawn.playerId = null; pawn.possessed = false;
        if(playerId != null) emitPawnEvent(pawn, 'OnPawnUnpossessed', {playerId});
        return true;
      },
    });
  }

  function createNative(player, config){
    if(!player) return null;
    const existing = pawns.get('native-player-car');
    if(existing) return existing;
    const cfg = normalizeConfig(Object.assign({}, config || {}, {
      enabled:player.enabled !== false,
      hidden:player.hidden === true,
      controllerIndex:player.controllerIndex,
      tuning:player.drive || config && config.tuning,
      spawn:player.spawn || config && config.spawn,
    }));
    const pawn = makeBase('native-adapter', 'native-player-car', cfg);
    pawn.owner = player.car || null;
    pawn.onPossessionChanged = function(playerId){ if(player.setControllerIndex) player.setControllerIndex(playerId == null ? null : playerId - 1); };
    pawn.readPlayerDrive = function(){
      if(!this.possessed || this.playerId == null || !GAME || !GAME.input || !GAME.input.player) return neutralDrive();
      if(GAME.input.ensurePlayerSlot) GAME.input.ensurePlayerSlot(this.playerId - 1);
      const view = GAME.input.player(this.playerId - 1);
      const drive = view && view.drive ? view.drive() : neutralDrive();
      return Object.assign(neutralDrive(), drive || {}, {device:view && view.device ? view.device() : null});
    };
    pawn.start = function(){ this.started = true; return this; };
    pawn.step = function(){
      const physics = player.physics || {};
      const engine = player.engine || {};
      this.state.speed = physics.vel && physics.vel.length ? physics.vel.length() : finite(physics.vF, 0);
      this.state.speedKmh = Math.abs(this.state.speed) * 3.6;
      this.state.rpm = finite(engine.rpm, this.state.rpm);
      this.state.gear = finite(engine.gear, this.state.gear);
      this.state.reverse = engine.reverseActive === true;
      this.state.burnout = engine.burnout === true;
      this.state.limiter = finite(engine.rpm, 0) >= finite(engine.limiter, 7600) || finite(engine.limiterTimer, 0) > 0;
      this.enabled = player.enabled !== false;
      this.hidden = player.hidden === true;
    };
    pawn.reset = function(){ if(player.reset) player.reset(); return true; };
    pawn.setEnabled = function(value){ return player.setEnabled ? player.setEnabled(value) : (player.enabled = value !== false); };
    pawn.setHidden = function(value){ return player.setHidden ? player.setHidden(value) : (player.hidden = value === true); };
    pawn.possess = function(playerId, force){
      if(!claimSlot(this, playerId, force)) return false;
      this.onPossessionChanged(this.playerId);
      return true;
    };
    pawn.unpossess = function(){ const playerId = this.playerId; releaseSlot(this); this.playerId = null; this.possessed = false; if(player.setControllerIndex) player.setControllerIndex(null); if(playerId != null) emitPawnEvent(this, 'OnPawnUnpossessed', {playerId}); return true; };
    pawn.dispose = function(){ this.disposed = false; return false; };
    return register(pawn);
  }

  function createLogic(owner, config, services){
    if(!owner) throw new Error('Logic VehiclePawn requires an owner');
    const existingId = owner.userData && owner.userData.vehiclePawnId;
    if(existingId && pawns.has(existingId)) return pawns.get(existingId);
    const cfg = normalizeConfig(config);
    if(!cfg.spawn || (cfg.spawn.x === 0 && cfg.spawn.y === 0 && cfg.spawn.z === 0)){
      cfg.spawn = {
        x:owner.position ? finite(owner.position.x, 0) : 0,
        y:owner.position ? finite(owner.position.y, 0) : 0,
        z:owner.position ? finite(owner.position.z, 0) : 0,
        heading:owner.rotation ? finite(owner.rotation.y, 0) : 0,
      };
    }
    const preferred = owner.userData && (owner.userData.logicInstanceId || owner.userData.editorId) || config && (config.id || config.pawnId);
    const pawn = makeBase('logic-element', preferred, cfg);
    pawn.owner = owner;
    pawn.services = services || {};
    pawn.control = null;
    pawn.backend = null;
    pawn.effectsRuntime = {exhaust:[], skids:[], exhaustClock:0, skidClock:0, anchors:null};
    pawn.widgetRuntime = null;
    pawn.audioRuntime = null;
    pawn.lightRigRuntime = null;
    pawn.engineController = null;
    pawn.modelRigRuntime = null;
    pawn.modelRigAttemptedRoot = null;
    pawn.physicsMode = 'arcade-fallback';
    pawn.state.physicsMode = pawn.physicsMode;
    pawn.ensurePhysics = function(){
      if(this.backend || !GAME || !GAME.systems || !GAME.systems.physics) return !!this.backend;
      const raw = GAME.systems.physics.raw;
      const CANNON = window.CANNON;
      const world = raw && raw.world;
      const backendRegistry = window.LK_RUNTIME_VEHICLE_PHYSICS_BACKENDS;
      const selection = backendRegistry ? backendRegistry.resolve(this.config.physicsBackend, {GAME, pawn:this, CANNON, world}) : null;
      const selected = selection && selection.backend;
      if(selection && selection.fallback){
        this.physicsFallbackReason = selection.reason;
        this.owner.userData.vehiclePhysicsFallback = selection.reason;
      }
      if(selected && selected.id === 'arcade-fallback') return false;
      if(selected && !selected.managedByCore && selected.create){
        try {
          this.backend = selected.create({GAME, pawn:this, owner:this.owner, config:this.config, services:this.services, CANNON, world}) || null;
          if(this.backend){ this.physicsMode = selected.id; this.state.physicsMode = selected.id; this.owner.userData.vehiclePhysicsMode = selected.id; return true; }
          this.physicsFallbackReason = 'Backend failed to create: ' + selected.id;
        } catch(err){ this.physicsFallbackReason = 'Backend error: ' + selected.id + ' — ' + (err && err.message || err); }
        this.owner.userData.vehiclePhysicsFallback = this.physicsFallbackReason;
        return false;
      }
      if(!CANNON || !world || !CANNON.RaycastVehicle) return false;
      const collision = this.config.collision || {};
      const suspension = Object.assign({
        stiffness:32, restLength:.34, travel:.28, radius:.38,
        compression:4.4, relaxation:2.6, maxForce:250000, rollInfluence:.22,
      }, this.config.suspension || {});
      const mass = Math.max(100, finite(collision.mass, finite(this.config.mass, 1200)));
      const bodyY = finite(collision.bodyY, .55);
      const material = raw.carMaterial || new CANNON.Material('logic-vehicle-' + this.id);
      const body = new CANNON.Body({mass, material, linearDamping:.01, angularDamping:.4});
      const half = [
        Math.max(.2, finite(collision.hx, .92)),
        Math.max(.15, finite(collision.hy, .42)),
        Math.max(.4, finite(collision.hz, 1.85)),
      ];
      body.addShape(new CANNON.Box(new CANNON.Vec3(half[0], half[1], half[2])), new CANNON.Vec3(
        finite(collision.offsetX, 0), finite(collision.offsetY, .45), finite(collision.offsetZ, 0)
      ));
      const spawn = this.config.spawn;
      const occupiedBodies = [];
      if(raw.carBody) occupiedBodies.push(raw.carBody);
      pawns.forEach(other => { if(other !== this && other.backend && other.backend.body) occupiedBodies.push(other.backend.body); });
      const overlapsSpawn = point => occupiedBodies.some(otherBody => {
        const dx = finite(otherBody.position && otherBody.position.x, 1e6) - point.x;
        const dz = finite(otherBody.position && otherBody.position.z, 1e6) - point.z;
        return dx * dx + dz * dz < 9;
      });
      if(overlapsSpawn(spawn)){
        const lane = normalizePlayerId(this.playerId) || Math.max(1, pawns.size);
        const candidates = [
          {x:spawn.x + lane * 4, z:spawn.z}, {x:spawn.x - lane * 4, z:spawn.z},
          {x:spawn.x, z:spawn.z + lane * 5}, {x:spawn.x, z:spawn.z - lane * 5},
        ];
        const safe = candidates.find(candidate => !overlapsSpawn(candidate));
        if(safe){
          spawn.x = safe.x; spawn.z = safe.z;
          if(this.owner.position) this.owner.position.set(spawn.x, spawn.y, spawn.z);
          this.owner.userData.vehicleSpawnAdjusted = true;
          this.owner.userData.vehicleSpawnAdjustmentReason = 'overlapping-vehicle-spawn';
        }
      }
      body.position.set(spawn.x, spawn.y + bodyY, spawn.z);
      body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0), spawn.heading);
      body.allowSleep = true;
      body.logicObject = this.owner;
      body.userData = Object.assign({}, body.userData || {}, {logicVehiclePawn:true, pawnId:this.id});
      const onCollide = event => {
        if(!window.dispatchEvent || !window.CustomEvent) return;
        window.dispatchEvent(new CustomEvent('lk-logic-collision-begin', {detail:{
          pawn:this, body, otherBody:event && event.body || null, object:this.owner,
          otherObject:event && event.body && event.body.logicObject || null,
          contact:event && event.contact || null,
        }}));
      };
      body.addEventListener('collide', onCollide);
      world.addBody(body);
      const vehicle = new CANNON.RaycastVehicle({chassisBody:body, indexRightAxis:0, indexUpAxis:1, indexForwardAxis:2});
      const layout = Array.isArray(this.config.wheels) && this.config.wheels.length >= 4 ? this.config.wheels : [
        {x:-.92,z:1.35,front:true,visualId:'wheel_front_left'}, {x:.92,z:1.35,front:true,visualId:'wheel_front_right'},
        {x:-.92,z:-1.35,front:false,visualId:'wheel_rear_left'}, {x:.92,z:-1.35,front:false,visualId:'wheel_rear_right'},
      ];
      const connY = -bodyY + suspension.restLength + suspension.radius;
      layout.forEach(wheel => vehicle.addWheel({
        radius:Math.max(.05, finite(wheel.radius, suspension.radius)),
        directionLocal:new CANNON.Vec3(0,-1,0), axleLocal:new CANNON.Vec3(-1,0,0),
        suspensionStiffness:suspension.stiffness, suspensionRestLength:suspension.restLength,
        maxSuspensionTravel:suspension.travel, maxSuspensionForce:suspension.maxForce,
        dampingCompression:suspension.compression, dampingRelaxation:suspension.relaxation,
        frictionSlip:Math.max(.1, finite(this.config.tuning.frictionSlip, 2.6 * this.config.tuning.grip)),
        rollInfluence:suspension.rollInfluence,
        chassisConnectionPointLocal:new CANNON.Vec3(finite(wheel.x, 0), finite(wheel.y, connY), finite(wheel.z, 0)),
        customSlidingRotationalSpeed:-30, useCustomSlidingRotationalSpeed:true,
      }));
      vehicle.addToWorld(world);
      const visualById = new Map();
      if(this.owner.traverse) this.owner.traverse(node => {
        const ids = node && node.userData ? [node.userData.logicElementSceneId, node.userData.lkMeshEditId] : [];
        ids.filter(Boolean).forEach(id => { if(!visualById.has(id)) visualById.set(id, node); });
      });
      const defaultWheelIds = ['wheel_front_left', 'wheel_front_right', 'wheel_rear_left', 'wheel_rear_right'];
      const wheelVisuals = layout.map((wheel, index) => visualById.get(wheel.visualId || defaultWheelIds[index]) || null).map(node => {
        if(!node) return null;
        let spinRoot = null;
        node.traverse(child => { if(!spinRoot && child.userData && child.userData.logicVehicleWheelRig) spinRoot = child; });
        if(!spinRoot && window.THREE){
          spinRoot = new window.THREE.Group();
          spinRoot.name = (node.name || 'Wheel') + ' Spin Root';
          spinRoot.userData.logicVehicleWheelRig = true;
          spinRoot.userData.logicElementInternal = true;
          spinRoot.userData.logicElementRuntimeVisual = true;
          spinRoot.userData.nonExportable = true;
          const movable = Array.from(node.children || []).filter(child => !(child.userData && (child.userData.logicVehicleBrakeDisc || child.userData.logicVehicleBrakeDiscVisual)));
          movable.forEach(child => { node.remove(child); spinRoot.add(child); });
          if(!movable.length && node.isMesh && node.geometry){
            const visualMesh = new window.THREE.Mesh(node.geometry, node.material);
            visualMesh.castShadow = node.castShadow;
            visualMesh.receiveShadow = node.receiveShadow;
            node.geometry = new window.THREE.BufferGeometry();
            node.material = new window.THREE.MeshBasicMaterial({visible:false});
            spinRoot.add(visualMesh);
          }
          node.add(spinRoot);
        }
        const spinMeshes = [];
        node.traverse(child => {
          if(!child || !child.isMesh || child === node) return;
          if(child.userData && (child.userData.logicVehicleBrakeDisc || child.userData.logicVehicleBrakeDiscVisual)) return;
          if(child.material && child.material.visible === false) return;
          spinMeshes.push(child);
        });
        return {
          node, spinRoot, baseY:node.position.y, baseRotX:node.rotation.x, baseRotY:node.rotation.y,
          correction:window.THREE ? node.quaternion.clone() : null, spinAngle:0,
          spinMeshes,
          shared:{pivot:node, spinTargets:spinMeshes.length ? spinMeshes : (spinRoot ? [spinRoot] : [node]), spin:0, suspensionVisual:0},
        };
      });
      this.owner.userData.vehicleWheelRigStatus = wheelVisuals.map((visual, index) => ({
        id:defaultWheelIds[index], visual:!!visual, spinRoot:!!(visual && visual.spinRoot), spinMeshes:visual ? visual.spinMeshes.map(mesh => mesh.name || mesh.type) : [], rotation:0, steer:0,
      }));
      const graphElements = this.services.graph && this.services.graph.logicScene && this.services.graph.logicScene.elements || [];
      const lightVisuals = graphElements.filter(element => element && element.type === 'light').map(element => {
        const node = visualById.get(element.id);
        let light = null;
        if(node && node.traverse) node.traverse(child => { if(!light && child.isLight) light = child; });
        const key = String(element.condition || element.action || element.id || element.name || '').toLowerCase();
        let condition = 'always';
        if(/reverse|retro/.test(key)) condition = 'reverse';
        else if(/brake|freno/.test(key)) condition = 'brake';
        else if(/turn_left|left_turn|freccia.*(left|sx)/.test(key)) condition = 'left';
        else if(/turn_right|right_turn|freccia.*(right|dx)/.test(key)) condition = 'right';
        else if(/headlight|front|night|faro/.test(key)) condition = 'night';
        const auxMatch = /^aux_light_(\d+)$/.exec(String(element.id || ''));
        return light ? {element, light, condition, auxIndex:auxMatch ? Number(auxMatch[1]) : null, baseIntensity:finite(element.intensity, light.intensity || .75), baseDistance:finite(light.distance, 0), baseAngle:finite(light.angle, .5)} : null;
      }).filter(Boolean);
      this.backend = {world, body, vehicle, suspension, bodyY, mass, onCollide, wheelVisuals, lightVisuals, wheelLayout:layout};
      this.physicsMode = 'cannon-raycast';
      this.state.physicsMode = this.physicsMode;
      this.owner.userData.vehiclePhysicsMode = this.physicsMode;
      delete this.owner.userData.vehiclePhysicsFallback;
      return true;
    };
    pawn.start = function(){ this.started = true; this.sleeping = false; this.setHidden(this.hidden); return this; };
    pawn.setHidden = function(value){
      this.hidden = value === true; this.config.hidden = this.hidden;
      if(this.owner) this.owner.visible = !this.hidden;
      return this.hidden;
    };
    pawn.setEnabled = function(value){
      this.enabled = value !== false; this.config.enabled = this.enabled;
      if(this.backend && this.backend.body){
        const body = this.backend.body;
        if(!this.enabled){
          body.velocity.set(0,0,0); body.angularVelocity.set(0,0,0);
          if(body.sleep) body.sleep();
        } else if(body.wakeUp) body.wakeUp();
      }
      return this.enabled;
    };
    pawn.sleep = function(){ this.sleeping = true; if(this.backend && this.backend.body.sleep) this.backend.body.sleep(); return true; };
    pawn.wake = function(){ this.sleeping = false; if(this.backend && this.backend.body.wakeUp) this.backend.body.wakeUp(); return true; };
    pawn.setControl = function(input){ this.control = Object.assign(neutralDrive(), input || {}); return this.control; };
    pawn.clearControl = function(){ this.control = null; };
    pawn.setTuning = function(patch){
      Object.assign(this.config.tuning, patch || {});
      this.config.tuning.maxSpeed = Math.max(.1, finite(this.config.tuning.maxSpeed, 38));
      this.config.tuning.acceleration = Math.max(.1, finite(this.config.tuning.acceleration, 16));
      this.config.tuning.brake = Math.max(.1, finite(this.config.tuning.brake, 24));
      this.config.tuning.steer = Math.max(.05, finite(this.config.tuning.steer, 2.2));
      this.config.tuning.grip = clamp(finite(this.config.tuning.grip, .84), .08, 1.6);
      this.config.tuning.frontGrip = clamp(finite(this.config.tuning.frontGrip, this.config.tuning.grip), .08, 1.6);
      this.config.tuning.rearGrip = clamp(finite(this.config.tuning.rearGrip, this.config.tuning.grip), .08, 1.6);
      return this.config.tuning;
    };
    pawn.setDriveSetup = function(values){
      const setup = this.config.driveSetup || (this.config.driveSetup = {});
      Object.assign(setup, values || {});
      if(!this.driveSetupBase){
        this.driveSetupBase = {
          suspension:clone(this.config.suspension || {}),
          collision:clone(this.config.collision || {}),
        };
      }
      const torque = clamp(finite(setup.torque, 0) / 10, 0, 1);
      const horsepower = clamp(finite(setup.horsepower, 450), 15, 1500);
      const maxSpeed = clamp(finite(setup.maxSpeed, 2) / 10, 0, 1);
      const brake = clamp(finite(setup.brake, -3) / 10, -1, 1);
      const steer = clamp(finite(setup.steer, 0) / 10, -1, 1);
      const grip = clamp(finite(setup.grip, -10) / 10, -1, 1);
      const oversteer = clamp(finite(setup.oversteer, 0) / 10, -1, 1);
      const presetSource = window.LK_RUNTIME_DRIVE_TUNING && window.LK_RUNTIME_DRIVE_TUNING.PRESETS || {};
      setup.driveMode = ['default','race','drift'].find(name => {
        const preset = presetSource[name];
        return preset && Object.keys(preset).every(key => Number(setup[key]) === Number(preset[key]));
      }) || setup.driveMode || 'custom';
      const mode = setup.driveMode;
      const overallGrip = clamp(.78 * (1 + grip * .62), .28, 1.26);
      const frontGrip = clamp(overallGrip * (1 + Math.max(0, oversteer) * .08), .25, 1.35);
      const rearGrip = clamp(overallGrip * (1 - oversteer * .32), .20, 1.35);
      const acceleration = clamp((8 + horsepower / 100) * (.85 + torque * .40), 5, 30);
      const applied = this.setTuning({
        horsepower,
        torque:finite(setup.torque, 0),
        driveMode:mode,
        maxSpeed:34 + maxSpeed * 22,
        acceleration,
        brake:18 * (1 + brake * .32),
        steer:2.05 * (1 + steer * .42),
        grip:overallGrip,
        frontGrip,
        rearGrip,
        handbrake:finite(setup.handbrake, 1),
        oversteer:finite(setup.oversteer, 0),
      });
      const baseSuspension = Object.assign({
        stiffness:32, restLength:.34, travel:.28, radius:.38,
        compression:4.4, relaxation:2.6, rollInfluence:.22,
      }, this.driveSetupBase.suspension || {});
      const suspension = clamp(finite(setup.suspension, 0) / 10, -1, 1);
      const damping = clamp(finite(setup.damping, 0) / 10, -1, 1);
      const travel = clamp(finite(setup.travel, 0) / 10, -1, 1);
      const ride = clamp(finite(setup.ride, 0) / 10, -1, 1);
      const roll = clamp(finite(setup.roll, 0) / 10, -1, 1);
      this.setSuspension({
        stiffness:baseSuspension.stiffness * clamp(1 + suspension * .6, .45, 1.8),
        compression:baseSuspension.compression * clamp(1 + damping * .75, .35, 2),
        relaxation:baseSuspension.relaxation * clamp(1 + damping * .75, .35, 2),
        restLength:baseSuspension.restLength * clamp(1 + ride * .35, .6, 1.4),
        travel:baseSuspension.travel * clamp(1 + travel * .75 + ride * .25, .45, 1.9),
        rollInfluence:clamp(baseSuspension.rollInfluence * (1 + roll * .8), .04, .42),
      });
      const baseCollision = Object.assign({offsetY:.45}, this.driveSetupBase.collision || {});
      const chassisLift = clamp(finite(setup.chassisLift, 0), -.35, .9);
      this.config.collision.offsetY = clamp(finite(baseCollision.offsetY, .45) + chassisLift, -2, 4);
      if(this.backend && this.backend.body && this.backend.body.shapeOffsets && this.backend.body.shapeOffsets[0]){
        this.backend.body.shapeOffsets[0].y = this.config.collision.offsetY;
        if(this.backend.body.updateBoundingRadius) this.backend.body.updateBoundingRadius();
        if(this.backend.body.aabbNeedsUpdate != null) this.backend.body.aabbNeedsUpdate = true;
        if(this.backend.body.wakeUp) this.backend.body.wakeUp();
      }
      // The engine controller keeps a reference to its drive configuration.
      // Recreate only that small per-Pawn state machine after a live setup edit.
      if(this.engineController){
        this.engineController = null;
      }
      if(this.owner && this.owner.userData){
        this.owner.userData.vehicleDriveSetupApplied = {
          at:Date.now(), pawnId:this.id, playerId:this.playerId, mode,
          setup:clone(setup), tuning:clone(applied),
          suspension:clone(this.config.suspension), collision:clone(this.config.collision),
        };
      }
      return applied;
    };
    pawn.setSuspension = function(patch){
      this.config.suspension = Object.assign({}, this.config.suspension || {}, patch || {});
      if(this.backend){
        Object.assign(this.backend.suspension, this.config.suspension);
        this.backend.vehicle.wheelInfos.forEach(wheel => {
          wheel.suspensionStiffness = this.backend.suspension.stiffness;
          wheel.suspensionRestLength = this.backend.suspension.restLength;
          wheel.maxSuspensionTravel = this.backend.suspension.travel;
          wheel.dampingCompression = this.backend.suspension.compression;
          wheel.dampingRelaxation = this.backend.suspension.relaxation;
          wheel.rollInfluence = this.backend.suspension.rollInfluence;
        });
      }
      return this.config.suspension;
    };
    pawn.setCollision = function(patch){ this.config.collision = Object.assign({}, this.config.collision || {}, patch || {}); return this.config.collision; };
    pawn.setLights = function(patch){
      const target = this.config.lights || (this.config.lights = {});
      Object.keys(patch || {}).forEach(key => {
        const value = patch[key];
        if(Array.isArray(value)){
          target[key] = Array.isArray(target[key]) ? target[key] : [];
          value.forEach((item, index) => { if(item) target[key][index] = Object.assign({}, target[key][index] || {}, item); });
        } else if(value && typeof value === 'object') target[key] = Object.assign({}, target[key] || {}, value);
        else target[key] = value;
      });
      if(this.lightRigRuntime && this.lightRigRuntime.rig) this.lightRigRuntime.rig.setConfig(target);
      return target;
    };
    pawn.ensureNativeLightRig = function(){
      if(this.lightRigRuntime || !window.LK_RUNTIME_PLAYER_LIGHT_RIG || !this.owner) return this.lightRigRuntime;
      const before = new Set(this.owner.children || []);
      const self = this;
      const rig = window.LK_RUNTIME_PLAYER_LIGHT_RIG.create({
        THREERef:window.THREE, car:this.owner, tagEntity:node => node,
        getSky:() => GAME && GAME.systems && GAME.systems.sky,
        getKeys:() => ({}),
        getEngine:() => ({brake:(self.state.brake || 0) > .08, reverseActive:self.state.reverse === true, throttle:self.state.throttle || 0, steer:self.state.steer || 0}),
        getSpeed:() => self.state.speedKmh || 0,
        isEditorActive:() => !!(GAME && GAME.state && GAME.state.editorActive && !GAME.state.editorPreview),
      });
      rig.build();
      const nativeConfig = GAME && GAME.player && GAME.player.lights ? clone(GAME.player.lights) : null;
      rig.setConfig(mergeConfig(mergeConfig(nativeConfig || {}, this.config.lights || {}), {dummies:{visible:false}}));
      rig.apply();
      const roots = (this.owner.children || []).filter(child => !before.has(child));
      this.owner.traverse(node => { if(node.userData && node.userData.logicElementSceneType === 'light') node.visible = false; });
      this.lightRigRuntime = {rig, roots};
      return this.lightRigRuntime;
    };
    pawn.ensureModelWheelRig = function(){
      if(this.modelRigRuntime || !window.LK_RUNTIME_MODEL_ASSETS || !window.THREE || !this.owner) return this.modelRigRuntime;
      let modelRoot = null;
      this.owner.traverse(node => {
        if(modelRoot || !node.userData || !node.userData.logicElementAssetVisual) return;
        if(!(node.parent && node.parent.userData && node.parent.userData.logicElementAssetVisual)) modelRoot = node;
      });
      if(!modelRoot || this.modelRigAttemptedRoot === modelRoot) return null;
      this.modelRigAttemptedRoot = modelRoot;
      const assets = window.LK_RUNTIME_MODEL_ASSETS.create({THREERef:window.THREE, car:this.owner, isFileMode:false});
      const active = assets && assets.rig && assets.rig.build(modelRoot);
      this.owner.userData.vehicleModelRigDiagnostics = {root:modelRoot.name || modelRoot.type, active:!!active};
      if(active) this.modelRigRuntime = assets.rig;
      return this.modelRigRuntime;
    };
    pawn.isNightTime = function(){
      const front = this.config.lights && this.config.lights.front || {};
      const sky = GAME && GAME.systems && GAME.systems.sky;
      const t = sky && sky.getTime ? sky.getTime() : .5;
      const hour = (((Number(t) || 0) % 1) + 1) % 1 * 24;
      const on = clamp(finite(front.autoOnHour, 18), 0, 24);
      const off = clamp(finite(front.autoOffHour, 7), 0, 24);
      if(Math.abs(on - off) < .001) return true;
      return on > off ? (hour >= on || hour < off) : (hour >= on && hour < off);
    };
    pawn.updateLights = function(drive, reversing){
      // Once the shared native light rig exists, template Light elements are
      // authoring anchors only. Never reactivate their different PointLights.
      if(this.lightRigRuntime && this.lightRigRuntime.rig) return;
      if(!this.backend || !this.backend.lightVisuals) return;
      const config = this.config.lights || {};
      const front = config.front || {};
      const enabled = config.enabled !== false;
      const highBeams = drive.highBeams === true;
      const night = front.auto === false || this.isNightTime();
      const steer = finite(drive.steer, 0), brake = finite(drive.brake, 0);
      this.backend.lightVisuals.forEach(item => {
        const aux = item.auxIndex == null ? null : config.aux && config.aux[item.auxIndex];
        const condition = aux && aux.condition || item.condition;
        let active = enabled && (!aux || aux.enabled !== false);
        if(condition === 'night' && front.enabled === false) active = false;
        if((condition === 'brake' || condition === 'reverse' || condition === 'left' || condition === 'right') && !aux && config.rear && config.rear.enabled === false) active = false;
        if(condition === 'night') active = active && (night || highBeams);
        else if(condition === 'reverse') active = active && (this.state.reverse || reversing);
        else if(condition === 'brake') active = active && brake > .08 && !reversing;
        else if(condition === 'left') active = active && steer < -.18;
        else if(condition === 'right') active = active && steer > .18;
        const intensity = aux ? finite(aux.intensity, item.baseIntensity) : item.baseIntensity;
        const boost = condition === 'night' && highBeams ? 2.65 : 1;
        item.light.visible = active;
        item.light.intensity = active ? intensity * boost : 0;
        if('distance' in item.light) item.light.distance = item.baseDistance * (condition === 'night' && highBeams ? 1.55 : 1);
        if('angle' in item.light) item.light.angle = Math.min(1.1, item.baseAngle * (condition === 'night' && highBeams ? 1.58 : 1));
      });
    };
    pawn.setEffects = function(patch){ this.config.effects = Object.assign({}, this.config.effects || {}, patch || {}); return this.config.effects; };
    pawn.setCamera = function(patch){
      const previousAnchor = this.config.camera && this.config.camera.activeAnchorId;
      this.config.camera = Object.assign({}, this.config.camera || {}, patch || {});
      if(previousAnchor !== this.config.camera.activeAnchorId) this.cameraAnchor = null;
      this.cameraRuntime = null;
      return this.config.camera;
    };
    pawn.setEngineAudio = function(patch){
      const previousSetId = this.config.engineAudio && this.config.engineAudio.setId;
      this.config.engineAudio = Object.assign({}, this.config.engineAudio || {}, patch || {});
      if(this.audioRuntime && previousSetId !== this.config.engineAudio.setId){ this.disposeAudioRuntime(); }
      return this.config.engineAudio;
    };
    pawn.setDataWidgets = function(patch){
      this.config.dataWidgets = this.config.dataWidgets || {visibleInEditor:true, items:[]};
      if(patch && patch.enabled != null) this.config.dataWidgets.enabled = patch.enabled !== false;
      if(patch && patch.visibleInEditor != null) this.config.dataWidgets.visibleInEditor = patch.visibleInEditor === true;
      if(patch && Array.isArray(patch.items)){
        patch.items.forEach((item, index) => { if(item) this.config.dataWidgets.items[index] = Object.assign({}, this.config.dataWidgets.items[index] || {}, item); });
      }
      if(this.widgetRuntime) this.widgetRuntime.set(patch || {});
      return this.config.dataWidgets;
    };
    pawn.ensureDataWidgets = function(){
      if(this.widgetRuntime || !this.config.dataWidgets || !window.LK_RUNTIME_PLAYER_DATA_WIDGETS || !window.THREE) return this.widgetRuntime;
      const pawnId = this.id;
      this.widgetRuntime = window.LK_RUNTIME_PLAYER_DATA_WIDGETS.create({
        THREERef:window.THREE,
        car:this.owner,
        tagEntity:(node, name, type, options) => {
          node.userData.editorName = name; node.userData.editorType = type;
          node.userData.editorId = pawnId + ':' + (options && options.id || type);
          node.userData.vehiclePawnId = pawnId;
          return node;
        },
        getMetrics:() => ({
          driftScore:this.state.driftScore || 0, lastLatG:this.state.lateralG || 0,
          speedKmh:this.state.speedKmh || 0, rpm:this.state.rpm || 0,
          drifting:this.state.drift === true, driftSide:this.state.steer < 0 ? -1 : 1,
        }),
        isEditorActive:() => !!(GAME && GAME.state && GAME.state.editorActive),
        isEditorPreview:() => !!(GAME && GAME.state && GAME.state.editorPreview),
        getSelected:() => GAME && GAME.editor && GAME.editor.state && GAME.editor.state.selected,
      });
      this.widgetRuntime.set(this.config.dataWidgets);
      return this.widgetRuntime;
    };
    pawn.ensureEngineAudio = function(){
      if(this.audioRuntime || this.config.engineAudio && this.config.engineAudio.enabled === false) return this.audioRuntime;
      const audio = GAME && GAME.systems && GAME.systems.audio;
      const ctx = audio && audio.getContext ? audio.getContext() : null;
      const destination = audio && audio.getCarGain ? audio.getCarGain() : null;
      if(!ctx || !destination) return null;
      const setId = this.config.engineAudio && this.config.engineAudio.setId;
      const soundSets = this.services.STORE && this.services.STORE.soundSets;
      const soundSet = setId && soundSets && soundSets.get ? soundSets.get(setId) : (this.config.engineAudio && this.config.engineAudio.set || null);
      if(soundSet && window.LK_RUNTIME_ENGINE_AUDIO){
        const manager = window.LK_RUNTIME_ENGINE_AUDIO.create({
          audio,
          engine:this.state,
          gearbox:{idle:900, redline:6900, limiter:7600},
          getSpeed:() => this.state.speedKmh || 0,
          getTimescale:() => 1,
          manageFallbackSynth:false,
          resolveSrc:src => src && String(src).indexOf('blob:') === 0 && window.LK_ASSET_BLOBS
            ? window.LK_ASSET_BLOBS.getUrl(String(src).slice(5))
            : Promise.resolve(src),
        });
        manager.setConfig(soundSet);
        manager.start({silent:true});
        this.audioRuntime = {kind:'samples', manager, setId};
        return this.audioRuntime;
      }
      const gain = ctx.createGain();
      const low = ctx.createOscillator();
      const high = ctx.createOscillator();
      low.type = 'sawtooth'; high.type = 'triangle';
      gain.gain.value = 0;
      low.connect(gain); high.connect(gain); gain.connect(destination);
      low.start(); high.start();
      this.audioRuntime = {kind:'synth', ctx, gain, low, high};
      return this.audioRuntime;
    };
    pawn.updateAuxRuntime = function(dt){
      const widgets = this.ensureDataWidgets();
      if(widgets) widgets.update();
      const audio = this.ensureEngineAudio();
      if(audio){
        if(audio.kind === 'samples'){
          audio.manager.setMuted(!(this.enabled && this.possessed && !this.sleeping));
          audio.manager.setSkids({drift:this.state.drift ? 1 : 0, brake:this.state.brake || 0, accel:this.state.throttle || 0});
          audio.manager.update(dt);
          return;
        }
        const cfg = this.config.engineAudio || {};
        const rpm01 = clamp((finite(this.state.rpm, 900) - 900) / 6900, 0, 1);
        const pitch = Math.max(.2, finite(cfg.pitch, 1));
        const frequency = (55 + rpm01 * 330) * pitch;
        const t = audio.ctx.currentTime;
        audio.low.frequency.setTargetAtTime(frequency, t, .05);
        audio.high.frequency.setTargetAtTime(frequency * 1.37, t, .05);
        const active = this.enabled && this.possessed && !this.sleeping;
        const volume = active ? Math.max(0, finite(cfg.volume, .28)) * (.12 + this.state.throttle * .55 + rpm01 * .25) : 0;
        audio.gain.gain.setTargetAtTime(volume, t, .07);
      }
    };
    pawn.disposeAudioRuntime = function(){
      if(this.audioRuntime){
        if(this.audioRuntime.kind === 'samples'){
          try { this.audioRuntime.manager.stop(); this.audioRuntime.manager.setConfig(null); } catch(err){}
        } else {
          try { this.audioRuntime.low.stop(); this.audioRuntime.high.stop(); } catch(err){}
          try { this.audioRuntime.gain.disconnect(); } catch(err){}
        }
      }
      this.audioRuntime = null;
    };
    pawn.disposeAuxRuntime = function(){
      if(this.widgetRuntime && this.widgetRuntime.dispose) this.widgetRuntime.dispose();
      this.widgetRuntime = null;
      this.disposeAudioRuntime();
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
    pawn.effectAnchors = function(){
      if(this.effectsRuntime.anchors) return this.effectsRuntime.anchors;
      const anchors = {exhaust:[], skid:[], neon:[]};
      if(this.owner && this.owner.traverse) this.owner.traverse(node => {
        const ud = node.userData || {};
        const key = String(ud.logicElementSceneId || ud.editorName || node.name || '').toLowerCase();
        if(/exhaust|scarico/.test(key)) anchors.exhaust.push(node);
        if(/skid|wheel_rear|rear_wheel|ruota.*post/.test(key)) anchors.skid.push(node);
        if(/neon|underglow/.test(key)) anchors.neon.push(node);
      });
      this.effectsRuntime.anchors = anchors;
      return anchors;
    };
    pawn.spawnExhaust = function(fire){
      const THREE = window.THREE;
      if(!THREE || !this.owner || !this.owner.parent) return;
      const anchors = this.effectAnchors().exhaust;
      const shared = GAME && GAME.player && GAME.player.vehicleEffects;
      const intensity = Math.max(.05, finite(this.config.exhaust && this.config.exhaust.intensity, finite(this.config.effects.smokeIntensity, 1)));
      const velocity = this.backend && this.backend.body && this.backend.body.velocity
        ? new THREE.Vector3(this.backend.body.velocity.x, this.backend.body.velocity.y, this.backend.body.velocity.z) : new THREE.Vector3();
      if(shared && shared.spawnExhaust){
        anchors.forEach(anchor => shared.spawnExhaust(anchor, fire === true, intensity, velocity));
        return;
      }
      anchors.forEach(anchor => {
        if(!anchor.getWorldPosition) return;
        const material = new THREE.SpriteMaterial({
          map:effectTexture(THREE, fire === true), color:0xffffff, transparent:true,
          opacity:fire ? .95 : .32, depthWrite:false,
          blending:fire ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        const puff = new THREE.Sprite(material);
        anchor.getWorldPosition(puff.position);
        const worldQuat = new THREE.Quaternion();
        anchor.getWorldQuaternion(worldQuat);
        const direction = new THREE.Vector3(0,0,-1).applyQuaternion(worldQuat).normalize();
        const size = (fire ? .62 : .28) * intensity;
        puff.scale.set(size,size,1);
        puff.renderOrder = fire ? 34 : 32;
        puff.userData.logicVehicleEffect = true;
        this.owner.parent.add(puff);
        this.effectsRuntime.exhaust.push({
          object:puff, fire:fire === true, life:fire ? .32 : 1.8, maxLife:fire ? .32 : 1.8, size,
          velocity:direction.multiplyScalar(fire ? 7.5 : .8).add(new THREE.Vector3((Math.random()-.5)*.18,fire ? .08 : .55,(Math.random()-.5)*.18)),
        });
      });
    };
    pawn.spawnSkids = function(){
      const THREE = window.THREE;
      if(!THREE || !this.owner || !this.owner.parent) return;
      const skidCfg = this.config.skids || {};
      const contacts = [];
      if(this.backend && this.backend.vehicle){
        this.backend.vehicle.wheelInfos.forEach((info, index) => {
          const layout = this.backend.wheelLayout[index];
          const hit = info.raycastResult && info.raycastResult.hitPointWorld;
          if(layout && !layout.front && info.isInContact && hit) contacts.push({x:hit.x,y:hit.y,z:hit.z});
        });
      }
      if(!contacts.length){
        this.effectAnchors().skid.slice(0,2).forEach(anchor => {
          const p = new THREE.Vector3(); if(anchor.getWorldPosition){ anchor.getWorldPosition(p); contacts.push(p); }
        });
      }
      const shared = GAME && GAME.player && GAME.player.vehicleEffects;
      const heading = this.backend && this.backend.body
        ? 2 * Math.atan2(this.backend.body.quaternion.y, this.backend.body.quaternion.w)
        : (this.owner.rotation ? this.owner.rotation.y : 0);
      if(shared && shared.spawnSkid){
        contacts.forEach(point => shared.spawnSkid(point, heading, skidCfg, clamp(finite(this.state.lateralG,.5), .2, 1)));
        return;
      }
      contacts.forEach(point => {
        const opacity = clamp(finite(skidCfg.opacity, .55), 0, 1);
        const width = Math.max(.04, finite(skidCfg.width, .24));
        const length = Math.max(.12, finite(skidCfg.length, .7));
        const material = new THREE.MeshBasicMaterial({color:0x090a0c, transparent:true, opacity, depthWrite:false, side:THREE.DoubleSide});
        const mark = new THREE.Mesh(new THREE.PlaneGeometry(width,length), material);
        mark.position.set(point.x, point.y + .018, point.z);
        mark.rotation.set(-Math.PI/2, 0, -heading);
        mark.renderOrder = 18;
        mark.userData.logicVehicleEffect = true;
        this.owner.parent.add(mark);
        this.effectsRuntime.skids.push({object:mark, opacity, life:Math.max(1, finite(skidCfg.life, finite(this.config.effects.skidLife, 12)))});
      });
    };
    pawn.updateEffects = function(dt){
      const effects = this.config.effects || {};
      const runtime = this.effectsRuntime;
      const exhaust = this.config.exhaust || {};
      const exhaustEnabled = effects.exhaustEnabled !== false && exhaust.enabled !== false;
      const smokeEnabled = exhaust.smoke !== false;
      const idleSmoke = exhaust.idleSmoke !== false && this.state.throttle <= finite(exhaust.smokeThrottle, .18);
      const activeExhaust = exhaustEnabled && smokeEnabled && (idleSmoke || this.state.throttle > finite(exhaust.smokeThrottle, .18));
      runtime.exhaustClock += dt;
      if(activeExhaust && runtime.exhaustClock >= (idleSmoke ? .42 : Math.max(.035, .13 / Math.max(.2, finite(effects.smokeIntensity, 1))))){
        runtime.exhaustClock = 0; this.spawnExhaust();
      }
      const fireEnabled = exhaustEnabled && exhaust.fire !== false;
      const fireHot = this.state.rpm >= 6900 * clamp(finite(exhaust.fireRpm, .88), .2, 1.2);
      const firePulse = fireEnabled && this.state.throttle > .05 && (fireHot || (exhaust.shiftFire !== false && this.state.shiftPulse > 0) || (exhaust.limiterFire !== false && this.state.limiterPulse > 0));
      runtime.fireClock = finite(runtime.fireClock, 0) + dt;
      if(firePulse && runtime.fireClock >= .035){ runtime.fireClock = 0; this.spawnExhaust(true); }
      const activeSkid = effects.skidEnabled !== false && (!this.config.skids || this.config.skids.enabled !== false) && Math.abs(this.state.speed) > 3 && (this.state.drift || this.state.oversteer || this.state.handbrake || this.state.lateralG > .32);
      runtime.skidClock += dt;
      if(activeSkid && runtime.skidClock >= .09){ runtime.skidClock = 0; this.spawnSkids(); }
      runtime.exhaust = runtime.exhaust.filter(item => {
        item.life -= dt;
        if(item.object){
          item.object.position.addScaledVector(item.velocity, dt);
          const t = 1 - item.life / item.maxLife;
          const scale = item.fire ? item.size * (1.25 - t * .45) : item.size * (.8 + t * 2.8);
          item.object.scale.set(scale,scale,1);
          if(item.object.material) item.object.material.opacity = Math.max(0, (1-t) * (item.fire ? .95 : .32));
        }
        if(item.life > 0) return true;
        if(item.object && item.object.parent) item.object.parent.remove(item.object);
        if(item.object && item.object.material) item.object.material.dispose();
        return false;
      });
      runtime.skids = runtime.skids.filter(item => {
        item.life -= dt;
        if(item.object && item.object.material && item.life < 2) item.object.material.opacity = Math.max(0, item.life / 2 * finite(item.opacity,.5));
        if(item.life > 0) return true;
        if(item.object && item.object.parent) item.object.parent.remove(item.object);
        if(item.object && item.object.geometry) item.object.geometry.dispose();
        if(item.object && item.object.material) item.object.material.dispose();
        return false;
      });
      const neonActive = effects.neonEnabled !== false;
      this.effectAnchors().neon.forEach(anchor => anchor.traverse && anchor.traverse(child => { if(child.isLight){ child.visible = neonActive; child.intensity = neonActive ? .8 : 0; } }));
    };
    pawn.disposeEffects = function(){
      this.effectsRuntime.exhaust.concat(this.effectsRuntime.skids).forEach(item => {
        if(item.object && item.object.parent) item.object.parent.remove(item.object);
        if(item.object && item.object.geometry) item.object.geometry.dispose();
        if(item.object && item.object.material) item.object.material.dispose();
      });
      this.effectsRuntime.exhaust = []; this.effectsRuntime.skids = []; this.effectsRuntime.anchors = null;
    };
    pawn.readPlayerDrive = function(){
      if(!this.possessed || this.playerId == null) return neutralDrive();
      return this.services.input && this.services.input.playerDrive ? this.services.input.playerDrive(this.playerId) : neutralDrive();
    };
    pawn.readDrive = function(){
      if(!this.possessed || this.playerId == null) return neutralDrive();
      if(this.control) return this.control;
      return this.readPlayerDrive();
    };
    pawn.reset = function(){
      const spawn = this.config.spawn;
      this.state.speed = 0; this.state.speedKmh = 0; this.state.reverse = false; this.state.drift = false; this.state.oversteer = false; this.state.burnout = false; this.state.limiter = false;
      if(this.backend){
        const body = this.backend.body;
        body.position.set(spawn.x, spawn.y + this.backend.bodyY, spawn.z);
        body.quaternion.setFromAxisAngle(new window.CANNON.Vec3(0,1,0), spawn.heading);
        body.velocity.set(0,0,0); body.angularVelocity.set(0,0,0);
        body.force.set(0,0,0); body.torque.set(0,0,0);
        if(body.wakeUp) body.wakeUp();
      }
      if(this.owner && this.owner.position && this.owner.position.set) this.owner.position.set(spawn.x, spawn.y, spawn.z);
      if(this.owner && this.owner.rotation) this.owner.rotation.y = spawn.heading;
      emitPawnEvent(this, 'OnPawnReset', {spawn:clone(spawn)});
      return true;
    };
    pawn.publishStateEvents = function(previousDrift, previousGear){
      if(previousDrift !== this.state.drift) emitPawnEvent(this, this.state.drift ? 'OnPawnDriftStart' : 'OnPawnDriftEnd', {state:this.state});
      if(previousGear !== this.state.gear) emitPawnEvent(this, 'OnPawnGearChanged', {gear:this.state.gear, previousGear});
    };
    pawn.step = function(dt){
      if(!this.started || this.disposed || !this.enabled || this.sleeping || !this.owner) return;
      const h = clamp(finite(dt, 0), 0, .1);
      const drive = this.readDrive();
      const tune = this.config.tuning;
      const throttle = clamp(finite(drive.throttle, 0), 0, 1);
      const brake = clamp(finite(drive.brake, 0), 0, 1);
      let steer = clamp(finite(drive.steer, 0), -1, 1);
      let steeringAngle = steer * .48;
      const handbrake = drive.handbrake === true;
      const nativeLights = this.ensureNativeLightRig();
      if(nativeLights && nativeLights.rig){
        nativeLights.rig.setHighBeams(drive.highBeams === true);
        nativeLights.rig.update();
      }
      const previousDrift = this.state.drift;
      const previousGear = this.state.gear;
      if(this.ensurePhysics()){
        const backend = this.backend;
        const body = backend.body;
        const vehicle = backend.vehicle;
        const heading = 2 * Math.atan2(body.quaternion.y, body.quaternion.w);
        const forwardX = Math.sin(heading), forwardZ = Math.cos(heading);
        const forwardSpeed = body.velocity.x * forwardX + body.velocity.z * forwardZ;
        const speedAbs = Math.hypot(body.velocity.x, body.velocity.z);
        const steeringState = window.LK_RUNTIME_VEHICLE_STEERING_CONTROLLER.update({
          target:steer,current:finite(this.state.steer,0),dt:h,response:finite(tune.steerResponse,6.5),
          speed:speedAbs,maxAngle:finite(tune.steerMax,.60),highSpeed:finite(tune.steerHiSpeed,.34),
        });
        steer = steeringState.value;
        steeringAngle = steeringState.angle;
        const reversing = brake > .05 && forwardSpeed < .6 && throttle < .05;
        const driveAmount = reversing ? -brake : throttle;
        const maxForDirection = reversing ? tune.reverseSpeed : tune.maxSpeed;
        const speedRatio = clamp(Math.abs(forwardSpeed) / Math.max(1, maxForDirection), 0, 1);
        if(!this.engineController && window.LK_RUNTIME_VEHICLE_ENGINE_CONTROLLER){
          const gearbox = GAME && GAME.player && GAME.player.gearbox || {idle:950,redline:6900,limiter:7600,upshift:7050,downshift:2700,limiterHold:.34,shiftCut:.34,tops:[13,22,31,40,52],torque:[1.55,1.34,1.16,1.02,.92]};
          this.engineController = window.LK_RUNTIME_VEHICLE_ENGINE_CONTROLLER.create({
            gearbox,
            drive:this.config.driveSetup || {},
            state:{gear:1,rpm:gearbox.idle,rpm01:0,torque01:.6,shiftTimer:0,limiterTimer:0,shiftPulse:0,limiterPulse:0,throttle:0,reverseActive:false,burnout:false,driftShiftSpeed:0},
          });
        }
        const engineState = this.engineController ? this.engineController.update(forwardSpeed,driveAmount>0?driveAmount:0,this.state.drift||handbrake,h,{active:this.state.drift||handbrake,speedTot:speedAbs,lateral:body.velocity.x*forwardZ-body.velocity.z*forwardX,forward:forwardSpeed}) : null;
        if(engineState) engineState.reverseActive = reversing;
        const torqueOutput = engineState ? engineState.torque01 : 1;
        const engineForce = -backend.mass * tune.acceleration * driveAmount * torqueOutput * Math.max(.05, 1 - speedRatio);
        const brakeForce = brake > .05 && !reversing ? backend.mass * tune.brake * brake * .14 : 0;
        const brakeBias = clamp(finite(tune.brakeBias, .56), .48, .62);
        const frontBrake = brakeForce * brakeBias * .5;
        const rearBrake = brakeForce * (1 - brakeBias) * .5 + (handbrake ? backend.mass * 9.82 * .18 * .5 : 0);
        const driven = backend.wheelLayout.map((wheel, index) => ({wheel,index})).filter(item => item.wheel.driven !== false);
        const driveTargets = driven.length ? driven : backend.wheelLayout.map((wheel, index) => ({wheel,index}));
        const mode = tune.driveMode || this.config.driveSetup && this.config.driveSetup.driveMode || 'custom';
        const lateralSpeed = body.velocity.x * forwardZ - body.velocity.z * forwardX;
        const slipAngle = Math.atan2(Math.abs(lateralSpeed), Math.max(1, Math.abs(forwardSpeed)));
        const driftCandidate = speedAbs > 4 && Math.abs(steer) > .12 && (handbrake || slipAngle > .16 || this.state.drift);
        this.driftRuntime = this.driftRuntime || {throttleHold:0};
        if(mode === 'drift' && driftCandidate && throttle > .48){
          this.driftRuntime.throttleHold = Math.min(6, this.driftRuntime.throttleHold + h);
        } else {
          this.driftRuntime.throttleHold = Math.max(0, this.driftRuntime.throttleHold - h * 1.8);
        }
        const spinProgress = mode === 'drift' ? clamp((this.driftRuntime.throttleHold - 2.15) / 2.75, 0, 1) : 0;
        const handbrakeStrength = clamp(finite(tune.handbrake, 1) / 10, -1, 1);
        const handbrakeRearGrip = handbrake ? clamp(.46 - handbrakeStrength * .22, .18, .68) : 1;
        const rearGrip = Math.max(.18, 2.6 * finite(tune.rearGrip, tune.grip) * handbrakeRearGrip * (1 - spinProgress * .68));
        const frontGrip = Math.max(.2, 2.6 * finite(tune.frontGrip, tune.grip));
        const actuatorFactory = window.LK_RUNTIME_VEHICLE_RAYCAST_ACTUATOR;
        const actuator = actuatorFactory && (this.raycastActuator || (this.raycastActuator = actuatorFactory.create()));
        if(actuator) actuator.apply({
          vehicle,
          driven:driveTargets.map(item => item.index),
          engineForce,
          steering:backend.wheelLayout.map((wheel,index) => wheel.front ? index : null).filter(index => index != null),
          steer:steeringAngle,
          brakes:backend.wheelLayout.map(wheel => wheel.front ? frontBrake : rearBrake),
          frictionSlip:backend.wheelLayout.map(wheel => wheel.front ? frontGrip : rearGrip),
        });
        // Keep an initiated drift controllable; sustained full throttle progressively
        // removes the safety margin until the car can rotate into a spin.
        if(mode === 'drift' && driftCandidate){
          const turnSign = Math.abs(steer) > .08 ? Math.sign(steer) : Math.sign(lateralSpeed || 1);
          body.angularVelocity.y += turnSign * h * ((handbrake ? .38 : .18) + spinProgress * .72);
        }
        // A road car must not wheelie or stoppie under normal acceleration/braking.
        const pitchLimit = mode === 'race' ? .48 : (mode === 'drift' ? .72 : .58);
        body.angularVelocity.x = clamp(body.angularVelocity.x * (1 - h * 2.4), -pitchLimit, pitchLimit);
        body.angularVelocity.z = clamp(body.angularVelocity.z * (1 - h * 1.25), -1.15, 1.15);
        if(this.owner.position && this.owner.quaternion){
          this.owner.position.set(body.position.x, body.position.y - backend.bodyY, body.position.z);
          this.owner.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
          this.owner.updateMatrixWorld(true);
        }
        backend.wheelVisuals.forEach((visual, index) => {
          if(!visual) return;
          const wheel = vehicle.wheelInfos[index];
          const updater = window.LK_RUNTIME_VEHICLE_VISUAL_CONTROLLER;
          const sharedController = updater && (this.visualController || (this.visualController = updater.create()));
          const visualState = sharedController && sharedController.updateWheel({
            visual:visual.shared, wheelInfo:wheel, suspension:backend.suspension, dt:h,
            forwardSpeed, radius:backend.wheelLayout[index] && backend.wheelLayout[index].radius,
            front:backend.wheelLayout[index] && backend.wheelLayout[index].front,
            steerAngle:steeringAngle, steerVisualScale:1.25, baseY:visual.baseY, chassisLift:0,
          });
          const diagnostic = this.owner.userData.vehicleWheelRigStatus && this.owner.userData.vehicleWheelRigStatus[index];
          if(diagnostic && visualState){ diagnostic.rotation = visualState.spin; diagnostic.cannonRotation = Number(wheel.rotation) || 0; diagnostic.steer = visualState.steer; diagnostic.speed = forwardSpeed; }
        });
        const modelRig = this.ensureModelWheelRig();
        if(modelRig){
          modelRig.drive(forwardSpeed,h,steeringAngle*1.25);
          modelRig.setSuspension(vehicle.wheelInfos.map(info => clamp(backend.suspension.restLength-finite(info.suspensionLength,backend.suspension.restLength),-backend.suspension.travel,backend.suspension.travel)));
        }
        this.updateLights(drive, reversing);
        this.state.speed = forwardSpeed;
        this.state.speedKmh = speedAbs * 3.6;
        this.state.reverse = forwardSpeed < -.1;
        this.state.drift = driftCandidate && (handbrake || slipAngle > .16 || (mode === 'drift' && throttle > .35));
        this.state.lateralG = Math.abs((body.angularVelocity && body.angularVelocity.y || 0) * speedAbs) / 9.82;
        this.state.oversteer = this.state.drift || (handbrake && this.state.lateralG > .35);
        this.state.groundedWheels = vehicle.wheelInfos.reduce((count, wheel) => count + (wheel.isInContact ? 1 : 0), 0);
        this.state.steer = steer; this.state.throttle = throttle; this.state.brake = brake; this.state.handbrake = handbrake;
        this.state.rpm = engineState ? engineState.rpm : 900 + clamp(speedAbs / Math.max(1, tune.maxSpeed), 0, 1) * 6900;
        this.state.gear = this.state.reverse ? -1 : (engineState ? engineState.gear : Math.max(1, Math.min(6, 1 + Math.floor(speedAbs / Math.max(1, tune.maxSpeed / 6)))));
        this.state.shiftPulse = engineState ? finite(engineState.shiftPulse, 0) : 0;
        this.state.limiterPulse = engineState ? finite(engineState.limiterPulse, 0) : 0;
        this.state.burnout = throttle > .65 && brake > .25 && !handbrake && speedAbs < 8.5;
        this.state.limiter = throttle > .9 && speedRatio > .97;
        this.owner.userData.vehicleRuntimeDiagnostics = {
          pawnId:this.id, playerId:this.playerId, started:this.started, enabled:this.enabled,
          physicsMode:this.physicsMode, speed:Number(forwardSpeed.toFixed(3)),
          modelRig:this.owner.userData.vehicleModelRigDiagnostics || null,
          input:{throttle,brake,steer,handbrake},
          drive:{mode,slipAngle:Number(slipAngle.toFixed(3)),driftHold:Number(this.driftRuntime.throttleHold.toFixed(2)),spinProgress:Number(spinProgress.toFixed(2))},
          tuning:{maxSpeed:Number(tune.maxSpeed.toFixed(3)),acceleration:Number(tune.acceleration.toFixed(3)),brake:Number(tune.brake.toFixed(3)),steer:Number(tune.steer.toFixed(3)),grip:Number(tune.grip.toFixed(3))},
          body:{x:Number(body.position.x.toFixed(3)),y:Number(body.position.y.toFixed(3)),z:Number(body.position.z.toFixed(3))},
          wheels:vehicle.wheelInfos.map((info, index) => {
            const visual = backend.wheelVisuals[index];
            const status = this.owner.userData.vehicleWheelRigStatus && this.owner.userData.vehicleWheelRigStatus[index] || {};
            let visible = !!(visual && visual.node);
            for(let node = visual && visual.node; node; node = node.parent) if(node.visible === false) visible = false;
            return {
              id:backend.wheelLayout[index] && backend.wheelLayout[index].visualId || ['wheel_front_left','wheel_front_right','wheel_rear_left','wheel_rear_right'][index],
              contact:info.isInContact === true,
              suspension:Number(finite(info.suspensionLength,0).toFixed(3)),
              cannonRotation:Number(finite(info.rotation,0).toFixed(3)),
              visualRotation:Number(finite(status.rotation,0).toFixed(3)),
              steer:Number(finite(status.steer,0).toFixed(3)),
              visual:!!visual, spinRoot:!!(visual && visual.spinRoot), visible,
              node:visual && visual.node && visual.node.name || null,
              spinMeshes:visual ? visual.spinMeshes.map(mesh => ({name:mesh.name||mesh.type,rotationX:Number(finite(mesh.rotation&&mesh.rotation.x,0).toFixed(3))})) : [],
            };
          }),
        };
        this.updateEffects(h);
        this.updateAuxRuntime(h);
        this.publishStateEvents(previousDrift, previousGear);
        return;
      }
      let speed = finite(this.state.speed, 0);
      if(throttle > 0) speed += tune.acceleration * throttle * h;
      if(brake > 0){
        if(speed > .35) speed -= tune.brake * brake * h;
        else speed -= tune.acceleration * .7 * brake * h;
      }
      const drag = tune.drag * (handbrake ? 2.6 : 1);
      if(Math.abs(speed) > .001) speed -= Math.sign(speed) * Math.min(Math.abs(speed), drag * h);
      speed = clamp(speed, -tune.reverseSpeed, tune.maxSpeed);
      const steerGrip = handbrake ? .58 : tune.grip;
      const turn = steer * tune.steer * steerGrip * clamp(Math.abs(speed) / 4, .12, 1) * (speed < 0 ? -1 : 1) * h;
      if(this.owner.rotation) this.owner.rotation.y += turn;
      const heading = this.owner.rotation ? finite(this.owner.rotation.y, 0) : 0;
      if(this.owner.position){
        this.owner.position.x += Math.sin(heading) * speed * h;
        this.owner.position.z += Math.cos(heading) * speed * h;
      }
      this.state.speed = speed;
      this.state.speedKmh = Math.abs(speed) * 3.6;
      this.state.reverse = speed < -.1;
      this.state.drift = handbrake && Math.abs(speed) > 4 && Math.abs(steer) > .15;
      this.state.lateralG = Math.abs(turn * Math.abs(speed) / Math.max(.001, h)) / 9.82;
      this.state.oversteer = this.state.drift || (handbrake && this.state.lateralG > .35);
      this.state.steer = steer; this.state.throttle = throttle; this.state.brake = brake; this.state.handbrake = handbrake;
      this.state.rpm = 900 + clamp(Math.abs(speed) / Math.max(1, tune.maxSpeed), 0, 1) * 6900;
      this.state.gear = this.state.reverse ? -1 : Math.max(1, Math.min(6, 1 + Math.floor(Math.abs(speed) / Math.max(1, tune.maxSpeed / 6))));
      this.state.burnout = throttle > .65 && brake > .25 && !handbrake && Math.abs(speed) < 8.5;
      this.state.limiter = throttle > .9 && Math.abs(speed) >= tune.maxSpeed * .97;
      this.updateEffects(h);
      this.updateAuxRuntime(h);
      this.publishStateEvents(previousDrift, previousGear);
    };
    pawn.dispose = function(){
      if(this.disposed) return;
      this.disposed = true; this.started = false; this.control = null;
      this.possessCamera(false);
      if(this.backend){
        const backend = this.backend;
        if(backend.dispose) backend.dispose(this);
        else {
          if(backend.body && backend.onCollide && backend.body.removeEventListener) backend.body.removeEventListener('collide', backend.onCollide);
          if(backend.vehicle && backend.vehicle.removeFromWorld) backend.vehicle.removeFromWorld(backend.world);
          else if(backend.body && backend.world) backend.world.removeBody(backend.body);
        }
        this.backend = null;
      }
      this.disposeEffects();
      if(this.lightRigRuntime){
        (this.lightRigRuntime.roots || []).forEach(root => { if(root && root.parent) root.parent.remove(root); });
        this.lightRigRuntime = null;
      }
      if(this.modelRigRuntime && this.modelRigRuntime.clear) this.modelRigRuntime.clear();
      this.modelRigRuntime = null;
      this.modelRigAttemptedRoot = null;
      this.disposeAuxRuntime();
      unregister(this);
      if(this.owner && this.owner.userData) delete this.owner.userData.vehiclePawnId;
    };
    if(!owner.userData) owner.userData = {};
    owner.userData.vehiclePawnId = pawn.id;
    // Logic vehicles own their setup. Legacy/template instances without one start
    // from the balanced Logic default, never from the native singleton's tuning.
    const defaultDriveSetup = window.LK_RUNTIME_DRIVE_TUNING && window.LK_RUNTIME_DRIVE_TUNING.PRESETS && window.LK_RUNTIME_DRIVE_TUNING.PRESETS.default;
    if(!pawn.config.driveSetup && defaultDriveSetup) pawn.config.driveSetup = clone(defaultDriveSetup);
    if(pawn.config.driveSetup) pawn.setDriveSetup(pawn.config.driveSetup);
    register(pawn);
    return pawn;
  }

  function get(ref){
    if(!ref) return null;
    if(typeof ref === 'object' && ref.id && pawns.get(ref.id) === ref) return ref;
    if(typeof ref === 'object' && ref.userData && ref.userData.vehiclePawnId) return pawns.get(ref.userData.vehiclePawnId) || null;
    return pawns.get(String(ref)) || null;
  }

  function getByPlayerId(playerId){
    const id = playerSlots.get(normalizePlayerId(playerId));
    return id ? pawns.get(id) || null : null;
  }
  function firstAvailablePlayerId(){ for(let id=1;id<=4;id++) if(!playerSlots.has(id)) return id; return null; }
  function possessFirstAvailable(ref){
    const pawn = get(ref);
    if(!pawn || !pawn.possess) return null;
    const playerId = firstAvailablePlayerId();
    return playerId != null && pawn.possess(playerId, false) ? playerId : null;
  }

  function list(){ return Array.from(pawns.values()); }
  function syncNativeFromPlayer(){
    const pawn = pawns.get('native-player-car');
    if(!pawn || !GAME || !GAME.player) return pawn || null;
    pawn.enabled = GAME.player.enabled !== false;
    pawn.hidden = GAME.player.hidden === true;
    const wanted = GAME.player.controllerIndex == null ? null : normalizePlayerId(Number(GAME.player.controllerIndex) + 1);
    releaseSlot(pawn);
    pawn.playerId = null; pawn.possessed = false;
    if(wanted != null) claimSlot(pawn, wanted, true);
    return pawn;
  }
  function stepAll(dt){ list().forEach(pawn => { if(pawn.step) pawn.step(dt); }); }
  function disposeLogic(){ list().filter(pawn => pawn.kind === 'logic-element').forEach(pawn => pawn.dispose()); }
  function ensureNative(){ return GAME && GAME.player ? createNative(GAME.player) : null; }

  const api = Object.freeze({schemaVersion:SCHEMA_VERSION, normalizeConfig, register, unregister, createNative, createLogic, ensureNative, syncNativeFromPlayer, get, getByPlayerId, firstAvailablePlayerId, possessFirstAvailable, list, stepAll, disposeLogic});
  if(GAME){
    GAME.pawns = api;
    if(GAME.systems) GAME.systems.vehiclePawns = api;
  }
  return api;
}

function install(GAME){
  if(!GAME) return null;
  if(GAME.pawns && GAME.pawns.schemaVersion === SCHEMA_VERSION) return GAME.pawns;
  const registry = createRegistry(GAME);
  const pawnCore = window.LK_RUNTIME_PAWN_CORE && window.LK_RUNTIME_PAWN_CORE.install(GAME);
  if(pawnCore && pawnCore.components && !pawnCore.components.has('vehicle')){
    pawnCore.components.register('vehicle', options => registry.createLogic(options.owner, options.config, options.services));
  }
  registry.ensureNative();
  return registry;
}

window.LK_RUNTIME_VEHICLE_PAWNS = Object.freeze({SCHEMA_VERSION, normalizeConfig, createRegistry, install});
if(window.LOT_KING) install(window.LOT_KING);
})();
