'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');

const values=new Map();
global.window=global;
global.localStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key),
};
require(path.join('..','js','runtime','gameplay-difficulty.js'));

const api=global.LK_RUNTIME_GAMEPLAY_DIFFICULTY;
assert.equal(api.current(),'normal');
assert.equal(api.set('easy'),'easy');
assert.equal(values.get('lotking.gameplayDifficulty.v1'),'easy');
assert.ok(api.profile('soccer').keeperReaction>api.profiles.normal.soccer.keeperReaction);
assert.ok(api.profile('soccer').keeperReach<1);
assert.equal(api.set('hard'),'hard');
assert.ok(api.profile('soccer').keeperPrediction>1);
assert.ok(api.profile().opponentSpeed>api.profiles.normal.opponentSpeed);
assert.equal(api.clearOverride(),'normal');
assert.equal(values.has('lotking.gameplayDifficulty.v1'),false);

console.log('gameplay-difficulty.test.js: all assertions passed');
