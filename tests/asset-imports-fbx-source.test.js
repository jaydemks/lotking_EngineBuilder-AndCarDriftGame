'use strict';

const assert=require('node:assert/strict');
const {File}=require('node:buffer');
global.window=global;
const writes=[];
global.LK_ASSET_BLOBS={
  put:(key,blob)=>{writes.push({key,name:blob.name});return Promise.resolve(key);},
  remove:()=>Promise.resolve(),
};
require('../js/editor/asset-imports.js');

const source=new File([new Uint8Array([1,2,3])],'hero.fbx',{lastModified:11});
const texture=new File([new Uint8Array([4,5])],'body.png',{type:'image/png',lastModified:12});
const compiled=new File([new Uint8Array([0x67,0x6c,0x54,0x46])],'hero.glb',{type:'model/gltf-binary',lastModified:13});
Object.defineProperties(compiled,{
  __lkImportSource:{value:'hero.fbx'},
  __lkSourceFormat:{value:'fbx'},
  __lkSourceFile:{value:source},
  __lkSourceDependencies:{value:[texture]},
});

let saved=null;
let library=[];
const imports=global.LK_EDITOR_ASSET_IMPORTS.create({
  GAME:{i18n:{lang:'en'}},
  STORE:{loadGlb:()=>Promise.resolve({animations:[{name:'Idle'}],traverse:visitor=>visitor({isMesh:true})})},
  supportedAssetFiles:files=>Array.from(files),
  assetKeyFromFile:()=> 'glb:hero',
  assetDbKeyFromFile:()=> 'glb:hero:compiled',
  upsertImportedAsset:(file,data)=>{saved={file,data};return Object.assign({id:'hero',kind:'glb',source:file.__lkImportSource||file.name,sourceFormat:file.__lkSourceFormat||'glb'},data);},
  assetLibraryLoad:()=>library,
  assetLibrarySave:list=>{library=list;return true;},
  refreshAssetsPanel:()=>{},
  setAssetLoading:()=>{},
  status:()=>{},
});

(async()=>{
  const result=await imports.importAssetFiles([compiled],{__pluginPrepared:true});
  assert.equal(result.length,1);
  assert.equal(saved.file.name,'hero.glb');
  assert.equal(saved.data.dbKey,'glb:hero:compiled');
  assert.match(saved.data.sourceDbKey,/^source:fbx:hero\.fbx:/);
  assert.equal(saved.data.sourceDependencies.length,1);
  assert.equal(saved.data.sourceDependencies[0].name,'body.png');
  assert.equal(saved.data.sourceName,'hero.fbx');
  assert.equal(saved.data.sourceSize,3);
  assert.equal(saved.data.sourceLastModified,11);
  assert.equal(writes.length,3,'compiled GLB, original FBX and linked texture must be persisted');
  const materialMap=new File([new Uint8Array([9,8,7,6])],'paint-normal.png',{type:'image/png',lastModified:14});
  const storedMap=await imports.storeMaterialTextureFile(materialMap);
  assert.equal(storedMap.dbKey,'glb:hero:compiled');
  assert.equal(saved.data.src,null,'material textures must never persist an inline data URL');
  assert.equal(saved.data.dbKey,'glb:hero:compiled');
  assert.equal(writes.length,4,'the material map must be written directly to the blob database');
  library=[result[0]];
  let checked=await imports.refreshFbxSource(result[0],new File([new Uint8Array([1,2,3])],'hero.fbx',{lastModified:11}));
  assert.equal(checked.changed,false);
  assert.notEqual(result[0].compileState,'stale');
  checked=await imports.refreshFbxSource(result[0],new File([new Uint8Array([1,2,3,4])],'hero.fbx',{lastModified:22}));
  assert.equal(checked.changed,true);
  assert.equal(result[0].compileState,'stale');
  assert.equal(result[0].sourceSize,4);
  assert.equal(result[0].sourceLastModified,22);
  console.log('asset-imports-fbx-source.test.js: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
