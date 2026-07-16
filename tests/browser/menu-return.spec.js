'use strict';

const {test, expect} = require('@playwright/test');

async function installLightweightFrames(page){
  await page.addInitScript(() => {
    localStorage.setItem('lotking.index.welcome.hidden.v1', '1');
  });
  await page.route('**/gameplay.html*', async route => {
    const url = new URL(route.request().url());
    const menuPreview = url.searchParams.get('menuPreview');
    const body = menuPreview
      ? `<script>
          parent.postMessage({type:'lot-king:menu-background-progress', progress:80, label:'test menu'}, '*');
          setTimeout(() => parent.postMessage({type:'lot-king:menu-background', ready:true, progress:100}, '*'), 20);
        <\/script>`
      : `<button id="returnMenu">Return menu</button>
        <script>
          document.getElementById('returnMenu').onclick = () =>
            parent.postMessage({type:'lot-king:return-menu', source:'gameplay'}, '*');
        <\/script>`;
    await route.fulfill({status:200, contentType:'text/html', body});
  });
  await page.route('**/engine_editor.html*', route => route.fulfill({
    status:200,
    contentType:'text/html',
    body:`<button id="returnMenu">Return menu</button>
      <script>
        document.getElementById('returnMenu').onclick = () =>
          parent.postMessage({type:'lot-king:return-menu', source:'editor'}, '*');
      <\/script>`,
  }));
}

async function expectRestoredMenu(page){
  await expect.poll(() => page.locator('body').evaluate(body => ({
    gameplay:body.classList.contains('showing-gameplay'),
    editor:body.classList.contains('showing-editor'),
    loading:document.getElementById('overlay').classList.contains('menu-preloading'),
    background:document.getElementById('menuBgFrame').getAttribute('src'),
  }))).toMatchObject({
    gameplay:false,
    editor:false,
    loading:false,
  });
  await expect(page.locator('#menuBgFrame')).toHaveAttribute('src', /menuPreview=editor&menuBgRev=/);
}

test.beforeEach(async ({page}) => {
  await installLightweightFrames(page);
  await page.goto('/index.html', {waitUntil:'domcontentloaded'});
  await expect(page.locator('#overlay')).not.toHaveClass(/menu-preloading/);
});

test('returning from embedded gameplay restores a fresh landing menu', async ({page}) => {
  await page.locator('#playBtn').click();
  await expect(page.locator('body')).toHaveClass(/showing-gameplay/);
  await page.frameLocator('#gameplayFrame').locator('#returnMenu').click();
  await expectRestoredMenu(page);
  await expect(page.locator('#gameplayFrame')).toHaveAttribute('src', 'about:blank');
});

test('returning from embedded editor restores a fresh landing menu', async ({page}) => {
  await page.locator('#editorBtn').click();
  await expect(page.locator('body')).toHaveClass(/showing-editor/);
  await page.frameLocator('#editorFrame').locator('#returnMenu').click();
  await expectRestoredMenu(page);
  await expect(page.locator('#editorFrame')).toHaveAttribute('src', 'about:blank');
});
