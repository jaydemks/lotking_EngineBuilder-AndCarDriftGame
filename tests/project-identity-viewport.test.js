const assert = require('node:assert/strict');
const fs = require('node:fs');

const projectIo = fs.readFileSync('js/editor/project-io.js', 'utf8');
const workspace = fs.readFileSync('js/runtime/project-workspace.js', 'utf8');
const splitProject = fs.readFileSync('js/runtime/split-project.js', 'utf8');
const sceneStore = fs.readFileSync('js/engine/scene-store.js', 'utf8');
const windowManager = fs.readFileSync('js/runtime/ui/window-manager.js', 'utf8');
const editorCss = fs.readFileSync('css/editor.css', 'utf8');
const gameCss = fs.readFileSync('css/lot-king.css', 'utf8');
const launcher = fs.readFileSync('avvio.bat', 'utf8');
const editorRuntime = fs.readFileSync('js/editor/editor-runtime.js', 'utf8');

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
assert.match(projectIo, /const BROWSER_PROJECT_DB = 'lotking-editor-projects'/,
  'large browser projects have a dedicated IndexedDB payload store');
assert.match(projectIo, /mode:'indexeddb-project'/,
  'LocalStorage keeps only a compact manifest when a project payload exceeds its safe inline budget');
assert.match(projectIo, /await writeIndexedBrowserProject\(write\.id, projectText/,
  'the complete project reaches IndexedDB before its oversized LocalStorage value is replaced');
assert.match(projectIo, /async function compactOversizedBrowserProjects\(\)/,
  'legacy oversized project snapshots are migrated before a new import needs LocalStorage space');
assert.match(projectIo, /await writeBrowserProjectDurable\(imported, \{name, newProject:true/,
  'manual project import uses quota-safe durable persistence');
assert.match(projectIo, /saveLocalBridgeProject\(imported,\{claimLocalAuthority:true,allowShrink:true,confirmed:true\}\)/,
  'manual import updates the port-independent disk authority before reload');
assert.match(projectIo, /if\(!options\.claimLocalAuthority&&!activeLocalBridgeRecord\(\)\)/,
  'browser projects, demos and temporary scenes cannot overwrite the LOCAL DISK project bridge');
assert.match(projectIo, /X-LotKing-Allow-Project-Shrink/,
  'only an explicit project replacement can authorize a major disk-project size reduction');
assert.match(projectIo, /X-LotKing-Confirm-Overwrite/,
  'disk replacement requires a confirmation token emitted only after an editor confirmation');
assert.match(projectIo, /async function restoreLocalProjectVersion\(version\)/,
  'Projects exposes an explicit project-version restore flow');
assert.match(projectIo, /X-LotKing-Confirm-Restore/,
  'version restoration carries its own confirmation contract');
assert.match(projectIo, /X-LotKing-Confirm-Demo-Publish/,
  'confirmed DEMO publication also uses the append-only server boundary');
assert.match(projectIo, /CRONOLOGIA PROGETTO/,
  'previous disk versions are visible from the Projects panel in Italian');
const previewStart = editorRuntime.slice(editorRuntime.indexOf('function startPlayPreview'), editorRuntime.indexOf('function stopPlayPreview'));
assert.doesNotMatch(previewStart, /saveScene|STORE\.save|saveLocalBridgeProject/,
  'Play and Simulate are never allowed to save a level, project, workspace or local bridge');
assert.match(previewStart, /Preview is a simulation boundary, never a persistence boundary/,
  'the no-autosave contract is documented at the runtime boundary that previously violated it');
assert.match(projectIo, /if\(restored\)\{[\s\S]{0,360}reopenEditorAndReload/,
  'a project recovered for a new origin is applied to the rendered editor through one controlled reload');
assert.match(projectIo, /host === '0\.0\.0\.0'[\s\S]{0,100}\^192\\\.168/,
  'the disk bridge is probed on local LAN origins as well as localhost');
assert.match(projectIo, /mode:'local-bridge-manifest'/,
  'the compact browser record retains project identity while the complete LKEP remains on disk');
assert.match(projectIo, /function syncLocalBridgeBrowserProject/,
  'the durable localhost LKEP is represented by a browser Projects card');
assert.doesNotMatch(projectIo, /if\(current && !isAuthorDemoBrowserRecord\(current\)\) record = current/,
  'discovering LOCAL DISK must never convert or erase the currently selected browser/demo project');
assert.match(projectIo, /record\.source = LOCAL_BRIDGE_SOURCE/,
  'the local disk Projects card is explicitly distinguished from browser-only projects');
assert.match(workspace, /function shouldOpenAuthorDemoByDefault\(\)/,
  'the exported Author DEMO owns the normal editor startup route');
assert.match(workspace, /function activateLocalProject\(\)\{\s*setStartupAuthority\('local'\)/,
  'an explicit LOCAL DISK selection overrides the DEMO only for the active browser session');
assert.match(sceneStore, /shouldOpenAuthorDemoByDefault/,
  'scene bootstrap asks the shared workspace authority before choosing bundled DEMO versus a selected project');
assert.match(sceneStore, /projectName:name, onlineDemo:true/,
  'the bundled DEMO is presented with its authored Parking Lot track identity instead of a generic Local Project name');
assert.match(projectIo, /function syncAuthorDemoBrowserProject\(project\)/,
  'Projects contains one stable, URL-backed Author DEMO card alongside LOCAL DISK');
assert.match(projectIo, /browserStorage:\{mode:'author-demo',completeProject:'demo\/demo-project\.lkep\.json'\}/,
  'the Author DEMO card resolves the split repository export rather than duplicating it into browser storage');
assert.match(projectIo, /savingAuthorDemo\?\{name:workingName,newProject:true,explicitName:true\}/,
  'saving the default Author DEMO forks a working copy and never overwrites the published reference');
assert.match(projectIo, /project = await resolveBrowserProjectPayload\(record, project\)/,
  'loading a compact local Projects card resolves the complete disk LKEP first');
assert.match(projectIo, /async function loadLocalBridgeProject\(\)/,
  'the Workspace Local Project action has a direct disk-backed load path');
assert.match(projectIo, /tr\('LOCAL DISK', 'DISCO LOCALE'\)/,
  'the Projects screen labels the disk-backed project visibly');
assert.match(projectIo, /sessionStorage\.setItem\(LOCAL_BRIDGE_MARKER/,
  'a bridge confirmed on disk can trigger quota recovery even when LocalStorage was too full to save its marker');
assert.match(projectIo, /compactActiveBrowserProjectForLocalBridge\(\);\s*const ok = STORE\.save/,
  'quota recovery runs before writing the active level');
assert.match(projectIo, /const diskRecord = \(idx\.projects \|\| \[\]\)\.find\(record => record && record\.source === LOCAL_BRIDGE_SOURCE\)/,
  'bridge compaction targets the disk card rather than an active Author DEMO');
assert.match(projectIo, /saveWorkspaceProjectCopy\(project\);\s*saveLocalBridgeProject\(project,\{confirmed:opts\.confirmed===true\}\)/,
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
assert.match(workspace, /function activateLocalProject\(\)/,
  'switching from Author DEMO to the local disk project exits private demo mode');
assert.match(workspace, /function activateBrowserProject\(options\)/,
  'opening a browser project preserves its authority across reload instead of being replaced by LOCAL DISK');
assert.match(workspace, /async function openLocalBrowserProject\(\)/,
  'the local Workspace card opens a project instead of changing only its label');
assert.match(workspace, /ensureWritableHandle\(\{mode:'read', requestPermission:false\}\)/,
  'automatic workspace discovery only queries an existing permission and never opens a browser prompt');
assert.match(workspace, /const canRequestPermission = opts\.requestPermission !== false && hasUserActivation\(\)/,
  'File System Access permission is requested only from an explicitly interactive path');
assert.match(workspace, /permission !== 'granted' && hasUserActivation\(\) && typeof handle\.requestPermission/,
  'linked LKEP file permission is likewise never requested without user activation');
assert.match(workspace, /permissionRequired:true/,
  'startup permission expiry is reported as quiet state instead of an uncaught user-activation error');
assert.match(workspace, /record\.source === 'local-disk'/,
  'the workspace badge recognizes an active disk-backed project');
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
assert.doesNotMatch(launcher, /powershell/i,
  'the normal Windows launcher does not execute PowerShell probes');
assert.match(launcher, /--bind 127\.0\.0\.1/,
  'the normal Windows launcher exposes the editor to loopback only');
assert.match(launcher, /--open-browser/,
  'the trusted Python launcher owns server reuse and browser opening');

console.log('project-identity-viewport.test.js: all assertions passed');
