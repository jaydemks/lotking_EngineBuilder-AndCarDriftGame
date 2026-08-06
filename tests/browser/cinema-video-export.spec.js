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

test('Cinema Sequencer edits duration, saves reusable data and exposes 3D Bezier handles', async ({page}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop viewport covers sequencer authoring');
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const setup = await page.evaluate(() => {
    const game = LOT_KING;
    const store = LK_STORE;
    const camera = store.createSceneCamera({fov:50, near:.05, far:800, helperSize:1, preview:true});
    store.registerAdded(game, camera, {
      id:store.nextId(), kind:'camera', name:'Spline Camera', collide:false,
      props:Object.assign({}, camera.userData.cameraProps),
      t:{p:[0,2,8],r:[0,0,0],s:[1,1,1],v:true},
    });
    const cameraId = camera.userData.editorId;
    const studio = store.createCinemaStudio({
      duration:6,
      fps:24,
      trigger:'on-play',
      previewCamera:cameraId,
      cameraCuts:[{id:'spline-shot', type:'shot', time:0, duration:6, cameraId}],
      objectTracks:[{
        id:'spline-track', type:'object', targetId:cameraId, pathMode:'bezier', pathVisible:true,
        keyframes:[
          {id:'spline-a', time:0, position:[0,2,8], rotation:[0,0,0], scale:[1,1,1], curve:'ease-in-out', spatialMode:'broken', tangentOut:[2,2,0], tangentIn:[-1,0,0]},
          {id:'spline-b', time:6, position:[8,4,0], rotation:[0,1,0], scale:[1,1,1], curve:'linear', spatialMode:'broken', tangentIn:[-2,2,0], tangentOut:[1,0,0]},
        ],
      }],
    });
    store.registerAdded(game, studio, {
      id:store.nextId(), kind:'cinemaStudio', name:'Reusable Spline', collide:false,
      props:Object.assign({}, studio.userData.cinemaProps),
      t:{p:[0,.05,0],r:[0,0,0],s:[1,1,1],v:true},
    });
    game.editor.openCinemaTimeline(studio);
    const state = game.editor.state;
    state.cinemaSelectedItem = {type:'objectKey', id:'spline-track', keyId:'spline-a', curve:'ease-in-out'};
    state.cinemaPreview = {id:studio.userData.editorId, time:0, playing:false};
    game.editor.openCinemaTimeline(studio);
    return {studioId:studio.userData.editorId, cameraId};
  });

  const stateAudit = await page.evaluate(() => ({
    active:LOT_KING.editor.state.active,
    playPreview:LOT_KING.editor.state.playPreview,
    timelineOpen:LOT_KING.editor.state.cinemaTimelineOpen,
    timelineId:LOT_KING.editor.state.cinemaTimelineId,
    selectedType:LOT_KING.editor.state.selected && LOT_KING.editor.state.selected.userData.editorType,
    selectedId:LOT_KING.editor.state.selected && LOT_KING.editor.state.selected.userData.editorId,
  }));
  expect(stateAudit).toMatchObject({active:true, playPreview:false, timelineOpen:true, selectedType:'cinemaStudio'});
  await page.waitForTimeout(500);
  expect(pageErrors).toEqual([]);
  await expect(page.locator('#lkCinemaTimeline')).toHaveClass(/on/);
  await expect(page.locator('#lkCinemaTlDuration')).toHaveValue('6');
  await expect(page.locator('#lkCinemaClipPanel')).toContainText(/Spatial path/i);
  await expect(page.locator('#lkCinemaTlExportWeb')).toBeVisible();

  await page.locator('#lkCinemaTlDuration').fill('12.5');
  await page.locator('#lkCinemaTlDuration').blur();
  await expect(page.locator('#lkCinemaTlDuration')).toHaveValue('12.5');

  const helperAudit = await page.evaluate(id => {
    const studio = LOT_KING.world.registry.find(item => item && item.userData && item.userData.editorId === id);
    const handles = [];
    LOT_KING.core.scene.traverse(node => {
      if(node.userData && node.userData.cinemaPathHandle) handles.push(node);
    });
    const tangent = handles.find(node => node.userData.cinemaHandleKind === 'out');
    if(tangent){
      tangent.position.x += 1;
      LOT_KING.editor.state.cinemaPathHandleChange(tangent);
    }
    const key = studio.userData.cinemaProps.objectTracks[0].keyframes[0];
    return {
      duration:studio.userData.cinemaProps.duration,
      handles:handles.length,
      allEditorOnly:handles.every(node => node.userData.editorOnly && node.userData.nonExportable),
      tangentOut:key.tangentOut,
    };
  }, setup.studioId);
  expect(helperAudit.duration).toBe(12.5);
  expect(helperAudit.handles).toBeGreaterThanOrEqual(4);
  expect(helperAudit.allEditorOnly).toBe(true);
  expect(helperAudit.tangentOut[0]).toBeGreaterThan(2);

  await page.evaluate(() => {
    window.__cinemaSequenceDownload = null;
    const originalCreateObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function(blob){
      blob.text().then(text => {
        const data = JSON.parse(text);
        window.__cinemaSequenceDownload = {name:'', data};
      });
      return originalCreateObjectURL(blob);
    };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){
      if(String(this.download || '').endsWith('.lkcinema.json')){
        const name = this.download;
        const saveName = () => {
          if(window.__cinemaSequenceDownload) window.__cinemaSequenceDownload.name = name;
          else setTimeout(saveName, 0);
        };
        saveName();
        return;
      }
      return originalClick.call(this);
    };
  });
  await page.evaluate(() => document.querySelector('#lkCinemaTlSaveSequence').click());
  await page.waitForFunction(() => window.__cinemaSequenceDownload && window.__cinemaSequenceDownload.data);
  const asset = await page.evaluate(() => window.__cinemaSequenceDownload);
  expect(asset.name).toBe('Reusable Spline.lkcinema.json');
  expect(asset.data.kind).toBe('lotking-cinema-sequence');
  expect(asset.data.sequence.duration).toBe(12.5);
  expect(asset.data.bindings.some(binding => binding.kind === 'camera' && binding.name === 'Spline Camera')).toBe(true);

  const portableAsset = JSON.parse(JSON.stringify(asset.data));
  const originalCameraId = portableAsset.bindings.find(binding => binding.kind === 'camera').sourceId;
  const portableCameraId = 'portable-camera-binding';
  portableAsset.bindings.filter(binding => binding.sourceId === originalCameraId).forEach(binding => { binding.sourceId = portableCameraId; });
  portableAsset.sequence.previewCamera = portableCameraId;
  portableAsset.sequence.cameraCuts.forEach(shot => { shot.cameraId = portableCameraId; });
  portableAsset.sequence.objectTracks.forEach(track => { track.targetId = portableCameraId; });
  await page.evaluate(id => {
    const studio = LOT_KING.world.registry.find(item => item && item.userData && item.userData.editorId === id);
    studio.userData.cinemaProps.duration = 2;
  }, setup.studioId);
  await page.locator('#lkCinemaSequenceInput').setInputFiles({
    name:'portable.lkcinema.json',
    mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(portableAsset)),
  });
  await expect.poll(() => page.evaluate(id => {
    const studio = LOT_KING.world.registry.find(item => item && item.userData && item.userData.editorId === id);
    return studio.userData.cinemaProps.duration;
  }, setup.studioId)).toBe(12.5);
  const importedBindings = await page.evaluate(id => {
    const studio = LOT_KING.world.registry.find(item => item && item.userData && item.userData.editorId === id);
    const props = studio.userData.cinemaProps;
    return {previewCamera:props.previewCamera, shot:props.cameraCuts[0].cameraId, object:props.objectTracks[0].targetId};
  }, setup.studioId);
  expect(importedBindings).toEqual({previewCamera:setup.cameraId, shot:setup.cameraId, object:setup.cameraId});
});
