# Release Notes: v0.7.8

## Project authority and local-backup protection

- The main startup project is now explicitly the exported Author DEMO,
  `Parking Lot First Ever Level Test Source`, resolved from
  `demo/demo-project.lkep.json` and its GitHub-safe split chunks. `LOCAL DISK`
  remains visible but opens only after an explicit Projects selection.
- Projects keeps one stable URL-backed `AUTHOR DEMO` card instead of copying the
  large publication into browser storage. Saving while that card is active
  creates a separately named working copy and never overwrites the DEMO source.
- Explicitly loading LOCAL DISK, another browser project, a linked LKEP or a
  folder workspace overrides the DEMO for that browser session; a fresh normal
  session returns to the Author DEMO startup.
- `Projects` now includes a visible Project History containing immutable disk
  versions, legacy backups and recoveries with their date, size and origin.
  Every version can be exported or restored directly from the editor.
- Save and project import require an explicit confirmation before replacing the
  active project. Before every confirmed write the complete previous LKEP is
  archived under a unique timestamp and checksum instead of overwriting one
  hidden `previous` file.
- Confirmed Author DEMO publication follows the same rule: the complete current
  DEMO, including a split/chunked publication, is reconstructed and archived in
  the visible Project History before the published files are replaced.
- Restoring a version is also confirmation-gated and first archives the current
  active project. Unsaved in-memory edits block restoration until the author
  deliberately saves or discards them.
- Browser projects, Author DEMO and temporary editor scenes can no longer
  overwrite the `LOCAL DISK` project bridge. Only the selected disk-backed
  Projects card may perform an ordinary local backup; an explicit project
  import can deliberately claim that authority.
- Discovering `LOCAL DISK` always creates/updates its own Projects card instead
  of converting the currently open Demo/browser project. Opening a Demo or
  browser project now preserves that authority across reload, so startup can
  discover the disk backup without immediately replacing the chosen scene.
- The local server now rejects an unexpected project collapse below 25% of an
  existing backup larger than 1 MB. Intentional project replacement remains
  available through the explicit import path, while an empty/stale startup
  scene cannot replace a complete multi-level project.
- Play and Simulate are no longer persistence actions. Starting a preview cannot
  save the level, browser workspace or `LOCAL DISK`; project persistence now
  happens only through explicit Save / Ctrl+S, import or rename commands.
- Disk writes now also require an explicit `LOCAL DISK` authority header, so an
  obsolete browser tab or cached runtime cannot silently overwrite the active
  project after the local server has been restarted.
- Reconstructed the newest exported DEMO directly from its 14 checksum-verified
  chunks and restored it as the active Local Project: 35 active-scene elements,
  High Poly Car, Menu, Enemy Outpost and FPS Playground. The older portable
  recovery, the preceding DEMO and both accidental 104 KB snapshots remain
  preserved separately for rollback and forensic inspection.

## Play animation ownership, vehicle camera and custom collision parity

- Character Play now begins at the same clean animation boundary used after a
  vehicle exit. Generic Logic Element autoplay cannot take over a mixer already
  owned by Character locomotion, and the Pawn publishes its neutral authored
  pose before the first visible gameplay frame instead of waiting for a later
  helicopter/car transition to repair it.
- Look Back now survives an authored external-camera rotation. Keyboard `V`
  and the mapped gamepad action rotate both default and Pawn Studio-authored
  vehicle cameras rearward without moving their authored camera position.
- The native Player Car adapter now mirrors the exact saved custom collision,
  including when the local project finishes restoring after the adapter was
  created. Cannon driving, Pawn Studio and on-foot Character avoidance therefore
  use one chassis footprint instead of a bootstrap/default box beside the
  author-defined collider.

## Cinema Studio smooth return camera

- Every Cinema Studio now authors its final transition as either the existing
  instant `Cut` or a timed camera `Blend`, with Linear, Ease In, Ease Out and
  Ease In/Out curves. The completion settings persist with the Studio element.
- A Studio can select the Player controller and Pawn that receive control at
  the end. Leaving the Pawn automatic returns to the controller's currently
  possessed Pawn without re-possessing or resetting it.
- `Play Cinema Timeline` exposes per-invocation overrides for exit mode, blend
  duration, Player and Pawn. `Completed` now fires after the camera blend, so a
  following Logic branch cannot interrupt the transition midway.
- Editor Play and standalone gameplay use the same normalized completion
  contract. During a blend the gameplay camera keeps calculating its live
  destination while Cinema retains final render ownership, producing a smooth
  handoff instead of a frozen target or a final-frame cut.

## Stable Character presentation across Play and repeated vehicle use

- Re-qualified the fix against the active local project itself: the bundled
  Male Character, its complete 21-slot Motion Set and the authored DollBody
  helicopter profile now finish the real Play pre-benchmark with a bound model
  controller. Two consecutive enter/exit cycles preserve the same upright
  world root and keep the visible mesh above its ground pivot.
- Published the corrected Character, locomotion and occupancy modules under a
  new shared browser revision. Editor, gameplay, test/editor loader and playable
  script manifest can no longer reuse the earlier cached vehicle-exit runtime.
- Motion-library hydration now replaces the active controller atomically. The
  final asynchronously loaded FBX can no longer leave `locomotionKind` empty
  between frames and expose a persistent partial T-pose at Play or during a
  vehicle ownership transition.
- Fixed a cumulative Character transform regression at pre-benchmark and
  vehicle-exit boundaries. A new locomotion controller could previously record
  an already-applied Motion Set offset or sampled skeleton pose as its new rest
  state; repeated entry/exit then moved the visual below ground and could turn
  it upside down while the gameplay root itself remained valid.
- These boundaries now reset the already-bound animation controller instead of
  retargeting and rebinding the live skeleton. Motion-root corrections, IK,
  one-shots, action weights and rig state return transactionally to one neutral
  baseline before the first on-foot frame.
- Seat prewarming now restores Character state as well as every bone. Added
  regressions with a non-zero vertical offset, a 180-degree authored correction,
  three controller resets and two consecutive cycles through the same vehicle.

## Exact custom-vehicle seating parity

- Pawn Studio now previews an imported native Player Car from the same fitted
  runtime model used in Play. Custom vehicles such as High Poly Car therefore
  share the same scale, normalized pivot and synthetic driver-seat frame in
  both views instead of being loaded once more as a generic GLB.
- Exact seating profiles resolve every persistent asset alias (`dbKey`, library
  key/id, source and name). Existing profiles remain valid while new profiles
  prefer the project-persistent `dbKey`, preventing an imported vehicle from
  silently falling back to the generic Native / Logic Vehicle pose.
- The shared occupancy contract now owns synthetic seat-anchor resolution for
  Pawn Studio and Play, with regressions for imported native vehicles, legacy
  exact-profile aliases and the fitted-model anchor.

## Visible Character dismount and complete Pawn pre-benchmark

- Vehicle exit now restores the Character from its authored `hidden` state,
  rather than replaying a temporary root-visibility value left by camera or
  asset presentation. The first-person body policy is forcibly reconciled at
  the ownership boundary, so the actual render meshes return with the Pawn.
- Replaced the original car-specific preparation gap with an inventory-driven
  Pawn warm-up. Character, native vehicle, Logic Vehicle and all Sketchbook
  vehicle families now prepare through the same extensible registry.
- The Play pre-benchmark now awaits Character GLB/animation binding, locomotion,
  cloth and colliders; vehicle physics, steering and wheel controllers; custom
  engine sample decoding; lights/widgets; damage anchors and particle pools;
  plus vehicle seat profiles and full-body IK.
- Seat/IK preparation snapshots and restores every bone and never transfers
  possession or consumes input. It removes first-use entry/exit work without
  changing the authored scene or leaving a benchmark pose in gameplay.
- Added regressions for transiently culled Character dismount, complete Pawn
  inventory preparation, per-vehicle audio/damage warm-up and transactional IK.

## Free Character movement over imported roads

- Fixed the invisible-wall regression produced by horizontal road/asphalt parts
  inside very large `complex` city GLBs. These parts remain valid ground for
  Characters, ragdolls and vehicles, but are no longer interpreted as lateral
  walls, traversal obstacles, AI cover/visibility blockers or radar obstacles.
- Stabilized legacy Character movement settings: a saved heading-relative input
  mode without a facing mode can no longer rotate its own reference frame into
  a tight orbit. Existing instances migrate once, and Facing Mode is now exposed
  beside Input Mode for explicit author control.

## Vehicle dismount, thin roads and Player recovery

- Exiting after a vehicle has moved now resolves beside its live world-space
  position. Large aggregate bounds from complex imported scenery are no longer
  mistaken for a walkable roof, which previously launched the Character high
  above the level.
- Complex collision now preserves horizontal zero/thin meshes as shallow solid
  parts, so asphalt, roads and floors remain valid Character and ragdoll ground
  instead of dropping the Pawn through to the editor grid.
- Player Characters now respawn at their original spawn by default after a
  lethal fall; AI and civilians still default to no respawn. `R` keeps its normal
  Reload meaning while alive and may restart only a dead Character, while the
  Vehicle context retains its independent Reset action.

## Stable long-running Editor sessions

- The authoring viewport now remains fully realtime while the user interacts,
  during Play, Simulate and Cinema playback, but reduces identical GPU submits
  after a short period of genuine inactivity. Hidden editor tabs are paced even
  more conservatively.
- Closing or replacing a runtime now has a deterministic teardown path for
  post-processing, procedural-world resources, renderer lists and the renderer.
  A final WebGL page close also releases its native driver context instead of
  leaving GPU allocations in the browser process until a machine restart.
- Developer telemetry no longer shifts its full sample history every frame and
  now shuts down its animation loop, PerformanceObserver, timers and worker with
  the runtime. Added stability regressions for idle pacing and complete teardown.

## Port-independent Local Project and large-project storage

- Changing between `localhost`, `127.0.0.1`, another port or the host PC's LAN
  address no longer makes the editor trust an unrelated empty browser catalog:
  the active local LKEP on disk remains the host-side authority.
- Manual LKEP import now updates that disk authority before reloading, preventing
  the previously active project from replacing the project that was just loaded.
- Complete projects larger than the safe `localStorage` budget are stored in
  IndexedDB; `localStorage` retains only a compact catalog manifest. This removes
  the `Failed to execute 'setItem' on 'Storage'` failure without truncating levels
  or assets, while existing small and legacy browser projects remain readable.
- The LAN launcher now exposes the same port-independent bridge to the host PC
  only. Other devices remain browser-isolated, and the backing `.lotking-local`
  file cannot be fetched as a static URL.
- Automatic workspace discovery now only queries existing folder permission. A
  browser permission prompt is requested from the visible Workspace Load action,
  eliminating the `requestPermission: User activation is required` startup error.

## Cinema Logic completes before gameplay resumes

- `Play Cinema Timeline` now exposes an immediate `Started` flow separately
  from the asynchronous `Completed` flow. `Completed` fires only after the real
  final timeline frame, so Pawn possession and following gameplay logic no
  longer run at cinema start.
- Connecting `Completed` gives that Logic invocation one-shot authority over a
  Cinema Studio `Loop` setting. Unconnected timelines retain their authored
  loop behavior for ambient and repeating scenarios.
- Standalone gameplay and Editor Play share the same playback policy, final
  frame, timeline-event and completion semantics; cinema camera/input ownership
  is released before the downstream graph continues.
- An explicit Logic start now also satisfies the same Studio's automatic
  `On Play` trigger, preventing a second launch on the frame after completion.

## Custom vehicle audio survives Character entry

- Fixed the native custom vehicle falling back to the default synthesized
  engine when entered from an on-foot Character rather than possessed at Play
  start. Its saved Sound Designer bank was intact, but the sample manager stayed
  stopped after the ownership transfer.
- Native vehicle possession now restarts the assigned bank, exit stops it
  cleanly, and the frame runtime can recover an interrupted manager without
  replacing its authored configuration. Embedded sound-set data also remains
  authoritative during early scene application.
- Added a regression covering Character-to-native-vehicle entry, bank retention
  and clean audio shutdown on exit.

## Free Character movement through complex imported scenery

- Fixed an asymmetry exposed by the author's modified Parking Lot: vehicles
  correctly ignored the aggregate bookkeeping root of a `complex` imported
  collider, while Characters treated that entire model-sized box as a solid
  wall and became confined to one axis.
- Character ground contact, locomotion, traversal and cover now consume only
  the real compound parts. Actor sight and AI cover planning follow the same
  rule, so the invisible aggregate root cannot become a false wall or cover.
- The saved level and its city collisions remain untouched. Added a regression
  proving diagonal X/Z movement stays free inside a large aggregate root while
  its real collider parts remain available.

## Release documentation refresh

- Renewed the short project README around the actual v0.7.8 scope: illustrated
  rendering, procedural worlds, expanded Pawn and vehicle families, vehicle
  occupancy, Cinema Studio sequencing, P2P coworking/multiplayer and Blender
  Live Link, while keeping experimental boundaries explicit.
- Aligned the technical overview with WebGPU fallback, Manga / paper-sketch
  controls, procedural terrain and water, and Vehicle GLB Rigger 0.3.0.
- Confirmed the public version surfaces use `0.7.8`; detailed subsystem behavior
  remains in the focused documents instead of being duplicated in the landing
  README.

## Persistent P2P session monitor and host controls

- Added a persistent toolbar status button showing LIVE/waiting state, host or
  guest role and connected-user count after Session Studio is closed.
- Its compact panel lists connected and recently disconnected peers with their
  transport state. It provides Session details, Add user, local Disconnect and
  host-only targeted Remove/Re-invite actions.
- Targeted removal uses the canonical host-only `net.kick` protocol message,
  delivers the reason reliably, releases the peer’s object locks and then closes
  only that peer connection rather than destroying the whole host session.
- A dropped host can generate and copy a fresh invitation directly from the
  disconnected user row; guests receive an explicit Reconnect path. The UI
  states the unavoidable browser-only boundary: a closed WebRTC connection
  needs a new offer/answer when no signaling server exists.
- Invitation and answer codes now survive closing and reopening Session Studio
  for the lifetime of the page. They remain ephemeral and are never persisted
  into a project or permanent browser storage.
- Added browser coverage for the real toolbar indicator, peer roster, targeted
  expulsion, disconnected history, re-invitation and token restoration.

## Multi-author coworking, element locks and shared Save

- Replaced project-wide edit authority with simultaneous coauthoring. Host and
  guests can all modify the project, while a host-arbitrated lease reserves only
  the selected persistent element.
- Inspector, viewport gizmo, Pawn Studio and Cinema Studio become visibly
  read-only when another peer owns that element. The owner and active surface
  are shown; all other scene elements remain available for parallel work.
- Locks renew while in use and release on deselection, disconnect or timeout,
  preventing abandoned permanent locks after a browser or network failure.
- Reliable settled object state now includes serializable Inspector, Pawn Studio
  and Cinema Studio data in addition to realtime transform/name/visibility
  patches. Newly added objects can be reconstructed remotely and deletion of an
  added object is relayed under the same lease. Messages are accepted only from
  the current lease owner.
- Save now fans out reliably: every connected editor verifies and persists its
  own synchronized local project copy after an ordered final-state flush, with
  an origin marker preventing save echo loops. Either peer may also publish the
  explicit portable snapshot.
- Added deterministic lease contention/expiry/disconnect tests plus a real
  two-editor browser scenario that hands one object from host to guest, mirrors
  edits in both directions and verifies local persistence on both peers.

## Cowork realtime sync, reliable snapshots and Blender reconnection

- Coworking now uses the canonical `cowork.*` protocol instead of undeclared
  legacy messages. The active author continuously mirrors position, rotation,
  scale, visibility and names for all persistent scene objects, with low-latency
  state packets and a reliable final revision after each edit settles.
- Portable project snapshots are streamed in bounded 192 KiB application
  chunks with progress, channel back-pressure, a 256 MiB safety ceiling and a
  final checksum. Publishing now refuses zero-peer sessions and reports an
  exact disconnect, congestion, incomplete-transfer or integrity failure.
- Corrected the P2P wire-frame guard for nested JSON escaping. Quotes and
  backslashes can double when a serialized payload is wrapped in a transport
  chunk; the old plain-text bound silently rejected those frames and produced
  the observed incomplete snapshot.
- Blender Live Link 0.1.9 accepts safe loopback browser origins on any local
  HTTP port plus the official hosted Editor, migrates both former local-only
  defaults, retries while Blender's listener starts and distinguishes endpoint,
  handshake, timeout and token failures. Other internet and LAN origins remain
  rejected and the server still binds only to `127.0.0.1` with a fresh token.
- Added real integration coverage: two isolated Chromium editor pages exchange
  encrypted WebRTC data, escaped multi-frame payloads, realtime object edits and
  a verified project snapshot; Blender 5.0.1 performs an actual WebSocket
  upgrade, token authentication, scene pull, editor-to-Blender update and ACK.

## Cowork / P2P token routing

- Split manual signaling into four explicit fields: Host Invitation to Send,
  Guest Paste Host Invitation, Guest Answer to Return and Host Paste Guest
  Answer. Join no longer reads a visually unrelated Host textarea.
- Invitation and answer codes are identified from their signed payload kind,
  rather than inferred from the textarea where they were pasted. Tokens pasted
  into the legacy field are routed to the correct step automatically.
- Added specific diagnostics when a guest answer is used as a host invitation
  or vice versa, replacing the misleading generic “Paste token” message.
- The same Session Studio is shared by Editor coworking and gameplay P2P, so the
  corrected token flow applies to both entry points.

## Traversal priority and readable Character run speed

- Running into a wall now checks Vault, Mantle and Climb eligibility before
  Wall Flip. The flip is reserved for a face whose upper surface is genuinely
  too high to reach with the normal traversal actions.
- Wall Flip landing no longer cuts directly to a stationary pose. Held Forward
  becomes a short configurable slow walk that eases into idle, while releasing
  and pressing Run remains necessary to arm another flip.
- Added Pawn Studio controls for Wall Flip Walk-to-idle Duration and Speed Scale.
- Humanoid player defaults now use a direct 4.8 m/s Run Movement Speed with an
  Extra Sprint Multiplier of 1. Animation playback remains independently
  authorable in Motion Animation Set.
- Saved shooter Pawns using the untouched 5.4/5.9 and 1.3/1.28 engine defaults
  migrate automatically. Deliberately authored movement values are preserved.
- Renamed the Inspector and Pawn Studio fields to distinguish physical movement
  speed from animation playback and from the optional extra multiplier.

## Character camera authoring, mesh safety and responsive wall flip

- Pawn Studio now exposes selectable **First Person** and **Third Person** camera
  dummies, drawn in distinct colours with camera frusta and focus targets. Their
  position, FOV/ADS/sprint FOV, manual focus, near clip, shoulder, collision
  radius and minimum body clearance are editable and saved with the pawn.
- First-person body view now starts 0.28 m in front of the face and supports an
  authored lateral eye offset. Untouched legacy 0.22 m defaults migrate safely,
  while deliberate custom offsets remain unchanged.
- Third-person fixed-distance mode is now collision-aware without camera
  breathing: it snaps to a safe position and falls back just outside the face if
  a wall or the pawn body would contain the camera. Camera collision probes are
  cached per frame to avoid repeating the expensive scene scan.
- Manual camera focus authored per view now reaches the runtime camera whenever
  global depth-of-field autofocus is disabled.
- Finishing a wall flip no longer consumes locomotion or leaves the character in
  a stationary pause. A release-and-press gate still prevents immediately
  retriggering the action while Run remains held.

## Independent Manga / illustrated-sketch art controls

- Split cross-hatching from contour detection. Hatching / Grid can now be set
  to zero while retaining the drawn silhouettes and internal object edges.
- Added independent Drawn-line Noise and Pigment Noise controls, so organic ink
  variation no longer requires paper grain or screen-aligned hatch marks.
- Added Sketch Colour from colourless pigment through 2× saturation and a
  bounded 0.25×–3× Sketch Light Gain for strong high-key authoring.
