'use strict';

const assert = require('node:assert/strict');
const cinemaExport = require('../js/editor/cinema-video-export.js');

const fps = 24;
const frameCount = 48;
const chunks = Array.from({length:frameCount}, (_, index) => {
  const timestamp = Math.round(index * 1000000 / fps);
  const nextTimestamp = Math.round((index + 1) * 1000000 / fps);
  return {
    type:index % fps === 0 ? 'key' : 'delta',
    timestamp,
    duration:nextTimestamp - timestamp,
    data:new Uint8Array([index & 255, 0x11, 0x22, 0x33]),
  };
});

const webm = cinemaExport.muxWebM({
  width:1920,
  height:1080,
  fps,
  chunks,
  durationUs:2000000,
  codecId:'V_VP9',
});

assert.equal(webm.type, 'video/webm');
assert.ok(webm.size > chunks.reduce((sum, chunk) => sum + chunk.data.length, 0));
assert.equal(cinemaExport._internals.safeFileName('  Hero / Chase: Final  '), 'Hero-Chase-Final.webm');
assert.deepEqual(Array.from(cinemaExport._internals.vint(126)), [254]);
assert.deepEqual(Array.from(cinemaExport._internals.vint(127)), [64, 127]);

console.log('cinema video export muxer tests: ok');
