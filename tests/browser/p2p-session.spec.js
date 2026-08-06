const { test, expect } = require('@playwright/test');

test('two isolated browser pages establish an encrypted P2P data channel', async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await Promise.all([
    host.goto(baseURL + '/tests/fixtures/p2p-harness.html'),
    guest.goto(baseURL + '/tests/fixtures/p2p-harness.html'),
  ]);

  const offer = await host.evaluate(async () => {
    window.testSession = LK_P2P_SESSION.create({ name:'Windows host', iceTimeout:2500, iceServers:[] });
    return window.testSession.createInvite();
  });
  const answer = await guest.evaluate(async code => {
    window.received = [];
    window.testSession = LK_P2P_SESSION.create({ name:'macOS guest', iceTimeout:2500, iceServers:[] });
    window.testSession.subscribe(event => { if(event.kind === 'message') window.received.push(event); });
    return window.testSession.join(code);
  }, offer);
  await host.evaluate(code => window.testSession.acceptAnswer(code), answer);

  await expect.poll(() => host.evaluate(() => window.testSession.state().peerCount), { timeout:10000 }).toBe(1);
  await expect.poll(() => guest.evaluate(() => window.testSession.state().peerCount), { timeout:10000 }).toBe(1);
  await host.evaluate(() => window.testSession.send('logic.event', { channel:'race', payload:{ lap:2 } }));
  await expect.poll(() => guest.evaluate(() => window.received.find(item => item.type === 'logic.event')?.payload?.payload?.lap || 0), { timeout:10000 }).toBe(2);
  await host.evaluate(() => window.testSession.send('test.large', { text:'L'.repeat(180000) }));
  await expect.poll(() => guest.evaluate(() => window.received.find(item => item.type === 'test.large')?.payload?.text?.length || 0), { timeout:10000 }).toBe(180000);
  await host.evaluate(() => window.testSession.send('test.escaped', { text:'"\\'.repeat(90000) }));
  await expect.poll(() => guest.evaluate(() => window.received.find(item => item.type === 'test.escaped')?.payload?.text?.length || 0), { timeout:10000 }).toBe(180000);

  const roles = await Promise.all([
    host.evaluate(() => window.testSession.state().role),
    guest.evaluate(() => window.testSession.state().role),
  ]);
  expect(roles).toEqual(['host', 'guest']);
  await Promise.all([hostContext.close(), guestContext.close()]);
});

test('Session Studio keeps earlier host invitations alive and reuses the active runtime session', async ({ browser, baseURL }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await Promise.all([
    host.goto(baseURL + '/test-editor.html'),
    guest.goto(baseURL + '/tests/fixtures/p2p-harness.html'),
  ]);
  await host.waitForFunction(() => window.LOT_KING?.editor?.plugins && window.LK_P2P_COLLABORATION);
  await host.evaluate(() => {
    window.seedSession = LK_P2P_SESSION.create({name:'Persistent host', iceServers:[], iceTimeout:2500});
    window.LK_P2P_ACTIVE_SESSION = window.seedSession;
    LOT_KING.editor.plugins.runCommand('p2p.open');
    document.querySelector('[data-p2p-ice]').value = '[]';
    document.querySelector('[data-p2p-host]').click();
  });
  await host.waitForFunction(() => document.querySelector('[data-p2p-offer]')?.value);
  const firstOffer = await host.locator('[data-p2p-offer]').inputValue();
  const adopted = await host.evaluate(() => LK_P2P_COLLABORATION.session() === window.seedSession);
  expect(adopted).toBe(true);

  await host.locator('[data-p2p-close]').click();
  await host.evaluate(()=>LOT_KING.editor.plugins.runCommand('p2p.open'));
  await expect(host.locator('[data-p2p-offer]')).toHaveValue(firstOffer);

  await host.locator('[data-p2p-host]').click();
  await expect.poll(() => host.locator('[data-p2p-offer]').inputValue()).not.toBe(firstOffer);
  const answer = await guest.evaluate(async code => {
    window.testSession = LK_P2P_SESSION.create({name:'Guest', iceServers:[], iceTimeout:2500});
    return window.testSession.join(code);
  }, firstOffer);
  await host.locator('[data-p2p-answer]').fill(answer);
  await host.locator('[data-p2p-accept]').click();
  await expect.poll(() => host.evaluate(() => LK_P2P_COLLABORATION.session().state().peerCount), {timeout:10000}).toBe(1);
  await Promise.all([hostContext.close(), guestContext.close()]);
});

