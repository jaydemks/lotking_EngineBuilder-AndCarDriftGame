'use strict';

/* =========================================================
   LOT KING - Procedural feline rig and gait tests

   Guards the three things that made the old placeholder read as a sausage and
   that a future edit could quietly undo:

     01  anatomy      segmented spine, distinct torso masses, no single body blob
     02  limbs        solved digitigrade chains that reach the ground exactly
     03  head         feline skull, cheeks, pinna, whiskers, slit pupils
     04  tail         five segments driven by a lag spring
     05  gaits        real footfall tables, ordered by speed, blended
     06  behaviour    the verb vocabulary and its fuzzy clip matcher
     07  species      dog, horse and generic still build and still differ
     08  contracts    editability, detail fallback and unknown-name throws
   ========================================================= */

const assert=require('node:assert/strict');
const THREE=require('three');

global.window=global;global.THREE=THREE;
require('../js/runtime/animal-placeholder-locomotion.js');

const RIG=global.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION;

function test(name,run){try{run();console.log('ok - '+name);}catch(error){console.error('not ok - '+name);throw error;}}

/** Walk the part table and resolve every node's world Y/Z under the rest pose,
 *  accumulating parent X rotation. Enough to prove the stance stands up. */
function restPose(spec){
  const parts=RIG.poseParts(spec),map=new Map([['root',{y:0,z:0,angle:0}]]);
  parts.forEach(part=>{
    const parent=map.get(part.parentId)||{y:0,z:0,angle:0};
    const angle=parent.angle+part.rotation[0]*Math.PI/180;
    map.set(part.id,{
      y:parent.y+part.position[1]*Math.cos(parent.angle)-part.position[2]*Math.sin(parent.angle),
      z:parent.z+part.position[1]*Math.sin(parent.angle)+part.position[2]*Math.cos(parent.angle),
      angle,
    });
  });
  return {parts,map};
}
function ids(parts){return new Set(parts.map(part=>part.id));}

// ------------------------------------------------------------- 01 anatomy

test('the trunk is four masses on a three-joint flexible spine, not one blob',()=>{
  const spec=RIG.profile('cat'),present=ids(RIG.poseParts(spec));
  ['animal_spine','animal_spine_lumbar','animal_spine_thorax','animal_spine_withers'].forEach(id=>
    assert.ok(present.has(id),'missing spine joint '+id));
  ['animal_croup','animal_loin','animal_ribcage','animal_belly','animal_sternum'].forEach(id=>
    assert.ok(present.has(id),'missing torso mass '+id));
  assert.equal(present.has('animal_body'),false,'the single stretched body sphere must be gone');
  // The chest is DEEPER than it is WIDE on a real cat. The old rig had it the
  // other way round, which is the sausage silhouette from every angle.
  assert.ok(spec.chestDepth>spec.chestWidth*1.25,'chest must be laterally compressed');
  // And there must be a waist: the loin is narrower than both chest and croup.
  assert.ok(spec.loinWidth<spec.chestWidth&&spec.loinWidth<spec.croupWidth,'cat must have a visible waist');
  // Shoulders sit lower than hips: a standing cat is tipped forward.
  assert.ok(spec.hipY>spec.shoulderY,'hips must ride above the shoulders');
});

test('scapulae and haunches exist as separate animated masses',()=>{
  const present=ids(RIG.poseParts(RIG.profile('cat')));
  ['animal_scapula_l','animal_scapula_r','animal_haunch_l','animal_haunch_r'].forEach(id=>
    assert.ok(present.has(id),'missing '+id));
  assert.equal(RIG.PART_IDS.scapulaLeft,'animal_scapula_l');
});

// --------------------------------------------------------------- 02 limbs

test('every limb is a solved digitigrade chain that lands exactly on the ground',()=>{
  ['cat','dog','generic'].forEach(species=>{
    const spec=RIG.profile(species);
    assert.equal(spec.stance,'digitigrade',species+' must be digitigrade');
    const {map}=restPose(spec);
    ['fl','fr','bl','br'].forEach(key=>{
      const toe=map.get('animal_toe_'+key);
      assert.ok(toe,species+' missing toe joint '+key);
      // The toe joint sits one paw thickness above the ground; the paw mesh
      // hangs from it and closes the last millimetre.
      const error=Math.abs(toe.y-spec.pawRadius*.85);
      assert.ok(error<1e-3,species+' '+key+' toe joint off the ground by '+error);
    });
    // Four load-bearing bones per limb: upper, lower, cannon, then the paw.
    const present=ids(RIG.poseParts(spec));
    ['fl','fr','bl','br'].forEach(key=>{
      ['animal_leg_','animal_upper_','animal_knee_','animal_shin_','animal_ankle_','animal_cannon_','animal_toe_','animal_paw_']
        .forEach(prefix=>assert.ok(present.has(prefix+key),species+' missing '+prefix+key));
    });
  });
});

