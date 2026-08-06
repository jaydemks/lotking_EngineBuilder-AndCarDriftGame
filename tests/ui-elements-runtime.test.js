'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

class FakeElement{
  constructor(tag){this.tagName=String(tag).toUpperCase();this.style={};this.dataset={};this.children=[];this.listeners={};this.parentNode=null;this.hidden=false;this.isConnected=true;this.attributes={};this.textContent='';}
  appendChild(child){child.parentNode=this;child.isConnected=true;this.children.push(child);return child;}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(item=>item!==this);this.isConnected=false;}
  addEventListener(type,listener){(this.listeners[type]||(this.listeners[type]=[])).push(listener);}
  dispatch(type,event){(this.listeners[type]||[]).forEach(listener=>listener(event||{}));}
  setAttribute(name,value){this.attributes[name]=String(value);}
  removeAttribute(name){delete this.attributes[name];}
  querySelector(selector){
    const match=node=>selector==='img'?node.tagName==='IMG':selector==='[data-ui-progress-track]'?node.dataset.uiProgressTrack==='true':selector==='[data-ui-progress-fill]'?node.dataset.uiProgressFill==='true':selector==='[data-ui-image-fallback]'?node.dataset.uiImageFallback==='true':false;
    const stack=this.children.slice();while(stack.length){const child=stack.shift();if(match(child))return child;stack.push(...child.children);}return null;
  }
}
const body=new FakeElement('body'),hud=new FakeElement('div');hud.id='hud';body.appendChild(hud);
const document={body,createElement:tag=>new FakeElement(tag),getElementById:id=>id==='hud'?hud:null};
const dispatched=[],listeners={};
class CustomEvent{constructor(type,options){this.type=type;this.detail=options&&options.detail;}}
const window={document,CustomEvent,dispatchEvent:event=>{dispatched.push(event);(listeners[event.type]||[]).forEach(fn=>fn(event));},addEventListener:(type,fn)=>(listeners[type]||(listeners[type]=[])).push(fn)};
const context={window,document,CustomEvent,console,setTimeout,clearTimeout,performance:{now:()=>0}};
vm.createContext(context);
vm.runInContext(read('js/runtime/ui-elements.js'),context,{filename:'ui-elements.js'});
const UI=window.LK_RUNTIME_UI_ELEMENTS;
assert.ok(UI&&UI.TYPES.has('canvas')&&UI.TYPES.has('progress'));

const resolved=UI.resolveAuthored({uiElement:{id:'canvas',type:'canvas',children:[{id:'label',type:'text',text:'Old'}]},variables:[{exposed:true,binding:'ui.children.0.text',value:'New'}]});
assert.equal(resolved.children[0].text,'New','exposed ui.* bindings author the serialized UI tree');
const GAME={systems:{}},manager=UI.install(GAME);
const canvas=manager.mount('owner-a',{id:'canvas',type:'canvas',anchor:'stretch',safeArea:true,zOrder:20,children:[
  {id:'panel',type:'panel',anchor:'top-right',offset:{x:-12,y:18},size:{width:300,height:120},children:[
    {id:'label',type:'text',text:'Mission',fontSize:24},
    {id:'icon',type:'image',asset:null,placeholder:'Missing texture'},
    {id:'confirm',type:'button',text:'Go',action:'confirm',value:7},
    {id:'health',type:'progress',value:25,max:100},
    {id:'score',type:'value',value:42,prefix:'Score ',decimals:0},
  ]},
]});
assert.ok(canvas&&hud.children.includes(manager.records.get('owner-a::canvas').el.parentNode),'runtime mounts under the shared HUD frame');
assert.equal(manager.find('owner-a','panel').el.style.right,'0','responsive anchor is applied');
assert.match(manager.find('owner-a','canvas').el.style.paddingTop,/safe-area-inset-top/,'Canvas respects safe areas');
assert.equal(manager.find('owner-a','health').el.attributes.role,'progressbar');
assert.equal(manager.find('owner-a','score').el.textContent,'Score 42');
assert.equal(manager.find('owner-a','icon').el.querySelector('[data-ui-image-fallback]').textContent,'Missing texture','missing images degrade to a clear placeholder');
let stopped=0;manager.find('owner-a','confirm').el.dispatch('pointerdown',{stopPropagation(){stopped++;}});manager.find('owner-a','confirm').el.dispatch('click',{stopPropagation(){stopped++;}});
assert.equal(stopped,2,'interactive UI consumes pointer input before gameplay listeners');
assert.equal(dispatched.at(-1).type,'lotking:ui-action');
assert.deepEqual(JSON.parse(JSON.stringify(dispatched.at(-1).detail),['ownerId','elementId','action','value','semantic']),{ownerId:'owner-a',elementId:'confirm',action:'confirm',value:7,semantic:true},'Button emits a scoped semantic action');
manager.update(manager.find('owner-a','health'),{value:80});
assert.equal(manager.find('owner-a','health').el.attributes['aria-valuenow'],'80');
assert.ok(manager.disposeOwner('owner-a')>=7&&!manager.find('owner-a','confirm'),'graph disposal removes its whole UI namespace');

