/* =========================================================
   LOT KING - Procedural quadruped rig and locomotion

   The repository ships no cat/dog/horse GLB, so an Animal Pawn would otherwise
   be invisible and unplayable until an author finds a rigged model. This builds
   a species-proportioned primitive quadruped and drives it with real gaits and
   a behaviour vocabulary, exposing the SAME public controller contract as
   character-placeholder-locomotion.js (bind/update/playAction/stopAction/
   configure/dispose/isBound/...), so the Animal Pawn can swap to a rigged GLB
   controller without the caller special-casing either one.

   WHY THE RIG LOOKS LIKE THIS (references studied)
     - Real felid osteology (scapula / humerus / radius-ulna / metacarpus and
       femur / tibia / tarsus (hock) / metatarsus, digitigrade stance, cats walk
       on their toes with permanently flexed joints). The old rig was one
       stretched sphere on two-bone straight legs; that is the "sausage" read.
       Sources: anatomylearner.com cat skeleton + cat leg anatomy, Wikipedia
       "Hock (anatomy)", Lumen comparative anatomy "Cat limbs".
     - Feline gait literature: four-beat LATERAL-SEQUENCE walk, lateral-couplet
       amble/pace at intermediate speed, DIAGONAL trot, four-beat ROTARY gallop
       with two suspension phases. Sources: Veterian Key "Feline Locomotive
       Behavior", Fear Free "What movement and gait tell you about your cat".
     - Stray (BlueTwelve): the cat was animated from live reference (the office
       sphynx), and what sells it is the tail language and the constant fluid
       curve of the body - not extra polygons. Sources: Unreal Engine "28 people
       and two cats", GameRant behind-the-scenes.
     - Little Kitty, Big City (Double Dagger): the animation lead's unifying
       rule is "make each shape fluid from nose to tail, whatever the cat is
       doing", plus a behaviour vocabulary (stretch, nap, making biscuits, sit
       where it fits) treated as first-class verbs. Source: Game Developer
       "Deep Dive: how the animation rejects realism to achieve authenticity".

   WHAT WAS DERIVED FROM THEM
     1. The torso is FOUR masses on a THREE-JOINT spine (croup, loin, ribcage,
        sternum) with a laterally compressed, DEEPER-THAN-WIDE chest and a
        visible waist. One ellipsoid can never read as a cat.
     2. Every limb is a solved DIGITIGRADE chain, not two straight bones, and
        the chain is scaled so the paw lands exactly on the ground plane.
     3. Gaits are stance/swing footfall tables from the real sequences, blended
        by speed, with spine flexion on the gallop and a lateral spine wave on
        the walk.
     4. Tail, ears and head are driven by a lag spring / attention target, which
        is the cheapest thing that reads as "alive".

   HOW THIS FILE IS ORGANISED
     00  numeric helpers and editor primitive bases
     01  species profiles          authored proportions, one row per species
     02  body classes              torso masses, stance chains, palettes
     03  skeleton solver           derived (never authored) metrics
     04  rig graph                 the part table, nose to tail to paws
     05  scene elements and visual the two consumers of the part table
     06  gait cycles               footfall tables from real feline gaits
     07  behaviour vocabulary      stretch, sit, groom, knead, pounce, ...
     08  controller                bind, pose solvers, per-frame update
     09  public surface
   ========================================================= */
