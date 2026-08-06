/* =========================================================
   LOT KING - Animal Pawn Studio adapter
   Keeps quadruped authoring isolated from Character and Vehicle Pawns.
   ========================================================= */
(function(){
'use strict';

const studio=window.LK_EDITOR_PAWN_STUDIO;
if(!studio||!studio.registerType)return;

const SPECIES=['cat','dog','horse','generic'];
const SPECIES_LABELS={cat:'Cat',dog:'Dog',horse:'Horse',generic:'Generic / custom quadruped'};
const PLACEHOLDER_PREFIX='animal_';
const PROPORTION_FIELDS=[
  ['Body length','bodyLength',.05,4,.01],['Body radius','bodyRadius',.02,1.5,.01],['Standing height','standHeight',.08,4,.01],
  ['Head size','headSize',.02,1,.01],['Muzzle length','muzzle',.01,1,.01],['Neck length','neckLength',.02,2,.01],['Neck pitch','neckPitch',-80,80,1],
  ['Ear size','earSize',.01,.8,.01],['Ear tilt','earTilt',-90,90,1],['Tail length','tailLength',.01,3,.01],['Tail lift','tailLift',-90,90,1],['Tail curl','tailCurl',-120,120,1],
];
const ACTION_FIELDS=[['Idle','idle'],['Walk','walk'],['Trot','trot'],['Run / gallop','run'],['Crouch / stalk','crouch'],['Jump','jump'],['Fall','fall'],['Land','land'],['Pounce','pounce'],['Voice','voice'],['Dig','dig'],['Fetch','fetch'],['Rear / buck','rear']];

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function assetId(ref){return String(ref&&ref.id||ref&&ref.key||ref&&ref.dbKey||ref&&ref.src||'');}
function storableAssetRef(asset){
  if(!asset)return null;
  return {id:asset.id||null,key:asset.key||null,dbKey:asset.dbKey||null,src:asset.src||asset.url||null,name:asset.name||asset.source||'Animal GLB',source:asset.source||asset.name||'Asset Library',kind:'glb',mime:asset.mime||null,fit:Number(asset.fit)||null,clips:Array.isArray(asset.clips)?asset.clips.slice():[],boneNames:Array.isArray(asset.boneNames)?asset.boneNames.slice():[],skeletonSignature:asset.skeletonSignature||'',sourceFormat:asset.sourceFormat||null,sourceDbKey:asset.sourceDbKey||null,sourceSrc:asset.sourceSrc||null,sourceDependencies:Array.isArray(asset.sourceDependencies)?clone(asset.sourceDependencies):[],compileState:asset.compileState||null,compiledAt:asset.compiledAt||null};
}
function pathGet(root,path){return String(path||'').split('.').filter(Boolean).reduce((value,key)=>value&&value[key],root);}
function pathSet(root,path,value){const keys=String(path||'').split('.').filter(Boolean);let cursor=root;keys.slice(0,-1).forEach(key=>{if(!cursor[key]||typeof cursor[key]!=='object')cursor[key]={};cursor=cursor[key];});if(keys.length)cursor[keys[keys.length-1]]=value;}
function animalDefinition(graph){return graph&&graph.animalPawn||null;}
function sceneElements(graph){const scene=graph.logicScene||(graph.logicScene={root:{id:'root',name:'Animal Root',type:'empty',linked:true},elements:[],components:[]});return scene.elements||(scene.elements=[]);}
function animalModelElement(graph){return sceneElements(graph).find(item=>item&&item.id==='animal_model')||null;}
function animalModel(graph){const definition=animalDefinition(graph),element=animalModelElement(graph);return definition&&definition.model||element&&element.asset||null;}
function syncVariable(graph,path,value){(graph.variables||[]).forEach(variable=>{if(variable&&variable.binding===path)variable.value=clone(value);});}
function setBound(graph,definition,path,value){pathSet(definition,path,value);syncVariable(graph,path,value);}
function placeholderRuntime(){return window.LK_RUNTIME_ANIMAL_PLACEHOLDER_LOCOMOTION;}
function animalRuntime(){return window.LK_RUNTIME_ANIMAL_PAWNS;}
function effectiveProfile(definition){const runtime=placeholderRuntime();return runtime&&runtime.profile?runtime.profile(definition.species,definition.proportions):Object.assign({},definition.proportions||{});}
function regeneratePlaceholder(graph){
  const definition=animalDefinition(graph),runtime=placeholderRuntime();if(!definition||!runtime||!runtime.sceneElements)return false;
  const elements=sceneElements(graph),model=animalModelElement(graph),kept=elements.filter(item=>item&&(!String(item.id||'').startsWith(PLACEHOLDER_PREFIX)||item===model));
  const generated=runtime.sceneElements(definition.species,definition.appearance,definition.proportions);
  graph.logicScene.elements=kept.concat(generated.map(spec=>Object.assign({},clone(spec),{linked:!definition.model})));
  return true;
}
function assignModel(graph,asset){
  const definition=animalDefinition(graph),elements=sceneElements(graph),previous=animalModel(graph),ref=storableAssetRef(asset);if(!definition||!ref)return false;
  const profile=effectiveProfile(definition);ref.fit=Math.max(.1,Number(previous&&previous.fit)||Number(ref.fit)||Math.max(profile.standHeight||.7,profile.bodyLength||.8)*1.25);
  definition.model=ref;
  let model=animalModelElement(graph);if(!model){model={id:'animal_model',name:'Animal Model / Rigged GLB',type:'mesh',primitive:'cube',parentId:'root',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#334155'};elements.unshift(model);}
  model.asset=clone(ref);model.linked=true;
  const scale=Array.isArray(model.scale)?model.scale:[1,1,1],tiny=Math.max.apply(Math,scale.map(value=>Math.abs(Number(value)||0)))<.01;
  if(tiny){model.position=[0,0,0];model.rotation=[0,0,0];model.scale=[1,1,1];}
  elements.forEach(item=>{if(item&&item!==model&&String(item.id||'').startsWith(PLACEHOLDER_PREFIX))item.linked=false;});
  return true;
}
function resetModel(graph){
  const definition=animalDefinition(graph);if(!definition)return false;definition.model=null;
  let model=animalModelElement(graph);if(!model){model={id:'animal_model',name:'Animal Model / Rigged GLB Placeholder',type:'mesh',primitive:'cube',parentId:'root',linked:true,color:'#334155'};sceneElements(graph).unshift(model);}
  delete model.asset;Object.assign(model,{linked:true,position:[0,0,0],rotation:[0,0,0],scale:[.001,.001,.001]});regeneratePlaceholder(graph);return true;
}
function setNumberLimits(input,min,max,step){input.min=min;input.max=max;input.step=step;return input;}
function renderBoundFields(specs){
  return context=>{const {graph,definition,field,persist}=context;specs.forEach(spec=>{const input=field(spec[0],pathGet(definition,spec[1]),spec[2],value=>{setBound(graph,definition,spec[1],value);persist();},spec[6]);if(spec[3]!=null)input.min=spec[3];if(spec[4]!=null)input.max=spec[4];if(spec[5]!=null)input.step=spec[5];});};
}
function renderSpecies(context){
  const {root,graph,definition,field,note,persist,previewMainModel,tr}=context;
  const select=field(tr('Species / body profile','Specie / profilo corpo'),definition.species,'select',value=>{setBound(graph,definition,'species',SPECIES.includes(value)?value:'generic');if(!definition.model)regeneratePlaceholder(graph);persist();previewMainModel();},SPECIES);
  Array.from(select.options).forEach(option=>{option.textContent=SPECIES_LABELS[option.value]||option.value;});
  note(tr('The species profile drives the procedural skeleton. A user GLB stays authoritative and is never replaced when the profile changes.','Il profilo specie controlla lo skeleton procedurale. Un GLB utente resta autorevole e non viene mai sostituito cambiando profilo.'));
  const actions=document.createElement('div');actions.className='lk-ps-actions';
  const apply=document.createElement('button');apply.type='button';apply.textContent=tr('Apply species movement + camera defaults','Applica default movimento + camera della specie');apply.addEventListener('click',()=>{const runtime=animalRuntime(),next=runtime&&runtime.normalizeConfig?runtime.normalizeConfig({species:definition.species}):null;if(!next)return;['movement','trotSpeed','camera'].forEach(path=>{definition[path]=clone(next[path]);(graph.variables||[]).forEach(variable=>{const binding=String(variable&&variable.binding||'');if(binding===path||binding.startsWith(path+'.'))variable.value=clone(pathGet(definition,binding));});});persist();});
  actions.appendChild(apply);root.appendChild(actions);
}
function renderProportions(context){
  const {root,graph,definition,field,note,persist,previewMainModel,tr}=context,profile=effectiveProfile(definition);definition.proportions=definition.proportions||{};
  PROPORTION_FIELDS.forEach(spec=>setNumberLimits(field(spec[0],profile[spec[1]],'number',value=>{definition.proportions[spec[1]]=value;if(!definition.model)regeneratePlaceholder(graph);persist();previewMainModel();}),spec[2],spec[3],spec[4]));
  const actions=document.createElement('div');actions.className='lk-ps-actions';const reset=document.createElement('button');reset.type='button';reset.textContent=tr('Reset body to species profile','Ripristina corpo al profilo specie');reset.addEventListener('click',()=>{definition.proportions={};if(!definition.model)regeneratePlaceholder(graph);persist();previewMainModel();});actions.appendChild(reset);root.appendChild(actions);
  note(tr('Body proportions affect the built-in quadruped only. Collision remains editable independently.','Le proporzioni modificano solo il quadrupede integrato. La collisione resta modificabile separatamente.'));
}
function renderAppearance(context){
  const {graph,definition,field,persist,previewMainModel}=context;
  [['Fur / main color','appearance.furColor'],['Belly / secondary color','appearance.bellyColor'],['Paws, muzzle and tail accent','appearance.accentColor'],['Eye color','appearance.eyeColor']].forEach(spec=>field(spec[0],pathGet(definition,spec[1]),'color',value=>{setBound(graph,definition,spec[1],value);if(!definition.model)regeneratePlaceholder(graph);persist();previewMainModel();}));
}
function renderActions(context){const {graph,definition,field,persist,note,tr}=context;ACTION_FIELDS.forEach(spec=>field(spec[0]+' clip',pathGet(definition,'animations.'+spec[1])||'','text',value=>{setBound(graph,definition,'animations.'+spec[1],value);persist();}));note(tr('Names may target embedded Main Mesh clips, Motion Set entries or procedural gestures. Locomotion clips should be authored in-place.','I nomi possono puntare a clip della Main Mesh, voci del Motion Set o gesti procedurali. Le clip di locomozione devono essere in-place.'));}
function renderModel(context){
  const {root,graph,definition,field,note,assetLibraryLoad,importAssetFiles,persist,previewMainModel,tr}=context,assets=assetLibraryLoad().filter(asset=>asset&&asset.kind==='glb'),current=animalModel(graph),currentId=assetId(current),options=[''].concat(assets.map(assetId));if(currentId&&!options.includes(currentId))options.push(currentId);
  const select=field(tr('Main animal mesh','Mesh principale animale'),currentId,'select',value=>{if(!value){resetModel(graph);persist();previewMainModel();return;}const asset=assets.find(item=>assetId(item)===value);if(asset){assignModel(graph,asset);persist();previewMainModel();}},options);
  Array.from(select.options).forEach(option=>{if(!option.value){option.textContent=tr('Built-in animated quadruped','Quadrupede animato integrato');return;}const asset=assets.find(item=>assetId(item)===option.value);option.textContent=asset?(asset.name||asset.source||option.value)+(asset.sourceFormat==='fbx'?' · FBX → GLB':''):(current&&current.name||option.value);});
  const model=animalModelElement(graph);if(current&&model){
    setNumberLimits(field(tr('Normalized model size (m)','Dimensione modello normalizzata (m)'),Number(current.fit)||1,'number',value=>{definition.model.fit=Math.max(.1,Number(value)||1);model.asset=clone(definition.model);persist();previewMainModel();}),.1,20,.05);
    ['X','Y','Z'].forEach((axis,index)=>setNumberLimits(field(tr('Model rotation '+axis+' (deg)','Rotazione modello '+axis+' (gradi)'),Array.isArray(model.rotation)?model.rotation[index]||0:0,'number',value=>{model.rotation=Array.isArray(model.rotation)?model.rotation:[0,0,0];model.rotation[index]=value;persist();previewMainModel();}),-180,180,.5));
  }
  const actions=document.createElement('div');actions.className='lk-ps-actions';const importButton=document.createElement('button');importButton.type='button';importButton.textContent=tr('Import GLB / FBX…','Importa GLB / FBX…');importButton.addEventListener('click',()=>{const input=document.createElement('input');input.type='file';input.accept='.glb,.gltf,.fbx,image/*,.tga';input.multiple=true;input.addEventListener('change',()=>{importAssetFiles(Array.from(input.files||[])).then(imported=>{const asset=(imported||[]).find(item=>item&&item.kind==='glb');if(asset){assignModel(graph,asset);persist();previewMainModel();}});},{once:true});input.click();});const reset=document.createElement('button');reset.type='button';reset.className='danger';reset.disabled=!current;reset.textContent=tr('Reset to procedural animal','Ripristina animale procedurale');reset.addEventListener('click',()=>{resetModel(graph);persist();previewMainModel();});actions.append(importButton,reset);root.appendChild(actions);
  note(tr('GLB and converted FBX models use this Pawn’s movement, collision, actions and camera. Use a quadruped rig; Motion Set reports bone-name compatibility before export.','I modelli GLB e gli FBX convertiti usano movimento, collisioni, azioni e camera di questo Pawn. Usa un rig quadrupede; il Motion Set segnala la compatibilità dei bone prima dell’export.'));
}
function containers(context){
  const definition=context.definition,motions=Array.isArray(definition.animationSet)?definition.animationSet:(definition.animationSet=[]),children=motions.map((entry,index)=>({id:'motion:'+String(entry.id||index),label:entry.name||entry.clip||('Motion '+(index+1)),icon:'▹',badge:entry.state||'motion',kind:'motion',index}));
  return [
    {id:'overview',label:'Animal Pawn Overview',icon:'◇',kind:'overview'},
    {id:'model',label:'Main Animal Mesh',icon:'◆',badge:animalModel(context.graph)?'GLB':'procedural',kind:'animal-model',render:renderModel},
    {id:'species',label:'Species Profile',icon:'✦',kind:'animal-species',render:renderSpecies},
    {id:'proportions',label:'Body Proportions',icon:'⬡',kind:'animal-proportions',render:renderProportions},
    {id:'movement',label:'Walk / Trot / Run',icon:'↗',kind:'animal-fields',render:renderBoundFields([['Walk speed','movement.walkSpeed','number',.2,12,.1],['Trot speed','trotSpeed','number',.2,18,.1],['Run / gallop speed','movement.runSpeed','number',.5,20,.1],['Sprint multiplier','movement.sprintMultiplier','number',1,2.5,.05],['Acceleration','movement.acceleration','number',1,80,.5],['Turn rate','movement.turnRate','number',.5,40,.5],['Air control','movement.airControl','number',0,1,.05],['Stair pose strength','locomotion.stepPoseStrength','number',0,2,.05]])},
    {id:'collision',label:'Collision & Jump',icon:'▣',kind:'animal-fields',render:renderBoundFields([['Collision radius','movement.radius','number',.08,2,.02],['Collision height','movement.height','number',.2,4,.05],['Step height','movement.stepHeight','number',.02,2,.02],['Jump height','movement.jumpHeight','number',0,5,.05],['Gravity','movement.gravity','number',1,80,.5]])},
    {id:'abilities',label:'Species Abilities',icon:'★',kind:'animal-fields',render:renderBoundFields([['Cat climb max height','abilities.cat.climbMaxHeight','number',.1,8,.1],['Cat climb reach','abilities.cat.climbReach','number',.1,3,.05],['Cat pounce speed','abilities.cat.pounceSpeed','number',.5,20,.1],['Cat stealth multiplier','abilities.cat.stealthMultiplier','number',.1,1,.05],['Cat fall recovery drop','abilities.cat.fallRecoveryDrop','number',.2,10,.1],['Dog alert radius','abilities.dog.alertRadius','number',.1,100,.5],['Dog dig duration','abilities.dog.digDuration','number',.1,10,.1],['Dog chase speed multiplier','abilities.dog.chaseSpeedMultiplier','number',.2,2,.05],['Dog chase stop distance','abilities.dog.chaseStopDistance','number',.1,20,.1],['Horse rideable','abilities.horse.rideable','checkbox'],['Horse seat X','abilities.horse.seatOffset.x','number',-3,3,.05],['Horse seat Y','abilities.horse.seatOffset.y','number',.1,5,.05],['Horse seat Z','abilities.horse.seatOffset.z','number',-3,3,.05],['Horse dismount offset','abilities.horse.dismountOffset','number',.3,5,.05]])},
    {id:'motion-set',label:'Motion Animation Set',icon:'⧉',badge:String(children.length),kind:'motion-set',children},
    {id:'skeleton',label:'Skeleton Compatibility',icon:'☷',kind:'skeleton'},
    {id:'actions',label:'Animation Actions',icon:'▶',kind:'animal-actions',render:renderActions},
    {id:'appearance',label:'Procedural Appearance',icon:'◈',kind:'animal-appearance',render:renderAppearance},
    {id:'camera',label:'Camera',icon:'◉',kind:'animal-fields',render:renderBoundFields([['Mode','camera.mode','select',null,null,null,['free','arcade','cinematic']],['Distance','camera.distance','number',.5,40,.1],['Height','camera.height','number',.1,20,.1],['Lag','camera.lag','number',.1,30,.1],['FOV','camera.fov','number',20,130,1]])},
  ];
}

studio.registerType({
  id:'animal',label:'Animal Pawn',match:graph=>!!(graph&&graph.animalPawn),definition:animalDefinition,model:animalModel,containers,
  createPlaceholder:context=>{const runtime=placeholderRuntime(),definition=context.definition;return runtime&&runtime.createVisual?runtime.createVisual(context.THREE,definition.species,definition.appearance,definition.proportions):null;},
  createPlaceholderController:context=>{const runtime=placeholderRuntime(),definition=context.definition;return runtime&&runtime.createController?runtime.createController({species:definition.species,walkSpeed:definition.movement&&definition.movement.walkSpeed,trotSpeed:definition.trotSpeed,runSpeed:definition.movement&&definition.movement.runSpeed,responsiveness:definition.locomotion&&definition.locomotion.responsiveness,predictionTime:definition.locomotion&&definition.locomotion.predictionTime,stepPoseStrength:definition.locomotion&&definition.locomotion.stepPoseStrength}):null;},
});

window.LK_EDITOR_ANIMAL_PAWN_STUDIO=Object.freeze({SPECIES,assignModel,resetModel,regeneratePlaceholder,containers});
})();
