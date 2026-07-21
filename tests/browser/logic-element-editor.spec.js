'use strict';

const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const JSZip = require('jszip');

async function closeStartupOverlays(page){
  await page.evaluate(() => {
    document.querySelector('#lkWorkspaceClose')?.click();
    document.querySelector('#lkProjectsClose')?.click();
  });
  await page.waitForFunction(() => {
    const projects = document.querySelector('#lkProjectsOverlay');
    const workspace = document.querySelector('.lk-workspace-overlay');
    const hidden = node => !node || getComputedStyle(node).display === 'none' || getComputedStyle(node).visibility === 'hidden' || !node.getClientRects().length;
    return hidden(projects) && hidden(workspace);
  });
}

async function canvasRenderSummary(page, canvas, testInfo, name){
  const info = await canvas.evaluate(node => {
    const width = Math.max(1, node.width);
    const height = Math.max(1, node.height);
    const rect = node.getBoundingClientRect();
    return {
      ok:!!(node.getContext('webgl2') || node.getContext('webgl') || node.getContext('experimental-webgl')),
      width,
      height,
      rectWidth:rect.width,
      rectHeight:rect.height,
    };
  });
  // The runtime canvas is continuously animated, so Locator.screenshot can
  // wait forever for DOM stability. Capture its current clip from the page.
  const box = await canvas.boundingBox();
  const shot = await page.screenshot({path:testInfo.outputPath(name + '.png'), clip:box, animations:'disabled'});
  return Object.assign(info, {screenshotBytes:shot.length});
}

async function openInspectorSection(page, name){
  const section = page.locator('#lkInspector .lk-sec', {has:page.locator('.lk-sec-h', {hasText:new RegExp('^' + name + '$')})}).first();
  await expect(section).toBeVisible();
  if(await section.evaluate(node => node.classList.contains('closed'))) await section.locator('.lk-sec-h').click();
  return section;
}

async function addLogicElement(page){
  if(page.viewportSize() && page.viewportSize().width < 700){
    await page.evaluate(() => {
      document.querySelector('#lkAddMenu')?.click();
      const item = Array.from(document.querySelectorAll('#lkCtx .lk-submenu .lk-menu-item'))
        .find(node => node.textContent.includes('Logic Element'));
      if(!item) throw new Error('Logic Element add action unavailable');
      item.click();
    });
  } else {
    await page.locator('#lkAddMenu').click();
    const logicMenu = page.locator('#lkCtx .lk-menu-item', {hasText:'Logic'}).first();
    await expect(logicMenu).toBeVisible();
    await logicMenu.hover();
    await page.locator('#lkCtx .lk-submenu .lk-menu-item', {hasText:'Logic Element'}).click();
  }
  const item = page.locator('#lkOutliner .lk-item', {hasText:'Logic Element'}).last();
  await expect(item).toBeVisible();
  await expect(item).toHaveClass(/\bsel\b/);
  await openInspectorSection(page, 'LOGIC ELEMENT');
  await expect(page.getByRole('button', {name:/Open Logic Editor/i})).toBeVisible();
}

test.beforeEach(async ({page}) => {
  // Authoring panels require a compact tablet/desktop workspace. Keep the
  // mobile project's touch/UA emulation while giving the editor its minimum UI.
  if(page.viewportSize() && page.viewportSize().width < 700){
    await page.setViewportSize({width:1180, height:800});
  }
  page.on('pageerror', error => console.error('[browser pageerror]', error.message));
  page.on('console', message => { if(message.type() === 'error') console.error('[browser console]', message.text()); });
  // These editor interaction tests exercise procedural fallbacks and authoring
  // state, not the bundled multi-megabyte demo models. Avoid repeated GLB
  // download/parse work so timing reflects editor regressions, not I/O.
  await page.route(/\/models\/(?:player|car1|car2|cone)\.glb(?:\?.*)?$/, route => route.fulfill({status:404, body:''}));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?logic-e2e=1', {waitUntil:'domcontentloaded'});
  const active = await page.waitForFunction(() => !!(document.querySelector('#lkEditor.active') || window.LOT_KING && LOT_KING.editor && LOT_KING.editor.state && LOT_KING.editor.state.active === true), null, {timeout:15000}).then(() => true).catch(() => false);
  await closeStartupOverlays(page);
  if(!active){
    const editorButton = page.locator('#editorBtn');
    await editorButton.waitFor({state:'visible', timeout:15000});
    await editorButton.click({force:true});
  }
  await page.waitForFunction(() => !!(document.querySelector('#lkEditor.active') || window.LOT_KING && LOT_KING.editor && LOT_KING.editor.state && LOT_KING.editor.state.active === true), null, {timeout:60000});
  await closeStartupOverlays(page);
  await expect(page.locator('#lkEditor')).toHaveClass(/active/);
});

