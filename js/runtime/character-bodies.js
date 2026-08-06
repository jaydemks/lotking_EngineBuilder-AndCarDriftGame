/* =========================================================
   LOT KING - Bundled character bodies

   The catalogue of the default mannequins, and the one place that turns a body id
   into a model, a motion set and an appearance.

   WHY THIS MODULE EXISTS
   The body used to be baked into the logic template pack, so `bodyType` was a
   string nobody read: an author could flip the Inspector select from Male to
   Female and get the male mannequin with the male clips, because the swap only
   ever happened when a template was first instantiated. The runtime needs the
   same table the templates use, so the table moved here and both sides read it.

   WHAT IS SHARED AND WHAT IS NOT
   Locomotion is per body - it carries the weight and the posture. The actions in
   `shared/` are authored once: both mannequins are Mixamo rigs with the same
   `mixamorig:` bone names, so a clip authored on one drives the other.

   SECTIONS
     01 catalogue    the bodies, their files, fits and palettes
     02 assets       asset references the store and the FBX plugin both accept
     03 motions      which clip fills which slot, per body
     04 apply        swap a config onto a body without touching authored work
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;

// ============================================================== 01 catalogue

// Both mannequins must stand at the same real height, and `fit` normalises a
// model's LONGEST axis. On a T-pose that axis is the ARM SPAN, not the height:
// measured from the bundled files the male spans 194.685 with a height of
// 180.473, the female 180.923 both ways. A single `fit: 1.8` therefore produced a
// 1.67 m male beside a 1.80 m female. Each fit is derived as
// `1.8 * longest / height`, so both bodies stand exactly 1.8 m tall and match the
// DollBody mannequin and the capsule collider.
const TARGET_HEIGHT = 1.8;
const DEFAULT_BODY = 'male';
const BODIES = Object.freeze({
  male:Object.freeze({
    id:'male', label:'Mannequin - Male', labelIt:'Manichino - Uomo',
    dir:'models/characters/mannequin-male', file:'y-bot.fbx',
    fit:1.941743,            // 1.8 * 194.685 / 180.473
    appearance:{shirtColor:'#4f8fbf', shortsColor:'#263445', socksColor:'#20252b', hairColor:'#2b2118', skinColor:'#d8a184'},
  }),
  female:Object.freeze({
    id:'female', label:'Mannequin - Female', labelIt:'Manichino - Donna',
    dir:'models/characters/mannequin-female', file:'x-bot.fbx',
    fit:1.8,                 // its longest axis already IS its height
    appearance:{shirtColor:'#b4638f', shortsColor:'#2b2536', socksColor:'#20252b', hairColor:'#3a2418', skinColor:'#e0b191'},
  }),
});
const OPTIONS = Object.freeze(Object.keys(BODIES).map(id => ({value:id, label:BODIES[id].label})));
const SHARED_MOTION_DIR = 'models/characters/shared';
const ASSET_PREFIX = 'builtin:character/';

/** Body for an id. An empty id is the documented default; a WRONG id throws.
 *
 *  Silently substituting the male body for a typo is how `bodyType` became
 *  decorative in the first place - a level would look correct in the Inspector
 *  and wrong on screen, with nothing reported. */
function resolve(id){
  const key = String(id == null ? '' : id).trim().toLowerCase();
  if(!key) return BODIES[DEFAULT_BODY];
  const body = BODIES[key];
  if(!body) throw new Error('Unknown character body "' + id + '"; expected one of ' + Object.keys(BODIES).join(', '));
  return body;
}
/** Same resolution, but an unknown id falls back instead of throwing. For data
 *  that already exists in a saved project, where refusing to load is worse. */
function resolveOrDefault(id){
  const key = String(id == null ? '' : id).trim().toLowerCase();
  return BODIES[key] || BODIES[DEFAULT_BODY];
}

// ================================================================= 02 assets

/** An asset reference the store and the FBX plugin both understand.
 *
 *  `sourceFormat` and `sourceSrc` are what make the FBX path engage. Both loaders
 *  - `scene-store.js` for a body and `character-pawn-base.js` for a motion
 *  library - try the canonical GLB first and only fall back to the FBX plugin
 *  when the asset declares `sourceFormat === 'fbx'` AND carries a `sourceDbKey`
 *  or `sourceSrc`. An asset with only `src` fails that guard and the plugin
 *  reports "FBX source blob is missing", so a bundled FBX referenced by path
 *  alone never loads at all. `src` is kept as well: the export collector and the
 *  asset panel read it. */
