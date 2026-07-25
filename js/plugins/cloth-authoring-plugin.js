/* =========================================================
   LOT KING - Cloth Authoring plugin
   Default-enabled Pawn Studio extension for portable cloth.
   ========================================================= */
(function(){
'use strict';
function ensure(definition){
  const runtime=window.LK_RUNTIME_CLOTH;
  definition.cloth=runtime?runtime.normalizeConfig(definition.cloth||{}):(definition.cloth||{enabled:true,pieces:[]});
  return definition.cloth;
}
function button(root,label,run,className){
  const item=document.createElement('button');item.type='button';item.className='lk-ps-action '+(className||'');item.textContent=label;item.addEventListener('click',run);root.appendChild(item);return item;
}
function mergeWeights(config,change){
  if(!change)return;const piece=(config.pieces||[]).find(item=>item.meshName===change.mesh);if(!piece)return;
  piece.weights=piece.weights||{};change.indices.forEach((index,i)=>{piece.weights[index]=change.values[i];});
}
function clearBrush(state){if(state&&state.clothBrushCleanup)state.clothBrushCleanup();if(state)state.clothBrushCleanup=null;}
function rerender(ctx){clearBrush(ctx.state);ctx.root.innerHTML='';renderStudio(ctx);}
function attachPreview(state,config,note){
  if(!state||!state.model||!window.LK_RUNTIME_CLOTH){note('Load a Main Mesh before starting Cloth Preview.');return null;}
  if(state.clothPreview)state.clothPreview.dispose();
  state.clothPreview=window.LK_RUNTIME_CLOTH.create(state.model,config,{preview:true});
  const report=state.clothPreview.stats(),summary=(report.pieces||[]).map(item=>item.name+' · '+item.vertices+' vertices').join(' | ');
  note(summary||report.warnings&&report.warnings.join(' | ')||'No separated cloth mesh detected.');
  return state.clothPreview;
}
function installBrush(state,config,piece,mode,radius,persist,note){
  clearBrush(state);const controller=state.clothPreview||attachPreview(state,config,note),canvas=state.renderer&&state.renderer.domElement;
  if(!controller||!canvas||!state.camera)return;
  const THREE=window.THREE,raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let drawing=false,lastSave=0;
  const paint=event=>{
    const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,state.camera);
    const hit=raycaster.intersectObjects(controller.overlays(),false)[0];if(!hit)return;
    const change=controller.paintAtWorld(piece.meshName,hit.point,radius,mode==='cloth'?1:0);mergeWeights(config,change);
    const now=Date.now();if(now-lastSave>180){lastSave=now;persist();}
  };
  const down=event=>{drawing=true;canvas.setPointerCapture&&canvas.setPointerCapture(event.pointerId);paint(event);};
  const move=event=>{if(drawing)paint(event);};
  const up=()=>{if(!drawing)return;drawing=false;persist();};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);addEventListener('pointerup',up);
  state.clothBrushCleanup=()=>{canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);removeEventListener('pointerup',up);};
  note((mode==='cloth'?'Paint Cloth':'Paint Pin')+' is active in the viewport. Drag directly over the garment; the sparse vertex mask is saved in this Pawn.');
}
function renderStudio(ctx){
  const {root,state,definition,persist,field,note,tr}=ctx,config=ensure(definition),runtime=window.LK_RUNTIME_CLOTH;
  field(tr('Enabled','Attivo'),config.enabled,'checkbox',value=>{config.enabled=value;persist();});
  field('Backend',config.backend,'select',value=>{config.backend=value;persist();},['auto','cpu','webgpu']);
  field('Quality',config.quality,'select',value=>{config.quality=value;persist();},['low','medium','high','cinematic']);
  field('Stiffness',config.stiffness,'number',value=>{config.stiffness=value;persist();});
  field('Damping',config.damping,'number',value=>{config.damping=value;persist();});
  field('Gravity Y',config.gravity[1],'number',value=>{config.gravity[1]=value;persist();});
  ['X','Y','Z'].forEach((axis,index)=>field('Wind '+axis,config.wind[index],'number',value=>{config.wind[index]=value;persist();}));
  field('Wind variation',config.windNoise,'number',value=>{config.windNoise=value;persist();});
  field('Solver substeps',config.substeps,'number',value=>{config.substeps=Math.max(1,Math.round(value));persist();});
  field('Constraint iterations',config.iterations,'number',value=>{config.iterations=Math.max(1,Math.round(value));persist();});
  field('Max simulated vertices',config.maxVertices,'number',value=>{config.maxVertices=Math.max(1000,Math.round(value));persist();});
  field('Automatic bone colliders',config.autoColliders,'checkbox',value=>{config.autoColliders=value;persist();});
  field('Collider radius multiplier',config.colliderRadiusMultiplier,'number',value=>{config.colliderRadiusMultiplier=value;persist();});
  note('Cloth should be a separated SkinnedMesh under the same skeleton. Vertex color white pins to skin; red frees the fabric, following the referenced MIT workflow.');
  const model=state.model,inspection=runtime&&model?runtime.inspect(model):{meshes:[],bones:[]},names=inspection.meshes.map(item=>item.name);
  if(!config.pieces.length&&names.length){
    const detected=runtime.discoverPieces(model,config);if(detected.length)config.pieces=detected;
  }
  const selectedId=state.clothPieceId||config.pieces[0]&&config.pieces[0].id||'',pieceOptions=config.pieces.map(item=>item.id),piece=(config.pieces||[]).find(item=>item.id===selectedId)||config.pieces[0];
  if(config.pieces.length){const select=field('Cloth Piece',piece&&piece.id,'select',value=>{state.clothPieceId=value;},pieceOptions);Array.from(select.options).forEach(option=>{const item=config.pieces.find(entry=>entry.id===option.value);option.textContent=item&&item.name||option.value;});select.addEventListener('change',()=>{state.clothPieceId=select.value;rerender(ctx);});}
  if(piece){
    const meshInfo=inspection.meshes.find(item=>item.name===piece.meshName);
    if(meshInfo)note(meshInfo.vertices+' vertices · '+(meshInfo.indexed?'indexed':'non-indexed')+' · '+(meshInfo.hasVertexColor?'vertex-color mask available':'no vertex colors')+(meshInfo.vertices>config.maxVertices?' · OVER SAFETY LIMIT':''));
    field('Piece name',piece.name,'text',value=>{piece.name=value;persist();});
    field('Mesh',piece.meshName,'select',value=>{piece.meshName=value;persist();},names);
    field('Enabled piece',piece.enabled,'checkbox',value=>{piece.enabled=value;persist();});
    field('Pin source',piece.pinMode,'select',value=>{piece.pinMode=value;persist();},['vertex-color','top','free']);
    field('Mask attribute',piece.maskAttribute,'text',value=>{piece.maskAttribute=value;persist();});
    field('Mask channel',piece.maskChannel,'select',value=>{piece.maskChannel=value;persist();},['r','g','b','a']);
    field('Top pin ratio',piece.pinTop,'number',value=>{piece.pinTop=value;persist();});
    field('Body collisions',piece.collisions,'checkbox',value=>{piece.collisions=value;persist();});
    field('Two sided',piece.twoSided,'checkbox',value=>{piece.twoSided=value;persist();});
    let brushRadius=Number(state.clothBrushRadius)||.14;
    const radiusInput=field('Brush radius',brushRadius,'number',value=>{brushRadius=Math.max(.005,Number(value)||.14);});
    radiusInput.addEventListener('change',()=>{state.clothBrushRadius=brushRadius;});
    radiusInput.min='.005';radiusInput.step='.01';
    const actions=document.createElement('div');actions.className='lk-ps-actions';root.appendChild(actions);
    button(actions,'Paint Cloth',()=>installBrush(state,config,piece,'cloth',brushRadius,persist,note),'primary');
    button(actions,'Paint Pin',()=>installBrush(state,config,piece,'pin',brushRadius,persist,note));
    button(actions,'Clear painted mask',()=>{piece.weights={};persist();attachPreview(state,config,note);});
    button(actions,'Remove Piece',()=>{config.pieces=config.pieces.filter(item=>item!==piece);state.clothPieceId='';persist();rerender(ctx);},'danger');

    const colliderTitle=document.createElement('div');colliderTitle.className='lk-ps-subtitle';colliderTitle.textContent='Custom bone colliders';root.appendChild(colliderTitle);
    note(piece.colliders.length?'Custom colliders replace automatic colliders for this piece.':'No custom colliders: automatic bone colliders are used when enabled.');
    const colliderOptions=piece.colliders.map((item,index)=>String(index)),selectedCollider=Math.min(Number(state.clothColliderIndex)||0,Math.max(0,piece.colliders.length-1)),collider=piece.colliders[selectedCollider];
    if(collider){
      const select=field('Collider',String(selectedCollider),'select',value=>{state.clothColliderIndex=Number(value);},colliderOptions);
      Array.from(select.options).forEach(option=>{const item=piece.colliders[Number(option.value)];option.textContent=(Number(option.value)+1)+' · '+(item.bone||'Unassigned bone');});
      select.addEventListener('change',()=>rerender(ctx));
      field('Bone',collider.bone,'select',value=>{collider.bone=value;persist();},inspection.bones);
      field('Collider radius',collider.radius,'number',value=>{collider.radius=Math.max(.01,Number(value)||.16);persist();});
      ['X','Y','Z'].forEach((axis,index)=>field('Collider offset '+axis,collider.offset[index],'number',value=>{collider.offset[index]=Number(value)||0;persist();}));
    }
    const colliderActions=document.createElement('div');colliderActions.className='lk-ps-actions';root.appendChild(colliderActions);
    button(colliderActions,'＋ Add Bone Collider',()=>{piece.colliders.push({bone:inspection.bones.find(name=>/hips|spine|chest/i.test(name))||inspection.bones[0]||'',radius:.16,offset:[0,0,0]});state.clothColliderIndex=piece.colliders.length-1;persist();rerender(ctx);});
    if(collider)button(colliderActions,'Remove Collider',()=>{piece.colliders.splice(selectedCollider,1);state.clothColliderIndex=0;persist();rerender(ctx);},'danger');
  }
  const actions=document.createElement('div');actions.className='lk-ps-actions';root.appendChild(actions);
  button(actions,'＋ Add Cloth Piece',()=>{
    const mesh=inspection.meshes.find(item=>item.autoCandidate)||inspection.meshes[0],next=runtime.normalizePiece({name:mesh&&mesh.name||'Cloth Piece',meshName:mesh&&mesh.name||'',pinMode:mesh&&mesh.hasVertexColor?'vertex-color':'top'});
    config.pieces.push(next);state.clothPieceId=next.id;persist();rerender(ctx);
  });
  button(actions,'Auto Detect',()=>{config.pieces=runtime.discoverPieces(model,Object.assign({},config,{pieces:[]}));state.clothPieceId=config.pieces[0]&&config.pieces[0].id||'';persist();rerender(ctx);});
  button(actions,'▶ Rebuild Cloth Preview',()=>{clearBrush(state);attachPreview(state,config,note);},'primary');
  button(actions,'Reset Simulation',()=>{if(state.clothPreview)state.clothPreview.reset();});
  if(state.clothPreview){const report=state.clothPreview.stats();note('Effective backend: '+report.effectiveBackend+(report.warnings&&report.warnings.length?' · '+report.warnings.join(' · '):''));}
}
const plugin={
  id:'cloth-authoring',name:'Cloth Studio',version:'0.1.0',category:'Character & Simulation',builtIn:false,enabledByDefault:true,
  description:'Portable cloth authoring for separated skinned garments, with masks, pinning, wind, bone colliders and isolated Pawn Studio preview.',
  capabilities:['Separated SkinnedMesh cloth','Vertex-color and painted pin masks','Bone sphere colliders','Wind and gravity','Portable CPU solver','Pawn Studio authoring'],
  register(api){
    if(!api)return;
    api.capability('cloth-simulation','Renderer-independent cloth component with portable CPU parity backend');
    api.runtimeHook('character-cloth',{label:'Character Cloth Runtime',description:'Updates authored garment components after skeleton animation.'});
    api.pawnStudioAugment('character-cloth',{match:graph=>!!(graph&&(graph.characterPawn||graph.soccerPawn)),containers:()=>[{id:'cloth-studio',label:'Cloth Studio',icon:'≈',kind:'cloth',render:renderStudio}]});
    api.inspectorProvider('cloth',{label:'Cloth Studio',description:'Garment mesh, pin mask, solver, forces and bone collider authoring.'});
    api.menu('plugins',{label:'Cloth Studio',icon:'≈',sub:[{label:'Open a Character or Soccer Pawn to author cloth',icon:'◇',action:()=>{const env=api.env||{};if(env.status)env.status('Select a Character/Soccer Logic Element and open Pawn Studio → Cloth Studio');}}]});
  }
};
window.LK_CLOTH_AUTHORING_PLUGIN=Object.freeze(plugin);
})();