test('the hind limb carries the characteristic feline hock angle',()=>{
  const spec=RIG.profile('cat'),hind=spec.hindLimb.bones,front=spec.frontLimb.bones;
  // femur forward-down, tibia sharply back-down, metatarsus forward again: the
  // zig-zag that makes a cat look coiled rather than stilted.
  assert.ok(hind[0].angle<-20,'femur must point forward-down');
  assert.ok(hind[1].angle>40,'tibia must swing back to a deep hock');
  assert.ok(hind[2].angle<-20,'metatarsus must return under the hip');
  // The forelimb is the milder S: humerus back, radius forward, metacarpus up.
  assert.ok(front[0].angle>20&&front[1].angle<-20,'forelimb must fold at the elbow');
  // Feet land under the body, not out to the sides.
  assert.ok(Math.abs(spec.frontLimb.reach)<spec.bodyLength*.3);
  assert.ok(Math.abs(spec.hindLimb.reach)<spec.bodyLength*.3);
});

test('a collapsed stance chain throws instead of building a floating animal',()=>{
  assert.throws(()=>RIG.solveLimb([{fraction:1,angle:90,id:'a',name:'A'}],1,1),/stance chain collapses/);
});

// ---------------------------------------------------------------- 03 head

test('the head is feline: cranium, cheeks, short muzzle, pinna, slit pupils',()=>{
  const spec=RIG.profile('cat'),present=ids(RIG.poseParts(spec));
  ['animal_head_mesh','animal_cheek_l','animal_cheek_r','animal_muzzle','animal_nose','animal_chin',
   'animal_eye_left','animal_eye_right','animal_pupil_left','animal_pupil_right',
   'animal_ear_left','animal_ear_left_mesh','animal_ear_left_inner','animal_ear_right_inner']
    .forEach(id=>assert.ok(present.has(id),'missing head part '+id));
  // A cat muzzle is SHORT: it must not project further than the skull is wide.
  assert.ok(spec.muzzle<spec.headSize*.6,'feline muzzle must stay short');
  // Whiskers: three pairs at full detail, gone at silhouette detail.
  const whiskers=RIG.poseParts(spec).filter(part=>/^animal_whisker_/.test(part.id));
  assert.equal(whiskers.length,spec.whiskers*2);
  assert.ok(whiskers.length>0,'a cat must have whiskers at full detail');
});

// ---------------------------------------------------------------- 04 tail

test('the tail is five spring-driven segments, tip in the accent colour',()=>{
  const parts=RIG.poseParts(RIG.profile('cat')),present=ids(parts);
  assert.equal(RIG.TAIL_KEYS.length,5);
  RIG.TAIL_KEYS.forEach(key=>{
    assert.ok(present.has(RIG.PART_IDS[key]),'missing tail joint '+key);
    assert.ok(present.has(RIG.PART_IDS[key]+'_mesh'),'missing tail mesh '+key);
  });
  const tip=parts.find(part=>part.id===RIG.PART_IDS.tailTip+'_mesh');
  assert.equal(tip.colorKey,'accent');
  // Segments taper toward the tip.
  const base=parts.find(part=>part.id===RIG.PART_IDS.tailBase+'_mesh');
  assert.ok(base.scale[0]>tip.scale[0],'the tail must taper');
});

test('the tail lags behind the body instead of being welded to it',()=>{
  const visual=RIG.createVisual(THREE,'cat',{},{}),controller=RIG.createController({species:'cat'});
  assert.equal(controller.bind(visual),true);
  const tip=visual.getObjectByProperty('name','Tail Joint 5');
  const samples=[];
  for(let index=0;index<90;index++){
    // Hard left/right reversal: a spring tail must overshoot and settle.
    controller.update({x:index<45?4:-4,z:3,speed:5,grounded:true},1/60);
    samples.push(tip.rotation.y);
  }
  const spread=Math.max.apply(null,samples)-Math.min.apply(null,samples);
  assert.ok(spread>.05,'tail tip must swing through the direction change, got '+spread);
  assert.ok(samples.every(Number.isFinite),'tail spring must stay numerically stable');
  controller.dispose();
});

