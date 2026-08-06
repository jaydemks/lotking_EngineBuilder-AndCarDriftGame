# Animal Pawn

Animal Pawn is a separate Logic Element family. It does not replace or modify `player_car`, Character Pawn, Soccer Pawn, or the native vehicle adapter.

## Built-in templates

- `logic-template-player-animal-cat`
- `logic-template-player-animal-dog`
- `logic-template-player-animal-horse`
- `logic-template-player-animal-generic`
- `logic-template-ai-animal-cat`
- `logic-template-ai-animal-dog`
- `logic-template-ai-animal-horse`
- `logic-template-ai-animal-generic`

Every template is playable without imported assets. The procedural quadruped has articulated spine, neck, head, ears, tail and two-joint legs, with idle, walk, trot, run/gallop, crouch, jump/fall/land and action poses. Species proportions, colors, collision, speeds, camera and abilities are editable in Pawn Studio and exposed as graph variables.

Player templates begin possessed and do not silently become AI when their Player
ID is cleared. AI templates are unpossessed and carry an explicit enabled
`behavior` descriptor, so the same Animal can be placed in any level without a
template-specific controller.

## Gameplay abilities

Cat supports collision-aware pounce, collider climb/mantle, ledge balance, stealth speed/posture and automatic fall recovery. Dog supports bark-radius alerts, timed digging and collision-aware target chase. Horse supports authored walk/trot/run gaits, jumping and a configurable rideable seat that transfers and restores the rider's player slot. Generic animals can use the same APIs as a base for custom quadrupeds.

Ability translation is owned by the movement/collision runtime. Animation clips remain in-place and never become authoritative root motion.

## Behavior, factions and fear

Animal Pawns use the same Actor Behavior profiles as Characters: `aggressive`,
`tactical`, `defensive`, `flee`, `civilian` and `reactive`. The supplied AI
Animal templates default to `reactive`, a `wildlife` faction and explicit
reactions to damage, weapon fire, explosions and nearby death. Authors can edit
hostile factions, pack/herd ID, sight, hearing, memory, territory radius, fear
threshold, patrol points and individual event reactions per instance.

The shared decision layer maps its result onto available species capabilities:
cats can pounce at close range, dogs can bark/chase and horses can rear or flee
from a large stimulus. Other decisions use the ordinary Animal movement API,
so imported meshes do not create another AI code path. A generic animal with
no specialized attack verb still patrols, guards, investigates or flees; it is
not given an invented combat animation.

Dog chase commands are ownership-scoped. Actor Behavior tags the chase it
started and releases only that command on possession, AI disable, death,
target loss or Stop Preview. If an author graph or player replaces it with a
new chase, the old AI state cannot cancel the newer command.

Each AI Animal exposes its natural attack independently: enabled state, damage,
range, cooldown, force and action name. The range does not borrow the firearm
attack range, and damage is applied through the shared Damage Contract only
after the species action starts. Giving an Animal an explicit compatible weapon
remains a separate author choice.

Behavior is local steering with collider-aware sight checks and optional shared
pack memory. It does not provide a baked navmesh, long-range path planning or a
full cover-authoring workflow.

## Vitals and physical death

Animal templates include the shared `vitals` block. Health and armour remain
plain serializable values while runtime mutations pass through the shared
Damage Contract, so weapons, explosions and Logic damage produce the same
events and lethal result as they do for a Character.

`vitals.deathPhysics` defaults to enabled `auto` with the `quadruped` profile.
On death the runtime snapshots the current pose, discovers compatible imported
GLB bones or procedural placeholder joints and applies the hit direction to a
lightweight articulated solver. If a mesh has too few recognizable joints, the
whole Animal falls as one physical body instead. Respawn/reset restores the
captured pose and animation state. Authors may select an authored death
animation or disable death physics; this system is not a full rigid-body bone
collision simulation.

The standing Logic Element collider follows the Animal during runtime movement,
is suspended while the death body is active and is restored at the revived pose;
other actors therefore do not collide with an invisible animal left at spawn.

## User GLB and FBX

Pawn Studio's **Main Animal Mesh** accepts GLB/GLTF and FBX converted through the existing asset pipeline. Assigning a model disables only the procedural render pieces; it preserves movement, abilities, collision, camera and the complete Motion Animation Set. Resetting the model restores the procedural animal without deleting authored animations.

For reliable animation binding:

- use a rigged quadruped model;
- keep locomotion clips in-place;
- use matching normalized bone names between the Main Mesh and external Motion assets;
- check **Skeleton Compatibility** and preview every Motion slot before publishing.

The portable exporter discovers the Animal runtime and Logic scripts from `gameplay.html`, and graph dependency collection includes the Main Mesh, animation library and every Motion asset.

For best auto-ragdoll discovery, use recognizable quadruped bone names or set an
explicit `vitals.deathPhysics.boneMap`. A mesh-only GLB is still supported
through the physical whole-owner fallback.

## Runtime and editor modules

- `js/runtime/animal-placeholder-locomotion.js`
- `js/runtime/animal-pawns.js`
- `js/runtime/ai/actor-behavior.js`
- `js/runtime/combat/damage-contract.js`
- `js/runtime/physics/pawn-death-physics.js`
- `js/runtime/character-vitals.js`
- `js/logic/logic-templates-animal.js`
- `js/logic/logic-nodes-animal.js`
- `js/editor/animal-pawn-studio.js`
- `tests/animal-pawn.test.js`

Run the focused suite with `npm run test:animal`.
