'use strict';

const {test, expect} = require('@playwright/test');

test('Character template pack loads in the browser runtime', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?character-template-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal')));
  const result = await page.evaluate(() => {
    const template = window.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal');
    const npcTemplate = window.LK_LOGIC_TEMPLATES.get('logic-template-talkable-civil-npc');
    const registry = window.LK_LOGIC_NODES_MVP.createRegistry();
    const walk = template.graph.variables.find(variable => variable.binding === 'animations.walk');
    const level = window.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE.buildScene({version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}});
    return {
      threeRevision:window.THREE && THREE.REVISION,
      preset:template.graph.characterPawn.preset,
      walkDescription:walk && walk.description,
      hasMoveNode:!!registry.get('character.setMoveInput'),
      hasPawnOwnerNode:!!registry.get('pawn.getOwner'),
      npcPreset:npcTemplate && npcTemplate.graph.characterPawn.preset,
      houseCount:level.added.filter(entry => /^House \d Body$/.test(entry.name)).length,
      hasScooter:level.added.some(entry => entry.name === 'Green Scooter Body'),
      levelNativeEditable:level.template.nativeEditable,
      levelTemplate:window.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE && window.LK_RUNTIME_CHARACTER_LEVEL_TEMPLATE.id,
    };
  });
  expect(result).toEqual({
    threeRevision:'185',
    preset:'normal',
    walkDescription:expect.stringMatching(/in-place.*root motion/i),
    hasMoveNode:true,
    hasPawnOwnerNode:true,
    npcPreset:'civil',
    houseCount:8,
    hasScooter:true,
    levelNativeEditable:true,
    levelTemplate:'character-movement-playground',
  });
  expect(pageErrors).toEqual([]);
});
