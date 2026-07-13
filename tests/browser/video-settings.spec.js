'use strict';

const {test, expect} = require('@playwright/test');

async function closeStartupOverlays(page){
  await page.evaluate(() => {
    document.querySelector('#lkWorkspaceClose')?.click();
    document.querySelector('#lkProjectsClose')?.click();
  });
}

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?video-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && LOT_KING.editor && LOT_KING.editor.state.active === true, null, {timeout:60000});
  await closeStartupOverlays(page);
});

test('project rendering authoring is wired to the shared runtime schema', async ({page}) => {
  // The editor root intentionally owns pointer routing over the WebGL canvas;
  // dispatch the pinned inspector action directly in headless mode.
  await page.evaluate(() => document.querySelector('[data-special="rendering"]').click());
  await expect(page.locator('#lkInspector')).toContainText('RENDERING / VIDEO');
  const qualitySelect = page.locator('[data-render-panel="defaults"] .lk-row', {hasText:'Default quality'}).locator('select');
  await expect(qualitySelect.locator('option')).toHaveCount(5);

  const rendererSelect = page.locator('[data-render-panel="defaults"] .lk-row', {hasText:'Renderer'}).locator('select');
  await expect(rendererSelect.locator('option[value="raytracing"]')).toHaveText('Ray lighting');

  const state = await page.evaluate(() => {
    return {
      runtime:LOT_KING.settings.video,
      renderer:LOT_KING.core.renderer.userData.videoSettings,
      project:LOT_KING.settings.getVideoProject(),
      presetCount:Object.keys(LK_RUNTIME_SETTINGS_MENU.presets).length,
      hasRayPass:!!(LOT_KING.systems.post && LOT_KING.systems.post.rayLightingPass),
      hasVideoProfilePass:!!(LOT_KING.systems.post && LOT_KING.systems.post.videoProfilePass),
    };
  });
  expect(state.presetCount).toBe(5);
  expect(state.hasRayPass).toBe(true);
  expect(state.hasVideoProfilePass).toBe(true);
  expect(state.runtime.quality).toBe('high');
  expect(state.renderer.quality).toBe('high');
  expect(state.project.defaults.rendererMode).toBe('webgl');
  expect(state.project.exposed.rendererMode).toBe(true);

  await page.evaluate(() => document.querySelector('[data-special="hud"]').click());
  await expect(page.locator('#lkInspector')).toContainText('HUD / RADIO TAB');
  await page.evaluate(() => {
    document.querySelectorAll('#lkInspector .lk-sec').forEach(section => section.classList.remove('closed'));
  });

  const gameSection = page.locator('.lk-sec', {hasText:'GAME RADIO LIBRARY'});
  const menuSection = page.locator('.lk-sec', {hasText:'MENU MUSIC LIBRARY'});
  await expect(gameSection.locator('button.lk-danger')).not.toHaveCount(0);
  await expect(menuSection.locator('button.lk-danger')).not.toHaveCount(0);

  await page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll('#lkInspector .lk-sec'));
    const game = sections.find(section => section.textContent.includes('GAME RADIO LIBRARY'));
    const remove = game && game.querySelector('button.lk-danger');
    if(remove) remove.click();
  });
  await expect(page.locator('#lkConfirmOverlay.open')).toBeVisible();
  await expect(page.locator('#lkConfirmTitle')).toHaveText('Remove music track?');
  await expect(page.locator('#lkConfirmOk')).toHaveText('Remove track');
});
