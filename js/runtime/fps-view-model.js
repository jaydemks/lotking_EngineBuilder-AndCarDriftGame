/* =========================================================
   LOT KING — First Person weapon view model

   The visible weapon: a procedural first-person model built from primitives,
   held in front of the camera, with aim-down-sights, sway, bob, recoil and a
   muzzle flash.

   It is deliberately NOT parented to the camera. lot-king.js owns that camera
   and rewrites its transform every frame; a child would inherit whatever the
   camera did that frame including shake. Instead the model is an ordinary
   scene object placed from the rig's own eye transform, which keeps it stable
   and lets it be hidden or removed without touching the camera path.

   Removing this script removes the weapon and nothing else.
   ========================================================= */
(function(){
'use strict';

const FLASH_SECONDS = .045;

// Shapes per weapon preset. Lengths are metres at view-model scale.
const PROFILES = {
  rifle:{barrel:.42, barrelRadius:.017, receiver:[.075, .085, .30], magazine:[.05, .17, .075], stock:true, scope:false, foregrip:true},
  marksman:{barrel:.56, barrelRadius:.019, receiver:[.075, .09, .34], magazine:[.045, .12, .07], stock:true, scope:true, foregrip:false},
  shotgun:{barrel:.50, barrelRadius:.024, receiver:[.08, .095, .28], magazine:null, stock:true, scope:false, foregrip:true},
  pistol:{barrel:.10, barrelRadius:.013, receiver:[.05, .075, .17], magazine:[.035, .10, .05], stock:false, scope:false, foregrip:false},
  smg:{barrel:.20, barrelRadius:.014, receiver:[.06, .08, .22], magazine:[.04, .16, .06], stock:true, scope:false, foregrip:true},
  // A blade is a grip and an edge: no barrel, no magazine, no sights.
  blade:{barrel:.26, barrelRadius:.008, receiver:[.03, .05, .09], magazine:null, stock:false, scope:false, foregrip:false, blade:true},
  // A thrown object has no barrel at all; the body IS the whole model.
  thrown:{barrel:.02, barrelRadius:.05, receiver:[.09, .11, .09], magazine:null, stock:false, scope:false, foregrip:false, ball:true},
};

// Fists have no model. Kept as a profile so every other path can stay identical
// rather than branching on "is there a weapon" in five places.
PROFILES.fists = {barrel:0, barrelRadius:.01, receiver:[.01, .01, .01], magazine:null, stock:false, scope:false, foregrip:false, empty:true};

function profileFor(weapon){
  const preset = weapon && weapon.preset;
  if(preset && PROFILES[preset]) return PROFILES[preset];
  // Kind wins over stats: a knife is not a short rifle.
  if(weapon && weapon.kind === 'unarmed') return PROFILES.fists;
  if(weapon && weapon.kind === 'melee') return PROFILES.blade;
  if(weapon && weapon.kind === 'thrown') return PROFILES.thrown;
  // Unknown or fully custom loadouts: infer from behaviour rather than name.
  if(weapon && weapon.pellets > 1) return PROFILES.shotgun;
  if(weapon && weapon.range > 200) return PROFILES.marksman;
  if(weapon && weapon.fireRate > 12) return PROFILES.smg;
  if(weapon && weapon.magazine <= 18 && weapon.range < 90) return PROFILES.pistol;
  return PROFILES.rifle;
}

function damp(rate, dt){ return 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt)); }
function clamp01(value){ return Math.max(0, Math.min(1, Number(value) || 0)); }
function blendAngle(from, to, amount){
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + delta * clamp01(amount);
}

// Keeps a world-space weapon on an animated trigger hand without parenting it
// below the skeleton. Parenting would inherit arbitrary import scale; copying
// the world pose does not. The first valid frame calibrates the hand's authored
// bone axes against the already-correct aim orientation, then later frames keep
// that offset while following every arm/hand animation (including recoil).
function createTriggerHandFollower(THREE){
  if(!THREE)return {reset(){},apply(){return false;}};
  const handPosition=new THREE.Vector3(),handQuaternion=new THREE.Quaternion(),alignment=new THREE.Quaternion();
  let bone=null,ready=false;
  return {
    reset(){bone=null;ready=false;alignment.identity();},
    apply(weapon,hand,desiredQuaternion,followRotation){
      if(!weapon||!hand||!hand.parent||typeof hand.getWorldPosition!=='function')return false;
      hand.getWorldPosition(handPosition);weapon.position.copy(handPosition);
      if(followRotation!==false&&typeof hand.getWorldQuaternion==='function'){
        hand.getWorldQuaternion(handQuaternion);
        if(!ready||bone!==hand){
          alignment.copy(handQuaternion).invert().multiply(desiredQuaternion).normalize();
          bone=hand;ready=true;
        }
        weapon.quaternion.copy(handQuaternion).multiply(alignment).normalize();
      }else{
        weapon.quaternion.copy(desiredQuaternion);
        bone=hand;ready=false;
      }
      return true;
    },
  };
}

