/* =========================================================
   LOT KING - Jungle Car Escape editable island template
   Native race/drift player car + shared Mission Director.
   ========================================================= */
(function(){
'use strict';

const root=typeof window!=='undefined'?window:globalThis;
const ID='jungle-car-escape',SOURCE='Jungle Car Escape template';
function buildScene(baseScene){
  const scene=baseScene||{version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}};
  scene.added=(scene.added||[]).filter(entry=>!(entry&&entry.name==='Ground'&&entry.asset&&entry.asset.source==='Editor primitive'));
  let seq=0;
  function add(name,prim,p,scale,color,collide,options){
    options=options||{};const id='jungle_escape_'+String(++seq).padStart(3,'0');
    scene.added.push({id,kind:'primitive',prim,name,collide:collide===true,driveSurface:options.driveSurface===true,
      props:Object.assign({color,roughness:.92,metalness:0,centered:true},options.props||{}),
      t:{p:p.slice(),r:(options.rotation||[0,0,0]).slice(),s:scale.slice(),v:options.visible!==false},
      asset:{key:'primitive:'+prim,name,source:SOURCE},templateGroup:options.group||'Jungle Island'});return id;
  }
  function box(name,p,size,color,collide,options){return add(name,'box',p,[size[0]/2,size[1]/2,size[2]/2],color,collide,options);}
  function cylinder(name,p,r,h,color,collide,options){return add(name,'cylinder',p,[r,h/2,r],color,collide,options);}

  // Water and layered island are ordinary primitives; authors can widen the
  // beach, delete the cliffs or replace any road section with an imported mesh.
  add('Ocean','plane',[0,-1.35,0],[70,1,70],0x177f9c,false,{group:'Island / Water',props:{roughness:.22,metalness:.05,opacity:.9,transparent:true}});
  cylinder('Island Foundation',[0,-1.1,0],55,2.2,0x9b7a4a,true,{group:'Island / Terrain'});
  cylinder('Jungle Plateau',[0,-.25,0],47,1.1,0x426b39,true,{group:'Island / Terrain'});
  cylinder('Extraction Beach',[0,-.12,-47],18,.5,0xd8c18b,true,{group:'Island / Terrain'});

  const route=[
    {p:[-29,.35,29],size:[10,.45,22],yaw:-.35},
    {p:[-23,.45,12],size:[10,.45,20],yaw:.7},
    {p:[-8,.55,2],size:[10,.45,23],yaw:1.05},
    {p:[10,.45,-4],size:[10,.45,22],yaw:1.25},
    {p:[25,.35,-17],size:[10,.45,24],yaw:.35},
    {p:[20,.25,-35],size:[11,.45,22],yaw:-.55},
    {p:[4,.12,-46],size:[12,.4,25],yaw:1.35},
  ];
  route.forEach((segment,index)=>box('Escape Route '+String(index+1).padStart(2,'0'),segment.p,segment.size,0x6e5a3d,true,{rotation:[0,segment.yaw,0],driveSurface:true,group:'Escape Route',props:{surface:'dirt'}}));

  // Dense but bounded vegetation, with a deliberately open ten-metre route.
  for(let i=0;i<46;i++){
    const angle=i*2.3999632297,radius=16+(i%8)*4.1,x=Math.sin(angle)*radius,z=Math.cos(angle)*radius;
    if(route.some(segment=>Math.hypot(x-segment.p[0],z-segment.p[2])<8))continue;
    const height=4.5+(i%5)*.7;
    cylinder('Palm Trunk '+(i+1),[x,height*.5,z],.23,height,0x765137,true,{group:'Jungle / Vegetation'});
    add('Palm Crown '+(i+1),'sphere',[x,height+.4,z],[1.5,1,1.5],i%3?0x27643d:0x1f5535,false,{group:'Jungle / Vegetation'});
  }
  [[-17,0,18],[4,0,5],[18,0,-12],[16,0,-31],[-3,0,-43]].forEach((p,index)=>{
    add('Rock Hazard '+(index+1),'sphere',[p[0],.65,p[2]],[1.2+.2*(index%2),1,1.1],0x4c5550,true,{rotation:[.2,index*.7,.15],group:'Route Hazards'});
  });
  box('Broken Bridge Left',[-2,1.1,-22],[7,.5,4],0x80552f,true,{rotation:[0,.12,.08],group:'Route Hazards'});
  box('Broken Bridge Right',[7,1.15,-24],[7,.5,4],0x80552f,true,{rotation:[0,.12,-.08],group:'Route Hazards'});

  const checkpoints=[
    {id:'jungle_ruins',title:'Find the old ruins road',p:{x:-23,y:.5,z:13},radius:7},
    {id:'jungle_bridge',title:'Cross the broken bridge',p:{x:6,y:.6,z:-10},radius:7},
    {id:'jungle_ridge',title:'Clear the jungle ridge',p:{x:23,y:.5,z:-30},radius:7},
    {id:'jungle_extract',title:'Reach the extraction beach',p:{x:2,y:.2,z:-49},radius:9},
  ];
  checkpoints.forEach((checkpoint,index)=>{
    const color=index===checkpoints.length-1?0xfacc15:0xfb923c;
    cylinder(checkpoint.title+' Beacon',[checkpoint.p.x,2.6,checkpoint.p.z],.18,5,color,false,{group:'Objectives'});
    add(checkpoint.title+' Marker','torus',[checkpoint.p.x,.2,checkpoint.p.z],[checkpoint.radius*.38,.12,checkpoint.radius*.38],color,false,{rotation:[Math.PI/2,0,0],group:'Objectives',props:{emissive:color,emissiveIntensity:.7}});
  });

  const missionFactory=root.LK_LOGIC_TEMPLATES_MISSION;
  if(missionFactory&&missionFactory.makeMissionGraph){
    const objectives=checkpoints.map((checkpoint,index)=>({id:checkpoint.id,title:checkpoint.title,kind:'reach',order:index,points:index===checkpoints.length-1?600:200,target:{radius:checkpoint.radius,position:checkpoint.p}}));
    objectives.push({id:'jungle_no_wreck',title:'Bonus · Escape without wrecking the car',kind:'avoid',order:20,optional:true,points:400,target:{tag:'vehicle-wreck'}});
    const graph=missionFactory.makeMissionGraph({missionId:'jungle-car-escape',title:'Island Breakout',subtitle:'Find the coast before the extraction boat leaves',mode:'sequence',timeLimit:150,failOnTimeout:true,objectives});
    scene.added.push({id:'jungle_escape_mission',kind:'logicElement',name:'Jungle Escape Mission Director',collide:false,graph,enabled:true,runInEditorPreview:true,
      asset:{key:'logic:template:logic-template-mission-director',name:'Jungle Escape Mission Director',source:SOURCE},t:{p:[-30,.2,32],r:[0,0,0],s:[1,1,1],v:true},templateGroup:'Gameplay'});
  }

  scene.player=Object.assign({},scene.player||{},{enabled:true,hidden:false,controllerIndex:0,spawn:{x:-29,z:35,heading:Math.PI},
    cam:Object.assign({},(scene.player||{}).cam||{},{fogDensity:.014})});
  scene.env=Object.assign({},scene.env||{},{skyTime:.31,dayLength:999999,dayNightCycleEnabled:false,procEnvEnabled:true,procEnvIntensity:.78,procEnvWarmth:.42,procEnvContrast:.62,backgroundColor:'#5f927f',
    rain:{enabled:true,intensity:.48,speed:58,length:.62,width:.035,wind:.48,windAngle:138,area:82,height:48,opacity:.36,sound:.58},
    volClouds:{enabled:true,coverage:.87,density:1.58,scale:1.8,detail:.68,speed:1.9,windAngle:138,altitude:82,thickness:145,quality:16,absorption:1.72,opacity:.96,anvil:.74,resolutionScale:.65},
    weather:{type:'rain',intensity:.48,wind:[.25,0,.4],surface:'mud'}});
  scene.template={id:ID,name:'Jungle Car Escape',version:1,nativeEditable:true,gameMode:'vehicle-escape',objectiveSystem:true,controls:{drive:'WASD / left stick',handbrake:'Space',reset:'R'}};
  return scene;
}

root.LK_RUNTIME_JUNGLE_CAR_ESCAPE_LEVEL_TEMPLATE=Object.freeze({id:ID,name:'Jungle Car Escape',buildScene});
if(root.LK_LEVEL_TEMPLATES&&root.LK_LEVEL_TEMPLATES.register)root.LK_LEVEL_TEMPLATES.register({id:ID,name:'Jungle Car Escape',nameIt:'Fuga in auto dalla giungla',category:'Vehicle',order:520,ground:'none',keepBuiltinPlayer:true,description:'Editable island route with hazards, timed checkpoints and native race/drift car physics.',descriptionIt:'Percorso su isola editabile con pericoli, checkpoint a tempo e fisica auto race/drift nativa.',build:buildScene});
if(typeof module!=='undefined'&&module.exports)module.exports=root.LK_RUNTIME_JUNGLE_CAR_ESCAPE_LEVEL_TEMPLATE;
})();
