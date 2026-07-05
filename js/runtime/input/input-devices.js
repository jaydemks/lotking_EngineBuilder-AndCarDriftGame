/* =========================================================
   LOT KING — INPUT DEVICES (raw sources)
   Thin wrappers over the physical inputs. Each source only reports
   raw state; binding resolution lives in input-actions.js.
     · keyboard  → physical e.code down-set
     · gamepad   → navigator.getGamepads() snapshot per pad
     · touch     → axes written by the on-screen touch UI
   ========================================================= */
(function(){
'use strict';

// --- keyboard: tracks pressed physical codes (KeyW, ArrowUp, Space, …) ---
function createKeyboardSource(){
  const down = Object.create(null);

  function isTypingTarget(t){
    if(!t || !t.tagName) return false;
    const tag = t.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
  }

  function onDown(e){
    if(isTypingTarget(e.target)) return;   // don't latch driving keys while typing
    down[e.code] = true;
  }
  function onUp(e){ down[e.code] = false; }
  function onBlur(){ for(const k in down) down[k] = false; }

  window.addEventListener('keydown', onDown, {passive: true});
  window.addEventListener('keyup', onUp, {passive: true});
  window.addEventListener('blur', onBlur);

  return {
    type: 'keyboard',
    id: 'keyboard',
    isCodeDown: code => !!down[code],
    connected: () => true,
    clear: onBlur,
  };
}

// --- gamepad: one source object, snapshot refreshed each frame via poll() ---
function createGamepadSource(index){
  let pad = null;

  function poll(){
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
