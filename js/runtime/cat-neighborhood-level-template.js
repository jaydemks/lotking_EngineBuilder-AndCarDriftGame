/* =========================================================
   LOT KING - Cat Neighborhood Adventure editable template
   "Gutter Lane" - a city block built for a quadruped 30 cm tall.

   The player is the reusable Cat Animal Pawn Logic Element, so its procedural
   quadruped can be replaced by the author's own rigged GLB without changing
   locomotion, camera, actions or mission wiring. Everything below is ordinary
   editor geometry and Logic Element instances: the level can be opened,
   re-arranged and saved like any authored scene.

   WHAT A CAT LEVEL HAS TO BE (references studied)
     Stray (BlueTwelve) - "most of the movement is as vertical as it is
     lateral"; mundane set dressing (pipes, AC units, sills, bins) IS the
     platforming vocabulary, and the cat reaches places no human-sized body
     could. Little Kitty, Big City - the world is a set of tactile cat verbs
     (get in the box, take the thing to the human) rather than a corridor.
     Assassin's Creed / Ghost of Tsushima - a traversal grammar only reads when
     the height ladder is REGULAR: every rung has to be reachable from the one
     below by exactly one verb.

   THE TRAVERSAL LADDER (section 03 enforces it; nothing here is hand-placed at
   an arbitrary height). Cat: jump 1.15 m, climb/mantle up to 2.4 m.

     L0  0.00  street
     L1  0.16  kerb and pavement          step
     L2  0.95  bin lid, crate, low wall   jump
     L3  1.75  dumpster lid, fence rail   jump
     L4  2.90  wall top, awning, AC unit  climb
     L5  4.30  first fire-escape landing  climb
     L6  6.70  roofs and gutters          climb
     L7  9.40  water tower and chimneys   climb

   HOW THIS FILE IS ORGANISED
     00  identity and extents
     01  zones             outliner folders, numbered in traversal order
     02  palette           raw colours, named by what they are made of
     03  height ladder     the traversal grammar, one named rung per level
     04  material classes  every surface names a class, never a loose hex
     05  helpers           primitive constructors, decals, lights, triggers
     06  zone builders     one function per outliner folder, in traversal order
     07  gameplay triggers the mice, the tokens, the humans, the hazards
     08  player pawn       the Cat Animal Pawn instance
     09  mission director  the authored objective list
     10  runtime system    the trigger behaviours that feed the objectives
     11  world data        bounds, environment, manifest, registration
   ========================================================= */
