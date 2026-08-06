'use strict';

const {test, expect} = require('@playwright/test');

test('moving the Sketchbook character keeps body, owner, visual and camera in one world-space frame', async ({page}) => {
  test.setTimeout(600000);
  const pageErrors=[];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?sketchbook-motion-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(window.LK_STORE && window.LK_STORE.levels && window.LOT_KING && LOT_KING.systems && LOT_KING.systems.sketchbookPawns));
  await page.evaluate(async () => {
    await Promise.resolve(LK_STORE.ready);
    const scene = LK_STORE.levels.templateScene(LOT_KING, 'open-world-sketchbook');
    await LK_STORE.apply(LOT_KING, scene, {strict:true});
    const owners = LOT_KING.world.registry.filter(o => o && o.userData && o.userData.editorType === 'logicElement');
    await Promise.all(owners.map(o => Promise.resolve(o.userData.logicElementAssetReady).catch(() => null)));
    await Promise.resolve(LOT_KING.actions.startEditorPreview('play'));
    // startPlayPreview() performs exactly this UI hand-off after the shared
    // asynchronous runtime/pre-benchmark has completed. Set it directly here
    // so the workspace chooser cannot intercept the test's synthetic click.
    LOT_KING.editor.state.playPreview=true;
    LOT_KING.editor.state.simulatePreview=false;
    LOT_KING.editor.state.playPreviewMode='play';
    document.documentElement.classList.add('play-preview');
    const button=document.getElementById('lkPlay');if(button)button.textContent='■ STOP';
    await new Promise(resolve=>setTimeout(resolve,1200));
    window.__sketchbookMotionSamples = [];
    window.__sketchbookMotionSampling = true;
    const sampleFrame = () => {
      if(!window.__sketchbookMotionSampling) return;
      const pawn = LOT_KING.pawns.getByPlayerId(1);
      if(pawn && pawn.owner && pawn.body){
        const ownerWorld = pawn.owner.getWorldPosition(new THREE.Vector3());
        const root = (() => { let found=null; pawn.owner.traverse(node => { if(!found && node.userData && node.userData.logicElementAssetVisual && !(node.parent && node.parent.userData && node.parent.userData.logicElementAssetVisual)) found=node; }); return found; })();
        const visualWorld = root ? root.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(NaN,NaN,NaN);
        const body = pawn.body.position, interpolated = pawn.body.interpolatedPosition || body, camera = LOT_KING.core.camera.position;
        window.__sketchbookMotionSamples.push({
          t:performance.now(), owner:[ownerWorld.x,ownerWorld.y,ownerWorld.z], local:[pawn.owner.position.x,pawn.owner.position.y,pawn.owner.position.z],
          body:[body.x,body.y,body.z], interpolated:[interpolated.x,interpolated.y,interpolated.z], visual:[visualWorld.x,visualWorld.y,visualWorld.z],
          camera:[camera.x,camera.y,camera.z], grounded:pawn.state.grounded, speed:pawn.state.speed,
        });
      }
      requestAnimationFrame(sampleFrame);
    };
    requestAnimationFrame(sampleFrame);
  });
  await page.evaluate(() => LOT_KING.pawns.getByPlayerId(1).setControl({throttle:1, steer:0}));
  await page.waitForTimeout(1200);
  await page.evaluate(() => LOT_KING.pawns.getByPlayerId(1).setControl({throttle:1, steer:1}));
  await page.waitForTimeout(1200);
  await page.evaluate(() => LOT_KING.pawns.getByPlayerId(1).clearControl());
  await page.waitForTimeout(300);
  const samples = await page.evaluate(() => { window.__sketchbookMotionSampling=false; return window.__sketchbookMotionSamples; });
  const horizontalDistance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const max=(fn)=>samples.reduce((value,sample,index)=>Math.max(value,fn(sample,index)),0);
  const metrics={
    samples:samples.length,
    travel:samples.length>1?horizontalDistance(samples[0].owner,samples.at(-1).owner):0,
    bodyOwner:max(sample=>horizontalDistance(sample.body,sample.owner)),
    visualOwner:max(sample=>horizontalDistance(sample.visual,sample.owner)),
    ownerStep:max((sample,index)=>index?horizontalDistance(samples[index-1].owner,sample.owner):0),
    cameraStep:max((sample,index)=>index?distance(samples[index-1].camera,sample.camera):0),
  };
  console.log('Sketchbook motion metrics:',JSON.stringify(metrics));
  // SwiftShader can render the complete Open World at only a few frames per
  // second in CI. Continuity is the contract here, not a synthetic FPS floor.
  expect(samples.length).toBeGreaterThan(5);
  expect(metrics.travel).toBeGreaterThan(.5);
  expect(metrics.bodyOwner).toBeLessThan(1e-3);
  expect(metrics.visualOwner).toBeLessThan(1e-3);
  expect(metrics.ownerStep).toBeLessThan(.75);
  expect(metrics.cameraStep).toBeLessThan(2.5);
  expect(Math.min(...samples.map(sample=>distance(sample.camera,sample.owner)))).toBeGreaterThan(1);
  expect(Math.max(...samples.map(sample=>distance(sample.camera,sample.owner)))).toBeLessThan(25);
  expect(pageErrors).toEqual([]);
});
