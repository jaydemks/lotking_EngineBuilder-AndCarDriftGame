/* =========================================================
   LOT KING - Procedural placeholder locomotion
   Drives the built-in primitive body (torso/hips/legs/arms/
   head authored by the Character and Soccer templates) with a
   lightweight procedural walk/run/idle/gesture cycle, so
   movement and style read clearly before a rigged GLB is ever
   assigned. Exposes the same public contract as the GLB
   motion-blend controller (bind/update/playAction/dispose/
   isBound/...) in soccer-locomotion.js, so Character and Soccer
   Pawns can use either interchangeably and upgrade from one to
   the other without special-casing the caller.
   ========================================================= */
(function(){
'use strict';

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function normalizeName(name){ return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function vectorLength(value){
  return Math.hypot(
    finite(value && value.x, 0),
    finite(value && value.y, 0),
    finite(value && value.z, 0)
  );
}

// Scene element ids authored by the Character/Soccer template placeholder
// rig (see logic-templates-character.js / logic-templates-soccer.js). Any
// subset may be present; parts that are missing are simply not animated.
const PART_IDS = {
  torso:'torso_shirt', hips:'hips_shorts',
  legLeft:'leg_sock_left', legRight:'leg_sock_right',
  kneeLeft:'knee_sock_left', kneeRight:'knee_sock_right',
  footLeft:'foot_shoe_left', footRight:'foot_shoe_right',
  armLeft:'arm_skin_left', armRight:'arm_skin_right',
  handLeft:'hand_skin_left', handRight:'hand_skin_right',
  // Elbows are newer than the rest of the rig. A project saved before they
  // existed simply has no node with these ids, and an absent part is skipped —
  // so the arms stay straight there and bend everywhere else.
  elbowLeft:'elbow_skin_left', elbowRight:'elbow_skin_right',
  head:'head_skin',
};

// One authoritative T-pose shared by Character/Soccer templates and Pawn
// Studio. Arms and legs use invisible joint pivots, so procedural motion
// rotates from shoulders/hips instead of spinning each limb around its centre.
const T_POSE = Object.freeze([
  {id:'torso_shirt',name:'Torso Shirt',type:'mesh',primitive:'cube',parentId:'root',position:[0,1.27,0],rotation:[0,0,0],scale:[.52,.62,.31],colorKey:'shirtColor'},
  {id:'hips_shorts',name:'Hips Shorts',type:'mesh',primitive:'cube',parentId:'root',position:[0,.88,0],rotation:[0,0,0],scale:[.47,.30,.29],colorKey:'shortsColor'},
  {id:'leg_sock_left',name:'Left Hip Joint',type:'empty',parentId:'root',position:[-.13,.79,0],rotation:[0,0,0],scale:[1,1,1]},
  {id:'leg_sock_mesh_left',name:'Left Thigh',type:'mesh',primitive:'cylinder',parentId:'leg_sock_left',position:[0,-.195,0],rotation:[0,0,0],scale:[.15,.43,.15],colorKey:'socksColor'},
  {id:'knee_sock_left',name:'Left Knee Joint',type:'empty',parentId:'leg_sock_left',position:[0,-.39,0],rotation:[0,0,0],scale:[1,1,1]},
  {id:'shin_sock_left',name:'Left Shin',type:'mesh',primitive:'cylinder',parentId:'knee_sock_left',position:[0,-.185,0],rotation:[0,0,0],scale:[.135,.41,.135],colorKey:'socksColor'},
  {id:'foot_shoe_left',name:'Left Foot',type:'mesh',primitive:'cube',parentId:'knee_sock_left',position:[0,-.35,.075],rotation:[0,0,0],scale:[.16,.09,.30],colorKey:'shoeColor'},
  {id:'leg_sock_right',name:'Right Hip Joint',type:'empty',parentId:'root',position:[.13,.79,0],rotation:[0,0,0],scale:[1,1,1]},
  {id:'leg_sock_mesh_right',name:'Right Thigh',type:'mesh',primitive:'cylinder',parentId:'leg_sock_right',position:[0,-.195,0],rotation:[0,0,0],scale:[.15,.43,.15],colorKey:'socksColor'},
  {id:'knee_sock_right',name:'Right Knee Joint',type:'empty',parentId:'leg_sock_right',position:[0,-.39,0],rotation:[0,0,0],scale:[1,1,1]},
  {id:'shin_sock_right',name:'Right Shin',type:'mesh',primitive:'cylinder',parentId:'knee_sock_right',position:[0,-.185,0],rotation:[0,0,0],scale:[.135,.41,.135],colorKey:'socksColor'},
  {id:'foot_shoe_right',name:'Right Foot',type:'mesh',primitive:'cube',parentId:'knee_sock_right',position:[0,-.35,.075],rotation:[0,0,0],scale:[.16,.09,.30],colorKey:'shoeColor'},
  // Each arm is shoulder -> upper arm -> ELBOW -> forearm -> hand. Without the
  // elbow the arm is one rigid bar, and no amount of shoulder posing stops a
  // character holding a rifle from reading as a T-pose: real arms bend.
  {id:'arm_skin_left',name:'Left Shoulder Joint',type:'empty',parentId:'root',position:[-.24,1.42,0],rotation:[0,0,0],scale:[1,1,1]},
  {id:'arm_skin_mesh_left',name:'Arm Skin Left',type:'mesh',primitive:'cylinder',parentId:'arm_skin_left',position:[-.20,0,0],rotation:[0,0,90],scale:[.12,.42,.12],colorKey:'skinColor'},
  {id:'elbow_skin_left',name:'Left Elbow Joint',type:'empty',parentId:'arm_skin_left',position:[-.41,0,0],rotation:[0,0,0],scale:[1,1,1]},
  {id:'forearm_skin_left',name:'Forearm Skin Left',type:'mesh',primitive:'cylinder',parentId:'elbow_skin_left',position:[-.18,0,0],rotation:[0,0,90],scale:[.105,.38,.105],colorKey:'skinColor'},
  {id:'hand_skin_left',name:'Hand Skin Left',type:'mesh',primitive:'sphere',parentId:'elbow_skin_left',position:[-.38,0,0],rotation:[0,0,0],scale:[.13,.16,.13],colorKey:'skinColor'},
  {id:'arm_skin_right',name:'Right Shoulder Joint',type:'empty',parentId:'root',position:[.24,1.42,0],rotation:[0,0,0],scale:[1,1,1]},
  {id:'arm_skin_mesh_right',name:'Arm Skin Right',type:'mesh',primitive:'cylinder',parentId:'arm_skin_right',position:[.20,0,0],rotation:[0,0,90],scale:[.12,.42,.12],colorKey:'skinColor'},
  {id:'elbow_skin_right',name:'Right Elbow Joint',type:'empty',parentId:'arm_skin_right',position:[.41,0,0],rotation:[0,0,0],scale:[1,1,1]},
  {id:'forearm_skin_right',name:'Forearm Skin Right',type:'mesh',primitive:'cylinder',parentId:'elbow_skin_right',position:[.18,0,0],rotation:[0,0,90],scale:[.105,.38,.105],colorKey:'skinColor'},
  {id:'hand_skin_right',name:'Hand Skin Right',type:'mesh',primitive:'sphere',parentId:'elbow_skin_right',position:[.38,0,0],rotation:[0,0,0],scale:[.13,.16,.13],colorKey:'skinColor'},
  {id:'head_skin',name:'Head Skin',type:'mesh',primitive:'sphere',parentId:'root',position:[0,1.69,0],rotation:[0,0,0],scale:[.31,.34,.31],colorKey:'skinColor'},
  {id:'hair_top',name:'Hair Top',type:'mesh',primitive:'sphere',parentId:'root',position:[0,1.79,-.015],rotation:[0,0,0],scale:[.32,.19,.32],colorKey:'hairColor'},
]);
function paletteColor(palette,key){const defaults={shirtColor:'#4f8fbf',shortsColor:'#263445',socksColor:'#263445',shoeColor:'#171b22',hairColor:'#2b2118',skinColor:'#d8a184'};return palette&&palette[key]||defaults[key]||'#64748b';}
function sceneElements(palette){return T_POSE.map(part=>({id:part.id,name:part.name,type:part.type,primitive:part.primitive||'sphere',parentId:part.parentId,linked:true,dummyVisible:false,position:part.position.slice(),rotation:part.rotation.slice(),scale:part.scale.slice(),color:paletteColor(palette,part.colorKey)}));}
function createVisual(THREERef,palette){
  if(!THREERef)return null;const root=new THREERef.Group();root.name='Character Placeholder · T-Pose';root.userData.characterPlaceholderRig=true;const nodes=new Map([['root',root]]);
  T_POSE.forEach(part=>{let node;if(part.type==='empty')node=new THREERef.Group();else{let geometry;if(part.primitive==='sphere')geometry=new THREERef.SphereGeometry(.48,24,14);else if(part.primitive==='cylinder')geometry=new THREERef.CylinderGeometry(.42,.42,.9,20);else geometry=new THREERef.BoxGeometry(.8,.8,.8);const material=new THREERef.MeshStandardMaterial({color:paletteColor(palette,part.colorKey),roughness:.72,metalness:0});node=new THREERef.Mesh(geometry,material);node.castShadow=true;node.receiveShadow=true;}node.name=part.name;node.position.fromArray(part.position);node.rotation.set(THREERef.MathUtils.degToRad(part.rotation[0]),THREERef.MathUtils.degToRad(part.rotation[1]),THREERef.MathUtils.degToRad(part.rotation[2]));node.scale.fromArray(part.scale);node.userData.logicElementSceneId=part.id;node.userData.characterPlaceholderPart=true;(nodes.get(part.parentId)||root).add(node);nodes.set(part.id,node);});
  return root;
}

// One-shot gestures resolved from the free-text clip name assigned to each
// action slot, using the same forgiving keyword-matching convention as the
// GLB clip matcher (soccer-locomotion.js SLOT_HINTS) so "Soccer Strike",
// "Shoot", "Goalkeeper Dive Left"... all resolve to a sensible built-in pose.
const GESTURE_HINTS = [
  ['jump', ['jump']],
  ['land', ['land', 'landing']],
  // Keep firearm fire distinct from Soccer's `Shoot`, which is a kick. The
  // authoritative action slot below resolves `fire` even when the imported
  // take is generically named `mixamo.com`; these hints cover readable names.
  ['fire', ['fire', 'firing', 'recoil']],
  ['kick', ['shoot', 'kick', 'strike', 'pass', 'cross']],
  ['dive', ['dive', 'save']],
  ['celebrate', ['celebrate', 'victory']],
  ['defeat', ['defeat', 'lose']],
  ['interact', ['interact', 'talk', 'inspect']],
];
function resolveGesture(name){
  const n = normalizeName(name);
  if(!n) return 'interact';
  for(let i = 0; i < GESTURE_HINTS.length; i++){
    const gesture = GESTURE_HINTS[i][0], hints = GESTURE_HINTS[i][1];
    if(hints.some(hint => n.indexOf(hint) >= 0)) return gesture;
  }
  return 'interact';
}

function createController(options){
  const opts = options || {};
  const state = {
    owner:null, parts:{}, rest:{}, bound:false,
    walkSpeed:Math.max(.1, finite(opts.walkSpeed, 1.9)),
    runSpeed:Math.max(.2, finite(opts.runSpeed, 6)),
    responsiveness:Math.max(.5, finite(opts.responsiveness, 9)),
    predictionTime:Math.max(0, finite(opts.predictionTime, .12)),
    stepPoseStrength:clamp(finite(opts.stepPoseStrength, 1), 0, 2),
    stair:{amount:0, side:1, rise:0},
    velocity:{x:0, z:0}, predicted:{x:0, z:0},
    phase:0, idlePhase:0,
    gesture:null, // {name, slot, elapsed, duration, direction, onDone}
    gestureBlend:null,
  };

  function findPart(id){
    if(!state.owner || !state.owner.traverse) return null;
    let found = null;
    state.owner.traverse(child => {
      if(!found && child.userData && child.userData.logicElementSceneId === id) found = child;
    });
    return found;
  }
  function snapshotRotation(node){ return {x:node.rotation.x, y:node.rotation.y, z:node.rotation.z}; }

  function bind(owner){
    dispose();
    if(!owner) return false;
    state.owner = owner;
    let any = false;
    Object.keys(PART_IDS).forEach(key => {
      const node = findPart(PART_IDS[key]);
      if(!node) return;
      state.parts[key] = node;
      state.rest[key] = {position:{x:node.position.x, y:node.position.y, z:node.position.z}, rotation:snapshotRotation(node)};
      any = true;
    });
    state.bound = any;
    return any;
  }

  function resetPart(key){
    const node = state.parts[key], rest = state.rest[key];
    if(!node || !rest) return;
    node.position.set(rest.position.x, rest.position.y, rest.position.z);
    node.rotation.set(rest.rotation.x, rest.rotation.y, rest.rotation.z);
  }
  function resetAllParts(){ Object.keys(state.parts).forEach(resetPart); }
  function capturePose(){
    const pose={};
    Object.keys(state.parts).forEach(key=>{const node=state.parts[key];if(node)pose[key]={position:{x:node.position.x,y:node.position.y,z:node.position.z},rotation:{x:node.rotation.x,y:node.rotation.y,z:node.rotation.z}};});
    return pose;
  }
  function blendPose(base, actionWeight){
    const weight=clamp(finite(actionWeight,1),0,1);
    Object.keys(base||{}).forEach(key=>{
      const node=state.parts[key],rest=base[key];if(!node||!rest)return;
      node.position.set(
        rest.position.x+(node.position.x-rest.position.x)*weight,
        rest.position.y+(node.position.y-rest.position.y)*weight,
        rest.position.z+(node.position.z-rest.position.z)*weight
      );
      node.rotation.set(
        rest.rotation.x+(node.rotation.x-rest.rotation.x)*weight,
        rest.rotation.y+(node.rotation.y-rest.rotation.y)*weight,
        rest.rotation.z+(node.rotation.z-rest.rotation.z)*weight
      );
    });
  }
  function relaxArms(amount){
    const t=clamp(finite(amount,1),0,1),left=state.parts.armLeft,right=state.parts.armRight,restLeft=state.rest.armLeft,restRight=state.rest.armRight;
    if(left&&restLeft)left.rotation.z=restLeft.rotation.z+Math.PI*.46*t;
    if(right&&restRight)right.rotation.z=restRight.rotation.z-Math.PI*.46*t;
    // A human arm is never straight at rest, and a straight one is the single
    // clearest tell that a body is procedural.
    bendElbows(.22*t, .22*t);
  }
  // THE ELBOW BENDS ON Y, NOT Z.
  //
  // The forearm runs along the arm's local X. Rotating that about Z swings it
  // sideways — away from the body — which is why the hands were reaching out to
  // the left and the right instead of forward onto the weapon. Rotating about Y
  // swings it along local Z, and the shoulder has already turned local Z to face
  // forward, so the forearm folds toward the chest the way a real elbow does.
  //
  // The sign follows the side: the -X arm folds with +y, the +X arm mirrors it.
  function bendElbows(leftAmount, rightAmount){
    const left=state.parts.elbowLeft, right=state.parts.elbowRight;
    const restLeft=state.rest.elbowLeft, restRight=state.rest.elbowRight;
    if(left&&restLeft)left.rotation.y=restLeft.rotation.y+finite(leftAmount,0);
    if(right&&restRight)right.rotation.y=restRight.rotation.y-finite(rightAmount,0);
  }

  function applyIdle(dt){
    state.idlePhase += dt * 1.6;
    resetAllParts();
    relaxArms(1);
    const torso = state.parts.torso, restTorso = state.rest.torso;
    if(torso && restTorso) torso.position.y = restTorso.position.y + Math.sin(state.idlePhase) * .012;
    const head = state.parts.head, restHead = state.rest.head;
    if(head && restHead) head.rotation.x = restHead.rotation.x + Math.sin(state.idlePhase * .8) * .015;
  }

  // speedRatio in [0,1] against runSpeed; stride frequency and swing amount
  // both scale with it so a faster Pawn visibly reads as running, not just
  // sliding faster on the same walk cycle.
  function applyLocomotion(speedRatio, sprinting, dt){
    resetAllParts();
    relaxArms(1);
    state.phase += dt * (2.2 + speedRatio * (sprinting ? 7.5 : 5.2));
    const swing = .34 + speedRatio * (sprinting ? .62 : .46);
    const armSwing = swing * .8;
    const s = Math.sin(state.phase);
    const legL = state.parts.legLeft, restLL = state.rest.legLeft;
    const legR = state.parts.legRight, restLR = state.rest.legRight;
    if(legL && restLL) legL.rotation.x = restLL.rotation.x + s * swing;
    if(legR && restLR) legR.rotation.x = restLR.rotation.x - s * swing;
    const armL = state.parts.armLeft, restAL = state.rest.armLeft;
    const armR = state.parts.armRight, restAR = state.rest.armRight;
    if(armL && restAL) armL.rotation.x = restAL.rotation.x - s * armSwing;
    if(armR && restAR) armR.rotation.x = restAR.rotation.x + s * armSwing;
    const torso = state.parts.torso, restTorso = state.rest.torso;
    if(torso && restTorso){
      torso.position.y = restTorso.position.y + Math.abs(Math.sin(state.phase * 2)) * .05 * (.5 + speedRatio);
      torso.rotation.x = restTorso.rotation.x + speedRatio * (sprinting ? .26 : .14);
    }
    const hips = state.parts.hips, restHips = state.rest.hips;
    if(hips && restHips) hips.rotation.z = restHips.rotation.z + s * .05 * speedRatio;
    const head = state.parts.head, restHead = state.rest.head;
    if(head && restHead) head.rotation.x = restHead.rotation.x - speedRatio * (sprinting ? .1 : .04);
  }

  function applyStairPose(want, dt){
    const grounded=want.groundContact!==false&&want.grounded!==false;
    const rise=Math.max(0,finite(want.stepRise,0));
    const maxRise=Math.max(.02,finite(want.stepHeight,.55));
    if(grounded&&rise>.001){
      const speed=Math.max(finite(want.speed,0),Math.hypot(finite(want.x,0),finite(want.z,0)));
      const speedScale=.45+.55*clamp(speed/Math.max(.1,state.walkSpeed),0,1);
      state.stair.amount=Math.max(state.stair.amount,clamp(rise/maxRise,0,1)*speedScale*state.stepPoseStrength);
      state.stair.side=finite(want.stepSide,state.stair.side)>=0?1:-1;
      state.stair.rise=rise;
    } else state.stair.amount*=Math.exp(-8*Math.max(.0001,dt));
    const amount=clamp(state.stair.amount,0,1.5);
    if(amount<.002)return;
    const leadLeft=state.stair.side<0;
    const leadLeg=leadLeft?'legLeft':'legRight',trailLeg=leadLeft?'legRight':'legLeft';
    const leadKnee=leadLeft?'kneeLeft':'kneeRight',trailKnee=leadLeft?'kneeRight':'kneeLeft';
    const leadFoot=leadLeft?'footLeft':'footRight',trailFoot=leadLeft?'footRight':'footLeft';
    const add=(key,angle)=>{const node=state.parts[key];if(node)node.rotation.x+=angle*amount;};
    add(leadLeg,-.48);add(leadKnee,.82);add(leadFoot,-.34);
    add(trailLeg,.12);add(trailKnee,.22);add(trailFoot,-.08);
    const hips=state.parts.hips;if(hips)hips.position.y+=Math.min(.08,state.stair.rise*.22)*amount;
  }

  // Carrying a weapon is an UPPER BODY pose laid on top of whatever the legs are
  // already doing, not a separate animation state. The locomotion pass has
  // already written this frame's arm swing, so blending toward the carry pose by
  // `carry` keeps part of that swing: the character still moves its arms while
  // running with a rifle instead of freezing into a statue.
  //
  // `aim` tightens the pose onto the sight line and `pitch` follows the view up
  // and down, which is what makes aiming read from outside.
  // Which physical side an arm joint is on, in the OWNER's space. This rig is
  // authored with `arm_skin_right` at local +X, and the engine's convention is
  // +Z forward — so the character's right is local -X and the node named "right"
  // is on its left. Posing by name therefore drove one arm while the weapon was
  // welded to the other, which is most of why the limbs looked wrong.
  //
  // `relaxArms` and `bendElbows` establish the sign convention this reuses:
  // the -X arm swings down with +z and bends its elbow with -z, and the +X arm
  // is the mirror of that.
  // --- two-bone IK for the support hand -----------------------------------
  //
  // Posing the support arm by angles gets it CLOSE to the weapon; it never gets
  // it ON the weapon, because the angles do not know where the foregrip is. A
  // rigged GLB will attach that hand exactly, so the procedural body solves for
  // it the same way: aim the shoulder and fold the elbow so the hand lands on
  // the grip point the view model reports.
  //
  // Shoulder and elbow are a two-bone chain of fixed lengths, so this is the
  // classic law-of-cosines solution rather than an iterative solver.
  const ik = {};
  function ikVectors(){
    const THREE = window.THREE;
    if(!THREE) return null;
    if(!ik.target){
      ik.target = new THREE.Vector3();
      ik.vec = new THREE.Vector3();
      ik.dir = new THREE.Vector3();
      ik.axis = new THREE.Vector3();
      ik.pole = new THREE.Vector3();
      ik.upper = new THREE.Vector3();
      ik.x = new THREE.Vector3();
      ik.y = new THREE.Vector3();
      ik.z = new THREE.Vector3();
      ik.hand = new THREE.Vector3();
      ik.basis = new THREE.Matrix4();
    }
    return ik;
  }

  function solveSupportArm(arm, target){
    const THREE = window.THREE;
    const v = ikVectors();
    if(!v || !arm.shoulder || !arm.elbow || !arm.hand || !arm.restShoulder || !arm.restElbow) return false;
    const parent = arm.shoulder.parent;
    if(!parent) return false;

    // Rest poses are deliberately stored as serializable {x,y,z} snapshots,
    // not live THREE.Vector3 instances. Treat both snapshot and runtime
    // positions through the same structural contract: calling `.length()` on
    // the snapshot threw once per frame as soon as third person enabled the
    // support-hand IK, freezing play and flooding the console.
    const L1 = vectorLength(arm.restElbow.position);
    const L2 = vectorLength(arm.hand.position);
    if(L1 < 1e-4 || L2 < 1e-4) return false;

    parent.updateMatrixWorld(true);
    v.target.set(target.x, target.y, target.z);
    parent.worldToLocal(v.target);
    v.vec.copy(v.target).sub(arm.restShoulder.position);
    let d = v.vec.length();
    if(d < 1e-4) return false;
    v.dir.copy(v.vec).divideScalar(d);
    // Out of reach is not a failure: the arm simply straightens toward it.
    d = Math.min(Math.max(d, Math.abs(L1 - L2) + .01), (L1 + L2) * .995);

    const cosElbow = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
    const bend = Math.PI - Math.acos(cosElbow);
    const cosAlpha = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const alpha = Math.acos(cosAlpha);

    // The elbow has to break somewhere: the pole vector picks down-and-forward,
    // which is where a human elbow goes when both hands are on a weapon.
    v.pole.set(0, -1, .4).normalize();
    v.axis.crossVectors(v.dir, v.pole);
    if(v.axis.lengthSq() < 1e-6) v.axis.set(0, 0, 1);
    v.axis.normalize();
    v.upper.copy(v.dir).applyAxisAngle(v.axis, alpha);

    // Build the shoulder rotation directly: local X maps onto the upper arm
    // (negated for the -X arm) and local Y onto the bend axis, which is what
    // makes the elbow's own Y rotation fold in the solved plane.
    v.x.copy(v.upper).multiplyScalar(arm.down > 0 ? -1 : 1);
    v.y.copy(v.axis);
    v.z.crossVectors(v.x, v.y).normalize();
    v.y.crossVectors(v.z, v.x).normalize();
    v.basis.makeBasis(v.x, v.y, v.z);

    // Two mirrored elbow solutions reach the same distance; only one puts the
    // hand on the target. Trying both and measuring is cheaper and far more
    // robust than deriving the sign through three coordinate conventions.
    let best = null;
    for(let sign = -1; sign <= 1; sign += 2){
      arm.shoulder.quaternion.setFromRotationMatrix(v.basis);
      arm.elbow.rotation.set(0, bend * sign, 0);
      arm.shoulder.updateMatrixWorld(true);
      arm.hand.getWorldPosition(v.hand);
      const error = v.hand.distanceTo(target);
      if(!best || error < best.error) best = {sign, error};
    }
    arm.shoulder.quaternion.setFromRotationMatrix(v.basis);
    arm.elbow.rotation.set(0, bend * best.sign, 0);

    return true;
  }

  function armOnSide(side){
    const wantedX = side >= 0 ? -1 : 1;          // engine right is local -X
    const restLeft = state.rest.armLeft, restRight = state.rest.armRight;
    const leftX = restLeft ? restLeft.position.x : -1;
    const rightX = restRight ? restRight.position.x : 1;
    const useLeft = Math.sign(leftX || -1) === wantedX;
    return {
      shoulder:useLeft ? state.parts.armLeft : state.parts.armRight,
      restShoulder:useLeft ? restLeft : restRight,
      elbow:useLeft ? state.parts.elbowLeft : state.parts.elbowRight,
      restElbow:useLeft ? state.rest.elbowLeft : state.rest.elbowRight,
      hand:useLeft ? state.parts.handLeft : state.parts.handRight,
      // +1 means "this arm swings down with a positive z rotation".
      down:useLeft ? 1 : -1,
    };
  }

  // Poses one arm onto the weapon. `splay` is how far down from the T-pose the
  // shoulder hangs (past 0.5pi it crosses the chest, which is how the support
  // arm reaches the foregrip), `forward` swings the hanging arm toward +Z, and
  // `bend` folds the elbow up toward the weapon.
  function poseArm(arm, splay, forward, bend, blendZ, blendX, flare){
    if(arm.shoulder && arm.restShoulder){
      const targetZ = arm.restShoulder.rotation.z + splay * arm.down;
      const targetX = arm.restShoulder.rotation.x - forward;
      arm.shoulder.rotation.z += (targetZ - arm.shoulder.rotation.z) * blendZ;
      arm.shoulder.rotation.x += (targetX - arm.shoulder.rotation.x) * blendX;
    }
    if(arm.elbow && arm.restElbow){
      // Fold forward (Y), and flare the elbow slightly away from the ribs (Z)
      // so the forearm has somewhere to go — an elbow pinned to the side cannot
      // bring a hand to the centre line.
      const targetBend = arm.restElbow.rotation.y + bend * arm.down;
      const targetFlare = arm.restElbow.rotation.z - flare * arm.down;
      arm.elbow.rotation.y += (targetBend - arm.elbow.rotation.y) * blendZ;
      arm.elbow.rotation.z += (targetFlare - arm.elbow.rotation.z) * blendZ;
    }
  }

  // Leaning out from cover. It is the chest and shoulders that move, not the
  // hips: the feet stay planted, which is the difference between peeking around
  // a corner and stepping out from behind it.
  function applyLean(amount){
    const lean = clamp(finite(amount, 0), -1, 1);
    if(Math.abs(lean) < .002) return;
    // Sign check, because it was wrong: the character faces +Z, so its right is
    // -X. Rotating the torso's up vector about +Z sends it toward -X, which IS
    // the character's right — so leaning right is a POSITIVE z rotation. The
    // first version negated it and tipped the body the opposite way from the
    // camera, which is exactly as disorienting as it sounds.
    const torso = state.parts.torso, restTorso = state.rest.torso;
    const head = state.parts.head, restHead = state.rest.head;
    if(torso && restTorso) torso.rotation.z = restTorso.rotation.z + lean * .34;
    if(head && restHead) head.rotation.z = restHead.rotation.z + lean * .16;
    // The shoulders travel with the chest, or the arms stay behind the cover
    // the character just leaned out of.
    [['armLeft', 'elbowLeft'], ['armRight', 'elbowRight']].forEach(pair => {
      const shoulder = state.parts[pair[0]], rest = state.rest[pair[0]];
      if(shoulder && rest) shoulder.position.x = rest.position.x - lean * .06;
    });
  }

  function applyWeaponPose(weapon,layerWeight){
    if(!weapon) return;
    const carry = clamp(finite(weapon.carry, 0), 0, 1)*clamp(finite(layerWeight,1),0,1);
    if(carry <= .002) return;
    const aim = clamp(finite(weapon.aim, 0), 0, 1);
    const pitch = clamp(finite(weapon.pitch, 0), -1.2, 1.2);
    const side = finite(weapon.side, 1) >= 0 ? 1 : -1;
    const kind = String(weapon.kind || 'firearm');
    const oneHanded = weapon.twoHanded === false;
    // Firing punches the arms back for an instant, so a burst reads from outside
    // even before a real fire clip is bound. Reloading drops the support hand.
    const punch = .14*clamp(finite(weapon.fireAmount,weapon.firing?1:0),0,1);
    const reload = weapon.reloading ? 1 : 0;

    // Aiming LOCKS the pose; hip carry deliberately leaves most of the run swing
    // alive, which is the whole difference between "running with a weapon" and
    // "a statue sliding along the ground".
    const blendZ = carry * (.62 + .33 * aim);
    const blendX = carry * (.45 + .5 * aim);
    // Negative rotation.x swings a downward-hanging arm FORWARD (the torso lean
    // in applyLocomotion uses the same convention on an upward vector).
    const lift = -pitch * (.3 + .55 * aim);

    const trigger = armOnSide(side);
    const support = armOnSide(-side);

    // Unarmed is a guard plus a real punch, not an invisible rifle pose. The
    // striking arm opens only during the attack while the other fist protects
    // the torso. This fallback is used whenever no authored punch clip exists.
    if(kind === 'unarmed'){
      poseArm(trigger,Math.PI*.34,weapon.firing?1.42:.72,weapon.firing?.35:1.28,blendZ,blendX,.24);
      poseArm(support,Math.PI*.38,.66,1.34,blendZ,blendX,.2);
      return;
    }

    // A throwable is cocked beside the head until released. It must not borrow
    // the pistol's straight-arm pose just because both are one-handed.
    if(kind === 'thrown'){
      poseArm(trigger,Math.PI*.28,weapon.firing?.95:-.22,weapon.firing?.55:1.58,blendZ,blendX,.38);
      poseArm(support,Math.PI*.45,.18,1.08,blendZ*.7,blendX*.7,.12);
      return;
    }

    // Trigger arm: hangs near vertical, swings forward onto the grip, and folds
    // its elbow forward with the elbow held a little off the ribs.
    // Aiming pushes the weapon out to arm's length: the elbow opens as the arm
    // extends, rather than staying folded with the whole arm swung forward.
    poseArm(trigger,
      Math.PI * (.42 - .10 * aim),
      (.50 + .88 * aim) + lift - punch,
      1.25 - .35 * aim,
      blendZ, blendX, .30);

    // Support arm. A ONE-HANDED weapon leaves it completely alone: a pistol is
    // held in one hand and the other arm keeps swinging with the run, which is
    // what it does in life and what the player expects to see.
    if(!oneHanded){
      // Two hands on the weapon: if the view model reported where the foregrip
      // actually is, SOLVE for it so the hand lands on the weapon the way a
      // rigged GLB will. Angles alone get close and never quite arrive.
      const grip = !reload && weapon.supportTarget;
      const solved = grip ? solveSupportArm(support, weapon.supportTarget) : false;
      if(!solved){
        // No grip point, or a reload pulling the hand away: fall back to the
        // angle pose, swung past vertical so it crosses the chest.
        poseArm(support,
          Math.PI * (.52 - .04 * aim),
          ((.60 + .66 * aim) * (1 - .7 * reload)) + lift - punch,
          (1.50 + .20 * aim) * (1 - .75 * reload),
          blendZ, blendX, .16);
      }
    }

    // The chest turns slightly toward the weapon side, which is what stops the
    // pose reading as symmetrical.
    const torso = state.parts.torso, restTorso = state.rest.torso;
    if(torso && restTorso){
      const target = restTorso.rotation.y - .18 * carry * side;
      torso.rotation.y += (target - torso.rotation.y) * blendZ;
    }
  }

  function applyGesture(dt){
    const g = state.gesture;
    if(!g.held)g.elapsed += dt;
    if(g.loop&&g.elapsed>=g.duration)g.elapsed%=Math.max(.001,g.duration);
    const t = clamp(g.elapsed / g.duration, 0, 1);
    const swing = Math.sin(t * Math.PI); // 0 -> 1 -> 0 across the gesture
    resetAllParts();
    relaxArms(1);
    if(g.name === 'fire'){
      // Arms are solved onto the live weapon by applyWeaponPose() immediately
      // after this layer. Only add a small whole-body recoil here; borrowing
      // the generic Interact wave made an unrigged shooter raise one hand.
      const torso=state.parts.torso,restTorso=state.rest.torso;
      if(torso&&restTorso)torso.rotation.x=restTorso.rotation.x-swing*.08;
    } else if(g.name === 'jump'){
      const legL = state.parts.legLeft, restLL = state.rest.legLeft;
      const legR = state.parts.legRight, restLR = state.rest.legRight;
      if(legL && restLL) legL.rotation.x = restLL.rotation.x + swing * .55;
      if(legR && restLR) legR.rotation.x = restLR.rotation.x + swing * .55;
      const armL = state.parts.armLeft, restAL = state.rest.armLeft;
      const armR = state.parts.armRight, restAR = state.rest.armRight;
      if(armL && restAL) armL.rotation.x = restAL.rotation.x - swing * .35;
      if(armR && restAR) armR.rotation.x = restAR.rotation.x - swing * .35;
    } else if(g.name === 'land'){
      const compression=Math.sin(Math.min(1,t/.7)*Math.PI),hips=state.parts.hips,restHips=state.rest.hips;
      const torso=state.parts.torso,restTorso=state.rest.torso;
      if(hips&&restHips)hips.position.y=restHips.position.y-compression*.09;
      if(torso&&restTorso)torso.rotation.x=restTorso.rotation.x+compression*.24;
      ['legLeft','legRight'].forEach(key=>{const node=state.parts[key],rest=state.rest[key];if(node&&rest)node.rotation.x=rest.rotation.x+compression*.22;});
      ['kneeLeft','kneeRight'].forEach(key=>{const node=state.parts[key],rest=state.rest[key];if(node&&rest)node.rotation.x=rest.rotation.x-compression*.48;});
    } else if(g.name === 'kick'){
      const legR = state.parts.legRight, restLR = state.rest.legRight;
      if(legR && restLR) legR.rotation.x = restLR.rotation.x - swing * 1.1;
      const torso = state.parts.torso, restTorso = state.rest.torso;
      if(torso && restTorso) torso.rotation.x = restTorso.rotation.x + swing * .18;
    } else if(g.name === 'dive'){
      const dir = g.direction;
      const torso = state.parts.torso, restTorso = state.rest.torso;
      if(torso && restTorso) torso.rotation.z = restTorso.rotation.z + dir * swing * .9;
      const armL = state.parts.armLeft, restAL = state.rest.armLeft;
      const armR = state.parts.armRight, restAR = state.rest.armRight;
      if(armL && restAL) armL.rotation.z = restAL.rotation.z - dir * swing * .8;
      if(armR && restAR) armR.rotation.z = restAR.rotation.z - dir * swing * .8;
    } else if(g.name === 'celebrate'){
      const armL = state.parts.armLeft, restAL = state.rest.armLeft;
      const armR = state.parts.armRight, restAR = state.rest.armRight;
      if(armL && restAL) armL.rotation.x = restAL.rotation.x - swing * 2.4;
      if(armR && restAR) armR.rotation.x = restAR.rotation.x - swing * 2.4;
    } else if(g.name === 'defeat'){
      const head = state.parts.head, restHead = state.rest.head;
      const torso = state.parts.torso, restTorso = state.rest.torso;
      if(head && restHead) head.rotation.x = restHead.rotation.x + swing * .35;
      if(torso && restTorso) torso.rotation.x = restTorso.rotation.x + swing * .2;
    } else { // interact / generic one-shot
      const armR = state.parts.armRight, restAR = state.rest.armRight;
      if(armR && restAR) armR.rotation.x = restAR.rotation.x - swing * 1.4;
    }
    if(t >= 1 && g.holdLastFrame){
      g.elapsed=g.duration;
      g.held=true;
      return;
    }
    if(t >= 1){
      const done = g.onDone;
      state.gesture = null;
      resetAllParts();
      if(typeof done === 'function') done(g.name);
    }
  }

  // desired: local-space target velocity {x (lateral, +right), z (forward)}
  // in m/s, matching the GLB controller's update(desired, dt) contract.
  function update(desired, dt){
    if(!state.bound) return;
    const h = Math.max(.0001, finite(dt, .016));
    const want = desired || {x:0, z:0};
    const k = 1 - Math.exp(-state.responsiveness * h);
    state.velocity.x += (finite(want.x, 0) - state.velocity.x) * k;
    state.velocity.z += (finite(want.z, 0) - state.velocity.z) * k;
    state.predicted.x = state.velocity.x + (finite(want.x, 0) - state.velocity.x) * state.predictionTime * state.responsiveness;
    state.predicted.z = state.velocity.z + (finite(want.z, 0) - state.velocity.z) * state.predictionTime * state.responsiveness;
    const blendRuntime=window.LK_RUNTIME_CHARACTER_ANIMATION_BLEND;
    if(state.gesture&&blendRuntime&&blendRuntime.shouldInterrupt&&blendRuntime.shouldInterrupt(state.gesture.slot||state.gesture.name,want))stopAction();
    const speed = Math.sqrt(state.predicted.x * state.predicted.x + state.predicted.z * state.predicted.z);
    if(speed < .08)applyIdle(h);
    else {
      const sprinting = speed > state.walkSpeed * 1.05;
      const speedRatio = clamp(speed / Math.max(.1, state.runSpeed), 0, 1);
      applyLocomotion(speedRatio, sprinting, h);
    }
    if(state.gesture){
      const basePose=capturePose(),gesture=state.gesture;
      applyGesture(h);
      const progress=clamp(gesture.elapsed/Math.max(.001,gesture.duration),0,1);
      const blend=blendRuntime&&blendRuntime.profile?blendRuntime.profile({slot:gesture.slot||gesture.name,progress,desired:want,loop:gesture.loop,held:gesture.held,releaseStart:gesture.releaseStart,releaseEnd:gesture.releaseEnd,locomotionFloor:gesture.locomotionFloor}):{actionWeight:1,locomotionWeight:0,progress,category:'generic'};
      blendPose(basePose,blend.actionWeight);
      state.gestureBlend=state.gesture?blend:null;
    } else state.gestureBlend=null;
    applyStairPose(want,h);
    const weaponLayer=state.gestureBlend&&state.gestureBlend.category!=='upper-body'&&state.gestureBlend.category!=='generic'
      ?state.gestureBlend.locomotionWeight:1;
    applyWeaponPose(want.weapon,weaponLayer);
    applyLean(want.lean);
  }

  function playAction(clipName, actionOptions){
    if(!state.bound) return false;
    const o = actionOptions || {};
    const slot=normalizeName(o.slot||clipName);
    const name = slot.indexOf('fire')===0 ? 'fire' : (slot.indexOf('land')>=0?'land':resolveGesture(clipName));
    const baseDuration=clamp(finite(o.duration, name === 'jump' ? .45 : .7), .15, 2.5),rate=Math.max(.05,Math.abs(finite(o.speedScale,1)));
    const fitted=o.fitDuration==null?baseDuration/rate:Math.min(baseDuration/rate,Math.max(.15,finite(o.fitDuration,baseDuration)));
    state.gesture = {
      name, slot:slot||name, elapsed:0,
      duration:clamp(fitted,.15,2.5),
      direction:/left/i.test(String(clipName || '')) ? -1 : 1,
      onDone:o.onDone,
      releaseStart:o.releaseStart,
      releaseEnd:o.releaseEnd,
      locomotionFloor:o.locomotionFloor,
      loop:o.loop===true,
      holdLastFrame:o.holdLastFrame===true,
      held:false,
    };
    return true;
  }
  function stopAction(){
    if(!state.gesture) return;
    const done = state.gesture.onDone;
    state.gesture = null;
    state.gestureBlend = null;
    resetAllParts();
    if(typeof done === 'function') done();
  }
  function isActionPlaying(){ return !!state.gesture; }
  function holdActionAtProgress(progress){
    if(!state.gesture)return false;
    state.gesture.elapsed=state.gesture.duration*clamp(finite(progress,.3),0,.94);
    state.gesture.held=true;
    applyGesture(0);
    return true;
  }
  function resumeAction(){
    if(!state.gesture)return false;
    state.gesture.held=false;
    return true;
  }
  function actionProgress(){return state.gesture?clamp(state.gesture.elapsed/Math.max(.001,state.gesture.duration),0,1):0;}
  function configure(patch){
    const p = patch || {};
    if(p.walkSpeed != null) state.walkSpeed = Math.max(.1, finite(p.walkSpeed, state.walkSpeed));
    if(p.runSpeed != null) state.runSpeed = Math.max(.2, finite(p.runSpeed, state.runSpeed));
    if(p.responsiveness != null) state.responsiveness = Math.max(.5, finite(p.responsiveness, state.responsiveness));
    if(p.predictionTime != null) state.predictionTime = Math.max(0, finite(p.predictionTime, state.predictionTime));
    if(p.stepPoseStrength != null) state.stepPoseStrength = clamp(finite(p.stepPoseStrength,state.stepPoseStrength),0,2);
  }
  function dispose(){
    if(state.bound) resetAllParts();
    state.owner = null; state.parts = {}; state.rest = {}; state.bound = false;
    state.gesture = null; state.phase = 0; state.idlePhase = 0;
    state.gestureBlend = null;
    state.stair = {amount:0,side:1,rise:0};
    state.velocity = {x:0, z:0}; state.predicted = {x:0, z:0};
  }

  return Object.freeze({
    bind, update, playAction, stopAction, isActionPlaying, holdActionAtProgress, resumeAction, actionProgress, configure, dispose,
    isBound:() => state.bound,
    availableClips:() => Object.keys(PART_IDS).filter(key => state.parts[key]),
    debugState:() => ({velocity:Object.assign({}, state.velocity), gesture:state.gesture ? state.gesture.name : null,gestureBlend:state.gestureBlend?Object.assign({},state.gestureBlend):null,stair:Object.assign({},state.stair)}),
  });
}

window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION = Object.freeze({createController, resolveGesture, PART_IDS, T_POSE, sceneElements, createVisual});
})();
