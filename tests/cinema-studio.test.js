'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cinemaStudio = require('../js/editor/cinema-studio.js');

const api = cinemaStudio._internals;
assert.equal(api.CINEMA_MAX_DURATION, 86400);
assert.deepEqual(api.cubicBezierArray([0,0,0], [0,1,0], [1,1,0], [1,0,0], 0), [0,0,0]);
assert.deepEqual(api.cubicBezierArray([0,0,0], [0,1,0], [1,1,0], [1,0,0], 1), [1,0,0]);

const keys = [
  {position:[0,0,0], spatialMode:'auto'},
  {position:[5,3,0], spatialMode:'auto'},
  {position:[10,0,0], spatialMode:'auto'},
];
assert.deepEqual(api.spatialPosition({pathMode:'linear'}, keys, 0, .5), [2.5,1.5,0]);
const smoothMid = api.spatialPosition({pathMode:'smooth'}, keys, 0, .5);
assert.equal(smoothMid[0], 2.1875);
assert.ok(smoothMid[1] > 1.5, 'smooth spline must bend independently of temporal easing');

const editable = [
  {position:[0,0,0], spatialMode:'broken', tangentOut:[0,4,0]},
  {position:[4,0,0], spatialMode:'broken', tangentIn:[0,4,0]},
];
assert.ok(api.spatialPosition({pathMode:'bezier'}, editable, 0, .5)[1] > 2.9);

const dive = api.buildMotionPreset('camera-dive-level', {
  position:[10,5,2], rotation:[0,.5,0], scale:[1,1,1],
}, 3, 12, {right:[1,0,0], up:[0,1,0], forward:[0,0,-1]}, 10);
assert.equal(dive.length, 4);
assert.equal(dive[0].time, 3);
assert.equal(dive[3].time, 15);
assert.deepEqual(dive[0].position, [10,5,2]);
assert.ok(dive[1].position[1] < 5, 'dive preset must descend before levelling');
assert.ok(dive[3].position[2] < dive[2].position[2], 'camera preset follows the supplied camera-forward basis');
assert.equal(dive[3].position[1], dive[2].position[1], 'the final dive segment is straight and level');
assert.equal(dive[1].curve, 'ease-in-out');
assert.equal(dive[3].curve, 'linear');
const diveTail = api.spatialPosition({pathMode:'bezier'}, dive, 2, .5);
assert.ok(Math.abs(diveTail[1] - dive[2].position[1]) < 1e-9, 'explicit Bezier tail stays level');
assert.ok(Math.abs(diveTail[2] - (dive[2].position[2] + dive[3].position[2]) / 2) < 1e-9, 'explicit Bezier tail stays straight');

const objectPresets = api.MOTION_PRESETS.filter(preset => preset.kind === 'object');
const cameraPresets = api.MOTION_PRESETS.filter(preset => preset.kind === 'camera');
assert.ok(objectPresets.length >= 5);
assert.ok(cameraPresets.length >= 5);

const source = fs.readFileSync(path.join(__dirname, '../js/editor/cinema-studio.js'), 'utf8');
const templateSource = fs.readFileSync(path.join(__dirname, '../js/editor/editor-template.js'), 'utf8');
assert.match(source, /lotking-cinema-sequence/);
assert.match(source, /exportInteractiveLevel/);
assert.match(source, /cinemaPathHandle/);
assert.match(source, /Change sequence duration/);
assert.match(source, /Apply .* motion preset/);
assert.match(templateSource, /lkCinemaTlMotionPreset/);
assert.match(templateSource, /lkCinemaTlMotionDuration/);
assert.match(templateSource, /lkCinemaTlMotionDistance/);
assert.match(templateSource, /lkCinemaTlEditPath/);

console.log('cinema studio sequencer tests: ok');
