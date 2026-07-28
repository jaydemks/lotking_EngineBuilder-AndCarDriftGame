/* =========================================================
   LOT KING — First / third person shooter HUD

   The full player readout for a possessed character Pawn:

     crosshair + hit marker     where the shot goes and whether it landed
     ammo + weapon + loadout    what is in hand and what else is carried
     health / armour / stamina  the vitals block
     radar                      a top-down minimap of walls, items and targets
     prompts                    what Use and Pick Up would do right now
     toasts + damage vignette   feedback for pickups and for being hit

   TWO THINGS THIS FILE IS STRICT ABOUT:

   1. It mounts INSIDE #hud. That element is already positioned onto the exact
      rectangle the camera renders into (letterbox, split screen, or the editor
      viewport), so "centre of the screen" and "centre of the view" are the same
      point by construction. A fixed, window-centred overlay drifts off the
      crosshair the moment the render rect is not the whole window — which is
      always true in the editor.

   2. It is a PLAY overlay. Nothing renders while the editor is in edit mode;
      only a running session or Play Preview shows it.

   It reads the rig through LK_RUNTIME_FIRST_PERSON and never writes to it.
   Removing this script removes the HUD and nothing else.
   ========================================================= */
(function(){
'use strict';

const HIT_MARKER_MS = 140;
const KILL_MARKER_MS = 320;
const TOAST_SECONDS = 2.4;
const RADAR_RANGE = 34;          // metres from edge to edge of the radar disc

function el(tag, className, text){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text != null) node.textContent = text;
  return node;
}
function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }

