'use strict';

const {test, expect} = require('@playwright/test');

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?cinema-video-export-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && window.LK_STORE &&
    window.LK_EDITOR_CINEMA_VIDEO_EXPORT && LOT_KING.editor && LOT_KING.editor.state, null, {timeout:60000});
  await page.evaluate(() => {
    document.querySelector('#lkWorkspaceClose')?.click();
    document.querySelector('#lkProjectsClose')?.click();
    if(!LOT_KING.editor.state.active) LOT_KING.editor.enter();
  });
  await page.waitForFunction(() => LOT_KING.editor.state.active === true, null, {timeout:60000});
});

test('Cinema Studio exposes fixed-step video export and writes a WebM', async ({page}, testInfo) => {
  test.setTimeout(180000);
  test.skip(testInfo.project.name !== 'desktop-chromium', 'One encoding pass is enough');
  const setup = await page.evaluate(() => {
    const game = LOT_KING;
    const store = LK_STORE;
    const camera = store.createSceneCamera({fov:52, near:.05, far:800, helperSize:1, preview:true});
    store.registerAdded(game, camera, {
      id:store.nextId(),
      kind:'camera',
      name:'Export Camera',
      collide:false,
      props:Object.assign({}, camera.userData.cameraProps),
      t:{p:[0,4,12],r:[-.12,0,0],s:[1,1,1],v:true},
    });
    const studio = store.createCinemaStudio({
      duration:.1,
      fps:10,
      playback:'one-shot',
      trigger:'manual',
      previewCamera:camera.userData.editorId,
      cameraCuts:[{id:'export-shot',type:'shot',time:0,duration:.1,cameraId:camera.userData.editorId,name:'Export shot'}],
    });
    store.registerAdded(game, studio, {
      id:store.nextId(),
      kind:'cinemaStudio',
      name:'Frame Accurate E2E',
      collide:false,
      props:Object.assign({}, studio.userData.cinemaProps),
      t:{p:[0,.05,0],r:[0,0,0],s:[1,1,1],v:true},
    });
    LOT_KING.editor.openCinemaVideoExport(studio);
    return {studioId:studio.userData.editorId};
  });

  await expect(page.locator('#lkCinemaExportOverlay')).toHaveClass(/on/);
  await expect(page.locator('#lkCinemaExportSummary')).toContainText('1 frame');
  await page.evaluate(() => {
    const select = document.querySelector('#lkCinemaExportResolution');
    select.add(new Option('Test · 640×360', '640x360'));
  });
  await page.locator('#lkCinemaExportResolution').selectOption('640x360');
  await page.locator('#lkCinemaExportFile').fill('frame-accurate-e2e');

  const unsupported = await page.locator('#lkCinemaExportStart').isDisabled();
  test.skip(unsupported, 'WebCodecs is unavailable in this Chromium build');
  await page.evaluate(() => {
    window.__cinemaExportDownload = null;
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){
      if(String(this.download || '').endsWith('.webm') && String(this.href || '').startsWith('blob:')){
        const name = this.download;
        fetch(this.href).then(response => response.blob()).then(async blob => {
          const signature = Array.from(new Uint8Array(await blob.slice(0, 4).arrayBuffer()));
          window.__cinemaExportDownload = {name, size:blob.size, type:blob.type, signature};
        });
        return;
      }
      return originalClick.call(this);
    };
  });
  await page.locator('#lkCinemaExportStart').click();
  await expect(page.locator('#lkCinemaExportProgress')).toContainText(/Completed|Completato/, {timeout:90000});
  await page.waitForFunction(() => window.__cinemaExportDownload && window.__cinemaExportDownload.size > 100, null, {timeout:30000});
  const download = await page.evaluate(() => window.__cinemaExportDownload);
  expect(download).toMatchObject({
    name:'frame-accurate-e2e.webm',
    type:'video/webm',
    signature:[0x1a, 0x45, 0xdf, 0xa3],
  });
  expect(download.size).toBeGreaterThan(100);
  expect(await page.evaluate(id => ({
    exporting:LOT_KING.editor.state.cinemaExporting,
    studioExists:LOT_KING.world.registry.some(item => item && item.userData && item.userData.editorId === id),
  }), setup.studioId)).toEqual({exporting:false, studioExists:true});
});