test('Logic Element Graph and Viewport remain usable', async ({page}, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const mainCanvas = page.locator('#c');
  const mainCanvasInfo = await canvasRenderSummary(page, mainCanvas, testInfo, 'main-canvas');
  expect(mainCanvasInfo.ok).toBe(true);
  expect(mainCanvasInfo.width).toBeGreaterThan(100);
  expect(mainCanvasInfo.height).toBeGreaterThan(100);
  expect(mainCanvasInfo.rectWidth).toBeGreaterThan(100);
  expect(mainCanvasInfo.rectHeight).toBeGreaterThan(100);
  expect(mainCanvasInfo.screenshotBytes).toBeGreaterThan(1000);

  await addLogicElement(page);
  await page.getByRole('button', {name:/Open Logic Editor/i}).click();
  const modal = page.locator('.lk-logic-modal-panel');
  await expect(modal).toBeVisible();
  await expect(page.locator('.lk-lg-node')).toHaveCount(6);
  await expect(page.locator('.lk-lg-status')).toContainText('valid');

  const viewport = page.viewportSize();
  const modalBox = await modal.boundingBox();
  expect(modalBox.x).toBeGreaterThanOrEqual(0);
  expect(modalBox.y).toBeGreaterThanOrEqual(0);
  expect(modalBox.x + modalBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(modalBox.y + modalBox.height).toBeLessThanOrEqual(viewport.height + 1);

  await page.locator('.lk-lg-zoom-in').click();
  await expect(page.locator('.lk-lg-zoom-label')).not.toHaveText('100%');
  await page.locator('.lk-lg-add-comment').click();
  await expect(page.locator('.lk-lg-comment')).toHaveCount(1);

  const debugNode = page.locator('.lk-lg-node.debug');
  const duration = debugNode.locator('input[type="number"]').last();
  await duration.fill('0');
  await duration.blur();
  await expect(debugNode).toHaveClass(/has-warning/);
  await expect(page.locator('.lk-lg-status')).toHaveClass(/warn/);
  await debugNode.click();
  await expect(page.locator('.lk-le-inspector-note.warning')).toContainText('greater than zero');

  await page.locator('.lk-le-tabs [data-tab="viewport"]').click();
  const internalCanvas = page.locator('.lk-le-viewport-mount canvas');
  await expect(internalCanvas).toBeVisible();
  await expect(page.locator('.lk-le-components-list')).toContainText('Root');
  await page.locator('.lk-le-component.is-root').click();
  await expect(page.locator('.lk-le-viewport-card')).toContainText('Selected:');
  await page.waitForTimeout(500);
  const internalCanvasInfo = await canvasRenderSummary(page, internalCanvas, testInfo, 'logic-viewport-canvas');
  expect(internalCanvasInfo.ok).toBe(true);
  expect(internalCanvasInfo.width).toBeGreaterThan(100);
  expect(internalCanvasInfo.height).toBeGreaterThan(100);
  expect(internalCanvasInfo.rectWidth).toBeGreaterThan(100);
  expect(internalCanvasInfo.rectHeight).toBeGreaterThan(100);
  expect(internalCanvasInfo.screenshotBytes).toBeGreaterThan(1000);

  await page.screenshot({path:testInfo.outputPath('logic-element-editor.png'), fullPage:true});
  expect(pageErrors).toEqual([]);
});

test('Logic Graph Delete key does not delete the selected scene Logic Element', async ({page}) => {
  await addLogicElement(page);
  await page.getByRole('button', {name:/Open Logic Editor/i}).click();
  await expect(page.locator('.lk-logic-modal-panel')).toBeVisible();
  await expect(page.locator('.lk-lg-node')).toHaveCount(6);

  const selectedBefore = await page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    return selected && selected.userData && selected.userData.editorType;
  });
  expect(selectedBefore).toBe('logicElement');

  await page.locator('.lk-lg-node', {hasText:'Print Debug'}).first().click();
  await page.keyboard.press('Delete');

  await expect(page.locator('.lk-lg-node')).toHaveCount(5);
  await expect(page.locator('#lkConfirmOverlay')).not.toBeVisible();
  await expect(page.locator('#lkOutliner .lk-item', {hasText:'Logic Element'})).toHaveCount(1);

  const selectedAfter = await page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const sceneEntry = selected && selected.userData && selected.userData.addedEntry;
    return {
      selectedType:selected && selected.userData && selected.userData.editorType,
      sceneLogicCount:window.LOT_KING.world.registry.filter(item => item && item.userData && item.userData.editorType === 'logicElement').length,
      nodeCount:sceneEntry && sceneEntry.graph && sceneEntry.graph.nodes && sceneEntry.graph.nodes.length,
    };
  });
  expect(selectedAfter).toEqual({
    selectedType:'logicElement',
    sceneLogicCount:1,
    nodeCount:5,
  });
});

test('Logic Element scene sidebar, primitive root and text elements are authorable', async ({page}) => {
  await addLogicElement(page);
  await page.getByRole('button', {name:/Open Logic Editor/i}).click();
  await expect(page.locator('.lk-logic-modal-panel')).toBeVisible();
  await expect(page.locator('.lk-le-sidebar-splitter')).toHaveCount(3);

  await page.locator('.lk-le-tabs [data-tab="viewport"]').click();
  await page.locator('.lk-le-component.is-root').click();
  const inspector = page.locator('.lk-le-inspector');
  await inspector.getByRole('combobox', {name:'Type', exact:true}).selectOption('mesh');
  await inspector.getByRole('combobox', {name:'Mesh Type', exact:true}).selectOption('primitive:sphere');
  await expect(inspector.getByRole('combobox', {name:'Mesh Type', exact:true})).toHaveValue('primitive:sphere');
  await expect.poll(() => page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    return selected && selected.userData && selected.userData.addedEntry && selected.userData.addedEntry.graph.logicScene.root.primitive;
  })).toBe('sphere');

  await inspector.locator('.lk-le-inspector-btn', {hasText:'Add text'}).click();
  await expect(page.locator('.lk-le-component', {hasText:'Text 1'})).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    return selected && selected.userData && selected.userData.addedEntry && selected.userData.addedEntry.graph.logicScene.root.primitive;
  })).toBe('sphere');
  await inspector.getByRole('textbox', {name:'Text', exact:true}).fill('Checkpoint');
  await inspector.getByRole('textbox', {name:'Text', exact:true}).blur();
  await inspector.getByRole('combobox', {name:'Text Mode', exact:true}).selectOption('billboard');

  const state = await page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const entry = selected && selected.userData && selected.userData.addedEntry;
    const scene = entry && entry.graph && entry.graph.logicScene;
    const text = scene && scene.elements && scene.elements.find(item => item && item.type === 'text');
    return scene ? {
      rootType:scene.root.type,
      rootPrimitive:scene.root.primitive,
      textType:text && text.type,
      textValue:text && text.text,
      textMode:text && text.textMode,
    } : null;
  });
  expect(state).toEqual({
    rootType:'mesh',
    rootPrimitive:'sphere',
    textType:'text',
    textValue:'Checkpoint',
    textMode:'billboard',
  });
});