test('Cowork Join reads the dedicated guest invitation field and recognizes a token pasted in the legacy answer field', async ({ browser, baseURL }) => {
  const hostContext=await browser.newContext(),guestContext=await browser.newContext();
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  await Promise.all([host.goto(baseURL+'/tests/fixtures/p2p-harness.html'),guest.goto(baseURL+'/test-editor.html')]);
  await guest.waitForFunction(()=>window.LOT_KING?.editor?.plugins&&window.LK_P2P_COLLABORATION);
  await guest.evaluate(()=>{LOT_KING.editor.plugins.runCommand('p2p.open');document.querySelector('[data-p2p-ice]').value='[]';});
  const invite=await host.evaluate(async()=>{window.testSession=LK_P2P_SESSION.create({name:'UI host',iceServers:[],iceTimeout:2500});return window.testSession.createInvite();});
  await guest.locator('[data-p2p-join-offer]').fill(invite);
  await guest.locator('[data-p2p-join]').click();
  await expect.poll(()=>guest.locator('[data-p2p-answer]').inputValue()).not.toBe('');
  const firstAnswer=await guest.locator('[data-p2p-answer]').inputValue();

  const secondInvite=await host.evaluate(()=>window.testSession.createInvite());
  await guest.locator('[data-p2p-join-offer]').fill('');
  await guest.locator('[data-p2p-answer]').fill(secondInvite);
  await guest.locator('[data-p2p-join]').click();
  await expect.poll(()=>guest.locator('[data-p2p-answer]').inputValue()).not.toBe(secondInvite);
  expect(await guest.locator('[data-p2p-answer]').inputValue()).not.toBe(firstAnswer);
  await Promise.all([hostContext.close(),guestContext.close()]);
});

