/* =========================================================
   LOT KING - Soccer Pawn specialization
   Football roles and keeper actions layered on the shared
   Character Pawn base. No movement/camera/mixer duplication.
   ========================================================= */
(function(){
'use strict';
const SCHEMA_VERSION=1;
const ROLES=['striker','winger','midfielder','defender','goalkeeper'];
const ROLE_ANIMATION_DEFAULTS={common:{idle:'Idle',walk:'Walking',run:'Running',strafeLeft:'Left Strafe',strafeRight:'Right Strafe',jump:'Jump',celebrate:'Victory',defeat:'Defeated'},striker:{shoot:'Soccer Strike',pass:'Soccer Pass',cross:'Soccer Pass'},winger:{shoot:'Soccer Strike',pass:'Soccer Pass',cross:'Soccer Pass'},midfielder:{shoot:'Soccer Strike',pass:'Soccer Pass',cross:'Soccer Pass'},defender:{shoot:'Soccer Strike',pass:'Soccer Pass',tackle:'Soccer Tackle'},goalkeeper:{save:'Goalkeeper Catch',diveLeft:'Goalkeeper Dive Left',diveRight:'Goalkeeper Dive Right',shoot:'Soccer Strike',pass:'Soccer Pass'}};
const ROLE_ACTIONS={striker:['shoot','pass','cross','celebrate','defeat'],winger:['shoot','pass','cross','celebrate','defeat'],midfielder:['shoot','pass','cross','celebrate','defeat'],defender:['shoot','pass','tackle','celebrate','defeat'],goalkeeper:['save','diveLeft','diveRight','pass','celebrate','defeat']};
function normalizeRole(value){const role=String(value||'').trim().toLowerCase();return ROLES.includes(role)?role:'striker';}
function roleAnimationDefaults(role){return Object.assign({},ROLE_ANIMATION_DEFAULTS.common,ROLE_ANIMATION_DEFAULTS[normalizeRole(role)]||{});}
function normalizeConfig(source){
  const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE,src=source&&typeof source==='object'?base.clone(source):{},role=normalizeRole(src.role),keeper=src.keeper||{};
  const cfg=base.normalizeCommonConfig(src,{schemaVersion:SCHEMA_VERSION,role,playerId:1,movement:{walkSpeed:1.9,runSpeed:6,sprintMultiplier:1.35,acceleration:14,turnRate:10,jumpHeight:1.1,gravity:22,airControl:.35,inputMode:'camera'},animations:roleAnimationDefaults(role),appearance:{shirtColor:'#e11d48',shortsColor:'#f8fafc',socksColor:'#e11d48',hairColor:'#2b2118',skinColor:'#d8a184',hairStyle:'short',number:9},camera:{mode:'arcade',view:'third',distance:7.5,height:2.6,lag:6.5,fov:60}});
  cfg.role=role;cfg.keeper={diveDistance:base.clamp(base.finite(keeper.diveDistance,2.6),.5,5),diveDuration:base.clamp(base.finite(keeper.diveDuration,.55),.2,1.5),reach:base.clamp(base.finite(keeper.reach,1.1),.4,2.5)};cfg.animations=Object.assign(roleAnimationDefaults(role),src.animations||{});return cfg;
}
function createLogic(GAME,owner,source,services){
  const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE,cfg=normalizeConfig(source);
  const pawn=base.create(GAME,owner,cfg,services,{pawnType:'soccer',ownerKey:'soccerPawnId',idPrefix:'soccer-pawn-',state:{role:cfg.role,diving:false,diveDirection:0},actionStartedEvent:'OnSoccerActionStarted',actionFinishedEvent:'OnSoccerActionFinished',actionPayload:record=>({role:record.config.role})});
  if(!pawn)return null;
  pawn.setRole=function(role){const next=normalizeRole(role);if(next===this.config.role)return next;this.config.role=next;this.state.role=next;this.config.animations=Object.assign(roleAnimationDefaults(next),this.config.animationOverrides||{});this.rebindLocomotion();base.emitPawnEvent(this,'OnPawnRoleChanged',{role:next});return next;};
  pawn.setKeeper=function(patch){const next=Object.assign({},this.config.keeper,patch||{});this.config.keeper={diveDistance:base.clamp(base.finite(next.diveDistance,2.6),.5,5),diveDuration:base.clamp(base.finite(next.diveDuration,.55),.2,1.5),reach:base.clamp(base.finite(next.reach,1.1),.4,2.5)};return this.config.keeper;};
  pawn.availableActions=function(){return (ROLE_ACTIONS[this.config.role]||ROLE_ACTIONS.striker).slice();};
  const baseAction=pawn.playAction.bind(pawn);
  pawn.playAction=function(name,options){const action=String(name||'').trim();if(this.config.role==='goalkeeper'&&(action==='diveLeft'||action==='diveRight')){this.state.diving=true;this.state.diveDirection=action==='diveLeft'?-1:1;this.state.diveElapsed=0;}return baseAction(action,options);};
  pawn.movementScale=function(){return this.state.action&&this.state.action!=='celebrate'?.25:1;};
  pawn.beforeMovementStep=function(h){if(!this.state.diving)return false;const keeper=this.config.keeper;this.state.diveElapsed=(this.state.diveElapsed||0)+h;const t=base.clamp(this.state.diveElapsed/keeper.diveDuration,0,1),speed=(keeper.diveDistance/keeper.diveDuration)*(1-t*.55);if(this.owner&&this.owner.position){const heading=this.owner.rotation?this.owner.rotation.y:0;this.owner.position.x+=Math.cos(heading)*this.state.diveDirection*speed*h;this.owner.position.z-=Math.sin(heading)*this.state.diveDirection*speed*h;}if(t>=1)this.state.diving=false;if(this.locomotion)this.locomotion.update({x:0,z:0},h);return true;};
  const baseBinding=pawn.applyBinding.bind(pawn);
  pawn.applyBinding=function(path,value){const key=String(path||'');if(key==='role'){this.setRole(value);return true;}if(key.indexOf('keeper.')===0){this.setKeeper({[key.slice(7)]:value});return true;}return baseBinding(path,value);};
  const baseReset=pawn.reset.bind(pawn);
  pawn.reset=function(){const result=baseReset();this.state.role=this.config.role;this.state.diving=false;this.state.diveDirection=0;return result;};
  return pawn;
}
function install(GAME){if(!GAME)return null;const core=window.LK_RUNTIME_PAWN_CORE&&window.LK_RUNTIME_PAWN_CORE.install(GAME);if(core&&core.components&&!core.components.has('soccer'))core.components.register('soccer',options=>createLogic(GAME,options.owner,options.config,options.services));return true;}
const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE;
window.LK_RUNTIME_SOCCER_PAWNS=Object.freeze({SCHEMA_VERSION,ROLES,ROLE_ACTIONS,normalizeConfig,normalizeRole,roleAnimationDefaults,createLogic,install,loadAnimationLibrary:base&&base.loadAnimationLibrary,animationLibraryKey:base&&base.animationLibraryKey});
if(window.LOT_KING)install(window.LOT_KING);
})();
