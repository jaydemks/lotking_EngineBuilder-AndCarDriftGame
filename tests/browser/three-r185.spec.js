'use strict';

const {test, expect} = require('@playwright/test');

function captureRuntimeFailures(page){
  const failures = [];
  page.on('pageerror', error => failures.push('pageerror: ' + error.message));
  page.on('console', message => {
    if(message.type() === 'error') failures.push('console: ' + message.text() + ' @ ' + (message.location().url || 'unknown'));
    if(message.type() === 'warning' && /THREE\.|WebGL|GLSL/i.test(message.text())) failures.push('warning: ' + message.text());
  });
  page.on('response', response => {
    if(response.status() >= 400) failures.push(`http ${response.status()}: ${response.url()}`);
  });
  return failures;
}

function unexpectedFailures(failures){
  // The repository intentionally omits optional parked-prop models and exercises
  // their procedural fallbacks. The retired player fallback must never be requested.
  // The generic Playwright static host also intentionally has no local disk
  // project bridge; the editor treats that endpoint's 404 as a browser-cache fallback.
  return failures.filter(message =>
    !/models\/(?:car1|car2|cone)(?:\.glb|\/scene\.gltf)/.test(message) &&
    !/__lotking\/project-state/.test(message) &&
    !/WebGPURenderer: WebGPU is not available, running under WebGL2 backend/.test(message) &&
    !/WebGPU request continued through the WebGL 2 fallback/.test(message)
  );
}

async function seedWorkspace(page){
  await page.route(/\/models\/(?:car1|car2|cone)\.glb(?:\?.*)?$/, route => route.fulfill({status:404, body:''}));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
}

