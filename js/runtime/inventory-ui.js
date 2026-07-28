/* =========================================================
   LOT KING — Inventory UI: weapon wheel and backpack

   One key, two views, told apart by how long it is held — the same rule the Use
   key already uses, so a player learns it once:

     tap  I   the WEAPON WHEEL: the seven roles laid out in a circle
     hold I   the BACKPACK: what the pack is carrying, in a list

   The wheel is steered with the mouse WITHOUT releasing pointer lock. That is
   the whole reason it exists as a wheel rather than a menu: you flick toward a
   weapon and let go, and the game never stops being a game. Number keys work
   throughout, so the wheel is a convenience and never the only way in.

   Highlighting equips LIVE rather than on a confirm step. A wheel that needs a
   second press to commit is slower than the number key it was meant to replace.

   The module owns no gameplay. It reads `pawn.inventory` and calls `equipSlot`;
   everything it displays already exists as data. Removing the script removes
   both views and nothing else.
   ========================================================= */
(function(){
'use strict';

// Selection needs the pointer to have travelled far enough to mean something.
// Below this the wheel keeps whatever is already in hand, so a twitch while
// opening it cannot swap your rifle for a grenade.
const DEADZONE = 60;
const STEER_RANGE = 220;      // pixels of travel that reach the rim

function finite(value, fallback){ const n = Number(value); return Number.isFinite(n) ? n : fallback; }

function el(tag, className, text){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text != null) node.textContent = text;
  return node;
}

function create(GAME){
  let root = null;
  let wheel = null;
  let pack = null;
  let centre = null;
  const tiles = [];
  let view = 'none';
  let steerX = 0;
  let steerY = 0;
  let highlighted = -1;
  const shown = {view:null, signature:null, packSignature:null, highlight:null};

  function api(){ return window.LK_RUNTIME_FIRST_PERSON || null; }
  function activePawn(){
    const runtime = api();
    return runtime && runtime.activePawn ? runtime.activePawn(GAME, 1) : null;
  }
  function slotDefs(){
    const runtime = api();
    return runtime && runtime.WEAPON_SLOTS ? runtime.WEAPON_SLOTS : [];
  }

  function build(){
    if(root) return root;
    root = el('div', 'lk-inv');
    root.setAttribute('aria-hidden', 'true');

    wheel = el('div', 'lk-inv-wheel');
    const slots = slotDefs();
    slots.forEach((slot, index) => {
      const tile = el('div', 'lk-inv-slot');
      // Laid out around the circle from straight up, clockwise, in the same
      // order as the number keys — so the wheel and `1..7` agree by position.
      const angle = -Math.PI / 2 + (index / Math.max(1, slots.length)) * Math.PI * 2;
      tile.style.setProperty('--lk-inv-x', (Math.cos(angle) * 140).toFixed(1) + 'px');
      tile.style.setProperty('--lk-inv-y', (Math.sin(angle) * 140).toFixed(1) + 'px');
      tile.appendChild(el('kbd', null, String(index + 1)));
      tile.appendChild(el('em', null, slot.label));
      tile.appendChild(el('strong', null, '—'));
      tile.appendChild(el('span', null, ''));
      wheel.appendChild(tile);
      tiles.push(tile);
    });
    centre = el('div', 'lk-inv-centre');
    wheel.appendChild(centre);

    pack = el('div', 'lk-inv-pack');
    root.appendChild(wheel);
    root.appendChild(pack);
    mount();
    return root;
  }

  // Same host as the HUD: #hud already carries the rendered camera rectangle,
  // so a wheel centred in it is centred on the view rather than on the window.
  function mount(){
    const host = document.getElementById('hud') || document.body;
    if(root.parentNode !== host) host.appendChild(root);
  }

  // --- steering ------------------------------------------------------------

  // Called from the pointer-move path INSTEAD of the look input, so opening the
  // wheel does not also turn the character.
  function steer(dx, dy){
    if(view !== 'wheel') return false;
    steerX = Math.max(-STEER_RANGE, Math.min(STEER_RANGE, steerX + finite(dx, 0)));
    steerY = Math.max(-STEER_RANGE, Math.min(STEER_RANGE, steerY + finite(dy, 0)));
    return true;
  }

  function steeredSlot(){
    const slots = slotDefs();
    if(!slots.length) return -1;
    const distance = Math.sqrt(steerX * steerX + steerY * steerY);
    if(distance < DEADZONE) return -1;
    // Screen Y grows downward, so the angle is measured with it negated to put
    // "up" at the top of the wheel, matching how the tiles are placed.
    let angle = Math.atan2(steerY, steerX) + Math.PI / 2;
    while(angle < 0) angle += Math.PI * 2;
    while(angle >= Math.PI * 2) angle -= Math.PI * 2;
    return Math.round(angle / (Math.PI * 2) * slots.length) % slots.length;
  }

  // --- rendering -----------------------------------------------------------

  function renderWheel(pawn){
    const inventory = pawn && pawn.inventory;
    const slots = slotDefs();
    const carried = inventory ? inventory.slots() : [];
    const equipped = inventory && inventory.current() ? inventory.current().weapon : null;
    const signature = slots.map(slot => {
      const entry = carried.find(item => (item.weapon.assignedSlot || item.weapon.slot) === slot.id);
      return entry ? entry.weapon.name + ':' + entry.ammo + '/' + entry.reserve : '';
    }).join('|') + '#' + (equipped ? equipped.name : '');
    if(shown.signature === signature) return;
    shown.signature = signature;
    slots.forEach((slot, index) => {
      const tile = tiles[index];
      if(!tile) return;
      const entry = carried.find(item => (item.weapon.assignedSlot || item.weapon.slot) === slot.id);
      tile.classList.toggle('empty', !entry);
      tile.classList.toggle('equipped', !!(entry && equipped && entry.weapon.name === equipped.name));
      tile.querySelector('strong').textContent = entry ? entry.weapon.name : '—';
      const ammo = entry && entry.weapon.infiniteAmmo ? '∞'
        : entry ? entry.ammo + ' / ' + entry.reserve : '';
      tile.querySelector('span').textContent = ammo;
    });
  }

  function renderPack(pawn){
    const inventory = pawn && pawn.inventory;
    const stored = inventory && inventory.pack ? inventory.pack() : [];
    const signature = stored.map(entry => entry.kind + ':' + entry.amount).join('|');
    if(shown.packSignature === signature) return;
    shown.packSignature = signature;
    pack.textContent = '';
    pack.appendChild(el('h4', null, 'Backpack'));
    if(!stored.length){
      pack.appendChild(el('p', 'lk-inv-empty', 'Empty — medkits, armour and ammo you pick up are stored here.'));
      return;
    }
    const list = el('div', 'lk-inv-list');
    stored.forEach((entry, index) => {
      const row = el('div', 'lk-inv-row ' + entry.kind);
      row.appendChild(el('kbd', null, String(index + 1)));
      row.appendChild(el('strong', null, entry.name));
      row.appendChild(el('span', null, '+' + Math.round(finite(entry.amount, 0))));
      list.appendChild(row);
    });
    pack.appendChild(list);
    pack.appendChild(el('p', 'lk-inv-hint', 'T uses the first item.'));
  }

  // --- frame ---------------------------------------------------------------

  function update(){
    const pawn = activePawn();
    const wanted = pawn && pawn.verbs ? String(pawn.verbs.inventoryView || 'none') : 'none';
    const editing = GAME && GAME.state && GAME.state.editorActive && !GAME.state.editorPreview;
    const next = editing || !pawn ? 'none' : wanted;

    if(next !== view){
      // Opening always starts from the weapon in hand, so a flick in any
      // direction is a deliberate change rather than a correction.
      if(next === 'wheel'){ steerX = 0; steerY = 0; highlighted = -1; }
      view = next;
      shown.signature = null;
      shown.packSignature = null;
      build().classList.toggle('on', view !== 'none');
      root.classList.toggle('wheel-view', view === 'wheel');
      root.classList.toggle('pack-view', view === 'pack');
    }
    if(view === 'none') return false;
    build();
    mount();

    if(view === 'wheel'){
      renderWheel(pawn);
      const at = steeredSlot();
      if(at !== highlighted){
        highlighted = at;
        tiles.forEach((tile, index) => tile.classList.toggle('on', index === at));
        // Live equip: a wheel that needs a confirm press is slower than the
        // number key it replaces.
        if(at >= 0 && pawn.inventory && pawn.inventory.equipSlotIndex) pawn.inventory.equipSlotIndex(at);
        const slots = slotDefs();
        centre.textContent = at >= 0 && slots[at] ? slots[at].label : 'Weapons';
        shown.signature = null;
      }
    } else {
      renderPack(pawn);
    }
    return true;
  }

  function dispose(){
    if(root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    tiles.length = 0;
    view = 'none';
  }

  return Object.freeze({
    update,
    steer,
    dispose,
    isOpen:() => view !== 'none',
    view:() => view,
  });
}

function install(GAME){
  if(!GAME) return null;
  GAME.systems = GAME.systems || {};
  if(GAME.systems.inventoryUi) return GAME.systems.inventoryUi;
  GAME.systems.inventoryUi = create(GAME);
  return GAME.systems.inventoryUi;
}

window.LK_RUNTIME_INVENTORY_UI = Object.freeze({DEADZONE, STEER_RANGE, create, install});
})();
