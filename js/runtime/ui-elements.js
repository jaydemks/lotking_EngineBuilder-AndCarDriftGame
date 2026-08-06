/* =========================================================
   LOT KING - Authorable UI Elements runtime

   One DOM implementation for Editor Play, gameplay and playable exports.
   Logic graphs own their namespace; removing/rebuilding a graph removes only
   its UI. Pointer/keyboard events stop at interactive UI and are translated to
   `lotking:ui-action`, so a Button cannot also fire a Pawn weapon/action.
   ========================================================= */
(function(){
'use strict';

const globalRoot=typeof window!=='undefined'?window:globalThis;
const TYPES=new Set(['canvas','panel','text','image','button','progress','value']);
const ANCHORS=Object.freeze({
  'top-left':{left:'0',top:'0'},top:{left:'50%',top:'0',transform:'translateX(-50%)'},'top-right':{right:'0',top:'0'},
  left:{left:'0',top:'50%',transform:'translateY(-50%)'},center:{left:'50%',top:'50%',transform:'translate(-50%,-50%)'},right:{right:'0',top:'50%',transform:'translateY(-50%)'},
  'bottom-left':{left:'0',bottom:'0'},bottom:{left:'50%',bottom:'0',transform:'translateX(-50%)'},'bottom-right':{right:'0',bottom:'0'},
  stretch:{left:'0',top:'0',right:'0',bottom:'0'},
});
function clamp(value,min,max){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;}
function id(value,fallback){const clean=String(value||fallback||'ui').trim().replace(/[^a-z0-9_-]+/gi,'-');return clean||String(fallback||'ui');}
function cssLength(value,unit){
  if(value==null||value==='')return '0px';
  if(typeof value==='string'&&/[a-z%)]$/i.test(value.trim()))return value.trim();
  return String(Number(value)||0)+(unit||'px');
}
function clone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
function normalizeAsset(ref){
  if(ref&&typeof ref==='object')return clone(ref);
  const source=String(ref||'').trim();return source?{src:source,name:source}:null;
}
function normalizeSpec(raw,index){
  const source=raw&&typeof raw==='object'?raw:{};
  const type=TYPES.has(String(source.type||'').toLowerCase())?String(source.type).toLowerCase():'panel';
  return Object.assign({},clone(source),{
    id:id(source.id,type+'-'+(index||0)),type,
    anchor:ANCHORS[source.anchor]?source.anchor:(type==='canvas'?'stretch':'center'),
    offset:Object.assign({x:0,y:0,unit:'px'},source.offset||{}),
    size:Object.assign({width:type==='canvas'?'100%':280,height:type==='canvas'?'100%':'auto',unit:'px'},source.size||{}),
    visible:source.visible!==false,enabled:source.enabled!==false,zOrder:Number(source.zOrder)||0,
    children:(Array.isArray(source.children)?source.children:[]).map((child,childIndex)=>normalizeSpec(child,childIndex)),
    asset:normalizeAsset(source.asset||source.src),
  });
}
function setPath(target,path,value){
  const parts=String(path||'').split('.').filter(Boolean);if(parts[0]==='ui')parts.shift();
  if(!parts.length)return target;let cursor=target;
  parts.forEach((part,index)=>{if(index===parts.length-1)cursor[part]=clone(value);else cursor=cursor[part]&&typeof cursor[part]==='object'?cursor[part]:(cursor[part]={});});
  return target;
}
function resolveAuthored(graph){
  const spec=clone(graph&&graph.uiElement||{});
  (graph&&graph.variables||[]).forEach(variable=>{if(variable&&variable.exposed&&/^ui\./.test(String(variable.binding||'')))setPath(spec,variable.binding,variable.value);});
  return normalizeSpec(spec,0);
}
function resolveAssetUrl(ref){
  const asset=normalizeAsset(ref);if(!asset)return Promise.resolve('');
  if(asset.dbKey&&globalRoot.LK_ASSET_BLOBS&&globalRoot.LK_ASSET_BLOBS.getUrl)return Promise.resolve(globalRoot.LK_ASSET_BLOBS.getUrl(asset.dbKey)).catch(()=>String(asset.src||asset.url||''));
  return Promise.resolve(String(asset.src||asset.url||asset.value||''));
}
function create(GAME,options){
  const opts=options||{},records=new Map(),owners=new Map();let root=null;
  const doc=opts.document||globalRoot.document||null;
  function host(){return opts.host||(doc&&doc.getElementById&&doc.getElementById('hud'))||(doc&&doc.body)||null;}
  function ensureRoot(){
    if(root&&root.isConnected!==false)return root;
    const parent=host();if(!parent||!doc||!doc.createElement)return null;
    root=doc.createElement('div');root.id='lkAuthorUiRoot';root.dataset.lkAuthorUi='true';
    Object.assign(root.style,{position:'absolute',inset:'0',overflow:'hidden',pointerEvents:'none',zIndex:'70'});
    parent.appendChild(root);return root;
  }
  function key(ownerId,elementId){return String(ownerId)+'::'+String(elementId);}
  function ownerSet(ownerId){const name=String(ownerId);if(!owners.has(name))owners.set(name,new Set());return owners.get(name);}
  function applyAnchor(el,spec){
    ['left','right','top','bottom','transform'].forEach(prop=>{el.style[prop]='';});
    Object.assign(el.style,ANCHORS[spec.anchor]||ANCHORS.center);
    const unit=String(spec.offset.unit||'px'),x=cssLength(spec.offset.x,unit),y=cssLength(spec.offset.y,unit);
    const transforms=[];if(el.style.transform)transforms.push(el.style.transform);
    if(Number(spec.offset.x)||Number(spec.offset.y))transforms.push('translate('+x+','+y+')');
    el.style.transform=transforms.join(' ');
  }
  function applyCommon(record,spec){
    const el=record.el;record.spec=spec;el.dataset.uiId=spec.id;el.dataset.uiType=spec.type;
    el.hidden=!spec.visible;el.setAttribute('aria-disabled',spec.enabled?'false':'true');
    Object.assign(el.style,{position:'absolute',boxSizing:'border-box',margin:'0',zIndex:String(spec.zOrder),opacity:String(spec.opacity==null?1:clamp(spec.opacity,0,1)),pointerEvents:spec.type==='button'&&spec.enabled?'auto':'none'});
    applyAnchor(el,spec);
    if(spec.anchor!=='stretch'){
      el.style.width=cssLength(spec.size.width,spec.size.unit||'px');
      el.style.height=spec.size.height==='auto'?'auto':cssLength(spec.size.height,spec.size.unit||'px');
    }
    if(spec.safeArea===true)Object.assign(el.style,{paddingTop:'env(safe-area-inset-top)',paddingRight:'env(safe-area-inset-right)',paddingBottom:'env(safe-area-inset-bottom)',paddingLeft:'env(safe-area-inset-left)'});
    if(spec.background!=null)el.style.background=String(spec.background);
    if(spec.color!=null)el.style.color=String(spec.color);
    if(spec.borderColor||spec.borderWidth)el.style.border=cssLength(spec.borderWidth==null?1:spec.borderWidth,'px')+' solid '+String(spec.borderColor||'rgba(255,255,255,.35)');
    if(spec.radius!=null)el.style.borderRadius=cssLength(spec.radius,'px');
    if(spec.padding!=null)el.style.padding=cssLength(spec.padding,'px');
    if(spec.fontFamily)el.style.fontFamily=String(spec.fontFamily);
    if(spec.fontSize!=null)el.style.fontSize=cssLength(spec.fontSize,'px');
    if(spec.fontWeight!=null)el.style.fontWeight=String(spec.fontWeight);
    if(spec.textAlign)el.style.textAlign=String(spec.textAlign);
  }
  function emit(record,event){
    const detail={ownerId:record.ownerId,elementId:record.id,action:String(record.spec.action||record.id),value:record.spec.value,semantic:true};
    if(typeof globalRoot.CustomEvent==='function'&&globalRoot.dispatchEvent)globalRoot.dispatchEvent(new globalRoot.CustomEvent('lotking:ui-action',{detail}));
    else if(globalRoot.dispatchEvent)globalRoot.dispatchEvent({type:'lotking:ui-action',detail});
  }
  function stop(event){if(event&&event.stopPropagation)event.stopPropagation();}
  function createElement(ownerId,type,props,parentHandle){
    const spec=normalizeSpec(Object.assign({},props||{},{type}),0),recordKey=key(ownerId,spec.id),existing=records.get(recordKey);
    if(existing){update(existing,spec);return existing;}
    if(!doc||typeof doc.createElement!=='function')return null;
    const tag=spec.type==='button'?'button':spec.type==='image'?'figure':'div',el=doc.createElement(tag);
    if(spec.type==='button')el.type='button';
    const parent=parentHandle&&parentHandle.el||ensureRoot();if(!parent)return null;
    const record={ownerId:String(ownerId),id:spec.id,type:spec.type,el,spec:null,children:new Set()};
    records.set(recordKey,record);ownerSet(ownerId).add(recordKey);parent.appendChild(el);if(parentHandle&&parentHandle.children)parentHandle.children.add(recordKey);
    ['pointerdown','pointerup','keydown','keyup'].forEach(name=>el.addEventListener(name,stop));
    if(spec.type==='button')el.addEventListener('click',event=>{stop(event);if(record.spec.enabled!==false)emit(record,event);});
    update(record,spec);return record;
  }
  function update(record,patch){
    if(!record)return null;const spec=normalizeSpec(Object.assign({},record.spec||{},patch||{},{id:record.id,type:record.type}),0),el=record.el;
    applyCommon(record,spec);
    if(spec.type==='text'||spec.type==='button')el.textContent=String(spec.text==null?(spec.type==='button'?'Button':'Text'):spec.text);
    else if(spec.type==='value'){
      const value=Number(spec.value);el.textContent=String(spec.prefix||'')+(Number.isFinite(value)?value.toFixed(Math.max(0,Number(spec.decimals)||0)):String(spec.value||0))+String(spec.suffix||'');
    }else if(spec.type==='progress'){
      let track=el.querySelector&&el.querySelector('[data-ui-progress-track]'),fill=el.querySelector&&el.querySelector('[data-ui-progress-fill]');
      if(!track){track=doc.createElement('div');fill=doc.createElement('div');track.dataset.uiProgressTrack='true';fill.dataset.uiProgressFill='true';track.appendChild(fill);el.appendChild(track);Object.assign(track.style,{position:'absolute',inset:'0',overflow:'hidden',borderRadius:'inherit',background:String(spec.trackColor||'rgba(255,255,255,.18)')});Object.assign(fill.style,{height:'100%',transformOrigin:'left center',transition:'transform 120ms linear'});}
      fill.style.background=String(spec.fillColor||'#38bdf8');fill.style.transform='scaleX('+clamp((Number(spec.value)||0)/Math.max(.0001,Number(spec.max)||100),0,1)+')';el.setAttribute('role','progressbar');el.setAttribute('aria-valuenow',String(Number(spec.value)||0));el.setAttribute('aria-valuemax',String(Number(spec.max)||100));
    }else if(spec.type==='image'){
      let image=el.querySelector&&el.querySelector('img'),fallback=el.querySelector&&el.querySelector('[data-ui-image-fallback]');
      if(!image){image=doc.createElement('img');fallback=doc.createElement('span');fallback.dataset.uiImageFallback='true';fallback.textContent=String(spec.placeholder||'Image asset missing');Object.assign(image.style,{width:'100%',height:'100%',objectFit:String(spec.fit||'contain'),display:'none'});Object.assign(fallback.style,{display:'grid',placeItems:'center',width:'100%',height:'100%',border:'1px dashed rgba(255,255,255,.45)',fontSize:'12px'});el.appendChild(image);el.appendChild(fallback);}
      const wanted=spec.asset;resolveAssetUrl(wanted).then(url=>{if(record.spec!==spec)return;if(!url){image.style.display='none';fallback.style.display='grid';return;}image.onload=()=>{image.style.display='block';fallback.style.display='none';};image.onerror=()=>{image.removeAttribute('src');image.style.display='none';fallback.style.display='grid';};image.alt=String(spec.alt||spec.text||'');image.src=url;});
    }
    if(spec.type==='button')el.disabled=!spec.enabled;
    return record;
  }
  function mount(ownerId,raw,parentHandle){
    const spec=normalizeSpec(raw,0),record=createElement(ownerId,spec.type,spec,parentHandle);
    if(record)spec.children.forEach(child=>mount(ownerId,child,record));return record;
  }
  function find(ownerId,elementId){return records.get(key(ownerId,elementId))||null;}
  function remove(record){
    if(!record)return false;Array.from(record.children||[]).forEach(childKey=>remove(records.get(childKey)));
    records.delete(key(record.ownerId,record.id));const set=owners.get(record.ownerId);if(set){set.delete(key(record.ownerId,record.id));if(!set.size)owners.delete(record.ownerId);}
    if(record.el&&record.el.remove)record.el.remove();return true;
  }
  function disposeOwner(ownerId){const set=owners.get(String(ownerId));if(!set)return 0;const targets=Array.from(set),count=targets.length;targets.forEach(itemKey=>remove(records.get(itemKey)));owners.delete(String(ownerId));return count;}
  function dispose(){Array.from(owners.keys()).forEach(disposeOwner);if(root&&root.remove)root.remove();root=null;}
  return Object.freeze({mount,createElement,update,find,remove,disposeOwner,dispose,records});
}
function install(GAME){
  if(!GAME)return null;GAME.systems=GAME.systems||{};
  if(GAME.systems.uiElements)return GAME.systems.uiElements;
  return GAME.systems.uiElements=create(GAME);
}

globalRoot.LK_RUNTIME_UI_ELEMENTS=Object.freeze({TYPES,ANCHORS,normalizeSpec,resolveAuthored,create,install});
})();
