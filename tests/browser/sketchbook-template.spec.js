'use strict';

const {test, expect} = require('@playwright/test');

test('Sketchbook Open World and Pawn pack boot in the browser without replacing player_car', async ({page}) => {
  // The 26 MB world plus four vehicle GLBs, then a Play transition.
  test.setTimeout(420000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?sketchbook-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(
    window.LK_STORE && window.LK_STORE.levels &&
    window.LK_LOGIC_TEMPLATES_SKETCHBOOK &&
    window.LK_RUNTIME_SKETCHBOOK_PAWNS &&
    window.LK_RUNTIME_SKETCHBOOK_OPEN_WORLD_LEVEL_TEMPLATE &&
    window.LOT_KING && LOT_KING.systems && LOT_KING.systems.sketchbookPawns
  ));
  await page.evaluate(async () => {
    await Promise.resolve(LK_STORE.ready);
    const scene = LK_STORE.levels.templateScene(LOT_KING, 'open-world-sketchbook');
    window.__lkTemplateScene = scene;
    await LK_STORE.apply(LOT_KING, scene, {strict:true});
    const owners = LOT_KING.world.registry.filter(o => o && o.userData && o.userData.editorType === 'logicElement');
    await Promise.all(owners.map(o => Promise.resolve(o.userData.logicElementAssetReady).catch(() => null)));
  });
  // A Logic Element builds its Pawn, and the Sketchbook coordinator materializes
  // the world's collision metadata, only once the game is running. Reading
  // hydration out of the editor boot measured an empty physics world.
  await page.evaluate(() => document.getElementById('lkPlay').click());
  await page.waitForFunction(() => {
    const button = document.getElementById('lkPlay');
    return !!(LOT_KING.state.started && LOT_KING.state.editorPreview && button && /STOP/.test(button.textContent || ''));
  }, null, {timeout:180000});
  await page.waitForTimeout(2500);

  const result = await page.evaluate(async () => {
    const scene = window.__lkTemplateScene;
    const coordinator = LOT_KING.systems.sketchbookPawns.coordinator;
    const extras = coordinator.refreshWorldPhysicsExtras(true);
    const templates = ['advanced-character','car','airplane','helicopter'].map(type => LK_LOGIC_TEMPLATES.get('logic-template-sketchbook-' + type));
    const playerCar = LK_LOGIC_TEMPLATES.get('logic-template-player-car');
    const assets = Object.values(LK_LOGIC_TEMPLATES_SKETCHBOOK.ASSETS);
    const visibilityProbeUrl = 'data:application/json;base64,' + btoa(JSON.stringify({
      asset:{version:'2.0'},
      scene:0,
      scenes:[{nodes:[0,1]}],
      nodes:[
        {name:'Physics Probe',extras:{data:'physics',type:'box'}},
        {name:'Visible Probe'},
      ],
    }));
    const metadataProbe = await LK_STORE.loadGlb(visibilityProbeUrl, 1, {hidePhysicsMetadata:true});
    const ordinaryProbe = await LK_STORE.loadGlb(visibilityProbeUrl, 1);
    const probeVisibility = root => {
      let tagged = 0, visible = 0;
      root.traverse(node => {
        if(String(node && node.userData && node.userData.data || '').toLowerCase() !== 'physics') return;
        tagged++;
        if(node.visible !== false) visible++;
      });
      return {tagged, visible};
    };
    // The DollBody Pawns only. The district ring around the world contributes
    // its own Logic Elements, and they are not vehicles to hydrate.
    const pawnIds = scene.added.filter(entry => entry.kind === 'logicElement' && entry.graph && entry.graph.sketchbookPawn).map(entry => entry.id);
    const pawnOwners = pawnIds.map(id => LOT_KING.world.registry.find(object => object && object.userData && object.userData.editorId === id));
    await Promise.all(pawnOwners.map(owner => Promise.resolve(owner && owner.userData && owner.userData.logicElementAssetReady)));
    const pawns = pawnIds.map(id => LOT_KING.pawns.get(id));
    await Promise.all(pawns.map(pawn => pawn && pawn.prepareRuntime ? Promise.resolve(pawn.prepareRuntime()) : null));
    const hydratedHierarchies = pawnOwners.map(owner => {
      let assetRoots = 0, placeholders = 0, visibleMeshes = 0, collisionHelpers = 0, visibleCollisionHelpers = 0;
      const hierarchyVisible = node => { for(let current=node; current; current=current.parent) if(current.visible === false) return false; return true; };
      if(owner) owner.traverse(node => {
        const data = node && node.userData || {};
        if(data.logicElementAssetPlaceholder) placeholders++;
        if(data.logicElementAssetVisual && !(node.parent && node.parent.userData && node.parent.userData.logicElementAssetVisual)) assetRoots++;
        if(node.isMesh && data.logicElementAssetVisual && hierarchyVisible(node)) visibleMeshes++;
        if(String(data.data || data.kind || '').toLowerCase() === 'collision'){
          collisionHelpers++;
          if(hierarchyVisible(node)) visibleCollisionHelpers++;
        }
      });
      return {assetRoots, placeholders, visibleMeshes, collisionHelpers, visibleCollisionHelpers, ownerVisible:!!(owner && owner.visible)};
    });
    const runtimeParts = pawns.map(pawn => pawn ? {
      wheels:pawn.parts.wheels.length,
      seats:pawn.parts.seats.length,
      rotors:pawn.parts.rotors.length,
      colliders:pawn.parts.colliders.length,
      hydration:pawn.assetHydrationState,
    } : null);
    const runtimePhysicsFrames = pawns.map(pawn => {
      if(!pawn || !pawn.body || !pawn.owner) return null;
      const ownerPosition = pawn.owner.getWorldPosition(new THREE.Vector3());
      return {
        originY:pawn.physicsOriginY,
        bodyOwnerDeltaY:Number((pawn.body.position.y-ownerPosition.y).toFixed(6)),
        wheelRadii:pawn.vehicle ? pawn.vehicle.wheelInfos.map(wheel => wheel.radius) : [],
      };
    });
    const worldEntries = scene.added.filter(entry => entry.src === 'models/sketchbook/world.glb');
    const worldObjects = LOT_KING.world.registry.filter(object => object && object.userData && object.userData.addedEntry && object.userData.addedEntry.src === 'models/sketchbook/world.glb');
    let physicsMetadataMeshes = 0;
    let visiblePhysicsMetadataMeshes = 0;
    if(worldObjects[0]) worldObjects[0].traverse(node => {
      const data = node && node.userData || {};
      if(String(data.data || data.kind || '').toLowerCase() !== 'physics' && !data.sketchbookPhysics) return;
      physicsMetadataMeshes++;
      if(node.visible !== false) visiblePhysicsMetadataMeshes++;
    });
    const physicsExtraSources = extras.size;
    const physicsExtraBodies = Array.from(extras.values()).reduce((count, record) => count + record.physics.bodies.length, 0);
    const metadataStats = LOT_KING.systems.sketchbookPawns.metadata.stats();
    return {
      templateId:scene.template.id,
      nativePlayerEnabled:scene.player.enabled,
      logicPawnCount:scene.added.filter(entry => entry.kind === 'logicElement' && entry.graph && entry.graph.sketchbookPawn).length,
      districtControllerCount:scene.added.filter(entry => entry.kind === 'logicElement' && entry.asset && String(entry.asset.key || '').indexOf('logic:open-world-district:') === 0).length,
      alwaysSpawns:scene.sketchbook.materializedScenario.alwaysSpawnNodes,
      templateKinds:templates.map(template => template.graph.sketchbookPawn.kind),
      seatCapabilities:templates.map(template => template.graph.sketchbookPawn.runtimeCapabilities),
      assetPaths:assets.map(asset => asset.src).sort(),
      metadataProbe:probeVisibility(metadataProbe),
      ordinaryProbe:probeVisibility(ordinaryProbe),
      metadataLifecycle:!!LOT_KING.world.__lkSketchbookMetadataLifecycle,
      worldEntryCount:worldEntries.length,
      worldObjectCount:worldObjects.length,
      physicsMetadataMeshes,
      visiblePhysicsMetadataMeshes,
      physicsExtraSources,
      physicsExtraBodies,
      metadataStats,
      hydratedPawnCount:pawns.filter(pawn => pawn && pawn.physicsReady && pawn.body).length,
      hydratedPawnTypes:pawns.map(pawn => pawn && pawn.type),
      hydratedHierarchies,
      runtimeParts,
      runtimePhysicsFrames,
      nativePlayerCarStillPresent:!!(playerCar && playerCar.graph && playerCar.graph.vehiclePawn),
    };
  });
  expect(result.templateId).toBe('sketchbook-open-world');
  expect(result.nativePlayerEnabled).toBe(false);
  // The DollBody Pawns at their source spawn nodes. The district ring adds its
  // own controller Logic Elements around them, which are counted separately so
  // this stays an assertion about the Pawns.
  expect(result.logicPawnCount).toBe(7);
  expect(result.districtControllerCount).toBe(8);
  expect(result.alwaysSpawns).toEqual(['Spawn.010','Spawn.011','Spawn.025','Spawn.026','Spawn.028','Spawn.029']);
  expect(result.templateKinds).toEqual(['advanced-character','car','airplane','helicopter']);
  expect(result.seatCapabilities.every(capability => capability.driverEntryExit && capability.passengerEntry && capability.seatSwitching && capability.doorAnimation)).toBe(true);
  expect(result.assetPaths).toEqual([
    'models/sketchbook/airplane.glb',
    'models/sketchbook/boxman.glb',
    'models/sketchbook/car.glb',
    'models/sketchbook/heli.glb',
    'models/sketchbook/world.glb',
  ]);
  expect(result.metadataProbe).toEqual({tagged:1, visible:0});
  expect(result.ordinaryProbe).toEqual({tagged:1, visible:1});
  expect(result.metadataLifecycle).toBe(true);
  expect(result.worldEntryCount).toBe(1);
  expect(result.worldObjectCount).toBe(1);
  expect(result.physicsMetadataMeshes).toBe(427);
  expect(result.visiblePhysicsMetadataMeshes).toBe(0);
  expect(result.physicsExtraSources).toBe(1);
  expect(result.physicsExtraBodies).toBe(427);
  expect(result.metadataStats).toEqual({sources:1, paths:3, scenarios:8, spawns:29});
  expect(result.hydratedPawnCount).toBe(7);
  expect(result.hydratedPawnTypes).toEqual(['advanced-character','car','car','airplane','airplane','helicopter','helicopter']);
  expect(result.hydratedHierarchies.every(item => item.assetRoots === 1 && item.placeholders === 0 && item.visibleMeshes > 0 && item.ownerVisible)).toBe(true);
  expect(result.hydratedHierarchies.map(item => item.collisionHelpers)).toEqual([0,14,14,12,12,12,12]);
  expect(result.hydratedHierarchies.every(item => item.visibleCollisionHelpers === 0)).toBe(true);
  expect(result.runtimeParts).toEqual([
    {wheels:0,seats:0,rotors:0,colliders:0,hydration:'ready'},
    {wheels:4,seats:4,rotors:0,colliders:14,hydration:'ready'},
    {wheels:4,seats:4,rotors:0,colliders:14,hydration:'ready'},
    {wheels:3,seats:1,rotors:1,colliders:12,hydration:'ready'},
    {wheels:3,seats:1,rotors:1,colliders:12,hydration:'ready'},
    {wheels:0,seats:2,rotors:2,colliders:12,hydration:'ready'},
    {wheels:0,seats:2,rotors:2,colliders:12,hydration:'ready'},
  ]);
  expect(result.runtimePhysicsFrames).toEqual([
    {originY:.5,bodyOwnerDeltaY:.5,wheelRadii:[]},
    {originY:0,bodyOwnerDeltaY:0,wheelRadii:[.25,.25,.25,.25]},
    {originY:0,bodyOwnerDeltaY:0,wheelRadii:[.25,.25,.25,.25]},
    {originY:0,bodyOwnerDeltaY:0,wheelRadii:[.12,.12,.12]},
    {originY:0,bodyOwnerDeltaY:0,wheelRadii:[.12,.12,.12]},
    {originY:0,bodyOwnerDeltaY:0,wheelRadii:[]},
    {originY:0,bodyOwnerDeltaY:0,wheelRadii:[]},
  ]);
  expect(result.nativePlayerCarStillPresent).toBe(true);
  expect(pageErrors).toEqual([]);
});
