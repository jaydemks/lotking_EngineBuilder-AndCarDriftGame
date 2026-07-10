/* =========================================================
   LOT KING - Logic Element graph helpers
   Pure JSON graph model shared by editor, store and runtime.
   ========================================================= */
(function(){
'use strict';

const VERSION = 1;
const DEFINITION_VERSION = 1;

function clone(value){
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function node(id, type, x, y, data){
  return {id, type, x:x || 0, y:y || 0, data:Object.assign({}, data || {})};
}

function edge(id, fromNode, fromPin, toNode, toPin){
  return {id, from:{node:fromNode, pin:fromPin}, to:{node:toNode, pin:toPin}};
}

function normalizeNodes(nodes){
  return (Array.isArray(nodes) ? nodes : []).filter(Boolean).map((n, i) => ({
    id:String(n.id || ('node_' + i)),
    type:String(n.type || ''),
    x:Number(n.x) || 0,
    y:Number(n.y) || 0,
    data:Object.assign({}, n.data || {}),
  }));
}

function normalizeEdges(edges){
  return (Array.isArray(edges) ? edges : []).filter(e => e && e.from && e.to).map((e, i) => ({
    id:String(e.id || ('edge_' + i)),
    from:{node:String(e.from.node || ''), pin:String(e.from.pin || '')},
    to:{node:String(e.to.node || ''), pin:String(e.to.pin || '')},
  }));
}

function normalizeVariables(variables){
  return (Array.isArray(variables) ? variables : []).filter(Boolean).map(v => Object.assign({}, v, {
    name:String(v.name || ''),
    type:String(v.type || 'any'),
    value:clone(v.value),
    exposed:v.exposed === true,
  })).filter(v => v.name);
}

function normalizeComments(comments){
  return (Array.isArray(comments) ? comments : []).filter(Boolean).map((c, i) => ({
    id:String(c.id || ('comment_' + i)),
    title:String(c.title || 'Comment'),
    x:Number(c.x) || 0,
    y:Number(c.y) || 0,
    w:Math.max(120, Number(c.w) || 320),
    h:Math.max(90, Number(c.h) || 180),
    color:String(c.color || '#ffd166'),
  }));
}

function subgraph(id, name, nodes, edges, variables){
  return {
    id:String(id || name || 'subgraph'),
    name:String(name || id || 'Subgraph'),
    enabled:true,
    variables:Array.isArray(variables) ? clone(variables) : [],
    nodes:Array.isArray(nodes) ? clone(nodes) : [],
    edges:Array.isArray(edges) ? clone(edges) : [],
    comments:[],
  };
}

function createEmptyGraph(name, scope){
  return {
    version: VERSION,
    name: name || 'Logic Graph',
    scope: scope || 'element',
    enabled: true,
    variables: [],
    nodes: [],
    edges: [],
    comments: [],
    subgraphs: [],
  };
}

function createStarterGraph(name, scope){
  const graph = createEmptyGraph(name || 'Logic Graph', scope || 'element');
  graph.variables.push({name:'counter', type:'number', value:0, exposed:true, label:'Counter'});
  graph.nodes.push(
    node('on_start', 'event.onStart', 80, 80),
    node('print_start', 'debug.print', 360, 80, {message:(name || 'Logic Graph') + ' started'}),
    node('on_update', 'event.onUpdate', 80, 230),
    node('get_counter', 'variable.get', 330, 210, {name:'counter'}),
    node('delta_add', 'math.add', 560, 210),
    node('set_counter', 'variable.set', 800, 230, {name:'counter'})
  );
  graph.edges.push(
    edge('e_start_print', 'on_start', 'then', 'print_start', 'exec'),
    edge('e_update_set', 'on_update', 'then', 'set_counter', 'exec'),
    edge('e_counter_add_a', 'get_counter', 'value', 'delta_add', 'a'),
    edge('e_update_add_b', 'on_update', 'deltaTime', 'delta_add', 'b'),
    edge('e_add_set_value', 'delta_add', 'value', 'set_counter', 'value')
  );
  return graph;
}

function normalizeGraph(graph, fallbackName, fallbackScope){
  const g = graph && typeof graph === 'object' ? clone(graph) : createEmptyGraph(fallbackName, fallbackScope);
  g.version = Number(g.version) || VERSION;
  g.name = String(g.name || fallbackName || 'Logic Graph');
  g.scope = g.scope === 'level' ? 'level' : 'element';
  g.enabled = g.enabled !== false;
  g.nodes = normalizeNodes(g.nodes);
  g.edges = normalizeEdges(g.edges);
  g.variables = normalizeVariables(g.variables);
  g.comments = normalizeComments(g.comments);
  g.subgraphs = (Array.isArray(g.subgraphs) ? g.subgraphs : []).filter(Boolean).map((sg, i) => ({
    id:String(sg.id || sg.name || ('subgraph_' + i)),
    name:String(sg.name || sg.id || ('Subgraph ' + (i + 1))),
    enabled:sg.enabled !== false,
    macro:sg.macro === true,
    inputs:Array.isArray(sg.inputs) ? clone(sg.inputs) : [],
    outputs:Array.isArray(sg.outputs) ? clone(sg.outputs) : [],
    variables:normalizeVariables(sg.variables),
    nodes:normalizeNodes(sg.nodes),
    edges:normalizeEdges(sg.edges),
    comments:normalizeComments(sg.comments),
  }));
  return g;
}

function addDependency(map, type, ref, owner){
  if(!ref) return;
  const key = String(ref.id || ref.key || ref.dbKey || ref.src || ref.value || '').trim();
  if(!key) return;
  const depKey = type + ':' + key;
  if(!map.has(depKey)){
    map.set(depKey, {
      type,
      id:ref.id || null,
      key:ref.key || null,
      dbKey:ref.dbKey || null,
      src:ref.src || null,
      value:ref.value || null,
      name:ref.name || null,
      source:ref.source || null,
      owners:[],
    });
  }
  if(owner) map.get(depKey).owners.push(owner);
}

function collectGraphDependencies(graph){
  const deps = new Map();
  const g = graph && typeof graph === 'object' ? graph : {};
  const scene = g.logicScene || {};
  function refDependency(ref){
    if(!ref) return null;
    if(typeof ref === 'object') return ref;
    return {value:String(ref), name:String(ref)};
  }
  [scene.root].concat(Array.isArray(scene.elements) ? scene.elements : []).filter(Boolean).forEach(element => {
    if(element.asset) addDependency(deps, 'mesh', element.asset, element.id || element.name || 'logicScene');
  });
  function scanNodes(nodes, owner){
    (Array.isArray(nodes) ? nodes : []).filter(Boolean).forEach(node => {
      const data = node.data || {};
      if(node.type === 'material.loadTexture' && data.textureRef){
        addDependency(deps, 'texture', refDependency(data.textureRef), owner + ':' + node.id);
      }
      if(node.type === 'audio.playSound' && data.soundRef){
        addDependency(deps, 'audio', refDependency(data.soundRef), owner + ':' + node.id);
      }
    });
  }
  scanNodes(g.nodes, 'main');
  (Array.isArray(g.subgraphs) ? g.subgraphs : []).filter(Boolean).forEach(sg => scanNodes(sg.nodes, 'subgraph:' + (sg.id || sg.name || 'function')));
  return Array.from(deps.values()).map(dep => Object.assign({}, dep, {
    owners:Array.from(new Set(dep.owners)),
  }));
}

function normalizeDefinitionAsset(asset, fallbackName, fallbackScope){
  const source = asset && typeof asset === 'object' ? clone(asset) : {};
  const name = String(source.name || fallbackName || 'Logic Element').trim() || 'Logic Element';
  const graph = normalizeGraph(source.graph || source.logic || createEmptyGraph(name, fallbackScope || 'element'), name, fallbackScope || 'element');
  const fromVersion = Number(source.definitionVersion || source.graphDefinitionVersion || 0) || 0;
  const normalized = Object.assign({}, source, {
    name,
    kind:source.kind || 'logic-element-definition',
    definitionVersion:DEFINITION_VERSION,
    graph,
    dependencies:collectGraphDependencies(graph),
  });
  if(fromVersion !== DEFINITION_VERSION){
    normalized.migration = Object.assign({}, source.migration || {}, {
      fromDefinitionVersion:fromVersion,
      toDefinitionVersion:DEFINITION_VERSION,
    });
  }
  return normalized;
}

window.LK_LOGIC_GRAPH = Object.freeze({
  VERSION,
  DEFINITION_VERSION,
  clone,
  node,
  edge,
  subgraph,
  createEmptyGraph,
  createStarterGraph,
  normalizeGraph,
  collectGraphDependencies,
  normalizeDefinitionAsset,
});
})();
