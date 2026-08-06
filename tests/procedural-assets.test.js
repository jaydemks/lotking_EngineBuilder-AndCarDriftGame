'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const THREE=require('three');
global.window=global;global.THREE=THREE;
require('../js/engine/procedural-assets.js');
require('../js/editor/asset-panel.js');
require('../js/editor/asset-catalog.js');
const API=global.LK_ENGINE_PROCEDURAL_ASSETS;
const root=file=>path.join(__dirname,'..',file);
const source=file=>fs.readFileSync(root(file),'utf8');
function test(name,run){try{run();console.log('ok - '+name);}catch(error){console.error('not ok - '+name);throw error;}}

function primitive(kind,props){
  const s=props&&props.geometry&&props.geometry.segments||{};let geometry;
  if(kind==='sphere')geometry=new THREE.SphereGeometry(1.2,s.radial||24,s.height||18);
  else if(kind==='cylinder')geometry=new THREE.CylinderGeometry(1,1,2,s.radial||20,s.height||1);
  else if(kind==='plane')geometry=new THREE.PlaneGeometry(4,4,s.width||1,s.depth||1);
  else geometry=new THREE.BoxGeometry(2,2,2,s.width||1,s.height||1,s.depth||1);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:props.color,roughness:props.roughness,metalness:props.metalness}));
  if(kind==='plane')mesh.rotation.x=-Math.PI/2;
  const group=new THREE.Group();group.add(mesh);return group;
}
const build=recipe=>API.create(recipe,{THREE,createPrimitive:primitive});
function bounds(object){const box=new THREE.Box3().setFromObject(object),size=box.getSize(new THREE.Vector3());return [size.x,size.y,size.z].map(v=>+v.toFixed(5));}

test('engine library exposes primitives and reusable building blocks with thumbnails',()=>{
  assert.deepEqual(API.TYPES,['box','plane','cylinder','sphere','wall','arch','stairs','road','pipe']);
  API.list().forEach(item=>{assert.match(item.thumbnail,/^data:image\/svg\+xml/);assert.equal(item.recipe.type,item.type);});
});

test('normalization is deterministic, clamped and JSON serializable',()=>{
  const a=API.normalize({type:'sphere',dimensions:{radius:-4},segments:{radial:999},uv:{scale:[2,3]}}),b=API.normalize(a);
  assert.deepEqual(a,b);assert.equal(a.dimensions.radius,.01);assert.equal(a.segments.radial,128);
  assert.deepEqual(JSON.parse(JSON.stringify(a)),a);
});

test('parametric primitives honor dimensions and authored segments',()=>{
  assert.deepEqual(bounds(build({type:'box',dimensions:{width:3,height:4,depth:5}})),[3,4,5]);
  const low=build({type:'sphere',segments:{radial:6,height:4}}),high=build({type:'sphere',segments:{radial:32,height:16}});
  assert.ok(high.children[0].children[0].geometry.attributes.position.count>low.children[0].children[0].geometry.attributes.position.count);
});

test('building blocks are deterministic compositions of the shared primitive factory',()=>{
  const stairs=build({type:'stairs',dimensions:{width:3,height:2.4,depth:4,steps:8}});
  assert.equal(stairs.children.length,8);assert.deepEqual(bounds(stairs),[3,2.4,4]);
  const arch=build({type:'arch',dimensions:{width:5,height:4,depth:.5,openingWidth:3,openingHeight:2.8}});
  assert.equal(arch.children.length,3);assert.deepEqual(bounds(arch),[5,4,.5]);
  assert.equal(stairs.userData.lkProceduralSignature,build(stairs.userData.lkProceduralAsset).userData.lkProceduralSignature);
});

test('UV transforms produce the same buffers on every rebuild',()=>{
  const recipe={type:'plane',uv:{scale:[2,3],offset:[.1,-.2],rotation:.4},segments:{width:3,depth:2}};
  const uv=object=>Array.from(object.children[0].children[0].geometry.attributes.uv.array);
  assert.deepEqual(uv(build(recipe)),uv(build(recipe)));
  assert.notDeepEqual(uv(build(recipe)),uv(build({type:'plane'})));
});

