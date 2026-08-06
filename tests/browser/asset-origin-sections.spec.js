'use strict';

const {test,expect}=require('@playwright/test');

test('Asset panel separates Engine, User and enabled Plugin assets',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1',JSON.stringify({mode:'browser',onlineEditor:true,workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?asset-origin-e2e=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LOT_KING&&LOT_KING.state&&LOT_KING.state.sceneReady===true,null,{timeout:30000});
  await page.evaluate(()=>{document.querySelector('#lkWorkspaceClose')?.click();document.querySelector('#lkProjectsClose')?.click();});
  await page.evaluate(()=>LOT_KING.editor.enter());
  await page.waitForFunction(()=>document.querySelector('#lkEditor.active'));
  await page.evaluate(()=>LOT_KING.editor.refreshAssetsPanel());
  const headings=page.locator('#lkAssetsPanel .lk-asset-origin strong');
  await expect(headings).toContainText(['ENGINE ASSETS','USER ASSETS']);
  await expect(page.locator('#lkAssetsPanel .lk-asset-origin-plugin')).toHaveCount(0);

  await page.evaluate(()=>{
    LOT_KING.editor.plugins.register({id:'e2e-asset-pack',name:'E2E Asset Pack',version:'1.0.0',register(api){api.assetProvider('props',{assets:()=>[{id:'beacon',name:'Plugin Beacon',type:'effect',place:()=>null}]});}});
    LOT_KING.editor.refreshAssetsPanel();
  });
  await expect(page.locator('#lkAssetsPanel .lk-asset-origin-plugin strong')).toHaveText('PLUGIN ASSETS');
  await expect(page.locator('#lkAssetsPanel .lk-asset-item',{hasText:'Plugin Beacon'})).toHaveCount(1);

  await page.evaluate(()=>{LOT_KING.editor.plugins.setEnabled('e2e-asset-pack',false);LOT_KING.editor.refreshAssetsPanel();});
  await expect(page.locator('#lkAssetsPanel .lk-asset-origin-plugin')).toHaveCount(0);
});
