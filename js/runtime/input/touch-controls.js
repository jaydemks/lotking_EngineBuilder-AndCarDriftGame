/* =========================================================
   LOT KING — TOUCH CONTROLS
   On-screen driving UI for mobile/coarse-pointer play. Writes into
   the input manager's touch source. Shown only while touch input is
   enabled (auto on coarse pointers, or toggled from the Controls menu).
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const manager = deps.manager;
  const mount = deps.mount || document.body;
  const isRuntimeVisible = typeof deps.isRuntimeVisible === 'function' ? deps.isRuntimeVisible : () => true;
  if(!manager || !manager.touchSource) return null;
  const touch = manager.touchSource;

  const root = document.createElement('div');
  root.id = 'lkTouchControls';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<div class="lk-touch-steer" data-touch="steer">' +
      '<div class="lk-touch-steer-track"><div class="lk-touch-steer-thumb"></div></div>' +
      '<div class="lk-touch-hint">STEER</div>' +
    '</div>' +
    '<div class="lk-touch-pedals">' +
      '<button class="lk-touch-btn lk-touch-hb" data-touch="handbrake" type="button">e-brake</button>' +
      '<button class="lk-touch-btn lk-touch-brake" data-touch="brake" type="button">brake</button>' +
      '<button class="lk-touch-btn lk-touch-gas" data-touch="throttle" type="button">gas</button>' +
    '</div>';
  mount.appendChild(root);

  const steerZone = root.querySelector('.lk-touch-steer');
  const steerThumb = root.querySelector('.lk-touch-steer-thumb');
  let frameRect = null;

  // --- steering: horizontal drag inside the pad, auto-centers on release ---
  let steerPointer = null;
  let steerOrigin = 0;
  function steerRange(){ return Math.max(60, steerZone.clientWidth * 0.4); }
  function setSteer(v){
    // Runtime steering convention is left-positive, while the visual slider is right-positive.
    touch.set({steer: -v});
    steerThumb.style.transform = 'translateX(' + (v * 42) + '%)';
  }
  steerZone.addEventListener('pointerdown', e => {
    steerPointer = e.pointerId;
    steerOrigin = e.clientX;
    steerZone.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  steerZone.addEventListener('pointermove', e => {
    if(e.pointerId !== steerPointer) return;
    const dx = e.clientX - steerOrigin;
    setSteer(Math.max(-1, Math.min(1, dx / steerRange())));
  });
  function endSteer(e){
    if(e.pointerId !== steerPointer) return;
    steerPointer = null;
    setSteer(0);
  }
  steerZone.addEventListener('pointerup', endSteer);
  steerZone.addEventListener('pointercancel', endSteer);

  // --- pedals: held while pressed ---
  function bindHold(sel, apply){
    const btn = root.querySelector(sel);
    if(!btn) return;
    const press = e => { apply(true); btn.classList.add('on'); e.preventDefault(); };
    const release = e => { apply(false); btn.classList.remove('on'); if(e) e.preventDefault(); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('pointercancel', release);
  }
  bindHold('.lk-touch-gas', v => touch.set({throttle: v ? 1 : 0}));
  bindHold('.lk-touch-brake', v => touch.set({brake: v ? 1 : 0}));
  bindHold('.lk-touch-hb', v => touch.set({handbrake: !!v}));

  function refresh(){
    const on = manager.isTouchEnabled() && isRuntimeVisible();
    root.classList.toggle('on', on);
    document.body.classList.toggle('lk-touch-active', on);
    root.setAttribute('aria-hidden', on ? 'false' : 'true');
    if(!on){ touch.clear(); setSteer(0); }
  }
  function setFrameRect(rect){
    frameRect = rect || null;
    if(frameRect){
      root.style.left = Math.round(frameRect.x || 0) + 'px';
      root.style.top = Math.round(frameRect.y || 0) + 'px';
      root.style.width = Math.round(frameRect.w || window.innerWidth) + 'px';
      root.style.height = Math.round(frameRect.h || window.innerHeight) + 'px';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    } else {
      root.style.left = '0px';
      root.style.top = '0px';
      root.style.width = '100vw';
      root.style.height = '100vh';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    }
    refresh();
  }
  manager.onChange(refresh);
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  document.addEventListener('visibilitychange', refresh);
  const refreshTimer = window.setInterval(refresh, 250);
  setFrameRect(null);
  refresh();

  return {root, refresh, setFrameRect, destroy:() => window.clearInterval(refreshTimer)};
}

window.LK_RUNTIME_TOUCH_CONTROLS = Object.freeze({create});
})();
