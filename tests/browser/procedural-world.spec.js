'use strict';

const {test, expect} = require('@playwright/test');

test('procedural world boots in the editor with a bounded renderer budget', async ({page}) => {
  test.setTimeout(120000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?procedural-world-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(window.LK_STORE && window.LOT_KING
    && LOT_KING.systems && LOT_KING.systems.proceduralWorld), null, {timeout:90000});

  const audit = await page.evaluate(async () => {
    const data = LK_STORE.blank();
    data.characterGround = {minX:-40, maxX:40, minZ:-28, maxZ:28};
    data.proceduralWorld = {
      enabled:true,
      seed:4242,
      terrain:{quality:'medium'},
      ocean:{quality:'medium'},
      archipelago:{enabled:true, count:12},
      waterBodies:[{id:'e2e-lake', kind:'lake', x:12, z:8, radius:7}],
    };
    await LK_STORE.apply(LOT_KING, data, {strict:false});
    const world = LOT_KING.systems.proceduralWorld;
    const stats = world.stats();
    const config = world.get();
    let roots = 0;
    LOT_KING.core.scene.traverse(object => {
      if(object.name === 'Procedural Worldscape') roots++;
    });
    return {
      stats,
      roots,
      centre:world.heightAt(0, 0),
      coast:world.heightAt(400, 400),
      waterBodies:config.waterBodies,
      physics:world.physicsDescriptor(),
    };
  });

  expect(audit.roots).toBe(1);
  expect(audit.centre).toBeCloseTo(0, 5);
  expect(audit.coast).toBeLessThan(0);
  expect(audit.stats.terrainDrawCalls).toBe(1);
  expect(audit.stats.waterDrawCalls).toBeLessThanOrEqual(4);
  expect(audit.stats.islandDrawCalls).toBe(1);
  expect(audit.stats.terrainVertices).toBeLessThan(20000);
  expect(audit.stats.animatedWaterVertices).toBeLessThan(10000);
  expect(audit.waterBodies).toEqual(expect.arrayContaining([
    expect.objectContaining({id:'e2e-lake', kind:'lake'}),
  ]));
  expect(audit.physics).toBeTruthy();
  expect(pageErrors).toEqual([]);
});
