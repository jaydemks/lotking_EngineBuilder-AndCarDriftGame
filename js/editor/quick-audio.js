/* =========================================================
   LOT KING — EDITOR QUICK AUDIO
   Owns the floating menu music transport controls.
   ========================================================= */
(function(){
'use strict';

function create(deps){
  deps = deps || {};
  const GAME = deps.GAME;
  const ED = deps.ED;
  const $ = deps.$;
  const setPanelVisible = deps.setPanelVisible || function(){};
  let activeApi = null;
  let activeLabel = 'AUDIO PREVIEW';

  function defaultMusic(){
    return GAME && GAME.systems && GAME.systems.menuMusic;
  }

  function music(){ return activeApi || defaultMusic(); }
  function audioOf(api){
    if(!api) return null;
    return api.audio || (typeof api.play === 'function' || typeof api.pause === 'function' ? api : null);
  }

  function sync(){
    const current = music();
    const panel = $('#lkQuickAudio');
    const mute = $('#lkQuickMute');
    const vol = $('#lkQuickMusicVol');
    const label = $('#lkQuickAudioLabel');
    if(!current || !panel){ if(panel) panel.style.display = 'none'; return; }
    const audio = audioOf(current);
    if(!audio) return;
    const off = !!(audio.paused || audio.muted || current.muted);
    if(mute) mute.textContent = off ? '♪ Off' : '♪ On';
    if(vol && Number.isFinite(audio.volume)) vol.value = Math.round(audio.volume * 100);
    if(label) label.textContent = activeLabel;
  }

  function play(){
    const current = music();
    if(!current) return Promise.resolve();
    const audio = audioOf(current);
    if(!audio) return Promise.resolve();
    if(audio.muted) audio.muted = false;
    if(current.muted) current.muted = false;
    if(current.play) return Promise.resolve(current.play()).catch(() => {});
    if(audio.play) return audio.play().catch(() => {});
    return Promise.resolve();
  }

  function pause(){
    const current = music();
    if(!current) return;
    const audio = audioOf(current);
    if(current.pause) current.pause();
    else if(audio.pause) audio.pause();
  }

  function stop(){
    const current = music();
    const audio = audioOf(current);
    pause();
    if(audio){
      try { audio.currentTime = 0; } catch(err){}
    }
    sync();
  }

  function show(){
    setPanelVisible(true);
    const panel = $('#lkQuickAudio');
    if(panel) panel.style.display = '';
    sync();
  }

  function preview(api, index, label){
    if(!api) return;
    activeApi = api;
    activeLabel = String(label || 'AUDIO PREVIEW').toUpperCase();
    ED.quickMusicIndex = Math.max(0, Number(index) || 0);
    show();
    if(api.loadTrack) api.loadTrack(ED.quickMusicIndex, true);
    else play();
    sync();
  }

  const muteButton = $('#lkQuickMute');
  if(muteButton) muteButton.addEventListener('click', () => {
    const current = music();
    if(!current) return;
    const audio = audioOf(current);
    if(!audio) return;
    if(audio.paused || audio.muted || current.muted){
      play().then(sync);
      return;
    }
    pause();
    sync();
  });

  const volume = $('#lkQuickMusicVol');
  if(volume) volume.addEventListener('input', e => {
    const current = music();
    if(!current) return;
    const audio = audioOf(current);
    if(!audio) return;
    const v = Math.max(0, Math.min(1, (+e.target.value || 0) / 100));
    if(current.setVolume) current.setVolume(v); else audio.volume = v;
    sync();
  });

  const nextButton = $('#lkQuickNext');
  if(nextButton) nextButton.addEventListener('click', () => {
    const currentApi = music();
    if(!currentApi) return;
    if(currentApi.next) currentApi.next();
    else if(currentApi.getTracks && currentApi.loadTrack){
      const tracks = currentApi.getTracks({sort:'order'});
      if(tracks && tracks.length){
        const currentIndex = tracks.findIndex(t => t.index === ED.quickMusicIndex);
        const row = tracks[(currentIndex + 1 + tracks.length) % tracks.length];
        ED.quickMusicIndex = row.index;
        currentApi.loadTrack(row.index, true);
      }
    }
    sync();
  });

  const stopButton = $('#lkQuickStop');
  if(stopButton) stopButton.addEventListener('click', stop);

  return Object.freeze({sync, play, pause, stop, show, preview, active:() => activeApi});
}

window.LK_EDITOR_QUICK_AUDIO = Object.freeze({create});
})();
