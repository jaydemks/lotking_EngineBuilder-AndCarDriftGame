/* =========================================================
   LOT KING - Logic Element MVP node definitions
   ========================================================= */
(function(){
'use strict';

const execIn = {name:'exec', kind:'exec', direction:'input'};
const thenOut = {name:'then', kind:'exec', direction:'output'};
const completedOut = {name:'completed', kind:'exec', direction:'output'};
const dataIn = (name, type, value, extra) => Object.assign({name, kind:'data', direction:'input', type:type || 'any', defaultValue:value}, extra || {});
const dataOut = (name, type) => ({name, kind:'data', direction:'output', type:type || 'any'});
const execInput = name => ({name, kind:'exec', direction:'input'});
const execOutput = name => ({name, kind:'exec', direction:'output'});
const number = value => Number(value) || 0;
const clamp01 = value => Math.max(0, Math.min(1, number(value)));
function vec3(value, fallback){
  const base = Array.isArray(fallback) ? fallback : [0,0,0];
  if(value && value.isVector3) return [value.x, value.y, value.z];
  if(Array.isArray(value)) return [number(value[0]), number(value[1]), number(value[2])];
  if(value && typeof value === 'object') return [number(value.x), number(value.y), number(value.z)];
  return [number(base[0]), number(base[1]), number(base[2])];
}
function vectorLength(v){
  const p = vec3(v);
  return Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
}

function registerAll(registry){
  registry.register({type:'event.onStart', title:'On Start', category:'Events', description:'Runs once when this graph starts.', event:'OnStart', outputs:[thenOut]});
  registry.register({type:'event.onUpdate', title:'On Update', category:'Events', description:'Runs every gameplay frame.', event:'OnUpdate', outputs:[thenOut, dataOut('deltaTime', 'number')]});
  registry.register({type:'event.onFixedUpdate', title:'On Fixed Update', category:'Events', description:'Runs on fixed simulation ticks.', event:'OnFixedUpdate', outputs:[thenOut, dataOut('fixedDeltaTime', 'number')]});
  registry.register({type:'event.onDestroy', title:'On Destroy', category:'Events', description:'Runs once before this graph runtime is disposed.', event:'OnDestroy', outputs:[thenOut]});
  registry.register({type:'event.onKeyDown', title:'On Key Down', category:'Events', description:'Runs when a key is pressed.', event:'OnKeyDown', inputs:[dataIn('key', 'string', '')], outputs:[thenOut, dataOut('key', 'string')]});
  registry.register({type:'event.onKeyUp', title:'On Key Up', category:'Events', description:'Runs when a key is released.', event:'OnKeyUp', inputs:[dataIn('key', 'string', '')], outputs:[thenOut, dataOut('key', 'string')]});
  registry.register({type:'event.onPointerDown', title:'On Pointer Down', category:'Events', description:'Runs when pointer is pressed.', event:'OnPointerDown', inputs:[dataIn('button', 'string', 'any')], outputs:[thenOut, dataOut('x', 'number'), dataOut('y', 'number'), dataOut('button', 'number')]});
  registry.register({type:'event.onPointerMove', title:'On Pointer Move', category:'Events', description:'Runs when pointer moves.', event:'OnPointerMove', outputs:[thenOut, dataOut('x', 'number'), dataOut('y', 'number'), dataOut('deltaX', 'number'), dataOut('deltaY', 'number')]});
  registry.register({type:'event.onPointerUp', title:'On Pointer Up', category:'Events', description:'Runs when pointer is released.', event:'OnPointerUp', inputs:[dataIn('button', 'string', 'any')], outputs:[thenOut, dataOut('x', 'number'), dataOut('y', 'number'), dataOut('button', 'number')]});
  registry.register({type:'event.onGamepadButton', title:'On Gamepad Button', category:'Events', description:'Runs when a gamepad button is newly pressed.', event:'OnGamepadButton', inputs:[dataIn('gamepadIndex', 'number', 0), dataIn('button', 'number', 0)], outputs:[thenOut, dataOut('gamepadIndex', 'number'), dataOut('button', 'number')]});
  registry.register({type:'event.onWindowResize', title:'On Window Resize', category:'Events', description:'Runs after the game viewport changes size.', event:'OnWindowResize', outputs:[thenOut, dataOut('width', 'number'), dataOut('height', 'number')]});
  registry.register({type:'event.tickEvery', title:'Tick Every', category:'Events', description:'Runs at a safe configurable interval.', event:'OnUpdate', inputs:[dataIn('seconds', 'number', .5)], outputs:[thenOut]});
  registry.register({type:'event.onCollisionBegin', title:'On Collision Begin', category:'Events', description:'Runs when a logic physics body begins a collision.', event:'OnCollisionBegin', outputs:[thenOut, dataOut('body', 'physicsBody'), dataOut('otherBody', 'physicsBody'), dataOut('object', 'object3d'), dataOut('otherObject', 'object3d'), dataOut('contact', 'any')]});
  registry.register({type:'event.onPawnDriftStart', title:'On Pawn Drift Start', category:'Pawn Events', description:'Runs when this Pawn starts drifting.', event:'OnPawnDriftStart', outputs:[thenOut, dataOut('pawn', 'vehiclePawn')]});
  registry.register({type:'event.onPawnDriftEnd', title:'On Pawn Drift End', category:'Pawn Events', description:'Runs when this Pawn stops drifting.', event:'OnPawnDriftEnd', outputs:[thenOut, dataOut('pawn', 'vehiclePawn')]});
  registry.register({type:'event.onPawnGearChanged', title:'On Pawn Gear Changed', category:'Pawn Events', description:'Runs when this Pawn changes gear.', event:'OnPawnGearChanged', outputs:[thenOut, dataOut('pawn', 'vehiclePawn'), dataOut('gear', 'number'), dataOut('previousGear', 'number')]});
  registry.register({type:'event.onPawnReset', title:'On Pawn Reset', category:'Pawn Events', description:'Runs after this Pawn resets to spawn.', event:'OnPawnReset', outputs:[thenOut, dataOut('pawn', 'vehiclePawn')]});
  registry.register({type:'event.onPawnPossessed', title:'On Pawn Possessed', category:'Pawn Events', description:'Runs when a Player ID possesses this Pawn.', event:'OnPawnPossessed', outputs:[thenOut, dataOut('pawn', 'vehiclePawn'), dataOut('playerId', 'number')]});
  registry.register({type:'event.onPawnUnpossessed', title:'On Pawn Unpossessed', category:'Pawn Events', description:'Runs when this Pawn loses its Player ID.', event:'OnPawnUnpossessed', outputs:[thenOut, dataOut('pawn', 'vehiclePawn'), dataOut('playerId', 'number')]});
  registry.register({type:'event.onPawnDeviceChanged', title:'On Pawn Device Changed', category:'Pawn Events', description:'Runs when the possessed Player profile changes input device.', event:'OnPawnDeviceChanged', outputs:[thenOut, dataOut('pawn', 'vehiclePawn'), dataOut('playerId', 'number'), dataOut('device', 'string'), dataOut('previousDevice', 'string')]});
  registry.register({type:'event.custom', title:'Custom Event', category:'Events', description:'Entry point for named runtime events.', event:'Custom', inputs:[dataIn('eventName', 'string', '')], outputs:[thenOut, dataOut('payload', 'any')]});

  registry.register({
    type:'input.isKeyPressed', title:'Is Key Pressed', category:'Events', description:'Checks if a key is currently held.',
    inputs:[dataIn('key', 'string', 'w')], outputs:[dataOut('value', 'boolean')],
    evaluate(api){ return !!(api.services.input && api.services.input.isKeyPressed(api.getInput('key'))); },
  });

  registry.register({
    type:'input.playerDrive', title:'Get Player Drive Input', category:'Input', description:'Reads the resolved local Player 1–4 profile. Player ID -1/None returns neutral input.',
    inputs:[dataIn('playerId', 'number', 1)],
    outputs:[dataOut('throttle', 'number'), dataOut('brake', 'number'), dataOut('steer', 'number'), dataOut('handbrake', 'boolean'), dataOut('device', 'string')],
    evaluate(api, pin){
      const drive = api.services.input ? api.services.input.playerDrive(api.getInput('playerId')) : {};
      if(pin === 'brake') return Number(drive.brake) || 0;
      if(pin === 'steer') return Number(drive.steer) || 0;
      if(pin === 'handbrake') return drive.handbrake === true;
      if(pin === 'device') return drive.device || '';
      return Number(drive.throttle) || 0;
    },
  });

  registry.register({
    type:'pawn.getSelf', title:'Get Self Vehicle Pawn', category:'Vehicle Pawn', description:'Returns the Vehicle Pawn owned by this Logic Element.',
    outputs:[dataOut('pawn', 'vehiclePawn')],
    evaluate(api){ return api.services.pawns ? api.services.pawns.self() : null; },
  });

  registry.register({
    type:'pawn.getPlayerPawn', title:'Get Player Pawn', category:'Vehicle Pawn', description:'Returns the Pawn currently possessed by Player 1–4.',
    inputs:[dataIn('playerId', 'number', 1)], outputs:[dataOut('pawn', 'vehiclePawn')],
    evaluate(api){ return api.services.pawns ? api.services.pawns.getByPlayerId(api.getInput('playerId')) : null; },
  });

  registry.register({
    type:'pawn.getOwner', title:'Get Pawn Owner', category:'Pawn', description:'Returns the scene Object3D owned by any Vehicle, Character or Soccer Pawn.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)], outputs:[dataOut('object', 'object3d')],
    evaluate(api){ return api.services.pawns ? api.services.pawns.owner(api.getInput('pawn')) : null; },
  });

  registry.register({
    type:'pawn.getInput', title:'Get Pawn Input', category:'Vehicle Pawn', description:'Reads the possessed Pawn input. Unpossessed/None Pawns always return neutral controls.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('throttle', 'number'), dataOut('brake', 'number'), dataOut('steer', 'number'), dataOut('handbrake', 'boolean'), dataOut('device', 'string')],
    evaluate(api, pin){
      const drive = api.services.pawns ? api.services.pawns.input(api.getInput('pawn')) : {};
      if(pin === 'handbrake') return drive.handbrake === true;
      if(pin === 'device') return drive.device || '';
      return Number(drive[pin]) || 0;
    },
  });

  registry.register({
    type:'pawn.possess', title:'Possess Pawn', category:'Vehicle Pawn', description:'Assigns a local Player ID to a Pawn. Existing ownership is preserved unless Force is enabled.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('playerId', 'number', 1), dataIn('force', 'boolean', false)],
    outputs:[completedOut, dataOut('success', 'boolean')],
    run(api){
      api.node.data.__success = !!(api.services.pawns && api.services.pawns.possess(api.getInput('pawn'), api.getInput('playerId'), api.getInput('force')));
      return {exec:'completed'};
    },
    evaluate(api, pin){ return pin === 'success' ? api.node.data.__success === true : null; },
  });

  registry.register({
    type:'pawn.possessFirstAvailable', title:'Possess First Available Player', category:'Vehicle Pawn', description:'Assigns the first free Player ID from P1 to P4, or returns None when every slot is occupied.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null)], outputs:[completedOut, dataOut('playerId', 'number'), dataOut('success', 'boolean')],
    run(api){ const id = api.services.pawns && api.services.pawns.possessFirstAvailable(api.getInput('pawn')); api.node.data.__playerId = id; return {exec:'completed'}; },
    evaluate(api, pin){ const id = api.node.data.__playerId; return pin === 'success' ? id != null : id; },
  });

  registry.register({
    type:'pawn.unpossess', title:'Unpossess Pawn', category:'Vehicle Pawn', description:'Releases the Pawn local Player slot and neutralizes automatic input.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null)], outputs:[completedOut],
    run(api){ if(api.services.pawns) api.services.pawns.unpossess(api.getInput('pawn')); return {exec:'completed'}; },
  });

  registry.register({
    type:'pawn.setDriveInput', title:'Set Pawn Drive Input', category:'Vehicle Pawn', description:'Writes throttle, brake, steering and handbrake to one Pawn without shared global state.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('throttle', 'number', 0), dataIn('brake', 'number', 0), dataIn('steer', 'number', 0), dataIn('handbrake', 'boolean', false)],
    outputs:[completedOut],
    run(api){
      if(api.services.pawns) api.services.pawns.setControl(api.getInput('pawn'), {
        throttle:clamp01(api.getInput('throttle')), brake:clamp01(api.getInput('brake')),
        steer:Math.max(-1, Math.min(1, number(api.getInput('steer')))), handbrake:api.getInput('handbrake') === true,
      });
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'pawn.reset', title:'Reset Vehicle Pawn', category:'Vehicle Pawn', description:'Resets only the selected Pawn to its authoring spawn transform.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null)], outputs:[completedOut],
    run(api){ if(api.services.pawns) api.services.pawns.reset(api.getInput('pawn')); return {exec:'completed'}; },
  });

  registry.register({
    type:'pawn.setEnabled', title:'Set Pawn Enabled', category:'Vehicle Pawn', description:'Enables or sleeps only the selected Vehicle Pawn.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('enabled', 'boolean', true)], outputs:[completedOut],
    run(api){ if(api.services.pawns) api.services.pawns.setEnabled(api.getInput('pawn'), api.getInput('enabled')); return {exec:'completed'}; },
  });

  registry.register({
    type:'pawn.setTuning', title:'Set Vehicle Tuning', category:'Vehicle Pawn', description:'Updates safe runtime tuning values on one Pawn instance.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('maxSpeed', 'number', 38), dataIn('acceleration', 'number', 16), dataIn('brake', 'number', 24), dataIn('steer', 'number', 2.2), dataIn('grip', 'number', .84)],
    outputs:[completedOut],
    run(api){
      if(api.services.pawns) api.services.pawns.setTuning(api.getInput('pawn'), {
        maxSpeed:Math.max(.1, number(api.getInput('maxSpeed'))), acceleration:Math.max(.1, number(api.getInput('acceleration'))),
        brake:Math.max(.1, number(api.getInput('brake'))), steer:Math.max(.05, number(api.getInput('steer'))),
        grip:Math.max(.1, Math.min(1, number(api.getInput('grip')))),
      });
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'pawn.setSuspension', title:'Set Vehicle Suspension', category:'Vehicle Pawn', description:'Updates per-wheel RaycastVehicle suspension without rebuilding other Pawns.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('stiffness', 'number', 32), dataIn('restLength', 'number', .34), dataIn('travel', 'number', .28), dataIn('compression', 'number', 4.4), dataIn('relaxation', 'number', 2.6), dataIn('rollInfluence', 'number', .22)],
    outputs:[completedOut],
    run(api){
      if(api.services.pawns) api.services.pawns.setSuspension(api.getInput('pawn'), {
        stiffness:Math.max(.1, number(api.getInput('stiffness'))), restLength:Math.max(.01, number(api.getInput('restLength'))),
        travel:Math.max(.01, number(api.getInput('travel'))), compression:Math.max(.01, number(api.getInput('compression'))),
        relaxation:Math.max(.01, number(api.getInput('relaxation'))), rollInfluence:Math.max(0, Math.min(1, number(api.getInput('rollInfluence')))),
      });
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'pawn.setLights', title:'Set Vehicle Lights', category:'Vehicle Pawn', description:'Enables or disables the selected Pawn light collection. Brake/reverse/turn conditions remain automatic.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('enabled', 'boolean', true)], outputs:[completedOut],
    run(api){ if(api.services.pawns) api.services.pawns.setLights(api.getInput('pawn'), {enabled:api.getInput('enabled') !== false}); return {exec:'completed'}; },
  });

  registry.register({
    type:'pawn.setEffects', title:'Set Vehicle Effects', category:'Vehicle Pawn', description:'Controls per-Pawn neon, exhaust smoke and skid marks.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('neon', 'boolean', true), dataIn('exhaust', 'boolean', true), dataIn('skids', 'boolean', true), dataIn('smokeIntensity', 'number', 1)], outputs:[completedOut],
    run(api){
      if(api.services.pawns) api.services.pawns.setEffects(api.getInput('pawn'), {
        neonEnabled:api.getInput('neon') !== false, exhaustEnabled:api.getInput('exhaust') !== false,
        skidEnabled:api.getInput('skids') !== false, smokeIntensity:Math.max(0, number(api.getInput('smokeIntensity'))),
      });
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'pawn.setCamera', title:'Set Vehicle Camera', category:'Vehicle Pawn', description:'Configures and optionally possesses the game camera for one Pawn.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('mode', 'string', 'arcade'), dataIn('possess', 'boolean', true), dataIn('distance', 'number', 9), dataIn('height', 'number', 3.1), dataIn('lag', 'number', 5.8), dataIn('fov', 'number', 70)], outputs:[completedOut],
    run(api){
      const pawn = api.getInput('pawn');
      if(api.services.pawns){
        api.services.pawns.setCamera(pawn, {mode:String(api.getInput('mode') || 'arcade'), distance:Math.max(1, number(api.getInput('distance'))), height:Math.max(.2, number(api.getInput('height'))), lag:Math.max(.1, number(api.getInput('lag'))), fov:Math.max(20, Math.min(130, number(api.getInput('fov'))))});
        api.services.pawns.possessCamera(pawn, api.getInput('possess') !== false);
      }
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'pawn.setEngineAudio', title:'Set Pawn Engine Audio', category:'Vehicle Pawn', description:'Controls the independent engine synth for one Vehicle Pawn.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('enabled', 'boolean', true), dataIn('volume', 'number', .28), dataIn('pitch', 'number', 1)], outputs:[completedOut],
    run(api){
      if(api.services.pawns) api.services.pawns.setEngineAudio(api.getInput('pawn'), {
        enabled:api.getInput('enabled') !== false,
        volume:Math.max(0, Math.min(2, number(api.getInput('volume')))),
        pitch:Math.max(.2, Math.min(4, number(api.getInput('pitch')))),
      });
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'pawn.setDataWidgets', title:'Set Pawn Data Widgets', category:'Vehicle Pawn', description:'Shows or hides the authored 3D metric widgets for one Pawn.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('visible', 'boolean', true)], outputs:[completedOut],
    run(api){ if(api.services.pawns) api.services.pawns.setDataWidgets(api.getInput('pawn'), {enabled:api.getInput('visible') !== false}); return {exec:'completed'}; },
  });

  registry.register({
    type:'pawn.getState', title:'Get Vehicle State', category:'Vehicle Pawn', description:'Reads runtime metrics from the selected Pawn instance.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('speed', 'number'), dataOut('speedKmh', 'number'), dataOut('rpm', 'number'), dataOut('gear', 'number'), dataOut('reverse', 'boolean'), dataOut('drifting', 'boolean'), dataOut('groundedWheels', 'number'), dataOut('physicsMode', 'string')],
    evaluate(api, pin){
      const state = api.services.pawns ? api.services.pawns.state(api.getInput('pawn')) : null;
      if(!state) return pin === 'reverse' || pin === 'drifting' ? false : 0;
      if(pin === 'drifting') return state.drift === true;
      if(pin === 'reverse') return state.reverse === true;
      if(pin === 'physicsMode') return state.physicsMode || 'none';
      return Number(state[pin]) || 0;
    },
  });

  registry.register({
    type:'debug.print', title:'Print Debug', category:'Debug', description:'Writes a message to the runtime debug log.',
    inputs:[execIn, dataIn('message', 'string', 'Hello Logic'), dataIn('duration', 'number', 3)], outputs:[completedOut],
    run(api){ api.debug.log(api.getInput('message'), {duration:Math.max(.25, Number(api.getInput('duration')) || 3) * 1000}); return {exec:'completed'}; },
  });

  registry.register({
    type:'flow.sequence', title:'Sequence', category:'Flow', description:'Runs multiple exec outputs in order.',
    inputs:[execIn], outputs:[
      {name:'then0', kind:'exec', direction:'output'},
      {name:'then1', kind:'exec', direction:'output'},
      {name:'then2', kind:'exec', direction:'output'},
    ],
    run(){ return {exec:['then0', 'then1', 'then2']}; },
  });

  registry.register({
    type:'flow.branch', title:'Branch', category:'Flow', description:'Routes execution by boolean condition.',
    inputs:[execIn, dataIn('condition', 'boolean', false)], outputs:[
      {name:'true', kind:'exec', direction:'output'},
      {name:'false', kind:'exec', direction:'output'},
    ],
    run(api){ return {exec:api.getInput('condition') ? 'true' : 'false'}; },
  });

  registry.register({
    type:'flow.delay', title:'Delay', category:'Flow', description:'Continues after a delay in seconds.',
    inputs:[execIn, dataIn('seconds', 'number', 1)], outputs:[completedOut],
    run(api){ api.delay(api.getInput('seconds'), 'completed'); return null; },
  });

  registry.register({
    type:'flow.callSubgraph', title:'Call Subgraph', category:'Flow', description:'Runs a reusable subgraph function by id or name.',
    inputs:[execIn, dataIn('subgraph', 'string', ''), dataIn('payload', 'any', null)], outputs:[completedOut, dataOut('result', 'any')],
    run(api){
      const ref = String(api.getInput('subgraph') || '').trim();
      const wanted = ref.toLowerCase();
      const sg = (api.graph.subgraphs || []).find(item => item && (String(item.id).toLowerCase() === wanted || String(item.name).toLowerCase() === wanted));
      let payload = api.getInput('payload');
      if(sg && Array.isArray(sg.inputs) && sg.inputs.length){
        payload = Object.assign({}, payload && typeof payload === 'object' ? payload : {});
        sg.inputs.forEach(port => {
          if(port && port.name) payload[port.name] = api.getInput(port.name);
        });
      }
      api.node.data.__result = api.callSubgraph(ref, payload);
      return {exec:'completed'};
    },
    evaluate(api, pinName){
      const result = api.node.data.__result;
      if(pinName === 'result') return result;
      if(result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, pinName)) return result[pinName];
      const ref = String(api.getInput('subgraph') || '').trim().toLowerCase();
      const sg = (api.graph.subgraphs || []).find(item => item && (String(item.id).toLowerCase() === ref || String(item.name).toLowerCase() === ref));
      const outputs = sg && Array.isArray(sg.outputs) ? sg.outputs.filter(Boolean) : [];
      if(outputs.length === 1 && outputs[0].name === pinName) return result;
      return undefined;
    },
  });

  registry.register({
    type:'function.input', title:'Function Input', category:'Functions', description:'Reads a named value from the current Function payload.',
    inputs:[dataIn('name', 'string', '')], outputs:[dataOut('value', 'any')],
    evaluate(api){
      const name = String(api.getInput('name') || '').trim();
      const payload = api.payload && api.payload.payload;
      if(!name) return payload;
      if(payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, name)) return payload[name];
      return undefined;
    },
  });

  registry.register({
    type:'function.return', title:'Function Return', category:'Functions', description:'Sets the current Function return value.',
    inputs:[execIn, dataIn('name', 'string', ''), dataIn('value', 'any', null)], outputs:[completedOut, dataOut('value', 'any')],
    run(api){
      const name = String(api.getInput('name') || '').trim();
      const value = api.getInput('value');
      if(name){
        const current = api.getVariable('returnValue');
        const next = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
        next[name] = value;
        api.setVariable('returnValue', next);
      } else {
        api.setVariable('returnValue', value);
      }
      return {exec:'completed'};
    },
    evaluate(api){ return api.getInput('value'); },
  });

  registry.register({
    type:'flow.switchString', title:'Switch String', category:'Flow', description:'Routes execution by string cases.',
    inputs:[execIn, dataIn('value', 'string', ''), dataIn('case0', 'string', 'A'), dataIn('case1', 'string', 'B'), dataIn('case2', 'string', 'C')],
    outputs:[execOutput('case0'), execOutput('case1'), execOutput('case2'), execOutput('default')],
    run(api){
      const value = String(api.getInput('value') == null ? '' : api.getInput('value'));
      for(let i = 0; i < 3; i++) if(value === String(api.getInput('case' + i) == null ? '' : api.getInput('case' + i))) return {exec:'case' + i};
      return {exec:'default'};
    },
  });

  registry.register({
    type:'flow.switchNumberRange', title:'Switch Number Range', category:'Flow', description:'Routes execution by numeric ranges.',
    inputs:[execIn, dataIn('value', 'number', 0), dataIn('min0', 'number', 0), dataIn('max0', 'number', 10), dataIn('min1', 'number', 10), dataIn('max1', 'number', 20), dataIn('min2', 'number', 20), dataIn('max2', 'number', 30)],
    outputs:[execOutput('range0'), execOutput('range1'), execOutput('range2'), execOutput('default')],
    run(api){
      const value = number(api.getInput('value'));
      for(let i = 0; i < 3; i++){
        const min = number(api.getInput('min' + i));
        const max = number(api.getInput('max' + i));
        if(value >= Math.min(min, max) && value <= Math.max(min, max)) return {exec:'range' + i};
      }
      return {exec:'default'};
    },
  });

  registry.register({
    type:'flow.forLoop', title:'For Loop', category:'Flow', description:'Runs loopBody from start to end with a safety cap.',
    inputs:[execIn, dataIn('start', 'number', 0), dataIn('end', 'number', 3), dataIn('step', 'number', 1)], outputs:[execOutput('loopBody'), dataOut('index', 'number'), completedOut],
    run(api){
      const start = number(api.getInput('start'));
      const end = number(api.getInput('end'));
      let step = number(api.getInput('step'));
      if(step === 0) step = start <= end ? 1 : -1;
      let iterations = 0;
      for(let index = start; step > 0 ? index <= end : index >= end; index += step){
        if(++iterations > 1000){ api.debug.warn('For Loop stopped after 1000 iterations'); break; }
        api.node.data.__index = index;
        api.continue('loopBody');
      }
      return {exec:'completed'};
    },
    evaluate(api){ return number(api.node.data.__index); },
  });

  registry.register({
    type:'flow.forEachObject', title:'For Each Object', category:'Flow', description:'Iterates over an array.',
    inputs:[execIn, dataIn('array', 'array', [])], outputs:[execOutput('loopBody'), dataOut('item', 'any'), dataOut('index', 'number'), completedOut],
    run(api){
      const array = Array.isArray(api.getInput('array')) ? api.getInput('array') : [];
      array.slice(0, 1000).forEach((item, index) => {
        api.node.data.__item = item;
        api.node.data.__index = index;
        api.continue('loopBody');
      });
      return {exec:'completed'};
    },
    evaluate(api, pin){ return pin === 'index' ? number(api.node.data.__index) : api.node.data.__item; },
  });

  registry.register({
    type:'flow.repeatN', title:'Repeat N', category:'Flow', description:'Runs loopBody N times.',
    inputs:[execIn, dataIn('count', 'number', 1)], outputs:[execOutput('loopBody'), dataOut('index', 'number'), completedOut],
    run(api){
      const count = Math.max(0, Math.min(1000, Math.floor(number(api.getInput('count')))));
      for(let index = 0; index < count; index++){
        api.node.data.__index = index;
        api.continue('loopBody');
      }
      return {exec:'completed'};
    },
    evaluate(api){ return number(api.node.data.__index); },
  });

  registry.register({
    type:'flow.doOnce', title:'Do Once', category:'Flow', description:'Lets execution pass once until reset.',
    inputs:[execIn, execInput('reset')], outputs:[completedOut],
    run(api){
      if(api.inputPin === 'reset'){ api.node.data.__done = false; return null; }
      if(api.node.data.__done) return null;
      api.node.data.__done = true;
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'flow.gate', title:'Gate', category:'Flow', description:'Opens or closes an execution gate.',
    inputs:[execIn, execInput('open'), execInput('close'), execInput('toggle'), dataIn('startOpen', 'boolean', true)], outputs:[execOutput('out')],
    run(api){
      if(api.node.data.__open == null) api.node.data.__open = api.getInput('startOpen') !== false;
      if(api.inputPin === 'open'){ api.node.data.__open = true; return null; }
      if(api.inputPin === 'close'){ api.node.data.__open = false; return null; }
      if(api.inputPin === 'toggle'){ api.node.data.__open = !api.node.data.__open; return null; }
      return api.node.data.__open ? {exec:'out'} : null;
    },
  });

  registry.register({
    type:'flow.debounce', title:'Debounce', category:'Flow', description:'Ignores execution pulses that are too close together.',
    inputs:[execIn, dataIn('seconds', 'number', .25)], outputs:[execOutput('out')],
    run(api){
      const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const wait = Math.max(0, number(api.getInput('seconds'))) * 1000;
      if(api.node.data.__last != null && now - api.node.data.__last < wait) return null;
      api.node.data.__last = now;
      return {exec:'out'};
    },
  });

  registry.register({
    type:'variable.get', title:'Get Variable', category:'Variables', description:'Reads a graph variable.',
    inputs:[dataIn('name', 'string', '')], outputs:[dataOut('value', 'any')],
    evaluate(api){ return api.getVariable(api.getInput('name')); },
  });

  registry.register({
    type:'variable.set', title:'Set Variable', category:'Variables', description:'Writes a graph variable.',
    inputs:[execIn, dataIn('name', 'string', ''), dataIn('value', 'any', null)], outputs:[completedOut, dataOut('value', 'any')],
    run(api){ const value = api.getInput('value'); api.setVariable(api.getInput('name'), value); return {exec:'completed'}; },
    evaluate(api){ return api.getVariable(api.getInput('name')); },
  });

  registry.register({
    type:'variable.toggleBoolean', title:'Toggle Boolean', category:'Variables', description:'Toggles a boolean variable or input value.',
    inputs:[execIn, dataIn('name', 'string', ''), dataIn('value', 'boolean', false)], outputs:[completedOut, dataOut('value', 'boolean')],
    run(api){
      const name = String(api.getInput('name') || '');
      const next = !(name ? api.getVariable(name) === true : api.getInput('value') === true);
      if(name) api.setVariable(name, next);
      api.node.data.__value = next;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__value === true; },
  });

  registry.register({
    type:'variable.incrementNumber', title:'Increment Number', category:'Variables', description:'Adds an amount to a number variable.',
    inputs:[execIn, dataIn('name', 'string', ''), dataIn('amount', 'number', 1)], outputs:[completedOut, dataOut('value', 'number')],
    run(api){
      const name = String(api.getInput('name') || '');
      const next = number(api.getVariable(name)) + number(api.getInput('amount'));
      if(name) api.setVariable(name, next);
      api.node.data.__value = next;
      return {exec:'completed'};
    },
    evaluate(api){ return number(api.node.data.__value); },
  });

  registry.register({
    type:'string.append', title:'Append String', category:'Variables', description:'Concatenates two values as text.',
    inputs:[dataIn('a', 'string', ''), dataIn('b', 'string', '')], outputs:[dataOut('value', 'string')],
    evaluate(api){ return String(api.getInput('a') == null ? '' : api.getInput('a')) + String(api.getInput('b') == null ? '' : api.getInput('b')); },
  });

  registry.register({
    type:'object.make', title:'Make Object', category:'Variables', description:'Creates a simple object from key/value pairs.',
    inputs:[dataIn('key0', 'string', 'a'), dataIn('value0', 'any', null), dataIn('key1', 'string', 'b'), dataIn('value1', 'any', null), dataIn('key2', 'string', ''), dataIn('value2', 'any', null)],
    outputs:[dataOut('object', 'object')],
    evaluate(api){
      const out = {};
      for(let i = 0; i < 3; i++){
        const key = String(api.getInput('key' + i) || '');
        if(key) out[key] = api.getInput('value' + i);
      }
      return out;
    },
  });

  registry.register({
    type:'object.getField', title:'Get Object Field', category:'Variables', description:'Reads a field from an object.',
    inputs:[dataIn('object', 'object', null), dataIn('field', 'string', '')], outputs:[dataOut('value', 'any')],
    evaluate(api){ const obj = api.getInput('object'); const key = String(api.getInput('field') || ''); return obj && typeof obj === 'object' ? obj[key] : undefined; },
  });

  registry.register({
    type:'object.setField', title:'Set Object Field', category:'Variables', description:'Writes a field on an object.',
    inputs:[execIn, dataIn('object', 'object', null), dataIn('field', 'string', ''), dataIn('value', 'any', null)], outputs:[completedOut, dataOut('object', 'object')],
    run(api){
      const source = api.getInput('object');
      const obj = source && typeof source === 'object' && !Array.isArray(source) ? Object.assign({}, source) : {};
      const key = String(api.getInput('field') || '');
      if(key) obj[key] = api.getInput('value');
      api.node.data.__object = obj;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__object || {}; },
  });

  registry.register({
    type:'array.make', title:'Make Array', category:'Variables', description:'Creates an array from up to five values.',
    inputs:[dataIn('value0', 'any', null), dataIn('value1', 'any', null), dataIn('value2', 'any', null), dataIn('value3', 'any', null), dataIn('value4', 'any', null)],
    outputs:[dataOut('array', 'array')],
    evaluate(api){ return [0,1,2,3,4].map(i => api.getInput('value' + i)).filter(value => value != null); },
  });

  registry.register({
    type:'array.get', title:'Array Get', category:'Variables', description:'Reads an array item by index.',
    inputs:[dataIn('array', 'array', []), dataIn('index', 'number', 0)], outputs:[dataOut('value', 'any')],
    evaluate(api){ const array = Array.isArray(api.getInput('array')) ? api.getInput('array') : []; return array[Math.floor(number(api.getInput('index')))]; },
  });

  registry.register({
    type:'array.push', title:'Array Push', category:'Variables', description:'Pushes a value into an array copy.',
    inputs:[execIn, dataIn('array', 'array', []), dataIn('value', 'any', null)], outputs:[completedOut, dataOut('array', 'array')],
    run(api){
      const array = Array.isArray(api.getInput('array')) ? api.getInput('array').slice() : [];
      array.push(api.getInput('value'));
      api.node.data.__array = array;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__array || []; },
  });

  registry.register({
    type:'array.length', title:'Array Length', category:'Variables', description:'Returns array length.',
    inputs:[dataIn('array', 'array', [])], outputs:[dataOut('value', 'number')],
    evaluate(api){ const array = Array.isArray(api.getInput('array')) ? api.getInput('array') : []; return array.length; },
  });

  registry.register({
    type:'math.add', title:'Add', category:'Math', description:'Adds two numbers.',
    inputs:[dataIn('a', 'number', 0), dataIn('b', 'number', 0)], outputs:[dataOut('value', 'number')],
    evaluate(api){ return (Number(api.getInput('a')) || 0) + (Number(api.getInput('b')) || 0); },
  });

  registry.register({
    type:'math.subtract', title:'Subtract', category:'Math', description:'Subtracts B from A.',
    inputs:[dataIn('a', 'number', 0), dataIn('b', 'number', 0)], outputs:[dataOut('value', 'number')],
    evaluate(api){ return number(api.getInput('a')) - number(api.getInput('b')); },
  });

  registry.register({
    type:'math.multiply', title:'Multiply', category:'Math', description:'Multiplies two numbers.',
    inputs:[dataIn('a', 'number', 0), dataIn('b', 'number', 0)], outputs:[dataOut('value', 'number')],
    evaluate(api){ return number(api.getInput('a')) * number(api.getInput('b')); },
  });

  registry.register({
    type:'math.divide', title:'Divide', category:'Math', description:'Divides A by B with zero protection.',
    inputs:[dataIn('a', 'number', 0), dataIn('b', 'number', 1)], outputs:[dataOut('value', 'number')],
    evaluate(api){ const b = number(api.getInput('b')); return b === 0 ? 0 : number(api.getInput('a')) / b; },
  });

  registry.register({
    type:'math.clamp', title:'Clamp', category:'Math', description:'Clamps a number between min and max.',
    inputs:[dataIn('value', 'number', 0), dataIn('min', 'number', 0), dataIn('max', 'number', 1)], outputs:[dataOut('value', 'number')],
    evaluate(api){
      const min = number(api.getInput('min'));
      const max = number(api.getInput('max'));
      return Math.max(Math.min(min, max), Math.min(Math.max(min, max), number(api.getInput('value'))));
    },
  });

  registry.register({
    type:'math.lerp', title:'Lerp', category:'Math', description:'Interpolates from A to B.',
    inputs:[dataIn('a', 'number', 0), dataIn('b', 'number', 1), dataIn('t', 'number', 0)], outputs:[dataOut('value', 'number')],
    evaluate(api){ const t = clamp01(api.getInput('t')); return number(api.getInput('a')) + (number(api.getInput('b')) - number(api.getInput('a'))) * t; },
  });

  registry.register({
    type:'math.randomNumber', title:'Random Number', category:'Math', description:'Returns a random number between min and max.',
    inputs:[dataIn('min', 'number', 0), dataIn('max', 'number', 1)], outputs:[dataOut('value', 'number')],
    evaluate(api){ const min = number(api.getInput('min')); const max = number(api.getInput('max')); return min + Math.random() * (max - min); },
  });

  registry.register({
    type:'math.compareNumber', title:'Compare Number', category:'Math', description:'Compares two numbers.',
    inputs:[dataIn('a', 'number', 0), dataIn('operator', 'string', '>'), dataIn('b', 'number', 0)], outputs:[dataOut('value', 'boolean')],
    evaluate(api){
      const a = Number(api.getInput('a')) || 0;
      const b = Number(api.getInput('b')) || 0;
      const op = String(api.getInput('operator') || '>');
      if(op === '>=') return a >= b;
      if(op === '<=') return a <= b;
      if(op === '<') return a < b;
      if(op === '==') return a === b;
      if(op === '!=') return a !== b;
      return a > b;
    },
  });

  registry.register({
    type:'vector.make3', title:'Make Vector3', category:'Math', description:'Builds a Vector3 array.',
    inputs:[dataIn('x', 'number', 0), dataIn('y', 'number', 0), dataIn('z', 'number', 0)], outputs:[dataOut('vector', 'vector3')],
    evaluate(api){ return [number(api.getInput('x')), number(api.getInput('y')), number(api.getInput('z'))]; },
  });

  registry.register({
    type:'vector.break3', title:'Break Vector3', category:'Math', description:'Splits a Vector3 into components.',
    inputs:[dataIn('vector', 'vector3', [0,0,0])], outputs:[dataOut('x', 'number'), dataOut('y', 'number'), dataOut('z', 'number')],
    evaluate(api, pin){ const v = vec3(api.getInput('vector')); return pin === 'y' ? v[1] : (pin === 'z' ? v[2] : v[0]); },
  });

  registry.register({
    type:'vector.add', title:'Vector Add', category:'Math', description:'Adds two Vector3 values.',
    inputs:[dataIn('a', 'vector3', [0,0,0]), dataIn('b', 'vector3', [0,0,0])], outputs:[dataOut('vector', 'vector3')],
    evaluate(api){ const a = vec3(api.getInput('a')); const b = vec3(api.getInput('b')); return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; },
  });

  registry.register({
    type:'vector.subtract', title:'Vector Subtract', category:'Math', description:'Subtracts Vector3 B from A.',
    inputs:[dataIn('a', 'vector3', [0,0,0]), dataIn('b', 'vector3', [0,0,0])], outputs:[dataOut('vector', 'vector3')],
    evaluate(api){ const a = vec3(api.getInput('a')); const b = vec3(api.getInput('b')); return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; },
  });

  registry.register({
    type:'vector.scale', title:'Vector Scale', category:'Math', description:'Multiplies a Vector3 by a scalar.',
    inputs:[dataIn('vector', 'vector3', [0,0,0]), dataIn('scalar', 'number', 1)], outputs:[dataOut('vector', 'vector3')],
    evaluate(api){ const v = vec3(api.getInput('vector')); const s = number(api.getInput('scalar')); return [v[0]*s, v[1]*s, v[2]*s]; },
  });

  registry.register({
    type:'vector.length', title:'Vector Length', category:'Math', description:'Returns Vector3 length.',
    inputs:[dataIn('vector', 'vector3', [0,0,0])], outputs:[dataOut('value', 'number')],
    evaluate(api){ return vectorLength(api.getInput('vector')); },
  });

  registry.register({
    type:'vector.normalize', title:'Normalize Vector', category:'Math', description:'Normalizes a Vector3.',
    inputs:[dataIn('vector', 'vector3', [0,0,0])], outputs:[dataOut('vector', 'vector3')],
    evaluate(api){ const v = vec3(api.getInput('vector')); const len = vectorLength(v); return len <= 0 ? [0,0,0] : [v[0]/len, v[1]/len, v[2]/len]; },
  });

  registry.register({
    type:'vector.distance', title:'Distance', category:'Math', description:'Returns distance between two Vector3 values.',
    inputs:[dataIn('a', 'vector3', [0,0,0]), dataIn('b', 'vector3', [0,0,0])], outputs:[dataOut('value', 'number')],
    evaluate(api){ const a = vec3(api.getInput('a')); const b = vec3(api.getInput('b')); return vectorLength([a[0]-b[0], a[1]-b[1], a[2]-b[2]]); },
  });

  registry.register({
    type:'scene.getOwner', title:'Get Owner', category:'Scene', description:'Returns the scene Logic Element object that owns this graph.',
    outputs:[dataOut('object', 'object3d'), dataOut('found', 'boolean')],
    evaluate(api, pin){ const owner = api.services.objects.owner(); return pin === 'found' ? !!owner : owner; },
  });

  registry.register({
    type:'scene.getElement', title:'Get Element', category:'Scene', description:'Returns an internal Logic Element child by name or id.',
    inputs:[dataIn('name', 'string', 'Root')], outputs:[dataOut('object', 'object3d'), dataOut('found', 'boolean')],
    evaluate(api, pin){ const obj = api.services.objects.childByName(api.getInput('name')) || api.services.objects.byId(api.getInput('name')); return pin === 'found' ? !!obj : obj; },
  });

  registry.register({
    type:'scene.findObjectByName', title:'Find Object By Name', category:'Scene', description:'Finds an editor object by display name.',
    inputs:[dataIn('name', 'string', '')], outputs:[dataOut('object', 'object3d'), dataOut('found', 'boolean')],
    evaluate(api, pin){ const obj = api.services.objects.byName(api.getInput('name')); return pin === 'found' ? !!obj : obj; },
  });

  registry.register({
    type:'scene.getElementByType', title:'Get Element By Type', category:'Scene', description:'Returns the first scene element matching a simple type such as Camera, Cinema Studio, Light, Mesh or Player Car.',
    inputs:[dataIn('type', 'string', 'Camera')], outputs:[dataOut('object', 'object3d'), dataOut('found', 'boolean')],
    evaluate(api, pin){ const obj = api.services.objects.byType(api.getInput('type')); return pin === 'found' ? !!obj : obj; },
  });

  registry.register({
    type:'scene.getAllElementsByType', title:'Get All Elements By Type', category:'Scene', description:'Returns every scene element matching the requested type.',
    inputs:[dataIn('type', 'string', 'Camera')], outputs:[dataOut('objects', 'any'), dataOut('count', 'number')],
    evaluate(api, pin){ const objects = api.services.objects.allByType(api.getInput('type')); return pin === 'count' ? objects.length : objects; },
  });

  registry.register({
    type:'scene.getObjectById', title:'Get Object By ID', category:'Scene', description:'Finds an Object3D by editor or logic id.',
    inputs:[dataIn('id', 'string', '')], outputs:[dataOut('object', 'object3d'), dataOut('found', 'boolean')],
    evaluate(api, pin){ const obj = api.services.objects.byId(api.getInput('id')); return pin === 'found' ? !!obj : obj; },
  });

  registry.register({
    type:'scene.createEmpty', title:'Create Empty', category:'Scene', description:'Creates a runtime empty Object3D.',
    inputs:[execIn, dataIn('name', 'string', 'Empty')], outputs:[completedOut, dataOut('object', 'object3d')],
    run(api){
      const obj = api.services.objects.createEmpty({name:api.getInput('name')});
      api.node.data.__object = obj || null;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__object || null; },
  });

  registry.register({
    type:'scene.createPrimitive', title:'Create Primitive Mesh', category:'Scene', description:'Creates a runtime primitive mesh.',
    inputs:[execIn, dataIn('primitive', 'string', 'box'), dataIn('name', 'string', 'Primitive'), dataIn('size', 'vector3', [1,1,1]), dataIn('color', 'string', '#7dd3fc')],
    outputs:[completedOut, dataOut('object', 'object3d')],
    run(api){
      const obj = api.services.objects.createPrimitive({
        primitive:api.getInput('primitive'),
        name:api.getInput('name'),
        size:api.getInput('size'),
        color:api.getInput('color'),
      });
      api.node.data.__object = obj || null;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__object || null; },
  });

  registry.register({
    type:'scene.setParent', title:'Set Parent', category:'Scene', description:'Parents an Object3D under another Object3D.',
    inputs:[execIn, dataIn('child', 'object3d', null), dataIn('parent', 'object3d', null), dataIn('keepWorld', 'boolean', true)], outputs:[completedOut],
    run(api){ api.services.objects.setParent(api.getInput('child'), api.getInput('parent'), api.getInput('keepWorld')); return {exec:'completed'}; },
  });

  registry.register({
    type:'scene.destroyObject', title:'Destroy Object', category:'Scene', description:'Removes an Object3D from the scene.',
    inputs:[execIn, dataIn('object', 'object3d', null)], outputs:[completedOut],
    run(api){ api.services.objects.destroy(api.getInput('object')); return {exec:'completed'}; },
  });

  registry.register({
    type:'scene.getPosition', title:'Get Position', category:'Scene', description:'Reads an Object3D position.',
    inputs:[dataIn('object', 'object3d', null)], outputs:[dataOut('position', 'vector3')],
    evaluate(api){ return api.services.transforms ? api.services.transforms.getPosition(api.getInput('object')) : [0,0,0]; },
  });

  registry.register({
    type:'scene.setPosition', title:'Set Position', category:'Scene', description:'Sets an Object3D position.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('position', 'vector3', [0,0,0])], outputs:[completedOut],
    run(api){ if(api.services.transforms) api.services.transforms.setPosition(api.getInput('object'), api.getInput('position')); return {exec:'completed'}; },
  });

  registry.register({
    type:'scene.translateObject', title:'Translate Object', category:'Scene', description:'Moves an Object3D by a Vector3 delta.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('delta', 'vector3', [0,0,0])], outputs:[completedOut],
    run(api){ if(api.services.transforms) api.services.transforms.translate(api.getInput('object'), api.getInput('delta')); return {exec:'completed'}; },
  });

  registry.register({
    type:'scene.getRotation', title:'Get Rotation', category:'Scene', description:'Reads an Object3D rotation in degrees.',
    inputs:[dataIn('object', 'object3d', null)], outputs:[dataOut('rotation', 'vector3')],
    evaluate(api){ return api.services.transforms ? api.services.transforms.getRotation(api.getInput('object')) : [0,0,0]; },
  });

  registry.register({
    type:'scene.setRotation', title:'Set Rotation', category:'Scene', description:'Sets an Object3D rotation in degrees.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('rotation', 'vector3', [0,0,0])], outputs:[completedOut],
    run(api){ if(api.services.transforms) api.services.transforms.setRotation(api.getInput('object'), api.getInput('rotation')); return {exec:'completed'}; },
  });

  registry.register({
    type:'scene.rotateObject', title:'Rotate Object', category:'Scene', description:'Rotates an Object3D by a degree delta.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('delta', 'vector3', [0,0,0])], outputs:[completedOut],
    run(api){ if(api.services.transforms) api.services.transforms.rotate(api.getInput('object'), api.getInput('delta')); return {exec:'completed'}; },
  });

  registry.register({
    type:'scene.getScale', title:'Get Scale', category:'Scene', description:'Reads an Object3D scale.',
    inputs:[dataIn('object', 'object3d', null)], outputs:[dataOut('scale', 'vector3')],
    evaluate(api){ return api.services.transforms ? api.services.transforms.getScale(api.getInput('object')) : [1,1,1]; },
  });

  registry.register({
    type:'scene.setScale', title:'Set Scale', category:'Scene', description:'Sets an Object3D scale.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('scale', 'vector3', [1,1,1])], outputs:[completedOut],
    run(api){ if(api.services.transforms) api.services.transforms.setScale(api.getInput('object'), api.getInput('scale')); return {exec:'completed'}; },
  });

  registry.register({
    type:'scene.setVisible', title:'Set Visible', category:'Scene', description:'Shows or hides an Object3D.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('visible', 'boolean', true)], outputs:[completedOut],
    run(api){ if(api.services.transforms) api.services.transforms.setVisible(api.getInput('object'), api.getInput('visible')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.createBody', title:'Create Physics Body', category:'Physics', description:'Creates a cannon physics body.',
    inputs:[execIn, dataIn('shape', 'string', 'box'), dataIn('mass', 'number', 1), dataIn('position', 'vector3', [0,0,0]), dataIn('size', 'vector3', [1,1,1])],
    outputs:[completedOut, dataOut('body', 'physicsBody')],
    run(api){
      const body = api.services.physics && api.services.physics.createBody({
        shape:api.getInput('shape'),
        mass:api.getInput('mass'),
        position:api.getInput('position'),
        size:api.getInput('size'),
      });
      api.node.data.__body = body || null;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__body || null; },
  });

  registry.register({
    type:'physics.attachBodyToObject', title:'Attach Body To Object', category:'Physics', description:'Associates a physics body with an Object3D.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('body', 'physicsBody', null)], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.attachBodyToObject(api.getInput('object'), api.getInput('body')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.removeBody', title:'Remove Physics Body', category:'Physics', description:'Removes a physics body from the world.',
    inputs:[execIn, dataIn('body', 'physicsBody', null)], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.removeBody(api.getInput('body')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.setMass', title:'Set Mass', category:'Physics', description:'Changes body mass.',
    inputs:[execIn, dataIn('body', 'physicsBody', null), dataIn('mass', 'number', 1)], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.setMass(api.getInput('body'), api.getInput('mass')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.setBodyType', title:'Set Body Type', category:'Physics', description:'Sets body type: dynamic, static or kinematic.',
    inputs:[execIn, dataIn('body', 'physicsBody', null), dataIn('type', 'string', 'dynamic')], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.setBodyType(api.getInput('body'), api.getInput('type')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.setVelocity', title:'Set Velocity', category:'Physics', description:'Sets body linear velocity.',
    inputs:[execIn, dataIn('body', 'physicsBody', null), dataIn('velocity', 'vector3', [0,0,0])], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.setVelocity(api.getInput('body'), api.getInput('velocity')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.applyForce', title:'Apply Force', category:'Physics', description:'Applies a force to a body.',
    inputs:[execIn, dataIn('body', 'physicsBody', null), dataIn('force', 'vector3', [0,0,0]), dataIn('point', 'vector3', [0,0,0])], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.applyForce(api.getInput('body'), api.getInput('force'), api.getInput('point')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.applyImpulse', title:'Apply Impulse', category:'Physics', description:'Applies an impulse to a body.',
    inputs:[execIn, dataIn('body', 'physicsBody', null), dataIn('impulse', 'vector3', [0,0,0]), dataIn('point', 'vector3', [0,0,0])], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.applyImpulse(api.getInput('body'), api.getInput('impulse'), api.getInput('point')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.applyTorque', title:'Apply Torque', category:'Physics', description:'Adds torque to a physics body.',
    inputs:[execIn, dataIn('body', 'physicsBody', null), dataIn('torque', 'vector3', [0,0,0])], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.applyTorque(api.getInput('body'), api.getInput('torque')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.setEnabled', title:'Set Physics Enabled', category:'Physics', description:'Enables or disables body collision response.',
    inputs:[execIn, dataIn('body', 'physicsBody', null), dataIn('enabled', 'boolean', true)], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.setEnabled(api.getInput('body'), api.getInput('enabled')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.syncObjectFromBody', title:'Sync Object From Body', category:'Physics', description:'Copies body transform onto an Object3D.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('body', 'physicsBody', null)], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.syncObjectFromBody(api.getInput('object'), api.getInput('body')); return {exec:'completed'}; },
  });

  registry.register({
    type:'physics.setGravity', title:'Set Gravity', category:'Physics', description:'Sets physics world gravity.',
    inputs:[execIn, dataIn('gravity', 'vector3', [0,-9.82,0])], outputs:[completedOut],
    run(api){ if(api.services.physics) api.services.physics.setGravity(api.getInput('gravity')); return {exec:'completed'}; },
  });

  registry.register({
    type:'material.setColor', title:'Set Color', category:'Material', description:'Changes the target material color.',
    inputs:[execIn, dataIn('target', 'any', null), dataIn('color', 'string', '#ffd166')], outputs:[completedOut],
    run(api){ if(api.services.materials) api.services.materials.setColor(api.getInput('target'), api.getInput('color')); return {exec:'completed'}; },
  });

  registry.register({
    type:'material.setOpacity', title:'Set Opacity', category:'Material', description:'Changes the target material opacity.',
    inputs:[execIn, dataIn('target', 'any', null), dataIn('opacity', 'number', 1)], outputs:[completedOut],
    run(api){ if(api.services.materials) api.services.materials.setOpacity(api.getInput('target'), api.getInput('opacity')); return {exec:'completed'}; },
  });

  registry.register({
    type:'material.cloneMaterial', title:'Clone Material', category:'Material', description:'Clones the first material found on a target.',
    inputs:[dataIn('target', 'any', null)], outputs:[dataOut('material', 'material')],
    evaluate(api){ return api.services.materials ? api.services.materials.cloneMaterial(api.getInput('target')) : null; },
  });

  registry.register({
    type:'material.setMaterial', title:'Set Material', category:'Material', description:'Applies a material to an Object3D.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('material', 'material', null)], outputs:[completedOut],
    run(api){ if(api.services.materials) api.services.materials.setMaterial(api.getInput('object'), api.getInput('material')); return {exec:'completed'}; },
  });

  registry.register({
    type:'material.setWireframe', title:'Set Wireframe', category:'Material', description:'Toggles wireframe on target materials.',
    inputs:[execIn, dataIn('target', 'any', null), dataIn('enabled', 'boolean', false)], outputs:[completedOut],
    run(api){ if(api.services.materials) api.services.materials.setWireframe(api.getInput('target'), api.getInput('enabled')); return {exec:'completed'}; },
  });

  registry.register({
    type:'material.setMetalnessRoughness', title:'Set Metalness Roughness', category:'Material', description:'Sets PBR metalness and roughness on target materials.',
    inputs:[execIn, dataIn('target', 'any', null), dataIn('metalness', 'number', 0), dataIn('roughness', 'number', .55)], outputs:[completedOut],
    run(api){ if(api.services.materials) api.services.materials.setMetalnessRoughness(api.getInput('target'), api.getInput('metalness'), api.getInput('roughness')); return {exec:'completed'}; },
  });

  registry.register({
    type:'material.loadTexture', title:'Load Texture', category:'Material', description:'Loads a texture from a URL or asset path.',
    inputs:[execIn, dataIn('textureRef', 'assetRef', '', {assetKind:'texture'})], outputs:[completedOut, dataOut('texture', 'texture')],
    run(api){
      api.node.data.__texture = api.services.materials ? api.services.materials.loadTexture(api.getInput('textureRef')) : null;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__texture || null; },
  });

  registry.register({
    type:'material.setTextureMap', title:'Set Texture Map', category:'Material', description:'Applies or clears the color texture map on target materials.',
    inputs:[execIn, dataIn('target', 'any', null), dataIn('texture', 'texture', null)], outputs:[completedOut],
    run(api){ if(api.services.materials) api.services.materials.setTextureMap(api.getInput('target'), api.getInput('texture')); return {exec:'completed'}; },
  });

  registry.register({
    type:'material.setShadowFlags', title:'Set Shadow Flags', category:'Material', description:'Sets castShadow and receiveShadow on meshes.',
    inputs:[execIn, dataIn('object', 'object3d', null), dataIn('cast', 'boolean', true), dataIn('receive', 'boolean', true)], outputs:[completedOut],
    run(api){ if(api.services.materials) api.services.materials.setShadowFlags(api.getInput('object'), api.getInput('cast'), api.getInput('receive')); return {exec:'completed'}; },
  });

  registry.register({
    type:'raycast.screenToWorldRay', title:'Screen To World Ray', category:'Raycast', description:'Builds a world ray from screen or normalized coordinates.',
    inputs:[dataIn('x', 'number', 0), dataIn('y', 'number', 0), dataIn('camera', 'camera', null)],
    outputs:[dataOut('ray', 'ray'), dataOut('origin', 'vector3'), dataOut('direction', 'vector3')],
    evaluate(api, pin){
      const ray = api.services.raycasts ? api.services.raycasts.screenToWorldRay(api.getInput('x'), api.getInput('y'), api.getInput('camera')) : null;
      if(pin === 'origin') return ray && ray.origin || [0,0,0];
      if(pin === 'direction') return ray && ray.direction || [0,0,-1];
      return ray;
    },
  });

  registry.register({
    type:'raycast.physics', title:'Raycast Physics', category:'Raycast', description:'Raycasts against visible scene objects.',
    inputs:[execIn, dataIn('ray', 'ray', null), dataIn('maxDistance', 'number', 1000), dataIn('targets', 'any', null)],
    outputs:[completedOut, dataOut('hit', 'boolean'), dataOut('object', 'object3d'), dataOut('body', 'physicsBody'), dataOut('point', 'vector3'), dataOut('distance', 'number')],
    run(api){
      const res = api.services.raycasts ? api.services.raycasts.raycast(api.getInput('ray'), api.getInput('maxDistance'), api.getInput('targets')) : null;
      api.node.data.__raycast = res || null;
      return {exec:'completed'};
    },
    evaluate(api, pin){
      const res = api.node.data.__raycast || {};
      if(pin === 'hit') return !!res.hit;
      if(pin === 'object') return res.object || null;
      if(pin === 'body') return res.body || null;
      if(pin === 'point') return res.point || [0,0,0];
      if(pin === 'distance') return Number(res.distance) || 0;
      return res;
    },
  });

  registry.register({
    type:'camera.setActive', title:'Set Active Camera', category:'Camera', description:'Assigns a scene camera to the active Player 1 frame until another camera or timeline takes ownership.',
    inputs:[execIn, dataIn('camera', 'camera', null)], outputs:[completedOut],
    run(api){ if(api.services.cameras) api.services.cameras.setActiveCamera(api.getInput('camera')); return {exec:'completed'}; },
  });

  registry.register({
    type:'camera.moveTo', title:'Move Camera To', category:'Camera', description:'Moves the gameplay camera to a position.',
    inputs:[execIn, dataIn('position', 'vector3', [0,4,8])], outputs:[completedOut],
    run(api){ if(api.services.cameras) api.services.cameras.moveTo(api.getInput('position')); return {exec:'completed'}; },
  });

  registry.register({
    type:'camera.lookAt', title:'Look At', category:'Camera', description:'Rotates the gameplay camera toward a world position.',
    inputs:[execIn, dataIn('target', 'vector3', [0,0,0])], outputs:[completedOut],
    run(api){ if(api.services.cameras) api.services.cameras.lookAt(api.getInput('target')); return {exec:'completed'}; },
  });

  registry.register({
    type:'cinema.playTimeline', title:'Play Cinema Timeline', category:'Cinema', description:'Starts a Cinema Studio timeline immediately in the active Player 1/preview frame.',
    inputs:[execIn, dataIn('studio', 'string', ''), dataIn('startTime', 'number', 0)], outputs:[completedOut],
    run(api){ if(api.services.cinema) api.services.cinema.playTimeline(api.getInput('studio'), api.getInput('startTime')); return {exec:'completed'}; },
  });

  registry.register({
    type:'cinema.stopTimeline', title:'Stop Cinema Timeline', category:'Cinema', description:'Stops the active runtime Cinema Studio timeline.',
    inputs:[execIn], outputs:[completedOut],
    run(api){ if(api.services.cinema) api.services.cinema.stopTimeline(); return {exec:'completed'}; },
  });

  registry.register({
    type:'audio.playSound', title:'Play Sound', category:'Audio', description:'Plays an audio source and returns a sound handle.',
    inputs:[execIn, dataIn('soundRef', 'assetRef', '', {assetKind:'audio'}), dataIn('volume', 'number', 1), dataIn('loop', 'boolean', false)],
    outputs:[completedOut, dataOut('soundHandle', 'soundHandle')],
    run(api){
      const handle = api.services.audio ? api.services.audio.playSound(api.getInput('soundRef'), api.getInput('volume'), api.getInput('loop')) : null;
      api.node.data.__soundHandle = handle || null;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__soundHandle || null; },
  });

  registry.register({
    type:'audio.stopSound', title:'Stop Sound', category:'Audio', description:'Stops a sound handle created by Play Sound.',
    inputs:[execIn, dataIn('soundHandle', 'soundHandle', null)], outputs:[completedOut],
    run(api){ if(api.services.audio) api.services.audio.stopSound(api.getInput('soundHandle')); return {exec:'completed'}; },
  });

  registry.register({
    type:'animation.play', title:'Play Animation', category:'Animation', description:'Plays a named GLB animation clip on a Logic Element or internal element.',
    inputs:[execIn, dataIn('target', 'object3d', null), dataIn('clip', 'string', ''), dataIn('loop', 'string', 'repeat'), dataIn('speed', 'number', 1)],
    outputs:[completedOut],
    run(api){
      if(api.services.animations) api.services.animations.play(api.getInput('target'), api.getInput('clip'), api.getInput('loop'), api.getInput('speed'));
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'animation.stop', title:'Stop Animation', category:'Animation', description:'Stops all animation actions on the target.',
    inputs:[execIn, dataIn('target', 'object3d', null)], outputs:[completedOut],
    run(api){ if(api.services.animations) api.services.animations.stop(api.getInput('target')); return {exec:'completed'}; },
  });

  registry.register({
    type:'animation.setSpeed', title:'Set Animation Speed', category:'Animation', description:'Changes playback speed for the target animation mixer.',
    inputs:[execIn, dataIn('target', 'object3d', null), dataIn('speed', 'number', 1)], outputs:[completedOut],
    run(api){ if(api.services.animations) api.services.animations.setSpeed(api.getInput('target'), api.getInput('speed')); return {exec:'completed'}; },
  });

  registry.register({
    type:'animation.getClips', title:'Get Animation Clips', category:'Animation', description:'Returns the names of animation clips available on the target.',
    inputs:[dataIn('target', 'object3d', null)], outputs:[dataOut('clips', 'array')],
    evaluate(api){ return api.services.animations ? api.services.animations.clips(api.getInput('target')) : []; },
  });

  registry.register({
    type:'debug.drawLine', title:'Draw Debug Line', category:'Debug', description:'Draws a temporary debug line in the scene.',
    inputs:[execIn, dataIn('start', 'vector3', [0,0,0]), dataIn('end', 'vector3', [0,1,0]), dataIn('color', 'string', '#ffd166'), dataIn('duration', 'number', 1)],
    outputs:[completedOut],
    run(api){ if(api.debug && api.debug.drawLine) api.debug.drawLine(api.getInput('start'), api.getInput('end'), api.getInput('color'), api.getInput('duration')); return {exec:'completed'}; },
  });

  return registry;
}

function createRegistry(){
  const registry = registerAll(window.LK_LOGIC_REGISTRY.create());
  // External node packs (e.g. logic-nodes-soccer.js) push registration
  // functions into this global list so feature nodes live in their own file.
  const packs = window.LK_LOGIC_NODE_PACKS;
  if(Array.isArray(packs)) packs.forEach(pack => {
    try { if(typeof pack === 'function') pack(registry); } catch(err){ console.warn('LotKing Logic: node pack failed', err); }
  });
  return registry;
}

window.LK_LOGIC_NODES_MVP = Object.freeze({registerAll, createRegistry});
})();
