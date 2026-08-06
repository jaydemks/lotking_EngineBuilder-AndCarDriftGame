/* =========================================================
   LOT KING — full-body weapon pose layer

   Applies a lightweight two-bone aim correction after the AnimationMixer.
   It is deliberately separate from locomotion: clips continue to own walking,
   running and landing, while the equipped item owns only the two arm chains.
   The correction uses the bones' current world directions, so it works across
   Mixamo/Blender naming and does not assume a particular local bone axis.
   ========================================================= */
(function(){
'use strict';

const cache=new WeakMap();
function key(value){
  return String(value||'').split(/[\\/|:]/).pop()
    .replace(/^(?:mixamorig|armature|skeleton|rig(?!ht))(?:[_\-\s]*\d+)?[_\-\s]*/i,'')
    .replace(/[^a-z0-9]/gi,'').toLowerCase();
}
function choose(entries,side,parts){
  const prefix=side==='left'?'left':'right';
  for(const part of parts){
    const exact=entries.find(entry=>entry.key===prefix+part);
    if(exact)return exact.bone;
  }
  return null;
}
/** A bone in the middle of the body, by preference from the chest downward.
 *
 *  It is not an arm bone and cannot come from `choose`, which prefixes a side. It
 *  is what tells the solver where the ribs are, so a hand target can be kept out
 *  of them. */
function chooseCentre(entries,parts){
  for(const part of parts){
    const exact=entries.find(entry=>entry.key===part);
    if(exact)return exact.bone;
  }
  return null;
}
function classifyBones(root){
  const entries=[];
  if(root&&root.traverse)root.traverse(bone=>{if(bone&&bone.isBone)entries.push({bone,key:key(bone.name)});});
  const fingers=side=>{
    const prefix=side==='left'?'left':'right',result={thumb:[],index:[],middle:[],ring:[],pinky:[]};
    entries.forEach(entry=>{
      const match=new RegExp('^'+prefix+'(?:hand)?(thumb|index|middle|ring|pinky|little)([0-9]*)$').exec(entry.key);
      if(!match)return;const name=match[1]==='little'?'pinky':match[1],order=Number(match[2])||result[name].length+1;
      result[name].push({bone:entry.bone,order});
    });
    Object.keys(result).forEach(name=>{result[name]=result[name].sort((a,b)=>a.order-b.order).map(entry=>entry.bone);});
    return result;
  };
  return {
    right:{upper:choose(entries,'right',['upperarm','arm']),lower:choose(entries,'right',['forearm','lowerarm']),hand:choose(entries,'right',['hand']),fingers:fingers('right')},
    left:{upper:choose(entries,'left',['upperarm','arm']),lower:choose(entries,'left',['forearm','lowerarm']),hand:choose(entries,'left',['hand']),fingers:fingers('left')},
    rightLeg:{upper:choose(entries,'right',['upleg','thigh']),lower:choose(entries,'right',['leg','lowerleg','calf','shin']),hand:choose(entries,'right',['foot','ankle']),toe:choose(entries,'right',['toebase','toe','ball'])},
    leftLeg:{upper:choose(entries,'left',['upleg','thigh']),lower:choose(entries,'left',['leg','lowerleg','calf','shin']),hand:choose(entries,'left',['foot','ankle']),toe:choose(entries,'left',['toebase','toe','ball'])},
    hips:chooseCentre(entries,['hips','pelvis','hip']),
    spine:chooseCentre(entries,['spine','spine0','lowerback']),
    chest:chooseCentre(entries,['spine2','upperchest','chest','spine1']),
    torso:chooseCentre(entries,['spine2','upperchest','chest','spine1','spine']),
    leftShoulder:choose(entries,'left',['shoulder','clavicle','clav']),
    rightShoulder:choose(entries,'right',['shoulder','clavicle','clav']),
    neck:chooseCentre(entries,['neck','neck1','upperneck']),
    head:chooseCentre(entries,['head','head1']),
  };
}
function rig(root){
  let value=cache.get(root);
  if(!value){value=classifyBones(root);cache.set(root,value);}
  return value;
}
function point(THREE,value,target){
  if(!value||!target)return null;
  target.set(Number(value.x)||0,Number(value.y)||0,Number(value.z)||0);
  return target;
}

/* ---------------------------------------------------------------- grip descriptor

   Where a character's hands go used to be four numbers buried in a branch of
   `weaponPose()`, which meant an author could not move a single one of them. It
   is authored DATA now, and this is the only place that knows the defaults.

   Every vector is [right, up, forward] in METRES in the eye frame: `right` is
   mirrored by the weapon side so a left-shoulder character is the same pose in a
   mirror, `up` is world up and `forward` is the sight line. That is exactly the
   frame `worldTarget()` in character-pawn-base.js has always used - these are its
   old literals, moved into a table.

   A ZERO vector reads as "inherit the default for this weapon kind". Zero is not
   a hand position - it is the eye itself - and one Pawn's loadout cycles fists,
   pistol, knife and grenade through ONE authored grip block, so a seeded number
   would force the rifle's pose onto a thrown grenade. Any non-zero component
   takes the whole vector over. `hands` and `supportHand` say `auto` for the same
   reason, rather than pinning a hand count the weapon should decide. */
const HANDS_MODES=Object.freeze(['single','double','thrown','unarmed']);
const GRIP_GAITS=Object.freeze(['idle','walk','run']);
const GRIP_MODES=Object.freeze(['hip','aim']);
const GRIP_SIDES=Object.freeze(['right','left']);
const FINGER_NAMES=Object.freeze(['thumb','index','middle','ring','pinky']);
// `aim` and `fire` for a firearm are derived from fps-view-model.js, which is the
// code that already moves the weapon in these two states: aiming slides the model
// .05 back, .09 across and .04 up (`.48 - .05 * aim` and its neighbours), so the
// hands holding it travel with it; the recoil punch the placeholder animator
// applies is .14 rad on a ~.55 m arm, which is the ~.08 m the hands come back on
// a shot. Without them, aiming and firing moved the weapon and left the arms.
const GRIP_DEFAULTS=Object.freeze({
  // A guard, not an invisible rifle: the striking fist ahead of the chest and the
  // other across it. `fire` is the punch, the old .36 -> .76 forward jump.
  unarmed:{hands:'unarmed',trigger:[.20,-.20,.36],support:[-.20,-.18,.30],supportEnabled:true,
    aim:{trigger:[0,0,0],support:[0,0,0]},fire:{trigger:[0,0,.40],support:[0,0,0]}},
  // Cocked BEHIND the shoulder - negative forward, positive up - with the free
  // hand bracing low across the body until the throw releases it.
  thrown:{hands:'thrown',trigger:[.30,.18,-.08],support:[-.18,-.22,.14],supportEnabled:true,
    aim:{trigger:[0,0,0],support:[0,0,0]},fire:{trigger:[0,0,0],support:[0,0,0]}},
  // One hand on the handle and no second hand: the old melee branch set the
  // support target to null outright. `fire` is the swing, .34 -> .72.
  melee:{hands:'double',trigger:[.22,-.16,.34],support:[-.10,-.22,.62],supportEnabled:false,
    aim:{trigger:[0,0,0],support:[0,0,0]},fire:{trigger:[0,0,.38],support:[0,0,0]}},
  // A sidearm carries identically to a shouldered weapon, because what separates
  // them is the SECOND hand and nothing else.
  sidearm:{hands:'single',trigger:[.15,-.18,.40],support:[-.10,-.22,.62],supportEnabled:false,
    aim:{trigger:[-.09,.04,-.05],support:[-.09,.04,-.05]},fire:{trigger:[0,0,-.08],support:[0,0,-.08]}},
  // The support offset is the fallback for a Pawn with no view model at all, so
  // it is derived from what the view model would have drawn: PROFILES.rifle is a
  // .30 receiver with the foregrip beyond it, carried ahead of the eye. The
  // support hand belongs on the opposite side of the centre line, about .72 m
  // forward and .24 m down. A published foregrip still wins every time.
  shouldered:{hands:'double',trigger:[.15,-.18,.40],support:[-.08,-.24,.72],supportEnabled:true,
    aim:{trigger:[-.09,.04,-.05],support:[-.09,.04,-.05]},fire:{trigger:[0,0,-.08],support:[0,0,-.08]}},
});
function finite(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback;}
/** An authored vector, or null when the author did not author one.
 *
 *  Null and the zero vector are the same answer on purpose (see above), and the
 *  caller uses it to decide between the default and the authored value. */
function authoredTriple(value,limit){
  const list=Array.isArray(value)?value
    :(value&&typeof value==='object'?[value.x,value.y,value.z]:null);
  if(!list)return null;
  const bound=Math.abs(finite(limit,4));
  const out=[0,1,2].map(index=>Math.max(-bound,Math.min(bound,finite(list[index],0))));
  return out[0]||out[1]||out[2]?out:null;
}
function weaponKind(weapon){return String(weapon&&weapon.kind||'firearm').toLowerCase();}
/** The hand count the weapon itself implies, unchanged from the old derivation:
 *  a sidearm is held in one hand and everything else is shouldered. Melee lands
 *  on 'double' because that is what `twoHanded` reported for it, and `twoHanded`
 *  is now nothing more than a mirror of this field. */
function defaultHands(weapon){
  const kind=weaponKind(weapon);
  if(kind==='unarmed')return 'unarmed';
  if(kind==='thrown')return 'thrown';
  return String(weapon&&weapon.preset||'').toLowerCase()==='pistol'?'single':'double';
}
function defaultGrip(weapon,hands){
  const kind=weaponKind(weapon);
  if(GRIP_DEFAULTS[kind])return GRIP_DEFAULTS[kind];
  return hands==='single'?GRIP_DEFAULTS.sidearm:GRIP_DEFAULTS.shouldered;
}
/** One sparse authored source, flattened.
 *
 *  The nested descriptor (`{trigger:{position,rotation}}`) is what a project file
 *  or a weapon definition carries; the flat rows (`{trigger, triggerRotation}`)
 *  are what an Inspector binding writes one field at a time. Both mean the same
 *  thing, so both are accepted here rather than in two normalizers. */
function flattenGrip(source){
  const src=source&&typeof source==='object'?source:{};
  const group=name=>{const value=src[name];return value&&typeof value==='object'&&!Array.isArray(value)?value:null;};
  const trigger=group('trigger'),support=group('support'),aim=group('aim'),fire=group('fire');
  return {
    hands:src.hands,
    supportHand:src.supportHand!==undefined?src.supportHand:(support?support.enabled:undefined),
    trigger:Array.isArray(src.trigger)?src.trigger:(trigger?trigger.position:undefined),
    triggerRotation:src.triggerRotation!==undefined?src.triggerRotation:(trigger?trigger.rotation:undefined),
    support:Array.isArray(src.support)?src.support:(support?support.position:undefined),
    supportRotation:src.supportRotation!==undefined?src.supportRotation:(support?support.rotation:undefined),
    aimTrigger:src.aimTrigger!==undefined?src.aimTrigger:(aim?aim.trigger:undefined),
    aimSupport:src.aimSupport!==undefined?src.aimSupport:(aim?aim.support:undefined),
    fireTrigger:src.fireTrigger!==undefined?src.fireTrigger:(fire?fire.trigger:undefined),
    fireSupport:src.fireSupport!==undefined?src.fireSupport:(fire?fire.support:undefined),
    fingers:src.fingers,
  };
}
function normalizedFingerHand(value){const source=value&&typeof value==='object'?value:{};return FINGER_NAMES.reduce((out,name)=>{out[name]=Math.max(0,Math.min(1,finite(source[name],0)));return out;},{});}
function normalizedFingers(value){const source=value&&typeof value==='object'?value:{};return {trigger:normalizedFingerHand(source.trigger),support:normalizedFingerHand(source.support)};}
/** The normalized grip for the weapon in hand.
 *
 *  `overrides` is a list of sparse authored sources, least specific first: a
 *  Pawn-level block, then whatever the weapon itself declares. `authored` records
 *  which vectors the author actually set, because a caller has to be able to tell
 *  a default apart from a deliberate value - a solved foregrip point already
 *  carries the weapon's own aim shift, and adding the DEFAULT one on top of it
 *  would double the travel. */
function resolveGrip(weapon,overrides){
  const list=(Array.isArray(overrides)?overrides:[overrides]).filter(source=>source&&typeof source==='object');
  const authored={};
  list.forEach(source=>{
    const flat=flattenGrip(source);
    Object.keys(flat).forEach(field=>{if(flat[field]!==undefined&&flat[field]!==null&&flat[field]!=='')authored[field]=flat[field];});
  });
  const wanted=String(authored.hands||'').toLowerCase();
  const hands=HANDS_MODES.indexOf(wanted)>=0?wanted:defaultHands(weapon);
  const entry=defaultGrip(weapon,hands);
  const trigger=authoredTriple(authored.trigger,4);let support=authoredTriple(authored.support,4);
  // v1 wrote the engine fallback into every opened weapon. Both hand targets
  // consequently started on the trigger side even though the support chain is
  // the opposite arm. Migrate only that exact old fallback; a custom grip is
  // never inferred from its sign and remains byte-for-byte authored.
  if(trigger&&support&&[.15,-.18,.40].every((number,index)=>Math.abs(trigger[index]-number)<.0001)&&[.18,-.26,.90].every((number,index)=>Math.abs(support[index]-number)<.0001))support=null;
  const aimTrigger=authoredTriple(authored.aimTrigger,4),aimSupport=authoredTriple(authored.aimSupport,4);
  const fireTrigger=authoredTriple(authored.fireTrigger,4),fireSupport=authoredTriple(authored.fireSupport,4);
  const wantedSupport=String(authored.supportHand==null?'':authored.supportHand).toLowerCase();
  const enabled=wantedSupport==='on'||wantedSupport==='true'?true
    :wantedSupport==='off'||wantedSupport==='false'?false
    :entry.supportEnabled;
  return {
    hands,
    // NEVER a second derivation. Everything that used to ask "is this two
    // handed" now reads the same field the author edits.
    twoHanded:hands==='double',
    trigger:{position:trigger||entry.trigger.slice(),rotation:authoredTriple(authored.triggerRotation,360)||[0,0,0]},
    support:{position:support||entry.support.slice(),rotation:authoredTriple(authored.supportRotation,360)||[0,0,0],enabled},
    aim:{trigger:aimTrigger||entry.aim.trigger.slice(),support:aimSupport||entry.aim.support.slice()},
    fire:{trigger:fireTrigger||entry.fire.trigger.slice(),support:fireSupport||entry.fire.support.slice()},
    fingers:normalizedFingers(authored.fingers),
    authored:{trigger:!!trigger,support:!!support,
      aimTrigger:!!aimTrigger,aimSupport:!!aimSupport,fireTrigger:!!fireTrigger,fireSupport:!!fireSupport},
  };
}
function normalizeGripContext(source){const value=source&&typeof source==='object'?source:{},gait=String(value.gait||'idle').toLowerCase(),side=String(value.side||'right').toLowerCase();return {gait:GRIP_GAITS.includes(gait)?gait:'idle',side:GRIP_SIDES.includes(side)?side:'right',aim:Math.max(0,Math.min(1,finite(value.aim,value.aiming===true?1:0)))};}
function profileEntries(source,mode,context){
  const profiles=source&&source.profiles&&typeof source.profiles==='object'?source.profiles:null;if(!profiles)return[];
  const keys=['any.any.any',mode+'.any.any',mode+'.'+context.gait+'.any',mode+'.'+context.gait+'.'+context.side],out=[];
  keys.forEach(profileKey=>{const value=profiles[profileKey];if(value&&typeof value==='object')out.push(value);});
  const nested=profiles[context.side]&&profiles[context.side][mode]&&profiles[context.side][mode][context.gait];if(nested&&typeof nested==='object'&&!out.includes(nested))out.push(nested);
  return out;
}
function mixTriple(a,b,t){return[0,1,2].map(index=>finite(a&&a[index],0)+(finite(b&&b[index],0)-finite(a&&a[index],0))*t);}
function addTriple(a,b){return[0,1,2].map(index=>finite(a&&a[index],0)+finite(b&&b[index],0));}
function mixFingers(a,b,t){const left=normalizedFingers(a),right=normalizedFingers(b),out={trigger:{},support:{}};['trigger','support'].forEach(hand=>FINGER_NAMES.forEach(name=>{out[hand][name]=left[hand][name]+(right[hand][name]-left[hand][name])*t;}));return out;}
/** Resolve the final hand pose for locomotion, aim amount and weapon side.
 *
 * Profiles are sparse and live on the same grip descriptor as the base hold.
 * With no profile this is byte-for-byte the old hold + ADS additive layer. An
 * exact profile owns the final hold for that state, while hip/aim are blended by
 * the live ADS scalar so crossing the threshold can never snap the skeleton. */
function resolveContextGrip(weapon,overrides,contextSource){
  const sources=(Array.isArray(overrides)?overrides:[overrides]).filter(source=>source&&typeof source==='object'),context=normalizeGripContext(contextSource),base=resolveGrip(weapon,sources);
  const stateGrip=mode=>{const profiles=[];sources.forEach(source=>profiles.push(...profileEntries(source,mode,context)));const found=profiles.length>0,resolved=found?resolveGrip(weapon,sources.concat(profiles)):base;
    return {found,resolved,positionTrigger:found?resolved.trigger.position:addTriple(resolved.trigger.position,mode==='aim'?resolved.aim.trigger:null),positionSupport:found?resolved.support.position:addTriple(resolved.support.position,mode==='aim'?resolved.aim.support:null)};};
  const hip=stateGrip('hip'),aim=stateGrip('aim'),t=context.aim,chosen=t>=.5?aim.resolved:hip.resolved,supportBlend=(hip.resolved.support.enabled?1:0)+((aim.resolved.support.enabled?1:0)-(hip.resolved.support.enabled?1:0))*t;
  return Object.assign({},chosen,{
    trigger:Object.assign({},chosen.trigger,{position:mixTriple(hip.positionTrigger,aim.positionTrigger,t),rotation:mixTriple(hip.resolved.trigger.rotation,aim.resolved.trigger.rotation,t)}),
    support:Object.assign({},chosen.support,{position:mixTriple(hip.positionSupport,aim.positionSupport,t),rotation:mixTriple(hip.resolved.support.rotation,aim.resolved.support.rotation,t),enabled:supportBlend>.001}),
    aim:{trigger:[0,0,0],support:[0,0,0]},
    fire:{trigger:mixTriple(hip.resolved.fire.trigger,aim.resolved.fire.trigger,t),support:mixTriple(hip.resolved.fire.support,aim.resolved.fire.support,t)},
    fingers:mixFingers(hip.resolved.fingers,aim.resolved.fingers,t),
    // A view-model foregrip is already a world-space solved point. Preserve the
    // old authored ADS nudge for that special path when no contextual support
    // profile took ownership of the hand.
    solvedAimSupport:!hip.found&&!aim.found&&base.authored.aimSupport?base.aim.support.map(value=>value*t):[0,0,0],
    supportBlend,
    contextual:{gait:context.gait,side:context.side,aim:t,hipProfile:hip.found,aimProfile:aim.found},
  });
}
function aimBone(THREE,bone,child,target,weight,scratch){
  if(!bone||!child||!target||!bone.parent||!bone.quaternion||
    typeof bone.getWorldPosition!=='function'||typeof child.getWorldPosition!=='function'||
    typeof bone.getWorldQuaternion!=='function'||typeof bone.parent.getWorldQuaternion!=='function')return false;
  bone.getWorldPosition(scratch.a);child.getWorldPosition(scratch.b);
  scratch.current.copy(scratch.b).sub(scratch.a);
  scratch.wanted.copy(target).sub(scratch.a);
  if(scratch.current.lengthSq()<1e-8||scratch.wanted.lengthSq()<1e-8)return false;
  scratch.current.normalize();scratch.wanted.normalize();
  bone.getWorldQuaternion(scratch.world);
  scratch.delta.setFromUnitVectors(scratch.current,scratch.wanted);
  scratch.desired.copy(scratch.delta).multiply(scratch.world).normalize();
  bone.parent.getWorldQuaternion(scratch.parent).invert();
  scratch.local.copy(scratch.parent).multiply(scratch.desired).normalize();
  bone.quaternion.slerp(scratch.local,Math.max(0,Math.min(1,Number(weight)||0)));
  bone.updateWorldMatrix(true,true);
  return true;
}
/* ------------------------------------------------------------- reaching the grip

   The correction above AIMED both arm bones at the hand target, and aiming is not
   arriving: an arm pointed at a grip .40 m away still straightens to its full
   .54 m, so the hand overshoots the grip by the remainder - and once the arm is
   straight it has nowhere left to travel. That is why a punch moved the fist by
   one centimetre and a knife stab by half of one. The guard pose was ALREADY at
   full extension, so the whole strike was swallowed, and the aim and recoil
   layers were lost the same way.

   So the elbow is solved. The two bone lengths and the distance to the target
   give the elbow angle by the law of cosines; the elbow goes on the cone around
   the shoulder-to-target line at that angle; and the two aim steps then land the
   hand exactly on the point - upper arm at the solved elbow, forearm at the
   target. Both steps still work from the bones' CURRENT world directions, so
   nothing here assumes a local bone axis or a rig naming convention, which is the
   property that made the original correction portable in the first place. */

// Never quite lock the arm: at exactly full extension the bend plane is
// undefined, and a solver that reaches it once has no way back.
const REACH_LIMIT=.995;
// A target the arm cannot reach is pulled onto the edge of what it can, which is
// what makes a punch or a stab authored past the character's reach EXTEND rather
// than point at the horizon with a straight arm and go nowhere.
function clampReach(target,shoulder,upperLength,lowerLength,scratch){
  scratch.axis.copy(target).sub(shoulder);
  const distance=scratch.axis.length();
  if(distance<1e-5)return 0;
  scratch.axis.divideScalar(distance);
  const span=upperLength+lowerLength,fold=Math.abs(upperLength-lowerLength)+1e-3;
  const reach=Math.max(fold,Math.min(span*REACH_LIMIT,distance));
  scratch.reach.copy(shoulder).addScaledVector(scratch.axis,reach);
  return reach;
}
/** Which way the elbow bends, as a unit vector perpendicular to the reach axis.
 *
 *  Taken from where the elbow ALREADY is, so a clip that had the elbows out keeps
 *  them out and the solve adds nothing of its own. A straight arm carries no bend
 *  plane at all, and only then is one invented: down and outboard, which is where
 *  a human elbow goes when the hands come up in front of the chest. `outward` is
 *  measured from the rig's own two shoulders, so even the fallback never assumes
 *  which way the model faces. */
function bendAxis(shoulder,elbow,outward,scratch,poleTarget){
  scratch.pole.copy(poleTarget||elbow).sub(shoulder);
  scratch.pole.addScaledVector(scratch.axis,-scratch.pole.dot(scratch.axis));
  if(scratch.pole.lengthSq()<=1e-6)scratch.pole.copy(outward).multiplyScalar(.6).add(scratch.down);
  scratch.pole.addScaledVector(scratch.axis,-scratch.pole.dot(scratch.axis));
  if(scratch.pole.lengthSq()<=1e-8)return null;
  return scratch.pole.normalize();
}
// Half the distance between the shoulders, which is about the torso the arms hang
// off. Derived from the rig so it scales with the character instead of being a
// constant that is right for one body and wrong for every other.
const TORSO_RADIUS_RATIO=.5;
/** Pushes a hand target out of the ribs, and reports whether it had to.
 *
 *  A fist authored - or driven by a recoil layer - into the sternum is not a pose,
 *  it is a hand inside the chest, and the solver below would happily put it there.
 *  Only a target actually inside the sphere is moved, so nothing authored in front
 *  of the body is touched. `away` is the current hand, used only when the target
 *  is exactly on the spine and there is no direction left to push along. */
function pushOutOfTorso(target,centre,radius,away,scratch){
  if(!(radius>1e-4))return false;
  scratch.chord.copy(target).sub(centre);
  const distance=scratch.chord.length();
  if(distance>=radius)return false;
  if(distance<1e-5){
    scratch.chord.copy(away).sub(centre);
    if(scratch.chord.lengthSq()<1e-8)return false;
    scratch.chord.normalize();
  } else scratch.chord.divideScalar(distance);
  target.copy(centre).addScaledVector(scratch.chord,radius);
  return true;
}
function aimArm(THREE,arm,target,weight,scratch,frame,poleTarget){
  if(!arm||!target)return false;
  if(!arm.upper||!arm.lower)return false;
  // Some imported/partially repaired rigs do not expose a hand bone. There is no
  // forearm length to solve with then, so the honest answer is the plain aim the
  // upper arm always had - and never aim a lower bone at itself, which produces a
  // zero-length direction and masks the rig problem.
  if(!arm.hand)return aimBone(THREE,arm.upper,arm.lower,target,weight*.78,scratch);
  if(typeof arm.upper.getWorldPosition!=='function'||typeof arm.lower.getWorldPosition!=='function'||
    typeof arm.hand.getWorldPosition!=='function')return false;
  arm.upper.getWorldPosition(scratch.shoulder);
  arm.lower.getWorldPosition(scratch.elbowNow);
  arm.hand.getWorldPosition(scratch.handNow);
  const upperLength=scratch.shoulder.distanceTo(scratch.elbowNow),lowerLength=scratch.elbowNow.distanceTo(scratch.handNow);
  if(!(upperLength>1e-4)||!(lowerLength>1e-4))return false;
  scratch.want.copy(target);
  if(frame&&frame.torso)pushOutOfTorso(scratch.want,frame.centre,frame.radius,scratch.handNow,scratch);
  const distance=clampReach(scratch.want,scratch.shoulder,upperLength,lowerLength,scratch);
  const axis=distance>0?bendAxis(scratch.shoulder,scratch.elbowNow,frame?frame.outward:scratch.down,scratch,poleTarget):null;
  // With no usable reach axis or bend plane there is nothing to solve; the plain
  // aim is still better than leaving the arm where the clip put it.
  if(!axis)return aimBone(THREE,arm.upper,arm.lower,scratch.want,weight*.78,scratch)||
    aimBone(THREE,arm.lower,arm.hand,scratch.want,weight,scratch);
  const cosine=(upperLength*upperLength+distance*distance-lowerLength*lowerLength)/(2*upperLength*distance);
  const angle=Math.acos(Math.max(-1,Math.min(1,cosine)));
  scratch.elbow.copy(scratch.shoulder)
    .addScaledVector(scratch.axis,Math.cos(angle)*upperLength)
    .addScaledVector(axis,Math.sin(angle)*upperLength);
  // Order matters: the forearm step reads the world direction the upper-arm step
  // has just produced, which is why the elbow is placed first.
  const upper=aimBone(THREE,arm.upper,arm.lower,scratch.elbow,weight,scratch);
  const lower=aimBone(THREE,arm.lower,arm.hand,scratch.reach,weight,scratch);
  return upper||lower;
}
/** The torso sphere and the outboard direction for one arm, measured from the rig.
 *
 *  Recomputed per arm because `outward` is mirrored between them, and per call
 *  because a bound rig's bones are rewritten by the AnimationMixer every frame. */
function armFrame(bones,side,scratch){
  const own=bones[side]&&bones[side].upper,opposite=bones[side==='left'?'right':'left'];
  const other=opposite&&opposite.upper;
  scratch.outward.copy(scratch.down);
  let radius=0;
  if(own&&other&&typeof own.getWorldPosition==='function'&&typeof other.getWorldPosition==='function'){
    own.getWorldPosition(scratch.a);other.getWorldPosition(scratch.b);
    radius=scratch.a.distanceTo(scratch.b)*TORSO_RADIUS_RATIO;
    scratch.outward.copy(scratch.a).sub(scratch.b);
    if(scratch.outward.lengthSq()>1e-8)scratch.outward.normalize();else scratch.outward.copy(scratch.down);
  }
  const torso=bones.torso&&typeof bones.torso.getWorldPosition==='function'?bones.torso:null;
  if(torso)torso.getWorldPosition(scratch.centre);
  return {torso,centre:scratch.centre,radius,outward:scratch.outward};
}
// The roll the grip descriptor authors for a hand, in radians. Aiming a chain at
// a POINT can never produce it: a direction leaves the twist about itself free,
// which is why an otherwise correct hand can hold a rifle sideways.
// The last local wrist delta, including the pose immediately before/after it.
// This distinction matters in two places:
//
//  - a procedural rig calls this layer repeatedly without an AnimationMixer, so
//    the previous delta is still present and must be removed before applying the
//    next one;
//  - a skinned rig (and Pawn Studio) restores/re-writes the clip pose before the
//    next call. Removing the old delta there would apply its inverse to an
//    already-clean wrist, making an authored rotation alternate on/off every
//    frame.
//
// Comparing against `after` tells those cases apart without coupling this
// reusable solver to AnimationMixer or editor state.
const twists=new WeakMap();
const fingerDeltas=new WeakMap();
// A seated solve touches more than the wrists. Keep a reversible frame for every
// affected bone so exiting a vehicle cannot promote its IK result into the next
// on-foot animation's starting pose. The `after` comparison distinguishes a
// procedural rig (our previous result is still present) from an AnimationMixer
// that already wrote a fresh clip pose this frame.
// Key by BONE, not by the Object3D passed by the caller. Before asynchronous
// animation binding a Character poses through its owner root; afterwards the
// same skeleton is reached through locomotionNode. Root-keyed state therefore
// treated the already-seated pose as a fresh baseline and leaked it on exit.
// Bone identity survives that ownership change and is the actual unit modified.
const seatedDeltas=new WeakMap();
function seatedBoneList(bones){
  const list=[bones.hips,bones.spine,bones.chest,bones.torso,bones.leftShoulder,bones.rightShoulder,bones.neck,bones.head];
  [bones.left,bones.right,bones.leftLeg,bones.rightLeg].forEach(chain=>{if(!chain)return;list.push(chain.upper,chain.lower,chain.hand,chain.toe);Object.keys(chain.fingers||{}).forEach(name=>list.push(...(chain.fingers[name]||[])));});
  return list.filter((bone,index,all)=>bone&&bone.quaternion&&all.indexOf(bone)===index);
}
function restoreSeatedDeltas(root,forget,force){
  if(!root)return false;const bones=rig(root);let changed=false;
  seatedBoneList(bones).forEach(bone=>{const record=seatedDeltas.get(bone);if(!record)return;if(bone.quaternion&&record.before&&(force===true||record.after&&bone.quaternion.angleTo(record.after)<1e-5)){bone.quaternion.copy(record.before);changed=true;}if(forget!==false)seatedDeltas.delete(bone);});
  if(changed&&root.updateMatrixWorld)root.updateMatrixWorld(true);return changed;
}
function twistHand(THREE,bone,rotation,weight,scratch){
  if(!bone||!bone.quaternion||!Array.isArray(rotation))return false;
  // Undo only when the old solved quaternion is actually still on the bone.
  // If a mixer/editor already restored `before`, the wrist is clean and must be
  // left alone.
  const previous=twists.get(bone);
  if(previous&&previous.after&&bone.quaternion.angleTo(previous.after)<1e-5)bone.quaternion.copy(previous.before);
  twists.delete(bone);
  const gain=Math.max(0,Math.min(1,Number(weight)||0));
  const x=(Number(rotation[0])||0)*gain,y=(Number(rotation[1])||0)*gain,z=(Number(rotation[2])||0)*gain;
  if(!x&&!y&&!z)return false;
  const before=bone.quaternion.clone();
  scratch.euler.set(x,y,z,'XYZ');
  scratch.twist.setFromEuler(scratch.euler);
  bone.quaternion.multiply(scratch.twist).normalize();
  twists.set(bone,{before,after:bone.quaternion.clone()});
  bone.updateWorldMatrix(true,true);
  return true;
}
function curlFingers(THREE,arm,values,weight,scratch,side){
  if(!arm||!arm.fingers||!values)return false;let changed = false;const mirror=side==='left'?-1:1,gain=Math.max(0,Math.min(1,finite(weight,1)));
  FINGER_NAMES.forEach(name=>{const amount=Math.max(0,Math.min(1,finite(values[name],0)))*gain,chain=arm.fingers[name]||[];chain.forEach((bone,index)=>{
    if(!bone||!bone.quaternion)return;const previous=fingerDeltas.get(bone);if(previous&&previous.after&&bone.quaternion.angleTo(previous.after)<1e-5)bone.quaternion.copy(previous.before);fingerDeltas.delete(bone);if(amount<=.0001)return;
    const before=bone.quaternion.clone(),segment=name==='thumb'?(index===0?.62:.86):(index===0?.72:1),angle=amount*1.18*segment;
    // Mixamo and the common Blender humanoid exports run fingers along local X;
    // local Z is therefore their curl hinge. Thumb opposition also receives a
    // small local Y component so it closes around a handle instead of folding
    // parallel to the palm.
    scratch.euler.set(0,name==='thumb'?angle*.32*mirror:0,angle*mirror,'XYZ');scratch.twist.setFromEuler(scratch.euler);bone.quaternion.multiply(scratch.twist).normalize();fingerDeltas.set(bone,{before,after:bone.quaternion.clone()});changed=true;
  });});
  return changed;
}
function apply(THREE,root,pose,weight,layerWeight){
  if(!THREE||!root||!pose)return false;
  const bones=rig(root),side=Number(pose.side)<0?'left':'right',other=side==='left'?'right':'left';
  const scratch={a:new THREE.Vector3(),b:new THREE.Vector3(),current:new THREE.Vector3(),wanted:new THREE.Vector3(),
    world:new THREE.Quaternion(),delta:new THREE.Quaternion(),desired:new THREE.Quaternion(),parent:new THREE.Quaternion(),
    local:new THREE.Quaternion(),target:new THREE.Vector3(),twist:new THREE.Quaternion(),euler:new THREE.Euler(),
    // The elbow solve's working set. `down` is a constant kept here so the pole
    // fallback allocates nothing per arm.
    shoulder:new THREE.Vector3(),elbowNow:new THREE.Vector3(),handNow:new THREE.Vector3(),
    want:new THREE.Vector3(),reach:new THREE.Vector3(),axis:new THREE.Vector3(),pole:new THREE.Vector3(),
    elbow:new THREE.Vector3(),chord:new THREE.Vector3(),outward:new THREE.Vector3(),centre:new THREE.Vector3(),
    down:new THREE.Vector3(0,-1,0)};
  let changed=false;
  const fallbackTrigger=weight==null?.86:finite(weight,.86),fallbackSupport=weight==null?.82:finite(weight,.82);
  const layer=Math.max(0,Math.min(1,finite(layerWeight,1)));
  const triggerWeight=Math.max(0,Math.min(1,finite(pose.triggerWeight,fallbackTrigger)*layer));
  const supportWeight=Math.max(0,Math.min(1,finite(pose.supportWeight,fallbackSupport)*layer));
  const trigger=point(THREE,pose.triggerTarget,scratch.target);
  if(trigger)changed=aimArm(THREE,bones[side],trigger,triggerWeight,scratch,armFrame(bones,side,scratch))||changed;
  // The twist follows the aim, never precedes it: aimBone works from the bone's
  // CURRENT world direction, so a hand rolled first would be rolled again by the
  // correction that comes after it.
  if(trigger)changed=twistHand(THREE,bones[side].hand,pose.triggerRotation,triggerWeight,scratch)||changed;
  if(trigger)changed=curlFingers(THREE,bones[side],pose.triggerFingers,triggerWeight,scratch,side)||changed;
  const support=point(THREE,pose.supportTarget,scratch.target);
  if(support)changed=aimArm(THREE,bones[other],support,supportWeight,scratch,armFrame(bones,other,scratch))||changed;
  if(support)changed=twistHand(THREE,bones[other].hand,pose.supportRotation,supportWeight,scratch)||changed;
  if(support)changed=curlFingers(THREE,bones[other],pose.supportFingers,supportWeight,scratch,other)||changed;
  return changed;
}

/* -------------------------------------------------------- traversal contact IK

   Traversal publishes named world-space goals after its surface probe.  This is
   deliberately a second entry point over the same portable two-bone solver:
   authored clips keep the whole body, while only the four end effectors converge
   on the measured ledge/wall.  Explicit elbow/knee pole goals keep the bend plane
   stable on straight-limbed source takes, mirroring the Two Bone IK contract used
   by mature animation systems (effector + joint target).
 */
function traversalScratch(THREE){
  return {a:new THREE.Vector3(),b:new THREE.Vector3(),current:new THREE.Vector3(),wanted:new THREE.Vector3(),
    world:new THREE.Quaternion(),delta:new THREE.Quaternion(),desired:new THREE.Quaternion(),parent:new THREE.Quaternion(),
    local:new THREE.Quaternion(),target:new THREE.Vector3(),twist:new THREE.Quaternion(),euler:new THREE.Euler(),
    shoulder:new THREE.Vector3(),elbowNow:new THREE.Vector3(),handNow:new THREE.Vector3(),want:new THREE.Vector3(),
    reach:new THREE.Vector3(),axis:new THREE.Vector3(),pole:new THREE.Vector3(),elbow:new THREE.Vector3(),
    chord:new THREE.Vector3(),outward:new THREE.Vector3(),centre:new THREE.Vector3(),down:new THREE.Vector3(0,-1,0)};
}
function traversalPoint(THREE,value){
  if(!value)return null;
  return new THREE.Vector3(finite(value.x,0),finite(value.y,0),finite(value.z,0));
}
function applyTraversal(THREE,root,goals,layerWeight){
  if(!THREE||!root||!goals)return false;
  const bones=rig(root),scratch=traversalScratch(THREE),layer=Math.max(0,Math.min(1,finite(layerWeight,1)));
  const handWeight=Math.max(0,Math.min(1,finite(goals.handWeight,0)*layer)),exact=goals.exact===true;
  const footWeight=Math.max(0,Math.min(1,finite(goals.footWeight,0)*layer));
  let changed=false;
  const solve=(chain,target,weight,pole,frame)=>{
    if(weight<=.001)return false;
    const end=traversalPoint(THREE,target),joint=traversalPoint(THREE,pole);
    if(!end||!chain||!chain.hand||typeof chain.hand.getWorldPosition!=='function')return !!end&&aimArm(THREE,chain,end,weight,scratch,frame||null,joint);
    // Contact IK refines an authored take; it must not replace the take with an
    // impossible full-body reach. Large probe/rig disagreements are attenuated
    // from the current effector pose, keeping shoulders and hips driven by the
    // clip while the hands/feet still converge on a valid nearby surface.
    chain.hand.getWorldPosition(scratch.current);const error=scratch.current.distanceTo(end),span=(chain.upper&&chain.lower&&chain.upper.getWorldPosition&&chain.lower.getWorldPosition)?(()=>{chain.upper.getWorldPosition(scratch.a);chain.lower.getWorldPosition(scratch.b);const upper=scratch.a.distanceTo(scratch.b);chain.hand.getWorldPosition(scratch.a);return upper+scratch.a.distanceTo(scratch.b);})():.8,ratio=error/Math.max(.1,span),safeWeight=exact?weight:weight/(1+Math.max(0,ratio-.35)*2.8);
    return aimArm(THREE,chain,end,safeWeight,scratch,frame||null,joint);
  };
  changed=solve(bones.left,goals.leftHand,handWeight,goals.leftElbowPole,armFrame(bones,'left',scratch))||changed;
  changed=solve(bones.right,goals.rightHand,handWeight,goals.rightElbowPole,armFrame(bones,'right',scratch))||changed;
  changed=solve(bones.leftLeg,goals.leftFoot,footWeight,goals.leftKneePole,null)||changed;
  changed=solve(bones.rightLeg,goals.rightFoot,footWeight,goals.rightKneePole,null)||changed;
  if(changed&&root.updateMatrixWorld)root.updateMatrixWorld(true);
  return changed;
}

/* A vehicle seat is a persistent full-body contact pose, not a weapon pose and
   not a traversal one-shot.  It nevertheless uses the same rig-independent
   two-bone solve: the authored animation keeps the body alive, while hands,
   feet, head and fingers converge on controls that belong to this vehicle. */
function applySeated(THREE,root,goals,layerWeight){
  if(!THREE||!root||!goals)return false;
  const bones=rig(root),layer=Math.max(0,Math.min(1,finite(layerWeight,1)));
  restoreSeatedDeltas(root,true);
  const records=new Map();seatedBoneList(bones).forEach(bone=>records.set(bone,{before:bone.quaternion.clone(),after:null}));
  const scratch=traversalScratch(THREE),torsoWeight=Math.max(0,Math.min(1,finite(goals.torsoWeight,0)*layer)),shoulderWeight=Math.max(0,Math.min(1,finite(goals.shoulderWeight,0)*layer));let changed=false;
  const bodyAim=(bone,child,target,weight)=>{const point=traversalPoint(THREE,target);return !!(point&&bone&&child&&aimBone(THREE,bone,child,point,weight,scratch));};
  if(torsoWeight>.001){changed=bodyAim(bones.hips,bones.spine||bones.chest,goals.pelvis,torsoWeight)||changed;changed=bodyAim(bones.spine,bones.chest||bones.torso,goals.spine,torsoWeight)||changed;changed=bodyAim(bones.chest||bones.torso,bones.neck||bones.head,goals.chest,torsoWeight)||changed;changed=twistHand(THREE,bones.hips,goals.pelvisRotation,torsoWeight,scratch)||changed;changed=twistHand(THREE,bones.spine,goals.spineRotation,torsoWeight,scratch)||changed;changed=twistHand(THREE,bones.chest||bones.torso,goals.chestRotation,torsoWeight,scratch)||changed;}
  if(shoulderWeight>.001){changed=bodyAim(bones.leftShoulder,bones.left&&bones.left.upper,goals.leftShoulder,shoulderWeight)||changed;changed=bodyAim(bones.rightShoulder,bones.right&&bones.right.upper,goals.rightShoulder,shoulderWeight)||changed;changed=twistHand(THREE,bones.leftShoulder,goals.leftShoulderRotation,shoulderWeight,scratch)||changed;changed=twistHand(THREE,bones.rightShoulder,goals.rightShoulderRotation,shoulderWeight,scratch)||changed;}
  changed=applyTraversal(THREE,root,{
    leftHand:goals.leftHand,rightHand:goals.rightHand,
    leftFoot:goals.leftFoot,rightFoot:goals.rightFoot,
    leftElbowPole:goals.leftElbowPole,rightElbowPole:goals.rightElbowPole,
    leftKneePole:goals.leftKneePole,rightKneePole:goals.rightKneePole,
    handWeight:finite(goals.handWeight,1),footWeight:finite(goals.footWeight,1),exact:true,
  },layer);
  const head=traversalPoint(THREE,goals.head);
  if(head&&bones.neck&&bones.head)changed=aimBone(THREE,bones.neck,bones.head,head,Math.max(0,Math.min(1,finite(goals.headWeight,.65)*layer)),scratch)||changed;
  const fingers=goals.fingers&&typeof goals.fingers==='object'?goals.fingers:{};
  const handWeight=Math.max(0,Math.min(1,finite(goals.handWeight,1)*layer));
  changed=twistHand(THREE,bones.left&&bones.left.hand,goals.leftHandRotation,handWeight,scratch)||changed;
  changed=twistHand(THREE,bones.right&&bones.right.hand,goals.rightHandRotation,handWeight,scratch)||changed;
  const footWeight=Math.max(0,Math.min(1,finite(goals.footWeight,1)*layer)),toeWeight=Math.max(0,Math.min(1,finite(goals.toeWeight,0)*layer));
  changed=twistHand(THREE,bones.leftLeg&&bones.leftLeg.hand,goals.leftFootRotation,footWeight,scratch)||changed;
  changed=twistHand(THREE,bones.rightLeg&&bones.rightLeg.hand,goals.rightFootRotation,footWeight,scratch)||changed;
  if(toeWeight>.001){changed=bodyAim(bones.leftLeg&&bones.leftLeg.hand,bones.leftLeg&&bones.leftLeg.toe,goals.leftToe,toeWeight)||changed;changed=bodyAim(bones.rightLeg&&bones.rightLeg.hand,bones.rightLeg&&bones.rightLeg.toe,goals.rightToe,toeWeight)||changed;changed=twistHand(THREE,bones.leftLeg&&bones.leftLeg.toe,goals.leftToeRotation,toeWeight,scratch)||changed;changed=twistHand(THREE,bones.rightLeg&&bones.rightLeg.toe,goals.rightToeRotation,toeWeight,scratch)||changed;}
  changed=curlFingers(THREE,bones.left,fingers.left,handWeight,scratch,'left')||changed;
  changed=curlFingers(THREE,bones.right,fingers.right,handWeight,scratch,'right')||changed;
  records.forEach((record,bone)=>{record.after=bone.quaternion.clone();seatedDeltas.set(bone,record);});
  if(changed&&root.updateMatrixWorld)root.updateMatrixWorld(true);
  return changed;
}

// Release persistent wrist/finger deltas at ownership boundaries (vehicle exit,
// unequip, Pawn disposal). AnimationMixer normally overwrites them next frame;
// this explicit path prevents the one visible frame in which an old grip points
// at a camera/vehicle target that no longer owns the Character.
function release(root){
  if(!root)return false;const bones=rig(root);let changed=restoreSeatedDeltas(root,true,true);
  [bones.left,bones.right].forEach(arm=>{
    const hand=arm&&arm.hand,twist=hand&&twists.get(hand);
    if(twist&&twist.after&&hand.quaternion&&hand.quaternion.angleTo(twist.after)<1e-5){hand.quaternion.copy(twist.before);changed=true;}
    if(hand)twists.delete(hand);
    Object.keys(arm&&arm.fingers||{}).forEach(name=>(arm.fingers[name]||[]).forEach(bone=>{const delta=fingerDeltas.get(bone);if(delta&&delta.after&&bone.quaternion&&bone.quaternion.angleTo(delta.after)<1e-5){bone.quaternion.copy(delta.before);changed=true;}fingerDeltas.delete(bone);}));
  });
  if(changed&&root.updateMatrixWorld)root.updateMatrixWorld(true);return changed;
}

window.LK_RUNTIME_CHARACTER_WEAPON_POSE=Object.freeze({apply,classifyBones,key,
  applyTraversal,applySeated,release,resolveGrip,resolveContextGrip,normalizeGripContext,normalizedFingers,defaultHands,HANDS_MODES,GRIP_GAITS,GRIP_MODES,GRIP_SIDES,FINGER_NAMES,GRIP_DEFAULTS});
})();
