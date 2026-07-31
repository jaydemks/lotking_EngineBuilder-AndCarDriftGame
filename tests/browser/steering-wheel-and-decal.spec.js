'use strict';

const {test, expect} = require('@playwright/test');

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?steering-decal-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.LOT_KING && window.LK_STORE && window.LK_RUNTIME_MODEL_ASSETS, null, {timeout:60000});
  await page.evaluate(() => {
    document.querySelector('#lkWorkspaceClose')?.click();
    document.querySelector('#lkProjectsClose')?.click();
  });
});

test('Surface Layer reuses receiver PBR maps and compiles its base-map shader', async ({page}) => {
  const result = await page.evaluate(() => {
    const THREE = window.THREE;
    const game = window.LOT_KING;
    const byteTexture = rgba => {
      const texture = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
      texture.needsUpdate = true;
      return texture;
    };
    const baseMap = byteTexture([72, 74, 78, 255]);
    const normalMap = byteTexture([128, 128, 255, 255]);
    const roughnessMap = byteTexture([220, 220, 220, 255]);
    const receiverMaterial = new THREE.MeshStandardMaterial({
      color:0xffffff,
      map:baseMap,
      normalMap,
      roughnessMap,
      roughness:.83,
      metalness:.05,
    });
    const receiver = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), receiverMaterial);
    receiver.name = 'E2E Asphalt Receiver';
    receiver.rotation.x = -Math.PI / 2;
    receiver.position.y = 10;
    receiver.userData.editorId = 'e2e-asphalt';
    receiver.userData.editorName = receiver.name;
    game.core.scene.add(receiver);
    game.world.register(receiver, receiver.name, 'mesh');

    const decal = LK_STORE.createTexture('decal', {
      blending:'surface',
      materialModel:'lit',
      width:2,
      height:2,
      depthBias:.012,
      surfaceBaseInfluence:.22,
    });
    decal.position.y = 10.025;
    decal.rotation.x = -Math.PI / 2;
    game.core.scene.add(decal);
    game.world.register(decal, 'E2E Surface Layer', 'texture');
    decal.updateMatrixWorld(true);
    receiver.updateMatrixWorld(true);

    const matched = LK_STORE.matchTextureSurface(decal, true);
    const material = decal.children.find(child => child.isMesh).material;
    game.core.renderer.compile(game.core.scene, game.core.camera);
    const shader = material.userData.lkSurfaceMaps && material.userData.lkSurfaceMaps.shader;
    const output = {
      matched,
      receiver:decal.userData.textureProps.surfaceReceiverName,
      normalMap:material.normalMap === normalMap,
      roughnessMap:material.roughnessMap === roughnessMap,
      baseMap:material.userData.lkSurfaceMaps.baseMap === baseMap,
      shader:!!shader && shader.fragmentShader.includes('lkSurfaceBaseMap'),
    };

    game.world.unregister(decal);
    game.world.unregister(receiver);
    game.core.scene.remove(decal);
    game.core.scene.remove(receiver);
    return output;
  });

  expect(result).toEqual({
    matched:true,
    receiver:'E2E Asphalt Receiver',
    normalMap:true,
    roughnessMap:true,
    baseMap:true,
    shader:true,
  });
});

test('steering-wheel pivot consumes GLB metadata and normalized left/right input', async ({page}) => {
  const result = await page.evaluate(() => {
    const THREE = window.THREE;
    const car = new THREE.Group();
    const model = new THREE.Group();
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.5, .08, .5), new THREE.MeshBasicMaterial());
    pivot.name = 'steering_wheel_pivot';
    pivot.position.set(-.42, 1.12, .45);
    mesh.name = 'steering_wheel_mesh';
    pivot.userData.lkSteeringAxis = 'z';
    pivot.userData.lkSteeringDirection = -1;
    pivot.userData.lkSteeringLockDegrees = 1080;
    pivot.userData.lkSteeringVisualDegrees = 540;
    pivot.add(mesh);
    model.add(pivot);
    car.add(model);
    car.updateMatrixWorld(true);
    const assets = LK_RUNTIME_MODEL_ASSETS.create({THREERef:THREE, car, isFileMode:false});
    assets.rig.build(model);
    const pivotBefore = pivot.quaternion.clone();
    const meshBefore = mesh.quaternion.clone();
    const pivotPositionBefore = pivot.position.clone();
    const meshWorldBefore = mesh.getWorldPosition(new THREE.Vector3());
    assets.rig.drive(0, 1, 0, 1);
    car.updateMatrixWorld(true);
    const meshWorldAfter = mesh.getWorldPosition(new THREE.Vector3());
    const status = assets.rig.steeringStatus();
    return {
      ready:status.ready,
      pivot:status.pivot,
      rotationTarget:status.rotationTarget,
      rotationSpace:status.rotationSpace,
      axis:status.axis,
      direction:status.direction,
      input:status.inputLockDegrees,
      visual:status.visualLockDegrees,
      pivotChanged:pivotBefore.angleTo(pivot.quaternion) > .1,
      meshChanged:meshBefore.angleTo(mesh.quaternion) > .1,
      pivotPositionStable:pivot.position.distanceTo(pivotPositionBefore) < 1e-8,
      meshCenterStable:meshWorldAfter.distanceTo(meshWorldBefore) < 1e-8,
    };
  });

  expect(result).toEqual({
    ready:true,
    pivot:'steering_wheel_pivot',
    rotationTarget:'steering_wheel_mesh',
    rotationSpace:'mesh-local',
    axis:'z',
    direction:-1,
    input:1080,
    visual:540,
    pivotChanged:false,
    meshChanged:true,
    pivotPositionStable:true,
    meshCenterStable:true,
  });
});