// Never saved, exported, picked or shot at — but, unlike an editor helper, it
// must render during gameplay. `runtimeVisual` is what separates the two; the
// weapon is invisible in play without it.
function markRuntimeOnly(node){
  node.userData.nonExportable = true;
  node.userData.runtimeVisual = true;
  return node;
}

// Skin tone is a view-model concern, not an appearance one: these are the
// player's OWN arms, which the third-person body never renders.
const SKIN = 0xc79a76;
const SLEEVE = 0x39414b;

function build(THREE, profile, options){
  const opts = options || {};
  const world = opts.world === true;          // a dropped weapon lying in the level
  const group = markRuntimeOnly(new THREE.Group());
  group.name = world ? 'Weapon Pickup' : 'First Person Weapon';

  // Drawn on top of the world so the barrel cannot poke through a wall. A
  // proper solution is a second camera pass; this is the cheap equivalent.
  // A dropped weapon is an ordinary scene object and keeps normal depth.
  const depthTest = world;
  const metal = new THREE.MeshStandardMaterial({color:0x2a2f37, roughness:.55, metalness:.75, depthTest});
  const polymer = new THREE.MeshStandardMaterial({color:0x1d2127, roughness:.85, metalness:.05, depthTest});
  const accent = new THREE.MeshStandardMaterial({color:0x3b424c, roughness:.6, metalness:.4, depthTest});
  const skin = new THREE.MeshStandardMaterial({color:SKIN, roughness:.82, metalness:0, depthTest});
  const sleeve = new THREE.MeshStandardMaterial({color:SLEEVE, roughness:.9, metalness:.03, depthTest});

  function part(geometry, material, position, rotation, parent){
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(position[0], position[1], position[2]);
    if(rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = world ? 0 : 900;
    (parent || group).add(markRuntimeOnly(mesh));
    return mesh;
  }

  const r = profile.receiver;
  // Fists: nothing in hand at all. The arms are the weapon.
  if(profile.empty){
    group.userData.materials = [metal, polymer, accent, skin, sleeve];
    group.userData.flash = null;
    return group;
  }
  part(new THREE.BoxGeometry(r[0], r[1], r[2]), polymer, [0, 0, -r[2] / 2]);
  part(new THREE.CylinderGeometry(profile.barrelRadius, profile.barrelRadius, profile.barrel, 10), metal,
    [0, .012, -r[2] - profile.barrel / 2], [Math.PI / 2, 0, 0]);
  part(new THREE.CylinderGeometry(profile.barrelRadius + .012, profile.barrelRadius + .012, .07, 10), accent,
    [0, .012, -r[2] - profile.barrel + .03], [Math.PI / 2, 0, 0]);
  if(profile.foregrip) part(new THREE.BoxGeometry(.05, .07, .12), polymer, [0, -.06, -r[2] - .12]);
  if(profile.magazine) part(new THREE.BoxGeometry(profile.magazine[0], profile.magazine[1], profile.magazine[2]), accent,
    [0, -profile.magazine[1] / 2 - .03, -r[2] * .55], [.16, 0, 0]);
  if(profile.stock){
    part(new THREE.BoxGeometry(.055, .07, .18), polymer, [0, -.012, .09]);
    part(new THREE.BoxGeometry(.05, .105, .04), polymer, [0, -.02, .18]);
  }
  // Grip, angled like a hand would hold it.
  part(new THREE.BoxGeometry(.048, .13, .06), polymer, [0, -.085, -r[2] * .18], [.32, 0, 0]);
  // Iron sights, or a scope for the marksman profile.
  if(profile.scope){
    part(new THREE.CylinderGeometry(.028, .028, .20, 12), metal, [0, .075, -r[2] * .55], [Math.PI / 2, 0, 0]);
    part(new THREE.CylinderGeometry(.034, .034, .03, 12), accent, [0, .075, -r[2] * .55 - .10], [Math.PI / 2, 0, 0]);
  } else {
    part(new THREE.BoxGeometry(.008, .026, .008), metal, [0, .06, -r[2] + .03]);
    part(new THREE.BoxGeometry(.03, .022, .008), metal, [0, .058, -.03]);
  }

  // ---- arms ------------------------------------------------------------
  // A weapon floating with no hands is the single most obvious tell that a
  // first-person rig is unfinished, so the model carries its own arms. They are
  // children of the weapon group: the trigger hand is welded to the grip and the
  // support hand to the foregrip, which means every sway, kick and ADS blend
  // moves hands and weapon together for free. Each arm keeps a pivot so the
  // support hand can be animated away from the weapon during a reload.
  function buildArm(side, gripPosition, gripRotation){
    const pivot = markRuntimeOnly(new THREE.Group());
    pivot.position.set(gripPosition[0], gripPosition[1], gripPosition[2]);
    if(gripRotation) pivot.rotation.set(gripRotation[0], gripRotation[1], gripRotation[2]);
    group.add(pivot);
    // Hand at the pivot, forearm and upper arm running back toward the shoulder.
    part(new THREE.BoxGeometry(.062, .085, .105), skin, [0, 0, 0], null, pivot);
    part(new THREE.CylinderGeometry(.038, .046, .26, 10), skin,
      [side * .035, -.045, .155], [1.28, 0, side * .12], pivot);
    part(new THREE.CylinderGeometry(.05, .062, .30, 10), sleeve,
      [side * .085, -.10, .40], [1.16, 0, side * .22], pivot);
    return pivot;
  }
  let triggerArm = null, supportArm = null;
  if(!world && opts.arms !== false){
    triggerArm = buildArm(1, [.012, -.085, -r[2] * .18], [.32, 0, 0]);
    supportArm = buildArm(-1, profile.foregrip
      ? [-.012, -.062, -r[2] - .12]
      : [-.012, -.05, -r[2] * .78], [.22, 0, 0]);
  }
  // Where the support hand belongs on this weapon, in the model's own space.
  // Published so the character rig can SOLVE for it rather than approximate it
  // with angles — the same point a rigged GLB would attach its hand to.
  group.userData.supportGrip = profile.foregrip
    ? [0, -.06, -r[2] - .12]
    : [0, -.05, -r[2] * .78];
  group.userData.triggerArm = triggerArm;
  group.userData.supportArm = supportArm;
  group.userData.supportRest = supportArm ? supportArm.position.clone() : null;

  // Muzzle flash: unlit, hidden until a shot.
  // The flash TESTS depth even though the weapon does not. The weapon draws
  // over the world without testing, but it still writes depth — so a flash that
  // tests against it is correctly hidden by the barrel and the hands in front of
  // it, and still passes over the world beyond the muzzle. Skipping the test
  // put the flare on top of everything, including the weapon it comes out of.
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(.055, .16, 8),
    new THREE.MeshBasicMaterial({color:0xffd27a, transparent:true, opacity:.95, depthTest:true, depthWrite:false, toneMapped:false})
  );
  flash.position.set(0, .012, -r[2] - profile.barrel - .06);
  flash.rotation.set(-Math.PI / 2, 0, 0);
  flash.frustumCulled = false;
  flash.renderOrder = 901;
  flash.visible = false;
  group.add(markRuntimeOnly(flash));

  group.userData.flash = flash;
  group.userData.materials = [metal, polymer, accent, skin, sleeve, flash.material];
  return group;
}

