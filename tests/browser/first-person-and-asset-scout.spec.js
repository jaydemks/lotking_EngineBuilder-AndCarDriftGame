'use strict';

// End-to-end checks for the v0.7.5 first-person additions and for Asset Scout's
// v0.7.7 compliance shutdown. The dormant provider layer remains covered by
// offline fixtures in tests/asset-scout.test.js; no live catalogue is contacted.

const {test, expect} = require('@playwright/test');

async function openEditorPage(page, marker){
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?' + marker + '=1', {waitUntil:'domcontentloaded'});
}

test('first-person modules, templates and level load in the browser runtime', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openEditorPage(page, 'first-person-e2e');
  await page.waitForFunction(() => !!(window.LK_LOGIC_TEMPLATES && window.LK_LOGIC_TEMPLATES.get('logic-template-player-first-person')));

  const result = await page.evaluate(() => {
    const registry = window.LK_LOGIC_NODES_MVP.createRegistry();
    const player = window.LK_LOGIC_TEMPLATES.get('logic-template-player-first-person');
    const target = window.LK_LOGIC_TEMPLATES.get('logic-template-shooting-target');
    const normal = window.LK_LOGIC_TEMPLATES.get('logic-template-player-character-normal');
    const level = window.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene({version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}});
    const logic = level.added.filter(entry => entry.kind === 'logicElement');
    return {
      threeRevision:window.THREE && THREE.REVISION,
      hasRuntime:!!window.LK_RUNTIME_FIRST_PERSON,
      hasHud:!!window.LK_RUNTIME_FPS_HUD,
      hasFireNode:!!registry.get('firstPerson.fire'),
      hasTargetDownEvent:!!registry.get('event.onTargetDown'),
      playerValid:window.LK_LOGIC_VALIDATOR.validateGraph(player.graph, registry).ok,
      targetValid:window.LK_LOGIC_VALIDATOR.validateGraph(target.graph, registry).ok,
      rigEnabled:player.graph.characterPawn.firstPerson.enabled,
      weaponPreset:player.graph.characterPawn.firstPerson.weapon.preset,
      // The generic third-person character must be unaffected by the addition.
      normalHasRig:!!normal.graph.characterPawn.firstPerson,
      normalInputMode:normal.graph.characterPawn.movement.inputMode,
      levelId:level.template.id,
      targetCount:logic.filter(entry => entry.asset.key === 'logic:template:logic-template-shooting-target').length,
      playerCount:logic.filter(entry => entry.graph && entry.graph.characterPawn && entry.graph.characterPawn.firstPerson).length,
      hasOverwatch:level.added.some(entry => entry.name === 'Overwatch Platform'),
    };
  });

  expect(result).toEqual({
    threeRevision:'185',
    hasRuntime:true,
    hasHud:true,
    hasFireNode:true,
    hasTargetDownEvent:true,
    playerValid:true,
    targetValid:true,
    rigEnabled:true,
    weaponPreset:'rifle',
    normalHasRig:false,
    normalInputMode:'camera',
    levelId:'fps-shooter-test',
    targetCount:12,
    playerCount:1,
    hasOverwatch:true,
  });
  expect(pageErrors).toEqual([]);
});

test('the first-person rig produces a usable eye transform with real Three.js', async ({page}) => {
  await openEditorPage(page, 'first-person-camera-e2e');
  await page.waitForFunction(() => !!window.LK_RUNTIME_FIRST_PERSON);

  const result = await page.evaluate(() => {
    const owner = new THREE.Object3D();
    owner.position.set(3, 0, -5);
    const pawn = {
      id:'e2e', possessed:true, enabled:true, hidden:false, owner,
      state:{speed:0, airborne:false},
      reset(){ return true; }, dispose(){ return true; },
    };
    const rig = window.LK_RUNTIME_FIRST_PERSON.create(null, pawn, {eyeHeight:1.7, viewBob:{enabled:false}});
    rig.setViewAngles(Math.PI / 2, 0);
    rig.preMovement(.016, {});
    const transform = rig.cameraTransform();
    return {
      eyeY:Number(transform.position.y.toFixed(3)),
      eyeX:Number(transform.position.x.toFixed(3)),
      // Engine heading convention: a yaw of PI/2 faces +X.
      forwardX:Number(transform.forward.x.toFixed(2)),
      forwardY:Number(transform.forward.y.toFixed(2)),
      ownerYaw:Number(owner.rotation.y.toFixed(3)),
      fov:Number(transform.fov.toFixed(0)),
    };
  });

  expect(result.eyeY).toBe(1.7);
  expect(result.eyeX).toBe(3);
  expect(result.forwardX).toBeCloseTo(1, 1);
  expect(result.forwardY).toBeCloseTo(0, 1);
  expect(result.ownerYaw).toBeCloseTo(Math.PI / 2, 2);
  expect(result.fov).toBe(78);
});

