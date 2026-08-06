/* =========================================================
   LOT KING - Deterministic distant archipelago
   One instanced draw call for cinematic horizon silhouettes.
   ========================================================= */
(function(root,factory){
'use strict';const api=factory();root.LK_RUNTIME_PROCEDURAL_ARCHIPELAGO=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
function random(seed){let state=(Number(seed)||1)>>>0;return function(){state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function layout(config,bounds,seaLevel){const rand=random((config.seed||0)+7919),items=[],count=Math.max(0,Math.round(config.count)||0),base=Math.max(bounds.halfX,bounds.halfZ),minimum=Math.max(base+160,Number(config.minDistance)||520),maximum=Math.max(minimum,base+Number(config.maxDistance)||1450);for(let i=0;i<count;i++){const angle=rand()*Math.PI*2,distance=minimum+(maximum-minimum)*Math.pow(rand(),.72),size=(Number(config.minSize)||28)+((Number(config.maxSize)||145)-(Number(config.minSize)||28))*Math.pow(rand(),1.35),height=Math.max(3,size*(.12+rand()*.18),Number(config.relief||55)*(.3+rand()*.7));items.push({x:bounds.cx+Math.cos(angle)*distance,z:bounds.cz+Math.sin(angle)*distance,y:seaLevel-height*.22,size,height,rotation:rand()*Math.PI*2,stretch:.65+rand()*.9});}return items;}
function build(THREE,config,bounds,seaLevel){const items=layout(config,bounds,seaLevel),group=new THREE.Group();group.name='Procedural World · Distant Archipelago';group.userData.lkProceduralOwned=true;if(!items.length)return {group,items,drawCalls:0};const geometry=new THREE.ConeGeometry(1,1,10,3,false);geometry.translate(0,.5,0);const material=new THREE.MeshStandardMaterial({color:0x52684d,roughness:.98,metalness:0,flatShading:true}),mesh=new THREE.InstancedMesh(geometry,material,items.length),dummy=new THREE.Object3D();mesh.name='Procedural Horizon Islands';mesh.castShadow=false;mesh.receiveShadow=false;mesh.userData.lkProceduralOwned=true;mesh.userData.lkDistantArchipelago=true;items.forEach((item,index)=>{dummy.position.set(item.x,item.y,item.z);dummy.rotation.set(0,item.rotation,0);dummy.scale.set(item.size,item.height,item.size*item.stretch);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere&&mesh.computeBoundingSphere();group.add(mesh);return {group,items,drawCalls:1};}
return Object.freeze({random,layout,build});
});
