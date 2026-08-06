# Default character mannequins

The engine's two default playable bodies, and the motion clips bound to them.

| Folder | Body | Source file |
| --- | --- | --- |
| `mannequin-male/` | Y Bot | `y-bot.fbx` |
| `mannequin-female/` | X Bot | `x-bot.fbx` |
| `shared/` | — | action clips both bodies use |

## Why the actions are shared

Both mannequins are Mixamo rigs and carry identical `mixamorig:` bone names, so a
clip authored on one drives the other. The action set therefore lives once in
`shared/` instead of being duplicated per body. Locomotion is **not** shared: each
body has its own walk, run, strafe and turn cycles, because those carry the weight
and posture that make the two read differently.

## Clip names inside the files

Every file exports a single take named `mixamo.com`. That is why these are bound
**per asset** rather than by clip name: `js/runtime/soccer-locomotion.js`'s
`findClip()` resolves an explicitly assigned animation asset to its sole clip, so
the slot's stored label is cosmetic and the asset reference is what selects the
motion. Binding by name would match the first `mixamo.com` in the library and give
every slot the same clip.

## Format

FBX, loaded through `js/plugins/fbx-import-plugin.js`, which is present in both
the editor and the gameplay shell — so a project that uses these defaults also
works in an exported build. Pawn Studio converts a body to a canonical GLB on
import when an author needs one.

## Origin and licence

Adobe **Mixamo** (`mixamo.com`) — the X Bot and Y Bot mannequins and their
animation library. Mixamo content is licensed to the Adobe account that downloaded
it; the terms allow use in commercial and non-commercial projects, and they do not
permit redistributing the animation files as a standalone asset library. They are
bundled here as part of a game engine's default content, not offered for download
on their own.

If you replace these bodies with your own, nothing else has to change: they are
ordinary model assets referenced by `js/logic/logic-templates-character.js`, and
any rigged GLB or FBX can take their place from the Pawn's Model field.

## The two deaths are renamed after their measured outcome

`shared/death-front.fbx` is `Shoot-Pack-Animations/death from front headshot.fbx` and
`shared/death-back.fbx` is `death from the back.fbx`. The pairing was measured, not
read off the filenames, because the filenames do not survive measurement: of the six
death takes in the shooting pack, **four fall forward onto the face** —
`death from the front` (hips +105 cm forward, ends prone) as much as
`death from the back` (+114 cm, prone). Those two are the same outcome and cannot be
a front/back pair however you read "from"; one of them is mislabelled at source.
`death from front headshot` (−27 cm, ends supine) is the only take in the pack that
drops the body backward, so it is the frontal death. The bundled names therefore
state the slot rather than the source file, the same choice `cover-low-enter.fbx`
made for the same reason.

## What the source packs do NOT contain

The four packs under `models_sources/assets/default_characters/` are Mixamo's Action
Adventure Pack (`Mannequin-Male/` and `Action Adventure Pack.zip` are two exports of
it — the zip's is the readable one), a Standard Locomotion pack, the Shooting Pack
and a Soccer Game Pack. Together that is locomotion, cover, crouch, aiming, jumps,
turns and deaths. It contains **no traversal and no melee take at all**, so these
slots are bound to nothing and will stay that way until the packs that hold them are
downloaded:

`slide`, `vault`, `mantle`, `climb`, `hang`, `climbUp`, `climbDown`,
`ledgeShimmyLeft`, `ledgeShimmyRight`, `landCrouch`, `interact`, `punch`,
`knifeAttack`, `hitReact`.

## Not copied from the source tree

Deliberately left out of the repository, to keep it lean:

- `Mannequin-Male/idle.fbx`, `walking.fbx`, `running.fbx` — near-duplicate takes of
  the `StandardLocomoton` set that is used instead.
- `Mannequin-Male/StandardLocomoton/X Bot.fbx` — a second copy of the female body.
- The remaining four death takes. Three of them are a fourth and fifth variation of
  the same forward fall, and `death from right` is a sideways death with no slot.
- `Shoot-Pack-Animations/jump up|loop|down.fbx` — the three phases of a standing
  jump. `jump down` was checked as a `landCrouch` candidate and rejected: it dips the
  hips to 78 cm and returns to 97 cm standing, where a crouch idle sits at 46 cm, so
  it is a knee bend on landing rather than a landing into a crouch.
- The Soccer Game Pack's `Landing.fbx` — rigged `mixamorig5:` rather than
  `mixamorig:`. Nothing in the engine retargets, so its tracks would bind to no bone
  on either mannequin. (`shared/falling-to-landing.fbx` came from the same pack and
  has the same prefix.)

The untracked `models_sources/` tree remains the full original download.