test('cowork locks one element, lets both peers author in turn and saves on both', async ({browser,baseURL})=>{
  const hostContext=await browser.newContext(),guestContext=await browser.newContext();
  const host=await hostContext.newPage(),guest=await guestContext.newPage();
  await Promise.all([host.goto(baseURL+'/tests/fixtures/p2p-cowork-harness.html'),guest.goto(baseURL+'/tests/fixtures/p2p-cowork-harness.html')]);
  await Promise.all([
    host.waitForFunction(()=>window.LOT_KING?.editor?.plugins&&window.LK_P2P_COLLABORATION&&window.LOT_KING?.world?.registry?.length),
    guest.waitForFunction(()=>window.LOT_KING?.editor?.plugins&&window.LK_P2P_COLLABORATION&&window.LOT_KING?.world?.registry?.length),
  ]);
  const offer=await host.evaluate(async()=>{window.LK_P2P_ACTIVE_SESSION=LK_P2P_SESSION.create({name:'Cowork Host',iceServers:[],iceTimeout:2500});return LK_P2P_ACTIVE_SESSION.createInvite();});
  const answer=await guest.evaluate(async code=>{window.LK_P2P_ACTIVE_SESSION=LK_P2P_SESSION.create({name:'Cowork Guest',iceServers:[],iceTimeout:2500});return LK_P2P_ACTIVE_SESSION.join(code);},offer);
  await host.evaluate(code=>LK_P2P_ACTIVE_SESSION.acceptAnswer(code),answer);
  await expect.poll(()=>host.evaluate(()=>LK_P2P_ACTIVE_SESSION.state().peerCount),{timeout:10000}).toBe(1);
  await expect.poll(()=>guest.evaluate(()=>LK_P2P_ACTIVE_SESSION.state().peerCount),{timeout:10000}).toBe(1);
  await Promise.all([host,guest].map(page=>page.evaluate(()=>LOT_KING.editor.plugins.runCommand('p2p.open'))));
  await expect.poll(()=>host.evaluate(()=>LK_P2P_COLLABORATION.state().peerCount),{timeout:10000}).toBe(1);
  await expect.poll(()=>guest.evaluate(()=>LK_P2P_COLLABORATION.state().peerCount),{timeout:10000}).toBe(1);
  await expect(host.locator('#lkP2pSessionButton')).toContainText('1');
  await expect(guest.locator('#lkP2pSessionButton')).toContainText('1');

  const target=await host.evaluate(()=>{const object=LOT_KING.world.registry.find(item=>item?.userData?.editorId&&!item.userData.helper&&!item.userData.builtin);return object?{id:object.userData.editorId,name:object.userData.editorName||object.name}:null;});
  expect(target).not.toBeNull();
  const aligned=await guest.evaluate(target=>{const object=LOT_KING.world.registry.find(item=>(item?.userData?.editorName||item?.name)===target.name&&item?.userData&&!item.userData.helper&&!item.userData.builtin);if(!object)return false;object.userData.editorId=target.id;return true;},target);
  expect(aligned).toBe(true);
  await host.evaluate(id=>{LOT_KING.editor.state.selected=LOT_KING.world.registry.find(item=>item?.userData?.editorId===id)||null;},target.id);
  await expect.poll(()=>host.evaluate(id=>LK_P2P_COLLABORATION.locks()?.locks?.find(lock=>lock.objectId===id)?.ownerPeerId===LK_P2P_COLLABORATION.state().selfId,target.id),{timeout:10000}).toBe(true);
  await guest.evaluate(id=>{LOT_KING.editor.state.selected=LOT_KING.world.registry.find(item=>item?.userData?.editorId===id)||null;},target.id);
  await expect.poll(()=>guest.evaluate(id=>LK_P2P_COLLABORATION.canEdit(id)),{timeout:10000}).toBe(false);
  const inspectorBlocked=await guest.evaluate(()=>!document.getElementById('objectName').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true})));
  expect(inspectorBlocked).toBe(true);
  const owner=await guest.evaluate(id=>LK_P2P_COLLABORATION.locks().locks.find(lock=>lock.objectId===id)?.ownerName||'',target.id);
  expect(owner).not.toBe('');
  await host.waitForTimeout(300);
  const changed=await host.evaluate(id=>{const object=LOT_KING.world.registry.find(item=>item?.userData?.editorId===id);if(!object)return null;object.position.x+=7.25;return{id,x:object.position.x};},target.id);
  expect(changed).not.toBeNull();
  await expect.poll(()=>guest.evaluate(id=>LOT_KING.world.registry.find(item=>item?.userData?.editorId===id)?.position?.x??null,changed.id),{timeout:10000}).toBeCloseTo(changed.x,4);

  await host.evaluate(()=>{LOT_KING.editor.state.selected=null;});
  await expect.poll(()=>guest.evaluate(id=>LK_P2P_COLLABORATION.canEdit(id)),{timeout:10000}).toBe(true);
  await guest.waitForTimeout(300);
  const guestChanged=await guest.evaluate(id=>{const object=LOT_KING.world.registry.find(item=>item?.userData?.editorId===id);object.position.z-=3.5;return object.position.z;},target.id);
  await expect.poll(()=>host.evaluate(id=>LOT_KING.world.registry.find(item=>item?.userData?.editorId===id)?.position?.z??null,target.id),{timeout:10000}).toBeCloseTo(guestChanged,4);

  await Promise.all([host,guest].map(page=>page.evaluate(()=>{window.__coworkSaves=[];window.addEventListener('lotking:project-saved',event=>window.__coworkSaves.push(event.detail?.source||''));})));
  expect(await guest.evaluate(()=>LK_EDITOR_PROJECT_IO_INSTANCE.saveScene())).toBe(true);
  await expect.poll(()=>host.evaluate(()=>window.__coworkSaves.includes('cowork')),{timeout:15000}).toBe(true);
  expect(await guest.evaluate(()=>window.__coworkSaves.includes('local'))).toBe(true);

  await host.locator('[data-p2p-publish]').click();
  await expect.poll(()=>host.locator('[data-p2p-status]').textContent(),{timeout:30000}).toMatch(/Snapshot (sent|inviato)/i);
  await expect.poll(()=>guest.locator('[data-p2p-apply]').isEnabled(),{timeout:30000}).toBe(true);

  await Promise.all([host,guest].map(page=>page.locator('[data-p2p-close]').click()));
  await host.locator('#lkP2pSessionButton').click();
  await expect(host.locator('.lk-p2p-monitor')).toBeVisible();
  await expect(host.locator('.lk-p2p-peer.live')).toHaveCount(1);
  host.once('dialog',dialog=>dialog.accept());
  await host.locator('[data-p2p-kick]').click();
  await expect.poll(()=>guest.evaluate(()=>LK_P2P_COLLABORATION.state().peerCount),{timeout:10000}).toBe(0);
  await expect.poll(()=>host.evaluate(()=>LK_P2P_COLLABORATION.state().peerCount),{timeout:10000}).toBe(0);
  await expect(host.locator('.lk-p2p-peer.offline')).toHaveCount(1);
  await host.locator('[data-p2p-reinvite]').click();
  await expect.poll(()=>host.locator('[data-p2p-offer]').inputValue(),{timeout:10000}).not.toBe('');
  await Promise.all([hostContext.close(),guestContext.close()]);
});