test('the camera looks exactly where the character walks', async ({page}) => {
  await openEditorPage(page, 'first-person-alignment-e2e');
  await page.waitForFunction(() => !!(window.LK_RUNTIME_FIRST_PERSON && window.LK_RUNTIME_CHARACTER_MOVEMENT));

  // The regression this guards: a Three.js camera looks down its own -Z while
  // an engine heading of `yaw` faces +Z. Getting that half-turn wrong makes
  // every control read as inverted at once, which no unit test on the angles
  // alone can catch — it needs the real camera basis and the real movement
  // controller agreeing.
  const rows = await page.evaluate(() => {
    const owner = new THREE.Object3D();
    const pawn = {
      id:'align', possessed:true, enabled:true, hidden:false, owner,
      state:{speed:0, airborne:false}, reset(){ return true; }, dispose(){ return true; },
    };
    const rig = window.LK_RUNTIME_FIRST_PERSON.create(null, pawn, {viewBob:{enabled:false}});
    const movement = window.LK_RUNTIME_CHARACTER_MOVEMENT.create(null, {inputMode:'heading', facingMode:'heading', walkSpeed:4, acceleration:80});
    return [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7].map(yaw => {
      rig.setViewAngles(yaw, 0);
      rig.preMovement(.016, {});
      const view = rig.cameraTransform();
      const body = {rotation:{y:owner.rotation.y}, position:{x:0, y:0, z:0}};
      movement.reset();
      const step = movement.step(body, {x:0, z:1}, .25, 0);   // hold W
      const length = Math.hypot(step.velocityX, step.velocityZ) || 1;
      return {
        yaw,
        // 1 means the view direction and the walk direction are identical.
        dot:Number((view.forward.x * (step.velocityX / length) + view.forward.z * (step.velocityZ / length)).toFixed(3)),
      };
    });
  });

  rows.forEach(row => expect(row.dot, 'yaw ' + row.yaw + ' walks away from the view').toBeCloseTo(1, 2));
});

test('the FPS Shooter Test level is offered when creating a new level', async ({page}) => {
  await openEditorPage(page, 'fps-level-option-e2e');
  await page.waitForFunction(() => !!window.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE);
  const built = await page.evaluate(() => {
    const store = window.LK_STORE;
    if(!store || !store.levels || !store.levels.templateScene) return {available:false};
    const scene = store.levels.templateScene(window.LOT_KING, 'fps-shooter-test');
    return {
      available:true,
      templateId:scene.template && scene.template.id,
      hasTargets:scene.added.some(entry => entry.asset && entry.asset.key === 'logic:template:logic-template-shooting-target'),
    };
  });
  expect(built.available).toBe(true);
  expect(built.templateId).toBe('fps-shooter-test');
  expect(built.hasTargets).toBe(true);
});

test('the FPS Shooter Test environment instantiates as real scene objects', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openEditorPage(page, 'fps-scene-e2e');
  await page.waitForFunction(() => !!(window.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE && window.LK_STORE));

  // Building the descriptors is covered offline; this checks that Three.js
  // actually accepts every primitive, colour and light the dressing authors.
  const result = await page.evaluate(async () => {
    const scene = window.LK_RUNTIME_FPS_ARENA_LEVEL_TEMPLATE.buildScene({version:1,counter:0,transforms:{},props:{},deleted:[],added:[],env:{},player:{},ui:{},logic:{}});
    const primitives = scene.added.filter(entry => entry.kind === 'primitive');
    const lights = scene.added.filter(entry => entry.kind === 'light');
    const built = [];
    const failures = [];
    // One instance of every distinct primitive/colour combination is enough to
    // prove the whole set is constructible without building 600 meshes.
    const seen = new Set();
    primitives.forEach(entry => {
      const key = entry.prim + ':' + entry.props.color + ':' + (entry.props.materialModel || 'std');
      if(seen.has(key)) return;
      seen.add(key);
      try {
        const object = window.LK_STORE.createPrimitive(entry.prim, entry.props);
        if(object) built.push(key); else failures.push(key + ' -> null');
      } catch(error){ failures.push(key + ' -> ' + error.message); }
    });
    lights.forEach(entry => {
      try {
        const object = window.LK_STORE.createLight(entry.light, entry.props);
        if(!object) failures.push('light ' + entry.name + ' -> null');
      } catch(error){ failures.push('light ' + entry.name + ' -> ' + error.message); }
    });
    return {
      primitiveCount:primitives.length,
      distinctBuilt:built.length,
      lightCount:lights.length,
      failures,
      prims:Array.from(new Set(primitives.map(entry => entry.prim))).sort(),
    };
  });

  expect(result.failures).toEqual([]);
  expect(result.primitiveCount).toBeGreaterThan(400);
  expect(result.distinctBuilt).toBeGreaterThan(20);
  expect(result.lightCount).toBeGreaterThan(0);
  // Every primitive kind the dressing uses must be one the store really has.
  result.prims.forEach(prim => expect(['box', 'plane', 'cylinder', 'cone', 'torus', 'sphere', 'triangle']).toContain(prim));
  expect(pageErrors).toEqual([]);
});

test('Asset Scout is not loaded or exposed while live API compliance is unresolved', async ({page}) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await openEditorPage(page, 'asset-scout-e2e');
  await page.waitForFunction(() => !!(window.LOT_KING && window.LOT_KING.editor));
  const disabled = await page.evaluate(() => ({
    providers:typeof window.LK_EDITOR_ASSET_SCOUT_PROVIDERS,
    module:typeof window.LK_EDITOR_ASSET_SCOUT,
    instance:typeof window.LOT_KING.editor.assetScout,
    openApi:typeof window.LOT_KING.editor.openAssetScout,
    toggleApi:typeof window.LOT_KING.editor.toggleAssetScout,
    fab:!!document.getElementById('lkAssetScoutFab'),
    panel:!!document.getElementById('lkAssetScoutPanel'),
  }));
  expect(disabled).toEqual({
    providers:'undefined',
    module:'undefined',
    instance:'undefined',
    openApi:'undefined',
    toggleApi:'undefined',
    fab:false,
    panel:false,
  });
  expect(pageErrors).toEqual([]);
});
