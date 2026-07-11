'use strict';

const {test, expect} = require('@playwright/test');

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

async function canvasRenderSummary(canvas, testInfo, name){
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
  const shot = await canvas.screenshot({path:testInfo.outputPath(name + '.png')});
  return Object.assign(info, {screenshotBytes:shot.length});
}

async function addLogicElement(page){
  await page.locator('#lkAddMenu').click();
  const logicMenu = page.locator('#lkCtx .lk-menu-item', {hasText:'Logic'}).first();
  await expect(logicMenu).toBeVisible();
  await logicMenu.hover();
  await page.locator('#lkCtx .lk-submenu .lk-menu-item', {hasText:'Logic Element'}).click();
  const item = page.locator('#lkOutliner .lk-item', {hasText:'Logic Element'}).last();
  await expect(item).toBeVisible();
  await item.click();
  await expect(page.getByRole('button', {name:/Open Logic Editor/i})).toBeVisible();
}

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', dismissed:true}));
  });
  await page.goto('/engine_editor.html?logic-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && LOT_KING.editor && LOT_KING.editor.state && LOT_KING.editor.state.active === true, null, {timeout:60000});
  await closeStartupOverlays(page);
  await expect(page.locator('#lkEditor')).toHaveClass(/active/);
});

test('Logic Element Graph and Viewport remain usable', async ({page}, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  const mainCanvas = page.locator('#c');
  const mainCanvasInfo = await canvasRenderSummary(mainCanvas, testInfo, 'main-canvas');
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
  await page.waitForTimeout(500);
  const internalCanvasInfo = await canvasRenderSummary(internalCanvas, testInfo, 'logic-viewport-canvas');
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
    const sceneEntry = window.LK_STORE.scene.added.find(item => item && item.kind === 'logicElement');
    return {
      selectedType:selected && selected.userData && selected.userData.editorType,
      sceneLogicCount:window.LK_STORE.scene.added.filter(item => item && item.kind === 'logicElement').length,
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
  await inspector.locator('.lk-le-inspector-row', {hasText:'Type'}).locator('select').selectOption('mesh');
  await inspector.locator('.lk-le-inspector-row', {hasText:'Mesh Type'}).locator('select').selectOption('primitive:sphere');

  await inspector.locator('.lk-le-inspector-btn', {hasText:'Add text'}).click();
  await expect(page.locator('.lk-le-component', {hasText:'Text 1'})).toBeVisible();
  await inspector.locator('.lk-le-inspector-row', {hasText:'Text'}).locator('input').fill('Checkpoint');
  await inspector.locator('.lk-le-inspector-row', {hasText:'Text'}).locator('input').blur();
  await inspector.locator('.lk-le-inspector-row', {hasText:'Text Mode'}).locator('select').selectOption('billboard');

  const state = await page.evaluate(() => {
    const entry = window.LK_STORE.scene.added.find(item => item && item.kind === 'logicElement');
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
  await page.locator('.lk-le-inspector-btn', {hasText:'Add output'}).click();
  await expect(page.locator('.lk-le-function-port')).toHaveCount(2);

  const functionState = await page.evaluate(() => {
    const entry = window.LK_STORE.scene.added.find(item => item && item.kind === 'logicElement');
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
    const entry = window.LK_STORE.scene.added.find(item => item && item.kind === 'logicElement');
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
    const entry = window.LK_STORE.scene.added.find(item => item && item.kind === 'logicElement');
    const node = entry && entry.graph && entry.graph.nodes.find(item => item.id === 'e2e_texture_node');
    return node && node.data && node.data.textureRef && node.data.textureRef.id;
  })).toBe('e2e-texture-asset');

  await page.locator('.lk-lg-node', {hasText:'Play Sound'}).first().click();
  const soundField = page.locator('.lk-le-asset-ref-field').first();
  await expect(soundField).toBeVisible();
  await expect(soundField.locator('select')).toContainText('E2E Beep Audio');
  await soundField.locator('select').selectOption('e2e-audio-asset');
  await expect(soundField.locator('input')).toHaveValue('E2E Beep Audio');

  await expect.poll(async () => page.evaluate(() => {
    const entry = window.LK_STORE.scene.added.find(item => item && item.kind === 'logicElement');
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

  const selected = await page.evaluate(() => {
    const store = window.LK_STORE;
    const editor = window.LOT_KING.editor;
    const selectedId = editor && editor.state && editor.state.selected && editor.state.selected.userData && editor.state.selected.userData.editorId;
    const entry = selectedId && store.scene.added.find(item => item.id === selectedId);
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
    const project = store.exportProject(store.scene, {trackId:'logic-e2e', trackName:'Logic E2E'});
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
      hasDefaultMesh:!!(entry.graph && entry.graph.logicScene && entry.graph.logicScene.elements && entry.graph.logicScene.elements.some(element => element && element.name === 'Default Mesh')),
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

  await page.locator('#lkPlay').click();
  await expect(page.locator('#lkPlay')).toContainText('STOP', {timeout:10000});
  await expect(page.locator('#popup')).toContainText('Rotating Cube started', {timeout:10000});
  await expect.poll(async () => page.evaluate(() => window.LOT_KING.editor.state.playPreview === true)).toBe(true);
  await page.locator('[data-app-menu="plugins"]').click();
  await page.locator('#lkCtx .lk-menu-item', {hasText:'Logic Profiler'}).first().click();
  await expect(page.locator('#lkLogicProfilerPanel')).toHaveClass(/open/);
  await expect(page.locator('#lkLogicProfilerBody')).toContainText('Runtimes');
  await expect(page.locator('#lkLogicProfilerBody')).toContainText('Template - Rotating Cube');
  await expect(page.locator('#lkLogicProfilerBody')).toContainText('events');
  await page.locator('#lkPlay').click();
  await expect(page.locator('#lkPlay')).toContainText('PREVIEW', {timeout:10000});
  await expect.poll(async () => page.evaluate(() => window.LOT_KING.editor.state.playPreview === false)).toBe(true);
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
  await expect(page.locator('.lk-sec', {hasText:'LOGIC ELEMENT'})).toContainText('Linked asset: E2E Override Counter');

  const secondsInput = page.locator('.lk-sec', {hasText:'EXPOSED VARIABLES'}).locator('.lk-row', {hasText:'secondsAlive'}).locator('input');
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
