/* =========================================================
   LOT KING — Pawn death physics

   A small deterministic articulated solver used while a Pawn is dead. It is
   deliberately independent from Cannon/native-car physics: FPS-only levels,
   animals and exported games therefore get the same result. Imported skeleton
   bones and authored placeholder joints share semantic mapping; mesh-only
   owners fall back to a whole-owner rigid body.

   All simulation state lives in closures/WeakMaps. Scene authoring data stays
   serializable and revive/reset/dispose can restore the exact pre-death pose.
   ========================================================= */
(function(root){
'use strict';

const MODES = Object.freeze(['auto', 'ragdoll', 'rigid', 'animation', 'none']);
const PROFILES = Object.freeze(['auto', 'humanoid', 'quadruped']);
const objectSnapshots = new WeakMap();

function finite(value, fallback){ const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function clamp(value, minimum, maximum){ return Math.max(minimum, Math.min(maximum, value)); }
function token(value){ return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function cloneMap(value){
  const result = {};
  if(value && typeof value === 'object') Object.keys(value).forEach(key => { if(value[key] != null) result[key] = value[key]; });
  return result;
}

function normalizeConfig(source){
  const src = source && typeof source === 'object' ? source : {};
  const mode = MODES.indexOf(String(src.mode || '').toLowerCase()) >= 0 ? String(src.mode).toLowerCase() : 'auto';
  const profile = PROFILES.indexOf(String(src.profile || '').toLowerCase()) >= 0 ? String(src.profile).toLowerCase() : 'auto';
  return {
    enabled:src.enabled !== false,
    mode,
    profile,
    blendTime:clamp(finite(src.blendTime, .14), 0, 2),
    mass:clamp(finite(src.mass, 72), 1, 1000),
    impulseScale:clamp(finite(src.impulseScale, .085), 0, 4),
    settleSeconds:clamp(finite(src.settleSeconds, 2.8), .05, 30),
    boneMap:cloneMap(src.boneMap),
    animation:String(src.animation || src.deathAnimation || 'death'),
    gravity:clamp(finite(src.gravity, 18), 0, 80),
    damping:clamp(finite(src.damping, .985), .5, 1),
    constraintIterations:Math.round(clamp(finite(src.constraintIterations, 6), 2, 16)),
    radius:clamp(finite(src.radius, .075), .01, .5),
  };
}

const HUMANOID = Object.freeze({
  pelvis:['hips', 'pelvis', 'hip', 'root', 'hipsshorts'],
  spine:['spine', 'spine1', 'chest', 'torso', 'torsoshirt'],
  head:['head', 'headskin', 'skull'],
  upperArmL:['leftupperarm', 'upperarml', 'lupperarm', 'armleft', 'armskinleft', 'leftshoulder'],
  lowerArmL:['leftforearm', 'forearml', 'lowerarml', 'elbowskinleft', 'leftelbow'],
  handL:['lefthand', 'handl', 'handskinleft'],
  upperArmR:['rightupperarm', 'upperarmr', 'rupperarm', 'armright', 'armskinright', 'rightshoulder'],
  lowerArmR:['rightforearm', 'forearmr', 'lowerarmr', 'elbowskinright', 'rightelbow'],
  handR:['righthand', 'handr', 'handskinright'],
  upperLegL:['leftupleg', 'leftupperleg', 'thighl', 'upperlegl', 'legsockleft', 'lefthipjoint'],
  lowerLegL:['leftleg', 'calfl', 'lowerlegl', 'leftknee'],
  footL:['leftfoot', 'footl', 'leftankle'],
  upperLegR:['rightupleg', 'rightupperleg', 'thighr', 'upperlegr', 'legsockright', 'righthipjoint'],
  lowerLegR:['rightleg', 'calfr', 'lowerlegr', 'rightknee'],
  footR:['rightfoot', 'footr', 'rightankle'],
});

const QUADRUPED = Object.freeze({
  pelvis:['animalspine', 'pelvis', 'hips', 'sacrum', 'root'],
  spine:['animalspinelumbar', 'spinelumbar', 'lumbar', 'spine'],
  chest:['animalspinethorax', 'animalspinewithers', 'thorax', 'withers', 'chest'],
  neck:['animalneck', 'neck'],
  head:['animalhead', 'head'],
  upperFrontL:['animallegfl', 'animalscapulal', 'frontleftupper', 'leftfrontleg'],
  lowerFrontL:['animalkneefl', 'frontleftlower', 'leftfrontknee'],
  pawFrontL:['animalanklefl', 'animaltoefl', 'frontleftpaw', 'leftfrontfoot'],
  upperFrontR:['animallegfr', 'animalscapular', 'frontrightupper', 'rightfrontleg'],
  lowerFrontR:['animalkneefr', 'frontrightlower', 'rightfrontknee'],
  pawFrontR:['animalanklefr', 'animaltoefr', 'frontrightpaw', 'rightfrontfoot'],
  upperRearL:['animallegbl', 'rearleftupper', 'backleftupper', 'lefthindleg'],
  lowerRearL:['animalkneebl', 'rearleftlower', 'leftbackknee'],
  pawRearL:['animalanklebl', 'animaltoebl', 'rearleftpaw', 'lefthindfoot'],
  upperRearR:['animallegbr', 'rearrightupper', 'backrightupper', 'righthindleg'],
  lowerRearR:['animalkneebr', 'rearrightlower', 'rightbackknee'],
  pawRearR:['animalanklebr', 'animaltoebr', 'rearrightpaw', 'righthindfoot'],
  tail:['animaltailbase', 'tailbase', 'tail'],
});

const HUMANOID_EDGES = Object.freeze([
  ['pelvis','spine'], ['spine','head'],
  ['spine','upperArmL'], ['upperArmL','lowerArmL'], ['lowerArmL','handL'],
  ['spine','upperArmR'], ['upperArmR','lowerArmR'], ['lowerArmR','handR'],
  ['pelvis','upperLegL'], ['upperLegL','lowerLegL'], ['lowerLegL','footL'],
  ['pelvis','upperLegR'], ['upperLegR','lowerLegR'], ['lowerLegR','footR'],
]);
const QUADRUPED_EDGES = Object.freeze([
  ['pelvis','spine'], ['spine','chest'], ['chest','neck'], ['neck','head'], ['pelvis','tail'],
  ['chest','upperFrontL'], ['upperFrontL','lowerFrontL'], ['lowerFrontL','pawFrontL'],
  ['chest','upperFrontR'], ['upperFrontR','lowerFrontR'], ['lowerFrontR','pawFrontR'],
  ['pelvis','upperRearL'], ['upperRearL','lowerRearL'], ['lowerRearL','pawRearL'],
  ['pelvis','upperRearR'], ['upperRearR','lowerRearR'], ['lowerRearR','pawRearR'],
]);

function nodeKey(node){
  const data = node && node.userData || {};
  return token([data.logicElementSceneId, data.logicElementPartId, node && node.name].filter(Boolean).join(' '));
}

function collect(owner){
  const nodes = [];
  if(!owner) return nodes;
  if(typeof owner.traverse === 'function') owner.traverse(node => { if(node && node !== owner) nodes.push(node); });
  else if(Array.isArray(owner.children)){
    const walk = node => { if(!node) return; nodes.push(node); (node.children || []).forEach(walk); };
    owner.children.forEach(walk);
  }
  return nodes;
}

function chooseProfile(pawn, config, nodes){
  if(config.profile !== 'auto') return config.profile;
  if(pawn && (pawn.pawnType === 'animal' || pawn.state && pawn.state.species || pawn.config && pawn.config.species)) return 'quadruped';
  return nodes.some(node => /^animal/.test(nodeKey(node))) ? 'quadruped' : 'humanoid';
}

function explicitNode(value, nodes){
  if(value && typeof value === 'object' && (value.position || value.isObject3D)) return value;
  const wanted = token(value);
  if(!wanted) return null;
  return nodes.find(node => nodeKey(node) === wanted || token(node.name) === wanted) || null;
}

function scoreNode(node, aliases){
  const key = nodeKey(node);
  if(!key) return 0;
  let score = 0;
  aliases.forEach(alias => {
    const candidate = token(alias);
    if(key === candidate) score = Math.max(score, 1000 + candidate.length);
    else if(key.endsWith(candidate) || key.startsWith(candidate)) score = Math.max(score, 300 + candidate.length);
    else if(candidate.length >= 5 && key.indexOf(candidate) >= 0) score = Math.max(score, 100 + candidate.length);
  });
  if(node.isBone) score += 20;
  return score;
}

function resolveRig(owner, source, pawn){
  const config = normalizeConfig(source);
  const nodes = collect(owner);
  const profile = chooseProfile(pawn, config, nodes);
  const roles = profile === 'quadruped' ? QUADRUPED : HUMANOID;
  const edgeRoles = profile === 'quadruped' ? QUADRUPED_EDGES : HUMANOID_EDGES;
  const mapped = {};
  const used = new Set();
  Object.keys(roles).forEach(role => {
    let node = explicitNode(config.boneMap[role], nodes);
    if(!node){
      let best = 0;
      nodes.forEach(candidate => {
        if(used.has(candidate)) return;
        const score = scoreNode(candidate, roles[role]);
        if(score > best){ best = score; node = candidate; }
      });
      if(best <= 0) node = null;
    }
    if(node && !used.has(node)){ mapped[role] = node; used.add(node); }
  });
  const edges = edgeRoles.filter(pair => mapped[pair[0]] && mapped[pair[1]]);
  return {profile, mapped, edges, nodes, sufficient:Object.keys(mapped).length >= 5 && edges.length >= 4};
}

function copyTransform(node){
  return {
    node,
    position:node.position && node.position.clone ? node.position.clone() : null,
    quaternion:node.quaternion && node.quaternion.clone ? node.quaternion.clone() : null,
    scale:node.scale && node.scale.clone ? node.scale.clone() : null,
  };
}

function restoreTransform(snapshot){
  const node = snapshot && snapshot.node;
  if(!node) return;
  if(snapshot.position && node.position && node.position.copy) node.position.copy(snapshot.position);
  if(snapshot.quaternion && node.quaternion && node.quaternion.copy) node.quaternion.copy(snapshot.quaternion);
  if(snapshot.scale && node.scale && node.scale.copy) node.scale.copy(snapshot.scale);
}

// A Logic Element collider describes the standing locomotion capsule/box, not
// the articulated corpse. Keeping it alive while the visible rig falls leaves
// an invisible upright obstacle for every other Pawn and for AI sight tests.
// Retire only the refs owned by this Pawn and restore their exact runtime state
// on revive/dispose; world/static colliders remain untouched.
function suspendPawnColliders(owner){
  const refs=owner&&owner.userData&&owner.userData.logicElementColliderRefs;
  if(!Array.isArray(refs)||!refs.length)return [];
  return refs.map(ref=>{
    const body=ref&&ref.cannonBody;
    const snapshot={ref,enabled:ref&&ref.enabled,body,mask:body&&body.collisionFilterMask,response:body&&body.collisionResponse};
    if(ref)ref.enabled=false;
    if(body){body.collisionFilterMask=0;body.collisionResponse=false;if(body.sleep)body.sleep();}
    return snapshot;
  });
}

function syncPawnColliders(owner,pawn){
  if(pawn&&typeof pawn.syncRuntimeColliders==='function')return pawn.syncRuntimeColliders();
  const store=root.LK_STORE;
  if(store&&typeof store.updateLogicElementColliderRefs==='function'){store.updateLogicElementColliderRefs(owner);return true;}
  if(store&&typeof store.syncCollider==='function'){store.syncCollider(owner);return true;}
  return false;
}

function restorePawnColliders(snapshots,owner,pawn){
  if(!Array.isArray(snapshots)||!snapshots.length)return;
  // Update positions while the refs are still retired, then make them visible
  // to movement/LOS/physics again at the restored pose.
  syncPawnColliders(owner,pawn);
  snapshots.forEach(snapshot=>{
    const ref=snapshot&&snapshot.ref,body=snapshot&&snapshot.body;
    if(ref)ref.enabled=snapshot.enabled;
    if(body){
      body.collisionFilterMask=snapshot.mask;
      body.collisionResponse=snapshot.response;
      body.aabbNeedsUpdate=true;
      if(body.wakeUp)body.wakeUp();
    }
  });
}

function belongsTo(col, owner){
  if(!col || !owner) return false;
  // Logic Element colliders are owned by a child scene node but explicitly
  // point back to the Pawn root. Without this check the standing Pawn collider
  // was treated as world geometry and could launch its own ragdoll upward.
  if(col.logicElementOwner === owner || col.owner === owner) return true;
  const candidate = col.object || col.owner || col.mesh || col.node;
  let node = candidate || null;
  while(node){ if(node === owner) return true; node = node.parent || null; }
  return false;
}

function groundAt(GAME, x, z, fallback, owner){
  const world = GAME && GAME.world;
  let best = world && typeof world.characterGroundHeight === 'function'
    ? finite(world.characterGroundHeight(x, z), 0) : 0;
  const boxes = world && world.colliders && world.colliders.box;
  if(Array.isArray(boxes)) boxes.forEach(col => {
    // Complex colliders keep a broad aggregate root only for bookkeeping.
    // Resolving a corpse against that volume can lift it above the whole map;
    // collision belongs to the authored child parts below it.
    if(!col || col.enabled === false || col.compoundRoot || belongsTo(col, owner)) return;
    if(!Number.isFinite(Number(col.x)) || !Number.isFinite(Number(col.hx))) return;
    if(Math.abs(x - col.x) > finite(col.hx, 0) || Math.abs(z - col.z) > finite(col.hz, 0)) return;
    const top = finite(col.y, 0) + finite(col.hy, 0);
    if(top <= fallback + .25 && top > best) best = top;
  });
  return best;
}

function collidePoint(GAME, point, radius, owner){
  const p = point.position;
  const floor = groundAt(GAME, p.x, p.z, p.y, owner) + radius;
  if(p.y < floor) p.y = floor;
  const boxes = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box;
  if(!Array.isArray(boxes)) return;
  boxes.forEach(col => {
    // Horizontal mesh parts already participate through groundAt(). Treating
    // their enormous XZ footprint as a closed box can eject a ragdoll sideways.
    if(!col || col.enabled === false || col.compoundRoot || col.horizontalSurface || belongsTo(col, owner)) return;
    const hx = Math.max(0, finite(col.hx, 0)) + radius;
    const hy = Math.max(0, finite(col.hy, 0)) + radius;
    const hz = Math.max(0, finite(col.hz, 0)) + radius;
    const dx = p.x - finite(col.x, 0), dy = p.y - finite(col.y, 0), dz = p.z - finite(col.z, 0);
    if(Math.abs(dx) >= hx || Math.abs(dy) >= hy || Math.abs(dz) >= hz) return;
    const px = hx - Math.abs(dx), py = hy - Math.abs(dy), pz = hz - Math.abs(dz);
    if(py <= px && py <= pz) p.y = finite(col.y, 0) + (dy < 0 ? -hy : hy);
    else if(px <= pz) p.x = finite(col.x, 0) + (dx < 0 ? -hx : hx);
    else p.z = finite(col.z, 0) + (dz < 0 ? -hz : hz);
  });
}

function captureMixers(owner){
  const mixers = [];
  [owner].concat(collect(owner)).forEach(node => {
    const mixer = node && node.userData && node.userData.logicAnimationMixer;
    if(mixer && mixers.every(item => item.mixer !== mixer)) mixers.push({mixer, timeScale:finite(mixer.timeScale, 1)});
  });
  return mixers;
}

// Every visible part the solver does NOT drive has to ride one that it does.
//
// The solver only moves the nodes it mapped to a role. On a skinned GLB that is
// enough, because everything else is a child of a bone and follows it. On a rig
// built out of separate meshes - the procedural placeholder, or an imported model
// whose props sit beside the joints rather than under them - the leftovers are
// SIBLINGS of the mapped parts, so they stayed exactly where the character was
// standing: the head dropped to the floor while the hair hung in the air at head
// height, which reads as the body coming apart.
//
// Each orphan is attached to the nearest mapped part for the duration of the
// fall. `attach()` preserves the world transform, so nothing moves at the moment
// of death; from then on the orphan simply follows its host. The original parent
// is recorded so `restore()` puts the hierarchy back exactly as it was.
function rideAlongParts(owner, mapped, THREE){
  if(!owner || !THREE || typeof owner.traverse !== 'function') return [];
  const hosts = Object.keys(mapped).map(role => mapped[role]).filter(Boolean);
  if(!hosts.length) return [];
  const driven = new Set(hosts);
  // A node under a mapped part already follows it.
  const ridesAlready = node => {
    let cursor = node;
    while(cursor){ if(driven.has(cursor)) return true; cursor = cursor.parent || null; }
    return false;
  };
  const orphans = [];
  owner.traverse(node => {
    if(!node || node === owner || driven.has(node) || ridesAlready(node)) return;
    // A node that CONTAINS a driven part cannot ride it: the rig root holds every
    // mapped part, so treating it as an orphan swallowed the whole body and left
    // nothing to attach.
    if(hosts.some(host => isDescendantOf(host, node))) return;
    // Only things that are SEEN need to ride: an empty with no visible child
    // moving or not moving is invisible either way.
    let visible = !!node.isMesh;
    if(!visible && typeof node.traverse === 'function') node.traverse(child => { if(child !== node && child.isMesh) visible = true; });
    if(!visible) return;
    // Skip a node whose own parent is already an orphan: the ancestor carries it.
    if(orphans.some(entry => entry.node !== node && isDescendantOf(node, entry.node))) return;
    orphans.push({node, parent:node.parent || null});
  });
  if(!orphans.length) return [];
  owner.updateMatrixWorld && owner.updateMatrixWorld(true);
  const at = new THREE.Vector3(), hostAt = new THREE.Vector3();
  const attached = [];
  orphans.forEach(entry => {
    const node = entry.node;
    if(!node.getWorldPosition) return;
    node.getWorldPosition(at);
    let best = null, bestDistance = Infinity;
    hosts.forEach(host => {
      if(!host.getWorldPosition || isDescendantOf(host, node)) return;
      host.getWorldPosition(hostAt);
      const distance = at.distanceToSquared(hostAt);
      if(distance < bestDistance){ bestDistance = distance; best = host; }
    });
    if(!best || best === node.parent) return;
    if(typeof best.attach !== 'function') return;
    // The rest transform is recorded BEFORE the re-parent. `attach()` preserves
    // the world transform, so releasing it while the body is on the floor would
    // otherwise leave the part lying there expressed in its original parent's
    // space - the hair came back to the head's grave instead of to the head.
    entry.rest = copyTransform(node);
    best.attach(node);
    attached.push(entry);
  });
  return attached;
}
function isDescendantOf(node, ancestor){
  let cursor = node && node.parent;
  while(cursor){ if(cursor === ancestor) return true; cursor = cursor.parent || null; }
  return false;
}
function releaseRideAlongParts(attached){
  (attached || []).forEach(entry => {
    const node = entry.node, parent = entry.parent;
    if(!node || !parent || typeof parent.add !== 'function') return;
    // `add`, not `attach`: the recorded local transform is put back explicitly,
    // which is the pose the part had before it ever went along for the ride.
    parent.add(node);
    if(entry.rest) restoreTransform(entry.rest);
    if(node.updateMatrixWorld) node.updateMatrixWorld(true);
  });
  return true;
}

function createArticulated(GAME, pawn, owner, rig, config, THREE){
  const roleNames = Object.keys(rig.mapped);
  const points = [];
  const byRole = {};
  owner.updateMatrixWorld && owner.updateMatrixWorld(true);
  roleNames.forEach(role => {
    const node = rig.mapped[role];
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    node.getWorldPosition(position);
    node.getWorldQuaternion(quaternion);
    const point = {
      role, node,
      position:position.clone(), previous:position.clone(), initial:position.clone(),
      restQuaternion:quaternion.clone(),
      snapshot:copyTransform(node), radius:config.radius,
      children:[], parent:null,
    };
    points.push(point); byRole[role] = point;
  });
  const edges = rig.edges.map(pair => {
    const a = byRole[pair[0]], b = byRole[pair[1]];
    const edge = {a, b, length:Math.max(.015, a.position.distanceTo(b.position)), restDirection:b.position.clone().sub(a.position).normalize()};
    a.children.push(edge); if(!b.parent) b.parent = edge;
    return edge;
  });
  const skeletonDriven = points.some(point => point.node && point.node.isBone);
  // A mesh-part rig leaves siblings behind; a skinned rig does not, because its
  // parts hang off bones.
  const rideAlong = skeletonDriven ? [] : rideAlongParts(owner, rig.mapped, THREE);
  const anchor = byRole.pelvis || points[0];
  const ownerSnapshot = copyTransform(owner);
  const ownerWorldStart = new THREE.Vector3();
  owner.getWorldPosition(ownerWorldStart);
  const visualPosition = new THREE.Vector3();
  const anchorVisual = new THREE.Vector3();
  const ownerWorld = new THREE.Vector3();
  const currentDirection = new THREE.Vector3();
  const deltaQuaternion = new THREE.Quaternion();
  const worldQuaternion = new THREE.Quaternion();
  const parentQuaternion = new THREE.Quaternion();
  const inverseParent = new THREE.Quaternion();
  let blend = 0, elapsed = 0, settled = false;

  function kick(info){
    const at = info && info.point;
    let selected = points[0];
    if(at){
      let nearest = Infinity;
      points.forEach(point => {
        const dx=point.position.x-at.x, dy=point.position.y-at.y, dz=point.position.z-at.z;
        const distance=dx*dx+dy*dy+dz*dz;
        if(distance < nearest){ nearest=distance; selected=point; }
      });
    }
    const direction = info && info.direction || {x:0, y:0, z:1};
    const force = Math.max(8, finite(info && info.force, 28));
    const speed = force * config.impulseScale * (72 / config.mass);
    const frame = 1 / 60;
    const impulse=(point,vector,weight,lift)=>{
      point.previous.x -= finite(vector.x,0)*speed*frame*weight;
      point.previous.y -= (finite(vector.y,0)*speed*weight+Math.min(2.5,speed*.28)*lift)*frame;
      point.previous.z -= finite(vector.z,0)*speed*frame*weight;
    };
    if(info && info.explosion===true){
      // A blast moves the complete articulated mass and adds a small radial
      // torque. Kicking one bone alone is what made a corpse appear to explode
      // into parts before the constraints caught up.
      const origin=info.origin||info.point||null;
      points.forEach(point=>{
        let vector=direction;
        if(origin){
          const dx=point.position.x-finite(origin.x,point.position.x),dy=point.position.y-finite(origin.y,point.position.y),dz=point.position.z-finite(origin.z,point.position.z);
          const length=Math.sqrt(dx*dx+dy*dy+dz*dz)||1;
          vector={x:finite(direction.x,0)*.78+dx/length*.22,y:finite(direction.y,0)*.78+dy/length*.22,z:finite(direction.z,0)*.78+dz/length*.22};
        }
        impulse(point,vector,1,1);
      });
    } else {
      // Bullets still react locally, but share momentum with connected joints
      // immediately so the body stays visually attached.
      impulse(selected,direction,1,1);
      edges.forEach(edge=>{
        if(edge.a===selected)impulse(edge.b,direction,.38,.35);
        else if(edge.b===selected)impulse(edge.a,direction,.38,.35);
      });
      points.forEach(point=>{if(point!==selected)impulse(point,direction,.12,.08);});
    }
  }

  function solveEdge(edge){
    const dx=edge.b.position.x-edge.a.position.x, dy=edge.b.position.y-edge.a.position.y, dz=edge.b.position.z-edge.a.position.z;
    const distance=Math.sqrt(dx*dx+dy*dy+dz*dz) || .000001;
    const correction=(distance-edge.length)/distance*.5;
    edge.a.position.x += dx*correction; edge.a.position.y += dy*correction; edge.a.position.z += dz*correction;
    edge.b.position.x -= dx*correction; edge.b.position.y -= dy*correction; edge.b.position.z -= dz*correction;
  }

  function drivePose(){
    blend = config.blendTime <= 0 ? 1 : Math.min(1, blend);
    if(skeletonDriven && anchor && owner.position){
      anchorVisual.copy(anchor.initial).lerp(anchor.position,blend);
      ownerWorld.copy(ownerWorldStart).add(anchorVisual.sub(anchor.initial));
      if(owner.parent && owner.parent.worldToLocal){
        owner.parent.updateMatrixWorld && owner.parent.updateMatrixWorld(true);
        owner.position.copy(owner.parent.worldToLocal(ownerWorld.clone()));
      } else owner.position.copy(ownerWorld);
      owner.updateMatrixWorld && owner.updateMatrixWorld(true);
    }
    points.forEach(point => {
      visualPosition.copy(point.initial).lerp(point.position, blend);
      const node = point.node;
      // Never translate individual skeleton bones. Their rest offsets are the
      // joints that keep a skinned GLB connected; only rotations articulate
      // them while the Pawn root follows the pelvis translation.
      if(!skeletonDriven){
        if(node.parent && node.parent.worldToLocal){
          node.parent.updateMatrixWorld && node.parent.updateMatrixWorld(true);
          node.position.copy(node.parent.worldToLocal(visualPosition.clone()));
        } else if(node.position && node.position.copy) node.position.copy(visualPosition);
      }
      const edge = point.children[0];
      if(edge && node.quaternion){
        currentDirection.copy(edge.b.position).sub(edge.a.position);
        if(currentDirection.lengthSq() > .000001){
          currentDirection.normalize();
          deltaQuaternion.setFromUnitVectors(edge.restDirection, currentDirection);
          worldQuaternion.copy(deltaQuaternion).multiply(point.restQuaternion);
          if(node.parent && node.parent.getWorldQuaternion){
            node.parent.getWorldQuaternion(parentQuaternion);
            inverseParent.copy(parentQuaternion).invert();
            node.quaternion.copy(inverseParent.multiply(worldQuaternion));
          } else node.quaternion.copy(worldQuaternion);
        }
      }
      node.updateMatrixWorld && node.updateMatrixWorld(true);
    });
    owner.updateMatrixWorld && owner.updateMatrixWorld(true);
  }

  function step(dt){
    if(settled) return;
    const h = clamp(finite(dt, .016), .001, .05);
    elapsed += h;
    blend = config.blendTime <= 0 ? 1 : Math.min(1, blend + h / config.blendTime);
    const frameDamping = Math.pow(config.damping, h * 60);
    points.forEach(point => {
      const px=point.position.x, py=point.position.y, pz=point.position.z;
      point.position.x += (point.position.x-point.previous.x)*frameDamping;
      point.position.y += (point.position.y-point.previous.y)*frameDamping-config.gravity*h*h;
      point.position.z += (point.position.z-point.previous.z)*frameDamping;
      point.previous.set(px,py,pz);
    });
    for(let iteration=0; iteration<config.constraintIterations; iteration++){
      edges.forEach(solveEdge);
      points.forEach(point => collidePoint(GAME, point, point.radius, owner));
    }
    drivePose();
    if(elapsed >= config.settleSeconds) settled = true;
  }

  return {
    kind:'ragdoll', points, edges,
    kick, step,
    settled:() => settled,
    restore(){
      // Put the hierarchy back BEFORE restoring transforms: the stored snapshots
      // are local to the original parents.
      releaseRideAlongParts(rideAlong);
      rideAlong.length=0;
      restoreTransform(ownerSnapshot);
      points.forEach(point => restoreTransform(point.snapshot));
      owner.updateMatrixWorld && owner.updateMatrixWorld(true);
      settled=true;
    },
    dispose(){ releaseRideAlongParts(rideAlong); rideAlong.length=0; points.length=0; edges.length=0; settled=true; },
  };
}

function createRigid(GAME, owner, config, THREE){
  const snapshot = copyTransform(owner);
  const velocity = {x:0,y:0,z:0};
  let angular = 0, elapsed = 0, settled = false;
  function kick(info){
    const direction=info && info.direction || {x:0,y:0,z:1};
    const force=Math.max(8, finite(info && info.force, 28));
    const speed=force*config.impulseScale*(72/config.mass);
    velocity.x=finite(direction.x,0)*speed;
    velocity.y=finite(direction.y,0)*speed+Math.min(2.2,speed*.25);
    velocity.z=finite(direction.z,0)*speed;
    angular=(velocity.x-velocity.z)*.22 || .35;
  }
  function step(dt){
    if(settled || !owner || !owner.position) return;
    const h=clamp(finite(dt,.016),.001,.05); elapsed+=h;
    velocity.y-=config.gravity*h;
    owner.position.x+=velocity.x*h; owner.position.y+=velocity.y*h; owner.position.z+=velocity.z*h;
    const floor=groundAt(GAME,owner.position.x,owner.position.z,owner.position.y,owner)+config.radius;
    if(owner.position.y<floor){owner.position.y=floor;if(velocity.y<0)velocity.y=-velocity.y*.12;velocity.x*=.74;velocity.z*=.74;angular*=.72;}
    if(owner.rotation){owner.rotation.x+=angular*h;owner.rotation.z-=angular*h*.55;}
    velocity.x*=Math.pow(.985,h*60);velocity.z*=Math.pow(.985,h*60);
    owner.updateMatrixWorld&&owner.updateMatrixWorld(true);
    if(elapsed>=config.settleSeconds)settled=true;
  }
  return {
    kind:'rigid', kick, step, settled:()=>settled,
    restore(){restoreTransform(snapshot);owner.updateMatrixWorld&&owner.updateMatrixWorld(true);settled=true;},
    dispose(){settled=true;},
  };
}

function create(GAME, pawn, source){
  const owner = pawn && pawn.owner;
  const config = normalizeConfig(source);
  const THREE = root.THREE || null;
  let active = false, body = null, mixers = [], rig = null, disposed = false, colliderSnapshots = [];

  function enter(sourceInfo){
    if(disposed || active || !owner || config.enabled === false || config.mode === 'none') return false;
    const info = root.LK_RUNTIME_DAMAGE_CONTRACT && root.LK_RUNTIME_DAMAGE_CONTRACT.metadata
      ? root.LK_RUNTIME_DAMAGE_CONTRACT.metadata(sourceInfo) : (sourceInfo || {});
    rig = THREE ? resolveRig(owner, config, pawn) : null;
    mixers = captureMixers(owner);
    if(config.mode === 'animation'){
      const pose = [owner].concat(collect(owner)).map(copyTransform);
      if(pawn && typeof pawn.playAction === 'function') pawn.playAction(config.animation, {loop:false, hold:true});
      body = {kind:'animation', step(){}, kick(){}, settled:()=>true,
        restore(){ pose.forEach(restoreTransform); if(pawn && pawn.locomotion && pawn.locomotion.stopAction) pawn.locomotion.stopAction(); },
        dispose(){ pose.length=0; }};
    } else if(THREE && config.mode !== 'rigid' && rig && rig.sufficient){
      mixers.forEach(entry => { entry.mixer.timeScale = 0; });
      body = createArticulated(GAME, pawn, owner, rig, config, THREE);
    } else if(owner.position){
      mixers.forEach(entry => { entry.mixer.timeScale = 0; });
      body = createRigid(GAME, owner, config, THREE);
    }
    active = !!body;
    if(active) colliderSnapshots=suspendPawnColliders(owner);
    if(body && body.kick) body.kick(info);
    return active;
  }

  function step(dt){ if(active && body && body.step) body.step(dt); return status(); }

  function restore(){
    if(body && body.restore) body.restore();
    mixers.forEach(entry => { if(entry.mixer) entry.mixer.timeScale = entry.timeScale; });
    mixers.length = 0;
    if(body && body.dispose) body.dispose();
    body = null; rig = null; active = false;
    restorePawnColliders(colliderSnapshots,owner,pawn);
    colliderSnapshots=[];
    return true;
  }

  function dispose(){ if(disposed) return; restore(); disposed=true; }

  function applyBinding(path, value){
    const key=String(path||'');
    if(key.indexOf('vitals.deathPhysics.')!==0)return false;
    const field=key.slice(20), patch=Object.assign({},config);
    if(field.indexOf('boneMap.')===0){patch.boneMap=cloneMap(config.boneMap);patch.boneMap[field.slice(8)]=value;}
    else patch[field]=value;
    Object.assign(config,normalizeConfig(patch));return true;
  }

  function status(){
    return {active, kind:body&&body.kind||'none', settled:!!(body&&body.settled&&body.settled()), profile:rig&&rig.profile||config.profile};
  }

  return Object.freeze({config:()=>config, enter, step, restore, revive:restore, reset:restore, dispose, applyBinding, status});
}

// Numeric/prop damageables keep using the world item body, but their pristine
// transform is retained here so Make Damageable/reset can undo it completely.
function handleObjectDeath(object, info){
  if(!object || !object.position) return false;
  if(!objectSnapshots.has(object)) objectSnapshots.set(object, copyTransform(object));
  const GAME = root.LOT_KING;
  const items = GAME && GAME.systems && GAME.systems.items;
  if(!items || typeof items.impulse !== 'function') return false;
  const direction = info && info.direction || {x:0,y:1,z:0};
  return items.impulse(object, direction, Math.max(8, finite(info && info.force, 28))) === true;
}

function restoreObject(object){
  const snapshot = object && objectSnapshots.get(object);
  const GAME = root.LOT_KING;
  const items = GAME && GAME.systems && GAME.systems.items;
  if(items && typeof items.stopBody === 'function') items.stopBody(object);
  if(!snapshot) return false;
  restoreTransform(snapshot); object.updateMatrixWorld && object.updateMatrixWorld(true);
  objectSnapshots.delete(object); return true;
}

const api = Object.freeze({MODES, PROFILES, normalizeConfig, resolveRig, create, handleObjectDeath, restoreObject, rideAlongParts, releaseRideAlongParts});
root.LK_RUNTIME_PAWN_DEATH_PHYSICS = api;
if(typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