test('rebuild disposes replaced GPU resources and preserves one stable root',()=>{
  const object=build({type:'box'}),oldMesh=object.children[0].children[0],shared=new THREE.Texture();let geometries=0,materials=0,sharedDisposed=0;
  oldMesh.geometry.addEventListener('dispose',()=>{geometries++;});oldMesh.material.addEventListener('dispose',()=>{materials++;});
  shared.addEventListener('dispose',()=>{sharedDisposed++;});oldMesh.material.map=shared;
  const same=API.rebuild(object,{type:'stairs',dimensions:{steps:4}},{THREE,createPrimitive:primitive});
  assert.equal(same,object);assert.equal(object.children.length,4);assert.equal(geometries,1);assert.equal(materials,1);
  assert.equal(sharedDisposed,0,'an externally assigned/shared texture is not owned by the procedural factory');
  const externalObject=build({type:'box'}),externalMesh=externalObject.children[0].children[0];
  const sharedMaterial=new THREE.MeshStandardMaterial(),sharedMap=new THREE.Texture();let sharedMaterialDisposed=0,sharedMapDisposed=0;
  sharedMaterial.map=sharedMap;sharedMaterial.addEventListener('dispose',()=>{sharedMaterialDisposed++;});sharedMap.addEventListener('dispose',()=>{sharedMapDisposed++;});
  externalMesh.material=sharedMaterial;
  API.rebuild(externalObject,{type:'wall'},{THREE,createPrimitive:primitive});
  assert.equal(sharedMaterialDisposed,0,'an externally assigned/shared material is not factory-owned');
  assert.equal(sharedMapDisposed,0,'a texture owned by an external material remains valid');

  const cachedSurface=new THREE.Texture();let cachedSurfaceDisposed=0;
  cachedSurface.userData.lkSurface=true;
  cachedSurface.addEventListener('dispose',()=>{cachedSurfaceDisposed++;});
  const surfacePrimitive=(kind,props)=>{const part=primitive(kind,props),mesh=part.children[0];mesh.material.map=cachedSurface;return part;};
  const surfaced=API.create({type:'box',material:{surfaceTexture:'concrete'}},{THREE,createPrimitive:surfacePrimitive});
  API.rebuild(surfaced,{type:'wall'},{THREE,createPrimitive:surfacePrimitive});
  assert.equal(cachedSurfaceDisposed,0,'a Procedural Surfaces cache map is owned by the cache, not by one recipe');
});

test('placement entry carries authorable collision and material without runtime objects',()=>{
  const entry=API.entry('road',{material:{color:'#334455',surfaceTexture:'asphalt'},collision:{enabled:true,physics:true,mass:22,impact:.4,driveSurface:true}});
  assert.equal(entry.kind,'proceduralAsset');assert.equal(entry.collide,true);assert.equal(entry.physics,true);assert.equal(entry.driveSurface,true);
  assert.equal(entry.props.surfaceTexture,'asphalt');assert.doesNotThrow(()=>JSON.stringify(entry));
});

test('Editor, Play and export manifests load the same factory before Scene Store',()=>{
  ['engine_editor.html','gameplay.html','test-editor.html','scripts.list'].forEach(file=>{
    const text=source(file),factory=text.indexOf('js/engine/procedural-assets.js'),store=text.indexOf('js/engine/scene-store.js');
    assert.ok(factory>=0&&factory<store,file+' must load the shared recipe factory before Scene Store');
  });
  const store=source('js/engine/scene-store.js');
  assert.match(store,/entry\.kind === 'proceduralAsset'/);assert.match(store,/createProceduralAsset\(entry\.procedural\)/);
});

test('recipes stay renderer-agnostic for WebGL and WebGPU fallback parity',()=>{
  const factory=source('js/engine/procedural-assets.js');
  assert.ok(!/WebGLRenderer|WebGPURenderer|ShaderMaterial/.test(factory));
  assert.match(source('js/engine/scene-store.js'),/new THREE\.MeshStandardMaterial/,'the shared primitive path supplies portable PBR materials');
});

test('Asset panel classifies the library under Engine Assets, not user or plugin assets',()=>{
  let placed=null;
  const panel=global.LK_EDITOR_ASSET_PANEL.create({document:{},ED:{assetFilters:{other:true}},assetFilterKey:item=>item.filterType,assetMatchesSearch:()=>true,placeAssetRef:item=>{placed=item;},spawnPointAhead:()=>({x:1,y:0,z:2})});
  const items=panel.proceduralItems('');assert.equal(items.length,API.TYPES.length);assert.ok(items.every(item=>item.assetOrigin==='engine'&&item.kind==='procedural-asset'));
  items[0].defaultAction();assert.equal(placed.id,items[0].id);
  let created=null;
  const catalog=global.LK_EDITOR_ASSET_CATALOG.create({GAME:{world:{registry:[]}},STORE:{},ED:{},root:{querySelectorAll(){return[];}},levelsApi:()=>null,addProceduralAsset:(type,at,recipe)=>{created={type,at,recipe};},spawnPointAhead:()=>({x:3,y:0,z:4})});
  const resolved=catalog.getAssetByRef('procedural:stairs');assert.equal(resolved.assetOrigin,'engine');catalog.placeAssetRef(resolved);assert.equal(created.type,'stairs');
  assert.match(source('js/editor/asset-panel.js'),/PROCEDURAL BUILDING KIT/);
  const inspector=source('js/editor/object-inspector.js');
  ['dimensions','segments','material','uv'].forEach(field=>assert.match(inspector,new RegExp('recipe\\.'+field)));
});

console.log('\nprocedural asset library tests passed');
