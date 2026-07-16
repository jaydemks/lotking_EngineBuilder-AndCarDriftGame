/* =========================================================
   LOT KING - Soccer node pack
   Logic Element nodes for the soccer game mode: Soccer Pawn
   control, ball, goal frames and the penalty shootout flow.
   Registered through window.LK_LOGIC_NODE_PACKS so the pack
   stays independent from the MVP node file.
   ========================================================= */
(function(){
'use strict';

const execIn = {name:'exec', kind:'exec', direction:'input'};
const thenOut = {name:'then', kind:'exec', direction:'output'};
const completedOut = {name:'completed', kind:'exec', direction:'output'};
const dataIn = (name, type, value, extra) => Object.assign({name, kind:'data', direction:'input', type:type || 'any', defaultValue:value}, extra || {});
const dataOut = (name, type) => ({name, kind:'data', direction:'output', type:type || 'any'});
const number = value => Number(value) || 0;
const axis = value => Math.max(-1, Math.min(1, number(value)));

function selfPawn(api){
  return api.services.pawns ? api.services.pawns.self() : null;
}
function resolvePawn(api, pin){
  const explicit = api.getInput(pin || 'pawn');
  if(explicit && api.services.pawns && api.services.pawns.get) return api.services.pawns.get(explicit) || explicit;
  return explicit || selfPawn(api);
}
function isSoccerPawn(pawn){
  return !!(pawn && pawn.pawnType === 'soccer');
}

function registerSoccerNodes(registry){
  // ---- Events -----------------------------------------------------------
  registry.register({type:'event.onSoccerAction', title:'On Soccer Action Started', category:'Soccer Events', description:'Runs when a Soccer Pawn starts an action (shoot, pass, save...).', event:'OnSoccerActionStarted', outputs:[thenOut, dataOut('action', 'string'), dataOut('role', 'string'), dataOut('pawn', 'vehiclePawn')]});
  registry.register({type:'event.onSoccerActionFinished', title:'On Soccer Action Finished', category:'Soccer Events', description:'Runs when a Soccer Pawn action animation completes.', event:'OnSoccerActionFinished', outputs:[thenOut, dataOut('action', 'string'), dataOut('role', 'string'), dataOut('pawn', 'vehiclePawn')]});
  registry.register({type:'event.onBallKicked', title:'On Ball Kicked', category:'Soccer Events', description:'Runs when a soccer ball is kicked.', event:'OnBallKicked', outputs:[thenOut, dataOut('ballId', 'string'), dataOut('power', 'number'), dataOut('curve', 'number')]});
  registry.register({type:'event.onGoalScored', title:'On Goal Scored', category:'Soccer Events', description:'Runs when the ball fully crosses a registered goal line.', event:'OnGoalScored', outputs:[thenOut, dataOut('goalId', 'string'), dataOut('team', 'string'), dataOut('impactX', 'number'), dataOut('impactY', 'number'), dataOut('speedKmh', 'number')]});
  registry.register({type:'event.onBallSaved', title:'On Ball Saved', category:'Soccer Events', description:'Runs when a goalkeeper Pawn stops the ball.', event:'OnBallSaved', outputs:[thenOut, dataOut('ballId', 'string'), dataOut('keeperPawnId', 'string'), dataOut('playerId', 'number')]});
  registry.register({type:'event.onBallOut', title:'On Ball Out / Missed', category:'Soccer Events', description:'Runs when the ball stops or leaves the play area without scoring.', event:'OnBallOut', outputs:[thenOut, dataOut('ballId', 'string'), dataOut('reason', 'string')]});
  registry.register({type:'event.onPenaltyKickReady', title:'On Penalty Kick Ready', category:'Soccer Events', description:'Runs when the next penalty kick is ready to be taken.', event:'OnPenaltyKickReady', outputs:[thenOut, dataOut('round', 'number'), dataOut('team', 'string'), dataOut('teamName', 'string'), dataOut('suddenDeath', 'boolean')]});
  registry.register({type:'event.onPenaltyResult', title:'On Penalty Result', category:'Soccer Events', description:'Runs after each penalty kick resolves (goal, saved, miss).', event:'OnPenaltyResult', outputs:[thenOut, dataOut('result', 'string'), dataOut('team', 'string'), dataOut('teamName', 'string'), dataOut('round', 'number'), dataOut('scoreA', 'number'), dataOut('scoreB', 'number')]});
  registry.register({type:'event.onShootoutFinished', title:'On Shootout Finished', category:'Soccer Events', description:'Runs when the penalty shootout has a final result.', event:'OnShootoutFinished', outputs:[thenOut, dataOut('winner', 'string'), dataOut('winnerName', 'string'), dataOut('scoreA', 'number'), dataOut('scoreB', 'number')]});

  // ---- Soccer Pawn ------------------------------------------------------
  registry.register({
    type:'soccer.getMoveInput', title:'Get Soccer Move Input', category:'Soccer Pawn',
    description:'Reads the possessed Pawn free-movement input: lateral X, forward Z, sprint and action button.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('x', 'number'), dataOut('z', 'number'), dataOut('sprint', 'boolean'), dataOut('action', 'boolean'), dataOut('device', 'string')],
    evaluate(api, pin){
      const pawn = resolvePawn(api);
      const move = pawn && pawn.readPlayerDrive ? pawn.readPlayerDrive() : {x:0, z:0, sprint:false, action:false, device:null};
      if(pin === 'sprint') return move.sprint === true;
      if(pin === 'action') return move.action === true;
      if(pin === 'device') return move.device || '';
      return number(move[pin]);
    },
  });

  registry.register({
    type:'soccer.setMoveInput', title:'Set Soccer Move Input', category:'Soccer Pawn',
    description:'Writes free-movement input to one Soccer Pawn: X strafes, Z runs forward, sprint boosts.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('x', 'number', 0), dataIn('z', 'number', 0), dataIn('sprint', 'boolean', false)],
    outputs:[completedOut],
    run(api){
      const pawn = resolvePawn(api);
      if(isSoccerPawn(pawn)) pawn.setMoveInput({x:axis(api.getInput('x')), z:axis(api.getInput('z')), sprint:api.getInput('sprint') === true});
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'soccer.playAction', title:'Play Soccer Action', category:'Soccer Pawn',
    description:'Plays a role action with animation blending: shoot, pass, cross, tackle, save, diveLeft, diveRight, celebrate, defeat.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('action', 'string', 'shoot'), dataIn('speed', 'number', 1)],
    outputs:[completedOut, dataOut('started', 'boolean')],
    run(api){
      const pawn = resolvePawn(api);
      api.node.data.__started = isSoccerPawn(pawn) && pawn.playAction(api.getInput('action'), {speed:number(api.getInput('speed')) || 1}) === true;
      return {exec:'completed'};
    },
    evaluate(api, pin){ return pin === 'started' ? api.node.data.__started === true : null; },
  });

  registry.register({
    type:'soccer.jump', title:'Soccer Jump', category:'Soccer Pawn',
    description:'Makes the Pawn jump if grounded, playing its jump clip. Height/gravity come from the Movement config.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null)],
    outputs:[completedOut, dataOut('jumped', 'boolean')],
    run(api){
      const pawn = resolvePawn(api);
      api.node.data.__jumped = isSoccerPawn(pawn) && typeof pawn.jump === 'function' && pawn.jump() === true;
      return {exec:'completed'};
    },
    evaluate(api, pin){ return pin === 'jumped' ? api.node.data.__jumped === true : null; },
  });

  registry.register({
    type:'soccer.setRole', title:'Set Soccer Role', category:'Soccer Pawn',
    description:'Changes the Pawn role (striker, winger, midfielder, defender, goalkeeper) and reseeds its default animation set.',
    inputs:[execIn, dataIn('pawn', 'vehiclePawn', null), dataIn('role', 'string', 'striker')],
    outputs:[completedOut, dataOut('role', 'string')],
    run(api){
      const pawn = resolvePawn(api);
      api.node.data.__role = isSoccerPawn(pawn) ? pawn.setRole(api.getInput('role')) : '';
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__role || ''; },
  });

  registry.register({
    type:'soccer.getState', title:'Get Soccer Pawn State', category:'Soccer Pawn',
    description:'Reads runtime state from a Soccer Pawn instance.',
    inputs:[dataIn('pawn', 'vehiclePawn', null)],
    outputs:[dataOut('role', 'string'), dataOut('speedKmh', 'number'), dataOut('moving', 'boolean'), dataOut('sprinting', 'boolean'), dataOut('action', 'string'), dataOut('diving', 'boolean')],
    evaluate(api, pin){
      const pawn = resolvePawn(api);
      const state = pawn && pawn.state || {};
      if(pin === 'role') return String(state.role || '');
      if(pin === 'moving') return state.moving === true;
      if(pin === 'sprinting') return state.sprinting === true;
      if(pin === 'action') return String(state.action || '');
      if(pin === 'diving') return state.diving === true;
      return number(state.speedKmh);
    },
  });

  // ---- Soccer Ball ------------------------------------------------------
  registry.register({
    type:'soccer.spawnBall', title:'Spawn Soccer Ball', category:'Soccer Ball',
    description:'Creates (or resets) a regulation soccer ball at a world position.',
    inputs:[execIn, dataIn('ballId', 'string', ''), dataIn('position', 'vector3', [0,0,0])],
    outputs:[completedOut, dataOut('ballId', 'string')],
    run(api){
      const p = api.getInput('position') || [0,0,0];
      const pos = Array.isArray(p) ? {x:p[0], y:p[1], z:p[2]} : p;
      api.node.data.__ballId = api.services.soccer ? api.services.soccer.spawnBall({id:api.getInput('ballId') || undefined, x:number(pos.x), y:number(pos.y), z:number(pos.z)}) : null;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__ballId || ''; },
  });

  registry.register({
    type:'soccer.kickBall', title:'Kick Soccer Ball', category:'Soccer Ball',
    description:'Kicks the ball toward a world target. Power in m/s, lift adds arc, curve bends the flight (Magnus).',
    inputs:[execIn, dataIn('ballId', 'string', ''), dataIn('target', 'vector3', [0,1,11]), dataIn('power', 'number', 18), dataIn('lift', 'number', .25), dataIn('curve', 'number', 0)],
    outputs:[completedOut, dataOut('kicked', 'boolean')],
    run(api){
      const t = api.getInput('target') || [0,1,0];
      const target = Array.isArray(t) ? {x:t[0], y:t[1], z:t[2]} : t;
      const pawn = selfPawn(api);
      api.node.data.__kicked = !!(api.services.soccer && api.services.soccer.kickBall(api.getInput('ballId') || null, {
        target, power:number(api.getInput('power')), lift:number(api.getInput('lift')), curve:number(api.getInput('curve')),
        kickerPawnId:pawn && pawn.id || null,
      }));
      return {exec:'completed'};
    },
    evaluate(api, pin){ return pin === 'kicked' ? api.node.data.__kicked === true : null; },
  });

  registry.register({
    type:'soccer.resetBall', title:'Reset Soccer Ball', category:'Soccer Ball',
    description:'Puts the ball back on its spawn point (e.g. the penalty spot).',
    inputs:[execIn, dataIn('ballId', 'string', '')], outputs:[completedOut],
    run(api){ if(api.services.soccer) api.services.soccer.resetBall(api.getInput('ballId') || null); return {exec:'completed'}; },
  });

  registry.register({
    type:'soccer.getBallState', title:'Get Ball State', category:'Soccer Ball',
    description:'Reads position, speed and flight status of a soccer ball.',
    inputs:[dataIn('ballId', 'string', '')],
    outputs:[dataOut('position', 'vector3'), dataOut('speedKmh', 'number'), dataOut('inFlight', 'boolean'), dataOut('outcome', 'string')],
    evaluate(api, pin){
      const state = api.services.soccer ? api.services.soccer.ballState(api.getInput('ballId') || null) : null;
      if(!state) return pin === 'position' ? [0,0,0] : (pin === 'inFlight' ? false : (pin === 'outcome' ? '' : 0));
      if(pin === 'position') return [state.position.x, state.position.y, state.position.z];
      if(pin === 'inFlight') return state.inFlight === true;
      if(pin === 'outcome') return state.outcome || '';
      return number(state.speedKmh);
    },
  });

  registry.register({
    type:'soccer.registerGoal', title:'Register Goal Frame', category:'Soccer Ball',
    description:'Registers a goal line for detection. Regulation frame: width 7.32, height 2.44. Heading is the direction the goal mouth faces.',
    inputs:[execIn, dataIn('goalId', 'string', ''), dataIn('position', 'vector3', [0,0,0]), dataIn('heading', 'number', 0), dataIn('width', 'number', 7.32), dataIn('height', 'number', 2.44), dataIn('team', 'string', '')],
    outputs:[completedOut, dataOut('goalId', 'string')],
    run(api){
      const p = api.getInput('position') || [0,0,0];
      const pos = Array.isArray(p) ? {x:p[0], y:p[1], z:p[2]} : p;
      api.node.data.__goalId = api.services.soccer ? api.services.soccer.registerGoal({
        id:api.getInput('goalId') || undefined,
        x:number(pos.x), y:number(pos.y), z:number(pos.z),
        heading:number(api.getInput('heading')),
        width:number(api.getInput('width')) || 7.32,
        height:number(api.getInput('height')) || 2.44,
        team:String(api.getInput('team') || ''),
      }) : null;
      return {exec:'completed'};
    },
    evaluate(api){ return api.node.data.__goalId || ''; },
  });

  // ---- Penalty Shootout -------------------------------------------------
  registry.register({
    type:'penalty.configure', title:'Configure Penalty Shootout', category:'Soccer Penalty',
    description:'Sets teams, kicks per team and the tracked ball before starting the shootout.',
    inputs:[execIn, dataIn('kicksPerTeam', 'number', 5), dataIn('teamA', 'string', 'Home'), dataIn('teamB', 'string', 'Away'), dataIn('ballId', 'string', ''), dataIn('autoAdvanceDelay', 'number', 2.2)],
    outputs:[completedOut],
    run(api){
      if(api.services.soccer) api.services.soccer.configurePenalty({
        kicksPerTeam:number(api.getInput('kicksPerTeam')) || 5,
        teamA:api.getInput('teamA'), teamB:api.getInput('teamB'),
        ballId:api.getInput('ballId') || null,
        autoAdvanceDelay:number(api.getInput('autoAdvanceDelay')) || 2.2,
      });
      return {exec:'completed'};
    },
  });

  registry.register({
    type:'penalty.start', title:'Start Penalty Shootout', category:'Soccer Penalty',
    description:'Starts (or restarts) the configured penalty shootout from round 1.',
    inputs:[execIn], outputs:[completedOut],
    run(api){ if(api.services.soccer) api.services.soccer.startPenalty(); return {exec:'completed'}; },
  });

  registry.register({
    type:'penalty.beginKick', title:'Begin Penalty Kick', category:'Soccer Penalty',
    description:'Moves the current kick from Ready to Aim (kicker in control).',
    inputs:[execIn], outputs:[completedOut],
    run(api){ if(api.services.soccer) api.services.soccer.beginPenaltyKick(); return {exec:'completed'}; },
  });

  registry.register({
    type:'penalty.reset', title:'Reset Penalty Shootout', category:'Soccer Penalty',
    description:'Clears score and rounds, keeping team configuration.',
    inputs:[execIn], outputs:[completedOut],
    run(api){ if(api.services.soccer) api.services.soccer.resetPenalty(); return {exec:'completed'}; },
  });

  registry.register({
    type:'penalty.getState', title:'Get Penalty State', category:'Soccer Penalty',
    description:'Reads the live shootout state: phase, round, kicking team and score.',
    outputs:[dataOut('phase', 'string'), dataOut('round', 'number'), dataOut('kickingTeam', 'string'), dataOut('kickingTeamName', 'string'), dataOut('scoreA', 'number'), dataOut('scoreB', 'number'), dataOut('suddenDeath', 'boolean'), dataOut('finished', 'boolean'), dataOut('winnerName', 'string')],
    evaluate(api, pin){
      const state = api.services.soccer ? api.services.soccer.penaltyState() : null;
      if(!state) return pin === 'round' || pin === 'scoreA' || pin === 'scoreB' ? 0 : (pin === 'suddenDeath' || pin === 'finished' ? false : '');
      if(pin === 'suddenDeath') return state.suddenDeath === true;
      if(pin === 'finished') return state.finished === true;
      if(pin === 'round' || pin === 'scoreA' || pin === 'scoreB') return number(state[pin]);
      return String(state[pin] == null ? '' : state[pin]);
    },
  });

  return registry;
}

window.LK_LOGIC_NODE_PACKS = window.LK_LOGIC_NODE_PACKS || [];
window.LK_LOGIC_NODE_PACKS.push(registerSoccerNodes);
window.LK_LOGIC_NODES_SOCCER = Object.freeze({registerSoccerNodes});
})();