test('Logic Element Functions expose I/O metadata and create Call Subgraph nodes', async ({page}) => {
  await addLogicElement(page);
  await page.getByRole('button', {name:/Open Logic Editor/i}).click();
  await expect(page.locator('.lk-logic-modal-panel')).toBeVisible();

  await page.locator('.lk-lg-add-subgraph').click();
  await expect(page.locator('.lk-lg-graph-select')).toContainText('Function · Function 1');
  await expect(page.locator('.lk-lg-node', {hasText:'Custom Event'})).toBeVisible();
  await expect(page.locator('.lk-lg-node')).toHaveCount(1);

  await page.locator('.lk-lg-graph-select').selectOption('main');
  await page.locator('.lk-lg-subgraph', {hasText:'Function 1'}).click();
  await expect(page.locator('.lk-le-inspector-title')).toHaveText('Function');
  await page.locator('.lk-le-inspector-btn', {hasText:'Add input'}).click();
  await expect.poll(() => page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const entry = selected && selected.userData && selected.userData.addedEntry;
    return entry && entry.graph && entry.graph.subgraphs && entry.graph.subgraphs[0] && entry.graph.subgraphs[0].inputs.length;
  })).toBe(1);
  await expect(page.locator('.lk-le-function-port')).toHaveCount(1);
  await page.locator('.lk-le-inspector-btn', {hasText:'Add output'}).click();
  await expect(page.locator('.lk-le-function-port')).toHaveCount(2);

  const functionState = await page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const entry = selected && selected.userData && selected.userData.addedEntry;
    const graph = entry && entry.graph;
    const subgraph = graph && graph.subgraphs && graph.subgraphs[0];
    return subgraph ? {
      name:subgraph.name,
      nodeTypes:(subgraph.nodes || []).map(node => node.type),
      inputNames:(subgraph.inputs || []).map(port => port.name),
      outputNames:(subgraph.outputs || []).map(port => port.name),
    } : null;
  });
  expect(functionState).toMatchObject({
    name:'Function 1',
    nodeTypes:['event.custom'],
    inputNames:['input1'],
    outputNames:['output1'],
  });

  await page.locator('.lk-le-inspector-btn', {hasText:'Add Call node'}).click();
  await expect(page.locator('.lk-lg-node', {hasText:'Call Function'})).toBeVisible();
  await expect(page.locator('.lk-lg-node', {hasText:'Function: Function 1'})).toBeVisible();

  const callState = await page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const entry = selected && selected.userData && selected.userData.addedEntry;
    const call = entry && entry.graph && entry.graph.nodes.find(node => node.type === 'flow.callSubgraph');
    return call ? {
      type:call.type,
      subgraph:call.data && call.data.subgraph,
      mainNodeCount:entry.graph.nodes.length,
      subgraphCount:entry.graph.subgraphs.length,
    } : null;
  });
  expect(callState).toMatchObject({
    type:'flow.callSubgraph',
    subgraph:'Function 1',
    mainNodeCount:7,
    subgraphCount:1,
  });
});

test('Logic Element dependency inspector can relink and pick asset references', async ({page}) => {
  await addLogicElement(page);
  await page.evaluate(() => {
    localStorage.setItem('lotking.assetLibrary.v1', JSON.stringify({
      version:1,
      assets:[
        {id:'e2e-texture-asset', key:'texture:e2e-panel', kind:'texture', name:'E2E Panel Texture', source:'E2E Panel Texture', src:'data:image/png;base64,iVBORw0KGgo=', dbKey:null, mime:'image/png'},
        {id:'e2e-audio-asset', key:'audio:e2e-beep', kind:'audio', name:'E2E Beep Audio', source:'E2E Beep Audio', src:'data:audio/ogg;base64,T2dnUw==', dbKey:null, mime:'audio/ogg'},
      ],
    }));
    const selected = window.LOT_KING.editor.state.selected;
    const graph = selected && selected.userData && selected.userData.logicGraph;
    if(!graph) return;
    graph.nodes.push(
      window.LK_LOGIC_GRAPH.node('e2e_texture_node', 'material.loadTexture', 520, 80, {textureRef:'missing-texture'}),
      window.LK_LOGIC_GRAPH.node('e2e_sound_node', 'audio.playSound', 520, 240, {soundRef:'missing-sound', volume:1, loop:false})
    );
    selected.userData.addedEntry.graph = window.LK_LOGIC_GRAPH.clone(graph);
  });

  await page.getByRole('button', {name:/Open Logic Editor/i}).click();
  await expect(page.locator('.lk-logic-modal-panel')).toBeVisible();
  await expect(page.locator('.lk-le-dependencies')).toContainText('missing-texture');
  await expect(page.locator('.lk-le-dependencies')).toContainText('missing');

  const textureDependency = page.locator('.lk-le-dependency-item', {hasText:'missing-texture'}).first();
  await expect(textureDependency).toBeVisible();
  await textureDependency.locator('select.lk-le-dependency-relink').selectOption('e2e-texture-asset');
  await expect(page.locator('.lk-le-dependencies')).toContainText('E2E Panel Texture');

  await expect.poll(async () => page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const entry = selected && selected.userData && selected.userData.addedEntry;
    const node = entry && entry.graph && entry.graph.nodes.find(item => item.id === 'e2e_texture_node');
    return node && node.data && node.data.textureRef && node.data.textureRef.id;
  })).toBe('e2e-texture-asset');

  await page.locator('.lk-lg-node[data-id="e2e_sound_node"]').click();
  const logicInspector = page.locator('.lk-logic-modal-panel .lk-le-inspector');
  await expect(logicInspector.locator('.lk-le-inspector-title')).toHaveText('Play Sound');
  const soundField = logicInspector.locator('.lk-le-asset-ref-field').first();
  await expect(soundField).toBeVisible();
  await expect(soundField.locator('select')).toContainText('E2E Beep Audio');
  await soundField.locator('select').selectOption('e2e-audio-asset');
  await expect(soundField.locator('input')).toHaveValue('E2E Beep Audio');

  await expect.poll(async () => page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const entry = selected && selected.userData && selected.userData.addedEntry;
    const node = entry && entry.graph && entry.graph.nodes.find(item => item.id === 'e2e_sound_node');
    return node && node.data && node.data.soundRef && node.data.soundRef.id;
  })).toBe('e2e-audio-asset');
});

