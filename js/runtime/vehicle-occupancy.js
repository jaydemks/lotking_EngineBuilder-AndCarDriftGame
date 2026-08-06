/* =========================================================
   LOT KING - Vehicle occupancy contract

   WHO can be entered, WHERE the seats are, and HOW an occupant is anchored to
   an authored seat profile. Driving physics remains outside this contract.

   Entry used to be gated on a hardcoded pawn-type test:

     /^sketchbook-(?:car|airplane|helicopter)$/.test(pawn.pawnType)

   which meant a character could board a Sketchbook car but not the native
   `player_car` and not a Logic Vehicle Pawn, even though both are vehicles with
   a driver's seat. This replaces that test with a capability: a vehicle family
   registers a provider that reports its seats, and any vehicle with a seat is
   enterable by the same controls.

   DRIVING PHYSICS IS EXPLICITLY NOT PART OF THIS CONTRACT. Each vehicle keeps
   its own model - native raycast, Sketchbook arcade, or a plugin backend. This
   module never reads or writes velocity, wheels or suspension; it owns only the
   occupancy relationship and the Character contact pose around that seat.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 5;
const ROLES = Object.freeze(['driver', 'passenger']);

function text(value, fallback){
  value = value == null ? '' : String(value).trim();
  return value || (fallback == null ? '' : String(fallback));
}
function role(value){ return ROLES.indexOf(text(value).toLowerCase()) >= 0 ? text(value).toLowerCase() : 'passenger'; }

const providers = [];

/** A vehicle family declares how to find its seats.
 *  `match(pawn)` decides ownership; `seats(pawn)` returns live seat records
 *  (mutable — occupancy is written back onto them by the entry code). */
function registerProvider(descriptor){
  const src = descriptor && typeof descriptor === 'object' ? descriptor : {};
  const id = text(src.id);
  if(!id || typeof src.match !== 'function' || typeof src.seats !== 'function') return null;
  const entry = Object.freeze({
    id,
    priority:Number(src.priority) || 0,
    match:src.match,
    seats:src.seats,
    // A family may refuse entry for its own reasons (disabled, mid-transition).
    enterable:typeof src.enterable === 'function' ? src.enterable : () => true,
    collisionRadius:typeof src.collisionRadius === 'function' ? src.collisionRadius : null,
    collisionHalfExtents:typeof src.collisionHalfExtents === 'function' ? src.collisionHalfExtents : null,
  });
  const index = providers.findIndex(item => item.id === id);
  if(index >= 0) providers.splice(index, 1, entry);
  else providers.push(entry);
  providers.sort((a, b) => b.priority - a.priority);
  return entry;
}
function providerFor(pawn){
  if(!pawn) return null;
  for(let index = 0; index < providers.length; index++){
    try { if(providers[index].match(pawn)) return providers[index]; }
    catch(err){ /* a broken provider must not make every vehicle unenterable */ }
  }
  return null;
}

/** Live seat list for a vehicle, or an empty array when it has none. */
function seatsOf(pawn){
  const provider = providerFor(pawn);
  if(!provider) return [];
  try {
    const seats = provider.seats(pawn);
    return Array.isArray(seats) ? seats : [];
  } catch(err){ return []; }
}
/** Can a character board this pawn at all right now? */
function isEnterable(pawn){
  if(!pawn || pawn.enabled === false || pawn.hidden === true || pawn.disposed || pawn.damageRuntime&&pawn.damageRuntime.destroyed()) return false;
  const provider = providerFor(pawn);
  if(!provider) return false;
  const config = pawn.config || {};
  if(config.entry && config.entry.enabled === false) return false;
  try { if(!provider.enterable(pawn)) return false; }
  catch(err){ return false; }
  return seatsOf(pawn).length > 0;
}
/** Collision and entry are separate capabilities. A destroyed vehicle rejects
 *  every seat but its chassis remains a solid wreck until it is removed from
 *  the scene or its collision is explicitly disabled by the author. */
function isCollidable(pawn){
  if(!pawn||pawn.enabled===false||pawn.hidden===true||pawn.disposed)return false;
  if(!providerFor(pawn))return false;
  return !(pawn.config&&pawn.config.collision&&pawn.config.collision.enabled===false);
}
function isFree(seat, character){
  return !!seat && !seat.occupiedBy && (!seat.reservedBy || seat.reservedBy === character);
}
/** Seats of a given role that nobody holds or has reserved. */
function availableSeats(pawn, wantedRole, character){
  const wanted = role(wantedRole);
  return seatsOf(pawn).filter(seat => isFree(seat, character) && role(seat.type) === wanted);
}

function finite(value, fallback){ const number=Number(value); return Number.isFinite(number)?number:fallback; }
function worldPosition(object){
  if(!object)return {x:0,y:0,z:0};
  const THREE=root.THREE;
  if(THREE&&object.getWorldPosition)return object.getWorldPosition(new THREE.Vector3());
  return object.position||{x:0,y:0,z:0};
}
/** Conservative XZ footprint used by arcade Characters. Cannon vehicles already
 * collide with the world, but an arcade Character owns no Cannon capsule, so it
 * needs the same live vehicle family exposed as a moving solid. */
function collisionRadius(pawn){
  const provider=providerFor(pawn);
  if(provider&&provider.collisionRadius){
    try { return Math.max(.35,finite(provider.collisionRadius(pawn),.9)); } catch(err){}
  }
  const config=pawn&&pawn.config||{},collision=config.collision||{};
  return Math.max(.35,finite(collision.radius,finite(collision.hx,finite(config.entry&&config.entry.collisionRadius,.9))));
}
function worldHeading(object){
  const THREE=root.THREE;
  if(THREE&&object&&object.getWorldQuaternion){
    const quaternion=object.getWorldQuaternion(new THREE.Quaternion()),forward=new THREE.Vector3(0,0,1).applyQuaternion(quaternion);
    return Math.atan2(forward.x,forward.z);
  }
  return finite(object&&object.rotation&&object.rotation.y,0);
}