test('editor boots on the pinned Three.js r185 bundle', async ({page}, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await seedWorkspace(page);
  await page.goto('/engine_editor.html?three-r185-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.THREE && THREE.REVISION === '185' && window.LOT_KING && LOT_KING.core && LOT_KING.core.renderer);
  await page.waitForFunction(() => LOT_KING.state && LOT_KING.state.sceneReady === true, null, {timeout:30000});
  await page.evaluate(() => { document.querySelector('#lkWorkspaceClose')?.click(); document.querySelector('#lkProjectsClose')?.click(); });
  const active = await page.waitForFunction(() => !!(document.querySelector('#lkEditor.active') || LOT_KING.editor && LOT_KING.editor.state && LOT_KING.editor.state.active), null, {timeout:15000}).then(() => true).catch(() => false);
  if(!active){
    await page.locator('#editorBtn').waitFor({state:'visible', timeout:15000});
    await page.locator('#editorBtn').click({force:true});
  }
  await page.waitForFunction(() => !!(document.querySelector('#lkEditor.active') || LOT_KING.editor && LOT_KING.editor.state && LOT_KING.editor.state.active));
  const state = await page.evaluate(() => {
    const gl = LOT_KING.core.renderer.getContext();
    return {
      revision:THREE.REVISION,
      bundle:THREE.__LOT_KING_BUNDLE__,
      outputColorSpace:LOT_KING.core.renderer.outputColorSpace,
      expectedColorSpace:THREE.SRGBColorSpace,
      webgl2:typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
      addons:['WebGPURenderer','RenderPipeline','TSL','GLTFLoader','FBXLoader','TGALoader','GLTFExporter','SkeletonUtils','OrbitControls','TransformControls','EffectComposer','OutputPass','SSRPass','BokehPass','OutlineEffect','FontLoader','TextGeometry','RectAreaLightUniformsLib'].every(key => !!THREE[key]),
      fbxPlugin:(() => {
        const plugins = LOT_KING.editor && LOT_KING.editor.plugins;
        const descriptor = plugins && plugins.list().find(plugin => plugin.id === 'fbx-glb-importer');
        const importers = plugins && plugins.extensions('assetImporter') || [];
        return !!(descriptor && descriptor.enabled && descriptor.registered && importers.some(importer => importer.type === 'fbx'));
      })(),
      neonAreaLights:(() => {
        const lights = [];
        LOT_KING.player.car.traverse(node => { if(node.userData && node.userData.vehicleNeonAreaLight) lights.push(node); });
        return lights.length === 4 && lights.every(light => light.isRectAreaLight && light.rotation.x > 1.5);
      })(),
      transformHelper:LOT_KING.core.scene.children.some(child => child && child.isTransformControlsRoot === true),
    };
  });
  expect(state).toEqual({
    revision:'185',
    bundle:{version:'0.185.1', revision:'185', format:'iife-compat-v2', webgpu:true, tsl:true},
    outputColorSpace:state.expectedColorSpace,
    expectedColorSpace:state.expectedColorSpace,
    webgl2:true,
    addons:true,
    fbxPlugin:true,
    neonAreaLights:true,
    transformHelper:true,
  });
  const pointerGuardInstalled = await page.evaluate(async () => {
    const canvas = LOT_KING.core.renderer.domElement;
    // Synthetic events do not represent an active OS pointer, so the native
    // setPointerCapture call throws InvalidStateError. This reproduces the
    // failure mode while verifying that editor input still reaches cleanup.
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles:true, pointerId:987654, pointerType:'mouse', button:0, buttons:1,
      clientX:Math.max(1, canvas.getBoundingClientRect().left + 8),
      clientY:Math.max(1, canvas.getBoundingClientRect().top + 8),
    }));
    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles:true, pointerId:987654, pointerType:'mouse', button:0, buttons:0,
      clientX:Math.max(1, canvas.getBoundingClientRect().left + 8),
      clientY:Math.max(1, canvas.getBoundingClientRect().top + 8),
    }));
    await new Promise(resolve => setTimeout(resolve, 20));
    return canvas.__lkPointerCaptureGuard === true;
  });
  expect(pointerGuardInstalled).toBe(true);
  const poleDuplicate = await page.evaluate(async () => {
    const source = LOT_KING.world.registry.find(object => object.userData && /^Light Pole /.test(object.userData.editorName || ''));
    if(!source) return null;
    const before = LOT_KING.world.registry.length;
    LOT_KING.editor.state.selected = source;
    document.body.dispatchEvent(new KeyboardEvent('keydown', {bubbles:true, key:'d', ctrlKey:true}));
    await new Promise(resolve => setTimeout(resolve, 30));
    const copy = LOT_KING.world.registry.find(object => object !== source && object.userData && object.userData.addedEntry && object.userData.addedEntry.srcId === source.userData.editorId);
    return copy ? {
      count:LOT_KING.world.registry.length - before,
      colliderKind:copy.userData.collider && copy.userData.collider.kind,
      independentCollider:!!(copy.userData.collider && source.userData.collider && copy.userData.collider.ref !== source.userData.collider.ref),
      offsetX:Math.round((copy.position.x - source.position.x) * 1000) / 1000,
    } : null;
  });
  expect(poleDuplicate).toEqual({count:1, colliderKind:'circle', independentCollider:true, offsetX:3});
  const restoredPoleClone = await page.evaluate(async () => {
    const source = LOT_KING.world.registry.find(object => object.userData && /^Light Pole /.test(object.userData.editorName || ''));
    if(!source) return null;
    const originalUserData = source.userData;
    const clone = await LK_STORE.createFromEntry({kind:'clone', srcId:source.userData.editorId}, LOT_KING);
    return {
      created:!!clone,
      sourceUserDataRestored:source.userData === originalUserData,
      rootUserDataEmpty:Object.keys(clone.userData || {}).length === 0,
    };
  });
  expect(restoredPoleClone).toEqual({created:true, sourceUserDataRestored:true, rootUserDataEmpty:true});
  await page.screenshot({path:testInfo.outputPath('editor-r185.png')});
  expect(unexpectedFailures(failures)).toEqual([]);
});