test('Logic Element templates can be placed from Assets as editable local copies', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.evaluate(() => {
    window.LOT_KING.editor.setLeftMode('assets');
    window.LOT_KING.editor.refreshAssetsPanel();
  });

  const templateCard = page.locator('#lkAssetsPanel .lk-asset-item', {hasText:'Template - Rotating Cube'}).first();
  await expect(templateCard).toBeVisible();
  await expect(templateCard).toContainText('local editable copy');
  await templateCard.locator('.lk-asset-actions button', {hasText:'+'}).click();

  const item = page.locator('#lkOutliner .lk-item', {hasText:'Template - Rotating Cube'}).last();
  await expect(item).toBeVisible();
  await item.click();
  await openInspectorSection(page, 'LOGIC ELEMENT');
  await expect(page.getByRole('button', {name:/Open Logic Editor/i})).toBeVisible();
  await page.getByRole('button', {name:/Open Logic Editor/i}).click();

  const modal = page.locator('.lk-logic-modal-panel');
  await expect(modal).toBeVisible();
  await expect(page.locator('.lk-lg-node', {hasText:'On Update'})).toBeVisible();
  await expect(page.locator('.lk-lg-node', {hasText:'Rotate Object'})).toBeVisible();
  await expect(page.locator('.lk-lg-comment')).toHaveCount(1);
  await expect(page.locator('.lk-lg-status')).toContainText('valid');

  await page.locator('.lk-le-tabs [data-tab="viewport"]').click();
  await expect(page.locator('.lk-le-components-list')).toContainText('Default Mesh');
  await expect(page.locator('.lk-lg-vars-list')).toContainText('speedY');
  await page.locator('.lk-logic-modal-head button[title="Close"]').click();
  await expect(modal).not.toBeVisible();

  const selected = await page.evaluate(() => {
    const editor = window.LOT_KING.editor;
    const object = editor && editor.state && editor.state.selected;
    const entry = object && object.userData && object.userData.addedEntry;
    return entry ? {
      linked:entry.logicLinked === true,
      assetSource:entry.asset && entry.asset.source,
      graphName:entry.graph && entry.graph.name,
      assetId:entry.logicAssetId || null,
    } : null;
  });
  expect(selected).toEqual({
    linked:false,
    assetSource:'Logic Element template',
    graphName:'Template - Rotating Cube',
    assetId:null,
  });

  const roundTrip = await page.evaluate(() => {
    const store = window.LK_STORE;
    const project = store.exportProject(store.collect(window.LOT_KING), {trackId:'logic-e2e', trackName:'Logic E2E'});
    const text = JSON.stringify(project);
    const parsed = store.parseProject(text);
    const exportedEntry = parsed.scene.added.find(item => item && item.kind === 'logicElement' && item.name === 'Template - Rotating Cube');
    store.importProject(text);
    const loaded = store.loadProject();
    const importedEntry = loaded.scene.added.find(item => item && item.kind === 'logicElement' && item.name === 'Template - Rotating Cube');
    const shape = entry => entry ? {
      kind:entry.kind,
      linked:entry.logicLinked === true,
      assetSource:entry.asset && entry.asset.source,
      graphName:entry.graph && entry.graph.name,
      nodeCount:entry.graph && entry.graph.nodes && entry.graph.nodes.length,
      commentCount:entry.graph && entry.graph.comments && entry.graph.comments.length,
      hasLogicScene:!!(entry.graph && entry.graph.logicScene && Array.isArray(entry.graph.logicScene.elements)),
      hasDefaultMesh:!!(entry.graph && entry.graph.logicScene && (
        entry.graph.logicScene.root && entry.graph.logicScene.root.name === 'Default Mesh' ||
        entry.graph.logicScene.elements && entry.graph.logicScene.elements.some(element => element && element.name === 'Default Mesh')
      )),
      assetId:entry.logicAssetId || null,
    } : null;
    return {
      format:parsed.format,
      exported:shape(exportedEntry),
      imported:shape(importedEntry),
    };
  });
  expect(roundTrip.format).toBe('LKEP');
  expect(roundTrip.exported).toMatchObject({
    kind:'logicElement',
    linked:false,
    assetSource:'Logic Element template',
    graphName:'Template - Rotating Cube',
    hasLogicScene:true,
    hasDefaultMesh:true,
    assetId:null,
  });
  expect(roundTrip.exported.nodeCount).toBeGreaterThan(0);
  expect(roundTrip.exported.commentCount).toBeGreaterThan(0);
  expect(roundTrip.imported).toEqual(roundTrip.exported);

  await page.evaluate(() => {
    window.LOT_KING.state.sceneReady = true;
    window.LOT_KING.actions.startEditorPreview('play');
    window.LOT_KING.editor.state.playPreview = true;
    window.LOT_KING.editor.state.playPreviewMode = 'play';
  });
  await expect.poll(() => page.evaluate(() => {
    const owner = window.LOT_KING.world.registry.find(object => object && object.userData && object.userData.addedEntry && object.userData.addedEntry.name === 'Template - Rotating Cube');
    const mesh = owner && owner.getObjectByName && owner.getObjectByName('Default Mesh');
    return !!(mesh && Math.abs(mesh.rotation.y) > .001);
  })).toBe(true);
  await expect.poll(async () => page.evaluate(() => window.LOT_KING.editor.state.playPreview === true)).toBe(true);
  await page.locator('[data-app-menu="plugins"]').click();
  await page.locator('#lkCtx .lk-menu-item', {hasText:'Logic Profiler'}).first().click();
  await expect(page.locator('#lkLogicProfilerPanel')).toHaveClass(/open/);
  await expect(page.locator('#lkLogicProfilerBody')).toContainText('Runtimes');
  await expect(page.locator('#lkLogicProfilerBody')).toContainText('Template - Rotating Cube');
  await expect(page.locator('#lkLogicProfilerBody')).toContainText('events');
  await page.evaluate(() => {
    window.LOT_KING.editor.state.playPreview = false;
    window.LOT_KING.actions.stopEditorPreview();
  });
  await expect(page.locator('#lkPlay')).toContainText('PREVIEW', {timeout:10000});
  await expect.poll(async () => page.evaluate(() => window.LOT_KING.editor.state.playPreview === false)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('Normal Character template is available as an editable Pawn asset', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.evaluate(() => {
    window.LOT_KING.editor.setLeftMode('assets');
    window.LOT_KING.editor.refreshAssetsPanel();
  });
  const templateCard = page.locator('#lkAssetsPanel .lk-asset-item', {hasText:'Template - Player Character (Normal)'}).first();
  await expect(templateCard).toBeVisible();
  await expect(templateCard).toContainText('Character Logic');
  await templateCard.locator('.lk-asset-actions button', {hasText:'+'}).click();

  await expect.poll(() => page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const entry = selected && selected.userData && selected.userData.addedEntry;
    if(!entry) return null;
    const animation = entry.graph.variables.find(variable => variable.binding === 'animations.walk');
    return {
      preset:entry.graph.characterPawn.preset,
      hasMoveNode:entry.graph.nodes.some(node => node.type === 'character.setMoveInput'),
      walkHelp:animation && animation.description || '',
    };
  })).toEqual({preset:'normal', hasMoveNode:true, walkHelp:expect.stringMatching(/in-place.*root motion/i)});
  expect(pageErrors).toEqual([]);
});

