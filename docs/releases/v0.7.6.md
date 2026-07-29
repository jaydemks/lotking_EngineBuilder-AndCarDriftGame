# Release Notes: v0.7.6

## FPS camera mode

- Fixed switching an armed procedural Character Pawn from first person to third person freezing play and flooding the console with errors. The third-person support-hand IK now accepts the serialized rest-pose coordinates used by the placeholder rig instead of treating them as live Three.js vectors.

## Grenades

- Fixed lethal grenade explosions applying damage and blast impulse without eliminating the affected enemy. Explosive damage now emits the same target-down event as a killing shot, so target knock-down, scoring and respawn logic all run correctly.
- Separated grenade damage from physical impulse falloff. Every damageable target inside the authored blast radius now receives the grenade's configured damage and its own target-down event, while knockback still weakens naturally toward the edge.

## FPS HUD

- Moved the circular radar to the left-centre of the view, below the health and armour block, so it no longer overlaps the settings control.
- Fixed the radar projection being reversed: forward now maps to the top of the disc and the character's local right maps to screen-right at every heading.
- Corrected the remaining horizontal radar mirror caused by the Character controls inheriting the vehicle steering-axis sign.
- Put Settings at the far-right HUD position in every mode. The vehicle-only driving setup wrench now sits immediately to its left and remains hidden for Character/FPS play.
- The Camera Mode popup now names the view being entered instead of the one being left.

## World interactions

- Swing doors now rotate around an automatically selected left/right leaf edge instead of their centre. Their axis-aligned collider follows the moving leaf and swaps its fitted width/depth while opening, leaving the doorway genuinely passable.

## Native player isolation

- The FPS Shooter Test now explicitly disables and hides the native Player Car, clears its controller assignment and leaves Player 1 to the Character Logic Pawn.
- Native car physics, sampled engine audio, fallback idle synth, tyre screech and exhaust now follow actual Player 1 ownership as well as the native enabled/hidden flags. A hidden native car, or one displaced by a possessed Logic Pawn, can no longer leave engine sound or exhaust smoke running at its old spawn.

## Character Sound Designer

- Added a procedural 808-style grenade explosion: low-frequency sine drop, filtered impact/debris burst and body resonance, with an optional replacement sample.
- Added an Explosions / FX rack to the Character Sound Designer. The procedural Noise, Sub/Tone and Resonance modules can now be enabled, disabled and tuned independently with live preview.
- Reworked weapon sound rows into modular signal-chain cards. Fire, tail, mechanism, shell and reload sounds now expose their synthesis layers instead of limiting editing to volume, pitch and sample selection.

## Menu presentation and options

- Added a transient menu rendering profile shared by main menus, menu-role levels, pause and Options. Menu scenes are capped at the Medium preset, 1× pixel ratio, 1K textures, FXAA and low shadows, with heavyweight post effects disabled, without overwriting the player's gameplay preferences.
- Restored the Settings gear in menu-role scenes and added it to the landing menu. From a menu it opens an Options-only view containing Audio and Video, without pause actions, Controls or Gameplay.
- Added the reusable `GAME.ui.menuActions.run('options')` / `GAME.actions.openMenuOptions()` contract so future UI menus authored in the editor can expose the same Options action without duplicating settings logic.

## Release identity

- Updated the landing page, bilingual welcome copy, structured web metadata, runtime identity, package metadata, public documentation and browser cache revisions to v0.7.6.
