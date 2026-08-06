/* =========================================================
   LOT KING - Procedural World schema
   Renderer-free normalization shared by Editor, Play and exports.
   ========================================================= */
(function(root,factory){
'use strict';
const api=factory();root.LK_RUNTIME_PROCEDURAL_WORLD_SCHEMA=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';

const VERSION=2;
const QUALITY=Object.freeze(['auto','low','medium','high','ultra']);
const PRESETS=Object.freeze(['cinematic-island','subtle-coast','ocean-only','off']);
const DEFAULTS=Object.freeze({
  schemaVersion:VERSION,enabled:true,preset:'cinematic-island',seed:1337,
  bounds:Object.freeze({mode:'auto',padding:70,minRadius:120,maxRadius:700}),
  // The procedural heightfield remains collidable everywhere, but its protected
  // centre sits below the authored map.  Authored roads/floors therefore own
  // Y=0 instead of an invisible procedural plateau competing with them.
  datum:Object.freeze({mode:'preserve-authored',authoredY:0,islandTopY:-6,seabedY:-28}),
  terrain:Object.freeze({enabled:true,mode:'auto',relief:12,shoreWidth:90,quality:'auto',playableExterior:false}),
  ocean:Object.freeze({enabled:true,seaLevel:-14,extent:3200,quality:'auto',waveAmplitude:.7,waveLength:42,waveSpeed:1,foam:.55,color:'#187b9b',deepColor:'#07344f',opacity:.88}),
  archipelago:Object.freeze({enabled:true,count:16,minDistance:320,maxDistance:900,minSize:28,maxSize:145,relief:55}),
  waterBodies:Object.freeze([]),
});

function finite(value,fallback,min,max){value=Number(value);if(!Number.isFinite(value))value=fallback;if(min!=null)value=Math.max(min,value);if(max!=null)value=Math.min(max,value);return value;}
function bool(value,fallback){return value==null?fallback:value!==false;}
function choice(value,list,fallback){value=String(value==null?'':value);return list.indexOf(value)>=0?value:fallback;}
function color(value,fallback){value=String(value||'');return /^#[0-9a-f]{6}$/i.test(value)?value:fallback;}
function point(value,fallback){const source=Array.isArray(value)?value:fallback;return [finite(source&&source[0],fallback[0],-100000,100000),finite(source&&source[1],fallback[1],-100000,100000)];}
function clone(value){return JSON.parse(JSON.stringify(value));}
function normalizeBody(body,index,seaLevel){
  const source=body&&typeof body==='object'?body:{},type=source.type==='river'?'river':'lake';
  const common={id:String(source.id||('water-'+type+'-'+(index+1))),name:String(source.name||(type==='river'?'Procedural River':'Procedural Lake')),type,enabled:bool(source.enabled,true),level:finite(source.level,seaLevel,-10000,10000),quality:choice(source.quality,QUALITY,'auto'),waveAmplitude:finite(source.waveAmplitude,type==='river'?.08:.18,0,5),color:color(source.color,type==='river'?'#2d8faa':'#2585a3')};
  if(type==='river'){
    const fallback=[[-30,0],[0,18],[35,4]],points=(Array.isArray(source.points)&&source.points.length>=2?source.points:fallback).slice(0,64).map((item,i)=>point(item,fallback[Math.min(i,fallback.length-1)]||[0,0]));
    return Object.assign(common,{points,width:finite(source.width,8,.25,500),flowSpeed:finite(source.flowSpeed,.7,0,10)});
  }
  return Object.assign(common,{center:point(source.center,[0,0]),radius:finite(source.radius,22,1,2000),aspect:finite(source.aspect,1,.1,10),rotation:finite(source.rotation,0,-Math.PI*2,Math.PI*2)});
}
function normalize(value){
  const source=value&&typeof value==='object'?value:{},preset=choice(source.preset,PRESETS,DEFAULTS.preset),bounds=source.bounds||{},datum=source.datum||{},terrain=source.terrain||{},ocean=source.ocean||{},archipelago=source.archipelago||{};
  const off=preset==='off',oceanOnly=preset==='ocean-only';
  const sourceVersion=Math.max(0,Math.round(finite(source.schemaVersion,0,0,VERSION)));
  // v1 placed terrain at authored Y=0, producing a second invisible floor over
  // imported/drive surfaces.  Move only that exact untouched legacy stack;
  // deliberately authored terrain/water levels remain byte-for-byte values.
  const legacyDefaultStack=sourceVersion<2&&Math.abs(finite(datum.authoredY,0)-0)<1e-6&&
    Math.abs(finite(datum.islandTopY,0)-0)<1e-6&&Math.abs(finite(ocean.seaLevel,-8)+8)<1e-6&&
    Math.abs(finite(datum.seabedY,-22)+22)<1e-6;
  const islandTop=legacyDefaultStack?DEFAULTS.datum.islandTopY:finite(datum.islandTopY,DEFAULTS.datum.islandTopY,-10000,10000);
  const seaLevel=legacyDefaultStack?DEFAULTS.ocean.seaLevel:finite(ocean.seaLevel,DEFAULTS.ocean.seaLevel,-9999,9999);
  const seabed=legacyDefaultStack?DEFAULTS.datum.seabedY:finite(datum.seabedY,DEFAULTS.datum.seabedY,-10000,9999);
  const normalized={
    schemaVersion:VERSION,enabled:off?false:bool(source.enabled,DEFAULTS.enabled),preset,seed:Math.round(finite(source.seed,DEFAULTS.seed,0,4294967295)),
    bounds:{mode:bounds.mode==='manual'?'manual':'auto',padding:finite(bounds.padding,DEFAULTS.bounds.padding,0,1000),minRadius:finite(bounds.minRadius,DEFAULTS.bounds.minRadius,20,5000),maxRadius:finite(bounds.maxRadius,DEFAULTS.bounds.maxRadius,50,10000)},
    datum:{mode:'preserve-authored',authoredY:finite(datum.authoredY,0,-10000,10000),islandTopY:islandTop,seabedY:seabed},
    terrain:{enabled:oceanOnly?false:bool(terrain.enabled,DEFAULTS.terrain.enabled),mode:terrain.mode==='surround-only'?'surround-only':'auto',relief:finite(terrain.relief,DEFAULTS.terrain.relief,0,250),shoreWidth:finite(terrain.shoreWidth,DEFAULTS.terrain.shoreWidth,8,1500),quality:choice(terrain.quality,QUALITY,'auto'),playableExterior:bool(terrain.playableExterior,false)},
    ocean:{enabled:bool(ocean.enabled,DEFAULTS.ocean.enabled),seaLevel:seaLevel,extent:finite(ocean.extent,DEFAULTS.ocean.extent,200,50000),quality:choice(ocean.quality,QUALITY,'auto'),waveAmplitude:finite(ocean.waveAmplitude,DEFAULTS.ocean.waveAmplitude,0,8),waveLength:finite(ocean.waveLength,DEFAULTS.ocean.waveLength,2,500),waveSpeed:finite(ocean.waveSpeed,DEFAULTS.ocean.waveSpeed,0,12),foam:finite(ocean.foam,DEFAULTS.ocean.foam,0,1),color:color(ocean.color,DEFAULTS.ocean.color),deepColor:color(ocean.deepColor,DEFAULTS.ocean.deepColor),opacity:finite(ocean.opacity,DEFAULTS.ocean.opacity,.05,1)},
    archipelago:{enabled:bool(archipelago.enabled,DEFAULTS.archipelago.enabled),count:Math.round(finite(archipelago.count,DEFAULTS.archipelago.count,0,128)),minDistance:finite(archipelago.minDistance,DEFAULTS.archipelago.minDistance,50,20000),maxDistance:finite(archipelago.maxDistance,DEFAULTS.archipelago.maxDistance,100,40000),minSize:finite(archipelago.minSize,DEFAULTS.archipelago.minSize,2,2000),maxSize:finite(archipelago.maxSize,DEFAULTS.archipelago.maxSize,4,5000),relief:finite(archipelago.relief,DEFAULTS.archipelago.relief,1,1000)},
    waterBodies:[],
  };
  if(normalized.bounds.maxRadius<normalized.bounds.minRadius)normalized.bounds.maxRadius=normalized.bounds.minRadius;
  if(normalized.datum.seabedY>=normalized.ocean.seaLevel)normalized.datum.seabedY=normalized.ocean.seaLevel-1;
  if(normalized.archipelago.maxDistance<normalized.archipelago.minDistance)normalized.archipelago.maxDistance=normalized.archipelago.minDistance;
  if(normalized.archipelago.maxSize<normalized.archipelago.minSize)normalized.archipelago.maxSize=normalized.archipelago.minSize;
  normalized.waterBodies=(Array.isArray(source.waterBodies)?source.waterBodies:[]).slice(0,64).map((body,index)=>{
    const bodyLevel=body&&Number(body.level),legacyPlateauWater=legacyDefaultStack&&Number.isFinite(bodyLevel)&&Math.abs(bodyLevel)<=1;
    const migrated=legacyPlateauWater?Object.assign({},body,{level:bodyLevel-6}):body;
    return normalizeBody(migrated,index,normalized.ocean.seaLevel);
  });
  return normalized;
}
function qualityTier(value,hints){
  if(value!=='auto')return choice(value,QUALITY,'medium');hints=hints||{};
  if(hints.menuPreview||hints.mobile||finite(hints.deviceMemory,8,0,128)<=4)return 'low';
  if(hints.pixelRatio>1.75)return 'medium';
  return hints.highPerformance===false?'medium':'high';
}
function signature(value){const v=normalize(value);return JSON.stringify(v);}
return Object.freeze({VERSION,QUALITY,PRESETS,DEFAULTS,normalize,normalizeBody,qualityTier,signature,clone});
});
