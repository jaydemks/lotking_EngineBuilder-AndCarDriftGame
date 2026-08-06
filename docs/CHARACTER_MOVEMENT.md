# Character Movement and Animation Authoring

## Overview

Lot King exposes two editable humanoid Logic Element starters:

- **Template - Player Character (Normal)** is the reusable base for normal, civil, police and future on-foot gameplay.
- **Template - Player Soccer Element** adds football roles and actions such as shoot, pass, tackle, save and goalkeeper dives.

Both use the same configurable camera/heading-relative movement controller, collision resolution, gravity, jump, camera possession and motion-blend locomotion. Game-specific behavior belongs in presets and Logic nodes rather than in duplicated movement code.

## Walking vs. running

Movement uses two explicit gaits, not the length of the movement input: holding a movement direction walks at **Walk Speed**; holding **Sprint** at the same time runs at **Run Speed x Sprint Multiplier**. This matters because a keyboard direction key is always "fully pressed" (magnitude 1), so a gait chosen from input length alone could never produce a real walk — only Sprint decides the gait. Analog gamepad sticks still scale speed smoothly inside whichever gait is active.

Sprint is its own input action (default `Shift` on keyboard, right bumper on gamepad), independent from the vehicle Handbrake action it used to be read from. It resolves through the same shared Player 1-4 action/device system as every other control, so it can be remapped from Settings -> Controls like any other action.

## Placeholder animation

Every Character/Soccer Pawn works before all final animation files are assigned. With no Main Mesh, `character-placeholder-locomotion.js` animates the primitive T-pose. With a compatible humanoid/Mixamo Main Mesh, `mixamo-placeholder-clips.js` instead generates rotation-only clips directly on that skeleton's rest pose for Idle, Walk, Run, both strafes, Jump, Land, Shoot, Pass, Cross, Tackle, Save, both goalkeeper dives, Celebrate, Defeat and Interact. The goalkeeper variants use a bent ready stance, two-handed catch and directional full-body dives. They are visible in Pawn Studio and Play Preview and never write position or scale tracks.

These generated clips are fallback content, not replacements for mocap: an imported GLB/FBX take always has priority as soon as it binds. This lets an incomplete character remain testable while every slot can be replaced independently later.

## Creating the default character level

In the editor choose **New Level**, then select **Sketch Street - Character Movement**. This is a native reconstruction of the supplied `sketch-street_v2.html` concept, not a generic flat test map. The generated editable level contains:

- one possessed **Player Character (Normal)** Logic Element;
- the original road and side ground profile, including the downhill slope toward the sea;
- eight individual houses with editable bodies, roofs, windows, frames, bars and doors;
- the vending machine and its twelve cans, road sign, AC unit, plants, walls, guardrail, utility poles and sagging cables;
- the green scooter and distant sea/land cards;
- one possessed **Player Character (Normal)** and one unpossessed **Talkable Civil NPC** with the original two-message proximity interaction on `F`.

Every concept mesh was originally generated inside the one-file Three.js demo. It has therefore been converted into named native editor primitives instead of copied as an opaque external asset. The template works before a custom character model is imported and remains portable in an LKEP/playable export.

## Creating a ready-to-play penalty shootout level

In the editor choose **New Level**, then select **Penalty Shootout Stadium (Soccer)**. This is a second worked-example level template (`js/runtime/penalty-shootout-level-template.js`), built the same way as Sketch Street: it turns generator output into normal editable `scene.added` entries rather than an opaque prefab, so every stand, floodlight, goal post and marking stays selectable and editable afterward.

The generated level contains:

- a full regulation stadium (`js/runtime/soccer-stadium.js`: 105 x 68 m pitch, markings, both goal frames, four stepped stands with placeholder fans, tunnel/gates, corner and stadium flags, four floodlight towers);
- one possessed **Penalty Kicker (Player)** (`Template - Player Soccer Element`, striker role) a short run-up behind the north penalty spot, facing the goal, controlled by Player 1;
- one unpossessed **Penalty Goalkeeper** (`Template - Player Soccer Element`, goalkeeper role) standing on the north goal line with predictive penalty AI enabled, ready to be possessed by Player 2 for manual Q/E dives (manual possession suspends the AI);
- one **Penalty Ball** (`Template - Soccer Ball`) in `penalty` mode, locked on the spot until a valid kick;
- one **Penalty Goal Sensor** (`Template - Soccer Goal Frame`) on the real goal line, independent from the visible posts and net;
- one **Penalty Shootout Manager** (`Template - Penalty Shootout Manager`) linked to those two elements through their stable `BallId` and `GoalId`, already configured with the stadium coordinates.

Because the goalkeeper's starter graph auto-possesses Player 1 on `On Start`, its `ControllerPlayerId` exposed variable is authored as `-1` (`None`) in this template so it does not fight the kicker for the same Player slot; the Pawn's own `playerId`/`possessed` fields are set the same way. This is the pattern to copy when placing a second character-based Pawn from the same starter template into one level: change `ControllerPlayerId`, not just the Pawn config.

