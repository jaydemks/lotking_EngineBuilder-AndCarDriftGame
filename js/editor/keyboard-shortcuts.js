/* =========================================================
   LOT KING — EDITOR KEYBOARD SHORTCUTS
   Global editor hotkeys and fly-key bookkeeping.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const ED = deps.ED || {};
  const fly = deps.fly || {keys:{}};
  const GAME = deps.GAME || {};
  const closeMenu = deps.closeMenu || function(){};
  const setPrefsOpen = deps.setPrefsOpen || function(){};
  const setLevelsOverlayOpen = deps.setLevelsOverlayOpen || function(){};
  const stopPlayPreview = deps.stopPlayPreview || function(){};
  const saveAsTrack = deps.saveAsTrack || function(){};
  const saveScene = deps.saveScene || function(){};
  const newTrack = deps.newTrack || function(){};
  const duplicateEntity = deps.duplicateEntity || function(){};
  const undo = deps.undo || function(){};
  const redo = deps.redo || function(){};
  const applyLastTransform = deps.applyLastTransform || function(){};
  const setTool = deps.setTool || function(){};
  const focusSelected = deps.focusSelected || function(){};
  const setGrid = deps.setGrid || function(){};
  const requestDeleteEntity = deps.requestDeleteEntity || function(){};

  function onKeyDown(e){
    if(!ED.active) return;
    if(ED.playPreview){
      if(e.key.toLowerCase() === 'escape'){
        e.preventDefault();
        stopPlayPreview();
      }
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    const key = e.key.toLowerCase();
    fly.keys[key] = true;
    fly.keys['shift'] = e.shiftKey;
    if(e.key === 'F10'){ e.preventDefault(); setPrefsOpen(!ED.prefsOpen); return; }
    if(key === 'escape'){
      e.preventDefault();
      closeMenu();
      if(ED.prefsOpen){ setPrefsOpen(false); return; }
      if(ED.levelsOpen){ setLevelsOverlayOpen(false); return; }
      if(document.getElementById('settingsOverlay').classList.contains('open')) GAME.actions.closePause();
      else GAME.actions.openPause('editor');
      return;
    }
    if(typing) return;
    if(fly.rmb) { e.preventDefault(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if(mod && key === 's'){ e.preventDefault(); e.shiftKey ? saveAsTrack() : saveScene(); return; }
    if(mod && key === 'o'){ e.preventDefault(); setLevelsOverlayOpen(!ED.levelsOpen); return; }
    if(mod && e.altKey && key === 'n'){ e.preventDefault(); newTrack(); return; }
    if(mod && key === 'd'){ e.preventDefault(); duplicateEntity(ED.selected); return; }
    if(mod && key === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if(mod && key === 'y'){ e.preventDefault(); redo(); return; }
    if(mod && key === 'r'){ e.preventDefault(); applyLastTransform(); return; }
    switch(key){
      case 'q': setTool('select'); break;
      case 'w': setTool('translate'); break;
      case 'e': setTool('rotate'); break;
      case 'r': setTool('scale'); break;
      case 'f': focusSelected(); break;
      case 'g': setGrid(!ED.gridOn); break;
      case 'delete': case 'backspace': requestDeleteEntity(ED.selected); break;
    }
  }
  function onKeyUp(e){
    fly.keys[e.key.toLowerCase()] = false;
    fly.keys['shift'] = e.shiftKey;
  }
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  return Object.freeze({onKeyDown, onKeyUp});
}

window.LK_EDITOR_KEYBOARD_SHORTCUTS = Object.freeze({create});
})();
