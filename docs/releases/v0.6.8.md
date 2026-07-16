# Release Notes: v0.6.8

## v0.6.8 - Soccer Pawn Foundation & Penalty Shootout Mode

### Release Status

- Status: in development.
- Tag target: `v0.6.8`.
- Scope: first non-vehicle gameplay mode. Soccer Pawn foundation on Pawn Core, penalty shootout system authored entirely inside the engine editor, and a generated regulation soccer stadium level.

### Added

#### Landing welcome overlay (`index.html`)

- New first-run welcome overlay on the index landing with English/Italian copy, a language toggle, release highlights for the new character movement/soccer work, and a local "do not show again" preference.

#### Soccer Pawn (`js/runtime/soccer-pawns.js`)

- New humanoid `Soccer Pawn` built on the shared Pawn Core contract and registered inside the same `LOT_KING.pawns` registry as Vehicle Pawns, sharing P1-P4 possession slots and Play Preview lifecycle.
- Five roles: `striker`, `winger`, `midfielder`, `defender`, `goalkeeper`. Each role seeds its own default action set and suggested Mixamo animation clips; changing the role live re-seeds slots that were not overridden per instance.
- Free-movement character controller: heading-relative move input (lateral X / forward Z / sprint), acceleration smoothing, velocity-facing turn and per-instance walk/run/sprint speeds.
- Role actions with animation blending and gameplay events: `shoot`, `pass`, `cross`, `tackle`, `save`, `diveLeft`, `diveRight`, `celebrate`, `defeat`. Goalkeeper dives apply a scripted lateral displacement with configurable distance, duration and save reach.
- Appearance live edit per duplicated instance: shirt / shorts / socks / hair / skin colors are applied by material-name heuristics that work both on the placeholder rig and on imported Mixamo GLB materials (materials are cloned per instance, so duplicates never share tints).
- Generic `applyBinding` dispatch so exposed template variables (role, movement, animations, appearance, keeper, camera) live-update the Pawn from the Inspector like the Player Car does.

#### Generic character controller (`js/runtime/character-movement.js`)

- Reusable ground-locomotion controller for humanoid Pawns (soccer today; human standard, police, civil tomorrow). Design adapted from `three-player-controller` without adding its dependencies: **camera-relative free movement** (or heading-relative mode), walk/run/sprint smoothing, **gravity + jump** (configurable jump height/gravity/air control), ground detection and pushback against the engine arcade collider lists (walls, pillars, goal posts).
- Camera **view presets**: third person, close third person and first-person lite, applied through `camera.view` and switchable live from the Inspector.
- The Soccer Pawn delegates its movement to this controller; `Soccer Jump` node + Space key wired in the template.

#### Animation library GLB + Inspector pickers

- **Character model GLB picker** for Soccer Pawns: the Logic Inspector now has a dedicated Soccer Pawn Model section that assigns a compatible humanoid GLB from Assets or imports one from disk, saves it into Assets, applies it to the selected Logic Element and resets the placeholder scale so the character appears immediately.
- Imported GLB assets now store useful compatibility metadata (clip names/count, animation presence, mesh/skinned-mesh/bone counts and rigged flags), so Soccer Pawn model and animation-library dropdowns can show likely-compatible assets instead of every unrelated GLB.
- **Separate animation-only GLBs are now supported**: `soccerPawn.animationLibrary` references a clips-only Mixamo GLB whose animations merge with the model GLB clips (same skeleton bone names). Works even when the model GLB has zero clips (the locomotion controller creates and drives its own mixer).
- Inspector: the **Animation Library** row is a dropdown of compatible GLB assets already in the library, plus **Import GLB from disk...** which imports into the asset library and assigns it in one step.
- Inspector: every **animation slot** (Idle, Shoot, Save, Dive...) is now a combo field with a native dropdown listing all clips found in the model GLB and in the assigned animation library, while still accepting free text.

#### Motion Blend locomotion (`js/runtime/soccer-locomotion.js`)