// The same geometry without arms and with ordinary depth, used by the item
// system for a weapon lying on the ground or thrown across the level.
function buildWorldModel(THREE, weapon){
  if(!THREE) return null;
  const model = build(THREE, profileFor(weapon), {world:true, arms:false});
  model.rotation.set(0, 0, Math.PI / 2 * .12);
  return model;
}

// The node the weapon rides in third person. It does NOT have to be a bone:
// the procedural placeholder body has no skeleton at all, only named joints, and
// requiring `isBone` was why the weapon hung off the hip and ignored the arm
// swing on every character without an imported rig.
//
// Naming conventions vary wildly (mixamorig:RightHand, hand_r, Hand.R,
// 'Hand Skin Right'), so the test is structural rather than one regex: the name
// mentions a hand, and it is the right one.
function isRightHandName(value){
  const name = String(value || '').toLowerCase();
  if(name.indexOf('hand') < 0) return false;
  if(name.indexOf('left') >= 0 || /(^|[^a-z])l([^a-z]|$)/.test(name)) return false;
  return name.indexOf('right') >= 0 || /(^|[^a-z])r([^a-z]|$)/.test(name);
}

function create(GAME){
  const THREE = window.THREE;
  let model = null;
  let profileKey = '';
  let flashTimer = 0;
  // The same weapon seen from outside: a second, ordinary-depth model carried by
  // the character. It exists only while the shoulder camera is active.
  let held = null;
  let heldKey = '';
  let heldHost = null;
  let heldBone = null;
  let heldSocketBone = null;
  const heldHandFollower = createTriggerHandFollower(THREE);
  let visualComponent = null;
  const visualOwner = {};
  const state = {swayX:0, swayY:0, kick:0, ads:0, bob:0, reload:0, lower:0};

  const offset = THREE ? new THREE.Vector3() : null;
  const up = THREE ? new THREE.Vector3() : null;
  const handPoint = THREE ? new THREE.Vector3() : null;
  const heldRight = THREE ? new THREE.Vector3() : null;
  const heldForward = THREE ? new THREE.Vector3() : null;
  const heldEuler = THREE ? new THREE.Euler(0, 0, 0, 'YXZ') : null;
  const heldDesiredQuaternion = THREE ? new THREE.Quaternion() : null;
  const gripPoint = THREE ? new THREE.Vector3() : null;

  function scene(){ return GAME && GAME.core && GAME.core.scene || null; }
  function activeRig(){
    const api = window.LK_RUNTIME_FIRST_PERSON;
    return api && api.activeController ? api.activeController(GAME, 1) : null;
  }
  function activePawn(){
    const api = window.LK_RUNTIME_FIRST_PERSON;
    return api && api.activePawn ? api.activePawn(GAME, 1) : null;
  }

  function ensure(weapon){
    const profile = profileFor(weapon);
    const key = (weapon && weapon.name || '') + ':' + (weapon && weapon.preset || '') + ':' + profile.barrel;
    if(model && profileKey === key) return model;
    disposeModel();
    model = build(THREE, profile);
    profileKey = key;
    const target = scene();
    if(target) target.add(model);
    return model;
  }

  // Tears down the MODEL only. `ensure()` calls this on every weapon change, so
  // it must not touch anything that belongs to the view model as a whole.
  function disposeModel(){
    if(!model) return;
    if(model.parent) model.parent.remove(model);
    model.traverse(node => { if(node.geometry) node.geometry.dispose(); });
    (model.userData.materials || []).forEach(material => material.dispose());
    model = null;
    profileKey = '';
  }
  // The public teardown: the whole view model goes away, listener included. The
  // listener used to outlive it, so a reloaded level left the previous view model
  // still reacting to every shot in the game.
  function dispose(){
    if(window.removeEventListener) window.removeEventListener('lk-pawn-event', onPawnEvent);
    releaseVisualComponent();
    disposeModel();
    disposeHeld();
    return true;
  }

  function releaseVisualComponent(){
    const component = visualComponent;
    visualComponent = null;
    if(component && typeof component.releaseVisual === 'function') component.releaseVisual(visualOwner);
  }
  function claimVisualComponent(component){
    if(component === visualComponent) return true;
    releaseVisualComponent();
    visualComponent = component || null;
    if(!component || typeof component.claimVisual !== 'function') return false;
    const claimed = component.claimVisual(visualOwner, () => {
      visualComponent = null;
      disposeModel();
    });
    if(!claimed) visualComponent = null;
    return claimed;
  }

  // --- third person: the weapon in the character's hands -------------------

  // Three short coloured axes at the socket, so the offset and rotation can be
  // placed by eye instead of by arithmetic. Editor-facing: it is a runtime
  // visual, never saved, and off unless the author asks for it.
  let socketHelper = null;
  function updateSocketHelper(socket, weapon){
    if(!socket.showHelper){
      if(socketHelper) socketHelper.visible = false;
      return;
    }
    if(!socketHelper){
      socketHelper = new THREE.Group();
      socketHelper.userData.nonExportable = true;
      socketHelper.userData.runtimeVisual = true;
      [[0xff5555, [.22, 0, 0]], [0x55ff88, [0, .22, 0]], [0x6699ff, [0, 0, .22]]].forEach(axis => {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(Math.max(.012, Math.abs(axis[1][0])), Math.max(.012, Math.abs(axis[1][1])), Math.max(.012, Math.abs(axis[1][2]))),
          new THREE.MeshBasicMaterial({color:axis[0], depthTest:false, toneMapped:false}));
        bar.position.set(axis[1][0] / 2, axis[1][1] / 2, axis[1][2] / 2);
        bar.renderOrder = 998;
        bar.frustumCulled = false;
        socketHelper.add(bar);
      });
      const target = scene();
      if(target) target.add(socketHelper);
    }
    socketHelper.visible = true;
    socketHelper.position.copy(weapon.position);
    socketHelper.quaternion.copy(weapon.quaternion);
  }

  function findNamedBone(owner, name, side){
    let found = null;
    const wanted = String(name || '').toLowerCase();
    if(owner && owner.traverse){
      owner.traverse(node => {
        if(found || !node || !node.name) return;
        if(String(node.name).toLowerCase() === wanted) found = node;
      });
    }
    return found || findHand(owner, side);
  }

  // Picking the hand by NAME alone is wrong, and the placeholder body proves it:
  // its `hand_skin_right` joint sits at local +X, which under this engine's
  // convention (+Z forward, so right is -X) is the character's LEFT side. The
  // name describes the model author's idea of right, not the runtime's.
  //
  // So the side is decided GEOMETRICALLY: collect every hand-ish node, convert
  // it into the owner's local space, and take the one on the requested side.
  // That is correct for any rig, and it is also what makes the shoulder swap a
  // one-line change instead of a second lookup table.
  function findHands(owner){
    const found = [];
    if(!owner || !owner.traverse) return found;
    owner.updateMatrixWorld(true);
    owner.traverse(node => {
      if(!node || node === owner) return;
      const label = node.name || (node.userData && node.userData.logicElementSceneId) || '';
      if(String(label).toLowerCase().indexOf('hand') < 0) return;
      node.getWorldPosition(handPoint);
      owner.worldToLocal(handPoint);
      found.push({node, localX:handPoint.x, bone:!!(node.isBone || node.type === 'Bone')});
    });
    return found;
  }
  // side: +1 for the character's right (local -X), -1 for its left.
  function findHand(owner, side){
    const hands = findHands(owner);
    if(!hands.length) return null;
    const wanted = side >= 0 ? -1 : 1;         // engine right is local -X
    const onSide = hands.filter(hand => Math.sign(hand.localX || 0) === wanted);
    const pool = onSide.length ? onSide : hands;
    // A real bone wins over a plain joint; otherwise take the outermost one,
    // which is the hand rather than a forearm that happens to be named for it.
    const bones = pool.filter(hand => hand.bone);
    const best = (bones.length ? bones : pool).reduce(
      (a, b) => (Math.abs(b.localX) > Math.abs(a.localX) ? b : a));
    return best ? best.node : null;
  }
  function belongsToOwner(node,owner){
    let current=node;
    while(current){if(current===owner)return true;current=current.parent;}
    return false;
  }

  function disposeHeld(){
    heldHandFollower.reset();
    heldBone = null;
    heldSocketBone = null;
    heldHost = null;
    if(!held) return;
    if(held.parent) held.parent.remove(held);
    held.traverse(node => { if(node.geometry) node.geometry.dispose(); });
    (held.userData.materials || []).forEach(material => material.dispose());
    held = null;
    heldKey = '';
    heldHost = null;
  }

  function ensureHeld(weapon){
    const key = (weapon && weapon.name || '') + ':' + (weapon && weapon.preset || '');
    if(held && heldKey === key) return held;
    disposeHeld();
    held = buildWorldModel(THREE, weapon);
    if(!held) return null;
    held.name = 'Carried Weapon';
    // buildWorldModel tilts the model for a weapon lying on the floor; in hands
    // it is driven entirely from the view angles below.
    held.rotation.set(0, 0, 0);
    heldKey = key;
    const target = scene();
    if(target) target.add(held);
    return held;
  }

  // The weapon is a SCENE object, not a child of the hand bone.
  //
  // Parenting it to the bone looks like the obvious choice and is a trap: the
  // grip axis of a hand bone is whatever the rig author decided, so a fixed
  // local rotation is right for exactly one model and points the barrel
  // backwards or sideways for every other one — and the bone's own scale is
  // inherited, so a character imported at 0.01 carries a toy or a skyscraper.
  //
  // Instead we copy the hand's world pose and retain one calibrated rotation
  // offset. This follows the real trigger hand during Fire/Reload clips without
  // inheriting skeleton scale, while the calibration absorbs Mixamo/Blender GLB
  // differences in bone axes.
  function updateHeld(rig, pawn, dt){
    if(!rig.armed()||(rig.state&&rig.state.weaponHolstered===true)){
      if(held) held.visible = false;
      if(rig.state) rig.state.supportGrip = null;
      return false;
    }
    const owner = pawn && pawn.owner;
    if(!owner){ if(held) held.visible = false; return false; }
    const weapon = ensureHeld(rig.config().weapon);
    if(!weapon) return false;
    weapon.visible = true;

    const socket = rig.config().weaponSocket || {bone:'', offset:[0, 0, 0], rotation:[0, 0, 0], scale:1, showHelper:false};
    const side = rig.weaponSide ? rig.weaponSide() : 1;
    const key = socket.bone + '#' + side;
    // Main Mesh can finish loading after Play already started, or be replaced by
    // Pawn Studio without changing the Pawn owner. Re-resolve a missing/stale
    // hand instead of keeping the body fallback forever.
    if(heldHost !== owner || heldSocketBone !== key || !heldBone || !belongsToOwner(heldBone,owner)){
      heldHost = owner;
      heldSocketBone = key;
      heldHandFollower.reset();
      heldBone = socket.bone ? findNamedBone(owner, socket.bone, side) : findHand(owner, side);
    }
    // Carry follows the Character. Only a shot fully commits the weapon to the
    // crosshair; ADS contributes a smaller preview so ordinary walking — notably
    // walking toward the camera — cannot leave the weapon and arms facing away
    // from the body's travel direction.
    const angles = rig.aimAngles ? rig.aimAngles() : rig.viewAngles();
    const aim = rig.state && rig.state.ads != null ? clamp01(rig.state.ads) : 0;
    const sinceShot = Number(rig.state && rig.state.sinceShot);
    const fireAmount = clamp01(1 - (Number.isFinite(sinceShot) ? sinceShot : 9) / .14);
    const crosshairBlend = Math.max(fireAmount, aim * .35);
    const bodyYaw = Number(owner.rotation && owner.rotation.y);
    const carryYaw = Number.isFinite(bodyYaw) ? bodyYaw : angles.yaw;
    // Pawn Studio composes the held model as:
    //   body/aim frame × authored trigger wrist × weapon forward half-turn.
    // Play previously skipped the middle term, so rotating a hand in the Studio
    // rotated the preview weapon but was calibrated away from the real one.
    // The negative pitch plus final half-turn is algebraically identical to the
    // old no-authoring orientation, keeping existing unauthored weapons stable.
    heldEuler.set(-angles.pitch * crosshairBlend, blendAngle(carryYaw, angles.yaw, crosshairBlend), 0, 'YXZ');
    weapon.quaternion.setFromEuler(heldEuler);
    const gripRotation=rig.state&&Array.isArray(rig.state.weaponGripRotation)?rig.state.weaponGripRotation:null;
    if(gripRotation){
      weapon.rotateX(Number(gripRotation[0])||0);
      weapon.rotateY(Number(gripRotation[1])||0);
      weapon.rotateZ(Number(gripRotation[2])||0);
    }
    weapon.rotateY(Math.PI);
    heldDesiredQuaternion.copy(weapon.quaternion);
    const followsTriggerHand = heldHandFollower.apply(weapon, heldBone, heldDesiredQuaternion, socket.followHandRotation !== false);
    if(socket.rotation[0] || socket.rotation[1] || socket.rotation[2]){
      weapon.rotateX(socket.rotation[0]);
      weapon.rotateY(socket.rotation[1]);
      weapon.rotateZ(socket.rotation[2]);
    }
    weapon.scale.setScalar(socket.scale);

    const fullBodyEye = rig.firstPersonView && rig.firstPersonView()
      && !(rig.armsPresentation && rig.armsPresentation());
    if(followsTriggerHand){
      // Position and orientation already come from the animated trigger hand.
      // This is also the full-body first-person path: it keeps one Character and
      // one weapon instead of creating an eye-anchored duplicate.
    } else if(fullBodyEye && rig.eyeTransform){
      // Unified body view: keep the TPS character and its one world weapon,
      // but drive that weapon from the eye sight-line. Following the animated
      // hand here left a third-person hip pose under the camera, which made the
      // advertised full-body first person indistinguishable from a broken TPS
      // close-up. The body locomotion receives the resulting grip target below
      // and extends its real arms onto this same weapon.
      const eyeView = rig.eyeTransform();
      if(eyeView){
        heldForward.set(0, 0, -1).applyQuaternion(weapon.quaternion);
        heldRight.set(1, 0, 0).applyQuaternion(weapon.quaternion);
        weapon.position.copy(eyeView.position)
          .addScaledVector(heldForward, .48 - .05 * aim)
          .addScaledVector(heldRight, (.18 - .09 * aim) * side);
        weapon.position.y -= .2 - .04 * aim;
      }
    } else {
      // No rig to follow: carry it at the right hand's resting height. `right`
      // and `forward` come from the same quaternion, so the offsets mean the
      // same thing whichever way the character faces.
      heldRight.set(1, 0, 0).applyQuaternion(weapon.quaternion);
      heldForward.set(0, 0, -1).applyQuaternion(weapon.quaternion);
      weapon.position.copy(owner.position)
        .addScaledVector(heldRight, (.21 - .16 * aim) * side)
        .addScaledVector(heldForward, .18);
      weapon.position.y += 1.24 + (rig.state ? (Number(rig.state.eyeOffset) || 0) : 0);
    }
    // The authored nudge is applied in the weapon's OWN space, so an offset
    // tuned at one heading stays correct at every other one.
    if(socket.offset[0] || socket.offset[1] || socket.offset[2]){
      heldRight.set(socket.offset[0], socket.offset[1], socket.offset[2]).applyQuaternion(weapon.quaternion);
      weapon.position.add(heldRight);
    }
    updateSocketHelper(socket, weapon);

    // Report the foregrip in world space so the character's support arm can be
    // solved onto it. One frame behind the weapon, which is invisible.
    const grip = weapon.userData.supportGrip;
    if(grip && rig.state){
      gripPoint.set(grip[0], grip[1], grip[2]).applyQuaternion(weapon.quaternion).add(weapon.position);
      rig.state.supportGrip = rig.state.supportGrip || {x:0, y:0, z:0};
      rig.state.supportGrip.x = gripPoint.x;
      rig.state.supportGrip.y = gripPoint.y;
      rig.state.supportGrip.z = gripPoint.z;
    }

    // The muzzle flash belongs to whichever model is on screen.
    const flash = weapon.userData.flash;
    if(flash){
      flash.visible = flashTimer > 0;
      if(flash.visible) flash.material.opacity = Math.max(0, flashTimer / FLASH_SECONDS) * .95;
    }
    return true;
  }

  // Called every frame after the camera has been placed.
  function update(dt){
    const rig = activeRig();
    const editing = GAME && GAME.state && GAME.state.editorActive && !GAME.state.editorPreview;
    // No weapon in hand: there is nothing to hold. The rig itself is still
    // live, so the HUD and the camera are unaffected.
    if(!THREE || !rig || editing || rig.armed() === false || (rig.state&&rig.state.weaponHolstered===true)){
      if(rig && (!rig.firstPersonView || !rig.firstPersonView() || rig.armed() === false)){
        releaseVisualComponent();
        disposeModel();
      }
      if(model) model.visible = false;
      if(held) held.visible = false;
      return false;
    }
    // Third person draws the real weapon on the Character. The optional arms
    // visual is released rather than retained off-screen.
    if(!rig.firstPersonView()){
      releaseVisualComponent();
      disposeModel();
      const h = Math.max(.0001, Math.min(.1, Number(dt) || .016));
      if(flashTimer > 0) flashTimer -= h;
      return updateHeld(rig, activePawn(), h);
    }
    // The eye view can be presented two ways, and only one of them wants this
    // model. With `presentation: 'body'` the player sees their own character from
    // its eyes: building a second arms rig and a second weapon mesh in front of
    // the camera is pure cost - a duplicated weapon and a large frame-rate drop -
    // so the held weapon on the body stays and this model is left off.
    const pawn = activePawn();
    const component = pawn && pawn.firstPersonViewPawn;
    const arms = rig.armsPresentation
      ? rig.armsPresentation()
      : !!((rig.config() || {}).viewPawn
        ? (rig.config().viewPawn.enabled && rig.config().viewPawn.kind === 'first-person-arms')
        : (rig.config() || {}).presentation === 'arms');
    if(!arms){
      // Body mode has exactly one character rig. Releasing the autonomous view
      // Pawn tears down GPU resources immediately instead of merely hiding a
      // second rig that can still cost memory and reappear after a level load.
      releaseVisualComponent();
      disposeModel();
      const step = Math.max(.0001, Math.min(.1, Number(dt) || .016));
      if(flashTimer > 0) flashTimer -= step;
      return updateHeld(rig, pawn, step);
    }
    claimVisualComponent(component);
    if(held) held.visible = false;
    const transform = rig.cameraTransform();
    if(!transform){ if(model) model.visible = false; return false; }

    const weapon = rig.config().weapon;
    ensure(weapon);
    if(!model) return false;
    model.visible = true;

    const h = Math.max(.0001, Math.min(.1, Number(dt) || .016));
    // Eye against the glass: the weapon body is behind the scope overlay and
    // only gets in the way, so it steps aside entirely.
    if(rig.isScoped && rig.isScoped() && rig.scopeBlend() > .9){
      model.visible = false;
      if(flashTimer > 0) flashTimer -= h;
      return true;
    }
    const aiming = rig.isAiming();
    state.ads += ((aiming ? 1 : 0) - state.ads) * damp(14, h);

    // Recoil: the rig's own recoil pitch drives the visible kick, so the model
    // and the aim can never disagree about how much the shot moved.
    state.kick += (Math.max(0, rig.state.recoilPitch) * 2.2 - state.kick) * damp(18, h);

    // Reload dips the weapon and pulls the support hand toward the magazine;
    // sprinting lowers it out of the aiming line. Both are read from the rig
    // rather than from a timer of our own, so the pose matches the state.
    const ammo = rig.ammo();
    state.reload += ((ammo.reloading ? 1 : 0) - state.reload) * damp(9, h);
    const sprinting = !!(rig.state && rig.state.sprintPose);
    state.lower += ((sprinting ? 1 : 0) - state.lower) * damp(8, h);

    // Sway trails the view, and walking adds a slow figure-eight bob.
    const angles = rig.viewAngles();
    state.swayX += (angles.yaw - state.swayX) * damp(11, h);
    state.swayY += (angles.pitch - state.swayY) * damp(11, h);
    state.bob += h * 7;

    const swayYaw = Math.max(-.12, Math.min(.12, (angles.yaw - state.swayX) * 2.4));
    const swayPitch = Math.max(-.1, Math.min(.1, (angles.pitch - state.swayY) * 2.4));
    const bobAmount = (1 - state.ads) * .004;

    // Hip position is shoulder-side, low and forward of the eye; aiming brings
    // it to centre. `weaponSide` mirrors it when the player swaps shoulders.
    const side = rig.weaponSide ? rig.weaponSide() : 1;
    const rightOffset = (.16 * (1 - state.ads) + .001) * side;
    const downOffset = -.14 + .055 * state.ads - state.reload * .11 - state.lower * .13;
    // Recoil punches the weapon BACK toward the shoulder. It used to push it
    // away from the eye, which reads as the weapon lunging at the target.
    const fwdOffset = .38 - .10 * state.ads - state.kick * .10 - state.reload * .04;

    up.set(0, 1, 0);
    offset.copy(transform.position)
      .addScaledVector(transform.right, rightOffset + swayYaw * .12 + Math.sin(state.bob) * bobAmount)
      .addScaledVector(up, downOffset + swayPitch * .10 + Math.cos(state.bob * 2) * bobAmount)
      .addScaledVector(transform.forward, fwdOffset);
    model.position.copy(offset);
    model.quaternion.copy(transform.quaternion);
    // Sign discipline. The model inherits the CAMERA quaternion, where local
    // -Z is forward and +Y is up, so a POSITIVE rotateX lifts the muzzle and a
    // negative one drops it.
    //
    // The camera already carries the real recoil — it is added to the view
    // angles themselves — so the model only needs a small extra lift on top,
    // not a second full kick. Reload and the sprint carry both DIP the weapon;
    // they used to lift it, which is why the barrel sat pointing at the sky
    // after every burst and all through a reload.
    model.rotateX(state.kick * .12 + swayPitch * .5 - state.reload * .45 - state.lower * .38);
    model.rotateY((swayYaw * .6 + state.lower * .22) * side);
    model.rotateZ((state.ads > .5 ? 0 : .045 + state.lower * .18) * side);

    // The support hand leaves the foregrip for the magazine well while reloading.
    const support = model.userData.supportArm;
    const rest = model.userData.supportRest;
    if(support && rest){
      support.position.set(rest.x - state.reload * .05, rest.y - state.reload * .14, rest.z + state.reload * .2);
      support.rotation.x = state.reload * -.5;
    }

    if(flashTimer > 0){
      flashTimer -= h;
      const flash = model.userData.flash;
      flash.visible = true;
      flash.material.opacity = Math.max(0, flashTimer / FLASH_SECONDS) * .95;
      // Spin the flare around its OWN axis for variation. The cone is modelled
      // along +Y and turned onto the barrel by the fixed -90 degrees about X, so
      // that spin has to be Y — Euler 'XYZ' applies Z innermost, and writing it
      // there tipped the flame sideways out of the muzzle instead of rotating it.
      flash.rotation.y = Math.random() * Math.PI;
      const scale = .8 + Math.random() * .5;
      flash.scale.set(scale, 1, scale);
      if(flashTimer <= 0) flash.visible = false;
    }
    return true;
  }

  // The muzzle flash belongs to the weapon THIS view is drawing, so the event has
  // to be filtered by the Pawn that owns the eye. Unfiltered, every AI shot in the
  // level flashed the player's own barrel and kicked the view model: with a
  // garrison firing, the player's weapon appeared to be shooting by itself, in
  // time with everyone else's shots.
  function ownsEvent(detail){
    const pawn = activePawn();
    if(!pawn) return false;
    // A shot with no pawn attribution can only be the local player's: nothing
    // else in the engine fires anonymously.
    if(detail.pawnId == null || detail.pawnId === '') return true;
    return String(detail.pawnId) === String(pawn.id);
  }
  function onPawnEvent(event){
    const detail = event && event.detail || {};
    if(detail.type === 'OnWeaponFired' && detail.kind !== 'unarmed' && detail.kind !== 'melee' &&
      detail.kind !== 'thrown' && ownsEvent(detail)) flashTimer = FLASH_SECONDS;
  }
  window.addEventListener('lk-pawn-event', onPawnEvent);

  // The update path hides the model itself, but it only runs while the eye owns
  // the camera. Switching to third person stops calling it, so the frame loop
  // uses this to put the weapon away.
  function hide(){
    if(model) model.visible = false;
    if(held) held.visible = false;
    return false;
  }

  return Object.freeze({update, hide, dispose, model:() => model});
}

