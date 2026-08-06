/* =========================================================
   LOT KING - Procedural island terrain
   One deterministic field drives render, ground queries and Cannon samples.
   ========================================================= */
(function(root,factory){
'use strict';const api=factory();root.LK_RUNTIME_PROCEDURAL_TERRAIN=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const SEGMENTS=Object.freeze({low:48,medium:72,high:104,ultra:144});
const PHYSICS_SEGMENTS=Object.freeze({low:33,medium:49,high:65,ultra:81});
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}function mix(a,b,t){return a+(b-a)*t;}function smooth(t){t=clamp(t,0,1);return t*t*(3-2*t);}
function hash(x,z,seed){let h=(Math.imul(x|0,374761393)+Math.imul(z|0,668265263)+Math.imul(seed|0,1442695041))|0;h=(h^(h>>>13));h=Math.imul(h,1274126177);return ((h^(h>>>16))>>>0)/4294967295;}
function valueNoise(x,z,seed){const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(x-ix),fz=smooth(z-iz),a=hash(ix,iz,seed),b=hash(ix+1,iz,seed),c=hash(ix,iz+1,seed),d=hash(ix+1,iz+1,seed);return mix(mix(a,b,fx),mix(c,d,fx),fz)*2-1;}
function fbm(x,z,seed){let value=0,amp=.58,total=0,frequency=1;for(let i=0;i<4;i++){value+=valueNoise(x*frequency,z*frequency,seed+i*977)*amp;total+=amp;amp*=.48;frequency*=2.07;}return value/total;}
function roundedRectDistance(x,z,bounds){const qx=Math.abs(x-bounds.cx)-bounds.halfX,qz=Math.abs(z-bounds.cz)-bounds.halfZ,ox=Math.max(qx,0),oz=Math.max(qz,0);return Math.hypot(ox,oz)+Math.min(Math.max(qx,qz),0);}
function createField(options){
  const cfg=options||{},bounds=cfg.bounds||{cx:0,cz:0,halfX:120,halfZ:120},top=Number(cfg.top)||0,sea=Number.isFinite(Number(cfg.seaLevel))?Number(cfg.seaLevel):-8,seabed=Number.isFinite(Number(cfg.seabedY))?Number(cfg.seabedY):-22,shore=Math.max(8,Number(cfg.shoreWidth)||90),relief=Math.max(0,Number(cfg.relief)||12),seed=Number(cfg.seed)||1337;
  function sampleHeight(x,z){
    const outside=roundedRectDistance(x,z,bounds);if(outside<=0)return top;
    const broad=fbm((x-bounds.cx)/135,(z-bounds.cz)/135,seed),detail=fbm((x-bounds.cx)/36,(z-bounds.cz)/36,seed+41),edgeWeight=smooth(clamp(outside/(shore*.22),0,1)),coastOffset=(broad*.18+detail*.045)*shore*edgeWeight,t=clamp((outside+coastOffset)/shore,0,1),fall=smooth(t),ridge=Math.sin(Math.PI*clamp(t/.72,0,1))*relief*(1-fall)*(.72+broad*.28),erosion=detail*relief*.18*Math.sin(Math.PI*t);
    return mix(top,seabed,fall)+ridge+erosion;
  }
  function sample(x,z){const height=sampleHeight(x,z),outside=roundedRectDistance(x,z,bounds),region=outside<=0?'plateau':height>sea+.35?'land':height>sea-1.25?'shore':'seabed';return {height,waterHeight:sea,depth:Math.max(0,sea-height),region};}
  function normalAt(x,z){const e=Math.max(.12,shore/500),dx=sampleHeight(x+e,z)-sampleHeight(x-e,z),dz=sampleHeight(x,z+e)-sampleHeight(x,z-e),nx=-dx/(2*e),ny=1,nz=-dz/(2*e),length=Math.hypot(nx,ny,nz)||1;return {x:nx/length,y:ny/length,z:nz/length};}
  return Object.freeze({bounds:Object.freeze(Object.assign({},bounds)),top,seaLevel:sea,seabedY:seabed,shoreWidth:shore,relief,seed,heightAt:sampleHeight,sample,normalAt,distanceAt:(x,z)=>roundedRectDistance(x,z,bounds)});
}
function biomeColor(THREE,field,height,normal){const deep=new THREE.Color('#142b36'),shallow=new THREE.Color('#355d58'),sand=new THREE.Color('#bda978'),grass=new THREE.Color('#496d42'),rock=new THREE.Color('#59615d'),high=new THREE.Color('#7d8277');let color;if(height<field.seaLevel-3)color=deep;else if(height<field.seaLevel-.2)color=shallow.clone().lerp(sand,clamp((height-(field.seaLevel-3))/2.8,0,1));else if(height<field.seaLevel+1.4)color=sand;else color=grass.clone().lerp(rock,clamp((1-normal.y-.12)*2.2,0,1)).lerp(high,clamp((height-field.top)/Math.max(8,field.relief*1.25),0,1)*.28);return color;}
function build(THREE,field,options){
  options=options||{};const quality=SEGMENTS[options.quality]?options.quality:'medium',segments=SEGMENTS[quality],margin=Math.max(field.shoreWidth*1.45,80),half=Math.max(field.bounds.halfX,field.bounds.halfZ)+margin,size=half*2,vertices=[],colors=[],indices=[],color=new THREE.Color();
  for(let iz=0;iz<=segments;iz++)for(let ix=0;ix<=segments;ix++){const x=field.bounds.cx-half+size*ix/segments,z=field.bounds.cz-half+size*iz/segments,y=field.heightAt(x,z),renderY=field.distanceAt(x,z)<=0?y-.035:y,normal=field.normalAt(x,z);vertices.push(x,renderY,z);color.copy(biomeColor(THREE,field,y,normal));colors.push(color.r,color.g,color.b);}
  for(let iz=0;iz<segments;iz++)for(let ix=0;ix<segments;ix++){const a=iz*(segments+1)+ix,b=a+1,c=a+segments+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const geometry=new THREE.BufferGeometry();geometry.setIndex(indices);geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.92,metalness:.02});const mesh=new THREE.Mesh(geometry,material);mesh.name='Procedural World · Island Terrain';mesh.receiveShadow=quality!=='low';mesh.castShadow=false;mesh.userData.lkProceduralTerrain=true;mesh.userData.lkProceduralOwned=true;return mesh;
}
function physicsGrid(field,quality){const segments=PHYSICS_SEGMENTS[quality]||PHYSICS_SEGMENTS.medium,half=Math.max(field.bounds.halfX,field.bounds.halfZ)+Math.max(field.shoreWidth*1.45,80),size=half*2,step=size/(segments-1),matrix=[];for(let ix=0;ix<segments;ix++){const row=[];for(let iz=0;iz<segments;iz++)row.push(field.heightAt(field.bounds.cx-half+ix*step,field.bounds.cz+half-iz*step));matrix.push(row);}return {matrix,elementSize:step,originX:field.bounds.cx-half,originZ:field.bounds.cz+half,size,segments};}
return Object.freeze({SEGMENTS,PHYSICS_SEGMENTS,createField,build,physicsGrid,roundedRectDistance});
});
