# Lot King Runtime Modules

`js/lot-king.js` is being split gradually into runtime modules. The current rule is:
extract low-risk, self-contained blocks first, keep `window.LOT_KING` stable, and avoid behavior changes during mechanical moves.

## Current Modules

- `js/runtime/assets.js`
  Central asset directories, path builders, and `file://` detection.

- `js/runtime/player-camera.js`
  Player camera default config, cinematic aspect ratio math, and scoped viewport rendering.

- `js/runtime/music-library.js`
  Shared sortable music libraries, browser-session audio imports, and safe audio URL handling.

- `js/runtime/menu-music.js`
  Start-screen music playback, menu music button state, track switching, and menu music uploads.

- `js/runtime/radio-hud.js`
  Soundhud UI, TAB radio interactions, editor HUD handles, player radio volume, and bass boost.

- `js/runtime/audio.js`
  Procedural WebAudio SFX: engine tone (fallback for the sample engine), tire screech, ambient hum, crash and thud sounds.

- `js/runtime/engine-audio.js`
  Sample-based engine sound sets: ON/OFF throttle RPM loop banks with constant-power crossfade,
  continuous layers (limiter, turbo whine + blow-off, gear whine), one-shot events (ignition,
  shift pop, backfire, rev) with synthetic fallbacks per empty/failed slot, procedural reverb,
  manual test mode for the editor Sound Designer. Also owns the three continuous skid channels
  (drift / brake lockup / launch wheelspin): the game pushes slip levels via `setSkids()` each
  frame — same flags as the visual skid marks — and per-channel attack/release envelopes make
  the sound track the real slide duration (noise-loop fallback when no sample is assigned). Sets are stored via `LK_STORE.soundSets`
  and assigned to the player blueprint (`GAME.player.setEngineSound(setId)`); the editor UI
  lives in `js/editor/sound-designer.js` (lazy-loaded overlay).

- `js/runtime/sky.js`
  Day/night cycle, stars, moon, clouds, procedural environment lighting, global light modulation.
  Sun glow and lens flare are separate parametric systems: `SKY.sunBloom` (halo intensity/size)
  and `SKY.flare` (ghost chain laid out in camera space every render — intensity, size, ghost
  count/spacing, chroma, halo, streak). Hosts the volumetric clouds sub-API (`SKY.volClouds`)
  and syncs it with the sun each frame.

- `js/runtime/volumetric-clouds.js`
  Raymarched volumetric clouds (3D fbm noise slab, Beer's law, sun phase function) on a sky dome.
  Editor-tunable: coverage, density, noise scale, edge detail, wind, altitude, thickness, quality (steps),
  absorption, opacity. Replaces the sprite clouds when enabled; hidden dome costs nothing when off.

- `js/runtime/rain.js`
  GPU rain (LineSegments, fall computed entirely in the vertex shader, wrapped around the player car).
  Editor-tunable: intensity, fall speed, drop length, wind strength/direction, area, opacity, and a
  procedural rain sound (two filtered noise layers on the SFX bus, gain follows intensity).
  Persisted per level in `env.rain`, clouds in `env.volClouds`.

- `js/runtime/post.js`
  Gameplay camera post-processing: DOF (golden-angle disc bokeh with luminance-weighted highlights,
  radial focus mask around the player) and visual grading.

- `js/runtime/physics-world.js`
  Cannon world adapter: player body creation, static collider rebuild, body sync, and teardown.

- `js/runtime/drive-tuning.js`
  Drive setup panel bindings, tuning values, and config mutation for handling/power/grip.

- `js/runtime/player-data-widgets.js`
  Player-attached 3D metric labels, mirrored drift-side placement, editor helpers, and widget text rendering.

- `js/runtime/game-hud.js`
  Gameplay HUD DOM helpers for popups, drift score, total score, speed, and gear.

- `js/runtime/track-catalog.js`
  Available track list, current track state, and level-select card rendering.

- `js/runtime/loading-flow.js`
  Loading progress UI, weighted loading stages, menu busy state, and final loading messages.

- `js/runtime/runtime-loader.js`
  Runtime asset loading, local model report, saved-project apply step, and gameplay effect warmup.

- `js/runtime/model-assets.js`
  GLB/GLTF loading, model normalization, and player wheel rig detection/driving helpers.

- `js/runtime/player-model.js`
  Player GLB assignment, current model access, model flip support, and drag/drop replacement.

- `js/runtime/world-state.js`
  Editor entity registry, deterministic world seed, colliders, cone physics, and lightweight car collision helpers.

- `js/runtime/world-generation.js`
  Default parking-lot track factory: ground, walls, props, parked cars, cones, light poles, and track-owned lights.

- `js/runtime/session-flow.js`
  Gameplay/editor session state for launch track, editor preview, pending loads, and level loaded state.

- `js/runtime/settings-menu.js`
  Settings and pause menu DOM bindings, audio sliders, video quality controls, and editor/game menu modes.

- `js/runtime/game-flow.js`
  Track launch, editor preview, unload/back-to-menu, HUD visibility, and gameplay session transitions.

- `js/engine/scene-store.js`
  LKEP project save/load/import/export and scene application.

- `js/editor/loader.js`
  Lazy-loads the engine editor only when requested.

## Still In `lot-king.js`

- renderer/bootstrap/game loop
- player driving step
- player lights/exhaust and vehicle-facing editor hooks

## Suggested Next Extractions

1. `js/runtime/player-physics.js`
2. `js/runtime/player-effects.js`
3. `js/runtime/track-projects.js`
