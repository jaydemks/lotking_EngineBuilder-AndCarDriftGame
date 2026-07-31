'use strict';
const assert = require('node:assert/strict');

global.window = global;
const removedBlobs = [];
global.LK_ASSET_BLOBS = {
  remove:key => { removedBlobs.push(key); return Promise.resolve(); },
};
require('../js/editor/asset-imports.js');

const asset = {id:'vehicle', key:'glb:sports-car', dbKey:'blob:sports-car', name:'Sports Car'};
const sceneInstance = {userData:{assetKey:asset.key}};
const unrelated = {userData:{assetKey:'glb:building'}};
const car = {userData:{modelDbKey:asset.dbKey, modelName:'Sports Car'}};
let placeholderRestored = 0;
const GAME = {
  player:{
    car,
    clearModel(){ placeholderRestored += 1; },
  },
  world:{registry:[sceneInstance, unrelated]},
};
let library = [asset];
const deletedObjects = [];
let dirty = 0;
const imports = global.LK_EDITOR_ASSET_IMPORTS.create({
  GAME,
  assetLibraryLoad:() => library,
  assetLibrarySave:next => { library = next; return true; },
  confirmEditorAction:() => Promise.resolve(true),
  performDeleteEntity:object => deletedObjects.push(object),
  markDirty:() => { dirty += 1; },
});

(async()=>{
  const ok = await imports.deleteImportedAssets([asset]);
  assert.equal(ok, true);
  assert.deepEqual(library, []);
  assert.deepEqual(deletedObjects, [sceneInstance]);
  assert.equal(placeholderRestored, 1);
  assert.equal(car.userData.modelDbKey, null);
  assert.equal(car.userData.assetSource, 'Built-in placeholder');
  assert.deepEqual(removedBlobs, [asset.dbKey]);
  assert.equal(dirty, 1);
  console.log('asset-delete-lifecycle.test.js: all assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
