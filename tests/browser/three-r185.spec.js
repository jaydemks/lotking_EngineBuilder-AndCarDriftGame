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
    !/__lotking\/project-state/.test(message)
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
      addons:['GLTFLoader','FBXLoader','TGALoader','GLTFExporter','SkeletonUtils','OrbitControls','TransformControls','EffectComposer','OutputPass','SSRPass','BokehPass','OutlineEffect','FontLoader','TextGeometry','RectAreaLightUniformsLib'].every(key => !!THREE[key]),
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
    bundle:{version:'0.185.1', revision:'185', format:'iife-compat-v1'},
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
