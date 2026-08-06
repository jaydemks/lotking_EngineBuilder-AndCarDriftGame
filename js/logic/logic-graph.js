/* =========================================================
   LOT KING - Logic Element graph helpers
   Pure JSON graph model shared by editor, store and runtime.
   ========================================================= */
(function(){
'use strict';

const VERSION = 1;
const DEFINITION_VERSION = 1;
const VEHICLE_PAWN_VERSION = 2;
const ACTOR_BEHAVIOR_VERSION = 2;
const FIRST_PERSON_VIEW_PAWN_VERSION = 1;
const UNIFIED_BODY_CAMERA_VERSION = 1;
const FIRST_PERSON_HEAD_CAMERA_VERSION = 3;
const PAWN_CAMERA_RIG_VERSION = 1;
const TRAVERSAL_SURFACE_ADAPTATION_VERSION = 1;
const CHARACTER_MOVEMENT_TUNING_VERSION = 1;
const CHARACTER_CROUCH_SPEED_VERSION = 2;
const WALL_FLIP_BEHAVIOR_VERSION = 1;

function clone(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function node(id, type, x, y, data){
  return {id, type, x:x || 0, y:y || 0, data:Object.assign({}, data || {})};
}

function edge(id, fromNode, fromPin, toNode, toPin){
  return {id, from:{node:fromNode, pin:fromPin}, to:{node:toNode, pin:toPin}};
}

function normalizeNodes(nodes){
  return (Array.isArray(nodes) ? nodes : []).filter(Boolean).map((n, i) => ({
    id:String(n.id || ('node_' + i)),
    type:String(n.type || ''),
    x:Number(n.x) || 0,
    y:Number(n.y) || 0,
    data:Object.assign({}, n.data || {}),
  }));
}

function normalizeEdges(edges){
  return (Array.isArray(edges) ? edges : []).filter(e => e && e.from && e.to).map((e, i) => ({
    id:String(e.id || ('edge_' + i)),
    from:{node:String(e.from.node || ''), pin:String(e.from.pin || '')},
    to:{node:String(e.to.node || ''), pin:String(e.to.pin || '')},
  }));
}

function normalizeVariables(variables){
  return (Array.isArray(variables) ? variables : []).filter(Boolean).map(v => Object.assign({}, v, {
    name:String(v.name || ''),
    type:String(v.type || 'any'),
    value:clone(v.value),
    exposed:v.exposed === true,
  })).filter(v => v.name);
}

function migrateTemplateCameraDefault(graph){
  const pawns = [graph.characterPawn, graph.animalPawn, graph.soccerPawn, graph.vehiclePawn].filter(Boolean);
  const sketchbookPawn = graph.sketchbookPawn;
  if(sketchbookPawn && (sketchbookPawn.kind === 'advanced-character' || sketchbookPawn.type === 'advanced-character')) pawns.push(sketchbookPawn);
  pawns.forEach(pawn => {
    if(pawn.template !== true || Number(pawn.cameraDefaultVersion) >= 1) return;
    const variable = graph.variables.find(item => item && item.name === 'CameraMode' && item.binding === 'camera.mode');
    const storedMode = pawn.camera && String(pawn.camera.mode || '');
    // r0.7.1 originally authored every built-in pawn as Arcade even though
    // Play advertises Free as its initial camera. Only migrate that exact old
    // template default; explicit Cinematic/Free/custom configurations survive.
    if(storedMode === 'arcade' && (!variable || String(variable.value || '') === 'arcade')){
      pawn.camera = Object.assign({}, pawn.camera, {mode:'free'});
      if(variable) variable.value = 'free';
    }
    pawn.cameraDefaultVersion = 1;
  });
}

function migrateVehicleInteriorCamera(graph){
  const pawn = graph && graph.vehiclePawn;
  if(!pawn) return;
  const camera = pawn.camera || (pawn.camera = {});
  const version = Number(camera.interiorCameraVersion) || 0;
  if(version >= 3) return;
  const close = (value, expected) => value == null || Math.abs(Number(value) - expected) < .0001;
  const rotation = Array.isArray(camera.interiorRotation) ? camera.interiorRotation : null;
  const authoredRotation = rotation && rotation.some(value => Math.abs(Number(value) || 0) > .0001);
  const legacyCentered = !authoredRotation &&
    close(camera.interiorHeight, 1.15) &&
    close(camera.interiorForward, .28) &&
    close(camera.interiorLateral, 0) &&
    close(camera.interiorLookHeight, .04) &&
    close(camera.interiorFov, 72) &&
    close(camera.interiorLag, 18);
  if(version < 2 && legacyCentered) camera.interiorLateral = -.42;
  if(version < 3){
    if(camera.interiorGForceMotion == null || close(camera.interiorGForceMotion, .18)) camera.interiorGForceMotion = 0;
    if(camera.interiorAccelerationMotion == null) camera.interiorAccelerationMotion = 0;
    if(camera.interiorRoadShake == null || close(camera.interiorRoadShake, .08)) camera.interiorRoadShake = 0;
  }
  const defaults = {
    interiorHeight:1.15, interiorForward:.28, interiorLateral:-.42,
    interiorLookHeight:.04, interiorFov:72, interiorLag:18,
    interiorGForceMotion:0, interiorAccelerationMotion:0,
    interiorRoadShake:0, interiorMotionLimit:.035,
    interiorSpeedFovGain:.025, interiorSpeedFovMax:4.5,
  };
  Object.keys(defaults).forEach(key => {
    if(camera[key] == null) camera[key] = defaults[key];
  });
  camera.interiorCameraVersion = 3;
}

/* A pawn stores its own copy of `animationSet`, so correcting the shipped template
   reaches new characters only - a level saved before the fix keeps the mirrored
   vectors and strafes the wrong way for ever.

   The repair rule is self-consistency rather than a blind flip: the entry's id
   NAMES its side, so make the vector agree with the name. In the character's own
   frame - forward +Z - the body's LEFT is +X, measured at both ends of the chain:
   the bundled `left strafe` clip displaces the hips by dx = +179 cm
   (scripts/measure-clip-direction.mjs), and pressing A/Left arrives at the selector
   as x = +1. Z is never touched, so a forward or backward component survives, and
   diagonals are repaired on their lateral half only.

   This also repairs a hand-made set that named its sides while the old table was
   still in place, which a blanket negation could not do. */
const LATERAL_SIDE_ID = /(?:^|[-_])(left|right)$/;
function migrateLocomotionSides(graph){
  const pawns = [graph.characterPawn, graph.soccerPawn, graph.animalPawn, graph.sketchbookPawn].filter(Boolean);
  let repaired = 0;
  pawns.forEach(pawn => {
    if(Number(pawn.locomotionSideVersion) >= 1) return;
    // The set is authored as an array, but a normalised pawn may carry {entries}.
    const set = pawn.animationSet;
    const entries = Array.isArray(set) ? set : (set && Array.isArray(set.entries) ? set.entries : null);
    (entries || []).forEach(entry => {
      const side = LATERAL_SIDE_ID.exec(String(entry && entry.id || ''));
      if(!side || !Array.isArray(entry.direction)) return;
      const x = Number(entry.direction[0]) || 0;
      if(Math.abs(x) < .0001) return;
      if((x > 0) === (side[1] === 'left')) return;
      entry.direction[0] = -x;
      repaired++;
    });
    pawn.locomotionSideVersion = 1;
  });
  return repaired;
}

/* Separate the optional classic arms rig from the Character data without
   invalidating old saves. Flat presentation fields are deliberately retained
   as compatibility mirrors: old graph bindings can still write them, while the
   runtime adapter immediately forwards those writes into this versioned block. */
function migrateFirstPersonViewPawn(graph){
  const pawns=[graph.characterPawn,graph.sketchbookPawn].filter(pawn=>pawn&&typeof pawn==='object');
  let migrated=0;
  pawns.forEach(pawn=>{
    const rig=pawn.firstPerson;
    if(!rig||typeof rig!=='object')return;
    if(rig.viewPawn&&Number(rig.viewPawn.schemaVersion)>=FIRST_PERSON_VIEW_PAWN_VERSION)return;
    const oldVersion=Number(rig.presentationVersion)||0;
    const oldThirdPersonDefault=oldVersion<2&&rig.view==='third'&&rig.presentation==='arms';
    const arms=!oldThirdPersonDefault&&(rig.presentation==='arms'||
      (rig.presentation!=='body'&&rig.hideOwnBody===true));
    rig.viewPawn={
      schemaVersion:FIRST_PERSON_VIEW_PAWN_VERSION,
      kind:arms?'first-person-arms':'none',
      enabled:arms,
      showLegs:rig.showLegs===true,
    };
    migrated++;
  });
  return migrated;
}

/* Move the old engine FPS default and every third-person convertible Character
   onto the unified body camera. A dedicated first-person-only Pawn may still
   explicitly choose the classic arms visual; a TPS Pawn never needs it. */
function migrateUnifiedFirstPersonBody(graph){
  const pawn=graph&&graph.characterPawn,rig=pawn&&pawn.firstPerson;
  if(!pawn||!rig||typeof rig!=='object')return 0;
  // A graph can have received the version stamp while it was in third person
  // and later have been saved in eye view with the old arms choice restored by
  // a bound Inspector variable. Repair that inconsistent state as well: keeping
  // the dormant second rig in the graph makes the editor allocate and update it
  // again on the next Play, which is the large first-person frame-time spike.
  const viewPawn=rig.viewPawn&&typeof rig.viewPawn==='object'?rig.viewPawn:null;
  const stampedConvertible=rig.unifiedBodyCamera===true&&rig.allowViewToggle!==false;
  const staleConvertibleArms=stampedConvertible&&(
    rig.presentation==='arms'||rig.hideOwnBody===true||
    (viewPawn&&(viewPawn.enabled===true||String(viewPawn.kind||'')==='first-person-arms'))
  );
  if(Number(rig.unifiedBodyCameraVersion)>=UNIFIED_BODY_CAMERA_VERSION&&!staleConvertibleArms)return 0;
  const engineDefault=String(pawn.id||'')==='player-character-first-person'||Number(pawn.firstPersonPresentationVersion)===1;
  const convertibleBody=rig.allowViewToggle!==false&&(rig.view==='third'||rig.unifiedBodyCamera===true);
  if(!engineDefault&&!convertibleBody)return 0;
  rig.viewPawn={schemaVersion:FIRST_PERSON_VIEW_PAWN_VERSION,kind:'none',enabled:false,showLegs:false};
  rig.presentation='body';
  rig.hideOwnBody=false;
  rig.showLegs=false;
  rig.unifiedBodyCamera=true;
  rig.unifiedBodyCameraVersion=UNIFIED_BODY_CAMERA_VERSION;
  delete pawn.firstPersonPresentationVersion;
  const variables=Array.isArray(graph.variables)?graph.variables:[];
  variables.forEach(variable=>{
    const binding=String(variable&&variable.binding||'');
    if(binding==='firstPerson.viewPawn.kind')variable.value='none';
    if(binding==='firstPerson.presentation')variable.value='body';
    if(binding==='firstPerson.hideOwnBody'||binding==='firstPerson.showLegs')variable.value=false;
  });
  return 1;
}

/* Saved Character graphs predate the head-derived eye camera. Runtime defaults
   already make those Pawns safe, but without a graph migration the author cannot
   see or tune the new controls in the Inspector. Add each control once and copy
   the Pawn's effective value into it; an existing variable or authored rig value
   always wins. */
function migrateFirstPersonHeadCamera(graph){
  const pawns=[graph&&graph.characterPawn,graph&&graph.sketchbookPawn]
    .filter(pawn=>pawn&&pawn.firstPerson&&typeof pawn.firstPerson==='object');
  if(!pawns.length)return 0;
  const variables=Array.isArray(graph.variables)?graph.variables:(graph.variables=[]);
  let migrated=0;
  pawns.forEach(pawn=>{
    const rig=pawn.firstPerson;
    if(Number(rig.headCameraVersion)>=FIRST_PERSON_HEAD_CAMERA_VERSION)return;
    if(rig.autoEyeHeight==null)rig.autoEyeHeight=true;
    if(rig.eyeBoneOffset==null)rig.eyeBoneOffset=.08;
    // v1 exposed a zero-to-.4 slider with .12 as the default. Values below the
    // safe clearance leave the camera inside a monolithic face and can turn its
    // material into a full-screen overdraw pass. v2 repairs that obsolete range;
    // larger authored offsets remain untouched.
    // v3 advances the untouched .22 full-body default beyond hair/face shells.
    // Other authored values remain untouched and Pawn Studio marks subsequent
    // edits with its own camera-safety version.
    if(!Number.isFinite(Number(rig.bodyEyeForward))||Number(rig.bodyEyeForward)<.18||Math.abs(Number(rig.bodyEyeForward)-.22)<.0001)rig.bodyEyeForward=.28;
    if(!Number.isFinite(Number(rig.bodyEyeSide)))rig.bodyEyeSide=0;
    const specs=[
      {name:'AutoEyeHeight',type:'boolean',value:rig.autoEyeHeight!==false,exposed:true,
        binding:'firstPerson.autoEyeHeight',label:'Use Main Mesh Head Height',category:'First Person / View',
        description:'Places the camera from the real Head bone of the Character. Disable it to use Eye Height manually.'},
      {name:'EyeBoneOffset',type:'number',value:Number.isFinite(Number(rig.eyeBoneOffset))?Number(rig.eyeBoneOffset):.08,
        min:-.3,max:.5,step:.01,exposed:true,binding:'firstPerson.eyeBoneOffset',
        label:'Head Bone → Eyes Offset (m)',category:'First Person / View',
        description:'Vertical distance from the rig Head bone pivot to the eyes.'},
      {name:'BodyEyeForward',type:'number',value:rig.bodyEyeForward,min:.18,max:.6,step:.01,exposed:true,
        binding:'firstPerson.bodyEyeForward',label:'Full-Body Eye Forward (m)',category:'First Person / View',
        description:'Camera-only clearance beyond the face. It never scales or hides the shared Character skeleton.'},
      {name:'BodyEyeSide',type:'number',value:rig.bodyEyeSide,min:-.5,max:.5,step:.01,exposed:true,
        binding:'firstPerson.bodyEyeSide',label:'Full-Body Eye Side Offset (m)',category:'First Person / View',
        description:'Lateral camera-only offset authored by the First Person camera dummy.'},
    ];
    specs.forEach(spec=>{
      const existing=variables.find(variable=>variable&&variable.binding===spec.binding);
      if(!existing)variables.push(spec);
      else if(spec.binding==='firstPerson.bodyEyeForward'){
        existing.min=.18;existing.max=.6;
        if(Number(existing.value)<.18||Math.abs(Number(existing.value)-.22)<.0001)existing.value=.28;
      }
    });
    rig.headCameraVersion=FIRST_PERSON_HEAD_CAMERA_VERSION;
    migrated++;
  });
  return migrated;
}

/* Camera mounts are authored spatially, but consumed as compact Pawn config at
   runtime. Keep both representations tied together instead of making every
   Character/vehicle adapter invent its own offsets. Camera elements are
   editor-only helpers: they never contribute collision, bounds or exported
   runtime geometry. */
const CHARACTER_CAMERA_IDS=Object.freeze({first:'character_camera_first',third:'character_camera_third'});
const VEHICLE_CAMERA_IDS=Object.freeze({external:'camera_anchor',interior:'camera_interior'});
function finiteCamera(value,fallback){const number=Number(value);return Number.isFinite(number)?number:fallback;}
function cameraElement(id,name,role,position,color){return {id,name,type:'camera',parentId:'root',linked:true,dummyVisible:true,runtimeVisual:false,editorOnly:true,contributesToBounds:false,cameraRigRole:role,position:position.slice(),rotation:[0,180,0],scale:[1,1,1],color};}
function cameraElements(graph){const scene=graph&&graph.logicScene;if(!scene)return [];if(!Array.isArray(scene.elements))scene.elements=[];return scene.elements;}
function cameraByRole(graph,role){return cameraElements(graph).find(item=>item&&item.cameraRigRole===role)||null;}
function mirrorVariable(graph,binding,value){const variable=(graph.variables||[]).find(item=>item&&item.binding===binding);if(variable)variable.value=clone(value);}
function radiansToDegrees(values){return (Array.isArray(values)?values:[0,Math.PI,0]).map(value=>finiteCamera(value,0)*180/Math.PI);}
function degreesToRadians(values){return (Array.isArray(values)?values:[0,180,0]).map(value=>finiteCamera(value,0)*Math.PI/180);}
function characterMountToElementRotation(values){const out=(Array.isArray(values)?values:[0,0,0]).map(value=>finiteCamera(value,0)*180/Math.PI);out[1]+=180;return out;}
function elementRotationToCharacterMount(values){const out=(Array.isArray(values)?values:[0,180,0]).map(value=>finiteCamera(value,0)*Math.PI/180);out[1]-=Math.PI;return out;}
function markCameraElement(element,role,name,color){Object.assign(element,{type:'camera',parentId:element.parentId||'root',linked:true,dummyVisible:true,runtimeVisual:false,editorOnly:true,contributesToBounds:false,cameraRigRole:role,color:element.color||color});if(!element.name)element.name=name;if(!Array.isArray(element.scale))element.scale=[1,1,1];if(!Array.isArray(element.rotation))element.rotation=[0,180,0];return element;}
function pawnCameraKind(graph){
  const character=graph&&(graph.characterPawn||graph.soccerPawn);
  if(character&&character.firstPerson&&typeof character.firstPerson==='object'&&(character.possessed===true||Number(character.playerId)>=1))return {kind:'character',pawn:character};
  const sketchbook=graph&&graph.sketchbookPawn;
  if(sketchbook&&String(sketchbook.kind||sketchbook.type||'')==='advanced-character')return null;
  const vehicle=graph&&(graph.vehiclePawn||sketchbook);
  return vehicle?{kind:'vehicle',pawn:vehicle}:null;
}
function syncPawnCameraElementsFromConfig(graph){
  const resolved=pawnCameraKind(graph);if(!resolved)return false;
  if(resolved.kind==='character'){
    const fp=resolved.pawn.firstPerson,tp=fp.thirdPerson||(fp.thirdPerson={}),first=cameraByRole(graph,'character-first'),third=cameraByRole(graph,'character-third');
    if(first){first.position=[finiteCamera(fp.bodyEyeSide,0),finiteCamera(fp.eyeHeight,1.62),Math.max(.18,finiteCamera(fp.bodyEyeForward,.28))];first.rotation=characterMountToElementRotation(fp.cameraRotation);}
    if(third){const pivot=finiteCamera(tp.pivotForward,.18);third.position=[finiteCamera(tp.shoulder,.62),finiteCamera(tp.height,1.5),pivot-Math.max(.4,finiteCamera(tp.distance,3.3))];third.rotation=characterMountToElementRotation(tp.cameraRotation);}
    return !!(first&&third);
  }
  const camera=resolved.pawn.camera||(resolved.pawn.camera={}),external=cameraByRole(graph,'vehicle-external'),interior=cameraByRole(graph,'vehicle-interior');
  if(external){external.position=[finiteCamera(camera.lateralOffset,0),finiteCamera(camera.arcadeHeight,finiteCamera(camera.height,3.1)),-Math.max(.2,finiteCamera(camera.arcadeDistance,finiteCamera(camera.distance,9)))];external.rotation=radiansToDegrees(camera.externalRotation);}
  if(interior){interior.position=[finiteCamera(camera.interiorLateral,-.42),finiteCamera(camera.interiorHeight,1.15),finiteCamera(camera.interiorForward,.28)];interior.rotation=radiansToDegrees(camera.interiorRotation);}
  return !!(external&&interior);
}
function syncPawnCameraConfigFromElement(graph,id){
  const resolved=pawnCameraKind(graph),element=cameraElements(graph).find(item=>item&&item.id===id);if(!resolved||!element||!element.cameraRigRole)return false;
  const p=Array.isArray(element.position)?element.position:[0,0,0],rotation=degreesToRadians(element.rotation),characterRotation=elementRotationToCharacterMount(element.rotation);
  if(resolved.kind==='character'){
    const fp=resolved.pawn.firstPerson,tp=fp.thirdPerson||(fp.thirdPerson={});
    if(element.cameraRigRole==='character-first'){
      fp.bodyEyeSide=finiteCamera(p[0],0);fp.eyeHeight=Math.max(.2,finiteCamera(p[1],1.62));fp.autoEyeHeight=false;fp.bodyEyeForward=Math.max(.18,finiteCamera(p[2],.28));fp.cameraRotation=characterRotation;
      mirrorVariable(graph,'firstPerson.bodyEyeSide',fp.bodyEyeSide);mirrorVariable(graph,'firstPerson.eyeHeight',fp.eyeHeight);mirrorVariable(graph,'firstPerson.autoEyeHeight',false);mirrorVariable(graph,'firstPerson.bodyEyeForward',fp.bodyEyeForward);
    }else if(element.cameraRigRole==='character-third'){
      tp.shoulder=finiteCamera(p[0],.62);tp.height=Math.max(.1,finiteCamera(p[1],1.5));tp.distance=Math.max(.4,finiteCamera(tp.pivotForward,.18)-finiteCamera(p[2],-3.12));tp.cameraRotation=characterRotation;
      mirrorVariable(graph,'firstPerson.thirdPerson.shoulder',tp.shoulder);mirrorVariable(graph,'firstPerson.thirdPerson.height',tp.height);mirrorVariable(graph,'firstPerson.thirdPerson.distance',tp.distance);
    }else return false;
  }else{
    const camera=resolved.pawn.camera||(resolved.pawn.camera={});
    if(element.cameraRigRole==='vehicle-external'){
      camera.lateralOffset=finiteCamera(p[0],0);camera.arcadeHeight=Math.max(0,finiteCamera(p[1],3.1));camera.arcadeDistance=Math.max(.2,-finiteCamera(p[2],-9));camera.distance=camera.arcadeDistance;camera.height=camera.arcadeHeight;camera.externalRotation=rotation;
      mirrorVariable(graph,'camera.distance',camera.distance);mirrorVariable(graph,'camera.height',camera.height);
    }else if(element.cameraRigRole==='vehicle-interior'){
      camera.interiorLateral=finiteCamera(p[0],-.42);camera.interiorHeight=Math.max(.2,finiteCamera(p[1],1.15));camera.interiorForward=finiteCamera(p[2],.28);camera.interiorRotation=rotation;
    }else return false;
  }
  return true;
}
function ensurePawnCameraRigs(graph){
  const resolved=pawnCameraKind(graph);if(!resolved||!graph.logicScene)return 0;
  const elements=cameraElements(graph);let added=0;
  if(resolved.kind==='character'){
    // Remove only the obsolete pre-rig helper. It has no gameplay role and
    // keeping it beside the two versioned mounts creates a third, misleading
    // camera several metres away from old saved Characters.
    const legacyIndex=elements.findIndex(item=>item&&item.id==='camera_anchor'&&item.type==='camera'&&!item.cameraRigRole&&String(item.name||'')==='Player Camera Anchor');
    if(legacyIndex>=0){elements.splice(legacyIndex,1);if(Array.isArray(graph.logicScene.components))graph.logicScene.components=graph.logicScene.components.filter(item=>item&&item.elementId!=='camera_anchor');}
    const fp=resolved.pawn.firstPerson,tp=fp.thirdPerson||(fp.thirdPerson={});
    let first=cameraByRole(graph,'character-first'),third=cameraByRole(graph,'character-third');
    if(!first){first=cameraElement(CHARACTER_CAMERA_IDS.first,'First Person Camera','character-first',[finiteCamera(fp.bodyEyeSide,0),finiteCamera(fp.eyeHeight,1.62),Math.max(.18,finiteCamera(fp.bodyEyeForward,.28))],'#38bdf8');elements.push(first);added++;}
    if(!third){third=cameraElement(CHARACTER_CAMERA_IDS.third,'Third Person Camera','character-third',[finiteCamera(tp.shoulder,.62),finiteCamera(tp.height,1.5),finiteCamera(tp.pivotForward,.18)-Math.max(.4,finiteCamera(tp.distance,3.3))],'#fbbf24');elements.push(third);added++;}
    markCameraElement(first,'character-first','First Person Camera','#38bdf8');markCameraElement(third,'character-third','Third Person Camera','#fbbf24');
    if(Number(resolved.pawn.cameraRigVersion)<PAWN_CAMERA_RIG_VERSION){syncPawnCameraElementsFromConfig(graph);resolved.pawn.cameraRigVersion=PAWN_CAMERA_RIG_VERSION;}
  }else{
    const camera=resolved.pawn.camera||(resolved.pawn.camera={});
    // Older vehicle packs already shipped `camera_anchor` as a generic Empty.
    // Upgrade that same semantic node in place; adding another node with the
    // same id makes parenting and save/restore nondeterministic.
    let external=cameraByRole(graph,'vehicle-external')||elements.find(item=>item&&item.id===VEHICLE_CAMERA_IDS.external),interior=cameraByRole(graph,'vehicle-interior');
    if(!external){external=cameraElement(VEHICLE_CAMERA_IDS.external,'External Camera','vehicle-external',[0,finiteCamera(camera.height,3.1),-finiteCamera(camera.distance,9)],'#9db4ff');elements.push(external);added++;}
    if(!interior){interior=cameraElement(VEHICLE_CAMERA_IDS.interior,'Interior Camera','vehicle-interior',[finiteCamera(camera.interiorLateral,-.42),finiteCamera(camera.interiorHeight,1.15),finiteCamera(camera.interiorForward,.28)],'#a78bfa');elements.push(interior);added++;}
    markCameraElement(external,'vehicle-external','External Camera','#9db4ff');markCameraElement(interior,'vehicle-interior','Interior Camera','#a78bfa');
    if(Number(camera.rigVersion)<PAWN_CAMERA_RIG_VERSION){syncPawnCameraElementsFromConfig(graph);camera.rigVersion=PAWN_CAMERA_RIG_VERSION;}
  }
  return added;
}
function syncPawnCameraNode(node){
  if(!node||!node.userData||!node.userData.pawnCameraDummy)return false;let owner=node;while(owner&&!(owner.userData&&(owner.userData.logicGraph||owner.userData.addedEntry&&owner.userData.addedEntry.graph)))owner=owner.parent;if(!owner||!owner.userData)return false;
  const graph=owner.userData.logicGraph||owner.userData.addedEntry&&owner.userData.addedEntry.graph,id=node.userData.logicElementSceneId,element=cameraElements(graph).find(item=>item&&item.id===id);if(!graph||!element)return false;
  element.position=[node.position.x,node.position.y,node.position.z];element.rotation=[node.rotation.x*180/Math.PI,node.rotation.y*180/Math.PI,node.rotation.z*180/Math.PI];element.scale=[1,1,1];syncPawnCameraConfigFromElement(graph,id);
  if(owner.userData.addedEntry)owner.userData.addedEntry.graph=clone(graph);return true;
}

/* Saved Character graphs need the same contact-adaptation authoring surface as
   newly created templates. Runtime normalization already supplies safe defaults;
   this migration makes them visible and editable without overwriting a single
   authored value or duplicating an existing Inspector row. */
function migrateTraversalSurfaceAdaptation(graph){
  const pawns=[graph&&graph.characterPawn,graph&&graph.sketchbookPawn]
    .filter(pawn=>pawn&&pawn.abilities&&typeof pawn.abilities==='object');
  if(!pawns.length)return 0;
  const variables=Array.isArray(graph.variables)?graph.variables:(graph.variables=[]);
  let migrated=0;
  pawns.forEach(pawn=>{
    const abilities=pawn.abilities;
    if(Number(abilities.surfaceAdaptationVersion)>=TRAVERSAL_SURFACE_ADAPTATION_VERSION)return;
    const adaptation=abilities.surfaceAdaptation&&typeof abilities.surfaceAdaptation==='object'
      ?abilities.surfaceAdaptation:(abilities.surfaceAdaptation={});
    const defaults={enabled:true,ikWeight:.82,rootWarpWeight:1,handSpacing:.52,footSpacing:.34,
      surfaceOffset:.035,handHeightOffset:.025,footHeight:.42,handsStart:.04,handsEnd:.72,
      feetStart:.26,feetEnd:.94,debug:false};
    Object.keys(defaults).forEach(key=>{if(adaptation[key]==null)adaptation[key]=defaults[key];});
    const category='Traversal / Contact Adaptation',specs=[
      ['SurfaceAdaptation','boolean','enabled','Adapt Traversal To Surface'],
      ['TraversalIKWeight','number','ikWeight','Hand / Foot IK Weight',{min:0,max:1,step:.02}],
      ['TraversalRootWarp','number','rootWarpWeight','Root Motion Warp Weight',{min:0,max:1,step:.02}],
      ['TraversalHandSpacing','number','handSpacing','Hand Spacing (m)',{min:.1,max:1.4,step:.01}],
      ['TraversalFootSpacing','number','footSpacing','Foot Spacing (m)',{min:.08,max:1,step:.01}],
      ['TraversalSurfaceOffset','number','surfaceOffset','Contact Surface Offset (m)',{min:0,max:.25,step:.005}],
      ['TraversalHandsStart','number','handsStart','Hands Contact Phase Start',{min:0,max:1,step:.01}],
      ['TraversalHandsEnd','number','handsEnd','Hands Contact Phase End',{min:0,max:1,step:.01}],
      ['TraversalFeetStart','number','feetStart','Feet Contact Phase Start',{min:0,max:1,step:.01}],
      ['TraversalFeetEnd','number','feetEnd','Feet Contact Phase End',{min:0,max:1,step:.01}],
      ['TraversalDebug','boolean','debug','Show Probe + IK Dummies (Editor)',{description:'Editor / Play-in-Editor only; standalone and exported gameplay never create these helpers.'}],
    ];
    specs.forEach(row=>{
      const binding='abilities.surfaceAdaptation.'+row[2];
      if(variables.some(variable=>variable&&variable.binding===binding))return;
      variables.push(Object.assign({name:row[0],type:row[1],value:clone(adaptation[row[2]]),exposed:true,binding,label:row[3],category},row[4]||{}));
    });
    abilities.surfaceAdaptationVersion=TRAVERSAL_SURFACE_ADAPTATION_VERSION;migrated++;
  });
  return migrated;
}

/* The old shooter defaults compounded Run Speed with a hidden-looking 1.28/1.3
   multiplier, producing 7+ m/s even though the Inspector prominently showed
   only 5.4/5.9. Repair only those exact shipped pairs. Authored movement values
   remain untouched, while the variable labels now state which value is physical
   speed and which one is an optional multiplier. */
function migrateCharacterMovementTuning(graph){
  const pawn=graph&&graph.characterPawn;
  if(!pawn||Number(pawn.movementTuningVersion)>=CHARACTER_MOVEMENT_TUNING_VERSION)return 0;
  const movement=pawn.movement&&typeof pawn.movement==='object'?pawn.movement:(pawn.movement={});
  const oldRun=Number(movement.runSpeed),oldMultiplier=Number(movement.sprintMultiplier);
  if(Math.abs(oldRun-5.4)<.0001||Math.abs(oldRun-5.9)<.0001)movement.runSpeed=4.8;
  if(Math.abs(oldMultiplier-1.3)<.0001||Math.abs(oldMultiplier-1.28)<.0001)movement.sprintMultiplier=1;
  (Array.isArray(graph.variables)?graph.variables:[]).forEach(variable=>{
    if(!variable)return;
    if(variable.binding==='movement.runSpeed'){
      const value=Number(variable.value);if(Math.abs(value-5.4)<.0001||Math.abs(value-5.9)<.0001)variable.value=4.8;
      variable.label='Run Movement Speed (m/s)';
      variable.description='Physical top speed when Run is pressed. Animation playback is authored separately in Motion Animation Set.';
    } else if(variable.binding==='movement.sprintMultiplier'){
      const value=Number(variable.value);if(Math.abs(value-1.3)<.0001||Math.abs(value-1.28)<.0001)variable.value=1;
      variable.label='Extra Sprint Multiplier';
      variable.description='Optional multiplier over Run Movement Speed. Keep 1 for the authored speed to be the actual top speed.';
    }
  });
  pawn.movementTuningVersion=CHARACTER_MOVEMENT_TUNING_VERSION;
  return 1;
}

/* Persist the post-flip locomotion curve and expose it on graphs saved before
   those controls existed. Runtime defaults are safe already; this migration is
   what makes the same settings visible to the author. */
function migrateWallFlipBehavior(graph){
  const pawn=graph&&graph.characterPawn,abilities=pawn&&pawn.abilities;
  if(!abilities||!abilities.wallFlip||typeof abilities.wallFlip!=='object'||Number(abilities.wallFlipBehaviorVersion)>=WALL_FLIP_BEHAVIOR_VERSION)return 0;
  const flip=abilities.wallFlip;
  if(!Number.isFinite(Number(flip.settleDuration)))flip.settleDuration=.55;
  if(!Number.isFinite(Number(flip.settleSpeedScale)))flip.settleSpeedScale=.42;
  const variables=Array.isArray(graph.variables)?graph.variables:(graph.variables=[]),specs=[
    {name:'TpsWallFlipSettleDuration',type:'number',value:flip.settleDuration,min:.05,max:2,step:.01,exposed:true,binding:'abilities.wallFlip.settleDuration',label:'Wall Flip Walk-to-idle Duration',category:'Traversal'},
    {name:'TpsWallFlipSettleSpeed',type:'number',value:flip.settleSpeedScale,min:.05,max:1,step:.01,exposed:true,binding:'abilities.wallFlip.settleSpeedScale',label:'Wall Flip Walk-to-idle Speed Scale',category:'Traversal'},
  ];
  specs.forEach(spec=>{if(!variables.some(variable=>variable&&variable.binding===spec.binding))variables.push(spec);});
  abilities.wallFlipBehaviorVersion=WALL_FLIP_BEHAVIOR_VERSION;
  return 1;
}

function migrateCharacterCrouchSpeed(graph){
  const pawn=graph&&graph.characterPawn,abilities=pawn&&pawn.abilities,crouch=abilities&&abilities.crouch;
  if(!crouch||Number(crouch.speedVersion)>=CHARACTER_CROUCH_SPEED_VERSION)return 0;
  const speed=Number(crouch.speedScale);
  if(!Number.isFinite(speed)||Math.abs(speed-.42)<.000001)crouch.speedScale=.88;
  (Array.isArray(graph.variables)?graph.variables:[]).forEach(variable=>{
    if(!variable||variable.binding!=='abilities.crouch.speedScale')return;
    const value=Number(variable.value);
    if(!Number.isFinite(value)||Math.abs(value-.42)<.000001)variable.value=.88;
  });
  crouch.speedVersion=CHARACTER_CROUCH_SPEED_VERSION;
  return 1;
}

// Kept as an API alias for plugins built during the short-lived reverse repair.
// Its corrected meaning is now to finish the same-Pawn camera migration.
function repairForcedFirstPersonPresentation(graph){return migrateUnifiedFirstPersonBody(graph);}

function migrateActorBehavior(graph){
  const pawn=graph&&(graph.characterPawn||graph.animalPawn),behavior=pawn&&pawn.behavior;
  if(!behavior||Number(behavior.schemaVersion)>=ACTOR_BEHAVIOR_VERSION)return false;
  const perception=behavior.perception||(behavior.perception={}),area=behavior.actionArea||(behavior.actionArea={});
  const oldOutpost=String(behavior.squadId||'')==='outpost-squad'&&!Object.prototype.hasOwnProperty.call(area,'enabled');
  if(oldOutpost&&(behavior.profile==='tactical'||behavior.profile==='defensive'))behavior.profile='observer';
  if(oldOutpost){
    const tactics=behavior.tactics||(behavior.tactics={});
    const retune=(holder,key,oldValues,next,binding)=>{
      if(oldValues.includes(Number(holder[key]))){holder[key]=next;const variable=graph.variables.find(item=>item&&item.binding===binding);if(variable)variable.value=next;}
    };
    retune(perception,'sightRange',[42],34,'behavior.perception.sightRange');retune(perception,'hearingRange',[32],24,'behavior.perception.hearingRange');retune(perception,'memorySeconds',[5],4,'behavior.perception.memorySeconds');retune(perception,'fieldOfViewDeg',[125],108,'behavior.perception.fieldOfViewDeg');
    retune(tactics,'attackRange',[38],30,'behavior.tactics.attackRange');retune(tactics,'attackRange',[20],18,'behavior.tactics.attackRange');retune(tactics,'preferredRange',[12],15,'behavior.tactics.preferredRange');retune(tactics,'preferredRange',[9],10,'behavior.tactics.preferredRange');retune(tactics,'guardRadius',[55],34,'behavior.tactics.guardRadius');retune(tactics,'coverBias',[.76],.94,'behavior.tactics.coverBias');retune(tactics,'flankBias',[.72],.32,'behavior.tactics.flankBias');retune(tactics,'accuracy',[.7],.56,'behavior.tactics.accuracy');retune(tactics,'burstMin',[2],1,'behavior.tactics.burstMin');retune(tactics,'burstMax',[5],3,'behavior.tactics.burstMax');retune(tactics,'burstPause',[.6],1.15,'behavior.tactics.burstPause');
  }
  const observer=behavior.profile==='observer';
  if(perception.fieldOfViewDeg==null)perception.fieldOfViewDeg=130;
  if(perception.confirmSeconds==null)perception.confirmSeconds=observer?2.2:0;
  const defaults={enabled:observer,shape:'circle',radius:oldOutpost?34:(Number(behavior.tactics&&behavior.tactics.guardRadius)||45),width:oldOutpost?68:90,depth:oldOutpost?68:90,height:oldOutpost?10:12,offset:{x:0,y:0,z:0},action:observer?'observe':'attack',exitAction:'return',showInEditor:true};
  Object.keys(defaults).forEach(key=>{if(area[key]==null)area[key]=clone(defaults[key]);});
  area.offset=Object.assign({x:0,y:0,z:0},area.offset||{});behavior.schemaVersion=ACTOR_BEHAVIOR_VERSION;
  const actionOptions=[{value:'observe',label:'Observe, hide, then engage'},{value:'investigate',label:'Investigate without firing'},{value:'cover',label:'Seek cover, then engage'},{value:'attack',label:'Attack immediately'},{value:'flee',label:'Flee'},{value:'ignore',label:'Ignore'}];
  const exitOptions=[{value:'return',label:'Return to guard origin'},{value:'forget',label:'Forget target'},{value:'search',label:'Search last position'},{value:'hold',label:'Hold position'}];
  function expose(name,binding,value,type,label,extra){
    let variable=graph.variables.find(item=>item&&(item.binding===binding||item.name===name));
    if(!variable){variable={name,type,value:clone(value),exposed:true,binding,label,category:'AI / Action Area'};graph.variables.push(variable);}
    if(oldOutpost&&binding==='behavior.profile')variable.value='observer';
    return Object.assign(variable,extra||{});
  }
  expose('BehaviorProfile','behavior.profile',behavior.profile,'string','Behavior Profile',{category:'AI / Behavior',ui:'select',options:[{value:'observer',label:'Observer — scout from cover, then engage'},{value:'aggressive',label:'Aggressive'},{value:'tactical',label:'Tactical'},{value:'defensive',label:'Defensive'},{value:'flee',label:'Flee'},{value:'civilian',label:'Civilian'},{value:'reactive',label:'Reactive'}]});
  expose('FieldOfViewDeg','behavior.perception.fieldOfViewDeg',perception.fieldOfViewDeg,'number','Field of View (deg)',{category:'AI / Perception',min:10,max:360,step:1});
  expose('ConfirmSeconds','behavior.perception.confirmSeconds',perception.confirmSeconds,'number','Observe Before Engage (s)',{category:'AI / Perception',min:0,max:30,step:.1});
  expose('ActionAreaEnabled','behavior.actionArea.enabled',area.enabled,'boolean','Smart Action Area');
  expose('ActionAreaShape','behavior.actionArea.shape',area.shape,'string','Area Shape',{ui:'select',options:[{value:'circle',label:'Circle'},{value:'box',label:'Box'}]});
  expose('ActionAreaRadius','behavior.actionArea.radius',area.radius,'number','Circle Radius',{min:1,max:500,step:.5});
  expose('ActionAreaWidth','behavior.actionArea.width',area.width,'number','Box Width',{min:1,max:1000,step:.5});
  expose('ActionAreaDepth','behavior.actionArea.depth',area.depth,'number','Box Depth',{min:1,max:1000,step:.5});
  expose('ActionAreaHeight','behavior.actionArea.height',area.height,'number','Area Height',{min:.5,max:250,step:.5});
  expose('ActionAreaOffsetX','behavior.actionArea.offset.x',area.offset.x,'number','Area Offset X',{min:-500,max:500,step:.5});
  expose('ActionAreaOffsetY','behavior.actionArea.offset.y',area.offset.y,'number','Area Offset Y',{min:-250,max:250,step:.5});
  expose('ActionAreaOffsetZ','behavior.actionArea.offset.z',area.offset.z,'number','Area Offset Z',{min:-500,max:500,step:.5});
  expose('ActionAreaAction','behavior.actionArea.action',area.action,'string','When Target Enters',{ui:'select',options:actionOptions});
  expose('ActionAreaExitAction','behavior.actionArea.exitAction',area.exitAction,'string','When Target Exits',{ui:'select',options:exitOptions});
  expose('ActionAreaShowInEditor','behavior.actionArea.showInEditor',area.showInEditor,'boolean','Show Area + FOV in Editor');
  return true;
}

function normalizeComments(comments){
  return (Array.isArray(comments) ? comments : []).filter(Boolean).map((c, i) => ({
    id:String(c.id || ('comment_' + i)),
    title:String(c.title || 'Comment'),
    x:Number(c.x) || 0,
    y:Number(c.y) || 0,
    w:Math.max(120, Number(c.w) || 320),
    h:Math.max(90, Number(c.h) || 180),
    color:String(c.color || '#ffd166'),
  }));
}

function normalizeVehiclePawn(vehiclePawn, legacyBlueprint){
  const source = vehiclePawn && typeof vehiclePawn === 'object'
    ? clone(vehiclePawn)
    : (legacyBlueprint && typeof legacyBlueprint === 'object' ? clone(legacyBlueprint) : null);
  if(!source) return null;
  const legacyController = source.controllerIndex;
  const rawPlayerId = Object.prototype.hasOwnProperty.call(source, 'playerId')
    ? source.playerId
    : (legacyController == null ? null : Number(legacyController) + 1);
  const playerId = rawPlayerId == null || Number(rawPlayerId) < 1
    ? null
    : Math.max(1, Math.min(4, Number(rawPlayerId) | 0));
  const spawn = source.spawn || {};
  const tuning = source.tuning || {};
  const camera = source.camera || source.cam || {};
  return Object.assign({}, source, {
    schemaVersion:VEHICLE_PAWN_VERSION,
    enabled:source.enabled !== false,
    hidden:source.hidden === true,
    possessed:source.possessed !== false && playerId != null,
    modelShading:source.modelShading === 'smooth' || source.modelShading === 'flat' ? source.modelShading : 'original',
    steeringWheel:Object.assign({
      enabled:true,
      pivotName:'steering_wheel_pivot',
      meshName:'steering_wheel_mesh',
      driverSide:'auto',
      axis:'auto',
      direction:0,
      inputLockDegrees:0,
      visualLockDegrees:0,
      response:12,
    }, source.steeringWheel || {}),
    playerId,
    spawn:{
      x:Number(spawn.x) || 0, y:Number(spawn.y) || 0, z:Number(spawn.z) || 0,
      heading:Number(spawn.heading) || 0,
    },
    tuning:Object.assign({}, tuning),
    collision:Object.assign({}, source.collision || {}),
    suspension:Object.assign({}, source.suspension || {}),
    lights:Object.assign({}, source.lights || {}),
    effects:Object.assign({}, source.effects || {}),
    camera:Object.assign({}, camera),
    migration:Object.assign({}, source.migration || {}, {
      fromSchemaVersion:Number(source.schemaVersion || source.version || 0) || 0,
      toSchemaVersion:VEHICLE_PAWN_VERSION,
      legacyBlueprint:!vehiclePawn && !!legacyBlueprint,
    }),
  });
}

function subgraph(id, name, nodes, edges, variables){
  return {
    id:String(id || name || 'subgraph'),
    name:String(name || id || 'Subgraph'),
    enabled:true,
    variables:Array.isArray(variables) ? clone(variables) : [],
    nodes:Array.isArray(nodes) ? clone(nodes) : [],
    edges:Array.isArray(edges) ? clone(edges) : [],
    comments:[],
  };
}

function createEmptyGraph(name, scope){
  return {
    version: VERSION,
    name: name || 'Logic Graph',
    scope: scope || 'element',
    enabled: true,
    variables: [],
    nodes: [],
    edges: [],
    comments: [],
    subgraphs: [],
  };
}

function createStarterGraph(name, scope){
  const graph = createEmptyGraph(name || 'Logic Graph', scope || 'element');
  graph.variables.push({name:'counter', type:'number', value:0, exposed:true, label:'Counter'});
  graph.nodes.push(
    node('on_start', 'event.onStart', 80, 80),
    node('print_start', 'debug.print', 360, 80, {message:(name || 'Logic Graph') + ' started'}),
    node('on_update', 'event.onUpdate', 80, 230),
    node('get_counter', 'variable.get', 330, 210, {name:'counter'}),
    node('delta_add', 'math.add', 560, 210),
    node('set_counter', 'variable.set', 800, 230, {name:'counter'})
  );
  graph.edges.push(
    edge('e_start_print', 'on_start', 'then', 'print_start', 'exec'),
    edge('e_update_set', 'on_update', 'then', 'set_counter', 'exec'),
    edge('e_counter_add_a', 'get_counter', 'value', 'delta_add', 'a'),
    edge('e_update_add_b', 'on_update', 'deltaTime', 'delta_add', 'b'),
    edge('e_add_set_value', 'delta_add', 'value', 'set_counter', 'value')
  );
  return graph;
}

function normalizeGraph(graph, fallbackName, fallbackScope){
  const g = graph && typeof graph === 'object' ? clone(graph) : createEmptyGraph(fallbackName, fallbackScope);
  g.version = Number(g.version) || VERSION;
  g.name = String(g.name || fallbackName || 'Logic Graph');
  g.scope = g.scope === 'level' ? 'level' : 'element';
  g.enabled = g.enabled !== false;
  g.nodes = normalizeNodes(g.nodes);
  g.edges = normalizeEdges(g.edges);
  g.variables = normalizeVariables(g.variables);
  g.comments = normalizeComments(g.comments);
  g.subgraphs = (Array.isArray(g.subgraphs) ? g.subgraphs : []).filter(Boolean).map((sg, i) => ({
    id:String(sg.id || sg.name || ('subgraph_' + i)),
    name:String(sg.name || sg.id || ('Subgraph ' + (i + 1))),
    enabled:sg.enabled !== false,
    macro:sg.macro === true,
    inputs:Array.isArray(sg.inputs) ? clone(sg.inputs) : [],
    outputs:Array.isArray(sg.outputs) ? clone(sg.outputs) : [],
    variables:normalizeVariables(sg.variables),
    nodes:normalizeNodes(sg.nodes),
    edges:normalizeEdges(sg.edges),
    comments:normalizeComments(sg.comments),
  }));
  const vehiclePawn = normalizeVehiclePawn(g.vehiclePawn, g.playerPawnBlueprint);
  if(vehiclePawn) g.vehiclePawn = vehiclePawn;
  migrateTemplateCameraDefault(g);
  migrateVehicleInteriorCamera(g);
  migrateLocomotionSides(g);
  migrateFirstPersonViewPawn(g);
  migrateUnifiedFirstPersonBody(g);
  migrateFirstPersonHeadCamera(g);
  ensurePawnCameraRigs(g);
  migrateTraversalSurfaceAdaptation(g);
  migrateCharacterMovementTuning(g);
  migrateCharacterCrouchSpeed(g);
  migrateWallFlipBehavior(g);
  migrateActorBehavior(g);
  return g;
}

function addDependency(map, type, ref, owner){
  if(!ref) return;
  const key = String(ref.id || ref.key || ref.dbKey || ref.src || ref.value || '').trim();
  if(!key) return;
  const depKey = type + ':' + key;
  if(!map.has(depKey)){
    map.set(depKey, {
      type,
      id:ref.id || null,
      key:ref.key || null,
      dbKey:ref.dbKey || null,
      src:ref.src || null,
      value:ref.value || null,
      name:ref.name || null,
      source:ref.source || null,
      version:ref.version || null,
      apiVersion:ref.apiVersion || null,
      license:ref.license || null,
      repository:ref.repository || null,
      attribution:ref.attribution || null,
      requested:ref.requested || null,
      fallback:ref.fallback === true,
      embedded:ref.embedded === true || !!(ref.samples || ref.layers || ref.tracks || ref.config),
      owners:[],
    });
  }
  if(owner) map.get(depKey).owners.push(owner);
}

function collectGraphDependencies(graph){
  const deps = new Map();
  const g = graph && typeof graph === 'object' ? graph : {};
  const scene = g.logicScene || {};
  function refDependency(ref){
    if(!ref) return null;
    if(typeof ref === 'object') return ref;
    return {value:String(ref), name:String(ref)};
  }
  [scene.root].concat(Array.isArray(scene.elements) ? scene.elements : []).filter(Boolean).forEach(element => {
    if(element.asset) addDependency(deps, 'mesh', element.asset, element.id || element.name || 'logicScene');
    const material = element.matProps || element.materials || element.props;
    if(material && typeof material === 'object'){
      ['map','mapSrc','normalMap','normalMapSrc','roughnessMap','roughnessMapSrc','metalnessMap','metalnessMapSrc','alphaMap','alphaMapSrc','emissiveMap','emissiveMapSrc'].forEach(key => {
        if(material[key]) addDependency(deps, 'texture', refDependency(material[key]), (element.id || 'logicScene') + ':material:' + key);
      });
    }
  });
  const vehicle = g.vehiclePawn;
  if(vehicle && vehicle.modelAsset) addDependency(deps, 'mesh', vehicle.modelAsset, 'vehiclePawn:model');
  if(vehicle && vehicle.engineAudio){
    const soundSet = vehicle.engineAudio.set || vehicle.engineAudio.setId;
    if(soundSet) addDependency(deps, 'audio-set', refDependency(soundSet), 'vehiclePawn:engineAudio');
  }
  const sketchbookVehicle=g.sketchbookPawn;
  if(sketchbookVehicle&&sketchbookVehicle.kind!=='advanced-character'&&sketchbookVehicle.engineAudio){
    const soundSet=sketchbookVehicle.engineAudio.set||sketchbookVehicle.engineAudio.setId;
    if(soundSet)addDependency(deps,'audio-set',refDependency(soundSet),'sketchbookPawn:engineAudio');
  }
  if(vehicle && window.LK_RUNTIME_VEHICLE_PHYSICS_BACKENDS){
    const backend = window.LK_RUNTIME_VEHICLE_PHYSICS_BACKENDS.manifest(vehicle.physicsBackend || 'auto');
    if(backend) addDependency(deps, 'plugin', backend, 'vehiclePawn:physics');
  }
  const character=g.characterPawn||g.soccerPawn;
  if(character){
    if(character.model)addDependency(deps,'mesh',character.model,'character:model');
    if(character.animationLibrary)addDependency(deps,'mesh',character.animationLibrary,'character:animationLibrary');
    (Array.isArray(character.animationSet)?character.animationSet:[]).forEach(entry=>{if(entry&&entry.asset)addDependency(deps,'mesh',entry.asset,'character:motion:'+(entry.id||entry.name||entry.clip||'entry'));});
  }
  const animal=g.animalPawn;
  if(animal){
    if(animal.model)addDependency(deps,'mesh',animal.model,'animal:model');
    if(animal.animationLibrary)addDependency(deps,'mesh',animal.animationLibrary,'animal:animationLibrary');
    (Array.isArray(animal.animationSet)?animal.animationSet:[]).forEach(entry=>{if(entry&&entry.asset)addDependency(deps,'mesh',entry.asset,'animal:motion:'+(entry.id||entry.name||entry.clip||'entry'));});
  }
  function scanUi(element,owner){
    if(!element||typeof element!=='object')return;
    if(String(element.type||'').toLowerCase()==='image'&&element.asset)addDependency(deps,'texture',refDependency(element.asset),owner+':'+(element.id||'image'));
    (Array.isArray(element.children)?element.children:[]).forEach(child=>scanUi(child,owner));
  }
  if(g.uiElement)scanUi(g.uiElement,'uiElement');
  (Array.isArray(g.variables) ? g.variables : []).forEach(variable => {
    const binding = String(variable && variable.binding || '');
    if(/^ui\./.test(binding)&&/(?:asset|src|image|texture)/i.test(binding)&&variable.value){
      addDependency(deps,'texture',refDependency(variable.value),'variable:'+(variable.name||binding));
    }
    if(binding !== 'animationLibrary' && binding.indexOf('animations.') !== 0) return;
    let value = variable.value;
    if(typeof value === 'string' && value.trim().charAt(0) === '{') try { value = JSON.parse(value); } catch(err) { return; }
    const ref = binding === 'animationLibrary' ? value : value && value.asset;
    if(ref && typeof ref === 'object') addDependency(deps, 'mesh', ref, 'variable:' + (variable.name || binding));
  });
  function scanNodes(nodes, owner){
    (Array.isArray(nodes) ? nodes : []).filter(Boolean).forEach(node => {
      const data = node.data || {};
      if(node.type === 'material.loadTexture' && data.textureRef){
        addDependency(deps, 'texture', refDependency(data.textureRef), owner + ':' + node.id);
      }
      if(node.type === 'audio.playSound' && data.soundRef){
        addDependency(deps, 'audio', refDependency(data.soundRef), owner + ':' + node.id);
      }
      if(node.type === 'ui.createImage' && data.asset){
        addDependency(deps, 'texture', refDependency(data.asset), owner + ':' + node.id);
      }
    });
  }
  scanNodes(g.nodes, 'main');
  (Array.isArray(g.subgraphs) ? g.subgraphs : []).filter(Boolean).forEach(sg => scanNodes(sg.nodes, 'subgraph:' + (sg.id || sg.name || 'function')));
  return Array.from(deps.values()).map(dep => Object.assign({}, dep, {
    owners:Array.from(new Set(dep.owners)),
  }));
}

function normalizeDefinitionAsset(asset, fallbackName, fallbackScope){
  const source = asset && typeof asset === 'object' ? clone(asset) : {};
  const name = String(source.name || fallbackName || 'Logic Element').trim() || 'Logic Element';
  const graph = normalizeGraph(source.graph || source.logic || createEmptyGraph(name, fallbackScope || 'element'), name, fallbackScope || 'element');
  const fromVersion = Number(source.definitionVersion || source.graphDefinitionVersion || 0) || 0;
  const normalized = Object.assign({}, source, {
    name,
    kind:source.kind || 'logic-element-definition',
    definitionVersion:DEFINITION_VERSION,
    graph,
    dependencies:collectGraphDependencies(graph),
  });
  if(fromVersion !== DEFINITION_VERSION){
    normalized.migration = Object.assign({}, source.migration || {}, {
      fromDefinitionVersion:fromVersion,
      toDefinitionVersion:DEFINITION_VERSION,
    });
  }
  return normalized;
}

window.LK_LOGIC_GRAPH = Object.freeze({
  VERSION,
  DEFINITION_VERSION,
  VEHICLE_PAWN_VERSION,
  ACTOR_BEHAVIOR_VERSION,
  FIRST_PERSON_VIEW_PAWN_VERSION,
  FIRST_PERSON_HEAD_CAMERA_VERSION,
  PAWN_CAMERA_RIG_VERSION,
  TRAVERSAL_SURFACE_ADAPTATION_VERSION,
  CHARACTER_MOVEMENT_TUNING_VERSION,
  CHARACTER_CROUCH_SPEED_VERSION,
  WALL_FLIP_BEHAVIOR_VERSION,
  clone,
  node,
  edge,
  subgraph,
  createEmptyGraph,
  createStarterGraph,
  normalizeGraph,
  normalizeVehiclePawn,
  migrateActorBehavior,
  migrateLocomotionSides,
  repairForcedFirstPersonPresentation,
  migrateFirstPersonViewPawn,
  migrateUnifiedFirstPersonBody,
  migrateFirstPersonHeadCamera,
  ensurePawnCameraRigs,
  syncPawnCameraElementsFromConfig,
  syncPawnCameraConfigFromElement,
  syncPawnCameraNode,
  migrateTraversalSurfaceAdaptation,
  migrateCharacterMovementTuning,
  migrateCharacterCrouchSpeed,
  migrateWallFlipBehavior,
  collectGraphDependencies,
  normalizeDefinitionAsset,
});
})();