- The complete control set is available in project Rendering defaults and the
  player Video menu, participates in author override/exposure rules and produces
  equivalent output through WebGL and WebGPU. Existing projects preserve their
  previous appearance through schema-v8 defaults.

## Pawn Studio weapon and arm parity in Play

- Authored hand targets now keep full IK influence in Play, matching the exact
  aim/no-aim, gait, weapon-side and grip state previewed in Pawn Studio. Only
  untouched automatic defaults retain the softer animation blend.
- The carried weapon now composes the saved trigger-wrist rotation before its
  socket correction, using the same transform order as Pawn Studio. It therefore
  remains attached to the trigger hand without the former lateral shift.
- Loadout and picked-up weapon normalization now preserves each weapon's complete
  Pawn Studio grip profile instead of silently dropping it during equip.
- Added executable parity coverage for contextual grip influence, normalized
  loadouts and the final hand-owned weapon world transform.

## P2P session lifetime, coworking and Internet transport

- Session Studio, Editor coworking, Play and gameplay Logic nodes now adopt one
  page-wide active P2P session. Opening the Studio no longer creates a second
  disconnected session, and closing its panel no longer tears down gameplay.
- Creating another host invitation preserves existing peers and every still
  pending invitation. Answers are bound to the exact host session/invitation,
  with a specific diagnostic instead of the misleading generic "key does not
  exist" failure.
- Default ICE now includes STUN. Advanced settings accept a browser-local,
  authenticated `iceServers`/TURN configuration for carrier-grade NAT,
  symmetric NAT and restrictive firewalls; private TURN credentials never enter
  the project or invitation. A relay service is still required on networks where
  a direct WebRTC route is impossible.
- Added executable coverage for repeated invitations, session-bound answers,
  active-session adoption, replication, host migration and ICE configuration.

## Blender Live Link: scene and asset authoring without `.blend` persistence

- Blender Live Link is explicitly marked **Experimental** in both the Editor
  plugin UI and Blender add-on. Scene coverage, transfer performance and
  round-trip fidelity remain under active development.
- Added coordinated Editor and Blender 5.0+ plugins for bidirectional real-time
  object transforms, hierarchy snapshots and explicit GLB asset transfers. The
  open Lot King project is the persistent source of truth; Blender can remain an
  attached authoring process without saving a `.blend` project.
- Stable `editorId` / `lk_bridge_id` identities survive renames. Per-object
  revisions expose conflicts instead of silently overwriting newer work, and v1
  intentionally does not propagate destructive remote deletion.
- The Blender endpoint is localhost-only, requires a fresh 192-bit token, checks
  browser Origin and performs every Blender mutation on its main thread. GLB
  binary transfers are bounded to 1 GiB and temporary import/export files are removed.
- Added Editor plugin registration, canonical project asset import integration,
  protocol/chunking/security/conflict tests, installable
  `lotking_live_link-0.1.9.zip` and architecture/setup documentation.
- Full-scene push now collects the rendered level rather than only custom
  registry roots. Built-in asphalt, walls, pillars and props, authored visual
  children of Logic Elements, and the procedural worldscape are included;
  editor dummies, collider previews and transient runtime effects remain out.
- The Editor reports the mesh, material and texture totals before export, then
  yields to paint visible progress and sends bounded binary scene batches with
  WebSocket back-pressure. Blender keeps the last complete scene until the final
  replacement batch succeeds and discards an interrupted staging import.
- FBX, GLTF/GLB and procedural sources are collected from their live Editor
  representation; GLB is only the normalized interchange container. The binary
  path avoids the former minutes-per-mesh base64/JSON transfer overhead.
- Existing canonical GLBs — including the runtime GLB already compiled when an
  FBX is imported — now bypass `GLTFExporter` completely. One source file is
  transferred once and Blender creates linked placements from the scene
  references; only primitives, asphalt and other genuinely generated geometry
  use the lightweight exporter fallback. This keeps the browser main thread out
  of high-poly model and texture re-encoding.

## Vehicle GLB Rigger 0.3: Normal and DollBody-compatible aircraft

- Added a guided Blender workflow with **Normal / Sketchbook** and
  **Car / Airplane / Helicopter** tabs while retaining the legacy Normal car
  hierarchy. Aircraft support includes propellers, main/tail rotors, ailerons,
  elevator, rudder, landing wheels, seats, doors, entries and collision markers.
- Both profiles now export one semantic contract. Normal `lkRigRole`, axis,
  side, steering, drive and seating links are accepted by the shared vehicle
  runtime; Sketchbook additionally retains its established glTF-extra aliases.
- Rebuild removes only add-on-generated pivots and preserves authored meshes.
  Blender 5.0.1 headless smoke coverage validates Normal car, profile switching,
  airplane/GLB export, helicopter, steering and rebuild behavior.

## Extended Logic Vehicle pack and dynamic towing

- Added editable Normal and DollBody-compatible Logic Elements for small boat,
  medium boat, large ship, truck tractor, detachable trailer, sport motorcycle,
  dirt bike, scooter, BMX and mountain bike, plus Normal-rig airplane and
  helicopter Logic Elements. Every entry can be duplicated, assigned, replaced
  by a GLB and tuned through exposed variables.
- Detailed procedural placeholders expose seats, cameras, collision, wheels or
  rotors, damage/fuel/exhaust anchors, tow hitches and trailer couplers. They are
  authoring fallbacks, not hidden hardcoded pickups.
- Added shared dynamic towing to native Player Car and Logic Vehicles. `T`
  toggles the nearest valid coupler in Vehicle context; Character mappings remain
  isolated. Cannon uses a point-to-point constraint at the two authored anchors,
  while the no-physics fallback keeps both visual and body transforms coherent.
- Attach is transactional and idempotent, rejects tow cycles and detaches cleanly
  on disposal. Regression coverage includes real coupler pivots, failure cleanup,
  cycles, native/Logic integration, fallback synchronization and input conflicts.
- Watercraft ship with responsive arcade navigation and editable water metadata.
  Full wave-sampled hull buoyancy and multi-point hydrodynamics remain a later
  simulation layer rather than being overstated as part of this release.

## Authored Sketchbook seating promoted to engine defaults

- Promoted the author's current Pawn Studio seating for the bundled Sketchbook
  car, helicopter and airplane from the FPS Playground project into versioned
  engine family defaults. Character root placement, full-body IK contacts and
  poles, torso/shoulder/hand rotations, layer weights and finger curls now match
  the values verified in that project whenever a Character enters those vehicles.
- New levels and newly created Characters receive the authored poses immediately.
  Existing levels that still contain the untouched automatic v3/v4 pose migrate
  to the same defaults, so recreating a level is not required.
- Seat profiles advance to schema v5 with a targeted compatibility check. Any
  explicitly edited family or asset-specific profile remains authoritative;
  promoting the bundled defaults cannot overwrite a deliberate per-level or
  custom-GLB adjustment.
- The custom GLB profile was intentionally not promoted because it was not part
  of the completed authoring set. Default profile instances are deep-cloned so
  later Pawn Studio edits remain isolated to their Character/project.

## Anatomical Pawn Studio defaults and visible Character Root

- Vehicle Seating targets now use one anatomical Character-space convention:
  left-side contacts have positive lateral coordinates and right-side contacts
  negative ones, matching the skeleton classifier and traversal solver. Hands,
  shoulders, feet, toes, elbow poles and knee poles no longer start crossed.
- Back controls now point upward through the actual joint chain. Lower back,
  middle spine and chest targets are ordered as valid aim endpoints rather than
  literal markers below the bones, preventing the spine from folding or appearing
  inverted when its IK weight is enabled.
- Restored a persistent white **Whole Character Root** dummy in the vehicle
  viewport. It is always visible and directly clickable; Move and Rotate author
  the complete seated Character while every coloured helper remains an isolated
  limb or body target.
- Two-handed weapon presets now start with trigger and support dummies on their
  respective arm sides. Migration is deliberately limited to the exact former
  same-side fallback, preserving every genuinely customised grip.
- Seat profiles advance to schema v4. Existing mirrored default profiles migrate
  once, while independently authored target data remains intact. Regression tests
  cover anatomical ordering, back direction, Root selection, JSON persistence and
  Play/first-person/vehicle interoperability.

## Live animation rate authoring and physical Wall Flip rebound

- Pawn Studio Playback Rate now updates the running preview action immediately,
  recalculates the proportional timeline and reports the resulting slot duration.
  Editor and runtime share the signed `0.1x .. 4x` range, including reverse
  playback, so entered values can no longer appear saved while the old speed keeps
  playing.
- Wall Flip now composes the slot's authored Playback Rate with an editable
  gameplay multiplier and fits long takes into an editable maximum duration. The
  Character root follows a synchronized upward arc and moves away from the measured
  wall normal, landing at the authored pushback distance instead of flipping in
  place.
- Pawn Studio adds a dedicated **Wall Flip · Motion & Rebound** panel for duration,
  tempo, lift, pushback and detection values, plus a direct jump to the real Wall
  Flip animation slot. Auto Key is visibly armed on the proportional timeline;
  root and bone keys remain isolated to that slot and save through the existing
  authoring history.
- Existing Pawns migrate once from the former one-second in-place default while
  retaining deliberately authored non-default durations. Runtime regressions cover
  composed playback, duration fitting, rebound direction, landing and repeat guard.

## Pawn Studio vehicle-seat runtime parity

- Vehicle Seating preview now resolves the authored driver-seat node from the
  same GLB metadata used by Play instead of treating the vehicle origin as the
  seat. The preview frame deliberately has unit scale, matching runtime seat
  transforms where profile offsets are stored in metres.
- The seated Character now starts from the same neutral/Idle animation base as
  Play before applying the shared post-mixer Full Body IK layer. Main Mesh
  alignment, wrist rotation, fingers and contact targets therefore describe the
  pose that will actually be rendered in game.
- Collision, physics and navigation meshes remain available in the preview GLB
  for metadata scanning but are no longer rendered over the cabin. The smaller
  coloured IK helpers remain visible, can be selected directly in the viewport
  and immediately receive the transform gizmo; **Show every IK helper** can hide
  the unselected targets when an uncluttered close-up is useful.
- Full-body seat authoring now includes pelvis/lower back, middle spine, chest,
  both shoulders, both toe contacts and independent wrist, ankle and toe
  rotations in addition to hands, feet, head and elbow/knee poles. Torso,
  shoulder and toe layers have independent weights; touching a new target
  activates only its corresponding layer, so legacy profiles retain their pose.
- Gizmo edits are committed on mouse-up, before switching targets and again on
  Pawn Studio close. Property fields save immediately. The v3 seat schema
  migrates sparse/legacy records, and a real-rig regression covers JSON
  round-trip, frame convergence and exact skeleton restoration on vehicle exit.

## Procedural island terrain, cinematic water and distant archipelago

- Added a versioned Procedural World foundation shared by Editor, Play, menu
  backgrounds, existing/default levels and playable ZIPs. The engine measures
  each live authored footprint after asset loading and surrounds it with a
  deterministic protected plateau, continuous coast, relief and seabed.
- Existing objects are deliberately not translated. The authored work plane,
  Pawn spawns, colliders, triggers, cameras and Cinema keyframes remain exactly
  on their saved coordinates at `Y=0`; terrain and ocean descend around them.
  Old levels receive the new world non-destructively and can opt out per level.
- Added single-pass PBR ocean rendering with bounded directional waves, analytic
  normals and crest foam, plus persisted procedural lakes and river ribbons.
  The near field follows the camera while a static horizon keeps the ocean visible
  at distance. The same standard/physical material path supports WebGL and WebGPU
  without planar-reflection render targets or backend-specific shaders.
- Added seeded large and small distant islands through one instanced draw call.
  Auto quality selects mobile/menu, constrained-display or desktop budgets and
  the Environment inspector reports draw calls and animated vertex counts.
- Replaced the infinite Cannon `Y=0` fallback plane with a procedural Heightfield
  whenever generated terrain is active. Rendering, Character ground queries and
  native vehicle collision sample the same deterministic field; unchanged fields
  do not churn Cannon bodies.
- Environment now exposes presets, seed, protected margin, terrain/water quality,
  relief, coast width, sea and seabed levels, waves, foam and archipelago count,
  plus quick creation/removal of saved lakes and rivers at the camera position.
- Procedural roots have a single owner, replace atomically and retire geometry and
  materials through deferred GPU release, preventing WebGPU resources from being
  destroyed while a frame is still submitting.
- Added executable coverage for schema migration/opt-out, exact flat authored
  datum, coast continuity, determinism, water bounds, terrain/Heightfield parity,
  real Cannon raycasts, draw budgets, lifecycle idempotence and export discovery.

## Pawn Studio vehicle scale and single-owner weapon sockets

- Vehicle Seating & Full Body IK now previews bundled cars, airplanes and
  helicopters at exactly the same metre-normalized scale used in Play. The car
  is shown at its 4.4 m runtime size and every other bundled vehicle keeps the
  shared family scale, instead of loading the raw miniature GLB dimensions next
  to a 1.8 m Character. Existing seat-root and IK authoring is preserved.
- The trigger hand is now the weapon's sole transform owner in Pawn Studio. The
  weapon follows that hand's position and forward rotation, then applies the
  editable per-Pawn socket offset, rotation and scale. The support hand remains
  a separately authorable IK contact but cannot translate or rotate the weapon.
- Added executable regressions for real-size seating assets, trigger-hand barrel
  alignment, support-hand transform isolation and editable socket round trips.

## Async-safe vehicle exit and destructible vehicle energy

- Vehicle exit now performs a Play-equivalent presentation restart. It creates
  a fresh locomotion controller from the already loaded Character model and
  animation clips, rebuilds every mixer action/weight/listener, evaluates its
  first grounded frame while hidden and only then shows the Character. Gameplay
  position, health and inventory are preserved and no GLB is fetched again; the
  contaminated controller is retired only after its replacement binds.
- Removed the second animation owner that made an ordinary Character rigid or
  zombie-like after leaving a Sketchbook vehicle. Cars, airplanes and
  helicopters now use the shared occupancy transform for normal Characters and
  reserve their `driving`/`sitting` Scene Store animation path for Sketchbook's
  own advanced character. Exit also detects and removes a legacy foreign mixer
  action while immediately re-arming every locomotion action it owns.
- Destroyed vehicles remain solid wrecks. Seat eligibility and collision are now
  separate capabilities: an exploded chassis cannot be entered or driven, but
  continues to block Characters through its oriented vehicle footprint while
  its Cannon body remains in the physics world.
- Fixed the remaining rigid/zombie Character after leaving a helicopter. Vehicle
  entry now snapshots local position, rotation and scale for every bone; exit
  forcibly releases seated, weapon, traversal, stair and rig post-animation
  layers, restores that complete skeleton, then evaluates the first normal
  locomotion frame before showing the Character. The former conditional cleanup
  could abandon cockpit rotations whenever another layer had touched a bone.
- Fixed the remaining corrupted Character pose after leaving a vehicle while its
  animation assets finished loading. Before hydration, the seating layer reached
  the skeleton through the Character owner; afterwards it reached the same bones
  through the locomotion node and accidentally captured the already-seated pose
  as a new neutral baseline. Seating deltas are now owned by each bone, so the
  true pre-entry pose is restored even when the animation root changes mid-seat.
- Added a shared vehicle damage component for the native Player Car, Vehicle Logic
  Elements and Sketchbook car/airplane/helicopter Pawns. Vehicle classes receive
  different default maximum energy and expose the value in the editor; saved
  native and Logic/Sketchbook vehicle definitions persist their own configuration.
- Vehicles now provide authorable local dummies for Fuel Tank, Engine Smoke and
  Exhaust/Muffler. A rig node or GLB extra named `fuel_tank`/`serbatoio`,
  `engine_smoke`/`motore` or `exhaust`/`marmitta` takes authority automatically,
  including when the GLB hydrates after the runtime fallback was created.
- The Fuel Tank is a real raycast hit zone with an editable radius and damage
  multiplier. Damage drives a shared HUD energy bar, engine smoke and then fire;
  zero energy starts an editable delayed blast stronger than a grenade, applies
  radial gameplay damage, ejects occupants, blackens the body, detaches the wheels
  with ballistic motion and permanently blocks driving/entry until reset.
- Reset restores energy, materials, wheel hierarchy and vehicle usability. Added
  executable regressions for body/tank damage, late rig hydration, smoke/fire
  thresholds, radial explosion damage, destruction and complete restoration, plus
  the asynchronous Character-owner-to-locomotion-root seating transition.

## Visible vehicle occupants, clean exit poses and Pawn Studio seating authoring

- Normal Character Pawns now remain visible while driving native Player Cars,
  Vehicle Logic Elements and Sketchbook cars, airplanes or helicopters. The
  Character follows the live seat node every frame while its AnimationMixer keeps
  advancing, rather than freezing and hiding the last pre-entry pose.
- Added isolated seating profiles for native/Logic vehicles, Sketchbook Car,
  Sketchbook Airplane, Sketchbook Helicopter and any exact imported vehicle asset.
  An exact cockpit override cannot modify another vehicle or its family default;
  older projects inherit non-destructive defaults and require no migration.
- Vehicle seating now has a post-animation full-body contact layer. Root position
  and rotation, head target, both hands, both feet, elbow/knee poles, wrist rotation
  and all ten finger curls are authored in vehicle-seat space. Missing or
  incompatible bones degrade independently instead of stopping movement/camera.
- Pawn Studio includes **Vehicle Seating & Full Body IK**. Authors can select a
  built-in vehicle family or any project GLB, preview Character and vehicle
  together, move/rotate the seat root, select and move each IK dummy, tune blend
  weights and wrap every finger around steering wheels, sticks, levers or ordinary
  held objects. Every profile is saved back into the Character definition with the
  normal visible save receipt and Undo/Redo history.
- Fixed the corrupted post-helicopter body pose. The seated IK layer now captures
  and reverses every quaternion it changes across head, arms, hands, fingers,
  legs and feet; it can no longer leak the cockpit solve into the first on-foot
  animation. Exit also clears ADS, recoil, bob and action state before weapon IK
  can follow the returned camera.
- Vehicle exit now restores the Character root scale and model-holder transform,
  removes vehicle pitch/roll, and resolves feet height from the playable world
  surface instead of the vehicle physics centre. This is especially important
  for helicopters and aircraft, whose body origin may be metres above ground.
  Character heading and first-person yaw remain aligned by the atomic possession
  transfer.
- Added/updated executable coverage for visible occupants, seated-state release,
  family/exact-profile isolation and native, Logic and Sketchbook enter/exit
  round-trips, including a pitched airborne helicopter followed by the first
  grounded movement step.

## Stable vehicle transitions and per-vehicle Engine Sound

- Fixed the second-entry ejection affecting native, Logic and Sketchbook
  vehicles. Entry and Exit now share one edge contract: the original Use button
  must be physically released before a fresh Exit press can be accepted, even
  after the possession cooldown expires.
- Entering or leaving a vehicle now restores canvas focus and, where the browser
  permits it, pointer lock during the same gameplay gesture. The camera no longer
  waits for an extra click in the viewport before mouse look responds.
- Exiting a vehicle now resets stale control channels and aligns the Character's
  world heading, movement controller and first-person yaw to the vehicle exit
  heading. This removes the backward/sideways walk caused by body and camera using
  different frames after possession returned.
- Added independent Engine Sound runtime instances to every Sketchbook car,
  airplane and helicopter. Each vehicle can select its own project Sound Designer
  set and owns its own sample manager, RPM, mute state and synth fallback; native
  Player Car and Logic Vehicle Pawn audio remain independent as before. The
  Engine Sound panel is available directly on each Sketchbook Vehicle inspector,
  live assignment updates the active Pawn, and graph/export dependency discovery
  includes its sound set.
- Added regressions for held-Use release gating, all three real vehicle runtime
  shapes, exit body/camera alignment, per-vehicle audio isolation and set changes.

## Pawn Studio action-preview parity

