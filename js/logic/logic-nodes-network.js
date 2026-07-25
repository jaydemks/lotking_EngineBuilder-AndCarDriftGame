/* =========================================================
   LOT KING — P2P Logic Element node pack
   ========================================================= */
(function(){
'use strict';

const execIn={name:'exec',kind:'exec',direction:'input'};
const thenOut={name:'completed',kind:'exec',direction:'output'};
const dataIn=(name,type,value)=>({name,kind:'data',direction:'input',type:type||'any',defaultValue:value});
const dataOut=(name,type)=>({name,kind:'data',direction:'output',type:type||'any'});

function registerNetworkNodes(registry){
  registry.register({
    type:'event.onNetworkMessage',title:'On Network Message',category:'Network',description:'Runs when a connected WebRTC peer sends the selected Logic channel.',event:'OnNetworkMessage',
    inputs:[dataIn('channel','string','gameplay')],outputs:[{name:'then',kind:'exec',direction:'output'},dataOut('payload','any'),dataOut('peerId','string'),dataOut('peerName','string'),dataOut('channel','string')],
  });
  registry.register({
    type:'network.send',title:'Send P2P Message',category:'Network',description:'Sends a JSON-compatible payload to every connected peer on an application channel.',
    inputs:[execIn,dataIn('channel','string','gameplay'),dataIn('payload','any',null)],outputs:[thenOut,dataOut('peerCount','number'),dataOut('success','boolean')],
    run(api){const count=api.services.network?api.services.network.send(api.getInput('channel'),api.getInput('payload')):0;api.node.data.__peerCount=count;return{exec:'completed'};},
    evaluate(api,pin){const count=Number(api.node.data.__peerCount)||0;return pin==='success'?count>0:count;},
  });
  registry.register({
    type:'network.connected',title:'P2P Connected',category:'Network',description:'Reports whether at least one encrypted peer channel is open.',
    outputs:[dataOut('connected','boolean'),dataOut('peerCount','number'),dataOut('role','string')],
    evaluate(api,pin){const info=api.services.network?api.services.network.state():{};if(pin==='peerCount')return Number(info.peerCount)||0;if(pin==='role')return info.role||'idle';return Number(info.peerCount)>0;},
  });
  registry.register({
    type:'network.openSessionStudio',title:'Open P2P Session Studio',category:'Network',description:'Opens the serverless offer/answer session UI in editor, preview or exported gameplay.',
    inputs:[execIn],outputs:[thenOut],run(api){if(api.services.network)api.services.network.openStudio();return{exec:'completed'};},
  });
  registry.register({
    type:'network.disconnect',title:'Disconnect P2P Session',category:'Network',description:'Closes every peer connection owned by this browser instance.',
    inputs:[execIn],outputs:[thenOut],run(api){if(api.services.network)api.services.network.disconnect();return{exec:'completed'};},
  });
}

window.LK_LOGIC_NODE_PACKS=window.LK_LOGIC_NODE_PACKS||[];
window.LK_LOGIC_NODE_PACKS.push(registerNetworkNodes);
window.LK_LOGIC_NODES_NETWORK=Object.freeze({register:registerNetworkNodes});
})();
