/* =========================================================
   LOT KING - Extended vehicle Logic Element authoring pack

   Procedural meshes are editable placeholders, not hidden runtime models.
   A replacement GLB keeps the same semantic role ids emitted by the Blender
   vehicle add-on, so Normal and DollBody-compatible rigs share one contract.
   ========================================================= */
(function(root){
'use strict';

const RIG_PROFILES=Object.freeze(['normal','sketchbook']);
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function mesh(id,name,primitive,parentId,position,rotation,scale,color,role){return {id,name,type:'mesh',primitive,parentId:parentId||'root',linked:true,position:position||[0,0,0],rotation:rotation||[0,0,0],scale:scale||[1,1,1],color:color||'#64748b',vehicleRigRole:role||null};}
function dummy(id,name,parentId,position,color,role){return {id,name,type:'empty',parentId:parentId||'root',linked:true,dummyVisible:true,position:position||[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:color||'#38bdf8',vehicleRigRole:role||id};}
function wheel(id,name,x,y,z,radius,width){return mesh(id,name,'cylinder','root',[x,y,z],[0,0,90],[radius*2,width,radius*2],'#111827','wheel');}
function variables(spec,rigProfile){return [
  {name:'PawnEnabled',type:'boolean',value:true,exposed:true,binding:'enabled',label:'Pawn Enabled',category:'Pawn'},
  {name:'Hidden',type:'boolean',value:false,exposed:true,binding:'hidden',label:'Hidden',category:'Pawn'},
  {name:'ControllerPlayerId',type:'number',value:-1,exposed:true,binding:'playerId',label:'Controller Player ID (-1 = none)',category:'Player',ui:'player-id',min:-1,max:4,step:1},
  {name:'ModelAsset',type:'asset',value:null,exposed:true,binding:'modelAsset',label:'Replacement Rigged GLB',category:'Model',ui:'vehicle-model-asset'},
  {name:'RigProfile',type:'string',value:rigProfile,exposed:true,binding:'rigProfile',label:'GLB Rig Profile',category:'Model / Rig',ui:'select',options:[{value:'normal',label:'Normal vehicle rig'},{value:'sketchbook',label:'DollBody / Sketchbook metadata rig'}]},
  {name:'VehicleArchetype',type:'string',value:spec.id,exposed:true,binding:'archetype',label:'Vehicle Archetype',category:'Vehicle',readOnly:true},
  {name:'MaximumSpeed',type:'number',value:spec.speed,exposed:true,binding:'tuning.maxSpeed',label:'Maximum Speed (m/s)',category:'Vehicle / Drive',min:.1,max:120,step:.5},
  {name:'Acceleration',type:'number',value:spec.acceleration,exposed:true,binding:'tuning.acceleration',label:'Acceleration',category:'Vehicle / Drive',min:.1,max:100,step:.5},
  {name:'Steering',type:'number',value:spec.steer,exposed:true,binding:'tuning.steer',label:'Steering',category:'Vehicle / Drive',min:.05,max:8,step:.05},
  {name:'VehicleMass',type:'number',value:spec.mass,exposed:true,binding:'collision.mass',label:'Mass (kg)',category:'Vehicle / Collision',min:1,max:200000,step:10},
  {name:'CameraDistance',type:'number',value:spec.camera[0],exposed:true,binding:'camera.distance',label:'Camera Distance',category:'Camera',min:.2,max:100,step:.1},
  {name:'CameraHeight',type:'number',value:spec.camera[1],exposed:true,binding:'camera.height',label:'Camera Height',category:'Camera',min:0,max:50,step:.1},
  {name:'TowHitchEnabled',type:'boolean',value:spec.hitch!==false,exposed:true,binding:'towing.enabled',label:'Tow Hitch Enabled',category:'Vehicle / Towing'},
  {name:'TowHitchPosition',type:'vector3',value:[0,.35,-spec.size[2]],exposed:true,binding:'towing.hitch.position',label:'Tow Hitch Dummy',category:'Vehicle / Towing'},
  {name:'TowAttachRadius',type:'number',value:1.25,exposed:true,binding:'towing.attachRadius',label:'Tow Attach Radius',category:'Vehicle / Towing',min:.1,max:10,step:.05},
  {name:'Towable',type:'boolean',value:spec.towable!==false,exposed:true,binding:'towable.enabled',label:'Can Be Towed',category:'Vehicle / Towing'},
];}
function placeholder(spec){
  const p=[],x=spec.size[0],y=spec.size[1],z=spec.size[2],kind=spec.className;
  if(kind==='watercraft'){
    p.push(mesh('vehicle_model','Hull / GLB Placeholder','cube','root',[0,y*.55,0],[0,0,0],[x*1.8,y,z*2],'#0f5f8f','hull'));
    p.push(mesh('bow','Bow','cone','root',[0,y*.62,z*1.65],[90,0,0],[x*1.65,y*1.05,z*.7],'#167fb1','hull-bow'));
    p.push(mesh('deck','Deck','cube','root',[0,y*1.08,-z*.05],[0,0,0],[x*1.62,y*.16,z*1.72],'#d8c49a','deck'));
    if(spec.id!=='small-boat')p.push(mesh('bridge','Bridge / Cabin','cube','root',[0,y*1.65,-z*.28],[0,0,0],[x*(spec.id==='ship'?1.2:.9),y*(spec.id==='ship'?1.3:.85),z*.46],'#e5e7eb','cabin'));
    if(spec.id==='ship'){
      p.push(mesh('upper_deck','Upper Deck','cube','root',[0,y*2.55,-z*.32],[0,0,0],[x*.9,y*.48,z*.36],'#cbd5e1','superstructure'));
      p.push(mesh('funnel_1','Funnel 1','cylinder','root',[x*.28,y*3.15,-z*.16],[0,0,0],[.8,2.2,.8],'#b91c1c','funnel'),mesh('funnel_2','Funnel 2','cylinder','root',[-x*.28,y*3.15,-z*.16],[0,0,0],[.8,2.2,.8],'#b91c1c','funnel'));
      p.push(dummy('bow_anchor','Bow Anchor','root',[0,y*.75,z*1.92],'#fbbf24','anchor'),dummy('stern_anchor','Stern Anchor','root',[0,y*.75,-z*1.92],'#fbbf24','anchor'));
    }
    p.push(dummy('propeller','Propeller Joint','root',[0,y*.4,-z*2.02],'#a78bfa','propeller'),dummy('rudder','Rudder Joint','root',[0,y*.45,-z*1.9],'#34d399','rudder'));
  } else if(kind==='truck'){
    p.push(mesh('vehicle_model','Truck Chassis / GLB Placeholder','cube','root',[0,.72,-z*.18],[0,0,0],[x*1.8,.35,z*1.8],'#334155','chassis'));
    p.push(mesh('cab','Truck Cab','cube','root',[0,1.45,z*.75],[0,0,0],[x*1.75,2.35,z*.58],'#2563eb','cab'));
    p.push(mesh('grille','Front Grille','cube','root',[0,1.05,z*1.06],[0,0,0],[x*1.55,.62,.12],'#0f172a','grille'));
    p.push(wheel('wheel_front_left','Wheel Front Left',x,.55,z*.72,.52,.36),wheel('wheel_front_right','Wheel Front Right',-x,.55,z*.72,.52,.36));
    p.push(wheel('wheel_rear_left','Wheel Rear Left',x,.55,-z*.62,.55,.42),wheel('wheel_rear_right','Wheel Rear Right',-x,.55,-z*.62,.55,.42));
    p.push(wheel('wheel_rear2_left','Wheel Rear 2 Left',x,.55,-z*.9,.55,.42),wheel('wheel_rear2_right','Wheel Rear 2 Right',-x,.55,-z*.9,.55,.42));
    p.push(dummy('fifth_wheel','Fifth Wheel Coupler','root',[0,.93,-z*.58],'#f59e0b','trailer-coupler'));
  } else if(kind==='trailer'){
    p.push(mesh('vehicle_model','Trailer Box / GLB Placeholder','cube','root',[0,1.75,0],[0,0,0],[x*1.85,2.9,z*1.92],'#e2e8f0','trailer-body'));
    p.push(mesh('trailer_chassis','Trailer Chassis','cube','root',[0,.65,0],[0,0,0],[x*1.9,.3,z*1.95],'#334155','chassis'));
    p.push(wheel('wheel_rear_left','Trailer Wheel Left',x,.52,-z*.55,.5,.38),wheel('wheel_rear_right','Trailer Wheel Right',-x,.52,-z*.55,.5,.38));
    p.push(wheel('wheel_rear2_left','Trailer Wheel 2 Left',x,.52,-z*.8,.5,.38),wheel('wheel_rear2_right','Trailer Wheel 2 Right',-x,.52,-z*.8,.5,.38));
    p.push(dummy('tow_coupler','Tow Coupler','root',[0,.5,z],'#f59e0b','tow-coupler'));
  } else {
    const powered=kind==='motorcycle'||kind==='scooter';
    p.push(wheel('wheel_front','Front Wheel',0,.58,z,.55,.18),wheel('wheel_rear','Rear Wheel',0,.58,-z,.55,.18));
    p.push(mesh('frame','Main Frame','cylinder','root',[0,1.05,0],[70,0,0],[.12,z*1.9,.12],powered?'#dc2626':'#2563eb','frame'));
    p.push(mesh('fork','Front Fork','cylinder','root',[0,1.12,z*.78],[-18,0,0],[.08,1.25,.08],'#94a3b8','front-fork'));
    p.push(mesh('handlebar','Handlebar','cylinder','root',[0,1.62,z*.68],[0,0,90],[.07,.82,.07],'#111827','handlebar'));
    p.push(mesh('seat','Seat','cube','root',[0,1.38,-z*.22],[0,0,0],[.48,.17,powered?.78:.48],'#111827','seat'));
    if(powered)p.push(mesh('engine','Engine','cube','root',[0,.9,-z*.05],[0,0,0],[.5,.58,.7],'#475569','engine'),mesh('fuel_tank','Fuel Tank','sphere','root',[0,1.35,z*.24],[0,0,0],[.58,.48,.75],kind==='scooter'?'#0ea5e9':'#ef4444','fuel-tank'));
    else p.push(mesh('crank','Crank','cylinder','root',[0,.88,0],[0,0,90],[.18,.12,.18],'#64748b','crank'));
    if(spec.id==='dirt-bike'||spec.id==='mountain-bike')p.push(mesh('front_suspension','Front Suspension','cylinder','root',[0,1.02,z*.82],[-18,0,0],[.13,1.05,.13],'#f59e0b','suspension'));
    if(spec.id==='scooter')p.push(mesh('leg_shield','Leg Shield','cube','root',[0,1.15,z*.42],[0,0,0],[.62,.95,.18],'#0ea5e9','body-panel'));
  }
  p.push(dummy('driver_seat','Driver Seat','root',[spec.seat[0],spec.seat[1],spec.seat[2]],'#38bdf8','seat-driver'));
  p.push(dummy('camera_anchor','Player Camera Anchor','root',[0,spec.camera[1],-spec.camera[0]*.55],'#a78bfa','camera'));
  p.push(dummy('vehicle_fuel_tank','Fuel Tank Damage Dummy','root',[0,spec.damage[0],spec.damage[1]],'#ffb52e','damage-fuel-tank'));
  p.push(dummy('vehicle_engine_smoke','Engine Smoke Dummy','root',[0,spec.damage[0]+.25,spec.damage[1]+.2],'#64748b','damage-engine'));
  p.push(dummy('vehicle_exhaust','Exhaust / Prop Wash Dummy','root',[0,spec.damage[0],-spec.size[2]],'#94a3b8','exhaust'));
  if(spec.hitch!==false)p.push(dummy('tow_hitch','Tow Hitch','root',[0,.35,-spec.size[2]],'#f59e0b','tow-hitch'));
  return {root:{id:'root',name:spec.name+' Root',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:spec.color},elements:p,components:[{id:'root_transform',elementId:'root',name:'Transform',type:'transform',linked:true},{id:'pawn_vehicle',elementId:'root',name:'Vehicle Pawn',type:'player-pawn',linked:true},{id:'pawn_collision',elementId:'root',name:'Vehicle Collision',type:'collider',linked:true,collider:{enabled:true,shape:'box',size:[spec.size[0]*2,spec.size[1]*2,spec.size[2]*2]}}]};
}
function physicsWheels(spec){
  if(!/truck|trailer|motorcycle|scooter|bicycle/.test(spec.className))return [];
  if(spec.className==='truck')return [{x:-spec.size[0],z:spec.size[2]*.72,front:true,driven:false,visualId:'wheel_front_left'},{x:spec.size[0],z:spec.size[2]*.72,front:true,driven:false,visualId:'wheel_front_right'},{x:-spec.size[0],z:-spec.size[2]*.62,front:false,driven:true,visualId:'wheel_rear_left'},{x:spec.size[0],z:-spec.size[2]*.62,front:false,driven:true,visualId:'wheel_rear_right'},{x:-spec.size[0],z:-spec.size[2]*.9,front:false,driven:true,visualId:'wheel_rear2_left'},{x:spec.size[0],z:-spec.size[2]*.9,front:false,driven:true,visualId:'wheel_rear2_right'}];
  if(spec.className==='trailer')return [{x:-spec.size[0],z:-spec.size[2]*.55,front:false,driven:false,visualId:'wheel_rear_left'},{x:spec.size[0],z:-spec.size[2]*.55,front:false,driven:false,visualId:'wheel_rear_right'},{x:-spec.size[0],z:-spec.size[2]*.8,front:false,driven:false,visualId:'wheel_rear2_left'},{x:spec.size[0],z:-spec.size[2]*.8,front:false,driven:false,visualId:'wheel_rear2_right'}];
  // A narrow virtual contact pair stabilizes a two-wheeler while only the two
  // authored centreline wheels are visible and exported by the rig add-on.
  return [{x:-.08,z:spec.size[2],front:true,driven:false,visualId:'wheel_front'},{x:.08,z:spec.size[2],front:true,driven:false},{x:-.08,z:-spec.size[2],front:false,driven:true,visualId:'wheel_rear'},{x:.08,z:-spec.size[2],front:false,driven:true}];
}
function graph(spec,rigProfile){
  const scene=placeholder(spec),water=spec.className==='watercraft',trailer=spec.className==='trailer';
  const result={version:1,name:(rigProfile==='sketchbook'?'DollBody-compatible ':'')+spec.name,scope:'element',enabled:true,variables:variables(spec,rigProfile),nodes:[{id:'on_start',type:'event.onStart',x:80,y:100,data:{}},{id:'ready',type:'debug.print',x:390,y:100,data:{message:spec.name+' Logic Vehicle ready.',duration:3}}],edges:[{id:'ready_edge',from:{node:'on_start',pin:'then'},to:{node:'ready',pin:'exec'}}],comments:[{id:'vehicle_pack_info',title:'Editable '+spec.name+' Logic Element. Replace the placeholder with a Normal or DollBody-compatible GLB without losing semantic joints, damage anchors, seat, camera or towing points.',x:35,y:35,w:860,h:245,color:spec.color}],subgraphs:[],logicScene:scene,vehiclePawn:{template:true,schemaVersion:2,id:'vehicle-'+rigProfile+'-'+spec.id,playerId:null,possessed:false,enabled:true,hidden:false,vehicleClass:spec.className,archetype:spec.id,rigProfile,physicsBackend:water?'arcade-fallback':'auto',proceduralFallback:'vehicle-pack-placeholder-v1',collision:{mass:spec.mass,hx:spec.size[0],hy:spec.size[1],hz:spec.size[2],bodyY:spec.size[1]},suspension:{stiffness:spec.className==='bicycle'?18:32,restLength:.3,travel:.25,radius:(spec.className==='truck'||trailer) ? .5 : .34,compression:4,relaxation:2.5,rollInfluence:.2},wheels:physicsWheels(spec),camera:{mode:'free',distance:spec.camera[0],height:spec.camera[1],lag:6,fov:70},entry:{enabled:!trailer,radius:Math.max(2,spec.size[0]*1.5),exitOffset:Math.max(1.4,spec.size[0]+.5)},tuning:{maxSpeed:spec.speed,acceleration:spec.acceleration,brake:spec.acceleration*1.6,reverseSpeed:Math.max(2,spec.speed*.22),steer:spec.steer,grip:spec.className==='watercraft'?.52:.82,drag:spec.className==='watercraft'?.55:1.8},watercraft:water?{enabled:true,waterline:0,buoyancy:1,planing:spec.id==='small-boat'?1:.55,turnDrag:.45}:null,towing:{enabled:spec.hitch!==false,hitch:{position:[0,.35,-spec.size[2]]},attachRadius:1.25,maxAngle:70},towable:{enabled:spec.towable!==false,coupler:{position:[0,.5,spec.size[2]]},driverSeat:!trailer},damage:{enabled:true,maxEnergy:Math.max(180,spec.mass*.7),fuelTank:{enabled:spec.className!=='bicycle',position:[0,spec.damage[0],spec.damage[1]],radius:Math.max(.2,spec.size[0]*.18),damageMultiplier:2.5,dummyVisible:true},engineSmoke:{position:[0,spec.damage[0]+.25,spec.damage[1]+.2],dummyVisible:true},exhaust:{position:[0,spec.damage[0],-spec.size[2]],dummyVisible:true},smokeThreshold:.62,fireThreshold:.28,explosion:{delay:.75,radius:Math.max(4,spec.size[0]*1.2),force:120,detachWheels:true,blacken:true}}}};
  if(root.LK_LOGIC_GRAPH&&root.LK_LOGIC_GRAPH.ensurePawnCameraRigs)root.LK_LOGIC_GRAPH.ensurePawnCameraRigs(result);
  return result;
}
const SPECS=Object.freeze([
  {id:'small-boat',name:'Small Boat',className:'watercraft',size:[.85,.42,2.1],mass:720,speed:19,acceleration:6,steer:1.8,camera:[7,2.8],seat:[0,1.05,-.15],damage:[.55,-.7],color:'#0ea5e9'},
  {id:'medium-boat',name:'Medium Boat',className:'watercraft',size:[1.65,.72,4.4],mass:4800,speed:15,acceleration:3.8,steer:1.25,camera:[11,4.2],seat:[0,1.75,-.9],damage:[.8,-2.1],color:'#0284c7'},
  {id:'ship',name:'Large Ship',className:'watercraft',size:[5,1.65,15],mass:85000,speed:10,acceleration:1.1,steer:.55,camera:[30,12],seat:[0,4.2,-4.8],damage:[2.1,-6],color:'#0369a1'},
  {id:'truck',name:'Truck Tractor',className:'truck',size:[1.15,.72,3.25],mass:7800,speed:31,acceleration:5.2,steer:1.25,camera:[12,4.2],seat:[-.42,1.65,1.75],damage:[.85,-.8],color:'#2563eb'},
  {id:'trailer',name:'Detachable Trailer',className:'trailer',size:[1.2,.68,4.6],mass:5200,speed:.1,acceleration:.1,steer:.1,camera:[12,4],seat:[0,1,0],damage:[.75,-1.8],color:'#94a3b8',hitch:false,towable:true},
  {id:'sport-motorcycle',name:'Sport Motorcycle',className:'motorcycle',size:[.34,.56,1.02],mass:210,speed:78,acceleration:15,steer:2.3,camera:[5.8,2.25],seat:[0,1.38,-.18],damage:[.9,.08],color:'#dc2626'},
  {id:'dirt-bike',name:'Dirt Bike',className:'motorcycle',size:[.32,.62,1.08],mass:118,speed:42,acceleration:12,steer:2.65,camera:[5.6,2.35],seat:[0,1.42,-.22],damage:[.92,.05],color:'#f97316'},
  {id:'scooter',name:'Scooter',className:'scooter',size:[.34,.52,.9],mass:135,speed:30,acceleration:8,steer:2.45,camera:[5.2,2.15],seat:[0,1.3,-.22],damage:[.78,-.18],color:'#0ea5e9'},
  {id:'bmx',name:'BMX Bicycle',className:'bicycle',size:[.3,.5,.82],mass:12,speed:13,acceleration:4.2,steer:3.1,camera:[4.8,2],seat:[0,1.22,-.18],damage:[.72,0],color:'#7c3aed',hitch:false},
  {id:'mountain-bike',name:'Mountain Bike',className:'bicycle',size:[.32,.55,.94],mass:15,speed:18,acceleration:4.8,steer:2.8,camera:[5,2.1],seat:[0,1.3,-.16],damage:[.76,0],color:'#16a34a',hitch:false},
]);
function aircraftTemplate(kind){
  const registry=root.LK_LOGIC_TEMPLATES,source=registry&&registry.get&&registry.get('logic-template-sketchbook-'+kind);if(!source)return null;
  const item=clone(source),graph=item.graph;item.id='logic-template-vehicle-normal-'+kind;item.name='Template - Normal Rig '+(kind==='airplane'?'Airplane':'Helicopter');item.description='Normal-rig Logic Element aircraft with an editable procedural placeholder; accepts a GLB exported from the Blender Vehicle Rig add-on.';item.category='Pawn / Vehicle / Normal';graph.name=item.name;graph.sketchbookPawn.id='normal-rig-'+kind;graph.sketchbookPawn.template=true;graph.sketchbookPawn.rigProfile='normal';graph.sketchbookPawn.modelAsset=null;graph.sketchbookPawn.source={engine:'Lot King',profile:'normal-vehicle-rig-v1'};graph.logicScene.root.name=(kind==='airplane'?'Airplane':'Helicopter')+' Root';
  const model=graph.logicScene.elements.find(value=>value.id===kind+'_model');if(model){delete model.asset;model.type='mesh';model.primitive='cube';model.name=(kind==='airplane'?'Airplane':'Helicopter')+' / GLB Placeholder';model.position=kind==='airplane'?[0,1,0]:[0,1.35,0];model.scale=kind==='airplane'?[5.8,.65,4.4]:[2.1,1.65,4.2];model.color=kind==='airplane'?'#a78bfa':'#34d399';model.vehicleRigRole='fuselage';}
  return item;
}
function makeTemplates(){
  const output=[];RIG_PROFILES.forEach(profile=>SPECS.forEach(spec=>output.push({id:'logic-template-vehicle-'+profile+'-'+spec.id,name:(profile==='normal'?'Template - ':'DollBody-compatible - ')+spec.name,description:'Editable '+spec.name+' Logic Element with a detailed procedural placeholder, semantic rig joints, damage anchors, seat, camera and towing metadata.',category:'Pawn / Vehicle / '+(profile==='normal'?'Normal':'DollBody-compatible'),graph:graph(spec,profile)})));
  ['airplane','helicopter'].forEach(kind=>{const item=aircraftTemplate(kind);if(item)output.push(item);});return output;
}
if(root.LK_LOGIC_TEMPLATES&&root.LK_LOGIC_TEMPLATES.register)root.LK_LOGIC_TEMPLATES.register(makeTemplates());
root.LK_LOGIC_TEMPLATES_VEHICLE_PACK=Object.freeze({RIG_PROFILES,SPECS,makeTemplates,placeholder});
})(typeof window!=='undefined'?window:globalThis);
