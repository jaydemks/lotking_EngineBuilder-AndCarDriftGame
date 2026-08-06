'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

class FileReader{
  readAsDataURL(blob){this.result='data:'+String(blob&&blob.type||'image/png')+';base64,UE5H';queueMicrotask(()=>this.onload&&this.onload());}
}
const window={LK_ASSET_BLOBS:{getUrl:key=>Promise.resolve('blob:'+key)},LOT_KING:{i18n:{lang:'en'}}};
const context={window,FileReader,URL,location:{origin:'http://localhost',href:'http://localhost/gameplay.html'},fetch:async()=>({ok:true,blob:async()=>({type:'image/png'})}),console,queueMicrotask};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'js/editor/playable-export-assets.js'),'utf8'),context,{filename:'playable-export-assets.js'});

(async()=>{
  const exporter=window.LK_EDITOR_PLAYABLE_EXPORT_ASSETS.create({assetLibraryLoad:()=>[]});
  const project={scene:{added:[{kind:'logicElement',name:'UI',graph:{
    uiElement:{id:'canvas',type:'canvas',children:[{id:'logo',type:'image',asset:{id:'logo',dbKey:'logo-db'}}]},
    variables:[{name:'Portrait',binding:'ui.children.1.asset',value:{id:'portrait',dbKey:'portrait-db'}}],
    nodes:[{id:'dynamic',type:'ui.createImage',data:{asset:{id:'dynamic',dbKey:'dynamic-db'}}}],
  }}]}};
  const result=await exporter.preparePlayableProject(project,{stripEmbeddedLevels:true});
  const graph=result.project.scene.added[0].graph;
  [graph.uiElement.children[0].asset,graph.variables[0].value,graph.nodes[0].data.asset].forEach(asset=>{
    assert.match(asset.src,/^data:image\/png;base64,/,'UI texture is embedded for a standalone playable export');
    assert.equal(asset.dbKey,null,'exported UI texture no longer depends on the local IndexedDB');
  });
  assert.equal(result.warnings.length,0);
  console.log('ui-elements-export.test.js: all assertions passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
