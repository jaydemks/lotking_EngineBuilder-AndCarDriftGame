/* =========================================================
   LOT KING - Objective HUD

   Reads LK_RUNTIME_OBJECTIVES snapshots and renders the mission panel.
   Like the FPS HUD it mounts inside #hud, so it lands on the rectangle the
   active camera actually renders into (split screen, letterbox, or the editor
   viewport) instead of the raw window.

   It never writes to the director. Removing this script removes the panel and
   nothing else.
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;
const BANNER_SECONDS = 3.2;

function el(tag, className, text){
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(text != null) node.textContent = text;
  return node;
}
function clockText(seconds){
  seconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(seconds / 60);
  return minutes + ':' + String(seconds % 60).padStart(2, '0');
}

function create(GAME){
  const state = {mounted:false, signature:'', banner:0, bannerKind:'', rows:new Map()};
  let host = null, panel = null, titleNode = null, metaNode = null, listNode = null, bannerNode = null;

  function director(){ return GAME && GAME.systems && GAME.systems.objectives || null; }

  function mount(){
    if(state.mounted) return true;
    host = document.getElementById('hud') || document.body;
    if(!host) return false;
    panel = el('div', 'lk-objectives');
    panel.setAttribute('aria-live', 'polite');
    titleNode = el('div', 'lk-objTitle');
    metaNode = el('div', 'lk-objMeta');
    listNode = el('ul', 'lk-objList');
    bannerNode = el('div', 'lk-objBanner');
    panel.append(titleNode, metaNode, listNode);
    host.append(panel, bannerNode);
    state.mounted = true;
    return true;
  }
  function unmount(){
    if(!state.mounted) return false;
    [panel, bannerNode].forEach(node => { if(node && node.parentNode) node.parentNode.removeChild(node); });
    state.rows.clear();
    state.mounted = false;
    return true;
  }

  function visible(){
    if(!GAME || !GAME.state) return false;
    if(GAME.state.editorActive && !GAME.state.editorPreview) return false;
    return GAME.state.started === true;
  }

  /** Rows are keyed by objective id and patched in place: rebuilding the list
   *  every frame would restart the CSS completion transition. */
  function syncRows(objectives){
    const live = new Set();
    objectives.forEach(objective => {
      live.add(objective.id);
      let row = state.rows.get(objective.id);
      if(!row){
        const node = el('li', 'lk-objRow');
        const mark = el('i', 'lk-objMark');
        const label = el('span', 'lk-objLabel');
        const count = el('b', 'lk-objCount');
        const bar = el('div', 'lk-objBar');
        const fill = el('i');
        bar.append(fill);
        node.append(mark, label, count, bar);
        listNode.append(node);
        row = {node, label, count, fill, signature:''};
        state.rows.set(objective.id, row);
      }
      const signature = [objective.status, objective.progress.toFixed(3), objective.current, objective.title].join('|');
      if(row.signature === signature) return;
      row.signature = signature;
      row.node.className = 'lk-objRow is-' + objective.status + (objective.optional ? ' is-optional' : '');
      row.label.textContent = objective.title;
      row.count.textContent = objective.count > 1 ? objective.current + ' / ' + objective.count : '';
      row.fill.style.width = Math.round(objective.progress * 100) + '%';
    });
    state.rows.forEach((row, id) => {
      if(live.has(id)) return;
      if(row.node.parentNode) row.node.parentNode.removeChild(row.node);
      state.rows.delete(id);
    });
  }

  function showBanner(kind, message){
    if(!bannerNode) return;
    state.banner = BANNER_SECONDS;
    state.bannerKind = kind;
    bannerNode.textContent = message;
    bannerNode.className = 'lk-objBanner show is-' + kind;
  }

  function update(dt){
    const api = director();
    if(!api || !visible()){ unmount(); return; }
    const snapshot = api.snapshot();
    if(!snapshot.hud.enabled || (!snapshot.running && !snapshot.finished)){ unmount(); return; }
    if(!mount()) return;

    panel.className = 'lk-objectives pos-' + snapshot.hud.position;
    titleNode.textContent = snapshot.title;
    const meta = [];
    if(snapshot.hud.showTimer){
      meta.push(snapshot.timeLimit > 0 ? clockText(snapshot.timeRemaining) : clockText(snapshot.elapsed));
    }
    if(snapshot.hud.showScore) meta.push(snapshot.scoreTarget > 0 ? snapshot.score + ' / ' + snapshot.scoreTarget : String(snapshot.score));
    if(snapshot.subtitle) meta.push(snapshot.subtitle);
    metaNode.textContent = meta.join('  ·  ');
    metaNode.classList.toggle('is-urgent', snapshot.timeLimit > 0 && snapshot.timeRemaining <= 10);

    syncRows(snapshot.hud.showOptional ? snapshot.objectives : snapshot.objectives.filter(item => !item.optional));

    if(state.banner > 0){
      state.banner = Math.max(0, state.banner - Math.max(0, Number(dt) || 0));
      if(state.banner === 0) bannerNode.className = 'lk-objBanner';
    }
  }

  function onMissionEvent(event){
    const detail = event && event.detail || {};
    if(detail.type === 'OnMissionCompleted') showBanner('complete', 'MISSION COMPLETE');
    else if(detail.type === 'OnMissionFailed') showBanner('fail', detail.reason === 'time-limit' ? 'OUT OF TIME' : 'MISSION FAILED');
    else if(detail.type === 'OnObjectiveCompleted' && state.mounted) showBanner('objective', 'OBJECTIVE COMPLETE');
  }

  function install(){
    if(typeof root.addEventListener === 'function') root.addEventListener('lk-mission-event', onMissionEvent);
    return true;
  }
  function destroy(){
    if(typeof root.removeEventListener === 'function') root.removeEventListener('lk-mission-event', onMissionEvent);
    unmount();
    return true;
  }

  return Object.freeze({install, destroy, update, mount, unmount, snapshotRows:() => state.rows.size});
}

root.LK_RUNTIME_OBJECTIVE_HUD = Object.freeze({create});
})();