- Blendspace-lite controller inspired by Unreal-style motion blending: it damps the character velocity toward the desired input and adds a short look-ahead prediction of the velocity curve, then cross-blends `idle / walk / run / strafeLeft / strafeRight` clip weights from the predicted speed and lateral direction.
- Stride matching-lite: walk/run playback speed scales with the real character speed.
- One-shot action layer (shoot, save, dive...) that suppresses locomotion weights, plays the clip once and restores the blend, with completion callbacks feeding gameplay events.
- Forgiving Mixamo clip resolution: slots match clip names fuzzily and missing clips degrade to the nearest available one (no walk clip -> run at reduced timescale; nothing at all -> gameplay timing still works).

#### Soccer ball & goal detection (`js/runtime/soccer-ball.js`)

- Regulation size-5 ball (radius 0.11 m) with a generated pentagon-pattern texture, arcade flight physics (gravity, ground bounce, drag) and Magnus curve for bent shots.
- `Kick` API toward a world target with power, lift and curve; goal-line crossing detection against registered goal frames (regulation 7.32 x 2.44 by default) including crossbar/post bounds on the crossing point.
- Goalkeeper save detection against keeper Pawn reach (extended while diving); stopped/out-of-bounds detection.
- Balls register as non-possessable Pawn records, so they step through `GAME.pawns.stepAll` and are disposed with the Play session.
- Events on the shared Pawn event bus: `OnBallKicked`, `OnGoalScored`, `OnBallSaved`, `OnBallOut`.

#### Penalty shootout flow (`js/runtime/penalty-flow.js`)

- Referee state machine: `ready -> aim -> shot -> resolved -> next`, alternating teams, configurable kicks per team, sudden death and early mathematical decision.
- Ball outcomes are consumed automatically from the event bus; score and per-kick history are tracked per team.
- Events: `OnPenaltyKickReady`, `OnPenaltyPhaseChanged`, `OnPenaltyResult`, `OnShootoutFinished`.

#### Logic Element authoring

- New soccer node pack (`js/logic/logic-nodes-soccer.js`) registered through the new `window.LK_LOGIC_NODE_PACKS` extension point: Soccer Pawn control/state nodes, ball spawn/kick/state/goal-frame nodes, penalty configure/start/state nodes and nine soccer gameplay event nodes.
- `LK_LOGIC_TEMPLATES.register(...)` API so template packs live in their own files; the soccer pack registers:
  - `Template - Player Soccer Element`: editable Soccer Pawn starter with role selection up to goalkeeper, Mixamo GLB placeholder rig, per-action animation clip slots (labeled with the expected clip type: shoot/tiro, save/parata, dive/tuffo...), motion-blend tuning, kit color live edit, camera setup and a wired possess + free-movement + action-keys graph.
  - `Template - Penalty Shootout Manager`: registers the regulation goal line, spawns the ball on the penalty spot (11 m), configures teams/kicks and runs the shootout with event-driven prints ready to be replaced by HUD logic.
- Exposed-variable binding dispatch in the logic runner now delegates to non-vehicle Pawns via `pawn.applyBinding`, keeping vehicle binding behavior untouched.

#### Soccer stadium level (`js/runtime/soccer-stadium.js` + editor Add menu)

- New editor action `Add > Level > Soccer Stadium (Penalty)`: generates a complete, fully editable stadium out of standard editor primitives and lights (everything saves with the level and can be moved/edited per object).
- Regulation measures: 105 x 68 pitch, goals 7.32 x 2.44 with posts/crossbar/net panels, penalty areas (16.5 x 40.32), goal areas (5.5 x 18.32), penalty spots at 11 m, center circle and penalty arcs at 9.15 m radius.
- Stands on four sides with three stepped tiers, placeholder fan blocks in team colors, players tunnel and public gates, corner flags, stadium flags and four floodlight towers with real point lights.
- `gameplayAnchors()` helper exposes penalty spots, goal centers/headings and kickoff for wiring the shootout templates to the generated level.

### Changed

#### Critical project export and Play Game regression fixes

