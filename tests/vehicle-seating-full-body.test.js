'use strict';

const assert=require('node:assert/strict');
const THREE=require('three');
global.window=global;global.THREE=THREE;
require('../js/runtime/character-weapon-pose.js');
require('../js/runtime/vehicle-occupancy.js');

const POSE=global.LK_RUNTIME_CHARACTER_WEAPON_POSE;
const OCC=global.LK_RUNTIME_VEHICLE_OCCUPANCY;

function bone(name,x,y,z){const value=new THREE.Bone();value.name=name;value.position.set(x||0,y||0,z||0);return value;}
function fullRig(){
  const root=new THREE.Group(),hips=bone('mixamorigHips',0,.9,0),spine=bone('mixamorigSpine',0,.25,0),chest=bone('mixamorigSpine2',0,.28,0),neck=bone('mixamorigNeck',0,.18,0),head=bone('mixamorigHead',0,.16,0);
  root.add(hips);hips.add(spine);spine.add(chest);chest.add(neck);neck.add(head);
  const limb=(side,sign)=>{const shoulder=bone('mixamorig'+side+'Shoulder',.13*sign,.11,0),upper=bone('mixamorig'+side+'Arm',.2*sign,0,0),lower=bone('mixamorig'+side+'ForeArm',.28*sign,0,0),hand=bone('mixamorig'+side+'Hand',.24*sign,0,0);chest.add(shoulder);shoulder.add(upper);upper.add(lower);lower.add(hand);return{shoulder,upper,lower,hand};};
  const leg=(side,sign)=>{const upper=bone('mixamorig'+side+'UpLeg',.12*sign,-.08,0),lower=bone('mixamorig'+side+'Leg',0,-.43,0),foot=bone('mixamorig'+side+'Foot',0,-.4,.04),toe=bone('mixamorig'+side+'ToeBase',0,-.04,.2);hips.add(upper);upper.add(lower);lower.add(foot);foot.add(toe);return{upper,lower,foot,toe};};
  const left=limb('Left',1),right=limb('Right',-1),leftLeg=leg('Left',1),rightLeg=leg('Right',-1);root.updateMatrixWorld(true);return{root,hips,spine,chest,left,right,leftLeg,rightLeg};
}
function snapshot(rig){const result=new Map();rig.root.traverse(node=>{if(node.isBone)result.set(node,node.quaternion.clone());});return result;}
function goals(){return{
  pelvis:{x:.08,y:1.2,z:.18},spine:{x:-.05,y:1.48,z:.25},chest:{x:.09,y:1.75,z:.3},
  leftShoulder:{x:.58,y:1.6,z:.28},rightShoulder:{x:-.58,y:1.6,z:.28},head:{x:0,y:1.95,z:.65},
  leftHand:{x:.48,y:1.12,z:.62},rightHand:{x:-.32,y:1.16,z:.66},leftFoot:{x:.22,y:.12,z:.42},rightFoot:{x:-.22,y:.12,z:.42},leftToe:{x:.22,y:.1,z:.72},rightToe:{x:-.22,y:.1,z:.72},
  leftElbowPole:{x:.75,y:1.2,z:.2},rightElbowPole:{x:-.75,y:1.2,z:.2},leftKneePole:{x:.3,y:.5,z:.65},rightKneePole:{x:-.3,y:.5,z:.65},
  pelvisRotation:[.04,0,0],spineRotation:[0,.05,0],chestRotation:[-.04,0,.03],leftShoulderRotation:[0,0,.04],rightShoulderRotation:[0,0,-.04],leftHandRotation:[.1,0,0],rightHandRotation:[-.1,0,0],leftFootRotation:[.12,0,0],rightFootRotation:[.12,0,0],leftToeRotation:[0,.08,0],rightToeRotation:[0,-.08,0],
  handWeight:1,footWeight:1,headWeight:.7,torsoWeight:1,shoulderWeight:1,toeWeight:1,fingers:{left:{},right:{}},
};}

{
  const rig=fullRig(),before=snapshot(rig);assert.equal(POSE.applySeated(THREE,rig.root,goals(),1),true);
  const controlled=[rig.hips,rig.spine,rig.chest,rig.left.shoulder,rig.right.shoulder,rig.left.hand,rig.right.hand,rig.leftLeg.foot,rig.rightLeg.foot,rig.leftLeg.toe,rig.rightLeg.toe];
  controlled.forEach(node=>assert.ok(node.quaternion.angleTo(before.get(node))>1e-5,node.name+' must respond to its seated IK control'));
  const once=snapshot(rig);POSE.applySeated(THREE,rig.root,goals(),1);controlled.forEach(node=>assert.ok(node.quaternion.angleTo(once.get(node))<1e-5,node.name+' must converge instead of accumulating every frame'));
  POSE.release(rig.root);controlled.forEach(node=>assert.ok(node.quaternion.angleTo(before.get(node))<1e-5,node.name+' must restore exactly when leaving the vehicle'));
}

