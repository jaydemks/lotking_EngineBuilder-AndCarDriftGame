'use strict';

const {test, expect} = require('@playwright/test');

test('index editor frame repairs an ACTIVE project name inherited from the level library', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    const savedAt = '2026-07-30T00:00:00.000Z';
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({
      mode:'browser', onlineEditor:true, workspaceReady:true,
    }));
    localStorage.setItem('lk.editor.projects.v1', JSON.stringify({
      activeId:'parking-lot-first-ever-level-test-source',
      projects:[{id:'parking-lot-first-ever-level-test-source', name:'FPS Playground', savedAt}],
    }));
    localStorage.setItem('lk.editor.browserProject.v1', JSON.stringify({
      id:'parking-lot-first-ever-level-test-source', name:'FPS Playground', savedAt,
    }));
    localStorage.setItem('lk.editor.project.parking-lot-first-ever-level-test-source', JSON.stringify({
      format:'LKEP',
      name:'Lot King Engine Project',
      savedAt,
      meta:{
        projectName:'FPS Playground',
        projectIdentityVersion:3,
        trackId:'parking-lot-first-ever-level-test-source',
        trackName:'Parking Lot First Ever Level Test Source',
        levelRole:'gameplay',
      },
    }));
    localStorage.setItem('lotking.levels.v1', JSON.stringify({
      activeId:'parking-lot',
      levels:[
        {id:'parking-lot', name:'Parking Lot'},
        {id:'fps-playground', name:'FPS Playground'},
      ],
    }));
    localStorage.setItem('lotking.scene.v1', JSON.stringify({
      format:'LKEP',
      savedAt,
      meta:{trackId:'parking-lot', trackName:'Parking Lot', levelRole:'gameplay'},
    }));
  });

  await page.goto('/index.html?project-identity-landing=1', {waitUntil:'domcontentloaded'});
  await page.evaluate(() => {
    const frame = document.querySelector('#editorFrame');
    frame.src = 'engine_editor.html?project-identity-landing=1';
  });

  await expect.poll(() => page.evaluate(() => {
    const index = JSON.parse(localStorage.getItem('lk.editor.projects.v1') || 'null');
    const project = JSON.parse(localStorage.getItem('lk.editor.project.parking-lot-first-ever-level-test-source') || 'null');
    const marker = JSON.parse(localStorage.getItem('lk.editor.browserProject.v1') || 'null');
    return {
      name:index && index.projects && index.projects[0] && index.projects[0].name,
      projectName:project && project.meta && project.meta.projectName,
      version:project && project.meta && project.meta.projectIdentityVersion,
      markerName:marker && marker.name,
      levelNames:JSON.parse(localStorage.getItem('lotking.levels.v1') || 'null').levels.map(level => level.name),
    };
  }), {timeout:90000}).toEqual({
    name:'Lot King Engine Project',
    projectName:'Lot King Engine Project',
    version:4,
    markerName:'Lot King Engine Project',
    levelNames:['Parking Lot', 'FPS Playground'],
  });
});

test('Author DEMO keeps a discoverable disk project and loading it resolves the complete LKEP', async ({page}) => {
  const savedAt = '2026-08-01T20:26:42.000Z';
  const scene = {version:1, counter:0, transforms:{}, props:{}, deleted:[], added:[], env:{}, player:{}, characterGround:null, characterSoundSetId:null, ui:{}, logic:{}};
  const localProject = {
    format:'LKEP',
    version:'0.7.8',
    name:'Lot King Engine Project',
    savedAt,
    meta:{projectName:'Demo project playground ( Create new level for more )', trackId:'soccer-2', trackName:'Soccer'},
    scene,
  };
  let bridgeReads = 0;
  await page.route('**/__lotking/project-state', async route => {
    bridgeReads += 1;
    await route.fulfill({
      status:200,
      contentType:'application/json',
      headers:{ETag:'"local-project-test"'},
      body:JSON.stringify(localProject),
    });
  });
  await page.addInitScript(({savedAt, scene}) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({
      mode:'browser', onlineEditor:true, workspaceReady:true, sourceTemplate:'demo', demoSeedPending:false,
    }));
    localStorage.setItem('lk.editor.projects.v1', JSON.stringify({
      activeId:'author-demo',
      projects:[{id:'author-demo', name:'Author DEMO', savedAt}],
    }));
    localStorage.setItem('lk.editor.browserProject.v1', JSON.stringify({id:'author-demo', name:'Author DEMO', savedAt}));
    localStorage.setItem('lk.editor.project.author-demo', JSON.stringify({
      format:'LKEP', version:'0.7.8', savedAt,
      meta:{projectName:'Author DEMO', projectIdentityVersion:4, projectIdentityExplicit:true, trackId:'author-demo', trackName:'Author DEMO'},
      scene,
    }));
    localStorage.setItem('lotking.scene.v1', JSON.stringify({
      format:'LKEP', version:'0.7.8', savedAt,
      meta:{trackId:'author-demo', trackName:'Author DEMO'}, scene,
    }));
  }, {savedAt, scene});

  await page.goto('/engine_editor.html?local-project-bridge=1', {waitUntil:'domcontentloaded'});
  await expect.poll(() => page.evaluate(() => {
    const index = JSON.parse(localStorage.getItem('lk.editor.projects.v1') || 'null');
    const disk = index && index.projects && index.projects.find(project => project.source === 'local-disk');
    return {activeId:index && index.activeId, disk:disk && {id:disk.id, name:disk.name, source:disk.source}};
  }), {timeout:30000}).toEqual({
    activeId:'author-demo',
    disk:{id:'local-project', name:'Local Project', source:'local-disk'},
  });

  await page.evaluate(() => {
    document.querySelector('#lkWorkspaceBtn').click();
    document.querySelector('#lkWorkspaceBrowser').click();
  });
  await expect.poll(() => page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('lk.projectWorkspace.v1') || 'null');
    const sceneProject = JSON.parse(localStorage.getItem('lotking.scene.v1') || 'null');
    return {
      sourceTemplate:workspace && workspace.sourceTemplate,
      trackName:sceneProject && sceneProject.meta && sceneProject.meta.trackName,
    };
  }), {timeout:30000}).toEqual({sourceTemplate:null, trackName:'Soccer'});
  expect(bridgeReads).toBeGreaterThanOrEqual(2);
});