(function(){
'use strict';

const root=typeof window!=='undefined'?window:globalThis;

// ================================================================ 00 identity

const ID='cat-neighborhood-adventure';
const NAME='Cat Neighborhood Adventure';
const SOURCE='Cat Neighborhood Adventure template';
const GROUND_Y=0;
const CITY_HALF=44;          // playable half-extent on both axes
const STREET_HALF_Z=5.5;     // the road runs east-west through z = 0

function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function finite(value,fallback){value=Number(value);return Number.isFinite(value)?value:fallback;}
function clamp(value,min,max){return Math.max(min,Math.min(max,finite(value,min)));}

// =================================================================== 01 zones
// Declared and numbered in the order the cat meets them: it wakes in the alley,
// climbs the fire escape, crosses the roofs, comes down the terrace, works the
// market and the yards, and goes home. The outliner sorts these as text, so the
// numbers are what keep the folders in walking order.

const GROUP={
  gameplay:  '00 Gameplay',
  ground:    '01 Ground and Streets',
  alley:     '02 Home Alley',
  fireEscape:'03 Fire Escape Run',
  roofs:     '04 Rooftop Highway',
  terrace:   '05 Terrace Row',
  market:    '06 Market Square',
  yards:     '07 Backyards and Fences',
  catRuns:   '08 Cat-Only Passages',
  dressing:  '09 Signage and Lighting',
  triggers:  '10 Adventure Triggers',
};

// ================================================================= 02 palette
// A damp, late-afternoon back street: warm brick and render against cold
// asphalt and zinc, so a cat in any fur colour stays readable against it.

const COLOR={
  // ground
  asphalt:0x3c4045, asphaltWorn:0x474b51, cobble:0x585c60, concrete:0x6d6f6c,
  concreteLight:0x83857f, drain:0x2c3033, puddle:0x2b3339,
  // structure
  brickRed:0x8a5341, brickBrown:0x74564a, renderCream:0xbcae95, renderBlue:0x7d9099,
  renderGreen:0x7c8f76, stone:0x8d8879, roofFelt:0x4a4b4d, roofTile:0x77463c,
  // metal
  zinc:0x7b838a, steelDark:0x40474d, ironBlack:0x2f3337, rust:0x7a4a30, copper:0x5f8878,
  // wood and cloth
  woodWarm:0x7b5c3a, woodPale:0x9c8055, crate:0x8a6c45, awningRed:0x9c4a44,
  awningStripe:0xd8cfbc, tarpGreen:0x4c5a45, cardboard:0xa8845a,
  sheetWhite:0xd8d2c4, sheetTan:0xc7b7a4, sheetBlue:0x9fb3bd,
  // organics
  leaf:0x46703f, leafDark:0x35562f, bark:0x5b4634, grass:0x5c7a4a, soil:0x4d4034,
  // glass, light, paint
  glass:0x2b3a44, lampGlow:0xffdca8, neonPink:0xff5f9e, neonCyan:0x5fe0ff,
  paintWhite:0xcfd2cc,
  // gameplay reads
  markToken:0x8ad6ff, markDelivery:0xf59e0b, markFriendly:0xa78bfa, markHome:0x22c55e,
};

// =========================================================== 03 height ladder
// Every walkable surface in the level takes its Y from this table instead of a
// hand-picked number. That is the whole reason the block is traversable: the
// gap between consecutive rungs never exceeds what the Cat Pawn can clear, and
// re-tuning one rung moves everything that stands on it.

const LEVEL={
  street:   0.00,
  kerb:     0.16,
  crate:    0.95,
  dumpster: 1.75,
  wall:     2.90,
  landing:  4.30,
  roof:     6.70,
  // The chimney tops, the roof crates and the step under the water tower all
  // live on this rung. It exists purely because the tower deck was 2.70 m above
  // the roof - beyond a mantle - and verifyLadder below refused to build it.
  ledge:    8.30,
  tower:    9.40,
};
const LEVEL_ORDER=['street','kerb','crate','dumpster','wall','landing','roof','ledge','tower'];
// A cat clears 1.15 m by jumping and mantles 2.4 m by climbing; a rung further
// than that above the one below is an unreachable rooftop and a bug report.
const MAX_RUNG_GAP=2.4;
function rung(name){
  const value=LEVEL[name];
  if(value==null) throw new Error('Cat level template: unknown height rung "'+name+'"');
  return value;
}
(function verifyLadder(){
  for(let index=1;index<LEVEL_ORDER.length;index++){
    const gap=rung(LEVEL_ORDER[index])-rung(LEVEL_ORDER[index-1]);
    if(gap>MAX_RUNG_GAP+1e-6) throw new Error('Cat level template: rung "'+LEVEL_ORDER[index]+'" sits '+gap.toFixed(2)+' m above "'+LEVEL_ORDER[index-1]+'", beyond a cat');
  }
})();

// ======================================================== 04 material classes
//
// Every piece of dressing names a class here instead of carrying a loose hex. A
// class is the whole surface identity: colour, PBR response, which procedural
// surface it wears (js/engine/procedural-surfaces.js), how many metres one
// texture tile covers, and the footstep material the Sound Set plays when a
// body stands on it. The surface entry is inert when the procedural module is
// absent, so the level still builds and still looks like the palette above.

const SURFACE_VARIANTS=3;
function material(color,roughness,metalness,surface,tile,foot){
  return {color,roughness,metalness,surface,tile,foot};
}
const MAT={
  // -- ground
  asphalt:      material(COLOR.asphalt,       .93,.02,'asphalt',        4,  'concrete'),
  asphaltWorn:  material(COLOR.asphaltWorn,   .95,.02,'asphalt',        3,  'concrete'),
  cobble:       material(COLOR.cobble,        .94,.02,'concrete',       1.6,'concrete'),
  concrete:     material(COLOR.concrete,      .93,.02,'concrete',       4,  'concrete'),
  concreteLight:material(COLOR.concreteLight, .92,.02,'concrete',       3,  'concrete'),
  drain:        material(COLOR.drain,         .70,.35,'metalTread',      .5,'metal'),
  puddle:       material(COLOR.puddle,        .10,.30,null,             0,  'water'),
  soil:         material(COLOR.soil,          .99,0,  'dirt',           3,  'dirt'),
  grass:        material(COLOR.grass,         .97,0,  'turf',           3,  'grass'),
  // -- masonry
  brickRed:     material(COLOR.brickRed,      .95,0,  'brick',          2.2,'concrete'),
  brickBrown:   material(COLOR.brickBrown,    .95,0,  'brick',          2.4,'concrete'),
  renderCream:  material(COLOR.renderCream,   .92,0,  'plaster',        3,  'concrete'),
  renderBlue:   material(COLOR.renderBlue,    .92,0,  'plaster',        3,  'concrete'),
  renderGreen:  material(COLOR.renderGreen,   .92,0,  'plaster',        3,  'concrete'),
  stone:        material(COLOR.stone,         .94,0,  'concrete',       2.4,'concrete'),
  roofFelt:     material(COLOR.roofFelt,      .96,0,  'tarp',           3.2,'concrete'),
  roofTile:     material(COLOR.roofTile,      .93,0,  'brick',          1.4,'concrete'),
  // -- metal. Paint is a dielectric: only bare or galvanised steel earns a high
  //    metalness, which is why most of these sit near zero and read as metal
  //    through roughness and relief instead of turning into mirrors.
  zinc:         material(COLOR.zinc,          .48,.45,'metalPainted',   1.6,'metal'),
  steelDark:    material(COLOR.steelDark,     .58,.15,'metalPainted',   1.4,'metal'),
  ironBlack:    material(COLOR.ironBlack,     .55,.20,'metalPainted',   1.2,'metal'),
  rust:         material(COLOR.rust,          .92,.08,'metalRusted',    1.2,'metal'),
  tread:        material(COLOR.zinc,          .52,.35,'metalTread',      .5,'metal'),
  corrugated:   material(COLOR.zinc,          .68,.12,'metalCorrugated',2.2,'metal'),
  copper:       material(COLOR.copper,        .60,.30,'metalPainted',   1.6,'metal'),
  // -- wood and cloth
  woodWarm:     material(COLOR.woodWarm,      .90,0,  'wood',           1.6,'wood'),
  woodPale:     material(COLOR.woodPale,      .90,0,  'wood',           1.4,'wood'),
  crate:        material(COLOR.crate,         .89,0,  'plywood',        1.0,'wood'),
  awningRed:    material(COLOR.awningRed,     .86,0,  'tarp',           1.8,'carpet'),
  awningStripe: material(COLOR.awningStripe,  .86,0,  'tarp',           1.8,'carpet'),
  tarpGreen:    material(COLOR.tarpGreen,     .86,0,  'tarp',           2.2,'carpet'),
  cardboard:    material(COLOR.cardboard,     .95,0,  'plywood',        1.2,'carpet'),
  sheetWhite:   material(COLOR.sheetWhite,    .90,0,  'tarp',           1.2,'carpet'),
  sheetTan:     material(COLOR.sheetTan,      .90,0,  'tarp',           1.2,'carpet'),
  sheetBlue:    material(COLOR.sheetBlue,     .90,0,  'tarp',           1.2,'carpet'),
  // -- organics
  bark:         material(COLOR.bark,          .96,0,  'wood',           1.2,'wood'),
  leaf:         material(COLOR.leaf,          .96,0,  null,             0,  'grass'),
  leafDark:     material(COLOR.leafDark,      .96,0,  null,             0,  'grass'),
  // -- glass and paint
  glass:        material(COLOR.glass,         .08,.14,null,             0,  'marble'),
  paintWhite:   material(COLOR.paintWhite,    .62,0,  null,             0,  'concrete'),
};

// ================================================================= 05 helpers

function positionOf(value){
  if(!value)return null;if(value.body&&value.body.position)return value.body.position;
  if(value.owner)return positionOf(value.owner);if(value.getWorldPosition&&root.THREE)return value.getWorldPosition(new root.THREE.Vector3());
  return value.position||null;
}
function emitAdventure(type,detail){if(root.dispatchEvent&&root.CustomEvent)root.dispatchEvent(new root.CustomEvent('lk-cat-adventure-event',{detail:Object.assign({type},detail||{})}));}

/** Every gameplay trigger is a Logic Element with three exposed variables, so a
 *  designer can move it, retune it or duplicate it without opening a file. */
function triggerGraph(name,descriptor,visuals){
  return {version:1,name,scope:'element',enabled:true,variables:[
    {name:'TriggerEnabled',type:'boolean',value:true,exposed:true,binding:'catAdventureTrigger.enabled',label:'Trigger Enabled',category:'Cat Adventure'},
    {name:'TriggerRadius',type:'number',value:descriptor.radius||2,min:.2,max:30,step:.1,exposed:true,binding:'catAdventureTrigger.radius',label:'Trigger Radius',category:'Cat Adventure'},
    {name:'MoveSpeed',type:'number',value:descriptor.speed||0,min:0,max:20,step:.1,exposed:true,binding:'catAdventureTrigger.speed',label:'Move / Flee Speed',category:'Cat Adventure'},
  ],nodes:[{id:'on_start',type:'event.onStart',x:80,y:100,data:{}},{id:'ready',type:'debug.print',x:360,y:100,data:{message:name+' gameplay trigger ready.',duration:1}}],
  edges:[{id:'ready_edge',from:{node:'on_start',pin:'then'},to:{node:'ready',pin:'exec'}}],
  comments:[{id:'trigger_help',title:'Editable Cat Adventure trigger. Its descriptor feeds the shared mission system; move or duplicate this Logic Element to reshape the loop.',x:40,y:35,w:820,h:220,color:'#f59e0b'}],
  catAdventureTrigger:Object.assign({schemaVersion:1,enabled:true},clone(descriptor)),
  logicScene:{root:{id:'root',name:name+' Root',type:'empty',linked:true,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],color:'#f59e0b'},elements:clone(visuals||[]),components:[{id:'root_transform',elementId:'root',name:'Transform',type:'transform',linked:true}]}};
}

/** Write a batch of exposed graph variables in one pass. A missing name is
 *  skipped on purpose: the shared Animal template may retire a variable in a
 *  later revision and a level must not hard-fail because of it. */
function setVariables(graph,values){
  const variables=graph.variables||[];
  Object.keys(values).forEach(name=>{
    const item=variables.find(variable=>variable&&variable.name===name);
    if(item)item.value=values[name];
  });
  return graph;
}

// The four terraced houses, west to east. Declared out here because both the
// terrace builder and the signage builder hang things off the same facades.
const HOUSES=[
  {name:'Number 2',x:-30,wall:'brickRed',trim:'renderCream'},
  {name:'Number 4',x:-10,wall:'renderBlue',trim:'stone'},
  {name:'Number 6',x:10,wall:'brickBrown',trim:'renderCream'},
  {name:'Number 8',x:30,wall:'renderGreen',trim:'stone'},
];

function buildScene(baseScene){
  const scene=baseScene||{version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}};
  // The blank template ships a small default ground plane; the city floor below
  // replaces it entirely.
  scene.added=(scene.added||[]).filter(entry=>!(entry&&entry.name==='Ground'&&entry.asset&&entry.asset.source==='Editor primitive'));

  let seq=0;
  function nextId(){return 'cat_city_'+String(++seq).padStart(3,'0');}

  // `spec` is a material class name, or a raw colour for the handful of one-off
  // accents that do not deserve a class. An unknown class name THROWS rather
  // than falling back: a silent fallback turns a typo into a piece of concrete
  // somewhere in three hundred objects, and this file runs under the node
  // tests, so the throw is caught before it ships.
  function resolveMaterial(spec){
    if(typeof spec==='number')return {color:spec,roughness:.92,metalness:0};
    if(typeof spec==='string'&&MAT[spec])return MAT[spec];
    throw new Error('Cat level template: unknown material class "'+spec+'"');
  }
  function add(name,prim,position,scale,spec,collide,options){
    const opts=options||{},mat=resolveMaterial(spec);
    const props=Object.assign({color:mat.color,roughness:mat.roughness==null?.92:mat.roughness,metalness:mat.metalness==null?0:mat.metalness,centered:true},opts.props||{});
    // Geometry that cannot contribute a visible shadow says so, and stops being
    // redrawn into the shadow map every frame.
    if(opts.castShadow===false)props.castShadow=false;
    if(mat.surface&&props.materialModel!=='unlit'&&opts.surfaceTexture!==false){
      props.surfaceTexture=Object.assign({kind:mat.surface,tile:mat.tile||2},
        opts.seed!=null?{seed:Math.abs(Math.round(opts.seed))%SURFACE_VARIANTS}:null,opts.surfaceTexture||null);
    }
    scene.added.push({
      id:nextId(),kind:'primitive',prim,name,collide:collide===true,
      driveSurface:opts.driveSurface===true,
      // Material underfoot, read by the Sound Set for footsteps. Derived from
      // the material class, so paws on a fire escape sound like steel without
      // anyone remembering to say so per object.
      surface:opts.surface||mat.foot||undefined,
      props,
      t:{p:position.slice(),r:(opts.rotation||[0,0,0]).slice(),s:scale.slice(),v:opts.visible!==false},
      asset:{key:'primitive:'+prim,name,source:SOURCE},
      templateGroup:opts.group||GROUP.ground,
    });
  }
  // Primitive scales are half-extents for a box and radii for the round
  // primitives. Authoring in metres keeps the numbers readable and matches what
  // the inspector shows as size.
  function box(name,position,size,spec,collide,options){add(name,'box',position,[size[0]/2,size[1]/2,size[2]/2],spec,collide===true,options);}
  function plane(name,position,width,depth,spec,options){add(name,'plane',position,[width/4,1,depth/4],spec,false,options);}
  function cylinder(name,position,radius,height,spec,collide,options){add(name,'cylinder',position,[radius,height/2,radius],spec,collide,options);}
  function cone(name,position,radius,height,spec,collide,options){add(name,'cone',position,[radius,height/2,radius],spec,collide,options);}
  // PRIM_DEFS.sphere is SphereGeometry(1.2), so authoring a radius means
  // dividing by that base; passing the radius straight in drew tree crowns the
  // size of houses.
  function sphere(name,position,radius,spec,collide,options){const s=radius/1.2;add(name,'sphere',position,[s,s,s],spec,collide,options);}
  // TorusGeometry(1.4,.4) scaled uniformly: the visible OUTER radius is 1.8x it.
  function ring(name,position,outerRadius,spec,options){const s=outerRadius/1.8;add(name,'torus',position,[s,s,s],spec,false,options);}
  // Emissive-looking surfaces (lamp lenses, neon, screens) use the unlit
  // material so they stay bright regardless of the scene lighting, at no
  // lighting cost at all.
  function glow(name,position,size,color,options){
    box(name,position,size,color,false,Object.assign({castShadow:false},options,{props:Object.assign({materialModel:'unlit'},(options||{}).props||{})}));
  }
  // Ground decals. Every flat thing on the floor takes its height from this
  // ladder rather than a hand-picked epsilon, which is the only way a level with
  // dozens of overlapping ground planes does not z-fight somewhere. Later in
  // the list means higher, so it wins.
  const DECAL_LAYER={wear:.004,apron:.008,paint:.014,stain:.02,marking:.026};
  function decal(name,x,z,width,depth,spec,layer,options){
    plane(name,[x,GROUND_Y+(DECAL_LAYER[layer]||DECAL_LAYER.wear),z],width,depth,spec,Object.assign({castShadow:false},options));
  }
  function light(name,position,props,group){
    scene.added.push({
      id:nextId(),kind:'light',light:'point',name,
      // Light colours are numeric: the store applies them with Color.setHex, so
      // a CSS string floors to NaN and every fixture renders black.
      props:Object.assign({color:COLOR.lampGlow,intensity:520,intensityUnit:'candela',distance:26},props||{}),
      t:{p:position.slice(),r:[0,0,0],s:[1,1,1],v:true},
      templateGroup:group||GROUP.dressing,
    });
  }
  function placeTrigger(id,name,position,descriptor,visuals){
    scene.added.push({id,kind:'logicElement',name,collide:false,graph:triggerGraph(name,descriptor,visuals),enabled:true,runInEditorPreview:true,
      asset:{key:'logic:cat-adventure:'+descriptor.kind,name,source:SOURCE},t:{p:position.slice(),r:[0,0,0],s:[1,1,1],v:true},templateGroup:GROUP.triggers});
  }
  /** An objective read: a ground ring plus a soft beacon, so the player can find
   *  it from a rooftop on the other side of the block. */
  function marker(name,x,y,z,color,group){
    ring(name+' Ring',[x,y+.10,z],1.05,color,{rotation:[Math.PI/2,0,0],group,props:{materialModel:'unlit'}});
    glow(name+' Beacon',[x,y+1.15,z],[.10,2.1,.10],color,{group});
  }

  // ============================================================ 06 zone build

  buildGroundAndStreets();
  buildHomeAlley();
  buildFireEscape();
  buildRooftopHighway();
  buildTerraceRow();
  buildMarketSquare();
  buildBackyards();
  buildCatRuns();
  buildSignageAndLighting();

  // ---------------------------------------------------- 01 ground and streets

  function buildGroundAndStreets(){
    const g=GROUP.ground,half=CITY_HALF;
    box('City Foundation',[0,-.5,0],[half*2,1,half*2],'concrete',true,{group:g,castShadow:false});
    box('Main Street',[0,LEVEL.street+.06,0],[half*2,.12,STREET_HALF_Z*2],'asphalt',true,{group:g,driveSurface:true,castShadow:false});
    [[7.4,'North'],[-7.4,'South']].forEach(entry=>{
      box(entry[1]+' Pavement',[0,rung('kerb')*.5,entry[0]],[half*2,rung('kerb'),3.6],'concrete',true,{group:g,castShadow:false});
      box(entry[1]+' Kerb',[0,rung('kerb')*.5,entry[0]<0?-5.7:5.7],[half*2,rung('kerb')+.02,.4],'concreteLight',true,{group:g});
    });
    for(let index=-6;index<=6;index++) decal('Centre Line '+(index+7),index*6,0,3.2,.16,'paintWhite','paint',{group:g});
    for(let index=0;index<6;index++) decal('Crossing Stripe '+(index+1),-14+index*1.5,0,.62,STREET_HALF_Z*2,'paintWhite','paint',{group:g});
    [[-26,-3.1],[9,2.6],[30,-2.2]].forEach((spot,index)=>{
      decal('Puddle '+(index+1)+' Rim',spot[0],spot[1],3.6,2.4,'asphaltWorn','wear',{group:g,seed:index});
      decal('Puddle '+(index+1),spot[0],spot[1],2.6,1.6,'puddle','stain',{group:g});
    });
    [[-18,4.2],[4,-4.4],[24,4.2]].forEach((spot,index)=>decal('Drain Cover '+(index+1),spot[0],spot[1],.9,.9,'drain','marking',{group:g}));
    // Cobbled market apron, alley tarmac and yard soil, so the block is not one
    // flat texture from wall to wall.
    decal('Market Apron',12,-20,42,22,'cobble','apron',{group:g});
    decal('Alley Apron',-30,-19,17,24,'asphaltWorn','apron',{group:g,seed:1});
    decal('Yard Soil',0,32,84,20,'soil','apron',{group:g,seed:2});
  }

  // ---------------------------------------------------------- 02 home alley
  //
  // The spawn. Everything the cat needs to learn its verbs is within ten metres:
  // something to jump on (crates), something to jump to (bin lids), something to
  // squeeze past (the flap), something to balance on (the washing line) and one
  // cardboard box to sit in.

  function buildHomeAlley(){
    const g=GROUP.alley,z0=-30,z1=-8,zc=(z0+z1)/2,depth=z1-z0;
    box('Alley West Wall',[-38.5,3.2,zc],[1.2,6.4,depth],'brickBrown',true,{group:g,seed:1});
    box('Alley East Wall',[-22.5,4.1,zc],[1.2,8.2,depth],'brickRed',true,{group:g,seed:2});
    box('Alley Back Wall',[-30.5,3.6,z0-.6],[15,7.2,1.2],'brickBrown',true,{group:g});
    box('Alley Floor',[-30.5,.05,zc],[15,.10,depth],'asphaltWorn',true,{group:g,castShadow:false});

    // L2: three wheelie bins. Their lids are the first thing a cat jumps on.
    [-27.5,-29.6,-31.7].forEach((x,index)=>{
      box('Wheelie Bin '+(index+1),[x,rung('crate')*.5,-11.4],[1.55,rung('crate'),1.35],index%2?'tarpGreen':'steelDark',true,{group:g,seed:index});
      box('Wheelie Bin '+(index+1)+' Lid',[x,rung('crate')+.06,-11.4],[1.62,.12,1.42],'ironBlack',true,{group:g});
    });
    // L3: the dumpster. From a bin lid it is one jump; from the ground it is a
    // climb. The first real choice the level offers.
    box('Alley Dumpster',[-25.6,rung('dumpster')*.5,-16.5],[2.5,rung('dumpster'),1.9],'copper',true,{group:g});
    box('Alley Dumpster Lid',[-25.6,rung('dumpster')+.07,-16.5],[2.62,.14,2.0],'steelDark',true,{group:g});
    // Crate stack: the redundant route, for a player who never finds the bins.
    [[-35.5,.45,-14.2,.9],[-35.5,1.32,-14.2,.84],[-34.3,.42,-15.6,.84]].forEach((crateSpec,index)=>{
      box('Alley Crate '+(index+1),[crateSpec[0],crateSpec[1],crateSpec[2]],[crateSpec[3],crateSpec[3],crateSpec[3]],'crate',true,{group:g,seed:index,rotation:[0,index*.4,0]});
    });
    box('Leaning Pallet',[-36.6,.8,-19.5],[1.4,.14,2.2],'woodPale',true,{group:g,rotation:[0,0,-.95]});
    box('Cardboard Box',[-33.2,.3,-24.5],[1.1,.6,1.1],'cardboard',true,{group:g});
    box('Cardboard Box Flap',[-33.2,.62,-25.2],[1.1,.05,.75],'cardboard',false,{group:g,rotation:[-.7,0,0]});
    // L4: the wall-top run, reached from the dumpster lid.
    box('Alley Wall Ledge',[-22.5,rung('wall')+.1,-24],[1.6,.2,10],'stone',true,{group:g});
    // The washing line: the level's tutorial for narrow-surface balance.
    [-24.4,-36.4].forEach((x,index)=>cylinder('Washing Post '+(index+1),[x,1.6,-27.5],.08,3.2,'ironBlack',true,{group:g}));
    box('Washing Line',[-30.4,3.18,-27.5],[12,.06,.06],'ironBlack',true,{group:g});
    [['sheetWhite',-27.4],['sheetTan',-30.4],['sheetBlue',-33.4]].forEach((sheet,index)=>
      box('Hanging Sheet '+(index+1),[sheet[1],2.55,-27.5],[1.5,1.2,.05],sheet[0],false,{group:g}));
    box('Bin Bag Pile',[-28.2,.35,-21.5],[1.6,.7,1.3],'ironBlack',true,{group:g});
    box('Alley Door',[-22.0,1.05,-9.8],[.16,2.1,1.2],'woodWarm',true,{group:g});
    box('Cat Flap',[-21.9,.22,-9.8],[.10,.44,.44],'ironBlack',false,{group:g});
  }

  // ------------------------------------------------------ 03 fire escape run
  //
  // The on-ramp to the roofs, and deliberately the only unbroken vertical chain
  // in the level, so a lost player who looks up always finds the same answer.

  function buildFireEscape(){
    const g=GROUP.fireEscape,wallX=-22.5,mid=(rung('landing')+rung('roof'))/2;
    // L4: the air-conditioning unit bolted to the wall, above the dumpster.
    box('AC Condenser',[wallX-1.5,rung('wall')-.55,-16.5],[1.7,1.1,1.3],'zinc',true,{group:g});
    box('AC Condenser Bracket',[wallX-.7,rung('wall')-1.2,-16.5],[.5,.14,1.3],'steelDark',true,{group:g});
    // L5 and the half-rung above it.
    box('Fire Escape Landing 1',[wallX-1.9,rung('landing'),-18.4],[3.4,.16,2.6],'tread',true,{group:g});
    box('Fire Escape Landing 2',[wallX-1.9,mid,-22.6],[3.4,.16,2.6],'tread',true,{group:g});
    // Cut steps rather than a ramp: a quadruped reads discrete treads far better
    // than a slope, and every one is inside the jump budget.
    for(let index=0;index<4;index++){
      const t=(index+1)/5;
      box('Fire Escape Step '+(index+1),[wallX-1.9,rung('landing')+(mid-rung('landing'))*t,-19.2-index*.8],[2.6,.12,.8],'tread',true,{group:g});
      box('Fire Escape Upper Step '+(index+1),[wallX-1.9,mid+(rung('roof')-mid)*t,-23.4-index*.8],[2.6,.12,.8],'tread',true,{group:g});
    }
    // Railings double as balance beams: narrow, collidable, and at head height
    // for anything larger than a cat.
    [[-18.4,rung('landing')],[-22.6,mid]].forEach((landing,index)=>{
      box('Fire Escape Rail '+(index+1),[wallX-3.5,landing[1]+.55,landing[0]],[.1,.1,2.6],'rust',true,{group:g});
      [-1.2,1.2].forEach((offset,post)=>cylinder('Fire Escape Post '+(index+1)+'-'+(post+1),[wallX-3.5,landing[1]+.3,landing[0]+offset],.05,.6,'rust',true,{group:g}));
    });
    cylinder('Fire Escape Drainpipe',[wallX-.9,rung('roof')*.5,-27.6],.13,rung('roof'),'rust',true,{group:g});
    box('Roof Access Lip',[wallX-2,rung('roof')-.15,-26.2],[3.4,.3,1.6],'zinc',true,{group:g});
  }

  // ------------------------------------------------------ 04 rooftop highway
  //
  // The reward for climbing, and the fastest route across the block. Parapets
  // everywhere: a cat on a roof should always have a ledge it can walk.

  function buildRooftopHighway(){
    const g=GROUP.roofs,y=rung('roof');
    box('Alley Roof',[-30.5,y-.2,-19],[16.6,.4,23],'roofFelt',true,{group:g,castShadow:false});
    [[-30.8,'South'],[-7.2,'North']].forEach(entry=>
      box('Alley Parapet '+entry[1],[-30.5,y+.25,entry[0]],[16.6,.5,.5],'stone',true,{group:g}));
    [[-38.6,'West'],[-22.4,'East']].forEach(entry=>
      box('Alley Parapet '+entry[1],[entry[0],y+.25,-19],[.5,.5,23],'stone',true,{group:g}));
    // Roof furniture: the platforming vocabulary Stray builds its cities from.
    box('Roof Vent Housing',[-34.5,y+.55,-14.5],[2.2,1.1,1.8],'corrugated',true,{group:g});
    cylinder('Roof Vent Cowl',[-34.5,y+1.4,-14.5],.45,.7,'zinc',true,{group:g});
    box('Roof Skylight Frame',[-27.5,y+.25,-22.5],[2.6,.5,2.6],'steelDark',true,{group:g});
    box('Roof Skylight Glass',[-27.5,y+.55,-22.5],[2.2,.08,2.2],'glass',false,{group:g});
    [[-36.5,-24.5],[-25.5,-11.5]].forEach((spot,index)=>{
      box('Roof Chimney '+(index+1),[spot[0],y+1.2,spot[1]],[1.3,2.4,1.3],'brickRed',true,{group:g,seed:index});
      box('Roof Chimney '+(index+1)+' Pot',[spot[0],y+2.6,spot[1]],[.7,.5,.7],'roofTile',true,{group:g});
    });
    // L7: the water tower, the highest perch and the best vantage in the level.
    [[-1.1,-1.1],[1.1,-1.1],[-1.1,1.1],[1.1,1.1]].forEach((leg,index)=>
      cylinder('Water Tower Leg '+(index+1),[-31+leg[0],y+(rung('tower')-y)*.5,-27+leg[1]],.12,rung('tower')-y,'rust',true,{group:g}));
    box('Water Tower Deck',[-31,rung('tower'),-27],[3.4,.2,3.4],'woodPale',true,{group:g});
    cylinder('Water Tower Tank',[-31,rung('tower')+1.3,-27],1.5,2.4,'woodWarm',true,{group:g});
    cone('Water Tower Cap',[-31,rung('tower')+2.9,-27],1.6,.9,'zinc',true,{group:g});
    // The plank bridge to the terrace roofs: the moment the level opens up.
    box('Roof Plank Bridge',[-26,y+.15,-4],[1.2,.14,12],'woodPale',true,{group:g});
    box('Roof Bridge Rail',[-26.7,y+.5,-4],[.09,.6,12],'rust',true,{group:g});
    // TV aerials: pure silhouette, no collision, no shadow, nearly free.
    [[-33.5,-18.5],[-28,-25]].forEach((spot,index)=>{
      cylinder('TV Aerial '+(index+1)+' Mast',[spot[0],y+1.1,spot[1]],.05,2.2,'ironBlack',false,{group:g,castShadow:false});
      for(let bar=0;bar<3;bar++) box('TV Aerial '+(index+1)+' Bar '+(bar+1),[spot[0],y+1.5+bar*.32,spot[1]],[1.4-bar*.3,.04,.04],'ironBlack',false,{group:g,castShadow:false});
    });
  }

  // ---------------------------------------------------------- 05 terrace row
  //
  // Four terraced houses north of the street. Every one carries the same ledge
  // grammar - step, awning, sill, sill, gutter, parapet - so the player learns
  // it once on Number 2 and it holds for the whole row.

  function buildTerraceRow(){
    const g=GROUP.terrace,zFront=10,depth=12,zc=zFront+depth/2,height=rung('roof')-.2;
    HOUSES.forEach((house,index)=>{
      const group=g+' / '+house.name,x=house.x,width=18.4;
      box(house.name+' Body',[x,height*.5,zc],[width,height,depth],house.wall,true,{group,seed:index});
      box(house.name+' Roof',[x,rung('roof')-.1,zc],[width+.4,.4,depth+.4],'roofFelt',true,{group,castShadow:false});
      // Parapet along the street edge only: the back stays open onto the yards,
      // so roofs and gardens are one connected space.
      box(house.name+' Parapet',[x,rung('roof')+.35,zFront-.1],[width+.4,.6,.5],'stone',true,{group});
      // Just under L6: the gutter, a narrow balance run along the whole row.
      box(house.name+' Gutter',[x,rung('roof')-.45,zFront-.35],[width,.22,.4],'zinc',true,{group});
      // L4: the door awning, reachable from the street furniture below.
      box(house.name+' Awning',[x,rung('wall'),zFront-.9],[4.6,.16,1.9],index%2?'awningRed':'awningStripe',true,{group});
      [-2.2,2.2].forEach((side,post)=>cylinder(house.name+' Awning Post '+(post+1),[x+side,rung('wall')*.5,zFront-1.7],.07,rung('wall'),'ironBlack',true,{group}));
      // Sills at two rungs: the intermediate holds up the facade.
      [[-5.4,rung('dumpster')],[5.4,rung('dumpster')],[-5.4,rung('landing')],[5.4,rung('landing')]].forEach((sill,slot)=>{
        box(house.name+' Sill '+(slot+1),[x+sill[0],sill[1],zFront-.28],[2.4,.18,.56],'stone',true,{group});
        box(house.name+' Window Frame '+(slot+1),[x+sill[0],sill[1]+.95,zFront-.06],[2.2,1.9,.08],house.trim,false,{group});
        box(house.name+' Window '+(slot+1),[x+sill[0],sill[1]+.95,zFront-.02],[2.0,1.7,.12],'glass',false,{group});
      });
      box(house.name+' Door',[x,1.1,zFront-.08],[1.5,2.2,.16],'woodWarm',true,{group});
      box(house.name+' Step',[x,.12,zFront-.75],[2.2,.24,1.2],'stone',true,{group});
      // Drainpipe: the honest way up the front of every house.
      cylinder(house.name+' Drainpipe',[x+width*.5-.4,rung('roof')*.5,zFront-.3],.12,rung('roof'),'zinc',true,{group});
      box(house.name+' Number Plate',[x,2.6,zFront-.1],[.5,.5,.06],'paintWhite',false,{group});
    });
  }

  // -------------------------------------------------------- 06 market square
  //
  // Human-scale clutter that happens to be a jungle gym: counters at jump
  // height, canopies at climb height, crates and barrels bridging the two.

  function buildMarketSquare(){
    const g=GROUP.market;
    const STALLS=[
      {name:'Fish Stall',x:2,z:-16,cloth:'awningRed'},
      {name:'Fruit Stall',x:12,z:-16,cloth:'awningStripe'},
      {name:'Flower Stall',x:22,z:-16,cloth:'tarpGreen'},
      {name:'Bread Stall',x:12,z:-25,cloth:'awningStripe'},
    ];
    STALLS.forEach((stall,index)=>{
      const group=g+' / '+stall.name;
      [[-1.9,-1.1],[1.9,-1.1],[-1.9,1.1],[1.9,1.1]].forEach((leg,post)=>
        cylinder(stall.name+' Leg '+(post+1),[stall.x+leg[0],rung('crate')*.5,stall.z+leg[1]],.07,rung('crate'),'ironBlack',true,{group}));
      box(stall.name+' Counter',[stall.x,rung('crate'),stall.z],[4.4,.16,2.6],'woodPale',true,{group,seed:index});
      box(stall.name+' Canopy',[stall.x,rung('wall'),stall.z],[5,.16,3.2],stall.cloth,true,{group});
      [-2.3,2.3].forEach((side,post)=>cylinder(stall.name+' Mast '+(post+1),[stall.x+side,(rung('crate')+rung('wall'))*.5,stall.z-1.4],.06,rung('wall')-rung('crate'),'ironBlack',true,{group}));
      box(stall.name+' Crate',[stall.x-2.6,.4,stall.z+1.9],[.8,.8,.8],'crate',true,{group,seed:index+1});
      box(stall.name+' Sign',[stall.x,rung('wall')+.45,stall.z-1.5],[2.4,.6,.08],'woodWarm',false,{group});
    });
    [[6.6,-20.5],[17.4,-21],[26,-18.5]].forEach((spot,index)=>{
      cylinder('Market Barrel '+(index+1),[spot[0],.55,spot[1]],.5,1.1,'woodWarm',true,{group:g,seed:index});
      cylinder('Market Barrel '+(index+1)+' Lid',[spot[0],1.13,spot[1]],.52,.08,'rust',true,{group:g});
    });
    box('Tarpaulin Pile',[26,rung('crate')*.5,-24],[3.2,rung('crate'),2.4],'tarpGreen',true,{group:g});
    box('Market Bench',[-4,.42,-22],[3.2,.16,.7],'woodWarm',true,{group:g});
    [-1.3,1.3].forEach((side,index)=>box('Market Bench Leg '+(index+1),[-4+side,.2,-22],[.14,.4,.6],'ironBlack',true,{group:g}));
    [[-2,-12],[20,-12],[30,-22]].forEach((spot,index)=>{
      box('Planter '+(index+1),[spot[0],.4,spot[1]],[2.2,.8,2.2],'stone',true,{group:g});
      sphere('Planter '+(index+1)+' Shrub',[spot[0],1.35,spot[1]],.9,index%2?'leaf':'leafDark',false,{group:g});
    });
    box('Market Notice Board',[32,1.5,-14],[.2,3,3.2],'woodWarm',true,{group:g});
  }

  // ------------------------------------------------------------ 07 backyards
  //
  // Behind the terrace: fences to walk, sheds to climb, and one tree that is a
  // complete alternative route to the roofs.

  function buildBackyards(){
    const g=GROUP.yards,zBack=22;
    // Fence line: panel to L3, rail on top. A cat walks the rail; anything
    // larger is stopped by the fence, which is exactly the point.
    for(let index=0;index<5;index++){
      const x=-36+index*18;
      box('Garden Fence '+(index+1),[x,rung('dumpster')*.5,zBack+4],[.24,rung('dumpster'),12],'woodPale',true,{group:g,seed:index});
      box('Garden Fence '+(index+1)+' Rail',[x,rung('dumpster')+.09,zBack+4],[.4,.18,12],'woodWarm',true,{group:g});
    }
    box('Yard Back Wall',[0,rung('wall')*.5,38],[CITY_HALF*2,rung('wall'),1],'brickBrown',true,{group:g,seed:3});
    box('Yard Wall Coping',[0,rung('wall')+.1,38],[CITY_HALF*2,.2,1.3],'stone',true,{group:g});
    [[-26,30,'Tool Shed'],[16,31,'Potting Shed']].forEach((shed,index)=>{
      box(shed[2],[shed[0],rung('dumpster')*.5+.2,shed[1]],[4.4,rung('dumpster')+.4,3.4],'woodWarm',true,{group:g,seed:index});
      box(shed[2]+' Roof',[shed[0],rung('wall')-.55,shed[1]],[5,.18,4],'corrugated',true,{group:g});
      box(shed[2]+' Water Butt',[shed[0]+2.9,.7,shed[1]-1.2],[1.2,1.4,1.2],'tarpGreen',true,{group:g});
    });
    // The tree: trunk, three climbable branch stubs, two crowns. It reaches the
    // terrace roof, so a player who never finds the fire escape still gets up.
    const treeX=-4,treeZ=31;
    cylinder('Yard Tree Trunk',[treeX,rung('wall'),treeZ],.42,rung('wall')*2,'bark',true,{group:g});
    box('Yard Tree Branch 1',[treeX+1.5,rung('dumpster')+.6,treeZ],[3.2,.3,.36],'bark',true,{group:g,rotation:[0,.3,.12]});
    box('Yard Tree Branch 2',[treeX-1.6,rung('wall')+1.1,treeZ-.6],[3.4,.3,.36],'bark',true,{group:g,rotation:[0,-.4,-.10]});
    box('Yard Tree Branch 3',[treeX+.6,rung('roof')-.5,treeZ-1.8],[2.6,.28,.34],'bark',true,{group:g,rotation:[0,1.2,.08]});
    sphere('Yard Tree Crown Low',[treeX,rung('roof')-.2,treeZ],2.9,'leafDark',false,{group:g});
    sphere('Yard Tree Crown High',[treeX+.8,rung('roof')+1.6,treeZ-.9],2.4,'leaf',false,{group:g});
    [[-32,26],[6,27],[28,26]].forEach((spot,index)=>decal('Lawn Patch '+(index+1),spot[0],spot[1],9,7,'grass','apron',{group:g,seed:index}));
    box('Yard Compost Bin',[-16,.55,27],[1.6,1.1,1.6],'woodPale',true,{group:g});
    [[34,28],[-38,29]].forEach((spot,index)=>{
      box('Yard Flower Pot '+(index+1),[spot[0],.35,spot[1]],[1,.7,1],'roofTile',true,{group:g});
      sphere('Yard Flower Pot '+(index+1)+' Plant',[spot[0],.95,spot[1]],.55,'leaf',false,{group:g});
    });
  }

  // ---------------------------------------------------- 08 cat-only passages
  //
  // The promise of the whole genre: routes a human-sized body could never take.
  // Every one of these is under 70 cm in at least one dimension.

  function buildCatRuns(){
    const g=GROUP.catRuns;
    [[-14,-6.6,'South'],[-14,6.6,'North']].forEach(mouth=>{
      cylinder('Drain Mouth '+mouth[2],[mouth[0],.34,mouth[1]],.62,.9,'drain',false,{group:g,rotation:[Math.PI/2,0,0]});
      box('Drain Mouth '+mouth[2]+' Surround',[mouth[0],.30,mouth[1]],[1.9,.6,.5],'stone',true,{group:g});
    });
    // The wall pipe run: a 24 cm cylinder along the alley wall at L5, the
    // narrowest balance surface in the level.
    cylinder('Alley Wall Pipe',[-21.6,rung('landing')+.4,-19],.12,22,'rust',true,{group:g,rotation:[Math.PI/2,0,0]});
    [-27,-13].forEach((z,index)=>cylinder('Alley Pipe Bracket '+(index+1),[-22.1,rung('landing')+.4,z],.06,.9,'steelDark',true,{group:g,rotation:[0,0,Math.PI/2]}));
    // Roof ducting: a low run a cat walks along and a person would crawl under.
    for(let index=0;index<4;index++){
      box('Roof Duct '+(index+1),[-30.5,rung('roof')+.42,-12+index*2.4],[2.4,.84,2.2],'corrugated',true,{group:g,seed:index});
    }
    box('Roof Duct Lid',[-30.5,rung('roof')+.9,-7],[2.6,.14,3.4],'zinc',true,{group:g});
    // Squeeze gaps: paired wall stubs leaving a 60 cm slot under a lintel.
    [[-12,12.4,'Terrace Gap West'],[20,12.4,'Terrace Gap East']].forEach((gap,index)=>{
      [-1.4,1.4].forEach((side,post)=>box(gap[2]+' Stub '+(post+1),[gap[0]+side,1.4,gap[1]],[2.2,2.8,.5],'brickBrown',true,{group:g,seed:index}));
      box(gap[2]+' Lintel',[gap[0],2.4,gap[1]],[3.2,.8,.5],'stone',true,{group:g});
    });
    // Under-fence gaps: the panel stops short and a cat slips beneath it.
    [-18,10].forEach((x,index)=>box('Fence Gap Panel '+(index+1),[x,rung('dumpster')*.5+.5,26],[3.2,rung('dumpster'),.24],'woodPale',true,{group:g}));
  }

  // ------------------------------------------------- 09 signage and lighting
  //
  // Four point lights, no more: this level has to hold 60 fps on an integrated
  // GPU, and every extra fixture is another shadow pass. Everything else that
  // reads as "lit" is an unlit box, which costs nothing.

  function buildSignageAndLighting(){
    const g=GROUP.dressing;
    [[-20,7.6],[8,7.6],[32,-7.6]].forEach((spot,index)=>{
      const armSide=spot[1]>0?-1:1;
      cylinder('Street Lamp '+(index+1)+' Column',[spot[0],2.6,spot[1]],.11,5.2,'ironBlack',true,{group:g});
      box('Street Lamp '+(index+1)+' Arm',[spot[0]+armSide*.7,5.15,spot[1]],[1.6,.12,.12],'ironBlack',false,{group:g});
      glow('Street Lamp '+(index+1)+' Lens',[spot[0]+armSide*1.3,5.0,spot[1]],[.5,.24,.5],COLOR.lampGlow,{group:g});
      light('Street Lamp '+(index+1)+' Light',[spot[0]+armSide*1.3,4.8,spot[1]],{intensity:600,distance:24},g);
    });
    light('Alley Wall Light',[-24,3.4,-13],{intensity:320,distance:16},g);
    glow('Alley Wall Lamp',[-23.6,3.5,-13],[.34,.5,.34],COLOR.lampGlow,{group:g});
    glow('Neon Sign Fish',[2,rung('wall')+1.4,-14.2],[3.4,.7,.12],COLOR.neonPink,{group:g});
    glow('Neon Sign Open',[22,rung('wall')+1.4,-14.2],[2.4,.6,.12],COLOR.neonCyan,{group:g});
    // Hanging shop signs off the terrace: cat-height obstacles from the awnings.
    HOUSES.forEach(house=>{
      box(house.name+' Hanging Sign',[house.x+6.6,rung('wall')-.6,9.2],[.1,1.1,1.8],'woodWarm',false,{group:g});
      box(house.name+' Sign Bracket',[house.x+6.6,rung('wall')+.05,9.7],[.08,.08,1.3],'ironBlack',false,{group:g});
    });
    box('Street Name Sign',[-7.4,2.4,6.2],[2.6,.5,.08],'paintWhite',false,{group:g});
  }

  // ====================================================== 07 gameplay triggers
  //
  // Placed after the geometry so their coordinates can quote the same height
  // ladder the level was built from. Visuals are ordinary logicScene elements:
  // an author can reshape any of them without touching this file.

  const MOUSE_VISUAL=[
    {id:'mouse_body',name:'Editable Mouse Body',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[0,.14,0],rotation:[0,0,0],scale:[.19,.15,.30],color:'#8b7466'},
    {id:'mouse_head',name:'Editable Mouse Head',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[0,.16,.24],rotation:[0,0,0],scale:[.13,.12,.14],color:'#a18a78'},
    {id:'mouse_ear_l',name:'Editable Mouse Ear L',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[-.07,.24,.22],rotation:[0,0,0],scale:[.07,.08,.03],color:'#c39c96'},
    {id:'mouse_ear_r',name:'Editable Mouse Ear R',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[.07,.24,.22],rotation:[0,0,0],scale:[.07,.08,.03],color:'#c39c96'},
    {id:'mouse_tail',name:'Editable Mouse Tail',type:'mesh',primitive:'cylinder',parentId:'root',linked:true,position:[0,.12,-.26],rotation:[1.35,0,0],scale:[.03,.34,.03],color:'#c39c96'},
  ];
  const DOG_VISUAL=[
    {id:'dog_body',name:'Editable Dog Body',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[0,.52,0],rotation:[0,0,0],scale:[.30,.30,.52],color:'#7c4f35'},
    {id:'dog_head',name:'Editable Dog Head',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[0,.72,.52],rotation:[0,0,0],scale:[.24,.23,.26],color:'#8f6243'},
    {id:'dog_muzzle',name:'Editable Dog Muzzle',type:'mesh',primitive:'box',parentId:'root',linked:true,position:[0,.66,.76],rotation:[0,0,0],scale:[.16,.14,.22],color:'#5d4230'},
    {id:'dog_leg_fl',name:'Editable Dog Leg FL',type:'mesh',primitive:'cylinder',parentId:'root',linked:true,position:[-.17,.26,.28],rotation:[0,0,0],scale:[.09,.52,.09],color:'#6d452e'},
    {id:'dog_leg_fr',name:'Editable Dog Leg FR',type:'mesh',primitive:'cylinder',parentId:'root',linked:true,position:[.17,.26,.28],rotation:[0,0,0],scale:[.09,.52,.09],color:'#6d452e'},
    {id:'dog_leg_bl',name:'Editable Dog Leg BL',type:'mesh',primitive:'cylinder',parentId:'root',linked:true,position:[-.17,.26,-.28],rotation:[0,0,0],scale:[.09,.52,.09],color:'#6d452e'},
    {id:'dog_leg_br',name:'Editable Dog Leg BR',type:'mesh',primitive:'cylinder',parentId:'root',linked:true,position:[.17,.26,-.28],rotation:[0,0,0],scale:[.09,.52,.09],color:'#6d452e'},
  ];
  const HUMAN_VISUAL=[
    {id:'human_legs',name:'Editable Human Legs',type:'mesh',primitive:'cylinder',parentId:'root',linked:true,position:[0,.42,0],rotation:[0,0,0],scale:[.20,.92,.20],color:'#3f4a5c'},
    {id:'human_torso',name:'Editable Human Torso',type:'mesh',primitive:'cylinder',parentId:'root',linked:true,position:[0,1.20,0],rotation:[0,0,0],scale:[.24,.78,.20],color:'#a78bfa'},
    {id:'human_head',name:'Editable Human Head',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[0,1.72,0],rotation:[0,0,0],scale:[.19,.21,.19],color:'#d8b092'},
  ];
  function carVisual(color){
    return [
      {id:'traffic_body',name:'Editable Traffic Car Body',type:'mesh',primitive:'box',parentId:'root',linked:true,position:[0,.55,0],rotation:[0,0,0],scale:[1.9,.42,.85],color},
      {id:'traffic_cabin',name:'Editable Traffic Car Cabin',type:'mesh',primitive:'box',parentId:'root',linked:true,position:[-.2,1.05,0],rotation:[0,0,0],scale:[1.0,.32,.78],color:'#2c3a44'},
    ];
  }
  function tokenVisual(color){
    return [{id:'token_body',name:'Editable Rooftop Find',type:'mesh',primitive:'torus',parentId:'root',linked:true,position:[0,.3,0],rotation:[1.5708,0,0],scale:[.5,.5,.5],color}];
  }

  // -- 07.1 prey: two mice, one in the alley and one on the market apron.
  [{id:'cat_mouse_alley',name:'Chase Mouse · Home Alley',p:[-29,0,-22]},
   {id:'cat_mouse_market',name:'Chase Mouse · Market Square',p:[14,0,-21]}]
    .forEach(mouse=>placeTrigger(mouse.id,mouse.name,mouse.p,{kind:'mouse',tag:'mouse',radius:2,chaseRadius:7,collectRadius:.8,speed:2.9},MOUSE_VISUAL));

  // -- 07.2 rooftop finds: the optional exploration objective, one per rooftop
  //    landmark, so collecting them all is a guided tour of the vertical space.
  const TOKENS=[
    {id:'cat_token_water_tower',name:'Rooftop Find · Water Tower',p:[-31,rung('tower')+.6,-27]},
    {id:'cat_token_chimney',name:'Rooftop Find · Chimney Stack',p:[-36.5,rung('roof')+.8,-24.5]},
    {id:'cat_token_bridge',name:'Rooftop Find · Plank Bridge',p:[-26,rung('roof')+.7,-4]},
    {id:'cat_token_terrace',name:'Rooftop Find · Terrace Ridge',p:[10,rung('roof')+.7,16]},
  ];
  TOKENS.forEach(token=>{
    placeTrigger(token.id,token.name,token.p,{kind:'token',tag:'roof-token',radius:1.5,collectRadius:1.5,speed:0},tokenVisual('#8ad6ff'));
    marker(token.name,token.p[0],token.p[1],token.p[2],COLOR.markToken,GROUP.triggers);
  });

  // -- 07.3 the delivery: take the parcel at the market, leave it on the
  //    doorstep of Number 6. Two triggers sharing one carry state.
  const DELIVERY_PICKUP={x:12,y:rung('crate')+.3,z:-25};
  const DELIVERY_DROP={x:10,y:0,z:8.6};
  placeTrigger('cat_delivery_pickup','Delivery · Take the Parcel',[DELIVERY_PICKUP.x,DELIVERY_PICKUP.y,DELIVERY_PICKUP.z],
    {kind:'delivery',stage:'pickup',parcel:'parcel',tag:'delivery-pickup',radius:1.4,speed:0},
    [{id:'parcel_body',name:'Editable Parcel',type:'mesh',primitive:'box',parentId:'root',linked:true,position:[0,.18,0],rotation:[0,.4,0],scale:[.34,.28,.34],color:'#c8a06a'},
     {id:'parcel_string',name:'Editable Parcel String',type:'mesh',primitive:'box',parentId:'root',linked:true,position:[0,.34,0],rotation:[0,.4,0],scale:[.36,.02,.06],color:'#5d4230'}]);
  placeTrigger('cat_delivery_drop','Delivery · Doorstep of Number 6',[DELIVERY_DROP.x,DELIVERY_DROP.y,DELIVERY_DROP.z],
    {kind:'delivery',stage:'drop',parcel:'parcel',tag:'delivery-drop',radius:2.2,speed:0},
    [{id:'drop_mat',name:'Editable Door Mat',type:'mesh',primitive:'box',parentId:'root',linked:true,position:[0,.05,0],rotation:[0,0,0],scale:[.9,.06,.6],color:'#6b5a44'}]);
  marker('Delivery Pickup',DELIVERY_PICKUP.x,DELIVERY_PICKUP.y,DELIVERY_PICKUP.z,COLOR.markDelivery,GROUP.triggers);
  marker('Delivery Doorstep',DELIVERY_DROP.x,DELIVERY_DROP.y,DELIVERY_DROP.z,COLOR.markDelivery,GROUP.triggers);

  // -- 07.4 the humans: one friendly neighbour, one family reunion at home.
  const FRIENDLY={x:-6,y:0,z:8.2};
  const HOME={x:-30,y:0,z:8.6};
  placeTrigger('cat_friendly_stop','Friendly Neighbour Stop',[FRIENDLY.x,FRIENDLY.y,FRIENDLY.z],{kind:'friendly',tag:'friendly-stop',radius:2.8,speed:0},HUMAN_VISUAL);
  marker('Friendly Neighbour',FRIENDLY.x,FRIENDLY.y,FRIENDLY.z,COLOR.markFriendly,GROUP.triggers);
  placeTrigger('cat_family_reward','Cat Family Reunion',[HOME.x,HOME.y,HOME.z],{kind:'family',tag:'family-reward',radius:3,speed:0},[
    {id:'family_a',name:'Cat Family Placeholder A',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[-.45,.24,0],rotation:[0,0,0],scale:[.24,.22,.36],color:'#d1a477'},
    {id:'family_b',name:'Cat Family Placeholder B',type:'mesh',primitive:'sphere',parentId:'root',linked:true,position:[.45,.24,0],rotation:[0,0,0],scale:[.24,.22,.36],color:'#6c7585'},
  ]);
  box('Cat Bed',[HOME.x,.12,HOME.z],[1.8,.24,1.4],'awningRed',false,{group:GROUP.triggers});
  marker('Home Doorstep',HOME.x,HOME.y,HOME.z,COLOR.markHome,GROUP.triggers);

  // -- 07.5 hazards: the dog patrols the yards, the traffic owns the street.
  placeTrigger('cat_dog_patrol','Dog Patrol · Backyards',[18,0,28],{kind:'dog',tag:'dog-alert',radius:5,speed:2.4,
    route:[{x:18,z:28},{x:-8,z:28},{x:-8,z:34},{x:18,z:34}]},DOG_VISUAL);
  placeTrigger('cat_traffic_east','Traffic Hazard · Eastbound Car',[-CITY_HALF,.55,-2.6],{kind:'traffic',tag:'traffic-hit',radius:2.2,speed:8,
    route:[{x:-CITY_HALF,z:-2.6},{x:CITY_HALF,z:-2.6}]},carVisual('#b6544c'));
  placeTrigger('cat_traffic_west','Traffic Hazard · Westbound Van',[CITY_HALF,.55,2.6],{kind:'traffic',tag:'traffic-hit',radius:2.4,speed:6.4,
    route:[{x:CITY_HALF,z:2.6},{x:-CITY_HALF,z:2.6}]},carVisual('#4c7aa3'));

  // ============================================================ 08 player pawn

  const SPAWN={x:-30,y:0,z:-13,heading:0};
  const templates=root.LK_LOGIC_TEMPLATES,catTemplate=templates&&templates.get&&templates.get('logic-template-player-animal-cat');
  if(catTemplate&&catTemplate.graph){
    const graph=clone(catTemplate.graph);
    graph.name='Gutter Lane Cat';
    graph.animalPawn.id='neighborhood-cat';
    graph.animalPawn.spawn=clone(SPAWN);
    // Tuned for a 30 cm quadruped in a dense block: quick rather than fast, with
    // a jump that matches the height ladder in section 03 exactly.
    graph.animalPawn.movement=Object.assign({},graph.animalPawn.movement,{walkSpeed:1.5,runSpeed:6.6,sprintMultiplier:1.22,jumpHeight:1.15,acceleration:19,turnRate:14,stepHeight:.30});
    graph.animalPawn.trotSpeed=3.0;
    // Camera for a body whose eyeline is 25 cm off the ground: close, low and
    // only slightly above, the way Stray frames its cat. A distant, high camera
    // turns any quadruped into a beetle.
    graph.animalPawn.camera=Object.assign({},graph.animalPawn.camera,{mode:'free',view:'third',distance:3.4,height:1.05,lag:9,fov:70});
    graph.animalPawn.appearance=Object.assign({},graph.animalPawn.appearance,{furColor:'#8c7d6a',bellyColor:'#e6ddcb',accentColor:'#3a332b',eyeColor:'#c9dc55',skinColor:'#d98c93'});
    graph.animalPawn.abilities=Object.assign({},graph.animalPawn.abilities,{
      cat:Object.assign({},graph.animalPawn.abilities&&graph.animalPawn.abilities.cat,{
        // climbMaxHeight is deliberately one rung gap: the ladder in section 03
        // was designed against this number, not the other way round.
        climbMaxHeight:MAX_RUNG_GAP,climbReach:.52,climbSpeed:2.1,
        pounceSpeed:8.4,pounceDuration:.55,stealthMultiplier:.40,
        ledgeBalanceDuration:.9,fallRecoveryDrop:1.4,fallRecoveryDuration:.30,
      }),
    });
    setVariables(graph,{
      ControllerPlayerId:1,SpawnX:SPAWN.x,SpawnY:SPAWN.y,SpawnZ:SPAWN.z,SpawnHeading:SPAWN.heading,
      WalkSpeed:1.5,TrotSpeed:3.0,RunSpeed:6.6,JumpHeight:1.15,Acceleration:19,TurnRate:14,
      CameraDistance:3.4,CameraHeight:1.05,CameraLag:9,CameraFov:70,
      FurColor:'#8c7d6a',BellyColor:'#e6ddcb',AccentColor:'#3a332b',EyeColor:'#c9dc55',SkinColor:'#d98c93',
      CatClimbMaxHeight:MAX_RUNG_GAP,CatPounceSpeed:8.4,CatStealthMultiplier:.40,
    });
    scene.added.push({id:'cat_neighborhood_player',kind:'logicElement',name:'Cat Adventurer (replaceable GLB)',collide:false,graph,enabled:true,runInEditorPreview:true,
      asset:{key:'logic:template:logic-template-player-animal-cat',name:'Cat Adventurer',source:SOURCE},
      t:{p:[SPAWN.x,SPAWN.y,SPAWN.z],r:[0,SPAWN.heading,0],s:[1,1,1],v:true},templateGroup:GROUP.gameplay});
  }

  // ======================================================= 09 mission director
  //
  // Authored data, not code: the whole list is editable in the Inspector through
  // the shared Mission Director Logic Element. Order matters twice - the `order`
  // field drives the sequence flow, and the array order is what the HUD lists.

  const missions=root.LK_LOGIC_TEMPLATES_MISSION;
  if(missions&&missions.makeMissionGraph){
    const objectives=[
      {id:'mouse_hunt',title:'Hunt down both mice',description:'Crouch to stalk, then pounce.',
        kind:'collect',count:2,order:0,points:450,target:{tag:'mouse'}},
      {id:'up_to_the_roofs',title:'Find the way up to the rooftops',description:'Bins, dumpster, air-conditioner, fire escape.',
        kind:'reach',order:1,points:350,target:{radius:4,position:{x:-30.5,y:rung('roof'),z:-19}}},
      {id:'delivery_run',title:'Carry the parcel to the doorstep of Number 6',
        kind:'custom',order:2,points:400,target:{tag:'delivery-drop'}},
      {id:'friendly_stop',title:'Let the friendly neighbour say hello',
        kind:'custom',order:3,points:200,target:{tag:'friendly-stop'}},
      {id:'home_again',title:'Go home to the cat bed',
        kind:'reach',order:4,points:500,target:{radius:3.2,position:{x:HOME.x,y:HOME.y,z:HOME.z}}},
      {id:'rooftop_tour',title:'Bonus · Find all four rooftop treasures',
        kind:'collect',count:TOKENS.length,order:20,optional:true,points:600,target:{tag:'roof-token'}},
      {id:'nine_lives',title:'Bonus · Finish without waking the yard dog',
        kind:'avoid',order:21,optional:true,points:350,target:{tag:'dog-alert'}},
      {id:'street_smart',title:'Bonus · Cross the street without being clipped',
        kind:'avoid',order:22,optional:true,points:350,target:{tag:'traffic-hit'}},
    ];
    const graph=missions.makeMissionGraph({missionId:ID,title:'Nine Lives on Gutter Lane',
      subtitle:'Hunt the alley, run the roofs, make the delivery, get home',
      mode:'sequence',timeLimit:0,failOnTimeout:false,objectives});
    scene.added.push({id:'cat_neighborhood_mission',kind:'logicElement',name:'Cat Adventure Mission Director',collide:false,graph,enabled:true,runInEditorPreview:true,
      asset:{key:'logic:template:logic-template-mission-director',name:'Cat Adventure Mission Director',source:SOURCE},
      t:{p:[SPAWN.x,1,SPAWN.z-2],r:[0,0,0],s:[1,1,1],v:true},templateGroup:GROUP.gameplay});
  }

  // ============================================================= 11 world data

  scene.player=Object.assign({},scene.player||{},{enabled:false,hidden:true,controllerIndex:null,
    cam:Object.assign({},(scene.player||{}).cam||{},{fogDensity:.0035})});
  scene.characterGround={type:'flat',baseY:GROUND_Y,minX:-CITY_HALF,maxX:CITY_HALF,minZ:-CITY_HALF,maxZ:CITY_HALF};
  scene.env=Object.assign({},scene.env||{},{skyTime:.31,dayLength:999999,dayNightCycleEnabled:false,procEnvEnabled:true,procEnvIntensity:.88,backgroundColor:'#b3c4cf',
    rain:{enabled:false,intensity:0,sound:0},
    volClouds:{enabled:true,coverage:.38,density:.94,scale:1.06,detail:.58,speed:.5,windAngle:24,altitude:150,thickness:72,quality:12,absorption:1.02,opacity:.84,anvil:.2,resolutionScale:.58},
    weather:{type:'cumulus',intensity:.34,surface:'asphalt'}});
  scene.template={id:ID,name:NAME,version:3,nativeEditable:true,gameMode:'cat-adventure',objectiveSystem:true,
    catAdventureRuntime:true,animalPawn:'cat',replaceablePlayerGlb:true,
    heightLadder:Object.assign({},LEVEL),
    controls:{move:'WASD / left stick',run:'Shift',stalk:'Ctrl (crouch)',jump:'Space',climb:'E',pounce:'F',voice:'Q'}};
  return scene;
}

