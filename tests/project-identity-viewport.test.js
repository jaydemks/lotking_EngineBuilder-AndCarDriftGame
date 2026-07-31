const assert = require('node:assert/strict');
const fs = require('node:fs');

const projectIo = fs.readFileSync('js/editor/project-io.js', 'utf8');
const workspace = fs.readFileSync('js/runtime/project-workspace.js', 'utf8');
const splitProject = fs.readFileSync('js/runtime/split-project.js', 'utf8');
const sceneStore = fs.readFileSync('js/engine/scene-store.js', 'utf8');
const windowManager = fs.readFileSync('js/runtime/ui/window-manager.js', 'utf8');
const editorCss = fs.readFileSync('css/editor.css', 'utf8');
const gameCss = fs.readFileSync('css/lot-king.css', 'utf8');

assert.match(
  projectIo,
  /const name = opts\.name \|\| \(existingRecord && existingRecord\.name\) \|\| sourceMeta\.projectName/,
  'an existing project catalog name must remain authoritative while levels are saved'
);
assert.match(projectIo, /projectName:name/, 'browser saves persist a dedicated projectName');
assert.doesNotMatch(
  projectIo,
  /meta:Object\.assign\(\{\}, source\.meta \|\| \{\}, \{[\s\S]{0,160}trackName:name/,
  'browser saves must not overwrite the active level trackName with the project name'
);
assert.match(
  projectIo,
  /project\.meta = Object\.assign\(\{\}, project\.meta \|\| \{\}, \{[\s\S]{0,100}projectName:next\.trim\(\)/,
  'renaming a project updates projectName only'
);
assert.match(projectIo, /function migrateLegacyBrowserProjectIdentity/,
  'legacy browser projects receive a dedicated project identity migration');
assert.match(projectIo, /projectLevelNames\(project\)\.has\(slugifyTrackName\(recordName\)\)/,
  'a catalog name inherited from any level is recognized as legacy contamination');
assert.match(projectIo, /localStorage\.getItem\('lotking\.levels\.v1'\)/,
  'legacy names are checked against the separate local level library');
assert.match(projectIo, /localStorage\.getItem\('lotking\.scene\.v1'\)/,
  'the currently loaded level also participates in identity repair');
assert.match(projectIo, /function refreshProjectsOverlay\(\)[\s\S]{0,400}migrateLegacyBrowserProjectIdentity\(idx\)/,
  'the visible Projects list repairs identity before rendering its ACTIVE card');
assert.match(projectIo, /project\.name \|\| STORE\.PROJECT_NAME \|\| 'Lot King Engine Project'/,
  'legacy level-derived names migrate to the stable project-level name');
assert.match(projectIo, /projectIdentityVersion:PROJECT_IDENTITY_VERSION/,
  'new saves and renamed projects stamp the explicit identity schema');
assert.match(projectIo, /function compactActiveBrowserProjectForLocalBridge/,
  'localhost saves can compact a redundant full browser-project snapshot after a durable bridge save exists');
assert.match(projectIo, /mode:'local-bridge-manifest'/,
  'the compact browser record retains project identity while the complete LKEP remains on disk');
assert.match(projectIo, /sessionStorage\.setItem\(LOCAL_BRIDGE_MARKER/,
  'a bridge confirmed on disk can trigger quota recovery even when LocalStorage was too full to save its marker');
assert.match(projectIo, /compactActiveBrowserProjectForLocalBridge\(\);\s*const ok = STORE\.save/,
  'quota recovery runs before writing the active level');
assert.match(projectIo, /saveWorkspaceProjectCopy\(project\);\s*saveLocalBridgeProject\(project\)/,
  'disk and workspace copies still run when the optional browser catalog write fails');
assert.match(projectIo, /function exportProjectFolder\(/,
  'large portable projects expose an explicit split-folder export path');
assert.match(projectIo, /function importProjectFolder\(/,
  'split project folders can be reassembled and imported by the editor');
assert.match(splitProject, /const CHUNK_CHAR_LIMIT = 8 \* 1000 \* 1000/,
  'repository project chunks stay far below GitHub single-file limits');
assert.match(splitProject, /sha256:await sha256\(text\)/,
  'split manifests retain per-part integrity checks');
assert.match(splitProject, /texts\[index\] = await verifyChunk/,
  'project parts are verified before concatenation');
assert.match(sceneStore, /splitProject\.resolveText\(text, new URL\(url, location\.href\)\.href/,
  'the shared hosted Editor/Game demo loader resolves split pointers before ordinary LKEP parsing');
assert.match(workspace, /meta:\{\s*projectName,[\s\S]{0,180}trackId:/, 'new workspace projects declare projectName');
assert.match(workspace, /function migrateBrowserProjectIdentityEarly/,
  'the editor iframe repairs project identity before the 3D editor boots');
assert.match(workspace, /browserProjectLevelNames\(project\)\.has\(slugifyWorkspaceName\(oldName\)\)/,
  'early migration recognizes names inherited from the separate level library');
assert.match(workspace, /const needsRepair = inheritedFromLevel && !explicitlyNamed/,
  'a stale version stamp cannot protect a level-derived project name');
assert.match(projectIo, /projectIdentityExplicit:true[\s\S]{0,120}projectIdentitySource:'user-rename'/,
  'an intentional project rename is explicitly protected from future migrations');
assert.doesNotMatch(
  workspace,
  /projectCopy\.meta = Object\.assign\(\{\}, projectCopy\.meta \|\| \{\}, \{trackId:id, trackName:name\}\)/,
  'folder workspace saves no longer rename the active level after the project'
);

assert.match(windowManager, /window\.innerHeight - MARGIN \* 2/, 'movable windows are height-limited to the viewport');
assert.match(windowManager, /window\.innerWidth - fitted\.width - MARGIN/, 'movable windows are fully clamped horizontally');
assert.match(editorCss, /#lkProjectsList \{ flex:1; min-height:0; overflow:auto/, 'project lists scroll inside their panel');
assert.match(editorCss, /\.lk-prefs-body \{\s*flex:1; min-height:0; overflow:auto/, 'storage preferences scroll inside their panel');
assert.match(gameCss, /#settingsPanel \{[\s\S]{0,180}100dvh/, 'game and PIE settings respect the dynamic viewport height');

console.log('project-identity-viewport.test.js: all assertions passed');