function fbxAsset(fields){
  const src = fields.src;
  return Object.assign({}, fields, {kind:'fbx', sourceFormat:'fbx', sourceSrc:src});
}
function motionAsset(dir, file, name){
  return fbxAsset({id:file.replace(/\.fbx$/, ''), key:ASSET_PREFIX + dir.split('/').pop() + '/' + file,
    src:dir + '/' + file, name, source:'Bundled character motion'});
}
function bodyAsset(id){
  const body = resolveOrDefault(id);
  return fbxAsset({id:'character-' + body.id, key:ASSET_PREFIX + body.id,
    src:body.dir + '/' + body.file, name:body.label, fit:body.fit,
    source:'Bundled character body'});
}
/** True for an asset this module produced. What makes the swap safe: an author
 *  who imported their own model or clip keeps it when the body changes. */
function isBundled(asset){
  return !!(asset && typeof asset === 'object' && String(asset.key || '').indexOf(ASSET_PREFIX) === 0);
}
/** Every colour any body uses as its default, per appearance key.
 *
 *  This is how a default palette entry is told apart from a colour the author
 *  chose, and it deliberately does NOT depend on knowing which body the config
 *  came from: by the time the swap runs the caller has usually already written
 *  the new `bodyType`, so that string no longer says what the Pawn is wearing,
 *  and a Pawn with no model yet says nothing at all. A colour equal to a bundled
 *  default is treated as a default whichever body it came from. */
const DEFAULT_COLOURS = Object.freeze(Object.keys(BODIES[DEFAULT_BODY].appearance).reduce((table, key) => {
  table[key] = Object.freeze(Object.keys(BODIES).map(id => BODIES[id].appearance[key]));
  return table;
}, {}));
function isDefaultColour(key, value){
  const known = DEFAULT_COLOURS[key];
  return !!known && (value == null || known.indexOf(value) >= 0);
}

// ================================================================ 03 motions