Use this level as the reference for building further soccer scenarios (free kicks, small-sided matches): duplicate it, keep the stadium, and swap the Penalty Shootout Manager and Pawn placement for different Logic.

## Composing soccer gameplay

Soccer gameplay is deliberately assembled from small independent Logic Elements:

- **Classic match:** place one `Template - Soccer Ball` in `match` mode, two `Template - Soccer Goal Frame` sensors with distinct IDs/teams, and as many `Template - Player Soccer Element` Pawns as required. Set each Pawn's role independently; a goalkeeper is the same reusable Pawn with `Role = goalkeeper`. A Penalty Manager is not used.
- **Penalty shootout:** place a striker Pawn, a goalkeeper Pawn, one Ball in `penalty` mode, one Goal Frame sensor and one Penalty Shootout Manager. Give the Ball/Manager the same `BallId` and the Goal/Manager the same `GoalId`. The ready-made Penalty Shootout Stadium creates this five-element composition automatically.

The Manager is the referee, not the ball or the goal mesh. It follows only the configured ball, alternates Team A and Team B, stores every goal/save/miss, applies the early-win rule, enters sudden death when needed and emits `OnPenaltyKickReady`, `OnPenaltyResult` and `OnShootoutFinished` for an authored HUD or other Logic. For compatibility, an older scene containing only Pawns plus a Manager still works because the Manager can create missing ball/goal runtime objects; explicit Ball and Goal Logic Elements are the recommended editable setup.

## Choosing a character preset

The generic Character Pawn currently provides these starting profiles:

- `normal`: balanced third-person movement;
- `civil`: slower acceleration, running and jump;
- `police`: faster, more responsive and more athletic.

Choose the preset first, then tune the exposed Movement fields for a specific subtype. For example, a civilian child, an adult NPC and a fleeing civilian can all start from `civil` while keeping separate speeds and jump settings.

Soccer uses roles rather than these generic presets: striker, winger, midfielder, defender and goalkeeper. Role-specific actions stay in the Soccer Logic Element while the underlying movement stays shared.

Soccer defaults to **Character heading** movement space and **Keep heading / strafe** facing. W/S move along the player's forward axis while A/D move laterally without automatically turning the body, allowing the Strafe Left/Right motions to be selected. Pawn Studio exposes both Movement Space and Facing Behaviour: choose `movement` facing for a generic character that should turn toward velocity, or `heading` for football, aiming and lock-on movement.

During a penalty's Ready/Aim phase, mouse or right-stick aim is active before the shot button is held. The target, reticle and complete Pawn heading move together; beginning the charge inherits that exact preparation aim instead of resetting to the center.

## Where to assign the model and animations

Select the Character or Soccer Logic Element in the scene.

1. Open **Pawn Studio → Main Mesh** and assign a rigged humanoid GLB or FBX-derived asset. Set normalized height and final world scale there.
2. If the model GLB already contains animations, they remain available as Main Mesh clips.
3. Build the Motion Animation Set. Every entry selects its own FBX/GLB, clip, physical state, direction, nominal speed and selection priority. FBX sources are converted by the default plugin while their originals remain available for direct preview.
4. Animation-only files may omit skin geometry but must retain an armature and keyframes. Common Mixamo/Blender namespaces and compatible humanoid skeletons are rebound/retargeted automatically; unrelated hierarchies are reported as incompatible.
5. Runtime selection ranks and blends the best matching entries from actual local velocity and physical phase. Separate sources remain distinguishable even when exporters give every file the same clip name, such as `mixamo.com`.
6. See `CHARACTER_ANIMATION_SET.md` for the schema and selection model.

### Root motion rule

Use **in-place animations with root motion disabled**. The Character Movement controller owns world translation, collision and jump height. Imported position and scale tracks are removed so an animation cannot lift the Pawn mesh or move it away from its collider. Correct a clip visually with its isolated Pawn Studio slot offset or Root timeline keys; those authoring layers move the visible Main Mesh while the gameplay pivot remains fixed.

Recommended exports:

- keep the skeleton root at the origin;
- remove forward/lateral root translation from walk, run and strafe clips;
- do not bake jump height into root translation;
- keep a consistent orientation/rest pose and recognizable humanoid bone mapping; Pawn Studio compensates compatible rig-unit differences but cannot infer an unrelated hierarchy;
- trim looping clips so their first and last poses blend cleanly.

### Surface-adaptive traversal

Vault, mantle, ledge hang and climb use the same arcade collider world as normal
movement. A broad ledge lookup selects one collider, then one exact surface probe
measures its near face, far face/depth, top and outward normal. That result produces
three independent animation stages:

