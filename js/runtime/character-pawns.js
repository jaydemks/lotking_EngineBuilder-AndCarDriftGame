/* =========================================================
   LOT KING - Generic Character Pawn presets
   ========================================================= */
(function(){
'use strict';
const SCHEMA_VERSION=1;
const PRESETS=Object.freeze({normal:{walkSpeed:1.8,runSpeed:5.4,sprintMultiplier:1.3,acceleration:13,turnRate:10,jumpHeight:1.05,gravity:22,airControl:.32},civil:{walkSpeed:1.45,runSpeed:4.4,sprintMultiplier:1.2,acceleration:10,turnRate:9,jumpHeight:.8,gravity:22,airControl:.25},police:{walkSpeed:2,runSpeed:6.2,sprintMultiplier:1.4,acceleration:16,turnRate:11,jumpHeight:1.2,gravity:23,airControl:.38}});
const ANIMATION_DEFAULTS=Object.freeze({idle:'Idle',walk:'Walking',run:'Running',strafeLeft:'Left Strafe',strafeRight:'Right Strafe',jump:'Jump',fall:'Falling Idle',land:'Landing',interact:'Interact'});
function normalizePreset(value){const preset=String(value||'').trim().toLowerCase();return PRESETS[preset]?preset:'normal';}
function normalizeConfig(source){
  const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE,src=source&&typeof source==='object'?base.clone(source):{},preset=normalizePreset(src.preset);
  const cfg=base.normalizeCommonConfig(src,{schemaVersion:SCHEMA_VERSION,preset,playerId:1,movement:Object.assign({inputMode:'camera'},PRESETS[preset]),animations:ANIMATION_DEFAULTS,appearance:{shirtColor:'#4f8fbf',shortsColor:'#263445',socksColor:'#20252b',hairColor:'#2b2118',skinColor:'#d8a184'},camera:{mode:'arcade',view:'third',distance:6.8,height:2.35,lag:7,fov:62}});
  cfg.preset=preset;return cfg;
}
function createLogic(GAME,owner,source,services){
  const base=window.LK_RUNTIME_CHARACTER_PAWN_BASE,cfg=normalizeConfig(source),pawn=base.create(GAME,owner,cfg,services,{pawnType:'character',ownerKey:'characterPawnId',idPrefix:'character-pawn-'});
  if(!pawn)return null;
  pawn.characterPreset=cfg.preset;
  pawn.setPreset=function(value){const preset=normalizePreset(value);this.characterPreset=preset;this.config.preset=preset;this.setMovement(PRESETS[preset]);return preset;};
  const baseBinding=pawn.applyBinding.bind(pawn);
  pawn.applyBinding=function(path,value){if(String(path||'')==='preset'){this.setPreset(value);return true;}return baseBinding(path,value);};
  return pawn;
}
function install(GAME){if(!GAME)return null;const core=window.LK_RUNTIME_PAWN_CORE&&window.LK_RUNTIME_PAWN_CORE.install(GAME);if(core&&core.components&&!core.components.has('character'))core.components.register('character',options=>createLogic(GAME,options.owner,options.config,options.services));return true;}
window.LK_RUNTIME_CHARACTER_PAWNS=Object.freeze({SCHEMA_VERSION,PRESETS,ANIMATION_DEFAULTS,normalizePreset,normalizeConfig,createLogic,install});
if(window.LOT_KING)install(window.LOT_KING);
})();