test('linked Logic Element assets preserve overrides and embedded fallback through LKEP round trip', async ({page}) => {
  const result = await page.evaluate(() => {
    const store = window.LK_STORE;
    const template = window.LK_LOGIC_TEMPLATES.get('logic-template-debug-counter');
    const asset = store.logicElementAssets.saveAsset('E2E Shared Counter', template.graph, {id:'e2e-shared-counter'});
    const scene = store.blank();
    scene.added.push(
      {
        id:'logic_a',
        kind:'logicElement',
        name:'Counter A',
        graph:store.logicElementAssets.resolveGraph({
          graph:asset.graph,
          logicAssetId:asset.id,
          logicLinked:true,
          logicAsset:asset,
          variableOverrides:{secondsAlive:12},
        }, 'Counter A'),
        enabled:true,
        runInEditorPreview:true,
        logicAssetId:asset.id,
        logicLinked:true,
        variableOverrides:{secondsAlive:12},
        logicAsset:asset,
        asset:{key:'logic:asset:' + asset.id, name:asset.name, source:'Reusable Logic Element'},
        t:{p:[0,.15,0], r:[0,0,0], s:[1,1,1], v:true},
      },
      {
        id:'logic_b',
        kind:'logicElement',
        name:'Counter B',
        graph:store.logicElementAssets.resolveGraph({
          graph:asset.graph,
          logicAssetId:asset.id,
          logicLinked:true,
          logicAsset:asset,
          variableOverrides:{},
        }, 'Counter B'),
        enabled:true,
        runInEditorPreview:true,
        logicAssetId:asset.id,
        logicLinked:true,
        variableOverrides:{},
        logicAsset:asset,
        asset:{key:'logic:asset:' + asset.id, name:asset.name, source:'Reusable Logic Element'},
        t:{p:[2,.15,0], r:[0,0,0], s:[1,1,1], v:true},
      }
    );

    const project = store.exportProject(scene, {trackId:'linked-e2e', trackName:'Linked E2E'});
    const text = JSON.stringify(project);
    localStorage.removeItem('lotking.logicElementAssets.v1');
    const imported = store.importProject(text);
    const loaded = store.loadProject();
    const importedAsset = store.logicElementAssets.get(asset.id);
    const entries = loaded.scene.added.filter(item => item && item.kind === 'logicElement').sort((a, b) => a.id.localeCompare(b.id));
    const resolved = entries.map(entry => store.logicElementAssets.resolveGraph(entry, entry.name));
    const variableValue = (graph, name) => {
      const variable = graph.variables.find(item => item && item.name === name);
      return variable && variable.value;
    };
    return {
      projectFormat:imported.format,
      importedAssetName:importedAsset && importedAsset.name,
      entries:entries.map((entry, index) => ({
        id:entry.id,
        linked:entry.logicLinked === true,
        assetId:entry.logicAssetId,
        embeddedAssetName:entry.logicAsset && entry.logicAsset.name,
        override:entry.variableOverrides && entry.variableOverrides.secondsAlive,
        resolvedValue:variableValue(resolved[index], 'secondsAlive'),
        resolvedNodeCount:resolved[index].nodes.length,
        hasLogicScene:!!(resolved[index].logicScene && Array.isArray(resolved[index].logicScene.elements)),
      })),
    };
  });

  expect(result.projectFormat).toBe('LKEP');
  expect(result.importedAssetName).toBe('E2E Shared Counter');
  expect(result.entries).toHaveLength(2);
  expect(result.entries[0]).toMatchObject({
    id:'logic_a',
    linked:true,
    assetId:'e2e-shared-counter',
    embeddedAssetName:'E2E Shared Counter',
    override:12,
    resolvedValue:12,
    hasLogicScene:true,
  });
  expect(result.entries[0].resolvedNodeCount).toBeGreaterThan(0);
  expect(result.entries[1]).toMatchObject({
    id:'logic_b',
    linked:true,
    assetId:'e2e-shared-counter',
    embeddedAssetName:'E2E Shared Counter',
    resolvedValue:0,
    hasLogicScene:true,
  });
  expect(result.entries[1].resolvedNodeCount).toBeGreaterThan(0);
});