- Pawn Studio now hydrates saved Motion Set action entries through the same
  bundled-body resolver used by Play. Older empty action rows such as Vault Box
  and Wall Flip therefore load and preview their real FBX instead of appearing
  missing only in the Studio. Imported author assets remain authoritative and are
  never replaced by this parity pass.
- Added regression coverage for stale Vault Box and Wall Flip entries plus
  preservation of a custom action asset.

## Free Character possession and unified vehicle entry

- Fixed possessed Character movement in saved/editor-authored levels such as
  Parking Lot. The complete live Player vector (`X`, `Z` and Sprint) now owns the
  possessed Pawn every simulation frame; Logic Graph pins remain authoritative
  for AI and unpossessed Pawns only. A missing or delayed graph axis can therefore
  no longer constrain a possessed Character to one direction.
- Added one driver-seat capability shared by the native Player Car, Vehicle Logic
  Elements and Sketchbook vehicles. A normal third-person Character can enter and
  exit all three without replacing their individual driving/physics backends.
  Player assignment, camera output, Character visibility and seat occupancy move
  atomically and roll back together if a backend refuses possession.
- On-foot Character collision now includes live vehicle bodies through an oriented
  footprint derived from each vehicle's authored half-extents and world heading.
  This prevents walking through vehicles without the over-wide blocking produced
  by a maximum-radius circle; vertical separation and the currently occupied
  vehicle are excluded.
- World interactions keep priority over boarding: one Use press opens the nearby
  door/object or enters a vehicle, never both. Normal Characters currently expose
  the complete driver flow only; the richer Sketchbook passenger/choreography path
  remains unchanged.
- Vehicle Use/Exit is now bound to `F` and X/Square, matching on-foot Use. High
  Beams moved to `L` and D-pad Left, with a targeted migration that changes only
  the exact former defaults and preserves custom mappings. English and Italian
  runtime help were updated accordingly.
- Added executable runtime-shape coverage for native, Logic and Sketchbook records,
  full enter/exit round trips, Player/camera rollback, interaction priority,
  rotated OBB collision, occupied-vehicle exclusion and conflict-free default
  mappings. Character, Input, First Person, Soccer, Sketchbook and cache-tag suites
  pass.

## Contextual weapon grips and finger authoring

- Pawn Studio now authors a base weapon grip plus twelve isolated state profiles:
  Idle, Walk and Run, each with Hip/Not Aiming and Aiming variants on the right
  and left weapon side. Each profile owns its hand count, support-hand policy,
  hand position/rotation, firing offset and finger pose without modifying a
  sibling state or another loadout weapon.
- Hip and Aim profiles blend continuously with the live analog ADS value instead
  of switching at a boolean threshold. Missing profiles inherit the existing base
  grip and old projects therefore preserve their previous pose without migration.
- Both hands expose simple `0 open → 1 wrapped` controls for Thumb, Index, Middle,
  Ring and Pinky. The post-animation layer recognizes common Mixamo/Blender finger
  chains, curls them around the held object and removes/reapplies its deltas safely
  so a procedural rig cannot accumulate a new rotation every frame.
- Context resolution lives on the shared Character Pawn path. Possessed players
  and unpossessed AI Characters select the same gait, side, ADS blend, grip and
  finger data; Actor Combat does not maintain a divergent copy.
- Added executable coverage for all context dimensions, analog ADS interpolation,
  Player/AI parity, profile isolation, left-side viewport mirroring, finger
  persistence and stable repeated finger application.

## Saved Front Flip authority, direct weapon gizmo and first-person frame budget

- Front Flip Running Vault is now the effective default for both newly created
  Pawns and existing saved levels. The migration updates the persisted Motion Set
  Action entry as well as `animations.vault`; previously that stale second copy
  retained Vault Over Box and won when the mixer resolved the action. An imported
  user vault remains untouched, and Vault Over Box remains an optional variant.
- Weapon Grip authoring now includes a direct **Weapon** selection in Pawn Studio.
  Move, Rotate and Scale operate on the visible weapon in local space and write the
  same trigger-hand socket used by Play. The untouched preview is calibrated to
  face character-forward instead of inheriting arbitrary FBX hand-bone axes, which
  could make the barrel point left.
- A switchable third/first-person Character can no longer allocate the separate
  arms Pawn merely because the project was saved while the current view was first.
  Runtime creation has a second ownership guard, and graph loading repairs stale
  `presentation: arms` / View Pawn variables even on already-versioned saves.
  Dedicated first-person-only Pawns retain the optional arms presentation by using
  `allowViewToggle: false` explicitly.
- Added executable regressions for saved vault precedence, preservation of imported
  vaults, forward weapon preview and socket gizmo persistence, dormant arms teardown,
  and saved-in-eye Character graph repair.

## Held crouch, authored vault variants, running wall flip and Pawn Studio history

- A stationary crouch now plays its entry once and clamps on the final low pose
  while C/toggle remains active. It no longer repeatedly stands and crouches;
  directional crouch, ledge and climb clips remain proper locomotion loops.
- Replaced the stock short-obstacle vault with the verified Front Flip Running
  Vault asset. Vault Over Box remains available as an independent animation slot.
- Added data-driven vault selection with Primary, weighted Random and measured
  Height/Depth Rules modes. Pawn Studio exposes any number of enabled variants,
  their slots, weights, dimensional ranges, priority and explicit override flag.
- Added the verified Wall Flip asset and traversal state. It can start only while
  running forward into a tall wall, keeps the gameplay root fixed for the take,
  and requires Run to be released/re-pressed after completion so held input cannot
  restart the animation in a loop.
- Pawn Studio now provides project-level Undo/Redo (`Ctrl+Z`, `Ctrl+Y` and
  `Ctrl+Shift+Z`). Restored states are immediately persisted back into the Logic
  Element and the save indicator confirms the operation.
- Auto Key frames are now visible as selectable markers on the slot timeline.
  Authors can scrub to a marker, edit its exact time in seconds, modify its pose
  with the existing root/bone gizmos, delete it, or reset every key in that slot;
  reset remains recoverable through Undo.
- Added executable regression coverage for crouch clamp-vs-gait semantics, vault
  rule selection and overrides, wall-flip root/latch behaviour, Pawn Studio
  history and timeline authoring controls.

## Stable Pawn pivot, saved per-slot floor authoring and trigger-hand weapon socket

- Removed automatic Hips-Y preservation after it could accumulate against the rig
  guard and visibly lift both the mesh and its pivot several seconds into Play.
  Imported animation position/scale tracks are blocked again; the Pawn/collider
  pivot remains fixed exactly as before.
- Pawn Studio now identifies the isolated slot floor/pivot Y correction explicitly.
  Static visual offsets and timeline Root keys are saved on that slot only and move
  the visible Main Mesh without changing gameplay collision or world translation.
- Every authoring write now produces a persistent green `Saved in project` receipt
  containing the selected slot/container and time. Pending changes, save-in-progress,
  world-sync-pending and failure states use distinct visible colours. A dedicated
  `Save this slot now` action is also available beside the slot transform.
- The carried weapon now takes both world position and animated rotation from the
  real trigger hand. A one-time bone-axis calibration preserves the correct barrel
  direction across Mixamo/Blender rigs without parenting below or inheriting the
  skeleton's import scale; Fire and Reload hand motion therefore carries the weapon.
- Authored firearm Fire clips now own their arm chains while active instead of being
  overwritten by the procedural grip IK. Placeholder Fire keeps the procedural layer;
  as the authored clip releases, normal carry IK blends back with locomotion.
- Fixed the named-bone fallback so an unavailable socket name resolves on the active
  trigger side instead of silently selecting the opposite hand.
- Pawn Studio exposes the complete weapon-to-trigger-hand socket: automatic or named
  hand bone, animation-follow toggle, local position, rotation, scale and Play helper.
  The same runtime weapon is visibly attached to the gold trigger-hand dummy while
  authoring, and every value persists in the Pawn definition.
- Added executable coverage for animated hand following, scale isolation, the rigid
  orientation opt-out, socket persistence and the attached Pawn Studio preview.

## Unified Character eye camera and duration-correct Pawn Studio timeline

- A Character that starts in third person and supports view switching no longer
  creates the optional first-person arms Pawn at all. Eye view reuses the same
  Character, skeleton, AnimationMixer, weapon state and input controller; only the
  shared camera transform changes. Saved convertible Characters migrate to this
  ownership model even when an obsolete variable still requested separate arms.
- Full-body first person now leaves the imported SkinnedMesh and every Head-bone
  transform untouched in both views. The eye receives a camera-only horizontal
  face clearance and a safe near plane, removing full-screen head-material overdraw
  without risking a missing head after returning to third person.
- Removed the per-frame recursive Head-bone world-matrix update and repeated body
  traversal introduced by the earlier culling path. A stable first-person frame now
  performs neither operation; old saved clearances below `0.18 m` migrate to the
  safe `0.22 m` default.
- Dedicated first-person-only projects may still explicitly opt into the classic
  separate-arms presentation. The standard convertible Character never allocates
  that component or its GPU visual.
- Vehicle interior view was verified to follow the same ownership rule: the existing
  vehicle root remains authoritative and the interior camera copies its authored
  dummy transform; no second Vehicle Pawn is created.
- Pawn Studio's timeline is now expressed in real seconds. Its maximum is the source
  clip duration adjusted by the slot Playback Rate, the readout shows current/total
  time, and reverse-playback slots progress from `0 s` while sampling the clip from
  its end. Persisted pose keys remain normalized and therefore survive speed changes.
- Added executable coverage for immutable monolithic body/head ownership, the
  no-traversal/no-skeleton-update frame budget, absence of the view Pawn on
  convertible Characters, and forward/reverse timeline duration math.

## Pawn Studio complete action slots and per-slot animation timeline

- Motion Animation Set now includes the complete named Character action catalogue,
  including Roll, Fire, Punch, Knife Attack, traversal, cover and death slots. Existing
  verified bundled assets are associated automatically instead of remaining hidden in
  the separate legacy animation map.
- An action slot can be reassigned directly from Properties through `Gameplay Action
  Slot`, then filled with the existing FBX/GLB import control. Physical keys remain in
  Input Mapping; Pawn Studio binds the animation to the semantic gameplay action.
- Added a scrub timeline below the isolated viewport. Each animation slot owns its own
  normalized key track; Auto Key records whole-character Move/Rotate or local bone
  rotation from the existing gizmos, and runtime interpolates those corrections over
  the original clip without rewriting FBX/GLB data or another slot.
- Fixed action resolution to prefer the semantic slot supplied by gameplay (`roll`,
  `fire`, etc.) even when the backing clip has a different exported name.
- Traversal Jump is now edge-triggered inside the ability state machine. Holding Jump
  cannot start a second mantle/climb or immediately cancel the climb it just began.
- Surface-contact IK now attenuates corrections that exceed the measured limb reach,
  preserving the authored shoulders/hips and preventing extreme upper-body distortion.
- Added executable coverage for visible Roll/Fire/Punch/Knife bindings, isolated pose
  timeline interpolation and held-Jump traversal de-duplication.

## Surface-adaptive vault, mantle, hang and climbing

- Traversal now measures the selected collider's near face, far face/depth, top
  and outward normal once, then publishes named root, left/right hand, left/right
  foot and elbow/knee pole targets from that single result.
- Vault and mantle root travel use a phase-aware motion-warp target instead of a
  fixed reach guess. Vault clears the measured object depth; mantle pulls onto its
  near lip, while climb/hang contacts follow the live face and ledge height.
- A post-animation two-bone contact layer refines hands first and feet second over
  the authored full-body clip. Contact weight, root warp, spacing, offsets and the
  hand/foot phase windows are authorable under `Traversal / Contact Adaptation`.
- Added an Editor / Play-in-Editor-only probe visualizer for hit, normal, root,
  effectors and joint poles. The helper is never created in standalone/exported
  gameplay and reuses one fixed GPU buffer instead of allocating per frame.
- Saved Character and advanced Sketchbook graphs migrate idempotently to the new
  controls without replacing authored traversal values or existing Inspector rows.
- Added executable coverage for AABB depth/normal probing, phase-ordered goals,
  four-limb solving, saved-graph migration and editor-only GPU-buffer reuse.

## Head-bone first-person camera and placeholder visibility ownership

- First-person camera height now resolves from the same Character Main Mesh Head
  bone used in third person, plus an authorable eye offset. The sampled local height
  remains stable through animation; automatic resolution can be disabled for a fully
  manual `Eye Height` value.
- Fixed Character procedural parts reappearing after the imported GLB/FBX was ready.
  Model loading now updates the camera visibility cache and stamps asset-suppressed
  placeholders, so switching third/first person cannot reveal dummy cubes or the
  fallback mesh inside the real Character.
- Added regressions for head-derived camera height, manual override and placeholder
  visibility across both directions of a camera transition.
- Existing saved Character graphs migrate once to expose head-height and camera-only
  face-clearance controls in the Inspector. Custom manual/automatic choices, eye
  offsets and already-safe forward clearances are preserved.

## Bind-pose-free landings and body-relative weapon carry

- Removed the competing Three.js `AnimationAction.fadeIn/fadeOut` envelope from
  Character one-shots. The shared skeletal crossfade is now the sole weight owner,
  and action plus locomotion always cover the complete skeleton instead of exposing
  a temporary T/bind pose after an ordinary landing.
- Fixed the remaining Motion Set gap where `landMoving` was interpreted as the base
  `action` phase as well as the landing layer. The base now continues to select
  grounded/airborne locomotion, and layered frames apply one exact complementary
  envelope: no delayed gait, doubled pose or uncovered skeleton. A repeated jump
  also ignores the landing name already captured in that frame and selects Jump.
- Walking and running carry now follow the Character's actual facing rather than
  the camera crosshair. ADS pulls the arms and world weapon only partially toward
  the sight line; a real shot commits them fully for the recoil impulse. This also
  fixes backward/toward-camera locomotion while preserving weapon-specific grips.
- Added executable regressions for moving `Falling To Landing` weight coverage and
  the body → partial ADS → fire ownership transition.

## Reactive Character locomotion, traversal arms and firing slots

- Third-person hip locomotion now uses camera-relative travel with movement-facing
  rotation, so a running Character is no longer pinned unnaturally to the centre
  crosshair. ADS, firing and first-person switch per frame to heading-relative
  strafing, preserving exact combat aim without rewriting the authored Pawn settings.
- Full-body actions now own their complete skeleton. Weapon stance and post-mixer
  two-arm IK fade out during Climb, Hang, Ledge Shimmy, Vault, Mantle, Roll, Slide,
  heavy landings, melee and throws, then return with locomotion; aiming can no longer
  overwrite the arms of a traversal clip.
- Single- and double-hand procedural grip gains are independent and gait-aware:
  hip locomotion keeps natural shoulder/elbow motion, ADS converges firmly onto the
  live weapon grips, and recoil is a short time-based impulse instead of remaining
  frozen for the weapon's entire fire cooldown.
- A fast `Falling To Landing` gives Run useful skeleton weight on the contact frame,
  releases completely within the early part of the take and bypasses ordinary gait
  smoothing when Run is gaining weight. Stopped and heavy landings retain their
  slower impact profile; a repeated jump still interrupts landing immediately.
- Added authorable `fireSingleIdle`, `fireSingleWalk`, `fireSingleRun`,
  `fireAutoIdle`, `fireAutoWalk` and `fireAutoRun` slots. Runtime selects them from
  trigger mode and live gait, falling back to the existing `fire` clip and then the
  procedural recoil, so GLB clips can be imported independently without T-pose gaps.

## Advanced Character traversal and melee animation pack

- Validated and promoted eleven new FBX sources from `models_sources` into the
  portable `models/characters/shared` runtime pack. They now fill Slide, Vault,
  Mantle, Climb, Hang, Climb Up, both Ledge Shimmies, Punch, Knife Attack and Hit
  Reaction for every bundled humanoid body.
- `Climbing To Top` is shared by both directions: `climbUp` plays forward and
  `climbDown` starts at the final frame with playback `-1`. Negative one-shot and
  looping rates are now supported without immediately finishing at time zero.
- Every new take passed the real FBXLoader parsing and root-displacement tool
  before registration. `Climbing Down` and `Sprint To Wall Climb` remain optional
  source alternatives and are not silently substituted into another slot.
- Only `landCrouch` and `interact` remain without dedicated bundled clips.
  Crouched landing now degrades through Moving Land and ordinary Land, preserving
  a visible transition without mislabelling the Shooting pack's `Jump Down` take.

## Phase-aware skeletal animation blending

- Replaced the fixed `5–8%` locomotion suppression used during every one-shot
  with a shared, normalized skeletal crossfade policy. Imported GLB/FBX rigs and
  the procedural placeholder now use the same transition weights.
- Running landings keep their impact pose, then return weight to Walk/Run while
  the landing clip is still playing. A repeated jump cancels the stale landing
  on the first airborne frame, so Jump/Fall owns the skeleton immediately.
- Added semantic profiles: movement transitions release progressively,
  fire/reload/interact preserve moving legs, while Roll/Slide/Vault/Climb and
  other body-locked actions remain dominant until their safe exit phase.
- Motion transforms, curve corrections and per-bone Edit Rig corrections now
  follow the same action weight as the visible skeleton instead of remaining at
  full strength after the animation has started blending out.
- Added executable coverage for normalized weights, moving versus stopped
  landings, shared Motion Set/one-shot actions, procedural bodies and repeated
  running jumps.

## WebGPU resource retirement at submit authority

- Replaced runtime monkey patches of `GPUDevice`, `GPUBuffer`, `GPUTexture`, Three
  backend destroy methods and the private renderer texture manager with a source-level
  compatibility backport in the generated Three r185 bundle.
- Native WebGPU resources now follow `retire -> queue.submit -> onSubmittedWorkDone ->
  destroy`. Three invalidates its CPU-side cache immediately, while the native handle
  survives every command buffer that can still reference it.
- Preserved the upstream ownership guard for externally-owned depth textures such as
  `ShadowDepthTexture`; resize, sample-count changes and target teardown cannot destroy
  a depth texture owned by a different render target.
- Added behavioral tests for retirement ordering, fence completion and deduplication,
  plus a contract test proving that browser and Three prototypes remain untouched.
  WebGL fallback and WebGPU session quarantine remain enabled until a real prolonged
  editor/play soak completes without validation errors or device loss.

## Pawn Studio two-hand rig authoring

- Both trigger and support hands are always selectable. The support arm has an explicit
  `Auto / On / Off` policy, including on single-hand weapons, while legacy
  `support.enabled` data remains readable.
- The gold trigger and blue support dummies are now directly pickable in the viewport;
  the local transform gizmo reattaches before the drag begins and the toolbar selector
  remains synchronized.
- Move and local Rotate gizmos now author independent hand position and rotation and
  feed `triggerRotation` / `supportRotation` into the same runtime solver used in Play.
- Fixed the wrist-delta lifecycle after an AnimationMixer/editor pose restore. The
  old cache could undo a rotation that was already gone, causing the authored wrist
  pose to alternate or cancel between frames.
- Pawn Studio can preview the starting weapon or any loadout weapon. It builds the same
  world model used by gameplay, keeps one grip per weapon and disposes replaced preview
  resources cleanly.
- Grip defaults come from runtime weapon normalization and `resolveGrip`; the editor no
  longer needs a divergent table of hand placements.

## Authorable Weapon Pickup Logic Elements

- Added nine reusable weapon pickup templates: rifle, marksman rifle, shotgun, pistol,
  SMG, knife, bat, flashbang and grenade. Each has a distinct fallback placeholder and
  an author-replaceable `weapon_model` child accepting GLB or FBX assets.
- Exposed preset/name, magazine and reserve ammo, respawn, pickup radius, mass,
  carryability, authored/generated visual policy and Character `fire/reload/throw`
  animation mapping through the Logic Element contract.
- Pickup now hydrates the shared inventory/ammo state and applies per-weapon Character
  action slots on equip, restoring the previous mappings when switching weapons.
- Converted the five FPS Arena floor weapons from hardcoded primitive items to these
  Logic Elements. Enemy Outpost inherits the same reusable authoring path.