// Every slot the runtime can play, resolved to a bundled clip where one exists.
// A slot with no clip is left empty on purpose rather than pointed at something
// approximate: the controller already has a documented fallback for each.
function motions(id){
  const body = resolveOrDefault(id);
  const own = (file, name) => motionAsset(body.dir, file, name);
  const shared = (file, name, options) => Object.assign(motionAsset(SHARED_MOTION_DIR, file, name), options || {});
  return {
    idle:own('idle.fbx', body.label + ' Idle'),
    walk:own('walking.fbx', body.label + ' Walk'),
    run:own('running.fbx', body.label + ' Run'),
    // WALK strafes at walk speed. These were bound to `strafe-left/right.fbx`,
    // which are the RUNNING strafes - so stepping sideways played a run. The
    // sources ship both; the walking pair had been copied and left unused.
    strafeLeft:own('strafe-walk-left.fbx', body.label + ' Strafe Walk Left'),
    strafeRight:own('strafe-walk-right.fbx', body.label + ' Strafe Walk Right'),
    // The running strafes, for the run-speed lateral entries.
    runStrafeLeft:own('strafe-left.fbx', body.label + ' Strafe Run Left'),
    runStrafeRight:own('strafe-right.fbx', body.label + ' Strafe Run Right'),
    jump:own('jump.fbx', body.label + ' Jump'),
    // Shared actions. `fall`, `roll` and `landHeavy` are the ones the traversal
    // and death code already ask for by name every time a character drops.
    fall:shared('falling-idle.fbx', 'Falling Idle'),
    roll:shared('falling-to-roll.fbx', 'Falling To Roll'),
    // The ordinary landing: arriving on your feet while walking or running. The
    // hard landing is reserved for a fall that actually hurts.
    land:shared('run-to-stop.fbx', 'Run To Stop'),
    // Soccer's transition from an airborne pose back into locomotion. Unlike
    // Run To Stop this plants a travelling foot and lets the run continue.
    landMoving:shared('falling-to-landing.fbx', 'Falling To Landing'),
    landHeavy:shared('hard-landing.fbx', 'Hard Landing'),
    slide:shared('running-slide.fbx', 'Running Slide'),
    // Front Flip is the stock short-wall vault. The older box take remains a
    // second slot so an author can select it randomly or by obstacle dimensions.
    vault:shared('front-flip-vault.fbx', 'Front Flip Running Vault'),
    vaultBox:shared('vault-over-box.fbx', 'Vault Over Box'),
    wallFlip:shared('wall-flip.fbx', 'Wall Flip'),
    mantle:shared('climbing-pull-up.fbx', 'Climbing Pull Up'),
    climb:shared('climbing-loop-normal.fbx', 'Climbing Loop'),
    hang:shared('hanging-idle.fbx', 'Hanging Idle'),
    climbUp:shared('climbing-to-top.fbx', 'Climbing To Top'),
    // One verified source drives both ladder directions. Negative playback is
    // metadata on THIS binding, not a second mutated FBX, so the source remains
    // inspectable and the descending pose stays exactly reciprocal to ascent.
    climbDown:shared('climbing-to-top.fbx', 'Climbing To Top (Reverse)', {playbackRate:-1}),
    ledgeShimmyLeft:shared('ledge-shimmy-left.fbx', 'Ledge Shimmy Left'),
    ledgeShimmyRight:shared('ledge-shimmy-right.fbx', 'Ledge Shimmy Right'),
    punch:shared('punch-right.fbx', 'Punch Right'),
    knifeAttack:shared('knife-attack.fbx', 'Knife Attack'),
    hitReact:shared('hit-react-body.fbx', 'Hit To Body'),
    // NOT registered, and must not be: `jumping-up.fbx`, `stand-to-cover-low.fbx`,
    // `cover-to-stand-a.fbx` and `mannequin-male/idle-alt-2.fbx` cannot be parsed at
    // all - THREE.FBXLoader rejects them with "Unknown property type". They sit on
    // disk unreferenced and harmless for exactly that reason; naming them here puts
    // them in the animation library's load list, the library never completes,
    // `bind()` never succeeds and the character is left with NO animation whatsoever
    // - not a missing clip, all of them. Verify a new file parses before adding it:
    //   node scripts/measure-clip-direction.mjs <file.fbx>
    // The re-export those four needed turned out to be sitting in the source tree:
    // `models_sources/assets/default_characters/Action Adventure Pack.zip` holds a
    // second, READABLE export of the same three cover/jump takes. The low-cover one
    // is imported below as `cover-low-enter.fbx`. The others are not, because the
    // slot they would fill is already filled by a better take - see the notes there.
    // The broken files keep their names on disk: they are the worked example the
    // tests pin, and overwriting them would quietly retire the lesson.

    // ---- eight-way locomotion -------------------------------------------
    // The combat set has always DECLARED these entries, with a clip name and
    // `asset: null`, so none of them could ever resolve: nine of its twenty-one
    // entries silently played nothing. The clips exist and always did, in the
    // shoot pack sources. Each one was measured with
    // scripts/measure-clip-direction.mjs before being bound, and the travel
    // agrees with the direction the set declares - `walk-forward-left` moves the
    // hips dx +137 dz +137, and the entry says [+.707, +.707].
    runBackward:shared('run-backward.fbx', 'Run Backward'),
    walkForwardLeft:shared('walk-forward-left.fbx', 'Walk Forward Left'),
    walkForwardRight:shared('walk-forward-right.fbx', 'Walk Forward Right'),
    walkBackLeft:shared('walk-backward-left.fbx', 'Walk Backward Left'),
    walkBackRight:shared('walk-backward-right.fbx', 'Walk Backward Right'),
    runForwardLeft:shared('run-forward-left.fbx', 'Run Forward Left'),
    runForwardRight:shared('run-forward-right.fbx', 'Run Forward Right'),
    runBackLeft:shared('run-backward-left.fbx', 'Run Backward Left'),
    runBackRight:shared('run-backward-right.fbx', 'Run Backward Right'),

    // ---- weapon poses on the body ---------------------------------------
    // Aiming and firing as full-body clips, so a third-person character shows
    // what it is doing without a separate arms rig in front of the lens.
    aimIdle:shared('aim-idle.fbx', 'Idle Aiming'),
    aimRifleIdle:shared('aim-rifle-idle.fbx', 'Rifle Aiming Idle'),
    fire:shared('fire-rifle.fbx', 'Firing Rifle'),
    runAiming:shared('run-aiming.fbx', 'Rifle Run'),

    // ---- crouch ----------------------------------------------------------
    crouchIdle:shared('crouch-idle.fbx', 'Idle Crouching'),
    crouchAimIdle:shared('crouch-aim-idle.fbx', 'Idle Crouching Aiming'),
    crouchWalk:shared('crouch-walk-forward.fbx', 'Walk Crouching Forward'),
    crouchWalkBackward:shared('crouch-walk-backward.fbx', 'Walk Crouching Backward'),
    crouchWalkLeft:shared('crouch-walk-left.fbx', 'Walk Crouching Left'),
    crouchWalkRight:shared('crouch-walk-right.fbx', 'Walk Crouching Right'),
    // The two sneak pairs arrived from Mixamo named the wrong way round: the file
    // called "crouched sneaking left" carries the hips dx -134, which in this frame
    // is the body's own RIGHT, and its "right" partner dx +121, its LEFT. The crouch
    // WALK pair beside them is honest (left +199, right -205), so the source is
    // inconsistent with itself rather than the engine being wrong about the frame.
    // Both pairs were renamed to their MEASURED direction on import, so the slot, the
    // label and the filename all agree and nothing here has to carry a correction:
    //   node scripts/measure-clip-direction.mjs models/characters/shared/*-sneak-*.fbx
    crouchSneakLeft:shared('crouch-sneak-left.fbx', 'Crouched Sneaking Left'),
    crouchSneakRight:shared('crouch-sneak-right.fbx', 'Crouched Sneaking Right'),

    // ---- cover -----------------------------------------------------------
    // These four shipped on disk and were never referenced by anything:
    // character-combat-cover.js moved the body and played no clip, so taking
    // cover read as sliding into place.
    // character-combat-cover.js classifies every piece of cover as `low` or `high`
    // and both classes need their own entry pose: low cover is dropped behind, high
    // cover is stood against. Only HIGH could be bound while the low take was the
    // unreadable file; the readable re-export from the Action Adventure Pack zip
    // fills the pair. It is not called `stand-to-cover-low.fbx` on purpose - that
    // name belongs to the file FBXLoader cannot read, and the guard that keeps that
    // file out of the load list matches on the name.
    coverHigh:shared('stand-to-cover-high.fbx', 'Stand To Cover High'),
    coverLow:shared('cover-low-enter.fbx', 'Enter Cover Low'),
    // The stand-up has two takes in the source pack. `-b` (1.13 s) is bound and the
    // re-exported `-a` (1.50 s) is left out rather than imported as a spare: there is
    // one exit slot, and a second file in the catalogue is a second file every
    // character loads at spawn for a pose nothing selects.
    coverToStand:shared('cover-to-stand-b.fbx', 'Cover To Stand'),
    coverSneakLeft:shared('cover-sneak-left.fbx', 'Cover Sneak Left'),
    coverSneakRight:shared('cover-sneak-right.fbx', 'Cover Sneak Right'),

    // ---- death -----------------------------------------------------------
    // Two opposed deaths, so a kill reads as coming from the direction it came
    // from. `vitals.die()` currently hands the body to the ragdoll in
    // pawn-death-physics.js, which is why these had no slot: a simulated fall
    // needs no clip. They are bound anyway because a ragdoll is the wrong answer
    // for a scripted or a low-end death, and because the shoot pack ships them.
    //
    // Which take fills which slot was decided by MEASURING the end pose, not by
    // reading the filename, and the filenames do not survive that. Six death
    // takes ship; four of them fall FORWARD onto the face:
    //   death from the front     dz +105  ends prone   <- falls forward
    //   death from the back      dz +114  ends prone
    //   death from back headshot dz  +98  ends prone
    //   death from front headshot dz -27  ends SUPINE  <- the only backward fall
    // So `death from the front` and `death from the back` are the SAME outcome and
    // cannot be a front/back pair whichever way you read "from": one of the two is
    // mislabelled at source. The headshot take is the only one in the pack that
    // drops the body onto its back, so it is the frontal death, and the generic
    // back take is the rear one. The end pose was read by playing each clip on its
    // own rig and sampling the world position of the head against the hips on the
    // last frame: 53 cm BEHIND the hips for the front take, 52 cm in FRONT of them
    // for the back one, both hips ~20 cm off the floor, i.e. lying flat.
    // `scripts/measure-clip-direction.mjs` reports the hip travel that got us here.
    // The bundled names state the SLOT rather than the source file for exactly that
    // reason, the same choice `cover-low-enter.fbx` made.
    // `deathFront` is hit from the front and lands on its back; `deathBack` is hit
    // from behind and lands on its face.
    deathFront:shared('death-front.fbx', 'Death From The Front'),
    deathBack:shared('death-back.fbx', 'Death From Behind'),

    // ---- what is deliberately still EMPTY --------------------------------
    // landCrouch, interact.
    //
    // The Advanced Animations source pack added in v0.7.8 filled the twelve
    // traversal/melee/reaction slots above. Every imported FBX was parsed and its
    // root displacement measured before registration. The two remaining slots
    // still degrade through their documented runtime paths.
    // The nearest misses were checked and rejected rather than bound:
    //   `jump down.fbx`  the third phase of the shooting pack's jump. Dips the hips
    //                    to 78 cm and returns to 97 cm standing, where a crouch
    //                    idle sits at 46 cm - a knee bend, not a crouched landing,
    //                    so it is not `landCrouch`.
    //   `jumping up.fbx` 0.23 s and in place. A vertical hop, not a climb.
    //   `Landing.fbx`    Soccer Game Pack, and rigged `mixamorig5:` rather than
    //                    `mixamorig:`. Nothing here retargets, so its tracks bind
    //                    to no bone on either mannequin.
    //   cover sneaks     sideways against a wall, but STANDING, so they are not the
    //                    ledge shimmy.
    // Filling these means downloading the packs that hold them; a slot pointed at
    // an approximation is worse than an empty one, because the controller's
    // documented fallback is at least honest about having no clip.
  };
}