// ---- character seating profiles ------------------------------------------

function triple(value,fallback){
  const source=Array.isArray(value)?value:[],base=Array.isArray(fallback)?fallback:[0,0,0];
  return [0,1,2].map(index=>finite(source[index],finite(base[index],0)));
}
function fingers(value){
  const source=value&&typeof value==='object'?value:{};
  return ['thumb','index','middle','ring','pinky'].reduce((out,name)=>{out[name]=Math.max(0,Math.min(1,finite(source[name],name==='index'?.35:.62)));return out;},{});
}
function assetIdentity(asset){
  if(!asset)return '';if(typeof asset==='string')return text(asset);
  return text(asset.key||asset.id||asset.dbKey||asset.src||asset.name);
}
function assetIdentities(asset){
  const values=[];
  const add=value=>{value=text(value);if(value&&values.indexOf(value)<0)values.push(value);};
  if(!asset)return values;
  if(typeof asset==='string'){add(asset);return values;}
  // Preserve the historic key/id order, but retain every stable alias. Imported
  // Player Cars are persisted by dbKey while Pawn Studio used to key their
  // exact profile by library id/key; both names must resolve to one profile.
  ['key','id','dbKey','src','url','name','sourceDbKey','sourceSrc'].forEach(name=>add(asset[name]));
  return values;
}
function vehicleAssetIdentities(pawn){
  const values=[];
  const add=asset=>assetIdentities(asset).forEach(value=>{if(values.indexOf(value)<0)values.push(value);});
  const config=pawn&&pawn.config||{},owner=pawn&&pawn.owner,userData=owner&&owner.userData||{};
  add(config.asset);add(config.model);add(config.modelAsset);add(pawn&&pawn.asset);
  if(pawn&&typeof pawn.assetDescriptor==='function')try{add(pawn.assetDescriptor());}catch(error){}
  add({key:userData.modelKey,id:userData.modelId,dbKey:userData.modelDbKey,src:userData.modelSrc,name:userData.modelName});
  const graph=userData.logicGraph||{},blueprint=graph.vehiclePawn||graph.sketchbookPawn||graph.playerPawnBlueprint||{};
  add(blueprint.modelAsset);add(blueprint.asset);
  return values;
}
function familyProfileKey(pawn){
  const provider=providerFor(pawn),type=text(pawn&&pawn.type||pawn&&pawn.pawnType).toLowerCase();
  if(provider&&provider.id==='sketchbook'&&type.indexOf('helicopter')>=0)return 'family:sketchbook-helicopter';
  if(provider&&provider.id==='sketchbook'&&type.indexOf('airplane')>=0)return 'family:sketchbook-airplane';
  if(provider&&provider.id==='sketchbook')return 'family:sketchbook-car';
  return 'family:'+(provider&&provider.id||'vehicle');
}
function vehicleProfileKeys(pawn){
  const config=pawn&&pawn.config||{},keys=vehicleAssetIdentities(pawn).map(value=>'asset:'+value);
  if(config.seatingProfileKey)keys.push(text(config.seatingProfileKey));
  keys.push(familyProfileKey(pawn),'default');
  return keys.filter((value,index,list)=>value&&list.indexOf(value)===index);
}

