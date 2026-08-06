/* =========================================================
   LOT KING - editable vehicle / level radar
   Canvas 2D overlay sourced from the live collider world. It intentionally
   avoids a second WebGL camera/render target so the map cannot steal frame time
   from driving.
   ========================================================= */
(function(){
'use strict';

const DEFAULTS = Object.freeze({
  layoutVersion:2,
  enabled:true,
  left:0,
  top:0,
  size:176,
  range:92,
  opacity:.9,
  rotate:true,
  circular:true,
  refreshHz:15,
  showObstacles:true,
  showItems:true,
});

function clamp(value, min, max){ return Math.max(min, Math.min(max, Number(value) || 0)); }
function finite(value, fallback){ const number = Number(value); return Number.isFinite(number) ? number : fallback; }

// Engine vehicle convention: heading 0 faces +Z, positive yaw is a left turn
// and driver-right is -X (the same basis used by the driving input/camera).
// Return radar-space coordinates where +X is screen-right and -Y is forward.
function projectRadarOffset(dx, dz, yaw){
  const angle = finite(yaw, 0);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const projectedX = -finite(dx, 0) * cos + finite(dz, 0) * sin;
  const projectedY = -(finite(dx, 0) * sin + finite(dz, 0) * cos);
  return {
    x: Math.abs(projectedX) < 1e-12 ? 0 : projectedX,
    y: Math.abs(projectedY) < 1e-12 ? 0 : projectedY,
  };
}

function headingFromQuaternion(quaternion){
  const q = quaternion || {};
  const x = finite(q.x, 0), y = finite(q.y, 0), z = finite(q.z, 0), w = finite(q.w, 1);
  // Rotate local +Z by the full quaternion, then discard only its vertical
  // component. This remains correct while a chassis pitches or rolls.
  const forwardX = 2 * (x * z + w * y);
  const forwardZ = 1 - 2 * (x * x + y * y);
  return Math.atan2(forwardX, forwardZ);
}

function resolveVehicleTarget(GAME, pawn){
  if(pawn){
    const vehicle = pawn.pawnType === 'vehicle' || pawn.kind === 'native-adapter' || pawn.id === 'native-player-car';
    const owner = pawn.owner || null;
    const ownerData = owner && owner.userData || {};
    if(!vehicle || pawn.possessed === false || pawn.enabled === false || pawn.hidden === true ||
      !owner || owner.visible === false || ownerData.hidden === true || ownerData.logicEnabled === false) return null;
    return {object:owner, pawn};
  }
  if(!GAME || !GAME.player || GAME.player.enabled === false || GAME.player.hidden === true) return null;
  const object = GAME.player.car;
  return object && object.visible !== false ? {object, pawn:null} : null;
}

function create(GAME){
  const config = Object.assign({}, DEFAULTS);
  const headingQuaternion = window.THREE ? new window.THREE.Quaternion() : null;
  let canvas = null;
  let ctx = null;
  let editorPreview = false;
  let elapsed = Infinity;

  function build(){
    if(canvas) return canvas;
    canvas = document.createElement('canvas');
    canvas.className = 'lk-vehicle-radar';
    canvas.width = 384;
    canvas.height = 384;
    canvas.setAttribute('aria-label', 'Level radar');
    ctx = canvas.getContext ? canvas.getContext('2d', {alpha:true}) : null;
    window.addEventListener('resize', layout, {passive:true});
    mount();
    layout();
    return canvas;
  }

  function editing(){
    return !!(GAME && GAME.state && GAME.state.editorActive && !GAME.state.editorPreview);
  }

  function mount(){
    if(!canvas) return;
    const host = editorPreview && editing()
      ? document.body
      : (document.getElementById('hud') || document.body);
    if(canvas.parentNode !== host) host.appendChild(canvas);
    canvas.classList.toggle('editor-preview', editorPreview && editing());
  }

  function layout(){
    if(!canvas) return;
    const requested = clamp(config.size, 90, 420);
    canvas.style.left = clamp(config.left, 0, 95) + '%';
    canvas.style.top = clamp(config.top, 0, 90) + '%';
    canvas.style.width = requested + 'px';
    canvas.style.height = requested + 'px';
    canvas.style.opacity = String(clamp(config.opacity, .1, 1));
    canvas.classList.toggle('round', config.circular !== false);
    if(editorPreview && editing()){
      const viewport = document.querySelector('#view3d canvas, #lkViewport canvas, canvas#game');
      const rect = viewport && viewport.getBoundingClientRect ? viewport.getBoundingClientRect() : null;
      if(rect){
        const size = Math.max(72, Math.min(requested, rect.width - 16, rect.height - 16));
        const x = clamp(rect.left + rect.width * clamp(config.left, 0, 95) / 100, rect.left + 8, rect.right - size - 8);
        const y = clamp(rect.top + rect.height * clamp(config.top, 0, 90) / 100, rect.top + 8, rect.bottom - size - 8);
        canvas.style.left = x + 'px'; canvas.style.top = y + 'px';
        canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
      }
    } else if(canvas.parentNode && canvas.parentNode !== document.body){
      const width = canvas.parentNode.clientWidth, height = canvas.parentNode.clientHeight;
      if(width > 32 && height > 32){
        const size = Math.max(72, Math.min(requested, width - 16, height - 16));
        canvas.style.left = clamp(width * clamp(config.left, 0, 95) / 100, 8, width - size - 8) + 'px';
        canvas.style.top = clamp(height * clamp(config.top, 0, 90) / 100, 8, height - size - 8) + 'px';
        canvas.style.width = size + 'px'; canvas.style.height = size + 'px';
      }
    }
  }

  function activePawn(){
    return GAME && GAME.pawns && GAME.pawns.getByPlayerId ? GAME.pawns.getByPlayerId(1) : null;
  }

  function target(){
    const pawn = activePawn();
    // Character and Soccer Pawns own their dedicated HUDs. Never stack this
    // vehicle map over the FPS radar just because they also occupy Player 1.
    return resolveVehicleTarget(GAME, pawn);
  }

  function visible(){
    if(config.enabled === false) return false;
    // Preview is an explicit editor command and must remain authoritative while
    // project/menu state finishes synchronising in the background.
    if(editorPreview) return true;
    const state = GAME && GAME.state;
    return !!(state && (state.started || state.editorPreview) && !editing() && target());
  }

  function worldPosition(object){
    if(!object) return null;
    if(object.getWorldPosition && window.THREE){
      object.updateMatrixWorld(true);
      return object.getWorldPosition(new window.THREE.Vector3());
    }
    return object.position || null;
  }

  function heading(object, pawn){
    if(pawn && pawn.backend && pawn.backend.body && pawn.backend.body.quaternion){
      return headingFromQuaternion(pawn.backend.body.quaternion);
    }
    if(!pawn && GAME && GAME.player && object === GAME.player.car && typeof GAME.player.visibleHeading === 'function'){
      return finite(GAME.player.visibleHeading(), 0);
    }
    if(object && object.getWorldQuaternion && headingQuaternion){
      object.updateMatrixWorld(true);
      return headingFromQuaternion(object.getWorldQuaternion(headingQuaternion));
    }
    return finite(object && object.rotation && object.rotation.y, finite(GAME && GAME.player && GAME.player.state && GAME.player.state.heading, 0));
  }

  function draw(){
    build();
    if(!ctx) return;
    const active = target();
    if(!active) return;
    const origin = worldPosition(active.object);
    if(!origin) return;
    const yaw = config.rotate === false ? 0 : heading(active.object, active.pawn);
    const size = canvas.width;
    const half = size / 2;
    const range = Math.max(12, finite(config.range, DEFAULTS.range));
    const scale = (half - 14) / range;
    const project = (x, z) => {
      const dx = finite(x, 0) - origin.x;
      const dz = finite(z, 0) - origin.z;
      const offset = projectRadarOffset(dx, dz, yaw);
      return [half + offset.x * scale, half + offset.y * scale];
    };

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    if(config.circular !== false) ctx.arc(half, half, half - 3, 0, Math.PI * 2);
    else if(ctx.roundRect) ctx.roundRect(3, 3, size - 6, size - 6, 34);
    else ctx.rect(3, 3, size - 6, size - 6);
    ctx.clip();
    const gradient = ctx.createRadialGradient(half, half, 4, half, half, half);
    gradient.addColorStop(0, 'rgba(13,24,34,.88)');
    gradient.addColorStop(1, 'rgba(4,9,15,.96)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = 'rgba(91,196,255,.10)';
    ctx.lineWidth = 1;
    for(let ring = .25; ring <= 1; ring += .25){
      ctx.beginPath(); ctx.arc(half, half, (half - 14) * ring, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, size); ctx.moveTo(0, half); ctx.lineTo(size, half); ctx.stroke();

    if(config.showObstacles !== false){
      const boxes = GAME && GAME.world && GAME.world.colliders && GAME.world.colliders.box || [];
      for(const col of boxes){
        if(!col || col.enabled === false || col.compoundRoot || col.horizontalSurface) continue;
        if(Math.abs(col.x - origin.x) > range + finite(col.hx, 0)) continue;
        if(Math.abs(col.z - origin.z) > range + finite(col.hz, 0)) continue;
        const floorLike = finite(col.hy, 1) < .35 || finite(col.y, 0) + finite(col.hy, 0) < origin.y + .25;
        const point = project(col.x, col.z);
        ctx.save();
        ctx.translate(point[0], point[1]);
        ctx.rotate(yaw - finite(col.rotY, finite(col.rot, 0)));
        ctx.fillStyle = floorLike ? 'rgba(74,110,128,.12)' : 'rgba(132,188,218,.36)';
        ctx.fillRect(-finite(col.hx, .5) * scale, -finite(col.hz, .5) * scale,
          finite(col.hx, .5) * 2 * scale, finite(col.hz, .5) * 2 * scale);
        ctx.restore();
      }
    }

    if(config.showItems !== false){
      const objects = GAME && GAME.world && Array.isArray(GAME.world.registry) ? GAME.world.registry : [];
      for(const object of objects){
        if(!object || object === active.object || object.visible === false) continue;
        const point3 = worldPosition(object);
        if(!point3 || Math.abs(point3.x - origin.x) > range || Math.abs(point3.z - origin.z) > range) continue;
        const data = object.userData || {};
        let color = null;
        if(data.item && !data.item.consumed) color = '#ffd85a';
        else if(data.interact) color = '#78d9ff';
        else if(data.damageable && finite(data.damageable.health, 0) > 0) color = '#ff695f';
        else if(data.editorType === 'logicElement' && data.pawnType === 'vehicle') color = '#94ffbd';
        if(!color) continue;
        const point = project(point3.x, point3.z);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(point[0], point[1], 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.translate(half, half);
    if(config.rotate === false) ctx.rotate(-heading(active.object, active.pawn));
    ctx.fillStyle = '#f3fbff';
    ctx.shadowColor = '#64d8ff'; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(8, 10); ctx.lineTo(0, 6); ctx.lineTo(-8, 10);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(109,213,255,.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(half, half, half - 4.5, 0, Math.PI * 2); ctx.stroke();
  }

  function update(dt){
    build();
    mount();
    layout();
    const show = visible();
    canvas.classList.toggle('on', show);
    if(!show) return;
    elapsed += Math.max(0, finite(dt, 0));
    const interval = 1 / clamp(config.refreshHz, 5, 30);
    if(elapsed < interval) return;
    elapsed %= interval;
    draw();
  }

  function setConfig(patch){
    const source = patch && typeof patch === 'object' ? patch : {};
    const legacyDefaultLayout = source.layoutVersion == null &&
      Math.abs(finite(source.left, NaN) - 2.2) < 1e-6 &&
      Math.abs(finite(source.top, NaN) - 18) < 1e-6;
    Object.assign(config, source);
    if(legacyDefaultLayout){
      config.left = DEFAULTS.left;
      config.top = DEFAULTS.top;
    }
    config.layoutVersion = DEFAULTS.layoutVersion;
    layout();
    elapsed = Infinity;
    update(0);
    return config;
  }

  function setEditorPreview(value){
    editorPreview = value === true;
    mount();
    update(0);
    return editorPreview;
  }

  function prewarm(){ build(); draw(); canvas.classList.remove('on'); return true; }

  return Object.freeze({config, setConfig, setEditorPreview, update, prewarm});
}

window.LK_RUNTIME_VEHICLE_RADAR = Object.freeze({
  create,
  defaults:() => Object.assign({}, DEFAULTS),
  resolveVehicleTarget,
  projectRadarOffset,
  headingFromQuaternion,
});
})();
