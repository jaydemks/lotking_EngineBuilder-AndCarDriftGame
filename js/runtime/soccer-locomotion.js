/* =========================================================
   LOT KING - Soccer locomotion blend controller
   Blendspace-lite over GLB clips: predicts the character
   velocity curve and cross-blends idle/walk/run/strafe clips,
   with a one-shot action layer (shoot, pass, save, dive...).
   Inspired by Unreal-style motion blending, kept data-driven:
   missing clips degrade to the nearest available one.
   ========================================================= */
(function(){
'use strict';

const LOCOMOTION_SLOTS = ['idle', 'walk', 'run', 'strafeLeft', 'strafeRight'];

function finite(value, fallback){
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeName(name){
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Clip lookup is forgiving on purpose: Mixamo exports rarely match slot ids
// exactly ("mixamo.com", "Slow Run", "Soccer Idle"...).
const SLOT_HINTS = {
  idle:['idle', 'stand', 'breathing'],
  walk:['walk'],
  run:['run', 'jog', 'sprint'],
  strafeLeft:['strafeleft', 'leftstrafe', 'strafel'],
  strafeRight:['straferight', 'rightstrafe', 'strafer'],
};

function findClip(clips, wanted, slot){
  const list = Array.isArray(clips) ? clips.filter(Boolean) : [];
  if(!list.length) return null;
  const target = normalizeName(wanted);
  if(target){
    const exact = list.find(clip => normalizeName(clip.name) === target);
    if(exact) return exact;
    const partial = list.find(clip => normalizeName(clip.name).indexOf(target) >= 0);
    if(partial) return partial;
  }
  const hints = SLOT_HINTS[slot] || [normalizeName(slot)];
  for(const hint of hints){
    const hit = list.find(clip => normalizeName(clip.name).indexOf(hint) >= 0);
    if(hit) return hit;
  }
  return null;
}

function createController(options){
  const opts = options || {};
  const THREE = opts.THREERef || window.THREE;
  const state = {
    mixer:null,
    node:null,
    clips:[],
    actions:{},            // slot -> AnimationAction
    weights:{},            // slot -> smoothed weight
    oneShot:null,          // {name, action, restore, onDone}
    velocity:{x:0, z:0},   // smoothed local-space velocity (m/s)
    predicted:{x:0, z:0},
    walkSpeed:Math.max(.1, finite(opts.walkSpeed, 1.9)),
    runSpeed:Math.max(.2, finite(opts.runSpeed, 6)),
    responsiveness:Math.max(.5, finite(opts.responsiveness, 9)),
    predictionTime:Math.max(0, finite(opts.predictionTime, .12)),
    bound:false,
    finishedHandler:null,
  };

  function dispose(){
    if(state.mixer && state.finishedHandler) state.mixer.removeEventListener('finished', state.finishedHandler);
    Object.keys(state.actions).forEach(slot => { const a = state.actions[slot]; if(a) a.stop(); });
    state.actions = {};
    state.weights = {};
    state.oneShot = null;
    state.bound = false;
    state.mixer = null;
    state.node = null;
    state.clips = [];
    state.ownsMixerUpdate = false;
  }

  // node is the internal Logic Element node holding the GLB mixer/clips
  // produced by scene-store (userData.logicAnimationMixer / ...Clips).
  // extraClips: clips from a separate animation-library GLB; they play on the
  // same mixer as long as the skeleton bone names match (Mixamo standard).
  function bind(node, clipMap, extraClips){
    dispose();
    if(!node || !node.userData || !THREE) return false;
    const merged = (node.userData.logicAnimationClips || []).concat(Array.isArray(extraClips) ? extraClips.filter(Boolean) : []);
    if(!merged.length) return false;
    let mixer = node.userData.logicAnimationMixer;
    if(!mixer){
      // Mesh-only GLB + separate animation library: create our own mixer on
      // the model root and drive it from update() (scene-store only updates
      // mixers it created itself).
      let modelRoot = null;
      node.traverse(child => { if(!modelRoot && child !== node && child.userData && child.userData.logicElementAssetVisual) modelRoot = child; });
      if(!modelRoot) return false;
      mixer = new THREE.AnimationMixer(modelRoot);
      state.ownsMixerUpdate = true;
    }
    state.node = node;
    state.mixer = mixer;
    state.clips = merged;
    // Locomotion owns the mixer from now on; stop the single autoplay action.
    state.mixer.stopAllAction();
    node.userData.logicAnimationAction = null;
    const map = clipMap || {};
    LOCOMOTION_SLOTS.forEach(slot => {
      const clip = findClip(state.clips, map[slot], slot);
      if(!clip) return;
      const action = state.mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.enabled = true;
      action.setEffectiveWeight(slot === 'idle' ? 1 : 0);
      action.play();
      state.actions[slot] = action;
      state.weights[slot] = slot === 'idle' ? 1 : 0;
    });
    state.clipMap = map;
    state.finishedHandler = event => {
      if(state.oneShot && event.action === state.oneShot.action) finishOneShot();
    };
    state.mixer.addEventListener('finished', state.finishedHandler);
    state.bound = Object.keys(state.actions).length > 0;
    return state.bound;
  }

  function finishOneShot(){
    const shot = state.oneShot;
    state.oneShot = null;
    if(shot && shot.action){
      shot.action.fadeOut(Math.max(.02, shot.fadeOut));
    }
    if(shot && typeof shot.onDone === 'function'){
      try { shot.onDone(shot.name); } catch(err){ /* author callback */ }
    }
  }

  // One-shot layer: shoot, pass, cross, save, dive, celebrate...
  function playAction(clipName, actionOptions){
    if(!state.mixer) return false;
    const o = actionOptions || {};
    const clip = findClip(state.clips, clipName, normalizeName(clipName));
    if(!clip) return false;
    if(state.oneShot && state.oneShot.action) state.oneShot.action.fadeOut(.08);
    const action = state.mixer.clipAction(clip);
    action.reset();
    action.setLoop(o.loop === true ? THREE.LoopRepeat : THREE.LoopOnce, o.loop === true ? Infinity : 1);
    action.clampWhenFinished = o.loop !== true;
    action.setEffectiveTimeScale(Math.max(.05, finite(o.speed, 1)));
    action.setEffectiveWeight(1);
    action.fadeIn(Math.max(.02, finite(o.fadeIn, .12)));
    action.play();
    state.oneShot = {
      name:clip.name,
      action,
      fadeOut:Math.max(.02, finite(o.fadeOut, .18)),
      onDone:o.onDone,
      loop:o.loop === true,
    };
    return true;
  }

  function stopAction(){
    if(state.oneShot) finishOneShot();
  }

  function isActionPlaying(){
    return !!state.oneShot;
  }

  // desired: local-space target velocity {x (lateral, +right), z (forward)} in m/s.
  function update(desired, dt){
    if(!state.bound) return;
    const h = Math.max(.0001, finite(dt, .016));
    if(state.ownsMixerUpdate && state.mixer) state.mixer.update(h);
    const want = desired || {x:0, z:0};
    // Exponential damping toward the desired velocity approximates the
    // character acceleration curve...
    const k = 1 - Math.exp(-state.responsiveness * h);
    state.velocity.x += (finite(want.x, 0) - state.velocity.x) * k;
    state.velocity.z += (finite(want.z, 0) - state.velocity.z) * k;
    // ...and the short look-ahead predicts where that curve is heading, so
    // blends start slightly before the pose is needed (motion-matching-lite).
    state.predicted.x = state.velocity.x + (finite(want.x, 0) - state.velocity.x) * state.predictionTime * state.responsiveness;
    state.predicted.z = state.velocity.z + (finite(want.z, 0) - state.velocity.z) * state.predictionTime * state.responsiveness;

    const speed = Math.sqrt(state.predicted.x * state.predicted.x + state.predicted.z * state.predicted.z);
    const lateral = speed > .05 ? state.predicted.x / Math.max(speed, .0001) : 0;

    // 1D speed blend: idle -> walk -> run.
    const walkT = Math.max(0, Math.min(1, speed / state.walkSpeed));
    const runT = Math.max(0, Math.min(1, (speed - state.walkSpeed) / Math.max(.1, state.runSpeed - state.walkSpeed)));
    const strafeAmount = Math.min(1, Math.abs(lateral)) * Math.max(0, Math.min(1, speed / state.walkSpeed));
    const target = {
      idle:(1 - walkT),
      walk:walkT * (1 - runT) * (1 - strafeAmount),
      run:runT * (1 - strafeAmount * .6),
      strafeLeft:lateral < 0 ? strafeAmount : 0,
      strafeRight:lateral > 0 ? strafeAmount : 0,
    };
    // Missing clips push their weight to the nearest neighbour.
    if(!state.actions.walk && state.actions.run) target.run = Math.max(target.run, walkT * (1 - strafeAmount));
    if(!state.actions.run && state.actions.walk) target.walk = Math.max(target.walk, runT);
    if(!state.actions.strafeLeft) target.walk = Math.max(target.walk, lateral < 0 ? strafeAmount : 0);
    if(!state.actions.strafeRight) target.walk = Math.max(target.walk, lateral > 0 ? strafeAmount : 0);

    const oneShotSuppression = state.oneShot && !state.oneShot.loop ? .08 : 1;
    const blendK = 1 - Math.exp(-12 * h);
    LOCOMOTION_SLOTS.forEach(slot => {
      const action = state.actions[slot];
      if(!action) return;
      const wanted = (target[slot] || 0) * oneShotSuppression;
      state.weights[slot] += (wanted - state.weights[slot]) * blendK;
      action.setEffectiveWeight(Math.max(0, Math.min(1, state.weights[slot])));
      // Stride matching-lite: scale walk/run playback with real speed.
      if(slot === 'walk') action.setEffectiveTimeScale(Math.max(.5, Math.min(1.8, speed / Math.max(.5, state.walkSpeed))));
      if(slot === 'run') action.setEffectiveTimeScale(Math.max(.6, Math.min(1.7, speed / Math.max(1, state.runSpeed))));
    });
  }

  function configure(patch){
    const p = patch || {};
    if(p.walkSpeed != null) state.walkSpeed = Math.max(.1, finite(p.walkSpeed, state.walkSpeed));
    if(p.runSpeed != null) state.runSpeed = Math.max(.2, finite(p.runSpeed, state.runSpeed));
    if(p.responsiveness != null) state.responsiveness = Math.max(.5, finite(p.responsiveness, state.responsiveness));
    if(p.predictionTime != null) state.predictionTime = Math.max(0, finite(p.predictionTime, state.predictionTime));
  }

  return Object.freeze({
    bind,
    update,
    playAction,
    stopAction,
    isActionPlaying,
    configure,
    dispose,
    isBound:() => state.bound,
    availableClips:() => state.clips.map(clip => clip.name || 'Animation'),
    debugState:() => ({velocity:Object.assign({}, state.velocity), weights:Object.assign({}, state.weights), oneShot:state.oneShot ? state.oneShot.name : null}),
  });
}

window.LK_RUNTIME_SOCCER_LOCOMOTION = Object.freeze({createController, findClip, LOCOMOTION_SLOTS});
})();
