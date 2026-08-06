'use strict';

// Regenerates the lightweight landing-menu payloads from the canonical split
// DEMO. The landing must never assemble the complete 100+ MB author project
// merely to render one small ROLE level.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const bundleDir = path.join(root, 'demo', 'demo-project');
const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, 'manifest.json'), 'utf8'));
const source = manifest.chunks.map(entry => fs.readFileSync(path.join(bundleDir, entry.file), 'utf8')).join('');
const project = JSON.parse(source);
const outputDir = path.join(root, 'demo', 'menu-levels');
fs.mkdirSync(outputDir, {recursive:true});

const levels = [];
for(const entry of Array.isArray(project.embeddedLevels) ? project.embeddedLevels : []){
  const roleProject = entry && entry.project;
  const role = entry && (entry.role || entry.levelRole) || roleProject && roleProject.meta && roleProject.meta.levelRole;
  if((role !== 'editor-menu' && role !== 'game-menu') || !roleProject) continue;
  const copy = JSON.parse(JSON.stringify(roleProject));
  delete copy.embeddedLevels;
  copy.meta = Object.assign({}, copy.meta || {}, {levelRole:role, menuRoleSidecar:true});
  const scene = copy.scene || copy;
  const player = scene && scene.player;
  if(player && player.enabled === false && (player.modelSrc || player.modelDbKey)){
    // Historical ROLE levels use disabled + visible for a decorative vehicle:
    // it must render in the menu without owning input or physics. Some newer
    // saves already collapsed that old state to hidden=true, so the presence of
    // an authored model on a disabled ROLE player is the recovery signal.
    player.hidden = false;
    player.menuDecorativeVisible = true;
  }
  const fileName = role + '.lkep.json';
  fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(copy));
  levels.push({
    id:entry.id || entry.levelId || copy.meta.trackId || role,
    name:entry.name || copy.meta.trackName || copy.meta.levelName || role,
    role,
    visible:entry.visible !== false,
    sidecar:'demo/menu-levels/' + fileName,
  });
}

if(!levels.length) throw new Error('No editor-menu/game-menu embedded level found in the DEMO bundle');
fs.writeFileSync(path.join(root, 'demo', 'menu-roles.json'), JSON.stringify({version:1, levels}, null, 2) + '\n');
console.log('Wrote ' + levels.length + ' menu ROLE sidecar(s): ' + levels.map(level => level.sidecar).join(', '));
