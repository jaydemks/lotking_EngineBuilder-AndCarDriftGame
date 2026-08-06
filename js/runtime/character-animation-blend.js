/* =========================================================
   LOT KING - Character skeletal transition policy
   Shared by imported AnimationMixer rigs and the procedural
   placeholder body. It turns full-body one-shots into phased
   skeletal crossfades instead of hiding locomotion until the
   action's final frame.
   ========================================================= */
(function(root){
'use strict';

function finite(value, fallback){
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp01(value){ return Math.max(0, Math.min(1, finite(value, 0))); }
function normalizeSlot(value){ return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function smoothstep(edge0, edge1, value){
  const range = Math.max(.0001, finite(edge1, 1) - finite(edge0, 0));
  const t = clamp01((finite(value, 0) - finite(edge0, 0)) / range);
  return t * t * (3 - 2 * t);
}

const MOVING_LANDINGS = new Set(['landmoving','fallingtolanding','runtoland','runtolanding']);
const LANDINGS = new Set(['land','landing','landmoving','landcrouch','landheavy','hardlanding','fallingtolanding','runtoland','runtolanding']);
const TRANSITIONS = new Set(['jump','jumpstart','jumpfall','fall','falling','land','landing','landmoving','landcrouch','fallingtolanding','runtoland','runtolanding']);
const UPPER_BODY = new Set(['aim','fire','firing','firesingleidle','firesinglewalk','firesinglerun','fireautoidle','fireautowalk','fireautorun','reload','interact','use']);
const BODY_LOCKED = new Set(['landheavy','hardlanding','roll','slide','vault','mantle','climb','climbup','climbdown','hang','ledgeshimmy','ledgeshimmyleft','ledgeshimmyright','punch','melee','knifeattack','throw','dive','diveleft','diveright','save','tackle','kick','shoot','pass','cross','celebrate','defeat','death']);

function motionAmount(desired){
  const want = desired || {};
  return Math.max(0, finite(want.speed, 0), Math.hypot(finite(want.x, 0), finite(want.z, 0)));
}
function categoryOf(slot){
  const key = normalizeSlot(slot);
  if(MOVING_LANDINGS.has(key)) return 'moving-landing';
  if(TRANSITIONS.has(key)) return 'transition';
  if(UPPER_BODY.has(key)) return 'upper-body';
  if(BODY_LOCKED.has(key)) return 'body-locked';
  return 'generic';
}

// Both weights address the same skeleton. Their sum deliberately remains one,
// avoiding pose amplification while Three's PropertyMixer interpolates every
// track shared by the action and locomotion clips.
function profile(input){
  const options = input || {};
  const slot = normalizeSlot(options.slot || options.name);
  const progress = clamp01(options.progress);
  const moving = options.moving != null ? !!options.moving : motionAmount(options.desired) > .12;
  const category = categoryOf(slot);
  if(options.loop === true || options.held === true){
    const locomotionWeight=category==='upper-body'&&options.locomotionFloor!=null?clamp01(options.locomotionFloor):0;
    return Object.freeze({slot, category, progress, moving, actionWeight:1-locomotionWeight, locomotionWeight, releaseStart:1, releaseEnd:1});
  }

  let releaseStart = .62;
  let releaseEnd = .97;
  let locomotionFloor = moving ? .08 : 0;
  if(category === 'moving-landing'){
    // A moving landing is an impact accent, not a state that is allowed to keep
    // the legs after the player is already running on the ground. The faster the
    // requested gait, the earlier Run regains the skeleton. At full run the
    // landing still owns 65% on the contact frame, then releases completely in
    // roughly the first third of an ordinary one-second take.
    const runIntent=clamp01((motionAmount(options.desired)-.6)/4.4);
    releaseStart = moving ? .28-.24*runIntent : .55;
    releaseEnd = moving ? .72-.40*runIntent : .97;
    locomotionFloor = moving ? .05+.30*runIntent : 0;
  } else if(category === 'transition'){
    releaseStart = moving ? .42 : .64;
    locomotionFloor = 0;
  } else if(category === 'upper-body'){
    releaseStart = moving ? .52 : .7;
    // Fire is a recoil layer, not a gait replacement. Imported full-body fire
    // takes retain a visible accent, while Walk/Run keep enough weight that the
    // feet never snap back to the first frame on every trigger event.
    locomotionFloor = moving ? (/^fire/.test(slot) ? .72 : .22) : 0;
  } else if(category === 'body-locked'){
    releaseStart = moving ? .8 : .84;
    locomotionFloor = 0;
  }
  if(options.releaseStart != null) releaseStart = clamp01(options.releaseStart);
  if(options.releaseEnd != null) releaseEnd = clamp01(options.releaseEnd);
  if(options.locomotionFloor != null) locomotionFloor = clamp01(options.locomotionFloor);
  releaseEnd=Math.max(releaseStart+.02,releaseEnd);
  const release = smoothstep(releaseStart, releaseEnd, progress);
  const locomotionWeight = clamp01(locomotionFloor + (1 - locomotionFloor) * release);
  return Object.freeze({
    slot, category, progress, moving,
    actionWeight:1 - locomotionWeight,
    locomotionWeight,
    releaseStart,
    releaseEnd,
  });
}

// A second jump cannot keep blending the previous landing. Cancel it on the
// first airborne frame so Jump/Fall can own the skeleton immediately.
function shouldInterrupt(slot, desired){
  const want = desired || {};
  return LANDINGS.has(normalizeSlot(slot)) && want.grounded === false;
}

root.LK_RUNTIME_CHARACTER_ANIMATION_BLEND = Object.freeze({
  profile, shouldInterrupt, categoryOf, normalizeSlot, smoothstep, motionAmount,
});
})(typeof window !== 'undefined' ? window : globalThis);
