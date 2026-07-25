'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../js/runtime/character-pawn-base.js');

(async () => {
  const calls = [];
  const sourceRoot = {name:'Mixamo FBX source'};
  const sourceClip = {
    name:'mixamo.com',
    userData:{},
    clone(){
      return {name:this.name,userData:Object.assign({},this.userData)};
    },
  };

  global.THREE = {
    GLTFLoader: class {
      load(url,onLoad,onProgress,onError){
        calls.push(['gltf',url]);
        onError(new Error('canonical GLB missing'));
      }
    },
  };
  global.LK_ASSET_BLOBS = {
    getUrl(key){ calls.push(['blob',key]); return Promise.resolve('blob:missing-runtime-glb'); },
  };
  global.LK_FBX_IMPORT_PLUGIN = {
    loadSource(ref){
      calls.push(['fbx',ref.sourceDbKey]);
      sourceRoot.animations=[sourceClip];
      return Promise.resolve(sourceRoot);
    },
  };

  const library = await global.LK_RUNTIME_CHARACTER_PAWN_BASE.loadAnimationLibrary({
    dbKey:'animation:idle:runtime',
    sourceFormat:'fbx',
    sourceDbKey:'animation:idle:source',
  });

  assert.equal(library.source,'fbx');
  assert.deepEqual(library.names,['mixamo.com']);
  assert.equal(library.clips[0].userData.lkAnimationAssetKey,'animation:idle:runtime');
  assert.equal(library.clips[0].userData.lkAnimationAssetSource,'fbx');
  assert.equal(library.clips[0].__lkAnimationSourceRoot,sourceRoot);
  assert.deepEqual(calls,[
    ['blob','animation:idle:runtime'],
    ['gltf','blob:missing-runtime-glb'],
    ['fbx','animation:idle:source'],
  ]);
  console.log('ok - runtime animation slot falls back from missing GLB to preserved FBX source');
})().catch(error => {
  console.error(error);
  process.exitCode=1;
});
