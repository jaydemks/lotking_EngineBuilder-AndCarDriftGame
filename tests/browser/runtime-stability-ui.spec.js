const {test, expect} = require('@playwright/test');

test('vehicle radar and UV Lab runtime contracts are live', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));
  await page.goto('/test-editor.html?runtime-stability-ui=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && window.LK_STORE &&
    LOT_KING.ui && LOT_KING.ui.vehicleRadar && window.LK_EDITOR_UV_EDITOR);

  const result = await page.evaluate(() => {
    const defaultRadarConfig = Object.assign({}, LOT_KING.ui.vehicleRadar);
    LOT_KING.ui.setVehicleRadar({enabled:true, left:2.2, top:18, size:176, layoutVersion:null});
    const migratedRadarConfig = Object.assign({}, LOT_KING.ui.vehicleRadar);
    LOT_KING.ui.setVehicleRadar({enabled:true, left:7, top:21, size:188, range:110, refreshHz:12});
    LOT_KING.ui.previewVehicleRadar(true);
    const canvas = document.querySelector('.lk-vehicle-radar');

    const root = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    root.add(mesh);
    LK_STORE.assignMeshEditIds(root);
    const id = mesh.userData.lkMeshEditId;
    LK_STORE.applyMeshEdits(root, {uvMappings:{[id]:{mode:'smart', padding:.02}}});
    const smart = {
      index:!!mesh.geometry.index,
      uvCount:mesh.geometry.attributes.uv && mesh.geometry.attributes.uv.count,
      positionCount:mesh.geometry.attributes.position.count,
      mode:mesh.userData.lkUvMapping && mesh.userData.lkUvMapping.mode,
    };
    LK_STORE.applyMeshEdits(root, {uvMappings:{}});
    const restored = {
      index:!!mesh.geometry.index,
      uvCount:mesh.geometry.attributes.uv && mesh.geometry.attributes.uv.count,
    };
    const projectRadar = LK_RUNTIME_VEHICLE_RADAR.projectRadarOffset;
    const rolledVehicleQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(.24, 1.07, -.31, 'XYZ'));
    const rolledForward = new THREE.Vector3(0, 0, 1).applyQuaternion(rolledVehicleQuaternion);
    const migratedCamera = LK_RUNTIME_PLAYER_CAMERA.migrateConfig({
      interiorCameraVersion:2,
      interiorLateral:-.42,
      interiorGForceMotion:.18,
      interiorAccelerationMotion:0,
      interiorRoadShake:.08,
    });
    return {
      radar:!!canvas,
      preview:!!(canvas && canvas.classList.contains('on')),
      defaultRadarConfig,
      migratedRadarConfig,
      radarConfig:Object.assign({}, LOT_KING.ui.vehicleRadar),
      radarProjection:{
        forward:projectRadar(0, 5, 0),
        right:projectRadar(-4, 0, 0),
        turnedForward:projectRadar(5, 0, Math.PI / 2),
        turnedRight:projectRadar(0, 4, Math.PI / 2),
        mapAfterLeftSteer:projectRadar(0, 5, Math.PI / 4),
        mapAfterRightSteer:projectRadar(0, 5, -Math.PI / 4),
      },
      radarQuaternionHeading:{
        actual:LK_RUNTIME_VEHICLE_RADAR.headingFromQuaternion(rolledVehicleQuaternion),
        expected:Math.atan2(rolledForward.x, rolledForward.z),
      },
      migratedCamera,
      smart,
      restored,
    };
  });

  expect(result.radar).toBe(true);
  expect(result.preview).toBe(true);
  expect(result.defaultRadarConfig).toMatchObject({layoutVersion:2, left:0, top:0});
  expect(result.migratedRadarConfig).toMatchObject({layoutVersion:2, left:0, top:0});
  expect(result.radarConfig).toMatchObject({left:7, top:21, size:188, range:110, refreshHz:12});
  expect(result.radarProjection.forward).toEqual({x:0, y:-5});
  expect(result.radarProjection.right).toEqual({x:4, y:0});
  expect(result.radarProjection.turnedForward.x).toBeCloseTo(0, 10);
  expect(result.radarProjection.turnedForward.y).toBeCloseTo(-5, 10);
  expect(result.radarProjection.turnedRight.x).toBeCloseTo(4, 10);
  expect(result.radarProjection.turnedRight.y).toBeCloseTo(0, 10);
  expect(result.radarProjection.mapAfterLeftSteer.x).toBeGreaterThan(0);
  expect(result.radarProjection.mapAfterRightSteer.x).toBeLessThan(0);
  expect(result.radarQuaternionHeading.actual).toBeCloseTo(result.radarQuaternionHeading.expected, 10);
  expect(result.migratedCamera).toMatchObject({
    interiorCameraVersion:3,
    interiorGForceMotion:0,
    interiorAccelerationMotion:0,
    interiorRoadShake:0,
    interiorMotionLimit:.035,
  });
  expect(result.smart.mode).toBe('smart');
  expect(result.smart.index).toBe(false);
  expect(result.smart.uvCount).toBe(result.smart.positionCount);
  expect(result.restored.index).toBe(true);
  expect(result.restored.uvCount).toBeGreaterThan(0);
  expect(pageErrors).toEqual([]);
});

