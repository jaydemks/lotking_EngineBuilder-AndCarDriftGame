/* =========================================================
   LOT KING — EDITOR TEMPLATE
   Static editor chrome markup, kept separate from runtime logic.
   ========================================================= */
(function(){
'use strict';

function create(){
  return `
  <div id="lkTopbar">
    <button id="lkLogoBtn" class="lk-logo" type="button" title="Editor settings">⚙ ENGINE EDITOR</button>
    <div class="lk-tools">
      <button data-tool="select" type="button" title="Select (Q)">☝</button>
      <button data-tool="translate" type="button" title="Move (W)">✥</button>
      <button data-tool="rotate" type="button" title="Rotate (E)">⟳</button>
      <button data-tool="scale" type="button" title="Scale (R)">⤢</button>
    </div>
    <button id="lkSpace" type="button" title="Cambia spazio: World Z-up / Local Z-up / Engine Y-up">🌐 World Z-up</button>
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
    <button id="lkExit" type="button" title="Exit editor">×</button>
  </div>
  <aside id="lkLeft">
    <div id="lkLeftResize" class="lk-resize-handle"></div>
    <div class="lk-panelhead">SCENE</div>
    <div class="lk-left-tabs"><button id="lkSceneTab" class="on" type="button">Scene</button></div>
    <div class="lk-outliner-tools">
      <input id="lkSearch" type="search" placeholder="search...">
      <select id="lkFilter">
        <option value="all">All</option><option value="mesh">Meshes</option><option value="light">Lights</option>
        <option value="effect">Effects</option><option value="added">Added</option><option value="builtin">Built-in</option>
      </select>
      <button id="lkViewGrid" type="button" title="Grid view">▦</button>
      <button id="lkViewList" class="on" type="button" title="List view">☰</button>
      <button id="lkSceneFolder" type="button" title="New scene folder">📁</button>
    </div>
    <div id="lkPinned">
      <div class="lk-pin" data-special="env"><span class="lk-pin-ic">🌍</span><span class="lk-pin-label">Environment</span></div>
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
      <button id="lkAssetFolder" type="button">Folder</button>
      <button id="lkAssetRefresh" type="button">Refresh</button>
      <span id="lkAssetsFilters">
        <label><input data-asset-filter="blueprint" type="checkbox" checked> player car logic</label>
        <label><input data-asset-filter="sound" type="checkbox" checked> sound</label>
        <label><input data-asset-filter="levels" type="checkbox" checked> levels</label>
        <label><input data-asset-filter="glb" type="checkbox" checked> glb</label>
        <label><input data-asset-filter="scene" type="checkbox" checked> scene</label>
        <label><input data-asset-filter="texture" type="checkbox" checked> texture</label>
        <label><input data-asset-filter="light" type="checkbox" checked> light</label>
        <label><input data-asset-filter="effect" type="checkbox" checked> effect</label>
        <label><input data-asset-filter="other" type="checkbox" checked> other</label>
      </span>
    </div>
    <div id="lkAssetsPanel" class="grid"></div>
  </section>
  <div id="lkStatus">
    <b>Lot King Engine Editor</b>
    <span class="lk-status-help"><b>LMB</b> seleziona/orbita · <b>RMB drag</b> vola · <b>RMB click</b> menu rapido · <b>MMB</b> pan · <b>Wheel</b> zoom/velocità volo · <b>Q/W/E/R</b> select/move/rotate/scale · <b>Ctrl+Z/Y</b> undo/redo · <b>Ctrl+R</b> ripeti trasformazione · <b>Ctrl+D</b> duplica · <b>Del</b> elimina</span>
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
  <div id="lkPipFrame"><div class="lk-pip-title">PLAYER CAMERA</div><div id="lkPipResize"></div></div>
  <div id="lkLevelsOverlay"><div class="lk-levels-panel">
    <div class="lk-levels-head"><div class="lk-levels-title">🗀 PROJECT LEVELS</div><div class="lk-levels-sub">stored locally</div><button id="lkLevelsClose" type="button">×</button></div>
    <div id="lkLevelsList"></div>
    <div class="lk-levels-foot"><button id="lkLevelsNew" type="button">New level</button><button id="lkLevelsFromFile" type="button">Load from file...</button></div>
  </div></div>
  <div id="lkLevelLoading" aria-hidden="true">
    <div class="lk-level-loading-box" role="status" aria-live="polite">
      <div class="lk-level-loading-title">LOADING</div>
      <div id="lkLevelLoadingName">Preparing editor</div>
      <div class="lk-level-loading-bar"><span id="lkLevelLoadingFill"></span></div>
      <div id="lkLevelLoadingStep">Avvio</div>
    </div>
  </div>
  <div id="lkConfirmOverlay"><div class="lk-confirm-box"><div id="lkConfirmTitle"></div><div id="lkConfirmMessage"></div><div class="lk-confirm-actions"><button id="lkConfirmCancel" type="button">Cancel</button><button id="lkConfirmOk" type="button">OK</button></div></div></div>
  <div id="lkPrefsOverlay"><div class="lk-prefs-panel">
    <div class="lk-prefs-head"><div><div class="lk-prefs-title">⚙ SETTINGS</div><div class="lk-prefs-sub" data-pref-i18n="prefsSub">preferences saved locally</div></div><button id="lkPrefsClose" type="button">×</button></div>
    <div class="lk-prefs-tabs"><button data-prefs-tab="interface" class="on" type="button" data-pref-i18n="tabInterface">Interface</button><button data-prefs-tab="theme" type="button" data-pref-i18n="tabTheme">Theme</button><button data-prefs-tab="language" type="button" data-pref-i18n="tabLanguage">Language</button><button data-prefs-tab="controls" type="button" data-pref-i18n="tabControls">Controls</button><button data-prefs-tab="viewport" type="button" data-pref-i18n="tabViewport">Viewport</button></div>
    <div class="lk-prefs-body">
      <div data-prefs-sec="interface" class="lk-prefs-sec on"><label class="lk-prefs-row"><input id="lkPrefMusicPanel" type="checkbox" checked><span><b data-pref-i18n="musicPanelName">Menu music player</b><i data-pref-i18n="musicPanelDesc">Show the floating quick music player in the editor.</i></span></label></div>
      <div data-prefs-sec="theme" class="lk-prefs-sec"><label class="lk-prefs-row"><input name="lkPrefTheme" type="radio" value="dark"><span><b data-pref-i18n="themeDark">Dark</b><i data-pref-i18n="themeDarkDesc">The current game-engine dark look.</i></span></label><label class="lk-prefs-row"><input name="lkPrefTheme" type="radio" value="light"><span><b data-pref-i18n="themeLight">Light</b><i data-pref-i18n="themeLightDesc">Bright panels, same layout.</i></span></label></div>
      <div data-prefs-sec="language" class="lk-prefs-sec"><label class="lk-prefs-row"><input name="lkPrefLang" type="radio" value="en"><span><b>English</b><i data-pref-i18n="langEnDesc">Default editor language.</i></span></label><label class="lk-prefs-row"><input name="lkPrefLang" type="radio" value="it"><span><b>Italiano</b><i data-pref-i18n="langItDesc">Main interface in Italian.</i></span></label></div>
      <div data-prefs-sec="controls" class="lk-prefs-sec"><div id="lkInputSettingsBody" class="lk-input-settings"></div></div>
      <div data-prefs-sec="viewport" class="lk-prefs-sec"><label class="lk-prefs-row lk-prefs-color"><input id="lkPrefLetterbox" type="color" value="#141518"><span><b data-pref-i18n="letterboxName">Frame background</b><i data-pref-i18n="letterboxDesc">Colour outside the player-camera frame (letterbox / crop). Saved with the level.</i></span></label></div>
    </div>
  </div></div>
  <div id="lkCtx"></div>
  <input id="lkAssetInput" type="file" accept=".glb,.gltf" multiple hidden>
  <input id="lkGlbInput" type="file" accept=".glb,.gltf" hidden>
  <input id="lkReplaceInput" type="file" accept=".glb,.gltf" hidden>
  <input id="lkPlayerModelInput" type="file" accept=".glb,.gltf" hidden>
  <input id="lkProjectInput" type="file" accept=".json,.lkep" hidden>
`;
}

window.LK_EDITOR_TEMPLATE = Object.freeze({create});
})();