// ------------------------------------------------ pre-benchmark warm-up
//
// Weapon models are built the first time a weapon reaches the player's hands —
// which is mid-fight, on a pickup or a weapon swap. Compiling five shader
// programs and uploading their geometry at that moment is a visible hitch.
//
// This builds one of every profile up front, in both the first-person and the
// world variant, so the benchmark's render and shader-compile passes see them.
// `frustumCulled = false` is what makes it work without any camera maths: the
// meshes join the render list wherever they sit, so the programs compile and
// the buffers upload even though nothing is on screen. Everything is disposed
// again before the frame sample, so the warm-up costs no memory in play.
function warmup(THREE, scene){
  if(!THREE || !scene) return {objects:[], dispose(){}};
  const api = window.LK_RUNTIME_FIRST_PERSON;
  const presets = api && api.WEAPON_PRESETS ? Object.keys(api.WEAPON_PRESETS) : [];
  const weapons = (presets.length ? presets : [null]).map(preset =>
    api && api.normalizeWeapon ? api.normalizeWeapon(preset ? {preset} : {}) : {preset});
  const objects = [];
  weapons.forEach(weapon => {
    const profile = profileFor(weapon);
    [build(THREE, profile), buildWorldModel(THREE, weapon)].forEach(node => {
      if(!node) return;
      node.traverse(child => { child.frustumCulled = false; });
      scene.add(node);
      objects.push(node);
    });
  });
  return {
    objects,
    dispose(){
      objects.forEach(node => {
        if(node.parent) node.parent.remove(node);
        node.traverse(child => { if(child.geometry) child.geometry.dispose(); });
        (node.userData.materials || []).forEach(material => material.dispose());
      });
      objects.length = 0;
    },
  };
}

window.LK_RUNTIME_FPS_VIEW_MODEL = Object.freeze({PROFILES, profileFor, build, buildWorldModel, createTriggerHandFollower, warmup, create});
})();