/** De-duplicated catalogue of the motion-only FBX files for editor discovery.
 * Runtime references keep their canonical key/src; only the displayed copy gets
 * a panel-safe id. Shared actions are listed once rather than once per body. */
function motionAssets(){
  const byKey = {}, out = {};
  Object.keys(BODIES).forEach(bodyId => {
    const available = motions(bodyId);
    Object.keys(available).forEach(slot => {
      const asset = available[slot];
      if(!asset || !asset.src || byKey[asset.key]) return;
      byKey[asset.key] = true;
      const id = 'character-motion-' + String(bodyId + '-' + slot)
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      out[id] = Object.assign({}, asset, {id, assetRole:'animation', motionSlot:slot});
    });
  });
  return out;
}

// ============================================================ 04 motion sets

/** Which bundled motion fills which animation-SET entry.
 *
 *  This is the difference between "the roll works and nothing else does" and a
 *  character that actually walks. Two systems play clips:
 *
 *    - `animations.<slot>`  one-shot actions, played by name through playAction()
 *    - `animationSet`       the locomotion state machine
 *
 *  Only the first was given assets. The set's entries carried `asset: null` and a
 *  clip NAME like 'Idle' or 'Walking', and `findClip()` resolves a name against the
 *  loaded clips - but every bundled take is called `mixamo.com`, so no name ever
 *  matched. Its single-clip fallback (the thing that makes a Mixamo take usable)
 *  only engages when an asset is present, so locomotion resolved to nothing while
 *  the roll - a one-shot with an asset - worked. Hence: only the roll worked.
 *
 *  Entries with no bundled equivalent (backward, the diagonals) are deliberately
 *  left without an asset rather than pointed at an approximation; the controller
 *  already blends from what exists. */
