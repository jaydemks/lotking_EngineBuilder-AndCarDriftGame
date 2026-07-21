/* =========================================================
   LOT KING - Generic Character Pawn node pack
   ========================================================= */
(function(){
'use strict';

const execIn = {name:'exec', kind:'exec', direction:'input'};
const completedOut = {name:'completed', kind:'exec', direction:'output'};
const dataIn = (name, type, value) => ({name, kind:'data', direction:'input', type:type || 'any', defaultValue:value});
const dataOut = (name, type) => ({name, kind:'data', direction:'output', type:type || 'any'});
const number = value => Number(value) || 0;
const axis = value => Math.max(-1, Math.min(1, number(value)));
function pawn(api){
  const explicit = api.getInput('pawn');
  if(explicit && api.services.pawns && api.services.pawns.get) return api.services.pawns.get(explicit) || explicit;
  return explicit || (api.services.pawns && api.services.pawns.self());
}
function isCharacter(value){ return !!(value && value.pawnType === 'character'); }

function registerCharacterNodes(registry){
  registry.register({
    type:'character.getMoveInput', title:'Get Character Move Input', category:'Character Pawn',
    description:'Reads camera-relative movement, sprint and interaction input from the possessed Character Pawn.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('x', 'number'), dataOut('z', 'number'), dataOut('sprint', 'boolean'), dataOut('interact', 'boolean'), dataOut('device', 'string')],
    evaluate(api, pin){
      const target = pawn(api);
      const move = target && target.readPlayerDrive ? target.readPlayerDrive() : {x:0,z:0,sprint:false,action:false,device:null};
      if(pin === 'sprint') return move.sprint === true;
      if(pin === 'interact') return move.action === true;
      if(pin === 'device') return move.device || '';
      return number(move[pin]);
    },
  });
  registry.register({
    type:'character.setMoveInput', title:'Set Character Move Input', category:'Character Pawn',
    description:'Moves a generic Character Pawn. X is lateral, Z is forward/back and sprint selects the faster gait.',
    inputs:[execIn, dataIn('pawn','vehiclePawn',null), dataIn('x','number',0), dataIn('z','number',0), dataIn('sprint','boolean',false)], outputs:[completedOut],
    run(api){ const target = pawn(api); if(isCharacter(target)) target.setMoveInput({x:axis(api.getInput('x')), z:axis(api.getInput('z')), sprint:api.getInput('sprint') === true}); return {exec:'completed'}; },
  });
  registry.register({
    type:'character.jump', title:'Character Jump', category:'Character Pawn',
    description:'Queues a jump when grounded and plays the configured in-place jump animation.',
    inputs:[execIn, dataIn('pawn','vehiclePawn',null)], outputs:[completedOut, dataOut('jumped','boolean')],
    run(api){ const target = pawn(api); api.node.data.__jumped = isCharacter(target) && target.jump() === true; return {exec:'completed'}; },
    evaluate(api, pin){ return pin === 'jumped' ? api.node.data.__jumped === true : null; },
  });
  registry.register({
    type:'character.playAction', title:'Play Character Action', category:'Character Pawn',
    description:'Plays a configured one-shot such as Interact. Locomotion resumes automatically when the clip finishes.',
    inputs:[execIn, dataIn('pawn','vehiclePawn',null), dataIn('action','string','interact'), dataIn('speed','number',1)], outputs:[completedOut, dataOut('started','boolean')],
    run(api){ const target = pawn(api); api.node.data.__started = isCharacter(target) && target.playAction(api.getInput('action'), {speed:number(api.getInput('speed')) || 1}) === true; return {exec:'completed'}; },
    evaluate(api, pin){ return pin === 'started' ? api.node.data.__started === true : null; },
  });
  registry.register({
    type:'character.setPreset', title:'Set Character Preset', category:'Character Pawn',
    description:'Applies a movement baseline: normal, civil or police. Individual exposed values can still be tuned afterward.',
    inputs:[execIn, dataIn('pawn','vehiclePawn',null), dataIn('preset','string','normal')], outputs:[completedOut, dataOut('preset','string')],
    run(api){ const target = pawn(api); api.node.data.__preset = isCharacter(target) ? target.setPreset(api.getInput('preset')) : ''; return {exec:'completed'}; },
    evaluate(api){ return api.node.data.__preset || ''; },
  });
  registry.register({
    type:'character.getState', title:'Get Character State', category:'Character Pawn',
    description:'Reads speed and locomotion state from a generic Character Pawn.',
    inputs:[dataIn('pawn','vehiclePawn',null)], outputs:[dataOut('preset','string'),dataOut('speedKmh','number'),dataOut('moving','boolean'),dataOut('sprinting','boolean'),dataOut('grounded','boolean'),dataOut('airborne','boolean')],
    evaluate(api, pin){ const target=pawn(api), state=target && target.state || {}; if(pin==='preset') return target && target.characterPreset || ''; if(['moving','sprinting','grounded','airborne'].includes(pin)) return state[pin] === true; return number(state.speedKmh); },
  });
}

const packs = window.LK_LOGIC_NODE_PACKS || (window.LK_LOGIC_NODE_PACKS = []);
packs.push(registerCharacterNodes);
window.LK_LOGIC_NODES_CHARACTER = Object.freeze({register:registerCharacterNodes});
})();
