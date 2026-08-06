'use strict';

const assert = require('node:assert/strict');

global.window = global;
global.requestAnimationFrame = global.requestAnimationFrame || (callback => { callback(); return 1; });
require('../js/logic/logic-graph.js');
require('../js/logic/logic-registry.js');
require('../js/logic/logic-nodes-mvp.js');
require('../js/logic/logic-validator.js');
require('../js/logic/logic-runtime.js');
require('../js/logic/logic-services.js');
require('../js/runtime/logic-elements-runner.js');

function makeGraph(){
  const graph = global.LK_LOGIC_GRAPH.createEmptyGraph('Sketchbook Play Lifecycle', 'element');
  graph.variables = [
    {name:'SpawnX', type:'number', value:12, exposed:true, binding:'spawn.x'},
    {name:'SpawnY', type:'number', value:3, exposed:true, binding:'spawn.y'},
    {name:'SpawnZ', type:'number', value:-7, exposed:true, binding:'spawn.z'},
    {name:'SpawnHeading', type:'number', value:.5, exposed:true, binding:'spawn.heading'},
    {name:'BodyMass', type:'number', value:1, exposed:true, binding:'tuning.collider.mass'},
    {name:'CapsuleRadius', type:'number', value:.25, exposed:true, binding:'tuning.collider.radius'},
    {name:'CapsuleHeight', type:'number', value:.5, exposed:true, binding:'tuning.collider.height'},
    {name:'ControllerPlayerId', type:'number', value:1, exposed:true, binding:'playerId'},
  ];
  graph.sketchbookPawn = {
    kind:'advanced-character', playerId:1, possessed:true,
    spawn:{x:12,y:3,z:-7,heading:.5},
    tuning:{collider:{mass:1,radius:.25,height:.5}},
  };
  return graph;
}

function harness(){
  const graph = makeGraph();
  const owner = {
    uuid:'sketchbook-play-owner', position:{x:12,y:3,z:-7}, rotation:{y:.5},
    userData:{editorType:'logicElement',editorId:'sketchbook-play-owner',logicEnabled:true,logicGraph:graph,logicRunInEditorPreview:true,editorName:'Sketchbook Play Lifecycle'},
  };
  const created = [], popups=[];
  const previousRuntime = global.LK_RUNTIME_SKETCHBOOK_PAWNS;
  global.LK_RUNTIME_SKETCHBOOK_PAWNS = {
    createLogic(GAME, target){
      const existing = target.userData.testSketchbookPawn;
      if(existing && !existing.disposed) return existing;
      const pawn = {
        id:'test-sketchbook-pawn-' + (created.length + 1), kind:'logic-element', type:'advanced-character', inputProfileId:'character',
        playerId:1, possessed:true, enabled:true, hidden:false,
        disposed:false, started:false, bindingCalls:[], prepareCalls:0, startCalls:0, disposeCalls:0,
        prepareRuntime(){ this.prepareCalls++; return {ready:true}; },
        start(){ this.started=true; this.startCalls++; return this; },
        applyBinding(path, value){ this.bindingCalls.push([path,value]); return true; },
        setEnabled(){}, setHidden(){}, possess(){ return true; }, unpossess(){ return true; },
        dispose(){ if(this.disposed) return false; this.disposed=true; this.started=false; this.disposeCalls++; return true; },
      };
      target.userData.testSketchbookPawn = pawn;
      created.push(pawn);
      return pawn;
    },
  };
  const game = {
    state:{started:false,sceneReady:true,editorPreview:false}, hooks:{frame:[]}, systems:{},
    world:{registry:[owner]}, ui:{popup(message){popups.push(String(message));}}, core:{scene:null},
    pawns:{stepAll(){},get(){return null;},getByPlayerId(id){return created.find(pawn=>pawn.possessed&&pawn.playerId===id)||null;},list(){return created.slice();},register(){},unregister(){}},
  };
  const store = {load(){ return {logic:{}}; }, startLogicElementAnimations(){}, stopLogicElementAnimations(){}};
  return {graph, owner, created, popups, game, store, restore(){ global.LK_RUNTIME_SKETCHBOOK_PAWNS = previousRuntime; }};
}