const SET_ENTRY_SLOTS = Object.freeze({
  // the default locomotion set
  'idle':'idle',
  'walk-forward':'walk',
  'run-forward':'run',
  'strafe-left':'strafeLeft',
  'strafe-right':'strafeRight',
  'run-strafe-left':'runStrafeLeft',
  'run-strafe-right':'runStrafeRight',
  'walk-backward':'walk',        // played in reverse; see the set below
  'jump-rise':'jump',
  'fall-loop':'fall',
  'landing':'land',
  'landing-moving':'landMoving',
  'interact':'interact',
  // the third-person combat set, which names its lateral entries differently
  'walk-left':'strafeLeft',
  'walk-right':'strafeRight',
  'run-left':'runStrafeLeft',
  'run-right':'runStrafeRight',
  // The combat set's remaining nine entries. They were declared from the start,
  // with a clip name and no asset, so NINE of its twenty-one played nothing: a
  // character strafing diagonally or backing away had no pose at all. The clips
  // were in the shoot pack sources the whole time.
  'run-backward':'runBackward',
  'walk-forward-left':'walkForwardLeft',
  'walk-forward-right':'walkForwardRight',
  'walk-back-left':'walkBackLeft',
  'walk-back-right':'walkBackRight',
  'run-forward-left':'runForwardLeft',
  'run-forward-right':'runForwardRight',
  'run-back-left':'runBackLeft',
  'run-back-right':'runBackRight',
});

