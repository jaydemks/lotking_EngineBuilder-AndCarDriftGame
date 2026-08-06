/* =========================================================
   What a bundled model costs to DRAW, as opposed to how big it is.

   A frame-rate collapse when the camera comes close to a character or a vehicle is
   overdraw: the mesh covers the whole screen, so every fragment is paid at full
   material price and paid again for every mesh stacked on the same pixels. Triangle
   count is nearly irrelevant there; what matters is how many separate meshes cover
   those pixels, and whether their materials blend - a transparent material cannot be
   rejected by early-Z, so it is paid even where something is drawn in front of it.

   Usage: node scripts/inspect-model-cost.mjs <file.fbx> [...]
   ========================================================= */
import fs from 'node:fs';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';

const files = process.argv.slice(2);
if(!files.length){
  console.error('usage: node scripts/inspect-model-cost.mjs <file.fbx> [...]');
  process.exit(2);
}

const loader = new FBXLoader();
for(const file of files){
  let object;
  try { object = loader.parse(new Uint8Array(fs.readFileSync(file)).buffer, ''); }
  catch(error){ console.log(file + ' -> could not be parsed: ' + error.message); continue; }

  const meshes = [];
  object.traverse(node => { if(node.isMesh || node.isSkinnedMesh) meshes.push(node); });
  let triangles = 0, blended = 0, skinned = 0;
  const rows = [];
  meshes.forEach(mesh => {
    const geometry = mesh.geometry;
    const index = geometry && geometry.index;
    const position = geometry && geometry.attributes && geometry.attributes.position;
    const count = index ? index.count / 3 : (position ? position.count / 3 : 0);
    triangles += count;
    if(mesh.isSkinnedMesh) skinned++;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const flags = materials.filter(Boolean).map(material => {
      const bits = [material.type];
      if(material.transparent) { bits.push('TRANSPARENT'); blended++; }
      if(material.alphaTest > 0) bits.push('alphaTest=' + material.alphaTest);
      if(material.side === 2) bits.push('DoubleSide');
      const maps = Object.keys(material).filter(key => /map$/i.test(key) && material[key]);
      if(maps.length) bits.push(maps.length + ' maps');
      return bits.join(' ');
    });
    rows.push('    ' + String(mesh.name || '(unnamed)').padEnd(26)
      + Math.round(count).toString().padStart(8) + ' tris   ' + flags.join(' | '));
  });

  console.log('\n' + file.replace(/\\/g, '/'));
  console.log('  meshes ' + meshes.length + ' (skinned ' + skinned + ')   triangles ' + Math.round(triangles)
    + '   blended materials ' + blended);
  // Every mesh covering the same pixels multiplies the fragment cost at point-blank
  // range, which is what the camera closing in actually changes.
  console.log('  worst-case overdraw at full-screen coverage: x' + meshes.length
    + (blended ? '  (with ' + blended + ' of them unable to early-Z out)' : ''));
  rows.forEach(row => console.log(row));
}