test('linked Logic Element instances can reset overrides and become local', async ({page}) => {
  await page.evaluate(() => {
    const template = window.LK_LOGIC_TEMPLATES.get('logic-template-debug-counter');
    window.LK_STORE.logicElementAssets.saveAsset('E2E Override Counter', template.graph, {id:'e2e-override-counter'});
    window.LOT_KING.editor.setLeftMode('assets');
    window.LOT_KING.editor.refreshAssetsPanel();
  });

  const assetCard = page.locator('#lkAssetsPanel .lk-asset-item', {hasText:'E2E Override Counter'}).first();
  await expect(assetCard).toBeVisible();
  await assetCard.locator('.lk-asset-actions button', {hasText:'+'}).click();

  const item = page.locator('#lkOutliner .lk-item', {hasText:'E2E Override Counter'}).last();
  await expect(item).toBeVisible();
  await item.click();
  const logicSection = await openInspectorSection(page, 'LOGIC ELEMENT');
  await expect(logicSection).toContainText('Linked asset: E2E Override Counter');
  const generalSection = await openInspectorSection(page, 'GENERAL');

  const secondsInput = generalSection.locator('.lk-row', {hasText:'Seconds Alive'}).locator('input');
  await expect(secondsInput).toBeVisible();
  await secondsInput.fill('42');
  await secondsInput.blur();

  await expect.poll(async () => page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    return selected && selected.userData && selected.userData.logicVariableOverrides && selected.userData.logicVariableOverrides.secondsAlive;
  })).toBe(42);

  await page.getByRole('button', {name:/Reset overrides/i}).click();
  await expect.poll(async () => page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const graph = selected && selected.userData && selected.userData.logicGraph;
    const variable = graph && graph.variables.find(item => item.name === 'secondsAlive');
    return {
      overrides:Object.keys(selected.userData.logicVariableOverrides || {}).length,
      value:variable && variable.value,
      linked:selected.userData.logicLinked === true,
    };
  })).toEqual({overrides:0, value:0, linked:true});

  await openInspectorSection(page, 'GENERAL');
  await secondsInput.fill('7');
  await secondsInput.blur();
  await page.getByRole('button', {name:/Make local/i}).click();

  await expect.poll(async () => page.evaluate(() => {
    const selected = window.LOT_KING.editor.state.selected;
    const graph = selected && selected.userData && selected.userData.logicGraph;
    const variable = graph && graph.variables.find(item => item.name === 'secondsAlive');
    const entry = selected && selected.userData && selected.userData.addedEntry;
    return {
      linked:selected.userData.logicLinked === true,
      assetId:selected.userData.logicAssetId || null,
      overrideCount:Object.keys(selected.userData.logicVariableOverrides || {}).length,
      value:variable && variable.value,
      entryLinked:!!(entry && entry.logicLinked),
      entryAssetId:entry && entry.logicAssetId || null,
    };
  })).toEqual({
    linked:false,
    assetId:null,
    overrideCount:0,
    value:7,
    entryLinked:false,
    entryAssetId:null,
  });

  await expect(page.locator('.lk-sec', {hasText:'LOGIC ELEMENT'})).toContainText('Local Logic Element');
});

test('Vehicle Pawn persistence, IndexedDB assets, migration and playable bundle round trip', async ({page}) => {
  const result = await page.evaluate(async () => {
    const store = window.LK_STORE;
    const blobKey = 'e2e-vehicle-model-blob';
    await window.LK_ASSET_BLOBS.put(blobKey, new Blob(['vehicle-asset'], {type:'application/octet-stream'}));
    const blobUrl = await window.LK_ASSET_BLOBS.getUrl(blobKey);
    const blobText = await fetch(blobUrl).then(response => response.text());
    const legacy = window.LK_LOGIC_GRAPH.createEmptyGraph('Legacy Vehicle E2E', 'element');
    legacy.playerPawnBlueprint = {version:1, controllerIndex:1, spawn:{x:4,z:9,heading:.5}, tuning:{horsepower:510}};
    const graph = window.LK_LOGIC_GRAPH.normalizeGraph(legacy);
    graph.logicScene = {root:null,elements:[],components:[]};
    graph.logicScene.root = {id:'root',name:'Vehicle Root',type:'mesh',asset:{dbKey:blobKey,name:'Embedded Vehicle'},position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],linked:true};
    graph.vehiclePawn.wheels = [0,1,2,3].map(index => ({x:index%2?.9:-.9,y:.17,z:index<2?1.3:-1.3,front:index<2,driven:index>=2,visualId:'wheel-' + index}));
    graph.vehiclePawn.lights = {
      front:{flare:true,flareIntensity:.73,flareSize:.61,flareBloomIntensity:1.17,flareOcclusion:false},
      rear:{flare:true,flareIntensity:.39,flareSize:.47,flareBloomIntensity:.84,flareOcclusion:true},
    };
    const scene = store.blank();
    scene.added.push({id:'vehicle_e2e',kind:'logicElement',name:'Vehicle E2E',graph,enabled:true,runInEditorPreview:true,props:{roughness:.22,metalness:.8},meshEdits:{deleted:['body-old'],detached:[],transforms:{wheel_custom:{p:[1,0,0],r:[0,0,0],s:[1,1,1]}},properties:{},splits:{},joins:[]},asset:{key:'logic:e2e',name:'Vehicle E2E'},t:{p:[1,.15,2],r:[0,.2,0],s:[1,1,1],v:true}});
    store.save(scene, {trackId:'vehicle-persistence-e2e',trackName:'Vehicle Persistence E2E'});
    const loaded = store.load();
    const savedEntry = loaded.added.find(item => item.id === 'vehicle_e2e');
    const project = store.exportProject(loaded, {trackId:'vehicle-persistence-e2e',trackName:'Vehicle Persistence E2E'});
    const playable = window.LOT_KING.editor.getPlayableExport();
    const bundle = await playable.buildPlayableBundle([project], 'gameplay.html', 'Vehicle Persistence E2E');
    const playableEntry = bundle.levels[0].project.scene.added.find(item => item.id === 'vehicle_e2e');
    await window.LK_ASSET_BLOBS.remove(blobKey);
    return {
      blobText,
      savedWheelCount:savedEntry.graph.vehiclePawn.wheels.length,
      savedSpawn:savedEntry.graph.vehiclePawn.spawn,
      savedFrontFlare:savedEntry.graph.vehiclePawn.lights.front,
      playableRearFlare:playableEntry.graph.vehiclePawn.lights.rear,
      migration:savedEntry.graph.vehiclePawn.migration,
      legacyRetained:!!savedEntry.graph.playerPawnBlueprint,
      bundleFormat:bundle.format,
      playableAssetSrc:playableEntry.graph.logicScene.root.asset.src,
      playableDbKey:playableEntry.graph.logicScene.root.asset.dbKey,
      materialRoughness:playableEntry.props.roughness,
      deletedMesh:playableEntry.meshEdits.deleted[0],
      meshTransform:playableEntry.meshEdits.transforms.wheel_custom.p,
    };
  });
  expect(result.blobText).toBe('vehicle-asset');
  expect(result.savedWheelCount).toBe(4);
  expect(result.savedSpawn).toEqual({x:4,y:0,z:9,heading:.5});
  expect(result.savedFrontFlare).toMatchObject({flare:true,flareIntensity:.73,flareSize:.61,flareBloomIntensity:1.17,flareOcclusion:false});
  expect(result.playableRearFlare).toMatchObject({flare:true,flareIntensity:.39,flareSize:.47,flareBloomIntensity:.84,flareOcclusion:true});
  expect(result.migration.legacyBlueprint).toBe(true);
  expect(result.legacyRetained).toBe(true);
  expect(result.bundleFormat).toBe('LKPKG');
  expect(result.playableAssetSrc).toMatch(/^data:/);
  expect(result.playableDbKey).toBeNull();
  expect(result.materialRoughness).toBe(.22);
  expect(result.deletedMesh).toBe('body-old');
  expect(result.meshTransform).toEqual([1,0,0]);
});

