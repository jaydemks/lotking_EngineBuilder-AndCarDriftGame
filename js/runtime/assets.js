/* =========================================================
   LOT KING — runtime assets module
   Centralized asset directories and path builders.
   ========================================================= */
(function(){
'use strict';

const dirs = Object.freeze({
  models: 'models/',
  music: 'musics/',
  media: 'media/',
  hdri: 'media/hdri/',
});

const paths = Object.freeze({
  model: file => dirs.models + file,
  music: file => dirs.music + file,
  media: file => dirs.media + file,
  hdri: file => dirs.hdri + file,
  menuMusic: dirs.music + 'menu/Num0  JustWait.mp3',
});

window.LK_RUNTIME_ASSETS = Object.freeze({
  dirs,
  paths,
  isFileMode: location.protocol === 'file:',
});
})();
