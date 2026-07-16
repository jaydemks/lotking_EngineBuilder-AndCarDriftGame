/* =========================================================
   LOT KING - Penalty shootout flow
   Referee state machine for the soccer penalty game mode:
   alternating kicks, regulation rounds + sudden death, early
   mathematical decision, score tracking and gameplay events.
   Ball outcomes arrive through the shared lk-pawn-event bus.
   ========================================================= */
(function(){
'use strict';

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }

function emitEvent(type, payload){
  if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
  window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type}, payload || {})}));
}

function create(GAME){
  const state = {
    phase:'idle',           // idle | ready | aim | shot | resolved | finished
    kicksPerTeam:5,
    round:1,
    kickingTeam:'A',
    teams:{A:{name:'Home', kicks:[]}, B:{name:'Away', kicks:[]}},
    suddenDeath:false,
    winner:null,
    ballId:null,
    autoAdvanceDelay:2.2,
    listening:false,
    pendingAdvance:null,
  };

  function score(team){
    return state.teams[team].kicks.filter(result => result === 'goal').length;
  }
  function taken(team){
    return state.teams[team].kicks.length;
  }
  function remaining(team){
    return Math.max(0, state.kicksPerTeam - taken(team));
  }

  function setPhase(phase){
    if(state.phase === phase) return;
    state.phase = phase;
    emitEvent('OnPenaltyPhaseChanged', {phase, round:state.round, team:state.kickingTeam, teamName:state.teams[state.kickingTeam].name});
  }

  function decided(){
    if(state.suddenDeath){
      // Sudden death resolves when both teams took the same number of extra
      // kicks with different scores.
      if(taken('A') === taken('B') && taken('A') > state.kicksPerTeam) return score('A') !== score('B');
      return false;
    }
    const aCanReach = score('A') + remaining('A');
    const bCanReach = score('B') + remaining('B');
    return score('A') > bCanReach || score('B') > aCanReach
      || (remaining('A') === 0 && remaining('B') === 0 && score('A') !== score('B'));
  }

  function finish(){
    state.winner = score('A') === score('B') ? null : (score('A') > score('B') ? 'A' : 'B');
    setPhase('finished');
    emitEvent('OnShootoutFinished', {
      winner:state.winner,
      winnerName:state.winner ? state.teams[state.winner].name : null,
      scoreA:score('A'), scoreB:score('B'),
    });
  }

  function advance(){
    if(state.pendingAdvance){ clearTimeout(state.pendingAdvance); state.pendingAdvance = null; }
    if(state.phase === 'finished' || state.phase === 'idle') return;
    if(decided()){ finish(); return; }
    if(remaining('A') === 0 && remaining('B') === 0 && score('A') === score('B')) state.suddenDeath = true;
    state.kickingTeam = state.kickingTeam === 'A' ? 'B' : 'A';
    if(state.kickingTeam === 'A') state.round++;
    const soccerBall = GAME && GAME.systems && GAME.systems.soccerBall;
    if(soccerBall && state.ballId) soccerBall.reset(state.ballId);
    setPhase('ready');
    emitEvent('OnPenaltyKickReady', {round:state.round, team:state.kickingTeam, teamName:state.teams[state.kickingTeam].name, suddenDeath:state.suddenDeath});
  }

  function recordResult(result){
    if(state.phase !== 'shot' && state.phase !== 'aim' && state.phase !== 'ready') return;
    const team = state.kickingTeam;
    state.teams[team].kicks.push(result);
    setPhase('resolved');
    emitEvent('OnPenaltyResult', {
      result, team, teamName:state.teams[team].name, round:state.round,
      scoreA:score('A'), scoreB:score('B'), suddenDeath:state.suddenDeath,
    });
    state.pendingAdvance = setTimeout(advance, Math.max(200, state.autoAdvanceDelay * 1000));
  }

  function onPawnEvent(event){
    const detail = event && event.detail || {};
    if(state.phase === 'idle' || state.phase === 'finished') return;
    if(state.ballId && detail.ballId && String(detail.ballId) !== String(state.ballId)) return;
    if(detail.type === 'OnBallKicked') setPhase('shot');
    else if(detail.type === 'OnGoalScored') recordResult('goal');
    else if(detail.type === 'OnBallSaved') recordResult('saved');
    else if(detail.type === 'OnBallOut') recordResult('miss');
  }

  function listen(){
    if(state.listening || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('lk-pawn-event', onPawnEvent);
    state.listening = true;
  }

  function configure(options){
    const opts = options || {};
    state.kicksPerTeam = clamp(finite(opts.kicksPerTeam, 5) | 0, 1, 20);
    if(opts.teamA != null) state.teams.A.name = String(opts.teamA) || 'Home';
    if(opts.teamB != null) state.teams.B.name = String(opts.teamB) || 'Away';
    if(opts.ballId != null) state.ballId = String(opts.ballId);
    if(opts.autoAdvanceDelay != null) state.autoAdvanceDelay = clamp(finite(opts.autoAdvanceDelay, 2.2), .2, 10);
    return snapshot();
  }

  function start(){
    reset(true);
    listen();
    setPhase('ready');
    emitEvent('OnPenaltyKickReady', {round:1, team:'A', teamName:state.teams.A.name, suddenDeath:false});
    return snapshot();
  }

  function beginKick(){
    if(state.phase === 'ready') setPhase('aim');
    return snapshot();
  }

  function reset(keepConfig){
    if(state.pendingAdvance){ clearTimeout(state.pendingAdvance); state.pendingAdvance = null; }
    state.round = 1;
    state.kickingTeam = 'A';
    state.teams.A.kicks = [];
    state.teams.B.kicks = [];
    state.suddenDeath = false;
    state.winner = null;
    state.phase = 'idle';
    if(keepConfig !== true){
      state.kicksPerTeam = 5;
      state.teams.A.name = 'Home';
      state.teams.B.name = 'Away';
      state.ballId = null;
    }
    return snapshot();
  }

  function snapshot(){
    return {
      phase:state.phase,
      round:state.round,
      kickingTeam:state.kickingTeam,
      kickingTeamName:state.teams[state.kickingTeam].name,
      kicksPerTeam:state.kicksPerTeam,
      suddenDeath:state.suddenDeath,
      scoreA:score('A'), scoreB:score('B'),
      kicksA:state.teams.A.kicks.slice(), kicksB:state.teams.B.kicks.slice(),
      teamA:state.teams.A.name, teamB:state.teams.B.name,
      finished:state.phase === 'finished',
      winner:state.winner,
      winnerName:state.winner ? state.teams[state.winner].name : null,
    };
  }

  return Object.freeze({configure, start, beginKick, recordResult, advance, reset, state:snapshot});
}

function install(GAME){
  if(!GAME) return null;
  if(GAME.systems && GAME.systems.penaltyFlow) return GAME.systems.penaltyFlow;
  const api = create(GAME);
  if(GAME.systems) GAME.systems.penaltyFlow = api;
  return api;
}

window.LK_RUNTIME_PENALTY_FLOW = Object.freeze({create, install});
if(window.LOT_KING) install(window.LOT_KING);
})();
