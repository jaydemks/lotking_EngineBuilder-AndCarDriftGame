/* =========================================================
   LOT KING — Character traversal abilities (GASP-style)

   Everything a humanoid Pawn can do beyond walk/run/jump, in ONE state
   machine shared by first and third person:

     crouch   hold to lower the body, slower and shorter
     walk     hold to move deliberately (quiet, precise)
     slide    double-tap Dodge at speed: a timed slide that keeps momentum
     roll     double-tap Dodge at a walk: a forward roll that ends standing
     vault    hop OVER a low obstacle and land on the far side
     mantle   pull UP onto a ledge and stand on it
     climb    ladders and climbable surfaces (free vertical movement)
     hang     catch a ledge in mid-air, shuffle along it and pull up

   EVERY ONE OF THEM PLAYS A CLIP. The mechanics worked long before the takes
   existed, so for a while only the roll was visibly animated and the rest moved
   the body silently: a vault was a teleport, a hang was a standing idle in the
   air, a crouch was a shorter capsule under an upright pose. The action layer at
   the top of the file is the one place that asks the Pawn for a clip, and it
   knows the difference between a TRANSITION that plays once and a POSE that has
   to be held for as long as its state lasts.

   The module never renders and never touches the camera. It owns a small
   amount of authority over the Pawn's transform: while a traversal is playing
   (vault / mantle / climb / hang) it drives `owner.position` directly and tells the
   Pawn to skip ordinary locomotion for that frame. Everything else is a speed
   scale layered on top of the normal movement controller.

   Geometry queries go through the arcade box colliders the movement controller
   already resolves against, so an obstacle is vaultable exactly when it is
   solid — there is no second, divergent collision world.

   Removing this script removes traversal and nothing else: the Pawn keeps
   walking, running and jumping.
   ========================================================= */
