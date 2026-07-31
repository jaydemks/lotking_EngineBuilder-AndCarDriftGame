'use strict';

const {test,expect}=require('@playwright/test');

test('Safari-like browser can select local browser storage without folder APIs',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.clear();
    try{Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true});}catch(error){}
    try{Object.defineProperty(window,'showOpenFilePicker',{value:undefined,configurable:true});}catch(error){}
    if(navigator.storage){
      try{Object.defineProperty(navigator.storage,'persist',{value:()=>Promise.resolve(true),configurable:true});}catch(error){}
      try{Object.defineProperty(navigator.storage,'estimate',{value:()=>Promise.resolve({usage:1024,quota:1024*1024*1024}),configurable:true});}catch(error){}
    }
  });
  await page.goto('/engine_editor.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#lkWorkspaceOverlay')).toHaveClass(/open/);
  await expect(page.locator('#lkWorkspaceFile')).toBeEnabled();
  await page.locator('#lkWorkspaceBrowser').click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lk.projectWorkspace.v1')||'null'))).toMatchObject({mode:'browser',onlineEditor:true,workspaceReady:true});
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lk.projectWorkspace.v1')||'null').storagePersistent)).toBe(true);
});

test('Apple GPU compatibility profile avoids unstable screen-space passes',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('lk.projectWorkspace.v1',JSON.stringify({mode:'browser',onlineEditor:true,workspaceReady:true})));
  await page.goto('/engine_editor.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LK_RUNTIME_RENDERING_BACKEND&&window.LOT_KING&&LOT_KING.core&&LOT_KING.core.renderer);
  const profile=await page.evaluate(()=>{
    const renderer = {
      userData: {},
      getContext() {
        return {
          RENDERER: 1,
          VENDOR: 2,
          MAX_TEXTURE_SIZE: 3,
          MAX_SAMPLES: 4,
          getExtension(name) {
            if (name === 'WEBGL_debug_renderer_info') {
              return { UNMASKED_RENDERER_WEBGL: 5, UNMASKED_VENDOR_WEBGL: 6 };
            }
            if (name === 'EXT_color_buffer_float') return {};
            return null;
          },
          getParameter(key) {
            if (key === 5) return 'ANGLE (Apple, Apple M3, Metal)';
            if (key === 6) return 'Apple';
            if (key === 3) return 16384;
            if (key === 4) return 4;
            return 'WebGL 2';
          },
        };
      },
    };
    return LK_RUNTIME_RENDERING_BACKEND.compatibilityProfile(renderer);
  });
  expect(profile).toMatchObject({appleGpu:true,conservativePost:true,gtao:false,ssr:false,maxPixelRatio:2});
});

test('online DEMO becomes a complete private browser workspace',async({page})=>{
  test.setTimeout(300000);
  const pageErrors=[];
  const sharedProjectWrites=[];
  page.on('pageerror',error=>pageErrors.push(String(error&&error.message||error)));
  page.on('request',request=>{
    if(!/^(POST|PUT|PATCH|DELETE)$/i.test(request.method()))return;
    if(/__lotking\/(?:project-state|publish-demo)|api\.github\.com/i.test(request.url()))sharedProjectWrites.push(request.method()+' '+request.url());
  });
  await page.addInitScript(()=>{
    if(!sessionStorage.getItem('lk.test.privateDemoInitialized')){
      localStorage.clear();
      localStorage.setItem('lk.projectWorkspace.v1',JSON.stringify({
        mode:'demo',
        onlineEditor:false,
        workspaceReady:true,
        startupTemplate:'demo',
      }));
      sessionStorage.setItem('lk.test.privateDemoInitialized','1');
    }
    try{Object.defineProperty(window,'showDirectoryPicker',{value:undefined,configurable:true});}catch(error){}
  });
  await page.goto('/engine_editor.html?online-demo-save-regression=1',{waitUntil:'domcontentloaded'});
  // The published fixture intentionally exercises the complete 100+ MB DEMO.
  // SwiftShader CI can spend more than two minutes parsing, localizing and
  // applying it even though the browser remains responsive between phases.
  await page.waitForFunction(()=>window.LOT_KING&&LOT_KING.editor&&LOT_KING.editor.state.active===true,null,{timeout:240000});
  await page.evaluate(()=>{
    document.querySelector('#lkProjectsClose')?.click();
    document.querySelector('#lkWorkspaceClose')?.click();
  });

  await expect(page.locator('#lkSave')).toBeEnabled();
  await expect(page.locator('#lkPlay')).toBeEnabled();
  await expect(page.locator('#lkSaveAsTrack')).toBeEnabled();
  await expect(page.locator('#lkAssetImport')).toBeEnabled();
  await expect.poll(()=>page.evaluate(()=>LK_PROJECT_WORKSPACE.state())).toMatchObject({
    mode:'browser',
    onlineEditor:true,
    workspaceReady:true,
    sourceTemplate:'demo',
  });
  expect(await page.evaluate(()=>LK_PROJECT_WORKSPACE.isOnlineDemoMode())).toBe(false);
  expect(await page.evaluate(()=>LK_PROJECT_WORKSPACE.isPrivateBrowserDemo())).toBe(true);
  await page.locator('#lkTrackName').fill('Private Browser DEMO');
  await page.locator('#lkSave').click();
  await expect(page.locator('#lkDemoSaveOverlay')).toHaveCount(0);
  expect(sharedProjectWrites).toEqual([]);
  await expect.poll(()=>page.evaluate(()=>{
    const index=JSON.parse(localStorage.getItem('lk.editor.projects.v1')||'null');
    const record=index&&index.projects&&index.projects.find(item=>item.id===index.activeId);
    const project=record&&JSON.parse(localStorage.getItem('lk.editor.project.'+record.id)||'null');
    return {count:index&&index.projects&&index.projects.length||0,name:project&&project.meta&&project.meta.trackName};
  })).toMatchObject({count:1,name:'Private Browser DEMO'});
  await page.locator('#lkPlay').click();
  await page.waitForFunction(()=>LOT_KING.editor.state.playPreview===true,null,{timeout:120000});
  await expect(page.locator('#lkDemoSaveOverlay')).toHaveCount(0);
  await expect(page.locator('#lkEditor')).toHaveClass(/play-preview/);
  // Play may own pointer lock for Free Camera, so use the documented global
  // stop shortcut rather than pretending the hidden cursor can click toolbar.
  await page.keyboard.press('F8');
  await expect.poll(()=>page.evaluate(()=>LOT_KING.editor.state.playPreview)).toBe(false);

  await page.locator('#lkSimulate').click();
  await page.waitForFunction(()=>LOT_KING.editor.state.simulatePreview===true,null,{timeout:120000});
  await expect(page.locator('#lkDemoSaveOverlay')).toHaveCount(0);
  await expect(page.locator('#lkEditor')).toHaveClass(/simulate-preview/);
  await page.locator('#lkSimulate').click();
  await expect.poll(()=>page.evaluate(()=>LOT_KING.editor.state.simulatePreview)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>{
    const index=JSON.parse(localStorage.getItem('lotking.levels.v1')||'null');
    const activeId=index&&index.activeId;
    const active=activeId&&JSON.parse(localStorage.getItem('lotking.level.'+activeId)||'null');
    const slot=JSON.parse(localStorage.getItem('lotking.scene.v1')||'null');
    return {
      activeId,
      catalogName:index&&index.levels&&index.levels.find(item=>item.id===activeId)?.name,
      levelName:active&&active.meta&&active.meta.trackName,
      slotName:slot&&slot.meta&&slot.meta.trackName,
    };
  })).toMatchObject({
    catalogName:'Private Browser DEMO',
    levelName:'Private Browser DEMO',
    slotName:'Private Browser DEMO',
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LOT_KING&&LOT_KING.editor&&LOT_KING.editor.state.active===true,null,{timeout:120000});
  await expect(page.locator('#lkTrackName')).toHaveValue('Private Browser DEMO');
  expect(await page.evaluate(()=>LK_PROJECT_WORKSPACE.isPrivateBrowserDemo())).toBe(true);
  expect(pageErrors).toEqual([]);
});