test('gameplay boots on the same Three.js r185 bundle', async ({page}, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await seedWorkspace(page);
  await page.goto('/gameplay.html?three-r185-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.THREE && THREE.REVISION === '185' && window.LOT_KING && LOT_KING.core && LOT_KING.core.renderer);
  await expect(page.locator('#quickPlayBtn')).toBeVisible();
  const state = await page.evaluate(() => ({
    revision:THREE.REVISION,
    version:THREE.__LOT_KING_BUNDLE__ && THREE.__LOT_KING_BUNDLE__.version,
    outputColorSpace:LOT_KING.core.renderer.outputColorSpace,
    expectedColorSpace:THREE.SRGBColorSpace,
    postReady:!!(LOT_KING.systems && LOT_KING.systems.post),
  }));
  expect(state).toEqual({revision:'185', version:'0.185.1', outputColorSpace:state.expectedColorSpace, expectedColorSpace:state.expectedColorSpace, postReady:true});
  await page.screenshot({path:testInfo.outputPath('gameplay-r185.png')});
  expect(unexpectedFailures(failures)).toEqual([]);
});

test('r185 GLTFExporter preserves normal maps, multiple scenes and animation clips', async ({page}) => {
  await seedWorkspace(page);
  await page.goto('/gameplay.html?three-r185-exporter=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.THREE && THREE.REVISION === '185');
  const result=await page.evaluate(async()=>{
    const normalCanvas=document.createElement('canvas');normalCanvas.width=2;normalCanvas.height=2;const normalContext=normalCanvas.getContext('2d');normalContext.fillStyle='rgb(128,128,255)';normalContext.fillRect(0,0,2,2);const normal=new THREE.CanvasTexture(normalCanvas);normal.needsUpdate=true;normal.name='UnitNormal';
    const material=new THREE.MeshStandardMaterial({color:0x88aaff,normalMap:normal,normalScale:new THREE.Vector2(.7,.8)});
    const animated=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),material);animated.name='AnimatedMesh';
    const second=new THREE.Mesh(new THREE.SphereGeometry(.5,8,6),new THREE.MeshStandardMaterial());second.name='SecondMesh';
    const sceneA=new THREE.Scene(),sceneB=new THREE.Scene();sceneA.name='SceneA';sceneB.name='SceneB';sceneA.add(animated);sceneB.add(second);
    const clip=new THREE.AnimationClip('MoveX',1,[new THREE.NumberKeyframeTrack('AnimatedMesh.position[x]',[0,1],[0,2])]);
    const buffer=await new THREE.GLTFExporter().parseAsync([sceneA,sceneB],{binary:true,animations:[[clip],[]],onlyVisible:false});
    const gltf=await new THREE.GLTFLoader().parseAsync(buffer,'');let exportedMaterial=null;gltf.scenes.forEach(scene=>scene.traverse(node=>{if(node.isMesh&&node.material&&node.material.normalMap)exportedMaterial=node.material;}));
    normal.dispose();material.dispose();animated.geometry.dispose();second.geometry.dispose();second.material.dispose();
    return {binary:buffer instanceof ArrayBuffer,scenes:gltf.scenes.map(scene=>scene.name),animations:gltf.animations.map(item=>item.name),hasNormalMap:!!exportedMaterial,normalScale:exportedMaterial&&exportedMaterial.normalScale?exportedMaterial.normalScale.toArray():null};
  });
  expect(result.binary).toBe(true);
  expect(result.scenes).toEqual(['SceneA','SceneB']);
  expect(result.animations).toContain('MoveX');
  expect(result.hasNormalMap).toBe(true);
  // r185 bakes a non-uniform Y normal scale into the exported texture and
  // retains the canonical glTF scalar strength on the loaded material.
  expect(result.normalScale).toEqual([.7,-.7]);
});

