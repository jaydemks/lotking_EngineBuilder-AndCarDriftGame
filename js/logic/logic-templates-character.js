/* =========================================================
   LOT KING - Generic Character Logic Element template
   ========================================================= */
(function(){
'use strict';

function clone(value){ return value == null ? value : JSON.parse(JSON.stringify(value)); }
function node(id,type,x,y,data){ return {id,type,x:x||0,y:y||0,data:Object.assign({},data||{})}; }
function edge(id,fromNode,fromPin,toNode,toPin){ return {id,from:{node:fromNode,pin:fromPin},to:{node:toNode,pin:toPin}}; }
function sceneElement(id,name,primitive,parentId,position,rotation,scale,color){ return {id,name,type:'mesh',primitive,parentId:parentId||'root',linked:true,position:position||[0,0,0],rotation:rotation||[0,0,0],scale:scale||[1,1,1],color:color||'#64748b'}; }

const PRESET_OPTIONS = [
  {value:'normal',label:'Normal (balanced)'},
  {value:'civil',label:'Civil (slower / grounded)'},
  {value:'police',label:'Police (responsive / athletic)'},
];
const BEHAVIOR_PROFILE_OPTIONS = Object.freeze([
  {value:'observer',label:'Observer — scout from cover, then engage'},
  {value:'aggressive',label:'Aggressive — chase and pressure'},
  {value:'tactical',label:'Tactical — bursts, flank and cover'},
  {value:'defensive',label:'Defensive — hold the guard area'},
  {value:'flee',label:'Flee — avoid hostiles'},
  {value:'civilian',label:'Civilian — reacts to danger'},
  {value:'reactive',label:'Reactive — neutral until threatened'},
]);
const BEHAVIOR_REACTION_OPTIONS = Object.freeze([
  {value:'attack',label:'Counterattack'},{value:'cover',label:'Seek cover'},
  {value:'flee',label:'Flee'},{value:'investigate',label:'Investigate'},
  {value:'freeze',label:'Freeze'},{value:'ignore',label:'Ignore'},
]);
// ------------------------------------------------------------ default bodies
// Two bundled mannequins, so a Character Pawn starts as somebody rather than as a
// grey placeholder, and so the choice between them exists at all.
//
// FIT IS PER BODY, NOT SHARED. `fit` normalises a model's LONGEST axis, and a
// T-pose mannequin's longest axis is its arm span, not its height. Measured on the
// bundled files: the male spans 194.685 with a height of 180.473, the female
// 180.923 both ways. A single `fit: 1.8` therefore produced a 1.67 m male beside a
// 1.80 m female. Each fit is derived as `1.8 * longest / height` so both bodies
// stand exactly 1.8 m tall, matching the DollBody mannequin and the collider.
// The catalogue itself lives in `js/runtime/character-bodies.js`: the RUNTIME has
// to resolve a body too, or the Inspector's Body select stays decorative - which
// is exactly what it was while this table was private to the template pack.
// Everything below is a thin alias so this module's public surface is unchanged.
const BODIES = window.LK_RUNTIME_CHARACTER_BODIES;
const BODY_TARGET_HEIGHT = BODIES.TARGET_HEIGHT;
const BODY_TYPES = BODIES.BODIES;
const BODY_TYPE_OPTIONS = BODIES.OPTIONS;
const SHARED_MOTION_DIR = BODIES.SHARED_MOTION_DIR;
const bodyType = BODIES.resolveOrDefault;
const fbxAsset = BODIES.fbxAsset;
const motionAsset = BODIES.motionAsset;
const bodyAsset = BODIES.bodyAsset;
const bodyMotions = BODIES.motions;
const motionAssets = BODIES.motionAssets;

const ANIMATION_SLOTS = [
  ['AnimIdle','idle','Idle','Idle — looping, in-place, no root motion. Neutral standing pose with a stable first/last frame.'],
  ['AnimWalk','walk','Walking','Walk — looping, in-place, no root motion. Forward walk cycle; the controller supplies world translation.'],
  ['AnimRun','run','Running','Run — looping, in-place, no root motion. Forward run/jog cycle matched to Run Speed.'],
  ['AnimStrafeLeft','strafeLeft','Left Strafe','Strafe Left — looping, in-place, no root motion. Optional lateral cycle; Walk is used as fallback.'],
  ['AnimStrafeRight','strafeRight','Right Strafe','Strafe Right — looping, in-place, no root motion. Optional lateral cycle; Walk is used as fallback.'],
  ['AnimJump','jump','Jump','Jump — one-shot, in-place, no root translation. Prefer a complete take-off/air/landing clip; gameplay height comes from Jump Height.'],
  ['AnimFall','fall','Falling Idle','Fall — optional looping in-air pose, in-place and without root motion. Reserved for the expanded airborne state.'],
  ['AnimLand','land','Landing','Land — optional short one-shot, in-place and without root motion. Reserved for landing transitions.'],
  ['AnimLandMoving','landMoving','Falling To Landing','Moving Land — one-shot transition from the airborne pose directly back into a continuing walk/run. The controller supplies translation.'],
  ['AnimInteract','interact','Interact','Interact — optional one-shot in-place action (talk, inspect, press button), without root motion. It must return to the locomotion pose.'],
  // These are played by name by character-abilities.js every time the character
  // rolls, slides, vaults, mantles, climbs, hangs or lands hard. The code asked
  // for them from the start; without a slot here an author had no way to bind a
  // clip to any of them, so they silently fell back to the procedural pose.
  ['AnimRoll','roll','Falling To Roll','Roll — one-shot. Played by the dodge double-tap, by a landing taken at speed, and by the fall-recovery. In-place; the controller carries the character.'],
  ['AnimSlide','slide','','Slide — one-shot. Played when the dodge is used at running speed. In-place; the controller carries the slide.'],
  ['AnimVault','vault','','Vault — one-shot. Played when the character crosses an obstacle between Vault Min and Max Height.'],
  ['AnimVaultBox','vaultBox','','Vault Box Variant — optional one-shot available to the random/condition vault selector.'],
  ['AnimWallFlip','wallFlip','','Wall Flip — one-shot. Played only when sprinting into a tall wall; the root remains fixed.'],
  ['AnimMantle','mantle','','Mantle — one-shot. Played when the character pulls up onto a ledge up to Mantle Max Height.'],
  ['AnimClimb','climb','','Climb — looping. Played while the character is on a climbable surface or a ladder.'],
  ['AnimHang','hang','','Hang — looping. Played while the character holds a ledge before mantling or dropping.'],
  ['AnimLandHeavy','landHeavy','Hard Landing','Land Hard — one-shot. Reserved for a damaging fall survived by the Character; a lethal fall goes directly to death physics / ragdoll.'],
  ['AnimLandCrouch','landCrouch','','Land Crouched — one-shot. Played when the character lands while already crouched.'],
  // Weapon poses on the BODY, so a third-person character shows what it is doing
  // without a separate arms rig in front of the lens. These clips shipped in the
  // shoot pack and nothing referenced them.
  ['AnimAim','aimIdle','Idle Aiming','Aim — looping in-place pose held while the aim button is down. The two-bone weapon-pose layer still points the arms at the target on top of it.'],
  ['AnimAimRifle','aimRifleIdle','Rifle Aiming Idle','Aim (two-handed) — looping in-place pose for a rifle or any weapon held with both hands.'],
  ['AnimFire','fire','Firing Rifle','Fire — one-shot recoil, in-place. Played on the body every shot, so the character visibly fires in third person.'],
  // Optional gait-specific fire takes. The runtime asks for the exact slot and
  // falls back to `fire`, so these can be imported one at a time without ever
  // creating a bind-pose gap. Auto also covers authored burst/multi-shot takes.
  ['AnimFireSingleIdle','fireSingleIdle','','Single Shot (idle) — one-shot upper-body recoil while standing. Falls back to Fire.'],
  ['AnimFireSingleWalk','fireSingleWalk','','Single Shot (walk) — one-shot recoil authored over a walking lower body. Falls back to Fire.'],
  ['AnimFireSingleRun','fireSingleRun','','Single Shot (run) — one-shot recoil authored over a running lower body. Falls back to Fire.'],
  ['AnimFireAutoIdle','fireAutoIdle','','Multi Shot (idle) — recoil cycle for automatic/burst fire while standing. Falls back to Fire.'],
  ['AnimFireAutoWalk','fireAutoWalk','','Multi Shot (walk) — recoil cycle for automatic/burst fire while walking. Falls back to Fire.'],
  ['AnimFireAutoRun','fireAutoRun','','Multi Shot (run) — recoil cycle for automatic/burst fire while running. Falls back to Fire.'],
  ['AnimRunAiming','runAiming','Rifle Run','Run Aiming — looping. Forward run with the weapon up, for moving while aimed.'],
  // Crouch. The four-way crouch walk lives in the locomotion SET; this is the
  // standing-still pose and the aimed variant of it.
  ['AnimCrouchIdle','crouchIdle','Idle Crouching','Crouch Idle — looping in-place pose held while crouched and stationary.'],
  ['AnimCrouchAim','crouchAimIdle','Idle Crouching Aiming','Crouch Aim — looping in-place pose, crouched with the weapon up.'],
  // Cover. character-combat-cover.js moved the body and played no clip at all, so
  // taking cover read as sliding into place. Two of the four shipped takes cannot be
  // read by FBXLoader and are not bound; see character-bodies.js.
  ['AnimCoverEnter','coverHigh','Stand To Cover High','Take Cover — one-shot transition from standing into the cover stance.'],
  // The PREFERRED entry clip: character-combat-cover.js asks for `coverLow` first
  // and falls back to `coverHigh`. It was bound in the catalogue and played by
  // name with no row here, so the one an author would actually want to change was
  // the one they could not see.
  ['AnimCoverEnterLow','coverLow','Enter Cover Low','Take Cover (low) — one-shot transition into a crouched cover stance. Preferred over the high entry when the cover is low.'],
  ['AnimCoverExit','coverToStand','Cover To Stand','Leave Cover — one-shot transition from the cover stance back to standing.'],
  ['AnimCoverSneakLeft','coverSneakLeft','Cover Sneak Left','Cover Shuffle Left — looping. Moving along cover to the character own left.'],
  ['AnimCoverSneakRight','coverSneakRight','Cover Sneak Right','Cover Shuffle Right — looping. Moving along cover to the character own right.'],
  // Death, for a scripted or low-end fall in place of the ragdoll. The two names
  // were assigned by MEASUREMENT and not by source filename: four of the six
  // shipped takes fall forward onto the face, so the pack's own "front"/"back"
  // pair cannot be one, and the single take that ends supine was found by
  // sampling head-versus-hips world position on the last frame. Renaming these
  // back to agree with the filenames would put the character on the wrong side.
  ['AnimDeathFront','deathFront','Death From The Front','Death (front) — one-shot. Hit from the front; the body falls backward onto its back. For a scripted or low-end death in place of the ragdoll.'],
  ['AnimDeathBack','deathBack','Death From Behind','Death (behind) — one-shot. Hit from behind; the body is pushed forward onto its face.'],
  // Melee and the rest of traversal. The slots remain author-rebindable, while
  // character-bodies.js supplies the verified Advanced Animations defaults.
  ['AnimPunch','punch','','Punch — one-shot. Played by the unarmed attack. In-place, thrown from the guard and returning to it.'],
  ['AnimKnifeAttack','knifeAttack','','Knife Attack — one-shot. Played by the melee attack while a blade is equipped. A thrust along the blade, close to the body.'],
  ['AnimHitReact','hitReact','','Hit Reaction — one-shot. Played when the character takes damage and survives it.'],
  ['AnimClimbUp','climbUp','','Climb Up — looping. Played while the character is moving upward on a climbable surface or a ladder.'],
  ['AnimClimbDown','climbDown','','Climb Down — looping. The bundled default plays Climbing To Top in reverse; an author can replace it independently.'],
  ['AnimLedgeShimmyLeft','ledgeShimmyLeft','','Ledge Shimmy Left — looping. Played while the character moves left along a ledge it is hanging from.'],
  ['AnimLedgeShimmyRight','ledgeShimmyRight','','Ledge Shimmy Right — looping. Played while the character moves right along a ledge it is hanging from.'],
];

// Pawn Studio authoring that has graduated from a level-specific adjustment to
// the shared Character contract. Keep this beside the slot catalogue: templates,
// legacy-level migration and Pawn Studio must all see one source of truth.
const PAWN_STUDIO_AUTHORING_DEFAULT_VERSION=3;
const DEFAULT_ROLL_POSE=Object.freeze({
  // The original Pawn Studio value was lost before the available project/demo
  // snapshots. Roll and Slide come from the same authored Character pack; its
  // verified 11.8 cm root baseline also lowers Roll around the body instead of
  // leaving its visible pivot at the standing feet.
  motionTransform:Object.freeze({position:Object.freeze([0,-.118,0]),rotation:Object.freeze([0,0,0])}),
  poseTimeline:Object.freeze({version:1,keyframes:Object.freeze([])}),
});
const DEFAULT_SLIDE_POSE=Object.freeze({
  motionTransform:Object.freeze({position:Object.freeze([0,-.118,0]),rotation:Object.freeze([0,0,0])}),
  poseTimeline:Object.freeze({version:1,keyframes:Object.freeze([
    Object.freeze({time:.04,motionTransform:Object.freeze({position:Object.freeze([0,.019,0]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
    Object.freeze({time:.163,motionTransform:Object.freeze({position:Object.freeze([0,-.527,0]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
    Object.freeze({time:.216,motionTransform:Object.freeze({position:Object.freeze([0,-.632,0]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
    Object.freeze({time:.305,motionTransform:Object.freeze({position:Object.freeze([0,-.639,0]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
    Object.freeze({time:.414,motionTransform:Object.freeze({position:Object.freeze([0,-.58,0]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
    Object.freeze({time:.504,motionTransform:Object.freeze({position:Object.freeze([0,-.543,0]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
    Object.freeze({time:.58,motionTransform:Object.freeze({position:Object.freeze([0,-.406,-.015]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
    Object.freeze({time:.642,motionTransform:Object.freeze({position:Object.freeze([0,-.335,-.015]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
    Object.freeze({time:.646,motionTransform:Object.freeze({position:Object.freeze([0,-.319,-.015]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
    Object.freeze({time:.6522,motionTransform:Object.freeze({position:Object.freeze([0,-.023,-.015]),rotation:Object.freeze([0,0,0])}),rigCorrections:Object.freeze({})}),
  ])}),
});
const DEFAULT_VAULT_POSE=Object.freeze({
  motionTransform:Object.freeze({position:Object.freeze([0,0,0]),rotation:Object.freeze([0,0,0])}),
  poseTimeline:Object.freeze({version:1,keyframes:Object.freeze([])}),
  playbackRate:2,
});
const DEFAULT_WALL_FLIP_POSE=Object.freeze({
  motionTransform:Object.freeze({position:Object.freeze([0,0,0]),rotation:Object.freeze([0,0,0])}),
  poseTimeline:Object.freeze({version:1,keyframes:Object.freeze([])}),
  playbackRate:.65,
});
function defaultActionMotion(bodyId,slot,pose){
  const asset=bodyMotions(bodyId)[slot]||null;
  return {id:'action-slot-'+slot,name:slot,state:'action',action:slot,direction:[0,0],speed:0,speedTolerance:1,asset:asset?clone(asset):null,clip:asset?asset.name:'',loop:false,priority:1,playbackRate:Number(pose.playbackRate)||1,sourceOrientation:'y-up',previewScale:1,motionTransform:clone(pose.motionTransform),rigCorrections:{},poseTimeline:clone(pose.poseTimeline),curveCorrection:{offset:[0,0,0],influence:1,falloff:'smooth-midpoint'}};
}
function zeroVector(value){return !Array.isArray(value)||value.every(number=>Math.abs(Number(number)||0)<.0001);}
function applyPawnStudioAuthoringDefaults(pawn){
  if(!pawn||Number(pawn.pawnStudioAuthoringDefaultVersion||0)>=PAWN_STUDIO_AUTHORING_DEFAULT_VERSION)return false;
  pawn.animationSet=Array.isArray(pawn.animationSet)?pawn.animationSet:[];
  [['roll',DEFAULT_ROLL_POSE],['slide',DEFAULT_SLIDE_POSE],['vault',DEFAULT_VAULT_POSE],['wallFlip',DEFAULT_WALL_FLIP_POSE]].forEach(([slot,pose])=>{
    const existing=pawn.animationSet.find(entry=>entry&&entry.state==='action'&&(entry.action===slot||entry.id==='action-slot-'+slot));
    const legacyBinding=pawn.animations&&pawn.animations[slot],boundAsset=existing&&existing.asset||(legacyBinding&&typeof legacyBinding==='object'&&legacyBinding.asset)||null;
    const bundledOrEmpty=!boundAsset||(BODIES.isBundled&&BODIES.isBundled(boundAsset));
    if(!existing&&bundledOrEmpty)pawn.animationSet.push(defaultActionMotion(pawn.bodyType,slot,pose));
    else if(existing&&bundledOrEmpty){
      const transform=existing.motionTransform||{},timeline=existing.poseTimeline;
      // Only upgrade the untouched zero default. An author's own root keys,
      // offset or imported action remain authoritative even on an older project.
      if(zeroVector(transform.position)&&zeroVector(transform.rotation)&&(!timeline||!Array.isArray(timeline.keyframes)||!timeline.keyframes.length)){
        existing.motionTransform=clone(pose.motionTransform);
        existing.poseTimeline=clone(pose.poseTimeline);
      }
      const oldRate=Number(existing.playbackRate);
      if(pose.playbackRate!=null&&(!Number.isFinite(oldRate)||Math.abs(oldRate-1)<.0001))existing.playbackRate=pose.playbackRate;
    }
  });
  pawn.pawnStudioAuthoringDefaultVersion=PAWN_STUDIO_AUTHORING_DEFAULT_VERSION;
  return true;
}
/** The locomotion state machine's entries, with the bundled clip for `bodyId`.
 *
 *  The assets are not decoration here: `findClip()` matches an entry's clip NAME
 *  against the loaded takes, and every bundled Mixamo take is called `mixamo.com`,
 *  so a name never matches and the single-clip fallback only engages when an asset
 *  is present. Without them the character could roll (a one-shot slot, which did
 *  carry an asset) and could not walk. The clip names below are kept as the labels
 *  an author reads and as the resolution used by a custom multi-clip library. */
function defaultAnimationSet(bodyId){
  return BODIES.applyBodyToAnimationSet(baseAnimationSet(), bodyId).concat(defaultActionMotion(bodyId,'roll',DEFAULT_ROLL_POSE),defaultActionMotion(bodyId,'slide',DEFAULT_SLIDE_POSE),defaultActionMotion(bodyId,'vault',DEFAULT_VAULT_POSE),defaultActionMotion(bodyId,'wallFlip',DEFAULT_WALL_FLIP_POSE));
}
function baseAnimationSet(){
  return [
    {id:'idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,speedTolerance:.65,clip:'Idle',asset:null,loop:true,priority:1},
    {id:'walk-forward',name:'Walk Forward',state:'grounded',direction:[0,1],speed:1.8,speedTolerance:1.5,clip:'Walking',asset:null,loop:true,priority:1},
    {id:'run-forward',name:'Run Forward',state:'grounded',direction:[0,1],speed:5.4,speedTolerance:2.4,clip:'Running',asset:null,loop:true,priority:1},
    // LATERAL. The direction is `[-1, 0]` for the RIGHT strafe, which reads wrong
    // and is not: with forward `+Z` and up `+Y` in a right-handed frame,
    // `right = forward × up = (0,0,1) × (0,1,0) = (-1,0,0)`. The set previously used
    // `[1,0]` for right, so moving right selected the left clip and vice versa -
    // the reported mirror. Forward was unaffected, which is why only the strafes
    // looked wrong.
    {id:'strafe-right',name:'Strafe Right',state:'grounded',direction:[-1,0],speed:1.8,speedTolerance:1.4,clip:'Right Strafe',asset:null,loop:true,priority:1},
    {id:'strafe-left',name:'Strafe Left',state:'grounded',direction:[1,0],speed:1.8,speedTolerance:1.4,clip:'Left Strafe',asset:null,loop:true,priority:1},
    // At running speed the lateral pose is a different clip, not the walk played
    // faster. Without these, holding Shift sideways fell back to the walk strafe.
    {id:'run-strafe-right',name:'Run Strafe Right',state:'grounded',direction:[-1,0],speed:5.4,speedTolerance:2.4,clip:'Right Strafe Run',asset:null,loop:true,priority:1},
    {id:'run-strafe-left',name:'Run Strafe Left',state:'grounded',direction:[1,0],speed:5.4,speedTolerance:2.4,clip:'Left Strafe Run',asset:null,loop:true,priority:1},
    // BACKWARD reuses the forward walk at a negative rate: a reversed walk cycle
    // reads correctly for a short backstep and costs no extra asset.
    {id:'walk-backward',name:'Walk Backward',state:'grounded',direction:[0,-1],speed:1.6,speedTolerance:1.4,clip:'Walking',asset:null,loop:true,priority:1,playbackRate:-1},
    // DIAGONALS, and a real run backward. The ordinary Character only ever had
    // forward, the two strafes and a reversed walk, so moving diagonally blended two
    // cardinal poses and moving backward at speed had nothing at all - the body slid.
    // Only the COMBAT set declared these, and even there they carried a clip name and
    // no asset, so nine of its entries resolved to nothing. The takes exist for both
    // bodies and both gaits, so the plain Character gets them too. Each direction was
    // measured against the clip's own root motion, not taken from its name
    // (scripts/measure-clip-direction.mjs): `walk-forward-left` displaces the hips
    // dx +137 dz +137, and +X is the body's own LEFT.
    {id:'run-backward',name:'Run Backward',state:'grounded',direction:[0,-1],speed:4.8,speedTolerance:2.4,clip:'Run Backward',asset:null,loop:true,priority:1},
    {id:'walk-forward-left',name:'Walk Forward Left',state:'grounded',direction:[.707,.707],speed:1.8,speedTolerance:1.5,clip:'Walk Forward Left',asset:null,loop:true,priority:1},
    {id:'walk-forward-right',name:'Walk Forward Right',state:'grounded',direction:[-.707,.707],speed:1.8,speedTolerance:1.5,clip:'Walk Forward Right',asset:null,loop:true,priority:1},
    {id:'walk-back-left',name:'Walk Backward Left',state:'grounded',direction:[.707,-.707],speed:1.6,speedTolerance:1.5,clip:'Walk Backward Left',asset:null,loop:true,priority:1},
    {id:'walk-back-right',name:'Walk Backward Right',state:'grounded',direction:[-.707,-.707],speed:1.6,speedTolerance:1.5,clip:'Walk Backward Right',asset:null,loop:true,priority:1},
    {id:'run-forward-left',name:'Run Forward Left',state:'grounded',direction:[.707,.707],speed:5.4,speedTolerance:2.4,clip:'Run Forward Left',asset:null,loop:true,priority:1},
    {id:'run-forward-right',name:'Run Forward Right',state:'grounded',direction:[-.707,.707],speed:5.4,speedTolerance:2.4,clip:'Run Forward Right',asset:null,loop:true,priority:1},
    {id:'run-back-left',name:'Run Backward Left',state:'grounded',direction:[.707,-.707],speed:4.8,speedTolerance:2.4,clip:'Run Backward Left',asset:null,loop:true,priority:1},
    {id:'run-back-right',name:'Run Backward Right',state:'grounded',direction:[-.707,-.707],speed:4.8,speedTolerance:2.4,clip:'Run Backward Right',asset:null,loop:true,priority:1},
    {id:'jump-rise',name:'Jump',state:'jump',direction:[0,1],speed:2,speedTolerance:2,clip:'Jump',asset:null,loop:false,priority:1},
    {id:'fall-loop',name:'Fall',state:'fall',direction:[0,1],speed:2,speedTolerance:3,clip:'Falling Idle',asset:null,loop:true,priority:1},
    {id:'landing',name:'Land',state:'land',direction:[0,0],speed:0,speedTolerance:2.2,clip:'Run To Stop',asset:null,loop:false,priority:1},
    // The Soccer Game Pack take the author already uses: return from the fall
    // directly into locomotion instead of playing a stop while input still runs.
    {id:'landing-moving',name:'Moving Land',state:'land',direction:[0,1],speed:5.4,speedTolerance:3,clip:'Falling To Landing',asset:null,loop:false,priority:1.15},
    {id:'interact',name:'Interact',state:'action',action:'interact',direction:[0,0],speed:0,speedTolerance:1,clip:'Interact',asset:null,loop:false,priority:1},
  ];
}

// `bodyId` selects which bundled mannequin the Pawn starts as. Everything else is
// identical, which is the point: the two bodies are DATA, not two hand-written
// templates that can drift apart.
function makeGraph(bodyId){
  const body = bodyType(bodyId);
  const motions = bodyMotions(body.id);
  const variables = [
    {name:'PawnEnabled',type:'boolean',value:true,exposed:true,binding:'enabled',label:'Pawn Enabled',category:'Pawn'},
    {name:'Hidden',type:'boolean',value:false,exposed:true,binding:'hidden',label:'Hidden',category:'Pawn'},
    {name:'ControllerPlayerId',type:'number',value:1,exposed:true,binding:'playerId',label:'Controller Player ID',category:'Input',ui:'player-id'},
    {name:'SpawnX',type:'number',value:0,step:.1,exposed:true,binding:'spawn.x',label:'Spawn X',category:'Pawn / Spawn'},
    {name:'SpawnY',type:'number',value:0,step:.1,exposed:true,binding:'spawn.y',label:'Spawn Y',category:'Pawn / Spawn'},
    {name:'SpawnZ',type:'number',value:8,step:.1,exposed:true,binding:'spawn.z',label:'Spawn Z',category:'Pawn / Spawn'},
    {name:'SpawnHeading',type:'number',value:Math.PI,step:.01,exposed:true,binding:'spawn.heading',label:'Spawn Heading',category:'Pawn / Spawn'},
    {name:'WalkSpeed',type:'number',value:1.8,min:.2,max:8,step:.1,exposed:true,binding:'movement.walkSpeed',label:'Walk Speed (m/s)',category:'Movement'},
    {name:'RunSpeed',type:'number',value:4.8,min:.5,max:14,step:.1,exposed:true,binding:'movement.runSpeed',label:'Run Movement Speed (m/s)',category:'Movement',description:'Physical top speed when Run is pressed. Animation playback is authored separately in Motion Animation Set.'},
    {name:'SprintMultiplier',type:'number',value:1,min:1,max:2.5,step:.05,exposed:true,binding:'movement.sprintMultiplier',label:'Extra Sprint Multiplier',category:'Movement',description:'Optional multiplier over Run Movement Speed. Keep 1 for the authored speed to be the actual top speed.'},
    {name:'Acceleration',type:'number',value:13,min:1,max:80,step:.5,exposed:true,binding:'movement.acceleration',label:'Acceleration',category:'Movement'},
    {name:'TurnRate',type:'number',value:10,min:.5,max:40,step:.5,exposed:true,binding:'movement.turnRate',label:'Turn Rate (rad/s)',category:'Movement'},
    {name:'JumpHeight',type:'number',value:1.05,min:0,max:5,step:.05,exposed:true,binding:'movement.jumpHeight',label:'Jump Height (m)',category:'Movement'},
    {name:'StepHeight',type:'number',value:.55,min:0,max:3,step:.02,exposed:true,binding:'movement.stepHeight',label:'Step Height (m)',category:'Movement'},
    {name:'Gravity',type:'number',value:22,min:1,max:80,step:.5,exposed:true,binding:'movement.gravity',label:'Gravity (m/s²)',category:'Movement'},
    {name:'AirControl',type:'number',value:.32,min:0,max:1,step:.05,exposed:true,binding:'movement.airControl',label:'Air Control',category:'Movement'},
    {name:'VehicleExitRollSpeed',type:'number',value:12,min:0,max:120,step:1,exposed:true,binding:'entry.dismount.rollStartKmh',label:'Vehicle Exit Roll From (km/h)',category:'Vehicle Exit',description:'Below this speed the Character steps out normally. From here to the damage threshold it exits directly into the authored roll.'},
    {name:'VehicleExitDamageSpeed',type:'number',value:25,min:1,max:240,step:1,exposed:true,binding:'entry.dismount.damageStartKmh',label:'Vehicle Exit Damage From (km/h)',category:'Vehicle Exit',description:'Road-vehicle exits above this speed take scalar impact damage and roll if survived.'},
    {name:'VehicleExitLethalSpeed',type:'number',value:80,min:2,max:400,step:1,exposed:true,binding:'entry.dismount.lethalKmh',label:'Vehicle Exit Lethal From (km/h)',category:'Vehicle Exit',description:'At or above this speed a road-vehicle dismount is immediately lethal and enters death physics / ragdoll.'},
    {name:'VehicleExitDamageAtLethal',type:'number',value:100,min:0,max:10000,step:5,exposed:true,binding:'entry.dismount.damageAtLethal',label:'Damage Near Lethal Speed',category:'Vehicle Exit'},
    {name:'InputMode',type:'string',value:'camera',exposed:true,binding:'movement.inputMode',label:'Input Mode',category:'Movement',ui:'select',options:[{value:'camera',label:'Camera relative (recommended)'},{value:'heading',label:'Character heading'}]},
    {name:'FacingMode',type:'string',value:'movement',exposed:true,binding:'movement.facingMode',label:'Facing Mode',category:'Movement',ui:'select',options:[{value:'movement',label:'Face movement direction'},{value:'heading',label:'Preserve character / aim heading'}],description:'Heading-relative input should preserve heading. Camera-relative movement may rotate the body toward travel.'},
    {name:'Preset',type:'string',value:'normal',exposed:true,binding:'preset',label:'Character Preset',category:'Character',ui:'select',options:PRESET_OPTIONS,description:'Starting behavior profile. Applying it sets the baseline movement values; tune individual Movement fields afterward for a custom subtype.'},
    {name:'BlendResponsiveness',type:'number',value:9,min:.5,max:30,step:.5,exposed:true,binding:'locomotion.responsiveness',label:'Motion Blend Responsiveness',category:'Movement / Motion Blend'},
    {name:'BlendPrediction',type:'number',value:.12,min:0,max:.6,step:.01,exposed:true,binding:'locomotion.predictionTime',label:'Motion Blend Prediction (s)',category:'Movement / Motion Blend'},
    {name:'StepPoseStrength',type:'number',value:1,min:0,max:2,step:.05,exposed:true,binding:'locomotion.stepPoseStrength',label:'Stair Pose Strength',category:'Movement / Motion Blend'},
    {name:'CharacterImplementation', type:'string', value:'native', exposed:true, binding:'implementation', label:'Locomotion Backend', category:'Character', ui:'select', options:[{value:'native',label:'Engine character'},{value:'sketchbook',label:'Sketchbook character'}]},
    {name:'MaxHealth',type:'number',value:100,min:1,max:1000,step:5,exposed:true,binding:'vitals.maxHealth',label:'Max Health',category:'Character / Vitals'},
    {name:'MaxArmor',type:'number',value:0,min:0,max:1000,step:5,exposed:true,binding:'vitals.maxArmor',label:'Max Armour',category:'Character / Vitals'},
    {name:'RespawnMode',type:'string',value:'spawn',exposed:true,binding:'vitals.respawnMode',label:'Respawn After Death',category:'Character / Vitals',ui:'select',options:[{value:'spawn',label:'At original spawn (default)'},{value:'none',label:'Never'},{value:'death',label:'At death position'},{value:'random',label:'Random playable position'}]},
    {name:'RespawnDelay',type:'number',value:2.5,min:0,max:60,step:.1,exposed:true,binding:'vitals.respawnDelay',label:'Respawn Delay (s)',category:'Character / Vitals'},
    {name:'RespawnRandomRadius',type:'number',value:35,min:1,max:10000,step:1,exposed:true,binding:'vitals.respawnRandomRadius',label:'Random Spawn Radius (fallback)',category:'Character / Vitals'},
    {name:'DeathPhysicsEnabled',type:'boolean',value:true,exposed:true,binding:'vitals.deathPhysics.enabled',label:'Physical Death / Ragdoll',category:'Character / Vitals'},
    {name:'DeathPhysicsMode',type:'string',value:'auto',exposed:true,binding:'vitals.deathPhysics.mode',label:'Death Physics Mode',category:'Character / Vitals',ui:'select',options:[{value:'auto',label:'Auto — ragdoll or physical fallback'},{value:'ragdoll',label:'Ragdoll'},{value:'rigid',label:'Physical fallback'}]},
    {name:'CameraMode',type:'string',value:'free',exposed:true,binding:'camera.mode',label:'Camera Mode',category:'Camera',ui:'select',options:[{value:'free',label:'Free'},{value:'arcade',label:'Arcade follow'},{value:'cinematic',label:'Cinematic'}]},
    {name:'CameraView',type:'string',value:'third',exposed:true,binding:'camera.view',label:'View',category:'Camera',ui:'select',options:[{value:'third',label:'Third person'},{value:'close',label:'Close third person'},{value:'first',label:'First person (lite)'}]},
    {name:'CameraDistance',type:'number',value:6.8,min:.2,max:40,step:.1,exposed:true,binding:'camera.distance',label:'Distance',category:'Camera'},
    {name:'CameraHeight',type:'number',value:2.35,min:.2,max:20,step:.1,exposed:true,binding:'camera.height',label:'Height',category:'Camera'},
    {name:'CameraLag',type:'number',value:7,min:.1,max:30,step:.1,exposed:true,binding:'camera.lag',label:'Lag',category:'Camera'},
    {name:'CameraFov',type:'number',value:62,min:20,max:130,step:1,exposed:true,binding:'camera.fov',label:'FOV',category:'Camera'},
    // Derived from the body, not written out: these were the MALE hex values in
    // both templates, so the female Pawn carried her palette while the Inspector
    // showed his.
    {name:'ShirtColor',type:'string',value:body.appearance.shirtColor,exposed:true,binding:'appearance.shirtColor',label:'Top Color',category:'Appearance',ui:'color'},
    {name:'PantsColor',type:'string',value:body.appearance.shortsColor,exposed:true,binding:'appearance.shortsColor',label:'Pants Color',category:'Appearance',ui:'color'},
    {name:'HairColor',type:'string',value:body.appearance.hairColor,exposed:true,binding:'appearance.hairColor',label:'Hair Color',category:'Appearance',ui:'color'},
    {name:'SkinColor',type:'string',value:body.appearance.skinColor,exposed:true,binding:'appearance.skinColor',label:'Skin Color',category:'Appearance',ui:'color'},
    {name:'AnimationLibrary',type:'string',value:'',exposed:true,binding:'animationLibrary',ui:'model-asset',label:'Animation Library GLB (clips only)',category:'Animations',description:'Optional clips-only GLB. It must use the same skeleton/bone names as the character model (for example the same Mixamo rig). Locomotion clips should be in-place; do not enable root motion.'},
  ];
  variables.push({name:'BodyType',type:'string',value:body.id,exposed:true,binding:'bodyType',label:'Body',category:'Pawn',
    ui:'select',options:BODY_TYPE_OPTIONS.slice(),
    description:'Which bundled mannequin this Pawn starts as. Both stand 1.8 m tall and share the same actions; each has its own walk, run, strafe and turn cycles. Replacing the Model field with your own rigged GLB or FBX overrides it.'});
  // A slot holds either a plain clip name or `{clip, asset}`. Every bundled motion
  // file exports one take called `mixamo.com`, so the ASSET is what selects the
  // motion and the label is only what the Inspector shows.
  ANIMATION_SLOTS.forEach(([name,slot,value,label]) => {
    const asset = motions[slot] || null;
    variables.push({name,type:'string',
      value:asset ? {clip:value || asset.name, asset} : value,
      exposed:true,binding:'animations.'+slot,label:label.split(' — ')[0]+' Clip',category:'Animations',description:label});
  });
  const graph = {
    version:1,name:'Template - Player Character (Normal)',scope:'element',enabled:true,variables,
    nodes:[
      node('on_start','event.onStart',80,100),node('get_self','pawn.getSelf',330,25),node('get_player','variable.get',330,145,{name:'ControllerPlayerId'}),node('possess','pawn.possess',590,100,{force:false}),node('get_camera','variable.get',580,230,{name:'CameraMode'}),node('camera','pawn.setCamera',850,100,{possess:true}),node('ready','debug.print',1120,100,{message:'Normal Character Pawn ready. WASD move, Shift sprint, Space jump, F interact.',duration:4}),
      node('on_update','event.onUpdate',80,410),node('move_input','character.getMoveInput',340,390),node('set_move','character.setMoveInput',650,410),
    ],
    edges:[
      edge('e_start','on_start','then','possess','exec'),edge('e_self','get_self','pawn','possess','pawn'),edge('e_player','get_player','value','possess','playerId'),edge('e_possess_camera','possess','completed','camera','exec'),edge('e_self_camera','get_self','pawn','camera','pawn'),edge('e_mode','get_camera','value','camera','mode'),edge('e_ready','camera','completed','ready','exec'),
      edge('e_update','on_update','then','set_move','exec'),edge('e_x','move_input','x','set_move','x'),edge('e_z','move_input','z','set_move','z'),edge('e_sprint','move_input','sprint','set_move','sprint'),
    ],
    comments:[
      {id:'movement_help',title:'Generic Character base. Camera-relative input drives movement; the animation graph only supplies in-place poses. Movement, collision and jump remain authoritative in runtime.',x:40,y:35,w:1320,h:510,color:'#38bdf8'},
      {id:'action_help',title:'Mapped Jump and Interact are consumed once by the shared Character controller (Space/F defaults). Extend this graph with semantic Input Action events for civil, police or project-specific actions.',x:40,y:590,w:820,h:340,color:'#fbbf24'},
    ],
  };
  graph.logicScene = {
    root:{id:'root',name:'Player Character Root',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#38bdf8'},
    // The model element carries the chosen body. The procedural placeholder parts
    // stay in the scene behind it: they are what a Pawn falls back to while the
    // FBX is still loading, and what it keeps if an author clears the Model field.
    elements:[Object.assign(
        sceneElement('character_model',body.label,'cube','root',[0,0,0],[0,0,0],[1,1,1],'#334155'),
        {asset:bodyAsset(body.id), linked:true})]
      .concat(window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION?window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION.sceneElements(body.appearance):[]),
    components:[{id:'root_transform',elementId:'root',name:'Transform',type:'transform',linked:true},{id:'pawn_character',elementId:'root',name:'Character Pawn',type:'player-pawn',linked:true},{id:'pawn_collision',elementId:'root',name:'Character Collision',type:'collider',linked:true,collider:{enabled:true,shape:'box',size:[.7,1.9,.7],offset:[0,.95,0]}},{id:'model_render',elementId:'character_model',name:'Imported Model / Placeholder',type:'render',linked:true}],
  };
  graph.characterPawn = {template:true,schemaVersion:2,cameraDefaultVersion:1,movementTuningVersion:1,movementDirectionDefaultVersion:1,playerRespawnDefaultVersion:1,pawnStudioAuthoringDefaultVersion:PAWN_STUDIO_AUTHORING_DEFAULT_VERSION,id:'player-character-'+body.id,preset:'normal',bodyType:body.id,playerId:1,enabled:true,hidden:false,possessed:true,model:bodyAsset(body.id),spawn:{x:0,y:0,z:8,heading:Math.PI},movement:{walkSpeed:1.8,runSpeed:4.8,sprintMultiplier:1,acceleration:13,turnRate:10,jumpHeight:1.05,gravity:22,airControl:.32,stepHeight:.55,inputMode:'camera',facingMode:'movement'},entry:{enabled:true,radius:3,exitOffset:1.65,cooldown:.65,dismount:{rollStartKmh:12,damageStartKmh:25,lethalKmh:80,damageAtLethal:100}},vehicleSeating:window.LK_RUNTIME_VEHICLE_OCCUPANCY&&window.LK_RUNTIME_VEHICLE_OCCUPANCY.defaultCharacterVehicleSeating?window.LK_RUNTIME_VEHICLE_OCCUPANCY.defaultCharacterVehicleSeating():{enabled:true,profiles:{}},animationLibrary:null,animationSet:defaultAnimationSet(body.id),locomotion:{responsiveness:9,predictionTime:.12,stepPoseStrength:1},animations:ANIMATION_SLOTS.reduce((out,item)=>{const asset=motions[item[1]];out[item[1]]=asset?{clip:item[2]||asset.name,asset}:item[2];return out;},{}),cloth:window.LK_RUNTIME_CLOTH?window.LK_RUNTIME_CLOTH.normalizeConfig({}):{enabled:true,backend:'auto',quality:'medium',pieces:[]},appearance:Object.assign({},body.appearance),camera:{mode:'free',view:'third',distance:6.8,height:2.35,lag:7,fov:62},vitals:{enabled:true,maxHealth:100,maxArmor:0,armor:0,armorAbsorb:.6,regen:0,regenDelay:6,respawnMode:'spawn',respawnOnDeath:true,respawnDelay:2.5,respawnRandomRadius:35,team:'player',deathPhysics:{enabled:true,mode:'auto',profile:'humanoid'}}};
  return graph;
}

/** Put an already-built character graph on another bundled body.
 *
 *  `makeGraph(bodyId)` only helps at template-definition time. A LEVEL places a
 *  template and then adjusts it, so it needs the same operation applied after the
 *  fact - and a graph carries the body in four places, not one:
 *
 *    - `characterPawn`      what the runtime spawns
 *    - the model element     what the editor viewport shows
 *    - the `BodyType` var    what the Inspector select displays
 *    - the animation vars    what the Animations category displays
 *
 *  Updating only the Pawn is what makes an Inspector disagree with the scene, so
 *  all four move together here. Authored overrides are preserved by `applyBody`;
 *  this function then copies the RESULT back into the exposed variables, so the
 *  Inspector always shows what the Pawn will really use. */
function applyGraphBody(graph, bodyId){
  if(!graph || !graph.characterPawn) return graph;
  const body = bodyType(bodyId);
  graph.characterPawn = BODIES.applyBody(graph.characterPawn, body.id);
  const pawn = graph.characterPawn;

  const element = graph.logicScene && (graph.logicScene.elements || []).find(item => item && item.id === 'character_model');
  if(element){ element.asset = clone(pawn.model); element.name = body.label; }

  const variables = graph.variables || [];
  const set = (binding, value) => { const found = variables.find(item => item && item.binding === binding); if(found) found.value = value; };
  set('bodyType', body.id);
  // `applyBody` already moved the locomotion set with the slots; mirror it onto the
  // exposed variable if this template exposes one.
  if(Array.isArray(pawn.animationSet)) set('animationSet', clone(pawn.animationSet));
  Object.keys(pawn.animations || {}).forEach(slot => set('animations.' + slot, clone(pawn.animations[slot])));
  Object.keys(pawn.appearance || {}).forEach(key => set('appearance.' + key, pawn.appearance[key]));
  return graph;
}

/* =========================================================
   Third Person Combat character

   The SAME Character Pawn as above with the shared player view rig switched on
   and started over the shoulder. It is not a second kind of character and it
   does not fork the movement, animation or inventory contracts: everything the
   first-person Pawn can do — equip and swap weapons, aim down sights, fire with
   spread / recoil / tracers, reload, throw grenades, land headshots, take and
   deal damage, use the world and carry an inventory — is the same runtime
   reached through the same blocks, seen from behind the shoulder.
   `Camera Mode` swaps eye and shoulder at runtime on this one Pawn.

   HOW THE VARIABLE TABLE IS ORGANISED — the order the player meets them:
     01 Third Person / Camera     where the camera sits and how it moves
     02 Third Person / Aim        look feel and the shoulder swap
     03 Third Person / Feel       camera shake
     04 Combat / Weapon           the weapon in hand
     05 Combat / Weapon Grip      where the arms hold it, aimed and firing
     06 Combat / Survival         health, armour, regeneration
     07 Cover                     what counts as cover and how it is used
     08 Traversal                 crouch, walk, slide, vault, mantle, climb
   ========================================================= */

// One row per exposed control: [name, type, value, binding, label, category, extra].
// Every combat knob the third-person Pawn owns lives in this ONE table, so a new
// control is a row rather than a hand-written variable object somewhere in a
// 200-line literal.
const TPS_COMBAT_VARIABLES = [
  // -- 01 Third Person / Camera
  ['TpsStartView','string','third','firstPerson.view','Start View','Third Person / Camera',{ui:'select',options:[{value:'third',label:'Third person (over the shoulder)'},{value:'first',label:'First person (eye)'}],description:'Which view the Pawn spawns in. Camera Mode swaps them at runtime either way.'}],
  ['TpsAllowViewToggle','boolean',true,'firstPerson.allowViewToggle','Allow First / Third Toggle','Third Person / Camera'],
  ['TpsDistance','number',3.3,'firstPerson.thirdPerson.distance','Camera Distance (m)','Third Person / Camera',{min:.6,max:14,step:.05}],
  ['TpsAutoDistance','boolean',false,'firstPerson.thirdPerson.autoDistance','Automatic ADS / Sprint Distance','Third Person / Camera',{description:'Off keeps the authored or player-wheel distance fixed. On restores the cinematic ADS pull-in and sprint pull-back.'}],
  ['TpsDistanceAds','number',1.9,'firstPerson.thirdPerson.distanceAds','Camera Distance Aiming','Third Person / Camera',{min:.4,max:14,step:.05}],
  ['TpsDistanceSprint','number',4.1,'firstPerson.thirdPerson.distanceSprint','Camera Distance Sprinting','Third Person / Camera',{min:.4,max:16,step:.05}],
  ['TpsHeight','number',1.5,'firstPerson.thirdPerson.height','Pivot Height (m)','Third Person / Camera',{min:.1,max:4,step:.02}],
  ['TpsHeightAds','number',1.58,'firstPerson.thirdPerson.heightAds','Pivot Height Aiming','Third Person / Camera',{min:.1,max:4,step:.02}],
  ['TpsShoulder','number',.62,'firstPerson.thirdPerson.shoulder','Shoulder Offset (m)','Third Person / Camera',{min:-3,max:3,step:.02,description:'Lateral offset that keeps the body out of the aiming line. Positive is the right shoulder.'}],
  ['TpsShoulderAds','number',.48,'firstPerson.thirdPerson.shoulderAds','Shoulder Offset Aiming','Third Person / Camera',{min:-3,max:3,step:.02}],
  ['TpsShoulderSprint','number',.2,'firstPerson.thirdPerson.shoulderSprint','Shoulder Offset Sprinting','Third Person / Camera',{min:-3,max:3,step:.02}],
  ['TpsPivotForward','number',.18,'firstPerson.thirdPerson.pivotForward','Pivot Forward (m)','Third Person / Camera',{min:-2,max:2,step:.02}],
  ['TpsFov','number',68,'firstPerson.thirdPerson.fov','FOV','Third Person / Camera',{min:20,max:130,step:1}],
  ['TpsFovAds','number',52,'firstPerson.thirdPerson.fovAds','FOV Aiming','Third Person / Camera',{min:20,max:130,step:1}],
  ['TpsFocusDistance','number',9,'firstPerson.thirdPerson.focusDistance','Manual Focus Distance (m)','Third Person / Camera',{min:.25,max:200,step:.25}],
  ['TpsNear','number',.1,'firstPerson.thirdPerson.near','Near Clip (m)','Third Person / Camera',{min:.02,max:.5,step:.01}],
  ['TpsFovSpeedGain','number',.9,'firstPerson.thirdPerson.fovSpeedGain','Dynamic FOV Gain','Third Person / Camera',{min:0,max:6,step:.05,description:'Degrees of extra field of view per m/s above walking pace. Zero disables the speed lens.'}],
  ['TpsFovSpeedMax','number',8,'firstPerson.thirdPerson.fovSpeedMax','Dynamic FOV Max','Third Person / Camera',{min:0,max:30,step:.5}],
  ['TpsCollisionMode','string','fixed','firstPerson.thirdPerson.collisionMode','Wall Obstruction','Third Person / Camera',{ui:'select',options:[{value:'fixed',label:'Collision-safe snap (default)'},{value:'pull-in',label:'Pull camera in before walls'}],description:'Fixed preserves framing while clear and snaps only when needed to keep the lens outside geometry. Pull-in adds spring easing.'}],
  ['TpsCollisionRadius','number',.34,'firstPerson.thirdPerson.collisionRadius','Camera Probe Radius','Third Person / Camera',{min:.05,max:2,step:.01,description:'Probe radius used only by Pull camera in and by first-person leaning.'}],
  ['TpsMinimumBodyDistance','number',.55,'firstPerson.thirdPerson.minimumBodyDistance','Minimum Camera / Body Distance','Third Person / Camera',{min:.25,max:1.5,step:.01,description:'Below this arm length the camera uses the safe forward eye point instead of entering the Character mesh.'}],
  ['TpsPullInSpeed','number',40,'firstPerson.thirdPerson.pullInSpeed','Arm Pull-In Speed','Third Person / Camera',{min:1,max:200,step:1}],
  ['TpsPushOutSpeed','number',6,'firstPerson.thirdPerson.pushOutSpeed','Arm Push-Out Speed','Third Person / Camera',{min:.5,max:60,step:.5}],
  ['TpsCameraBlend','number',12,'firstPerson.thirdPerson.blend','Camera Blend Rate','Third Person / Camera',{min:.5,max:40,step:.5}],
  // -- 02 Third Person / Aim
  ['TpsSensitivity','number',1,'firstPerson.sensitivity','Look Sensitivity','Third Person / Aim',{min:.1,max:5,step:.05}],
  ['TpsAdsSensitivityScale','number',.55,'firstPerson.adsSensitivityScale','ADS Sensitivity Scale','Third Person / Aim',{min:.1,max:1,step:.05}],
  ['TpsInvertLookY','boolean',false,'firstPerson.invertY','Invert Look Y','Third Person / Aim'],
  ['TpsPitchMin','number',-80,'firstPerson.pitchMinDeg','Pitch Min (deg)','Third Person / Aim',{min:-89,max:0,step:1}],
  ['TpsPitchMax','number',80,'firstPerson.pitchMaxDeg','Pitch Max (deg)','Third Person / Aim',{min:0,max:89,step:1}],
  ['TpsSwapSpeed','number',11,'firstPerson.thirdPerson.swapSpeed','Shoulder Swap Speed','Third Person / Aim',{min:.5,max:60,step:.5,description:'How fast the camera crosses to the other shoulder. Low values read as a deliberate arc.'}],
  ['TpsEyeHeight','number',1.62,'firstPerson.eyeHeight','Eye Height (m)','Third Person / Aim',{min:.4,max:2.6,step:.01}],
  ['TpsBodyEyeForward','number',.28,'firstPerson.bodyEyeForward','Full-Body Eye Forward (m)','Third Person / Aim',{min:.18,max:.6,step:.01,description:'Camera-only clearance beyond the face, avoiding clipping and overdraw without changing the Character skeleton.'}],
  ['TpsBodyEyeSide','number',0,'firstPerson.bodyEyeSide','Full-Body Eye Side Offset (m)','Third Person / Aim',{min:-.5,max:.5,step:.01}],
  ['TpsLeanOffset','number',.42,'firstPerson.lean.offset','Lean Reach (m)','Third Person / Aim',{min:0,max:1.5,step:.02}],
  ['TpsLeanAngle','number',.26,'firstPerson.lean.angle','Lean Roll (rad)','Third Person / Aim',{min:0,max:1.2,step:.02}],
  // -- 03 Third Person / Feel
  ['TpsShakeEnabled','boolean',true,'firstPerson.shake.enabled','Camera Shake','Third Person / Feel',{description:'Shake moves the camera only. It never moves the bullet: recoil does that.'}],
  ['TpsShakeFire','number',.16,'firstPerson.shake.fire','Shake — Firing','Third Person / Feel',{min:0,max:1,step:.01}],
  ['TpsShakeLand','number',.34,'firstPerson.shake.land','Shake — Hard Landing','Third Person / Feel',{min:0,max:1,step:.01}],
  ['TpsShakeDamage','number',.45,'firstPerson.shake.damage','Shake — Taking Damage','Third Person / Feel',{min:0,max:1,step:.01}],
  ['TpsShakeDecay','number',1.8,'firstPerson.shake.decay','Shake Decay','Third Person / Feel',{min:.1,max:10,step:.1}],
  ['TpsViewBob','boolean',true,'firstPerson.viewBob.enabled','View Bob','Third Person / Feel'],
  // -- 04 Combat / Weapon
  ['TpsWeaponPreset','string','rifle','firstPerson.weapon.preset','Weapon Preset','Combat / Weapon',{ui:'select',options:[{value:'rifle',label:'Assault Rifle (automatic)'},{value:'marksman',label:'Marksman Rifle (semi-automatic)'},{value:'shotgun',label:'Shotgun (spread pellets)'},{value:'smg',label:'SMG'},{value:'pistol',label:'Sidearm'}],description:'Starting weapon profile. It seeds the values below; tune them afterwards for a custom weapon.'}],
  ['TpsWeaponDamage','number',22,'firstPerson.weapon.damage','Damage per Hit','Combat / Weapon',{min:0,max:500,step:1}],
  ['TpsHeadshotMultiplier','number',2,'firstPerson.weapon.headshotMultiplier','Headshot Multiplier','Combat / Weapon',{min:1,max:8,step:.1}],
  ['TpsFireRate','number',9.5,'firstPerson.weapon.fireRate','Fire Rate (shots/s)','Combat / Weapon',{min:.5,max:30,step:.1}],
  ['TpsMagazineSize','number',30,'firstPerson.weapon.magazine','Magazine Size','Combat / Weapon',{min:1,max:200,step:1}],
  ['TpsReserveAmmo','number',180,'firstPerson.weapon.ammoReserve','Reserve Ammo','Combat / Weapon',{min:0,max:5000,step:10}],
  ['TpsReloadTime','number',1.9,'firstPerson.weapon.reloadTime','Reload Time (s)','Combat / Weapon',{min:.1,max:8,step:.1}],
  ['TpsSpreadHip','number',.026,'firstPerson.weapon.spreadHip','Hip Spread','Combat / Weapon',{min:0,max:.3,step:.002}],
  ['TpsSpreadAds','number',.005,'firstPerson.weapon.spreadAds','Aim Spread','Combat / Weapon',{min:0,max:.3,step:.001}],
  ['TpsRecoilPitch','number',.018,'firstPerson.weapon.recoilPitch','Recoil Kick','Combat / Weapon',{min:0,max:.3,step:.002}],
  ['TpsRecoilRecovery','number',8.5,'firstPerson.weapon.recoilRecovery','Recoil Recovery','Combat / Weapon',{min:.5,max:40,step:.5}],
  ['TpsWeaponRange','number',140,'firstPerson.weapon.range','Range (m)','Combat / Weapon',{min:5,max:1000,step:5}],
  // -- 05 Combat / Weapon Grip
  //
  // Where the arms actually go. Every field below is an INHERIT by default: the
  // hand count follows the weapon in hand and a zero vector keeps the built-in
  // offset for its kind, which is what lets one block sit on a loadout that
  // cycles fists, pistol, knife and grenade without forcing the rifle pose onto
  // all four. Vectors are [right, up, forward] metres from the eye, `right`
  // mirrored by the weapon shoulder; rotations are degrees on the hand itself.
  // The bindings are Pawn-level (`weaponGrip.`) and not `firstPerson.weapon.`
  // because the view rig's weapon normalizer would report them handled and drop
  // them - see setWeaponGrip in character-pawn-base.js.
  ['TpsGripHands','string','auto','weaponGrip.hands','Hands On The Weapon','Combat / Weapon Grip',{ui:'select',options:[{value:'auto',label:'Automatic — follow the weapon'},{value:'single',label:'One hand (sidearm)'},{value:'double',label:'Both hands (shouldered)'},{value:'thrown',label:'Thrown — cocked beside the head'},{value:'unarmed',label:'Unarmed — guard and punch'}],description:'Automatic keeps the built-in rule: a sidearm in one hand, fists and throwables in their own poses, everything else shouldered.'}],
  ['TpsGripSupportHand','string','auto','weaponGrip.supportHand','Support Hand','Combat / Weapon Grip',{ui:'select',options:[{value:'auto',label:'Automatic — per weapon kind'},{value:'on',label:'Always on the weapon'},{value:'off',label:'Free (leave the arm swinging)'}],description:'Automatic puts the second hand on a shouldered weapon and on the unarmed guard, and leaves it free for a sidearm or a blade.'}],
  ['TpsGripTrigger','vector3',[0,0,0],'weaponGrip.trigger','Trigger Hand Offset (m)','Combat / Weapon Grip',{description:'Right / up / forward from the eye. Zero inherits the default for the weapon kind (a firearm carries at .15 / -.18 / .40).'}],
  ['TpsGripTriggerRotation','vector3',[0,0,0],'weaponGrip.triggerRotation','Trigger Hand Rotation (deg)','Combat / Weapon Grip',{description:'Roll of the trigger hand around its own axes. Aiming a chain at a point leaves the twist free, so this is the only way to stop a hand holding a rifle sideways.'}],
  ['TpsGripSupport','vector3',[0,0,0],'weaponGrip.support','Support Hand Offset (m)','Combat / Weapon Grip',{description:'Zero lets the view model solve the hand onto the foregrip of the weapon it is really drawing, which is more accurate than any offset. Authoring a value takes that over.'}],
  ['TpsGripSupportRotation','vector3',[0,0,0],'weaponGrip.supportRotation','Support Hand Rotation (deg)','Combat / Weapon Grip'],
  ['TpsGripAimTrigger','vector3',[0,0,0],'weaponGrip.aimTrigger','Aiming — Trigger Hand (m)','Combat / Weapon Grip',{description:'Added while the sights are up, eased in with them. Zero inherits: a firearm follows the weapon .05 back, .09 across and .04 up.'}],
  ['TpsGripAimSupport','vector3',[0,0,0],'weaponGrip.aimSupport','Aiming — Support Hand (m)','Combat / Weapon Grip'],
  ['TpsGripFireTrigger','vector3',[0,0,0],'weaponGrip.fireTrigger','Firing — Trigger Hand (m)','Combat / Weapon Grip',{description:'Added for as long as the shot is on cooldown. Zero inherits: a firearm comes .08 back, a punch reaches .40 forward and a swing .38.'}],
  ['TpsGripFireSupport','vector3',[0,0,0],'weaponGrip.fireSupport','Firing — Support Hand (m)','Combat / Weapon Grip'],
  // -- 06 Combat / Survival
  ['TpsMaxHealth','number',100,'vitals.maxHealth','Max Health','Combat / Survival',{min:1,max:1000,step:5}],
  ['TpsMaxArmor','number',100,'vitals.maxArmor','Max Armour','Combat / Survival',{min:0,max:1000,step:5}],
  ['TpsRegen','number',6,'vitals.regen','Health Regen (hp/s)','Combat / Survival',{min:0,max:100,step:.5}],
  ['TpsRegenDelay','number',6,'vitals.regenDelay','Regen Delay (s)','Combat / Survival',{min:0,max:60,step:.5}],
  ['TpsRespawnMode','string','spawn','vitals.respawnMode','Respawn After Death','Combat / Survival',{ui:'select',options:[{value:'spawn',label:'At original spawn (default)'},{value:'none',label:'Never'},{value:'death',label:'At death position'},{value:'random',label:'Random playable position'}]}],
  // -- 07 Cover
  ['TpsCoverEnabled','boolean',true,'cover.enabled','Cover System','Cover',{description:'Take cover against any solid wall. High cover (1.6 m and up) leans past the edge; low cover (0.85–1.45 m) is crouched behind and popped over.'}],
  ['TpsCoverButton','string','crouch','cover.button','Take Cover Button','Cover',{ui:'select',options:[{value:'crouch',label:'Crouch (contextual — only claimed facing cover)'},{value:'takeCover',label:'Dedicated Take Cover action'},{value:'dodge',label:'Dodge'},{value:'slowWalk',label:'Slow Walk'},{value:'interact',label:'Use'}]}],
  ['TpsCoverReach','number',1.1,'cover.reach','Cover Reach (m)','Cover',{min:.2,max:4,step:.05}],
  ['TpsCoverHug','number',.42,'cover.hugDistance','Wall Hug Distance (m)','Cover',{min:.05,max:2,step:.02}],
  ['TpsCoverSlideSpeed','number',.78,'cover.slideSpeed','Move Along Cover','Cover',{min:.05,max:2,step:.02}],
  ['TpsCoverAutoAttach','boolean',false,'cover.autoAttach','Auto Take Cover While Aiming','Cover'],
  ['TpsCoverAutoShoulder','boolean',true,'cover.autoShoulder','Auto Shoulder At The Edge','Cover'],
  ['TpsCoverExposure','number',1,'cover.fire.exposure','Lean-Out Exposure','Cover',{min:0,max:1,step:.05}],
  ['TpsCoverBlindFire','boolean',true,'cover.fire.blindEnabled','Blind Fire','Cover'],
  ['TpsCoverPopTime','number',.55,'cover.fire.popTime','Low Cover Pop Time (s)','Cover',{min:.05,max:4,step:.05}],
  // -- 08 Traversal
  ['TpsCrouchToggle','boolean',true,'abilities.crouch.toggle','Crouch Is A Toggle','Traversal'],
  ['TpsCrouchSpeedScale','number',.88,'abilities.crouch.speedScale','Crouch Speed Scale','Traversal',{min:.05,max:1,step:.01}],
  ['TpsSlideMinSpeed','number',4.2,'abilities.slide.minSpeed','Slide Minimum Speed','Traversal',{min:.5,max:20,step:.1,description:'Double-tap Dodge above this speed slides; below it, the same gesture rolls.'}],
  ['TpsSlideDuration','number',.85,'abilities.slide.duration','Slide Duration (s)','Traversal',{min:.1,max:4,step:.05}],
  ['TpsRollDistance','number',2.85,'abilities.slide.rollDistance','Roll Travel (m)','Traversal',{min:.1,max:12,step:.05,description:'Total forward distance while the authored roll clip plays. Duration is synchronized to the clip.'}],
  ['TpsRollPlaybackRate','number',1,'abilities.slide.rollPlaybackRate','Roll Animation Speed','Traversal',{min:.25,max:3,step:.05,description:'Playback multiplier for the roll clip. Movement duration follows it automatically while Roll Travel remains the authored distance.'}],
  ['TpsVaultMaxHeight','number',1.25,'abilities.vault.maxHeight','Vault Max Height (m)','Traversal',{min:.2,max:4,step:.05}],
  ['TpsVaultSelection','string','primary','abilities.vault.selectionMode','Vault Animation Selection','Traversal',{ui:'select',options:[{value:'primary',label:'Primary only (Front Flip)'},{value:'random',label:'Random enabled variant'},{value:'conditions',label:'Obstacle height / depth rules'}]}],
  ['TpsVaultDefaultSlot','string','vault','abilities.vault.defaultSlot','Default Vault Slot','Traversal',{ui:'select',options:[{value:'vault',label:'Front Flip Vault'},{value:'vaultBox',label:'Vault Over Box'}]}],
  ['TpsWallFlipEnabled','boolean',true,'abilities.wallFlip.enabled','Running Wall Flip','Traversal'],
  ['TpsWallFlipMinSpeed','number',4.2,'abilities.wallFlip.minSpeed','Wall Flip Minimum Speed','Traversal',{min:.5,max:20,step:.1}],
  ['TpsWallFlipMinHeight','number',1.35,'abilities.wallFlip.minHeight','Wall Flip Minimum Wall Height','Traversal',{min:.5,max:6,step:.05}],
  ['TpsWallFlipReach','number',.72,'abilities.wallFlip.reach','Wall Flip Detection Reach (m)','Traversal',{min:.2,max:2,step:.02}],
  ['TpsWallFlipDuration','number',.72,'abilities.wallFlip.duration','Wall Flip Maximum Duration (s)','Traversal',{min:.2,max:2,step:.01,description:'Fits a long source take into this gameplay window without slowing down an already faster authored take.'}],
  ['TpsWallFlipPlayback','number',1.15,'abilities.wallFlip.playbackRate','Wall Flip Gameplay Playback','Traversal',{min:.25,max:4,step:.05,description:'Multiplier composed with the Wall Flip Motion Set playback rate.'}],
  ['TpsWallFlipLift','number',.72,'abilities.wallFlip.lift','Wall Flip Upward Rebound (m)','Traversal',{min:0,max:3,step:.02}],
  ['TpsWallFlipPushback','number',.62,'abilities.wallFlip.pushback','Wall Flip Pushback (m)','Traversal',{min:0,max:3,step:.02}],
  ['TpsWallFlipSettleDuration','number',.55,'abilities.wallFlip.settleDuration','Wall Flip Walk-to-idle Duration','Traversal',{min:.05,max:2,step:.01}],
  ['TpsWallFlipSettleSpeed','number',.42,'abilities.wallFlip.settleSpeedScale','Wall Flip Walk-to-idle Speed Scale','Traversal',{min:.05,max:1,step:.01}],
  ['TpsMantleMaxHeight','number',2.35,'abilities.mantle.maxHeight','Mantle Max Height (m)','Traversal',{min:.3,max:6,step:.05}],
  ['TpsClimbSpeed','number',2.4,'abilities.climb.speed','Climb Speed (m/s)','Traversal',{min:.2,max:10,step:.1}],
  ['TpsSurfaceAdapt','boolean',true,'abilities.surfaceAdaptation.enabled','Adapt To Surface','Traversal / Contact Adaptation',{description:'Measures the actual obstacle face, top and depth, then motion-warps the root and refines hand/foot contact over the authored traversal clip.'}],
  ['TpsSurfaceIK','number',.82,'abilities.surfaceAdaptation.ikWeight','Hand / Foot IK Weight','Traversal / Contact Adaptation',{min:0,max:1,step:.02}],
  ['TpsRootWarp','number',1,'abilities.surfaceAdaptation.rootWarpWeight','Root Motion Warp Weight','Traversal / Contact Adaptation',{min:0,max:1,step:.02,description:'0 keeps the legacy reach endpoint; 1 aligns travel to the measured near/far edge.'}],
  ['TpsHandSpacing','number',.52,'abilities.surfaceAdaptation.handSpacing','Hand Spacing (m)','Traversal / Contact Adaptation',{min:.1,max:1.4,step:.01}],
  ['TpsFootSpacing','number',.34,'abilities.surfaceAdaptation.footSpacing','Foot Spacing (m)','Traversal / Contact Adaptation',{min:.08,max:1,step:.01}],
  ['TpsSurfaceOffset','number',.035,'abilities.surfaceAdaptation.surfaceOffset','Contact Surface Offset (m)','Traversal / Contact Adaptation',{min:0,max:.25,step:.005}],
  ['TpsHandContactStart','number',.04,'abilities.surfaceAdaptation.handsStart','Hands Contact Phase Start','Traversal / Contact Adaptation',{min:0,max:1,step:.01}],
  ['TpsHandContactEnd','number',.72,'abilities.surfaceAdaptation.handsEnd','Hands Contact Phase End','Traversal / Contact Adaptation',{min:0,max:1,step:.01}],
  ['TpsFootContactStart','number',.26,'abilities.surfaceAdaptation.feetStart','Feet Contact Phase Start','Traversal / Contact Adaptation',{min:0,max:1,step:.01}],
  ['TpsFootContactEnd','number',.94,'abilities.surfaceAdaptation.feetEnd','Feet Contact Phase End','Traversal / Contact Adaptation',{min:0,max:1,step:.01}],
  ['TpsTraversalDebug','boolean',false,'abilities.surfaceAdaptation.debug','Show Probe + IK Dummies (Editor)','Traversal / Contact Adaptation',{description:'Editor and Play-in-Editor only. Shows probe hit/normal, root goal, effectors and joint/pole chains; never appears in standalone gameplay/export.'}],
  ['TpsLandRollSpeed','number',9,'abilities.land.rollSpeed','Landing Roll Threshold (m/s)','Traversal',{min:1,max:60,step:.5,description:'Impact speed above which a landing rolls out instead of planting the feet.'}],
  ['TpsFallDamageSpeed','number',10,'abilities.land.damageSpeed','Fall Damage Threshold (m/s)','Traversal',{min:1,max:60,step:.5,description:'Impact speed above which a non-rolled fall damages the Character and may use Hard Landing if survived.'}],
  ['TpsFallDamageScale','number',8,'abilities.land.damageScale','Fall Damage per Excess m/s','Traversal',{min:0,max:100,step:.5,description:'Health damage for every m/s above the threshold. A lethal impact goes directly to ragdoll.'}],
  ['TpsLandRecovery','number',.32,'abilities.land.recovery','Hard Landing Recovery (s)','Traversal',{min:0,max:2,step:.02}],
];

function tpsCombatVariables(){
  return TPS_COMBAT_VARIABLES.map(row => Object.assign({
    name:row[0], type:row[1], value:row[2], exposed:true, binding:row[3], label:row[4], category:row[5],
  }, row[6] || {}));
}

// Eight-way locomotion. The motion selector blends across an arbitrary direction
// vector, so the eight cardinal + diagonal samples below ARE the blend space a
// third-person shooter needs: the body strafes and back-pedals while the aim
// offset in the placeholder/Motion Set pose keeps the torso on the crosshair.
function combatAnimationSet(bodyId){
  return BODIES.applyBodyToAnimationSet(baseCombatAnimationSet(), bodyId).concat(defaultActionMotion(bodyId,'roll',DEFAULT_ROLL_POSE),defaultActionMotion(bodyId,'slide',DEFAULT_SLIDE_POSE),defaultActionMotion(bodyId,'vault',DEFAULT_VAULT_POSE),defaultActionMotion(bodyId,'wallFlip',DEFAULT_WALL_FLIP_POSE));
}
function baseCombatAnimationSet(){
  const walk = 1.8, run = 5.4, d = Math.SQRT1_2;
  const cardinal = [
    ['forward', [0, 1], 'Walking', 'Running'],
    ['backward', [0, -1], 'Walk Backward', 'Run Backward'],
    // Same right-handed frame as the default set: forward +Z, up +Y, so RIGHT is -X.
    // These were mirrored too, which inverted every lateral and diagonal entry.
    ['left', [1, 0], 'Left Strafe', 'Left Strafe Run'],
    ['right', [-1, 0], 'Right Strafe', 'Right Strafe Run'],
    ['forward-left', [d, d], 'Walk Forward Left', 'Run Forward Left'],
    ['forward-right', [-d, d], 'Walk Forward Right', 'Run Forward Right'],
    ['back-left', [d, -d], 'Walk Backward Left', 'Run Backward Left'],
    ['back-right', [-d, -d], 'Walk Backward Right', 'Run Backward Right'],
  ];
  const entries = [{id:'idle',name:'Idle',state:'grounded',direction:[0,0],speed:0,speedTolerance:.65,clip:'Idle',asset:null,loop:true,priority:1}];
  cardinal.forEach(([id, direction, walkClip, runClip]) => {
    // A straight backstep reuses the forward walk in reverse, same as the default
    // set. Diagonals keep a forward rate: reversing a diagonal reads as a stumble.
    const reverse = direction[1] < -.9 ? -1 : 1;
    entries.push({id:'walk-'+id,name:'Walk '+id,state:'grounded',direction:direction.slice(),speed:walk,speedTolerance:1.5,clip:walkClip,asset:null,loop:true,priority:1,playbackRate:reverse});
    entries.push({id:'run-'+id,name:'Run '+id,state:'grounded',direction:direction.slice(),speed:run,speedTolerance:2.4,clip:runClip,asset:null,loop:true,priority:1});
  });
  entries.push({id:'jump-rise',name:'Jump',state:'jump',direction:[0,1],speed:2,speedTolerance:2,clip:'Jump',asset:null,loop:false,priority:1});
  entries.push({id:'fall-loop',name:'Fall',state:'fall',direction:[0,1],speed:2,speedTolerance:3,clip:'Falling Idle',asset:null,loop:true,priority:1});
  entries.push({id:'landing',name:'Land',state:'land',direction:[0,0],speed:0,speedTolerance:2.2,clip:'Run To Stop',asset:null,loop:false,priority:1});
  entries.push({id:'landing-moving',name:'Moving Land',state:'land',direction:[0,1],speed:5.9,speedTolerance:3,clip:'Falling To Landing',asset:null,loop:false,priority:1.15});
  return entries;
}

function thirdPersonCombatGraph(){
  const g = makeGraph();
  g.name = 'Template - Player Character (Third Person Combat)';
  // The follow camera is never consulted while the rig owns the view, so its
  // controls are replaced rather than left in the inspector as dead sliders.
  g.variables = g.variables.filter(variable => !/^camera\./.test(String(variable.binding || ''))
    && !['vitals.maxHealth','vitals.maxArmor','vitals.respawnMode'].includes(String(variable.binding || '')));
  g.variables = g.variables.concat(tpsCombatVariables());
  // The body follows the VIEW, exactly as the first-person Pawn does, so a
  // strafe stays perpendicular to the crosshair instead of turning into it.
  const inputMode = g.variables.find(variable => variable.binding === 'movement.inputMode');
  if(inputMode){
    inputMode.value = 'heading';
    inputMode.description = 'Combat Pawns keep this on Character heading: the view rig aligns the body with the aim every frame.';
  }
  const setValue = (binding, value) => { const variable = g.variables.find(item => item.binding === binding); if(variable) variable.value = value; };
  setValue('movement.walkSpeed', 3.1);
  setValue('movement.runSpeed', 4.8);
  setValue('movement.sprintMultiplier', 1);
  setValue('movement.turnRate', 22);
  setValue('movement.facingMode', 'heading');

  g.logicScene.root.name = 'Third Person Combat Player Root';
  g.comments = [
    {id:'tps_view',title:'Third Person Combat. ONE Character Pawn, one view rig: over-the-shoulder camera with shoulder swap, spring-arm wall collision, dynamic FOV and trauma shake. Camera Mode swaps eye and shoulder at runtime on this same Pawn.',x:40,y:35,w:1320,h:250,color:'#38bdf8'},
    {id:'tps_combat',title:'Everything the first-person Pawn can do, done here: equip and swap weapons, aim down sights, fire with spread / recoil / tracers, reload, throw grenades, land headshots, take and deal damage, use the world and carry an inventory. The shot is resolved from the CAMERA through the crosshair and then fired from the character, so backing into cover never makes you shoot it.',x:40,y:300,w:1320,h:250,color:'#f472b6'},
    {id:'tps_traversal',title:'Traversal is the shared ability set: crouch, slow walk, slide / roll on a double-tapped Dodge, vault, mantle, ladder climb and ledge hang. Delete the abilities block to get plain walk / run / jump back.',x:40,y:590,w:820,h:340,color:'#fbbf24'},
  ];

  const pawn = g.characterPawn;
  pawn.playerRespawnDefaultVersion = 1;
  pawn.id = 'player-character-third-person-combat';
  pawn.preset = 'normal';
  pawn.animationSet = combatAnimationSet(pawn.bodyType);
  pawn.movement = Object.assign({}, pawn.movement, {
    walkSpeed:3.1, runSpeed:4.8, sprintMultiplier:1, acceleration:18, turnRate:22,
    jumpHeight:1.05, gravity:22, airControl:.4, inputMode:'heading', facingMode:'heading',
  });
  // Kept so turning the rig off still yields a sane generic follow camera.
  pawn.camera = {mode:'free', view:'close', distance:3.4, height:1.9, lag:9, fov:68};
  // ONE rig, started over the shoulder. `preset` resolves through the runtime
  // weapon table at load, so no preset values are duplicated here.
  pawn.firstPerson = {
    enabled:true,
    unifiedBodyCamera:true,
    view:'third',
    allowViewToggle:true,
    eyeHeight:1.62,
    bodyEyeForward:.28,
    bodyEyeSide:0,
    focusDistance:9,
    near:.14,
    cameraSafetyVersion:1,
    pitchMinDeg:-80,
    pitchMaxDeg:80,
    sensitivity:1,
    adsSensitivityScale:.55,
    invertY:false,
    fov:78,
    fovAds:52,
    fovSprint:84,
    // The body is the point of a third-person camera, so it is never culled.
    presentation:'body',
    hideOwnBody:false,
    showLegs:false,
    viewPawn:{schemaVersion:1,kind:'none',enabled:false,showLegs:false},
    weaponSocket:{bone:'', offset:[0, 0, 0], rotation:[0, 0, 0], scale:1, followHandRotation:true, showHelper:false},
    thirdPerson:{
      distance:3.3, distanceAds:1.9, distanceSprint:4.1,
      autoDistance:false, collisionMode:'fixed',
      height:1.5, heightAds:1.58,
      shoulder:.62, shoulderAds:.48, shoulderSprint:.2,
      pivotForward:.18,
      fov:68, fovAds:52, focusDistance:9, near:.1, fovSpeedGain:.9, fovSpeedMax:8,
      collisionRadius:.34, collisionSamples:8, pullInSpeed:40, pushOutSpeed:6,
      minimumBodyDistance:.55,
      swapSpeed:11, blend:12,
    },
    lean:{enabled:true, offset:.42, angle:.26, speed:9, adsScale:1},
    shake:{enabled:true, fire:.16, land:.34, damage:.45, traversal:.22, decay:1.8},
    viewBob:{enabled:true, amplitude:.028, frequency:9.4, sway:.02},
    weapon:{id:'primary', preset:'rifle'},
  };
  // Where the arms hold whatever is in hand, idle, aimed and firing. Authored as
  // a block so it saves and loads with the Pawn; every field is an INHERIT, so
  // this literal is exactly the built-in pose until someone edits it. See
  // GRIP_DEFAULTS in js/runtime/character-weapon-pose.js for the numbers it
  // stands in for.
  pawn.weaponGrip = {
    hands:'auto', supportHand:'auto',
    trigger:[0, 0, 0], triggerRotation:[0, 0, 0],
    support:[0, 0, 0], supportRotation:[0, 0, 0],
    aimTrigger:[0, 0, 0], aimSupport:[0, 0, 0],
    fireTrigger:[0, 0, 0], fireSupport:[0, 0, 0],
  };
  pawn.abilities = {
    enabled:true,
    crouch:{enabled:true, toggle:true, heightScale:.55, speedScale:.88, speedVersion:2},
    walk:{enabled:true, speedScale:.33},
    slide:{enabled:true, minSpeed:4.2, duration:.85, boost:1.35, cooldown:.6, rollDuration:.62, rollSpeed:4.6, rollDistance:2.85, rollPlaybackRate:1},
    vault:{enabled:true, minHeight:.5, maxHeight:1.25, duration:.52, selectionMode:'primary', defaultSlot:'vault', variants:[
      {id:'front-flip',label:'Front Flip Vault',slot:'vault',enabled:true,weight:1,override:false,minHeight:.5,maxHeight:1.25,minDepth:0,maxDepth:4},
      {id:'box-vault',label:'Vault Over Box',slot:'vaultBox',enabled:true,weight:1,override:false,minHeight:.5,maxHeight:1.25,minDepth:.7,maxDepth:4},
    ]},
    wallFlipBehaviorVersion:1,
    wallFlip:{enabled:true,minSpeed:4.2,minHeight:1.35,reach:.72,duration:.72,playbackRate:1.15,lift:.72,pushback:.62,settleDuration:.55,settleSpeedScale:.42},
    mantle:{enabled:true, maxHeight:2.35, duration:.78},
    climb:{enabled:true, speed:2.4, strafe:1.4},
    hang:{enabled:true},
    surfaceAdaptation:{enabled:true,ikWeight:.82,rootWarpWeight:1,handSpacing:.52,footSpacing:.34,surfaceOffset:.035,handHeightOffset:.025,footHeight:.42,handsStart:.04,handsEnd:.72,feetStart:.26,feetEnd:.94,debug:false},
    land:{enabled:true, rollSpeed:9, damageSpeed:10, damageScale:8, minSpeed:1.6, recovery:.32},
  };
  // Cover. Any solid wall is cover; its HEIGHT decides which kind. Crouch is the
  // contextual take-cover button and keeps its ordinary meaning everywhere the
  // character is not facing something to get behind.
  pawn.cover = {
    enabled:true,
    button:'crouch',
    reach:1.1,
    hugDistance:.42,
    toggle:true,
    autoAttach:false,
    slideSpeed:.78,
    blend:12,
    detachThreshold:.6,
    autoShoulder:true,
    fire:{exposure:1, blindEnabled:true, blindSpreadScale:3.2, popTime:.55},
  };
  pawn.vitals = {
    enabled:true, maxHealth:100, maxArmor:100, armorAbsorb:.6,
    regen:6, regenDelay:6, respawnMode:'spawn', respawnOnDeath:true, respawnDelay:2.5, respawnRandomRadius:35, team:'player',
    deathPhysics:{enabled:true,mode:'auto',profile:'humanoid'},
  };
  // What the character SPAWNS with. Everything else is picked up from the world
  // through the same item system the first-person Pawn uses.
  pawn.loadout = [{preset:'fists'}, {preset:'pistol'}, {preset:'knife'}, {preset:'grenade'}];
  pawn.inventory = {mode:'slots', weaponSlots:7, packSize:12, allowDrop:true, autoEquip:true};
  if(window.LK_LOGIC_GRAPH&&window.LK_LOGIC_GRAPH.ensurePawnCameraRigs)window.LK_LOGIC_GRAPH.ensurePawnCameraRigs(g);
  return g;
}

// The ordinary Player Character is the complete player contract.  "Normal"
// describes its body/preset, not a reduced gameplay implementation: weapons,
// items, traversal and the eye/shoulder cameras must remain available in every
// level, including levels authored before the combat template existed.
function defaultPlayerCharacterGraph(bodyId){
  const body=bodyType(bodyId),g=thirdPersonCombatGraph();
  applyGraphBody(g,body.id);
  g.name='Template - Player Character ('+body.label+')';
  g.logicScene.root.name='Player Character Root';
  g.characterPawn.id='player-character-'+body.id;
  g.characterPawn.playerCharacterCombatDefaultVersion=1;
  return g;
}

function mergeMissing(target,defaults){
  if(!target||typeof target!=='object'||!defaults||typeof defaults!=='object')return target;
  Object.keys(defaults).forEach(key=>{
    const value=defaults[key];
    if(target[key]==null){target[key]=clone(value);return;}
    if(!Array.isArray(value)&&value&&typeof value==='object'&&!Array.isArray(target[key]))mergeMissing(target[key],value);
  });
  return target;
}

// One-time upgrade for old saved Normal/Female Player Characters.  It only
// fills capabilities that did not exist in the old descriptor and adds their
// inspector controls; authored models, animation slots and tuned values win.
function upgradeLegacyPlayerCharacterGraph(graph,variableOverrides){
  const pawn=graph&&graph.characterPawn;
  if(!pawn)return false;
  let changed=applyPawnStudioAuthoringDefaults(pawn);
  if(Number(pawn.playerCharacterCombatDefaultVersion||0)>=1)return changed;
  const playerId=Number(pawn.playerId),team=String(pawn.vitals&&pawn.vitals.team||'player').toLowerCase();
  const playerOwned=Number.isFinite(playerId)&&playerId>=1&&team!=='enemy'&&team!=='civilian';
  const identity=String(pawn.id||'').toLowerCase(),graphName=String(graph.name||'').toLowerCase();
  const legacyNormal=/^player-character-(?:male|female)$/.test(identity)||/player character \((?:normal|male|female|mannequin)/.test(graphName);
  if(!playerOwned||!legacyNormal||pawn.behavior)return changed;
  const defaults=defaultPlayerCharacterGraph(pawn.bodyType||'male');
  ['firstPerson','weaponGrip','abilities','cover','loadout','inventory'].forEach(key=>{
    if(pawn[key]==null)pawn[key]=clone(defaults.characterPawn[key]);
    else mergeMissing(pawn[key],defaults.characterPawn[key]);
  });
  mergeMissing(pawn.vitals||(pawn.vitals={}),defaults.characterPawn.vitals);

  const variables=graph.variables||(graph.variables=[]),bindings=new Set(variables.map(item=>item&&item.binding).filter(Boolean));
  const names=new Set(variables.map(item=>item&&item.name).filter(Boolean));
  defaults.variables.forEach(spec=>{
    if(spec.binding&&bindings.has(spec.binding)||names.has(spec.name))return;
    variables.push(clone(spec));
    if(spec.binding)bindings.add(spec.binding);
    names.add(spec.name);
  });

  // The legacy untouched camera-relative pair is incompatible with an armed
  // view rig: aiming would rotate the body while movement reinterpreted the
  // same input from another frame.  Preserve an explicit Inspector override.
  const overrides=variableOverrides||{},input=variables.find(item=>item&&item.binding==='movement.inputMode');
  const facing=variables.find(item=>item&&item.binding==='movement.facingMode');
  const inputAuthored=!!(input&&Object.prototype.hasOwnProperty.call(overrides,input.name));
  const facingAuthored=!!(facing&&Object.prototype.hasOwnProperty.call(overrides,facing.name));
  pawn.movement=pawn.movement||{};
  if(!inputAuthored&&!facingAuthored&&String(pawn.movement.inputMode||'camera')==='camera'&&String(pawn.movement.facingMode||'movement')==='movement'){
    pawn.movement.inputMode='heading';pawn.movement.facingMode='heading';
    if(input)input.value='heading';if(facing)facing.value='heading';
  }
  pawn.playerCharacterCombatDefaultVersion=1;
  return true;
}

function aiBehaviorVariables(defaults){
  const source=Object.assign({profile:'observer',faction:'enemy',hostileFactions:'player',squadId:'',tag:'enemy',sightRange:34,hearingRange:24,memorySeconds:4,fieldOfViewDeg:110,confirmSeconds:2.2,attackRange:30,preferredRange:15,guardRadius:34,coverBias:.94,flankBias:.32,medkits:1,healBelow:.38,healAmount:45,grenades:2,grenadeMinRange:9,grenadeMaxRange:30,grenadeHiddenSeconds:1.25,fearThreshold:.72,onDamage:'cover',onExplosion:'cover',areaEnabled:true,areaShape:'circle',areaRadius:34,areaWidth:68,areaDepth:68,areaHeight:10,areaOffsetX:0,areaOffsetY:0,areaOffsetZ:0,areaAction:'observe',areaExitAction:'return',areaShowInEditor:true},defaults||{});
  return [
    {name:'BehaviorEnabled',type:'boolean',value:true,exposed:true,binding:'behavior.enabled',label:'AI Enabled',category:'AI / Behavior'},
    {name:'BehaviorProfile',type:'string',value:source.profile,exposed:true,binding:'behavior.profile',label:'Behavior Profile',category:'AI / Behavior',ui:'select',options:BEHAVIOR_PROFILE_OPTIONS},
    {name:'Faction',type:'string',value:source.faction,exposed:true,binding:'behavior.faction',label:'Faction',category:'AI / Allegiance'},
    {name:'HostileFactions',type:'string',value:source.hostileFactions,exposed:true,binding:'behavior.hostileFactions',label:'Hostile Factions (comma separated)',category:'AI / Allegiance'},
    {name:'SquadId',type:'string',value:source.squadId,exposed:true,binding:'behavior.squadId',label:'Squad ID',category:'AI / Allegiance'},
    {name:'BehaviorTag',type:'string',value:source.tag,exposed:true,binding:'behavior.tag',label:'Mission Tag',category:'AI / Allegiance'},
    {name:'SightRange',type:'number',value:source.sightRange,min:1,max:250,step:.5,exposed:true,binding:'behavior.perception.sightRange',label:'Sight Range',category:'AI / Perception'},
    {name:'HearingRange',type:'number',value:source.hearingRange,min:0,max:250,step:.5,exposed:true,binding:'behavior.perception.hearingRange',label:'Hearing Range',category:'AI / Perception'},
    {name:'MemorySeconds',type:'number',value:source.memorySeconds,min:0,max:60,step:.1,exposed:true,binding:'behavior.perception.memorySeconds',label:'Target Memory (s)',category:'AI / Perception'},
    {name:'FieldOfViewDeg',type:'number',value:source.fieldOfViewDeg,min:10,max:360,step:1,exposed:true,binding:'behavior.perception.fieldOfViewDeg',label:'Field of View (deg)',category:'AI / Perception'},
    {name:'ConfirmSeconds',type:'number',value:source.confirmSeconds,min:0,max:30,step:.1,exposed:true,binding:'behavior.perception.confirmSeconds',label:'Observe Before Engage (s)',category:'AI / Perception'},
    {name:'AttackRange',type:'number',value:source.attackRange,min:0,max:150,step:.5,exposed:true,binding:'behavior.tactics.attackRange',label:'Attack Range',category:'AI / Tactics'},
    {name:'PreferredRange',type:'number',value:source.preferredRange,min:1,max:100,step:.5,exposed:true,binding:'behavior.tactics.preferredRange',label:'Preferred Range',category:'AI / Tactics'},
    {name:'GuardRadius',type:'number',value:source.guardRadius,min:0,max:500,step:1,exposed:true,binding:'behavior.tactics.guardRadius',label:'Guard Radius',category:'AI / Tactics'},
    {name:'CoverBias',type:'number',value:source.coverBias,min:0,max:1,step:.05,exposed:true,binding:'behavior.tactics.coverBias',label:'Cover Bias',category:'AI / Tactics'},
    {name:'FlankBias',type:'number',value:source.flankBias,min:0,max:1,step:.05,exposed:true,binding:'behavior.tactics.flankBias',label:'Flank Bias',category:'AI / Tactics'},
    {name:'AiMedkits',type:'number',value:source.medkits,min:0,max:20,step:1,exposed:true,binding:'behavior.equipment.medkits',label:'Starting Medkits',category:'AI / Equipment'},
    {name:'AiHealBelow',type:'number',value:source.healBelow,min:.05,max:.95,step:.05,exposed:true,binding:'behavior.equipment.healBelow',label:'Use Medkit Below Health',category:'AI / Equipment'},
    {name:'AiHealAmount',type:'number',value:source.healAmount,min:1,max:1000,step:5,exposed:true,binding:'behavior.equipment.healAmount',label:'Medkit Healing',category:'AI / Equipment'},
    {name:'AiGrenades',type:'number',value:source.grenades,min:0,max:20,step:1,exposed:true,binding:'behavior.equipment.grenades',label:'Starting Grenades',category:'AI / Equipment'},
    {name:'AiGrenadeMinRange',type:'number',value:source.grenadeMinRange,min:1,max:100,step:.5,exposed:true,binding:'behavior.equipment.grenadeMinRange',label:'Grenade Minimum Range',category:'AI / Equipment'},
    {name:'AiGrenadeMaxRange',type:'number',value:source.grenadeMaxRange,min:2,max:200,step:.5,exposed:true,binding:'behavior.equipment.grenadeMaxRange',label:'Grenade Maximum Range',category:'AI / Equipment'},
    {name:'AiGrenadeHiddenSeconds',type:'number',value:source.grenadeHiddenSeconds,min:.25,max:20,step:.1,exposed:true,binding:'behavior.equipment.grenadeHiddenSeconds',label:'Target Hidden Before Grenade (s)',category:'AI / Equipment'},
    {name:'ActionAreaEnabled',type:'boolean',value:source.areaEnabled,exposed:true,binding:'behavior.actionArea.enabled',label:'Smart Action Area',category:'AI / Action Area'},
    {name:'ActionAreaShape',type:'string',value:source.areaShape,exposed:true,binding:'behavior.actionArea.shape',label:'Area Shape',category:'AI / Action Area',ui:'select',options:[{value:'circle',label:'Circle'},{value:'box',label:'Box'}]},
    {name:'ActionAreaRadius',type:'number',value:source.areaRadius,min:1,max:500,step:.5,exposed:true,binding:'behavior.actionArea.radius',label:'Circle Radius',category:'AI / Action Area'},
    {name:'ActionAreaWidth',type:'number',value:source.areaWidth,min:1,max:1000,step:.5,exposed:true,binding:'behavior.actionArea.width',label:'Box Width',category:'AI / Action Area'},
    {name:'ActionAreaDepth',type:'number',value:source.areaDepth,min:1,max:1000,step:.5,exposed:true,binding:'behavior.actionArea.depth',label:'Box Depth',category:'AI / Action Area'},
    {name:'ActionAreaHeight',type:'number',value:source.areaHeight,min:.5,max:250,step:.5,exposed:true,binding:'behavior.actionArea.height',label:'Area Height',category:'AI / Action Area'},
    {name:'ActionAreaOffsetX',type:'number',value:source.areaOffsetX,min:-500,max:500,step:.5,exposed:true,binding:'behavior.actionArea.offset.x',label:'Area Offset X',category:'AI / Action Area'},
    {name:'ActionAreaOffsetY',type:'number',value:source.areaOffsetY,min:-250,max:250,step:.5,exposed:true,binding:'behavior.actionArea.offset.y',label:'Area Offset Y',category:'AI / Action Area'},
    {name:'ActionAreaOffsetZ',type:'number',value:source.areaOffsetZ,min:-500,max:500,step:.5,exposed:true,binding:'behavior.actionArea.offset.z',label:'Area Offset Z',category:'AI / Action Area'},
    {name:'ActionAreaAction',type:'string',value:source.areaAction,exposed:true,binding:'behavior.actionArea.action',label:'When Target Enters',category:'AI / Action Area',ui:'select',options:[{value:'observe',label:'Observe, hide, then engage'},{value:'investigate',label:'Investigate without firing'},{value:'cover',label:'Seek cover, then engage'},{value:'attack',label:'Attack immediately'},{value:'flee',label:'Flee'},{value:'ignore',label:'Ignore'}]},
    {name:'ActionAreaExitAction',type:'string',value:source.areaExitAction,exposed:true,binding:'behavior.actionArea.exitAction',label:'When Target Exits',category:'AI / Action Area',ui:'select',options:[{value:'return',label:'Return to guard origin'},{value:'forget',label:'Forget target'},{value:'search',label:'Search last position'},{value:'hold',label:'Hold position'}]},
    {name:'ActionAreaShowInEditor',type:'boolean',value:source.areaShowInEditor,exposed:true,binding:'behavior.actionArea.showInEditor',label:'Show Area + FOV in Editor',category:'AI / Action Area'},
    {name:'FearThreshold',type:'number',value:source.fearThreshold,min:0,max:1,step:.05,exposed:true,binding:'behavior.fear.threshold',label:'Fear Threshold',category:'AI / Reactions'},
    {name:'DamageReaction',type:'string',value:source.onDamage,exposed:true,binding:'behavior.reactions.onDamage',label:'When Damaged',category:'AI / Reactions',ui:'select',options:BEHAVIOR_REACTION_OPTIONS},
    {name:'ExplosionReaction',type:'string',value:source.onExplosion,exposed:true,binding:'behavior.reactions.onExplosion',label:'On Explosion',category:'AI / Reactions',ui:'select',options:BEHAVIOR_REACTION_OPTIONS},
  ];
}

function aiCharacterGraph(){
  const g=thirdPersonCombatGraph(),pawn=g.characterPawn;
  g.name='Template - AI Character';
  g.variables=g.variables.concat(aiBehaviorVariables());
  g.variables.push(
    {name:'AiSecondaryWeapon',type:'string',value:'pistol',exposed:true,binding:'loadout.0.preset',label:'Secondary Weapon',category:'AI / Equipment',ui:'select',options:[{value:'pistol',label:'Sidearm'},{value:'smg',label:'SMG'},{value:'shotgun',label:'Shotgun'},{value:'marksman',label:'Marksman Rifle'}]},
    {name:'AiMeleeWeapon',type:'string',value:'knife',exposed:true,binding:'loadout.1.preset',label:'Melee / Utility Weapon',category:'AI / Equipment',ui:'select',options:[{value:'knife',label:'Combat Knife'},{value:'bat',label:'Baseball Bat'},{value:'fists',label:'Fists'}]}
  );
  const player=g.variables.find(variable=>variable.binding==='playerId');if(player)player.value=-1;
  g.nodes=[node('on_start','event.onStart',80,100),node('ready','debug.print',360,100,{message:'AI Character ready. Behavior, faction and loadout are editable per instance.',duration:2})];
  g.edges=[edge('ai_ready','on_start','then','ready','exec')];
  g.comments=[{id:'ai_character_help',title:'Reusable AI Character. AI is explicit and independent from Player ID: disabling Behavior leaves an ordinary unpossessed Pawn. Choose profile, factions, squad and weapon per instance.',x:40,y:35,w:1040,h:260,color:'#ef4444'}];
  g.logicScene.root.name='AI Character Root';
  pawn.id='ai-character';pawn.playerId=null;pawn.possessed=false;pawn.faction='enemy';
  pawn.firstPerson=Object.assign({},pawn.firstPerson,{view:'third',allowViewToggle:false,viewPawn:{schemaVersion:1,kind:'none',enabled:false,showLegs:false},weapon:{id:'primary',preset:'rifle'}});
  pawn.combat={enabled:true,weapon:{preset:'rifle'}};
  pawn.behavior={schemaVersion:2,enabled:true,profile:'observer',faction:'enemy',hostileFactions:['player'],squadId:'',squadIndex:0,tag:'enemy',perception:{sightRange:34,hearingRange:24,memorySeconds:4,confirmSeconds:2.2,fieldOfViewDeg:110,requireLineOfSight:true},tactics:{attackRange:30,preferredRange:15,guardRadius:34,coverBias:.94,flankBias:.32,accuracy:.56,burstMin:1,burstMax:3,burstPause:1.15},equipment:{useMedkits:true,medkits:1,healBelow:.38,healAmount:45,useGrenades:true,grenades:2,grenadeMinRange:9,grenadeMaxRange:30,grenadeHiddenSeconds:1.25,grenadeCooldown:8},fear:{enabled:true,threshold:.72,decay:.12},reactions:{onDamage:'cover',onWeaponFired:'investigate',onExplosion:'cover',onCharacterDied:'cover'},actionArea:{enabled:true,shape:'circle',radius:34,width:68,depth:68,height:10,offset:{x:0,y:0,z:0},action:'observe',exitAction:'return',showInEditor:true},patrol:[]};
  pawn.vitals=Object.assign({},pawn.vitals,{team:'enemy',respawnMode:'none',respawnOnDeath:false,deathPhysics:{enabled:true,mode:'auto',profile:'humanoid'}});
  pawn.inventory=Object.assign({mode:'backpack',weaponSlots:7,packSize:12,allowDrop:true,items:[{kind:'health',name:'AI Medkit',amount:45}]},pawn.inventory||{},{mode:'backpack',autoEquip:false});
  pawn.loadout=[{preset:'pistol'},{preset:'knife'},{preset:'grenade'}];
  return g;
}

function talkableNpcGraph(){
  const g=makeGraph();
  g.name='Template - Talkable Civil NPC';
  // The dialogue fields are ADDED to the character ones, not put in their place.
  // Replacing the list dropped the Body select, the animation slots, the movement
  // and the appearance from the Inspector: an NPC is a character, and an author who
  // placed one could configure its two messages and nothing else about it.
  g.variables=g.variables.concat([
    {name:'DialogueRadius',type:'number',value:3.8,min:.5,max:20,step:.1,exposed:true,label:'Interaction Radius',category:'Dialogue'},
    {name:'Message1',type:'string',value:"Let's see... First I'll need to calculate the radius of the bike tire...",exposed:true,label:'First Message',category:'Dialogue'},
    {name:'Message2',type:'string',value:'Sorry, this is a one-file project. I made it for fun in literally 10 to 20 minutes — maybe less — just the time to grab some resources, put them together, and make everything work in a single session with Fable 5. Yes, this is a 4-prompt project. "My guy", the world has changed — and it\'s still changing. With love, Jaydemks.',exposed:true,label:'Second Message',category:'Dialogue'},
    {name:'SecondMessage',type:'boolean',value:false,exposed:false},
  ]);
  g.nodes=[
    node('on_start','event.onStart',60,80),node('start_hint','debug.print',340,80,{message:'Talkable NPC ready. Approach and press F.',duration:3}),
    node('on_interact','event.onPlayerInputActionDown',60,300,{playerId:1,action:'interact'}),node('player_pawn','pawn.getPlayerPawn',310,210,{playerId:1}),node('player_owner','pawn.getOwner',560,210),node('player_position','scene.getPosition',810,210),
    node('npc_owner','scene.getOwner',310,410),node('npc_position','scene.getPosition',560,410),node('distance','vector.distance',1060,300),node('radius','variable.get',1060,450,{name:'DialogueRadius'}),node('near','math.compareNumber',1320,330,{operator:'<='}),node('near_branch','flow.branch',1580,300),
    node('message_state','variable.get',1840,430,{name:'SecondMessage'}),node('message_branch','flow.branch',2100,300),node('message1','variable.get',2100,480,{name:'Message1'}),node('message2','variable.get',2100,600,{name:'Message2'}),node('print1','debug.print',2380,430,{duration:7}),node('print2','debug.print',2380,570,{duration:10}),node('toggle_message','variable.toggleBoolean',2640,500,{name:'SecondMessage'}),
  ];
  g.edges=[
    edge('e_start','on_start','then','start_hint','exec'),edge('e_key','on_interact','then','near_branch','exec'),edge('e_player_owner','player_pawn','pawn','player_owner','pawn'),edge('e_player_pos','player_owner','object','player_position','object'),edge('e_npc_pos','npc_owner','object','npc_position','object'),edge('e_dist_a','player_position','position','distance','a'),edge('e_dist_b','npc_position','position','distance','b'),edge('e_dist_cmp','distance','value','near','a'),edge('e_radius_cmp','radius','value','near','b'),edge('e_near','near','value','near_branch','condition'),edge('e_near_branch','near_branch','true','message_branch','exec'),edge('e_message_state','message_state','value','message_branch','condition'),edge('e_true','message_branch','true','print2','exec'),edge('e_false','message_branch','false','print1','exec'),edge('e_msg1','message1','value','print1','message'),edge('e_msg2','message2','value','print2','message'),edge('e_print1_toggle','print1','completed','toggle_message','exec'),edge('e_print2_toggle','print2','completed','toggle_message','exec'),
  ];
  g.comments=[{id:'dialogue',title:'Reusable proximity dialogue: Player 1 distance + F alternates two editable messages. Replace Print Debug with a project HUD/dialogue widget later.',x:35,y:160,w:2860,h:560,color:'#f59e0b'}];
  g.logicScene.root.name='Talkable Civil NPC Root';
  g.characterPawn.preset='civil';g.characterPawn.playerId=null;g.characterPawn.possessed=false;g.characterPawn.id='talkable-civil-npc';g.characterPawn.movement=Object.assign({},g.characterPawn.movement,{walkSpeed:1.45,runSpeed:4.4});g.characterPawn.vitals=Object.assign({},g.characterPawn.vitals,{team:'civilian',respawnMode:'none',respawnOnDeath:false,deathPhysics:{enabled:true,mode:'auto',profile:'humanoid'}});
  return g;
}
function makeCharacterTemplates(){ return [
  // Stable IDs remain unchanged, but a normal Player Character is now the full
  // FPS-capable contract and starts over the shoulder on the same body.
  {id:'logic-template-player-character-normal',name:'Template - Player Character (Male)',nameIt:'Template - Personaggio Giocante (Uomo)',description:'Complete Player Character on the bundled male mannequin: first/third person on the same body, weapons, items, inventory, traversal, cover, damage, respawn and the full editable animation set.',category:'Pawn / Character',graph:defaultPlayerCharacterGraph('male')},
  {id:'logic-template-player-character-female',name:'Template - Player Character (Female)',nameIt:'Template - Personaggio Giocante (Donna)',description:'The same complete Player Character contract on the bundled female mannequin. Both bodies stand 1.8 m tall and share weapons, items, traversal and eye/shoulder cameras.',category:'Pawn / Character',graph:defaultPlayerCharacterGraph('female')},
  {id:'logic-template-talkable-civil-npc',name:'Template - Talkable Civil NPC',description:'Unpossessed civil Character Pawn with a reusable Player 1 proximity check and two-message F interaction.',category:'Pawn / Character',graph:talkableNpcGraph()},
  {id:'logic-template-player-character-third-person',name:'Template - Player Character (Third Person Combat)',description:'Advanced third-person Character Pawn with full eye-view parity: stable player-controlled camera distance, optional wall spring arm, shoulder swap, dynamic FOV and camera shake, weapon equip and swap, aim down sights, spread/recoil/tracer hitscan, reload, grenades, headshots, health, armour, inventory and shared traversal. Camera Mode moves the same full body and weapon between shoulder and eye views.',category:'Pawn / Character',graph:thirdPersonCombatGraph()},
  {id:'logic-template-ai-character',name:'Template - AI Character',description:'Reusable unpossessed Character Pawn with explicit behavior profile, faction targeting, squad memory, event reactions, independent weapon/loadout, vitals and ragdoll-ready death physics.',category:'Pawn / Character',graph:aiCharacterGraph()},
]; }
if(window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.register) window.LK_LOGIC_TEMPLATES.register(makeCharacterTemplates());
window.LK_LOGIC_TEMPLATES_CHARACTER = Object.freeze({ANIMATION_SLOTS,BODY_TYPES,fbxAsset,motionAsset,motionAssets,BODY_TYPE_OPTIONS,BODY_TARGET_HEIGHT,bodyType,bodyAsset,bodyMotions,applyGraphBody,TPS_COMBAT_VARIABLES,BEHAVIOR_PROFILE_OPTIONS,BEHAVIOR_REACTION_OPTIONS,defaultAnimationSet,combatAnimationSet,tpsCombatVariables,aiBehaviorVariables,makeGraph,makeCharacterTemplates,defaultPlayerCharacterGraph,applyPawnStudioAuthoringDefaults,upgradeLegacyPlayerCharacterGraph,talkableNpcGraph,thirdPersonCombatGraph,aiCharacterGraph});
})();
