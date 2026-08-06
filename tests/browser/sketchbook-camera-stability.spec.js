'use strict';

const {test, expect} = require('@playwright/test');

test('Sketchbook Open World has one coherent Player 1 camera transform per editor Play frame', async ({page}) => {
  test.setTimeout(420000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&!/404/.test(message.text()))errors.push(message.text());});
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1',JSON.stringify({mode:'browser',onlineEditor:true,workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?sketchbook-camera-stability=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(
    window.LK_STORE && window.LK_STORE.levels && window.LK_RUNTIME_SKETCHBOOK_OPEN_WORLD_LEVEL_TEMPLATE &&
    window.LOT_KING && LOT_KING.actions && LOT_KING.systems && LOT_KING.systems.sketchbookPawns
  ));
  await page.evaluate(async () => {
    await Promise.resolve(LK_STORE.ready);
    const scene=LK_STORE.levels.templateScene(LOT_KING,'open-world-sketchbook');
    await LK_STORE.apply(LOT_KING,scene,{strict:true});
    const owners=LOT_KING.world.registry.filter(object=>object&&object.userData&&object.userData.editorType==='logicElement');
    await Promise.all(owners.map(owner=>Promise.resolve(owner.userData.logicElementAssetReady)));
  });
  await page.evaluate(() => document.getElementById('lkPlay').click());
  await page.waitForFunction(() => {
    const button=document.getElementById('lkPlay');
    return LOT_KING.state.started===true&&LOT_KING.state.editorPreview===true&&LOT_KING.pawns.get('sketchbook_pawn_character')&&button&&/STOP/.test(button.textContent||'');
  },null,{timeout:120000});
  await page.waitForTimeout(750);

  await page.evaluate(() => {
    const actions=LOT_KING.actions,originalStep=actions.stepGameplayPreview,originalRender=actions.renderGameplayCameraRect;
    const trace=[],copy=vector=>[vector.x,vector.y,vector.z];let serial=0;
    window.__lkSketchbookCameraTrace={trace,originalStep,originalRender};
    actions.stepGameplayPreview=dt=>{
      const frame={serial:++serial,dt,before:copy(LOT_KING.core.camera.position)};trace.push(frame);
      const result=originalStep(dt),pawn=LOT_KING.pawns.get('sketchbook_pawn_character');
      frame.after=copy(LOT_KING.core.camera.position);
      if(pawn&&pawn.owner&&pawn.body){
        frame.owner=copy(pawn.owner.getWorldPosition(new THREE.Vector3()));
        frame.body=copy(pawn.body.interpolatedPosition||pawn.body.position);
        pawn.owner.traverse(node=>{
          if(frame.visual||!(node&&node.userData&&node.userData.logicElementAssetVisual))return;
          if(node.parent&&node.parent.userData&&node.parent.userData.logicElementAssetVisual)return;
          frame.visual=copy(node.getWorldPosition(new THREE.Vector3()));
        });
      }
      return result;
    };
    actions.renderGameplayCameraRect=rect=>{
      const frame=trace[trace.length-1];if(frame)frame.beforeRender=copy(LOT_KING.core.camera.position);
      const result=originalRender(rect);if(frame)frame.afterRender=copy(LOT_KING.core.camera.position);return result;
    };
  });
  await page.evaluate(() => LOT_KING.pawns.get('sketchbook_pawn_character').setControl({throttle:1,steer:.2}));
  await page.waitForTimeout(2200);
  const metrics=await page.evaluate(() => {
    const capture=window.__lkSketchbookCameraTrace,trace=capture.trace.filter(frame=>frame.owner&&frame.body&&frame.beforeRender);
    LOT_KING.pawns.get('sketchbook_pawn_character').clearControl();
    LOT_KING.actions.stepGameplayPreview=capture.originalStep;
    LOT_KING.actions.renderGameplayCameraRect=capture.originalRender;
    const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
    let maxBodyOwnerError=0,maxVisualOwnerError=0,maxCameraStep=0,maxBetweenWriters=0,maxRenderMutation=0,pingPong=0;
    for(let index=0;index<trace.length;index++){
      const frame=trace[index],expected=[frame.body[0],frame.body[1]-.5,frame.body[2]];
      maxBodyOwnerError=Math.max(maxBodyOwnerError,distance(frame.owner,expected));
      if(frame.visual)maxVisualOwnerError=Math.max(maxVisualOwnerError,distance(frame.visual,frame.owner));
      maxBetweenWriters=Math.max(maxBetweenWriters,distance(frame.after,frame.beforeRender));
      maxRenderMutation=Math.max(maxRenderMutation,distance(frame.beforeRender,frame.afterRender));
      if(!index)continue;
      maxCameraStep=Math.max(maxCameraStep,distance(frame.after,trace[index-1].after));
      if(index>1){
        const a=trace[index-2].after,b=trace[index-1].after,c=frame.after;
        const ab=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],bc=[c[0]-b[0],c[1]-b[1],c[2]-b[2]];
        const abLength=Math.hypot(...ab),bcLength=Math.hypot(...bc),dot=ab[0]*bc[0]+ab[1]*bc[1]+ab[2]*bc[2];
        if(abLength>.5&&bcLength>.5&&dot<-.5*abLength*bcLength)pingPong++;
      }
    }
    return {frames:trace.length,maxBodyOwnerError,maxVisualOwnerError,maxCameraStep,maxBetweenWriters,maxRenderMutation,pingPong};
  });
  console.log('Sketchbook camera stability',JSON.stringify(metrics));
  expect(metrics.frames).toBeGreaterThan(30);
  expect(metrics.maxBodyOwnerError).toBeLessThan(1e-3);
  expect(metrics.maxVisualOwnerError).toBeLessThan(1e-3);
  expect(metrics.maxBetweenWriters).toBeLessThan(1e-6);
  expect(metrics.maxRenderMutation).toBeLessThan(1e-6);
  expect(metrics.maxCameraStep).toBeLessThan(.5);
  expect(metrics.pingPong).toBe(0);
  expect(errors).toEqual([]);
});
