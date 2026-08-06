/* =========================================================
   LOT KING - Character implementation registry

   One authored Character Pawn, two possible locomotion backends:

     native      js/runtime/character-pawn-base.js - the engine's own controller
     sketchbook  js/runtime/sketchbook-pawns.js    - the MIT Sketchbook character

   Before this module the choice was implied by WHICH descriptor a graph carried
   (`characterPawn` vs `sketchbookPawn`), so comparing the two meant rebuilding
   the Pawn from scratch and losing its authored settings. An author can now
   flip `characterPawn.implementation` and keep the same model, animations,
   spawn, camera and player assignment.

   The translation is deliberately one-way per frame and lossless in the
   direction that matters: everything the target backend understands is mapped,
   and anything it does not is left on the original descriptor so switching back
   restores it.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const SCHEMA_VERSION = 1;
const DEFAULT_ID = 'native';

function finite(value, fallback){
  value = Number(value);
  return Number.isFinite(value) ? value : (fallback == null ? 0 : fallback);
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, finite(value, min))); }
function text(value, fallback){
  value = value == null ? '' : String(value).trim();
  return value || (fallback == null ? '' : String(fallback));
}
function clone(value){
  try { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  catch(err){ return value; }
}

/** Which shape a descriptor is ALREADY in.
 *
 *  This matters because `translate` runs on every character spawn, not only on
 *  an author-driven backend flip. A translator that rebuilds a descriptor it
 *  does not need to touch silently drops every block it does not name -
 *  `firstPerson`, `abilities`, `cover`, `vitals`, `loadout`, `inventory`,
 *  `appearance` - which is how a first-person Pawn loses its weapon, its
 *  traversal moves and its view rig. Both translators are therefore identity
 *  functions on their own shape. */
function isSketchbookShape(src){
  if(!src || typeof src !== 'object') return false;
  if(src.type === 'advanced-character' || src.kind === 'advanced-character') return true;
  // A Sketchbook descriptor keeps its whole locomotion budget under `tuning`.
  return !!(src.tuning && typeof src.tuning === 'object'
    && (src.tuning.groundProbe || (src.tuning.movement && src.tuning.movement.moveSpeed != null)));
}
function isNativeShape(src){
  return !!(src && typeof src === 'object') && !isSketchbookShape(src);
}

const IMPLEMENTATIONS = new Map();

function register(descriptor){
  const src = descriptor && typeof descriptor === 'object' ? descriptor : {};
  const id = text(src.id);
  if(!id || typeof src.create !== 'function') return null;
  const entry = Object.freeze({
    id,
    label:text(src.label, id),
    labelIt:text(src.labelIt, text(src.label, id)),
    available:typeof src.available === 'function' ? src.available : () => true,
    translate:typeof src.translate === 'function' ? src.translate : (definition => clone(definition)),
    create:src.create,
  });
  IMPLEMENTATIONS.set(id, entry);
  return entry;
}
function get(id){ return IMPLEMENTATIONS.get(text(id)) || null; }
function list(){ return Array.from(IMPLEMENTATIONS.values()); }
/** Available implementations, for the editor's select. */
function options(translateLabel){
  const tr = typeof translateLabel === 'function' ? translateLabel : (en => en);
  return list().filter(entry => entry.available()).map(entry => ({value:entry.id, label:tr(entry.label, entry.labelIt)}));
}
/** Resolve to a usable backend: the requested one if its runtime is loaded,
 *  otherwise the default, otherwise anything available. Never returns null when
 *  at least one backend exists, so a project authored against a missing module
 *  still spawns a controllable character. */
function resolve(id){
  const requested = get(id);
  if(requested && requested.available()) return requested;
  const fallback = get(DEFAULT_ID);
  if(fallback && fallback.available()) return fallback;
  return list().find(entry => entry.available()) || null;
}

/** `characterPawn` / `soccerPawn` shape -> Sketchbook advanced-character shape.
 *  Only the fields the Sketchbook runtime reads are mapped; the rest stays on
 *  the source descriptor so flipping back is lossless. */
function toSketchbook(definition){
  const src = definition && typeof definition === 'object' ? definition : {};
  // Already a Sketchbook descriptor: converting it again would overwrite its
  // own `sourceCharacterPawn` with itself and lose the native original.
  if(isSketchbookShape(src)) return clone(src);
  const movement = src.movement || {};
  const camera = src.camera || {};
  const collider = src.collider || src.capsule || {};
  const runSpeed = finite(movement.runSpeed, 5);
  return {
    type:'advanced-character',
    kind:'advanced-character',
    id:text(src.id),
    enabled:src.enabled !== false,
    hidden:src.hidden === true,
    playerId:src.playerId == null ? 1 : src.playerId,
    possessed:src.possessed !== false,
    spawn:clone(src.spawn) || {x:0, y:0, z:0, heading:0},
    modelAsset:clone(src.model || src.modelAsset) || null,
    animations:clone(src.animations) || {},
    camera:{
      mode:text(camera.mode, 'free'),
      distance:finite(camera.distance, 7.5),
      height:finite(camera.height, 2.6),
      lag:finite(camera.lag, 6.5),
      fov:finite(camera.fov, 60),
    },
    tuning:{
      collider:{
        mass:finite(collider.mass, 1),
        radius:clamp(collider.radius == null ? .25 : collider.radius, .05, 2),
        height:clamp(collider.height == null ? .5 : collider.height, .1, 4),
      },
      groundProbe:{rayLength:.57, safeOffset:.03},
      movement:{
        // The Sketchbook character is velocity-driven from one move speed;
        // the native controller separates walk and run. Run is the honest
        // match because it is what the player feels holding a direction.
        moveSpeed:runSpeed,
        sprintMultiplier:clamp(movement.sprintMultiplier == null ? 1.4 : movement.sprintMultiplier, 1, 3),
        // Native authors a jump HEIGHT; Sketchbook wants a launch velocity.
        jumpVelocity:Math.sqrt(2 * finite(movement.gravity, 22) * Math.max(.05, finite(movement.jumpHeight, 1.15))),
        airControl:clamp(movement.airControl == null ? .28 : movement.airControl, 0, 1),
      },
    },
    movement:{
      acceleration:finite(movement.acceleration, 18),
      turnRate:finite(movement.turnRate, 12),
    },
    interaction:clone(src.interaction) || {},
    // Kept so switching back to the native backend restores everything the
    // Sketchbook runtime does not read.
    sourceCharacterPawn:clone(src),
  };
}