// Promoted from the author's FPS Playground Pawn Studio save on 2026-08-05.
// These are family defaults for the three bundled Sketchbook vehicles, not
// level overrides: every new Character and every untouched legacy Character
// starts from the same cockpit pose while an explicitly edited profile wins.
const FAMILY_SEAT_DEFAULTS=Object.freeze({
  'family:sketchbook-car':Object.freeze({
    position:[0,-.782,.0434],rotation:[.4338,0,0],visible:true,
    ik:{enabled:true,weight:1,headWeight:.65,torsoWeight:1,shoulderWeight:1,toeWeight:1,
      pelvis:[0,.2147,.0142],spine:[0,.5616,-.061],chest:[0,.8303,-.0923],
      leftShoulder:[.2809,.7748,.0225],rightShoulder:[-.3255,.78,.0418],head:[0,.9582,.1032],
      leftHand:[.0849,.6588,.1839],rightHand:[-.0865,.6748,.2547],
      leftFoot:[.1156,-.1669,.3394],rightFoot:[-.5751,.2378,.2288],
      leftToe:[-.3157,-.0197,.3758],rightToe:[-.2,-.1498,.9439],
      leftElbowPole:[.58,.05,.12],rightElbowPole:[-.5897,.4015,.0865],
      leftKneePole:[.28,-.406,.6908],rightKneePole:[-.28,-.1907,.7],
      pelvisRotation:[6.431,0,1.4588],spineRotation:[-2.5292,0,0],chestRotation:[0,0,0],
      leftShoulderRotation:[11.087,-65.3618,-59.2509],rightShoulderRotation:[21.9653,57.0818,35.0071],
      leftHandRotation:[1.3651,-14.3722,24.2127],rightHandRotation:[38.5345,55.6303,-32.5505],
      leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftToeRotation:[0,0,0],rightToeRotation:[0,0,0],
      fingers:{left:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62},right:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62}},
    },
  }),
  'family:sketchbook-helicopter':Object.freeze({
    position:[0,-.7058,.0207],rotation:[0,0,0],visible:true,
    ik:{enabled:true,weight:1,headWeight:.65,torsoWeight:1,shoulderWeight:1,toeWeight:1,
      pelvis:[.0021,.4024,-.1319],spine:[.004,.599,-.128],chest:[0,.9064,-.1685],
      leftShoulder:[.2894,.674,-.1245],rightShoulder:[-.2451,.6933,-.0662],head:[0,1.0507,-.0124],
      leftHand:[-.031,.6461,.5393],rightHand:[-.1369,.6026,.4087],
      leftFoot:[.166,-.2715,.3552],rightFoot:[-.2206,-.1102,.3945],
      leftToe:[.2376,-.1373,.9227],rightToe:[-.3269,-.2453,.8433],
      leftElbowPole:[.58,.1453,.2218],rightElbowPole:[-.58,.05,.12],
      leftKneePole:[.28,.0297,.4749],rightKneePole:[-.3317,-.1108,.6577],
      pelvisRotation:[0,0,0],spineRotation:[0,0,0],chestRotation:[-3.9271,0,0],
      leftShoulderRotation:[-4.59,-6.2341,27.9137],rightShoulderRotation:[6.5072,5.7895,-14.5506],
      leftHandRotation:[0,-57.2863,19.5764],rightHandRotation:[112.365,77.6545,-111.8973],
      leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftToeRotation:[0,0,0],rightToeRotation:[0,0,0],
      fingers:{left:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62},right:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62}},
    },
  }),
  'family:sketchbook-airplane':Object.freeze({
    position:[0,-.5794,0],rotation:[0,0,0],visible:true,
    ik:{enabled:true,weight:1,headWeight:.65,torsoWeight:1,shoulderWeight:1,toeWeight:0,
      pelvis:[0,.418,-.0461],spine:[0,.6619,-.1113],chest:[0,.9788,-.1453],
      leftShoulder:[.4235,.7679,.2113],rightShoulder:[-.5272,.7876,.3943],head:[0,1.2177,-.0029],
      leftHand:[.1015,.4786,.3867],rightHand:[-.0911,.5259,.3538],
      leftFoot:[.2,-.5,.28],rightFoot:[-.2,-.5,.28],leftToe:[.2,-.5,.58],rightToe:[-.2,-.5,.58],
      leftElbowPole:[.58,.05,.12],rightElbowPole:[-.58,.05,.12],
      leftKneePole:[.28,-.32,.7],rightKneePole:[-.28,-.32,.7],
      pelvisRotation:[0,0,0],spineRotation:[0,0,0],chestRotation:[0,0,0],
      leftShoulderRotation:[-91.959,-65.9351,-127.3773],rightShoulderRotation:[.1195,5.4568,20.8264],
      leftHandRotation:[0,-17.3549,0],rightHandRotation:[0,0,0],
      leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftToeRotation:[0,0,0],rightToeRotation:[0,0,0],
      fingers:{left:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62},right:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62}},
    },
  }),
});
// Promoted from the author's final Parking Lot / High Poly Car V3 setup on
// 2026-08-06. Use the stable model key rather than its timestamped IndexedDB
// dbKey so a fresh project/import resolves the same cockpit profile.
const HIGH_POLY_CAR_V3_PROFILE_KEY='asset:glb:high-poly-car-v3';
const HIGH_POLY_CAR_V3_SEAT_DEFAULT=Object.freeze({
  schemaVersion:SCHEMA_VERSION,position:[.387,-.339,-.2172],rotation:[0,0,0],visible:true,
  asset:{key:'glb:high-poly-car-v3',name:'high_poly_car_v3',source:'high_poly_car_v3.glb',kind:'glb',fit:5.6},
  ik:{enabled:true,weight:1,headWeight:.65,torsoWeight:1,shoulderWeight:1,toeWeight:1,
    pelvis:[.387,.7178,-.2605],spine:[.387,.9478,-.3335],chest:[.387,1.3123,-.3073],
    leftShoulder:[.617,1.1478,-.2605],rightShoulder:[.157,1.1478,-.2605],head:[.387,1.4778,-.1961],
    leftHand:[.557,1.1928,.1695],rightHand:[.217,1.1928,.1695],
    leftFoot:[.5131,.5378,.5972],rightFoot:[.254,.3858,.5506],leftToe:[.5349,.5577,.6967],rightToe:[.2745,.4934,.7195],
    leftElbowPole:[.807,1.0278,.0095],rightElbowPole:[-.033,1.0278,.0095],leftKneePole:[.5237,.6167,.2199],rightKneePole:[.2389,.5965,.2166],
    pelvisRotation:[0,0,0],spineRotation:[0,0,0],chestRotation:[0,0,0],leftShoulderRotation:[0,0,0],rightShoulderRotation:[0,0,0],
    leftHandRotation:[0,0,0],rightHandRotation:[0,0,0],leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftToeRotation:[0,0,0],rightToeRotation:[0,0,0],
    fingers:{left:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62},right:{thumb:.62,index:.35,middle:.62,ring:.62,pinky:.62}},
  },
  steeringAutoLayoutVersion:3,steeringReference:{node:'steering_wheel_mesh',position:[.387,1.0298,.2688]},
});
function copyValue(value){
  if(Array.isArray(value))return value.map(copyValue);
  if(value&&typeof value==='object')return Object.keys(value).reduce((out,name)=>{out[name]=copyValue(value[name]);return out;},{});
  return value;
}
function highPolyCarV3ProfileKey(values){return (Array.isArray(values)?values:[values]).some(value=>/high[_ -]?poly[_ -]?car[_ -]?v3/i.test(String(value||'')))?HIGH_POLY_CAR_V3_PROFILE_KEY:'';}
function defaultSeatProfile(key,synthetic){
  const exact=highPolyCarV3ProfileKey(key),authored=exact?HIGH_POLY_CAR_V3_SEAT_DEFAULT:FAMILY_SEAT_DEFAULTS[String(key)];
  if(authored){const result=copyValue(authored);result.schemaVersion=SCHEMA_VERSION;return result;}
  const helicopter=String(key).indexOf('helicopter')>=0,airplane=String(key).indexOf('airplane')>=0;
  return {
    schemaVersion:SCHEMA_VERSION,
    position:synthetic?[-.34,-.42,.08]:[0,-.56,0],rotation:[0,0,0],visible:true,
    ik:{enabled:true,weight:1,headWeight:.65,torsoWeight:0,shoulderWeight:0,toeWeight:0,
      // Targets describe the NEXT joint direction, so each back target must sit
      // above the joint it rotates. Character-space +X is the anatomical left,
      // matching classifyBones(), traversal IK and the Motion Set convention.
      pelvis:[0,.58,.14],spine:[0,.86,.2],chest:[0,1.05,.26],leftShoulder:[.45,.78,.22],rightShoulder:[-.45,.78,.22],
      head:[0,1.12,.55],leftHand:[.27,.18,helicopter?.28:.42],rightHand:[-.27,.18,helicopter?.28:.42],
      leftFoot:[.2,-.5,airplane?.28:.42],rightFoot:[-.2,-.5,airplane?.28:.42],
      leftToe:[.2,-.5,airplane?.58:.72],rightToe:[-.2,-.5,airplane?.58:.72],
      leftElbowPole:[.58,.05,.12],rightElbowPole:[-.58,.05,.12],leftKneePole:[.28,-.32,.7],rightKneePole:[-.28,-.32,.7],
      pelvisRotation:[0,0,0],spineRotation:[0,0,0],chestRotation:[0,0,0],leftShoulderRotation:[0,0,0],rightShoulderRotation:[0,0,0],
      leftHandRotation:[0,0,0],rightHandRotation:[0,0,0],leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftToeRotation:[0,0,0],rightToeRotation:[0,0,0],
      fingers:{left:fingers(null),right:fingers(null)},
    },
  };
}
function defaultCharacterVehicleSeating(){const profile=defaultSeatProfile(HIGH_POLY_CAR_V3_PROFILE_KEY,false);return {enabled:true,editorProfile:'family:sketchbook-car',profiles:{[HIGH_POLY_CAR_V3_PROFILE_KEY]:profile}};}
// Schema 4 is the last generic seating preset shipped before the author's
// bundled Sketchbook poses became engine defaults. Keep it as a migration
// reference: a genuinely edited old profile must retain its missing-field
// behaviour, while a profile that still equals this automatic preset can move
// safely to the newly authored family pose.
function legacySeatDefault(key,synthetic,version){
  const helicopter=String(key).indexOf('helicopter')>=0,airplane=String(key).indexOf('airplane')>=0;
  const profile={
    schemaVersion:Math.max(0,finite(version,4)),
    position:synthetic?[-.34,-.42,.08]:[0,-.56,0],rotation:[0,0,0],visible:true,
    ik:{enabled:true,weight:1,headWeight:.65,torsoWeight:0,shoulderWeight:0,toeWeight:0,
      pelvis:[0,.58,.14],spine:[0,.86,.2],chest:[0,1.05,.26],leftShoulder:[.45,.78,.22],rightShoulder:[-.45,.78,.22],
      head:[0,1.12,.55],leftHand:[.27,.18,helicopter?.28:.42],rightHand:[-.27,.18,helicopter?.28:.42],
      leftFoot:[.2,-.5,airplane?.28:.42],rightFoot:[-.2,-.5,airplane?.28:.42],leftToe:[.2,-.5,airplane?.58:.72],rightToe:[-.2,-.5,airplane?.58:.72],
      leftElbowPole:[.58,.05,.12],rightElbowPole:[-.58,.05,.12],leftKneePole:[.28,-.32,.7],rightKneePole:[-.28,-.32,.7],
      pelvisRotation:[0,0,0],spineRotation:[0,0,0],chestRotation:[0,0,0],leftShoulderRotation:[0,0,0],rightShoulderRotation:[0,0,0],
      leftHandRotation:[0,0,0],rightHandRotation:[0,0,0],leftFootRotation:[0,0,0],rightFootRotation:[0,0,0],leftToeRotation:[0,0,0],rightToeRotation:[0,0,0],
      fingers:{left:fingers(null),right:fingers(null)},
    },
  };
  if(finite(version,0)<4){
    Object.assign(profile.ik,{pelvis:[0,.25,.08],spine:[0,.48,.14],chest:[0,.68,.22],head:[0,.72,.55],
      leftShoulder:[-.42,.55,.22],rightShoulder:[.42,.55,.22],
      leftHand:[-.27,.18,helicopter?.28:.42],rightHand:[.27,.18,helicopter?.28:.42],
      leftFoot:[-.2,-.5,airplane?.28:.42],rightFoot:[.2,-.5,airplane?.28:.42],
      leftToe:[-.2,-.5,airplane?.58:.72],rightToe:[.2,-.5,airplane?.58:.72],
      leftElbowPole:[-.58,.05,.12],rightElbowPole:[.58,.05,.12],leftKneePole:[-.28,-.32,.7],rightKneePole:[.28,-.32,.7]});
  }
  return profile;
}
function matchesLegacySubset(value,legacy,path){
  if(value==null)return true;
  if(Array.isArray(value))return Array.isArray(legacy)&&value.every((item,index)=>matchesLegacySubset(item,legacy[index],path));
  if(value&&typeof value==='object')return Object.keys(value).every(name=>{
    if(path===''&&(name==='schemaVersion'||name==='key'))return true;
    if(path===''&&name==='asset')return value[name]==null;
    return legacy&&Object.prototype.hasOwnProperty.call(legacy,name)&&matchesLegacySubset(value[name],legacy[name],path+'.'+name);
  });
  if(typeof value==='number')return Number.isFinite(value)&&Math.abs(value-finite(legacy,NaN))<.0001;
  return value===legacy;
}
function isUntouchedLegacyFamilyProfile(value,key,synthetic,version){
  return !!FAMILY_SEAT_DEFAULTS[String(key)]&&finite(version,0)<SCHEMA_VERSION&&matchesLegacySubset(value,legacySeatDefault(key,synthetic,version),'');
}
const SEAT_SIDE_PAIRS=Object.freeze([
  ['leftShoulder','rightShoulder'],['leftHand','rightHand'],['leftFoot','rightFoot'],['leftToe','rightToe'],
  ['leftElbowPole','rightElbowPole'],['leftKneePole','rightKneePole'],
  ['leftShoulderRotation','rightShoulderRotation'],['leftHandRotation','rightHandRotation'],['leftFootRotation','rightFootRotation'],['leftToeRotation','rightToeRotation'],
]);
function sameTriple(value,expected){return Array.isArray(value)&&value.length>=3&&expected.every((number,index)=>Math.abs(finite(value[index],0)-number)<.0001);}
function migrateSeatIk(source,version){
  const ik=source&&typeof source==='object'?source:{},next=Object.assign({},ik);if(version>=4)return next;
  const scored=SEAT_SIDE_PAIRS.slice(0,6).filter(pair=>Array.isArray(ik[pair[0]])&&Array.isArray(ik[pair[1]]));
  const mirrored=scored.length>=2&&scored.filter(pair=>finite(ik[pair[0]][0],0)<finite(ik[pair[1]][0],0)).length>scored.length/2;
  if(mirrored)SEAT_SIDE_PAIRS.forEach(pair=>{if(ik[pair[0]]!=null||ik[pair[1]]!=null){next[pair[0]]=ik[pair[1]];next[pair[1]]=ik[pair[0]];}});
  // v3's torso goals were literal marker heights, not valid aim endpoints.
  // Replace only untouched defaults; any genuinely authored back curve stays.
  const oldTorso={pelvis:[0,.25,.08],spine:[0,.48,.14],chest:[0,.68,.22],head:[0,.72,.55]};
  Object.keys(oldTorso).forEach(name=>{if(sameTriple(ik[name],oldTorso[name]))delete next[name];});
  const oldSides={leftShoulder:[-.42,.55,.22],rightShoulder:[.42,.55,.22],leftHand:[-.27,.18,.42],rightHand:[.27,.18,.42],leftFoot:[-.2,-.5,.42],rightFoot:[.2,-.5,.42],leftToe:[-.2,-.5,.72],rightToe:[.2,-.5,.72],leftElbowPole:[-.58,.05,.12],rightElbowPole:[.58,.05,.12],leftKneePole:[-.28,-.32,.7],rightKneePole:[.28,-.32,.7]};
  Object.keys(oldSides).forEach(name=>{if(sameTriple(ik[name],oldSides[name]))delete next[name];});
  return next;
}
function normalizeSeatProfile(value,key,synthetic){
  const incoming=value&&typeof value==='object'?value:{},version=Math.max(0,finite(incoming.schemaVersion,0));
  const untouched=isUntouchedLegacyFamilyProfile(incoming,key,synthetic,version),source=untouched?{}:incoming;
  const promotedExact=!!highPolyCarV3ProfileKey(key),base=promotedExact||untouched||version>=SCHEMA_VERSION?defaultSeatProfile(key,synthetic):legacySeatDefault(key,synthetic,version),ik=migrateSeatIk(source.ik,version);
  return {schemaVersion:SCHEMA_VERSION,position:triple(source.position,base.position),rotation:triple(source.rotation,base.rotation),visible:source.visible!==false,asset:source.asset||null,
    ik:{enabled:ik.enabled!==false,weight:Math.max(0,Math.min(1,finite(ik.weight,base.ik.weight))),headWeight:Math.max(0,Math.min(1,finite(ik.headWeight,base.ik.headWeight))),torsoWeight:Math.max(0,Math.min(1,finite(ik.torsoWeight,base.ik.torsoWeight))),shoulderWeight:Math.max(0,Math.min(1,finite(ik.shoulderWeight,base.ik.shoulderWeight))),toeWeight:Math.max(0,Math.min(1,finite(ik.toeWeight,base.ik.toeWeight))),
      pelvis:triple(ik.pelvis,base.ik.pelvis),spine:triple(ik.spine,base.ik.spine),chest:triple(ik.chest,base.ik.chest),leftShoulder:triple(ik.leftShoulder,base.ik.leftShoulder),rightShoulder:triple(ik.rightShoulder,base.ik.rightShoulder),
      head:triple(ik.head,base.ik.head),leftHand:triple(ik.leftHand,base.ik.leftHand),rightHand:triple(ik.rightHand,base.ik.rightHand),leftFoot:triple(ik.leftFoot,base.ik.leftFoot),rightFoot:triple(ik.rightFoot,base.ik.rightFoot),leftToe:triple(ik.leftToe,base.ik.leftToe),rightToe:triple(ik.rightToe,base.ik.rightToe),
      leftElbowPole:triple(ik.leftElbowPole,base.ik.leftElbowPole),rightElbowPole:triple(ik.rightElbowPole,base.ik.rightElbowPole),leftKneePole:triple(ik.leftKneePole,base.ik.leftKneePole),rightKneePole:triple(ik.rightKneePole,base.ik.rightKneePole),
      pelvisRotation:triple(ik.pelvisRotation,base.ik.pelvisRotation),spineRotation:triple(ik.spineRotation,base.ik.spineRotation),chestRotation:triple(ik.chestRotation,base.ik.chestRotation),leftShoulderRotation:triple(ik.leftShoulderRotation,base.ik.leftShoulderRotation),rightShoulderRotation:triple(ik.rightShoulderRotation,base.ik.rightShoulderRotation),
      leftHandRotation:triple(ik.leftHandRotation,base.ik.leftHandRotation),rightHandRotation:triple(ik.rightHandRotation,base.ik.rightHandRotation),leftFootRotation:triple(ik.leftFootRotation,base.ik.leftFootRotation),rightFootRotation:triple(ik.rightFootRotation,base.ik.rightFootRotation),leftToeRotation:triple(ik.leftToeRotation,base.ik.leftToeRotation),rightToeRotation:triple(ik.rightToeRotation,base.ik.rightToeRotation),
      fingers:{left:fingers(ik.fingers&&ik.fingers.left),right:fingers(ik.fingers&&ik.fingers.right)},
    }};
}
function completeSeatProfile(value){
  const ik=value&&value.ik,triples=['position','rotation'],targets=['pelvis','spine','chest','leftShoulder','rightShoulder','head','leftHand','rightHand','leftFoot','rightFoot','leftToe','rightToe','leftElbowPole','rightElbowPole','leftKneePole','rightKneePole','pelvisRotation','spineRotation','chestRotation','leftShoulderRotation','rightShoulderRotation','leftHandRotation','rightHandRotation','leftFootRotation','rightFootRotation','leftToeRotation','rightToeRotation'];
  return !!(value&&finite(value.schemaVersion,0)>=SCHEMA_VERSION&&triples.every(name=>Array.isArray(value[name])&&value[name].length>=3)&&ik&&targets.every(name=>Array.isArray(ik[name])&&ik[name].length>=3)&&ik.fingers&&ik.fingers.left&&ik.fingers.right);
}
function seatProfile(character,vehicle,seat,create){
  if(!character||!vehicle)return null;
  const settings=character.config.vehicleSeating=character.config.vehicleSeating&&typeof character.config.vehicleSeating==='object'?character.config.vehicleSeating:{};
  if(settings.enabled===false)return null;
  const profiles=settings.profiles=settings.profiles&&typeof settings.profiles==='object'?settings.profiles:{};
  const keys=vehicleProfileKeys(vehicle),vehicleAliases=vehicleAssetIdentities(vehicle),found=keys.find(key=>profiles[key])||Object.keys(profiles).find(key=>{
    const profile=profiles[key],aliases=assetIdentities(profile&&profile.asset);
    return key.indexOf('asset:')===0&&aliases.some(value=>vehicleAliases.indexOf(value)>=0);
  });
  // Exact assets override only when explicitly authored. Otherwise hydrate the
  // family default, so merely driving one imported car cannot silently create an
  // exact record that masks later family tuning in Pawn Studio.
  const promotedExact=!found&&highPolyCarV3ProfileKey(vehicleAliases),key=found||promotedExact||keys.find(value=>value.indexOf('family:')===0)||'default',source=found?profiles[found]:null,normalized=completeSeatProfile(source)?source:normalizeSeatProfile(source,key,!!(seat&&seat.synthetic));
  // Runtime reads this every frame. Hydrate a sparse/legacy record once and then
  // retain the same arrays instead of allocating a full IK descriptor at 60 Hz.
  if(found&&!completeSeatProfile(source))profiles[key]=normalized;
  if(create===true&&!profiles[key])profiles[key]=normalized;
  normalized.key=key;return normalized;
}
function worldQuaternion(object){
  const THREE=root.THREE;
  if(THREE&&object&&object.getWorldQuaternion)return object.getWorldQuaternion(new THREE.Quaternion());
  return THREE?new THREE.Quaternion():null;
}
function setWorldTransform(object,position,quaternion){
  const THREE=root.THREE;if(!object||!THREE)return false;
  if(object.parent&&object.parent.worldToLocal){object.position.copy(object.parent.worldToLocal(position.clone()));const parentQ=object.parent.getWorldQuaternion(new THREE.Quaternion()).invert();object.quaternion.copy(parentQ.multiply(quaternion));}
  else {object.position.copy(position);object.quaternion.copy(quaternion);}
  object.updateMatrixWorld&&object.updateMatrixWorld(true);return true;
}
function localWorld(anchor,value){
  const THREE=root.THREE,position=worldPosition(anchor),quaternion=worldQuaternion(anchor),result=new THREE.Vector3().fromArray(value||[0,0,0]);
  result.applyQuaternion(quaternion);result.add(position);return result;
}
function vehicleAssetRoot(vehicle){
  if(!vehicle)return null;
  if(typeof vehicle.assetRoot==='function')try{const result=vehicle.assetRoot();if(result)return result;}catch(error){}
  if(vehicle.assetRoot&&typeof vehicle.assetRoot==='object')return vehicle.assetRoot;
  if(vehicle.id==='native-player-car'&&root.LOT_KING&&root.LOT_KING.player&&typeof root.LOT_KING.player.getModel==='function'){
    const model=root.LOT_KING.player.getModel();if(model)return model;
  }
  const owner=vehicle.owner;let found=null;
  if(owner&&owner.traverse)owner.traverse(node=>{
    if(found||!node||!node.userData||!node.userData.logicElementAssetVisual)return;
    if(!(node.parent&&node.parent.userData&&node.parent.userData.logicElementAssetVisual))found=node;
  });
  return found||owner||null;
}
function seatAnchor(vehicle,seat){
  if(seat&&seat.node&&seat.synthetic!==true)return seat.node;
  return vehicleAssetRoot(vehicle)||(seat&&seat.node)||(vehicle&&vehicle.owner)||null;
}
function syncSeatOccupant(character,vehicle,seat){
  if(!character||!vehicle||!seat||!character.owner||!root.THREE)return false;
  const profile=seatProfile(character,vehicle,seat,true),anchor=seatAnchor(vehicle,seat);if(!profile||!anchor)return false;
  const position=localWorld(anchor,profile.position),quaternion=worldQuaternion(anchor),euler=new root.THREE.Euler(profile.rotation[0]*Math.PI/180,profile.rotation[1]*Math.PI/180,profile.rotation[2]*Math.PI/180,'XYZ');
  quaternion.multiply(new root.THREE.Quaternion().setFromEuler(euler)).normalize();setWorldTransform(character.owner,position,quaternion);
  character.owner.visible=profile.visible!==false;character.state.seated=true;character.state.vehicleSeatProfile=profile.key;
  character.activeVehicleSeatProfile=profile;return true;
}
function applySeatPose(character,vehicle,seat){
  const THREE=root.THREE,runtime=root.LK_RUNTIME_CHARACTER_WEAPON_POSE,profile=character&&character.activeVehicleSeatProfile||seatProfile(character,vehicle,seat,false),anchor=seatAnchor(vehicle,seat),model=character&&(character.locomotionNode||character.owner);
  if(!THREE||!runtime||!runtime.applySeated||!profile||!profile.ik.enabled||!anchor||!model)return false;
  const world=name=>{const value=localWorld(anchor,profile.ik[name]);return {x:value.x,y:value.y,z:value.z};};
  const rad=value=>triple(value,[0,0,0]).map(number=>number*Math.PI/180);
  return runtime.applySeated(THREE,model,{pelvis:world('pelvis'),spine:world('spine'),chest:world('chest'),leftShoulder:world('leftShoulder'),rightShoulder:world('rightShoulder'),head:world('head'),leftHand:world('leftHand'),rightHand:world('rightHand'),leftFoot:world('leftFoot'),rightFoot:world('rightFoot'),leftToe:world('leftToe'),rightToe:world('rightToe'),leftElbowPole:world('leftElbowPole'),rightElbowPole:world('rightElbowPole'),leftKneePole:world('leftKneePole'),rightKneePole:world('rightKneePole'),pelvisRotation:rad(profile.ik.pelvisRotation),spineRotation:rad(profile.ik.spineRotation),chestRotation:rad(profile.ik.chestRotation),leftShoulderRotation:rad(profile.ik.leftShoulderRotation),rightShoulderRotation:rad(profile.ik.rightShoulderRotation),leftHandRotation:rad(profile.ik.leftHandRotation),rightHandRotation:rad(profile.ik.rightHandRotation),leftFootRotation:rad(profile.ik.leftFootRotation),rightFootRotation:rad(profile.ik.rightFootRotation),leftToeRotation:rad(profile.ik.leftToeRotation),rightToeRotation:rad(profile.ik.rightToeRotation),fingers:profile.ik.fingers,handWeight:profile.ik.weight,footWeight:profile.ik.weight,headWeight:profile.ik.headWeight,torsoWeight:profile.ik.torsoWeight,shoulderWeight:profile.ik.shoulderWeight,toeWeight:profile.ik.toeWeight},profile.ik.weight);
}
function releaseSeatOccupant(character){
  if(!character)return false;const runtime=root.LK_RUNTIME_CHARACTER_WEAPON_POSE,model=character.locomotionNode||character.owner;
  if(runtime&&runtime.release)runtime.release(model);if(character.state){character.state.seated=false;character.state.vehicleSeatProfile=null;character.state.weaponStance=null;character.state.weaponStanceClip=null;}
  character.activeVehicleSeatProfile=null;return true;
}
function prewarmCharacter(character,vehicles,options){
  const maximum=Math.max(1,finite(options&&options.maximumProfiles,12)),list=Array.isArray(vehicles)?vehicles:[],seen=new Set(),targets=[];
  list.forEach(vehicle=>{
    if(targets.length>=maximum||!vehicle||vehicle===character||!isEnterable(vehicle))return;
    const seat=(availableSeats(vehicle,'driver',character)||[])[0];if(!seat)return;
    const key=vehicleProfileKeys(vehicle).join('|');if(seen.has(key))return;seen.add(key);targets.push({vehicle,seat});
  });
  const model=character&&(character.locomotionNode||character.owner),bones=[],state=character&&character.state||{},stateKeys=['seated','vehicleSeatProfile','weaponStance','weaponStanceClip'],stateBefore={};
  stateKeys.forEach(key=>stateBefore[key]={owned:Object.prototype.hasOwnProperty.call(state,key),value:state[key]});
  const activeProfileBefore=character&&character.activeVehicleSeatProfile;
  if(model&&model.traverse)model.traverse(bone=>{if(bone&&bone.isBone)bones.push({bone,position:bone.position.clone(),quaternion:bone.quaternion.clone(),scale:bone.scale.clone()});});
  let profiles=0,poses=0;
  try{
    if(character)character.activeVehicleSeatProfile=null;
    targets.forEach(target=>{if(seatProfile(character,target.vehicle,target.seat,false))profiles++;if(bones.length&&applySeatPose(character,target.vehicle,target.seat))poses++;releaseSeatOccupant(character);});
  }finally{
    bones.forEach(entry=>{entry.bone.position.copy(entry.position);entry.bone.quaternion.copy(entry.quaternion);entry.bone.scale.copy(entry.scale);});
    if(model&&model.updateMatrixWorld)model.updateMatrixWorld(true);
    releaseSeatOccupant(character);
    stateKeys.forEach(key=>{const saved=stateBefore[key];if(saved.owned)state[key]=saved.value;else delete state[key];});
    if(character)character.activeVehicleSeatProfile=activeProfileBefore||null;
  }
  return {profiles,poses};
}
function collisionFootprint(pawn){
  const provider=providerFor(pawn),collision=pawn&&pawn.config&&pawn.config.collision||{};
  let extents=null;
  if(provider&&provider.collisionHalfExtents)try{extents=provider.collisionHalfExtents(pawn);}catch(err){}
  const radius=collisionRadius(pawn);
  return {
    center:worldPosition(pawn&&pawn.owner),heading:worldHeading(pawn&&pawn.owner),
    hx:Math.max(.2,finite(extents&&extents.hx,finite(collision.hx,radius))),
    hz:Math.max(.2,finite(extents&&extents.hz,finite(collision.hz,radius))),
    hy:Math.max(.2,finite(extents&&extents.hy,finite(collision.hy,.75))),
  };
}
function nearestSeat(GAME, character, wantedRole, radius){
  const registry=GAME&&GAME.pawns,list=registry&&typeof registry.list==='function'?registry.list():[];
  const here=worldPosition(character&&character.owner),limit=Math.max(.5,finite(radius,finite(character&&character.config&&character.config.entry&&character.config.entry.radius,3)));
  let best=null,bestDistance=Infinity;
  list.forEach(vehicle=>{
    if(!vehicle||vehicle===character||!isEnterable(vehicle)||wantedRole==='driver'&&vehicle.driverPawn&&vehicle.driverPawn!==character)return;
    const seats=availableSeats(vehicle,wantedRole,character);
    seats.forEach(seat=>{
      const there=worldPosition(seat.node||vehicle.owner),dx=there.x-here.x,dy=there.y-here.y,dz=there.z-here.z,distance=dx*dx+dy*dy+dz*dz;
      const vehicleLimit=Math.max(limit,finite(vehicle.config&&vehicle.config.entry&&vehicle.config.entry.radius,limit));
      if(distance<=vehicleLimit*vehicleLimit&&distance<bestDistance){bestDistance=distance;best={vehicle,seat,distance};}
    });
  });
  return best;
}

