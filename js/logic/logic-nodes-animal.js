/* =========================================================
   LOT KING - Animal Pawn Logic Element nodes
   ========================================================= */
(function(){
'use strict';

const execIn={name:'exec',kind:'exec',direction:'input'};
const completedOut={name:'completed',kind:'exec',direction:'output'};
const thenOut={name:'then',kind:'exec',direction:'output'};
const dataIn=(name,type,value)=>({name,kind:'data',direction:'input',type:type||'any',defaultValue:value});
const dataOut=(name,type)=>({name,kind:'data',direction:'output',type:type||'any'});
const number=value=>Number(value)||0;
const axis=value=>Math.max(-1,Math.min(1,number(value)));
function resolvePawn(api){const explicit=api.getInput('pawn');if(explicit&&api.services.pawns&&api.services.pawns.get)return api.services.pawns.get(explicit)||explicit;return explicit||(api.services.pawns&&api.services.pawns.self());}
function resolveReference(api,pin){const value=api.getInput(pin);return value&&api.services.pawns&&api.services.pawns.get?api.services.pawns.get(value)||value:value;}
function isAnimal(value){return !!(value&&value.pawnType==='animal');}

function registerAnimalNodes(registry){
  registry.register({type:'event.onAnimalAction',title:'On Animal Action Started',category:'Animal Events',description:'Runs when an Animal Pawn begins pounce, voice, dig, fetch, rear or another configured action.',event:'OnAnimalActionStarted',outputs:[thenOut,dataOut('action','string'),dataOut('species','string'),dataOut('gait','string'),dataOut('pawn','vehiclePawn')]});
  registry.register({type:'event.onAnimalActionFinished',title:'On Animal Action Finished',category:'Animal Events',description:'Runs when the current Animal Pawn action animation finishes.',event:'OnAnimalActionFinished',outputs:[thenOut,dataOut('action','string'),dataOut('species','string'),dataOut('gait','string'),dataOut('pawn','vehiclePawn')]});
  registry.register({type:'event.onAnimalAbility',title:'On Animal Ability Started',category:'Animal Events',description:'Runs when physical climb, pounce, balance, dig or fall recovery starts.',event:'OnAnimalAbilityStarted',outputs:[thenOut,dataOut('ability','string'),dataOut('species','string'),dataOut('pawn','vehiclePawn')]});
  registry.register({type:'event.onAnimalAbilityFinished',title:'On Animal Ability Finished',category:'Animal Events',description:'Runs when an Animal Pawn physical ability ends.',event:'OnAnimalAbilityFinished',outputs:[thenOut,dataOut('ability','string'),dataOut('species','string'),dataOut('reason','string'),dataOut('pawn','vehiclePawn')]});
  registry.register({type:'event.onAnimalAlert',title:'On Dog Bark Alert',category:'Animal Events',description:'Runs after bark-alert scans nearby Pawns.',event:'OnAnimalAlert',outputs:[thenOut,dataOut('radius','number'),dataOut('targets','any'),dataOut('pawn','vehiclePawn')]});
  registry.register({type:'event.onAnimalMounted',title:'On Horse Mounted',category:'Animal Events',description:'Runs when a Pawn takes the horse seat.',event:'OnAnimalMounted',outputs:[thenOut,dataOut('rider','vehiclePawn'),dataOut('playerId','number'),dataOut('pawn','vehiclePawn')]});
  registry.register({type:'event.onAnimalDismounted',title:'On Horse Dismounted',category:'Animal Events',description:'Runs when the rider leaves the horse seat.',event:'OnAnimalDismounted',outputs:[thenOut,dataOut('rider','vehiclePawn'),dataOut('playerId','number'),dataOut('pawn','vehiclePawn')]});
  registry.register({
    type:'animal.getMoveInput',title:'Get Animal Move Input',category:'Animal Pawn',description:'Reads movement, sprint, crouch/stalk and action input from the possessed Animal Pawn.',
    inputs:[dataIn('pawn','vehiclePawn',null)],outputs:[dataOut('x','number'),dataOut('z','number'),dataOut('sprint','boolean'),dataOut('crouch','boolean'),dataOut('action','boolean'),dataOut('device','string')],
    evaluate(api,pin){const target=resolvePawn(api),move=target&&target.readPlayerDrive?target.readPlayerDrive():{};if(pin==='sprint'||pin==='crouch'||pin==='action')return (pin==='action'?move.action:move[pin])===true;if(pin==='device')return move.device||'';return number(move[pin]);},
  });
  registry.register({
    type:'animal.setMoveInput',title:'Set Animal Move Input',category:'Animal Pawn',description:'Moves an Animal Pawn. Crouch selects the low stalking gait; speed selects walk, trot and run/gallop.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('x','number',0),dataIn('z','number',0),dataIn('sprint','boolean',false),dataIn('crouch','boolean',false)],outputs:[completedOut],
    run(api){const target=resolvePawn(api);if(isAnimal(target))target.setMoveInput({x:axis(api.getInput('x')),z:axis(api.getInput('z')),sprint:api.getInput('sprint')===true,crouch:api.getInput('crouch')===true});return {exec:'completed'};},
  });
  registry.register({
    type:'animal.jump',title:'Animal Jump',category:'Animal Pawn',description:'Queues a jump when grounded. Physical height remains owned by Movement, not by GLB root motion.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null)],outputs:[completedOut,dataOut('jumped','boolean')],
    run(api){const target=resolvePawn(api);api.node.data.__jumped=isAnimal(target)&&target.jump()===true;return {exec:'completed'};},evaluate(api,pin){return pin==='jumped'?api.node.data.__jumped===true:null;},
  });
  registry.register({
    type:'animal.playAction',title:'Play Animal Action',category:'Animal Pawn',description:'Plays pounce, voice, dig, fetch, rear or any custom GLB action slot, then returns to locomotion.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('action','string','pounce'),dataIn('speed','number',1)],outputs:[completedOut,dataOut('started','boolean')],
    run(api){const target=resolvePawn(api);api.node.data.__started=isAnimal(target)&&target.playAction(api.getInput('action'),{speed:number(api.getInput('speed'))||1})===true;return {exec:'completed'};},evaluate(api,pin){return pin==='started'?api.node.data.__started===true:null;},
  });
  registry.register({
    type:'animal.pounce',title:'Cat Pounce',category:'Animal Pawn / Cat',description:'Queues a physical in-place-animation pounce. Movement and collision own translation; the clip never owns root motion.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('speed','number',7.8),dataIn('duration','number',.58)],outputs:[completedOut,dataOut('started','boolean')],
    run(api){const target=resolvePawn(api);api.node.data.__started=isAnimal(target)&&target.pounce({speed:number(api.getInput('speed')),duration:number(api.getInput('duration'))})===true;return {exec:'completed'};},evaluate(api,pin){return pin==='started'?api.node.data.__started===true:null;},
  });
  registry.register({
    type:'animal.catClimb',title:'Cat Climb / Mantle',category:'Animal Pawn / Cat',description:'Finds a solid collider ahead, climbs it vertically and mantles onto its top without GLB root motion.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('maxHeight','number',2.4),dataIn('reach','number',.48),dataIn('duration','number',0)],outputs:[completedOut,dataOut('started','boolean')],
    run(api){const target=resolvePawn(api),duration=number(api.getInput('duration'));api.node.data.__started=isAnimal(target)&&target.climb({maxHeight:number(api.getInput('maxHeight')),reach:number(api.getInput('reach')),duration:duration>0?duration:null})===true;return {exec:'completed'};},evaluate(api,pin){return pin==='started'?api.node.data.__started===true:null;},
  });
  registry.register({
    type:'animal.catBalance',title:'Cat Ledge Balance',category:'Animal Pawn / Cat',description:'Temporarily locks locomotion into the narrow ledge-balance state.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('duration','number',.8)],outputs:[completedOut,dataOut('started','boolean')],
    run(api){const target=resolvePawn(api);api.node.data.__started=isAnimal(target)&&target.balanceLedge(number(api.getInput('duration')))===true;return {exec:'completed'};},evaluate(api,pin){return pin==='started'?api.node.data.__started===true:null;},
  });
  registry.register({
    type:'animal.setStealth',title:'Set Cat Stealth',category:'Animal Pawn / Cat',description:'Enables low stalking posture and a configurable physical speed multiplier.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('enabled','boolean',true),dataIn('speedMultiplier','number',.42)],outputs:[completedOut,dataOut('active','boolean')],
    run(api){const target=resolvePawn(api);api.node.data.__active=isAnimal(target)&&target.setStealth(api.getInput('enabled')===true,number(api.getInput('speedMultiplier')))===true;return {exec:'completed'};},evaluate(api,pin){return pin==='active'?api.node.data.__active===true:null;},
  });
  registry.register({
    type:'animal.dogBarkAlert',title:'Dog Bark + Alert Scan',category:'Animal Pawn / Dog',description:'Plays the voice action, finds Pawns inside the alert radius and emits On Dog Bark Alert.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('radius','number',12)],outputs:[completedOut,dataOut('count','number'),dataOut('targets','any')],
    run(api){const target=resolvePawn(api),targets=isAnimal(target)?target.barkAlert(number(api.getInput('radius'))):[];api.node.data.__targets=targets;return {exec:'completed'};},evaluate(api,pin){const targets=api.node.data.__targets||[];return pin==='count'?targets.length:targets.slice();},
  });
  registry.register({
    type:'animal.dogDig',title:'Dog Dig',category:'Animal Pawn / Dog',description:'Locks movement for a configurable physical dig interaction while the action plays.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('duration','number',1.2)],outputs:[completedOut,dataOut('started','boolean')],
    run(api){const target=resolvePawn(api);api.node.data.__started=isAnimal(target)&&target.dig(number(api.getInput('duration')))===true;return {exec:'completed'};},evaluate(api,pin){return pin==='started'?api.node.data.__started===true:null;},
  });
  registry.register({
    type:'animal.dogChase',title:'Dog Chase Pawn',category:'Animal Pawn / Dog',description:'Steers the Animal Pawn toward a target using the collision-aware movement controller.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('target','vehiclePawn',null),dataIn('stopDistance','number',1.15),dataIn('speedMultiplier','number',1.05)],outputs:[completedOut,dataOut('started','boolean')],
    run(api){const target=resolvePawn(api),chased=resolveReference(api,'target');api.node.data.__started=isAnimal(target)&&target.chase(chased,{stopDistance:number(api.getInput('stopDistance')),speedMultiplier:number(api.getInput('speedMultiplier'))})===true;return {exec:'completed'};},evaluate(api,pin){return pin==='started'?api.node.data.__started===true:null;},
  });
  registry.register({type:'animal.stopChase',title:'Stop Dog Chase',category:'Animal Pawn / Dog',description:'Stops the active chase and restores authored locomotion.',inputs:[execIn,dataIn('pawn','vehiclePawn',null)],outputs:[completedOut],run(api){const target=resolvePawn(api);if(isAnimal(target))target.stopChase('logic');return {exec:'completed'};}});
  registry.register({
    type:'animal.horseMount',title:'Mount Horse Seat',category:'Animal Pawn / Horse',description:'Seats a Character/Pawn on the horse, transfers its player slot and keeps the rider synced to the authored seat offset.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('rider','vehiclePawn',null)],outputs:[completedOut,dataOut('mounted','boolean')],
    run(api){const target=resolvePawn(api),rider=resolveReference(api,'rider');api.node.data.__mounted=isAnimal(target)&&target.mountRider(rider)===true;return {exec:'completed'};},evaluate(api,pin){return pin==='mounted'?api.node.data.__mounted===true:null;},
  });
  registry.register({
    type:'animal.horseDismount',title:'Dismount Horse Seat',category:'Animal Pawn / Horse',description:'Returns control to the rider and places it beside the horse.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null)],outputs:[completedOut,dataOut('dismounted','boolean')],
    run(api){const target=resolvePawn(api);api.node.data.__dismounted=isAnimal(target)&&target.dismountRider()===true;return {exec:'completed'};},evaluate(api,pin){return pin==='dismounted'?api.node.data.__dismounted===true:null;},
  });
  registry.register({
    type:'animal.setGait',title:'Set Animal Gait',category:'Animal Pawn',description:'Requests automatic, walk, trot or run/gallop physical speed selection.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('gait','string','auto')],outputs:[completedOut,dataOut('gait','string')],
    run(api){const target=resolvePawn(api);api.node.data.__gait=isAnimal(target)?target.setGait(api.getInput('gait')):'';return {exec:'completed'};},evaluate(api,pin){return pin==='gait'?api.node.data.__gait||'':null;},
  });
  registry.register({
    type:'animal.setSpecies',title:'Set Animal Species',category:'Animal Pawn',description:'Changes the procedural fallback profile to cat, dog, horse or generic. A user GLB remains untouched.',
    inputs:[execIn,dataIn('pawn','vehiclePawn',null),dataIn('species','string','generic')],outputs:[completedOut,dataOut('species','string')],
    run(api){const target=resolvePawn(api);api.node.data.__species=isAnimal(target)?target.setSpecies(api.getInput('species')):'';return {exec:'completed'};},evaluate(api){return api.node.data.__species||'';},
  });
  registry.register({
    type:'animal.getState',title:'Get Animal State',category:'Animal Pawn',description:'Reads species, gait and locomotion state from an Animal Pawn.',
    inputs:[dataIn('pawn','vehiclePawn',null)],outputs:[dataOut('species','string'),dataOut('gait','string'),dataOut('requestedGait','string'),dataOut('ability','string'),dataOut('speedKmh','number'),dataOut('moving','boolean'),dataOut('sprinting','boolean'),dataOut('crouching','boolean'),dataOut('stealth','boolean'),dataOut('grounded','boolean'),dataOut('airborne','boolean'),dataOut('action','string'),dataOut('chaseTarget','vehiclePawn'),dataOut('rider','vehiclePawn')],
    evaluate(api,pin){const target=resolvePawn(api),state=target&&target.state||{};if(pin==='species')return String(state.species||target&&target.config&&target.config.species||'');if(['gait','requestedGait','ability','action'].includes(pin))return String(state[pin]||'');if(pin==='chaseTarget')return state.chaseTargetId||null;if(pin==='rider')return state.riderPawnId||null;if(['moving','sprinting','crouching','stealth','grounded','airborne'].includes(pin))return state[pin]===true;return number(state.speedKmh);},
  });
}

const packs=window.LK_LOGIC_NODE_PACKS||(window.LK_LOGIC_NODE_PACKS=[]);packs.push(registerAnimalNodes);
window.LK_LOGIC_NODES_ANIMAL=Object.freeze({register:registerAnimalNodes});
})();
