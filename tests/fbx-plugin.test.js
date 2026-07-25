'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {File} = require('node:buffer');

const root = path.resolve(__dirname, '..');
const storage = new Map();
let pickerClicks = 0;
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  Promise,
  Map,
  Set,
  WeakSet,
  ArrayBuffer,
  File,
  URL:{createObjectURL:() => 'blob:test', revokeObjectURL:() => {}},
  localStorage:{
    getItem:key => storage.has(key) ? storage.get(key) : null,
    setItem:(key, value) => storage.set(key, String(value)),
  },
});
context.window = context;

function load(file){
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
}

load('js/plugins/plugin-api.js');
load('js/plugins/plugin-manager.js');
load('js/plugins/fbx-import-plugin.js');

const manager = context.LK_PLUGIN_MANAGER.create({
  THREE:{},
  root:{querySelector:selector => selector === '#lkAssetInput' ? {click:() => { pickerClicks++; }} : null},
  status:() => {},
});
const record = manager.register(context.LK_FBX_IMPORT_PLUGIN);
assert.equal(record.registered, true);

let descriptor = manager.list().find(plugin => plugin.id === 'fbx-glb-importer');
assert.ok(descriptor);
assert.equal(descriptor.enabled, true, 'FBX plugin should be enabled by default');
assert.equal(descriptor.builtIn, false, 'reference plugin should remain user-toggleable');

let importer = manager.extensions('assetImporter').find(extension => extension.type === 'fbx');
assert.ok(importer);
assert.equal(importer.accepts({name:'Character.FBX'}), true);
assert.equal(importer.accepts({name:'Character.glb'}), false);

manager.runCommand('fbx.import-files');
assert.equal(pickerClicks, 1, 'plugin command should open the shared asset picker');

manager.setEnabled('fbx-glb-importer', false);
assert.equal(manager.extensions('assetImporter').some(extension => extension.type === 'fbx'), false);
assert.equal(manager.command('fbx.import-files'), null);

manager.setEnabled('fbx-glb-importer', true);
importer = manager.extensions('assetImporter').find(extension => extension.type === 'fbx');
assert.ok(importer);

class FakeLoadingManager {
  setURLModifier(modifier){ this.urlModifier = modifier; return this; }
  addHandler(){ return this; }
}
class FakeFbxLoader {
  constructor(manager){ this.manager = manager; }
  parse(){
    assert.equal(this.manager.urlModifier('textures/body.png'), 'blob:test');
    return {animations:[{name:'Idle'}]};
  }
  loadAsync(url){
    assert.equal(url, 'blob:source');
    assert.equal(this.manager.urlModifier('textures/body.png'), 'blob:dependency');
    return Promise.resolve({animations:[{name:'Walk'}], userData:{}});
  }
}
class FakeGltfExporter {
  async parseAsync(root, options){
    assert.ok(['Idle','Walk'].includes(root.animations[0].name));
    assert.equal(options.binary, true);
    assert.equal(options.animations[0].name, root.animations[0].name);
    return new ArrayBuffer(24);
  }
}
(async function(){
  const converted = await importer.prepare([
    new File([new Uint8Array([1, 2, 3])], 'hero.fbx'),
    new File([new Uint8Array([4, 5, 6])], 'body.png', {type:'image/png'}),
  ], {
    THREE:{LoadingManager:FakeLoadingManager, FBXLoader:FakeFbxLoader, GLTFExporter:FakeGltfExporter},
  });
  assert.equal(converted.length, 1);
  assert.equal(converted[0].name, 'hero.glb');
  assert.equal(converted[0].type, 'model/gltf-binary');
  assert.equal(converted[0].__lkImportSource, 'hero.fbx');
  assert.equal(converted[0].__lkSourceFormat, 'fbx');
  assert.equal(converted[0].__lkSourceFile.name, 'hero.fbx');
  assert.equal(converted[0].__lkSourceDependencies[0].name, 'body.png');

  const previewLoader = manager.extensions('assetPreviewLoader').find(extension => extension.type === 'fbx-source');
  assert.ok(previewLoader, 'FBX plugin should publish its direct authoring preview loader');
  const preview = await previewLoader.load({
    sourceFormat:'fbx', sourceDbKey:'source:hero',
    sourceDependencies:[{name:'body.png', path:'textures/body.png', dbKey:'source:body'}],
  }, {
    THREE:{LoadingManager:FakeLoadingManager, FBXLoader:FakeFbxLoader},
    assetBlobs:{getUrl:key => Promise.resolve(key === 'source:hero' ? 'blob:source' : 'blob:dependency')},
  });
  assert.equal(preview.animations[0].name, 'Walk');

  const rebuilt = await importer.rebuild({
    name:'hero', source:'hero.fbx', sourceFormat:'fbx', sourceDbKey:'source:hero',
    sourceDependencies:[{name:'body.png', path:'textures/body.png', dbKey:'source:body'}],
  }, {
    THREE:{LoadingManager:FakeLoadingManager, FBXLoader:FakeFbxLoader, GLTFExporter:FakeGltfExporter},
    assetBlobs:{getUrl:key => Promise.resolve(key === 'source:hero' ? 'blob:source' : 'blob:dependency')},
  });
  assert.equal(rebuilt.name,'hero.glb');
  assert.equal(rebuilt.__lkSourceFormat,'fbx');

  const batch = await importer.prepare([
    new File([new Uint8Array([1])], 'idle.fbx'),
    new File([new Uint8Array([2])], 'run.fbx'),
    new File([new Uint8Array([3])], 'body.png', {type:'image/png'}),
  ], {THREE:{LoadingManager:FakeLoadingManager, FBXLoader:FakeFbxLoader, GLTFExporter:FakeGltfExporter}});
  assert.equal(Array.from(batch,file=>file.name).join(','),'idle.glb,run.glb');

  await assert.rejects(
    () => importer.prepare([{name:'broken.fbx'}], {THREE:{}}),
    /requires FBXLoader and GLTFExporter/,
  );

  console.log('fbx-plugin.test.js: all assertions passed');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
