/* =========================================================
   LOT KING - menu music runtime module
   Start-screen music playback, track switching and uploads.
   ========================================================= */
(function(){
'use strict';

function create(options){
  const opts = options || {};
  const libApi = window.LK_RUNTIME_MUSIC_LIBRARY;
  const library = libApi.create(opts.tracks || []);
  const first = library.at(0);
  const audio = new Audio(libApi.audioSrc(first && first.url));
  let button = null;
  let autoStartBound = false;
  let fadeTimer = null;
  audio.loop = true;
  audio.volume = opts.volume == null ? .55 : opts.volume;

  function editorActive(){
    const editor = document.getElementById('lkEditor');
    return !!(editor && editor.classList.contains('active'));
  }

  function targetVolume(){
    return opts.getVolume ? Math.max(0, Math.min(1, Number(opts.getVolume()) || 0)) : (opts.volume == null ? .55 : opts.volume);
  }

  function stopFade(){
    if(fadeTimer){
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  function syncButton(){
    if(!button) return;
    button.textContent = audio.paused ? '♪ MUSIC OFF' : '♪ MUSIC ON';
    button.classList.toggle('off', audio.paused);
  }

  function setVolume(value){
    stopFade();
    audio.volume = Math.max(0, Math.min(1, Number(value) || 0));
  }

  function play(){
    if(editorActive()) return Promise.resolve();
    stopFade();
    audio.volume = targetVolume();
    return audio.play().then(syncButton);
  }

  function pause(){
    stopFade();
    audio.pause();
    syncButton();
  }

  function fadeOut(duration){
    stopFade();
    if(audio.paused){
      syncButton();
      return Promise.resolve();
    }
    const ms = Math.max(250, Number(duration) || 1800);
    const start = audio.volume;
    const t0 = performance.now();
    return new Promise(resolve => {
      fadeTimer = setInterval(() => {
        const t = Math.min(1, (performance.now() - t0) / ms);
        const eased = 1 - Math.pow(1 - t, 3);
        audio.volume = Math.max(0, start * (1 - eased));
        if(t >= 1){
          stopFade();
          audio.pause();
          audio.volume = targetVolume();
          syncButton();
          resolve();
        }
      }, 33);
    });
  }

  function toggle(){
    if(editorActive()) return Promise.resolve();
    if(audio.paused){
      return audio.play()
        .then(() => {
          if(button){
            button.textContent = '♪ MUSIC ON';
            button.classList.remove('off');
          }
        })
        .catch(() => {
          if(button) button.textContent = '♪ MUSIC UNAVAILABLE';
        });
    }
    pause();
    return Promise.resolve();
  }

  function bindButton(el){
    if(!el) return;
    button = el;
    button.addEventListener('click', toggle);
    syncButton();
  }

  function bindAutoStart(overlay, isStarted){
    if(!overlay || autoStartBound) return;
    autoStartBound = true;
    overlay.addEventListener('pointerdown', () => {
      if(editorActive()) return;
      if(!(isStarted && isStarted()) && audio.paused) play().catch(() => {});
    }, {once:true});
  }

  function loadTrack(index, autoplay){
    const track = library.at(index);
    if(!track) return;
    const wasPlaying = autoplay || !audio.paused;
    audio.src = libApi.audioSrc(track.url);
    audio.loop = true;
    if(opts.getVolume) setVolume(opts.getVolume());
    if(wasPlaying) play().catch(() => {});
  }

  function addTracks(files){
    const added = library.addFiles(files, 'Menu music upload');
    if(added.length && opts.popup) opts.popup('MENU TRACKS ADDED: ' + added.length, '#4be3a0');
    return added;
  }

  return {
    audio,
    bindButton,
    bindAutoStart,
    syncButton,
    setVolume,
    play,
    pause,
    fadeOut,
    toggle,
    loadTrack,
    addTracks,
    getTracks: options => library.list(options),
  };
}

window.LK_RUNTIME_MENU_MUSIC = Object.freeze({create});
})();