test('interior camera remains welded to its dummy and camera selection controls its preview', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error && error.message || error)));
  await page.goto('/test-editor.html?cockpit-rigid-camera=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && LOT_KING.editor &&
    LOT_KING.editor.state.active === true && LOT_KING.player && LOT_KING.player.cameraDummies &&
    LOT_KING.player.cameraDummies.interior);
  await page.evaluate(() => document.querySelector('#lkProjectsClose')?.click());
  await expect(page.locator('#lkProjectsOverlay')).not.toHaveClass(/open/);

  const transformError = await page.evaluate(async () => {
    const player = LOT_KING.player;
    const car = player.car;
    const dummy = player.cameraDummies.interior;
    const camera = LOT_KING.core.camera;
    player.setCameraConfig({
      mode:'interior',
      interiorLateral:-.61,
      interiorHeight:1.27,
      interiorForward:.46,
      interiorRotation:[-.035,.11,.018],
      interiorGForceMotion:0,
      interiorAccelerationMotion:0,
      interiorRoadShake:0,
    }, true);
    let maxPositionError = 0;
    let maxRotationError = 0;
    for(const angle of [0, Math.PI * .75, Math.PI * 1.75, Math.PI * 3.5, -Math.PI * 2.5, Math.PI * 6.25]){
      player.setVisibleHeading(angle);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      car.updateMatrixWorld(true);
      dummy.updateWorldMatrix(true, false);
      const expectedPosition = dummy.getWorldPosition(new THREE.Vector3());
      const expectedQuaternion = dummy.getWorldQuaternion(new THREE.Quaternion());
      maxPositionError = Math.max(maxPositionError, camera.position.distanceTo(expectedPosition));
      maxRotationError = Math.max(maxRotationError, camera.quaternion.angleTo(expectedQuaternion));
    }
    // The selected dummy preview must remain available even when gameplay is
    // switched back to another camera mode.
    player.setCameraConfig({mode:'free'}, true);
    return {maxPositionError, maxRotationError};
  });
  expect(transformError.maxPositionError).toBeLessThan(1e-5);
  expect(transformError.maxRotationError).toBeLessThan(1e-5);

  const interiorRow = page.locator('#lkOutliner .lk-item[data-id="player_camera_interior"]');
  await expect(interiorRow).toHaveCount(1);
  await interiorRow.evaluate(node => node.click());
  await expect(page.locator('#lkPipFrame')).toHaveClass(/on/);
  await expect(page.locator('#lkPipFrame .lk-pip-title')).toContainText('INTERIOR PLAYER CAMERA · PREVIEW');
  await expect(page.locator('#lkPipMinimize')).toBeVisible();
  await expect(page.locator('#lkPipClose')).toBeVisible();
  await page.locator('#lkPipMinimize').click();
  await expect(page.locator('#lkPipFrame')).toHaveClass(/minimized/);
  await page.locator('#lkPipMinimize').click();
  await expect(page.locator('#lkPipFrame')).not.toHaveClass(/minimized/);
  await page.locator('#lkPipClose').click();
  await expect(page.locator('#lkPipFrame')).not.toHaveClass(/on/);
  await interiorRow.evaluate(node => node.click());
  await expect(page.locator('#lkPipFrame')).toHaveClass(/on/);
  expect(pageErrors).toEqual([]);
});

test('game pre-benchmark visits spatially separated sectors and restores camera', async ({page}) => {
  await page.goto('/test-editor.html?runtime-map-warmup=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.THREE && window.LOT_KING);
  if(!await page.evaluate(() => !!window.LK_RUNTIME_PRE_BENCHMARK)){
    await page.addScriptTag({url:'/js/runtime/pre-benchmark.js?v=e2e'});
  }
  const report = await page.evaluate(async () => {
    const renderer = new THREE.WebGLRenderer({antialias:false});
    renderer.setSize(96, 64, false);
    const scene = new THREE.Scene();
    for(let index = 0; index < 6; index++){
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshStandardMaterial({color:0x5cb8df})
      );
      mesh.position.set(index * 42, 1, (index % 2) * 38);
      scene.add(mesh);
    }
    scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1));
    const camera = new THREE.PerspectiveCamera(60, 1.5, .1, 600);
    camera.position.set(3, 5, 11);
    camera.lookAt(0, 0, 0);
    const before = camera.position.clone();
    let hooks = 0;
    const benchmark = LK_RUNTIME_PRE_BENCHMARK.create({
      renderer, scene, camera,
      runHooks:() => {
        hooks++;
        const texture = new THREE.DataTexture(new Uint8Array([255, 180, 90, 255]), 1, 1);
        texture.needsUpdate = true;
        const runtimeMesh = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({map:texture})
        );
        runtimeMesh.position.set(260, 1, 40);
        runtimeMesh.visible = false;
        runtimeMesh.userData.runtimeWarmupFixture = true;
        scene.add(runtimeMesh);
      },
      render:() => renderer.render(scene, camera),
    });
    const result = await benchmark.run({mode:'game', adaptive:false, reason:'e2e'});
    const restored = camera.position.distanceTo(before) < 1e-6;
    scene.traverse(node => {
      if(node.geometry) node.geometry.dispose();
      if(node.material) node.material.dispose();
    });
    renderer.dispose();
    return Object.assign({}, result, {restored, hooks});
  });
  expect(report.strategicStops).toBeGreaterThan(1);
  expect(report.cameraViews).toBe(report.softwareRenderer ? 0 : 5);
  expect(report.restored).toBe(true);
  expect(report.hooks).toBe(1);
  expect(report.textures).toBeGreaterThanOrEqual(1);
  expect(report.nodes).toBeGreaterThan(8);
  expect(report.hiddenResources).toBeGreaterThanOrEqual(1);
});
