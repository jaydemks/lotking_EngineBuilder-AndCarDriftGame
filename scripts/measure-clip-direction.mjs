/* =========================================================
   Measure which way a locomotion clip actually travels.

   A strafe clip's name is a claim, not a measurement. `animationSet` entries
   declare a direction vector that the runtime matches against the character's
   local velocity, and if a clip's real motion disagrees with the direction it is
   filed under, the character strafes right while playing the leftward pose - the
   mirrored locomotion reported on screen. This reads the horizontal displacement
   of the root position track and says which way the body went.

   Mixamo exports these with the character facing +Z, in centimetres, so:

     dx > 0  travels toward local +X, which for a +Z-facing body is its LEFT
     dx < 0  travels toward local -X, its RIGHT
     dz > 0  forward,  dz < 0  backward

   Usage: node scripts/measure-clip-direction.mjs <file.fbx> [more.fbx ...]
   ========================================================= */
import fs from 'node:fs';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';

const files = process.argv.slice(2);
if(!files.length){
  console.error('usage: node scripts/measure-clip-direction.mjs <file.fbx> [...]');
  process.exit(2);
}

const loader = new FBXLoader();
// In-place clips carry a root track that barely moves; anything under this is
// reported as in-place rather than as a direction.
const MOVED_CM = 2;

function label(dx, dz){
  const parts = [];
  if(Math.abs(dz) >= MOVED_CM) parts.push(dz > 0 ? 'forward' : 'backward');
  if(Math.abs(dx) >= MOVED_CM) parts.push(dx > 0 ? 'LEFT' : 'RIGHT');
  return parts.length ? parts.join('+') : 'in place';
}

for(const file of files){
  let object;
  try {
    const buffer = fs.readFileSync(file);
    object = loader.parse(new Uint8Array(buffer).buffer, '');
  } catch(error){ console.log(file + ' -> could not be parsed: ' + error.message); continue; }
  const clips = object.animations || [];
  if(!clips.length){ console.log(file + ' -> no clips'); continue; }
  clips.forEach(clip => {
    let best = null;
    clip.tracks.filter(track => /\.position$/i.test(track.name)).forEach(track => {
      const count = track.values.length / 3;
      if(count < 2) return;
      const dx = track.values[(count - 1) * 3] - track.values[0];
      const dz = track.values[(count - 1) * 3 + 2] - track.values[2];
      const span = Math.hypot(dx, dz);
      if(!best || span > best.span) best = {name:track.name, dx, dz, span};
    });
    const name = file.replace(/\\/g, '/').split('/').slice(-2).join('/');
    if(!best){ console.log(name.padEnd(44) + ' | ' + clip.name + ' | no root position track'); return; }
    console.log(name.padEnd(44) + ' | ' + String(clip.name).padEnd(11)
      + ' | dur ' + clip.duration.toFixed(2)
      + ' | dx ' + best.dx.toFixed(1).padStart(7) + '  dz ' + best.dz.toFixed(1).padStart(7)
      + '  -> ' + label(best.dx, best.dz)
      + '   (' + best.name + ')');
  });
}
