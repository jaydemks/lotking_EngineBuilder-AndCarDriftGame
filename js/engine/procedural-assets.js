/* =========================================================
   LOT KING — Serializable procedural asset recipes

   This module describes geometry; Scene Store remains the sole owner of
   scene registration, transforms, materials, collision and persistence. The
   supplied primitive factory is therefore the same one used by ordinary
   editor primitives in Editor, Play and exported gameplay.
   ========================================================= */
(function(){
'use strict';

const globalRoot=typeof window!=='undefined'?window:globalThis;
const VERSION=1;
const TYPES=Object.freeze(['box','plane','cylinder','sphere','wall','arch','stairs','road','pipe']);
const LABELS=Object.freeze({box:'Parametric Box',plane:'Parametric Plane',cylinder:'Parametric Cylinder',sphere:'Parametric Sphere',wall:'Wall Block',arch:'Arch Block',stairs:'Stairs Block',road:'Road Block',pipe:'Pipe Block'});
const ICONS=Object.freeze({box:'▰',plane:'▱',cylinder:'◉',sphere:'●',wall:'▥',arch:'∩',stairs:'▟',road:'═',pipe:'◯'});
const OWNED='lkProceduralAssetOwned';

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function num(value,fallback,min,max){const n=Number(value);return Math.max(min,Math.min(max,Number.isFinite(n)?n:fallback));}
function integer(value,fallback,min,max){return Math.round(num(value,fallback,min,max));}
function vec2(value,fallback){const v=Array.isArray(value)?value:fallback;return [num(v[0],fallback[0],-1000,1000),num(v[1],fallback[1],-1000,1000)];}
function color(value,fallback){return typeof value==='string'||Number.isFinite(Number(value))?value:fallback;}

function defaults(type){
  const kind=TYPES.includes(String(type))?String(type):'box';
  const dimensions={
    box:{width:2,height:2,depth:2},plane:{width:4,depth:4},cylinder:{radius:1,height:2},sphere:{radius:1.2},
    wall:{width:6,height:3,depth:.3},arch:{width:5,height:4,depth:.5,openingWidth:3,openingHeight:2.8},
    stairs:{width:3,height:2.4,depth:4,steps:8},road:{width:7,depth:12,height:.12},pipe:{radius:.5,height:4},
  }[kind];
  const segments={radial:kind==='sphere'?24:20,height:1,width:kind==='plane'?1:1,depth:1};
  return {
    schemaVersion:VERSION,type:kind,dimensions,segments,
    material:{color:kind==='road'?0x30343b:(kind==='pipe'?0x6b7280:0x8899aa),roughness:kind==='road'?.92:.72,metalness:kind==='pipe'?.35:.08,model:'standard',surfaceTexture:null},
    uv:{scale:[1,1],offset:[0,0],rotation:0},
    collision:{enabled:kind!=='plane',physics:false,kind:kind==='sphere'||kind==='cylinder'||kind==='pipe'?'circle':'box',mass:1,impact:1,driveSurface:kind==='road'||kind==='stairs'||kind==='plane'},
  };
}

function normalize(source){
  const src=source&&typeof source==='object'?clone(source):{};
  const base=defaults(src.type);
  const type=TYPES.includes(String(src.type))?String(src.type):base.type;
  const typed=defaults(type),d=Object.assign({},typed.dimensions,src.dimensions||{}),s=Object.assign({},typed.segments,src.segments||{});
  Object.keys(d).forEach(key=>{d[key]=key==='steps'?integer(d[key],typed.dimensions[key],1,128):num(d[key],typed.dimensions[key],.01,10000);});
  if(type==='arch'){
    d.openingWidth=Math.min(d.openingWidth,Math.max(.01,d.width-.02));
    d.openingHeight=Math.min(d.openingHeight,Math.max(.01,d.height-.02));
  }
  return {
    schemaVersion:VERSION,type,dimensions:d,
    segments:{radial:integer(s.radial,typed.segments.radial,3,128),height:integer(s.height,1,1,128),width:integer(s.width,1,1,128),depth:integer(s.depth,1,1,128)},
    material:(()=>{const m=Object.assign({},typed.material,src.material||{});return {color:color(m.color,typed.material.color),roughness:num(m.roughness,typed.material.roughness,0,1),metalness:num(m.metalness,typed.material.metalness,0,1),model:['standard','toon','unlit'].includes(m.model)?m.model:'standard',surfaceTexture:m.surfaceTexture==null?null:clone(m.surfaceTexture)};})(),
    uv:(()=>{const uv=Object.assign({},typed.uv,src.uv||{});return {scale:vec2(uv.scale,[1,1]),offset:vec2(uv.offset,[0,0]),rotation:num(uv.rotation,0,-Math.PI*2,Math.PI*2)};})(),
    collision:(()=>{const c=Object.assign({},typed.collision,src.collision||{});return {enabled:c.enabled!==false,physics:c.physics===true,kind:c.kind==='circle'?'circle':'box',mass:num(c.mass,1,.0001,100000),impact:num(c.impact,1,0,100),driveSurface:c.driveSurface===true};})(),
  };
}

function materialProps(recipe){const m=recipe.material;return {color:m.color,roughness:m.roughness,metalness:m.metalness,materialModel:m.model,surfaceTexture:clone(m.surfaceTexture),centered:true,geometry:{segments:clone(recipe.segments)}};}
function setPart(group,name,position,scale){group.name=name;group.position.set(position[0],position[1],position[2]);group.scale.set(scale[0],scale[1],scale[2]);group.userData.lkProceduralAssetPart=true;return group;}
function transformUvs(root,uv){
  const sx=uv.scale[0],sy=uv.scale[1],ox=uv.offset[0],oy=uv.offset[1],c=Math.cos(uv.rotation),s=Math.sin(uv.rotation);
  root.traverse(node=>{const attr=node&&node.geometry&&node.geometry.attributes&&node.geometry.attributes.uv;if(!attr)return;for(let i=0;i<attr.count;i++){const x=attr.getX(i)-.5,y=attr.getY(i)-.5;attr.setXY(i,(x*c-y*s)*sx+.5+ox,(x*s+y*c)*sy+.5+oy);}attr.needsUpdate=true;});
}
function markOwned(root){
  root.traverse(node=>{
    if(node.geometry){node.geometry.userData=node.geometry.userData||{};node.geometry.userData[OWNED]=true;}
    const list=Array.isArray(node.material)?node.material:[node.material];
    list.filter(Boolean).forEach(material=>{
      material.userData=material.userData||{};material.userData[OWNED]=true;
      ['map','normalMap','roughnessMap','metalnessMap','alphaMap','emissiveMap','aoMap','bumpMap'].forEach(key=>{
        const texture=material[key];if(!texture)return;
        texture.userData=texture.userData||{};
        // Procedural Surfaces is a shared cache owned by the surface runtime.
        // A procedural object owns the material that references those maps, but
        // never the cached maps themselves.
        if(texture.userData.lkSurface)return;
        texture.userData[OWNED]=true;
      });
    });
  });
}
function disposeTree(root){
  const textures=new Set(),materials=new Set(),geometries=new Set();
  root.traverse(node=>{if(node.geometry&&node.geometry.userData&&node.geometry.userData[OWNED])geometries.add(node.geometry);const list=Array.isArray(node.material)?node.material:[node.material];list.filter(Boolean).forEach(material=>{if(material.userData&&material.userData[OWNED])materials.add(material);['map','normalMap','roughnessMap','metalnessMap','alphaMap','emissiveMap','aoMap','bumpMap'].forEach(key=>{const texture=material[key];if(texture&&texture.userData&&texture.userData[OWNED])textures.add(texture);});});});
  textures.forEach(texture=>{if(texture.dispose)texture.dispose();});materials.forEach(material=>{if(material.dispose)material.dispose();});geometries.forEach(geometry=>{if(geometry.dispose)geometry.dispose();});
}

function create(source,options){
  const recipe=normalize(source),opts=options||{},THREERef=opts.THREE||globalRoot.THREE,primitive=opts.createPrimitive;
  if(!THREERef||typeof primitive!=='function')return null;
  const root=new THREERef.Group(),d=recipe.dimensions,props=materialProps(recipe);
  const add=(kind,name,p,scale)=>{const part=primitive(kind,props);if(!part)return null;setPart(part,name,p,scale);root.add(part);if(typeof opts.retile==='function')opts.retile(part);return part;};
  if(recipe.type==='box')add('box','Box',[0,0,0],[d.width/2,d.height/2,d.depth/2]);
  else if(recipe.type==='plane')add('plane','Plane',[0,0,0],[d.width/4,1,d.depth/4]);
  else if(recipe.type==='cylinder')add('cylinder','Cylinder',[0,0,0],[d.radius,d.height/2,d.radius]);
  else if(recipe.type==='sphere')add('sphere','Sphere',[0,0,0],[d.radius/1.2,d.radius/1.2,d.radius/1.2]);
  else if(recipe.type==='wall')add('box','Wall',[0,d.height/2,0],[d.width/2,d.height/2,d.depth/2]);
  else if(recipe.type==='road')add('box','Road',[0,d.height/2,0],[d.width/2,d.height/2,d.depth/2]);
  else if(recipe.type==='pipe')add('cylinder','Pipe',[0,d.height/2,0],[d.radius,d.height/2,d.radius]);
  else if(recipe.type==='arch'){
    const post=Math.max(.01,(d.width-d.openingWidth)/2),lintel=Math.max(.01,d.height-d.openingHeight);
    add('box','Arch Left',[-(d.openingWidth+post)/2,d.openingHeight/2,0],[post/2,d.openingHeight/2,d.depth/2]);
    add('box','Arch Right',[(d.openingWidth+post)/2,d.openingHeight/2,0],[post/2,d.openingHeight/2,d.depth/2]);
    add('box','Arch Top',[0,d.openingHeight+lintel/2,0],[d.width/2,lintel/2,d.depth/2]);
  } else if(recipe.type==='stairs'){
    const count=integer(d.steps,8,1,128),stepDepth=d.depth/count,rise=d.height/count;
    for(let i=0;i<count;i++){const h=rise*(i+1),z=-d.depth/2+stepDepth*(i+.5);add('box','Step '+(i+1),[0,h/2,z],[d.width/2,h/2,stepDepth/2]);}
  }
  transformUvs(root,recipe.uv);
  markOwned(root);
  root.name=LABELS[recipe.type];root.userData.lkProceduralAsset=clone(recipe);root.userData.lkProceduralSignature=JSON.stringify(recipe);
  return root;
}

function rebuild(root,source,options){
  if(!root)return null;const built=create(source,options);if(!built)return null;
  const old=Array.from(root.children);old.forEach(child=>root.remove(child));old.forEach(disposeTree);
  while(built.children.length)root.add(built.children[0]);
  root.name=built.name;root.userData.lkProceduralAsset=clone(built.userData.lkProceduralAsset);root.userData.lkProceduralSignature=built.userData.lkProceduralSignature;
  return root;
}

function entry(type,options){
  const recipe=normalize(Object.assign({},options||{},{type})),c=recipe.collision;
  return {kind:'proceduralAsset',name:LABELS[recipe.type],procedural:recipe,props:materialProps(recipe),collide:c.enabled,physics:c.physics,colliderKind:c.kind,physicsMass:c.mass,physicsImpact:c.impact,driveSurface:c.driveSurface,asset:{key:'procedural:'+recipe.type,name:LABELS[recipe.type],source:'Engine Procedural Assets'},t:{p:[0,0,0],r:[0,0,0],s:[1,1,1],v:true}};
}
function thumbnail(type){
  const kind=TYPES.includes(type)?type:'box',glyph=ICONS[kind],svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" rx="12" fill="#101827"/><text x="80" y="61" text-anchor="middle" font-size="50" font-family="Arial" fill="#67e8f9">'+glyph+'</text><text x="80" y="88" text-anchor="middle" font-size="11" font-family="Arial" fill="#cbd5e1">'+LABELS[kind]+'</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function list(){return TYPES.map(type=>({type,name:LABELS[type],icon:ICONS[type],thumbnail:thumbnail(type),recipe:defaults(type)}));}

globalRoot.LK_ENGINE_PROCEDURAL_ASSETS=Object.freeze({VERSION,TYPES,LABELS,defaults,normalize,materialProps,entry,thumbnail,list,create,rebuild,disposeTree});
})();