test('standalone editor harness uses the same pinned renderer', async ({page}) => {
  const failures = captureRuntimeFailures(page);
  await seedWorkspace(page);
  await page.goto('/test-editor.html?three-r185-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.THREE && THREE.REVISION === '185' && window.LOT_KING && LOT_KING.core && LOT_KING.core.renderer);
  const state = await page.evaluate(() => ({
    revision:THREE.REVISION,
    version:THREE.__LOT_KING_BUNDLE__ && THREE.__LOT_KING_BUNDLE__.version,
    outputColorSpace:LOT_KING.core.renderer.outputColorSpace,
    expectedColorSpace:THREE.SRGBColorSpace,
  }));
  expect(state).toEqual({revision:'185', version:'0.185.1', outputColorSpace:state.expectedColorSpace, expectedColorSpace:state.expectedColorSpace});
  expect(unexpectedFailures(failures)).toEqual([]);
});

test('Auto keeps WebGPU behind the engine and mobile parity gate', async ({page}, testInfo) => {
  const failures = captureRuntimeFailures(page);
  await seedWorkspace(page);
  await page.goto('/gameplay.html?webgpu-readiness-gate=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LK_RUNTIME_RENDERING_BACKEND && window.LOT_KING && LOT_KING.core && LOT_KING.core.renderer);
  const state = await page.evaluate(async () => {
    const backend = LK_RUNTIME_RENDERING_BACKEND;
    const probe = await backend.probe();
    const report = backend.describe(LOT_KING.core.renderer);
    return {
      webgpuApi:probe.webgpuApi,
      adapterAvailable:probe.adapterAvailable,
      probeError:probe.error,
      requested:report.requested,
      effective:report.effective,
      runtimeIncluded:report.readiness.runtimeIncluded,
      platformAvailable:report.readiness.platformAvailable,
      defaultSafe:report.readiness.defaultSafe,
      mobileQualified:report.readiness.mobileQualified,
      mobile:report.readiness.mobile,
      blockers:report.readiness.blockers.map(item => item.id),
    };
  });
  expect(state.requested).toBe('auto');
  expect(typeof state.webgpuApi).toBe('boolean');
  expect(typeof state.adapterAvailable).toBe('boolean');
  expect(typeof state.probeError).toBe('string');
  expect(state.effective).toBe('webgl');
  expect(state.runtimeIncluded).toBe(true);
  expect(state.defaultSafe).toBe(false);
  expect(state.mobileQualified).toBe(false);
  expect(state.mobile).toBe(/mobile/i.test(testInfo.project.name));
  expect(state.blockers).toEqual(expect.arrayContaining(['legacy-shaders','material-patches','legacy-post','webgl-render-targets','mobile-qualification']));
  expect(state.blockers).not.toContain('runtime-bundle');
  await page.locator('#settingsBtn').click();
  await page.locator('[data-settings-tab="video"]').click();
  await expect(page.locator('#videoGpuBackend')).toBeVisible();
  const videoMenu = await page.evaluate(() => {
    const gpu=document.getElementById('videoGpuBackend');
    const webgpu=gpu&&gpu.querySelector('option[value="webgpu"]');
    const pipeline=document.getElementById('videoRenderer');
    return {
      gpuValues:Array.from(gpu&&gpu.options||[]).map(option=>option.value),
      webgpuDisabled:!!(webgpu&&webgpu.disabled),
      webgpuLabel:webgpu&&webgpu.textContent,
      status:document.getElementById('videoGpuBackendStatus')&&document.getElementById('videoGpuBackendStatus').textContent,
      pipelineValues:Array.from(pipeline&&pipeline.options||[]).map(option=>option.value),
    };
  });
  expect(videoMenu.gpuValues).toEqual(['auto','webgpu','webgl']);
  expect(videoMenu.webgpuDisabled).toBe(!state.platformAvailable);
  expect(videoMenu.webgpuLabel).toContain('WebGPU');
  expect(videoMenu.status).toContain('WebGL 2');
  expect(videoMenu.pipelineValues).toEqual(['webgl','raytracing','pathtracing']);
  expect(unexpectedFailures(failures)).toEqual([]);
});

test('explicit WebGPU preference boots the complete runtime or its safe fallback', async ({page}) => {
  const failures=captureRuntimeFailures(page);
  await seedWorkspace(page);
  await page.addInitScript(()=>localStorage.setItem('lotking.renderBackend.v1','webgpu'));
  await page.goto('/gameplay.html?webgpu-full-runtime=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LOT_KING&&LOT_KING.core&&LOT_KING.core.rendererReady);
  await page.waitForFunction(()=>LOT_KING.core.renderer.userData&&LOT_KING.core.renderer.userData.lkBackendReady===true);
  await page.waitForFunction(()=>Number(LOT_KING.core.renderer.info&&LOT_KING.core.renderer.info.render&&LOT_KING.core.renderer.info.render.calls)>0,null,{timeout:30000});
  const state=await page.evaluate(async()=>{
    const report=await LOT_KING.core.rendererReady;
    const config=LOT_KING.settings.getVideoProject();
    Object.assign(config.defaults,{visualStyle:'illustrated-sketch',sketchMedium:'paper-pencil',sketchStrength:.9,sketchDetail:.82,sketchPaper:.55});
    await LOT_KING.settings.setVideoProject(config);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const renderer=LOT_KING.core.renderer;
    const post=LOT_KING.systems&&LOT_KING.systems.post;
    const pathTracing=LOT_KING.systems&&LOT_KING.systems.pathTracing;
    return {
      requested:report.requested,
      effective:report.effective,
      candidate:report.capabilities.webgpuCandidate,
      commonRenderer:renderer.isWebGPURenderer===true,
      actualWebGPU:LK_RUNTIME_RENDERING_BACKEND.isActualWebGPU(renderer),
      ready:renderer.userData.lkBackendReady===true,
      postWebGPU:post&&post.webgpu===true,
      pathTracingSupported:!!(pathTracing&&pathTracing.supported),
      renderCalls:Number(renderer.info&&renderer.info.render&&renderer.info.render.calls)||0,
      bundleWebGPU:THREE.__LOT_KING_BUNDLE__&&THREE.__LOT_KING_BUNDLE__.webgpu===true,
      sketchMedium:LOT_KING.settings.video.sketchMedium,
    };
  });
  expect(state.requested).toBe('webgpu');
  expect(state.ready).toBe(true);
  expect(state.bundleWebGPU).toBe(true);
  expect(state.sketchMedium).toBe('paper-pencil');
  expect(state.pathTracingSupported).toBe(false);
  expect(state.renderCalls).toBeGreaterThan(0);
  if(process.env.LK_WEBGPU_E2E==='1')expect(state.effective).toBe('webgpu');
  if(state.candidate){
    expect(state.commonRenderer).toBe(true);
    expect(state.postWebGPU).toBe(true);
    expect(state.actualWebGPU).toBe(state.effective==='webgpu');
  }else{
    expect(state.commonRenderer).toBe(false);
    expect(state.effective).toBe('webgl');
  }
  expect(unexpectedFailures(failures)).toEqual([]);
});

test('explicit backend survives Editor viewport and Play preview lifecycle',async({page})=>{
  const failures=captureRuntimeFailures(page);
  await seedWorkspace(page);
  await page.addInitScript(()=>localStorage.setItem('lotking.renderBackend.v1','webgpu'));
  await page.goto('/engine_editor.html?webgpu-editor-play=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LOT_KING&&LOT_KING.core&&LOT_KING.core.rendererReady);
  await page.evaluate(()=>LOT_KING.core.rendererReady);
  await page.waitForFunction(()=>LOT_KING.state&&LOT_KING.state.sceneReady===true,null,{timeout:30000});
  await page.evaluate(()=>{document.querySelector('#lkWorkspaceClose')?.click();document.querySelector('#lkProjectsClose')?.click();});
  const active=await page.waitForFunction(()=>!!(document.querySelector('#lkEditor.active')||LOT_KING.editor&&LOT_KING.editor.state&&LOT_KING.editor.state.active),null,{timeout:12000}).then(()=>true).catch(()=>false);
  if(!active){await page.locator('#editorBtn').waitFor({state:'visible',timeout:15000});await page.locator('#editorBtn').click({force:true});}
  await page.waitForFunction(()=>!!(document.querySelector('#lkEditor.active')||LOT_KING.editor&&LOT_KING.editor.state&&LOT_KING.editor.state.active));
  await page.evaluate(async()=>{
    const config=LOT_KING.settings.getVideoProject();
    Object.assign(config.defaults,{visualStyle:'illustrated-sketch',sketchMedium:'paper-pencil',sketchStrength:.9,sketchDetail:.82,sketchPaper:.55});
    await LOT_KING.settings.setVideoProject(config);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  await page.evaluate(()=>{
    const renderer=LOT_KING.core.renderer,raw=renderer.setViewport.bind(renderer);
    renderer.userData.lkE2eViewportCalls=[];
    renderer.setViewport=function(x,y,w,h){
      if(typeof x==='number')renderer.userData.lkE2eViewportCalls.push({x,y,w,h});
      return raw.apply(renderer,arguments);
    };
  });
  await page.locator('#lkPlay').waitFor({state:'visible'});
  await page.evaluate(()=>document.querySelector('#lkPlay').click());
  await page.waitForFunction(()=>LOT_KING.state.editorPreview===true,null,{timeout:60000});
  await page.waitForFunction(()=>Number(LOT_KING.core.renderer.info&&LOT_KING.core.renderer.info.render&&LOT_KING.core.renderer.info.render.calls)>0);
  await page.evaluate(()=>document.querySelector('#lkPlay').click());
  await page.waitForFunction(()=>LOT_KING.state.editorPreview===false);
  const state=await page.evaluate(()=>{
    const renderer=LOT_KING.core.renderer,report=LK_RUNTIME_RENDERING_BACKEND.describe(renderer);
    const rect=LOT_KING.editor.viewportRect(),bottomY=innerHeight-rect.y-rect.h;
    const expectedY=LK_RUNTIME_RENDERING_BACKEND.viewportOriginY(renderer,bottomY,rect.h,innerHeight);
    const viewportMatched=(renderer.userData.lkE2eViewportCalls||[]).some(call=>Math.abs(call.x-rect.x)<2&&Math.abs(call.y-expectedY)<2&&Math.abs(call.w-rect.w)<2&&Math.abs(call.h-rect.h)<2);
    return {requested:report.requested,effective:report.effective,ready:renderer.userData.lkBackendReady===true,editorActive:LOT_KING.state.editorActive===true,preview:LOT_KING.state.editorPreview,commonRenderer:renderer.isWebGPURenderer===true,candidate:report.capabilities.webgpuCandidate,viewportMatched};
  });
  expect(state.requested).toBe('webgpu');
  expect(state.ready).toBe(true);
  expect(state.editorActive).toBe(true);
  expect(state.preview).toBe(false);
  expect(state.viewportMatched).toBe(true);
  if(state.candidate)expect(state.commonRenderer).toBe(true);
  expect(unexpectedFailures(failures)).toEqual([]);
});
