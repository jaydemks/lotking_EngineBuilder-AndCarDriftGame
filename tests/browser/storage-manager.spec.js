'use strict';

const {test, expect} = require('@playwright/test');

test('storage manager inventories only Lot King data and protects destructive cleanup', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
    localStorage.setItem('lk.editor.projects.v1', JSON.stringify({
      activeId:'active-project',
      projects:[
        {id:'active-project', name:'Active Project', savedAt:'2026-07-25T10:00:00.000Z'},
        {id:'saved-project', name:'Saved Project', savedAt:'2026-07-24T10:00:00.000Z'},
      ],
    }));
    localStorage.setItem('lk.editor.browserProject.v1', JSON.stringify({id:'active-project', savedAt:'2026-07-25T10:00:00.000Z'}));
    localStorage.setItem('lk.editor.project.active-project', JSON.stringify({format:'LKEP', savedAt:'2026-07-25T10:00:00.000Z', meta:{trackId:'active-project', trackName:'Active Project'}}));
    localStorage.setItem('lk.editor.project.saved-project', JSON.stringify({format:'LKEP', savedAt:'2026-07-24T10:00:00.000Z', meta:{trackId:'saved-project', trackName:'Saved Project'}}));
    localStorage.setItem('lk.editor.project.storage-orphan', JSON.stringify({format:'LKEP', meta:{trackId:'storage-orphan'}}));
    localStorage.setItem('lotking.storageManagerTest.pref.v1', JSON.stringify({enabled:true}));
    localStorage.setItem('anotherProduct.privateData', 'must-survive');
    sessionStorage.setItem('lotking.storageManagerTest.session.v1', 'temporary');
  });

  await page.goto('/engine_editor.html?storage-manager-regression=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!document.querySelector('#lkEditor.active'), null, {timeout:60000});
  await page.evaluate(() => {
    document.querySelector('#lkWorkspaceClose')?.click();
    document.querySelector('#lkProjectsClose')?.click();
    document.querySelector('#lkLogoBtn')?.click();
  });
  await page.locator('[data-prefs-tab="storage"]').click();

  const manager = page.locator('#lkStorageManager');
  await expect(manager.locator('input[data-storage-id="localStorage:lk.editor.project.storage-orphan"]')).toBeVisible({timeout:30000});
  await expect(manager).not.toContainText('anotherProduct.privateData');
  await expect(manager).toContainText(/Unlisted local projects|Progetti locali non indicizzati/i);
  await expect(manager).toContainText(/schema identifiers|schema dei dati/i);
  await expect(manager.locator('input[data-storage-id="localStorage:lk.editor.project.active-project"]').locator('..').locator('.state')).toHaveText(/ACTIVE PROJECT|PROGETTO ATTIVO/i);
  await expect(manager.locator('input[data-storage-id="localStorage:lk.editor.project.saved-project"]').locator('..').locator('.state')).toHaveText(/SAVED PROJECT|PROGETTO SALVATO/i);
  await expect(manager.locator('input[data-storage-id="localStorage:lk.editor.project.storage-orphan"]').locator('..').locator('.state')).toHaveText(/NOT IN PROJECT LIST|FUORI DALLA LISTA PROGETTI/i);
  await manager.locator('[data-storage-filter="review"]').click();
  await expect(manager.locator('input[data-storage-id="localStorage:lk.editor.project.storage-orphan"]')).toBeVisible();
  await expect(manager.locator('input[data-storage-id="localStorage:lk.editor.project.active-project"]')).toHaveCount(0);
  await manager.locator('[data-storage-filter="all"]').click();

  await manager.locator('input[data-storage-id="localStorage:lk.editor.project.storage-orphan"]').check();
  await manager.getByRole('button', {name:/Review selected cleanup|Rivedi pulizia selezionata/i}).click();
  await expect(manager.locator('.lk-storage-safety input')).toBeVisible();
  await expect(manager.locator('.lk-storage-delete-word')).toBeVisible();
  await manager.getByRole('button', {name:/Cancel|Annulla/i}).click();

  await manager.getByRole('button', {name:/Clear selection|Azzera selezione/i}).click();
  await manager.locator('input[data-storage-id="localStorage:lotking.storageManagerTest.pref.v1"]').check();
  await manager.getByRole('button', {name:/Review selected cleanup|Rivedi pulizia selezionata/i}).click();
  await expect(manager.locator('.lk-storage-delete-word')).toHaveCount(0);
  await manager.getByRole('button', {name:/Delete selected data|Elimina i dati selezionati/i}).click();

  await expect.poll(() => page.evaluate(() => ({
    removed:localStorage.getItem('lotking.storageManagerTest.pref.v1'),
    unrelated:localStorage.getItem('anotherProduct.privateData'),
    protectedProject:localStorage.getItem('lk.editor.project.storage-orphan'),
  }))).toEqual({
    removed:null,
    unrelated:'must-survive',
    protectedProject:JSON.stringify({format:'LKEP', meta:{trackId:'storage-orphan'}}),
  });
});