function create(GAME){
  let root = null;
  let crosshair = null, marker = null, radar = null, radarCtx = null;
  let ammoValue = null, ammoReserve = null, ammoState = null, weaponName = null, loadout = null, packList = null;
  let healthFill = null, healthValue = null, armorFill = null, armorRow = null, staminaFill = null, staminaRow = null;
  let usePrompt = null, takePrompt = null, toasts = null, vignette = null, abilityChip = null;
  let scope = null, scopeZoom = null, takeKey = null;
  let markerTimer = 0;
  let vignetteTimer = 0;
  let visible = false;
  const live = [];               // active toasts
  // The HUD updates every frame but its values change rarely. Caching the last
  // written value keeps the frame free of redundant DOM and style writes.
  const shown = {};

  function build(){
    if(root) return root;
    root = el('div', 'lk-fps-hud');
    root.setAttribute('aria-hidden', 'true');

    crosshair = el('div', 'lk-fps-crosshair');
    ['t', 'r', 'b', 'l'].forEach(side => crosshair.appendChild(el('i', 'lk-fps-tick lk-fps-tick-' + side)));
    crosshair.appendChild(el('u', 'lk-fps-dot'));
    marker = el('div', 'lk-fps-marker');
    ['a', 'b', 'c', 'd'].forEach(part => marker.appendChild(el('i', 'lk-fps-marker-' + part)));

    const ammo = el('div', 'lk-fps-ammo');
    weaponName = el('strong');
    const counts = el('div', 'lk-fps-ammo-counts');
    ammoValue = el('b');
    ammoReserve = el('span');
    ammoState = el('em');
    counts.appendChild(ammoValue); counts.appendChild(ammoReserve); counts.appendChild(ammoState);
    loadout = el('div', 'lk-fps-loadout');
    packList = el('div', 'lk-fps-pack');
    ammo.appendChild(weaponName); ammo.appendChild(counts); ammo.appendChild(loadout); ammo.appendChild(packList);

    const vitals = el('div', 'lk-fps-vitals');
    const healthRow = el('div', 'lk-fps-bar lk-fps-health');
    healthFill = el('i');
    healthValue = el('b');
    healthRow.appendChild(healthFill); healthRow.appendChild(healthValue);
    armorRow = el('div', 'lk-fps-bar lk-fps-armor');
    armorFill = el('i');
    armorRow.appendChild(armorFill);
    staminaRow = el('div', 'lk-fps-bar lk-fps-stamina');
    staminaFill = el('i');
    staminaRow.appendChild(staminaFill);
    abilityChip = el('div', 'lk-fps-ability');
    vitals.appendChild(healthRow); vitals.appendChild(armorRow); vitals.appendChild(staminaRow); vitals.appendChild(abilityChip);

    radar = el('canvas', 'lk-fps-radar');
    radar.width = 220; radar.height = 220;
    radarCtx = radar.getContext ? radar.getContext('2d') : null;

    usePrompt = el('div', 'lk-fps-prompt lk-fps-prompt-use');
    takePrompt = el('div', 'lk-fps-prompt lk-fps-prompt-take');
    toasts = el('div', 'lk-fps-toasts');
    vignette = el('div', 'lk-fps-vignette');

    // Telescopic sight. Four stacked layers, all pure CSS so it costs no render
    // target: the black surround with the lens cut out of it, the glass itself
    // (edge darkening and the chromatic ring that reads as curvature), the
    // reticle, and the magnification readout.
    scope = el('div', 'lk-fps-scope');
    scope.appendChild(el('i', 'lk-fps-scope-glass'));
    scope.appendChild(el('i', 'lk-fps-scope-edge'));
    const reticle = el('div', 'lk-fps-scope-reticle');
    ['v', 'h'].forEach(axis => reticle.appendChild(el('i', 'lk-fps-scope-line lk-fps-scope-line-' + axis)));
    for(let dot = 0; dot < 8; dot++) reticle.appendChild(el('u', 'lk-fps-scope-dot lk-fps-scope-dot-' + dot));
    scope.appendChild(reticle);
    scopeZoom = el('div', 'lk-fps-scope-zoom');
    scope.appendChild(scopeZoom);

    [vignette, crosshair, marker, scope, takePrompt, usePrompt, ammo, vitals, radar, toasts].forEach(node => root.appendChild(node));
    mount();
    return root;
  }

  // #hud carries the rendered camera rectangle. Falling back to <body> keeps
  // the HUD alive in the rare configuration where that element is absent.
  function mount(){
    const host = document.getElementById('hud') || document.body;
    if(root.parentNode === host) return;
    host.appendChild(root);
  }

  function api(){ return window.LK_RUNTIME_FIRST_PERSON || null; }
  function activeRig(){
    const runtime = api();
    return runtime && runtime.activeRig ? runtime.activeRig(GAME, 1) : null;
  }
  function activePawn(){
    const runtime = api();
    return runtime && runtime.activePawn ? runtime.activePawn(GAME, 1) : null;
  }

  // Edit mode has no player; Play Preview and a running session do.
  function playing(){
    const state = GAME && GAME.state;
    if(!state) return false;
    if(state.editorActive && !state.editorPreview) return false;
    return true;
  }

  function setVisible(next){
    if(next === visible) return;
    visible = next;
    build().classList.toggle('on', next);
  }

  function write(key, value, apply){
    if(shown[key] === value) return false;
    shown[key] = value;
    apply(value);
    return true;
  }

  function flashMarker(kind){
    if(!root) return;
    marker.classList.remove('kill');
    if(kind === 'kill') marker.classList.add('kill');
    marker.classList.add('on');
    markerTimer = kind === 'kill' ? KILL_MARKER_MS / 1000 : HIT_MARKER_MS / 1000;
  }

  function toast(text, tone){
    if(!root || !text) return;
    const node = el('div', 'lk-fps-toast' + (tone ? ' ' + tone : ''), text);
    toasts.appendChild(node);
    live.push({node, time:TOAST_SECONDS});
    while(live.length > 5){
      const oldest = live.shift();
      if(oldest.node.parentNode) oldest.node.parentNode.removeChild(oldest.node);
    }
  }

  // --- sections -----------------------------------------------------------

  function updateWeapon(rig, pawn){
    const ammo = rig.ammo();
    const inventory = pawn && pawn.inventory;
    root.classList.toggle('unarmed', ammo.armed === false);
    write('weapon', ammo.armed ? ammo.name : '—', value => { weaponName.textContent = value; });
    write('ammo', ammo.armed ? ammo.ammo : -1, () => { ammoValue.textContent = ammo.armed ? String(ammo.ammo) : '–'; });
    const reserve = !ammo.armed ? '' : (ammo.infinite ? '∞' : String(ammo.reserve));
    write('reserve', reserve, value => { ammoReserve.textContent = value; });
    const label = !ammo.armed ? 'UNARMED' : (ammo.reloading ? 'RELOADING' : (ammo.ammo === 0 ? 'EMPTY' : ''));
    write('state', label, value => {
      ammoState.textContent = value;
      root.classList.toggle('reloading', ammo.reloading === true);
      root.classList.toggle('empty', ammo.armed && ammo.ammo === 0 && !ammo.reloading);
    });
    if(!inventory) return;
    const signature = inventory.slots().map(entry => entry.weapon.name).join('|') + '#' + inventory.index();
    write('loadout', signature, () => {
      loadout.textContent = '';
      inventory.slots().forEach((entry, index) => {
        loadout.appendChild(el('span', index === inventory.index() ? 'on' : '', entry.weapon.name));
      });
    });
    // Only a backpack inventory has a pack; the other modes never render a row.
    const stored = inventory.pack ? inventory.pack() : [];
    write('pack', stored.map(entry => entry.kind).join(',') + '#' + stored.length, () => {
      packList.textContent = '';
      packList.classList.toggle('on', stored.length > 0);
      const counts = {};
      stored.forEach(entry => { counts[entry.kind] = (counts[entry.kind] || 0) + 1; });
      Object.keys(counts).forEach(kind => {
        packList.appendChild(el('span', kind, counts[kind] + '× ' + kind));
      });
    });
  }

  function updateVitals(pawn){
    const vitals = pawn && pawn.vitals;
    root.classList.toggle('no-vitals', !vitals);
    if(!vitals) return;
    const snapshot = vitals.snapshot();
    const health = clamp(snapshot.health / Math.max(1, snapshot.maxHealth), 0, 1);
    write('health', Math.round(health * 100), value => {
      healthFill.style.width = value + '%';
      healthValue.textContent = String(Math.ceil(snapshot.health));
      healthFill.parentNode.classList.toggle('critical', value <= 25);
    });
    const armor = snapshot.maxArmor > 0 ? clamp(snapshot.armor / snapshot.maxArmor, 0, 1) : 0;
    write('armor', Math.round(armor * 100), value => {
      armorFill.style.width = value + '%';
      armorRow.style.display = snapshot.maxArmor > 0 ? '' : 'none';
    });
    const stamina = snapshot.maxStamina > 0 ? clamp(snapshot.stamina / snapshot.maxStamina, 0, 1) : 0;
    write('stamina', Math.round(stamina * 100), value => {
      staminaFill.style.width = value + '%';
      staminaRow.style.display = snapshot.maxStamina > 0 ? '' : 'none';
    });
    root.classList.toggle('dead', snapshot.dead === true);
  }

  function updatePrompts(pawn){
    const systems = GAME && GAME.systems || {};
    const use = systems.interactions ? systems.interactions.focus(pawn) : null;
    const useLabel = use ? use.prompt + (use.object && use.object.name ? ' · ' + use.object.name : '') : '';
    write('use', useLabel, value => {
      usePrompt.classList.toggle('on', !!value);
      if(!value) return;
      usePrompt.textContent = '';
      usePrompt.appendChild(el('kbd', null, 'F'));
      usePrompt.appendChild(el('span', null, value));
    });
    const take = systems.items ? systems.items.focus(pawn) : null;
    write('take', take ? take.item.name : '', value => {
      takePrompt.classList.toggle('on', !!value);
      if(!value) return;
      takePrompt.textContent = '';
      // Same key as Use, because it IS the same key: a tap uses, a hold takes.
      takeKey = el('kbd', 'lk-fps-hold', 'F');
      takePrompt.appendChild(takeKey);
      takePrompt.appendChild(el('span', null, value));
    });
    // The ring is driven by the Pawn's own hold timer, so what fills on screen
    // and what decides the pickup are one number, not two that drift apart.
    const progress = pawn && pawn.verbs ? Math.max(0, Math.min(1, Number(pawn.verbs.pickupProgress) || 0)) : 0;
    write('takeHold', Math.round(progress * 20), value => {
      if(!takeKey) return;
      takeKey.style.setProperty('--lk-hold', (value * 5) + '%');
      takeKey.classList.toggle('holding', value > 0);
    });
  }

  function updateAbility(pawn){
    const abilities = pawn && pawn.abilities;
    const mode = abilities ? abilities.mode() : 'none';
    const sprinting = pawn && pawn.state && pawn.state.sprinting === true;
    const label = mode !== 'none' ? mode.toUpperCase() : (sprinting ? 'SPRINT' : '');
    write('ability', label, value => {
      abilityChip.textContent = value;
      abilityChip.classList.toggle('on', !!value);
    });
  }

  // Radar: a top-down slice of the collider world rotated into view space, so
  // "up" on the disc is always where the player is looking. Drawn from the
  // arcade colliders rather than the meshes, which keeps it O(colliders) and
  // automatically correct for anything the level can actually block with.
  function updateRadar(pawn, rig){
    if(!radarCtx || !pawn || !pawn.owner) return;
    const ctx = radarCtx;
    const size = radar.width;
    const half = size / 2;
    const scale = half / RADAR_RANGE;
    const origin = pawn.owner.position;
    const yaw = rig ? rig.viewAngles().yaw : finite(pawn.owner.rotation && pawn.owner.rotation.y, 0);
    // World heading `yaw` faces (sin, cos); rotating by -yaw puts it at the top.
    const cos = Math.cos(-yaw), sin = Math.sin(-yaw);
    const project = (x, z) => {
      const dx = x - origin.x, dz = z - origin.z;
      // Screen X is world right, screen Y is negative world forward.
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      return [half + rx * scale, half + rz * scale];
    };

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(8, 12, 18, .62)';
    ctx.fillRect(0, 0, size, size);

    const colliders = GAME.world && GAME.world.colliders && GAME.world.colliders.box || [];
    ctx.fillStyle = 'rgba(150, 178, 214, .34)';
    for(let i = 0; i < colliders.length; i++){
      const col = colliders[i];
      if(!col || col.enabled === false) continue;
      if(Math.abs(col.x - origin.x) > RADAR_RANGE + col.hx) continue;
      if(Math.abs(col.z - origin.z) > RADAR_RANGE + col.hz) continue;
      // Only obstacles worth avoiding: floors and decks would fill the disc.
      if(col.hy != null && col.y != null && col.y + col.hy < origin.y + .35) continue;
      ctx.save();
      const [px, py] = project(col.x, col.z);
      ctx.translate(px, py);
      ctx.rotate(-yaw);
      ctx.fillRect(-col.hx * scale, -col.hz * scale, col.hx * 2 * scale, col.hz * 2 * scale);
      ctx.restore();
    }

    const blip = (x, z, color, size2) => {
      const [px, py] = project(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, size2, 0, Math.PI * 2);
      ctx.fill();
    };
    const registry = GAME.world && Array.isArray(GAME.world.registry) ? GAME.world.registry : [];
    for(let i = 0; i < registry.length; i++){
      const object = registry[i];
      if(!object || !object.position || object.visible === false) continue;
      if(Math.abs(object.position.x - origin.x) > RADAR_RANGE) continue;
      if(Math.abs(object.position.z - origin.z) > RADAR_RANGE) continue;
      const data = object.userData || {};
      if(data.item && !data.item.consumed) blip(object.position.x, object.position.z, itemColor(data.item.kind), 3.4);
      else if(data.interact) blip(object.position.x, object.position.z, 'rgba(120, 200, 255, .8)', 2.8);
      else if(data.damageable && finite(data.damageable.health, 0) > 0) blip(object.position.x, object.position.z, 'rgba(255, 110, 96, .92)', 3.4);
    }
    ctx.restore();

    // Player arrow, always dead centre and always pointing up.
    ctx.fillStyle = 'rgba(235, 245, 255, .95)';
    ctx.beginPath();
    ctx.moveTo(half, half - 7);
    ctx.lineTo(half + 5, half + 6);
    ctx.lineTo(half, half + 3);
    ctx.lineTo(half - 5, half + 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150, 178, 214, .45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The overlay only DRAWS what the rig reports. Magnification, the lens size
  // and the glass character are weapon data owned by the controller, so the
  // picture through the sight and the direction of the bullet cannot disagree.
  function updateScope(rig){
    const blend = rig.scopeBlend ? rig.scopeBlend() : 0;
    const on = blend > .02;
    root.classList.toggle('scoped', on);
    if(!on){
      write('scopeOn', false, () => { scope.classList.remove('on'); });
      return;
    }
    write('scopeOn', true, () => { scope.classList.add('on'); });
    const settings = rig.scope();
    scope.style.opacity = String(Math.min(1, blend * 1.25));
    // The lens grows into frame as the sight comes up, which reads as the eye
    // settling behind the glass rather than a mask being switched on.
    write('scopeLens', Math.round(settings.lens * 100), value => {
      scope.style.setProperty('--lk-scope-lens', value + '%');
    });
    write('scopeGlass', Math.round(settings.distortion * 100) + ':' + Math.round(settings.vignette * 100), () => {
      scope.style.setProperty('--lk-scope-distortion', settings.distortion.toFixed(2));
      scope.style.setProperty('--lk-scope-vignette', settings.vignette.toFixed(2));
    });
    scope.style.setProperty('--lk-scope-rise', (0.82 + blend * 0.18).toFixed(3));
    write('scopeZoom', rig.magnification(), value => {
      scopeZoom.textContent = (Math.round(value * 10) / 10) + 'x';
    });
  }

  function itemColor(kind){
    if(kind === 'health') return 'rgba(255, 106, 106, .95)';
    if(kind === 'armor') return 'rgba(110, 168, 255, .95)';
    if(kind === 'ammo') return 'rgba(255, 214, 122, .95)';
    if(kind === 'weapon') return 'rgba(190, 214, 240, .95)';
    return 'rgba(160, 255, 200, .9)';
  }

  // --- frame ---------------------------------------------------------------

  function update(dt){
    const rig = activeRig();
    if(!rig || !playing()){
      setVisible(false);
      return false;
    }
    build();
    mount();
    setVisible(true);
    const pawn = activePawn();
    const h = Math.max(0, Number(dt) || 0);
    const firstPerson = rig.viewMode() === 'first';
    root.classList.toggle('third-person', !firstPerson);

    updateWeapon(rig, pawn);
    updateVitals(pawn);
    updatePrompts(pawn);
    updateAbility(pawn);
    updateRadar(pawn, rig);

    const aiming = rig.isAiming() === true;
    root.classList.toggle('aiming', aiming);
    updateScope(rig);
    // Crosshair gap tracks the live spread so the reticle stays honest about
    // where the bullets can actually land. Rounded to whole pixels so recoil
    // decay does not produce a style write on every single frame.
    const gap = aiming ? 3 : Math.round(8 + Math.min(18, (rig.state.recoilPitch || 0) * 260));
    write('gap', gap, value => crosshair.style.setProperty('--lk-fps-gap', value + 'px'));

    if(markerTimer > 0){
      markerTimer -= h;
      if(markerTimer <= 0) marker.classList.remove('on', 'kill');
    }
    if(vignetteTimer > 0){
      vignetteTimer -= h;
      vignette.style.opacity = String(clamp(vignetteTimer / .5, 0, 1) * .55);
      if(vignetteTimer <= 0) vignette.style.opacity = '0';
    }
    for(let i = live.length - 1; i >= 0; i--){
      live[i].time -= h;
      if(live[i].time > 0) continue;
      const done = live.splice(i, 1)[0];
      if(done.node.parentNode) done.node.parentNode.removeChild(done.node);
    }
    return true;
  }

  window.addEventListener('lk-pawn-event', event => {
    const detail = event && event.detail || {};
    const type = detail.type;
    if(type === 'OnTargetDown') flashMarker('kill');
    else if(type === 'OnWeaponHit') flashMarker('hit');
    else if(type === 'OnCharacterDamaged') vignetteTimer = .5;
    else if(type === 'OnItemPickedUp') toast(pickupLabel(detail), detail.kind);
    else if(type === 'OnWeaponEquipped' && detail.name) toast(detail.name, 'weapon');
    else if(type === 'OnWeaponDropped' && detail.weapon) toast('▼ ' + detail.weapon, 'drop');
    else if(type === 'OnObjectDelivered') toast('✓', 'ok');
  });

  function pickupLabel(detail){
    if(detail.kind === 'health') return '+ ' + Math.round(finite(detail.amount, 0)) + ' HP';
    if(detail.kind === 'armor') return '+ ' + Math.round(finite(detail.amount, 0)) + ' ARMOUR';
    if(detail.kind === 'ammo') return '+ ' + Math.round(finite(detail.amount, 0)) + ' AMMO';
    return detail.name || 'Item';
  }

  function dispose(){
    if(root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    visible = false;
    live.length = 0;
  }

  // Pre-benchmark warm-up: allocate the overlay and its radar canvas now rather
  // than on the first frame the player is possessed, when a layout and a canvas
  // context are the last things the frame budget needs.
  function prewarm(){
    build();
    if(radarCtx) radarCtx.clearRect(0, 0, radar.width, radar.height);
    return true;
  }

  return Object.freeze({update, prewarm, dispose, toast, isVisible:() => visible});
}

window.LK_RUNTIME_FPS_HUD = Object.freeze({create});
})();
