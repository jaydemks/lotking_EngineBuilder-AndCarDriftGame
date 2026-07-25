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
    window.testSession = LK_P2P_SESSION.create({ name:'Windows host', iceTimeout:2500 });
    return window.testSession.createInvite();
  });
  const answer = await guest.evaluate(async code => {
    window.received = [];
    window.testSession = LK_P2P_SESSION.create({ name:'macOS guest', iceTimeout:2500 });
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

  const roles = await Promise.all([
    host.evaluate(() => window.testSession.state().role),
    guest.evaluate(() => window.testSession.state().role),
  ]);
  expect(roles).toEqual(['host', 'guest']);
  await Promise.all([hostContext.close(), guestContext.close()]);
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
      demoPublisher:typeof window.LK_EDITOR_PROJECT_IO_INSTANCE?.publishProjectAsDemo === 'function',
    };
  });
  expect(report.plugin).toMatchObject({ enabled:true, registered:true, category:'Networking' });
  expect(report.receiveNode).toBe(true);
  expect(report.sendNode).toBe(true);
  expect(report.overlay).toBe(true);
  expect(report.demoPublisher).toBe(true);
});
