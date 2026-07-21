/* =========================================================
   LOT KING - Logic Element runtime services
   Thin engine-facing layer used by nodes.
   ========================================================= */
(function(){
'use strict';

function createDebugService(GAME, label, THREE){
  const logs = [];
  function push(level, message, opts){
    opts = opts || {};
    const item = {time:Date.now(), level, message:String(message == null ? '' : message), source:label || 'Logic'};
    logs.push(item);
    if(logs.length > 200) logs.shift();
    const prefix = '[' + item.source + '] ';
    if(level === 'error') console.error(prefix + item.message);
    else if(level === 'warn') console.warn(prefix + item.message);
    else console.log(prefix + item.message);
    if(GAME && GAME.ui && GAME.ui.popup && level !== 'debug') GAME.ui.popup(prefix + item.message, opts.color || (level === 'error' ? '#ff6b6b' : '#9db4ff'), opts.duration);
  }
  function scene(){ return GAME && GAME.core && GAME.core.scene || null; }
  function vector(value){
    if(!THREE) return null;
    if(value && value.isVector3) return value.clone();
    if(Array.isArray(value)) return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    return new THREE.Vector3(Number(value && value.x) || 0, Number(value && value.y) || 0, Number(value && value.z) || 0);
  }
  return Object.freeze({
    log: (message, opts) => push('log', message, opts),
    warn: (message, opts) => push('warn', message, opts),
    error: (message, opts) => push('error', message, opts),
    list: () => logs.slice(),
    drawLine: (start, end, color, duration) => {
      const scn = scene();
      const a = vector(start);
      const b = vector(end);
      if(!THREE || !scn || !a || !b) return null;
      const geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
      const material = new THREE.LineBasicMaterial({color:color || '#ffd166'});
      const line = new THREE.Line(geometry, material);
      line.name = 'Logic Debug Line';
      line.userData.editorOnly = true;
      line.userData.logicDebugLine = true;
      scn.add(line);
      const ms = Math.max(.01, Number(duration) || 1) * 1000;
      setTimeout(() => {
        if(line.parent) line.parent.remove(line);
        if(geometry.dispose) geometry.dispose();
        if(material.dispose) material.dispose();
      }, ms);
      return line;
    },
  });
}

function createObjectService(GAME, owner){
  let runtimeCounter = 0;
  function registry(){ return GAME && GAME.world && Array.isArray(GAME.world.registry) ? GAME.world.registry : []; }
  function scene(){ return GAME && GAME.core && GAME.core.scene || null; }
  function ownerChildren(){
    const out = [];
    if(owner && owner.traverse) owner.traverse(child => {
      if(child !== owner) out.push(child);
    });
    return out;
  }
  function allObjects(){
    const out = registry().slice();
    ownerChildren().forEach(child => {
      if(!out.includes(child)) out.push(child);
    });
    return out;
  }
  function labelOf(o){
    return String(o && o.userData && (o.userData.editorName || o.userData.logicElementSceneId) || o && o.name || '').toLowerCase();
  }
  function normalizedType(value){ return String(value || '').toLowerCase().replace(/[\s_.-]+/g, ''); }
  function matchesType(o, requested){
    if(!o) return false;
    const wanted = normalizedType(requested);
    if(!wanted || wanted === 'all' || wanted === 'element' || wanted === 'object') return true;
    const data = o.userData || {};
    const editorType = normalizedType(data.editorType || data.kind);
    if(wanted === editorType) return true;
    if((wanted === 'camera' || wanted === 'scenecamera') && (editorType === 'camera' || o.isCamera || data.sceneCamera)) return true;
    if((wanted === 'timeline' || wanted === 'cinema' || wanted === 'cinemastudio') && editorType === 'cinemastudio') return true;
    if((wanted === 'logic' || wanted === 'logicelement') && editorType === 'logicelement') return true;
    if((wanted === 'player' || wanted === 'pawn' || wanted === 'playercar') && (editorType === 'playercar' || data.playerCarLogicElement)) return true;
    if(wanted === 'mesh' && (o.isMesh || editorType === 'mesh' || editorType === 'glb')) return true;
    if(wanted === 'light' && (o.isLight || editorType === 'light')) return true;
    if(wanted === 'spotlight' && (o.isSpotLight || normalizedType(data.lightKind) === 'spot')) return true;
    if(wanted === 'pointlight' && (o.isPointLight || normalizedType(data.lightKind) === 'point')) return true;
    if(wanted === 'directionallight' && (o.isDirectionalLight || normalizedType(data.lightKind) === 'directional')) return true;
    return false;
  }
  function colorOf(value){
    const THREERef = window.THREE;
    if(!THREERef || !THREERef.Color) return null;
    try { return new THREERef.Color(value || '#7dd3fc'); }
    catch(err){ return null; }
  }
  return Object.freeze({
    owner: () => owner || null,
    childByName: name => {
      const needle = String(name || '').toLowerCase();
      if(needle === 'root' || needle === 'owner') return owner || null;
      return ownerChildren().find(o => labelOf(o) === needle) || null;
    },
    byId: id => {
      const needle = String(id || '').toLowerCase();
      if(needle === 'root' || needle === 'owner') return owner || null;
      return allObjects().find(o => o && o.userData && (o.userData.editorId === id || o.userData.logicElementSceneId === id)) || null;
    },
    byName: name => {
      const needle = String(name || '').toLowerCase();
      return allObjects().find(o => labelOf(o) === needle) || null;
    },
    byType: type => allObjects().find(o => matchesType(o, type)) || null,
    allByType: type => allObjects().filter(o => matchesType(o, type)),
    createPrimitive: (opts) => {
      const THREERef = window.THREE;
      if(!THREERef) return null;
      opts = opts || {};
      const primitive = String(opts.primitive || 'box').toLowerCase();
      const size = Array.isArray(opts.size) ? opts.size : [1, 1, 1];
      let geometry;
      if(primitive === 'sphere') geometry = new THREERef.SphereGeometry(Math.max(.01, Number(size[0]) || 1) * .5, 24, 16);
      else if(primitive === 'plane') geometry = new THREERef.PlaneGeometry(Math.max(.01, Number(size[0]) || 1), Math.max(.01, Number(size[1]) || 1));
      else if(primitive === 'cylinder') geometry = new THREERef.CylinderGeometry(Math.max(.01, Number(size[0]) || 1) * .5, Math.max(.01, Number(size[0]) || 1) * .5, Math.max(.01, Number(size[1]) || 1), 24);
      else geometry = new THREERef.BoxGeometry(Math.max(.01, Number(size[0]) || 1), Math.max(.01, Number(size[1]) || 1), Math.max(.01, Number(size[2]) || 1));
      const color = colorOf(opts.color) || new THREERef.Color('#7dd3fc');
      const material = THREERef.MeshStandardMaterial
        ? new THREERef.MeshStandardMaterial({color, roughness:.58, metalness:.05})
        : new THREERef.MeshBasicMaterial({color});
      const mesh = new THREERef.Mesh(geometry, material);
      mesh.name = String(opts.name || primitive || 'Primitive');
      mesh.userData.editorName = mesh.name;
      mesh.userData.logicRuntimeObject = true;
      mesh.userData.editorId = 'logic_runtime_' + Date.now().toString(36) + '_' + (runtimeCounter++);
      const parent = opts.parent || owner || scene();
      if(parent && parent.add) parent.add(mesh);
      if(!opts.parent && !owner && GAME && GAME.world && GAME.world.register) GAME.world.register(mesh, mesh.name, 'mesh', {id:mesh.userData.editorId, builtin:false});
      return mesh;
    },
    createEmpty: opts => {
      const THREERef = window.THREE;
      if(!THREERef) return null;
      opts = opts || {};
      const object = new THREERef.Object3D();
      object.name = String(opts.name || 'Empty');
      object.userData.editorName = object.name;
      object.userData.logicRuntimeObject = true;
      object.userData.editorId = 'logic_runtime_' + Date.now().toString(36) + '_' + (runtimeCounter++);
      const parent = opts.parent || owner || scene();
      if(parent && parent.add) parent.add(object);
      if(!opts.parent && !owner && GAME && GAME.world && GAME.world.register) GAME.world.register(object, object.name, 'empty', {id:object.userData.editorId, builtin:false});
      return object;
    },
    setParent: (child, parent, keepWorld) => {
      if(!child || !parent || !parent.add) return false;
      if(keepWorld !== false && parent.attach) parent.attach(child);
      else parent.add(child);
      return true;
    },
    destroy: object => {
      if(!object) return false;
      if(GAME && GAME.world && GAME.world.unregister && registry().includes(object)) GAME.world.unregister(object);
      if(object.parent) object.parent.remove(object);
      if(object.geometry) object.geometry.dispose();
      if(object.material){
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(mat => mat && mat.dispose && mat.dispose());
      }
      return true;
    },
  });
}

function createTransformService(THREE, STORE){
  function vec(value){
    if(value && value.isVector3) return value.clone();
    if(Array.isArray(value)) return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    return new THREE.Vector3(Number(value && value.x) || 0, Number(value && value.y) || 0, Number(value && value.z) || 0);
  }
  return Object.freeze({
    vector3: vec,
    getPosition: object => object && object.position ? [object.position.x, object.position.y, object.position.z] : [0,0,0],
    translate: (object, delta) => {
      if(!object || !object.position) return false;
      object.position.add(vec(delta));
      if(STORE && STORE.syncCollider) STORE.syncCollider(object);
      return true;
    },
    setPosition: (object, position) => {
      if(!object || !object.position) return false;
      object.position.copy(vec(position));
      if(STORE && STORE.syncCollider) STORE.syncCollider(object);
      return true;
    },
    getRotation: object => object && object.rotation ? [
      THREE.MathUtils.radToDeg(object.rotation.x),
      THREE.MathUtils.radToDeg(object.rotation.y),
      THREE.MathUtils.radToDeg(object.rotation.z),
    ] : [0,0,0],
    setRotation: (object, rotation) => {
      if(!object || !object.rotation) return false;
      const r = vec(rotation);
      object.rotation.set(THREE.MathUtils.degToRad(r.x), THREE.MathUtils.degToRad(r.y), THREE.MathUtils.degToRad(r.z));
      if(STORE && STORE.syncCollider) STORE.syncCollider(object);
      return true;
    },
    rotate: (object, delta) => {
      if(!object || !object.rotation) return false;
      const d = vec(delta);
      object.rotation.x += THREE.MathUtils.degToRad(d.x);
      object.rotation.y += THREE.MathUtils.degToRad(d.y);
      object.rotation.z += THREE.MathUtils.degToRad(d.z);
      if(STORE && STORE.syncCollider) STORE.syncCollider(object);
      return true;
    },
    getScale: object => object && object.scale ? [object.scale.x, object.scale.y, object.scale.z] : [1,1,1],
    setScale: (object, scale) => {
      if(!object || !object.scale) return false;
      object.scale.copy(vec(scale));
      if(STORE && STORE.syncCollider) STORE.syncCollider(object);
      return true;
    },
    setVisible: (object, visible) => {
      if(!object) return false;
      object.visible = visible !== false;
      return true;
    },
  });
}

function createInputService(GAME){
  const root = window;
  const state = root.LK_LOGIC_INPUT_STATE || {
    installed:false,
    keys:new Set(),
    pointer:{x:0, y:0, deltaX:0, deltaY:0, buttons:0},
  };
  if(!state.installed && typeof root.addEventListener === 'function'){
    state.installed = true;
    root.addEventListener('keydown', e => state.keys.add(String(e.key || '').toLowerCase()));
    root.addEventListener('keyup', e => state.keys.delete(String(e.key || '').toLowerCase()));
    root.addEventListener('pointermove', e => {
      state.pointer.deltaX = Number(e.movementX) || 0;
      state.pointer.deltaY = Number(e.movementY) || 0;
      state.pointer.x = Number(e.clientX) || 0;
      state.pointer.y = Number(e.clientY) || 0;
      state.pointer.buttons = Number(e.buttons) || 0;
    });
    root.addEventListener('pointerdown', e => {
      state.pointer.x = Number(e.clientX) || 0;
      state.pointer.y = Number(e.clientY) || 0;
      state.pointer.buttons = Number(e.buttons) || 0;
    });
    root.addEventListener('pointerup', e => {
      state.pointer.x = Number(e.clientX) || 0;
      state.pointer.y = Number(e.clientY) || 0;
      state.pointer.buttons = Number(e.buttons) || 0;
    });
    root.LK_LOGIC_INPUT_STATE = state;
  }
  return Object.freeze({
    isKeyPressed: key => state.keys.has(String(key || '').toLowerCase()),
    playerDrive: playerId => {
      const id = Number(playerId);
      if(!Number.isFinite(id) || id < 1 || id > 4 || !GAME || !GAME.input || !GAME.input.player) return {steer:0, throttle:0, brake:0, handbrake:false, device:null};
      if(GAME.input.ensurePlayerSlot) GAME.input.ensurePlayerSlot(id - 1);
      const view = GAME.input.player(id - 1);
      const drive = view && view.drive ? view.drive() : {};
      return {
        steer:Number(drive.steer) || 0, throttle:Number(drive.throttle) || 0,
        brake:Number(drive.brake) || 0, handbrake:drive.handbrake === true,
        highBeams:drive.highBeams === true, reset:drive.reset === true,
        device:view && view.device ? view.device() : null,
      };
    },
    pointer: () => Object.assign({}, state.pointer),
  });
}

function createPawnService(GAME, STORE, owner, graph, inputService){
  const registry = GAME && GAME.pawns
    ? GAME.pawns
    : (window.LK_RUNTIME_VEHICLE_PAWNS && GAME ? window.LK_RUNTIME_VEHICLE_PAWNS.install(GAME) : null);
  const characterDefinition = graph && graph.characterPawn;
  const soccerDefinition = !characterDefinition && graph && graph.soccerPawn;
  const sourceDefinition = !characterDefinition && !soccerDefinition && graph && (graph.vehiclePawn || graph.playerPawnBlueprint) || null;
  const variableValues = new Map((graph && Array.isArray(graph.variables) ? graph.variables : []).map(variable => [String(variable && variable.name || ''), variable && variable.value]));
  const definition = sourceDefinition ? Object.assign({}, sourceDefinition, {
    enabled:variableValues.has('PawnEnabled') ? variableValues.get('PawnEnabled') !== false : sourceDefinition.enabled,
    hidden:variableValues.has('Hidden') ? variableValues.get('Hidden') === true : sourceDefinition.hidden,
    playerId:variableValues.has('ControllerPlayerId') ? variableValues.get('ControllerPlayerId') : sourceDefinition.playerId,
    tuning:Object.assign({}, sourceDefinition.tuning || {}, {
      horsepower:variableValues.has('Horsepower') ? variableValues.get('Horsepower') : sourceDefinition.tuning && sourceDefinition.tuning.horsepower,
      torque:variableValues.has('Torque') ? variableValues.get('Torque') : sourceDefinition.tuning && sourceDefinition.tuning.torque,
      maxSpeed:variableValues.has('MaxSpeed') ? variableValues.get('MaxSpeed') : sourceDefinition.tuning && sourceDefinition.tuning.maxSpeed,
    }),
    lights:Object.assign({}, sourceDefinition.lights || {}, {
      enabled:variableValues.has('HeadlightsEnabled') ? variableValues.get('HeadlightsEnabled') !== false : !(sourceDefinition.lights && sourceDefinition.lights.enabled === false),
    }),
    effects:Object.assign({}, sourceDefinition.effects || {}, {
      exhaustEnabled:variableValues.has('ExhaustEnabled') ? variableValues.get('ExhaustEnabled') !== false : !(sourceDefinition.effects && sourceDefinition.effects.exhaustEnabled === false),
      skidEnabled:variableValues.has('SkidsEnabled') ? variableValues.get('SkidsEnabled') !== false : !(sourceDefinition.effects && sourceDefinition.effects.skidEnabled === false),
      neonEnabled:variableValues.has('NeonEnabled') ? variableValues.get('NeonEnabled') !== false : !(sourceDefinition.effects && sourceDefinition.effects.neonEnabled === false),
    }),
    camera:Object.assign({}, sourceDefinition.camera || sourceDefinition.cam || {}, {
      mode:variableValues.has('CameraMode') ? variableValues.get('CameraMode') : sourceDefinition.camera && sourceDefinition.camera.mode,
    }),
  }) : null;
  const applyGraphBindings = target => {
    if(!target) return target;
    const setBoundValue = (destination, path, value) => {
      const keys = String(path || '').split('.').filter(Boolean);
      if(!keys.length) return;
      let cursor = destination;
      for(let index=0; index<keys.length-1; index++){
        const key = keys[index];
        if(!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {};
        cursor = cursor[key];
      }
      cursor[keys[keys.length - 1]] = value;
    };
    (graph.variables || []).forEach(variable => {
      if(variable && variable.exposed === true && variable.binding) setBoundValue(target, variable.binding, variable.value);
    });
    const overrides = owner && owner.userData && owner.userData.logicVariableOverrides || {};
    const spawnVariables = (graph.variables || []).filter(variable => variable && /^spawn\.(?:x|y|z|heading)$/.test(String(variable.binding || '')));
    const hasInstanceSpawn = spawnVariables.some(variable => Object.prototype.hasOwnProperty.call(overrides, variable.name));
    if(owner && owner.position && !hasInstanceSpawn){
      target.spawn = Object.assign({}, target.spawn || {}, {
        x:Number(owner.position.x) || 0,
        y:Number(owner.position.y) || 0,
        z:Number(owner.position.z) || 0,
        heading:owner.rotation ? Number(owner.rotation.y) || 0 : 0,
      });
    }
    return target;
  };
  if(definition) applyGraphBindings(definition);
  let self = null;
  if(registry && owner && characterDefinition && window.LK_RUNTIME_CHARACTER_PAWNS){
    self = window.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME, owner, applyGraphBindings(JSON.parse(JSON.stringify(characterDefinition))), {input:inputService, graph, STORE});
  } else if(registry && owner && soccerDefinition && window.LK_RUNTIME_SOCCER_PAWNS){
    self = window.LK_RUNTIME_SOCCER_PAWNS.createLogic(GAME, owner, applyGraphBindings(JSON.parse(JSON.stringify(soccerDefinition))), {input:inputService, graph, STORE});
  } else if(registry && owner && definition){
    self = registry.createLogic(owner, definition, {input:inputService, graph, STORE});
  } else if(registry && owner){
    self = registry.get(owner);
  }
  function resolve(ref){
    if(ref === 'self' || ref == null || ref === '') return self;
    if(ref && ref.userData) return registry && registry.get(ref);
    return registry && registry.get(ref);
  }
  return Object.freeze({
    registry,
    self:() => self,
    get:resolve,
    owner:ref => { const pawn = resolve(ref); return pawn && pawn.owner || null; },
    getByPlayerId:playerId => registry && registry.getByPlayerId(playerId),
    firstAvailablePlayerId:() => registry && registry.firstAvailablePlayerId ? registry.firstAvailablePlayerId() : null,
    possessFirstAvailable:ref => registry && registry.possessFirstAvailable ? registry.possessFirstAvailable(resolve(ref)) : null,
    list:() => registry ? registry.list() : [],
    possess:(ref, playerId, force) => { const pawn = resolve(ref); return !!(pawn && pawn.possess && pawn.possess(playerId, force)); },
    unpossess:ref => { const pawn = resolve(ref); return !!(pawn && pawn.unpossess && pawn.unpossess()); },
    setControl:(ref, input) => { const pawn = resolve(ref); return pawn && pawn.setControl ? pawn.setControl(input) : null; },
    setEnabled:(ref, value) => { const pawn = resolve(ref); return pawn && pawn.setEnabled ? pawn.setEnabled(value) : false; },
    setTuning:(ref, patch) => { const pawn = resolve(ref); return pawn && pawn.setTuning ? pawn.setTuning(patch) : null; },
    setSuspension:(ref, patch) => { const pawn = resolve(ref); return pawn && pawn.setSuspension ? pawn.setSuspension(patch) : null; },
    setLights:(ref, patch) => { const pawn = resolve(ref); return pawn && pawn.setLights ? pawn.setLights(patch) : null; },
    setEffects:(ref, patch) => { const pawn = resolve(ref); return pawn && pawn.setEffects ? pawn.setEffects(patch) : null; },
    setCamera:(ref, patch) => { const pawn = resolve(ref); return pawn && pawn.setCamera ? pawn.setCamera(patch) : null; },
    setEngineAudio:(ref, patch) => { const pawn = resolve(ref); return pawn && pawn.setEngineAudio ? pawn.setEngineAudio(patch) : null; },
    setDataWidgets:(ref, patch) => { const pawn = resolve(ref); return pawn && pawn.setDataWidgets ? pawn.setDataWidgets(patch) : null; },
    possessCamera:(ref, value) => { const pawn = resolve(ref); return !!(pawn && pawn.possessCamera && pawn.possessCamera(value)); },
    input:ref => { const pawn = resolve(ref); return pawn && pawn.readPlayerDrive ? pawn.readPlayerDrive() : {steer:0, throttle:0, brake:0, handbrake:false, device:null}; },
    reset:ref => { const pawn = resolve(ref); return !!(pawn && pawn.reset && pawn.reset()); },
    state:ref => { const pawn = resolve(ref); return pawn ? pawn.state : null; },
  });
}

function createPhysicsService(GAME, THREE){
  function CANNONRef(){ return window.CANNON || null; }
  function raw(){ return GAME && GAME.systems && GAME.systems.physics && GAME.systems.physics.raw || null; }
  function world(){ const r = raw(); return r && r.world || null; }
  function vec3(value){
    const CANNON = CANNONRef();
    const v = value && value.isVector3 ? [value.x, value.y, value.z] : (Array.isArray(value) ? value : [value && value.x, value && value.y, value && value.z]);
    return CANNON ? new CANNON.Vec3(Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0) : null;
  }
  function createShape(shape, size){
    const CANNON = CANNONRef();
    if(!CANNON) return null;
    const s = Array.isArray(size) ? size : [1,1,1];
    const kind = String(shape || 'box').toLowerCase();
    if(kind === 'sphere') return new CANNON.Sphere(Math.max(.01, Number(s[0]) || 1) * .5);
    if(kind === 'plane') return new CANNON.Plane();
    return new CANNON.Box(new CANNON.Vec3(Math.max(.01, Number(s[0]) || 1) * .5, Math.max(.01, Number(s[1]) || 1) * .5, Math.max(.01, Number(s[2]) || 1) * .5));
  }
  function emitCollision(body, event){
    const other = event && event.body || null;
    const detail = {
      body,
      otherBody:other,
      object:body && body.logicObject || null,
      otherObject:other && other.logicObject || null,
      contact:event && event.contact || null,
    };
    if(window && window.dispatchEvent && window.CustomEvent) window.dispatchEvent(new CustomEvent('lk-logic-collision-begin', {detail}));
  }
  function watchCollision(body){
    if(!body || body.__lkLogicCollisionWatch || !body.addEventListener) return body;
    body.__lkLogicCollisionWatch = true;
    body.addEventListener('collide', event => emitCollision(body, event));
    return body;
  }
  return Object.freeze({
    createBody: opts => {
      const CANNON = CANNONRef();
      const w = world();
      if(!CANNON || !w) return null;
      opts = opts || {};
      const body = new CANNON.Body({mass:Number(opts.mass) || 0});
      const shape = createShape(opts.shape, opts.size);
      if(shape) body.addShape(shape);
      const p = vec3(opts.position || [0,0,0]);
      if(p) body.position.copy(p);
      body.userData = Object.assign({}, body.userData || {}, {logicPhysicsBody:true});
      watchCollision(body);
      w.addBody(body);
      return body;
    },
    attachBodyToObject: (object, body) => {
      if(!object || !body) return false;
      object.userData.logicPhysicsBody = body;
      body.logicObject = object;
      watchCollision(body);
      if(object.position && body.position) body.position.copy(vec3(object.position));
      return true;
    },
    removeBody: body => {
      const w = world();
      if(!w || !body) return false;
      w.removeBody(body);
      if(body.logicObject && body.logicObject.userData) delete body.logicObject.userData.logicPhysicsBody;
      return true;
    },
    setMass: (body, mass) => {
      if(!body) return false;
      body.mass = Number(mass) || 0;
      if(body.updateMassProperties) body.updateMassProperties();
      return true;
    },
    setVelocity: (body, velocity) => {
      const v = vec3(velocity);
      if(!body || !body.velocity || !v) return false;
      body.velocity.copy(v);
      return true;
    },
    setBodyType: (body, type) => {
      const CANNON = CANNONRef();
      if(!body || !CANNON) return false;
      const key = String(type || 'dynamic').toLowerCase();
      body.type = key === 'static' ? CANNON.Body.STATIC : (key === 'kinematic' ? CANNON.Body.KINEMATIC : CANNON.Body.DYNAMIC);
      if(body.updateMassProperties) body.updateMassProperties();
      if(body.wakeUp) body.wakeUp();
      return true;
    },
    applyForce: (body, force, point) => {
      const f = vec3(force);
      const p = vec3(point || [0,0,0]);
      if(!body || !f || !p || !body.applyForce) return false;
      body.applyForce(f, p);
      return true;
    },
    applyImpulse: (body, impulse, point) => {
      const f = vec3(impulse);
      const p = vec3(point || [0,0,0]);
      if(!body || !f || !p || !body.applyImpulse) return false;
      body.applyImpulse(f, p);
      return true;
    },
    applyTorque: (body, torque) => {
      const t = vec3(torque);
      if(!body || !body.torque || !t) return false;
      body.torque.vadd(t, body.torque);
      if(body.wakeUp) body.wakeUp();
      return true;
    },
    setEnabled: (body, enabled) => {
      if(!body) return false;
      body.collisionResponse = enabled !== false;
      if(enabled !== false && body.wakeUp) body.wakeUp();
      return true;
    },
    setGravity: gravity => {
      const w = world();
      const g = vec3(gravity);
      if(!w || !w.gravity || !g) return false;
      w.gravity.copy(g);
      return true;
    },
    syncObjectFromBody: (object, body) => {
      if(!object || !body) return false;
      if(body.position && object.position) object.position.set(body.position.x, body.position.y, body.position.z);
      if(body.quaternion && object.quaternion) object.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
      return true;
    },
  });
}

function createMaterialService(THREE){
  const textureLoader = THREE && THREE.TextureLoader ? new THREE.TextureLoader() : null;
  function materialsOf(target){
    const out = [];
    const pushMat = mat => {
      if(Array.isArray(mat)) mat.forEach(pushMat);
      else if(mat) out.push(mat);
    };
    if(!target) return out;
    if(target.isMaterial) out.push(target);
    else if(target.material) pushMat(target.material);
    else if(target.traverse) target.traverse(child => { if(child && child.material) pushMat(child.material); });
    return out;
  }
  function color(value){
    try { return new THREE.Color(value || '#ffffff'); }
    catch(err){ return new THREE.Color('#ffffff'); }
  }
  function clamp01(value, fallback){
    const n = Number(value);
    if(!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
  }
  function textureSource(ref){
    if(!ref) return '';
    if(typeof ref === 'string') return ref;
    if(typeof ref === 'object') return ref.url || ref.src || ref.path || ref.href || '';
    return '';
  }
  function textureSourceAsync(ref){
    if(ref && typeof ref === 'object' && ref.dbKey && window.LK_ASSET_BLOBS && window.LK_ASSET_BLOBS.getUrl){
      return window.LK_ASSET_BLOBS.getUrl(ref.dbKey).catch(() => '');
    }
    return Promise.resolve(textureSource(ref));
  }
  return Object.freeze({
    setColor: (target, value) => {
      materialsOf(target).forEach(mat => { if(mat.color) mat.color.copy(color(value)); mat.needsUpdate = true; });
      return true;
    },
    setOpacity: (target, value) => {
      const opacity = Math.max(0, Math.min(1, Number(value)));
      materialsOf(target).forEach(mat => {
        mat.opacity = Number.isFinite(opacity) ? opacity : 1;
        mat.transparent = mat.opacity < 1;
        mat.needsUpdate = true;
      });
      return true;
    },
    cloneMaterial: target => {
      const first = materialsOf(target)[0];
      return first && first.clone ? first.clone() : null;
    },
    setMaterial: (object, material) => {
      if(!object || !material) return false;
      if(object.material) object.material = material;
      else if(object.traverse) object.traverse(child => { if(child && child.material) child.material = material; });
      return true;
    },
    setWireframe: (target, enabled) => {
      materialsOf(target).forEach(mat => {
        mat.wireframe = enabled === true;
        mat.needsUpdate = true;
      });
      return true;
    },
    setMetalnessRoughness: (target, metalness, roughness) => {
      const m = clamp01(metalness, null);
      const r = clamp01(roughness, null);
      materialsOf(target).forEach(mat => {
        if(m != null && Object.prototype.hasOwnProperty.call(mat, 'metalness')) mat.metalness = m;
        if(r != null && Object.prototype.hasOwnProperty.call(mat, 'roughness')) mat.roughness = r;
        mat.needsUpdate = true;
      });
      return true;
    },
    loadTexture: ref => {
      const src = textureSource(ref);
      if(!textureLoader) return null;
      if(!src && ref && typeof ref === 'object' && ref.dbKey){
        const texture = new THREE.Texture();
        texture.userData = Object.assign({}, texture.userData || {}, {logicTextureRef:ref, logicTexturePending:true});
        textureSourceAsync(ref).then(url => {
          if(!url) return;
          textureLoader.load(url, loaded => {
            texture.image = loaded.image;
            texture.userData.logicTexturePending = false;
            if(THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;
          });
        });
        return texture;
      }
      if(!src) return null;
      const texture = textureLoader.load(src);
      texture.userData = Object.assign({}, texture.userData || {}, {logicTextureRef:ref});
      if(THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    },
    setTextureMap: (target, texture) => {
      materialsOf(target).forEach(mat => {
        mat.map = texture || null;
        mat.needsUpdate = true;
      });
      return true;
    },
    setShadowFlags: (object, cast, receive) => {
      if(!object) return false;
      const apply = child => {
        if(!child || !child.isMesh) return;
        child.castShadow = cast === true;
        child.receiveShadow = receive === true;
      };
      if(object.traverse) object.traverse(apply);
      else apply(object);
      return true;
    },
  });
}

function createRaycastService(GAME, THREE){
  const raycaster = THREE ? new THREE.Raycaster() : null;
  function camera(){ return GAME && GAME.core && GAME.core.camera || null; }
  function canvas(){ return GAME && GAME.core && GAME.core.canvas || document.querySelector('canvas'); }
  function vec(value, fallback){
    if(value && value.isVector3) return value.clone();
    if(Array.isArray(value)) return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    if(value && typeof value === 'object') return new THREE.Vector3(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0);
    return fallback ? fallback.clone() : new THREE.Vector3();
  }
  function objectList(targets){
    if(Array.isArray(targets)) return targets.filter(Boolean);
    if(targets && targets.isObject3D) return [targets];
    const reg = GAME && GAME.world && Array.isArray(GAME.world.registry) ? GAME.world.registry : [];
    return reg.filter(o => o && o.visible !== false && !(o.userData && o.userData.editorOnly));
  }
  function result(hit){
    if(!hit) return {hit:false, object:null, body:null, point:[0,0,0], distance:0};
    const p = hit.point || new THREE.Vector3();
    const obj = hit.object || null;
    return {
      hit:true,
      object:obj,
      body:obj && obj.userData && obj.userData.logicPhysicsBody || null,
      point:[p.x, p.y, p.z],
      distance:Number(hit.distance) || 0,
    };
  }
  return Object.freeze({
    screenToWorldRay: (x, y, cam) => {
      if(!THREE || !raycaster) return null;
      const targetCamera = cam || camera();
      if(!targetCamera) return null;
      const targetCanvas = canvas();
      const rect = targetCanvas && targetCanvas.getBoundingClientRect ? targetCanvas.getBoundingClientRect() : {left:0, top:0, width:innerWidth, height:innerHeight};
      const rawX = Number(x) || 0;
      const rawY = Number(y) || 0;
      const px = rawX > 1 || rawX < -1 ? ((rawX - rect.left) / Math.max(1, rect.width)) * 2 - 1 : rawX;
      const py = rawY > 1 || rawY < -1 ? -(((rawY - rect.top) / Math.max(1, rect.height)) * 2 - 1) : rawY;
      raycaster.setFromCamera(new THREE.Vector2(px, py), targetCamera);
      return {
        ray:raycaster.ray.clone(),
        origin:[raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z],
        direction:[raycaster.ray.direction.x, raycaster.ray.direction.y, raycaster.ray.direction.z],
      };
    },
    raycast: (rayInput, maxDistance, targets) => {
      if(!THREE || !raycaster || !rayInput) return result(null);
      const origin = rayInput.ray ? rayInput.ray.origin.clone() : vec(rayInput.origin || rayInput.from);
      const direction = rayInput.ray ? rayInput.ray.direction.clone() : vec(rayInput.direction || rayInput.to, new THREE.Vector3(0,0,-1));
      if(direction.lengthSq() <= 0) direction.set(0,0,-1);
      direction.normalize();
      raycaster.set(origin, direction);
      raycaster.far = Math.max(.01, Number(maxDistance) || 1000);
      const hits = raycaster.intersectObjects(objectList(targets), true);
      return result(hits[0] || null);
    },
  });
}

function createCameraService(GAME, THREE){
  function gameCamera(){ return GAME && GAME.core && GAME.core.camera || null; }
  function vec(value){
    if(value && value.isVector3) return value.clone();
    if(Array.isArray(value)) return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0);
    return new THREE.Vector3(Number(value && value.x) || 0, Number(value && value.y) || 0, Number(value && value.z) || 0);
  }
  function cameraFrom(target){
    if(!target) return null;
    if(target.isCamera) return target;
    if(target.userData && target.userData.sceneCamera) return target.userData.sceneCamera;
    return null;
  }
  function cameraHolder(target){
    if(!target) return null;
    if(target.userData && target.userData.editorType === 'camera') return target;
    return GAME && GAME.world && Array.isArray(GAME.world.registry)
      ? GAME.world.registry.find(item => item && item.userData && item.userData.sceneCamera === target) || null
      : null;
  }
  return Object.freeze({
    setActiveCamera: target => {
      const src = cameraFrom(target);
      const dst = gameCamera();
      if(!src || !dst) return false;
      const holder = cameraHolder(target);
      if(GAME && GAME.state) GAME.state.runtimeActiveSceneCameraId = holder && holder.userData.editorId || null;
      dst.position.copy(src.getWorldPosition ? src.getWorldPosition(new THREE.Vector3()) : src.position);
      if(src.getWorldQuaternion) dst.quaternion.copy(src.getWorldQuaternion(new THREE.Quaternion()));
      else if(src.quaternion) dst.quaternion.copy(src.quaternion);
      if(src.fov && dst.fov){ dst.fov = src.fov; dst.updateProjectionMatrix(); }
      return true;
    },
    moveTo: position => {
      const cam = gameCamera();
      if(!cam) return false;
      cam.position.copy(vec(position));
      return true;
    },
    lookAt: target => {
      const cam = gameCamera();
      if(!cam) return false;
      cam.lookAt(vec(target));
      return true;
    },
  });
}

function createCinemaService(){
  return Object.freeze({
    playTimeline:(studio, startTime) => {
      const detail = {studio:studio || '', time:Math.max(0, Number(startTime) || 0), fullscreen:true, playerIndex:0};
      window.dispatchEvent(new CustomEvent('lotking:cinemastart', {detail}));
      return true;
    },
    stopTimeline:() => { window.dispatchEvent(new CustomEvent('lotking:cinemastop')); return true; },
  });
}

function createAudioService(){
  let counter = 0;
  const active = new Map();
  function sourceOf(ref){
    if(!ref) return '';
    if(typeof ref === 'string') return ref;
    return ref.url || ref.src || ref.path || '';
  }
  function sourceOfAsync(ref){
    if(ref && typeof ref === 'object' && ref.dbKey && window.LK_ASSET_BLOBS && window.LK_ASSET_BLOBS.getUrl){
      return window.LK_ASSET_BLOBS.getUrl(ref.dbKey).catch(() => '');
    }
    return Promise.resolve(sourceOf(ref));
  }
  return Object.freeze({
    playSound: (ref, volume, loop) => {
      const src = sourceOf(ref);
      if(typeof Audio === 'undefined') return null;
      if(!src && !(ref && typeof ref === 'object' && ref.dbKey)) return null;
      const audio = new Audio(src || '');
      audio.volume = Math.max(0, Math.min(1, Number(volume == null ? 1 : volume)));
      audio.loop = loop === true;
      const handle = {id:'logic_sound_' + Date.now().toString(36) + '_' + (counter++), audio};
      active.set(handle.id, handle);
      audio.addEventListener('ended', () => active.delete(handle.id), {once:true});
      const start = url => {
        if(url && audio.src !== url) audio.src = url;
        const playing = audio.play();
        if(playing && playing.catch) playing.catch(() => {});
      };
      if(src) start(src);
      else sourceOfAsync(ref).then(url => { if(url && active.has(handle.id)) start(url); });
      return handle;
    },
    stopSound: handle => {
      const item = typeof handle === 'string' ? active.get(handle) : handle;
      if(!item || !item.audio) return false;
      item.audio.pause();
      try { item.audio.currentTime = 0; } catch(err){}
      active.delete(item.id);
      return true;
    },
  });
}

function createAnimationService(STORE){
  function animationNode(target){
    if(!target) return null;
    if(target.userData && target.userData.logicAnimationMixer) return target;
    let found = null;
    if(target.traverse) target.traverse(child => {
      if(!found && child.userData && child.userData.logicAnimationMixer) found = child;
    });
    return found;
  }
  return Object.freeze({
    play: (target, clip, loop, speed) => STORE && STORE.playLogicElementAnimation
      ? STORE.playLogicElementAnimation(target, clip, {loop:loop || 'repeat', speed:Number.isFinite(Number(speed)) ? Number(speed) : 1})
      : null,
    stop: target => !!(STORE && STORE.stopLogicElementAnimation && STORE.stopLogicElementAnimation(target)),
    setSpeed: (target, speed) => !!(STORE && STORE.setLogicElementAnimationSpeed && STORE.setLogicElementAnimationSpeed(target, speed)),
    clips: target => {
      const node = animationNode(target);
      return node && node.userData && Array.isArray(node.userData.logicAnimationClipNames)
        ? node.userData.logicAnimationClipNames.slice()
        : [];
    },
  });
}

function createSoccerService(GAME){
  function ballSystem(){
    return GAME && GAME.systems && GAME.systems.soccerBall
      || (window.LK_RUNTIME_SOCCER_BALL ? window.LK_RUNTIME_SOCCER_BALL.install(GAME) : null);
  }
  function penaltySystem(){
    return GAME && GAME.systems && GAME.systems.penaltyFlow
      || (window.LK_RUNTIME_PENALTY_FLOW ? window.LK_RUNTIME_PENALTY_FLOW.install(GAME) : null);
  }
  return Object.freeze({
    spawnBall:options => { const system = ballSystem(); return system ? system.spawn(options) : null; },
    despawnBall:id => { const system = ballSystem(); return !!(system && system.despawn(id)); },
    resetBall:id => { const system = ballSystem(); return !!(system && system.reset(id)); },
    kickBall:(id, options) => { const system = ballSystem(); return !!(system && system.kick(id, options)); },
    ballState:id => { const system = ballSystem(); return system ? system.state(id) : null; },
    registerGoal:options => { const system = ballSystem(); return system ? system.registerGoal(options) : null; },
    configurePenalty:options => { const system = penaltySystem(); return system ? system.configure(options) : null; },
    startPenalty:() => { const system = penaltySystem(); return system ? system.start() : null; },
    beginPenaltyKick:() => { const system = penaltySystem(); return system ? system.beginKick() : null; },
    resetPenalty:() => { const system = penaltySystem(); return system ? system.reset(true) : null; },
    penaltyState:() => { const system = penaltySystem(); return system ? system.state() : null; },
  });
}

function createContext(opts){
  opts = opts || {};
  const GAME = opts.GAME || window.LOT_KING;
  const STORE = opts.STORE || window.LK_STORE;
  const THREERef = opts.THREE || window.THREE;
  const inputService = createInputService(GAME);
  const pawnService = createPawnService(GAME, opts.STORE || null, opts.owner || null, opts.graph || null, inputService);
  return {
    GAME,
    STORE,
    THREE: THREERef,
    owner: opts.owner || null,
    scope: opts.scope || 'element',
    graphName: opts.graphName || 'Logic',
    debug: createDebugService(GAME, opts.graphName || 'Logic', THREERef),
    services: {
      objects: createObjectService(GAME, opts.owner || null),
      transforms: THREERef ? createTransformService(THREERef, STORE) : null,
      input: inputService,
      pawns: pawnService,
      physics: createPhysicsService(GAME, THREERef),
      materials: THREERef ? createMaterialService(THREERef) : null,
      raycasts: THREERef ? createRaycastService(GAME, THREERef) : null,
      cameras: THREERef ? createCameraService(GAME, THREERef) : null,
      cinema: createCinemaService(),
      audio: createAudioService(),
      animations: createAnimationService(STORE),
      soccer: createSoccerService(GAME),
    },
  };
}

window.LK_LOGIC_SERVICES = Object.freeze({createContext, createDebugService, createObjectService, createTransformService, createInputService, createPawnService, createPhysicsService, createMaterialService, createRaycastService, createCameraService, createCinemaService, createAudioService, createAnimationService, createSoccerService});
})();