(function(){
'use strict';

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function ease(t){ return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

// How far the body lays back and drops through a slide. Authored here rather
// than per-Pawn because it is the shape of the move, not a per-character taste.
const SLIDE_PITCH = -0.85;
const SLIDE_DROP = 0.34;
const STATES = Object.freeze(['none', 'crouch', 'slide', 'roll', 'vault', 'mantle', 'climb', 'hang', 'wallFlip']);

const DEFAULT_VAULT_VARIANTS = Object.freeze([
  Object.freeze({id:'front-flip',label:'Front Flip Vault',slot:'vault',enabled:true,weight:1,override:false,minHeight:.5,maxHeight:1.25,minDepth:0,maxDepth:4}),
  Object.freeze({id:'box-vault',label:'Vault Over Box',slot:'vaultBox',enabled:true,weight:1,override:false,minHeight:.5,maxHeight:1.25,minDepth:.7,maxDepth:4}),
]);

function normalizeVaultVariants(vault){
  const source=Array.isArray(vault&&vault.variants)&&vault.variants.length?vault.variants:DEFAULT_VAULT_VARIANTS;
  return source.slice(0,32).map((item,index)=>{
    const entry=item&&typeof item==='object'?item:{};
    const minHeight=clamp(finite(entry.minHeight,.5),0,8),maxHeight=Math.max(minHeight,clamp(finite(entry.maxHeight,1.25),0,8));
    const minDepth=clamp(finite(entry.minDepth,0),0,20),maxDepth=Math.max(minDepth,clamp(finite(entry.maxDepth,4),0,20));
    return {id:String(entry.id||('vault-'+index)),label:String(entry.label||entry.id||('Vault '+(index+1))),slot:String(entry.slot||'vault'),enabled:entry.enabled!==false,weight:clamp(finite(entry.weight,1),.01,100),override:entry.override===true,priority:finite(entry.priority,0),minHeight,maxHeight,minDepth,maxDepth,duration:entry.duration==null?null:clamp(finite(entry.duration,.52),.1,4)};
  });
}

function selectVaultVariant(vault,ledge,random){
  const config=vault||{},variants=normalizeVaultVariants(config).filter(item=>item.enabled&&item.slot);
  if(!variants.length)return null;
  const preferred=String(config.defaultSlot||'vault'),fallback=variants.find(item=>item.slot===preferred)||variants[0];
  const mode=['random','conditions','primary'].includes(config.selectionMode)?config.selectionMode:'primary';
  if(mode==='primary')return fallback;
  if(mode==='random'){
    const total=variants.reduce((sum,item)=>sum+item.weight,0),sample=clamp(finite(typeof random==='function'?random():Math.random(),0),0,.999999)*total;
    let cursor=0;for(let i=0;i<variants.length;i++){cursor+=variants[i].weight;if(sample<cursor)return variants[i];}
    return fallback;
  }
  const height=Math.max(0,finite(ledge&&ledge.rise,0)),depth=Math.max(0,finite(ledge&&ledge.contact&&ledge.contact.depth,0));
  const matches=variants.filter(item=>height>=item.minHeight&&height<=item.maxHeight&&depth>=item.minDepth&&depth<=item.maxDepth);
  if(!matches.length)return fallback;
  return matches.sort((a,b)=>Number(b.override)-Number(a.override)||b.priority-a.priority||((a.maxHeight-a.minHeight)+(a.maxDepth-a.minDepth))-((b.maxHeight-b.minHeight)+(b.maxDepth-b.minDepth)))[0];
}

// ------------------------------------------------ action layer
//
// Everything here that has an animation goes through this, and so does the cover
// state machine next door — cover and traversal drive the SAME one-shot slot on
// the Pawn, so they have to agree on how a clip is asked for and given back.
//
// Two kinds of playback share that slot:
//
//   TRANSITION  plays once and hands the body back: roll, slide, vault, mantle,
//               a landing, entering or leaving cover.
//   POSE        has to be HELD for as long as its state lasts: crouch, hang,
//               climb, shuffling along a ledge or along a wall.
//
// A held pose plays once and clamps on its last authored frame. It is never a
// looping one-shot: a looping crouch visibly stands up and ducks again whenever
// the source take contains a transition. Both locomotion controllers understand
// `holdLastFrame`, so crouch enters once, remains low, then releases cleanly.
//
// Every entry point fails soft, and that is not decoration: registering three
// unreadable FBX files once cost this character EVERY animation, so an unbound or
// unloaded slot must cost nothing but itself. Nothing here throws, and nothing
// here can leave an action waiting for a clip that is never going to arrive.

// How long a pose whose clip refused to start waits before asking again. The
// animation library binds asynchronously, so a crouch held at spawn can be
// refused and then become playable a moment later — but asking every frame would
// broadcast an action event every frame for a clip that is not there.
const POSE_RETRY = .5;
// How long another system's one-shot is left alone before a pose takes the slot
// anyway. A pose that yields is how two systems avoid cancelling each other every
// frame; a pose that yields FOREVER is how a clip which never publishes a finish —
// a looping pose from elsewhere, a mixer event that never arrives — silently costs
// the crouch its animation for the rest of the level.
const FOREIGN_GRACE = 2.5;

function createActionLayer(pawn){
  // The pose currently being held, and the retry clock for the one case where
  // asking again is worth it.
  const held = {slot:null, retry:0};

  function table(){ return pawn && pawn.config && pawn.config.animations || null; }

  /** The first slot in a preference list that actually carries a binding. A list
   *  is how a pose degrades: the climb has an up take and a down take, and a
   *  character with only the neutral `climb` bound still animates. */
  function slotFor(names){
    const clips = table();
    if(!clips) return null;
    const list = Array.isArray(names) ? names : [names];
    for(let i = 0; i < list.length; i++){
      const name = list[i] == null ? '' : String(list[i]);
      if(name && clips[name]) return name;
    }
    return null;
  }

  /** The slot whose clip the AnimationMixer is actually running, or null. */
  function playingSlot(){
    const state = pawn && pawn.state;
    return state && state.actionClipPlaying === true ? state.actionClipName || null : null;
  }
  /** How long the running clip still has to go, in seconds. */
  function clipSeconds(){
    const state = pawn && pawn.state;
    return state ? Math.max(0, finite(state.actionClipDuration, 0)) : 0;
  }

  /** Asks the Pawn for `names` once. Returns the slot that produced a real clip,
   *  or null — which is what lets a caller choose between the authored clip and
   *  its procedural fallback instead of guessing. */
  function play(names, options){
    const slot = slotFor(names);
    if(!slot || !pawn || typeof pawn.playAction !== 'function') return null;
    // Pawn.playAction is an accepted-command API for Logic graphs and answers
    // true even with nothing to play, so the Pawn STATE is what records whether
    // a clip started.
    pawn.playAction(slot, Object.assign({fadeIn:.06, fadeOut:.12}, options || {}));
    return playingSlot() === slot ? slot : null;
  }

  /** Whether the action the Pawn is playing is young enough to still be running.
   *  The Pawn clocks it, so this needs no clock of its own. */
  function busy(){
    const state = pawn && pawn.state;
    return !!state && finite(state.actionTime, 0) < FOREIGN_GRACE;
  }

  /** Holds `names` for as long as it keeps being asked for, and returns the slot
   *  while a clip is running under it. */
  function hold(names, options){
    const slot = slotFor(names);
    if(!slot){ release(); return null; }
    const active = playingSlot();
    if(active && active !== slot && active !== held.slot){
      // Something ELSE owns the slot — a shot, a landing, a transition, the cover
      // stance. Let it finish rather than fighting it for the same frame, every
      // frame. Swapping one pose of this layer's own for another is not that: a
      // crouch that starts aiming has to reach the aimed take immediately.
      if(busy()) return null;
    } else if(active === slot && held.slot === slot){
      return slot;
    } else if(held.slot === slot && held.retry > 0){
      return null;
    }
    held.slot = slot;
    const started = play(slot, Object.assign({fadeIn:.14, fadeOut:.2, hold:true, holdLastFrame:true}, options || {}));
    held.retry = started ? 0 : POSE_RETRY;
    return started;
  }

  /** Gives the slot back. The running clip is stopped only when it is the pose's
   *  OWN: another system's one-shot has to be left to finish. */
  function release(){
    if(!held.slot) return false;
    const slot = held.slot;
    held.slot = null;
    held.retry = 0;
    if(playingSlot() !== slot) return true;
    const locomotion = pawn && pawn.locomotion;
    if(locomotion && typeof locomotion.stopAction === 'function'){
      // A cosmetic layer never breaks the frame it is drawn in.
      try { locomotion.stopAction(); } catch(error){ return true; }
    }
    if(pawn && pawn.state && pawn.state.actionClipName === slot){
      pawn.state.actionClipPlaying=false;
      pawn.state.actionClipName=null;
      pawn.state.actionClipDuration=0;
    }
    return true;
  }

  function tick(dt){
    if(held.retry > 0) held.retry = Math.max(0, held.retry - Math.max(0, finite(dt, 0)));
    return held.slot;
  }

  return Object.freeze({play, hold, release, tick, slotFor, playingSlot, clipSeconds,
    heldSlot:() => held.slot});
}

// Which crouch clip the stance holds, by what the body is DOING. The entries are
// PREFERENCES: the first slot an author or the bundled body has bound wins, and a
// stance with none of them bound falls through to the locomotion machine rather
// than freezing the character in a pose it cannot animate out of.
const CROUCH_POSES = Object.freeze({
  idle:Object.freeze(['crouchIdle', 'crouchAimIdle']),
  aim:Object.freeze(['crouchAimIdle', 'crouchIdle']),
  forward:Object.freeze(['crouchWalk']),
  backward:Object.freeze(['crouchWalkBackward', 'crouchWalk']),
  // Engine convention: +X in the character's own frame is the body's own LEFT.
  // Slow Walk picks the sneak take over the crouch walk, which is the difference
  // between moving quietly and merely moving low.
  left:Object.freeze(['crouchWalkLeft', 'crouchSneakLeft']),
  right:Object.freeze(['crouchWalkRight', 'crouchSneakRight']),
  sneakLeft:Object.freeze(['crouchSneakLeft', 'crouchWalkLeft']),
  sneakRight:Object.freeze(['crouchSneakRight', 'crouchWalkRight']),
});
// Ledge and ladder poses, same rule: an unbound directional take degrades to the
// neutral hold, never to nothing — a character frozen on a ledge with no clip is
// the failure this whole layer exists to avoid.
const HANG_POSES = Object.freeze({
  hold:Object.freeze(['hang']),
  left:Object.freeze(['ledgeShimmyLeft', 'hang']),
  right:Object.freeze(['ledgeShimmyRight', 'hang']),
});
const CLIMB_POSES = Object.freeze({
  hold:Object.freeze(['climb', 'climbUp']),
  up:Object.freeze(['climbUp', 'climb']),
  down:Object.freeze(['climbDown', 'climb']),
});

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  const crouch = src.crouch || {};
  const crouchSpeedVersion=Math.max(0,Math.floor(finite(crouch.speedVersion,0)));
  const authoredCrouchSpeed=finite(crouch.speedScale,.88);
  // 0.42 was the shipped default, not a deliberate per-Pawn choice. Upgrade
  // that exact legacy value once; every other authored speed remains intact.
  const crouchSpeed=crouchSpeedVersion<2&&Math.abs(authoredCrouchSpeed-.42)<.000001?.88:authoredCrouchSpeed;
  const walk = src.walk || {};
  const slide = src.slide || {};
  const vault = src.vault || {};
  const mantle = src.mantle || {};
  const climb = src.climb || {};
  const hang = src.hang || {};
  const adaptation = src.surfaceAdaptation || src.contactIK || {};
  return {
    enabled:src.enabled !== false,
    crouch:{
      enabled:crouch.enabled !== false,
      // Toggle by default: crouching is a stance you stay in while you move
      // and shoot, not a key you hold down for a minute. Set false for hold.
      toggle:crouch.toggle !== false,
      heightScale:clamp(finite(crouch.heightScale, .55), .3, 1),
      speedScale:clamp(crouchSpeed, .05, 1),
      speedVersion:2,
      blend:clamp(finite(crouch.blend, 11), 1, 40),
    },
    walk:{
      enabled:walk.enabled !== false,
      speedScale:clamp(finite(walk.speedScale, .33), .05, 1),
    },
    slide:{
      enabled:slide.enabled !== false,
      // Double-tapping the Dodge key, not Crouch. Crouch is held constantly to
      // move quietly, so binding the slide to it fires the move every time the
      // player ducks at speed — including when the crouch was forced by a low
      // ceiling, which made stairs launch a slide on their own.
      doubleTapWindow:clamp(finite(slide.doubleTapWindow, .32), .08, 1),
      // Above this the dodge is a slide; below it, a roll. One gesture, two
      // moves, chosen by what the character is already doing.
      minSpeed:clamp(finite(slide.minSpeed, 4.2), .5, 20),
      rollDuration:clamp(finite(slide.rollDuration, .62), .1, 3),
      rollSpeed:clamp(finite(slide.rollSpeed, 4.6), .5, 16),
      // Authored clips determine how LONG the roll lasts. Travel stays a
      // distance so a 1.8 s take does not accidentally send the Pawn 8 metres.
      rollDistance:clamp(finite(slide.rollDistance, 2.85), .1, 12),
      rollPlaybackRate:clamp(finite(slide.rollPlaybackRate, 1), .25, 3),
      duration:clamp(finite(slide.duration, .85), .1, 4),
      boost:clamp(finite(slide.boost, 1.35), 1, 3),
      friction:clamp(finite(slide.friction, 2.6), .1, 20),
      cooldown:clamp(finite(slide.cooldown, .6), 0, 5),
    },
    vault:{
      enabled:vault.enabled !== false,
      minHeight:clamp(finite(vault.minHeight, .5), .1, 3),
      maxHeight:clamp(finite(vault.maxHeight, 1.25), .2, 4),
      reach:clamp(finite(vault.reach, .95), .2, 3),
      // How far past the obstacle the character must find floor to go OVER it
      // rather than climb ON it.
      clearance:clamp(finite(vault.clearance, 1.15), .3, 4),
      duration:clamp(finite(vault.duration, .52), .1, 2),
      minSpeed:clamp(finite(vault.minSpeed, .8), 0, 10),
      selectionMode:['primary','random','conditions'].includes(vault.selectionMode)?vault.selectionMode:'primary',
      defaultSlot:String(vault.defaultSlot||'vault'),
      variants:normalizeVaultVariants(vault),
    },
    wallFlip:{
      enabled:src.wallFlip && src.wallFlip.enabled === false ? false : true,
      minSpeed:clamp(finite(src.wallFlip&&src.wallFlip.minSpeed,4.2),.5,20),
      minHeight:clamp(finite(src.wallFlip&&src.wallFlip.minHeight,1.35),.5,6),
      reach:clamp(finite(src.wallFlip&&src.wallFlip.reach,.72),.2,2),
      // The take is fitted inside this window. Playback Rate authored on the
      // Wall Flip motion slot still applies; this is only the gameplay ceiling
      // that keeps a long source take from pinning the Pawn against the wall.
      duration:clamp(finite(src.wallFlip&&src.wallFlip.duration,.72),.2,2),
      playbackRate:clamp(finite(src.wallFlip&&src.wallFlip.playbackRate,1.15),.25,4),
      lift:clamp(finite(src.wallFlip&&src.wallFlip.lift,.72),0,3),
      pushback:clamp(finite(src.wallFlip&&src.wallFlip.pushback,.62),0,3),
      // After landing, held Forward eases into a slow approach and then idle.
      // The action remains latched until Run/Forward is released, so there is
      // no second flip and no abrupt frozen frame at the end of the take.
      settleDuration:clamp(finite(src.wallFlip&&src.wallFlip.settleDuration,.55),.05,2),
      settleSpeedScale:clamp(finite(src.wallFlip&&src.wallFlip.settleSpeedScale,.42),.05,1),
    },
    mantle:{
      enabled:mantle.enabled !== false,
      maxHeight:clamp(finite(mantle.maxHeight, 2.35), .3, 6),
      reach:clamp(finite(mantle.reach, .95), .2, 3),
      duration:clamp(finite(mantle.duration, .78), .1, 3),
    },
    climb:{
      enabled:climb.enabled !== false,
      speed:clamp(finite(climb.speed, 2.4), .2, 10),
      // Lateral shuffle along a climbable wall; ladders keep it at 0.
      strafe:clamp(finite(climb.strafe, 1.4), 0, 6),
      reach:clamp(finite(climb.reach, .85), .2, 3),
      exitBoost:clamp(finite(climb.exitBoost, 1), 0, 4),
    },
    // A normal running jump must return through the ordinary landing motion.
    // Only an impact past `damageSpeed` may play Hard Landing, and only if the
    // Character survives; death physics owns a lethal impact from frame one.
    land:{
      enabled:src.land && src.land.enabled === false ? false : true,
      // Fall speed at impact, in m/s, above which the landing rolls.
      rollSpeed:clamp(finite(src.land && src.land.rollSpeed, 9), 1, 60),
      // A stock 1.05 m jump returns at about 6.8 m/s, safely below this default.
      // `softSpeed` remains normalized for old authored data but no longer
      // decides whether Hard Landing is played.
      softSpeed:clamp(finite(src.land && src.land.softSpeed, 7.5), .5, 40),
      damageSpeed:clamp(finite(src.land && src.land.damageSpeed, 10), 1, 60),
      damageScale:clamp(finite(src.land && src.land.damageScale, 8), 0, 100),
      // A roll only happens when the character is going somewhere. Landing on
      // the spot from a great height should stagger, not tumble across a room.
      minSpeed:clamp(finite(src.land && src.land.minSpeed, 1.6), 0, 12),
      // How long the body is planted after a heavy landing that did not roll.
      recovery:clamp(finite(src.land && src.land.recovery, .32), 0, 2),
    },
    // Ledge hang: catching an edge that is too high to mantle from the ground,
    // hanging from it, shuffling along it and pulling up. The Assassin's Creed
    // move, and the reason a jump at a wall is worth trying.
    hang:{
      enabled:hang.enabled !== false,
      reach:clamp(finite(hang.reach, 1), .2, 3),
      // How far above the feet the edge has to be. Below this the character
      // mantles from the ground instead; above it the edge is out of reach.
      minHeight:clamp(finite(hang.minHeight, 1.1), .3, 4),
      maxHeight:clamp(finite(hang.maxHeight, 2.6), .5, 8),
      // Distance from the edge down to the feet while hanging.
      drop:clamp(finite(hang.drop, 1.85), .3, 4),
      shimmy:clamp(finite(hang.shimmy, 1.5), 0, 6),
      // Pulling up out of a hang is slower than a standing mantle.
      pullUpTime:clamp(finite(hang.pullUpTime, .72), .1, 3),
    },
    // Surface probing, named motion-warp goals and phase-weighted limb IK are
    // authored together but remain separate runtime stages.  The clip keeps the
    // performance; these values only converge its root/hands/feet onto the real
    // collider that was measured in front of this character.
    surfaceAdaptation:{
      enabled:adaptation.enabled !== false,
      ikWeight:clamp(finite(adaptation.ikWeight, .82), 0, 1),
      rootWarpWeight:clamp(finite(adaptation.rootWarpWeight, 1), 0, 1),
      handSpacing:clamp(finite(adaptation.handSpacing, .52), .1, 1.4),
      footSpacing:clamp(finite(adaptation.footSpacing, .34), .08, 1),
      surfaceOffset:clamp(finite(adaptation.surfaceOffset, .035), 0, .25),
      handHeightOffset:clamp(finite(adaptation.handHeightOffset, .025), -.25, .35),
      footHeight:clamp(finite(adaptation.footHeight, .42), .12, 1.2),
      handsStart:clamp(finite(adaptation.handsStart, .04), 0, 1),
      handsEnd:clamp(finite(adaptation.handsEnd, .72), 0, 1),
      feetStart:clamp(finite(adaptation.feetStart, .26), 0, 1),
      feetEnd:clamp(finite(adaptation.feetEnd, .94), 0, 1),
      debug:adaptation.debug === true,
    },
  };
}

// ------------------------------------------------ geometry probes
//
// The obstacle world is the arcade box collider list. A box is a candidate
// ledge when its top is above the feet, below the ability ceiling, and the
// character is pointed at its footprint.

function boxTop(col){ return col && col.hy != null && col.y != null ? col.y + col.hy : null; }

function isClimbable(col){
  if(!col) return false;
  if(col.climbable === true) return true;
  const data = col.owner && col.owner.userData;
  return !!(data && (data.climbable === true || data.climbSurface === true));
}

function belongsTo(node, owner){
  for(let current=node;current;current=current.parent||null)if(current===owner)return true;
  return false;
}

function ownCollider(col, owner){
  if(!col||!owner)return false;
  return belongsTo(col.owner,owner)||belongsTo(col.logicElementOwner,owner);
}

function boxesNear(GAME, x, z, radius, excludeOwner){
  const list = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
  if(!Array.isArray(list)) return [];
  const out = [];
  for(let i = 0; i < list.length; i++){
    const col = list[i];
    if(!col || col.enabled === false || col.compoundRoot || col.horizontalSurface || ownCollider(col,excludeOwner)) continue;
    if(Math.abs(x - col.x) > col.hx + radius) continue;
    if(Math.abs(z - col.z) > col.hz + radius) continue;
    out.push(col);
  }
  return out;
}

// Highest solid top at an XZ position, ignoring anything above `ceiling`.
function topAt(GAME, x, z, ceiling, radius, excludeOwner){
  const list = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
  let best = null;
  if(!Array.isArray(list)) return best;
  for(let i = 0; i < list.length; i++){
    const col = list[i];
    if(!col || col.enabled === false || col.compoundRoot || col.walkable === false || ownCollider(col,excludeOwner)) continue;
    if(Math.abs(x - col.x) > col.hx + (radius || 0)) continue;
    if(Math.abs(z - col.z) > col.hz + (radius || 0)) continue;
    const top = boxTop(col);
    if(top == null || top > ceiling) continue;
    if(best == null || top > best.top) best = {top, collider:col};
  }
  return best;
}

// Exact 2D ray/AABB entry used after the broad top probe selected a collider.
// It produces one coherent contract for mechanics, animation and debug: the
// near hit, far exit (object depth) and outward surface normal can never disagree.
function boxSurfaceProbe(col, originX, originZ, directionX, directionZ){
  if(!col || col.compoundRoot || col.horizontalSurface || col.hx == null || col.hz == null) return null;
  let dx=finite(directionX,0), dz=finite(directionZ,0);
  const length=Math.hypot(dx,dz);if(length<1e-6)return null;dx/=length;dz/=length;
  let near=-Infinity,far=Infinity,normalX=-dx,normalZ=-dz;
  const slab=(origin,direction,min,max,nx,nz)=>{
    if(Math.abs(direction)<1e-8)return origin>=min&&origin<=max;
    let a=(min-origin)/direction,b=(max-origin)/direction,entryNormalX=nx,entryNormalZ=nz;
    if(a>b){const swap=a;a=b;b=swap;entryNormalX=-nx;entryNormalZ=-nz;}
    if(a>near){near=a;normalX=entryNormalX;normalZ=entryNormalZ;}
    far=Math.min(far,b);return near<=far;
  };
  if(!slab(originX,dx,col.x-col.hx,col.x+col.hx,-1,0))return null;
  if(!slab(originZ,dz,col.z-col.hz,col.z+col.hz,0,-1))return null;
  if(far<0)return null;
  const startsInside=near<0,entry=startsInside?0:near,exit=Math.max(entry,far);
  if(startsInside){normalX=-dx;normalZ=-dz;}
  return {
    x:originX+dx*entry,z:originZ+dz*entry,
    farX:originX+dx*exit,farZ:originZ+dz*exit,
    normalX,normalZ,directionX:dx,directionZ:dz,
    distance:entry,depth:Math.max(0,exit-entry),collider:col,startsInside,
  };
}

function windowWeight(phase,start,end){
  const p=clamp(finite(phase,0),0,1),a=clamp(finite(start,0),0,1),b=Math.max(a+.001,clamp(finite(end,1),0,1));
  if(p<=a||p>=b)return 0;
  const edge=Math.min(.22,(b-a)*.35),up=clamp((p-a)/Math.max(.001,edge),0,1),down=clamp((b-p)/Math.max(.001,edge),0,1);
  return ease(Math.min(up,down));
}

function editorDebugAllowed(GAME, config){
  return !!(config&&config.debug===true&&GAME&&GAME.state&&GAME.state.editorActive===true);
}

// ------------------------------------------------ controller

function create(GAME, pawn, source){
  const config = normalizeConfig(source);
  const state = {
    mode:'none',
    crouchBlend:0,          // 0 standing .. 1 fully crouched
    crouchTarget:0,         // analogue pressure requested by a hold/trigger
    crouchHeld:false,
    jumpHeld:false,
    jumpPressedThisFrame:false,
    crouchLatched:false,
    slideTimer:0,
    slideCooldown:0,
    slideSpeed:0,
    slideDirX:0, slideDirZ:0,
    // Whether an authored take is carrying the slide. When it is, the procedural
    // lean stands down: two slide visuals at once is a body bent double.
    slideAnimated:false,
    dodgeHeld:false,
    dodgeTapAge:99,         // seconds since the last Dodge press
    rollTimer:0,
    rollSpin:0,
    rollAnimated:false,
    rollDuration:0,
    rollDistance:0,
    rollProgress:0,
    traversal:null,         // active vault / mantle tween
    wallFlip:null,          // authored take plus a synchronized wall-rebound arc
    wallFlipAwaitRunRelease:false,
    wallFlipSettleRemaining:0,
    climb:null,             // {volume, top, normalX, normalZ, ladder}
    hang:null,              // {top} while hanging from a ledge
    lastGrounded:true,
    baseHeight:null,
    baseEyeHeight:null,
    blockedTimer:0,
    // Fastest downward speed seen during the current fall, sampled before the
    // ground solver zeroes it. The landing is classified from this.
    fallSpeed:0,
    landRecovery:0,
    // Set by a system that has taken the body over — the cover state machine.
    // While suspended the ability set reads no input and drives no transform,
    // so the two can never fight for the same frame.
    suspended:false,
    traversalContact:null,
    traversalTargets:null,
    debugHelper:null,
  };

  // The one route from this module to an animation clip, shared with cover.
  const actions = createActionLayer(pawn);

  function owner(){ return pawn && pawn.owner || null; }
  function movement(){ return pawn && pawn.movementController || null; }
  function options(){ const m = movement(); return m ? m.options() : {radius:.35, height:1.8, stepHeight:.55}; }

  function emit(type, payload){
    if(typeof window === 'undefined' || !window.dispatchEvent || !window.CustomEvent) return;
    window.dispatchEvent(new CustomEvent('lk-pawn-event', {detail:Object.assign({type, pawnId:pawn && pawn.id || null}, payload || {})}));
  }

  function heading(){
    const node = owner();
    return node && node.rotation ? finite(node.rotation.y, 0) : 0;
  }
  // Engine convention: a heading of `yaw` faces (sin yaw, 0, cos yaw).
  // ------------------------------------------------ body pose
  // Slide and roll are poses of the BODY, not of the Pawn root. The root's
  // rotation.y is the heading: the FPS rig rewrites it every frame, colliders and
  // AI read it, and Euler order XYZ applies a rotation.x in the PARENT frame -
  // so tumbling the root spun the character about the WORLD x axis and a roll
  // therefore went sideways for anyone not facing north. Posing the visual root
  // instead keeps the heading contract and makes local X the character's own
  // lateral axis, which is exactly what a forward roll turns about.
  function visualRoot(){
    const node = owner();
    if(!node) return null;
    const cached = node.userData && node.userData.characterBodyPoseRoot;
    if(cached && cached.parent) return cached;
    let found = null;
    if(typeof node.traverse === 'function'){
      node.traverse(child => {
        if(found || !child || child === node) return;
        const data = child.userData || {};
        if(data.characterPlaceholderRig === true) found = child;
        else if(data.logicElementAssetVisual === true && !(child.parent && child.parent.userData && child.parent.userData.logicElementAssetVisual)) found = child;
      });
    }
    if(found && node.userData){
      node.userData.characterBodyPoseRoot = found;
      if(!found.userData) found.userData = {};
      if(!found.userData.characterBodyPoseRest){
        found.userData.characterBodyPoseRest = {
          x:found.position ? found.position.x : 0,
          y:found.position ? found.position.y : 0,
          z:found.position ? found.position.z : 0,
          rx:found.rotation ? found.rotation.x : 0,
        };
      }
    }
    return found;
  }
  // Turns the body about a pivot `height` above its own origin, so a roll goes
  // over the character's middle instead of pole-vaulting around its feet.
  function setBodyPose(pitch, height, drop){
    const body = visualRoot();
    if(!body || !body.position || !body.rotation) return false;
    const rest = body.userData && body.userData.characterBodyPoseRest || {x:0, y:0, z:0, rx:0};
    const angle = finite(pitch, 0), pivot = Math.max(0, finite(height, 0));
    body.rotation.x = finite(rest.rx, 0) + angle;
    body.position.y = finite(rest.y, 0) + pivot * (1 - Math.cos(angle)) - Math.max(0, finite(drop, 0));
    body.position.z = finite(rest.z, 0) - pivot * Math.sin(angle);
    return true;
  }
  function clearBodyPose(){
    const node = owner();
    const body = node && node.userData && node.userData.characterBodyPoseRoot;
    if(!body || !body.position || !body.rotation) return false;
    const rest = body.userData && body.userData.characterBodyPoseRest || {x:0, y:0, z:0, rx:0};
    body.rotation.x = finite(rest.rx, 0);
    body.position.set(finite(rest.x, 0), finite(rest.y, 0), finite(rest.z, 0));
    return true;
  }
  // The height the body turns about: the standing capsule's middle, so it scales
  // with an authored character rather than assuming a 1.8 m adult.
  function bodyPivotHeight(){
    // The STANDING height, captured once, so a crouched or sliding capsule does
    // not move the pivot mid-move.
    const height = finite(state.baseHeight, finite(options().height, 1.8));
    return clamp(height * .5, .35, 1.6);
  }

  function forwardX(){ return Math.sin(heading()); }
  function forwardZ(){ return Math.cos(heading()); }

  function surfaceContact(collider, top){
    const node=owner();if(!node||!node.position||!collider)return null;
    const fx=forwardX(),fz=forwardZ(),probe=boxSurfaceProbe(collider,node.position.x,node.position.z,fx,fz);
    if(!probe)return null;
    probe.top=finite(top,boxTop(collider));
    probe.tangentX=Math.cos(heading());probe.tangentZ=-Math.sin(heading());
    return probe;
  }

  // One measured surface becomes named animation goals.  Root, effectors and
  // joint poles are intentionally data: the root warp and limb solvers consume
  // the same answer without either re-running collision detection.
  function contactTargets(contact,kind,phase,rootTarget){
    const node=owner(),adapt=config.surfaceAdaptation;if(!node||!contact||!adapt.enabled)return null;
    const opts=options(),height=finite(state.baseHeight,finite(opts.height,1.8)),feet=node.position.y;
    const tx=contact.tangentX,tz=contact.tangentZ,nx=contact.normalX,nz=contact.normalZ;
    const faceX=contact.x+nx*adapt.surfaceOffset,faceZ=contact.z+nz*adapt.surfaceOffset;
    const handY=contact.top+adapt.handHeightOffset;
    const climbing=kind==='climb',hanging=kind==='hang';
    const cycle=climbing?Math.sin((feet/config.climb.speed)*Math.PI*2):0;
    const leftHandY=climbing?Math.min(contact.top-.04,feet+height*(.74+.08*Math.max(0,cycle))):handY;
    const rightHandY=climbing?Math.min(contact.top-.04,feet+height*(.74+.08*Math.max(0,-cycle))):handY;
    const leftFootY=climbing?Math.min(contact.top-.12,feet+adapt.footHeight*(.82+.25*Math.max(0,-cycle))):Math.min(contact.top-.08,feet+adapt.footHeight);
    const rightFootY=climbing?Math.min(contact.top-.12,feet+adapt.footHeight*(.82+.25*Math.max(0,cycle))):Math.min(contact.top-.08,feet+adapt.footHeight);
    const point=(side,y,spacing)=>({x:faceX+tx*side*spacing*.5,y,z:faceZ+tz*side*spacing*.5});
    const leftHand=point(1,leftHandY,adapt.handSpacing),rightHand=point(-1,rightHandY,adapt.handSpacing);
    const leftFoot=point(1,leftFootY,adapt.footSpacing),rightFoot=point(-1,rightFootY,adapt.footSpacing);
    const pole=(side,y,out)=>({x:node.position.x+tx*side*out+nx*.28,y,z:node.position.z+tz*side*out+nz*.28});
    const p=clamp(finite(phase,0),0,1),steady=climbing||hanging;
    return {
      kind,phase:p,contact,
      rootTarget:rootTarget||null,
      leftHand,rightHand,leftFoot,rightFoot,
      leftElbowPole:pole(1,feet+height*.58,.42),rightElbowPole:pole(-1,feet+height*.58,.42),
      leftKneePole:pole(1,feet+height*.22,.25),rightKneePole:pole(-1,feet+height*.22,.25),
      handWeight:adapt.ikWeight*(steady?1:windowWeight(p,adapt.handsStart,adapt.handsEnd)),
      footWeight:adapt.ikWeight*(climbing?1:(hanging?0:windowWeight(p,adapt.feetStart,adapt.feetEnd))),
      normal:{x:nx,y:0,z:nz},depth:contact.depth,
    };
  }

  function debugScene(){return GAME&&GAME.core&&GAME.core.scene||null;}
  function removeDebugHelper(){
    const helper=state.debugHelper;if(!helper)return false;
    if(helper.parent)helper.parent.remove(helper);
    if(helper.traverse)helper.traverse(item=>{if(item.geometry&&item.geometry.dispose)item.geometry.dispose();if(item.material&&item.material.dispose)item.material.dispose();});
    state.debugHelper=null;return true;
  }
  function ensureDebugHelper(){
    if(!editorDebugAllowed(GAME,config.surfaceAdaptation)){removeDebugHelper();return null;}
    if(state.debugHelper)return state.debugHelper;
    const THREE=window.THREE,scene=debugScene();if(!THREE||!scene||!scene.add)return null;
    const group=new THREE.Group();group.name='Traversal Surface Probe (Editor Only)';
    group.userData=Object.assign(group.userData||{},{helperOnly:true,editorOnly:true,traversalProbeHelper:true,raycastIgnore:true});
    const markers={},colors={hit:0xffb020,leftHand:0x35d9ff,rightHand:0x35d9ff,leftFoot:0x60f08c,rightFoot:0x60f08c,root:0xff62da};
    Object.keys(colors).forEach(name=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(name==='hit'?.075:.055,8,6),new THREE.MeshBasicMaterial({color:colors[name],depthTest:false,transparent:true,opacity:.95}));mesh.renderOrder=999;mesh.userData.helperOnly=true;markers[name]=mesh;group.add(mesh);});
    // Six fixed line segments. Keep one BufferAttribute for the helper's whole
    // lifetime: replacing it every frame would create/destroy GPU buffers while
    // WebGPU may still have the previous command buffer in flight.
    const geometry=new THREE.BufferGeometry(),lineArray=new Float32Array(6*2*3);
    geometry.setAttribute('position',new THREE.BufferAttribute(lineArray,3));geometry.setDrawRange(0,0);
    const material=new THREE.LineBasicMaterial({color:0xffd166,depthTest:false,transparent:true,opacity:.9});
    const lines=new THREE.LineSegments(geometry,material);lines.renderOrder=998;lines.userData.helperOnly=true;group.add(lines);
    group.userData.markers=markers;group.userData.lines=lines;group.userData.lineArray=lineArray;scene.add(group);state.debugHelper=group;return group;
  }
  function updateDebugHelper(targets){
    const helper=ensureDebugHelper();if(!helper)return false;
    helper.visible=!!targets;if(!targets)return false;
    const markers=helper.userData.markers,contact=targets.contact;
    const set=(name,value)=>{const marker=markers[name];if(!marker)return;if(!value){marker.visible=false;return;}marker.visible=true;marker.position.set(value.x,value.y,value.z);};
    set('hit',{x:contact.x,y:contact.top,z:contact.z});set('leftHand',targets.leftHand);set('rightHand',targets.rightHand);set('leftFoot',targets.leftFoot);set('rightFoot',targets.rightFoot);set('root',targets.rootTarget);
    const node=owner(),start=node&&node.position?{x:node.position.x,y:node.position.y+finite(options().height,1.8)*.55,z:node.position.z}:null;
    const vertices=[],segment=(a,b)=>{if(a&&b)vertices.push(a.x,a.y,a.z,b.x,b.y,b.z);};
    segment(start,{x:contact.x,y:contact.top,z:contact.z});segment({x:contact.x,y:contact.top,z:contact.z},{x:contact.x+contact.normalX*.55,y:contact.top,z:contact.z+contact.normalZ*.55});
    segment(targets.leftElbowPole,targets.leftHand);segment(targets.rightElbowPole,targets.rightHand);segment(targets.leftKneePole,targets.leftFoot);segment(targets.rightKneePole,targets.rightFoot);
    const geometry=helper.userData.lines.geometry,array=helper.userData.lineArray,attribute=geometry.getAttribute('position');
    array.fill(0);array.set(vertices.slice(0,array.length));attribute.needsUpdate=true;geometry.setDrawRange(0,Math.min(vertices.length,array.length)/3);
    geometry.computeBoundingSphere();
    return true;
  }
  function publishTargets(targets){
    state.traversalTargets=targets||null;state.traversalContact=targets&&targets.contact||null;
    if(pawn&&pawn.state){pawn.state.traversalTargets=targets||null;pawn.state.traversalContact=state.traversalContact;}
    updateDebugHelper(targets);return targets;
  }

  // --- crouch / walk ------------------------------------------------------

  // The standing height is captured once, so repeated crouch cycles cannot
  // ratchet the body shorter and shorter.
  function captureBaseHeight(){
    if(state.baseHeight != null) return;
    state.baseHeight = finite(options().height, 1.8);
    const rig = pawn && pawn.firstPerson;
    state.baseEyeHeight = rig && rig.config ? finite(rig.config().eyeHeight, 1.62) : 1.62;
  }

  // Standing back up must not push the head through a ceiling: the crouch is
  // held until the space above the character is actually clear.
  //
  // "Overhead" has to mean ABOVE THE BODY, not merely intersecting it. Testing
  // for any box between the feet and the head also matches the next tread of a
  // staircase, so running up stairs forced a permanent crouch — and, while the
  // slide was still bound to crouch, launched a slide on every step. A ceiling
  // is a box whose UNDERSIDE is above waist height and below standing height.
  function headroomBlocked(){
    const node = owner();
    if(!node || !node.position) return false;
    const opts = options();
    const height = finite(state.baseHeight, opts.height);
    const standTop = node.position.y + height;
    const waist = node.position.y + height * .55;
    const boxes = boxesNear(GAME, node.position.x, node.position.z, opts.radius * .8,node);
    for(let i = 0; i < boxes.length; i++){
      const col = boxes[i];
      if(col.hy == null || col.y == null) continue;
      const bottom = col.y - col.hy;
      if(bottom > waist && bottom < standTop - .05) return true;
    }
    return false;
  }

  function applyCrouchBlend(dt){
    captureBaseHeight();
    const wantCrouch = state.mode === 'crouch' || state.mode === 'slide' || state.mode === 'roll';
    const forced = state.mode === 'slide' || state.mode === 'roll' || headroomBlocked();
    const target = wantCrouch ? (forced ? 1 : clamp(finite(state.crouchTarget,1),0,1)) : 0;
    const alpha = 1 - Math.exp(-config.crouch.blend * dt);
    state.crouchBlend += (target - state.crouchBlend) * alpha;
    if(state.crouchBlend < .002) state.crouchBlend = 0;
    if(state.crouchBlend > .998) state.crouchBlend = 1;
    const scale = 1 - (1 - config.crouch.heightScale) * state.crouchBlend;
    const move = movement();
    if(move) move.configure({height:finite(state.baseHeight, 1.8) * scale});
    // The eye follows the body so first person actually ducks, and the third
    // person camera pivot follows through the same number.
    const rig = pawn && pawn.firstPerson;
    if(rig && rig.setEyeOffset) rig.setEyeOffset(-(1 - scale) * finite(state.baseEyeHeight, 1.62));
    if(pawn && pawn.state) pawn.state.crouch = state.crouchBlend;
  }

  // --- traversal detection ------------------------------------------------

  // Looks for a ledge straight ahead and classifies it. Returns null when the
  // way is clear or the obstacle is too tall to deal with.
  function probeLedge(){
    const node = owner();
    if(!node || !node.position) return null;
    const opts = options();
    const feet = node.position.y;
    const fx = forwardX(), fz = forwardZ();
    const ceiling = feet + Math.max(config.vault.maxHeight, config.mantle.maxHeight);
    const reach = Math.max(config.vault.reach, config.mantle.reach);
    const ahead = topAt(GAME, node.position.x + fx * reach, node.position.z + fz * reach, ceiling, opts.radius * .6,node);
    if(!ahead) return null;
    const contact=surfaceContact(ahead.collider,ahead.top);
    // A ground/drive surface can be a valid LANDING below the Pawn, but it has
    // no vertical face to vault or mantle. Large imported border meshes are
    // deliberately represented as horizontalSurface colliders and used to be
    // mistaken for an invisible wall spanning the whole Parking Lot.
    if(!contact)return null;
    const rise = ahead.top - feet;
    // Anything the movement controller already steps over is not a traversal.
    if(rise <= finite(opts.stepHeight, .55) + .02) return null;

    // Landing test: is there floor just past the obstacle at roughly its own
    // height? If so the character goes OVER it, otherwise it climbs ON it.
    const legacyLandX=node.position.x+fx*(reach+config.vault.clearance),legacyLandZ=node.position.z+fz*(reach+config.vault.clearance);
    const landX = contact ? contact.farX + fx * config.vault.clearance : legacyLandX;
    const landZ = contact ? contact.farZ + fz * config.vault.clearance : legacyLandZ;
    const landing = topAt(GAME, landX, landZ, ahead.top + .05, opts.radius * .6,node);
    const landY = landing ? landing.top : groundBelow(landX, landZ, feet);
    const canVault = config.vault.enabled && rise >= config.vault.minHeight && rise <= config.vault.maxHeight &&
      landY != null && landY <= ahead.top - .12;
    if(canVault) return {kind:'vault', top:ahead.top, landY, x:landX, z:landZ, legacyX:legacyLandX,legacyZ:legacyLandZ,rise,collider:ahead.collider,contact};
    if(config.mantle.enabled && rise <= config.mantle.maxHeight){
      // Mantle stands just ONTO the near lip; only a vault clears the entire
      // measured depth.  Sending a mantle to the far edge of a deep platform is
      // a horizontal teleport, not a pull-up.
      const legacyStandX=node.position.x+fx*(reach+opts.radius+.18),legacyStandZ=node.position.z+fz*(reach+opts.radius+.18);
      const standX = contact ? contact.x + fx * (opts.radius + .24) : legacyStandX;
      const standZ = contact ? contact.z + fz * (opts.radius + .24) : legacyStandZ;
      const surface = topAt(GAME, standX, standZ, ahead.top + .06, opts.radius * .6,node);
      // A ledge is only mantleable when its top is a real standing surface.
      if(surface && Math.abs(surface.top - ahead.top) < .25){
        return {kind:'mantle', top:ahead.top, landY:ahead.top, x:standX, z:standZ, legacyX:legacyStandX,legacyZ:legacyStandZ,rise,collider:ahead.collider,contact};
      }
    }
    return null;
  }

  function probeWallFlip(){
    if(!config.wallFlip.enabled)return null;
    const node=owner();if(!node||!node.position)return null;
    const opts=options(),feet=node.position.y,fx=forwardX(),fz=forwardZ(),reach=config.wallFlip.reach;
    const list=boxesNear(GAME,node.position.x+fx*reach,node.position.z+fz*reach,opts.radius*.55,node);
    let best=null;
    for(let i=0;i<list.length;i++){
      const col=list[i],top=boxTop(col),bottom=finite(col.y,0)-finite(col.hy,0),contact=surfaceContact(col,top);
      if(top==null||top-feet<config.wallFlip.minHeight||bottom>feet+finite(opts.height,1.8)*.55||!contact||contact.distance>reach+opts.radius)continue;
      if(!best||contact.distance<best.contact.distance)best={collider:col,top,contact};
    }
    return best;
  }

  function groundBelow(x, z, feet){
    const world = GAME && GAME.world;
    let base = 0;
    if(world && typeof world.characterGroundHeight === 'function') base = finite(world.characterGroundHeight(x, z), 0);
    const stacked = topAt(GAME, x, z, feet + .05, options().radius * .6,owner());
    return stacked ? Math.max(base, stacked.top) : base;
  }

  // An edge above the head that the character can catch in mid-air. It is the
  // same query as probeLedge, only looking HIGHER: what makes a ledge a hang
  // rather than a mantle is simply that the feet cannot reach it.
  function probeHangLedge(offsetX, offsetZ){
    if(!config.hang.enabled) return null;
    const node = owner();
    if(!node || !node.position) return null;
    const opts = options();
    const feet = node.position.y;
    const fx = forwardX(), fz = forwardZ();
    const x = node.position.x + finite(offsetX, 0) + fx * config.hang.reach;
    const z = node.position.z + finite(offsetZ, 0) + fz * config.hang.reach;
    const found = topAt(GAME, x, z, feet + config.hang.maxHeight, opts.radius * .6,node);
    if(!found || found.top < feet + config.hang.minHeight) return null;
    const contact=surfaceContact(found.collider,found.top);
    if(!contact)return null;
    // The edge is only a ledge if there is somewhere to pull up ONTO.
    const standX = x + fx * (opts.radius + .2);
    const standZ = z + fz * (opts.radius + .2);
    const surface = topAt(GAME, standX, standZ, found.top + .06, opts.radius * .6,node);
    if(!surface || Math.abs(surface.top - found.top) > .25) return null;
    return {top:found.top, x:standX, z:standZ, collider:found.collider,contact};
  }

  function beginHang(ledge){
    const node = owner();
    if(!node || !ledge) return false;
    state.hang = ledge;
    state.mode = 'hang';
    const move = movement();
    if(move) move.reset();
    node.position.y = ledge.top - config.hang.drop;
    publishTargets(contactTargets(ledge.contact,'hang',0,{x:ledge.x,y:ledge.top,z:ledge.z}));
    if(pawn && pawn.state){ pawn.state.hanging = true; pawn.state.speed = 0; pawn.state.moving = false; }
    // Hanging is a POSE, not a one-shot: the body keeps holding the edge for as
    // long as the player stays on it. It is published by the frame rather than
    // here, so the shimmy direction the player is already asking for picks the take
    // on the FIRST frame instead of restarting the hold on the second.
    emit('OnCharacterLedgeGrabbed', {top:ledge.top});
    return true;
  }

  function releaseHang(reason){
    if(state.mode !== 'hang') return false;
    state.hang = null;
    state.mode = 'none';
    if(pawn && pawn.state) pawn.state.hanging = false;
    // Letting go of the edge lets go of the pose with it, or the body keeps
    // hanging in the air on the way down.
    actions.release();
    publishTargets(null);
    emit('OnCharacterLedgeReleased', {reason:reason || 'dropped'});
    return true;
  }

  // Pulling up is an ordinary mantle onto the edge already found, so the pose,
  // the arc and the landing are the same code the standing mantle uses.
  function pullUp(){
    const ledge = state.hang;
    if(!ledge) return false;
    state.hang = null;
    if(pawn && pawn.state) pawn.state.hanging = false;
    const node = owner();
    const rise = ledge.top - (node ? node.position.y : ledge.top);
    const started = beginTraversal({kind:'mantle', top:ledge.top, landY:ledge.top, x:ledge.x, z:ledge.z, rise,contact:ledge.contact,collider:ledge.collider});
    // A pull-up is slower than a standing mantle — unless an authored take is
    // already timing the move, in which case the clip wins. Overriding it here is
    // what made a long mantle finish travelling before it finished animating.
    if(started && state.traversal && state.traversal.clipDriven !== true) state.traversal.duration = config.hang.pullUpTime;
    return started;
  }

  function stepHang(dt, move){
    const node = owner();
    const ledge = state.hang;
    if(!node || !ledge) return false;
    const input = move || {};
    if(state.jumpPressedThisFrame || finite(input.z, 0) > .5) return pullUp() ? true : !releaseHang('failed');
    if(input.crouch === true) return !releaseHang('dropped');

    // Shimmy sideways, but only onto edge that actually continues: stepping off
    // the end of a ledge into thin air is the classic ledge-hang bug.
    const side = clamp(finite(input.x, 0), -1, 1);
    if(side !== 0 && config.hang.shimmy > 0){
      const step = side * config.hang.shimmy * dt;
      const dx = Math.cos(heading()) * step;
      const dz = -Math.sin(heading()) * step;
      const ahead = probeHangLedge(dx, dz);
      if(ahead && Math.abs(ahead.top - ledge.top) < .25){
        node.position.x += dx;
        node.position.z += dz;
        ledge.x += dx;
        ledge.z += dz;
        ledge.contact=ahead.contact;ledge.collider=ahead.collider;
      }
    }
    node.position.y = ledge.top - config.hang.drop;
    publishTargets(contactTargets(ledge.contact,'hang',0,{x:ledge.x,y:ledge.top,z:ledge.z}));
    if(pawn && pawn.state){ pawn.state.speed = Math.abs(side) * config.hang.shimmy; pawn.state.moving = Math.abs(side) > .1; }
    return true;
  }

  function probeClimbSurface(){
    if(!config.climb.enabled) return null;
    const node = owner();
    if(!node || !node.position) return null;
    const opts = options();
    const fx = forwardX(), fz = forwardZ();
    const x = node.position.x + fx * config.climb.reach;
    const z = node.position.z + fz * config.climb.reach;
    const boxes = boxesNear(GAME, x, z, opts.radius * .5,node);
    for(let i = 0; i < boxes.length; i++){
      const col = boxes[i];
      if(!isClimbable(col)) continue;
      const top = boxTop(col);
      if(top == null || top <= node.position.y + .2) continue;
      return {collider:col, top, ladder:false, x:col.x, z:col.z,contact:surfaceContact(col,top)};
    }
    return null;
  }

  function updateProbePreview(){
    if(!editorDebugAllowed(GAME,config.surfaceAdaptation)){removeDebugHelper();return null;}
    if(state.mode==='vault'||state.mode==='mantle'||state.mode==='climb'||state.mode==='hang')return state.traversalTargets;
    const found=probeLedge()||probeClimbSurface()||probeHangLedge(0,0);
    if(!found){updateDebugHelper(null);return null;}
    const kind=found.kind||(isClimbable(found.collider)?'climb':'hang');
    const root={x:finite(found.x,owner().position.x),y:finite(found.landY,found.top),z:finite(found.z,owner().position.z)};
    // Preview is diagnostic only. It must never publish runtime IK goals or the
    // Character would reach toward every highlighted obstacle before traversal.
    const targets=contactTargets(found.contact,kind,.45,root);updateDebugHelper(targets);return targets;
  }

  // --- traversal playback --------------------------------------------------

  function beginTraversal(ledge){
    const node = owner();
    if(!node || !ledge) return false;
    const variant=ledge.kind==='vault'?selectVaultVariant(config.vault,ledge):null;
    const duration = ledge.kind === 'vault' ? (variant&&variant.duration!=null?variant.duration:config.vault.duration) : config.mantle.duration;
    state.mode = ledge.kind;
    const warp=config.surfaceAdaptation.rootWarpWeight;
    const toX=finite(ledge.legacyX,ledge.x)+(ledge.x-finite(ledge.legacyX,ledge.x))*warp;
    const toZ=finite(ledge.legacyZ,ledge.z)+(ledge.z-finite(ledge.legacyZ,ledge.z))*warp;
    state.traversal = {
      kind:ledge.kind,
      time:0,
      duration,
      fromX:node.position.x, fromY:node.position.y, fromZ:node.position.z,
      toX, toY:ledge.landY, toZ,
      peak:Math.max(ledge.top, ledge.landY, node.position.y) + (ledge.kind === 'vault' ? .28 : .16),
      clipDriven:false,
      contact:ledge.contact||surfaceContact(ledge.collider,ledge.top),
      variantSlot:variant&&variant.slot||ledge.kind,
    };
    publishTargets(contactTargets(state.traversal.contact,ledge.kind,0,{x:toX,y:ledge.landY,z:toZ}));
    const move = movement();
    if(move) move.reset();
    // The tween lasts as long as the CLIP whenever there is one, exactly as the
    // roll does. A 0.52 s authored default under a 1.2 s vault take is what made a
    // vault read as a teleport followed by a mime of the vault it had just done.
    if(playAction(state.traversal.variantSlot)){
      const seconds = actions.clipSeconds();
      if(seconds > 0){
        state.traversal.duration = clamp(seconds, .2, 2.5);
        state.traversal.clipDriven = true;
      }
    }
    emit(ledge.kind === 'vault' ? 'OnCharacterVault' : 'OnCharacterMantle', {height:ledge.rise,depth:ledge.contact&&ledge.contact.depth||0,animationSlot:state.traversal.variantSlot});
    return true;
  }

  function beginWallFlip(surface){
    const node=owner();if(!node||!surface||state.wallFlipAwaitRunRelease)return false;
    const contact=surface.contact||{},normalLength=Math.hypot(finite(contact.normalX,0),finite(contact.normalZ,0))||1;
    state.mode='wallFlip';state.wallFlip={
      time:0,duration:config.wallFlip.duration,x:node.position.x,y:node.position.y,z:node.position.z,
      normalX:finite(contact.normalX,-forwardX())/normalLength,
      normalZ:finite(contact.normalZ,-forwardZ())/normalLength,
      lift:config.wallFlip.lift,pushback:config.wallFlip.pushback,contact,
    };
    const move=movement();if(move)move.reset();
    if(playAction('wallFlip',{speedScale:config.wallFlip.playbackRate,fitDuration:config.wallFlip.duration})){
      const seconds=actions.clipSeconds();if(seconds>0)state.wallFlip.duration=clamp(seconds,.12,2);
    }
    if(pawn&&pawn.state){pawn.state.speed=0;pawn.state.moving=false;pawn.state.traversal='wallFlip';pawn.state.traversalTime=0;}
    emit('OnCharacterWallFlip',{height:surface.top-node.position.y});return true;
  }

  function stepWallFlip(dt){
    const flip=state.wallFlip,node=owner();if(!flip||!node)return false;
    flip.time+=dt;
    const phase=clamp(flip.time/Math.max(.001,flip.duration),0,1);
    // Kinematic impulse synchronized with the authored take: leave the contact
    // face quickly, peak halfway through the somersault, then land at the same
    // floor height. The gameplay root now describes the move that the skeleton
    // shows instead of sliding in place against the wall.
    const retreat=1-Math.pow(1-phase,2),arc=Math.sin(Math.PI*phase);
    node.position.x=flip.x+flip.normalX*flip.pushback*retreat;
    node.position.y=flip.y+flip.lift*arc;
    node.position.z=flip.z+flip.normalZ*flip.pushback*retreat;
    if(pawn&&pawn.state){pawn.state.speed=0;pawn.state.moving=false;pawn.state.traversal='wallFlip';pawn.state.traversalTime=phase;}
    if(phase<1)return true;
    state.wallFlip=null;state.mode='none';state.wallFlipAwaitRunRelease=true;
    state.wallFlipSettleRemaining=config.wallFlip.settleDuration;
    if(pawn&&pawn.state){pawn.state.traversal=null;pawn.state.traversalTime=0;}
    emit('OnCharacterWallFlipFinished',{});return false;
  }

  // Traversals are position tweens, so they read the same in first and third
  // person and never fight the collision solver: collisions are simply not
  // consulted while one plays.
  function stepTraversal(dt){
    const tween = state.traversal;
    const node = owner();
    if(!tween || !node) return false;
    tween.time += dt;
    const t = clamp(tween.time / tween.duration, 0, 1);
    const k = ease(t);
    node.position.x = tween.fromX + (tween.toX - tween.fromX) * k;
    node.position.z = tween.fromZ + (tween.toZ - tween.fromZ) * k;
    // Arc: rise to the ledge in the first half, settle onto the landing in the
    // second. A straight lerp would clip the character through the obstacle.
    const up = tween.fromY + (tween.peak - tween.fromY) * ease(clamp(t * 2, 0, 1));
    const down = tween.peak + (tween.toY - tween.peak) * ease(clamp(t * 2 - 1, 0, 1));
    node.position.y = t < .5 ? up : down;
    publishTargets(contactTargets(tween.contact,tween.kind,t,{x:tween.toX,y:tween.toY,z:tween.toZ}));
    if(pawn && pawn.state){ pawn.state.traversal = tween.kind; pawn.state.traversalTime = t; }
    if(t < 1) return true;
    state.traversal = null;
    state.mode = 'none';
    if(pawn && pawn.state){ pawn.state.traversal = null; pawn.state.traversalTime = 0; }
    emit('OnCharacterTraversalFinished', {kind:tween.kind});
    publishTargets(null);
    return false;
  }

  // A TRANSITION: one shot, and the answer says whether a clip really started so
  // the caller can fall back to its procedural pose. Kept as a local name because
  // every call site below reads as "play this action".
  function playAction(name,options){ return !!actions.play(name,options); }

  // --- held poses ----------------------------------------------------------
  //
  // ONE place decides what the body is holding, from the mode the state machine
  // settled on this frame. Scattering that choice across the step functions is how
  // two of them end up asking for two different clips in the same frame, and the
  // pose restarts on every one of them.

  function isAiming(){
    const rig = pawn && pawn.firstPerson;
    return !!(rig && typeof rig.isAiming === 'function' && rig.isAiming());
  }

  function crouchPose(input){
    const move = input || {};
    const forward = clamp(finite(move.z, 0), -1, 1);
    const side = clamp(finite(move.x, 0), -1, 1);
    if(Math.abs(forward) < .1 && Math.abs(side) < .1) return isAiming() ? CROUCH_POSES.aim : CROUCH_POSES.idle;
    const sneaking = move.slowWalk === true;
    if(Math.abs(side) > Math.abs(forward)){
      if(side > 0) return sneaking ? CROUCH_POSES.sneakLeft : CROUCH_POSES.left;
      return sneaking ? CROUCH_POSES.sneakRight : CROUCH_POSES.right;
    }
    return forward > 0 ? CROUCH_POSES.forward : CROUCH_POSES.backward;
  }
  function hangPose(input){
    const side = clamp(finite(input && input.x, 0), -1, 1);
    if(side > .1) return HANG_POSES.left;
    if(side < -.1) return HANG_POSES.right;
    return HANG_POSES.hold;
  }
  function climbPose(input){
    const up = clamp(finite(input && input.z, 0), -1, 1);
    if(up > .1) return CLIMB_POSES.up;
    if(up < -.1) return CLIMB_POSES.down;
    return CLIMB_POSES.hold;
  }
  function poseFor(input){
    // A traversal, a roll and a slide are TRANSITIONS: they have already asked for
    // their own one-shot and must not have it replaced by a held pose.
    if(state.mode === 'hang') return hangPose(input);
    if(state.mode === 'climb') return climbPose(input);
    if(state.mode === 'crouch') return crouchPose(input);
    return null;
  }
  function updatePose(input){
    const names = poseFor(input);
    if(names){
      const staticCrouch=state.mode==='crouch'&&(names===CROUCH_POSES.idle||names===CROUCH_POSES.aim);
      // Entering crouch is a transition which clamps low. Directional crouch,
      // climbing, hanging and shimmying are cycles and remain genuine loops.
      actions.hold(names,{holdLastFrame:staticCrouch,loop:!staticCrouch});
    }
    else actions.release();
    // Published so anything else driving the same slot — the weapon pose layer, the
    // developer debugger — can see what traversal is holding rather than guessing.
    if(pawn && pawn.state) pawn.state.abilityPose = actions.heldSlot();
    return actions.heldSlot();
  }
  // Publishing the pose is the LAST thing every branch of the frame does, so
  // exactly one clip request leaves this module however the frame was claimed.
  function claim(input, owns){ updatePose(input); return owns; }

  // --- climbing ------------------------------------------------------------

  function beginClimb(surface){
    if(!config.climb.enabled || !surface) return false;
    state.climb = surface;
    state.mode = 'climb';
    const move = movement();
    if(move) move.reset();
    if(pawn && pawn.state) pawn.state.climbing = true;
    if(!surface.contact)surface.contact=surfaceContact(surface.collider,surface.top);
    publishTargets(contactTargets(surface.contact,'climb',0,{x:surface.contact?surface.contact.x:surface.x,y:surface.top,z:surface.contact?surface.contact.z:surface.z}));
    // Climbing is a POSE held for the whole ascent and the direction picks the take,
    // so the frame publishes it — a one-shot fired here left the character riding a
    // ladder in a standing idle as soon as the clip ran out.
    emit('OnCharacterClimbStarted', {ladder:surface.ladder === true});
    return true;
  }

  function endClimb(reason){
    if(state.mode !== 'climb') return false;
    state.climb = null;
    state.mode = 'none';
    if(pawn && pawn.state) pawn.state.climbing = false;
    actions.release();
    publishTargets(null);
    emit('OnCharacterClimbFinished', {reason:reason || 'released'});
    return true;
  }

  function stepClimb(dt, move){
    const node = owner();
    const surface = state.climb;
    if(!node || !surface) return false;
    const up = clamp(finite(move.z, 0), -1, 1);
    const side = clamp(finite(move.x, 0), -1, 1);
    node.position.y += up * config.climb.speed * dt;
    if(!surface.ladder && config.climb.strafe > 0){
      // Shuffle along the wall, perpendicular to the facing.
      node.position.x += Math.cos(heading()) * side * config.climb.strafe * dt;
      node.position.z += -Math.sin(heading()) * side * config.climb.strafe * dt;
    }
    if(surface.collider)surface.contact=surfaceContact(surface.collider,surface.top)||surface.contact;
    publishTargets(contactTargets(surface.contact,'climb',0,{x:surface.contact?surface.contact.x:surface.x,y:surface.top,z:surface.contact?surface.contact.z:surface.z}));
    const floor = groundBelow(node.position.x, node.position.z, node.position.y);
    if(node.position.y <= floor + .02){
      node.position.y = floor;
      return !endClimb('bottom');
    }
    // Reaching the top pops the character onto the ledge, exactly like a mantle.
    if(node.position.y >= surface.top - .1){
      const fx = forwardX(), fz = forwardZ();
      const opts = options();
      node.position.x += fx * (opts.radius + .3);
      node.position.z += fz * (opts.radius + .3);
      node.position.y = surface.top;
      endClimb('top');
      return false;
    }
    if(pawn && pawn.state){ pawn.state.speed = Math.abs(up) * config.climb.speed; pawn.state.moving = Math.abs(up) > .1; }
    return true;
  }

  // --- slide ---------------------------------------------------------------

  // A roll is the low-speed half of the same gesture: it carries the character
  // the same way, but it ends standing and spins the body instead of ducking.
  // Direction is the way the character is ALREADY going, which is what makes it
  // usable as an evade rather than a commitment to face forward.
  function beginRoll(speed,options){
    const request=options&&typeof options==='object'?options:{};
    if(!config.slide.enabled || state.slideCooldown > 0&&request.force!==true) return false;
    state.mode = 'roll';
    state.rollSpin = 0;
    state.rollProgress = 0;
    const requestedX=finite(request.dirX,NaN),requestedZ=finite(request.dirZ,NaN),requestedLength=Math.hypot(requestedX,requestedZ);
    state.slideDirX = Number.isFinite(requestedLength)&&requestedLength>.0001?requestedX/requestedLength:forwardX();
    state.slideDirZ = Number.isFinite(requestedLength)&&requestedLength>.0001?requestedZ/requestedLength:forwardZ();
    state.rollAnimated = playAction('roll',{speed:config.slide.rollPlaybackRate});
    const clipDuration=state.rollAnimated&&pawn&&pawn.state?finite(pawn.state.actionClipDuration,0):0;
    state.rollDuration=clipDuration>0?clamp(clipDuration,.1,8):config.slide.rollDuration;
    state.rollTimer=state.rollDuration;
    // Preserve exceptional incoming momentum without coupling ordinary dodge
    // travel to the raw clip length. For the bundled 1.8 s take the default is
    // 2.85 m, not the old 4.6 m/s multiplied by the longer animation.
    state.rollDistance=state.rollAnimated
      ?Math.max(config.slide.rollDistance,Math.max(0,finite(speed,0))*Math.min(config.slide.rollDuration,state.rollDuration))
      :Math.max(config.slide.rollSpeed,speed)*state.rollDuration;
    state.slideSpeed=state.rollDistance/state.rollDuration;
    if(state.rollAnimated)clearBodyPose();
    emit('OnCharacterRollStarted', {speed:state.slideSpeed,reason:String(request.reason||'dodge'),impact:Math.max(0,finite(request.impact,0))});
    return true;
  }

  function stepRoll(dt){
    const node = owner();
    if(!node) return false;
    state.rollTimer -= dt;
    const timerProgress=clamp(1-state.rollTimer/Math.max(.001,state.rollDuration),0,1);
    let t=timerProgress;
    if(state.rollAnimated){
      const locomotion=pawn&&pawn.locomotion,actionActive=pawn&&pawn.state&&pawn.state.actionClipPlaying===true&&pawn.state.actionClipName==='roll';
      // An animated roll follows AnimationAction progress, not a second wall
      // clock. If loading/mixer evaluation holds the clip on its first frame,
      // travel also waits; this removes the idle-looking forward slide before
      // the visible tumble. Once the action finishes, consume the final travel
      // fraction exactly once.
      if(actionActive&&locomotion&&typeof locomotion.actionProgress==='function')t=Math.max(state.rollProgress,clamp(locomotion.actionProgress(),0,1));
      else if(!actionActive)t=1;
      else t=state.rollProgress;
    }
    const travel=state.rollDistance*Math.max(0,t-state.rollProgress);
    state.rollProgress=t;
    node.position.x += state.slideDirX * travel;
    node.position.z += state.slideDirZ * travel;
    // One full tumble across the move, applied to the body rather than the view:
    // spinning the camera is how a roll becomes motion sickness.
    state.rollSpin = t;
    // One full tumble across the move, on the BODY and never on the view: the
    // camera reads its yaw and pitch from the rig, so this reads from outside
    // without spinning the player's own screen.
    if(!state.rollAnimated)setBodyPose(-t * Math.PI * 2, bodyPivotHeight(), 0);
    if(pawn&&pawn.state){pawn.state.speed=travel/Math.max(.0001,dt);pawn.state.moving=travel>.0001;pawn.state.rolling=t;}
    if(state.rollAnimated?t<.999:state.rollTimer>0)return true;
    clearBodyPose();
    state.rollAnimated = false;
    state.rollProgress = 0;
    state.slideCooldown = config.slide.cooldown;
    state.mode = 'none';
    if(pawn && pawn.state) pawn.state.rolling = 0;
    emit('OnCharacterRollFinished', {});
    return false;
  }

  function beginSlide(speed){
    if(!config.slide.enabled || state.slideCooldown > 0) return false;
    state.mode = 'slide';
    state.slideTimer = config.slide.duration;
    state.slideSpeed = speed * config.slide.boost;
    state.slideDirX = forwardX();
    state.slideDirZ = forwardZ();
    // An authored take is the ONLY slide visual when there is one. The procedural
    // lean below is the fallback, and running both laid the body a further 0.85 rad
    // back on top of a clip that was already doing it — the same mistake the roll
    // made before it learned to ask.
    state.slideAnimated = playAction('slide');
    if(state.slideAnimated) clearBodyPose();
    emit('OnCharacterSlideStarted', {speed:state.slideSpeed});
    return true;
  }

  function stepSlide(dt){
    const node = owner();
    if(!node) return false;
    state.slideTimer -= dt;
    state.slideSpeed = Math.max(0, state.slideSpeed - config.slide.friction * dt);
    node.position.x += state.slideDirX * state.slideSpeed * dt;
    node.position.z += state.slideDirZ * state.slideSpeed * dt;
    if(pawn && pawn.state){ pawn.state.speed = state.slideSpeed; pawn.state.moving = true; pawn.state.sliding = true; }
    // A slide has a POSE even with no clip bound: the body drops and leans back
    // over its own hips, eases in over the first fifth of the move and recovers
    // as it runs out of speed. Without it a slide was pure translation and read
    // as the character skating upright.
    if(!state.slideAnimated){
      const slideProgress = clamp(1 - state.slideTimer / Math.max(.05, config.slide.duration), 0, 1);
      const settle = Math.min(1, slideProgress / .2);
      const recover = 1 - Math.max(0, (slideProgress - .75) / .25);
      const blend = clamp(Math.min(settle, recover), 0, 1);
      setBodyPose(SLIDE_PITCH * blend, bodyPivotHeight() * .5, SLIDE_DROP * blend);
    }
    if(state.slideTimer > 0 && state.slideSpeed > 1.2) return true;
    clearBodyPose();
    state.slideAnimated = false;
    state.slideCooldown = config.slide.cooldown;
    state.mode = state.crouchHeld || headroomBlocked() ? 'crouch' : 'none';
    if(pawn && pawn.state) pawn.state.sliding = false;
    emit('OnCharacterSlideFinished', {});
    return false;
  }

  // --- frame ---------------------------------------------------------------

  // Runs before the movement controller. Returning true tells the Pawn to skip
  // ordinary locomotion this frame because a traversal owns the transform.
  function preMovement(dt, move){
    if(!config.enabled) return false;
    // Something else owns the body this frame (cover). Stand down completely
    // rather than half-running: a state machine that keeps latching a crouch
    // while another one drives the transform is how both end up wrong.
    if(state.suspended) return false;
    const h = clamp(finite(dt, .016), .0001, .1);
    const input = move || {};
    const jumpPressed=input.jump===true;state.jumpPressedThisFrame=jumpPressed&&!state.jumpHeld;state.jumpHeld=jumpPressed;
    state.slideCooldown = Math.max(0, state.slideCooldown - h);
    actions.tick(h);
    updateProbePreview();
    // Track the fall so the landing below knows how far it was. Sampled here,
    // before the movement controller zeroes the velocity on contact.
    const falling = pawn && pawn.state ? finite(pawn.state.velocityY, 0) : 0;
    if(pawn && pawn.state && pawn.state.grounded === false) state.fallSpeed = Math.max(state.fallSpeed, -falling);
    if(state.landRecovery > 0) state.landRecovery = Math.max(0, state.landRecovery - h);

    if(state.mode === 'vault' || state.mode === 'mantle'){
      applyCrouchBlend(h);
      return claim(input, stepTraversal(h));
    }
    if(state.mode === 'hang'){
      applyCrouchBlend(h);
      return claim(input, stepHang(h, input));
    }
    if(state.mode === 'climb'){
      applyCrouchBlend(h);
      // Jumping off a wall or ladder is always allowed and always instant.
      if(state.jumpPressedThisFrame){ endClimb('jump'); return false; }
      return claim(input, stepClimb(h, input));
    }
    if(state.mode === 'slide'){
      applyCrouchBlend(h);
      if(stepSlide(h)) return claim(input, true);
    }
    if(state.mode === 'roll'){
      applyCrouchBlend(h);
      if(stepRoll(h)) return claim(input, true);
    }
    if(state.mode === 'wallFlip'){
      applyCrouchBlend(h);
      if(stepWallFlip(h))return claim(input,true);
    }

    const runHeld=input.sprint===true||finite(input.sprintAmount,0)>.5;
    if(state.wallFlipAwaitRunRelease){
      if(!runHeld||finite(input.z,0)<.1){state.wallFlipAwaitRunRelease=false;state.wallFlipSettleRemaining=0;}
      else {
        state.wallFlipSettleRemaining=Math.max(0,state.wallFlipSettleRemaining-h);
        // Continue as a walk, not a full sprint animation. movementScale below
        // supplies the smooth slow-to-idle curve while the collision solver
        // brings the Pawn naturally back to the wall.
        input.sprint=false;input.sprintAmount=0;
      }
    }

    // Crouch input: hold or toggle, but never while the head is under something.
    const crouchAmount = clamp(finite(input.crouchAmount, input.crouch === true ? 1 : 0), 0, 1);
    const crouchPressed = input.crouch === true || crouchAmount > .5;
    if(config.crouch.enabled){
      if(config.crouch.toggle){
        if(crouchPressed && !state.crouchHeld) state.crouchLatched = !state.crouchLatched;
        state.crouchTarget = state.crouchLatched ? 1 : 0;
      } else {
        state.crouchLatched = crouchAmount > .001;
        state.crouchTarget = crouchAmount;
      }
    }
    state.crouchHeld = crouchPressed;
    // Sprinting cancels a crouch outright: asking the player to press Crouch
    // again before they can run is a step that never has a different answer.
    // A forced crouch under a low ceiling still wins, because it has to.
    if((input.sprint === true || finite(input.sprintAmount,0) > .001) && state.crouchLatched){ state.crouchLatched = false; state.crouchTarget = 0; }
    const wantsCrouch = config.crouch.enabled && (state.crouchLatched || headroomBlocked());

    const speed = pawn && pawn.state ? finite(pawn.state.speed, 0) : 0;
    const grounded = pawn && pawn.state ? pawn.state.grounded !== false : true;

    // Running squarely into a tall wall is a distinct traversal. After it ends,
    // only the action is latched off; movement remains live and responsive.
    if(!state.wallFlipAwaitRunRelease&&grounded&&!state.jumpPressedThisFrame&&runHeld&&finite(input.z,0)>.55&&speed>=config.wallFlip.minSpeed){
      // Reachable geometry belongs to vault/mantle/climb. Wall Flip is the
      // fallback for a face whose top is genuinely above those systems, never
      // the first answer for every obstacle the sprint probe happens to hit.
      const reachable=probeLedge()||probeClimbSurface();
      if(!reachable){const wall=probeWallFlip();if(wall&&beginWallFlip(wall))return claim(input,true);}
    }

    // Double-tap Dodge. At speed it is a slide, at a walk it is a roll — one
    // gesture, and what the character is already doing picks the move. The tap
    // clock runs unconditionally so the timing feels the same everywhere.
    state.dodgeTapAge += h;
    const dodgePressed = input.dodge === true;
    if(dodgePressed && !state.dodgeHeld){
      const busy = state.mode === 'slide' || state.mode === 'roll';
      if(state.dodgeTapAge <= config.slide.doubleTapWindow && grounded && !busy){
        state.dodgeTapAge = 99;
        state.dodgeHeld = true;
        const started = speed >= config.slide.minSpeed ? beginSlide(speed) : beginRoll(speed);
        if(started) return claim(input, true);
      }
      state.dodgeTapAge = 0;
    }
    state.dodgeHeld = dodgePressed;

    if(state.mode !== 'slide') state.mode = wantsCrouch ? 'crouch' : 'none';

    // Vault / mantle: the Jump button in front of a ledge becomes a traversal.
    // Free jumps are unaffected because the probe only fires when something is
    // actually there.
    if(state.jumpPressedThisFrame && grounded && !wantsCrouch){
      const ledge = probeLedge();
      if(ledge && (ledge.kind !== 'vault' || speed >= config.vault.minSpeed)){
        if(beginTraversal(ledge)) return claim(input, true);
      }
    }
    // Grabbing a climbable wall: push into it and press Jump.
    if(state.jumpPressedThisFrame && !state.climb){
      const surface = probeClimbSurface();
      if(surface && beginClimb(surface)) return claim(input, true);
    }
    // Falling past an edge within arm's reach catches it. Automatic on purpose:
    // asking the player to press a key at the apex of a jump is a coordination
    // test, not a traversal system.
    if(!grounded && finite(pawn && pawn.state && pawn.state.velocityY, 0) <= .2){
      const ledge = probeHangLedge(0, 0);
      if(ledge && beginHang(ledge)) return claim(input, true);
    }

    applyCrouchBlend(h);
    state.lastGrounded = grounded;
    return claim(input, false);
  }

  // Speed multiplier the Pawn applies to the movement input. Crouch and slow
  // walk are speed scales rather than separate gaits, so every existing
  // acceleration and animation curve keeps working.
  function movementScale(move){
    if(!config.enabled) return 1;
    let scale = 1;
    if(state.crouchBlend > 0) scale *= 1 - (1 - config.crouch.speedScale) * state.crouchBlend;
    if(config.walk.enabled && move && move.slowWalk === true) scale *= config.walk.speedScale;
    if(state.wallFlipAwaitRunRelease&&move&&finite(move.z,0)>.1){
      const remaining=clamp(state.wallFlipSettleRemaining/Math.max(.001,config.wallFlip.settleDuration),0,1);
      scale*=config.wallFlip.settleSpeedScale*remaining;
    }
    // A heavy landing plants the feet for a moment. It fades back in over the
    // recovery window rather than switching off, so the character does not
    // lurch the instant the timer expires.
    if(state.landRecovery > 0) scale *= 1 - .75 * clamp(state.landRecovery / Math.max(.001, config.land.recovery), 0, 1);
    return scale;
  }

  function afterMovement(dt, move, snapshot){
    if(pawn && pawn.state){
      pawn.state.ability = state.mode;
      pawn.state.crouch = state.crouchBlend;
    }
    if(snapshot && snapshot.justLanded) resolveLanding(move);
    return state;
  }

  // What a landing costs. Three outcomes, decided by the speed the body hit the
  // ground at, from the ONE table below rather than from magic numbers spread
  // through the branch.
  const LANDINGS = Object.freeze({
    // Ordered by severity, which is also the order they are tested.
    roll:'roll',      // fast, and going somewhere: convert the fall into distance
    heavy:'heavy',    // fast, but standing still: plant the feet for a moment
    soft:'soft',      // ordinary step off a kerb
    dead:'dead',      // lethal impact: ragdoll/death physics owns the body
  });
  function resolveLanding(move){
    const speed = state.fallSpeed;
    state.fallSpeed = 0;
    const travelling = pawn && pawn.state ? finite(pawn.state.speed, 0) : 0;
    // A roll is the authored way to absorb a dangerous impact while carrying
    // momentum. It therefore happens before fall damage, not after it.
    if(speed >= config.land.rollSpeed && travelling >= config.land.minSpeed && state.mode === 'none'){
      if(beginRoll(Math.max(travelling, config.slide.rollSpeed))){
        shakeCamera(config.land.rollSpeed > 0 ? clamp(speed / 18, .2, 1) : .3);
        emit('OnCharacterLandRoll', {speed, travelling});
        return LANDINGS.roll;
      }
    }
    const damaging = config.land.enabled && speed >= config.land.damageSpeed;
    if(!damaging){
      // A dedicated crouched impact is optional. Until the author supplies one,
      // keep the airborne-to-ground transition visible through the ordinary
      // moving/still landing chain instead of exposing a bind pose.
      if(state.crouchBlend > .5){
        playAction(travelling>=config.land.minSpeed?['landCrouch','landMoving','land']:['landCrouch','land','landMoving']);
        return LANDINGS.soft;
      }
      playAction(travelling >= config.land.minSpeed ? 'landMoving' : 'land');
      return LANDINGS.soft;
    }
    const fallDamage = Math.max(0, (speed - config.land.damageSpeed) * config.land.damageScale);
    let damageResult = null;
    if(fallDamage > 0 && pawn && pawn.vitals && typeof pawn.vitals.applyDamage === 'function'){
      const node = owner();
      damageResult = pawn.vitals.applyDamage(fallDamage, {
        source:'fall', direction:{x:0,y:-1,z:0}, force:speed,
        point:node && node.position ? {x:node.position.x,y:node.position.y,z:node.position.z} : null,
      });
      emit('OnCharacterFallDamage', {speed, damage:fallDamage, killed:!!(damageResult && (damageResult.killed || damageResult.dead))});
    }
    const dead = !!(damageResult && (damageResult.killed || damageResult.dead)) ||
      !!(pawn && pawn.vitals && pawn.vitals.state && pawn.vitals.state.dead);
    if(dead) return LANDINGS.dead;
    state.landRecovery = config.land.recovery;
    playAction('landHeavy');
    shakeCamera(clamp(speed / 22, .15, 1));
    emit('OnCharacterHardLanding', {speed});
    return LANDINGS.heavy;
  }

  // Traversal and landings are impacts the camera should feel. The rig owns the
  // shake, so this only charges it: the ability set never touches the camera.
  function shakeCamera(share){
    const rig = pawn && pawn.firstPerson;
    if(!rig || !rig.addTrauma || !rig.config) return 0;
    const shake = rig.config().shake;
    return rig.addTrauma((shake && shake.traversal != null ? shake.traversal : .22) * clamp(finite(share, 1), 0, 1));
  }

  // What the Use key does when there is nothing to use: climb whatever is in
  // front. Hanging pulls up, a ledge on the ground is vaulted or mantled, a
  // climbable face is grabbed. Returns false when there is nothing to climb, so
  // the caller can fall through to another verb.
  function tryTraversal(){
    if(state.mode === 'hang') return pullUp();
    if(isBusyState()) return false;
    const ledge = probeLedge();
    if(ledge) return beginTraversal(ledge);
    const surface = probeClimbSurface();
    if(surface) return beginClimb(surface);
    const hang = probeHangLedge(0, 0);
    return hang ? beginHang(hang) : false;
  }
  function isBusyState(){
    return state.mode === 'vault' || state.mode === 'mantle' || state.mode === 'climb' || state.mode === 'slide' || state.mode === 'wallFlip';
  }

  // Handing the body to another state machine (cover) and taking it back.
  function suspend(value){
    const next = value !== false;
    if(next === state.suspended) return state.suspended;
    state.suspended = next;
    if(next){
      state.mode = 'none';
      state.traversal = null;
      state.climb = null;
      state.hang = null;
      // The pose goes back with the body. Cover is about to hold one of its own,
      // and the two share a single slot on the Pawn.
      actions.release();
      publishTargets(null);
      if(pawn && pawn.state){ pawn.state.hanging = false; pawn.state.sliding = false; pawn.state.abilityPose = null; }
    }
    return state.suspended;
  }

  function reset(){
    state.mode = 'none';
    state.suspended = false;
    state.fallSpeed = 0;
    state.landRecovery = 0;
    state.crouchBlend = 0;
    state.crouchTarget = 0;
    state.crouchLatched = false;
    state.slideTimer = 0;
    state.slideCooldown = 0;
    state.dodgeHeld = false;
    state.jumpHeld = false;state.jumpPressedThisFrame=false;
    state.dodgeTapAge = 99;
    state.rollTimer = 0;
    state.rollSpin = 0;
    state.rollAnimated = false;
    state.rollDuration = 0;
    state.rollDistance = 0;
    state.rollProgress = 0;
    state.slideAnimated = false;
    state.wallFlip=null;
    state.wallFlipAwaitRunRelease=false;
    state.wallFlipSettleRemaining=0;
    actions.release();
    if(pawn && pawn.state) pawn.state.abilityPose = null;
    const node = owner();
    if(node && node.rotation) node.rotation.x = 0;
    clearBodyPose();
    if(pawn && pawn.state){ pawn.state.rolling = 0; pawn.state.sliding = false; }
    state.traversal = null;
    state.climb = null;
    state.hang = null;
    publishTargets(null);
    removeDebugHelper();
    if(pawn && pawn.state) pawn.state.hanging = false;
    const move = movement();
    if(move && state.baseHeight != null) move.configure({height:state.baseHeight});
    const rig = pawn && pawn.firstPerson;
    if(rig && rig.setEyeOffset) rig.setEyeOffset(0);
    return state;
  }

  function applyBinding(path, value){
    const key = String(path || '');
    if(key.indexOf('abilities.') !== 0) return false;
    const parts = key.slice(10).split('.');
    if(parts.length === 1){
      const patch = {}; patch[parts[0]] = value;
      Object.assign(config, normalizeConfig(Object.assign({}, config, patch)));
      return true;
    }
    const group = config[parts[0]];
    if(!group) return false;
    const patch = {}; patch[parts[0]] = Object.assign({}, group);
    patch[parts[0]][parts[1]] = value;
    Object.assign(config, normalizeConfig(Object.assign({}, config, patch)));
    return true;
  }

  return Object.freeze({
    STATES,
    LANDINGS,
    config:() => config,
    state,
    preMovement,
    afterMovement,
    movementScale,
    reset,
    suspend,
    isSuspended:() => state.suspended,
    resolveLanding,
    // Vehicle dismounts and scripted physical transitions use the same authored
    // roll as dodge/landing, but may supply their actual world direction.
    beginRoll,
    applyBinding,
    // Used by the interaction system when the player mounts a ladder.
    beginClimb,
    endClimb,
    beginTraversal,
    beginHang,
    releaseHang,
    probeLedge,
    probeHangLedge,
    probeClimbSurface,
    probeWallFlip,
    updateProbePreview,
    traversalTargets:() => state.traversalTargets,
    tryTraversal,
    isHanging:() => state.mode === 'hang',
    isBusy:() => isBusyState() || state.mode === 'hang',
    mode:() => state.mode,
    crouchAmount:() => state.crouchBlend,
  });
}

