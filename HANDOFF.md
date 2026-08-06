# Handoff — character animation system, 2026-08-04

Written for whoever picks this up next, human or model. It states what is DONE (so it
is not redone), what is NOT done, and the defects found but deliberately left alone.

Every claim below was verified by running something. Where it was not, it says so.

---

## 1. The rules this repo enforces, and why

Break these and you will reproduce failures that already cost a working level.

**A clip must be verified to PARSE before it is registered.**
```
node scripts/measure-clip-direction.mjs <file.fbx>
```
Three files in `models/characters/shared/` cannot be read by THREE.FBXLoader
(`jumping-up.fbx`, `stand-to-cover-low.fbx`, `cover-to-stand-a.fbx`, "Unknown property
type"). Registering them put unreadable files into the animation library's load list:
the library never completed, `bind()` never succeeded, and the character lost **every**
animation — not one clip, all of them — on a brand-new level. A bad file does not cost
you one animation, it costs the set. `tests/default-character-bodies.test.js` guards
this and lists the forbidden names.

**A clip's name is a claim; its root motion is the measurement.** The same tool prints
the real travel direction. In this engine forward is `+Z` and the body's own LEFT is
`+X`, so a leftward take shows `dx > 0`. Several source files are mislabelled — see §4.

**Tests must EXECUTE the code, not grep its source.** In this repo a source-text
assertion passed while the function it covered crashed on every frame, and three
separate regexes matched a code COMMENT instead of code and reported false results. If
you must assert on source, match a CALL, never a phrase that could appear in prose.
`tests/character-weapon-pose.test.js` is the model: real THREE bones, real functions.

**Every `<script>` must carry a `?v=` tag.** `tests/cache-tag-freshness.test.js` now
requires it and fails otherwise. The local servers send `Cache-Control: no-store` so
staleness is invisible there, but the published site has no such header and an untagged
file stays in a visitor's cache indefinitely — a fix simply never reaches them.

**A missing clip must degrade silently.** A missing property in the weapon-pose maths
once threw every frame and abandoned the rest of the frame: camera, HUD and animations
all stopped while input still arrived and the weapon still fired. It looked alive while
being mostly dead.

---

## 2. What landed and is verified

- **Eight-way locomotion on the ordinary Character.** It had only forward, two strafes
  and a reversed walk; diagonals blended two cardinal poses and running backward had no
  take at all. Now 22 entries, every one bound except `interact`. The selector was
  driven directly: each of the eight directions picks its own clip and the cardinals did
  not move.
- **The combat set's nine dead entries.** Every diagonal and the straight run backward
  carried a clip NAME and `asset: null` from the day the set was written, so nine of
  twenty-one resolved to nothing. All 21 resolve now.
- **`weapon.grip`, authorable.** Hand placement was hardcoded literals and the grip was
  *derived* from `preset !== 'pistol'`. Now `{hands, trigger, support, aim, fire}` with
  aim and fire as separate additive offsets. Defaults reproduce the old literals, so
  nothing moved visually until authored.
- **Pawn Studio hand authoring.** Draggable trigger/support dummies, a grip selector and
  a Hold / Aiming+ / Firing+ layer switch. The preview runs the *shipped* pose layer, not
  an editor approximation.
- **Action clips hooked**: crouch stance, hang and ledge shimmy, climb up/down, slide,
  and cover enter/exit/shuffle, each with a degrade path asserted.
- **Two death takes**, assigned by measurement rather than filename (§4).
- **Saved-level migration** for the mirrored strafe directions, versioned so it runs once.
- **First-person presentation separated.** The Character owns body, camera, input and
  mixer; `FirstPersonViewPawn` owns only the optional classic arms/weapon visual and
  tears it down outside that presentation.
- **Grounded stairs and complete fallback legs.** Human knee/foot roles, quadruped
  chains and partial GLB rigs consume measured step telemetry without synthesizing Jump.
- **Player assignment and isolation.** None/P1-P4 uses one transactional slot registry
  across Character, Vehicle, Animal, Soccer and Sketchbook; ownership release clears
  transient camera/input/shot state.
- **Camera output, P2P, UI and procedural assets.** One camera resolver serves Editor,
  runtime and split-screen; P2P has epochs and host election; authorable UI Logic
  Elements and nine serialized procedural Engine Assets are wired through export.

---

## 3. Still open or awaiting hardware verification

### 3a. Two slots still have no dedicated clip
`landCrouch`, `interact`.

The Advanced Animations folder supplied on 2026-08-04 filled the previous twelve
traversal/melee/reaction gaps: `slide`, `vault`, `mantle`, `climb`, `hang`,
`climbUp`, `climbDown`, `ledgeShimmyLeft`, `ledgeShimmyRight`, `punch`,
`knifeAttack`, `hitReact`. Every source parsed through the real FBXLoader and was
copied into `models/characters/shared/` before registration.

`climbDown` intentionally shares `climbing-to-top.fbx` with `climbUp` and carries
`playbackRate:-1`; the mixer starts negative playback at the clip's last frame.
Do not replace it with `Climbing Down.fbx` unless a visual comparison proves that
take is preferable. `Sprint To Wall Climb.fbx` is also retained only in
`models_sources` as an optional future transition.

Before Advanced Animations was supplied, the original sources were searched exhaustively: all 168 FBX in the repo, the user's home directory to
depth 7, drives D:/E:/F:/R: for anything matching
`hang|shimmy|vault|mantle|climb|ledge|knife|punch|slid|parkour`, and both 110 MB project
snapshots. **`Action Adventure Pack.zip` is not a traversal pack** — its 23 files are
the same takes as `Mannequin-Male/`, renamed. The four packs present (Action Adventure,
Standard Locomotion, Shooting, Soccer) hold ~100 takes of locomotion, cover, crouch,
aiming, jumps, turns and deaths, and **zero traversal or melee**.

Near misses were measured and rejected rather than fudged: `jump down` as `landCrouch`
(hips dip to 78 cm; a crouch idle sits at 46 — a knee bend, not a crouched landing);
`jumping up` as `climbUp` (0.23 s, in place); the cover sneaks as `ledgeShimmy`
(standing, not hanging).

**To fill the remaining two**: download the Mixamo takes that contain them, copy into
`models/characters/shared/`, kebab-case rename, verify with the direction tool, then one
`shared(...)` line each in `motions()` in `js/runtime/character-bodies.js`, plus an
`ANIMATION_SLOTS` row in `js/logic/logic-templates-character.js` if authors should be
able to rebind it.

Until a real `landCrouch` arrives, crouched landing degrades to `landMoving` and
then `land`; `jump down.fbx` remains deliberately rejected because it returns to
standing rather than finishing crouched.

### 3b. First-person browser performance needs remeasurement
The ownership separation is implemented. Full-body eye view retains one animated body;
classic shooter arms are a separate visual Pawn and are destroyed when not selected.
The duplicate body + arms + weapon workload that survived the earlier investigation is
therefore removed in code, but the original close-camera frame-rate symptom still needs
measurement on a real browser/GPU before being declared closed.

### 3c. P2P transport topology
Host election, authority epoch, Player 1 reassignment and replica continuity are in.
The transport remains a star: if the old host was the only connection between two
guests, they must exchange a fresh invite/answer before the elected host can carry the
other guest. Do not describe election as a complete mesh-network migration.

### 3d. WebGPU hardware soak
The generated Three r185 compatibility source now retires native resources only after
`queue.submit` and `queue.onSubmittedWorkDone`, preserves external
`ShadowDepthTexture` ownership and avoids global GPU prototype monkey patches. Unit and
lifecycle tests are green. WebGPU must remain experimental with WebGL fallback until a
long Editor/Play/resize/menu/reload run on the affected Windows browser completes
without validation errors, a black viewport or device loss.

### 3e. No longer open from the previous handoff
Soccer/AI state bleed, Player assignment/conflict guard, first-person separation,
grounded stair poses, P2P election/epochs, UI Elements and the procedural asset library
are implemented and have executable regression coverage. The only intentional content
gap in this Character tranche is the two honest missing clips in §3a.

---

## 4. Findings and current status

**4a. `shared/falling-to-landing.fbx` is retargeted.** The Soccer take is rigged
`mixamorig5:` rather than `mixamorig:`, but `soccer-locomotion.js` now canonicalises
numbered Mixamo namespaces and retargets each external clip onto the active mannequin.
`tests/character-core.test.js` executes the numbered-namespace path. Do not re-open this
as a missing-animation diagnosis unless a browser capture disproves the runtime test.

**4b. Four versioned files currently fail the real FBXLoader parse.** They are
`shared/jumping-up.fbx`, `shared/stand-to-cover-low.fbx`,
`shared/cover-to-stand-a.fbx` and `mannequin-male/idle-alt-2.fbx`.
`mannequin-male/walking.fbx` parses today. The readable export in
`Action Adventure Pack.zip` remains the repair source; never register a replacement
until `scripts/measure-clip-direction.mjs` has parsed it.

**4c. `logic-templates-fps.js` binds no `animationSet` at all.** Its character has no
locomotion, which is why that template must stay on `presentation:'arms'`: switching it
to `'body'` shows an unanimated body and walking, running and jumping all disappear.
That happened once, from a forced migration, and emptied a working level. A test holds
the default in place and fails if a set is ever bound there, as the reminder to revisit.

**4d. `coverLow` is author-facing now.** `AnimCoverEnterLow` binds the readable
`cover-low-enter.fbx` independently from the high-cover transition.

**4e. The pre-existing red Enemy Outpost harness is repaired.**
`tests/game-mode-level-templates.test.js` now registers and instantiates the same
`logic-template-player-first-person` contract used by the arena. The original engine
assertions are unchanged and pass against a real player graph.

---

## 5. How to verify the whole thing

```
npm test                     # everything, including the browser suite
npm run test:character       # bodies, locomotion, weapon pose
npm run test:traversal       # abilities and action clips
npm run test:pawn-studio     # hand authoring
npm run test:first-person    # presentation Pawn, weapon visual and pickups
npm run test:input           # mapping, assignment and conflict isolation
npm run test:ui-elements     # authorable UI runtime and export assets
npm run test:procedural-assets # parametric Engine Asset recipes and rebuild
npm run test:camera          # shared Editor/runtime/split-screen authority
npm run test:rendering       # WebGL/WebGPU lifecycle contracts
npm run test:cinema          # shared spline/runtime parity
node tests/p2p-logic.test.js # protocol, replicas, epochs and host migration
npm run test:cache-tags      # every script tagged, and tags fresh
```
`npm run test:cache-tags` is the one that tells you whether a fix will actually reach a
browser. Run it after every change to a `js` file.