context.window.LK_LOGIC_NODE_PACKS=[];
vm.runInContext(read('js/logic/logic-registry.js'),context,{filename:'logic-registry.js'});
vm.runInContext(read('js/logic/logic-graph.js'),context,{filename:'logic-graph.js'});
vm.runInContext(read('js/logic/logic-validator.js'),context,{filename:'logic-validator.js'});
vm.runInContext(read('js/logic/logic-runtime.js'),context,{filename:'logic-runtime.js'});
vm.runInContext(read('js/logic/logic-nodes-mvp.js'),context,{filename:'logic-nodes-mvp.js'});
vm.runInContext(read('js/logic/logic-nodes-ui.js'),context,{filename:'logic-nodes-ui.js'});
const registry=context.window.LK_LOGIC_NODES_MVP.createRegistry();
['event.onUiAction','ui.mountAuthored','ui.createCanvas','ui.createPanel','ui.createText','ui.createImage','ui.createButton','ui.createProgress','ui.createValue','ui.setValue'].forEach(type=>assert.ok(registry.get(type),'node pack registers '+type));
const created=[];
const graph={version:1,name:'Executable UI',scope:'element',enabled:true,variables:[{name:'Clicked',type:'boolean',value:false}],nodes:[
  {id:'start',type:'event.onStart',x:0,y:0,data:{}},{id:'canvas',type:'ui.createCanvas',x:0,y:0,data:{id:'hud'}},
  {id:'click',type:'event.onUiAction',x:0,y:0,data:{elementId:'accept',action:'accept'}},{id:'set',type:'variable.set',x:0,y:0,data:{name:'Clicked',value:true}},
],edges:[{id:'a',from:{node:'start',pin:'then'},to:{node:'canvas',pin:'exec'}},{id:'b',from:{node:'click',pin:'then'},to:{node:'set',pin:'exec'}}],comments:[],subgraphs:[]};
const runtime=context.window.LK_LOGIC_RUNTIME.create(graph,registry,{graphName:'Executable UI',scope:'element',debug:{info(){},warn(){},error(){}},services:{ui:{create(type,props){created.push({type,props});return {type,props};}}}});
runtime.start();assert.equal(created[0].type,'canvas','real graph execution creates UI on On Start');
runtime.triggerEvent('OnUiAction',{elementId:'wrong',action:'accept'});assert.equal(runtime.variables.get('Clicked'),false,'event filter rejects another UI element');
runtime.triggerEvent('OnUiAction',{elementId:'accept',action:'accept'});assert.equal(runtime.variables.get('Clicked'),true,'semantic UI action executes the authored graph');

const deps=context.window.LK_LOGIC_GRAPH.collectGraphDependencies({uiElement:{id:'canvas',type:'canvas',children:[{id:'logo',type:'image',asset:{id:'texture-logo',dbKey:'blob-logo',name:'Logo'}}]},variables:[{name:'Portrait',binding:'ui.children.1.asset',value:{id:'texture-portrait'}}],nodes:[{id:'dynamic-image',type:'ui.createImage',data:{asset:{id:'texture-dynamic'}}}]});
assert.ok(deps.some(dep=>dep.type==='texture'&&dep.id==='texture-logo'&&dep.owners.includes('uiElement:logo')),'image assets are portable graph dependencies');
assert.ok(deps.some(dep=>dep.id==='texture-portrait'&&dep.owners.includes('variable:Portrait')),'exposed image variables remain portable dependencies');
assert.ok(deps.some(dep=>dep.id==='texture-dynamic'&&dep.owners.includes('main:dynamic-image')),'Create Image node assets remain portable dependencies');
let templates=[];context.window.LK_LOGIC_TEMPLATES={register(items){templates.push(...items);}};
vm.runInContext(read('js/logic/logic-templates-ui.js'),context,{filename:'logic-templates-ui.js'});
assert.deepEqual(templates.map(item=>item.name),['UI - Canvas / Panel','UI - Text','UI - Image','UI - Button','UI - Progress / Value'],'Engine Assets exposes clear reusable UI placeholders');
templates.forEach(template=>{
  const checked=context.window.LK_LOGIC_VALIDATOR.validateGraph(template.graph,registry);
  assert.equal(checked.ok,true,template.name+' is an executable valid Logic graph: '+JSON.stringify(checked.errors));
});

['engine_editor.html','gameplay.html','test-editor.html'].forEach(file=>{
  const source=read(file),runtime=source.indexOf('js/runtime/ui-elements.js'),services=source.indexOf('js/logic/logic-services.js'),templatesUi=source.indexOf('js/logic/logic-templates-ui.js'),nodesUi=source.indexOf('js/logic/logic-nodes-ui.js'),runner=source.indexOf('js/runtime/logic-elements-runner.js');
  assert.ok(runtime>=0&&runtime<services,file+' loads the shared UI runtime before Logic services');
  assert.ok(templatesUi>=0&&templatesUi<runner,file+' exposes UI templates before runtime rebuild');
  assert.ok(nodesUi>=0&&nodesUi<runner,file+' registers UI nodes before runtime rebuild');
});
const loader=read('js/editor/loader.js');
['js/runtime/ui-elements.js?v=0.7.8-authorable-ui-1','js/logic/logic-templates-ui.js?v=0.7.8-authorable-ui-1','js/logic/logic-nodes-ui.js?v=0.7.8-authorable-ui-1'].forEach(ref=>assert.ok(loader.includes(ref),'cached editor shells can lazily load '+ref));

console.log('ui-elements-runtime.test.js: all assertions passed');