// --------------------------------------------------------------- 05 gaits

test('gait cycles use the real feline footfall sequences',()=>{
  const cycles=RIG.GAIT_CYCLES;
  // Walk: lateral sequence, four separate beats, high duty factor.
  assert.equal(new Set(cycles.walk.offsets).size,4,'walk must be a four-beat gait');
  assert.ok(cycles.walk.duty>.6,'a walking cat keeps three feet down');
  // Trot: diagonal pairs strike together - FL with HR, FR with HL.
  assert.equal(cycles.trot.offsets[0],cycles.trot.offsets[3]);
  assert.equal(cycles.trot.offsets[1],cycles.trot.offsets[2]);
  // Gallop: two suspensions means a low duty factor and a strong spine bound.
  assert.ok(cycles.gallop.duty<.4,'a gallop must leave the ground');
  assert.ok(cycles.gallop.spineFlex>cycles.trot.spineFlex*2,'the gallop is a bound');
  // Amble sits between walk and trot; every cycle speeds up in reading order.
  const order=RIG.GAIT_ORDER.filter(name=>name!=='idle'&&name!=='crouch');
  for(let index=1;index<order.length;index++)
    assert.ok(cycles[order[index]].frequency>cycles[order[index-1]].frequency,order[index]+' must be faster than '+order[index-1]);
  // 'run' is the public animation-set name; the rotary gallop is what plays.
  assert.equal(RIG.gaitCycle('run'),cycles.gallop);
});

test('speed selects walk, amble, trot then gallop and blends between them',()=>{
  const visual=RIG.createVisual(THREE,'cat',{},{});
  const controller=RIG.createController({species:'cat',walkSpeed:1.2,trotSpeed:2.8,runSpeed:6.8});
  assert.equal(controller.bind(visual),true);
  const seen=[];
  [0,1,2.2,3.5,6.5].forEach(speed=>{
    for(let index=0;index<40;index++)controller.update({x:0,z:speed,speed,grounded:true},1/60);
    seen.push(controller.debugState().gait);
  });
  assert.deepEqual(seen,['idle','walk','amble','trot','run'],'speed must ladder through every gait');
  // A gait change must blend rather than pop.
  for(let index=0;index<40;index++)controller.update({x:0,z:1.2,speed:1.2,grounded:true},1/60);
  controller.update({x:0,z:6.5,speed:6.5,grounded:true},1/60);
  assert.ok(controller.debugState().blend<1,'a gait switch must start a blend');
  for(let index=0;index<40;index++)controller.update({x:0,z:6.5,speed:6.5,grounded:true},1/60);
  assert.equal(controller.debugState().blend,1,'the blend must finish');
  controller.dispose();
});

test('every joint of the digitigrade chain animates, not just the hip',()=>{
  const visual=RIG.createVisual(THREE,'cat',{},{}),controller=RIG.createController({species:'cat'});
  controller.bind(visual);
  const watched=['Front Left Hip Joint','Front Left Elbow Joint','Front Left Carpus Joint','Front Left Toe Joint',
                 'Back Right Hip Joint','Back Right Stifle Joint','Back Right Hock Joint','Lumbar Joint','Thoracic Joint'];
  const nodes=watched.map(name=>{
    const node=visual.getObjectByProperty('name',name);
    assert.ok(node,'rig is missing '+name);
    return {name,node,min:node.rotation.x,max:node.rotation.x};
  });
  for(let index=0;index<180;index++){
    controller.update({x:0,z:6,speed:6,grounded:true},1/60);
    nodes.forEach(entry=>{entry.min=Math.min(entry.min,entry.node.rotation.x);entry.max=Math.max(entry.max,entry.node.rotation.x);});
  }
  nodes.forEach(entry=>assert.ok(entry.max-entry.min>.01,entry.name+' never moves ('+(entry.max-entry.min)+')'));
  controller.dispose();
});

test('a falling cat rights itself and reaches for the ground',()=>{
  const visual=RIG.createVisual(THREE,'cat',{},{}),controller=RIG.createController({species:'cat'});
  controller.bind(visual);
  const spine=visual.getObjectByProperty('name','Spine Root (Sacrum)');
  const frontLeg=visual.getObjectByProperty('name','Front Left Hip Joint');
  for(let index=0;index<20;index++)controller.update({x:0,z:0,grounded:false,velocityY:5},1/60);
  const rising=frontLeg.rotation.x,risingLean=spine.rotation.x;
  for(let index=0;index<20;index++)controller.update({x:0,z:0,grounded:false,velocityY:-7},1/60);
  assert.notEqual(frontLeg.rotation.x,rising,'the tuck must become a reach');
  assert.ok(frontLeg.rotation.x<rising,'forelegs must extend toward the ground while falling');
  assert.ok(spine.rotation.x>risingLean,'the body must level out for the landing');
  controller.dispose();
});

