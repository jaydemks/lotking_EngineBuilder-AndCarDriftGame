'use strict';
const assert=require('node:assert/strict');
global.window=global;
global.THREE=require('three');
global.localStorage={getItem(){return null;},setItem(){}};
require('../js/runtime/cloth-system.js');
require('../js/plugins/plugin-api.js');
require('../js/plugins/plugin-manager.js');
require('../js/plugins/cloth-authoring-plugin.js');

function riggedCape(){
  const THREE=global.THREE,root=new THREE.Group(),bone=new THREE.Bone();bone.name='mixamorigSpine';
  const geometry=new THREE.PlaneGeometry(1,1,2,2),count=geometry.attributes.position.count;
  const skinIndex=new Uint16Array(count*4),skinWeight=new Float32Array(count*4),colors=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    skinIndex[i*4]=0;skinWeight[i*4]=1;
    const pinned=geometry.attributes.position.getY(i)>.35;
    colors[i*3]=1;colors[i*3+1]=pinned?1:0;colors[i*3+2]=pinned?1:0;
  }
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndex,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeight,4));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true}));mesh.name='Hero Cape';
  root.add(bone);root.add(mesh);mesh.bind(new THREE.Skeleton([bone]));root.updateMatrixWorld(true);
  return {root,mesh};
}

{
  const {root,mesh}=riggedCape(),runtime=global.LK_RUNTIME_CLOTH,report=runtime.inspect(root);
  assert.equal(report.meshes.length,1);
  assert.equal(report.meshes[0].autoCandidate,true);
  const config=runtime.normalizeConfig({wind:[1,0,0],pieces:[{meshName:'Hero Cape',pinMode:'vertex-color'}]});
  const controller=runtime.create(root,config);
  assert.equal(controller.stats().effectiveBackend,'cpu-portable');
  assert.equal(controller.stats().pieces.length,1);
  assert.equal(mesh.visible,false,'authored garment is replaced only while its cloth overlay is active');
  const overlay=controller.overlays()[0],position=overlay.geometry.attributes.position;
  let freeIndex=0;for(let i=1;i<position.count;i++)if(position.getY(i)<position.getY(freeIndex))freeIndex=i;
  const before=position.getY(freeIndex);
  for(let i=0;i<12;i++)controller.update(1/60);
  assert.ok(position.getY(freeIndex)<before,'free fabric vertices respond to gravity');
  const painted=controller.paintAtWorld('Hero Cape',new global.THREE.Vector3(position.getX(freeIndex),position.getY(freeIndex),position.getZ(freeIndex)),.3,0);
  assert.ok(painted&&painted.indices.length,'viewport pin brush updates a sparse vertex mask');
  controller.dispose();
  assert.equal(mesh.visible,true,'disposing Play/preview restores the authored SkinnedMesh');
}

{
  const manager=global.LK_PLUGIN_MANAGER.create({});
  manager.register(global.LK_CLOTH_AUTHORING_PLUGIN);
  assert.equal(manager.isEnabled('cloth-authoring'),true);
  assert.ok(manager.extensions('pawnStudioAugment').some(item=>item.id==='character-cloth'));
  assert.ok(manager.extensions('runtimeHook').some(item=>item.name==='character-cloth'));
}

console.log('cloth-system.test.js: all assertions passed');
