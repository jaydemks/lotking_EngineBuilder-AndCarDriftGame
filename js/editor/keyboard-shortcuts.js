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
  const setProjectsOverlayOpen = deps.setProjectsOverlayOpen || function(){};
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
  const requestDeleteSelection = deps.requestDeleteSelection || function(){ requestDeleteEntity(ED.selected); };

  function onKeyDown(e){
    if(!ED.active) return;
    if(ED.playPreview){
      if(e.key === 'F8' || (e.shiftKey && e.key.toLowerCase() === 'escape')){
        e.preventDefault();
        stopPlayPreview();
      }
      return;
    }
    if(ED.simulatePreview && (e.key === 'F8' || (e.shiftKey && e.key.toLowerCase() === 'escape'))){
      e.preventDefault();
      stopPlayPreview();
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    const key = e.key.toLowerCase();
    if(ED.simulatePreview && !typing && key === 'tab'){
      e.preventDefault();
      return;
    }
    fly.keys[key] = true;
    fly.keys['shift'] = e.shiftKey;
    if(e.key === 'F10'){ e.preventDefault(); setPrefsOpen(!ED.prefsOpen); return; }
    if(key === 'escape'){
      e.preventDefault();
      closeMenu();
      if(ED.prefsOpen){ setPrefsOpen(false); return; }
      if(ED.projectsOpen){ setProjectsOverlayOpen(false); return; }
      if(ED.levelsOpen){ setLevelsOverlayOpen(false); return; }
      if(document.getElementById('settingsOverlay').classList.contains('open')) GAME.actions.closePause();
      else GAME.actions.openPause('editor', {source: 'keyboard'});
      return;
    }
    if(typing) return;
    if(fly.rmb) { e.preventDefault(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if(mod && key === 's'){ e.preventDefault(); e.shiftKey ? saveAsTrack() : saveScene({projectFile:true}); return; }
    if(mod && key === 'p'){ e.preventDefault(); setProjectsOverlayOpen(!ED.projectsOpen); return; }
    if(mod && key === 'o'){ e.preventDefault(); setLevelsOverlayOpen(!ED.levelsOpen); return; }
    if(mod && e.altKey && key === 'n'){ e.preventDefault(); newTrack(); return; }
    if(mod && key === 'd'){
      e.preventDefault();
      const list = Array.isArray(ED.multiSelected) && ED.multiSelected.length > 1 ? ED.multiSelected.slice() : [ED.selected];
      list.filter(Boolean).forEach(obj => duplicateEntity(obj));
      return;
    }
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
      case 'delete': case 'backspace': requestDeleteSelection(); break;
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
