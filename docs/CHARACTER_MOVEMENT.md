# Character Movement and Animation Authoring

## Overview

Lot King exposes two editable humanoid Logic Element starters:

- **Template - Player Character (Normal)** is the reusable base for normal, civil, police and future on-foot gameplay.
- **Template - Player Soccer Element** adds football roles and actions such as shoot, pass, tackle, save and goalkeeper dives.

Both use the same camera-relative movement controller, collision resolution, gravity, jump, camera possession and motion-blend locomotion. Game-specific behavior belongs in presets and Logic nodes rather than in duplicated movement code.

## Creating the default character level

In the editor choose **New Level**, then select **Sketch Street - Character Movement**. This is a native reconstruction of the supplied `sketch-street_v2.html` concept, not a generic flat test map. The generated editable level contains:

- one possessed **Player Character (Normal)** Logic Element;
- the original road and side ground profile, including the downhill slope toward the sea;
- eight individual houses with editable bodies, roofs, windows, frames, bars and doors;
- the vending machine and its twelve cans, road sign, AC unit, plants, walls, guardrail, utility poles and sagging cables;
- the green scooter and distant sea/land cards;
- one possessed **Player Character (Normal)** and one unpossessed **Talkable Civil NPC** with the original two-message proximity interaction on `F`.

Every concept mesh was originally generated inside the one-file Three.js demo. It has therefore been converted into named native editor primitives instead of copied as an opaque external asset. The template works before a custom character model is imported and remains portable in an LKEP/playable export.

## Choosing a character preset

The generic Character Pawn currently provides these starting profiles:

- `normal`: balanced third-person movement;
- `civil`: slower acceleration, running and jump;
- `police`: faster, more responsive and more athletic.

Choose the preset first, then tune the exposed Movement fields for a specific subtype. For example, a civilian child, an adult NPC and a fleeing civilian can all start from `civil` while keeping separate speeds and jump settings.

Soccer uses roles rather than these generic presets: striker, winger, midfielder, defender and goalkeeper. Role-specific actions stay in the Soccer Logic Element while the underlying movement stays shared.

## Where to assign the model and animations

Select the Character or Soccer Logic Element in the scene.

1. In **Character Pawn Model** or **Soccer Pawn Model**, assign a rigged humanoid GLB. A Mixamo-style skeleton is supported, but any rig works when the model and animation library use exactly the same skeleton hierarchy and bone names.
2. If the model GLB already contains animations, choose their clip names in the exposed **Animations** fields.
3. If animations are stored separately, assign a clips-only GLB to **Animation Library GLB**. It must use the same rig as the character model.
4. Use the clip picker for each slot. Clip-name matching is forgiving, but explicit slot assignment is safer for production projects.

### Root motion rule

Use **in-place animations with root motion disabled**. The Character Movement controller owns world translation, collision and jump height. A locomotion clip that also translates its root will visually drift away from the Pawn/collider and can snap when blending.

Recommended exports:

- keep the skeleton root at the origin;
- remove forward/lateral root translation from walk, run and strafe clips;
- do not bake jump height into root translation;
- keep consistent scale, orientation, rest pose and bone names across every GLB;
- trim looping clips so their first and last poses blend cleanly.

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

## Controls in the starter graphs

- `WASD` or arrow keys: move relative to the camera;
- `Shift`: sprint;
- `Space`: jump;
- `F`: generic interact, or soccer shoot/action;
- `Q` / `E`: goalkeeper dive left/right in the Soccer starter.

Input still routes through the shared Player 1–4 action/device system, so keyboard and gamepad mappings remain reusable.
