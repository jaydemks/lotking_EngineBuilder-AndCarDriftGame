'use strict';

const {test, expect} = require('@playwright/test');

async function seedWorkspace(page){
  await page.route(/\/models\/(?:car1|car2|cone)\.glb(?:\?.*)?$/, route => route.fulfill({status:404, body:''}));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
}

test('illustrated scene style renders and material sketch restores its original', async ({page}) => {
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('console', message => {
    if(message.type() === 'error' && !/Failed to load resource|__lotking\/project-state/.test(message.text())) failures.push(message.text());
  });
  await seedWorkspace(page);
  await page.goto('/engine_editor.html?illustrated-sketch-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && LOT_KING.core && LOT_KING.core.rendererReady);
  await page.evaluate(() => LOT_KING.core.rendererReady);
  await page.waitForFunction(() => LOT_KING.state && LOT_KING.state.sceneReady === true, null, {timeout:30000});
  await page.evaluate(() => { document.querySelector('#lkWorkspaceClose')?.click(); document.querySelector('#lkProjectsClose')?.click(); });
  await page.waitForFunction(() => Number(LOT_KING.core.renderer.info && LOT_KING.core.renderer.info.render && LOT_KING.core.renderer.info.render.calls) > 0);

  const canvas = page.locator('#c');
  const natural = await canvas.screenshot();
  const state = await page.evaluate(async () => {
    const config = LOT_KING.settings.getVideoProject();
    Object.assign(config.defaults, {
      visualStyle:'illustrated-sketch', sketchMedium:'painted-storybook', sketchStrength:.92, sketchDetail:.84,
      sketchPigment:.9, sketchAtmosphere:.76, sketchPaper:.5, monochrome:false,
    });
    config.authority={visualStyle:'author',monochrome:'author'};
    await LOT_KING.settings.setVideoProject(config);
    // A forced project output must win even if player/session code attempts to
    // write both independent preferences directly.
    LOT_KING.settings.video.visualStyle='natural';
    LOT_KING.settings.video.sketchMedium='illustrated-ink';
    LOT_KING.settings.video.sketchPigment=.1;
    LOT_KING.settings.video.sketchAtmosphere=.1;
    LOT_KING.settings.video.monochrome=true;
    await LOT_KING.settings.applyVideo();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    let mesh = null;
    LOT_KING.player.car.traverse(node => {
      if(!mesh && node.isMesh && node.material && !Array.isArray(node.material)) mesh = node;
    });
    if(!mesh) throw new Error('No single-material vehicle mesh available');
    const original = mesh.material;
    const originalMap=original.map||null;
    const textureCanvas=document.createElement('canvas');
    textureCanvas.width=4;textureCanvas.height=4;
    const textureContext=textureCanvas.getContext('2d');
    textureContext.fillStyle='#cf573a';textureContext.fillRect(0,0,2,4);
    textureContext.fillStyle='#3c82bd';textureContext.fillRect(2,0,2,4);
    const pigmentSource=new THREE.CanvasTexture(textureCanvas);
    original.map=pigmentSource;original.needsUpdate=true;
    LK_STORE.applyMatProps(LOT_KING.player.car, {
      allowGlobal:true,
      sketchMaterial:{enabled:true, mode:'color', toneBands:5, preserveTexture:true, paperTint:.12, pigmentStrength:.88},
    });
    const sketch = mesh.material;
    const pigmentDerived=sketch.map!==pigmentSource&&sketch.map&&sketch.map.userData&&sketch.map.userData.lkRuntimeSketchDerived===true;
    LK_STORE.applyMatProps(LOT_KING.player.car, {
      allowGlobal:true,
      sketchMaterial:{enabled:false, mode:'off', toneBands:5, preserveTexture:true, paperTint:.12, pigmentStrength:.88},
    });
    const restored=mesh.material === original&&mesh.material.map===pigmentSource;
    original.map=originalMap;original.needsUpdate=true;
    pigmentSource.dispose();
    return {
      visualStyle:LOT_KING.settings.video.visualStyle,
      sketchMedium:LOT_KING.settings.video.sketchMedium,
      sketchPigment:LOT_KING.settings.video.sketchPigment,
      sketchAtmosphere:LOT_KING.settings.video.sketchAtmosphere,
      monochrome:LOT_KING.settings.video.monochrome,
      authority:LOT_KING.settings.getVideoProject().authority,
      bodyClass:document.body.classList.contains('lk-visual-sketch'),
      converted:sketch !== original && sketch.isMeshToonMaterial === true && sketch.lkSketchOriginalMaterial === original,
      pigmentDerived,
      restored,
      postOk:LOT_KING.systems.post && LOT_KING.systems.post.ok === true,
    };
  });
  const illustrated = await canvas.screenshot();

  expect(state).toEqual({
    visualStyle:'illustrated-sketch', sketchMedium:'painted-storybook', sketchPigment:.9, sketchAtmosphere:.76, monochrome:false,
    authority:{visualStyle:'author',monochrome:'author'}, bodyClass:true, converted:true, pigmentDerived:true, restored:true, postOk:true,
  });
  expect(illustrated.equals(natural)).toBe(false);
  expect(failures.filter(message => !/models\/(?:car1|car2|cone)/.test(message))).toEqual([]);
});
