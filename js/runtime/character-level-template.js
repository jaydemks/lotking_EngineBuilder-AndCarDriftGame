/* =========================================================
   LOT KING - Sketch Street character template
   Native/editor-editable reconstruction of sketch-street_v2.
   Keep concept geometry here; character behavior belongs to
   Character Pawn templates and the shared runtime base.
   ========================================================= */
(function(){
'use strict';

const SOURCE='Sketch Street concept (native reconstruction)';
const CREST_Z=-30,SLOPE_START=-2,SLOPE=.26;
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function groundH(z){return z<SLOPE_START?Math.min((SLOPE_START-z)*SLOPE,(SLOPE_START-CREST_Z)*SLOPE):0;}
function hex(value){return '#'+Number(value).toString(16).padStart(6,'0');}

function buildScene(baseScene){
  const scene=baseScene||{version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}};
  scene.added=(scene.added||[]).filter(e=>!(e&&e.name==='Ground'&&e.asset&&e.asset.source==='Editor primitive'));
  let seq=0;
  function add(name,prim,p,s,color,collide,options){
    options=options||{};
    const id='sketch_street_'+String(++seq).padStart(3,'0');
    const props=Object.assign({color,roughness:.9,metalness:0,centered:true,materialModel:'toon'},options.props||{});
    scene.added.push({id,kind:'primitive',prim,name,collide:collide===true,props,
      t:{p:p.slice(),r:(options.rotation||[0,0,0]).slice(),s:s.slice(),v:options.visible!==false},
      asset:{key:'primitive:'+prim,name,source:SOURCE},
      templateGroup:options.group||'Sketch Street',driveSurface:options.driveSurface===true});
    return id;
  }
  function box(name,p,size,color,collide,o){return add(name,'box',p,[size[0]/2,size[1]/2,size[2]/2],color,collide,o);}
  function cyl(name,p,r,h,color,collide,o){return add(name,'cylinder',p,[r,h/2,r],color,collide,o);}
  function plane(name,p,w,d,color,o){return add(name,'plane',p,[w/4,1,d/4],color,false,o);}
  function sphere(name,p,r,color,o){return add(name,'sphere',p,[r/1.2,r/1.2,r/1.2],color,false,o);}
  function sketch(base,seed,repeat,angle){return {base,seed,repeat:repeat||[1,1],angle:angle==null?-.65:angle,strokes:70};}

  // Exact road profile, split into editable planar sections.
  function surfaceStrip(label,x,width,z0,z1,color,seed){
    const segments=26,step=(z0-z1)/segments;
    for(let i=0;i<segments;i++){
      const near=z0-i*step,far=near-step,zc=(near+far)/2;
      const dh=groundH(far)-groundH(near),length=Math.hypot(step,dh);
      plane(label+' '+String(i+1).padStart(2,'0'),[x,(groundH(near)+groundH(far))/2,zc],width,length,color,
        {rotation:[Math.atan2(dh,step),0,0],driveSurface:true,group:'Terrain',props:{sketch:sketch(hex(color),seed+i,[2,1],.05)}});
    }
  }
  surfaceStrip('Road',0,7.2,20,CREST_Z-2,0x8fa6a6,100);
  surfaceStrip('Left Ground',-8,9,20,CREST_Z-2,0xb9c8ad,200);
  surfaceStrip('Right Ground',8,9,20,CREST_Z-2,0xb9c8ad,300);
  surfaceStrip('Center Line',0,.16,20,CREST_Z-2,0xf3f6ee,400);
  // Distant seafront from the concept (vertical background cards).
  plane('Sea Backdrop',[0,groundH(CREST_Z)+2,-78],220,26,0x4fb8c4,{rotation:[Math.PI/2,0,0],group:'Horizon',props:{sketch:sketch('#4fb8c4',410,[6,1],.02)}});
  plane('Far Land',[0,groundH(CREST_Z)-3,-72],220,10,0x7fc9a8,{rotation:[Math.PI/2,0,0],group:'Horizon'});

  function house(h,index){
    const y=groundH(h.z)-.15,frontZ=h.z+(h.d/2+.012)*h.flip,group='House '+index;
    box(group+' Body',[h.x,y+h.h/2,h.z],[h.w,h.h,h.d],h.color,true,{group,props:{sketch:sketch(hex(h.color),500+index,[2,2])}});
    box(group+' Roof',[h.x,y+h.h+.14,h.z],[h.w+.5,.28,h.d+.5],h.roof,true,{group,props:{sketch:sketch(hex(h.roof),520+index,[2,2])}});
    for(let i=0;i<h.windows;i++){
      const wx=h.x+(-(h.windows-1)/2+i)*1.6*h.flip,rot=h.flip<0?[0,Math.PI,0]:[0,0,0];
      plane(group+' Window '+(i+1)+' Frame',[wx,y+h.h*.62,frontZ-(.006*h.flip)],1,1.1,0xf5f2ea,{rotation:rot,group});
      plane(group+' Window '+(i+1)+' Glass',[wx,y+h.h*.62,frontZ],.9,1,0x35505c,{rotation:rot,group,props:{materialModel:'unlit'}});
      box(group+' Window '+(i+1)+' Bar',[wx,y+h.h*.62,frontZ+.008*h.flip],[.9,.03,.025],0xf5f2ea,false,{rotation:rot,group,props:{materialModel:'unlit'}});
    }
    plane(group+' Door',[h.x+h.w*.28*h.flip,y+.85,frontZ],.9,1.7,0x6b4f3a,{rotation:h.flip<0?[0,Math.PI,0]:[0,0,0],group,props:{sketch:sketch('#6b4f3a',540+index)}});
  }
  [
    {x:-6.4,z:10,w:5.5,d:5,h:3.6,color:0xf2e6c9,roof:0x8a949e,flip:1,windows:2},
    {x:-6.8,z:1,w:5,d:6,h:4.4,color:0xf5f2ea,roof:0x77838d,flip:1,windows:2},
    {x:-7,z:-10,w:5,d:6,h:5.2,color:0xeef4ec,roof:0x6f7b85,flip:1,windows:3},
    {x:-7.2,z:-21,w:5,d:6,h:5.8,color:0xf2e6c9,roof:0x8a949e,flip:1,windows:2},
    {x:6.6,z:8,w:5.5,d:6,h:4.2,color:0x9fca9a,roof:0x5d7a5c,flip:-1,windows:2},
    {x:6.9,z:-3,w:5,d:6,h:5,color:0xbfe3cf,roof:0x6f8f7d,flip:-1,windows:3},
    {x:7.1,z:-14,w:5,d:6,h:5.6,color:0xf5f2ea,roof:0x77838d,flip:-1,windows:2},
    {x:7.2,z:-24,w:5,d:6,h:6,color:0x9fca9a,roof:0x5d7a5c,flip:-1,windows:2},
  ].forEach((h,i)=>house(h,i+1));

  // Vending machine, including the twelve colored cans.
  {const x=3.55,z=5.5,y=groundH(z),g='Vending Machine',rot=[0,-Math.PI/2+.05,0];
    box(g+' Body',[x,y+.95,z],[1.1,1.9,.8],0xf2a0a0,true,{rotation:rot,group:g,props:{sketch:sketch('#f2a0a0',600,[1,2])}});
    plane(g+' Display',[x,y+1.25,z-.411],.9,1,0xffe9d8,{rotation:rot,group:g,props:{materialModel:'unlit'}});
    const colors=[0xe0524d,0x4d8fe0,0xf0c04a,0x59b06a];
    for(let r=0;r<3;r++)for(let c=0;c<4;c++)box(g+' Can '+(r*4+c+1),[x-.3+c*.2,y+1.55-r*.28,z-.425],[.13,.2,.04],colors[(r+c)%4],false,{rotation:rot,group:g,props:{materialModel:'unlit'}});
    plane(g+' Slot',[x,y+.45,z-.416],.7,.28,0xd77f7f,{rotation:rot,group:g});
  }

  // Road furniture and vegetation.
  {const x=-3.3,z=-6.5,y=groundH(z),g='Road Sign';
    cyl(g+' Post',[x,y+1.2,z],.045,2.4,0x9aa3a8,true,{group:g});
    add(g+' Warning Triangle','triangle',[x,y+2.35,z],[.49,.49,.49],0xd94f46,false,{rotation:[0,.25,0],group:g,props:{materialModel:'unlit'}});
    add(g+' Inner Triangle','triangle',[x,y+2.35,z+.012],[.36,.36,.36],0xf6f1e6,false,{rotation:[0,.25,0],group:g,props:{materialModel:'unlit'}});
  }
  {const x=-3.6,z=6.8,y=groundH(z),g='AC Unit';
    box(g,[x,y+.32,z],[.8,.6,.35],0xe8e4d8,true,{rotation:[0,Math.PI/2,0],group:g,props:{sketch:sketch('#e8e4d8',620)}});
    add(g+' Fan','cylinder',[x+.18,y+.32,z-.15],[.2,.012,.2],0xb9b4a6,false,{rotation:[0,0,Math.PI/2],group:g});
  }
  function plant(x,z,s,index){const y=groundH(z),g='Plant '+index;
    cyl(g+' Pot',[x,y+.15*s,z],.22*s,.3*s,0xc47f5a,false,{group:g});
    [[-.35,0,.25],[.25,.2,-.3],[.15,-.25,.3],[-.2,.35,-.15],[0,-.35,0]].forEach((r,i)=>add(g+' Leaf '+(i+1),'cone',[x,y+.58*s,z],[.06*s,.275*s,.06*s],0x4e9a5f,false,{rotation:r,group:g}));
  }
  [[-3.5,13.5,1.1],[3.4,12.8,.9],[3.5,-9,1],[-3.4,-16,.9]].forEach((p,i)=>plant(p[0],p[1],p[2],i+1));

  {const z=-30.5,y=groundH(z),g='Guard Rail';
    for(let i=-3;i<=3;i++)cyl(g+' Post '+(i+4),[i*1.2,y+.45,z],.05,.9,0xdde3e6,true,{group:g});
    box(g+' Bar',[0,y+.85,z],[7.6,.12,.08],0xdde3e6,true,{group:g});
  }
  const poleTops=[];
  [[-3.8,3],[3.9,-12],[-3.9,-26]].forEach((p,i)=>{const y=groundH(p[1]),g='Utility Pole '+(i+1);
    cyl(g,[p[0],y+3.5,p[1]],.1,7,0x8b8578,true,{group:g,props:{sketch:sketch('#8b8578',650+i)}});
    box(g+' Crossbar',[p[0],y+6.4,p[1]],[1.6,.08,.08],0x6f6a5e,false,{group:g});poleTops.push([p[0],y+6.4,p[1]]);
  });
  function wire(a,b,index){const parts=16;for(let i=0;i<parts;i++){const t0=i/parts,t1=(i+1)/parts;
    function q(t){const x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=a[1]+(b[1]-a[1])*t-2*t*(1-t);return[x,y,z];}
    const p0=q(t0),p1=q(t1),dx=p1[0]-p0[0],dy=p1[1]-p0[1],dz=p1[2]-p0[2],len=Math.hypot(dx,dy,dz);
    box('Cable '+index+' Segment '+(i+1),[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2,(p0[2]+p1[2])/2],[.035,.035,len],0x3a3f45,false,{rotation:[-Math.atan2(dy,Math.hypot(dx,dz)),Math.atan2(dx,dz),0],group:'Utility Cables',props:{materialModel:'unlit'}});
  }}
  wire(poleTops[0],poleTops[1],1);wire(poleTops[1],poleTops[2],2);
  [[-3.9,15,6],[3.9,16,8],[3.9,-20,8],[-3.9,-21.5,5]].forEach((w,i)=>box('Boundary Wall '+(i+1),[w[0],groundH(w[1])+.4,w[1]],[.35,1,w[2]],0xcfd6cc,true,{group:'Walls',props:{sketch:sketch('#cfd6cc',700+i,[4,1])}}));

  // Green scooter near the NPC; each component remains editable.
  {const x=3.1,z=-27.6,y=groundH(z),g='Green Scooter',rot=[0,Math.PI*.2,0];
    add(g+' Front Wheel','torus',[x,y+.26,z+.55],[.186,.186,.186],0x33383d,true,{rotation:rot,group:g});
    add(g+' Rear Wheel','torus',[x,y+.26,z-.55],[.186,.186,.186],0x33383d,true,{rotation:rot,group:g});
    box(g+' Body',[x,y+.5,z],[.24,.22,.9],0x6fae4e,true,{rotation:rot,group:g});
    box(g+' Seat',[x,y+.68,z-.25],[.2,.1,.4],0x33383d,true,{rotation:rot,group:g});
    cyl(g+' Steering Column',[x,y+.72,z+.5],.04,.5,0x6fae4e,false,{rotation:[.35,Math.PI*.2,0],group:g});
    cyl(g+' Handlebar',[x,y+.95,z+.42],.03,.44,0x33383d,false,{rotation:[0,0,Math.PI/2],group:g});
    sphere(g+' Headlight',[x,y+.85,z+.55],.06,0xf0c04a,{group:g,props:{materialModel:'unlit'}});
    cyl(g+' Kickstand',[x+.14,y+.16,z-.2],.02,.3,0x33383d,false,{rotation:[0,0,.5],group:g});
  }

  const templates=window.LK_LOGIC_TEMPLATES;
  function logic(templateId,name,p,rotation,configure){
    const t=templates&&templates.get&&templates.get(templateId);if(!t||!t.graph)return;
    const graph=clone(t.graph);if(configure)configure(graph);
    scene.added.push({id:'sketch_street_'+String(++seq).padStart(3,'0'),kind:'logicElement',name,collide:false,graph,enabled:true,runInEditorPreview:true,
      asset:{key:'logic:template:'+templateId,name,source:SOURCE},t:{p:p.slice(),r:rotation.slice(),s:[1,1,1],v:true},templateGroup:'Characters'});
  }
  logic('logic-template-player-character-normal','Player Character (Normal)',[0,groundH(14),14],[0,Math.PI,0],g=>{g.characterPawn.spawn={x:0,y:groundH(14),z:14,heading:Math.PI};g.characterPawn.movement=Object.assign({},g.characterPawn.movement,{walkSpeed:3.4,runSpeed:6.4,sprintMultiplier:1});g.characterPawn.camera=Object.assign({},g.characterPawn.camera,{distance:5.2,height:2.6,fov:55});});
  logic('logic-template-talkable-civil-npc','Talkable Civil NPC',[2.2,groundH(-26.5),-26.5],[0,Math.PI*.75,0],g=>{g.characterPawn.spawn={x:2.2,y:groundH(-26.5),z:-26.5,heading:Math.PI*.75};});

  scene.characterGround={type:'slope-z',slopeStart:SLOPE_START,crestZ:CREST_Z,slope:SLOPE,baseY:0,minX:-3.45,maxX:3.45,minZ:CREST_Z+1.6,maxZ:16.5};
  scene.env=Object.assign({},scene.env||{},{skyTime:.34,dayLength:999999,procEnvEnabled:true,procEnvIntensity:1.05,backgroundColor:'#8edcd8',fog:{enabled:true,color:'#9fdede',near:45,far:110}});
  scene.template={id:'character-movement-playground',name:'Sketch Street - Character Movement',version:2,sourceConcept:'sketch-street_v2.html',nativeEditable:true,
    visualStyle:{material:'toon-sketch',outline:true,fog:[45,110]},controls:{move:'WASD / arrows',sprint:'Shift',jump:'Space',interact:'F'}};
  return scene;
}

window.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE=Object.freeze({id:'character-movement-playground',name:'Sketch Street - Character Movement',buildScene,groundH});
})();
