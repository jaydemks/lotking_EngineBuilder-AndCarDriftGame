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
