'use strict';

// Reloading a level must not cost GPU memory that is never given back.
//
// It used to. `STORE.apply()` built one object per scene entry without removing
// what a previous apply had added, so every level load and every Play cycle
// stacked another whole scene on top of the last one. Measured here before the
// fix: ~2000 scene objects, ~900 geometries and ~2280 textures added per apply,
// none released, and the tab was killed by the fourth cycle. The JS heap stayed
// flat throughout - geometry and textures live on the GPU - which is why the
// symptom read as the machine degrading over a session rather than as a leak.
//
// This spec drives the cycle a user actually performs and asserts the counts
// PLATEAU. It deliberately checks growth between cycles rather than absolute
// numbers, so it survives content changes to the level.

const {test, expect} = require('@playwright/test');

test('reloading a level and cycling Play does not grow GPU resources', async ({page}) => {
  test.setTimeout(420000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?gpu-budget=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(window.LK_STORE && window.LK_STORE.levels && window.LOT_KING
    && LOT_KING.core && LOT_KING.core.renderer), null, {timeout:120000});

  const sample = () => page.evaluate(() => {
    const info = LOT_KING.core.renderer && LOT_KING.core.renderer.info || {};
    let sceneObjects = 0;
    const materials = new Set(), textures = new Set();
    LOT_KING.core.scene.traverse(node => {
      sceneObjects++;
      const material = node.material;
      if(!material) return;
      (Array.isArray(material) ? material : [material]).forEach(one => {
        materials.add(one.uuid);
        Object.keys(one).forEach(key => { const value = one[key]; if(value && value.isTexture) textures.add(value.uuid); });
      });
    });
    return {
      sceneObjects, materials:materials.size, textures:textures.size,
      geometries:info.memory ? info.memory.geometries : 0,
    };
  });
  const cycle = async () => {
    await page.evaluate(async () => {
      await Promise.resolve(LK_STORE.ready);
      // A light level, so the cycle completes under software rendering too.
      const scene = LK_STORE.levels.templateScene(LOT_KING, 'fps-shooter-test');
      await LK_STORE.apply(LOT_KING, scene, {strict:false});
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.getElementById('lkPlay').click());
    await page.waitForTimeout(3500);
    await page.evaluate(() => document.getElementById('lkPlay').click());
    await page.waitForTimeout(2500);
    return sample();
  };

  // The first cycle is the one that legitimately builds the level.
  const first = await cycle();
  expect(first.sceneObjects, 'the level has to actually build').toBeGreaterThan(1000);
  const second = await cycle();
  const third = await cycle();

  // A second and third identical load may still settle a little - Play adds its
  // HUD and a few effect targets - but it must not add another level's worth.
  const budget = {
    sceneObjects:Math.max(150, Math.round(first.sceneObjects * .1)),
    textures:Math.max(80, Math.round(first.textures * .1)),
    materials:Math.max(80, Math.round(first.materials * .1)),
    geometries:Math.max(120, Math.round(first.geometries * .25)),
  };
  Object.keys(budget).forEach(key => {
    const growth = third[key] - first[key];
    expect(growth, key + ' grew by ' + growth + ' over two extra identical loads'
      + ' (' + first[key] + ' -> ' + second[key] + ' -> ' + third[key] + ')').toBeLessThanOrEqual(budget[key]);
  });
  // And the third load must be no worse than the second: the series has settled.
  expect(third.sceneObjects - second.sceneObjects).toBeLessThanOrEqual(budget.sceneObjects);
  expect(third.textures - second.textures).toBeLessThanOrEqual(budget.textures);

  expect(errors).toEqual([]);
});
