/* =========================================================
   LOT KING — EDITOR TEMPLATE
   Static editor chrome markup, kept separate from runtime logic.
   ========================================================= */
(function(){
'use strict';

	function create(){
	  return `
	  <div id="lkAppMenuBar">
	    <button data-app-menu="file" type="button">File</button>
	    <button data-app-menu="edit" type="button">Edit</button>
	    <button data-app-menu="view" type="button">View</button>
	    <button data-app-menu="tools" type="button">Tools</button>
	    <button data-app-menu="plugins" type="button">Plugins</button>
	  </div>
	  <div id="lkTopbar">
    <button id="lkLogoBtn" class="lk-logo" type="button" title="Editor settings">⚙ ENGINE EDITOR</button>
    <div class="lk-tools">
      <button data-tool="select" type="button" title="Select (Q)">☝</button>
      <button data-tool="translate" type="button" title="Move (W)">✥</button>
      <button data-tool="rotate" type="button" title="Rotate (E)">⟳</button>
      <button data-tool="scale" type="button" title="Scale (R)">⤢</button>
    </div>
    <button id="lkSpace" type="button" title="Change space: World Z-up / Local Z-up / Engine Y-up">🌐 World Z-up</button>
    <div class="lk-history-tools">
      <button id="lkUndo" class="disabled" type="button" title="Undo">↶</button>
      <button id="lkRedo" class="disabled" type="button" title="Redo">↷</button>
    </div>
    <div class="lk-snapbox">
      <button id="lkSnap" type="button" title="Snap">⌗ Snap</button>
      <span class="lk-snapfields">
        <label>M<input id="lkSnapMove" type="number" min="0.01" step="0.1" value="1"></label>
        <label>R<input id="lkSnapRot" type="number" min="1" step="1" value="15"></label>
        <label>S<input id="lkSnapScale" type="number" min="0.01" step="0.05" value="0.1"></label>
      </span>
    </div>
    <button id="lkGrid" class="on" type="button" title="Toggle grid">▦ Grid</button>
    <span class="lk-gridbox">
      <input id="lkGridSize" type="number" min="20" step="20" value="240" title="Grid size">
      <button id="lkGridInfinite" type="button" title="Huge/infinite-feel grid">∞</button>
    </span>
    <button id="lkCamHelper" class="on" type="button" title="Toggle camera helpers">🎥 Cam</button>
    <button id="lkPipToggle" class="on" type="button" title="Toggle player camera preview">❐ Preview</button>
    <button id="lkAddMenu" type="button" title="Add object">+ Add ▾</button>
    <span class="lk-spacer"></span>
    <div class="lk-trackbar"><span>LEVEL</span><input id="lkTrackName" type="text" value="Parking Lot"></div>
    <button id="lkProjects" type="button">🗂 Projects</button>
    <button id="lkLevels" type="button">🗀 Levels</button>
    <button id="lkNewTrack" type="button">New</button>
    <button id="lkSaveAsTrack" type="button">Save As</button>
    <span id="lkDirty">*</span>
    <button id="lkSave" type="button">💾 Save</button>
    <button id="lkExportProject" type="button" title="Export project">⇩ Export project</button>
    <button id="lkExportPlayableLegacy" type="button" title="Export playable legacy HTML">⇩ Export playable legacy (ZIP)</button>
    <button id="lkExportPlayable" type="button" title="Export playable ZIP">⇩ Export playable ZIP</button>
    <button id="lkImportProject" type="button" title="Import LKEP">⇧ Import project</button>
    <button id="lkResetScene" type="button">↺ Reset</button>
    <button id="lkPlay" type="button">▶ PREVIEW</button>
    <button id="lkSimulate" type="button" title="Run events without driving the player vehicle">▶ SIMULATE</button>
    <button id="lkExit" type="button" title="Exit editor">×</button>
  </div>
  <div id="lkViewportToolbar">
    <button id="lkViewportToolbarFold" type="button" title="Collapse viewport tools">▴</button>
    <div class="lk-viewport-toolset">
      <button id="lkViewportSingle" class="on" type="button" title="Single perspective viewport">▣</button>
      <button id="lkViewportQuad" type="button" title="Quad view">▦</button>
      <select id="lkViewportRenderMode" title="Render mode for selected view">
        <option value="normal">Lit</option>
        <option value="wire">Wireframe</option>
        <option value="clay">Clay</option>
        <option value="mesh">Mesh only</option>
        <option value="lights">Lights only</option>
        <option value="unlit">Unlit</option>
        <option value="reflect">Reflections</option>
      </select>
      <div class="lk-viewport-options">
        <button id="lkViewportOptions" type="button" title="Viewport visibility options">☑</button>
        <div id="lkViewportOptionsMenu" class="lk-viewport-options-menu">
          <label><input id="lkShowCollisionDummies" type="checkbox"><span>Collision dummies</span></label>
        </div>
      </div>
      <button id="lkViewportFps" type="button" title="Toggle FPS status">FPS</button>
      <button id="lkViewportPerf" type="button" title="Toggle performance debug">▤</button>
      <span class="lk-viewport-caption">VIEWPORT</span>
      <button id="lkViewportVideoSettings" type="button" title="Project Video settings shared by editor and game">⚙</button>
    </div>
  </div>
  <aside id="lkLeft">
    <div id="lkLeftResize" class="lk-resize-handle"></div>
    <div class="lk-panelhead">SCENE</div>
    <div class="lk-left-tabs"><button id="lkSceneTab" class="on" type="button">Scene</button></div>
    <div class="lk-outliner-tools">
      <input id="lkSearch" type="search" placeholder="search...">
      <select id="lkFilter">
        <option value="all">All</option><option value="mesh">Meshes</option><option value="light">Lights</option>
        <option value="effect">Effects</option><option value="camera">Cameras</option><option value="cinemaStudio">Cinema</option><option value="logicElement">Logic</option><option value="added">Added</option><option value="builtin">Built-in</option>
      </select>
      <button id="lkViewGrid" type="button" title="Grid view">▦</button>
      <button id="lkViewList" class="on" type="button" title="List view">☰</button>
      <button id="lkSceneFolder" type="button" title="New scene folder">📁</button>
    </div>
    <div id="lkPinned">
      <div class="lk-pin" data-special="env"><span class="lk-pin-ic">🌍</span><span class="lk-pin-label">Environment</span></div>
      <div class="lk-pin" data-special="rendering"><span class="lk-pin-ic">◈</span><span class="lk-pin-label">Rendering / Video</span></div>
      <div class="lk-pin" data-special="logic"><span class="lk-pin-ic">◇</span><span class="lk-pin-label">Level Logic</span></div>
      <div class="lk-pin" data-special="player"><span class="lk-pin-ic">🚗</span><span class="lk-pin-label">player_car (Logic)</span></div>
      <div class="lk-pin" data-special="hud"><span class="lk-pin-ic">▣</span><span class="lk-pin-label">HUD / Radio TAB</span></div>
    </div>
    <div id="lkOutliner" class="list"></div>
  </aside>
  <aside id="lkRight">
    <div id="lkRightResize" class="lk-resize-handle"></div>
    <div class="lk-panelhead">INSPECTOR</div>
    <div id="lkInspector"></div>
  </aside>
  <section id="lkAssetsDock">
    <div id="lkAssetsResize" class="lk-assets-resize"></div>
    <div id="lkAssetsToolbar">
      <strong>ASSETS</strong>
      <button id="lkAssetsTab" class="on" type="button">Assets</button>
      <button id="lkAssetImport" type="button">Import</button>
      <span class="lk-assets-viewtools">
        <button id="lkAssetViewGrid" class="on" type="button" title="Assets grid view">▦</button>
        <button id="lkAssetViewList" type="button" title="Assets list view">☰</button>
        <button id="lkAssetFolder" type="button" title="New assets folder">📁</button>
      </span>
      <button id="lkAssetRefresh" type="button">Refresh</button>
      <span id="lkAssetsFilters">
        <label><input data-asset-filter="blueprint" type="checkbox" checked> blueprints / logic elements</label>
        <label><input data-asset-filter="sound" type="checkbox" checked> sound</label>
        <label><input data-asset-filter="levels" type="checkbox" checked> levels</label>
        <label><input data-asset-filter="glb" type="checkbox" checked> glb</label>
        <label><input data-asset-filter="scene" type="checkbox" checked> scene</label>
        <label><input data-asset-filter="texture" type="checkbox" checked> texture</label>
        <label><input data-asset-filter="light" type="checkbox" checked> light</label>
        <label><input data-asset-filter="effect" type="checkbox" checked> effect</label>
        <label><input data-asset-filter="camera" type="checkbox" checked> camera</label>
        <label><input data-asset-filter="other" type="checkbox" checked> other</label>
      </span>
    </div>
    <div id="lkAssetsPanel" class="grid"></div>
  </section>
  <div id="lkStatus">
    <b>Lot King Engine Editor</b>
    <span class="lk-status-help"><b>LMB</b> select/orbit · <b>RMB drag</b> fly · <b>RMB click</b> quick menu · <b>MMB</b> pan · <b>Wheel</b> zoom/fly speed · <b>Q/W/E/R</b> select/move/rotate/scale · <b>Shift drag</b> 0.001 precision · <b>Ctrl drag</b> snap · <b>Ctrl+Z/Y</b> undo/redo · <b>Ctrl+R</b> repeat transform · <b>Ctrl+D</b> duplicate · <b>Del</b> delete</span>
    <span id="lkStatusRightWrap">
      <span id="lkStatusRight"></span>
      <span id="lkStatusWork">
        <span class="lk-status-work-head"><span id="lkStatusWorkTitle"></span><span id="lkStatusWorkPct"></span></span>
        <span id="lkStatusWorkStep" class="lk-status-work-step"></span>
        <span class="lk-status-work-bar"><span id="lkStatusWorkFill"></span></span>
      </span>
    </span>
  </div>
  <div id="lkQuickAudio">
    <button id="lkQuickHide" type="button" class="lk-qa-close" title="Hide player">×</button>
    <button id="lkQuickMute" type="button" title="Mute menu music">♪ Off</button>
    <span class="lk-qa-label">MENU MUSIC</span>
    <input id="lkQuickMusicVol" type="range" min="0" max="100" step="1" value="100" title="Menu music volume">
    <button id="lkQuickNext" type="button" title="Next menu music">Next</button>
  </div>
  <div id="lkViewportOverlays">
    <div class="lk-view-corner" data-view-slot="0"><select></select><label class="lk-view-helpers" title="Show editor helpers in this view"><input type="checkbox" checked><span>◇</span></label></div>
    <div class="lk-view-corner" data-view-slot="1"><select></select><label class="lk-view-helpers" title="Show editor helpers in this view"><input type="checkbox" checked><span>◇</span></label></div>
    <div class="lk-view-corner" data-view-slot="2"><select></select><label class="lk-view-helpers" title="Show editor helpers in this view"><input type="checkbox" checked><span>◇</span></label></div>
    <div class="lk-view-corner" data-view-slot="3"><select></select><label class="lk-view-helpers" title="Show editor helpers in this view"><input type="checkbox" checked><span>◇</span></label></div>
    <div id="lkViewportSplitV" class="lk-view-split lk-view-split-v" data-split="x" title="Resize left/right views"></div>
    <div id="lkViewportSplitH" class="lk-view-split lk-view-split-h" data-split="y" title="Resize top/bottom views"></div>
    <div id="lkViewportSplitC" class="lk-view-split-center" data-split="xy" title="Resize all quad views"></div>
  </div>
  <div id="lkViewportStats"></div>
  <div id="lkCinemaTimeline">
    <div class="lk-cinema-timeline-head">
      <b>CINEMA STUDIO</b>
      <span id="lkCinemaTlName"></span>
      <span id="lkCinemaTlClock"></span>
      <button id="lkCinemaTlLock" type="button" title="Lock sequencer to this Cinema Studio">Lock</button>
      <button id="lkCinemaTlDock" type="button" title="Dock sequencer under the viewport">Dock</button>
      <button id="lkCinemaTlFloatPreview" type="button" title="Open floating timeline preview">Preview</button>
      <button id="lkCinemaTlPreviewMode" type="button" title="Toggle timeline preview between editor-normal and final render">Final</button>
      <select id="lkCinemaTlAspect" title="Floating preview aspect ratio">
        <option value="16:9">16:9</option>
        <option value="21:9">21:9</option>
        <option value="4:3">4:3</option>
        <option value="1:1">1:1</option>
        <option value="9:16">9:16</option>
      </select>
      <button id="lkCinemaTlZoomOut" type="button" title="Zoom timeline out">−</button>
      <button id="lkCinemaTlZoomIn" type="button" title="Zoom timeline in">+</button>
      <button id="lkCinemaTlZoomReset" type="button" title="Reset timeline zoom">1:1</button>
      <button id="lkCinemaTlPlay" type="button">Play</button>
      <button id="lkCinemaTlStop" type="button">Stop</button>
      <select id="lkCinemaTlCamera" title="Shot camera"></select>
      <button id="lkCinemaTlAddCut" type="button">Add shot</button>
      <button id="lkCinemaTlInsertCut" type="button" title="Split the current camera cut at the playhead">Insert cut</button>
      <button id="lkCinemaTlAppendCut" type="button" title="Append a camera cut after the last cut">Append</button>
      <button id="lkCinemaTlAddMarker" type="button" title="Add marker at current time">Add marker</button>
      <button id="lkCinemaTlAddEvent" type="button" title="Add gameplay/editor event at current time">Add event</button>
      <select id="lkCinemaTlObject" title="Animated target: object or camera"></select>
      <button id="lkCinemaTlAddObject" type="button" title="Add selected object or camera as an animated target">Add target</button>
      <button id="lkCinemaTlKeyObject" type="button" title="Key selected object or camera transform at the current time">Key selected</button>
      <button id="lkCinemaTlKeyLens" type="button" title="Key selected Scene Camera FOV at the current time">Key FOV</button>
      <button id="lkCinemaTlCurve" type="button" title="Edit selected key curves">∿</button>
      <button id="lkCinemaTlDuplicate" type="button" title="Duplicate selected timeline item">Duplicate</button>
      <button id="lkCinemaTlDelete" type="button" title="Delete selected timeline item">Delete</button>
      <button id="lkCinemaTlClose" type="button" title="Close sequencer">×</button>
    </div>
    <div id="lkCinemaTlBody">
      <div class="lk-cinema-row lk-cinema-ruler-row">
        <div class="lk-cinema-row-label">TIME</div>
        <div id="lkCinemaTlRuler" class="lk-cinema-row-lane lk-cinema-ruler"></div>
      </div>
      <div class="lk-cinema-row">
        <div class="lk-cinema-row-label">CAMERA CUTS</div>
        <div id="lkCinemaTlTrack" class="lk-cinema-row-lane"></div>
      </div>
      <div class="lk-cinema-row">
        <div class="lk-cinema-row-label">MARKERS</div>
        <div id="lkCinemaTlMarkerTrack" class="lk-cinema-row-lane"></div>
      </div>
      <div class="lk-cinema-row">
        <div class="lk-cinema-row-label">OBJECT KEYS</div>
        <div id="lkCinemaTlObjectTrack" class="lk-cinema-row-lane"></div>
      </div>
      <div class="lk-cinema-row">
        <div class="lk-cinema-row-label">CAMERA PARAMS</div>
        <div id="lkCinemaTlLensTrack" class="lk-cinema-row-lane"></div>
      </div>
      <div class="lk-cinema-row">
        <div class="lk-cinema-row-label">EVENTS</div>
        <div id="lkCinemaTlEventTrack" class="lk-cinema-row-lane"></div>
      </div>
      <button id="lkCinemaTlPlayhead" type="button" title="Current time"></button>
    </div>
    <div id="lkCinemaViewportHud"></div>
    <div id="lkCinemaCurvePanel">
      <span>Curve</span>
      <select id="lkCinemaCurveMode">
        <option value="linear">Linear</option>
        <option value="ease-in">Ease in</option>
        <option value="ease-out">Ease out</option>
        <option value="ease-in-out">Ease in/out</option>
        <option value="manual">Manual</option>
      </select>
    </div>
    <div id="lkCinemaClipPanel"></div>
  </div>
  <div id="lkPipFrame"><div class="lk-pip-title"><span>PLAYER CAMERA</span><button id="lkPipMinimize" type="button" title="Minimize camera preview">−</button></div><div id="lkPipResize"></div></div>
  <div id="lkCinemaPreviewFrame"><div class="lk-pip-title"><span>TIMELINE PREVIEW</span><button id="lkCinemaPreviewMinimize" type="button" title="Minimize timeline preview">−</button><button id="lkCinemaPreviewClose" type="button" title="Close timeline preview">×</button></div><div id="lkCinemaPreviewMeta"></div><div id="lkCinemaPreviewResize"></div></div>
  <div id="lkLevelsOverlay"><div class="lk-levels-panel">
    <div class="lk-levels-head"><div class="lk-levels-title">🗀 PROJECT LEVELS</div><div class="lk-levels-sub">stored locally</div><button id="lkLevelsClose" type="button">×</button></div>
    <div id="lkLevelsList"></div>
    <div class="lk-levels-foot"><button id="lkLevelsNew" type="button">New level</button><button id="lkLevelsFromFile" type="button">Load from file...</button></div>
  </div></div>
  <div id="lkProjectsOverlay"><div class="lk-levels-panel">
    <div class="lk-levels-head"><div class="lk-projects-title">🗂 PROJECTS</div><div class="lk-projects-sub">stored in this browser</div><div class="lk-projects-lang" role="group" aria-label="Editor language"><button data-project-lang="en" type="button" title="English">EN</button><button data-project-lang="it" type="button" title="Italiano">IT</button></div><button id="lkProjectsClose" type="button">×</button></div>
    <div id="lkProjectsList"></div>
    <div class="lk-levels-foot"><button id="lkProjectsNew" type="button">New project</button><button id="lkProjectsFromFile" type="button">Import project file...</button></div>
  </div></div>
  <div id="lkLevelLoading" aria-hidden="true">
    <div class="lk-level-loading-box" role="status" aria-live="polite">
      <div class="lk-level-loading-title">LOADING</div>
      <div id="lkLevelLoadingName">Preparing editor</div>
      <div class="lk-level-loading-bar"><span id="lkLevelLoadingFill"></span></div>
      <div id="lkLevelLoadingStep">Starting</div>
    </div>
  </div>
  <div id="lkConfirmOverlay"><div class="lk-confirm-box"><div id="lkConfirmTitle"></div><div id="lkConfirmMessage"></div><div class="lk-confirm-actions"><button id="lkConfirmCancel" type="button">Cancel</button><button id="lkConfirmOk" type="button">OK</button></div></div></div>
  <div id="lkPrefsOverlay"><div class="lk-prefs-panel">
    <div class="lk-prefs-head"><div><div class="lk-prefs-title">⚙ SETTINGS</div><div class="lk-prefs-sub" data-pref-i18n="prefsSub">editor preferences + project general settings</div></div><button id="lkPrefsClose" type="button">×</button></div>
    <div class="lk-prefs-tabs"><button data-prefs-tab="interface" class="on" type="button" data-pref-i18n="tabInterface">Interface</button><button data-prefs-tab="general" type="button" data-pref-i18n="tabGeneral">Project General</button><button data-prefs-tab="theme" type="button" data-pref-i18n="tabTheme">Theme</button><button data-prefs-tab="language" type="button" data-pref-i18n="tabLanguage">Language</button><button data-prefs-tab="controls" type="button" data-pref-i18n="tabControls">Game Input</button><button data-prefs-tab="editorKeys" type="button" data-pref-i18n="tabEditorKeys">Editor Keys</button><button data-prefs-tab="viewport" type="button" data-pref-i18n="tabViewport">Viewport</button></div>
    <div class="lk-prefs-body">
      <div data-prefs-sec="interface" class="lk-prefs-sec on"><label class="lk-prefs-row"><input id="lkPrefMusicPanel" type="checkbox" checked><span><b data-pref-i18n="musicPanelName">Menu music player</b><i data-pref-i18n="musicPanelDesc">Show the floating quick music player in the editor.</i></span></label></div>
      <div data-prefs-sec="general" class="lk-prefs-sec"><div class="lk-prefs-row"><span><b>Project General Settings</b><i>Shared Video, Audio, game input and gameplay settings. The same values drive the editor viewport, Play Preview, gameplay and playable exports.</i></span></div><button id="lkOpenProjectGeneral" class="lk-prefs-action" type="button">Open shared Video / Audio / Controls</button></div>
      <div data-prefs-sec="theme" class="lk-prefs-sec"><label class="lk-prefs-row"><input name="lkPrefTheme" type="radio" value="dark"><span><b data-pref-i18n="themeDark">Dark</b><i data-pref-i18n="themeDarkDesc">The current game-engine dark look.</i></span></label><label class="lk-prefs-row"><input name="lkPrefTheme" type="radio" value="light"><span><b data-pref-i18n="themeLight">Light</b><i data-pref-i18n="themeLightDesc">Bright panels, same layout.</i></span></label></div>
      <div data-prefs-sec="language" class="lk-prefs-sec"><label class="lk-prefs-row"><input name="lkPrefLang" type="radio" value="en"><span><b>English</b><i data-pref-i18n="langEnDesc">Default editor language.</i></span></label><label class="lk-prefs-row"><input name="lkPrefLang" type="radio" value="it"><span><b>Italiano</b><i data-pref-i18n="langItDesc">Main interface in Italian.</i></span></label></div>
      <div data-prefs-sec="controls" class="lk-prefs-sec"><div id="lkInputSettingsBody" class="lk-input-settings"></div></div>
      <div data-prefs-sec="editorKeys" class="lk-prefs-sec"><div class="lk-prefs-row"><span><b>Editor-only controls</b><i>These authoring mappings stay local and are never exported as game controls.</i></span></div><div class="lk-editor-keymap-summary"><label>Select <input data-editor-key="select" maxlength="1" value="Q"></label><label>Move <input data-editor-key="move" maxlength="1" value="W"></label><label>Rotate <input data-editor-key="rotate" maxlength="1" value="E"></label><label>Scale <input data-editor-key="scale" maxlength="1" value="R"></label><label>Focus <input data-editor-key="focus" maxlength="1" value="F"></label><span><b>Ctrl+Z/Y</b> Undo / Redo</span></div></div>
      <div data-prefs-sec="viewport" class="lk-prefs-sec"><label class="lk-prefs-row lk-prefs-color"><input id="lkPrefLetterbox" type="color" value="#141518"><span><b data-pref-i18n="letterboxName">Frame background</b><i data-pref-i18n="letterboxDesc">Colour outside the player-camera frame (letterbox / crop). Saved with the level.</i></span></label></div>
    </div>
	  </div></div>
	  <div id="lkCtx"></div>
	  <div id="lkPluginPanel" class="lk-plugin-panel" aria-hidden="true">
	    <div class="lk-plugin-head">
	      <div><b>Plugins</b><span>Built-in and extension modules</span></div>
	      <button id="lkPluginClose" type="button" title="Close">×</button>
	    </div>
	    <div id="lkPluginList" class="lk-plugin-list"></div>
	  </div>
	  <div id="lkLogicProfilerPanel" class="lk-plugin-panel lk-logic-profiler-panel" aria-hidden="true">
	    <div class="lk-plugin-head">
	      <div><b>Logic Profiler</b><span>Runtime stats from active Logic Element graphs</span></div>
	      <button id="lkLogicProfilerRefresh" type="button" title="Refresh">↻</button>
	      <button id="lkLogicProfilerClose" type="button" title="Close">×</button>
	    </div>
	    <div id="lkLogicProfilerBody" class="lk-plugin-list"></div>
	  </div>
	  <input id="lkAssetInput" type="file" accept=".glb,.gltf,image/png,image/jpeg,image/webp,image/gif,image/avif" multiple hidden>
  <input id="lkGlbInput" type="file" accept=".glb,.gltf,image/png,image/jpeg,image/webp,image/gif,image/avif" hidden>
  <input id="lkReplaceInput" type="file" accept=".glb,.gltf" hidden>
  <input id="lkPlayerModelInput" type="file" accept=".glb,.gltf" hidden>
  <input id="lkProjectInput" type="file" accept=".json,.lkep" hidden>
`;
}

window.LK_EDITOR_TEMPLATE = Object.freeze({create});
})();