## Deterministic Camera and Player output authority

- Added one pure output resolver shared by Editor Play, standalone gameplay and every
  split-screen lane. The priority is now explicit: active Cinema, explicit Logic
  camera, possessed Pawn, legacy Pawn alias, native Player 1, then Active Level Camera.
- A missing or invalid Cinema camera no longer blocks gameplay input. A Cinema assigned
  to Player 2–4 cannot steal Player 1, and each split-screen pass scopes and restores its
  own camera/HUD ownership even if rendering throws.
- Removed the divergent Editor/runtime camera decision trees and added executable
  resolver and aspect-policy coverage.

## First-person presentation Pawn separation

- Added a versioned `FirstPersonViewPawn` component. The Character remains the sole
  owner of its body, locomotion mixer, gameplay input and eye camera; classic shooter
  arms plus weapon are an optional visual Pawn with independent teardown.
- Switching to full-body eye view or back to third person now destroys the arms visual
  instead of retaining a second skinned rig and duplicated weapon. The normal FPS Arena,
  Character, AI and Enemy Outpost now all default to the same animated full body and
  world weapon; the eye-height camera is merely another view of that Character.
- Removed the FPS Arena override and the old reverse migration that silently restored
  `first-person-arms`. Existing engine FPS Pawns migrate once to `body`/`viewPawn:none`,
  including matching Inspector values. A custom author-selected arms presentation is
  preserved and remains available as an explicit optional visual.
- Legacy `presentation`, `hideOwnBody` and `showLegs` data migrate idempotently into the
  new schema. The earlier repair for saved levels accidentally forced to an unanimated
  body remains intact.
- `FirstPersonViewPawn.attach()` is itself idempotent: reconfiguration cannot install a
  second owner or a second Pawn-dispose hook.
- Added the new module and cache tags to Editor, gameplay and playable-export manifests;
  headless first-person, view-model ownership, migration and weapon-pickup suites pass.

## P2P host migration and authority epochs

- Upgraded the wire contract to protocol v3 with host identity and monotonically
  increasing authority epochs on host-only messages. Stale, replayed and falsely
  authoritative packets are rejected before they can mutate gameplay state.
- Host loss now runs a deterministic election, assigns Player 1 to the winner, rebuilds
  the roster without duplicate seats and preserves replica/netId continuity across
  reconnects. Frame hooks and director teardown remain single-owner.
- The current transport topology is still star-shaped: election state survives a host
  loss, but guests without an existing peer-to-peer link must exchange a fresh
  invite/answer before the new host can carry their traffic.
- Standardized every shell/export loader to `protocol → session → replication →
  director`; bootstrap waits for DOM parsing rather than dynamically duplicating modules
  that already occur later in the document. Close/reattach is idempotent and clears old
  replica/netId/tick/stat state while retaining exactly one frame hook.

## Authorable UI Logic Elements

- Added one owner-scoped UI runtime shared by Editor Play, gameplay and standalone
  export, with Canvas, Panel, Text, Image, Button, Progress and Value elements.
- Layout exposes responsive anchors and offsets, safe-area padding, z-order,
  visibility, enabled state, colors, font controls and texture assets. Missing images
  degrade to an explicit placeholder instead of a broken element.
- Buttons stop pointer/key propagation before it reaches Pawn input and emit scoped
  semantic `On UI Action` events filtered by Logic Element owner, element ID and
  action. Rebuild and teardown remove only that graph's UI namespace.
- Headless or DOM-less environments load the modules safely and UI mounting degrades to
  a no-op, keeping server/test/export tooling independent of browser globals.
- Added five reusable Engine Asset templates, dependency collection and playable ZIP
  embedding for UI textures, plus executable runtime/export/lifecycle tests.

## Procedural Asset Library

- Added nine parametric Engine Assets: box, plane, cylinder, sphere, wall, arch,
  stairs, road and pipe. They live under `ENGINE ASSETS → PROCEDURAL BUILDING KIT`
  with distinct generated thumbnails and drag/place support.
- Each serialized recipe exposes dimensions and segments, PBR/toon/unlit material,
  procedural surface, UV scale/offset/rotation and collision/physics settings. Scene
  Store uses the same primitive/material path in Editor, Play and exported gameplay.
- Inspector rebuilds keep the authored root stable, refresh composite tiling and
  collision, and dispose only geometry/material/texture resources owned by that
  factory. Externally assigned resources and cached `lkSurface` textures shared by
  materials survive rebuilds.
- Added executable geometry, deterministic rebuild, serialization, catalog, scene
  reload and WebGPU-deferred-disposal coverage.

## Grounded stair locomotion and complete fallback legs

- Added bilateral knee and foot roles to the humanoid placeholder hierarchy and a
  stair pose driven by measured step rise, speed and ground contact. Quadruped
  placeholders reuse their four knee/ankle/toe chains.
- Character movement now reports `stepRise`, `stepHeight`, alternating `stepSide` and
  `groundContact` while climbing walkable collider tops. A stair tread remains grounded
  locomotion: it never queues Jump, emits a Jump event or borrows an airborne clip.
- Rigged GLB characters map common Left/Right Leg, Calf/Shin and Foot/Ankle names and
  apply non-accumulating post-mixer deltas; partial or unusual rigs simply skip missing
  bones. State remains isolated per Pawn/controller.
- Exposed `Step Height` and `Stair Pose Strength` for Character, Soccer and Animal
  authoring, including Pawn Studio, with executable multi-Pawn and incomplete-rig tests.

## Player assignment, conflict guard and Pawn-state isolation

- Character, Vehicle, Animal, Soccer and Sketchbook Pawns now share the same authorable
  `None / Player 1–4` assignment surface and central slot registry. Automatic On Start
  claims use `force:false`; force remains reserved for explicit transfers such as
  mounting or entering a vehicle.
- Slot changes are transactional: a rejected non-force retarget keeps the Pawn's old
  slot, while an explicit transfer releases the displaced Pawn's camera and transient
  input state. None/unpossess releases are symmetric and the slot is immediately reusable.
- Releasing a Character clears latched aim/fire/reload/view/swap input without resetting
  inventory or ammunition. Soccer also cancels shot charge/setup/held actions, preventing
  a former player command from firing later through a goalkeeper or AI Pawn.
- Generalized the Inspector conflict guard across all Pawn descriptors and added
  executable multi-Pawn assignment, FPS ownership-release and Soccer state-isolation tests.

## Integration gauntlet: Character actions and authored grips

- Re-ran the Character, Traversal and Pawn Studio groups plus the previously
  stand-alone weapon-hands, weapon-grip and FBX runtime tests. The runtime paths pass,
  including real FBXLoader parsing of every registered Character take.
- Added the weapon-hands, weapon-grip and Character FBX runtime suites to the normal
  `test:character` release gate; these tests can no longer pass manually while being
  absent from `npm test`.
- Corrected the handoff after executable verification: `Falling To Landing` already
  retargets its numbered `mixamorig5` namespace, low-cover entry is author-facing, and
  the current versioned tree contains four unreadable FBX files rather than five.
- Grip authoring, action/cover hooks and the saved-strafe migration are implemented.
  Death Front/Back are catalogued and authorable, but ordinary runtime death still
  transfers directly to death physics/ragdoll; the two clips are not presented as a
  complete animated-death mode.
- Corrected the placeholder action disambiguation: a Character `fire` slot using a
  generic/readable firing clip now produces firearm recoil rather than falling through
  to the one-arm Interact gesture; Soccer `Shoot` remains a kick.
- Repaired the pre-existing Enemy Outpost test harness by registering and instantiating
  `logic-template-player-first-person`, exactly as the FPS arena does. The original
  engine assertions were kept intact and now pass against the actual graph contract.
- Extended cache hygiene to new/untracked JavaScript plus the dynamic editor loader and
  export manifest. A tag in one HTML shell can no longer hide a stale URL in another
  runtime loading path.
- The final cross-system gauntlet found one saved-schema mismatch after otherwise-green
  subsystem tests: Enemy Outpost authored `viewPawn:none` but did not mirror legacy
  `presentation:body`. Both body/arms samples now write coherent new and legacy fields;
  the level-template and migration tests pass, and the affected cache tags were bumped.

## Cinema sequence runtime parity

- Extracted spatial spline evaluation into one pure runtime module shared by Cinema
  Studio, Editor Play and the final gameplay runtime. `linear`, automatic `smooth` and
  editable `bezier` paths now evaluate the same positions everywhere.
- Runtime playback now consumes `pathMode`, `spatialMode`, `tangentIn` and `tangentOut`
  instead of reducing every authored path to a straight position lerp. Temporal easing
  remains independent from the spatial curve.
- Added a release-gated parity test that evaluates an authored curved segment and checks
  that the gameplay path calls the shared evaluator.

## P2P replica resource ownership

- Replica teardown no longer disposes geometry, materials or textures merely because
  they appear below a cloned avatar. Three.js `clone(true)` shares those GPU resources
  with the original Pawn, so disposing them could visually destroy the local player.
- Replica factories now publish an explicit ownership manifest. Only placeholder,
  nameplate or custom-factory resources recorded in that manifest are disposed, once.
- Replication frame hooks now have symmetric installation and teardown; stopping or
  reattaching a session cannot accumulate interpolation callbacks.

## Known issue / WebGPU handoff

- WebGPU for Editor/Play remains experimental and must not yet be promoted to
  the automatic default. The stable WebGL 2 fallback remains enabled.
- The original native vertex-buffer failure was traced to shared-resource
  disposal in `scene-store`; live-scene ownership checks now prevent a detached
  GLB, clone or warm-up object from disposing geometry, material, texture or
  bone texture still referenced elsewhere.
- The remaining reproducible failure is a Three.js shadow render-target
  lifecycle error: `Destroyed texture [Texture "ShadowDepthTexture"] used in a
  submit`, followed by session fallback. It has been observed on
  `renderContext_3` and `renderContext_5` with a 512×512 `depth24plus` texture,
  usage `23`.
- A second observed failure mode appears after WebGPU has been running for a
  while: the 3D viewport becomes black/dark while the editor UI, radar, input,
  movement and gameplay events (including thrown objects) keep updating. This
  confirms that the simulation and UI loops remain alive and isolates the
  failure to WebGPU presentation/rendering rather than a complete runtime
  crash. Capture the first console error and `device.lost` reason from this
  transition before changing fallback policy.
- Comparison with current Three.js source found that pinned r185.1 treats an
  externally owned depth texture as if it belonged to every temporary render
  target that references it. The generated compatibility bundle now backports
  all three upstream ownership guards: render-target resize, sample-count
  change and target teardown act on the depth texture only when
  `depthTexture.renderTarget === renderTarget`. This covers the
  `ShadowDepthTexture` path at its Three.js source boundary; the runtime guard
  remains as a defensive compatibility layer. Build
  `webgpu-shadow-ownership-1` still requires a clean, prolonged browser
  validation run before WebGPU can be called stable.
- Do not restore renderer-lifetime retention of all GPU buffers/textures. That
  workaround stopped validation errors temporarily but accumulated native GPU
  resources and eventually caused `WebGPU Device Lost: A valid external
  Instance reference no longer exists` plus a visually blank viewport.
- Native WebGPU diagnostics currently label buffer and texture generations and
  capture creation/destruction metadata and destroy stacks. Keep this tracing
  enabled until the shadow fix has been verified over editor startup, menu open,
  viewport resize, Play and return-to-editor cycles.

## Stable renderer handoff and authoritative 3D menu

- Serialized the landing Menu → Editor/Play transition: the previous iframe is
  disposed and navigated to `about:blank` before the next renderer is created.
  Normal navigation no longer calls `forceContextLoss()`, eliminating the
  self-generated `CONTEXT_LOST_WEBGL` event and the context-exhaustion failure
  that could leave every level white and prevent the Editor from booting.
- The Editor host is revealed when its renderer handoff begins instead of only
  after the complete iframe `load` event. Large projects and synchronous startup
  modules can now show their own loading state instead of appearing stuck on
  the landing page.
- Removed the landing listener that recreated its renderer for ordinary Local
  Workspace writes. Project saving can no longer enter a renderer reload loop.
- The short-lived landing preview now uses the proven WebGL path and cannot
  allocate a failed WebGPU provider alongside its fallback. WebGPU preference
  remains active for the actual Editor, Play viewport and game runtime once the
  browser adapter has been successfully probed.
- Natural WebGPU output no longer enters the TSL illustrated pipeline merely
  because legacy Volumetric Lighting, FXAA, quality sharpening, DoF or ray
  controls are enabled. Those unsupported triggers previously replaced the
  valid first 3D frame with an empty intermediate target; sketch, monochrome
  and color grading still use the WebGPU-native graph.
- Menu, Editor and Play handoff now explicitly disposes post-processing and
  path-tracing targets before disposing the renderer, preventing GPU resources
  from waiting for a later browser garbage-collection cycle across launches.
- Added structured WebGPU validation diagnostics. Repeated Three.js/WGSL and
  native device errors are grouped by signature, retained with a representative
  sample and written through the existing Developer Debugger instead of
  flooding DevTools once per material, actor or frame.
- A rapid WebGPU validation storm now quarantines only the current browser
  session and rebuilds once on stable WebGL before Chrome can block the shared
  GPU process. The authored WebGPU preference is preserved; explicitly choosing
  WebGPU again clears quarantine for a deliberate retest after a fix.
- Corrected the deferred WebGPU destruction fence itself: resource batches now
  cross the complete animation frame and its task tail before taking
  `queue.onSubmittedWorkDone()`, and
  resources disposed while that fence is pending enter a separate batch. This
  prevents the cleanup callback from running before the Editor's render callback
  in the same refresh and destroying a buffer between command recording and
  queue submission—the concrete `used in submit while destroyed` failure
  captured on the FPS project.
- Enforced that fence at Three.js' resource boundary as well. Direct disposal of
  geometries, buffer attributes, interleaved buffers, materials, textures and
  render targets from older runtime/editor/plugin paths is automatically
  deferred under WebGPU and remains immediate under WebGL. New systems can no
  longer reintroduce the same use-after-free by forgetting a store-specific
  helper.
- Covered Three.js' internal render-object invalidation path too: retiring a
  vertex/index attribute or uniform buffer now uses the same queue fence even
  when no public `dispose()` event is emitted.
- Removed `compileAsync()` from mutable WebGPU Editor/Play scene warm-up. Three
  r185 snapshots render objects and yields between compiling them; a scene apply
  or helper rebuild could therefore dispose captured geometry before compilation
  resumed. WebGPU now warms through authoritative rendered frames, while frozen
  Cinema export may still precompile safely. Internal retirement removes Three's
  cache entry immediately and defers only the native `GPUBuffer.destroy()`.
- Enforced the lifetime rule at the native WebGPU boundary as well. Every buffer
  created by the renderer device is labeled for diagnostics, and every native
  `GPUBuffer.destroy()`—including transient query/readback buffers owned only by
  Three—is held until submitted GPU work has drained.
- Native buffer validation reports now include the buffer descriptor, creation
  and destruction timestamps, plus the original JavaScript destruction stack.
  A backend-owned resource that remains referenced after retirement can be
  traced to its actual owner instead of producing an anonymous repeated error.
- Added live-scene GPU ownership checks to `scene-store`: detaching a GLB,
  warm-up object or clone no longer disposes geometry, material, texture or bone
  texture still shared by another scene/registry object. The captured
  buffer-146 stack identified this actual ownership bug.
- Replaced renderer-lifetime native-resource retention—which could exhaust the
  GPU device during a long editor session—with ownership-aware cleanup.
  Exclusive resources use the normal queue fence.
- Backported the current upstream Three.js render-target ownership rule to the
  pinned r185.1 runtime: an attached depth texture is destroyed only when its
  `renderTarget` points back to that target. `ShadowNode` externally owns
  `ShadowDepthTexture`, so target retirement no longer destroys a texture still
  referenced by lighting bind groups. Native texture labels now include a unique
  generation suffix so diagnostics cannot confuse an old and replacement target.
- The 3D landing background now reads the full exported Demo Project in memory,
  with the lightweight ROLE file only as an emergency fallback. It never
  installs Demo over the author's Local Workspace or substitutes the currently
  selected local project for the published menu.
- Suppressed only Chrome's non-actionable closed extension-message-channel
  rejection during iframe navigation; genuine engine and GPU errors remain
  visible.

## Stable Character camera and unified full-body eye view

- Fixed the apparent loss of Character animations after separating full-body
  and first-person presentation. Models, skeletons and clips were still bound,
  but imported Logic Element mixers could stop at their first frame when their
  scene effect hook changed lifecycle. During Play the shared Character
  locomotion controller now owns and advances its mixer directly; scene-store
  automatically steps aside and resumes ownership when the Pawn/controller is
  disposed. This applies to normal FPS, Enemy Outpost, Soccer and reusable
  Character Logic Elements without merging the full-body and arms-only rigs.
- Fixed Editor Play rendering a fixed scene camera while the possessed FPS
  Character still received movement/fire input. Disabling the native Player
  Car no longer makes the Editor consider Player 1 camera-less when a Character
  Pawn owns that output. Possessed Characters now also claim their camera when
  they start and release it on unpossess/dispose, so older saved graphs do not
  depend on replaying a particular On Start camera node.
- Fixed the full-body weapon-pose layer aborting every Character frame while
  aiming because its local quaternion workspace was never allocated. Movement
  and firing could continue far enough to be audible, but camera ownership,
  HUD and later Pawn updates remained incomplete. The pose now also degrades
  safely on imported rigs that omit a hand bone instead of treating the lower
  arm as its own endpoint. Weapon posing is isolated from the Pawn frame as a
  final safeguard: an incompatible rig disables only that cosmetic layer and
  cannot take down camera, input, HUD or other Characters.
- Fixed double-tap Dodge applying two rolls at once. When `AnimRoll` resolves
  to a playable clip such as `Falling To Roll`, that clip is now the sole visual
  authority while traversal retains translation, collision and timing. The
  procedural 360-degree body tumble runs only when no authored clip can start.
- Synchronized roll travel to the real authored clip duration. The bundled
  `Falling To Roll` take is 1.8 seconds while the old traversal timer was 0.62
  seconds, which made the Pawn slide first and show the recognizable roll near
  the end. Runtime now reads the active AnimationMixer action duration, moves
  for that same interval and preserves a fixed total distance. Authors can tune
  `Roll Travel (m)` and `Roll Animation Speed` in Traversal; saved Character
  graphs receive both controls without replacing their existing roll tuning.
  Animated travel is driven by the active `AnimationAction` normalized progress,
  not by a parallel controller clock: a clip held on its first frame can no
  longer make an idle-looking Character slide forward before the visible roll.
  The underlying frame-order bug was also removed: traversal previously returned
  early from the Pawn frame before `locomotion.update()`, freezing the roll clip
  while procedural translation continued and only letting the animation play
  after the move ended. Traversal can own movement without skipping its mixer.
- Fixed gameplay levels inheriting `editor-menu`/`game-menu` from a previously
  opened Demo or Level Menu when older project metadata omitted `levelRole`.
  Runtime catalog entries now retain their positive `gameplay` role, the active
  editor track wins over stale editor state, and loading a complete legacy
  project defaults its missing role to gameplay. This restores the Character
  camera and HUD while leaving genuine authored Menu Levels UI-free.
  Official FPS Shooter Test and Enemy Outpost saves already stamped with the
  stale menu role are migrated back to gameplay in both persistence and the
  current runtime session.
- Third-person Character distance is now owned by the author/player: aiming,
  sprinting, animation contact and nearby props no longer pump the camera toward
  the body. Mouse-wheel zoom updates that same Character camera distance.
- Added explicit TPS `Automatic ADS / Sprint Distance` and `Wall Obstruction`
  controls. The stable default is fixed distance; the former cinematic dolly and
  wall pull-in remain available per Pawn instead of being imposed globally.
