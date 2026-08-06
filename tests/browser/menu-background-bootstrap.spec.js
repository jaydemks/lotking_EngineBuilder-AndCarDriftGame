'use strict';

const {test,expect}=require('@playwright/test');

test('cold landing loads the lightweight editor menu progressively and releases it before Editor',async({page})=>{
  test.setTimeout(120000);
  const requests=[],pageErrors=[];
  page.on('request',request=>requests.push(request.url()));
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.addInitScript(()=>{
    localStorage.clear();sessionStorage.clear();
    localStorage.setItem('lotking.index.welcome.hidden.v1','1');
    // Reproduce an interrupted save: the index survived but its project did not.
    localStorage.setItem('lotking.levels.v1',JSON.stringify({version:1,activeId:'orphan-menu',levels:[{id:'orphan-menu',name:'Orphan Menu',levelRole:'editor-menu'}]}));
    window.__menuBootSteps=[];
    addEventListener('lot-king:index-menu-background-progress',event=>{
      const detail=event&&event.detail||{};
      window.__menuBootSteps.push({progress:Number(detail.progress)||0,step:detail.step||detail.label||''});
    });
  });
  await page.goto('/index.html?menu-bootstrap-e2e=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__LK_MENU_BACKGROUND_READY===true,null,{timeout:90000});
  const result=await page.evaluate(()=>({level:window.__LK_MENU_BACKGROUND_LEVEL,steps:window.__menuBootSteps||[]}));
  expect(result.level&&result.level.role).toBe('editor-menu');
  const decorativePlayer=await page.locator('#menuBgFrame').evaluate(frame=>{
    const game=frame.contentWindow&&frame.contentWindow.LOT_KING;
    const player=game&&game.player;
    const car=player&&player.car;
    return {
      enabled:player&&player.enabled,
      hidden:player&&player.hidden,
      visible:car&&car.visible,
      modelName:car&&car.userData&&car.userData.modelName,
    };
  });
  expect(decorativePlayer).toMatchObject({enabled:false,hidden:false,visible:true,modelName:'player_4'});
  expect(requests.some(url=>url.includes('/demo/menu-levels/editor-menu.lkep.json'))).toBe(true);
  expect(requests.some(url=>url.includes('/demo/demo-project/chunks/'))).toBe(false);
  const labels=result.steps.map(item=>item.step).join('|');
  expect(labels).toContain('downloading lightweight role menu');
  expect(labels).toContain('applying role menu level');
  expect(new Set(result.steps.map(item=>Math.round(item.progress))).size).toBeGreaterThan(4);

  await page.locator('#editorBtn').click();
  await page.waitForFunction(()=>document.body.classList.contains('showing-editor'),null,{timeout:60000});
  const state=await page.evaluate(()=>({
    menuUrl:document.getElementById('menuBgFrame').contentWindow.location.href,
    editorReady:!!(document.getElementById('editorFrame').contentWindow.LOT_KING&&document.getElementById('editorFrame').contentWindow.LOT_KING.core&&document.getElementById('editorFrame').contentWindow.LOT_KING.core.renderer),
  }));
  expect(state.menuUrl).toContain('about:blank');
  expect(state.editorReady).toBe(true);
  expect(pageErrors).toEqual([]);
});