/** A vehicle with no authored seat data still needs a driver's seat, or it is
 *  simply not boardable. This is what lets the native car and a Logic Vehicle
 *  Pawn take part without either of them declaring GLB seat metadata. */
function syntheticDriverSeat(pawn){
  if(!pawn.__lkSyntheticSeats){
    pawn.__lkSyntheticSeats = [{
      id:'synthetic-driver', name:'synthetic-driver', type:'driver',
      node:pawn.owner || null, connectedNames:[], connected:[], entryPoints:[],
      occupiedBy:null, reservedBy:null, door:null, synthetic:true,
    }];
  }
  // The owner object can be rebuilt between Play sessions; keep the seat's
  // anchor pointing at the current one rather than a disposed Object3D.
  if(pawn.owner) pawn.__lkSyntheticSeats[0].node = pawn.owner;
  return pawn.__lkSyntheticSeats;
}

/** Entry and exit normally share the same Use button. Possession can move from
 *  the Character to the Vehicle while that button is still physically down;
 *  without a release gate the Vehicle sees the tail of the entry press as an
 *  exit press as soon as its cooldown expires. Every vehicle family consumes
 *  the edge through this one contract so native, Logic and Sketchbook Pawns
 *  cannot drift apart again. */
function requireExitInputRelease(pawn){
  if(!pawn)return false;
  pawn.occupancyNeedsRelease=true;
  pawn.occupancyInteractDown=true;
  return true;
}
function consumeExitInput(pawn,down){
  if(!pawn)return false;
  down=down===true;
  if(pawn.occupancyNeedsRelease===true){
    pawn.occupancyInteractDown=down;
    if(!down)pawn.occupancyNeedsRelease=false;
    return false;
  }
  const pressed=down&&pawn.occupancyInteractDown!==true;
  pawn.occupancyInteractDown=down;
  return pressed;
}