- Replaced the sampled spring-arm collision march with one analytic segment/AABB
  pass and correct Pawn-hierarchy filtering. Opt-in wall avoidance no longer
  scans every collider sixteen times per camera request or mistakes the owning
  Character/weapon hierarchy for a wall.
- The Enemy Outpost now starts in third person and toggles to a unified full-body
  eye view: the existing Character, animations and world weapon remain
  authoritative, the camera moves to eye height, and the real procedural arms
  extend onto the camera-aligned weapon. Saved Outpost template copies migrate
  to this v5 presentation automatically.
- An intermediate implementation kept the dedicated `FPS Shooter Test` on the
  classic `Arms and weapon` presentation. This was superseded in the same release:
  the test now also uses the complete Character and its eye camera. Arms-only games
  remain supported solely through the explicit author option.
- Removed forced recursive `updateMatrixWorld(true)` calls from the eye camera,
  Character camera and vehicle cockpit paths. Camera movement now updates only
  the owning root/parent path instead of traversing the complete imported GLB,
  skeleton and every child a second time per frame; this targets the severe FPS
  drop observed when entering the body or a vehicle interior.
- Added presentation schema v2. Saved third-person Characters that inherited
  the old arms-only default migrate to the unified body view, while explicitly
  authored new arms-only Pawns and dedicated first-person templates keep their
  selected presentation.
- Added a post-animation full-body weapon pose layer for imported rigs. Pistols
  and other one-handed weapons lead with the trigger arm, two-handed weapons
  align both hands, throwable items use a cocked throwing pose, and unarmed
  Characters use guard/punch poses. The layer operates after the animation
  mixer, so it no longer requires a duplicate first-person arms model.
- Classified firearm, throwable, melee and unarmed actions end to end.
  Non-firearm actions cannot emit gun tracers, impact decals, muzzle flashes or
  firearm audio; an unarmed punch therefore cannot create the former fake shot
  and flame.
- Player HUD feedback is now ownership-filtered. The red damage vignette reacts
  only when the currently possessed Player Pawn is damaged, and AI/enemy hit or
  death events cannot be mistaken for damage received by the Player.
- Reverified the possession boundary across Character combat, Actor Behavior,
  the action router and Soccer AI: a possessed Pawn clears stale autonomous
  commands, and goalkeeper/field AI cannot mirror the Player's jump or fire
  input.

## Asset ownership in the Editor

- Split the Asset panel into explicit `Engine Assets`, `User Assets` and,
  whenever an enabled plugin contributes content, `Plugin Assets` sections.
  Built-in Logic templates and bundled model packs stay under Engine; imports,
  reusable assets, sound sets, levels, project content and current-scene assets
  stay under User. Existing imported-library records migrate to User ownership.
- Added the plugin `assetProvider` extension point. Provider assets are grouped
  under the owning plugin’s display name, support normal placement/dragging and
  disappear as soon as that plugin is disabled; conversion tools such as the
  FBX importer do not claim ownership of the user files they process.
- User folders now organize User Assets only. Engine and Plugin content remains
  in its authoritative section even if an old folder assignment still exists.

## Possession-safe input, reusable actor AI and physical death

- Upgraded input configuration to schema v15 and separated Character `Jump`
  from the Vehicle-only `Reset car` action. Existing v14 Character bindings and
  local overrides migrate from the old overloaded action without losing custom
  keys or buttons.
- Added a possessed-player action router for Players 1–4. A Pawn now owns an
  explicit input context and advertises action capabilities, so an on-foot `R`
  reload cannot fall through to a vehicle reset and holding an action while
  possession changes cannot trigger it on the new Pawn.
- Added Pawn-type command domains inside the on-foot context. Soccer actions
  and Character/Animal traversal, world and firearm actions may reuse a scarce
  gamepad button only when the possessed controller makes them mutually
  exclusive; inherited Vehicle buttons and global raw-key execution no longer
  create a second action behind the mapping layer.
- Added semantic Logic input events for the Pawn-owning Player and for an
  explicit Player 1–4 slot. Shipped Character, FPS, Animal, Soccer and Talkable
  NPC graphs now follow remapping and possession; literal DOM `On Key` input is
  retained only as a compatibility path for non-Pawn level graphs. Legacy Pawn
  key nodes are translated to their current semantic action instead of
  bypassing the mapping system.
- Removed the remaining physical-key shortcuts from runtime vehicle helpers.
  Airplane wheel braking is now the independent remappable `Wheel Brake`
  action (default `K`, gamepad unbound), while Look Back and engine-audio
  throttle consume the Player's resolved mapping.
- Added per-actor combat ownership. Every armed Character may keep its own
  weapon preset, magazine, reserve, reload and equipped state; unpossessed AI
  aims and fires through that Pawn's normal weapon controller and shared damage
  path, with its carried weapon visible independently from Player 1.
- Promoted the Enemy Outpost logic into reusable, explicit Actor Behavior data.
  Character and Animal Logic Elements can select `Observer`, `Aggressive`, `Tactical`,
  `Defensive`, `Flee`, `Civilian` or `Reactive`, plus faction hostility, squad
  or herd memory, perception, guard range, patrol, fear and event reactions.
  An empty Player ID alone never silently enables AI.
- Made possession a strict AI/input ownership boundary. A Pawn authored for a
  Player clears stale AI commands when possessed, and Actor Behavior cannot
  attach combat, move, aim or fire through it even during a temporary
  possession transition.
- Closed the remaining cached-trigger path on possessed Characters: weapon,
  look and world-action channels are refreshed from the owning Player device on
  every Pawn frame, so an AI/Logic command or delayed graph tick cannot leave
  the Player firing after the real trigger is released.
- Added smart AI action areas with circle/box dimensions, height and offset,
  enter behavior (`Observe`, `Investigate`, `Cover`, `Attack`, `Flee`,
  `Ignore`) and exit behavior (`Return`, `Forget`, `Search`, `Hold`). Selecting
  an enabled AI Logic Element now draws its action boundary and sight/FOV cone
  directly in the Editor viewport; these helpers are editor-only.
- Retuned FPS Enemy Outpost to `Observer` by default. Enemies scout and seek
  cover while confirming a target, use shorter/less accurate bursts and only
  act inside their authored area instead of immediately rushing the Player.
- Added a focused collider-aware cover planner with bounded retry/stall
  recovery. Tactical actors approach a protected reachable face before
  attaching, reject Pawn colliders as cover and can recover when a candidate is
  blocked or appears later. Its per-search spatial blocker index and capped
  candidate budget remain bounded on dense levels; face/slot reservations keep
  squad members from selecting the same position and are released immediately
  when an actor leaves Play. Armed AI also cycles its own loadout to a usable
  sidearm instead of reloading an empty primary forever, while Animal natural
  attacks use the same Damage Contract as firearms.
- Hardened actor lifecycle ownership. Stop Preview and Pawn disposal now
  release Behavior records, cover reservations, combat facades and carried
  weapon visuals synchronously. Dog chase commands carry an owner token, so
  possession, death or AI disable cancels only an AI-owned chase and never a
  newer author/player command. Perception now treats circular/cylindrical world
  colliders as line-of-sight blockers as well as boxes.
- Added one synchronous damage contract for hitscan, explosions, Logic nodes,
  Character vitals and ordinary damageable props. Armour is applied once and
  the returned damage, lethal-hit state and instigator/impact metadata describe
  the mutation that actually occurred.
- Added Pawn death physics driven by `vitals.deathPhysics`. Auto mode discovers
  compatible humanoid or quadruped joints in imported GLB rigs and procedural
  placeholders, then runs a deterministic lightweight articulated solver. A
  mesh-only Pawn falls as one physical body; authored death animation and
  `none` modes remain explicit choices, and revive/reset restores the captured
  pose.
- Kept imported skinned rigs connected during physical death by preserving bone
  rest offsets and driving joint rotations plus the pelvis/root translation.
  Bullet impulses now propagate through adjacent joints, while explosions move
  the complete articulated mass with radial blast torque instead of visually
  pulling the Character into separate parts.
- Replaced the ambiguous respawn toggle with an authorable per-Character/Animal
  policy: `Never`, `At death position`, `At original spawn`, or `Random playable
  position`, plus delay and fallback random radius. New Pawns default to never;
  old scenes that explicitly saved `respawnOnDeath: true` retain spawn respawn.
- Equipped reusable AI Characters with editor-authored primary/secondary/melee
  weapons, grenade budgets and backpack medkits. AI heals below its configured
  threshold, does not fire a remembered target through cover, and considers a
  grenade only after the target has stayed hidden at a suitable authored range.
  The four Enemy Outpost actors now ship with clearly different clothing/skin
  palettes so their independent state is visible immediately.
- Runtime Logic Element colliders now follow moving Pawns. The standing collider
  is suspended while a death body is active, then restored and realigned on
  revive/reset, preventing an invisible upright obstacle from remaining behind
  a fallen Character or Animal.
- Documented author configuration, legacy `enemyAi` compatibility and the
  steering/physics boundaries in `docs/ACTOR_CONTROL_AI_AND_DEATH.md`.

## Cinema Studio reusable Sequencer and 3D motion paths

- Promoted sequence duration to an exact timeline control (0.1 seconds through
  24 hours). Changing it safely clamps cuts, keys, markers, events and the
  playhead; frame-accurate video export already consumes this duration instead
  of a fixed six-second render.
- Added standalone `.lkcinema.json` sequence assets. They preserve camera cuts,
  object/lens tracks, events, markers, curves and spatial paths, and can be
  loaded into another Cinema Studio with undo support.
- Added binding metadata and non-destructive remapping: imports resolve exact
  scene IDs first, then a unique matching author name/type. Missing bindings
  remain explicit and can now be reassigned on object, lens and shot tracks.
- Added a `Web player ZIP` action next to raster WebM rendering. It exports the
  current project/level as a deployable interactive Three.js experience; the
  Cinema trigger remains author-controlled and can autoplay with `On
  Preview/Simulate`.
- Split temporal easing from spatial interpolation. Object tracks now offer
  linear motion, an automatic smooth spline, or editable cubic Bezier motion.
  The selected path is drawn in the Editor viewport with per-key 3D dummies and
  aligned/broken tangent handles driven by the normal translate gizmo. Helpers
  are editor-only and never enter saved or playable scene output.
- Added a visible motion-authoring bar with separate context-aware Camera and
  Object preset libraries. Dolly, sweep, crane, arc, rise and dive-then-straight
  presets create ordinary editable Bezier keys from the playhead, accept an
  author-defined duration and travel distance, expand the sequence when needed
  and preserve undo.
  Presets are starting paths rather than baked clips: their blue points,
  magenta tangents and timeline timing remain fully authorable. A direct `Edit
  path` action exposes the same 3D editing workflow for manually keyed tracks.
- Added focused sequencer coverage and the authoring/reference guide in
  `docs/CINEMA_STUDIO_SEQUENCER.md`.

## WebGPU dual-backend runtime

- Associated `THREE.WebGPURenderer` with the complete engine without removing
  `WebGLRenderer`: the same stored preference now builds the menu background,
  Editor viewport, Play preview and gameplay on one selected GPU backend.
- Added a reproducible r185.1 compatibility build that keeps WebGL, WebGPU,
  TSL, RenderPipeline, common-renderer PMREM, addons and the optional WebGL path
  tracer on one Three.js module graph.
- WebGPU initialization is awaited before the first frame. Three.js' internal
  WebGL 2 backend remains the first fallback; a final fresh-canvas recovery
  prevents an adapter/device failure from leaving the editor blank.
- GPU backend and visual pipeline are now separate controls. `WebGPU ·
  experimental` is selectable on compatible secure devices and reloads the
  whole Editor/Play runtime; the visual choice is labelled `Real-time raster`
  rather than incorrectly implying it always uses WebGL.
- Added a TSL RenderPipeline for WebGPU/common-renderer color output and grading.
  The legacy EffectComposer, GTAO, SSR, GLSL DoF and optical passes remain on
  WebGL; unsupported WebGPU effects degrade explicitly instead of running an
  incompatible shader graph.
- Added a node-compatible CPU/Points rain fallback, deferred common-renderer
  PMREM initialization, common-renderer RectAreaLight LTC textures and guarded
  fallbacks for volumetric clouds, snow trails, dynamic material patches and
  WebGL-only path tracing.
- Added an executable migration checklist in
  `docs/WEBGPU_DUAL_BACKEND_MIGRATION.md` covering implementation, fallback and
  the remaining real-device release gate.

### The dark WebGPU viewport: GPU resources were freed inside the frame

- **Corrected diagnosis.** An earlier pass in this project blamed WebGPU's
  non-scissored `loadOp: Clear` for the dark viewport. The console disproves it:
  `[Buffer (unlabeled)] used in submit while destroyed` repeats hundreds of times
  and is followed by `THREE.WebGPURenderer: Async render pipeline creation failed`.
  That is a use-after-free of GPU buffers, and the abandoned pipeline is why almost
  nothing draws. The clear-semantics claim is true on its own but is not the cause,
  and the wrong theory is recorded as wrong so it is not applied again.
- The two backends do not agree on what `dispose()` means. WebGL hands the
  allocation back to the driver, which keeps it alive until the commands
  referencing it have drained. WebGPU's `destroy()` takes effect at once, so a
  command buffer that already recorded the buffer becomes invalid - and the engine
  disposes from inside a frame in many places: deleting an object, rebuilding a
  Logic Element, releasing what a previous scene apply added, rebuilding a
  selection or hover helper on mouse movement.
- `LK_RUNTIME_RENDERING_BACKEND` now owns the timing of a GPU free.
  `deferGpuRelease()` runs the release immediately on WebGL - the proven path,
  where delaying would only postpone the reclaim - and on WebGPU queues it until
  the device queue reports the submitted work has finished. Callers detach the
  object before disposing it, so nothing waiting in the queue can be drawn again.
  Several disposals in one frame share a single wait, a release that throws does
  not strand the ones behind it, and `flushGpuReleases()` drains by hand for
  teardown.
- Routed through it: `disposeObject3D` in the scene store (the scene-apply and
  deletion paths, which is where the hundreds of buffers came from), the Editor's
  visual helpers, and the hover and material-pick helpers. The object graph is
  still read synchronously, while it is intact - only the frees wait - because the
  caller has already detached and may have cleared the object by the time the
  queue drains.
- Covered by `tests/webgpu-deferred-disposal.test.js`, which proves the WebGL path
  is unchanged, that nothing is freed inside the frame on WebGPU and everything is
  freed after it, and that the traverse happens before the release is queued.
  **Not yet confirmed on screen**: the editor cannot currently boot under
  Playwright, so this is verified by unit coverage and the console's own evidence,
  not by an observed frame.

## Sketchbook Open World integration

- Added `Open World - Sketchbook` as the default starting template for new projects and levels; `Empty` remains an explicit, fully authorable choice.
- Added a separate editable `sketchbookPawn` family for the advanced on-foot controller, arcade car, airplane and helicopter, including player possession, driver/passenger seats, linked-door animation and character vehicle enter/exit flow.
- Imported the upstream Open World and vehicle/character placeholder GLBs with their original MIT notice and source attribution.
- Preserved the existing native `player_car` and `Template - Player Car Logic Element` paths unchanged as the race/drift physics baseline.
- Added portable-export discovery for the new assets and license, plus focused integration coverage for default-template routing, assets, attribution and the player-car separation invariant.

## Runtime stability and Sketchbook authoring

- Removed the duplicate Play controller/animation-hook paths that could make a
  character visual diverge from its body, flicker, teleport or fight the camera.
- Corrected parented local/world spawn conversion, post-physics grounding and
  fallback-to-GLB physics-origin hydration for the character and all three
  Sketchbook vehicle families.
- Added an editable walk-to-door and full-body enter/exit transition, atomic
  camera/possession transfer, safe exit publication and linked-door motion.
- Added a dedicated Sketchbook model picker and exposed model fit, entry/exit,
  camera, seat/door and additional vehicle tuning without modifying the native
  `player_car` templates.
- Prevented Player 1's Logic Pawn camera from being advanced twice during a
  split-screen render pass.

## Animal Pawns

- Added Cat, Dog, Horse and Generic Animal Pawn Logic Elements with a procedural
  animated quadruped fallback and an authoritative user GLB/FBX + Motion Set path.
- Added physical cat stealth, pounce, climb/mantle, ledge balance and fall
  recovery; dog bark/alert, dig and chase; and rideable horse gaits, jump and
  mount/dismount control transfer.
- Added Animal Logic nodes, events, exposed variables, Pawn Studio authoring,
  persistence and playable-export wiring.

## Editable game-mode starters

- Added Snowboarding Objective Run with carve/downhill physics, jumps, landing
  trick scoring, gates, timer, clouds and fog.
- Added Cat Neighborhood Adventure with mouse chases, dog patrol, traffic
  hazards, friendly/family rewards and replaceable Cat visuals.
- Added Jungle Car Escape with an editable island route, hazards, timed
  extraction and the existing native race/drift car physics.
- Added FPS Enemy Outpost with editable Character Pawn enemies, patrol,
  perception memory, range management, flanking and mission-driven elimination.
- Added a shared Mission Director, objective HUD/Logic nodes and a
  self-registering Level Template registry used by all of these modes.

## Soccer: 11 vs 11 and rebuilt penalties

- Added `Soccer Match 11v11` as a self-registering level template that materialises
  22 individually editable Soccer Pawns, a formation table (4-4-2, 4-3-3, 4-2-3-1,
  3-5-2, 5-3-2) and per-role attributes.
- Added a two-tier team AI: a squad layer owning phase, defensive line, offside
  line and duties, above a player layer that evaluates a fixed six-candidate
  support fan. The per-frame budget is divided round-robin across the 22 players
  so no frame pays for the whole squad.
- Added `PHASE_SHAPE`, which deforms one formation into four shapes across
  possession, attacking transition, defensive transition and out of possession.
- Rebuilt the penalty flow on schema v2: aiming is four independent decisions
  (corner, height, power, curve), the run-up is a timing window with a sweet
  spot, feints are limited and cost accuracy, and pressure rises as a shootout
  becomes decisive. The goalkeeper either reads the real corner or pre-commits to
  a side, and a bought feint makes it commit early.
- Added full shootout series handling with sudden death and per-phase
  presentation cameras, advanced by the frame clock rather than `setTimeout`.

## Snowboarding: mountain, snow deformation and tricks

- Replaced the fourteen flat inclined boxes with an analytic mountain heightfield.
- Added a persistent deformation trail: the board cuts a trench, throws a berm
  and leaves a spray impulse, held in a four-channel atlas (trench, berm,
  freshness, spray) with five quality tiers from Off to Ultra and a vertex-free
  low tier.
- Made the trail permanent by default (`refillSeconds: 0`); a non-zero refill
  time makes the track fill back in.

## Cat: feline rig and vertical neighbourhood

- Rebuilt the procedural quadruped away from the single stretched sphere that
  produced the previous body, into a segmented spine with distinct chest and
  pelvis, digitigrade legs, a feline head and a multi-segment tail. Dog, horse
  and generic profiles ride the same rebuild.
- Rebuilt the neighbourhood around vertical traversal, with a reachability
  invariant asserting that every roof, ledge and deck a cat is meant to reach is
  actually within its jump and climb envelope.

## Open world: procedural districts and streaming

- Kept `models/sketchbook/world.glb` untouched as the central district and
  generated themed districts around it from a seed, each one editable and
  switchable from the editor.
- Added chunk streaming with three levels of detail and instanced vegetation.
  Measured on a real THREE run: 48 draw calls, 46 live cells, 2925 instances and
  no resource growth after 600 frames.

## Third-person combat parity

- Gave the third-person Character the FPS action set — weapon handling, aiming,
  firing, reloading and damage — by reusing the existing first-person systems
  rather than duplicating them, with a parity test asserting the two Pawns expose
  the same verbs.
- Added an over-the-shoulder camera with shoulder swap and a runtime first/third
  person toggle on the same Pawn, plus a cover system that attaches to a face,
  hugs it at an authored distance and slides along it.

## P2P multiplayer

