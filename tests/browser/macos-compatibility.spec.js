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
