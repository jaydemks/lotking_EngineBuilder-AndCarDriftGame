'use strict';
const assert=require('node:assert/strict');
global.window=global;
const removed=[];
global.LK_ASSET_BLOBS={remove:key=>{removed.push(key);return Promise.resolve();}};
require('../js/editor/asset-imports.js');

const original=[
  {id:'a',name:'Walk',dbKey:'blob-a',sourceDbKey:'fbx-a',sourceDependencies:[{dbKey:'texture-a'}]},
  {id:'b',name:'Run',dbKey:'blob-b'},
  {id:'c',name:'Keep',dbKey:'blob-c'},
];
let library=original.slice(),refreshes=0,deleted=null,confirmation=null;
const imports=global.LK_EDITOR_ASSET_IMPORTS.create({
  assetLibraryLoad:()=>library,
  assetLibrarySave:next=>{library=next;return true;},
  confirmEditorAction:config=>{confirmation=config;return Promise.resolve(true);},
  refreshAssetsPanel:()=>{refreshes++;},
  onImportedAssetsDeleted:assets=>{deleted=assets;},
});

(async()=>{
  const ok=await imports.deleteImportedAssets([original[0],original[1],original[0]]);
  assert.equal(ok,true);
  assert.deepEqual(library.map(asset=>asset.id),['c']);
  assert.deepEqual(removed.sort(),['blob-a','blob-b','fbx-a','texture-a']);
  assert.deepEqual(deleted.map(asset=>asset.id),['a','b']);
  assert.equal(refreshes,1);
  assert.match(confirmation.title,/selected imported assets/i);
  console.log('asset-imports-batch-delete.test.js: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
