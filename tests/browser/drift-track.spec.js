'use strict';

const {test, expect} = require('@playwright/test');

async function seedWorkspace(page){
  await page.route(/\/models\/(?:car1|car2|cone)\.glb(?:\?.*)?$/, route => route.fulfill({status:404, body:''}));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
}

async function bootEditor(page){
  await seedWorkspace(page);
  await page.goto('/engine_editor.html?drift-track-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.THREE && window.LOT_KING && LOT_KING.core && LOT_KING.core.renderer);
  await page.waitForFunction(() => LOT_KING.state && LOT_KING.state.sceneReady === true, null, {timeout:30000});
  await page.waitForFunction(() => !!window.LK_RUNTIME_DRIFT_TRACK && !!window.LK_STORE && !!LK_STORE.createDriftTrack);
}

test('drift-track generator builds the identical Minami layout with colliders', async ({page}) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error' && /THREE\.|WebGL|GLSL/i.test(m.text())) errors.push('console: ' + m.text()); });
  await bootEditor(page);
  const result = await page.evaluate(() => {
    const gen = window.LK_RUNTIME_DRIFT_TRACK;
    const built = gen.build(window.THREE, gen.defaultParams());
    const wallCount = built.colliders.filter(c => c.kind === 'wall').length;
    const coneCount = built.colliders.filter(c => c.kind === 'cone').length;
    return {
      children: built.group.children.length,
      colliders: built.colliders.length,
      wallCount,
      coneCount,
      length: built.length,
      points: built.points.length,
      spawn: Array.isArray(built.spawn.position) && built.spawn.position.length === 3,
    };
  });
  expect(result.points).toBe(17);          // exact original layout
  expect(result.length).toBeGreaterThan(300);
  expect(result.children).toBeGreaterThan(5);
  expect(result.wallCount).toBeGreaterThan(50);
  expect(result.coneCount).toBeGreaterThan(0);
  expect(result.spawn).toBe(true);
  expect(errors).toEqual([]);   // r185 renders the ported geometry without THREE/WebGL errors
});

test('random layout differs from Minami and stays valid', async ({page}) => {
  await bootEditor(page);
  const result = await page.evaluate(() => {
    const gen = window.LK_RUNTIME_DRIFT_TRACK;
    const a = gen.generatePoints(1234);
    const b = gen.generatePoints(1234);
    const c = gen.generatePoints(9999);
    const built = gen.build(window.THREE, Object.assign(gen.defaultParams(), {points:a}));
    return {
      deterministic: JSON.stringify(a) === JSON.stringify(b),
      seedVaries: JSON.stringify(a) !== JSON.stringify(c),
      pts: a.length,
      colliders: built.colliders.length,
    };
  });
  expect(result.deterministic).toBe(true);
  expect(result.seedVaries).toBe(true);
  expect(result.pts).toBeGreaterThanOrEqual(4);
  expect(result.colliders).toBeGreaterThan(0);
});

test('registering a drift track pushes its wall colliders into the arcade world', async ({page}) => {
  await bootEditor(page);
  const result = await page.evaluate(() => {
    const before = LOT_KING.world.colliders.box.length;
    const params = window.LK_RUNTIME_DRIFT_TRACK.defaultParams();
    const obj = LK_STORE.createDriftTrack(params);
    LK_STORE.registerAdded(LOT_KING, obj, {
      id:'e2e-track', kind:'driftTrack', name:'E2E Track', collide:false, physics:false,
      props:obj.userData.driftTrackParams,
      t:{p:[0,0,0], r:[0,0,0], s:[1,1,1], v:true},
    });
    const after = LOT_KING.world.colliders.box.length;
    const specs = obj.userData.driftTrackColliderSpecs.length;

    // move the whole track and confirm colliders follow via syncCollider
    const root = obj.userData.collider.ref;
    const firstPart = root.parts[0];
    const beforeX = firstPart.x;
    obj.position.x += 25;
    LK_STORE.syncCollider(obj);
    const afterX = root.parts[0].x;

    // removing the track cleans the colliders up
    LOT_KING.world.unregister(obj);
    const cleaned = LOT_KING.world.colliders.box.length;

    return {added: after - before, specs, moved: Math.abs(afterX - beforeX) > 20, cleaned: cleaned - before};
  });
  expect(result.specs).toBeGreaterThan(0);
  expect(result.added).toBe(result.specs);
  expect(result.moved).toBe(true);
  expect(result.cleaned).toBe(0);
});

test('drift track survives a snapshot/rebuild round-trip', async ({page}) => {
  await bootEditor(page);
  const result = await page.evaluate(() => {
    const params = window.LK_RUNTIME_DRIFT_TRACK.defaultParams();
    params.halfW = 6.25;
    params.treeSeed = 4242;
    const obj = LK_STORE.createDriftTrack(params);
    LK_STORE.registerAdded(LOT_KING, obj, {
      id:'e2e-track-2', kind:'driftTrack', name:'Round Trip', collide:false, physics:false,
      props:obj.userData.driftTrackParams,
      t:{p:[0,0,0], r:[0,0,0], s:[1,1,1], v:true},
    });
    const snap = LK_STORE.snapshotAddedEntry(obj, obj.userData.addedEntry);
    // rebuild from the serialized entry (as a level reload would)
    const rebuilt = LK_STORE.createDriftTrack(snap.props);
    return {
      kind: snap.kind,
      collide: snap.collide,
      points: snap.props.points.length,
      halfW: snap.props.halfW,
      seed: snap.props.treeSeed,
      rebuiltChildren: rebuilt.children.length,
      rebuiltSpecs: rebuilt.userData.driftTrackColliderSpecs.length,
    };
  });
  expect(result.kind).toBe('driftTrack');
  expect(result.collide).toBe(false);
  expect(result.points).toBe(17);
  expect(result.halfW).toBeCloseTo(6.25, 2);
  expect(result.seed).toBe(4242);
  expect(result.rebuiltChildren).toBeGreaterThan(5);
  expect(result.rebuiltSpecs).toBeGreaterThan(0);
});

test('the "drift-track-minami" level template ships the track and a spawn on it', async ({page}) => {
  await bootEditor(page);
  const result = await page.evaluate(() => {
    const scene = LK_STORE.levels.templateScene(LOT_KING, 'drift-track-minami');
    const track = (scene.added || []).find(e => e.kind === 'driftTrack');
    const ground = (scene.added || []).find(e => e.prim === 'plane');
    return {
      hasTrack: !!track,
      trackPoints: track && track.props && track.props.points ? track.props.points.length : 0,
      drivableGround: !!(ground && ground.driveSurface),
      spawn: scene.player && scene.player.spawn ? {x: scene.player.spawn.x, z: scene.player.spawn.z} : null,
    };
  });
  expect(result.hasTrack).toBe(true);
  expect(result.trackPoints).toBe(17);
  expect(result.drivableGround).toBe(true);
  expect(result.spawn).not.toBeNull();
  expect(Math.abs(result.spawn.x) + Math.abs(result.spawn.z)).toBeGreaterThan(0);
});
