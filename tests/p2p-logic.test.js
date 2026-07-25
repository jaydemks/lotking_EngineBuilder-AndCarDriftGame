const fs = require('fs');
const assert = require('assert');

const nodes = fs.readFileSync('js/logic/logic-nodes-network.js', 'utf8');
const services = fs.readFileSync('js/logic/logic-services.js', 'utf8');
const runtime = fs.readFileSync('js/logic/logic-runtime.js', 'utf8');
const runner = fs.readFileSync('js/runtime/logic-elements-runner.js', 'utf8');
const plugin = fs.readFileSync('js/plugins/p2p-collaboration-plugin.js', 'utf8');

assert(nodes.includes("type:'event.onNetworkMessage'"), 'network receive event is registered');
assert(nodes.includes("type:'network.send'"), 'network send node is registered');
assert(nodes.includes("type:'network.openSessionStudio'"), 'playables can open the P2P session UI');
assert(services.includes('network: createNetworkService()'), 'Logic contexts expose the network service');
assert(runtime.includes("eventType === 'OnNetworkMessage'"), 'network channels are filtered by the event node');
assert(runner.includes("detail.type!=='logic.event'"), 'P2P application messages are bridged into Logic runtimes');
assert(plugin.includes("enabledByDefault:true"), 'P2P collaboration plugin is enabled by default');
assert(plugin.includes("id:'p2p-sessions'"), 'P2P plugin has a stable ID');

console.log('p2p-logic.test.js: all assertions passed');
