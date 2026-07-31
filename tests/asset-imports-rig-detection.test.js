'use strict';

const assert=require('node:assert/strict');
global.window=global;
require('../js/editor/asset-imports.js');

const imports=global.LK_EDITOR_ASSET_IMPORTS.create({
  GAME:{i18n:{lang:'en'}},
  STORE:{},
});

function hierarchy(names, flags){
  const root={name:'Root',children:[],traverse(visitor){
    const visit=node=>{visitor(node);(node.children||[]).forEach(visit);};
    visit(this);
  }};
  names.forEach(name=>{
    const node=Object.assign({name,parent:root,children:[]},flags&&flags[name]);
    root.children.push(node);
  });
  return root;
}

const vehicle=hierarchy(['wheel_fl_spin','wheel_fr_spin','wheel_rl_spin','wheel_rr_spin','Body']);
const vehicleMeta=imports.glbMetadataFromObject(vehicle);
assert.equal(vehicleMeta.rigged,true);
assert.equal(vehicleMeta.vehicleRigged,true);
assert.equal(vehicleMeta.skeletonRigged,false);
assert.equal(vehicleMeta.rigType,'vehicle');
assert.equal(vehicleMeta.vehicleWheelCount,4);

const genericVehicle=hierarchy(['Ruota Anteriore SX','Ruota Anteriore DX','Ruota Posteriore SX','Ruota Posteriore DX']);
assert.equal(imports.glbMetadataFromObject(genericVehicle).vehicleRigged,true);

const staticModel=hierarchy(['Body','Inner headlights','headlights']);
const staticMeta=imports.glbMetadataFromObject(staticModel);
assert.equal(staticMeta.rigged,false);
assert.equal(staticMeta.rigType,'static');

const skeleton=hierarchy(['Body','RootBone'],{
  Body:{isMesh:true,isSkinnedMesh:true},
  RootBone:{isBone:true},
});
skeleton.animations=[{name:'Idle'}];
const skeletonMeta=imports.glbMetadataFromObject(skeleton);
assert.equal(skeletonMeta.rigged,true);
assert.equal(skeletonMeta.skeletonRigged,true);
assert.equal(skeletonMeta.vehicleRigged,false);
assert.equal(skeletonMeta.rigType,'skeleton');
assert.deepEqual(skeletonMeta.clips,['Idle']);

console.log('asset-imports-rig-detection.test.js: all assertions passed');