// ========================================================== 10 runtime system
//
// One handler per trigger kind, declared in the order the mission list meets
// them. An unknown kind THROWS: a trigger whose descriptor was mistyped has to
// surface as a broken level, not as a prop that silently does nothing all game.

function createCatAdventureSystem(GAME){
  const states=new Map();
  const carrying=new Set();     // parcel id -> the cat is holding it
  let sweepEpoch=0;

  function key(owner){return owner&&owner.userData&&(owner.userData.editorId||owner.userData.logicInstanceId)||owner&&owner.uuid||'';}
  function state(owner){
    const id=key(owner);let value=states.get(id);
    if(!value){value={done:false,alerted:false,routeIndex:0,cooldown:0,_seen:sweepEpoch};states.set(id,value);}
    value._seen=sweepEpoch;return value;
  }
  function settings(owner,descriptor){
    const variables=owner&&owner.userData&&owner.userData.logicGraph&&owner.userData.logicGraph.variables||[],out=Object.assign({},descriptor);
    variables.forEach(variable=>{
      if(variable.name==='TriggerEnabled')out.enabled=variable.value!==false;
      else if(variable.name==='TriggerRadius')out.radius=finite(variable.value,out.radius);
      else if(variable.name==='MoveSpeed')out.speed=finite(variable.value,out.speed);
    });
    return out;
  }
  function director(){return GAME&&GAME.systems&&GAME.systems.objectives;}
  function notify(kind,tag,amount){const value=director();return value&&value.notify?value.notify(kind,{tag,amount:amount==null?1:amount}):0;}
  /** Vertical separation counts, or a rooftop find could be collected by walking
   *  underneath it - the classic bug in a level that has floors. */
  function distanceTo(position,playerPosition){
    const dx=position.x-playerPosition.x,dz=position.z-playerPosition.z,dy=finite(position.y,0)-finite(playerPosition.y,0);
    return Math.sqrt(dx*dx+dz*dz+dy*dy*.85);
  }
  function moveRoute(owner,descriptor,record,dt){
    const route=descriptor.route;if(!(Array.isArray(route)&&route.length&&owner.position))return;
    const target=route[record.routeIndex%route.length]||{},
      dx=finite(target.x,owner.position.x)-owner.position.x,dz=finite(target.z,owner.position.z)-owner.position.z,
      distance=Math.sqrt(dx*dx+dz*dz);
    if(distance<.2){record.routeIndex=(record.routeIndex+1)%route.length;return;}
    const step=Math.min(distance,clamp(descriptor.speed,0,20)*dt);
    owner.position.x+=dx/distance*step;owner.position.z+=dz/distance*step;
    if(owner.rotation)owner.rotation.y=Math.atan2(dx,dz);
  }

  // -- 10.1 prey. The mouse flees while the cat is inside its chase radius and
  //    is caught inside the collect radius: the stalk/pounce loop, two lines.
  function stepMouse(owner,descriptor,record,playerPosition,dt){
    if(record.done||!owner.position)return;
    const dx=owner.position.x-playerPosition.x,dz=owner.position.z-playerPosition.z,distance=Math.sqrt(dx*dx+dz*dz);
    if(distance<=clamp(descriptor.collectRadius,.2,5)){
      record.done=true;owner.visible=false;notify('collect',descriptor.tag||'mouse',1);
      emitAdventure('OnMouseCollected',{objectId:key(owner),tag:descriptor.tag||'mouse'});return;
    }
    if(distance<=clamp(descriptor.chaseRadius,1,30)&&distance>.001){
      const step=clamp(descriptor.speed,0,12)*dt;
      owner.position.x=clamp(owner.position.x+dx/distance*step,-CITY_HALF+2,CITY_HALF-2);
      owner.position.z=clamp(owner.position.z+dz/distance*step,-CITY_HALF+2,CITY_HALF-2);
      if(owner.rotation)owner.rotation.y=Math.atan2(dx,dz);
      emitAdventure('OnMouseChased',{objectId:key(owner)});
    }
  }
  // -- 10.2 static rooftop collectibles.
  function stepToken(owner,descriptor,record,playerPosition){
    if(record.done)return;
    const position=positionOf(owner);if(!position)return;
    if(distanceTo(position,playerPosition)>clamp(descriptor.collectRadius,.3,8))return;
    record.done=true;if(owner.visible!=null)owner.visible=false;
    notify('collect',descriptor.tag||'roof-token',1);
    emitAdventure('OnRooftopFind',{objectId:key(owner),tag:descriptor.tag});
  }
  // -- 10.3 the two-stage delivery: take it at the market, leave it at the door.
  function stepDelivery(owner,descriptor,record,playerPosition){
    const position=positionOf(owner);if(!position)return;
    if(record.done||distanceTo(position,playerPosition)>clamp(descriptor.radius,.2,30))return;
    const parcel=descriptor.parcel||'parcel';
    if(descriptor.stage==='pickup'){
      record.done=true;carrying.add(parcel);if(owner.visible!=null)owner.visible=false;
      notify('custom',descriptor.tag||'delivery-pickup',1);
      emitAdventure('OnDeliveryTaken',{objectId:key(owner),tag:descriptor.tag});return;
    }
    // The drop only counts while the cat is actually carrying something.
    if(!carrying.has(parcel))return;
    record.done=true;carrying.delete(parcel);
    notify('custom',descriptor.tag||'delivery-drop',1);
    emitAdventure('OnDeliveryDelivered',{objectId:key(owner),tag:descriptor.tag});
  }
  // -- 10.4 humans: a one-shot stop on a cooldown, so brushing past a neighbour
  //    twice in one second does not double-score.
  function stepHuman(owner,descriptor,record,playerPosition){
    const position=positionOf(owner);if(!position)return;
    if(distanceTo(position,playerPosition)>clamp(descriptor.radius,.2,30)||record.cooldown>0)return;
    record.cooldown=.35;notify('custom',descriptor.tag,1);
    emitAdventure(descriptor.kind==='friendly'?'OnFriendlyStop':'OnFamilyReward',{objectId:key(owner),tag:descriptor.tag});
  }
  // -- 10.5 hazards: patrol or drive a route, and fire once per entry, so an
  //    'avoid' objective fails on contact rather than on lingering.
  function stepHazard(owner,descriptor,record,playerPosition,dt){
    moveRoute(owner,descriptor,record,dt);
    const position=positionOf(owner);if(!position)return;
    const inside=distanceTo(position,playerPosition)<=clamp(descriptor.radius,.2,30);
    if(inside&&!record.alerted){
      record.alerted=true;
      const tag=descriptor.tag||(descriptor.kind==='dog'?'dog-alert':'traffic-hit');
      notify('avoid',tag,1);
      emitAdventure(descriptor.kind==='dog'?'OnDogAlerted':'OnTrafficHit',{objectId:key(owner),tag});
    } else if(!inside)record.alerted=false;
  }

  const TRIGGER_KINDS=Object.freeze({
    mouse:stepMouse, token:stepToken, delivery:stepDelivery,
    friendly:stepHuman, family:stepHuman,
    dog:stepHazard, traffic:stepHazard,
  });
  function handler(kind){
    const found=TRIGGER_KINDS[kind];
    if(!found) throw new Error('Cat adventure runtime: unknown trigger kind "'+kind+'"');
    return found;
  }

  function step(owner,raw,playerPosition,dt){
    const descriptor=settings(owner,raw),record=state(owner);
    record.cooldown=Math.max(0,record.cooldown-dt);
    if(descriptor.enabled===false)return;
    handler(descriptor.kind)(owner,descriptor,record,playerPosition,dt);
  }
  function update(dt){
    if(!(GAME&&GAME.state&&GAME.state.started)){states.clear();carrying.clear();return;}
    const player=GAME.pawns&&GAME.pawns.getByPlayerId&&GAME.pawns.getByPlayerId(1),playerPosition=positionOf(player);
    const objects=GAME.world&&Array.isArray(GAME.world.registry)?GAME.world.registry:[];
    sweepEpoch++;
    objects.forEach(owner=>{
      const graph=owner&&owner.userData&&owner.userData.logicGraph,descriptor=graph&&graph.catAdventureTrigger;
      if(!descriptor)return;
      if(playerPosition)step(owner,descriptor,playerPosition,clamp(dt,.001,.1));
      else {const record=states.get(key(owner));if(record)record._seen=sweepEpoch;}
    });
    states.forEach((value,id)=>{if(value._seen!==sweepEpoch)states.delete(id);});
  }
  return Object.freeze({update,step,states,carrying,TRIGGER_KINDS});
}