test('the stalking pose is low and long, with flattened ears and a low tail',()=>{
  const visual=RIG.createVisual(THREE,'cat',{},{}),controller=RIG.createController({species:'cat'});
  controller.bind(visual);
  const spine=visual.getObjectByProperty('name','Spine Root (Sacrum)');
  const ear=visual.getObjectByProperty('name','Left Ear Joint');
  for(let index=0;index<30;index++)controller.update({x:0,z:.6,speed:.6,grounded:true},1/60);
  const standY=spine.position.y,standEar=ear.rotation.z;
  for(let index=0;index<60;index++)controller.update({x:0,z:.6,speed:.6,crouch:true,grounded:true},1/60);
  assert.ok(spine.position.y<standY*.85,'stealth must drop the body');
  assert.notEqual(ear.rotation.z,standEar,'stealth must move the ears');
  assert.equal(controller.debugState().gait,'crouch');
  controller.dispose();
});

test('ears and head track a point of interest and settle when it is gone',()=>{
  const visual=RIG.createVisual(THREE,'cat',{},{}),controller=RIG.createController({species:'cat'});
  controller.bind(visual);
  const head=visual.getObjectByProperty('name','Head Joint');
  for(let index=0;index<60;index++)controller.update({x:0,z:0,grounded:true,lookX:1,lookY:0,lookZ:.2},1/60);
  const turned=head.rotation.y;
  assert.ok(Math.abs(turned)>.2,'the head must turn toward the interest point');
  for(let index=0;index<120;index++)controller.update({x:0,z:0,grounded:true},1/60);
  assert.ok(Math.abs(head.rotation.y)<Math.abs(turned)*.5,'attention must decay when nothing is there');
  controller.dispose();
});

// ------------------------------------------------------------ 06 behaviour

test('the cat behaviour vocabulary is complete and reachable by clip name',()=>{
  ['pounce','jump','land','climb','stretch','sit','groom','knead','curl','alert','sniff','voice','hiss','dig','fetch','rear','shake']
    .forEach(name=>assert.ok(RIG.BEHAVIOURS[name],'missing behaviour '+name));
  const expected={'Cat Stretch':'stretch','Sit Down':'sit','Wash Face':'groom','make biscuits':'knead',
    'Nap':'curl','Meow':'voice','Purr':'voice','Leap':'pounce','Mantle Up':'climb','sniff around':'sniff','Hiss!':'hiss'};
  Object.keys(expected).forEach(clip=>assert.equal(RIG.resolveGesture(clip),expected[clip],clip));
  // Unknown author clip names fall back rather than crashing gameplay...
  assert.equal(RIG.resolveGesture('totally unknown clip'),'shake');
  // ...but an unknown INTERNAL table name throws.
  assert.throws(()=>RIG.behaviour('nonexistent'),/unknown behaviour/);
  assert.throws(()=>RIG.gaitCycle('moonwalk'),/unknown gait cycle/);
});

test('behaviours pose the rig and hand control back when they finish',()=>{
  const visual=RIG.createVisual(THREE,'cat',{},{}),controller=RIG.createController({species:'cat'});
  controller.bind(visual);
  const spine=visual.getObjectByProperty('name','Spine Root (Sacrum)'),rest=spine.position.y;
  let finished=null;
  assert.equal(controller.playAction('Big Stretch',{onDone:name=>{finished=name;}}),true);
  let moved=false;
  for(let index=0;index<40;index++){controller.update({x:0,z:0,grounded:true},1/60);if(Math.abs(spine.position.y-rest)>1e-4)moved=true;}
  assert.ok(moved,'the stretch must actually move the body');
  for(let index=0;index<120;index++)controller.update({x:0,z:0,grounded:true},1/60);
  assert.equal(finished,'stretch');
  assert.equal(controller.isActionPlaying(),false);
  // Held looping states (sit, groom, knead, curl) stay until stopped.
  controller.playAction('sit');
  for(let index=0;index<200;index++)controller.update({x:0,z:0,grounded:true},1/60);
  assert.equal(controller.isActionPlaying(),true,'sit is a held state, not a beat');
  controller.stopAction();
  assert.equal(controller.isActionPlaying(),false);
  controller.dispose();
});

