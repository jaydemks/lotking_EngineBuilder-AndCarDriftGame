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

  function menuMusic(){
    return GAME && GAME.systems && GAME.systems.menuMusic;
  }

  function sync(){
    const music = menuMusic();
    const mute = $('#lkQuickMute');
    const vol = $('#lkQuickMusicVol');
    if(!music){ $('#lkQuickAudio').style.display = 'none'; return; }
    const audio = music.audio || music;
    const off = !!(audio.paused || audio.muted || music.muted);
    if(mute) mute.textContent = off ? '♪ Off' : '♪ On';
    if(vol && Number.isFinite(audio.volume)) vol.value = Math.round(audio.volume * 100);
  }

  function play(){
    const music = menuMusic();
    if(!music) return Promise.resolve();
    const audio = music.audio || music;
    if(audio.muted) audio.muted = false;
    if(music.muted) music.muted = false;
    if(music.play) return music.play().catch(() => {});
    if(audio.play) return audio.play().catch(() => {});
    return Promise.resolve();
  }

  function pause(){
    const music = menuMusic();
    if(!music) return;
    const audio = music.audio || music;
    if(music.pause) music.pause();
    else if(audio.pause) audio.pause();
  }

  $('#lkQuickMute').addEventListener('click', () => {
    const music = menuMusic();
    if(!music) return;
    const audio = music.audio || music;
    if(audio.paused || audio.muted || music.muted){
      play().then(sync);
      return;
    }
    pause();
    sync();
  });

  $('#lkQuickMusicVol').addEventListener('input', e => {
    const music = menuMusic();
    if(!music) return;
    const audio = music.audio || music;
    const v = Math.max(0, Math.min(1, (+e.target.value || 0) / 100));
    if(music.setVolume) music.setVolume(v); else audio.volume = v;
    sync();
  });

  $('#lkQuickNext').addEventListener('click', () => {
    const music = menuMusic();
    if(!music) return;
    if(music.next) music.next();
    else if(music.getTracks && music.loadTrack){
      const tracks = music.getTracks({sort:'order'});
      if(tracks && tracks.length){
        const current = tracks.findIndex(t => t.index === ED.quickMusicIndex);
        const row = tracks[(current + 1 + tracks.length) % tracks.length];
        ED.quickMusicIndex = row.index;
        music.loadTrack(row.index, true);
      }
    }
    sync();
  });

  return Object.freeze({sync, play, pause});
}

window.LK_EDITOR_QUICK_AUDIO = Object.freeze({create});
})();