{
  const rig=fullRig(),far=goals();far.leftHand={x:-2.2,y:.4,z:1.5};const before=rig.left.upper.quaternion.clone();
  POSE.applySeated(THREE,rig.root,far,1);
  assert.ok(rig.left.upper.quaternion.angleTo(before)>.25,'vehicle seating keeps exact dummy authority instead of attenuating a distant hand target');
}

{
  const legacy={position:[.1,-.4,.2],rotation:[0,4,0],ik:{leftHand:[-.3,.2,.4]}};
  const migrated=OCC.normalizeSeatProfile(legacy,'family:sketchbook-car',false),roundTrip=JSON.parse(JSON.stringify(migrated));
  ['pelvis','spine','chest','leftShoulder','rightShoulder','leftToe','rightToe','leftFootRotation','rightFootRotation'].forEach(name=>assert.equal(roundTrip.ik[name].length,3,name+' must survive project JSON'));
  assert.deepEqual(roundTrip.position,[.1,-.4,.2]);assert.deepEqual(roundTrip.ik.leftHand,[-.3,.2,.4]);
  assert.equal(roundTrip.ik.torsoWeight,0,'legacy profiles keep their old pose until a new back target is authored');
}

{
  const outer=new THREE.Group(),fittedModel=new THREE.Group(),occupant=new THREE.Group();
  outer.position.set(10,0,0);fittedModel.position.set(2,0,0);outer.add(fittedModel);outer.updateMatrixWorld(true);
  const vehicle={id:'native-player-car',kind:'native-adapter',owner:outer,config:{asset:{dbKey:'glb:high-poly-car'}},assetRoot:()=>fittedModel};
  const character={owner:occupant,state:{},config:{vehicleSeating:{profiles:{'asset:glb:high-poly-car':{position:[1,0,0],rotation:[0,0,0]}}}}};
  assert.equal(OCC.syncSeatOccupant(character,vehicle,{node:outer,synthetic:true}),true);
  assert.equal(Number(occupant.position.x.toFixed(6)),13,'the exact Play pose starts at the fitted model pivot, not the outer vehicle container');
}

{
  const rig=fullRig(),vehicleRoot=new THREE.Group(),vehicle={id:'native-player-car',kind:'native-adapter',owner:vehicleRoot,config:{},assetRoot:()=>vehicleRoot};
  const state={seated:false,vehicleSeatProfile:'before',weaponStance:'aim',weaponStanceClip:'Aim Idle'},profile={sentinel:true};
  const character={owner:rig.root,locomotionNode:rig.root,state,activeVehicleSeatProfile:profile,config:{vehicleSeating:{profiles:{}}}};
  const result=OCC.prewarmCharacter(character,[vehicle],{maximumProfiles:2});
  assert.equal(result.profiles,1);assert.equal(character.state.seated,false);assert.equal(character.state.vehicleSeatProfile,'before');
  assert.equal(character.state.weaponStance,'aim');assert.equal(character.state.weaponStanceClip,'Aim Idle');
  assert.equal(character.activeVehicleSeatProfile,profile,'seat prewarm is transactional for runtime Character state as well as bones');
}

{
  const oldDefault={schemaVersion:3,position:[0,-.56,0],rotation:[0,0,0],ik:{
    pelvis:[0,.25,.08],spine:[0,.48,.14],chest:[0,.68,.22],head:[0,.72,.55],
    leftShoulder:[-.42,.55,.22],rightShoulder:[.42,.55,.22],leftHand:[-.27,.18,.42],rightHand:[.27,.18,.42],
    leftFoot:[-.2,-.5,.42],rightFoot:[.2,-.5,.42],leftToe:[-.2,-.5,.72],rightToe:[.2,-.5,.72],
    leftElbowPole:[-.58,.05,.12],rightElbowPole:[.58,.05,.12],leftKneePole:[-.28,-.32,.7],rightKneePole:[.28,-.32,.7],
  }};
  const migrated=OCC.normalizeSeatProfile(oldDefault,'family:sketchbook-car',false);
  assert.equal(migrated.schemaVersion,5);
  assert.ok(migrated.ik.leftHand[0]>migrated.ik.rightHand[0],'left/right hand contacts follow anatomical Character space');
  assert.ok(migrated.ik.leftShoulder[0]>migrated.ik.rightShoulder[0],'shoulder targets cannot cross the torso');
  assert.ok(migrated.ik.pelvis[1]>.2&&migrated.ik.spine[1]>migrated.ik.pelvis[1]&&migrated.ik.chest[1]>migrated.ik.spine[1],'back aim endpoints rise through the spine instead of folding it downward');
}

