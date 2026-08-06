'use strict';

const {test, expect} = require('@playwright/test');

test('AAAA templates and Animal Pawn are discoverable in the real editor shell', async ({page}) => {
  test.setTimeout(180000);
  const pageErrors = [];
  const httpErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if(response.status() < 400) return;
    const url = response.url();
    if(response.status() === 404 && /\/__lotking\/project-state(?:[?#]|$)/.test(url)) return;
    httpErrors.push(response.status() + ' ' + url);
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?aaaa-templates-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(
    window.LK_STORE && LK_STORE.levels &&
    window.LK_LEVEL_TEMPLATES &&
    window.LK_LOGIC_TEMPLATES_ANIMAL &&
    window.LK_RUNTIME_ANIMAL_PAWNS &&
    window.LK_RUNTIME_OBJECTIVES
  ));

  const result = await page.evaluate(() => {
    const ids = ['snowboarding-objective-run', 'jungle-car-escape', 'fps-enemy-outpost', 'cat-neighborhood-adventure'];
    const levels = ids.map(id => {
      const scene = LK_STORE.levels.templateScene(LOT_KING, id);
      return {
        id,
        templateId:scene.template && scene.template.id,
        entries:scene.added.length,
        missionDirectors:scene.added.filter(entry => entry && entry.graph && entry.graph.missionDirector).length,
        logicElements:scene.added.filter(entry => entry && entry.kind === 'logicElement').length,
        nativePlayer:scene.player && scene.player.enabled === true,
      };
    });
    const animalTemplates = ['cat', 'dog', 'horse', 'generic'].map(species => {
      const item = LK_LOGIC_TEMPLATES.get('logic-template-player-animal-' + species);
      return item && item.graph && item.graph.animalPawn && item.graph.animalPawn.species;
    });
    return {
      registered:LK_LEVEL_TEMPLATES.list().map(template => template.id),
      levels,
      animalTemplates,
      cloudPresets:Object.keys(LK_RUNTIME_VOL_CLOUDS.PRESETS || {}).sort(),
    };
  });

  for(const level of result.levels){
    expect(level.templateId).toBe(level.id);
    expect(level.entries).toBeGreaterThan(5);
    expect(level.missionDirectors).toBe(1);
    expect(level.logicElements).toBeGreaterThan(0);
  }
  expect(result.levels.find(level => level.id === 'jungle-car-escape').nativePlayer).toBe(true);
  expect(result.animalTemplates).toEqual(['cat', 'dog', 'horse', 'generic']);
  expect(result.cloudPresets).toEqual(['clear', 'cumulus', 'overcast', 'storm']);
  expect(pageErrors).toEqual([]);
  expect(httpErrors).toEqual([]);
});
