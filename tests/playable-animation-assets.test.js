'use strict';

const assert = require('node:assert/strict');

global.window = global;
global.LK_ASSET_BLOBS = {getUrl:async () => 'blob:animation-run'};
const fetched=[];
global.fetch = async url => {fetched.push(String(url));return ({
  ok:url === 'blob:animation-run',
  blob:async () => new Blob([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], {type:'model/gltf-binary'}),
});};
global.FileReader = class FileReader {
  readAsDataURL(blob){
    blob.arrayBuffer().then(buffer => {
      this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(buffer).toString('base64');
      if(this.onload) this.onload();
    }).catch(error => { if(this.onerror) this.onerror(error); });
  }
};

require('../js/editor/playable-export-assets.js');

const sourceRef = {key:'glb:run', dbKey:'db:run', src:null, name:'run.glb'};
const slotValue = JSON.stringify({clip:'mixamo.com', asset:sourceRef});
const commonValue = JSON.stringify(sourceRef);
const graph = {characterPawn:{model:{key:'glb:run',dbKey:'db:run',src:null,name:'character.glb'},animationSet:[{id:'run-forward',state:'grounded',clip:'mixamo.com',asset:{key:'glb:run',dbKey:'db:run',src:null,name:'run.glb'}}]},variables:[
  {name:'AnimRun', type:'string', binding:'animations.run', value:slotValue},
  {name:'AnimationLibrary', type:'string', binding:'animationLibrary', value:commonValue},
]};
const project = {scene:{added:[{
  kind:'logicElement', name:'Character', graph,
  variableOverrides:{AnimRun:slotValue},
}]}};

const api = global.LK_EDITOR_PLAYABLE_EXPORT_ASSETS.create({
  assetLibraryLoad:() => [{kind:'glb', key:'glb:run', dbKey:'db:run', name:'run.glb'}],
});

api.preparePlayableProject(project).then(async result => {
  const entry = result.project.scene.added[0];
  const slot = JSON.parse(entry.graph.variables[0].value);
  const common = JSON.parse(entry.graph.variables[1].value);
  const override = JSON.parse(entry.variableOverrides.AnimRun);
  [slot.asset, common, override.asset,entry.graph.characterPawn.model,entry.graph.characterPawn.animationSet[0].asset].forEach(ref => {
    assert.match(ref.src, /^data:model\/gltf-binary;base64,/);
    assert.equal(ref.dbKey, null);
  });
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(Array.from(new Set(fetched)),['blob:animation-run']);

  const portable = await api.preparePlayableProject(project, {
    stripEmbeddedLevels:false,
    deduplicateEmbeddedAssets:true,
  });
  const portableEntry = portable.project.scene.added[0];
  const portableRefs = [
    JSON.parse(portableEntry.graph.variables[0].value).asset,
    JSON.parse(portableEntry.graph.variables[1].value),
    JSON.parse(portableEntry.variableOverrides.AnimRun).asset,
    portableEntry.graph.characterPawn.model,
    portableEntry.graph.characterPawn.animationSet[0].asset,
  ];
  assert.equal(portableRefs.filter(ref => /^data:model\/gltf-binary;base64,/.test(ref.src || '')).length, 1);
  portableRefs.forEach(ref => assert.equal(ref.dbKey, 'db:run'));
  console.log('playable-animation-assets.test.js: all assertions passed');
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