1. a named root target used by the traversal motion-warp path;
2. named left/right hand and foot effectors plus elbow/knee pole targets;
3. hand and foot contact windows that blend the IK correction over the authored
   full-body clip (hands establish the ledge first, feet follow).

The `Traversal / Contact Adaptation` Inspector category exposes root-warp and IK
weights, contact spacing/offset and phase limits. `Show Probe + IK Dummies (Editor)`
draws the hit, normal, root, effectors and joint chains in Editor and Play-in-Editor.
Those objects are helper-only and are never created in standalone or exported
gameplay. The debug lines reuse one retained GPU buffer so visual diagnostics do not
create per-frame WebGPU resources.

## Animation slots

| Slot | Expected clip |
|---|---|
| Idle | Looping, in-place neutral standing pose. |
| Walk | Looping, in-place forward walk. Runtime speed supplies translation. |
| Run | Looping, in-place run or jog. |
| Strafe Left / Right | Optional looping, in-place lateral movement. Walk is the fallback when missing. |
| Jump | In-place one-shot. A complete take-off/air/landing clip is acceptable; gameplay height still comes from Jump Height. |
| Fall / Land | Optional in-place clips reserved for expanded airborne transitions. |
| Interact | In-place one-shot such as talking, inspecting or pressing a button. |
| Shoot / Pass / Cross | Soccer one-shots without root translation; Soccer Logic applies the ball impulse. |
| Save / Dive | Goalkeeper one-shots without root translation; Keeper settings move the Pawn and define reach. |
| Celebrate / Defeat | In-place one-shot or short loop that returns cleanly to locomotion. |

Missing clips degrade safely: idle/walk/run choose the nearest available locomotion clip, optional strafes fall back to forward locomotion and gameplay actions keep their timing even when a visual clip is absent.

A Motion Set entry with `state: jump` is authoritative during upward airborne movement. The legacy Jump slot is used only when no such entry exists, preventing a generated/default one-shot from covering an imported Mixamo jump.

### Correcting a pose with Edit Rig

Select one Motion slot in Pawn Studio and enable **Edit Rig**. The preview pauses and shows the real skeleton. Choose a bone, rotate it with the local gizmo and repeat for the parts that need correction; **Reset Bone** removes only the selected override. The correction applies uniformly over that slot without modifying its FBX/GLB. During locomotion the correction uses the slot's live blend weight, so an Idle correction fades while Walk or Run takes over and the body straightens progressively rather than moving as a single rigid object.

## Soccer ball interaction

The Soccer Pawn and Soccer Ball share one ball simulation in both game modes. Gravity, rolling/bounce drag, spin/curve, goal-line crossing and goalkeeper reach remain physical ball concerns; the Pawn only supplies intent and a timed foot/hand contact.

- In **match mode**, a nearby slow ball gets a soft velocity assist toward a point in front of the player's foot. It is never parented or teleported, so rebounds, tackles and possession changes remain possible. `Automatic Soft Ball Control`, control radius and foot distance are exposed on the Soccer Logic Element.
- Shoot, Pass, Cross and Tackle queue one contact at the appropriate phase of their animation. At contact, the nearest reachable ball receives the impulse; pressing the action away from the ball does not move it. Shoot/pass/cross power is exposed, while the closest goal in front of the player provides the default aim target. Logic nodes can still provide explicit targets, lift and curve for scripted plays.
- In **penalty mode**, the Ball begins locked on its authored spot and the Penalty Manager keeps it locked during Ready/Aim. Soft dribbling is disabled. The first valid timed strike unlocks it; the goal/save/out result then advances the shootout and the next reset locks it again.

The Gameplay settings expose one persistent **Easy / Medium / Hard** difficulty. In Soccer it scales goalkeeper reaction, prediction accuracy/window, tracking, physical save reach and dive distance. An unpossessed outfield Soccer Pawn with **Field-player Opponent AI** enabled uses the same setting for reaction delay, closing pace and shot error. The penalty HUD reports `GOAL`, `SAVED` or `MISSED` and keeps a per-team kick history; only goals change the numeric score.
- Goalkeepers keep their authored gameplay reach separate from visual animation. A standing catch has normal reach; Q/E directional dives temporarily extend it while the Pawn follows its configured dive distance and duration.
- An unpossessed goalkeeper with `Goalkeeper AI` enabled predicts where an in-flight ball will intersect its goal line after the configured reaction time, chooses a standing save or directional dive, and recenters after the attempt. Possessing that Pawn disables the AI for the duration of manual control.

## Controls in the starter graphs

- `WASD` or arrow keys: move in character-heading space by default for football strafing; `Movement Space` can switch a Pawn to camera-relative input;
- `Shift`: sprint;
- `Space`: jump;
- `F`: generic interact, or soccer shoot/action;
- `Q` / `E`: goalkeeper dive left/right in the Soccer starter.

Input still routes through the shared Player 1–4 action/device system, so keyboard and gamepad mappings remain reusable.
