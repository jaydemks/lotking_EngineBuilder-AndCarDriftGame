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