/** Give every entry of an animation set the bundled clip for its body.
 *
 *  Returns a new array. An entry already carrying an AUTHORED asset is left alone,
 *  the same rule the slots follow - only bundled and empty ones are filled. */
function applyBodyToAnimationSet(entries, bodyId){
  if(!Array.isArray(entries)) return entries;
  const available = motions(bodyId);
  return entries.map(entry => {
    if(!entry || typeof entry !== 'object') return entry;
    // Action entries are a second persisted copy of animations.<slot>. Older
    // levels therefore kept Vault Over Box here even after animations.vault was
    // migrated to Front Flip, and the mixer gives this entry precedence. Treat
    // bundled action entries exactly like bundled locomotion entries while
    // preserving every imported/authored asset.
    const actionSlot=entry.state==='action'?String(entry.action||entry.slot||''):'';
    const slot = SET_ENTRY_SLOTS[String(entry.id || '')] || (actionSlot&&available[actionSlot]?actionSlot:null);
    const wanted = slot ? available[slot] : null;
    if(!wanted) return entry;
    if(entry.asset && !isBundled(entry.asset)) return entry;   // authored, keep it
    if(entry.asset && entry.asset.src === wanted.src) return entry;
    return Object.assign({}, entry, {asset:wanted});
  });
}

// ================================================================== 05 apply

/** Put `config` on the body named by `bodyId`, in place of whichever bundled body
 *  it currently carries.
 *
 *  Only bundled references are replaced. An author who imported their own model,
 *  bound their own clip to a slot, or picked their own shirt colour keeps all of
 *  it - the swap is not allowed to overwrite authored work, or flipping the
 *  select twice would erase it. Returns the same object when there is nothing to
 *  do, so callers can use it on every normalize without churn. */
function applyBody(config, bodyId){
  if(!config || typeof config !== 'object') return config;
  const body = resolveOrDefault(bodyId == null ? config.bodyType : bodyId);
  const desiredModel = bodyAsset(body.id);
  const currentModel = config.model;
  const modelIsBundled = isBundled(currentModel);
  // An absent model counts as ours to fill: a Pawn with `bodyType` set and no
  // model is a template that has not been given its body yet.
  const takeModel = !currentModel || modelIsBundled;
  const alreadyRight = takeModel && currentModel && currentModel.src === desiredModel.src;

  const desiredMotions = motions(body.id);
  const animations = Object.assign({}, config.animations || {});
  let motionsChanged = false;
  Object.keys(desiredMotions).forEach(slot => {
    const bound = animations[slot];
    const asset = bound && typeof bound === 'object' ? bound.asset : null;
    // Replace an empty slot or one still holding a bundled clip; leave an
    // authored clip, and leave a plain clip NAME the author typed.
    if(bound && !asset) return;
    if(asset && !isBundled(asset)) return;
    const next = {clip:desiredMotions[slot].name, asset:desiredMotions[slot]};
    if(!bound || !asset || asset.src !== desiredMotions[slot].src){ animations[slot] = next; motionsChanged = true; }
  });

  const appearance = Object.assign({}, config.appearance || {});
  let appearanceChanged = false;
  Object.keys(body.appearance).forEach(key => {
    if(!isDefaultColour(key, appearance[key])) return;   // the author picked this one
    if(appearance[key] !== body.appearance[key]){ appearance[key] = body.appearance[key]; appearanceChanged = true; }
  });

  // The locomotion set needs the same treatment as the slots, or the character owns
  // its actions and cannot walk.
  const animationSet = applyBodyToAnimationSet(config.animationSet, body.id);
  const setChanged = animationSet !== config.animationSet &&
    JSON.stringify(animationSet) !== JSON.stringify(config.animationSet);

  if(alreadyRight && !motionsChanged && !appearanceChanged && !setChanged && config.bodyType === body.id) return config;
  const next = Object.assign({}, config, {bodyType:body.id, animations, appearance});
  if(Array.isArray(config.animationSet)) next.animationSet = animationSet;
  if(takeModel) next.model = desiredModel;
  return next;
}

root.LK_RUNTIME_CHARACTER_BODIES = Object.freeze({
  TARGET_HEIGHT, DEFAULT_BODY, BODIES, OPTIONS, SHARED_MOTION_DIR, ASSET_PREFIX,
  resolve, resolveOrDefault, fbxAsset, motionAsset, bodyAsset, isBundled, isDefaultColour, motions,
  motionAssets, SET_ENTRY_SLOTS, applyBodyToAnimationSet, applyBody,
});

})();