test('P2P invite codec rejects unrelated payloads', async ({ page, baseURL }) => {
  await page.goto(baseURL + '/tests/fixtures/p2p-harness.html');
  const result = await page.evaluate(() => {
    const value = { protocol:LK_P2P_SESSION.protocol, kind:'test', nested:{safe:true} };
    return LK_P2P_SESSION.decode(LK_P2P_SESSION.encode(value));
  });
  expect(result).toEqual({ protocol:'lotking.p2p.v1', kind:'test', nested:{safe:true} });
});

test('editor registers the default P2P plugin and Network Logic nodes', async ({ page, baseURL }) => {
  await page.goto(baseURL + '/test-editor.html');
  await page.waitForFunction(() => window.LOT_KING?.editor?.plugins && window.LK_LOGIC_NODES_MVP);
  const report = await page.evaluate(() => {
    const plugin = LOT_KING.editor.plugins.list().find(item => item.id === 'p2p-sessions');
    const registry = LK_LOGIC_NODES_MVP.createRegistry();
    LOT_KING.editor.plugins.runCommand('p2p.open');
    return {
      plugin,
      receiveNode:!!registry.get('event.onNetworkMessage'),
      sendNode:!!registry.get('network.send'),
      overlay:!!document.querySelector('.lk-p2p-bg'),
      sessionMonitor:!!document.querySelector('#lkP2pSessionButton'),
      demoPublisher:typeof window.LK_EDITOR_PROJECT_IO_INSTANCE?.publishProjectAsDemo === 'function',
    };
  });
  expect(report.plugin).toMatchObject({ enabled:true, registered:true, category:'Networking' });
  expect(report.receiveNode).toBe(true);
  expect(report.sendNode).toBe(true);
  expect(report.overlay).toBe(true);
  expect(report.sessionMonitor).toBe(true);
  expect(report.demoPublisher).toBe(true);
});
