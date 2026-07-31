/* =========================================================
   LOT KING — Developer Debugger background worker
   Pure-data aggregation, report serialization and local autolog transport.
   Three.js scene access and DOM work intentionally remain on the main thread.
   ========================================================= */
'use strict';

self.postMessage({type:'ready'});

function aggregate(items){
  const sorted=(Array.isArray(items)?items:[]).slice().sort((a,b)=>
    (Number(b&&b.total)||0)-(Number(a&&a.total)||0)||
    (Number(b&&b.triangles)||0)-(Number(a&&a.triangles)||0)
  );
  const totals=sorted.reduce((out,item)=>{
    out.geometryBytes+=Number(item&&item.geoBytes)||0;
    out.textureBytes+=Number(item&&item.textureBytes)||0;
    out.triangles+=Number(item&&item.triangles)||0;
    return out;
  },{geometryBytes:0,textureBytes:0,triangles:0});
  return {items:sorted,totals};
}

self.onmessage=async event=>{
  const message=event&&event.data||{};
  const id=message.id;
  try {
    let result;
    if(message.type==='aggregate'){
      result=aggregate(message.payload&&message.payload.items);
    } else if(message.type==='stringify'){
      result={text:JSON.stringify(message.payload&&message.payload.value,null,message.payload&&message.payload.pretty?2:0)};
    } else if(message.type==='write-log'){
      const payload=message.payload||{};
      const response=await fetch(payload.url,{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        cache:'no-store',
        body:JSON.stringify(payload.report),
      });
      if(!response.ok) throw new Error('HTTP '+response.status);
      result=await response.json();
    } else {
      throw new Error('Unknown debugger worker task: '+message.type);
    }
    self.postMessage({id,ok:true,result});
  } catch(error){
    self.postMessage({id,ok:false,error:error&&error.message||String(error)});
  }
};