- Fixed a serious post-refactor race where selecting a gameplay level could start its audio, physics and logic while the 3D menu-role scene remained rendered. Reload auto-launch now declares ownership before menu-background polling, so the selected gameplay project is the scene actually applied to the frame.
- Fixed slow menu-role and asset preloads reopening `Quick Play / Choose Track` over a session that had already started.
- Hosted/static project boot now waits for the bundled LKEP installation before applying a scene and reconciles the published level catalog with the current export, preventing levels left in browser storage by an older FTP or GitHub Pages deployment from leaking into the new build.
- Hidden included `editor-menu` / `game-menu` levels are now resolved directly from exported `embeddedLevels`: they can still render as the 3D menu background without appearing as selectable gameplay levels.
- Gameplay catalogs now honor exported level visibility as well as level role, and launch intent survives the reload needed to switch away from a menu-role scene.
- Updated runtime script cache keys so static hosts and GitHub Pages fetch the corrected store and game-flow code after deployment.
- Externalized the menu demo's `big_parking_lot` GLB from the LKEP and optimized its oversized textures without Draco/Meshopt-only runtime requirements. The model is now a root-relative `models/` asset, reducing `demo-project.lkep.json` from about 190 MB to about 19 MB and keeping every committed file below GitHub's 100 MiB limit.

- `js/logic/logic-templates.js`: built-in templates now register through the shared `register()` API (external packs supported).
- `js/logic/logic-nodes-mvp.js`: `createRegistry()` consumes `window.LK_LOGIC_NODE_PACKS`.
- `js/logic/logic-services.js`: pawn service branches on `graph.soccerPawn`, new `soccer` service exposes ball/penalty systems to nodes.
- `js/runtime/vehicle-pawns.js`: registry exposes `claimPlayerSlot` / `releasePlayerSlot` so non-vehicle Pawn kinds share the same possession slots.
- `js/runtime/logic-elements-runner.js`: generic Pawn binding fallback before vehicle-specific binding dispatch.
- Project `.lkep` export now opens a level picker with separate **Included** and **Visible** choices. Included levels are written into `embeddedLevels`; hidden included levels are restored on import but stay out of normal level lists, which lets `editor-menu` and `game-menu` scenes travel with the project without appearing as regular work/play levels.
- Project `.lkep` export no longer duplicates the active/root level inside `embeddedLevels`; the active level remains the root project payload and other selected levels are embedded.
- Playable ZIP export level selection is now gameplay-only: `editor-menu` and `game-menu` levels stay in project exports and menu-background workflows, but never appear in Play Game or exported playable level selection.
- Playable export manifests and bootstrap level indexes now mark exported levels as `levelRole: "gameplay"` so the runtime catalog keeps menu/editor scenes out of launchable track cards.
- Landing music now starts from the welcome-overlay close/continue gesture, while the Engine Editor button stops menu music immediately and leaves the loading-wait music choice to the user.
- Version bump to `0.6.8` in `index.html` landing, `js/lot-king.js` and page script tags.

### Testing

- Focused Chromium regression verification confirms the chosen gameplay level owns `LK_STORE` in active mode, no menu background remains assigned, and the selection overlay stays hidden after delayed preloads finish.
- JavaScript syntax checks pass for the corrected scene-store, game-flow and runtime composition.
- glTF validation reports no errors for the optimized menu model; retained warnings concern runtime-generated tangents and legacy non-power-of-two source textures.
- New `npm run test:soccer` (`tests/soccer-core.test.js`): node pack registration, template validation, config normalization, shared-registry pawn movement/possession/dispose, penalty flow (early decision + sudden death), goal frame defaults and stadium builder measures.
- `npm run test:logic` still green after the template/nodes/services refactors.

### Known Limitations / Next Steps

- The editor does not yet provide a complete reusable authoring layer for arbitrary game objectives and high-level rules; this is active Logic Element/editor work rather than a finished no-code game toolkit.
- The runtime still uses the legacy Three.js r128 baseline while upstream has reached npm 0.185.1, the r185 generation (July 2026). A staged migration is planned to modernize loaders, addons, color management, shaders, post-processing and newer WebGL/WebGPU paths; controls currently using guarded fallbacks will still require individual migration and parity testing.
- Locomotion blending needs a Mixamo GLB with multiple clips to shine; with a single clip the controller falls back to that clip.
- Penalty aiming UI (direction/power meter) is intentionally left to Logic Element authoring; the template uses direct kick nodes.
- Full-match soccer (teams, AI, referee rules beyond penalties) is future scope; this release focuses on the penalty shootout foundation.
- HUD is still the shared driving HUD; role-aware UI profiles are a planned follow-up.
