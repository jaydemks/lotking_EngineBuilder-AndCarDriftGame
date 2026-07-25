/* =========================================================
   LOT KING - Pawn Studio
   Reusable, schema-driven authoring overlay for Character,
   Vehicle and plugin-provided Pawn categories.
   ========================================================= */
(function(){
'use strict';

const adapters=[];
function registerType(adapter){
  if(!adapter||!adapter.id||typeof adapter.match!=='function'||typeof adapter.containers!=='function')throw new Error('Pawn Studio adapter requires id, match and containers');
  const index=adapters.findIndex(item=>item.id===adapter.id);if(index>=0)adapters.splice(index,1);
  adapters.push(adapter);return adapter;
}
function unregisterType(id){const index=adapters.findIndex(item=>item.id===id);if(index<0)return false;adapters.splice(index,1);return true;}
function resolveType(graph){return adapters.find(adapter=>{try{return adapter.match(graph||{});}catch(err){return false;}})||null;}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function pathGet(root,path){return String(path||'').split('.').filter(Boolean).reduce((value,key)=>value&&value[key],root);}
function pathSet(root,path,value){const keys=String(path||'').split('.').filter(Boolean);let cursor=root;keys.slice(0,-1).forEach(key=>{if(!cursor[key]||typeof cursor[key]!=='object')cursor[key]={};cursor=cursor[key];});if(keys.length)cursor[keys[keys.length-1]]=value;}
function assetId(ref){return String(ref&&ref.id||ref&&ref.key||ref&&ref.dbKey||ref&&ref.src||'');}
function storableAssetRef(asset){return asset?{id:asset.id||null,key:asset.key||null,dbKey:asset.dbKey||null,src:asset.src||asset.url||null,name:asset.name||asset.source||'GLB Asset',source:asset.source||asset.name||'Asset Library',kind:'glb',mime:asset.mime||null,fit:Number(asset.fit)||null,clips:Array.isArray(asset.clips)?asset.clips.slice():[],boneNames:Array.isArray(asset.boneNames)?asset.boneNames.slice():[],skeletonSignature:asset.skeletonSignature||'',sourceFormat:asset.sourceFormat||null,sourceDbKey:asset.sourceDbKey||null,sourceSrc:asset.sourceSrc||null,sourceDependencies:Array.isArray(asset.sourceDependencies)?clone(asset.sourceDependencies):[],compileState:asset.compileState||null,compiledAt:asset.compiledAt||null}:null;}
function normalizedBoneName(name){return String(name||'').replace(/^.*[:|]/,'').replace(/[^a-z0-9]/gi,'').toLowerCase();}
function skeletonCompatibility(main,motion){
  if(!main||!motion)return {status:'unknown',ratio:0,matched:0,total:0};
  if(assetId(main)&&assetId(main)===assetId(motion))return {status:'compatible',ratio:1,matched:0,total:0,sameAsset:true};
  const a=new Set((main.boneNames||[]).map(normalizedBoneName).filter(Boolean)),b=new Set((motion.boneNames||[]).map(normalizedBoneName).filter(Boolean));
  if(!a.size||!b.size)return {status:'unknown',ratio:0,matched:0,total:Math.min(a.size,b.size)};
  let matched=0;a.forEach(name=>{if(b.has(name))matched++;});const total=Math.min(a.size,b.size),ratio=total?matched/total:0;
  return {status:ratio>=.8?'compatible':(ratio>=.5?'warning':'incompatible'),ratio,matched,total};
}
function inferMotionMetadata(asset,clip,index){
  const source=String((asset&&asset.name)||'')+' '+String(clip||''),key=source.toLowerCase().replace(/[^a-z0-9]+/g,' '),has=words=>words.some(word=>key.includes(word));
  let state='grounded',direction=[0,1],speed=1.8,loop=true,action=null;
  if(has(['idle','stand','breath'])){direction=[0,0];speed=0;}
  if(has(['run','jog']))speed=5.4;
  if(has(['sprint']))speed=7;
  if(has(['back','reverse']))direction=[0,-1];
  else if(has(['strafe left','left strafe','walk left','run left']))direction=[-1,0];
  else if(has(['strafe right','right strafe','walk right','run right']))direction=[1,0];
  if(has(['jump','takeoff','take off'])){state='jump';loop=false;speed=Math.max(speed,2);}
  else if(has(['fall','airborne','in air'])){state='fall';loop=true;speed=Math.max(speed,2);}
  else if(has(['land','landing'])){state='land';loop=false;direction=[0,0];speed=0;}
  else if(has(['attack','shoot','kick','punch','hit','interact','use','dive','save','celebrate','death','die'])){state='action';loop=false;direction=[0,0];speed=0;action=has(['shoot','kick'])?'shoot':(has(['dive','save'])?'dive':(has(['interact','use'])?'interact':'action'));}
  const base=String((asset&&asset.name)||clip||('Motion '+(index+1))).replace(/\.(?:glb|gltf|fbx)$/i,'').replace(/[_-]+/g,' ').trim();
  return {id:'motion-'+Date.now()+'-'+index,name:base||('Motion '+(index+1)),state,action,direction,speed,speedTolerance:state==='grounded'?(speed>3?2.5:1.6):2,asset:storableAssetRef(asset),clip:String(clip||''),loop,priority:1,playbackRate:1,sourceOrientation:'y-up',previewScale:1,motionTransform:{position:[0,0,0],rotation:[0,0,0]},rigCorrections:{},curveCorrection:{offset:[0,0,0],influence:1,falloff:'smooth-midpoint'}};
}
function sceneModel(graph,preferred){const scene=graph&&graph.logicScene||{},all=[scene.root].concat(scene.elements||[]).filter(Boolean);return all.find(element=>element.id===preferred&&element.asset)||all.find(element=>element.asset)||null;}
function characterModelElement(graph){const scene=graph&&graph.logicScene||{};return (scene.elements||[]).find(element=>element&&element.id==='character_model')||null;}
function characterModelAlignment(graph){
  const element=characterModelElement(graph)||{},position=Array.isArray(element.position)?element.position:[0,0,0],rotation=Array.isArray(element.rotation)?element.rotation:[0,0,0],scale=Array.isArray(element.scale)?element.scale:[1,1,1];
  return {element,position:[Number(position[0])||0,Number(position[1])||0,Number(position[2])||0],rotation:[Number(rotation[0])||0,Number(rotation[1])||0,Number(rotation[2])||0],scale:[Math.max(.01,Number(scale[0])||1),Math.max(.01,Number(scale[1])||1),Math.max(.01,Number(scale[2])||1)]};
}
function pawnDefinition(graph){return graph.characterPawn||graph.soccerPawn||graph.vehiclePawn||graph.playerPawnBlueprint||null;}
function worldCharacterModelNode(object){let found=null;if(object&&object.traverse)object.traverse(node=>{if(!found&&node&&node.userData&&node.userData.logicElementSceneId==='character_model'&&node.userData.logicElementAssetKey)found=node;});return found;}
function worldAlignmentMatches(object,graph){
  const node=worldCharacterModelNode(object);if(!node||!window.THREE)return null;const alignment=characterModelAlignment(graph),epsilon=1e-4,rotation=[window.THREE.MathUtils.radToDeg(node.rotation.x),window.THREE.MathUtils.radToDeg(node.rotation.y),window.THREE.MathUtils.radToDeg(node.rotation.z)],values=[node.position.x-alignment.position[0],node.position.y-alignment.position[1],node.position.z-alignment.position[2],rotation[0]-alignment.rotation[0],rotation[1]-alignment.rotation[1],rotation[2]-alignment.rotation[2],node.scale.x-alignment.scale[0],node.scale.y-alignment.scale[1],node.scale.z-alignment.scale[2]];return values.every(value=>Math.abs(value)<epsilon);
}

function characterContainers(context){
  const graph=context.graph,definition=graph.characterPawn||graph.soccerPawn;
  definition.movement=definition.movement||{};
  if(definition.movement.facingMode==null)definition.movement.facingMode=graph.soccerPawn?'heading':'movement';
  if(definition.movement.inputMode==null)definition.movement.inputMode=graph.soccerPawn?'heading':'camera';
  if(!Array.isArray(definition.animationSet)){
    const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET;
    definition.animationSet=runtime?runtime.fromLegacy(definition.animations||{}):[];
  }
  const motionChildren=definition.animationSet.map((entry,index)=>({id:'motion:'+index,label:entry.name||entry.clip||('Motion '+(index+1)),icon:'▶',badge:entry.state||'grounded',kind:'motion',index}));
  return [
    {id:'overview',label:'Pawn Overview',icon:'◇',kind:'overview'},
    {id:'model',label:'Main Mesh',icon:'◆',badge:definition.model?'GLB':'missing',kind:'model'},
    {id:'skeleton',label:'Skeleton & Rig',icon:'⌘',kind:'skeleton'},
    {id:'collision',label:'Collision Capsule',icon:'⬡',kind:'fields',fields:[
      {label:'Radius',path:'movement.radius',type:'number',min:.1,max:2,step:.05},
      {label:'Jump Height',path:'movement.jumpHeight',type:'number',min:0,max:5,step:.05},
      {label:'Gravity',path:'movement.gravity',type:'number',min:1,max:80,step:.5},
    ]},
    {id:'movement',label:'Movement Model',icon:'↗',kind:'fields',fields:[
      {label:'Walk Speed',path:'movement.walkSpeed',type:'number',min:.2,max:8,step:.1},
      {label:'Run Speed',path:'movement.runSpeed',type:'number',min:.5,max:14,step:.1},
      {label:'Sprint Multiplier',path:'movement.sprintMultiplier',type:'number',min:1,max:2.5,step:.05},
      {label:'Acceleration',path:'movement.acceleration',type:'number',min:1,max:80,step:.5},
      {label:'Turn Rate',path:'movement.turnRate',type:'number',min:.5,max:40,step:.5},
      {label:'Air Control',path:'movement.airControl',type:'number',min:0,max:1,step:.05},
      {label:'Movement Space',path:'movement.inputMode',type:'select',options:['camera','heading']},
      {label:'Facing Behaviour',path:'movement.facingMode',type:'select',options:['movement','heading']},
    ]},
    {id:'motion-set',label:'Motion Animation Set',icon:'⧉',badge:String(motionChildren.length),kind:'motion-set',children:motionChildren},
    {id:'camera',label:'Camera',icon:'◉',kind:'fields',fields:[
      {label:'Mode',path:'camera.mode',type:'select',options:['free','arcade','cinematic']},
      {label:'View',path:'camera.view',type:'select',options:['third','close','first']},
      {label:'Distance',path:'camera.distance',type:'number',min:.2,max:40,step:.1},
      {label:'Height',path:'camera.height',type:'number',min:.2,max:20,step:.1},
      {label:'Lag',path:'camera.lag',type:'number',min:.1,max:30,step:.1},
      {label:'FOV',path:'camera.fov',type:'number',min:20,max:130,step:1},
    ]},
    {id:'appearance',label:'Appearance',icon:'◈',kind:'fields',fields:[
      {label:'Top Color',path:'appearance.shirtColor',type:'color'},
      {label:'Pants Color',path:'appearance.shortsColor',type:'color'},
      {label:'Hair Color',path:'appearance.hairColor',type:'color'},
      {label:'Skin Color',path:'appearance.skinColor',type:'color'},
    ]},
  ];
}

function vehicleContainers(context){
  const definition=context.graph.vehiclePawn||context.graph.playerPawnBlueprint;
  const wheels=Array.isArray(definition.wheels)?definition.wheels:[];
  return [
    {id:'overview',label:'Pawn Overview',icon:'◇',kind:'overview'},
    {id:'model',label:'Main Vehicle Mesh',icon:'◆',badge:sceneModel(context.graph,'vehicle_model')?'GLB':'missing',kind:'model'},
    {id:'driving',label:'Driving Model',icon:'↗',kind:'fields',fields:[
      {label:'Top Speed',path:'tuning.maxSpeed',type:'number',min:1,max:120,step:.5},{label:'Acceleration',path:'tuning.acceleration',type:'number',min:1,max:80,step:.5},{label:'Brake Force',path:'tuning.brake',type:'number',min:1,max:100,step:.5},{label:'Steering',path:'tuning.steer',type:'number',min:.1,max:6,step:.05},{label:'Grip',path:'tuning.grip',type:'number',min:.1,max:1,step:.01},{label:'Drag',path:'tuning.drag',type:'number',min:0,max:10,step:.05},
    ]},
    {id:'collision',label:'Body & Collision',icon:'⬡',kind:'fields',fields:[
      {label:'Mass (kg)',path:'collision.mass',type:'number',min:100,max:5000,step:10},{label:'Half Width',path:'collision.hx',type:'number',min:.1,max:5,step:.05},{label:'Half Height',path:'collision.hy',type:'number',min:.1,max:5,step:.05},{label:'Half Length',path:'collision.hz',type:'number',min:.1,max:10,step:.05},
    ]},
    {id:'suspension',label:'Suspension',icon:'≋',kind:'fields',fields:[
      {label:'Stiffness',path:'suspension.stiffness',type:'number',min:1,max:100,step:.5},{label:'Rest Length',path:'suspension.restLength',type:'number',min:.05,max:1.5,step:.01},{label:'Travel',path:'suspension.travel',type:'number',min:.02,max:1,step:.01},{label:'Wheel Radius',path:'suspension.radius',type:'number',min:.05,max:1.5,step:.01},{label:'Compression',path:'suspension.compression',type:'number',min:.1,max:20,step:.1},{label:'Relaxation',path:'suspension.relaxation',type:'number',min:.1,max:20,step:.1},
    ]},
    {id:'wheels',label:'Wheels',icon:'⊙',badge:String(wheels.length),kind:'group',children:wheels.map((wheel,index)=>({id:'wheel:'+index,label:wheel.visualId||('Wheel '+(index+1)),icon:'○',badge:wheel.front?'front':'rear',kind:'object',path:'wheels.'+index}))},
    {id:'lights',label:'Lights',icon:'✦',kind:'object',path:'lights'},
    {id:'effects',label:'Effects',icon:'✺',kind:'object',path:'effects'},
    {id:'audio',label:'Engine Audio',icon:'♪',kind:'object',path:'engineAudio'},
    {id:'camera',label:'Camera',icon:'◉',kind:'object',path:'camera'},
  ];
}

registerType({id:'character',label:'Character Pawn',match:graph=>!!graph.characterPawn,definition:graph=>graph.characterPawn,model:graph=>(graph.characterPawn&&graph.characterPawn.model)||(sceneModel(graph,'character_model')||{}).asset,containers:characterContainers});
registerType({id:'soccer',label:'Soccer Pawn',match:graph=>!!graph.soccerPawn,definition:graph=>graph.soccerPawn,model:graph=>(graph.soccerPawn&&graph.soccerPawn.model)||(sceneModel(graph,'character_model')||{}).asset,containers:characterContainers});
registerType({id:'vehicle',label:'Vehicle Pawn',match:graph=>!!graph.vehiclePawn||!!graph.playerPawnBlueprint,definition:graph=>graph.vehiclePawn||graph.playerPawnBlueprint,model:graph=>(graph.vehiclePawn&&graph.vehiclePawn.modelAsset)||(sceneModel(graph,'vehicle_model')||sceneModel(graph)||{}).asset,containers:vehicleContainers});

function create(deps){
  deps=deps||{};const STORE=deps.STORE,status=deps.status||function(){},assetLibraryLoad=deps.assetLibraryLoad||(()=>[]),importAssetFiles=deps.importAssetFiles||(()=>Promise.resolve([])),onSave=deps.onSave||function(){},pluginManager=deps.pluginManager||null,tr=(en,it)=>deps.GAME&&deps.GAME.i18n&&deps.GAME.i18n.lang==='it'?(it||en):en;
  let active=null;
  function syncPluginAdapters(){if(!pluginManager||!pluginManager.extensions)return;(pluginManager.extensions('pawnStudioType')||[]).forEach(extension=>{const id=String(extension.id||'');if(!id)return;registerType(Object.assign({},extension,{id:'plugin:'+extension.pluginId+':'+id,match:graph=>pluginManager.isEnabled(extension.pluginId)&&extension.match(graph)}));});}
  function studioContainers(state){
    const base=state.adapter.containers(state.context)||[];
    if(!pluginManager||!pluginManager.extensions)return base;
    const extra=[];
    (pluginManager.extensions('pawnStudioAugment')||[]).forEach(extension=>{
      try {
        if(typeof extension.match==='function'&&!extension.match(state.graph))return;
        const containers=typeof extension.containers==='function'?extension.containers(state.context):(extension.containers||[]);
        extra.push.apply(extra,containers||[]);
      } catch(error){console.warn('Pawn Studio augment failed:',extension.id,error);}
    });
    return base.concat(extra);
  }
  function close(){if(!active)return;commitStudioAuthoring(active);if(active.keyHandler)removeEventListener('keydown',active.keyHandler);if(active.raf)cancelAnimationFrame(active.raf);if(active.previewInterval)clearInterval(active.previewInterval);if(active.timer&&active.timer.dispose)active.timer.dispose();if(active.resizeObserver)active.resizeObserver.disconnect();if(active.controls&&active.controls.dispose)active.controls.dispose();clearRigEditor(active);clearCurveEditor(active);if(active.transformControls){active.transformControls.detach();if(active.transformControls.dispose)active.transformControls.dispose();}if(active.transformHelper&&active.transformHelper.parent)active.transformHelper.parent.remove(active.transformHelper);clearPreviewModel(active);if(active.renderer)active.renderer.dispose();if(active.overlay)active.overlay.remove();active=null;}
  function open(object,inputGraph){
    close();syncPluginAdapters();const graph=inputGraph||object&&object.userData&&object.userData.logicGraph;if(!graph)return false;const adapter=resolveType(graph);if(!adapter){status(tr('No Pawn Studio adapter is registered for this Logic Element.','Nessun adapter Pawn Studio registrato per questo Logic Element.'));return false;}
    const definition=adapter.definition?adapter.definition(graph):pawnDefinition(graph),context={object,graph,definition,adapter};
    const overlay=document.createElement('div');overlay.className='lk-logic-modal lk-pawn-studio-modal';
    const panel=document.createElement('div');panel.className='lk-logic-modal-panel lk-pawn-studio-panel';
    const head=document.createElement('div');head.className='lk-logic-modal-head';const title=document.createElement('b');title.textContent=(object&&object.userData&&object.userData.editorName||adapter.label)+' · Pawn Studio';
    const saveState=document.createElement('span');saveState.className='lk-ps-save-state';saveState.textContent=tr('Ready','Pronto');const closeButton=document.createElement('button');closeButton.type='button';closeButton.textContent='×';closeButton.addEventListener('click',close);head.append(title,saveState,closeButton);
    const body=document.createElement('div');body.className='lk-pawn-studio';body.innerHTML='<aside class="lk-ps-tree"><div class="lk-ps-pane-title">Pawn Containers</div><div class="lk-ps-tree-list"></div></aside><main class="lk-ps-preview"><div class="lk-ps-preview-mount"></div><div class="lk-ps-preview-toolbar"><button type="button" data-action="frame">Frame</button><span class="lk-ps-tool-group"><button type="button" data-transform="translate" title="Move (W)">Move</button><button type="button" data-transform="rotate" title="Rotate (E)">Rotate</button><button type="button" data-transform="scale" title="Scale (R)">Scale</button></span><button type="button" data-action="rig" title="Edit the selected animation pose on its skeleton">✣ Edit Rig</button><label class="lk-ps-rig-bone" hidden>Bone <select data-action="rig-bone"></select></label><button type="button" data-action="rig-reset" hidden>Reset Bone</button><button type="button" data-action="play">▶ Preview</button><button type="button" data-action="stop">■ Stop</button><label class="lk-ps-preview-speed">Speed <select data-action="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label></div><div class="lk-ps-preview-status"></div></main><aside class="lk-ps-properties"><div class="lk-ps-pane-title">Properties</div><div class="lk-ps-properties-body"></div></aside>';
    panel.append(head,body);overlay.appendChild(panel);document.body.appendChild(overlay);
    active={overlay,panel,graph,definition,adapter,object,context,selected:null,model:null,mixer:null,raf:0};
    setupPreview(active,body.querySelector('.lk-ps-preview-mount'),body.querySelector('.lk-ps-preview-status'));
    const persist=()=>{saveState.textContent=tr('Saving…','Salvataggio…');const saved=onSave(object,graph),parity=worldAlignmentMatches(object,graph);saveState.textContent=saved===false?tr('Save failed','Salvataggio fallito'):(parity===false?tr('Saved · world sync pending','Salvato · sincronizzazione mondo in attesa'):tr('Saved · editor synced','Salvato · editor sincronizzato'));renderTree();return saved;};
    active.persist=persist;active.properties=body.querySelector('.lk-ps-properties-body');active.tree=body.querySelector('.lk-ps-tree-list');active.previewStatus=body.querySelector('.lk-ps-preview-status');
    function renderTree(){
      active.tree.innerHTML='';active.containers=studioContainers(active);
      const append=(container,depth)=>{const row=document.createElement('button');row.type='button';row.className='lk-ps-tree-item';row.style.paddingLeft=(10+depth*17)+'px';row.dataset.id=container.id;const icon=document.createElement('span');icon.className='lk-ps-tree-icon';icon.textContent=container.icon||'◇';const label=document.createElement('b');label.textContent=container.label||container.id;row.append(icon,label);if(container.badge!=null){const badge=document.createElement('small');badge.textContent=container.badge;row.appendChild(badge);}row.classList.toggle('on',!!(active.selected&&active.selected.id===container.id));row.addEventListener('click',()=>select(container));active.tree.appendChild(row);(container.children||[]).forEach(child=>append(child,depth+1));};active.containers.forEach(container=>append(container,0));
    }
    function select(container){active.selected=container;if(container.kind==='motion'&&active.transformMode==='scale'){active.transformMode='translate';(active.transformButtons||[]).forEach(button=>button.classList.toggle('on',button.dataset.transform==='translate'));}if(container.kind!=='motion'){active.currentMotion=null;if(active.rigEditMode)setRigEditMode(active,false);}renderTree();renderProperties(active,container,persist,assetLibraryLoad,importAssetFiles,tr);updateRigButton(active);if(container.kind==='motion')previewMotion(active,definition.animationSet[container.index]).then(()=>{if(active&&active.rigEditMode)buildRigEditor(active,definition.animationSet[container.index]);});else if(container.kind==='model'||container.kind==='overview'||container.kind==='skeleton')previewMainModel(active);}
    active.playButton=body.querySelector('[data-action="play"]');active.stopButton=body.querySelector('[data-action="stop"]');active.speedInput=body.querySelector('[data-action="speed"]');
    body.querySelector('[data-action="frame"]').addEventListener('click',()=>framePreview(active));active.playButton.addEventListener('click',()=>{const entry=active.selected&&active.selected.kind==='motion'?definition.animationSet[active.selected.index]:active.currentMotion||definition.animationSet&&definition.animationSet[0];if(entry)startMotionPreview(active,entry);else if(active.previewStatus)active.previewStatus.textContent=tr('No animation slot is configured. Add or select one first.','Nessuno slot animazione configurato. Aggiungine o selezionane uno.');});active.stopButton.addEventListener('click',()=>stopMotionPreview(active));
    active.speedInput.addEventListener('change',()=>applyPreviewRate(active));
    active.rigButton=body.querySelector('[data-action="rig"]');active.rigBoneSelect=body.querySelector('[data-action="rig-bone"]');active.rigBoneLabel=active.rigBoneSelect.parentElement;active.rigResetButton=body.querySelector('[data-action="rig-reset"]');active.rigButton.addEventListener('click',()=>setRigEditMode(active,!active.rigEditMode));active.rigBoneSelect.addEventListener('change',()=>selectRigBone(active,active.rigBoneSelect.value));active.rigResetButton.addEventListener('click',()=>resetRigBone(active));
    active.transformButtons=Array.from(body.querySelectorAll('[data-transform]'));active.transformButtons.forEach(button=>button.addEventListener('click',()=>setStudioTransformMode(active,button.dataset.transform)));setStudioTransformMode(active,'translate');active.keyHandler=event=>{if(!active||/input|select|textarea/i.test(String(event.target&&event.target.tagName||'')))return;const mode={w:'translate',e:'rotate',r:'scale'}[String(event.key||'').toLowerCase()];if(mode){event.preventDefault();setStudioTransformMode(active,mode);}};addEventListener('keydown',active.keyHandler);
    renderTree();select(active.containers[0]);return true;
  }

  function setupPreview(state,mount,statusEl){
    const THREE=window.THREE;if(!THREE){statusEl.textContent='Three.js unavailable';return;}
    const backend=window.LK_RUNTIME_RENDERING_BACKEND,renderer=backend?backend.createWebGL({antialias:true,alpha:false},'pawn-studio'):new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.setClearColor(0x080d14,1);mount.appendChild(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.01,1000);camera.position.set(3,2.3,4.8);scene.add(new THREE.HemisphereLight(0xdbeafe,0x182033,2.2));const key=new THREE.DirectionalLight(0xffffff,2.6);key.position.set(4,7,5);scene.add(key);scene.add(new THREE.GridHelper(20,20,0x334155,0x1e293b));
    const controls=THREE.OrbitControls?new THREE.OrbitControls(camera,renderer.domElement):null;if(controls){controls.enableDamping=true;controls.target.set(0,1,0);}
    const resize=()=>{const rect=mount.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(mount);resize();
    const timer=new THREE.Timer();if(timer.connect&&typeof document!=='undefined')timer.connect(document);
    state.renderer=renderer;state.scene=scene;state.camera=camera;state.controls=controls;state.resizeObserver=observer;state.timer=timer;state.previewStatus=statusEl;state.previewPlaying=true;state.transformMode='translate';state.activePreviewScale=1;
    if(THREE.TransformControls){
      const transform=new THREE.TransformControls(camera,renderer.domElement),helper=transform.getHelper?transform.getHelper():transform;state.transformControls=transform;state.transformHelper=helper;scene.add(helper);transform.setMode('translate');transform.setSpace('world');
      transform.addEventListener('dragging-changed',event=>{state.gizmoDragging=!!event.value;if(controls)controls.enabled=!event.value;if(!event.value&&state.rigEditMode&&transform.object&&transform.object.isBone)syncRigCorrectionFromBone(state);else if(!event.value&&transform.object===state.model){if(state.currentMotion&&state.previewRootLock)syncMotionTransformFromModel(state);else lockPreviewRoot(state,state.model);}});
      transform.addEventListener('objectChange',()=>{if(state.rigEditMode&&transform.object&&transform.object.isBone)syncRigCorrectionFromBone(state);else if(state.curveMode&&transform.object===state.curveHandle)syncCurveFromHandle(state);else syncAlignmentFromTransform(state);scheduleStudioAuthoringCommit(state);});
      transform.addEventListener('mouseUp',()=>commitStudioAuthoring(state));
    }
    renderer.domElement.dataset.pawnPreviewTicks='0';
    const advance=()=>{if(active!==state)return;renderer.domElement.dataset.pawnPreviewTicks=String((Number(renderer.domElement.dataset.pawnPreviewTicks)||0)+1);state.timer.update();const dt=Math.min(.05,state.timer.getDelta()),editingRoot=state.gizmoDragging&&state.transformControls&&state.transformControls.object===state.model;if(!((state.rigEditMode&&state.gizmoDragging)||editingRoot)){clearPreviewRigCorrections(state);if(state.previewPlaying!==false&&state.mixer)state.mixer.update(dt);applyPreviewRigLock(state);applyPreviewRigCorrections(state);}if(state.previewPlaying!==false&&state.placeholderController&&state.placeholderMotion){const entry=state.placeholderMotion,dir=entry.direction||[0,0],airborne=entry.state==='jump'||entry.state==='fall';state.placeholderController.update({x:(Number(dir[0])||0)*(Number(entry.speed)||0),z:(Number(dir[1])||0)*(Number(entry.speed)||0),speed:Number(entry.speed)||0,grounded:!airborne,velocityY:entry.state==='jump'?2:(entry.state==='fall'?-2:0)},dt);}if(state.clothPreview)state.clothPreview.update(dt);};
    state.previewInterval=setInterval(advance,1000/60);
    const loop=()=>{if(active!==state)return;state.raf=requestAnimationFrame(loop);if(controls)controls.update();renderer.render(scene,camera);};state.raf=requestAnimationFrame(loop);previewMainModel(state);
  }
  function scheduleStudioAuthoringCommit(state){if(!state)return;state.authoringDirty=true;if(state.authoringCommitTimer)clearTimeout(state.authoringCommitTimer);state.authoringCommitTimer=setTimeout(()=>commitStudioAuthoring(state),180);}
  function commitStudioAuthoring(state){if(!state)return false;if(state.authoringCommitTimer){clearTimeout(state.authoringCommitTimer);state.authoringCommitTimer=0;}if(!state.authoringDirty)return false;state.authoringDirty=false;if(state.persist)state.persist();return true;}
  function alignmentScaleWithoutPreview(state){const factor=Math.max(.0001,Number(state&&state.activePreviewScale)||1),scale=state&&state.model&&state.model.scale;return scale?[Math.max(.01,scale.x/factor),Math.max(.01,scale.y/factor),Math.max(.01,scale.z/factor)]:[1,1,1];}
  function syncAlignmentFromTransform(state){
    const model=state&&state.model;if(!model)return false;
    if(state.currentMotion&&state.previewRootLock)return syncMotionTransformFromModel(state);
    const element=characterModelElement(state&&state.graph);if(!element||!model.userData.lkPawnStudioAlignmentRoot)return false;
    element.position=[model.position.x,model.position.y,model.position.z];element.rotation=[window.THREE.MathUtils.radToDeg(model.rotation.x),window.THREE.MathUtils.radToDeg(model.rotation.y),window.THREE.MathUtils.radToDeg(model.rotation.z)];element.scale=alignmentScaleWithoutPreview(state);return true;
  }
  function refreshStudioTransformTarget(state){
    const transform=state&&state.transformControls;if(!transform)return;
    if(state.rigEditMode&&state.rigEditBone){transform.setMode('rotate');transform.setSpace('local');transform.attach(state.rigEditBone);return;}
    if(state.curveMode&&state.curveHandle){transform.setMode('translate');transform.setSpace('world');transform.attach(state.curveHandle);return;}
    if(state.model&&((state.currentMotion&&state.previewRootLock)||(state.model.userData&&state.model.userData.lkPawnStudioAlignmentRoot))){transform.setMode(state.transformMode||'translate');transform.setSpace(state.transformMode==='translate'?'world':'local');transform.attach(state.model);}else transform.detach();
  }
  function setStudioTransformMode(state,mode){
    if(!['translate','rotate','scale'].includes(mode))return;if(mode==='scale'&&state.selected&&state.selected.kind==='motion'){if(state.previewStatus)state.previewStatus.textContent='Animation slots inherit Main Mesh scale. Use Move or Rotate for an isolated slot correction.';return;}commitStudioAuthoring(state);state.transformMode=mode;if(state.rigEditMode)setRigEditMode(state,false);if(state.curveMode)setCurveMode(state,false);refreshStudioTransformTarget(state);(state.transformButtons||[]).forEach(button=>button.classList.toggle('on',button.dataset.transform===mode));
  }
  function rigBoneKey(name){const runtime=window.LK_RUNTIME_CHARACTER_LOCOMOTION||window.LK_RUNTIME_SOCCER_LOCOMOTION;return runtime&&runtime.normalizedTrackNode?runtime.normalizedTrackNode(name):String(name||'').toLowerCase().replace(/^(?:mixamorig|armature|skeleton|rig)/,'').replace(/[^a-z0-9]/g,'');}
  function normalizedRigCorrections(entry){const source=entry&&entry.rigCorrections&&typeof entry.rigCorrections==='object'?entry.rigCorrections:{},result={};Object.keys(source).forEach(key=>{const value=source[key];if(Array.isArray(value))result[rigBoneKey(key)]=[Number(value[0])||0,Number(value[1])||0,Number(value[2])||0];});return result;}
  function normalizedMotionTransform(entry){const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET;if(runtime&&runtime.motionTransform)return runtime.motionTransform(entry&&entry.motionTransform);const source=entry&&entry.motionTransform||{},vector=value=>{value=Array.isArray(value)?value:[0,0,0];return [Number(value[0])||0,Number(value[1])||0,Number(value[2])||0];};return {position:vector(source.position),rotation:vector(source.rotation)};}
  function applyPreviewMotionTransform(state){if(!state||!state.model||!state.previewRootLock||!state.currentMotion||!window.THREE)return false;const runtime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET;if(runtime&&runtime.applyMotionTransform)return runtime.applyMotionTransform(window.THREE,state.model,state.previewRootLock,state.currentMotion.motionTransform);const value=normalizedMotionTransform(state.currentMotion),THREE=window.THREE,delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(value.rotation[0]),THREE.MathUtils.degToRad(value.rotation[1]),THREE.MathUtils.degToRad(value.rotation[2]),'XYZ'));state.model.position.copy(state.previewRootLock.position).add(new THREE.Vector3().fromArray(value.position));state.model.quaternion.copy(state.previewRootLock.quaternion).multiply(delta).normalize();state.model.scale.copy(state.previewRootLock.scale);return true;}
  function syncMotionTransformFromModel(state){if(!state||!state.model||!state.previewRootLock||!state.currentMotion||!window.THREE)return false;const THREE=window.THREE,offset=state.model.position.clone().sub(state.previewRootLock.position),delta=state.previewRootLock.quaternion.clone().invert().multiply(state.model.quaternion).normalize(),euler=new THREE.Euler().setFromQuaternion(delta,'XYZ'),clean=value=>Math.abs(value)<.0001?0:Number(value.toFixed(3));state.currentMotion.motionTransform={position:[offset.x,offset.y,offset.z].map(clean),rotation:[euler.x,euler.y,euler.z].map(value=>clean(THREE.MathUtils.radToDeg(value)))};return true;}
  function rigCorrectionQuaternion(angles){const THREE=window.THREE,value=Array.isArray(angles)?angles:[0,0,0];return new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(Number(value[0])||0),THREE.MathUtils.degToRad(Number(value[1])||0),THREE.MathUtils.degToRad(Number(value[2])||0),'XYZ'));}
  function editableRigBones(state){const bones=[];if(state&&state.model&&state.model.traverse)state.model.traverse(node=>{if(node&&node.isBone&&node.name)bones.push(node);});return bones;}
  function clearPreviewRigCorrections(state){if(!state||!state.previewAppliedRigCorrections)return;state.previewAppliedRigCorrections.forEach((delta,bone)=>{if(bone&&bone.quaternion)bone.quaternion.multiply(delta.clone().invert()).normalize();});state.previewAppliedRigCorrections.clear();}
  function applyPreviewRigCorrections(state){if(!state||!state.currentMotion||!state.model)return;const corrections=normalizedRigCorrections(state.currentMotion),applied=state.previewAppliedRigCorrections||(state.previewAppliedRigCorrections=new Map());editableRigBones(state).forEach(bone=>{const angles=corrections[rigBoneKey(bone.name)];if(!angles)return;const delta=rigCorrectionQuaternion(angles);bone.quaternion.multiply(delta).normalize();applied.set(bone,delta);});state.model.updateMatrixWorld(true);}
  function clearRigEditor(state){if(!state)return;clearPreviewRigCorrections(state);if(state.transformControls&&state.rigEditBone&&state.transformControls.object===state.rigEditBone)state.transformControls.detach();if(state.rigHelper&&state.rigHelper.parent)state.rigHelper.parent.remove(state.rigHelper);if(state.rigHelper&&state.rigHelper.geometry&&state.rigHelper.geometry.dispose)state.rigHelper.geometry.dispose();if(state.rigHelper&&state.rigHelper.material&&state.rigHelper.material.dispose)state.rigHelper.material.dispose();state.rigHelper=null;state.rigEditBone=null;state.rigEditBaseQuaternion=null;if(state.rigBoneLabel)state.rigBoneLabel.hidden=true;if(state.rigResetButton)state.rigResetButton.hidden=true;}
  function selectRigBone(state,key){
    if(!state||!state.rigEditMode)return;clearPreviewRigCorrections(state);applyPreviewRigCorrections(state);const bone=editableRigBones(state).find(item=>rigBoneKey(item.name)===key)||editableRigBones(state)[0];if(!bone)return;const correction=normalizedRigCorrections(state.currentMotion)[rigBoneKey(bone.name)]||[0,0,0],delta=rigCorrectionQuaternion(correction);state.rigEditBone=bone;state.rigEditBaseQuaternion=bone.quaternion.clone().multiply(delta.clone().invert()).normalize();if(state.rigBoneSelect)state.rigBoneSelect.value=rigBoneKey(bone.name);refreshStudioTransformTarget(state);if(state.previewStatus)state.previewStatus.textContent=(state.currentMotion.name||state.currentMotion.clip||'Animation')+' · '+tr('Edit Rig: rotate ','Edit Rig: ruota ')+bone.name;
  }
  function syncRigCorrectionFromBone(state){const bone=state&&state.rigEditBone,entry=state&&state.currentMotion,base=state&&state.rigEditBaseQuaternion;if(!bone||!entry||!base||!window.THREE)return false;const delta=base.clone().invert().multiply(bone.quaternion).normalize(),euler=new window.THREE.Euler().setFromQuaternion(delta,'XYZ'),toDeg=window.THREE.MathUtils.radToDeg,key=rigBoneKey(bone.name);entry.rigCorrections=normalizedRigCorrections(entry);entry.rigCorrections[key]=[toDeg(euler.x),toDeg(euler.y),toDeg(euler.z)].map(value=>Math.abs(value)<.0001?0:Number(value.toFixed(3)));if(state.previewAppliedRigCorrections)state.previewAppliedRigCorrections.set(bone,delta.clone());return true;}
  function resetRigBone(state){const bone=state&&state.rigEditBone,entry=state&&state.currentMotion;if(!bone||!entry)return false;entry.rigCorrections=normalizedRigCorrections(entry);delete entry.rigCorrections[rigBoneKey(bone.name)];bone.quaternion.copy(state.rigEditBaseQuaternion);if(state.previewAppliedRigCorrections)state.previewAppliedRigCorrections.delete(bone);scheduleStudioAuthoringCommit(state);commitStudioAuthoring(state);return true;}
  function buildRigEditor(state,entry){clearRigEditor(state);if(!state||!entry||!state.model||!window.THREE)return;const bones=editableRigBones(state);if(!bones.length){state.rigEditMode=false;updateRigButton(state);if(state.previewStatus)state.previewStatus.textContent=tr('Edit Rig unavailable: the Main Mesh has no editable bones.','Edit Rig non disponibile: la Main Mesh non contiene bone modificabili.');return;}entry.rigCorrections=normalizedRigCorrections(entry);state.previewPlaying=false;if(state.previewAction)state.previewAction.paused=true;clearPreviewRigCorrections(state);applyPreviewRigCorrections(state);state.rigHelper=new window.THREE.SkeletonHelper(state.model);state.rigHelper.material.depthTest=false;state.rigHelper.material.transparent=true;state.rigHelper.material.opacity=.9;state.rigHelper.renderOrder=30;state.scene.add(state.rigHelper);state.rigBoneSelect.innerHTML='';bones.forEach(bone=>state.rigBoneSelect.appendChild(new Option(bone.name,rigBoneKey(bone.name))));state.rigBoneLabel.hidden=false;state.rigResetButton.hidden=false;const preferred=bones.find(bone=>/hips|pelvis/i.test(rigBoneKey(bone.name)))||bones.find(bone=>/spine/i.test(rigBoneKey(bone.name)))||bones[0];selectRigBone(state,rigBoneKey(preferred.name));}
  function setRigEditMode(state,enabled){commitStudioAuthoring(state);state.rigEditMode=enabled===true&&!!(state.selected&&state.selected.kind==='motion');if(state.rigEditMode)buildRigEditor(state,state.definition.animationSet[state.selected.index]);else {clearRigEditor(state);refreshStudioTransformTarget(state);}updateRigButton(state);}
  function updateRigButton(state){if(!state||!state.rigButton)return;const available=!!(state.selected&&state.selected.kind==='motion');state.rigButton.disabled=!available;state.rigButton.classList.toggle('on',available&&state.rigEditMode===true);}
  function updateCurveButton(state){if(!state||!state.curveButton)return;const available=!!(state.selected&&state.selected.kind==='motion');state.curveButton.disabled=!available;state.curveButton.classList.toggle('on',available&&state.curveMode===true);}
  function normalizedCurve(entry){const source=entry&&entry.curveCorrection||{},offset=Array.isArray(source.offset)?source.offset:[0,0,0],influence=source.influence==null?1:Number(source.influence);return {offset:[Number(offset[0])||0,Number(offset[1])||0,Number(offset[2])||0],influence:Math.max(0,Math.min(1,Number.isFinite(influence)?influence:1)),falloff:'smooth-midpoint'};}
  function curveWeight(t,influence){return Math.sin(Math.PI*Math.max(0,Math.min(1,t)))**2*Math.max(0,Math.min(1,Number(influence)||0));}
  function updateCurveLine(state){
    if(!state||!state.curveLine||!state.currentMotion)return;const correction=normalizedCurve(state.currentMotion),positions=state.curveLine.geometry.attributes.position.array,count=positions.length/3;
    for(let i=0;i<count;i++){const t=i/(count-1),weight=curveWeight(t,correction.influence),baseZ=(t-.5)*2.4;positions[i*3]=correction.offset[0]*weight;positions[i*3+1]=.035+correction.offset[1]*weight;positions[i*3+2]=baseZ+correction.offset[2]*weight;}
    state.curveLine.geometry.attributes.position.needsUpdate=true;state.curveLine.geometry.computeBoundingSphere();
  }
  function clearCurveEditor(state){
    if(!state)return;if(state.transformControls&&state.curveHandle&&state.transformControls.object===state.curveHandle)state.transformControls.detach();
    if(state.curveGroup){state.curveGroup.traverse(node=>{if(node.geometry&&node.geometry.dispose)node.geometry.dispose();if(node.material&&node.material.dispose)node.material.dispose();});if(state.curveGroup.parent)state.curveGroup.parent.remove(state.curveGroup);}state.curveGroup=null;state.curveLine=null;state.curveHandle=null;
  }
  function buildCurveEditor(state,entry){
    clearCurveEditor(state);if(!state||!state.scene||!entry||!window.THREE)return;const THREE=window.THREE,correction=normalizedCurve(entry);entry.curveCorrection=correction;
    const group=new THREE.Group();group.name='Flying Curve editor';const baselineGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,.02,-1.2),new THREE.Vector3(0,.02,1.2)]),baseline=new THREE.Line(baselineGeometry,new THREE.LineBasicMaterial({color:0x64748b,transparent:true,opacity:.65}));group.add(baseline);
    const geometry=new THREE.BufferGeometry(),points=new Float32Array(33*3);geometry.setAttribute('position',new THREE.BufferAttribute(points,3));const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0x38bdf8,depthTest:false,transparent:true,opacity:.95}));line.renderOrder=20;group.add(line);
    const handle=new THREE.Mesh(new THREE.SphereGeometry(.075,18,12),new THREE.MeshStandardMaterial({color:0xffd166,emissive:0x5a3b00,depthTest:false}));handle.position.set(correction.offset[0],.035+correction.offset[1],correction.offset[2]);handle.renderOrder=21;handle.userData.lkFlyingCurveHandle=true;group.add(handle);state.scene.add(group);state.curveGroup=group;state.curveLine=line;state.curveHandle=handle;updateCurveLine(state);refreshStudioTransformTarget(state);
    if(state.previewStatus)state.previewStatus.textContent=(entry.name||entry.clip||'Animation')+' · '+tr('Flying Curve active: drag the gold point to reshape the broad middle of the motion','Flying Curve attiva: trascina il punto dorato per correggere in modo morbido la parte centrale del movimento');
  }
  function syncCurveFromHandle(state){if(!state||!state.curveHandle||!state.currentMotion)return;const handle=state.curveHandle,correction=normalizedCurve(state.currentMotion);correction.offset=[handle.position.x,handle.position.y-.035,handle.position.z];state.currentMotion.curveCorrection=correction;updateCurveLine(state);}
  function setCurveMode(state,enabled){commitStudioAuthoring(state);state.curveMode=enabled===true&&!!(state.selected&&state.selected.kind==='motion');if(state.curveMode)buildCurveEditor(state,state.definition.animationSet[state.selected.index]);else {clearCurveEditor(state);refreshStudioTransformTarget(state);}updateCurveButton(state);}
  function applyPreviewCurveCorrection(state){
    if(!state||!state.model||!state.previewRootLock||!state.currentMotion||!state.previewAction)return;const clip=state.previewAction.getClip&&state.previewAction.getClip(),duration=Math.max(.0001,Number(clip&&clip.duration)||1),phase=((Number(state.previewAction.time)||0)%duration+duration)%duration/duration,correction=normalizedCurve(state.currentMotion),weight=curveWeight(phase,correction.influence);
    state.model.position.copy(state.previewRootLock.position);state.model.position.x+=correction.offset[0]*weight;state.model.position.y+=correction.offset[1]*weight;state.model.position.z+=correction.offset[2]*weight;state.model.updateMatrixWorld(true);
  }
  function startMotionPreview(state,entry){
    if(state&&state.rigEditMode)setRigEditMode(state,false);
    state.currentMotion=entry;state.previewPlaying=true;if(state.timer&&state.timer.reset)state.timer.reset();if(state.playButton)state.playButton.classList.add('on');if(state.stopButton)state.stopButton.classList.remove('on');
    if(state.previewEntryReady===entry&&state.previewAction){state.previewAction.paused=false;state.previewAction.reset().play();applyPreviewRate(state);if(state.previewStatus)state.previewStatus.textContent=(entry.name||entry.clip||'Animation')+' · '+tr('preview playing','preview in riproduzione');return Promise.resolve(state.model);}
    if(state.previewEntryReady===entry&&state.placeholderController){if(state.previewStatus)state.previewStatus.textContent=(entry.name||entry.clip||'Animation')+' · '+tr('procedural preview playing','preview procedurale in riproduzione');return Promise.resolve(state.model);}
    return previewMotion(state,entry);
  }
  function stopMotionPreview(state){state.previewPlaying=false;if(state.previewAction)state.previewAction.paused=true;if(state.playButton)state.playButton.classList.remove('on');if(state.stopButton)state.stopButton.classList.add('on');if(state.previewStatus)state.previewStatus.textContent=tr('Preview stopped on the current pose','Preview arrestata sulla posa corrente');return true;}
  function applyPreviewRate(state){if(!state||!state.previewAction)return;const authored=Math.max(.01,Number(state.currentMotion&&state.currentMotion.playbackRate)||1),preview=Math.max(.01,Number(state.speedInput&&state.speedInput.value)||1);state.previewAction.setEffectiveTimeScale(authored*preview);}
  function configurePreviewAction(state,action,entry){const THREE=window.THREE;action.setLoop(entry.loop===false?THREE.LoopOnce:THREE.LoopRepeat,entry.loop===false?1:Infinity);action.clampWhenFinished=entry.loop===false;action.play();state.previewAction=action;state.previewEntryReady=entry;applyPreviewRate(state);return action;}
  function disposeModel(model){if(!model||!model.traverse)return;model.traverse(node=>{if(node.geometry&&node.geometry.dispose)node.geometry.dispose();const materials=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];materials.forEach(material=>{if(material&&material.dispose)material.dispose();});});}
  function clearPreviewModel(state){clearRigEditor(state);if(state.clothBrushCleanup)state.clothBrushCleanup();state.clothBrushCleanup=null;if(state.clothPreview)state.clothPreview.dispose();state.clothPreview=null;if(state.transformControls&&state.model&&state.transformControls.object===state.model)state.transformControls.detach();if(state.mixer){const root=state.mixer.getRoot&&state.mixer.getRoot();state.mixer.stopAllAction();if(root&&state.mixer.uncacheRoot)state.mixer.uncacheRoot(root);}state.mixer=null;state.previewAction=null;state.previewEntryReady=null;state.previewRootLock=null;state.previewRigLock=null;state.previewAppliedRigCorrections=null;state.activePreviewScale=1;if(state.placeholderController)state.placeholderController.dispose();state.placeholderController=null;state.placeholderMotion=null;state.modelIsPlaceholder=false;if(state.previewHelper&&state.previewHelper.parent)state.previewHelper.parent.remove(state.previewHelper);if(state.previewHelper&&state.previewHelper.geometry&&state.previewHelper.geometry.dispose)state.previewHelper.geometry.dispose();if(state.previewHelper&&state.previewHelper.material&&state.previewHelper.material.dispose)state.previewHelper.material.dispose();state.previewHelper=null;if(state.model&&state.model.parent)state.model.parent.remove(state.model);disposeModel(state.model);state.model=null;state.skinnedMeshes=[];}
  function prepareModelBounds(state,model){state.skinnedMeshes=[];if(!model||!model.traverse)return;model.traverse(node=>{if(node&&node.isSkinnedMesh){state.skinnedMeshes.push(node);node.frustumCulled=false;}});}
  // Every top-level preview request (selecting Main Mesh/Overview/Skeleton,
  // or a Motion entry) bumps state.previewToken once and threads that same
  // token through its whole async chain. Clicking through several motion
  // entries quickly starts overlapping GLB/FBX loads that do not resolve in
  // request order; without this guard a stale, out-of-order response could
  // still win the race, clear the model the latest click just set up, and
  // leave the preview empty — the "converted FBX disappears" symptom.
  function nextPreviewToken(state){ state.previewToken=(state.previewToken||0)+1; return state.previewToken; }
  function previewStale(state,token){ return active!==state||state.previewToken!==token; }
  function libraryAssetForRef(ref){
    if(!ref)return null;const candidates=[ref.id,ref.key,ref.dbKey,ref.sourceDbKey].filter(Boolean);
    return assetLibraryLoad().find(asset=>asset&&candidates.some(value=>value===asset.id||value===asset.key||value===asset.dbKey||value===asset.sourceDbKey))||null;
  }
  function loadCanonicalAnimationSource(asset){
    const THREE=window.THREE;
    if(!THREE||!THREE.GLTFLoader)return Promise.reject(new Error('Canonical GLB animation loader unavailable'));
    const url=asset&&asset.dbKey&&window.LK_ASSET_BLOBS
      ?window.LK_ASSET_BLOBS.getUrl(asset.dbKey)
      :(asset&&asset.src?Promise.resolve(asset.src):Promise.reject(new Error('Canonical GLB animation source missing')));
    // Match character-pawn-base.loadAnimationContainer(): external motion
    // sources stay raw until retargeting. Fitting/grounding this source before
    // comparing its bones changes the armature ratio and creates a different
    // result from Play.
    return url.then(src=>new Promise((resolve,reject)=>{
      new THREE.GLTFLoader().load(src,gltf=>{
        const model=gltf&&gltf.scene;if(!model){reject(new Error('Canonical GLB animation scene missing'));return;}
        model.animations=(gltf.animations||[]).map(clip=>clip&&clip.clone?clip.clone():clip);
        model.userData=Object.assign({},model.userData,{lkPreviewSource:'canonical-glb-raw'});
        resolve(model);
      },undefined,reject);
    }));
  }
  function loadPreviewAsset(ref,options){
    const libraryAsset=libraryAssetForRef(ref),asset=Object.assign({},libraryAsset||{},ref||{});
    const loaders=pluginManager&&pluginManager.extensions?pluginManager.extensions('assetPreviewLoader'):[];
    const loader=loaders.find(item=>item&&typeof item.load==='function'&&typeof item.accepts==='function'&&item.accepts(asset));
    // Pawn Studio and Play must evaluate the same canonical object hierarchy.
    // An imported FBX remains useful as a rebuildable source, but previewing
    // it directly while Play loads its generated GLB produces different root
    // axes/bind poses on imperfect exports and makes authored slot transforms
    // appear offset. Prefer the exact GLB runtime path and use the source
    // loader only when that canonical build is unavailable.
    const hasCanonicalSource=!!(asset.dbKey||asset.src);
    const canonical=options&&options.animationSource&&hasCanonicalSource
      ?loadCanonicalAnimationSource(asset)
      :(STORE&&STORE.loadLogicElementAsset
        ?Promise.resolve(STORE.loadLogicElementAsset(asset)).then(model=>{if(model)model.userData=Object.assign({},model.userData,{lkPreviewSource:options&&options.animationSource?'canonical-glb-store-fallback':'canonical-glb'});return model;})
        :null);
    if(canonical)return canonical.catch(error=>{
      if(!loader)throw error;
      return Promise.resolve(loader.load(asset,{THREE:window.THREE,assetBlobs:window.LK_ASSET_BLOBS,STORE})).then(model=>{if(model)model.userData=Object.assign({},model.userData,{lkPreviewSource:loader.type||asset.sourceFormat||'source-fallback',lkCanonicalPreviewError:String(error&&error.message||error)});return model;});
    });
    if(loader)return Promise.resolve(loader.load(asset,{THREE:window.THREE,assetBlobs:window.LK_ASSET_BLOBS,STORE})).then(model=>{if(model)model.userData=Object.assign({},model.userData,{lkPreviewSource:loader.type||asset.sourceFormat||'source-fallback'});return model;});
    return Promise.reject(new Error('Asset preview loader unavailable'));
  }
  function applyCharacterPreviewAlignment(state){
    const model=state&&state.model;if(!model||!model.userData||!model.userData.lkPawnStudioAlignmentRoot||!window.THREE)return model;
    const alignment=characterModelAlignment(state.graph),rotation=alignment.rotation;
    model.position.set(alignment.position[0],alignment.position[1],alignment.position[2]);
    model.rotation.set(window.THREE.MathUtils.degToRad(rotation[0]),window.THREE.MathUtils.degToRad(rotation[1]),window.THREE.MathUtils.degToRad(rotation[2]));
    model.scale.set(alignment.scale[0],alignment.scale[1],alignment.scale[2]);model.updateMatrixWorld(true);return model;
  }
  function wrapCharacterPreviewModel(state,model){
    if(!model||!window.THREE||!(state.graph.characterPawn||state.graph.soccerPawn))return model;
    const root=new window.THREE.Group();root.name='Pawn Studio · Main Mesh Alignment';root.userData.lkPawnStudioAlignmentRoot=true;root.animations=Array.isArray(model.animations)?model.animations:[];root.add(model);state.model=root;applyCharacterPreviewAlignment(state);return root;
  }
  function loadMainModel(state,token){
    const ref=state.adapter.model?state.adapter.model(state.graph):null;
    clearPreviewModel(state);
    if(!ref){
      const isCharacter=state.adapter.id==='character'||state.adapter.id==='soccer';
      const placeholderRuntime=isCharacter&&window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION;
      const customVisual=typeof state.adapter.createPlaceholder==='function'?state.adapter.createPlaceholder({THREE:window.THREE,graph:state.graph,definition:state.definition}):null;
      const visual=customVisual||(placeholderRuntime&&placeholderRuntime.createVisual?placeholderRuntime.createVisual(window.THREE,state.definition&&state.definition.appearance):null);
      if(visual){
        state.model=visual;state.modelIsPlaceholder=true;state.scene.add(visual);
        if(placeholderRuntime&&!customVisual){state.placeholderController=placeholderRuntime.createController({walkSpeed:state.definition&&state.definition.movement&&state.definition.movement.walkSpeed,runSpeed:state.definition&&state.definition.movement&&state.definition.movement.runSpeed});state.placeholderController.bind(visual);}
        if(state.currentMotion){lockPreviewRoot(state,visual);applyPreviewRigLock(state);refreshStudioTransformTarget(state);}
        state.previewStatus.textContent=isCharacter?tr('Procedural T-pose placeholder · assign Main Mesh to replace it','Placeholder procedurale in T-pose · assegna la Mesh principale per sostituirlo'):tr('Category placeholder · assign Main Mesh to replace it','Placeholder di categoria · assegna la Mesh principale per sostituirlo');
        framePreview(state);
        return Promise.resolve(visual);
      }
      state.previewStatus.textContent=tr('No main mesh assigned. Select Main Mesh to choose or import one.','Nessuna mesh principale assegnata. Seleziona Mesh principale per sceglierla o importarla.');
      return Promise.resolve(null);
    }
    state.previewStatus.textContent=tr('Loading main mesh…','Caricamento mesh principale…');
    return loadPreviewAsset(ref).then(model=>{
      if(previewStale(state,token)){disposeModel(model);return null;}
      const direct=model.userData&&model.userData.lkPreviewSource==='fbx-source';
      if(direct){const box=new window.THREE.Box3().setFromObject(model),size=box.getSize(new window.THREE.Vector3()),maxDim=Math.max(size.x,size.y,size.z),fit=Math.max(.1,Number(ref.fit)||1.9);if(maxDim>.0001){model.scale.multiplyScalar(fit/maxDim);const fitted=new window.THREE.Box3().setFromObject(model),center=fitted.getCenter(new window.THREE.Vector3());model.position.set(-center.x,-fitted.min.y,-center.z);}}
      const clips=model.animations||[],previewModel=wrapCharacterPreviewModel(state,model);
      state.model=previewModel;prepareModelBounds(state,previewModel);state.scene.add(previewModel);refreshStudioTransformTarget(state);state.previewStatus.textContent=(ref.name||'GLB')+' · '+clips.length+' clips'+(direct?' · '+tr('direct FBX source','sorgente FBX diretta'):'');framePreview(state);return previewModel;
    }).catch(error=>{
      if(previewStale(state,token))return null;
      state.previewStatus.textContent=tr('Model error: ','Errore modello: ')+String(error&&error.message||error);return null;
    });
  }
  function previewMainModel(state){ return loadMainModel(state,nextPreviewToken(state)); }
  function localeNumber(value,fallback){const text=String(value==null?'':value).trim().replace(',','.');if(!text)return fallback;const parsed=Number(text);return Number.isFinite(parsed)?parsed:fallback;}
  // TEMP DIAGNOSTIC — remove after scale investigation. Enable with window.LK_PAWN_STUDIO_DEBUG=true in the console.
  function psDebug(){if(typeof window!=='undefined'&&window.LK_PAWN_STUDIO_DEBUG)console.log.apply(console,['[PawnStudio]'].concat([].slice.call(arguments)));}
  function psBox(model){if(!model||!window.THREE)return null;model.updateMatrixWorld(true);const b=new window.THREE.Box3().setFromObject(model);if(b.isEmpty())return{empty:true};const s=b.getSize(new window.THREE.Vector3());return{sx:+s.x.toFixed(3),sy:+s.y.toFixed(3),sz:+s.z.toFixed(3),maxDim:+Math.max(s.x,s.y,s.z).toFixed(3)};}
  function psScale(model){return model&&model.scale?[+model.scale.x.toFixed(4),+model.scale.y.toFixed(4),+model.scale.z.toFixed(4)]:null;}
  function motionPreviewScale(entry){return Math.max(.0001,Math.min(100,localeNumber(entry&&entry.previewScale,1)));}
  function lockPreviewRoot(state,model){if(!state||!model)return;state.previewRootLock={position:model.position.clone(),quaternion:model.quaternion.clone(),scale:model.scale.clone()};const rig=new Map();if(model.traverse)model.traverse(node=>{if(node&&node.position&&node.scale)rig.set(node,{position:node.position.clone(),scale:node.scale.clone()});});state.previewRigLock=rig;}
  function applyPreviewRigLock(state){if(!state||!state.model)return;if(state.previewRigLock)state.previewRigLock.forEach((value,node)=>{node.position.copy(value.position);node.scale.copy(value.scale);});if(state.previewRootLock){state.model.position.copy(state.previewRootLock.position);state.model.quaternion.copy(state.previewRootLock.quaternion);state.model.scale.copy(state.previewRootLock.scale);applyPreviewMotionTransform(state);}state.model.updateMatrixWorld(true);}
  function applyMainMotionPreviewScale(model,entry,state){const factor=motionPreviewScale(entry);if(state)state.activePreviewScale=factor;if(model&&model.scale&&Math.abs(factor-1)>.000001)model.scale.multiplyScalar(factor);return factor;}
  function fitStandaloneMotionModel(state,model,entry){
    if(!model||!window.THREE)return 1;
    const THREE=window.THREE,main=state.adapter.model?state.adapter.model(state.graph):null,authored=characterModelElement(state.graph),uniform=main&&authored&&Array.isArray(authored.scale)?Math.max(.01,Number(authored.scale[0])||1):1,targetHeight=Math.max(.1,Number(main&&main.fit)||1.9)*uniform*motionPreviewScale(entry);
    model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),sourceHeight=Math.max(size.x,size.y,size.z);
    psDebug('fitStandaloneMotionModel',{targetHeight:+targetHeight.toFixed(3),sourceHeight:+sourceHeight.toFixed(3),boxSize:[+size.x.toFixed(3),+size.y.toFixed(3),+size.z.toFixed(3)],scaleBefore:psScale(model),willScaleBy:sourceHeight>1e-5?+(targetHeight/sourceHeight).toFixed(4):'SKIPPED(sourceHeight<=1e-5)'});
    if(sourceHeight>1e-5)model.scale.multiplyScalar(targetHeight/sourceHeight);
    model.updateMatrixWorld(true);const fitted=new THREE.Box3().setFromObject(model),center=fitted.getCenter(new THREE.Vector3());model.position.x-=center.x;model.position.y-=fitted.min.y;model.position.z-=center.z;psDebug('fitStandaloneMotionModel done',{scaleAfter:psScale(model),fittedBox:psBox(model)});return targetHeight;
  }
  function preparePreviewClip(clip,model,sourceModel,entry,previewOptions){
    const runtime=window.LK_RUNTIME_CHARACTER_LOCOMOTION||window.LK_RUNTIME_SOCCER_LOCOMOTION;
    const sourceValid=!clip||!clip.validate||clip.validate();
    if(!sourceValid)return {clip,binding:runtime&&runtime.analyzeClipBinding?runtime.analyzeClipBinding(clip,model):null,motion:runtime&&runtime.analyzeClipMotion?runtime.analyzeClipMotion(clip):null,mode:'direct',valid:false};
    if(runtime&&runtime.retargetClipToSkeleton){const setRuntime=window.LK_RUNTIME_CHARACTER_ANIMATION_SET,lockRootYaw=!!(setRuntime&&setRuntime.lockRootYaw&&setRuntime.lockRootYaw(entry)),result=runtime.retargetClipToSkeleton(clip,model,sourceModel,{sourceOrientation:entry&&entry.sourceOrientation,protectSourceRig:previewOptions&&previewOptions.protectSourceRig===true,lockRootYaw});if(result){if(runtime.protectRuntimeMainMeshProportions)result.clip=runtime.protectRuntimeMainMeshProportions(result.clip);if(lockRootYaw&&runtime.lockClipRootYaw)result.clip=runtime.lockClipRootYaw(result.clip,model,window.THREE);result.valid=!result.clip||!result.clip.validate||result.clip.validate();if(result.valid&&result.clip&&result.clip.optimize)result.clip.optimize();return result;}}
    const prepared=runtime&&runtime.retargetClipNames?runtime.retargetClipNames(clip,model):clip;
    const binding=prepared&&prepared.userData&&prepared.userData.lkBinding||(runtime&&runtime.analyzeClipBinding?runtime.analyzeClipBinding(prepared,model):null),motion=runtime&&runtime.analyzeClipMotion?runtime.analyzeClipMotion(prepared):null;
    const valid=!prepared||!prepared.validate||prepared.validate();if(valid&&prepared&&prepared.optimize)prepared.optimize();return {clip:prepared,binding,motion,mode:'names',valid};
  }
  function findAnimationClip(clips,wanted,allowSoleFallback){const THREE=window.THREE,list=Array.isArray(clips)?clips:[],name=String(wanted||''),normalized=name.toLowerCase().replace(/[^a-z0-9]/g,''),exact=(THREE&&THREE.AnimationClip&&THREE.AnimationClip.findByName?THREE.AnimationClip.findByName(list,name):list.find(item=>item&&item.name===name)),partial=normalized&&list.find(item=>String(item&&item.name||'').toLowerCase().replace(/[^a-z0-9]/g,'').indexOf(normalized)>=0);return exact||partial||(allowSoleFallback&&list.length===1?list[0]:null)||null;}
  function proceduralMotionSlot(entry){
    const value=String(entry&&entry.action||entry&&entry.name||entry&&entry.clip||entry&&entry.state||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const slots=['strafeLeft','strafeRight','diveLeft','diveRight','celebrate','defeat','tackle','cross','shoot','pass','save','interact','jump','land','run','walk','idle'];
    const exact=slots.find(slot=>value.indexOf(slot.toLowerCase())>=0);if(exact)return exact;
    if(entry&&entry.state==='jump')return'jump';if(entry&&entry.state==='land')return'land';
    if(entry&&entry.state==='grounded'){const direction=Array.isArray(entry.direction)?entry.direction:[0,0],speed=Number(entry.speed)||0;if(Math.abs(direction[0])>.65)return direction[0]<0?'strafeLeft':'strafeRight';return speed<.15?'idle':(speed>3.2?'run':'walk');}
    return entry&&entry.state==='action'?'interact':'idle';
  }
  function bindingStatus(binding,motion,mode,retargetScale){
    if(!binding)return '';
    if(!binding.total)return ' · '+tr('clip has no animation tracks','la clip non contiene tracce di animazione');
    if(!binding.matched)return ' · '+tr('0/'+binding.total+' tracks bound: incompatible skeleton','0/'+binding.total+' tracce collegate: skeleton incompatibile');
    const movement=motion&&!motion.hasMotion?' · '+tr('tracks are static: no pose change in the clip','tracce statiche: la clip non cambia posa'):(motion?' · '+motion.animated+' '+tr('animated','animate'):'');
    const protectedRig=mode==='protected'?' · '+tr('Main Mesh proportions protected (rotation-only fallback)','proporzioni Main Mesh protette (fallback solo rotazioni)'):'';
    const scale=mode==='skeleton'&&Number.isFinite(Number(retargetScale))?' · '+tr('rig scale ','scala rig ')+Number(retargetScale).toFixed(3)+'×':'';
    const retargeted=mode==='skeleton'?' · '+tr('skeleton retargeted','skeleton retargetizzato')+scale:'';
    return ' · '+binding.matched+'/'+binding.total+' '+tr('tracks bound','tracce collegate')+movement+retargeted+protectedRig;
  }
  function previewMotion(state,entry){
    state.currentMotion=entry;if(state.playButton)state.playButton.classList.toggle('on',state.previewPlaying!==false);if(state.stopButton)state.stopButton.classList.toggle('on',state.previewPlaying===false);
    const token=nextPreviewToken(state);
    return loadMainModel(state,token).then(model=>{
      if(previewStale(state,token)||!model||!entry)return null;
      psDebug('previewMotion branch',{modelIsPlaceholder:state.modelIsPlaceholder,hasEntryAsset:!!entry.asset,mainModelScale:psScale(model),mainModelBox:psBox(model)});
      if(state.modelIsPlaceholder&&entry.asset){
        return loadPreviewAsset(entry.asset,{animationSource:true}).then(animationModel=>{
          if(previewStale(state,token)){disposeModel(animationModel);return null;}
          let hasMesh=false,hasBones=false;animationModel.traverse(node=>{if(node&&node.isMesh)hasMesh=true;if(node&&node.isBone)hasBones=true;});
          psDebug('previewMotion PATH B (standalone animation asset)',{hasMesh,hasBones,rawSourceBox:psBox(animationModel),rawSourceScale:psScale(animationModel)});
          if(hasMesh){
            clearPreviewModel(state);
            fitStandaloneMotionModel(state,animationModel,entry);state.model=animationModel;lockPreviewRoot(state,animationModel);applyPreviewRigLock(state);prepareModelBounds(state,animationModel);state.scene.add(animationModel);refreshStudioTransformTarget(state);
            const clips=animationModel.animations||[],wanted=String(entry.clip||''),clip=findAnimationClip(clips,wanted,true);
            if(clip){
              const THREE=window.THREE,prepared=preparePreviewClip(clip,animationModel,animationModel,entry,{protectSourceRig:true});
              if(prepared.valid===false)state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('invalid animation keyframes','keyframe animazione non validi');
              else {state.mixer=new THREE.AnimationMixer(animationModel);configurePreviewAction(state,state.mixer.clipAction(prepared.clip),entry);state.previewStatus.textContent=(entry.name||entry.clip)+' · '+clip.name+' · '+tr('source FBX/GLB preview','preview sorgente FBX/GLB')+bindingStatus(prepared.binding,prepared.motion,prepared.mode,prepared.retargetScale);}
            } else {
              // The converted file has a mesh but no matching (or no) clip.
              // Keep showing it in its bind pose instead of disposing it —
              // this is the only way to confirm an FBX->GLB conversion
              // actually produced a correct mesh/skeleton before chasing a
              // clip-name mismatch separately.
              state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('source FBX/GLB preview (no matching animation clip in this file)','preview sorgente FBX/GLB (nessuna clip di animazione corrispondente in questo file)');
            }
            framePreview(state);return animationModel;
          }
          if(hasBones&&window.THREE&&window.THREE.SkeletonHelper){
            clearPreviewModel(state);state.model=animationModel;lockPreviewRoot(state,animationModel);applyPreviewRigLock(state);state.scene.add(animationModel);refreshStudioTransformTarget(state);
            state.previewHelper=new window.THREE.SkeletonHelper(animationModel);state.previewHelper.material.depthTest=false;state.previewHelper.material.transparent=true;state.previewHelper.material.opacity=.92;state.scene.add(state.previewHelper);
            const clips=animationModel.animations||[],wanted=String(entry.clip||''),clip=findAnimationClip(clips,wanted,true);
            let binding=null,motion=null,mode='direct';if(clip){const prepared=preparePreviewClip(clip,animationModel,animationModel,entry,{protectSourceRig:true});binding=prepared.binding;motion=prepared.motion;mode=prepared.mode;if(prepared.valid!==false){state.mixer=new window.THREE.AnimationMixer(animationModel);configurePreviewAction(state,state.mixer.clipAction(prepared.clip),entry);}}
            state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('animation-only FBX/GLB · skeleton preview','FBX/GLB solo animazione · preview skeleton')+bindingStatus(binding,motion,mode);framePreview(state);return animationModel;
          }
          disposeModel(animationModel);
          state.placeholderMotion=entry;
          if(state.placeholderController)state.previewEntryReady=entry;
          if(entry.state==='action'&&state.placeholderController)state.placeholderController.playAction(entry.clip||entry.name,{loop:entry.loop===true});
          state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('animation source has no render mesh; procedural preview used','la sorgente animazione non contiene una mesh; uso preview procedurale');
          return null;
        });
      }
      if(state.modelIsPlaceholder&&state.placeholderController){
        state.placeholderMotion=entry;state.previewEntryReady=entry;
        if(entry.state==='action')state.placeholderController.playAction(entry.clip||entry.name,{loop:entry.loop===true});
        state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('procedural placeholder preview','preview placeholder procedurale');
        return null;
      }
      const external=!!entry.asset;
      const compatibility=external?skeletonCompatibility(libraryAssetForRef(state.adapter.model(state.graph))||state.adapter.model(state.graph),libraryAssetForRef(entry.asset)||entry.asset):null;
      const source=external?loadPreviewAsset(entry.asset,{animationSource:true}):Promise.resolve(model);
      return source.then(animationModel=>{
        if(previewStale(state,token)){if(external)disposeModel(animationModel);return null;}
        const clips=animationModel.animations||[],wanted=String(entry.clip||''),clip=findAnimationClip(clips,wanted,external);
        if(!clip){
          const fallback=window.LK_RUNTIME_MIXAMO_PLACEHOLDER_CLIPS,slot=proceduralMotionSlot(entry),generated=fallback&&fallback.createClip?fallback.createClip(window.THREE,model,slot,{role:state.definition&&state.definition.role||'character'}):null;
          if(generated){applyMainMotionPreviewScale(model,entry,state);lockPreviewRoot(state,model);state.mixer=new window.THREE.AnimationMixer(model);configurePreviewAction(state,state.mixer.clipAction(generated),entry);state.previewStatus.textContent=(entry.name||entry.clip||slot)+' · '+tr('generated humanoid placeholder on Main Mesh','placeholder umanoide generato sulla Main Mesh');if(external)disposeModel(animationModel);return model;}
          state.previewStatus.textContent=tr('Clip not found: ','Clip non trovata: ')+(wanted||'—');
          if(external)disposeModel(animationModel);return null;
        }
        psDebug('previewMotion PATH A (retarget onto main mesh)',{external,scaleBeforePreviewScale:psScale(model),previewScaleFactor:motionPreviewScale(entry),sourceBox:external?psBox(animationModel):'(main)'});
        applyMainMotionPreviewScale(model,entry,state);lockPreviewRoot(state,model);const THREE=window.THREE,prepared=preparePreviewClip(clip,model,external?animationModel:model,entry);applyPreviewRigLock(state);
        psDebug('PATH A retarget result',{mode:prepared.mode,retargetScale:prepared.retargetScale,scaleAfterPreviewScale:psScale(model),mainModelBoxAfter:psBox(model)});
        if(prepared.valid===false){state.previewStatus.textContent=(entry.name||entry.clip)+' · '+tr('invalid animation keyframes','keyframe animazione non validi');if(external)disposeModel(animationModel);return model;}
        state.mixer=new THREE.AnimationMixer(model);configurePreviewAction(state,state.mixer.clipAction(prepared.clip),entry);
        state.previewStatus.textContent=(entry.name||entry.clip)+' · '+clip.name+bindingStatus(prepared.binding,prepared.motion,prepared.mode,prepared.retargetScale)+(compatibility&&compatibility.status==='incompatible'&&prepared.mode!=='skeleton'?' · '+tr('incompatible skeleton','skeleton incompatibile'):'');
        if(external)disposeModel(animationModel);
        return model;
      });
    });
  }
  function framePreview(state){if(!state.model||!window.THREE)return;state.model.updateMatrixWorld(true);(state.skinnedMeshes||[]).forEach(mesh=>{if(mesh.computeBoundingBox)mesh.computeBoundingBox();if(mesh.computeBoundingSphere)mesh.computeBoundingSphere();});const THREE=window.THREE,box=new THREE.Box3().setFromObject(state.model);if(box.isEmpty())return;const size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),radius=Math.max(.5,size.length()*.55),direction=new THREE.Vector3(1,.55,1).normalize();state.camera.position.copy(center).addScaledVector(direction,radius*2.15);state.camera.near=Math.max(.01,radius/100);state.camera.far=Math.max(100,radius*20);state.camera.updateProjectionMatrix();if(state.controls){state.controls.target.copy(center);state.controls.update();}else state.camera.lookAt(center);}

  function renderProperties(state,container,persist,loadAssets,importFiles,translate){
    const root=state.properties,definition=state.definition;root.innerHTML='';const heading=document.createElement('div');heading.className='lk-ps-property-head';heading.innerHTML='<b></b><span></span>';heading.querySelector('b').textContent=container.label||container.id;heading.querySelector('span').textContent=container.badge||container.kind||'';root.appendChild(heading);
    const note=text=>{const item=document.createElement('div');item.className='lk-ps-note';item.textContent=text;root.appendChild(item);};
    const field=(label,value,type,onChange,options)=>{const row=document.createElement('label');row.className='lk-ps-field';const caption=document.createElement('span');caption.textContent=label;let input;if(type==='select'){input=document.createElement('select');(options||[]).forEach(option=>input.appendChild(new Option(String(option),String(option))));input.value=value==null?'':String(value);}else{input=document.createElement('input');input.type=type||'text';input.value=value==null?'':value;}input.addEventListener('change',()=>onChange(type==='number'?Number(input.value):(type==='checkbox'?input.checked:input.value)));if(type==='checkbox')input.checked=value===true;row.append(caption,input);root.appendChild(row);return input;};
    if(typeof container.render==='function'){container.render({root,state,definition,graph:state.graph,persist,field,note,assetLibraryLoad:loadAssets,importAssetFiles:importFiles,tr:translate,previewMainModel:()=>previewMainModel(state)});return;}
    if(container.kind==='overview'){
      note(translate('One authoritative workspace for this Pawn: asset hierarchy, physical configuration and preview are saved back into the Logic Element.','Un unico workspace autorevole per questo Pawn: gerarchia asset, configurazione fisica e preview vengono salvati nel Logic Element.'));
      const cards=document.createElement('div');cards.className='lk-ps-summary';[['Type',state.adapter.label],['Main mesh',state.adapter.model(state.graph)?'assigned':'missing'],['Containers',String((state.containers||[]).length)],['Schema',String(definition.schemaVersion||1)]].forEach(item=>{const card=document.createElement('div');card.innerHTML='<small></small><b></b>';card.querySelector('small').textContent=item[0];card.querySelector('b').textContent=item[1];cards.appendChild(card);});root.appendChild(cards);return;
    }
    if(container.kind==='model'){
      const assets=loadAssets().filter(asset=>asset&&asset.kind==='glb'),current=state.adapter.model(state.graph),currentId=assetId(current),modelOptions=[''].concat(assets.map(asset=>assetId(asset)));if(currentId&&!modelOptions.includes(currentId))modelOptions.push(currentId);const select=field(translate('Main mesh asset','Asset mesh principale'),currentId,'select',value=>{if(!value){resetPawnModel(state);persist();previewMainModel(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);return;}const asset=assets.find(item=>assetId(item)===value);if(!asset)return;assignPawnModel(state,asset);persist();previewMainModel(state);},modelOptions);
      Array.from(select.options).forEach(option=>{if(!option.value){option.textContent=translate('Built-in T-pose placeholder','Placeholder T-pose integrato');return;}const asset=assets.find(item=>assetId(item)===option.value);option.textContent=asset?(asset.name||asset.source||option.value)+(asset.sourceFormat==='fbx'?' · FBX → GLB':''):(current&&current.name||option.value);});
      if(current&&current.sourceFormat==='fbx')note(translate('Pawn Studio, Play and portable export use the same canonical GLB build. The original FBX remains linked for rebuilding and source diagnostics.','Pawn Studio, Play ed export portabile usano la stessa build GLB canonica. L’FBX originale resta collegato per ricompilazione e diagnostica della sorgente.'));
      if(current&&(state.graph.characterPawn||state.graph.soccerPawn)){
        const modelElement=characterModelElement(state.graph),targetHeight=Math.max(.1,Number(current.fit)||1.9),uniform=modelElement&&Array.isArray(modelElement.scale)?Math.max(.01,Number(modelElement.scale[0])||1):1;
        const heightInput=field(translate('Normalized character height (m)','Altezza normalizzata personaggio (m)'),targetHeight,'number',value=>{const fit=Math.max(.1,Math.min(20,Number(value)||1.9));state.definition.model.fit=fit;if(modelElement){modelElement.asset=clone(state.definition.model);modelElement.asset.fit=fit;}persist();previewMainModel(state);});heightInput.min=.1;heightInput.max=20;heightInput.step=.05;
        const scaleInput=field(translate('Uniform world scale','Scala uniforme nel mondo'),uniform,'number',value=>{const scale=Math.max(.01,Math.min(20,Number(value)||1));if(modelElement)modelElement.scale=[scale,scale,scale];persist();previewMainModel(state);});scaleInput.min=.01;scaleInput.max=20;scaleInput.step=.01;
        note(translate('Height normalizes differently authored files to metres. World scale is the final multiplier used in the editor, Play Preview and export.','L’altezza normalizza in metri file creati con scale differenti. La scala nel mondo è il moltiplicatore finale usato in editor, Play Preview ed export.'));
        if(modelElement){
          const alignment=characterModelAlignment(state.graph);modelElement.position=alignment.position.slice();modelElement.rotation=alignment.rotation.slice();
          const slider=(label,array,index,min,max,step,suffix)=>{const row=document.createElement('label');row.className='lk-ps-field lk-ps-slider-field';const caption=document.createElement('span');caption.textContent=label;const controls=document.createElement('span');controls.className='lk-ps-slider-control';const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=step;input.value=array[index];const output=document.createElement('output');const show=()=>{output.textContent=Number(input.value).toFixed(step<1?1:0)+(suffix||'');};input.addEventListener('input',()=>{array[index]=Number(input.value)||0;show();applyCharacterPreviewAlignment(state);});input.addEventListener('change',()=>persist());show();controls.append(input,output);row.append(caption,controls);root.appendChild(row);return input;};
          note(translate('Global Main Mesh alignment is applied outside the skeleton. Use it to correct a consistently leaning or floating rig without editing every animation.','L’allineamento globale della Mesh principale viene applicato fuori dallo skeleton. Usalo per correggere un rig sempre inclinato o sospeso senza modificare ogni animazione.'));
          slider(translate('Ground offset Y','Offset da terra Y'),modelElement.position,1,-2,2,.01,' m');
          slider(translate('Forward/back tilt (Pitch X)','Inclinazione avanti/indietro (Pitch X)'),modelElement.rotation,0,-45,45,.1,'°');
          slider(translate('Facing direction (Yaw Y)','Direzione frontale (Yaw Y)'),modelElement.rotation,1,-180,180,.5,'°');
          slider(translate('Side tilt (Roll Z)','Inclinazione laterale (Roll Z)'),modelElement.rotation,2,-45,45,.1,'°');
          const alignmentActions=document.createElement('div');alignmentActions.className='lk-ps-actions';const resetAlignment=document.createElement('button');resetAlignment.type='button';resetAlignment.textContent=translate('Reset mesh alignment','Ripristina allineamento mesh');resetAlignment.addEventListener('click',()=>{modelElement.position=[0,0,0];modelElement.rotation=[0,0,0];persist();previewMainModel(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);});alignmentActions.appendChild(resetAlignment);root.appendChild(alignmentActions);
        }
      }
      const actions=document.createElement('div');actions.className='lk-ps-actions';const button=document.createElement('button');button.type='button';button.textContent=translate('Import GLB / FBX…','Importa GLB / FBX…');button.addEventListener('click',()=>{const input=document.createElement('input');input.type='file';input.accept='.glb,.gltf,.fbx,image/*,.tga';input.multiple=true;input.addEventListener('change',()=>{importFiles(Array.from(input.files||[])).then(imported=>{const asset=(imported||[]).find(item=>item&&item.kind==='glb');if(asset){assignPawnModel(state,asset);persist();previewMainModel(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);}});},{once:true});input.click();});const reset=document.createElement('button');reset.type='button';reset.className='danger';reset.disabled=!current;reset.textContent=translate('Reset to T-pose','Ripristina T-pose');reset.addEventListener('click',()=>{resetPawnModel(state);persist();previewMainModel(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);status(translate('Main mesh reset. Motion Set preserved.','Mesh principale ripristinata. Motion Set conservato.'));});actions.append(button,reset);root.appendChild(actions);note(translate('Choose the authoritative render mesh, or return to the built-in T-pose at any time. Resetting the mesh preserves the complete Motion Animation Set.','Scegli la mesh di rendering autorevole oppure torna in qualsiasi momento alla T-pose integrata. Il ripristino della mesh conserva l’intero Motion Animation Set.'));return;
    }
    if(container.kind==='skeleton'){const main=libraryAssetForRef(state.adapter.model(state.graph))||state.adapter.model(state.graph);note(translate('Main Mesh skeleton: ','Skeleton Mesh principale: ')+(main&&Array.isArray(main.boneNames)&&main.boneNames.length?main.boneNames.length+translate(' named bones',' ossa nominate'):translate('metadata unavailable','metadati non disponibili')));note(translate('Each Motion source is compared by normalized bone names. When both files contain real skeletons, Pawn Studio retargets the take through Three.js and reports it explicitly; unknown or incompatible rigs remain visible as diagnostics.','Ogni sorgente Motion viene confrontata tramite i nomi normalizzati delle ossa. Quando entrambi i file contengono skeleton reali, Pawn Studio retargetizza la take tramite Three.js e lo segnala esplicitamente; rig sconosciuti o incompatibili restano visibili come diagnostica.'));return;}
    if(container.kind==='fields'){
      (container.fields||[]).forEach(spec=>{const input=field(spec.label,pathGet(definition,spec.path),spec.type,value=>{pathSet(definition,spec.path,value);persist();},spec.options);if(spec.min!=null)input.min=spec.min;if(spec.max!=null)input.max=spec.max;if(spec.step!=null)input.step=spec.step;});return;
    }
    if(container.kind==='motion-set'){
      note(translate('Each child is a motion sample with its own asset and metadata. Import an FBX batch to create the complete set in one operation; filename and clip names are used only as editable initial suggestions.','Ogni figlio è un campione di movimento con asset e metadati propri. Importa un gruppo di FBX per creare l’intero set in una sola operazione; nomi file e clip vengono usati soltanto come suggerimenti iniziali modificabili.'));
      const importBatch=folder=>{const input=document.createElement('input');input.type='file';input.accept='.fbx,.glb,.gltf,image/*,.tga';input.multiple=true;if(folder){input.webkitdirectory=true;input.setAttribute('webkitdirectory','');}input.addEventListener('change',()=>{const files=Array.from(input.files||[]);if(!files.length)return;state.previewStatus.textContent=translate('Converting animation batch…','Conversione gruppo animazioni…');importFiles(files).then(imported=>{const animations=(imported||[]).filter(asset=>asset&&asset.kind==='glb');let added=0;animations.forEach(asset=>{const clips=Array.isArray(asset.clips)&&asset.clips.length?asset.clips:[''];clips.forEach(clip=>{definition.animationSet.push(inferMotionMetadata(asset,clip,added));added++;});});persist();state.previewStatus.textContent=added+translate(added===1?' motion sample imported':' motion samples imported',added===1?' campione movimento importato':' campioni movimento importati');renderProperties(state,container,persist,loadAssets,importFiles,translate);});},{once:true});input.click();};
      const batch=document.createElement('button');batch.className='lk-ps-action';batch.textContent=translate('⇄ Import FBX / GLB animation batch…','⇄ Importa gruppo animazioni FBX / GLB…');batch.addEventListener('click',()=>importBatch(false));root.appendChild(batch);
      const folder=document.createElement('button');folder.className='lk-ps-action';folder.textContent=translate('📁 Import animation folder…','📁 Importa cartella animazioni…');folder.addEventListener('click',()=>importBatch(true));root.appendChild(folder);
      const add=document.createElement('button');add.className='lk-ps-action';add.textContent=translate('＋ Add empty motion sample','＋ Aggiungi campione vuoto');add.addEventListener('click',()=>{definition.animationSet.push({id:'motion-'+Date.now(),name:'New Motion',state:'grounded',direction:[0,1],speed:1.8,speedTolerance:2.2,asset:null,clip:'',loop:true,priority:1,playbackRate:1,sourceOrientation:'y-up',previewScale:1,motionTransform:{position:[0,0,0],rotation:[0,0,0]},rigCorrections:{},curveCorrection:{offset:[0,0,0],influence:1,falloff:'smooth-midpoint'}});persist();});root.appendChild(add);return;
    }
    if(container.kind==='motion'){
      const entry=definition.animationSet[container.index];if(!entry)return;field(translate('Display name','Nome'),entry.name,'text',value=>{entry.name=value;persist();});field(translate('Physical state','Stato fisico'),entry.state,'select',value=>{entry.state=value;persist();},['grounded','jump','fall','land','action']);
      const directions={Idle:[0,0],Forward:[0,1],Backward:[0,-1],Left:[-1,0],Right:[1,0]},directionName=Object.keys(directions).find(key=>directions[key][0]===(entry.direction||[])[0]&&directions[key][1]===(entry.direction||[])[1])||'Forward';field(translate('Direction','Direzione'),directionName,'select',value=>{entry.direction=directions[value].slice();persist();},Object.keys(directions));
      field(translate('Nominal speed (m/s)','Velocità nominale (m/s)'),entry.speed,'number',value=>{entry.speed=Math.max(0,value||0);persist();});field(translate('Speed tolerance','Tolleranza velocità'),entry.speedTolerance,'number',value=>{entry.speedTolerance=Math.max(.1,value||.1);persist();});field(translate('Priority','Priorità'),entry.priority,'number',value=>{entry.priority=Math.max(.05,value||1);persist();});field(translate('Playback rate','Velocità riproduzione'),entry.playbackRate,'number',value=>{entry.playbackRate=Math.max(.1,value||1);persist();});field(translate('Loop','Loop'),entry.loop,'checkbox',value=>{entry.loop=value;persist();});
      const assets=loadAssets().filter(asset=>asset&&asset.kind==='glb'),currentId=assetId(entry.asset),motionOptions=[''].concat(assets.map(asset=>assetId(asset)));if(currentId&&!motionOptions.includes(currentId))motionOptions.push(currentId);const assetSelect=field(translate('Animation GLB / FBX','GLB / FBX animazione'),currentId,'select',value=>{const asset=assets.find(item=>assetId(item)===value);if(!value)entry.asset=null;else if(asset)entry.asset=storableAssetRef(asset);if(asset&&Array.isArray(asset.clips)&&asset.clips.length&&!asset.clips.includes(entry.clip))entry.clip=asset.clips[0];persist();previewMotion(state,entry);},motionOptions);Array.from(assetSelect.options).forEach(option=>{if(!option.value){option.textContent=translate('Main mesh clips','Clip della mesh principale');return;}const asset=assets.find(item=>assetId(item)===option.value);option.textContent=asset?(asset.name||option.value)+(asset.sourceFormat==='fbx'?' · FBX source':''):(entry.asset&&entry.asset.name||option.value);});
      // The Clip source is whichever GLB actually holds it: the entry's own
      // asset when one is assigned, otherwise the Main Mesh's own embedded
      // clips. Free text remains the fallback for assets imported before
      // clip names were captured, but a known list turns "type the exact
      // Mixamo clip name by hand" into a pick list, which is also what stops
      // a mistyped/blank name from silently rendering nothing.
      const clipSource=entry.asset||state.adapter.model(state.graph),knownClips=Array.isArray(clipSource&&clipSource.clips)?clipSource.clips.filter(Boolean):[];
      if(knownClips.length){
        const clipOptions=knownClips.slice();if(entry.clip&&!clipOptions.includes(entry.clip))clipOptions.unshift(entry.clip);
        field('Clip',entry.clip,'select',value=>{entry.clip=value;persist();previewMotion(state,entry);},clipOptions);
      } else {
        field('Clip',entry.clip,'text',value=>{entry.clip=value;persist();previewMotion(state,entry);});
      }
      const orientationOptions=['y-up','auto','z-up','z-up-inverted','x-up','x-up-inverted','y-up-backward'],orientationSelect=field(translate('Source orientation','Orientamento sorgente'),entry.sourceOrientation||'y-up','select',value=>{entry.sourceOrientation=value;persist();previewMotion(state,entry);},orientationOptions),orientationLabels={auto:translate('Auto bind-pose detection','Rilevamento automatico bind pose'),'y-up':translate('Y-up (Mixamo default)','Y-up (predefinito Mixamo)'),'z-up':translate('Z-up → Y-up (−90° X)','Z-up → Y-up (−90° X)'),'z-up-inverted':translate('Z-up → Y-up (+90° X)','Z-up → Y-up (+90° X)'),'x-up':translate('X-up → Y-up (+90° Z)','X-up → Y-up (+90° Z)'),'x-up-inverted':translate('X-up → Y-up (−90° Z)','X-up → Y-up (−90° Z)'),'y-up-backward':translate('Y-up · turn 180°','Y-up · ruota 180°')};Array.from(orientationSelect.options).forEach(option=>{option.textContent=orientationLabels[option.value]||option.value;});
      const yawOptions=['auto','locked','authored'],yawSelect=field(translate('Root yaw','Yaw della root'),entry.rootYawMode||'auto','select',value=>{entry.rootYawMode=value;persist();previewMotion(state,entry);},yawOptions),yawLabels={auto:translate('Auto · lock forward locomotion','Automatico · blocca locomozione frontale'),locked:translate('Locked · always in-place','Bloccato · sempre in-place'),authored:translate('Authored · preserve animation','Originale · conserva animazione')};Array.from(yawSelect.options).forEach(option=>{option.textContent=yawLabels[option.value]||option.value;});
      const applyPreviewScale=value=>{const next=Math.max(.0001,Math.min(100,localeNumber(value,1)));if(Math.abs(motionPreviewScale(entry)-next)<1e-9)return;entry.previewScale=next;persist();previewMotion(state,entry);},previewScaleInput=field(translate('Animation preview scale (×)','Scala anteprima animazione (×)'),motionPreviewScale(entry),'text',applyPreviewScale);previewScaleInput.inputMode='decimal';previewScaleInput.autocomplete='off';let previewScaleTimer=0;previewScaleInput.addEventListener('input',()=>{clearTimeout(previewScaleTimer);previewScaleTimer=setTimeout(()=>applyPreviewScale(previewScaleInput.value),250);});previewScaleInput.addEventListener('keydown',event=>{if(event.key==='Enter'){clearTimeout(previewScaleTimer);applyPreviewScale(previewScaleInput.value);}});
      entry.motionTransform=normalizedMotionTransform(entry);
      const transformValue=(kind,index,value)=>{const next=normalizedMotionTransform(entry);next[kind][index]=localeNumber(value,0);entry.motionTransform=next;persist();applyPreviewRigLock(state);};
      ['X','Y','Z'].forEach((axis,index)=>field(translate('Slot position '+axis,'Posizione slot '+axis),entry.motionTransform.position[index],'number',value=>transformValue('position',index,value)));
      ['X','Y','Z'].forEach((axis,index)=>field(translate('Slot rotation '+axis+' (deg)','Rotazione slot '+axis+' (gradi)'),entry.motionTransform.rotation[index],'number',value=>transformValue('rotation',index,value)));
      const resetTransform=document.createElement('button');resetTransform.type='button';resetTransform.className='lk-ps-action';resetTransform.textContent=translate('Reset slot transform','Ripristina trasformazione slot');resetTransform.addEventListener('click',()=>{entry.motionTransform={position:[0,0,0],rotation:[0,0,0]};persist();applyPreviewRigLock(state);renderProperties(state,container,persist,loadAssets,importFiles,translate);});root.appendChild(resetTransform);
      entry.rigCorrections=normalizedRigCorrections(entry);
      note(translate('Move or rotate the complete character with the viewport gizmo while this slot is selected. The transform belongs only to this animation state, is blended during transitions, and is used identically in Play.','Muovi o ruota l’intero character con il gizmo del viewport mentre questo slot è selezionato. La trasformazione appartiene solo a questo stato di animazione, viene sfumata nelle transizioni ed è usata allo stesso modo in Play.'));
      note(translate('Edit Rig pauses this slot, shows its skeleton and lets you rotate one bone at a time. Corrections affect the complete clip as a non-destructive pose layer and blend into the next movement state. Reset Bone removes only the selected correction.','Edit Rig mette in pausa lo slot, mostra lo skeleton e permette di ruotare un bone alla volta. Le correzioni agiscono sull’intera clip come layer di posa non distruttivo e si fondono con lo stato di movimento successivo. Reset Bone rimuove solo la correzione selezionata.'));
      note(translate('Y-up is the default for direct Mixamo FBX. Preview scale 1× inherits the exact Main Mesh scale; an override affects only this isolated slot preview, never Play Preview or export.','Y-up è il valore predefinito per gli FBX Mixamo diretti. La scala preview 1× eredita esattamente la Main Mesh; l’override modifica solo questa anteprima isolata, mai Play Preview o export.'));
      if(entry.asset){const main=libraryAssetForRef(state.adapter.model(state.graph))||state.adapter.model(state.graph),motion=libraryAssetForRef(entry.asset)||entry.asset,compatibility=skeletonCompatibility(main,motion);if(compatibility.status==='compatible')note(translate('Skeleton check: compatible','Controllo skeleton: compatibile')+(compatibility.total?' · '+Math.round(compatibility.ratio*100)+'%':''));else if(compatibility.status==='warning')note(translate('Skeleton check: partial match — verify the preview before publishing.','Controllo skeleton: corrispondenza parziale — verifica la preview prima della pubblicazione.'));else if(compatibility.status==='incompatible')note(translate('Skeleton check: incompatible bone hierarchy. Retarget this animation before gameplay use.','Controllo skeleton: gerarchia ossa incompatibile. Esegui il retargeting prima di usarla nel gameplay.'));else note(translate('Skeleton check unavailable: this older asset has no captured bone metadata. Rebuild or reimport it.','Controllo skeleton non disponibile: questo asset precedente non contiene i metadati delle ossa. Ricompilalo o reimportalo.'));}
      const previewActions=document.createElement('div');previewActions.className='lk-ps-actions lk-ps-slot-preview-actions';const testSlot=document.createElement('button');testSlot.className='lk-ps-action primary';testSlot.textContent=translate('▶ Test this animation slot','▶ Prova questo slot animazione');testSlot.addEventListener('click',()=>startMotionPreview(state,entry));const stopSlot=document.createElement('button');stopSlot.textContent=translate('■ Stop slot preview','■ Ferma preview slot');stopSlot.addEventListener('click',()=>stopMotionPreview(state));previewActions.append(testSlot,stopSlot);root.appendChild(previewActions);
      const actions=document.createElement('div');actions.className='lk-ps-actions';const importButton=document.createElement('button');importButton.textContent=translate('Import animation…','Importa animazione…');importButton.addEventListener('click',()=>{const input=document.createElement('input');input.type='file';input.accept='.glb,.gltf,.fbx,image/*,.tga';input.multiple=true;input.addEventListener('change',()=>{importFiles(Array.from(input.files||[])).then(imported=>{const asset=(imported||[]).find(item=>item&&item.kind==='glb');if(asset){entry.asset=storableAssetRef(asset);if(asset.clips&&asset.clips[0])entry.clip=asset.clips[0];persist();startMotionPreview(state,entry);renderProperties(state,container,persist,loadAssets,importFiles,translate);}});},{once:true});input.click();});const duplicate=document.createElement('button');duplicate.textContent=translate('Duplicate','Duplica');duplicate.addEventListener('click',()=>{const copy=clone(entry);copy.id=entry.id+'-copy-'+Date.now();copy.name=entry.name+' Copy';definition.animationSet.splice(container.index+1,0,copy);persist();});const remove=document.createElement('button');remove.className='danger';remove.textContent=translate('Remove','Rimuovi');remove.addEventListener('click',()=>{definition.animationSet.splice(container.index,1);persist();state.selected=state.containers.find(item=>item.id==='motion-set');renderProperties(state,state.selected,persist,loadAssets,importFiles,translate);});actions.append(importButton,duplicate,remove);root.appendChild(actions);return;
    }
    if(container.kind==='object'){
      const object=pathGet(definition,container.path)||{};Object.keys(object).filter(key=>['string','number','boolean'].includes(typeof object[key])).forEach(key=>field(key,object[key],typeof object[key]==='number'?'number':(typeof object[key]==='boolean'?'checkbox':'text'),value=>{object[key]=value;pathSet(definition,container.path,object);persist();}));if(!Object.keys(object).length)note(translate('No editable scalar properties in this container. A category plugin can provide a richer custom renderer.','Nessuna proprietà scalare modificabile in questo container. Un plugin di categoria può fornire un renderer più ricco.'));return;
    }
    note(translate('Select a child container to edit it.','Seleziona un container figlio per modificarlo.'));
  }
  function assignPawnModel(state,asset){
    const previous=state.adapter&&state.adapter.model?state.adapter.model(state.graph):null,ref=storableAssetRef(asset);ref.fit=Math.max(.1,Number(previous&&previous.fit)||1.9);
    if(state.graph.characterPawn||state.graph.soccerPawn){state.definition.model=ref;const scene=state.graph.logicScene||{},elements=scene.elements||[],model=elements.find(item=>item&&item.id==='character_model');if(model){const scale=Array.isArray(model.scale)?model.scale:[1,1,1],wasPlaceholderScale=Math.max.apply(Math,scale.map(value=>Math.abs(Number(value)||0)))<.01;model.asset=clone(ref);model.linked=true;if(wasPlaceholderScale){model.position=[0,0,0];model.rotation=[0,0,0];model.scale=[1,1,1];}}const placeholder=/^(torso_|hips_|leg_sock_|arm_skin_|hand_skin_|head_skin|hair_top)/;elements.forEach(item=>{if(item&&placeholder.test(String(item.id||'')))item.linked=false;});}
    else {state.definition.modelAsset=ref;const model=sceneModel(state.graph,'vehicle_model')||sceneModel(state.graph);if(model)model.asset=clone(ref);}
  }
  function resetPawnModel(state){
    if(!(state&&state.definition&&(state.graph.characterPawn||state.graph.soccerPawn)))return false;
    state.definition.model=null;
    const scene=state.graph.logicScene||(state.graph.logicScene={root:{id:'root',name:'Character Root',type:'empty',linked:true},elements:[],components:[]});
    const elements=scene.elements||(scene.elements=[]),model=elements.find(item=>item&&item.id==='character_model');
    if(model){delete model.asset;model.linked=true;model.position=[0,1.05,0];model.rotation=[0,0,0];model.scale=[.001,.001,.001];}
    const runtime=window.LK_RUNTIME_CHARACTER_PLACEHOLDER_LOCOMOTION,pose=runtime&&runtime.sceneElements?runtime.sceneElements(state.definition.appearance||{}):[];
    pose.forEach(spec=>{let element=elements.find(item=>item&&item.id===spec.id);if(!element){element={};elements.push(element);}Object.assign(element,clone(spec),{linked:true});});
    if(state.object&&state.object.userData)delete state.object.userData.characterModelError;
    return true;
  }
  syncPluginAdapters();
  const resolveRegisteredType=graph=>{syncPluginAdapters();return resolveType(graph);};
  return Object.freeze({open,close,supports:graph=>!!resolveRegisteredType(graph),resolveType:resolveRegisteredType,assignPawnModel,resetPawnModel});
}

window.LK_EDITOR_PAWN_STUDIO=Object.freeze({registerType,unregisterType,resolveType,listTypes:()=>adapters.slice(),inferMotionMetadata,skeletonCompatibility,create});
})();
