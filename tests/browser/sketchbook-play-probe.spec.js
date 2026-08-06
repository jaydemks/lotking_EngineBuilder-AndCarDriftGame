'use strict';

const {test, expect} = require('@playwright/test');

test('probe: entering Play from the Sketchbook Open World template', async ({page}) => {
  test.setTimeout(420000);
  const pageErrors = [];
  const httpErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    if(message.type() !== 'error') return;
    // Chromium's generic message omits the URL. HTTP failures are recorded
    // below with their actual path so the optional local project-state probe
    // can be distinguished from a missing gameplay asset.
    if(message.text().includes('Failed to load resource: the server responded with a status of 404')) return;
    pageErrors.push('console:' + message.text());
  });
  page.on('response', response => {
    if(response.status() < 400) return;
    const url = response.url();
    if(/\/__lotking\/project-state(?:[?#]|$)/.test(url) && response.status() === 404) return;
    httpErrors.push(response.status() + ' ' + url);
  });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('lk.projectWorkspace.v1', JSON.stringify({mode:'browser', onlineEditor:true, workspaceReady:true}));
  });
  await page.goto('/engine_editor.html?sketchbook-e2e=1', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => !!(
    window.LK_STORE && window.LK_STORE.levels &&
    window.LK_RUNTIME_SKETCHBOOK_OPEN_WORLD_LEVEL_TEMPLATE &&
    window.LOT_KING && LOT_KING.systems && LOT_KING.systems.sketchbookPawns
  ));
  const result = await page.evaluate(async () => {
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    await Promise.resolve(LK_STORE.ready);
    const scene = LK_STORE.levels.templateScene(LOT_KING, 'open-world-sketchbook');
    await LK_STORE.apply(LOT_KING, scene, {strict:true});
    const pawnIds = scene.added.filter(entry => entry.kind === 'logicElement').map(entry => entry.id);
    const owners = () => LOT_KING.world.registry.filter(o => o && o.userData && o.userData.editorType === 'logicElement');
    await Promise.all(owners().map(o => Promise.resolve(o.userData.logicElementAssetReady).catch(() => null)));

    function snapshot(label){
      const list = LOT_KING.pawns.list();
      const sketchbook = list.filter(p => p && /^sketchbook-/.test(String(p.pawnType || '')));
      const byOwner = new Map();
      list.forEach(p => {
        if(!p || !p.owner) return;
        const key = p.owner.userData && p.owner.userData.editorId || p.owner.uuid;
        byOwner.set(key, (byOwner.get(key) || 0) + 1);
      });
      let assetRoots = 0, visibleAssetRoots = 0;
      const assetRootsByOwner = new Map();
      const hierarchyVisible = node => { for(let c = node; c; c = c.parent) if(c.visible === false) return false; return true; };
      LOT_KING.core.scene.traverse(node => {
        const d = node && node.userData || {};
        if(!d.logicElementAssetVisual) return;
        if(node.parent && node.parent.userData && node.parent.userData.logicElementAssetVisual) return;
        assetRoots++;
        if(hierarchyVisible(node)) visibleAssetRoots++;
        const ownerId=d.logicElementOwnerId || 'missing-owner';assetRootsByOwner.set(ownerId,(assetRootsByOwner.get(ownerId)||0)+1);
      });
      const physics = LOT_KING.systems.physics && LOT_KING.systems.physics.raw;
      const poseErrors=sketchbook.map(pawn => {
        if(!pawn.owner || !pawn.body) return {id:pawn.id,error:null};
        const ownerPosition=pawn.owner.getWorldPosition(new THREE.Vector3()),render=pawn.body.interpolatedPosition || pawn.body.position;
        const origin=pawn.type === 'advanced-character'
          ? Number(pawn.config.collision.height)*.5+Number(pawn.config.collision.radius)
          : Number(pawn.physicsOriginY)||0;
        const expected=new THREE.Vector3(render.x,pawn.type === 'advanced-character' && pawn.state.grounded ? pawn.body.position.y-origin : render.y-origin,render.z);
        return {id:pawn.id,error:ownerPosition.distanceTo(expected)};
      });
      return {
        label,
        pawnIds:list.map(p => p.id),
        pawnCount:list.length,
        ownerCounts:Array.from(byOwner.entries()),
        logicOwners:owners().length,
        logicOwnerIds:owners().map(o => o.userData.editorId),
        assetRoots,
        visibleAssetRoots,
        assetRootsByOwner:Array.from(assetRootsByOwner.entries()),
        sketchbookPawnCount:sketchbook.length,
        poseErrors,
        cannonBodies:physics && physics.world ? physics.world.bodies.length : null,
        nativeCarVisible:!!(LOT_KING.player && LOT_KING.player.car && LOT_KING.player.car.visible),
        nativeEnabled:LOT_KING.player && LOT_KING.player.enabled,
        possessedP1:(() => { const p = LOT_KING.pawns.getByPlayerId(1); return p ? p.id : null; })(),
        cameraP1:LOT_KING.state.runtimeVehicleCameraPawnIds && LOT_KING.state.runtimeVehicleCameraPawnIds[1] || null,
        started:LOT_KING.state.started,
        editorPreview:LOT_KING.state.editorPreview,
      };
    }

    const before = snapshot('before-play');
    return {pawnIds, before};
  });
  await page.evaluate(() => document.getElementById('lkPlay').click());
  await page.waitForFunction(() => {
    const button=document.getElementById('lkPlay');
    return !!(LOT_KING.state.started&&LOT_KING.state.editorPreview&&button&&/STOP/.test(button.textContent||''));
  },null,{timeout:120000});
  await page.waitForTimeout(2500);
  const after=await page.evaluate(() => {
    const list=LOT_KING.pawns.list(),sketchbook=list.filter(p=>p&&/^sketchbook-/.test(String(p.pawnType||''))),owners=()=>LOT_KING.world.registry.filter(o=>o&&o.userData&&o.userData.editorType==='logicElement');
    const byOwner=new Map();list.forEach(p=>{if(!p||!p.owner)return;const key=p.owner.userData&&p.owner.userData.editorId||p.owner.uuid;byOwner.set(key,(byOwner.get(key)||0)+1);});
    let assetRoots=0,visibleAssetRoots=0;const assetRootsByOwner=new Map(),hierarchyVisible=node=>{for(let c=node;c;c=c.parent)if(c.visible===false)return false;return true;};
    LOT_KING.core.scene.traverse(node=>{const d=node&&node.userData||{};if(!d.logicElementAssetVisual||node.parent&&node.parent.userData&&node.parent.userData.logicElementAssetVisual)return;assetRoots++;if(hierarchyVisible(node))visibleAssetRoots++;const ownerId=d.logicElementOwnerId||'missing-owner';assetRootsByOwner.set(ownerId,(assetRootsByOwner.get(ownerId)||0)+1);});
    const physics=LOT_KING.systems.physics&&LOT_KING.systems.physics.raw;
    const poseErrors=sketchbook.map(pawn=>{if(!pawn.owner||!pawn.body)return{id:pawn.id,error:null};const ownerPosition=pawn.owner.getWorldPosition(new THREE.Vector3()),render=pawn.body.interpolatedPosition||pawn.body.position,origin=pawn.type==='advanced-character'?Number(pawn.config.collision.height)*.5+Number(pawn.config.collision.radius):Number(pawn.physicsOriginY)||0,expected=new THREE.Vector3(render.x,pawn.type==='advanced-character'&&pawn.state.grounded?pawn.body.position.y-origin:render.y-origin,render.z);return{id:pawn.id,error:ownerPosition.distanceTo(expected)};});
    return {label:'after-play',pawnIds:list.map(p=>p.id),pawnCount:list.length,ownerCounts:Array.from(byOwner.entries()),logicOwners:owners().length,logicOwnerIds:owners().map(o=>o.userData.editorId),assetRoots,visibleAssetRoots,assetRootsByOwner:Array.from(assetRootsByOwner.entries()),sketchbookPawnCount:sketchbook.length,poseErrors,cannonBodies:physics&&physics.world?physics.world.bodies.length:null,nativeCarVisible:!!(LOT_KING.player&&LOT_KING.player.car&&LOT_KING.player.car.visible),nativeEnabled:LOT_KING.player&&LOT_KING.player.enabled,possessedP1:(()=>{const p=LOT_KING.pawns.getByPlayerId(1);return p?p.id:null;})(),cameraP1:LOT_KING.state.runtimeVehicleCameraPawnIds&&LOT_KING.state.runtimeVehicleCameraPawnIds[1]||null,started:LOT_KING.state.started,editorPreview:LOT_KING.state.editorPreview};
  });
  result.after=after;result.started=true;
  console.log(JSON.stringify(result, null, 2));
  console.log('pageErrors', JSON.stringify(pageErrors.slice(0, 12), null, 2));
  expect(result.after.sketchbookPawnCount).toBe(7);
  expect(result.after.logicOwners).toBe(7);
  expect(result.after.ownerCounts.filter(([,count]) => count !== 1)).toEqual([]);
  expect(result.after.assetRoots).toBe(7);
  expect(result.after.visibleAssetRoots).toBe(7);
  expect(result.after.assetRootsByOwner.filter(([,count]) => count !== 1)).toEqual([]);
  expect(result.after.poseErrors.filter(item => item.error == null || item.error > 1e-3)).toEqual([]);
  expect(result.after.nativeCarVisible).toBe(false);
  expect(result.after.nativeEnabled).toBe(false);
  expect(result.after.possessedP1).toBe('sketchbook_pawn_character');
  expect(result.after.cameraP1).toBe(result.after.possessedP1);
  expect(result.after.started).toBe(true);
  expect(result.after.editorPreview).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(httpErrors).toEqual([]);
});
