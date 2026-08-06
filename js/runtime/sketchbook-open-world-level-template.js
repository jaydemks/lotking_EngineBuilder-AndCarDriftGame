/* =========================================================
   LOT KING - DollBody Open World editable level template
   DollBody is this engine's traversal kit; the upstream credit below is kept
   for attribution only and the name is not used as a product label.
   Source: https://github.com/swift502/Sketchbook (MIT)
   Snapshot: 62f4b7986fd1ce1e4f91daba89ef032c20a6ce55

   The source `world.glb` is byte-identical and keeps owning the centre of the
   map. Around it this template composes the eight procedural districts from
   js/runtime/open-world-districts.js, so the playable square grows from the
   GLB's 2847 m to 8448 m - 8.8x the area - without one byte of the source
   world changing and without the existing spawn/physics/path integration
   moving at all.

   HOW THIS FILE IS ORGANISED
     00  identity and provenance
     01  spawns              the source Spawn.* nodes, unchanged
     02  pawn templates      the four DollBody Logic Elements
     03  world composition   world.glb, then the district ring, then the pawns
     04  environment         sky, fog and weather sized for the larger world
     05  manifest            provenance and the Open World descriptor
     06  runtime install     chunk streaming, navigation
     07  registration
   ========================================================= */
(function(){
'use strict';

const root = typeof window !== 'undefined' ? window : globalThis;

// ================================================== 00 identity and provenance

const SOURCE_REPOSITORY='https://github.com/swift502/Sketchbook';
const SOURCE_COMMIT='62f4b7986fd1ce1e4f91daba89ef032c20a6ce55';
const ATTRIBUTION='Sketchbook by Jan Bláha (swift502)';
const WORLD_FIT=2847.2265625;
const TEMPLATE_IDS=Object.freeze({
  character:'logic-template-sketchbook-advanced-character',
  car:'logic-template-sketchbook-car',
  airplane:'logic-template-sketchbook-airplane',
  helicopter:'logic-template-sketchbook-helicopter',
});

// The district ring is resolved at build time, not at load time: a cached host
// page may still list this template before the district module, and a level
// that refuses to build is worse than a level that builds as 0.7.7 did.
function districtPack(){ return root.LK_RUNTIME_OPEN_WORLD_DISTRICTS || null; }

// ==================================================================== 01 spawns

const SPAWNS=Object.freeze({
  // These are the source Spawn.* node positions after the editor GLB loader's
  // bottom-alignment offset (world.glb minY = 0.1075983047). Upstream adds a
  // one-metre physics-root lift to vehicles; the editor instead bottom-aligns
  // each vehicle GLB and keeps that lift out of its authored transform.
  character:Object.freeze({id:'sketchbook_pawn_character',position:[-.101,14.696,-5.171],heading:0,sourceNode:'Spawn.024',sourcePosition:[-.101,14.804,-5.171]}),
  car:Object.freeze({id:'sketchbook_pawn_car',position:[-4.178,14.696,-5.610],heading:.41686,sourceNode:'Spawn.025',sourcePosition:[-4.178,14.804,-5.610]}),
  car2:Object.freeze({id:'sketchbook_pawn_car_2',position:[5.122,14.696,5.476],heading:-2.44811,sourceNode:'Spawn.026',sourcePosition:[5.122,14.804,5.476]}),
  helicopter:Object.freeze({id:'sketchbook_pawn_helicopter',position:[101.363,16.330,-83.082],heading:1.50763,sourceNode:'Spawn.010',sourcePosition:[101.363,16.438,-83.082]}),
  helicopter2:Object.freeze({id:'sketchbook_pawn_helicopter_2',position:[-184.767,80.327,-.043],heading:Math.PI/2,sourceNode:'Spawn.029',sourcePosition:[-184.767,80.435,-.043]}),
  airplane:Object.freeze({id:'sketchbook_pawn_airplane',position:[152.545,15.067,-92.107],heading:-.06316,sourceNode:'Spawn.011',sourcePosition:[152.545,15.175,-92.107]}),
  airplane2:Object.freeze({id:'sketchbook_pawn_airplane_2',position:[-134.261,40.170,-39.518],heading:2.36309,sourceNode:'Spawn.028',sourcePosition:[-134.261,40.278,-39.518]}),
});

// ========================================================== 02 pawn templates

function clone(value){ return value==null?value:JSON.parse(JSON.stringify(value)); }
function setVariable(graph,name,value){
  const variable=graph&&Array.isArray(graph.variables)?graph.variables.find(function(item){ return item&&item.name===name; }):null;
  if(variable) variable.value=value;
}
function getTemplate(templateId){
  const registry=root.LK_LOGIC_TEMPLATES;
  const registered=registry&&registry.get&&registry.get(templateId);
  if(registered&&registered.graph) return registered;
  const pack=root.LK_LOGIC_TEMPLATES_SKETCHBOOK;
  const templates=pack&&pack.makeTemplates?pack.makeTemplates():[];
  return templates.find(function(item){ return item&&item.id===templateId; })||null;
}

// The base Pawn templates now ship the metre-scale fit themselves, so a vehicle
// dropped into any level is the right size, not only one placed by this
// template. This pass therefore only has to make sure the Pawn descriptor and
// its Logic Scene model agree, and to re-derive the scale from the recorded
// source dimension rather than multiplying whatever is already there - running
// it twice must not produce a vehicle twice as big.
function vehiclePresentationScale(){
  const pack=root.LK_LOGIC_TEMPLATES_SKETCHBOOK;
  const scale=pack&&Number(pack.VEHICLE_SCALE);
  return Number.isFinite(scale)&&scale>0?scale:1;
}
function scaleVehicleModel(graph,kind){
  if(kind==='character')return graph;
  const asset=graph&&graph.sketchbookPawn&&graph.sketchbookPawn.modelAsset;
  const fit=asset&&Number(asset.fit);
  if(!Number.isFinite(fit)||fit<=0)return graph;
  const source=Number(asset.sourceFit);
  const sourceFit=Number.isFinite(source)&&source>0?source:fit;
  const scaled=Number((sourceFit*vehiclePresentationScale()).toFixed(6));
  asset.fit=scaled;
  asset.sourceFit=sourceFit;
  const element=graph.logicScene&&Array.isArray(graph.logicScene.elements)
    ?graph.logicScene.elements.find(function(item){ return item&&item.asset; }):null;
  if(element&&element.asset){element.asset.fit=scaled;element.asset.sourceFit=sourceFit;}
  const fitVariable=Array.isArray(graph.variables)
    ?graph.variables.find(function(item){ return item&&(item.name==='ModelFit'||item.binding==='modelAsset.fit'); }):null;
  if(fitVariable)fitVariable.value=scaled;
  return graph;
}

function configureGraph(graph,kind,spawn){
  const p=spawn.position;
  setVariable(graph,'SpawnX',p[0]);
  setVariable(graph,'SpawnY',p[1]);
  setVariable(graph,'SpawnZ',p[2]);
  setVariable(graph,'SpawnHeading',spawn.heading);
  setVariable(graph,'ControllerPlayerId',kind==='character'?1:-1);
  setVariable(graph,'StartPossessed',kind==='character');
  if(graph.sketchbookPawn){
    graph.sketchbookPawn.spawn={x:p[0],y:p[1],z:p[2],heading:spawn.heading};
    graph.sketchbookPawn.playerId=kind==='character'?1:-1;
    graph.sketchbookPawn.possessed=kind==='character';
    graph.sketchbookPawn.sourceSpawn={node:spawn.sourceNode,worldPosition:spawn.sourcePosition.slice(),editorPosition:p.slice()};
  }
  return scaleVehicleModel(graph,kind);
}

// ======================================================= 03 world composition

function buildScene(baseScene,options){
  const opts=options||{};
  const scene = baseScene||{version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}};
  scene.added=(scene.added||[]).filter(function(entry){
    return !(entry&&entry.name==='Ground'&&entry.asset&&entry.asset.source==='Editor primitive');
  });

  // ---- 03a the source world, untouched --------------------------------------
  scene.added.push({
    id:'sketchbook_world_model',
    kind:'glb',
    src:'models/sketchbook/world.glb',
    fit:WORLD_FIT,
    name:'DollBody Open World',
    collide:false,
    physics:false,
    metadataMode:'gltf-extras',
    physicsBackend:'sketchbook-metadata',
    asset:{key:'builtin:sketchbook/world',name:'DollBody Open World',source:SOURCE_REPOSITORY},
    t:{p:[0,0,0],r:[0,0,0],s:[1,1,1],v:true},
    templateGroup:'DollBody Open World',
    // Keep provenance machine-readable without exposing the upstream-only path
    // as a playable asset URL to the recursive ZIP collector.
    sourceMetadata:{repository:SOURCE_REPOSITORY,commit:SOURCE_COMMIT,license:'MIT',attribution:ATTRIBUTION,sourcePathStem:'build/assets/world',sourceFormat:'glb'},
    preservedGltfExtras:{
      untouched:true,
      physics:{total:427,box:303,trimesh:124},
      paths:{path:3,pathNode:74},
      scenarios:8,
      spawns:{total:29,car:21,helicopter:3,airplane:3,player:2},
      note:'Scenario, path, spawn and physics descriptors remain embedded in the unmodified source GLB.',
    },
  });

  // ---- 03b the district ring around it --------------------------------------
  // Authored BEFORE the pawns so the outliner reads world, then map, then the
  // things that drive on it. Nothing generated here enters the GLB keepout.
  const pack=districtPack();
  const districtManifest=pack&&opts.districts!==false
    ? pack.buildEntries(scene, opts.districtConfig||null)
    : null;

  // ---- 03c the pawns --------------------------------------------------------
  function addPawn(spawnKey,kind,name,group){
    const spawn=SPAWNS[spawnKey];
    const template=getTemplate(TEMPLATE_IDS[kind]);
    if(!spawn||!template||!template.graph) return;
    const graph=configureGraph(clone(template.graph),kind,spawn);
    scene.added.push({
      id:spawn.id,
      kind:'logicElement',
      name,
      collide:false,
      graph,
      enabled:true,
      runInEditorPreview:true,
      asset:{key:'logic:template:'+TEMPLATE_IDS[kind],name,source:SOURCE_REPOSITORY},
      t:{p:spawn.position.slice(),r:[0,spawn.heading,0],s:[1,1,1],v:true},
      templateGroup:group,
      sourceSpawn:{node:spawn.sourceNode,worldPosition:spawn.sourcePosition.slice()},
    });
  }

  // Source default scenario: Spawn.024 plus all six children of the invisible
  // `air_vehicles` scenario marked `spawn_always=true`.
  addPawn('character','character','DollBody Advanced Character','DollBody Pawns');
  addPawn('car','car','DollBody Arcade Car A','DollBody Pawns');
  addPawn('car2','car','DollBody Arcade Car B','DollBody Pawns');
  addPawn('airplane','airplane','DollBody Arcade Airplane A','DollBody Pawns');
  addPawn('airplane2','airplane','DollBody Arcade Airplane B','DollBody Pawns');
  addPawn('helicopter','helicopter','DollBody Arcade Helicopter A','DollBody Pawns');
  addPawn('helicopter2','helicopter','DollBody Arcade Helicopter B','DollBody Pawns');

  // ============================================================ 04 environment
  //
  // This template owns its player through the Advanced Character Logic Element.
  // The editor's existing native/race/drift player_car definitions are unchanged.
  scene.player=Object.assign({},scene.player||{},{enabled:false,hidden:true,controllerIndex:null});
  // Fog sized for the new extents. At the 0.7.7 far plane of 2600 m the next
  // district was solid grey from the ring road, and the one thing a large world
  // may not do is hide the reason to drive across it. The far plane now reaches
  // a district and a half, which is the distance the landmark silhouettes are
  // scaled to be read at.
  const fogFar=pack&&districtManifest?Math.round(pack.DISTRICT_PITCH*2.6):2600;
  scene.env=Object.assign({},scene.env||{},{
    skyTime:.33,dayLength:999999,procEnvEnabled:true,procEnvIntensity:1,backgroundColor:'#9db7c3',
    fog:{enabled:true,color:'#a8bbc2',near:900,far:fogFar},
    // The districts react to the shared weather director: every ground class
    // names a weather surface family, so rain costs grip on the quarry haul
    // road and on the dock apron by different amounts.
    weather:Object.assign({enabled:true,preset:'fair',intensity:.6,surface:'asphalt',transitionTime:12},(scene.env&&scene.env.weather)||{}),
  });

  // =============================================================== 05 manifest
  scene.template={
    id:'sketchbook-open-world',
    name:'DollBody Open World',
    version:2,
    nativeEditable:true,
    sourceRepository:SOURCE_REPOSITORY,
    sourceCommit:SOURCE_COMMIT,
    sourceLicense:'MIT',
    attribution:ATTRIBUTION,
    preservedMetadata:{container:'models/sketchbook/world.glb',format:'glTF extras',scenarios:true,paths:true,spawnPoints:true,physicsMarkers:true},
  };
  scene.sketchbook={
    schemaVersion:2,
    source:{repository:SOURCE_REPOSITORY,commit:SOURCE_COMMIT,license:'MIT',attribution:ATTRIBUTION},
    worldAsset:'models/sketchbook/world.glb',
    originalWorldBounds:{min:[-1423.61328125,.1075983047,-1423.61328125],max:[1423.61328125,555.4032284,1423.61328125]},
    metadata:{physicsBodies:427,pathNodes:74,paths:3,scenarios:8,spawns:29,preservedInGltfExtras:true},
    materializedScenario:{name:'Free roam (default)',playerSpawn:'Spawn.024',alwaysSpawnNodes:['Spawn.010','Spawn.011','Spawn.025','Spawn.026','Spawn.028','Spawn.029'],upstreamVehiclePhysicsRootLift:1,editorVehiclePlacement:'bottom-aligned'},
    nativePlayerDisabled:true,
    editableFromEmpty:true,
    // scene-store's collect/save copies `sketchbook` wholesale, so the district
    // manifest survives a project round trip here and nowhere else on the scene.
    openWorld:districtManifest,
  };
  return scene;
}

// =========================================================== 06 runtime install
//
// The level template owns the systems its level needs, exactly like the other
// game-mode templates. Both are optional: a host page not yet wired for them
// still gets the level, just without streaming or the compass.

function install(GAME){
  if(!GAME) return null;
  const installed={streaming:null,navigation:null};
  const streaming=root.LK_RUNTIME_OPEN_WORLD_STREAMING;
  if(streaming&&streaming.install) installed.streaming=streaming.install(GAME);
  const navigation=root.LK_RUNTIME_OPEN_WORLD_NAVIGATION;
  if(navigation&&navigation.install) installed.navigation=navigation.install(GAME);
  return installed;
}

// ============================================================= 07 registration

root.LK_RUNTIME_SKETCHBOOK_OPEN_WORLD_LEVEL_TEMPLATE=Object.freeze({
  id:'sketchbook-open-world',
  name:'DollBody Open World',
  buildScene,
  install,
  source:Object.freeze({repository:SOURCE_REPOSITORY,commit:SOURCE_COMMIT,license:'MIT',attribution:ATTRIBUTION}),
  spawns:SPAWNS,
});

if(root.LK_LEVEL_TEMPLATES&&root.LK_LEVEL_TEMPLATES.register){
  root.LK_LEVEL_TEMPLATES.register({
    id:'open-world-sketchbook',name:'DollBody Open World',nameIt:'DollBody Open World',
    category:'Open world',order:100,ground:'none',keepBuiltinPlayer:false,
    description:'The full open world, eight procedural districts around it and seven editable DollBody Pawns at their original spawn nodes.',
    descriptionIt:'Il mondo completo, otto distretti procedurali attorno e sette Pawn DollBody modificabili sui nodi di spawn originali.',
    build:function(scene){ return buildScene(scene); },
  });
}
if(typeof module!=='undefined'&&module.exports) module.exports=root.LK_RUNTIME_SKETCHBOOK_OPEN_WORLD_LEVEL_TEMPLATE;
})();