- Added a wire protocol, a host-authoritative replication layer and a multiplayer
  director above the existing WebRTC DataChannel transport, with lobby, player-id
  assignment, remote Pawn spawning, interpolated transform replication and
  join/leave handling.
- Added a multiplayer mode level template so an author can make a scene
  multiplayer from the editor, with its associated scene assets.
- Unknown message types are rejected explicitly rather than ignored, and remote
  payloads are validated for type, range and size before use.

## Illustrated Sketch rendering

- Added a project-owned **Detailed Illustrated Sketch** pipeline for the Editor
  viewport, Play Preview and game, with adjustable ink strength, line/hatch
  detail and paper grain. WebGL uses a bounded post pass and the WebGPU/common
  renderer uses the equivalent TSL graph.
- Added an independent global black-and-white filter, usable with either the
  Natural renderer or the illustrated preset.
- Added a selectable `Paper Pencil` medium alongside `Illustrated Ink`. It uses
  a brighter warm-paper base, irregular graphite strength, layered hatching and
  stable paper fibres while preserving scene colour; combining it with the
  independent monochrome filter produces the white-paper pencil treatment.
- Added `Painted Storybook`, the new full-colour default when illustrated output
  is enabled. It filters material colour into pigment/palette bands, shapes
  shadows, draws warm emissive highlights and applies a granular wash to every
  composited atmospheric/transparent pixel, including smoke, clouds, rain,
  flame and flares. Dedicated Pigment and Atmosphere controls let the author
  tune those two responses independently.
- Added independent Author Output Override locks for the whole sketch appearance
  and black-and-white value. Authors may force either choice or both, while all
  unlocked video preferences remain player-controlled.
- Added non-destructive per-material `Color Sketch` and `Monochrome Ink` layers.
  They preserve the exact original material instance, support individual GLB
  material slots, cache generated grayscale texture detail and restore the
  original material when disabled.
- Upgraded per-material `Color Sketch` from a toon wrapper to a cached derived
  pigment texture with material-specific strength. Alpha, emission, normal maps,
  texture transforms and the protected source instance survive the conversion.
- Added the same player-facing controls to Editor and gameplay Video settings,
  persisted them in rendering schema v7 and documented the backend/mobile
  contract in `docs/ILLUSTRATED_SKETCH_RENDERING.md`.

## Default character bodies

- Added the two bundled mannequins a Character Pawn starts as, and **the choice
  between them**, which did not exist: `Template - Player Character (Male)` and
  `(Female)` are one body-parameterised factory, so the two can never drift apart
  and a third body is one entry in `BODY_TYPES`. The male keeps the original
  template id, so saved projects and the packs that read this one by position
  still resolve. Each body carries its own model, appearance and Logic Scene
  element; the procedural placeholder stays behind it as the fallback while the
  model loads or if an author clears the Model field.
- **Each body has its own `fit`, and that is not an accident.** `fit` normalises a
  model's LONGEST axis, and a T-pose mannequin's longest axis is its ARM SPAN.
  Measured on the bundled files, the male spans 194.685 with a height of 180.473
  while the female is 180.923 both ways - so a single `fit: 1.8` produced a 1.67 m
  male standing beside a 1.80 m female. Each fit is derived as
  `1.8 * longest / height`, and a test asserts both bodies land on 1.8 m.
- **Exposed the eight action slots the runtime was already playing but nobody could
  bind.** `character-abilities.js` calls `playAction()` by name for `roll`,
  `slide`, `vault`, `mantle`, `climb`, `hang`, `landHeavy` and `landCrouch`, while
  the author-facing list held only nine locomotion slots - so those actions could
  never be given a clip and silently fell back to the procedural pose. The list is
  now the seventeen the runtime can actually play, and a test walks the
  `playAction()` names to keep the two in step.
- Bound every bundled clip available at that stage: each body's own idle, walk, run, strafe and
  jump, plus the shared falling idle, **falling-to-roll** and hard landing. The
  roll finally has a real clip, which is what the dodge double-tap, the landing at
  speed and the fall recovery have been asking for. The later Advanced Animations
  import fills traversal/melee; crouched landing and interact remain honest fallbacks.
- Clips bind **by asset, not by name**: every bundled motion file exports a single
  take called `mixamo.com`, so binding by name would have given all seventeen slots
  the same clip. `findClip()` already resolves an explicitly assigned animation
  asset to its sole clip, which is the path used here. Actions live once in
  `shared/` because both mannequins are Mixamo rigs with identical `mixamorig:`
  bone names; locomotion is per body, because that is what carries the weight.
- **Fixed a silent export hole found on the way.** The playable-export asset walker
  collected `glb|gltf|wav|mp3|png|jpg|jpeg|webp|hdr` - not `fbx`. Every bundled
  body and motion clip is FBX, and the gameplay shell ships the FBX plugin, so an
  exported project would have started with no character at all and raised no
  warning, because a reference nobody collects produces no missing-file report.
  FBX is now collected, `models/characters/` is treated as required content like
  `models/sketchbook/`, and the provenance note ships with it.
- The editor's bundled-asset list no longer hard-wires one pack and one format. It
  filtered on `asset.kind === 'glb'`, which would have hidden both FBX bodies; it
  now reads a list of bundled packs with each asset's own format and licence label,
  and the group header no longer names a single pack.
- Recorded origin, the shared-actions rationale, the `mixamo.com` naming and what
  was deliberately not copied in `models/characters/PROVENANCE.md`. The bodies are
  Mixamo content bundled as engine default content; any rigged GLB or FBX replaces
  them from the Pawn's Model field with nothing else to change.

## First person: presentation foundation and head culling

- `firstPerson.presentation` replaces the pair of settings that could contradict
  each other. `'body'` shows the character's own mesh from its eyes and builds
  nothing else; `'arms'` builds the dedicated first-person arms and weapon and culls
  the body. Previously `hideOwnBody` decided the body while the view model decided
  itself, so two of the four combinations were broken: body culled with no arms
  showed NOTHING, and body kept with arms showed the weapon TWICE - and only the
  author could tell which they had. This first pass allowed templates to declare
  either presentation; the final unified-body migration described above makes `body`
  the engine default everywhere and leaves `arms` as an explicit author choice.
- A project saved before this keeps the look it asked for: `hideOwnBody: true` was
  only ever set by someone who wanted the arms view, so the presentation is derived
  from it. `hideOwnBody` survives as a DERIVED mirror, never a second source of
  truth, because `actor-combat.js` reads it and a value that could disagree with the
  presentation is exactly the contradiction being removed.
- **The `body` presentation culls the head, and that is the whole point of it.**
  Keeping the full mesh cost a severe frame-rate drop: the eye sits INSIDE the head,
  so a skinned mesh filled the screen at point-blank range - full-screen overdraw of
  the scene's most expensive material every frame, plus near-plane clipping through
  the face. The player cannot see their own head, so culling it is free visually and
  is what makes this the cheap presentation it is meant to be.
- **`body` is now the shipped default for every Pawn, the shooter included, and a
  saved level is migrated to it.** `arms` was still the FPS template's default, so the
  second skinned rig and the duplicate weapon kept appearing on screen after the
  presentation was made an explicit choice - reported again as "it is still the arm and
  weapon in a separate view, an immense drop". `migrateFirstPersonPresentation()` moves
  a saved template Pawn across, because the template default only ever reaches NEW
  Pawns. An `arms` chosen BEFORE this cannot be told apart from the old default - both
  leave the same value in the same variable - so it is migrated too and has to be
  picked again; the version stamp makes that a one-time event, so `arms` chosen after
  this survives, which is what keeps a first-person-only level possible. The option's
  cost is now in its label rather than buried in a description.
- **The temporary split between two first-person defaults was removed.** Both
  `fps-shooter-test` and `fps-enemy-outpost` now keep their complete Character when
  the camera moves to eye height. The head-cull pattern is asserted never to name a
  leg, thigh, calf, shin, knee, foot, toe or hip.
- The final `unifiedBodyCameraVersion` stamp replaces the temporary presentation
  stamp. It migrates old engine-owned FPS Pawns once, then preserves any later explicit
  author selection of `first-person-arms`.
### Nine of the combat set's twenty-one entries resolved to nothing

- Every diagonal and the straight run backward carried a clip NAME and `asset: null`,
  from the day the set was written. A character moving diagonally or backing away had
  no pose at all. The takes existed the whole time, in the shoot pack sources: sixty
  animations that nothing referenced. Bound now, and **all 21 entries resolve** -
  `walkForwardLeft/Right`, `walkBackLeft/Right`, `runForwardLeft/Right`,
  `runBackLeft/Right`, and `runBackward` as its own take rather than the forward run
  reversed.
- Each one was **measured before being bound**, with the new
  `scripts/measure-clip-direction.mjs`: `walk-forward-left` displaces the hips
  `dx +136.8, dz +136.8`, and the entry declares `[+.707, +.707]`. A clip's name is a
  claim; its root motion is the measurement. This also independently confirmed the
  left/right table correction above.
- Ten more clips gained author-facing slots, so they are both bound and rebindable:
  aim (`Idle Aiming`), two-handed aim (`Rifle Aiming Idle`), fire (`Firing Rifle`),
  aiming run (`Rifle Run`), crouch idle and crouch aim, and four cover takes.
  **Cover was point 9**: `character-combat-cover.js` moved the body and played no clip
  at all, so taking cover read as sliding into place.

### The original four packs did not contain traversal or melee takes

- At this investigation stage the character had fourteen slots with no clip: `slide`,
  `vault`, `mantle`, `climb`, `hang`, `climbUp`, `climbDown`, `ledgeShimmyLeft/Right`,
  `landCrouch`, `interact`, `punch`, `knifeAttack`, `hitReact`. The original packs were searched exhaustively -
  all 168 FBX in the repo, the home directory to depth 7, four drives, and both project
  snapshots. **`Action Adventure Pack.zip` is not a traversal pack**: its 23 files are
  the same takes as `Mannequin-Male/`, renamed. The four packs present hold about a
  hundred takes of locomotion, cover, crouch, aiming, jumps, turns and deaths, and not
  one traversal or melee take. The subsequently supplied Advanced Animations folder
  now fills twelve of these fourteen slots; only `landCrouch` and `interact` remain.
- Near misses were measured and rejected rather than fudged: `jump down` as a crouched
  landing dips the hips to 78 cm where a crouch idle sits at 46 - a knee bend, not a
  crouch; `jumping up` as a climb-up is 0.23 s in place; the cover sneaks as a ledge
  shimmy are standing, not hanging. A slot with no take is left empty and documented,
  because pointing it at an approximation is worse than an author seeing it is unbound.
- Consequence worth stating: with no clip for either, the **procedural** pose is the only
  thing that will make an unarmed punch and a knife read correctly, which makes that
  layer more important than it first appeared.
- Two death takes were imported and named by MEASUREMENT: four of the six source takes
  fall forward onto the face, so the pack's own "from the front"/"from the back" pair
  cannot be a pair. The frontal death was identified by sampling head-versus-hips world
  position on the last frame - it is the only take that ends supine.

### `falling-to-landing.fbx` is rigged for a different skeleton

- It carries `mixamorig5:` track names, not `mixamorig:`, because it came from the Soccer
  pack. Nothing in the engine retargets track names, so its tracks bind to no bone on
  either mannequin: the `landMoving` slot - the moving landing - is very likely silent
  today, and has been since it was bound. Recorded rather than fixed.

### Three unreadable FBX files emptied every animation on the character

- Registering `jumping-up.fbx`, `stand-to-cover-low.fbx` and `cover-to-stand-a.fbx`
  put files THREE.FBXLoader cannot parse ("Unknown property type") into the animation
  library's load list. The library never completed, `bind()` never succeeded, and the
  character lost **every** animation - not one clip, all of them - on a brand-new
  level. They had sat on disk unreferenced and harmless for exactly that reason.
- A bad file does not cost you one animation, it costs you the set. That asymmetry is
  now guarded: `tests/default-character-bodies.test.js` requires every clip the
  catalogue registers to be a readable binary FBX, and forbids those three by name.
  A second assertion forbids any author-facing slot from pointing at one.
- The guard first shipped iterating `BODIES.BODY_TYPES`, which this module does not
  export. Behind a `||` fallback of invented ids it passed silently, because `motions()`
  routes an unknown id through `resolveOrDefault`, which forgives it and returns the
  DEFAULT body - so it checked one body twice and never looked at the other. It now
  iterates the real ids and asserts there are at least two.

### Tests that assert on source text cannot see a crash

- A missing `scratch.local` in `character-weapon-pose.js` threw on every frame that
  applied a weapon pose. Because the pose runs inside the frame's update chain,
  everything after it was abandoned: camera, HUD and animations. Input still arrived
  and the weapon still fired, so it looked alive while being mostly dead - and from
  outside it read as "the character has no animations".
- Nothing in the repository could see it. The pose was covered by assertions that
  searched the SOURCE TEXT for its four weapon cases, and source text cannot tell you
  whether a line can execute. `tests/character-weapon-pose.test.js` now drives the real
  function over a real Mixamo bone chain: the pose completes, the arm actually rotates
  (a silent no-op fails), forty calls converge without drift or NaN, a single-handed
  pose leaves the support arm alone, an armless rig is declined, and every `scratch.X`
  the maths reaches for is asserted to be allocated.
- Related: three separate assertions in this repo matched a code COMMENT rather than
  code during this work - a `compileAsync` prose mention, an `animationSet` mention,
  and a cache tag pinned inside an ordering assertion. Match the call, not the words.
- The four weapon poses the body presentation drives were already in `weaponPose()` and
  are what first person now shows: one arm extended for a pistol (the support arm is
  dropped for that preset), both arms for a two-handed gun, the throwing posture for a
  grenade, and a punch with nothing equipped - with the muzzle flash gated off for
  `unarmed`, `melee` and `thrown`, so an empty hand never fires or flashes.
- The Sketchbook character no longer offers `Interior`, which is a VEHICLE camera -
  the driver's seat. Its equivalent is first person, the eye, and the options are
  built per Pawn kind so neither lists the other's. It is implemented rather than
  only renamed: it maps onto the interior geometry that already works, with a body's
  offsets instead of a driver's - no forward or lateral shift, eye height, and a
  tight lag so the view does not swim when the body turns.

## Locomotion: the strafes ran, and ran mirrored

- The strafe slots were bound to `strafe-left/right.fbx`, which are the RUNNING
  strafes, so stepping sideways played a run. The sources ship the walking pair as
  well; it had been copied and left unused. Walk-speed strafes now use it, and two
  run-speed lateral entries were added - holding Sprint sideways previously fell back
  to the walk strafe.
- **Every lateral and diagonal entry was mirrored, and the shared direction table was
  the reason.** `DIRECTIONS` in `character-animation-set.js` said `right: [1, 0]` and
  `left: [-1, 0]`. In the character's own frame - forward `+Z` - `+X` is the body's
  LEFT, so the table had the two sides the wrong way round and mirrored every entry
  that named its side as a string: the legacy presets, and through them the soccer and
  animal sets. Forward and backward were unaffected, which is exactly why only the
  strafes looked wrong.
- This is now **measured at both ends of the chain** rather than derived from the frame
  convention, which is how the first attempt at this fix went wrong:
  - the bundled Mixamo clips carry root motion, and `left strafe` displaces the hips by
    `dx = +179 cm` while `right strafe` displaces them by `-179`. Added
    `scripts/measure-clip-direction.mjs`, which reports the real travel direction of
    any clip - a clip's name is a claim, not a measurement;
  - pressing A/Left produces `steer = +1` (`input-actions.js`), `move.x` is that steer,
    and the movement controller's world-then-local pair cancels to the identity, so the
    selector's `x` IS the lateral input. Positive `x` means left, at every link.
- **A level saved before this is repaired on load.** Fixing the shipped template
  reaches new characters only, because the pawn stores its own copy of
  `animationSet` - an already-placed character would have strafed the wrong way for
  ever. `migrateLocomotionSides()` repairs each saved entry by self-consistency: the
  id names the side, so the vector is made to agree with the id. Z is never touched,
  so forward and backward survive and a diagonal is repaired on its lateral half
  only. It is versioned (`locomotionSideVersion`) and runs once, so an author who
  deliberately mirrors a side afterwards keeps it. The same rule also repairs a
  hand-made set that named its sides while the old table was still in place, which a
  blanket negation could not do.
- A backstep reuses the forward walk at `playbackRate: -1` instead of shipping a
  second cycle. That needed a fix underneath: the entry normaliser clamped the rate to
  a `0.1` floor, silently turning `-1` into a forward walk crawling at a tenth speed.
  The magnitude still clamps to 0.1 .. 4; only the sign now passes. Diagonals keep a
  forward rate, because a reversed diagonal reads as a stumble.
- The ordinary landing is `run-to-stop`: arriving on your feet while walking or
  running. The hard landing stays reserved for a fall that hurts and the roll keeps
  handling a drop taken well - three different events, three clips.
- Completed that separation in the shared traversal runtime, including the FPS/TPS
  preset which still rebuilt its landing entry as the old generic `Landing`. A stock
  1.05 m running jump returns at roughly 6.8 m/s and now always selects the bundled
  `Run To Stop`; it can no longer cross the old 5.5 m/s branch and immediately
  override itself with `Hard Landing`. A moving dangerous fall can still roll. A
  non-rolled impact above the authorable **Fall Damage Threshold** applies fall damage;
  a survivor plays `Hard Landing`, while a lethal impact plays no landing action and
  hands the body directly to death physics/ragdoll.
- Corrected the moving case after checking the author's actual Soccer assignment:
  the intended clip is **`Falling To Landing.fbx`** from
  `SoccerAnimations/Portiere/Soccer Game Pack`, not `Run To Stop`. Its byte-identical
  versioned copy is `models/characters/shared/falling-to-landing.fbx`. Landing
  selection now reads horizontal velocity: standing/slow can use `Run To Stop`, while
  a Character arriving with running momentum uses `Falling To Landing` and returns
  directly to the Run cycle without visually stopping while input continues.
- Fixed the remaining `Falling To Landing` bind-pose flash. That clip is present
  both as the moving-land Motion Set entry and as the landing one-shot, so Three.js
  correctly reuses one `AnimationAction`; the grounded selector was then fading
  that shared action to zero while Run/Walk were suppressed. The active landing
  action now retains full weight until its finished event and blends back to the
  requested locomotion. `Falling To Roll` remains an independent action.
- Fixed the actual rig mismatch inside the selected Soccer take. Unlike the
  working `Falling To Roll` and mannequin files, `Falling To Landing.fbx` names
  its skeleton `mixamorig5:*`; Three.js sanitizes that namespace to names such as
  `mixamorig5Hips`. Rig canonicalization now removes exporter-added numeric
  namespace suffixes, mapping both `mixamorig5Hips` and `mixamorigHips` to the
  same target bone instead of successfully playing an action with zero bound
  tracks and showing the T-pose. Runtime retargeting, Motion Set corrections,
  generated fallback clips and Pawn Studio use the same rule.
- Bundled motion-only FBX files now have a de-duplicated public catalogue and appear
  under **Engine Assets** with an Animation badge. They remain draggable into
  animation tooling but do not offer the misleading Place action of a body model.
  This preserves the rule that a chosen `models_sources` clip must become a visible,
  GitHub/export-safe engine asset rather than a local-only dependency.
- Character control is now scalar end to end. Stick magnitude already affected
  physical speed, but Walk/Run playback was clamped to a minimum 45–60%, so a barely
  tilted stick produced small translation under visibly fast feet. Motion Set and
  legacy locomotion now use the real speed ratio from 2% to 100% of the authored
  clip: light input walks/runs slowly, full input reaches the natural clip rate, and
  neither path accelerates the animation beyond 1×.
- Fixed the smooth but periodic “two small steps” inside walking/running loops.
  Blended locomotion clips previously advanced in raw seconds, so Walk and Run takes
  with different durations slowly moved their planted feet out of phase, opposed
  each other, then aligned again. Motion Set and legacy blend spaces now lock all
  active gait loops to the dominant clip's normalized footfall phase; weights,
  analogue playback speed and non-looping Jump/Land/Action clips remain independent.