test('active level uses one storage slot and survives level switches', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/test-editor.html?active-level-storage=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!window.LK_STORE && !!window.LK_STORE.levels);
  const result = await page.evaluate(() => {
    [
      'lotking.scene.v1',
      'lotking.levels.v1',
      'lotking.level.quota-a',
      'lotking.level.quota-b',
    ].forEach(key => localStorage.removeItem(key));
    const first = LK_STORE.blank();
    const saved = LK_STORE.save(first, {trackId:'quota-a', trackName:'Quota A'});
    const firstProject = LK_STORE.levels.get('quota-a');
    const firstDuplicatedAfterSave = localStorage.getItem('lotking.level.quota-a') !== null;
    const secondId = LK_STORE.levels.create('Quota B', LK_STORE.blank(), {trackId:'quota-b'});
    const switched = LK_STORE.levels.setActive(secondId);
    return {
      saved,
      firstReadable:!!firstProject,
      firstDuplicatedAfterSave,
      switched,
      previousArchived:localStorage.getItem('lotking.level.quota-a') !== null,
      nextDuplicated:localStorage.getItem('lotking.level.' + secondId) !== null,
      activeName:(LK_STORE.loadProject().meta || {}).trackName,
    };
  });
  expect(result).toEqual({
    saved:true,
    firstReadable:true,
    firstDuplicatedAfterSave:false,
    switched:true,
    previousArchived:true,
    nextDuplicated:false,
    activeName:'Quota B',
  });
});

test('material maps persist as IndexedDB blob keys instead of LocalStorage data URLs', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/test-editor.html?material-map-storage=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!window.LK_EDITOR_ASSET_IMPORTS && !!window.LK_ASSET_BLOBS);
  const result = await page.evaluate(async () => {
    let metadata = null;
    const imports = LK_EDITOR_ASSET_IMPORTS.create({
      GAME:{i18n:{lang:'en'}},
      STORE:{},
      assetKeyFromFile:() => 'texture:test-normal',
      assetDbKeyFromFile:() => 'texture:test-normal:4:1',
      upsertImportedAsset:(file, data) => {
        metadata = Object.assign({id:'test-normal', kind:'texture', name:file.name, size:file.size}, data);
        return metadata;
      },
      refreshAssetsPanel:()=>{},
    });
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'test-normal.png', {type:'image/png', lastModified:1});
    const asset = await imports.storeMaterialTextureFile(file);
    const url = await LK_ASSET_BLOBS.getUrl(asset.dbKey);
    const bytes = Array.from(new Uint8Array(await (await fetch(url)).arrayBuffer()));
    return {asset, metadata, bytes};
  });
  expect(result.asset.src).toBeNull();
  expect(result.asset.dbKey).toBe('texture:test-normal:4:1');
  expect(result.metadata.src).toBeNull();
  expect(result.bytes).toEqual([1, 2, 3, 4]);
});
