/* =========================================================
   LOT KING - One authority for "what shape is this view"

   The aspect ratio used to be decided in four places that did not agree, which is
   why every camera preview looked like 16:9 no matter what was selected:

     - the PIP read `GAME.player.cameraAspectValue()`, the PLAYER camera's ratio,
       for EVERY camera you selected - so a scene camera showed the player's shape
     - the Cinema floating preview mapped its own select with its own ternaries
     - `floating-layout.js` mapped the same select AGAIN, separately
     - scene cameras had no aspect field at all, so there was nothing to honour

   Now every view asks this module, and there is a MASTER override so the whole
   editor can be forced to one shape while framing a shot.

   PRECEDENCE - deliberately different in the editor and in the game

     EDITOR   master override  ->  this camera's own  ->  level default  ->  viewport
              An author framing a shot wants to see one shape everywhere, but must
              still be able to give a single camera its own.

     GAME     mobile  ->  level default  ->  viewport
              In play there is no author, so the level's default is the answer and a
              per-camera choice does not get to fight it. A phone is forced to 9:16
              regardless of what the level says, because the alternative is
              letterboxing a portrait screen into a stripe.

   `auto` at any level means "no opinion, ask the next one down", which is why it
   maps to null rather than to a number.

   SECTIONS
     01 table      the named ratios
     02 device     what counts as a phone
     03 resolve    the precedence, and where the answer came from
     04 rect       letterboxing a chosen ratio inside a viewport
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;

// =================================================================== 01 table

const ASPECTS = Object.freeze({
  auto: null,
  '16:9': 16 / 9,
  '21:9': 21 / 9,
  '2.39:1': 2.39,
  '4:3': 4 / 3,
  '1:1': 1,
  '9:16': 9 / 16,
});
const OPTIONS = Object.freeze(Object.keys(ASPECTS).map(id => ({
  value:id,
  label:id === 'auto' ? 'Auto (fill the view)' : id,
})));
const MOBILE_ASPECT = '9:16';

/** The ratio for a name, or null for `auto` and for anything unknown. */
function ratioOf(name){
  const key = String(name == null ? '' : name).trim();
  if(!key) return null;
  return Object.prototype.hasOwnProperty.call(ASPECTS, key) ? ASPECTS[key] : null;
}
function isNamed(name){
  const key = String(name == null ? '' : name).trim();
  return !!key && key !== 'auto' && Object.prototype.hasOwnProperty.call(ASPECTS, key);
}

// ================================================================== 02 device

/** The same rule the settings menu already uses, so the two cannot disagree about
 *  what a phone is: a coarse pointer, or a viewport too narrow to be a desktop. */
function isMobileViewport(width){
  const w = Number(width);
  const narrow = Number.isFinite(w) ? w < 760 : (typeof innerWidth === 'number' && innerWidth < 760);
  const coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  return coarse || narrow;
}

// ================================================================= 03 resolve

/** Decide the ratio for one view.
 *
 *  Every input is optional; what matters is the ORDER they are consulted in, which
 *  differs between the editor and the game (see the header). Returns the ratio and
 *  WHERE it came from, because "why is my preview this shape" was the original
 *  complaint and a number alone does not answer it.
 *
 *  @param {object} query
 *    mode      'editor' | 'game'
 *    authored  this camera's own aspect name
 *    level     the level default aspect name
 *    master    the editor-wide override aspect name
 *    width     viewport width, for the fallback and the phone test
 *    height    viewport height, for the fallback
 *    mobile    force the phone answer; omitted means detect it
 */
function resolve(query){
  const q = query || {};
  const width = Number(q.width) > 0 ? Number(q.width) : 16;
  const height = Number(q.height) > 0 ? Number(q.height) : 9;
  const viewport = width / height;
  const game = q.mode === 'game';

  if(game){
    const mobile = q.mobile == null ? isMobileViewport(width) : !!q.mobile;
    if(mobile) return {ratio:ASPECTS[MOBILE_ASPECT], name:MOBILE_ASPECT, source:'mobile', scoped:true};
    if(isNamed(q.level)) return {ratio:ratioOf(q.level), name:String(q.level), source:'level', scoped:true};
    return {ratio:viewport, name:'auto', source:'viewport', scoped:false};
  }

  if(isNamed(q.master)) return {ratio:ratioOf(q.master), name:String(q.master), source:'master', scoped:true};
  if(isNamed(q.authored)) return {ratio:ratioOf(q.authored), name:String(q.authored), source:'camera', scoped:true};
  if(isNamed(q.level)) return {ratio:ratioOf(q.level), name:String(q.level), source:'level', scoped:true};
  return {ratio:viewport, name:'auto', source:'viewport', scoped:false};
}

// ==================================================================== 04 rect

/** Fit a resolved ratio inside a box, centred, letterboxing whichever axis is
 *  spare. A view with no opinion fills the box, so nothing is cropped by default. */
function fitRect(resolved, width, height){
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const ratio = resolved && Number(resolved.ratio) > 0 ? Number(resolved.ratio) : w / h;
  if(!resolved || !resolved.scoped) return {x:0, y:0, w, h, ratio:w / h, scoped:false};
  let fitW = w, fitH = h;
  if(w / h > ratio) fitW = Math.round(h * ratio);
  else fitH = Math.round(w / ratio);
  return {
    x:Math.round((w - fitW) / 2),
    y:Math.round((h - fitH) / 2),
    w:Math.max(1, fitW),
    h:Math.max(1, fitH),
    ratio,
    scoped:true,
  };
}

root.LK_ASPECT_POLICY = Object.freeze({
  ASPECTS, OPTIONS, MOBILE_ASPECT, ratioOf, isNamed, isMobileViewport, resolve, fitRect,
});

})();