- Sprint and Crouch preserve analogue button/trigger pressure in addition to their
  existing boolean action. Partial Sprint continuously interpolates gait speed
  between Walk and full Sprint; a non-toggle Crouch uses pressure as the target body,
  capsule and eye height. Keyboard remains exactly 0/1. The same normalized
  `inputMagnitude`, `sprintAmount` and `crouch` values now reach locomotion, ready for
  the authored crouch animations when their default Motion Set is wired in the next
  animation step.
- Fixed the third-person Character appearing to walk/run slightly toward the
  shoulder crosshair during perfectly straight input. The directional candidate
  band admitted `Run Forward Left` and `Run Forward Right` into a forward request
  (their dot product is 0.707, inside the old broad tolerance). Since two authored
  diagonal clips are not mathematically perfect mirrors, the residual blend biased
  the visible body. Cardinal input now selects only its cardinal family; true
  diagonal input keeps the wider neighbour blend for smooth eight-way locomotion.

## Camera aspect ratio: one authority, per camera, with a master

Reported as "when I go through any camera the aspect ratio does not change any more,
I always see the same 16:9 preview".

- **The PIP took its shape from the PLAYER camera for whichever camera you had
  selected.** One line: `const aspect = GAME.player.cameraAspectValue() ...`. So a
  scene camera could never preview in its own shape, and every selection looked
  identical. It resolves from the selection now, and a test forbids that exact
  assignment from returning.
- **A scene camera had no aspect field at all** - only fov, near, far, helper size,
  preview and player output - so there was nothing for a preview to honour even in
  principle. Scene cameras carry `aspect` now, defaulting to `auto` so existing
  levels are unchanged, with a select in the Scene Camera inspector.
- **The same mapping existed three times** and was free to diverge: a ternary chain
  in `editor-runtime.js`, another in `floating-layout.js` (the resize handle, which
  would have fought the renderer every drag), and the table in `player-camera.js`.
  All three now defer to `js/runtime/aspect-policy.js`.
- Added the **master aspect** beside the Preview toggle: force every camera preview
  in the editor to one shape while framing, `Aspect: per camera` to release it. It
  is editor-only by construction - tests assert the string appears in neither the
  game camera nor the scene store, so it can never be serialised into a level or
  leak into Play.
- The precedence is deliberately different on each side, because the questions are
  different:

  | | order |
  |---|---|
  | Editor | master → this camera's own → level default → viewport |
  | Game | mobile → level default → viewport |

  In play there is no author framing a shot, so the level's default answers and a
  per-camera choice does not get to fight it. A phone is forced to **9:16**
  regardless of what the level says, detected by the same rule the settings menu
  already uses (coarse pointer, or a viewport under 760 px) so the two cannot
  disagree about what a phone is.
- `auto` at every level means "no opinion, ask the next one down", which is why it
  maps to `null` rather than to a number - and why a view with no opinion anywhere
  fills its box instead of being cropped.

### The clips loaded and then animated wrongly: two defects in the assets

Reported as "2 or 3 are visible but completely broken". Both defects are in the
ORIGINAL source files, so a user importing from the same pipeline hits them too.
Both are repaired at LOAD time rather than baked into the files, which keeps the
originals untouched and fixes user imports for free.

- **The bodies carry a DOUBLED bone chain.** Every bone is nested inside a
  same-named copy - 52 of them on the male, 64 on the female - and the two skinned
  meshes are bound to DIFFERENT copies. An AnimationMixer resolves a track name to
  the first match, the outer bone, so one mesh animates and the other stays in its
  T-pose. Which mesh loses is not even consistent: on the male the frozen one is
  `Alpha_Surface`, **the visible skin**; on the female it is the joints instead.
  `collapseDuplicateBones()` repoints every skeleton at the outer chain and deletes
  the inner copies. It is safe because the inner copy is an exact pass-through -
  identity local transform, same world matrix - so the bind pose does not move, and
  the existing `boneInverses` stay valid. A test asserts three sample bones land on
  the same world position before and after.
- A nested bone that carries a REAL transform is left alone and reported as
  skipped: a control or twist joint is not this defect, and collapsing it would
  silently deform someone else's rig.
- **The clips are not in-place.** `walking.fbx` travels 1.74 m per 1.03 s cycle in
  its hips track while the controller is also moving the character, so the two
  translations add and the character slides forward and snaps back on every loop.
  Every animation slot is documented as "in-place, no root motion", so the clone
  the animation library hands out is flattened horizontally; the vertical is kept,
  being weight shift and a jump's real lift. An idle moves 1.2 cm and is left as it
  is; the walk's 170 cm is the bug.
- Positions in these files are in CENTIMETRES - the hips sit at y≈103 - and that is
  correct as loaded: `fit` scales an ancestor of the rig, so the track resolves to
  1.03 m on screen. No unit conversion was needed, and adding one would have been a
  second bug.
- `tests/skinned-rig-repair.test.js` drives the real files through the real
  FBXLoader, because neither defect is visible to a test that only reads
  descriptors. It includes a negative control that asserts one mesh IS frozen
  without the repair, so the test cannot silently stop testing anything.

### The bodies could not load at all, and the Body select did nothing

Both were found by asking a plain question - *which level would I actually see
these in?* - and checking instead of assuming. Neither was a caching problem.

- **Nothing loaded.** A bundled body and clip were referenced by `src` alone, but
  both loaders - `scene-store.js` for a body, `character-pawn-base.js` for a motion
  library - only engage the FBX path when an asset declares `sourceFormat: 'fbx'`
  **and** carries a `sourceDbKey` or a `sourceSrc`. Everything else fails that
  guard and the plugin reports `FBX source blob is missing`. Every descriptor now
  goes through one `fbxAsset()` helper that sets both fields, and
  `tests/bundled-character-loading.test.js` drives the real loaders with the real
  descriptors so a reference that cannot load is a failing test rather than an
  empty level.
- A declared-FBX asset with no canonical GLB no longer tries `GLTFLoader` first:
  nine bundled clips meant nine guaranteed-failing fetches and nine misleading
  console errors. The short-circuit is gated on the ABSENCE of a canonical GLB,
  because an *imported* asset keeps its converted GLB in `dbKey` and its original
  FBX in `sourceDbKey`, and there the GLB-first order is deliberate.
- **The Body select was decorative.** `bodyType` was written by the Inspector and
  read by nobody - a grep across `js/` matched only the template pack that produced
  it. Choosing Female gave the male mannequin with the male clips, because the swap
  only ever happened when a template was first instantiated. The catalogue moved to
  `js/runtime/character-bodies.js` so the RUNTIME resolves a body from the same
  table the templates are built from, and `normalizeCommonConfig()` applies it.
- The swap deliberately refuses to overwrite authored work: an imported model, a
  clip bound to a slot, a clip named by hand and a colour the author picked all
  survive a body change, or flipping the select twice would quietly destroy them.
  Only bundled references and empty slots are replaced, and the operation is
  idempotent so it can run on every normalize.
- An unknown body id now **throws** instead of silently becoming male - that
  silence is how `bodyType` stayed broken while looking correct. Saved project data
  takes a forgiving path, because refusing to load an existing level is worse.
- `applyGraphBody()` moves all four places a graph carries its body - the Pawn, the
  model element, the `BodyType` select and the Animations category - so the
  Inspector can no longer show one mannequin while the viewport shows another. The
  appearance swatches were hard-coded to the MALE hex values in both templates, so
  the female Pawn carried her palette while the Inspector showed his; they are
  derived from the body now.
- **The Talkable NPC exposed nothing but its two messages.** Its graph replaced the
  character variable list instead of extending it, so an author who placed one
  could not choose its body, clips, movement or appearance. The dialogue fields are
  appended now.
- Where the bodies are: **six of the twelve shipped levels place a character** -
  Sketch Street, P2P Arena, FPS Shooter Test, FPS Enemy Outpost (the player and all
  twelve guards), and the Snowboard run. Sketch Street's civil NPC is now the
  FEMALE mannequin, so both defaults are visible without authoring anything; every
  other placement is male. A level ALREADY SAVED in the browser keeps its own
  graph - a template is applied when a level is created from it, not on load.

## Combat, traversal and the Blackpine outpost

- The first-person player spawned holding a **grenade**. `attachInventory` seeded
  the starting kit with `autoEquip` on, which means "a weapon you pick up goes
  into your hands" - right during play, wrong while the kit is being filled - so
  the Pawn ended up on whichever entry was authored last. That is why the
  character stood in a throw pose that read as firing on its own and why the
  rifle appeared to be missing. The kit is now seeded without equipping and the
  Pawn is then put on its primary weapon; `add()` takes a per-call `equip`
  override so the two cases stay distinguishable.
- A killed Character **came apart, with limbs left hanging in the air**. The
  articulated death solver only moves the nodes it mapped to a role. On a skinned
  GLB that is enough, because everything else is a child of a bone and follows it;
  on a rig built out of separate meshes - which is what the procedural placeholder
  is, and what an imported model whose props sit beside its joints looks like - the
  parts it did not map are SIBLINGS of the ones it did, so they never moved.
  Measured on the outpost enemy: the head dropped to y = 0.075 while the hair
  stayed at y = 1.79, suspended where the head had been. Those leftovers now ride
  the nearest driven part for the duration of the fall, and their own rest
  transform is recorded first so a revive returns them to the body rather than to
  where the body fell. After the fix the same corpse measures 0.62 x 0.35 x 1.46 m
  - laid out on the floor, falling in the direction of the shot, with every joint
  gap preserved and nothing above knee height.

- The player's weapon **flashed whenever anyone else fired**. The first-person
  view model drove its muzzle flash straight off `OnWeaponFired` with no check on
  which Pawn fired, so every shot in the level kicked the player's own barrel -
  with a garrison of twelve AI trading fire, the weapon appeared to be shooting by
  itself, in time with everybody else's shots. The event is now filtered by the
  Pawn that owns the eye. Two related defects came out with it: the listener
  outlived the view model, so a reloaded level left the previous one still
  reacting; and `dispose()` was doing double duty - `ensure()` calls it on every
  weapon change - so the model teardown and the view-model teardown are now
  separate and only the latter unhooks the listener.
- A revive or respawn now leaves the Character **standing on the ground**. Reset
  restored only the yaw, so the tilt death physics puts on the root survived into
  the next life and the Character walked at an angle; and the authored `spawn.y`
  is not necessarily the floor under it, which is how a respawn ended up below
  the ground. Both are corrected for every path that brings a Pawn back - the
  respawn timer, a Logic reset, Stop/Play, a heal - and the abilities/locomotion
  state is cleared with them.
- The **roll** turned about the WORLD x axis. It was applied as `rotation.x` on
  the Pawn root, and Euler order XYZ applies that component in the parent frame,
  so a forward roll went sideways for anyone not facing north - and it fought the
  root's yaw, which is the heading the FPS rig rewrites every frame. The tumble
  now happens on the character's visual root about a pivot at its own waist, so
  it goes over the head whatever the heading is and the heading contract is left
  alone.
- The **slide** had no pose at all: it was pure translation, so the character
  skated along upright. It now lays back and drops over its own hips, eases in
  and recovers as the speed runs out, for both the procedural placeholder and an
  imported rig, and gives the pose back when it ends or is reset.
- Enemies **charged in a straight line**. Closing was triggered by being beyond
  the preferred range, so an actor ran at a target it could already shoot. Closing
  is now for getting a target into WEAPON REACH, the advance is bounded - a short
  push, then a stop to shoot from - sprinting only happens across ground the
  target cannot see, and an actor keeps moving laterally while trading fire.
- **Grenades now explode.** The damage, the impulses and the `OnExplosion` event
  were all already resolved; there was no visual, so a grenade killed silently.
  A blast is a fireball that expands and cools through a colour ramp, a ground
  shockwave ring, a burst of embers on ballistic arcs with drag, a rising smoke
  ball and a single light that flashes and dies - sized from the authored damage
  radius, so widening the grenade widens the explosion. It comes out of a fixed
  pool of three blasts warmed before play, so a firefight full of grenades costs
  what the first one costs.
- The DollBody advanced character can **roll**, from all three triggers, through
  one entry point that carries the body the same way and uses the
  `drop_running_roll` clip the animation dropdown already offers: a double tap of
  Dodge, stepping out of a vehicle above 4.2 m/s, and a hard landing. Two bugs
  were in the way. The landing test read `state.grounded` back after the caller
  had already published it for the frame, making `grounded && wasGrounded ===
  false` a contradiction - so the character fell from any height and simply stood
  up. And `inheritExitVelocity` defaulted OFF for any vehicle that authored no
  `interaction` block, because `a && a.x !== false` is falsy when `a` is absent,
  so leaving a moving car never handed its velocity over.
- **FPS Enemy Outpost is a three-sector facility with a phased mission.** The
  arena is now the perimeter; north of it are a fuel depot with three sabotage
  tanks, revetments, containers, pipe runs and a pump house to clear, and a
  command post with a two-storey block house, a courtyard, a stair to a roof deck
  with a parapet, and the intel. 116 x 222 m of playable ground, with the movement
  bounds widened to match or the mission could not be finished. The garrison is
  twelve reusable AI Characters in three squads with different postures - a
  scouting perimeter watch, a defensive depot guard that holds the tanks, and a
  flanking command detail with a marksman on the roof - each with four distinct
  weapon roles, its own palette, its own patrol and a smart action area centred on
  the sector it garrisons rather than on wherever the member happens to stand. The
  mission is a sequence: break the perimeter, destroy the three tanks, recover the
  intel, reach extraction, and do not go down.
- The arena's prop builder is now exported as `createBuilder(scene, options)`, so
  a level that extends the facility authors in the same material classes and the
  same procedural grain instead of copying the material table and drifting from it.

## Fixes

- Repaired three tests that were asserting things the code does not do, two of them
  committed red. `material-assets-ux` named `Original GLB material` before
  `NON-DESTRUCTIVE OVERRIDE` although the card's markup is header → override layer →
  original, so it could never match the layout its own message describes; and it
  pinned a `24 * 1024 * 1024` thumbnail budget while the source gates at 8 MB - it
  now reads the gate and checks the budget is sane, instead of re-breaking whenever
  the budget is tuned. `weapon-explosion-fx` demanded that some ember had fallen
  below its height 24 frames earlier, but an ember launches at up to 23 m/s against
  15 m/s² and lives 0.85 s, so the fastest ones legitimately never come back down -
  it failed about one run in ten. It now measures what makes a trajectory ballistic:
  the rise per frame shrinks, by exactly `gravity * h²`. Zero failures in 40 runs.
- Fixed the WebGPU/common-renderer viewport and scissor origin in Editor, Play
  Preview, player-camera letterboxing, camera PIP and Cinema previews. The
  engine authors rectangles in WebGL lower-left coordinates, while Three r185's
  common renderer consumes upper-left logical coordinates; the mismatch shifted
  the 3D frame vertically and exposed a strip of the background even though DOM
  HUD, radar and buttons remained correctly positioned.
- Fixed a second WebGPU scoped-viewport mismatch in the TSL post pipeline. Scene
  colour and sketch neighbours were sampled with full-canvas `screenUV`, so the
  3D render target inherited the toolbar/assets dimensions and appeared with a
  different aspect ratio or visible side borders. The pipeline now samples
  `viewportUV / viewportSize` and resizes its intermediate scene pass to the
  requested viewport, matching the camera and WebGL result in Editor, Play and
  full-screen gameplay.

- The localhost project bridge now appears in Projects as `Local Project` with
  a `LOCAL DISK` badge when the saved LKEP still has a generic Demo name. It is
  discovered even while the private Author DEMO is selected, and loading it
  resolves the complete `/.lotking-local/active-project.lkep.json` payload
  instead of trying to open its compact browser manifest.
- The local Workspace card now opens that disk-backed project instead of only
  changing the workspace label. Its badge identifies `Local Project` and makes
  clear that browser Local DB is a working cache, not the durable project file.
- `avvio.bat` is now PowerShell-free and always binds the normal local editor to
  `127.0.0.1`, preventing Windows Firewall network-exposure prompts. The Python
  server safely recognizes and reuses an existing LOT KING instance on the
  canonical port, so repeated launches also keep the same browser Local DB.
- WebGPU is deliberately not the automatic default yet. The renderer Inspector
  probes the browser/device adapter independently, reports requested and actual
  backend plus fallback reason, and lists the remaining parity work. `Auto`
  stays on validated WebGL 2 until the real-device gate is green.
- Video Settings presents GPU backend separately from Raster/Ray lighting/Path
  tracing. WebGPU is now explicitly selectable when the runtime and adapter are
  available; unavailable devices show that condition instead of a misleading
  generic parity block.
- Lightweight menu-background extraction no longer removes a custom decorative
  player vehicle merely because gameplay control is disabled. The menu keeps
  the authored vehicle visible without enabling its physics or input, instead
  of falling back to the placeholder model.
- Soccer Pawns could not be turned at all, by stick or by camera, in both the
  match and the penalty templates: they defaulted to `facingMode: 'heading'`,
  which only rotates a Pawn that something else explicitly steers, and the graph
  variables re-applied that mode after Pawn creation. The control frame now
  follows possession rather than role, so an automatic player switch cannot hand
  the player a Pawn that will not turn, and the AI keeps the heading frame its
  world-space commands are rotated into.
- A throw inside any frame hook stopped the render loop and blanked the canvas,
  which read as a renderer crash. Hooks are now isolated: one that throws is
  reported once and retired, and every other system keeps running.
- `R` reset the native car even when the level owned its player through a Pawn
  and the native car was disabled, so it silently did nothing. It now resets the
  vehicle actually being driven. Pawns also gained the fell-out-of-the-world net
  that only the native car had, so a vehicle that clips through terrain recovers.
- Corrected the snow trail refill sweep, which charged each cell only one frame
  of decay per visit although the round-robin reaches it once per full pass,
  silently stretching every authored decay time by the sweep period.
- An unknown snow trail quality tier fell back to the detail slider instead of
  throwing, shipping a quality the author never selected.
- Corrected the cover probe, which tested for a continuing wall on the open side
  of the face normal and so stalled the slide on its first frame.
- The first-person player lost its weapon, its inventory, its traversal moves and
  its view rig all at once, in both FPS Shooter Test and FPS Enemy Outpost. Every
  authored `characterPawn` is routed through the character implementation
  registry, and the registry translated the descriptor even when it was already in
  the shape the target backend wanted; the rebuilt descriptor only carried the
  fields the OTHER backend understands, so `firstPerson`, `abilities`, `cover`,
  `vitals`, `loadout`, `inventory`, `appearance` and the outpost's `enemyAi` were
  silently dropped. With no rig the Camera Mode key also fell through to the
  vehicle chase cameras, which is why the view cycled Free/Interior/Arcade/
  Cinematic instead of swapping first and third person. Both translators are now
  identity functions on their own shape, the Sketchbook round trip keeps the
  stored native descriptor, and the backend id is read after the graph bindings
  rather than from the stale raw copy.
- `B` swapped the on-foot view and also skipped a radio track, because the raw
  key handler predates the on-foot binding scheme that gives the radio keys up.
- DollBody vehicle doors opened into the cabin. The swing direction was taken
  from which side of the vehicle the door sits on, which is a different question
  from which way it opens: a front-hinged door turns one way and a rear-hinged
  door on the same side turns the other. The placement is now kept for naming the
  enter/exit animation and the swing is derived from the panel geometry, so both
  hinge styles open outward, and `doorSwingDirection` still inverts the whole
  convention for a model rigged the other way round.
