/* =========================================================
   LOT KING - Generic gameplay difficulty
   One player-facing setting with domain-specific profiles.
   Games may consume only the values they understand.
   ========================================================= */
(function(){
'use strict';

const STORAGE_KEY='lotking.gameplayDifficulty.v1';
const LEVELS=['easy','normal','hard'];
const PROFILES=Object.freeze({
  easy:Object.freeze({
    id:'easy',label:'Easy',
    opponentReaction:1.65,opponentDecisionError:.3,opponentSpeed:.72,
    soccer:Object.freeze({keeperReaction:2.15,keeperPrediction:.68,keeperReach:.76,keeperDive:.78,keeperTracking:.72,keeperPredictionError:.62})
  }),
  normal:Object.freeze({
    id:'normal',label:'Medium',
    opponentReaction:1,opponentDecisionError:.12,opponentSpeed:.88,
    soccer:Object.freeze({keeperReaction:1.35,keeperPrediction:.88,keeperReach:.9,keeperDive:.9,keeperTracking:.9,keeperPredictionError:.2})
  }),
  hard:Object.freeze({
    id:'hard',label:'Hard',
    opponentReaction:.78,opponentDecisionError:.02,opponentSpeed:1,
    soccer:Object.freeze({keeperReaction:.78,keeperPrediction:1.08,keeperReach:1.04,keeperDive:1.06,keeperTracking:1.08,keeperPredictionError:0})
  })
});
let projectDefault='normal',userValue=null;

function normalize(value){const key=String(value||'').trim().toLowerCase();return LEVELS.includes(key)?key:'normal';}
function read(){
  try {const value=localStorage.getItem(STORAGE_KEY);return value&&LEVELS.includes(value)?value:null;}
  catch(error){return null;}
}
function write(value){
  try {if(value==null)localStorage.removeItem(STORAGE_KEY);else localStorage.setItem(STORAGE_KEY,value);return true;}
  catch(error){return false;}
}
function current(){return userValue||projectDefault;}
function profile(domain){
  const base=PROFILES[current()]||PROFILES.normal;
  if(!domain)return base;
  return Object.assign({},base,base[String(domain)]||{});
}
function emit(){
  if(typeof window.dispatchEvent==='function'&&typeof window.CustomEvent==='function'){
    window.dispatchEvent(new CustomEvent('lotking:gameplay-difficulty-change',{detail:{difficulty:current(),profile:profile()}}));
  }
}
function set(value,options){
  const next=normalize(value),opts=options||{};
  if(opts.projectDefault===true){projectDefault=next;if(userValue==null)emit();return current();}
  userValue=next;if(opts.persist!==false)write(next);emit();return current();
}
function clearOverride(){userValue=null;write(null);emit();return current();}
function install(GAME){
  if(GAME&&GAME.systems)GAME.systems.gameplayDifficulty=api;
  return api;
}

userValue=read();
const api=Object.freeze({levels:LEVELS.slice(),profiles:PROFILES,normalize,current,profile,set,clearOverride,install});
window.LK_RUNTIME_GAMEPLAY_DIFFICULTY=api;
if(window.LOT_KING)install(window.LOT_KING);
})();