/** Sketchbook advanced-character shape -> native `characterPawn` shape. */
function toNative(definition){
  const src = definition && typeof definition === 'object' ? definition : {};
  // Already native: hand it back untouched. The reconstruction below only knows
  // the fields the Sketchbook runtime exposes, so running it on a native
  // descriptor would strip `firstPerson`, `abilities`, `cover`, `vitals`,
  // `loadout`, `inventory`, `appearance`, `cloth`, `locomotion`, the animation
  // library and `preset` from a Pawn that never asked to be converted.
  if(isNativeShape(src)) return clone(src);
  if(src.sourceCharacterPawn){
    // The stored native descriptor is authoritative for everything Sketchbook
    // cannot represent, but the live spawn/player/possession may have moved
    // while the Sketchbook backend owned the Pawn.
    const restored = clone(src.sourceCharacterPawn) || {};
    if(src.spawn) restored.spawn = clone(src.spawn);
    if(src.playerId != null) restored.playerId = src.playerId;
    restored.possessed = src.possessed !== false;
    return restored;
  }
  const tuning = src.tuning || {};
  const movement = tuning.movement || {};
  const collider = tuning.collider || {};
  const gravity = 22;
  const jumpVelocity = finite(movement.jumpVelocity, 4);
  return {
    playerId:src.playerId == null ? 1 : src.playerId,
    possessed:src.possessed !== false,
    spawn:clone(src.spawn) || {x:0, y:0, z:0, heading:0},
    model:clone(src.modelAsset) || null,
    animations:clone(src.animations) || {},
    camera:clone(src.camera) || {},
    collider:{mass:finite(collider.mass, 1), radius:finite(collider.radius, .25), height:finite(collider.height, .5)},
    movement:{
      runSpeed:finite(movement.moveSpeed, 5),
      walkSpeed:finite(movement.moveSpeed, 5) * .38,
      sprintMultiplier:finite(movement.sprintMultiplier, 1.4),
      jumpHeight:(jumpVelocity * jumpVelocity) / (2 * gravity),
      gravity,
      airControl:finite(movement.airControl, .28),
      acceleration:finite(src.movement && src.movement.acceleration, 18),
      turnRate:finite(src.movement && src.movement.turnRate, 12),
    },
  };
}

register({
  id:'native', label:'Engine character', labelIt:'Personaggio del motore',
  available:() => !!(root.LK_RUNTIME_CHARACTER_PAWNS && root.LK_RUNTIME_CHARACTER_PAWNS.createLogic),
  translate:toNative,
  create(GAME, owner, definition, services){
    return root.LK_RUNTIME_CHARACTER_PAWNS.createLogic(GAME, owner, definition, services);
  },
});
register({
  id:'sketchbook', label:'Sketchbook character', labelIt:'Personaggio Sketchbook',
  available:() => !!(root.LK_RUNTIME_SKETCHBOOK_PAWNS && root.LK_RUNTIME_SKETCHBOOK_PAWNS.createLogic),
  translate:toSketchbook,
  create(GAME, owner, definition, services){
    return root.LK_RUNTIME_SKETCHBOOK_PAWNS.createLogic(GAME, owner, definition, services);
  },
});

/** The single entry point the Logic service uses: pick the backend the author
 *  asked for, translate the descriptor into its shape, and build the Pawn. */
function createCharacter(GAME, owner, definition, services, requestedId){
  const wanted = text(requestedId, text(definition && definition.implementation, DEFAULT_ID));
  const entry = resolve(wanted);
  if(!entry) return null;
  const translated = entry.translate(definition);
  if(translated && typeof translated === 'object') translated.implementation = entry.id;
  const pawn = entry.create(GAME, owner, translated, services);
  if(pawn) pawn.characterImplementation = entry.id;
  return pawn;
}

root.LK_RUNTIME_CHARACTER_IMPLEMENTATIONS = Object.freeze({
  SCHEMA_VERSION, DEFAULT_ID,
  register, get, list, options, resolve, createCharacter,
  toSketchbook, toNative, isSketchbookShape, isNativeShape,
});
if(typeof module !== 'undefined' && module.exports) module.exports = root.LK_RUNTIME_CHARACTER_IMPLEMENTATIONS;
})();