function install(GAME){
  if(!GAME)return null;
  GAME.systems=GAME.systems||{};
  if(GAME.systems.catAdventure)return GAME.systems.catAdventure;
  const system=createCatAdventureSystem(GAME);
  GAME.systems.catAdventure=system;
  if(GAME.hooks&&Array.isArray(GAME.hooks.frame)&&!GAME.hooks.__lkCatAdventureFrame){
    GAME.hooks.__lkCatAdventureFrame=true;GAME.hooks.frame.push(dt=>system.update(dt));
  }
  // The ambient cat behaviour driver is an optional enhancement layer: when the
  // module is loaded the cat grooms, sits, looks around and speaks between
  // objectives; when it is absent the level plays exactly the same.
  if(root.LK_RUNTIME_CAT_BEHAVIOUR&&root.LK_RUNTIME_CAT_BEHAVIOUR.install)root.LK_RUNTIME_CAT_BEHAVIOUR.install(GAME);
  return system;
}

// ============================================================ 11 registration

root.LK_RUNTIME_CAT_NEIGHBORHOOD_LEVEL_TEMPLATE=Object.freeze({id:ID,name:NAME,LEVEL,GROUP,MAT,buildScene,triggerGraph,createCatAdventureSystem,install});
if(root.LK_LEVEL_TEMPLATES&&root.LK_LEVEL_TEMPLATES.register)root.LK_LEVEL_TEMPLATES.register({
  id:ID,name:NAME,nameIt:'Avventura del gatto nel quartiere',category:'Adventure',order:620,ground:'none',keepBuiltinPlayer:false,
  description:'Editable vertical city block built for a cat: fire escapes, rooftops, sills, gutters and cat-only passages, with a replaceable GLB Animal Pawn and an authored mission list.',
  descriptionIt:'Isolato urbano verticale ed editabile pensato per un gatto: scale antincendio, tetti, davanzali, grondaie e passaggi solo-gatto, con Animal Pawn sostituibile via GLB e missioni autoriali.',
  build:buildScene});
if(root.LOT_KING)install(root.LOT_KING);
if(typeof module!=='undefined'&&module.exports)module.exports=root.LK_RUNTIME_CAT_NEIGHBORHOOD_LEVEL_TEMPLATE;
})();