// -------------------------------------------------------------- 07 species

test('dog, horse and generic still build, still differ and still animate',()=>{
  const cat=RIG.profile('cat'),dog=RIG.profile('dog'),horse=RIG.profile('horse'),generic=RIG.profile('generic');
  assert.ok(horse.standHeight>cat.standHeight*3);
  assert.ok(horse.bodyLength>cat.bodyLength*2);
  assert.equal(horse.stance,'unguligrade','a horse is not digitigrade');
  assert.ok(dog.bodyLength>cat.bodyLength&&dog.bodyLength<horse.bodyLength);
  assert.equal(generic.stance,'digitigrade');
  // The horse cannon is proportionally the longest segment of its limb.
  const cannon=horse.hindLimb.bones[2],femur=horse.hindLimb.bones[0];
  assert.ok(cannon.length>femur.length,'unguligrade limbs are cannon-dominant');
  ['dog','horse','generic'].forEach(species=>{
    const visual=RIG.createVisual(THREE,species,{},{}),controller=RIG.createController({species});
    assert.equal(controller.bind(visual),true,species+' must bind');
    const hip=visual.getObjectByProperty('name','Front Left Hip Joint'),before=hip.rotation.x;
    for(let index=0;index<40;index++)controller.update({x:0,z:5,speed:5,grounded:true},1/60);
    assert.notEqual(hip.rotation.x,before,species+' must animate');
    assert.match(controller.debugState().gait,/walk|amble|trot|run/);
    controller.dispose();
  });
});

// ------------------------------------------------------------ 08 contracts

test('every part stays an editable scene element with a resolved colour',()=>{
  const elements=RIG.sceneElements('cat',{furColor:'#112233',bellyColor:'#445566',accentColor:'#778899',eyeColor:'#aabbcc',skinColor:'#ddeeff'},{});
  assert.ok(elements.length>60,'the rig must expose every part to the outliner');
  elements.forEach(element=>{
    assert.ok(element.id&&element.name,'every element needs an id and a name');
    assert.equal(element.linked,true);
    assert.ok(/^#[0-9a-f]{6}$/i.test(element.color),element.id+' has no resolved colour: '+element.color);
    assert.equal(element.position.length,3);assert.equal(element.scale.length,3);
  });
  assert.ok(elements.some(element=>element.color.toLowerCase()==='#ddeeff'),'the skin palette slot must reach the rig');
  // Unknown palette keys throw rather than painting something grey.
  assert.throws(()=>RIG.paletteColor(RIG.profile('cat'),{},'sparkle'),/unknown colour key/);
});

test('detail level is the low-end fallback and prunes cosmetic meshes only',()=>{
  const full=RIG.poseParts(RIG.profile('cat',{detailLevel:2})).length;
  const standard=RIG.poseParts(RIG.profile('cat',{detailLevel:1})).length;
  const silhouette=RIG.poseParts(RIG.profile('cat',{detailLevel:0})).length;
  assert.ok(full>standard&&standard>silhouette,'detail must actually prune: '+[silhouette,standard,full]);
  // Whatever the level, the animated skeleton survives: the controller must
  // still find the spine, every limb joint and the whole tail.
  const visual=RIG.createVisual(THREE,'cat',{},{detailLevel:0}),controller=RIG.createController({species:'cat'});
  assert.equal(controller.bind(visual),true);
  const bound=controller.boundParts();
  RIG.PART_KEYS.forEach(key=>assert.ok(bound.includes(key),'silhouette detail lost animated joint '+key));
  controller.dispose();
});

test('proportion overrides survive and unknown species is sanitized, not fatal',()=>{
  const stretched=RIG.profile('cat',{bodyLength:.9,standHeight:.5,tailLength:.6});
  assert.equal(stretched.bodyLength,.9);
  assert.ok(stretched.hipY>.4,'a taller cat must raise its hips');
  const {map}=restPose(stretched);
  assert.ok(Math.abs(map.get('animal_toe_fl').y-stretched.pawRadius*.85)<1e-3,'overridden proportions must still reach the ground');
  assert.equal(RIG.normalizeSpecies('tiger'),'generic');
  assert.equal(RIG.profile('tiger').species,'generic');
});

console.log('Cat rig tests passed.');