test('private DEMO can optionally mirror the exact session to a local folder',async({page})=>{
  test.setTimeout(240000);
  await page.addInitScript(()=>{
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1',JSON.stringify({
      mode:'demo',
      onlineEditor:false,
      workspaceReady:true,
    }));
    const files=new Map();
    const directory=(prefix,name)=>({
      kind:'directory',
      name:name||'LotKing Test Workspace',
      queryPermission:async()=> 'granted',
      requestPermission:async()=> 'granted',
      getDirectoryHandle:async child=>directory(prefix+child+'/',child),
      getFileHandle:async fileName=>({
        kind:'file',
        name:fileName,
        createWritable:async()=>({
          write:async value=>files.set(prefix+fileName,value instanceof Blob?await value.text():String(value)),
          close:async()=>{},
        }),
        getFile:async()=>({text:async()=>files.get(prefix+fileName)||''}),
      }),
    });
    window.__lkTestWorkspaceFiles=files;
    window.showDirectoryPicker=async()=>directory('','LotKing Test Workspace');
  });
  await page.goto('/engine_editor.html?online-demo-folder-save-regression=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LOT_KING&&LOT_KING.editor&&LOT_KING.editor.state.active===true,null,{timeout:120000});
  await page.evaluate(()=>{
    document.querySelector('#lkProjectsClose')?.click();
    document.querySelector('#lkWorkspaceClose')?.click();
  });
  await page.evaluate(()=>LK_PROJECT_WORKSPACE.connectFolder({initialize:false}));
  await expect.poll(()=>page.evaluate(()=>LK_PROJECT_WORKSPACE.state())).toMatchObject({
    mode:'folder',
    onlineEditor:true,
    workspaceReady:true,
    folderName:'LotKing Test Workspace',
  });
  await page.locator('#lkSave').click();
  await expect.poll(()=>page.evaluate(()=>Array.from(window.__lkTestWorkspaceFiles.keys()).some(path=>/^lotking-workspace\/projects\/.+\.lkep\.json$/.test(path)))).toBe(true);
  const saved=await page.evaluate(()=>({
    paths:Array.from(window.__lkTestWorkspaceFiles.keys()).sort(),
    project:JSON.parse(window.__lkTestWorkspaceFiles.get('lotking-workspace/active-project.lkep.json')),
  }));
  expect(saved.paths).toContain('lotking-workspace/active-project.lkep.json');
  expect(saved.paths).toContain('lotking-workspace/projects.json');
  expect(saved.paths.some(path=>/^lotking-workspace\/projects\/.+\.lkep\.json$/.test(path))).toBe(true);
  expect(saved.project.format).toBe('LKEP');
  expect(await page.evaluate(()=>LK_PROJECT_WORKSPACE.isOnlineDemoMode())).toBe(false);
  await expect(page.locator('#lkSaveAsTrack')).toBeEnabled();
});
