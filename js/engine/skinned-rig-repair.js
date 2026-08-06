/* =========================================================
   LOT KING - Repairs for imported skinned rigs and clips

   Two defects that make a perfectly good Mixamo rig animate wrongly, both found in
   the bundled default bodies and both present in the ORIGINAL source files, so any
   user importing from the same pipeline hits them as well.

   01 DOUBLED BONE CHAIN
   Every bone exists twice, nested inside itself: `mixamorigHips / mixamorigHips`,
   `Spine / Spine`, and so on for 52 bones on the male and 64 on the female. The
   inner copy is an exact pass-through - identity local transform, so the same world
   matrix - which is why nothing looks wrong until something animates.

   An AnimationMixer resolves a track name to the FIRST node with that name, the
   OUTER bone. The two skinned meshes in each file are bound to DIFFERENT skeletons,
   and which one gets the outer chain is not even consistent between the bodies:

     male    Alpha_Joints  -> outer (animates)    Alpha_Surface -> inner (frozen)
     female  Beta_Surface  -> outer (animates)    Beta_Joints   -> inner (frozen)

   So on one body the skin stays in its T-pose while the joint markers move, and on
   the other the reverse. The repair points every skeleton at the outer chain and
   deletes the inner copies. Safe precisely because the inner transform is identity:
   the bind pose does not move, so the existing `boneInverses` stay correct.

   02 ROOT MOTION IN A CLIP THE CONTROLLER ALSO MOVES
   The clips are not in-place: `walking.fbx` travels 1.74 m per 1.03 s cycle in its
   hips track. The Character controller supplies world translation itself - every
   animation slot is documented as "in-place, no root motion" - so the clip's own
   travel is added on top, and the character slides forward and snaps back each loop.
   The horizontal component of the root track is flattened; the vertical is kept,
   because that is the body's weight shifting and a jump's real lift.

   Both repairs are applied at LOAD time rather than baked into the files, so they
   also fix user imports, and the original assets stay untouched.

   SECTIONS
     01 helpers    reading a skeleton without depending on THREE
     02 bones      collapse the doubled chain
     03 clips      flatten horizontal root motion
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;

// ================================================================= 01 helpers

function isBone(node){ return !!(node && (node.isBone || node.type === 'Bone')); }
function skinnedMeshes(node){
  const found = [];
  if(node && typeof node.traverse === 'function'){
    node.traverse(child => { if(child && child.isSkinnedMesh && child.skeleton) found.push(child); });
  }
  return found;
}
/** Bones paired with a same-named child: [outer, inner]. */
function duplicatePairs(node){
  const pairs = [];
  if(!node || typeof node.traverse !== 'function') return pairs;
  node.traverse(bone => {
    if(!isBone(bone) || !Array.isArray(bone.children)) return;
    const twin = bone.children.find(child => isBone(child) && child.name === bone.name);
    if(twin) pairs.push([bone, twin]);
  });
  return pairs;
}
/** True when a node adds nothing: no offset, no rotation, no scale. */
function isPassThrough(node){
  if(!node || !node.position || !node.quaternion || !node.scale) return false;
  const moved = Math.abs(node.position.x) + Math.abs(node.position.y) + Math.abs(node.position.z);
  const turned = Math.abs(1 - Math.abs(node.quaternion.w));
  const scaled = Math.abs(1 - node.scale.x) + Math.abs(1 - node.scale.y) + Math.abs(1 - node.scale.z);
  return moved + turned + scaled < 1e-6;
}

// =================================================================== 02 bones

/** Collapse a doubled bone chain so one skeleton drives every skinned mesh.
 *
 *  Only pairs whose inner bone is an exact pass-through are touched. A rig where
 *  the inner copy carries a real transform is a different thing - a control bone,
 *  a twist joint - and removing it would move the bind pose, so it is left alone
 *  and reported instead. Returns what it did, for tests and for logging. */
function collapseDuplicateBones(node){
  const result = {pairs:0, collapsed:0, skipped:0, remappedBones:0, meshes:0};
  const pairs = duplicatePairs(node);
  result.pairs = pairs.length;
  if(!pairs.length) return result;

  const canonical = new Map();          // inner bone -> outer bone
  pairs.forEach(([outer, inner]) => {
    if(!isPassThrough(inner)){ result.skipped++; return; }
    canonical.set(inner, outer);
  });
  if(!canonical.size) return result;

  // Repoint the skeletons FIRST, while the hierarchy is still intact. The
  // boneInverses are deliberately left as they are: an identity pass-through has
  // the same world matrix as its twin, so the bind pose is unchanged.
  const meshes = skinnedMeshes(node);
  result.meshes = meshes.length;
  meshes.forEach(mesh => {
    const bones = mesh.skeleton.bones;
    for(let i = 0; i < bones.length; i++){
      const replacement = canonical.get(bones[i]);
      if(replacement){ bones[i] = replacement; result.remappedBones++; }
    }
  });

  // Then lift each inner bone's children onto its twin and drop it. The child
  // order is preserved so a rig walked by index still reads the same.
  canonical.forEach((outer, inner) => {
    const children = (inner.children || []).slice();
    children.forEach(child => {
      inner.remove(child);
      outer.add(child);
    });
    outer.remove(inner);
    result.collapsed++;
  });
  return result;
}

// =================================================================== 03 clips

/** The track that carries a clip's whole-body travel. */
function rootPositionTrack(clip){
  const tracks = (clip && clip.tracks) || [];
  const positions = tracks.filter(track => /\.position$/.test(String(track.name || '')));
  if(!positions.length) return null;
  const named = positions.find(track => /(hips|root|armature|pelvis)/i.test(String(track.name)));
  // A Mixamo take has exactly one position track and it IS the root; only guess by
  // name when there are several.
  return named || (positions.length === 1 ? positions[0] : null);
}
/** Flatten a clip's horizontal root motion, keeping its vertical movement.
 *
 *  Mutates the clip, so pass a clone. Returns the travel that was removed, which is
 *  what tells an in-place clip (0) from one that was fighting the controller. */
function makeClipInPlace(clip){
  const track = rootPositionTrack(clip);
  if(!track || !track.values || track.values.length < 3) return {changed:false, drift:0};
  const values = track.values;
  const x0 = values[0], z0 = values[2];
  let drift = 0;
  for(let i = 0; i + 2 < values.length; i += 3){
    const dx = values[i] - x0, dz = values[i + 2] - z0;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if(distance > drift) drift = distance;
    // In-place means centred on the Pawn, not merely frozen at the take's first
    // sample. Bundled Walk begins slightly left while Run begins farther right;
    // retaining x0/z0 made the mesh visibly jump sideways when gait changed even
    // though controller direction and mesh yaw were both correct. Y remains the
    // authored weight shift / jump height.
    values[i] = 0;
    values[i + 2] = 0;
  }
  return {changed:drift > 1e-4||Math.hypot(x0,z0)>1e-4, drift, baseline:{x:x0,z:z0}, track:track.name};
}

root.LK_SKINNED_RIG_REPAIR = Object.freeze({
  collapseDuplicateBones, makeClipInPlace, duplicatePairs, rootPositionTrack, isPassThrough,
});

})();