// ------------------------------------------------ pawn attachment
// Composes onto the Pawn hooks like the first-person rig does. Attach this
// BEFORE the first-person controller so the view still updates during a
// traversal: the later attachment runs its own hook first.

function attach(GAME, pawn, source){
  if(!pawn) return null;
  const controller = create(GAME, pawn, source);
  const previousBefore = pawn.beforeMovementStep;
  const previousAfter = pawn.afterMovementStep;
  const previousScale = pawn.movementScale;
  pawn.beforeMovementStep = function(dt, move){
    if(controller.preMovement(dt, move) === true) return true;
    return typeof previousBefore === 'function' ? previousBefore.call(this, dt, move) : false;
  };
  pawn.afterMovementStep = function(dt, move, snapshot){
    controller.afterMovement(dt, move, snapshot);
    if(typeof previousAfter === 'function') previousAfter.call(this, dt, move, snapshot);
  };
  pawn.movementScale = function(move){
    const previous = typeof previousScale === 'function' ? previousScale.call(this, move) : 1;
    return previous * controller.movementScale(move);
  };
  const previousReset = pawn.reset.bind(pawn);
  pawn.reset = function(){ const done = previousReset(); controller.reset(); return done; };
  const previousDispose = typeof pawn.dispose === 'function' ? pawn.dispose.bind(pawn) : null;
  pawn.dispose = function(){ controller.reset(); return previousDispose ? previousDispose() : true; };
  pawn.abilities = controller;
  return controller;
}

window.LK_RUNTIME_CHARACTER_ABILITIES = Object.freeze({
  STATES,
  CROUCH_POSES,
  HANG_POSES,
  CLIMB_POSES,
  normalizeConfig,
  normalizeVaultVariants,
  selectVaultVariant,
  isClimbable,
  boxSurfaceProbe,
  windowWeight,
  editorDebugAllowed,
  // Published for the cover state machine, which drives the SAME one-shot slot on
  // the Pawn and therefore has to hold and release a pose the same way.
  createActionLayer,
  create,
  attach,
});
})();
