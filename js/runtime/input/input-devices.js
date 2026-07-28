/* =========================================================
   LOT KING — INPUT DEVICES (raw sources)
   Thin wrappers over the physical inputs. Each source only reports
   raw state; binding resolution lives in input-actions.js.
     · keyboard  → physical e.code down-set (+ synthetic Mouse0..4 codes)
     · gamepad   → navigator.getGamepads() snapshot per pad
     · touch     → axes written by the on-screen touch UI
   ========================================================= */
(function(){
'use strict';

// --- keyboard: tracks pressed physical codes (KeyW, ArrowUp, Space, …) ---
// Mouse buttons join the same down-set as synthetic `Mouse<n>` codes. They are
// unbound in every default scheme except the on-foot combat actions, so nothing
// that existed before this addition can start reacting to a click.
function createKeyboardSource(){
  const down = Object.create(null);
  const MOUSE_BUTTONS = 5;

  function isTypingTarget(t){
    if(!t || !t.tagName) return false;
    const tag = t.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }
  function isUiTarget(t){
    if(!t || !t.closest) return false;
    return !!t.closest('input, textarea, select, button, #lkEditor, #settingsOverlay, #tunePanel, #radio, #overlay');
  }

  // Keys pressed as part of a browser shortcut (Ctrl+W, Ctrl+T, Alt+Tab...) are
  // handled above the page: the combo is swallowed and the keyup for the letter
  // never arrives, which would leave the action latched on forever. The default
  // schemes avoid modifiers for exactly this reason, but a player can rebind
  // anything, so the source refuses to latch a modified key it was not asked
  // for and clears whatever the modifier already caught.
  function isShortcut(e){ return (e.ctrlKey || e.metaKey || e.altKey) && e.code.length > 0 && !isModifierCode(e.code); }
  function isModifierCode(code){
    return code === 'ControlLeft' || code === 'ControlRight' || code === 'AltLeft' || code === 'AltRight' ||
      code === 'MetaLeft' || code === 'MetaRight' || code === 'ShiftLeft' || code === 'ShiftRight';
  }
  function onDown(e){
    if(isTypingTarget(e.target)) return;   // don't latch driving keys while typing
    if(isShortcut(e)){ down[e.code] = false; return; }
    down[e.code] = true;
    if((e.code === 'AltLeft' || e.code === 'AltRight') && typeof document !== 'undefined' &&
       document.pointerLockElement && e.preventDefault) e.preventDefault();
  }
  function onUp(e){ down[e.code] = false; }
  function onBlur(){ for(const k in down) down[k] = false; }

  function onMouseDown(e){
    if(isTypingTarget(e.target) || isUiTarget(e.target)) return;
    down['Mouse' + e.button] = true;
  }
  function onMouseUp(e){ down['Mouse' + e.button] = false; }
  function clearMouse(){ for(let i = 0; i < MOUSE_BUTTONS; i++) down['Mouse' + i] = false; }

  // Not passive: Alt on its own moves focus to the browser menu bar on Windows,
  // which drops every held key mid-game. It is cancelled only while the page
  // actually holds pointer lock, so the editor and every ordinary page keep it.
  window.addEventListener('keydown', onDown, {passive: false});
  window.addEventListener('keyup', onUp, {passive: true});
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousedown', onMouseDown, {passive: true});
  window.addEventListener('mouseup', onMouseUp, {passive: true});
  // A pointer that leaves the document never reports its mouseup. The module
  // otherwise only touches `window`, so document listeners stay optional and
  // it keeps working in a DOM-less host.
  window.addEventListener('mouseleave', clearMouse);
  if(typeof document !== 'undefined' && document.addEventListener){
    document.addEventListener('pointerlockchange', clearMouse);
    document.addEventListener('visibilitychange', () => { if(document.hidden) onBlur(); });
  }

  return {
    type: 'keyboard',
    id: 'keyboard',
    isCodeDown: code => !!down[code],
    connected: () => true,
    clear: onBlur,
  };
}

// --- gamepad: one source object, snapshot refreshed each frame via poll() ---
function createGamepadSource(index, initialPad){
  let pad = initialPad || null;

  function poll(snapshot){
    if(snapshot){
      pad = snapshot;
      return true;
    }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    pad = pads && pads[index] ? pads[index] : null;
    return !!pad;
  }

  // Standard-mapping pads (Xbox, DualShock, most controllers surfaced by
  // Chrome/Edge/Firefox) expose the canonical axis/button layout our default
  // bindings assume — same as Steam and most browser games.
  function shortName(){
    if(!pad) return 'Gamepad ' + index;
    // strip the "(Vendor: xxxx Product: yyyy)" suffix browsers append
    return String(pad.id).replace(/\s*\((?:STANDARD GAMEPAD\s*)?Vendor.*$/i, '').trim() || ('Gamepad ' + index);
  }

  return {
    type: 'gamepad',
    id: 'gamepad-' + index,
    index,
    poll,
    connected: () => !!pad,
    label: shortName,
    standard: () => !!(pad && pad.mapping === 'standard'),
    axis: i => (pad && pad.axes && pad.axes[i] != null) ? pad.axes[i] : 0,
    button: i => (pad && pad.buttons && pad.buttons[i]) ? pad.buttons[i].value : 0,
    pressed: i => !!(pad && pad.buttons && pad.buttons[i] && pad.buttons[i].pressed),
    raw: () => pad,
  };
}

// --- touch: passive state container fed by the on-screen touch UI ---
function createTouchSource(){
  const axes = {steer: 0, throttle: 0, brake: 0, handbrake: false, reset: false};
  return {
    type: 'touch',
    id: 'touch',
    axes,
    connected: () => true,
    set: patch => Object.assign(axes, patch || {}),
    clear: () => { axes.steer = 0; axes.throttle = 0; axes.brake = 0; axes.handbrake = false; axes.reset = false; },
  };
}

window.LK_RUNTIME_INPUT_DEVICES = Object.freeze({
  createKeyboardSource,
  createGamepadSource,
  createTouchSource,
});
})();
