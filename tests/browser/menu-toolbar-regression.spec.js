'use strict';

const {test, expect} = require('@playwright/test');

test('published editor-menu background is ready on a cold first load', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('lotking.index.welcome.hidden.v1', '1');
  });
  await page.goto('/index.html?cold-menu-regression=1', {waitUntil:'domcontentloaded'});
  await expect.poll(() => page.evaluate(() => ({
    ready:window.__LK_MENU_BACKGROUND_READY,
    level:window.__LK_MENU_BACKGROUND_LEVEL,
    loading:document.getElementById('overlay').classList.contains('menu-preloading'),
  })), {timeout:90000}).toMatchObject({
    ready:true,
    level:{role:'editor-menu'},
    loading:false,
  });
  const frameState = await page.frameLocator('#menuBgFrame').locator('body').evaluate(() => ({
    role:window.LOT_KING && LOT_KING.state && LOT_KING.state.menuBackgroundLevel && LOT_KING.state.menuBackgroundLevel.role,
    registry:window.LOT_KING && LOT_KING.world && Array.isArray(LOT_KING.world.registry) ? LOT_KING.world.registry.length : 0,
  }));
  expect(frameState.role).toBe('editor-menu');
  expect(frameState.registry).toBeGreaterThan(0);
  expect(await page.evaluate(() => localStorage.getItem('lk.projectWorkspace.v1'))).toBeNull();
});

test('published gameplay snapshot is complete on its first cold application', async ({page}) => {
  test.setTimeout(120000);
  await page.addInitScript(async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({
      mode:'browser',
      onlineEditor:true,
      workspaceReady:true,
      startupTemplate:'demo',
    }));
    sessionStorage.setItem('lk.autolaunch', 'online-demo');
    await new Promise(resolve => {
      const request = indexedDB.deleteDatabase('lotking-assets');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
      setTimeout(resolve, 1500);
    });
  });
  await page.goto('/gameplay.html?cold-gameplay-regression=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && window.LK_STORE && LK_STORE.ensureApplied, null, {timeout:30000});
  const result = await page.evaluate(async () => {
    const published = await fetch('demo/demo-project.lkep.json?cold-audit=1', {cache:'no-store'}).then(response => response.json());
    let loadError = null;
    try { await LK_STORE.ensureApplied(LOT_KING); }
    catch(error){ loadError = String(error && error.message || error); }
    const expected = (published.scene && published.scene.added || []).map(entry => String(entry.id));
    const actual = new Set((LOT_KING.world.registry || [])
      .filter(object => object && object.userData && object.userData.builtin !== true)
      .map(object => String(object.userData.editorId)));
    return {
      sceneReady:LOT_KING.state.sceneReady,
      applied:LK_STORE.appliedInfo(),
      expected:expected.length,
      missing:expected.filter(id => !actual.has(id)),
      loadError,
    };
  });
  expect(result).toMatchObject({loadError:null});
  expect(result.sceneReady).toBe(true);
  expect(result.applied).toMatchObject({applied:true, mode:'active', levelId:'online-demo'});
  expect(result.expected).toBeGreaterThan(0);
  expect(result.missing).toEqual([]);
});

test('editor toolbar keeps preview fixed and makes every project command reachable', async ({page}) => {
  await page.setViewportSize({width:640, height:760});
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?responsive-toolbar-regression=1', {waitUntil:'domcontentloaded'});
  await expect(page.locator('#startBtn')).toBeHidden();
  await expect(page.locator('#editorBtn')).toBeHidden();
  await expect(page.locator('#menuMusicBtn')).toBeHidden();
  await expect(page.locator('#levelSelect')).toBeHidden();
  await expect(page.locator('#overlay .sub')).toHaveText('Loading editor workspace');
  await page.waitForFunction(() => window.LOT_KING && LOT_KING.editor && LOT_KING.editor.state.active === true, null, {timeout:60000});
  await page.evaluate(() => {
    document.querySelector('#lkWorkspaceClose')?.click();
    document.querySelector('#lkProjectsClose')?.click();
  });

  const layout = await page.locator('#lkTopbar').evaluate(topbar => {
    const primary = topbar.querySelector('.lk-topbar-primary').getBoundingClientRect();
    const project = topbar.querySelector('.lk-topbar-project').getBoundingClientRect();
    const preview = topbar.querySelector('.lk-preview-tools').getBoundingClientRect();
    const strip = topbar.querySelector('.lk-project-tools');
    return {
      primaryTop:primary.top,
      projectTop:project.top,
      previewLeft:preview.left,
      previewRight:preview.right,
      projectScrollable:strip.scrollWidth > strip.clientWidth,
    };
  });
  expect(layout.projectTop).toBeGreaterThan(layout.primaryTop);
  expect(layout.previewLeft).toBeGreaterThanOrEqual(0);
  expect(layout.previewRight).toBeLessThanOrEqual(640);
  expect(layout.projectScrollable).toBe(true);
  await expect(page.locator('#lkPlay')).toBeVisible();
  await expect(page.locator('#lkSimulate')).toBeVisible();
  await expect(page.locator('#lkExit')).toBeVisible();

  await page.locator('#lkSnap').hover();
  await expect(page.locator('.lk-snapfields')).toBeVisible();
  const snapPopup = await page.locator('.lk-snapfields').evaluate(element => {
    const popup = element.getBoundingClientRect();
    const topbar = document.getElementById('lkTopbar').getBoundingClientRect();
    return {top:popup.top, left:popup.left, right:popup.right, topbarBottom:topbar.bottom};
  });
  expect(snapPopup.top).toBeGreaterThanOrEqual(snapPopup.topbarBottom);
  expect(snapPopup.left).toBeGreaterThanOrEqual(0);
  expect(snapPopup.right).toBeLessThanOrEqual(640);

  await page.locator('.lk-project-tools').evaluate(strip => { strip.scrollLeft = strip.scrollWidth; });
  const resetRect = await page.locator('#lkResetScene').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {left:rect.left, right:rect.right};
  });
  expect(resetRect.left).toBeGreaterThanOrEqual(0);
  expect(resetRect.right).toBeLessThanOrEqual(640);
});