{
  const car=OCC.defaultSeatProfile('family:sketchbook-car',false);
  const helicopter=OCC.defaultSeatProfile('family:sketchbook-helicopter',false);
  const airplane=OCC.defaultSeatProfile('family:sketchbook-airplane',false);
  assert.equal(car.schemaVersion,5);assert.deepEqual(car.position,[0,-.782,.0434]);
  assert.deepEqual(car.ik.pelvisRotation,[6.431,0,1.4588]);assert.deepEqual(car.ik.rightHandRotation,[38.5345,55.6303,-32.5505]);
  assert.deepEqual(helicopter.position,[0,-.7058,.0207]);assert.deepEqual(helicopter.ik.leftKneePole,[.28,.0297,.4749]);
  assert.deepEqual(airplane.position,[0,-.5794,0]);assert.deepEqual(airplane.ik.leftShoulderRotation,[-91.959,-65.9351,-127.3773]);
  car.ik.rightHand[0]=999;
  assert.deepEqual(OCC.defaultSeatProfile('family:sketchbook-car',false).ik.rightHand,[-.0865,.6748,.2547],
    'each Character receives an isolated copy of the engine family preset');
}

{
  const exact=OCC.defaultSeatProfile('asset:glb:high-poly-car-v3:30952800:fresh-database-key',false);
  assert.deepEqual(exact.position,[.387,-.339,-.2172]);assert.deepEqual(exact.ik.leftHand,[.557,1.1928,.1695]);
  assert.equal(exact.steeringAutoLayoutVersion,3,'the promoted High Poly cockpit pose is a stable engine default');
  const settings=OCC.defaultCharacterVehicleSeating();
  assert.ok(settings.profiles['asset:glb:high-poly-car-v3'],'new Characters visibly own the promoted exact profile');
  const owner=new THREE.Group(),vehicle={id:'native-player-car',kind:'native-adapter',owner,config:{asset:{dbKey:'glb:high-poly-car-v3:30952800:new-key'}},assetRoot:()=>owner},character={owner:new THREE.Group(),config:{vehicleSeating:{profiles:{}}}};
  const resolved=OCC.seatProfile(character,vehicle,{node:owner,synthetic:true},false);
  assert.deepEqual(resolved.position,[.387,-.339,-.2172],'a fresh level resolves the promoted exact pose without a per-level profile');
}

{
  const untouchedV4={schemaVersion:4,position:[0,-.56,0],rotation:[0,0,0],visible:true,ik:{
    enabled:true,weight:1,headWeight:.65,torsoWeight:0,shoulderWeight:0,toeWeight:0,
    pelvis:[0,.58,.14],spine:[0,.86,.2],chest:[0,1.05,.26],leftShoulder:[.45,.78,.22],rightShoulder:[-.45,.78,.22],
    head:[0,1.12,.55],leftHand:[.27,.18,.42],rightHand:[-.27,.18,.42],leftFoot:[.2,-.5,.42],rightFoot:[-.2,-.5,.42],leftToe:[.2,-.5,.72],rightToe:[-.2,-.5,.72],
    leftElbowPole:[.58,.05,.12],rightElbowPole:[-.58,.05,.12],leftKneePole:[.28,-.32,.7],rightKneePole:[-.28,-.32,.7],
    pelvisRotation:[0,0,0],spineRotation:[0,0,0],chestRotation:[0,0,0],leftShoulderRotation:[0,0,0],rightShoulderRotation:[0,0,0],
    leftHandRotation:[0,0,0],rightHandRotation:[0,0,0],leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftToeRotation:[0,0,0],rightToeRotation:[0,0,0],
    fingers:{left:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62},right:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62}},
  }};
  const migrated=OCC.normalizeSeatProfile(untouchedV4,'family:sketchbook-car',false);
  assert.deepEqual(migrated.position,[0,-.782,.0434],'an untouched old level inherits the newly authored engine default');
  assert.deepEqual(migrated.ik.leftFoot,[.1156,-.1669,.3394]);

  const custom=JSON.parse(JSON.stringify(untouchedV4));custom.position=[.25,-.61,.08];custom.ik.leftHand=[.31,.25,.5];
  const preserved=OCC.normalizeSeatProfile(custom,'family:sketchbook-car',false);
  assert.deepEqual(preserved.position,[.25,-.61,.08]);assert.deepEqual(preserved.ik.leftHand,[.31,.25,.5]);
  assert.equal(preserved.ik.torsoWeight,0,'an explicitly edited old profile is not silently replaced by an engine family preset');
}

console.log('vehicle-seating-full-body.test.js: all assertions passed');