test('Vehicle Pawn Cannon, Active Camera and playable ZIP sign-off', async ({page}, testInfo) => {
  test.setTimeout(240000);
  const runtime = await page.evaluate(async () => {
    const game = window.LOT_KING;
    const rawPhysics = game.systems.physics.raw;
    const previousWorld = rawPhysics.world;
    if(!rawPhysics.world) rawPhysics.world = new window.CANNON.World();
    const owner = new window.THREE.Group(); owner.userData.logicInstanceId = 'cannon-e2e'; game.core.scene.add(owner);
    const pawn = game.pawns.createLogic(owner, {id:'cannon-e2e',playerId:null,physicsBackend:'cannon-raycast',spawn:{x:0,y:1,z:0},suspension:{stiffness:32,restLength:.34,travel:.28,radius:.38}}, {graph:{logicScene:{elements:[]}},STORE:window.LK_STORE});
    pawn.start(); const physicsReady = pawn.ensurePhysics();
    const result = {physicsReady,physicsMode:pawn.state.physicsMode,wheels:pawn.backend&&pawn.backend.vehicle&&pawn.backend.vehicle.wheelInfos.length,shapes:pawn.backend&&pawn.backend.body&&pawn.backend.body.shapes.length};
    pawn.dispose(); game.core.scene.remove(owner); if(!previousWorld) rawPhysics.world = null;
    const cameraHolder = window.LK_STORE.createSceneCamera({activeLevelCamera:true,fov:61});
    cameraHolder.userData.editorType='camera'; cameraHolder.userData.editorId='active-camera-e2e'; cameraHolder.position.set(8,6,4); game.core.scene.add(cameraHolder); game.world.registry.push(cameraHolder);
    game.player.setControllerIndex(null); game.state.runtimeActiveSceneCameraId='active-camera-e2e';
    await new Promise(resolve=>setTimeout(resolve,120));
    result.activeCameraId=game.state.runtimeActiveSceneCameraId;
    result.cameraFov=Math.round(game.core.camera.fov);
    game.world.registry.splice(game.world.registry.indexOf(cameraHolder),1); game.core.scene.remove(cameraHolder); game.state.runtimeActiveSceneCameraId=null; game.player.setControllerIndex(0);
    return result;
  });
  expect(runtime).toMatchObject({physicsReady:true,physicsMode:'cannon-raycast',wheels:4,shapes:1,activeCameraId:'active-camera-e2e'});
  expect(runtime.cameraFov).toBeGreaterThanOrEqual(60);
  expect(runtime.cameraFov).toBeLessThanOrEqual(62);

  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(async () => {
    const exporter = window.LOT_KING.editor.getPlayableExport();
    const project = exporter.getCurrentPlayableProject();
    const bundle = await exporter.buildPlayableBundle([project], 'gameplay.html', 'Vehicle ZIP E2E');
    window.__vehicleZipWarnings = await exporter.buildPlayableProjectZip(bundle);
  });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/playable\.zip$/);
  const stream = await download.createReadStream();
  let bytes=0; for await(const chunk of stream) bytes+=chunk.length;
  expect(bytes).toBeGreaterThan(100000);
  const zipPath = testInfo.outputPath('playable-r185.zip');
  await download.saveAs(zipPath);
  const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
  expect(zip.file('vendor/three-r185-compat.min.js')).toBeTruthy();
  expect(zip.file('vendor/cannon-0.6.2.min.js')).toBeTruthy();
  expect(zip.file('vendor/helvetiker_regular.typeface.json')).toBeTruthy();
  expect(zip.file('vendor/THIRD_PARTY_LICENSES.md')).toBeTruthy();
  expect(zip.file('vendor/GLTFLoader.js')).toBeNull();
  const runtimeHtml = await zip.file('gameplay.html').async('string');
  expect(runtimeHtml).toContain('vendor/three-r185-compat.min.js?v=0.185.1-lk2');
  expect(runtimeHtml).not.toMatch(/three@0\.128\.0|three\.js\/r128|examples\/js\//);
});

