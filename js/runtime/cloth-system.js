/* =========================================================
   LOT KING - Portable Cloth runtime

   A separated-skinned-mesh cloth component inspired by the
   Three.js WebGPU compute-cloth example and three-simplecloth.
   The public component/backend boundary is renderer agnostic;
   this release ships a deterministic CPU Verlet backend so the
   same authored cloth works in WebGL, Safari, editor and export.
   ========================================================= */
(function(){
'use strict';

const CLOTH_NAME_RE=/(?:cloth|fabric|cape|cloak|skirt|dress|robe|scarf|poncho|coat.?tail|jacket.?tail)/i;
const AUTO_COLLIDER_RE=/(?:hips|spine|chest|upperleg|upleg|thigh|upperarm|forearm)/i;
function finite(value,fallback){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function vector(value,fallback){
  const source=Array.isArray(value)?value:(fallback||[0,0,0]);
  return [finite(source[0],0),finite(source[1],0),finite(source[2],0)];
}
function qualityDefaults(value){
  const quality=['low','medium','high','cinematic'].includes(value)?value:'medium';
  return {quality,substeps:{low:1,medium:2,high:3,cinematic:4}[quality],iterations:{low:2,medium:4,high:6,cinematic:9}[quality]};
}
function normalizeConfig(source){
  const src=source&&typeof source==='object'?clone(source):{},preset=qualityDefaults(src.quality);
  return {
    schemaVersion:1,
    enabled:src.enabled!==false,
    backend:['auto','cpu','webgpu'].includes(src.backend)?src.backend:'auto',
    quality:preset.quality,
    stiffness:clamp(finite(src.stiffness,.82),0,1),
    damping:clamp(finite(src.damping,.965),.5,.9999),
    gravity:vector(src.gravity,[0,-9.81,0]),
    wind:vector(src.wind,[0,0,0]),
    windNoise:clamp(finite(src.windNoise,.22),0,2),
    substeps:Math.round(clamp(finite(src.substeps,preset.substeps),1,8)),
    iterations:Math.round(clamp(finite(src.iterations,preset.iterations),1,16)),
    maxVertices:Math.round(clamp(finite(src.maxVertices,50000),1000,250000)),
    maxDelta:clamp(finite(src.maxDelta,1/20),1/240,.1),
    autoDetect:src.autoDetect!==false,
    autoColliders:src.autoColliders!==false,
    colliderRadiusMultiplier:clamp(finite(src.colliderRadiusMultiplier,1),.2,3),
    collisionThickness:clamp(finite(src.collisionThickness,.025),0,.25),
    pieces:Array.isArray(src.pieces)?src.pieces.map(normalizePiece):[],
  };
}
function normalizePiece(piece){
  const src=piece&&typeof piece==='object'?clone(piece):{};
  return {
    id:String(src.id||('cloth-'+Math.random().toString(36).slice(2,9))),
    name:String(src.name||src.meshName||'Cloth Piece'),
    meshName:String(src.meshName||''),
    enabled:src.enabled!==false,
    maskAttribute:String(src.maskAttribute||'color'),
    maskChannel:['r','g','b','a'].includes(src.maskChannel)?src.maskChannel:'b',
    pinMode:['vertex-color','top','free'].includes(src.pinMode)?src.pinMode:'vertex-color',
    pinTop:clamp(finite(src.pinTop,.12),0,1),
    invertMask:src.invertMask===true,
    twoSided:src.twoSided!==false,
    collisions:src.collisions!==false,
    weights:src.weights&&typeof src.weights==='object'?clone(src.weights):{},
    colliders:Array.isArray(src.colliders)?src.colliders.map(item=>({
      bone:String(item&&item.bone||''),radius:clamp(finite(item&&item.radius,.16),.01,2),
      offset:vector(item&&item.offset,[0,0,0]),
    })):[]
  };
}
function pluginEnabled(){
  try {const map=JSON.parse(localStorage.getItem('lotking.plugins.enabled.v1')||'{}');return map['cloth-authoring']!==false;}catch(err){return true;}
}
function inspect(root){
  const meshes=[],bones=[];
  if(root&&root.traverse)root.traverse(node=>{
    if(node&&node.isSkinnedMesh&&node.geometry&&node.geometry.attributes&&node.geometry.attributes.position){
      const color=node.geometry.getAttribute&&node.geometry.getAttribute('color');
      meshes.push({name:node.name||('SkinnedMesh '+meshes.length),vertices:node.geometry.attributes.position.count,indexed:!!node.geometry.index,hasVertexColor:!!color,autoCandidate:CLOTH_NAME_RE.test(node.name||'')});
    }
    if(node&&node.isBone)bones.push(node.name||('Bone '+bones.length));
  });
  return {meshes,bones};
}
function discoverPieces(root,config){
  const cfg=normalizeConfig(config),available=inspect(root).meshes;
  if(cfg.pieces.length)return cfg.pieces;
  if(!cfg.autoDetect)return [];
  return available.filter(item=>item.autoCandidate).map(item=>normalizePiece({name:item.name,meshName:item.name,pinMode:item.hasVertexColor?'vertex-color':'top'}));
}

function create(root,sourceConfig,options){
  const THREE=window.THREE,cfg=normalizeConfig(sourceConfig),opts=options||{},solvers=[];
  const diagnostics={requestedBackend:cfg.backend,effectiveBackend:'cpu-portable',pieces:[],warnings:[]};
  let elapsed=0,disposed=false;
  if(!THREE||!root||!cfg.enabled||!pluginEnabled())return inert(cfg,diagnostics);
  if(cfg.backend==='webgpu')diagnostics.warnings.push('WebGPU cloth requested; portable CPU parity backend is active in this release.');
  const pieces=discoverPieces(root,cfg),byName=new Map();
  root.updateMatrixWorld(true);
  root.traverse(node=>{if(node&&node.isSkinnedMesh){const name=String(node.name||'');if(!byName.has(name))byName.set(name,node);}});
  pieces.forEach(piece=>{
    if(!piece.enabled)return;
    const source=byName.get(piece.meshName);
    if(!source){diagnostics.warnings.push('Cloth mesh not found: '+piece.meshName);return;}
    try {const solver=createSolver(root,source,piece,cfg,opts);solvers.push(solver);diagnostics.pieces.push(solver.stats());}
    catch(error){diagnostics.warnings.push(piece.meshName+': '+String(error&&error.message||error));}
  });
  if(!solvers.length&&!diagnostics.warnings.length)diagnostics.warnings.push('No separated cloth SkinnedMesh was detected. Add a Cloth Piece in Pawn Studio.');
  function update(dt){
    if(disposed)return false;
    const h=Math.min(cfg.maxDelta,Math.max(0,finite(dt,0)));if(h<=0)return true;
    elapsed+=h;solvers.forEach(solver=>solver.update(h,elapsed));return true;
  }
  function reset(){solvers.forEach(solver=>solver.reset());return true;}
  function paintAtWorld(meshName,point,radius,value){
    const solver=solvers.find(item=>item.name===meshName||item.piece.id===meshName);
    return solver?solver.paintAtWorld(point,radius,value):null;
  }
  function dispose(){
    if(disposed)return false;disposed=true;solvers.forEach(solver=>solver.dispose());solvers.length=0;return true;
  }
  return Object.freeze({config:cfg,update,reset,dispose,paintAtWorld,overlays:()=>solvers.map(item=>item.overlay),stats:()=>Object.assign({},diagnostics,{pieces:solvers.map(item=>item.stats())})});

  function createSolver(characterRoot,source,piece,config){
    const geometry=source.geometry.clone(),position=geometry.getAttribute('position');
    if(!position||position.count<3)throw new Error('geometry has no usable positions');
    if(position.count>config.maxVertices)throw new Error(position.count+' vertices exceed the safety limit of '+config.maxVertices+'. Reduce the garment or raise Max simulated vertices deliberately.');
    const parent=source.parent||characterRoot,overlay=new THREE.Mesh(geometry,cloneMaterial(source.material,piece));
    overlay.name='Cloth Runtime · '+(source.name||piece.name);overlay.frustumCulled=false;overlay.castShadow=source.castShadow;overlay.receiveShadow=source.receiveShadow;
    overlay.userData=Object.assign({},source.userData||{},{logicElementRuntimeVisual:true,logicElementInternal:true,nonExportable:true,lkClothOverlay:true,lkClothSourceName:source.name});
    overlay.position.set(0,0,0);overlay.quaternion.identity();overlay.scale.set(1,1,1);parent.add(overlay);
    const originalVisible=source.visible;source.visible=false;
    const count=position.count,current=new Float32Array(count*3),previous=new Float32Array(count*3),targets=new Float32Array(count*3),clothWeight=new Float32Array(count);
    const temp=new THREE.Vector3(),local=new THREE.Vector3(),accel=new THREE.Vector3(),inverseParent=new THREE.Matrix4(),windLocal=new THREE.Vector3(),gravityLocal=new THREE.Vector3();
    const edges=buildEdges(geometry,position),restLengths=new Float32Array(edges.length/2),mask=source.geometry.getAttribute&&source.geometry.getAttribute(piece.maskAttribute),channel={r:0,g:1,b:2,a:3}[piece.maskChannel];
    let minY=Infinity,maxY=-Infinity;
    for(let i=0;i<count;i++){temp.fromBufferAttribute(position,i);minY=Math.min(minY,temp.y);maxY=Math.max(maxY,temp.y);}
    const customWeights=piece.weights||{};
    for(let i=0;i<count;i++){
      let weight;
      if(Object.prototype.hasOwnProperty.call(customWeights,i))weight=clamp(finite(customWeights[i],1),0,1);
      else if(piece.pinMode==='free')weight=1;
      else if(piece.pinMode==='top'){const normalized=(position.getY(i)-minY)/Math.max(.0001,maxY-minY),start=1-piece.pinTop;weight=1-clamp((normalized-start)/Math.max(.001,piece.pinTop),0,1);}
      else {const pin=mask?(channel===0?mask.getX(i):channel===1?mask.getY(i):channel===2?mask.getZ(i):mask.getW(i)):((position.getY(i)-minY)/Math.max(.0001,maxY-minY)>.88?1:0);weight=piece.invertMask?clamp(pin,0,1):1-clamp(pin,0,1);}
      clothWeight[i]=weight;
    }
    updateTargets();
    current.set(targets);previous.set(targets);
    for(let e=0;e<edges.length;e+=2){const a=edges[e]*3,b=edges[e+1]*3;restLengths[e/2]=Math.hypot(current[b]-current[a],current[b+1]-current[a+1],current[b+2]-current[a+2]);}
    const colliders=buildColliders(characterRoot,piece,config);
    function updateTargets(){
      characterRoot.updateMatrixWorld(true);source.updateMatrixWorld(true);parent.updateMatrixWorld(true);inverseParent.copy(parent.matrixWorld).invert();
      for(let i=0;i<count;i++){
        temp.fromBufferAttribute(position,i);
        if(source.applyBoneTransform)source.applyBoneTransform(i,temp);
        temp.applyMatrix4(source.matrixWorld).applyMatrix4(inverseParent);
        targets[i*3]=temp.x;targets[i*3+1]=temp.y;targets[i*3+2]=temp.z;
      }
    }
    function forceLocal(world,out){
      const q=new THREE.Quaternion();parent.getWorldQuaternion(q);q.invert();return out.copy(world).applyQuaternion(q);
    }
    function update(dt,time){
      updateTargets();
      const substeps=config.substeps,step=dt/substeps,gravity=forceLocal(temp.set(config.gravity[0],config.gravity[1],config.gravity[2]),gravityLocal),wind=forceLocal(temp.set(config.wind[0],config.wind[1],config.wind[2]),windLocal);
      for(let sub=0;sub<substeps;sub++){
        const noise=1+Math.sin(time*2.17+sub*.71)*config.windNoise;
        accel.copy(gravity).addScaledVector(wind,noise);
        const dt2=step*step;
        for(let i=0;i<count;i++){
          const k=i*3,w=clothWeight[i];if(w<=.0001){current[k]=targets[k];current[k+1]=targets[k+1];current[k+2]=targets[k+2];previous[k]=current[k];previous[k+1]=current[k+1];previous[k+2]=current[k+2];continue;}
          const x=current[k],y=current[k+1],z=current[k+2];
          current[k]=x+(x-previous[k])*config.damping+accel.x*dt2*w;
          current[k+1]=y+(y-previous[k+1])*config.damping+accel.y*dt2*w;
          current[k+2]=z+(z-previous[k+2])*config.damping+accel.z*dt2*w;
          previous[k]=x;previous[k+1]=y;previous[k+2]=z;
        }
        for(let iteration=0;iteration<config.iterations;iteration++){
          solveEdges();if(piece.collisions)solveColliders();
          for(let i=0;i<count;i++){const pin=1-clothWeight[i],k=i*3;if(pin<=0)continue;current[k]+= (targets[k]-current[k])*pin;current[k+1]+=(targets[k+1]-current[k+1])*pin;current[k+2]+=(targets[k+2]-current[k+2])*pin;}
        }
      }
      position.array.set(current);position.needsUpdate=true;geometry.computeVertexNormals();if(geometry.attributes.normal)geometry.attributes.normal.needsUpdate=true;
    }
    function solveEdges(){
      const stiffness=config.stiffness;
      for(let e=0;e<edges.length;e+=2){
        const ai=edges[e],bi=edges[e+1],a=ai*3,b=bi*3,dx=current[b]-current[a],dy=current[b+1]-current[a+1],dz=current[b+2]-current[a+2],length=Math.max(.000001,Math.hypot(dx,dy,dz)),correction=(length-restLengths[e/2])/length*stiffness;
        const wa=clothWeight[ai],wb=clothWeight[bi],sum=wa+wb;if(sum<=.0001)continue;
        const ax=dx*correction*(wa/sum),ay=dy*correction*(wa/sum),az=dz*correction*(wa/sum),bx=dx*correction*(wb/sum),by=dy*correction*(wb/sum),bz=dz*correction*(wb/sum);
        current[a]+=ax;current[a+1]+=ay;current[a+2]+=az;current[b]-=bx;current[b+1]-=by;current[b+2]-=bz;
      }
    }
    function solveColliders(){
      colliders.forEach(collider=>{
        const center=colliderPosition(collider,parent,temp),radius=collider.radius*config.colliderRadiusMultiplier+config.collisionThickness;
        for(let i=0;i<count;i++){if(clothWeight[i]<=.0001)continue;const k=i*3,dx=current[k]-center.x,dy=current[k+1]-center.y,dz=current[k+2]-center.z,d2=dx*dx+dy*dy+dz*dz;if(d2>=radius*radius)continue;const distance=Math.max(.00001,Math.sqrt(d2)),push=(radius-distance)/distance;current[k]+=dx*push;current[k+1]+=dy*push;current[k+2]+=dz*push;}
      });
    }
    function reset(){updateTargets();current.set(targets);previous.set(targets);position.array.set(current);position.needsUpdate=true;}
    function paintAtWorld(point,radius,value){
      if(!point)return null;parent.updateMatrixWorld(true);local.copy(point);parent.worldToLocal(local);
      const r=Math.max(.001,finite(radius,.12)),changed={mesh:source.name,indices:[],values:[]};
      for(let i=0;i<count;i++){const k=i*3,dist=Math.hypot(current[k]-local.x,current[k+1]-local.y,current[k+2]-local.z);if(dist>r)continue;const blend=1-dist/r,next=clamp(clothWeight[i]+(clamp(finite(value,1),0,1)-clothWeight[i])*blend,0,1);clothWeight[i]=next;changed.indices.push(i);changed.values.push(Number(next.toFixed(4)));}
      return changed;
    }
    function stats(){return {id:piece.id,name:source.name,vertices:count,springs:edges.length/2,colliders:colliders.length,backend:'cpu-portable'};}
    function dispose(){source.visible=originalVisible;if(overlay.parent)overlay.parent.remove(overlay);geometry.dispose();disposeMaterial(overlay.material);}
    return {piece,name:source.name,source,overlay,update,reset,paintAtWorld,stats,dispose};
  }
}
function buildEdges(geometry,position){
  const set=new Set(),list=[],index=geometry.index&&geometry.index.array;
  const add=(a,b)=>{if(a===b)return;const lo=Math.min(a,b),hi=Math.max(a,b),key=lo+':'+hi;if(set.has(key))return;set.add(key);list.push(lo,hi);};
  if(index)for(let i=0;i<index.length;i+=3){add(index[i],index[i+1]);add(index[i+1],index[i+2]);add(index[i+2],index[i]);}
  else for(let i=0;i+2<position.count;i+=3){add(i,i+1);add(i+1,i+2);add(i+2,i);}
  return new Uint32Array(list);
}
function buildColliders(root,piece,config){
  const result=[],bones=[];if(root&&root.traverse)root.traverse(node=>{if(node&&node.isBone)bones.push(node);});
  if(piece.colliders.length)piece.colliders.forEach(spec=>{const bone=bones.find(item=>item.name===spec.bone);if(bone)result.push({bone,radius:spec.radius,offset:spec.offset});});
  else if(config.autoColliders)bones.filter(bone=>AUTO_COLLIDER_RE.test(bone.name||'')).forEach(bone=>result.push({bone,radius:/hips|spine|chest/i.test(bone.name||'')?.2:.13,offset:[0,0,0]}));
  return result;
}
function colliderPosition(collider,parent,target){
  collider.bone.getWorldPosition(target);const offset=collider.offset||[0,0,0];
  if(offset[0]||offset[1]||offset[2]){const q=collider.bone.getWorldQuaternion(new window.THREE.Quaternion()),v=new window.THREE.Vector3(offset[0],offset[1],offset[2]).applyQuaternion(q);target.add(v);}
  return parent.worldToLocal(target);
}
function cloneMaterial(material,piece){
  const THREE=window.THREE,cloneOne=item=>{const next=item&&item.clone?item.clone():new THREE.MeshStandardMaterial({color:0xffffff});if(piece.twoSided)next.side=THREE.DoubleSide;next.skinning=false;return next;};
  return Array.isArray(material)?material.map(cloneOne):cloneOne(material);
}
function disposeMaterial(material){(Array.isArray(material)?material:[material]).forEach(item=>{if(item&&item.dispose)item.dispose();});}
function inert(config,diagnostics){return Object.freeze({config,update:()=>false,reset:()=>false,dispose:()=>false,paintAtWorld:()=>null,overlays:()=>[],stats:()=>diagnostics});}

window.LK_RUNTIME_CLOTH=Object.freeze({normalizeConfig,normalizePiece,inspect,discoverPieces,create,pluginEnabled});
})();
