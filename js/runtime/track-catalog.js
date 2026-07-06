/* =========================================================
   LOT KING - track catalog and level-select UI module
   Owns available tracks, selected track state and menu cards.
   ========================================================= */
(function(){
'use strict';

const DEFAULT_TRACKS = [
  {
    id: 'default-parking-lot',
    name: 'Parking Lot',
    tag: 'DEFAULT TRACK',
    description: 'Editable parking-lot track with player spawn, radio HUD, lights, props and Lot King Editor Project settings.',
    surface: 'Open asphalt',
    goal: 'Drift sandbox',
  },
];

function create(options){
  const opts = options || {};
  const tracks = (opts.tracks || DEFAULT_TRACKS).map(t => Object.assign({}, t));
  let current = null;
  const levelSelect = opts.levelSelect;
  const levelCards = opts.levelCards;
  const loadText = opts.loadText;

  function normalizeId(id){
    return id != null ? String(id).trim() : '';
  }

  function find(id){
    const target = normalizeId(id);
    return tracks.find(track => normalizeId(track.id) === target) || null;
  }

  function render(){
    if(!levelCards) return;
    levelCards.innerHTML = '';
    tracks.forEach(level => {
      const card = document.createElement('article');
      card.className = 'level-card';
      card.innerHTML =
        '<div class="level-preview" aria-hidden="true"></div>' +
        '<div class="level-body">' +
          '<span class="level-tag"></span>' +
          '<div class="level-title"></div>' +
          '<p class="level-desc"></p>' +
          '<div class="level-meta"><span></span><span></span></div>' +
        '</div>' +
        '<button class="level-launch" type="button">LAUNCH TRACK</button>';
      card.querySelector('.level-tag').textContent = level.tag || 'TRACK';
      card.querySelector('.level-title').textContent = level.name || 'Untitled Track';
      card.querySelector('.level-desc').textContent = level.description || '';
      const meta = card.querySelectorAll('.level-meta span');
      meta[0].textContent = level.surface || '';
      meta[1].textContent = level.goal || '';
      card.querySelector('.level-launch').addEventListener('click', () => {
        if(opts.onLaunch) opts.onLaunch(level.id);
      });
      levelCards.appendChild(card);
    });
  }

  function show(){
    if(document.body && document.body.classList && document.getElementById('lkEditor') && document.getElementById('lkEditor').classList.contains('active')) return;
    render();
    if(levelSelect) levelSelect.setAttribute('aria-hidden', 'false');
    if(loadText) loadText.textContent = tracks.length ? 'select track' : 'no tracks available';
  }

  function hide(resetText){
    if(levelSelect) levelSelect.setAttribute('aria-hidden', 'true');
    if(resetText && loadText) loadText.textContent = 'choose track';
  }

  function prepareEditor(){
    if(!current && tracks.length) current = tracks[0];
    hide(true);
    if(loadText) loadText.textContent = current ? 'editing track: ' + current.name : 'create a new track';
    return current;
  }

  function setTracks(list){
    if(!Array.isArray(list) || !list.length) return;
    const curId = current && current.id;
    tracks.length = 0;
    list.forEach(t => tracks.push(Object.assign({}, t)));
    if(curId) current = find(curId);
    if(!current){
      current = tracks.find(t => t.active || t.primary || t.tag === 'EDITOR TRACK') || tracks[0] || null;
    }
    render();
  }

  function setEditorTrack(track){
    if(!track) return;
    const target = find(track.id) || tracks.find(t => t.tag === 'EDITOR TRACK') || tracks[0];
    if(!target) return;
    const previousId = target.id;
    target.id = track.id || target.id;
    target.name = track.name || target.name;
    target.tag = track.tag || 'EDITOR TRACK';
    if(current && current.id === previousId) current = target;
    render();
  }

  function setCurrent(level){
    current = typeof level === 'string' ? find(level) : level;
    return current;
  }

  function clearCurrent(){
    current = null;
  }

  render();

  return {
    available: () => tracks,
    current: () => current,
    find,
    render,
    show,
    hide,
    prepareEditor,
    setTracks,
    setEditorTrack,
    setCurrent,
    clearCurrent,
  };
}

window.LK_RUNTIME_TRACK_CATALOG = Object.freeze({create});
})();