test('Logic Player Car owns P1 without native overlap or manual Cinema takeover', async ({page}) => {
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  const setup = await page.evaluate(() => {
    const game = window.LOT_KING, store = window.LK_STORE;
    window.__logicRunnerWarnings = [];
    const originalWarn = console.warn;
    console.warn = function(){ window.__logicRunnerWarnings.push(Array.from(arguments).map(value => value && value.message || String(value)).join(' | ')); return originalWarn.apply(console, arguments); };
    game.player.setControllerIndex(null);
    const template = window.LK_LOGIC_TEMPLATES.get('logic-template-player-car');
    const graph = window.LK_LOGIC_GRAPH.clone(template.graph);
    graph.variables.forEach(variable => {
      if(variable.binding === 'playerId') variable.value = 1;
      if(variable.binding === 'spawn.x') variable.value = 10;
      if(variable.binding === 'spawn.y') variable.value = .15;
      if(variable.binding === 'spawn.z') variable.value = 0;
    });
    const owner = store.createLogicElement({graph,name:'P1 Logic Vehicle E2E'});
    const id = store.nextId();
    store.registerAdded(game, owner, {id,kind:'logicElement',name:'P1 Logic Vehicle E2E',graph,enabled:true,runInEditorPreview:true,collide:false,t:{p:[10,.15,0],r:[0,0,0],s:[1,1,1],v:true}});
    const cinema = store.createCinemaStudio({trigger:'manual',outputPlayerIndex:0,duration:4,playback:'loop',cameraCuts:[]});
    store.registerAdded(game, cinema, {id:store.nextId(),kind:'cinemaStudio',name:'Manual Cinema E2E',collide:false,props:Object.assign({},cinema.userData.cinemaProps),t:{p:[0,.05,5],r:[0,0,0],s:[1,1,1],v:true}});
    return {ownerId:owner.userData.editorId,cinemaTrigger:cinema.userData.cinemaProps.trigger,nativeController:game.player.controllerIndex,nativeEnabled:game.player.enabled,nativeVisible:game.player.car.visible};
  });
  expect(setup.cinemaTrigger).toBe('manual');
  expect(setup.nativeController).toBeNull();
  expect(setup.nativeEnabled).toBe(true);
  expect(setup.nativeVisible).toBe(true);
  await page.evaluate(() => {
    window.LOT_KING.state.sceneReady = true;
    window.LOT_KING.actions.startEditorPreview('play');
    window.LOT_KING.editor.state.playPreview = true;
    window.LOT_KING.editor.state.playPreviewMode = 'play';
  });
  await page.waitForFunction(() => window.LOT_KING.state.started === true && window.LOT_KING.state.editorPreview === true, null, {timeout:60000});
  await page.waitForTimeout(1200);
  const runtime = await page.evaluate(ownerId => {
    const game = window.LOT_KING;
    const pawn = game.pawns.get(ownerId);
    const owner = game.world.registry.find(item => item && item.userData && item.userData.editorId === ownerId);
    return {
      pawnExists:!!pawn,
      pawnId:pawn && pawn.id,
      playerId:pawn && pawn.playerId,
      ownerVisible:pawn && pawn.owner && pawn.owner.visible,
      ownerPosition:pawn && pawn.owner ? [pawn.owner.position.x,pawn.owner.position.y,pawn.owner.position.z] : null,
      bodyPosition:pawn && pawn.backend ? [pawn.backend.body.position.x,pawn.backend.body.position.y,pawn.backend.body.position.z] : null,
      physicsMode:pawn && pawn.state && pawn.state.physicsMode,
      cameraPawnId:game.state.runtimeVehicleCameraPawnId,
      cinemaLocked:game.state.cinemaInputLocked === true,
      nativeController:game.player.controllerIndex,
      nativeEnabled:game.player.enabled,
      nativeVisible:game.player.car.visible,
      nativeCollisionResponse:game.systems.physics.raw.carBody ? game.systems.physics.raw.carBody.collisionResponse : false,
      diagnostics:{started:game.state.started,sceneReady:game.state.sceneReady,editorPreview:game.state.editorPreview,ownerInRegistry:!!owner,ownerType:owner&&owner.userData.editorType,logicEnabled:owner&&owner.userData.logicEnabled,graphVehicle:!!(owner&&owner.userData.logicGraph&&owner.userData.logicGraph.vehiclePawn),validation:owner&&window.LK_LOGIC_ELEMENTS_RUNNER_INSTANCE.validate(owner.userData.logicGraph),runnerStats:window.LK_LOGIC_ELEMENTS_RUNNER_INSTANCE.stats(),warnings:window.__logicRunnerWarnings,registeredPawns:game.pawns.list().map(item=>({id:item.id,kind:item.kind,playerId:item.playerId,enabled:item.enabled}))},
    };
  }, setup.ownerId);
  expect(runtimeErrors).toEqual([]);
  if(!runtime.pawnExists) throw new Error('Logic Pawn diagnostics: ' + JSON.stringify(runtime.diagnostics));
  expect(runtime).toMatchObject({pawnExists:true,pawnId:setup.ownerId,playerId:1,ownerVisible:true,cameraPawnId:setup.ownerId,cinemaLocked:false,nativeController:null,nativeEnabled:true,nativeVisible:true,nativeCollisionResponse:true});
  expect(runtime.ownerPosition[0]).toBeGreaterThan(7);
  if(runtime.bodyPosition) expect(runtime.bodyPosition[0]).toBeGreaterThan(7);
  else expect(runtime.physicsMode).toBe('arcade-fallback');
  await page.evaluate(() => {
    window.LOT_KING.editor.state.playPreview = false;
    window.LOT_KING.actions.stopEditorPreview();
  });
});