// ---- built-in providers ----------------------------------------------------

// Sketchbook vehicles carry real seat metadata in their GLB.
registerProvider({
  id:'sketchbook', priority:100,
  match:pawn => /^sketchbook-(?:car|airplane|helicopter)$/.test(text(pawn.pawnType)),
  seats(pawn){
    const parts = pawn.parts || {};
    const seats = Array.isArray(parts.seats) ? parts.seats : [];
    return seats.length ? seats : syntheticDriverSeat(pawn);
  },
  collisionRadius(pawn){
    const collision=pawn&&pawn.config&&pawn.config.collision||{};
    return Math.max(finite(collision.hx,.7),finite(collision.hz,1.15));
  },
  collisionHalfExtents(pawn){
    const collision=pawn&&pawn.config&&pawn.config.collision||{},kind=text(pawn&&pawn.type);
    return {hx:finite(collision.hx,kind==='car' ? .9 : 1.8),hy:finite(collision.hy,kind==='car' ? .55 : .8),hz:finite(collision.hz,kind==='car' ? 1.8 : 2.2)};
  },
  // Asset hydration is READINESS, not capability. The caller prepares the
  // vehicle and then re-checks `assetHydrationState`; gating it here would
  // reject a vehicle before it ever got the chance to prepare itself.
});