(function(){
'use strict';

// ====================================================== 00 numeric helpers

function finite(value, fallback){ const n=Number(value); return Number.isFinite(n)?n:fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function round(value){ return Math.round(finite(value,0)*10000)/10000; }
function normalizeName(name){ return String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,''); }
const DEG = Math.PI/180;

// Editor preview primitives are authored at fixed base sizes (scene-store
// logicElementPrimitiveGeometry). Authoring the rig in metres and dividing by
// those bases keeps the editor dummy and the runtime visual identical instead
// of drifting apart by a constant primitive-size factor.
const BASE = Object.freeze({sphere:.96, cylinderRadius:.84, cylinderHeight:.9, box:.8, coneRadius:.92, coneHeight:.95});
function sphereScale(x,y,z){ return [round(x/BASE.sphere), round(y/BASE.sphere), round(z/BASE.sphere)]; }
function boxScale(x,y,z){ return [round(x/BASE.box), round(y/BASE.box), round(z/BASE.box)]; }
function cylinderScale(diameter,height){ return [round(diameter/BASE.cylinderRadius), round(height/BASE.cylinderHeight), round(diameter/BASE.cylinderRadius)]; }
function coneScale(diameter,height){ return [round(diameter/BASE.coneRadius), round(height/BASE.coneHeight), round(diameter/BASE.coneRadius)]; }

// ====================================================== 01 species profiles
//
// standHeight is the body-root (sacrum) height above the ground; every limb
// length is DERIVED from it in section 03 so no profile can author a body that
// floats or sinks. detailLevel prunes the part table: 0 silhouette, 1 standard,
// 2 full (whisker, claw and pupil detail). It is the low-end fallback for every
// cosmetic mesh this rig added over the old two-bone placeholder.

const SPECIES = Object.freeze(['cat','dog','horse','generic']);
const DETAIL = Object.freeze({silhouette:0, standard:1, full:2});

const PROFILES = Object.freeze({
  cat:{label:'Cat',bodyLength:.46,bodyRadius:.105,standHeight:.30,headSize:.10,muzzle:.038,neckLength:.10,neckPitch:50,earSize:.055,earTilt:9,tailLength:.30,tailLift:38,tailCurl:30,
    whiskers:3,detailLevel:2,
    colors:{fur:'#9a8f80',belly:'#e8e0d2',accent:'#3b342c',eye:'#c7d94f',skin:'#d98c93'}},
  dog:{label:'Dog',bodyLength:.68,bodyRadius:.16,standHeight:.55,headSize:.145,muzzle:.082,neckLength:.16,neckPitch:44,earSize:.085,earTilt:28,tailLength:.34,tailLift:38,tailCurl:18,
    whiskers:2,detailLevel:2,
    colors:{fur:'#9a6b3f',belly:'#e4cba7',accent:'#4a3120',eye:'#3b2a17',skin:'#2f231c'}},
  horse:{label:'Horse',bodyLength:1.34,bodyRadius:.36,standHeight:1.52,headSize:.24,muzzle:.20,neckLength:.56,neckPitch:30,earSize:.10,earTilt:12,tailLength:.66,tailLift:-14,tailCurl:10,
    whiskers:0,detailLevel:1,
    colors:{fur:'#6b4423',belly:'#8b5a30',accent:'#2b1b10',eye:'#241a12',skin:'#2b1b10'}},
  generic:{label:'Animal',bodyLength:.80,bodyRadius:.20,standHeight:.72,headSize:.17,muzzle:.09,neckLength:.22,neckPitch:44,earSize:.08,earTilt:18,tailLength:.42,tailLift:20,tailCurl:16,
    whiskers:2,detailLevel:1,
    colors:{fur:'#7c8b93',belly:'#c4ccd1',accent:'#33403f',eye:'#1f2a2e',skin:'#8a6f6a'}},
});

/** Boundary sanitizer: an unknown species from a saved project or a select box
 *  becomes 'generic' instead of crashing the editor. Every INTERNAL table
 *  lookup below throws instead, so a typo inside this file is never absorbed. */
function normalizeSpecies(value){ const key=String(value||'').toLowerCase(); return SPECIES.includes(key)?key:'generic'; }
function speciesProfile(species){
  const row=PROFILES[species];
  if(!row) throw new Error('animal rig: unknown species profile "'+species+'"');
  return row;
}

// ========================================================= 02 body classes
//
// Three named tables, each keyed by the same species set. A row missing from
// any of them throws in section 03 rather than silently borrowing a neighbour's
// build, which is how a horse used to end up wearing cat proportions.

// -- 02.1 torso masses. Multipliers of bodyRadius, read left to right in the
//    order the masses sit along the spine: chest (front), loin (waist), croup
//    (rear). The CHEST IS DEEPER THAN WIDE on every quadruped here - the old
//    rig had it wider than deep, which is exactly what made it read as a
//    sausage seen from any angle.
function torso(chestW, chestD, loinW, loinD, croupW, croupD){ return {chestW, chestD, loinW, loinD, croupW, croupD}; }
const TORSO = Object.freeze({
  cat:     torso(1.50, 2.04, 1.26, 1.44, 1.74, 1.66),
  dog:     torso(1.62, 1.94, 1.40, 1.52, 1.78, 1.70),
  horse:   torso(1.44, 2.12, 1.34, 1.60, 1.66, 1.74),
  generic: torso(1.55, 1.92, 1.35, 1.50, 1.72, 1.66),
});

// -- 02.2 stance chains. `fraction` is the share of the joint-to-ground drop the
//    bone spans; `angle` is its LOCAL pitch in degrees, positive swinging the
//    far end backwards. Read top down: shoulder to toe, hip to toe.
//
//    digitigrade (cat, dog): the metacarpus/metatarsus is a full weight-bearing
//    segment standing almost upright - that raised "wrist" and the sharply bent
//    hock are the whole feline leg read. unguligrade (horse): a longer, much
//    straighter cannon on a hoof.
function link(id, name, fraction, angle, girth){ return {id, name, fraction, angle, girth}; }
const STANCE = Object.freeze({
  digitigrade:{
    front:[link('upper','Humerus',.34, 34,1.16), link('shin','Radius',.36,-34,.94), link('cannon','Metacarpus',.30,-6,.76)],
    hind: [link('upper','Femur',  .30,-34,1.32), link('shin','Tibia', .34, 64,.98), link('cannon','Metatarsus',.36,-32,.72)],
  },
  unguligrade:{
    front:[link('upper','Humerus',.28, 40,1.24), link('shin','Radius',.34,-38,1.00), link('cannon','Cannon',.38,-4,.62)],
    hind: [link('upper','Femur',  .26,-28,1.40), link('shin','Tibia', .32, 52,1.04), link('cannon','Cannon',.42,-26,.60)],
  },
});
// stanceBend scales every angle in the chain: a cat is the most crouched
// digitigrade of the set, a generic quadruped the straightest.
const BUILD = Object.freeze({
  cat:     {stance:'digitigrade', stanceBend:1.00, rump:.055, chestDrop:.30},
  dog:     {stance:'digitigrade', stanceBend:.86,  rump:.030, chestDrop:.28},
  horse:   {stance:'unguligrade', stanceBend:1.00, rump:.010, chestDrop:.24},
  generic: {stance:'digitigrade', stanceBend:.80,  rump:.025, chestDrop:.26},
});

// -- 02.3 palette keys. Every mesh names one of these; an unknown key throws.
const COLOR_KEYS = Object.freeze(['fur','belly','accent','eye','skin']);

// ===================================================== 03 skeleton solver
//
// Everything here is DERIVED. Authors edit section 01; nothing in this section
// may be authored, because these are the numbers that keep the paws on the
// ground and the masses on the spine.

/** Scale a stance chain so the summed vertical drop is exactly `dropHeight`.
 *  Returns absolute bone lengths plus how far the paw ends up in front of (+) or
 *  behind (-) the joint, which callers use to place the footprint. */
function solveLimb(chain, dropHeight, stanceBend){
  const out=[]; let cumulative=0, drop=0, reach=0;
  for(let index=0;index<chain.length;index++){
    const bone=chain[index], local=bone.angle*stanceBend;
    cumulative+=local;
    const radians=cumulative*DEG;
    drop+=bone.fraction*Math.cos(radians);
    reach-=bone.fraction*Math.sin(radians);
    out.push({id:bone.id,name:bone.name,girth:bone.girth,angle:local,cumulative});
  }
  if(!(drop>.05)) throw new Error('animal rig: stance chain collapses (normalized drop '+drop+')');
  const scale=dropHeight/drop;
  for(let index=0;index<out.length;index++) out[index].length=chain[index].fraction*scale;
  return {bones:out, reach:reach*scale};
}

function profile(species, overrides){
  const key=normalizeSpecies(species), base=speciesProfile(key), src=overrides&&typeof overrides==='object'?overrides:{};
  const out=Object.assign({species:key},base,src);
  out.colors=Object.assign({},base.colors,src.colors||{});

  // -- 03.1 authored values, clamped to something buildable
  out.bodyLength=Math.max(.05,finite(out.bodyLength,base.bodyLength));
  out.bodyRadius=Math.max(.02,finite(out.bodyRadius,base.bodyRadius));
  out.standHeight=Math.max(out.bodyRadius*1.05,finite(out.standHeight,base.standHeight));
  out.headSize=Math.max(.01,finite(out.headSize,base.headSize));
  out.muzzle=Math.max(.004,finite(out.muzzle,base.muzzle));
  out.neckLength=Math.max(.01,finite(out.neckLength,base.neckLength));
  out.earSize=Math.max(.004,finite(out.earSize,base.earSize));
  out.tailLength=Math.max(.01,finite(out.tailLength,base.tailLength));
  out.whiskers=Math.round(clamp(finite(out.whiskers,base.whiskers),0,5));
  out.detailLevel=Math.round(clamp(finite(out.detailLevel,base.detailLevel),0,2));

  // -- 03.2 torso masses
  const shape=TORSO[key]; if(!shape) throw new Error('animal rig: no torso class for "'+key+'"');
  const build=BUILD[key]; if(!build) throw new Error('animal rig: no build class for "'+key+'"');
  out.chestWidth=out.bodyRadius*shape.chestW; out.chestDepth=out.bodyRadius*shape.chestD;
  out.loinWidth=out.bodyRadius*shape.loinW;   out.loinDepth=out.bodyRadius*shape.loinD;
  out.croupWidth=out.bodyRadius*shape.croupW; out.croupDepth=out.bodyRadius*shape.croupD;

  // -- 03.3 joint heights. Hips ride slightly higher than shoulders on a cat,
  //    which is what gives a standing cat its forward-tipped, ready look.
  out.pawRadius=Math.max(.012,out.bodyRadius*.40);
  out.shoulderY=Math.max(out.pawRadius*2,out.standHeight-out.bodyRadius*(build.chestDrop+build.rump));
  out.hipY=Math.max(out.pawRadius*2,out.standHeight-out.bodyRadius*.10);
  out.legDiameter=Math.max(.012,out.bodyRadius*.42);
  out.tailDiameter=Math.max(.008,out.bodyRadius*.30);

  // -- 03.4 solved digitigrade / unguligrade chains
  const chains=STANCE[build.stance]; if(!chains) throw new Error('animal rig: no stance chain "'+build.stance+'"');
  out.stance=build.stance; out.stanceBend=build.stanceBend;
  out.frontLimb=solveLimb(chains.front,out.shoulderY-out.pawRadius*.85,build.stanceBend);
  out.hindLimb =solveLimb(chains.hind, out.hipY     -out.pawRadius*.85,build.stanceBend);

  // -- 03.5 legacy derived fields kept for saved projects and external readers
  out.legUpper=out.frontLimb.bones[0].length;
  out.legLower=out.frontLimb.bones[1].length;

  // -- 03.6 spine stations along Z (forward is +Z), measured from the sacrum
  out.sacrumZ=-out.bodyLength*.32;
  out.loinSpan=out.bodyLength*.20; out.thoraxSpan=out.bodyLength*.30; out.withersSpan=out.bodyLength*.28;
  out.shoulderZ=out.bodyLength*.30; out.hipZ=-out.bodyLength*.32;
  return out;
}

// ============================================================ 04 rig graph
//
// One table, read in the order a body is read: spine chain, torso masses,
// shoulders, neck, head, ears, whiskers, tail, then the four limbs. Every entry
// carries the detail level at which it appears; poseParts() prunes above the
// profile's detailLevel so the low-end fallback is data, not a code path.

const LEGS = Object.freeze([
  {key:'fl',name:'Front Left',side:-1,end:1},
  {key:'fr',name:'Front Right',side:1,end:1},
  {key:'bl',name:'Back Left',side:-1,end:-1},
  {key:'br',name:'Back Right',side:1,end:-1},
]);

// Scene element ids the controller animates. Any subset may exist; a missing
// part is skipped, so an older saved project simply animates less.
const PART_IDS = Object.freeze({
  spine:'animal_spine', spineLumbar:'animal_spine_lumbar', spineThorax:'animal_spine_thorax', spineWithers:'animal_spine_withers',
  scapulaLeft:'animal_scapula_l', scapulaRight:'animal_scapula_r',
  neck:'animal_neck', head:'animal_head',
  earLeft:'animal_ear_left', earRight:'animal_ear_right',
  tailBase:'animal_tail_base', tail02:'animal_tail_02', tail03:'animal_tail_03', tail04:'animal_tail_04', tailTip:'animal_tail_tip',
  legFl:'animal_leg_fl', legFr:'animal_leg_fr', legBl:'animal_leg_bl', legBr:'animal_leg_br',
  kneeFl:'animal_knee_fl', kneeFr:'animal_knee_fr', kneeBl:'animal_knee_bl', kneeBr:'animal_knee_br',
  ankleFl:'animal_ankle_fl', ankleFr:'animal_ankle_fr', ankleBl:'animal_ankle_bl', ankleBr:'animal_ankle_br',
  toeFl:'animal_toe_fl', toeFr:'animal_toe_fr', toeBl:'animal_toe_bl', toeBr:'animal_toe_br',
});
const PART_KEYS = Object.freeze(Object.keys(PART_IDS));
const LEG_KEYS   = Object.freeze(['legFl','legFr','legBl','legBr']);
const KNEE_KEYS  = Object.freeze(['kneeFl','kneeFr','kneeBl','kneeBr']);
const ANKLE_KEYS = Object.freeze(['ankleFl','ankleFr','ankleBl','ankleBr']);
const TOE_KEYS   = Object.freeze(['toeFl','toeFr','toeBl','toeBr']);
const TAIL_KEYS  = Object.freeze(['tailBase','tail02','tail03','tail04','tailTip']);
const TAIL_SEGMENTS = TAIL_KEYS.length;
// Tail spring tuning, one row per segment from base to tip. SHARE is how much
// of the total curve a joint takes; LAG scales its stiffness so the tip is the
// slackest link and trails the base through every turn.
const TAIL_SHARE = Object.freeze([.34,.26,.20,.15,.11]);
const TAIL_LAG   = Object.freeze([1,.84,.70,.58,.48]);
const TAIL_STIFFNESS = 48;
const TAIL_DAMPING = 10;

function poseParts(spec){
  const p=spec, parts=[], detail=p.detailLevel;
  function joint(id,name,parentId,position,rotation,level){
    if((level||0)>detail) return null;
    parts.push({id,name,type:'empty',primitive:'sphere',parentId,position:position.map(round),rotation:(rotation||[0,0,0]).map(round),scale:[1,1,1],detail:level||0});
    return id;
  }
  function mesh(id,name,parentId,primitive,position,rotation,scale,colorKey,level){
    if((level||0)>detail) return null;
    if(COLOR_KEYS.indexOf(colorKey)<0) throw new Error('animal rig: unknown colour key "'+colorKey+'" on part "'+id+'"');
    parts.push({id,name,type:'mesh',primitive,parentId,position:position.map(round),rotation:(rotation||[0,0,0]).map(round),scale,colorKey,detail:level||0});
    return id;
  }

  // ---- 04.1 spine chain: sacrum, loin, thorax, withers. Three flexible joints
  //      is the minimum that can arch on a gallop and bend laterally on a walk.
  joint('animal_spine','Spine Root (Sacrum)','root',[0,p.standHeight,p.sacrumZ],[0,0,0],0);
  joint('animal_spine_lumbar','Lumbar Joint','animal_spine',[0,0,p.loinSpan],[0,0,0],0);
  joint('animal_spine_thorax','Thoracic Joint','animal_spine_lumbar',[0,p.bodyRadius*.10,p.thoraxSpan],[0,0,0],0);
  joint('animal_spine_withers','Withers Joint','animal_spine_thorax',[0,p.bodyRadius*.20,p.withersSpan],[0,0,0],0);

  // ---- 04.2 torso masses, rear to front
  mesh('animal_croup','Croup','animal_spine','sphere',[0,p.bodyRadius*.10,p.bodyLength*.04],[0,0,0],sphereScale(p.croupWidth,p.croupDepth,p.bodyLength*.30),'fur',0);
  mesh('animal_haunch_l','Left Haunch','animal_spine','sphere',[-p.croupWidth*.42,-p.bodyRadius*.06,-p.bodyLength*.02],[0,0,0],sphereScale(p.bodyRadius*.86,p.bodyRadius*1.26,p.bodyLength*.30),'fur',1);
  mesh('animal_haunch_r','Right Haunch','animal_spine','sphere',[p.croupWidth*.42,-p.bodyRadius*.06,-p.bodyLength*.02],[0,0,0],sphereScale(p.bodyRadius*.86,p.bodyRadius*1.26,p.bodyLength*.30),'fur',1);
  mesh('animal_loin','Loin','animal_spine_lumbar','sphere',[0,0,0],[0,0,0],sphereScale(p.loinWidth,p.loinDepth,p.bodyLength*.28),'fur',0);
  mesh('animal_ribcage','Ribcage','animal_spine_thorax','sphere',[0,-p.bodyRadius*.06,p.bodyLength*.03],[0,0,0],sphereScale(p.chestWidth,p.chestDepth,p.bodyLength*.34),'fur',0);
  mesh('animal_belly','Belly','animal_spine_lumbar','sphere',[0,-p.loinDepth*.42,p.bodyLength*.10],[0,0,0],sphereScale(p.loinWidth*.90,p.bodyRadius*.80,p.bodyLength*.46),'belly',0);
  mesh('animal_sternum','Sternum','animal_spine_withers','sphere',[0,-p.chestDepth*.40,-p.bodyLength*.02],[0,0,0],sphereScale(p.chestWidth*.84,p.bodyRadius*1.02,p.bodyLength*.20),'belly',1);

  // ---- 04.3 shoulders. A cat's scapulae ride on the ribcage and rise above the
  //      spine line at every step; they are joints, not decoration.
  [['l',-1],['r',1]].forEach(entry=>{
    const suffix=entry[0], side=entry[1], label=side<0?'Left':'Right';
    // The joint is skeleton and survives every detail level; only the blade it
    // carries is cosmetic. That rule holds for the whole rig: an empty costs no
    // draw call, so pruning one would only cost the controller a joint.
    joint('animal_scapula_'+suffix,label+' Scapula Joint','animal_spine_thorax',[side*p.chestWidth*.44,p.bodyRadius*.34,p.bodyLength*.14],[-16,0,0],0);
    mesh('animal_scapula_'+suffix+'_blade',label+' Shoulder Blade','animal_scapula_'+suffix,'box',[0,-p.bodyRadius*.20,0],[0,0,0],boxScale(p.bodyRadius*.34,p.bodyRadius*1.10,p.bodyLength*.16),'fur',1);
  });

  // ---- 04.4 neck: two masses so it can arch instead of hinging
  joint('animal_neck','Neck Joint','animal_spine_withers',[0,p.bodyRadius*.16,p.bodyLength*.06],[p.neckPitch,0,0],0);
  mesh('animal_neck_lower','Lower Neck','animal_neck','cylinder',[0,p.neckLength*.28,0],[0,0,0],cylinderScale(p.bodyRadius*1.04,p.neckLength*.62),'fur',0);
  mesh('animal_neck_upper','Upper Neck','animal_neck','cylinder',[0,p.neckLength*.76,0],[0,0,0],cylinderScale(p.bodyRadius*.86,p.neckLength*.56),'fur',1);

  // ---- 04.5 head: cranium, cheeks (whisker pads), short muzzle, nose, chin
  joint('animal_head','Head Joint','animal_neck',[0,p.neckLength,0],[-p.neckPitch,0,0],0);
  mesh('animal_head_mesh','Cranium','animal_head','sphere',[0,p.headSize*.24,p.headSize*.08],[0,0,0],sphereScale(p.headSize*1.02,p.headSize*.94,p.headSize*1.04),'fur',0);
  mesh('animal_cheek_l','Left Cheek','animal_head','sphere',[-p.headSize*.34,p.headSize*.06,p.headSize*.30],[0,0,0],sphereScale(p.headSize*.48,p.headSize*.44,p.headSize*.42),'fur',1);
  mesh('animal_cheek_r','Right Cheek','animal_head','sphere',[p.headSize*.34,p.headSize*.06,p.headSize*.30],[0,0,0],sphereScale(p.headSize*.48,p.headSize*.44,p.headSize*.42),'fur',1);
  mesh('animal_muzzle','Muzzle','animal_head','sphere',[0,p.headSize*.02,p.headSize*.40+p.muzzle*.34],[0,0,0],sphereScale(p.headSize*.54,p.headSize*.40,p.muzzle*1.30),'belly',0);
  mesh('animal_nose','Nose Leather','animal_head','box',[0,p.headSize*.12,p.headSize*.44+p.muzzle*.86],[0,0,0],boxScale(p.headSize*.17,p.headSize*.13,p.headSize*.08),'skin',1);
  mesh('animal_chin','Chin','animal_head','sphere',[0,-p.headSize*.17,p.headSize*.34],[0,0,0],sphereScale(p.headSize*.32,p.headSize*.22,p.headSize*.26),'belly',1);
  mesh('animal_brow','Brow Ridge','animal_head','box',[0,p.headSize*.46,p.headSize*.24],[0,0,0],boxScale(p.headSize*.70,p.headSize*.13,p.headSize*.30),'fur',2);
  [['left',-1],['right',1]].forEach(entry=>{
    const suffix=entry[0], side=entry[1], label=side<0?'Left':'Right';
    mesh('animal_eye_'+suffix,label+' Eye','animal_head','sphere',[side*p.headSize*.30,p.headSize*.26,p.headSize*.36],[0,0,0],sphereScale(p.headSize*.27,p.headSize*.27,p.headSize*.24),'eye',0);
    // Vertical slit pupil: a thin box, the single cheapest "this is a cat" cue.
    mesh('animal_pupil_'+suffix,label+' Pupil','animal_head','box',[side*p.headSize*.30,p.headSize*.26,p.headSize*.46],[0,0,0],boxScale(p.headSize*.05,p.headSize*.20,p.headSize*.03),'accent',1);
  });

  // ---- 04.6 ears: outer shell plus inner pinna, on a joint that can rotate
  //      toward whatever the cat is listening to.
  [['left',-1],['right',1]].forEach(entry=>{
    const suffix=entry[0], side=entry[1], label=side<0?'Left':'Right';
    joint('animal_ear_'+suffix,label+' Ear Joint','animal_head',[side*p.headSize*.35,p.headSize*.60,-p.headSize*.02],[-8,side*12,-side*p.earTilt],0);
    mesh('animal_ear_'+suffix+'_mesh',label+' Ear Shell','animal_ear_'+suffix,'cone',[0,p.earSize*.80,0],[0,0,0],coneScale(p.earSize*1.16,p.earSize*1.66),'fur',0);
    mesh('animal_ear_'+suffix+'_inner',label+' Ear Pinna','animal_ear_'+suffix,'cone',[0,p.earSize*.72,p.earSize*.12],[0,0,0],coneScale(p.earSize*.68,p.earSize*1.28),'skin',1);
  });

  // ---- 04.7 whiskers: thin boxes off the cheeks and brow. Detail 2 only.
  for(let index=0;index<p.whiskers;index++){
    const spread=(index-(p.whiskers-1)/2)/Math.max(1,p.whiskers), length=p.headSize*(1.5-Math.abs(spread)*.5);
    [['left',-1],['right',1]].forEach(entry=>{
      const suffix=entry[0], side=entry[1], label=side<0?'Left':'Right';
      mesh('animal_whisker_'+suffix+'_'+index,label+' Whisker '+(index+1),'animal_head','box',
        [side*(p.headSize*.36+length*.42),p.headSize*.06+spread*p.headSize*.28,p.headSize*.34+length*.24],
        [0,side*58,spread*22],boxScale(length,p.headSize*.014,p.headSize*.014),'belly',2);
    });
  }

  // ---- 04.8 tail: five segments. Section 08 runs a lag spring down them, which
  //      is what turns a stick into tail language.
  const tailSegment=p.tailLength/TAIL_SEGMENTS;
  joint('animal_tail_base','Tail Joint 1 (Base)','animal_spine',[0,p.croupDepth*.46,-p.bodyLength*.14],[-(90-p.tailLift),0,0],0);
  for(let index=0;index<TAIL_SEGMENTS;index++){
    const id=PART_IDS[TAIL_KEYS[index]], taper=1-index*.11;
    if(index>0) joint(id,'Tail Joint '+(index+1),PART_IDS[TAIL_KEYS[index-1]],[0,tailSegment,0],[-p.tailCurl/TAIL_SEGMENTS,0,0],0);
    mesh(id+'_mesh','Tail Segment '+(index+1),id,'cylinder',[0,tailSegment*.5,0],[0,0,0],
      cylinderScale(p.tailDiameter*taper,tailSegment*1.04),index===TAIL_SEGMENTS-1?'accent':'fur',0);
  }

  // ---- 04.9 limbs. Joint empties stay parented to the root so the paws keep
  //      contact with the ground while the spine bobs and arches above them.
  LEGS.forEach(leg=>{
    const front=leg.end>0, limb=front?p.frontLimb:p.hindLimb, bones=limb.bones;
    const jointY=front?p.shoulderY:p.hipY, jointZ=front?p.shoulderZ:p.hipZ;
    const jointX=(front?p.chestWidth:p.croupWidth)*.42*leg.side;
    const hipId='animal_leg_'+leg.key, kneeId='animal_knee_'+leg.key, ankleId='animal_ankle_'+leg.key, toeId='animal_toe_'+leg.key;
    joint(hipId,leg.name+' Hip Joint','root',[jointX,jointY,jointZ],[bones[0].angle,0,0],0);
    mesh('animal_upper_'+leg.key,leg.name+' '+bones[0].name,hipId,'cylinder',[0,-bones[0].length*.5,0],[0,0,0],cylinderScale(p.legDiameter*bones[0].girth,bones[0].length*1.04),'fur',0);
    joint(kneeId,leg.name+(front?' Elbow Joint':' Stifle Joint'),hipId,[0,-bones[0].length,0],[bones[1].angle,0,0],0);
    mesh('animal_shin_'+leg.key,leg.name+' '+bones[1].name,kneeId,'cylinder',[0,-bones[1].length*.5,0],[0,0,0],cylinderScale(p.legDiameter*bones[1].girth,bones[1].length*1.04),'fur',0);
    joint(ankleId,leg.name+(front?' Carpus Joint':' Hock Joint'),kneeId,[0,-bones[1].length,0],[bones[2].angle,0,0],0);
    mesh('animal_cannon_'+leg.key,leg.name+' '+bones[2].name,ankleId,'cylinder',[0,-bones[2].length*.5,0],[0,0,0],cylinderScale(p.legDiameter*bones[2].girth,bones[2].length*1.04),'fur',0);
    joint(toeId,leg.name+' Toe Joint',ankleId,[0,-bones[2].length,0],[-bones[0].cumulative-bones[1].angle-bones[2].angle,0,0],0);
    mesh('animal_paw_'+leg.key,leg.name+' Paw',toeId,'sphere',[0,-p.pawRadius*.42,p.pawRadius*.30],[0,0,0],sphereScale(p.pawRadius*1.42,p.pawRadius*.92,p.pawRadius*1.90),'accent',0);
    mesh('animal_claw_'+leg.key,leg.name+' Toes',toeId,'box',[0,-p.pawRadius*.58,p.pawRadius*1.10],[0,0,0],boxScale(p.pawRadius*1.26,p.pawRadius*.52,p.pawRadius*.72),'accent',2);
  });
  return parts;
}

// ============================================ 05 scene elements and visual

function paletteColor(spec,palette,key){
  if(COLOR_KEYS.indexOf(key)<0) throw new Error('animal rig: unknown colour key "'+key+'"');
  const source=palette&&typeof palette==='object'?palette:{};
  return source[key+'Color']||source[key]||spec.colors[key]||PROFILES.generic.colors[key];
}
function sceneElements(species,palette,overrides){
  const spec=profile(species,overrides);
  return poseParts(spec).map(part=>({
    id:part.id,name:part.name,type:part.type,primitive:part.primitive||'sphere',parentId:part.parentId,linked:true,dummyVisible:false,
    position:part.position.slice(),rotation:part.rotation.slice(),scale:part.scale.slice(),
    color:part.colorKey?paletteColor(spec,palette,part.colorKey):paletteColor(spec,palette,'fur'),
  }));
}
/** Pawn Studio preview / test visual. Geometry and material are shared per
 *  primitive and per colour key: ~55 meshes on one geometry set and five
 *  materials instead of 55 of each, which is what keeps the hero rig cheap on
 *  an integrated GPU. */
function createVisual(THREERef,species,palette,overrides){
  if(!THREERef)return null;
  const spec=profile(species,overrides),root=new THREERef.Group();
  root.name='Animal Placeholder · '+spec.label;root.userData.animalPlaceholderRig=true;root.userData.animalPlaceholderSpecies=spec.species;
  const nodes=new Map([['root',root]]), geometries=new Map(), materials=new Map();
  function geometry(primitive){
    let value=geometries.get(primitive);
    if(!value){
      if(primitive==='sphere')value=new THREERef.SphereGeometry(BASE.sphere*.5,16,10);
      else if(primitive==='cylinder')value=new THREERef.CylinderGeometry(BASE.cylinderRadius*.5,BASE.cylinderRadius*.5,BASE.cylinderHeight,12);
      else if(primitive==='cone')value=new THREERef.ConeGeometry(BASE.coneRadius*.5,BASE.coneHeight,12);
      else value=new THREERef.BoxGeometry(BASE.box,BASE.box,BASE.box);
      geometries.set(primitive,value);
    }
    return value;
  }
  function material(colorKey){
    let value=materials.get(colorKey);
    if(!value){value=new THREERef.MeshStandardMaterial({color:paletteColor(spec,palette,colorKey),roughness:colorKey==='eye'?.24:.82,metalness:0});materials.set(colorKey,value);}
    return value;
  }
  poseParts(spec).forEach(part=>{
    let node;
    if(part.type==='empty')node=new THREERef.Group();
    else {node=new THREERef.Mesh(geometry(part.primitive),material(part.colorKey));node.castShadow=true;node.receiveShadow=true;}
    node.name=part.name;node.position.fromArray(part.position);
    node.rotation.set(part.rotation[0]*DEG,part.rotation[1]*DEG,part.rotation[2]*DEG);
    node.scale.fromArray(part.scale);
    node.userData.logicElementSceneId=part.id;node.userData.animalPlaceholderPart=true;
    (nodes.get(part.parentId)||root).add(node);nodes.set(part.id,node);
  });
  return root;
}

// =========================================================== 06 gait cycles
//
// The footfall table is the only thing that makes a walk read as a walk and a
// gallop as a gallop on identical geometry. `offsets` are the phase at which
// each foot PLANTS, in [front-left, front-right, hind-left, hind-right] order,
// straight out of the real feline sequences:
//
//   walk    lateral sequence, four beats  LH RF? no: LH, LF, RH, RF
//   amble   lateral couplets (the "pacing" look cats fall into off a walk)
//   trot    diagonal pairs, two beats     LF+RH, RF+LH
//   gallop  rotary, four beats + two suspensions  LH, RH, RF, LF
//
// `duty` is the share of the cycle a foot spends on the ground: high for a
// walk (three feet down), low for a gallop (two suspensions).
// `spineFlex` arches the back once per cycle - that is the bound in a gallop.
// `lateralBend` is the side-to-side spine wave of a walking cat.

function gait(offsets,frequency,duty,swing,lift,bob,spineFlex,lateralBend,scapula){
  return {offsets,frequency,duty,swing,lift,bob,spineFlex,lateralBend,scapula};
}
const GAIT_CYCLES = Object.freeze({
  idle:   gait([0,0,0,0],       0,   1,   0,   0,   .10, .010, .010, .10),
  crouch: gait([.25,.75,0,.5],  1.5, .78, .16, .30, .12, .020, .050, .30),
  walk:   gait([.25,.75,0,.5],  1.9, .70, .30, .55, .30, .030, .090, .55),
  amble:  gait([.10,.60,0,.50], 2.6, .60, .42, .78, .55, .050, .075, .70),
  trot:   gait([0,.5,.5,0],     3.3, .48, .54, 1.00,.80, .070, .030, .85),
  gallop: gait([.60,.50,0,.10], 4.1, .34, .78, 1.35,1.20,.230, .020, 1.05),
});
// `run` is the public name the Animal Pawn and its animation set use; the
// rotary gallop is what it actually plays.
const GAIT_ALIASES = Object.freeze({run:'gallop', sprint:'gallop', stalk:'crouch', air:'idle'});
const GAIT_ORDER = Object.freeze(['idle','crouch','walk','amble','trot','gallop']);
function gaitCycle(name){
  const key=GAIT_ALIASES[name]||name, cycle=GAIT_CYCLES[key];
  if(!cycle) throw new Error('animal rig: unknown gait cycle "'+name+'"');
  return cycle;
}
function hasGait(name){ return !!(GAIT_CYCLES[GAIT_ALIASES[name]||name]); }

// ================================================= 07 behaviour vocabulary
//
// The verbs a cat has, in the order a play session meets them. Each is a pose
// function of (rig, t 0..1, elapsed seconds); `duration` is the default length
// and `loop` marks the ones that read as a held state rather than a beat.

function behaviourEntry(duration,loop,pose){ return {duration,loop,pose}; }
const BEHAVIOURS = Object.freeze({
  // -- 07.1 traversal beats
  pounce: behaviourEntry(.60,false,(rig,t)=>{
    // Compress, then extend. The charge half is the wind-up every cat does.
    const compress=Math.max(0,1-t*2),extend=Math.max(0,t*2-1);
    rig.posture(compress*.95,-extend*.55);
    rig.legs(-compress*.35+extend*1.15,compress*.75-extend*.95,compress*1.1,extend*.5);
    rig.arch(-compress*.30+extend*.42);
    rig.tail(-.4+extend*1.1,0);
  }),
  jump: behaviourEntry(.50,false,(rig,t)=>{
    const swing=Math.sin(t*Math.PI);
    rig.legs(swing*.95,-swing*.75,swing*1.0,swing*.4);
    rig.arch(-swing*.34);
    rig.tail(swing*.6,0);
  }),
  land: behaviourEntry(.36,false,(rig,t)=>{
    // Absorb: everything folds, then springs back over the second half.
    const absorb=Math.sin(t*Math.PI);
    rig.posture(absorb*.85,absorb*.14);
    rig.legs(-absorb*.2,absorb*.2,absorb*.9,absorb*.35);
    rig.tail(-absorb*.5,0);
  }),
  climb: behaviourEntry(.60,true,(rig,t)=>{
    const reach=Math.sin(t*Math.PI*4);
    rig.arch(-.42);
    rig.legs(1.05+reach*.35,-.55-reach*.3,.75,.2);
    rig.tail(.35,Math.sin(t*Math.PI*3)*.3);
  }),
  // -- 07.2 the resting vocabulary. Little Kitty, Big City treats these as
  //    first-class verbs; so does this rig.
  stretch: behaviourEntry(1.40,false,(rig,t)=>{
    // Front end down, hips up, then a long shake out. The classic "greeting".
    const down=Math.sin(clamp(t*1.6,0,1)*Math.PI);
    rig.posture(down*.7,-down*.55);
    rig.arch(down*.55);
    rig.legs(-down*.85,down*.1,-down*.25,down*.55);
    rig.tail(down*1.15,0);
    rig.head(-down*.35,0);
  }),
  sit: behaviourEntry(.80,true,(rig,t)=>{
    const settle=Math.min(1,t*3);
    rig.posture(settle*.55,-settle*.30);
    // Hind legs fold right under; front legs stay columnar.
    rig.legs(0,settle*.15,settle*1.55,settle*.75);
    rig.arch(-settle*.30);
    rig.tail(-settle*.85,Math.sin(t*Math.PI*2)*.10);
  }),
  groom: behaviourEntry(2.00,true,(rig,t,elapsed)=>{
    const settle=Math.min(1,t*3),lick=Math.sin(elapsed*11);
    rig.posture(settle*.55,-settle*.30);
    rig.legs(-settle*.55+lick*.12,settle*.15,settle*1.55,settle*.75);
    rig.head(settle*1.05+lick*.16,lick*.22);
    rig.tail(-settle*.9,Math.sin(elapsed*2.2)*.16);
  }),
  knead: behaviourEntry(2.20,true,(rig,t,elapsed)=>{
    const settle=Math.min(1,t*3),beat=Math.sin(elapsed*6.5);
    rig.posture(settle*.45,settle*.08);
    rig.legsSplit(beat*.55,-beat*.55,settle*.9,settle*.4);
    rig.head(settle*.18,0);
    rig.tail(-settle*.5,Math.sin(elapsed*1.4)*.20);
  }),
  curl: behaviourEntry(1.60,true,(rig,t)=>{
    const settle=Math.min(1,t*2);
    rig.posture(settle*.98,0);
    rig.arch(settle*.75);
    rig.legs(settle*.9,settle*1.35,settle*1.5,settle*.9);
    rig.tail(settle*1.6,settle*.9);
    rig.head(settle*.55,settle*.35);
  }),
  // -- 07.3 attention and expression
  alert: behaviourEntry(.90,true,(rig,t,elapsed)=>{
    rig.posture(0,-.10);
    rig.ears(1,0);
    rig.head(-.14,Math.sin(elapsed*1.6)*.10);
    rig.tail(.85,Math.sin(elapsed*3.4)*.14);
  }),
  sniff: behaviourEntry(1.10,false,(rig,t,elapsed)=>{
    const dip=Math.sin(t*Math.PI);
    rig.posture(dip*.35,dip*.18);
    rig.head(dip*.72+Math.sin(elapsed*14)*.05,0);
    rig.tail(-dip*.35,Math.sin(elapsed*2)*.2);
  }),
  voice: behaviourEntry(.55,false,(rig,t,elapsed)=>{
    const call=Math.sin(t*Math.PI);
    rig.head(-call*.42,0);
    rig.ears(call,0);
    rig.arch(-call*.16);
    rig.tail(call*.4,Math.sin(elapsed*16)*.22);
  }),
  hiss: behaviourEntry(.70,false,(rig,t,elapsed)=>{
    const flare=Math.sin(t*Math.PI);
    rig.posture(-flare*.25,-flare*.20);
    rig.arch(-flare*.85);
    rig.ears(-flare,0);
    rig.tail(flare*1.35,Math.sin(elapsed*20)*.35);
  }),
  // -- 07.4 shared with dog and horse profiles
  dig: behaviourEntry(1.20,false,(rig,t,elapsed)=>{
    const beat=Math.sin(elapsed*22);
    rig.posture(.5,.28);
    rig.legsSplit(beat*.85,-beat*.85,.5,.2);
  }),
  fetch: behaviourEntry(.60,false,(rig,t)=>{
    const swing=Math.sin(t*Math.PI);
    rig.head(swing*.55,0);
    rig.arch(swing*.20);
  }),
  rear: behaviourEntry(.90,false,(rig,t)=>{
    const swing=Math.sin(t*Math.PI);
    rig.posture(0,-swing*.85);
    rig.legs(swing*1.5,-swing*.6,swing*.2,0);
    rig.arch(-swing*.5);
  }),
  shake: behaviourEntry(.55,false,(rig,t,elapsed)=>{
    const swing=Math.sin(t*Math.PI);
    rig.roll(Math.sin(elapsed*26)*.18*swing);
    rig.head(0,Math.sin(elapsed*26+.4)*.26*swing);
    rig.tail(0,Math.sin(elapsed*22)*.4*swing);
  }),
});
function behaviour(name){
  const entry=BEHAVIOURS[name];
  if(!entry) throw new Error('animal rig: unknown behaviour "'+name+'"');
  return entry;
}

// Free-text clip names resolve to a built-in behaviour with the same forgiving
// keyword convention the GLB clip matcher uses, so "Cat Pounce", "Leap" and
// "attack" all reach the same pose without an exact-name contract. This is the
// one deliberate soft fallback in the file: author clip names are user data,
// and a typo must not take gameplay down.
const FALLBACK_GESTURE='shake';
const GESTURE_HINTS = Object.freeze([
  ['pounce',['pounce','leap','lunge','attack','strike']],
  ['jump',['jump','hop']],
  ['land',['land','touchdown']],
  ['climb',['climb','mantle','scale','clamber']],
  ['stretch',['stretch','yawn','wakeup','wake up']],
  ['sit',['sit','perch','settle']],
  ['groom',['groom','lick','wash','clean','preen']],
  ['knead',['knead','biscuit','muffin','maccheroni']],
  ['curl',['curl','sleep','nap','doze','rest']],
  ['alert',['alert','perk','listen','watch','focus']],
  ['sniff',['sniff','smell','investigate','inspect']],
  ['hiss',['hiss','spit','threat','angry']],
  ['voice',['voice','meow','miaow','purr','bark','howl','growl','neigh','call','chirp']],
  ['dig',['dig','scratch','paw','bury']],
  ['fetch',['fetch','carry','pickup','pick up','retrieve','deliver']],
  ['rear',['rear','buck','stand up']],
  ['shake',['shake','shiver','ruffle']],
]);
function resolveGesture(name){
  const normalized=normalizeName(name);if(!normalized)return FALLBACK_GESTURE;
  for(let index=0;index<GESTURE_HINTS.length;index++){
    const gestureName=GESTURE_HINTS[index][0],hints=GESTURE_HINTS[index][1];
    for(let hint=0;hint<hints.length;hint++) if(normalized.indexOf(normalizeName(hints[hint]))>=0) return gestureName;
  }
  return FALLBACK_GESTURE;
}

// ============================================================ 08 controller

function createController(options){
  const opts=options||{};
  const state={
    owner:null,parts:{},rest:{},bound:false,boundKeys:[],
    species:normalizeSpecies(opts.species),
    walkSpeed:Math.max(.05,finite(opts.walkSpeed,1.1)),
    trotSpeed:Math.max(.1,finite(opts.trotSpeed,2.6)),
    runSpeed:Math.max(.2,finite(opts.runSpeed,6.2)),
    responsiveness:Math.max(.5,finite(opts.responsiveness,10)),
    predictionTime:Math.max(0,finite(opts.predictionTime,.1)),
    stepPoseStrength:clamp(finite(opts.stepPoseStrength,1),0,2),
    stair:{amount:0,side:1,rise:0},
    velocity:{x:0,z:0},predicted:{x:0,z:0},
    phase:0,idlePhase:0,crouch:0,airborne:0,groundTime:0,
    gait:'idle',cycleKey:'idle',blendKey:'idle',blend:1,
    gesture:null,
    // Attention: where the head and ears point, smoothed. Local space, +Z ahead.
    look:{x:0,y:0,z:1},lookTarget:{x:0,y:0,z:1},lookWeight:0,earTwitch:0,earTimer:1.4,
    // Tail lag spring, one angle pair per segment. Preallocated: the frame loop
    // never allocates.
    tailX:new Float32Array(TAIL_SEGMENTS),tailY:new Float32Array(TAIL_SEGMENTS),
    tailVX:new Float32Array(TAIL_SEGMENTS),tailVY:new Float32Array(TAIL_SEGMENTS),
    tailDriveX:0,tailDriveY:0,tailPhase:0,
  };
  // Scratch accumulators reused every frame by the behaviour pose API.
  const pose={front:0,frontFold:0,hind:0,hindFold:0,frontSplit:0,arch:0,roll:0,headPitch:0,headYaw:0,earAlert:0,tailLift:0,tailSway:0,crouch:0,lean:0};

  function findPart(id){
    if(!state.owner||!state.owner.traverse)return null;
    let found=null;state.owner.traverse(child=>{if(!found&&child&&child.userData&&child.userData.logicElementSceneId===id)found=child;});
    return found;
  }
  function snapshot(node){ return {px:node.position.x,py:node.position.y,pz:node.position.z,rx:node.rotation.x,ry:node.rotation.y,rz:node.rotation.z}; }
  function bind(owner){
    dispose();
    if(!owner)return false;
    state.owner=owner;const keys=[];
    for(let index=0;index<PART_KEYS.length;index++){
      const key=PART_KEYS[index],node=findPart(PART_IDS[key]);
      if(!node)continue;
      state.parts[key]=node;state.rest[key]=snapshot(node);keys.push(key);
    }
    state.boundKeys=keys;state.bound=keys.length>0;return state.bound;
  }
  function resetAllParts(){
    for(let index=0;index<state.boundKeys.length;index++){
      const key=state.boundKeys[index],node=state.parts[key],rest=state.rest[key];
      node.position.set(rest.px,rest.py,rest.pz);node.rotation.set(rest.rx,rest.ry,rest.rz);
    }
  }
  function rotateFrom(key,axis,amount){ const node=state.parts[key],rest=state.rest[key];if(!node||!rest)return;node.rotation[axis]=rest['r'+axis]+finite(amount,0); }
  function addRotation(key,axis,amount){ const node=state.parts[key];if(!node)return;node.rotation[axis]+=finite(amount,0); }
  function offsetFrom(key,axis,amount){ const node=state.parts[key],rest=state.rest[key];if(!node||!rest)return;node.position[axis]=rest['p'+axis]+finite(amount,0); }

  // ---- 08.1 pose writers. Everything below composes into `pose`, then
  //      flushPose() writes it to the rig once. Two systems never fight over
  //      the same joint, and no joint is written twice per frame.
  function clearPose(){
    pose.front=0;pose.frontFold=0;pose.hind=0;pose.hindFold=0;pose.frontSplit=0;
    pose.arch=0;pose.roll=0;pose.headPitch=0;pose.headYaw=0;pose.earAlert=0;
    pose.tailLift=0;pose.tailSway=0;pose.crouch=0;pose.lean=0;
    // Cleared here too, so a behaviour that takes over never inherits the tail
    // drive of whatever gait was playing when it started.
    state.tailDriveX=0;state.tailDriveY=0;
  }
  const rig={
    posture(crouch,lean){ pose.crouch+=crouch;pose.lean+=lean; },
    legs(front,frontFold,hind,hindFold){ pose.front+=front;pose.frontFold+=frontFold;pose.hind+=hind;pose.hindFold+=hindFold; },
    legsSplit(left,right,hind,hindFold){ pose.front+=(left+right)*.5;pose.frontSplit+=(left-right)*.5;pose.hind+=hind;pose.hindFold+=hindFold; },
    arch(amount){ pose.arch+=amount; },
    roll(amount){ pose.roll+=amount; },
    head(pitch,yaw){ pose.headPitch+=pitch;pose.headYaw+=yaw; },
    ears(alert){ pose.earAlert+=alert; },
    tail(lift,sway){ pose.tailLift+=lift;pose.tailSway+=sway; },
  };
  function flushPose(){
    const spine=state.parts.spine,restSpine=state.rest.spine;
    if(spine&&restSpine){
      spine.position.y=restSpine.py*(1-clamp(pose.crouch,0,1)*.46);
      spine.rotation.x=restSpine.rx+pose.lean;
      spine.rotation.z=restSpine.rz+pose.roll;
    }
    // The arch is split across the two flexible joints: most of it in the loin,
    // the rest in the thorax, which is where a real cat's back bends.
    rotateFrom('spineLumbar','x',pose.arch*.62);
    rotateFrom('spineThorax','x',pose.arch*.38);
    rotateFrom('head','x',pose.headPitch-pose.lean*.55-pose.arch*.30);
    rotateFrom('head','y',pose.headYaw);
    // Ears: alert rotates the pinna forward and up, fear/crouch flattens it.
    const flatten=clamp(pose.crouch,0,1)*.95-pose.earAlert*.55;
    rotateFrom('earLeft','z',-flatten+state.earTwitch);
    rotateFrom('earRight','z',flatten-state.earTwitch);
    rotateFrom('earLeft','x',pose.earAlert*-.32);
    rotateFrom('earRight','x',pose.earAlert*-.32);
    for(let index=0;index<4;index++){
      const front=index<2,side=index%2===0?1:-1;
      rotateFrom(LEG_KEYS[index],'x',(front?pose.front:pose.hind)+(front?pose.frontSplit*side:0));
      rotateFrom(KNEE_KEYS[index],'x',front?-pose.frontFold:pose.hindFold);
      rotateFrom(ANKLE_KEYS[index],'x',(front?pose.frontFold:-pose.hindFold)*.55);
      rotateFrom(TOE_KEYS[index],'x',(front?-pose.frontFold:pose.hindFold)*.30);
    }
    rotateFrom('scapulaLeft','x',pose.front*.34);
    rotateFrom('scapulaRight','x',pose.front*.34);
  }

  // ---- 08.2 gait pose. Stance/swing footfalls, not a naked sine: the foot
  //      retracts linearly while it is planted and protracts fast while it is
  //      in the air, which is what stops the classic procedural skate.
  function smoothstep(value){ return value*value*(3-2*value); }
  /** Shortest circular distance so a gait transition interpolates footfall
   *  phases the short way round instead of unwinding a whole cycle. */
  function blendOffset(from,to,t){
    let delta=to-from;
    if(delta>.5)delta-=1;else if(delta<-.5)delta+=1;
    let value=from+delta*t;
    return value-Math.floor(value);
  }
  function applyGait(cycle,previous,blend,speedRatio,dt){
    if(cycle.frequency<=0){ applyIdle(dt); return; }
    const frequency=cycle.frequency*(.62+speedRatio*.82);
    state.phase+=dt*frequency;
    if(state.phase>1)state.phase-=Math.floor(state.phase);
    const swing=cycle.swing*(.5+speedRatio*.7),lift=cycle.lift*(.45+speedRatio*.75),duty=cycle.duty;
    let frontSum=0,frontFoldSum=0,hindSum=0,hindFoldSum=0,frontSplitSum=0;
    for(let index=0;index<4;index++){
      const offset=previous?blendOffset(previous.offsets[index],cycle.offsets[index],blend):cycle.offsets[index];
      let p=state.phase+offset;p-=Math.floor(p);
      let hip,fold;
      if(p<duty){ const s=p/duty; hip=swing*(1-2*s); fold=Math.sin(s*Math.PI)*lift*.14; }
      else { const u=(p-duty)/(1-duty),eased=smoothstep(u); hip=-swing+2*swing*eased; fold=Math.sin(u*Math.PI)*lift; }
      const front=index<2;
      if(front){ frontSum+=hip*.5; frontFoldSum+=fold*.5; frontSplitSum+=(index===0?hip:-hip)*.5; }
      else { hindSum+=hip*.5; hindFoldSum+=fold*.5; }
    }
    // The four legs share two channels plus a split channel, so one flushPose()
    // still drives every leg individually via the split term.
    pose.front+=frontSum;pose.frontFold+=frontFoldSum;pose.frontSplit+=frontSplitSum;
    pose.hind+=hindSum;pose.hindFold+=hindFoldSum;
    const wave=state.phase*Math.PI*2;
    // Sagittal flex once per cycle: the gallop bound. Lateral wave twice per
    // cycle: the walking cat's side-to-side spine.
    pose.arch+=-Math.sin(wave)*cycle.spineFlex*(.4+speedRatio);
    rotateFrom('spineLumbar','y',Math.sin(wave)*cycle.lateralBend*(.4+speedRatio*.8));
    rotateFrom('spineThorax','y',Math.sin(wave-.7)*cycle.lateralBend*.5*(.4+speedRatio*.8));
    pose.roll+=Math.sin(wave)*.05*cycle.bob*speedRatio;
    offsetFrom('spine','y',Math.abs(Math.sin(wave))*.022*cycle.bob*(.4+speedRatio));
    // Head counter-bob: cats hold the head remarkably level at every gait.
    pose.headPitch+=Math.sin(wave)*cycle.spineFlex*.5;
    state.tailDriveX=-.25*speedRatio-cycle.spineFlex*2.2*Math.sin(wave);
    state.tailDriveY=Math.sin(wave*.5)*(.12+speedRatio*.22);
  }
  function applyIdle(dt){
    state.idlePhase+=dt*1.35;
    offsetFrom('spine','y',Math.sin(state.idlePhase)*.008);
    pose.headPitch+=Math.sin(state.idlePhase*.7)*.02;
    state.tailDriveX=0;
    state.tailDriveY=Math.sin(state.idlePhase*.62)*.30;
  }
  // ---- 08.3 airborne. A falling cat rights itself, splays for the landing and
  //      counter-rotates the tail: the righting reflex, cheaply.
  function applyAir(velocityY,dt){
    const rising=velocityY>.1,fall=clamp(-velocityY/6,0,1);
    if(rising){
      pose.front+=.95;pose.frontFold+=1.15;pose.hind+=-.55;pose.hindFold+=.85;
      pose.arch+=-.30;pose.headPitch+=-.20;
      state.tailDriveX=.5;
    } else {
      // Tuck first, then reach for the ground as the fall builds.
      pose.front+=-.35-fall*.55;pose.frontFold+=.55*(1-fall);
      pose.hind+=.35+fall*.30;pose.hindFold+=.65*(1-fall);
      pose.arch+=.28*(1-fall)-.20*fall;pose.headPitch+=.30*fall;
      state.tailDriveX=-.35-fall*.5;
    }
    // Level the body: whatever the launch pitch was, the landing pose is flat.
    pose.lean+=(rising?-.16:.10)*(1-fall*.7);
    state.tailDriveY=Math.sin(state.airborne*7)*.35;
    state.airborne+=dt;
  }
  // ---- 08.4 tail lag spring. Every joint chases its own SHARE of the same
  //      drive, and each one further from the body is slacker than the one
  //      before it (TAIL_LAG). Sharing the curve instead of chaining segment to
  //      segment is what stops the amplitude decaying to nothing by the tip;
  //      the falling stiffness is what makes the wave travel outward and the
  //      tip overshoot on a direction change. That overshoot is the tail
  //      language every cat game is actually sold on.
  function applyTail(dt,speedRatio,crouch){
    state.tailPhase+=dt*(1.05+speedRatio*3.2);
    const idleSway=Math.sin(state.tailPhase)*(.16+speedRatio*.22)*(1-crouch*.55);
    // The tail is a counterweight: it swings AGAINST lateral motion, which is
    // how a cat corners at speed and how it balances on a narrow ledge.
    const counter=clamp(-state.velocity.x*.24,-.95,.95);
    const targetX=state.tailDriveX+pose.tailLift*.9-crouch*1.05;
    const targetY=state.tailDriveY+pose.tailSway+idleSway+counter;
    for(let index=0;index<TAIL_SEGMENTS;index++){
      const share=TAIL_SHARE[index],stiffness=TAIL_STIFFNESS*TAIL_LAG[index],damping=TAIL_DAMPING;
      state.tailVX[index]+=((targetX*share)-state.tailX[index])*stiffness*dt;
      state.tailVY[index]+=((targetY*share)-state.tailY[index])*stiffness*dt;
      state.tailVX[index]-=state.tailVX[index]*Math.min(1,damping*dt);
      state.tailVY[index]-=state.tailVY[index]*Math.min(1,damping*dt);
      state.tailX[index]+=state.tailVX[index]*dt;
      state.tailY[index]+=state.tailVY[index]*dt;
      rotateFrom(TAIL_KEYS[index],'x',state.tailX[index]);
      rotateFrom(TAIL_KEYS[index],'y',state.tailY[index]);
    }
  }
  // ---- 08.5 attention. The pawn hands over a local-space point of interest;
  //      the head turns toward it and the ears track it. With no target the
  //      ears twitch on a timer, which is what stops an idle cat reading dead.
  function applyAttention(dt,want){
    const hasTarget=want&&(want.lookX!=null||want.lookY!=null||want.lookZ!=null);
    if(hasTarget){
      state.lookTarget.x=finite(want.lookX,0);state.lookTarget.y=finite(want.lookY,0);state.lookTarget.z=finite(want.lookZ,1);
      state.lookWeight+=(clamp(finite(want.lookWeight,1),0,1)-state.lookWeight)*Math.min(1,4*dt);
    } else state.lookWeight-=state.lookWeight*Math.min(1,3*dt);
    const smoothing=Math.min(1,7*dt);
    state.look.x+=(state.lookTarget.x-state.look.x)*smoothing;
    state.look.y+=(state.lookTarget.y-state.look.y)*smoothing;
    state.look.z+=(state.lookTarget.z-state.look.z)*smoothing;
    const yaw=clamp(Math.atan2(state.look.x,Math.max(.05,state.look.z)),-1.15,1.15)*state.lookWeight;
    const pitch=clamp(-Math.atan2(state.look.y,Math.max(.05,Math.hypot(state.look.x,state.look.z))),-.7,.7)*state.lookWeight;
    pose.headYaw+=yaw;pose.headPitch+=pitch;
    pose.earAlert+=state.lookWeight*.8;
    state.earTimer-=dt;
    if(state.earTimer<=0){ state.earTimer=1.1+((state.idlePhase*97)%1)*2.6; state.earTwitch=.28; }
    state.earTwitch-=state.earTwitch*Math.min(1,9*dt);
  }
  // ---- 08.6 posture. Stealth is the pose the whole ability is sold by: body
  //      low and LONG (a stalking cat extends, it does not curl), ears forward,
  //      tail flat with a twitching tip.
  function applyPosture(crouch,lean){
    pose.crouch+=crouch;pose.lean+=lean;
    pose.arch+=-crouch*.28;
    pose.headPitch+=crouch*.30;
    pose.earAlert+=crouch*.55;
    pose.tailLift+=-crouch*.65;
    pose.tailSway+=Math.sin(state.tailPhase*3.1)*crouch*.30;
    pose.frontFold+=crouch*.42;pose.hindFold+=crouch*.62;
  }
  function applyStairPose(want,dt,speed){
    const grounded=want.groundContact!==false&&want.grounded!==false;
    const rise=Math.max(0,finite(want.stepRise,0)),maxRise=Math.max(.02,finite(want.stepHeight,.42));
    if(grounded&&rise>.001){
      const speedScale=.45+.55*clamp(speed/Math.max(.1,state.walkSpeed),0,1);
      state.stair.amount=Math.max(state.stair.amount,clamp(rise/maxRise,0,1)*speedScale*state.stepPoseStrength);
      state.stair.side=finite(want.stepSide,state.stair.side)>=0?1:-1;state.stair.rise=rise;
    } else state.stair.amount*=Math.exp(-8*Math.max(.0001,dt));
    const amount=clamp(state.stair.amount,0,1.5);if(amount<.002)return;
    // All four existing digitigrade chains participate: shoulders choose the
    // leading side, knees/hocks fold, and the body settles over the tread.
    pose.frontSplit+=state.stair.side*.30*amount;
    pose.frontFold+=.64*amount;pose.hindFold+=.24*amount;
    pose.crouch+=.08*amount;pose.headPitch-=.05*amount;
  }
  function applyGesture(dt){
    const gesture=state.gesture;
    if(!gesture.held)gesture.elapsed+=dt;
    const entry=behaviour(gesture.name);
    const t=entry.loop&&gesture.repeat?clamp(gesture.elapsed/gesture.duration,0,1):clamp(gesture.elapsed/gesture.duration,0,1);
    resetAllParts();clearPose();
    entry.pose(rig,t,gesture.elapsed);
    applyAttention(dt,gesture.want);
    flushPose();
    applyTail(dt,0,clamp(pose.crouch,0,1));
    if(t>=1&&!entry.loop){
      const done=gesture.onDone;state.gesture=null;resetAllParts();
      if(typeof done==='function')done(gesture.name);
    }
  }

  // ---- 08.7 gait selection. Real cats do not step straight from a walk to a
  //      gallop; the amble sits between. Every boundary is derived from the
  //      authored walk/trot/run speeds so a re-tuned pawn re-tunes the gaits.
  function gaitFromSpeed(speed){
    if(speed<Math.max(.05,state.walkSpeed*.18))return 'idle';
    if(speed<state.walkSpeed*1.35)return 'walk';
    if(speed<state.trotSpeed)return 'amble';
    if(speed<state.runSpeed*.78)return 'trot';
    return 'run';
  }
  function selectGait(want,speed){
    const requested=String(want.gait||'');
    if(requested&&hasGait(requested))return requested;
    if(state.crouch>.5)return 'crouch';
    return gaitFromSpeed(speed);
  }

  // desired: local target velocity {x lateral, z forward} in m/s plus optional
  // gait/crouch/grounded/velocityY and lookX/lookY/lookZ attention hints,
  // matching the character controller.
  function update(desired,dt){
    if(!state.bound)return;
    const h=Math.max(.0001,finite(dt,.016)),want=desired||{};
    const k=1-Math.exp(-state.responsiveness*h);
    state.velocity.x+=(finite(want.x,0)-state.velocity.x)*k;
    state.velocity.z+=(finite(want.z,0)-state.velocity.z)*k;
    state.predicted.x=state.velocity.x+(finite(want.x,0)-state.velocity.x)*state.predictionTime*state.responsiveness;
    state.predicted.z=state.velocity.z+(finite(want.z,0)-state.velocity.z)*state.predictionTime*state.responsiveness;
    const crouchTarget=want.crouch===true?1:clamp(finite(want.crouch,0),0,1);
    state.crouch+=(crouchTarget-state.crouch)*(1-Math.exp(-9*h));
    if(state.gesture){ state.gesture.want=want; applyGesture(h); return; }
    const speed=Math.max(finite(want.speed,0),Math.hypot(state.predicted.x,state.predicted.z));
    const grounded=want.grounded!==false;
    resetAllParts();clearPose();
    if(!grounded){
      state.gait='air';state.cycleKey='idle';
      applyAir(finite(want.velocityY,0),h);
      applyAttention(h,want);
      flushPose();
      applyTail(h,.5,0);
      return;
    }
    state.airborne=0;state.groundTime+=h;
    const gaitName=selectGait(want,speed);
    if(gaitName!==state.gait){ state.blendKey=state.cycleKey; state.blend=0; state.gait=gaitName; state.cycleKey=GAIT_ALIASES[gaitName]||gaitName; }
    state.blend=Math.min(1,state.blend+h*4.5);
    const cycle=gaitCycle(gaitName),previous=state.blend<1?GAIT_CYCLES[state.blendKey]:null;
    const speedRatio=clamp(speed/Math.max(.1,state.runSpeed),0,1);
    applyPosture(state.crouch,speedRatio*(state.cycleKey==='gallop'?.22:.10));
    applyGait(cycle,previous,state.blend,speedRatio,h);
    applyStairPose(want,h,speed);
    applyAttention(h,want);
    flushPose();
    applyTail(h,speedRatio,state.crouch);
  }

  // ---- 08.8 public action surface
  function playAction(clipName,actionOptions){
    if(!state.bound)return false;
    const o=actionOptions||{},name=resolveGesture(clipName),entry=behaviour(name);
    state.gesture={name,elapsed:0,duration:clamp(finite(o.duration,entry.duration),.15,12),onDone:o.onDone,held:false,repeat:entry.loop,want:null};
    return true;
  }
  function stopAction(){ if(!state.gesture)return;const done=state.gesture.onDone;state.gesture=null;resetAllParts();if(typeof done==='function')done(); }
  function isActionPlaying(){ return !!state.gesture; }
  function holdActionAtProgress(progress){
    if(!state.gesture)return false;
    state.gesture.elapsed=state.gesture.duration*clamp(finite(progress,.5),0,.94);state.gesture.held=true;applyGesture(0);return true;
  }
  function resumeAction(){ if(!state.gesture)return false;state.gesture.held=false;return true; }
  function actionProgress(){ return state.gesture?clamp(state.gesture.elapsed/Math.max(.001,state.gesture.duration),0,1):0; }
  function configure(patch){
    const p=patch||{};
    if(p.species!=null)state.species=normalizeSpecies(p.species);
    if(p.walkSpeed!=null)state.walkSpeed=Math.max(.05,finite(p.walkSpeed,state.walkSpeed));
    if(p.trotSpeed!=null)state.trotSpeed=Math.max(.1,finite(p.trotSpeed,state.trotSpeed));
    if(p.runSpeed!=null)state.runSpeed=Math.max(.2,finite(p.runSpeed,state.runSpeed));
    if(p.responsiveness!=null)state.responsiveness=Math.max(.5,finite(p.responsiveness,state.responsiveness));
    if(p.predictionTime!=null)state.predictionTime=Math.max(0,finite(p.predictionTime,state.predictionTime));
    if(p.stepPoseStrength!=null)state.stepPoseStrength=clamp(finite(p.stepPoseStrength,state.stepPoseStrength),0,2);
    return true;
  }
  function dispose(){
    if(state.bound)resetAllParts();
    state.owner=null;state.parts={};state.rest={};state.bound=false;state.boundKeys=[];state.gesture=null;
    state.phase=0;state.idlePhase=0;state.crouch=0;state.airborne=0;state.groundTime=0;
    state.gait='idle';state.cycleKey='idle';state.blendKey='idle';state.blend=1;
    state.velocity={x:0,z:0};state.predicted={x:0,z:0};
    state.stair={amount:0,side:1,rise:0};
    state.tailX.fill(0);state.tailY.fill(0);state.tailVX.fill(0);state.tailVY.fill(0);
    state.tailDriveX=0;state.tailDriveY=0;state.tailPhase=0;
    state.look.x=0;state.look.y=0;state.look.z=1;state.lookTarget.x=0;state.lookTarget.y=0;state.lookTarget.z=1;
    state.lookWeight=0;state.earTwitch=0;state.earTimer=1.4;
  }

  return Object.freeze({
    bind,update,playAction,stopAction,isActionPlaying,holdActionAtProgress,resumeAction,actionProgress,configure,dispose,
    isBound:()=>state.bound,
    boundParts:()=>state.boundKeys.slice(),
    availableClips:()=>Object.keys(BEHAVIOURS),
    debugState:()=>({species:state.species,velocity:{x:state.velocity.x,z:state.velocity.z},crouch:state.crouch,gait:state.gait,cycle:state.cycleKey,blend:state.blend,stair:Object.assign({},state.stair),gesture:state.gesture?state.gesture.name:null}),
  });
}

// ====================================================== 09 public surface

window.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION=Object.freeze({
  SPECIES,PROFILES,PART_IDS,PART_KEYS,LEGS,LEG_KEYS,KNEE_KEYS,ANKLE_KEYS,TOE_KEYS,TAIL_KEYS,
  DETAIL,TORSO,STANCE,BUILD,COLOR_KEYS,GAIT_CYCLES,GAIT_ALIASES,GAIT_ORDER,BEHAVIOURS,
  normalizeSpecies,profile,solveLimb,poseParts,sceneElements,createVisual,paletteColor,
  gaitCycle,hasGait,behaviour,resolveGesture,createController,
});
})();