async function run(){
  {
    const h = harness();
    try {
      const runner = global.LK_LOGIC_ELEMENTS_RUNNER.create(h.game, h.store);
      await runner.prewarm();
      assert.equal(h.created.length, 1);
      const prepared = h.created[0];
      assert.equal(runner.stats().preparedPawnCount, 1);
      runner.dispose();
      assert.equal(prepared.disposeCalls, 1, 'cancelling Play must dispose a prewarmed Pawn/body with no runtime owner');
      assert.equal(runner.stats().preparedPawnCount, 0);
    } finally { h.restore(); }
  }

  {
    const h=harness(),drive={interact:false};
    h.graph.nodes.push(
      global.LK_LOGIC_GRAPH.node('on_semantic_interact','event.onInputActionDown',80,700,{action:'interact'}),
      global.LK_LOGIC_GRAPH.node('print_semantic_interact','debug.print',360,700,{message:'semantic interact',duration:1})
    );
    h.graph.edges.push(global.LK_LOGIC_GRAPH.edge('semantic_interact_edge','on_semantic_interact','then','print_semantic_interact','exec'));
    h.game.systems.playerActionRouter={read(playerId){return {playerId,pawn:h.created[0]||null,contextId:'character',drive:Object.assign({},drive)};}};
    try{
      const runner=global.LK_LOGIC_ELEMENTS_RUNNER.create(h.game,h.store);
      h.game.state.started=true;
      runner.rebuild();
      runner.update(1/60);
      assert.equal(h.popups.length,0,'initial semantic sampling must not manufacture a press');
      drive.interact=true;runner.update(1/60);
      assert.equal(h.popups.length,1,'only the possessed Pawn semantic action reaches its graph');
      runner.update(1/60);
      assert.equal(h.popups.length,1,'a held semantic action is edge-triggered once');
      drive.interact=false;runner.update(1/60);drive.interact=true;runner.update(1/60);
      assert.equal(h.popups.length,2,'release then press produces the next owned edge');
      runner.destroy();
    }finally{h.restore();}
  }

  {
    const h = harness();
    let describeCalls = 0, changeHandler = null, unsubscribed = 0;
    h.game.input = {
      describe(){ describeCalls++; return {players:[{deviceId:'keyboard-0'}]}; },
      onChange(handler){ changeHandler=handler; return () => { unsubscribed++; changeHandler=null; }; },
    };
    try {
      const runner = global.LK_LOGIC_ELEMENTS_RUNNER.create(h.game, h.store);
      runner.install();
      h.game.state.started = true;
      for(let frame=0;frame<120;frame++) runner.update(1/60);
      assert.ok(describeCalls<=2,
        'input assignment snapshots must be event-driven instead of cloning the full input config every frame');
      assert.ok(runner.stats().objectSignatureChecks<=10,
        'Open World logic-object signature must be polled at low frequency instead of sorting the registry every frame');
      assert.equal(typeof changeHandler,'function');
      changeHandler({players:[{deviceId:'gamepad-0'}]});
      assert.ok(describeCalls<=2,'an input change event already carries its snapshot and must not call describe again');
      runner.destroy();
      assert.equal(unsubscribed,1,'destroy must release the input-manager subscription');
    } finally { h.restore(); }
  }

  {
    const h = harness();
    h.graph.nodes.push(
      global.LK_LOGIC_GRAPH.node('start', 'event.onStart', 0, 0),
      global.LK_LOGIC_GRAPH.node('set_mass', 'variable.set', 240, 0, {name:'BodyMass', value:2})
    );
    h.graph.edges.push(global.LK_LOGIC_GRAPH.edge('start_mass', 'start', 'then', 'set_mass', 'exec'));
    try {
      const runner = global.LK_LOGIC_ELEMENTS_RUNNER.create(h.game, h.store);
      await runner.prewarm();
      const prepared = h.created[0];
      h.game.state.started = true;
      runner.rebuild();
      runner.update(1/60);
      assert.deepEqual(prepared.bindingCalls, [['tuning.collider.mass', 2]],
        'a real OnStart variable change must still reach the Pawn after initial bindings are primed');
      runner.dispose();
    } finally { h.restore(); }
  }

  {
    const h = harness();
    try {
      const runner = global.LK_LOGIC_ELEMENTS_RUNNER.create(h.game, h.store);
      await runner.prewarm();
      const prepared = h.created[0];
      h.game.state.started = true;
      runner.rebuild();
      assert.equal(h.created.length, 1, 'runtime rebuild must adopt the prewarmed Pawn instead of creating a second controller');
      assert.equal(prepared.disposed, false);
      assert.equal(prepared.startCalls, 1);
      assert.equal(runner.stats().preparedPawnCount, 0);
      runner.update(1/60);
      assert.deepEqual(prepared.bindingCalls, [],
        'frame one must not replay spawn/capsule/possession values already hydrated into the Pawn descriptor');
      runner.dispose();
      assert.equal(prepared.disposeCalls, 1);
    } finally { h.restore(); }
  }

  {
    const previousGame = global.LOT_KING;
    const previousStore = global.LK_STORE;
    const previousAdd = global.addEventListener;
    const previousRemove = global.removeEventListener;
    const added = [], removed = [];
    global.addEventListener = (type, handler) => added.push([type, handler]);
    global.removeEventListener = (type, handler) => removed.push([type, handler]);
    global.LOT_KING = {state:{started:false,sceneReady:true},hooks:{frame:[]},systems:{},world:{registry:[]}};
    global.LK_STORE = {load(){ return {logic:{}}; }};
    try {
      global.LK_LOGIC_ELEMENTS_RUNNER.boot();
      const first = global.LK_LOGIC_ELEMENTS_RUNNER_INSTANCE;
      global.LK_LOGIC_ELEMENTS_RUNNER.boot();
      assert.notEqual(global.LK_LOGIC_ELEMENTS_RUNNER_INSTANCE, first);
      assert.equal(removed.length, added.length / 2,
        'reinstall must remove every listener owned by the previous runner before registering the replacement');
      global.LK_LOGIC_ELEMENTS_RUNNER_INSTANCE.destroy();
    } finally {
      global.LOT_KING = previousGame;
      global.LK_STORE = previousStore;
      global.addEventListener = previousAdd;
      global.removeEventListener = previousRemove;
    }
  }

  console.log('logic-runner-play-lifecycle.test.js: all assertions passed');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