// The native player car and Logic Vehicle Pawns: no authored seats, but they
// are vehicles and must board with the same controls. Physics stays theirs.
registerProvider({
  id:'native-and-logic-vehicles', priority:10,
  match(pawn){
    // `ownVehicleInput()` deliberately normalizes this Pawn's input family to
    // `vehicle`; identity remains on id/kind. Checking only pawnType therefore
    // made the real native adapter fail while an unrealistic test double passed.
    if(pawn.id === 'native-player-car' || pawn.kind === 'native-adapter') return true;
    // A Logic Element Pawn counts as a vehicle when it actually drives.
    return pawn.kind === 'logic-element' && !!(pawn.config && (pawn.config.wheels || pawn.config.driveSetup || pawn.config.tuning && pawn.config.tuning.maxSpeed != null));
  },
  seats:syntheticDriverSeat,
  collisionRadius(pawn){
    const collision=pawn&&pawn.config&&pawn.config.collision||{};
    return Math.max(finite(collision.hx,.85),finite(collision.hz,1.35));
  },
  collisionHalfExtents(pawn){
    const collision=pawn&&pawn.config&&pawn.config.collision||{};
    return {hx:finite(collision.hx,.92),hy:finite(collision.hy,.42),hz:finite(collision.hz,1.85)};
  },
});

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.vehicleOccupancy && GAME.systems.vehicleOccupancy.SCHEMA_VERSION === SCHEMA_VERSION) return GAME.systems.vehicleOccupancy;
  GAME.systems.vehicleOccupancy = api;
  return api;
}

const api = Object.freeze({
  SCHEMA_VERSION, ROLES,
  registerProvider, providerFor, seatsOf, isEnterable, isFree, availableSeats,
  syntheticDriverSeat, collisionRadius, collisionFootprint, nearestSeat, worldPosition, worldHeading,
  isCollidable,
  assetIdentity,assetIdentities,vehicleAssetIdentities,familyProfileKey,vehicleProfileKeys,vehicleAssetRoot,seatAnchor,defaultSeatProfile,defaultCharacterVehicleSeating,normalizeSeatProfile,seatProfile,syncSeatOccupant,applySeatPose,releaseSeatOccupant,prewarmCharacter,
  requireExitInputRelease, consumeExitInput, install,
  providers:() => providers.map(entry => entry.id),
});

root.LK_RUNTIME_VEHICLE_OCCUPANCY = api;
if(typeof module !== 'undefined' && module.exports) module.exports = api;
if(root.LOT_KING) install(root.LOT_KING);
})();