- Propellers and rotors turned on the wrong axis, and the aircraft moved the wrong
  surfaces. Two causes. The part scan matched the helper empties each moving part
  is mounted on - `rotor_parent`, `aileron_parent.L`, `elevator_parent.R` - so the
  mount was animated as if it were the blade, tumbling the whole propeller
  assembly and swinging entire wings; a tagged rig now keeps only its tagged
  nodes, and a node that contains another part of the same kind is recognised as
  its mount. And writing `rotation[axis]` turns a part about its PARENT's axis,
  not its own: every part in these rigs has a 90-degree rest rotation, so the
  propeller spun across the fuselage instead of along it and an aileron swung
  around the fuselage instead of hinging on the wing. Parts now compose their turn
  onto their rest pose about their own axis, measured from the mesh - a rotor
  spins about the axis its disc is flat along, a control surface hinges about its
  span - so an imported model rigged on different axes animates correctly without
  a bespoke mapping. Ailerons take their left/right deflection from the rig's own
  `side` extra or from which half of the wing they sit on, never from their
  position in the scan order, which is not left-then-right.
- DollBody vehicles were authored at their source scale and read as toys beside a
  1.8 m character: a car was 2.49 m end to end and the character could not have
  fitted through its door. Every vehicle is now scaled by one factor, chosen so
  the car lands on a real 4.4 m hatchback, which preserves the set's own internal
  proportions. The source dimension stays recorded on the asset, so provenance and
  a reset to source scale remain possible, and the level template re-derives the
  scale from it rather than multiplying whatever is already there. Scaling the
  model is also what scales the physics now: the raycast wheel radius is measured
  from the wheel that is drawn instead of read from a fixed metre value, and the
  collider offsets and wheel mounts are built in world units, so an author scaling
  a vehicle in the editor no longer keeps a collider at the authored size. That
  retires the "scaling a vehicle scales its mesh only" known issue.

## Stability: the editor filling up and stopping

Three separate causes, all measured rather than guessed at, behind an editor that
grew heavier the longer it was used and eventually stopped responding.

- **Reloading a level leaked the previous one onto the GPU.** `STORE.apply()`
  describes a whole scene and builds one object per entry, but it never removed
  what an earlier apply had added, and the one path that did remove something
  detached it without freeing its buffers. Measured on the FPS level, every load
  added about 2000 scene objects, 900 geometries and 2280 textures and released
  none of them; the browser was killed on the fourth load/Play cycle. The JS heap
  stayed flat the whole time, because geometry and textures live on the GPU -
  which is why the symptom read as the machine slowly degrading, survived a page
  reload, and looked like it needed a restart to clear. `apply` now tears down
  everything a previous apply added before building the new scene, deletions are
  disposed rather than only detached, and the shared disposer frees every texture
  slot a material carries (normal, roughness, emissive, ao, alpha, the derived
  sketch layers and a skinned mesh's bone texture) instead of only its colour
  map. Textures a surface pack shares between materials are still never freed
  with one object. After the fix the same three cycles hold flat at 3392 objects
  and 2290 textures with no errors.
- **Every shader link blocked on the GPU.** Three.js validates each program it
  links with `getProgramInfoLog` and `getShaderInfoLog`, and both force the
  driver to finish compiling synchronously. A CPU profile of entering Play on the
  open world spent 82% of its samples inside those two calls and the transition
  never completed: the scene builds hundreds of program variants across
  districts, weather, the illustrated pipeline and per-material sketch layers,
  and each one stalled the main thread. The checks only ever produce console
  output, so they are off by default and re-enabled with `?shaderErrors=1` or
  `LK_DEBUG_SHADER_ERRORS = true` when a shader is actually being debugged.
- **The world metadata was re-read on every scene registration.** The Sketchbook
  extras sweep treated "there is no Cannon world yet" as a failed parse, which is
  the editor's normal state, so its retry branch was permanently true: each
  register or unregister disposed the world's metadata handle and re-walked the
  entire 25 MB world graph, allocating multi-megabyte vertex arrays as it went.
  With district streaming registering objects continuously the editor spent its
  time re-reading a model that had not changed. A parse now happens only when the
  source object, the physics world or an explicit `force` actually changed, and a
  physics retry no longer drags the source metadata with it. Counted in a test:
  62 re-reads across 31 sweeps before, 2 after.

## Known issues

Open and known, rather than discovered later in play:

- **The WebGPU fix is not confirmed on screen.** The deferred GPU release is verified
  by unit coverage and by the console's own evidence, not by an observed frame,
  because the editor cannot currently boot under Playwright. Making it bootable is the
  prerequisite for confirming this and for any further WebGPU work.
- **Fourteen authored Character slots have no bundled take.** Slide, vault, mantle,
  climb/ledge variants, crouched landing, interact, punch, knife attack and hit react
  retain their documented graceful fallback because none of the current source packs
  contains an honest matching animation.
- **P2P transport remains star-shaped.** Host election, epoch authority and Player 1
  reassignment now complete locally, but surviving guests without a guest-to-guest
  data channel must exchange a fresh invite/answer with the elected host.
- **First-person performance needs a real browser/GPU soak.** The duplicate full-body
  plus arms rig and duplicated weapon are now removed by the separate presentation
  Pawn lifecycle; the original frame-rate symptom must be remeasured on hardware before
  the performance issue can be declared closed.
- The snowboard rider is driven through walk locomotion, so it plays the walking
  clips while the board slides beneath it. The procedural character has no
  snowboard stance yet.
- Snowboard vegetation and overall visual quality are unfinished.
- Entering Play on the full DollBody Open World is slow on a software renderer:
  the automation host needs about two minutes to build every program variant, and
  `state.editorPreview` is not reported until it finishes. The level itself is
  correct once running; this is a shader-compilation cost, not a stall, and it is
  not reproducible on hardware with a real GL driver.

## Environment and verification

- Reworked the lightweight volumetric cloud layer with generated tileable
  Perlin-Worley volumes, adaptive ray budgets, day/night lighting, fallback
  rendering and editable Clear/Cumulus/Overcast/Storm presets.
- Removed Open World per-frame work over static collider pairs, throttled
  collider/Logic signatures, cached effect targets and input bindings, and
  cleaned Cannon collision listeners/backlinks and removed Cat trigger state.
- Reduced Character/Animal per-frame allocation and stopped repeated GLB retry
  loops after a failed custom asset load.
- Added focused Node and Chromium coverage for Sketchbook Play lifecycle,
  Animal Pawns, objective flow, template construction, 427-collider performance
  behavior and editor/play/export parity. No publication is included in this worktree.
- Added possession/input/actor regression coverage for Character `R` Reload
  versus Vehicle Reset, profile-exclusive Animal/Soccer actions, semantic Logic
  action edges, mapped aircraft braking, independent AI loadouts, AI-owned chase
  cleanup, circle-collider sight, Stop Preview release and death/revive collider
  alignment. The cover stress fixture contains 6,256 colliders and asserts the
  indexed search remains subquadratic. The focused real-browser gate passes all
  16 Editor/FPS assertions in desktop and mobile Chromium.
- Added Node coverage for team tactics, 11v11 scene construction, the penalty
  shootout, the snow trail atlas, the feline rig, district streaming and
  third-person parity. The 11v11 test builds the real scene, checks every
  formation slot against `toWorld()` and then runs 90 frames of team AI.
- Added focused coverage for the stability and gameplay fixes above:
  `tests/character-implementations.test.js` spawns the real FPS template through
  the implementation registry and asserts the Pawn comes out armed, with its
  traversal, vitals, inventory and a working view toggle, plus that a block no
  backend maps - the outpost's `enemyAi` - survives a round trip;
  `tests/sketchbook-vehicle-rig.test.js` drives the runtime against rigs shaped
  like the bundled GLBs and measures the door swing, the rotor and hinge axes, the
  opposed aileron pair, the metre scale and a wheel radius that follows the model,
  and pins the world-metadata sweep as a no-op when nothing changed;
  `tests/scene-reload-release.test.js` pins the scene teardown and per-slot
  texture disposal; and `tests/browser/scene-reload-gpu-budget.spec.js` drives
  three real load/Play cycles in Chromium and asserts the GPU counts plateau.
- The part rig was additionally verified against the ACTUAL bundled GLBs, by
  rebuilding their node trees from the glTF accessors and running the shipped
  scan and animation code over them: every mount is excluded, the propeller shaft
  resolves to the fuselage axis, the helicopter's main rotor to the vertical and
  its tail rotor to the lateral, all four car doors and both helicopter doors swing
  outward, and the wheel radius lands within 12% of the wheel that is drawn.
- Added focused coverage for the combat and traversal work:
  `tests/weapon-explosion-fx.test.js` (blast shape, colour ramp, ember arcs,
  lifetime, and that twenty blasts do not grow the pool),
  `tests/sketchbook-character-roll.test.js` (all three roll triggers on a real
  Pawn, plus that the roll owns the body and then gives it back),
  `tests/fps-view-model-ownership.test.js` (a whole garrison firing never flashes
  the player's weapon, an own shot still does, and dispose stops listening),
  `tests/pawn-death-ragdoll.test.js` (nothing floats, every joint gap survives, the
  body lies down in the direction it was hit, and a revive puts the hierarchy and
  the pose back), `tests/default-character-bodies.test.js` (both bodies land on
  1.8 m from their own fit, every `playAction()` name has an author-facing slot,
  clips bind by asset, every referenced file exists on disk, and the export walker
  collects FBX), and new cases in
  `tests/character-traversal.test.js` pinning that the roll turns about the
  character's own axis rather than the world's, that a slide has a pose and gives
  it back, and that a respawn stands the Character up and re-grounds it. The
  Enemy Outpost assertions in `tests/game-mode-level-templates.test.js` now cover
  three squads, per-sector action areas, four weapon roles per squad, the five
  phased objectives and the widened playable bounds; its arena stub grew a
  `createBuilder` so the appended sectors are actually exercised.
- The Node suite stands at **79 files green**, every one of them part of `npm test`.
  Three that were red have been repaired rather than skipped:
  `tests/material-assets-ux.test.js` had two assertions committed red - a reversed
  string order and a `24 MB` literal where the code reads an `8 MB` gate;
  `tests/weapon-explosion-fx.test.js` demanded a fall that fast embers legitimately
  never make, and now measures the arc itself (0 failures in 40 runs).
- Added `tests/cache-tag-freshness.test.js` as a permanent guard: a changed `js` file
  whose `?v=` tag did not move in the shell that loads it now fails the suite, per
  shell. Cache-tag drift is how a fix reaches the repository without reaching the
  browser, and it had already happened.
- Added `scripts/measure-clip-direction.mjs`, which reports the real travel direction
  of any FBX clip from its root motion. A clip filed as a left strafe can contain a
  rightward one; this is how the mirrored locomotion was finally settled by
  measurement instead of by reasoning about the frame convention.
- `tests/static-server.js` streams responses instead of reading each file whole
  into a Buffer. The 25 MB open world made the harness spike ~25 MB per concurrent
  request, which was enough for the browser under test to fail the fetch outright
  and report it as a scene-load failure; the same request now completes in ~116 ms.
- `tests/browser/sketchbook-template.spec.js` was reading Pawn hydration out of an
  editor boot, where no Pawn or Cannon body exists yet, and still expected the
  pre-district Logic Element count. It now enters Play before measuring and counts
  the DollBody Pawns separately from the district controllers. It remains red on a
  software renderer for the shader-compilation reason recorded under Known issues.
- The focused menu-background Chromium spec passed against the actual Windows
  `serve_local.py` launcher, including the custom vehicle and the transition
  from the 3D menu into Engine Editor. The focused project-identity Chromium
  spec also passed, including discovery beside Author DEMO and full local-LKEP
  loading. The complete browser suite was not run.
- Microsoft Defender targeted scans of the final `avvio.bat` and
  `serve_local.py` reported no threats. The live socket check confirmed that the
  normal server listens on `127.0.0.1` only, and all four local-server security
  boundary tests passed.
- The pinned r185 renderer suite now covers seven scenarios per browser profile:
  Editor boot, gameplay boot, exporter, standalone harness, guarded Auto,
  explicit WebGPU/common-renderer boot with fallback, and the complete Editor
  viewport → Play preview → Editor lifecycle. Desktop and Pixel 7 Chromium
  profiles pass all fourteen checks without renderer errors.
- The illustrated-rendering browser check additionally enables the real scene
  pass on desktop and Pixel 7 profiles, verifies that the output frame changes,
  converts a live vehicle material to the toon layer and confirms exact original
  material identity after restoration; both profiles pass.
- The explicit common-renderer lifecycle test now records the actual viewport
  calls and verifies the backend-correct vertical origin through Editor → Play →
  Editor on desktop and Pixel 7 profiles.
- The automation host exposes the WebGPU API but no usable adapter, including
  under the Chromium SwiftShader qualification flags. The common-renderer and
  automatic WebGL fallback paths are therefore covered, but this result is not
  presented as WebGPU hardware or real Android/iOS performance certification;
  `Auto` remains on WebGL 2 until those physical-device checks are complete.
## Physical vehicle dismounts

- Exiting a flying helicopter or aircraft now returns the Character at the live seat altitude with the vehicle's full linear velocity. Gravity, free-fall animation, landing damage and lethal ragdoll remain owned by the normal Character systems; there is no teleport to terrain.
- Road-vehicle exits are speed-aware in km/h: normal below 12, authored roll from 12, scalar damage from 25 to 80, and immediate death physics/ragdoll at 80 or above. A damaged survivor still rolls in the real direction of travel.
- The four thresholds are exposed once under `Vehicle Exit` on every Character template and remain editable per Pawn. Watercraft deliberately bypass road-impact damage until the swimming/boat transition is implemented.
- Native Player Car, Logic Vehicle and Sketchbook vehicle shapes feed the same dismount policy from their authoritative physics velocity. New regression coverage verifies all thresholds, free-fall momentum, backend velocity shapes and directional roll.
- Sketchbook aircraft/vehicle input no longer queues an Engine Character's exit until the vehicle slows down: a deliberate high-speed exit is allowed immediately because the Character policy now owns its physical consequence.

## Exact Parking Lot ground and complete default Character

- Complex imported horizontal scenery now fails closed when its real mesh cannot be sampled. Disconnected road, border and marking meshes can no longer fall back to one enormous bounding-box floor across the Parking Lot; ordinary authored box colliders remain unchanged.
- Added a real-browser regression against `Parking Lot First Ever Level Test Source`: the saved Character jumps and lands across the authored space without ever landing on the false city-mesh AABB heights.
- The default Male and Female Player Character templates now use the complete shared FPS/TPS contract: weapons, items, inventory, cover, traversal, vitals and a first/third-person toggle on the same animated body.
- Older saved Normal Player Characters are upgraded once in place. Their model, animation slots and authored tuning are preserved while missing gameplay blocks and Inspector controls are added.
- Character eye view uses `presentation: body` with no separate arms Pawn. Vehicle interior cameras remain exclusive to active vehicle possession.
- Procedural World schema v2 keeps authored content at `Y=0` while lowering the still-collidable centre terrain to `Y=-6`, ocean to `Y=-14` and seabed to `Y=-28`. The untouched v1 stack migrates once; author-customized elevations are preserved.
- Environment now exposes `Terrain collision level under authored map`, alongside independent sea and seabed controls. This changes the real render height, Character ground query and Cannon heightfield together.
- The old infinite `Y=0` physics plane is identified as a legacy fallback. It is automatically absent whenever the procedural heightfield is available, while drive surfaces, Complex collision and the surrounding procedural collision remain active.

## Helicopter landing and action-safe weapon IK

- A piloted helicopter now recognizes stable skid contact independently from the parked-prop path. Neutral or descending collective plants the chassis, damps solver rebound and reports it grounded; positive collective releases the stabilization immediately for takeoff.
- Weapon hand IK no longer runs over roll, slide, vault, climb, death and other full-body actions. Those clips retain complete ownership of their arm chains instead of being twisted back toward the carry pose after the animation mixer.
- During a full-body action unrelated to the equipped item, the held weapon is temporarily hidden in both body and arms presentation. The equipped slot, ammunition and backpack inventory remain untouched and the visual returns automatically when the action ends. Firearm, melee and thrown-item actions keep their relevant weapon visible on the animated hand.

## Persistent custom-vehicle preview in Pawn Studio

- Exact active custom vehicles load their clean persistent project GLB with the same 5.6 m fit used by the native Player Car. A fitted live-vehicle clone remains only as fallback and temporarily strips runtime-only circular `userData` while Three.js copies it, preventing dynamic-surface controllers from aborting the preview.
- The cloned custom preview now explicitly revives its render meshes and their parent hierarchy. Editor ownership may hide the live Player Car mesh; that hidden state is no longer copied into Pawn Studio, while collision, physics, deleted and split-hidden parts remain excluded.
- Pawn Studio camera framing now measures only visible render meshes. Deleted, split-hidden, collision and physics geometry in a High Poly hierarchy can no longer push the real vehicle outside the viewport.
- A procedural Character preview no longer returns an empty result that aborts the pending vehicle load; the selected custom or bundled vehicle is still added beside the Character.
- High Poly Car V3 now receives a one-time driver layout derived from its fitted `steering_wheel_mesh`: the Character is raised and moved to the left-hand cockpit, with pelvis, torso, head, hands, elbows, knees, feet and toes arranged around the wheel, seat and pedals. The saved version marker prevents later manual edits from being overwritten.
- Vehicle Seating adds an orange **Master Rig** dummy. Move or Rotate applies one shared delta to the Character root and every independent Full Body IK target, preserving their relative pose; the original Character Root remains available for body-only correction.
- Consecutive dummy edits now keep one stable schema-v5 profile object instead of replacing it whenever Properties refreshes. Moving a second target therefore cannot restore the previous target or rerun the automatic cockpit layout.
- High Poly Car V3 seating layout v2 removes a duplicated 180-degree compensation: anatomical left remains Character-space `+X` and anatomical right remains `-X`, consistently across shoulders, hands, elbows, knees, feet and toes.
- Every Full Body IK marker now draws a live coloured link to the bone it controls. Seating end-effectors retain full authored weight even when initially far from the rig, so hands and feet visibly follow their selected dummies instead of receiving traversal-distance attenuation.
- Selecting the Master Rig no longer enlarges its actual transform object. The former `1.24` selection scale was accidentally included in the shared delta and compounded every target position on each click; selection highlighting now changes material intensity only, while Master Rig math is explicitly rigid translation plus rotation with unit scale.
- High Poly Car seating layout v3 runs once to repair profiles whose target positions were already multiplied by the former Master selection-scale bug.
- The final Parking Lot High Poly Car V3 Character root and complete Full Body IK setup are promoted to an engine exact-asset default under the stable `glb:high-poly-car-v3` identity. Fresh levels, newly placed Character templates and databases that assign a different timestamped GLB key therefore start with the same verified driver pose.
- Republished the exact active Parking Lot project as the default Author DEMO: scene and all five embedded levels match the local source, `authorDemo` is enabled, project identity uses `Parking Lot First Ever Level Test Source`, and the 125,645,465-byte payload is stored as 16 checksum-verified GitHub-safe parts with an automatic previous-publication backup.

## Shared Pawn authoring defaults and centred gait clips

- Character Walk and Run clips are now made in-place around the actual Pawn centre. The repair still preserves every vertical hips sample, but no longer freezes horizontal X/Z on each take's first sample; this removes the small left offset in Walk and the larger right offset in Run without changing controller direction or mesh orientation.
- The corrected FPS Shooter Slide root pose and its ten Pawn Studio timeline keys are now part of the shared Character authoring defaults for both normal and combat motion sets.
- The bundled Falling To Roll slot now also starts 11.8 cm lower, around the Character body instead of the standing-feet pivot, matching the verified vertical baseline of the related Running Slide take.
- The other recoverable FPS Pawn Studio timings are shared too: Front Flip Vault plays at `2x` and Wall Flip at `0.65x`. The obsolete `Vault Over Box` text formerly attached to the Front Flip asset is not propagated; the asset that actually plays remains authoritative.
- Existing saved Characters receive the Roll, Slide, Vault and Wall Flip corrections once only when those bundled entries are still untouched. Imported clips and hand-authored transforms/timeline keys or non-default playback rates remain authoritative.
- New Character templates persist all four shared corrections before Pawn Studio is opened. Engine/Pawn fixes are treated as project-wide defaults; level-specific content remains local unless explicitly promoted.
