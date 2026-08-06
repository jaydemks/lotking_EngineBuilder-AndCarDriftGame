'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

global.window=global;
const storage=new Map();
global.localStorage={getItem:key=>storage.has(key)?storage.get(key):null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};

require('../js/plugins/plugin-api.js');
require('../js/plugins/plugin-manager.js');
require('../js/editor/asset-library.js');
require('../js/editor/asset-panel.js');

const manager=global.LK_PLUGIN_MANAGER.create({});
manager.register({
  id:'weather-pack',name:'Weather Pack',version:'1.0.0',enabledByDefault:true,
  register(api){api.assetProvider('weather-assets',{assets:()=>[{id:'storm-cloud',name:'Storm Cloud',type:'effect',icon:'☁',place(){return {placed:true};}}]});},
});
assert.equal(manager.extensions('assetProvider').length,1);
assert.equal(manager.extensions('assetProvider')[0].pluginId,'weather-pack');

const panel=global.LK_EDITOR_ASSET_PANEL.create({
  document:{},GAME:{i18n:{lang:'en'}},STORE:{},ED:{assetFilters:{}},
  pluginAssetProviders:()=>manager.extensions('assetProvider'),pluginList:()=>manager.list(),
  assetFilterKey:item=>item.filterType||'other',assetMatchesSearch:()=>true,
  placeAssetRef(){},spawnPointAhead:()=>({x:0,y:0,z:0}),
});
const pluginAssets=panel.pluginItems('');
assert.equal(pluginAssets.length,1);
assert.equal(pluginAssets[0].assetOrigin,'plugin');
assert.equal(pluginAssets[0].pluginName,'Weather Pack');
assert.match(pluginAssets[0].ref,/^plugin:weather-pack:weather-assets:/);
manager.setEnabled('weather-pack',false);
assert.equal(panel.pluginItems('').length,0,'disabled plugins cannot leak assets into the panel');

storage.set('lotking.assetLibrary.v1',JSON.stringify({version:1,assets:[{id:'old-import',key:'glb:old',kind:'glb',name:'Old'}]}));
const library=global.LK_EDITOR_ASSET_LIBRARY.create({store:{nextId:()=>1}});
assert.equal(library.load()[0].assetOrigin,'user','legacy imports migrate to User Assets');
const imported=library.upsert({name:'tree.glb',type:'model/gltf-binary',size:12,lastModified:1},{dbKey:'tree-db'});
assert.equal(imported.assetOrigin,'user');

const source=fs.readFileSync(path.join(__dirname,'../js/editor/asset-panel.js'),'utf8');
['ENGINE ASSETS','USER ASSETS','PLUGIN ASSETS'].forEach(label=>assert.ok(source.includes(label),'missing origin section '+label));
assert.ok(source.includes("assetOrigin:'engine'"),'bundled/templates must be marked as engine-owned');
assert.ok(source.includes("assetOrigin:'user'"),'project content must be marked as user-owned');

console.log('asset-origin-sections.test.js: all assertions passed');
